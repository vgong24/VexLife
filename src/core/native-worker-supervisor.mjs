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
  'WORKING',
  'WAITING',
  'PAUSE_REQUESTED',
  'PAUSED',
  'CANCEL_REQUESTED',
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
function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const data = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(temp, data, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, file);
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

function writeReceipt(root, manifest, state, fields = {}, now = () => Date.now()) {
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
  writeAtomic(file, receipt);
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

export function projectHumanWorkPulse(receipt, completion = null) {
  requireObject(receipt, 'receipt', 'NWS_STATE_INVALID');
  const reason = typeof receipt.waitingReason === 'string' ? receipt.waitingReason : null;
  const summary = completion?.humanSummary ?? null;
  switch (receipt.state) {
    case 'WORKING':
    case 'PAUSE_REQUESTED': return Object.freeze({ state: 'WORKING', symbol: '●', colorToken: 'status.healthy', label: 'Working', detail: receipt.state === 'PAUSE_REQUESTED' ? 'Pause requested; waiting for a cooperative checkpoint.' : null, summary: null });
    case 'STANDING_BY': return Object.freeze({ state: 'STANDING_BY', symbol: '●', colorToken: 'accent.primary', label: 'Standing by', detail: null, summary: null });
    case 'WAITING': return Object.freeze({ state: 'WAITING', symbol: '●', colorToken: 'status.attention', label: 'Waiting', detail: reason, summary: null });
    case 'PAUSED': return Object.freeze({ state: 'PAUSED', symbol: '⏸', colorToken: null, label: 'Paused', detail: null, summary: null });
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
  if (fs.existsSync(root) && fs.readdirSync(root).length > 0) fail('NWS_WORKER_ALREADY_EXISTS', 'worker root already contains state', { root });
  fs.mkdirSync(receiptDir(root), { recursive: true, mode: 0o700 });
  writeAtomic(path.join(root, 'manifest.json'), coherent.manifest);
  writeAtomic(path.join(root, 'binding.json'), coherent.binding);
  writeAtomic(path.join(root, 'host.json'), {
    schemaVersion: 'vexlife.native-worker-host/v1',
    workerRef: coherent.manifest.workerRef,
    runtimeRoot: runtime,
    sourceRoot: source,
    workingDirectory: cwd,
    formedAt: nowIso(now)
  });
  const receipt = writeReceipt(root, coherent.manifest, 'STANDING_BY', { pid: null, waitingReason: null, terminalEvidence: null }, now);
  return { workerRoot: root, receipt, workPulse: projectHumanWorkPulse(receipt) };
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

export async function runPreparedNativeWorker(root, { spawnImpl = spawn, now, pollMs = 250 } = {}) {
  const loaded = loadNativeWorker(root);
  if (!['STANDING_BY', 'PAUSED'].includes(loaded.receipt.state)) fail('NWS_NOT_RUNNABLE', `worker is not runnable from ${loaded.receipt.state}`);
  const { manifest, binding, host } = loaded;
  const stdoutPath = path.join(root, 'stdout.log');
  const stderrPath = path.join(root, 'stderr.log');
  const outFd = fs.openSync(stdoutPath, 'a', 0o600);
  const errFd = fs.openSync(stderrPath, 'a', 0o600);
  const child = spawnImpl(binding.executablePath, manifest.argv, {
    cwd: host.workingDirectory,
    shell: false,
    detached: false,
    windowsHide: true,
    stdio: ['ignore', outFd, errFd],
    env: childEnvironment(root)
  });
  if (!child || !Number.isInteger(child.pid)) {
    try { fs.closeSync(outFd); } catch {}
    try { fs.closeSync(errFd); } catch {}
    fail('NWS_SPAWN_FAILED', 'worker spawn did not produce an exact child pid');
  }
  writeReceipt(root, manifest, 'WORKING', { pid: child.pid, waitingReason: null, terminalEvidence: null }, now);
  let controlGeneration = 0;
  let cancelRequested = false;
  let pauseRequested = false;
  const timer = setInterval(() => {
    if (!fs.existsSync(controlPath(root))) return;
    let control;
    try { control = readJson(controlPath(root), 'NWS_CONTROL_INVALID'); }
    catch { return; }
    if (!Number.isSafeInteger(control.generation) || control.generation <= controlGeneration || !CONTROL_ACTIONS.includes(control.action)) return;
    controlGeneration = control.generation;
    if (control.action === 'PAUSE' && manifest.pauseMode === 'CHECKPOINT_BOUND_COOPERATIVE') {
      pauseRequested = true;
      writeReceipt(root, manifest, 'PAUSE_REQUESTED', { pid: child.pid, waitingReason: 'cooperative worker checkpoint', terminalEvidence: null }, now);
    }
    if (control.action === 'CANCEL') {
      cancelRequested = true;
      writeReceipt(root, manifest, 'CANCEL_REQUESTED', { pid: child.pid, waitingReason: 'exact owned worker shutdown', terminalEvidence: null }, now);
      try { child.kill('SIGTERM'); } catch {}
    }
  }, Math.max(50, pollMs));
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
    const receipt = writeReceipt(root, manifest, 'NEEDS_ATTENTION', { pid: exactPid, waitingReason: reason, terminalEvidence }, now);
    return { receipt, workPulse: projectHumanWorkPulse(receipt) };
  }

  const result = outcome;
  const terminalEvidence = {
    exitCode: Number.isInteger(result.code) ? result.code : null,
    signal: result.signal ?? null,
    cancelRequested,
    pauseRequested,
    stdoutPath: 'stdout.log',
    stderrPath: 'stderr.log'
  };
  if (pauseRequested && result.code === 75) {
    const receipt = writeReceipt(root, manifest, 'PAUSED', { pid: null, waitingReason: null, terminalEvidence }, now);
    return { receipt, workPulse: projectHumanWorkPulse(receipt) };
  }
  if (result.code === 0) {
    const receipt = writeReceipt(root, manifest, 'WRAPPING_UP', { pid: null, waitingReason: null, terminalEvidence }, now);
    return { receipt, workPulse: projectHumanWorkPulse(receipt) };
  }
  const reason = cancelRequested ? 'Worker stopped after an exact cancellation request.' : `Worker exited before successful terminal return (code=${result.code ?? 'null'}, signal=${result.signal ?? 'null'}).`;
  const receipt = writeReceipt(root, manifest, 'NEEDS_ATTENTION', { pid: null, waitingReason: reason, terminalEvidence }, now);
  return { receipt, workPulse: projectHumanWorkPulse(receipt) };
}

export function requestNativeWorkerControl(root, action, { now } = {}) {
  const loaded = loadNativeWorker(root);
  if (!CONTROL_ACTIONS.includes(action)) fail('NWS_CONTROL_INVALID', `unsupported control action ${action}`);
  if (action === 'PAUSE') {
    if (loaded.manifest.pauseMode === 'NONE') fail('NWS_PAUSE_UNSUPPORTED', 'worker does not admit cooperative pause');
    if (loaded.receipt.state === 'STANDING_BY') {
      const receipt = writeReceipt(root, loaded.manifest, 'PAUSED', { pid: null, waitingReason: null, terminalEvidence: null }, now);
      return { receipt, workPulse: projectHumanWorkPulse(receipt) };
    }
    if (loaded.receipt.state !== 'WORKING' && loaded.receipt.state !== 'PAUSE_REQUESTED') fail('NWS_NOT_PAUSABLE', `worker cannot request pause from ${loaded.receipt.state}`);
  }
  if (action === 'CANCEL' && !['WORKING', 'PAUSE_REQUESTED'].includes(loaded.receipt.state)) fail('NWS_NOT_CANCELLABLE', `worker cannot cancel from ${loaded.receipt.state}`);
  const prior = fs.existsSync(controlPath(root)) ? readJson(controlPath(root), 'NWS_CONTROL_INVALID') : { generation: 0 };
  const control = { schemaVersion: 'vexlife.native-worker-control/v1', workerRef: loaded.manifest.workerRef, generation: Number(prior.generation ?? 0) + 1, action, requestedAt: nowIso(now) };
  writeAtomic(controlPath(root), control);
  return control;
}

export function markNativeWorkerWaiting(root, reason, { now } = {}) {
  const loaded = loadNativeWorker(root);
  if (!['STANDING_BY', 'PAUSED'].includes(loaded.receipt.state)) fail('NWS_NOT_WAITABLE', `worker cannot enter WAITING from ${loaded.receipt.state}`);
  const receipt = writeReceipt(root, loaded.manifest, 'WAITING', { pid: null, waitingReason: text(reason, 'waitingReason', { max: 180, code: 'NWS_WAIT_INVALID' }), terminalEvidence: null }, now);
  return { receipt, workPulse: projectHumanWorkPulse(receipt) };
}

export function markNativeWorkerStandingBy(root, { now } = {}) {
  const loaded = loadNativeWorker(root);
  if (!['WAITING', 'PAUSED'].includes(loaded.receipt.state)) fail('NWS_NOT_STANDBY', `worker cannot enter STANDING_BY from ${loaded.receipt.state}`);
  const receipt = writeReceipt(root, loaded.manifest, 'STANDING_BY', { pid: null, waitingReason: null, terminalEvidence: null }, now);
  return { receipt, workPulse: projectHumanWorkPulse(receipt) };
}

export function consumeNativeWorkerResult(root, input, { now } = {}) {
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
  writeAtomic(completionPath(root), completion);
  const receipt = writeReceipt(root, loaded.manifest, 'DONE', { pid: null, waitingReason: null, terminalEvidence: loaded.receipt.terminalEvidence, resultRef: input.resultRef }, now);
  return { receipt, completion, workPulse: projectHumanWorkPulse(receipt, completion) };
}

export function launchDetachedNativeWorkerHost({ workerRoot: root, cliPath, now } = {}) {
  const loaded = loadNativeWorker(root);
  if (!['STANDING_BY', 'PAUSED'].includes(loaded.receipt.state)) fail('NWS_NOT_RUNNABLE', `worker cannot launch from ${loaded.receipt.state}`);
  const cli = path.resolve(text(cliPath, 'cliPath', { max: 4096 }));
  if (!fs.existsSync(cli) || !fs.lstatSync(cli).isFile()) fail('NWS_CLI_INVALID', 'native worker CLI is missing');
  const supervisorOut = fs.openSync(path.join(root, 'supervisor.log'), 'a', 0o600);
  const supervisorErr = fs.openSync(path.join(root, 'supervisor.err.log'), 'a', 0o600);
  const child = spawn(process.execPath, [cli, 'host', '--worker-root', root], {
    cwd: loaded.host.sourceRoot,
    detached: true,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', supervisorOut, supervisorErr]
  });
  const pid = child.pid;
  child.unref();
  try { fs.closeSync(supervisorOut); } catch {}
  try { fs.closeSync(supervisorErr); } catch {}
  if (!Number.isInteger(pid)) fail('NWS_HOST_SPAWN_FAILED', 'detached supervisor host did not return a pid');
  return { hostPid: pid, workerRef: loaded.manifest.workerRef, launchedAt: nowIso(now), workPulse: loaded.workPulse };
}

// [VXG RealForever]
