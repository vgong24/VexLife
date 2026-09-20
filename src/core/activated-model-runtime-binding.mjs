import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

export const ACTIVATED_MODEL_RUNTIME_BINDINGS_SCHEMA = 'vexlife.activated-model-runtime-bindings/v1';
export const ACTIVATED_MODEL_CUSTODY_HANDOFF_SCHEMA = 'vexlife.activated-model-custody-handoff/v1';
export const ACTIVATED_MODEL_CONFIGURATION_SCHEMA = 'vexlife.activated-model-configuration/v1';
export const ACTIVATED_MODEL_RUNTIME_RECEIPT_SCHEMA = 'vexlife.activated-model-runtime-receipt/v1';
export const CULTIVATED_FIRST_LIVED_TURN_EVIDENCE_SCHEMA = 'vexlife.cultivated-first-lived-turn-evidence/v1';

const SHA256 = /^[0-9a-f]{64}$/u;
const GIT_OID = /^[0-9a-f]{40,64}$/u;
const LOOPBACK_ORIGIN = /^http:\/\/127\.0\.0\.1:(\d{1,5})$/u;
const STABLE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/u;
const EXACT_REGISTRY_REF = 'registry.vexlife.activated-model-runtime-bindings.001';
const EXACT_MODEL_REF = 'model.vex.m4.small.g2.base.368e89e5ca219fab';
const EXACT_MODEL_PROFILE_REF = 'model-profile.vex.m4.small.g2.certified.20260920A';
const EXACT_ARTIFACT_REF = 'artifact.vex.m2.qwen3.5-4b-mlx-4bit.32f3e8ec';
const EXACT_ARTIFACT_SEAL = '368e89e5ca219fab3398c1830e982ef5a8a949bac1a17b8f3320bdb1e512d9cf';
const EXACT_ARTIFACT_MEMBER_COUNT = 12;
const EXACT_ARTIFACT_TOTAL_BYTES = 3061132920;
const EXACT_RUNTIME_ADAPTER_REF = 'adapter.runtime.mlx.macos-victor.001';
const EXACT_RUNTIME_CLASS = 'MLX_LM_DIRECT_RUNTIME';
const EXACT_TRANSPORT_CLASS = 'MLX_LM_OPENAI_NUMERIC_LOOPBACK';
const EXACT_PYTHON_VERSION = '3.14.7';
const EXACT_MLX_LM_VERSION = '0.32.0';
const EXACT_MLX_LM_SOURCE_COMMIT = '170a11c58ce7d22a720901a2535adb0c218b871b';
const EXACT_ACTIVATION_EVIDENCE_REF = 'github.issue.vextreme-sdk.1331.comment.5748056308';
const EXACT_DISTRIBUTION_TRUST_REF = 'github.issue.vextreme-sdk.244.comment.5748057753';
const EXACT_FIRST_WAKE_REF = 'github.issue.vextreme-sdk.1513.comment.5748050100';
const EXACT_CUSTODY_REF = 'github.issue.vextreme-sdk.1394.comment.5747979171';
const EXACT_RUNTIME_EVIDENCE_REF = 'github.issue.vextreme-sdk.636.comment.5747980407';
const EXACT_MEMBER_NAMES = Object.freeze([
  '.gitattributes',
  'README.md',
  'chat_template.jinja',
  'config.json',
  'model.safetensors',
  'model.safetensors.index.json',
  'preprocessor_config.json',
  'processor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'video_preprocessor_config.json',
  'vocab.json'
]);
const RUNTIME_SELECTOR_ENVIRONMENT = Object.freeze([
  'VEXLIFE_COMPANION_ENDPOINT',
  'VEXLIFE_COMPANION_MODEL',
  'VEXLIFE_MODEL',
  'VEXLIFE_MODEL_REF',
  'VEXLIFE_MODEL_PROFILE',
  'VEXLIFE_MODEL_PROFILE_REF',
  'VEXLIFE_MODEL_PROVIDER',
  'VEXLIFE_PROVIDER',
  'VEXLIFE_RUNTIME_ENDPOINT',
  'VEXLIFE_RUNTIME_PROVIDER'
]);

export class ActivatedModelRuntimeBindingError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = 'ActivatedModelRuntimeBindingError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, message, detail = null) {
  throw new ActivatedModelRuntimeBindingError(code, message, detail);
}

function requireObject(value, label, code = 'ACTIVATED_BINDING_SOURCE_INVALID') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${label} must be an object`);
  return value;
}
function requireString(value, label, code = 'ACTIVATED_BINDING_SOURCE_INVALID') {
  if (typeof value !== 'string' || value.length === 0) fail(code, `${label} must be a non-empty string`);
  return value;
}
function requireStableRef(value, label, code = 'ACTIVATED_BINDING_SOURCE_INVALID') {
  requireString(value, label, code);
  if (!STABLE_REF.test(value)) fail(code, `${label} must be a stable ref`);
  return value;
}
function requireSha(value, label, code = 'ACTIVATED_BINDING_SOURCE_INVALID') {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(code, `${label} must be lowercase SHA-256`);
  return value;
}
function requireGitOid(value, label, code = 'ACTIVATED_BINDING_HANDOFF_MISMATCH') {
  if (typeof value !== 'string' || !GIT_OID.test(value)) fail(code, `${label} must be an exact Git object id`);
  return value;
}
function sha256Bytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
async function sha256FileStream(filePath, expectedSize, label) {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  try {
    const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 });
    for await (const chunk of stream) {
      bytes += chunk.length;
      hash.update(chunk);
    }
  } catch (error) {
    fail('ACTIVATED_ARTIFACT_CONTENT_SEAL_MISMATCH', `Could not stream activated artifact member: ${label}`, { cause: error?.message ?? String(error) });
  }
  if (bytes !== expectedSize) {
    fail('ACTIVATED_ARTIFACT_CONTENT_SEAL_MISMATCH', `Activated artifact member changed while being read: ${label}`, { expectedBytes: expectedSize, actualBytes: bytes });
  }
  return Object.freeze({ bytes, sha256: hash.digest('hex') });
}
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}
function semanticHash(value) {
  return sha256Bytes(Buffer.from(JSON.stringify(canonicalize(value)), 'utf8'));
}
function readJson(filePath, code = 'ACTIVATED_MODEL_HOME_BINDING_NOT_CURRENT') {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (error) { fail(code, `Could not read JSON: ${filePath}`, { cause: error?.message ?? String(error) }); }
}
function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.partial-${process.pid}-${crypto.randomUUID()}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, filePath);
}
function assertRegularNonLink(filePath, code, label) {
  let stat;
  try { stat = fs.lstatSync(filePath); }
  catch { fail(code, `${label} is unavailable`); }
  if (stat.isSymbolicLink() || !stat.isFile()) fail(code, `${label} must be one regular non-symlink file`);
  return stat;
}
function assertDirectoryNonLink(dirPath, code, label) {
  let stat;
  try { stat = fs.lstatSync(dirPath); }
  catch { fail(code, `${label} is unavailable`); }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail(code, `${label} must be one directory and must not be a symlink`);
  return stat;
}
function assertPathInside(root, target, code, label) {
  const rootReal = fs.realpathSync(root);
  const absolute = path.resolve(target);
  const relative = path.relative(rootReal, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) fail(code, `${label} must be inside the accepted Python environment root`);
  let cursor = rootReal;
  const parts = relative.split(path.sep).filter(Boolean);
  for (let index = 0; index < parts.length - 1; index += 1) {
    cursor = path.join(cursor, parts[index]);
    let stat;
    try { stat = fs.lstatSync(cursor); }
    catch { fail(code, `${label} ancestor is unavailable`); }
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail(code, `${label} ancestor must be a non-symlink directory`);
  }
  return { rootReal, absolute };
}
function assertPythonLauncher(pythonExecutable, pythonEnvironmentRoot) {
  const code = 'ACTIVATED_RUNTIME_VERSION_PROBE_FAILED';
  assertDirectoryNonLink(pythonEnvironmentRoot, code, 'Accepted Python environment root');
  const { rootReal, absolute } = assertPathInside(pythonEnvironmentRoot, pythonExecutable, code, 'Accepted Python launcher');
  let stat;
  try { stat = fs.lstatSync(absolute); }
  catch { fail(code, 'Accepted Python launcher is unavailable'); }
  if (!stat.isFile() && !stat.isSymbolicLink()) fail(code, 'Accepted Python launcher must be a regular file or final symlink');
  try { fs.accessSync(absolute, fs.constants.X_OK); }
  catch { fail(code, 'Accepted Python launcher is not executable'); }
  let realPath;
  try { realPath = fs.realpathSync(absolute); }
  catch { fail(code, 'Accepted Python launcher target is unavailable'); }
  let realStat;
  try { realStat = fs.statSync(realPath); }
  catch { fail(code, 'Accepted Python launcher target is unavailable'); }
  if (!realStat.isFile()) fail(code, 'Accepted Python launcher target must be a regular file');
  return Object.freeze({ pythonExecutable: absolute, pythonEnvironmentRoot: rootReal, pythonExecutableRealPath: realPath, launcherIsSymlink: stat.isSymbolicLink() });
}
function pathInside(root, target) {
  const rootResolved = path.resolve(root);
  const targetResolved = path.resolve(target);
  return targetResolved === rootResolved || targetResolved.startsWith(`${rootResolved}${path.sep}`);
}
function exactEqual(actual, expected, label, code = 'ACTIVATED_BINDING_SOURCE_INVALID') {
  if (actual !== expected) fail(code, `${label} does not match the accepted binding`, { expected, actual });
}
function ensureNumericLoopbackOrigin(origin, label) {
  const match = LOOPBACK_ORIGIN.exec(origin);
  if (!match) fail('ACTIVATED_BINDING_SOURCE_INVALID', `${label} must use numeric loopback`);
  const port = Number(match[1]);
  if (port < 1 || port > 65535) fail('ACTIVATED_BINDING_SOURCE_INVALID', `${label} port is invalid`);
  return port;
}
function normalizeAbs(value, label, code = 'ACTIVATED_BINDING_HANDOFF_MISMATCH') {
  requireString(value, label, code);
  if (!path.isAbsolute(value)) fail(code, `${label} must be an absolute machine-local locator`);
  return path.resolve(value);
}
function codePointSort(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function validateActivatedModelRuntimeBindingRegistry(registry) {
  const errors = [];
  try {
    requireObject(registry, 'registry');
    exactEqual(registry.schemaVersion, ACTIVATED_MODEL_RUNTIME_BINDINGS_SCHEMA, 'registry.schemaVersion');
    exactEqual(registry.registryRef, EXACT_REGISTRY_REF, 'registry.registryRef');
    exactEqual(registry.selectionClass, 'EXACT_EXTERNAL_ACTIVATION_PROJECTION', 'registry.selectionClass');
    if (!Array.isArray(registry.bindings) || registry.bindings.length !== 1) {
      fail('ACTIVATED_BINDING_SOURCE_INVALID', 'registry.bindings must contain exactly one accepted external activation projection');
    }
    const binding = requireObject(registry.bindings[0], 'registry.bindings[0]');
    requireStableRef(binding.bindingRef, 'binding.bindingRef');
    exactEqual(binding.state, 'ACTIVE_ACCEPTED', 'binding.state');
    exactEqual(binding.modelRef, EXACT_MODEL_REF, 'binding.modelRef');
    exactEqual(binding.modelProfileRef, EXACT_MODEL_PROFILE_REF, 'binding.modelProfileRef');
    exactEqual(binding.activationEvidenceRef, EXACT_ACTIVATION_EVIDENCE_REF, 'binding.activationEvidenceRef');
    exactEqual(binding.distributionTrustEvidenceRef, EXACT_DISTRIBUTION_TRUST_REF, 'binding.distributionTrustEvidenceRef');
    exactEqual(binding.firstWakeEvidenceRef, EXACT_FIRST_WAKE_REF, 'binding.firstWakeEvidenceRef');
    exactEqual(binding.artifactCustodyEvidenceRef, EXACT_CUSTODY_REF, 'binding.artifactCustodyEvidenceRef');
    exactEqual(binding.runtimeAdapterEvidenceRef, EXACT_RUNTIME_EVIDENCE_REF, 'binding.runtimeAdapterEvidenceRef');

    const artifact = requireObject(binding.artifact, 'binding.artifact');
    exactEqual(artifact.artifactRef, EXACT_ARTIFACT_REF, 'artifact.artifactRef');
    exactEqual(artifact.adapterClass, 'MLX_SAFETENSORS_ARTIFACT', 'artifact.adapterClass');
    exactEqual(artifact.contentSetAlgorithm, 'SHA256_RAW_LEXICAL_NAME_SIZE_SHA256_LINES_V1', 'artifact.contentSetAlgorithm');
    exactEqual(artifact.contentSetSha256, EXACT_ARTIFACT_SEAL, 'artifact.contentSetSha256');
    exactEqual(artifact.memberCount, EXACT_ARTIFACT_MEMBER_COUNT, 'artifact.memberCount');
    exactEqual(artifact.totalBytes, EXACT_ARTIFACT_TOTAL_BYTES, 'artifact.totalBytes');
    if (!Array.isArray(artifact.expectedMemberNames) || artifact.expectedMemberNames.length !== EXACT_MEMBER_NAMES.length ||
        artifact.expectedMemberNames.some((value, index) => value !== EXACT_MEMBER_NAMES[index])) {
      fail('ACTIVATED_BINDING_SOURCE_INVALID', 'artifact.expectedMemberNames is not the exact accepted 12-member set');
    }
    const providerVerified = requireObject(artifact.providerVerifiedMembers, 'artifact.providerVerifiedMembers');
    requireSha(providerVerified['model.safetensors'], 'artifact.providerVerifiedMembers.model.safetensors');
    requireSha(providerVerified['tokenizer.json'], 'artifact.providerVerifiedMembers.tokenizer.json');

    const runtime = requireObject(binding.runtime, 'binding.runtime');
    exactEqual(runtime.runtimeAdapterRef, EXACT_RUNTIME_ADAPTER_REF, 'runtime.runtimeAdapterRef');
    exactEqual(runtime.runtimeClass, EXACT_RUNTIME_CLASS, 'runtime.runtimeClass');
    exactEqual(runtime.transportClass, EXACT_TRANSPORT_CLASS, 'runtime.transportClass');
    exactEqual(runtime.platform, 'darwin', 'runtime.platform');
    exactEqual(runtime.architecture, 'arm64', 'runtime.architecture');
    exactEqual(runtime.pythonVersion, EXACT_PYTHON_VERSION, 'runtime.pythonVersion');
    exactEqual(runtime.mlxLmVersion, EXACT_MLX_LM_VERSION, 'runtime.mlxLmVersion');
    exactEqual(runtime.mlxLmSourceCommit, EXACT_MLX_LM_SOURCE_COMMIT, 'runtime.mlxLmSourceCommit');
    exactEqual(runtime.host, '127.0.0.1', 'runtime.host');
    const port = ensureNumericLoopbackOrigin(runtime.origin, 'runtime.origin');
    exactEqual(runtime.port, port, 'runtime.port');
    exactEqual(runtime.origin, `http://127.0.0.1:${runtime.port}`, 'runtime.origin');
    exactEqual(runtime.healthPath, '/health', 'runtime.healthPath');
    exactEqual(runtime.modelsPath, '/v1/models', 'runtime.modelsPath');
    exactEqual(runtime.chatPath, '/v1/chat/completions', 'runtime.chatPath');
    exactEqual(runtime.requestModel, 'default_model', 'runtime.requestModel');
    exactEqual(runtime.qualificationClass, 'NEUTRAL_ZERO_TOKEN_OPENAI_BINDING', 'runtime.qualificationClass');
    if (!Number.isSafeInteger(runtime.startupTimeoutMs) || runtime.startupTimeoutMs < 1000 || runtime.startupTimeoutMs > 600000) {
      fail('ACTIVATED_BINDING_SOURCE_INVALID', 'runtime.startupTimeoutMs must be a bounded safe integer');
    }
    ensureNumericLoopbackOrigin(runtime.allowedBrowserOrigin, 'runtime.allowedBrowserOrigin');

    const browser = requireObject(binding.browserBinding, 'binding.browserBinding');
    exactEqual(browser.endpointEnvironment, 'VEXLIFE_COMPANION_ENDPOINT', 'browserBinding.endpointEnvironment');
    exactEqual(browser.modelEnvironment, 'VEXLIFE_COMPANION_MODEL', 'browserBinding.modelEnvironment');
    exactEqual(browser.existingServerScript, 'scripts/serve-browser.mjs', 'browserBinding.existingServerScript');

    const effects = requireObject(binding.effects, 'binding.effects');
    for (const key of ['activation','succession','training','weightMutation','memoryMutation','publication','modelDownload','artifactMutation']) {
      if (effects[key] !== false) fail('ACTIVATED_BINDING_SOURCE_INVALID', `binding.effects.${key} must remain false`);
    }
    return { ok: true, errors: [], binding };
  } catch (error) {
    errors.push(error instanceof ActivatedModelRuntimeBindingError ? `${error.code}: ${error.message}` : String(error));
    return { ok: false, errors, binding: null };
  }
}

export function loadActivatedModelRuntimeBindingRegistry(registryPath) {
  const registry = readJson(registryPath, 'ACTIVATED_BINDING_SOURCE_INVALID');
  const validation = validateActivatedModelRuntimeBindingRegistry(registry);
  if (!validation.ok) fail('ACTIVATED_BINDING_SOURCE_INVALID', validation.errors.join('; '));
  return { registry, binding: validation.binding };
}

function gitIdentity(sourceRoot, args) {
  const result = spawnSync('git', ['-C', sourceRoot, ...args], { encoding: 'utf8', shell: false, windowsHide: true });
  if (result.error || result.status !== 0) {
    fail('ACTIVATED_BINDING_SOURCE_IDENTITY_UNAVAILABLE', `Could not establish candidate Git identity: ${String(result.stderr || result.error?.message || '').trim()}`);
  }
  return String(result.stdout).trim();
}

export async function readActivatedBindingSourceIdentity({ sourceRoot, registryPath, modulePath }) {
  const registryStat = assertRegularNonLink(registryPath, 'ACTIVATED_BINDING_SOURCE_IDENTITY_UNAVAILABLE', 'binding registry');
  const moduleStat = assertRegularNonLink(modulePath, 'ACTIVATED_BINDING_SOURCE_IDENTITY_UNAVAILABLE', 'binding module');
  const registryBytes = fs.readFileSync(registryPath);
  const moduleBytes = fs.readFileSync(modulePath);
  const candidateHead = gitIdentity(sourceRoot, ['rev-parse', 'HEAD']);
  const candidateTree = gitIdentity(sourceRoot, ['rev-parse', 'HEAD^{tree}']);
  requireGitOid(candidateHead, 'candidateHead', 'ACTIVATED_BINDING_SOURCE_IDENTITY_UNAVAILABLE');
  requireGitOid(candidateTree, 'candidateTree', 'ACTIVATED_BINDING_SOURCE_IDENTITY_UNAVAILABLE');
  const identity = {
    schemaVersion: 'vexlife.activated-model-runtime-source-identity/v1',
    repository: 'vgong24/VexLife',
    candidateHead,
    candidateTree,
    registry: { path: path.relative(sourceRoot, registryPath).replaceAll('\\','/'), bytes: registryStat.size, sha256: sha256Bytes(registryBytes) },
    module: { path: path.relative(sourceRoot, modulePath).replaceAll('\\','/'), bytes: moduleStat.size, sha256: sha256Bytes(moduleBytes) }
  };
  return Object.freeze({
    ...identity,
    registrySha256: identity.registry.sha256,
    moduleSha256: identity.module.sha256,
    sourceBindingSha256: semanticHash(identity)
  });
}

export function activatedBindingSemanticIdentity(binding) {
  return Object.freeze({
    bindingRef: binding.bindingRef,
    state: binding.state,
    modelRef: binding.modelRef,
    modelProfileRef: binding.modelProfileRef,
    activationEvidenceRef: binding.activationEvidenceRef,
    distributionTrustEvidenceRef: binding.distributionTrustEvidenceRef,
    firstWakeEvidenceRef: binding.firstWakeEvidenceRef,
    artifactCustodyEvidenceRef: binding.artifactCustodyEvidenceRef,
    runtimeAdapterEvidenceRef: binding.runtimeAdapterEvidenceRef,
    artifactRef: binding.artifact.artifactRef,
    artifactContentSetSha256: binding.artifact.contentSetSha256,
    artifactMemberCount: binding.artifact.memberCount,
    artifactTotalBytes: binding.artifact.totalBytes,
    runtimeAdapterRef: binding.runtime.runtimeAdapterRef,
    runtimeClass: binding.runtime.runtimeClass,
    transportClass: binding.runtime.transportClass,
    endpoint: binding.runtime.origin,
    requestModel: binding.runtime.requestModel
  });
}

function bindingSemanticSha(binding) {
  return semanticHash(activatedBindingSemanticIdentity(binding));
}

export function assertNoActivatedRuntimeSelectionInjection(environment = process.env) {
  const present = RUNTIME_SELECTOR_ENVIRONMENT.filter((name) => typeof environment?.[name] === 'string' && environment[name].length > 0);
  if (present.length > 0) {
    fail('ACTIVATED_MODEL_RUNTIME_SELECTION_INJECTION_REJECTED', 'Activated M4 runtime/model/provider selection is source-owned and may not be supplied through environment state', { keys: present });
  }
  return true;
}

function parseHandoff({ handoffBytes, handoffSha256, binding, sourceIdentity }) {
  if (!Buffer.isBuffer(handoffBytes)) fail('ACTIVATED_MODEL_HANDOFF_REQUIRED', 'The first activated-M4 bind requires one digest-bound custody handoff');
  requireSha(handoffSha256, 'handoffSha256', 'ACTIVATED_BINDING_HANDOFF_DIGEST_MISMATCH');
  const actualDigest = sha256Bytes(handoffBytes);
  if (actualDigest !== handoffSha256) fail('ACTIVATED_BINDING_HANDOFF_DIGEST_MISMATCH', 'Digest-bound custody handoff SHA-256 does not match supplied bytes', { expected: handoffSha256, actual: actualDigest });
  let handoff;
  try { handoff = JSON.parse(handoffBytes.toString('utf8')); }
  catch { fail('ACTIVATED_BINDING_HANDOFF_MISMATCH', 'Custody handoff is not valid UTF-8 JSON'); }
  requireObject(handoff, 'handoff', 'ACTIVATED_BINDING_HANDOFF_MISMATCH');
  exactEqual(handoff.schemaVersion, ACTIVATED_MODEL_CUSTODY_HANDOFF_SCHEMA, 'handoff.schemaVersion', 'ACTIVATED_BINDING_HANDOFF_MISMATCH');
  requireStableRef(handoff.handoffRef, 'handoff.handoffRef', 'ACTIVATED_BINDING_HANDOFF_MISMATCH');
  const exact = {
    bindingRef: binding.bindingRef,
    modelRef: binding.modelRef,
    modelProfileRef: binding.modelProfileRef,
    activationEvidenceRef: binding.activationEvidenceRef,
    distributionTrustEvidenceRef: binding.distributionTrustEvidenceRef,
    artifactRef: binding.artifact.artifactRef,
    artifactContentSetSha256: binding.artifact.contentSetSha256,
    artifactMemberCount: binding.artifact.memberCount,
    artifactTotalBytes: binding.artifact.totalBytes,
    artifactCustodyEvidenceRef: binding.artifactCustodyEvidenceRef,
    runtimeAdapterRef: binding.runtime.runtimeAdapterRef,
    runtimeClass: binding.runtime.runtimeClass,
    pythonVersion: binding.runtime.pythonVersion,
    mlxLmVersion: binding.runtime.mlxLmVersion,
    mlxLmSourceCommit: binding.runtime.mlxLmSourceCommit
  };
  for (const [key, expected] of Object.entries(exact)) exactEqual(handoff[key], expected, `handoff.${key}`, 'ACTIVATED_BINDING_HANDOFF_MISMATCH');
  const source = requireObject(handoff.source, 'handoff.source', 'ACTIVATED_BINDING_HANDOFF_MISMATCH');
  exactEqual(source.repository, 'vgong24/VexLife', 'handoff.source.repository', 'ACTIVATED_BINDING_HANDOFF_MISMATCH');
  exactEqual(source.candidateHead, sourceIdentity.candidateHead, 'handoff.source.candidateHead', 'ACTIVATED_BINDING_HANDOFF_MISMATCH');
  exactEqual(source.candidateTree, sourceIdentity.candidateTree, 'handoff.source.candidateTree', 'ACTIVATED_BINDING_HANDOFF_MISMATCH');
  exactEqual(source.registrySha256, sourceIdentity.registrySha256, 'handoff.source.registrySha256', 'ACTIVATED_BINDING_HANDOFF_MISMATCH');
  exactEqual(source.moduleSha256, sourceIdentity.moduleSha256, 'handoff.source.moduleSha256', 'ACTIVATED_BINDING_HANDOFF_MISMATCH');
  requireGitOid(source.candidateHead, 'handoff.source.candidateHead');
  requireGitOid(source.candidateTree, 'handoff.source.candidateTree');
  requireSha(source.registrySha256, 'handoff.source.registrySha256', 'ACTIVATED_BINDING_HANDOFF_MISMATCH');
  requireSha(source.moduleSha256, 'handoff.source.moduleSha256', 'ACTIVATED_BINDING_HANDOFF_MISMATCH');
  const privateLocators = requireObject(handoff.privateLocators, 'handoff.privateLocators', 'ACTIVATED_BINDING_HANDOFF_MISMATCH');
  const modelDirectory = normalizeAbs(privateLocators.modelDirectory, 'handoff.privateLocators.modelDirectory');
  const pythonExecutable = normalizeAbs(privateLocators.pythonExecutable, 'handoff.privateLocators.pythonExecutable');
  const pythonEnvironmentRoot = normalizeAbs(privateLocators.pythonEnvironmentRoot, 'handoff.privateLocators.pythonEnvironmentRoot');
  return Object.freeze({ handoff, handoffSha256: actualDigest, modelDirectory, pythonExecutable, pythonEnvironmentRoot });
}

function homePaths(home) {
  return Object.freeze({
    homeManifest: path.join(home, 'config', 'home.json'),
    modelConfig: path.join(home, 'config', 'model.json'),
    runtimeReceipt: path.join(home, 'runtime', 'initialization', 'receipt.json'),
    recoveryReceipt: path.join(home, 'recovery', 'vex-initialization-receipt.json')
  });
}

function readHomeIdentity(home) {
  const paths = homePaths(home);
  if (!fs.existsSync(paths.homeManifest)) fail('HOME_NOT_ESTABLISHED', 'Existing Vex Home must be established by the Frontdoor bootstrap before activated-model binding');
  const stat = assertRegularNonLink(paths.homeManifest, 'HOME_NOT_ESTABLISHED', 'Home identity');
  if (stat.size > 2 * 1024 * 1024) fail('HOME_NOT_ESTABLISHED', 'Home identity is unexpectedly large');
  const manifest = readJson(paths.homeManifest, 'HOME_NOT_ESTABLISHED');
  const homeRef = manifest.homeRef ?? manifest.homeIdentityRef ?? manifest.identityRef ?? null;
  if (typeof homeRef !== 'string' || homeRef.length === 0) fail('HOME_NOT_ESTABLISHED', 'Existing Home identity contains no stable Home ref');
  return { paths, homeRef, manifest };
}

function activatedConfigState(config, binding, sourceDigests) {
  if (!config || config.schemaVersion !== ACTIVATED_MODEL_CONFIGURATION_SCHEMA || config.state !== 'BOUND_ACTIVATED_CULTIVATED_MODEL') return { state: 'NOT_ACTIVATED_CONFIG' };
  const required = {
    bindingRef: binding.bindingRef,
    modelRef: binding.modelRef,
    modelProfileRef: binding.modelProfileRef,
    activationEvidenceRef: binding.activationEvidenceRef,
    distributionTrustEvidenceRef: binding.distributionTrustEvidenceRef,
    artifactRef: binding.artifact.artifactRef,
    artifactContentSetSha256: binding.artifact.contentSetSha256,
    artifactCustodyEvidenceRef: binding.artifactCustodyEvidenceRef,
    runtimeAdapterRef: binding.runtime.runtimeAdapterRef,
    runtimeClass: binding.runtime.runtimeClass,
    endpoint: binding.runtime.origin,
    requestModel: binding.runtime.requestModel,
    bindingSemanticSha256: bindingSemanticSha(binding),
    registrySha256: sourceDigests.registrySha256,
    moduleSha256: sourceDigests.moduleSha256
  };
  const mismatches = Object.entries(required).filter(([key, expected]) => config[key] !== expected).map(([key]) => key);
  if (mismatches.length > 0) return { state: 'STALE', mismatches };
  if (!path.isAbsolute(config.privateMaterializationPath ?? '') || !path.isAbsolute(config.privatePythonExecutablePath ?? '') || !path.isAbsolute(config.privatePythonEnvironmentRootPath ?? '')) return { state: 'STALE', mismatches: ['privateLocators'] };
  return { state: 'CURRENT' };
}

function privateLocatorsFromConfig(config) {
  return {
    modelDirectory: path.resolve(config.privateMaterializationPath),
    pythonExecutable: path.resolve(config.privatePythonExecutablePath),
    pythonEnvironmentRoot: path.resolve(config.privatePythonEnvironmentRootPath)
  };
}

export async function planActivatedModelResume({
  home,
  binding,
  sourceDigests,
  sourceIdentity,
  handoffBytes = null,
  handoffSha256 = null,
  environment = process.env
}) {
  assertNoActivatedRuntimeSelectionInjection(environment);
  const resolvedHome = path.resolve(home);
  const homeIdentity = readHomeIdentity(resolvedHome);
  const config = fs.existsSync(homeIdentity.paths.modelConfig) ? readJson(homeIdentity.paths.modelConfig) : null;
  const current = activatedConfigState(config, binding, sourceDigests);
  if (current.state === 'CURRENT') {
    if (handoffBytes !== null || handoffSha256 !== null) fail('ACTIVATED_MODEL_HANDOFF_ALREADY_CONSUMED', 'This Home is already explicitly bound to activated M4; another handoff is forbidden');
    return Object.freeze({
      schemaVersion: 'vexlife.activated-model-resume-plan/v1',
      state: 'RESUME_PERSISTED_ACTIVATED_BINDING',
      homeRef: homeIdentity.homeRef,
      bindingRef: binding.bindingRef,
      modelRef: binding.modelRef,
      modelProfileRef: binding.modelProfileRef,
      artifactRef: binding.artifact.artifactRef,
      runtimeAdapterRef: binding.runtime.runtimeAdapterRef,
      endpoint: binding.runtime.origin,
      requestModel: binding.runtime.requestModel,
      privateLocatorSource: 'PERSISTED_HOME_LOCAL_ONLY',
      sourceBindingSha256: sourceIdentity.sourceBindingSha256,
      noFallback: true
    });
  }
  if (current.state === 'STALE') {
    fail('ACTIVATED_MODEL_HOME_BINDING_NOT_CURRENT', 'Existing activated-M4 Home binding is stale and cannot silently fall back or self-repair', { mismatches: current.mismatches });
  }
  if (handoffBytes === null || handoffSha256 === null) fail('ACTIVATED_MODEL_HANDOFF_REQUIRED', 'First activated-M4 binding requires the exact digest-bound activation/custody handoff');
  parseHandoff({ handoffBytes, handoffSha256, binding, sourceIdentity });
  return Object.freeze({
    schemaVersion: 'vexlife.activated-model-resume-plan/v1',
    state: 'FIRST_BIND_FROM_EXACT_HANDOFF',
    homeRef: homeIdentity.homeRef,
    bindingRef: binding.bindingRef,
    modelRef: binding.modelRef,
    modelProfileRef: binding.modelProfileRef,
    artifactRef: binding.artifact.artifactRef,
    runtimeAdapterRef: binding.runtime.runtimeAdapterRef,
    endpoint: binding.runtime.origin,
    requestModel: binding.runtime.requestModel,
    privateLocatorSource: 'DIGEST_BOUND_HANDOFF_PRIVATE_ONLY',
    sourceBindingSha256: sourceIdentity.sourceBindingSha256,
    noFallback: true
  });
}

export async function verifyActivatedArtifactCustody({ binding, modelDirectory }) {
  const modelRoot = path.resolve(modelDirectory);
  assertDirectoryNonLink(modelRoot, 'ACTIVATED_ARTIFACT_CUSTODY_UNAVAILABLE', 'Activated model materialization');
  const actualNames = fs.readdirSync(modelRoot).sort(codePointSort);
  const expectedNames = [...binding.artifact.expectedMemberNames].sort(codePointSort);
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    fail('ACTIVATED_ARTIFACT_MEMBER_SET_MISMATCH', 'Activated model materialization root member set does not match exact custody', { expected: expectedNames, actual: actualNames });
  }
  const rows = [];
  let totalBytes = 0;
  for (const name of actualNames) {
    const filePath = path.join(modelRoot, name);
    const stat = assertRegularNonLink(filePath, 'ACTIVATED_ARTIFACT_MEMBER_SET_MISMATCH', `Activated artifact member ${name}`);
    const streamed = await sha256FileStream(filePath, stat.size, name);
    const digest = streamed.sha256;
    rows.push({ path: name, bytes: streamed.bytes, sha256: digest });
    totalBytes += streamed.bytes;
    const providerExpected = binding.artifact.providerVerifiedMembers?.[name];
    if (providerExpected && providerExpected !== digest) {
      fail('ACTIVATED_ARTIFACT_PROVIDER_MEMBER_MISMATCH', `Provider-verified activated artifact member no longer matches: ${name}`);
    }
  }
  rows.sort((a,b) => codePointSort(a.path,b.path));
  const sealMaterial = rows.map((row) => `${row.path}|${row.bytes}|${row.sha256}\n`).join('');
  const seal = sha256Bytes(Buffer.from(sealMaterial, 'utf8'));
  if (rows.length !== binding.artifact.memberCount || totalBytes !== binding.artifact.totalBytes || seal !== binding.artifact.contentSetSha256) {
    fail('ACTIVATED_ARTIFACT_CONTENT_SEAL_MISMATCH', 'Activated model content-set seal no longer matches exact accepted custody', {
      expectedMemberCount: binding.artifact.memberCount,
      actualMemberCount: rows.length,
      expectedTotalBytes: binding.artifact.totalBytes,
      actualTotalBytes: totalBytes,
      expectedContentSetSha256: binding.artifact.contentSetSha256,
      actualContentSetSha256: seal
    });
  }
  return Object.freeze({
    schemaVersion: 'vexlife.activated-artifact-custody-verification/v1',
    artifactRef: binding.artifact.artifactRef,
    memberCount: rows.length,
    totalBytes,
    contentSetSha256: seal,
    memberRows: rows
  });
}

function exactRuntimeArguments(binding, modelDirectory) {
  return [
    '-m', 'mlx_lm.server',
    '--model', path.resolve(modelDirectory),
    '--host', binding.runtime.host,
    '--port', String(binding.runtime.port),
    '--allowed-origins', binding.runtime.allowedBrowserOrigin,
    '--chat-template-args', '{"enable_thinking":false}',
    '--max-tokens', '1024'
  ];
}

async function defaultVersionProbe(pythonExecutable) {
  const probeCode = [
    'import json, platform, sys',
    'import importlib.metadata as m',
    'import mlx',
    'import mlx_lm',
    'print(json.dumps({"pythonVersion": platform.python_version(), "mlxLmVersion": m.version("mlx-lm"), "prefix": sys.prefix, "executable": sys.executable}))'
  ].join('; ');
  const probe = spawnSync(pythonExecutable, ['-c', probeCode], {
    encoding: 'utf8', shell: false, windowsHide: true,
    env: { ...process.env, PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1' }
  });
  if (probe.error || probe.status !== 0) fail('ACTIVATED_RUNTIME_VERSION_PROBE_FAILED', 'Accepted Python/mlx-lm environment could not be established');
  let payload;
  try { payload = JSON.parse(String(probe.stdout ?? '').trim().split(/\r?\n/u).filter(Boolean).at(-1)); }
  catch { fail('ACTIVATED_RUNTIME_VERSION_PROBE_FAILED', 'Accepted Python/mlx-lm environment returned invalid probe evidence'); }
  return payload;
}

function defaultProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function defaultProcessMatches({ pid, pythonExecutable, args }) {
  if (process.platform !== 'darwin' || !defaultProcessAlive(pid)) return false;
  const result = spawnSync('/bin/ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8', shell: false });
  if (result.error || result.status !== 0) return false;
  const observed = String(result.stdout ?? '').trim();
  const expected = [pythonExecutable, ...args].join(' ');
  return observed === expected;
}

function defaultSpawnRuntime({ pythonExecutable, args, home }) {
  const logs = path.join(home, 'runtime');
  fs.mkdirSync(logs, { recursive: true });
  const outFd = fs.openSync(path.join(logs, 'mlx-lm-server.out.log'), 'a');
  const errFd = fs.openSync(path.join(logs, 'mlx-lm-server.err.log'), 'a');
  return new Promise((resolve, reject) => {
    const child = spawn(pythonExecutable, args, { cwd: path.dirname(pythonExecutable), detached: true, windowsHide: true, shell: false, stdio: ['ignore', outFd, errFd] });
    const close = () => { try { fs.closeSync(outFd); } catch {}; try { fs.closeSync(errFd); } catch {}; };
    child.once('error', (error) => { close(); reject(error); });
    child.once('spawn', () => {
      const pid = child.pid;
      child.unref();
      close();
      if (!Number.isInteger(pid) || pid <= 0) reject(new Error('runtime process returned no PID'));
      else resolve(pid);
    });
  });
}

async function requestJson(fetchImpl, url, options, code, label) {
  let response;
  try { response = await fetchImpl(url, options); }
  catch (error) { fail(code, `${label} request failed`, { cause: error?.message ?? String(error) }); }
  if (!response?.ok) fail(code, `${label} request failed`, { status: response?.status ?? null });
  try { return await response.json(); }
  catch { fail(code, `${label} returned non-JSON content`); }
}

async function endpointHealthy(fetchImpl, binding, timeoutMs = 1200) {
  try {
    const response = await fetchImpl(`${binding.runtime.origin}${binding.runtime.healthPath}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response?.ok) return false;
    const payload = await response.json();
    return payload?.status === 'ok';
  } catch { return false; }
}

export async function qualifyActivatedMlxRuntime({ binding, modelDirectory, fetchImpl = globalThis.fetch }) {
  ensureNumericLoopbackOrigin(binding.runtime.origin, 'runtime.origin');
  const resolvedModel = path.resolve(modelDirectory);
  const health = await requestJson(fetchImpl, `${binding.runtime.origin}${binding.runtime.healthPath}`, { signal: AbortSignal.timeout(5000) }, 'ACTIVATED_RUNTIME_MODEL_IDENTITY_QUALIFICATION_FAILED', 'MLX health');
  if (health?.status !== 'ok') fail('ACTIVATED_RUNTIME_MODEL_IDENTITY_QUALIFICATION_FAILED', 'MLX health response is not exact healthy state');
  const models = await requestJson(fetchImpl, `${binding.runtime.origin}${binding.runtime.modelsPath}`, { signal: AbortSignal.timeout(5000) }, 'ACTIVATED_RUNTIME_MODEL_IDENTITY_QUALIFICATION_FAILED', 'MLX model identity');
  const ids = Array.isArray(models?.data) ? models.data.map((item) => item?.id).filter((item) => typeof item === 'string') : [];
  const exactMatches = ids.filter((id) => path.resolve(id) === resolvedModel);
  if (exactMatches.length !== 1) fail('ACTIVATED_RUNTIME_MODEL_IDENTITY_QUALIFICATION_FAILED', 'MLX /v1/models did not expose the exact private materialization exactly once', { observedIds: ids.length });
  const qualificationRequest = {
    model: binding.runtime.requestModel,
    messages: [{ role: 'user', content: '' }],
    max_tokens: 0,
    stream: false
  };
  const completion = await requestJson(fetchImpl, `${binding.runtime.origin}${binding.runtime.chatPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(qualificationRequest),
    signal: AbortSignal.timeout(30000)
  }, 'ACTIVATED_RUNTIME_MODEL_IDENTITY_QUALIFICATION_FAILED', 'MLX neutral OpenAI qualification');
  if (completion?.model !== binding.runtime.requestModel) fail('ACTIVATED_RUNTIME_MODEL_IDENTITY_QUALIFICATION_FAILED', 'MLX neutral qualification did not preserve exact request-model identity');
  return Object.freeze({
    schemaVersion: 'vexlife.activated-model-runtime-qualification/v1',
    qualificationClass: binding.runtime.qualificationClass,
    endpoint: binding.runtime.origin,
    servedMaterializationSha256: sha256Bytes(Buffer.from(resolvedModel, 'utf8')),
    requestModel: binding.runtime.requestModel,
    healthState: 'EXACT_OK',
    modelsExactMatchCount: 1,
    neutralRequestSha256: semanticHash(qualificationRequest),
    responseModel: completion.model,
    actualHttpCall: true,
    livedConversationEffect: false,
    personaEffect: false,
    memoryEffect: false,
    trainingEffect: false,
    activationEffect: false,
    successionEffect: false
  });
}

function runtimeHooks(input = {}) {
  return {
    fetchImpl: input.fetchImpl ?? globalThis.fetch,
    versionProbe: input.versionProbe ?? defaultVersionProbe,
    processAlive: input.processAlive ?? defaultProcessAlive,
    processMatches: input.processMatches ?? defaultProcessMatches,
    spawnRuntime: input.spawnRuntime ?? defaultSpawnRuntime,
    sleep: input.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    now: input.now ?? (() => new Date().toISOString()),
    host: input.host ?? { platform: process.platform, architecture: process.arch }
  };
}

async function waitForHealthy(binding, pid, hooks) {
  const deadline = Date.now() + binding.runtime.startupTimeoutMs;
  while (Date.now() < deadline) {
    if (!hooks.processAlive(pid)) fail('ACTIVATED_RUNTIME_START_FAILED', 'MLX runtime exited before neutral qualification');
    if (await endpointHealthy(hooks.fetchImpl, binding, 1500)) return;
    await hooks.sleep(500);
  }
  fail('ACTIVATED_RUNTIME_START_FAILED', 'MLX runtime did not become healthy before source-bounded startup timeout');
}

function runtimeReceiptReusable(prior, { binding, sourceDigests, pythonExecutable, pythonEnvironmentRoot, modelDirectory, args, hooks }) {
  if (!prior || prior.schemaVersion !== ACTIVATED_MODEL_RUNTIME_RECEIPT_SCHEMA || prior.state !== 'ACTIVATED_MODEL_RUNTIME_QUALIFIED') return false;
  if (prior.bindingRef !== binding.bindingRef || prior.modelRef !== binding.modelRef || prior.modelProfileRef !== binding.modelProfileRef) return false;
  if (prior.registrySha256 !== sourceDigests.registrySha256 || prior.moduleSha256 !== sourceDigests.moduleSha256) return false;
  if (prior.privateMaterializationPath !== modelDirectory || prior.privatePythonExecutablePath !== pythonExecutable || prior.privatePythonEnvironmentRootPath !== pythonEnvironmentRoot) return false;
  if (!Number.isInteger(prior.runtime?.pid) || prior.runtime.pid <= 0 || !hooks.processAlive(prior.runtime.pid)) return false;
  return hooks.processMatches({ pid: prior.runtime.pid, pythonExecutable, args });
}

function resolvePrivateLocators({ config, handoffBytes, handoffSha256, binding, sourceIdentity }) {
  if (config?.schemaVersion === ACTIVATED_MODEL_CONFIGURATION_SCHEMA && config?.state === 'BOUND_ACTIVATED_CULTIVATED_MODEL') {
    return { ...privateLocatorsFromConfig(config), handoffSha256: config.handoffSha256 ?? null, handoffRef: config.handoffRef ?? null };
  }
  const parsed = parseHandoff({ handoffBytes, handoffSha256, binding, sourceIdentity });
  return parsed;
}

export async function startOrResumeActivatedModelRuntime({
  home,
  binding,
  sourceIdentity,
  handoffBytes = null,
  handoffSha256 = null,
  environment = process.env,
  hooks: hookInput = {}
}) {
  const hooks = runtimeHooks(hookInput);
  if (hooks.host.platform !== binding.runtime.platform || hooks.host.architecture !== binding.runtime.architecture) {
    fail('ACTIVATED_RUNTIME_HOST_MISMATCH', 'Activated M4 binding is admitted only on the accepted darwin/arm64 host profile', { expected: `${binding.runtime.platform}/${binding.runtime.architecture}`, actual: `${hooks.host.platform}/${hooks.host.architecture}` });
  }
  const sourceDigests = { registrySha256: sourceIdentity.registrySha256, moduleSha256: sourceIdentity.moduleSha256 };
  const plan = await planActivatedModelResume({ home, binding, sourceDigests, sourceIdentity, handoffBytes, handoffSha256, environment });
  const resolvedHome = path.resolve(home);
  const homeIdentity = readHomeIdentity(resolvedHome);
  const priorConfig = fs.existsSync(homeIdentity.paths.modelConfig) ? readJson(homeIdentity.paths.modelConfig) : null;
  const locators = resolvePrivateLocators({ config: priorConfig, handoffBytes, handoffSha256, binding, sourceIdentity });
  const modelDirectory = path.resolve(locators.modelDirectory);
  const pythonExecutable = path.resolve(locators.pythonExecutable);
  const pythonEnvironmentRoot = path.resolve(locators.pythonEnvironmentRoot);
  const launcher = assertPythonLauncher(pythonExecutable, pythonEnvironmentRoot);

  const custody = await verifyActivatedArtifactCustody({ binding, modelDirectory });
  const versions = await hooks.versionProbe(pythonExecutable);
  if (versions?.pythonVersion !== binding.runtime.pythonVersion || versions?.mlxLmVersion !== binding.runtime.mlxLmVersion) {
    fail('ACTIVATED_RUNTIME_VERSION_PROBE_FAILED', 'Python/mlx-lm runtime versions do not match the accepted runtime adapter', { expectedPython: binding.runtime.pythonVersion, actualPython: versions?.pythonVersion ?? null, expectedMlxLm: binding.runtime.mlxLmVersion, actualMlxLm: versions?.mlxLmVersion ?? null });
  }
  if (typeof versions?.prefix !== 'string' || !path.isAbsolute(versions.prefix) || !pathInside(launcher.pythonEnvironmentRoot, versions.prefix)) {
    fail('ACTIVATED_RUNTIME_VERSION_PROBE_FAILED', 'Python runtime prefix is not inside the exact preserved trainer environment');
  }

  const args = exactRuntimeArguments(binding, modelDirectory);
  let priorReceipt = null;
  if (fs.existsSync(homeIdentity.paths.runtimeReceipt)) {
    try { priorReceipt = readJson(homeIdentity.paths.runtimeReceipt); } catch { priorReceipt = null; }
  }
  let pid = null;
  let runtimeDisposition = null;
  if (runtimeReceiptReusable(priorReceipt, { binding, sourceDigests, pythonExecutable, pythonEnvironmentRoot, modelDirectory, args, hooks })) {
    pid = priorReceipt.runtime.pid;
    runtimeDisposition = 'REUSED_EXACT_OWNED_MLX_RUNTIME';
  } else {
    if (await endpointHealthy(hooks.fetchImpl, binding, 1200)) {
      fail('ACTIVATED_RUNTIME_ENDPOINT_OWNERSHIP_CONFLICT', 'Numeric-loopback endpoint is already occupied without matching current Home ownership evidence');
    }
    try { pid = await hooks.spawnRuntime({ pythonExecutable, args, home: resolvedHome }); }
    catch (error) { fail('ACTIVATED_RUNTIME_START_FAILED', 'Failed to start exact accepted MLX runtime', { cause: error?.message ?? String(error) }); }
    runtimeDisposition = 'STARTED_NEW_EXACT_MLX_RUNTIME';
    await waitForHealthy(binding, pid, hooks);
  }

  const qualification = await qualifyActivatedMlxRuntime({ binding, modelDirectory, fetchImpl: hooks.fetchImpl });
  const formedAt = hooks.now();
  const receiptRef = `receipt.vexlife.activated-model-runtime.${semanticHash({ bindingRef: binding.bindingRef, homeRef: homeIdentity.homeRef, formedAt, pid, sourceDigests }).slice(0, 24)}`;
  const receipt = {
    schemaVersion: ACTIVATED_MODEL_RUNTIME_RECEIPT_SCHEMA,
    receiptRef,
    state: 'ACTIVATED_MODEL_RUNTIME_QUALIFIED',
    bindingRef: binding.bindingRef,
    modelRef: binding.modelRef,
    modelProfileRef: binding.modelProfileRef,
    activationEvidenceRef: binding.activationEvidenceRef,
    distributionTrustEvidenceRef: binding.distributionTrustEvidenceRef,
    artifactRef: binding.artifact.artifactRef,
    artifactContentSetSha256: binding.artifact.contentSetSha256,
    artifactCustodyEvidenceRef: binding.artifactCustodyEvidenceRef,
    runtimeAdapterRef: binding.runtime.runtimeAdapterRef,
    runtimeClass: binding.runtime.runtimeClass,
    bindingSemanticSha256: bindingSemanticSha(binding),
    registrySha256: sourceDigests.registrySha256,
    moduleSha256: sourceDigests.moduleSha256,
    homeRef: homeIdentity.homeRef,
    formedAt,
    privateMaterializationPath: modelDirectory,
    privatePythonExecutablePath: pythonExecutable,
    privatePythonEnvironmentRootPath: pythonEnvironmentRoot,
    handoffRef: locators.handoff?.handoffRef ?? locators.handoffRef ?? priorConfig?.handoffRef ?? null,
    handoffSha256: locators.handoffSha256 ?? priorConfig?.handoffSha256 ?? null,
    custody,
    runtime: { pid, disposition: runtimeDisposition, arguments: args },
    endpoint: binding.runtime.origin,
    requestModel: binding.runtime.requestModel,
    qualification,
    effects: { repository: false, public: false, conversation: false, persona: false, memory: false, training: false, activation: false, succession: false, modelDownload: false, artifactMutation: false }
  };
  writeJsonAtomic(homeIdentity.paths.runtimeReceipt, receipt);
  writeJsonAtomic(homeIdentity.paths.recoveryReceipt, receipt);
  writeJsonAtomic(homeIdentity.paths.modelConfig, {
    schemaVersion: ACTIVATED_MODEL_CONFIGURATION_SCHEMA,
    state: 'BOUND_ACTIVATED_CULTIVATED_MODEL',
    bindingRef: binding.bindingRef,
    modelRef: binding.modelRef,
    modelProfileRef: binding.modelProfileRef,
    activationEvidenceRef: binding.activationEvidenceRef,
    distributionTrustEvidenceRef: binding.distributionTrustEvidenceRef,
    artifactRef: binding.artifact.artifactRef,
    artifactContentSetSha256: binding.artifact.contentSetSha256,
    artifactCustodyEvidenceRef: binding.artifactCustodyEvidenceRef,
    runtimeAdapterRef: binding.runtime.runtimeAdapterRef,
    runtimeClass: binding.runtime.runtimeClass,
    bindingSemanticSha256: bindingSemanticSha(binding),
    registrySha256: sourceDigests.registrySha256,
    moduleSha256: sourceDigests.moduleSha256,
    privateMaterializationPath: modelDirectory,
    privatePythonExecutablePath: pythonExecutable,
    privatePythonEnvironmentRootPath: pythonEnvironmentRoot,
    endpoint: binding.runtime.origin,
    requestModel: binding.runtime.requestModel,
    runtimePid: pid,
    runtimeDisposition,
    qualificationReceiptRef: receiptRef,
    handoffRef: receipt.handoffRef,
    handoffSha256: receipt.handoffSha256,
    automaticFallback: false,
    automaticDownload: false,
    automaticActivation: false
  });

  return Object.freeze({
    bindingRef: binding.bindingRef,
    modelRef: binding.modelRef,
    modelProfileRef: binding.modelProfileRef,
    endpoint: binding.runtime.origin,
    requestModel: binding.runtime.requestModel,
    runtimeDisposition,
    receiptRef,
    browserEnvironment: Object.freeze({
      [binding.browserBinding.endpointEnvironment]: binding.runtime.origin,
      [binding.browserBinding.modelEnvironment]: binding.runtime.requestModel
    }),
    planState: plan.state
  });
}

export function formCultivatedFirstLivedTurnEvidence({ binding, runtimeBindingReceipt, browserTurnReceipt }) {
  requireObject(runtimeBindingReceipt, 'runtimeBindingReceipt', 'CULTIVATED_FIRST_LIVED_TURN_EVIDENCE_INVALID');
  requireObject(browserTurnReceipt, 'browserTurnReceipt', 'CULTIVATED_FIRST_LIVED_TURN_EVIDENCE_INVALID');
  if (runtimeBindingReceipt.schemaVersion !== ACTIVATED_MODEL_RUNTIME_RECEIPT_SCHEMA || runtimeBindingReceipt.state !== 'ACTIVATED_MODEL_RUNTIME_QUALIFIED') {
    fail('CULTIVATED_FIRST_LIVED_TURN_EVIDENCE_INVALID', 'Shared lived-turn evidence requires one exact qualified activated-runtime receipt');
  }
  if (runtimeBindingReceipt.bindingRef !== binding.bindingRef || runtimeBindingReceipt.modelRef !== binding.modelRef || runtimeBindingReceipt.modelProfileRef !== binding.modelProfileRef) {
    fail('CULTIVATED_FIRST_LIVED_TURN_EVIDENCE_INVALID', 'Runtime receipt does not bind the exact activated M4 identity');
  }
  if (browserTurnReceipt.schemaVersion !== 'vexlife.browser-companion-turn/v1' || browserTurnReceipt.state !== 'TURN_COMPLETED' || browserTurnReceipt.actualHttpCall !== true || browserTurnReceipt.loopbackOnly !== true) {
    fail('CULTIVATED_FIRST_LIVED_TURN_EVIDENCE_INVALID', 'First lived evidence requires one actual completed loopback browser-companion turn');
  }
  if (browserTurnReceipt.modelNameOrBoundedTestProfileRef !== binding.bindingRef) {
    fail('CULTIVATED_FIRST_LIVED_TURN_EVIDENCE_INVALID', 'Browser turn is not bound to the exact accepted activated-model binding');
  }
  for (const key of ['conversationHeadSha256','requestEventRef','requestEventSha256','responseEventRef','responseEventSha256']) {
    requireString(browserTurnReceipt[key], `browserTurnReceipt.${key}`, 'CULTIVATED_FIRST_LIVED_TURN_EVIDENCE_INVALID');
  }
  requireSha(browserTurnReceipt.conversationHeadSha256, 'browserTurnReceipt.conversationHeadSha256', 'CULTIVATED_FIRST_LIVED_TURN_EVIDENCE_INVALID');
  requireSha(browserTurnReceipt.requestEventSha256, 'browserTurnReceipt.requestEventSha256', 'CULTIVATED_FIRST_LIVED_TURN_EVIDENCE_INVALID');
  requireSha(browserTurnReceipt.responseEventSha256, 'browserTurnReceipt.responseEventSha256', 'CULTIVATED_FIRST_LIVED_TURN_EVIDENCE_INVALID');
  const witness = browserTurnReceipt.modelTurnWitness;
  if (!witness || (typeof witness !== 'string' && typeof witness !== 'object')) fail('CULTIVATED_FIRST_LIVED_TURN_EVIDENCE_INVALID', 'Completed browser turn contains no model-turn witness');
  const browserTurnReceiptSha256 = semanticHash(browserTurnReceipt);
  const index = {
    schemaVersion: CULTIVATED_FIRST_LIVED_TURN_EVIDENCE_SCHEMA,
    bindingRef: binding.bindingRef,
    activationEvidenceRef: binding.activationEvidenceRef,
    distributionTrustEvidenceRef: binding.distributionTrustEvidenceRef,
    artifactCustodyEvidenceRef: binding.artifactCustodyEvidenceRef,
    runtimeAdapterEvidenceRef: binding.runtimeAdapterEvidenceRef,
    modelRef: binding.modelRef,
    modelProfileRef: binding.modelProfileRef,
    artifactRef: binding.artifact.artifactRef,
    runtimeAdapterRef: binding.runtime.runtimeAdapterRef,
    runtimeBindingReceiptRef: runtimeBindingReceipt.receiptRef,
    browserTurnReceiptSha256,
    conversationHeadSha256: browserTurnReceipt.conversationHeadSha256,
    requestEventRef: browserTurnReceipt.requestEventRef,
    requestEventSha256: browserTurnReceipt.requestEventSha256,
    responseEventRef: browserTurnReceipt.responseEventRef,
    responseEventSha256: browserTurnReceipt.responseEventSha256,
    promptContextReceiptRefOrNull: browserTurnReceipt.promptContextReceiptRef ?? browserTurnReceipt.promptContextReceiptRefOrNull ?? null,
    modelTurnWitnessRefOrFingerprint: typeof witness === 'string' ? witness : semanticHash(witness),
    transcriptCopied: false,
    replayPerformed: false
  };
  const sharedEvidenceRef = `evidence.vexlife.cultivated-first-lived-turn.${semanticHash(index)}`;
  return Object.freeze({ ...index, sharedEvidenceRef });
}

// [VXG RealForever]
