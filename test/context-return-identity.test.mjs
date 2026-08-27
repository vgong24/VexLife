import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { createVexLifeBrowserServer } from '../scripts/serve-browser.mjs';

async function waitForApp(page) {
  await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__));
}

async function openChat(page) {
  await page.locator('#surfaceMenuButton').click();
  await page.locator('[data-node-ref="element.nav.chat"]').click();
  await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.state.contextProjection === 'chat');
}

test('contextual close and Escape bind exact canonical Terrain return provenance', async (t) => {
  const server = createVexLifeBrowserServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(() => resolve())));

  const address = server.address();
  assert.equal(typeof address, 'object');
  const pageUrl = `http://127.0.0.1:${address.port}/reference/browser/`;
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(pageUrl, { waitUntil: 'load' });
  await waitForApp(page);

  const canonicalReturn = page.locator('[data-node-ref="element.nav.terrain"]');
  assert.equal(await canonicalReturn.count(), 1, 'CRT-01 canonical Terrain return target missing');

  await openChat(page);
  const selectedBeforeClose = await page.evaluate(() => globalThis.__VEXLIFE_APP__.navigation.semanticFrame().selectedNodeRef);
  const prefixBeforeClose = await page.evaluate(() => globalThis.__VEXLIFE_APP__.navigation.fullJourney());
  await canonicalReturn.click();
  await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.state.contextProjection === null);
  const explicitClose = await page.evaluate(() => {
    const app = globalThis.__VEXLIFE_APP__;
    return {
      frame: app.navigation.semanticFrame(),
      event: app.navigation.fullJourney().at(-1),
      journey: app.navigation.fullJourney()
    };
  });
  assert.equal(explicitClose.frame.contextProjection, null, 'CRT-02 explicit close did not restore Terrain');
  assert.equal(explicitClose.frame.selectedNodeRef, selectedBeforeClose, 'CRT-02 explicit close rewrote selected semantic node');
  assert.equal(explicitClose.event?.elementRef, 'element.nav.terrain', 'CRT-03 explicit close target provenance drifted');
  assert.equal(explicitClose.event?.actionRef, 'action.view.select', 'CRT-03 explicit close action provenance drifted');
  assert.deepEqual(explicitClose.journey.slice(0, prefixBeforeClose.length), prefixBeforeClose, 'CRT-06 explicit close edited historical Journey events');

  const traveled = await page.evaluate(async () => {
    const terrain = globalThis.__VEXLIFE_APP__.terrain;
    return [
      await terrain.travel('terrain.project.self-development', 'in'),
      await terrain.travel('terrain.thread.open-conversation', 'in')
    ];
  });
  assert.deepEqual(traveled, [true, true], 'CRT-04 deterministic Terrain setup failed');
  await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.navigation.semanticFrame().selectedNodeRef === 'terrain.thread.open-conversation');
  await openChat(page);
  const selectedBeforeEscape = await page.evaluate(() => globalThis.__VEXLIFE_APP__.navigation.semanticFrame().selectedNodeRef);
  const prefixBeforeEscape = await page.evaluate(() => globalThis.__VEXLIFE_APP__.navigation.fullJourney());

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.state.contextProjection === null);
  const escapeReturn = await page.evaluate(() => {
    const app = globalThis.__VEXLIFE_APP__;
    const journey = app.navigation.fullJourney();
    return { frame: app.navigation.semanticFrame(), event: journey.at(-1), journey };
  });
  assert.equal(escapeReturn.frame.contextProjection, null, 'CRT-04 Escape did not restore Terrain');
  assert.equal(escapeReturn.frame.selectedNodeRef, selectedBeforeEscape, 'CRT-04 Escape rewrote selected semantic node');
  assert.equal(escapeReturn.event?.elementRef, 'element.nav.terrain', 'CRT-05 Escape return target provenance drifted');
  assert.equal(escapeReturn.event?.actionRef, 'action.navigation.back', 'CRT-05 Escape return action provenance drifted');
  assert.deepEqual(escapeReturn.journey.slice(0, prefixBeforeEscape.length), prefixBeforeEscape, 'CRT-06 Escape edited historical Journey events');

  const chatEvents = escapeReturn.journey.filter((event) => event.elementRef === 'element.nav.chat');
  assert.ok(chatEvents.length >= 2, 'CRT-07 expected canonical Chat entries');
  assert.ok(chatEvents.every((event) => event.actionRef === 'action.view.select'), 'CRT-07 Chat entry action provenance regressed');
  assert.deepEqual(errors, [], `browser emitted console/page errors: ${errors.join(' | ')}`);
});

// [VXG RealForever]
