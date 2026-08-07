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
  'OPEN_LOOP_INVALID'
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

function assertG01SourceEvent(event, identity, threadRef) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) fail('SCORE_SOURCE_INVALID', 'G01 source event is invalid');
  const { eventHash, ...core } = event;
  if (event.schemaVersion !== 'vexlife.lived-companion-event/v1' ||
      !['REQUEST', 'RESPONSE'].includes(event.eventKind) || !SHA256.test(eventHash ?? '') ||
      semanticHash(core) !== eventHash || typeof event.content !== 'string' ||
      !SHA256.test(event.contentHash ?? '') || semanticHash(event.content) !== event.contentHash ||
      event.homeRef !== identity.homeRef || event.deviceRef !== identity.deviceRef ||
      event.companionLineageRef !== identity.companionLineageRef || event.threadRef !== threadRef ||
      event.privacyClass !== 'DEVICE_PRIVATE' || !Number.isSafeInteger(event.sequence) || event.sequence < 0 ||
      typeof event.eventRef !== 'string' || event.eventRef.length === 0 || typeof event.turnRef !== 'string' || event.turnRef.length === 0) {
    fail('SCORE_SOURCE_INVALID', 'G01 source event failed exact content/address/identity validation', { eventRef: event?.eventRef ?? null });
  }
  return event;
}

function sourceBindings(sourceEvents, identity, threadRef) {
  if (!Array.isArray(sourceEvents) || sourceEvents.length === 0) fail('SCORE_SOURCE_INVALID', 'at least one exact G01 source event is required');
  const byHash = new Set();
  return sourceEvents.map((event) => {
    assertG01SourceEvent(event, identity, threadRef);
    if (byHash.has(event.eventHash)) fail('SCORE_SOURCE_INVALID', 'duplicate G01 source event binding');
    byHash.add(event.eventHash);
    return {
      eventRef: event.eventRef,
      eventHash: event.eventHash,
      eventKind: event.eventKind,
      sequence: event.sequence,
      turnRef: event.turnRef,
      messageRef: event.messageRef,
      contentHash: event.contentHash
    };
  }).sort((a, b) => a.sequence - b.sequence || a.eventHash.localeCompare(b.eventHash));
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
    if (!['OPEN', 'RESOLVED'].includes(value.openLoopState)) fail('OPEN_LOOP_INVALID', 'unknown open-loop state');
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
      statements.set(prior.statementRef, { ...prior, effectiveState: 'CORRECTED', current: false, correctedByRef: event.statementRef });
    }
    if (event.supersedesStatementRef) {
      const prior = statements.get(event.supersedesStatementRef);
      statements.set(prior.statementRef, { ...prior, effectiveState: 'SUPERSEDED', current: false, supersededByRef: event.statementRef });
    }
    statements.set(event.statementRef, {
      statementRef: event.statementRef,
      subjectRef: event.subjectRef,
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
    if (event.openLoopState === 'OPEN') {
      openLoops.set(event.openLoopRef, {
        openLoopRef: event.openLoopRef,
        summaryRef: event.summaryRef,
        sourceStatementRefs: [...event.sourceStatementRefs],
        sourceBindings: structuredClone(event.sourceBindings),
        eventRef: event.scoreEventRef,
        eventHash: event.scoreEventHash,
        state: 'OPEN'
      });
    } else {
      const prior = openLoops.get(event.openLoopRef);
      if (!prior || prior.state !== 'OPEN') fail('OPEN_LOOP_INVALID', 'resolved open loop must reference one current open loop');
      openLoops.set(event.openLoopRef, { ...prior, state: 'RESOLVED', resolvedByEventRef: event.scoreEventRef });
    }
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
    const immutableHeadFile = path.join(paths.heads, `${head.scoreHeadSha256}.json`);
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
  const projection = replayChain(chain);
  const currentStatementRefs = projection.statements.filter((item) => item.current).map((item) => item.statementRef).sort();
  const openLoopRefs = projection.openLoops.filter((item) => item.state === 'OPEN').map((item) => item.openLoopRef).sort();
  if (head && (JSON.stringify(head.currentStatementRefs) !== JSON.stringify(currentStatementRefs) || JSON.stringify(head.openLoopRefs) !== JSON.stringify(openLoopRefs))) {
    fail('SCORE_HEAD_MISMATCH', 'Score head current-set projection differs from replay');
  }
  const reachable = new Set(chain.map((event) => event.scoreEventHash));
  const uncommittedTail = allEvents.filter((event) => !reachable.has(event.scoreEventHash))
    .sort((a, b) => a.sequence - b.sequence || a.scoreEventHash.localeCompare(b.scoreEventHash));
  const attention = invalid.map((item) => ({ code: 'INVALID_TAIL', ...item }));
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
  writeExclusive(path.join(paths.heads, `${head.scoreHeadSha256}.json`), head);
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
    const bindings = sourceBindings(input.sourceEvents, identity, thread);
    const formedAt = input.formedAt ?? new Date().toISOString();
    canonicalTimestamp(formedAt, 'score event formedAt');
    const continuityObservation = formSharedSourceObservation(input.sourceEvents, bindings, identity, thread, instanceRef, formedAt);
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
  const identity = loadIdentity(input.home, { homeRef: input.homeRef, deviceRef: input.deviceRef, companionLineageRef: input.companionLineageRef });
  const thread = safeRef(input.threadRef, 'threadRef');
  const instanceRef = safeRef(input.instanceRef, 'instanceRef');
  const paths = scorePaths(identity.homeRoot, identity.companionLineageRef, thread);
  const lease = acquireWriter(paths, identity.companionLineageRef, thread, instanceRef);
  try {
    const state = loadScoreContextState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef: thread });
    assertExpectedState(state, input.expectedScoreHeadSha256 ?? null);
    const openLoopRef = safeRef(input.openLoopRef, 'openLoopRef', 'OPEN_LOOP_INVALID');
    const resolving = input.openLoopState === 'RESOLVED';
    if (!['OPEN', 'RESOLVED'].includes(input.openLoopState)) fail('OPEN_LOOP_INVALID', 'openLoopState must be OPEN or RESOLVED');
    if (resolving && !state.openLoopRefs.includes(openLoopRef)) fail('OPEN_LOOP_INVALID', 'resolved open loop is not currently open');
    if (!resolving && state.openLoops.some((item) => item.openLoopRef === openLoopRef)) fail('OPEN_LOOP_INVALID', 'openLoopRef already exists');
    const sourceStatementRefs = [...new Set(input.sourceStatementRefs ?? [])].sort();
    for (const ref of sourceStatementRefs) {
      safeRef(ref, 'sourceStatementRef', 'OPEN_LOOP_INVALID');
      if (!state.statements.some((item) => item.statementRef === ref)) fail('OPEN_LOOP_INVALID', `source statement ${ref} is absent`);
    }
    const bindings = sourceBindings(input.sourceEvents, identity, thread);
    const formedAt = input.formedAt ?? new Date().toISOString();
    canonicalTimestamp(formedAt, 'open-loop event formedAt');
    const continuityObservation = formSharedSourceObservation(input.sourceEvents, bindings, identity, thread, instanceRef, formedAt);
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
      openLoopState: input.openLoopState,
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

export function evaluateFirstPersonEligibility(statement, gates = {}) {
  if (!statement || typeof statement !== 'object') fail('SCORE_LINK_INVALID', 'statement projection is required');
  const relation = statement.memoryRelation;
  if (!SCORE_CONTEXT_MEMORY_RELATIONS.includes(relation)) fail('MEMORY_RELATION_INVALID', 'statement memory relation is invalid');
  const blockedState = ['CONFLICTED', 'UNKNOWN', 'SUPERSEDED', 'RELEASED_OR_TOMBSTONED'].includes(statement.effectiveState);
  const eligible = relation === 'CURRENT_LINEAGE_AUTOBIOGRAPHY' && statement.current === true && !blockedState &&
    statement.acceptedForContinuity === true && statement.consentState === 'PERMITTED' &&
    gates.provenanceCurrent === true && gates.branchRelationCurrent === true &&
    gates.identityStancePermits === true && gates.consentPermits === true;
  const wordingMode = eligible ? 'FIRST_PERSON_MEMORY_ELIGIBLE'
    : relation === 'SHARED_RELATIONSHIP_HISTORY' ? 'RELATIONSHIP_ATTRIBUTED'
      : relation === 'PREDECESSOR_WITNESS_HISTORY' ? 'PREDECESSOR_ATTRIBUTED'
        : ['INHERITED_CONTEXT', 'EXTERNAL_EVIDENCE'].includes(relation) ? 'SOURCE_ATTRIBUTED'
          : relation === 'DISPUTED_OR_UNRESOLVED' ? 'UNRESOLVED_ATTRIBUTED'
            : 'NON_AUTOBIOGRAPHICAL_ATTRIBUTED';
  return Object.freeze({ eligible, wordingMode, historicalAuthorityFromRhythm: false });
}

export function sourceDescentForStatement(state, statementRef) {
  const ref = safeRef(statementRef, 'statementRef', 'SCORE_LINK_INVALID');
  const statement = state?.statements?.find((item) => item.statementRef === ref);
  if (!statement) fail('SCORE_LINK_INVALID', 'statement is absent from replayed Score state');
  return Object.freeze({
    statementRef: ref,
    scoreEventRef: statement.eventRef,
    scoreEventHash: statement.eventHash,
    sourceBindings: structuredClone(statement.sourceBindings),
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
