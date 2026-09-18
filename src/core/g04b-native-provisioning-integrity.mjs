import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  G04B_PROVISIONING_RUNTIME_RECEIPT_SCHEMA,
  defaultProcessRunner,
  executeG04BProvisioningWorker as executePrimitive,
  g04bDependencyLockFingerprint,
  validateG04BProvisioningPacket,
  verifyG04BProvisioningEnvelope,
  verifyG04BProvisioningResult
} from './g04b-native-provisioning-worker.mjs';
import {
  G04B_SOURCE_SNAPSHOT_FINGERPRINT_SCHEMA,
  G04B_SOURCE_SNAPSHOT_INVENTORY_SCHEMA
} from './g04b-native-training-worker.mjs';
import { consumeNativeWorkerResult } from './native-worker-supervisor.mjs';

const HEX64 = /^[0-9a-f]{64}$/u;
const LOCK_NAME = 'g04b-preprovision-first-proof.lock';
const RUNTIME_RECEIPT_FIELDS = Object.freeze([
  'schemaVersion', 'runtimeRef', 'runtimePacketFingerprint', 'dependencyLockFingerprint',
  'pythonExecutableRelativePath', 'pythonExecutableSha256', 'pythonVersion', 'packageCount',
  'pythonQualificationFingerprint'
]);

export class G04BProvisioningIntegrityError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'G04BProvisioningIntegrityError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new G04BProvisioningIntegrityError(code, message, details);
}
function exactKeys(value, keys, label, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${label} must be one object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(code, `${label} fields are not exact`, { actual, expected });
}
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}
function fingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}
function sha256File(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | Number(fs.constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) fail('G04B_PROVISION_STATE_FILE_INVALID', 'materialized file must be regular', { file });
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
    return hash.digest('hex');
  } finally { fs.closeSync(fd); }
}
function canonicalHome(raw) {
  if (typeof raw !== 'string' || !path.isAbsolute(raw)) fail('G04B_PROVISION_STATE_ROOT_INVALID', 'vexHomeRoot must be absolute');
  const requested = path.resolve(raw);
  if (!fs.existsSync(requested)) fail('G04B_PROVISION_STATE_ROOT_INVALID', 'vexHomeRoot does not exist', { requested });
  const stat = fs.lstatSync(requested);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('G04B_PROVISION_STATE_ROOT_INVALID', 'vexHomeRoot must be a real directory', { requested });
  const real = fs.realpathSync.native(requested);
  if (real !== requested) fail('G04B_PROVISION_STATE_ROOT_INVALID', 'vexHomeRoot must use canonical filesystem identity', { requested, real });
  return real;
}
function inside(root, candidate, label) {
  const target = path.resolve(candidate);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('G04B_PROVISION_STATE_BOUNDARY_ESCAPE', `${label} escapes admitted Vex Home`, { root, target });
  }
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) continue;
    if (fs.lstatSync(cursor).isSymbolicLink()) fail('G04B_PROVISION_STATE_BOUNDARY_ESCAPE', `${label} traverses a symlink`, { path: cursor });
  }
  return target;
}
function readJsonNoFollow(file, label) {
  const flags = fs.constants.O_RDONLY | Number(fs.constants.O_NOFOLLOW ?? 0);
  let fd;
  try {
    fd = fs.openSync(file, flags);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) fail('G04B_PROVISION_STATE_FILE_INVALID', `${label} must be one regular file`, { file });
    return JSON.parse(fs.readFileSync(fd, 'utf8'));
  } catch (error) {
    if (error instanceof G04BProvisioningIntegrityError) throw error;
    fail('G04B_PROVISION_STATE_FILE_INVALID', `${label} could not be read safely`, { file, cause: error?.message ?? String(error) });
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
}
function expectedPaths(packet, home) {
  const runtimeRoot = inside(home, path.join(home, 'runtime', 'training', packet.pythonRuntime.runtimeRef), 'Python runtime root');
  const pythonExecutablePath = inside(runtimeRoot, path.join(runtimeRoot, ...packet.pythonRuntime.executableRelativePath.split('/')), 'Python executable');
  const huggingFaceHubCacheRoot = inside(home, path.join(home, 'models', 'huggingface', 'hub'), 'Hugging Face cache root');
  const sourceSnapshotRoot = inside(
    huggingFaceHubCacheRoot,
    path.join(huggingFaceHubCacheRoot, `models--${packet.sourceModel.repo.replaceAll('/', '--')}`, 'snapshots', packet.sourceModel.revision),
    'source snapshot root'
  );
  return { runtimeRoot, pythonExecutablePath, huggingFaceHubCacheRoot, sourceSnapshotRoot };
}
function expectedSnapshotInventory(packet) {
  const files = packet.sourceModel.files.map((entry) => ({ path: entry.path, bytes: entry.expectedBytes, sha256: entry.sha256 }));
  const payload = {
    schemaVersion: G04B_SOURCE_SNAPSHOT_FINGERPRINT_SCHEMA,
    sourceModelRepo: packet.sourceModel.repo,
    sourceModelRevision: packet.sourceModel.revision,
    files
  };
  return Object.freeze({
    schemaVersion: G04B_SOURCE_SNAPSHOT_INVENTORY_SCHEMA,
    sourceModelRepo: packet.sourceModel.repo,
    sourceModelRevision: packet.sourceModel.revision,
    files,
    snapshotFingerprint: fingerprint(payload)
  });
}
function enumerateRegularFiles(root) {
  if (!fs.existsSync(root)) return [];
  const result = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) result.push(relative);
      else fail('G04B_PROVISION_STATE_SNAPSHOT_INVALID', 'materialized tree contains a non-regular filesystem entry', { path: relative });
    }
  };
  walk(root);
  return result.sort();
}
function observeSnapshot(packet, root) {
  if (!fs.existsSync(root) || !fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) {
    fail('G04B_PROVISION_STATE_SNAPSHOT_INVALID', 'source snapshot root is not a real directory', { root });
  }
  const expected = expectedSnapshotInventory(packet);
  const paths = enumerateRegularFiles(root);
  const expectedFilePaths = expected.files.map((entry) => entry.path);
  if (JSON.stringify(paths) !== JSON.stringify(expectedFilePaths)) {
    fail('G04B_PROVISION_STATE_SNAPSHOT_PATH_SET_MISMATCH', 'materialized snapshot path set differs from packet', {
      missing: expectedFilePaths.filter((item) => !paths.includes(item)),
      extra: paths.filter((item) => !expectedFilePaths.includes(item))
    });
  }
  for (const entry of expected.files) {
    const file = inside(root, path.join(root, ...entry.path.split('/')), `snapshot file ${entry.path}`);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) fail('G04B_PROVISION_STATE_SNAPSHOT_INVALID', 'snapshot file must be regular non-symlink', { path: entry.path });
    if (stat.size !== entry.bytes) fail('G04B_PROVISION_STATE_SNAPSHOT_MISMATCH', 'snapshot byte size changed after provisioning', { path: entry.path, expected: entry.bytes, observed: stat.size });
    const observed = sha256File(file);
    if (observed !== entry.sha256) fail('G04B_PROVISION_STATE_SNAPSHOT_MISMATCH', 'snapshot SHA-256 changed after provisioning', { path: entry.path, expected: entry.sha256, observed });
  }
  return expected;
}
function runtimePacketFingerprint(packet) {
  return fingerprint({
    schemaVersion: 'vexlife.g04b-provisioning-runtime-binding/v1',
    hostRef: packet.hostRef,
    expectedHardwareProfileRef: packet.expectedHardwareProfileRef,
    pythonRuntime: packet.pythonRuntime,
    pythonDependencyLock: packet.pythonDependencyLock
  });
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
async function requalifyPython(executable, packet, processRunner, cwd) {
  const expected = Object.fromEntries(packet.pythonDependencyLock.packages.map((entry) => [entry.project, entry.version]));
  const result = await processRunner(executable, ['-I', '-c', qualificationScript(), JSON.stringify(expected)], {
    cwd,
    env: { ...process.env, PYTHONNOUSERSITE: '1', PIP_NO_INDEX: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1' }
  });
  if (result.signal || result.code !== 0) fail('G04B_PROVISION_STATE_QUALIFICATION_FAILED', 'materialized Python requalification failed', { code: result.code, signal: result.signal, stderr: String(result.stderr ?? '').slice(0, 4000) });
  let payload;
  try { payload = JSON.parse(String(result.stdout ?? '').trim()); }
  catch (error) { fail('G04B_PROVISION_STATE_QUALIFICATION_FAILED', 'materialized Python requalification returned invalid JSON', { cause: error.message }); }
  if (payload.pythonVersion !== '3.12' || payload.platform !== 'Darwin' || payload.architecture !== 'arm64' || payload.mpsBuilt !== true || payload.mpsAvailable !== true) {
    fail('G04B_PROVISION_STATE_QUALIFICATION_FAILED', 'materialized Python no longer proves first Mac MPS host', { payload });
  }
  if (JSON.stringify(canonicalize(payload.packageVersions)) !== JSON.stringify(canonicalize(expected))) {
    fail('G04B_PROVISION_STATE_QUALIFICATION_FAILED', 'materialized package versions differ from exact lock', { expected, observed: payload.packageVersions });
  }
  return Object.freeze(payload);
}
function verifyRuntimeReceipt(packet, result, paths) {
  const receiptPath = inside(paths.runtimeRoot, path.join(paths.runtimeRoot, '.vexlife-g04b-runtime.json'), 'runtime receipt');
  const receipt = readJsonNoFollow(receiptPath, 'runtime receipt');
  exactKeys(receipt, RUNTIME_RECEIPT_FIELDS, 'runtime receipt', 'G04B_PROVISION_STATE_RUNTIME_RECEIPT_INVALID');
  const checks = [
    ['schemaVersion', G04B_PROVISIONING_RUNTIME_RECEIPT_SCHEMA],
    ['runtimeRef', packet.pythonRuntime.runtimeRef],
    ['runtimePacketFingerprint', runtimePacketFingerprint(packet)],
    ['dependencyLockFingerprint', g04bDependencyLockFingerprint(packet.pythonDependencyLock)],
    ['pythonExecutableRelativePath', packet.pythonRuntime.executableRelativePath],
    ['pythonExecutableSha256', result.pythonExecutableSha256],
    ['pythonVersion', '3.12'],
    ['packageCount', packet.pythonDependencyLock.packages.length],
    ['pythonQualificationFingerprint', result.pythonQualificationFingerprint]
  ];
  for (const [field, expected] of checks) {
    if (receipt[field] !== expected) fail('G04B_PROVISION_STATE_RUNTIME_RECEIPT_INVALID', `runtime receipt ${field} differs from packet/result`, { expected, observed: receipt[field] });
  }
  return receipt;
}
function exactModelDispositions(packet, result) {
  if (!Array.isArray(result.modelArtifactDispositions) || result.modelArtifactDispositions.length !== packet.sourceModel.files.length) {
    fail('G04B_PROVISION_STATE_RESULT_INVALID', 'model artifact dispositions do not cover exact source snapshot');
  }
  const allowed = new Set(['REUSED_VERIFIED', 'DOWNLOADED_AND_VERIFIED', 'RESUMED_AND_VERIFIED']);
  for (let index = 0; index < packet.sourceModel.files.length; index += 1) {
    const observed = result.modelArtifactDispositions[index];
    const expectedPath = packet.sourceModel.files[index].path;
    if (!observed || Object.keys(observed).sort().join(',') !== 'disposition,path' || observed.path !== expectedPath || !allowed.has(observed.disposition)) {
      fail('G04B_PROVISION_STATE_RESULT_INVALID', 'model artifact disposition is not exact', { index, expectedPath, observed });
    }
  }
  const derivedDownload = result.modelArtifactDispositions.some((entry) => entry.disposition !== 'REUSED_VERIFIED');
  if (result.modelDownloadPerformed !== derivedDownload) fail('G04B_PROVISION_STATE_RESULT_INVALID', 'modelDownloadPerformed does not match artifact dispositions', { expected: derivedDownload, observed: result.modelDownloadPerformed });
}

export async function verifyG04BProvisionedState(result, packet, { processRunner = defaultProcessRunner } = {}) {
  const validatedPacket = validateG04BProvisioningPacket(packet);
  const validatedResult = verifyG04BProvisioningResult(result, validatedPacket);
  const home = canonicalHome(validatedPacket.vexHomeRoot);
  const paths = expectedPaths(validatedPacket, home);
  for (const [field, expected] of [
    ['vexHomeRoot', home],
    ['pythonExecutablePath', paths.pythonExecutablePath],
    ['huggingFaceHubCacheRoot', paths.huggingFaceHubCacheRoot],
    ['sourceSnapshotRoot', paths.sourceSnapshotRoot]
  ]) {
    if (validatedResult[field] !== expected) fail('G04B_PROVISION_STATE_RESULT_INVALID', `provisioning result ${field} differs from deterministic packet path`, { expected, observed: validatedResult[field] });
  }
  if (!fs.existsSync(paths.pythonExecutablePath)) fail('G04B_PROVISION_STATE_PYTHON_INVALID', 'materialized Python executable is missing');
  const pythonStat = fs.lstatSync(paths.pythonExecutablePath);
  if (pythonStat.isSymbolicLink() || !pythonStat.isFile()) fail('G04B_PROVISION_STATE_PYTHON_INVALID', 'materialized Python executable must be regular non-symlink');
  const pythonSha256 = sha256File(paths.pythonExecutablePath);
  if (pythonSha256 !== validatedResult.pythonExecutableSha256) fail('G04B_PROVISION_STATE_PYTHON_INVALID', 'materialized Python executable SHA-256 differs from result', { expected: validatedResult.pythonExecutableSha256, observed: pythonSha256 });

  const expectedInventory = observeSnapshot(validatedPacket, paths.sourceSnapshotRoot);
  if (JSON.stringify(canonicalize(validatedResult.sourceSnapshotInventory)) !== JSON.stringify(canonicalize(expectedInventory))) {
    fail('G04B_PROVISION_STATE_RESULT_INVALID', 'returned sourceSnapshotInventory is not the exact packet-derived inventory');
  }
  if (validatedResult.sourceModelSnapshotFingerprint !== expectedInventory.snapshotFingerprint) {
    fail('G04B_PROVISION_STATE_RESULT_INVALID', 'returned snapshot fingerprint is not independently derived from exact packet inventory', { expected: expectedInventory.snapshotFingerprint, observed: validatedResult.sourceModelSnapshotFingerprint });
  }
  exactModelDispositions(validatedPacket, validatedResult);
  const expectedInstall = validatedResult.runtimeDisposition === 'MATERIALIZED_VERIFIED_RUNTIME';
  if (validatedResult.packageInstallationExecuted !== expectedInstall) {
    fail('G04B_PROVISION_STATE_RESULT_INVALID', 'packageInstallationExecuted does not match runtimeDisposition', { expected: expectedInstall, observed: validatedResult.packageInstallationExecuted });
  }
  if (!HEX64.test(validatedResult.pythonQualificationFingerprint ?? '')) fail('G04B_PROVISION_STATE_RESULT_INVALID', 'Python qualification fingerprint is invalid');
  verifyRuntimeReceipt(validatedPacket, validatedResult, paths);
  const qualification = await requalifyPython(paths.pythonExecutablePath, validatedPacket, processRunner, paths.runtimeRoot);
  const qualificationFingerprint = fingerprint(qualification);
  if (qualificationFingerprint !== validatedResult.pythonQualificationFingerprint) {
    fail('G04B_PROVISION_STATE_QUALIFICATION_FAILED', 'materialized Python qualification fingerprint differs from result', { expected: validatedResult.pythonQualificationFingerprint, observed: qualificationFingerprint });
  }
  return Object.freeze({ result: validatedResult, qualification, paths, snapshotInventory: expectedInventory });
}

function lockParent(home) {
  const parent = inside(home, path.join(home, 'runtime', '.locks'), 'G04B provisioning lock parent');
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(parent).isSymbolicLink() || !fs.lstatSync(parent).isDirectory()) fail('G04B_PROVISION_LOCK_INVALID', 'lock parent must be a real directory');
  return parent;
}
async function withProvisioningLock(packet, fn) {
  const home = canonicalHome(packet.vexHomeRoot);
  const parent = lockParent(home);
  const lock = inside(parent, path.join(parent, LOCK_NAME), 'G04B provisioning lock');
  try {
    fs.mkdirSync(lock, { mode: 0o700 });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      let owner = null;
      try { owner = readJsonNoFollow(path.join(lock, 'owner.json'), 'provisioning lock owner'); } catch {}
      fail('G04B_PROVISION_RUNTIME_LOCKED', 'another G04B pre-provisioning operation owns the first-proof materialization lock', { lock, owner });
    }
    throw error;
  }
  const owner = {
    schemaVersion: 'vexlife.g04b-provisioning-lock-owner/v1',
    workerRef: packet.workerRef,
    workRef: packet.workRef,
    runtimeRef: packet.pythonRuntime.runtimeRef,
    sourceModelRepo: packet.sourceModel.repo,
    sourceModelRevision: packet.sourceModel.revision,
    packetFingerprint: fingerprint(validateG04BProvisioningPacket(packet)),
    pid: process.pid,
    acquiredAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(lock, 'owner.json'), `${JSON.stringify(owner, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  try { return await fn(home); }
  finally { fs.rmSync(lock, { recursive: true, force: true }); }
}

function snapshotPartialParkingRoot(packet, home) {
  const root = inside(
    home,
    path.join(
      home,
      'runtime',
      'artifacts',
      'g04b-provisioning-partials',
      `models--${packet.sourceModel.repo.replaceAll('/', '--')}`,
      packet.sourceModel.revision
    ),
    'snapshot partial parking root'
  );
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(root).isSymbolicLink() || !fs.lstatSync(root).isDirectory()) fail('G04B_PROVISION_PARTIAL_INVALID', 'snapshot partial parking root must be a real directory');
  return root;
}
function validatePartialFile(file, entry, label) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) fail('G04B_PROVISION_PARTIAL_INVALID', `${label} must be a regular non-symlink file`, { file });
  if (stat.size > entry.maxBytes || stat.size > entry.expectedBytes) {
    fail('G04B_PROVISION_PARTIAL_INVALID', `${label} exceeds packet size bounds`, { file, bytes: stat.size, expectedBytes: entry.expectedBytes, maxBytes: entry.maxBytes });
  }
}
function parkExpectedSnapshotPartials(packet, home) {
  const paths = expectedPaths(packet, home);
  const parkingRoot = snapshotPartialParkingRoot(packet, home);
  const expectedParkedPaths = packet.sourceModel.files.map((entry) => `${entry.path}.partial`);
  const parkedExisting = enumerateRegularFiles(parkingRoot);
  const parkedExtras = parkedExisting.filter((item) => !expectedParkedPaths.includes(item));
  if (parkedExtras.length) fail('G04B_PROVISION_PARTIAL_INVALID', 'partial parking root contains unbound paths', { extras: parkedExtras });
  const parkedByFinal = new Map();
  for (const entry of packet.sourceModel.files) {
    const finalPath = inside(paths.sourceSnapshotRoot, path.join(paths.sourceSnapshotRoot, ...entry.path.split('/')), `snapshot file ${entry.path}`);
    const sourcePartial = `${finalPath}.partial`;
    const relativeParked = `${entry.path}.partial`;
    const parked = inside(parkingRoot, path.join(parkingRoot, ...relativeParked.split('/')), `parked snapshot partial ${entry.path}`);
    if (fs.existsSync(sourcePartial)) {
      validatePartialFile(sourcePartial, entry, `snapshot partial ${entry.path}`);
      if (fs.existsSync(parked)) fail('G04B_PROVISION_PARTIAL_COLLISION', 'same expected snapshot partial exists in both active and parked locations', { path: entry.path });
      fs.mkdirSync(path.dirname(parked), { recursive: true });
      fs.renameSync(sourcePartial, parked);
    }
    if (fs.existsSync(parked)) {
      validatePartialFile(parked, entry, `parked snapshot partial ${entry.path}`);
      parkedByFinal.set(path.resolve(finalPath), parked);
    }
  }
  return {
    wrap(downloadArtifact) {
      if (typeof downloadArtifact !== 'function') fail('G04B_PROVISION_DOWNLOADER_REQUIRED', 'downloadArtifact is required');
      return async (request) => {
        const finalPath = path.resolve(request.finalPath);
        const parked = parkedByFinal.get(finalPath);
        if (parked && fs.existsSync(parked)) {
          const activePartial = `${finalPath}.partial`;
          if (fs.existsSync(activePartial)) fail('G04B_PROVISION_PARTIAL_COLLISION', 'active snapshot partial unexpectedly exists while parked copy is present', { finalPath });
          fs.mkdirSync(path.dirname(activePartial), { recursive: true });
          fs.renameSync(parked, activePartial);
        }
        return downloadArtifact(request);
      };
    },
    cleanupEmpty() {
      if (!fs.existsSync(parkingRoot)) return;
      const remaining = enumerateRegularFiles(parkingRoot);
      if (remaining.length === 0) fs.rmSync(parkingRoot, { recursive: true, force: true });
    }
  };
}

export async function executeVerifiedG04BProvisioningWorker(packet, options = {}) {
  const validated = validateG04BProvisioningPacket(packet, { verifyNodeExecutable: true });
  return withProvisioningLock(validated, async (home) => {
    const partials = parkExpectedSnapshotPartials(validated, home);
    try {
      const result = await executePrimitive(validated, {
        ...options,
        downloadArtifact: partials.wrap(options.downloadArtifact)
      });
      const verified = await verifyG04BProvisionedState(result, validated, { processRunner: options.processRunner ?? defaultProcessRunner });
      return verified.result;
    } finally {
      partials.cleanupEmpty();
    }
  });
}

export async function consumeVerifiedG04BProvisioningResult(packet, workerRoot, {
  processRunner = defaultProcessRunner,
  humanSummary = 'G04B exact runtime/model pre-provisioning completed; training remains separately held.'
} = {}) {
  const validated = validateG04BProvisioningPacket(packet);
  return withProvisioningLock(validated, async () => {
    const envelope = verifyG04BProvisioningEnvelope(validated, workerRoot);
    const root = envelope.workerRoot;
    const resultPath = path.join(root, 'g04b-provisioning-result.json');
    const raw = readJsonNoFollow(resultPath, 'G04B provisioning result');
    const { result } = await verifyG04BProvisionedState(raw, validated, { processRunner });
    return consumeNativeWorkerResult(root, {
      resultRef: validated.resultRef,
      machineCompletionRecord: result,
      humanSummary
    });
  });
}
