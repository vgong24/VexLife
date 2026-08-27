import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const NATIVE_WORKER_MANIFEST_SCHEMA = 'vexlife.native-worker-manifest/v1';
export const NATIVE_WORKER_BINDING_SCHEMA = 'vexlife.native-worker-runtime-binding/v1';
export const NATIVE_WORKER_RECEIPT_SCHEMA = 'vexlife.native-worker-receipt/v1';
export const NATIVE_WORKER_COMPLETION_SCHEMA = 'vexlife.native-worker-completion/v1';

export const NATIVE_WORKER_STATES = Object.freeze([
  'NOT_ACTIVE',
  'STANDING_BY',
  'STARTING',
  'WORKING',
  'WAITING',
  'PAUSE_REQUESTED',
  'PAUSED',
  'CANCEL_REQUESTED',
  'CANCELLED',
  'WRAPPING_UP',
  'DONE',
  'NEEDS_ATTENTION'
]);

const SCHEDULING_CLASSES = Object.freeze(['INTERACTIVE', 'EXPEDITE', 'RECOVERY', 'NORMAL', 'BACKGROUND']);
const PAUSE_MODES = Object.freeze(['NONE', 'CHECKPOINT_BOUND_COOPERATIVE']);
const CONTROL_ACTIONS = Object.freeze(['PAUSE', 'CANCEL']);
const REF_RE = /^[a-z0-9](?:[a-z0-9._-]{0,190}[a-z0-9])?$/u;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const MAX_HUMAN_TEXT = 480;
const MUTATION_LOCK_WAIT_MS = 10;
const MUTATION_LOCK_TIMEOUT_MS = 2000;
const SLEEP_WORD = new Int32Array(new SharedArrayBuffer(4));
const MANIFEST_FIELDS = Object.freeze([
  'schemaVersion', 'workerRef', 'workRef', 'purposeRef', 'humanLabel',
  'executableRef', 'argv', 'sourceRootRelativeWorkingDirectory',
  'schedulingClass', 'pauseMode', 'resultContractRef', 'executionAuthorityRef'
]);
const BINDING_FIELDS = Object.freeze([
  'schemaVersion', 'bindingRef', 'executableRef', 'executablePath',
  'executableSha256', 'hostRef', 'observedAt'
]);

export class NativeWorkerSupervisorError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'NativeWorkerSupervisorError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new NativeWorkerSupervisorError(code, message, details);
}

function requireObject(value, label, code = 'NWS_INPUT_INVALID') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${label} must be one object`);
}
function exactKeys(value, keys, label, code = 'NWS_INPUT_INVALID') {
  requireObject(value, label, code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(code, `${label} fields are not exact`, { actual, expected });
}
function ref(value, label, code = 'NWS_INPUT_INVALID') {
  if (typeof value !== 'string' || !REF_RE.test(value)) fail(code, `${label} must be one stable lowercase ref`);
  return value;
}
function text(value, label, { max = MAX_HUMAN_TEXT, code = 'NWS_INPUT_INVALID' } = {}) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max) {
    fail(code, `${label} must be non-empty trimmed text <= ${max} chars`);
  }
  return value;
}
function timestamp(value, label, code = 'NWS_INPUT_INVALID') {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail(code, `${label} must be canonical ISO-8601 UTC`);
  }
  return value;
}
function sha256Bytes(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function sha256File(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | Number(fs.constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) fail('NWS_BINDING_INVALID', 'bound executable must be one regular file');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
    return hash.digest('hex');
  } finally { fs.closeSync(fd); }
}
function canonicalExistingDirectory(value, label) {
  const requested = path.resolve(text(value, label, { max: 4096 }));
  if (!fs.existsSync(requested)) fail('NWS_ROOT_INVALID', `${label} does not exist`, { requested });
  const stat = fs.lstatSync(requested);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('NWS_ROOT_INVALID', `${label} must be a real directory`, { requested });
  const real = fs.realpathSync.native(requested);
  if (real !== requested) fail('NWS_ROOT_INVALID', `${label} must use its canonical filesystem identity`, { requested, real });
  return real;
}
function safeRelative(value, label) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) {
    fail('NWS_MANIFEST_INVALID', `${label} must be one safe relative path`);
  }
  const segments = value.split(/[\\/]/u);
  if (segments.some((part) => !part || part === '.' || part === '..')) fail('NWS_MANIFEST_INVALID', `${label} is not canonical`);
  return value;
}
function inside(root, candidate, label, code = 'NWS_ROOT_ESCAPE') {
  const target = path.resolve(candidate);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(code, `${label} escapes admitted root`, { root, target });
  }
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) continue;
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) fail(code, `${label} traverses a symbolic link`, { path: cursor });
  }
  return target;
}
function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  fs.writeFileSync(temp, jsonBytes(value), { mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, file);
}
function writeExclusive(file, value, code = 'NWS_STATE_COLLISION') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, jsonBytes(value), { mode: 0o600, flag: 'wx' });
  } catch (error) {
    if (error?.code === 'EEXIST') fail(code, `${path.basename(file)} already exists; immutable state would be clobbered`, { file });
    throw error;
  }
}
function readJson(file, code = 'NWS_STATE_CORRUPT') {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(code, `could not read ${path.basename(file)}`, { file, cause: error.message }); }
}
function nowIso(now = () => Date.now()) { return new Date(now()).toISOString(); }
function workerRoot(runtimeRoot, workerRef) {
  ref(workerRef, 'workerRef');
  return inside(runtimeRoot, path.join(runtimeRoot, 'native-workers', workerRef), 'worker root');
}
function receiptDir(root) { return path.join(root, 'receipts'); }
function pointerPath(root) { return path.join(root, 'current.json'); }
function controlPath(root) { return path.join(root, 'control.json'); }
function completionPath(root) { return path.join(root, 'completion.json'); }
function mutationLockPath(root) { return path.join(root, '.mutation-lock'); }
function currentControlGeneration(root) {
  if (!fs.existsSync(controlPath(root))) return 0;
  const control = readJson(controlPath(root), 'NWS_CONTROL_INVALID');
  return Number.isSafeInteger(control.generation) && control.generation >= 0 ? control.generation : 0;
}

function acquireMutationLock(root, operation, { now = () => Date.now(), timeoutMs = MUTATION_LOCK_TIMEOUT_MS } = {}) {
  const lock = mutationLockPath(root);
  const deadline = Date.now() + Math.max(0, timeoutMs);
  for (;;) {
    try {
      fs.mkdirSync(lock, { mode: 0o700 });
      writeExclusive(path.join(lock, 'owner.json'), {
        schemaVersion: 'vexlife.native-worker-mutation-lock/v1',
        operation,
        pid: process.pid,
        acquiredAt: nowIso(now)
      }, 'NWS_MUTATION_LOCK_CORRUPT');
      return () => fs.rmSync(lock, { recursive: true, force: true });
    } catch (error) {
      if (error instanceof NativeWorkerSupervisorError) {
        try { fs.rmSync(lock, { recursive: true, force: true }); } catch {}
        throw error;
      }
      if (error?.code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) {
        let owner = null;
        try { owner = readJson(path.join(lock, 'owner.json'), 'NWS_MUTATION_LOCKED'); } catch {}
        fail('NWS_MUTATION_LOCKED', 'worker mutation lock is held; ambiguous concurrent mutation fails closed', { operation, owner });
      }
      Atomics.wait(SLEEP_WORD, 0, 0, MUTATION_LOCK_WAIT_MS);
    }
  }
}
function withMutationLock(root, operation, fn, options = {}) {
  const release = acquireMutationLock(root, operation, options);
  try { return fn(); }
  finally { release(); }
}

export function validateNativeWorkerManifest(value) {
  exactKeys(value, MANIFEST_FIELDS, 'manifest', 'NWS_MANIFEST_INVALID');
  if (value.schemaVersion !== NATIVE_WORKER_MANIFEST_SCHEMA) fail('NWS_MANIFEST_INVALID', `manifest.schemaVersion must be ${NATIVE_WORKER_MANIFEST_SCHEMA}`);
  for (const field of ['workerRef', 'workRef', 'purposeRef', 'executableRef', 'resultContractRef', 'executionAuthorityRef']) ref(value[field], `manifest.${field}`, 'NWS_MANIFEST_INVALID');
  text(value.humanLabel, 'manifest.humanLabel', { max: 120, code: 'NWS_MANIFEST_INVALID' });
  if (!Array.isArray(value.argv) || value.argv.length > 256 || value.argv.some((item) => typeof item !== 'string' || item.includes('\0'))) {
    fail('NWS_MANIFEST_INVALID', 'manifest.argv must be an array of <=256 NUL-free strings');
  }
  safeRelative(value.sourceRootRelativeWorkingDirectory, 'manifest.sourceRootRelativeWorkingDirectory');
  if (!SCHEDULING_CLASSES.includes(value.schedulingClass)) fail('NWS_MANIFEST_INVALID', 'manifest.schedulingClass is not admitted');
  if (!PAUSE_MODES.includes(value.pauseMode)) fail('NWS_MANIFEST_INVALID', 'manifest.pauseMode is not admitted');
  return Object.freeze(structuredClone(value));
}

export function validateNativeWorkerBinding(value, { verifyExecutable = true } = {}) {
  exactKeys(value, BINDING_FIELDS, 'binding', 'NWS_BINDING_INVALID');
  if (value.schemaVersion !== NATIVE_WORKER_BINDING_SCHEMA) fail('NWS_BINDING_INVALID', `binding.schemaVersion must be ${NATIVE_WORKER_BINDING_SCHEMA}`);
  for (const field of ['bindingRef', 'executableRef', 'hostRef']) ref(value[field], `binding.${field}`, 'NWS_BINDING_INVALID');
  timestamp(value.observedAt, 'binding.observedAt', 'NWS_BINDING_INVALID');
  if (typeof value.executablePath !== 'string' || !path.isAbsolute(value.executablePath)) fail('NWS_BINDING_INVALID', 'binding.executablePath must be absolute machine-local evidence');
  if (!SHA256_RE.test(value.executableSha256 ?? '')) fail('NWS_BINDING_INVALID', 'binding.executableSha256 must be lowercase SHA-256');
  if (verifyExecutable) {
    const requested = path.resolve(value.executablePath);
    if (!fs.existsSync(requested)) fail('NWS_BINDING_INVALID', 'bound executable is missing', { requested });
    const stat = fs.lstatSync(requested);
    if (stat.isSymbolicLink() || !stat.isFile()) fail('NWS_BINDING_INVALID', 'bound executable must be a regular non-symlink file');
    const real = fs.realpathSync.native(requested);
    if (real !== requested) fail('NWS_BINDING_INVALID', 'bound executable path is not canonical', { requested, real });
    const actual = sha256File(real);
    if (actual !== value.executableSha256) fail('NWS_BINDING_INVALID', 'bound executable SHA-256 mismatch', { expected: value.executableSha256, actual });
  }
  return Object.freeze(structuredClone(value));
}

export function assertManifestBindingCoherence(manifest, binding) {
  const m = validateNativeWorkerManifest(manifest);
  const b = validateNativeWorkerBinding(binding);
  if (m.executableRef !== b.executableRef) fail('NWS_BINDING_MISMATCH', 'manifest executableRef does not match runtime binding');
  return { manifest: m, binding: b };
}

function readPointer(root) {
  const pointer = readJson(pointerPath(root));
  exactKeys(pointer, ['schemaVersion', 'workerRef', 'generation', 'receiptFile', 'receiptSha256'], 'current pointer', 'NWS_STATE_CORRUPT');
  if (pointer.schemaVersion !== 'vexlife.native-worker-current/v1' || !Number.isSafeInteger(pointer.generation) || pointer.generation < 1 || !SHA256_RE.test(pointer.receiptSha256 ?? '')) {
    fail('NWS_STATE_CORRUPT', 'current pointer identity is invalid');
  }
  ref(pointer.workerRef, 'current.workerRef', 'NWS_STATE_CORRUPT');
  if (typeof pointer.receiptFile !== 'string' || path.basename(pointer.receiptFile) !== pointer.receiptFile) fail('NWS_STATE_CORRUPT', 'current receiptFile is invalid');
  const receiptPath = inside(receiptDir(root), path.join(receiptDir(root), pointer.receiptFile), 'current receipt', 'NWS_STATE_CORRUPT');
  const bytes = fs.readFileSync(receiptPath);
  if (sha256Bytes(bytes) !== pointer.receiptSha256) fail('NWS_STATE_CORRUPT', 'current receipt digest mismatch');
  const receipt = JSON.parse(bytes.toString('utf8'));
  if (receipt.schemaVersion !== NATIVE_WORKER_RECEIPT_SCHEMA || receipt.workerRef !== pointer.workerRef || receipt.generation !== pointer.generation) fail('NWS_STATE_CORRUPT', 'current pointer/receipt identity mismatch');
  return receipt;
}

function writeReceiptUnlocked(root, manifest, state, fields = {}, now = () => Date.now()) {
  if (!NATIVE_WORKER_STATES.includes(state)) fail('NWS_STATE_INVALID', `unknown worker state ${state}`);
  let generation = 1;
  if (fs.existsSync(pointerPath(root))) generation = readPointer(root).generation + 1;
  const receipt = {
    schemaVersion: NATIVE_WORKER_RECEIPT_SCHEMA,
    workerRef: manifest.workerRef,
    workRef: manifest.workRef,
    purposeRef: manifest.purposeRef,
    generation,
    state,
    observedAt: nowIso(now),
    ...fields
  };
  const name = `${String(generation).padStart(8, '0')}-${state.toLowerCase().replaceAll('_', '-')}.json`;
  const file = path.join(receiptDir(root), name);
  writeExclusive(file, receipt, 'NWS_RECEIPT_COLLISION');
  const bytes = fs.readFileSync(file);
  writeAtomic(pointerPath(root), {
    schemaVersion: 'vexlife.native-worker-current/v1',
    workerRef: manifest.workerRef,
    generation,
    receiptFile: name,
    receiptSha256: sha256Bytes(bytes)
  });
  return receipt;
}

function reserveNativeWorkerRun(root, { now } = {}) {
  return withMutationLock(root, 'RESERVE_RUN', () => {
    const loaded = loadNativeWorker(root);
    if (!['STANDING_BY', 'PAUSED'].includes(loaded.receipt.state)) fail('NWS_NOT_RUNNABLE', `worker is not runnable from ${loaded.receipt.state}`);
    const launchRef = `launch.${crypto.randomUUID()}`;
    const receipt = writeReceiptUnlocked(root, loaded.manifest, 'STARTING', {
      pid: null,
      waitingReason: null,
      terminalEvidence: null,
      launchRef,
      controlGenerationFloor: currentControlGeneration(root)
    }, now);
    return { launchRef, receipt, workPulse: projectHumanWorkPulse(receipt), manifest: loaded.manifest, binding: loaded.binding, host: loaded.host };
  }, { now });
}

function assertReservedRun(root, launchRef) {
  ref(launchRef, 'launchRef', 'NWS_RUN_OWNERSHIP_INVALID');
  const loaded = loadNativeWorker(root);
  if (loaded.receipt.state !== 'STARTING' || loaded.receipt.launchRef !== launchRef) {
    fail('NWS_RUN_OWNERSHIP_LOST', 'reserved run no longer owns the current STARTING generation', {
      launchRef,
      state: loaded.receipt.state,
      currentLaunchRef: loaded.receipt.launchRef ?? null
    });
  }
  return loaded;
}

function writeRunReceipt(root, launchRef, state, fields, now) {
  return withMutationLock(root, `RUN_${state}`, () => {
    const loaded = loadNativeWorker(root);
    if (loaded.receipt.launchRef !== launchRef) {
      fail('NWS_RUN_OWNERSHIP_LOST', 'run launchRef no longer owns worker state', { launchRef, state: loaded.receipt.state, currentLaunchRef: loaded.receipt.launchRef ?? null });
    }
    return writeReceiptUnlocked(root, loaded.manifest, state, { ...fields, launchRef }, now);
  }, { now });
}

function markLaunchFailure(root, launchRef, error, now) {
  return withMutationLock(root, 'HOST_LAUNCH_FAILURE', () => {
    const loaded = loadNativeWorker(root);
    if (loaded.receipt.state !== 'STARTING' || loaded.receipt.launchRef !== launchRef) {
      fail('NWS_RUN_OWNERSHIP_LOST', 'failed host launch no longer owns STARTING state', { launchRef, state: loaded.receipt.state });
    }
    const terminalEvidence = {
      exitCode: null,
      signal: null,
      errorClass: 'SUPERVISOR_HOST_SPAWN_FAILED',
      errorMessage: String(error?.message ?? error ?? 'unknown supervisor host spawn failure').slice(0, MAX_HUMAN_TEXT),
      terminalObserved: false
    };
    const receipt = writeReceiptUnlocked(root, loaded.manifest, 'NEEDS_ATTENTION', {
      pid: null,
      waitingReason: 'Supervisor host could not be started; no payload ownership was admitted.',
      terminalEvidence,
      launchRef
    }, now);
    return { receipt, workPulse: projectHumanWorkPulse(receipt) };
  }, { now });
}

function spawnReservedPayload(root, launchRef, spawnImpl, { manifest, binding, host, outFd, errFd, now } = {}) {
  return withMutationLock(root, 'SPAWN_PAYLOAD', () => {
    const loaded = assertReservedRun(root, launchRef);
    let child;
    try {
      child = spawnImpl(binding.executablePath, manifest.argv, {
        cwd: host.workingDirectory,
        shell: false,
        detached: false,
        windowsHide: true,
        stdio: ['ignore', outFd, errFd],
        env: childEnvironment(root)
      });
    } catch (error) {
      const terminalEvidence = {
        exitCode: null,
        signal: null,
        cancelRequested: false,
        pauseRequested: false,
        payloadStarted: false,
        stdoutPath: 'stdout.log',
        stderrPath: 'stderr.log',
        errorClass: 'PAYLOAD_SPAWN_FAILED',
        errorMessage: String(error?.message ?? error ?? 'unknown payload spawn failure').slice(0, MAX_HUMAN_TEXT),
        terminalObserved: false
      };
      const receipt = writeReceiptUnlocked(root, loaded.manifest, 'NEEDS_ATTENTION', {
        pid: null,
        waitingReason: 'Worker payload could not be started; no payload ownership was admitted.',
        terminalEvidence,
        launchRef
      }, now);
      return { child: null, receipt, workPulse: projectHumanWorkPulse(receipt) };
    }
    if (!child || !Number.isInteger(child.pid)) {
      const terminalEvidence = {
        exitCode: null,
        signal: null,
        cancelRequested: false,
        pauseRequested: false,
        payloadStarted: false,
        stdoutPath: 'stdout.log',
        stderrPath: 'stderr.log',
        errorClass: 'PAYLOAD_SPAWN_FAILED',
        errorMessage: 'worker spawn did not produce an exact child pid',
        terminalObserved: false
      };
      const receipt = writeReceiptUnlocked(root, loaded.manifest, 'NEEDS_ATTENTION', {
        pid: null,
        waitingReason: 'Worker payload did not return an exact owned pid.',
        terminalEvidence,
        launchRef
      }, now);
      return { child: null, receipt, workPulse: projectHumanWorkPulse(receipt) };
    }
    const receipt = writeReceiptUnlocked(root, loaded.manifest, 'WORKING', {
      pid: child.pid,
      waitingReason: null,
      terminalEvidence: null,
      launchRef
    }, now);
    return { child, receipt, workPulse: projectHumanWorkPulse(receipt) };
  }, { now });
}

export function projectHumanWorkPulse(receipt, completion = null) {
  requireObject(receipt, 'receipt', 'NWS_STATE_INVALID');
  const reason = typeof receipt.waitingReason === 'string' ? receipt.waitingReason : null;
  const summary = completion?.humanSummary ?? null;
  switch (receipt.state) {
    case 'STARTING': return Object.freeze({ state: 'WORKING', symbol: '●', colorToken: 'status.healthy', label: 'Working', detail: 'Starting the exact worker.', summary: null });
    case 'WORKING':
    case 'PAUSE_REQUESTED': return Object.freeze({ state: 'WORKING', symbol: '●', colorToken: 'status.healthy', label: 'Working', detail: receipt.state === 'PAUSE_REQUESTED' ? 'Pause requested; waiting for a cooperative checkpoint.' : null, summary: null });
    case 'STANDING_BY': return Object.freeze({ state: 'STANDING_BY', symbol: '●', colorToken: 'accent.primary', label: 'Standing by', detail: null, summary: null });
    case 'WAITING': return Object.freeze({ state: 'WAITING', symbol: '●', colorToken: 'status.attention', label: 'Waiting', detail: reason, summary: null });
    case 'PAUSED': return Object.freeze({ state: 'PAUSED', symbol: '⏸', colorToken: null, label: 'Paused', detail: null, summary: null });
    case 'CANCELLED': return Object.freeze({ state: 'CANCELLED', symbol: '×', colorToken: null, label: 'Cancelled', detail: reason ?? 'Stopped by request.', summary: null });
    case 'WRAPPING_UP': return Object.freeze({ state: 'WRAPPING_UP', symbol: '…', colorToken: 'accent.primary', label: 'Wrapping up', detail: 'Worker returned; result has not been consumed yet.', summary: null });
    case 'DONE': return Object.freeze({ state: 'DONE', symbol: '✓', colorToken: 'status.healthy', label: 'Done', detail: null, summary });
    case 'NEEDS_ATTENTION': return Object.freeze({ state: 'NEEDS_ATTENTION', symbol: '!', colorToken: 'status.blocked', label: 'Needs attention', detail: reason, summary: null });
    case 'CANCEL_REQUESTED': return Object.freeze({ state: 'WORKING', symbol: '●', colorToken: 'status.attention', label: 'Stopping', detail: 'Cancellation requested for the exact owned worker.', summary: null });
    case 'NOT_ACTIVE': return Object.freeze({ state: 'NOT_ACTIVE', symbol: '○', colorToken: null, label: 'Not active', detail: null, summary: null });
    default: fail('NWS_STATE_INVALID', `cannot project unknown state ${receipt.state}`);
  }
}

export function prepareNativeWorker({ runtimeRoot, sourceRoot, manifest, binding, now } = {}) {
  const runtime = canonicalExistingDirectory(runtimeRoot, 'runtimeRoot');
  const source = canonicalExistingDirectory(sourceRoot, 'sourceRoot');
  const coherent = assertManifestBindingCoherence(manifest, binding);
  const cwd = inside(source, path.join(source, ...coherent.manifest.sourceRootRelativeWorkingDirectory.split(/[\\/]/u)), 'worker working directory', 'NWS_WORKING_DIRECTORY_ESCAPE');
  if (!fs.existsSync(cwd) || !fs.lstatSync(cwd).isDirectory()) fail('NWS_WORKING_DIRECTORY_INVALID', 'worker working directory does not exist', { cwd });
  const root = workerRoot(runtime, coherent.manifest.workerRef);
  fs.mkdirSync(path.dirname(root), { recursive: true, mode: 0o700 });
  try { fs.mkdirSync(root, { mode: 0o700 }); }
  catch (error) {
    if (error?.code === 'EEXIST') fail('NWS_WORKER_ALREADY_EXISTS', 'worker root already exists; duplicate preparation fails closed', { root });
    throw error;
  }
  try {
    fs.mkdirSync(receiptDir(root), { mode: 0o700 });
    writeExclusive(path.join(root, 'manifest.json'), coherent.manifest);
    writeExclusive(path.join(root, 'binding.json'), coherent.binding);
    writeExclusive(path.join(root, 'host.json'), {
      schemaVersion: 'vexlife.native-worker-host/v1',
      workerRef: coherent.manifest.workerRef,
      runtimeRoot: runtime,
      sourceRoot: source,
      workingDirectory: cwd,
      formedAt: nowIso(now)
    });
    const receipt = writeReceiptUnlocked(root, coherent.manifest, 'STANDING_BY', { pid: null, waitingReason: null, terminalEvidence: null }, now);
    return { workerRoot: root, receipt, workPulse: projectHumanWorkPulse(receipt) };
  } catch (error) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
    throw error;
  }
}

export function loadNativeWorker(root) {
  const worker = canonicalExistingDirectory(root, 'workerRoot');
  const manifest = validateNativeWorkerManifest(readJson(path.join(worker, 'manifest.json'), 'NWS_STATE_CORRUPT'));
  const binding = validateNativeWorkerBinding(readJson(path.join(worker, 'binding.json'), 'NWS_STATE_CORRUPT'));
  if (manifest.executableRef !== binding.executableRef) fail('NWS_STATE_CORRUPT', 'persisted manifest/binding no longer cohere');
  const host = readJson(path.join(worker, 'host.json'), 'NWS_STATE_CORRUPT');
  const receipt = readPointer(worker);
  const completion = fs.existsSync(completionPath(worker)) ? readJson(completionPath(worker), 'NWS_STATE_CORRUPT') : null;
  return { workerRoot: worker, manifest, binding, host, receipt, completion, workPulse: projectHumanWorkPulse(receipt, completion) };
}

function childEnvironment(root) {
  const allowed = ['PATH', 'HOME', 'USER', 'TMPDIR', 'TMP', 'TEMP', 'SystemRoot', 'WINDIR'];
  const env = {};
  for (const key of allowed) if (typeof process.env[key] === 'string') env[key] = process.env[key];
  env.VEX_WORKER_ROOT = root;
  env.VEX_WORKER_CONTROL_PATH = controlPath(root);
  return env;
}

export async function runPreparedNativeWorker(root, { spawnImpl = spawn, now, pollMs = 250, launchRef = null } = {}) {
  let reserved;
  if (launchRef === null) reserved = reserveNativeWorkerRun(root, { now });
  else reserved = withMutationLock(root, 'ADOPT_RESERVED_RUN', () => {
    const loaded = assertReservedRun(root, launchRef);
    return { launchRef, receipt: loaded.receipt, workPulse: loaded.workPulse, manifest: loaded.manifest, binding: loaded.binding, host: loaded.host };
  }, { now });
  const { manifest, binding, host } = reserved;
  const exactLaunchRef = reserved.launchRef;
  const stdoutPath = path.join(root, 'stdout.log');
  const stderrPath = path.join(root, 'stderr.log');
  const outFd = fs.openSync(stdoutPath, 'a', 0o600);
  const errFd = fs.openSync(stderrPath, 'a', 0o600);
  let spawned;
  try {
    spawned = spawnReservedPayload(root, exactLaunchRef, spawnImpl, { manifest, binding, host, outFd, errFd, now });
  } catch (error) {
    try { fs.closeSync(outFd); } catch {}
    try { fs.closeSync(errFd); } catch {}
    throw error;
  }
  if (!spawned.child) {
    try { fs.closeSync(outFd); } catch {}
    try { fs.closeSync(errFd); } catch {}
    return { receipt: spawned.receipt, workPulse: spawned.workPulse };
  }
  const child = spawned.child;
  let controlGeneration = Number.isSafeInteger(reserved.receipt.controlGenerationFloor) ? reserved.receipt.controlGenerationFloor : 0;
  let cancelRequested = false;
  let pauseRequested = false;
  const observeControl = () => {
    if (!fs.existsSync(controlPath(root))) return;
    let control;
    try { control = readJson(controlPath(root), 'NWS_CONTROL_INVALID'); }
    catch { return; }
    if (!Number.isSafeInteger(control.generation) || control.generation <= controlGeneration || !CONTROL_ACTIONS.includes(control.action)) return;
    try {
      const loaded = loadNativeWorker(root);
      if (loaded.receipt.launchRef !== exactLaunchRef) return;
      if (control.action === 'PAUSE' && manifest.pauseMode === 'CHECKPOINT_BOUND_COOPERATIVE') {
        if (loaded.receipt.state === 'WORKING') {
          writeRunReceipt(root, exactLaunchRef, 'PAUSE_REQUESTED', { pid: child.pid, waitingReason: 'cooperative worker checkpoint', terminalEvidence: null }, now);
        }
        pauseRequested = true;
      }
      if (control.action === 'CANCEL') {
        if (['WORKING', 'PAUSE_REQUESTED'].includes(loaded.receipt.state)) {
          writeRunReceipt(root, exactLaunchRef, 'CANCEL_REQUESTED', { pid: child.pid, waitingReason: 'exact owned worker shutdown', terminalEvidence: null }, now);
        }
        cancelRequested = true;
        try { child.kill('SIGTERM'); } catch {}
      }
      controlGeneration = control.generation;
    } catch (error) {
      if (error?.code !== 'NWS_MUTATION_LOCKED') throw error;
    }
  };
  observeControl();
  const timer = setInterval(observeControl, Math.max(50, pollMs));
  timer.unref?.();

  const outcome = await new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    child.once('error', (error) => settle({ kind: 'error', error }));
    child.once('close', (code, signal) => settle({ kind: 'close', code, signal }));
  }).finally(() => {
    clearInterval(timer);
    try { fs.closeSync(outFd); } catch {}
    try { fs.closeSync(errFd); } catch {}
  });

  if (outcome.kind === 'error') {
    const exactPid = Number.isInteger(child.pid) ? child.pid : null;
    let cleanupAttempted = false;
    let cleanupSignalSent = false;
    if (exactPid !== null && typeof child.kill === 'function') {
      cleanupAttempted = true;
      try { cleanupSignalSent = child.kill('SIGTERM') !== false; } catch {}
    }
    const terminalEvidence = {
      exitCode: null,
      signal: null,
      cancelRequested,
      pauseRequested,
      payloadStarted: true,
      stdoutPath: 'stdout.log',
      stderrPath: 'stderr.log',
      errorClass: 'CHILD_PROCESS_ERROR',
      errorMessage: String(outcome.error?.message ?? outcome.error ?? 'unknown child error').slice(0, MAX_HUMAN_TEXT),
      terminalObserved: false,
      cleanupAttempted,
      cleanupSignalSent
    };
    const reason = cleanupSignalSent
      ? 'Worker emitted an execution error; the exact owned child was asked to stop and requires liveness re-observation.'
      : 'Worker emitted an execution error; exact child liveness requires attention.';
    const receipt = writeRunReceipt(root, exactLaunchRef, 'NEEDS_ATTENTION', { pid: exactPid, waitingReason: reason, terminalEvidence }, now);
    return { receipt, workPulse: projectHumanWorkPulse(receipt) };
  }

  const result = outcome;
  const terminalEvidence = {
    exitCode: Number.isInteger(result.code) ? result.code : null,
    signal: result.signal ?? null,
    cancelRequested,
    pauseRequested,
    payloadStarted: true,
    stopReason: cancelRequested ? 'HUMAN_CANCEL_REQUEST' : null,
    stdoutPath: 'stdout.log',
    stderrPath: 'stderr.log'
  };
  if (cancelRequested) {
    const receipt = writeRunReceipt(root, exactLaunchRef, 'CANCELLED', { pid: null, waitingReason: 'Stopped by request.', terminalEvidence }, now);
    return { receipt, workPulse: projectHumanWorkPulse(receipt) };
  }
  if (pauseRequested && result.code === 75) {
    const receipt = writeRunReceipt(root, exactLaunchRef, 'PAUSED', { pid: null, waitingReason: null, terminalEvidence }, now);
    return { receipt, workPulse: projectHumanWorkPulse(receipt) };
  }
  if (result.code === 0) {
    const receipt = writeRunReceipt(root, exactLaunchRef, 'WRAPPING_UP', { pid: null, waitingReason: null, terminalEvidence }, now);
    return { receipt, workPulse: projectHumanWorkPulse(receipt) };
  }
  const reason = `Worker exited before successful terminal return (code=${result.code ?? 'null'}, signal=${result.signal ?? 'null'}).`;
  const receipt = writeRunReceipt(root, exactLaunchRef, 'NEEDS_ATTENTION', { pid: null, waitingReason: reason, terminalEvidence }, now);
  return { receipt, workPulse: projectHumanWorkPulse(receipt) };
}

export function requestNativeWorkerControl(root, action, { now } = {}) {
  return withMutationLock(root, `CONTROL_${action}`, () => {
    const loaded = loadNativeWorker(root);
    if (!CONTROL_ACTIONS.includes(action)) fail('NWS_CONTROL_INVALID', `unsupported control action ${action}`);
    if (action === 'PAUSE') {
      if (loaded.manifest.pauseMode === 'NONE') fail('NWS_PAUSE_UNSUPPORTED', 'worker does not admit cooperative pause');
      if (loaded.receipt.state === 'STANDING_BY') {
        const receipt = writeReceiptUnlocked(root, loaded.manifest, 'PAUSED', { pid: null, waitingReason: null, terminalEvidence: null }, now);
        return { receipt, workPulse: projectHumanWorkPulse(receipt) };
      }
      if (loaded.receipt.state === 'STARTING') {
        const receipt = writeReceiptUnlocked(root, loaded.manifest, 'PAUSED', {
          pid: null,
          waitingReason: null,
          terminalEvidence: { exitCode: null, signal: null, cancelRequested: false, pauseRequested: true, payloadStarted: false, terminalObserved: true },
          launchRef: loaded.receipt.launchRef
        }, now);
        return { receipt, workPulse: projectHumanWorkPulse(receipt) };
      }
      if (!['WORKING', 'PAUSE_REQUESTED'].includes(loaded.receipt.state)) fail('NWS_NOT_PAUSABLE', `worker cannot request pause from ${loaded.receipt.state}`);
    }
    if (action === 'CANCEL') {
      if (loaded.receipt.state === 'STARTING') {
        const receipt = writeReceiptUnlocked(root, loaded.manifest, 'CANCELLED', {
          pid: null,
          waitingReason: 'Stopped by request before payload start.',
          terminalEvidence: {
            exitCode: null,
            signal: null,
            cancelRequested: true,
            pauseRequested: false,
            payloadStarted: false,
            stopReason: 'HUMAN_CANCEL_REQUEST',
            terminalObserved: true
          },
          launchRef: loaded.receipt.launchRef
        }, now);
        return { receipt, workPulse: projectHumanWorkPulse(receipt) };
      }
      if (!['WORKING', 'PAUSE_REQUESTED'].includes(loaded.receipt.state)) fail('NWS_NOT_CANCELLABLE', `worker cannot cancel from ${loaded.receipt.state}`);
    }
    const prior = fs.existsSync(controlPath(root)) ? readJson(controlPath(root), 'NWS_CONTROL_INVALID') : { generation: 0 };
    const control = { schemaVersion: 'vexlife.native-worker-control/v1', workerRef: loaded.manifest.workerRef, generation: Number(prior.generation ?? 0) + 1, action, requestedAt: nowIso(now) };
    writeAtomic(controlPath(root), control);
    return control;
  }, { now });
}

export function markNativeWorkerWaiting(root, reason, { now } = {}) {
  return withMutationLock(root, 'MARK_WAITING', () => {
    const loaded = loadNativeWorker(root);
    if (!['STANDING_BY', 'PAUSED'].includes(loaded.receipt.state)) fail('NWS_NOT_WAITABLE', `worker cannot enter WAITING from ${loaded.receipt.state}`);
    const receipt = writeReceiptUnlocked(root, loaded.manifest, 'WAITING', { pid: null, waitingReason: text(reason, 'waitingReason', { max: 180, code: 'NWS_WAIT_INVALID' }), terminalEvidence: null }, now);
    return { receipt, workPulse: projectHumanWorkPulse(receipt) };
  }, { now });
}

export function markNativeWorkerStandingBy(root, { now } = {}) {
  return withMutationLock(root, 'MARK_STANDING_BY', () => {
    const loaded = loadNativeWorker(root);
    if (!['WAITING', 'PAUSED'].includes(loaded.receipt.state)) fail('NWS_NOT_STANDBY', `worker cannot enter STANDING_BY from ${loaded.receipt.state}`);
    const receipt = writeReceiptUnlocked(root, loaded.manifest, 'STANDING_BY', { pid: null, waitingReason: null, terminalEvidence: null }, now);
    return { receipt, workPulse: projectHumanWorkPulse(receipt) };
  }, { now });
}

export function consumeNativeWorkerResult(root, input, { now } = {}) {
  return withMutationLock(root, 'CONSUME_RESULT', () => {
    const loaded = loadNativeWorker(root);
    if (loaded.receipt.state !== 'WRAPPING_UP') fail('NWS_RESULT_NOT_READY', `worker result cannot be consumed from ${loaded.receipt.state}`);
    exactKeys(input, ['resultRef', 'machineCompletionRecord', 'humanSummary'], 'completion input', 'NWS_COMPLETION_INVALID');
    ref(input.resultRef, 'completion.resultRef', 'NWS_COMPLETION_INVALID');
    requireObject(input.machineCompletionRecord, 'completion.machineCompletionRecord', 'NWS_COMPLETION_INVALID');
    const humanSummary = text(input.humanSummary, 'completion.humanSummary', { max: MAX_HUMAN_TEXT, code: 'NWS_COMPLETION_INVALID' });
    const machineRecordSha256 = sha256Bytes(Buffer.from(JSON.stringify(input.machineCompletionRecord)));
    const completion = {
      schemaVersion: NATIVE_WORKER_COMPLETION_SCHEMA,
      workerRef: loaded.manifest.workerRef,
      workRef: loaded.manifest.workRef,
      resultRef: input.resultRef,
      machineCompletionRecord: input.machineCompletionRecord,
      machineCompletionRecordSha256: machineRecordSha256,
      humanSummary,
      consumedAt: nowIso(now)
    };
    writeExclusive(completionPath(root), completion, 'NWS_COMPLETION_COLLISION');
    const receipt = writeReceiptUnlocked(root, loaded.manifest, 'DONE', { pid: null, waitingReason: null, terminalEvidence: loaded.receipt.terminalEvidence, resultRef: input.resultRef, launchRef: loaded.receipt.launchRef ?? null }, now);
    return { receipt, completion, workPulse: projectHumanWorkPulse(receipt, completion) };
  }, { now });
}

export function launchDetachedNativeWorkerHost({ workerRoot: root, cliPath, now, spawnImpl = spawn } = {}) {
  const cli = path.resolve(text(cliPath, 'cliPath', { max: 4096 }));
  if (!fs.existsSync(cli) || !fs.lstatSync(cli).isFile()) fail('NWS_CLI_INVALID', 'native worker CLI is missing');
  const reserved = reserveNativeWorkerRun(root, { now });
  let supervisorOut = null;
  let supervisorErr = null;
  let child;
  try {
    supervisorOut = fs.openSync(path.join(root, 'supervisor.log'), 'a', 0o600);
    supervisorErr = fs.openSync(path.join(root, 'supervisor.err.log'), 'a', 0o600);
    child = spawnImpl(process.execPath, [cli, 'host', '--worker-root', root, '--launch-ref', reserved.launchRef], {
      cwd: reserved.host.sourceRoot,
      detached: true,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', supervisorOut, supervisorErr]
    });
  } catch (error) {
    if (supervisorOut !== null) try { fs.closeSync(supervisorOut); } catch {}
    if (supervisorErr !== null) try { fs.closeSync(supervisorErr); } catch {}
    return markLaunchFailure(root, reserved.launchRef, error, now);
  }
  const pid = child?.pid;
  child?.unref?.();
  if (supervisorOut !== null) try { fs.closeSync(supervisorOut); } catch {}
  if (supervisorErr !== null) try { fs.closeSync(supervisorErr); } catch {}
  if (!Number.isInteger(pid)) return markLaunchFailure(root, reserved.launchRef, new Error('detached supervisor host did not return a pid'), now);
  return { hostPid: pid, workerRef: reserved.manifest.workerRef, launchRef: reserved.launchRef, launchedAt: nowIso(now), workPulse: reserved.workPulse };
}

// [VXG RealForever]
