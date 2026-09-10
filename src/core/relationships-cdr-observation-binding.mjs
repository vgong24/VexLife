export const FRIEND_CDR_OBSERVATION_SCHEMA = 'vexlife.friend-cdr-observation/v1';
export const FRIEND_CDR_BINDING_RESULT_SCHEMA = 'vexlife.friend-cdr-persistence-binding-result/v1';
export const ACCEPTED_CDR_SINGLE_PAIR_PROCEDURE_REF = 'procedure.cdr.s5.single-pair-rehearsal.001';

const PERSISTENCE_REF = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u;
const OBSERVATION_REF = /^[A-Za-z0-9](?:[A-Za-z0-9._:/#@+-]{0,254}[A-Za-z0-9])?$/u;
const PRESENCE_CLASS = /^[A-Z][A-Z0-9_]{0,63}$/u;

const TOP_KEYS = new Set(['schemaVersion', 'sourceWitness', 'productGate', 'local', 'peer', 'invitation', 'currentness', 'runtime']);
const SOURCE_KEYS = new Set(['receiptRef', 'procedureRef', 'currentnessRef', 'scenarioRef', 'candidateRef']);
const GATE_KEYS = new Set([
  'alphaConsentAcknowledged', 'invitationState', 'invitationDecision', 'identityState', 'presenceClass',
  'routeClass', 'failureState', 'withdrawn', 'revoked', 'disconnected', 'blocked'
]);
const ROLE_KEYS = new Set(['stateRootRef', 'deviceRef', 'participantRef', 'peerParticipantRef', 'processInstanceRef', 'authorityRef']);
const PEER_KEYS = new Set([...ROLE_KEYS, 'currentKeyRef', 'currentnessRef']);
const INVITATION_KEYS = new Set(['invitationRef', 'currentnessRef', 'localParticipantRef', 'counterpartParticipantRef']);
const CURRENTNESS_KEYS = new Set(['observationState', 'invitationState', 'peerState']);
const RUNTIME_KEYS = new Set(['routeRef', 'sessionGeneration', 'deliveryObservationRef']);

const NO_EFFECTS = Object.freeze({
  relationshipMutationPerformed: false,
  canonicalRelationshipPersisted: false,
  networkEffectPerformed: false,
  providerEffectPerformed: false,
  HomeEffectPerformed: false,
  MemoryEffectPerformed: false,
  modelRuntimePerformed: false,
  publicationPerformed: false,
  publicSearchPerformed: false,
  semanticAcknowledgementCreated: false,
  reciprocalFriendshipCreated: false
});

export class RelationshipsCdrObservationBindingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RelationshipsCdrObservationBindingError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new RelationshipsCdrObservationBindingError(code, message);
}

function exactObject(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('FFR04_OBSERVATION_INVALID', `${label} must be one object`);
  const actual = Object.keys(value);
  const extra = actual.find((key) => !keys.has(key));
  if (extra) fail('FFR04_OBSERVATION_UNADMITTED_FIELD', `${label} contains unadmitted field ${extra}`);
  const missing = [...keys].find((key) => !Object.hasOwn(value, key));
  if (missing) fail('FFR04_OBSERVATION_MISSING_FIELD', `${label} is missing ${missing}`);
  return value;
}

function looksLikeEndpoint(value) {
  if (typeof value !== 'string') return false;
  const candidate = value.trim();
  return /^(?:https?|wss?|turns?|stuns?):\/\//iu.test(candidate)
    || /\b(?:\d{1,3}\.){3}\d{1,3}\b/u.test(candidate)
    || /^localhost(?::\d+)?$/iu.test(candidate)
    || /(?:^|[.:])(?:local|lan|home)(?::\d+)?$/iu.test(candidate);
}

function observationRef(value, label) {
  if (typeof value !== 'string' || !OBSERVATION_REF.test(value) || looksLikeEndpoint(value)) {
    fail('FFR04_OBSERVATION_REF_INVALID', `${label} must be one portable non-endpoint observation ref`);
  }
  return value;
}

function persistenceRef(value, label, optional = false) {
  if (optional && (value === null || value === undefined)) return null;
  if (typeof value !== 'string' || !PERSISTENCE_REF.test(value)) {
    fail('FFR04_PERSISTENCE_REF_INVALID', `${label} must be one lowercase portable canonical persistence ref`);
  }
  return value;
}

function optionalSessionGeneration(value) {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 0) fail('FFR04_SESSION_GENERATION_INVALID', 'sessionGeneration must be a non-negative safe integer or null');
  return value;
}

function sourceWitness(value) {
  exactObject(value, SOURCE_KEYS, 'sourceWitness');
  const result = Object.freeze({
    receiptRef: observationRef(value.receiptRef, 'sourceWitness.receiptRef'),
    procedureRef: observationRef(value.procedureRef, 'sourceWitness.procedureRef'),
    currentnessRef: observationRef(value.currentnessRef, 'sourceWitness.currentnessRef'),
    scenarioRef: observationRef(value.scenarioRef, 'sourceWitness.scenarioRef'),
    candidateRef: observationRef(value.candidateRef, 'sourceWitness.candidateRef')
  });
  return result;
}

function productGate(value) {
  exactObject(value, GATE_KEYS, 'productGate');
  if (value.alphaConsentAcknowledged !== true) fail('FFR04_ALPHA_CONSENT_NOT_ACKNOWLEDGED', 'alpha consent is not acknowledged');
  if (value.invitationState !== 'RECEIVED_VERIFIED_REFERENCE') fail('FFR04_INVITATION_NOT_CURRENT', 'invitation is not a received verified reference');
  if (!['ACCEPT', 'NARROW'].includes(value.invitationDecision)) fail('FFR04_INVITATION_DECISION_HELD', 'invitation decision is not ACCEPT or NARROW');
  if (value.identityState !== 'VERIFIED_CURRENT') fail('FFR04_IDENTITY_NOT_CURRENT', 'counterpart identity is not verified current');
  if (typeof value.presenceClass !== 'string' || !PRESENCE_CLASS.test(value.presenceClass)) fail('FFR04_PRESENCE_INVALID', 'presenceClass is invalid');
  if (!['DIRECT_CANDIDATE', 'RELAYED', 'STORE_FORWARD'].includes(value.routeClass)) fail('FFR04_ROUTE_UNAVAILABLE', 'routeClass is unavailable or unadmitted');
  if (value.failureState !== 'NONE') fail('FFR04_FAILURE_STATE_HELD', 'CDR failure state is not NONE');
  for (const key of ['withdrawn', 'revoked', 'disconnected', 'blocked']) {
    if (value[key] !== false) fail(`FFR04_${key.toUpperCase()}_HELD`, `${key} must be false`);
  }
  return Object.freeze({ ...value });
}

function role(value, label, { peer = false } = {}) {
  exactObject(value, peer ? PEER_KEYS : ROLE_KEYS, label);
  const result = {
    stateRootRef: persistenceRef(value.stateRootRef, `${label}.stateRootRef`),
    deviceRef: observationRef(value.deviceRef, `${label}.deviceRef`),
    participantRef: persistenceRef(value.participantRef, `${label}.participantRef`),
    peerParticipantRef: persistenceRef(value.peerParticipantRef, `${label}.peerParticipantRef`),
    processInstanceRef: persistenceRef(value.processInstanceRef, `${label}.processInstanceRef`),
    authorityRef: observationRef(value.authorityRef, `${label}.authorityRef`)
  };
  if (result.participantRef === result.deviceRef) fail('FFR04_DEVICE_PARTICIPANT_COLLAPSE', `${label} deviceRef cannot substitute for participantRef`);
  if (result.participantRef === result.stateRootRef) fail('FFR04_PARTICIPANT_STATE_ROOT_COLLAPSE', `${label} participantRef cannot equal stateRootRef`);
  if (result.participantRef === result.processInstanceRef) fail('FFR04_PARTICIPANT_PROCESS_COLLAPSE', `${label} processInstanceRef cannot substitute for participantRef`);
  if (peer) {
    result.currentKeyRef = persistenceRef(value.currentKeyRef, `${label}.currentKeyRef`);
    result.currentnessRef = persistenceRef(value.currentnessRef, `${label}.currentnessRef`);
  }
  return Object.freeze(result);
}

function invitation(value, localParticipantRef, counterpartParticipantRef) {
  exactObject(value, INVITATION_KEYS, 'invitation');
  const result = Object.freeze({
    invitationRef: persistenceRef(value.invitationRef, 'invitation.invitationRef'),
    currentnessRef: persistenceRef(value.currentnessRef, 'invitation.currentnessRef'),
    localParticipantRef: persistenceRef(value.localParticipantRef, 'invitation.localParticipantRef'),
    counterpartParticipantRef: persistenceRef(value.counterpartParticipantRef, 'invitation.counterpartParticipantRef')
  });
  if (result.localParticipantRef !== localParticipantRef || result.counterpartParticipantRef !== counterpartParticipantRef) {
    fail('FFR04_INVITATION_PARTICIPANT_MISMATCH', 'invitation participant refs do not match the paired-host observation');
  }
  return result;
}

function currentness(value) {
  exactObject(value, CURRENTNESS_KEYS, 'currentness');
  for (const key of CURRENTNESS_KEYS) {
    if (value[key] !== 'CURRENT') fail('FFR04_CURRENTNESS_HELD', `${key} is not CURRENT`);
  }
  return Object.freeze({ ...value });
}

function runtime(value) {
  exactObject(value, RUNTIME_KEYS, 'runtime');
  return Object.freeze({
    routeRef: persistenceRef(value.routeRef, 'runtime.routeRef', true),
    sessionGeneration: optionalSessionGeneration(value.sessionGeneration),
    deliveryObservationRef: persistenceRef(value.deliveryObservationRef, 'runtime.deliveryObservationRef', true)
  });
}

function validatePair(local, peer) {
  if (local.participantRef !== peer.peerParticipantRef || peer.participantRef !== local.peerParticipantRef) {
    fail('FFR04_PARTICIPANT_BINDINGS_NOT_INVERSE', 'local and counterpart participant bindings are not inverse');
  }
  for (const [field, code] of [
    ['stateRootRef', 'FFR04_CROSS_ROLE_STATE_ROOT_COLLAPSE'],
    ['deviceRef', 'FFR04_CROSS_ROLE_DEVICE_COLLAPSE'],
    ['participantRef', 'FFR04_CROSS_ROLE_PARTICIPANT_COLLAPSE'],
    ['processInstanceRef', 'FFR04_CROSS_ROLE_PROCESS_COLLAPSE'],
    ['authorityRef', 'FFR04_CROSS_ROLE_AUTHORITY_COLLAPSE']
  ]) {
    if (local[field] === peer[field]) fail(code, `local and peer ${field} must remain distinct`);
  }
}

function held(error) {
  const failure = error instanceof RelationshipsCdrObservationBindingError
    ? error
    : new RelationshipsCdrObservationBindingError('FFR04_OBSERVATION_INVALID', 'CDR observation binding failed safely');
  return Object.freeze({
    schemaVersion: FRIEND_CDR_BINDING_RESULT_SCHEMA,
    state: 'HELD_BINDING_REQUIRED',
    binding: null,
    sourceWitness: null,
    failureCode: failure.code,
    effects: NO_EFFECTS
  });
}

export function bindRelationshipsCdrObservation(value) {
  try {
    exactObject(value, TOP_KEYS, 'observation');
    if (value.schemaVersion !== FRIEND_CDR_OBSERVATION_SCHEMA) fail('FFR04_OBSERVATION_SCHEMA_INVALID', 'observation schema is not admitted');

    const witness = sourceWitness(value.sourceWitness);
    const gate = productGate(value.productGate);
    const local = role(value.local, 'local');
    const peer = role(value.peer, 'peer', { peer: true });
    validatePair(local, peer);
    const invitationValue = invitation(value.invitation, local.participantRef, peer.participantRef);
    const currentnessValue = currentness(value.currentness);
    const runtimeValue = runtime(value.runtime);

    const binding = Object.freeze({
      localParticipantRef: local.participantRef,
      localStateRootRef: local.stateRootRef,
      counterpartParticipantRef: peer.participantRef,
      counterpartCurrentKeyRef: peer.currentKeyRef,
      invitationRef: invitationValue.invitationRef,
      invitationCurrentnessRef: invitationValue.currentnessRef,
      instanceRef: local.processInstanceRef,
      lastAcceptedPeerCurrentnessRef: peer.currentnessRef,
      routeRef: runtimeValue.routeRef,
      sessionGeneration: runtimeValue.sessionGeneration,
      deliveryObservationRef: runtimeValue.deliveryObservationRef
    });

    return Object.freeze({
      schemaVersion: FRIEND_CDR_BINDING_RESULT_SCHEMA,
      state: 'BOUND_CURRENT',
      binding,
      sourceWitness: witness,
      productGate: gate,
      currentness: currentnessValue,
      failureCode: null,
      effects: NO_EFFECTS
    });
  } catch (error) {
    return held(error);
  }
}

// [VXG RealForever]
