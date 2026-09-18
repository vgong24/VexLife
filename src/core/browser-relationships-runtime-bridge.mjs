export const BROWSER_RELATIONSHIPS_RUNTIME_API_PATH = '/api/v1/relationships/runtime-plan';
export const BROWSER_RELATIONSHIPS_RUNTIME_MAX_BODY_BYTES = 16 * 1024;
export const RELATIONSHIPS_RUNTIME_PLAN_SCHEMA = 'vexlife.relationships-runtime-bridge-plan/v1';

export const ACCEPTED_RELATIONSHIPS_VISIBLE_MERGE = '03fc465287e12732899234a8ab1a25caf662e75c';
export const ACCEPTED_CDR_S5_PRODUCT_MERGE = '70a26e507e6fa96eafebd84d7942daf208961d69';
export const ACCEPTED_SDK_CDR_S5_MERGE = '73c6d77820d523dc01f459110b4a9b5500e68a57';
export const ACCEPTED_SDK_CDR_S5_COORDINATOR_PATH = 'apps/vex-interface/practicum/cdr-s5-single-pair-rehearsal.mjs';
export const ACCEPTED_SDK_CDR_S5_PROCEDURE_REF = 'procedure.cdr.s5.single-pair-rehearsal.001';
export const ACCEPTED_SDK_CDR_S5_POLICY_SHA256 = '877530dd6f50791c08c28a9f42afff79efff80c64c1e8583bda7c8020347e705';
export const ACCEPTED_SDK_S2_RUNTIME_PATH = 'apps/vex-interface/practicum/cdr-s2-lan-peer.mjs';
export const ACCEPTED_SDK_S2_ACCEPTANCE_REF = 'github.issue.vextreme-sdk.1070.comment.5377183669';
export const ACCEPTED_FRIEND_GROUP_MERGE = '51e3f5167bc49c13408a9047cd7c565940a31788';
export const ACCEPTED_REPLICA_RECONCILIATION_MERGE = '339fc53e6e63fef61e8b3d9153c7e160bb54f232';
export const ACCEPTED_SOCIAL_BRIDGE_COMPOSITION_MERGE = 'fa184ba313b4a483efd81dfbbe3d8e6f4b97aef5';

const REQUEST_KEYS = new Set([
  'alphaConsentAcknowledged',
  'invitationState',
  'invitationDecision',
  'identityState',
  'presenceClass',
  'routeClass',
  'failureState',
  'withdrawn',
  'revoked',
  'disconnected',
  'blocked',
  'localRelationshipFormed'
]);

const REQUIRED_CDR_INVITATION_STATES = Object.freeze([
  'NONE',
  'CREATED_LOCAL_REFERENCE',
  'RECEIVED_VERIFIED_REFERENCE',
  'RECEIVED_HELD_IDENTITY',
  'EXPIRED_OR_REVOKED'
]);
const REQUIRED_CDR_DECISIONS = Object.freeze(['ACCEPT', 'NARROW', 'DEFER', 'DENY', 'BLOCK']);
const REQUIRED_CDR_IDENTITY_STATES = Object.freeze([
  'VERIFIED_CURRENT',
  'WRONG_KEY',
  'SIGNATURE_INVALID',
  'STALE_EVIDENCE',
  'INVITATION_EXPIRED',
  'UNKNOWN'
]);
const REQUIRED_CDR_ROUTE_CLASSES = Object.freeze(['DIRECT_CANDIDATE', 'RELAYED', 'STORE_FORWARD', 'UNAVAILABLE']);
const REQUIRED_CDR_FAILURE_STATES = Object.freeze([
  'NONE',
  'IDENTITY_CHECK_FAILED',
  'PEER_UNREACHABLE',
  'RELAY_UNAVAILABLE',
  'MAILBOX_ONLY',
  'SESSION_EXPIRED',
  'UNKNOWN'
]);

const clone = (value) => JSON.parse(JSON.stringify(value));
const hasAll = (values, required) => Array.isArray(values) && required.every((value) => values.includes(value));
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export class BrowserRelationshipsRuntimeBridgeError extends Error {
  constructor(code, message, httpStatus = 500, internalCause = null) {
    super(message);
    this.name = 'BrowserRelationshipsRuntimeBridgeError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.internalCause = internalCause;
  }
}

function sourceError(message) {
  throw new BrowserRelationshipsRuntimeBridgeError(
    'RELATIONSHIPS_RUNTIME_SOURCE_NOT_CURRENT',
    message,
    503,
    null
  );
}

function requestError(message) {
  throw new BrowserRelationshipsRuntimeBridgeError(
    'RELATIONSHIPS_RUNTIME_REQUEST_NOT_ADMITTED',
    message,
    400,
    null
  );
}

export function validateRelationshipsRuntimeBridgeSources({ relationshipsRegistry, cdrRegistry }) {
  if (!isObject(relationshipsRegistry) || relationshipsRegistry.schemaVersion !== 'vexlife.relationships-browser/v2') {
    sourceError('Relationships registry schema is not the accepted v2 source');
  }
  if (
    relationshipsRegistry.registryRef !== 'registry.vexlife.relationships-browser.002' ||
    relationshipsRegistry.resource?.resourceRef !== 'resource.vexlife.relationships' ||
    relationshipsRegistry.discoveryMode !== 'INVITE_ONLY' ||
    relationshipsRegistry.publicSearch !== false ||
    relationshipsRegistry.communitySearch !== false
  ) {
    sourceError('Relationships resource/discovery binding drifted');
  }
  const relationshipEffects = relationshipsRegistry.effects;
  if (!isObject(relationshipEffects) || Object.values(relationshipEffects).some((value) => value !== false)) {
    sourceError('Relationships accepted no-effect boundary drifted');
  }
  if (
    relationshipsRegistry.relationshipTruth?.localDirectionalOnly !== true ||
    relationshipsRegistry.relationshipTruth?.counterpartClaimIndependent !== true ||
    relationshipsRegistry.relationshipTruth?.groupMembershipImpliesFriendship !== false ||
    relationshipsRegistry.relationshipTruth?.invitationAcceptanceImpliesPersistence !== false
  ) {
    sourceError('Relationships directional/non-persistence truth drifted');
  }
  if (!hasAll(relationshipsRegistry.invitation?.states, REQUIRED_CDR_INVITATION_STATES)) {
    sourceError('Relationships invitation-state vocabulary no longer covers the accepted CDR seam');
  }
  if (!hasAll(relationshipsRegistry.invitation?.decisions, REQUIRED_CDR_DECISIONS)) {
    sourceError('Relationships decision vocabulary no longer covers the accepted CDR seam');
  }
  if (!hasAll(relationshipsRegistry.invitation?.identityStates, REQUIRED_CDR_IDENTITY_STATES)) {
    sourceError('Relationships identity vocabulary no longer covers the accepted CDR seam');
  }
  if (JSON.stringify(relationshipsRegistry.invitation?.admittedDecisions) !== JSON.stringify(['ACCEPT', 'NARROW'])) {
    sourceError('Relationships admitted decision set drifted');
  }

  if (!isObject(cdrRegistry) || cdrRegistry.schemaVersion !== 'vexlife.cdr-s5-closed-alpha-browser/v1') {
    sourceError('CDR S5 registry schema is not the accepted source');
  }
  if (
    cdrRegistry.registryRef !== 'registry.vexlife.cdr-s5.closed-alpha-browser.001' ||
    cdrRegistry.discoveryMode !== 'INVITE_ONLY' ||
    cdrRegistry.publicSearch !== false ||
    cdrRegistry.communitySearch !== false ||
    cdrRegistry.participantClass !== 'SYNTHETIC_ONLY' ||
    cdrRegistry.networkEffectAllowed !== false ||
    cdrRegistry.providerEffectAllowed !== false ||
    cdrRegistry.relationshipMutationAllowed !== false ||
    cdrRegistry.memoryWriteAllowed !== false ||
    cdrRegistry.homeMutationAllowed !== false ||
    cdrRegistry.paymentOrTermsEffectAllowed !== false
  ) {
    sourceError('CDR S5 no-effect/discovery boundary drifted');
  }
  if (!hasAll(cdrRegistry.invitationStates, REQUIRED_CDR_INVITATION_STATES)) {
    sourceError('CDR S5 invitation vocabulary drifted');
  }
  if (!hasAll(cdrRegistry.decisions, REQUIRED_CDR_DECISIONS)) {
    sourceError('CDR S5 decision vocabulary drifted');
  }
  if (!hasAll(cdrRegistry.identityStates, REQUIRED_CDR_IDENTITY_STATES)) {
    sourceError('CDR S5 identity vocabulary drifted');
  }
  if (!hasAll(cdrRegistry.routeClasses, REQUIRED_CDR_ROUTE_CLASSES)) {
    sourceError('CDR S5 route vocabulary drifted');
  }
  if (!hasAll(cdrRegistry.failureStates, REQUIRED_CDR_FAILURE_STATES)) {
    sourceError('CDR S5 failure vocabulary drifted');
  }
  if (!Array.isArray(cdrRegistry.presenceStates) || cdrRegistry.presenceStates.length === 0) {
    sourceError('CDR S5 presence vocabulary is unavailable');
  }

  return Object.freeze({
    relationshipsRegistry,
    cdrRegistry
  });
}

export function validateRelationshipsRuntimeRequest(value, sources) {
  if (!isObject(value)) requestError('Relationships runtime request must be one JSON object');
  const extras = Object.keys(value).filter((key) => !REQUEST_KEYS.has(key));
  if (extras.length) requestError(`Relationships runtime request contains unadmitted field: ${extras[0]}`);

  for (const key of ['alphaConsentAcknowledged', 'withdrawn', 'revoked', 'disconnected', 'blocked', 'localRelationshipFormed']) {
    if (typeof value[key] !== 'boolean') requestError(`${key} must be boolean`);
  }

  const { relationshipsRegistry, cdrRegistry } = sources;
  if (!relationshipsRegistry.invitation.states.includes(value.invitationState) || !cdrRegistry.invitationStates.includes(value.invitationState)) {
    requestError('invitationState is not admitted by current Relationships/CDR source');
  }
  if (!relationshipsRegistry.invitation.decisions.includes(value.invitationDecision) || !cdrRegistry.decisions.includes(value.invitationDecision)) {
    requestError('invitationDecision is not admitted by current Relationships/CDR source');
  }
  if (!relationshipsRegistry.invitation.identityStates.includes(value.identityState) || !cdrRegistry.identityStates.includes(value.identityState)) {
    requestError('identityState is not admitted by current Relationships/CDR source');
  }
  if (!cdrRegistry.presenceStates.includes(value.presenceClass)) requestError('presenceClass is not admitted by current CDR source');
  if (!cdrRegistry.routeClasses.includes(value.routeClass)) requestError('routeClass is not admitted by current CDR source');
  if (!cdrRegistry.failureStates.includes(value.failureState)) requestError('failureState is not admitted by current CDR source');

  return Object.freeze(clone(value));
}

function sourceBindings(sources) {
  return Object.freeze({
    relationships: Object.freeze({
      repository: 'vgong24/VexLife',
      acceptedVisibleMerge: ACCEPTED_RELATIONSHIPS_VISIBLE_MERGE,
      resourceRef: sources.relationshipsRegistry.resource.resourceRef,
      registryRef: sources.relationshipsRegistry.registryRef
    }),
    cdrProduct: Object.freeze({
      repository: 'vgong24/VexLife',
      acceptedMerge: ACCEPTED_CDR_S5_PRODUCT_MERGE,
      registryRef: sources.cdrRegistry.registryRef,
      surfaceRef: sources.cdrRegistry.surfaceRef
    }),
    sdkCoordinator: Object.freeze({
      repository: 'vgong24/Vextreme-SDK',
      acceptedMerge: ACCEPTED_SDK_CDR_S5_MERGE,
      path: ACCEPTED_SDK_CDR_S5_COORDINATOR_PATH,
      procedureRef: ACCEPTED_SDK_CDR_S5_PROCEDURE_REF,
      procedurePolicySha256: ACCEPTED_SDK_CDR_S5_POLICY_SHA256
    }),
    sdkS2Runtime: Object.freeze({
      repository: 'vgong24/Vextreme-SDK',
      path: ACCEPTED_SDK_S2_RUNTIME_PATH,
      acceptanceRef: ACCEPTED_SDK_S2_ACCEPTANCE_REF
    }),
    friendGroup: Object.freeze({
      repository: 'vgong24/Vextreme-SDK',
      acceptedMerge: ACCEPTED_FRIEND_GROUP_MERGE,
      semanticBoundary: 'DIRECTIONAL_RELATIONSHIP_NON_COLLAPSE'
    }),
    replicaReconciliation: Object.freeze({
      repository: 'vgong24/Vextreme-SDK',
      acceptedMerge: ACCEPTED_REPLICA_RECONCILIATION_MERGE,
      semanticBoundary: 'MIRROR_SUCCESS_NE_SEMANTIC_ACKNOWLEDGEMENT'
    }),
    socialBridgeComposition: Object.freeze({
      repository: 'vgong24/Vextreme-SDK',
      acceptedMerge: ACCEPTED_SOCIAL_BRIDGE_COMPOSITION_MERGE,
      semanticBoundary: 'DELIVERY_NE_UNDERSTANDING'
    })
  });
}

function effects() {
  return Object.freeze({
    networkEffectPerformed: false,
    hostExecutionPerformed: false,
    participantEffectPerformed: false,
    providerEffectPerformed: false,
    relationshipMutationPerformed: false,
    canonicalRelationshipPersisted: false,
    HomePerformed: false,
    MemoryPerformed: false,
    modelRuntimePerformed: false,
    publicationPerformed: false,
    publicSearchPerformed: false
  });
}

function reasonsFor(input) {
  const reasons = [];
  if (input.alphaConsentAcknowledged !== true) reasons.push('ALPHA_CONSENT_NOT_ACKNOWLEDGED');
  if (input.invitationState !== 'RECEIVED_VERIFIED_REFERENCE') reasons.push('INVITATION_NOT_RECEIVED_VERIFIED');
  if (!['ACCEPT', 'NARROW'].includes(input.invitationDecision)) reasons.push('INVITATION_DECISION_NOT_AFFIRMATIVE');
  if (input.identityState !== 'VERIFIED_CURRENT') reasons.push('IDENTITY_NOT_VERIFIED_CURRENT');
  if (input.routeClass === 'UNAVAILABLE') reasons.push('ROUTE_UNAVAILABLE');
  if (input.failureState !== 'NONE') reasons.push('FAILURE_STATE_HELD');
  if (input.withdrawn !== false) reasons.push('PARTICIPATION_WITHDRAWN');
  if (input.revoked !== false) reasons.push('INVITATION_REVOKED');
  if (input.disconnected !== false) reasons.push('SESSION_DISCONNECTED');
  if (input.blocked !== false) reasons.push('RELATIONSHIP_BLOCKED');
  if (input.localRelationshipFormed !== true) reasons.push('LOCAL_RELATIONSHIP_PREVIEW_NOT_READY');
  return reasons;
}

function productGateSnapshot(input, sources) {
  return Object.freeze({
    discoveryMode: sources.cdrRegistry.discoveryMode,
    publicSearch: sources.cdrRegistry.publicSearch,
    alphaConsentAcknowledged: input.alphaConsentAcknowledged,
    invitationState: input.invitationState,
    invitationDecision: input.invitationDecision,
    identityState: input.identityState,
    routeClass: input.routeClass,
    failureState: input.failureState,
    withdrawn: input.withdrawn,
    revoked: input.revoked,
    disconnected: input.disconnected,
    presenceClass: input.presenceClass
  });
}

function heldPlan(input, sources, reasons) {
  return Object.freeze({
    schemaVersion: RELATIONSHIPS_RUNTIME_PLAN_SCHEMA,
    state: 'HELD',
    truthClass: 'CURRENT_PRODUCT_TO_ACCEPTED_CDR_BRIDGE_PLAN',
    reasons: Object.freeze([...reasons]),
    productGateSnapshot: productGateSnapshot(input, sources),
    relationshipProjection: Object.freeze({
      localRelationshipFormed: input.localRelationshipFormed,
      localDirectionalOnly: true,
      counterpartClaimIndependent: true,
      blocked: input.blocked,
      relationshipPersisted: false
    }),
    sourceBindings: sourceBindings(sources),
    requiredHostRoles: Object.freeze([]),
    requiredOpaqueBindings: Object.freeze([]),
    requiredPrivateBindings: Object.freeze([]),
    hostExecutionDeferred: true,
    semanticAcknowledged: false,
    realOutsideParticipantRequired: false,
    effects: effects()
  });
}

function hostBindingPlan(input, sources) {
  return Object.freeze({
    schemaVersion: RELATIONSHIPS_RUNTIME_PLAN_SCHEMA,
    state: 'HOST_BINDING_REQUIRED',
    truthClass: 'CURRENT_PRODUCT_TO_ACCEPTED_CDR_BRIDGE_PLAN',
    reasons: Object.freeze([]),
    productGateSnapshot: productGateSnapshot(input, sources),
    relationshipProjection: Object.freeze({
      localRelationshipFormed: true,
      localDirectionalOnly: true,
      counterpartClaimIndependent: true,
      blocked: false,
      relationshipPersisted: false
    }),
    sourceBindings: sourceBindings(sources),
    requiredHostRoles: Object.freeze([
      Object.freeze({ platformRole: 'MAC_LISTENER', runtimeRole: 'LISTENER' }),
      Object.freeze({ platformRole: 'WINDOWS_CONNECTOR', runtimeRole: 'CONNECTOR' })
    ]),
    requiredOpaqueBindings: Object.freeze([
      'scenarioRef',
      'candidateRef',
      'mac.stateRootRef',
      'mac.deviceRef',
      'mac.participantRef',
      'mac.peerParticipantRef',
      'mac.processInstanceRef',
      'mac.authorityRef',
      'windows.stateRootRef',
      'windows.deviceRef',
      'windows.participantRef',
      'windows.peerParticipantRef',
      'windows.processInstanceRef',
      'windows.authorityRef'
    ]),
    requiredPrivateBindings: Object.freeze([
      'mac.stateRootPath',
      'windows.stateRootPath',
      'VEX_CDR_S2_LAN_HOST',
      'VEX_CDR_S2_LAN_PORT'
    ]),
    nextEffectClass: 'FORM_EXACT_PAIRED_HOST_REHEARSAL',
    hostExecutionDeferred: true,
    semanticAcknowledged: false,
    realOutsideParticipantRequired: false,
    effects: effects()
  });
}

export function createBrowserRelationshipsRuntimeBridge(sourceInput) {
  const sources = validateRelationshipsRuntimeBridgeSources(sourceInput);
  return Object.freeze({
    prepare(value) {
      const input = validateRelationshipsRuntimeRequest(value, sources);
      const reasons = reasonsFor(input);
      return reasons.length ? heldPlan(input, sources, reasons) : hostBindingPlan(input, sources);
    }
  });
}

export function browserRelationshipsRuntimeFailurePayload(error) {
  const typed = error instanceof BrowserRelationshipsRuntimeBridgeError
    ? error
    : new BrowserRelationshipsRuntimeBridgeError(
      'RELATIONSHIPS_RUNTIME_PLAN_FAILED',
      'Relationships runtime plan failed safely',
      500,
      null
    );
  return Object.freeze({
    schemaVersion: 'vexlife.relationships-runtime-bridge-failure/v1',
    state: 'HELD',
    truthClass: 'CURRENT_PRODUCT_TO_ACCEPTED_CDR_BRIDGE_FAILURE',
    failureCode: typed.code,
    message: typed.message,
    effects: effects()
  });
}

// [VXG RealForever]
