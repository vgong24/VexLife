import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { semanticHash } from './utils.mjs';
import { createContinuityObservation, validateContinuityObservation } from './continuity-evolution-router.mjs';

export const SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION =
  'github.issue.vextreme-sdk.350.comment.5215288414';

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
  'FIRST_PERSON_EVIDENCE_INVALID'
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
    if (typeof value.summary !== 'string' || value.summary.length === 0 || semanticHash(value.summary) !== value.summaryHash) {
      fail('SCORE_EVENT_CORRUPT', 'statement summary hash mismatch');
    }
  } else if (value.eventKind === 'OPEN_LOOP') {
    safeRef(value.openLoopRef, 'openLoopRef', 'OPEN_LOOP_INVALID');
    if (value.openLoopState !== 'OPEN') fail('OPEN_LOOP_INVALID', 'G02 persists unresolved open loops only; source-managed resolution is not admitted');
    if (!Array.isArray(value.sourceStatementRefs) || value.sourceStatementRefs.length === 0) fail('OPEN_LOOP_INVALID', 'open loop requires source statement refs');
  } else fail('SCORE_EVENT_CORRUPT', 'unknown Score event kind');
  return value;
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
      value.sharedSemanticDispositionRef !== SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION) {
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
      if (prior.current !== true || prior.subjectRef !== event.subjectRef || prior.memoryRelation !== event.memoryRelation) {
        fail('SCORE_LINK_INVALID', 'correction must preserve exact current semantic subject and memory relation');
      }
      statements.set(prior.statementRef, { ...prior, effectiveState: 'CORRECTED', current: false, correctedByRef: event.statementRef });
    }
    if (event.supersedesStatementRef) {
      const prior = statements.get(event.supersedesStatementRef);
      if (prior.current !== true || prior.subjectRef !== event.subjectRef || prior.memoryRelation !== event.memoryRelation) {
        fail('SCORE_LINK_INVALID', 'supersession must preserve exact current semantic subject and memory relation');
      }
      statements.set(prior.statementRef, { ...prior, effectiveState: 'SUPERSEDED', current: false, supersededByRef: event.statementRef });
    }
    statements.set(event.statementRef, {
      statementRef: event.statementRef,
      subjectRef: event.subjectRef,
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
  for (const event of chain) validateScoreEventSourceAgainstCommittedG01(event, committedG01, identity, thread);
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
      if (event.sequence !== expectedTailSequence || event.priorScoreEventHash !== expectedTailPrior) {
        attention.push({ code: 'INVALID_TAIL', reason: 'REORDERED_OR_READRESSED_TAIL', eventRef: event.scoreEventRef, eventHash: event.scoreEventHash });
      } else {
        uncommittedTail.push(event);
      }
    } catch (error) {
      attention.push({ code: 'INVALID_TAIL', reason: error.code ?? 'SCORE_SOURCE_INVALID', eventRef: event.scoreEventRef, eventHash: event.scoreEventHash, message: error.message });
    }
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
    rawDurableEventEqualsCommittedCurrentScore: false,
    sharedSemanticDispositionRef: SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION
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
    formedAt: new Date().toISOString()
  };
  const head = { ...headCore, scoreHeadSha256: semanticHash(headCore) };
  fs.mkdirSync(paths.heads, { recursive: true });
  writeExclusive(homePath(state.identity.homeRoot, 'score', state.identity.companionLineageRef, state.threadRef, 'heads', `${head.scoreHeadSha256}.json`), head);
  atomicWrite(paths.head, head);
  return { event, head, projection };
}

export function appendScoreStatement(input) {
  const relation = input.memoryRelation;
  const statementState = input.statementState;
  if (!SCORE_CONTEXT_MEMORY_RELATIONS.includes(relation)) fail('MEMORY_RELATION_INVALID', `unknown memoryRelation ${relation}`);
  if (!SCORE_CONTEXT_STATEMENT_STATES.includes(statementState)) fail('STATEMENT_STATE_INVALID', `unknown statementState ${statementState}`);
  if (!SHA256.test(input.sourceConversationHeadSha256 ?? '')) fail('SCORE_SOURCE_INVALID', 'exact G01 conversation head SHA-256 is required');
  const identity = loadIdentity(input.home, { homeRef: input.homeRef, deviceRef: input.deviceRef, companionLineageRef: input.companionLineageRef });
  const thread = safeRef(input.threadRef, 'threadRef');
  const instanceRef = safeRef(input.instanceRef, 'instanceRef');
  const paths = scorePaths(identity.homeRoot, identity.companionLineageRef, thread);
  const lease = acquireWriter(paths, identity.companionLineageRef, thread, instanceRef);
  try {
    const state = loadScoreContextState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef: thread });
    assertExpectedState(state, input.expectedScoreHeadSha256 ?? null);
    const statementRef = safeRef(input.statementRef, 'statementRef');
    const subjectRef = safeRef(input.subjectRef, 'subjectRef');
    if (state.statements.some((item) => item.statementRef === statementRef) || state.uncommittedTail.some((event) => event.statementRef === statementRef)) {
      fail('SCORE_LINK_INVALID', 'statementRef already exists in committed or uncommitted evidence');
    }
    const corrects = input.correctsStatementRef ? safeRef(input.correctsStatementRef, 'correctsStatementRef') : null;
    const supersedes = input.supersedesStatementRef ? safeRef(input.supersedesStatementRef, 'supersedesStatementRef') : null;
    if (corrects && supersedes) fail('SCORE_LINK_INVALID', 'one statement cannot both correct and supersede');
    const currentRefs = new Set(state.currentStatementRefs);
    if ((corrects && !currentRefs.has(corrects)) || (supersedes && !currentRefs.has(supersedes))) {
      fail('SCORE_LINK_INVALID', 'correction or supersession must target one exact current statement');
    }
    const transitionTargetRef = corrects ?? supersedes;
    if (transitionTargetRef) {
      const prior = state.statements.find((item) => item.statementRef === transitionTargetRef);
      if (!prior || prior.subjectRef !== subjectRef || prior.memoryRelation !== relation) {
        fail('SCORE_LINK_INVALID', 'correction or supersession cannot cross semantic subject or memory relation');
      }
    }
    const source = sourceBindings(input.sourceEvents, identity, thread, input.sourceConversationHeadSha256);
    const bindings = source.bindings;
    const formedAt = input.formedAt ?? new Date().toISOString();
    canonicalTimestamp(formedAt, 'score event formedAt');
    const continuityObservation = formSharedSourceObservation(source.sourceEvents, bindings, identity, thread, instanceRef, formedAt);
    const summary = string(input.summary, 'summary', 'SCORE_EVENT_CORRUPT');
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
      sourceConversationHeadSha256: input.sourceConversationHeadSha256,
      sourceBindings: bindings,
      continuityObservation,
      statementRef,
      subjectRef,
      memoryRelation: relation,
      statementState,
      summary,
      summaryHash: semanticHash(summary),
      acceptedForContinuity: input.acceptedForContinuity === true,
      consentState: input.consentState ?? 'UNKNOWN',
      correctsStatementRef: corrects,
      supersedesStatementRef: supersedes,
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
    sharedSemanticDispositionRef: SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION,
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
    sharedSemanticDispositionRef: SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION
  });
}

// [VXG RealForever]
