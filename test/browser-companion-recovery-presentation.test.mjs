import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { createBrowserCompanionBridge } from '../src/core/browser-companion-bridge.mjs';
import { initializeLivedCompanionHome } from '../src/core/lived-companion.mjs';
import { appendConversationMessage, materializeConversationChannel } from '../src/core/conversation-store.mjs';
import { semanticHash } from '../src/core/utils.mjs';
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

function seedCanonicalConversation(home) {
  const homeManifest = JSON.parse(fs.readFileSync(path.join(home, 'config', 'home.json'), 'utf8'));
  const device = JSON.parse(fs.readFileSync(path.join(home, 'devices', homeManifest.currentDeviceRef + '.json'), 'utf8'));
  const channelRef = 'channel.self-development.companion';
  const threadRef = 'thread.self-development.open-conversation';
  materializeConversationChannel({
    home,
    instanceRef: device.deviceRef,
    observedAt: device.createdAt,
    channel: {
      channelRef,
      threadRef,
      kind: 'DIRECT',
      memberRefs: [device.personRef, 'role.vex.companion'],
      labelStringRef: 'channel.companion.name',
      state: 'ACTIVE',
      createdAt: device.createdAt
    }
  });
  const at0=device.createdAt, at1=new Date(Date.parse(device.createdAt)+1000).toISOString();
  const append=(message)=>appendConversationMessage({home,instanceRef:device.deviceRef,observedAt:message.createdAt,message});
  append({messageRef:'message.vr06.presentation.human.000',spaceRef:null,threadRef,channelRef,speakerRef:device.personRef,recipientRefs:['role.vex.companion'],witnessRefs:['witness.vr06.presentation.human.000'],membershipSnapshotRef:null,membershipGeneration:null,sequence:0,content:'Durable Victor first-load message.',contentHash:semanticHash('Durable Victor first-load message.'),createdAt:at0});
  append({messageRef:'message.vr06.presentation.companion.001',spaceRef:null,threadRef,channelRef,speakerRef:'role.vex.companion',recipientRefs:[device.personRef],witnessRefs:['witness.vr06.presentation.companion.001'],membershipSnapshotRef:null,membershipGeneration:null,sequence:1,content:'Durable Vex first-load response.',contentHash:semanticHash('Durable Vex first-load response.'),createdAt:at1});
}

async function withReferenceBrowser(viewport, run, { initialObservation = runtimeObservation(), seedConversation = false, recoveryFailure = false } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vr06-presentation-browser-home-'));
  initializeLivedCompanionHome({
    home,
    homeRef: 'home.vr06.presentation',
    familyRef: 'vex-family.vr06.presentation',
    deviceRef: 'device.vr06.presentation',
    companionLineageRef: 'lineage.vr06.presentation'
  });
  if (seedConversation) seedCanonicalConversation(home);

  let observation = initialObservation;
  const recoveryRequests = [];
  const companionBridge = createBrowserCompanionBridge({
    home,
    endpoint: null,
    model: null,
    recoveryOwner: {
      recover: async (input) => {
        recoveryRequests.push(structuredClone(input));
        if (recoveryFailure) throw new Error('synthetic same-binding recovery failure');
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

test('Open Vex launch-intent page load projects canonical READY before Victor interacts with the composer', async () => {
  await withReferenceBrowser(
    { width: 1440, height: 900 },
    async ({ page, serverUrl }) => {
      let turnCalls = 0;
      page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/v1/companion/turn') turnCalls += 1;
      });

      await page.goto(serverUrl + '/reference/browser/?open=vex', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__), null, { timeout: 30000 });

      const initial = await page.evaluate(() => ({
        channelRef: globalThis.__VEXLIFE_APP__.chat.currentChannel().channelRef,
        contextProjection: globalThis.__VEXLIFE_APP__.state.contextProjection,
        chatHidden: document.querySelector('#view-chat')?.hidden ?? null,
        availabilityState: globalThis.__VEXLIFE_APP__.chat.companionAvailabilityState(),
        bindingState: globalThis.__VEXLIFE_APP__.chat.companionBindingState(),
        conversationCurrentness: globalThis.__VEXLIFE_APP__.chat.canonicalConversationIdentity().currentness,
        conversationHeadSequence: globalThis.__VEXLIFE_APP__.chat.canonicalConversationIdentity().headSequenceOrNull,
        composerAvailability: document.querySelector('#composer')?.dataset.availabilityState ?? null,
        composerCompanionAvailability: document.querySelector('#composer')?.dataset.companionAvailabilityState ?? null,
        sendDisabled: document.querySelector('#composer button[type="submit"]')?.disabled ?? null,
        hint: document.querySelector('#composerHint')?.textContent ?? null,
        messages: [...document.querySelectorAll('#messageFeed .message')].map((row) => ({
          messageRef: row.dataset.messageRef,
          text: row.querySelector('.message-body')?.textContent ?? '',
          index: row.querySelector('.message-index')?.textContent ?? ''
        }))
      }));

      assert.deepEqual({
        channelRef: initial.channelRef,
        contextProjection: initial.contextProjection,
        chatHidden: initial.chatHidden,
        availabilityState: initial.availabilityState,
        bindingState: initial.bindingState,
        conversationCurrentness: initial.conversationCurrentness,
        conversationHeadSequence: initial.conversationHeadSequence,
        composerAvailability: initial.composerAvailability,
        composerCompanionAvailability: initial.composerCompanionAvailability,
        sendDisabled: initial.sendDisabled,
        turnCalls
      }, {
        channelRef: 'channel.self-development.companion',
        contextProjection: 'chat',
        chatHidden: false,
        availabilityState: 'READY',
        bindingState: 'BOUND',
        conversationCurrentness: 'CURRENT',
        conversationHeadSequence: 1,
        composerAvailability: 'AVAILABLE',
        composerCompanionAvailability: 'READY',
        sendDisabled: false,
        turnCalls: 0
      });
      assert.deepEqual(initial.messages, [
        { messageRef: 'message.vr06.presentation.human.000', text: 'Durable Victor first-load message.', index: '[00]' },
        { messageRef: 'message.vr06.presentation.companion.001', text: 'Durable Vex first-load response.', index: '[01]' }
      ]);
      assert.doesNotMatch(initial.hint ?? '', /unavailable/u);
      assert.equal(initial.messages.some((message) => message.text.includes('engineering dashboard')), false);
    },
    {
      seedConversation: true,
      initialObservation: runtimeObservation({
        observationRef: 'observation.vr06.presentation.initial-ready',
        runtimeOwnershipState: 'EXACT_OWNED',
        runtimeState: 'HEALTHY',
        qualificationState: 'CURRENT',
        safeReentryState: 'NOT_AVAILABLE',
        evidenceRefs: ['evidence.runtime.vr06.presentation.initial-ready']
      })
    }
  );
});

test('Open Vex re-observes Interface currentness after canonical Conversation projection heals a first-read miss', async () => {
  await withReferenceBrowser(
    { width: 1440, height: 900 },
    async ({ page, serverUrl }) => {
      let currentnessReads = 0;
      await page.addInitScript(() => {
        const nativeAddEventListener = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function addEventListenerWithoutIncidentalInterfaceRefresh(type, listener, options) {
          const suppressWindowRefresh = this === window && (type === 'focus' || type === 'pageshow');
          const suppressVisibilityRefresh = this === document && type === 'visibilitychange';
          if (suppressWindowRefresh || suppressVisibilityRefresh) return;
          return nativeAddEventListener.call(this, type, listener, options);
        };
      });
      await page.route('**/api/v1/companion/conversation-currentness?*', async (route) => {
        currentnessReads += 1;
        if (currentnessReads === 1) {
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ state: 'UNAVAILABLE' })
          });
          return;
        }
        await route.continue();
      });

      await page.goto(serverUrl + '/reference/browser/?open=vex', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForFunction(
        () => globalThis.__VEXLIFE_APP__?.chat?.interfaceCurrentness?.().kind === 'READY',
        null,
        { timeout: 5000 }
      );

      const projected = await page.evaluate(() => ({
        interfaceCurrentness: globalThis.__VEXLIFE_APP__.chat.interfaceCurrentness().kind,
        conversationCurrentness: globalThis.__VEXLIFE_APP__.chat.canonicalConversationIdentity().currentness,
        messages: [...document.querySelectorAll('#messageFeed .message')].map((row) => row.querySelector('.message-body')?.textContent ?? ''),
        sendDisabled: document.querySelector('#composer button[type="submit"]')?.disabled ?? null
      }));

      assert.ok(currentnessReads >= 2);
      assert.equal(projected.interfaceCurrentness, 'READY');
      assert.equal(projected.conversationCurrentness, 'CURRENT');
      assert.deepEqual(projected.messages, [
        'Durable Victor first-load message.',
        'Durable Vex first-load response.'
      ]);
      assert.equal(projected.sendDisabled, false);
    },
    {
      seedConversation: true,
      initialObservation: runtimeObservation({
        observationRef: 'observation.vr06.presentation.initial-ready-after-currentness-miss',
        runtimeOwnershipState: 'EXACT_OWNED',
        runtimeState: 'HEALTHY',
        qualificationState: 'CURRENT',
        safeReentryState: 'NOT_AVAILABLE',
        evidenceRefs: ['evidence.runtime.vr06.presentation.initial-ready-after-currentness-miss']
      })
    }
  );
});

test('VR06 Reference composer automatically re-enters one exact recoverable binding on desktop and compact', async () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await withReferenceBrowser(viewport, async ({ page, serverUrl, recoveryRequests }) => {
      const consoleErrors = [], pageErrors = []; let recoveryPosts = 0, turnCalls = 0;
      page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('request', (request) => { const url = new URL(request.url()); if (url.pathname === '/api/v1/companion/turn') turnCalls += 1; if (url.pathname === BROWSER_COMPANION_RECOVERY_ACTION_PATH && request.method() === 'POST') recoveryPosts += 1; });
      await page.goto(serverUrl + '/reference/browser/?open=vex', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForFunction(() => globalThis.__VEXLIFE_APP__?.chat?.companionAvailabilityState?.() === 'READY', null, { timeout: 5000 });
      const projected = await page.evaluate(() => ({ channelRef: globalThis.__VEXLIFE_APP__.chat.currentChannel().channelRef, availabilityState: globalThis.__VEXLIFE_APP__.chat.companionAvailabilityState(), interfaceCurrentness: globalThis.__VEXLIFE_APP__.chat.interfaceCurrentness().kind, sendDisabled: document.querySelector('#composer button[type="submit"]')?.disabled ?? null, recoveryVisible: !document.querySelector('#companionRecoveryButton')?.hidden }));
      assert.deepEqual(projected, { channelRef: 'channel.self-development.companion', availabilityState: 'READY', interfaceCurrentness: 'READY', sendDisabled: false, recoveryVisible: false });
      assert.equal(recoveryPosts, 1); assert.equal(recoveryRequests.length, 1); assert.equal(turnCalls, 0); assert.deepEqual(consoleErrors, []); assert.deepEqual(pageErrors, []);
    });
  }
});

test('automatic same-binding recovery failure does not retry and leaves draft plus manual fallback intact', async () => {
  await withReferenceBrowser({ width: 1440, height: 900 }, async ({ page, serverUrl, recoveryRequests }) => {
    let recoveryPosts = 0, turnCalls = 0;
    const draft = 'Keep this exact unsent draft through failed automatic recovery';
    await page.addInitScript((content) => {
      const scope = {
        projectRef: 'project.self-development',
        threadRef: 'thread.self-development.open-conversation',
        channelRef: 'channel.self-development.companion',
      };
      const key = 'vexlife.browser-session-draft.v1:' + [scope.projectRef, scope.threadRef, scope.channelRef].map(encodeURIComponent).join(':');
      sessionStorage.setItem(key, JSON.stringify({
        schemaVersion: 'vexlife.browser-session-draft/v1',
        state: 'UNSENT_LOCAL_DRAFT',
        ...scope,
        content,
        updatedAt: '2026-10-30T00:00:00.000Z',
        queued: false,
        accepted: false,
      }));
    }, draft);
    page.on('request', (request) => { const url = new URL(request.url()); if (url.pathname === BROWSER_COMPANION_RECOVERY_ACTION_PATH && request.method() === 'POST') recoveryPosts += 1; if (url.pathname === '/api/v1/companion/turn') turnCalls += 1; });
    await page.goto(serverUrl + '/reference/browser/?open=vex', { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => globalThis.__VEXLIFE_APP__?.chat?.companionAvailabilityState?.() === 'RECOVERABLE', null, { timeout: 5000 });
    await page.waitForTimeout(100); assert.equal(recoveryPosts, 1); assert.equal(recoveryRequests.length, 1);
    const preservedBeforeManual = await page.evaluate(() => ({
      draft: globalThis.__VEXLIFE_APP__.state.unsentLocalDraft,
      input: document.querySelector('#messageInput')?.value,
    }));
    assert.equal(preservedBeforeManual.draft?.content, draft);
    assert.equal(preservedBeforeManual.input, draft);
    await page.waitForTimeout(100); assert.equal(recoveryPosts, 1);
    const recoverButton = page.locator('#companionRecoveryButton'); await recoverButton.waitFor({ state: 'visible', timeout: 5000 }); assert.equal(await recoverButton.isEnabled(), true);
    await recoverButton.click(); await page.waitForTimeout(100); assert.equal(recoveryPosts, 2); assert.equal(recoveryRequests.length, 2);
    const after = await page.evaluate(() => ({ draft: globalThis.__VEXLIFE_APP__.state.unsentLocalDraft, input: document.querySelector('#messageInput')?.value, availabilityState: globalThis.__VEXLIFE_APP__.chat.companionAvailabilityState(), recoveryVisible: !document.querySelector('#companionRecoveryButton')?.hidden, sendDisabled: document.querySelector('#composer button[type="submit"]')?.disabled ?? null }));
    assert.equal(after.draft?.content, draft); assert.equal(after.input, draft); assert.equal(after.availabilityState, 'RECOVERABLE'); assert.equal(after.recoveryVisible, true); assert.equal(after.sendDisabled, true); assert.equal(turnCalls, 0);
  }, { recoveryFailure: true });
});

test('automatic same-binding recovery does not run for ACTION_REQUIRED, UNAVAILABLE, or HELD', async () => {
  const cases = [
    runtimeObservation({ observationRef: 'observation.vr06.presentation.action-required', runtimeOwnershipState: 'EXACT_OWNED', runtimeState: 'DEGRADED', qualificationState: 'STALE', safeReentryState: 'HUMAN_DECISION_REQUIRED' }),
    runtimeObservation({ observationRef: 'observation.vr06.presentation.unavailable', runtimeOwnershipState: 'NO_OWNED_RUNTIME', runtimeState: 'STOPPED', qualificationState: 'STALE', safeReentryState: 'NOT_AVAILABLE' }),
    runtimeObservation({ observationRef: 'observation.vr06.presentation.held', runtimeOwnershipState: 'NO_OWNED_RUNTIME', runtimeState: 'STOPPED', qualificationState: 'STALE', safeReentryState: 'HELD' }),
  ];
  for (const initialObservation of cases) {
    await withReferenceBrowser({ width: 390, height: 844 }, async ({ page, serverUrl, recoveryRequests }) => {
      let recoveryPosts = 0;
      page.on('request', (request) => { if (new URL(request.url()).pathname === BROWSER_COMPANION_RECOVERY_ACTION_PATH && request.method() === 'POST') recoveryPosts += 1; });
      await page.goto(serverUrl + '/reference/browser/?open=vex', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__), null, { timeout: 5000 }); await page.waitForTimeout(100);
      assert.equal(recoveryPosts, 0); assert.equal(recoveryRequests.length, 0); assert.equal(await page.locator('#composer button[type="submit"]').isDisabled(), true);
    }, { initialObservation });
  }
});

// [VXG RealForever]
