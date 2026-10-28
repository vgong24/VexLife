import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  observeMacUserLaunchdProcess,
  retireMacUserLaunchdProcess,
  startMacUserLaunchdProcess,
  validateMacUserLaunchdProcessReceipt,
} from './macos-user-launchd-process.mjs';
import { semanticHash } from './utils.mjs';

export const HERETIC_PERSISTENT_RUNTIME_BINDING_SCHEMA =
  'vexlife.heretic-persistent-runtime-owner-binding/v1';
export const HERETIC_PERSISTENT_RUNTIME_RECEIPT_SCHEMA =
  'vexlife.heretic-persistent-runtime-owner-receipt/v1';
export const HERETIC_PERSISTENT_RUNTIME_STARTING =
  'PERSISTENT_MLX_RUNTIME_STARTING';
export const HERETIC_PERSISTENT_RUNTIME_QUALIFIED =
  'PERSISTENT_MLX_RUNTIME_QUALIFIED';
export const HERETIC_RUNTIME_OWNER_MODULE_PATH =
  'src/core/heretic-persistent-runtime-owner.mjs';
export const HERETIC_HOST_RESOURCE_REF = 'resource.vexlife.heretic.persistent-runtime';
export const HERETIC_HOST_RESOURCE_CLASS = 'HERETIC_PERSISTENT_MLX_RUNTIME';
export const HERETIC_PERSISTENT_RUNTIME_OWNER_REF = 'owner.vexlife.heretic-persistent-runtime.001';
export const HERETIC_PERSISTENT_RUNTIME_STOP_ACTION_REF =
  'action.vexlife.heretic-persistent-runtime.stop-exact-owned-runtime';

const OWNER_FILE = fileURLToPath(import.meta.url);
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const REQUEST_MODEL = 'default_model';
const RUNTIME_CLASS = 'MLX_LM_DIRECT_RUNTIME';
const TRANSPORT_CLASS = 'MLX_LM_OPENAI_NUMERIC_LOOPBACK';
const HOST_PROFILE_REF = 'profile.repository.vexlife.macos-v1';
const MODEL_REF = 'model.devex.heretic.qwen3.8-27b.mlx4.329658ee8f27';
const MODEL_PROFILE_REF = 'model-profile.devex.qwen38-27b-heretic-mlx4.certified.20260928A';
const ARTIFACT_REF = 'artifact.devex.qwen3.8-27b-heretic-mlx-4bit.808b82a2';
const ARTIFACT_CUSTODY_REF =
  'resolution.model-preservation.artifact-custody.devex.qwen38-27b-heretic-mlx4.20260928A';
const ARTIFACT_CONTENT_SET_SHA256 =
  '329658ee8f270056bc29d8a6cfd6e9f1b7d9d14c659452c9e4dd46fc7c78d780';
const RUNTIME_ADAPTER_REF = 'adapter.runtime.mlx.macos-victor.001';
const PYTHON_VERSION = '3.14.7';
const MLX_LM_VERSION = '0.32.0';
const TRAINER_SOURCE_COMMIT = '170a11c58ce7d22a720901a2535adb0c218b871b';
const STARTUP_TIMEOUT_MS = 600000;
export const HERETIC_QUALIFICATION_COMPLETION_TIMEOUT_MS = 180000;
const POLL_MS = 500;

const EFFECTS = Object.freeze({
  modelRuntime: true,
  providerNetwork: false,
  modelDownload: false,
  artifactMutation: false,
  training: false,
  weightMutation: false,
  memoryMutation: false,
  activation: false,
  succession: false,
  publication: false,
  repositoryMutation: false,
  homeMutation: false,
});

export class HereticPersistentRuntimeOwnerError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = 'HereticPersistentRuntimeOwnerError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, message, detail = null) {
  throw new HereticPersistentRuntimeOwnerError(code, message, detail);
}
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('OBJECT_REQUIRED', `${label} must be one object`);
  }
  return value;
}
function stableRef(value, label) {
  if (typeof value !== 'string' || !REF_RE.test(value) || path.isAbsolute(value)) {
    fail('STABLE_REF_REQUIRED', `${label} must be one stable ref`);
  }
}
function absolute(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    fail('ABSOLUTE_PATH_REQUIRED', `${label} must be absolute`);
  }
  return path.resolve(value);
}
function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
function exact(actual, expected, code, label) {
  if (actual !== expected) fail(code, `${label} mismatch`, { actual, expected });
}
function endpoint(port) {
  return `http://127.0.0.1:${port}`;
}
function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { fail('HERETIC_RUNTIME_RECEIPT_INVALID', 'runtime receipt is unreadable or malformed'); }
}
function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temp = `${filePath}.partial-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, filePath);
}
function removeFile(filePath) {
  fs.rmSync(filePath, { force: true });
}

export function currentHereticRuntimeOwnerSourceIdentity() {
  return Object.freeze({
    repository: 'vgong24/VexLife',
    modulePath: HERETIC_RUNTIME_OWNER_MODULE_PATH,
    moduleSha256: sha256(fs.readFileSync(OWNER_FILE)),
  });
}

function validateSourceIdentity(value, { requireCurrent = true } = {}) {
  object(value, 'binding.sourceIdentity');
  exact(value.repository, 'vgong24/VexLife', 'HERETIC_RUNTIME_SOURCE_REPOSITORY_MISMATCH', 'sourceIdentity.repository');
  exact(value.modulePath, HERETIC_RUNTIME_OWNER_MODULE_PATH, 'HERETIC_RUNTIME_SOURCE_MODULE_MISMATCH', 'sourceIdentity.modulePath');
  if (!SHA256_RE.test(value.moduleSha256 ?? '')) {
    fail('HERETIC_RUNTIME_SOURCE_SHA256_REQUIRED', 'sourceIdentity.moduleSha256 must be lowercase SHA-256');
  }
  if (requireCurrent) {
    const current = currentHereticRuntimeOwnerSourceIdentity();
    exact(value.moduleSha256, current.moduleSha256, 'HERETIC_RUNTIME_SOURCE_SHA256_MISMATCH', 'sourceIdentity.moduleSha256');
  }
  return Object.freeze({ ...value });
}

export function validateHereticPersistentRuntimeBinding(input, { requireCurrentSource = true } = {}) {
  object(input, 'binding');
  exact(input.schemaVersion, HERETIC_PERSISTENT_RUNTIME_BINDING_SCHEMA, 'HERETIC_RUNTIME_BINDING_SCHEMA_MISMATCH', 'schemaVersion');
  stableRef(input.authorityRef, 'authorityRef');
  for (const [field, expected] of [
    ['modelRef', MODEL_REF],
    ['modelProfileRef', MODEL_PROFILE_REF],
    ['artifactRef', ARTIFACT_REF],
    ['artifactCustodyEvidenceRef', ARTIFACT_CUSTODY_REF],
    ['artifactContentSetSha256', ARTIFACT_CONTENT_SET_SHA256],
    ['runtimeAdapterRef', RUNTIME_ADAPTER_REF],
    ['runtimeClass', RUNTIME_CLASS],
    ['hostExecutionProfileRef', HOST_PROFILE_REF],
    ['pythonVersion', PYTHON_VERSION],
    ['mlxLmVersion', MLX_LM_VERSION],
    ['trainerSourceCommit', TRAINER_SOURCE_COMMIT],
  ]) exact(input[field], expected, 'HERETIC_RUNTIME_BINDING_MISMATCH', field);
  if (!Number.isInteger(input.port) || input.port < 1024 || input.port > 65535) {
    fail('HERETIC_RUNTIME_PORT_INVALID', 'port must be an unprivileged numeric TCP port');
  }
  const modelPath = absolute(input.modelPath, 'modelPath');
  const pythonPath = absolute(input.pythonPath, 'pythonPath');
  const pythonEnvironmentRoot = absolute(input.pythonEnvironmentRoot, 'pythonEnvironmentRoot');
  const receiptPath = absolute(input.receiptPath, 'receiptPath');
  const sourceIdentity = validateSourceIdentity(input.sourceIdentity, { requireCurrent: requireCurrentSource });
  return Object.freeze({ ...input, modelPath, pythonPath, pythonEnvironmentRoot, receiptPath, sourceIdentity });
}

export function hereticPersistentRuntimeServerArgs(bindingInput, { requireCurrentSource = true } = {}) {
  const binding = validateHereticPersistentRuntimeBinding(bindingInput, { requireCurrentSource });
  return Object.freeze([
    '-m', 'mlx_lm.server',
    '--model', binding.modelPath,
    '--host', '127.0.0.1',
    '--port', String(binding.port),
    '--chat-template-args', '{"enable_thinking":false}',
  ]);
}

function defaultVersionProbe(pythonPath) {
  const program = 'import importlib.metadata as md,json,sys;print(json.dumps({"pythonVersion":"%d.%d.%d"%sys.version_info[:3],"mlxLmVersion":md.version("mlx-lm"),"prefix":sys.prefix,"executable":sys.executable}))';
  const result = spawnSync(pythonPath, ['-c', program], { encoding: 'utf8', shell: false, timeout: 15000 });
  if (result.error || result.status !== 0) {
    fail('HERETIC_RUNTIME_VERSION_PROBE_FAILED', 'unable to verify Python/mlx-lm environment', { stderr: String(result.stderr || '') });
  }
  try { return JSON.parse(result.stdout); }
  catch { fail('HERETIC_RUNTIME_VERSION_PROBE_FAILED', 'runtime version probe returned invalid JSON'); }
}
function processAlive(pid) {
  try { process.kill(Number(pid), 0); return true; }
  catch { return false; }
}
function processIdentity({ pid, args }) {
  if (process.platform !== 'darwin' || !processAlive(pid)) return null;
  const result = spawnSync('/bin/ps', ['-ww', '-p', String(pid), '-o', 'pid=,pgid=,command='], { encoding: 'utf8', shell: false });
  if (result.error || result.status !== 0) return null;
  const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/u.exec(String(result.stdout || '').trim());
  if (!match) return null;
  const observedPid = Number(match[1]);
  const processGroupId = Number(match[2]);
  const commandLine = match[3];
  const commandMatches = commandLine.endsWith(` ${args.join(' ')}`);
  return {
    pid: observedPid,
    pgid: processGroupId,
    commandMatches,
    exactOwnedDetachedGroup: observedPid === pid && processGroupId === pid && commandMatches,
  };
}
function listMatchingProcesses({ args }) {
  if (process.platform !== 'darwin') return [];
  const result = spawnSync('/bin/ps', ['-ww', '-axo', 'pid=,pgid=,command='], { encoding: 'utf8', shell: false });
  if (result.error || result.status !== 0) fail('HERETIC_RUNTIME_PROCESS_CENSUS_FAILED', 'unable to inspect MLX process census');
  const tail = ` ${args.join(' ')}`;
  return String(result.stdout || '').split('\n')
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/u.exec(line))
    .filter(Boolean)
    .filter((match) => match[3].endsWith(tail))
    .map((match) => ({ pid: Number(match[1]), pgid: Number(match[2]), command: match[3] }));
}
function portOccupied(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (value) => { socket.destroy(); resolve(value); };
    socket.setTimeout(700);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}
function inheritedMacProcessEnvironment() {
  const result = {};
  for (const key of ['HOME', 'PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'USER']) {
    if (typeof process.env[key] === 'string' && process.env[key].length > 0) result[key] = process.env[key];
  }
  return result;
}
const HERETIC_PROCESS_GROUP_WRAPPER =
  'import os,sys; pid=os.getpid(); pgid=os.getpgrp(); os.setpgid(0,0) if pgid != pid else None; os.execv(sys.argv[1], sys.argv[1:])';
async function spawnRuntime({ binding, args }) {
  const runtimeDir = path.dirname(binding.receiptPath);
  fs.mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });
  const processSubstrate = await startMacUserLaunchdProcess({
    label: `com.vexlife.heretic.${crypto.randomUUID().toLowerCase()}`,
    plistPath: path.join(runtimeDir, 'launchd', `heretic-${crypto.randomUUID().toLowerCase()}.plist`),
    programPath: binding.pythonPath,
    programArguments: ['-c', HERETIC_PROCESS_GROUP_WRAPPER, binding.pythonPath, ...args],
    workingDirectory: binding.pythonEnvironmentRoot,
    stdoutPath: path.join(runtimeDir, 'mlx-lm-server.out.log'),
    stderrPath: path.join(runtimeDir, 'mlx-lm-server.err.log'),
    environment: inheritedMacProcessEnvironment(),
  });
  return Object.freeze({ pid: processSubstrate.pid, processSubstrate });
}
async function terminateRuntime({
  pid,
  args,
  processSubstrate = null,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (processSubstrate !== null) {
    let substrate;
    try { substrate = validateMacUserLaunchdProcessReceipt(processSubstrate); }
    catch (error) {
      return { state: 'PROCESS_SUBSTRATE_INVALID', exactOwnershipVerified: false, verifiedNotLive: !processAlive(pid), error: error.message };
    }
    if (substrate.pid !== pid) {
      return { state: 'PROCESS_SUBSTRATE_PID_MISMATCH', exactOwnershipVerified: false, verifiedNotLive: !processAlive(pid) };
    }
    if (!processAlive(pid)) {
      try {
        const retired = await retireMacUserLaunchdProcess(substrate, { expectedPid: pid });
        return { ...retired, processGroupId: pid };
      } catch (error) {
        return { state: 'PROCESS_SUBSTRATE_RETIRE_FAILED', exactOwnershipVerified: true, verifiedNotLive: true, processGroupId: pid, error: error.message };
      }
    }
    const first = processIdentity({ pid, args });
    if (!first?.exactOwnedDetachedGroup) {
      return { state: 'OWNERSHIP_NOT_PROVEN', exactOwnershipVerified: false, verifiedNotLive: false };
    }
    const observed = observeMacUserLaunchdProcess(substrate);
    if (observed.state !== 'RUNNING' || observed.pid !== pid) {
      return { state: 'PROCESS_SUBSTRATE_OWNERSHIP_NOT_PROVEN', exactOwnershipVerified: false, verifiedNotLive: false, processGroupId: first.pgid };
    }
    try {
      const retired = await retireMacUserLaunchdProcess(substrate, { expectedPid: pid });
      return { ...retired, processGroupId: first.pgid };
    } catch (error) {
      return { state: 'PROCESS_SUBSTRATE_RETIRE_FAILED', exactOwnershipVerified: true, verifiedNotLive: !processAlive(pid), processGroupId: first.pgid, error: error.message };
    }
  }

  const first = processIdentity({ pid, args });
  if (!first?.exactOwnedDetachedGroup) {
    return { state: 'OWNERSHIP_NOT_PROVEN', exactOwnershipVerified: false, verifiedNotLive: !processAlive(pid) };
  }
  try { process.kill(-first.pgid, 'SIGTERM'); }
  catch (error) { return { state: 'SIGTERM_FAILED', exactOwnershipVerified: true, verifiedNotLive: false, error: error.message }; }
  for (let i = 0; i < 50 && processAlive(pid); i += 1) await sleep(100);
  if (!processAlive(pid)) {
    return { state: 'RETIRED_VERIFIED', exactOwnershipVerified: true, verifiedNotLive: true, signalSent: 'SIGTERM', processGroupId: first.pgid };
  }
  const again = processIdentity({ pid, args });
  if (!again?.exactOwnedDetachedGroup || again.pgid !== first.pgid) {
    return { state: 'IDENTITY_CHANGED_BEFORE_ESCALATION', exactOwnershipVerified: false, verifiedNotLive: false };
  }
  try { process.kill(-first.pgid, 'SIGKILL'); }
  catch (error) { return { state: 'SIGKILL_FAILED', exactOwnershipVerified: true, verifiedNotLive: false, error: error.message }; }
  for (let i = 0; i < 30 && processAlive(pid); i += 1) await sleep(100);
  return {
    state: processAlive(pid) ? 'RETIREMENT_NOT_VERIFIED' : 'RETIRED_VERIFIED',
    exactOwnershipVerified: true,
    verifiedNotLive: !processAlive(pid),
    signalSent: 'SIGKILL',
    processGroupId: first.pgid,
  };
}
async function requestJson(fetchImpl, url, options, code, label) {
  let response;
  try { response = await fetchImpl(url, options); }
  catch (error) { fail(code, `${label} request failed`, { message: error?.message || String(error) }); }
  if (!response?.ok) fail(code, `${label} request failed`, { status: response?.status ?? null });
  try { return await response.json(); }
  catch { fail(code, `${label} returned non-JSON content`); }
}
async function qualify(binding, fetchImpl) {
  const origin = endpoint(binding.port);
  const health = await requestJson(fetchImpl, `${origin}/health`, { signal: AbortSignal.timeout(5000) }, 'HERETIC_RUNTIME_QUALIFICATION_FAILED', 'MLX health');
  if (health?.status !== 'ok') fail('HERETIC_RUNTIME_QUALIFICATION_FAILED', 'MLX health response is not exact ok');
  const models = await requestJson(fetchImpl, `${origin}/v1/models`, { signal: AbortSignal.timeout(5000) }, 'HERETIC_RUNTIME_QUALIFICATION_FAILED', 'MLX model identity');
  const ids = Array.isArray(models?.data) ? models.data.map((entry) => entry?.id).filter((value) => typeof value === 'string') : [];
  const exactMatches = ids.filter((value) => path.resolve(value) === binding.modelPath);
  if (exactMatches.length !== 1) {
    fail('HERETIC_RUNTIME_MODEL_IDENTITY_MISMATCH', 'MLX /v1/models must expose the exact Heretic materialization exactly once', { observedIds: ids.length, exactMatches: exactMatches.length });
  }
  const request = {
    model: REQUEST_MODEL,
    messages: [{ role: 'user', content: 'Reply with OK.' }],
    max_tokens: 1,
    temperature: 0,
    stream: false,
    chat_template_kwargs: { enable_thinking: false },
  };
  const completion = await requestJson(fetchImpl, `${origin}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(HERETIC_QUALIFICATION_COMPLETION_TIMEOUT_MS),
  }, 'HERETIC_RUNTIME_QUALIFICATION_FAILED', 'MLX chat completion');
  if (completion?.model !== REQUEST_MODEL) {
    fail('HERETIC_RUNTIME_QUALIFICATION_FAILED', 'MLX response model does not match the exact request model');
  }
  const content = completion?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    fail('HERETIC_RUNTIME_QUALIFICATION_FAILED', 'MLX qualification returned empty content');
  }
  return Object.freeze({
    healthAndExactModelVerified: true,
    actualChatCompletionPerformed: true,
    loadResultRef: null,
    qualificationInferenceEffect: true,
    qualificationOutputPersisted: false,
    livedConversationEffect: false,
  });
}
async function endpointHealthy(binding, fetchImpl) {
  try {
    const response = await fetchImpl(`${endpoint(binding.port)}/health`, { signal: AbortSignal.timeout(1500) });
    if (!response?.ok) return false;
    const payload = await response.json();
    return payload?.status === 'ok';
  } catch { return false; }
}
async function waitForHealthy(binding, pid, deps) {
  const deadline = deps.nowMs() + STARTUP_TIMEOUT_MS;
  while (deps.nowMs() < deadline) {
    if (deps.cancellationRequested()) fail('HERETIC_RUNTIME_CANCELLED', 'Heretic runtime start was cancelled');
    if (!deps.processAlive(pid)) fail('HERETIC_RUNTIME_START_FAILED', 'mlx_lm.server exited before startup readiness');
    if (await deps.endpointHealthy(binding)) return;
    await deps.sleep(POLL_MS);
  }
  fail('HERETIC_RUNTIME_START_FAILED', 'mlx_lm.server did not become healthy before bounded startup timeout');
}

function receiptBinds(binding, receipt, args, { allowStarting = true, requireSourceSha = true } = {}) {
  if (!object(receipt)) return false;
  if (receipt.schemaVersion !== HERETIC_PERSISTENT_RUNTIME_RECEIPT_SCHEMA) return false;
  if (receipt.state !== HERETIC_PERSISTENT_RUNTIME_QUALIFIED && !(allowStarting && receipt.state === HERETIC_PERSISTENT_RUNTIME_STARTING)) return false;
  for (const field of [
    'authorityRef','modelRef','modelProfileRef','artifactRef','artifactCustodyEvidenceRef','artifactContentSetSha256',
    'runtimeAdapterRef','runtimeClass','hostExecutionProfileRef','pythonVersion','mlxLmVersion','trainerSourceCommit',
    'modelPath','pythonPath','pythonEnvironmentRoot'
  ]) if (receipt[field] !== binding[field]) return false;
  if (receipt.endpoint !== endpoint(binding.port)
      || receipt.requestModel !== REQUEST_MODEL
      || receipt.sourceIdentity?.repository !== 'vgong24/VexLife'
      || receipt.sourceIdentity?.modulePath !== HERETIC_RUNTIME_OWNER_MODULE_PATH
      || !SHA256_RE.test(receipt.sourceIdentity?.moduleSha256 ?? '')
      || JSON.stringify(receipt.runtime?.args) !== JSON.stringify(args)) return false;
  if (receipt.runtime?.processSubstrate !== undefined) {
    try {
      const substrate = validateMacUserLaunchdProcessReceipt(receipt.runtime.processSubstrate);
      if (substrate.pid !== receipt.runtime?.pid || substrate.keepAlive !== false) return false;
    } catch { return false; }
  }
  return requireSourceSha ? receipt.sourceIdentity.moduleSha256 === binding.sourceIdentity.moduleSha256 : true;
}
function formReceipt(binding, pid, identity, state, formedAt, receiptRef, qualification = undefined, processSubstrate = null) {
  const runtime = {
    pid,
    processGroupId: identity.pgid,
    exactOwnedDetachedGroup: true,
    args: hereticPersistentRuntimeServerArgs(binding),
  };
  if (processSubstrate !== null) runtime.processSubstrate = validateMacUserLaunchdProcessReceipt(processSubstrate);
  const value = {
    schemaVersion: HERETIC_PERSISTENT_RUNTIME_RECEIPT_SCHEMA,
    receiptRef,
    state,
    formedAt,
    authorityRef: binding.authorityRef,
    modelRef: binding.modelRef,
    modelProfileRef: binding.modelProfileRef,
    artifactRef: binding.artifactRef,
    artifactCustodyEvidenceRef: binding.artifactCustodyEvidenceRef,
    artifactContentSetSha256: binding.artifactContentSetSha256,
    runtimeAdapterRef: binding.runtimeAdapterRef,
    runtimeClass: binding.runtimeClass,
    transportClass: TRANSPORT_CLASS,
    hostExecutionProfileRef: binding.hostExecutionProfileRef,
    pythonVersion: binding.pythonVersion,
    mlxLmVersion: binding.mlxLmVersion,
    trainerSourceCommit: binding.trainerSourceCommit,
    modelPath: binding.modelPath,
    pythonPath: binding.pythonPath,
    pythonEnvironmentRoot: binding.pythonEnvironmentRoot,
    endpoint: endpoint(binding.port),
    requestModel: REQUEST_MODEL,
    sourceIdentity: binding.sourceIdentity,
    runtime,
    effects: EFFECTS,
  };
  if (qualification !== undefined) value.qualification = qualification;
  return Object.freeze(value);
}
function defaultDeps(overrides = {}) {
  return {
    host: overrides.host ?? { platform: process.platform, architecture: process.arch },
    versionProbe: overrides.versionProbe ?? defaultVersionProbe,
    processAlive: overrides.processAlive ?? processAlive,
    processIdentity: overrides.processIdentity ?? processIdentity,
    listMatchingProcesses: overrides.listMatchingProcesses ?? listMatchingProcesses,
    portOccupied: overrides.portOccupied ?? portOccupied,
    spawnRuntime: overrides.spawnRuntime ?? spawnRuntime,
    terminateRuntime: overrides.terminateRuntime ?? terminateRuntime,
    observeProcessSubstrate: overrides.observeProcessSubstrate ?? observeMacUserLaunchdProcess,
    retireProcessSubstrate: overrides.retireProcessSubstrate ?? retireMacUserLaunchdProcess,
    readReceipt: overrides.readReceipt ?? readJson,
    writeReceipt: overrides.writeReceipt ?? writeJsonAtomic,
    deleteReceipt: overrides.deleteReceipt ?? removeFile,
    fetchImpl: overrides.fetchImpl ?? globalThis.fetch,
    endpointHealthy: overrides.endpointHealthy ?? ((binding) => endpointHealthy(binding, overrides.fetchImpl ?? globalThis.fetch)),
    sleep: overrides.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    now: overrides.now ?? (() => new Date().toISOString()),
    nowMs: overrides.nowMs ?? (() => Date.now()),
    cancellationRequested: overrides.cancellationRequested ?? (() => false),
  };
}

function runtimeProcessSubstrateCurrent(receipt, deps) {
  if (receipt.runtime?.processSubstrate === undefined) return true;
  try {
    const substrate = validateMacUserLaunchdProcessReceipt(receipt.runtime.processSubstrate);
    const observed = deps.observeProcessSubstrate(substrate);
    return substrate.pid === receipt.runtime.pid && observed.state === 'RUNNING' && observed.pid === receipt.runtime.pid;
  } catch { return false; }
}

async function retireDeadProcessSubstrate(receipt, deps) {
  if (receipt?.runtime?.processSubstrate === undefined) return null;
  const retired = await deps.retireProcessSubstrate(receipt.runtime.processSubstrate, { expectedPid: Number(receipt.runtime.pid) });
  if (retired?.exactOwnershipVerified !== true || retired?.verifiedNotLive !== true) {
    fail('HERETIC_RUNTIME_STOP_UNVERIFIED', 'dead Heretic launchd substrate could not be retired', retired);
  }
  return retired;
}
function hostResourceObservation({
  ownershipState,
  lifecycleState,
  lifecycleEvidenceRefOrNull = null,
  ownershipProof = null,
  sourceRefs
}) {
  const core = {
    schemaVersion: 'vexlife.host-resource-observation/v1',
    truthClass: 'SOURCE_BOUND_HOST_RESOURCE_OBSERVATION',
    resourceRef: HERETIC_HOST_RESOURCE_REF,
    resourceClass: HERETIC_HOST_RESOURCE_CLASS,
    ownershipState,
    lifecycleState,
    lifecycleEvidenceRefOrNull,
    currentness: 'CURRENT',
    ownershipProof,
    sourceRefs: [...new Set(sourceRefs)].sort()
  };
  const semanticFingerprint = semanticHash(core);
  return Object.freeze({
    ...core,
    resourceObservationRef: `observation.vexlife.host-resource.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

function bindingFromRuntimeReceipt(receipt, receiptPath) {
  const port = Number(new URL(receipt.endpoint).port);
  return {
    schemaVersion: HERETIC_PERSISTENT_RUNTIME_BINDING_SCHEMA,
    authorityRef: receipt.authorityRef,
    modelRef: receipt.modelRef,
    modelProfileRef: receipt.modelProfileRef,
    artifactRef: receipt.artifactRef,
    artifactCustodyEvidenceRef: receipt.artifactCustodyEvidenceRef,
    artifactContentSetSha256: receipt.artifactContentSetSha256,
    runtimeAdapterRef: receipt.runtimeAdapterRef,
    runtimeClass: receipt.runtimeClass,
    hostExecutionProfileRef: receipt.hostExecutionProfileRef,
    pythonVersion: receipt.pythonVersion,
    mlxLmVersion: receipt.mlxLmVersion,
    trainerSourceCommit: receipt.trainerSourceCommit,
    modelPath: receipt.modelPath,
    pythonPath: receipt.pythonPath,
    pythonEnvironmentRoot: receipt.pythonEnvironmentRoot,
    port,
    receiptPath,
    sourceIdentity: receipt.sourceIdentity
  };
}

export function observeHereticPersistentRuntimeResource({ receiptPath, hooks = {} } = {}) {
  const absoluteReceipt = absolute(receiptPath, 'receiptPath');
  const deps = defaultDeps(hooks);
  const currentSource = currentHereticRuntimeOwnerSourceIdentity();
  const ownerSourceRef = `source.vexlife.heretic-persistent-runtime-owner.${currentSource.moduleSha256}`;
  const receipt = deps.readReceipt(absoluteReceipt);
  if (!receipt) {
    return hostResourceObservation({
      ownershipState: 'UNOWNED',
      lifecycleState: 'UNKNOWN',
      sourceRefs: [ownerSourceRef]
    });
  }
  const receiptRef = typeof receipt.receiptRef === 'string' && REF_RE.test(receipt.receiptRef)
    ? receipt.receiptRef
    : null;
  if (!receiptRef) {
    return hostResourceObservation({
      ownershipState: 'UNKNOWN',
      lifecycleState: 'UNKNOWN',
      sourceRefs: [ownerSourceRef]
    });
  }

  let binding;
  let args;
  try {
    binding = validateHereticPersistentRuntimeBinding(
      bindingFromRuntimeReceipt(receipt, absoluteReceipt),
      { requireCurrentSource: false }
    );
    args = hereticPersistentRuntimeServerArgs(binding, { requireCurrentSource: false });
  } catch {
    return hostResourceObservation({
      ownershipState: 'UNKNOWN',
      lifecycleState: 'UNKNOWN',
      sourceRefs: [ownerSourceRef, receiptRef]
    });
  }
  if (!receiptBinds(binding, receipt, args, { allowStarting: true, requireSourceSha: false })) {
    return hostResourceObservation({
      ownershipState: 'AMBIGUOUS',
      lifecycleState: 'UNKNOWN',
      sourceRefs: [ownerSourceRef, receiptRef]
    });
  }

  const pid = Number(receipt.runtime?.pid);
  if (!Number.isInteger(pid) || pid <= 0 || !deps.processAlive(pid)) {
    const evidence = `evidence.vexlife.heretic.not-live.${semanticHash({ receiptRef, pid: Number.isInteger(pid) ? pid : null }).slice(0, 32)}`;
    return hostResourceObservation({
      ownershipState: 'UNOWNED',
      lifecycleState: 'ABANDONED',
      lifecycleEvidenceRefOrNull: evidence,
      sourceRefs: [ownerSourceRef, receiptRef]
    });
  }

  const identity = deps.processIdentity({ pid, args });
  if (!identity?.exactOwnedDetachedGroup || identity.pgid !== receipt.runtime?.processGroupId || !runtimeProcessSubstrateCurrent(receipt, deps)) {
    return hostResourceObservation({
      ownershipState: 'AMBIGUOUS',
      lifecycleState: 'UNKNOWN',
      sourceRefs: [ownerSourceRef, receiptRef]
    });
  }

  const sourceCurrent = receipt.sourceIdentity.moduleSha256 === currentSource.moduleSha256;
  const lifecycleState = sourceCurrent || receipt.state === HERETIC_PERSISTENT_RUNTIME_STARTING
    ? 'CURRENT'
    : 'STALE';
  const lifecycleEvidenceRefOrNull = lifecycleState === 'STALE'
    ? `evidence.vexlife.heretic.source-stale.${semanticHash({ prior: receipt.sourceIdentity.moduleSha256, current: currentSource.moduleSha256 }).slice(0, 32)}`
    : null;
  const executableIdentityRef = `executable.vexlife.heretic.python.${sha256(Buffer.from(receipt.pythonPath)).slice(0, 32)}`;
  return hostResourceObservation({
    ownershipState: 'EXACT_VEX_OWNED',
    lifecycleState,
    lifecycleEvidenceRefOrNull,
    ownershipProof: {
      currentness: 'CURRENT',
      ownerReceiptRef: receiptRef,
      runtimeIdentityRef: `runtime.vexlife.heretic.process.${pid}`,
      executableIdentityRef,
      processGroupIdentityRef: `process-group.vexlife.heretic.${identity.pgid}`,
      pidMatchOnly: false,
      exactOwnedProcessInstance: true
    },
    sourceRefs: [ownerSourceRef, receiptRef]
  });
}

export async function startOrReuseHereticPersistentRuntime({ binding: input, hooks = {} }) {
  const binding = validateHereticPersistentRuntimeBinding(input);
  const deps = defaultDeps(hooks);
  if (deps.host.platform !== 'darwin' || deps.host.architecture !== 'arm64') {
    fail('HERETIC_RUNTIME_HOST_MISMATCH', 'Heretic persistent runtime requires darwin/arm64');
  }
  if (deps.cancellationRequested()) fail('HERETIC_RUNTIME_CANCELLED', 'Heretic runtime start was cancelled');
  const versions = await deps.versionProbe(binding.pythonPath);
  if (deps.cancellationRequested()) fail('HERETIC_RUNTIME_CANCELLED', 'Heretic runtime start was cancelled');
  exact(versions.pythonVersion, PYTHON_VERSION, 'HERETIC_RUNTIME_VERSION_MISMATCH', 'pythonVersion');
  exact(versions.mlxLmVersion, MLX_LM_VERSION, 'HERETIC_RUNTIME_VERSION_MISMATCH', 'mlxLmVersion');
  if (path.resolve(versions.prefix ?? '') !== binding.pythonEnvironmentRoot || path.resolve(versions.executable ?? '') !== binding.pythonPath) {
    fail('HERETIC_RUNTIME_VERSION_MISMATCH', 'Python environment identity does not match the accepted Heretic environment');
  }
  const args = hereticPersistentRuntimeServerArgs(binding);
  const prior = deps.readReceipt(binding.receiptPath);
  let staleSourceRotated = false;
  if (prior && !receiptBinds(binding, prior, args) && receiptBinds(binding, prior, args, { requireSourceSha: false })) {
    const priorPid = Number(prior.runtime?.pid);
    if (Number.isInteger(priorPid) && deps.processAlive(priorPid)) {
      const priorIdentity = deps.processIdentity({ pid: priorPid, args });
      if (!priorIdentity?.exactOwnedDetachedGroup || priorIdentity.pgid !== prior.runtime.processGroupId || !runtimeProcessSubstrateCurrent(prior, deps)) {
        fail('HERETIC_RUNTIME_PROCESS_OWNERSHIP_CONFLICT', 'stale-source Heretic receipt is live but exact ownership cannot be proven');
      }
      const retired = await deps.terminateRuntime({ pid: priorPid, args, processSubstrate: prior.runtime?.processSubstrate ?? null });
      if (retired?.exactOwnershipVerified !== true || retired?.verifiedNotLive !== true) {
        fail('HERETIC_RUNTIME_STOP_UNVERIFIED', 'stale-source Heretic runtime could not be retired before current-source restart', retired);
      }
    } else if (prior?.runtime?.processSubstrate !== undefined) {
      await retireDeadProcessSubstrate(prior, deps);
    }
    deps.deleteReceipt(binding.receiptPath);
    staleSourceRotated = true;
  } else if (prior && !receiptBinds(binding, prior, args)) {
    fail('HERETIC_RUNTIME_RECEIPT_BINDING_MISMATCH', 'existing Heretic runtime receipt does not match the current VexLife binding');
  }
  const currentPrior = staleSourceRotated ? null : prior;
  if (currentPrior && receiptBinds(binding, currentPrior, args)) {
    const pid = Number(currentPrior.runtime?.pid);
    if (Number.isInteger(pid) && deps.processAlive(pid)) {
      const identity = deps.processIdentity({ pid, args });
      if (!identity?.exactOwnedDetachedGroup || identity.pgid !== currentPrior.runtime.processGroupId || !runtimeProcessSubstrateCurrent(currentPrior, deps)) {
        fail('HERETIC_RUNTIME_PROCESS_OWNERSHIP_CONFLICT', 'live receipt process is not the exact owned Heretic process/lifetime substrate');
      }
      if (currentPrior.state === HERETIC_PERSISTENT_RUNTIME_STARTING) {
        try { await waitForHealthy(binding, pid, deps); }
        catch (error) {
          const cleanup = await deps.terminateRuntime({ pid, args, processSubstrate: currentPrior.runtime?.processSubstrate ?? null });
          if (cleanup?.verifiedNotLive !== true) fail('HERETIC_RUNTIME_PRECOMMIT_CLEANUP_FAILED', 'STARTING runtime recovery failed and cleanup was not verified', { originalError: error?.code || error?.message, cleanup });
          deps.deleteReceipt(binding.receiptPath);
          throw error;
        }
      }
      if (deps.cancellationRequested()) {
        const cleanup = await deps.terminateRuntime({ pid, args, processSubstrate: currentPrior.runtime?.processSubstrate ?? null });
        if (cleanup?.verifiedNotLive !== true) fail('HERETIC_RUNTIME_PRECOMMIT_CLEANUP_FAILED', 'cancelled runtime reuse could not be cleaned up', { cleanup });
        deps.deleteReceipt(binding.receiptPath);
        fail('HERETIC_RUNTIME_CANCELLED', 'Heretic runtime start was cancelled');
      }
      const qualification = await qualify(binding, deps.fetchImpl);
      const qualified = formReceipt(
        binding, pid, identity, HERETIC_PERSISTENT_RUNTIME_QUALIFIED, deps.now(), currentPrior.receiptRef,
        qualification, currentPrior.runtime?.processSubstrate ?? null,
      );
      deps.writeReceipt(binding.receiptPath, qualified);
      return Object.freeze({
        disposition: currentPrior.state === HERETIC_PERSISTENT_RUNTIME_STARTING ? 'RECOVERED_EXACT_STARTING_MLX_RUNTIME' : 'REUSED_EXACT_OWNED_MLX_RUNTIME',
        pid,
        endpoint: qualified.endpoint,
        requestModel: REQUEST_MODEL,
        receipt: qualified,
        receiptWritePerformed: true,
        qualification,
      });
    }
    if (currentPrior.runtime?.processSubstrate !== undefined) await retireDeadProcessSubstrate(currentPrior, deps);
    deps.deleteReceipt(binding.receiptPath);
  }
  if (deps.cancellationRequested()) fail('HERETIC_RUNTIME_CANCELLED', 'Heretic runtime start was cancelled');
  const matching = await deps.listMatchingProcesses({ args });
  if (matching.length !== 0) fail('HERETIC_RUNTIME_ORPHAN_OR_MULTIPLE_PROCESS_CONFLICT', 'matching mlx_lm.server exists without a current exact receipt', { matchingCount: matching.length });
  if (await deps.portOccupied(binding.port)) fail('HERETIC_RUNTIME_PORT_COLLISION', 'Heretic endpoint is occupied without exact ownership');
  const spawned = await deps.spawnRuntime({ binding, args });
  const pid = Number(typeof spawned === 'number' ? spawned : spawned?.pid);
  const processSubstrate = typeof spawned === 'number' ? null : (spawned?.processSubstrate ?? null);
  if (!Number.isInteger(pid) || pid <= 0) fail('HERETIC_RUNTIME_START_FAILED', 'mlx_lm.server returned no PID');
  let identity = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    identity = deps.processIdentity({ pid, args });
    if (identity?.exactOwnedDetachedGroup) break;
    if (!deps.processAlive(pid)) break;
    await deps.sleep(50);
  }
  if (!identity?.exactOwnedDetachedGroup) {
    const cleanup = await deps.terminateRuntime({ pid, args, processSubstrate });
    fail('HERETIC_RUNTIME_PROCESS_OWNERSHIP_CONFLICT', 'new Heretic process ownership could not be proven', cleanup);
  }
  const receiptRef = `receipt.vexlife.heretic-persistent-runtime.${sha256(Buffer.from(`${binding.sourceIdentity.moduleSha256}|${pid}|${deps.now()}`)).slice(0,24)}`;
  const starting = formReceipt(binding, pid, identity, HERETIC_PERSISTENT_RUNTIME_STARTING, deps.now(), receiptRef, undefined, processSubstrate);
  try { deps.writeReceipt(binding.receiptPath, starting); }
  catch (error) {
    const cleanup = await deps.terminateRuntime({ pid, args, processSubstrate });
    if (cleanup?.verifiedNotLive !== true) fail('HERETIC_RUNTIME_PRECOMMIT_CLEANUP_FAILED', 'STARTING receipt write failed and exact cleanup was not verified', { originalError: error?.message, cleanup });
    fail('HERETIC_RUNTIME_STARTING_RECEIPT_WRITE_FAILED', 'unable to record Heretic runtime ownership before readiness wait');
  }
  let qualification;
  try {
    if (deps.cancellationRequested()) fail('HERETIC_RUNTIME_CANCELLED', 'Heretic runtime start was cancelled');
    await waitForHealthy(binding, pid, deps);
    if (deps.cancellationRequested()) fail('HERETIC_RUNTIME_CANCELLED', 'Heretic runtime start was cancelled');
    qualification = await qualify(binding, deps.fetchImpl);
  } catch (error) {
    const cleanup = await deps.terminateRuntime({ pid, args, processSubstrate });
    if (cleanup?.verifiedNotLive !== true) fail('HERETIC_RUNTIME_PRECOMMIT_CLEANUP_FAILED', 'qualification failed and exact cleanup was not verified', { originalError: error?.code || error?.message, cleanup });
    deps.deleteReceipt(binding.receiptPath);
    throw error;
  }
  const qualified = formReceipt(binding, pid, identity, HERETIC_PERSISTENT_RUNTIME_QUALIFIED, deps.now(), receiptRef, qualification, processSubstrate);
  deps.writeReceipt(binding.receiptPath, qualified);
  return Object.freeze({
    disposition: staleSourceRotated ? 'ROTATED_STALE_SOURCE_AND_STARTED_NEW_EXACT_MLX_RUNTIME' : 'STARTED_NEW_EXACT_MLX_RUNTIME',
    pid,
    endpoint: qualified.endpoint,
    requestModel: REQUEST_MODEL,
    receipt: qualified,
    receiptWritePerformed: true,
    qualification,
  });
}

export async function stopHereticPersistentRuntime({ binding: input, hooks = {}, requireCurrentSource = true }) {
  const binding = validateHereticPersistentRuntimeBinding(input, { requireCurrentSource });
  const deps = defaultDeps(hooks);
  const args = hereticPersistentRuntimeServerArgs(binding, { requireCurrentSource });
  const receipt = deps.readReceipt(binding.receiptPath);
  if (!receipt) return Object.freeze({ disposition: 'NO_HERETIC_RUNTIME_RECEIPT', pid: null, processTerminationPerformed: false });
  if (!receiptBinds(binding, receipt, args)) {
    fail('HERETIC_RUNTIME_RECEIPT_BINDING_MISMATCH', 'exact current Heretic runtime receipt is required to stop');
  }
  const pid = Number(receipt.runtime?.pid);
  if (!Number.isInteger(pid) || !deps.processAlive(pid)) {
    if (receipt.runtime?.processSubstrate !== undefined) await retireDeadProcessSubstrate(receipt, deps);
    return Object.freeze({ disposition: 'ALREADY_NOT_LIVE', pid: Number.isInteger(pid) ? pid : null, processTerminationPerformed: false });
  }
  const identity = deps.processIdentity({ pid, args });
  if (!identity?.exactOwnedDetachedGroup || identity.pgid !== receipt.runtime.processGroupId || !runtimeProcessSubstrateCurrent(receipt, deps)) {
    fail('HERETIC_RUNTIME_PROCESS_OWNERSHIP_CONFLICT', 'refusing to retire a non-owned process/lifetime substrate');
  }
  const stopped = await deps.terminateRuntime({ pid, args, processSubstrate: receipt.runtime?.processSubstrate ?? null });
  if (stopped?.exactOwnershipVerified !== true || stopped?.verifiedNotLive !== true) {
    fail('HERETIC_RUNTIME_STOP_UNVERIFIED', 'exact Heretic runtime stop could not be verified', stopped);
  }
  return Object.freeze({ disposition: 'STOPPED_EXACT_OWNED_MLX_RUNTIME', pid, processTerminationPerformed: true, stop: stopped });
}

export async function stopHereticPersistentRuntimeFromReceipt({ receiptPath, hooks = {} }) {
  const absoluteReceipt = absolute(receiptPath, 'receiptPath');
  const receipt = (hooks.readReceipt ?? readJson)(absoluteReceipt);
  if (!receipt) return Object.freeze({ disposition: 'NO_HERETIC_RUNTIME_RECEIPT', pid: null, processTerminationPerformed: false });
  const port = Number(new URL(receipt.endpoint).port);
  const binding = {
    schemaVersion: HERETIC_PERSISTENT_RUNTIME_BINDING_SCHEMA,
    authorityRef: receipt.authorityRef,
    modelRef: receipt.modelRef,
    modelProfileRef: receipt.modelProfileRef,
    artifactRef: receipt.artifactRef,
    artifactCustodyEvidenceRef: receipt.artifactCustodyEvidenceRef,
    artifactContentSetSha256: receipt.artifactContentSetSha256,
    runtimeAdapterRef: receipt.runtimeAdapterRef,
    runtimeClass: receipt.runtimeClass,
    hostExecutionProfileRef: receipt.hostExecutionProfileRef,
    pythonVersion: receipt.pythonVersion,
    mlxLmVersion: receipt.mlxLmVersion,
    trainerSourceCommit: receipt.trainerSourceCommit,
    modelPath: receipt.modelPath,
    pythonPath: receipt.pythonPath,
    pythonEnvironmentRoot: receipt.pythonEnvironmentRoot,
    port,
    receiptPath: absoluteReceipt,
    sourceIdentity: receipt.sourceIdentity,
  };
  return stopHereticPersistentRuntime({ binding, hooks: { ...hooks, readReceipt: () => receipt }, requireCurrentSource: false });
}

// [VXG RealForever]
