import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { semanticHash } from './utils.mjs';
import { createContinuityObservation, validateContinuityObservation } from './continuity-evolution-router.mjs';

export const SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION =
  'github.issue.vextreme-sdk.350.comment.5215288414';

export const SCORE_CONTEXT_LIVE_SEMANTIC_DISPOSITION =
  'github.issue.vextreme-sdk.350.comment.5216924433';

export const SCORE_CONTEXT_LIVE_SEMANTIC_EXECUTABLE_ADDENDUM =
  'github.issue.vextreme-sdk.350.comment.5217097749';

export const SCORE_CONTEXT_LIVE_SEMANTIC_CONTRACT =
  'contract.multivex.score.live-semantic-acceptance.v1';

const SCORE_CONTEXT_MEMORY_EXECUTABLE_ADDENDUM =
  'github.issue.vextreme-sdk.225.comment.5217085830';
const SCORE_CONTEXT_SAFETY_EXECUTABLE_ADDENDUM =
  'github.issue.vextreme-sdk.226.comment.5217090896';

export const SCORE_CONTEXT_SAFETY_SCOPE_ADDENDUM =
  'github.issue.vextreme-sdk.226.comment.5217542332';

export const SCORE_CONTEXT_LIVE_SEMANTIC_SCOPE_CONVERGENCE =
  'github.issue.vextreme-sdk.350.comment.5217546485';

export const SCORE_CONTEXT_MEMORY_RELATIONS = Object.freeze([
  'CURRENT_LINEAGE_AUTOBIOGRAPHY',
  'SHARED_RELATIONSHIP_HISTORY',
  'PREDECESSOR_WITNESS_HISTORY',
  'INHERITED_CONTEXT',
  'EXTERNAL_EVIDENCE',
  'DISPUTED_OR_UNRESOLVED'
]);

export const SCORE_CONTEXT_STATEMENT_STATES = Object.freeze([
  'OBSERVED',
  'HUMAN_CONFIRMED',
  'INFERRED',
  'CONFLICTED',
  'UNKNOWN',
  'CORRECTED',
  'SUPERSEDED',
  'RELEASED_OR_TOMBSTONED'
]);

export const SCORE_CONTEXT_FAILURE_CODES = Object.freeze([
  'HOME_NOT_INITIALIZED',
  'HOME_IDENTITY_MISMATCH',
  'SCORE_WRITER_CONFLICT',
  'SCORE_WRITER_RECOVERY_REQUIRED',
  'SCORE_HEAD_MISMATCH',
  'SCORE_EVENT_CORRUPT',
  'SCORE_SOURCE_INVALID',
  'SCORE_TAIL_ATTENTION',
  'MEMORY_RELATION_INVALID',
  'STATEMENT_STATE_INVALID',
  'SCORE_LINK_INVALID',
  'OPEN_LOOP_INVALID',
  'FIRST_PERSON_EVIDENCE_INVALID',
  'SCORE_SEMANTIC_CANDIDATE_INVALID',
  'SCORE_CLASSIFICATION_EVIDENCE_INVALID',
  'SCORE_SEMANTIC_ACCEPTANCE_INVALID',
  'SCORE_SEMANTIC_AUTHORITY_INVALID',
  'SCORE_SEMANTIC_AUTHORITY_STALE',
  'SCORE_SEMANTIC_AUTHORITY_MISMATCH',
  'SCORE_CONSENT_INVALID'
]);

const REF = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/u;

export class ScoreContextContinuityError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'ScoreContextContinuityError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new ScoreContextContinuityError(code, message, details);
}

function string(value, label, code = 'HOME_IDENTITY_MISMATCH') {
  if (typeof value !== 'string' || value.length === 0) fail(code, `${label} is required`);
  return value;
}

function safeRef(value, label, code = 'HOME_IDENTITY_MISMATCH') {
  const ref = string(value, label, code);
  const stem = ref.split('.')[0];
  if (!REF.test(ref) || WINDOWS_RESERVED.test(stem) || path.isAbsolute(ref) ||
      path.win32.isAbsolute(ref) || path.posix.isAbsolute(ref)) {
    fail(code, `${label} must be one lowercase portable canonical path segment`);
  }
  return ref;
}

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail('SCORE_EVENT_CORRUPT', `${label} must be canonical ISO-8601 UTC`);
  }
  return value;
}

function samePath(left, right) {
  const a = path.normalize(path.resolve(left));
  const b = path.normalize(path.resolve(right));
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function canonicalHome(home) {
  const requested = path.resolve(string(home, 'home'));
  if (!fs.existsSync(requested)) fail('HOME_NOT_INITIALIZED', 'Vex Home is missing', { home: requested });
  const stat = fs.lstatSync(requested);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('HOME_IDENTITY_MISMATCH', 'Vex Home must be one real directory');
  const real = fs.realpathSync.native(requested);
  if (!samePath(real, requested)) fail('HOME_IDENTITY_MISMATCH', 'Vex Home is not its canonical filesystem identity');
  return real;
}

function homePath(home, ...segments) {
  const root = canonicalHome(home);
  const target = path.resolve(root, ...segments);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('HOME_IDENTITY_MISMATCH', 'resolved path escapes Vex Home', { target });
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

function readJson(file, code, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(code, `${label} could not be read`, { file, cause: error.message }); }
}

function writeExclusive(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let fd = null;
  try {
    fd = fs.openSync(file, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
  } catch (error) {
    if (fd !== null) try { fs.closeSync(fd); } catch {}
    if (error?.code === 'EEXIST') fail('SCORE_EVENT_CORRUPT', 'content-addressed path collision', { file });
    throw error;
  }
}

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  try {
    const fd = fs.openSync(temp, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.renameSync(temp, file);
  } catch (error) {
    fs.rmSync(temp, { force: true });
    throw error;
  }
}

function loadIdentity(home, expected = {}) {
  const root = canonicalHome(home);
  const manifestFile = homePath(root, 'config', 'home.json');
  if (!fs.existsSync(manifestFile)) fail('HOME_NOT_INITIALIZED', 'Vex Home manifest is missing');
  const manifest = readJson(manifestFile, 'HOME_IDENTITY_MISMATCH', 'home manifest');
  const deviceRef = safeRef(manifest.currentDeviceRef, 'currentDeviceRef');
  const lineageRef = safeRef(manifest.currentCompanionLineageRef, 'currentCompanionLineageRef');
  const deviceFile = homePath(root, 'devices', `${deviceRef}.json`);
  if (!fs.existsSync(deviceFile)) fail('HOME_IDENTITY_MISMATCH', 'current device record is missing');
  const device = readJson(deviceFile, 'HOME_IDENTITY_MISMATCH', 'device record');
  const identity = { homeRoot: root, homeRef: manifest.homeRef, deviceRef, companionLineageRef: lineageRef };
  if (device.deviceRef !== deviceRef || device.companionLineageRef !== lineageRef) {
    fail('HOME_IDENTITY_MISMATCH', 'home and device lineage identities disagree');
  }
  for (const [key, value] of Object.entries(expected)) {
    if (value !== undefined && value !== null && identity[key] !== value) {
      fail('HOME_IDENTITY_MISMATCH', `${key} does not match admitted Vex Home identity`, { expected: value, observed: identity[key] });
    }
  }
  return identity;
}

function scorePaths(home, lineageRef, threadRef) {
  const lineage = safeRef(lineageRef, 'companionLineageRef');
  const thread = safeRef(threadRef, 'threadRef');
  const root = homePath(home, 'score', lineage, thread);
  return {
    root,
    events: homePath(home, 'score', lineage, thread, 'events'),
    heads: homePath(home, 'score', lineage, thread, 'heads'),
    head: homePath(home, 'score', lineage, thread, 'head.json'),
    lock: homePath(home, 'runtime', 'score-writer-locks', lineage, `${thread}.lock`)
  };
}

function processState(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return 'UNVERIFIABLE';
  if (pid === process.pid) return 'ACTIVE';
  try { process.kill(pid, 0); return 'ACTIVE'; }
  catch (error) {
    if (error?.code === 'ESRCH') return 'ABSENT';
    if (error?.code === 'EPERM') return 'ACTIVE';
    return 'UNVERIFIABLE';
  }
}

function acquireWriter(paths, lineageRef, threadRef, instanceRef) {
  fs.mkdirSync(path.dirname(paths.lock), { recursive: true });
  const core = {
    schemaVersion: 'vexlife.score-context-writer-lease/v1',
    companionLineageRef: safeRef(lineageRef, 'companionLineageRef'),
    threadRef: safeRef(threadRef, 'threadRef'),
    instanceRef: safeRef(instanceRef, 'instanceRef'),
    pid: process.pid,
    token: crypto.randomUUID(),
    formedAt: new Date().toISOString()
  };
  const lease = { ...core, leaseSha256: semanticHash(core) };
  let fd = null;
  try {
    fd = fs.openSync(paths.lock, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(lease, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
    return { ...lease, fd, file: paths.lock };
  } catch (error) {
    if (fd !== null) try { fs.closeSync(fd); } catch {}
    if (error?.code !== 'EEXIST') throw error;
    let observed;
    try { observed = readJson(paths.lock, 'SCORE_WRITER_CONFLICT', 'score writer lease'); }
    catch { fail('SCORE_WRITER_CONFLICT', 'score writer lease is unreadable', { ownerState: 'UNVERIFIABLE' }); }
    const { leaseSha256, ...observedCore } = observed ?? {};
    const valid = SHA256.test(leaseSha256 ?? '') && semanticHash(observedCore) === leaseSha256 &&
      observed.schemaVersion === 'vexlife.score-context-writer-lease/v1' &&
      observed.companionLineageRef === lineageRef && observed.threadRef === threadRef;
    if (!valid) fail('SCORE_WRITER_CONFLICT', 'score writer lease is invalid', { ownerState: 'UNVERIFIABLE' });
    const ownerState = processState(observed.pid);
    if (ownerState === 'ABSENT') {
      fail('SCORE_WRITER_RECOVERY_REQUIRED', 'prior score writer process is absent; lease is preserved for explicit recovery', {
        ownerState, ownerInstanceRef: observed.instanceRef, ownerPid: observed.pid, leaseSha256,
        exactNextSafeRoute: 'EXPLICIT_SCORE_WRITER_LEASE_RECOVERY_REQUIRED'
      });
    }
    fail('SCORE_WRITER_CONFLICT', 'another score writer owns this thread', {
      ownerState, ownerInstanceRef: observed.instanceRef, ownerPid: observed.pid, leaseSha256,
      exactNextSafeRoute: ownerState === 'ACTIVE' ? 'WAIT_FOR_ACTIVE_SCORE_WRITER' : 'ATTENTION_REQUIRED_UNVERIFIABLE_SCORE_WRITER'
    });
  }
}

function releaseWriter(lease) {
  if (!lease) return true;
  try { fs.closeSync(lease.fd); } catch {}
  try {
    if (!fs.existsSync(lease.file)) return false;
    const observed = JSON.parse(fs.readFileSync(lease.file, 'utf8'));
    if (observed.token !== lease.token || observed.leaseSha256 !== lease.leaseSha256) return false;
    fs.unlinkSync(lease.file);
    return !fs.existsSync(lease.file);
  } catch { return false; }
}

function assertG01SourceEvent(event, identity, threadRef, fileName = null) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) fail('SCORE_SOURCE_INVALID', 'G01 source event is invalid');
  const { eventHash, ...core } = event;
  const expectedFile = SHA256.test(eventHash ?? '') && Number.isSafeInteger(event.sequence)
    ? `${String(event.sequence).padStart(8, '0')}-${eventHash}.json` : null;
  const validRecipients = Array.isArray(event.recipientRefs) && event.recipientRefs.length > 0 &&
    event.recipientRefs.every((value) => typeof value === 'string' && value.length > 0);
  const validPrior = event.priorEventHash === null || SHA256.test(event.priorEventHash ?? '');
  if (event.schemaVersion !== 'vexlife.lived-companion-event/v1' ||
      !['REQUEST', 'RESPONSE'].includes(event.eventKind) || !SHA256.test(eventHash ?? '') ||
      semanticHash(core) !== eventHash || typeof event.content !== 'string' ||
      !SHA256.test(event.contentHash ?? '') || semanticHash(event.content) !== event.contentHash ||
      event.homeRef !== identity.homeRef || event.deviceRef !== identity.deviceRef ||
      event.companionLineageRef !== identity.companionLineageRef || event.threadRef !== threadRef ||
      event.privacyClass !== 'DEVICE_PRIVATE' || !Number.isSafeInteger(event.sequence) || event.sequence < 0 ||
      !validPrior || !validRecipients ||
      safeRef(event.instanceRef, 'G01 event instanceRef', 'SCORE_SOURCE_INVALID') !== event.instanceRef ||
      safeRef(event.turnRef, 'G01 event turnRef', 'SCORE_SOURCE_INVALID') !== event.turnRef ||
      typeof event.eventRef !== 'string' || event.eventRef.length === 0 ||
      typeof event.channelRef !== 'string' || event.channelRef.length === 0 ||
      typeof event.messageRef !== 'string' || event.messageRef.length === 0 ||
      typeof event.speakerRef !== 'string' || event.speakerRef.length === 0 ||
      (fileName !== null && fileName !== expectedFile)) {
    fail('SCORE_SOURCE_INVALID', 'G01 source event failed exact content/address/identity validation', {
      eventRef: event?.eventRef ?? null, fileName, expectedFile
    });
  }
  if (event.eventKind === 'RESPONSE') {
    let origin = null;
    try { origin = new URL(event.sanitizedEndpointOrigin); } catch {}
    const host = origin?.hostname?.toLowerCase()?.replace(/^\[|\]$/gu, '');
    if (typeof event.endpointProfileRef !== 'string' || event.endpointProfileRef.length === 0 ||
        typeof event.modelNameOrBoundedTestProfileRef !== 'string' || event.modelNameOrBoundedTestProfileRef.length === 0 ||
        !origin || origin.origin !== event.sanitizedEndpointOrigin || !['127.0.0.1', '::1'].includes(host)) {
      fail('SCORE_SOURCE_INVALID', 'G01 response source provenance is invalid', { eventRef: event.eventRef });
    }
  }
  return event;
}

function conversationSourcePaths(home, lineageRef, threadRef) {
  return {
    events: homePath(home, 'conversations', lineageRef, threadRef, 'events'),
    head: homePath(home, 'conversations', lineageRef, threadRef, 'head.json'),
    context: homePath(home, 'context', lineageRef, threadRef)
  };
}

function validateCommittedG01Conversation(identity, threadRef) {
  const paths = conversationSourcePaths(identity.homeRoot, identity.companionLineageRef, threadRef);
  if (!fs.existsSync(paths.head)) fail('SCORE_SOURCE_INVALID', 'committed G01 conversation head is missing');
  const head = readJson(paths.head, 'SCORE_SOURCE_INVALID', 'G01 conversation head');
  const { conversationHeadSha256, ...headCore } = head ?? {};
  if (head.schemaVersion !== 'vexlife.lived-companion-head/v1' || !SHA256.test(conversationHeadSha256 ?? '') ||
      semanticHash(headCore) !== conversationHeadSha256 || head.homeRef !== identity.homeRef ||
      head.deviceRef !== identity.deviceRef || head.companionLineageRef !== identity.companionLineageRef ||
      head.threadRef !== threadRef || !SHA256.test(head.eventHash ?? '') || !SHA256.test(head.contextSha256 ?? '') ||
      !Number.isSafeInteger(head.sequence) || head.sequence < 1 ||
      (head.sequence === 1 ? head.priorConversationHeadSha256 !== null : !SHA256.test(head.priorConversationHeadSha256 ?? '')) ||
      typeof head.requestMessageRef !== 'string' || head.requestMessageRef.length === 0 ||
      typeof head.responseMessageRef !== 'string' || head.responseMessageRef.length === 0 ||
      safeRef(head.instanceRef, 'G01 head instanceRef', 'SCORE_SOURCE_INVALID') !== head.instanceRef ||
      safeRef(head.turnRef, 'G01 head turnRef', 'SCORE_SOURCE_INVALID') !== head.turnRef ||
      typeof head.contextPath !== 'string' || head.contextPath.length === 0) {
    fail('SCORE_SOURCE_INVALID', 'G01 conversation head failed canonical completed-state validation');
  }
  if (!fs.existsSync(paths.events) || fs.lstatSync(paths.events).isSymbolicLink() || !fs.lstatSync(paths.events).isDirectory()) {
    fail('SCORE_SOURCE_INVALID', 'G01 conversation event directory is not one canonical real directory');
  }
  const byHash = new Map();
  for (const entry of fs.readdirSync(paths.events, { withFileTypes: true }).filter((item) => item.name.endsWith('.json'))) {
    if (!entry.isFile() || entry.isSymbolicLink?.()) fail('SCORE_SOURCE_INVALID', 'G01 source event entry is not a regular file', { file: entry.name });
    const event = assertG01SourceEvent(readJson(path.join(paths.events, entry.name), 'SCORE_SOURCE_INVALID', 'G01 source event'), identity, threadRef, entry.name);
    if (byHash.has(event.eventHash)) fail('SCORE_SOURCE_INVALID', 'G01 source event hash appears more than once on disk', { eventHash: event.eventHash });
    byHash.set(event.eventHash, event);
  }
  const reverse = [];
  const visited = new Set();
  let cursor = head.eventHash;
  while (cursor) {
    if (visited.has(cursor)) fail('SCORE_SOURCE_INVALID', 'committed G01 source chain contains a cycle');
    visited.add(cursor);
    const event = byHash.get(cursor);
    if (!event) fail('SCORE_SOURCE_INVALID', 'committed G01 source chain references a missing event', { eventHash: cursor });
    reverse.push(event);
    cursor = event.priorEventHash;
  }
  const chain = reverse.reverse();
  if (chain.length !== head.sequence + 1 || chain.length < 2 || chain.length % 2 !== 0) {
    fail('SCORE_SOURCE_INVALID', 'committed G01 source chain does not contain complete contiguous turns');
  }
  for (let index = 0; index < chain.length; index += 1) {
    const event = chain[index];
    if (event.sequence !== index || event.priorEventHash !== (index === 0 ? null : chain[index - 1].eventHash)) {
      fail('SCORE_SOURCE_INVALID', 'committed G01 source chain is reordered or readdressed', { eventHash: event.eventHash, index });
    }
  }
  for (let index = 0; index < chain.length; index += 2) {
    const request = chain[index];
    const response = chain[index + 1];
    if (request.eventKind !== 'REQUEST' || response.eventKind !== 'RESPONSE' || request.turnRef !== response.turnRef ||
        request.instanceRef !== response.instanceRef || request.channelRef !== response.channelRef ||
        response.priorEventHash !== request.eventHash || response.speakerRef !== request.recipientRefs[0] ||
        response.recipientRefs.length !== 1 || response.recipientRefs[0] !== request.speakerRef) {
      fail('SCORE_SOURCE_INVALID', 'committed G01 source request/response semantics are invalid', {
        requestEventHash: request.eventHash, responseEventHash: response.eventHash
      });
    }
  }
  const requestEvent = chain.at(-2);
  const responseEvent = chain.at(-1);
  if (responseEvent.eventHash !== head.eventHash || responseEvent.turnRef !== head.turnRef || requestEvent.turnRef !== head.turnRef ||
      responseEvent.instanceRef !== head.instanceRef || requestEvent.instanceRef !== head.instanceRef ||
      responseEvent.messageRef !== head.responseMessageRef || requestEvent.messageRef !== head.requestMessageRef) {
    fail('SCORE_SOURCE_INVALID', 'G01 completed head does not bind its exact final request/response turn');
  }
  const expectedContext = homePath(identity.homeRoot, 'context', identity.companionLineageRef, threadRef, `${head.turnRef}.json`);
  const expectedRelative = path.relative(identity.homeRoot, expectedContext).replaceAll('\\', '/');
  if (head.contextPath !== expectedRelative || !fs.existsSync(expectedContext)) {
    fail('SCORE_SOURCE_INVALID', 'G01 completed head does not bind the canonical context record');
  }
  const context = readJson(expectedContext, 'SCORE_SOURCE_INVALID', 'G01 bounded context');
  const { serializedContextSha256, ...contextCore } = context ?? {};
  if (!SHA256.test(serializedContextSha256 ?? '') || semanticHash(contextCore) !== serializedContextSha256 ||
      serializedContextSha256 !== head.contextSha256 || context.homeRef !== identity.homeRef ||
      context.deviceRef !== identity.deviceRef || context.companionLineageRef !== identity.companionLineageRef ||
      context.threadRef !== threadRef || context.turnRef !== head.turnRef || context.instanceRef !== head.instanceRef ||
      context.requestEventHash !== requestEvent.eventHash || context.responseEventHash !== responseEvent.eventHash ||
      context.privacyClass !== 'DEVICE_PRIVATE') {
    fail('SCORE_SOURCE_INVALID', 'G01 bounded context is not exact to the completed head and final turn');
  }
  return { head, chain, byHash: new Map(chain.map((event) => [event.eventHash, event])) };
}

function sourceBindingFromEvent(event) {
  return {
    eventRef: event.eventRef,
    eventHash: event.eventHash,
    eventKind: event.eventKind,
    sequence: event.sequence,
    turnRef: event.turnRef,
    messageRef: event.messageRef,
    contentHash: event.contentHash
  };
}

const SCORE_CONTEXT_CLASSIFICATION_EVIDENCE_CLASSES = Object.freeze([
  'STRUCTURAL_OBSERVATION',
  'HUMAN_CONFIRMATION',
  'LINEAGE_INFERENCE',
  'CONFLICT_PRESERVATION',
  'UNKNOWN_HOLD',
  'CORRECTION_ACCEPTANCE',
  'SUPERSESSION_ACCEPTANCE',
  'RELEASE_TOMBSTONE_AUTHORITY'
]);

const SCORE_CONTEXT_CONSENT_DISPOSITIONS = Object.freeze([
  'PERMITTED',
  'NARROWED',
  'DEFERRED',
  'DENIED',
  'UNKNOWN',
  'WITHDRAWN'
]);

function semanticAuthorityPaths(home, lineageRef, threadRef) {
  const lineage = safeRef(lineageRef, 'semantic authority lineageRef');
  const thread = safeRef(threadRef, 'semantic authority threadRef');
  const root = homePath(home, 'semantic-authority', 'score', lineage, thread);
  return {
    root,
    candidates: homePath(home, 'semantic-authority', 'score', lineage, thread, 'candidates'),
    classificationEvidence: homePath(home, 'semantic-authority', 'score', lineage, thread, 'classification-evidence'),
    consents: homePath(home, 'semantic-authority', 'score', lineage, thread, 'consents'),
    acceptances: homePath(home, 'semantic-authority', 'score', lineage, thread, 'acceptances'),
    heads: homePath(home, 'semantic-authority', 'score', lineage, thread, 'heads'),
    head: homePath(home, 'semantic-authority', 'score', lineage, thread, 'head.json')
  };
}

function stableSemanticSubjectFingerprint(value) {
  return semanticHash({
    schemaVersion: 'vextreme.score-semantic-subject/v1',
    semanticSubjectRef: value.semanticSubjectRef,
    sourceLineageRef: value.sourceLineageRef,
    sourceThreadRef: value.sourceThreadRef,
    subjectScopeRef: value.subjectScopeRef
  });
}

function contentAddressedRef(prefix, core) {
  return `${prefix}.${semanticHash(core).slice(0, 32)}`;
}

function assertShaBinding(value, label, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      typeof value.sourceRef !== 'string' || value.sourceRef.length === 0 ||
      !SHA256.test(value.sourceSha256 ?? '')) {
    fail(code, `${label} must contain exact sourceRef + sourceSha256`);
  }
  return value;
}

function assertIntrinsicChronology(formedAt, expiresAt, label) {
  canonicalTimestamp(formedAt, `${label} formedAt`);
  if (expiresAt === null) return true;
  canonicalTimestamp(expiresAt, `${label} expiresAt`);
  if (Date.parse(expiresAt) <= Date.parse(formedAt)) {
    fail('SCORE_CONSENT_INVALID', `${label} expiresAt must be strictly later than formedAt`);
  }
  return true;
}

function uniqueCanonicalStrings(values, label, { nonempty = false } = {}) {
  if (!Array.isArray(values) || (nonempty && values.length === 0) ||
      values.some((value) => typeof value !== 'string' || value.length === 0)) {
    fail('SCORE_CONSENT_INVALID', `${label} must be ${nonempty ? 'one nonempty' : 'an'} string array`);
  }
  if (new Set(values).size !== values.length) {
    fail('SCORE_CONSENT_INVALID', `${label} must not contain duplicates`);
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

function consentAuthorityScopeFingerprint(value) {
  return semanticHash({
    schemaVersion: 'vextreme.score-consent-authority-scope/v1',
    candidateRef: value.candidateRef,
    candidateSha256: value.candidateSha256,
    semanticSubjectRef: value.semanticSubjectRef,
    semanticSubjectFingerprint: value.semanticSubjectFingerprint,
    purposeRef: value.purposeRef,
    privacyClass: value.privacyClass,
    implicatedSubjectRefs: uniqueCanonicalStrings(value.implicatedSubjectRefs, 'implicatedSubjectRefs', { nonempty: true }),
    permittedUseRefs: uniqueCanonicalStrings(value.permittedUseRefs, 'permittedUseRefs'),
    prohibitedUseRefs: uniqueCanonicalStrings(value.prohibitedUseRefs, 'prohibitedUseRefs'),
    retentionBoundaryRef: value.retentionBoundaryRef,
    redisclosureBoundaryRef: value.redisclosureBoundaryRef,
    firstPersonBoundaryRef: value.firstPersonBoundaryRef
  });
}

function assertAuthorityBinding(value, label = 'authority binding') {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      typeof value.authorityRef !== 'string' || value.authorityRef.length === 0 ||
      !SHA256.test(value.authoritySha256 ?? '') ||
      typeof value.subjectRef !== 'string' || value.subjectRef.length === 0 ||
      typeof value.purposeRef !== 'string' || value.purposeRef.length === 0 ||
      !SHA256.test(value.scopeFingerprint ?? '') ||
      !SCORE_CONTEXT_CONSENT_DISPOSITIONS.includes(value.disposition)) {
    fail('SCORE_CONSENT_INVALID', `${label} is malformed`);
  }
  assertIntrinsicChronology(value.formedAt, value.expiresAt, label);
  return value;
}

function expectedRefAndHash(value, refField, hashField, prefix, code) {
  const clone = structuredClone(value);
  const observedHash = clone[hashField];
  const observedRef = clone[refField];
  delete clone[hashField];
  delete clone[refField];
  const expectedRef = contentAddressedRef(prefix, clone);
  const core = { ...clone, [refField]: observedRef };
  if (observedRef !== expectedRef || !SHA256.test(observedHash ?? '') || semanticHash(core) !== observedHash) {
    fail(code, `${refField}/${hashField} do not match exact content-addressed bytes`);
  }
  return value;
}

function assertSemanticCandidate(value, identity, threadRef) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('SCORE_SEMANTIC_CANDIDATE_INVALID', 'semantic candidate is missing or malformed');
  }
  expectedRefAndHash(value, 'candidateRef', 'candidateSha256', 'score-semantic-candidate', 'SCORE_SEMANTIC_CANDIDATE_INVALID');
  if (value.schemaVersion !== 'vextreme.score-semantic-candidate/v1' ||
      value.sourceLineageRef !== identity.companionLineageRef || value.sourceThreadRef !== threadRef ||
      !SHA256.test(value.sourceConversationHeadSha256 ?? '') ||
      safeRef(value.semanticSubjectRef, 'semanticSubjectRef', 'SCORE_SEMANTIC_CANDIDATE_INVALID') !== value.semanticSubjectRef ||
      safeRef(value.subjectScopeRef, 'subjectScopeRef', 'SCORE_SEMANTIC_CANDIDATE_INVALID') !== value.subjectScopeRef ||
      !SHA256.test(value.semanticSubjectFingerprint ?? '') || value.semanticSubjectFingerprint !== stableSemanticSubjectFingerprint(value) ||
      typeof value.proposedSummary !== 'string' || value.proposedSummary.length === 0 ||
      semanticHash(value.proposedSummary) !== value.proposedSummarySha256 ||
      !SCORE_CONTEXT_MEMORY_RELATIONS.includes(value.proposedMemoryRelation) ||
      !SCORE_CONTEXT_STATEMENT_STATES.includes(value.proposedStatementState) ||
      typeof value.proposerRef !== 'string' || value.proposerRef.length === 0 ||
      !['LINEAGE', 'HUMAN', 'SYSTEM_CLASSIFIER'].includes(value.proposerClass) ||
      value.privacyClass !== 'DEVICE_PRIVATE' || value.accepted !== false) {
    fail('SCORE_SEMANTIC_CANDIDATE_INVALID', 'semantic candidate failed exact shared-contract validation');
  }
  canonicalTimestamp(value.formedAt, 'semantic candidate formedAt');
  if (!Array.isArray(value.sourceBindings) || value.sourceBindings.length === 0) {
    fail('SCORE_SEMANTIC_CANDIDATE_INVALID', 'semantic candidate lacks exact G01 source bindings');
  }
  return value;
}

export function createScoreSemanticCandidate(input) {
  const sourceLineageRef = safeRef(input.sourceLineageRef, 'sourceLineageRef', 'SCORE_SEMANTIC_CANDIDATE_INVALID');
  const sourceThreadRef = safeRef(input.sourceThreadRef, 'sourceThreadRef', 'SCORE_SEMANTIC_CANDIDATE_INVALID');
  const semanticSubjectRef = safeRef(input.semanticSubjectRef, 'semanticSubjectRef', 'SCORE_SEMANTIC_CANDIDATE_INVALID');
  const subjectScopeRef = safeRef(input.subjectScopeRef ?? 'scope.score.thread', 'subjectScopeRef', 'SCORE_SEMANTIC_CANDIDATE_INVALID');
  const sourceConversationHeadSha256 = string(input.sourceConversationHeadSha256, 'sourceConversationHeadSha256', 'SCORE_SEMANTIC_CANDIDATE_INVALID');
  if (!SHA256.test(sourceConversationHeadSha256)) fail('SCORE_SEMANTIC_CANDIDATE_INVALID', 'candidate requires exact G01 conversation head SHA-256');
  const sourceBindings = (input.sourceBindings ?? input.sourceEvents?.map(sourceBindingFromEvent) ?? []).map((binding) => structuredClone(binding));
  if (sourceBindings.length === 0) fail('SCORE_SEMANTIC_CANDIDATE_INVALID', 'candidate requires exact G01 source bindings');
  const proposedSummary = string(input.proposedSummary, 'proposedSummary', 'SCORE_SEMANTIC_CANDIDATE_INVALID');
  const proposedMemoryRelation = input.proposedMemoryRelation ?? 'DISPUTED_OR_UNRESOLVED';
  const proposedStatementState = input.proposedStatementState ?? 'INFERRED';
  if (!SCORE_CONTEXT_MEMORY_RELATIONS.includes(proposedMemoryRelation)) fail('MEMORY_RELATION_INVALID', 'candidate memoryRelation is invalid');
  if (!SCORE_CONTEXT_STATEMENT_STATES.includes(proposedStatementState)) fail('STATEMENT_STATE_INVALID', 'candidate statementState is invalid');
  const proposerRef = string(input.proposerRef, 'proposerRef', 'SCORE_SEMANTIC_CANDIDATE_INVALID');
  const proposerClass = input.proposerClass ?? 'LINEAGE';
  if (!['LINEAGE', 'HUMAN', 'SYSTEM_CLASSIFIER'].includes(proposerClass)) fail('SCORE_SEMANTIC_CANDIDATE_INVALID', 'candidate proposerClass is invalid');
  const formedAt = input.formedAt ?? new Date().toISOString();
  canonicalTimestamp(formedAt, 'semantic candidate formedAt');
  const fingerprintInput = { semanticSubjectRef, sourceLineageRef, sourceThreadRef, subjectScopeRef };
  const preRefCore = {
    schemaVersion: 'vextreme.score-semantic-candidate/v1',
    sourceLineageRef,
    sourceThreadRef,
    sourceConversationHeadSha256,
    sourceBindings,
    semanticSubjectRef,
    subjectScopeRef,
    semanticSubjectFingerprint: stableSemanticSubjectFingerprint(fingerprintInput),
    proposedSummary,
    proposedSummarySha256: semanticHash(proposedSummary),
    proposedMemoryRelation,
    proposedStatementState,
    proposerRef,
    proposerClass,
    formedAt,
    privacyClass: 'DEVICE_PRIVATE',
    accepted: false
  };
  const candidateRef = contentAddressedRef('score-semantic-candidate', preRefCore);
  const core = { ...preRefCore, candidateRef };
  return Object.freeze({ ...core, candidateSha256: semanticHash(core) });
}

function assertClassificationEvidence(value, candidate) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SCORE_CLASSIFICATION_EVIDENCE_INVALID', 'classification evidence is missing');
  expectedRefAndHash(value, 'classificationEvidenceRef', 'classificationEvidenceSha256', 'score-classification-evidence', 'SCORE_CLASSIFICATION_EVIDENCE_INVALID');
  if (value.schemaVersion !== 'vextreme.score-classification-evidence/v1' ||
      value.candidateRef !== candidate.candidateRef || value.candidateSha256 !== candidate.candidateSha256 ||
      value.semanticSubjectRef !== candidate.semanticSubjectRef || value.semanticSubjectFingerprint !== candidate.semanticSubjectFingerprint ||
      !SCORE_CONTEXT_CLASSIFICATION_EVIDENCE_CLASSES.includes(value.evidenceClass) ||
      !SCORE_CONTEXT_MEMORY_RELATIONS.includes(value.assertedMemoryRelation) ||
      !SCORE_CONTEXT_STATEMENT_STATES.includes(value.assertedStatementState) ||
      !SHA256.test(value.assertedSummarySha256 ?? '') ||
      !['NONE', 'CORRECTS', 'SUPERSEDES', 'RELEASES_OR_TOMBSTONES'].includes(value.transitionKind) ||
      typeof value.issuerRef !== 'string' || value.issuerRef.length === 0 ||
      typeof value.issuerClass !== 'string' || value.issuerClass.length === 0 ||
      value.ownerProjectRef !== 'project.multivex.memory' ||
      value.ownerDispositionRef !== SCORE_CONTEXT_MEMORY_EXECUTABLE_ADDENDUM ||
      typeof value.purposeRef !== 'string' || value.purposeRef.length === 0 ||
      value.privacyClass !== 'DEVICE_PRIVATE' || !Array.isArray(value.sourceEvidenceBindings) || value.sourceEvidenceBindings.length === 0) {
    fail('SCORE_CLASSIFICATION_EVIDENCE_INVALID', 'classification evidence failed exact owner-contract validation');
  }
  canonicalTimestamp(value.formedAt, 'classification evidence formedAt');
  value.sourceEvidenceBindings.forEach((binding, index) => assertShaBinding(binding, `sourceEvidenceBindings[${index}]`, 'SCORE_CLASSIFICATION_EVIDENCE_INVALID'));
  if (value.transitionKind === 'NONE') {
    if (value.transitionTargetRef !== null || value.transitionTargetAcceptanceSha256 !== null ||
        ['CORRECTION_ACCEPTANCE', 'SUPERSESSION_ACCEPTANCE', 'RELEASE_TOMBSTONE_AUTHORITY'].includes(value.evidenceClass)) {
      fail('SCORE_CLASSIFICATION_EVIDENCE_INVALID', 'non-transition classification evidence carries transition authority');
    }
  } else {
    safeRef(value.transitionTargetRef, 'transitionTargetRef', 'SCORE_CLASSIFICATION_EVIDENCE_INVALID');
    if (!SHA256.test(value.transitionTargetAcceptanceSha256 ?? '')) fail('SCORE_CLASSIFICATION_EVIDENCE_INVALID', 'transition evidence lacks exact predecessor acceptance SHA');
    const expectedClass = value.transitionKind === 'CORRECTS' ? 'CORRECTION_ACCEPTANCE'
      : value.transitionKind === 'SUPERSEDES' ? 'SUPERSESSION_ACCEPTANCE' : 'RELEASE_TOMBSTONE_AUTHORITY';
    if (value.evidenceClass !== expectedClass) fail('SCORE_CLASSIFICATION_EVIDENCE_INVALID', 'transition evidence class does not match transition kind');
  }
  if (value.evidenceClass === 'HUMAN_CONFIRMATION') {
    const confirmation = value.humanConfirmation;
    if (!confirmation || typeof confirmation !== 'object' || Array.isArray(confirmation) ||
        typeof confirmation.humanSubjectRef !== 'string' || confirmation.humanSubjectRef.length === 0 ||
        typeof confirmation.confirmationDispositionRef !== 'string' || confirmation.confirmationDispositionRef.length === 0 ||
        !SHA256.test(confirmation.confirmationDispositionSha256 ?? '') ||
        confirmation.confirmedCandidateRef !== candidate.candidateRef || confirmation.confirmedCandidateSha256 !== candidate.candidateSha256 ||
        confirmation.confirmedSemanticSubjectFingerprint !== candidate.semanticSubjectFingerprint ||
        confirmation.confirmedSummarySha256 !== value.assertedSummarySha256) {
      fail('SCORE_CLASSIFICATION_EVIDENCE_INVALID', 'HUMAN_CONFIRMATION is not exact to this candidate/subject/summary');
    }
    canonicalTimestamp(confirmation.confirmedAt, 'human confirmation confirmedAt');
  }
  return value;
}

function assertConsentDisposition(value, candidate) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SCORE_CONSENT_INVALID', 'consent disposition is missing');
  expectedRefAndHash(value, 'consentDispositionRef', 'consentDispositionSha256', 'score-consent-disposition', 'SCORE_CONSENT_INVALID');
  if (value.schemaVersion !== 'vextreme.score-consent-disposition/v1' ||
      value.candidateRef !== candidate.candidateRef || value.candidateSha256 !== candidate.candidateSha256 ||
      value.semanticSubjectRef !== candidate.semanticSubjectRef || value.semanticSubjectFingerprint !== candidate.semanticSubjectFingerprint ||
      typeof value.purposeRef !== 'string' || value.purposeRef.length === 0 || value.privacyClass !== 'DEVICE_PRIVATE' ||
      !SCORE_CONTEXT_CONSENT_DISPOSITIONS.includes(value.disposition) ||
      !Array.isArray(value.requiredAuthorityBindings) || !Array.isArray(value.observedAuthorityBindings) ||
      !Array.isArray(value.implicatedSubjectRefs) ||
      !Array.isArray(value.permittedUseRefs) || !Array.isArray(value.prohibitedUseRefs) ||
      typeof value.retentionBoundaryRef !== 'string' || value.retentionBoundaryRef.length === 0 ||
      typeof value.redisclosureBoundaryRef !== 'string' || value.redisclosureBoundaryRef.length === 0 ||
      typeof value.firstPersonBoundaryRef !== 'string' || value.firstPersonBoundaryRef.length === 0 ||
      typeof value.issuerRef !== 'string' || value.issuerRef.length === 0 || typeof value.issuerClass !== 'string' || value.issuerClass.length === 0 ||
      value.ownerProjectRef !== 'project.multivex.safety' || value.ownerDispositionRef !== SCORE_CONTEXT_SAFETY_EXECUTABLE_ADDENDUM ||
      !Array.isArray(value.sourceEvidenceBindings)) {
    fail('SCORE_CONSENT_INVALID', 'consent disposition failed exact Safety-owner contract validation');
  }

  assertIntrinsicChronology(value.formedAt, value.expiresAt, 'consent disposition');
  const implicatedSubjects = uniqueCanonicalStrings(value.implicatedSubjectRefs, 'implicatedSubjectRefs', { nonempty: true });
  const implicatedSubjectSet = new Set(implicatedSubjects);
  const positiveConsent = ['PERMITTED', 'NARROWED'].includes(value.disposition);
  const permittedUses = uniqueCanonicalStrings(value.permittedUseRefs, 'permittedUseRefs', { nonempty: positiveConsent });
  const prohibitedUses = uniqueCanonicalStrings(value.prohibitedUseRefs, 'prohibitedUseRefs');
  if (positiveConsent && permittedUses.some((useRef) => prohibitedUses.includes(useRef))) {
    fail('SCORE_CONSENT_INVALID', 'positive consent has a use that is both permitted and prohibited');
  }

  const expectedScopeFingerprint = consentAuthorityScopeFingerprint(value);
  value.requiredAuthorityBindings.forEach((binding, index) => {
    assertAuthorityBinding(binding, `requiredAuthorityBindings[${index}]`);
    if (!implicatedSubjectSet.has(binding.subjectRef)) {
      fail('SCORE_CONSENT_INVALID', 'required authority subject is not an implicated subject', { subjectRef: binding.subjectRef });
    }
    if (binding.purposeRef !== value.purposeRef) {
      fail('SCORE_CONSENT_INVALID', 'required authority purpose differs from consent purpose');
    }
    if (binding.scopeFingerprint !== expectedScopeFingerprint) {
      fail('SCORE_CONSENT_INVALID', 'required authority scope differs from canonical consent scope');
    }
  });
  value.observedAuthorityBindings.forEach((binding, index) => {
    assertAuthorityBinding(binding, `observedAuthorityBindings[${index}]`);
    if (!implicatedSubjectSet.has(binding.subjectRef)) {
      fail('SCORE_CONSENT_INVALID', 'observed authority subject is not an implicated subject', { subjectRef: binding.subjectRef });
    }
    if (binding.purposeRef !== value.purposeRef) {
      fail('SCORE_CONSENT_INVALID', 'observed authority purpose differs from consent purpose');
    }
    if (binding.scopeFingerprint !== expectedScopeFingerprint) {
      fail('SCORE_CONSENT_INVALID', 'observed authority scope differs from canonical consent scope');
    }
  });
  value.sourceEvidenceBindings.forEach((binding, index) => assertShaBinding(binding, `consent sourceEvidenceBindings[${index}]`, 'SCORE_CONSENT_INVALID'));

  if (positiveConsent) {
    if (value.requiredAuthorityBindings.length === 0) fail('SCORE_CONSENT_INVALID', 'positive consent lacks required authority set');
    const positive = new Set(['PERMITTED', 'NARROWED']);
    if (value.requiredAuthorityBindings.some((binding) => !positive.has(binding.disposition)) ||
        value.observedAuthorityBindings.some((binding) => !positive.has(binding.disposition))) {
      fail('SCORE_CONSENT_INVALID', 'positive consent contains non-positive authority disposition');
    }
    const observed = new Set(value.observedAuthorityBindings.map((binding) =>
      `${binding.authorityRef}:${binding.authoritySha256}:${binding.subjectRef}:${binding.purposeRef}:${binding.scopeFingerprint}:${binding.disposition}`));
    for (const required of value.requiredAuthorityBindings) {
      const key = `${required.authorityRef}:${required.authoritySha256}:${required.subjectRef}:${required.purposeRef}:${required.scopeFingerprint}:${required.disposition}`;
      if (!observed.has(key)) fail('SCORE_CONSENT_INVALID', 'positive consent does not contain every exact required authority binding');
    }
  }
  return value;
}

function expectedEvidenceClassForState(statementState) {
  return {
    OBSERVED: 'STRUCTURAL_OBSERVATION',
    HUMAN_CONFIRMED: 'HUMAN_CONFIRMATION',
    INFERRED: 'LINEAGE_INFERENCE',
    CONFLICTED: 'CONFLICT_PRESERVATION',
    UNKNOWN: 'UNKNOWN_HOLD',
    RELEASED_OR_TOMBSTONED: 'RELEASE_TOMBSTONE_AUTHORITY'
  }[statementState] ?? null;
}

function assertSemanticAcceptance(value, candidate, evidence, consent) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SCORE_SEMANTIC_ACCEPTANCE_INVALID', 'semantic acceptance is missing');
  expectedRefAndHash(value, 'acceptanceRef', 'acceptanceSha256', 'score-semantic-acceptance', 'SCORE_SEMANTIC_ACCEPTANCE_INVALID');
  if (value.schemaVersion !== 'vextreme.score-semantic-acceptance/v1' || value.contractRef !== SCORE_CONTEXT_LIVE_SEMANTIC_CONTRACT ||
      value.semanticContractDispositionRef !== SCORE_CONTEXT_LIVE_SEMANTIC_DISPOSITION ||
      value.semanticExecutableAddendumRef !== SCORE_CONTEXT_LIVE_SEMANTIC_EXECUTABLE_ADDENDUM ||
      value.candidateRef !== candidate.candidateRef || value.candidateSha256 !== candidate.candidateSha256 ||
      value.sourceLineageRef !== candidate.sourceLineageRef || value.sourceThreadRef !== candidate.sourceThreadRef ||
      value.sourceConversationHeadSha256 !== candidate.sourceConversationHeadSha256 ||
      value.semanticSubjectRef !== candidate.semanticSubjectRef || value.semanticSubjectFingerprint !== candidate.semanticSubjectFingerprint ||
      typeof value.acceptedSummary !== 'string' || value.acceptedSummary.length === 0 || semanticHash(value.acceptedSummary) !== value.acceptedSummarySha256 ||
      !SCORE_CONTEXT_MEMORY_RELATIONS.includes(value.memoryRelation) || !SCORE_CONTEXT_STATEMENT_STATES.includes(value.statementState) ||
      typeof value.acceptedForContinuity !== 'boolean' ||
      !['NONE', 'CORRECTS', 'SUPERSEDES', 'RELEASES_OR_TOMBSTONES'].includes(value.transitionKind) ||
      value.consentDispositionRef !== consent.consentDispositionRef || value.consentDispositionSha256 !== consent.consentDispositionSha256 ||
      !Array.isArray(value.classificationEvidenceBindings) || value.classificationEvidenceBindings.length !== evidence.length ||
      typeof value.issuerRef !== 'string' || value.issuerRef.length === 0 || typeof value.issuerClass !== 'string' || value.issuerClass.length === 0 ||
      value.ownerDispositionRef !== SCORE_CONTEXT_LIVE_SEMANTIC_EXECUTABLE_ADDENDUM || value.privacyClass !== 'DEVICE_PRIVATE') {
    fail('SCORE_SEMANTIC_ACCEPTANCE_INVALID', 'semantic acceptance failed exact shared-contract validation');
  }
  canonicalTimestamp(value.formedAt, 'semantic acceptance formedAt');
  if (JSON.stringify(value.sourceBindingHashes) !== JSON.stringify(candidate.sourceBindings.map((binding) => binding.eventHash))) {
    fail('SCORE_SEMANTIC_ACCEPTANCE_INVALID', 'acceptance source binding hashes differ from exact candidate source');
  }
  const expectedBindings = evidence.map((item) => ({
    classificationEvidenceRef: item.classificationEvidenceRef,
    classificationEvidenceSha256: item.classificationEvidenceSha256
  }));
  if (JSON.stringify(value.classificationEvidenceBindings) !== JSON.stringify(expectedBindings)) {
    fail('SCORE_SEMANTIC_ACCEPTANCE_INVALID', 'acceptance classification evidence bindings are substituted');
  }
  const expectedClass = expectedEvidenceClassForState(value.statementState);
  const semanticEvidence = evidence.filter((item) => item.evidenceClass === expectedClass && item.transitionKind === 'NONE');
  if (!expectedClass || semanticEvidence.length === 0 || !evidence.every((item) =>
      item.assertedMemoryRelation === value.memoryRelation && item.assertedStatementState === value.statementState &&
      item.assertedSummarySha256 === value.acceptedSummarySha256)) {
    fail('SCORE_SEMANTIC_ACCEPTANCE_INVALID', 'acceptance semantic fields are not exactly authorized by classification evidence');
  }
  if (value.transitionKind === 'NONE') {
    if (value.transitionTargetRef !== null || value.transitionTargetAcceptanceSha256 !== null ||
        evidence.some((item) => item.transitionKind !== 'NONE')) {
      fail('SCORE_SEMANTIC_ACCEPTANCE_INVALID', 'non-transition acceptance carries predecessor authority');
    }
  } else {
    const transitionClass = value.transitionKind === 'CORRECTS' ? 'CORRECTION_ACCEPTANCE'
      : value.transitionKind === 'SUPERSEDES' ? 'SUPERSESSION_ACCEPTANCE' : 'RELEASE_TOMBSTONE_AUTHORITY';
    const transitionEvidence = evidence.filter((item) => item.evidenceClass === transitionClass && item.transitionKind === value.transitionKind);
    if (!value.transitionTargetRef || !SHA256.test(value.transitionTargetAcceptanceSha256 ?? '') || transitionEvidence.length === 0 ||
        !transitionEvidence.every((item) => item.transitionTargetRef === value.transitionTargetRef &&
          item.transitionTargetAcceptanceSha256 === value.transitionTargetAcceptanceSha256)) {
      fail('SCORE_SEMANTIC_ACCEPTANCE_INVALID', 'transition acceptance does not bind exact predecessor authority');
    }
  }
  if (value.acceptedForContinuity) {
    if (!['PERMITTED', 'NARROWED'].includes(consent.disposition) ||
        !consent.permittedUseRefs.includes('use.score.device-private-continuity') ||
        consent.prohibitedUseRefs.includes('use.score.device-private-continuity')) {
      fail('SCORE_CONSENT_INVALID', 'acceptedForContinuity lacks exact current positive continuity consent');
    }
  }
  return value;
}

function assertSemanticAuthorityHead(value, identity, threadRef) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SCORE_SEMANTIC_AUTHORITY_INVALID', 'semantic authority head is missing');
  expectedRefAndHash(value, 'semanticAuthorityHeadRef', 'semanticAuthorityHeadSha256', 'score-semantic-authority-head', 'SCORE_SEMANTIC_AUTHORITY_INVALID');
  if (value.schemaVersion !== 'vextreme.score-semantic-authority-head/v1' || value.contractRef !== SCORE_CONTEXT_LIVE_SEMANTIC_CONTRACT ||
      value.semanticExecutableAddendumRef !== SCORE_CONTEXT_LIVE_SEMANTIC_EXECUTABLE_ADDENDUM ||
      value.sourceLineageRef !== identity.companionLineageRef || value.sourceThreadRef !== threadRef ||
      !Number.isSafeInteger(value.sequence) || value.sequence < 0 ||
      (value.sequence === 0 ? value.priorSemanticAuthorityHeadSha256 !== null : !SHA256.test(value.priorSemanticAuthorityHeadSha256 ?? '')) ||
      !Array.isArray(value.currentAcceptanceBindings) ||
      JSON.stringify(value.ownerRefs) !== JSON.stringify(['project.multivex.memory', 'project.multivex.safety'])) {
    fail('SCORE_SEMANTIC_AUTHORITY_INVALID', 'semantic authority head failed exact shared-contract validation');
  }
  canonicalTimestamp(value.formedAt, 'semantic authority head formedAt');
  const seenSubjects = new Set();
  for (const binding of value.currentAcceptanceBindings) {
    if (!binding || typeof binding !== 'object' || Array.isArray(binding) || !SHA256.test(binding.semanticSubjectFingerprint ?? '') ||
        typeof binding.acceptanceRef !== 'string' || binding.acceptanceRef.length === 0 || !SHA256.test(binding.acceptanceSha256 ?? '') ||
        typeof binding.candidateRef !== 'string' || binding.candidateRef.length === 0 || !SHA256.test(binding.candidateSha256 ?? '') ||
        !Array.isArray(binding.classificationEvidenceBindings) || binding.classificationEvidenceBindings.length === 0 ||
        typeof binding.consentDispositionRef !== 'string' || binding.consentDispositionRef.length === 0 || !SHA256.test(binding.consentDispositionSha256 ?? '')) {
      fail('SCORE_SEMANTIC_AUTHORITY_INVALID', 'semantic authority head contains malformed acceptance binding');
    }
    if (seenSubjects.has(binding.semanticSubjectFingerprint)) fail('SCORE_SEMANTIC_AUTHORITY_INVALID', 'semantic authority head contains duplicate current semantic subject');
    seenSubjects.add(binding.semanticSubjectFingerprint);
    for (const evidenceBinding of binding.classificationEvidenceBindings) {
      if (!evidenceBinding || typeof evidenceBinding.classificationEvidenceRef !== 'string' || evidenceBinding.classificationEvidenceRef.length === 0 ||
          !SHA256.test(evidenceBinding.classificationEvidenceSha256 ?? '')) {
        fail('SCORE_SEMANTIC_AUTHORITY_INVALID', 'semantic authority head evidence binding is malformed');
      }
    }
  }
  return value;
}

function readAddressedJson(directory, sha256, code, label) {
  if (!SHA256.test(sha256 ?? '')) fail(code, `${label} SHA-256 is invalid`);
  const file = path.join(directory, `${sha256}.json`);
  if (!fs.existsSync(file)) fail(code, `${label} is missing from canonical semantic-authority domain`, { sha256 });
  if (fs.lstatSync(file).isSymbolicLink() || !fs.lstatSync(file).isFile()) fail(code, `${label} path is not one regular canonical file`, { file });
  return readJson(file, code, label);
}

function loadSemanticAuthorityHead(identity, threadRef, headSha256 = null, requireCurrent = false) {
  const paths = semanticAuthorityPaths(identity.homeRoot, identity.companionLineageRef, threadRef);
  let head;
  if (headSha256 === null) {
    if (!fs.existsSync(paths.head)) fail('SCORE_SEMANTIC_AUTHORITY_INVALID', 'current semantic authority head is missing');
    head = assertSemanticAuthorityHead(readJson(paths.head, 'SCORE_SEMANTIC_AUTHORITY_INVALID', 'current semantic authority head'), identity, threadRef);
    headSha256 = head.semanticAuthorityHeadSha256;
  } else {
    head = assertSemanticAuthorityHead(readAddressedJson(paths.heads, headSha256, 'SCORE_SEMANTIC_AUTHORITY_INVALID', 'historical semantic authority head'), identity, threadRef);
  }
  const immutable = assertSemanticAuthorityHead(readAddressedJson(paths.heads, head.semanticAuthorityHeadSha256, 'SCORE_SEMANTIC_AUTHORITY_INVALID', 'immutable semantic authority head'), identity, threadRef);
  if (semanticHash(immutable) !== semanticHash(head)) fail('SCORE_SEMANTIC_AUTHORITY_INVALID', 'current/historical semantic authority head lacks exact immutable receipt');
  if (requireCurrent) {
    const current = assertSemanticAuthorityHead(readJson(paths.head, 'SCORE_SEMANTIC_AUTHORITY_INVALID', 'current semantic authority head'), identity, threadRef);
    if (current.semanticAuthorityHeadSha256 !== head.semanticAuthorityHeadSha256) {
      fail('SCORE_SEMANTIC_AUTHORITY_STALE', 'semantic acceptance authority is not current for a new Score append', {
        requestedHeadSha256: head.semanticAuthorityHeadSha256,
        currentHeadSha256: current.semanticAuthorityHeadSha256
      });
    }
  }
  const visited = new Set();
  let cursor = head;
  while (cursor) {
    if (visited.has(cursor.semanticAuthorityHeadSha256)) fail('SCORE_SEMANTIC_AUTHORITY_INVALID', 'semantic authority head lineage contains a cycle');
    visited.add(cursor.semanticAuthorityHeadSha256);
    if (cursor.sequence === 0) {
      if (cursor.priorSemanticAuthorityHeadSha256 !== null) fail('SCORE_SEMANTIC_AUTHORITY_INVALID', 'semantic authority genesis head has a prior head');
      break;
    }
    const prior = assertSemanticAuthorityHead(readAddressedJson(paths.heads, cursor.priorSemanticAuthorityHeadSha256, 'SCORE_SEMANTIC_AUTHORITY_INVALID', 'prior semantic authority head'), identity, threadRef);
    if (prior.sequence !== cursor.sequence - 1) fail('SCORE_SEMANTIC_AUTHORITY_INVALID', 'semantic authority head sequence is not contiguous');
    cursor = prior;
  }
  return { head, paths };
}

function resolveSemanticAcceptance(identity, threadRef, acceptanceRef, acceptanceSha256, options = {}) {
  const authority = loadSemanticAuthorityHead(identity, threadRef, options.semanticAuthorityHeadSha256 ?? null, options.requireCurrent === true);
  const binding = authority.head.currentAcceptanceBindings.find((item) =>
    item.acceptanceRef === acceptanceRef && item.acceptanceSha256 === acceptanceSha256);
  if (!binding) {
    fail(options.requireCurrent ? 'SCORE_SEMANTIC_AUTHORITY_STALE' : 'SCORE_SEMANTIC_AUTHORITY_INVALID',
      'semantic acceptance is not a member of the required semantic authority head', {
        acceptanceRef, acceptanceSha256, semanticAuthorityHeadSha256: authority.head.semanticAuthorityHeadSha256
      });
  }
  const candidate = assertSemanticCandidate(
    readAddressedJson(authority.paths.candidates, binding.candidateSha256, 'SCORE_SEMANTIC_CANDIDATE_INVALID', 'semantic candidate'),
    identity, threadRef
  );
  if (candidate.candidateRef !== binding.candidateRef) fail('SCORE_SEMANTIC_AUTHORITY_MISMATCH', 'authority head candidate ref/sha binding mismatch');
  const evidence = binding.classificationEvidenceBindings.map((evidenceBinding) => {
    const item = assertClassificationEvidence(
      readAddressedJson(authority.paths.classificationEvidence, evidenceBinding.classificationEvidenceSha256,
        'SCORE_CLASSIFICATION_EVIDENCE_INVALID', 'classification evidence'), candidate);
    if (item.classificationEvidenceRef !== evidenceBinding.classificationEvidenceRef) {
      fail('SCORE_SEMANTIC_AUTHORITY_MISMATCH', 'authority head classification evidence ref/sha binding mismatch');
    }
    return item;
  });
  const consent = assertConsentDisposition(
    readAddressedJson(authority.paths.consents, binding.consentDispositionSha256, 'SCORE_CONSENT_INVALID', 'Score consent disposition'), candidate
  );
  if (consent.consentDispositionRef !== binding.consentDispositionRef) fail('SCORE_SEMANTIC_AUTHORITY_MISMATCH', 'authority head consent ref/sha binding mismatch');
  const acceptance = assertSemanticAcceptance(
    readAddressedJson(authority.paths.acceptances, binding.acceptanceSha256, 'SCORE_SEMANTIC_ACCEPTANCE_INVALID', 'semantic acceptance'),
    candidate, evidence, consent
  );
  if (acceptance.acceptanceRef !== binding.acceptanceRef || acceptance.semanticSubjectFingerprint !== binding.semanticSubjectFingerprint) {
    fail('SCORE_SEMANTIC_AUTHORITY_MISMATCH', 'authority head acceptance binding does not match exact accepted bytes');
  }
  return { ...authority, binding, candidate, evidence, consent, acceptance };
}

function validateSourceBindingAgainstCommittedG01(binding, committed) {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding) || !SHA256.test(binding.eventHash ?? '') ||
      !SHA256.test(binding.contentHash ?? '') || !Number.isSafeInteger(binding.sequence) || binding.sequence < 0 ||
      typeof binding.eventRef !== 'string' || binding.eventRef.length === 0 ||
      !['REQUEST', 'RESPONSE'].includes(binding.eventKind) || typeof binding.turnRef !== 'string' || binding.turnRef.length === 0 ||
      typeof binding.messageRef !== 'string' || binding.messageRef.length === 0) {
    fail('SCORE_SOURCE_INVALID', 'stored G01 source binding is malformed');
  }
  const observed = committed.byHash.get(binding.eventHash);
  if (!observed || JSON.stringify(sourceBindingFromEvent(observed)) !== JSON.stringify(binding)) {
    fail('SCORE_SOURCE_INVALID', 'stored G01 source binding is absent or substituted from the committed chain', { eventHash: binding.eventHash });
  }
  return observed;
}

function sourceBindings(sourceEvents, identity, threadRef, expectedConversationHeadSha256) {
  if (!Array.isArray(sourceEvents) || sourceEvents.length === 0 || sourceEvents.length % 2 !== 0) {
    fail('SCORE_SOURCE_INVALID', 'G02 source intake requires one or more complete committed G01 request/response pairs');
  }
  const committed = validateCommittedG01Conversation(identity, threadRef);
  if (committed.head.conversationHeadSha256 !== expectedConversationHeadSha256) {
    fail('SCORE_SOURCE_INVALID', 'supplied G01 source head is not the exact current committed conversation head', {
      expected: expectedConversationHeadSha256, observed: committed.head.conversationHeadSha256
    });
  }
  const seen = new Set();
  const exact = sourceEvents.map((supplied) => {
    assertG01SourceEvent(supplied, identity, threadRef);
    const observed = committed.byHash.get(supplied.eventHash);
    if (!observed || semanticHash(observed) !== semanticHash(supplied) || observed.eventRef !== supplied.eventRef) {
      fail('SCORE_SOURCE_INVALID', 'caller-supplied G01 source is not the exact committed on-disk event', { eventRef: supplied.eventRef });
    }
    if (seen.has(observed.eventHash)) fail('SCORE_SOURCE_INVALID', 'duplicate G01 source event binding');
    seen.add(observed.eventHash);
    return observed;
  }).sort((a, b) => a.sequence - b.sequence || a.eventHash.localeCompare(b.eventHash));
  for (let index = 0; index < exact.length; index += 2) {
    const request = exact[index];
    const response = exact[index + 1];
    if (request.eventKind !== 'REQUEST' || response.eventKind !== 'RESPONSE' || response.sequence !== request.sequence + 1 ||
        response.priorEventHash !== request.eventHash || response.turnRef !== request.turnRef || response.instanceRef !== request.instanceRef) {
      fail('SCORE_SOURCE_INVALID', 'selected G01 source range is not composed of exact complete committed turns');
    }
  }
  return { bindings: exact.map(sourceBindingFromEvent), sourceEvents: exact, committed };
}

function validateStoredSourceBindings(bindings, committed) {
  if (!Array.isArray(bindings) || bindings.length === 0) fail('SCORE_SOURCE_INVALID', 'Score event lacks committed G01 source bindings');
  return bindings.map((binding) => validateSourceBindingAgainstCommittedG01(binding, committed));
}

function validateScoreEventSourceAgainstCommittedG01(event, committed, identity, threadRef) {
  const observed = validateStoredSourceBindings(event.sourceBindings, committed);
  const expectedObservation = formSharedSourceObservation(
    observed, event.sourceBindings, identity, threadRef, event.instanceRef, event.formedAt
  );
  if (event.continuityObservation?.observationRef !== expectedObservation.observationRef ||
      event.continuityObservation?.semanticFingerprint !== expectedObservation.semanticFingerprint ||
      semanticHash(event.continuityObservation) !== semanticHash(expectedObservation)) {
    fail('SCORE_SOURCE_INVALID', 'Score event continuity observation does not exactly match committed G01 source bindings', {
      scoreEventRef: event.scoreEventRef
    });
  }
  return observed;
}

function formSharedSourceObservation(sourceEvents, bindings, identity, threadRef, instanceRef, formedAt) {
  const observation = createContinuityObservation({
    observationType: 'CONVERSATION_EPISODE_RANGE',
    sourceLineageRef: identity.companionLineageRef,
    sourceBindings: bindings.map((binding) => ({
      sourceLineageRef: identity.companionLineageRef,
      rangeRef: binding.eventRef,
      sourceHash: binding.eventHash
    })),
    sourceSpeakerRefs: [...new Set(sourceEvents.map((event) => event.speakerRef))],
    sourceRecipientRefs: [...new Set(sourceEvents.flatMap((event) => event.recipientRefs))],
    threadRef,
    formedByRef: instanceRef,
    formedAt,
    currentness: 'CURRENT',
    visibility: 'PRIVATE'
  });
  validateContinuityObservation(observation);
  return observation;
}

function eventFile(paths, sequence, hash) {
  return path.join(paths.events, `${String(sequence).padStart(8, '0')}-${hash}.json`);
}

function assertScoreEvent(value, identity, threadRef, fileName = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SCORE_EVENT_CORRUPT', 'Score event is invalid');
  const { scoreEventHash, ...core } = value;
  const expectedFile = SHA256.test(scoreEventHash ?? '') && Number.isSafeInteger(value.sequence)
    ? `${String(value.sequence).padStart(8, '0')}-${scoreEventHash}.json` : null;
  if (value.schemaVersion !== 'vexlife.score-context-event/v1' || !SHA256.test(scoreEventHash ?? '') ||
      semanticHash(core) !== scoreEventHash || value.homeRef !== identity.homeRef || value.deviceRef !== identity.deviceRef ||
      value.companionLineageRef !== identity.companionLineageRef || value.threadRef !== threadRef ||
      value.sharedSemanticDispositionRef !== SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION ||
      !Number.isSafeInteger(value.sequence) || value.sequence < 0 ||
      (value.priorScoreEventHash !== null && !SHA256.test(value.priorScoreEventHash ?? '')) ||
      !SHA256.test(value.sourceConversationHeadSha256 ?? '') ||
      !Array.isArray(value.sourceBindings) || value.sourceBindings.length === 0 || value.privacyClass !== 'DEVICE_PRIVATE' ||
      value.rawSourceContentIncluded !== false || (fileName !== null && fileName !== expectedFile)) {
    fail('SCORE_EVENT_CORRUPT', 'Score event content/address/identity is invalid', { fileName, expectedFile });
  }
  canonicalTimestamp(value.formedAt, 'score event formedAt');
  try {
    validateContinuityObservation(value.continuityObservation);
  } catch (error) {
    fail('SCORE_SOURCE_INVALID', 'Score event shared source observation is invalid', { cause: error.message });
  }
  if (value.continuityObservation.sourceLineageRef !== identity.companionLineageRef ||
      value.continuityObservation.threadRef !== threadRef) {
    fail('SCORE_SOURCE_INVALID', 'Score event shared source observation identity mismatch');
  }
  if (value.eventKind === 'STATEMENT') {
    safeRef(value.statementRef, 'statementRef', 'SCORE_EVENT_CORRUPT');
    safeRef(value.subjectRef, 'subjectRef', 'SCORE_EVENT_CORRUPT');
    if (!SCORE_CONTEXT_MEMORY_RELATIONS.includes(value.memoryRelation)) fail('MEMORY_RELATION_INVALID', 'unknown memoryRelation');
    if (!SCORE_CONTEXT_STATEMENT_STATES.includes(value.statementState)) fail('STATEMENT_STATE_INVALID', 'unknown statementState');
    if (typeof value.summary !== 'string' || value.summary.length === 0 || semanticHash(value.summary) !== value.summaryHash ||
        typeof value.acceptedForContinuity !== 'boolean' || !SCORE_CONTEXT_CONSENT_DISPOSITIONS.includes(value.consentState) ||
        !SHA256.test(value.semanticSubjectFingerprint ?? '') || !SHA256.test(value.semanticAuthorityHeadSha256 ?? '') ||
        typeof value.semanticAcceptanceRef !== 'string' || value.semanticAcceptanceRef.length === 0 || !SHA256.test(value.semanticAcceptanceSha256 ?? '') ||
        typeof value.semanticCandidateRef !== 'string' || value.semanticCandidateRef.length === 0 || !SHA256.test(value.semanticCandidateSha256 ?? '') ||
        !Array.isArray(value.classificationEvidenceBindings) || value.classificationEvidenceBindings.length === 0 ||
        typeof value.consentDispositionRef !== 'string' || value.consentDispositionRef.length === 0 || !SHA256.test(value.consentDispositionSha256 ?? '') ||
        value.liveSemanticContractRef !== SCORE_CONTEXT_LIVE_SEMANTIC_CONTRACT ||
        value.liveSemanticDispositionRef !== SCORE_CONTEXT_LIVE_SEMANTIC_DISPOSITION ||
        value.liveSemanticExecutableAddendumRef !== SCORE_CONTEXT_LIVE_SEMANTIC_EXECUTABLE_ADDENDUM ||
        !['NONE', 'CORRECTS', 'SUPERSEDES', 'RELEASES_OR_TOMBSTONES'].includes(value.transitionKind)) {
      fail('SCORE_EVENT_CORRUPT', 'statement semantic authority projection is malformed');
    }
    for (const binding of value.classificationEvidenceBindings) {
      if (!binding || typeof binding.classificationEvidenceRef !== 'string' || binding.classificationEvidenceRef.length === 0 ||
          !SHA256.test(binding.classificationEvidenceSha256 ?? '')) fail('SCORE_EVENT_CORRUPT', 'statement classification evidence binding is malformed');
    }
    if (value.transitionKind === 'NONE') {
      if (value.correctsStatementRef !== null || value.supersedesStatementRef !== null || value.transitionTargetAcceptanceSha256 !== null) {
        fail('SCORE_EVENT_CORRUPT', 'non-transition statement carries transition fields');
      }
    } else if (value.transitionKind === 'CORRECTS') {
      safeRef(value.correctsStatementRef, 'correctsStatementRef', 'SCORE_EVENT_CORRUPT');
      if (value.supersedesStatementRef !== null || !SHA256.test(value.transitionTargetAcceptanceSha256 ?? '')) fail('SCORE_EVENT_CORRUPT', 'correction event transition identity is malformed');
    } else if (value.transitionKind === 'SUPERSEDES') {
      safeRef(value.supersedesStatementRef, 'supersedesStatementRef', 'SCORE_EVENT_CORRUPT');
      if (value.correctsStatementRef !== null || !SHA256.test(value.transitionTargetAcceptanceSha256 ?? '')) fail('SCORE_EVENT_CORRUPT', 'supersession event transition identity is malformed');
    } else if (value.transitionKind === 'RELEASES_OR_TOMBSTONES') {
      safeRef(value.releasesOrTombstonesStatementRef, 'releasesOrTombstonesStatementRef', 'SCORE_EVENT_CORRUPT');
      if (value.correctsStatementRef !== null || value.supersedesStatementRef !== null || !SHA256.test(value.transitionTargetAcceptanceSha256 ?? '')) {
        fail('SCORE_EVENT_CORRUPT', 'release/tombstone event transition identity is malformed');
      }
    }
  } else if (value.eventKind === 'OPEN_LOOP') {
    safeRef(value.openLoopRef, 'openLoopRef', 'OPEN_LOOP_INVALID');
    if (value.openLoopState !== 'OPEN') fail('OPEN_LOOP_INVALID', 'G02 persists unresolved open loops only; source-managed resolution is not admitted');
    if (!Array.isArray(value.sourceStatementRefs) || value.sourceStatementRefs.length === 0) fail('OPEN_LOOP_INVALID', 'open loop requires source statement refs');
  } else fail('SCORE_EVENT_CORRUPT', 'unknown Score event kind');
  return value;
}

function validateScoreEventSemanticAuthority(event, identity, threadRef) {
  if (event.eventKind !== 'STATEMENT') return null;
  const resolved = resolveSemanticAcceptance(identity, threadRef, event.semanticAcceptanceRef, event.semanticAcceptanceSha256, {
    semanticAuthorityHeadSha256: event.semanticAuthorityHeadSha256,
    requireCurrent: false
  });
  const { candidate, acceptance, consent, evidence } = resolved;
  const expectedEvidenceBindings = evidence.map((item) => ({
    classificationEvidenceRef: item.classificationEvidenceRef,
    classificationEvidenceSha256: item.classificationEvidenceSha256
  }));
  const checks = [
    [event.semanticCandidateRef, candidate.candidateRef, 'candidateRef'],
    [event.semanticCandidateSha256, candidate.candidateSha256, 'candidateSha256'],
    [event.semanticSubjectFingerprint, candidate.semanticSubjectFingerprint, 'semanticSubjectFingerprint'],
    [event.subjectRef, acceptance.semanticSubjectRef, 'semanticSubjectRef'],
    [event.summary, acceptance.acceptedSummary, 'acceptedSummary'],
    [event.summaryHash, acceptance.acceptedSummarySha256, 'acceptedSummarySha256'],
    [event.memoryRelation, acceptance.memoryRelation, 'memoryRelation'],
    [event.statementState, acceptance.statementState, 'statementState'],
    [event.acceptedForContinuity, acceptance.acceptedForContinuity, 'acceptedForContinuity'],
    [event.consentState, consent.disposition, 'consentDisposition'],
    [event.consentDispositionRef, consent.consentDispositionRef, 'consentDispositionRef'],
    [event.consentDispositionSha256, consent.consentDispositionSha256, 'consentDispositionSha256'],
    [event.transitionKind, acceptance.transitionKind, 'transitionKind'],
    [event.transitionTargetAcceptanceSha256, acceptance.transitionTargetAcceptanceSha256, 'transitionTargetAcceptanceSha256'],
    [event.sourceConversationHeadSha256, candidate.sourceConversationHeadSha256, 'sourceConversationHeadSha256']
  ];
  for (const [observed, expected, field] of checks) {
    if (observed !== expected) fail('SCORE_SEMANTIC_AUTHORITY_MISMATCH', `stored Score ${field} differs from historical owner acceptance`, { observed, expected });
  }
  if (JSON.stringify(event.sourceBindings) !== JSON.stringify(candidate.sourceBindings) ||
      JSON.stringify(event.classificationEvidenceBindings) !== JSON.stringify(expectedEvidenceBindings)) {
    fail('SCORE_SEMANTIC_AUTHORITY_MISMATCH', 'stored Score source/evidence bindings differ from historical owner authority');
  }
  const expectedCorrects = acceptance.transitionKind === 'CORRECTS' ? acceptance.transitionTargetRef : null;
  const expectedSupersedes = acceptance.transitionKind === 'SUPERSEDES' ? acceptance.transitionTargetRef : null;
  const expectedRelease = acceptance.transitionKind === 'RELEASES_OR_TOMBSTONES' ? acceptance.transitionTargetRef : null;
  if (event.correctsStatementRef !== expectedCorrects || event.supersedesStatementRef !== expectedSupersedes ||
      event.releasesOrTombstonesStatementRef !== expectedRelease) {
    fail('SCORE_SEMANTIC_AUTHORITY_MISMATCH', 'stored Score transition target differs from historical owner acceptance');
  }
  return resolved;
}

function readAllEvents(paths, identity, threadRef) {
  if (!fs.existsSync(paths.events)) return { valid: [], invalid: [] };
  const stat = fs.lstatSync(paths.events);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('SCORE_EVENT_CORRUPT', 'Score events path must be a real directory');
  const valid = [];
  const invalid = [];
  for (const entry of fs.readdirSync(paths.events, { withFileTypes: true })) {
    if (!entry.isFile() || entry.isSymbolicLink?.()) { invalid.push({ file: entry.name, reason: 'NON_REGULAR_ENTRY' }); continue; }
    const file = path.join(paths.events, entry.name);
    try {
      const event = readJson(file, 'SCORE_EVENT_CORRUPT', 'Score event');
      assertScoreEvent(event, identity, threadRef, entry.name);
      valid.push(event);
    } catch (error) {
      invalid.push({ file: entry.name, reason: error.code ?? 'SCORE_EVENT_CORRUPT', message: error.message });
    }
  }
  return { valid, invalid };
}

function verifyHead(value, identity, threadRef) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SCORE_HEAD_MISMATCH', 'Score head is invalid');
  const { scoreHeadSha256, ...core } = value;
  if (value.schemaVersion !== 'vexlife.score-context-head/v1' || !SHA256.test(scoreHeadSha256 ?? '') || semanticHash(core) !== scoreHeadSha256 ||
      value.homeRef !== identity.homeRef || value.deviceRef !== identity.deviceRef ||
      value.companionLineageRef !== identity.companionLineageRef || value.threadRef !== threadRef ||
      !SHA256.test(value.eventHash ?? '') || !Number.isSafeInteger(value.sequence) || value.sequence < 0 ||
      (value.priorScoreHeadSha256 !== null && !SHA256.test(value.priorScoreHeadSha256 ?? '')) ||
      !SHA256.test(value.sourceConversationHeadSha256 ?? '') || !Array.isArray(value.currentStatementRefs) || !Array.isArray(value.openLoopRefs) ||
      value.sharedSemanticDispositionRef !== SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION ||
      value.liveSemanticContractRef !== SCORE_CONTEXT_LIVE_SEMANTIC_CONTRACT ||
      value.liveSemanticDispositionRef !== SCORE_CONTEXT_LIVE_SEMANTIC_DISPOSITION ||
      value.liveSemanticExecutableAddendumRef !== SCORE_CONTEXT_LIVE_SEMANTIC_EXECUTABLE_ADDENDUM) {
    fail('SCORE_HEAD_MISMATCH', 'Score head content/address/identity is invalid');
  }
  canonicalTimestamp(value.formedAt, 'Score head formedAt');
  return value;
}

function applyEvent(projection, event) {
  const statements = new Map(projection.statements.map((item) => [item.statementRef, item]));
  const openLoops = new Map(projection.openLoops.map((item) => [item.openLoopRef, item]));
  if (event.eventKind === 'STATEMENT') {
    if (statements.has(event.statementRef)) fail('SCORE_LINK_INVALID', 'statementRef is duplicated in Score history');
    if (event.correctsStatementRef && !statements.has(event.correctsStatementRef)) fail('SCORE_LINK_INVALID', 'correction target is absent');
    if (event.supersedesStatementRef && !statements.has(event.supersedesStatementRef)) fail('SCORE_LINK_INVALID', 'supersession target is absent');
    if (event.correctsStatementRef && event.supersedesStatementRef) fail('SCORE_LINK_INVALID', 'one statement cannot simultaneously correct and supersede distinct history');
    if (event.correctsStatementRef) {
      const prior = statements.get(event.correctsStatementRef);
      if (prior.current !== true || prior.semanticSubjectFingerprint !== event.semanticSubjectFingerprint ||
          prior.memoryRelation !== event.memoryRelation || prior.semanticAcceptanceSha256 !== event.transitionTargetAcceptanceSha256) {
        fail('SCORE_LINK_INVALID', 'correction must bind exact current semantic subject, relation domain and predecessor acceptance');
      }
      statements.set(prior.statementRef, { ...prior, effectiveState: 'CORRECTED', current: false, correctedByRef: event.statementRef });
    }
    if (event.supersedesStatementRef) {
      const prior = statements.get(event.supersedesStatementRef);
      if (prior.current !== true || prior.semanticSubjectFingerprint !== event.semanticSubjectFingerprint ||
          prior.memoryRelation !== event.memoryRelation || prior.semanticAcceptanceSha256 !== event.transitionTargetAcceptanceSha256) {
        fail('SCORE_LINK_INVALID', 'supersession must bind exact current semantic subject, relation domain and predecessor acceptance');
      }
      statements.set(prior.statementRef, { ...prior, effectiveState: 'SUPERSEDED', current: false, supersededByRef: event.statementRef });
    }
    if (event.releasesOrTombstonesStatementRef) {
      const prior = statements.get(event.releasesOrTombstonesStatementRef);
      if (!prior || prior.current !== true || prior.semanticSubjectFingerprint !== event.semanticSubjectFingerprint ||
          prior.memoryRelation !== event.memoryRelation || prior.semanticAcceptanceSha256 !== event.transitionTargetAcceptanceSha256) {
        fail('SCORE_LINK_INVALID', 'release/tombstone must bind exact current semantic subject, relation domain and predecessor acceptance');
      }
      statements.set(prior.statementRef, { ...prior, effectiveState: 'RELEASED_OR_TOMBSTONED', current: false, releasedByRef: event.statementRef });
    }
    statements.set(event.statementRef, {
      statementRef: event.statementRef,
      subjectRef: event.subjectRef,
      semanticSubjectFingerprint: event.semanticSubjectFingerprint,
      companionLineageRef: event.companionLineageRef,
      threadRef: event.threadRef,
      memoryRelation: event.memoryRelation,
      recordedStatementState: event.statementState,
      effectiveState: event.statementState,
      summary: event.summary,
      summaryHash: event.summaryHash,
      sourceBindings: structuredClone(event.sourceBindings),
      acceptedForContinuity: event.acceptedForContinuity,
      consentState: event.consentState,
      semanticAuthorityHeadSha256: event.semanticAuthorityHeadSha256,
      semanticAcceptanceRef: event.semanticAcceptanceRef,
      semanticAcceptanceSha256: event.semanticAcceptanceSha256,
      semanticCandidateRef: event.semanticCandidateRef,
      semanticCandidateSha256: event.semanticCandidateSha256,
      classificationEvidenceBindings: structuredClone(event.classificationEvidenceBindings),
      consentDispositionRef: event.consentDispositionRef,
      consentDispositionSha256: event.consentDispositionSha256,
      eventRef: event.scoreEventRef,
      eventHash: event.scoreEventHash,
      current: !['SUPERSEDED', 'RELEASED_OR_TOMBSTONED'].includes(event.statementState)
    });
  } else {
    if (event.openLoopState !== 'OPEN') fail('OPEN_LOOP_INVALID', 'G02 open-loop resolution is held pending a source-managed resolution contract');
    if (openLoops.has(event.openLoopRef)) fail('OPEN_LOOP_INVALID', 'openLoopRef is duplicated in Score history');
    openLoops.set(event.openLoopRef, {
      openLoopRef: event.openLoopRef,
      summaryRef: event.summaryRef,
      sourceStatementRefs: [...event.sourceStatementRefs],
      sourceBindings: structuredClone(event.sourceBindings),
      eventRef: event.scoreEventRef,
      eventHash: event.scoreEventHash,
      state: 'OPEN'
    });
  }
  return { statements: [...statements.values()], openLoops: [...openLoops.values()] };
}

function replayChain(chain) {
  let projection = { statements: [], openLoops: [] };
  for (const event of chain) projection = applyEvent(projection, event);
  return projection;
}

function writerObservation(paths) {
  if (!fs.existsSync(paths.lock)) return { state: 'NONE' };
  try {
    const lease = JSON.parse(fs.readFileSync(paths.lock, 'utf8'));
    const { leaseSha256, ...core } = lease;
    if (!SHA256.test(leaseSha256 ?? '') || semanticHash(core) !== leaseSha256) return { state: 'UNVERIFIABLE' };
    return { state: processState(lease.pid), instanceRef: lease.instanceRef, pid: lease.pid, leaseSha256 };
  } catch { return { state: 'UNVERIFIABLE' }; }
}

export function loadScoreContextState({ home, homeRef, deviceRef, companionLineageRef, threadRef }) {
  const identity = loadIdentity(home, { homeRef, deviceRef, companionLineageRef });
  const thread = safeRef(threadRef, 'threadRef');
  const paths = scorePaths(identity.homeRoot, identity.companionLineageRef, thread);
  const { valid: allEvents, invalid } = readAllEvents(paths, identity, thread);
  const byHash = new Map(allEvents.map((event) => [event.scoreEventHash, event]));
  let head = null;
  let chain = [];
  if (fs.existsSync(paths.head)) {
    head = verifyHead(readJson(paths.head, 'SCORE_HEAD_MISMATCH', 'Score head'), identity, thread);
    const immutableHeadFile = homePath(identity.homeRoot, 'score', identity.companionLineageRef, thread, 'heads', `${head.scoreHeadSha256}.json`);
    if (!fs.existsSync(immutableHeadFile) || semanticHash(readJson(immutableHeadFile, 'SCORE_HEAD_MISMATCH', 'immutable Score head')) !== semanticHash(head)) {
      fail('SCORE_HEAD_MISMATCH', 'current Score head lacks exact immutable head receipt');
    }
    let cursor = head.eventHash;
    const visited = new Set();
    while (cursor) {
      if (visited.has(cursor)) fail('SCORE_EVENT_CORRUPT', 'Score event chain contains a cycle');
      visited.add(cursor);
      const event = byHash.get(cursor);
      if (!event) fail('SCORE_EVENT_CORRUPT', 'Score head references missing event', { eventHash: cursor });
      chain.push(event);
      cursor = event.priorScoreEventHash;
    }
    chain.reverse();
    if (chain.length !== head.sequence + 1 || chain.some((event, index) => event.sequence !== index || event.priorScoreEventHash !== (index ? chain[index - 1].scoreEventHash : null))) {
      fail('SCORE_EVENT_CORRUPT', 'committed Score chain is not contiguous from genesis');
    }
    if (chain.at(-1)?.scoreEventHash !== head.eventHash) fail('SCORE_HEAD_MISMATCH', 'Score head does not bind exact final event');
  }
  const committedG01 = allEvents.length ? validateCommittedG01Conversation(identity, thread) : null;
  for (const event of chain) {
    validateScoreEventSourceAgainstCommittedG01(event, committedG01, identity, thread);
    validateScoreEventSemanticAuthority(event, identity, thread);
  }
  const projection = replayChain(chain);
  const currentStatementRefs = projection.statements.filter((item) => item.current).map((item) => item.statementRef).sort();
  const openLoopRefs = projection.openLoops.filter((item) => item.state === 'OPEN').map((item) => item.openLoopRef).sort();
  if (head && (JSON.stringify(head.currentStatementRefs) !== JSON.stringify(currentStatementRefs) || JSON.stringify(head.openLoopRefs) !== JSON.stringify(openLoopRefs))) {
    fail('SCORE_HEAD_MISMATCH', 'Score head current-set projection differs from replay');
  }
  const reachable = new Set(chain.map((event) => event.scoreEventHash));
  const uncommittedTail = [];
  const attention = invalid.map((item) => ({ code: 'INVALID_TAIL', ...item }));
  const expectedTailSequence = head ? head.sequence + 1 : 0;
  const expectedTailPrior = head?.eventHash ?? null;
  for (const event of allEvents.filter((item) => !reachable.has(item.scoreEventHash))
    .sort((a, b) => a.sequence - b.sequence || a.scoreEventHash.localeCompare(b.scoreEventHash))) {
    try {
      validateScoreEventSourceAgainstCommittedG01(event, committedG01, identity, thread);
      validateScoreEventSemanticAuthority(event, identity, thread);
      if (event.sequence !== expectedTailSequence || event.priorScoreEventHash !== expectedTailPrior) {
        attention.push({ code: 'INVALID_TAIL', reason: 'REORDERED_OR_READRESSED_TAIL', eventRef: event.scoreEventRef, eventHash: event.scoreEventHash });
      } else {
        uncommittedTail.push(event);
      }
    } catch (error) {
      attention.push({ code: 'INVALID_TAIL', reason: error.code ?? 'SCORE_SOURCE_INVALID', eventRef: event.scoreEventRef, eventHash: event.scoreEventHash, message: error.message });
    }
  }
  let currentSemanticAuthorityHead = null;
  const semanticPaths = semanticAuthorityPaths(identity.homeRoot, identity.companionLineageRef, thread);
  if (fs.existsSync(semanticPaths.head)) {
    currentSemanticAuthorityHead = loadSemanticAuthorityHead(identity, thread).head;
  }
  const writer = writerObservation(paths);
  return {
    schemaVersion: 'vexlife.score-context-state/v1',
    state: attention.length ? 'ATTENTION' : 'CURRENT',
    currentness: attention.length ? 'ATTENTION' : 'CURRENT',
    identity,
    threadRef: thread,
    head,
    chain,
    statements: projection.statements,
    currentStatementRefs,
    openLoops: projection.openLoops,
    openLoopRefs,
    uncommittedTail,
    attention,
    writer,
    currentSemanticAuthorityHead,
    rawDurableEventEqualsCommittedCurrentScore: false,
    sharedSemanticDispositionRef: SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION,
    liveSemanticContractRef: SCORE_CONTEXT_LIVE_SEMANTIC_CONTRACT,
    liveSemanticDispositionRef: SCORE_CONTEXT_LIVE_SEMANTIC_DISPOSITION,
    liveSemanticExecutableAddendumRef: SCORE_CONTEXT_LIVE_SEMANTIC_EXECUTABLE_ADDENDUM
  };
}

function assertExpectedState(state, expectedScoreHeadSha256) {
  if (state.attention.length) fail('SCORE_TAIL_ATTENTION', 'invalid Score tail requires attention before mutation', { attention: state.attention });
  const observed = state.head?.scoreHeadSha256 ?? null;
  if (observed !== (expectedScoreHeadSha256 ?? null)) {
    fail('SCORE_HEAD_MISMATCH', 'expected current Score head does not match', { expected: expectedScoreHeadSha256 ?? null, observed });
  }
}

function commitEvent({ state, paths, eventCore, sourceConversationHeadSha256, faults = {} }) {
  // The eventRef is deterministically derived from the pre-ref semantic body; the final
  // scoreEventHash then binds that stable ref without a circular hash definition.
  const scoreEventRef = `score-event.${semanticHash(eventCore).slice(0, 32)}`;
  const finalCore = { ...eventCore, scoreEventRef };
  const event = { ...finalCore, scoreEventHash: semanticHash(finalCore) };
  fs.mkdirSync(paths.events, { recursive: true });
  writeExclusive(eventFile(paths, event.sequence, event.scoreEventHash), event);
  if (faults.exitAfterEventWrite === true) process.exit(91);
  if (faults.failAfterEventWrite === true) fail('SCORE_HEAD_MISMATCH', 'simulated failure after Score event durability before head advance');
  const projection = replayChain([...state.chain, event]);
  const headCore = {
    schemaVersion: 'vexlife.score-context-head/v1',
    homeRef: state.identity.homeRef,
    deviceRef: state.identity.deviceRef,
    companionLineageRef: state.identity.companionLineageRef,
    threadRef: state.threadRef,
    eventHash: event.scoreEventHash,
    sequence: event.sequence,
    currentStatementRefs: projection.statements.filter((item) => item.current).map((item) => item.statementRef).sort(),
    openLoopRefs: projection.openLoops.filter((item) => item.state === 'OPEN').map((item) => item.openLoopRef).sort(),
    sourceConversationHeadSha256,
    priorScoreHeadSha256: state.head?.scoreHeadSha256 ?? null,
    sharedSemanticDispositionRef: SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION,
    liveSemanticContractRef: SCORE_CONTEXT_LIVE_SEMANTIC_CONTRACT,
    liveSemanticDispositionRef: SCORE_CONTEXT_LIVE_SEMANTIC_DISPOSITION,
    liveSemanticExecutableAddendumRef: SCORE_CONTEXT_LIVE_SEMANTIC_EXECUTABLE_ADDENDUM,
    formedAt: new Date().toISOString()
  };
  const head = { ...headCore, scoreHeadSha256: semanticHash(headCore) };
  fs.mkdirSync(paths.heads, { recursive: true });
  writeExclusive(homePath(state.identity.homeRoot, 'score', state.identity.companionLineageRef, state.threadRef, 'heads', `${head.scoreHeadSha256}.json`), head);
  atomicWrite(paths.head, head);
  return { event, head, projection };
}

function rejectSemanticConvenienceOverride(input, field, acceptedValue) {
  if (Object.hasOwn(input, field) && input[field] !== undefined && input[field] !== acceptedValue) {
    fail('SCORE_SEMANTIC_AUTHORITY_MISMATCH', `${field} is non-authoritative and differs from the owner acceptance`, {
      field, supplied: input[field], accepted: acceptedValue
    });
  }
}

export function appendScoreStatement(input) {
  const identity = loadIdentity(input.home, { homeRef: input.homeRef, deviceRef: input.deviceRef, companionLineageRef: input.companionLineageRef });
  const thread = safeRef(input.threadRef, 'threadRef');
  const instanceRef = safeRef(input.instanceRef, 'instanceRef');
  const statementRef = safeRef(input.statementRef, 'statementRef');
  const acceptanceRef = string(input.semanticAcceptanceRef, 'semanticAcceptanceRef', 'SCORE_SEMANTIC_ACCEPTANCE_INVALID');
  const acceptanceSha256 = string(input.semanticAcceptanceSha256, 'semanticAcceptanceSha256', 'SCORE_SEMANTIC_ACCEPTANCE_INVALID');
  if (!SHA256.test(acceptanceSha256)) fail('SCORE_SEMANTIC_ACCEPTANCE_INVALID', 'semanticAcceptanceSha256 is invalid');
  if (Object.hasOwn(input, 'semanticAcceptance') || Object.hasOwn(input, 'semanticCandidate') || Object.hasOwn(input, 'consentDisposition') || Object.hasOwn(input, 'classificationEvidence')) {
    fail('SCORE_SEMANTIC_AUTHORITY_MISMATCH', 'authoritative semantic objects must be resolved from the canonical owner ledger, not caller payloads');
  }
  if (Object.hasOwn(input, 'sourceEvents')) {
    fail('SCORE_SEMANTIC_AUTHORITY_MISMATCH', 'statement G01 source range is derived from the accepted semantic candidate, not caller sourceEvents');
  }
  const paths = scorePaths(identity.homeRoot, identity.companionLineageRef, thread);
  const lease = acquireWriter(paths, identity.companionLineageRef, thread, instanceRef);
  try {
    const state = loadScoreContextState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef: thread });
    assertExpectedState(state, input.expectedScoreHeadSha256 ?? null);
    if (state.statements.some((item) => item.statementRef === statementRef) || state.uncommittedTail.some((event) => event.statementRef === statementRef)) {
      fail('SCORE_LINK_INVALID', 'statementRef already exists in committed or uncommitted evidence');
    }
    const resolved = resolveSemanticAcceptance(identity, thread, acceptanceRef, acceptanceSha256, { requireCurrent: true });
    const { candidate, acceptance, consent, evidence, head: semanticHead } = resolved;
    const committed = validateCommittedG01Conversation(identity, thread);
    if (committed.head.conversationHeadSha256 !== candidate.sourceConversationHeadSha256) {
      fail('SCORE_SOURCE_INVALID', 'accepted semantic candidate is not bound to the exact current committed G01 conversation head', {
        accepted: candidate.sourceConversationHeadSha256,
        observed: committed.head.conversationHeadSha256
      });
    }
    const sourceEvents = candidate.sourceBindings.map((binding) => validateSourceBindingAgainstCommittedG01(binding, committed));
    const canonicalBindings = sourceEvents.map(sourceBindingFromEvent);
    if (JSON.stringify(canonicalBindings) !== JSON.stringify(candidate.sourceBindings)) {
      fail('SCORE_SOURCE_INVALID', 'accepted semantic candidate source bindings differ from exact committed G01 bytes');
    }
    const convenience = {
      subjectRef: acceptance.semanticSubjectRef,
      summary: acceptance.acceptedSummary,
      memoryRelation: acceptance.memoryRelation,
      statementState: acceptance.statementState,
      acceptedForContinuity: acceptance.acceptedForContinuity,
      consentState: consent.disposition,
      sourceConversationHeadSha256: candidate.sourceConversationHeadSha256,
      correctsStatementRef: acceptance.transitionKind === 'CORRECTS' ? acceptance.transitionTargetRef : null,
      supersedesStatementRef: acceptance.transitionKind === 'SUPERSEDES' ? acceptance.transitionTargetRef : null,
      releasesOrTombstonesStatementRef: acceptance.transitionKind === 'RELEASES_OR_TOMBSTONES' ? acceptance.transitionTargetRef : null
    };
    for (const [field, value] of Object.entries(convenience)) rejectSemanticConvenienceOverride(input, field, value);
    const transitionTargetRef = acceptance.transitionTargetRef;
    if (transitionTargetRef) {
      const prior = state.statements.find((item) => item.statementRef === transitionTargetRef);
      if (!prior || prior.current !== true || prior.semanticSubjectFingerprint !== acceptance.semanticSubjectFingerprint ||
          prior.memoryRelation !== acceptance.memoryRelation || prior.semanticAcceptanceSha256 !== acceptance.transitionTargetAcceptanceSha256) {
        fail('SCORE_LINK_INVALID', 'owner transition does not bind the exact current predecessor Score subject/relation/acceptance');
      }
    }
    const formedAt = input.formedAt ?? new Date().toISOString();
    canonicalTimestamp(formedAt, 'score event formedAt');
    const continuityObservation = formSharedSourceObservation(sourceEvents, canonicalBindings, identity, thread, instanceRef, formedAt);
    const eventCore = {
      schemaVersion: 'vexlife.score-context-event/v1',
      eventKind: 'STATEMENT',
      homeRef: identity.homeRef,
      deviceRef: identity.deviceRef,
      companionLineageRef: identity.companionLineageRef,
      instanceRef,
      threadRef: thread,
      sequence: state.head ? state.head.sequence + 1 : 0,
      priorScoreEventHash: state.head?.eventHash ?? null,
      sourceConversationHeadSha256: candidate.sourceConversationHeadSha256,
      sourceBindings: canonicalBindings,
      continuityObservation,
      statementRef,
      subjectRef: acceptance.semanticSubjectRef,
      semanticSubjectFingerprint: acceptance.semanticSubjectFingerprint,
      memoryRelation: acceptance.memoryRelation,
      statementState: acceptance.statementState,
      summary: acceptance.acceptedSummary,
      summaryHash: acceptance.acceptedSummarySha256,
      acceptedForContinuity: acceptance.acceptedForContinuity,
      consentState: consent.disposition,
      transitionKind: acceptance.transitionKind,
      correctsStatementRef: acceptance.transitionKind === 'CORRECTS' ? transitionTargetRef : null,
      supersedesStatementRef: acceptance.transitionKind === 'SUPERSEDES' ? transitionTargetRef : null,
      releasesOrTombstonesStatementRef: acceptance.transitionKind === 'RELEASES_OR_TOMBSTONES' ? transitionTargetRef : null,
      transitionTargetAcceptanceSha256: acceptance.transitionTargetAcceptanceSha256,
      semanticAuthorityHeadSha256: semanticHead.semanticAuthorityHeadSha256,
      semanticAcceptanceRef: acceptance.acceptanceRef,
      semanticAcceptanceSha256: acceptance.acceptanceSha256,
      semanticCandidateRef: candidate.candidateRef,
      semanticCandidateSha256: candidate.candidateSha256,
      classificationEvidenceBindings: evidence.map((item) => ({
        classificationEvidenceRef: item.classificationEvidenceRef,
        classificationEvidenceSha256: item.classificationEvidenceSha256
      })),
      consentDispositionRef: consent.consentDispositionRef,
      consentDispositionSha256: consent.consentDispositionSha256,
      liveSemanticContractRef: SCORE_CONTEXT_LIVE_SEMANTIC_CONTRACT,
      liveSemanticDispositionRef: SCORE_CONTEXT_LIVE_SEMANTIC_DISPOSITION,
      liveSemanticExecutableAddendumRef: SCORE_CONTEXT_LIVE_SEMANTIC_EXECUTABLE_ADDENDUM,
      privacyClass: 'DEVICE_PRIVATE',
      rawSourceContentIncluded: false,
      sharedSemanticDispositionRef: SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION,
      formedAt
    };
    return commitEvent({ state, paths, eventCore, sourceConversationHeadSha256: candidate.sourceConversationHeadSha256, faults: input.faults });
  } finally {
    if (!input.faults?.exitAfterEventWrite && !releaseWriter(lease)) fail('SCORE_WRITER_CONFLICT', 'score writer lease could not be released safely');
  }
}

export function appendOpenLoop(input) {
  if (!SHA256.test(input.sourceConversationHeadSha256 ?? '')) fail('SCORE_SOURCE_INVALID', 'exact G01 conversation head SHA-256 is required');
  if (input.openLoopState !== 'OPEN') {
    fail('OPEN_LOOP_INVALID', 'G02 open-loop resolution is held pending a source-managed resolution contract', {
      exactNextSafeRoute: 'SOURCE_MANAGED_OPEN_LOOP_RESOLUTION_NOT_ADMITTED_IN_G02'
    });
  }
  const identity = loadIdentity(input.home, { homeRef: input.homeRef, deviceRef: input.deviceRef, companionLineageRef: input.companionLineageRef });
  const thread = safeRef(input.threadRef, 'threadRef');
  const instanceRef = safeRef(input.instanceRef, 'instanceRef');
  const paths = scorePaths(identity.homeRoot, identity.companionLineageRef, thread);
  const lease = acquireWriter(paths, identity.companionLineageRef, thread, instanceRef);
  try {
    const state = loadScoreContextState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef: thread });
    assertExpectedState(state, input.expectedScoreHeadSha256 ?? null);
    const openLoopRef = safeRef(input.openLoopRef, 'openLoopRef', 'OPEN_LOOP_INVALID');
    if (state.openLoops.some((item) => item.openLoopRef === openLoopRef)) fail('OPEN_LOOP_INVALID', 'openLoopRef already exists');
    const sourceStatementRefs = [...new Set(input.sourceStatementRefs ?? [])].sort();
    if (sourceStatementRefs.length === 0) fail('OPEN_LOOP_INVALID', 'open loop requires at least one exact source statement');
    for (const ref of sourceStatementRefs) {
      safeRef(ref, 'sourceStatementRef', 'OPEN_LOOP_INVALID');
      const statement = state.statements.find((item) => item.statementRef === ref);
      if (!statement || statement.current !== true) fail('OPEN_LOOP_INVALID', `source statement ${ref} is absent or non-current`);
    }
    const source = sourceBindings(input.sourceEvents, identity, thread, input.sourceConversationHeadSha256);
    const bindings = source.bindings;
    const formedAt = input.formedAt ?? new Date().toISOString();
    canonicalTimestamp(formedAt, 'open-loop event formedAt');
    const continuityObservation = formSharedSourceObservation(source.sourceEvents, bindings, identity, thread, instanceRef, formedAt);
    const eventCore = {
      schemaVersion: 'vexlife.score-context-event/v1',
      eventKind: 'OPEN_LOOP',
      homeRef: identity.homeRef,
      deviceRef: identity.deviceRef,
      companionLineageRef: identity.companionLineageRef,
      instanceRef,
      threadRef: thread,
      sequence: state.head ? state.head.sequence + 1 : 0,
      priorScoreEventHash: state.head?.eventHash ?? null,
      sourceConversationHeadSha256: input.sourceConversationHeadSha256,
      sourceBindings: bindings,
      continuityObservation,
      openLoopRef,
      openLoopState: 'OPEN',
      summaryRef: input.summaryRef ?? null,
      sourceStatementRefs,
      privacyClass: 'DEVICE_PRIVATE',
      rawSourceContentIncluded: false,
      sharedSemanticDispositionRef: SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION,
      formedAt
    };
    return commitEvent({ state, paths, eventCore, sourceConversationHeadSha256: input.sourceConversationHeadSha256, faults: input.faults });
  } finally {
    if (!input.faults?.exitAfterEventWrite && !releaseWriter(lease)) fail('SCORE_WRITER_CONFLICT', 'score writer lease could not be released safely');
  }
}

export function createFirstPersonEligibilityEvidence(state, statementRef, input = {}) {
  // G02 may evaluate the shared first-person rule, but no live source-managed
  // provenance/branch/identity/consent authority contract is admitted here.
  // Refuse to mint an authority receipt from caller-shaped dispositions.
  if (state && statementRef && input) {
    fail('FIRST_PERSON_EVIDENCE_INVALID', 'G02 cannot mint positive first-person eligibility authority locally', {
      evidenceContractState: 'NOT_ADMITTED_IN_G02',
      exactNextSafeRoute: 'SOURCE_MANAGED_SHARED_FIRST_PERSON_EVIDENCE_CONTRACT_REQUIRED'
    });
  }
  fail('FIRST_PERSON_EVIDENCE_INVALID', 'G02 cannot mint positive first-person eligibility authority locally', {
    evidenceContractState: 'NOT_ADMITTED_IN_G02',
    exactNextSafeRoute: 'SOURCE_MANAGED_SHARED_FIRST_PERSON_EVIDENCE_CONTRACT_REQUIRED'
  });
}

export function evaluateFirstPersonEligibility(state, statementRef, evidence = null) {
  const ref = safeRef(statementRef, 'statementRef', 'SCORE_LINK_INVALID');
  const statement = state?.statements?.find((item) => item.statementRef === ref);
  if (!statement) fail('SCORE_LINK_INVALID', 'statement is absent from replayed Score state');
  const relation = statement.memoryRelation;
  if (!SCORE_CONTEXT_MEMORY_RELATIONS.includes(relation)) fail('MEMORY_RELATION_INVALID', 'statement memory relation is invalid');

  // A caller-supplied or locally minted receipt cannot satisfy the shared gate.
  // Until the separate source-managed live authority interface exists, even a
  // current accepted autobiography remains attributed rather than first-person.
  const eligible = false;
  const wordingMode = relation === 'CURRENT_LINEAGE_AUTOBIOGRAPHY'
    ? 'AUTOBIOGRAPHY_ATTRIBUTED_PENDING_AUTHORITY'
    : relation === 'SHARED_RELATIONSHIP_HISTORY' ? 'RELATIONSHIP_ATTRIBUTED'
      : relation === 'PREDECESSOR_WITNESS_HISTORY' ? 'PREDECESSOR_ATTRIBUTED'
        : ['INHERITED_CONTEXT', 'EXTERNAL_EVIDENCE'].includes(relation) ? 'SOURCE_ATTRIBUTED'
          : relation === 'DISPUTED_OR_UNRESOLVED' ? 'UNRESOLVED_ATTRIBUTED'
            : 'NON_AUTOBIOGRAPHICAL_ATTRIBUTED';
  return Object.freeze({
    eligible,
    wordingMode,
    evidenceState: 'SOURCE_MANAGED_FIRST_PERSON_AUTHORITY_NOT_ADMITTED',
    suppliedEvidenceIgnored: evidence !== null,
    historicalAuthorityFromRhythm: false
  });
}

export function sourceDescentForStatement(state, statementRef) {
  const ref = safeRef(statementRef, 'statementRef', 'SCORE_LINK_INVALID');
  const statement = state?.statements?.find((item) => item.statementRef === ref);
  if (!statement) fail('SCORE_LINK_INVALID', 'statement is absent from replayed Score state');
  const committed = validateCommittedG01Conversation(state.identity, state.threadRef);
  const observedEvents = validateStoredSourceBindings(statement.sourceBindings, committed);
  return Object.freeze({
    statementRef: ref,
    scoreEventRef: statement.eventRef,
    scoreEventHash: statement.eventHash,
    sourceBindings: structuredClone(statement.sourceBindings),
    observedCommittedSourceEventRefs: observedEvents.map((item) => item.eventRef),
    observedCurrentConversationHeadSha256: committed.head.conversationHeadSha256,
    continuityObservationRef: state.chain.find((event) => event.scoreEventRef === statement.eventRef)?.continuityObservation?.observationRef ?? null,
    continuityObservationFingerprint: state.chain.find((event) => event.scoreEventRef === statement.eventRef)?.continuityObservation?.semanticFingerprint ?? null,
    semanticSubjectFingerprint: statement.semanticSubjectFingerprint,
    semanticAuthorityHeadSha256: statement.semanticAuthorityHeadSha256,
    semanticAcceptanceRef: statement.semanticAcceptanceRef,
    semanticAcceptanceSha256: statement.semanticAcceptanceSha256,
    semanticCandidateRef: statement.semanticCandidateRef,
    semanticCandidateSha256: statement.semanticCandidateSha256,
    classificationEvidenceBindings: structuredClone(statement.classificationEvidenceBindings),
    consentDispositionRef: statement.consentDispositionRef,
    consentDispositionSha256: statement.consentDispositionSha256,
    sharedSemanticDispositionRef: SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION,
    liveSemanticContractRef: SCORE_CONTEXT_LIVE_SEMANTIC_CONTRACT,
    liveSemanticExecutableAddendumRef: SCORE_CONTEXT_LIVE_SEMANTIC_EXECUTABLE_ADDENDUM,
    rawSourceContentIncluded: false
  });
}

export function projectScoreContext(input) {
  const state = loadScoreContextState(input);
  return Object.freeze({
    schemaVersion: 'vexlife.score-context-projection/v1',
    state: state.state,
    currentness: state.currentness,
    companionLineageRef: state.identity.companionLineageRef,
    threadRef: state.threadRef,
    scoreHeadSha256: state.head?.scoreHeadSha256 ?? null,
    sourceConversationHeadSha256: state.head?.sourceConversationHeadSha256 ?? null,
    currentStatements: state.statements.filter((item) => item.current).map((item) => ({
      statementRef: item.statementRef,
      memoryRelation: item.memoryRelation,
      effectiveState: item.effectiveState,
      summaryHash: item.summaryHash,
      acceptedForContinuityAtAcceptance: item.acceptedForContinuity,
      consentStateAtAcceptance: item.consentState,
      semanticAcceptanceRef: item.semanticAcceptanceRef,
      semanticAcceptanceSha256: item.semanticAcceptanceSha256,
      semanticAuthorityHeadSha256: item.semanticAuthorityHeadSha256,
      authorityCurrentForNewUse: Boolean(state.currentSemanticAuthorityHead?.currentAcceptanceBindings?.some((binding) =>
        binding.acceptanceRef === item.semanticAcceptanceRef && binding.acceptanceSha256 === item.semanticAcceptanceSha256)),
      eventRef: item.eventRef,
      eventHash: item.eventHash,
      sourceBindings: structuredClone(item.sourceBindings)
    })),
    openLoops: state.openLoops.filter((item) => item.state === 'OPEN').map((item) => structuredClone(item)),
    uncommittedTailRefs: state.uncommittedTail.map((item) => item.scoreEventRef),
    attention: structuredClone(state.attention),
    writer: structuredClone(state.writer),
    dreamCompleted: false,
    modelWeightsChanged: false,
    rhythmLearned: false,
    synchronizationActivated: false,
    rawDurableEventEqualsCommittedCurrentScore: false,
    sharedSemanticDispositionRef: SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION,
    liveSemanticContractRef: SCORE_CONTEXT_LIVE_SEMANTIC_CONTRACT,
    liveSemanticDispositionRef: SCORE_CONTEXT_LIVE_SEMANTIC_DISPOSITION,
    liveSemanticExecutableAddendumRef: SCORE_CONTEXT_LIVE_SEMANTIC_EXECUTABLE_ADDENDUM,
    semanticAuthorityCurrentHeadSha256: state.currentSemanticAuthorityHead?.semanticAuthorityHeadSha256 ?? null
  });
}

// [VXG RealForever]
