import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_API_PATH,
  BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_SCHEMA,
  createBrowserRelationshipsCdrObservationBridge
} from '../src/core/browser-relationships-cdr-observation-bridge.mjs';
import { createVexLifeBrowserServer } from '../scripts/serve-browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function observation() {
  return {
    schemaVersion: 'vexlife.friend-cdr-observation/v1',
    sourceWitness: {
      receiptRef: 'receipt.cdr.friend.real.001',
      procedureRef: 'procedure.cdr.s5.single-pair-rehearsal.001',
      currentnessRef: 'currentness.cdr.friend.real.001',
      scenarioRef: 'scenario.friend.real.001',
      candidateRef: 'candidate.friend.real.001'
    },
    productGate: {
      alphaConsentAcknowledged: true,
      invitationState: 'RECEIVED_VERIFIED_REFERENCE',
      invitationDecision: 'ACCEPT',
      identityState: 'VERIFIED_CURRENT',
      presenceClass: 'APP_ON_MODEL_UNLOADED',
      routeClass: 'DIRECT_CANDIDATE',
      failureState: 'NONE',
      withdrawn: false,
      revoked: false,
      disconnected: false,
      blocked: false
    },
    local: {
      stateRootRef: 'state.relationships.local',
      deviceRef: 'device.local.1',
      participantRef: 'participant.local',
      peerParticipantRef: 'participant.peer',
      processInstanceRef: 'instance.relationships.local.1',
      authorityRef: 'authority.cdr.local.1'
    },
    peer: {
      stateRootRef: 'state.relationships.peer',
      deviceRef: 'device.peer.1',
      participantRef: 'participant.peer',
      peerParticipantRef: 'participant.local',
      processInstanceRef: 'instance.relationships.peer.1',
      authorityRef: 'authority.cdr.peer.1',
      currentKeyRef: 'key.peer.current.1',
      currentnessRef: 'currentness.peer.1'
    },
    invitation: {
      invitationRef: 'invitation.friend.1',
      currentnessRef: 'currentness.invitation.1',
      localParticipantRef: 'participant.local',
      counterpartParticipantRef: 'participant.peer'
    },
    currentness: {
      observationState: 'CURRENT',
      invitationState: 'CURRENT',
      peerState: 'CURRENT'
    },
    runtime: {
      routeRef: null,
      sessionGeneration: null,
      deliveryObservationRef: null
    }
  };
}

function writeObservation(root, value = observation()) {
  const file = path.join(root, 'friend-cdr-observation.json');
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  return file;
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address();
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('FFR06 CDR observation bridge projects only the admitted FFR-04 persistence binding', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-ffr06-cdr-binding-'));
  try {
    const observationPath = writeObservation(root);
    const result = createBrowserRelationshipsCdrObservationBridge({ observationPath }).read();
    assert.equal(result.schemaVersion, BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_SCHEMA);
    assert.equal(result.state, 'BOUND_CURRENT');
    assert.deepEqual(result.binding, {
      localParticipantRef: 'participant.local',
      localStateRootRef: 'state.relationships.local',
      counterpartParticipantRef: 'participant.peer',
      counterpartCurrentKeyRef: 'key.peer.current.1',
      invitationRef: 'invitation.friend.1',
      invitationCurrentnessRef: 'currentness.invitation.1',
      instanceRef: 'instance.relationships.local.1',
      lastAcceptedPeerCurrentnessRef: 'currentness.peer.1',
      routeRef: null,
      sessionGeneration: null,
      deliveryObservationRef: null
    });
    const serialized = JSON.stringify(result);
    for (const forbidden of ['friend-cdr-observation.json', 'device.local.1', 'authority.cdr.local.1', 'sourceWitness', 'productGate', 'currentness']) {
      assert.equal(serialized.includes(forbidden), false, `browser projection leaked ${forbidden}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('FFR06 CDR observation bridge fails closed for absent, relative, symlinked, oversized and stale evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-ffr06-cdr-held-'));
  try {
    assert.throws(() => createBrowserRelationshipsCdrObservationBridge().read(), { code: 'RELATIONSHIPS_CDR_OBSERVATION_UNBOUND' });
    assert.throws(() => createBrowserRelationshipsCdrObservationBridge({ observationPath: 'relative.json' }).read(), { code: 'RELATIONSHIPS_CDR_OBSERVATION_PATH_INVALID' });

    const stale = observation();
    stale.currentness.peerState = 'STALE';
    const stalePath = writeObservation(root, stale);
    assert.throws(() => createBrowserRelationshipsCdrObservationBridge({ observationPath: stalePath }).read(), { code: 'FFR04_CURRENTNESS_HELD' });

    const oversizedPath = path.join(root, 'oversized.json');
    fs.writeFileSync(oversizedPath, ' '.repeat(2048));
    assert.throws(() => createBrowserRelationshipsCdrObservationBridge({ observationPath: oversizedPath, maxBytes: 1024 }).read(), { code: 'RELATIONSHIPS_CDR_OBSERVATION_TOO_LARGE' });

    const target = writeObservation(root, observation());
    const link = path.join(root, 'observation-link.json');
    try {
      fs.symlinkSync(target, link, 'file');
      assert.throws(() => createBrowserRelationshipsCdrObservationBridge({ observationPath: link }).read(), { code: 'RELATIONSHIPS_CDR_OBSERVATION_PATH_INVALID' });
    } catch (error) {
      if (!['EPERM', 'EACCES', 'UNKNOWN'].includes(error?.code)) throw error;
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('FFR06 same-origin CDR persistence-binding route is GET-only, binding-only and safely held when unbound', { timeout: 30_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-ffr06-cdr-route-'));
  const observationPath = writeObservation(root);
  const bridge = createBrowserRelationshipsCdrObservationBridge({ observationPath });
  const server = createVexLifeBrowserServer({ staticRoot: ROOT, relationshipsCdrObservationBridge: bridge });
  let address;
  try {
    address = await listen(server);
    const origin = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${origin}${BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_API_PATH}`, { cache: 'no-store' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const payload = await response.json();
    assert.equal(payload.state, 'BOUND_CURRENT');
    assert.deepEqual(Object.keys(payload).sort(), ['binding', 'schemaVersion', 'state']);
    assert.equal(JSON.stringify(payload).includes(observationPath), false);
    assert.equal(JSON.stringify(payload).includes('device.local.1'), false);

    const rejected = await fetch(`${origin}${BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_API_PATH}`, { method: 'POST' });
    assert.equal(rejected.status, 405);
    assert.equal(rejected.headers.get('allow'), 'GET');
  } finally {
    await close(server);
  }

  const heldServer = createVexLifeBrowserServer({
    staticRoot: ROOT,
    relationshipsCdrObservationBridge: createBrowserRelationshipsCdrObservationBridge()
  });
  try {
    address = await listen(heldServer);
    const response = await fetch(`http://127.0.0.1:${address.port}${BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_API_PATH}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      schemaVersion: 'vexlife.browser-relationships-cdr-persistence-binding-failure/v1',
      state: 'HELD_BINDING_REQUIRED',
      failureCode: 'RELATIONSHIPS_CDR_OBSERVATION_UNBOUND'
    });
  } finally {
    await close(heldServer);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// [VXG RealForever]
