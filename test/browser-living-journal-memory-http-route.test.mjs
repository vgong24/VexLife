import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createLivingJournalController } from '../reference/browser/modules/living-journal-controller.js';
import { createVexLifeBrowserServer } from '../scripts/serve-browser.mjs';
import {
  BROWSER_LIVING_JOURNAL_MEMORY_API_PATH,
  BrowserLivingJournalMemoryBridgeError
} from '../src/core/browser-living-journal-memory-bridge.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function withServer(options, run) {
  const server = createVexLifeBrowserServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function fakeCompanion() {
  return {
    status: () => Object.freeze({ state: 'UNAVAILABLE' }),
    performTurn: async () => {
      throw new Error('companion turn must not run during Living Journal Memory route proof');
    }
  };
}

test('Living Journal Memory route resolves canonical Home identity server-side and passes only admitted browser input to the accepted read bridge seam', async () => {
  const identity = Object.freeze({
    home: '/canonical/home',
    homeRef: 'home.local.test',
    deviceRef: 'device.local.test',
    companionLineageRef: 'companion.lineage.test'
  });
  const projection = Object.freeze({
    schemaVersion: 'vexlife.living-journal.memory-projection/v1',
    truthClass: 'MEMORY_REFERENCE_HELD',
    state: 'HELD',
    currentness: 'HELD',
    realMemoryLoaded: false,
    realJournalBodyLoaded: false,
    rawConversationContentIncluded: false,
    pageCount: 0,
    pages: [],
    effects: {
      homeMutated: false,
      memoryMutated: false,
      semanticAcceptanceCreated: false,
      firstPersonAuthorityGranted: false,
      modelCalled: false,
      translationCalled: false,
      networkCalled: false,
      trainingRan: false,
      modelWeightsChanged: false,
      publicationPerformed: false
    }
  });
  let identityCalls = 0;
  let observedIdentity = null;
  let observedInput = null;

  await withServer({
    staticRoot: repoRoot,
    companionBridge: fakeCompanion(),
    resolveHomeIdentity: () => {
      identityCalls += 1;
      return identity;
    },
    createLivingJournalMemoryBridge: (receivedIdentity) => {
      observedIdentity = receivedIdentity;
      return {
        read(input) {
          observedInput = structuredClone(input);
          const keys = Object.keys(input).sort();
          if (JSON.stringify(keys) !== JSON.stringify(['maxPages', 'threadRef'])) {
            throw new BrowserLivingJournalMemoryBridgeError(
              'LIVING_JOURNAL_MEMORY_REQUEST_NOT_ADMITTED',
              'Living Journal Memory browser input exceeded the admitted read request',
              400,
              null
            );
          }
          return projection;
        }
      };
    }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${BROWSER_LIVING_JOURNAL_MEMORY_API_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadRef: 'thread.self-development.open-conversation', maxPages: 24 })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), projection);
  });

  assert.equal(identityCalls, 1);
  assert.deepEqual(observedIdentity, identity);
  assert.deepEqual(observedInput, { threadRef: 'thread.self-development.open-conversation', maxPages: 24 });
});

test('Living Journal Memory route rejects browser attempts to inject Home or identity authority', async () => {
  let memoryBridgeCalls = 0;
  await withServer({
    staticRoot: repoRoot,
    companionBridge: fakeCompanion(),
    resolveHomeIdentity: () => Object.freeze({
      home: '/canonical/home',
      homeRef: 'home.local.test',
      deviceRef: 'device.local.test',
      companionLineageRef: 'companion.lineage.test'
    }),
    createLivingJournalMemoryBridge: () => ({
      read(input) {
        memoryBridgeCalls += 1;
        if (Object.keys(input).some((key) => ['home', 'homeRef', 'deviceRef', 'companionLineageRef', 'endpoint', 'model'].includes(key))) {
          throw new BrowserLivingJournalMemoryBridgeError(
            'LIVING_JOURNAL_MEMORY_REQUEST_NOT_ADMITTED',
            'Living Journal Memory browser input cannot select Home, identity, endpoint, or model authority',
            400,
            null
          );
        }
        return {};
      }
    })
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${BROWSER_LIVING_JOURNAL_MEMORY_API_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadRef: 'thread.self-development.open-conversation',
        maxPages: 24,
        home: '/attacker/chosen/home'
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.failureCode, 'LIVING_JOURNAL_MEMORY_REQUEST_NOT_ADMITTED');
  });
  assert.equal(memoryBridgeCalls, 1);
});

test('Living Journal Memory route fails closed when canonical Home identity is unavailable', async () => {
  let memoryBridgeCreated = false;
  await withServer({
    staticRoot: repoRoot,
    companionBridge: fakeCompanion(),
    resolveHomeIdentity: () => {
      throw new Error('ambient path details must not cross the HTTP boundary');
    },
    createLivingJournalMemoryBridge: () => {
      memoryBridgeCreated = true;
      return { read: () => ({}) };
    }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${BROWSER_LIVING_JOURNAL_MEMORY_API_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadRef: 'thread.self-development.open-conversation', maxPages: 24 })
    });
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.failureCode, 'LIVING_JOURNAL_MEMORY_HOME_UNAVAILABLE');
    assert.equal(JSON.stringify(payload).includes('ambient path details'), false);
  });
  assert.equal(memoryBridgeCreated, false);
});

test('Living Journal Memory route enforces method, content type, and bounded JSON before bridge execution', async () => {
  let reads = 0;
  await withServer({
    staticRoot: repoRoot,
    companionBridge: fakeCompanion(),
    resolveHomeIdentity: () => ({ home: '/canonical/home', homeRef: 'home.local.test', deviceRef: 'device.local.test', companionLineageRef: 'companion.lineage.test' }),
    createLivingJournalMemoryBridge: () => ({ read: () => { reads += 1; return {}; } })
  }, async (baseUrl) => {
    const get = await fetch(`${baseUrl}${BROWSER_LIVING_JOURNAL_MEMORY_API_PATH}`);
    assert.equal(get.status, 405);
    assert.equal(get.headers.get('allow'), 'POST');

    const wrongType = await fetch(`${baseUrl}${BROWSER_LIVING_JOURNAL_MEMORY_API_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}'
    });
    assert.equal(wrongType.status, 415);
    assert.equal((await wrongType.json()).failureCode, 'LIVING_JOURNAL_MEMORY_REQUEST_NOT_ADMITTED');

    const malformed = await fetch(`${baseUrl}${BROWSER_LIVING_JOURNAL_MEMORY_API_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{'
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).failureCode, 'LIVING_JOURNAL_MEMORY_REQUEST_NOT_ADMITTED');
  });
  assert.equal(reads, 0);
});

test('browser app source binds Memory activation to the same-origin route without browser-owned Home/model authority', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'reference/browser/app.js'), 'utf8');
  assert.match(source, /const LIVING_JOURNAL_MEMORY_API_PATH='\/api\/v1\/living-journal\/memory';/u);
  assert.match(source, /body:JSON\.stringify\(\{threadRef:state\.threadRef,maxPages:LIVING_JOURNAL_MEMORY_MAX_PAGES\}\)/u);
  const activationStart = source.indexOf('async function loadLivingJournalMemory()');
  const activationEnd = source.indexOf('function applyLocalization()', activationStart);
  assert.notEqual(activationStart, -1);
  assert.notEqual(activationEnd, -1);
  const activation = source.slice(activationStart, activationEnd);
  for (const forbidden of ['homeRef:', 'deviceRef:', 'companionLineageRef:', 'endpoint:', 'model:']) {
    assert.equal(activation.includes(forbidden), false, `browser Memory activation must not send ${forbidden}`);
  }
  assert.match(activation, /livingJournal\.setData\(payload\)/u);
  assert.match(activation, /livingJournal\.restoreInitialData\(\)/u);
});


test('Living Journal controller preserves HELD as a distinct zero-page real-Memory truth instead of coercing it to CURRENT or synthetic', () => {
  const priorDocument = globalThis.document;
  const priorInnerWidth = globalThis.innerWidth;
  const priorAddEventListener = globalThis.addEventListener;
  const priorMatchMedia = globalThis.matchMedia;
  globalThis.document = { querySelector: () => null };
  globalThis.innerWidth = 1200;
  globalThis.addEventListener = () => {};
  globalThis.matchMedia = () => ({ matches: false });
  try {
    const synthetic = Object.freeze({
      truthClass: 'CURRENT_SYNTHETIC_REFERENCE',
      realMemoryLoaded: false,
      realJournalBodyLoaded: false,
      modelCalled: false,
      translationCalled: false,
      networkCalled: false,
      persisted: false,
      published: false,
      pages: Object.freeze([Object.freeze({
        pageRef: 'page.synthetic.proof', eventRef: 'event.synthetic.proof', thenRef: 'then.synthetic.proof', sequence: 0,
        source: Object.freeze({ sourceRef: 'source.synthetic.proof', originalLanguage: 'en', originalText: 'synthetic proof source' }),
        display: Object.freeze({ en: Object.freeze({ then: 'then', later: 'later', now: 'now', vantages: Object.freeze({ HUMAN: 'human', VEX: 'vex', SHARED_RELATIONSHIP: 'shared', SOURCE: 'source' }) }) })
      })])
    });
    const effects = Object.freeze({ homeMutated:false, memoryMutated:false, semanticAcceptanceCreated:false, firstPersonAuthorityGranted:false, modelCalled:false, translationCalled:false, networkCalled:false, trainingRan:false, modelWeightsChanged:false, publicationPerformed:false });
    const held = Object.freeze({
      schemaVersion: 'vexlife.living-journal.memory-projection/v1',
      state: 'HELD', currentness: 'HELD', truthClass: 'MEMORY_REFERENCE_HELD',
      realMemoryLoaded: false, realJournalBodyLoaded: false, rawConversationContentIncluded: false,
      pageCount: 0, maxPages: 24, pages: Object.freeze([]),
      heldOrDeferredStatementRefs: Object.freeze(['statement.held.proof']), boundedOutStatementRefs: Object.freeze([]), reasons: Object.freeze(['CURRENTNESS_HELD']), effects
    });
    const controller = createLivingJournalController({ state: { selectedNodeRef: 'terrain.root' }, data: synthetic, t: (ref) => ref, navigation: {} });
    controller.setData(held);
    const snapshot = controller.snapshot();
    assert.equal(snapshot.truthClass, 'MEMORY_REFERENCE_HELD');
    assert.equal(snapshot.dataMode, 'MEMORY_HELD');
    assert.equal(snapshot.pageCount, 0);
    assert.equal(snapshot.realMemoryLoaded, false);
    assert.throws(() => controller.setData({ ...held, effects: { ...effects, memoryMutated: true } }));
    assert.throws(() => controller.setData({ ...held, realJournalBodyLoaded: true, pageCount: 1, pages: [{ pageRef: 'page.not-admitted' }] }));
  } finally {
    if (priorDocument === undefined) delete globalThis.document; else globalThis.document = priorDocument;
    if (priorInnerWidth === undefined) delete globalThis.innerWidth; else globalThis.innerWidth = priorInnerWidth;
    if (priorAddEventListener === undefined) delete globalThis.addEventListener; else globalThis.addEventListener = priorAddEventListener;
    if (priorMatchMedia === undefined) delete globalThis.matchMedia; else globalThis.matchMedia = priorMatchMedia;
  }
});