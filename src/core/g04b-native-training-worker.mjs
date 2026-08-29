import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  NATIVE_WORKER_MANIFEST_SCHEMA,
  validateNativeWorkerBinding,
  validateNativeWorkerManifest
} from './native-worker-supervisor.mjs';

export const G04B_NATIVE_WORKER_PACKET_SCHEMA = 'vexlife.g04b-native-training-worker-packet/v1';
export const G04B_NATIVE_WORKER_RESULT_SCHEMA = 'vexlife.g04b-native-training-worker-result/v1';
export const G04B_SOURCE_SNAPSHOT_INVENTORY_SCHEMA = 'vexlife.g04b-source-model-snapshot-inventory/v1';
export const G04B_SOURCE_SNAPSHOT_FINGERPRINT_SCHEMA = 'vexlife.g04b-source-model-snapshot-fingerprint/v1';
export const G04B_FIRST_WORKER_DEVICE = 'MPS';
export const G04B_FIRST_WORKER_HARDWARE_PROFILE = 'hardware.macos-arm64.apple-m4-pro.metal';

const HEX40 = /^[0-9a-f]{40}$/u;
const HEX64 = /^[0-9a-f]{64}$/u;
const REF_RE = /^[a-z0-9](?:[a-z0-9._-]{0,190}[a-z0-9])?$/u;
const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;
const PACKET_FIELDS = Object.freeze([
  'schemaVersion',
  'workerRef',
  'workRef',
  'purposeRef',
  'resultContractRef',
  'resultRef',
  'executionAuthorityRef',
  'hostRef',
  'nodeRuntimeBinding',
  'trainingManifestPath',
  'trainingManifestSha256',
  'pythonExecutableRef',
  'pythonExecutablePath',
  'pythonExecutableSha256',
  'vexHomeRoot',
  'huggingFaceHubCacheRoot',
  'sourceSnapshotRoot',
  'sourceSnapshotInventory',
  'expectedExecutionDevice',
  'expectedHardwareProfileRef'
]);
const INVENTORY_FIELDS = Object.freeze([
  'schemaVersion',
  'sourceModelRepo',
  'sourceModelRevision',
  'files',
  'snapshotFingerprint'
]);
const INVENTORY_FILE_FIELDS = Object.freeze(['path', 'bytes', 'sha256']);

export class G04BNativeTrainingWorkerError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'G04BNativeTrainingWorkerError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new G04BNativeTrainingWorkerError(code, message, details);
}

function exactKeys(value, keys, label, code = 'G04B_WORKER_PACKET_INVALID') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${label} must be one object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(code, `${label} fields are not exact`, { actual, expected });
}

function stableRef(value, label) {
  if (typeof value !== 'string' || !REF_RE.test(value)) fail('G04B_WORKER_PACKET_INVALID', `${label} must be one stable lowercase ref`);
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalFingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | Number(fs.constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) fail('G04B_BOUND_FILE_INVALID', 'bound file must be one regular file', { file });
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
    return hash.digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}

function safeRelative(raw, label) {
  if (typeof raw !== 'string' || !raw || path.isAbsolute(raw) || path.win32.isAbsolute(raw) || path.posix.isAbsolute(raw)) {
    fail('G04B_WORKER_PACKET_INVALID', `${label} must be one safe relative path`);
  }
  const parts = raw.split(/[\\/]/u);
  if (parts.some((part) => !part || part === '.' || part === '..')) fail('G04B_WORKER_PACKET_INVALID', `${label} is not canonical`);
  return raw;
}

function canonicalDirectory(raw, label) {
  if (typeof raw !== 'string' || !path.isAbsolute(raw)) fail('G04B_WORKER_PACKET_INVALID', `${label} must be an absolute path`);
  const requested = path.resolve(raw);
  if (!fs.existsSync(requested)) fail('G04B_BOUND_DIRECTORY_MISSING', `${label} does not exist`, { requested });
  const stat = fs.lstatSync(requested);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('G04B_BOUND_DIRECTORY_INVALID', `${label} must be a real directory`, { requested });
  const real = fs.realpathSync.native(requested);
  if (real !== requested) fail('G04B_BOUND_DIRECTORY_INVALID', `${label} must use canonical filesystem identity`, { requested, real });
  return real;
}

function inside(root, candidate, label) {
  const target = path.resolve(candidate);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('G04B_BOUNDARY_ESCAPE', `${label} escapes admitted root`, { root, target });
  }
  return target;
}

function loadJson(file, code, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(code, `${label} could not be read`, { file, cause: error?.message ?? String(error) });
  }
}

function validatePacketNodeRuntimeBinding(value, { verifyExecutable = false } = {}) {
  try {
    return validateNativeWorkerBinding(value, { verifyExecutable });
  } catch (error) {
    fail('G04B_NWS_BINDING_INVALID', 'nodeRuntimeBinding is not one exact valid NWS runtime binding', {
      cause: error?.message ?? String(error)
    });
  }
}

export function nodeRuntimeBindingFingerprint(binding) {
  const validated = validatePacketNodeRuntimeBinding(binding, { verifyExecutable: false });
  return canonicalFingerprint(validated);
}

export function verifyG04BNodeRuntimeBinding(packet, binding, { verifyExecutable = true } = {}) {
  const validatedPacket = validateG04BNativeWorkerPacket(packet, { verifyBoundFiles: false, verifySnapshot: false });
  const observed = validatePacketNodeRuntimeBinding(binding, { verifyExecutable: false });
  const expectedFingerprint = nodeRuntimeBindingFingerprint(validatedPacket.nodeRuntimeBinding);
  const observedFingerprint = nodeRuntimeBindingFingerprint(observed);
  if (observedFingerprint !== expectedFingerprint) {
    fail('G04B_NWS_BINDING_MISMATCH', 'NWS Node runtime binding does not match the exact frozen G04B worker packet', {
      expectedBindingRef: validatedPacket.nodeRuntimeBinding.bindingRef,
      observedBindingRef: observed.bindingRef,
      expectedHostRef: validatedPacket.hostRef,
      observedHostRef: observed.hostRef,
      expectedFingerprint,
      observedFingerprint
    });
  }
  if (verifyExecutable) validatePacketNodeRuntimeBinding(observed, { verifyExecutable: true });
  return Object.freeze({ binding: observed, bindingFingerprint: observedFingerprint });
}

function sourceSnapshotFingerprint(inventory) {
  return canonicalFingerprint({
    schemaVersion: G04B_SOURCE_SNAPSHOT_FINGERPRINT_SCHEMA,
    sourceModelRepo: inventory.sourceModelRepo,
    sourceModelRevision: inventory.sourceModelRevision,
    files: inventory.files
  });
}

function validateInventory(value) {
  exactKeys(value, INVENTORY_FIELDS, 'sourceSnapshotInventory', 'G04B_SNAPSHOT_INVENTORY_INVALID');
  if (value.schemaVersion !== G04B_SOURCE_SNAPSHOT_INVENTORY_SCHEMA) {
    fail('G04B_SNAPSHOT_INVENTORY_INVALID', `sourceSnapshotInventory.schemaVersion must be ${G04B_SOURCE_SNAPSHOT_INVENTORY_SCHEMA}`);
  }
  if (typeof value.sourceModelRepo !== 'string' || !value.sourceModelRepo.includes('/')) {
    fail('G04B_SNAPSHOT_INVENTORY_INVALID', 'sourceSnapshotInventory.sourceModelRepo must be owner/repository');
  }
  if (!HEX40.test(value.sourceModelRevision ?? '')) fail('G04B_SNAPSHOT_INVENTORY_INVALID', 'sourceSnapshotInventory.sourceModelRevision must be exact lowercase 40-hex');
  if (!Array.isArray(value.files) || value.files.length === 0) fail('G04B_SNAPSHOT_INVENTORY_INVALID', 'sourceSnapshotInventory.files must not be empty');
  const files = value.files.map((entry, index) => {
    exactKeys(entry, INVENTORY_FILE_FIELDS, `sourceSnapshotInventory.files[${index}]`, 'G04B_SNAPSHOT_INVENTORY_INVALID');
    safeRelative(entry.path, `sourceSnapshotInventory.files[${index}].path`);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) fail('G04B_SNAPSHOT_INVENTORY_INVALID', 'snapshot file bytes must be a nonnegative safe integer', { index });
    if (!HEX64.test(entry.sha256 ?? '')) fail('G04B_SNAPSHOT_INVENTORY_INVALID', 'snapshot file sha256 must be lowercase SHA-256', { index });
    return { path: entry.path.replaceAll('\\', '/'), bytes: entry.bytes, sha256: entry.sha256 };
  }).sort((a, b) => a.path.localeCompare(b.path));
  if (new Set(files.map((entry) => entry.path)).size !== files.length) fail('G04B_SNAPSHOT_INVENTORY_INVALID', 'snapshot inventory paths must be unique');
  const normalized = { ...value, files };
  const expectedFingerprint = sourceSnapshotFingerprint(normalized);
  if (value.snapshotFingerprint !== expectedFingerprint) {
    fail('G04B_SNAPSHOT_INVENTORY_FINGERPRINT_MISMATCH', 'snapshotFingerprint does not match the exact declared inventory', {
      expected: expectedFingerprint,
      observed: value.snapshotFingerprint
    });
  }
  return Object.freeze(structuredClone(normalized));
}

function enumerateSnapshotFiles(root) {
  const result = [];
  const walk = (directory) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        result.push(relative);
      } else {
        fail('G04B_SNAPSHOT_FILE_INVALID', 'snapshot contains a non-file filesystem entry', { path: relative });
      }
    }
  };
  walk(root);
  return result.sort();
}

function observedSnapshotEntry(snapshotRoot, cacheRoot, entry) {
  const file = inside(snapshotRoot, path.join(snapshotRoot, ...entry.path.split('/')), `snapshot file ${entry.path}`);
  if (!fs.existsSync(file)) fail('G04B_SNAPSHOT_FILE_MISSING', 'snapshot inventory file is missing', { path: entry.path });
  const lstat = fs.lstatSync(file);
  let observedFile = file;
  if (lstat.isSymbolicLink()) {
    observedFile = fs.realpathSync.native(file);
    const relativeToCache = path.relative(cacheRoot, observedFile);
    if (relativeToCache === '..' || relativeToCache.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToCache)) {
      fail('G04B_SNAPSHOT_SYMLINK_ESCAPE', 'snapshot symlink resolves outside the admitted Hugging Face cache', { path: entry.path, observedFile });
    }
  } else if (!lstat.isFile()) {
    fail('G04B_SNAPSHOT_FILE_INVALID', 'snapshot inventory entry is not a regular file or admitted cache symlink', { path: entry.path });
  }
  const stat = fs.statSync(observedFile);
  if (!stat.isFile()) fail('G04B_SNAPSHOT_FILE_INVALID', 'resolved snapshot entry is not a regular file', { path: entry.path });
  const observed = { path: entry.path, bytes: stat.size, sha256: sha256File(observedFile) };
  if (observed.bytes !== entry.bytes || observed.sha256 !== entry.sha256) {
    fail('G04B_SNAPSHOT_FILE_MISMATCH', 'snapshot file does not match the exact frozen inventory', { expected: entry, observed });
  }
  return observed;
}

export function verifyG04BSourceSnapshot(packet) {
  const validated = validateG04BNativeWorkerPacket(packet, { verifyBoundFiles: false, verifySnapshot: false });
  const cacheRoot = canonicalDirectory(validated.huggingFaceHubCacheRoot, 'huggingFaceHubCacheRoot');
  const snapshotRoot = canonicalDirectory(validated.sourceSnapshotRoot, 'sourceSnapshotRoot');
  const relative = path.relative(cacheRoot, snapshotRoot);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('G04B_SNAPSHOT_ROOT_ESCAPE', 'sourceSnapshotRoot must be inside huggingFaceHubCacheRoot', { cacheRoot, snapshotRoot });
  }
  const actualPaths = enumerateSnapshotFiles(snapshotRoot);
  const expectedPaths = validated.sourceSnapshotInventory.files.map((entry) => entry.path);
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    fail('G04B_SNAPSHOT_PATH_SET_MISMATCH', 'snapshot path set does not equal the frozen inventory', {
      missing: expectedPaths.filter((item) => !actualPaths.includes(item)),
      extra: actualPaths.filter((item) => !expectedPaths.includes(item))
    });
  }
  const observedFiles = validated.sourceSnapshotInventory.files.map((entry) => observedSnapshotEntry(snapshotRoot, cacheRoot, entry));
  const observation = {
    schemaVersion: G04B_SOURCE_SNAPSHOT_FINGERPRINT_SCHEMA,
    sourceModelRepo: validated.sourceSnapshotInventory.sourceModelRepo,
    sourceModelRevision: validated.sourceSnapshotInventory.sourceModelRevision,
    files: observedFiles
  };
  const observedFingerprint = canonicalFingerprint(observation);
  if (observedFingerprint !== validated.sourceSnapshotInventory.snapshotFingerprint) {
    fail('G04B_SNAPSHOT_OBSERVATION_MISMATCH', 'observed snapshot fingerprint differs from the frozen inventory fingerprint', {
      expected: validated.sourceSnapshotInventory.snapshotFingerprint,
      observed: observedFingerprint
    });
  }
  return Object.freeze({
    schemaVersion: 'vexlife.g04b-source-model-snapshot-observation/v1',
    sourceModelRepo: observation.sourceModelRepo,
    sourceModelRevision: observation.sourceModelRevision,
    sourceSnapshotRoot: snapshotRoot,
    fileCount: observedFiles.length,
    snapshotFingerprint: observedFingerprint,
    independentlyObserved: true
  });
}

export function validateG04BNativeWorkerPacket(input, { sourceRoot = null, verifyBoundFiles = true, verifySnapshot = true } = {}) {
  exactKeys(input, PACKET_FIELDS, 'packet');
  const packet = structuredClone(input);
  if (packet.schemaVersion !== G04B_NATIVE_WORKER_PACKET_SCHEMA) fail('G04B_WORKER_PACKET_INVALID', `packet.schemaVersion must be ${G04B_NATIVE_WORKER_PACKET_SCHEMA}`);
  for (const field of ['workerRef', 'workRef', 'purposeRef', 'resultContractRef', 'resultRef', 'executionAuthorityRef', 'hostRef', 'pythonExecutableRef']) stableRef(packet[field], `packet.${field}`);
  packet.nodeRuntimeBinding = validatePacketNodeRuntimeBinding(packet.nodeRuntimeBinding, { verifyExecutable: verifyBoundFiles });
  if (packet.nodeRuntimeBinding.hostRef !== packet.hostRef) {
    fail('G04B_NWS_BINDING_MISMATCH', 'packet.hostRef does not match packet.nodeRuntimeBinding.hostRef', {
      expected: packet.hostRef,
      observed: packet.nodeRuntimeBinding.hostRef
    });
  }
  safeRelative(packet.trainingManifestPath, 'packet.trainingManifestPath');
  if (!HEX64.test(packet.trainingManifestSha256 ?? '')) fail('G04B_WORKER_PACKET_INVALID', 'trainingManifestSha256 must be lowercase SHA-256');
  if (packet.expectedExecutionDevice !== G04B_FIRST_WORKER_DEVICE || packet.expectedHardwareProfileRef !== G04B_FIRST_WORKER_HARDWARE_PROFILE) {
    fail('G04B_FIRST_WORKER_HOST_MISMATCH', 'generation-1 first NWS proving worker is bound exactly to MPS / Apple M4 Pro', {
      expectedExecutionDevice: G04B_FIRST_WORKER_DEVICE,
      expectedHardwareProfileRef: G04B_FIRST_WORKER_HARDWARE_PROFILE,
      observedExecutionDevice: packet.expectedExecutionDevice,
      observedHardwareProfileRef: packet.expectedHardwareProfileRef
    });
  }
  packet.sourceSnapshotInventory = validateInventory(packet.sourceSnapshotInventory);
  if (typeof packet.pythonExecutablePath !== 'string' || !path.isAbsolute(packet.pythonExecutablePath)) fail('G04B_PYTHON_BINDING_INVALID', 'pythonExecutablePath must be absolute');
  if (!HEX64.test(packet.pythonExecutableSha256 ?? '')) fail('G04B_PYTHON_BINDING_INVALID', 'pythonExecutableSha256 must be lowercase SHA-256');
  if (typeof packet.vexHomeRoot !== 'string' || !path.isAbsolute(packet.vexHomeRoot)) fail('G04B_WORKER_PACKET_INVALID', 'vexHomeRoot must be absolute');
  if (typeof packet.huggingFaceHubCacheRoot !== 'string' || !path.isAbsolute(packet.huggingFaceHubCacheRoot)) fail('G04B_WORKER_PACKET_INVALID', 'huggingFaceHubCacheRoot must be absolute');
  if (typeof packet.sourceSnapshotRoot !== 'string' || !path.isAbsolute(packet.sourceSnapshotRoot)) fail('G04B_WORKER_PACKET_INVALID', 'sourceSnapshotRoot must be absolute');

  if (verifyBoundFiles) {
    const home = canonicalDirectory(packet.vexHomeRoot, 'vexHomeRoot');
    const pythonRequested = path.resolve(packet.pythonExecutablePath);
    if (!fs.existsSync(pythonRequested)) fail('G04B_PYTHON_BINDING_INVALID', 'bound Python executable is missing', { pythonRequested });
    const pythonStat = fs.lstatSync(pythonRequested);
    if (pythonStat.isSymbolicLink() || !pythonStat.isFile()) fail('G04B_PYTHON_BINDING_INVALID', 'bound Python executable must be a regular non-symlink file');
    const pythonReal = fs.realpathSync.native(pythonRequested);
    if (pythonReal !== pythonRequested) fail('G04B_PYTHON_BINDING_INVALID', 'bound Python executable path is not canonical', { pythonRequested, pythonReal });
    const relativePython = path.relative(home, pythonReal);
    if (relativePython === '..' || relativePython.startsWith(`..${path.sep}`) || path.isAbsolute(relativePython)) {
      fail('G04B_PYTHON_BINDING_INVALID', 'bound Python executable must live inside the admitted Vex Home', { home, pythonReal });
    }
    const pythonSha256 = sha256File(pythonReal);
    if (pythonSha256 !== packet.pythonExecutableSha256) fail('G04B_PYTHON_BINDING_INVALID', 'bound Python executable SHA-256 mismatch', { expected: packet.pythonExecutableSha256, observed: pythonSha256 });

    if (sourceRoot !== null) {
      const source = canonicalDirectory(sourceRoot, 'sourceRoot');
      const manifestPath = inside(source, path.join(source, ...packet.trainingManifestPath.split('/')), 'training manifest');
      if (!fs.existsSync(manifestPath) || !fs.lstatSync(manifestPath).isFile()) fail('G04B_TRAINING_MANIFEST_MISSING', 'training manifest is missing', { manifestPath });
      const manifestSha256 = sha256File(manifestPath);
      if (manifestSha256 !== packet.trainingManifestSha256) fail('G04B_TRAINING_MANIFEST_HASH_MISMATCH', 'training manifest bytes do not match packet', { expected: packet.trainingManifestSha256, observed: manifestSha256 });
      const manifest = loadJson(manifestPath, 'G04B_TRAINING_MANIFEST_INVALID', 'training manifest');
      if (manifest.sourceModelRepo !== packet.sourceSnapshotInventory.sourceModelRepo
          || manifest.sourceModelRevision !== packet.sourceSnapshotInventory.sourceModelRevision
          || manifest.sourceModelSnapshotFingerprint !== packet.sourceSnapshotInventory.snapshotFingerprint) {
        fail('G04B_SOURCE_MODEL_BINDING_MISMATCH', 'training manifest source model identity does not match the independently verifiable snapshot inventory');
      }
      if (manifest.executionDevice !== packet.expectedExecutionDevice
          || manifest.expectedHardwareProfileRef !== packet.expectedHardwareProfileRef) {
        fail('G04B_EXECUTION_BINDING_MISMATCH', 'training manifest execution device/profile does not match the worker packet');
      }
      if (manifest.activationAuthorized !== false || manifest.publicUploadAuthorized !== false) {
        fail('G04B_AUTHORITY_COLLAPSE', 'training manifest must keep activation/public upload unauthorized');
      }
    }
    if (verifySnapshot) verifyG04BSourceSnapshot(packet);
  }
  return Object.freeze(packet);
}

export function packetFingerprint(packet) {
  const validated = validateG04BNativeWorkerPacket(packet, { verifyBoundFiles: false, verifySnapshot: false });
  return canonicalFingerprint(validated);
}

export function buildG04BNativeWorkerManifest(packet, {
  packetRelativePath,
  callerScriptName = 'g04b-native-training-worker.mjs'
} = {}) {
  const validated = validateG04BNativeWorkerPacket(packet, { verifyBoundFiles: false, verifySnapshot: false });
  safeRelative(packetRelativePath, 'packetRelativePath');
  if (callerScriptName !== 'g04b-native-training-worker.mjs') fail('G04B_CALLER_PATH_INVALID', 'callerScriptName is fixed by source');
  return validateNativeWorkerManifest({
    schemaVersion: NATIVE_WORKER_MANIFEST_SCHEMA,
    workerRef: validated.workerRef,
    workRef: validated.workRef,
    purposeRef: validated.purposeRef,
    humanLabel: 'G04B real foundation training proof',
    executableRef: validated.nodeRuntimeBinding.executableRef,
    argv: [callerScriptName, 'run', '--packet', packetRelativePath],
    sourceRootRelativeWorkingDirectory: 'scripts',
    schedulingClass: 'BACKGROUND',
    pauseMode: 'CHECKPOINT_BOUND_COOPERATIVE',
    resultContractRef: validated.resultContractRef,
    executionAuthorityRef: validated.executionAuthorityRef
  });
}

export function verifyG04BNativeWorkerEnvelope(packet, workerRoot) {
  const validated = validateG04BNativeWorkerPacket(packet, { verifyBoundFiles: false, verifySnapshot: false });
  const root = canonicalDirectory(workerRoot, 'workerRoot');
  const manifest = validateNativeWorkerManifest(loadJson(path.join(root, 'manifest.json'), 'G04B_NWS_ENVELOPE_INVALID', 'NWS manifest'));
  const persistedBinding = loadJson(path.join(root, 'binding.json'), 'G04B_NWS_BINDING_INVALID', 'NWS binding');
  const { binding, bindingFingerprint } = verifyG04BNodeRuntimeBinding(validated, persistedBinding, { verifyExecutable: true });
  for (const [field, expected] of [
    ['workerRef', validated.workerRef],
    ['workRef', validated.workRef],
    ['purposeRef', validated.purposeRef],
    ['resultContractRef', validated.resultContractRef],
    ['executionAuthorityRef', validated.executionAuthorityRef],
    ['executableRef', validated.nodeRuntimeBinding.executableRef]
  ]) {
    if (manifest[field] !== expected) {
      fail('G04B_NWS_ENVELOPE_MISMATCH', `persisted NWS manifest ${field} does not match the exact G04B worker packet`, {
        expected,
        observed: manifest[field]
      });
    }
  }
  if (manifest.schedulingClass !== 'BACKGROUND' || manifest.pauseMode !== 'CHECKPOINT_BOUND_COOPERATIVE') {
    fail('G04B_NWS_ENVELOPE_MISMATCH', 'G04B first worker requires BACKGROUND + CHECKPOINT_BOUND_COOPERATIVE NWS ownership');
  }
  return Object.freeze({ workerRoot: root, manifest, binding, bindingFingerprint });
}

export function verifyG04BMachineResult(result, packet) {
  const validated = validateG04BNativeWorkerPacket(packet, { verifyBoundFiles: false, verifySnapshot: false });
  if (!result || typeof result !== 'object' || Array.isArray(result) || result.schemaVersion !== G04B_NATIVE_WORKER_RESULT_SCHEMA) {
    fail('G04B_MACHINE_RESULT_INVALID', 'machine result schema is not current');
  }
  for (const [field, expected] of [
    ['workerRef', validated.workerRef],
    ['workRef', validated.workRef],
    ['purposeRef', validated.purposeRef],
    ['resultContractRef', validated.resultContractRef],
    ['resultRef', validated.resultRef],
    ['packetFingerprint', packetFingerprint(validated)],
    ['hostRef', validated.hostRef],
    ['nodeBindingRef', validated.nodeRuntimeBinding.bindingRef],
    ['nodeExecutableRef', validated.nodeRuntimeBinding.executableRef],
    ['nodeExecutableSha256', validated.nodeRuntimeBinding.executableSha256],
    ['nodeRuntimeBindingFingerprint', nodeRuntimeBindingFingerprint(validated.nodeRuntimeBinding)],
    ['trainingManifestSha256', validated.trainingManifestSha256],
    ['sourceModelRepo', validated.sourceSnapshotInventory.sourceModelRepo],
    ['sourceModelRevision', validated.sourceSnapshotInventory.sourceModelRevision],
    ['sourceModelSnapshotFingerprint', validated.sourceSnapshotInventory.snapshotFingerprint],
    ['executionDevice', validated.expectedExecutionDevice],
    ['expectedHardwareProfileRef', validated.expectedHardwareProfileRef]
  ]) {
    if (result[field] !== expected) fail('G04B_MACHINE_RESULT_IDENTITY_MISMATCH', `machine result ${field} does not match the exact G04B packet`, { expected, observed: result[field] });
  }
  if (result.sourceModelSnapshotFingerprintObserved !== true
      || result.trainingActuallyExecuted !== true
      || result.simulationOnly !== false
      || result.modelWeightsChanged !== true
      || !Number.isSafeInteger(result.changedParameterCount)
      || result.changedParameterCount <= 0
      || result.heldOutEvaluationReturned !== true
      || result.activationPerformed !== false
      || result.publicUploadPerformed !== false) {
    fail('G04B_MACHINE_RESULT_INVALID', 'machine result does not satisfy the real-training/evaluation truth contract');
  }
  for (const field of ['nodeRuntimeBindingFingerprint', 'inspectionFingerprint', 'trainingReceiptFingerprint', 'evaluationReceiptFingerprint', 'candidateArtifactFingerprint']) {
    if (!HEX64.test(result[field] ?? '')) fail('G04B_MACHINE_RESULT_INVALID', `machine result ${field} must be lowercase SHA-256`);
  }
  if (typeof result.priorModelIdentity !== 'string' || !result.priorModelIdentity
      || typeof result.candidateModelIdentity !== 'string' || !result.candidateModelIdentity) {
    fail('G04B_MACHINE_RESULT_INVALID', 'machine result model genealogy is missing');
  }
  return Object.freeze(structuredClone(result));
}

function verifyCommonTrainingIdentity(payload, manifest, packet, label) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('G04B_PHASE_RESULT_INVALID', `${label} result must be one object`);
  for (const [field, expected] of [
    ['trainingRunRef', manifest.trainingRunRef],
    ['sourceModelRepo', manifest.sourceModelRepo],
    ['sourceModelRevision', manifest.sourceModelRevision],
    ['sourceModelSnapshotFingerprint', manifest.sourceModelSnapshotFingerprint],
    ['sourceManifestFingerprint', manifest.sourceManifestFingerprint],
    ['executionDevice', packet.expectedExecutionDevice],
    ['expectedHardwareProfileRef', packet.expectedHardwareProfileRef]
  ]) {
    if (payload[field] !== expected) fail('G04B_PHASE_IDENTITY_MISMATCH', `${label}.${field} does not match the exact worker packet / training manifest`, { expected, observed: payload[field] });
  }
  if (payload.sourceModelSnapshotFingerprintObserved !== false) fail('G04B_PHASE_PROVENANCE_COLLAPSE', `${label} must not claim Python independently observed sourceModelSnapshotFingerprint`);
  if (payload.sourceManifestFingerprintObserved !== false) fail('G04B_PHASE_PROVENANCE_COLLAPSE', `${label} must not claim Python independently observed sourceManifestFingerprint`);
  if (!HEX64.test(payload.executionObservationFingerprint ?? '')) fail('G04B_PHASE_RESULT_INVALID', `${label} has no valid executionObservationFingerprint`);
  if (!payload.executionObservation || payload.executionObservation.observationFingerprint !== payload.executionObservationFingerprint) {
    fail('G04B_PHASE_RESULT_INVALID', `${label} execution observation fingerprint is not self-consistent`);
  }
}

export function verifyG04BInspectionResult(payload, manifest, packet) {
  if (payload?.schemaVersion !== 'vexlife.foundation-training-inspection/v1') fail('G04B_INSPECTION_RESULT_INVALID', 'inspection result schema is not current');
  verifyCommonTrainingIdentity(payload, manifest, packet, 'inspection');
  if (payload.localFilesOnly !== true || payload.modelPlacedOnExecutionDevice !== true || payload.deviceType !== 'mps') {
    fail('G04B_INSPECTION_RESULT_INVALID', 'inspection did not prove local-only MPS model placement');
  }
  return payload;
}

export function verifyG04BTrainingResult(payload, manifest, packet) {
  if (payload?.schemaVersion !== 'vexlife.foundation-training-receipt/v1') fail('G04B_TRAINING_RESULT_INVALID', 'training result schema is not current');
  verifyCommonTrainingIdentity(payload, manifest, packet, 'training');
  if (payload.trainingActuallyExecuted !== true || payload.modelWeightsChanged !== true || !Number.isSafeInteger(payload.changedParameterCount) || payload.changedParameterCount <= 0) {
    fail('G04B_TRAINING_RESULT_INVALID', 'training result does not prove a real nonzero weight change');
  }
  if (payload.activationPerformed !== false) fail('G04B_ACTIVATION_COLLAPSE', 'training result must preserve activationPerformed=false');
  if (!HEX64.test(payload.candidateArtifactFingerprint ?? '') || typeof payload.candidateModelIdentity !== 'string' || !payload.candidateModelIdentity) {
    fail('G04B_TRAINING_RESULT_INVALID', 'training result has no exact candidate artifact/model identity');
  }
  return payload;
}

export function verifyG04BEvaluationResult(payload, manifest, packet, trainingResult) {
  if (payload?.schemaVersion !== 'vexlife.foundation-evaluation-receipt/v1') fail('G04B_EVALUATION_RESULT_INVALID', 'evaluation result schema is not current');
  if (payload.trainingRunRef !== manifest.trainingRunRef) fail('G04B_EVALUATION_IDENTITY_MISMATCH', 'evaluation trainingRunRef mismatch');
  if (payload.trainingExecutionDevice !== packet.expectedExecutionDevice || payload.trainingExpectedHardwareProfileRef !== packet.expectedHardwareProfileRef) {
    fail('G04B_EVALUATION_IDENTITY_MISMATCH', 'evaluation training execution device/profile mismatch');
  }
  if (payload.priorModelIdentity !== trainingResult.priorModelIdentity || payload.candidateModelIdentity !== trainingResult.candidateModelIdentity) {
    fail('G04B_EVALUATION_IDENTITY_MISMATCH', 'evaluation model genealogy does not match the exact training result');
  }
  if (payload.candidateArtifactFingerprint !== trainingResult.candidateArtifactFingerprint) {
    fail('G04B_EVALUATION_IDENTITY_MISMATCH', 'evaluation candidate artifact fingerprint does not match training');
  }
  if (payload.automaticPromotion !== false) fail('G04B_ACTIVATION_COLLAPSE', 'evaluation must preserve automaticPromotion=false');
  return payload;
}

function parseSingleJson(stdout, label) {
  const text = String(stdout ?? '').trim();
  if (!text) fail('G04B_PHASE_OUTPUT_INVALID', `${label} returned no JSON`);
  try {
    return JSON.parse(text);
  } catch (error) {
    fail('G04B_PHASE_OUTPUT_INVALID', `${label} returned non-JSON output`, { cause: error.message, output: text.slice(0, 1000) });
  }
}

export function defaultProcessRunner(executable, argv, { cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, argv, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let terminateRequested = false;
    const forwardTerminate = () => {
      terminateRequested = true;
      try { child.kill('SIGTERM'); } catch {}
    };
    process.once('SIGTERM', forwardTerminate);
    const append = (prior, chunk, label) => {
      const next = Buffer.concat([prior, Buffer.from(chunk)]);
      if (next.length > MAX_CAPTURE_BYTES) {
        try { child.kill('SIGTERM'); } catch {}
        fail('G04B_PHASE_OUTPUT_TOO_LARGE', `${label} exceeded bounded capture limit`);
      }
      return next;
    };
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk, 'stdout'); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk, 'stderr'); });
    child.once('error', (error) => {
      process.removeListener('SIGTERM', forwardTerminate);
      reject(error);
    });
    child.once('close', (code, signal) => {
      process.removeListener('SIGTERM', forwardTerminate);
      if (terminateRequested) {
        process.removeAllListeners('SIGTERM');
        process.kill(process.pid, 'SIGTERM');
        return;
      }
      resolve({ code, signal, stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8') });
    });
  });
}

function phaseEnvironment(packet) {
  return {
    ...process.env,
    HF_HUB_CACHE: packet.huggingFaceHubCacheRoot,
    HF_HUB_OFFLINE: '1',
    TRANSFORMERS_OFFLINE: '1',
    TOKENIZERS_PARALLELISM: 'false'
  };
}

function pauseRequested(controlPath, packet) {
  if (!controlPath || !fs.existsSync(controlPath)) return false;
  const control = loadJson(controlPath, 'G04B_WORKER_CONTROL_INVALID', 'NWS control');
  if (control.schemaVersion !== 'vexlife.native-worker-control/v1' || control.workerRef !== packet.workerRef) {
    fail('G04B_WORKER_CONTROL_INVALID', 'NWS control identity does not match this worker');
  }
  return control.action === 'PAUSE';
}

async function runPhase(runner, executable, argv, options, label) {
  const result = await runner(executable, argv, options);
  if (result.signal || result.code !== 0) {
    fail('G04B_PHASE_EXECUTION_FAILED', `${label} failed`, {
      code: result.code,
      signal: result.signal,
      stderr: String(result.stderr ?? '').slice(0, 4000)
    });
  }
  return parseSingleJson(result.stdout, label);
}

export async function executeG04BNativeTrainingWorker(packet, {
  sourceRoot,
  planValidator,
  processRunner = defaultProcessRunner,
  controlPath = process.env.VEX_WORKER_CONTROL_PATH ?? null,
  workerRoot = process.env.VEX_WORKER_ROOT ?? null
} = {}) {
  if (typeof planValidator !== 'function') fail('G04B_PLAN_VALIDATOR_REQUIRED', 'planValidator is required');
  const source = canonicalDirectory(sourceRoot, 'sourceRoot');
  const validated = validateG04BNativeWorkerPacket(packet, { sourceRoot: source, verifyBoundFiles: true, verifySnapshot: false });
  if (workerRoot) verifyG04BNativeWorkerEnvelope(validated, workerRoot);
  const manifestPath = inside(source, path.join(source, ...validated.trainingManifestPath.split('/')), 'training manifest');
  const manifest = loadJson(manifestPath, 'G04B_TRAINING_MANIFEST_INVALID', 'training manifest');
  const snapshot = verifyG04BSourceSnapshot(validated);
  const plan = planValidator(manifestPath, { repoRoot: source, verifyFiles: true, verifySourceManifest: true });
  if (plan.trainingRunRef !== manifest.trainingRunRef
      || plan.sourceModelRepo !== manifest.sourceModelRepo
      || plan.sourceModelRevision !== manifest.sourceModelRevision
      || plan.sourceModelSnapshotFingerprint !== snapshot.snapshotFingerprint
      || plan.executionDevice !== validated.expectedExecutionDevice
      || plan.expectedHardwareProfileRef !== validated.expectedHardwareProfileRef
      || plan.realExecutionRequired !== true
      || plan.realOptimizerStepRequired !== true
      || plan.nonzeroChangedParameterRequired !== true
      || plan.automaticActivation !== false) {
    fail('G04B_PLAN_BINDING_MISMATCH', 'foundation training plan does not match the exact worker packet / observed source snapshot');
  }

  const env = phaseEnvironment(validated);
  const trainer = path.join(source, 'training', 'foundation-generation', 'foundation_train.py');
  const evaluator = path.join(source, 'training', 'foundation-generation', 'foundation_evaluate.py');
  for (const fixed of [trainer, evaluator]) {
    if (!fs.existsSync(fixed) || !fs.lstatSync(fixed).isFile()) fail('G04B_FIXED_SOURCE_MISSING', 'fixed G04B source entrypoint is missing', { fixed });
  }

  const inspection = verifyG04BInspectionResult(await runPhase(
    processRunner,
    validated.pythonExecutablePath,
    [trainer, '--manifest', manifestPath, '--inspect-only'],
    { cwd: source, env },
    'inspection'
  ), manifest, validated);

  if (pauseRequested(controlPath, validated)) {
    return Object.freeze({
      schemaVersion: 'vexlife.g04b-native-training-worker-yield/v1',
      workerRef: validated.workerRef,
      workRef: validated.workRef,
      resultContractRef: validated.resultContractRef,
      packetFingerprint: packetFingerprint(validated),
      safeCheckpoint: 'AFTER_INSPECTION_BEFORE_OPTIMIZER_EFFECT',
      snapshotFingerprint: snapshot.snapshotFingerprint,
      inspectionFingerprint: canonicalFingerprint(inspection),
      exitCode: 75
    });
  }

  const training = verifyG04BTrainingResult(await runPhase(
    processRunner,
    validated.pythonExecutablePath,
    [trainer, '--manifest', manifestPath, '--execute'],
    { cwd: source, env },
    'training'
  ), manifest, validated);

  const candidateDirectory = inside(source, path.join(source, ...String(manifest.outputDir).split(/[\\/]/u)), 'candidate output directory');
  const evaluation = verifyG04BEvaluationResult(await runPhase(
    processRunner,
    validated.pythonExecutablePath,
    [evaluator, '--manifest', manifestPath, '--candidate', candidateDirectory],
    { cwd: source, env },
    'evaluation'
  ), manifest, validated, training);

  const result = Object.freeze({
    schemaVersion: G04B_NATIVE_WORKER_RESULT_SCHEMA,
    workerRef: validated.workerRef,
    workRef: validated.workRef,
    purposeRef: validated.purposeRef,
    resultContractRef: validated.resultContractRef,
    resultRef: validated.resultRef,
    packetFingerprint: packetFingerprint(validated),
    hostRef: validated.hostRef,
    nodeBindingRef: validated.nodeRuntimeBinding.bindingRef,
    nodeExecutableRef: validated.nodeRuntimeBinding.executableRef,
    nodeExecutableSha256: validated.nodeRuntimeBinding.executableSha256,
    nodeRuntimeBindingFingerprint: nodeRuntimeBindingFingerprint(validated.nodeRuntimeBinding),
    trainingManifestSha256: validated.trainingManifestSha256,
    sourceModelRepo: manifest.sourceModelRepo,
    sourceModelRevision: manifest.sourceModelRevision,
    sourceModelSnapshotFingerprint: snapshot.snapshotFingerprint,
    sourceModelSnapshotFingerprintObserved: true,
    sourceManifestFingerprint: manifest.sourceManifestFingerprint,
    executionDevice: validated.expectedExecutionDevice,
    expectedHardwareProfileRef: validated.expectedHardwareProfileRef,
    inspectionFingerprint: canonicalFingerprint(inspection),
    trainingReceiptFingerprint: canonicalFingerprint(training),
    evaluationReceiptFingerprint: canonicalFingerprint(evaluation),
    priorModelIdentity: training.priorModelIdentity,
    candidateModelIdentity: training.candidateModelIdentity,
    candidateArtifactFingerprint: training.candidateArtifactFingerprint,
    trainingActuallyExecuted: true,
    simulationOnly: false,
    modelWeightsChanged: true,
    changedParameterCount: training.changedParameterCount,
    heldOutEvaluationReturned: true,
    activationPerformed: false,
    publicUploadPerformed: false
  });

  if (workerRoot) {
    const root = canonicalDirectory(workerRoot, 'workerRoot');
    const resultFile = inside(root, path.join(root, 'g04b-machine-result.json'), 'G04B machine result');
    const temp = `${resultFile}.tmp-${process.pid}-${crypto.randomUUID()}`;
    fs.writeFileSync(temp, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, resultFile);
  }
  return verifyG04BMachineResult(result, validated);
}
