import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { createVexLifeBrowserServer } from '../scripts/serve-browser.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const RELATIONSHIPS_TERRAIN_REF = 'terrain.resource.relationships';
const INTERFACE_CURRENTNESS_TEST_SOURCE = 'd'.repeat(64);
const INTERFACE_CURRENTNESS_TEST_AVAILABILITY = Object.freeze({
  schemaVersion: 'vexlife.companion-availability/v1',
  truthClass: 'SOURCE_BOUND_COMPANION_AVAILABILITY',
  availabilityState: 'HELD',
  registryRef: 'registry.test.interface-currentness.relationships',
  bindingRef: 'binding.test.interface-currentness.relationships',
  homeRef: 'home.test.interface-currentness.relationships',
  companionLineageRef: 'lineage.test.interface-currentness.relationships',
  runtimeAdapterRef: 'adapter.test.interface-currentness.relationships',
  runtimeObservationRef: 'observation.test.interface-currentness.relationships',
  recoveryClass: 'NONE',
  reasonCode: 'TEST_FIXTURE_HELD',
  bindingState: 'CURRENT',
  runtimeOwnershipState: 'CURRENT',
  runtimeState: 'HELD',
  qualificationState: 'HELD',
  projectionRef: 'projection.test.interface-currentness.relationships',
  projectionSha256: 'd'.repeat(64),
  modelRefOrNull: null,
  generationRefOrNull: null,
  sourceRefs: ['source.test.interface-currentness.relationships'],
  effectAuthorityGranted: false,
  rendererAuthorityGranted: false,
  modelIdentityAuthorityGranted: false,
  processAuthorityGranted: false,
  conversationAuthorityGranted: false
});
function interfaceCurrentnessTestConversation(scope) {
  return Object.freeze({
    schemaVersion: 'vexlife.browser-companion-conversation-currentness/v1',
    state: 'EMPTY',
    truthClass: 'CURRENT_LOCAL_CONVERSATION_IDENTITY',
    projectRef: scope.projectRef,
    threadRef: scope.threadRef,
    channelRef: scope.channelRef,
    channelSha256: null,
    channelRecordSha256: null,
    headMessageRefOrNull: null,
    headSequenceOrNull: null,
    canonicalConversationHeadSha256: null,
    headUpdatedAtOrNull: null,
    effectsPerformed: false
  });
}
function interfaceCurrentnessTestServerOptions() {
  return Object.freeze({
    servingSourceTreeSha256: INTERFACE_CURRENTNESS_TEST_SOURCE,
    companionBridge: Object.freeze({ conversationCurrentness: interfaceCurrentnessTestConversation }),
    resolveCompanionBinding: async () => Object.freeze({}),
    resolveCompanionRuntimeObservation: async () => Object.freeze({}),
    companionAvailabilityCompiler: () => INTERFACE_CURRENTNESS_TEST_AVAILABILITY
  });
}

async function openReferenceServer() {
  const server = createVexLifeBrowserServer({ staticRoot: ROOT, ...interfaceCurrentnessTestServerOptions() });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function enterRelationships(page, { keyboard = false } = {}) {
  await page.evaluate(async () => {
    await globalThis.__VEXLIFE_APP__.terrain.travel('terrain.project.self-development', 'in');
  });
  await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.terrain.currentRef() === 'terrain.project.self-development');
  const door = page.locator(`.e27-node[data-terrain-ref="${RELATIONSHIPS_TERRAIN_REF}"]`);
  await door.waitFor({ state: 'visible' });
  if (keyboard) {
    await door.focus();
    await page.keyboard.press('Enter');
  } else {
    await door.click();
  }
  await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.state.contextProjection === 'relationships');
}

async function openConnect(page, { keyboard = false } = {}) {
  const connect = page.locator('#relationshipsConnect');
  if (keyboard) {
    await connect.focus();
    await page.keyboard.press('Enter');
  } else {
    await connect.click();
  }
  await page.waitForFunction(() => {
    const panel = document.querySelector('[data-rel="connect-panel"]');
    const method = document.querySelector('#relationshipsConnectMethod');
    const details = document.querySelector('#relationshipsConnectionDetails');
    return Boolean(
      panel &&
      panel.hidden === false &&
      method &&
      details &&
      panel.contains(method) &&
      panel.contains(details) &&
      method.getClientRects().length > 0
    );
  });
}

async function disclosureState(page, selector) {
  return page.locator(selector).evaluate((details) => ({
    open: details.open,
    kind: details.dataset.relationshipsDisclosure,
    summary: details.querySelector(':scope > summary')?.textContent?.trim() ?? '',
    summaryRect: (() => {
      const rect = details.querySelector(':scope > summary')?.getBoundingClientRect();
      return rect ? { width: rect.width, height: rect.height } : null;
    })()
  }));
}

async function assertTouchSizedVisibleControls(page) {
  const undersized = await page.locator(
    '#view-relationships button:visible, #view-relationships select:visible, #view-relationships details > summary:visible'
  ).evaluateAll((elements) => elements
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { id: element.id || element.dataset.relationshipsDisclosureSummary || element.tagName, width: rect.width, height: rect.height };
    })
    .filter(({ width, height }) => width < 44 || height < 44));
  assert.deepEqual(undersized, []);
}

function assertNoEffectWidening(snapshot) {
  assert.equal(Object.values(snapshot.effects).every((value) => value === false), true);
  assert.equal(snapshot.connectionStatus.networkEffectPerformed, false);
  assert.equal(snapshot.connectionStatus.connected, false);
  assert.equal(snapshot.connectionStatus.delivered, false);
  assert.equal(snapshot.connectionStatus.semanticAcknowledged, false);
}

test('UX05 keeps the ordinary Relationships path primary while progressively disclosing diagnostics, Vex and recovery', { timeout: 90_000 }, async () => {
  const server = await openReferenceServer();
  const address = server.address();
  assert.equal(typeof address, 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(`${origin}/reference/browser/index.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__?.relationships));
    await enterRelationships(page);
    await openConnect(page);

    assert.equal(await page.locator('#view-relationships').getAttribute('data-human-first-presentation'), 'progressive-disclosure-v1');

    const diagnostics = await disclosureState(page, '#relationshipsConnectionDetails');
    const vex = await disclosureState(page, '#relationshipsVexDetails');
    const recovery = await disclosureState(page, '#relationshipsRecoveryDetails');
    assert.deepEqual([diagnostics.open, vex.open, recovery.open], [false, false, false]);
    assert.deepEqual([diagnostics.kind, vex.kind, recovery.kind], ['connection-diagnostics', 'vex-assistance', 'safety-recovery']);
    for (const disclosure of [diagnostics, vex, recovery]) {
      assert.ok(disclosure.summary.length > 0);
      assert.ok(disclosure.summaryRect?.width >= 44 && disclosure.summaryRect?.height >= 44, `disclosure summary not touch sized: ${JSON.stringify(disclosure)}`);
    }

    for (const selector of [
      '#relationshipsConnectMethod',
      '#relationshipsInvitation',
      '#relationshipsIdentity',
      '#relationshipsDecision',
      '#relationshipsLocalClass',
      '#relationshipsFormLocal',
      '#relationshipsConnectClose',
      '#relationshipsDelivery'
    ]) {
      assert.equal(await page.locator(selector).isVisible(), true, `primary Relationship control/status should remain visible: ${selector}`);
    }

    for (const selector of [
      '#relationshipsAlphaConsent',
      '#relationshipsPresence',
      '#relationshipsRoute',
      '#relationshipsFailure',
      '#relationshipsRuntimePlanStatus',
      '#relationshipsPrepareRuntimePlan',
      '#relationshipsVexExplain',
      '#relationshipsBlock',
      '#relationshipsRevoke',
      '#relationshipsWithdraw',
      '#relationshipsDisconnect',
      '#relationshipsReset'
    ]) {
      assert.equal(await page.locator(selector).isVisible(), false, `secondary control should be collapsed by default: ${selector}`);
    }

    const initialSnapshot = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(initialSnapshot.runtimePlan.state, 'IDLE');
    assertNoEffectWidening(initialSnapshot);

    const diagnosticsSummary = page.locator('#relationshipsConnectionDetails > summary');
    await diagnosticsSummary.click();
    assert.equal((await disclosureState(page, '#relationshipsConnectionDetails')).open, true);
    for (const selector of ['#relationshipsAlphaConsent', '#relationshipsPresence', '#relationshipsRoute', '#relationshipsFailure', '#relationshipsRuntimePlanStatus', '#relationshipsPrepareRuntimePlan']) {
      assert.equal(await page.locator(selector).isVisible(), true, `diagnostic control should be reachable on disclosure: ${selector}`);
    }

    const englishDiagnosticsLabel = (await disclosureState(page, '#relationshipsConnectionDetails')).summary;
    assert.equal(englishDiagnosticsLabel, 'Connection status');
    await page.locator('#surfaceMenuButton').click();
    await page.locator('#languageSelect').waitFor({ state: 'visible' });
    await page.selectOption('#languageSelect', 'ja');
    await page.waitForFunction(() => document.documentElement.lang === 'ja');
    await page.waitForFunction(() => {
      const details = document.querySelector('#relationshipsConnectionDetails');
      const summary = details?.querySelector(':scope > summary');
      return details?.open === true && summary?.textContent?.trim() === '接続状況';
    });
    const japaneseDiagnosticsLabel = (await disclosureState(page, '#relationshipsConnectionDetails')).summary;
    assert.equal(japaneseDiagnosticsLabel, '接続状況');
    assert.equal((await disclosureState(page, '#relationshipsConnectionDetails')).open, true);

    const vexSummary = page.locator('#relationshipsVexDetails > summary');
    await vexSummary.focus();
    await page.keyboard.press('Enter');
    assert.equal((await disclosureState(page, '#relationshipsVexDetails')).open, true);
    assert.equal(await page.locator('#relationshipsVexExplain').isVisible(), true);

    const recoverySummary = page.locator('#relationshipsRecoveryDetails > summary');
    await recoverySummary.focus();
    await page.keyboard.press('Enter');
    assert.equal((await disclosureState(page, '#relationshipsRecoveryDetails')).open, true);
    assert.equal(await page.locator('#relationshipsBlock').isVisible(), true);

    await assertTouchSizedVisibleControls(page);
    const afterDisclosure = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(afterDisclosure.runtimePlan.state, 'IDLE');
    assertNoEffectWidening(afterDisclosure);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);

    await context.close();
  } finally {
    if (browser) await browser.close();
    await closeServer(server);
  }
});

test('UX05 progressive disclosure remains compact, keyboard reachable and touch sized', { timeout: 90_000 }, async () => {
  const server = await openReferenceServer();
  const address = server.address();
  assert.equal(typeof address, 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(`${origin}/reference/browser/index.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__?.relationships));
    await enterRelationships(page, { keyboard: true });
    await openConnect(page, { keyboard: true });

    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `UX05 compact route overflowed by ${overflow}px`);

    for (const selector of ['#relationshipsConnectionDetails', '#relationshipsVexDetails', '#relationshipsRecoveryDetails']) {
      const summary = page.locator(`${selector} > summary`);
      assert.equal((await disclosureState(page, selector)).open, false);
      await summary.focus();
      assert.equal(await summary.evaluate((element) => document.activeElement === element), true);
      await page.keyboard.press('Enter');
      assert.equal((await disclosureState(page, selector)).open, true);
      await page.keyboard.press('Enter');
      assert.equal((await disclosureState(page, selector)).open, false);
    }

    await assertTouchSizedVisibleControls(page);
    const snapshot = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(snapshot.runtimePlan.state, 'IDLE');
    assertNoEffectWidening(snapshot);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);

    await context.close();
  } finally {
    if (browser) await browser.close();
    await closeServer(server);
  }
});

// [VXG RealForever]
