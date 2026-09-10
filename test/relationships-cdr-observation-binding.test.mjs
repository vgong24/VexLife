import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FRIEND_CDR_BINDING_RESULT_SCHEMA,
  FRIEND_CDR_OBSERVATION_SCHEMA,
  bindRelationshipsCdrObservation
} from '../src/core/relationships-cdr-observation-binding.mjs';

const NO_EFFECT_KEYS = Object.freeze([
  'HomeEffectPerformed',
  'MemoryEffectPerformed',
  'canonicalRelationshipPersisted',
  'modelRuntimePerformed',
  'networkEffectPerformed',
  'providerEffectPerformed',
  'publicSearchPerformed',
  'publicationPerformed',
  'reciprocalFriendshipCreated',
  'relationshipMutationPerformed',
  'semanticAcknowledgementCreated'
]);

function observation() {
  return {
    schemaVersion: FRIEND_CDR_OBSERVATION_SCHEMA,
    sourceWitness: {
      receiptRef: 'receipt.cdr.s5.single-pair.r18',
      procedureRef: 'procedure.cdr.s5.single-pair-rehearsal.001',
      currentnessRef: 'currentness.cdr.single-pair.r18',
      scenarioRef: 'scenario.friend.single-pair.001',
      candidateRef: 'candidate.friend.ffr04.001'
    },
    productGate: {
      alphaConsentAcknowledged: true,
      invitationState: 'RECEIVED_VERIFIED_REFERENCE',
      invitationDecision: 'ACCEPT',
      identityState: 'VERIFIED_CURRENT',
      presenceClass: 'PRESENT_DIRECT',
      routeClass: 'DIRECT_CANDIDATE',
      failureState: 'NONE',
      withdrawn: false,
      revoked: false,
      disconnected: false,
      blocked: false
    },
    local: {
      stateRootRef: 'state.relationships.alice',
      deviceRef: 'device.windows.alice.1',
      participantRef: 'participant.alice',
      peerParticipantRef: 'participant.bob',
      processInstanceRef: 'instance.relationships.alice.1',
      authorityRef: 'authority.cdr.alice.1'
    },
    peer: {
      stateRootRef: 'state.relationships.bob',
      deviceRef: 'device.mac.bob.1',
      participantRef: 'participant.bob',
      peerParticipantRef: 'participant.alice',
      processInstanceRef: 'instance.relationships.bob.1',
      authorityRef: 'authority.cdr.bob.1',
      currentKeyRef: 'key.peer.bob.1',
      currentnessRef: 'currentness.peer.bob.1'
    },
    invitation: {
      invitationRef: 'invitation.friend.1',
      currentnessRef: 'currentness.invitation.1',
      localParticipantRef: 'participant.alice',
      counterpartParticipantRef: 'participant.bob'
    },
    currentness: {
      observationState: 'CURRENT',
      invitationState: 'CURRENT',
      peerState: 'CURRENT'
    },
    runtime: {
      routeRef: 'route.direct.bob.1',
      sessionGeneration: 2,
      deliveryObservationRef: 'delivery.observation.bob.1'
    }
  };
}

function bind(value = observation()) {
  return bindRelationshipsCdrObservation(value);
}

function assertHeld(value, code) {
  const result = bind(value);
  assert.equal(result.schemaVersion, FRIEND_CDR_BINDING_RESULT_SCHEMA);
  assert.equal(result.state, 'HELD_BINDING_REQUIRED');
  assert.equal(result.binding, null);
  assert.equal(result.failureCode, code);
  assert.deepEqual(Object.keys(result.effects).sort(), [...NO_EFFECT_KEYS].sort());
  assert.ok(Object.values(result.effects).every((effect) => effect === false));
}

test('FFR04-00 accepted inverse paired-host observation emits only the exact closed persistence binding', () => {
  const result = bind();
  assert.equal(result.state, 'BOUND_CURRENT');
  assert.deepEqual(Object.keys(result.binding), [
    'localParticipantRef',
    'localStateRootRef',
    'counterpartParticipantRef',
    'counterpartCurrentKeyRef',
    'invitationRef',
    'invitationCurrentnessRef',
    'instanceRef',
    'lastAcceptedPeerCurrentnessRef',
    'routeRef',
    'sessionGeneration',
    'deliveryObservationRef'
  ]);
  assert.deepEqual(result.binding, {
    localParticipantRef: 'participant.alice',
    localStateRootRef: 'state.relationships.alice',
    counterpartParticipantRef: 'participant.bob',
    counterpartCurrentKeyRef: 'key.peer.bob.1',
    invitationRef: 'invitation.friend.1',
    invitationCurrentnessRef: 'currentness.invitation.1',
    instanceRef: 'instance.relationships.alice.1',
    lastAcceptedPeerCurrentnessRef: 'currentness.peer.bob.1',
    routeRef: 'route.direct.bob.1',
    sessionGeneration: 2,
    deliveryObservationRef: 'delivery.observation.bob.1'
  });
  assert.ok(Object.values(result.effects).every((effect) => effect === false));
  for (const forbidden of ['relationshipRef', 'localRelationshipClass', 'deviceRef', 'authorityRef', 'semanticAcknowledged', 'reciprocalFriendshipAsserted']) {
    assert.equal(Object.hasOwn(result.binding, forbidden), false);
  }
});

test('FFR04-01 deviceRef cannot substitute for participantRef', () => {
  const value = observation();
  value.local.deviceRef = value.local.participantRef;
  assertHeld(value, 'FFR04_DEVICE_PARTICIPANT_COLLAPSE');
});

test('FFR04-02 Home, display, model or provider fields are not admitted as identity inputs', () => {
  for (const [key, value] of [
    ['homeRef', 'home.alice'],
    ['displayName', 'Alice'],
    ['modelRef', 'model.qwen'],
    ['providerRef', 'provider.local']
  ]) {
    const candidate = observation();
    candidate.local[key] = value;
    assertHeld(candidate, 'FFR04_OBSERVATION_UNADMITTED_FIELD');
  }
});

test('FFR04-03 raw state-root paths and endpoints are rejected instead of becoming durable binding identity', () => {
  const withPath = observation();
  withPath.local.stateRootPath = 'C:\\Users\\alice\\.vexlife';
  assertHeld(withPath, 'FFR04_OBSERVATION_UNADMITTED_FIELD');

  const withEndpoint = observation();
  withEndpoint.sourceWitness.receiptRef = 'https://127.0.0.1:18110/receipt';
  assertHeld(withEndpoint, 'FFR04_OBSERVATION_REF_INVALID');
});

test('FFR04-04 stale observation, invitation or peer currentness is held with no binding', () => {
  for (const key of ['observationState', 'invitationState', 'peerState']) {
    const value = observation();
    value.currentness[key] = 'STALE';
    assertHeld(value, 'FFR04_CURRENTNESS_HELD');
  }
});

test('FFR04-05 paired participant bindings must remain inverse', () => {
  const value = observation();
  value.peer.peerParticipantRef = 'participant.someone-else';
  assertHeld(value, 'FFR04_PARTICIPANT_BINDINGS_NOT_INVERSE');
});

test('FFR04-06 cross-role participant identity collapse is held', () => {
  const value = observation();
  value.peer.participantRef = value.local.participantRef;
  value.local.peerParticipantRef = value.local.participantRef;
  value.peer.peerParticipantRef = value.local.participantRef;
  assertHeld(value, 'FFR04_CROSS_ROLE_PARTICIPANT_COLLAPSE');
});

test('FFR04-07 process-instance changes do not change participant/state-root identity', () => {
  const first = bind();
  const value = observation();
  value.local.processInstanceRef = 'instance.relationships.alice.2';
  const second = bind(value);
  assert.equal(second.state, 'BOUND_CURRENT');
  assert.equal(second.binding.localParticipantRef, first.binding.localParticipantRef);
  assert.equal(second.binding.localStateRootRef, first.binding.localStateRootRef);
  assert.equal(second.binding.counterpartParticipantRef, first.binding.counterpartParticipantRef);
  assert.notEqual(second.binding.instanceRef, first.binding.instanceRef);
});

test('FFR04-08 route/session generation changes do not change relationship identity inputs', () => {
  const first = bind();
  const value = observation();
  value.runtime.routeRef = 'route.relayed.bob.2';
  value.runtime.sessionGeneration = 3;
  const second = bind(value);
  assert.equal(second.state, 'BOUND_CURRENT');
  assert.equal(second.binding.localParticipantRef, first.binding.localParticipantRef);
  assert.equal(second.binding.localStateRootRef, first.binding.localStateRootRef);
  assert.equal(second.binding.counterpartParticipantRef, first.binding.counterpartParticipantRef);
  assert.notEqual(second.binding.routeRef, first.binding.routeRef);
  assert.notEqual(second.binding.sessionGeneration, first.binding.sessionGeneration);
});

test('FFR04-09 peer currentness updates only currentness/key binding fields and cannot author relationship class', () => {
  const first = bind();
  const value = observation();
  value.peer.currentKeyRef = 'key.peer.bob.2';
  value.peer.currentnessRef = 'currentness.peer.bob.2';
  const second = bind(value);
  assert.equal(second.state, 'BOUND_CURRENT');
  assert.equal(second.binding.localParticipantRef, first.binding.localParticipantRef);
  assert.equal(second.binding.counterpartParticipantRef, first.binding.counterpartParticipantRef);
  assert.equal(second.binding.counterpartCurrentKeyRef, 'key.peer.bob.2');
  assert.equal(second.binding.lastAcceptedPeerCurrentnessRef, 'currentness.peer.bob.2');
  assert.equal(Object.hasOwn(second.binding, 'localRelationshipClass'), false);
});

test('FFR04-10 invitation ACCEPT or NARROW cannot create relationshipRef or Saved truth', () => {
  for (const decision of ['ACCEPT', 'NARROW']) {
    const value = observation();
    value.productGate.invitationDecision = decision;
    const result = bind(value);
    assert.equal(result.state, 'BOUND_CURRENT');
    assert.equal(Object.hasOwn(result, 'saved'), false);
    assert.equal(Object.hasOwn(result.binding, 'relationshipRef'), false);
  }
});

test('FFR04-11 semantic acknowledgement or reciprocal-friend claims are rejected as unadmitted observation fields', () => {
  for (const key of ['semanticAcknowledged', 'reciprocalFriendshipAsserted']) {
    const value = observation();
    value[key] = true;
    assertHeld(value, 'FFR04_OBSERVATION_UNADMITTED_FIELD');
  }
});

test('FFR04-12 invalid product-gate currentness is held and all composer effects remain false', () => {
  const cases = [
    ['invitationState', 'EXPIRED_OR_REVOKED', 'FFR04_INVITATION_NOT_CURRENT'],
    ['identityState', 'STALE_EVIDENCE', 'FFR04_IDENTITY_NOT_CURRENT'],
    ['routeClass', 'UNAVAILABLE', 'FFR04_ROUTE_UNAVAILABLE'],
    ['failureState', 'SESSION_EXPIRED', 'FFR04_FAILURE_STATE_HELD'],
    ['revoked', true, 'FFR04_REVOKED_HELD']
  ];
  for (const [key, next, code] of cases) {
    const value = observation();
    value.productGate[key] = next;
    assertHeld(value, code);
  }
});

test('FFR04-13 invitation participant refs must bind the exact observed local/counterpart participants', () => {
  const value = observation();
  value.invitation.counterpartParticipantRef = 'participant.mallory';
  assertHeld(value, 'FFR04_INVITATION_PARTICIPANT_MISMATCH');
});

test('FFR04-14 optional route/delivery/session observations may be absent without inventing values', () => {
  const value = observation();
  value.runtime.routeRef = null;
  value.runtime.sessionGeneration = null;
  value.runtime.deliveryObservationRef = null;
  const result = bind(value);
  assert.equal(result.state, 'BOUND_CURRENT');
  assert.equal(result.binding.routeRef, null);
  assert.equal(result.binding.sessionGeneration, null);
  assert.equal(result.binding.deliveryObservationRef, null);
});
