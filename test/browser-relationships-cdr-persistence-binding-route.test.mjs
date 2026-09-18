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

// Privacy is structural: admitted portable reference values may contain
// "currentness"; the raw observation's currentness object must not escape.
function assertPublicBindingOnly(payload, observationPath) {
  assert.deepEqual(Object.keys(payload).sort(), ['binding', 'schemaVersion', 'state']);
  assert.equal(payload.schemaVersion, BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_SCHEMA);
  assert.equal(payload.state, 'BOUND_CURRENT');
  assert.deepEqual(Object.keys(payload.binding).sort(), [
    'counterpartCurrentKeyRef', 'counterpartParticipantRef', 'deliveryObservationRef',
    'instanceRef', 'invitationCurrentnessRef', 'invitationRef',
    'lastAcceptedPeerCurrentnessRef', 'localParticipantRef', 'localStateRootRef',
    'routeRef', 'sessionGeneration'
  ]);
  for (const [key, value] of Object.entries(payload.binding)) {
    if (key === 'sessionGeneration') {
      assert.ok(value === null || (Number.isSafeInteger(value) && value >= 0));
    } else if (key === 'routeRef' || key === 'deliveryObservationRef') {
      assert.ok(value === null || typeof value === 'string');
    } else {
      assert.equal(typeof value, 'string', `${key} must not contain a private nested object`);
    }
  }
  const source = observation(); // Synthetic fixture only; not real CDR evidence.
  const serialized = JSON.stringify(payload);
  const forbiddenValues = [
    observationPath, 'friend-cdr-observation.json',
    source.local.deviceRef, source.peer.deviceRef,
    source.local.authorityRef, source.peer.authorityRef,
    source.peer.stateRootRef, source.peer.processInstanceRef,
    ...Object.values(source.sourceWitness)
  ];
  for (const forbidden of forbiddenValues) {
    assert.equal(serialized.includes(forbidden), false, `browser projection leaked ${forbidden}`);
  }
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
    assertPublicBindingOnly(result, observationPath);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('FFR06 CDR observation bridge fails closed for absent, relative, symlinked, oversized, concurrently-grown and stale evidence', () => {
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

    const growthPath = writeObservation(root, observation());
    const originalLstatSync = fs.lstatSync;
    let grewAfterStat = false;
    fs.lstatSync = (...args) => {
      const result = originalLstatSync(...args);
      if (!grewAfterStat && path.resolve(String(args[0])) === path.resolve(growthPath)) {
        fs.appendFileSync(growthPath, ' '.repeat(4096));
        grewAfterStat = true;
      }
      return result;
    };
    try {
      assert.throws(
        () => createBrowserRelationshipsCdrObservationBridge({ observationPath: growthPath, maxBytes: 4096 }).read(),
        { code: 'RELATIONSHIPS_CDR_OBSERVATION_TOO_LARGE' }
      );
      assert.equal(grewAfterStat, true);
    } finally {
      fs.lstatSync = originalLstatSync;
    }

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

test('FFR06 public-binding privacy oracle permits currentness refs but rejects private fields and values', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-ffr06-cdr-privacy-'));
  try {
    const observationPath = writeObservation(root);
    const payload = createBrowserRelationshipsCdrObservationBridge({ observationPath }).read();
    assertPublicBindingOnly(payload, observationPath);
    assert.equal(payload.binding.invitationCurrentnessRef, 'currentness.invitation.1');
    assert.equal(payload.binding.lastAcceptedPeerCurrentnessRef, 'currentness.peer.1');
    const source = observation();
    for (const field of ['sourceWitness', 'productGate', 'currentness', 'local', 'peer', 'invitation', 'runtime']) {
      assert.throws(() => assertPublicBindingOnly({ ...payload, [field]: source[field] }, observationPath), { code: 'ERR_ASSERTION' });
      assert.throws(() => assertPublicBindingOnly({ ...payload, binding: { ...payload.binding, [field]: source[field] } }, observationPath), { code: 'ERR_ASSERTION' });
      assert.throws(() => assertPublicBindingOnly({ ...payload, binding: { ...payload.binding, invitationRef: source[field] } }, observationPath), { code: 'ERR_ASSERTION' });
    }
    for (const privateValue of [observationPath, source.local.deviceRef, source.peer.deviceRef, source.local.authorityRef, source.peer.authorityRef, ...Object.values(source.sourceWitness)]) {
      const leaked = { ...payload, binding: { ...payload.binding, invitationRef: privateValue } };
      assert.throws(() => assertPublicBindingOnly(leaked, observationPath), { code: 'ERR_ASSERTION' });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('FFR06 Windows path/descriptor identity does not require cross-API inode equality', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-ffr06-cdr-windows-identity-'));
  const observationPath = writeObservation(root);
  const originalFstatSync = fs.fstatSync;
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  try {
    Object.defineProperty(process, 'platform', { ...platformDescriptor, value: 'win32' });
    fs.fstatSync = (fd, ...args) => {
      const stat = originalFstatSync(fd, ...args);
      return new Proxy(stat, {
        get(target, property, receiver) {
          if (property === 'dev') return target.dev + 101;
          if (property === 'ino') return target.ino + 103;
          const value = Reflect.get(target, property, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });
    };
    const payload = createBrowserRelationshipsCdrObservationBridge({ observationPath }).read();
    assertPublicBindingOnly(payload, observationPath);
  } finally {
    fs.fstatSync = originalFstatSync;
    Object.defineProperty(process, 'platform', platformDescriptor);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('FFR06 descriptor read remains bounded after fstat and closes on growth or read failure', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-ffr06-cdr-descriptor-'));
  const originalFstatSync = fs.fstatSync;
  const originalReadSync = fs.readSync;
  const originalCloseSync = fs.closeSync;
  const maxBytes = 4096;
  try {
    for (const mode of ['grow-after-fstat', 'read-error']) {
      const observationPath = writeObservation(root);
      let descriptor;
      let bytesRead = 0;
      let closeCount = 0;
      let readCount = 0;
      fs.fstatSync = (fd, ...args) => {
        const stat = originalFstatSync(fd, ...args);
        assert.equal(descriptor, undefined, 'the bridge must hold one observation descriptor');
        descriptor = fd;
        assert.ok(stat.size < maxBytes);
        if (mode === 'grow-after-fstat') fs.appendFileSync(observationPath, ' '.repeat(maxBytes * 2));
        return stat;
      };
      fs.readSync = (fd, buffer, offset, length, position) => {
        assert.equal(fd, descriptor);
        assert.ok(length <= maxBytes + 1 - bytesRead, 'read request exceeded the remaining ceiling');
        readCount += 1;
        if (mode === 'read-error') throw Object.assign(new Error('synthetic read failure'), { code: 'EIO' });
        const count = originalReadSync(fd, buffer, offset, length, position);
        bytesRead += count;
        return count;
      };
      fs.closeSync = (fd) => {
        if (fd === descriptor) closeCount += 1;
        return originalCloseSync(fd);
      };
      try {
        assert.throws(() => createBrowserRelationshipsCdrObservationBridge({ observationPath, maxBytes }).read(), {
          code: mode === 'grow-after-fstat' ? 'RELATIONSHIPS_CDR_OBSERVATION_TOO_LARGE' : 'RELATIONSHIPS_CDR_OBSERVATION_UNAVAILABLE'
        });
        assert.ok(readCount > 0, 'the negative control must reach the descriptor read');
        assert.equal(bytesRead, mode === 'grow-after-fstat' ? maxBytes + 1 : 0);
        assert.equal(closeCount, 1);
        assert.throws(() => originalFstatSync(descriptor), { code: 'EBADF' });
      } finally {
        fs.fstatSync = originalFstatSync;
        fs.readSync = originalReadSync;
        fs.closeSync = originalCloseSync;
      }
    }
  } finally {
    fs.fstatSync = originalFstatSync;
    fs.readSync = originalReadSync;
    fs.closeSync = originalCloseSync;
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
    assertPublicBindingOnly(payload, observationPath);

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
