import { SECURITY_ACCESS_EFFECT_FIELDS } from './security-access-projection.mjs';

export const SECURITY_ACCESS_CONVERGENCE_SCHEMA = 'vexlife.security-access-convergence/v1';
export const SECURITY_ACCESS_OWNER_SNAPSHOT_SCHEMA = 'vexlife.security-access-owner-snapshot/v1';

export const SECURITY_ACCESS_CONVERGENCE_STATES = Object.freeze([
  'CURRENT', 'STALE', 'UNKNOWN', 'COMPROMISED', 'RECOVERY_REQUIRED', 'HELD'
]);

export const SECURITY_ACCESS_OWNER_REFS = Object.freeze({
  DEVICE_ACCESS: 'github.issue.vextreme-sdk.717',
  SESSION_SECURITY: 'github.issue.vexlife.492',
  RECOVERY_POLICY: 'github.issue.vextreme-sdk.232'
});

const INPUT_KEYS = new Set(['homeRef', 'principalRef', 'deviceAccess', 'sessionSecurity', 'recoveryPolicy']);
const SNAPSHOT_KEYS = new Set([
  'schemaVersion', 'ownerClass', 'ownerRef', 'homeRef', 'principalRef', 'state',
  'sourceRef', 'currentnessRef', 'reasonRefs', 'facts'
]);
const FORBIDDEN_RAW_KEYS = new Set([
  'privateKey', 'privateKeyRef', 'devicePublicKey', 'secret', 'secretRef', 'token',
  'accessToken', 'refreshToken', 'bearer', 'bearerHandle', 'sessionRef', 'sessionHandle',
  'totpSeed', 'otpCode', 'emailOtpCode', 'recoveryKey', 'recoverySecret',
  'credentialMaterial', 'membershipHash', 'leaseHash', 'approvedBy', 'approvedAt',
  'issuedAt', 'expiresAt'
]);

const FACT_KEYS = Object.freeze({
  DEVICE_ACCESS: new Set([
    'trustedDeviceRefs', 'compromisedDeviceRefs', 'capabilityRefs',
    'revocationGenerationRefOrNull', 'recoveryPorchStateOrNull'
  ]),
  SESSION_SECURITY: new Set([
    'currentSessionCountOrNull', 'affectedDeviceRefOrNull', 'affectedScopeRefOrNull',
    'generationInvalidationObservedOrNull'
  ]),
  RECOVERY_POLICY: new Set([
    'compromiseStateOrNull', 'availableFactorClassRefs', 'recoveryDispositionOrNull',
    'recoveredOwnerStateOrNull', 'humanChoiceRequired'
  ])
});

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isRef = (value) => typeof value === 'string' && value.length > 0;
const isNullableRef = (value) => value === null || isRef(value);
const isCountOrNull = (value) => value === null || (Number.isSafeInteger(value) && value >= 0);

function exactKeys(value, allowed, label) {
  if (!isObject(value)) throw new TypeError(`${label} must be an object`);
  const extra = Object.keys(value).filter((key) => !allowed.has(key));
  if (extra.length) throw new Error(`${label} rejects unregistered field ${extra[0]}`);
  for (const key of allowed) if (!Object.hasOwn(value, key)) throw new Error(`${label} missing field ${key}`);
}

function uniqueRefs(value, label) {
  if (!Array.isArray(value) || new Set(value).size !== value.length || value.some((item) => !isRef(item))) {
    throw new TypeError(`${label} must be unique non-empty refs`);
  }
  return Object.freeze([...value]);
}

function rejectRawAuthority(value, path = 'snapshot') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectRawAuthority(item, `${path}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_RAW_KEYS.has(key)) throw new Error(`${path} contains forbidden raw authority field ${key}`);
    rejectRawAuthority(nested, `${path}.${key}`);
  }
}

function validateFacts(ownerClass, facts) {
  const allowed = FACT_KEYS[ownerClass];
  exactKeys(facts, allowed, `${ownerClass} facts`);
  if (ownerClass === 'DEVICE_ACCESS') {
    return Object.freeze({
      trustedDeviceRefs: uniqueRefs(facts.trustedDeviceRefs, 'trustedDeviceRefs'),
      compromisedDeviceRefs: uniqueRefs(facts.compromisedDeviceRefs, 'compromisedDeviceRefs'),
      capabilityRefs: uniqueRefs(facts.capabilityRefs, 'capabilityRefs'),
      revocationGenerationRefOrNull: isNullableRef(facts.revocationGenerationRefOrNull)
        ? facts.revocationGenerationRefOrNull : (() => { throw new TypeError('revocationGenerationRefOrNull is invalid'); })(),
      recoveryPorchStateOrNull: isNullableRef(facts.recoveryPorchStateOrNull)
        ? facts.recoveryPorchStateOrNull : (() => { throw new TypeError('recoveryPorchStateOrNull is invalid'); })()
    });
  }
  if (ownerClass === 'SESSION_SECURITY') {
    if (!isCountOrNull(facts.currentSessionCountOrNull)) throw new TypeError('currentSessionCountOrNull is invalid');
    if (!isNullableRef(facts.affectedDeviceRefOrNull)) throw new TypeError('affectedDeviceRefOrNull is invalid');
    if (!isNullableRef(facts.affectedScopeRefOrNull)) throw new TypeError('affectedScopeRefOrNull is invalid');
    if (![true, false, null].includes(facts.generationInvalidationObservedOrNull)) {
      throw new TypeError('generationInvalidationObservedOrNull is invalid');
    }
    return Object.freeze({ ...facts });
  }
  if (ownerClass === 'RECOVERY_POLICY') {
    if (!isNullableRef(facts.compromiseStateOrNull)) throw new TypeError('compromiseStateOrNull is invalid');
    if (!isNullableRef(facts.recoveryDispositionOrNull)) throw new TypeError('recoveryDispositionOrNull is invalid');
    if (!isNullableRef(facts.recoveredOwnerStateOrNull)) throw new TypeError('recoveredOwnerStateOrNull is invalid');
    if (typeof facts.humanChoiceRequired !== 'boolean') throw new TypeError('humanChoiceRequired must be boolean');
    return Object.freeze({
      ...facts,
      availableFactorClassRefs: uniqueRefs(facts.availableFactorClassRefs, 'availableFactorClassRefs')
    });
  }
  throw new Error(`Unknown owner class ${ownerClass}`);
}

function validateOwnerSnapshot(value, ownerClass, homeRef, principalRef) {
  if (value === null) return null;
  exactKeys(value, SNAPSHOT_KEYS, `${ownerClass} snapshot`);
  rejectRawAuthority(value, `${ownerClass} snapshot`);
  if (value.schemaVersion !== SECURITY_ACCESS_OWNER_SNAPSHOT_SCHEMA) throw new Error(`${ownerClass} schema drift`);
  if (value.ownerClass !== ownerClass) throw new Error(`${ownerClass} ownerClass drift`);
  if (value.ownerRef !== SECURITY_ACCESS_OWNER_REFS[ownerClass]) throw new Error(`${ownerClass} ownerRef drift`);
  if (value.homeRef !== homeRef || value.principalRef !== principalRef) throw new Error(`${ownerClass} identity binding drift`);
  if (!SECURITY_ACCESS_CONVERGENCE_STATES.includes(value.state)) throw new Error(`${ownerClass} state is invalid`);
  if (!isRef(value.sourceRef) || !isRef(value.currentnessRef)) throw new Error(`${ownerClass} source/currentness ref is invalid`);
  const reasonRefs = uniqueRefs(value.reasonRefs, `${ownerClass} reasonRefs`);
  const facts = validateFacts(ownerClass, value.facts);
  return Object.freeze({ ...value, reasonRefs, facts });
}

function allFalseEffects() {
  return Object.freeze(Object.fromEntries(SECURITY_ACCESS_EFFECT_FIELDS.map((field) => [field, false])));
}

function selectedState(snapshots, missingOwnerRefs) {
  const states = snapshots.filter(Boolean).map((snapshot) => snapshot.state);
  if (states.includes('COMPROMISED')) return 'COMPROMISED';
  if (states.includes('RECOVERY_REQUIRED')) return 'RECOVERY_REQUIRED';
  if (missingOwnerRefs.length > 0 || states.includes('HELD')) return 'HELD';
  if (states.includes('STALE')) return 'STALE';
  if (states.includes('UNKNOWN')) return 'UNKNOWN';
  return 'CURRENT';
}

function uniqueSorted(values) {
  return Object.freeze([...new Set(values)].sort());
}

export function projectSecurityAccessConvergence(input = {}) {
  exactKeys(input, INPUT_KEYS, 'Security & Access convergence input');
  if (!isRef(input.homeRef)) throw new TypeError('homeRef must be a non-empty reference');
  if (!isRef(input.principalRef)) throw new TypeError('principalRef must be a non-empty reference');

  const deviceAccess = validateOwnerSnapshot(input.deviceAccess, 'DEVICE_ACCESS', input.homeRef, input.principalRef);
  const sessionSecurity = validateOwnerSnapshot(input.sessionSecurity, 'SESSION_SECURITY', input.homeRef, input.principalRef);
  const recoveryPolicy = validateOwnerSnapshot(input.recoveryPolicy, 'RECOVERY_POLICY', input.homeRef, input.principalRef);
  const snapshots = [deviceAccess, sessionSecurity, recoveryPolicy];
  const missingOwnerRefs = uniqueSorted([
    deviceAccess ? null : SECURITY_ACCESS_OWNER_REFS.DEVICE_ACCESS,
    sessionSecurity ? null : SECURITY_ACCESS_OWNER_REFS.SESSION_SECURITY,
    recoveryPolicy ? null : SECURITY_ACCESS_OWNER_REFS.RECOVERY_POLICY
  ].filter(Boolean));

  const present = snapshots.filter(Boolean);
  const state = selectedState(present, missingOwnerRefs);
  const effects = allFalseEffects();

  return Object.freeze({
    schemaVersion: SECURITY_ACCESS_CONVERGENCE_SCHEMA,
    truthClass: 'FAMILY_SECURITY_CONTRACT_BOUND_CONSUMER_PROJECTION',
    homeRef: input.homeRef,
    principalRef: input.principalRef,
    state,
    sourceOwnerRefs: uniqueSorted(present.map((snapshot) => snapshot.ownerRef)),
    sourceRefs: uniqueSorted(present.map((snapshot) => snapshot.sourceRef)),
    currentnessRefs: uniqueSorted(present.map((snapshot) => snapshot.currentnessRef)),
    reasonRefs: uniqueSorted(present.flatMap((snapshot) => snapshot.reasonRefs)),
    missingOwnerRefs,
    deviceAccess: deviceAccess?.facts ?? null,
    sessionSecurity: sessionSecurity?.facts ?? null,
    recoveryPolicy: recoveryPolicy?.facts ?? null,
    realIntegrationComplete: missingOwnerRefs.length === 0 && present.every((snapshot) => snapshot.state === 'CURRENT'),
    effectAuthorityRefs: Object.freeze([]),
    effectAuthorityGranted: false,
    effects
  });
}

// [VXG RealForever]
