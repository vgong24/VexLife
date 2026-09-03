import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { semanticHash, writeJson } from './utils.mjs';
import { validateSemanticRelay } from './conversation.mjs';
import { createContextLease } from './context-lease.mjs';
import { assertCurrentLease } from './scheduler-runtime-trust.mjs';
import { normalizeModelRuntimeResponse } from './model-runtime-adapter.mjs';
import { formModelRuntimeInvocationEvidence, formModelTurnWitness, verifyModelTurnWitness } from './model-turn-witness.mjs';

export const LIVED_COMPANION_FAILURE_CODES = Object.freeze([
  'HOME_NOT_INITIALIZED',
  'EXISTING_HOME_REQUIRES_MIGRATION_PLAN',
  'HOME_IDENTITY_MISMATCH',
  'ENDPOINT_PROFILE_NOT_ADMITTED',
  'ENDPOINT_NOT_LOOPBACK_OR_EXPLICITLY_ALLOWED',
  'ENDPOINT_UNREACHABLE',
  'ENDPOINT_TIMEOUT',
  'ENDPOINT_HTTP_ERROR',
  'ENDPOINT_RESPONSE_INVALID',
  'PERSISTENCE_WRITE_FAILED',
  'CONVERSATION_HEAD_MISMATCH',
  'EVENT_CHAIN_CORRUPT',
  'CONTEXT_HASH_MISMATCH',
  'DUPLICATE_TURN_SUPPRESSED',
  'THREAD_WRITER_CONFLICT',
  'THREAD_WRITER_RECOVERY_REQUIRED',
  'PRIVACY_POLICY_BLOCKED',
  'SEMANTIC_RELAY_INVALID'
]);

export class LivedCompanionError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'LivedCompanionError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new LivedCompanionError(code, message, details);
}

function ensureString(value, name, code = 'HOME_IDENTITY_MISMATCH') {
  if (typeof value !== 'string' || value.length === 0) fail(code, `${name} is required`);
  return value;
}

function readJson(file, code, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(code, `${label} could not be read`, { file, cause: error.message });
  }
}

function stableNow(value) {
  return value ?? new Date().toISOString();
}

function fileSha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function contentHash(value) {
  return semanticHash(value);
}

const PORTABLE_REF_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u;
const WINDOWS_RESERVED_REF_STEM = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/u;

function ensureSafeRef(value, name, code = 'HOME_IDENTITY_MISMATCH') {
  const ref = ensureString(value, name, code);
  const stem = ref.split('.')[0];
  if (
    !PORTABLE_REF_PATTERN.test(ref) ||
    WINDOWS_RESERVED_REF_STEM.test(stem) ||
    ref.includes('\0') ||
    path.isAbsolute(ref) ||
    path.win32.isAbsolute(ref) ||
    path.posix.isAbsolute(ref)
  ) {
    fail(code, `${name} must be one lowercase portable canonical path segment`);
  }
  return ref;
}

function sameCanonicalPath(left, right) {
  const normalizedLeft = path.normalize(path.resolve(left));
  const normalizedRight = path.normalize(path.resolve(right));
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function assertCanonicalHomeAncestorChain(home, code, label) {
  const requested = path.resolve(ensureString(home, 'home'));
  const parsed = path.parse(requested);
  const relative = path.relative(parsed.root, requested);
  let cursor = parsed.root;

  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    let stat;
    try {
      stat = fs.lstatSync(cursor);
    } catch (error) {
      if (error?.code === 'ENOENT') return requested;
      fail(code, `${label} could not be classified without mutation`, {
        home: requested,
        path: cursor,
        cause: error.message
      });
    }
    if (stat.isSymbolicLink()) {
      fail(code, `${label} traverses a symbolic link or junction alias`, {
        home: requested,
        path: cursor
      });
    }
    if (!stat.isDirectory() && !sameCanonicalPath(cursor, requested)) {
      fail(code, `${label} traverses a non-directory ancestor`, {
        home: requested,
        path: cursor
      });
    }
    let real;
    try {
      real = fs.realpathSync.native(cursor);
    } catch (error) {
      fail(code, `${label} ancestor could not be canonicalized`, {
        home: requested,
        path: cursor,
        cause: error.message
      });
    }
    if (!sameCanonicalPath(real, cursor)) {
      fail(code, `${label} traverses a non-canonical linked ancestor`, {
        home: requested,
        path: cursor,
        canonicalPath: real
      });
    }
  }
  return requested;
}

function canonicalHomeRoot(home) {
  const requested = assertCanonicalHomeAncestorChain(home, 'HOME_IDENTITY_MISMATCH', 'Vex Home');
  let stat;
  try {
    stat = fs.lstatSync(requested);
  } catch (error) {
    if (error?.code === 'ENOENT') fail('HOME_NOT_INITIALIZED', 'Vex Home is not initialized', { home: requested });
    fail('HOME_IDENTITY_MISMATCH', 'Vex Home root could not be read', { home: requested, cause: error.message });
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail('HOME_IDENTITY_MISMATCH', 'Vex Home root must be one canonical regular directory', { home: requested });
  }
  const real = fs.realpathSync.native(requested);
  if (!sameCanonicalPath(real, requested)) {
    fail('HOME_IDENTITY_MISMATCH', 'Vex Home root is not its canonical filesystem identity', {
      home: requested,
      canonicalPath: real
    });
  }
  return real;
}

function admitFreshHomeRoot(home) {
  const requested = assertCanonicalHomeAncestorChain(
    home,
    'EXISTING_HOME_REQUIRES_MIGRATION_PLAN',
    'fresh Vex Home root'
  );
  let stat;
  try {
    stat = fs.lstatSync(requested);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      fail('EXISTING_HOME_REQUIRES_MIGRATION_PLAN', 'Vex Home root could not be classified without mutation', {
        home: requested,
        cause: error.message
      });
    }
    try {
      fs.mkdirSync(requested, { recursive: true });
    } catch (creationError) {
      fail('EXISTING_HOME_REQUIRES_MIGRATION_PLAN', 'fresh Vex Home root could not be created safely', {
        home: requested,
        cause: creationError.message
      });
    }
    return canonicalHomeRoot(requested);
  }

  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail('EXISTING_HOME_REQUIRES_MIGRATION_PLAN', 'pre-existing Vex Home root is not one empty canonical directory', {
      home: requested,
      rootKind: stat.isSymbolicLink() ? 'SYMBOLIC_LINK_OR_JUNCTION' : 'NON_DIRECTORY'
    });
  }

  const root = canonicalHomeRoot(requested);
  const entries = fs.readdirSync(root);
  if (entries.length > 0) {
    fail('EXISTING_HOME_REQUIRES_MIGRATION_PLAN', 'pre-existing non-empty Vex Home was preserved', {
      home: root,
      existingEntryCount: entries.length
    });
  }
  return root;
}

function resolveHomePath(home, ...segments) {
  const root = canonicalHomeRoot(home);
  const target = path.resolve(root, ...segments);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('HOME_IDENTITY_MISMATCH', 'resolved path escapes the admitted Vex Home', { target });
  }
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) {
      fail('HOME_IDENTITY_MISMATCH', 'resolved path traverses a symbolic link', { path: cursor });
    }
  }
  return target;
}

function resolveHomeRelativePath(home, relativePath, code = 'CONTEXT_HASH_MISMATCH') {
  const value = ensureString(relativePath, 'relativePath', code);
  const segments = value.split(/[\\/]/u);
  if (
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    path.posix.isAbsolute(value) ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    fail(code, 'stored relative path escapes the admitted Vex Home', { relativePath: value });
  }
  try {
    return resolveHomePath(home, ...segments);
  } catch (error) {
    if (error instanceof LivedCompanionError) fail(code, error.message, error.details);
    throw error;
  }
}

function safeFailureSegment(value, prefix) {
  try {
    return ensureSafeRef(value, prefix);
  } catch {
    return `${prefix}.invalid.${contentHash(String(value)).slice(0, 16)}`;
  }
}

function processLiveness(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return 'UNVERIFIABLE';
  if (pid === process.pid) return 'ACTIVE';
  try {
    process.kill(pid, 0);
    return 'ACTIVE';
  } catch (error) {
    if (error?.code === 'ESRCH') return 'ABSENT';
    if (error?.code === 'EPERM') return 'ACTIVE';
    return 'UNVERIFIABLE';
  }
}

function verifyThreadWriterLeaseRecord(value, companionLineageRef, threadRef) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('PERSISTENCE_WRITE_FAILED', 'thread writer lease record is invalid');
  }
  const { leaseSha256, ...core } = value;
  if (!/^[0-9a-f]{64}$/u.test(leaseSha256 ?? '') || contentHash(core) !== leaseSha256) {
    fail('PERSISTENCE_WRITE_FAILED', 'thread writer lease content hash does not match');
  }
  if (
    value.schemaVersion !== 'vexlife.thread-writer-lease/v1' ||
    value.companionLineageRef !== companionLineageRef ||
    value.threadRef !== threadRef ||
    ensureSafeRef(value.instanceRef, 'lease.instanceRef') !== value.instanceRef ||
    typeof value.lockToken !== 'string' ||
    value.lockToken.length === 0 ||
    !Number.isSafeInteger(value.pid) ||
    value.pid <= 0
  ) {
    fail('PERSISTENCE_WRITE_FAILED', 'thread writer lease identity is invalid');
  }
  return value;
}

function observedLastValidHead(home, companionLineageRef, threadRef) {
  try {
    const identity = loadHome(home);
    const admitted = assertHomeIdentity(identity, { companionLineageRef });
    return validateCompletedConversationState({
      home: identity.homeRoot,
      admitted,
      threadRef
    }).head;
  } catch {
    return null;
  }
}

function failUnverifiableThreadWriterLease(lockPath, companionLineageRef, threadRef, leaseValidationState, cause = null) {
  let observedLeaseFileSha256 = null;
  try {
    const stat = fs.lstatSync(lockPath);
    if (stat.isFile() && !stat.isSymbolicLink()) observedLeaseFileSha256 = fileSha256(lockPath);
  } catch {}
  fail('THREAD_WRITER_CONFLICT', 'existing thread writer lease evidence is unverifiable and requires attention', {
    companionLineageRef,
    threadRef,
    ownerInstanceRef: null,
    ownerPid: null,
    ownerState: 'UNVERIFIABLE',
    leaseSha256: null,
    observedLeaseFileSha256,
    leaseValidationState,
    exactNextSafeRoute: 'ATTENTION_REQUIRED_UNVERIFIABLE_THREAD_WRITER',
    cause
  });
}

function classifyExistingThreadWriterLease(home, lockPath, companionLineageRef, threadRef) {
  let stat;
  try {
    stat = fs.lstatSync(lockPath);
  } catch (error) {
    failUnverifiableThreadWriterLease(lockPath, companionLineageRef, threadRef, 'LOCK_PATH_UNREADABLE', error.message);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    failUnverifiableThreadWriterLease(lockPath, companionLineageRef, threadRef, 'LOCK_PATH_NOT_REGULAR_FILE');
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch (error) {
    failUnverifiableThreadWriterLease(lockPath, companionLineageRef, threadRef, 'LEASE_JSON_MALFORMED_OR_UNREADABLE', error.message);
  }

  let observed;
  try {
    observed = verifyThreadWriterLeaseRecord(parsed, companionLineageRef, threadRef);
  } catch (error) {
    if (error instanceof LivedCompanionError) {
      const leaseValidationState = error.message.includes('content hash')
        ? 'LEASE_CONTENT_HASH_INVALID'
        : 'LEASE_IDENTITY_INVALID';
      failUnverifiableThreadWriterLease(lockPath, companionLineageRef, threadRef, leaseValidationState, error.message);
    }
    throw error;
  }

  const ownerState = processLiveness(observed.pid);
  const details = {
    companionLineageRef,
    threadRef,
    ownerInstanceRef: observed.instanceRef,
    ownerPid: observed.pid,
    ownerState,
    leaseSha256: observed.leaseSha256,
    observedLeaseFileSha256: fileSha256(lockPath),
    leaseValidationState: 'VALID'
  };
  if (ownerState === 'ABSENT') {
    details.lastValidHead = observedLastValidHead(home, companionLineageRef, threadRef);
    details.exactNextSafeRoute = 'EXPLICIT_THREAD_WRITER_LEASE_RECOVERY_REQUIRED';
    fail('THREAD_WRITER_RECOVERY_REQUIRED', 'the recorded thread writer is absent and its lease requires explicit recovery', details);
  }
  details.exactNextSafeRoute = ownerState === 'ACTIVE'
    ? 'WAIT_FOR_ACTIVE_THREAD_WRITER_OR_RETRY'
    : 'ATTENTION_REQUIRED_UNVERIFIABLE_THREAD_WRITER';
  fail('THREAD_WRITER_CONFLICT', 'another writer already holds the exact thread lease', details);
}

function acquireThreadWriterLease(home, companionLineageRef, threadRef, instanceRef) {
  const root = canonicalHomeRoot(home);
  const lineage = ensureSafeRef(companionLineageRef, 'companionLineageRef');
  const thread = ensureSafeRef(threadRef, 'threadRef');
  const instance = ensureSafeRef(instanceRef, 'instanceRef');
  const lockDirectory = resolveHomePath(root, 'runtime', 'thread-writer-locks', lineage);
  fs.mkdirSync(lockDirectory, { recursive: true });
  const lockPath = resolveHomePath(root, 'runtime', 'thread-writer-locks', lineage, `${thread}.lock`);
  const lockToken = crypto.randomUUID();
  const leaseCore = {
    schemaVersion: 'vexlife.thread-writer-lease/v1',
    companionLineageRef: lineage,
    threadRef: thread,
    instanceRef: instance,
    lockToken,
    pid: process.pid,
    formedAt: new Date().toISOString()
  };
  const lease = { ...leaseCore, leaseSha256: contentHash(leaseCore) };
  let descriptor = null;
  try {
    descriptor = fs.openSync(lockPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(lease, null, 2)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (descriptor !== null) {
      try { fs.closeSync(descriptor); } catch {}
    }
    if (error?.code === 'EEXIST') {
      classifyExistingThreadWriterLease(root, lockPath, lineage, thread);
    }
    if (error instanceof LivedCompanionError) throw error;
    try {
      if (fs.existsSync(lockPath) && !fs.lstatSync(lockPath).isSymbolicLink()) {
        const observed = readJson(lockPath, 'PERSISTENCE_WRITE_FAILED', 'thread writer lease');
        if (observed.lockToken === lockToken) fs.unlinkSync(lockPath);
      }
    } catch {}
    fail('PERSISTENCE_WRITE_FAILED', 'thread writer lease could not be acquired', { cause: error.message });
  }
  return {
    descriptor,
    lockPath,
    lockToken,
    leaseSha256: lease.leaseSha256,
    companionLineageRef: lineage,
    threadRef: thread
  };
}

function releaseThreadWriterLease(lease) {
  if (!lease) return true;
  try { fs.closeSync(lease.descriptor); } catch {}
  try {
    if (!fs.existsSync(lease.lockPath)) return false;
    const stat = fs.lstatSync(lease.lockPath);
    if (stat.isSymbolicLink() || !stat.isFile()) return false;
    const observed = JSON.parse(fs.readFileSync(lease.lockPath, 'utf8'));
    if (observed.lockToken !== lease.lockToken || observed.leaseSha256 !== lease.leaseSha256) return false;
    fs.unlinkSync(lease.lockPath);
    return !fs.existsSync(lease.lockPath);
  } catch {
    return false;
  }
}

function verifyHead(head) {
  if (!head || typeof head !== 'object' || Array.isArray(head)) fail('CONVERSATION_HEAD_MISMATCH', 'conversation head is invalid');
  const { conversationHeadSha256, ...core } = head;
  if (!/^[0-9a-f]{64}$/u.test(conversationHeadSha256 ?? '') || contentHash(core) !== conversationHeadSha256) {
    fail('CONVERSATION_HEAD_MISMATCH', 'conversation head content hash does not match');
  }
  return head;
}

function verifyContentAddressedReceipt(receipt, hashField, code, label) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) fail(code, `${label} is invalid`);
  const { [hashField]: observed, ...core } = receipt;
  if (!/^[0-9a-f]{64}$/u.test(observed ?? '') || contentHash(core) !== observed) {
    fail(code, `${label} content hash does not match`);
  }
  return receipt;
}

function isLoopbackHost(hostname) {
  const normalized = String(hostname).toLowerCase().replace(/^\[|\]$/gu, '');
  return normalized === '127.0.0.1' || normalized === '::1';
}

export function sanitizeEndpointOrigin(endpoint) {
  const parsed = new URL(endpoint);
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.origin;
}

function endpointRequestUrl(endpoint) {
  const base = new URL(endpoint);
  const prefix = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  base.pathname = `${prefix}v1/chat/completions`.replace(/\/{2,}/gu, '/');
  base.search = '';
  base.hash = '';
  return base;
}

function homePaths(home, companionLineageRef, threadRef) {
  const lineage = ensureSafeRef(companionLineageRef, 'companionLineageRef');
  const thread = ensureSafeRef(threadRef, 'threadRef');
  return {
    homeManifest: resolveHomePath(home, 'config', 'home.json'),
    events: resolveHomePath(home, 'conversations', lineage, thread, 'events'),
    heads: resolveHomePath(home, 'conversations', lineage, thread, 'heads'),
    head: resolveHomePath(home, 'conversations', lineage, thread, 'head.json'),
    context: resolveHomePath(home, 'context', lineage, thread),
    runtime: resolveHomePath(home, 'runtime'),
    recovery: resolveHomePath(home, 'recovery')
  };
}

function immutableConversationHeadFile(home, admitted, threadRef, conversationHeadSha256) {
  const safeThread = ensureSafeRef(threadRef, 'threadRef', 'CONVERSATION_HEAD_MISMATCH');
  if (!/^[0-9a-f]{64}$/u.test(conversationHeadSha256 ?? '')) {
    fail('CONVERSATION_HEAD_MISMATCH', 'historical conversation head SHA-256 is invalid');
  }
  return resolveHomePath(
    home,
    'conversations',
    admitted.companionLineageRef,
    safeThread,
    'heads',
    `${conversationHeadSha256}.json`
  );
}

function loadImmutableConversationHead(home, admitted, threadRef, conversationHeadSha256) {
  const safeThread = ensureSafeRef(threadRef, 'threadRef', 'CONVERSATION_HEAD_MISMATCH');
  const file = immutableConversationHeadFile(home, admitted, safeThread, conversationHeadSha256);
  if (!fs.existsSync(file)) {
    fail('CONVERSATION_HEAD_MISMATCH', 'immutable historical conversation head receipt is missing', { conversationHeadSha256 });
  }
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    fail('CONVERSATION_HEAD_MISMATCH', 'immutable historical conversation head receipt must be one regular file', { file });
  }
  const head = verifyHead(readJson(file, 'CONVERSATION_HEAD_MISMATCH', 'immutable historical conversation head'));
  if (
    head.schemaVersion !== 'vexlife.lived-companion-head/v1' ||
    head.homeRef !== admitted.homeRef ||
    head.deviceRef !== admitted.deviceRef ||
    head.companionLineageRef !== admitted.companionLineageRef ||
    head.threadRef !== safeThread ||
    ensureSafeRef(head.instanceRef, 'historicalHead.instanceRef', 'CONVERSATION_HEAD_MISMATCH') !== head.instanceRef ||
    ensureSafeRef(head.turnRef, 'historicalHead.turnRef', 'CONVERSATION_HEAD_MISMATCH') !== head.turnRef ||
    !Number.isSafeInteger(head.sequence) ||
    head.sequence < 1 ||
    head.sequence % 2 !== 1 ||
    !/^[0-9a-f]{64}$/u.test(head.eventHash ?? '') ||
    !/^[0-9a-f]{64}$/u.test(head.contextSha256 ?? '') ||
    !isNonEmptyString(head.contextPath) ||
    !isNonEmptyString(head.requestMessageRef) ||
    !isNonEmptyString(head.responseMessageRef) ||
    !isNonEmptyString(head.formedAt) || !Number.isFinite(Date.parse(head.formedAt)) || new Date(head.formedAt).toISOString() !== head.formedAt ||
    (head.sequence === 1 ? head.priorConversationHeadSha256 !== null : !/^[0-9a-f]{64}$/u.test(head.priorConversationHeadSha256 ?? ''))
  ) {
    fail('CONVERSATION_HEAD_MISMATCH', 'immutable historical conversation head identity is invalid', { conversationHeadSha256 });
  }
  if (head.conversationHeadSha256 !== conversationHeadSha256) {
    fail('CONVERSATION_HEAD_MISMATCH', 'immutable historical conversation head filename/hash binding is invalid', { conversationHeadSha256 });
  }
  return { head, file };
}

function writeImmutableConversationHead(home, admitted, threadRef, head) {
  const file = immutableConversationHeadFile(home, admitted, threadRef, head.conversationHeadSha256);
  const disposition = writeJsonExclusive(file, head);
  if (disposition === 'EXISTS') {
    const existing = loadImmutableConversationHead(home, admitted, threadRef, head.conversationHeadSha256).head;
    if (JSON.stringify(existing) !== JSON.stringify(head)) {
      fail('CONVERSATION_HEAD_MISMATCH', 'immutable conversation head address already contains different bytes', { conversationHeadSha256: head.conversationHeadSha256 });
    }
  }
  return { file, disposition };
}

function loadHome(home) {
  const root = canonicalHomeRoot(home);
  const manifestPath = resolveHomePath(root, 'config', 'home.json');
  if (!fs.existsSync(manifestPath)) fail('HOME_NOT_INITIALIZED', 'Vex Home is not initialized', { home });
  const manifest = readJson(manifestPath, 'HOME_IDENTITY_MISMATCH', 'home manifest');
  ensureString(manifest.homeRef, 'homeRef');
  ensureString(manifest.familyRef, 'familyRef');
  const deviceRef = ensureSafeRef(manifest.currentDeviceRef, 'currentDeviceRef');
  const companionLineageRef = ensureSafeRef(manifest.currentCompanionLineageRef, 'currentCompanionLineageRef');
  const devicePath = resolveHomePath(root, 'devices', `${deviceRef}.json`);
  if (!fs.existsSync(devicePath)) fail('HOME_IDENTITY_MISMATCH', 'current device record is missing', { deviceRef });
  const device = readJson(devicePath, 'HOME_IDENTITY_MISMATCH', 'device record');
  if (device.deviceRef !== deviceRef || device.companionLineageRef !== companionLineageRef) {
    fail('HOME_IDENTITY_MISMATCH', 'home and device lineage identities disagree');
  }
  return { manifest, device, manifestPath, homeRoot: root };
}

function assertHomeIdentity(identity, expected = {}) {
  const checks = {
    homeRef: identity.manifest.homeRef,
    deviceRef: identity.manifest.currentDeviceRef,
    companionLineageRef: identity.manifest.currentCompanionLineageRef
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (expectedValue !== undefined && expectedValue !== null && checks[key] !== expectedValue) {
      fail('HOME_IDENTITY_MISMATCH', `${key} does not match the admitted identity`, { expected: expectedValue, observed: checks[key] });
    }
  }
  return checks;
}

export function initializeLivedCompanionHome({
  home,
  homeRef,
  familyRef,
  deviceRef,
  companionLineageRef,
  createdAt = new Date().toISOString()
}) {
  ensureString(homeRef, 'homeRef');
  ensureString(familyRef, 'familyRef');
  const safeDeviceRef = ensureSafeRef(deviceRef, 'deviceRef');
  const safeLineageRef = ensureSafeRef(companionLineageRef, 'companionLineageRef');
  const root = admitFreshHomeRoot(home);
  const manifestPath = resolveHomePath(root, 'config', 'home.json');
  for (const directory of ['config', 'devices', 'conversations', 'context', 'runtime', 'recovery']) {
    fs.mkdirSync(resolveHomePath(root, directory), { recursive: true });
  }
  const device = {
    schemaVersion: 'vexlife.device-installation/v0',
    personRef: 'person.proof-user',
    familyRef,
    deviceRef: safeDeviceRef,
    deviceName: 'G01 bounded proof device',
    platform: process.platform,
    architecture: process.arch,
    companionLineageRef: safeLineageRef,
    currentInstanceRef: null,
    createdAt,
    identityStatement: 'Distinct device companion lineage; shared state does not collapse identity.'
  };
  const manifest = {
    schemaVersion: 'vexlife.home/v0',
    homeRef,
    familyRef,
    createdAt,
    currentDeviceRef: safeDeviceRef,
    currentCompanionLineageRef: safeLineageRef,
    modelConfigurationRef: 'config/model.json'
  };
  writeJson(manifestPath, manifest);
  writeJson(resolveHomePath(root, 'devices', `${safeDeviceRef}.json`), device);
  writeJson(resolveHomePath(root, 'config', 'model.json'), {
    schemaVersion: 'vexlife.model-configuration/v0',
    state: 'UNCONFIGURED',
    endpoint: null,
    activeArtifactRef: null,
    automaticDownload: false,
    automaticActivation: false
  });
  return { home: root, manifest, device };
}

function eventPath(eventsDirectory, sequence, eventHash) {
  if (fs.existsSync(eventsDirectory)) {
    const directoryStat = fs.lstatSync(eventsDirectory);
    if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
      fail('HOME_IDENTITY_MISMATCH', 'conversation events path must be one real directory inside Vex Home');
    }
  }
  const file = path.join(eventsDirectory, `${String(sequence).padStart(8, '0')}-${eventHash}.json`);
  if (fs.existsSync(file)) {
    const fileStat = fs.lstatSync(file);
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
      fail('EVENT_CHAIN_CORRUPT', 'conversation event path must be one regular file');
    }
  }
  return file;
}

function formEvent(core) {
  const eventHash = contentHash(core);
  return { ...core, eventHash };
}

function formContext(core) {
  const serializedContextSha256 = contentHash(core);
  return { ...core, serializedContextSha256 };
}

function formHead(core) {
  const conversationHeadSha256 = contentHash(core);
  return { ...core, conversationHeadSha256 };
}

function atomicWriteJson(file, value, { failBeforeRename = false } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    if (failBeforeRename) fail('PERSISTENCE_WRITE_FAILED', 'simulated persistence failure before atomic head advance');
    fs.renameSync(temporary, file);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    if (error instanceof LivedCompanionError) throw error;
    fail('PERSISTENCE_WRITE_FAILED', 'atomic JSON write failed', { file, cause: error.message });
  }
}

function existingEvents(eventsDirectory, expectedIdentity = null) {
  if (!fs.existsSync(eventsDirectory)) return [];
  const directoryStat = fs.lstatSync(eventsDirectory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    fail('HOME_IDENTITY_MISMATCH', 'conversation events path must be one real directory inside Vex Home');
  }
  return fs.readdirSync(eventsDirectory, { withFileTypes: true })
    .filter((entry) => entry.name.endsWith('.json'))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const file = path.join(eventsDirectory, entry.name);
      if (entry.isSymbolicLink() || !entry.isFile() || fs.lstatSync(file).isSymbolicLink()) {
        fail('EVENT_CHAIN_CORRUPT', 'conversation event entry must be one regular non-symlink file', { file });
      }
      const event = readJson(file, 'EVENT_CHAIN_CORRUPT', 'conversation event');
      assertEventRecord(event, expectedIdentity, entry.name);
      return event;
    });
}

function assertNoDuplicateTurn(eventsDirectory, turnRef, lastValidHead = null, expectedIdentity = null) {
  const duplicate = existingEvents(eventsDirectory, expectedIdentity)
    .find((event) => event.turnRef === turnRef);
  if (duplicate) {
    fail('DUPLICATE_TURN_SUPPRESSED', 'turnRef has already been recorded', {
      turnRef,
      eventHash: duplicate.eventHash,
      eventKind: duplicate.eventKind,
      sequence: duplicate.sequence,
      existingEvidence: true,
      exactNextSafeRoute: lastValidHead
        ? 'USE_EXISTING_TURN_EVIDENCE_OR_RESUME_LAST_VALID_HEAD_AND_FORM_NEW_TURN_REF'
        : 'USE_EXISTING_TURN_EVIDENCE_OR_FORM_NEW_TURN_REF'
    });
  }
}

function exactFailureRoute({ error, requestDurablyRecorded, responseDurablyRecorded, lastValidHead }) {
  if (error.code === 'THREAD_WRITER_RECOVERY_REQUIRED') {
    return 'EXPLICIT_THREAD_WRITER_LEASE_RECOVERY_REQUIRED';
  }
  if (error.code === 'THREAD_WRITER_CONFLICT') {
    return error.details?.exactNextSafeRoute ?? 'WAIT_FOR_ACTIVE_THREAD_WRITER_OR_RETRY';
  }
  if (error.code === 'DUPLICATE_TURN_SUPPRESSED') {
    return error.details?.exactNextSafeRoute ?? 'USE_EXISTING_TURN_EVIDENCE_OR_FORM_NEW_TURN_REF';
  }
  if (requestDurablyRecorded || responseDurablyRecorded) {
    return lastValidHead
      ? 'RESUME_LAST_VALID_HEAD_THEN_FORM_NEW_TURN_REF'
      : 'FORM_NEW_TURN_REF_AND_RETRY';
  }
  return lastValidHead
    ? 'RESUME_FROM_LAST_VALID_HEAD'
    : 'INITIALIZE_OR_RETRY_WITH_ADMITTED_INPUTS';
}

function writeJsonExclusive(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let descriptor = null;
  try {
    descriptor = fs.openSync(file, 'wx', 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    return 'CREATED';
  } catch (error) {
    if (descriptor !== null) {
      try { fs.closeSync(descriptor); } catch {}
    }
    if (error?.code === 'EEXIST') return 'EXISTS';
    throw error;
  }
}

function expectedCanonicalFirstFailureRoute(receipt) {
  if (receipt.failureCode === 'THREAD_WRITER_RECOVERY_REQUIRED') {
    return 'EXPLICIT_THREAD_WRITER_LEASE_RECOVERY_REQUIRED';
  }
  if (receipt.failureCode === 'THREAD_WRITER_CONFLICT') {
    return receipt.threadWriterLeaseDisposition?.ownerState === 'ACTIVE'
      ? 'WAIT_FOR_ACTIVE_THREAD_WRITER_OR_RETRY'
      : 'ATTENTION_REQUIRED_UNVERIFIABLE_THREAD_WRITER';
  }
  if (receipt.failureCode === 'DUPLICATE_TURN_SUPPRESSED') {
    return receipt.lastValidHead
      ? 'USE_EXISTING_TURN_EVIDENCE_OR_RESUME_LAST_VALID_HEAD_AND_FORM_NEW_TURN_REF'
      : 'USE_EXISTING_TURN_EVIDENCE_OR_FORM_NEW_TURN_REF';
  }
  if (receipt.requestDurablyRecorded || receipt.responseDurablyRecorded) {
    return receipt.lastValidHead
      ? 'RESUME_LAST_VALID_HEAD_THEN_FORM_NEW_TURN_REF'
      : 'FORM_NEW_TURN_REF_AND_RETRY';
  }
  return receipt.lastValidHead
    ? 'RESUME_FROM_LAST_VALID_HEAD'
    : 'INITIALIZE_OR_RETRY_WITH_ADMITTED_INPUTS';
}

function verifyCanonicalFirstFailureReceipt(value, safeThread, safeTurn) {
  const receipt = verifyContentAddressedReceipt(
    value,
    'failureReceiptSha256',
    'PERSISTENCE_WRITE_FAILED',
    'first failure receipt'
  );
  const validLastHead =
    receipt.lastValidHead === null ||
    (
      receipt.lastValidHead &&
      /^[0-9a-f]{64}$/u.test(receipt.lastValidHead.conversationHeadSha256 ?? '') &&
      /^[0-9a-f]{64}$/u.test(receipt.lastValidHead.eventHash ?? '') &&
      Number.isSafeInteger(receipt.lastValidHead.sequence) &&
      receipt.lastValidHead.sequence >= 1
    );
  const preRequestFailureCodes = new Set([
    'HOME_NOT_INITIALIZED',
    'EXISTING_HOME_REQUIRES_MIGRATION_PLAN',
    'HOME_IDENTITY_MISMATCH',
    'CONVERSATION_HEAD_MISMATCH',
    'EVENT_CHAIN_CORRUPT',
    'CONTEXT_HASH_MISMATCH',
    'DUPLICATE_TURN_SUPPRESSED',
    'THREAD_WRITER_CONFLICT',
    'THREAD_WRITER_RECOVERY_REQUIRED',
    'SEMANTIC_RELAY_INVALID'
  ]);
  const endpointFailure = String(receipt.failureCode || '').startsWith('ENDPOINT_');
  const validDurability =
    !(receipt.responseDurablyRecorded === true && receipt.requestDurablyRecorded !== true) &&
    (!endpointFailure || (
      receipt.requestDurablyRecorded === true &&
      receipt.responseDurablyRecorded === false
    )) &&
    (!preRequestFailureCodes.has(receipt.failureCode) || (
      receipt.requestDurablyRecorded === false &&
      receipt.responseDurablyRecorded === false
    ));
  const expectedRetrySameTurnAllowed =
    receipt.failureCode !== 'DUPLICATE_TURN_SUPPRESSED' &&
    receipt.requestDurablyRecorded === false &&
    receipt.responseDurablyRecorded === false;
  const validDuplicateEvidence =
    receipt.failureCode === 'DUPLICATE_TURN_SUPPRESSED'
      ? (
          receipt.existingTurnEvidence &&
          /^[0-9a-f]{64}$/u.test(receipt.existingTurnEvidence.eventHash ?? '') &&
          ['REQUEST', 'RESPONSE'].includes(receipt.existingTurnEvidence.eventKind) &&
          Number.isSafeInteger(receipt.existingTurnEvidence.sequence) &&
          receipt.existingTurnEvidence.sequence >= 0
        )
      : receipt.existingTurnEvidence === null;
  const validLeaseDisposition =
    ['THREAD_WRITER_CONFLICT', 'THREAD_WRITER_RECOVERY_REQUIRED'].includes(receipt.failureCode)
      ? (
          receipt.threadWriterLeaseDisposition &&
          ['ACTIVE', 'ABSENT', 'UNVERIFIABLE'].includes(receipt.threadWriterLeaseDisposition.ownerState) &&
          (
            receipt.failureCode !== 'THREAD_WRITER_RECOVERY_REQUIRED' ||
            receipt.threadWriterLeaseDisposition.ownerState === 'ABSENT'
          ) &&
          (
            receipt.failureCode !== 'THREAD_WRITER_CONFLICT' ||
            receipt.threadWriterLeaseDisposition.ownerState !== 'ABSENT'
          )
        )
      : receipt.threadWriterLeaseDisposition === null;
  const expectedRoute = expectedCanonicalFirstFailureRoute(receipt);
  if (
    receipt.schemaVersion !== 'vexlife.lived-companion-failure-receipt/v2' ||
    !LIVED_COMPANION_FAILURE_CODES.includes(receipt.failureCode) ||
    !isNonEmptyString(receipt.failureMessage) ||
    receipt.threadRef !== safeThread ||
    receipt.turnRef !== safeTurn ||
    typeof receipt.requestDurablyRecorded !== 'boolean' ||
    typeof receipt.responseDurablyRecorded !== 'boolean' ||
    typeof receipt.resumePossible !== 'boolean' ||
    typeof receipt.retrySameTurnAllowed !== 'boolean' ||
    receipt.followUpToFirstFailure !== false ||
    receipt.firstFailureReceiptFileSha256 !== null ||
    !isNonEmptyString(receipt.exactNextSafeRoute) ||
    !isNonEmptyString(receipt.formedAt) ||
    !validLastHead ||
    receipt.resumePossible !== Boolean(receipt.lastValidHead) ||
    !validDurability ||
    receipt.retrySameTurnAllowed !== expectedRetrySameTurnAllowed ||
    receipt.exactNextSafeRoute !== expectedRoute ||
    !validDuplicateEvidence ||
    !validLeaseDisposition
  ) {
    fail('PERSISTENCE_WRITE_FAILED', 'canonical first failure receipt semantics are invalid');
  }
  return receipt;
}
function formFailureReceipt({
  safeThread,
  safeTurn,
  error,
  requestDurablyRecorded,
  responseDurablyRecorded,
  lastValidHead,
  leaseDisposition,
  followUpToFirstFailure,
  firstFailureReceiptFileSha256
}) {
  const nextRoute = exactFailureRoute({
    error,
    requestDurablyRecorded,
    responseDurablyRecorded,
    lastValidHead
  });
  const receiptCore = {
    schemaVersion: 'vexlife.lived-companion-failure-receipt/v2',
    failureCode: error.code || 'PERSISTENCE_WRITE_FAILED',
    failureMessage: String(error.message || error).replace(/[?&](?:token|key|secret|authorization)=[^&\s]*/giu, '?redacted=true'),
    threadRef: safeThread,
    turnRef: safeTurn,
    requestDurablyRecorded,
    responseDurablyRecorded,
    lastValidHead: lastValidHead ? {
      conversationHeadSha256: lastValidHead.conversationHeadSha256,
      eventHash: lastValidHead.eventHash,
      sequence: lastValidHead.sequence
    } : null,
    resumePossible: Boolean(lastValidHead),
    retrySameTurnAllowed:
      error.code !== 'DUPLICATE_TURN_SUPPRESSED' &&
      !requestDurablyRecorded &&
      !responseDurablyRecorded,
    threadWriterLeaseDisposition: leaseDisposition,
    existingTurnEvidence: error.code === 'DUPLICATE_TURN_SUPPRESSED'
      ? {
          eventHash: error.details?.eventHash ?? null,
          eventKind: error.details?.eventKind ?? null,
          sequence: error.details?.sequence ?? null
        }
      : null,
    exactNextSafeRoute: nextRoute,
    followUpToFirstFailure,
    firstFailureReceiptFileSha256,
    formedAt: new Date().toISOString()
  };
  return {
    ...receiptCore,
    failureReceiptSha256: contentHash(receiptCore)
  };
}

function writeFailureReceipt({ home, threadRef, turnRef, error, requestDurablyRecorded, responseDurablyRecorded, lastValidHead }) {
  const unavailable = (state) => ({
    failureReceiptPath: null,
    failureEvidenceIntegrityState: state
  });
  if (!home || !fs.existsSync(home)) return unavailable('HOME_UNAVAILABLE');
  const safeThread = safeFailureSegment(threadRef || 'thread.unknown', 'thread.failure');
  const safeTurn = safeFailureSegment(turnRef || `turn.failure.${crypto.randomUUID()}`, 'turn.failure');
  let canonicalReceiptPath;
  try {
    canonicalReceiptPath = resolveHomePath(home, 'recovery', safeThread, safeTurn, 'failure-receipt.json');
  } catch {
    return unavailable('FAILURE_PATH_UNAVAILABLE');
  }
  const leaseDisposition = ['THREAD_WRITER_CONFLICT', 'THREAD_WRITER_RECOVERY_REQUIRED'].includes(error.code)
    ? {
        ownerInstanceRef: error.details?.ownerInstanceRef ?? null,
        ownerPid: error.details?.ownerPid ?? null,
        ownerState: error.details?.ownerState ?? 'UNKNOWN',
        leaseSha256: error.details?.leaseSha256 ?? null,
        observedLeaseFileSha256: error.details?.observedLeaseFileSha256 ?? null,
        leaseValidationState: error.details?.leaseValidationState ?? null
      }
    : null;

  const firstReceipt = formFailureReceipt({
    safeThread,
    safeTurn,
    error,
    requestDurablyRecorded,
    responseDurablyRecorded,
    lastValidHead,
    leaseDisposition,
    followUpToFirstFailure: false,
    firstFailureReceiptFileSha256: null
  });

  let firstWriteState;
  try {
    firstWriteState = writeJsonExclusive(canonicalReceiptPath, firstReceipt);
  } catch {
    return unavailable('FIRST_FAILURE_WRITE_FAILED');
  }
  if (firstWriteState === 'CREATED') {
    return {
      failureReceiptPath: canonicalReceiptPath,
      failureEvidenceIntegrityState: 'FIRST_FAILURE_ATOMICALLY_FORMED'
    };
  }

  let existingFirst;
  let firstFailureReceiptFileSha256;
  try {
    const stat = fs.lstatSync(canonicalReceiptPath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return unavailable('CORRUPT_EXISTING_FIRST_FAILURE_RECEIPT');
    }
    existingFirst = verifyCanonicalFirstFailureReceipt(
      readJson(canonicalReceiptPath, 'PERSISTENCE_WRITE_FAILED', 'first failure receipt'),
      safeThread,
      safeTurn
    );
    firstFailureReceiptFileSha256 = fileSha256(canonicalReceiptPath);
  } catch {
    return unavailable('CORRUPT_EXISTING_FIRST_FAILURE_RECEIPT');
  }

  const receipt = formFailureReceipt({
    safeThread,
    safeTurn,
    error,
    requestDurablyRecorded,
    responseDurablyRecorded,
    lastValidHead,
    leaseDisposition,
    followUpToFirstFailure: true,
    firstFailureReceiptFileSha256
  });
  let receiptPath;
  try {
    receiptPath = resolveHomePath(
      home,
      'recovery',
      safeThread,
      safeTurn,
      `failure-receipt-${receipt.failureReceiptSha256}.json`
    );
    const followWriteState = writeJsonExclusive(receiptPath, receipt);
    if (followWriteState === 'EXISTS') {
      const existing = verifyContentAddressedReceipt(
        readJson(receiptPath, 'PERSISTENCE_WRITE_FAILED', 'failure follow-up receipt'),
        'failureReceiptSha256',
        'PERSISTENCE_WRITE_FAILED',
        'failure follow-up receipt'
      );
      if (
        existing.failureReceiptSha256 !== receipt.failureReceiptSha256 ||
        existing.followUpToFirstFailure !== true ||
        existing.firstFailureReceiptFileSha256 !== firstFailureReceiptFileSha256 ||
        existing.threadRef !== safeThread ||
        existing.turnRef !== safeTurn
      ) {
        return unavailable('FOLLOW_UP_RECEIPT_COLLISION');
      }
      return {
        failureReceiptPath: receiptPath,
        failureEvidenceIntegrityState: 'FOLLOW_UP_IDEMPOTENTLY_REUSED'
      };
    }
    return {
      failureReceiptPath: receiptPath,
      failureEvidenceIntegrityState: 'FOLLOW_UP_CONTENT_ADDRESSED_FORMED'
    };
  } catch {
    return unavailable('FOLLOW_UP_WRITE_FAILED');
  }
}


function inMemoryAuthorizationPersistenceSecrets(inMemoryAuthorization) {
  if (inMemoryAuthorization === null || inMemoryAuthorization === undefined) return [];
  if (typeof inMemoryAuthorization !== 'string' || inMemoryAuthorization.trim().length === 0) {
    fail('PRIVACY_POLICY_BLOCKED', 'in-memory authorization must be one non-empty string when provided');
  }
  const trimmed = inMemoryAuthorization.trim();
  const secrets = new Set([inMemoryAuthorization, trimmed]);
  const authorization = /^([A-Za-z][A-Za-z0-9!#$%&'*+.^_`|~-]*)[\t ]+(.+)$/u.exec(trimmed);
  if (authorization) {
    const scheme = authorization[1];
    const credential = authorization[2].trim();
    if (credential.length > 0) secrets.add(credential);
    if (scheme.toLowerCase() === 'basic' && credential.length > 0) {
      try {
        const decoded = Buffer.from(credential, 'base64').toString('utf8');
        const normalized = Buffer.from(decoded, 'utf8').toString('base64').replace(/=+$/u, '');
        if (normalized === credential.replace(/=+$/u, '')) {
          if (decoded.length > 0) secrets.add(decoded);
          const separator = decoded.indexOf(':');
          if (separator >= 0) {
            const password = decoded.slice(separator + 1);
            if (password.length > 0) secrets.add(password);
          }
        }
      } catch {}
    }
  }
  return [...secrets].filter((value) => value.length > 0);
}

function assertInMemoryAuthorizationNotPersisted(value, inMemoryAuthorization, label) {
  const protectedSecrets = inMemoryAuthorizationPersistenceSecrets(inMemoryAuthorization);
  if (protectedSecrets.length === 0) return;
  const visit = (candidate, pathLabel) => {
    if (typeof candidate === 'string') {
      if (protectedSecrets.some((secret) => candidate.includes(secret))) {
        fail('PRIVACY_POLICY_BLOCKED', `${pathLabel} contains protected in-memory credential material`);
      }
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach((entry, index) => visit(entry, `${pathLabel}[${index}]`));
      return;
    }
    if (candidate && typeof candidate === 'object') {
      for (const [key, entry] of Object.entries(candidate)) {
        visit(entry, `${pathLabel}.${key}`);
      }
    }
  };
  visit(value, label);
}

function validatedEventSemanticRelay(relay, { messageRef, recipientRefs, phase }) {
  if (relay === undefined || relay === null) return null;
  const validation = validateSemanticRelay(relay, { sourceMessageRef: messageRef, recipientRefs });
  if (!validation.ok) {
    fail('SEMANTIC_RELAY_INVALID', `${phase} semantic relay metadata is invalid`, {
      messageRef,
      errors: validation.errors
    });
  }
  return structuredClone(relay);
}

function promptContextFailure(message, details = null) {
  fail('CONTEXT_HASH_MISMATCH', message, details);
}

const TRUSTED_PROMPT_CONTEXT_MATERIALIZATIONS = new WeakMap();
const TRUSTED_MODEL_RUNTIME_RESPONSES = new WeakMap();

function canonicalPromptContextCurrentEventBinding(value, label = 'current request event binding') {
  const expectedKeys = ['eventHash', 'eventRef', 'sequence'];
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expectedKeys)) {
    promptContextFailure(`${label} is invalid`);
  }
  const eventRef = ensureSafeRef(value.eventRef, `${label}.eventRef`, 'CONTEXT_HASH_MISMATCH');
  if (!/^[0-9a-f]{64}$/u.test(value.eventHash ?? '') || !Number.isSafeInteger(value.sequence) || value.sequence < 0) {
    promptContextFailure(`${label} locator is invalid`);
  }
  return Object.freeze({ eventRef, eventHash: value.eventHash, sequence: value.sequence });
}

function canonicalPromptContextSelectedEventBinding(value, expectedEventRef, index) {
  const expectedKeys = ['completedHeadSha256', 'eventHash', 'eventRef', 'sequence'];
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expectedKeys)) {
    promptContextFailure('selected prompt-context event binding is invalid', { index });
  }
  const current = canonicalPromptContextCurrentEventBinding({
    eventRef: value.eventRef,
    eventHash: value.eventHash,
    sequence: value.sequence
  }, `selectedEventBindings[${index}]`);
  if (current.eventRef !== expectedEventRef || !/^[0-9a-f]{64}$/u.test(value.completedHeadSha256 ?? '')) {
    promptContextFailure('selected prompt-context event binding does not match the exact selected ref', { index, expectedEventRef });
  }
  return Object.freeze({ ...current, completedHeadSha256: value.completedHeadSha256 });
}

function canonicalPromptContextAuthorityQuery({
  phase,
  lineageRef,
  threadRef,
  priorConversationHeadSha256,
  currentRequestBinding,
  selectedConversationEventRefs,
  materializationReceipt = null
}) {
  if (!['MATERIALIZE', 'PRE_PROVIDER'].includes(phase)) promptContextFailure('prompt-context authority phase is invalid');
  if (priorConversationHeadSha256 !== null && !/^[0-9a-f]{64}$/u.test(priorConversationHeadSha256 ?? '')) {
    promptContextFailure('prior conversation head binding is invalid');
  }
  return Object.freeze({
    schemaVersion: 'vexlife.prompt-context-authority-query/v2',
    phase,
    lineageRef,
    threadRef,
    priorConversationHeadSha256,
    currentRequestEventRef: currentRequestBinding.eventRef,
    currentRequestEventHash: currentRequestBinding.eventHash,
    currentRequestSequence: currentRequestBinding.sequence,
    selectedConversationEventRefs: Object.freeze([...selectedConversationEventRefs]),
    materializationReceiptRefOrNull: materializationReceipt?.receiptRef ?? null,
    materializationReceiptFingerprintOrNull: materializationReceipt?.semanticFingerprint ?? null
  });
}

function canonicalAuthorityWitness(value, {
  phase,
  lease,
  projection,
  lineageRef,
  threadRef,
  priorConversationHeadSha256,
  currentRequestBinding,
  selectedConversationEventRefs,
  materializationReceipt = null
}) {
  const expectedKeys = [
    'authorityRef',
    'contextLeaseFingerprint',
    'contextLeaseRef',
    'continuityProjectionFingerprint',
    'continuityProjectionRef',
    'currentRequestEventBinding',
    'currentness',
    'lifecycle',
    'lineageRef',
    'materializationReceiptFingerprintOrNull',
    'materializationReceiptRefOrNull',
    'observedAt',
    'phase',
    'priorConversationHeadSha256',
    'runtimeSnapshotFingerprint',
    'schedulerGeneration',
    'schemaVersion',
    'selectedEventBindings',
    'threadRef'
  ].sort();
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expectedKeys) ||
      value.schemaVersion !== 'vexlife.prompt-context-owner-currentness-witness/v2' ||
      value.phase !== phase || value.currentness !== 'CURRENT' || value.lifecycle !== 'ACTIVE' ||
      typeof value.authorityRef !== 'string' || !value.authorityRef ||
      !Number.isInteger(value.schedulerGeneration) || value.schedulerGeneration < 0 ||
      typeof value.runtimeSnapshotFingerprint !== 'string') {
    promptContextFailure('prompt-context authority witness is invalid');
  }
  const observedMs = Date.parse(value.observedAt);
  if (!Number.isFinite(observedMs) || new Date(observedMs).toISOString() !== value.observedAt) {
    promptContextFailure('prompt-context authority witness observedAt is invalid');
  }
  const expectedReceiptRef = materializationReceipt?.receiptRef ?? null;
  const expectedReceiptFingerprint = materializationReceipt?.semanticFingerprint ?? null;
  if (
    value.lineageRef !== lineageRef || value.threadRef !== threadRef ||
    value.contextLeaseRef !== lease.leaseRef || value.contextLeaseFingerprint !== lease.semanticFingerprint ||
    value.schedulerGeneration !== lease.schedulerGeneration ||
    value.runtimeSnapshotFingerprint !== lease.runtimeSnapshotFingerprint ||
    value.continuityProjectionRef !== projection.adapterProjectionRef ||
    value.continuityProjectionFingerprint !== projection.semanticFingerprint ||
    value.priorConversationHeadSha256 !== priorConversationHeadSha256 ||
    value.materializationReceiptRefOrNull !== expectedReceiptRef ||
    value.materializationReceiptFingerprintOrNull !== expectedReceiptFingerprint
  ) {
    promptContextFailure('prompt-context authority witness does not bind the exact current owner evidence');
  }
  const current = canonicalPromptContextCurrentEventBinding(value.currentRequestEventBinding);
  if (JSON.stringify(current) !== JSON.stringify(currentRequestBinding)) {
    promptContextFailure('prompt-context authority witness does not bind the exact current request event');
  }
  if (!Array.isArray(value.selectedEventBindings) || value.selectedEventBindings.length !== selectedConversationEventRefs.length) {
    promptContextFailure('prompt-context authority witness selected event bindings are incomplete');
  }
  const selected = value.selectedEventBindings.map((binding, index) =>
    canonicalPromptContextSelectedEventBinding(binding, selectedConversationEventRefs[index], index));
  return Object.freeze({
    ...structuredClone(value),
    currentRequestEventBinding: current,
    selectedEventBindings: Object.freeze(selected)
  });
}

function validatePromptContextContinuityProjection(value, contextLease, companionLineageRef, threadRef) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.schemaVersion !== 'vexlife.continuity-stream-adapter-projection/v1' || value.currentness !== 'CURRENT') {
    promptContextFailure('continuity projection is not current');
  }
  const { adapterProjectionRef, semanticFingerprint, ...core } = structuredClone(value);
  if (!/^[0-9a-f]{64}$/u.test(semanticFingerprint ?? '') || contentHash(core) !== semanticFingerprint ||
      adapterProjectionRef !== `projection.vexlife.continuity-stream-adapter.${semanticFingerprint.slice(0, 32)}`) {
    promptContextFailure('continuity projection fingerprint is invalid');
  }
  if (value.current?.lineageRef !== companionLineageRef || value.current?.threadRef !== threadRef) {
    promptContextFailure('continuity projection lineage or thread does not match the lived turn');
  }
  if (value.owners?.context?.leaseRef !== contextLease.leaseRef ||
      value.owners?.context?.semanticFingerprint !== contextLease.semanticFingerprint ||
      value.owners?.context?.currentness !== 'CURRENT' || value.owners?.context?.lifecycle !== 'ACTIVE') {
    promptContextFailure('continuity projection does not bind the exact current Context Lease');
  }
  if (Object.values(value.effects ?? {}).some((observed) => observed !== false) ||
      value.projectionTruth?.readOnly !== true || value.projectionTruth?.rawTranscriptIncluded !== false ||
      value.projectionTruth?.hiddenReasoningIncluded !== false) {
    promptContextFailure('continuity projection carries an effect or raw-history assertion');
  }
  return value;
}

function promptMessageTokenEstimate(message) {
  return Math.max(1, Math.ceil(Buffer.byteLength(message.content, 'utf8') / 4)) + 4;
}

function assertPromptContextPriorHead(home, admitted, threadRef, paths, priorConversationHeadSha256) {
  if (priorConversationHeadSha256 === null) {
    if (fs.existsSync(paths.head)) promptContextFailure('prompt-context prior head unexpectedly exists');
    return null;
  }
  if (!/^[0-9a-f]{64}$/u.test(priorConversationHeadSha256 ?? '') || !fs.existsSync(paths.head)) {
    promptContextFailure('prompt-context prior head is missing or invalid');
  }
  const head = verifyHead(readJson(paths.head, 'CONVERSATION_HEAD_MISMATCH', 'prompt-context current prior head'));
  if (head.conversationHeadSha256 !== priorConversationHeadSha256 ||
      head.homeRef !== admitted.homeRef || head.deviceRef !== admitted.deviceRef ||
      head.companionLineageRef !== admitted.companionLineageRef || head.threadRef !== threadRef) {
    promptContextFailure('prompt-context prior head does not match the exact lived thread');
  }
  const immutable = loadImmutableConversationHead(home, admitted, threadRef, priorConversationHeadSha256).head;
  if (JSON.stringify(immutable) !== JSON.stringify(head)) {
    promptContextFailure('prompt-context mutable and immutable prior heads disagree');
  }
  return immutable;
}

function exactPromptContextEvent(eventsDirectory, binding, expectedIdentity, label) {
  const file = eventPath(eventsDirectory, binding.sequence, binding.eventHash);
  if (!fs.existsSync(file)) promptContextFailure(`${label} is missing`, { eventRef: binding.eventRef });
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) promptContextFailure(`${label} is not one exact regular event file`);
  const event = readJson(file, 'EVENT_CHAIN_CORRUPT', label);
  assertEventRecord(event, expectedIdentity, path.basename(file));
  if (event.eventRef !== binding.eventRef || event.eventHash !== binding.eventHash || event.sequence !== binding.sequence) {
    promptContextFailure(`${label} locator does not match persisted event identity`, { eventRef: binding.eventRef });
  }
  return event;
}

function verifiedPromptContextHeadAncestry(home, admitted, threadRef, priorHead, targetHeadSha256s) {
  const targets = new Set(targetHeadSha256s);
  const heads = new Map();
  let current = priorHead;
  let headMetadataReadCount = priorHead ? 1 : 0;
  while (current) {
    heads.set(current.conversationHeadSha256, current);
    if ([...targets].every((target) => heads.has(target))) break;
    if (current.priorConversationHeadSha256 === null) break;
    const prior = loadImmutableConversationHead(home, admitted, threadRef, current.priorConversationHeadSha256).head;
    headMetadataReadCount += 1;
    if (prior.sequence !== current.sequence - 2) {
      promptContextFailure('prompt-context immutable head ancestry is not contiguous');
    }
    current = prior;
  }
  const missing = [...targets].filter((target) => !heads.has(target));
  if (missing.length) promptContextFailure('selected prompt-context event is not in the exact prior lived head ancestry', { missing });
  return { heads, headMetadataReadCount };
}

function verifyPromptContextSelectedTurnContext(home, admitted, threadRef, head, event) {
  const contextFile = resolveHomeRelativePath(home, head.contextPath, 'CONTEXT_HASH_MISMATCH');
  const context = readJson(contextFile, 'CONTEXT_HASH_MISMATCH', 'selected prompt-context turn context');
  const { serializedContextSha256, ...core } = context ?? {};
  if (!/^[0-9a-f]{64}$/u.test(serializedContextSha256 ?? '') || contentHash(core) !== serializedContextSha256 ||
      serializedContextSha256 !== head.contextSha256 ||
      context.homeRef !== admitted.homeRef || context.deviceRef !== admitted.deviceRef ||
      context.companionLineageRef !== admitted.companionLineageRef || context.threadRef !== threadRef ||
      context.turnRef !== head.turnRef) {
    promptContextFailure('selected prompt-context turn context does not match its immutable head');
  }
  if (event.eventKind === 'REQUEST') {
    if (head.sequence !== event.sequence + 1 || context.requestEventHash !== event.eventHash) {
      promptContextFailure('selected request event is not the exact request of its completed lived turn');
    }
  } else if (event.eventKind === 'RESPONSE') {
    if (head.sequence !== event.sequence || context.responseEventHash !== event.eventHash) {
      promptContextFailure('selected response event is not the exact response of its completed lived turn');
    }
  } else {
    promptContextFailure('selected conversation event has an unsupported role');
  }
}

function verifyPromptContextSourceBindings({
  home,
  admitted,
  threadRef,
  priorConversationHeadSha256,
  currentRequestBinding,
  selectedEventBindings,
  currentRequestContent
}) {
  const paths = homePaths(home, admitted.companionLineageRef, threadRef);
  const priorHead = assertPromptContextPriorHead(home, admitted, threadRef, paths, priorConversationHeadSha256);
  const expectedIdentity = {
    homeRef: admitted.homeRef,
    deviceRef: admitted.deviceRef,
    companionLineageRef: admitted.companionLineageRef,
    threadRef
  };
  const current = exactPromptContextEvent(paths.events, currentRequestBinding, expectedIdentity, 'current prompt-context request event');
  if (current.eventKind !== 'REQUEST' || current.content !== currentRequestContent ||
      current.contentHash !== contentHash(currentRequestContent) ||
      current.priorEventHash !== (priorHead?.eventHash ?? null)) {
    promptContextFailure('current request event does not match the exact persisted lived request');
  }
  const ancestry = verifiedPromptContextHeadAncestry(
    home,
    admitted,
    threadRef,
    priorHead,
    selectedEventBindings.map((binding) => binding.completedHeadSha256)
  );
  const selected = selectedEventBindings.map((binding) => {
    const event = exactPromptContextEvent(paths.events, binding, expectedIdentity, 'selected prompt-context event');
    if (event.eventRef === current.eventRef || event.sequence >= current.sequence) {
      promptContextFailure('selected context event is not prior to the current request', { eventRef: event.eventRef });
    }
    verifyPromptContextSelectedTurnContext(home, admitted, threadRef, ancestry.heads.get(binding.completedHeadSha256), event);
    return event;
  });
  return {
    current,
    selected,
    headMetadataReadCount: ancestry.headMetadataReadCount,
    exactEventFileReadCount: selected.length + 1
  };
}

function formPromptContextReceipt(core) {
  const semanticFingerprint = contentHash(core);
  return Object.freeze({
    ...core,
    receiptRef: `receipt.vexlife.prompt-context-materialization.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

export async function materializeLivedCompanionPromptContext({
  home,
  homeRef,
  deviceRef,
  companionLineageRef,
  threadRef,
  currentRequestEventRef,
  currentRequestEventHash,
  currentRequestSequence,
  priorConversationHeadSha256 = null,
  currentRequestContent,
  contextLease,
  continuityProjection,
  selectedConversationEventRefs = [],
  authorityVerifier
}) {
  const identity = loadHome(home);
  const admitted = assertHomeIdentity(identity, { homeRef, deviceRef, companionLineageRef });
  const safeThread = ensureSafeRef(threadRef, 'threadRef', 'CONTEXT_HASH_MISMATCH');
  if (typeof authorityVerifier !== 'function') promptContextFailure('prompt context requires one independently owned currentness verifier');
  let canonicalLease;
  try {
    canonicalLease = createContextLease(contextLease).lease;
  } catch (error) {
    promptContextFailure('Context Lease is not canonical for prompt materialization', { cause: error.message });
  }
  validatePromptContextContinuityProjection(continuityProjection, canonicalLease, admitted.companionLineageRef, safeThread);
  if (!Array.isArray(selectedConversationEventRefs) ||
      selectedConversationEventRefs.some((ref) => typeof ref !== 'string' || !ref) ||
      new Set(selectedConversationEventRefs).size !== selectedConversationEventRefs.length) {
    promptContextFailure('selected conversation event refs must be unique stable refs');
  }
  const selectedRefs = selectedConversationEventRefs.map((ref, index) =>
    ensureSafeRef(ref, `selectedConversationEventRefs[${index}]`, 'CONTEXT_HASH_MISMATCH'));
  const selectedAuthority = new Set(canonicalLease.selectedSourceRefs ?? []);
  for (const ref of selectedRefs) {
    if (!selectedAuthority.has(ref)) promptContextFailure('selected event is not authorized by the exact Context Lease', { eventRef: ref });
  }
  const currentRequestBinding = canonicalPromptContextCurrentEventBinding({
    eventRef: currentRequestEventRef,
    eventHash: currentRequestEventHash,
    sequence: currentRequestSequence
  });
  const query = canonicalPromptContextAuthorityQuery({
    phase: 'MATERIALIZE',
    lineageRef: admitted.companionLineageRef,
    threadRef: safeThread,
    priorConversationHeadSha256,
    currentRequestBinding,
    selectedConversationEventRefs: selectedRefs
  });
  const witness = canonicalAuthorityWitness(await authorityVerifier(query), {
    phase: 'MATERIALIZE',
    lease: canonicalLease,
    projection: continuityProjection,
    lineageRef: admitted.companionLineageRef,
    threadRef: safeThread,
    priorConversationHeadSha256,
    currentRequestBinding,
    selectedConversationEventRefs: selectedRefs
  });
  try {
    assertCurrentLease(canonicalLease, {
      label: 'prompt context',
      observedAt: witness.observedAt,
      schedulerGeneration: witness.schedulerGeneration,
      runtimeSnapshotFingerprint: witness.runtimeSnapshotFingerprint
    });
  } catch (error) {
    promptContextFailure('Context Lease is not exact-current under independent owner evidence', { cause: error.message });
  }
  const source = verifyPromptContextSourceBindings({
    home: identity.homeRoot,
    admitted,
    threadRef: safeThread,
    priorConversationHeadSha256,
    currentRequestBinding: witness.currentRequestEventBinding,
    selectedEventBindings: witness.selectedEventBindings,
    currentRequestContent
  });
  for (let index = 1; index < source.selected.length; index += 1) {
    if (source.selected[index - 1].sequence >= source.selected[index].sequence) {
      promptContextFailure('selected conversation event order does not match canonical event order');
    }
  }
  const entries = source.selected.map((event, index) => ({
    ordinal: index,
    role: event.eventKind === 'REQUEST' ? 'user' : event.eventKind === 'RESPONSE' ? 'assistant' : null,
    sourceEventRef: event.eventRef,
    sourceEventHash: event.eventHash,
    sourceContentHash: event.contentHash,
    sequence: event.sequence,
    completedHeadSha256: witness.selectedEventBindings[index].completedHeadSha256,
    estimatedTokens: promptMessageTokenEstimate({ content: event.content })
  }));
  if (entries.some((entry) => entry.role === null)) promptContextFailure('selected conversation event has an unsupported role');
  entries.push({
    ordinal: entries.length,
    role: 'user',
    sourceEventRef: source.current.eventRef,
    sourceEventHash: source.current.eventHash,
    sourceContentHash: source.current.contentHash,
    sequence: source.current.sequence,
    completedHeadSha256: null,
    estimatedTokens: promptMessageTokenEstimate({ content: source.current.content })
  });
  const messages = [
    ...source.selected.map((event) => ({ role: event.eventKind === 'REQUEST' ? 'user' : 'assistant', content: event.content })),
    { role: 'user', content: source.current.content }
  ];
  const materializedInputTokenEstimate = entries.reduce((sum, entry) => sum + entry.estimatedTokens, 0);
  const availableInputTokens = canonicalLease.hardTokenLimit - canonicalLease.reservedOutputTokens;
  if (availableInputTokens < 0 || materializedInputTokenEstimate > canonicalLease.inputTokenEstimate ||
      materializedInputTokenEstimate > availableInputTokens) {
    promptContextFailure('materialized prompt exceeds the exact Context Lease input budget', {
      materializedInputTokenEstimate,
      availableInputTokens
    });
  }
  const receipt = formPromptContextReceipt({
    schemaVersion: 'vexlife.prompt-context-materialization-receipt/v2',
    authorityRef: witness.authorityRef,
    authorityObservedAt: witness.observedAt,
    providerAuthorityRef: null,
    providerAuthorityObservedAt: null,
    providerBoundaryCurrentnessVerified: false,
    providerBoundarySourceBindingsVerified: false,
    providerExactEventFileReadCount: 0,
    providerHeadMetadataReadCount: 0,
    contextLeaseRef: canonicalLease.leaseRef,
    contextLeaseFingerprint: canonicalLease.semanticFingerprint,
    continuityProjectionRef: continuityProjection.adapterProjectionRef,
    continuityProjectionFingerprint: continuityProjection.semanticFingerprint,
    lineageRef: admitted.companionLineageRef,
    threadRef: safeThread,
    priorConversationHeadSha256,
    turnRef: source.current.turnRef,
    currentRequestEventRef: source.current.eventRef,
    currentRequestContentHash: source.current.contentHash,
    selectedConversationEventRefs: [...selectedRefs],
    includedSourceRefs: [...selectedRefs, source.current.eventRef],
    orderedMaterializationEntries: entries,
    exactMessagesSha256: contentHash(messages),
    messageCount: messages.length,
    materializedInputTokenEstimate,
    contextLeaseInputTokenEstimate: canonicalLease.inputTokenEstimate,
    reservedOutputTokens: canonicalLease.reservedOutputTokens,
    hardTokenLimit: canonicalLease.hardTokenLimit,
    exactEventFileReadCount: source.exactEventFileReadCount,
    headMetadataReadCount: source.headMetadataReadCount,
    wholeHistoryEventEnumerationPerformed: false,
    currentRequestIncludedExactlyOnce: true,
    priorHumanMessagesUnmodified: true,
    priorAssistantMessagesUnmodified: true,
    tokenBudgetSatisfied: true,
    sourceCurrentnessVerified: true,
    crossLineageLeakage: false,
    crossThreadLeakage: false,
    memoryEffectPerformed: false,
    trainingSelectionPerformed: false,
    modelWeightEffectPerformed: false,
    hiddenReasoningIncluded: false
  });
  const materialization = Object.freeze({
    messages: Object.freeze(messages.map((message) => Object.freeze({ ...message }))),
    receipt
  });
  TRUSTED_PROMPT_CONTEXT_MATERIALIZATIONS.set(materialization, Object.freeze({
    authorityVerifier,
    canonicalLease,
    continuityProjection,
    home: identity.homeRoot,
    admitted: Object.freeze({ ...admitted }),
    threadRef: safeThread,
    priorConversationHeadSha256,
    currentRequestBinding: witness.currentRequestEventBinding,
    selectedConversationEventRefs: Object.freeze([...selectedRefs]),
    selectedEventBindings: Object.freeze(witness.selectedEventBindings.map((binding) => Object.freeze({ ...binding }))),
    materializationAuthorityRef: witness.authorityRef,
    materializationAuthorityObservedAt: witness.observedAt
  }));
  return materialization;
}

async function canonicalTrustedPromptMaterialization(materialization, requestContent) {
  const state = materialization && typeof materialization === 'object'
    ? TRUSTED_PROMPT_CONTEXT_MATERIALIZATIONS.get(materialization)
    : null;
  if (!state) promptContextFailure('prompt-context inference requires the exact in-process materialization capability');
  const messages = materialization.messages;
  const receipt = materialization.receipt;
  const canonical = messages.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
        !['system', 'user', 'assistant'].includes(entry.role) || typeof entry.content !== 'string' || !entry.content ||
        Object.keys(entry).some((key) => !['role', 'content'].includes(key))) {
      promptContextFailure('trusted prompt message is invalid', { index });
    }
    return { role: entry.role, content: entry.content };
  });
  const last = canonical.at(-1);
  if (last?.role !== 'user' || last.content !== requestContent) {
    promptContextFailure('trusted prompt messages must end with the exact current human request');
  }
  const { receiptRef, semanticFingerprint, ...receiptCore } = receipt ?? {};
  if (!/^[0-9a-f]{64}$/u.test(semanticFingerprint ?? '') || contentHash(receiptCore) !== semanticFingerprint ||
      receiptRef !== `receipt.vexlife.prompt-context-materialization.${semanticFingerprint.slice(0, 32)}` ||
      receipt.schemaVersion !== 'vexlife.prompt-context-materialization-receipt/v2' ||
      receipt.exactMessagesSha256 !== contentHash(canonical) || receipt.messageCount !== canonical.length ||
      receipt.currentRequestContentHash !== contentHash(requestContent) || receipt.sourceCurrentnessVerified !== true ||
      receipt.wholeHistoryEventEnumerationPerformed !== false || receipt.providerBoundaryCurrentnessVerified !== false ||
      receipt.providerBoundarySourceBindingsVerified !== false || receipt.providerExactEventFileReadCount !== 0 ||
      receipt.providerHeadMetadataReadCount !== 0 || receipt.memoryEffectPerformed !== false ||
      receipt.trainingSelectionPerformed !== false || receipt.modelWeightEffectPerformed !== false) {
    promptContextFailure('trusted prompt materialization receipt integrity is invalid');
  }
  const query = canonicalPromptContextAuthorityQuery({
    phase: 'PRE_PROVIDER',
    lineageRef: state.admitted.companionLineageRef,
    threadRef: state.threadRef,
    priorConversationHeadSha256: state.priorConversationHeadSha256,
    currentRequestBinding: state.currentRequestBinding,
    selectedConversationEventRefs: state.selectedConversationEventRefs,
    materializationReceipt: receipt
  });
  const witness = canonicalAuthorityWitness(await state.authorityVerifier(query), {
    phase: 'PRE_PROVIDER',
    lease: state.canonicalLease,
    projection: state.continuityProjection,
    lineageRef: state.admitted.companionLineageRef,
    threadRef: state.threadRef,
    priorConversationHeadSha256: state.priorConversationHeadSha256,
    currentRequestBinding: state.currentRequestBinding,
    selectedConversationEventRefs: state.selectedConversationEventRefs,
    materializationReceipt: receipt
  });
  if (witness.authorityRef !== state.materializationAuthorityRef ||
      Date.parse(witness.observedAt) < Date.parse(state.materializationAuthorityObservedAt) ||
      JSON.stringify(witness.selectedEventBindings) !== JSON.stringify(state.selectedEventBindings)) {
    promptContextFailure('provider-boundary prompt-context authority no longer matches the exact materialization');
  }
  try {
    assertCurrentLease(state.canonicalLease, {
      label: 'prompt context provider boundary',
      observedAt: witness.observedAt,
      schedulerGeneration: witness.schedulerGeneration,
      runtimeSnapshotFingerprint: witness.runtimeSnapshotFingerprint
    });
  } catch (error) {
    promptContextFailure('Context Lease is not exact-current at the provider boundary', { cause: error.message });
  }
  const source = verifyPromptContextSourceBindings({
    home: state.home,
    admitted: state.admitted,
    threadRef: state.threadRef,
    priorConversationHeadSha256: state.priorConversationHeadSha256,
    currentRequestBinding: witness.currentRequestEventBinding,
    selectedEventBindings: witness.selectedEventBindings,
    currentRequestContent: requestContent
  });
  const reboundMessages = [
    ...source.selected.map((event) => ({ role: event.eventKind === 'REQUEST' ? 'user' : 'assistant', content: event.content })),
    { role: 'user', content: source.current.content }
  ];
  if (contentHash(reboundMessages) !== receipt.exactMessagesSha256 || JSON.stringify(reboundMessages) !== JSON.stringify(canonical)) {
    promptContextFailure('provider-boundary event bytes no longer match the exact materialized messages');
  }
  const finalCore = {
    ...receiptCore,
    providerAuthorityRef: witness.authorityRef,
    providerAuthorityObservedAt: witness.observedAt,
    providerBoundaryCurrentnessVerified: true,
    providerBoundarySourceBindingsVerified: true,
    providerExactEventFileReadCount: source.exactEventFileReadCount,
    providerHeadMetadataReadCount: source.headMetadataReadCount
  };
  return Object.freeze({ messages: canonical, receipt: formPromptContextReceipt(finalCore) });
}

export async function requestLivedCompanionInference({
  endpointProfile,
  requestContent,
  promptContextMaterialization = null,
  messages = undefined,
  promptContextMaterializationReceipt = undefined,
  inMemoryAuthorization = null,
  timeoutMs = 5000
}) {
  if (messages !== undefined || promptContextMaterializationReceipt !== undefined) {
    promptContextFailure('plain explicit messages or caller-authored materialization receipts are not accepted');
  }
  if (
    !endpointProfile?.admitted ||
    !isNonEmptyString(endpointProfile.profileRef) ||
    !isNonEmptyString(endpointProfile.endpoint) ||
    (
      endpointProfile.model !== undefined &&
      endpointProfile.model !== null &&
      !isNonEmptyString(endpointProfile.model)
    )
  ) {
    fail('ENDPOINT_PROFILE_NOT_ADMITTED', 'an admitted endpoint profile with string identity and endpoint metadata is required');
  }
  let parsed;
  try {
    parsed = new URL(endpointProfile.endpoint);
  } catch {
    fail('ENDPOINT_PROFILE_NOT_ADMITTED', 'endpoint profile URL is invalid');
  }
  if (!isLoopbackHost(parsed.hostname)) {
    fail('ENDPOINT_NOT_LOOPBACK_OR_EXPLICITLY_ALLOWED', 'G01 accepts loopback endpoints only; non-loopback use requires a separately admitted adapter');
  }
  const trusted = promptContextMaterialization === null
    ? null
    : await canonicalTrustedPromptMaterialization(promptContextMaterialization, requestContent);
  const outboundMessages = trusted?.messages ?? [{ role: 'user', content: requestContent }];
  const requestPayload = {
    model: endpointProfile.model || 'bounded-loopback-proof',
    messages: outboundMessages
  };
  const requestBody = JSON.stringify(requestPayload);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { 'content-type': 'application/json' };
    if (inMemoryAuthorization) headers.authorization = inMemoryAuthorization;
    const response = await fetch(endpointRequestUrl(endpointProfile.endpoint), {
      method: 'POST',
      headers,
      body: requestBody,
      signal: controller.signal,
      redirect: 'manual'
    });
    if (response.status >= 300 && response.status < 400) {
      fail('ENDPOINT_NOT_LOOPBACK_OR_EXPLICITLY_ALLOWED', 'G01 rejects endpoint redirects because the redirected destination is not part of the admitted loopback effect', { status: response.status });
    }
    if (!response.ok) fail('ENDPOINT_HTTP_ERROR', `endpoint returned HTTP ${response.status}`, { status: response.status });
    let body;
    try {
      body = await response.json();
    } catch {
      fail('ENDPOINT_RESPONSE_INVALID', 'endpoint response was not valid JSON');
    }
    if (body?.model !== undefined && body?.model !== null && !isNonEmptyString(body.model)) {
      fail('ENDPOINT_RESPONSE_INVALID', 'endpoint response model provenance must be one non-empty string');
    }
    let normalized;
    try {
      normalized = normalizeModelRuntimeResponse({
        responseBody: body,
        endpointProfile,
        observedAt: new Date().toISOString()
      });
    } catch (error) {
      fail('ENDPOINT_RESPONSE_INVALID', 'endpoint response could not form a closed runtime observation', { cause: error.message });
    }
    let invocationEvidence;
    try {
      invocationEvidence = formModelRuntimeInvocationEvidence({
        endpointProfileRef: endpointProfile.profileRef,
        sanitizedEndpointOrigin: sanitizeEndpointOrigin(endpointProfile.endpoint),
        requestBodySha256: crypto.createHash('sha256').update(Buffer.from(requestBody, 'utf8')).digest('hex'),
        runtimeObservation: normalized.runtimeObservation,
        httpStatus: response.status,
        actualHttpCall: true,
        formedAt: new Date().toISOString()
      });
    } catch (error) {
      fail('ENDPOINT_RESPONSE_INVALID', 'endpoint response could not form closed invocation evidence', { cause: error.message });
    }
    const responseValue = {
      content: normalized.content,
      model: normalized.model,
      ...(trusted ? { promptContextMaterializationReceipt: trusted.receipt } : {})
    };
    assertInMemoryAuthorizationNotPersisted(responseValue, inMemoryAuthorization, 'endpoint response');
    TRUSTED_MODEL_RUNTIME_RESPONSES.set(responseValue, Object.freeze({
      runtimeObservation: normalized.runtimeObservation,
      invocationEvidence
    }));
    return responseValue;
  } catch (error) {
    if (error instanceof LivedCompanionError) throw error;
    if (error?.name === 'AbortError') fail('ENDPOINT_TIMEOUT', 'endpoint request timed out');
    fail('ENDPOINT_UNREACHABLE', 'endpoint could not be reached', { cause: error.message });
  } finally {
    clearTimeout(timeout);
  }
}


export async function performLivedCompanionTurn({
  home,
  homeRef,
  deviceRef,
  companionLineageRef,
  instanceRef,
  threadRef,
  channelRef,
  turnRef,
  requestMessageRef,
  responseMessageRef,
  speakerRef,
  recipientRefs,
  content,
  requestSemanticRelay = null,
  responseSemanticRelay = null,
  endpointProfile,
  responseResolver = null,
  contextSourceRefs = [],
  inMemoryAuthorization = null,
  timeoutMs = 5000,
  formedAt = new Date().toISOString(),
  faults = {}
}) {
  let requestDurablyRecorded = false;
  let responseDurablyRecorded = false;
  let lastValidHead = null;
  let writerLease = null;
  let canonicalHome = null;
  try {
    const identity = loadHome(home);
    canonicalHome = identity.homeRoot;
    const admitted = assertHomeIdentity(identity, { homeRef, deviceRef, companionLineageRef });
    ensureSafeRef(instanceRef, 'instanceRef');
    ensureSafeRef(threadRef, 'threadRef');
    ensureSafeRef(turnRef, 'turnRef');
    writerLease = acquireThreadWriterLease(identity.homeRoot, admitted.companionLineageRef, threadRef, instanceRef);
    for (const [name, value] of Object.entries({ channelRef, requestMessageRef, responseMessageRef, speakerRef, content })) ensureString(value, name);
    if (!Array.isArray(recipientRefs) || recipientRefs.length === 0 || recipientRefs.some((value) => typeof value !== 'string' || value.length === 0)) {
      fail('HOME_IDENTITY_MISMATCH', 'recipientRefs must contain at least one non-empty ref');
    }
    if (!Array.isArray(contextSourceRefs) || contextSourceRefs.some((value) => typeof value !== 'string' || value.length === 0)) {
      fail('HOME_IDENTITY_MISMATCH', 'contextSourceRefs must be an array of non-empty refs');
    }
    if (responseResolver !== null && typeof responseResolver !== 'function') {
      fail('ENDPOINT_PROFILE_NOT_ADMITTED', 'responseResolver must be one server-owned function when provided');
    }
    assertInMemoryAuthorizationNotPersisted({
      homeRef,
      deviceRef,
      companionLineageRef,
      instanceRef,
      threadRef,
      channelRef,
      turnRef,
      requestMessageRef,
      responseMessageRef,
      speakerRef,
      recipientRefs,
      content,
      requestSemanticRelay,
      responseSemanticRelay,
      contextSourceRefs,
      endpointProfile
    }, inMemoryAuthorization, 'turn persistable input');
    const requestRelay = validatedEventSemanticRelay(requestSemanticRelay, {
      messageRef: requestMessageRef,
      recipientRefs,
      phase: 'request'
    });
    const responseRelay = validatedEventSemanticRelay(responseSemanticRelay, {
      messageRef: responseMessageRef,
      recipientRefs: [speakerRef],
      phase: 'response'
    });
    const paths = homePaths(identity.homeRoot, admitted.companionLineageRef, threadRef);
    const priorState = validateCompletedConversationState({
      home: identity.homeRoot,
      admitted,
      threadRef,
      paths
    });
    lastValidHead = priorState.head;
    fs.mkdirSync(paths.events, { recursive: true });
    fs.mkdirSync(paths.context, { recursive: true });
    assertNoDuplicateTurn(paths.events, turnRef, lastValidHead, {
      homeRef: admitted.homeRef,
      deviceRef: admitted.deviceRef,
      companionLineageRef: admitted.companionLineageRef,
      threadRef
    });
    const startingSequence = lastValidHead ? Number(lastValidHead.sequence) + 1 : 0;
    const requestCore = {
      schemaVersion: requestRelay ? 'vexlife.lived-companion-event/v2' : 'vexlife.lived-companion-event/v1',
      eventRef: `event.vexlife.request.${crypto.randomUUID()}`,
      eventKind: 'REQUEST',
      homeRef: admitted.homeRef,
      deviceRef: admitted.deviceRef,
      companionLineageRef: admitted.companionLineageRef,
      instanceRef,
      threadRef,
      channelRef,
      turnRef,
      messageRef: requestMessageRef,
      speakerRef,
      recipientRefs: [...recipientRefs],
      sequence: startingSequence,
      priorEventHash: lastValidHead?.eventHash ?? null,
      content,
      contentHash: contentHash(content),
      ...(requestRelay ? { semanticRelay: requestRelay } : {}),
      privacyClass: 'DEVICE_PRIVATE',
      formedAt: stableNow(formedAt)
    };
    assertInMemoryAuthorizationNotPersisted(requestCore, inMemoryAuthorization, 'request event');
    const requestEvent = formEvent(requestCore);
    atomicWriteJson(eventPath(paths.events, requestEvent.sequence, requestEvent.eventHash), requestEvent);
    requestDurablyRecorded = true;

    let response;
    let runtimeProjection = null;
    let additionalContextSourceRefs = [];
    let promptContextMaterializationReceipt = null;
    let modelRuntimeEvidence = null;
    let actualHttpCall = true;
    const turnRuntimeEvidenceByToken = new Map();
    const turnRuntimeTokenByResponse = new WeakMap();
    const turnScopedInference = async (input) => {
      const value = await requestLivedCompanionInference(input);
      const evidence = TRUSTED_MODEL_RUNTIME_RESPONSES.get(value);
      if (!evidence) fail('ENDPOINT_RESPONSE_INVALID', 'Lived inference did not retain trusted runtime evidence');
      const token = Object.freeze({});
      turnRuntimeEvidenceByToken.set(token, evidence);
      turnRuntimeTokenByResponse.set(value, token);
      return value;
    };
    const captureInferenceEvidence = (value) => {
      const token = value && typeof value === 'object' ? turnRuntimeTokenByResponse.get(value) ?? null : null;
      if (token) turnRuntimeTokenByResponse.delete(value);
      return token;
    };
    if (responseResolver) {
      const resolved = await responseResolver({
        endpointProfile,
        requestContent: content,
        inMemoryAuthorization,
        timeoutMs,
        inference: turnScopedInference,
        captureInferenceEvidence,
        context: {
          homeRef: admitted.homeRef,
          deviceRef: admitted.deviceRef,
          companionLineageRef: admitted.companionLineageRef,
          instanceRef,
          threadRef,
          channelRef,
          turnRef,
          taskRef: turnRef,
          currentRequestEventRef: requestEvent.eventRef,
          currentRequestEventHash: requestEvent.eventHash,
          currentRequestSequence: requestEvent.sequence,
          priorConversationHeadSha256: lastValidHead?.conversationHeadSha256 ?? null,
          sourceRefs: [...contextSourceRefs]
        }
      });
      response = resolved?.response ?? resolved;
      runtimeProjection = resolved?.runtimeProjection ?? null;
      promptContextMaterializationReceipt = resolved?.promptContextMaterializationReceipt ?? null;
      additionalContextSourceRefs = [...new Set(resolved?.contextSourceRefs ?? [])].sort();
      actualHttpCall = resolved?.actualHttpCall === true;
      const evidenceToken = resolved?.modelRuntimeEvidenceToken ?? null;
      if (evidenceToken !== null) {
        modelRuntimeEvidence = turnRuntimeEvidenceByToken.get(evidenceToken) ?? null;
        if (!modelRuntimeEvidence) fail('ENDPOINT_RESPONSE_INVALID', 'responseResolver did not return one current-turn runtime evidence token');
        turnRuntimeEvidenceByToken.delete(evidenceToken);
      }
      if (additionalContextSourceRefs.some((value) => typeof value !== 'string' || value.length === 0)) {
        fail('HOME_IDENTITY_MISMATCH', 'responseResolver contextSourceRefs must contain only non-empty refs');
      }
    } else {
      response = await turnScopedInference({
        endpointProfile,
        requestContent: content,
        inMemoryAuthorization,
        timeoutMs
      });
      const evidenceToken = captureInferenceEvidence(response);
      modelRuntimeEvidence = evidenceToken ? turnRuntimeEvidenceByToken.get(evidenceToken) ?? null : null;
      if (!modelRuntimeEvidence) fail('ENDPOINT_RESPONSE_INVALID', 'direct Lived inference did not bind current-turn runtime evidence');
      turnRuntimeEvidenceByToken.delete(evidenceToken);
    }
    if (!response || typeof response.content !== 'string' || !response.content ||
        typeof response.model !== 'string' || !response.model) {
      fail('ENDPOINT_RESPONSE_INVALID', 'resolved Companion response must contain content and model provenance');
    }
    if (modelRuntimeEvidence) {
      const visibleContentSha256 = crypto.createHash('sha256').update(Buffer.from(response.content, 'utf8')).digest('hex');
      if (modelRuntimeEvidence.runtimeObservation.output.contentSha256 !== visibleContentSha256 ||
          modelRuntimeEvidence.runtimeObservation.modelProvenance.compatibilityModel !== response.model) {
        fail('ENDPOINT_RESPONSE_INVALID', 'current-turn runtime evidence does not bind the visible Companion response');
      }
    }
    assertInMemoryAuthorizationNotPersisted({ response, runtimeProjection }, inMemoryAuthorization, 'endpoint response');
    const responseCore = {
      schemaVersion: responseRelay ? 'vexlife.lived-companion-event/v2' : 'vexlife.lived-companion-event/v1',
      eventRef: `event.vexlife.response.${crypto.randomUUID()}`,
      eventKind: 'RESPONSE',
      homeRef: admitted.homeRef,
      deviceRef: admitted.deviceRef,
      companionLineageRef: admitted.companionLineageRef,
      instanceRef,
      threadRef,
      channelRef,
      turnRef,
      messageRef: responseMessageRef,
      speakerRef: recipientRefs[0],
      recipientRefs: [speakerRef],
      sequence: startingSequence + 1,
      priorEventHash: requestEvent.eventHash,
      content: response.content,
      contentHash: contentHash(response.content),
      ...(responseRelay ? { semanticRelay: responseRelay } : {}),
      endpointProfileRef: endpointProfile.profileRef,
      sanitizedEndpointOrigin: sanitizeEndpointOrigin(endpointProfile.endpoint),
      modelNameOrBoundedTestProfileRef: response.model,
      privacyClass: 'DEVICE_PRIVATE',
      formedAt: new Date().toISOString()
    };
    assertInMemoryAuthorizationNotPersisted(responseCore, inMemoryAuthorization, 'response event');
    const responseEvent = formEvent(responseCore);
    atomicWriteJson(eventPath(paths.events, responseEvent.sequence, responseEvent.eventHash), responseEvent);
    responseDurablyRecorded = true;

    let modelTurnWitness = null;
    if (modelRuntimeEvidence) {
      modelTurnWitness = formModelTurnWitness({
        turnRef,
        requestMessageRef,
        responseMessageRef,
        runtimeObservation: modelRuntimeEvidence.runtimeObservation,
        invocationEvidence: modelRuntimeEvidence.invocationEvidence,
        promptContextMaterializationReceipt,
        currentnessRefs: [],
        availableCapabilityRefs: [],
        heldCapabilityRefs: [],
        unavailableCapabilityRefs: [],
        unknownCapabilityRefs: [],
        formedAt: new Date().toISOString()
      });
      if (!verifyModelTurnWitness(modelTurnWitness)) {
        fail('ENDPOINT_RESPONSE_INVALID', 'formed ModelTurnWitness failed its accepted closed verifier');
      }
      additionalContextSourceRefs = [...new Set([...additionalContextSourceRefs, modelTurnWitness.witnessRef])].sort();
      actualHttpCall = true;
    }

    const contextCore = {
      schemaVersion: 'vexlife.lived-companion-context/v1',
      homeRef: admitted.homeRef,
      deviceRef: admitted.deviceRef,
      companionLineageRef: admitted.companionLineageRef,
      instanceRef,
      threadRef,
      turnRef,
      contextSourceRefs: [...new Set([...contextSourceRefs, ...additionalContextSourceRefs].filter((value) => value !== requestEvent.eventRef && value !== responseEvent.eventRef)), requestEvent.eventRef, responseEvent.eventRef],
      requestEventHash: requestEvent.eventHash,
      responseEventHash: responseEvent.eventHash,
      ...(promptContextMaterializationReceipt ? { promptContextMaterializationReceipt } : {}),
      privacyClass: 'DEVICE_PRIVATE',
      formedAt: new Date().toISOString()
    };
    assertInMemoryAuthorizationNotPersisted(contextCore, inMemoryAuthorization, 'context record');
    const contextRecord = formContext(contextCore);
    const contextPath = resolveHomePath(identity.homeRoot, 'context', admitted.companionLineageRef, threadRef, `${turnRef}.json`);
    atomicWriteJson(contextPath, contextRecord);

    const headCore = {
      schemaVersion: 'vexlife.lived-companion-head/v1',
      homeRef: admitted.homeRef,
      deviceRef: admitted.deviceRef,
      companionLineageRef: admitted.companionLineageRef,
      instanceRef,
      threadRef,
      turnRef,
      requestMessageRef,
      responseMessageRef,
      eventHash: responseEvent.eventHash,
      contextSha256: contextRecord.serializedContextSha256,
      contextPath: path.relative(identity.homeRoot, contextPath).replaceAll('\\', '/'),
      sequence: responseEvent.sequence,
      priorConversationHeadSha256: lastValidHead?.conversationHeadSha256 ?? null,
      formedAt: new Date().toISOString()
    };
    assertInMemoryAuthorizationNotPersisted(headCore, inMemoryAuthorization, 'conversation head');
    const head = formHead(headCore);
    writeImmutableConversationHead(identity.homeRoot, admitted, threadRef, head);
    atomicWriteJson(paths.head, head, { failBeforeRename: faults.persistenceFailureBeforeHead === true });
    lastValidHead = head;
    const writerLeaseReleased = releaseThreadWriterLease(writerLease);
    writerLease = null;
    if (!writerLeaseReleased) {
      fail('PERSISTENCE_WRITE_FAILED', 'thread writer lease could not be released after completion');
    }
    return {
      state: 'TURN_COMPLETED',
      writerLeaseReleased,
      actualHttpCall,
      loopbackOnly: isLoopbackHost(new URL(endpointProfile.endpoint).hostname),
      runtimeProjection: runtimeProjection ? structuredClone(runtimeProjection) : null,
      promptContextMaterializationReceipt: promptContextMaterializationReceipt ? structuredClone(promptContextMaterializationReceipt) : null,
      modelTurnWitness: modelTurnWitness ? structuredClone(modelTurnWitness) : null,
      requestDurablyRecorded,
      responseDurablyRecorded,
      requestEvent,
      responseEvent,
      contextRecord,
      head,
      headPath: paths.head
    };
  } catch (error) {
    const typed = error instanceof LivedCompanionError
      ? error
      : new LivedCompanionError('PERSISTENCE_WRITE_FAILED', error.message || String(error));
    const failureHead = lastValidHead ?? typed.details?.lastValidHead ?? null;
    const failureEvidence = writeFailureReceipt({
      home: canonicalHome ?? home,
      threadRef,
      turnRef,
      error: typed,
      requestDurablyRecorded,
      responseDurablyRecorded,
      lastValidHead: failureHead
    });
    const writerLeaseReleased = writerLease ? releaseThreadWriterLease(writerLease) : true;
    writerLease = null;
    typed.details = {
      ...(typed.details || {}),
      failureReceiptPath: failureEvidence.failureReceiptPath,
      failureEvidenceIntegrityState: failureEvidence.failureEvidenceIntegrityState,
      requestDurablyRecorded,
      responseDurablyRecorded,
      lastValidHeadSha256: failureHead?.conversationHeadSha256 ?? null,
      writerLeaseReleased
    };
    throw typed;
  }
}

function recomputeEventHash(event) {
  const { eventHash, ...core } = event;
  return contentHash(core);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function assertEventRecord(event, expected = null, fileName = null) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    fail('EVENT_CHAIN_CORRUPT', 'conversation event is invalid');
  }
  let safeInstanceRef;
  let safeTurnRef;
  try {
    safeInstanceRef = ensureSafeRef(event.instanceRef, 'event.instanceRef', 'EVENT_CHAIN_CORRUPT');
    safeTurnRef = ensureSafeRef(event.turnRef, 'event.turnRef', 'EVENT_CHAIN_CORRUPT');
  } catch (error) {
    if (error instanceof LivedCompanionError) throw error;
    fail('EVENT_CHAIN_CORRUPT', 'conversation event identity is invalid');
  }
  const validPriorHash =
    event.priorEventHash === null ||
    /^[0-9a-f]{64}$/u.test(event.priorEventHash ?? '');
  const validRecipients =
    Array.isArray(event.recipientRefs) &&
    event.recipientRefs.length > 0 &&
    event.recipientRefs.every(isNonEmptyString);
  const validContentHash =
    /^[0-9a-f]{64}$/u.test(event.contentHash ?? '') &&
    typeof event.content === 'string' &&
    contentHash(event.content) === event.contentHash;
  const expectedFileName =
    /^[0-9a-f]{64}$/u.test(event.eventHash ?? '') && Number.isSafeInteger(event.sequence)
      ? `${String(event.sequence).padStart(8, '0')}-${event.eventHash}.json`
      : null;
  const isHistoricalV1 = event.schemaVersion === 'vexlife.lived-companion-event/v1';
  const isRelayV2 = event.schemaVersion === 'vexlife.lived-companion-event/v2';
  const relayValidation = isRelayV2
    ? validateSemanticRelay(event.semanticRelay, { sourceMessageRef: event.messageRef, recipientRefs: event.recipientRefs })
    : { ok: !Object.hasOwn(event, 'semanticRelay'), errors: [] };

  if (
    (!isHistoricalV1 && !isRelayV2) ||
    !relayValidation.ok ||
    safeInstanceRef !== event.instanceRef ||
    safeTurnRef !== event.turnRef ||
    !isNonEmptyString(event.eventRef) ||
    !isNonEmptyString(event.channelRef) ||
    !isNonEmptyString(event.messageRef) ||
    !isNonEmptyString(event.speakerRef) ||
    !validRecipients ||
    !Number.isSafeInteger(event.sequence) ||
    event.sequence < 0 ||
    !['REQUEST', 'RESPONSE'].includes(event.eventKind) ||
    !validPriorHash ||
    !/^[0-9a-f]{64}$/u.test(event.eventHash ?? '') ||
    recomputeEventHash(event) !== event.eventHash ||
    !validContentHash ||
    event.privacyClass !== 'DEVICE_PRIVATE' ||
    (fileName !== null && fileName !== expectedFileName)
  ) {
    fail('EVENT_CHAIN_CORRUPT', 'conversation event record integrity is invalid', {
      eventHash: event.eventHash ?? null,
      fileName,
      expectedFileName
    });
  }

  if (expected && (
    event.homeRef !== expected.homeRef ||
    event.deviceRef !== expected.deviceRef ||
    event.companionLineageRef !== expected.companionLineageRef ||
    event.threadRef !== expected.threadRef
  )) {
    fail('EVENT_CHAIN_CORRUPT', 'conversation event identity does not match the admitted thread', {
      eventHash: event.eventHash,
      eventThreadRef: event.threadRef,
      expectedThreadRef: expected.threadRef
    });
  }

  if (event.eventKind === 'RESPONSE') {
    let endpointOrigin = null;
    try {
      endpointOrigin = new URL(event.sanitizedEndpointOrigin);
    } catch {}
    if (
      !isNonEmptyString(event.endpointProfileRef) ||
      !isNonEmptyString(event.modelNameOrBoundedTestProfileRef) ||
      !endpointOrigin ||
      endpointOrigin.origin !== event.sanitizedEndpointOrigin ||
      !isLoopbackHost(endpointOrigin.hostname)
    ) {
      fail('EVENT_CHAIN_CORRUPT', 'response event provenance is invalid', {
        eventHash: event.eventHash
      });
    }
  }

  return event;
}

function validateEventChain(eventsDirectory, headEventHash, expectedIdentity = null) {
  if (!/^[0-9a-f]{64}$/u.test(headEventHash ?? '')) {
    fail('EVENT_CHAIN_CORRUPT', 'conversation head event hash is invalid');
  }
  const events = existingEvents(eventsDirectory, expectedIdentity);
  const byHash = new Map();
  for (const event of events) {
    if (byHash.has(event.eventHash)) {
      fail('EVENT_CHAIN_CORRUPT', 'conversation event hash appears more than once on disk', {
        eventHash: event.eventHash
      });
    }
    byHash.set(event.eventHash, event);
  }

  const chain = [];
  let cursor = headEventHash;
  const visited = new Set();
  while (cursor) {
    if (visited.has(cursor)) fail('EVENT_CHAIN_CORRUPT', 'event chain contains a cycle');
    visited.add(cursor);
    const event = byHash.get(cursor);
    if (!event) fail('EVENT_CHAIN_CORRUPT', 'event chain references a missing event', { eventHash: cursor });
    chain.push(event);
    cursor = event.priorEventHash;
  }

  const chronological = chain.reverse();
  if (chronological.length < 2 || chronological.length % 2 !== 0) {
    fail('EVENT_CHAIN_CORRUPT', 'completed event chain must contain complete request/response pairs');
  }
  if (chronological[0].sequence !== 0 || chronological[0].priorEventHash !== null) {
    fail('EVENT_CHAIN_CORRUPT', 'completed event chain must be anchored at genesis sequence zero');
  }

  for (let index = 0; index < chronological.length; index += 1) {
    const event = chronological[index];
    if (event.sequence !== index) {
      fail('EVENT_CHAIN_CORRUPT', 'completed event sequence must be contiguous from genesis', {
        index,
        observedSequence: event.sequence
      });
    }
    const expectedPrior = index === 0 ? null : chronological[index - 1].eventHash;
    if (event.priorEventHash !== expectedPrior) {
      fail('EVENT_CHAIN_CORRUPT', 'completed event prior hash does not match the exact prior event', {
        eventHash: event.eventHash,
        expectedPrior,
        observedPrior: event.priorEventHash
      });
    }
  }

  for (let index = 0; index < chronological.length; index += 2) {
    const request = chronological[index];
    const response = chronological[index + 1];
    if (
      request.eventKind !== 'REQUEST' ||
      response.eventKind !== 'RESPONSE' ||
      request.turnRef !== response.turnRef ||
      request.instanceRef !== response.instanceRef ||
      request.channelRef !== response.channelRef ||
      response.speakerRef !== request.recipientRefs[0] ||
      response.recipientRefs.length !== 1 ||
      response.recipientRefs[0] !== request.speakerRef
    ) {
      fail('EVENT_CHAIN_CORRUPT', 'completed event chain request/response pair semantics are invalid', {
        requestEventHash: request.eventHash,
        responseEventHash: response.eventHash
      });
    }
  }
  return chronological;
}

function validateCompletedConversationState({ home, admitted, threadRef, paths = null }) {
  const safeThreadRef = ensureSafeRef(threadRef, 'threadRef');
  const resolvedPaths = paths ?? homePaths(home, admitted.companionLineageRef, safeThreadRef);
  if (!fs.existsSync(resolvedPaths.head)) {
    return {
      paths: resolvedPaths,
      head: null,
      chain: [],
      contextRecord: null,
      requestEvent: null,
      responseEvent: null
    };
  }

  const head = verifyHead(readJson(resolvedPaths.head, 'CONVERSATION_HEAD_MISMATCH', 'conversation head'));
  if (
    head.schemaVersion !== 'vexlife.lived-companion-head/v1' ||
    head.homeRef !== admitted.homeRef ||
    head.deviceRef !== admitted.deviceRef ||
    head.companionLineageRef !== admitted.companionLineageRef ||
    head.threadRef !== safeThreadRef ||
    ensureSafeRef(head.instanceRef, 'head.instanceRef', 'CONVERSATION_HEAD_MISMATCH') !== head.instanceRef ||
    ensureSafeRef(head.turnRef, 'head.turnRef', 'CONVERSATION_HEAD_MISMATCH') !== head.turnRef ||
    !Number.isSafeInteger(head.sequence) ||
    head.sequence < 1 ||
    !/^[0-9a-f]{64}$/u.test(head.eventHash ?? '') ||
    !/^[0-9a-f]{64}$/u.test(head.contextSha256 ?? '') ||
    typeof head.contextPath !== 'string' ||
    typeof head.requestMessageRef !== 'string' ||
    head.requestMessageRef.length === 0 ||
    typeof head.responseMessageRef !== 'string' ||
    head.responseMessageRef.length === 0 ||
    (
      head.sequence === 1
        ? head.priorConversationHeadSha256 !== null
        : !/^[0-9a-f]{64}$/u.test(head.priorConversationHeadSha256 ?? '')
    )
  ) {
    fail('CONVERSATION_HEAD_MISMATCH', 'conversation head identity does not match the admitted completed thread');
  }

  const expectedIdentity = {
    homeRef: admitted.homeRef,
    deviceRef: admitted.deviceRef,
    companionLineageRef: admitted.companionLineageRef,
    threadRef: safeThreadRef
  };
  const chain = validateEventChain(resolvedPaths.events, head.eventHash, expectedIdentity);
  const responseEvent = chain.at(-1);
  const requestEvent = chain.at(-2);
  if (
    responseEvent.eventKind !== 'RESPONSE' ||
    requestEvent.eventKind !== 'REQUEST' ||
    responseEvent.eventHash !== head.eventHash ||
    responseEvent.sequence !== head.sequence ||
    responseEvent.turnRef !== head.turnRef ||
    requestEvent.turnRef !== head.turnRef ||
    responseEvent.instanceRef !== head.instanceRef ||
    requestEvent.instanceRef !== head.instanceRef ||
    responseEvent.messageRef !== head.responseMessageRef ||
    requestEvent.messageRef !== head.requestMessageRef ||
    responseEvent.priorEventHash !== requestEvent.eventHash
  ) {
    fail('EVENT_CHAIN_CORRUPT', 'completed conversation head does not bind its exact request/response events');
  }

  const expectedContextPath = resolveHomePath(
    home,
    'context',
    admitted.companionLineageRef,
    safeThreadRef,
    `${head.turnRef}.json`
  );
  const expectedContextRelative = path.relative(home, expectedContextPath).replaceAll('\\', '/');
  if (head.contextPath !== expectedContextRelative) {
    fail('CONTEXT_HASH_MISMATCH', 'conversation head does not reference the exact canonical context location', {
      contextPath: head.contextPath,
      expectedContextPath: expectedContextRelative
    });
  }
  const contextPath = resolveHomeRelativePath(home, head.contextPath);
  if (!sameCanonicalPath(contextPath, expectedContextPath)) {
    fail('CONTEXT_HASH_MISMATCH', 'resolved bounded context path is not the exact canonical context location');
  }
  if (!fs.existsSync(contextPath)) fail('CONTEXT_HASH_MISMATCH', 'bounded context record is missing');
  const contextRecord = readJson(contextPath, 'CONTEXT_HASH_MISMATCH', 'bounded context record');
  const { serializedContextSha256, ...contextCore } = contextRecord;
  if (
    !/^[0-9a-f]{64}$/u.test(serializedContextSha256 ?? '') ||
    contentHash(contextCore) !== serializedContextSha256 ||
    serializedContextSha256 !== head.contextSha256
  ) {
    fail('CONTEXT_HASH_MISMATCH', 'bounded context hash does not match the conversation head');
  }
  if (
    contextRecord.schemaVersion !== 'vexlife.lived-companion-context/v1' ||
    contextRecord.homeRef !== admitted.homeRef ||
    contextRecord.deviceRef !== admitted.deviceRef ||
    contextRecord.companionLineageRef !== admitted.companionLineageRef ||
    contextRecord.threadRef !== safeThreadRef ||
    contextRecord.turnRef !== head.turnRef ||
    contextRecord.instanceRef !== head.instanceRef ||
    contextRecord.requestEventHash !== requestEvent.eventHash ||
    contextRecord.responseEventHash !== responseEvent.eventHash ||
    contextRecord.privacyClass !== 'DEVICE_PRIVATE' ||
    !Array.isArray(contextRecord.contextSourceRefs) ||
    contextRecord.contextSourceRefs.length < 2 ||
    contextRecord.contextSourceRefs.some((value) => !isNonEmptyString(value)) ||
    contextRecord.contextSourceRefs.at(-2) !== requestEvent.eventRef ||
    contextRecord.contextSourceRefs.at(-1) !== responseEvent.eventRef
  ) {
    fail('CONTEXT_HASH_MISMATCH', 'bounded context identity does not match the admitted head and event chain');
  }

  const immutableCurrentHead = loadImmutableConversationHead(home, admitted, safeThreadRef, head.conversationHeadSha256).head;
  if (JSON.stringify(immutableCurrentHead) !== JSON.stringify(head)) {
    fail('CONVERSATION_HEAD_MISMATCH', 'current conversation head differs from its exact immutable receipt');
  }

  return {
    paths: resolvedPaths,
    head,
    chain,
    contextRecord,
    contextPath,
    requestEvent,
    responseEvent
  };
}

export function verifyHistoricalLivedCompanionHead({
  home,
  homeRef,
  deviceRef,
  companionLineageRef,
  threadRef,
  conversationHeadSha256
}) {
  if (!/^[0-9a-f]{64}$/u.test(conversationHeadSha256 ?? '')) {
    fail('CONVERSATION_HEAD_MISMATCH', 'requested historical conversation head SHA-256 is invalid');
  }
  const identity = loadHome(home);
  const admitted = assertHomeIdentity(identity, { homeRef, deviceRef, companionLineageRef });
  const safeThread = ensureSafeRef(threadRef, 'threadRef');
  const state = validateCompletedConversationState({ home: identity.homeRoot, admitted, threadRef: safeThread });
  if (!state.head) fail('CONVERSATION_HEAD_MISMATCH', 'conversation head is missing');

  let cursor = state.head;
  let target = null;
  const seen = new Set();
  while (cursor) {
    if (seen.has(cursor.conversationHeadSha256)) fail('CONVERSATION_HEAD_MISMATCH', 'conversation head ancestry contains a cycle');
    seen.add(cursor.conversationHeadSha256);
    const immutable = loadImmutableConversationHead(identity.homeRoot, admitted, safeThread, cursor.conversationHeadSha256).head;
    if (JSON.stringify(immutable) !== JSON.stringify(cursor)) {
      fail('CONVERSATION_HEAD_MISMATCH', 'conversation head ancestry differs from immutable receipt');
    }
    if (cursor.conversationHeadSha256 === conversationHeadSha256) {
      target = cursor;
      break;
    }
    if (cursor.priorConversationHeadSha256 === null) break;
    const prior = loadImmutableConversationHead(identity.homeRoot, admitted, safeThread, cursor.priorConversationHeadSha256).head;
    if (prior.sequence !== cursor.sequence - 2 || state.chain[prior.sequence]?.eventHash !== prior.eventHash) {
      fail('CONVERSATION_HEAD_MISMATCH', 'immutable conversation head ancestry is not contiguous');
    }
    cursor = prior;
  }
  if (!target) {
    fail('CONVERSATION_HEAD_MISMATCH', 'requested historical conversation head is not in current canonical ancestry', { conversationHeadSha256 });
  }

  const response = state.chain[target.sequence];
  const request = state.chain[target.sequence - 1];
  if (!request || !response || request.eventKind !== 'REQUEST' || response.eventKind !== 'RESPONSE' ||
      response.eventHash !== target.eventHash || response.turnRef !== target.turnRef || request.turnRef !== target.turnRef ||
      response.instanceRef !== target.instanceRef || request.instanceRef !== target.instanceRef ||
      response.messageRef !== target.responseMessageRef || request.messageRef !== target.requestMessageRef ||
      response.priorEventHash !== request.eventHash) {
    fail('CONVERSATION_HEAD_MISMATCH', 'historical conversation head does not bind its exact request/response pair');
  }

  const expectedContextPath = resolveHomePath(identity.homeRoot, 'context', admitted.companionLineageRef, safeThread, `${target.turnRef}.json`);
  const expectedContextRelative = path.relative(identity.homeRoot, expectedContextPath).replaceAll('\\', '/');
  if (target.contextPath !== expectedContextRelative || !fs.existsSync(expectedContextPath)) {
    fail('CONVERSATION_HEAD_MISMATCH', 'historical conversation head does not bind its canonical context record');
  }
  const contextRecord = readJson(expectedContextPath, 'CONVERSATION_HEAD_MISMATCH', 'historical bounded context');
  const { serializedContextSha256, ...contextCore } = contextRecord ?? {};
  if (!/^[0-9a-f]{64}$/u.test(serializedContextSha256 ?? '') || contentHash(contextCore) !== serializedContextSha256 ||
      serializedContextSha256 !== target.contextSha256 || contextRecord.homeRef !== admitted.homeRef ||
      contextRecord.deviceRef !== admitted.deviceRef || contextRecord.companionLineageRef !== admitted.companionLineageRef ||
      contextRecord.threadRef !== safeThread || contextRecord.turnRef !== target.turnRef ||
      contextRecord.requestEventHash !== request.eventHash || contextRecord.responseEventHash !== response.eventHash ||
      contextRecord.privacyClass !== 'DEVICE_PRIVATE') {
    fail('CONVERSATION_HEAD_MISMATCH', 'historical bounded context does not match the immutable conversation head');
  }

  return Object.freeze({
    schemaVersion: 'vexlife.lived-companion-historical-head-verification/v1',
    state: 'VERIFIED',
    currentness: target.conversationHeadSha256 === state.head.conversationHeadSha256 ? 'CURRENT' : 'HISTORICAL_SOURCE_VERIFIED',
    homeRef: admitted.homeRef,
    deviceRef: admitted.deviceRef,
    companionLineageRef: admitted.companionLineageRef,
    threadRef: safeThread,
    conversationHeadSha256: target.conversationHeadSha256,
    priorConversationHeadSha256: target.priorConversationHeadSha256,
    sequence: target.sequence,
    contextSha256: target.contextSha256,
    response: Object.freeze({
      eventRef: response.eventRef,
      eventHash: response.eventHash,
      sequence: response.sequence,
      turnRef: response.turnRef,
      instanceRef: response.instanceRef,
      endpointProfileRef: response.endpointProfileRef,
      modelProfileRef: response.modelNameOrBoundedTestProfileRef
    }),
    rawConversationContentIncluded: false
  });
}

export function writeLivedCompanionShutdownReceipt({
  home,
  homeRef,
  deviceRef,
  companionLineageRef,
  instanceRef,
  threadRef,
  expectedConversationHeadSha256
}) {
  ensureSafeRef(instanceRef, 'instanceRef');
  ensureSafeRef(threadRef, 'threadRef');
  const identity = loadHome(home);
  const admitted = assertHomeIdentity(identity, { homeRef, deviceRef, companionLineageRef });
  const state = validateCompletedConversationState({
    home: identity.homeRoot,
    admitted,
    threadRef
  });
  const head = state.head;
  if (!head) fail('CONVERSATION_HEAD_MISMATCH', 'conversation head is missing');
  if (
    head.instanceRef !== instanceRef ||
    head.conversationHeadSha256 !== expectedConversationHeadSha256
  ) {
    fail('CONVERSATION_HEAD_MISMATCH', 'shutdown identity/head does not match the completing instance');
  }
  const receiptCore = {
    schemaVersion: 'vexlife.lived-companion-shutdown-receipt/v1',
    homeRef: admitted.homeRef,
    deviceRef: admitted.deviceRef,
    companionLineageRef: admitted.companionLineageRef,
    instanceRef,
    threadRef,
    conversationHeadSha256: head.conversationHeadSha256,
    eventHash: head.eventHash,
    contextSha256: head.contextSha256,
    clean: true,
    formedAt: new Date().toISOString()
  };
  const receipt = { ...receiptCore, shutdownReceiptSha256: contentHash(receiptCore) };
  const receiptPath = resolveHomePath(identity.homeRoot, 'runtime', instanceRef, 'shutdown-receipt.json');
  atomicWriteJson(receiptPath, receipt);
  return { receipt, receiptPath };
}

export function resumeLivedCompanionConversation({
  home,
  homeRef,
  deviceRef,
  companionLineageRef,
  priorInstanceRef,
  instanceRef,
  threadRef,
  expectedConversationHeadSha256,
  expectedShutdownReceiptSha256
}) {
  ensureSafeRef(priorInstanceRef, 'priorInstanceRef');
  ensureSafeRef(instanceRef, 'instanceRef');
  ensureSafeRef(threadRef, 'threadRef');
  if (instanceRef === priorInstanceRef) fail('CONVERSATION_HEAD_MISMATCH', 'fresh resume must use a new instanceRef');
  if (!/^[0-9a-f]{64}$/u.test(expectedShutdownReceiptSha256 ?? '')) {
    fail('CONVERSATION_HEAD_MISMATCH', 'exact shutdown receipt SHA-256 is required');
  }
  const identity = loadHome(home);
  const admitted = assertHomeIdentity(identity, { homeRef, deviceRef, companionLineageRef });
  const state = validateCompletedConversationState({
    home: identity.homeRoot,
    admitted,
    threadRef
  });
  const head = state.head;
  if (
    !head ||
    head.instanceRef !== priorInstanceRef ||
    head.conversationHeadSha256 !== expectedConversationHeadSha256
  ) {
    fail('CONVERSATION_HEAD_MISMATCH', 'resume identity does not match the admitted completing instance/head');
  }
  const shutdownPath = resolveHomePath(identity.homeRoot, 'runtime', priorInstanceRef, 'shutdown-receipt.json');
  if (!fs.existsSync(shutdownPath)) fail('CONVERSATION_HEAD_MISMATCH', 'matching clean shutdown receipt is missing');
  const shutdown = verifyContentAddressedReceipt(
    readJson(shutdownPath, 'CONVERSATION_HEAD_MISMATCH', 'shutdown receipt'),
    'shutdownReceiptSha256',
    'CONVERSATION_HEAD_MISMATCH',
    'shutdown receipt'
  );
  if (
    shutdown.shutdownReceiptSha256 !== expectedShutdownReceiptSha256 ||
    shutdown.clean !== true ||
    shutdown.homeRef !== admitted.homeRef ||
    shutdown.deviceRef !== admitted.deviceRef ||
    shutdown.companionLineageRef !== admitted.companionLineageRef ||
    shutdown.instanceRef !== priorInstanceRef ||
    shutdown.threadRef !== threadRef ||
    shutdown.conversationHeadSha256 !== head.conversationHeadSha256 ||
    shutdown.eventHash !== head.eventHash ||
    shutdown.contextSha256 !== head.contextSha256
  ) {
    fail('CONVERSATION_HEAD_MISMATCH', 'shutdown receipt does not bind the exact completed head and prior instance');
  }
  const chain = state.chain;
  const contextRecord = state.contextRecord;
  const receiptCore = {
    schemaVersion: 'vexlife.lived-companion-resume-receipt/v1',
    homeRef: admitted.homeRef,
    deviceRef: admitted.deviceRef,
    companionLineageRef: admitted.companionLineageRef,
    priorInstanceRef,
    instanceRef,
    threadRef,
    conversationHeadSha256: head.conversationHeadSha256,
    eventHash: head.eventHash,
    contextSha256: head.contextSha256,
    shutdownReceiptSha256: shutdown.shutdownReceiptSha256,
    replayedEventCount: chain.length,
    exactPriorHeadSelected: true,
    formedAt: new Date().toISOString()
  };
  const receipt = { ...receiptCore, resumeReceiptSha256: contentHash(receiptCore) };
  const receiptPath = resolveHomePath(identity.homeRoot, 'recovery', threadRef, 'resume-receipt.json');
  atomicWriteJson(receiptPath, receipt);
  return { state: 'RESUMED', head, chain, contextRecord, shutdownReceipt: shutdown, receipt, receiptPath };
}

export function assertNoSensitivePersistence(root, secretValues = []) {
  const secrets = secretValues.filter((value) => typeof value === 'string' && value.length > 0);
  if (!secrets.length) return { secretLeakCount: 0, checkedFiles: 0 };
  let checkedFiles = 0;
  let secretLeakCount = 0;
  const walk = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        checkedFiles += 1;
        const text = fs.readFileSync(full, 'utf8');
        for (const secret of secrets) if (text.includes(secret)) secretLeakCount += 1;
      }
    }
  };
  walk(root);
  if (secretLeakCount) fail('PRIVACY_POLICY_BLOCKED', 'a secret was found in persisted runtime evidence', { secretLeakCount });
  return { secretLeakCount, checkedFiles };
}

export function livedCompanionReceiptSha256(file) {
  return fileSha256(file);
}

export function readCurrentLivedCompanionCompletedTurn({
  home,
  homeRef = null,
  deviceRef = null,
  companionLineageRef,
  threadRef,
  expectedConversationHeadSha256 = null
}) {
  const identity = loadHome(home);
  const admitted = assertHomeIdentity(identity, { homeRef, deviceRef, companionLineageRef });
  const safeThread = ensureSafeRef(threadRef, 'threadRef', 'CONVERSATION_HEAD_MISMATCH');
  const paths = homePaths(identity.homeRoot, admitted.companionLineageRef, safeThread);
  const none = () => Object.freeze({
    schemaVersion: 'vexlife.lived-companion-current-completed-turn/v1',
    state: 'NONE',
    currentness: 'CURRENT',
    homeRef: admitted.homeRef,
    deviceRef: admitted.deviceRef,
    companionLineageRef: admitted.companionLineageRef,
    threadRef: safeThread,
    conversationHeadSha256: null,
    priorConversationHeadSha256: null,
    headSequence: null,
    requestEventBinding: null,
    responseEventBinding: null,
    exactEventFileReadCount: 0,
    headMetadataReadCount: 0,
    wholeHistoryEventEnumerationPerformed: false,
    rawConversationContentIncluded: false
  });

  if (!fs.existsSync(paths.head)) {
    if (expectedConversationHeadSha256 !== null) {
      fail('CONVERSATION_HEAD_MISMATCH', 'expected current completed conversation head is missing', {
        expectedConversationHeadSha256
      });
    }
    return none();
  }
  if (!/^[0-9a-f]{64}$/u.test(expectedConversationHeadSha256 ?? '')) {
    fail('CONVERSATION_HEAD_MISMATCH', 'expected current completed conversation head SHA-256 is required');
  }

  const head = verifyHead(readJson(paths.head, 'CONVERSATION_HEAD_MISMATCH', 'current completed conversation head'));
  const immutableHead = loadImmutableConversationHead(
    identity.homeRoot,
    admitted,
    safeThread,
    head.conversationHeadSha256
  ).head;
  if (JSON.stringify(immutableHead) !== JSON.stringify(head) ||
      head.conversationHeadSha256 !== expectedConversationHeadSha256) {
    fail('CONVERSATION_HEAD_MISMATCH', 'current completed conversation head does not match the exact expected immutable head', {
      expectedConversationHeadSha256,
      observedConversationHeadSha256: head.conversationHeadSha256
    });
  }

  const expectedIdentity = {
    homeRef: admitted.homeRef,
    deviceRef: admitted.deviceRef,
    companionLineageRef: admitted.companionLineageRef,
    threadRef: safeThread
  };
  const responseFile = eventPath(paths.events, head.sequence, head.eventHash);
  if (!fs.existsSync(responseFile)) {
    fail('EVENT_CHAIN_CORRUPT', 'current completed response event is missing');
  }
  const response = readJson(responseFile, 'EVENT_CHAIN_CORRUPT', 'current completed response event');
  assertEventRecord(response, expectedIdentity, path.basename(responseFile));
  if (response.eventKind !== 'RESPONSE' ||
      response.sequence !== head.sequence ||
      response.eventHash !== head.eventHash ||
      response.turnRef !== head.turnRef ||
      response.instanceRef !== head.instanceRef ||
      response.messageRef !== head.responseMessageRef ||
      !/^[0-9a-f]{64}$/u.test(response.priorEventHash ?? '')) {
    fail('CONVERSATION_HEAD_MISMATCH', 'current completed head does not bind its exact response event');
  }

  const requestFile = eventPath(paths.events, head.sequence - 1, response.priorEventHash);
  if (!fs.existsSync(requestFile)) {
    fail('EVENT_CHAIN_CORRUPT', 'current completed request event is missing');
  }
  const request = readJson(requestFile, 'EVENT_CHAIN_CORRUPT', 'current completed request event');
  assertEventRecord(request, expectedIdentity, path.basename(requestFile));
  if (request.eventKind !== 'REQUEST' ||
      request.sequence !== head.sequence - 1 ||
      request.eventHash !== response.priorEventHash ||
      request.turnRef !== head.turnRef ||
      request.instanceRef !== head.instanceRef ||
      request.messageRef !== head.requestMessageRef ||
      response.priorEventHash !== request.eventHash) {
    fail('CONVERSATION_HEAD_MISMATCH', 'current completed head does not bind its exact request event');
  }

  let headMetadataReadCount = 1;
  if (head.priorConversationHeadSha256 === null) {
    if (head.sequence !== 1 || request.sequence !== 0 || request.priorEventHash !== null) {
      fail('CONVERSATION_HEAD_MISMATCH', 'first completed turn predecessor binding is invalid');
    }
  } else {
    const prior = loadImmutableConversationHead(
      identity.homeRoot,
      admitted,
      safeThread,
      head.priorConversationHeadSha256
    ).head;
    headMetadataReadCount += 1;
    if (prior.sequence !== head.sequence - 2 || request.priorEventHash !== prior.eventHash) {
      fail('CONVERSATION_HEAD_MISMATCH', 'current completed turn predecessor head binding is invalid');
    }
  }

  const expectedContextPath = resolveHomePath(
    identity.homeRoot,
    'context',
    admitted.companionLineageRef,
    safeThread,
    `${head.turnRef}.json`
  );
  const expectedContextRelative = path.relative(identity.homeRoot, expectedContextPath).replaceAll('\\', '/');
  if (head.contextPath !== expectedContextRelative || !fs.existsSync(expectedContextPath)) {
    fail('CONTEXT_HASH_MISMATCH', 'current completed head does not bind its canonical context record');
  }
  const contextRecord = readJson(expectedContextPath, 'CONTEXT_HASH_MISMATCH', 'current completed bounded context');
  const { serializedContextSha256, ...contextCore } = contextRecord ?? {};
  if (!/^[0-9a-f]{64}$/u.test(serializedContextSha256 ?? '') ||
      contentHash(contextCore) !== serializedContextSha256 ||
      serializedContextSha256 !== head.contextSha256 ||
      contextRecord.schemaVersion !== 'vexlife.lived-companion-context/v1' ||
      contextRecord.homeRef !== admitted.homeRef ||
      contextRecord.deviceRef !== admitted.deviceRef ||
      contextRecord.companionLineageRef !== admitted.companionLineageRef ||
      contextRecord.threadRef !== safeThread ||
      contextRecord.turnRef !== head.turnRef ||
      contextRecord.instanceRef !== head.instanceRef ||
      contextRecord.requestEventHash !== request.eventHash ||
      contextRecord.responseEventHash !== response.eventHash ||
      contextRecord.privacyClass !== 'DEVICE_PRIVATE' ||
      !Array.isArray(contextRecord.contextSourceRefs) ||
      contextRecord.contextSourceRefs.length < 2 ||
      contextRecord.contextSourceRefs.at(-2) !== request.eventRef ||
      contextRecord.contextSourceRefs.at(-1) !== response.eventRef) {
    fail('CONTEXT_HASH_MISMATCH', 'current completed bounded context does not match its exact head and event pair');
  }

  return Object.freeze({
    schemaVersion: 'vexlife.lived-companion-current-completed-turn/v1',
    state: 'COMPLETED',
    currentness: 'CURRENT',
    homeRef: admitted.homeRef,
    deviceRef: admitted.deviceRef,
    companionLineageRef: admitted.companionLineageRef,
    threadRef: safeThread,
    conversationHeadSha256: head.conversationHeadSha256,
    priorConversationHeadSha256: head.priorConversationHeadSha256,
    headSequence: head.sequence,
    turnRef: head.turnRef,
    instanceRef: head.instanceRef,
    requestEventBinding: Object.freeze({
      eventRef: request.eventRef,
      eventHash: request.eventHash,
      sequence: request.sequence,
      contentHash: request.contentHash
    }),
    responseEventBinding: Object.freeze({
      eventRef: response.eventRef,
      eventHash: response.eventHash,
      sequence: response.sequence,
      contentHash: response.contentHash
    }),
    exactEventFileReadCount: 2,
    headMetadataReadCount,
    wholeHistoryEventEnumerationPerformed: false,
    rawConversationContentIncluded: false
  });
}

// [VXG RealForever]
