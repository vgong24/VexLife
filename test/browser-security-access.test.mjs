import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { compileRegistryPack } from '../src/core/registry.mjs';

const bundle = loadBlueprint();
const compiled = compileRegistryPack(bundle);
const html = fs.readFileSync(new URL('../reference/browser/index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../reference/browser/app.js', import.meta.url), 'utf8');
const controller = fs.readFileSync(new URL('../reference/browser/modules/security-access-controller.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../reference/browser/security-access.css', import.meta.url), 'utf8');

test('Security & Access browser identities are source registered', () => {
  for (const ref of [
    'region.health.security-access',
    'element.health.security-access.details-toggle',
    'element.health.security-access.preview-toggle',
    'element.health.security-access.ask-vex',
    'element.health.security-access.held-actions',
    'action.security-access.details.toggle',
    'action.security-access.preview.toggle',
    'test.security-access.projection',
    'test.security-access.browser',
    'test.security-access.zero-effect'
  ]) assert.ok(compiled.get(ref), `missing registered Security & Access ref ${ref}`);
});

test('Security & Access browser surface is contextual Health, not a new top-level route', () => {
  assert.match(html, /id="securityAccessRegion"[^>]+data-node-ref="region\.health\.security-access"/);
  assert.match(html, /id="securityAccessPreviewVisible"/);
  assert.match(app, /createSecurityAccessController/);
  assert.doesNotMatch(html, /route\.security-access|screen\.vexlife\.security-access/);
});

test('Security & Access compact styling keeps controls mobile shaped and accessible', () => {
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /width:100%/);
  assert.match(css, /prefers-reduced-motion/);
});

test('Security & Access visible strings are complete in EN JA ZH', () => {
  const required = [
    'security-access.title','security-access.preview.visibility','security-access.status.preview',
    'security-access.status.backend-unavailable','security-access.android-first','security-access.trusted-devices',
    'security-access.trusted-devices.none','security-access.recovery','security-access.recovery.not-configured-here',
    'security-access.review-options','security-access.ask-vex','security-access.held-actions',
    'security-access.guide.explanation'
  ];
  for (const language of bundle.blueprint.product.requiredLanguages) for (const key of required) {
    assert.equal(typeof bundle.strings[language][key], 'string', `${language} missing ${key}`);
    assert.ok(bundle.strings[language][key].length > 0, `${language} empty ${key}`);
  }
});

test('Security & Access Ask Vex is deterministic explanation, not authentication', () => {
  assert.match(controller, /guide\?\.addMessage/);
  assert.match(controller, /security-access\.guide\.explanation/);
  assert.doesNotMatch(controller, /navigator\.credentials|PublicKeyCredential|WebSocket|EventSource|fetch\s*\(/);
});

// [VXG RealForever]
