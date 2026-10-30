import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import {
  BROWSER_INTERFACE_SOURCE_CURRENTNESS_PATH,
  bindInterfaceCurrentnessLifecycle,
  createInterfaceCurrentnessController,
  deriveInterfaceCurrentness,
  INTERFACE_CURRENTNESS_INPUT_REFS,
  normalizeBrowserInterfaceSourceCurrentness
} from '../reference/browser/modules/interface-currentness.js';
import {
  browserSessionDraftKey,
  readBrowserSessionDraft,
  writeBrowserSessionDraft
} from '../reference/browser/modules/chat-controller.js';
import {
  browserInterfaceSourceCurrentnessProjection,
  createVexLifeBrowserServer,
  injectBrowserDocumentSourceIdentity
} from '../scripts/serve-browser-core.mjs';

const SOURCE_A = 'a'.repeat(64);
const SOURCE_B = 'b'.repeat(64);
const SCOPE_A = Object.freeze({
  projectRef: 'project.self-development',
  threadRef: 'thread.self-development.open-conversation',
  channelRef: 'channel.self-development.companion'
});
const SCOPE_B = Object.freeze({
  projectRef: 'project.vexlife.root-hub',
  threadRef: 'thread.root-hub.welcome',
  channelRef: 'channel.root-hub.companion'
});

function coherent({
  loaded = SOURCE_A,
  server = SOURCE_A,
  browserState = 'CURRENT',
  scope = SCOPE_A,
  availabilityState = 'READY',
  conversationCurrentness = 'CURRENT',
  conversationScope = scope
} = {}) {
  const value = {
    [INTERFACE_CURRENTNESS_INPUT_REFS.loadedDocumentSource]: { valueOrNull: { state: 'CURRENT', treeSha256: loaded } },
    [INTERFACE_CURRENTNESS_INPUT_REFS.currentServerSource]: { valueOrNull: { state: 'CURRENT', treeSha256: server } },
    [INTERFACE_CURRENTNESS_INPUT_REFS.companionAvailability]: { valueOrNull: { availabilityState } },
    [INTERFACE_CURRENTNESS_INPUT_REFS.conversationCurrentness]: {
      valueOrNull: { ...conversationScope, currentness: conversationCurrentness }
    },
    [INTERFACE_CURRENTNESS_INPUT_REFS.browserObservationCurrentness]: {
      valueOrNull: { state: browserState, generation: 7, scope }
    }
  };
  return value;
}

function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    snapshot() { return new Map(map); }
  };
}

test('Interface currentness preserves accepted precedence and never turns relationship output into an effect command', () => {
  const ready = deriveInterfaceCurrentness(coherent());
  assert.equal(ready.kind, 'READY');
  assert.equal(ready.effectCommand, false);
  assert.equal(ready.effectsPerformed, false);
  assert.deepEqual(ready.scope, SCOPE_A);

  const mismatch = deriveInterfaceCurrentness(coherent({
    server: SOURCE_B,
    availabilityState: 'RECOVERABLE'
  }));
  assert.equal(mismatch.kind, 'SOURCE_MISMATCH');

  const observing = deriveInterfaceCurrentness(coherent({ browserState: 'OBSERVING' }));
  assert.equal(observing.kind, 'OBSERVING');

  const recoverable = deriveInterfaceCurrentness(coherent({ availabilityState: 'RECOVERABLE' }));
  assert.equal(recoverable.kind, 'RECOVERABLE');

  const actionRequired = deriveInterfaceCurrentness(coherent({ availabilityState: 'ACTION_REQUIRED' }));
  assert.equal(actionRequired.kind, 'ACTION_REQUIRED');

  const wrongConversation = deriveInterfaceCurrentness(coherent({ conversationScope: SCOPE_B }));
  assert.equal(wrongConversation.kind, 'UNAVAILABLE');
});

test('Interface currentness rejects a late async generation before it can overwrite the newer retained Compound truth', async () => {
  let scope = SCOPE_A;
  const servers = [deferred(), deferred()];
  let serverIndex = 0;
  const admitted = [];
  const controller = createInterfaceCurrentnessController({
    loadedDocumentSourceTreeSha256: SOURCE_A,
    currentScope: () => scope,
    readCurrentServerSource: () => servers[serverIndex++].promise,
    readCompanionAvailability: async (candidateScope) => ({ availabilityState: 'READY', scope: candidateScope }),
    readConversationCurrentness: async (candidateScope) => ({ ...candidateScope, currentness: 'CURRENT' }),
    onAdmittedObservation: async (value) => { admitted.push(structuredClone(value)); }
  });

  const older = controller.observe('first');
  scope = SCOPE_B;
  const newer = controller.observe('scope-change');
  servers[1].resolve({ treeSha256: SOURCE_A });
  const newerResult = await newer;
  assert.equal(newerResult.state, 'OBSERVATION_ADMITTED');
  assert.equal(newerResult.projection.relationship.kind, 'READY');
  assert.deepEqual(newerResult.projection.relationship.scope, SCOPE_B);

  servers[0].resolve({ treeSha256: SOURCE_A });
  const olderResult = await older;
  assert.equal(olderResult.state, 'STALE_OBSERVATION_REJECTED');
  assert.equal(admitted.length, 1);
  assert.deepEqual(admitted[0].scope, SCOPE_B);
  assert.deepEqual(controller.snapshot().relationship.scope, SCOPE_B);
  assert.equal(controller.snapshot().relationship.kind, 'READY');
});

test('Browser Interface source identity has one no-effect server projection and is bound into the document before module execution', () => {
  const projection = browserInterfaceSourceCurrentnessProjection(SOURCE_A);
  assert.deepEqual(normalizeBrowserInterfaceSourceCurrentness(projection), projection);
  assert.equal(BROWSER_INTERFACE_SOURCE_CURRENTNESS_PATH, '/api/v1/interface/source-currentness');

  const html = '<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module" src="./app.js"></script></body></html>';
  const injected = injectBrowserDocumentSourceIdentity(html, SOURCE_A);
  assert.match(injected, new RegExp(`<meta name="vexlife-source-tree-sha256" content="${SOURCE_A}">`, 'u'));
  assert.ok(injected.indexOf('vexlife-source-tree-sha256') < injected.indexOf('src="./app.js"'));
  assert.throws(() => injectBrowserDocumentSourceIdentity(injected, SOURCE_A), /already carries a source identity/u);
});

test('Interface lifecycle binding treats focus/pageshow/visible as observation triggers, not Controls', async () => {
  const windowRef = new EventTarget();
  const documentRef = new EventTarget();
  documentRef.visibilityState = 'visible';
  const reasons = [];
  const dispose = bindInterfaceCurrentnessLifecycle({
    observe(reason) { reasons.push(reason); return Promise.resolve(); }
  }, { windowRef, documentRef });
  windowRef.dispatchEvent(new Event('focus'));
  windowRef.dispatchEvent(new Event('pageshow'));
  documentRef.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve();
  assert.deepEqual(reasons, ['focus', 'pageshow', 'visibility-visible']);
  dispose();
  windowRef.dispatchEvent(new Event('focus'));
  assert.deepEqual(reasons, ['focus', 'pageshow', 'visibility-visible']);
});

test('Chat-owned session draft carriage is exact-scope, ephemeral and separate from Conversation/Memory', () => {
  const storage = memoryStorage();
  const key = browserSessionDraftKey(SCOPE_A);
  assert.match(key, /^vexlife\.browser-session-draft\.v1:/u);
  const written = writeBrowserSessionDraft(storage, SCOPE_A, 'Keep this exact draft', {
    now: () => '2026-10-30T03:45:00.000Z'
  });
  assert.equal(written.state, 'UNSENT_LOCAL_DRAFT');
  assert.equal(written.content, 'Keep this exact draft');
  assert.deepEqual(readBrowserSessionDraft(storage, SCOPE_A), written);
  assert.equal(readBrowserSessionDraft(storage, SCOPE_B), null);
  assert.equal(writeBrowserSessionDraft(storage, SCOPE_A, ''), null);
  assert.equal(storage.getItem(key), null);
});


test('directory-form browser document route binds the exact serving source identity before app JavaScript', async (t) => {
  const server = createVexLifeBrowserServer({ servingSourceTreeSha256: SOURCE_A });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.equal(typeof address, 'object');
  const response = await fetch(`http://127.0.0.1:${address.port}/reference/browser/`);
  assert.equal(response.status, 200);
  const documentSource = await response.text();
  const meta = `<meta name="vexlife-source-tree-sha256" content="${SOURCE_A}">`;
  assert.match(documentSource, new RegExp(meta, 'u'));
  assert.ok(documentSource.indexOf(meta) < documentSource.indexOf('src="./app.js"'));
});

test('guarded Conversation projection rejects stale success and stale failure before retained Chat truth mutation', () => {
  const source = fs.readFileSync(new URL('../reference/browser/modules/chat-controller.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function refreshConversationProjection');
  const end = source.indexOf('function nextPresentationMessageSequence', start);
  assert.ok(start >= 0 && end > start);
  const projection = source.slice(start, end);
  assert.match(
    projection,
    /if\(typeof acceptIf!=='function'\|\|acceptIf\(\)!==true\)return Object\.freeze\(\{state:'STALE_PROJECTION_REJECTED',[\s\S]*const list=listForChannel\(channel\)/u
  );
  assert.match(
    projection,
    /catch \{[\s\S]*if\(typeof acceptIf!=='function'\|\|acceptIf\(\)!==true\)return Object\.freeze\(\{state:'STALE_PROJECTION_REJECTED',[\s\S]*rememberConversationCurrentness\(channel,\{state:'UNAVAILABLE'/u
  );
});

test('selected Conversation READY is scope-exact at the Send consumer and semantic-frame scope changes re-observe', () => {
  const chatSource = fs.readFileSync(new URL('../reference/browser/modules/chat-controller.js', import.meta.url), 'utf8');
  const gateStart = chatSource.indexOf('const interfaceCurrentnessSnapshot');
  const gateEnd = chatSource.indexOf('const draftScope', gateStart);
  assert.ok(gateStart >= 0 && gateEnd > gateStart);
  const gate = chatSource.slice(gateStart, gateEnd);
  assert.match(gate, /const interfaceCurrentnessMatchesChannel = \(channel = currentChannel\(\)\) => Boolean/u);
  assert.match(gate, /interfaceCurrentness\.kind === 'READY'/u);
  assert.match(gate, /interfaceCurrentness\.scope\?\.projectRef === channel\.projectRef/u);
  assert.match(gate, /interfaceCurrentness\.scope\?\.threadRef === channel\.threadRef/u);
  assert.match(gate, /interfaceCurrentness\.scope\?\.channelRef === channel\.channelRef/u);
  assert.match(gate, /interfaceCurrentnessMatchesChannel\(channel\) && !companionTurnPending/u);

  const appSource = fs.readFileSync(new URL('../reference/browser/app.js', import.meta.url), 'utf8');
  const currentnessBinding = appSource.indexOf('let interfaceCurrentness=null;');
  const navigationBinding = appSource.indexOf('navigation=createNavigationController({');
  assert.ok(currentnessBinding >= 0 && navigationBinding > currentnessBinding, 'Interface observation hook must exist before Navigation can restore a semantic frame');
  const navigationEnd = appSource.indexOf('navigation.seedCurrentJourney(initialTerrainRef);', navigationBinding);
  assert.ok(navigationEnd > navigationBinding);
  const navigationSource = appSource.slice(navigationBinding, navigationEnd);
  assert.match(navigationSource, /const nextInterfaceFrameScope=interfaceFrameScopeKey\(frame\)/u);
  assert.match(navigationSource, /nextInterfaceFrameScope!==interfaceFrameScope[\s\S]*requestInterfaceObservation\('semantic-frame-scope-change'\)/u);
});


const READY_DRAFT_SOURCE = 'e'.repeat(64);
const READY_DRAFT_AVAILABILITY = Object.freeze({
  schemaVersion: 'vexlife.companion-availability/v1',
  truthClass: 'SOURCE_BOUND_COMPANION_AVAILABILITY',
  availabilityState: 'READY',
  registryRef: 'registry.test.interface-currentness.ready-draft',
  bindingRef: 'binding.test.interface-currentness.ready-draft',
  homeRef: 'home.test.interface-currentness.ready-draft',
  companionLineageRef: 'lineage.test.interface-currentness.ready-draft',
  runtimeAdapterRef: 'adapter.test.interface-currentness.ready-draft',
  runtimeObservationRef: 'observation.test.interface-currentness.ready-draft',
  recoveryClass: 'NONE',
  reasonCode: 'TEST_READY',
  bindingState: 'CURRENT',
  runtimeOwnershipState: 'CURRENT',
  runtimeState: 'READY',
  qualificationState: 'CURRENT',
  projectionRef: 'projection.test.interface-currentness.ready-draft',
  projectionSha256: 'e'.repeat(64),
  modelRefOrNull: 'model.test.interface-currentness.ready-draft',
  generationRefOrNull: 'generation.test.interface-currentness.ready-draft',
  sourceRefs: ['source.test.interface-currentness.ready-draft'],
  effectAuthorityGranted: false,
  rendererAuthorityGranted: false,
  modelIdentityAuthorityGranted: false,
  processAuthorityGranted: false,
  conversationAuthorityGranted: false
});
function readyDraftConversationCurrentness(scope) {
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
function readyDraftConversationProjection(scope) {
  return Object.freeze({
    schemaVersion: 'vexlife.browser-companion-conversation-projection/v1',
    state: 'EMPTY',
    truthClass: 'CURRENT_LOCAL_CONVERSATION_PROJECTION',
    projectRef: scope.projectRef,
    threadRef: scope.threadRef,
    channelRef: scope.channelRef,
    headMessageRefOrNull: null,
    headSequenceOrNull: null,
    canonicalConversationHeadSha256: null,
    headUpdatedAtOrNull: null,
    messages: Object.freeze([]),
    truncated: false,
    effectsPerformed: false
  });
}
function createReadyDraftServer() {
  return createVexLifeBrowserServer({
    servingSourceTreeSha256: READY_DRAFT_SOURCE,
    companionBridge: Object.freeze({
      conversationCurrentness: readyDraftConversationCurrentness,
      conversationProjection: readyDraftConversationProjection
    }),
    resolveCompanionBinding: async () => Object.freeze({}),
    resolveCompanionRuntimeObservation: async () => Object.freeze({}),
    companionAvailabilityCompiler: () => READY_DRAFT_AVAILABILITY
  });
}
async function readyDraftBrowserSnapshot(page, storageKey = null) {
  return page.evaluate((key) => ({
    appBound: Boolean(globalThis.__VEXLIFE_APP__),
    contextProjection: globalThis.__VEXLIFE_APP__?.state?.contextProjection ?? null,
    selectedNodeRef: globalThis.__VEXLIFE_APP__?.state?.selectedNodeRef ?? null,
    currentChannelRef: globalThis.__VEXLIFE_APP__?.chat?.currentChannel?.()?.channelRef ?? null,
    interfaceCurrentness: globalThis.__VEXLIFE_APP__?.chat?.interfaceCurrentness?.() ?? null,
    composerVisibility: (() => {
      const element = document.querySelector('#messageInput');
      if (!element) return 'ABSENT';
      const style = getComputedStyle(element);
      return element.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none'
        ? 'VISIBLE'
        : 'HIDDEN';
    })(),
    composerValue: document.querySelector('#messageInput')?.value ?? null,
    composerAvailability: document.querySelector('#composer')?.dataset?.availabilityState ?? null,
    companionAvailability: document.querySelector('#composer')?.dataset?.companionAvailabilityState ?? null,
    semanticFrame: history.state?.semanticFrame ?? null,
    sessionDraftRaw: key ? sessionStorage.getItem(key) : null
  }), storageKey).catch(() => ({ evaluationFailed: true }));
}
async function waitForReadyDraftInterface(page, stage, storageKey = null) {
  try {
    await page.waitForFunction(
      () => globalThis.__VEXLIFE_APP__?.chat?.interfaceCurrentness?.().kind === 'READY',
      null,
      { timeout: 10_000 }
    );
  } catch (error) {
    const snapshot = await readyDraftBrowserSnapshot(page, storageKey);
    throw new Error('READY_DRAFT_' + stage + '_READY_TIMEOUT:' + JSON.stringify(snapshot) + ':' + error.message);
  }
}
async function waitForReadyDraftVisibleChat(page, stage, storageKey = null) {
  try {
    await page.waitForFunction(
      () => globalThis.__VEXLIFE_APP__?.state?.contextProjection === 'chat',
      null,
      { timeout: 5_000 }
    );
    await page.locator('#messageInput').waitFor({ state: 'visible', timeout: 5_000 });
  } catch (error) {
    const snapshot = await readyDraftBrowserSnapshot(page, storageKey);
    throw new Error('READY_DRAFT_' + stage + '_VISIBLE_CHAT_TIMEOUT:' + JSON.stringify(snapshot) + ':' + error.message);
  }
}
async function waitForReadyDraftStorage(page, key, draft, stage) {
  try {
    await page.waitForFunction(({ key, draft }) => {
      const raw = sessionStorage.getItem(key);
      if (raw === null) return false;
      try {
        const value = JSON.parse(raw);
        return value?.schemaVersion === 'vexlife.browser-session-draft/v1'
          && value?.state === 'UNSENT_LOCAL_DRAFT'
          && value?.content === draft
          && value?.queued === false
          && value?.accepted === false;
      } catch {
        return false;
      }
    }, { key, draft }, { timeout: 5_000 });
  } catch (error) {
    const snapshot = await readyDraftBrowserSnapshot(page, key);
    throw new Error('READY_DRAFT_' + stage + '_STORAGE_TIMEOUT:' + JSON.stringify(snapshot) + ':' + error.message);
  }
}
async function waitForReadyDraftRestoredValue(page, key, draft) {
  try {
    await page.waitForFunction(
      (expectedDraft) => document.querySelector('#messageInput')?.value === expectedDraft,
      draft,
      { timeout: 5_000 }
    );
  } catch (error) {
    const snapshot = await readyDraftBrowserSnapshot(page, key);
    throw new Error('READY_DRAFT_RELOAD_VALUE_TIMEOUT:' + JSON.stringify(snapshot) + ':' + error.message);
  }
}

test('real composer input handler persists a new direct-Companion draft even while READY', () => {
  const source = fs.readFileSync(new URL('../reference/browser/modules/chat-controller.js', import.meta.url), 'utf8');
  const start = source.indexOf("$('#messageInput').addEventListener('input'");
  const end = source.indexOf('const announceShortcutButton', start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);
  assert.match(
    handler,
    /channel\.roleKey === 'companion' \|\| !channelIsAvailable\(channel\) \|\| existing[\s\S]*setLocalDraft\(channel, event\.target\.value\)/u
  );
});

test('READY direct Companion persists a fresh exact-scope unsent draft across visible Chat document reload', { timeout: 45_000 }, async () => {
  const server = createReadyDraftServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  let browser = null;
  try {
    const address = server.address();
    assert.equal(typeof address, 'object');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const pageUrl = 'http://127.0.0.1:' + address.port + '/reference/browser/?open=vex';
    const draft = 'Preserve this fresh READY draft across source reload';
    const key = browserSessionDraftKey(SCOPE_A);

    await page.goto(pageUrl, { waitUntil: 'load', timeout: 10_000 });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__), null, { timeout: 10_000 });
    await waitForReadyDraftInterface(page, 'INITIAL', key);

    await page.evaluate(() => globalThis.__VEXLIFE_APP__.openContext('chat'));
    await waitForReadyDraftVisibleChat(page, 'INITIAL', key);
    const frameBefore = await page.evaluate(() => history.state?.semanticFrame ?? null);
    assert.equal(frameBefore?.contextProjection, 'chat');

    await page.locator('#messageInput').fill(draft);
    await waitForReadyDraftStorage(page, key, draft, 'INITIAL');

    const storedBeforeReload = JSON.parse(await page.evaluate((storageKey) => sessionStorage.getItem(storageKey), key));
    assert.equal(storedBeforeReload.content, draft);
    assert.equal(storedBeforeReload.projectRef, SCOPE_A.projectRef);
    assert.equal(storedBeforeReload.threadRef, SCOPE_A.threadRef);
    assert.equal(storedBeforeReload.channelRef, SCOPE_A.channelRef);
    assert.equal(storedBeforeReload.queued, false);
    assert.equal(storedBeforeReload.accepted, false);

    await page.reload({ waitUntil: 'load', timeout: 10_000 });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__), null, { timeout: 10_000 });
    await waitForReadyDraftInterface(page, 'RELOAD', key);
    await waitForReadyDraftVisibleChat(page, 'RELOAD', key);
    const frameAfter = await page.evaluate(() => history.state?.semanticFrame ?? null);
    assert.equal(frameAfter?.contextProjection, 'chat');
    await waitForReadyDraftRestoredValue(page, key, draft);
    assert.equal(await page.locator('#messageInput').inputValue(), draft);
    await waitForReadyDraftStorage(page, key, draft, 'RELOAD');

    const rawRestored = await page.evaluate((storageKey) => sessionStorage.getItem(storageKey), key);
    assert.notEqual(rawRestored, null);
    const restored = JSON.parse(rawRestored);
    assert.equal(restored.content, draft);
    assert.equal(restored.projectRef, SCOPE_A.projectRef);
    assert.equal(restored.threadRef, SCOPE_A.threadRef);
    assert.equal(restored.channelRef, SCOPE_A.channelRef);
    assert.equal(restored.queued, false);
    assert.equal(restored.accepted, false);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(() => resolve()));
  }
});



function f3Availability(state, tag) {
  if (!['RECOVERABLE', 'READY'].includes(state)) throw new Error('Unsupported F3 availability state ' + state);
  const ready = state === 'READY';
  return Object.freeze({
    ...READY_DRAFT_AVAILABILITY,
    availabilityState: state,
    recoveryClass: ready ? 'NONE' : 'SAFE_REENTRY_AVAILABLE',
    reasonCode: 'F3_' + state,
    runtimeState: ready ? 'READY' : 'RECOVERABLE',
    projectionRef: 'projection.test.interface-currentness.f3.' + tag + '.' + state.toLowerCase(),
    projectionSha256: (ready ? 'c' : 'b').repeat(64),
    runtimeObservationRef: 'observation.test.interface-currentness.f3.' + tag + '.' + state.toLowerCase(),
    sourceRefs: ['source.test.interface-currentness.f3.' + tag]
  });
}

function createF3Server({ sourceTreeSha256, availabilityState = 'READY' }) {
  let currentAvailability = f3Availability(availabilityState, sourceTreeSha256.slice(0, 8));
  const server = createVexLifeBrowserServer({
    servingSourceTreeSha256: sourceTreeSha256,
    companionBridge: Object.freeze({
      conversationCurrentness: readyDraftConversationCurrentness,
      conversationProjection: readyDraftConversationProjection
    }),
    resolveCompanionBinding: async () => Object.freeze({}),
    resolveCompanionRuntimeObservation: async () => Object.freeze({}),
    companionAvailabilityCompiler: () => currentAvailability
  });
  return Object.freeze({
    server,
    setAvailability(state) {
      currentAvailability = f3Availability(state, sourceTreeSha256.slice(0, 8));
      return currentAvailability;
    }
  });
}

async function listenF3Server(server, port = 0) {
  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', onError);
      resolve();
    });
  });
  const address = server.address();
  assert.equal(typeof address, 'object');
  return address.port;
}

async function closeF3Server(server) {
  if (!server?.listening) return;
  server.closeIdleConnections?.();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('F3A same visible document re-observes external RECOVERABLE to READY without performing recovery or turn effects', { timeout: 45_000 }, async () => {
  const fixture = createF3Server({ sourceTreeSha256: SOURCE_A, availabilityState: 'RECOVERABLE' });
  const port = await listenF3Server(fixture.server);
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    let recoveryPosts = 0;
    let turnPosts = 0;
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (request.method() === 'POST' && url.pathname === '/api/v1/companion/recovery-action') recoveryPosts += 1;
      if (request.method() === 'POST' && url.pathname === '/api/v1/companion/turn/stream') turnPosts += 1;
    });
    const pageUrl = 'http://127.0.0.1:' + port + '/reference/browser/?open=vex';
    const draft = 'Keep F3A draft through external recovery observation';
    const key = browserSessionDraftKey(SCOPE_A);

    await page.goto(pageUrl, { waitUntil: 'load', timeout: 10_000 });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__), null, { timeout: 10_000 });
    await page.evaluate(() => globalThis.__VEXLIFE_APP__.openContext('chat'));
    await waitForReadyDraftVisibleChat(page, 'F3A_INITIAL', key);
    await page.waitForFunction(
      () => globalThis.__VEXLIFE_APP__?.chat?.interfaceCurrentness?.().kind === 'RECOVERABLE',
      null,
      { timeout: 10_000 }
    );
    await page.locator('#messageInput').fill(draft);
    await waitForReadyDraftStorage(page, key, draft, 'F3A_INITIAL');
    const beforeUrl = page.url();
    await page.evaluate(() => { document.documentElement.dataset.f3DocumentToken = 'same-document-f3a'; });

    fixture.setAvailability('READY');
    await page.evaluate(() => globalThis.dispatchEvent(new Event('focus')));
    await page.waitForFunction(
      () => globalThis.__VEXLIFE_APP__?.chat?.interfaceCurrentness?.().kind === 'READY',
      null,
      { timeout: 10_000 }
    );

    const after = await page.evaluate((storageKey) => ({
      relationship: globalThis.__VEXLIFE_APP__.chat.interfaceCurrentness(),
      documentToken: document.documentElement.dataset.f3DocumentToken ?? null,
      input: document.querySelector('#messageInput')?.value ?? null,
      sendDisabled: document.querySelector('#composer button[type="submit"]')?.disabled ?? null,
      sessionDraftRaw: sessionStorage.getItem(storageKey)
    }), key);
    assert.equal(page.url(), beforeUrl);
    assert.equal(after.relationship.kind, 'READY');
    assert.equal(after.documentToken, 'same-document-f3a');
    assert.equal(after.input, draft);
    assert.equal(after.sendDisabled, false);
    assert.equal(JSON.parse(after.sessionDraftRaw).content, draft);
    assert.equal(recoveryPosts, 0);
    assert.equal(turnPosts, 0);
  } finally {
    if (browser) await browser.close();
    await closeF3Server(fixture.server);
  }
});

test('F3A newer READY observation rejects an older delayed RECOVERABLE completion on the same scope', async () => {
  const delayed = deferred();
  let availabilityRead = 0;
  const controller = createInterfaceCurrentnessController({
    loadedDocumentSourceTreeSha256: SOURCE_A,
    currentScope: () => SCOPE_A,
    readCurrentServerSource: async () => ({ treeSha256: SOURCE_A }),
    readCompanionAvailability: async () => availabilityRead++ === 0
      ? delayed.promise
      : f3Availability('READY', 'newer'),
    readConversationCurrentness: async (scope) => ({ ...scope, currentness: 'CURRENT' })
  });

  const older = controller.observe('focus-external-recovery-old');
  const newer = controller.observe('pageshow-external-recovery-new');
  const newerResult = await newer;
  assert.equal(newerResult.state, 'OBSERVATION_ADMITTED');
  assert.equal(newerResult.projection.relationship.kind, 'READY');

  delayed.resolve(f3Availability('RECOVERABLE', 'older'));
  const olderResult = await older;
  assert.equal(olderResult.state, 'STALE_OBSERVATION_REJECTED');
  assert.equal(controller.snapshot().relationship.kind, 'READY');
  assert.deepEqual(controller.snapshot().relationship.scope, SCOPE_A);
});

test('F3B loaded source A observes server source B, records SOURCE_MISMATCH, replaces the document and restores the exact draft at READY', { timeout: 60_000 }, async () => {
  let fixtureA = createF3Server({ sourceTreeSha256: SOURCE_A, availabilityState: 'READY' });
  let fixtureB = null;
  const port = await listenF3Server(fixtureA.server);
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const pageUrl = 'http://127.0.0.1:' + port + '/reference/browser/?open=vex';
    const draft = 'Carry this exact F3B draft from source A to source B';
    const key = browserSessionDraftKey(SCOPE_A);
    const mismatchWitnessKey = 'vexlife.test.f3b.beforeunload.relationship';
    const draftWitnessKey = 'vexlife.test.f3b.beforeunload.draft';

    await page.goto(pageUrl, { waitUntil: 'load', timeout: 10_000 });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__), null, { timeout: 10_000 });
    await waitForReadyDraftInterface(page, 'F3B_SOURCE_A', key);
    await page.evaluate(() => globalThis.__VEXLIFE_APP__.openContext('chat'));
    await waitForReadyDraftVisibleChat(page, 'F3B_SOURCE_A', key);
    await page.locator('#messageInput').fill(draft);
    await waitForReadyDraftStorage(page, key, draft, 'F3B_SOURCE_A');
    await page.evaluate(({ mismatchWitnessKey, draftWitnessKey }) => {
      globalThis.addEventListener('beforeunload', () => {
        sessionStorage.setItem(
          mismatchWitnessKey,
          globalThis.__VEXLIFE_APP__?.chat?.interfaceCurrentness?.().kind ?? 'MISSING'
        );
        sessionStorage.setItem(
          draftWitnessKey,
          document.querySelector('#messageInput')?.value ?? ''
        );
      }, { once: true });
    }, { mismatchWitnessKey, draftWitnessKey });

    await closeF3Server(fixtureA.server);
    fixtureA = null;
    fixtureB = createF3Server({ sourceTreeSha256: SOURCE_B, availabilityState: 'READY' });
    await listenF3Server(fixtureB.server, port);

    await page.evaluate(() => globalThis.dispatchEvent(new Event('focus')));
    await page.waitForURL((url) => new URL(url).searchParams.get('source') === SOURCE_B, { timeout: 10_000 });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__), null, { timeout: 10_000 });
    await waitForReadyDraftInterface(page, 'F3B_SOURCE_B', key);
    await waitForReadyDraftVisibleChat(page, 'F3B_SOURCE_B', key);
    await waitForReadyDraftRestoredValue(page, key, draft);

    const after = await page.evaluate(({ key, mismatchWitnessKey, draftWitnessKey }) => ({
      relationship: globalThis.__VEXLIFE_APP__.chat.interfaceCurrentness(),
      contextProjection: globalThis.__VEXLIFE_APP__.state.contextProjection,
      loadedDocumentSource: document.querySelector('meta[name="vexlife-source-tree-sha256"]')?.content ?? null,
      input: document.querySelector('#messageInput')?.value ?? null,
      sessionDraftRaw: sessionStorage.getItem(key),
      mismatchWitness: sessionStorage.getItem(mismatchWitnessKey),
      draftWitness: sessionStorage.getItem(draftWitnessKey)
    }), { key, mismatchWitnessKey, draftWitnessKey });
    assert.equal(after.mismatchWitness, 'SOURCE_MISMATCH');
    assert.equal(after.draftWitness, draft);
    assert.equal(after.contextProjection, 'chat');
    assert.equal(after.loadedDocumentSource, SOURCE_B);
    assert.equal(after.relationship.loadedDocumentSourceTreeSha256, SOURCE_B);
    assert.equal(after.relationship.currentServerSourceTreeSha256, SOURCE_B);
    assert.equal(after.relationship.kind, 'READY');
    assert.equal(after.input, draft);
    assert.equal(JSON.parse(after.sessionDraftRaw).content, draft);
  } finally {
    if (browser) await browser.close();
    if (fixtureA) await closeF3Server(fixtureA.server);
    if (fixtureB) await closeF3Server(fixtureB.server);
  }
});

// [VXG RealForever]
