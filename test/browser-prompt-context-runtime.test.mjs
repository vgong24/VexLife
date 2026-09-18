import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServerOwnedBrowserCompanionBridge } from '../scripts/serve-browser.mjs';
import { createBrowserCompanionBridge } from '../src/core/browser-companion-bridge.mjs';
import {
  LivedCompanionError,
  initializeLivedCompanionHome,
  readCurrentLivedCompanionCompletedTurn
} from '../src/core/lived-companion.mjs';
import { createBrowserPromptContextRuntime } from '../src/core/browser-prompt-context-runtime.mjs';

async function startModelServer() {
  const calls = [];
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    calls.push({ path: request.url, body });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      model: 'Qwen3.5-4B-Q4_K_M',
      choices: [{ message: { content: calls.length === 1 ? 'Prior exact reply.' : 'Current exact reply.' } }]
    }));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    calls,
    endpoint: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

function makeHome(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `vexlife-browser-prompt-context-runtime-${label}-`));
  const home = path.join(root, 'home');
  const identity = {
    homeRef: 'vex-home.browser-prompt-context-runtime-test',
    familyRef: 'vex-family.browser-prompt-context-runtime-test',
    deviceRef: 'device.vexlife.browser-prompt-context-runtime-test',
    companionLineageRef: 'companion-lineage.vexlife.browser-prompt-context-runtime-test'
  };
  initializeLivedCompanionHome({ home, ...identity });
  return { root, home, ...identity };
}

function bridge(home, model, runtime = null, instanceRef = `instance.vexlife.browser-prompt-context.${crypto.randomUUID()}`) {
  return createBrowserCompanionBridge({
    home: home.home,
    endpoint: model.endpoint,
    model: 'Qwen3.5-4B-Q4_K_M',
    instanceRef,
    ...(runtime ? {
      promptContextResolver: runtime.promptContextResolver,
      promptContextAuthorityVerifier: runtime.promptContextAuthorityVerifier
    } : {})
  });
}

async function firstTurn(home, model, content = 'Prior exact human message.') {
  return bridge(home, model, null, 'instance.vexlife.browser-prompt-context-first').performTurn({
    threadRef: 'thread.vexlife.browser-prompt-context-runtime-test',
    channelRef: 'channel.local-vex.companion',
    content
  });
}

function runtime(home, overrides = {}) {
  return createBrowserPromptContextRuntime({
    home: home.home,
    homeRef: home.homeRef,
    deviceRef: home.deviceRef,
    companionLineageRef: home.companionLineageRef,
    ...overrides
  });
}

test('first browser turn remains direct when no prior completed head exists', async () => {
  const home = makeHome('first-direct');
  const model = await startModelServer();
  try {
    const owner = runtime(home);
    const result = await bridge(home, model, owner).performTurn({
      threadRef: 'thread.vexlife.browser-prompt-context-runtime-test',
      channelRef: 'channel.local-vex.companion',
      content: 'First exact message.'
    });
    assert.equal(result.state, 'TURN_COMPLETED');
    assert.equal(result.promptContextMaterialization, null);
    assert.equal(model.calls.length, 1);
    assert.deepEqual(model.calls[0].body.messages, [{ role: 'user', content: 'First exact message.' }]);
    assert.equal(owner.activeSelectionCount(), 0);
  } finally {
    await model.close();
    fs.rmSync(home.root, { recursive: true, force: true });
  }
});

test('bounded current completed-turn owner reads exactly two event files without enumerating the event directory', async () => {
  const home = makeHome('bounded-read');
  const model = await startModelServer();
  try {
    const first = await firstTurn(home, model);
    const original = fs.readdirSync;
    const eventNeedle = path.join(
      'conversations',
      home.companionLineageRef,
      'thread.vexlife.browser-prompt-context-runtime-test',
      'events'
    );
    fs.readdirSync = function guarded(target, ...args) {
      if (path.normalize(String(target)).endsWith(path.normalize(eventNeedle))) {
        throw new Error('event-directory-enumeration-forbidden');
      }
      return original.call(this, target, ...args);
    };
    try {
      const observed = readCurrentLivedCompanionCompletedTurn({
        home: home.home,
        homeRef: home.homeRef,
        deviceRef: home.deviceRef,
        companionLineageRef: home.companionLineageRef,
        threadRef: 'thread.vexlife.browser-prompt-context-runtime-test',
        expectedConversationHeadSha256: first.conversationHeadSha256
      });
      assert.equal(observed.state, 'COMPLETED');
      assert.equal(observed.conversationHeadSha256, first.conversationHeadSha256);
      assert.equal(observed.requestEventBinding.sequence, 0);
      assert.equal(observed.responseEventBinding.sequence, 1);
      assert.equal(observed.exactEventFileReadCount, 2);
      assert.equal(observed.wholeHistoryEventEnumerationPerformed, false);
      assert.equal(observed.rawConversationContentIncluded, false);
    } finally {
      fs.readdirSync = original;
    }
  } finally {
    await model.close();
    fs.rmSync(home.root, { recursive: true, force: true });
  }
});

test('runtime adopts the immediate prior completed turn into the actual loopback provider request', async () => {
  const home = makeHome('real-provider');
  const model = await startModelServer();
  try {
    await firstTurn(home, model);
    const owner = runtime(home);
    const result = await bridge(home, model, owner, 'instance.vexlife.browser-prompt-context-second').performTurn({
      threadRef: 'thread.vexlife.browser-prompt-context-runtime-test',
      channelRef: 'channel.local-vex.companion',
      content: 'Current exact human message.'
    });
    assert.equal(result.state, 'TURN_COMPLETED');
    assert.equal(model.calls.length, 2);
    assert.deepEqual(model.calls[1].body.messages, [
      { role: 'user', content: 'Prior exact human message.' },
      { role: 'assistant', content: 'Prior exact reply.' },
      { role: 'user', content: 'Current exact human message.' }
    ]);
    assert.equal(result.promptContextMaterialization.providerBoundaryCurrentnessVerified, true);
    assert.equal(result.promptContextMaterialization.providerBoundarySourceBindingsVerified, true);
    assert.equal(result.promptContextMaterialization.wholeHistoryEventEnumerationPerformed, false);
    assert.equal(result.promptContextMaterialization.currentRequestIncludedExactlyOnce, true);
    assert.equal(result.promptContextMaterialization.memoryEffectPerformed, false);
    assert.equal(result.promptContextMaterialization.trainingSelectionPerformed, false);
    assert.equal(result.promptContextMaterialization.modelWeightEffectPerformed, false);
    assert.equal(owner.activeSelectionCount(), 0);
  } finally {
    await model.close();
    fs.rmSync(home.root, { recursive: true, force: true });
  }
});

test('resolver fails closed when a prior head belongs to another thread', async () => {
  const home = makeHome('cross-thread');
  const model = await startModelServer();
  try {
    const first = await firstTurn(home, model);
    const owner = runtime(home);
    await assert.rejects(
      () => owner.promptContextResolver({
        context: {
          threadRef: 'thread.vexlife.browser-prompt-context-other',
          currentRequestEventRef: 'event.vexlife.request.cross-thread',
          currentRequestEventHash: '1'.repeat(64),
          currentRequestSequence: 2,
          priorConversationHeadSha256: first.conversationHeadSha256
        }
      }),
      (error) => error instanceof LivedCompanionError &&
        ['CONVERSATION_HEAD_MISMATCH', 'CONTEXT_HASH_MISMATCH'].includes(error.code)
    );
  } finally {
    await model.close();
    fs.rmSync(home.root, { recursive: true, force: true });
  }
});

test('authority verifier rejects a stale prior head after the thread advances', async () => {
  const home = makeHome('stale-head');
  const model = await startModelServer();
  try {
    const first = await firstTurn(home, model);
    const owner = runtime(home);
    const current = {
      threadRef: 'thread.vexlife.browser-prompt-context-runtime-test',
      currentRequestEventRef: 'event.vexlife.request.pending-stale-check',
      currentRequestEventHash: '2'.repeat(64),
      currentRequestSequence: 2,
      priorConversationHeadSha256: first.conversationHeadSha256
    };
    const selected = await owner.promptContextResolver({ context: current });
    await bridge(home, model, null, 'instance.vexlife.browser-prompt-context-advancer').performTurn({
      threadRef: current.threadRef,
      channelRef: 'channel.local-vex.companion',
      content: 'Advance the thread without consuming the pending selection.'
    });
    await assert.rejects(
      () => owner.promptContextAuthorityVerifier({
        schemaVersion: 'vexlife.prompt-context-authority-query/v2',
        phase: 'MATERIALIZE',
        lineageRef: home.companionLineageRef,
        threadRef: current.threadRef,
        priorConversationHeadSha256: first.conversationHeadSha256,
        currentRequestEventRef: current.currentRequestEventRef,
        currentRequestEventHash: current.currentRequestEventHash,
        currentRequestSequence: current.currentRequestSequence,
        selectedConversationEventRefs: selected.selectedConversationEventRefs,
        materializationReceiptRefOrNull: null,
        materializationReceiptFingerprintOrNull: null
      }),
      (error) => error instanceof LivedCompanionError &&
        ['CONVERSATION_HEAD_MISMATCH', 'CONTEXT_HASH_MISMATCH'].includes(error.code)
    );
    assert.equal(owner.activeSelectionCount(), 0);
  } finally {
    await model.close();
    fs.rmSync(home.root, { recursive: true, force: true });
  }
});

test('authority verifier rejects an expired exact lease', async () => {
  const home = makeHome('expired');
  const model = await startModelServer();
  let clock = Date.parse('2026-09-02T00:00:00.000Z');
  try {
    const first = await firstTurn(home, model);
    const owner = runtime(home, {
      leaseTtlMs: 1_000,
      now: () => new Date(clock).toISOString()
    });
    const current = {
      threadRef: 'thread.vexlife.browser-prompt-context-runtime-test',
      currentRequestEventRef: 'event.vexlife.request.pending-expiry-check',
      currentRequestEventHash: '3'.repeat(64),
      currentRequestSequence: 2,
      priorConversationHeadSha256: first.conversationHeadSha256
    };
    const selected = await owner.promptContextResolver({ context: current });
    clock += 2_000;
    await assert.rejects(
      () => owner.promptContextAuthorityVerifier({
        schemaVersion: 'vexlife.prompt-context-authority-query/v2',
        phase: 'MATERIALIZE',
        lineageRef: home.companionLineageRef,
        threadRef: current.threadRef,
        priorConversationHeadSha256: first.conversationHeadSha256,
        currentRequestEventRef: current.currentRequestEventRef,
        currentRequestEventHash: current.currentRequestEventHash,
        currentRequestSequence: current.currentRequestSequence,
        selectedConversationEventRefs: selected.selectedConversationEventRefs,
        materializationReceiptRefOrNull: null,
        materializationReceiptFingerprintOrNull: null
      }),
      (error) => error instanceof LivedCompanionError && error.code === 'CONTEXT_HASH_MISMATCH'
    );
    assert.equal(owner.activeSelectionCount(), 0);
  } finally {
    await model.close();
    fs.rmSync(home.root, { recursive: true, force: true });
  }
});

test('post-MATERIALIZE failure retains no selection beyond the finite lease TTL', async () => {
  const home = makeHome('materialization-failure-expiry');
  const model = await startModelServer();
  try {
    await firstTurn(home, model);
    const owner = runtime(home, { leaseTtlMs: 1_000 });
    await assert.rejects(
      () => bridge(home, model, owner, 'instance.vexlife.browser-prompt-context-budget-failure').performTurn({
        threadRef: 'thread.vexlife.browser-prompt-context-runtime-test',
        channelRef: 'channel.local-vex.companion',
        content: 'x'.repeat(16_000)
      })
    );
    assert.equal(model.calls.length, 1);
    assert.equal(owner.activeSelectionCount(), 1);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    assert.equal(owner.activeSelectionCount(), 0);
  } finally {
    await model.close();
    fs.rmSync(home.root, { recursive: true, force: true });
  }
});

test('verifier failure retires only its exact active selection', async () => {
  const home = makeHome('exact-cleanup');
  const model = await startModelServer();
  try {
    const first = await firstTurn(home, model);
    const owner = runtime(home);
    const common = {
      threadRef: 'thread.vexlife.browser-prompt-context-runtime-test',
      currentRequestSequence: 2,
      priorConversationHeadSha256: first.conversationHeadSha256
    };
    const firstPending = {
      ...common,
      currentRequestEventRef: 'event.vexlife.request.cleanup-first',
      currentRequestEventHash: '4'.repeat(64)
    };
    const secondPending = {
      ...common,
      currentRequestEventRef: 'event.vexlife.request.cleanup-second',
      currentRequestEventHash: '5'.repeat(64)
    };
    const firstSelection = await owner.promptContextResolver({ context: firstPending });
    await owner.promptContextResolver({ context: secondPending });
    assert.equal(owner.activeSelectionCount(), 2);
    await assert.rejects(
      () => owner.promptContextAuthorityVerifier({
        schemaVersion: 'vexlife.prompt-context-authority-query/v2',
        phase: 'MATERIALIZE',
        lineageRef: home.companionLineageRef,
        threadRef: common.threadRef,
        priorConversationHeadSha256: first.conversationHeadSha256,
        currentRequestEventRef: firstPending.currentRequestEventRef,
        currentRequestEventHash: '6'.repeat(64),
        currentRequestSequence: firstPending.currentRequestSequence,
        selectedConversationEventRefs: firstSelection.selectedConversationEventRefs,
        materializationReceiptRefOrNull: null,
        materializationReceiptFingerprintOrNull: null
      }),
      (error) => error instanceof LivedCompanionError && error.code === 'CONTEXT_HASH_MISMATCH'
    );
    assert.equal(owner.activeSelectionCount(), 1);
  } finally {
    await model.close();
    fs.rmSync(home.root, { recursive: true, force: true });
  }
});


const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('server-owned prompt-context composition stays lazy until a real turn needs Home identity', () => {
  let captured = null;
  const sentinel = Object.freeze({ ref: 'bridge.vexlife.birth-pcr13.lazy' });
  const missingHome = path.join(os.tmpdir(), `vexlife-birth-pcr13-missing-${crypto.randomUUID()}`);
  const result = createServerOwnedBrowserCompanionBridge({
    sourceRoot: SOURCE_ROOT,
    companionHome: missingHome,
    endpoint: 'http://127.0.0.1:18080',
    model: 'Qwen3.5-4B-Q4_K_M',
    runtimeMode: 'DIRECT_SINGLE_TURN',
    bridgeFactory(options) {
      captured = options;
      return sentinel;
    }
  });

  assert.equal(result, sentinel);
  assert.equal(fs.existsSync(missingHome), false);
  assert.equal(captured.capabilityRuntime, null);
  assert.equal(captured.modelConnectionComposer, null);
  assert.equal(typeof captured.promptContextResolver, 'function');
  assert.equal(typeof captured.promptContextAuthorityVerifier, 'function');
  assert.throws(
    () => captured.promptContextResolver({ context: {} }),
    (error) => error?.code === 'COMPANION_HOME_UNAVAILABLE'
  );
});

test('production server-owned bridge adopts the immediate prior completed turn into the ordinary provider request', async () => {
  const home = makeHome('server-owned-real-provider');
  const model = await startModelServer();
  try {
    const production = createServerOwnedBrowserCompanionBridge({
      sourceRoot: SOURCE_ROOT,
      companionHome: home.home,
      endpoint: model.endpoint,
      model: 'Qwen3.5-4B-Q4_K_M',
      runtimeMode: 'DIRECT_SINGLE_TURN'
    });
    const first = await production.performTurn({
      threadRef: 'thread.vexlife.browser-prompt-context-runtime-test',
      channelRef: 'channel.local-vex.companion',
      content: 'Prior exact human message.'
    });
    assert.equal(first.state, 'TURN_COMPLETED');
    assert.equal(first.promptContextMaterialization, null);
    assert.deepEqual(model.calls[0].body.messages, [
      { role: 'user', content: 'Prior exact human message.' }
    ]);

    const second = await production.performTurn({
      threadRef: 'thread.vexlife.browser-prompt-context-runtime-test',
      channelRef: 'channel.local-vex.companion',
      content: 'Current exact human message.'
    });
    assert.equal(second.state, 'TURN_COMPLETED');
    assert.equal(model.calls.length, 2);
    assert.deepEqual(model.calls[1].body.messages, [
      { role: 'user', content: 'Prior exact human message.' },
      { role: 'assistant', content: 'Prior exact reply.' },
      { role: 'user', content: 'Current exact human message.' }
    ]);
    assert.equal(second.promptContextMaterialization.providerBoundaryCurrentnessVerified, true);
    assert.equal(second.promptContextMaterialization.providerBoundarySourceBindingsVerified, true);
    assert.equal(second.promptContextMaterialization.wholeHistoryEventEnumerationPerformed, false);
    assert.equal(second.promptContextMaterialization.currentRequestIncludedExactlyOnce, true);
    assert.equal(second.promptContextMaterialization.memoryEffectPerformed, false);
    assert.equal(second.promptContextMaterialization.trainingSelectionPerformed, false);
    assert.equal(second.promptContextMaterialization.modelWeightEffectPerformed, false);
  } finally {
    await model.close();
    fs.rmSync(home.root, { recursive: true, force: true });
  }
});

test('server-owned prompt-context binding fails closed if the canonical Home identity later contradicts its bound identity', async () => {
  const home = makeHome('identity-drift');
  let captured = null;
  try {
    createServerOwnedBrowserCompanionBridge({
      sourceRoot: SOURCE_ROOT,
      companionHome: home.home,
      endpoint: 'http://127.0.0.1:18080',
      model: 'Qwen3.5-4B-Q4_K_M',
      runtimeMode: 'DIRECT_SINGLE_TURN',
      bridgeFactory(options) {
        captured = options;
        return Object.freeze({ ref: 'bridge.vexlife.birth-pcr13.identity-drift' });
      }
    });
    const firstContext = {
      threadRef: 'thread.vexlife.browser-prompt-context-runtime-test',
      currentRequestEventRef: 'event.vexlife.request.identity-drift-one',
      currentRequestEventHash: '7'.repeat(64),
      currentRequestSequence: 0,
      priorConversationHeadSha256: null
    };
    assert.equal(await captured.promptContextResolver({ context: firstContext }), null);
    const homeManifestPath = path.join(home.home, 'config', 'home.json');
    const homeManifest = JSON.parse(fs.readFileSync(homeManifestPath, 'utf8'));
    fs.writeFileSync(homeManifestPath, `${JSON.stringify({
      ...homeManifest,
      homeRef: 'vex-home.browser-prompt-context-runtime-test.changed'
    }, null, 2)}\n`);
    assert.throws(
      () => captured.promptContextResolver({
        context: {
          ...firstContext,
          currentRequestEventRef: 'event.vexlife.request.identity-drift-two',
          currentRequestEventHash: '8'.repeat(64)
        }
      }),
      (error) => error?.code === 'COMPANION_HOME_IDENTITY_INVALID'
    );
  } finally {
    fs.rmSync(home.root, { recursive: true, force: true });
  }
});

test('canonical module registries bind prompt-context runtime to serve-browser exactly once', () => {
  const rootRegistry = JSON.parse(fs.readFileSync(path.join(SOURCE_ROOT, 'blueprint/module-registry.json'), 'utf8'));
  const scripts = JSON.parse(fs.readFileSync(path.join(SOURCE_ROOT, 'blueprint/module-registry/scripts.json'), 'utf8'));
  const promptRuntime = JSON.parse(fs.readFileSync(
    path.join(SOURCE_ROOT, 'blueprint/module-registry/browser-prompt-context-runtime.json'),
    'utf8'
  ));
  assert.equal(
    rootRegistry.includes.modules.filter((entry) => entry === 'blueprint/module-registry/browser-prompt-context-runtime.json').length,
    1
  );
  const server = scripts.find((entry) => entry.moduleRef === 'module.vexlife.script.serve-browser');
  const runtimeEntry = promptRuntime.find(
    (entry) => entry.moduleRef === 'module.vexlife.core.browser-prompt-context-runtime'
  );
  assert.ok(server);
  assert.ok(runtimeEntry);
  assert.equal(
    server.reads.filter((entry) => entry === 'module.vexlife.core.browser-prompt-context-runtime').length,
    1
  );
  assert.equal(
    server.tests.filter((entry) => entry === 'test/browser-prompt-context-runtime.test.mjs').length,
    1
  );
  assert.equal(
    runtimeEntry.loadedBy.filter((entry) => entry === 'module.vexlife.script.serve-browser').length,
    1
  );
});

// [VXG RealForever]
