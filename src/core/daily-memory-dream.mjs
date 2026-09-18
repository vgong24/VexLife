import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { semanticHash } from './utils.mjs';
import { loadScoreContextState, verifyHistoricalScoreContextSnapshot } from './score-context-continuity.mjs';

export const DAILY_MEMORY_DREAM_CONTRACT = 'contract.multivex.g03.daily-memory-only-dream/v1';
export const DAILY_MEMORY_DREAM_MEMORY_OWNER = 'github.issue.vextreme-sdk.225.comment.5222362637';
export const DAILY_MEMORY_DREAM_SAFETY_OWNER = 'github.issue.vextreme-sdk.226.comment.5222369889';
export const DAILY_MEMORY_DREAM_MAIN_VEX_CONVERGENCE = 'github.issue.vextreme-sdk.350.comment.5222375713';

export const DAILY_MEMORY_DREAM_FAILURE_CODES = Object.freeze([
  'DREAM_HOME_IDENTITY_MISMATCH',
  'DREAM_SOURCE_INVALID',
  'DREAM_SOURCE_STALE',
  'DREAM_SCORE_NOT_CAUGHT_UP',
  'DREAM_DAY_INVALID',
  'DREAM_DAY_CONFLICT',
  'DREAM_WRITER_CONFLICT',
  'DREAM_WRITER_RECOVERY_REQUIRED',
  'DREAM_RECEIPT_CORRUPT',
  'DREAM_HEAD_MISMATCH',
  'DREAM_TAIL_ATTENTION',
  'DREAM_INVOCATION_INVALID'
]);

const REF = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const DAY_REF = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u;
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/u;
const POSITIVE_CONSENT = new Set(['PERMITTED', 'NARROWED']);

export class DailyMemoryDreamError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'DailyMemoryDreamError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new DailyMemoryDreamError(code, message, details);
}

function string(value, label, code = 'DREAM_DAY_INVALID') {
  if (typeof value !== 'string' || value.length === 0) fail(code, `${label} is required`);
  return value;
}

function safeRef(value, label, code = 'DREAM_DAY_INVALID') {
  const ref = string(value, label, code);
  const stem = ref.split('.')[0];
  if (!REF.test(ref) || WINDOWS_RESERVED.test(stem) || path.isAbsolute(ref) || path.win32.isAbsolute(ref) || path.posix.isAbsolute(ref)) {
    fail(code, `${label} must be one lowercase portable canonical path segment`, { value });
  }
  return ref;
}

function canonicalTimestamp(value, label, code = 'DREAM_DAY_INVALID') {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail(code, `${label} must be canonical ISO-8601 UTC`, { value });
  }
  return value;
}

function samePath(left, right) {
  const a = path.normalize(path.resolve(left));
  const b = path.normalize(path.resolve(right));
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function canonicalHomeRoot(home) {
  const requested = path.resolve(string(home, 'home', 'DREAM_HOME_IDENTITY_MISMATCH'));
  let stat;
  try { stat = fs.lstatSync(requested); }
  catch (error) { fail('DREAM_HOME_IDENTITY_MISMATCH', 'Vex Home is unavailable', { home: requested, cause: error.message }); }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('DREAM_HOME_IDENTITY_MISMATCH', 'Vex Home must be one canonical directory', { home: requested });
  const real = fs.realpathSync.native(requested);
  if (!samePath(real, requested)) fail('DREAM_HOME_IDENTITY_MISMATCH', 'Vex Home root is not canonical', { requested, real });
  return real;
}

function homePath(home, ...segments) {
  const root = canonicalHomeRoot(home);
  const safeSegments = segments.map((segment, index) => safeRef(segment, `path segment ${index}`, 'DREAM_HOME_IDENTITY_MISMATCH'));
  const target = path.resolve(root, ...safeSegments);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('DREAM_HOME_IDENTITY_MISMATCH', 'Daily Dream path escapes Vex Home', { target });
  }
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) continue;
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) fail('DREAM_HOME_IDENTITY_MISMATCH', 'Daily Dream path traverses a symlink/junction alias', { path: cursor });
    const real = fs.realpathSync.native(cursor);
    if (!samePath(real, cursor)) fail('DREAM_HOME_IDENTITY_MISMATCH', 'Daily Dream path traverses a non-canonical alias', { path: cursor, real });
  }
  return target;
}

function readJson(file, code, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(code, `${label} could not be read`, { file, cause: error.message }); }
}

function ensureRegularCanonicalFile(home, file, code, label) {
  const root = canonicalHomeRoot(home);
  const resolved = path.resolve(file);
  const relative = path.relative(root, resolved);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail(code, `${label} escapes Vex Home`, { file });
  let stat;
  try { stat = fs.lstatSync(resolved); }
  catch (error) { fail(code, `${label} is missing`, { file, cause: error.message }); }
  if (stat.isSymbolicLink() || !stat.isFile()) fail(code, `${label} must be one regular canonical file`, { file });
  const real = fs.realpathSync.native(resolved);
  if (!samePath(real, resolved)) fail(code, `${label} is not its canonical file identity`, { file, real });
  return resolved;
}

function writeExclusive(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let fd = null;
  try {
    fd = fs.openSync(file, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    return 'CREATED';
  } catch (error) {
    if (fd !== null) { try { fs.closeSync(fd); } catch {} }
    if (error?.code === 'EEXIST') return 'EXISTS';
    throw error;
  }
}

function atomicWrite(file, value, faults = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  if (faults.failBeforeHeadRename === true) {
    fs.rmSync(temporary, { force: true });
    fail('DREAM_HEAD_MISMATCH', 'simulated failure before Daily Dream atomic head rename');
  }
  fs.renameSync(temporary, file);
}

function addressed(prefix, hashField, core) {
  const ref = `${prefix}.${semanticHash(core).slice(0, 32)}`;
  const withRef = { ...core, [`${prefix.split('.').at(-1)}Ref`]: ref };
  return { ...withRef, [hashField]: semanticHash(withRef) };
}

function formReceipt({ schemaVersion, refField, hashField, prefix, core }) {
  const preRef = { schemaVersion, ...core };
  const ref = `${prefix}.${semanticHash(preRef).slice(0, 32)}`;
  const withRef = { ...preRef, [refField]: ref };
  return Object.freeze({ ...withRef, [hashField]: semanticHash(withRef) });
}

function validateReceipt(value, { schemaVersion, refField, hashField, prefix, code = 'DREAM_RECEIPT_CORRUPT', label }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${label} is missing or malformed`);
  const observedRef = value[refField];
  const observedHash = value[hashField];
  const clone = structuredClone(value);
  delete clone[refField]; delete clone[hashField];
  const expectedRef = `${prefix}.${semanticHash(clone).slice(0, 32)}`;
  const core = { ...clone, [refField]: observedRef };
  if (value.schemaVersion !== schemaVersion || observedRef !== expectedRef || !SHA256.test(observedHash ?? '') || semanticHash(core) !== observedHash) {
    fail(code, `${label} content-address identity is invalid`, { observedRef, expectedRef });
  }
  return value;
}

function dreamPaths(home, lineageRef, threadRef) {
  const lineage = safeRef(lineageRef, 'companionLineageRef', 'DREAM_HOME_IDENTITY_MISMATCH');
  const thread = safeRef(threadRef, 'threadRef', 'DREAM_HOME_IDENTITY_MISMATCH');
  const root = homePath(home, 'daily-memory-dream', lineage, thread);
  return {
    root,
    orientations: homePath(home, 'daily-memory-dream', lineage, thread, 'orientations'),
    preDream: homePath(home, 'daily-memory-dream', lineage, thread, 'pre-dream'),
    closures: homePath(home, 'daily-memory-dream', lineage, thread, 'closures'),
    consolidations: homePath(home, 'daily-memory-dream', lineage, thread, 'consolidations'),
    postDream: homePath(home, 'daily-memory-dream', lineage, thread, 'post-dream'),
    strata: homePath(home, 'daily-memory-dream', lineage, thread, 'strata'),
    wakes: homePath(home, 'daily-memory-dream', lineage, thread, 'wakes'),
    heads: homePath(home, 'daily-memory-dream', lineage, thread, 'heads'),
    head: homePath(home, 'daily-memory-dream', lineage, thread, 'head.json'),
    lock: homePath(home, 'daily-memory-dream', lineage, thread, 'writer.lock')
  };
}

function fileFor(directory, sha) {
  if (!SHA256.test(sha ?? '')) fail('DREAM_RECEIPT_CORRUPT', 'receipt SHA is invalid', { sha });
  return path.join(directory, `${sha}.json`);
}

function writeAddressed(home, directory, hashField, value, label) {
  const sha = value[hashField];
  const file = fileFor(directory, sha);
  const state = writeExclusive(file, value);
  if (state === 'EXISTS') {
    ensureRegularCanonicalFile(home, file, 'DREAM_RECEIPT_CORRUPT', label);
    const existing = readJson(file, 'DREAM_RECEIPT_CORRUPT', label);
    if (semanticHash(existing) !== semanticHash(value)) fail('DREAM_RECEIPT_CORRUPT', `${label} content-address collision`, { file });
  }
  ensureRegularCanonicalFile(home, file, 'DREAM_RECEIPT_CORRUPT', label);
  return file;
}

function loadAddressed(home, directory, sha, validator, label) {
  const file = fileFor(directory, sha);
  ensureRegularCanonicalFile(home, file, 'DREAM_RECEIPT_CORRUPT', label);
  return validator(readJson(file, 'DREAM_RECEIPT_CORRUPT', label));
}

function processState(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return 'UNVERIFIABLE';
  if (pid === process.pid) return 'ACTIVE';
  try { process.kill(pid, 0); return 'ACTIVE'; }
  catch (error) { if (error?.code === 'ESRCH') return 'ABSENT'; if (error?.code === 'EPERM') return 'ACTIVE'; return 'UNVERIFIABLE'; }
}

function acquireWriter(paths, lineageRef, threadRef, instanceRef) {
  const instance = safeRef(instanceRef, 'instanceRef', 'DREAM_WRITER_CONFLICT');
  fs.mkdirSync(paths.root, { recursive: true });
  const leaseCore = {
    schemaVersion: 'vexlife.daily-memory-dream-writer/v1',
    companionLineageRef: lineageRef,
    threadRef,
    instanceRef: instance,
    pid: process.pid,
    lockToken: crypto.randomUUID(),
    formedAt: new Date().toISOString()
  };
  const lease = { ...leaseCore, leaseSha256: semanticHash(leaseCore) };
  const state = writeExclusive(paths.lock, lease);
  if (state === 'EXISTS') {
    ensureRegularCanonicalFile(path.dirname(path.dirname(path.dirname(paths.root))), paths.lock, 'DREAM_WRITER_CONFLICT', 'Daily Dream writer lease');
    const existing = readJson(paths.lock, 'DREAM_WRITER_CONFLICT', 'Daily Dream writer lease');
    const { leaseSha256, ...core } = existing ?? {};
    const ownerState = SHA256.test(leaseSha256 ?? '') && semanticHash(core) === leaseSha256 ? processState(existing.pid) : 'UNVERIFIABLE';
    fail(ownerState === 'ABSENT' ? 'DREAM_WRITER_RECOVERY_REQUIRED' : 'DREAM_WRITER_CONFLICT',
      ownerState === 'ABSENT' ? 'abandoned Daily Dream writer lease requires explicit recovery' : 'Daily Dream already has an active/unverifiable writer',
      { ownerState, ownerInstanceRef: existing?.instanceRef ?? null, ownerPid: existing?.pid ?? null });
  }
  return { path: paths.lock, token: lease.lockToken };
}

function releaseWriter(lease) {
  if (!lease || !fs.existsSync(lease.path)) return true;
  try {
    const value = JSON.parse(fs.readFileSync(lease.path, 'utf8'));
    if (value.lockToken !== lease.token) return false;
    fs.unlinkSync(lease.path);
    return true;
  } catch { return false; }
}

function writerObservation(paths) {
  if (!fs.existsSync(paths.lock)) return { state: 'NONE' };
  try {
    const stat = fs.lstatSync(paths.lock);
    if (stat.isSymbolicLink() || !stat.isFile()) return { state: 'UNVERIFIABLE' };
    const lease = JSON.parse(fs.readFileSync(paths.lock, 'utf8'));
    const { leaseSha256, ...core } = lease;
    if (!SHA256.test(leaseSha256 ?? '') || semanticHash(core) !== leaseSha256) return { state: 'UNVERIFIABLE' };
    return { state: processState(lease.pid), instanceRef: lease.instanceRef, pid: lease.pid, leaseSha256 };
  } catch { return { state: 'UNVERIFIABLE' }; }
}

export function recoverAbandonedDailyMemoryDreamWriter({ home, homeRef, deviceRef, companionLineageRef, threadRef, expectedAbandonedInstanceRef }) {
  const score = loadScoreContextState({ home, homeRef, deviceRef, companionLineageRef, threadRef });
  const paths = dreamPaths(score.identity.homeRoot, score.identity.companionLineageRef, score.threadRef);
  if (!fs.existsSync(paths.lock)) return { state: 'NO_WRITER_LEASE', recovered: false };
  ensureRegularCanonicalFile(score.identity.homeRoot, paths.lock, 'DREAM_WRITER_CONFLICT', 'Daily Dream writer lease');
  const lease = readJson(paths.lock, 'DREAM_WRITER_CONFLICT', 'Daily Dream writer lease');
  const { leaseSha256, ...core } = lease ?? {};
  if (!SHA256.test(leaseSha256 ?? '') || semanticHash(core) !== leaseSha256 ||
      lease.schemaVersion !== 'vexlife.daily-memory-dream-writer/v1' ||
      lease.companionLineageRef !== score.identity.companionLineageRef || lease.threadRef !== score.threadRef ||
      safeRef(lease.instanceRef, 'writer.instanceRef', 'DREAM_WRITER_CONFLICT') !== lease.instanceRef ||
      typeof lease.lockToken !== 'string' || !lease.lockToken || !Number.isSafeInteger(lease.pid) || lease.pid <= 0) {
    fail('DREAM_WRITER_CONFLICT', 'Daily Dream writer lease is not exact enough for recovery');
  }
  if (expectedAbandonedInstanceRef !== undefined && expectedAbandonedInstanceRef !== null && lease.instanceRef !== expectedAbandonedInstanceRef) {
    fail('DREAM_WRITER_CONFLICT', 'abandoned writer instance does not match exact recovery request', {
      expectedAbandonedInstanceRef, observedAbandonedInstanceRef: lease.instanceRef
    });
  }
  const ownerState = processState(lease.pid);
  if (ownerState !== 'ABSENT') {
    fail(ownerState === 'ACTIVE' ? 'DREAM_WRITER_CONFLICT' : 'DREAM_WRITER_RECOVERY_REQUIRED',
      'Daily Dream writer lease cannot be recovered unless the recorded writer is provably absent', { ownerState, ownerPid: lease.pid });
  }
  fs.unlinkSync(paths.lock);
  return { state: 'ABANDONED_WRITER_RECOVERED', recovered: true, abandonedInstanceRef: lease.instanceRef, leaseSha256 };
}

function validateG01Head(home, identity, threadRef) {
  const file = homePath(home, 'conversations', identity.companionLineageRef, threadRef, 'head.json');
  ensureRegularCanonicalFile(home, file, 'DREAM_SOURCE_INVALID', 'current G01 conversation head');
  const head = readJson(file, 'DREAM_SOURCE_INVALID', 'current G01 conversation head');
  const { conversationHeadSha256, ...core } = head ?? {};
  if (head?.schemaVersion !== 'vexlife.lived-companion-head/v1' || !SHA256.test(conversationHeadSha256 ?? '') || semanticHash(core) !== conversationHeadSha256 ||
      head.homeRef !== identity.homeRef || head.deviceRef !== identity.deviceRef || head.companionLineageRef !== identity.companionLineageRef ||
      head.threadRef !== threadRef || !Number.isSafeInteger(head.sequence) || head.sequence < 1 || !SHA256.test(head.eventHash ?? '')) {
    fail('DREAM_SOURCE_INVALID', 'current G01 conversation head failed exact identity/hash validation');
  }
  return head;
}

function validateLatestG01Response(home, identity, threadRef, head) {
  const file = homePath(home, 'conversations', identity.companionLineageRef, threadRef, 'events', `${String(head.sequence).padStart(8, '0')}-${head.eventHash}.json`);
  ensureRegularCanonicalFile(home, file, 'DREAM_SOURCE_INVALID', 'current G01 response event');
  const event = readJson(file, 'DREAM_SOURCE_INVALID', 'current G01 response event');
  const { eventHash, ...core } = event ?? {};
  if (event?.schemaVersion !== 'vexlife.lived-companion-event/v1' || event.eventKind !== 'RESPONSE' || eventHash !== head.eventHash ||
      !SHA256.test(eventHash ?? '') || semanticHash(core) !== eventHash || event.homeRef !== identity.homeRef || event.deviceRef !== identity.deviceRef ||
      event.companionLineageRef !== identity.companionLineageRef || event.threadRef !== threadRef || event.sequence !== head.sequence ||
      typeof event.endpointProfileRef !== 'string' || !event.endpointProfileRef || typeof event.modelNameOrBoundedTestProfileRef !== 'string' || !event.modelNameOrBoundedTestProfileRef) {
    fail('DREAM_SOURCE_INVALID', 'current G01 response event failed exact identity/provenance validation');
  }
  return {
    eventRef: event.eventRef,
    eventHash: event.eventHash,
    endpointProfileRef: event.endpointProfileRef,
    modelProfileRef: event.modelNameOrBoundedTestProfileRef,
    instanceRef: event.instanceRef,
    turnRef: event.turnRef
  };
}

function sourceFrontier(input) {
  const score = loadScoreContextState({
    home: input.home,
    homeRef: input.homeRef,
    deviceRef: input.deviceRef,
    companionLineageRef: input.companionLineageRef,
    threadRef: input.threadRef
  });
  if (score.currentness !== 'CURRENT' || score.attention?.length) fail('DREAM_SOURCE_INVALID', 'G02 Score must be CURRENT without attention before Dream closure');
  if (!score.head || !SHA256.test(score.head.scoreHeadSha256 ?? '')) fail('DREAM_SOURCE_INVALID', 'G03 requires an accepted current G02 Score head');
  if (!score.currentSemanticAuthorityHead || !SHA256.test(score.currentSemanticAuthorityHead.semanticAuthorityHeadSha256 ?? '')) {
    fail('DREAM_SOURCE_INVALID', 'G03 requires the exact current G02 semantic authority head for a new Daily Stratum use');
  }
  const g01 = validateG01Head(score.identity.homeRoot, score.identity, score.threadRef);
  const response = validateLatestG01Response(score.identity.homeRoot, score.identity, score.threadRef, g01);
  if (input.expectedConversationHeadSha256 !== g01.conversationHeadSha256) {
    fail('DREAM_SOURCE_STALE', 'expected G01 conversation head is stale', { expected: input.expectedConversationHeadSha256, observed: g01.conversationHeadSha256 });
  }
  if (input.expectedScoreHeadSha256 !== score.head.scoreHeadSha256) {
    fail('DREAM_SOURCE_STALE', 'expected G02 Score head is stale', { expected: input.expectedScoreHeadSha256, observed: score.head.scoreHeadSha256 });
  }
  if (score.head.sourceConversationHeadSha256 !== g01.conversationHeadSha256) {
    fail('DREAM_SCORE_NOT_CAUGHT_UP', 'current G02 Score is not caught up to the current G01 conversation head', {
      scoreSourceConversationHeadSha256: score.head.sourceConversationHeadSha256,
      currentConversationHeadSha256: g01.conversationHeadSha256
    });
  }
  return { score, g01, response };
}

function statementBinding(statement) {
  return {
    statementRef: statement.statementRef,
    subjectRef: statement.subjectRef,
    semanticSubjectFingerprint: statement.semanticSubjectFingerprint,
    memoryRelation: statement.memoryRelation,
    statementState: statement.recordedStatementState ?? statement.statementState ?? statement.effectiveState,
    summaryHash: statement.summaryHash,
    acceptedForContinuity: statement.acceptedForContinuity,
    consentState: statement.consentState,
    semanticAuthorityHeadSha256: statement.semanticAuthorityHeadSha256,
    semanticAcceptanceRef: statement.semanticAcceptanceRef,
    semanticAcceptanceSha256: statement.semanticAcceptanceSha256,
    semanticCandidateRef: statement.semanticCandidateRef,
    semanticCandidateSha256: statement.semanticCandidateSha256,
    classificationEvidenceBindings: structuredClone(statement.classificationEvidenceBindings ?? []),
    consentDispositionRef: statement.consentDispositionRef,
    consentDispositionSha256: statement.consentDispositionSha256,
    sourceBindings: structuredClone(statement.sourceBindings ?? []),
    eventRef: statement.eventRef,
    eventHash: statement.eventHash,
    current: statement.current === true
  };
}

function openLoopBinding(loop) {
  return {
    openLoopRef: loop.openLoopRef,
    summaryRef: loop.summaryRef ?? null,
    sourceStatementRefs: [...(loop.sourceStatementRefs ?? [])].sort(),
    sourceBindings: structuredClone(loop.sourceBindings ?? []),
    eventRef: loop.eventRef,
    eventHash: loop.eventHash,
    state: 'OPEN'
  };
}

function hasCurrentSemanticAuthority(statement, currentSemanticAuthorityHead) {
  const bindings = currentSemanticAuthorityHead?.currentAcceptanceBindings;
  if (!Array.isArray(bindings)) return false;
  return bindings.some((binding) =>
    binding.semanticSubjectFingerprint === statement.semanticSubjectFingerprint &&
    binding.acceptanceRef === statement.semanticAcceptanceRef &&
    binding.acceptanceSha256 === statement.semanticAcceptanceSha256 &&
    binding.candidateRef === statement.semanticCandidateRef &&
    binding.candidateSha256 === statement.semanticCandidateSha256 &&
    binding.consentDispositionRef === statement.consentDispositionRef &&
    binding.consentDispositionSha256 === statement.consentDispositionSha256 &&
    JSON.stringify(binding.classificationEvidenceBindings) === JSON.stringify(statement.classificationEvidenceBindings ?? [])
  );
}

function canonicalDay(input) {
  const dayRef = string(input.dayRef, 'dayRef');
  if (!DAY_REF.test(dayRef)) fail('DREAM_DAY_INVALID', 'dayRef is not portable');
  if (!Number.isSafeInteger(input.dayIndex) || input.dayIndex < 0) fail('DREAM_DAY_INVALID', 'dayIndex must be one nonnegative safe integer');
  if (!CALENDAR_DATE.test(input.calendarDateRef ?? '')) fail('DREAM_DAY_INVALID', 'calendarDateRef must be YYYY-MM-DD');
  const timeZoneRef = string(input.timeZoneRef, 'timeZoneRef');
  if (timeZoneRef.length > 128 || /[\0\r\n]/u.test(timeZoneRef)) fail('DREAM_DAY_INVALID', 'timeZoneRef is invalid');
  const observedAt = canonicalTimestamp(input.observedAt, 'observedAt');
  return { dayRef, dayIndex: input.dayIndex, calendarDateRef: input.calendarDateRef, timeZoneRef, observedAt };
}

const RECEIPT_SPECS = {
  orientation: ['vextreme.daily-pre-rest-orientation/v1', 'preRestOrientationRef', 'orientationSha256', 'pre-rest-orientation'],
  preDream: ['vextreme.daily-pre-dream-state/v1', 'preDreamStateRef', 'preDreamStateSha256', 'pre-dream-state'],
  closure: ['vextreme.daily-day-closure/v1', 'dayClosureRef', 'dayClosureSha256', 'day-closure'],
  consolidation: ['vextreme.daily-memory-consolidation/v1', 'memoryConsolidationRef', 'memoryConsolidationSha256', 'memory-consolidation'],
  postDream: ['vextreme.daily-post-dream-state/v1', 'postDreamStateRef', 'postDreamStateSha256', 'post-dream-state'],
  stratum: ['vextreme.daily-stratum/v1', 'dailyStratumRef', 'dailyStratumSha256', 'daily-stratum'],
  wake: ['vextreme.daily-wake-receipt/v1', 'wakeReceiptRef', 'wakeReceiptSha256', 'daily-wake'],
  head: ['vextreme.daily-memory-dream-head/v1', 'dailyDreamHeadRef', 'dailyDreamHeadSha256', 'daily-dream-head']
};

function formKind(kind, core) {
  const [schemaVersion, refField, hashField, prefix] = RECEIPT_SPECS[kind];
  return formReceipt({ schemaVersion, refField, hashField, prefix, core });
}

function validateKind(kind, value) {
  const [schemaVersion, refField, hashField, prefix] = RECEIPT_SPECS[kind];
  return validateReceipt(value, { schemaVersion, refField, hashField, prefix, label: kind });
}

function loadStratumBundle(home, paths, stratumSha, wakeSha = null) {
  const stratum = loadAddressed(home, paths.strata, stratumSha, (value) => validateKind('stratum', value), 'Daily Stratum');
  const orientation = loadAddressed(home, paths.orientations, stratum.orientationSha256, (value) => validateKind('orientation', value), 'pre-rest orientation');
  const preDream = loadAddressed(home, paths.preDream, stratum.preDreamStateSha256, (value) => validateKind('preDream', value), 'pre-dream state');
  const closure = loadAddressed(home, paths.closures, stratum.dayClosureSha256, (value) => validateKind('closure', value), 'day closure');
  const consolidation = loadAddressed(home, paths.consolidations, stratum.memoryConsolidationSha256, (value) => validateKind('consolidation', value), 'memory consolidation');
  const postDream = loadAddressed(home, paths.postDream, stratum.postDreamStateSha256, (value) => validateKind('postDream', value), 'post-dream state');
  const wake = wakeSha === null ? null : loadAddressed(home, paths.wakes, wakeSha, (value) => validateKind('wake', value), 'wake receipt');
  const semanticAuthorityHeadSha256 = stratum.sourceSemanticAuthorityHeadSha256;
  if (!SHA256.test(semanticAuthorityHeadSha256 ?? '')) {
    fail('DREAM_RECEIPT_CORRUPT', 'Daily Stratum lacks exact G02 semantic authority head binding');
  }
  for (const [label, receipt] of [
    ['orientation', orientation], ['preDream', preDream], ['closure', closure],
    ['consolidation', consolidation], ['postDream', postDream], ...(wake ? [['wake', wake]] : [])
  ]) {
    if (receipt.sourceSemanticAuthorityHeadSha256 !== semanticAuthorityHeadSha256) {
      fail('DREAM_RECEIPT_CORRUPT', `${label} semantic authority head binding mismatch`, {
        observed: receipt.sourceSemanticAuthorityHeadSha256, expected: semanticAuthorityHeadSha256
      });
    }
  }
  const causal = [
    [preDream.orientationSha256, orientation.orientationSha256, 'preDream.orientation'],
    [closure.preDreamStateSha256, preDream.preDreamStateSha256, 'closure.preDream'],
    [consolidation.dayClosureSha256, closure.dayClosureSha256, 'consolidation.closure'],
    [postDream.memoryConsolidationSha256, consolidation.memoryConsolidationSha256, 'postDream.consolidation'],
    [stratum.preDreamStateSha256, preDream.preDreamStateSha256, 'stratum.preDream'],
    [stratum.dayClosureSha256, closure.dayClosureSha256, 'stratum.closure'],
    [stratum.memoryConsolidationSha256, consolidation.memoryConsolidationSha256, 'stratum.consolidation'],
    [stratum.postDreamStateSha256, postDream.postDreamStateSha256, 'stratum.postDream']
  ];
  if (wake) causal.push([wake.dailyStratumSha256, stratum.dailyStratumSha256, 'wake.stratum']);
  for (const [observed, expected, label] of causal) if (observed !== expected) fail('DREAM_RECEIPT_CORRUPT', `${label} causal binding mismatch`, { observed, expected });
  if (orientation.dayRef !== stratum.dayRef || preDream.dayRef !== stratum.dayRef || closure.dayRef !== stratum.dayRef || consolidation.dayRef !== stratum.dayRef || postDream.dayRef !== stratum.dayRef || (wake && wake.dayRef !== stratum.dayRef)) {
    fail('DREAM_RECEIPT_CORRUPT', 'Daily Stratum child receipt day identity mismatch');
  }
  return { stratum, orientation, preDream, closure, consolidation, postDream, wake };
}

function sourceProjectionFromHistoricalSnapshot(snapshot) {
  const currentStatements = snapshot.statements
    .filter((item) => item.current === true)
    .sort((a, b) => a.statementRef.localeCompare(b.statementRef));
  const active = currentStatements.filter((item) =>
    item.acceptedForContinuity === true &&
    POSITIVE_CONSENT.has(item.consentState) &&
    hasCurrentSemanticAuthority(item, snapshot.semanticAuthorityHead)
  ).map(statementBinding);
  const held = currentStatements.filter((item) => !(
    item.acceptedForContinuity === true &&
    POSITIVE_CONSENT.has(item.consentState) &&
    hasCurrentSemanticAuthority(item, snapshot.semanticAuthorityHead)
  )).map(statementBinding);
  const loops = snapshot.openLoops
    .filter((item) => item.state === 'OPEN')
    .sort((a, b) => a.openLoopRef.localeCompare(b.openLoopRef))
    .map(openLoopBinding);
  return { currentStatements, active, held, loops };
}

function verifyBundleAgainstHistoricalSource(identity, threadRef, bundle) {
  let snapshot;
  try {
    snapshot = verifyHistoricalScoreContextSnapshot({
      home: identity.homeRoot,
      homeRef: identity.homeRef,
      deviceRef: identity.deviceRef,
      companionLineageRef: identity.companionLineageRef,
      threadRef,
      scoreHeadSha256: bundle.stratum.sourceScoreHeadSha256,
      semanticAuthorityHeadSha256: bundle.stratum.sourceSemanticAuthorityHeadSha256
    });
  } catch (error) {
    fail('DREAM_SOURCE_INVALID', 'Daily Stratum historical source verification failed', {
      sourceCode: error?.code ?? 'UNKNOWN',
      sourceMessage: error?.message ?? String(error)
    });
  }

  const { currentStatements, active, held, loops } = sourceProjectionFromHistoricalSnapshot(snapshot);
  const response = snapshot.sourceConversation?.response;
  const expectedStatementRefs = currentStatements.map((item) => item.statementRef);
  const expectedHeldRefs = held.map((item) => item.statementRef);
  const expectedOpenLoopRefs = loops.map((item) => item.openLoopRef);
  const exact = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const sourceChecks = [
    [bundle.orientation.exactG01ConversationHeadSha256, snapshot.sourceConversationHeadSha256, 'orientation G01 head'],
    [bundle.orientation.exactG02ScoreHeadSha256, snapshot.scoreHead.scoreHeadSha256, 'orientation G02 head'],
    [bundle.preDream.sourceConversationHeadSha256, snapshot.sourceConversationHeadSha256, 'preDream G01 head'],
    [bundle.preDream.sourceConversationEventHash, response?.eventHash, 'preDream G01 response event'],
    [bundle.preDream.sourceScoreHeadSha256, snapshot.scoreHead.scoreHeadSha256, 'preDream G02 head'],
    [bundle.preDream.sourceScoreEventHash, snapshot.scoreHead.eventHash, 'preDream G02 event'],
    [bundle.closure.sourceConversationHeadSha256, snapshot.sourceConversationHeadSha256, 'closure G01 head'],
    [bundle.closure.sourceScoreHeadSha256, snapshot.scoreHead.scoreHeadSha256, 'closure G02 head'],
    [bundle.consolidation.sourceConversationHeadSha256, snapshot.sourceConversationHeadSha256, 'consolidation G01 head'],
    [bundle.consolidation.sourceScoreHeadSha256, snapshot.scoreHead.scoreHeadSha256, 'consolidation G02 head'],
    [bundle.postDream.sourceConversationHeadSha256, snapshot.sourceConversationHeadSha256, 'postDream G01 head'],
    [bundle.postDream.sourceScoreHeadSha256, snapshot.scoreHead.scoreHeadSha256, 'postDream G02 head'],
    [bundle.stratum.sourceConversationHeadSha256, snapshot.sourceConversationHeadSha256, 'stratum G01 head'],
    [bundle.stratum.sourceScoreHeadSha256, snapshot.scoreHead.scoreHeadSha256, 'stratum G02 head'],
    [bundle.stratum.sourceSemanticAuthorityHeadSha256, snapshot.semanticAuthorityHead.semanticAuthorityHeadSha256, 'stratum semantic authority head'],
    [bundle.preDream.preDreamRuntimeRef, response?.endpointProfileRef, 'preDream runtime'],
    [bundle.preDream.preDreamModelProfileRef, response?.modelProfileRef, 'preDream model'],
    [bundle.postDream.selectedRuntimeRef, response?.endpointProfileRef, 'postDream runtime'],
    [bundle.postDream.selectedModelProfileRef, response?.modelProfileRef, 'postDream model'],
    [bundle.postDream.preDreamRuntimeRef, response?.endpointProfileRef, 'postDream pre-runtime'],
    [bundle.postDream.preDreamModelProfileRef, response?.modelProfileRef, 'postDream pre-model'],
    [bundle.stratum.sourceRuntimeRef, response?.endpointProfileRef, 'stratum runtime'],
    [bundle.stratum.sourceModelProfileRef, response?.modelProfileRef, 'stratum model']
  ];
  if (bundle.wake) sourceChecks.push(
    [bundle.wake.selectedRuntimeRef, response?.endpointProfileRef, 'wake runtime'],
    [bundle.wake.selectedModelProfileRef, response?.modelProfileRef, 'wake model'],
    [bundle.wake.preDreamRuntimeRef, response?.endpointProfileRef, 'wake pre-runtime'],
    [bundle.wake.preDreamModelProfileRef, response?.modelProfileRef, 'wake pre-model']
  );
  const mismatch = sourceChecks.find(([observed, expected]) => observed !== expected);
  if (mismatch) fail('DREAM_SOURCE_INVALID', `${mismatch[2]} differs from source-owned historical verification`, { observed: mismatch[0], expected: mismatch[1] });

  const projectionChecks = [
    [bundle.preDream.currentStatementRefs, expectedStatementRefs, 'preDream current statements'],
    [bundle.preDream.openLoopRefs, expectedOpenLoopRefs, 'preDream open loops'],
    [bundle.closure.currentStatementRefs, expectedStatementRefs, 'closure current statements'],
    [bundle.closure.heldOrDeferredStatementRefs, expectedHeldRefs, 'closure held statements'],
    [bundle.closure.openLoopRefs, expectedOpenLoopRefs, 'closure open loops'],
    [bundle.consolidation.carriedCurrentScoreBindings, active, 'consolidation active bindings'],
    [bundle.consolidation.heldOrDeferredScoreBindings, held, 'consolidation held bindings'],
    [bundle.consolidation.openLoopCarryForwardBindings, loops, 'consolidation open loops'],
    [bundle.postDream.activeContinuityStatementRefs, active.map((item) => item.statementRef), 'postDream active statements'],
    [bundle.postDream.heldOrDeferredStatementRefs, expectedHeldRefs, 'postDream held statements'],
    [bundle.postDream.openLoopRefs, expectedOpenLoopRefs, 'postDream open loops']
  ];
  if (bundle.wake) projectionChecks.push(
    [bundle.wake.openLoopRefs, expectedOpenLoopRefs, 'wake open loops'],
    [bundle.wake.heldOrDeferredRefs, expectedHeldRefs, 'wake held statements']
  );
  const projectionMismatch = projectionChecks.find(([observed, expected]) => !exact(observed, expected));
  if (projectionMismatch) fail('DREAM_SOURCE_INVALID', `${projectionMismatch[2]} differs from source-owned historical projection`, { observed: projectionMismatch[0], expected: projectionMismatch[1] });

  return snapshot;
}

function loadVerifiedStratumBundle(identity, threadRef, paths, stratumSha, wakeSha = null) {
  const bundle = loadStratumBundle(identity.homeRoot, paths, stratumSha, wakeSha);
  const sourceVerification = verifyBundleAgainstHistoricalSource(identity, threadRef, bundle);
  return { ...bundle, sourceVerification };
}

function readAllStrata(home, paths) {
  if (!fs.existsSync(paths.strata)) return { valid: [], invalid: [] };
  const stat = fs.lstatSync(paths.strata);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('DREAM_HOME_IDENTITY_MISMATCH', 'Daily Strata path must be one canonical directory');
  const valid = []; const invalid = [];
  for (const entry of fs.readdirSync(paths.strata, { withFileTypes: true }).filter((item) => item.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(paths.strata, entry.name);
    try {
      if (entry.isSymbolicLink() || !entry.isFile()) fail('DREAM_RECEIPT_CORRUPT', 'Daily Stratum entry is not one regular file');
      ensureRegularCanonicalFile(home, file, 'DREAM_RECEIPT_CORRUPT', 'Daily Stratum entry');
      const value = validateKind('stratum', readJson(file, 'DREAM_RECEIPT_CORRUPT', 'Daily Stratum entry'));
      if (entry.name !== `${value.dailyStratumSha256}.json`) fail('DREAM_RECEIPT_CORRUPT', 'Daily Stratum filename is not content-addressed');
      valid.push(value);
    } catch (error) { invalid.push({ file: entry.name, code: error.code ?? 'DREAM_RECEIPT_CORRUPT', message: error.message }); }
  }
  return { valid, invalid };
}

function verifyHead(home, paths, identity, threadRef) {
  if (!fs.existsSync(paths.head)) return null;
  ensureRegularCanonicalFile(home, paths.head, 'DREAM_HEAD_MISMATCH', 'current Daily Dream head');
  const head = validateKind('head', readJson(paths.head, 'DREAM_HEAD_MISMATCH', 'current Daily Dream head'));
  if (head.homeRef !== identity.homeRef || head.deviceRef !== identity.deviceRef || head.companionLineageRef !== identity.companionLineageRef || head.threadRef !== threadRef ||
      !Number.isSafeInteger(head.sequence) || head.sequence < 0 || !SHA256.test(head.dailyStratumSha256 ?? '') ||
      !SHA256.test(head.sourceSemanticAuthorityHeadSha256 ?? '') ||
      (head.sequence === 0 ? head.priorDailyDreamHeadSha256 !== null : !SHA256.test(head.priorDailyDreamHeadSha256 ?? ''))) {
    fail('DREAM_HEAD_MISMATCH', 'current Daily Dream head identity is invalid');
  }
  const immutable = loadAddressed(home, paths.heads, head.dailyDreamHeadSha256, (value) => validateKind('head', value), 'immutable Daily Dream head');
  if (semanticHash(immutable) !== semanticHash(head)) fail('DREAM_HEAD_MISMATCH', 'current Daily Dream head lacks exact immutable receipt');
  return head;
}

export function loadDailyMemoryDreamState({ home, homeRef, deviceRef, companionLineageRef, threadRef }) {
  const score = loadScoreContextState({ home, homeRef, deviceRef, companionLineageRef, threadRef });
  const identity = score.identity;
  const thread = safeRef(threadRef, 'threadRef', 'DREAM_HOME_IDENTITY_MISMATCH');
  const paths = dreamPaths(identity.homeRoot, identity.companionLineageRef, thread);
  const { valid: strata, invalid } = readAllStrata(identity.homeRoot, paths);
  const byStratumHash = new Map(strata.map((item) => [item.dailyStratumSha256, item]));
  const head = verifyHead(identity.homeRoot, paths, identity, thread);
  const headChain = [];
  if (head) {
    let cursor = head;
    const seen = new Set();
    while (cursor) {
      if (seen.has(cursor.dailyDreamHeadSha256)) fail('DREAM_HEAD_MISMATCH', 'Daily Dream head lineage contains a cycle');
      seen.add(cursor.dailyDreamHeadSha256);
      headChain.push(cursor);
      if (cursor.sequence === 0) {
        if (cursor.priorDailyDreamHeadSha256 !== null) fail('DREAM_HEAD_MISMATCH', 'Daily Dream genesis head has a prior head');
        break;
      }
      const prior = loadAddressed(identity.homeRoot, paths.heads, cursor.priorDailyDreamHeadSha256, (value) => validateKind('head', value), 'prior Daily Dream head');
      if (prior.sequence !== cursor.sequence - 1) fail('DREAM_HEAD_MISMATCH', 'Daily Dream head sequence is not contiguous');
      cursor = prior;
    }
    headChain.reverse();
  }
  const chain = [];
  for (let index = 0; index < headChain.length; index += 1) {
    const h = headChain[index];
    const stratum = byStratumHash.get(h.dailyStratumSha256);
    if (!stratum) fail('DREAM_RECEIPT_CORRUPT', 'Daily Dream head references a missing stratum', { dailyStratumSha256: h.dailyStratumSha256 });
    if (stratum.sequence !== index || stratum.priorDailyStratumSha256 !== (index ? chain[index - 1].dailyStratumSha256 : null) || h.sequence !== index || h.dayRef !== stratum.dayRef || h.dayIndex !== stratum.dayIndex) {
      fail('DREAM_HEAD_MISMATCH', 'Daily Dream head/stratum lineage is not contiguous');
    }
    loadVerifiedStratumBundle(identity, thread, paths, stratum.dailyStratumSha256, h.wakeReceiptSha256);
    chain.push(stratum);
  }
  if (head && chain.at(-1)?.dailyStratumSha256 !== head.dailyStratumSha256) fail('DREAM_HEAD_MISMATCH', 'Daily Dream head does not bind exact final stratum');
  const reachable = new Set(chain.map((item) => item.dailyStratumSha256));
  const uncommittedTail = [];
  const attention = invalid.map((item) => ({ code: 'INVALID_TAIL', ...item }));
  const expectedSequence = head ? head.sequence + 1 : 0;
  const expectedPrior = head?.dailyStratumSha256 ?? null;
  for (const stratum of strata.filter((item) => !reachable.has(item.dailyStratumSha256)).sort((a, b) => a.sequence - b.sequence || a.dailyStratumSha256.localeCompare(b.dailyStratumSha256))) {
    try {
      loadVerifiedStratumBundle(identity, thread, paths, stratum.dailyStratumSha256, null);
      if (stratum.sequence === expectedSequence && stratum.priorDailyStratumSha256 === expectedPrior) uncommittedTail.push(stratum);
      else attention.push({ code: 'INVALID_TAIL', reason: 'REORDERED_OR_READRESSED_DREAM_TAIL', dailyStratumRef: stratum.dailyStratumRef });
    } catch (error) { attention.push({ code: 'INVALID_TAIL', reason: error.code ?? 'DREAM_RECEIPT_CORRUPT', dailyStratumRef: stratum.dailyStratumRef, message: error.message }); }
  }
  if (uncommittedTail.length > 1) attention.push({ code: 'INVALID_TAIL', reason: 'MULTIPLE_COMPETING_DREAM_TAILS', count: uncommittedTail.length });
  const currentHead = headChain.at(-1) ?? null;
  return {
    schemaVersion: 'vexlife.daily-memory-dream-state/v1',
    state: attention.length ? 'ATTENTION' : 'CURRENT',
    currentness: attention.length ? 'ATTENTION' : 'CURRENT',
    identity,
    threadRef: thread,
    scoreHeadSha256: score.head?.scoreHeadSha256 ?? null,
    head: currentHead,
    headChain,
    chain,
    currentDailyStratum: currentHead ? loadVerifiedStratumBundle(identity, thread, paths, currentHead.dailyStratumSha256, currentHead.wakeReceiptSha256) : null,
    uncommittedTail,
    attention,
    writer: writerObservation(paths),
    rawDurableStratumEqualsCommittedCurrentDream: false,
    contractRef: DAILY_MEMORY_DREAM_CONTRACT,
    memoryOwnerRef: DAILY_MEMORY_DREAM_MEMORY_OWNER,
    safetyOwnerRef: DAILY_MEMORY_DREAM_SAFETY_OWNER,
    mainVexConvergenceRef: DAILY_MEMORY_DREAM_MAIN_VEX_CONVERGENCE
  };
}

function sameDayInput(existing, bundle, day, input) {
  return existing.dayRef === day.dayRef &&
    existing.dayIndex === day.dayIndex &&
    existing.calendarDateRef === day.calendarDateRef &&
    existing.timeZoneRef === day.timeZoneRef &&
    existing.observedAt === day.observedAt &&
    existing.sourceConversationHeadSha256 === input.expectedConversationHeadSha256 &&
    existing.sourceScoreHeadSha256 === input.expectedScoreHeadSha256 &&
    bundle.orientation.restInvocationAuthorityRef === input.restInvocationAuthorityRef;
}

export function commitDailyMemoryDream(input) {
  const day = canonicalDay(input);
  const restInvocationAuthorityRef = safeRef(input.restInvocationAuthorityRef, 'restInvocationAuthorityRef', 'DREAM_INVOCATION_INVALID');
  const instanceRef = safeRef(input.instanceRef, 'instanceRef', 'DREAM_INVOCATION_INVALID');
  const initialScore = loadScoreContextState({ home: input.home, homeRef: input.homeRef, deviceRef: input.deviceRef, companionLineageRef: input.companionLineageRef, threadRef: input.threadRef });
  const paths = dreamPaths(initialScore.identity.homeRoot, initialScore.identity.companionLineageRef, initialScore.threadRef);
  const lease = acquireWriter(paths, initialScore.identity.companionLineageRef, initialScore.threadRef, instanceRef);
  try {
    const state = loadDailyMemoryDreamState({ home: initialScore.identity.homeRoot, homeRef: initialScore.identity.homeRef, deviceRef: initialScore.identity.deviceRef, companionLineageRef: initialScore.identity.companionLineageRef, threadRef: initialScore.threadRef });
    if (state.attention.length) fail('DREAM_TAIL_ATTENTION', 'Daily Dream invalid tail requires attention before another day commit', { attention: state.attention });
    if (state.uncommittedTail.length) {
      if (state.uncommittedTail.length !== 1 || state.uncommittedTail[0].dayRef !== day.dayRef) {
        fail('DREAM_TAIL_ATTENTION', 'only an exact retry of the one well-formed uncommitted day may complete crash recovery', {
          requestedDayRef: day.dayRef, uncommittedTail: state.uncommittedTail.map((item) => item.dailyStratumRef)
        });
      }
      const tail = state.uncommittedTail[0];
      const tailBundle = loadVerifiedStratumBundle(initialScore.identity, initialScore.threadRef, paths, tail.dailyStratumSha256, null);
      if (!sameDayInput(tail, tailBundle, day, input)) {
        fail('DREAM_TAIL_ATTENTION', 'uncommitted Daily Stratum differs from the exact retry invocation/source/content identity', { dayRef: day.dayRef });
      }
    }
    const existingSameDay = state.chain.find((item) => item.dayRef === day.dayRef);
    if (existingSameDay) {
      const committedHead = state.headChain.find((item) => item.dailyStratumSha256 === existingSameDay.dailyStratumSha256);
      if (!committedHead) fail('DREAM_HEAD_MISMATCH', 'committed duplicate day lacks its immutable Dream head');
      const bundle = loadVerifiedStratumBundle(initialScore.identity, initialScore.threadRef, paths, existingSameDay.dailyStratumSha256, committedHead.wakeReceiptSha256);
      if (!sameDayInput(existingSameDay, bundle, day, input)) {
        fail('DREAM_DAY_CONFLICT', 'dayRef is already committed for a different exact invocation/source/content identity', { dayRef: day.dayRef });
      }
      return { state: 'IDEMPOTENT_REPLAY', head: state.head, stratum: existingSameDay, bundle, idempotent: true };
    }
    if ((state.head?.dailyDreamHeadSha256 ?? null) !== (input.expectedDailyDreamHeadSha256 ?? null)) {
      fail('DREAM_HEAD_MISMATCH', 'expected Daily Dream head does not match current head', { expected: input.expectedDailyDreamHeadSha256 ?? null, observed: state.head?.dailyDreamHeadSha256 ?? null });
    }
    const frontier = sourceFrontier({ ...input, home: initialScore.identity.homeRoot, homeRef: initialScore.identity.homeRef, deviceRef: initialScore.identity.deviceRef, companionLineageRef: initialScore.identity.companionLineageRef, threadRef: initialScore.threadRef });
    const sourceSemanticAuthorityHeadSha256 = frontier.score.currentSemanticAuthorityHead.semanticAuthorityHeadSha256;
    if (state.uncommittedTail.length && state.uncommittedTail[0].sourceSemanticAuthorityHeadSha256 !== sourceSemanticAuthorityHeadSha256) {
      fail('DREAM_TAIL_ATTENTION', 'uncommitted Daily Stratum cannot be completed under a different current semantic authority head', {
        tailSemanticAuthorityHeadSha256: state.uncommittedTail[0].sourceSemanticAuthorityHeadSha256,
        currentSemanticAuthorityHeadSha256: sourceSemanticAuthorityHeadSha256
      });
    }
    if (state.head && day.dayIndex !== state.head.dayIndex + 1) fail('DREAM_DAY_INVALID', 'dayIndex must advance exactly one committed day', { expected: state.head.dayIndex + 1, observed: day.dayIndex });
    if (!state.head && day.dayIndex !== 0) fail('DREAM_DAY_INVALID', 'first Daily Stratum must use dayIndex 0');

    const currentStatements = frontier.score.statements.filter((item) => item.current === true).sort((a, b) => a.statementRef.localeCompare(b.statementRef));
    const active = currentStatements.filter((item) =>
      item.acceptedForContinuity === true &&
      POSITIVE_CONSENT.has(item.consentState) &&
      hasCurrentSemanticAuthority(item, frontier.score.currentSemanticAuthorityHead)
    ).map(statementBinding);
    const held = currentStatements.filter((item) => !(
      item.acceptedForContinuity === true &&
      POSITIVE_CONSENT.has(item.consentState) &&
      hasCurrentSemanticAuthority(item, frontier.score.currentSemanticAuthorityHead)
    )).map(statementBinding);
    const loops = frontier.score.openLoops.filter((item) => item.state === 'OPEN').sort((a, b) => a.openLoopRef.localeCompare(b.openLoopRef)).map(openLoopBinding);

    const common = {
      homeRef: frontier.score.identity.homeRef,
      deviceRef: frontier.score.identity.deviceRef,
      companionLineageRef: frontier.score.identity.companionLineageRef,
      threadRef: frontier.score.threadRef,
      ...day,
      contractRef: DAILY_MEMORY_DREAM_CONTRACT,
      privacyClass: 'DEVICE_PRIVATE',
      sourceSemanticAuthorityHeadSha256
    };
    const orientation = formKind('orientation', {
      ...common,
      invocationMode: 'MANUAL_ONE_SHOT',
      restInvocationAuthorityRef,
      selectedMode: 'MEMORY_ONLY_CONSOLIDATION',
      exactG01ConversationHeadSha256: frontier.g01.conversationHeadSha256,
      exactG02ScoreHeadSha256: frontier.score.head.scoreHeadSha256,
      allowedChangeClasses: ['DAILY_MEMORY_FRONTIER', 'DAILY_STRATUM', 'WAKE_RECEIPT'],
      heldChangeClasses: ['MODEL_WEIGHTS', 'RHYTHM', 'TRAINING', 'SYNC', 'PUBLICATION', 'POWER_CONTROL', 'FIRST_PERSON_AUTHORITY'],
      openLoopRefs: loops.map((item) => item.openLoopRef),
      noticeState: 'FORMED',
      formedAt: day.observedAt
    });
    writeAddressed(frontier.score.identity.homeRoot, paths.orientations, 'orientationSha256', orientation, 'pre-rest orientation');

    const preDream = formKind('preDream', {
      ...common,
      orientationSha256: orientation.orientationSha256,
      sourceConversationHeadSha256: frontier.g01.conversationHeadSha256,
      sourceConversationEventHash: frontier.g01.eventHash,
      sourceScoreHeadSha256: frontier.score.head.scoreHeadSha256,
      sourceScoreEventHash: frontier.score.head.eventHash,
      currentStatementRefs: currentStatements.map((item) => item.statementRef),
      openLoopRefs: loops.map((item) => item.openLoopRef),
      preDreamRuntimeRef: frontier.response.endpointProfileRef,
      preDreamModelProfileRef: frontier.response.modelProfileRef,
      rawConversationContentIncluded: false,
      formedAt: day.observedAt
    });
    writeAddressed(frontier.score.identity.homeRoot, paths.preDream, 'preDreamStateSha256', preDream, 'pre-dream state');

    const closure = formKind('closure', {
      ...common,
      preDreamStateSha256: preDream.preDreamStateSha256,
      sourceConversationHeadSha256: frontier.g01.conversationHeadSha256,
      sourceScoreHeadSha256: frontier.score.head.scoreHeadSha256,
      currentStatementRefs: currentStatements.map((item) => item.statementRef),
      heldOrDeferredStatementRefs: held.map((item) => item.statementRef),
      openLoopRefs: loops.map((item) => item.openLoopRef),
      closureState: 'FROZEN',
      rawConversationContentIncluded: false,
      formedAt: day.observedAt
    });
    writeAddressed(frontier.score.identity.homeRoot, paths.closures, 'dayClosureSha256', closure, 'day closure');

    const consolidation = formKind('consolidation', {
      ...common,
      dayClosureSha256: closure.dayClosureSha256,
      carriedCurrentScoreBindings: active,
      heldOrDeferredScoreBindings: held,
      openLoopCarryForwardBindings: loops,
      sourceConversationHeadSha256: frontier.g01.conversationHeadSha256,
      sourceScoreHeadSha256: frontier.score.head.scoreHeadSha256,
      referenceLevelOnly: true,
      rawConversationContentIncluded: false,
      newSemanticAcceptanceCreated: false,
      firstPersonAuthorityGranted: false,
      lineageAwareGenerativeDreamRan: false,
      systemMemoryConsolidationRan: true,
      rhythmLearned: false,
      trainingRan: false,
      modelWeightsChanged: false,
      adapterChanged: false,
      synchronizationActivated: false,
      publicationPerformed: false,
      poweredDown: false,
      formedAt: day.observedAt
    });
    writeAddressed(frontier.score.identity.homeRoot, paths.consolidations, 'memoryConsolidationSha256', consolidation, 'memory consolidation');

    const postDream = formKind('postDream', {
      ...common,
      memoryConsolidationSha256: consolidation.memoryConsolidationSha256,
      sourceConversationHeadSha256: frontier.g01.conversationHeadSha256,
      sourceScoreHeadSha256: frontier.score.head.scoreHeadSha256,
      activeContinuityStatementRefs: active.map((item) => item.statementRef),
      heldOrDeferredStatementRefs: held.map((item) => item.statementRef),
      openLoopRefs: loops.map((item) => item.openLoopRef),
      selectedRuntimeRef: frontier.response.endpointProfileRef,
      selectedModelProfileRef: frontier.response.modelProfileRef,
      preDreamRuntimeRef: frontier.response.endpointProfileRef,
      preDreamModelProfileRef: frontier.response.modelProfileRef,
      memoryFrontierChanged: true,
      rawConversationContentIncluded: false,
      formedAt: day.observedAt
    });
    writeAddressed(frontier.score.identity.homeRoot, paths.postDream, 'postDreamStateSha256', postDream, 'post-dream state');

    const sequence = state.head ? state.head.sequence + 1 : 0;
    const stratum = formKind('stratum', {
      ...common,
      sequence,
      priorDailyStratumSha256: state.head?.dailyStratumSha256 ?? null,
      orientationSha256: orientation.orientationSha256,
      preDreamStateSha256: preDream.preDreamStateSha256,
      dayClosureSha256: closure.dayClosureSha256,
      memoryConsolidationSha256: consolidation.memoryConsolidationSha256,
      postDreamStateSha256: postDream.postDreamStateSha256,
      sourceConversationHeadSha256: frontier.g01.conversationHeadSha256,
      sourceScoreHeadSha256: frontier.score.head.scoreHeadSha256,
      sourceModelProfileRef: frontier.response.modelProfileRef,
      sourceRuntimeRef: frontier.response.endpointProfileRef,
      modelWeightsChanged: false,
      trainingRan: false,
      rhythmLearned: false,
      synchronizationActivated: false,
      formedAt: day.observedAt
    });
    writeAddressed(frontier.score.identity.homeRoot, paths.strata, 'dailyStratumSha256', stratum, 'Daily Stratum');
    if (input.faults?.exitAfterStratumWrite === true) process.exit(93);
    if (input.faults?.failAfterStratumWrite === true) fail('DREAM_HEAD_MISMATCH', 'simulated failure after durable Daily Stratum before wake/head advance');

    const wake = formKind('wake', {
      ...common,
      dailyStratumSha256: stratum.dailyStratumSha256,
      selectedMode: 'MEMORY_ONLY_CONSOLIDATION',
      lineageAwareGenerativeDreamRan: false,
      systemMemoryConsolidationRan: true,
      trainingRan: false,
      modelWeightsChanged: false,
      adapterChanged: false,
      selectedRuntimeRef: frontier.response.endpointProfileRef,
      selectedModelProfileRef: frontier.response.modelProfileRef,
      preDreamRuntimeRef: frontier.response.endpointProfileRef,
      preDreamModelProfileRef: frontier.response.modelProfileRef,
      memoryFrontierChanged: true,
      poweredDown: false,
      synchronizationActivated: false,
      publicationPerformed: false,
      openLoopRefs: loops.map((item) => item.openLoopRef),
      heldOrDeferredRefs: held.map((item) => item.statementRef),
      successorState: 'FRESH_PROCESS_MAY_RESUME_FROM_COMMITTED_STRATUM',
      uninterruptedSubjectiveAwarenessClaimed: false,
      formedAt: day.observedAt
    });
    writeAddressed(frontier.score.identity.homeRoot, paths.wakes, 'wakeReceiptSha256', wake, 'wake receipt');

    const headCore = {
      schemaVersion: 'vextreme.daily-memory-dream-head/v1',
      homeRef: frontier.score.identity.homeRef,
      deviceRef: frontier.score.identity.deviceRef,
      companionLineageRef: frontier.score.identity.companionLineageRef,
      threadRef: frontier.score.threadRef,
      sequence,
      dayRef: day.dayRef,
      dayIndex: day.dayIndex,
      dailyStratumSha256: stratum.dailyStratumSha256,
      wakeReceiptSha256: wake.wakeReceiptSha256,
      sourceConversationHeadSha256: frontier.g01.conversationHeadSha256,
      sourceScoreHeadSha256: frontier.score.head.scoreHeadSha256,
      sourceSemanticAuthorityHeadSha256,
      priorDailyDreamHeadSha256: state.head?.dailyDreamHeadSha256 ?? null,
      contractRef: DAILY_MEMORY_DREAM_CONTRACT,
      formedAt: day.observedAt
    };
    const head = formReceipt({ schemaVersion: headCore.schemaVersion, refField: 'dailyDreamHeadRef', hashField: 'dailyDreamHeadSha256', prefix: 'daily-dream-head', core: (() => { const c = { ...headCore }; delete c.schemaVersion; return c; })() });
    writeAddressed(frontier.score.identity.homeRoot, paths.heads, 'dailyDreamHeadSha256', head, 'immutable Daily Dream head');

    const finalFrontier = sourceFrontier({
      ...input,
      home: initialScore.identity.homeRoot,
      homeRef: initialScore.identity.homeRef,
      deviceRef: initialScore.identity.deviceRef,
      companionLineageRef: initialScore.identity.companionLineageRef,
      threadRef: initialScore.threadRef
    });
    const finalSemanticAuthorityHeadSha256 = finalFrontier.score.currentSemanticAuthorityHead.semanticAuthorityHeadSha256;
    if (finalFrontier.g01.conversationHeadSha256 !== frontier.g01.conversationHeadSha256 ||
        finalFrontier.score.head.scoreHeadSha256 !== frontier.score.head.scoreHeadSha256 ||
        finalSemanticAuthorityHeadSha256 !== sourceSemanticAuthorityHeadSha256) {
      fail('DREAM_SOURCE_STALE', 'G03 source frontier changed before atomic Daily Dream head advance', {
        initialConversationHeadSha256: frontier.g01.conversationHeadSha256,
        finalConversationHeadSha256: finalFrontier.g01.conversationHeadSha256,
        initialScoreHeadSha256: frontier.score.head.scoreHeadSha256,
        finalScoreHeadSha256: finalFrontier.score.head.scoreHeadSha256,
        initialSemanticAuthorityHeadSha256: sourceSemanticAuthorityHeadSha256,
        finalSemanticAuthorityHeadSha256
      });
    }

    atomicWrite(paths.head, head, input.faults ?? {});
    return { state: 'COMMITTED', idempotent: false, orientation, preDream, closure, consolidation, postDream, stratum, wake, head };
  } finally {
    if (!input.faults?.exitAfterStratumWrite && !releaseWriter(lease)) fail('DREAM_WRITER_CONFLICT', 'Daily Dream writer lease could not be released safely');
  }
}

export function projectDailyMemoryDream(input) {
  const state = loadDailyMemoryDreamState(input);
  const current = state.currentDailyStratum;
  return {
    schemaVersion: 'vexlife.daily-memory-dream-projection/v1',
    state: state.state,
    currentness: state.currentness,
    currentDailyDreamHead: state.head,
    currentDailyStratumRef: current?.stratum.dailyStratumRef ?? null,
    currentDailyStratumSha256: current?.stratum.dailyStratumSha256 ?? null,
    dayRef: current?.stratum.dayRef ?? null,
    dayIndex: current?.stratum.dayIndex ?? null,
    activeContinuityStatementRefs: current?.postDream.activeContinuityStatementRefs ?? [],
    heldOrDeferredStatementRefs: current?.postDream.heldOrDeferredStatementRefs ?? [],
    openLoopRefs: current?.postDream.openLoopRefs ?? [],
    selectedRuntimeRef: current?.wake.selectedRuntimeRef ?? null,
    selectedModelProfileRef: current?.wake.selectedModelProfileRef ?? null,
    lineageAwareGenerativeDreamRan: current?.wake.lineageAwareGenerativeDreamRan ?? false,
    systemMemoryConsolidationRan: current?.wake.systemMemoryConsolidationRan ?? false,
    trainingRan: current?.wake.trainingRan ?? false,
    modelWeightsChanged: current?.wake.modelWeightsChanged ?? false,
    rhythmLearned: current?.consolidation.rhythmLearned ?? false,
    synchronizationActivated: current?.wake.synchronizationActivated ?? false,
    publicationPerformed: current?.wake.publicationPerformed ?? false,
    poweredDown: current?.wake.poweredDown ?? false,
    firstPersonAuthorityGranted: current?.consolidation.firstPersonAuthorityGranted ?? false,
    rawConversationContentIncluded: current?.consolidation.rawConversationContentIncluded ?? false,
    uncommittedTailRefs: state.uncommittedTail.map((item) => item.dailyStratumRef),
    attention: state.attention,
    contractRef: DAILY_MEMORY_DREAM_CONTRACT
  };
}

export function sourceDescentForDailyStratum(input, dailyStratumSha256 = null) {
  const state = loadDailyMemoryDreamState(input);
  const sha = dailyStratumSha256 ?? state.head?.dailyStratumSha256;
  if (!sha) fail('DREAM_HEAD_MISMATCH', 'no Daily Stratum is available for source descent');
  const paths = dreamPaths(state.identity.homeRoot, state.identity.companionLineageRef, state.threadRef);
  const head = state.headChain.find((item) => item.dailyStratumSha256 === sha) ?? null;
  if (!head) fail('DREAM_HEAD_MISMATCH', 'requested Daily Stratum is not in the committed Daily Dream head lineage', { dailyStratumSha256: sha });
  const bundle = loadVerifiedStratumBundle(state.identity, state.threadRef, paths, sha, head.wakeReceiptSha256);
  return {
    dailyStratumRef: bundle.stratum.dailyStratumRef,
    dailyStratumSha256: bundle.stratum.dailyStratumSha256,
    sourceConversationHeadSha256: bundle.stratum.sourceConversationHeadSha256,
    sourceScoreHeadSha256: bundle.stratum.sourceScoreHeadSha256,
    sourceSemanticAuthorityHeadSha256: bundle.stratum.sourceSemanticAuthorityHeadSha256,
    orientationSha256: bundle.orientation.orientationSha256,
    preDreamStateSha256: bundle.preDream.preDreamStateSha256,
    dayClosureSha256: bundle.closure.dayClosureSha256,
    memoryConsolidationSha256: bundle.consolidation.memoryConsolidationSha256,
    postDreamStateSha256: bundle.postDream.postDreamStateSha256,
    wakeReceiptSha256: bundle.wake.wakeReceiptSha256,
    historicalSourceVerificationState: bundle.sourceVerification.state,
    verifiedSourceConversationResponseEventHash: bundle.sourceVerification.sourceConversation.response.eventHash,
    verifiedSourceRuntimeRef: bundle.sourceVerification.sourceConversation.response.endpointProfileRef,
    verifiedSourceModelProfileRef: bundle.sourceVerification.sourceConversation.response.modelProfileRef,
    rawConversationContentIncluded: false,
    newSemanticAcceptanceCreated: bundle.consolidation.newSemanticAcceptanceCreated,
    firstPersonAuthorityGranted: bundle.consolidation.firstPersonAuthorityGranted
  };
}

// [VXG RealForever]
