import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { project, validateRegistry } from '../reference/browser/relationships/core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const json = (relativePath) => JSON.parse(read(relativePath));
const RELATIONSHIPS_TERRAIN_REF = 'terrain.resource.relationships';

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

async function openReferenceServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const target = path.resolve(ROOT, relative);
    if (target !== ROOT && !target.startsWith(`${ROOT}${path.sep}`)) {
      response.writeHead(403).end('forbidden');
      return;
    }
    fs.readFile(target, (error, bytes) => {
      if (error) { response.writeHead(404).end('not found'); return; }
      response.writeHead(200, { 'Content-Type': contentType(target), 'Cache-Control':'no-store' });
      response.end(bytes);
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return server;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function assertLoopbackOnly(urls) {
  assert.ok(urls.length > 0, 'expected browser asset requests');
  for (const value of urls) {
    const url = new URL(value);
    assert.equal(url.protocol, 'http:');
    assert.equal(url.hostname, '127.0.0.1');
  }
}

test('Relationships visible adoption binds the stable resource to Self Development without effect widening', () => {
  const registry = validateRegistry(json('blueprint/relationships-browser-registry.json'));
  const terrain = json('blueprint/fragments/terrain.json');
  const featureRegistry = json('blueprint/feature-registry.json');
  const moduleRegistry = json('blueprint/module-registry/browser.json');
  const descriptor = json('blueprint/vexlife.blueprint.json');
  const screen = json('blueprint/fragments/screens/relationships.json');

  assert.equal(registry.resource.resourceRef, 'resource.vexlife.relationships');
  assert.equal(registry.resource.screenRef, 'screen.vexlife.relationships');
  assert.equal(registry.resource.routeRef, 'route.relationships');
  assert.equal(registry.entryPolicy.activeEntryBindingRef, 'entry.relationships.self-development.001');
  assert.equal(registry.entryPolicy.visibleRegisteredDoorRequired, true);
  assert.equal(registry.entryPolicy.semanticTeleportationAllowed, false);
  assert.equal(registry.publicSearch, false);
  assert.equal(registry.communitySearch, false);
  assert.equal(Object.values(registry.effects).every((value) => value === false), true);

  const node = terrain.find((candidate) => candidate.terrainNodeRef === RELATIONSHIPS_TERRAIN_REF);
  assert.ok(node);
  assert.equal(node.parentRef, 'terrain.project.self-development');
  assert.equal(node.kind, 'RESOURCE');
  assert.equal(node.labelStringRef, 'screen.relationships.title');

  assert.ok(descriptor.includes.screens.includes('blueprint/fragments/screens/relationships.json'));
  assert.equal(screen.screenRef, registry.resource.screenRef);
  assert.equal(screen.routeRef, registry.resource.routeRef);
  assert.ok(screen.regions.flatMap((region) => region.elements).some((element) => element.elementRef === 'element.relationships.open' && element.terrainNodeRef === RELATIONSHIPS_TERRAIN_REF));

  const feature = featureRegistry.features.find((candidate) => candidate.featureRef === 'feature.vexlife.relationships');
  assert.ok(feature);
  assert.equal(feature.effectClass, 'READ_PROJECTION');
  assert.equal(feature.dataClass, 'SYNTHETIC_RELATIONSHIP_REFERENCE_NO_REAL_PARTICIPANT_DATA');
  assert.deepEqual(feature.platformRefs, ['platform.browser']);
  assert.ok(feature.moduleRefs.includes('module.vexlife.browser.relationships-controller'));
  assert.ok(moduleRegistry.some((module) => module.moduleRef === 'module.vexlife.browser.relationships-controller'));
  assert.ok(moduleRegistry.some((module) => module.moduleRef === 'module.vexlife.browser.relationships-core'));
});

test('Relationships scale projection preserves direct identity and aggregation boundaries', () => {
  const registry = validateRegistry(json('blueprint/relationships-browser-registry.json'));
  for (const count of registry.scenarioCounts) {
    const view = project(registry, count, 1, count === 0 ? { groups:0, invitations:0 } : registry.syntheticFixtureCounts);
    assert.equal(view.counts.people, count);
    assert.equal(view.accessibleRows.length, count);
    assert.equal(new Set(view.accessibleRows.map((person) => person.relationshipRef)).size, count);
    assert.equal(view.mode, count < 6 ? 'DIRECT' : 'AGGREGATE');
    assert.equal(view.direct.length, count < 6 ? count : Math.min(3, count));
    assert.equal(view.virtualizationRequired, count >= 100);
  }
});

test('Relationships root browser route is visible, localized, accessible and no-effect', { timeout: 90_000 }, async () => {
  const server = await openReferenceServer();
  const address = server.address();
  assert.equal(typeof address, 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless:true });
    const context = await browser.newContext({ viewport:{ width:1280, height:900 } });
    const page = await context.newPage();
    const requests = [];
    let popups = 0;
    let downloads = 0;
    page.on('request', (request) => requests.push(request.url()));
    page.on('popup', () => { popups += 1; });
    page.on('download', () => { downloads += 1; });

    await page.goto(`${origin}/reference/browser/index.html`, { waitUntil:'networkidle' });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__?.relationships));

    await page.evaluate(async () => { await globalThis.__VEXLIFE_APP__.terrain.travel('terrain.project.self-development', 'in'); });
    await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.terrain.currentRef() === 'terrain.project.self-development');
    const door = page.locator(`.e27-node[data-terrain-ref="${RELATIONSHIPS_TERRAIN_REF}"]`);
    await door.waitFor({ state:'visible' });
    assert.equal(await door.getAttribute('data-entry-element-ref'), 'element.relationships.open');
    assert.equal(await door.getAttribute('data-relationship-entry-binding-ref'), 'entry.relationships.self-development.001');
    await door.click();

    await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.state.contextProjection === 'relationships');
    assert.equal(await page.locator('#view-relationships').isVisible(), true);
    assert.equal(await page.locator('#view-relationships [data-rel="title"]').textContent(), 'Relationships');
    assert.match(await page.locator('#view-relationships [data-rel="privacy"]').textContent(), /Invite only/i);
    assert.match(await page.locator('#view-relationships [data-rel="privacy"]').textContent(), /Public search:\s*OFF/i);
    assert.equal((await page.locator('#view-relationships').textContent()).includes('http://'), false);
    assert.equal((await page.locator('#view-relationships').textContent()).includes('ws://'), false);

    const connect = page.locator('#relationshipsConnect');
    const box = await connect.boundingBox();
    assert.ok(box && box.height >= 44 && box.width >= 44, `Connect someone target too small: ${JSON.stringify(box)}`);
    await connect.click();
    assert.equal(await page.locator('[data-rel="connect-panel"]').isVisible(), true);
    assert.match(await page.locator('[data-rel="connect-panel"]').textContent(), /Nothing is sent or persisted here/i);
    assert.equal(await page.locator('#relationshipsFormLocal').isDisabled(), true);
    await page.selectOption('#relationshipsInvitation', 'RECEIVED_VERIFIED_REFERENCE');
    await page.selectOption('#relationshipsIdentity', 'VERIFIED_CURRENT');
    await page.selectOption('#relationshipsDecision', 'NARROW');
    assert.equal(await page.locator('#relationshipsFormLocal').isDisabled(), false);
    await page.locator('#relationshipsFormLocal').click();
    assert.match(await page.locator('#relationshipsConnectStatus').textContent(), /Nothing was sent or persisted/i);
    assert.equal((await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot())).localFormed, true);

    const hundred = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.setScenarioCount(100));
    assert.equal(hundred.mode, 'AGGREGATE');
    assert.equal(hundred.accessibleRelationshipCount, 100);
    assert.equal(hundred.virtualizationRequired, true);
    assert.equal(hundred.directRelationshipRefs.length, 3);
    await page.locator('#relationshipsBookletToggle').click();
    assert.equal(await page.locator('[data-virtualization-required="true"]').isVisible(), true);

    await page.selectOption('#languageSelect', 'ja');
    await page.waitForFunction(() => document.documentElement.lang === 'ja');
    assert.equal(await page.locator('#view-relationships [data-rel="title"]').textContent(), '関係');
    await page.selectOption('#languageSelect', 'zh');
    await page.waitForFunction(() => document.documentElement.lang === 'zh');
    assert.equal(await page.locator('#view-relationships [data-rel="title"]').textContent(), '关系');

    const snap = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(snap.resourceRef, 'resource.vexlife.relationships');
    assert.equal(snap.publicSearch, false);
    assert.equal(snap.communitySearch, false);
    assert.equal(Object.values(snap.effects).every((value) => value === false), true);
    assert.equal(popups, 0);
    assert.equal(downloads, 0);
    assertLoopbackOnly(requests);

    await page.evaluate(async () => { await globalThis.__VEXLIFE_APP__.terrain.up(); });
    await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.terrain.currentRef() === 'terrain.project.self-development');
    assert.equal(await page.locator('#view-relationships').isVisible(), false);
    assert.equal((await page.evaluate(() => globalThis.__VEXLIFE_APP__.navigation.semanticFrame())).selectedNodeRef, 'terrain.project.self-development');

    await context.close();
  } finally {
    if (browser) await browser.close();
    await closeServer(server);
  }
});
