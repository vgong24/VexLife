import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSecurityAccessRuntimeBridge, SECURITY_ACCESS_EFFECT_FIELDS } from '../src/core/security-access-projection.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../blueprint/security-access-preview-registry.json', import.meta.url), 'utf8'));
const source = [
  fs.readFileSync(new URL('../src/core/security-access-projection.mjs', import.meta.url), 'utf8'),
  fs.readFileSync(new URL('../reference/browser/modules/security-access-controller.js', import.meta.url), 'utf8')
].join('\n');

test('Security & Access source contains no protected browser/network implementation APIs', () => {
  for (const pattern of [
    /navigator\.credentials/, /PublicKeyCredential/, /\bWebAuthn\b/, /\bWebSocket\b/,
    /\bEventSource\b/, /\bRTCPeerConnection\b/, /\bBluetooth\b/, /\bUSB\b/,
    /createServer\s*\(/, /listen\s*\(/, /child_process/, /process\.env/
  ]) assert.doesNotMatch(source, pattern);
});

test('Security & Access effect ledger explicitly keeps every protected effect false', () => {
  const bridge = createSecurityAccessRuntimeBridge(registry);
  assert.deepEqual(Object.keys(bridge.effects).sort(), [...SECURITY_ACCESS_EFFECT_FIELDS].sort());
  assert.ok(Object.values(bridge.effects).every((value) => value === false));
});

test('preview visibility does not alter protected effect truth', () => {
  const hidden = createSecurityAccessRuntimeBridge(registry, { previewVisible:false });
  const visible = createSecurityAccessRuntimeBridge(registry, { previewVisible:true });
  assert.deepEqual(hidden.effects, visible.effects);
  assert.equal(hidden.projection.previewVisible, false);
  assert.equal(visible.projection.previewVisible, true);
});

// [VXG RealForever]
