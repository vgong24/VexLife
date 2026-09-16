import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HOME_BRIDGE_AUTHENTICATED_SESSION_SCHEMA,
  HOME_BRIDGE_LOCAL_DEVICE_AUTHENTICATION_EVIDENCE_SCHEMA,
  HOME_BRIDGE_PRINCIPAL_DECISION_SCHEMA,
  HomeBridgeAuthenticatedSessionError,
  createHomeBridgeAuthenticatedSessionOwner
} from '../src/core/home-bridge-authenticated-session.mjs';

const T0 = Date.parse('2026-09-16T22:00:00.000Z');

function harness() {
  let now = T0;
  let entropyOrdinal = 1;
  const owner = createHomeBridgeAuthenticatedSessionOwner({
    homeRef: 'home.current',
    deviceRef: 'device.current',
    personRef: 'person.local-user',
    ownerSourceReceiptRefs: ['source.home.current'],
    testMode: true,
    nowProvider: () => now,
    entropyProvider: (size) => Buffer.alloc(size, entropyOrdinal++),
    defaultSessionTtlMs: 60_000
  });
  return {
    owner,
    advance(ms) { now += ms; },
    now() { return now; }
  };
}

function authentication(overrides = {}) {
  return {
    schemaVersion: HOME_BRIDGE_LOCAL_DEVICE_AUTHENTICATION_EVIDENCE_SCHEMA,
    state: 'CURRENT_ACCEPTED',
    authenticationRef: 'authentication.current.001',
    authenticationClass: 'LOCAL_DEVICE_OPERATOR_CURRENT',
    personRef: 'person.local-user',
    deviceRef: 'device.current',
    homeRef: 'home.current',
    authenticatedAt: '2026-09-16T21:59:55.000Z',
    expiresAt: '2026-09-16T22:05:00.000Z',
    possessionState: 'CURRENT_DEVICE_POSSESSION_VERIFIED',
    sourceReceiptRefs: ['receipt.local-device-possession.001'],
    currentnessRefs: ['currentness.local-device-possession.001'],
    ...overrides
  };
}

function decision(overrides = {}) {
  return {
    schemaVersion: HOME_BRIDGE_PRINCIPAL_DECISION_SCHEMA,
    state: 'ACCEPTED',
    decisionRef: 'decision.principal.victor.001',
    decisionClass: 'EXPLICIT_HUMAN_DECISION',
    personRef: 'person.local-user',
    principalRef: 'person.victor-gong',
    sourceReceiptRefs: ['github.issue.vexlife.481.comment.5697067171'],
    ...overrides
  };
}

function expectCode(fn, code) {
  assert.throws(fn, (error) =>
    error instanceof HomeBridgeAuthenticatedSessionError && error.code === code
  );
}

test('HBAS-00/HBAS-01: current local-device auth plus explicit principal decision creates one opaque current session assertion', () => {
  const h = harness();
  const established = h.owner.establish({
    authenticationEvidence: authentication(),
    principalDecision: decision()
  });
  assert.equal(established.state, 'AUTHENTICATED_SESSION_ESTABLISHED');
  assert.match(established.sessionRef, /^session\.vexlife\.home-bridge\./u);
  assert.equal(established.principalRef, 'person.victor-gong');
  assert.equal(established.effects.authorizationGranted, false);
  assert.equal(established.effects.capabilityLeaseGranted, false);
  assert.equal(established.effects.standingHomeAuthorityGranted, false);

  const envelope = h.owner.resolve({ sessionRef: established.sessionRef });
  assert.equal(envelope.state, 'CURRENT');
  assert.deepEqual(Object.keys(envelope.value).sort(), [
    'deviceRef',
    'principalRef',
    'schemaVersion',
    'stableSessionBindingRef',
    'state'
  ]);
  assert.equal(envelope.value.schemaVersion, HOME_BRIDGE_AUTHENTICATED_SESSION_SCHEMA);
  assert.equal(envelope.value.state, 'AUTHENTICATED_CURRENT');
  assert.equal(envelope.value.principalRef, 'person.victor-gong');
  assert.equal(envelope.value.deviceRef, 'device.current');
  assert.equal(envelope.value.stableSessionBindingRef, established.stableSessionBindingRef);
  assert.ok(envelope.sourceReceiptRefs.includes('receipt.local-device-possession.001'));
  assert.ok(envelope.currentnessRefs.includes('currentness.local-device-possession.001'));
});

test('HBAS-02/HBAS-08: person/device mismatch and missing explicit principal decision fail closed', () => {
  const h = harness();
  expectCode(
    () => h.owner.establish({
      authenticationEvidence: authentication({ deviceRef: 'device.other' }),
      principalDecision: decision()
    }),
    'HOME_BRIDGE_SESSION_IDENTITY_MISMATCH'
  );
  expectCode(
    () => h.owner.establish({
      authenticationEvidence: authentication(),
      principalDecision: decision({ personRef: 'person.other' })
    }),
    'HOME_BRIDGE_SESSION_IDENTITY_MISMATCH'
  );
  expectCode(
    () => h.owner.establish({
      authenticationEvidence: authentication(),
      principalDecision: null
    }),
    'HOME_BRIDGE_SESSION_INPUT_INVALID'
  );
});

test('HBAS-03: stale authentication, session expiry and explicit revocation fail closed independently', () => {
  const h = harness();
  expectCode(
    () => h.owner.establish({
      authenticationEvidence: authentication({
        authenticatedAt: '2026-09-16T21:00:00.000Z',
        expiresAt: '2026-09-16T21:30:00.000Z'
      }),
      principalDecision: decision()
    }),
    'HOME_BRIDGE_SESSION_AUTHENTICATION_STALE'
  );

  const expiring = h.owner.establish({
    authenticationEvidence: authentication(),
    principalDecision: decision(),
    ttlMs: 1_000
  });
  h.advance(1_000);
  expectCode(
    () => h.owner.resolve({ sessionRef: expiring.sessionRef }),
    'HOME_BRIDGE_SESSION_EXPIRED'
  );

  const current = h.owner.establish({
    authenticationEvidence: authentication(),
    principalDecision: decision()
  });
  const revoked = h.owner.revoke({
    sessionRef: current.sessionRef,
    reasonRef: 'reason.user-requested',
    revokedAt: new Date(h.now()).toISOString()
  });
  assert.equal(revoked.state, 'AUTHENTICATED_SESSION_REVOKED');
  expectCode(
    () => h.owner.resolve({ sessionRef: current.sessionRef }),
    'HOME_BRIDGE_SESSION_REVOKED'
  );
});

test('HBAS-04/HBAS-05: credential handle never appears in assertion/evidence projection and forged handles fail closed', () => {
  const h = harness();
  const established = h.owner.establish({
    authenticationEvidence: authentication(),
    principalDecision: decision()
  });
  const envelope = h.owner.resolve({ sessionRef: established.sessionRef });
  const durableProjection = JSON.stringify(envelope);
  assert.equal(durableProjection.includes(established.sessionRef), false);
  assert.equal(durableProjection.includes('base64url'), false);
  assert.equal(Object.hasOwn(envelope.value, 'sessionRef'), false);
  assert.equal(Object.hasOwn(envelope.value, 'credential'), false);
  expectCode(
    () => h.owner.resolve({ sessionRef: 'session.vexlife.home-bridge.forged' }),
    'HOME_BRIDGE_SESSION_UNKNOWN'
  );
});

test('HBAS-06: deterministic clock/entropy injection is test-only and ttl is bounded', () => {
  assert.throws(
    () => createHomeBridgeAuthenticatedSessionOwner({
      homeRef: 'home.current',
      deviceRef: 'device.current',
      personRef: 'person.local-user',
      ownerSourceReceiptRefs: ['source.home.current'],
      nowProvider: () => T0
    }),
    /test-only/u
  );
  const h = harness();
  expectCode(
    () => h.owner.establish({
      authenticationEvidence: authentication(),
      principalDecision: decision(),
      ttlMs: 60 * 60 * 1000
    }),
    'HOME_BRIDGE_SESSION_INPUT_INVALID'
  );
});

test('HBAS-07: closed evidence schemas reject browser-shaped authority fields and owner status has no authz side effects', () => {
  const h = harness();
  expectCode(
    () => h.owner.establish({
      authenticationEvidence: authentication({ principalRef: 'person.browser-forged' }),
      principalDecision: decision()
    }),
    'HOME_BRIDGE_SESSION_UNTRUSTED_FIELD'
  );
  expectCode(
    () => h.owner.establish({
      authenticationEvidence: authentication(),
      principalDecision: decision({ leaseRef: 'lease.browser-forged' })
    }),
    'HOME_BRIDGE_SESSION_UNTRUSTED_FIELD'
  );
  assert.deepEqual(h.owner.status(), {
    state: 'CURRENT',
    currentSessionCount: 0,
    homeRef: 'home.current',
    deviceRef: 'device.current',
    personRef: 'person.local-user'
  });
});

// [VXG RealForever]
