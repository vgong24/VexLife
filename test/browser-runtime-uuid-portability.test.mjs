import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createVexLifeBrowserServer } from '../scripts/serve-browser.mjs';
import { createBrowserRandomUuid, installBrowserRandomUuid } from '../reference/browser/modules/browser-random-uuid.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function deterministicCrypto() {
  let seed = 0;
  return {
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = (seed + index * 17 + 3) & 0xff;
      seed = (seed + 29) & 0xff;
      return bytes;
    }
  };
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function close(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('browser UUID fallback uses CSPRNG bytes and produces UUID v4 without Math.random', () => {
  const cryptoLike = deterministicCrypto();
  const create = createBrowserRandomUuid(cryptoLike);
  const first = create();
  const second = create();
  assert.match(first, UUID_V4);
  assert.match(second, UUID_V4);
  assert.notEqual(first, second);
  const installation = installBrowserRandomUuid(cryptoLike);
  assert.equal(installation.source, 'GET_RANDOM_VALUES_UUID_V4');
  assert.match(cryptoLike.randomUUID(), UUID_V4);
  const source = fs.readFileSync(path.join(ROOT, 'reference/browser/modules/browser-random-uuid.js'), 'utf8');
  assert.equal(source.includes('Math.random'), false);
});

test('browser UUID fallback fails closed when no cryptographically secure random source exists', () => {
  assert.throws(
    () => createBrowserRandomUuid({}),
    /cryptographically secure random source/u
  );
});

test('real browser initializes without native randomUUID and human-click path reaches Security & Access', async (t) => {
  const server = createVexLifeBrowserServer();
  const port = await listen(server);
  t.after(() => close(server));

  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    const disable = (target) => {
      try { Object.defineProperty(target, 'randomUUID', { configurable: true, value: undefined }); } catch {}
    };
    if (globalThis.Crypto?.prototype) disable(globalThis.Crypto.prototype);
    if (globalThis.crypto) disable(globalThis.crypto);
    globalThis.__VEXLIFE_TEST_RANDOM_UUID_ABSENT_AT_DOCUMENT_START__ = typeof globalThis.crypto?.randomUUID !== 'function';
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`http://127.0.0.1:${port}/reference/browser/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__));

  assert.equal(await page.evaluate(() => globalThis.__VEXLIFE_TEST_RANDOM_UUID_ABSENT_AT_DOCUMENT_START__), true);
  assert.equal(await page.evaluate(() => typeof globalThis.crypto?.randomUUID), 'function');
  assert.deepEqual(pageErrors, []);

  await page.locator('#surfaceMenuButton').click();
  assert.equal(await page.locator('#surfaceMenu').evaluate((node) => node.hidden), false);
  await page.locator('#openHealth').click();
  await page.waitForFunction(() => document.querySelector('#view-health')?.hidden === false);
  assert.equal(await page.locator('#securityAccessRegion').isVisible(), true);
  assert.equal(await page.locator('#securityAccessPreviewContent').isVisible(), true);

  const livedUuidConsumers = await page.evaluate(() => {
    const app = globalThis.__VEXLIFE_APP__;
    app.guide.addMessage('guide', { contentRef: 'guide.intro' });
    const journal = app.livingJournal.addMarginalia('UUID portability regression');
    return {
      journeyCount: app.navigation.fullJourney().length,
      marginaliaCount: journal.totalMarginaliaCount,
      securityRuntimeState: app.securityAccess.snapshot().projection.runtimeState,
      protectedEffectPerformed: app.securityAccess.snapshot().protectedEffectPerformed
    };
  });
  assert.ok(livedUuidConsumers.journeyCount >= 1);
  assert.ok(livedUuidConsumers.marginaliaCount >= 1);
  assert.equal(livedUuidConsumers.securityRuntimeState, 'BACKEND_UNAVAILABLE');
  assert.equal(livedUuidConsumers.protectedEffectPerformed, false);
});

// [VXG RealForever]
