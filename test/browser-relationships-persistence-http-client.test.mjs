import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BROWSER_RELATIONSHIPS_PERSISTENCE_API_PATH,
  BROWSER_RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_NO_EFFECTS,
  BROWSER_RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_PREPARED_SCHEMA,
  createRelationshipsPersistenceHttpClient
} from '../reference/browser/modules/relationships-persistence-http-client.js';
import { createRelationshipsPersistenceStateMachine } from '../reference/browser/modules/relationships-controller.js';

function binding() {
  return Object.freeze({
    localParticipantRef: 'participant.local.alice',
    localStateRootRef: 'state.relationships.alice',
    counterpartParticipantRef: 'participant.peer.bob',
    counterpartCurrentKeyRef: 'key.peer.bob.1',
    invitationRef: 'invitation.friend.1',
    invitationCurrentnessRef: 'currentness.invitation.1',
    instanceRef: 'instance.relationships.http-client-test.1',
    lastAcceptedPeerCurrentnessRef: 'currentness.peer.bob.1',
    routeRef: 'route.direct.bob.1',
    sessionGeneration: 3,
    deliveryObservationRef: 'delivery.observation.bob.1'
  });
}

function ownerBinding() {
  const value = binding();
  return Object.freeze({
    localParticipantRef: value.localParticipantRef,
    localStateRootRef: value.localStateRootRef
  });
}

function saveInput(localRelationshipClass = 'FRIEND') {
  const value = binding();
  return Object.freeze({
    counterpartParticipantRef: value.counterpartParticipantRef,
    counterpartCurrentKeyRef: value.counterpartCurrentKeyRef,
    localRelationshipClass,
    invitationRef: value.invitationRef,
    invitationCurrentnessRef: value.invitationCurrentnessRef,
    observedAt: '2026-09-02T12:00:00.000Z',
    instanceRef: value.instanceRef,
    lastAcceptedPeerCurrentnessRef: value.lastAcceptedPeerCurrentnessRef,
    routeRef: value.routeRef,
    sessionGeneration: value.sessionGeneration,
    deliveryObservationRef: value.deliveryObservationRef
  });
}

function savedPayload() {
  const value = binding();
  const relationshipRef = 'relationship.local.alice.peer.bob';
  return Object.freeze({
    schemaVersion: 'vexlife.browser-relationships-persistence/v1',
    state: 'SAVED',
    relationshipRef,
    receipt: Object.freeze({
      state: 'COMMITTED',
      relationshipPersisted: true,
      relationshipRef,
      revision: 0
    }),
    current: Object.freeze({
      relationshipRef,
      record: Object.freeze({
        revision: 0,
        localParticipantRef: value.localParticipantRef,
        localStateRootRef: value.localStateRootRef,
        counterpartParticipantRef: value.counterpartParticipantRef,
        localRelationshipClass: 'FRIEND',
        semanticAcknowledged: false,
        reciprocalFriendshipAsserted: false
      })
    }),
    effects: BROWSER_RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_NO_EFFECTS
  });
}

test('FFR06-CLIENT-00 explicit owner binding crosses only the accepted same-origin route and controller reaches SAVED from returned durable truth', async () => {
  const requests = [];
  const client = createRelationshipsPersistenceHttpClient({
    ownerBinding: ownerBinding(),
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return Object.freeze({
        ok: true,
        status: 200,
        json: async () => savedPayload()
      });
    }
  });
  const persistence = createRelationshipsPersistenceStateMachine({
    persistenceBridge: client,
    persistenceBinding: binding(),
    clock: () => new Date('2026-09-02T12:00:00.000Z')
  });

  assert.equal(persistence.snapshot().state, 'READY');
  const result = await persistence.save({ localRelationshipClass: 'FRIEND' });
  assert.equal(result.state, 'SAVED');
  assert.equal(result.saved, true);
  assert.equal(result.revision, 0);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, BROWSER_RELATIONSHIPS_PERSISTENCE_API_PATH);
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(requests[0].init.headers['Content-Type'], 'application/json');
  assert.equal(requests[0].init.credentials, 'same-origin');
  assert.equal(requests[0].init.cache, 'no-store');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    localOwnerBinding: ownerBinding(),
    input: saveInput()
  });
});

test('FFR06-CLIENT-01 prepare is closed, no-effect, and cannot mint Saved or relationship identity', () => {
  const client = createRelationshipsPersistenceHttpClient({ ownerBinding: ownerBinding(), fetchImpl: async () => { throw new Error('must not execute'); } });
  const prepared = client.prepare(saveInput());
  assert.equal(prepared.schemaVersion, BROWSER_RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_PREPARED_SCHEMA);
  assert.equal(prepared.state, 'PREPARED_NO_EFFECT');
  assert.deepEqual(prepared.effects, BROWSER_RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_NO_EFFECTS);
  assert.ok(Object.values(prepared.effects).every((value) => value === false));
  assert.equal(Object.hasOwn(prepared, 'saved'), false);
  assert.equal(Object.hasOwn(prepared, 'relationshipRef'), false);
  assert.equal(Object.hasOwn(prepared, 'receipt'), false);
});

test('FFR06-CLIENT-02 ambient device/Home/model/provider fields cannot become local owner identity', () => {
  for (const [key, value] of [
    ['deviceRef', 'device.ambient.1'],
    ['homeRef', 'home.ambient.1'],
    ['modelRef', 'model.ambient.1'],
    ['providerRef', 'provider.ambient.1']
  ]) {
    assert.throws(
      () => createRelationshipsPersistenceHttpClient({ ownerBinding: { ...ownerBinding(), [key]: value }, fetchImpl: async () => null }),
      (error) => error?.code === 'RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_INPUT_INVALID'
    );
  }
});

test('FFR06-CLIENT-03 raw paths/endpoints cannot substitute for portable owner refs', () => {
  for (const value of [
    { localParticipantRef: 'participant.local.alice', localStateRootRef: 'C:\\Users\\alice\\.vexlife' },
    { localParticipantRef: 'https://127.0.0.1:18110/alice', localStateRootRef: 'state.relationships.alice' }
  ]) {
    assert.throws(
      () => createRelationshipsPersistenceHttpClient({ ownerBinding: value, fetchImpl: async () => null }),
      (error) => error?.code === 'RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_IDENTITY_INVALID'
    );
  }
});

test('FFR06-CLIENT-04 prepare rejects unadmitted save fields before any HTTP effect', () => {
  let fetchCalls = 0;
  const client = createRelationshipsPersistenceHttpClient({
    ownerBinding: ownerBinding(),
    fetchImpl: async () => { fetchCalls += 1; return null; }
  });
  assert.throws(
    () => client.prepare({ ...saveInput(), deviceRef: 'device.must-not-bind' }),
    (error) => error?.code === 'RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_INPUT_INVALID'
  );
  assert.equal(fetchCalls, 0);
});

test('FFR06-CLIENT-05 tampered prepared effects fail closed before HTTP', async () => {
  let fetchCalls = 0;
  const client = createRelationshipsPersistenceHttpClient({
    ownerBinding: ownerBinding(),
    fetchImpl: async () => { fetchCalls += 1; return null; }
  });
  const prepared = client.prepare(saveInput());
  await assert.rejects(
    client.commit({ ...prepared, effects: { ...prepared.effects, networkEffectPerformed: true } }),
    (error) => error?.code === 'RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_PREPARED_INVALID'
  );
  assert.equal(fetchCalls, 0);
});

test('FFR06-CLIENT-06 remote held response propagates only a bounded failure code, not remote private detail', async () => {
  const client = createRelationshipsPersistenceHttpClient({
    ownerBinding: ownerBinding(),
    fetchImpl: async () => Object.freeze({
      ok: false,
      status: 500,
      json: async () => ({
        state: 'HELD_PERSISTENCE_FAILURE',
        failureCode: 'RELATIONSHIPS_PERSISTENCE_SAVE_FAILED',
        message: 'private path C:\\Users\\alice\\secret must not cross'
      })
    })
  });
  const prepared = client.prepare(saveInput());
  await assert.rejects(
    client.commit(prepared),
    (error) => {
      assert.equal(error.code, 'RELATIONSHIPS_PERSISTENCE_SAVE_FAILED');
      assert.equal(error.message, 'RELATIONSHIPS_PERSISTENCE_SAVE_FAILED');
      assert.equal(error.httpStatus, 500);
      assert.equal(error.message.includes('private path'), false);
      return true;
    }
  );
});

test('FFR06-CLIENT-07 transport exception is normalized without leaking implementation detail', async () => {
  const client = createRelationshipsPersistenceHttpClient({
    ownerBinding: ownerBinding(),
    fetchImpl: async () => { throw new Error('private browser/network implementation detail'); }
  });
  await assert.rejects(
    client.commit(client.prepare(saveInput())),
    (error) => {
      assert.equal(error.code, 'RELATIONSHIPS_PERSISTENCE_HTTP_UNAVAILABLE');
      assert.equal(error.message, 'Relationships persistence request is unavailable');
      assert.equal(error.message.includes('private browser'), false);
      return true;
    }
  );
});

test('FFR06-CLIENT-08 alternate endpoint injection is rejected instead of becoming a second transport', () => {
  assert.throws(
    () => createRelationshipsPersistenceHttpClient({ ownerBinding: ownerBinding(), fetchImpl: async () => null, apiPath: '/api/v1/relationships/alternate' }),
    (error) => error?.code === 'RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_PATH_INVALID'
  );
});

// [VXG RealForever]
