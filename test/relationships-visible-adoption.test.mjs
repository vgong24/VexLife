import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { project, validateRegistry } from '../reference/browser/relationships/core.js';
import { createVexLifeBrowserServer } from '../scripts/serve-browser.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const json = (relativePath) => JSON.parse(read(relativePath));
const RELATIONSHIPS_TERRAIN_REF = 'terrain.resource.relationships';

async function openReferenceServer() {
  const server = createVexLifeBrowserServer({ staticRoot: ROOT });
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

async function enterRelationships(page, { keyboard = false } = {}) {
  await page.evaluate(async () => { await globalThis.__VEXLIFE_APP__.terrain.travel('terrain.project.self-development', 'in'); });
  await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.terrain.currentRef() === 'terrain.project.self-development');
  const door = page.locator(`.e27-node[data-terrain-ref="${RELATIONSHIPS_TERRAIN_REF}"]`);
  await door.waitFor({ state:'visible' });
  assert.equal(await door.getAttribute('data-entry-element-ref'), 'element.relationships.open');
  assert.equal(await door.getAttribute('data-relationship-entry-binding-ref'), 'entry.relationships.self-development.001');
  if (keyboard) {
    await door.focus();
    assert.equal(await door.evaluate((element) => document.activeElement === element), true);
    await page.keyboard.press('Enter');
  } else {
    await door.click();
  }
  await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.state.contextProjection === 'relationships');
  return door;
}

function assertHumanVisibleText(text) {
  for (const forbidden of [
    'SYNTHETIC_REFERENCE',
    'RECEIVED_VERIFIED_REFERENCE',
    'RECEIVED_HELD_IDENTITY',
    'VERIFIED_CURRENT',
    'NOT_CONNECTED',
    'AVAILABLE_FOR_INVITES',
    'OFFLINE_PENDING_MAILBOX',
    'APP_ON_MODEL_UNLOADED',
    'PRESENCE_HIDDEN',
    'RELAY_ONLY',
    'UNREACHABLE_OR_LEASE_EXPIRED',
    'DIRECT_CANDIDATE',
    'STORE_FORWARD',
    'IDENTITY_CHECK_FAILED',
    'PEER_UNREACHABLE',
    'RELAY_UNAVAILABLE',
    'MAILBOX_ONLY',
    'SESSION_EXPIRED',
    'canonical implementation',
    'no external effect'
  ]) {
    assert.equal(text.includes(forbidden), false, `machine/proof vocabulary leaked into primary Relationships copy: ${forbidden}`);
  }
}

function undersizedControls(page) {
  return page.locator('#view-relationships button:visible, #view-relationships select:visible').evaluateAll((elements) =>
    elements.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width < 44 || rect.height < 44;
    }).map((element) => ({ id:element.id, width:element.getBoundingClientRect().width, height:element.getBoundingClientRect().height }))
  );
}

test('Relationships visible adoption binds the stable resource to Self Development without effect widening', () => {
  const registry = validateRegistry(json('blueprint/relationships-browser-registry.json'));
  const terrain = json('blueprint/fragments/terrain.json');
  const featureRegistry = json('blueprint/feature-registry.json');
  const moduleRegistry = json('blueprint/module-registry/browser.json');
  const moduleComposition = json('blueprint/module-registry.json');
  const runtimeModuleRegistry = json('blueprint/module-registry/relationships-runtime-bridge.json');
  const descriptor = json('blueprint/vexlife.blueprint.json');
  const screen = json('blueprint/fragments/screens/relationships.json');

  assert.equal(registry.resource.resourceRef, 'resource.vexlife.relationships');
  assert.equal(registry.resource.screenRef, 'screen.vexlife.relationships');
  assert.equal(registry.resource.routeRef, 'route.relationships');
  assert.equal(registry.resource.stableAcrossEntryRebind, true);
  assert.equal(registry.entryPolicy.activeEntryBindingRef, 'entry.relationships.self-development.001');
  assert.equal(registry.entryPolicy.visibleRegisteredDoorRequired, true);
  assert.equal(registry.entryPolicy.semanticTeleportationAllowed, false);
  assert.equal(registry.publicSearch, false);
  assert.equal(registry.communitySearch, false);
  assert.equal(registry.vexAssistance.modelRequired, false);
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
  assert.ok(moduleComposition.includes.modules.includes('blueprint/module-registry/relationships-runtime-bridge.json'));
  const runtimeBridgeModules = runtimeModuleRegistry.filter((module) => module.moduleRef === 'module.vexlife.core.relationships-runtime-bridge');
  assert.equal(runtimeBridgeModules.length, 1);
  const [runtimeBridgeModule] = runtimeBridgeModules;
  assert.equal(runtimeBridgeModule.path, 'src/core/browser-relationships-runtime-bridge.mjs');
  assert.deepEqual(runtimeBridgeModule.writes, []);
  assert.ok(runtimeBridgeModule.loadedBy.includes('module.vexlife.script.serve-browser'));
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

    await enterRelationships(page);

    assert.equal(await page.locator('#view-relationships').isVisible(), true);
    assert.equal(await page.locator('#view-relationships [data-rel="title"]').textContent(), 'Relationships');
    assert.match(await page.locator('#view-relationships [data-rel="privacy"]').textContent(), /Invite only/i);
    assert.match(await page.locator('#view-relationships [data-rel="privacy"]').textContent(), /Public search:\s*OFF/i);
    assertHumanVisibleText(await page.locator('#view-relationships').textContent());
    assert.equal((await page.locator('#view-relationships').textContent()).includes('http://'), false);
    assert.equal((await page.locator('#view-relationships').textContent()).includes('ws://'), false);

    const connect = page.locator('#relationshipsConnect');
    const box = await connect.boundingBox();
    assert.ok(box && box.height >= 44 && box.width >= 44, `Connect someone target too small: ${JSON.stringify(box)}`);
    await connect.click();
    assert.equal(await page.locator('[data-rel="connect-panel"]').isVisible(), true);
    assert.match(await page.locator('[data-rel="connect-panel"]').textContent(), /does not send or save anything yet/i);
    assert.equal(await page.locator('#relationshipsFormLocal').isDisabled(), true);
    assert.equal(await page.locator('#relationshipsInvitation option[value="RECEIVED_VERIFIED_REFERENCE"]').textContent(), 'Invitation received and verified');
    assert.equal(await page.locator('#relationshipsIdentity option[value="VERIFIED_CURRENT"]').textContent(), 'Identity verified');
    assert.equal(await page.locator('#relationshipsDecision option[value="NARROW"]').textContent(), 'Accept with limits');
    assert.equal(await page.locator('#relationshipsPresence option[value="APP_ON_MODEL_UNLOADED"]').textContent(), 'App open · companion not loaded');
    assert.equal(await page.locator('#relationshipsRoute option[value="DIRECT_CANDIDATE"]').textContent(), 'Direct connection available');
    assert.equal(await page.locator('#relationshipsFailure option[value="NONE"]').textContent(), 'No current connection issue');
    await page.selectOption('#relationshipsInvitation', 'RECEIVED_VERIFIED_REFERENCE');
    await page.selectOption('#relationshipsIdentity', 'VERIFIED_CURRENT');
    await page.selectOption('#relationshipsDecision', 'NARROW');
    assert.equal(await page.locator('#relationshipsFormLocal').isDisabled(), false);
    await page.locator('#relationshipsFormLocal').click();
    assert.match(await page.locator('#relationshipsConnectStatus').textContent(), /Nothing has been sent or saved/i);
    let formed = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(formed.localFormed, true);
    assert.equal(formed.admission.admitted, true);
    assert.equal(formed.delivery, 'NOT_CONNECTED');
    assert.equal(formed.cdrGate.alphaConsentAcknowledged, false);
    assert.equal(formed.runtimePlan.state, 'IDLE');

    await page.locator('#relationshipsPrepareRuntimePlan').click();
    await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.relationships.snapshot().runtimePlan.state === 'HELD');
    let held = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(held.runtimePlan.state, 'HELD');
    assert.equal(held.delivery, 'NOT_CONNECTED');
    assert.match(await page.locator('#relationshipsRuntimePlanStatus').textContent(), /Host plan held/i);

    const alpha = page.locator('#relationshipsAlphaConsent');
    assert.equal(await alpha.isDisabled(), false);
    await alpha.click();
    assert.equal(await page.locator('#relationshipsAlphaConsent').isDisabled(), true);
    assert.match(await page.locator('#relationshipsAlphaConsent').textContent(), /acknowledged/i);
    formed = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(formed.cdrGate.alphaConsentAcknowledged, true);
    assert.equal(formed.runtimePlan.state, 'IDLE');

    await page.locator('#relationshipsPrepareRuntimePlan').click();
    await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.relationships.snapshot().runtimePlan.state === 'HOST_BINDING_REQUIRED');
    const planned = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(planned.runtimePlan.state, 'HOST_BINDING_REQUIRED');
    assert.equal(planned.runtimePlan.hostExecutionDeferred, true);
    assert.equal(planned.runtimePlan.semanticAcknowledged, false);
    assert.equal(planned.delivery, 'NOT_CONNECTED');
    assert.match(await page.locator('#relationshipsRuntimePlanStatus').textContent(), /no network connection has started/i);
    assertHumanVisibleText(await page.locator('#view-relationships').textContent());

    const hundred = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.setScenarioCount(100));
    assert.equal(hundred.mode, 'AGGREGATE');
    assert.equal(hundred.accessibleRelationshipCount, 100);
    assert.equal(hundred.virtualizationRequired, true);
    assert.equal(hundred.directRelationshipRefs.length, 3);
    await page.locator('#relationshipsBookletToggle').click();
    assert.equal(await page.locator('[data-virtualization-required="true"]').isVisible(), true);
    assert.equal(await page.locator('ol[aria-label="Accessible relationship list"] li').count(), 20);

    await page.locator('#surfaceMenuButton').click();
    await page.locator('#languageSelect').waitFor({ state:'visible' });
    await page.selectOption('#languageSelect', 'ja');
    await page.waitForFunction(() => document.documentElement.lang === 'ja');
    assert.equal(await page.locator('#view-relationships [data-rel="title"]').textContent(), '関係');
    assert.equal(await page.locator('#relationshipsInvitation option[value="RECEIVED_VERIFIED_REFERENCE"]').textContent(), '招待を受信し、検証済み');
    assert.equal(await page.locator('#relationshipsPresence option[value="APP_ON_MODEL_UNLOADED"]').textContent(), 'アプリは起動中 · コンパニオン未読込');
    await page.selectOption('#languageSelect', 'zh');
    await page.waitForFunction(() => document.documentElement.lang === 'zh');
    assert.equal(await page.locator('#view-relationships [data-rel="title"]').textContent(), '关系');
    assert.equal(await page.locator('#relationshipsInvitation option[value="RECEIVED_VERIFIED_REFERENCE"]').textContent(), '已收到并验证邀请');
    assert.equal(await page.locator('#relationshipsRoute option[value="DIRECT_CANDIDATE"]').textContent(), '可直接连接');

    const snap = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(snap.resourceRef, 'resource.vexlife.relationships');
    assert.equal(snap.publicSearch, false);
    assert.equal(snap.communitySearch, false);
    assert.equal(snap.delivery, 'NOT_CONNECTED');
    assert.equal(snap.runtimePlan.state, 'HOST_BINDING_REQUIRED');
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

test('Relationships composed compact route is touch-sized, keyboard-operable, screen-reader-addressable and motion-independent', { timeout: 90_000 }, async () => {
  const server = await openReferenceServer();
  const address = server.address();
  assert.equal(typeof address, 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless:true });
    const context = await browser.newContext({ viewport:{ width:390, height:844 }, hasTouch:true, reducedMotion:'reduce' });
    const page = await context.newPage();
    const requests = [];
    const consoleErrors = [];
    const pageErrors = [];
    page.on('request', (request) => requests.push(request.url()));
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(`${origin}/reference/browser/index.html`, { waitUntil:'networkidle' });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__?.relationships));
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);

    await enterRelationships(page, { keyboard:true });
    assert.equal(await page.locator('#view-relationships').isVisible(), true);
    assert.equal(await page.evaluate(() => globalThis.__VEXLIFE_APP__.terrain.currentRef()), RELATIONSHIPS_TERRAIN_REF);
    assert.equal((await page.evaluate(() => globalThis.__VEXLIFE_APP__.navigation.semanticFrame())).selectedNodeRef, RELATIONSHIPS_TERRAIN_REF);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `Relationships compact route overflowed by ${overflow}px`);
    assert.deepEqual(await undersizedControls(page), []);

    const connect = page.locator('#relationshipsConnect');
    await connect.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-rel="connect-panel"]').isVisible(), true);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'relationshipsConnectMethod');
    assert.equal(await page.getByLabel('Invitation method').count(), 1);
    assert.equal(await page.getByRole('combobox', { name:'Invitation', exact:true }).count(), 1);
    assert.equal(await page.getByRole('combobox', { name:'Identity check', exact:true }).count(), 1);
    assert.equal(await page.getByLabel('Your decision').count(), 1);
    assert.equal(await page.getByLabel('Your label').count(), 1);
    assert.equal(await page.getByRole('combobox', { name:'Presence', exact:true }).count(), 1);
    assert.equal(await page.getByRole('combobox', { name:'Route', exact:true }).count(), 1);
    assert.equal(await page.getByRole('combobox', { name:'Current connection issue', exact:true }).count(), 1);
    assert.equal(await page.locator('#view-relationships').getByRole('status').count(), 2);
    assert.equal(await page.locator('#relationshipsConnectMethod option[value="QR_PROJECTION"]').textContent(), 'QR code');
    assert.equal(await page.locator('#relationshipsInvitation option[value="RECEIVED_VERIFIED_REFERENCE"]').textContent(), 'Invitation received and verified');
    assert.equal(await page.locator('#relationshipsPresence option[value="APP_ON_MODEL_UNLOADED"]').textContent(), 'App open · companion not loaded');
    assert.equal(await page.locator('#relationshipsRoute option[value="DIRECT_CANDIDATE"]').textContent(), 'Direct connection available');
    assert.equal(await page.locator('#relationshipsFailure option[value="NONE"]').textContent(), 'No current connection issue');
    assert.deepEqual(await undersizedControls(page), []);
    assertHumanVisibleText(await page.locator('#view-relationships').textContent());

    await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.setScenarioCount(100));
    const booklet = page.locator('#relationshipsBookletToggle');
    await booklet.focus();
    await page.keyboard.press('Enter');
    const list = page.locator('ol[aria-label="Accessible relationship list"]');
    assert.equal(await list.isVisible(), true);
    assert.equal(await list.locator('li').count(), 20);
    const snapshot = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(snapshot.accessibleRelationshipCount, 100);
    assert.equal(snapshot.virtualizationRequired, true);
    assert.equal(snapshot.runtimePlan.state, 'IDLE');
    assert.equal(Object.values(snapshot.effects).every((value) => value === false), true);

    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    assertLoopbackOnly(requests);
    await context.close();
  } finally {
    if (browser) await browser.close();
    await closeServer(server);
  }
});

test('Relationships ignores a delayed host-ready response after the originating route truth changes', { timeout: 90_000 }, async () => {
  const server = await openReferenceServer();
  const address = server.address();
  assert.equal(typeof address, 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless:true });
    const context = await browser.newContext({ viewport:{ width:1280, height:900 } });
    const page = await context.newPage();
    await page.goto(`${origin}/reference/browser/index.html`, { waitUntil:'networkidle' });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__?.relationships));
    await enterRelationships(page);
    await page.locator('#relationshipsConnect').click();
    await page.selectOption('#relationshipsInvitation', 'RECEIVED_VERIFIED_REFERENCE');
    await page.selectOption('#relationshipsIdentity', 'VERIFIED_CURRENT');
    await page.selectOption('#relationshipsDecision', 'ACCEPT');
    await page.locator('#relationshipsFormLocal').click();
    await page.locator('#relationshipsAlphaConsent').click();

    let interceptedResolve;
    const intercepted = new Promise((resolve) => { interceptedResolve = resolve; });
    let releaseResolve;
    const release = new Promise((resolve) => { releaseResolve = resolve; });
    let fulfilledResolve;
    const fulfilled = new Promise((resolve) => { fulfilledResolve = resolve; });
    await page.route('**/api/v1/relationships/runtime-plan', async (route) => {
      const response = await route.fetch();
      interceptedResolve();
      await release;
      await route.fulfill({ response });
      fulfilledResolve();
    });

    await page.locator('#relationshipsPrepareRuntimePlan').click();
    await intercepted;
    assert.equal((await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot())).runtimePlan.state, 'PREPARING');

    await page.selectOption('#relationshipsRoute', 'UNAVAILABLE');
    const changed = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(changed.cdrGate.routeClass, 'UNAVAILABLE');
    assert.equal(changed.runtimePlan.state, 'IDLE');

    releaseResolve();
    await fulfilled;
    await page.waitForTimeout(50);
    const afterStaleReturn = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(afterStaleReturn.cdrGate.routeClass, 'UNAVAILABLE');
    assert.equal(afterStaleReturn.runtimePlan.state, 'IDLE');
    assert.equal(afterStaleReturn.runtimePlan.semanticAcknowledged, false);
    assert.equal(afterStaleReturn.delivery, 'NOT_CONNECTED');
    assert.equal(Object.values(afterStaleReturn.effects).every((value) => value === false), true);

    await context.close();
  } finally {
    if (browser) await browser.close();
    await closeServer(server);
  }
});

test('Relationships rejects a substituted runtime-plan product-gate echo instead of presenting host readiness', { timeout: 90_000 }, async () => {
  const server = await openReferenceServer();
  const address = server.address();
  assert.equal(typeof address, 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless:true });
    const context = await browser.newContext({ viewport:{ width:1280, height:900 } });
    const page = await context.newPage();
    await page.goto(`${origin}/reference/browser/index.html`, { waitUntil:'networkidle' });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__?.relationships));
    await enterRelationships(page);
    await page.locator('#relationshipsConnect').click();
    await page.selectOption('#relationshipsInvitation', 'RECEIVED_VERIFIED_REFERENCE');
    await page.selectOption('#relationshipsIdentity', 'VERIFIED_CURRENT');
    await page.selectOption('#relationshipsDecision', 'NARROW');
    await page.locator('#relationshipsFormLocal').click();
    await page.locator('#relationshipsAlphaConsent').click();

    await page.route('**/api/v1/relationships/runtime-plan', async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      payload.productGateSnapshot = { ...payload.productGateSnapshot, routeClass: 'RELAYED' };
      await route.fulfill({
        status: response.status(),
        headers: response.headers(),
        body: `${JSON.stringify(payload)}\n`
      });
    });

    await page.locator('#relationshipsPrepareRuntimePlan').click();
    await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.relationships.snapshot().runtimePlan.state === 'FAILURE');
    const rejected = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(rejected.cdrGate.routeClass, 'DIRECT_CANDIDATE');
    assert.equal(rejected.runtimePlan.state, 'FAILURE');
    assert.equal(rejected.runtimePlan.failureCode, 'RELATIONSHIPS_RUNTIME_PLAN_FAILED');
    assert.equal(rejected.runtimePlan.semanticAcknowledged, false);
    assert.equal(rejected.delivery, 'NOT_CONNECTED');
    assert.equal(Object.values(rejected.effects).every((value) => value === false), true);

    await context.close();
  } finally {
    if (browser) await browser.close();
    await closeServer(server);
  }
});
