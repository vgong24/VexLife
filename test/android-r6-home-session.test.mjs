import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  ANDROID_R6_ALLOWED_PRIVATE_TRANSPORT_REFS,
  ANDROID_R6_CANONICAL_WRITER,
  ANDROID_R6_OUTPUT_PATHS,
  projectAndroidR6HomeSessionAuthority,
  renderAndroidR6Outputs,
  validateAndroidR6SourceBindings,
} from '../src/core/android-r6-home-session.mjs';
import {
  HOME_BRIDGE_SESSION_AUTHORITY_SCHEMA,
} from '../src/core/home-bridge-session-authority.mjs';

const homeBridgeRegistry = JSON.parse(fs.readFileSync(new URL('../blueprint/home-bridge-registry.json', import.meta.url), 'utf8'));

function authority(overrides = {}) {
  return {
    schemaVersion: HOME_BRIDGE_SESSION_AUTHORITY_SCHEMA,
    state: 'CURRENT',
    authorityReceiptRef: 'authority-receipt.vexlife.r6.fixture',
    stableSessionBindingRef: 'session-binding.vexlife.r6.fixture',
    principalRef: 'person.victor-gong',
    deviceRef: 'device.android.r6.fixture',
    membership: {
      membershipRef: 'membership.vexlife.r6.fixture',
      principalRef: 'person.victor-gong',
      deviceRef: 'device.android.r6.fixture',
      revocationGeneration: 7,
    },
    lease: {
      leaseRef: 'lease.vexlife.r6.fixture',
      principalRef: 'person.victor-gong',
      deviceRef: 'device.android.r6.fixture',
      revocationGeneration: 7,
      expiresAt: '2030-01-01T00:00:00.000Z',
    },
    currentRevocationGeneration: 7,
    sourceReceiptRefs: ['receipt.home-bridge.r6.fixture'],
    currentnessRefs: ['currentness.home-bridge.r6.fixture'],
    effects: {
      pairingMutation: false,
      principalRebinding: false,
      authenticationMutation: false,
      authorizationMutation: false,
      capabilityLeaseMutation: false,
      revocationMutation: false,
      HomePayloadReadOrWrite: false,
      networkMutation: false,
      MemoryMutation: false,
      RelationshipsMutation: false,
      modelRuntimeEffect: false,
      training: false,
      publication: false,
    },
    ...overrides,
  };
}

test('R6-A source binding consumes accepted Home Bridge private transports exactly', () => {
  const binding = validateAndroidR6SourceBindings(homeBridgeRegistry);
  assert.equal(binding.homeBridgeRef, 'bridge.vexlife.personal-home.001');
  assert.deepEqual(binding.allowedPrivateTransportRefs, [
    'transport.vexlife.tailscale',
    'transport.vexlife.wireguard',
  ]);
  assert.deepEqual(ANDROID_R6_ALLOWED_PRIVATE_TRANSPORT_REFS, binding.allowedPrivateTransportRefs);
  assert.equal(binding.canonicalWriter, ANDROID_R6_CANONICAL_WRITER);
  assert.equal(binding.canonicalWriter, 'DESKTOP_HOME_NODE');
});

test('current principal-bound authority projects a no-effect Android transport-ready value', () => {
  const projection = projectAndroidR6HomeSessionAuthority(authority(), {
    homeBridgeRegistry,
    privateTransportRef: 'transport.vexlife.tailscale',
  });
  assert.equal(projection.state, 'READY_FOR_PRIVATE_TRANSPORT');
  assert.equal(projection.principalRef, 'person.victor-gong');
  assert.equal(projection.deviceRef, 'device.android.r6.fixture');
  assert.equal(projection.canonicalWriter, 'DESKTOP_HOME_NODE');
  assert.equal(projection.remoteWriterGranted, false);
  assert.deepEqual(Object.values(projection.effects), Array(Object.keys(projection.effects).length).fill(false));
  const serialized = JSON.stringify(projection);
  for (const forbidden of ['devicePublicKey', 'privateKey', 'credentialValue', 'bearerToken', 'rawSessionHandle', 'rawModelEndpoint']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('identity, revocation, evidence, effect and transport mismatches fail closed', () => {
  const options = { homeBridgeRegistry, privateTransportRef: 'transport.vexlife.tailscale' };
  assert.throws(() => projectAndroidR6HomeSessionAuthority(authority({ lease: { ...authority().lease, principalRef: 'person.other' } }), options), /PRINCIPAL_BINDING_MISMATCH/);
  assert.throws(() => projectAndroidR6HomeSessionAuthority(authority({ membership: { ...authority().membership, deviceRef: 'device.other' } }), options), /DEVICE_BINDING_MISMATCH/);
  assert.throws(() => projectAndroidR6HomeSessionAuthority(authority({ currentRevocationGeneration: 8 }), options), /REVOCATION_GENERATION_MISMATCH/);
  assert.throws(() => projectAndroidR6HomeSessionAuthority(authority({ currentnessRefs: ['same', 'same'] }), options), /REFS_DUPLICATE/);
  assert.throws(() => projectAndroidR6HomeSessionAuthority(authority({ effects: { ...authority().effects, networkMutation: true } }), options), /SOURCE_EFFECT_NOT_FALSE/);
  assert.throws(() => projectAndroidR6HomeSessionAuthority(authority({ effects: { ...authority().effects, pairingMutationPerformed: false } }), options), /EFFECT_FIELDS/);
  assert.throws(() => projectAndroidR6HomeSessionAuthority(authority(), { homeBridgeRegistry, privateTransportRef: 'transport.vexlife.loopback' }), /PRIVATE_TRANSPORT_NOT_ACCEPTED/);
  assert.throws(() => projectAndroidR6HomeSessionAuthority({ ...authority(), bearerToken: 'forbidden' }, options), /AUTHORITY_FIELDS/);
  assert.throws(() => projectAndroidR6HomeSessionAuthority(authority(), {
    homeBridgeRegistry: {
      ...homeBridgeRegistry,
      invariants: homeBridgeRegistry.invariants.filter((item) => item !== 'remote surface never becomes the Home writer'),
    },
    privateTransportRef: 'transport.vexlife.tailscale',
  }), /HOME_WRITER_INVARIANT_DRIFT/);
});

test('R6-A renderer is deterministic, exactly bounded, and contains no network implementation', () => {
  const one = renderAndroidR6Outputs({ homeBridgeRegistry });
  const two = renderAndroidR6Outputs({ homeBridgeRegistry });
  assert.deepEqual(one, two);
  assert.deepEqual(Object.keys(one.files).sort(), [...ANDROID_R6_OUTPUT_PATHS].sort());
  for (const text of Object.values(one.files)) {
    for (const forbidden of ['java.net.', 'Socket(', 'HttpURLConnection', 'OkHttp', 'Ktor', 'android.permission.INTERNET']) {
      assert.equal(text.includes(forbidden), false, forbidden);
    }
  }
  assert.deepEqual(Object.values(one.effects), Array(Object.keys(one.effects).length).fill(false));
});

// [VXG RealForever]
