import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { semanticHash } from './utils.mjs';
import { loadScoreContextState } from './score-context-continuity.mjs';
import { commitDailyMemoryDream, loadDailyMemoryDreamState, sourceDescentForDailyStratum } from './daily-memory-dream.mjs';
import { evaluateStageASimulatedRhythm } from './evaluated-rhythm-learning.mjs';
import { createResourceSnapshot, evaluateCurrentResourceAdmission } from './resource-admission.mjs';

export const SCHEDULED_DAILY_AUTONOMY_MODE = 'DETERMINISTIC_SCHEDULED_AUTONOMY_CORE';
export const SCHEDULED_DAILY_AUTONOMY_SCHEMA = 'vexlife.g05a.scheduled-daily-autonomy/v1';
export const POSITIVE_STANDING_CONSENT = Object.freeze(['PERMITTED', 'NARROWED']);
export const OPTIONAL_LEARNING_POLICIES = Object.freeze(['ABSENT', 'DEFERRED', 'EVALUATE_AFTER_WAKE']);
export const OPTIONAL_LEARNING_DISPOSITIONS = Object.freeze(['ABSENT', 'DEFERRED', 'REJECTED', 'FAILED', 'ACCEPTED_INACTIVE']);
export const G05A_FAILURE_CODES = Object.freeze([
  'G05A_HOME_IDENTITY_MISMATCH',
  'G05A_POLICY_INVALID',
  'G05A_POLICY_NOT_CURRENT',
  'G05A_CLOCK_INVALID',
  'G05A_SOURCE_STALE',
  'G05A_ADMISSION_EVIDENCE_INVALID',
  'G05A_SUPERVISOR_CONFLICT',
  'G05A_SUPERVISOR_RECOVERY_REQUIRED',
  'G05A_DREAM_FAILED',
  'G05A_WAKE_NOT_COMMITTED',
  'G05A_RECOVERY_POLICY_DRIFT',
  'G05A_RECEIPT_CORRUPT',
  'G05A_HELD_EFFECT_VIOLATION',
  'G05A_AFTER_WAKE_FAULT'
]);

const REF = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/u;
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const DAILY_RECEIPT_SCHEMA = 'vexlife.g05a.daily-autonomy-receipt/v2';
const DAILY_HEAD_SCHEMA = 'vexlife.g05a.daily-autonomy-head/v2';
const POLICY_HEAD_SCHEMA = 'vexlife.g05a.standing-rest-policy-head/v2';
const ADMISSION_EVIDENCE_SCHEMA = 'vexlife.g05a.supervisor-admission-evidence/v1';
const ADMISSION_EVIDENCE_CONTRACT = 'contract.vexlife.g05a.supervisor-admission-evidence/v1';
const FRONTIER_FIELDS = Object.freeze(['conversationHeadSha256','scoreHeadSha256','semanticAuthorityHeadSha256','dreamHeadSha256','dailyStratumSha256','wakeReceiptSha256']);
const G05A_RESOURCE_REQUEST = Object.freeze({ cpuSlots: 1, ramMb: 64, vramMb: 0, modelTurn: false, heavyTool: false, background: true });
const NEXT_SAFE_ROUTE = 'G05B_BOUNDED_SYNC_REQUIRES_SEPARATE_TARGET_AND_HOST_AUTHORITY';
const HELD_EFFECT_FIELDS = Object.freeze([
  'synchronizationPerformed', 'trainingPerformed', 'modelWeightsChanged', 'adapterChanged',
  'rhythmActivationPerformed', 'powerControlPerformed', 'nativeWindowsServiceInstalled', 'publicationPerformed'
]);

export class ScheduledDailyAutonomyError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'ScheduledDailyAutonomyError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new ScheduledDailyAutonomyError(code, message, details);
}

function string(value, label, code = 'G05A_POLICY_INVALID') {
  if (typeof value !== 'string' || value.length === 0) fail(code, `${label} is required`);
  return value;
}

function safeRef(value, label, code = 'G05A_POLICY_INVALID') {
  const ref = string(value, label, code);
  const stem = ref.split('.')[0];
  if (!REF.test(ref) || WINDOWS_RESERVED.test(stem) || path.isAbsolute(ref) || path.win32.isAbsolute(ref) || path.posix.isAbsolute(ref)) {
    fail(code, `${label} must be one lowercase portable canonical ref`, { value });
  }
  return ref;
}

function canonicalTimestamp(value, label = 'observedAt', code = 'G05A_CLOCK_INVALID') {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail(code, `${label} must be canonical ISO-8601 UTC`, { value });
  }
  return value;
}

function canonicalHome(home) {
  const requested = path.resolve(string(home, 'home', 'G05A_HOME_IDENTITY_MISMATCH'));
  let stat;
  try { stat = fs.lstatSync(requested); }
  catch (error) { fail('G05A_HOME_IDENTITY_MISMATCH', 'Vex Home is unavailable', { home: requested, cause: error.message }); }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('G05A_HOME_IDENTITY_MISMATCH', 'Vex Home must be one canonical directory', { home: requested });
  const real = fs.realpathSync.native(requested);
  const normalize = (value) => process.platform === 'win32' ? path.normalize(value).toLowerCase() : path.normalize(value);
  if (normalize(real) !== normalize(requested)) fail('G05A_HOME_IDENTITY_MISMATCH', 'Vex Home root is not canonical', { requested, real });
  return real;
}

function homePath(home, ...segments) {
  const root = canonicalHome(home);
  const clean = segments.map((segment, index) => safeRef(segment, `path segment ${index}`, 'G05A_HOME_IDENTITY_MISMATCH'));
  const target = path.resolve(root, ...clean);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('G05A_HOME_IDENTITY_MISMATCH', 'G05A path escapes Vex Home', { target });
  }
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) continue;
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) fail('G05A_HOME_IDENTITY_MISMATCH', 'G05A path traverses a symlink/junction', { path: cursor });
    const real = fs.realpathSync.native(cursor);
    const normalize = (value) => process.platform === 'win32' ? path.normalize(value).toLowerCase() : path.normalize(value);
    if (normalize(real) !== normalize(cursor)) fail('G05A_HOME_IDENTITY_MISMATCH', 'G05A path traverses a non-canonical alias', { path: cursor, real });
  }
  return target;
}

function pathsFor(identity, threadRef) {
  const home = identity.homeRoot ?? identity.home;
  const lineage = safeRef(identity.companionLineageRef, 'companionLineageRef', 'G05A_HOME_IDENTITY_MISMATCH');
  const thread = safeRef(threadRef, 'threadRef', 'G05A_HOME_IDENTITY_MISMATCH');
  const root = homePath(home, 'scheduled-daily-autonomy', lineage, thread);
  return {
    root,
    policies: homePath(home, 'scheduled-daily-autonomy', lineage, thread, 'policies'),
    policyHeads: homePath(home, 'scheduled-daily-autonomy', lineage, thread, 'policy-heads'),
    admissions: homePath(home, 'scheduled-daily-autonomy', lineage, thread, 'admissions'),
    receipts: homePath(home, 'scheduled-daily-autonomy', lineage, thread, 'receipts'),
    heads: homePath(home, 'scheduled-daily-autonomy', lineage, thread, 'heads'),
    policyHead: homePath(home, 'scheduled-daily-autonomy', lineage, thread, 'policy-head.json'),
    head: homePath(home, 'scheduled-daily-autonomy', lineage, thread, 'head.json'),
    lock: homePath(home, 'scheduled-daily-autonomy', lineage, thread, 'supervisor.lock')
  };
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

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, file);
}

function readJson(file, code = 'G05A_RECEIPT_CORRUPT', label = 'G05A receipt') {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(code, `${label} could not be read`, { file, cause: error.message }); }
}

function ensureRegularCanonicalFile(home, file, code = 'G05A_RECEIPT_CORRUPT', label = 'G05A file') {
  const root = canonicalHome(home);
  const resolved = path.resolve(file);
  const relative = path.relative(root, resolved);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail(code, `${label} escapes Vex Home`, { file });
  let stat;
  try { stat = fs.lstatSync(resolved); }
  catch (error) { fail(code, `${label} is missing`, { file, cause: error.message }); }
  if (stat.isSymbolicLink() || !stat.isFile()) fail(code, `${label} must be one regular canonical file`, { file });
  const real = fs.realpathSync.native(resolved);
  const normalize = (value) => process.platform === 'win32' ? path.normalize(value).toLowerCase() : path.normalize(value);
  if (normalize(real) !== normalize(resolved)) fail(code, `${label} is not canonical`, { file, real });
  return resolved;
}

function addressed(prefix, refField, hashField, core) {
  const pre = structuredClone(core);
  const ref = `${prefix}.${semanticHash(pre).slice(0, 32)}`;
  const withRef = { ...pre, [refField]: ref };
  return Object.freeze({ ...withRef, [hashField]: semanticHash(withRef) });
}

function validateAddressed(value, prefix, refField, hashField, schemaVersion, code = 'G05A_RECEIPT_CORRUPT') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${prefix} is malformed`);
  const observedRef = value[refField];
  const observedHash = value[hashField];
  const clone = structuredClone(value);
  delete clone[refField]; delete clone[hashField];
  const expectedRef = `${prefix}.${semanticHash(clone).slice(0, 32)}`;
  const withRef = { ...clone, [refField]: observedRef };
  if (value.schemaVersion !== schemaVersion || observedRef !== expectedRef || !SHA256.test(observedHash ?? '') || semanticHash(withRef) !== observedHash) {
    fail(code, `${prefix} content-address identity is invalid`, { observedRef, expectedRef });
  }
  return value;
}

function validateMinute(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1439) fail('G05A_POLICY_INVALID', `${label} must be a minute in [0,1439]`, { value });
  return value;
}

function validateTimeZone(timeZoneRef) {
  const zone = string(timeZoneRef, 'timeZoneRef');
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date('2026-01-01T00:00:00.000Z')); }
  catch { fail('G05A_POLICY_INVALID', 'timeZoneRef is not supported by Intl', { timeZoneRef: zone }); }
  return zone;
}

function policyCore(input) {
  const consentState = string(input.consentState, 'consentState');
  if (!POSITIVE_STANDING_CONSENT.includes(consentState)) fail('G05A_POLICY_INVALID', 'standing rest policy requires PERMITTED or NARROWED consent', { consentState });
  const optionalLearningPolicy = string(input.optionalLearningPolicy ?? 'ABSENT', 'optionalLearningPolicy');
  if (!OPTIONAL_LEARNING_POLICIES.includes(optionalLearningPolicy)) fail('G05A_POLICY_INVALID', 'optionalLearningPolicy is unsupported', { optionalLearningPolicy });
  const start = validateMinute(input.restWindowStartLocalMinute, 'restWindowStartLocalMinute');
  const end = validateMinute(input.restWindowEndLocalMinute, 'restWindowEndLocalMinute');
  if (start === end) fail('G05A_POLICY_INVALID', 'rest window start and end must differ');
  const formedAt = canonicalTimestamp(input.formedAt ?? new Date().toISOString(), 'formedAt', 'G05A_POLICY_INVALID');
  return {
    schemaVersion: 'vexlife.g05a.standing-rest-policy/v1',
    homeRef: safeRef(input.homeRef, 'homeRef'),
    deviceRef: safeRef(input.deviceRef, 'deviceRef'),
    companionLineageRef: safeRef(input.companionLineageRef, 'companionLineageRef'),
    threadRef: safeRef(input.threadRef, 'threadRef'),
    standingRestAuthorityRef: safeRef(input.standingRestAuthorityRef, 'standingRestAuthorityRef'),
    consentState,
    timeZoneRef: validateTimeZone(input.timeZoneRef),
    restWindowStartLocalMinute: start,
    restWindowEndLocalMinute: end,
    exactlyOnceCalendarDay: true,
    interactiveYieldRequired: true,
    resourcePolicy: 'EXPLICIT_SUFFICIENT_REQUIRED',
    optionalLearningPolicy,
    currentness: 'CURRENT',
    formedAt
  };
}

export function formStandingRestPolicy(input) {
  return addressed('g05a-rest-policy', 'policyRef', 'policySha256', policyCore(input));
}

export function validateStandingRestPolicy(policy) {
  validateAddressed(policy, 'g05a-rest-policy', 'policyRef', 'policySha256', 'vexlife.g05a.standing-rest-policy/v1', 'G05A_POLICY_INVALID');
  const expected = formStandingRestPolicy(policy);
  if (expected.policyRef !== policy.policyRef || expected.policySha256 !== policy.policySha256) fail('G05A_POLICY_INVALID', 'standing rest policy fields are invalid');
  return policy;
}

function loadIdentity(input) {
  const score = loadScoreContextState({
    home: input.home,
    homeRef: input.homeRef,
    deviceRef: input.deviceRef,
    companionLineageRef: input.companionLineageRef,
    threadRef: input.threadRef
  });
  return { score, identity: score.identity, threadRef: score.threadRef };
}

export function commitStandingRestPolicy(input) {
  const { score, identity, threadRef } = loadIdentity(input);
  const paths = pathsFor(identity, threadRef);
  const policyLease = acquireSupervisorWithRecovery(paths, identity, threadRef, 'supervisor.g05a.policy-writer', `instance.g05a.policy-writer.${process.pid}`);
  try {
    const policy = formStandingRestPolicy({ ...input, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
    const file = path.join(paths.policies, `${policy.policySha256}.json`);
    const state = writeExclusive(file, policy);
    if (state === 'EXISTS') {
      ensureRegularCanonicalFile(identity.homeRoot, file, 'G05A_POLICY_INVALID', 'standing rest policy');
      const existing = validateStandingRestPolicy(readJson(file, 'G05A_POLICY_INVALID', 'standing rest policy'));
      if (semanticHash(existing) !== semanticHash(policy)) fail('G05A_POLICY_INVALID', 'same policy address contains different content');
    }
    let priorHead = null;
    if (fs.existsSync(paths.policyHead)) priorHead = loadStandingRestPolicy({ ...input, home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef }).head;
    const headCore = {
      schemaVersion: POLICY_HEAD_SCHEMA,
      homeRef: identity.homeRef,
      deviceRef: identity.deviceRef,
      companionLineageRef: identity.companionLineageRef,
      threadRef,
      policyRef: policy.policyRef,
      policySha256: policy.policySha256,
      sourceScoreHeadSha256: score.head.scoreHeadSha256,
      priorPolicyHeadSha256: priorHead?.policyHeadSha256 ?? null,
      formedAt: policy.formedAt
    };
    const head = { ...headCore, policyHeadSha256: semanticHash(headCore) };
    const immutableHead = path.join(paths.policyHeads, `${head.policyHeadSha256}.json`);
    const headState = writeExclusive(immutableHead, head);
    if (headState === 'EXISTS') {
      ensureRegularCanonicalFile(identity.homeRoot, immutableHead, 'G05A_POLICY_INVALID', 'immutable standing policy head');
      if (semanticHash(readJson(immutableHead, 'G05A_POLICY_INVALID', 'immutable standing policy head')) !== semanticHash(head)) {
        fail('G05A_POLICY_INVALID', 'same standing policy head address contains different content');
      }
    }
    atomicWrite(paths.policyHead, head);
    return { policy, head };
  } finally {
    if (!releaseSupervisor(policyLease)) fail('G05A_SUPERVISOR_CONFLICT', 'standing policy writer lease could not be released safely');
  }
}

function validatePolicyHead(head, identity, threadRef) {
  if (!head || typeof head !== 'object' || Array.isArray(head)) fail('G05A_POLICY_NOT_CURRENT', 'standing policy head is malformed');
  const keys = [
    'schemaVersion','homeRef','deviceRef','companionLineageRef','threadRef','policyRef','policySha256',
    'sourceScoreHeadSha256','priorPolicyHeadSha256','formedAt','policyHeadSha256'
  ].sort();
  if (Object.keys(head).sort().join('\n') !== keys.join('\n')) fail('G05A_POLICY_NOT_CURRENT', 'standing policy head contains unknown or missing fields');
  const { policyHeadSha256, ...core } = head;
  if (head.schemaVersion !== POLICY_HEAD_SCHEMA || !SHA256.test(policyHeadSha256 ?? '') || semanticHash(core) !== policyHeadSha256 ||
      head.homeRef !== identity.homeRef || head.deviceRef !== identity.deviceRef || head.companionLineageRef !== identity.companionLineageRef || head.threadRef !== threadRef ||
      !SHA256.test(head.policySha256 ?? '') || !SHA256.test(head.sourceScoreHeadSha256 ?? '') ||
      (head.priorPolicyHeadSha256 !== null && !SHA256.test(head.priorPolicyHeadSha256 ?? ''))) {
    fail('G05A_POLICY_NOT_CURRENT', 'standing policy head identity/currentness is invalid');
  }
  canonicalTimestamp(head.formedAt, 'policy head formedAt', 'G05A_POLICY_NOT_CURRENT');
  return head;
}

export function loadStandingRestPolicy(input) {
  const { identity, threadRef } = loadIdentity(input);
  const paths = pathsFor(identity, threadRef);
  if (!fs.existsSync(paths.policyHead)) fail('G05A_POLICY_NOT_CURRENT', 'no current standing rest policy is configured');
  ensureRegularCanonicalFile(identity.homeRoot, paths.policyHead, 'G05A_POLICY_NOT_CURRENT', 'standing policy head');
  const head = validatePolicyHead(readJson(paths.policyHead, 'G05A_POLICY_NOT_CURRENT', 'standing policy head'), identity, threadRef);
  const immutableHead = path.join(paths.policyHeads, `${head.policyHeadSha256}.json`);
  ensureRegularCanonicalFile(identity.homeRoot, immutableHead, 'G05A_POLICY_NOT_CURRENT', 'immutable standing policy head');
  const immutable = validatePolicyHead(readJson(immutableHead, 'G05A_POLICY_NOT_CURRENT', 'immutable standing policy head'), identity, threadRef);
  if (semanticHash(immutable) !== semanticHash(head)) fail('G05A_POLICY_NOT_CURRENT', 'current standing policy head lacks exact immutable identity');
  const file = path.join(paths.policies, `${head.policySha256}.json`);
  ensureRegularCanonicalFile(identity.homeRoot, file, 'G05A_POLICY_NOT_CURRENT', 'standing rest policy');
  const policy = validateStandingRestPolicy(readJson(file, 'G05A_POLICY_NOT_CURRENT', 'standing rest policy'));
  if (policy.homeRef !== identity.homeRef || policy.deviceRef !== identity.deviceRef || policy.companionLineageRef !== identity.companionLineageRef || policy.threadRef !== threadRef ||
      policy.policyRef !== head.policyRef || policy.policySha256 !== head.policySha256) fail('G05A_POLICY_NOT_CURRENT', 'standing policy head does not bind exact current policy bytes');
  return { policy, head };
}

function assertSamePolicyGeneration(initial, current) {
  if (initial.head.policyHeadSha256 !== current.head.policyHeadSha256 || initial.policy.policySha256 !== current.policy.policySha256 || initial.policy.policyRef !== current.policy.policyRef) {
    fail('G05A_POLICY_NOT_CURRENT', 'standing policy generation changed before G03 effect admission', {
      initialPolicyHeadSha256: initial.head.policyHeadSha256,
      currentPolicyHeadSha256: current.head.policyHeadSha256
    });
  }
}

function localClockParts(observedAt, timeZoneRef) {
  canonicalTimestamp(observedAt);
  let parts;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZoneRef,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(observedAt)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  } catch (error) { fail('G05A_CLOCK_INVALID', 'observed clock cannot be projected into policy timezone', { cause: error.message }); }
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);
  return { calendarDateRef: `${parts.year}-${parts.month}-${parts.day}`, minuteOfDay };
}

export function isRestWindowEligible(policy, observedAt) {
  validateStandingRestPolicy(policy);
  const local = localClockParts(observedAt, policy.timeZoneRef);
  const start = policy.restWindowStartLocalMinute;
  const end = policy.restWindowEndLocalMinute;
  const eligible = start < end ? local.minuteOfDay >= start && local.minuteOfDay < end : local.minuteOfDay >= start || local.minuteOfDay < end;
  return { ...local, eligible };
}

export function observeScheduledSourceFrontier(input) {
  const score = loadScoreContextState({ home: input.home, homeRef: input.homeRef, deviceRef: input.deviceRef, companionLineageRef: input.companionLineageRef, threadRef: input.threadRef });
  const daily = loadDailyMemoryDreamState({ home: input.home, homeRef: input.homeRef, deviceRef: input.deviceRef, companionLineageRef: input.companionLineageRef, threadRef: input.threadRef });
  return Object.freeze({
    conversationHeadSha256: score.head.sourceConversationHeadSha256,
    scoreHeadSha256: score.head.scoreHeadSha256,
    semanticAuthorityHeadSha256: score.currentSemanticAuthorityHead?.semanticAuthorityHeadSha256 ?? null,
    dreamHeadSha256: daily.head?.dailyDreamHeadSha256 ?? null,
    dailyStratumSha256: daily.currentDailyStratum?.stratum?.dailyStratumSha256 ?? null,
    wakeReceiptSha256: daily.currentDailyStratum?.wake?.wakeReceiptSha256 ?? null
  });
}

function validateFrontierShape(frontier, code = 'G05A_SOURCE_STALE', label = 'source frontier') {
  if (!frontier || typeof frontier !== 'object' || Array.isArray(frontier)) fail(code, `${label} is malformed`);
  closedKeys(frontier, FRONTIER_FIELDS, code, label);
  for (const key of FRONTIER_FIELDS) {
    const value = frontier[key];
    if (value !== null && !SHA256.test(value ?? '')) fail(code, `${label}.${key} must be null or lowercase SHA-256`, { value });
  }
  if (!SHA256.test(frontier.conversationHeadSha256 ?? '') || !SHA256.test(frontier.scoreHeadSha256 ?? '') || !SHA256.test(frontier.semanticAuthorityHeadSha256 ?? '')) {
    fail(code, `${label} requires exact G01/G02/semantic authority heads`);
  }
  const dailyFields = ['dreamHeadSha256','dailyStratumSha256','wakeReceiptSha256'];
  const populated = dailyFields.filter((key) => frontier[key] !== null).length;
  if (populated !== 0 && populated !== dailyFields.length) fail(code, `${label} G03 identities must be all-null or all-exact`);
  return frontier;
}

function assertExpectedFrontier(observed, expected) {
  validateFrontierShape(observed);
  if (!expected) return;
  validateFrontierShape(expected);
  for (const key of FRONTIER_FIELDS) {
    if (expected[key] !== observed[key]) {
      fail('G05A_SOURCE_STALE', `expected ${key} is stale`, { expected: expected[key], observed: observed[key] });
    }
  }
}

export function formScheduledAutonomyAdmissionEvidence(input) {
  const observedAt = canonicalTimestamp(input.observedAt, 'admission observedAt', 'G05A_ADMISSION_EVIDENCE_INVALID');
  if (!input.resourceSnapshot || typeof input.resourceSnapshot !== 'object' || typeof input.resourceSnapshot.semanticFingerprint !== 'string') {
    fail('G05A_ADMISSION_EVIDENCE_INVALID', 'G05A requires one externally formed source-managed resource snapshot with its exact semantic fingerprint');
  }
  let resourceSnapshot;
  try { resourceSnapshot = createResourceSnapshot(input.resourceSnapshot); }
  catch (error) { fail('G05A_ADMISSION_EVIDENCE_INVALID', 'resource snapshot failed the source-managed scheduler contract', { cause: error.message }); }
  if (resourceSnapshot.evidenceClass !== 'LIVE_RUNTIME_CURRENT' || resourceSnapshot.currentness !== 'CURRENT' || resourceSnapshot.observedAt !== observedAt) {
    fail('G05A_ADMISSION_EVIDENCE_INVALID', 'resource snapshot must be LIVE_RUNTIME_CURRENT and current to the exact G05A tick', {
      evidenceClass: resourceSnapshot.evidenceClass, currentness: resourceSnapshot.currentness, snapshotObservedAt: resourceSnapshot.observedAt, observedAt
    });
  }
  let resourceAdmission;
  try { resourceAdmission = evaluateCurrentResourceAdmission(resourceSnapshot, G05A_RESOURCE_REQUEST, { observedAt }); }
  catch (error) { fail('G05A_ADMISSION_EVIDENCE_INVALID', 'resource admission could not be evaluated by the source-managed scheduler contract', { cause: error.message }); }
  if (!resourceAdmission || typeof resourceAdmission.semanticFingerprint !== 'string') {
    fail('G05A_ADMISSION_EVIDENCE_INVALID', 'source-managed resource admission lacks exact semantic identity');
  }
  const sourceFrontier = validateFrontierShape(structuredClone(input.sourceFrontier), 'G05A_ADMISSION_EVIDENCE_INVALID', 'admission source frontier');
  const core = {
    schemaVersion: ADMISSION_EVIDENCE_SCHEMA,
    contractRef: ADMISSION_EVIDENCE_CONTRACT,
    issuerClass: 'SOURCE_MANAGED_RESOURCE_ADMISSION_COMPOSITION',
    admissionScope: 'G05A_DREAM_ADMISSION_ONLY',
    homeRef: safeRef(input.homeRef, 'admission.homeRef', 'G05A_ADMISSION_EVIDENCE_INVALID'),
    deviceRef: safeRef(input.deviceRef, 'admission.deviceRef', 'G05A_ADMISSION_EVIDENCE_INVALID'),
    companionLineageRef: safeRef(input.companionLineageRef, 'admission.companionLineageRef', 'G05A_ADMISSION_EVIDENCE_INVALID'),
    threadRef: safeRef(input.threadRef, 'admission.threadRef', 'G05A_ADMISSION_EVIDENCE_INVALID'),
    supervisorRef: safeRef(input.supervisorRef, 'admission.supervisorRef', 'G05A_ADMISSION_EVIDENCE_INVALID'),
    supervisorInstanceRef: safeRef(input.supervisorInstanceRef, 'admission.supervisorInstanceRef', 'G05A_ADMISSION_EVIDENCE_INVALID'),
    standingPolicyRef: safeRef(input.standingPolicyRef, 'admission.standingPolicyRef', 'G05A_ADMISSION_EVIDENCE_INVALID'),
    standingPolicySha256: string(input.standingPolicySha256, 'admission.standingPolicySha256', 'G05A_ADMISSION_EVIDENCE_INVALID'),
    standingPolicyHeadSha256: string(input.standingPolicyHeadSha256, 'admission.standingPolicyHeadSha256', 'G05A_ADMISSION_EVIDENCE_INVALID'),
    standingRestAuthorityRef: safeRef(input.standingRestAuthorityRef, 'admission.standingRestAuthorityRef', 'G05A_ADMISSION_EVIDENCE_INVALID'),
    observedAt,
    sourceFrontier,
    resourceSnapshot: structuredClone(resourceSnapshot),
    resourceSnapshotRef: safeRef(resourceSnapshot.snapshotRef, 'resourceSnapshot.snapshotRef', 'G05A_ADMISSION_EVIDENCE_INVALID'),
    resourceSnapshotFingerprint: resourceSnapshot.semanticFingerprint,
    resourceSnapshotSourceRef: safeRef(resourceSnapshot.sourceRef, 'resourceSnapshot.sourceRef', 'G05A_ADMISSION_EVIDENCE_INVALID'),
    resourceSnapshotSourceHash: resourceSnapshot.sourceHash,
    resourceSnapshotFormationRef: safeRef(resourceSnapshot.formationRef, 'resourceSnapshot.formationRef', 'G05A_ADMISSION_EVIDENCE_INVALID'),
    resourceEvidenceClass: resourceSnapshot.evidenceClass,
    interactiveWaitState: resourceSnapshot.interactiveWaitState,
    resourceAdmissionState: resourceAdmission.state,
    resourceAdmissionReasons: [...(resourceAdmission.reasons ?? [])],
    resourceAdmissionRequest: structuredClone(resourceAdmission.request),
    resourceAdmissionFingerprint: resourceAdmission.semanticFingerprint,
    externalEffectAuthorityGranted: false,
    nativeHostConformanceClaimed: false
  };
  if (!SHA256.test(core.standingPolicySha256) || !SHA256.test(core.standingPolicyHeadSha256) || !SHA256.test(core.resourceSnapshotFingerprint) ||
      !SHA256.test(core.resourceSnapshotSourceHash) || !SHA256.test(core.resourceAdmissionFingerprint)) {
    fail('G05A_ADMISSION_EVIDENCE_INVALID', 'standing policy or source-managed resource evidence hashes are invalid');
  }
  return addressed('g05a-supervisor-admission', 'admissionEvidenceRef', 'admissionEvidenceSha256', core);
}

function validateScheduledAutonomyAdmissionEvidence(evidence, context) {
  validateAddressed(evidence, 'g05a-supervisor-admission', 'admissionEvidenceRef', 'admissionEvidenceSha256', ADMISSION_EVIDENCE_SCHEMA, 'G05A_ADMISSION_EVIDENCE_INVALID');
  const expectedKeys = [
    'schemaVersion','contractRef','issuerClass','admissionScope','homeRef','deviceRef','companionLineageRef','threadRef',
    'supervisorRef','supervisorInstanceRef','standingPolicyRef','standingPolicySha256','standingPolicyHeadSha256','standingRestAuthorityRef',
    'observedAt','sourceFrontier','resourceSnapshot','resourceSnapshotRef','resourceSnapshotFingerprint','resourceSnapshotSourceRef','resourceSnapshotSourceHash',
    'resourceSnapshotFormationRef','resourceEvidenceClass','interactiveWaitState','resourceAdmissionState','resourceAdmissionReasons','resourceAdmissionRequest',
    'resourceAdmissionFingerprint','externalEffectAuthorityGranted','nativeHostConformanceClaimed','admissionEvidenceRef','admissionEvidenceSha256'
  ];
  closedKeys(evidence, expectedKeys, 'G05A_ADMISSION_EVIDENCE_INVALID', 'supervisor admission evidence');
  if (evidence.contractRef !== ADMISSION_EVIDENCE_CONTRACT || evidence.issuerClass !== 'SOURCE_MANAGED_RESOURCE_ADMISSION_COMPOSITION' ||
      evidence.admissionScope !== 'G05A_DREAM_ADMISSION_ONLY' || evidence.externalEffectAuthorityGranted !== false || evidence.nativeHostConformanceClaimed !== false ||
      evidence.homeRef !== context.identity.homeRef || evidence.deviceRef !== context.identity.deviceRef ||
      evidence.companionLineageRef !== context.identity.companionLineageRef || evidence.threadRef !== context.threadRef ||
      evidence.supervisorRef !== context.supervisorRef || evidence.supervisorInstanceRef !== context.instanceRef ||
      evidence.standingPolicyRef !== context.policy.policyRef || evidence.standingPolicySha256 !== context.policy.policySha256 ||
      evidence.standingPolicyHeadSha256 !== context.policyHead.policyHeadSha256 || evidence.standingRestAuthorityRef !== context.policy.standingRestAuthorityRef ||
      evidence.observedAt !== context.observedAt || evidence.resourceEvidenceClass !== 'LIVE_RUNTIME_CURRENT') {
    fail('G05A_ADMISSION_EVIDENCE_INVALID', 'supervisor admission evidence is not exact-current to this tick');
  }
  let snapshot;
  try { snapshot = createResourceSnapshot(evidence.resourceSnapshot); }
  catch (error) { fail('G05A_ADMISSION_EVIDENCE_INVALID', 'embedded resource snapshot failed source-managed replay', { cause: error.message }); }
  if (snapshot.semanticFingerprint !== evidence.resourceSnapshotFingerprint || snapshot.snapshotRef !== evidence.resourceSnapshotRef ||
      snapshot.sourceRef !== evidence.resourceSnapshotSourceRef || snapshot.sourceHash !== evidence.resourceSnapshotSourceHash ||
      snapshot.formationRef !== evidence.resourceSnapshotFormationRef || snapshot.evidenceClass !== evidence.resourceEvidenceClass ||
      snapshot.observedAt !== context.observedAt || snapshot.currentness !== 'CURRENT' || snapshot.evidenceClass !== 'LIVE_RUNTIME_CURRENT') {
    fail('G05A_ADMISSION_EVIDENCE_INVALID', 'embedded resource snapshot bindings are not exact-current');
  }
  let resourceAdmission;
  try { resourceAdmission = evaluateCurrentResourceAdmission(snapshot, G05A_RESOURCE_REQUEST, { observedAt: context.observedAt }); }
  catch (error) { fail('G05A_ADMISSION_EVIDENCE_INVALID', 'embedded resource admission failed source-managed replay', { cause: error.message }); }
  if (resourceAdmission.state !== evidence.resourceAdmissionState || resourceAdmission.semanticFingerprint !== evidence.resourceAdmissionFingerprint ||
      JSON.stringify(resourceAdmission.reasons ?? []) !== JSON.stringify(evidence.resourceAdmissionReasons ?? []) ||
      JSON.stringify(resourceAdmission.request ?? null) !== JSON.stringify(evidence.resourceAdmissionRequest ?? null) ||
      snapshot.interactiveWaitState !== evidence.interactiveWaitState) {
    fail('G05A_ADMISSION_EVIDENCE_INVALID', 'source-managed resource admission replay differs from the bound G05A admission evidence');
  }
  validateFrontierShape(evidence.sourceFrontier, 'G05A_ADMISSION_EVIDENCE_INVALID', 'admission source frontier');
  assertExpectedFrontier(context.frontier, evidence.sourceFrontier);
  return evidence;
}

function persistAdmissionEvidence(identity, threadRef, evidence) {
  const paths = pathsFor(identity, threadRef);
  const file = path.join(paths.admissions, `${evidence.admissionEvidenceSha256}.json`);
  const state = writeExclusive(file, evidence);
  if (state === 'EXISTS') {
    ensureRegularCanonicalFile(identity.homeRoot, file, 'G05A_ADMISSION_EVIDENCE_INVALID', 'supervisor admission evidence');
    const existing = readJson(file, 'G05A_ADMISSION_EVIDENCE_INVALID', 'supervisor admission evidence');
    validateAddressed(existing, 'g05a-supervisor-admission', 'admissionEvidenceRef', 'admissionEvidenceSha256', ADMISSION_EVIDENCE_SCHEMA, 'G05A_ADMISSION_EVIDENCE_INVALID');
    if (semanticHash(existing) !== semanticHash(evidence)) fail('G05A_ADMISSION_EVIDENCE_INVALID', 'same admission evidence address contains different content');
  }
  return file;
}

function processState(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return 'UNVERIFIABLE';
  if (pid === process.pid) return 'ACTIVE';
  try { process.kill(pid, 0); return 'ACTIVE'; }
  catch (error) { if (error?.code === 'ESRCH') return 'ABSENT'; if (error?.code === 'EPERM') return 'ACTIVE'; return 'UNVERIFIABLE'; }
}

function validateSupervisorLease(value, identity, threadRef) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('G05A_SUPERVISOR_CONFLICT', 'scheduled autonomy supervisor lease is malformed');
  const keys = ['schemaVersion','companionLineageRef','threadRef','supervisorRef','instanceRef','pid','token','formedAt','leaseSha256'].sort();
  if (Object.keys(value).sort().join('\n') !== keys.join('\n')) fail('G05A_SUPERVISOR_CONFLICT', 'scheduled autonomy supervisor lease contains unknown or missing fields');
  const { leaseSha256, ...core } = value;
  if (value.schemaVersion !== 'vexlife.g05a.supervisor-writer/v2' || !SHA256.test(leaseSha256 ?? '') || semanticHash(core) !== leaseSha256 ||
      value.companionLineageRef !== identity.companionLineageRef || value.threadRef !== threadRef ||
      safeRef(value.supervisorRef, 'lease.supervisorRef', 'G05A_SUPERVISOR_CONFLICT') !== value.supervisorRef ||
      safeRef(value.instanceRef, 'lease.instanceRef', 'G05A_SUPERVISOR_CONFLICT') !== value.instanceRef ||
      !Number.isSafeInteger(value.pid) || value.pid <= 0 || typeof value.token !== 'string' || !value.token) {
    fail('G05A_SUPERVISOR_CONFLICT', 'scheduled autonomy supervisor lease is not exact enough for recovery');
  }
  canonicalTimestamp(value.formedAt, 'supervisor lease formedAt', 'G05A_SUPERVISOR_CONFLICT');
  return value;
}

function acquireSupervisor(paths, identity, threadRef, supervisorRef, instanceRef) {
  fs.mkdirSync(paths.root, { recursive: true });
  const leaseCore = {
    schemaVersion: 'vexlife.g05a.supervisor-writer/v2',
    companionLineageRef: identity.companionLineageRef,
    threadRef,
    supervisorRef: safeRef(supervisorRef, 'supervisorRef', 'G05A_SUPERVISOR_CONFLICT'),
    instanceRef: safeRef(instanceRef, 'instanceRef', 'G05A_SUPERVISOR_CONFLICT'),
    pid: process.pid,
    token: crypto.randomUUID(),
    formedAt: new Date().toISOString()
  };
  const lease = { ...leaseCore, leaseSha256: semanticHash(leaseCore) };
  const state = writeExclusive(paths.lock, lease);
  if (state === 'EXISTS') {
    ensureRegularCanonicalFile(identity.homeRoot, paths.lock, 'G05A_SUPERVISOR_CONFLICT', 'scheduled autonomy supervisor lease');
    const existing = validateSupervisorLease(readJson(paths.lock, 'G05A_SUPERVISOR_CONFLICT', 'scheduled autonomy supervisor lease'), identity, threadRef);
    const ownerState = processState(existing.pid);
    fail(ownerState === 'ABSENT' ? 'G05A_SUPERVISOR_RECOVERY_REQUIRED' : 'G05A_SUPERVISOR_CONFLICT',
      ownerState === 'ABSENT' ? 'abandoned scheduled-autonomy supervisor lease requires exact recovery' : 'scheduled autonomy already has an active or unverifiable supervisor writer',
      { ownerState, ownerPid: existing.pid, ownerInstanceRef: existing.instanceRef, ownerSupervisorRef: existing.supervisorRef, leaseSha256: existing.leaseSha256 });
  }
  return { path: paths.lock, token: lease.token, leaseSha256: lease.leaseSha256, ownerPid: lease.pid };
}

function recoverAbandonedSupervisor(paths, identity, threadRef, expectedAbandonedInstanceRef = null) {
  if (!fs.existsSync(paths.lock)) return { state: 'NO_SUPERVISOR_LEASE', recovered: false };
  ensureRegularCanonicalFile(identity.homeRoot, paths.lock, 'G05A_SUPERVISOR_CONFLICT', 'scheduled autonomy supervisor lease');
  const existing = validateSupervisorLease(readJson(paths.lock, 'G05A_SUPERVISOR_CONFLICT', 'scheduled autonomy supervisor lease'), identity, threadRef);
  if (expectedAbandonedInstanceRef !== null && existing.instanceRef !== expectedAbandonedInstanceRef) {
    fail('G05A_SUPERVISOR_CONFLICT', 'abandoned supervisor instance does not match exact recovery request', {
      expectedAbandonedInstanceRef, observedAbandonedInstanceRef: existing.instanceRef
    });
  }
  const ownerState = processState(existing.pid);
  if (ownerState !== 'ABSENT') fail(ownerState === 'ACTIVE' ? 'G05A_SUPERVISOR_CONFLICT' : 'G05A_SUPERVISOR_RECOVERY_REQUIRED', 'scheduled autonomy supervisor lease cannot be recovered unless owner is provably absent', { ownerState, ownerPid: existing.pid });
  fs.unlinkSync(paths.lock);
  return { state: 'ABANDONED_SUPERVISOR_RECOVERED', recovered: true, abandonedInstanceRef: existing.instanceRef, abandonedSupervisorRef: existing.supervisorRef, leaseSha256: existing.leaseSha256 };
}

export function recoverAbandonedScheduledDailyAutonomySupervisor(input) {
  const { identity, threadRef } = loadIdentity(input);
  return recoverAbandonedSupervisor(pathsFor(identity, threadRef), identity, threadRef, input.expectedAbandonedInstanceRef ?? null);
}

function acquireSupervisorWithRecovery(paths, identity, threadRef, supervisorRef, instanceRef) {
  try { return { ...acquireSupervisor(paths, identity, threadRef, supervisorRef, instanceRef), recovered: null }; }
  catch (error) {
    if (error?.code !== 'G05A_SUPERVISOR_RECOVERY_REQUIRED') throw error;
    const recovered = recoverAbandonedSupervisor(paths, identity, threadRef, error.details?.ownerInstanceRef ?? null);
    return { ...acquireSupervisor(paths, identity, threadRef, supervisorRef, instanceRef), recovered };
  }
}

function releaseSupervisor(lease) {
  if (!lease || !fs.existsSync(lease.path)) return true;
  try {
    const value = JSON.parse(fs.readFileSync(lease.path, 'utf8'));
    if (value.token !== lease.token) return false;
    fs.unlinkSync(lease.path);
    return true;
  } catch { return false; }
}

function policyRestAuthority(policy) {
  return `authority.g05a.rest.${policy.policySha256.slice(0, 24)}`;
}

function closedKeys(value, expected, code, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${label} is malformed`);
  const observed = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (observed.join('\n') !== wanted.join('\n')) fail(code, `${label} contains unknown or missing fields`, { observed, expected: wanted });
}

function validateHeldFalse(value, code = 'G05A_RECEIPT_CORRUPT') {
  for (const key of HELD_EFFECT_FIELDS) if (value[key] !== false) fail(code, `${key} must remain false in G05A`, { observed: value[key] });
}

function validateDailyReceipt(receipt, identity, threadRef) {
  const expectedKeys = [
    'schemaVersion','mode','homeRef','deviceRef','companionLineageRef','threadRef','calendarDateRef','timeZoneRef','observedAt',
    'standingPolicyRef','standingPolicySha256','standingPolicyHeadSha256','standingRestAuthorityRef',
    'supervisorRef','supervisorInstanceRef','modelWorkerRef','dreamWriterInstanceRef','recoveredAbandonedSupervisor',
    'supervisorAdmissionEvidenceRef','supervisorAdmissionEvidenceSha256','interactiveObservationState',
    'resourceEvidenceState','resourceEvidenceSourceRef','resourceEvidenceObservedAt','resourceSnapshotRef','resourceSnapshotFingerprint','resourceSnapshotSourceHash','resourceSnapshotFormationRef','resourceEvidenceClass','resourceAdmissionFingerprint',
    'sourceConversationHeadSha256','sourceScoreHeadSha256','sourceSemanticAuthorityHeadSha256',
    'g03DreamHeadSha256','g03DailyStratumSha256','g03WakeReceiptSha256','wakeCommitted','resumedAfterWake',
    'optionalLearningPolicy','optionalLearningDisposition','optionalLearningFailureCode','optionalLearningEvidenceRef','optionalLearningEvidenceSha256',
    'interactiveYielded','resourceYielded','duplicateSuppressed',
    ...HELD_EFFECT_FIELDS,'nextSafeRoute','formedAt','dailyAutonomyReceiptRef','dailyAutonomyReceiptSha256'
  ];
  closedKeys(receipt, expectedKeys, 'G05A_RECEIPT_CORRUPT', 'G05A daily receipt');
  validateAddressed(receipt, 'g05a-daily-receipt', 'dailyAutonomyReceiptRef', 'dailyAutonomyReceiptSha256', DAILY_RECEIPT_SCHEMA);
  if (receipt.mode !== SCHEDULED_DAILY_AUTONOMY_MODE || receipt.homeRef !== identity.homeRef || receipt.deviceRef !== identity.deviceRef ||
      receipt.companionLineageRef !== identity.companionLineageRef || receipt.threadRef !== threadRef || !CALENDAR_DATE.test(receipt.calendarDateRef ?? '') ||
      !SHA256.test(receipt.standingPolicySha256 ?? '') || !SHA256.test(receipt.standingPolicyHeadSha256 ?? '') ||
      !SHA256.test(receipt.sourceConversationHeadSha256 ?? '') || !SHA256.test(receipt.sourceScoreHeadSha256 ?? '') || !SHA256.test(receipt.sourceSemanticAuthorityHeadSha256 ?? '') ||
      !SHA256.test(receipt.g03DreamHeadSha256 ?? '') || !SHA256.test(receipt.g03DailyStratumSha256 ?? '') || !SHA256.test(receipt.g03WakeReceiptSha256 ?? '') ||
      receipt.wakeCommitted !== true || !REF.test(receipt.supervisorAdmissionEvidenceRef ?? '') || !SHA256.test(receipt.supervisorAdmissionEvidenceSha256 ?? '') ||
      receipt.interactiveObservationState !== 'IDLE_CONFIRMED' || receipt.resourceEvidenceState !== 'SUFFICIENT' || receipt.resourceEvidenceClass !== 'LIVE_RUNTIME_CURRENT' ||
      !REF.test(receipt.resourceSnapshotRef ?? '') || !SHA256.test(receipt.resourceSnapshotFingerprint ?? '') || !SHA256.test(receipt.resourceSnapshotSourceHash ?? '') ||
      !REF.test(receipt.resourceSnapshotFormationRef ?? '') || !SHA256.test(receipt.resourceAdmissionFingerprint ?? '') || receipt.interactiveYielded !== false || receipt.resourceYielded !== false ||
      receipt.duplicateSuppressed !== false || receipt.nextSafeRoute !== NEXT_SAFE_ROUTE) {
    fail('G05A_RECEIPT_CORRUPT', 'G05A daily receipt semantic contract is invalid');
  }
  canonicalTimestamp(receipt.observedAt, 'receipt observedAt', 'G05A_RECEIPT_CORRUPT');
  canonicalTimestamp(receipt.formedAt, 'receipt formedAt', 'G05A_RECEIPT_CORRUPT');
  if (receipt.resourceEvidenceObservedAt !== null) canonicalTimestamp(receipt.resourceEvidenceObservedAt, 'resource evidence observedAt', 'G05A_RECEIPT_CORRUPT');
  safeRef(receipt.resourceEvidenceSourceRef, 'receipt.resourceEvidenceSourceRef', 'G05A_RECEIPT_CORRUPT');
  safeRef(receipt.resourceSnapshotRef, 'receipt.resourceSnapshotRef', 'G05A_RECEIPT_CORRUPT');
  safeRef(receipt.resourceSnapshotFormationRef, 'receipt.resourceSnapshotFormationRef', 'G05A_RECEIPT_CORRUPT');
  safeRef(receipt.standingPolicyRef, 'receipt.standingPolicyRef', 'G05A_RECEIPT_CORRUPT');
  safeRef(receipt.standingRestAuthorityRef, 'receipt.standingRestAuthorityRef', 'G05A_RECEIPT_CORRUPT');
  safeRef(receipt.supervisorRef, 'receipt.supervisorRef', 'G05A_RECEIPT_CORRUPT');
  safeRef(receipt.supervisorInstanceRef, 'receipt.supervisorInstanceRef', 'G05A_RECEIPT_CORRUPT');
  safeRef(receipt.modelWorkerRef, 'receipt.modelWorkerRef', 'G05A_RECEIPT_CORRUPT');
  safeRef(receipt.dreamWriterInstanceRef, 'receipt.dreamWriterInstanceRef', 'G05A_RECEIPT_CORRUPT');
  if (receipt.supervisorRef === receipt.modelWorkerRef || receipt.supervisorInstanceRef === receipt.dreamWriterInstanceRef) fail('G05A_RECEIPT_CORRUPT', 'G05A receipt collapses independent runtime identities');
  if (!OPTIONAL_LEARNING_POLICIES.includes(receipt.optionalLearningPolicy) || !OPTIONAL_LEARNING_DISPOSITIONS.includes(receipt.optionalLearningDisposition)) fail('G05A_RECEIPT_CORRUPT', 'optional learning receipt state is invalid');
  if (receipt.optionalLearningEvidenceRef === null ? receipt.optionalLearningEvidenceSha256 !== null : (!REF.test(receipt.optionalLearningEvidenceRef) || !SHA256.test(receipt.optionalLearningEvidenceSha256 ?? ''))) {
    fail('G05A_RECEIPT_CORRUPT', 'optional learning evidence binding is invalid');
  }
  validateHeldFalse(receipt);
  return receipt;
}

function validateAutonomyHead(head, identity, threadRef) {
  const expectedKeys = ['schemaVersion','homeRef','deviceRef','companionLineageRef','threadRef','sequence','calendarDateRef','dailyAutonomyReceiptRef','dailyAutonomyReceiptSha256','g03DreamHeadSha256','g03WakeReceiptSha256','priorAutonomyHeadSha256','formedAt','autonomyHeadSha256'];
  closedKeys(head, expectedKeys, 'G05A_RECEIPT_CORRUPT', 'G05A autonomy head');
  const { autonomyHeadSha256, ...core } = head;
  if (head.schemaVersion !== DAILY_HEAD_SCHEMA || !SHA256.test(autonomyHeadSha256 ?? '') || semanticHash(core) !== autonomyHeadSha256 ||
      head.homeRef !== identity.homeRef || head.deviceRef !== identity.deviceRef || head.companionLineageRef !== identity.companionLineageRef || head.threadRef !== threadRef ||
      !Number.isSafeInteger(head.sequence) || head.sequence < 0 || !CALENDAR_DATE.test(head.calendarDateRef ?? '') || !SHA256.test(head.dailyAutonomyReceiptSha256 ?? '') ||
      !SHA256.test(head.g03DreamHeadSha256 ?? '') || !SHA256.test(head.g03WakeReceiptSha256 ?? '') ||
      (head.sequence === 0 ? head.priorAutonomyHeadSha256 !== null : !SHA256.test(head.priorAutonomyHeadSha256 ?? ''))) fail('G05A_RECEIPT_CORRUPT', 'G05A autonomy head identity/lineage is invalid');
  canonicalTimestamp(head.formedAt, 'autonomy head formedAt', 'G05A_RECEIPT_CORRUPT');
  return head;
}

function validateReceiptAgainstSources(receipt, identity, threadRef, paths) {
  const policyHeadFile = path.join(paths.policyHeads, `${receipt.standingPolicyHeadSha256}.json`);
  ensureRegularCanonicalFile(identity.homeRoot, policyHeadFile, 'G05A_RECEIPT_CORRUPT', 'historical standing policy head');
  const policyHead = validatePolicyHead(readJson(policyHeadFile), identity, threadRef);
  if (policyHead.policyRef !== receipt.standingPolicyRef || policyHead.policySha256 !== receipt.standingPolicySha256) fail('G05A_RECEIPT_CORRUPT', 'receipt standing policy binding differs from historical policy head');
  const policyFile = path.join(paths.policies, `${receipt.standingPolicySha256}.json`);
  ensureRegularCanonicalFile(identity.homeRoot, policyFile, 'G05A_RECEIPT_CORRUPT', 'historical standing policy');
  const policy = validateStandingRestPolicy(readJson(policyFile));
  if (policy.policyRef !== receipt.standingPolicyRef || policy.standingRestAuthorityRef !== receipt.standingRestAuthorityRef || policy.homeRef !== identity.homeRef || policy.deviceRef !== identity.deviceRef || policy.companionLineageRef !== identity.companionLineageRef || policy.threadRef !== threadRef) {
    fail('G05A_RECEIPT_CORRUPT', 'receipt standing policy semantics differ from source-owned policy');
  }
  let descent;
  try {
    descent = sourceDescentForDailyStratum({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef }, receipt.g03DailyStratumSha256);
  } catch (error) {
    fail('G05A_RECEIPT_CORRUPT', 'G05A receipt G03 source descent failed', { sourceCode: error?.code ?? 'UNKNOWN', sourceMessage: error?.message ?? String(error) });
  }
  if (descent.sourceConversationHeadSha256 !== receipt.sourceConversationHeadSha256 || descent.sourceScoreHeadSha256 !== receipt.sourceScoreHeadSha256 ||
      descent.sourceSemanticAuthorityHeadSha256 !== receipt.sourceSemanticAuthorityHeadSha256 || descent.wakeReceiptSha256 !== receipt.g03WakeReceiptSha256) {
    fail('G05A_RECEIPT_CORRUPT', 'G05A receipt differs from committed G03 source descent');
  }
  const daily = loadDailyMemoryDreamState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
  const dreamHead = daily.headChain?.find((item) => item.dailyDreamHeadSha256 === receipt.g03DreamHeadSha256) ?? null;
  if (!dreamHead || dreamHead.dailyStratumSha256 !== receipt.g03DailyStratumSha256 || dreamHead.wakeReceiptSha256 !== receipt.g03WakeReceiptSha256) {
    fail('G05A_RECEIPT_CORRUPT', 'G05A receipt Dream head is not one exact committed G03 generation');
  }
  if (policy.timeZoneRef !== receipt.timeZoneRef) fail('G05A_RECEIPT_CORRUPT', 'G05A receipt timezone differs from historical standing policy');

  const admissionFile = path.join(paths.admissions, `${receipt.supervisorAdmissionEvidenceSha256}.json`);
  ensureRegularCanonicalFile(identity.homeRoot, admissionFile, 'G05A_RECEIPT_CORRUPT', 'historical supervisor admission evidence');
  const admission = readJson(admissionFile, 'G05A_RECEIPT_CORRUPT', 'historical supervisor admission evidence');
  validateScheduledAutonomyAdmissionEvidence(admission, {
    identity, threadRef,
    supervisorRef: receipt.supervisorRef,
    instanceRef: receipt.supervisorInstanceRef,
    policy,
    policyHead,
    observedAt: receipt.observedAt,
    frontier: admission.sourceFrontier
  });
  if (admission.admissionEvidenceRef !== receipt.supervisorAdmissionEvidenceRef || admission.admissionEvidenceSha256 !== receipt.supervisorAdmissionEvidenceSha256 ||
      (admission.interactiveWaitState === 'IDLE' ? 'IDLE_CONFIRMED' : 'PENDING') !== receipt.interactiveObservationState ||
      (admission.resourceAdmissionState === 'ADMITTED' ? 'SUFFICIENT' : 'INSUFFICIENT') !== receipt.resourceEvidenceState ||
      admission.resourceSnapshotSourceRef !== receipt.resourceEvidenceSourceRef || admission.resourceSnapshot.observedAt !== receipt.resourceEvidenceObservedAt ||
      admission.resourceSnapshotRef !== receipt.resourceSnapshotRef || admission.resourceSnapshotFingerprint !== receipt.resourceSnapshotFingerprint ||
      admission.resourceSnapshotSourceHash !== receipt.resourceSnapshotSourceHash || admission.resourceSnapshotFormationRef !== receipt.resourceSnapshotFormationRef ||
      admission.resourceEvidenceClass !== receipt.resourceEvidenceClass || admission.resourceAdmissionFingerprint !== receipt.resourceAdmissionFingerprint ||
      admission.sourceFrontier.conversationHeadSha256 !== receipt.sourceConversationHeadSha256 ||
      admission.sourceFrontier.scoreHeadSha256 !== receipt.sourceScoreHeadSha256 ||
      admission.sourceFrontier.semanticAuthorityHeadSha256 !== receipt.sourceSemanticAuthorityHeadSha256) {
    fail('G05A_RECEIPT_CORRUPT', 'G05A receipt differs from its exact supervisor admission evidence');
  }
  const expectedAdmissionDreamHead = receipt.resumedAfterWake ? receipt.g03DreamHeadSha256 : dreamHead.priorDailyDreamHeadSha256;
  if (admission.sourceFrontier.dreamHeadSha256 !== expectedAdmissionDreamHead) {
    fail('G05A_RECEIPT_CORRUPT', 'supervisor admission evidence is not the exact pre-effect/recovery G03 generation');
  }
  if (receipt.resumedAfterWake) {
    if (admission.sourceFrontier.dailyStratumSha256 !== receipt.g03DailyStratumSha256 || admission.sourceFrontier.wakeReceiptSha256 !== receipt.g03WakeReceiptSha256) {
      fail('G05A_RECEIPT_CORRUPT', 'recovery admission evidence does not bind the already committed same-day G03 wake');
    }
  } else if (dreamHead.priorDailyDreamHeadSha256 === null) {
    if (admission.sourceFrontier.dailyStratumSha256 !== null || admission.sourceFrontier.wakeReceiptSha256 !== null) {
      fail('G05A_RECEIPT_CORRUPT', 'genesis G05A admission evidence unexpectedly claims prior G03 material');
    }
  } else {
    const priorDream = daily.headChain?.find((item) => item.dailyDreamHeadSha256 === dreamHead.priorDailyDreamHeadSha256) ?? null;
    if (!priorDream || admission.sourceFrontier.dailyStratumSha256 !== priorDream.dailyStratumSha256 || admission.sourceFrontier.wakeReceiptSha256 !== priorDream.wakeReceiptSha256) {
      fail('G05A_RECEIPT_CORRUPT', 'supervisor admission evidence prior G03 material is not exact');
    }
  }
  return { policyHead, policy, descent, dreamHead, admission };
}

function loadCurrentReceipt(identity, threadRef) {
  const paths = pathsFor(identity, threadRef);
  if (!fs.existsSync(paths.head)) return null;
  ensureRegularCanonicalFile(identity.homeRoot, paths.head, 'G05A_RECEIPT_CORRUPT', 'G05A current pointer');
  const current = validateAutonomyHead(readJson(paths.head), identity, threadRef);
  const immutableCurrentFile = path.join(paths.heads, `${current.autonomyHeadSha256}.json`);
  ensureRegularCanonicalFile(identity.homeRoot, immutableCurrentFile, 'G05A_RECEIPT_CORRUPT', 'immutable G05A current head');
  const immutableCurrent = validateAutonomyHead(readJson(immutableCurrentFile), identity, threadRef);
  if (semanticHash(current) !== semanticHash(immutableCurrent)) fail('G05A_RECEIPT_CORRUPT', 'G05A current pointer lacks exact immutable head');
  const reverse = [];
  let cursor = current;
  const seen = new Set();
  while (cursor) {
    if (seen.has(cursor.autonomyHeadSha256)) fail('G05A_RECEIPT_CORRUPT', 'G05A autonomy head lineage contains a cycle');
    seen.add(cursor.autonomyHeadSha256);
    reverse.push(cursor);
    if (cursor.sequence === 0) break;
    const priorFile = path.join(paths.heads, `${cursor.priorAutonomyHeadSha256}.json`);
    ensureRegularCanonicalFile(identity.homeRoot, priorFile, 'G05A_RECEIPT_CORRUPT', 'prior immutable G05A head');
    const prior = validateAutonomyHead(readJson(priorFile), identity, threadRef);
    if (prior.sequence !== cursor.sequence - 1) fail('G05A_RECEIPT_CORRUPT', 'G05A autonomy head sequence is not contiguous');
    cursor = prior;
  }
  const headChain = reverse.reverse();
  const receipts = [];
  for (let index = 0; index < headChain.length; index += 1) {
    const head = headChain[index];
    if (head.sequence !== index || head.priorAutonomyHeadSha256 !== (index ? headChain[index - 1].autonomyHeadSha256 : null)) fail('G05A_RECEIPT_CORRUPT', 'G05A head ancestry is not canonical');
    const receiptFile = path.join(paths.receipts, `${head.dailyAutonomyReceiptSha256}.json`);
    ensureRegularCanonicalFile(identity.homeRoot, receiptFile, 'G05A_RECEIPT_CORRUPT', 'G05A daily receipt');
    const receipt = validateDailyReceipt(readJson(receiptFile), identity, threadRef);
    if (receipt.dailyAutonomyReceiptRef !== head.dailyAutonomyReceiptRef || receipt.dailyAutonomyReceiptSha256 !== head.dailyAutonomyReceiptSha256 || receipt.calendarDateRef !== head.calendarDateRef || receipt.g03DreamHeadSha256 !== head.g03DreamHeadSha256 || receipt.g03WakeReceiptSha256 !== head.g03WakeReceiptSha256) fail('G05A_RECEIPT_CORRUPT', 'G05A head does not bind exact receipt semantics');
    validateReceiptAgainstSources(receipt, identity, threadRef, paths);
    receipts.push(receipt);
  }
  return { head: current, receipt: receipts.at(-1), headChain, receipts };
}

function writeDailyReceipt(identity, threadRef, receipt) {
  const paths = pathsFor(identity, threadRef);
  validateDailyReceipt(receipt, identity, threadRef);
  validateReceiptAgainstSources(receipt, identity, threadRef, paths);
  const prior = loadCurrentReceipt(identity, threadRef)?.head ?? null;
  const file = path.join(paths.receipts, `${receipt.dailyAutonomyReceiptSha256}.json`);
  const state = writeExclusive(file, receipt);
  if (state === 'EXISTS') {
    ensureRegularCanonicalFile(identity.homeRoot, file, 'G05A_RECEIPT_CORRUPT', 'G05A daily receipt');
    const existing = validateDailyReceipt(readJson(file), identity, threadRef);
    if (semanticHash(existing) !== semanticHash(receipt)) fail('G05A_RECEIPT_CORRUPT', 'same G05A receipt address contains different content');
  }
  const sequence = prior ? prior.sequence + 1 : 0;
  const headCore = {
    schemaVersion: DAILY_HEAD_SCHEMA,
    homeRef: receipt.homeRef,
    deviceRef: receipt.deviceRef,
    companionLineageRef: receipt.companionLineageRef,
    threadRef: receipt.threadRef,
    sequence,
    calendarDateRef: receipt.calendarDateRef,
    dailyAutonomyReceiptRef: receipt.dailyAutonomyReceiptRef,
    dailyAutonomyReceiptSha256: receipt.dailyAutonomyReceiptSha256,
    g03DreamHeadSha256: receipt.g03DreamHeadSha256,
    g03WakeReceiptSha256: receipt.g03WakeReceiptSha256,
    priorAutonomyHeadSha256: prior?.autonomyHeadSha256 ?? null,
    formedAt: receipt.formedAt
  };
  const head = { ...headCore, autonomyHeadSha256: semanticHash(headCore) };
  const headFile = path.join(paths.heads, `${head.autonomyHeadSha256}.json`);
  const headState = writeExclusive(headFile, head);
  if (headState === 'EXISTS') {
    ensureRegularCanonicalFile(identity.homeRoot, headFile, 'G05A_RECEIPT_CORRUPT', 'immutable G05A head');
    if (semanticHash(readJson(headFile)) !== semanticHash(head)) fail('G05A_RECEIPT_CORRUPT', 'same G05A head address contains different content');
  }
  atomicWrite(paths.head, head);
  return { file, headFile, head };
}

function g03BundleForDate(daily, calendarDateRef) {
  const current = daily.currentDailyStratum;
  return current?.stratum?.calendarDateRef === calendarDateRef && current?.wake ? current : null;
}

function verifyWakeBundle(bundle, daily) {
  if (!bundle?.wake?.wakeReceiptSha256 || !bundle?.stratum?.dailyStratumSha256 || !daily?.head?.dailyDreamHeadSha256) {
    fail('G05A_WAKE_NOT_COMMITTED', 'G05A requires a committed G03 Daily Stratum and wake');
  }
  if (daily.head.dailyStratumSha256 !== bundle.stratum.dailyStratumSha256 || daily.head.wakeReceiptSha256 !== bundle.wake.wakeReceiptSha256) {
    fail('G05A_WAKE_NOT_COMMITTED', 'G03 current head does not bind the observed stratum/wake');
  }
}

function exactG04HeldEffects(output) {
  const held = output?.heldEffects;
  if (!held || typeof held !== 'object') return false;
  return held.modelWeightsChanged === false && held.adapterChanged === false && held.runtimeActivation === false && held.rhythmPromotionPerformed === false &&
    held.scoreMutationPerformed === false && held.g03MutationPerformed === false && held.realTrainingPerformed === false && held.crossDeviceSync === false && held.publicationPerformed === false;
}

async function runOptionalLearning({ policy, plan, wakeSummary, identity, threadRef }) {
  if (policy.optionalLearningPolicy === 'ABSENT') return { disposition: 'ABSENT', failureCode: null, evidenceRef: null, evidenceSha256: null };
  if (policy.optionalLearningPolicy === 'DEFERRED' || !plan) return { disposition: 'DEFERRED', failureCode: null, evidenceRef: null, evidenceSha256: null };
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return { disposition: 'FAILED', failureCode: 'OPTIONAL_LEARNING_PLAN_INVALID', evidenceRef: null, evidenceSha256: null };
  try {
    const output = evaluateStageASimulatedRhythm({
      ...structuredClone(plan),
      home: identity.homeRoot,
      homeRef: identity.homeRef,
      deviceRef: identity.deviceRef,
      companionLineageRef: identity.companionLineageRef,
      threadRef,
      expectedConversationHeadSha256: wakeSummary.sourceConversationHeadSha256,
      expectedScoreHeadSha256: wakeSummary.sourceScoreHeadSha256,
      expectedSemanticOwnerHeadSha256: wakeSummary.sourceSemanticAuthorityHeadSha256,
      expectedDreamHeadSha256: wakeSummary.g03DreamHeadSha256,
      expectedDailyStratumSha256: wakeSummary.g03DailyStratumSha256,
      expectedWakeReceiptSha256: wakeSummary.g03WakeReceiptSha256
    });
    const dispositionReceipt = output?.disposition;
    if (!dispositionReceipt?.dispositionRef || !SHA256.test(dispositionReceipt.dispositionSha256 ?? '')) return { disposition: 'FAILED', failureCode: 'OPTIONAL_LEARNING_EVIDENCE_INVALID', evidenceRef: null, evidenceSha256: null };
    const source = output?.source;
    const normalizedSource = source?.conversationHeadSha256 ? source : {
      conversationHeadSha256: source?.bundle?.stratum?.sourceConversationHeadSha256 ?? null,
      scoreHeadSha256: source?.bundle?.stratum?.sourceScoreHeadSha256 ?? null,
      semanticOwnerHeadSha256: source?.bundle?.stratum?.sourceSemanticAuthorityHeadSha256 ?? null,
      dreamHeadSha256: source?.daily?.head?.dailyDreamHeadSha256 ?? null,
      dailyStratumSha256: source?.bundle?.stratum?.dailyStratumSha256 ?? null,
      wakeReceiptSha256: source?.bundle?.wake?.wakeReceiptSha256 ?? null
    };
    const exactSource = normalizedSource.conversationHeadSha256 === wakeSummary.sourceConversationHeadSha256 && normalizedSource.scoreHeadSha256 === wakeSummary.sourceScoreHeadSha256 &&
      normalizedSource.semanticOwnerHeadSha256 === wakeSummary.sourceSemanticAuthorityHeadSha256 && normalizedSource.dreamHeadSha256 === wakeSummary.g03DreamHeadSha256 &&
      normalizedSource.dailyStratumSha256 === wakeSummary.g03DailyStratumSha256 && normalizedSource.wakeReceiptSha256 === wakeSummary.g03WakeReceiptSha256;
    if (!exactSource) return { disposition: 'FAILED', failureCode: 'OPTIONAL_LEARNING_SOURCE_MISMATCH', evidenceRef: dispositionReceipt.dispositionRef, evidenceSha256: dispositionReceipt.dispositionSha256 };
    const dispositionHeld = dispositionReceipt.runtimeActivation === false && dispositionReceipt.rhythmPromotionPerformed === false && dispositionReceipt.modelWeightsChanged === false &&
      dispositionReceipt.adapterChanged === false && dispositionReceipt.scoreMutationPerformed === false && dispositionReceipt.g03MutationPerformed === false &&
      dispositionReceipt.realTrainingPerformed === false && dispositionReceipt.stageBAuthorized === false;
    let disposition;
    if (output.state === 'REJECTED' && dispositionHeld) disposition = 'REJECTED';
    else if (output.state === 'DEFERRED' && dispositionHeld) disposition = 'DEFERRED';
    else if (['ACCEPTED_INACTIVE_SIMULATION_ONLY','NARROWED_INACTIVE_SIMULATION_ONLY'].includes(output.state) && dispositionHeld && exactG04HeldEffects(output)) disposition = 'ACCEPTED_INACTIVE';
    else return { disposition: 'FAILED', failureCode: 'OPTIONAL_LEARNING_HELD_EFFECT_OR_STATE_INVALID', evidenceRef: dispositionReceipt.dispositionRef, evidenceSha256: dispositionReceipt.dispositionSha256 };
    return { disposition, failureCode: null, evidenceRef: dispositionReceipt.dispositionRef, evidenceSha256: dispositionReceipt.dispositionSha256 };
  } catch (error) {
    return { disposition: 'FAILED', failureCode: typeof error?.code === 'string' ? error.code : 'OPTIONAL_LEARNING_EXCEPTION', evidenceRef: null, evidenceSha256: null };
  }
}

export async function runScheduledDailyAutonomyTick(input) {
  const observedAt = canonicalTimestamp(input.observedAt);
  const supervisorRef = safeRef(input.supervisorRef, 'supervisorRef', 'G05A_SUPERVISOR_CONFLICT');
  const instanceRef = safeRef(input.instanceRef, 'instanceRef', 'G05A_SUPERVISOR_CONFLICT');
  const modelWorkerRef = safeRef(input.modelWorkerRef, 'modelWorkerRef', 'G05A_SUPERVISOR_CONFLICT');
  const dreamWriterInstanceRef = safeRef(input.dreamWriterInstanceRef, 'dreamWriterInstanceRef', 'G05A_SUPERVISOR_CONFLICT');
  if (modelWorkerRef === supervisorRef || dreamWriterInstanceRef === instanceRef) fail('G05A_SUPERVISOR_CONFLICT', 'supervisor, model worker and G03 writer identities must remain distinct');
  if (typeof input.optionalLearningCallback === 'function') fail('G05A_HELD_EFFECT_VIOLATION', 'arbitrary optional-learning callbacks are not admitted by G05A');
  if (Object.prototype.hasOwnProperty.call(input, 'interactivePending') || Object.prototype.hasOwnProperty.call(input, 'resourceEvidence')) {
    fail('G05A_ADMISSION_EVIDENCE_INVALID', 'raw caller-authored interactive/resource authority is not admitted; G05A requires an exact admission receipt derived from the source-managed resource snapshot contract');
  }
  const loaded = loadStandingRestPolicy(input);
  if (input.expectedPolicyHeadSha256 && input.expectedPolicyHeadSha256 !== loaded.head.policyHeadSha256) fail('G05A_POLICY_NOT_CURRENT', 'expected standing policy head is stale');
  const eligibility = isRestWindowEligible(loaded.policy, observedAt);
  if (!eligibility.eligible) return Object.freeze({ state: 'OUTSIDE_REST_WINDOW', calendarDateRef: eligibility.calendarDateRef, noEffect: true, wakeCommitted: false, interactiveYielded: false, resourceYielded: false, duplicateSuppressed: false });

  const { identity, threadRef } = loadIdentity(input);
  const current = loadCurrentReceipt(identity, threadRef);
  if (current?.receipt?.calendarDateRef === eligibility.calendarDateRef) return Object.freeze({ state: 'DUPLICATE_SUPPRESSED', calendarDateRef: eligibility.calendarDateRef, noEffect: true, wakeCommitted: true, interactiveYielded: false, resourceYielded: false, duplicateSuppressed: true, receipt: current.receipt, head: current.head });

  const initialFrontier = observeScheduledSourceFrontier(input);
  assertExpectedFrontier(initialFrontier, input.expectedSourceFrontier ?? null);
  const admission = validateScheduledAutonomyAdmissionEvidence(input.supervisorAdmissionEvidence, {
    identity, threadRef, supervisorRef, instanceRef, policy: loaded.policy, policyHead: loaded.head, observedAt, frontier: initialFrontier
  });
  if (admission.interactiveWaitState === 'WAITING') return Object.freeze({ state: 'YIELDED_INTERACTIVE', calendarDateRef: eligibility.calendarDateRef, noEffect: true, wakeCommitted: false, interactiveYielded: true, resourceYielded: false, duplicateSuppressed: false, admissionEvidenceRef: admission.admissionEvidenceRef });
  if (admission.resourceAdmissionState !== 'ADMITTED') return Object.freeze({ state: 'YIELDED_RESOURCE', calendarDateRef: eligibility.calendarDateRef, noEffect: true, wakeCommitted: false, interactiveYielded: false, resourceYielded: true, duplicateSuppressed: false, admissionEvidenceRef: admission.admissionEvidenceRef, resourceReasons: admission.resourceAdmissionReasons });

  const paths = pathsFor(identity, threadRef);
  if (input.faults?.pauseAfterInitialPolicyReadMs) {
    const pause = Number(input.faults.pauseAfterInitialPolicyReadMs);
    if (Number.isSafeInteger(pause) && pause > 0 && pause <= 5000) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pause);
  }
  const lease = acquireSupervisorWithRecovery(paths, identity, threadRef, supervisorRef, instanceRef);
  const recoveredAbandonedSupervisor = lease.recovered?.recovered === true;
  try {
    let currentPolicy = loadStandingRestPolicy(input);
    assertSamePolicyGeneration(loaded, currentPolicy);
    const frontierBefore = observeScheduledSourceFrontier(input);
    assertExpectedFrontier(frontierBefore, input.expectedSourceFrontier ?? null);
    validateScheduledAutonomyAdmissionEvidence(admission, {
      identity, threadRef, supervisorRef, instanceRef, policy: currentPolicy.policy, policyHead: currentPolicy.head, observedAt, frontier: frontierBefore
    });
    persistAdmissionEvidence(identity, threadRef, admission);
    let daily = loadDailyMemoryDreamState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
    currentPolicy = loadStandingRestPolicy(input);
    assertSamePolicyGeneration(loaded, currentPolicy);
    const policy = currentPolicy.policy;
    const restInvocationAuthorityRef = policyRestAuthority(policy);
    let bundle = g03BundleForDate(daily, eligibility.calendarDateRef);
    let resumedAfterWake = false;

    if (bundle) {
      if (bundle.orientation?.restInvocationAuthorityRef !== restInvocationAuthorityRef) fail('G05A_RECOVERY_POLICY_DRIFT', 'existing same-day G03 wake belongs to a different standing-policy generation', { expectedRestInvocationAuthorityRef: restInvocationAuthorityRef, observedRestInvocationAuthorityRef: bundle.orientation?.restInvocationAuthorityRef ?? null });
      verifyWakeBundle(bundle, daily);
      resumedAfterWake = true;
    } else {
      const refreshedScore = loadScoreContextState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
      const refreshedDaily = loadDailyMemoryDreamState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
      const refreshedFrontier = observeScheduledSourceFrontier(input);
      assertExpectedFrontier(refreshedFrontier, input.expectedSourceFrontier ?? null);
      currentPolicy = loadStandingRestPolicy(input);
      assertSamePolicyGeneration(loaded, currentPolicy);
      validateScheduledAutonomyAdmissionEvidence(admission, {
        identity, threadRef, supervisorRef, instanceRef, policy: currentPolicy.policy, policyHead: currentPolicy.head, observedAt, frontier: refreshedFrontier
      });
      const priorIndex = refreshedDaily.currentDailyStratum?.stratum?.dayIndex;
      const dayIndex = Number.isSafeInteger(priorIndex) ? priorIndex + 1 : 0;
      const compactDate = eligibility.calendarDateRef.replaceAll('-', '');
      try {
        commitDailyMemoryDream({
          home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef,
          instanceRef: dreamWriterInstanceRef, restInvocationAuthorityRef, dayRef: `day.g05a.${compactDate}`, dayIndex, calendarDateRef: eligibility.calendarDateRef,
          timeZoneRef: policy.timeZoneRef, observedAt, expectedConversationHeadSha256: refreshedScore.head.sourceConversationHeadSha256, expectedScoreHeadSha256: refreshedScore.head.scoreHeadSha256
        });
      } catch (error) { fail('G05A_DREAM_FAILED', 'automatic G03 admission failed closed', { causeCode: error?.code ?? 'UNKNOWN', message: error?.message ?? String(error) }); }
      daily = loadDailyMemoryDreamState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
      bundle = g03BundleForDate(daily, eligibility.calendarDateRef);
      verifyWakeBundle(bundle, daily);
    }

    if (input.faults?.terminateProcessAfterWakeBeforeReceipt === true) process.exit(86);
    if (input.faults?.failAfterWakeBeforeReceipt === true) fail('G05A_AFTER_WAKE_FAULT', 'simulated exception after committed G03 wake and before G05A receipt/current pointer');

    const scoreBeforeOptional = loadScoreContextState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
    const dailyBeforeOptional = loadDailyMemoryDreamState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
    verifyWakeBundle(bundle, dailyBeforeOptional);
    const wakeSummary = {
      homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef,
      calendarDateRef: eligibility.calendarDateRef,
      sourceConversationHeadSha256: bundle.stratum.sourceConversationHeadSha256,
      sourceScoreHeadSha256: bundle.stratum.sourceScoreHeadSha256,
      sourceSemanticAuthorityHeadSha256: bundle.stratum.sourceSemanticAuthorityHeadSha256,
      g03DreamHeadSha256: dailyBeforeOptional.head.dailyDreamHeadSha256,
      g03DailyStratumSha256: bundle.stratum.dailyStratumSha256,
      g03WakeReceiptSha256: bundle.wake.wakeReceiptSha256
    };
    const optional = await runOptionalLearning({ policy, plan: input.optionalLearningPlan ?? null, wakeSummary, identity, threadRef });
    const scoreAfterOptional = loadScoreContextState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
    const dailyAfterOptional = loadDailyMemoryDreamState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
    if (scoreAfterOptional.head.scoreHeadSha256 !== scoreBeforeOptional.head.scoreHeadSha256 || dailyAfterOptional.head.dailyDreamHeadSha256 !== dailyBeforeOptional.head.dailyDreamHeadSha256) fail('G05A_HELD_EFFECT_VIOLATION', 'optional G04 Stage-A evaluation modified Score or G03 wake continuity');

    currentPolicy = loadStandingRestPolicy(input);
    assertSamePolicyGeneration(loaded, currentPolicy);
    const receiptCore = {
      schemaVersion: DAILY_RECEIPT_SCHEMA, mode: SCHEDULED_DAILY_AUTONOMY_MODE,
      homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef,
      calendarDateRef: eligibility.calendarDateRef, timeZoneRef: policy.timeZoneRef, observedAt,
      standingPolicyRef: policy.policyRef, standingPolicySha256: policy.policySha256, standingPolicyHeadSha256: currentPolicy.head.policyHeadSha256, standingRestAuthorityRef: policy.standingRestAuthorityRef,
      supervisorRef, supervisorInstanceRef: instanceRef, modelWorkerRef, dreamWriterInstanceRef, recoveredAbandonedSupervisor,
      supervisorAdmissionEvidenceRef: admission.admissionEvidenceRef, supervisorAdmissionEvidenceSha256: admission.admissionEvidenceSha256,
      interactiveObservationState: admission.interactiveWaitState === 'IDLE' ? 'IDLE_CONFIRMED' : 'PENDING', resourceEvidenceState: admission.resourceAdmissionState === 'ADMITTED' ? 'SUFFICIENT' : 'INSUFFICIENT',
      resourceEvidenceSourceRef: admission.resourceSnapshotSourceRef, resourceEvidenceObservedAt: admission.resourceSnapshot.observedAt,
      resourceSnapshotRef: admission.resourceSnapshotRef, resourceSnapshotFingerprint: admission.resourceSnapshotFingerprint, resourceSnapshotSourceHash: admission.resourceSnapshotSourceHash,
      resourceSnapshotFormationRef: admission.resourceSnapshotFormationRef, resourceEvidenceClass: admission.resourceEvidenceClass, resourceAdmissionFingerprint: admission.resourceAdmissionFingerprint,
      sourceConversationHeadSha256: bundle.stratum.sourceConversationHeadSha256, sourceScoreHeadSha256: bundle.stratum.sourceScoreHeadSha256, sourceSemanticAuthorityHeadSha256: bundle.stratum.sourceSemanticAuthorityHeadSha256,
      g03DreamHeadSha256: dailyAfterOptional.head.dailyDreamHeadSha256, g03DailyStratumSha256: bundle.stratum.dailyStratumSha256, g03WakeReceiptSha256: bundle.wake.wakeReceiptSha256,
      wakeCommitted: true, resumedAfterWake,
      optionalLearningPolicy: policy.optionalLearningPolicy, optionalLearningDisposition: optional.disposition, optionalLearningFailureCode: optional.failureCode,
      optionalLearningEvidenceRef: optional.evidenceRef, optionalLearningEvidenceSha256: optional.evidenceSha256,
      interactiveYielded: false, resourceYielded: false, duplicateSuppressed: false,
      synchronizationPerformed: false, trainingPerformed: false, modelWeightsChanged: false, adapterChanged: false, rhythmActivationPerformed: false, powerControlPerformed: false, nativeWindowsServiceInstalled: false, publicationPerformed: false,
      nextSafeRoute: NEXT_SAFE_ROUTE, formedAt: observedAt
    };
    const receipt = addressed('g05a-daily-receipt', 'dailyAutonomyReceiptRef', 'dailyAutonomyReceiptSha256', receiptCore);
    const written = writeDailyReceipt(identity, threadRef, receipt);
    return Object.freeze({ state: 'COMPLETED', calendarDateRef: eligibility.calendarDateRef, wakeCommitted: true, interactiveYielded: false, resourceYielded: false, duplicateSuppressed: false, resumedAfterWake, recoveredAbandonedSupervisor, receipt, head: written.head });
  } finally {
    if (!releaseSupervisor(lease)) fail('G05A_SUPERVISOR_CONFLICT', 'supervisor writer lease could not be released safely');
  }
}

export function loadScheduledDailyAutonomyState(input) {
  const { identity, threadRef } = loadIdentity(input);
  const policy = loadStandingRestPolicy(input);
  const current = loadCurrentReceipt(identity, threadRef);
  return Object.freeze({
    schemaVersion: SCHEDULED_DAILY_AUTONOMY_SCHEMA,
    identity: structuredClone(identity), threadRef,
    policy: policy.policy, policyHead: policy.head,
    head: current?.head ?? null, headChain: current?.headChain ?? [],
    currentReceipt: current?.receipt ?? null,
    state: current ? 'CURRENT' : 'POLICY_READY'
  });
}

export function projectScheduledDailyAutonomy(input) {
  const state = loadScheduledDailyAutonomyState(input);
  const receipt = state.currentReceipt;
  return Object.freeze({
    schemaVersion: 'vexlife.g05a.scheduled-daily-autonomy-projection/v2',
    state: state.state,
    calendarDateRef: receipt?.calendarDateRef ?? null,
    timeZoneRef: state.policy.timeZoneRef,
    standingPolicyRef: state.policy.policyRef,
    standingPolicyHeadSha256: receipt?.standingPolicyHeadSha256 ?? state.policyHead.policyHeadSha256,
    supervisorRef: receipt?.supervisorRef ?? null,
    supervisorAdmissionEvidenceRef: receipt?.supervisorAdmissionEvidenceRef ?? null,
    supervisorAdmissionEvidenceSha256: receipt?.supervisorAdmissionEvidenceSha256 ?? null,
    interactiveObservationState: receipt?.interactiveObservationState ?? null,
    resourceEvidenceState: receipt?.resourceEvidenceState ?? null,
    resourceSnapshotRef: receipt?.resourceSnapshotRef ?? null,
    resourceSnapshotFingerprint: receipt?.resourceSnapshotFingerprint ?? null,
    resourceAdmissionFingerprint: receipt?.resourceAdmissionFingerprint ?? null,
    g03DreamHeadSha256: receipt?.g03DreamHeadSha256 ?? null,
    g03DailyStratumSha256: receipt?.g03DailyStratumSha256 ?? null,
    g03WakeReceiptSha256: receipt?.g03WakeReceiptSha256 ?? null,
    wakeCommitted: receipt?.wakeCommitted ?? false,
    optionalLearningDisposition: receipt?.optionalLearningDisposition ?? null,
    optionalLearningFailureCode: receipt?.optionalLearningFailureCode ?? null,
    synchronizationPerformed: receipt?.synchronizationPerformed ?? false,
    trainingPerformed: receipt?.trainingPerformed ?? false,
    modelWeightsChanged: receipt?.modelWeightsChanged ?? false,
    adapterChanged: receipt?.adapterChanged ?? false,
    rhythmActivationPerformed: receipt?.rhythmActivationPerformed ?? false,
    powerControlPerformed: receipt?.powerControlPerformed ?? false,
    nativeWindowsServiceInstalled: receipt?.nativeWindowsServiceInstalled ?? false,
    publicationPerformed: receipt?.publicationPerformed ?? false,
    nextSafeRoute: receipt?.nextSafeRoute ?? 'WAIT_FOR_ELIGIBLE_REST_WINDOW'
  });
}

export function sourceDescentScheduledDailyAutonomy(input, receiptSha256 = null) {
  const { identity, threadRef } = loadIdentity(input);
  const paths = pathsFor(identity, threadRef);
  const current = loadCurrentReceipt(identity, threadRef);
  const sha = receiptSha256 ?? current?.receipt?.dailyAutonomyReceiptSha256;
  if (!SHA256.test(sha ?? '')) fail('G05A_RECEIPT_CORRUPT', 'no valid daily autonomy receipt SHA is available');
  const reachable = new Set((current?.receipts ?? []).map((item) => item.dailyAutonomyReceiptSha256));
  if (!reachable.has(sha)) fail('G05A_RECEIPT_CORRUPT', 'requested G05A receipt is not reachable from the committed autonomy head lineage', { receiptSha256: sha });
  const file = path.join(paths.receipts, `${sha}.json`);
  ensureRegularCanonicalFile(identity.homeRoot, file, 'G05A_RECEIPT_CORRUPT', 'G05A daily receipt');
  const receipt = validateDailyReceipt(readJson(file), identity, threadRef);
  const source = validateReceiptAgainstSources(receipt, identity, threadRef, paths);
  return Object.freeze({
    schemaVersion: 'vexlife.g05a.scheduled-daily-autonomy-source-descent/v2',
    dailyAutonomyReceiptRef: receipt.dailyAutonomyReceiptRef,
    dailyAutonomyReceiptSha256: receipt.dailyAutonomyReceiptSha256,
    standingPolicyRef: receipt.standingPolicyRef,
    standingPolicySha256: receipt.standingPolicySha256,
    standingPolicyHeadSha256: receipt.standingPolicyHeadSha256,
    supervisorAdmissionEvidenceRef: receipt.supervisorAdmissionEvidenceRef,
    supervisorAdmissionEvidenceSha256: receipt.supervisorAdmissionEvidenceSha256,
    interactiveObservationState: receipt.interactiveObservationState,
    resourceEvidenceState: receipt.resourceEvidenceState,
    resourceEvidenceSourceRef: receipt.resourceEvidenceSourceRef,
    resourceSnapshotRef: receipt.resourceSnapshotRef,
    resourceSnapshotFingerprint: receipt.resourceSnapshotFingerprint,
    resourceSnapshotSourceHash: receipt.resourceSnapshotSourceHash,
    resourceSnapshotFormationRef: receipt.resourceSnapshotFormationRef,
    resourceAdmissionFingerprint: receipt.resourceAdmissionFingerprint,
    sourceConversationHeadSha256: receipt.sourceConversationHeadSha256,
    sourceScoreHeadSha256: receipt.sourceScoreHeadSha256,
    sourceSemanticAuthorityHeadSha256: receipt.sourceSemanticAuthorityHeadSha256,
    g03DreamHeadSha256: receipt.g03DreamHeadSha256,
    g03DailyStratumSha256: receipt.g03DailyStratumSha256,
    g03WakeReceiptSha256: receipt.g03WakeReceiptSha256,
    optionalLearningDisposition: receipt.optionalLearningDisposition,
    g03HistoricalSourceVerificationState: source.descent.historicalSourceVerificationState,
    noRawConversationContent: true
  });
}

// [VXG RealForever]
