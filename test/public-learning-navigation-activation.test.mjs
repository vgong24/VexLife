import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const readJson = (relative) => JSON.parse(source(relative));

test('S7NC-ACTIVATION-00 public document remaps only the public Terrain import before the app module loads', () => {
  const html = source('reference/browser/public-learning/index.html');
  const importMapIndex = html.indexOf('<script type="importmap">');
  const appIndex = html.indexOf('<script type="module" src="/reference/browser/public-learning/app.js"></script>');
  assert.ok(importMapIndex >= 0 && appIndex > importMapIndex, 'public Terrain remap must be declared before app module loading');
  assert.match(html, /"\/reference\/browser\/modules\/terrain-controller\.js"\s*:\s*"\/reference\/browser\/modules\/public-learning-terrain-controller\.js"/u);
});

test('S7NC-ACTIVATION-01 public app enters the activated controller and exposes no direct Terrain performer', () => {
  const app = source('reference/browser/public-learning/app.js');
  assert.match(app, /public-learning-controller-activated\.js/u);
  assert.match(app, /navigation-continuity-registry\.json/u);
  assert.match(app, /controller\.requestSemanticTravel\(ref/u);
  assert.doesNotMatch(app, /terrain\.travel\(/u);
});

test('S7NC-ACTIVATION-02 page-scoped Terrain facade owns request delegation while preserving one private canonical performer', () => {
  const facade = source('reference/browser/modules/public-learning-terrain-controller.js');
  assert.match(facade, /terrain-controller\.js\?public-learning-canonical=1/u);
  assert.match(facade, /requestSemanticTravel:\s*\(\{\s*targetRef,\s*direction\s*\}\)/u);
  assert.match(facade, /performTerrainTravel\s*=\s*canonical\.travel\.bind\(canonical\)/u);
  assert.match(facade, /travel:\s*\(targetRef,\s*direction\s*=\s*'in'\)\s*=>\s*requestPublicLearningNavigation/u);
  assert.equal((facade.match(/canonical\.travel/g) ?? []).length, 1, 'canonical Terrain travel must have one adapter-performer binding');
});

test('S7NC-ACTIVATION-03 activated controller binds physical doors, canonical NC and request-time currentness without route duplication', () => {
  const activated = source('reference/browser/modules/public-learning-controller-activated.js');
  assert.match(activated, /createPublicLearningNavigationContinuity/u);
  assert.match(activated, /createPublicLearningNavigationRequestBoundary/u);
  assert.match(activated, /bindPublicLearningNavigationBridge/u);
  assert.match(activated, /performTerrainTravel:\s*\(targetRef,\s*direction\)\s*=>\s*base\.terrain\.performTerrainTravel/u);
  assert.match(activated, /publicNavigationElementRef/u);
  assert.doesNotMatch(activated, /planNavigationRoute/u);
  assert.doesNotMatch(activated, /navigation\.navigate\(/u);
});

test('S7NC-ACTIVATION-04 runtime allowlist admits the exact canonical NC chain and page-scoped activation modules', () => {
  const registry = readJson('blueprint/public-learning-browser-registry.json');
  for (const required of [
    '/blueprint/navigation-continuity-registry.json',
    '/src/core/navigation-continuity.mjs',
    '/src/core/utils.mjs',
    '/reference/browser/modules/public-learning-navigation-continuity.js',
    '/reference/browser/modules/public-learning-navigation-request.js',
    '/reference/browser/modules/public-learning-navigation-bridge.js',
    '/reference/browser/modules/public-learning-terrain-controller.js',
    '/reference/browser/modules/public-learning-controller-activated.js'
  ]) assert.equal(registry.runtimeAllowlist.includes(required), true, required);
  assert.equal(registry.forbiddenRuntimePrefixes.includes('/reference/browser/app.js'), true);
  assert.equal(registry.forbiddenRuntimePrefixes.includes('/api/'), true);
});

// [VXG RealForever]
