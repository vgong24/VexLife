const INPUT_KEYS = new Set(['connectionState']);

export const ANDROID_REMOTE_VESSEL_EFFECT_FIELDS = Object.freeze([
  'pairingOfferCreation','pairingApproval','deviceMembershipMutation','authentication','authorization',
  'capabilityLeaseIssuance','capabilityLeaseRenewal','revocationMutation','realTransportConnection',
  'networkListenerOrExposure','homeRead','homeWrite','homeMutation','memoryMutation','friendMutation',
  'credentialEffect','rawModelEndpointExposure','providerEffect','modelRuntimeEffect','training','activation','publication'
]);

function allFalseEffects() {
  return Object.freeze(Object.fromEntries(ANDROID_REMOTE_VESSEL_EFFECT_FIELDS.map((field) => [field, false])));
}

function exactSet(values) {
  return new Set(Array.isArray(values) ? values : []);
}

export function validateAndroidRemoteVesselRegistry(registry, homeBridge) {
  if (registry?.schemaVersion !== 'vexlife.android-remote-vessel-reference/v1') throw new Error('Android Remote Vessel registry schema drift');
  if (registry.registryRef !== 'registry.vexlife.android-remote-vessel.001') throw new Error('Android Remote Vessel registry identity drift');
  if (registry.featureRef !== 'feature.vexlife.security-access') throw new Error('Android Remote Vessel must remain inside Security & Access');
  if (registry.homeBridgeRef !== homeBridge?.bridgeRef) throw new Error('Android Remote Vessel Home Bridge identity drift');
  if (registry.mode !== 'REMOTE_HOME' || !homeBridge?.modes?.includes('REMOTE_HOME')) throw new Error('Android Remote Vessel must consume canonical REMOTE_HOME mode');
  if (registry.androidFirst !== true || registry.iPhoneRequired !== false) throw new Error('Android Remote Vessel Android-first boundary drift');
  if (registry.projection?.stateRef !== 'state.health' || registry.projection?.ownerRef !== 'service.health' || registry.projection?.regionRef !== 'region.health.security-access') throw new Error('Android Remote Vessel must reuse Security & Access Health ownership');
  if (registry.browserRuntimeState !== 'UNPAIRED') throw new Error('Android Remote Vessel reference must start UNPAIRED');
  if (registry.canonicalWriter !== 'DESKTOP_HOME_NODE' || registry.remoteWriterGranted !== false) throw new Error('Android Remote Vessel must preserve desktop Home writer');
  if (registry.implicitAdmin !== false || registry.rawModelEndpointExposed !== false) throw new Error('Android Remote Vessel implicit-admin/model boundary drift');

  const canonical = exactSet(homeBridge?.connectionStates);
  const executable = exactSet(registry.executableFirstSliceStates);
  const held = exactSet(registry.heldConnectedStates);
  if (!canonical.size) throw new Error('Home Bridge connection-state vocabulary unavailable');
  if (executable.has('CONNECTED_DIRECT') || executable.has('CONNECTED_RELAYED') || executable.has('PAIRING_APPROVED') || executable.has('LEASE_ACTIVE') || executable.has('PAIRING_OFFERED')) throw new Error('Android Remote Vessel first slice cannot execute paired/connected states');
  const declared = new Set([...executable, ...held]);
  if (declared.size !== canonical.size || [...canonical].some((state) => !declared.has(state))) throw new Error('Android Remote Vessel must reuse the exact Home Bridge connection-state vocabulary');

  const protectedEffects = exactSet(registry.protectedEffects);
  for (const field of ANDROID_REMOTE_VESSEL_EFFECT_FIELDS) if (!protectedEffects.has(field)) throw new Error(`Android Remote Vessel protected effect missing ${field}`);
  return registry;
}

function normalizeInput(registry, input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Android Remote Vessel projection input must be an object');
  const extra = Object.keys(input).filter((key) => !INPUT_KEYS.has(key));
  if (extra.length) throw new Error(`Android Remote Vessel rejects unregistered input field ${extra[0]}`);
  const connectionState = input.connectionState ?? registry.browserRuntimeState;
  if (!(registry.executableFirstSliceStates ?? []).includes(connectionState)) throw new Error(`Android Remote Vessel state ${connectionState} is held outside the first slice`);
  return { connectionState };
}

function statusStringRef(connectionState) {
  return connectionState === 'UNPAIRED'
    ? 'security-access.status.backend-unavailable'
    : 'security-access.status.preview';
}

export function projectAndroidRemoteVessel(registry, homeBridge, input = {}) {
  validateAndroidRemoteVesselRegistry(registry, homeBridge);
  const { connectionState } = normalizeInput(registry, input);
  const effects = allFalseEffects();
  return Object.freeze({
    schemaVersion: 'vexlife.android-remote-vessel-projection/v1',
    featureRef: registry.featureRef,
    bridgeRef: registry.homeBridgeRef,
    truthClass: registry.projection.truthClass,
    stateRef: registry.projection.stateRef,
    ownerRef: registry.projection.ownerRef,
    regionRef: registry.projection.regionRef,
    mode: registry.mode,
    connectionState,
    browserReference: connectionState === registry.browserRuntimeState,
    androidFirst: true,
    iPhoneRequired: false,
    statusStringRef: statusStringRef(connectionState),
    canonicalWriter: registry.canonicalWriter,
    remoteWriterGranted: false,
    authenticationState: 'NOT_GRANTED_BY_REFERENCE',
    authorizationState: 'NOT_GRANTED_BY_REFERENCE',
    capabilityLeaseState: 'NONE_GRANTED_BY_REFERENCE',
    activeHomeAccess: false,
    rawModelEndpointExposed: false,
    effects
  });
}

export function createAndroidRemoteVesselReferenceBridge(registry, homeBridge, input = {}) {
  const projection = projectAndroidRemoteVessel(registry, homeBridge, input);
  return Object.freeze({
    schemaVersion: 'vexlife.android-remote-vessel-reference-bridge/v1',
    state: projection.connectionState,
    projection,
    pairingPerformed: false,
    authenticationPerformed: false,
    authorizationPerformed: false,
    capabilityLeasePerformed: false,
    networkEffectPerformed: false,
    homeEffectPerformed: false,
    protectedEffectPerformed: false,
    effects: projection.effects
  });
}

// [VXG RealForever]
