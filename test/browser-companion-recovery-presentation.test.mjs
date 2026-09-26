import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { createBrowserCompanionBridge } from '../src/core/browser-companion-bridge.mjs';
import { createVexLifeBrowserServer } from '../scripts/serve-browser.mjs';

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

function ownerReceipt(input, overrides = {}) {
  return {
    schemaVersion: 'vexlife.companion-recovery-owner-receipt/v1',
    truthClass: 'FOREIGN_RIGHTFUL_RUNTIME_OWNER_RECEIPT',
    requestRef: input.requestRef,
    reentryPlanRef: input.reentryPlanRef,
    bindingRef: input.bindingRef,
    homeRef: input.homeRef,
    companionLineageRef: input.companionLineageRef,
    modelRefOrNull: input.modelRefOrNull,
    generationRefOrNull: input.generationRefOrNull,
    runtimeAdapterRef: input.runtimeAdapterRef,
    effectOwnerRef: 'owner.runtime.vr06.presentation-proof',
    effectReceiptRef: 'receipt.runtime.vr06.presentation-proof',
    sourceRefs: ['source.runtime.vr06.presentation-proof'],
    disposition: 'PERFORMED_SAME_BINDING_REENTRY',
    postRecoveryObservationRequired: true,
    proofClass: 'REAL_HOST',
    ...overrides
  };
}

function binding(overrides = {}) {
  return {
    schemaVersion: 'vexlife.companion-binding-input/v1',
    truthClass: 'FOREIGN_CANONICAL_COMPANION_BINDING',
    bindingRef: 'binding.vr06.presentation',
    homeRef: 'home.vr06.presentation',
    companionLineageRef: 'lineage.vr06.presentation',
    modelRefOrNull: 'model.vr06.presentation',
    generationRefOrNull: 'generation.vr06.presentation',
    bindingState: 'BOUND',
    currentness: 'CURRENT',
    sourceRefs: ['source.binding.vr06.presentation'],
    ...overrides
  };
}

function runtimeObservation(overrides = {}) {
  return {
    schemaVersion: 'vexlife.companion-runtime-adapter-observation/v1',
    truthClass: 'FOREIGN_PLATFORM_RUNTIME_OBSERVATION',
    observationRef: 'observation.vr06.presentation.stopped',
    adapterRef: 'adapter.runtime.vr06.presentation',
    bindingRef: 'binding.vr06.presentation',
    homeRef: 'home.vr06.presentation',
    runtimeOwnershipState: 'NO_OWNED_RUNTIME',
    runtimeState: 'STOPPED',
    qualificationState: 'STALE',
    safeReentryState: 'AVAILABLE',
    currentness: 'CURRENT',
    evidenceRefs: ['evidence.runtime.vr06.presentation'],
    ...overrides
  };
}

async function withReferenceBrowser(viewport, run) {
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

  let observation = runtimeObservation();
  const recoveryRequests = [];
  const companionBridge = createBrowserCompanionBridge({
    endpoint: null,
    model: null,
    recoveryOwner: {
      recover: async (input) => {
        recoveryRequests.push(structuredClone(input));
        observation = runtimeObservation({
          observationRef: 'observation.vr06.presentation.ready',
          runtimeOwnershipState: 'EXACT_OWNED',
          runtimeState: 'HEALTHY',
          qualificationState: 'CURRENT',
          safeReentryState: 'NOT_AVAILABLE',
          evidenceRefs: ['evidence.runtime.vr06.presentation.ready']
        });
        return ownerReceipt(input);
      }
    }
  });

  const server = createVexLifeBrowserServer({
    companionBridge,
    resolveCompanionBinding: async () => binding(),
    resolveCompanionRuntimeObservation: async () => observation,
    relationshipsPersistenceHome: home,
    familyConversationHome: home,
    familyLifecycleHome: home,
    genericFollowThroughRuntimeHome: home
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  let browser;
  try {
    const address = server.address();
    const serverUrl = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport });
    await run({ page, serverUrl, recoveryRequests });
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(() => resolve()));
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test('VR06 Reference composer exposes truthful recoverable action on desktop and compact without sending a turn', async () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await withReferenceBrowser(viewport, async ({ page, serverUrl, recoveryRequests }) => {
      const consoleErrors = [];
      const pageErrors = [];
      let recoveryPosts = 0;
      let turnCalls = 0;
      let postedBinding = null;

      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.pathname === '/api/v1/companion/turn') turnCalls += 1;
        if (url.pathname === BROWSER_COMPANION_RECOVERY_ACTION_PATH && request.method() === 'POST') {
          recoveryPosts += 1;
          postedBinding = request.postDataJSON();
        }
      });

      await page.goto(serverUrl + '/reference/browser/', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__), null, { timeout: 30000 });
      const refreshed = await page.evaluate(async () => {
        const app = globalThis.__VEXLIFE_APP__;
        app.openContext('chat');
        await app.chat.refreshCompanionAvailability();
        return {
          state: app.chat.companionAvailabilityState(),
          recoverable: app.chat.companionRecoveryAvailable()
        };
      });
      assert.deepEqual(refreshed, { state: 'RECOVERABLE', recoverable: true });
      await page.locator('#messageInput').waitFor({ state: 'visible', timeout: 5000 });

      const draft = 'Keep this exact unsent draft through recovery';
      await page.locator('#messageInput').fill(draft);
      await page.locator('#messageInput').dispatchEvent('input');

      const recoverButton = page.locator('#companionRecoveryButton');
      await recoverButton.waitFor({ state: 'visible', timeout: 5000 });
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
      assert.equal(recoveryRequests.length, 1);
      assert.equal(turnCalls, 0);
      assert.deepEqual(Object.keys(postedBinding).sort(), [
        'actionRef',
        'availabilityProjectionRef',
        'effectAuthorityGranted',
        'schemaVersion',
        'truthClass'
      ]);
      assert.equal(recoveryRequests[0].actionRef, postedBinding.actionRef);
      assert.equal(recoveryRequests[0].availabilityProjectionRef, postedBinding.availabilityProjectionRef);
      assert.equal(recoveryRequests[0].effectAuthorityGranted, false);
      assert.match(recoveryRequests[0].requestSha256, /^[0-9a-f]{64}$/u);
      assert.deepEqual(consoleErrors, []);
      assert.deepEqual(pageErrors, []);
    });
  }
});
