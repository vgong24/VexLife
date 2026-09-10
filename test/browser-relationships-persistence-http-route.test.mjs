import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BROWSER_RELATIONSHIPS_PERSISTENCE_API_PATH,
  BROWSER_RELATIONSHIPS_PERSISTENCE_MAX_BODY_BYTES,
  createVexLifeBrowserServer
} from '../scripts/serve-browser.mjs';
import { createRelationshipsPersistenceStateMachine } from '../reference/browser/modules/relationships-controller.js';
import { readRelationship } from '../src/core/relationships-store.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NO_EFFECTS = Object.freeze({
  relationshipMutationPerformed: false,
  canonicalRelationshipPersisted: false,
  networkEffectPerformed: false,
  providerEffectPerformed: false,
  MemoryEffectPerformed: false,
  HomeLayoutEffectPerformed: false,
  modelRuntimePerformed: false,
  publicationPerformed: false,
  publicSearchPerformed: false,
  semanticAcknowledgementCreated: false,
  reciprocalFriendshipCreated: false
});

async function withServer(options, run) {
  const server = createVexLifeBrowserServer(options);
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

function fakeCompanion() {
  return {
    status: () => Object.freeze({ state: 'UNAVAILABLE' }),
    performTurn: async () => { throw new Error('companion route must not execute during Relationships persistence proof'); }
  };
}

function binding() {
  return Object.freeze({
    localParticipantRef: 'participant.local.alice',
    localStateRootRef: 'state.relationships.alice',
    counterpartParticipantRef: 'participant.peer.bob',
    counterpartCurrentKeyRef: 'key.peer.bob.1',
    invitationRef: 'invitation.friend.1',
    invitationCurrentnessRef: 'currentness.invitation.1',
    instanceRef: 'instance.relationships.http-test.1',
    lastAcceptedPeerCurrentnessRef: 'currentness.peer.bob.1',
    routeRef: 'route.direct.bob.1',
    sessionGeneration: 3,
    deliveryObservationRef: 'delivery.observation.bob.1'
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
    observedAt: '2026-09-01T12:00:00.000Z',
    instanceRef: value.instanceRef,
    lastAcceptedPeerCurrentnessRef: value.lastAcceptedPeerCurrentnessRef,
    routeRef: value.routeRef,
    sessionGeneration: value.sessionGeneration,
    deliveryObservationRef: value.deliveryObservationRef
  });
}

function sameOriginPersistenceBridge(baseUrl, value) {
  const ownerBinding = Object.freeze({
    localParticipantRef: value.localParticipantRef,
    localStateRootRef: value.localStateRootRef
  });
  return Object.freeze({
    ownerBinding,
    prepare(input) {
      return Object.freeze({
        state: 'PREPARED_NO_EFFECT',
        input: structuredClone(input),
        effects: NO_EFFECTS
      });
    },
    async commit(prepared) {
      const response = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_PERSISTENCE_API_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ localOwnerBinding: ownerBinding, input: prepared.input })
      });
      const payload = await response.json();
      if (!response.ok) {
        const error = new Error(payload.failureCode || 'RELATIONSHIPS_PERSISTENCE_SAVE_FAILED');
        error.code = payload.failureCode || 'RELATIONSHIPS_PERSISTENCE_SAVE_FAILED';
        throw error;
      }
      return payload;
    }
  });
}

test('explicit-binding visible persistence crosses the same-origin route and reaches SAVED only after durable receipt plus exact readback', async () => {
  const vexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-relationships-http-'));
  const persistenceBinding = binding();
  let savedSnapshot = null;
  try {
    await withServer({
      staticRoot: repoRoot,
      companionBridge: fakeCompanion(),
      relationshipsPersistenceHome: vexHome
    }, async (baseUrl) => {
      const persistence = createRelationshipsPersistenceStateMachine({
        persistenceBridge: sameOriginPersistenceBridge(baseUrl, persistenceBinding),
        persistenceBinding,
        clock: () => new Date('2026-09-01T12:00:00.000Z')
      });
      assert.equal(persistence.snapshot().state, 'READY');
      savedSnapshot = await persistence.save({ localRelationshipClass: 'FRIEND' });
      assert.equal(savedSnapshot.state, 'SAVED');
      assert.equal(savedSnapshot.saved, true);
      assert.equal(savedSnapshot.revision, 0);
      assert.equal(savedSnapshot.savedLocalRelationshipClass, 'FRIEND');
    });

    const current = readRelationship({
      home: vexHome,
      localParticipantRef: persistenceBinding.localParticipantRef,
      localStateRootRef: persistenceBinding.localStateRootRef,
      counterpartParticipantRef: persistenceBinding.counterpartParticipantRef
    });
    assert.equal(current.relationshipRef, savedSnapshot.relationshipRef);
    assert.equal(current.record.revision, 0);
    assert.equal(current.record.localParticipantRef, persistenceBinding.localParticipantRef);
    assert.equal(current.record.localStateRootRef, persistenceBinding.localStateRootRef);
    assert.equal(current.record.counterpartParticipantRef, persistenceBinding.counterpartParticipantRef);
    assert.equal(current.record.localRelationshipClass, 'FRIEND');
    assert.equal(current.record.semanticAcknowledged, false);
    assert.equal(current.record.reciprocalFriendshipAsserted, false);
  } finally {
    fs.rmSync(vexHome, { recursive: true, force: true });
  }
});

test('persistence route enforces method, media type, malformed JSON and body bound before canonical mutation', async () => {
  const vexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-relationships-http-boundary-'));
  let factoryCalls = 0;
  try {
    await withServer({
      staticRoot: repoRoot,
      companionBridge: fakeCompanion(),
      relationshipsPersistenceHome: vexHome,
      relationshipsPersistenceBridgeFactory() {
        factoryCalls += 1;
        throw new Error('factory must not run for request-form rejection');
      }
    }, async (baseUrl) => {
      const get = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_PERSISTENCE_API_PATH}`);
      assert.equal(get.status, 405);
      assert.equal(get.headers.get('allow'), 'POST');

      const wrongType = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_PERSISTENCE_API_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '{}'
      });
      assert.equal(wrongType.status, 415);
      assert.equal((await wrongType.json()).failureCode, 'RELATIONSHIPS_PERSISTENCE_REQUEST_NOT_ADMITTED');

      const malformed = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_PERSISTENCE_API_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{'
      });
      assert.equal(malformed.status, 400);
      assert.equal((await malformed.json()).failureCode, 'RELATIONSHIPS_PERSISTENCE_REQUEST_NOT_ADMITTED');

      const oversized = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_PERSISTENCE_API_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ padding: 'x'.repeat(BROWSER_RELATIONSHIPS_PERSISTENCE_MAX_BODY_BYTES + 1024) })
      });
      assert.equal(oversized.status, 413);
      assert.equal((await oversized.json()).failureCode, 'RELATIONSHIPS_PERSISTENCE_REQUEST_NOT_ADMITTED');
    });
    assert.equal(factoryCalls, 0);
    assert.equal(fs.existsSync(path.join(vexHome, 'relationships')), false);
  } finally {
    fs.rmSync(vexHome, { recursive: true, force: true });
  }
});

test('route rejects inferred local identity fields instead of deriving participant ownership from ambient product state', async () => {
  const vexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-relationships-http-identity-'));
  try {
    await withServer({
      staticRoot: repoRoot,
      companionBridge: fakeCompanion(),
      relationshipsPersistenceHome: vexHome
    }, async (baseUrl) => {
      const value = binding();
      const response = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_PERSISTENCE_API_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localOwnerBinding: {
            localParticipantRef: value.localParticipantRef,
            localStateRootRef: value.localStateRootRef,
            deviceRef: 'device.ambient.must-not-bind'
          },
          input: saveInput()
        })
      });
      assert.equal(response.status, 400);
      const payload = await response.json();
      assert.equal(payload.failureCode, 'RELATIONSHIPS_PERSISTENCE_INPUT_INVALID');
      assert.equal(payload.state, 'HELD_PERSISTENCE_FAILURE');
    });
    assert.equal(fs.existsSync(path.join(vexHome, 'relationships')), false);
  } finally {
    fs.rmSync(vexHome, { recursive: true, force: true });
  }
});

test('unknown persistence host failure is normalized without leaking internal cause details', async () => {
  const vexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-relationships-http-failure-'));
  try {
    await withServer({
      staticRoot: repoRoot,
      companionBridge: fakeCompanion(),
      relationshipsPersistenceHome: vexHome,
      relationshipsPersistenceBridgeFactory() {
        throw new Error('private local path and implementation detail');
      }
    }, async (baseUrl) => {
      const value = binding();
      const response = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_PERSISTENCE_API_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localOwnerBinding: {
            localParticipantRef: value.localParticipantRef,
            localStateRootRef: value.localStateRootRef
          },
          input: saveInput()
        })
      });
      assert.equal(response.status, 500);
      const payload = await response.json();
      assert.equal(payload.failureCode, 'RELATIONSHIPS_PERSISTENCE_SAVE_FAILED');
      assert.equal(payload.message, 'Relationships persistence save failed safely');
      assert.equal(JSON.stringify(payload).includes('private local path'), false);
    });
  } finally {
    fs.rmSync(vexHome, { recursive: true, force: true });
  }
});

// [VXG RealForever]
