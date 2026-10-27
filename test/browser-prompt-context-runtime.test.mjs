import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServerOwnedBrowserCompanionBridge } from '../scripts/serve-browser.mjs';
import { BrowserCompanionBridgeError, createBrowserCompanionBridge } from '../src/core/browser-companion-bridge.mjs';
import {
  LivedCompanionError,
  initializeLivedCompanionHome,
  readCurrentLivedCompanionCompletedTurn
} from '../src/core/lived-companion.mjs';
import { createBrowserPromptContextRuntime } from '../src/core/browser-prompt-context-runtime.mjs';
import { createBrowserWorkingContinuityOwner } from '../src/core/browser-working-continuity-owner.mjs';
import { formContinuityRolloverPlan } from '../src/core/continuity-rollover.mjs';
import { projectResourceContextPressure } from '../src/core/resource-context-pressure.mjs';
import { semanticHash } from '../src/core/utils.mjs';
import {
  commitDailyMemoryDream,
  loadDailyMemoryDreamState
} from '../src/core/daily-memory-dream.mjs';
import {
  createDailyMemoryDreamFixture,
  replaceFixtureActiveAuthorityWithoutScore
} from '../scripts/daily-memory-dream.mjs';

async function startModelServer(responder = null) {
  const calls = [];
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    calls.push({ path: request.url, body });
    const content = responder
      ? await responder({ callIndex: calls.length - 1, body, calls })
      : calls.length === 1 ? 'Prior exact reply.' : 'Current exact reply.';
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      model: 'Qwen3.5-4B-Q4_K_M',
      choices: [{ message: { content } }]
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

function dailyFixtureHome(fixture) {
  return {
    root: path.dirname(fixture.ids.home),
    home: fixture.ids.home,
    homeRef: fixture.ids.homeRef,
    deviceRef: fixture.ids.deviceRef,
    companionLineageRef: fixture.ids.companionLineageRef
  };
}

function commitFixtureDailyMemory(fixture) {
  const state = loadDailyMemoryDreamState(fixture.ids);
  return commitDailyMemoryDream({
    ...fixture.ids,
    instanceRef: fixture.ids.instanceRef,
    restInvocationAuthorityRef: 'authority.manual.browser-prompt-context-memory.test',
    dayRef: 'day.browser-prompt-context-memory.000',
    dayIndex: 0,
    calendarDateRef: '2026-08-17',
    timeZoneRef: 'America/Los_Angeles',
    observedAt: '2026-08-18T00:00:00.000Z',
    expectedConversationHeadSha256: fixture.g01.head.conversationHeadSha256,
    expectedScoreHeadSha256: fixture.score.head.scoreHeadSha256,
    expectedDailyDreamHeadSha256: state.head?.dailyDreamHeadSha256 ?? null
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

test('ordinary provider request receives one attributed bounded current Memory system packet plus the immediate prior turn', async () => {
  const fixture = createDailyMemoryDreamFixture('browser-prompt-memory-current');
  const home = dailyFixtureHome(fixture);
  commitFixtureDailyMemory(fixture);
  const model = await startModelServer();
  try {
    const owner = runtime(home);
    const result = await bridge(home, model, owner, 'instance.vexlife.browser-prompt-context-memory-current').performTurn({
      threadRef: fixture.ids.threadRef,
      channelRef: 'channel.g03.fixture',
      content: 'What should we carry forward?'
    });
    assert.equal(result.state, 'TURN_COMPLETED');
    assert.equal(model.calls.length, 1);
    const messages = model.calls[0].body.messages;
    assert.equal(messages.length, 4);
    assert.equal(messages[0].role, 'system');
    assert.match(messages[0].content, /VEXLIFE_CURRENT_MEMORY_CONTEXT\/v1/u);
    assert.match(messages[0].content, /Accepted active continuity\./u);
    assert.doesNotMatch(messages[0].content, /Held unresolved continuity\./u);
    assert.match(messages[0].content, /not proof of subjective recall/u);
    assert.deepEqual(messages.slice(1), [
      { role: 'user', content: 'private human source 2' },
      { role: 'assistant', content: 'private vex source 2' },
      { role: 'user', content: 'What should we carry forward?' }
    ]);
    assert.equal(result.promptContextMaterialization.memoryContextIncluded, true);
    assert.match(result.promptContextMaterialization.memoryContextRefOrNull, /^memory-context\.vexlife\.prompt\./u);
    assert.match(result.promptContextMaterialization.memoryContextFingerprintOrNull, /^[0-9a-f]{64}$/u);
    assert.ok(result.promptContextMaterialization.memorySourceRefs.includes('statement.g03.active'));
    assert.equal(result.promptContextMaterialization.memoryEffectPerformed, false);
    assert.equal(result.promptContextMaterialization.contextLeaseInputTokenEstimate, 192_000);
    assert.equal(result.promptContextMaterialization.reservedOutputTokens, 16_000);
    assert.equal(result.promptContextMaterialization.hardTokenLimit, 208_000);
    assert.equal(result.promptContextMaterialization.contextLeaseCurrentness, 'CURRENT');
    assert.equal(result.promptContextMaterialization.contextLeaseLifecycle, 'ACTIVE');
    assert.ok(Date.parse(result.promptContextMaterialization.contextLeaseExpiresAt) >
      Date.parse(result.promptContextMaterialization.contextLeaseFormedAt));
    assert.ok(result.promptContextMaterialization.memoryTokenCap > 0);
    assert.ok(result.promptContextMaterialization.memoryEstimatedSystemMessageTokens > 0);
    assert.ok(Number.isSafeInteger(result.promptContextMaterialization.memoryTokenBoundedOutPageCount));
    assert.ok(Number.isSafeInteger(result.promptContextMaterialization.memoryBoundedOutStatementCount));
    assert.ok(Number.isSafeInteger(result.promptContextMaterialization.memoryHeldOrDeferredStatementCount));
    assert.equal(result.promptContextMaterialization.providerBoundaryCurrentnessVerified, true);
    assert.equal(result.promptContextMaterialization.providerBoundarySourceBindingsVerified, true);
  } finally {
    await model.close();
    fs.rmSync(home.root, { recursive: true, force: true });
  }
});

test('Memory is bounded out when the immediate conversation consumes the shared Context Lease input budget', async () => {
  const fixture = createDailyMemoryDreamFixture('browser-prompt-memory-budget');
  const home = dailyFixtureHome(fixture);
  commitFixtureDailyMemory(fixture);
  try {
    const owner = runtime(home);
    const current = {
      threadRef: fixture.ids.threadRef,
      currentRequestEventRef: 'event.vexlife.request.memory-budget-check',
      currentRequestEventHash: 'a'.repeat(64),
      currentRequestSequence: fixture.g01.head.sequence + 1,
      priorConversationHeadSha256: fixture.g01.head.conversationHeadSha256
    };
    const taskIntent = 'x'.repeat(767_600);
    const selected = await owner.promptContextResolver({ context: current, taskIntent });
    assert.equal(selected.memoryContext.included, false);
    assert.equal(selected.memoryContext.estimatedSystemMessageTokens, 0);
    assert.equal(selected.memoryContext.memoryTokenCap < 100, true);
    assert.ok(selected.memoryContext.tokenBoundedOutPageRefs.length >= 1);
    assert.equal(selected.contextLease.inputTokenEstimate, 192_000);
    assert.equal(selected.contextLease.reservedOutputTokens, 16_000);
    assert.equal(selected.contextLease.hardTokenLimit, 208_000);
  } finally {
    fs.rmSync(home.root, { recursive: true, force: true });
  }
});

test('capability-aware Companion revalidates and carries current Memory plus prior turn through request formation and synthesis', async () => {
  const fixture = createDailyMemoryDreamFixture('browser-prompt-memory-capability');
  const home = dailyFixtureHome(fixture);
  commitFixtureDailyMemory(fixture);
  const model = await startModelServer(async ({ callIndex, body }) => {
    assert.equal(body.messages.length, 5);
    assert.equal(body.messages[0].role, 'system');
    assert.match(body.messages[0].content, /VEXLIFE_CURRENT_MEMORY_CONTEXT\/v1/u);
    assert.match(body.messages[0].content, /Accepted active continuity\./u);
    assert.deepEqual(body.messages.slice(1, 4), [
      { role: 'user', content: 'private human source 2' },
      { role: 'assistant', content: 'private vex source 2' },
      { role: 'user', content: 'Can you carry the current context while deciding whether tools are needed?' }
    ]);
    assert.equal(body.messages[4].role, 'user');
    if (callIndex === 0) {
      assert.match(body.messages[4].content, /VEXLIFE_CAPABILITY_REQUEST_FORMATION\/v1/u);
      return JSON.stringify({ intentDisposition: 'NO_READ_ONLY_FUNCTION_NEEDED', requests: [] });
    }
    assert.equal(callIndex, 1);
    assert.match(body.messages[4].content, /VEXLIFE_CAPABILITY_SYNTHESIS\/v1/u);
    assert.match(body.messages[4].content, /SOURCE_BOUND_OBSERVATIONS=\[\]/u);
    return 'Capability-aware current Memory reply.';
  });
  try {
    const production = createServerOwnedBrowserCompanionBridge({
      sourceRoot: SOURCE_ROOT,
      companionHome: home.home,
      endpoint: model.endpoint,
      model: 'Qwen3.5-4B-Q4_K_M',
      runtimeMode: 'ADOPTED_READ_ONLY'
    });
    const result = await production.performTurn({
      threadRef: fixture.ids.threadRef,
      channelRef: 'channel.g03.fixture',
      content: 'Can you carry the current context while deciding whether tools are needed?'
    });
    assert.equal(result.state, 'TURN_COMPLETED');
    assert.equal(result.content, 'Capability-aware current Memory reply.');
    assert.equal(model.calls.length, 2);
    assert.equal(result.capabilityRuntime.mode, 'ADOPTED_READ_ONLY');
    assert.equal(result.capabilityRuntime.toolRequestCount, 0);
    assert.equal(result.capabilityRuntime.inferenceCount, 2);
    assert.equal(result.promptContextMaterialization.memoryContextIncluded, true);
    assert.equal(result.promptContextMaterialization.providerBoundaryCurrentnessVerified, true);
    assert.equal(result.promptContextMaterialization.providerBoundarySourceBindingsVerified, true);
  } finally {
    await model.close();
    fs.rmSync(home.root, { recursive: true, force: true });
  }
});

test('Memory frontier drift invalidates an already-formed prompt-context selection before materialization', async () => {
  const fixture = createDailyMemoryDreamFixture('browser-prompt-memory-stale');
  const home = dailyFixtureHome(fixture);
  commitFixtureDailyMemory(fixture);
  try {
    const owner = runtime(home);
    const current = {
      threadRef: fixture.ids.threadRef,
      currentRequestEventRef: 'event.vexlife.request.memory-stale-check',
      currentRequestEventHash: '9'.repeat(64),
      currentRequestSequence: fixture.g01.head.sequence + 1,
      priorConversationHeadSha256: fixture.g01.head.conversationHeadSha256
    };
    const selected = await owner.promptContextResolver({ context: current, taskIntent: 'bounded current request' });
    assert.equal(selected.memoryContext.included, true);
    replaceFixtureActiveAuthorityWithoutScore(fixture, 'browser-prompt-context-stale');

    await assert.rejects(
      () => owner.promptContextAuthorityVerifier({
        schemaVersion: 'vexlife.prompt-context-authority-query/v2',
        phase: 'MATERIALIZE',
        lineageRef: home.companionLineageRef,
        threadRef: current.threadRef,
        priorConversationHeadSha256: current.priorConversationHeadSha256,
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
        taskIntent: 'cross-thread request',
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
    const selected = await owner.promptContextResolver({ context: current, taskIntent: 'bounded current request' });
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
    const selected = await owner.promptContextResolver({ context: current, taskIntent: 'bounded current request' });
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

test('zero remaining prompt headroom bounds Memory out without forming an invalid zero-cap packet', async () => {
  const home = makeHome('zero-memory-headroom');
  const model = await startModelServer(({ callIndex }) =>
    callIndex === 0 ? 'x'.repeat(800_000) : 'Current exact reply.');
  try {
    await firstTurn(home, model);
    const owner = runtime(home);
    const current = {
      threadRef: 'thread.vexlife.browser-prompt-context-runtime-test',
      currentRequestEventRef: 'event.vexlife.request.zero-memory-headroom',
      currentRequestEventHash: '7'.repeat(64),
      currentRequestSequence: 2,
      priorConversationHeadSha256: JSON.parse(fs.readFileSync(path.join(
        home.home,
        'conversations',
        home.companionLineageRef,
        'thread.vexlife.browser-prompt-context-runtime-test',
        'head.json'
      ), 'utf8')).conversationHeadSha256
    };
    const selected = await owner.promptContextResolver({
      context: current,
      taskIntent: 'Current request stays inside browser request admission.'
    });
    assert.equal(selected.memoryContext.included, false);
    assert.equal(selected.memoryContext.memoryTokenCap, 1);
    assert.equal(selected.memoryContext.estimatedSystemMessageTokens, 0);
  } finally {
    await model.close();
    fs.rmSync(home.root, { recursive: true, force: true });
  }
});

test('post-MATERIALIZE failure retains no selection beyond the finite lease TTL', async () => {
  const home = makeHome('materialization-failure-expiry');
  const model = await startModelServer(({ callIndex }) =>
    callIndex === 0 ? 'x'.repeat(800_000) : 'Current exact reply.');
  try {
    await firstTurn(home, model);
    const owner = runtime(home, { leaseTtlMs: 1_000 });
    await assert.rejects(
      () => bridge(home, model, owner, 'instance.vexlife.browser-prompt-context-budget-failure').performTurn({
        threadRef: 'thread.vexlife.browser-prompt-context-runtime-test',
        channelRef: 'channel.local-vex.companion',
        content: 'Current request stays inside browser request admission.'
      }),
      (error) => error instanceof BrowserCompanionBridgeError
        && error.code === 'CONTEXT_HASH_MISMATCH'
        && /materialized prompt exceeds the exact Context Lease input budget/u.test(error.internalCause ?? '')
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
    const firstSelection = await owner.promptContextResolver({ context: firstPending, taskIntent: 'first pending request' });
    await owner.promptContextResolver({ context: secondPending, taskIntent: 'second pending request' });
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
    assert.equal(await captured.promptContextResolver({ context: firstContext, taskIntent: 'identity baseline request' }), null);
    const homeManifestPath = path.join(home.home, 'config', 'home.json');
    const homeManifest = JSON.parse(fs.readFileSync(homeManifestPath, 'utf8'));
    fs.writeFileSync(homeManifestPath, `${JSON.stringify({
      ...homeManifest,
      homeRef: 'vex-home.browser-prompt-context-runtime-test.changed'
    }, null, 2)}\n`);
    assert.throws(
      () => captured.promptContextResolver({
        taskIntent: 'identity drift request',
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
  const rolloverEntry = promptRuntime.find(
    (entry) => entry.moduleRef === 'module.vexlife.core.continuity-rollover'
  );
  assert.ok(server);
  assert.ok(runtimeEntry);
  assert.ok(rolloverEntry);
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
  assert.equal(
    rolloverEntry.loadedBy.filter((entry) => entry === 'module.vexlife.script.serve-browser').length,
    1
  );
  assert.ok(rolloverEntry.tests.includes('test/continuity-rollover.test.mjs'));
  assert.ok(rolloverEntry.tests.includes('test/browser-companion-bridge.test.mjs'));
});

let v42bConversationSequence = 0;
function v42bConversationTurn(companion, input) {
  v42bConversationSequence += 1;
  return companion.performConversationTurn({
    ...input,
    projectRef: input.projectRef ?? 'project.self-development',
    idempotencyKey: input.idempotencyKey ?? `browser-prompt-v42b-${String(v42bConversationSequence).padStart(6, '0')}`,
    messageCreatedAt: input.messageCreatedAt ?? new Date(Date.UTC(2026, 9, 26, 22, 0, v42bConversationSequence)).toISOString(),
    originalLanguage: input.originalLanguage ?? 'en'
  });
}

test('committed rollover gives only the immediate next request a checkpoint-backed fresh Context Lease and later turns resume immediate-prior context', async () => {
  const home = makeHome('v42b-successor');
  const model = await startModelServer();
  const threadRef = 'thread.self-development.open-conversation';
  try {
    await v42bConversationTurn(bridge(home, model, null, 'instance.vexlife.browser-prompt-context-v42b-first'), {
      threadRef,
      channelRef: 'channel.self-development.companion',
      content: 'Turn zero raw pair.'
    });
    const ordinaryRuntime = runtime(home);
    const second = await v42bConversationTurn(bridge(home, model, ordinaryRuntime, 'instance.vexlife.browser-prompt-context-v42b-second'), {
      threadRef,
      channelRef: 'channel.self-development.companion',
      content: 'Turn one becomes the rollover predecessor.'
    });
    const pressureBase = projectResourceContextPressure({
      promptContextMaterialization: second.promptContextMaterialization,
      companionAvailability: null
    });
    const { pressureRef: _pressureRef, semanticFingerprint: _pressureFingerprint, ...pressureCore } = structuredClone(pressureBase);
    pressureCore.state = 'ROLLOVER_REQUIRED';
    pressureCore.reasonCodes = ['TEST_V4_ROLLOVER_REQUIRED'];
    const pressureFingerprint = semanticHash(pressureCore);
    const pressure = Object.freeze({
      ...pressureCore,
      pressureRef: `projection.vexlife.resource-context-pressure.${pressureFingerprint.slice(0, 32)}`,
      semanticFingerprint: pressureFingerprint
    });
    const plan = formContinuityRolloverPlan({
      resourceContextPressure: pressure,
      continuityStream: second.promptContextContinuityProjection
    });
    assert.equal(plan.state, 'ROLLOVER_READY');
    const continuityOwner = createBrowserWorkingContinuityOwner({
      home: home.home,
      homeRef: home.homeRef,
      deviceRef: home.deviceRef,
      companionLineageRef: home.companionLineageRef,
      instanceRef: 'instance.vexlife.browser-prompt-context-v42b-checkpoint'
    });
    const committed = continuityOwner.commitPlan({ plan });
    assert.equal(committed.commitReceipt.disposition, 'ROLLOVER_COMMITTED');

    const successorRuntime = runtime(home);
    const third = await v42bConversationTurn(bridge(home, model, successorRuntime, 'instance.vexlife.browser-prompt-context-v42b-third'), {
      threadRef,
      channelRef: 'channel.self-development.companion',
      content: 'Turn two should use the fresh successor Context Lease.'
    });
    assert.deepEqual(model.calls[2].body.messages, [
      { role: 'user', content: 'Turn two should use the fresh successor Context Lease.' }
    ]);
    assert.deepEqual(third.promptContextMaterialization.selectedConversationEventRefs, []);
    assert.equal(third.promptContextMaterialization.exactEventFileReadCount, 1);
    assert.equal(third.promptContextContinuityProjection.owners.context.checkpointReturnRef, committed.checkpoint.checkpointRef);
    assert.ok(third.promptContextContinuityProjection.owners.context.selectedSourceRefs.includes(committed.checkpoint.checkpointRef));
    assert.ok(third.promptContextContinuityProjection.owners.context.selectedSourceRefs.includes(committed.commitReceipt.commitReceiptRef));
    const successorState = continuityOwner.readSuccessorContext({ threadRef });
    assert.equal(successorState.state, 'ISSUED');
    assert.equal(successorState.issuanceReceipt.contextLeaseRef, third.promptContextMaterialization.contextLeaseRef);
    assert.equal(successorState.issuanceReceipt.contextLeaseFingerprint, third.promptContextMaterialization.contextLeaseFingerprint);

    const laterRuntime = runtime(home);
    const fourth = await v42bConversationTurn(bridge(home, model, laterRuntime, 'instance.vexlife.browser-prompt-context-v42b-fourth'), {
      threadRef,
      channelRef: 'channel.self-development.companion',
      content: 'Turn three should return to ordinary immediate-prior context.'
    });
    assert.deepEqual(model.calls[3].body.messages, [
      { role: 'user', content: 'Turn two should use the fresh successor Context Lease.' },
      { role: 'assistant', content: 'Current exact reply.' },
      { role: 'user', content: 'Turn three should return to ordinary immediate-prior context.' }
    ]);
    assert.equal(fourth.promptContextMaterialization.selectedConversationEventRefs.length, 2);
    assert.notEqual(fourth.promptContextContinuityProjection.owners.context.checkpointReturnRef, committed.checkpoint.checkpointRef);
  } finally {
    await model.close();
    fs.rmSync(home.root, { recursive: true, force: true });
  }
});

test('fresh prompt runtime reuses the same rollover claim and semantic successor lease for the same durable request', async () => {
  const home = makeHome('v42b-retry');
  const model = await startModelServer();
  const threadRef = 'thread.self-development.open-conversation';
  try {
    await v42bConversationTurn(bridge(home, model, null, 'instance.vexlife.browser-prompt-context-v42b-retry-first'), {
      threadRef,
      channelRef: 'channel.self-development.companion',
      content: 'Retry predecessor request.'
    });
    const ordinaryRuntime = runtime(home);
    const second = await v42bConversationTurn(bridge(home, model, ordinaryRuntime, 'instance.vexlife.browser-prompt-context-v42b-retry-second'), {
      threadRef,
      channelRef: 'channel.self-development.companion',
      content: 'Retry predecessor current request.'
    });
    const pressureBase = projectResourceContextPressure({ promptContextMaterialization: second.promptContextMaterialization, companionAvailability: null });
    const { pressureRef: _ref, semanticFingerprint: _fp, ...core } = structuredClone(pressureBase);
    core.state = 'ROLLOVER_REQUIRED'; core.reasonCodes = ['TEST_V4_ROLLOVER_REQUIRED'];
    const fp = semanticHash(core);
    const plan = formContinuityRolloverPlan({
      resourceContextPressure: Object.freeze({ ...core, pressureRef: `projection.vexlife.resource-context-pressure.${fp.slice(0, 32)}`, semanticFingerprint: fp }),
      continuityStream: second.promptContextContinuityProjection
    });
    const continuityOwner = createBrowserWorkingContinuityOwner({
      home: home.home, homeRef: home.homeRef, deviceRef: home.deviceRef,
      companionLineageRef: home.companionLineageRef,
      instanceRef: 'instance.vexlife.browser-prompt-context-v42b-retry-checkpoint'
    });
    continuityOwner.commitPlan({ plan });
    const current = {
      threadRef,
      currentRequestEventRef: 'event.vexlife.request.v42b-retry',
      currentRequestEventHash: 'd'.repeat(64),
      currentRequestSequence: 4,
      priorConversationHeadSha256: second.conversationHeadSha256
    };
    const firstRuntime = runtime(home);
    const selected1 = await firstRuntime.promptContextResolver({ context: current, taskIntent: 'Same durable rollover request.' });
    const secondRuntime = runtime(home);
    const selected2 = await secondRuntime.promptContextResolver({ context: current, taskIntent: 'Same durable rollover request.' });
    assert.equal(selected1.contextLease.leaseRef, selected2.contextLease.leaseRef);
    assert.equal(selected1.contextLease.semanticFingerprint, selected2.contextLease.semanticFingerprint);
    assert.deepEqual(selected1.selectedConversationEventRefs, []);
    assert.deepEqual(selected2.selectedConversationEventRefs, []);
    const successorState = continuityOwner.readSuccessorContext({ threadRef });
    assert.equal(successorState.state, 'ISSUED');
    assert.equal(successorState.successorClaim.currentRequestEventBinding.eventRef, current.currentRequestEventRef);
    assert.equal(successorState.issuanceReceipt.contextLeaseFingerprint, selected1.contextLease.semanticFingerprint);
  } finally {
    await model.close();
    fs.rmSync(home.root, { recursive: true, force: true });
  }
});


function v42cCheckpointPressure(materialization, label) {
  const base = projectResourceContextPressure({
    promptContextMaterialization: materialization,
    companionAvailability: null
  });
  const { pressureRef: _pressureRef, semanticFingerprint: _pressureFingerprint, ...core } = structuredClone(base);
  core.state = 'CHECKPOINT_RECOMMENDED';
  core.reasonCodes = [`TEST_V42C_CHECKPOINT_RECOMMENDED_${label}`];
  const semanticFingerprint = semanticHash(core);
  return Object.freeze({
    ...core,
    pressureRef: `projection.vexlife.resource-context-pressure.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

test('two adjacent checkpoint-pressure turns drive one checkpoint-backed successor and later return to immediate-prior context', async () => {
  const home = makeHome('v42c-reachability');
  const model = await startModelServer();
  const threadRef = 'thread.self-development.open-conversation';
  try {
    await v42bConversationTurn(bridge(home, model, null, 'instance.vexlife.browser-prompt-context-v42c-first'), {
      threadRef,
      channelRef: 'channel.self-development.companion',
      content: 'V4.2c turn zero raw pair.'
    });
    const second = await v42bConversationTurn(bridge(home, model, runtime(home), 'instance.vexlife.browser-prompt-context-v42c-second'), {
      threadRef,
      channelRef: 'channel.self-development.companion',
      content: 'V4.2c first checkpoint-pressure turn.'
    });
    const continuityOwner = createBrowserWorkingContinuityOwner({
      home: home.home,
      homeRef: home.homeRef,
      deviceRef: home.deviceRef,
      companionLineageRef: home.companionLineageRef,
      instanceRef: 'instance.vexlife.browser-prompt-context-v42c-checkpoint'
    });
    const firstPlan = formContinuityRolloverPlan({
      resourceContextPressure: v42cCheckpointPressure(second.promptContextMaterialization, 'FIRST'),
      continuityStream: second.promptContextContinuityProjection
    });
    assert.equal(firstPlan.state, 'CHECKPOINT_READY');
    const first = continuityOwner.commitPlan({ plan: firstPlan });
    assert.equal(first.commitReceipt.disposition, 'CHECKPOINT_COMMITTED');

    const third = await v42bConversationTurn(bridge(home, model, runtime(home), 'instance.vexlife.browser-prompt-context-v42c-third'), {
      threadRef,
      channelRef: 'channel.self-development.companion',
      content: 'V4.2c second adjacent checkpoint-pressure turn.'
    });
    assert.ok(third.promptContextContinuityProjection.owners.context.selectedSourceRefs.includes(first.checkpoint.workingSet.cursorEventRef));
    assert.equal(
      third.promptContextContinuityProjection.owners.context.schedulerGeneration,
      first.checkpoint.contextLease.schedulerGeneration + 2
    );
    const secondPlan = formContinuityRolloverPlan({
      resourceContextPressure: v42cCheckpointPressure(third.promptContextMaterialization, 'SECOND'),
      continuityStream: third.promptContextContinuityProjection,
      priorWorkingCheckpoint: first.checkpoint
    });
    assert.equal(secondPlan.state, 'ROLLOVER_READY');
    assert.equal(secondPlan.checkpoint.pressureState, 'CHECKPOINT_RECOMMENDED');
    const rollover = continuityOwner.commitPlan({ plan: secondPlan });
    assert.equal(rollover.commitReceipt.disposition, 'ROLLOVER_COMMITTED');
    assert.equal(rollover.commitReceipt.successorContextRequired, true);

    const successor = await v42bConversationTurn(bridge(home, model, runtime(home), 'instance.vexlife.browser-prompt-context-v42c-successor'), {
      threadRef,
      channelRef: 'channel.self-development.companion',
      content: 'V4.2c immediate successor request.'
    });
    assert.deepEqual(model.calls[3].body.messages, [
      { role: 'user', content: 'V4.2c immediate successor request.' }
    ]);
    assert.deepEqual(successor.promptContextMaterialization.selectedConversationEventRefs, []);
    assert.equal(successor.promptContextContinuityProjection.owners.context.checkpointReturnRef, rollover.checkpoint.checkpointRef);
    const successorState = continuityOwner.readSuccessorContext({ threadRef });
    assert.equal(successorState.state, 'ISSUED');
    assert.equal(successorState.issuanceReceipt.contextLeaseRef, successor.promptContextMaterialization.contextLeaseRef);

    const later = await v42bConversationTurn(bridge(home, model, runtime(home), 'instance.vexlife.browser-prompt-context-v42c-later'), {
      threadRef,
      channelRef: 'channel.self-development.companion',
      content: 'V4.2c later ordinary request.'
    });
    assert.deepEqual(model.calls[4].body.messages, [
      { role: 'user', content: 'V4.2c immediate successor request.' },
      { role: 'assistant', content: 'Current exact reply.' },
      { role: 'user', content: 'V4.2c later ordinary request.' }
    ]);
    assert.equal(later.promptContextMaterialization.selectedConversationEventRefs.length, 2);
    assert.notEqual(later.promptContextContinuityProjection.owners.context.checkpointReturnRef, rollover.checkpoint.checkpointRef);
  } finally {
    await model.close();
    fs.rmSync(home.root, { recursive: true, force: true });
  }
});

// [VXG RealForever]
