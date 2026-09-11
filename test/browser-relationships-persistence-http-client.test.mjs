import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BROWSER_RELATIONSHIPS_PERSISTENCE_API_PATH,
  BROWSER_RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_LIST_SCHEMA,
  BROWSER_RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_NO_EFFECTS,
  BROWSER_RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_PREPARED_SCHEMA,
  createRelationshipsPersistenceHttpClient
} from '../reference/browser/modules/relationships-persistence-http-client.js';
import { createRelationshipsPersistenceStateMachine } from '../reference/browser/modules/relationships-controller.js';
import { createVexLifeBrowserServer } from '../scripts/serve-browser.mjs';
import { readRelationship } from '../src/core/relationships-store.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

function listPayload(overrides = {}) {
  const owner = ownerBinding();
  const relationship = Object.freeze({
    relationshipRef: 'relationship.vexlife.local.0123456789abcdef0123456789abcdef',
    counterpartParticipantRef: 'participant.peer.bob',
    localRelationshipClass: 'FRIEND',
    status: 'ACTIVE',
    revision: 0,
    updatedAt: '2026-09-02T12:00:00.000Z',
    tombstoned: false
  });
  return {
    schemaVersion: BROWSER_RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_LIST_SCHEMA,
    state: 'CURRENT_LIST',
    localParticipantRef: owner.localParticipantRef,
    localStateRootRef: owner.localStateRootRef,
    totalCount: 1,
    returnedCount: 1,
    truncated: false,
    relationships: [relationship],
    ...overrides
  };
}

function fakeCompanion() {
  return Object.freeze({
    status: () => Object.freeze({ state: 'UNAVAILABLE' }),
    performTurn: async () => { throw new Error('companion route must not execute during Relationships persistence proof'); }
  });
}

async function withServer(home, run) {
  const server = createVexLifeBrowserServer({
    staticRoot: repoRoot,
    companionBridge: fakeCompanion(),
    relationshipsPersistenceHome: home
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('FFR06-CLIENT-00 production HTTP client + accepted shared server + visible persistence state machine reaches SAVED only from durable receipt/readback', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-relationships-http-client-'));
  const persistenceBinding = binding();
  let saved = null;
  try {
    await withServer(home, async (baseUrl) => {
      const client = createRelationshipsPersistenceHttpClient({
        ownerBinding: ownerBinding(),
        fetchImpl: (url, init) => fetch(`${baseUrl}${url}`, init)
      });
      const persistence = createRelationshipsPersistenceStateMachine({
        persistenceBridge: client,
        persistenceBinding,
        clock: () => new Date('2026-09-02T12:00:00.000Z')
      });
      assert.equal(persistence.snapshot().state, 'READY');
      saved = await persistence.save({ localRelationshipClass: 'FRIEND' });
      assert.equal(saved.state, 'SAVED');
      assert.equal(saved.saved, true);
      assert.equal(saved.revision, 0);
    });

    const current = readRelationship({
      home,
      localParticipantRef: persistenceBinding.localParticipantRef,
      localStateRootRef: persistenceBinding.localStateRootRef,
      counterpartParticipantRef: persistenceBinding.counterpartParticipantRef
    });
    assert.equal(current.relationshipRef, saved.relationshipRef);
    assert.equal(current.record.revision, 0);
    assert.equal(current.record.localParticipantRef, persistenceBinding.localParticipantRef);
    assert.equal(current.record.localStateRootRef, persistenceBinding.localStateRootRef);
    assert.equal(current.record.counterpartParticipantRef, persistenceBinding.counterpartParticipantRef);
    assert.equal(current.record.localRelationshipClass, 'FRIEND');
    assert.equal(current.record.semanticAcknowledged, false);
    assert.equal(current.record.reciprocalFriendshipAsserted, false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('FFR06-CLIENT-01 commit emits only the exact accepted same-origin request shape', async () => {
  const requests = [];
  const serverResult = Object.freeze({ state: 'SAVED', marker: 'server-owned-result' });
  const client = createRelationshipsPersistenceHttpClient({
    ownerBinding: ownerBinding(),
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return Object.freeze({ ok: true, status: 200, json: async () => serverResult });
    }
  });
  const returned = await client.commit(client.prepare(saveInput()));
  assert.equal(returned, serverResult);
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

test('FFR06-CLIENT-02 prepare is closed, no-effect, and cannot mint Saved or relationship identity', () => {
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

test('FFR06-CLIENT-03 ambient device/Home/model/provider fields cannot become local owner identity', () => {
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

test('FFR06-CLIENT-04 raw paths/endpoints cannot substitute for portable owner refs', () => {
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

test('FFR06-CLIENT-05 prepare rejects unadmitted save fields before any HTTP effect', () => {
  let fetchCalls = 0;
  const client = createRelationshipsPersistenceHttpClient({ ownerBinding: ownerBinding(), fetchImpl: async () => { fetchCalls += 1; return null; } });
  assert.throws(
    () => client.prepare({ ...saveInput(), deviceRef: 'device.must-not-bind' }),
    (error) => error?.code === 'RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_INPUT_INVALID'
  );
  assert.equal(fetchCalls, 0);
});

test('FFR06-CLIENT-06 tampered prepared effects fail closed before HTTP', async () => {
  let fetchCalls = 0;
  const client = createRelationshipsPersistenceHttpClient({ ownerBinding: ownerBinding(), fetchImpl: async () => { fetchCalls += 1; return null; } });
  const prepared = client.prepare(saveInput());
  await assert.rejects(
    client.commit({ ...prepared, effects: { ...prepared.effects, networkEffectPerformed: true } }),
    (error) => error?.code === 'RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_PREPARED_INVALID'
  );
  assert.equal(fetchCalls, 0);
});

test('FFR06-CLIENT-07 remote held response propagates only a bounded failure code, not remote private detail', async () => {
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
  await assert.rejects(client.commit(client.prepare(saveInput())), (error) => {
    assert.equal(error.code, 'RELATIONSHIPS_PERSISTENCE_SAVE_FAILED');
    assert.equal(error.message, 'RELATIONSHIPS_PERSISTENCE_SAVE_FAILED');
    assert.equal(error.httpStatus, 500);
    assert.equal(error.message.includes('private path'), false);
    return true;
  });
});

test('FFR06-CLIENT-08 transport exception is normalized without leaking implementation detail', async () => {
  const client = createRelationshipsPersistenceHttpClient({
    ownerBinding: ownerBinding(),
    fetchImpl: async () => { throw new Error('private browser/network implementation detail'); }
  });
  await assert.rejects(client.commit(client.prepare(saveInput())), (error) => {
    assert.equal(error.code, 'RELATIONSHIPS_PERSISTENCE_HTTP_UNAVAILABLE');
    assert.equal(error.message, 'Relationships persistence request is unavailable');
    assert.equal(error.message.includes('private browser'), false);
    return true;
  });
});

test('FFR06-CLIENT-09 alternate endpoint injection is rejected instead of becoming a second transport', () => {
  assert.throws(
    () => createRelationshipsPersistenceHttpClient({ ownerBinding: ownerBinding(), fetchImpl: async () => null, apiPath: '/api/v1/relationships/alternate' }),
    (error) => error?.code === 'RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_PATH_INVALID'
  );
});

test('UX03-CLIENT-10 list emits one exact read-only same-origin request and validates rightful current durable rows', async () => {
  const requests = [];
  const serverResult = listPayload();
  const client = createRelationshipsPersistenceHttpClient({
    ownerBinding: ownerBinding(),
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return Object.freeze({ ok: true, status: 200, json: async () => serverResult });
    }
  });
  const listed = await client.list();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, BROWSER_RELATIONSHIPS_PERSISTENCE_API_PATH);
  assert.deepEqual(requests[0].init, { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
  assert.equal(listed.state, 'CURRENT_LIST');
  assert.equal(listed.totalCount, 1);
  assert.equal(listed.returnedCount, 1);
  assert.equal(listed.relationships[0].counterpartParticipantRef, 'participant.peer.bob');
  assert.equal(listed.relationships[0].localRelationshipClass, 'FRIEND');
  assert.equal(listed.relationships[0].status, 'ACTIVE');
  assert.equal(listed.relationships[0].tombstoned, false);
  assert.equal(Object.isFrozen(listed.relationships), true);
});

test('UX03-CLIENT-11 list fails closed on owner substitution, duplicates, tombstones, invalid classes/statuses, and unadmitted response fields', async () => {
  const invalidPayloads = [
    listPayload({ localStateRootRef: 'state.relationships.other' }),
    listPayload({ relationships: [listPayload().relationships[0], listPayload().relationships[0]], totalCount: 2, returnedCount: 2 }),
    listPayload({ relationships: [{ ...listPayload().relationships[0], tombstoned: true }] }),
    listPayload({ relationships: [{ ...listPayload().relationships[0], localRelationshipClass: 'UNKNOWN' }] }),
    listPayload({ relationships: [{ ...listPayload().relationships[0], status: 'UNKNOWN' }] }),
    { ...listPayload(), ambientHome: 'must-not-cross' }
  ];
  for (const payload of invalidPayloads) {
    const client = createRelationshipsPersistenceHttpClient({
      ownerBinding: ownerBinding(),
      fetchImpl: async () => Object.freeze({ ok: true, status: 200, json: async () => payload })
    });
    await assert.rejects(client.list(), (error) => error?.code === 'RELATIONSHIPS_PERSISTENCE_HTTP_RESPONSE_INVALID');
  }
});

test('UX03-CLIENT-12 list remote hold preserves only bounded failure code and transport failure stays non-secret', async () => {
  const held = createRelationshipsPersistenceHttpClient({
    ownerBinding: ownerBinding(),
    fetchImpl: async () => Object.freeze({
      ok: false,
      status: 409,
      json: async () => ({ state: 'HELD_BINDING_REQUIRED', failureCode: 'RELATIONSHIPS_CDR_OBSERVATION_UNBOUND', privateDetail: 'must not surface' })
    })
  });
  await assert.rejects(held.list(), (error) => {
    assert.equal(error.code, 'RELATIONSHIPS_CDR_OBSERVATION_UNBOUND');
    assert.equal(error.message, 'RELATIONSHIPS_CDR_OBSERVATION_UNBOUND');
    assert.equal(error.message.includes('privateDetail'), false);
    return true;
  });

  const unavailable = createRelationshipsPersistenceHttpClient({
    ownerBinding: ownerBinding(),
    fetchImpl: async () => { throw new Error('private transport implementation'); }
  });
  await assert.rejects(unavailable.list(), (error) => {
    assert.equal(error.code, 'RELATIONSHIPS_PERSISTENCE_HTTP_UNAVAILABLE');
    assert.equal(error.message, 'Relationships persistence list is unavailable');
    assert.equal(error.message.includes('private transport'), false);
    return true;
  });
});

// [VXG RealForever]
