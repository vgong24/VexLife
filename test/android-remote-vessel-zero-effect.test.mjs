import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAndroidRemoteVesselReferenceBridge } from '../src/core/android-remote-vessel-projection.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../blueprint/android-remote-vessel-registry.json', import.meta.url), 'utf8'));
const homeBridge = JSON.parse(fs.readFileSync(new URL('../blueprint/home-bridge-registry.json', import.meta.url), 'utf8'));
const controller = fs.readFileSync(new URL('../reference/browser/modules/android-remote-vessel-controller.js', import.meta.url), 'utf8');

test('Android Remote Vessel first slice has no product effect surface', () => {
  const bridge = createAndroidRemoteVesselReferenceBridge(registry, homeBridge);
  assert.ok(Object.values(bridge.effects).every((value) => value === false));
  for (const field of [
    'pairingPerformed','authenticationPerformed','authorizationPerformed','capabilityLeasePerformed',
    'networkEffectPerformed','homeEffectPerformed','protectedEffectPerformed'
  ]) assert.equal(bridge[field], false, `${field} must remain false`);
});

test('Android Remote Vessel browser adapter has no pairing, credential, network or Home execution API', () => {
  assert.doesNotMatch(controller, /navigator\.credentials|PublicKeyCredential|WebSocket|EventSource|\bfetch\s*\(|XMLHttpRequest|RTCPeerConnection/);
  assert.doesNotMatch(controller, /createPairingOffer|approvePairing|issueCapabilityLease|revokeDevice|evaluateRemoteRequest/);
  assert.doesNotMatch(controller, /localStorage|sessionStorage|indexedDB/);
});

// [VXG RealForever]
