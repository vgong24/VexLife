import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bundle = fs.readFileSync(new URL('../reference/browser/modules/browser-bundle.js', import.meta.url), 'utf8');
const controller = fs.readFileSync(new URL('../reference/browser/modules/android-remote-vessel-controller.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../reference/browser/android-remote-vessel.css', import.meta.url), 'utf8');
const blueprint = JSON.parse(fs.readFileSync(new URL('../blueprint/vexlife.blueprint.json', import.meta.url), 'utf8'));
const tests = JSON.parse(fs.readFileSync(new URL('../blueprint/fragments/tests/security-access-preview.json', import.meta.url), 'utf8'));

test('Android Remote Vessel is composed under existing Security & Access without a new route', () => {
  assert.equal(blueprint.includes.homeBridge, 'blueprint/home-bridge-registry.json');
  assert.equal(blueprint.includes.androidRemoteVessel, 'blueprint/android-remote-vessel-registry.json');
  assert.match(bundle, /createAndroidRemoteVesselController/);
  assert.match(controller, /#securityAccessPreviewContent/);
  assert.match(controller, /projection\.security-access\.android-remote-vessel/);
  assert.doesNotMatch(controller, /route\\.android|screen\\.vexlife\\.android-remote-vessel/);
});

test('Android Remote Vessel browser controller reuses localized Security & Access copy', () => {
  for (const key of [
    'security-access.phone-support',
    'security-access.android-first',
    'security-access.trusted-devices',
    'security-access.trusted-devices.none',
    'security-access.status.backend-unavailable'
  ]) assert.match(controller, new RegExp(key.replaceAll('.', '\\.')));
});

test('Android Remote Vessel compact status block has source-managed responsive styling', () => {
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /width:\s*100%/);
  assert.match(css, /prefers-reduced-motion/);
});

test('Android Remote Vessel test refs are registered with the Security & Access test fragment', () => {
  const refs = new Set(tests.map((item) => item.testRef));
  for (const ref of ['test.android-remote-vessel.projection','test.android-remote-vessel.browser','test.android-remote-vessel.zero-effect']) {
    assert.ok(refs.has(ref), `missing ${ref}`);
  }
});

// [VXG RealForever]
