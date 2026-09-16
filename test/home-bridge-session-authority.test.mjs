import assert from 'node:assert/strict';
import test from 'node:test';

import {
  approvePairing,
  createPairingOffer,
  issueCapabilityLease
} from '../src/core/home-bridge.mjs';
import {
  HOME_BRIDGE_SESSION_ASSERTION_SCHEMA,
  HomeBridgeSessionAuthorityError,
  createHomeBridgeSessionAuthorityResolver
} from '../src/core/home-bridge-session-authority.mjs';

const T0 = '2026-09-16T08:00:00.000Z';
const T1 = '2026-09-16T08:05:00.000Z';
const T9 = '2026-09-16T18:00:00.000Z';

function pairedAuthority(name = 'victor', { approvedBy = 'principal.home-owner' } = {}) {
  const principalRef = `principal.${name}`;
  const deviceRef = `device.${name}`;
  const offer = createPairingOffer({
    pairingRef: `pairing.hbsa.${name}`,
    homeNodeRef: 'home.patient0',
    homePublicKey: 'public-home-key',
    oneTimeNonceHash: `nonce-${name}`,
    humanFingerprint: `fingerprint-${name}`,
    requestedCapabilityRefs: ['capability.vexlife.companion-navigation'],
    expiresAt: T9
  });
  const paired = approvePairing({
    offer,
    principalRef,
    deviceRef,
    devicePublicKey: `public-device-key-${name}`,
    approvedCapabilityRefs: ['capability.vexlife.companion-navigation'],
    approvedBy,
    approvedAt: T0,
    expectedFingerprint: `fingerprint-${name}`
  });
  assert.equal(paired.state, 'PAIRED');
  const lease = issueCapabilityLease({
    leaseRef: `lease.hbsa.${name}`,
    membership: paired.membership,
    requestedCapabilityRefs: ['capability.vexlife.companion-navigation'],
    projectRefs: ['project.vex-family'],
    issuedAt: T0,
    expiresAt: T9,
    revocationGeneration: paired.membership.revocationGeneration
  });
  return Object.freeze({ principalRef, deviceRef, membership: paired.membership, lease });
}

function current(value, label) {
  return Object.freeze({
    state: 'CURRENT',
    value,
    sourceReceiptRefs: [`receipt.${label}`],
    currentnessRefs: [`currentness.${label}`]
  });
}

function session(authority, overrides = {}) {
  return Object.freeze({
    schemaVersion: HOME_BRIDGE_SESSION_ASSERTION_SCHEMA,
    state: 'AUTHENTICATED_CURRENT',
    stableSessionBindingRef: 'session-binding.patient0.current',
    principalRef: authority.principalRef,
    deviceRef: authority.deviceRef,
    ...overrides
  });
}

function resolver(authority, overrides = {}) {
  return createHomeBridgeSessionAuthorityResolver({
    resolveAuthenticatedSession: async () => current(
      session(authority, overrides.session),
      'session'
    ),
    resolveMembership: async () => current(
      overrides.membership ?? authority.membership,
      'membership'
    ),
    resolveLease: async () => current(
      overrides.lease ?? authority.lease,
      'lease'
    ),
    resolveCurrentRevocationGeneration: async () => current(
      { generation: overrides.currentRevocationGeneration ?? authority.membership.revocationGeneration },
      'revocation'
    ),
    nowProvider: () => overrides.now ?? T1
  });
}

async function expectCode(promise, code) {
  await assert.rejects(
    promise,
    (error) => error instanceof HomeBridgeSessionAuthorityError && error.code === code
  );
}

test('HBSA-00/HBSA-01: one authenticated current session resolves exact principal-bound Home Bridge authority with no effect', async () => {
  const authority = pairedAuthority('victor', { approvedBy: 'principal.alex-admin' });
  const result = await resolver(authority).resolve({ sessionRef: 'opaque-session-handle' });

  assert.equal(result.state, 'CURRENT');
  assert.equal(result.principalRef, 'principal.victor');
  assert.equal(result.deviceRef, 'device.victor');
  assert.equal(result.membership.principalRef, result.principalRef);
  assert.equal(result.lease.principalRef, result.principalRef);
  assert.equal(result.membership.deviceRef, result.deviceRef);
  assert.equal(result.lease.deviceRef, result.deviceRef);
  assert.equal(result.currentRevocationGeneration, 0);
  assert.equal(result.stableSessionBindingRef, 'session-binding.patient0.current');
  assert.ok(result.authorityReceiptRef.startsWith('receipt.vexlife.home-bridge-session-authority.'));
  assert.equal(Object.hasOwn(result, 'sessionRef'), false);
  assert.equal(JSON.stringify(result).includes('opaque-session-handle'), false);
  assert.ok(Object.values(result.effects).every((value) => value === false));
  assert.throws(
    () => result.membership.capabilityRefs.push('capability.forged'),
    TypeError
  );
  assert.throws(
    () => result.lease.projectRefs.push('project.forged'),
    TypeError
  );
  assert.deepEqual(result.membership.capabilityRefs, ['capability.vexlife.companion-navigation']);
  assert.deepEqual(result.lease.projectRefs, ['project.vex-family']);
  assert.deepEqual(result.sourceReceiptRefs, [
    'receipt.lease',
    'receipt.membership',
    'receipt.revocation',
    'receipt.session'
  ]);
  assert.deepEqual(result.currentnessRefs, [
    'currentness.lease',
    'currentness.membership',
    'currentness.revocation',
    'currentness.session'
  ]);
});

test('HBSA-02: browser-style authority fields cannot enter the resolver request', async () => {
  const authority = pairedAuthority();
  await expectCode(
    resolver(authority).resolve({
      sessionRef: 'opaque-session-handle',
      principalRef: 'principal.forged'
    }),
    'HOME_BRIDGE_SESSION_UNTRUSTED_FIELD'
  );
});

test('HBSA-03: authenticated session principal or device mismatch fails closed', async () => {
  const authority = pairedAuthority();
  await expectCode(
    resolver(authority, {
      session: { principalRef: 'principal.forged' }
    }).resolve({ sessionRef: 'opaque-session-handle' }),
    'HOME_BRIDGE_SESSION_IDENTITY_MISMATCH'
  );
  await expectCode(
    resolver(authority, {
      session: { deviceRef: 'device.forged' }
    }).resolve({ sessionRef: 'opaque-session-handle' }),
    'HOME_BRIDGE_SESSION_IDENTITY_MISMATCH'
  );
});

test('HBSA-04: stale revocation generation fails closed independently of pairing history', async () => {
  const authority = pairedAuthority();
  await expectCode(
    resolver(authority, {
      currentRevocationGeneration: authority.membership.revocationGeneration + 1
    }).resolve({ sessionRef: 'opaque-session-handle' }),
    'HOME_BRIDGE_SESSION_REVOCATION_MISMATCH'
  );
});

test('HBSA-05: missing or expired capability lease fails closed', async () => {
  const authority = pairedAuthority();
  await expectCode(
    resolver(authority, {
      lease: { ...authority.lease, state: 'EXPIRED' }
    }).resolve({ sessionRef: 'opaque-session-handle' }),
    'HOME_BRIDGE_SESSION_LEASE_REQUIRED'
  );
  await expectCode(
    resolver(authority, { now: T9 }).resolve({ sessionRef: 'opaque-session-handle' }),
    'HOME_BRIDGE_SESSION_LEASE_EXPIRED'
  );
});

test('HBSA-06: ambiguous or evidence-free owner results cannot become authority', async () => {
  const authority = pairedAuthority();
  const ambiguous = createHomeBridgeSessionAuthorityResolver({
    resolveAuthenticatedSession: async () => [current(session(authority), 'a'), current(session(authority), 'b')],
    resolveMembership: async () => current(authority.membership, 'membership'),
    resolveLease: async () => current(authority.lease, 'lease'),
    resolveCurrentRevocationGeneration: async () => current({ generation: 0 }, 'revocation'),
    nowProvider: () => T1
  });
  await expectCode(
    ambiguous.resolve({ sessionRef: 'opaque-session-handle' }),
    'HOME_BRIDGE_SESSION_AMBIGUOUS_OWNER_RESULT'
  );

  const evidenceFree = createHomeBridgeSessionAuthorityResolver({
    resolveAuthenticatedSession: async () => ({
      state: 'CURRENT',
      value: session(authority),
      sourceReceiptRefs: [],
      currentnessRefs: ['currentness.session']
    }),
    resolveMembership: async () => current(authority.membership, 'membership'),
    resolveLease: async () => current(authority.lease, 'lease'),
    resolveCurrentRevocationGeneration: async () => current({ generation: 0 }, 'revocation'),
    nowProvider: () => T1
  });
  await expectCode(
    evidenceFree.resolve({ sessionRef: 'opaque-session-handle' }),
    'HOME_BRIDGE_SESSION_OWNER_EVIDENCE_REQUIRED'
  );
});

test('HBSA-07: session assertion is closed and cannot smuggle bearer or credential material', async () => {
  const authority = pairedAuthority();
  await expectCode(
    resolver(authority, {
      session: { bearerToken: 'secret' }
    }).resolve({ sessionRef: 'opaque-session-handle' }),
    'HOME_BRIDGE_SESSION_UNTRUSTED_FIELD'
  );
});

test('HBSA-08: separately approved device principal remains the speaker; approver is not substituted', async () => {
  const authority = pairedAuthority('bri', { approvedBy: 'principal.victor-owner' });
  const result = await resolver(authority).resolve({ sessionRef: 'opaque-session-handle' });
  assert.equal(result.principalRef, 'principal.bri');
  assert.equal(result.membership.approvedBy, 'principal.victor-owner');
  assert.notEqual(result.principalRef, result.membership.approvedBy);
});

// [VXG RealForever]
