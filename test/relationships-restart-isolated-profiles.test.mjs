import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach } from 'node:test';

import { createBrowserRelationshipsPersistenceBridge } from '../src/core/browser-relationships-persistence-bridge.mjs';
import { bindRelationshipsCdrObservation } from '../src/core/relationships-cdr-observation-binding.mjs';

const ROOTS = new Set();
const T0 = '2026-09-02T22:40:00.000Z';
const T1 = '2026-09-02T22:41:00.000Z';
const T2 = '2026-09-02T22:42:00.000Z';

function tempHome(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `vexlife-ffr05-${label}-`));
  ROOTS.add(root);
  return root;
}

afterEach(() => {
  for (const root of ROOTS) {
    fs.rmSync(root, { recursive: true, force: true });
    assert.equal(fs.existsSync(root), false, `test-owned profile Home remained: ${root}`);
  }
  ROOTS.clear();
});

function observation({ local = 'alice', peer = 'bob', generation = 1, route = 'direct' } = {}) {
  return {
    schemaVersion: 'vexlife.friend-cdr-observation/v1',
    sourceWitness: {
      receiptRef: `receipt.cdr.s5.${local}-${peer}.${generation}`,
      procedureRef: 'procedure.cdr.s5.single-pair-rehearsal.001',
      currentnessRef: `currentness.cdr.${local}-${peer}.${generation}`,
      scenarioRef: 'scenario.friend.ffr05.two-profile.001',
      candidateRef: 'candidate.friend.ffr05.001'
    },
    productGate: {
      alphaConsentAcknowledged: true,
      invitationState: 'RECEIVED_VERIFIED_REFERENCE',
      invitationDecision: 'ACCEPT',
      identityState: 'VERIFIED_CURRENT',
      presenceClass: 'PRESENT_DIRECT',
      routeClass: route === 'direct' ? 'DIRECT_CANDIDATE' : 'RELAYED',
      failureState: 'NONE',
      withdrawn: false,
      revoked: false,
      disconnected: false,
      blocked: false
    },
    local: {
      stateRootRef: `state.relationships.${local}`,
      deviceRef: `device.${local}.1`,
      participantRef: `participant.${local}`,
      peerParticipantRef: `participant.${peer}`,
      processInstanceRef: `instance.relationships.${local}.${generation}`,
      authorityRef: `authority.cdr.${local}.1`
    },
    peer: {
      stateRootRef: `state.relationships.${peer}`,
      deviceRef: `device.${peer}.1`,
      participantRef: `participant.${peer}`,
      peerParticipantRef: `participant.${local}`,
      processInstanceRef: `instance.relationships.${peer}.${generation}`,
      authorityRef: `authority.cdr.${peer}.1`,
      currentKeyRef: `key.peer.${peer}.${generation}`,
      currentnessRef: `currentness.peer.${peer}.${generation}`
    },
    invitation: {
      invitationRef: `invitation.friend.${local}-${peer}.1`,
      currentnessRef: `currentness.invitation.${local}-${peer}.${generation}`,
      localParticipantRef: `participant.${local}`,
      counterpartParticipantRef: `participant.${peer}`
    },
    currentness: {
      observationState: 'CURRENT',
      invitationState: 'CURRENT',
      peerState: 'CURRENT'
    },
    runtime: {
      routeRef: `route.${route}.${peer}.${generation}`,
      sessionGeneration: generation,
      deliveryObservationRef: `delivery.observation.${peer}.${generation}`
    }
  };
}

function bindingFor(value) {
  const result = bindRelationshipsCdrObservation(value);
  assert.equal(result.state, 'BOUND_CURRENT');
  assert.equal(result.binding !== null, true);
  assert.ok(Object.values(result.effects).every((effect) => effect === false));
  return result.binding;
}

function bridgeFor(home, binding) {
  return createBrowserRelationshipsPersistenceBridge({
    home,
    localOwnerBinding: {
      localParticipantRef: binding.localParticipantRef,
      localStateRootRef: binding.localStateRootRef
    }
  });
}

function persist(bridge, binding, observedAt = T0) {
  const prepared = bridge.prepare({
    counterpartParticipantRef: binding.counterpartParticipantRef,
    counterpartCurrentKeyRef: binding.counterpartCurrentKeyRef,
    localRelationshipClass: 'FRIEND',
    invitationRef: binding.invitationRef,
    invitationCurrentnessRef: binding.invitationCurrentnessRef,
    observedAt,
    instanceRef: binding.instanceRef,
    lastAcceptedPeerCurrentnessRef: binding.lastAcceptedPeerCurrentnessRef,
    routeRef: binding.routeRef,
    sessionGeneration: binding.sessionGeneration,
    deliveryObservationRef: binding.deliveryObservationRef
  });
  assert.equal(prepared.state, 'PREPARED_NO_EFFECT');
  assert.ok(Object.values(prepared.effects).every((effect) => effect === false));
  return bridge.commit(prepared);
}

function assertNoExternalEffects(saved) {
  for (const key of [
    'networkEffectPerformed', 'providerEffectPerformed', 'MemoryEffectPerformed', 'HomeLayoutEffectPerformed',
    'modelRuntimePerformed', 'publicationPerformed', 'publicSearchPerformed',
    'semanticAcknowledgementCreated', 'reciprocalFriendshipCreated'
  ]) assert.equal(saved.effects[key], false, key);
}

test('FFR05-00/01/08 current binding does not write; A commit survives bridge reconstruction with the same relationshipRef', () => {
  const homeA = tempHome('a');
  const bindingA = bindingFor(observation());
  assert.equal(fs.existsSync(path.join(homeA, 'relationships')), false, 'binding alone must not persist');

  const savedA = persist(bridgeFor(homeA, bindingA), bindingA);
  assert.equal(savedA.state, 'SAVED');
  assertNoExternalEffects(savedA);

  const restartedA = bridgeFor(homeA, bindingA).read({ counterpartParticipantRef: bindingA.counterpartParticipantRef });
  assert.equal(restartedA.relationshipRef, savedA.relationshipRef);
  assert.equal(restartedA.record.revision, savedA.receipt.revision);
  assert.equal(restartedA.record.localRelationshipClass, 'FRIEND');
});

test('FFR05-02/03/04/05 two isolated directional profiles preserve rightful ownership and distinct relationship refs', () => {
  const homeA = tempHome('a');
  const homeB = tempHome('b');
  const bindingA = bindingFor(observation({ local: 'alice', peer: 'bob' }));
  const bindingB = bindingFor(observation({ local: 'bob', peer: 'alice' }));

  const savedA = persist(bridgeFor(homeA, bindingA), bindingA);

  const wrongStateRoot = { ...bindingA, localStateRootRef: 'state.relationships.alice-wrong' };
  assert.throws(
    () => bridgeFor(homeA, wrongStateRoot).read({ counterpartParticipantRef: bindingA.counterpartParticipantRef }),
    (error) => error?.code === 'RELATIONSHIP_NOT_FOUND'
  );

  const bridgeB = bridgeFor(homeB, bindingB);
  assert.throws(
    () => bridgeB.read({ counterpartParticipantRef: bindingB.counterpartParticipantRef }),
    (error) => error?.code === 'RELATIONSHIP_NOT_FOUND'
  );
  assert.equal(fs.existsSync(path.join(homeB, 'relationships')), true, 'rightful read may establish only owner-local directory structure');

  const savedB = persist(bridgeB, bindingB);
  assert.notEqual(savedB.relationshipRef, savedA.relationshipRef, 'directional A->B and B->A relationships must not collapse');
  assertNoExternalEffects(savedB);

  const restartedB = bridgeFor(homeB, bindingB).read({ counterpartParticipantRef: bindingB.counterpartParticipantRef });
  assert.equal(restartedB.relationshipRef, savedB.relationshipRef);
  assert.equal(restartedB.record.revision, savedB.receipt.revision);
  assert.equal(restartedB.record.localParticipantRef, 'participant.bob');
  assert.equal(restartedB.record.counterpartParticipantRef, 'participant.alice');
});

test('FFR05-06 route/session/process changes across disconnect/reconnect preserve A relationship identity and local class', () => {
  const homeA = tempHome('a');
  const firstBinding = bindingFor(observation({ generation: 1, route: 'direct' }));
  const firstBridge = bridgeFor(homeA, firstBinding);
  const saved = persist(firstBridge, firstBinding);

  const secondBinding = bindingFor(observation({ generation: 2, route: 'relayed' }));
  const secondBridge = bridgeFor(homeA, secondBinding);
  const disconnected = secondBridge.transition({
    counterpartParticipantRef: secondBinding.counterpartParticipantRef,
    action: 'DISCONNECT',
    expectedRevision: 0,
    observedAt: T1,
    instanceRef: secondBinding.instanceRef,
    counterpartCurrentKeyRef: secondBinding.counterpartCurrentKeyRef,
    invitationCurrentnessRef: secondBinding.invitationCurrentnessRef,
    lastAcceptedPeerCurrentnessRef: secondBinding.lastAcceptedPeerCurrentnessRef,
    routeRef: secondBinding.routeRef,
    sessionGeneration: secondBinding.sessionGeneration,
    deliveryObservationRef: secondBinding.deliveryObservationRef,
    recoveryOrTombstoneRef: null
  });
  assert.equal(disconnected.relationshipRef, saved.relationshipRef);
  assertNoExternalEffects(disconnected);

  const reconnected = secondBridge.transition({
    counterpartParticipantRef: secondBinding.counterpartParticipantRef,
    action: 'RECONNECT',
    expectedRevision: 1,
    observedAt: T2,
    instanceRef: 'instance.relationships.alice.3',
    counterpartCurrentKeyRef: 'key.peer.bob.3',
    invitationCurrentnessRef: secondBinding.invitationCurrentnessRef,
    lastAcceptedPeerCurrentnessRef: 'currentness.peer.bob.3',
    routeRef: 'route.direct.bob.3',
    sessionGeneration: 3,
    deliveryObservationRef: 'delivery.observation.bob.3',
    recoveryOrTombstoneRef: null
  });
  assert.equal(reconnected.relationshipRef, saved.relationshipRef);
  assertNoExternalEffects(reconnected);

  const restarted = bridgeFor(homeA, { ...secondBinding, instanceRef: 'instance.relationships.alice.4' })
    .read({ counterpartParticipantRef: secondBinding.counterpartParticipantRef });
  assert.equal(restarted.relationshipRef, saved.relationshipRef);
  assert.equal(restarted.record.localRelationshipClass, 'FRIEND');
  assert.equal(restarted.record.status, 'ACTIVE');
  assert.equal(restarted.record.sessionGeneration, 3);
});

test('FFR05-07/09 each isolated profile lists only its rightful directional record with no acknowledgement or reciprocity manufacture', () => {
  const homeA = tempHome('a');
  const homeB = tempHome('b');
  const bindingA = bindingFor(observation({ local: 'alice', peer: 'bob' }));
  const bindingB = bindingFor(observation({ local: 'bob', peer: 'alice' }));
  const savedA = persist(bridgeFor(homeA, bindingA), bindingA);
  const savedB = persist(bridgeFor(homeB, bindingB), bindingB);

  const listA = bridgeFor(homeA, bindingA).list({ maxRelationships: 8, includeTombstoned: false });
  const listB = bridgeFor(homeB, bindingB).list({ maxRelationships: 8, includeTombstoned: false });
  assert.equal(listA.relationships.length, 1);
  assert.equal(listB.relationships.length, 1);
  assert.equal(listA.relationships[0].relationshipRef, savedA.relationshipRef);
  assert.equal(listB.relationships[0].relationshipRef, savedB.relationshipRef);
  assert.notEqual(listA.relationships[0].relationshipRef, listB.relationships[0].relationshipRef);
  assert.equal(listA.relationships[0].localParticipantRef, 'participant.alice');
  assert.equal(listB.relationships[0].localParticipantRef, 'participant.bob');
  assert.equal(listA.relationships[0].semanticAcknowledged, false);
  assert.equal(listB.relationships[0].semanticAcknowledged, false);
  assert.equal(listA.relationships[0].reciprocalFriendshipAsserted, false);
  assert.equal(listB.relationships[0].reciprocalFriendshipAsserted, false);
});
