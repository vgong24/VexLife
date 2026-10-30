import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

// [VXG RealForever]
