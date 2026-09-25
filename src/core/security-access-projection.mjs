const INPUT_KEYS = new Set(['runtimeState', 'previewVisible', 'convergenceProjection']);

const CONVERGENCE_SCHEMA = 'vexlife.security-access-convergence/v1';
const CONVERGENCE_TRUTH_CLASS = 'FAMILY_SECURITY_CONTRACT_BOUND_CONSUMER_PROJECTION';
const CONVERGENCE_STATES = new Set([
  'CURRENT', 'STALE', 'UNKNOWN', 'COMPROMISED', 'RECOVERY_REQUIRED', 'HELD'
]);
const CONVERGENCE_OWNER_REFS = Object.freeze([
  'github.issue.vexlife.492',
  'github.issue.vextreme-sdk.232',
  'github.issue.vextreme-sdk.717'
]);
const CONVERGENCE_KEYS = new Set([
  'schemaVersion', 'truthClass', 'homeRef', 'principalRef', 'state',
  'sourceOwnerRefs', 'sourceRefs', 'currentnessRefs', 'reasonRefs', 'missingOwnerRefs',
  'deviceAccess', 'sessionSecurity', 'recoveryPolicy', 'realIntegrationComplete',
  'effectAuthorityRefs', 'effectAuthorityGranted', 'effects'
]);
const DEVICE_ACCESS_KEYS = new Set([
  'trustedDeviceRefs', 'compromisedDeviceRefs', 'capabilityRefs',
  'revocationGenerationRefOrNull', 'recoveryPorchStateOrNull'
]);
const SESSION_SECURITY_KEYS = new Set([
  'currentSessionCountOrNull', 'affectedDeviceRefOrNull', 'affectedScopeRefOrNull',
  'generationInvalidationObservedOrNull'
]);
const RECOVERY_POLICY_KEYS = new Set([
  'compromiseStateOrNull', 'availableFactorClassRefs', 'recoveryDispositionOrNull',
  'recoveredOwnerStateOrNull', 'humanChoiceRequired'
]);

export const SECURITY_ACCESS_EFFECT_FIELDS = Object.freeze([
  'realPasskeyRegistration','realWebAuthnEffect','realTOTPEnrollment','totpSecretStorage',
  'realAndroidPairing','realIOSPairing','credentialGeneration','credentialImport',
  'credentialSerialization','privateKeyAccess','recoveryKeyMutation','sessionRevocation',
  'capabilityLeaseGrant','revocationGenerationMutation','networkListenerOrExposure',
  'remoteHomeWrite','homeMutation','memoryMutation','friendRelationshipMutation',
  'providerEffect','modelRuntimeEffect','training','modelActivation','publication','publicSearch'
]);

const statusStringRef = (runtimeState) =>
  runtimeState === 'BACKEND_UNAVAILABLE'
    ? 'security-access.status.backend-unavailable'
    : 'security-access.status.preview';

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const ref = (value) => typeof value === 'string' && value.length > 0;
const nullableRef = (value) => value === null || ref(value);
const countOrNull = (value) => value === null || (Number.isSafeInteger(value) && value >= 0);

function exactKeys(value, allowed, label) {
  if (!object(value)) throw new TypeError(`${label} must be an object`);
  const keys = Object.keys(value);
  const extra = keys.filter((key) => !allowed.has(key));
  if (extra.length) throw new Error(`${label} rejects unregistered field ${extra[0]}`);
  for (const key of allowed) if (!Object.hasOwn(value, key)) throw new Error(`${label} missing field ${key}`);
}

function uniqueRefs(values, label) {
  if (!Array.isArray(values) || new Set(values).size !== values.length || values.some((value) => !ref(value))) {
    throw new TypeError(`${label} must be unique non-empty refs`);
  }
  return Object.freeze([...values].sort());
}

function allFalseEffects() {
  return Object.freeze(Object.fromEntries(SECURITY_ACCESS_EFFECT_FIELDS.map((field) => [field, false])));
}

function heldConvergenceSummary() {
  return Object.freeze({
    state: 'HELD',
    sourceProjectionAvailable: false,
    trustedDeviceCountOrNull: null,
    compromisedDeviceCountOrNull: null,
    capabilityRefCountOrNull: null,
    currentSessionCountOrNull: null,
    recoveryDispositionOrNull: null,
    humanChoiceRequiredOrNull: null,
    sourceOwnerRefs: Object.freeze([]),
    sourceRefs: Object.freeze([]),
    currentnessRefs: Object.freeze([]),
    reasonRefs: Object.freeze([]),
    missingOwnerRefs: Object.freeze([]),
    realIntegrationComplete: false,
    effectAuthorityGranted: false
  });
}

function validateDeviceAccess(value) {
  if (value === null) return null;
  exactKeys(value, DEVICE_ACCESS_KEYS, 'Security & Access device convergence facts');
  return Object.freeze({
    trustedDeviceRefs: uniqueRefs(value.trustedDeviceRefs, 'trustedDeviceRefs'),
    compromisedDeviceRefs: uniqueRefs(value.compromisedDeviceRefs, 'compromisedDeviceRefs'),
    capabilityRefs: uniqueRefs(value.capabilityRefs, 'capabilityRefs'),
    revocationGenerationRefOrNull: nullableRef(value.revocationGenerationRefOrNull)
      ? value.revocationGenerationRefOrNull
      : (() => { throw new TypeError('revocationGenerationRefOrNull is invalid'); })(),
    recoveryPorchStateOrNull: nullableRef(value.recoveryPorchStateOrNull)
      ? value.recoveryPorchStateOrNull
      : (() => { throw new TypeError('recoveryPorchStateOrNull is invalid'); })()
  });
}

function validateSessionSecurity(value) {
  if (value === null) return null;
  exactKeys(value, SESSION_SECURITY_KEYS, 'Security & Access session convergence facts');
  if (!countOrNull(value.currentSessionCountOrNull)) throw new TypeError('currentSessionCountOrNull is invalid');
  if (!nullableRef(value.affectedDeviceRefOrNull)) throw new TypeError('affectedDeviceRefOrNull is invalid');
  if (!nullableRef(value.affectedScopeRefOrNull)) throw new TypeError('affectedScopeRefOrNull is invalid');
  if (![true, false, null].includes(value.generationInvalidationObservedOrNull)) {
    throw new TypeError('generationInvalidationObservedOrNull is invalid');
  }
  return Object.freeze({ ...value });
}

function validateRecoveryPolicy(value) {
  if (value === null) return null;
  exactKeys(value, RECOVERY_POLICY_KEYS, 'Security & Access recovery convergence facts');
  if (!nullableRef(value.compromiseStateOrNull)) throw new TypeError('compromiseStateOrNull is invalid');
  if (!nullableRef(value.recoveryDispositionOrNull)) throw new TypeError('recoveryDispositionOrNull is invalid');
  if (!nullableRef(value.recoveredOwnerStateOrNull)) throw new TypeError('recoveredOwnerStateOrNull is invalid');
  if (typeof value.humanChoiceRequired !== 'boolean') throw new TypeError('humanChoiceRequired must be boolean');
  return Object.freeze({
    ...value,
    availableFactorClassRefs: uniqueRefs(value.availableFactorClassRefs, 'availableFactorClassRefs')
  });
}

function normalizeConvergenceProjection(value) {
  if (value == null) return heldConvergenceSummary();
  exactKeys(value, CONVERGENCE_KEYS, 'Security & Access convergence projection');
  if (value.schemaVersion !== CONVERGENCE_SCHEMA) throw new Error('Security & Access convergence schema drift');
  if (value.truthClass !== CONVERGENCE_TRUTH_CLASS) throw new Error('Security & Access convergence truth class drift');
  if (!ref(value.homeRef) || !ref(value.principalRef)) throw new Error('Security & Access convergence identity is invalid');
  if (!CONVERGENCE_STATES.has(value.state)) throw new Error('Security & Access convergence state is invalid');

  const sourceOwnerRefs = uniqueRefs(value.sourceOwnerRefs, 'sourceOwnerRefs');
  const sourceRefs = uniqueRefs(value.sourceRefs, 'sourceRefs');
  const currentnessRefs = uniqueRefs(value.currentnessRefs, 'currentnessRefs');
  const reasonRefs = uniqueRefs(value.reasonRefs, 'reasonRefs');
  const missingOwnerRefs = uniqueRefs(value.missingOwnerRefs, 'missingOwnerRefs');

  const deviceAccess = validateDeviceAccess(value.deviceAccess);
  const sessionSecurity = validateSessionSecurity(value.sessionSecurity);
  const recoveryPolicy = validateRecoveryPolicy(value.recoveryPolicy);

  if (!Array.isArray(value.effectAuthorityRefs) || value.effectAuthorityRefs.length !== 0) {
    throw new Error('Security & Access convergence effect authority refs must remain empty');
  }
  if (value.effectAuthorityGranted !== false) {
    throw new Error('Security & Access convergence effect authority must remain false');
  }
  exactKeys(value.effects, new Set(SECURITY_ACCESS_EFFECT_FIELDS), 'Security & Access convergence effects');
  if (Object.values(value.effects).some((effect) => effect !== false)) {
    throw new Error('Security & Access convergence effects must remain false');
  }
  if (typeof value.realIntegrationComplete !== 'boolean') {
    throw new TypeError('Security & Access convergence realIntegrationComplete must be boolean');
  }
  const exactOwnerSet = sourceOwnerRefs.length === CONVERGENCE_OWNER_REFS.length
    && sourceOwnerRefs.every((ownerRef, index) => ownerRef === CONVERGENCE_OWNER_REFS[index]);
  const expectedRealIntegrationComplete = value.state === 'CURRENT'
    && missingOwnerRefs.length === 0
    && deviceAccess !== null
    && sessionSecurity !== null
    && recoveryPolicy !== null
    && exactOwnerSet
    && sourceRefs.length === 3
    && currentnessRefs.length === 3;
  if (value.realIntegrationComplete !== expectedRealIntegrationComplete) {
    throw new Error('Security & Access convergence real integration truth is inconsistent');
  }

  return Object.freeze({
    state: value.state,
    sourceProjectionAvailable: true,
    trustedDeviceCountOrNull: deviceAccess ? deviceAccess.trustedDeviceRefs.length : null,
    compromisedDeviceCountOrNull: deviceAccess ? deviceAccess.compromisedDeviceRefs.length : null,
    capabilityRefCountOrNull: deviceAccess ? deviceAccess.capabilityRefs.length : null,
    currentSessionCountOrNull: sessionSecurity?.currentSessionCountOrNull ?? null,
    recoveryDispositionOrNull: recoveryPolicy?.recoveryDispositionOrNull ?? null,
    humanChoiceRequiredOrNull: recoveryPolicy?.humanChoiceRequired ?? null,
    sourceOwnerRefs,
    sourceRefs,
    currentnessRefs,
    reasonRefs,
    missingOwnerRefs,
    realIntegrationComplete: value.realIntegrationComplete,
    effectAuthorityGranted: false
  });
}

export function validateSecurityAccessRegistry(registry) {
  if (registry?.schemaVersion !== 'vexlife.security-access-preview/v1') throw new Error('Security & Access registry schema drift');
  if (registry.registryRef !== 'registry.vexlife.security-access-preview.001') throw new Error('Security & Access registry identity drift');
  if (registry.featureRef !== 'feature.vexlife.security-access') throw new Error('Security & Access feature identity drift');
  if (registry.androidFirst !== true || registry.iPhoneRequired !== false) throw new Error('Security & Access Android-first boundary drift');
  if (registry.projection?.stateRef !== 'state.health' || registry.projection?.ownerRef !== 'service.health') throw new Error('Security & Access must reuse Health state ownership');
  if (registry.flag?.flagRef !== 'flag.vexlife.security-access.preview') throw new Error('Security & Access preview flag identity drift');
  if (registry.flag?.securityPolicyAuthority !== false) throw new Error('Security & Access preview flag must explicitly hold security-policy authority false');
  const executable = new Set(registry.executableFirstSliceStates ?? []);
  if (executable.size !== 2 || !executable.has('PREVIEW_ONLY') || !executable.has('BACKEND_UNAVAILABLE')) throw new Error('Security & Access first-slice executable state drift');
  if (!Array.isArray(registry.heldActions) || registry.heldActions.length !== 8 || registry.heldActions.some((item) => item.enabled !== false)) throw new Error('Security & Access held action contract drift');
  const protectedEffects = new Set(registry.protectedEffects ?? []);
  for (const field of SECURITY_ACCESS_EFFECT_FIELDS) if (!protectedEffects.has(field)) throw new Error(`Security & Access protected effect missing ${field}`);
  return registry;
}

function normalizeInput(registry, input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Security & Access projection input must be an object');
  const extra = Object.keys(input).filter((key) => !INPUT_KEYS.has(key));
  if (extra.length) throw new Error(`Security & Access projection rejects unregistered input field ${extra[0]}`);
  const runtimeState = input.runtimeState ?? 'BACKEND_UNAVAILABLE';
  if (!(registry.executableFirstSliceStates ?? []).includes(runtimeState)) throw new Error(`Security & Access state ${runtimeState} is held outside the first slice`);
  const previewVisible = input.previewVisible ?? registry.flag.safeDefault === 'FLAG_VISIBLE_PREVIEW';
  if (typeof previewVisible !== 'boolean') throw new TypeError('Security & Access previewVisible must be boolean');
  return {
    runtimeState,
    previewVisible,
    convergence: normalizeConvergenceProjection(input.convergenceProjection ?? null)
  };
}

export function projectSecurityAccessPreview(registry, input = {}) {
  validateSecurityAccessRegistry(registry);
  const normalized = normalizeInput(registry, input);
  const effects = allFalseEffects();
  return Object.freeze({
    schemaVersion: 'vexlife.security-access-preview-projection/v1',
    featureRef: registry.featureRef,
    truthClass: registry.projection.truthClass,
    stateRef: registry.projection.stateRef,
    ownerRef: registry.projection.ownerRef,
    runtimeState: normalized.runtimeState,
    previewVisible: normalized.previewVisible,
    androidFirst: true,
    iPhoneRequired: false,
    statusStringRef: statusStringRef(normalized.runtimeState),
    trustedDevicesState: 'NO_RUNTIME_DATA_AVAILABLE',
    recoveryState: 'NOT_CONFIGURED_HERE',
    ownerConvergence: normalized.convergence,
    heldActions: Object.freeze(registry.heldActions.map((item) => Object.freeze({
      actionKey: item.actionKey,
      labelStringRef: item.labelStringRef,
      reasonStringRef: item.reasonStringRef,
      enabled: false,
      effectPerformed: false
    }))),
    effects
  });
}

export function createSecurityAccessRuntimeBridge(registry, input = {}) {
  const projection = projectSecurityAccessPreview(registry, input);
  return Object.freeze({
    schemaVersion: 'vexlife.security-access-preview-runtime-bridge/v1',
    state: projection.runtimeState,
    truthClass: projection.truthClass,
    projection,
    authenticationPerformed: false,
    authorizationPerformed: false,
    protectedEffectPerformed: false,
    effects: projection.effects
  });
}

// [VXG RealForever]
