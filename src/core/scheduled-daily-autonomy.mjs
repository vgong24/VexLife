import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { semanticHash } from './utils.mjs';
import { loadScoreContextState } from './score-context-continuity.mjs';
import { commitDailyMemoryDream, loadDailyMemoryDreamState } from './daily-memory-dream.mjs';

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
  'G05A_SUPERVISOR_CONFLICT',
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
    receipts: homePath(home, 'scheduled-daily-autonomy', lineage, thread, 'receipts'),
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
  const policy = formStandingRestPolicy({ ...input, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
  const paths = pathsFor(identity, threadRef);
  const file = path.join(paths.policies, `${policy.policySha256}.json`);
  const state = writeExclusive(file, policy);
  if (state === 'EXISTS') {
    ensureRegularCanonicalFile(identity.homeRoot, file, 'G05A_POLICY_INVALID', 'standing rest policy');
    const existing = validateStandingRestPolicy(readJson(file, 'G05A_POLICY_INVALID', 'standing rest policy'));
    if (semanticHash(existing) !== semanticHash(policy)) fail('G05A_POLICY_INVALID', 'same policy address contains different content');
  }
  const headCore = {
    schemaVersion: 'vexlife.g05a.standing-rest-policy-head/v1',
    homeRef: identity.homeRef,
    deviceRef: identity.deviceRef,
    companionLineageRef: identity.companionLineageRef,
    threadRef,
    policyRef: policy.policyRef,
    policySha256: policy.policySha256,
    sourceScoreHeadSha256: score.head.scoreHeadSha256,
    formedAt: policy.formedAt
  };
  const head = { ...headCore, policyHeadSha256: semanticHash(headCore) };
  atomicWrite(paths.policyHead, head);
  return { policy, head };
}

export function loadStandingRestPolicy(input) {
  const { identity, threadRef } = loadIdentity(input);
  const paths = pathsFor(identity, threadRef);
  if (!fs.existsSync(paths.policyHead)) fail('G05A_POLICY_NOT_CURRENT', 'no current standing rest policy is configured');
  ensureRegularCanonicalFile(identity.homeRoot, paths.policyHead, 'G05A_POLICY_NOT_CURRENT', 'standing policy head');
  const head = readJson(paths.policyHead, 'G05A_POLICY_NOT_CURRENT', 'standing policy head');
  if (!SHA256.test(head.policySha256 ?? '') || !SHA256.test(head.policyHeadSha256 ?? '')) fail('G05A_POLICY_NOT_CURRENT', 'standing policy head is malformed');
  const { policyHeadSha256, ...core } = head;
  if (semanticHash(core) !== policyHeadSha256 || head.homeRef !== identity.homeRef || head.deviceRef !== identity.deviceRef || head.companionLineageRef !== identity.companionLineageRef || head.threadRef !== threadRef) {
    fail('G05A_POLICY_NOT_CURRENT', 'standing policy head identity is invalid');
  }
  const file = path.join(paths.policies, `${head.policySha256}.json`);
  ensureRegularCanonicalFile(identity.homeRoot, file, 'G05A_POLICY_NOT_CURRENT', 'standing rest policy');
  const policy = validateStandingRestPolicy(readJson(file, 'G05A_POLICY_NOT_CURRENT', 'standing rest policy'));
  if (policy.policyRef !== head.policyRef || policy.policySha256 !== head.policySha256) fail('G05A_POLICY_NOT_CURRENT', 'standing policy head does not bind policy bytes');
  return { policy, head };
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

function assertExpectedFrontier(observed, expected) {
  if (!expected) return;
  for (const key of ['conversationHeadSha256', 'scoreHeadSha256', 'semanticAuthorityHeadSha256', 'dreamHeadSha256']) {
    if (Object.prototype.hasOwnProperty.call(expected, key) && expected[key] !== observed[key]) {
      fail('G05A_SOURCE_STALE', `expected ${key} is stale`, { expected: expected[key], observed: observed[key] });
    }
  }
}

function acquireSupervisor(paths, identity, threadRef, supervisorRef, instanceRef) {
  fs.mkdirSync(paths.root, { recursive: true });
  const leaseCore = {
    schemaVersion: 'vexlife.g05a.supervisor-writer/v1',
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
  if (state === 'EXISTS') fail('G05A_SUPERVISOR_CONFLICT', 'scheduled autonomy already has a supervisor writer');
  return { path: paths.lock, token: lease.token };
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

function loadCurrentReceipt(identity, threadRef) {
  const paths = pathsFor(identity, threadRef);
  if (!fs.existsSync(paths.head)) return null;
  ensureRegularCanonicalFile(identity.homeRoot, paths.head, 'G05A_RECEIPT_CORRUPT', 'G05A current pointer');
  const head = readJson(paths.head, 'G05A_RECEIPT_CORRUPT', 'G05A current pointer');
  const { autonomyHeadSha256, ...headCore } = head;
  if (!SHA256.test(autonomyHeadSha256 ?? '') || semanticHash(headCore) !== autonomyHeadSha256 || !SHA256.test(head.dailyAutonomyReceiptSha256 ?? '')) {
    fail('G05A_RECEIPT_CORRUPT', 'G05A current pointer is malformed');
  }
  const file = path.join(paths.receipts, `${head.dailyAutonomyReceiptSha256}.json`);
  ensureRegularCanonicalFile(identity.homeRoot, file, 'G05A_RECEIPT_CORRUPT', 'G05A daily receipt');
  const receipt = validateAddressed(readJson(file), 'g05a-daily-receipt', 'dailyAutonomyReceiptRef', 'dailyAutonomyReceiptSha256', 'vexlife.g05a.daily-autonomy-receipt/v1');
  if (receipt.dailyAutonomyReceiptRef !== head.dailyAutonomyReceiptRef || receipt.dailyAutonomyReceiptSha256 !== head.dailyAutonomyReceiptSha256) fail('G05A_RECEIPT_CORRUPT', 'G05A pointer does not bind receipt bytes');
  return { head, receipt };
}

function writeDailyReceipt(identity, threadRef, receipt) {
  const paths = pathsFor(identity, threadRef);
  const file = path.join(paths.receipts, `${receipt.dailyAutonomyReceiptSha256}.json`);
  const state = writeExclusive(file, receipt);
  if (state === 'EXISTS') {
    ensureRegularCanonicalFile(identity.homeRoot, file, 'G05A_RECEIPT_CORRUPT', 'G05A daily receipt');
    const existing = validateAddressed(readJson(file), 'g05a-daily-receipt', 'dailyAutonomyReceiptRef', 'dailyAutonomyReceiptSha256', 'vexlife.g05a.daily-autonomy-receipt/v1');
    if (semanticHash(existing) !== semanticHash(receipt)) fail('G05A_RECEIPT_CORRUPT', 'same G05A receipt address contains different content');
  }
  const prior = loadCurrentReceipt(identity, threadRef)?.head ?? null;
  const headCore = {
    schemaVersion: 'vexlife.g05a.daily-autonomy-head/v1',
    homeRef: receipt.homeRef,
    deviceRef: receipt.deviceRef,
    companionLineageRef: receipt.companionLineageRef,
    threadRef: receipt.threadRef,
    calendarDateRef: receipt.calendarDateRef,
    dailyAutonomyReceiptRef: receipt.dailyAutonomyReceiptRef,
    dailyAutonomyReceiptSha256: receipt.dailyAutonomyReceiptSha256,
    g03DreamHeadSha256: receipt.g03DreamHeadSha256,
    g03WakeReceiptSha256: receipt.g03WakeReceiptSha256,
    priorAutonomyHeadSha256: prior?.autonomyHeadSha256 ?? null,
    formedAt: receipt.formedAt
  };
  const head = { ...headCore, autonomyHeadSha256: semanticHash(headCore) };
  atomicWrite(paths.head, head);
  return { file, head };
}

function validateResourceEvidence(resourceEvidence) {
  const value = resourceEvidence ?? { state: 'UNKNOWN' };
  if (!['SUFFICIENT', 'INSUFFICIENT', 'UNKNOWN'].includes(value.state)) return { state: 'UNKNOWN' };
  return { state: value.state, sourceRef: typeof value.sourceRef === 'string' ? value.sourceRef : null, observedAt: typeof value.observedAt === 'string' ? value.observedAt : null };
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

async function runOptionalLearning({ policy, callback, wakeSummary }) {
  if (policy.optionalLearningPolicy === 'ABSENT') return { disposition: 'ABSENT', failureCode: null };
  if (policy.optionalLearningPolicy === 'DEFERRED') return { disposition: 'DEFERRED', failureCode: null };
  if (typeof callback !== 'function') return { disposition: 'ABSENT', failureCode: null };
  try {
    const output = await callback(Object.freeze(structuredClone(wakeSummary)));
    const disposition = output?.disposition;
    if (!['REJECTED', 'ACCEPTED_INACTIVE', 'DEFERRED'].includes(disposition)) return { disposition: 'FAILED', failureCode: 'OPTIONAL_LEARNING_INVALID_RESULT' };
    return { disposition, failureCode: null };
  } catch (error) {
    return { disposition: 'FAILED', failureCode: typeof error?.code === 'string' ? error.code : 'OPTIONAL_LEARNING_EXCEPTION' };
  }
}

export async function runScheduledDailyAutonomyTick(input) {
  const observedAt = canonicalTimestamp(input.observedAt);
  const supervisorRef = safeRef(input.supervisorRef, 'supervisorRef', 'G05A_SUPERVISOR_CONFLICT');
  const instanceRef = safeRef(input.instanceRef, 'instanceRef', 'G05A_SUPERVISOR_CONFLICT');
  if (input.modelWorkerRef && safeRef(input.modelWorkerRef, 'modelWorkerRef', 'G05A_SUPERVISOR_CONFLICT') === supervisorRef) {
    fail('G05A_SUPERVISOR_CONFLICT', 'independent supervisor cannot collapse into the model worker identity');
  }
  const loaded = loadStandingRestPolicy(input);
  const policy = loaded.policy;
  const eligibility = isRestWindowEligible(policy, observedAt);
  if (!eligibility.eligible) {
    return Object.freeze({ state: 'OUTSIDE_REST_WINDOW', calendarDateRef: eligibility.calendarDateRef, noEffect: true, wakeCommitted: false, interactiveYielded: false, resourceYielded: false, duplicateSuppressed: false });
  }
  if (input.interactivePending === true) {
    return Object.freeze({ state: 'YIELDED_INTERACTIVE', calendarDateRef: eligibility.calendarDateRef, noEffect: true, wakeCommitted: false, interactiveYielded: true, resourceYielded: false, duplicateSuppressed: false });
  }
  const resource = validateResourceEvidence(input.resourceEvidence);
  if (resource.state !== 'SUFFICIENT') {
    return Object.freeze({ state: resource.state === 'INSUFFICIENT' ? 'YIELDED_RESOURCE' : 'YIELDED_RESOURCE_UNKNOWN', calendarDateRef: eligibility.calendarDateRef, noEffect: true, wakeCommitted: false, interactiveYielded: false, resourceYielded: true, duplicateSuppressed: false });
  }

  const { score, identity, threadRef } = loadIdentity(input);
  const current = loadCurrentReceipt(identity, threadRef);
  if (current?.receipt?.calendarDateRef === eligibility.calendarDateRef) {
    return Object.freeze({ state: 'DUPLICATE_SUPPRESSED', calendarDateRef: eligibility.calendarDateRef, noEffect: true, wakeCommitted: true, interactiveYielded: false, resourceYielded: false, duplicateSuppressed: true, receipt: current.receipt, head: current.head });
  }

  const paths = pathsFor(identity, threadRef);
  const lease = acquireSupervisor(paths, identity, threadRef, supervisorRef, instanceRef);
  try {
    const frontierBefore = observeScheduledSourceFrontier(input);
    assertExpectedFrontier(frontierBefore, input.expectedSourceFrontier ?? null);
    let daily = loadDailyMemoryDreamState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
    const restInvocationAuthorityRef = policyRestAuthority(policy);
    let bundle = g03BundleForDate(daily, eligibility.calendarDateRef);
    let resumedAfterWake = false;

    if (bundle) {
      if (bundle.orientation?.restInvocationAuthorityRef !== restInvocationAuthorityRef) {
        fail('G05A_RECOVERY_POLICY_DRIFT', 'existing same-day G03 wake belongs to a different standing-policy generation', {
          expectedRestInvocationAuthorityRef: restInvocationAuthorityRef,
          observedRestInvocationAuthorityRef: bundle.orientation?.restInvocationAuthorityRef ?? null
        });
      }
      verifyWakeBundle(bundle, daily);
      resumedAfterWake = true;
    } else {
      const refreshedScore = loadScoreContextState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
      const refreshedDaily = loadDailyMemoryDreamState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
      const refreshedFrontier = observeScheduledSourceFrontier(input);
      assertExpectedFrontier(refreshedFrontier, input.expectedSourceFrontier ?? null);
      const priorIndex = refreshedDaily.currentDailyStratum?.stratum?.dayIndex;
      const dayIndex = Number.isSafeInteger(priorIndex) ? priorIndex + 1 : 0;
      const compactDate = eligibility.calendarDateRef.replaceAll('-', '');
      try {
        commitDailyMemoryDream({
          home: identity.homeRoot,
          homeRef: identity.homeRef,
          deviceRef: identity.deviceRef,
          companionLineageRef: identity.companionLineageRef,
          threadRef,
          instanceRef,
          restInvocationAuthorityRef,
          dayRef: `day.g05a.${compactDate}`,
          dayIndex,
          calendarDateRef: eligibility.calendarDateRef,
          timeZoneRef: policy.timeZoneRef,
          observedAt,
          expectedConversationHeadSha256: refreshedScore.head.sourceConversationHeadSha256,
          expectedScoreHeadSha256: refreshedScore.head.scoreHeadSha256
        });
      } catch (error) {
        fail('G05A_DREAM_FAILED', 'automatic G03 admission failed closed', { causeCode: error?.code ?? 'UNKNOWN', message: error?.message ?? String(error) });
      }
      daily = loadDailyMemoryDreamState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
      bundle = g03BundleForDate(daily, eligibility.calendarDateRef);
      verifyWakeBundle(bundle, daily);
    }

    if (input.faults?.failAfterWakeBeforeReceipt === true) {
      fail('G05A_AFTER_WAKE_FAULT', 'simulated crash after committed G03 wake and before G05A receipt/current pointer');
    }

    const scoreBeforeOptional = loadScoreContextState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
    const dailyBeforeOptional = loadDailyMemoryDreamState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
    verifyWakeBundle(bundle, dailyBeforeOptional);
    const wakeSummary = {
      homeRef: identity.homeRef,
      deviceRef: identity.deviceRef,
      companionLineageRef: identity.companionLineageRef,
      threadRef,
      calendarDateRef: eligibility.calendarDateRef,
      g03DreamHeadSha256: dailyBeforeOptional.head.dailyDreamHeadSha256,
      g03DailyStratumSha256: bundle.stratum.dailyStratumSha256,
      g03WakeReceiptSha256: bundle.wake.wakeReceiptSha256
    };
    const optional = await runOptionalLearning({ policy, callback: input.optionalLearningCallback, wakeSummary });
    const scoreAfterOptional = loadScoreContextState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
    const dailyAfterOptional = loadDailyMemoryDreamState({ home: identity.homeRoot, homeRef: identity.homeRef, deviceRef: identity.deviceRef, companionLineageRef: identity.companionLineageRef, threadRef });
    if (scoreAfterOptional.head.scoreHeadSha256 !== scoreBeforeOptional.head.scoreHeadSha256 || dailyAfterOptional.head.dailyDreamHeadSha256 !== dailyBeforeOptional.head.dailyDreamHeadSha256) {
      fail('G05A_HELD_EFFECT_VIOLATION', 'optional learning modified Score or G03 wake continuity');
    }

    const receiptCore = {
      schemaVersion: 'vexlife.g05a.daily-autonomy-receipt/v1',
      mode: SCHEDULED_DAILY_AUTONOMY_MODE,
      homeRef: identity.homeRef,
      deviceRef: identity.deviceRef,
      companionLineageRef: identity.companionLineageRef,
      threadRef,
      calendarDateRef: eligibility.calendarDateRef,
      timeZoneRef: policy.timeZoneRef,
      observedAt,
      standingPolicyRef: policy.policyRef,
      standingPolicySha256: policy.policySha256,
      standingRestAuthorityRef: policy.standingRestAuthorityRef,
      supervisorRef,
      supervisorInstanceRef: instanceRef,
      resourceEvidenceState: resource.state,
      resourceEvidenceSourceRef: resource.sourceRef,
      sourceConversationHeadSha256: bundle.stratum.sourceConversationHeadSha256,
      sourceScoreHeadSha256: bundle.stratum.sourceScoreHeadSha256,
      sourceSemanticAuthorityHeadSha256: bundle.stratum.sourceSemanticAuthorityHeadSha256,
      g03DreamHeadSha256: dailyAfterOptional.head.dailyDreamHeadSha256,
      g03DailyStratumSha256: bundle.stratum.dailyStratumSha256,
      g03WakeReceiptSha256: bundle.wake.wakeReceiptSha256,
      wakeCommitted: true,
      resumedAfterWake,
      optionalLearningPolicy: policy.optionalLearningPolicy,
      optionalLearningDisposition: optional.disposition,
      optionalLearningFailureCode: optional.failureCode,
      interactiveYielded: false,
      resourceYielded: false,
      duplicateSuppressed: false,
      synchronizationPerformed: false,
      trainingPerformed: false,
      modelWeightsChanged: false,
      adapterChanged: false,
      rhythmActivationPerformed: false,
      powerControlPerformed: false,
      nativeWindowsServiceInstalled: false,
      publicationPerformed: false,
      nextSafeRoute: 'G05B_BOUNDED_SYNC_REQUIRES_SEPARATE_TARGET_AND_HOST_AUTHORITY',
      formedAt: observedAt
    };
    const receipt = addressed('g05a-daily-receipt', 'dailyAutonomyReceiptRef', 'dailyAutonomyReceiptSha256', receiptCore);
    const written = writeDailyReceipt(identity, threadRef, receipt);
    return Object.freeze({ state: 'COMPLETED', calendarDateRef: eligibility.calendarDateRef, wakeCommitted: true, interactiveYielded: false, resourceYielded: false, duplicateSuppressed: false, resumedAfterWake, receipt, head: written.head });
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
    identity: structuredClone(identity),
    threadRef,
    policy: policy.policy,
    policyHead: policy.head,
    head: current?.head ?? null,
    currentReceipt: current?.receipt ?? null,
    state: current ? 'CURRENT' : 'POLICY_READY'
  });
}

export function projectScheduledDailyAutonomy(input) {
  const state = loadScheduledDailyAutonomyState(input);
  const receipt = state.currentReceipt;
  return Object.freeze({
    schemaVersion: 'vexlife.g05a.scheduled-daily-autonomy-projection/v1',
    state: state.state,
    calendarDateRef: receipt?.calendarDateRef ?? null,
    timeZoneRef: state.policy.timeZoneRef,
    standingPolicyRef: state.policy.policyRef,
    supervisorRef: receipt?.supervisorRef ?? null,
    g03DreamHeadSha256: receipt?.g03DreamHeadSha256 ?? null,
    g03DailyStratumSha256: receipt?.g03DailyStratumSha256 ?? null,
    g03WakeReceiptSha256: receipt?.g03WakeReceiptSha256 ?? null,
    wakeCommitted: receipt?.wakeCommitted ?? false,
    optionalLearningDisposition: receipt?.optionalLearningDisposition ?? null,
    optionalLearningFailureCode: receipt?.optionalLearningFailureCode ?? null,
    synchronizationPerformed: false,
    trainingPerformed: false,
    modelWeightsChanged: false,
    adapterChanged: false,
    rhythmActivationPerformed: false,
    powerControlPerformed: false,
    nativeWindowsServiceInstalled: false,
    publicationPerformed: false,
    nextSafeRoute: receipt?.nextSafeRoute ?? 'WAIT_FOR_ELIGIBLE_REST_WINDOW'
  });
}

export function sourceDescentScheduledDailyAutonomy(input, receiptSha256 = null) {
  const { identity, threadRef } = loadIdentity(input);
  const paths = pathsFor(identity, threadRef);
  const current = loadCurrentReceipt(identity, threadRef);
  const sha = receiptSha256 ?? current?.receipt?.dailyAutonomyReceiptSha256;
  if (!SHA256.test(sha ?? '')) fail('G05A_RECEIPT_CORRUPT', 'no valid daily autonomy receipt SHA is available');
  const file = path.join(paths.receipts, `${sha}.json`);
  ensureRegularCanonicalFile(identity.homeRoot, file, 'G05A_RECEIPT_CORRUPT', 'G05A daily receipt');
  const receipt = validateAddressed(readJson(file), 'g05a-daily-receipt', 'dailyAutonomyReceiptRef', 'dailyAutonomyReceiptSha256', 'vexlife.g05a.daily-autonomy-receipt/v1');
  return Object.freeze({
    schemaVersion: 'vexlife.g05a.scheduled-daily-autonomy-source-descent/v1',
    dailyAutonomyReceiptRef: receipt.dailyAutonomyReceiptRef,
    dailyAutonomyReceiptSha256: receipt.dailyAutonomyReceiptSha256,
    standingPolicyRef: receipt.standingPolicyRef,
    standingPolicySha256: receipt.standingPolicySha256,
    sourceConversationHeadSha256: receipt.sourceConversationHeadSha256,
    sourceScoreHeadSha256: receipt.sourceScoreHeadSha256,
    sourceSemanticAuthorityHeadSha256: receipt.sourceSemanticAuthorityHeadSha256,
    g03DreamHeadSha256: receipt.g03DreamHeadSha256,
    g03DailyStratumSha256: receipt.g03DailyStratumSha256,
    g03WakeReceiptSha256: receipt.g03WakeReceiptSha256,
    optionalLearningDisposition: receipt.optionalLearningDisposition,
    noRawConversationContent: true
  });
}

// [VXG RealForever]
