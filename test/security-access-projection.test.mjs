import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { projectSecurityAccessPreview, createSecurityAccessRuntimeBridge, validateSecurityAccessRegistry } from '../src/core/security-access-projection.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../blueprint/security-access-preview-registry.json', import.meta.url), 'utf8'));

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

test('typed runtime bridge cannot authenticate, authorize or perform protected effects', () => {
  const bridge = createSecurityAccessRuntimeBridge(registry);
  assert.equal(bridge.authenticationPerformed, false);
  assert.equal(bridge.authorizationPerformed, false);
  assert.equal(bridge.protectedEffectPerformed, false);
  assert.ok(Object.values(bridge.effects).every((value) => value === false));
});

// [VXG RealForever]
