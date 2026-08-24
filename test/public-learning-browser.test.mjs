import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildPublicLearningProjection } from '../src/core/public-learning.mjs';
import { buildPublicPresentationTerrain, validatePublicLearningBrowserInputs } from '../reference/browser/modules/public-learning-controller.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
const gitText = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
const CURRENT_COMMIT = gitText(['rev-parse','HEAD']);
const CURRENT_TREE = gitText(['show','-s','--format=%T',CURRENT_COMMIT]);
const BINDING = Object.freeze({ repository:'vgong24/VexLife', commitSha:CURRENT_COMMIT, treeSha:CURRENT_TREE, sourceAcceptanceState:'CANDIDATE_PROOF_ONLY' });
const REGISTRY = readJson('blueprint/public-learning-browser-registry.json');
const CATALOGS = Object.fromEntries(REGISTRY.requiredLocales.map((locale) => [locale, readJson(`blueprint/public-learning-browser/strings/${locale}.json`)]));
const PROJECTION = buildPublicLearningProjection({ root: ROOT, sourceBinding: BINDING });
const PROJECTION_PATH = path.join(ROOT, 'generated/public-learning/projection.json');
fs.mkdirSync(path.dirname(PROJECTION_PATH), { recursive: true });
fs.writeFileSync(PROJECTION_PATH, `${JSON.stringify(PROJECTION, null, 2)}\n`, 'utf8');

const ATLAS_GROUP = 'public-group.vexlife.architecture.atlas.001';
const ATLAS_REF = 'module.vexlife.core.atlas';
const ATLAS_LEAF = PROJECTION.leaves.find((leaf) => leaf.canonicalRef === ATLAS_REF);

function browserModuleRegistry() { return readJson('blueprint/module-registry/browser.json'); }
function source(relative) { return fs.readFileSync(path.join(ROOT, relative), 'utf8'); }

async function startProofServer(t) {
  const allow = new Set(REGISTRY.runtimeAllowlist);
  const routeDocument = new Set([REGISTRY.fieldRoutePath, ...PROJECTION.leaves.map((leaf) => leaf.routePath)]);
  const requests = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const pathname = url.pathname;
    requests.push(pathname);
    let relative = null;
    if (routeDocument.has(pathname)) relative = 'reference/browser/public-learning/index.html';
    else if (allow.has(pathname)) relative = pathname.slice(1);
    if (!relative || REGISTRY.forbiddenRuntimePrefixes.some((prefix) => pathname.startsWith(prefix))) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('not admitted');
      return;
    }
    const absolute = path.resolve(ROOT, relative);
    if (!absolute.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      response.writeHead(404); response.end('not admitted'); return;
    }
    const type = relative.endsWith('.html') ? 'text/html' : relative.endsWith('.css') ? 'text/css' : relative.endsWith('.json') ? 'application/json' : 'text/javascript';
    response.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
    response.end(fs.readFileSync(absolute));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => server.close());
  const address = server.address();
  return { base: `http://127.0.0.1:${address.port}`, requests };
}

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.dataset.publicLearningReady === 'true');
}
async function transitionIdle(page) {
  await page.waitForFunction(() => document.querySelector('#terrainWorld')?.dataset.transitionPhase === 'IDLE');
}

validatePublicLearningBrowserInputs({ projection: PROJECTION, registry: REGISTRY, catalogs: CATALOGS });

test('B3P-00/01/02/03/04 source registry, localization and owner reuse remain bounded', () => {
  const keys = Object.keys(CATALOGS.en.strings).sort();
  for (const locale of ['ja','zh']) assert.deepEqual(Object.keys(CATALOGS[locale].strings).sort(), keys);
  assert.equal(Object.values(PROJECTION.effects).every((value) => value === false), true);
  const presentation = buildPublicPresentationTerrain(PROJECTION);
  const byRef = new Map(presentation.map((node) => [node.terrainNodeRef, node]));
  assert.equal(byRef.get(REGISTRY.presentationPolicy.entryRef).parentRef, null);
  assert.equal(byRef.get(ATLAS_GROUP).parentRef, REGISTRY.presentationPolicy.entryRef);
  assert.equal(byRef.get(ATLAS_REF).parentRef, ATLAS_GROUP);
  assert.equal(PROJECTION.nodes.find((node) => node.ref === ATLAS_REF).parentRef, null);

  const controller = source('reference/browser/modules/public-learning-controller.js');
  assert.match(controller, /createNavigationController/);
  assert.match(controller, /createTerrainController/);
  assert.match(controller, /presentationSnapshot\(\)/);
  assert.match(controller, /restorePresentation/);
  for (const forbidden of ['demo-data.js','chat-controller.js','guide-controller.js','living-journal-controller.js','reference/browser/app.js','/api/']) assert.doesNotMatch(controller, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));

  const modules = new Map(browserModuleRegistry().map((entry) => [entry.moduleRef, entry]));
  for (const [ref, expectedPath] of [
    ['module.vexlife.browser.architecture-atlas-document','reference/browser/public-learning/index.html'],
    ['module.vexlife.browser.architecture-atlas-adapter','reference/browser/public-learning/app.js'],
    ['module.vexlife.browser.architecture-atlas-styles','reference/browser/public-learning/app.css'],
    ['module.vexlife.browser.architecture-atlas-controller','reference/browser/modules/public-learning-controller.js']
  ]) {
    assert.equal(modules.get(ref)?.path, expectedPath, ref);
    assert.equal(modules.get(ref)?.tests.includes('test/public-learning-browser.test.mjs'), true, `${ref} test ownership`);
  }
});

test('B3P-05..14 rendered Architecture -> Atlas -> leaf path preserves exact Back, direct route and public-only runtime', async (t) => {
  const { base, requests } = await startProofServer(t);
  const denied = await fetch(`${base}/reference/browser/app.js`);
  assert.equal(denied.status, 404);
  assert.equal((await fetch(`${base}/api/memory`)).status, 404);
  assert.equal((await fetch(`${base}/docs/private-continuity/secret.txt`)).status, 404);

  requests.length = 0;

  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${base}${REGISTRY.fieldRoutePath}`);
  await ready(page);
  assert.equal(await page.locator('#publicDetailTitle').textContent(), PROJECTION.strings.en['public.group.architecture.title']);

  await page.locator(`button[data-terrain-ref="${ATLAS_GROUP}"]`).click();
  await transitionIdle(page);
  assert.equal((await page.evaluate(() => globalThis.__vexlifePublicLearning.proof())).currentRef, ATLAS_GROUP);
  await page.locator(`button[data-terrain-ref="${ATLAS_REF}"]`).click();
  await transitionIdle(page);
  const beforeLeaf = await page.evaluate(() => globalThis.__vexlifePublicLearning.proof());
  assert.equal(beforeLeaf.currentRef, ATLAS_REF);
  assert.equal(await page.locator('#publicDetailTitle').textContent(), PROJECTION.strings.en['public.node.atlas.title']);

  await page.locator('[data-public-action="read-leaf"]').click();
  await page.locator('#publicLeaf:not([hidden])').waitFor();
  const opened = await page.evaluate(() => globalThis.__vexlifePublicLearning.proof());
  assert.equal(opened.routePath, ATLAS_LEAF.routePath);
  assert.equal(opened.journeyEventCount, beforeLeaf.journeyEventCount, 'leaf open must not append Journey');
  for (const key of ['what','why','how','when','boundaries','related']) {
    assert.equal(await page.locator(`[data-leaf-section="${key}"] p`).textContent(), PROJECTION.strings.en[ATLAS_LEAF.sectionRefs[key]]);
  }
  const relationRefs = await page.locator('#publicLeafRelationships li').evaluateAll((items) => items.map((item) => item.dataset.relationshipRef));
  for (const ref of ATLAS_LEAF.relatedRefs) assert.ok(relationRefs.includes(ref), `missing public relation ${ref}`);
  const terrainBeforeScroll = opened.terrainPresentation;
  await page.locator('#publicLeafScroller').evaluate((element) => { element.scrollTop = Math.min(260, element.scrollHeight); element.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(20);
  assert.deepEqual((await page.evaluate(() => globalThis.__vexlifePublicLearning.proof())).terrainPresentation, terrainBeforeScroll, 'leaf scrolling must not change Terrain');
  await page.goBack();
  await page.locator('#publicLeaf[hidden]').waitFor({ state: 'attached' });
  const returned = await page.evaluate(() => globalThis.__vexlifePublicLearning.proof());
  assert.deepEqual(returned.semanticFrame, beforeLeaf.semanticFrame);
  assert.deepEqual(returned.terrainPresentation, beforeLeaf.terrainPresentation);
  assert.equal(returned.journeyEventCount, beforeLeaf.journeyEventCount);
  assert.equal(returned.lastReturnReceipt?.state, 'PASS');
  assert.equal(returned.routePath, REGISTRY.fieldRoutePath);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.focusRef ?? null), `control.public-learning.read-leaf.${ATLAS_REF}`);

  await page.goto(`${base}${ATLAS_LEAF.routePath}`);
  await ready(page);
  await page.locator('#publicLeaf:not([hidden])').waitFor();
  const direct = await page.evaluate(() => globalThis.__vexlifePublicLearning.proof());
  assert.equal(direct.currentRef, ATLAS_REF);
  assert.equal(direct.journeyEventCount, 1, 'direct leaf forms only the entry Journey seed');
  assert.equal(await page.locator('#vexSummon').isDisabled(), true);
  assert.equal(await page.locator('#vexSummon').getAttribute('data-effect-state'), 'HELD');
  await page.locator('#publicLeafReturn').click();
  assert.equal(new URL(page.url()).pathname, REGISTRY.fieldRoutePath);
  assert.equal((await page.evaluate(() => globalThis.__vexlifePublicLearning.proof())).currentRef, ATLAS_REF);

  await page.selectOption('#languageSelect', 'ja');
  assert.equal(await page.locator('#publicDetailTitle').textContent(), PROJECTION.strings.ja['public.node.atlas.title']);
  await page.selectOption('#languageSelect', 'zh');
  assert.equal(await page.locator('#publicDetailTitle').textContent(), PROJECTION.strings.zh['public.node.atlas.title']);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await ready(page);
  const compact = await page.evaluate(() => globalThis.__vexlifePublicLearning.proof());
  assert.equal(compact.terrainPresentation.projectionGrammar, 'MOBILE_STACK');
  assert.equal(compact.semanticFrame.selectedNodeRef, REGISTRY.presentationPolicy.entryRef);
  assert.ok(requests.every((pathname) => REGISTRY.runtimeAllowlist.includes(pathname) || pathname === REGISTRY.fieldRoutePath || PROJECTION.leaves.some((leaf) => leaf.routePath === pathname)), `unadmitted runtime request: ${requests.find((pathname) => !REGISTRY.runtimeAllowlist.includes(pathname) && pathname !== REGISTRY.fieldRoutePath && !PROJECTION.leaves.some((leaf) => leaf.routePath === pathname))}`);
});

test('B3P-15 authored browser files are syntactically current', () => {
  for (const relative of ['reference/browser/public-learning/app.js','reference/browser/modules/public-learning-controller.js','test/public-learning-browser.test.mjs']) {
    const result = spawnSync(process.execPath, ['--check', path.join(ROOT, relative)], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${relative}: ${result.stderr}`);
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'blueprint/fragments/tests.json')), true);
});

// [VXG RealForever]
