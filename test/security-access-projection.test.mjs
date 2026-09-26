import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  projectSecurityAccessPreview,
  createSecurityAccessRuntimeBridge,
  validateSecurityAccessRegistry,
  SECURITY_ACCESS_EFFECT_FIELDS
} from '../src/core/security-access-projection.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../blueprint/security-access-preview-registry.json', import.meta.url), 'utf8'));

const effects = () => Object.fromEntries(SECURITY_ACCESS_EFFECT_FIELDS.map((field) => [field, false]));

function convergence(state = 'CURRENT', overrides = {}) {
  return {
    schemaVersion: 'vexlife.security-access-convergence/v1',
    truthClass: 'FAMILY_SECURITY_CONTRACT_BOUND_CONSUMER_PROJECTION',
    homeRef: 'home.vexhome.synthetic',
    principalRef: 'principal.vexhome.synthetic',
    state,
    sourceOwnerRefs: [
      'github.issue.vextreme-sdk.232',
      'github.issue.vextreme-sdk.717',
      'github.issue.vexlife.492'
    ],
    sourceRefs: ['source.synthetic.device', 'source.synthetic.recovery', 'source.synthetic.session'],
    currentnessRefs: ['currentness.synthetic.device', 'currentness.synthetic.recovery', 'currentness.synthetic.session'],
    reasonRefs: [],
    missingOwnerRefs: [],
    deviceAccess: {
      trustedDeviceRefs: ['device.synthetic.001', 'device.synthetic.002'],
      compromisedDeviceRefs: [],
      capabilityRefs: ['capability.synthetic.review'],
      revocationGenerationRefOrNull: 'generation.synthetic.current',
      recoveryPorchStateOrNull: 'recovery-porch.synthetic.ready'
    },
    sessionSecurity: {
      currentSessionCountOrNull: 1,
      affectedDeviceRefOrNull: null,
      affectedScopeRefOrNull: 'scope.synthetic.current',
      generationInvalidationObservedOrNull: true
    },
    recoveryPolicy: {
      compromiseStateOrNull: 'compromise.synthetic.none',
      availableFactorClassRefs: ['factor-class.synthetic.trusted-device'],
      recoveryDispositionOrNull: 'recovery.synthetic.ready',
      recoveredOwnerStateOrNull: 'owner.synthetic.current',
      humanChoiceRequired: false
    },
    realIntegrationComplete: state === 'CURRENT',
    effectAuthorityRefs: [],
    effectAuthorityGranted: false,
    effects: effects(),
    ...overrides
  };
}

test('Security & Access registry keeps Android-first no-auth ownership', () => {
  validateSecurityAccessRegistry(registry);
  assert.equal(registry.androidFirst, true);
  assert.equal(registry.iPhoneRequired, false);
  assert.equal(registry.projection.stateRef, 'state.health');
  assert.equal(registry.projection.ownerRef, 'service.health');
  assert.equal(registry.flag.securityPolicyAuthority, false);
  const widened = structuredClone(registry);
  widened.flag.securityPolicyAuthority = true;
  assert.throws(() => validateSecurityAccessRegistry(widened), /security-policy authority false/);
});

test('Security & Access executes only preview and backend-unavailable states', () => {
  for (const runtimeState of ['PREVIEW_ONLY','BACKEND_UNAVAILABLE']) {
    const projection = projectSecurityAccessPreview(registry, { runtimeState, previewVisible: true });
    assert.equal(projection.runtimeState, runtimeState);
    assert.equal(projection.androidFirst, true);
    assert.equal(projection.iPhoneRequired, false);
    assert.equal(projection.heldActions.length, 8);
    assert.ok(projection.heldActions.every((item) => item.enabled === false && item.effectPerformed === false));
    assert.ok(Object.values(projection.effects).every((value) => value === false));
  }
  for (const held of ['NOT_CONFIGURED','READY_TO_CONNECT','CONNECTED','PROTECTIVE_FREEZE']) {
    assert.throws(() => projectSecurityAccessPreview(registry, { runtimeState: held }), /held outside the first slice/);
  }
});

test('Security & Access projection has a closed input shape and rejects hostile payloads', () => {
  for (const hostile of [
    { runtimeState:'PREVIEW_ONLY', credential:'secret' },
    { runtimeState:'PREVIEW_ONLY', endpoint:'http://127.0.0.1:9000' },
    { runtimeState:'PREVIEW_ONLY', privateKey:'hostile-fixture-value' },
    { runtimeState:'PREVIEW_ONLY', nested:{token:'abc'} },
    { runtimeState:'PREVIEW_ONLY', recoverySeed:'123456' }
  ]) assert.throws(() => projectSecurityAccessPreview(registry, hostile), /rejects unregistered input field/);
});

test('missing real convergence input is held and never replaced by a production fixture', () => {
  const projection = projectSecurityAccessPreview(registry, { runtimeState:'PREVIEW_ONLY' });
  assert.equal(projection.ownerConvergence.state, 'HELD');
  assert.equal(projection.ownerConvergence.sourceProjectionAvailable, false);
  assert.equal(projection.ownerConvergence.realIntegrationComplete, false);
  assert.equal(projection.ownerConvergence.effectAuthorityGranted, false);
  assert.deepEqual(projection.ownerConvergence.sourceRefs, []);
  assert.deepEqual(projection.ownerConvergence.missingOwnerRefs, []);
});

test('accepted convergence states remain exact in the compact product consumer', () => {
  for (const state of ['CURRENT','STALE','UNKNOWN','COMPROMISED','RECOVERY_REQUIRED','HELD']) {
    const value = convergence(state, {
      realIntegrationComplete: state === 'CURRENT',
      missingOwnerRefs: state === 'HELD' ? ['github.issue.vextreme-sdk.232'] : []
    });
    const projection = projectSecurityAccessPreview(registry, {
      runtimeState:'PREVIEW_ONLY',
      convergenceProjection:value
    });
    assert.equal(projection.ownerConvergence.state, state);
    assert.equal(projection.ownerConvergence.sourceProjectionAvailable, true);
    assert.equal(projection.ownerConvergence.effectAuthorityGranted, false);
    assert.ok(Object.values(projection.effects).every((effect) => effect === false));
    assert.ok(projection.heldActions.every((item) => item.enabled === false && item.effectPerformed === false));
  }
});

test('current convergence is compacted to no-secret counts and safe policy state', () => {
  const projection = projectSecurityAccessPreview(registry, {
    runtimeState:'PREVIEW_ONLY',
    convergenceProjection:convergence()
  });
  assert.equal(projection.ownerConvergence.trustedDeviceCountOrNull, 2);
  assert.equal(projection.ownerConvergence.compromisedDeviceCountOrNull, 0);
  assert.equal(projection.ownerConvergence.capabilityRefCountOrNull, 1);
  assert.equal(projection.ownerConvergence.currentSessionCountOrNull, 1);
  assert.equal(projection.ownerConvergence.recoveryDispositionOrNull, 'recovery.synthetic.ready');
  assert.equal(projection.ownerConvergence.humanChoiceRequiredOrNull, false);
  const serialized = JSON.stringify(projection.ownerConvergence);
  assert.equal(serialized.includes('device.synthetic.001'), false);
  assert.equal(serialized.includes('capability.synthetic.review'), false);
  assert.equal(serialized.includes('factor-class.synthetic.trusted-device'), false);
});

test('malformed or effect-inflated convergence input fails closed rather than becoming product truth', () => {
  const inflated = convergence();
  inflated.effects.sessionRevocation = true;
  assert.throws(
    () => projectSecurityAccessPreview(registry, { convergenceProjection: inflated }),
    /effects must remain false/
  );

  const extra = convergence();
  extra.sessionSecurity.sessionRef = 'session.raw.handle';
  assert.throws(
    () => projectSecurityAccessPreview(registry, { convergenceProjection: extra }),
    /rejects unregistered field sessionRef/
  );

  const inconsistent = convergence('STALE', { realIntegrationComplete: true });
  assert.throws(
    () => projectSecurityAccessPreview(registry, { convergenceProjection: inconsistent }),
    /real integration truth is inconsistent/
  );

  const missingFacts = convergence('CURRENT', { deviceAccess: null });
  assert.throws(
    () => projectSecurityAccessPreview(registry, { convergenceProjection: missingFacts }),
    /real integration truth is inconsistent/
  );

  const wrongOwnerSet = convergence('CURRENT', {
    sourceOwnerRefs: ['github.issue.vextreme-sdk.717']
  });
  assert.throws(
    () => projectSecurityAccessPreview(registry, { convergenceProjection: wrongOwnerSet }),
    /real integration truth is inconsistent/
  );
});

test('typed runtime bridge cannot authenticate, authorize or perform protected effects', () => {
  const bridge = createSecurityAccessRuntimeBridge(registry, {
    convergenceProjection: convergence('RECOVERY_REQUIRED', { realIntegrationComplete:false })
  });
  assert.equal(bridge.authenticationPerformed, false);
  assert.equal(bridge.authorizationPerformed, false);
  assert.equal(bridge.protectedEffectPerformed, false);
  assert.equal(bridge.projection.ownerConvergence.state, 'RECOVERY_REQUIRED');
  assert.ok(Object.values(bridge.effects).every((value) => value === false));
});

// [VXG RealForever]
