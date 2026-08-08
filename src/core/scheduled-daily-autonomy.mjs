import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { loadScoreContextState } from './score-context-continuity.mjs';
import {
  DAILY_MEMORY_DREAM_CONTRACT,
  commitDailyMemoryDream,
  loadDailyMemoryDreamState,
  sourceDescentForDailyStratum
} from './daily-memory-dream.mjs';
import { evaluateStageASimulatedRhythm } from './evaluated-rhythm-learning.mjs';
import {
  G05_STANDING_PURPOSE_REF,
  G05_MEMORY_ONLY_MODE,
  G05_LIVE_RUNTIME_SOURCE_REF,
  G05_LIVE_RUNTIME_SOURCE_HASH,
  buildG05StandingScopeFingerprint,
  observeWindowsG05Runtime,
  resolveCurrentG05ScheduledAdmission,
  validateHistoricalG05ScheduledAdmissionProvenance
} from './g05-runtime-authority-substrate.mjs';
import { semanticHash } from './utils.mjs';

export const SCHEDULED_DAILY_AUTONOMY_MODE = 'DETERMINISTIC_SCHEDULED_AUTONOMY_CORE';
export const SCHEDULED_DAILY_AUTONOMY_SCHEMA = 'vexlife.g05a.scheduled-daily-autonomy/v1';
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

const REF = /^[a-z0-9](?:[a-z0-9._-]{0,190}[a-z0-9])?$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/u;
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const DAILY_RECEIPT_SCHEMA = 'vexlife.g05a.daily-autonomy-receipt/v3';
const DAILY_HEAD_SCHEMA = 'vexlife.g05a.daily-autonomy-head/v2';
const POLICY_SCHEMA = 'vexlife.g05a.standing-rest-policy/v2';
const POLICY_HEAD_SCHEMA = 'vexlife.g05a.standing-rest-policy-head/v3';
const ADMISSION_EVIDENCE_SCHEMA = 'vexlife.g05a.supervisor-admission-evidence/v2';
const ADMISSION_EVIDENCE_CONTRACT = 'contract.vexlife.g05a.supervisor-admission-evidence/v2';
const FRONTIER_FIELDS = Object.freeze([
  'conversationHeadSha256', 'scoreHeadSha256', 'semanticAuthorityHeadSha256',
  'dreamHeadSha256', 'dailyStratumSha256', 'wakeReceiptSha256'
]);
const REQUIRED_STANDING_USE_REFS = Object.freeze([
  'use.vexlife.g05.form-bounded-supervisor-admission-and-wake-receipts',
  'use.vexlife.g05.schedule-one-g03-memory-only-dream-per-local-calendar-day'
]);
const OPTIONAL_STAGE_A_USE_REF = 'use.vexlife.g05.after-wake-g04-stage-a-simulated-inactive-evaluation';
const PROHIBITED_STANDING_USE_REFS = Object.freeze([
  'use.vexlife.g05.cloud-upload',
  'use.vexlife.g05.cross-device-sync',
  'use.vexlife.g05.model-adapter-or-weight-mutation',
  'use.vexlife.g05.native-supervisor-installation',
  'use.vexlife.g05.power-control',
  'use.vexlife.g05.publication',
  'use.vexlife.g05.real-training'
].sort());
const NEXT_SAFE_ROUTE = 'G05B_BOUNDED_SYNC_REQUIRES_SEPARATE_TARGET_AND_HOST_AUTHORITY';
const HELD_EFFECT_FIELDS = Object.freeze([
  'synchronizationPerformed', 'trainingPerformed', 'modelWeightsChanged', 'adapterChanged',
  'rhythmActivationPerformed', 'powerControlPerformed', 'nativeWindowsServiceInstalled', 'publicationPerformed'
]);
const CALLER_AUTHORITY_FIELDS = Object.freeze([
  'observedAt', 'supervisorAdmissionEvidence', 'resourceSnapshot', 'resourceEvidence',
  'interactivePending', 'consentState', 'standingRestAuthorityRef', 'schedulerGeneration'
]);

export class ScheduledDailyAutonomyError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'ScheduledDailyAutonomyError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) { throw new ScheduledDailyAutonomyError(code, message, details); }
function string(value, label, code = 'G05A_POLICY_INVALID') {
  if (typeof value !== 'string' || !value) fail(code, `${label} is required`);
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
function assertSha(value, label, code = 'G05A_RECEIPT_CORRUPT') {
  if (!SHA256.test(value ?? '')) fail(code, `${label} must be lowercase SHA-256`, { value });
  return value;
}
function canonicalTimestamp(value, label = 'observedAt', code = 'G05A_CLOCK_INVALID') {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code, `${label} must be canonical ISO-8601 UTC`, { value });
  return value;
}
function validateMinute(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1439) fail('G05A_POLICY_INVALID', `${label} must be a minute in [0,1439]`, { value });
  return value;
}
function validateTimeZone(value) {
  const zone = string(value, 'timeZoneRef');
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date(0)); }
  catch { fail('G05A_POLICY_INVALID', 'timeZoneRef must be an IANA time zone', { value }); }
  return zone;
}
function closedKeys(value, expected, code, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${label} is malformed`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.join('\n') !== wanted.join('\n')) fail(code, `${label} contains unknown or missing fields`, { actual, wanted });
}
function addressed(prefix, refField, hashField, core) {
  const pre = structuredClone(core);
  const ref = `${prefix}.${semanticHash(pre).slice(0, 32)}`;
  const withRef = { ...pre, [refField]: ref };
  return Object.freeze({ ...withRef, [hashField]: semanticHash(withRef) });
}
function validateAddressed(value, prefix, refField, hashField, schemaVersion, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${prefix} is malformed`);
  const observedRef = value[refField];
  const observedHash = value[hashField];
  const core = structuredClone(value);
  delete core[refField]; delete core[hashField];
  const expectedRef = `${prefix}.${semanticHash(core).slice(0, 32)}`;
  if (value.schemaVersion !== schemaVersion || observedRef !== expectedRef || !SHA256.test(observedHash ?? '') || semanticHash({ ...core, [refField]: observedRef }) !== observedHash) {
    fail(code, `${prefix} content-address identity is invalid`, { observedRef, expectedRef });
  }
  return value;
}

function canonicalHome(home) {
  const requested = path.resolve(string(home, 'home', 'G05A_HOME_IDENTITY_MISMATCH'));
  let stat;
  try { stat = fs.lstatSync(requested); } catch (error) { fail('G05A_HOME_IDENTITY_MISMATCH', 'Vex Home is unavailable', { cause: error.message }); }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('G05A_HOME_IDENTITY_MISMATCH', 'Vex Home must be one canonical directory');
  const real = fs.realpathSync.native(requested);
  const normalize = (item) => process.platform === 'win32' ? path.normalize(item).toLowerCase() : path.normalize(item);
  if (normalize(real) !== normalize(requested)) fail('G05A_HOME_IDENTITY_MISMATCH', 'Vex Home root is not canonical', { requested, real });
  return real;
}
function homePath(home, ...segments) {
  const root = canonicalHome(home);
  const clean = segments.map((segment, index) => safeRef(segment, `path segment ${index}`, 'G05A_HOME_IDENTITY_MISMATCH'));
  const target = path.resolve(root, ...clean);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail('G05A_HOME_IDENTITY_MISMATCH', 'G05A path escapes Vex Home', { target });
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) continue;
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) fail('G05A_HOME_IDENTITY_MISMATCH', 'G05A path traverses a symlink/junction', { path: cursor });
    const real = fs.realpathSync.native(cursor);
    const normalize = (item) => process.platform === 'win32' ? path.normalize(item).toLowerCase() : path.normalize(item);
    if (normalize(real) !== normalize(cursor)) fail('G05A_HOME_IDENTITY_MISMATCH', 'G05A path traverses a non-canonical alias', { path: cursor, real });
  }
  return target;
}
function pathsFor(identity, threadRef) {
  const home = identity.homeRoot ?? identity.home;
  const lineage = safeRef(identity.companionLineageRef, 'companionLineageRef', 'G05A_HOME_IDENTITY_MISMATCH');
  const thread = safeRef(threadRef, 'threadRef', 'G05A_HOME_IDENTITY_MISMATCH');
  return {
    root: homePath(home, 'scheduled-daily-autonomy', lineage, thread),
    policies: homePath(home, 'scheduled-daily-autonomy', lineage, thread, 'policies'),
    policyHeads: homePath(home, 'scheduled-daily-autonomy', lineage, thread, 'policy-heads'),
    admissions: homePath(home, 'scheduled-daily-autonomy', lineage, thread, 'admissions'),
    receipts: homePath(home, 'scheduled-daily-autonomy', lineage, thread, 'receipts'),
    heads: homePath(home, 'scheduled-daily-autonomy', lineage, thread, 'heads'),
    policyHead: homePath(home, 'scheduled-daily-autonomy', lineage, thread, 'policy-head.json'),
    head: homePath(home, 'scheduled-daily-autonomy', lineage, thread, 'head.json'),
    lock: homePath(home, 'scheduled-daily-autonomy', lineage, thread, 'supervisor.lock'),
    policyLock: homePath(home, 'scheduled-daily-autonomy', lineage, thread, 'policy-writer.lock')
  };
}
function writeExclusive(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let fd = null;
  try {
    fd = fs.openSync(file, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd); fs.closeSync(fd); return 'CREATED';
  } catch (error) {
    if (fd !== null) { try { fs.closeSync(fd); } catch {} }
    if (error?.code === 'EEXIST') return 'EXISTS';
    throw error;
  }
}
function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, file);
}
function readJson(file, code = 'G05A_RECEIPT_CORRUPT', label = 'G05A receipt') {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(code, `${label} could not be read`, { file, cause: error.message }); }
}
function ensureRegularCanonicalFile(home, file, code, label) {
  const root = canonicalHome(home);
  const resolved = path.resolve(file);
  const relative = path.relative(root, resolved);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail(code, `${label} escapes Vex Home`, { file });
  let stat;
  try { stat = fs.lstatSync(resolved); } catch (error) { fail(code, `${label} is missing`, { file, cause: error.message }); }
  if (stat.isSymbolicLink() || !stat.isFile()) fail(code, `${label} must be one regular canonical file`, { file });
  return resolved;
}
function loadIdentity(input) {
  const score = loadScoreContextState({ home: input.home, homeRef: input.homeRef, deviceRef: input.deviceRef, companionLineageRef: input.companionLineageRef, threadRef: input.threadRef });
  return { score, identity: score.identity, threadRef: score.threadRef };
}

function policyCore(input) {
  if ('consentState' in input || 'standingRestAuthorityRef' in input) fail('G05A_POLICY_INVALID', 'standing policy configuration cannot accept caller consent or authority');
  const optionalLearningPolicy = string(input.optionalLearningPolicy ?? 'ABSENT', 'optionalLearningPolicy');
  if (!OPTIONAL_LEARNING_POLICIES.includes(optionalLearningPolicy)) fail('G05A_POLICY_INVALID', 'optionalLearningPolicy is unsupported');
  const start = validateMinute(input.restWindowStartLocalMinute, 'restWindowStartLocalMinute');
  const end = validateMinute(input.restWindowEndLocalMinute, 'restWindowEndLocalMinute');
  if (start === end) fail('G05A_POLICY_INVALID', 'rest window start and end must differ');
  return {
    schemaVersion: POLICY_SCHEMA,
    humanSubjectRef: safeRef(input.humanSubjectRef, 'humanSubjectRef'),
    homeRef: safeRef(input.homeRef, 'homeRef'),
    deviceRef: safeRef(input.deviceRef, 'deviceRef'),
    companionLineageRef: safeRef(input.companionLineageRef, 'companionLineageRef'),
    threadRef: safeRef(input.threadRef, 'threadRef'),
    timeZoneRef: validateTimeZone(input.timeZoneRef),
    restWindowStartLocalMinute: start,
    restWindowEndLocalMinute: end,
    exactlyOnceCalendarDay: true,
    interactiveYieldRequired: true,
    localOnly: true,
    resourcePolicy: 'G05S_CURRENT_SCHEDULED_ADMISSION_REQUIRED',
    optionalLearningPolicy,
    executionAuthority: 'NONE_CONFIGURATION_ONLY',
    currentness: 'CURRENT',
    formedAt: canonicalTimestamp(input.formedAt ?? new Date().toISOString(), 'formedAt', 'G05A_POLICY_INVALID')
  };
}
export function formStandingRestPolicy(input) { return addressed('g05a-rest-policy', 'policyRef', 'policySha256', policyCore(input)); }
export function validateStandingRestPolicy(policy) {
  validateAddressed(policy, 'g05a-rest-policy', 'policyRef', 'policySha256', POLICY_SCHEMA, 'G05A_POLICY_INVALID');
  const expected = formStandingRestPolicy(policy);
  if (expected.policySha256 !== policy.policySha256) fail('G05A_POLICY_INVALID', 'standing rest policy fields are invalid');
  if ('consentState' in policy || 'standingRestAuthorityRef' in policy || policy.executionAuthority !== 'NONE_CONFIGURATION_ONLY') fail('G05A_POLICY_INVALID', 'standing policy must remain configuration-only');
  return policy;
}
export function buildScheduledStandingScopeForPolicy(policy) {
  validateStandingRestPolicy(policy);
  const permittedUseRefs = [...REQUIRED_STANDING_USE_REFS];
  if (policy.optionalLearningPolicy === 'EVALUATE_AFTER_WAKE') permittedUseRefs.push(OPTIONAL_STAGE_A_USE_REF);
  permittedUseRefs.sort();
  const scope = {
    schemaVersion: 'vextreme.daily-dream-standing-consent-scope/v1',
    humanSubjectRef: policy.humanSubjectRef,
    homeRef: policy.homeRef,
    deviceRef: policy.deviceRef,
    companionLineageRef: policy.companionLineageRef,
    threadRef: policy.threadRef,
    purposeRef: G05_STANDING_PURPOSE_REF,
    selectedMode: G05_MEMORY_ONLY_MODE,
    privacyClass: 'DEVICE_PRIVATE',
    permittedUseRefs,
    prohibitedUseRefs: [...PROHIBITED_STANDING_USE_REFS],
    timeZoneRef: policy.timeZoneRef,
    restWindowStartLocalMinute: policy.restWindowStartLocalMinute,
    restWindowEndLocalMinute: policy.restWindowEndLocalMinute,
    exactlyOnceCalendarDay: true,
    interactiveYieldRequired: true,
    localOnly: true
  };
  const standingScopeFingerprint = buildG05StandingScopeFingerprint(scope);
  return Object.freeze({ scope: Object.freeze(scope), standingScopeFingerprint });
}
function validatePolicyHead(head, identity, threadRef) {
  closedKeys(head, ['schemaVersion','homeRef','deviceRef','companionLineageRef','threadRef','generation','policyRef','policySha256','sourceScoreHeadSha256','priorPolicyHeadSha256','formedAt','policyHeadSha256'], 'G05A_POLICY_NOT_CURRENT', 'standing policy head');
  const { policyHeadSha256, ...core } = head;
  if (head.schemaVersion !== POLICY_HEAD_SCHEMA || !SHA256.test(policyHeadSha256 ?? '') || semanticHash(core) !== policyHeadSha256 ||
      head.homeRef !== identity.homeRef || head.deviceRef !== identity.deviceRef || head.companionLineageRef !== identity.companionLineageRef || head.threadRef !== threadRef ||
      !Number.isSafeInteger(head.generation) || head.generation < 0 || !SHA256.test(head.policySha256 ?? '') || !SHA256.test(head.sourceScoreHeadSha256 ?? '') ||
      (head.generation === 0 ? head.priorPolicyHeadSha256 !== null : !SHA256.test(head.priorPolicyHeadSha256 ?? ''))) fail('G05A_POLICY_NOT_CURRENT', 'standing policy head identity/currentness is invalid');
  return head;
}
export function commitStandingRestPolicy(input) {
  if ('consentState' in input || 'standingRestAuthorityRef' in input) fail('G05A_POLICY_INVALID', 'standing policy configuration cannot accept caller consent or authority');
  const { score, identity, threadRef } = loadIdentity(input);
  const paths = pathsFor(identity, threadRef);
  const policyPaths = { ...paths, lock: paths.policyLock };
  const lease = acquireSupervisorWithRecovery(policyPaths, identity, threadRef, 'supervisor.g05a.policy-writer', `instance.g05a.policy-writer.${process.pid}`);
  try {
    const policy = formStandingRestPolicy({ ...input, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
    const file = path.join(paths.policies, `${policy.policySha256}.json`);
    const state = writeExclusive(file, policy);
    if (state === 'EXISTS' && semanticHash(validateStandingRestPolicy(readJson(file, 'G05A_POLICY_INVALID', 'standing rest policy'))) !== semanticHash(policy)) fail('G05A_POLICY_INVALID', 'same policy address contains different content');
    const prior = fs.existsSync(paths.policyHead) ? loadStandingRestPolicy({ ...input, home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef }).head : null;
    const generation = prior ? prior.generation + 1 : 0;
    const headCore = {
      schemaVersion: POLICY_HEAD_SCHEMA, homeRef: identity.homeRef, deviceRef: identity.deviceRef,
      companionLineageRef: identity.companionLineageRef, threadRef, generation,
      policyRef: policy.policyRef, policySha256: policy.policySha256, sourceScoreHeadSha256: score.head.scoreHeadSha256,
      priorPolicyHeadSha256: prior?.policyHeadSha256 ?? null, formedAt: policy.formedAt
    };
    const head = { ...headCore, policyHeadSha256: semanticHash(headCore) };
    const immutable = path.join(paths.policyHeads, `${head.policyHeadSha256}.json`);
    const headState = writeExclusive(immutable, head);
    if (headState === 'EXISTS' && semanticHash(readJson(immutable, 'G05A_POLICY_INVALID', 'immutable policy head')) !== semanticHash(head)) fail('G05A_POLICY_INVALID', 'same policy head address contains different content');
    atomicWrite(paths.policyHead, head);
    return { policy, head };
  } finally {
    if (!releaseSupervisor(lease)) fail('G05A_SUPERVISOR_CONFLICT', 'standing policy writer lease could not be released safely');
  }
}
export function loadStandingRestPolicy(input) {
  const { identity, threadRef } = loadIdentity(input);
  const paths = pathsFor(identity, threadRef);
  if (!fs.existsSync(paths.policyHead)) fail('G05A_POLICY_NOT_CURRENT', 'no current standing rest policy is configured');
  ensureRegularCanonicalFile(identity.homeRoot, paths.policyHead, 'G05A_POLICY_NOT_CURRENT', 'standing policy head');
  const head = validatePolicyHead(readJson(paths.policyHead, 'G05A_POLICY_NOT_CURRENT', 'standing policy head'), identity, threadRef);
  const immutable = path.join(paths.policyHeads, `${head.policyHeadSha256}.json`);
  ensureRegularCanonicalFile(identity.homeRoot, immutable, 'G05A_POLICY_NOT_CURRENT', 'immutable standing policy head');
  if (semanticHash(validatePolicyHead(readJson(immutable, 'G05A_POLICY_NOT_CURRENT', 'immutable standing policy head'), identity, threadRef)) !== semanticHash(head)) fail('G05A_POLICY_NOT_CURRENT', 'current standing policy head lacks exact immutable identity');
  const file = path.join(paths.policies, `${head.policySha256}.json`);
  ensureRegularCanonicalFile(identity.homeRoot, file, 'G05A_POLICY_NOT_CURRENT', 'standing rest policy');
  const policy = validateStandingRestPolicy(readJson(file, 'G05A_POLICY_NOT_CURRENT', 'standing rest policy'));
  if (policy.policyRef !== head.policyRef || policy.policySha256 !== head.policySha256) fail('G05A_POLICY_NOT_CURRENT', 'standing policy head does not bind exact policy bytes');
  return { policy, head };
}
function assertSamePolicyGeneration(initial, current) {
  if (initial.head.policyHeadSha256 !== current.head.policyHeadSha256 || initial.head.generation !== current.head.generation || initial.policy.policySha256 !== current.policy.policySha256) fail('G05A_POLICY_NOT_CURRENT', 'standing policy generation changed at effect boundary');
}
function policyBinding(loaded) {
  const standing = buildScheduledStandingScopeForPolicy(loaded.policy);
  return Object.freeze({
    schemaVersion: 'vexlife.g05s.scheduled-policy-binding/v1', invocationClass: 'SCHEDULED_G05A',
    policyRef: loaded.policy.policyRef, policySha256: loaded.policy.policySha256,
    policyHeadSha256: loaded.head.policyHeadSha256, policyGeneration: loaded.head.generation,
    standingScope: structuredClone(standing.scope), standingScopeFingerprint: standing.standingScopeFingerprint
  });
}

function localClockParts(observedAt, timeZoneRef) {
  canonicalTimestamp(observedAt);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZoneRef, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(observedAt)).filter((item) => item.type !== 'literal').map((item) => [item.type, item.value]));
  return { calendarDateRef: `${parts.year}-${parts.month}-${parts.day}`, minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute) };
}
export function isRestWindowEligible(policy, observedAt) {
  validateStandingRestPolicy(policy);
  const local = localClockParts(observedAt, policy.timeZoneRef);
  const start = policy.restWindowStartLocalMinute;
  const end = policy.restWindowEndLocalMinute;
  return { ...local, eligible: start < end ? local.minuteOfDay >= start && local.minuteOfDay < end : local.minuteOfDay >= start || local.minuteOfDay < end };
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
function validateFrontier(frontier, code = 'G05A_SOURCE_STALE') {
  closedKeys(frontier, FRONTIER_FIELDS, code, 'source frontier');
  for (const field of FRONTIER_FIELDS) if (frontier[field] !== null) assertSha(frontier[field], `frontier.${field}`, code);
  for (const field of FRONTIER_FIELDS.slice(0, 3)) assertSha(frontier[field], `frontier.${field}`, code);
  const count = FRONTIER_FIELDS.slice(3).filter((field) => frontier[field] !== null).length;
  if (count !== 0 && count !== 3) fail(code, 'G03 frontier identities must be all-null or all-exact');
  return frontier;
}
function assertSameFrontier(observed, expected) {
  validateFrontier(observed); validateFrontier(expected);
  for (const field of FRONTIER_FIELDS) if (observed[field] !== expected[field]) fail('G05A_SOURCE_STALE', `source frontier ${field} drifted`, { observed: observed[field], expected: expected[field] });
}

function processState(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return 'UNVERIFIABLE';
  if (pid === process.pid) return 'ACTIVE';
  try { process.kill(pid, 0); return 'ACTIVE'; }
  catch (error) { if (error?.code === 'ESRCH') return 'ABSENT'; if (error?.code === 'EPERM') return 'ACTIVE'; return 'UNVERIFIABLE'; }
}
function validateSupervisorLease(value, identity, threadRef) {
  closedKeys(value, ['schemaVersion','companionLineageRef','threadRef','supervisorRef','instanceRef','pid','token','formedAt','leaseSha256'], 'G05A_SUPERVISOR_CONFLICT', 'supervisor lease');
  const { leaseSha256, ...core } = value;
  if (value.schemaVersion !== 'vexlife.g05a.supervisor-writer/v2' || semanticHash(core) !== leaseSha256 || value.companionLineageRef !== identity.companionLineageRef || value.threadRef !== threadRef) fail('G05A_SUPERVISOR_CONFLICT', 'supervisor lease is invalid');
  assertSha(leaseSha256, 'leaseSha256', 'G05A_SUPERVISOR_CONFLICT');
  return value;
}
function acquireSupervisor(paths, identity, threadRef, supervisorRef, instanceRef) {
  fs.mkdirSync(paths.root, { recursive: true });
  const core = {
    schemaVersion: 'vexlife.g05a.supervisor-writer/v2', companionLineageRef: identity.companionLineageRef, threadRef,
    supervisorRef: safeRef(supervisorRef, 'supervisorRef', 'G05A_SUPERVISOR_CONFLICT'),
    instanceRef: safeRef(instanceRef, 'instanceRef', 'G05A_SUPERVISOR_CONFLICT'), pid: process.pid,
    token: crypto.randomUUID(), formedAt: new Date().toISOString()
  };
  const lease = { ...core, leaseSha256: semanticHash(core) };
  if (writeExclusive(paths.lock, lease) === 'EXISTS') {
    const existing = validateSupervisorLease(readJson(paths.lock, 'G05A_SUPERVISOR_CONFLICT', 'supervisor lease'), identity, threadRef);
    const ownerState = processState(existing.pid);
    fail(ownerState === 'ABSENT' ? 'G05A_SUPERVISOR_RECOVERY_REQUIRED' : 'G05A_SUPERVISOR_CONFLICT', ownerState === 'ABSENT' ? 'abandoned supervisor requires recovery' : 'supervisor already active/unverifiable', { ownerState, ownerInstanceRef: existing.instanceRef, ownerPid: existing.pid, leaseSha256: existing.leaseSha256 });
  }
  return { path: paths.lock, token: lease.token, leaseSha256: lease.leaseSha256, recovered: null };
}
function recoverAbandonedSupervisor(paths, identity, threadRef, expectedInstanceRef = null) {
  if (!fs.existsSync(paths.lock)) return { state: 'NO_SUPERVISOR_LEASE', recovered: false };
  const existing = validateSupervisorLease(readJson(paths.lock, 'G05A_SUPERVISOR_CONFLICT', 'supervisor lease'), identity, threadRef);
  if (expectedInstanceRef !== null && existing.instanceRef !== expectedInstanceRef) fail('G05A_SUPERVISOR_CONFLICT', 'abandoned supervisor instance differs from recovery request');
  if (processState(existing.pid) !== 'ABSENT') fail('G05A_SUPERVISOR_CONFLICT', 'supervisor can recover only a provably absent owner');
  fs.unlinkSync(paths.lock);
  return { state: 'ABANDONED_SUPERVISOR_RECOVERED', recovered: true, abandonedInstanceRef: existing.instanceRef, leaseSha256: existing.leaseSha256 };
}
function acquireSupervisorWithRecovery(paths, identity, threadRef, supervisorRef, instanceRef) {
  try { return acquireSupervisor(paths, identity, threadRef, supervisorRef, instanceRef); }
  catch (error) {
    if (error?.code !== 'G05A_SUPERVISOR_RECOVERY_REQUIRED') throw error;
    const recovered = recoverAbandonedSupervisor(paths, identity, threadRef, error.details?.ownerInstanceRef ?? null);
    return { ...acquireSupervisor(paths, identity, threadRef, supervisorRef, instanceRef), recovered };
  }
}
function releaseSupervisor(lease) {
  if (!lease || !fs.existsSync(lease.path)) return true;
  try { const current = JSON.parse(fs.readFileSync(lease.path, 'utf8')); if (current.token !== lease.token) return false; fs.unlinkSync(lease.path); return true; }
  catch { return false; }
}
export function recoverAbandonedScheduledDailyAutonomySupervisor(input) {
  const { identity, threadRef } = loadIdentity(input);
  return recoverAbandonedSupervisor(pathsFor(identity, threadRef), identity, threadRef, input.expectedAbandonedInstanceRef ?? null);
}

function schedulerGenerationFor(current) { return current?.head ? current.head.sequence + 1 : 0; }
function scheduledAuthorityCore({ loaded, schedulerGeneration, currentAdmission, supervisorRef, instanceRef, supervisorLeaseSha256, calendarDateRef, sourceFrontier }) {
  return {
    policyRef: loaded.policy.policyRef, policySha256: loaded.policy.policySha256,
    policyHeadSha256: loaded.head.policyHeadSha256, policyGeneration: loaded.head.generation,
    schedulerGeneration,
    g05sProvenanceRef: currentAdmission.provenance.provenanceRef,
    g05sProvenanceSha256: currentAdmission.provenance.provenanceSha256,
    standingAuthorityHeadSha256: currentAdmission.standingAuthority.currentAuthorityHeadSha256,
    runtimeObservationFingerprint: currentAdmission.runtimeObservation.semanticFingerprint,
    runtimeTrustSnapshotFingerprint: currentAdmission.runtimeObservation.trustSnapshot.semanticFingerprint,
    resourceSnapshotFingerprint: currentAdmission.runtimeObservation.resourceSnapshot.semanticFingerprint,
    supervisorRef, supervisorInstanceRef: instanceRef, supervisorLeaseSha256, calendarDateRef,
    sourceFrontier: structuredClone(sourceFrontier)
  };
}
function deriveScheduledDreamAuthorityRef(input) { return `authority.g05a.scheduled.${semanticHash(scheduledAuthorityCore(input)).slice(0, 32)}`; }
function formCurrentAdmissionEvidence({ identity, threadRef, loaded, schedulerGeneration, currentAdmission, supervisorRef, instanceRef, supervisorLeaseSha256, calendarDateRef, sourceFrontier }) {
  if (currentAdmission?.state !== 'CURRENT_ADMISSION_EVIDENCE_FORMED' || currentAdmission.provenance?.resourceAdmissionState !== 'ADMITTED') fail('G05A_ADMISSION_EVIDENCE_INVALID', 'G05S did not form executable current admission');
  const scope = buildScheduledStandingScopeForPolicy(loaded.policy);
  const scheduledDreamAuthorityRef = deriveScheduledDreamAuthorityRef({ loaded, schedulerGeneration, currentAdmission, supervisorRef, instanceRef, supervisorLeaseSha256, calendarDateRef, sourceFrontier });
  const core = {
    schemaVersion: ADMISSION_EVIDENCE_SCHEMA, contractRef: ADMISSION_EVIDENCE_CONTRACT,
    issuerClass: 'SOURCE_DESCENDED_G05S_CURRENT_ADMISSION', admissionScope: 'G05A_DREAM_ADMISSION_ONLY',
    homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef,
    supervisorRef, supervisorInstanceRef: instanceRef, supervisorLeaseSha256,
    schedulerGeneration,
    standingPolicyRef: loaded.policy.policyRef, standingPolicySha256: loaded.policy.policySha256,
    standingPolicyHeadSha256: loaded.head.policyHeadSha256, policyGeneration: loaded.head.generation,
    standingScopeFingerprint: scope.standingScopeFingerprint,
    observedAt: currentAdmission.runtimeObservation.observedAt, calendarDateRef,
    sourceFrontier: structuredClone(sourceFrontier),
    g05sProvenance: structuredClone(currentAdmission.provenance),
    g05sProvenanceRef: currentAdmission.provenance.provenanceRef,
    g05sProvenanceSha256: currentAdmission.provenance.provenanceSha256,
    standingAuthorityHeadSha256: currentAdmission.standingAuthority.currentAuthorityHeadSha256,
    standingAuthorityGeneration: currentAdmission.standingAuthority.currentAuthorityGeneration,
    standingConsentSha256: currentAdmission.standingAuthority.standingConsentSha256,
    standingAuthoritySha256: currentAdmission.standingAuthority.authoritySha256,
    runtimeObservationFingerprint: currentAdmission.runtimeObservation.semanticFingerprint,
    runtimeTrustSnapshotFingerprint: currentAdmission.runtimeObservation.trustSnapshot.semanticFingerprint,
    resourceSnapshotFingerprint: currentAdmission.runtimeObservation.resourceSnapshot.semanticFingerprint,
    runtimeSourceRef: currentAdmission.runtimeObservation.sourceRef,
    runtimeSourceHash: currentAdmission.runtimeObservation.sourceHash,
    resourceAdmissionState: currentAdmission.provenance.resourceAdmissionState,
    resourceAdmissionFingerprint: currentAdmission.provenance.resourceAdmissionFingerprint,
    scheduledDreamAuthorityRef,
    externalEffectAuthorityGranted: false, nativeHostConformanceClaimed: false
  };
  return addressed('g05a-supervisor-admission', 'admissionEvidenceRef', 'admissionEvidenceSha256', core);
}
function validateHistoricalAdmissionEvidence(evidence) {
  closedKeys(evidence, [
    'schemaVersion','contractRef','issuerClass','admissionScope','homeRef','deviceRef','companionLineageRef','threadRef',
    'supervisorRef','supervisorInstanceRef','supervisorLeaseSha256','schedulerGeneration','standingPolicyRef','standingPolicySha256',
    'standingPolicyHeadSha256','policyGeneration','standingScopeFingerprint','observedAt','calendarDateRef','sourceFrontier','g05sProvenance',
    'g05sProvenanceRef','g05sProvenanceSha256','standingAuthorityHeadSha256','standingAuthorityGeneration','standingConsentSha256',
    'standingAuthoritySha256','runtimeObservationFingerprint','runtimeTrustSnapshotFingerprint','resourceSnapshotFingerprint','runtimeSourceRef',
    'runtimeSourceHash','resourceAdmissionState','resourceAdmissionFingerprint','scheduledDreamAuthorityRef','externalEffectAuthorityGranted',
    'nativeHostConformanceClaimed','admissionEvidenceRef','admissionEvidenceSha256'
  ], 'G05A_ADMISSION_EVIDENCE_INVALID', 'historical admission evidence');
  validateAddressed(evidence, 'g05a-supervisor-admission', 'admissionEvidenceRef', 'admissionEvidenceSha256', ADMISSION_EVIDENCE_SCHEMA, 'G05A_ADMISSION_EVIDENCE_INVALID');
  if (evidence.contractRef !== ADMISSION_EVIDENCE_CONTRACT || evidence.issuerClass !== 'SOURCE_DESCENDED_G05S_CURRENT_ADMISSION' || evidence.admissionScope !== 'G05A_DREAM_ADMISSION_ONLY') fail('G05A_ADMISSION_EVIDENCE_INVALID', 'historical admission contract/issuer/scope is invalid');
  for (const field of ['homeRef','deviceRef','companionLineageRef','threadRef','supervisorRef','supervisorInstanceRef','standingPolicyRef','runtimeSourceRef','scheduledDreamAuthorityRef']) safeRef(evidence[field], `admission.${field}`, 'G05A_ADMISSION_EVIDENCE_INVALID');
  for (const field of ['supervisorLeaseSha256','standingPolicySha256','standingPolicyHeadSha256','standingScopeFingerprint','g05sProvenanceSha256','standingAuthorityHeadSha256','standingConsentSha256','standingAuthoritySha256','runtimeObservationFingerprint','runtimeTrustSnapshotFingerprint','resourceSnapshotFingerprint','runtimeSourceHash','resourceAdmissionFingerprint']) assertSha(evidence[field], `admission.${field}`, 'G05A_ADMISSION_EVIDENCE_INVALID');
  if (!Number.isSafeInteger(evidence.schedulerGeneration) || evidence.schedulerGeneration < 0 || !Number.isSafeInteger(evidence.policyGeneration) || evidence.policyGeneration < 0 || !Number.isSafeInteger(evidence.standingAuthorityGeneration) || evidence.standingAuthorityGeneration < 0) fail('G05A_ADMISSION_EVIDENCE_INVALID', 'historical admission generations are invalid');
  canonicalTimestamp(evidence.observedAt, 'admission.observedAt', 'G05A_ADMISSION_EVIDENCE_INVALID');
  if (!CALENDAR_DATE.test(evidence.calendarDateRef ?? '')) fail('G05A_ADMISSION_EVIDENCE_INVALID', 'historical admission calendar date is invalid');
  validateFrontier(evidence.sourceFrontier, 'G05A_ADMISSION_EVIDENCE_INVALID');
  const historical = validateHistoricalG05ScheduledAdmissionProvenance(evidence.g05sProvenance);
  if (historical.grantsCurrentAuthority !== false || historical.state !== 'HISTORICAL_INTEGRITY_ONLY') fail('G05A_ADMISSION_EVIDENCE_INVALID', 'historical G05S replay crossed current-authority boundary');
  if (evidence.g05sProvenance.policyRef !== evidence.standingPolicyRef || evidence.g05sProvenance.policySha256 !== evidence.standingPolicySha256 || evidence.g05sProvenance.policyHeadSha256 !== evidence.standingPolicyHeadSha256 || evidence.g05sProvenance.policyGeneration !== evidence.policyGeneration || evidence.g05sProvenance.schedulerGeneration !== evidence.schedulerGeneration || evidence.g05sProvenance.standingScopeFingerprint !== evidence.standingScopeFingerprint || JSON.stringify(evidence.g05sProvenance.sourceFrontier) !== JSON.stringify(evidence.sourceFrontier)) fail('G05A_ADMISSION_EVIDENCE_INVALID', 'historical admission policy/generation/frontier differs from embedded G05S provenance');
  if (evidence.g05sProvenanceRef !== evidence.g05sProvenance.provenanceRef || evidence.g05sProvenanceSha256 !== evidence.g05sProvenance.provenanceSha256 ||
      evidence.standingAuthorityHeadSha256 !== evidence.g05sProvenance.standingAuthorityHeadSha256 || evidence.standingAuthorityGeneration !== evidence.g05sProvenance.standingAuthorityGeneration ||
      evidence.runtimeTrustSnapshotFingerprint !== evidence.g05sProvenance.runtimeTrustSnapshotFingerprint || evidence.resourceSnapshotFingerprint !== evidence.g05sProvenance.resourceSnapshotFingerprint ||
      evidence.runtimeSourceRef !== G05_LIVE_RUNTIME_SOURCE_REF || evidence.runtimeSourceHash !== G05_LIVE_RUNTIME_SOURCE_HASH ||
      evidence.resourceAdmissionState !== 'ADMITTED' || evidence.resourceAdmissionFingerprint !== evidence.g05sProvenance.resourceAdmissionFingerprint ||
      evidence.externalEffectAuthorityGranted !== false || evidence.nativeHostConformanceClaimed !== false) fail('G05A_ADMISSION_EVIDENCE_INVALID', 'historical admission differs from exact G05S provenance');
  const pseudoCurrent = {
    provenance: evidence.g05sProvenance,
    standingAuthority: { currentAuthorityHeadSha256: evidence.standingAuthorityHeadSha256 },
    runtimeObservation: {
      semanticFingerprint: evidence.runtimeObservationFingerprint,
      trustSnapshot: { semanticFingerprint: evidence.runtimeTrustSnapshotFingerprint },
      resourceSnapshot: { semanticFingerprint: evidence.resourceSnapshotFingerprint }
    }
  };
  const loaded = { policy: { policyRef: evidence.standingPolicyRef, policySha256: evidence.standingPolicySha256 }, head: { policyHeadSha256: evidence.standingPolicyHeadSha256, generation: evidence.policyGeneration } };
  const expectedAuthority = deriveScheduledDreamAuthorityRef({ loaded, schedulerGeneration: evidence.schedulerGeneration, currentAdmission: pseudoCurrent, supervisorRef: evidence.supervisorRef, instanceRef: evidence.supervisorInstanceRef, supervisorLeaseSha256: evidence.supervisorLeaseSha256, calendarDateRef: evidence.calendarDateRef, sourceFrontier: evidence.sourceFrontier });
  if (expectedAuthority !== evidence.scheduledDreamAuthorityRef) fail('G05A_ADMISSION_EVIDENCE_INVALID', 'scheduled Dream authority does not recompute');
  return evidence;
}
function persistAdmission(identity, threadRef, evidence) {
  const paths = pathsFor(identity, threadRef);
  const file = path.join(paths.admissions, `${evidence.admissionEvidenceSha256}.json`);
  const state = writeExclusive(file, evidence);
  if (state === 'EXISTS' && semanticHash(validateHistoricalAdmissionEvidence(readJson(file, 'G05A_ADMISSION_EVIDENCE_INVALID', 'admission evidence'))) !== semanticHash(evidence)) fail('G05A_ADMISSION_EVIDENCE_INVALID', 'same admission address contains different content');
  return file;
}
function readAdmissions(identity, threadRef) {
  const paths = pathsFor(identity, threadRef);
  if (!fs.existsSync(paths.admissions)) return [];
  const items = [];
  for (const name of fs.readdirSync(paths.admissions).sort()) {
    if (!/^[0-9a-f]{64}\.json$/u.test(name)) continue;
    const file = path.join(paths.admissions, name);
    ensureRegularCanonicalFile(identity.homeRoot, file, 'G05A_ADMISSION_EVIDENCE_INVALID', 'historical admission evidence');
    items.push(validateHistoricalAdmissionEvidence(readJson(file, 'G05A_ADMISSION_EVIDENCE_INVALID', 'historical admission evidence')));
  }
  return items;
}
function findRecoveryAdmission({ identity, threadRef, loaded, schedulerGeneration, calendarDateRef, orientationAuthorityRef, recoveredLeaseSha256 }) {
  const matches = readAdmissions(identity, threadRef).filter((item) => item.standingPolicyHeadSha256 === loaded.head.policyHeadSha256 && item.policyGeneration === loaded.head.generation && item.schedulerGeneration === schedulerGeneration && item.calendarDateRef === calendarDateRef && item.scheduledDreamAuthorityRef === orientationAuthorityRef && item.supervisorLeaseSha256 === recoveredLeaseSha256);
  if (matches.length !== 1) fail('G05A_RECOVERY_POLICY_DRIFT', 'same-day G03 wake lacks one exact persisted scheduled admission tied to the recovered abandoned supervisor lease', { matches: matches.length });
  return matches[0];
}

function validateHeldFalse(value, code = 'G05A_RECEIPT_CORRUPT') { for (const field of HELD_EFFECT_FIELDS) if (value[field] !== false) fail(code, `${field} must remain false`); }
function validateDailyReceipt(receipt, identity, threadRef) {
  closedKeys(receipt, [
    'schemaVersion','mode','homeRef','deviceRef','companionLineageRef','threadRef','calendarDateRef','timeZoneRef','observedAt',
    'standingPolicyRef','standingPolicySha256','standingPolicyHeadSha256','policyGeneration','standingScopeFingerprint','schedulerGeneration',
    'scheduledDreamAuthorityRef','supervisorRef','supervisorInstanceRef','supervisorLeaseSha256','recoveredAbandonedSupervisor',
    'supervisorAdmissionEvidenceRef','supervisorAdmissionEvidenceSha256','g05sProvenanceRef','g05sProvenanceSha256','standingAuthorityHeadSha256',
    'standingAuthorityGeneration','runtimeObservationFingerprint','runtimeTrustSnapshotFingerprint','resourceSnapshotFingerprint','runtimeSourceRef',
    'runtimeSourceHash','resourceAdmissionState','resourceAdmissionFingerprint','sourceConversationHeadSha256','sourceScoreHeadSha256',
    'sourceSemanticAuthorityHeadSha256','g03DayRef','g03DayIndex','g03OrientationSha256','g03OrientationOpenLoopRefs','g03DreamHeadSha256',
    'g03DailyStratumSha256','g03WakeReceiptSha256','wakeCommitted','resumedAfterWake','optionalLearningPolicy','optionalLearningDisposition',
    'optionalLearningFailureCode','optionalLearningEvidenceRef','optionalLearningEvidenceSha256','interactiveYielded','resourceYielded','duplicateSuppressed',
    ...HELD_EFFECT_FIELDS,'nextSafeRoute','formedAt','dailyAutonomyReceiptRef','dailyAutonomyReceiptSha256'
  ], 'G05A_RECEIPT_CORRUPT', 'G05A daily receipt');
  validateAddressed(receipt, 'g05a-daily-receipt', 'dailyAutonomyReceiptRef', 'dailyAutonomyReceiptSha256', DAILY_RECEIPT_SCHEMA, 'G05A_RECEIPT_CORRUPT');
  if (receipt.mode !== SCHEDULED_DAILY_AUTONOMY_MODE || receipt.homeRef !== identity.homeRef || receipt.deviceRef !== identity.deviceRef || receipt.companionLineageRef !== identity.companionLineageRef || receipt.threadRef !== threadRef ||
      !CALENDAR_DATE.test(receipt.calendarDateRef ?? '') || !Number.isSafeInteger(receipt.policyGeneration) || receipt.policyGeneration < 0 || !Number.isSafeInteger(receipt.schedulerGeneration) || receipt.schedulerGeneration < 0 ||
      receipt.resourceAdmissionState !== 'ADMITTED' || receipt.wakeCommitted !== true || receipt.interactiveYielded !== false || receipt.resourceYielded !== false || receipt.duplicateSuppressed !== false || receipt.nextSafeRoute !== NEXT_SAFE_ROUTE) fail('G05A_RECEIPT_CORRUPT', 'G05A daily receipt semantic contract is invalid');
  for (const field of ['standingPolicySha256','standingPolicyHeadSha256','standingScopeFingerprint','supervisorLeaseSha256','supervisorAdmissionEvidenceSha256','g05sProvenanceSha256','standingAuthorityHeadSha256','runtimeObservationFingerprint','runtimeTrustSnapshotFingerprint','resourceSnapshotFingerprint','resourceAdmissionFingerprint','sourceConversationHeadSha256','sourceScoreHeadSha256','sourceSemanticAuthorityHeadSha256','g03OrientationSha256','g03DreamHeadSha256','g03DailyStratumSha256','g03WakeReceiptSha256']) assertSha(receipt[field], `receipt.${field}`);
  safeRef(receipt.scheduledDreamAuthorityRef, 'receipt.scheduledDreamAuthorityRef', 'G05A_RECEIPT_CORRUPT');
  safeRef(receipt.g03DayRef, 'receipt.g03DayRef', 'G05A_RECEIPT_CORRUPT');
  if (!Number.isSafeInteger(receipt.g03DayIndex) || receipt.g03DayIndex < 0 || !Array.isArray(receipt.g03OrientationOpenLoopRefs) || receipt.g03OrientationOpenLoopRefs.some((item) => typeof item !== 'string')) fail('G05A_RECEIPT_CORRUPT', 'G03 day/orientation metadata is invalid');
  if (!OPTIONAL_LEARNING_POLICIES.includes(receipt.optionalLearningPolicy) || !OPTIONAL_LEARNING_DISPOSITIONS.includes(receipt.optionalLearningDisposition)) fail('G05A_RECEIPT_CORRUPT', 'optional learning disposition is invalid');
  validateHeldFalse(receipt);
  return receipt;
}
function validateAutonomyHead(head, identity, threadRef) {
  closedKeys(head, ['schemaVersion','homeRef','deviceRef','companionLineageRef','threadRef','sequence','calendarDateRef','dailyAutonomyReceiptRef','dailyAutonomyReceiptSha256','g03DreamHeadSha256','g03WakeReceiptSha256','priorAutonomyHeadSha256','formedAt','autonomyHeadSha256'], 'G05A_RECEIPT_CORRUPT', 'G05A autonomy head');
  const { autonomyHeadSha256, ...core } = head;
  if (head.schemaVersion !== DAILY_HEAD_SCHEMA || semanticHash(core) !== autonomyHeadSha256 || head.homeRef !== identity.homeRef || head.deviceRef !== identity.deviceRef || head.companionLineageRef !== identity.companionLineageRef || head.threadRef !== threadRef || !Number.isSafeInteger(head.sequence) || head.sequence < 0 || (head.sequence === 0 ? head.priorAutonomyHeadSha256 !== null : !SHA256.test(head.priorAutonomyHeadSha256 ?? ''))) fail('G05A_RECEIPT_CORRUPT', 'G05A autonomy head identity/lineage is invalid');
  return head;
}
function recomputeG03OrientationSha(receipt) {
  const core = {
    homeRef: receipt.homeRef, deviceRef: receipt.deviceRef, companionLineageRef: receipt.companionLineageRef, threadRef: receipt.threadRef,
    dayRef: receipt.g03DayRef, dayIndex: receipt.g03DayIndex, calendarDateRef: receipt.calendarDateRef, timeZoneRef: receipt.timeZoneRef,
    observedAt: receipt.observedAt, contractRef: DAILY_MEMORY_DREAM_CONTRACT, privacyClass: 'DEVICE_PRIVATE', sourceSemanticAuthorityHeadSha256: receipt.sourceSemanticAuthorityHeadSha256,
    invocationMode: 'MANUAL_ONE_SHOT', restInvocationAuthorityRef: receipt.scheduledDreamAuthorityRef, selectedMode: 'MEMORY_ONLY_CONSOLIDATION',
    exactG01ConversationHeadSha256: receipt.sourceConversationHeadSha256, exactG02ScoreHeadSha256: receipt.sourceScoreHeadSha256,
    allowedChangeClasses: ['DAILY_MEMORY_FRONTIER','DAILY_STRATUM','WAKE_RECEIPT'],
    heldChangeClasses: ['MODEL_WEIGHTS','RHYTHM','TRAINING','SYNC','PUBLICATION','POWER_CONTROL','FIRST_PERSON_AUTHORITY'],
    openLoopRefs: [...receipt.g03OrientationOpenLoopRefs], noticeState: 'FORMED', formedAt: receipt.observedAt
  };
  const preRef = { schemaVersion: 'vextreme.daily-pre-rest-orientation/v1', ...core };
  const ref = `pre-rest-orientation.${semanticHash(preRef).slice(0, 32)}`;
  return semanticHash({ ...preRef, preRestOrientationRef: ref });
}
function validateReceiptAgainstSources(receipt, identity, threadRef) {
  const paths = pathsFor(identity, threadRef);
  const policyHead = validatePolicyHead(readJson(path.join(paths.policyHeads, `${receipt.standingPolicyHeadSha256}.json`)), identity, threadRef);
  const policy = validateStandingRestPolicy(readJson(path.join(paths.policies, `${receipt.standingPolicySha256}.json`)));
  if (policyHead.policySha256 !== receipt.standingPolicySha256 || policyHead.generation !== receipt.policyGeneration || policy.policySha256 !== receipt.standingPolicySha256 || buildScheduledStandingScopeForPolicy(policy).standingScopeFingerprint !== receipt.standingScopeFingerprint) fail('G05A_RECEIPT_CORRUPT', 'receipt policy/scope lineage differs');
  const admission = validateHistoricalAdmissionEvidence(readJson(path.join(paths.admissions, `${receipt.supervisorAdmissionEvidenceSha256}.json`), 'G05A_RECEIPT_CORRUPT', 'historical admission'));
  if (admission.admissionEvidenceRef !== receipt.supervisorAdmissionEvidenceRef || admission.scheduledDreamAuthorityRef !== receipt.scheduledDreamAuthorityRef || admission.supervisorLeaseSha256 !== receipt.supervisorLeaseSha256 || admission.g05sProvenanceSha256 !== receipt.g05sProvenanceSha256 || admission.schedulerGeneration !== receipt.schedulerGeneration) fail('G05A_RECEIPT_CORRUPT', 'receipt differs from scheduled admission');
  const descent = sourceDescentForDailyStratum({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef }, receipt.g03DailyStratumSha256);
  if (descent.orientationSha256 !== receipt.g03OrientationSha256 || recomputeG03OrientationSha(receipt) !== receipt.g03OrientationSha256 || descent.sourceConversationHeadSha256 !== receipt.sourceConversationHeadSha256 || descent.sourceScoreHeadSha256 !== receipt.sourceScoreHeadSha256 || descent.sourceSemanticAuthorityHeadSha256 !== receipt.sourceSemanticAuthorityHeadSha256 || descent.wakeReceiptSha256 !== receipt.g03WakeReceiptSha256) fail('G05A_RECEIPT_CORRUPT', 'receipt differs from exact committed G03 scheduled attribution/source descent');
  const daily = loadDailyMemoryDreamState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
  const dreamHead = daily.headChain.find((item) => item.dailyDreamHeadSha256 === receipt.g03DreamHeadSha256);
  if (!dreamHead || dreamHead.dailyStratumSha256 !== receipt.g03DailyStratumSha256 || dreamHead.wakeReceiptSha256 !== receipt.g03WakeReceiptSha256) fail('G05A_RECEIPT_CORRUPT', 'receipt G03 generation is not committed');
  if (admission.sourceFrontier.dreamHeadSha256 !== (dreamHead.priorDailyDreamHeadSha256 ?? null)) fail('G05A_RECEIPT_CORRUPT', 'admission did not bind exact pre-effect Dream head');
  if (dreamHead.priorDailyDreamHeadSha256 === null) {
    if (admission.sourceFrontier.dailyStratumSha256 !== null || admission.sourceFrontier.wakeReceiptSha256 !== null) fail('G05A_RECEIPT_CORRUPT', 'genesis admission claims prior G03 material');
  } else {
    const prior = daily.headChain.find((item) => item.dailyDreamHeadSha256 === dreamHead.priorDailyDreamHeadSha256);
    if (!prior || admission.sourceFrontier.dailyStratumSha256 !== prior.dailyStratumSha256 || admission.sourceFrontier.wakeReceiptSha256 !== prior.wakeReceiptSha256) fail('G05A_RECEIPT_CORRUPT', 'admission prior G03 frontier differs');
  }
  return { policyHead, policy, admission, descent, dreamHead };
}
function loadCurrentReceipt(identity, threadRef) {
  const paths = pathsFor(identity, threadRef);
  if (!fs.existsSync(paths.head)) return null;
  const current = validateAutonomyHead(readJson(paths.head), identity, threadRef);
  const chain = [];
  let cursor = current;
  const seen = new Set();
  while (cursor) {
    if (seen.has(cursor.autonomyHeadSha256)) fail('G05A_RECEIPT_CORRUPT', 'G05A head lineage contains a cycle');
    seen.add(cursor.autonomyHeadSha256); chain.push(cursor);
    if (cursor.sequence === 0) break;
    cursor = validateAutonomyHead(readJson(path.join(paths.heads, `${cursor.priorAutonomyHeadSha256}.json`)), identity, threadRef);
    if (cursor.sequence !== chain.at(-1).sequence - 1) fail('G05A_RECEIPT_CORRUPT', 'G05A head sequence is not contiguous');
  }
  chain.reverse();
  const receipts = chain.map((head, index) => {
    if (head.sequence !== index || head.priorAutonomyHeadSha256 !== (index ? chain[index - 1].autonomyHeadSha256 : null)) fail('G05A_RECEIPT_CORRUPT', 'G05A ancestry is not canonical');
    const receipt = validateDailyReceipt(readJson(path.join(paths.receipts, `${head.dailyAutonomyReceiptSha256}.json`)), identity, threadRef);
    if (receipt.dailyAutonomyReceiptRef !== head.dailyAutonomyReceiptRef) fail('G05A_RECEIPT_CORRUPT', 'G05A head differs from receipt');
    validateReceiptAgainstSources(receipt, identity, threadRef);
    return receipt;
  });
  return { head: current, receipt: receipts.at(-1), headChain: chain, receipts };
}
function writeDailyReceipt(identity, threadRef, receipt) {
  const paths = pathsFor(identity, threadRef);
  validateDailyReceipt(receipt, identity, threadRef); validateReceiptAgainstSources(receipt, identity, threadRef);
  const prior = loadCurrentReceipt(identity, threadRef)?.head ?? null;
  const file = path.join(paths.receipts, `${receipt.dailyAutonomyReceiptSha256}.json`);
  if (writeExclusive(file, receipt) === 'EXISTS' && semanticHash(readJson(file)) !== semanticHash(receipt)) fail('G05A_RECEIPT_CORRUPT', 'same G05A receipt address contains different content');
  const sequence = prior ? prior.sequence + 1 : 0;
  const core = { schemaVersion: DAILY_HEAD_SCHEMA, homeRef: receipt.homeRef, deviceRef: receipt.deviceRef, companionLineageRef: receipt.companionLineageRef, threadRef: receipt.threadRef, sequence, calendarDateRef: receipt.calendarDateRef, dailyAutonomyReceiptRef: receipt.dailyAutonomyReceiptRef, dailyAutonomyReceiptSha256: receipt.dailyAutonomyReceiptSha256, g03DreamHeadSha256: receipt.g03DreamHeadSha256, g03WakeReceiptSha256: receipt.g03WakeReceiptSha256, priorAutonomyHeadSha256: prior?.autonomyHeadSha256 ?? null, formedAt: receipt.formedAt };
  const head = { ...core, autonomyHeadSha256: semanticHash(core) };
  writeExclusive(path.join(paths.heads, `${head.autonomyHeadSha256}.json`), head); atomicWrite(paths.head, head);
  return head;
}
function g03BundleForDate(daily, date) { return daily.currentDailyStratum?.stratum?.calendarDateRef === date && daily.currentDailyStratum?.wake ? daily.currentDailyStratum : null; }
function verifyWakeBundle(bundle, daily) {
  if (!bundle?.orientation?.orientationSha256 || !bundle?.stratum?.dailyStratumSha256 || !bundle?.wake?.wakeReceiptSha256 || !daily?.head?.dailyDreamHeadSha256) fail('G05A_WAKE_NOT_COMMITTED', 'G05A requires exact committed G03 orientation/stratum/wake');
  if (daily.head.dailyStratumSha256 !== bundle.stratum.dailyStratumSha256 || daily.head.wakeReceiptSha256 !== bundle.wake.wakeReceiptSha256) fail('G05A_WAKE_NOT_COMMITTED', 'G03 current head differs from bundle');
}
function exactG04HeldEffects(output) {
  const held = output?.heldEffects;
  return Boolean(held && held.modelWeightsChanged === false && held.adapterChanged === false && held.runtimeActivation === false && held.rhythmPromotionPerformed === false && held.scoreMutationPerformed === false && held.g03MutationPerformed === false && held.realTrainingPerformed === false && held.crossDeviceSync === false && held.publicationPerformed === false);
}
async function runOptionalLearning({ policy, plan, wakeSummary, identity, threadRef, recoveryMode }) {
  if (policy.optionalLearningPolicy === 'ABSENT') return { disposition: 'ABSENT', failureCode: null, evidenceRef: null, evidenceSha256: null };
  if (recoveryMode || policy.optionalLearningPolicy === 'DEFERRED' || !plan) return { disposition: 'DEFERRED', failureCode: null, evidenceRef: null, evidenceSha256: null };
  try {
    const output = evaluateStageASimulatedRhythm({ ...structuredClone(plan), home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef,
      expectedConversationHeadSha256: wakeSummary.sourceConversationHeadSha256, expectedScoreHeadSha256: wakeSummary.sourceScoreHeadSha256,
      expectedSemanticOwnerHeadSha256: wakeSummary.sourceSemanticAuthorityHeadSha256, expectedDreamHeadSha256: wakeSummary.g03DreamHeadSha256,
      expectedDailyStratumSha256: wakeSummary.g03DailyStratumSha256, expectedWakeReceiptSha256: wakeSummary.g03WakeReceiptSha256 });
    const receipt = output?.disposition;
    if (!receipt?.dispositionRef || !SHA256.test(receipt.dispositionSha256 ?? '') || !exactG04HeldEffects(output)) return { disposition: 'FAILED', failureCode: 'OPTIONAL_LEARNING_EVIDENCE_INVALID', evidenceRef: null, evidenceSha256: null };
    if (output.state === 'REJECTED') return { disposition: 'REJECTED', failureCode: null, evidenceRef: receipt.dispositionRef, evidenceSha256: receipt.dispositionSha256 };
    if (output.state === 'DEFERRED') return { disposition: 'DEFERRED', failureCode: null, evidenceRef: receipt.dispositionRef, evidenceSha256: receipt.dispositionSha256 };
    if (['ACCEPTED_INACTIVE_SIMULATION_ONLY','NARROWED_INACTIVE_SIMULATION_ONLY'].includes(output.state)) return { disposition: 'ACCEPTED_INACTIVE', failureCode: null, evidenceRef: receipt.dispositionRef, evidenceSha256: receipt.dispositionSha256 };
    return { disposition: 'FAILED', failureCode: 'OPTIONAL_LEARNING_HELD_EFFECT_OR_STATE_INVALID', evidenceRef: receipt.dispositionRef, evidenceSha256: receipt.dispositionSha256 };
  } catch (error) { return { disposition: 'FAILED', failureCode: error?.code ?? 'OPTIONAL_LEARNING_EXCEPTION', evidenceRef: null, evidenceSha256: null }; }
}

function rejectCallerAuthority(input) {
  const present = CALLER_AUTHORITY_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(input, field));
  if (present.length) fail('G05A_ADMISSION_EVIDENCE_INVALID', 'caller-authored live authority inputs are not admitted', { present });
}
function standingHeadExists(home, lineage, thread) {
  return fs.existsSync(homePath(home, 'semantic-authority', 'daily-dream-standing-rest', lineage, thread, 'head.json'));
}

export async function runScheduledDailyAutonomyTick(input) {
  rejectCallerAuthority(input);
  const supervisorRef = safeRef(input.supervisorRef, 'supervisorRef', 'G05A_SUPERVISOR_CONFLICT');
  const instanceRef = safeRef(input.instanceRef, 'instanceRef', 'G05A_SUPERVISOR_CONFLICT');
  const modelWorkerRef = safeRef(input.modelWorkerRef, 'modelWorkerRef', 'G05A_SUPERVISOR_CONFLICT');
  const dreamWriterInstanceRef = safeRef(input.dreamWriterInstanceRef, 'dreamWriterInstanceRef', 'G05A_SUPERVISOR_CONFLICT');
  if (modelWorkerRef === supervisorRef || dreamWriterInstanceRef === instanceRef) fail('G05A_SUPERVISOR_CONFLICT', 'supervisor/model/G03 writer identities must remain distinct');
  if (typeof input.optionalLearningCallback === 'function') fail('G05A_HELD_EFFECT_VIOLATION', 'arbitrary optional-learning callbacks are not admitted');
  const initialPolicy = loadStandingRestPolicy(input);
  if (input.expectedPolicyHeadSha256 && input.expectedPolicyHeadSha256 !== initialPolicy.head.policyHeadSha256) fail('G05A_POLICY_NOT_CURRENT', 'expected standing policy head is stale');
  const { identity, threadRef } = loadIdentity(input);
  const paths = pathsFor(identity, threadRef);
  const lease = acquireSupervisorWithRecovery(paths, identity, threadRef, supervisorRef, instanceRef);
  try {
    const loaded = loadStandingRestPolicy(input); assertSamePolicyGeneration(initialPolicy, loaded);
    const current = loadCurrentReceipt(identity, threadRef);
    const schedulerGeneration = schedulerGenerationFor(current);
    const preliminaryRuntime = await observeWindowsG05Runtime({ schedulerGeneration });
    const preliminaryEligibility = isRestWindowEligible(loaded.policy, preliminaryRuntime.observedAt);
    if (!preliminaryEligibility.eligible) return Object.freeze({ state: 'OUTSIDE_REST_WINDOW', calendarDateRef: preliminaryEligibility.calendarDateRef, noEffect: true, wakeCommitted: false, schedulerGeneration });
    if (current?.receipt?.calendarDateRef === preliminaryEligibility.calendarDateRef) return Object.freeze({ state: 'DUPLICATE_SUPPRESSED', calendarDateRef: preliminaryEligibility.calendarDateRef, noEffect: true, wakeCommitted: true, duplicateSuppressed: true, schedulerGeneration, receipt: current.receipt, head: current.head });

    const initialFrontier = validateFrontier(observeScheduledSourceFrontier(input));
    const dailyBefore = loadDailyMemoryDreamState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
    let bundle = g03BundleForDate(dailyBefore, preliminaryEligibility.calendarDateRef);
    let admission;
    let observedAt;
    let eligibility;
    let resumedAfterWake = false;

    if (bundle) {
      if (!lease.recovered?.recovered || !lease.recovered.leaseSha256) fail('G05A_RECOVERY_POLICY_DRIFT', 'pre-existing same-day G03 wake is not attributable to an abandoned G05A supervisor');
      admission = findRecoveryAdmission({ identity, threadRef, loaded, schedulerGeneration, calendarDateRef: preliminaryEligibility.calendarDateRef, orientationAuthorityRef: bundle.orientation.restInvocationAuthorityRef, recoveredLeaseSha256: lease.recovered.leaseSha256 });
      observedAt = admission.observedAt;
      eligibility = isRestWindowEligible(loaded.policy, observedAt);
      if (!eligibility.eligible) fail('G05A_RECOVERY_POLICY_DRIFT', 'historical scheduled admission falls outside configured rest window');
      verifyWakeBundle(bundle, dailyBefore);
      resumedAfterWake = true;
    } else {
      if (!standingHeadExists(identity.homeRoot, identity.companionLineageRef, threadRef)) return Object.freeze({ state: 'HELD_STANDING_AUTHORITY', calendarDateRef: preliminaryEligibility.calendarDateRef, noEffect: true, wakeCommitted: false, schedulerGeneration, livePositiveStandingConsent: false });
      let currentAdmission;
      try {
        currentAdmission = await resolveCurrentG05ScheduledAdmission({ home: identity.homeRoot, humanSubjectRef: loaded.policy.humanSubjectRef, companionLineageRef: identity.companionLineageRef, threadRef, policyBinding: policyBinding(loaded), schedulerGeneration, sourceFrontier: initialFrontier });
      } catch (error) {
        if (['G05S_STANDING_AUTHORITY_NOT_CURRENT','G05S_STANDING_AUTHORITY_NOT_PERMITTED','G05S_STANDING_AUTHORITY_STALE'].includes(error?.code)) return Object.freeze({ state: 'HELD_STANDING_AUTHORITY', calendarDateRef: preliminaryEligibility.calendarDateRef, noEffect: true, wakeCommitted: false, schedulerGeneration, livePositiveStandingConsent: false });
        fail('G05A_ADMISSION_EVIDENCE_INVALID', 'G05S current admission source descent failed', { sourceCode: error?.code ?? 'UNKNOWN', message: error?.message ?? String(error) });
      }
      const currentPolicy = loadStandingRestPolicy(input); assertSamePolicyGeneration(loaded, currentPolicy);
      observedAt = currentAdmission.runtimeObservation.observedAt;
      eligibility = isRestWindowEligible(loaded.policy, observedAt);
      if (!eligibility.eligible) return Object.freeze({ state: 'OUTSIDE_REST_WINDOW', calendarDateRef: eligibility.calendarDateRef, noEffect: true, wakeCommitted: false, schedulerGeneration });
      if (currentAdmission.state !== 'CURRENT_ADMISSION_EVIDENCE_FORMED') return Object.freeze({ state: 'HELD_RUNTIME_RESOURCE_OR_INTERACTIVE_STATE', calendarDateRef: eligibility.calendarDateRef, noEffect: true, wakeCommitted: false, schedulerGeneration, resourceAdmissionState: currentAdmission.provenance.resourceAdmissionState, livePositiveStandingConsent: true, actualAutomaticDreamInvocationPerformed: false, nativeSupervisorInstalled: false });
      const finalFrontier = validateFrontier(observeScheduledSourceFrontier(input)); assertSameFrontier(finalFrontier, initialFrontier);
      admission = formCurrentAdmissionEvidence({ identity, threadRef, loaded: currentPolicy, schedulerGeneration, currentAdmission, supervisorRef, instanceRef, supervisorLeaseSha256: lease.leaseSha256, calendarDateRef: eligibility.calendarDateRef, sourceFrontier: finalFrontier });
      persistAdmission(identity, threadRef, admission);
      if (input.faults?.pauseAfterAdmissionPersistMs) {
        const ms = Number(input.faults.pauseAfterAdmissionPersistMs); if (Number.isSafeInteger(ms) && ms > 0 && ms <= 5000) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
      }
      const beforeEffectPolicy = loadStandingRestPolicy(input); assertSamePolicyGeneration(loaded, beforeEffectPolicy);
      const beforeEffectFrontier = validateFrontier(observeScheduledSourceFrontier(input)); assertSameFrontier(beforeEffectFrontier, admission.sourceFrontier);
      const refreshedScore = loadScoreContextState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
      const refreshedDaily = loadDailyMemoryDreamState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
      const dayIndex = Number.isSafeInteger(refreshedDaily.head?.dayIndex) ? refreshedDaily.head.dayIndex + 1 : 0;
      try {
        commitDailyMemoryDream({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef,
          instanceRef: dreamWriterInstanceRef, restInvocationAuthorityRef: admission.scheduledDreamAuthorityRef,
          dayRef: `day.g05a.${eligibility.calendarDateRef.replaceAll('-', '')}`, dayIndex, calendarDateRef: eligibility.calendarDateRef,
          timeZoneRef: loaded.policy.timeZoneRef, observedAt, expectedConversationHeadSha256: refreshedScore.head.sourceConversationHeadSha256,
          expectedScoreHeadSha256: refreshedScore.head.scoreHeadSha256, expectedDailyDreamHeadSha256: refreshedDaily.head?.dailyDreamHeadSha256 ?? null });
      } catch (error) { fail('G05A_DREAM_FAILED', 'automatic G03 admission failed closed', { sourceCode: error?.code ?? 'UNKNOWN', message: error?.message ?? String(error) }); }
      const dailyAfter = loadDailyMemoryDreamState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
      bundle = g03BundleForDate(dailyAfter, eligibility.calendarDateRef); verifyWakeBundle(bundle, dailyAfter);
      if (bundle.orientation.restInvocationAuthorityRef !== admission.scheduledDreamAuthorityRef) fail('G05A_RECOVERY_POLICY_DRIFT', 'committed G03 orientation does not bind exact scheduled authority');
    }

    if (input.faults?.terminateProcessAfterWakeBeforeReceipt === true) process.exit(86);
    if (input.faults?.failAfterWakeBeforeReceipt === true) fail('G05A_AFTER_WAKE_FAULT', 'simulated exception after committed G03 wake and before G05A receipt');
    const daily = loadDailyMemoryDreamState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
    verifyWakeBundle(bundle, daily);
    const wakeSummary = {
      sourceConversationHeadSha256: bundle.stratum.sourceConversationHeadSha256,
      sourceScoreHeadSha256: bundle.stratum.sourceScoreHeadSha256,
      sourceSemanticAuthorityHeadSha256: bundle.stratum.sourceSemanticAuthorityHeadSha256,
      g03DreamHeadSha256: daily.head.dailyDreamHeadSha256,
      g03DailyStratumSha256: bundle.stratum.dailyStratumSha256,
      g03WakeReceiptSha256: bundle.wake.wakeReceiptSha256
    };
    const optional = await runOptionalLearning({ policy: loaded.policy, plan: input.optionalLearningPlan ?? null, wakeSummary, identity, threadRef, recoveryMode: resumedAfterWake });
    const finalPolicy = loadStandingRestPolicy(input); assertSamePolicyGeneration(loaded, finalPolicy);
    const standing = buildScheduledStandingScopeForPolicy(loaded.policy);
    const receiptCore = {
      schemaVersion: DAILY_RECEIPT_SCHEMA, mode: SCHEDULED_DAILY_AUTONOMY_MODE,
      homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef,
      calendarDateRef: eligibility.calendarDateRef, timeZoneRef: loaded.policy.timeZoneRef, observedAt,
      standingPolicyRef: loaded.policy.policyRef, standingPolicySha256: loaded.policy.policySha256, standingPolicyHeadSha256: loaded.head.policyHeadSha256,
      policyGeneration: loaded.head.generation, standingScopeFingerprint: standing.standingScopeFingerprint,
      schedulerGeneration, scheduledDreamAuthorityRef: admission.scheduledDreamAuthorityRef,
      supervisorRef, supervisorInstanceRef: instanceRef, supervisorLeaseSha256: resumedAfterWake ? admission.supervisorLeaseSha256 : lease.leaseSha256,
      recoveredAbandonedSupervisor: lease.recovered?.recovered === true,
      supervisorAdmissionEvidenceRef: admission.admissionEvidenceRef, supervisorAdmissionEvidenceSha256: admission.admissionEvidenceSha256,
      g05sProvenanceRef: admission.g05sProvenanceRef, g05sProvenanceSha256: admission.g05sProvenanceSha256,
      standingAuthorityHeadSha256: admission.standingAuthorityHeadSha256, standingAuthorityGeneration: admission.standingAuthorityGeneration,
      runtimeObservationFingerprint: admission.runtimeObservationFingerprint, runtimeTrustSnapshotFingerprint: admission.runtimeTrustSnapshotFingerprint,
      resourceSnapshotFingerprint: admission.resourceSnapshotFingerprint, runtimeSourceRef: admission.runtimeSourceRef, runtimeSourceHash: admission.runtimeSourceHash,
      resourceAdmissionState: admission.resourceAdmissionState, resourceAdmissionFingerprint: admission.resourceAdmissionFingerprint,
      sourceConversationHeadSha256: bundle.stratum.sourceConversationHeadSha256, sourceScoreHeadSha256: bundle.stratum.sourceScoreHeadSha256,
      sourceSemanticAuthorityHeadSha256: bundle.stratum.sourceSemanticAuthorityHeadSha256,
      g03DayRef: bundle.stratum.dayRef, g03DayIndex: bundle.stratum.dayIndex, g03OrientationSha256: bundle.orientation.orientationSha256,
      g03OrientationOpenLoopRefs: [...bundle.orientation.openLoopRefs], g03DreamHeadSha256: daily.head.dailyDreamHeadSha256,
      g03DailyStratumSha256: bundle.stratum.dailyStratumSha256, g03WakeReceiptSha256: bundle.wake.wakeReceiptSha256,
      wakeCommitted: true, resumedAfterWake,
      optionalLearningPolicy: loaded.policy.optionalLearningPolicy, optionalLearningDisposition: optional.disposition,
      optionalLearningFailureCode: optional.failureCode, optionalLearningEvidenceRef: optional.evidenceRef, optionalLearningEvidenceSha256: optional.evidenceSha256,
      interactiveYielded: false, resourceYielded: false, duplicateSuppressed: false,
      synchronizationPerformed: false, trainingPerformed: false, modelWeightsChanged: false, adapterChanged: false, rhythmActivationPerformed: false,
      powerControlPerformed: false, nativeWindowsServiceInstalled: false, publicationPerformed: false,
      nextSafeRoute: NEXT_SAFE_ROUTE, formedAt: observedAt
    };
    const receipt = addressed('g05a-daily-receipt', 'dailyAutonomyReceiptRef', 'dailyAutonomyReceiptSha256', receiptCore);
    const head = writeDailyReceipt(identity, threadRef, receipt);
    return Object.freeze({ state: 'COMPLETED', calendarDateRef: eligibility.calendarDateRef, wakeCommitted: true, resumedAfterWake, receipt, head, schedulerGeneration });
  } finally {
    if (!releaseSupervisor(lease)) fail('G05A_SUPERVISOR_CONFLICT', 'supervisor writer lease could not be released safely');
  }
}

export function loadScheduledDailyAutonomyState(input) {
  const { identity, threadRef } = loadIdentity(input);
  const policy = loadStandingRestPolicy(input);
  const current = loadCurrentReceipt(identity, threadRef);
  return Object.freeze({ schemaVersion: SCHEDULED_DAILY_AUTONOMY_SCHEMA, identity: structuredClone(identity), threadRef, policy: policy.policy, policyHead: policy.head, head: current?.head ?? null, headChain: current?.headChain ?? [], currentReceipt: current?.receipt ?? null, state: current ? 'CURRENT' : 'POLICY_CONFIGURED_AUTHORITY_HELD' });
}
export function projectScheduledDailyAutonomy(input) {
  const state = loadScheduledDailyAutonomyState(input);
  const receipt = state.currentReceipt;
  return Object.freeze({
    schemaVersion: 'vexlife.g05a.scheduled-daily-autonomy-projection/v3', state: state.state,
    calendarDateRef: receipt?.calendarDateRef ?? null, timeZoneRef: state.policy.timeZoneRef,
    standingPolicyRef: state.policy.policyRef, standingPolicyHeadSha256: receipt?.standingPolicyHeadSha256 ?? state.policyHead.policyHeadSha256,
    policyGeneration: receipt?.policyGeneration ?? state.policyHead.generation, standingScopeFingerprint: buildScheduledStandingScopeForPolicy(state.policy).standingScopeFingerprint,
    schedulerGeneration: receipt?.schedulerGeneration ?? (state.head ? state.head.sequence + 1 : 0), scheduledDreamAuthorityRef: receipt?.scheduledDreamAuthorityRef ?? null,
    supervisorAdmissionEvidenceRef: receipt?.supervisorAdmissionEvidenceRef ?? null, g05sProvenanceRef: receipt?.g05sProvenanceRef ?? null,
    resourceAdmissionState: receipt?.resourceAdmissionState ?? 'HELD', g03DreamHeadSha256: receipt?.g03DreamHeadSha256 ?? null,
    g03DailyStratumSha256: receipt?.g03DailyStratumSha256 ?? null, g03WakeReceiptSha256: receipt?.g03WakeReceiptSha256 ?? null,
    wakeCommitted: receipt?.wakeCommitted ?? false, optionalLearningDisposition: receipt?.optionalLearningDisposition ?? null,
    synchronizationPerformed: receipt?.synchronizationPerformed ?? false, trainingPerformed: receipt?.trainingPerformed ?? false,
    modelWeightsChanged: receipt?.modelWeightsChanged ?? false, adapterChanged: receipt?.adapterChanged ?? false,
    rhythmActivationPerformed: receipt?.rhythmActivationPerformed ?? false, powerControlPerformed: receipt?.powerControlPerformed ?? false,
    nativeWindowsServiceInstalled: receipt?.nativeWindowsServiceInstalled ?? false, publicationPerformed: receipt?.publicationPerformed ?? false,
    livePositiveStandingConsentMaterializedByG05A: false, nextSafeRoute: receipt?.nextSafeRoute ?? 'WAIT_FOR_SOURCE_OWNED_G05S_ADMISSION'
  });
}
export function sourceDescentScheduledDailyAutonomy(input, receiptSha256 = null) {
  const { identity, threadRef } = loadIdentity(input);
  const current = loadCurrentReceipt(identity, threadRef);
  const sha = receiptSha256 ?? current?.receipt?.dailyAutonomyReceiptSha256;
  assertSha(sha, 'daily autonomy receipt SHA');
  const reachable = new Set((current?.receipts ?? []).map((item) => item.dailyAutonomyReceiptSha256));
  if (!reachable.has(sha)) fail('G05A_RECEIPT_CORRUPT', 'requested G05A receipt is not reachable from committed autonomy head lineage');
  const receipt = validateDailyReceipt(readJson(path.join(pathsFor(identity, threadRef).receipts, `${sha}.json`)), identity, threadRef);
  const source = validateReceiptAgainstSources(receipt, identity, threadRef);
  return Object.freeze({
    schemaVersion: 'vexlife.g05a.scheduled-daily-autonomy-source-descent/v3', dailyAutonomyReceiptRef: receipt.dailyAutonomyReceiptRef,
    dailyAutonomyReceiptSha256: receipt.dailyAutonomyReceiptSha256, standingPolicyRef: receipt.standingPolicyRef,
    standingPolicySha256: receipt.standingPolicySha256, standingPolicyHeadSha256: receipt.standingPolicyHeadSha256,
    policyGeneration: receipt.policyGeneration, standingScopeFingerprint: receipt.standingScopeFingerprint, schedulerGeneration: receipt.schedulerGeneration,
    scheduledDreamAuthorityRef: receipt.scheduledDreamAuthorityRef, supervisorAdmissionEvidenceRef: receipt.supervisorAdmissionEvidenceRef,
    supervisorAdmissionEvidenceSha256: receipt.supervisorAdmissionEvidenceSha256, g05sProvenanceRef: receipt.g05sProvenanceRef,
    g05sProvenanceSha256: receipt.g05sProvenanceSha256, historicalG05sProvenanceState: validateHistoricalG05ScheduledAdmissionProvenance(source.admission.g05sProvenance).state,
    historicalG05sProvenanceGrantsCurrentAuthority: false, sourceConversationHeadSha256: receipt.sourceConversationHeadSha256,
    sourceScoreHeadSha256: receipt.sourceScoreHeadSha256, sourceSemanticAuthorityHeadSha256: receipt.sourceSemanticAuthorityHeadSha256,
    g03OrientationSha256: receipt.g03OrientationSha256, g03DreamHeadSha256: receipt.g03DreamHeadSha256,
    g03DailyStratumSha256: receipt.g03DailyStratumSha256, g03WakeReceiptSha256: receipt.g03WakeReceiptSha256,
    optionalLearningDisposition: receipt.optionalLearningDisposition, g03HistoricalSourceVerificationState: source.descent.historicalSourceVerificationState,
    noRawConversationContent: true, liveAuthorityReplayedFromHistoricalEvidence: false
  });
}

// [VXG RealForever]
