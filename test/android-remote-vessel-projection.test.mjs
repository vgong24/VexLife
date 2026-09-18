import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ANDROID_REMOTE_VESSEL_EFFECT_FIELDS,
  createAndroidRemoteVesselReferenceBridge,
  projectAndroidRemoteVessel,
  validateAndroidRemoteVesselRegistry
} from '../src/core/android-remote-vessel-projection.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../blueprint/android-remote-vessel-registry.json', import.meta.url), 'utf8'));
const homeBridge = JSON.parse(fs.readFileSync(new URL('../blueprint/home-bridge-registry.json', import.meta.url), 'utf8'));

test('Android Remote Vessel reuses exact Home Bridge mode and connection vocabulary', () => {
  validateAndroidRemoteVesselRegistry(registry, homeBridge);
  const declared = new Set([...registry.executableFirstSliceStates, ...registry.heldConnectedStates]);
  assert.deepEqual([...declared].sort(), [...homeBridge.connectionStates].sort());
  assert.equal(registry.mode, 'REMOTE_HOME');
  assert.ok(homeBridge.modes.includes(registry.mode));
});

test('Android Remote Vessel browser reference is truthfully UNPAIRED and no-effect', () => {
  const bridge = createAndroidRemoteVesselReferenceBridge(registry, homeBridge);
  assert.equal(bridge.state, 'UNPAIRED');
  assert.equal(bridge.projection.canonicalWriter, 'DESKTOP_HOME_NODE');
  assert.equal(bridge.projection.remoteWriterGranted, false);
  assert.equal(bridge.projection.authenticationState, 'NOT_GRANTED_BY_REFERENCE');
  assert.equal(bridge.projection.authorizationState, 'NOT_GRANTED_BY_REFERENCE');
  assert.equal(bridge.projection.capabilityLeaseState, 'NONE_GRANTED_BY_REFERENCE');
  assert.equal(bridge.projection.activeHomeAccess, false);
  assert.equal(bridge.projection.rawModelEndpointExposed, false);
  assert.equal(bridge.protectedEffectPerformed, false);
  assert.deepEqual(Object.keys(bridge.effects).sort(), [...ANDROID_REMOTE_VESSEL_EFFECT_FIELDS].sort());
  assert.ok(Object.values(bridge.effects).every((value) => value === false));
});

test('Android Remote Vessel closed failure states stay no-effect and connected states remain held', () => {
  for (const connectionState of ['HOME_UNREACHABLE','LEASE_EXPIRED','REVOKED']) {
    const projection = projectAndroidRemoteVessel(registry, homeBridge, { connectionState });
    assert.equal(projection.connectionState, connectionState);
    assert.equal(projection.activeHomeAccess, false);
    assert.equal(projection.remoteWriterGranted, false);
    assert.ok(Object.values(projection.effects).every((value) => value === false));
  }
  for (const connectionState of registry.heldConnectedStates) {
    assert.throws(() => projectAndroidRemoteVessel(registry, homeBridge, { connectionState }), /held outside the first slice/);
  }
});

test('Android Remote Vessel rejects undeclared input instead of accepting secret/runtime payloads', () => {
  assert.throws(() => projectAndroidRemoteVessel(registry, homeBridge, { connectionState:'UNPAIRED', deviceRef:'device.secret' }), /unregistered input field deviceRef/);
  assert.throws(() => projectAndroidRemoteVessel(registry, homeBridge, null), /must be an object/);
});

// [VXG RealForever]
