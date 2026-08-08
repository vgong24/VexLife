import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createResourceSnapshot, evaluateCurrentResourceAdmission } from './resource-admission.mjs';
import { createSchedulerRuntimeTrustSnapshot, parseCanonicalTimestamp } from './scheduler-runtime-trust.mjs';
import { semanticHash } from './utils.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(HERE, '..', '..');
const SCHEDULER_REGISTRY_PATH = path.join(REPOSITORY_ROOT, 'blueprint', 'intent-scheduler-registry.json');

const REF = /^[a-z0-9](?:[a-z0-9._-]{0,190}[a-z0-9])?$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/u;
const POSITIVE = new Set(['PERMITTED', 'NARROWED']);
const ALL_DISPOSITIONS = new Set(['PERMITTED', 'NARROWED', 'DEFERRED', 'DENIED', 'UNKNOWN', 'WITHDRAWN']);
const REQUIRED_STANDING_USE_REFS = Object.freeze([
  'use.vexlife.g05.form-bounded-supervisor-admission-and-wake-receipts',
  'use.vexlife.g05.schedule-one-g03-memory-only-dream-per-local-calendar-day'
]);
const OPTIONAL_STANDING_USE_REFS = Object.freeze([
  'use.vexlife.g05.after-wake-g04-stage-a-simulated-inactive-evaluation'
]);
const ALLOWED_STANDING_USE_REFS = new Set([...REQUIRED_STANDING_USE_REFS, ...OPTIONAL_STANDING_USE_REFS]);
const FRONTIER_FIELDS = Object.freeze([
  'conversationHeadSha256',
  'scoreHeadSha256',
  'semanticAuthorityHeadSha256',
  'dreamHeadSha256',
  'dailyStratumSha256',
  'wakeReceiptSha256'
]);

export const G05_STANDING_AUTHORITY_CONTRACT_REF = 'contract.multivex.safety.g05.scheduled-daily-memory-dream-standing-rest/v1';
export const G05_STANDING_PURPOSE_REF = 'purpose.vexlife.g05.scheduled-daily-memory-dream';
export const G05_MEMORY_ONLY_MODE = 'MEMORY_ONLY_CONSOLIDATION';
export const G05_LIVE_RUNTIME_SOURCE_REF = 'source.intent-scheduler.windows-g05-runtime-observer';
export const G05_LIVE_RUNTIME_AUTHORITY_REF = 'authority.intent-scheduler.windows-g05-runtime-observer';
export const G05_LIVE_RUNTIME_WORKER_REF = 'worker.supervisor.windows-g05-runtime-observer';
export const G05_LIVE_RUNTIME_FORMATION_REF = 'formation.intent-scheduler.windows-g05-runtime-observer.v1';
export const G05_LIVE_RUNTIME_EVIDENCE_CLASS = 'LIVE_RUNTIME_CURRENT';
export const G05_SCHEDULED_ADMISSION_CONTRACT_REF = 'contract.vexlife.g05s.scheduled-admission-provenance/v1';
export const G05_RESOURCE_REQUEST = Object.freeze({
  cpuSlots: 1,
  ramMb: 64,
  vramMb: 0,
  modelTurn: false,
  heavyTool: false,
  background: true
});

export const G05_LIVE_RUNTIME_SOURCE_DESCRIPTOR = Object.freeze({
  schemaVersion: 'vexlife.g05s.live-runtime-source-descriptor/v1',
  sourceRef: G05_LIVE_RUNTIME_SOURCE_REF,
  sourceClass: 'SOURCE_MANAGED_WINDOWS_RUNTIME_OBSERVER',
  path: 'src/core/g05-runtime-authority-substrate.mjs',
  evidenceClass: G05_LIVE_RUNTIME_EVIDENCE_CLASS,
  authorityRef: G05_LIVE_RUNTIME_AUTHORITY_REF,
  workerRef: G05_LIVE_RUNTIME_WORKER_REF,
  platform: 'win32',
  clockRef: 'clock.intent-scheduler.canonical-utc',
  resourceProvider: 'NODE_OS_OBSERVATION_WITH_FAIL_CLOSED_LOGICAL_SUPERVISOR_STATE',
  mechanicalProfileRef: 'profile.vexlife.windows.repository-execution.refresh-lc18.03893bc0-974c-474d-b441-1ef0d0da445a',
  mechanicalProfileDigestSha256: '7e264b54b1425805ae5e13c423e0e9bb50ba3f1d1579c6e09af526c722b22fc8',
  mechanicalQualificationRef: 'qualification.vexlocalbridge.windows-victor.refresh-lc18.0547dc64-c293-427e-bc37-978e2abd8505',
  profileBindingMode: 'PREDECESSOR_MECHANICAL_DEPENDENCY_NOT_CURRENT_HOST_ASSERTION',
  selfCertificationAllowed: false
});

export const G05_LIVE_RUNTIME_SOURCE_HASH = '34ed3993f48b6b6e3b58d050eb541a3e7e480ca9ef3d9e510616752d99b6ac44';

export class G05RuntimeAuthorityError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'G05RuntimeAuthorityError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new G05RuntimeAuthorityError(code, message, details);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function clone(value) {
  return structuredClone(value);
}

function exactKeys(value, expected, code, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${label} must be one object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(code, `${label} fields are not exact`, { actual, wanted });
}

function requiredString(value, label, code) {
  if (typeof value !== 'string' || value.length === 0) fail(code, `${label} is required`);
  return value;
}

function safeRef(value, label, code = 'G05S_AUTHORITY_INVALID') {
  const ref = requiredString(value, label, code);
  const stem = ref.split('.')[0];
  if (!REF.test(ref) || WINDOWS_RESERVED.test(stem) || path.isAbsolute(ref) || path.win32.isAbsolute(ref) || path.posix.isAbsolute(ref)) {
    fail(code, `${label} must be one lowercase portable canonical path segment`, { value });
  }
  return ref;
}

function assertSha(value, label, code = 'G05S_AUTHORITY_INVALID') {
  if (!SHA256.test(value ?? '')) fail(code, `${label} must be lowercase SHA-256`, { value });
  return value;
}

function canonicalTimestamp(value, label, code = 'G05S_AUTHORITY_INVALID') {
  try {
    parseCanonicalTimestamp(value, label);
  } catch (error) {
    fail(code, error.message);
  }
  return value;
}

function assertSortedUniqueStrings(values, label, code) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || !value)) {
    fail(code, `${label} must contain non-empty strings`);
  }
  const sorted = [...new Set(values)].sort();
  if (sorted.length !== values.length || JSON.stringify(sorted) !== JSON.stringify(values)) {
    fail(code, `${label} must be unique and lexicographically sorted`);
  }
  return values;
}

function canonicalHome(home) {
  const requested = path.resolve(requiredString(home, 'Vex Home', 'G05S_HOME_INVALID'));
  if (!fs.existsSync(requested) || !fs.lstatSync(requested).isDirectory() || fs.lstatSync(requested).isSymbolicLink()) {
    fail('G05S_HOME_INVALID', 'Vex Home must already exist as one regular directory', { requested });
  }
  const real = fs.realpathSync.native(requested);
  if (process.platform === 'win32' ? real.toLowerCase() !== requested.toLowerCase() : real !== requested) {
    fail('G05S_HOME_INVALID', 'Vex Home is not its canonical filesystem identity', { requested, real });
  }
  return real;
}

function homePath(home, ...segments) {
  const root = canonicalHome(home);
  for (const segment of segments) {
    if (typeof segment !== 'string' || !segment || segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\')) {
      fail('G05S_HOME_INVALID', 'authority path segment is not canonical', { segment });
    }
  }
  const target = path.resolve(root, ...segments);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('G05S_HOME_INVALID', 'resolved authority path escapes Vex Home', { target });
  }
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) continue;
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) fail('G05S_HOME_INVALID', 'authority path must not traverse symlinks', { cursor });
  }
  return target;
}

function readJsonFile(file, code, label) {
  if (!fs.existsSync(file)) fail(code, `${label} is missing`, { file });
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) fail(code, `${label} must be one regular canonical file`, { file });
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(code, `${label} JSON is invalid`, { cause: error.message });
  }
}

function standingAuthorityPaths(home, companionLineageRef, threadRef) {
  const lineage = safeRef(companionLineageRef, 'companionLineageRef');
  const thread = safeRef(threadRef, 'threadRef');
  return {
    root: homePath(home, 'semantic-authority', 'daily-dream-standing-rest', lineage, thread),
    consents: homePath(home, 'semantic-authority', 'daily-dream-standing-rest', lineage, thread, 'consents'),
    bindings: homePath(home, 'semantic-authority', 'daily-dream-standing-rest', lineage, thread, 'authority-bindings'),
    heads: homePath(home, 'semantic-authority', 'daily-dream-standing-rest', lineage, thread, 'heads'),
    head: homePath(home, 'semantic-authority', 'daily-dream-standing-rest', lineage, thread, 'head.json')
  };
}

function standingScopeFromConsent(consent) {
  return {
    schemaVersion: 'vextreme.daily-dream-standing-consent-scope/v1',
    humanSubjectRef: consent.humanSubjectRef,
    homeRef: consent.homeRef,
    deviceRef: consent.deviceRef,
    companionLineageRef: consent.companionLineageRef,
    threadRef: consent.threadRef,
    purposeRef: consent.purposeRef,
    selectedMode: consent.selectedMode,
    privacyClass: consent.privacyClass,
    permittedUseRefs: [...consent.permittedUseRefs],
    prohibitedUseRefs: [...consent.prohibitedUseRefs],
    timeZoneRef: consent.timeZoneRef,
    restWindowStartLocalMinute: consent.restWindowStartLocalMinute,
    restWindowEndLocalMinute: consent.restWindowEndLocalMinute,
    exactlyOnceCalendarDay: consent.exactlyOnceCalendarDay,
    interactiveYieldRequired: consent.interactiveYieldRequired,
    localOnly: consent.localOnly
  };
}

export function buildG05StandingScopeFingerprint(scope) {
  exactKeys(scope, [
    'schemaVersion','humanSubjectRef','homeRef','deviceRef','companionLineageRef','threadRef','purposeRef','selectedMode','privacyClass',
    'permittedUseRefs','prohibitedUseRefs','timeZoneRef','restWindowStartLocalMinute','restWindowEndLocalMinute','exactlyOnceCalendarDay',
    'interactiveYieldRequired','localOnly'
  ], 'G05S_SCOPE_INVALID', 'standing scope');
  if (scope.schemaVersion !== 'vextreme.daily-dream-standing-consent-scope/v1' ||
      scope.purposeRef !== G05_STANDING_PURPOSE_REF || scope.selectedMode !== G05_MEMORY_ONLY_MODE || scope.privacyClass !== 'DEVICE_PRIVATE' ||
      scope.exactlyOnceCalendarDay !== true || scope.interactiveYieldRequired !== true || scope.localOnly !== true) {
    fail('G05S_SCOPE_INVALID', 'standing scope crosses the accepted G05 semantic boundary');
  }
  for (const field of ['humanSubjectRef','homeRef','deviceRef','companionLineageRef','threadRef','purposeRef']) safeRef(scope[field], `scope.${field}`, 'G05S_SCOPE_INVALID');
  assertSortedUniqueStrings(scope.permittedUseRefs, 'scope.permittedUseRefs', 'G05S_SCOPE_INVALID');
  assertSortedUniqueStrings(scope.prohibitedUseRefs, 'scope.prohibitedUseRefs', 'G05S_SCOPE_INVALID');
  for (const requiredUse of REQUIRED_STANDING_USE_REFS) {
    if (!scope.permittedUseRefs.includes(requiredUse)) fail('G05S_SCOPE_INVALID', `standing scope is missing required permitted use ${requiredUse}`);
  }
  for (const permittedUse of scope.permittedUseRefs) {
    if (!ALLOWED_STANDING_USE_REFS.has(permittedUse)) fail('G05S_SCOPE_INVALID', `standing scope contains inadmissible permitted use ${permittedUse}`);
  }
  if (scope.prohibitedUseRefs.some((item) => scope.permittedUseRefs.includes(item))) {
    fail('G05S_SCOPE_INVALID', 'standing scope cannot both permit and prohibit the same use');
  }
  if (!Number.isInteger(scope.restWindowStartLocalMinute) || scope.restWindowStartLocalMinute < 0 || scope.restWindowStartLocalMinute > 1439 ||
      !Number.isInteger(scope.restWindowEndLocalMinute) || scope.restWindowEndLocalMinute < 0 || scope.restWindowEndLocalMinute > 1439) {
    fail('G05S_SCOPE_INVALID', 'standing rest-window minutes must be integers 0..1439');
  }
  try { new Intl.DateTimeFormat('en-US', { timeZone: scope.timeZoneRef }).format(new Date(0)); }
  catch { fail('G05S_SCOPE_INVALID', 'standing scope timeZoneRef must be an IANA time zone'); }
  return semanticHash(scope);
}

function validateStandingConsent(consent, expected) {
  const code = 'G05S_STANDING_CONSENT_INVALID';
  exactKeys(consent, [
    'schemaVersion','humanSubjectRef','homeRef','deviceRef','companionLineageRef','threadRef','purposeRef','selectedMode','privacyClass','permittedUseRefs',
    'prohibitedUseRefs','timeZoneRef','restWindowStartLocalMinute','restWindowEndLocalMinute','exactlyOnceCalendarDay','interactiveYieldRequired','localOnly',
    'disposition','formedAt','expiresAt','issuerRef','issuerClass','sourceEvidenceRefs','standingConsentRef','standingConsentSha256'
  ], code, 'standing consent');
  if (consent.schemaVersion !== 'vextreme.daily-dream-standing-consent-disposition/v1' || !ALL_DISPOSITIONS.has(consent.disposition)) {
    fail(code, 'standing consent schema/disposition is invalid');
  }
  for (const field of ['humanSubjectRef','homeRef','deviceRef','companionLineageRef','threadRef','purposeRef','issuerRef']) safeRef(consent[field], `standingConsent.${field}`, code);
  requiredString(consent.issuerClass, 'standingConsent.issuerClass', code);
  assertSortedUniqueStrings(consent.permittedUseRefs, 'standingConsent.permittedUseRefs', code);
  assertSortedUniqueStrings(consent.prohibitedUseRefs, 'standingConsent.prohibitedUseRefs', code);
  assertSortedUniqueStrings(consent.sourceEvidenceRefs, 'standingConsent.sourceEvidenceRefs', code);
  canonicalTimestamp(consent.formedAt, 'standingConsent.formedAt', code);
  if (consent.expiresAt !== null) {
    canonicalTimestamp(consent.expiresAt, 'standingConsent.expiresAt', code);
    if (Date.parse(consent.expiresAt) <= Date.parse(consent.formedAt)) fail(code, 'standing consent expiry must follow formation');
  }
  const scope = standingScopeFromConsent(consent);
  const scopeFingerprint = buildG05StandingScopeFingerprint(scope);
  const preimage = clone(consent);
  delete preimage.standingConsentRef;
  delete preimage.standingConsentSha256;
  const expectedRef = `daily-dream-standing-consent.${semanticHash(preimage).slice(0, 32)}`;
  const expectedSha = semanticHash({ ...preimage, standingConsentRef: expectedRef });
  if (consent.standingConsentRef !== expectedRef || consent.standingConsentSha256 !== expectedSha) {
    fail(code, 'standing consent content address does not recompute');
  }
  if (consent.humanSubjectRef !== expected.humanSubjectRef || consent.companionLineageRef !== expected.companionLineageRef ||
      consent.threadRef !== expected.threadRef || consent.purposeRef !== G05_STANDING_PURPOSE_REF || scopeFingerprint !== expected.scopeFingerprint) {
    fail('G05S_STANDING_AUTHORITY_MISMATCH', 'standing consent does not match the exact requested subject/purpose/scope');
  }
  const observed = Date.parse(expected.observedAt);
  if (Date.parse(consent.formedAt) > observed || (consent.expiresAt !== null && observed >= Date.parse(consent.expiresAt))) {
    fail('G05S_STANDING_AUTHORITY_STALE', 'standing consent is not live at the exact runtime observation');
  }
  if (!POSITIVE.has(consent.disposition)) fail('G05S_STANDING_AUTHORITY_NOT_PERMITTED', `standing consent disposition is ${consent.disposition}`);
  return { consent: freeze(clone(consent)), scope: freeze(scope), scopeFingerprint };
}

function validateAuthorityBinding(binding, consentResult) {
  const code = 'G05S_STANDING_BINDING_INVALID';
  exactKeys(binding, [
    'schemaVersion','standingConsentRef','standingConsentSha256','subjectRef','purposeRef','scopeFingerprint','disposition','formedAt','expiresAt',
    'authorityRef','authoritySha256'
  ], code, 'standing authority binding');
  const preimage = clone(binding);
  delete preimage.authorityRef;
  delete preimage.authoritySha256;
  const expectedRef = `daily-dream-standing-authority.${semanticHash(preimage).slice(0, 32)}`;
  const expectedSha = semanticHash({ ...preimage, authorityRef: expectedRef });
  if (binding.schemaVersion !== 'vextreme.daily-dream-standing-authority-binding/v1' || binding.authorityRef !== expectedRef || binding.authoritySha256 !== expectedSha) {
    fail(code, 'standing authority binding content address does not recompute');
  }
  const consent = consentResult.consent;
  if (binding.standingConsentRef !== consent.standingConsentRef || binding.standingConsentSha256 !== consent.standingConsentSha256 ||
      binding.subjectRef !== consent.humanSubjectRef || binding.purposeRef !== consent.purposeRef || binding.scopeFingerprint !== consentResult.scopeFingerprint ||
      binding.disposition !== consent.disposition || binding.formedAt !== consent.formedAt || binding.expiresAt !== consent.expiresAt) {
    fail('G05S_STANDING_AUTHORITY_MISMATCH', 'standing authority binding differs from its exact consent generation');
  }
  return freeze(clone(binding));
}

function currentBindingKey(binding) {
  return semanticHash({
    humanSubjectRef: binding.humanSubjectRef,
    purposeRef: binding.purposeRef,
    scopeFingerprint: binding.scopeFingerprint
  });
}

function validateHeadObject(head, expectedLineage, expectedThread) {
  const code = 'G05S_STANDING_HEAD_INVALID';
  exactKeys(head, [
    'schemaVersion','contractRef','sourceLineageRef','sourceThreadRef','generation','priorAuthorityHeadSha256','currentStandingConsentBindings','formedAt',
    'ownerDispositionRef','authorityHeadRef','authorityHeadSha256'
  ], code, 'standing authority head');
  if (head.schemaVersion !== 'vextreme.daily-dream-standing-consent-authority-head/v1' || head.contractRef !== G05_STANDING_AUTHORITY_CONTRACT_REF ||
      head.sourceLineageRef !== expectedLineage || head.sourceThreadRef !== expectedThread || !Number.isSafeInteger(head.generation) || head.generation < 0 ||
      (head.generation === 0 ? head.priorAuthorityHeadSha256 !== null : !SHA256.test(head.priorAuthorityHeadSha256 ?? ''))) {
    fail(code, 'standing authority head identity/generation is invalid');
  }
  canonicalTimestamp(head.formedAt, 'standingAuthorityHead.formedAt', code);
  safeRef(head.ownerDispositionRef, 'standingAuthorityHead.ownerDispositionRef', code);
  if (!Array.isArray(head.currentStandingConsentBindings)) fail(code, 'currentStandingConsentBindings must be an array');
  const expectedBindingFields = ['standingConsentRef','standingConsentSha256','authorityRef','authoritySha256','humanSubjectRef','purposeRef','scopeFingerprint'];
  const keyed = head.currentStandingConsentBindings.map((binding) => {
    exactKeys(binding, expectedBindingFields, code, 'current standing binding');
    for (const field of ['standingConsentRef','authorityRef','humanSubjectRef','purposeRef']) safeRef(binding[field], `currentBinding.${field}`, code);
    for (const field of ['standingConsentSha256','authoritySha256','scopeFingerprint']) assertSha(binding[field], `currentBinding.${field}`, code);
    return { key: currentBindingKey(binding), sha: binding.standingConsentSha256, binding };
  });
  const keys = keyed.map((item) => item.key);
  if (new Set(keys).size !== keys.length) fail(code, 'standing authority head contains duplicate/conflicting exact-scope current bindings');
  const sorted = [...keyed].sort((a, b) => a.key.localeCompare(b.key) || a.sha.localeCompare(b.sha));
  if (JSON.stringify(sorted.map((item) => item.binding)) !== JSON.stringify(head.currentStandingConsentBindings)) {
    fail(code, 'standing authority current bindings are not deterministically sorted');
  }
  const preimage = clone(head);
  delete preimage.authorityHeadRef;
  delete preimage.authorityHeadSha256;
  const expectedRef = `daily-dream-standing-authority-head.${semanticHash(preimage).slice(0, 32)}`;
  const expectedSha = semanticHash({ ...preimage, authorityHeadRef: expectedRef });
  if (head.authorityHeadRef !== expectedRef || head.authorityHeadSha256 !== expectedSha) fail(code, 'standing authority head content address does not recompute');
  return freeze(clone(head));
}

function replayOwnerHead(paths, currentHead, expectedLineage, expectedThread) {
  const chain = [];
  const seen = new Set();
  let head = currentHead;
  while (head) {
    if (seen.has(head.authorityHeadSha256)) fail('G05S_STANDING_HEAD_INVALID', 'standing authority head lineage contains a cycle');
    seen.add(head.authorityHeadSha256);
    chain.push(head);
    const addressed = readJsonFile(path.join(paths.heads, `${head.authorityHeadSha256}.json`), 'G05S_STANDING_HEAD_INVALID', 'addressed standing authority head');
    const validatedAddressed = validateHeadObject(addressed, expectedLineage, expectedThread);
    if (semanticHash(validatedAddressed) !== semanticHash(head)) fail('G05S_STANDING_HEAD_INVALID', 'current/head lineage object differs from addressed history');
    if (head.generation === 0) {
      if (head.priorAuthorityHeadSha256 !== null) fail('G05S_STANDING_HEAD_INVALID', 'generation zero must have null prior head');
      break;
    }
    const prior = readJsonFile(path.join(paths.heads, `${head.priorAuthorityHeadSha256}.json`), 'G05S_STANDING_HEAD_INVALID', 'prior standing authority head');
    const validatedPrior = validateHeadObject(prior, expectedLineage, expectedThread);
    if (validatedPrior.authorityHeadSha256 !== head.priorAuthorityHeadSha256 || validatedPrior.generation !== head.generation - 1) {
      fail('G05S_STANDING_HEAD_INVALID', 'standing authority head lineage generation/hash is discontinuous');
    }
    if (Date.parse(validatedPrior.formedAt) > Date.parse(head.formedAt)) {
      fail('G05S_STANDING_HEAD_INVALID', 'standing authority head lineage chronology reverses');
    }
    head = validatedPrior;
  }
  return freeze(chain);
}

export function resolveCurrentG05StandingAuthority({
  home,
  companionLineageRef,
  threadRef,
  humanSubjectRef,
  expectedScope,
  observedAt
}) {
  const lineage = safeRef(companionLineageRef, 'companionLineageRef');
  const thread = safeRef(threadRef, 'threadRef');
  const subject = safeRef(humanSubjectRef, 'humanSubjectRef');
  canonicalTimestamp(observedAt, 'observedAt');
  if (expectedScope.companionLineageRef !== lineage || expectedScope.threadRef !== thread || expectedScope.humanSubjectRef !== subject) {
    fail('G05S_STANDING_AUTHORITY_MISMATCH', 'expected standing scope identity differs from resolver identity');
  }
  const scopeFingerprint = buildG05StandingScopeFingerprint(expectedScope);
  const paths = standingAuthorityPaths(home, lineage, thread);
  const currentRaw = readJsonFile(paths.head, 'G05S_STANDING_HEAD_INVALID', 'canonical standing authority head.json');
  const currentHead = validateHeadObject(currentRaw, lineage, thread);
  if (Date.parse(currentHead.formedAt) > Date.parse(observedAt)) {
    fail('G05S_STANDING_AUTHORITY_STALE', 'canonical current standing authority head is newer than the exact runtime observation');
  }
  const chain = replayOwnerHead(paths, currentHead, lineage, thread);
  const key = semanticHash({ humanSubjectRef: subject, purposeRef: G05_STANDING_PURPOSE_REF, scopeFingerprint });
  const member = currentHead.currentStandingConsentBindings.find((binding) => currentBindingKey(binding) === key);
  if (!member) fail('G05S_STANDING_AUTHORITY_NOT_CURRENT', 'exact standing authority scope is absent from the canonical current owner head');
  const consentRaw = readJsonFile(path.join(paths.consents, `${member.standingConsentSha256}.json`), 'G05S_STANDING_CONSENT_INVALID', 'addressed standing consent');
  const consentResult = validateStandingConsent(consentRaw, { humanSubjectRef: subject, companionLineageRef: lineage, threadRef: thread, scopeFingerprint, observedAt });
  if (consentResult.consent.standingConsentRef !== member.standingConsentRef || consentResult.consent.standingConsentSha256 !== member.standingConsentSha256) {
    fail('G05S_STANDING_AUTHORITY_MISMATCH', 'current head standing-consent membership differs from addressed consent');
  }
  const bindingRaw = readJsonFile(path.join(paths.bindings, `${member.authoritySha256}.json`), 'G05S_STANDING_BINDING_INVALID', 'addressed standing authority binding');
  const binding = validateAuthorityBinding(bindingRaw, consentResult);
  if (binding.authorityRef !== member.authorityRef || binding.authoritySha256 !== member.authoritySha256 ||
      member.humanSubjectRef !== subject || member.purposeRef !== G05_STANDING_PURPOSE_REF || member.scopeFingerprint !== scopeFingerprint) {
    fail('G05S_STANDING_AUTHORITY_MISMATCH', 'current head authority-binding membership is not exact');
  }
  return freeze({
    schemaVersion: 'vexlife.g05s.current-standing-authority/v1',
    contractRef: G05_STANDING_AUTHORITY_CONTRACT_REF,
    observedAt,
    currentAuthorityHeadRef: currentHead.authorityHeadRef,
    currentAuthorityHeadSha256: currentHead.authorityHeadSha256,
    currentAuthorityGeneration: currentHead.generation,
    currentBindingKey: key,
    scopeFingerprint,
    standingConsentRef: consentResult.consent.standingConsentRef,
    standingConsentSha256: consentResult.consent.standingConsentSha256,
    authorityRef: binding.authorityRef,
    authoritySha256: binding.authoritySha256,
    disposition: consentResult.consent.disposition,
    expiresAt: consentResult.consent.expiresAt,
    ownerHeadChainSha256: semanticHash(chain.map((item) => item.authorityHeadSha256)),
    livePositiveStandingConsent: true,
    selfCertified: false,
    semanticFingerprint: semanticHash({
      head: currentHead.authorityHeadSha256,
      binding: binding.authoritySha256,
      consent: consentResult.consent.standingConsentSha256,
      scopeFingerprint,
      observedAt
    })
  });
}

export function validateG05LiveRuntimeRegistry(registry) {
  const source = registry?.runtimeSourceIdentities?.find((item) => item.sourceRef === G05_LIVE_RUNTIME_SOURCE_REF);
  const worker = registry?.workerIdentities?.find((item) => item.workerRef === G05_LIVE_RUNTIME_WORKER_REF);
  if (!source || !worker) fail('G05S_RUNTIME_SOURCE_INVALID', 'canonical G05 live runtime source/worker are not registered');
  if (source.evidenceClass !== G05_LIVE_RUNTIME_EVIDENCE_CLASS || source.authorityRef !== G05_LIVE_RUNTIME_AUTHORITY_REF || source.liveRuntime !== true ||
      source.sourceHash !== G05_LIVE_RUNTIME_SOURCE_HASH || semanticHash(source.sourceDescriptor) !== G05_LIVE_RUNTIME_SOURCE_HASH ||
      semanticHash(G05_LIVE_RUNTIME_SOURCE_DESCRIPTOR) !== G05_LIVE_RUNTIME_SOURCE_HASH || semanticHash(source.sourceDescriptor) !== semanticHash(G05_LIVE_RUNTIME_SOURCE_DESCRIPTOR)) {
    fail('G05S_RUNTIME_SOURCE_INVALID', 'canonical G05 live runtime source descriptor/hash binding is invalid');
  }
  if (source.sourceDescriptor?.mechanicalProfileRef !== G05_LIVE_RUNTIME_SOURCE_DESCRIPTOR.mechanicalProfileRef ||
      source.sourceDescriptor?.mechanicalProfileDigestSha256 !== G05_LIVE_RUNTIME_SOURCE_DESCRIPTOR.mechanicalProfileDigestSha256 ||
      source.sourceDescriptor?.profileBindingMode !== 'PREDECESSOR_MECHANICAL_DEPENDENCY_NOT_CURRENT_HOST_ASSERTION' ||
      source.sourceDescriptor?.selfCertificationAllowed !== false) {
    fail('G05S_RUNTIME_SOURCE_INVALID', 'canonical G05 live runtime mechanical-profile provenance is invalid');
  }
  if (worker.workerKind !== 'NON_MODEL_RUNTIME_SUPERVISOR' || !worker.evidenceClasses?.includes(G05_LIVE_RUNTIME_EVIDENCE_CLASS)) {
    fail('G05S_RUNTIME_SOURCE_INVALID', 'canonical G05 live runtime worker is not the admitted non-model supervisor');
  }
  return freeze({ registry: clone(registry), source: clone(source), worker: clone(worker) });
}

function readSchedulerRegistry() {
  const registry = readJsonFile(SCHEDULER_REGISTRY_PATH, 'G05S_RUNTIME_SOURCE_INVALID', 'canonical Intent Scheduler registry');
  return validateG05LiveRuntimeRegistry(registry);
}

function cpuTotals() {
  return os.cpus().reduce((aggregate, cpu) => {
    const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
    aggregate.total += total;
    aggregate.idle += cpu.times.idle;
    return aggregate;
  }, { total: 0, idle: 0 });
}

async function measureCpuLoadPct(delayMs = 120) {
  const first = cpuTotals();
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  const second = cpuTotals();
  const total = Math.max(1, second.total - first.total);
  const idle = Math.max(0, second.idle - first.idle);
  return Math.max(0, Math.min(100, Number((((total - idle) / total) * 100).toFixed(3))));
}

export async function observeWindowsG05Runtime({ schedulerGeneration } = {}) {
  if (process.platform !== 'win32') fail('G05S_WINDOWS_OBSERVER_UNAVAILABLE', 'live G05 runtime observation requires Windows');
  if (!Number.isSafeInteger(schedulerGeneration) || schedulerGeneration < 0) fail('G05S_RUNTIME_SOURCE_INVALID', 'schedulerGeneration must be a non-negative integer');
  const { registry } = readSchedulerRegistry();
  const formedAt = new Date().toISOString();
  const cpuLoadPct = await measureCpuLoadPct();
  const observedAt = new Date().toISOString();
  const expiresAt = new Date(Date.parse(observedAt) + 30_000).toISOString();
  const cpuConcurrencyLimit = Math.max(1, typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length);
  const cpuActiveCount = Math.min(cpuConcurrencyLimit, Math.ceil((cpuLoadPct / 100) * cpuConcurrencyLimit));
  const snapshotPreimage = {
    generation: schedulerGeneration,
    sourceRef: G05_LIVE_RUNTIME_SOURCE_REF,
    sourceHash: G05_LIVE_RUNTIME_SOURCE_HASH,
    formationRef: G05_LIVE_RUNTIME_FORMATION_REF,
    evidenceClass: G05_LIVE_RUNTIME_EVIDENCE_CLASS,
    cpuLoadPct,
    cpuConcurrencyLimit,
    cpuActiveCount,
    ramAvailableMb: Math.floor(os.freemem() / (1024 * 1024)),
    ramReservedMb: 0,
    gpuAvailable: false,
    vramAvailableMb: 0,
    vramReservedMb: 0,
    modelResident: false,
    // No native supervisor is installed in G05S. Unobserved logical concurrency is deliberately projected busy/held.
    activeModelTurn: true,
    activeHeavyTool: true,
    interactiveWaitState: 'WAITING',
    backgroundWorkAdmission: 'HELD',
    thermalPowerState: 'NOT_EXPOSED',
    currentness: 'CURRENT',
    formedAt,
    observedAt,
    expiresAt
  };
  const snapshotRef = `g05s-windows-resource.${semanticHash(snapshotPreimage).slice(0, 32)}`;
  const resourceSnapshot = createResourceSnapshot({ snapshotRef, ...snapshotPreimage });
  const trustPreimage = {
    snapshotRef: `g05s-windows-runtime-trust.${semanticHash({ snapshotRef, observedAt, schedulerGeneration }).slice(0, 32)}`,
    sourceRef: G05_LIVE_RUNTIME_SOURCE_REF,
    sourceHash: G05_LIVE_RUNTIME_SOURCE_HASH,
    formationRef: G05_LIVE_RUNTIME_FORMATION_REF,
    evidenceClass: G05_LIVE_RUNTIME_EVIDENCE_CLASS,
    schedulerGeneration,
    formedAt,
    observedAt,
    expiresAt,
    workerRef: G05_LIVE_RUNTIME_WORKER_REF,
    actorRef: 'actor.vexlife.g05-runtime-observer',
    roleRef: 'role.vexlife.g05-runtime-observer',
    claimRef: 'claim.vexlife.g05-runtime-observation',
    occupancyRef: `occupancy.vexlife.g05-runtime-observer.pid-${process.pid}`,
    leaseAuthorityRef: G05_LIVE_RUNTIME_AUTHORITY_REF,
    resourceSnapshotRef: resourceSnapshot.snapshotRef,
    resourceSnapshotFingerprint: resourceSnapshot.semanticFingerprint,
    currentness: 'CURRENT'
  };
  const trustSnapshot = createSchedulerRuntimeTrustSnapshot(trustPreimage, { schedulerRegistry: registry, resourceSnapshot });
  const resourceAdmission = evaluateCurrentResourceAdmission(resourceSnapshot, G05_RESOURCE_REQUEST, { observedAt });
  const core = {
    schemaVersion: 'vexlife.g05s.windows-live-runtime-observation/v1',
    sourceDescriptor: clone(G05_LIVE_RUNTIME_SOURCE_DESCRIPTOR),
    sourceHash: G05_LIVE_RUNTIME_SOURCE_HASH,
    sourceRef: G05_LIVE_RUNTIME_SOURCE_REF,
    authorityRef: G05_LIVE_RUNTIME_AUTHORITY_REF,
    workerRef: G05_LIVE_RUNTIME_WORKER_REF,
    evidenceClass: G05_LIVE_RUNTIME_EVIDENCE_CLASS,
    observedAt,
    resourceSnapshot,
    trustSnapshot,
    resourceAdmission,
    logicalSupervisorState: 'FAIL_CLOSED_UNOBSERVED_NO_NATIVE_SUPERVISOR',
    mechanicalProfileDependencyRef: G05_LIVE_RUNTIME_SOURCE_DESCRIPTOR.mechanicalProfileRef,
    mechanicalProfileDependencyDigestSha256: G05_LIVE_RUNTIME_SOURCE_DESCRIPTOR.mechanicalProfileDigestSha256,
    currentHostMatchesVictorProfileClaimed: false,
    liveRuntime: true,
    selfCertified: false
  };
  return freeze({ ...core, semanticFingerprint: semanticHash(core) });
}

function validateRuntimeObservation(observation, schedulerGeneration) {
  const code = 'G05S_RUNTIME_OBSERVATION_INVALID';
  if (!observation || observation.schemaVersion !== 'vexlife.g05s.windows-live-runtime-observation/v1' || observation.liveRuntime !== true ||
      observation.selfCertified !== false || observation.sourceRef !== G05_LIVE_RUNTIME_SOURCE_REF || observation.sourceHash !== G05_LIVE_RUNTIME_SOURCE_HASH ||
      observation.authorityRef !== G05_LIVE_RUNTIME_AUTHORITY_REF || observation.workerRef !== G05_LIVE_RUNTIME_WORKER_REF ||
      observation.evidenceClass !== G05_LIVE_RUNTIME_EVIDENCE_CLASS || observation.currentHostMatchesVictorProfileClaimed !== false ||
      observation.logicalSupervisorState !== 'FAIL_CLOSED_UNOBSERVED_NO_NATIVE_SUPERVISOR') {
    fail(code, 'G05 live runtime observation identity is invalid');
  }
  canonicalTimestamp(observation.observedAt, 'runtimeObservation.observedAt', code);
  if (observation.resourceSnapshot?.generation !== schedulerGeneration || observation.trustSnapshot?.schedulerGeneration !== schedulerGeneration ||
      observation.resourceSnapshot?.sourceHash !== G05_LIVE_RUNTIME_SOURCE_HASH || observation.trustSnapshot?.sourceHash !== G05_LIVE_RUNTIME_SOURCE_HASH ||
      observation.resourceSnapshot?.observedAt !== observation.observedAt || observation.trustSnapshot?.observedAt !== observation.observedAt ||
      observation.trustSnapshot?.resourceSnapshotFingerprint !== observation.resourceSnapshot?.semanticFingerprint) {
    fail(code, 'G05 live runtime observation generation/source/resource bindings are not exact');
  }
  const core = clone(observation);
  delete core.semanticFingerprint;
  if (observation.semanticFingerprint !== semanticHash(core)) fail(code, 'G05 live runtime observation semantic fingerprint mismatch');
  return observation;
}

function validateFrontier(frontier) {
  exactKeys(frontier, FRONTIER_FIELDS, 'G05S_FRONTIER_INVALID', 'source frontier');
  for (const field of FRONTIER_FIELDS) if (frontier[field] !== null) assertSha(frontier[field], `frontier.${field}`, 'G05S_FRONTIER_INVALID');
  for (const required of FRONTIER_FIELDS.slice(0, 3)) assertSha(frontier[required], `frontier.${required}`, 'G05S_FRONTIER_INVALID');
  return clone(frontier);
}

function validatePolicyBinding(policyBinding) {
  const code = 'G05S_POLICY_BINDING_INVALID';
  exactKeys(policyBinding, [
    'schemaVersion','invocationClass','policyRef','policySha256','policyHeadSha256','policyGeneration','standingScope','standingScopeFingerprint'
  ], code, 'G05 scheduled policy binding');
  if (policyBinding.schemaVersion !== 'vexlife.g05s.scheduled-policy-binding/v1' || policyBinding.invocationClass !== 'SCHEDULED_G05A' ||
      !Number.isSafeInteger(policyBinding.policyGeneration) || policyBinding.policyGeneration < 0) {
    fail(code, 'G05 scheduled policy binding identity/generation is invalid');
  }
  safeRef(policyBinding.policyRef, 'policyBinding.policyRef', code);
  assertSha(policyBinding.policySha256, 'policyBinding.policySha256', code);
  assertSha(policyBinding.policyHeadSha256, 'policyBinding.policyHeadSha256', code);
  const scopeFingerprint = buildG05StandingScopeFingerprint(policyBinding.standingScope);
  if (scopeFingerprint !== policyBinding.standingScopeFingerprint) fail(code, 'G05 scheduled policy binding scope fingerprint mismatch');
  return policyBinding;
}

function formG05ScheduledAdmissionProvenance({
  standingAuthority,
  runtimeObservation,
  policyBinding,
  sourceFrontier
}) {
  const policy = validatePolicyBinding(policyBinding);
  const runtime = validateRuntimeObservation(runtimeObservation, policy.policyGeneration);
  if (!standingAuthority || standingAuthority.schemaVersion !== 'vexlife.g05s.current-standing-authority/v1' || standingAuthority.selfCertified !== false ||
      standingAuthority.contractRef !== G05_STANDING_AUTHORITY_CONTRACT_REF || standingAuthority.scopeFingerprint !== policy.standingScopeFingerprint ||
      standingAuthority.observedAt !== runtime.observedAt || !POSITIVE.has(standingAuthority.disposition)) {
    fail('G05S_STANDING_AUTHORITY_MISMATCH', 'scheduled provenance standing authority is not exact-current to policy/runtime');
  }
  const frontier = validateFrontier(sourceFrontier);
  const core = {
    schemaVersion: 'vexlife.g05s.scheduled-admission-provenance/v1',
    contractRef: G05_SCHEDULED_ADMISSION_CONTRACT_REF,
    invocationClass: 'SCHEDULED_G05A',
    standingAuthorityContractRef: G05_STANDING_AUTHORITY_CONTRACT_REF,
    standingAuthorityHeadSha256: standingAuthority.currentAuthorityHeadSha256,
    standingAuthorityGeneration: standingAuthority.currentAuthorityGeneration,
    standingConsentRef: standingAuthority.standingConsentRef,
    standingConsentSha256: standingAuthority.standingConsentSha256,
    standingAuthorityRef: standingAuthority.authorityRef,
    standingAuthoritySha256: standingAuthority.authoritySha256,
    standingScopeFingerprint: standingAuthority.scopeFingerprint,
    policyRef: policy.policyRef,
    policySha256: policy.policySha256,
    policyHeadSha256: policy.policyHeadSha256,
    policyGeneration: policy.policyGeneration,
    runtimeObservationFingerprint: runtime.semanticFingerprint,
    runtimeTrustSnapshotRef: runtime.trustSnapshot.snapshotRef,
    runtimeTrustSnapshotFingerprint: runtime.trustSnapshot.semanticFingerprint,
    resourceSnapshotRef: runtime.resourceSnapshot.snapshotRef,
    resourceSnapshotFingerprint: runtime.resourceSnapshot.semanticFingerprint,
    runtimeSourceRef: runtime.sourceRef,
    runtimeSourceHash: runtime.sourceHash,
    runtimeAuthorityRef: runtime.authorityRef,
    runtimeWorkerRef: runtime.workerRef,
    observedAt: runtime.observedAt,
    resourceAdmissionState: runtime.resourceAdmission.state,
    resourceAdmissionFingerprint: runtime.resourceAdmission.semanticFingerprint,
    sourceFrontier: frontier,
    manualG03OneShotAuthorityAccepted: false,
    actualDreamInvocationPerformed: false,
    externalEffectAuthorityGranted: false,
    nativeSupervisorInstalled: false
  };
  const provenanceRef = `g05s-scheduled-admission.${semanticHash(core).slice(0, 32)}`;
  const provenanceSha256 = semanticHash({ ...core, provenanceRef });
  return freeze({ ...core, provenanceRef, provenanceSha256 });
}

export function validateG05ScheduledAdmissionProvenance(provenance, context) {
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
    fail('G05S_SCHEDULED_PROVENANCE_INVALID', 'scheduled admission provenance is missing');
  }
  const expected = formG05ScheduledAdmissionProvenance(context);
  if (provenance.provenanceRef !== expected.provenanceRef || provenance.provenanceSha256 !== expected.provenanceSha256 ||
      semanticHash(provenance) !== semanticHash(expected)) {
    fail('G05S_SCHEDULED_PROVENANCE_INVALID', 'scheduled admission provenance differs from exact current Safety/runtime/policy/frontier bindings');
  }
  return provenance;
}

export async function resolveCurrentG05ScheduledAdmission({
  home,
  humanSubjectRef,
  companionLineageRef,
  threadRef,
  policyBinding,
  sourceFrontier
}) {
  const policy = validatePolicyBinding(policyBinding);
  const runtimeObservation = await observeWindowsG05Runtime({ schedulerGeneration: policy.policyGeneration });
  const standingAuthority = resolveCurrentG05StandingAuthority({
    home,
    humanSubjectRef,
    companionLineageRef,
    threadRef,
    expectedScope: policy.standingScope,
    observedAt: runtimeObservation.observedAt
  });
  const provenance = formG05ScheduledAdmissionProvenance({ standingAuthority, runtimeObservation, policyBinding: policy, sourceFrontier });
  return freeze({
    schemaVersion: 'vexlife.g05s.current-scheduled-admission/v1',
    state: runtimeObservation.resourceAdmission.state === 'ADMITTED' ? 'CURRENT_ADMISSION_EVIDENCE_FORMED' : 'HELD_RUNTIME_RESOURCE_OR_INTERACTIVE_STATE',
    standingAuthority,
    runtimeObservation,
    provenance,
    livePositiveStandingConsent: true,
    actualDreamInvocationPerformed: false,
    nativeSupervisorInstalled: false
  });
}

// [VXG RealForever]
