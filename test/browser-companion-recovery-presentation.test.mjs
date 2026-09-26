import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import {
  BROWSER_COMPANION_RECOVERY_ACTION_PATH,
  normalizeBrowserCompanionRecoveryActionBinding,
  requestBrowserCompanionRecoveryAction
} from '../reference/browser/modules/chat-controller.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function action(overrides = {}) {
  return {
    schemaVersion: 'vexlife.browser-companion-recovery-action-binding/v1',
    truthClass: 'SOURCE_BOUND_COMPANION_RECOVERY_ACTION',
    actionRef: 'action.companion.reenter-current-binding',
    availabilityProjectionRef: 'projection.vexlife.companion-availability.current',
    effectAuthorityGranted: false,
    ...overrides
  };
}

function response(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return structuredClone(body); }
  };
}

test('VR06 presentation accepts only the exact bounded recovery-action binding', () => {
  const exact = action();
  assert.deepEqual(normalizeBrowserCompanionRecoveryActionBinding(exact), exact);
  assert.throws(
    () => normalizeBrowserCompanionRecoveryActionBinding({ ...exact, runtimeEffectAuthority: true }),
    /binding is invalid/u
  );
  assert.throws(
    () => normalizeBrowserCompanionRecoveryActionBinding({ ...exact, effectAuthorityGranted: true }),
    /binding is invalid/u
  );
  assert.throws(
    () => normalizeBrowserCompanionRecoveryActionBinding({ ...exact, requestRef: 'request.forbidden' }),
    /binding is invalid/u
  );
});

test('VR06 presentation performs GET binding then POST exact binding without a Companion turn request', async () => {
  const calls = [];
  const exact = action();
  const fetchImpl = async (url, options = {}) => {
    const method = options.method ?? 'GET';
    calls.push({ url, method, body: options.body ?? null });
    if (method === 'GET') return response(exact);
    if (method === 'POST') {
      assert.deepEqual(JSON.parse(options.body), exact);
      return response({ state: 'RECOVERY_ACCEPTED', requestRef: 'request.server-owned' });
    }
    return response({}, { status: 405 });
  };

  const result = await requestBrowserCompanionRecoveryAction({
    fetchImpl,
    expectedAvailabilityProjectionRef: exact.availabilityProjectionRef
  });

  assert.equal(result.action.availabilityProjectionRef, exact.availabilityProjectionRef);
  assert.deepEqual(calls.map(({ url, method }) => ({ url, method })), [
    { url: BROWSER_COMPANION_RECOVERY_ACTION_PATH, method: 'GET' },
    { url: BROWSER_COMPANION_RECOVERY_ACTION_PATH, method: 'POST' }
  ]);
  assert.equal(calls.some(({ url }) => url.includes('/companion/turn')), false);
});

test('VR06 presentation rejects a stale action binding before POST', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method ?? 'GET' });
    return response(action({ availabilityProjectionRef: 'projection.stale' }));
  };

  await assert.rejects(
    requestBrowserCompanionRecoveryAction({
      fetchImpl,
      expectedAvailabilityProjectionRef: 'projection.visible-current'
    }),
    /stale relative to visible availability/u
  );
  assert.deepEqual(calls, [
    { url: BROWSER_COMPANION_RECOVERY_ACTION_PATH, method: 'GET' }
  ]);
});

test('VR06 recovery presentation copy is localized in en ja zh and keeps READY as the real-turn threshold', () => {
  for (const language of ['en', 'ja', 'zh']) {
    const strings = JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint', 'strings', language + '.json'), 'utf8'));
    for (const key of [
      'composer.availability.recoverable',
      'composer.availability.recoverable-draft',
      'composer.recovery.action',
      'composer.recovery.failed',
      'composer.recovery.pending'
    ]) {
      assert.equal(typeof strings[key], 'string', language + ':' + key);
      assert.notEqual(strings[key].trim(), '', language + ':' + key);
    }
    assert.match(strings['composer.availability.recoverable'], /READY/u);
  }
});

function browserAvailability(state = 'RECOVERABLE') {
  const recoverable = state === 'RECOVERABLE';
  return {
    schemaVersion: 'vexlife.companion-availability/v1',
    truthClass: 'SOURCE_BOUND_COMPANION_AVAILABILITY',
    registryRef: 'registry.vexlife.companion-availability.001',
    bindingRef: 'binding.vr06.presentation',
    homeRef: 'home.vr06.presentation',
    companionLineageRef: 'lineage.vr06.presentation',
    modelRefOrNull: 'model.vr06.presentation',
    generationRefOrNull: 'generation.vr06.presentation',
    runtimeAdapterRef: 'adapter.runtime.vr06.presentation',
    runtimeObservationRef: recoverable ? 'observation.vr06.presentation.stopped' : 'observation.vr06.presentation.ready',
    availabilityState: state,
    recoveryClass: recoverable ? 'SAFE_REENTRY_AVAILABLE' : 'NONE_REQUIRED',
    reasonCode: recoverable ? 'EXACT_RUNTIME_STOPPED_SAFE_REENTRY' : 'EXACT_RUNTIME_READY',
    bindingState: 'BOUND',
    runtimeOwnershipState: 'EXACT_OWNED',
    runtimeState: recoverable ? 'STOPPED' : 'READY',
    qualificationState: recoverable ? 'STALE' : 'CURRENT',
    projectionRef: recoverable
      ? 'projection.vexlife.companion-availability.recoverable-vr06'
      : 'projection.vexlife.companion-availability.ready-vr06',
    projectionSha256: recoverable ? 'a'.repeat(64) : 'b'.repeat(64),
    sourceRefs: ['source.vr06.presentation.browser-proof'],
    effectAuthorityGranted: false,
    rendererAuthorityGranted: false,
    modelIdentityAuthorityGranted: false,
    processAuthorityGranted: false,
    conversationAuthorityGranted: false
  };
}

async function withReferenceBrowser(run) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vr06-presentation-browser-home-'));
  fs.mkdirSync(path.join(home, 'config'), { recursive: true });
  fs.mkdirSync(path.join(home, 'devices'), { recursive: true });
  fs.writeFileSync(path.join(home, 'config', 'home.json'), JSON.stringify({
    schemaVersion: 'vexlife.home/v0',
    homeRef: 'home.vr06.presentation',
    currentDeviceRef: 'device.vr06.presentation',
    currentCompanionLineageRef: 'lineage.vr06.presentation'
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(home, 'devices', 'device.vr06.presentation.json'), JSON.stringify({
    deviceRef: 'device.vr06.presentation',
    companionLineageRef: 'lineage.vr06.presentation'
  }, null, 2) + '\n');

  const server = spawn(process.execPath, ['scripts/serve-browser.mjs'], {
    cwd: ROOT,
    env: { ...process.env, VEXLIFE_PORT: '0', VEXLIFE_HOME: home },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.setEncoding('utf8');
  server.stderr.setEncoding('utf8');
  let browser;
  try {
    let serverError = '';
    server.stderr.on('data', (chunk) => { serverError += chunk; });
    const serverUrl = await Promise.race([
      new Promise((resolve, reject) => {
        server.stdout.on('data', (chunk) => {
          const match = chunk.match(/http:\/\/127\.0\.0\.1:\d+/u);
          if (match) resolve(match[0]);
        });
        server.once('error', reject);
        server.once('exit', (code) => reject(new Error('browser server exited ' + code + ': ' + serverError)));
      }),
      delay(10000, undefined, { ref: false }).then(() => { throw new Error('browser server readiness timed out'); })
    ]);
    browser = await chromium.launch({ headless: true });
    await run({ browser, serverUrl });
  } finally {
    if (browser) await browser.close();
    if (!server.killed) server.kill('SIGTERM');
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test('VR06 Reference composer exposes truthful recoverable action on desktop and compact without sending a turn', async () => {
  await withReferenceBrowser(async ({ browser, serverUrl }) => {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const consoleErrors = [];
      const pageErrors = [];
      let availabilityState = 'RECOVERABLE';
      let recoveryPosts = 0;
      let turnCalls = 0;
      let postedBinding = null;

      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('pageerror', (error) => pageErrors.push(error.message));

      await page.route('**/api/v1/companion/availability', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(browserAvailability(availabilityState))
        });
      });
      await page.route('**/api/v1/companion/recovery-action', async (route) => {
        const request = route.request();
        if (request.method() === 'GET') {
          const visible = browserAvailability(availabilityState);
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(action({ availabilityProjectionRef: visible.projectionRef }))
          });
          return;
        }
        if (request.method() === 'POST') {
          recoveryPosts += 1;
          postedBinding = request.postDataJSON();
          const visible = browserAvailability(availabilityState);
          assert.deepEqual(postedBinding, action({ availabilityProjectionRef: visible.projectionRef }));
          availabilityState = 'READY';
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ state: 'RECOVERY_ACCEPTED', requestRef: 'request.server-owned.vr06.presentation' })
          });
          return;
        }
        await route.fulfill({ status: 405, body: '' });
      });
      await page.route('**/api/v1/companion/turn', async (route) => {
        turnCalls += 1;
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'TURN_MUST_NOT_RUN_DURING_RECOVERY' }) });
      });

      await page.goto(serverUrl + '/reference/browser/', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__), null, { timeout: 30000 });
      await page.evaluate(async () => {
        const app = globalThis.__VEXLIFE_APP__;
        app.openContext('chat');
        await app.chat.refreshCompanionAvailability();
      });
      await page.locator('#messageInput').waitFor({ state: 'visible', timeout: 5000 });

      const draft = 'Keep this exact unsent draft through recovery';
      await page.locator('#messageInput').fill(draft);
      await page.locator('#messageInput').dispatchEvent('input');

      const recoverButton = page.locator('#companionRecoveryButton');
      await assert.doesNotReject(async () => recoverButton.waitFor({ state: 'visible', timeout: 5000 }));
      assert.match(await page.locator('#composerHint').textContent(), /Same-binding recovery is available/u);
      assert.equal(await recoverButton.isEnabled(), true);
      await recoverButton.focus();
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'companionRecoveryButton');

      const before = await page.evaluate(() => ({
        draft: globalThis.__VEXLIFE_APP__.state.unsentLocalDraft,
        state: globalThis.__VEXLIFE_APP__.chat.companionAvailabilityState(),
        recoverable: globalThis.__VEXLIFE_APP__.chat.companionRecoveryAvailable()
      }));
      assert.equal(before.state, 'RECOVERABLE');
      assert.equal(before.recoverable, true);
      assert.equal(before.draft?.content, draft);

      await page.keyboard.press('Enter');
      await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.chat.companionAvailabilityState() === 'READY', null, { timeout: 5000 });

      const after = await page.evaluate(() => ({
        draft: globalThis.__VEXLIFE_APP__.state.unsentLocalDraft,
        input: document.querySelector('#messageInput')?.value,
        state: globalThis.__VEXLIFE_APP__.chat.companionAvailabilityState(),
        recoveryVisible: !document.querySelector('#companionRecoveryButton')?.hidden,
        sendDisabled: document.querySelector('#composer button[type="submit"]')?.disabled
      }));
      assert.equal(after.state, 'READY');
      assert.equal(after.draft?.content, draft);
      assert.equal(after.input, draft);
      assert.equal(after.recoveryVisible, false);
      assert.equal(after.sendDisabled, false);
      assert.equal(recoveryPosts, 1);
      assert.equal(turnCalls, 0);
      assert.deepEqual(Object.keys(postedBinding).sort(), [
        'actionRef',
        'availabilityProjectionRef',
        'effectAuthorityGranted',
        'schemaVersion',
        'truthClass'
      ]);
      assert.deepEqual(consoleErrors, []);
      assert.deepEqual(pageErrors, []);
      await page.close();
    }
  });
});
