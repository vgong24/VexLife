import test from 'node:test';
import assert from 'node:assert/strict';

import { semanticHash } from '../src/core/utils.mjs';
import {
  HOME_BRIDGE_AUTHENTICATED_SESSION_SCHEMA
} from '../src/core/home-bridge-authenticated-session.mjs';
import {
  HOME_BRIDGE_REMOTE_DEVICE_POSSESSION_RECEIPT_SCHEMA,
  HOME_BRIDGE_DEVICE_MEMBERSHIP_SCHEMA,
  HomeBridgeRemoteAuthenticatedSessionError,
  createHomeBridgeRemoteAuthenticatedSessionOwner
} from '../src/core/home-bridge-remote-authenticated-session.mjs';

const T0 = 1_800_000_000_000;

function membership(overrides = {}) {
  const base = {
    schemaVersion: HOME_BRIDGE_DEVICE_MEMBERSHIP_SCHEMA,
    membershipRef: 'membership.device.android.001',
    homeNodeRef: 'home.current',
    principalRef: 'person.victor-gong',
    deviceRef: 'device.android.current',
    devicePublicKey: 'spki.public.synthetic.current',
    capabilityRefs: ['capability.vexlife.family-conversation'],
    approvedBy: 'authority.home.owner',
    approvedAt: '2027-01-15T08:00:00.000Z',
    revocationGeneration: 3,
    state: 'ACTIVE',
    ...overrides
  };
  return { ...base, membershipHash: semanticHash(base) };
}

function possession(currentMembership = membership(), overrides = {}) {
  return {
    schemaVersion: HOME_BRIDGE_REMOTE_DEVICE_POSSESSION_RECEIPT_SCHEMA,
    receiptRef: 'receipt.device-possession.001',
    requestRef: 'request.device-possession.001',
    challengeRef: 'challenge.device-possession.001',
    homeRef: currentMembership.homeNodeRef,
    principalRef: currentMembership.principalRef,
    deviceRef: currentMembership.deviceRef,
    membershipRef: currentMembership.membershipRef,
    membershipHash: currentMembership.membershipHash,
    revocationGeneration: currentMembership.revocationGeneration,
    devicePublicKeyFingerprintRef: `fingerprint.sha256.${'2'.repeat(64)}`,
    signatureAlgorithmRef: 'signature.vextreme.ecdsa-p256-sha256',
    signingPayloadSha256: '3'.repeat(64),
    devicePossessionState: 'VERIFIED_CURRENT',
    authenticationEvidenceEligible: true,
    homeAuthorization: false,
    capabilityLease: false,
    networkAuthority: false,
    verificationEvidenceRef: 'verification.device-possession.p256.001',
    observedAtMs: T0 - 1_000,
    expiresAtMs: T0 + 120_000,
    sourceRefs: ['github.pull.vextreme-sdk.1873'],
    currentnessRefs: ['currentness.device-possession.001'],
    ...overrides
  };
}

function harness() {
  let now = T0;
  let entropy = 1;
  const owner = createHomeBridgeRemoteAuthenticatedSessionOwner({
    homeRef: 'home.current',
    deviceRef: 'device.android.current',
    principalRef: 'person.victor-gong',
    ownerSourceReceiptRefs: ['github.issue.vexlife.492'],
    defaultSessionTtlMs: 60_000,
    testMode: true,
    nowProvider: () => now,
    entropyProvider: (size) => Buffer.alloc(size, entropy++)
  });
  return { owner, now: () => now, advance: (ms) => { now += ms; } };
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => error instanceof HomeBridgeRemoteAuthenticatedSessionError && error.code === code);
}

test('remote possession + current principal-bound membership creates the existing authenticated-session assertion shape', () => {
  const h = harness();
  const member = membership();
  const established = h.owner.establish({
    possessionReceipt: possession(member),
    membership: member,
    currentRevocationGeneration: 3
  });
  assert.equal(established.state, 'REMOTE_AUTHENTICATED_SESSION_ESTABLISHED');
  assert.match(established.sessionRef, /^session\.vexlife\.home-bridge\.remote\./u);
  assert.equal(Object.keys(established).includes('sessionRef'), false);
  assert.equal(established.effects.authorizationGranted, false);
  assert.equal(established.effects.capabilityLeaseGranted, false);
  assert.equal(established.effects.standingHomeAuthorityGranted, false);

  const envelope = h.owner.resolve({ sessionRef: established.sessionRef });
  assert.equal(envelope.state, 'CURRENT');
  assert.deepEqual(envelope.value, {
    schemaVersion: HOME_BRIDGE_AUTHENTICATED_SESSION_SCHEMA,
    state: 'AUTHENTICATED_CURRENT',
    stableSessionBindingRef: established.stableSessionBindingRef,
    principalRef: 'person.victor-gong',
    deviceRef: 'device.android.current'
  });
  assert.ok(envelope.sourceReceiptRefs.includes('receipt.device-possession.001'));
  assert.ok(envelope.currentnessRefs.includes('currentness.device-possession.001'));
});

test('membership identity/hash/revocation drift fails closed', () => {
  const h = harness();
  const member = membership();
  const receipt = possession(member);
  const wrongHash = { ...member, membershipHash: '4'.repeat(64) };
  expectCode(() => h.owner.establish({ possessionReceipt: receipt, membership: wrongHash, currentRevocationGeneration: 3 }), 'HOME_BRIDGE_REMOTE_SESSION_MEMBERSHIP_STALE');

  const wrongPrincipal = membership({ principalRef: 'person.other' });
  expectCode(() => h.owner.establish({ possessionReceipt: possession(wrongPrincipal), membership: wrongPrincipal, currentRevocationGeneration: 3 }), 'HOME_BRIDGE_REMOTE_SESSION_IDENTITY_MISMATCH');

  expectCode(() => h.owner.establish({ possessionReceipt: receipt, membership: member, currentRevocationGeneration: 4 }), 'HOME_BRIDGE_REMOTE_SESSION_REVOKED');
});

test('stale, authority-bearing, and replayed possession receipts fail closed', () => {
  const h = harness();
  const member = membership();
  expectCode(() => h.owner.establish({
    possessionReceipt: possession(member, { expiresAtMs: T0 }),
    membership: member,
    currentRevocationGeneration: 3
  }), 'HOME_BRIDGE_REMOTE_SESSION_POSSESSION_STALE');

  expectCode(() => h.owner.establish({
    possessionReceipt: possession(member, { homeAuthorization: true }),
    membership: member,
    currentRevocationGeneration: 3
  }), 'HOME_BRIDGE_REMOTE_SESSION_POSSESSION_REQUIRED');

  const receipt = possession(member);
  h.owner.establish({ possessionReceipt: receipt, membership: member, currentRevocationGeneration: 3 });
  expectCode(() => h.owner.establish({ possessionReceipt: receipt, membership: member, currentRevocationGeneration: 3 }), 'HOME_BRIDGE_REMOTE_SESSION_POSSESSION_REPLAYED');
});

test('bare SHA-256 fingerprint values are rejected before remote session establishment', () => {
  const h = harness();
  const member = membership();
  expectCode(() => h.owner.establish({
    possessionReceipt: possession(member, { devicePublicKeyFingerprintRef: '2'.repeat(64) }),
    membership: member,
    currentRevocationGeneration: 3
  }), 'HOME_BRIDGE_REMOTE_SESSION_INPUT_INVALID');
});

test('session ttl cannot outlive possession evidence and expiry removes current assertion', () => {
  const h = harness();
  const member = membership();
  const established = h.owner.establish({
    possessionReceipt: possession(member, { expiresAtMs: T0 + 2_000 }),
    membership: member,
    currentRevocationGeneration: 3,
    ttlMs: 60_000
  });
  assert.equal(established.expiresAt, new Date(T0 + 2_000).toISOString());
  h.advance(2_000);
  expectCode(() => h.owner.resolve({ sessionRef: established.sessionRef }), 'HOME_BRIDGE_REMOTE_SESSION_EXPIRED');
});

test('explicit revocation and forged handles fail closed without device or Home mutation', () => {
  const h = harness();
  const member = membership();
  const established = h.owner.establish({ possessionReceipt: possession(member), membership: member, currentRevocationGeneration: 3 });
  const revoked = h.owner.revoke({
    sessionRef: established.sessionRef,
    reasonRef: 'reason.user-requested',
    revokedAt: new Date(h.now()).toISOString()
  });
  assert.equal(revoked.state, 'REMOTE_AUTHENTICATED_SESSION_REVOKED');
  assert.equal(revoked.effects.authorizationGranted, false);
  expectCode(() => h.owner.resolve({ sessionRef: established.sessionRef }), 'HOME_BRIDGE_REMOTE_SESSION_REVOKED');
  expectCode(() => h.owner.resolve({ sessionRef: 'session.vexlife.home-bridge.remote.forged' }), 'HOME_BRIDGE_REMOTE_SESSION_UNKNOWN');
});

test('custom time/entropy are test-only and ttl retains the existing 15-minute ceiling', () => {
  assert.throws(() => createHomeBridgeRemoteAuthenticatedSessionOwner({
    homeRef: 'home.current',
    deviceRef: 'device.android.current',
    principalRef: 'person.victor-gong',
    ownerSourceReceiptRefs: ['github.issue.vexlife.492'],
    nowProvider: () => T0
  }), /test-only/u);
  const h = harness();
  const member = membership();
  expectCode(() => h.owner.establish({
    possessionReceipt: possession(member),
    membership: member,
    currentRevocationGeneration: 3,
    ttlMs: 60 * 60 * 1000
  }), 'HOME_BRIDGE_REMOTE_SESSION_INPUT_INVALID');
});

// [VXG RealForever]
