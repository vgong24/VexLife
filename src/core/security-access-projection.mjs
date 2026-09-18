const INPUT_KEYS = new Set(['runtimeState', 'previewVisible']);

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

function allFalseEffects() {
  return Object.freeze(Object.fromEntries(SECURITY_ACCESS_EFFECT_FIELDS.map((field) => [field, false])));
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
  return { runtimeState, previewVisible };
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
