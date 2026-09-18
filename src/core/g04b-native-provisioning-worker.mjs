import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  NATIVE_WORKER_MANIFEST_SCHEMA,
  validateNativeWorkerBinding,
  validateNativeWorkerManifest
} from './native-worker-supervisor.mjs';
import {
  G04B_SOURCE_SNAPSHOT_FINGERPRINT_SCHEMA,
  G04B_SOURCE_SNAPSHOT_INVENTORY_SCHEMA
} from './g04b-native-training-worker.mjs';

export const G04B_PROVISIONING_PACKET_SCHEMA = 'vexlife.g04b-provisioning-packet/v1';
export const G04B_PROVISIONING_RESULT_SCHEMA = 'vexlife.g04b-provisioning-result/v1';
export const G04B_PROVISIONING_RUNTIME_RECEIPT_SCHEMA = 'vexlife.g04b-provisioning-runtime-receipt/v1';
export const G04B_PROVISIONING_HOST_PROFILE = 'hardware.macos-arm64.apple-m4-pro.metal';
export const G04B_PROVISIONING_SOURCE_REPO = 'Qwen/Qwen3.5-4B';
export const G04B_PROVISIONING_SOURCE_REVISION = '851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a';

const HEX40 = /^[0-9a-f]{40}$/u;
const HEX64 = /^[0-9a-f]{64}$/u;
const REF_RE = /^[a-z0-9](?:[a-z0-9._-]{0,190}[a-z0-9])?$/u;
const PACKAGE_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/u;
const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;
const PACKET_FIELDS = Object.freeze([
  'schemaVersion', 'workerRef', 'workRef', 'purposeRef', 'resultContractRef', 'resultRef',
  'executionAuthorityRef', 'hostRef', 'nodeRuntimeBinding', 'expectedHardwareProfileRef',
  'vexHomeRoot', 'pythonRuntime', 'pythonDependencyLock', 'sourceModel'
]);
const RUNTIME_FIELDS = Object.freeze([
  'runtimeRef', 'pythonVersion', 'artifactRef', 'filename', 'url', 'sha256', 'expectedBytes',
  'maxBytes', 'sourceRef', 'licenseRef', 'archiveClass', 'executableRelativePath'
]);
const DEPENDENCY_LOCK_FIELDS = Object.freeze(['pythonVersion', 'packages']);
const PACKAGE_FIELDS = Object.freeze([
  'project', 'version', 'filename', 'url', 'sha256', 'expectedBytes', 'maxBytes', 'sourceRef', 'licenseRef'
]);
const MODEL_FIELDS = Object.freeze(['repo', 'revision', 'licenseRef', 'files']);
const MODEL_FILE_FIELDS = Object.freeze(['path', 'url', 'sha256', 'expectedBytes', 'maxBytes', 'sourceRef']);
const RESULT_FIELDS = Object.freeze([
  'schemaVersion', 'workerRef', 'workRef', 'purposeRef', 'resultContractRef', 'resultRef',
  'packetFingerprint', 'hostRef', 'nodeBindingRef', 'nodeExecutableRef', 'nodeExecutableSha256',
  'expectedHardwareProfileRef', 'vexHomeRoot', 'pythonRuntimeRef', 'pythonExecutablePath',
  'pythonExecutableSha256', 'pythonVersion', 'dependencyLockFingerprint', 'packageCount',
  'pythonQualificationFingerprint', 'huggingFaceHubCacheRoot', 'sourceSnapshotRoot',
  'sourceSnapshotInventory', 'sourceModelSnapshotFingerprint', 'runtimeDisposition',
  'modelArtifactDispositions', 'modelDownloadPerformed', 'packageInstallationExecuted',
  'trainingActuallyExecuted', 'optimizerStepPerformed', 'activationPerformed', 'publicUploadPerformed'
]);
const RUNTIME_RECEIPT_FIELDS = Object.freeze([
  'schemaVersion', 'runtimeRef', 'runtimePacketFingerprint', 'dependencyLockFingerprint',
  'pythonExecutableRelativePath', 'pythonExecutableSha256', 'pythonVersion', 'packageCount',
  'pythonQualificationFingerprint'
]);

export class G04BProvisioningWorkerError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'G04BProvisioningWorkerError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new G04BProvisioningWorkerError(code, message, details);
}

function exactKeys(value, keys, label, code = 'G04B_PROVISION_PACKET_INVALID') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${label} must be one object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(code, `${label} fields are not exact`, { actual, expected });
}
function stableRef(value, label) {
  if (typeof value !== 'string' || !REF_RE.test(value)) fail('G04B_PROVISION_PACKET_INVALID', `${label} must be one stable lowercase ref`);
  return value;
}
function text(value, label, max = 4096) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > max || value.includes('\0')) {
    fail('G04B_PROVISION_PACKET_INVALID', `${label} must be non-empty trimmed NUL-free text <= ${max}`);
  }
  return value;
}
function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) fail('G04B_PROVISION_PACKET_INVALID', `${label} must be one positive safe integer`);
  return value;
}
function safeBasename(value, label, suffix = null) {
  text(value, label, 512);
  if (value !== path.basename(value) || value.includes('/') || value.includes('\\') || value === '.' || value === '..') {
    fail('G04B_PROVISION_PACKET_INVALID', `${label} must be one filename`);
  }
  if (suffix && !value.toLowerCase().endsWith(suffix)) fail('G04B_PROVISION_PACKET_INVALID', `${label} must end in ${suffix}`);
  return value;
}
function safeRelative(value, label) {
  text(value, label, 4096);
  if (path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) {
    fail('G04B_PROVISION_PACKET_INVALID', `${label} must be one safe relative path`);
  }
  const segments = value.split(/[\\/]/u);
  if (segments.some((part) => !part || part === '.' || part === '..')) fail('G04B_PROVISION_PACKET_INVALID', `${label} is not canonical`);
  return value.replaceAll('\\', '/');
}
function httpsUrl(value, label) {
  text(value, label, 8192);
  let parsed;
  try { parsed = new URL(value); } catch { fail('G04B_PROVISION_PACKET_INVALID', `${label} must be one URL`); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) fail('G04B_PROVISION_PACKET_INVALID', `${label} must be credential-free HTTPS`);
  return parsed.toString();
}
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
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
    if (!stat.isFile()) fail('G04B_PROVISION_FILE_INVALID', 'bound file must be one regular file', { file });
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
    return hash.digest('hex');
  } finally { fs.closeSync(fd); }
}
function canonicalDirectory(raw, label, { create = false } = {}) {
  if (typeof raw !== 'string' || !path.isAbsolute(raw)) fail('G04B_PROVISION_ROOT_INVALID', `${label} must be absolute`);
  const requested = path.resolve(raw);
  if (create) fs.mkdirSync(requested, { recursive: true });
  if (!fs.existsSync(requested)) fail('G04B_PROVISION_ROOT_INVALID', `${label} does not exist`, { requested });
  const stat = fs.lstatSync(requested);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('G04B_PROVISION_ROOT_INVALID', `${label} must be one real directory`, { requested });
  const real = fs.realpathSync.native(requested);
  if (real !== requested) fail('G04B_PROVISION_ROOT_INVALID', `${label} must use canonical filesystem identity`, { requested, real });
  return real;
}
function inside(root, candidate, label) {
  const target = path.resolve(candidate);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('G04B_PROVISION_BOUNDARY_ESCAPE', `${label} escapes admitted root`, { root, target });
  }
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) continue;
    if (fs.lstatSync(cursor).isSymbolicLink()) fail('G04B_PROVISION_BOUNDARY_ESCAPE', `${label} traverses a symlink`, { path: cursor });
  }
  return target;
}
function loadJson(file, code, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(code, `${label} could not be read`, { file, cause: error?.message ?? String(error) }); }
}
function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  fs.renameSync(temp, file);
}
function ensureExactFile(file, expectedBytes, expectedSha256, label) {
  if (!fs.existsSync(file)) fail('G04B_PROVISION_FILE_MISSING', `${label} is missing`, { file });
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) fail('G04B_PROVISION_FILE_INVALID', `${label} must be one regular non-symlink file`, { file });
  if (stat.size !== expectedBytes) fail('G04B_PROVISION_FILE_MISMATCH', `${label} byte size mismatch`, { expectedBytes, observedBytes: stat.size });
  const observedSha256 = sha256File(file);
  if (observedSha256 !== expectedSha256) fail('G04B_PROVISION_FILE_MISMATCH', `${label} SHA-256 mismatch`, { expectedSha256, observedSha256 });
  return { bytes: stat.size, sha256: observedSha256 };
}

function validateNodeBinding(value, { verifyExecutable = false } = {}) {
  try { return validateNativeWorkerBinding(value, { verifyExecutable }); }
  catch (error) { fail('G04B_PROVISION_NWS_BINDING_INVALID', 'nodeRuntimeBinding is not one exact valid NWS binding', { cause: error?.message ?? String(error) }); }
}

export function verifyG04BProvisioningNodeRuntimeBinding(packet, binding, { verifyExecutable = true } = {}) {
  const validated = validateG04BProvisioningPacket(packet);
  const observed = validateNodeBinding(binding, { verifyExecutable });
  if (canonicalFingerprint(observed) !== canonicalFingerprint(validated.nodeRuntimeBinding)) {
    fail('G04B_PROVISION_NWS_BINDING_MISMATCH', 'supplied Node binding differs from frozen provisioning packet binding');
  }
  return Object.freeze(observed);
}

function validateArtifact(input, label, { wheel = false } = {}) {
  const fields = wheel ? PACKAGE_FIELDS : RUNTIME_FIELDS;
  exactKeys(input, fields, label);
  const value = structuredClone(input);
  if (wheel) {
    if (typeof value.project !== 'string' || !PACKAGE_RE.test(value.project)) fail('G04B_PROVISION_PACKET_INVALID', `${label}.project is invalid`);
    text(value.version, `${label}.version`, 120);
    safeBasename(value.filename, `${label}.filename`, '.whl');
  } else {
    stableRef(value.runtimeRef, `${label}.runtimeRef`);
    if (value.pythonVersion !== '3.12') fail('G04B_PROVISION_PACKET_INVALID', `${label}.pythonVersion must be exactly 3.12`);
    stableRef(value.artifactRef, `${label}.artifactRef`);
    safeBasename(value.filename, `${label}.filename`);
    if (value.archiveClass !== 'POSIX_TAR_GZ') fail('G04B_PROVISION_PACKET_INVALID', `${label}.archiveClass must be POSIX_TAR_GZ for the first Mac proof`);
    value.executableRelativePath = safeRelative(value.executableRelativePath, `${label}.executableRelativePath`);
  }
  value.url = httpsUrl(value.url, `${label}.url`);
  if (!HEX64.test(value.sha256 ?? '')) fail('G04B_PROVISION_PACKET_INVALID', `${label}.sha256 must be lowercase SHA-256`);
  positiveSafeInteger(value.expectedBytes, `${label}.expectedBytes`);
  positiveSafeInteger(value.maxBytes, `${label}.maxBytes`);
  if (value.expectedBytes > value.maxBytes) fail('G04B_PROVISION_PACKET_INVALID', `${label}.expectedBytes exceeds maxBytes`);
  stableRef(value.sourceRef, `${label}.sourceRef`);
  stableRef(value.licenseRef, `${label}.licenseRef`);
  return value;
}

function validateDependencyLock(input) {
  exactKeys(input, DEPENDENCY_LOCK_FIELDS, 'pythonDependencyLock');
  if (input.pythonVersion !== '3.12') fail('G04B_PROVISION_PACKET_INVALID', 'pythonDependencyLock.pythonVersion must be exactly 3.12');
  if (!Array.isArray(input.packages) || input.packages.length === 0) fail('G04B_PROVISION_PACKET_INVALID', 'pythonDependencyLock.packages must not be empty');
  const packages = input.packages.map((entry, index) => validateArtifact(entry, `pythonDependencyLock.packages[${index}]`, { wheel: true }));
  const projects = packages.map((entry) => entry.project.toLowerCase().replaceAll('_', '-').replaceAll('.', '-'));
  const filenames = packages.map((entry) => entry.filename);
  if (new Set(projects).size !== projects.length) fail('G04B_PROVISION_PACKET_INVALID', 'dependency projects must be unique');
  if (new Set(filenames).size !== filenames.length) fail('G04B_PROVISION_PACKET_INVALID', 'dependency wheel filenames must be unique');
  const sorted = [...packages].sort((a, b) => a.project.localeCompare(b.project) || a.filename.localeCompare(b.filename));
  if (JSON.stringify(packages) !== JSON.stringify(sorted)) fail('G04B_PROVISION_PACKET_INVALID', 'dependency packages must be canonically sorted');
  return Object.freeze({ pythonVersion: '3.12', packages: sorted });
}

function validateSourceModel(input) {
  exactKeys(input, MODEL_FIELDS, 'sourceModel');
  if (input.repo !== G04B_PROVISIONING_SOURCE_REPO) fail('G04B_PROVISION_SOURCE_MODEL_INVALID', `sourceModel.repo must be ${G04B_PROVISIONING_SOURCE_REPO}`);
  if (input.revision !== G04B_PROVISIONING_SOURCE_REVISION || !HEX40.test(input.revision)) fail('G04B_PROVISION_SOURCE_MODEL_INVALID', `sourceModel.revision must be ${G04B_PROVISIONING_SOURCE_REVISION}`);
  stableRef(input.licenseRef, 'sourceModel.licenseRef');
  if (!Array.isArray(input.files) || input.files.length === 0) fail('G04B_PROVISION_SOURCE_MODEL_INVALID', 'sourceModel.files must not be empty');
  const files = input.files.map((entry, index) => {
    exactKeys(entry, MODEL_FILE_FIELDS, `sourceModel.files[${index}]`, 'G04B_PROVISION_SOURCE_MODEL_INVALID');
    const value = structuredClone(entry);
    value.path = safeRelative(value.path, `sourceModel.files[${index}].path`);
    value.url = httpsUrl(value.url, `sourceModel.files[${index}].url`);
    if (!HEX64.test(value.sha256 ?? '')) fail('G04B_PROVISION_SOURCE_MODEL_INVALID', 'source model file sha256 must be lowercase SHA-256', { index });
    positiveSafeInteger(value.expectedBytes, `sourceModel.files[${index}].expectedBytes`);
    positiveSafeInteger(value.maxBytes, `sourceModel.files[${index}].maxBytes`);
    if (value.expectedBytes > value.maxBytes) fail('G04B_PROVISION_SOURCE_MODEL_INVALID', 'source model file expectedBytes exceeds maxBytes', { index });
    stableRef(value.sourceRef, `sourceModel.files[${index}].sourceRef`);
    return value;
  });
  const paths = files.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) fail('G04B_PROVISION_SOURCE_MODEL_INVALID', 'source model paths must be unique');
  const sorted = [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (JSON.stringify(files) !== JSON.stringify(sorted)) fail('G04B_PROVISION_SOURCE_MODEL_INVALID', 'source model files must be canonically sorted');
  return Object.freeze({ repo: input.repo, revision: input.revision, licenseRef: input.licenseRef, files: sorted });
}

export function validateG04BProvisioningPacket(input, { verifyNodeExecutable = false } = {}) {
  exactKeys(input, PACKET_FIELDS, 'packet');
  const packet = structuredClone(input);
  if (packet.schemaVersion !== G04B_PROVISIONING_PACKET_SCHEMA) fail('G04B_PROVISION_PACKET_INVALID', `packet.schemaVersion must be ${G04B_PROVISIONING_PACKET_SCHEMA}`);
  for (const field of ['workerRef', 'workRef', 'purposeRef', 'resultContractRef', 'resultRef', 'executionAuthorityRef', 'hostRef']) stableRef(packet[field], `packet.${field}`);
  packet.nodeRuntimeBinding = validateNodeBinding(packet.nodeRuntimeBinding, { verifyExecutable: verifyNodeExecutable });
  if (packet.nodeRuntimeBinding.hostRef !== packet.hostRef) fail('G04B_PROVISION_NWS_BINDING_MISMATCH', 'packet hostRef and Node binding hostRef differ');
  if (packet.expectedHardwareProfileRef !== G04B_PROVISIONING_HOST_PROFILE) fail('G04B_PROVISION_HOST_INVALID', `first provisioning worker is bound to ${G04B_PROVISIONING_HOST_PROFILE}`);
  if (typeof packet.vexHomeRoot !== 'string' || !path.isAbsolute(packet.vexHomeRoot)) fail('G04B_PROVISION_ROOT_INVALID', 'vexHomeRoot must be absolute');
  packet.pythonRuntime = validateArtifact(packet.pythonRuntime, 'pythonRuntime');
  packet.pythonDependencyLock = validateDependencyLock(packet.pythonDependencyLock);
  if (packet.pythonRuntime.pythonVersion !== packet.pythonDependencyLock.pythonVersion) fail('G04B_PROVISION_PYTHON_VERSION_MISMATCH', 'runtime and dependency lock Python versions differ');
  packet.sourceModel = validateSourceModel(packet.sourceModel);
  return Object.freeze(packet);
}

export function g04bProvisioningPacketFingerprint(packet) {
  return canonicalFingerprint(validateG04BProvisioningPacket(packet));
}
export function g04bDependencyLockFingerprint(lock) {
  return canonicalFingerprint(validateDependencyLock(lock));
}
function runtimePacketFingerprint(packet) {
  const validated = validateG04BProvisioningPacket(packet);
  return canonicalFingerprint({
    schemaVersion: 'vexlife.g04b-provisioning-runtime-binding/v1',
    hostRef: validated.hostRef,
    expectedHardwareProfileRef: validated.expectedHardwareProfileRef,
    pythonRuntime: validated.pythonRuntime,
    pythonDependencyLock: validated.pythonDependencyLock
  });
}

export function buildG04BProvisioningWorkerManifest(packet, {
  packetRelativePath,
  callerScriptName = 'g04b-native-provisioning-worker.mjs'
} = {}) {
  const validated = validateG04BProvisioningPacket(packet);
  safeRelative(packetRelativePath, 'packetRelativePath');
  if (callerScriptName !== 'g04b-native-provisioning-worker.mjs') fail('G04B_PROVISION_CALLER_PATH_INVALID', 'callerScriptName is fixed by source');
  return validateNativeWorkerManifest({
    schemaVersion: NATIVE_WORKER_MANIFEST_SCHEMA,
    workerRef: validated.workerRef,
    workRef: validated.workRef,
    purposeRef: validated.purposeRef,
    humanLabel: 'G04B exact runtime and model pre-provisioning',
    executableRef: validated.nodeRuntimeBinding.executableRef,
    argv: [callerScriptName, 'run', '--packet', packetRelativePath],
    sourceRootRelativeWorkingDirectory: 'scripts',
    schedulingClass: 'BACKGROUND',
    pauseMode: 'NONE',
    resultContractRef: validated.resultContractRef,
    executionAuthorityRef: validated.executionAuthorityRef
  });
}

export function verifyG04BProvisioningEnvelope(packet, workerRoot) {
  const validated = validateG04BProvisioningPacket(packet);
  const root = canonicalDirectory(workerRoot, 'workerRoot');
  const manifest = validateNativeWorkerManifest(loadJson(path.join(root, 'manifest.json'), 'G04B_PROVISION_NWS_ENVELOPE_INVALID', 'NWS manifest'));
  const binding = validateNodeBinding(loadJson(path.join(root, 'binding.json'), 'G04B_PROVISION_NWS_BINDING_INVALID', 'NWS binding'), { verifyExecutable: true });
  for (const [field, expected] of [
    ['workerRef', validated.workerRef], ['workRef', validated.workRef], ['purposeRef', validated.purposeRef],
    ['resultContractRef', validated.resultContractRef], ['executionAuthorityRef', validated.executionAuthorityRef],
    ['executableRef', validated.nodeRuntimeBinding.executableRef]
  ]) {
    if (manifest[field] !== expected) fail('G04B_PROVISION_NWS_ENVELOPE_MISMATCH', `NWS manifest ${field} does not match packet`, { expected, observed: manifest[field] });
  }
  if (canonicalFingerprint(binding) !== canonicalFingerprint(validated.nodeRuntimeBinding)) fail('G04B_PROVISION_NWS_BINDING_MISMATCH', 'persisted NWS binding differs from frozen packet binding');
  if (manifest.schedulingClass !== 'BACKGROUND' || manifest.pauseMode !== 'NONE') fail('G04B_PROVISION_NWS_ENVELOPE_MISMATCH', 'provisioning worker requires BACKGROUND / pauseMode NONE');
  return Object.freeze({ workerRoot: root, manifest, binding });
}

function requirementsLockBytes(lock) {
  const validated = validateDependencyLock(lock);
  const lines = [
    '# vexlife.g04b exact offline dependency lock',
    ...validated.packages.map((entry) => `${entry.project}==${entry.version} --hash=sha256:${entry.sha256}`)
  ];
  return `${lines.join('\n')}\n`;
}

function snapshotRootFor(home, model) {
  const cacheRoot = inside(home, path.join(home, 'models', 'huggingface', 'hub'), 'Hugging Face cache root');
  const repoDir = `models--${model.repo.replaceAll('/', '--')}`;
  const snapshotRoot = inside(cacheRoot, path.join(cacheRoot, repoDir, 'snapshots', model.revision), 'source snapshot root');
  return { cacheRoot, snapshotRoot };
}
function enumerateFiles(root) {
  if (!fs.existsSync(root)) return [];
  const result = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) result.push(relative);
      else fail('G04B_PROVISION_SNAPSHOT_INVALID', 'source snapshot contains non-regular file entry', { path: relative });
    }
  };
  visit(root);
  return result.sort();
}
function sourceSnapshotInventory(model, snapshotRoot) {
  const actualPaths = enumerateFiles(snapshotRoot);
  const expectedPaths = model.files.map((entry) => entry.path);
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    fail('G04B_PROVISION_SNAPSHOT_PATH_SET_MISMATCH', 'source snapshot path set differs from closed packet', {
      missing: expectedPaths.filter((item) => !actualPaths.includes(item)),
      extra: actualPaths.filter((item) => !expectedPaths.includes(item))
    });
  }
  const files = model.files.map((entry) => {
    const file = inside(snapshotRoot, path.join(snapshotRoot, ...entry.path.split('/')), `snapshot file ${entry.path}`);
    const exact = ensureExactFile(file, entry.expectedBytes, entry.sha256, `snapshot file ${entry.path}`);
    return { path: entry.path, bytes: exact.bytes, sha256: exact.sha256 };
  });
  const payload = {
    schemaVersion: G04B_SOURCE_SNAPSHOT_FINGERPRINT_SCHEMA,
    sourceModelRepo: model.repo,
    sourceModelRevision: model.revision,
    files
  };
  const snapshotFingerprint = canonicalFingerprint(payload);
  return Object.freeze({
    schemaVersion: G04B_SOURCE_SNAPSHOT_INVENTORY_SCHEMA,
    sourceModelRepo: model.repo,
    sourceModelRevision: model.revision,
    files,
    snapshotFingerprint
  });
}

export function defaultProcessRunner(executable, argv, { cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, argv, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    const append = (prior, chunk, label) => {
      const next = Buffer.concat([prior, Buffer.from(chunk)]);
      if (next.length > MAX_CAPTURE_BYTES) {
        try { child.kill('SIGTERM'); } catch {}
        fail('G04B_PROVISION_PROCESS_OUTPUT_TOO_LARGE', `${label} exceeded bounded capture limit`);
      }
      return next;
    };
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk, 'stdout'); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk, 'stderr'); });
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8') }));
  });
}
function assertProcessSuccess(result, label) {
  if (result.signal || result.code !== 0) fail('G04B_PROVISION_PROCESS_FAILED', `${label} failed`, { code: result.code, signal: result.signal, stderr: String(result.stderr ?? '').slice(0, 4000) });
}
function parseJsonStdout(result, label) {
  assertProcessSuccess(result, label);
  const textValue = String(result.stdout ?? '').trim();
  try { return JSON.parse(textValue); }
  catch (error) { fail('G04B_PROVISION_QUALIFICATION_INVALID', `${label} returned invalid JSON`, { cause: error.message, output: textValue.slice(0, 1000) }); }
}
function qualificationScript() {
  return [
    'import importlib.metadata as m, json, platform, sys',
    'expected=json.loads(sys.argv[1])',
    'versions={name:m.version(name) for name in expected}',
    'import torch, transformers, accelerate, safetensors, numpy, torchvision, PIL',
    'payload={"pythonVersion":"%d.%d"%sys.version_info[:2],"platform":platform.system(),"architecture":platform.machine(),"packageVersions":versions,"torchVersion":torch.__version__,"mpsBuilt":bool(torch.backends.mps.is_built()),"mpsAvailable":bool(torch.backends.mps.is_available())}',
    'print(json.dumps(payload, sort_keys=True, separators=(",",":")))'
  ].join(';');
}
async function qualifyPython(executable, packages, processRunner, cwd) {
  const expected = Object.fromEntries(packages.map((entry) => [entry.project, entry.version]));
  const result = await processRunner(executable, ['-I', '-c', qualificationScript(), JSON.stringify(expected)], {
    cwd,
    env: { ...process.env, PYTHONNOUSERSITE: '1', PIP_NO_INDEX: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1' }
  });
  const payload = parseJsonStdout(result, 'Python qualification');
  if (payload.pythonVersion !== '3.12' || payload.platform !== 'Darwin' || payload.architecture !== 'arm64' || payload.mpsBuilt !== true || payload.mpsAvailable !== true) {
    fail('G04B_PROVISION_HOST_QUALIFICATION_FAILED', 'isolated Python runtime does not prove the first Mac MPS host contract', { payload });
  }
  if (JSON.stringify(canonicalize(payload.packageVersions)) !== JSON.stringify(canonicalize(expected))) {
    fail('G04B_PROVISION_DEPENDENCY_QUALIFICATION_FAILED', 'installed package versions differ from closed dependency lock', { expected, observed: payload.packageVersions });
  }
  return Object.freeze(payload);
}

async function materializeRuntime(packet, {
  downloadArtifact,
  extractRuntime,
  processRunner,
  home,
  artifactCacheRoot,
  wheelhouseRoot
}) {
  const runtime = packet.pythonRuntime;
  const lock = packet.pythonDependencyLock;
  const lockFingerprint = g04bDependencyLockFingerprint(lock);
  const runtimeFingerprint = runtimePacketFingerprint(packet);
  const finalRoot = inside(home, path.join(home, 'runtime', 'training', runtime.runtimeRef), 'Python runtime root');
  const receiptFile = path.join(finalRoot, '.vexlife-g04b-runtime.json');
  const expectedExecutable = inside(finalRoot, path.join(finalRoot, ...runtime.executableRelativePath.split('/')), 'Python executable');

  if (fs.existsSync(finalRoot)) {
    if (!fs.lstatSync(finalRoot).isDirectory() || fs.lstatSync(finalRoot).isSymbolicLink() || !fs.existsSync(receiptFile)) {
      fail('G04B_PROVISION_RUNTIME_COLLISION', 'existing runtime lacks exact reusable receipt', { finalRoot });
    }
    const receipt = loadJson(receiptFile, 'G04B_PROVISION_RUNTIME_RECEIPT_INVALID', 'runtime receipt');
    exactKeys(receipt, RUNTIME_RECEIPT_FIELDS, 'runtime receipt', 'G04B_PROVISION_RUNTIME_RECEIPT_INVALID');
    if (receipt.schemaVersion !== G04B_PROVISIONING_RUNTIME_RECEIPT_SCHEMA
        || receipt.runtimeRef !== runtime.runtimeRef
        || receipt.runtimePacketFingerprint !== runtimeFingerprint
        || receipt.dependencyLockFingerprint !== lockFingerprint
        || receipt.pythonExecutableRelativePath !== runtime.executableRelativePath
        || receipt.pythonVersion !== '3.12'
        || receipt.packageCount !== lock.packages.length
        || !HEX64.test(receipt.pythonExecutableSha256 ?? '')
        || !HEX64.test(receipt.pythonQualificationFingerprint ?? '')) {
      fail('G04B_PROVISION_RUNTIME_RECEIPT_INVALID', 'existing runtime receipt does not match closed packet');
    }
    const stat = fs.lstatSync(expectedExecutable);
    if (stat.isSymbolicLink() || !stat.isFile()) fail('G04B_PROVISION_PYTHON_EXECUTABLE_INVALID', 'reused Python executable must be regular non-symlink');
    const executableSha256 = sha256File(expectedExecutable);
    if (executableSha256 !== receipt.pythonExecutableSha256) fail('G04B_PROVISION_PYTHON_EXECUTABLE_INVALID', 'reused Python executable hash differs from receipt');
    const qualification = await qualifyPython(expectedExecutable, lock.packages, processRunner, finalRoot);
    const qualificationFingerprint = canonicalFingerprint(qualification);
    if (qualificationFingerprint !== receipt.pythonQualificationFingerprint) fail('G04B_PROVISION_RUNTIME_RECEIPT_INVALID', 'reused Python qualification differs from receipt');
    return Object.freeze({
      disposition: 'REUSED_VERIFIED_RUNTIME',
      pythonExecutablePath: expectedExecutable,
      pythonExecutableSha256: executableSha256,
      pythonQualificationFingerprint: qualificationFingerprint,
      packageInstallationExecuted: false
    });
  }

  const runtimeArchivePath = inside(artifactCacheRoot, path.join(artifactCacheRoot, runtime.filename), 'Python runtime archive');
  await downloadArtifact({
    url: runtime.url,
    expectedSha256: runtime.sha256,
    expectedBytes: runtime.expectedBytes,
    maxBytes: runtime.maxBytes,
    finalPath: runtimeArchivePath
  });

  fs.mkdirSync(wheelhouseRoot, { recursive: true });
  const lockFile = path.join(wheelhouseRoot, 'requirements.lock');
  const expectedLockBytes = requirementsLockBytes(lock);
  if (fs.existsSync(lockFile) && fs.readFileSync(lockFile, 'utf8') !== expectedLockBytes) fail('G04B_PROVISION_WHEELHOUSE_COLLISION', 'existing wheelhouse lock bytes differ');
  if (!fs.existsSync(lockFile)) fs.writeFileSync(lockFile, expectedLockBytes, { flag: 'wx', mode: 0o600 });
  for (const pkg of lock.packages) {
    const wheelPath = inside(wheelhouseRoot, path.join(wheelhouseRoot, pkg.filename), `wheel ${pkg.filename}`);
    await downloadArtifact({ url: pkg.url, expectedSha256: pkg.sha256, expectedBytes: pkg.expectedBytes, maxBytes: pkg.maxBytes, finalPath: wheelPath });
  }
  const expectedWheelhouse = [...lock.packages.map((entry) => entry.filename), 'requirements.lock'].sort();
  const actualWheelhouse = fs.readdirSync(wheelhouseRoot).sort();
  if (JSON.stringify(actualWheelhouse) !== JSON.stringify(expectedWheelhouse)) {
    fail('G04B_PROVISION_WHEELHOUSE_PATH_SET_MISMATCH', 'wheelhouse path set differs from closed lock', { expectedWheelhouse, actualWheelhouse });
  }
  for (const pkg of lock.packages) ensureExactFile(path.join(wheelhouseRoot, pkg.filename), pkg.expectedBytes, pkg.sha256, `wheel ${pkg.filename}`);

  const staging = `${finalRoot}.partial-${g04bProvisioningPacketFingerprint(packet).slice(0, 16)}`;
  if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true, mode: 0o700 });
  try {
    await extractRuntime({ archivePath: runtimeArchivePath, stagingRoot: staging, runtimeArtifact: runtime });
    const stagingExecutable = inside(staging, path.join(staging, ...runtime.executableRelativePath.split('/')), 'staged Python executable');
    if (!fs.existsSync(stagingExecutable)) fail('G04B_PROVISION_PYTHON_EXECUTABLE_INVALID', 'runtime archive did not materialize expected Python executable');
    const stagingStat = fs.lstatSync(stagingExecutable);
    if (stagingStat.isSymbolicLink() || !stagingStat.isFile()) fail('G04B_PROVISION_PYTHON_EXECUTABLE_INVALID', 'staged Python executable must be regular non-symlink');

    const installEnv = {
      ...process.env,
      PYTHONNOUSERSITE: '1',
      PIP_NO_INDEX: '1',
      PIP_DISABLE_PIP_VERSION_CHECK: '1',
      PIP_REQUIRE_VIRTUALENV: '0'
    };
    const install = await processRunner(stagingExecutable, [
      '-I', '-m', 'pip', 'install', '--no-index', '--no-deps', '--no-cache-dir', '--disable-pip-version-check',
      '--require-hashes', '--find-links', wheelhouseRoot, '-r', lockFile
    ], { cwd: staging, env: installEnv });
    assertProcessSuccess(install, 'offline dependency installation');
    const pipCheck = await processRunner(stagingExecutable, ['-I', '-m', 'pip', 'check'], { cwd: staging, env: installEnv });
    assertProcessSuccess(pipCheck, 'offline dependency consistency check');

    fs.mkdirSync(path.dirname(finalRoot), { recursive: true });
    fs.renameSync(staging, finalRoot);
    const finalExecutable = inside(finalRoot, path.join(finalRoot, ...runtime.executableRelativePath.split('/')), 'final Python executable');
    const finalStat = fs.lstatSync(finalExecutable);
    if (finalStat.isSymbolicLink() || !finalStat.isFile()) fail('G04B_PROVISION_PYTHON_EXECUTABLE_INVALID', 'final Python executable must be regular non-symlink');
    const executableSha256 = sha256File(finalExecutable);
    const qualification = await qualifyPython(finalExecutable, lock.packages, processRunner, finalRoot);
    const qualificationFingerprint = canonicalFingerprint(qualification);
    writeAtomic(receiptFile, {
      schemaVersion: G04B_PROVISIONING_RUNTIME_RECEIPT_SCHEMA,
      runtimeRef: runtime.runtimeRef,
      runtimePacketFingerprint: runtimeFingerprint,
      dependencyLockFingerprint: lockFingerprint,
      pythonExecutableRelativePath: runtime.executableRelativePath,
      pythonExecutableSha256: executableSha256,
      pythonVersion: '3.12',
      packageCount: lock.packages.length,
      pythonQualificationFingerprint: qualificationFingerprint
    });
    return Object.freeze({
      disposition: 'MATERIALIZED_VERIFIED_RUNTIME',
      pythonExecutablePath: finalExecutable,
      pythonExecutableSha256: executableSha256,
      pythonQualificationFingerprint: qualificationFingerprint,
      packageInstallationExecuted: true
    });
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    if (fs.existsSync(finalRoot) && !fs.existsSync(receiptFile)) fs.rmSync(finalRoot, { recursive: true, force: true });
    throw error;
  }
}

async function materializeSourceModel(packet, { downloadArtifact, home }) {
  const { cacheRoot, snapshotRoot } = snapshotRootFor(home, packet.sourceModel);
  fs.mkdirSync(snapshotRoot, { recursive: true });
  const beforePaths = enumerateFiles(snapshotRoot);
  const expectedPaths = packet.sourceModel.files.map((entry) => entry.path);
  const extras = beforePaths.filter((item) => !expectedPaths.includes(item));
  if (extras.length) fail('G04B_PROVISION_SNAPSHOT_PATH_SET_MISMATCH', 'preexisting source snapshot has unbound extra paths', { extras });
  const dispositions = [];
  for (const entry of packet.sourceModel.files) {
    const destination = inside(snapshotRoot, path.join(snapshotRoot, ...entry.path.split('/')), `snapshot file ${entry.path}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const outcome = await downloadArtifact({
      url: entry.url,
      expectedSha256: entry.sha256,
      expectedBytes: entry.expectedBytes,
      maxBytes: entry.maxBytes,
      finalPath: destination
    });
    dispositions.push({ path: entry.path, disposition: outcome.disposition });
  }
  const inventory = sourceSnapshotInventory(packet.sourceModel, snapshotRoot);
  return Object.freeze({ cacheRoot, snapshotRoot, inventory, dispositions });
}

export async function executeG04BProvisioningWorker(packet, {
  downloadArtifact,
  extractRuntime,
  processRunner = defaultProcessRunner,
  workerRoot = process.env.VEX_WORKER_ROOT ?? null
} = {}) {
  if (typeof downloadArtifact !== 'function') fail('G04B_PROVISION_DOWNLOADER_REQUIRED', 'downloadArtifact is required');
  if (typeof extractRuntime !== 'function') fail('G04B_PROVISION_EXTRACTOR_REQUIRED', 'extractRuntime is required');
  const validated = validateG04BProvisioningPacket(packet, { verifyNodeExecutable: true });
  if (workerRoot) verifyG04BProvisioningEnvelope(validated, workerRoot);
  const home = canonicalDirectory(validated.vexHomeRoot, 'vexHomeRoot');
  const artifactCacheRoot = inside(home, path.join(home, 'runtime', 'artifacts', 'g04b-provisioning'), 'artifact cache root');
  const lockFingerprint = g04bDependencyLockFingerprint(validated.pythonDependencyLock);
  const wheelhouseRoot = inside(home, path.join(home, 'runtime', 'wheelhouse', lockFingerprint), 'wheelhouse root');
  fs.mkdirSync(artifactCacheRoot, { recursive: true });

  const runtime = await materializeRuntime(validated, {
    downloadArtifact, extractRuntime, processRunner, home, artifactCacheRoot, wheelhouseRoot
  });
  const model = await materializeSourceModel(validated, { downloadArtifact, home });
  const result = Object.freeze({
    schemaVersion: G04B_PROVISIONING_RESULT_SCHEMA,
    workerRef: validated.workerRef,
    workRef: validated.workRef,
    purposeRef: validated.purposeRef,
    resultContractRef: validated.resultContractRef,
    resultRef: validated.resultRef,
    packetFingerprint: g04bProvisioningPacketFingerprint(validated),
    hostRef: validated.hostRef,
    nodeBindingRef: validated.nodeRuntimeBinding.bindingRef,
    nodeExecutableRef: validated.nodeRuntimeBinding.executableRef,
    nodeExecutableSha256: validated.nodeRuntimeBinding.executableSha256,
    expectedHardwareProfileRef: validated.expectedHardwareProfileRef,
    vexHomeRoot: home,
    pythonRuntimeRef: validated.pythonRuntime.runtimeRef,
    pythonExecutablePath: runtime.pythonExecutablePath,
    pythonExecutableSha256: runtime.pythonExecutableSha256,
    pythonVersion: '3.12',
    dependencyLockFingerprint: lockFingerprint,
    packageCount: validated.pythonDependencyLock.packages.length,
    pythonQualificationFingerprint: runtime.pythonQualificationFingerprint,
    huggingFaceHubCacheRoot: model.cacheRoot,
    sourceSnapshotRoot: model.snapshotRoot,
    sourceSnapshotInventory: model.inventory,
    sourceModelSnapshotFingerprint: model.inventory.snapshotFingerprint,
    runtimeDisposition: runtime.disposition,
    modelArtifactDispositions: model.dispositions,
    modelDownloadPerformed: model.dispositions.some((entry) => entry.disposition !== 'REUSED_VERIFIED'),
    packageInstallationExecuted: runtime.packageInstallationExecuted,
    trainingActuallyExecuted: false,
    optimizerStepPerformed: false,
    activationPerformed: false,
    publicUploadPerformed: false
  });
  if (workerRoot) writeAtomic(path.join(canonicalDirectory(workerRoot, 'workerRoot'), 'g04b-provisioning-result.json'), result);
  return verifyG04BProvisioningResult(result, validated);
}

export function verifyG04BProvisioningResult(result, packet) {
  const validated = validateG04BProvisioningPacket(packet);
  exactKeys(result, RESULT_FIELDS, 'provisioning result', 'G04B_PROVISION_RESULT_INVALID');
  if (result.schemaVersion !== G04B_PROVISIONING_RESULT_SCHEMA) fail('G04B_PROVISION_RESULT_INVALID', 'provisioning result schema is not current');
  for (const [field, expected] of [
    ['workerRef', validated.workerRef], ['workRef', validated.workRef], ['purposeRef', validated.purposeRef],
    ['resultContractRef', validated.resultContractRef], ['resultRef', validated.resultRef],
    ['packetFingerprint', g04bProvisioningPacketFingerprint(validated)], ['hostRef', validated.hostRef],
    ['nodeBindingRef', validated.nodeRuntimeBinding.bindingRef], ['nodeExecutableRef', validated.nodeRuntimeBinding.executableRef],
    ['nodeExecutableSha256', validated.nodeRuntimeBinding.executableSha256],
    ['expectedHardwareProfileRef', validated.expectedHardwareProfileRef], ['vexHomeRoot', path.resolve(validated.vexHomeRoot)],
    ['pythonRuntimeRef', validated.pythonRuntime.runtimeRef], ['pythonVersion', '3.12'],
    ['dependencyLockFingerprint', g04bDependencyLockFingerprint(validated.pythonDependencyLock)],
    ['packageCount', validated.pythonDependencyLock.packages.length], ['sourceModelSnapshotFingerprint', result.sourceSnapshotInventory?.snapshotFingerprint]
  ]) {
    if (result[field] !== expected) fail('G04B_PROVISION_RESULT_IDENTITY_MISMATCH', `provisioning result ${field} does not match packet`, { expected, observed: result[field] });
  }
  if (!HEX64.test(result.pythonExecutableSha256 ?? '') || !HEX64.test(result.pythonQualificationFingerprint ?? '') || !HEX64.test(result.sourceModelSnapshotFingerprint ?? '')) {
    fail('G04B_PROVISION_RESULT_INVALID', 'provisioning result fingerprints are not exact SHA-256');
  }
  if (!['MATERIALIZED_VERIFIED_RUNTIME', 'REUSED_VERIFIED_RUNTIME'].includes(result.runtimeDisposition)) fail('G04B_PROVISION_RESULT_INVALID', 'runtimeDisposition is invalid');
  if (!Array.isArray(result.modelArtifactDispositions) || result.modelArtifactDispositions.length !== validated.sourceModel.files.length) fail('G04B_PROVISION_RESULT_INVALID', 'modelArtifactDispositions do not cover the closed snapshot');
  if (result.trainingActuallyExecuted !== false || result.optimizerStepPerformed !== false || result.activationPerformed !== false || result.publicUploadPerformed !== false) {
    fail('G04B_PROVISION_AUTHORITY_COLLAPSE', 'provisioning result crossed a held training/activation/publication boundary');
  }
  if (typeof result.modelDownloadPerformed !== 'boolean' || typeof result.packageInstallationExecuted !== 'boolean') fail('G04B_PROVISION_RESULT_INVALID', 'provisioning effect booleans are invalid');
  if (!result.sourceSnapshotInventory || result.sourceSnapshotInventory.schemaVersion !== G04B_SOURCE_SNAPSHOT_INVENTORY_SCHEMA
      || result.sourceSnapshotInventory.sourceModelRepo !== validated.sourceModel.repo
      || result.sourceSnapshotInventory.sourceModelRevision !== validated.sourceModel.revision
      || result.sourceSnapshotInventory.snapshotFingerprint !== result.sourceModelSnapshotFingerprint) {
    fail('G04B_PROVISION_RESULT_IDENTITY_MISMATCH', 'source snapshot inventory does not match exact model identity');
  }
  return Object.freeze(structuredClone(result));
}
