import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SECURITY_ACCESS_CONVERGENCE_SCHEMA,
  SECURITY_ACCESS_OWNER_REFS,
  SECURITY_ACCESS_OWNER_SNAPSHOT_SCHEMA,
  projectSecurityAccessConvergence
} from '../src/core/security-access-convergence.mjs';

const HOME = 'home.vexhome.family-security.test';
const PRINCIPAL = 'principal.vexhome.family-security.test';

function snapshot(ownerClass, state = 'CURRENT', facts = {}) {
  const base = {
    DEVICE_ACCESS: {
      trustedDeviceRefs: ['device.current.001'],
      compromisedDeviceRefs: [],
      capabilityRefs: ['capability.family.security.review'],
      revocationGenerationRefOrNull: 'revocation-generation.current.001',
      recoveryPorchStateOrNull: 'recovery-porch.eligible'
    },
    SESSION_SECURITY: {
      currentSessionCountOrNull: 1,
      affectedDeviceRefOrNull: null,
      affectedScopeRefOrNull: 'scope.family.security.current',
      generationInvalidationObservedOrNull: true
    },
    RECOVERY_POLICY: {
      compromiseStateOrNull: 'compromise.none',
      availableFactorClassRefs: ['factor-class.trusted-device'],
      recoveryDispositionOrNull: 'recovery.ready',
      recoveredOwnerStateOrNull: 'owner.current',
      humanChoiceRequired: false
    }
  }[ownerClass];
  return {
    schemaVersion: SECURITY_ACCESS_OWNER_SNAPSHOT_SCHEMA,
    ownerClass,
    ownerRef: SECURITY_ACCESS_OWNER_REFS[ownerClass],
    homeRef: HOME,
    principalRef: PRINCIPAL,
    state,
    sourceRef: `source.synthetic.${ownerClass.toLowerCase()}`,
    currentnessRef: `currentness.synthetic.${ownerClass.toLowerCase()}`,
    reasonRefs: [],
    facts: { ...base, ...facts }
  };
}

function project({ deviceState = 'CURRENT', sessionState = 'CURRENT', recoveryState = 'CURRENT', missing = [] } = {}) {
  return projectSecurityAccessConvergence({
    homeRef: HOME,
    principalRef: PRINCIPAL,
    deviceAccess: missing.includes('DEVICE_ACCESS') ? null : snapshot('DEVICE_ACCESS', deviceState),
    sessionSecurity: missing.includes('SESSION_SECURITY') ? null : snapshot('SESSION_SECURITY', sessionState),
    recoveryPolicy: missing.includes('RECOVERY_POLICY') ? null : snapshot('RECOVERY_POLICY', recoveryState)
  });
}

function assertNoEffects(value) {
  assert.equal(value.effectAuthorityGranted, false);
  assert.deepEqual(value.effectAuthorityRefs, []);
  assert(Object.values(value.effects).every((effect) => effect === false));
}

test('VFS706-00 missing real owner inputs fail closed to HELD with no production fixture fallback', () => {
  const value = projectSecurityAccessConvergence({
    homeRef: HOME,
    principalRef: PRINCIPAL,
    deviceAccess: null,
    sessionSecurity: null,
    recoveryPolicy: null
  });
  assert.equal(value.schemaVersion, SECURITY_ACCESS_CONVERGENCE_SCHEMA);
  assert.equal(value.state, 'HELD');
  assert.deepEqual(value.sourceOwnerRefs, []);
  assert.deepEqual(value.missingOwnerRefs, Object.values(SECURITY_ACCESS_OWNER_REFS).sort());
  assert.equal(value.deviceAccess, null);
  assert.equal(value.sessionSecurity, null);
  assert.equal(value.recoveryPolicy, null);
  assert.equal(value.realIntegrationComplete, false);
  assertNoEffects(value);
});

test('VFS706-01 all exact CURRENT owner snapshots compose CURRENT without granting authority', () => {
  const value = project();
  assert.equal(value.state, 'CURRENT');
  assert.equal(value.realIntegrationComplete, true);
  assert.deepEqual(value.sourceOwnerRefs, Object.values(SECURITY_ACCESS_OWNER_REFS).sort());
  assert.equal(value.deviceAccess.trustedDeviceRefs.length, 1);
  assert.equal(value.sessionSecurity.currentSessionCountOrNull, 1);
  assert.equal(value.recoveryPolicy.humanChoiceRequired, false);
  assertNoEffects(value);
});

test('VFS706-02 STALE owner truth remains STALE', () => {
  const value = project({ deviceState: 'STALE' });
  assert.equal(value.state, 'STALE');
  assert.equal(value.realIntegrationComplete, false);
  assertNoEffects(value);
});

test('VFS706-03 UNKNOWN owner truth remains UNKNOWN', () => {
  const value = project({ sessionState: 'UNKNOWN' });
  assert.equal(value.state, 'UNKNOWN');
  assert.equal(value.realIntegrationComplete, false);
  assertNoEffects(value);
});

test('VFS706-04 owner-declared COMPROMISED truth is preserved even when another owner is missing', () => {
  const value = project({ recoveryState: 'COMPROMISED', missing: ['SESSION_SECURITY'] });
  assert.equal(value.state, 'COMPROMISED');
  assert.deepEqual(value.missingOwnerRefs, [SECURITY_ACCESS_OWNER_REFS.SESSION_SECURITY]);
  assertNoEffects(value);
});

test('VFS706-05 owner-declared RECOVERY_REQUIRED truth is preserved', () => {
  const value = project({ recoveryState: 'RECOVERY_REQUIRED' });
  assert.equal(value.state, 'RECOVERY_REQUIRED');
  assert.equal(value.realIntegrationComplete, false);
  assertNoEffects(value);
});

test('VFS706-06 explicit HELD owner truth or a missing owner holds the composed projection', () => {
  assert.equal(project({ deviceState: 'HELD' }).state, 'HELD');
  assert.equal(project({ missing: ['DEVICE_ACCESS'] }).state, 'HELD');
});

test('VFS706-07 raw secret/session authority material is rejected at the owner boundary', () => {
  const bad = snapshot('SESSION_SECURITY');
  bad.facts.sessionRef = 'session.raw.handle';
  assert.throws(() => projectSecurityAccessConvergence({
    homeRef: HOME,
    principalRef: PRINCIPAL,
    deviceAccess: snapshot('DEVICE_ACCESS'),
    sessionSecurity: bad,
    recoveryPolicy: snapshot('RECOVERY_POLICY')
  }), /forbidden raw authority field sessionRef|rejects unregistered field sessionRef/u);

  const secret = snapshot('RECOVERY_POLICY');
  secret.facts.recoverySecret = 'do-not-serialize';
  assert.throws(() => projectSecurityAccessConvergence({
    homeRef: HOME,
    principalRef: PRINCIPAL,
    deviceAccess: snapshot('DEVICE_ACCESS'),
    sessionSecurity: snapshot('SESSION_SECURITY'),
    recoveryPolicy: secret
  }), /forbidden raw authority field recoverySecret|rejects unregistered field recoverySecret/u);
});

test('VFS706-08 cross-home/principal snapshots are rejected rather than normalized', () => {
  const foreign = snapshot('DEVICE_ACCESS');
  foreign.homeRef = 'home.other';
  assert.throws(() => projectSecurityAccessConvergence({
    homeRef: HOME,
    principalRef: PRINCIPAL,
    deviceAccess: foreign,
    sessionSecurity: snapshot('SESSION_SECURITY'),
    recoveryPolicy: snapshot('RECOVERY_POLICY')
  }), /identity binding drift/u);
});
