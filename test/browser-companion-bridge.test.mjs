import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BrowserCompanionBridgeError,
  createBrowserCompanionBridge,
  resolveBrowserCompanionRuntimeBinding,
  validateBrowserCompanionConversationCurrentnessRequest,
  validateBrowserCompanionConversationRequest,
  validateBrowserCompanionRequest
} from '../src/core/browser-companion-bridge.mjs';
import { initializeLivedCompanionHome } from '../src/core/lived-companion.mjs';
import { readConversationChannel, readConversationMessage } from '../src/core/conversation-store.mjs';
import { createContextLease } from '../src/core/context-lease.mjs';
import { createBrowserPromptContextRuntime } from '../src/core/browser-prompt-context-runtime.mjs';
import { formContinuityRolloverPlan } from '../src/core/continuity-rollover.mjs';
import { projectResourceContextPressure } from '../src/core/resource-context-pressure.mjs';
import { semanticHash } from '../src/core/utils.mjs';
import crypto from 'node:crypto';

import {
  createBrowserCompanionAdaptiveReveal
} from '../reference/browser/modules/chat-controller.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_TEMP_ROOT = fs.realpathSync.native(os.tmpdir());

async function startModelServer() {
  const calls = [];
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    calls.push({ path: request.url, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      model: 'Qwen3.5-4B-Q4_K_M',
      choices: [{ message: { content: 'Real local bridge reply.' } }]
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

function makeHome() {
  const root = fs.mkdtempSync(path.join(TEST_TEMP_ROOT, 'vexlife-browser-companion-'));
  const home = path.join(root, 'home');
  initializeLivedCompanionHome({
    home,
    homeRef: 'vex-home.browser-companion-test',
    familyRef: 'vex-family.browser-companion-test',
    deviceRef: 'device.vexlife.browser-companion-test',
    companionLineageRef: 'companion-lineage.vexlife.browser-companion-test'
  });
  return { root, home };
}

let browserSendSequence = 0;
function browserTurn(bridge, input) {
  browserSendSequence += 1;
  return bridge.performConversationTurn({
    ...input,
    projectRef: input.projectRef ?? 'project.self-development',
    threadRef: input.threadRef ?? 'thread.self-development.open-conversation',
    channelRef: input.channelRef ?? 'channel.self-development.companion',
    idempotencyKey: input.idempotencyKey ?? `browser-send.test-${String(browserSendSequence).padStart(6, '0')}`,
    messageCreatedAt: input.messageCreatedAt ?? new Date(Date.UTC(2026, 9, 19, 7, 0, browserSendSequence)).toISOString(),
    originalLanguage: input.originalLanguage ?? 'en'
  });
}

test('browser Companion adaptive reveal decouples provider arrival from paint and accelerates under backlog', async () => {
  let time = 0;
  const frames = [];
  const renders = [];
  const reveal = createBrowserCompanionAdaptiveReveal({
    render(content) { renders.push(content); },
    requestFrame(callback) { frames.push(callback); return frames.length; },
    cancelFrame() {},
    now: () => time,
    visible: () => true,
    reducedMotion: () => false
  });

  reveal.push('abcd');
  assert.equal(renders.length, 0);
  assert.equal(frames.length, 1);
  time = 16;
  frames.shift()(16);
  const initial = reveal.snapshot();
  assert.equal(initial.revealedUnits, 1);
  assert.ok(initial.revealedUnits < initial.receivedUnits);
  const initialAdvance = initial.revealedUnits;

  time = 32;
  frames.shift()(32);
  assert.equal(reveal.snapshot().revealedUnits, 2, 'steady arrival should advance gradually rather than drain the whole chunk');

  time = 36;
  reveal.push(' efghijklmnopqrstuvwxyz');
  time = 48;
  frames.shift()(48);
  const burst = reveal.snapshot();
  assert.ok(burst.revealedUnits - initial.revealedUnits > initialAdvance);
  assert.ok(burst.backlogUnits > 0);

  const finishPromise = reveal.finish();
  time = 64;
  frames.shift()(64);
  time = 80;
  frames.shift()(80);
  await finishPromise;
  assert.equal(reveal.snapshot().backlogUnits, 0);
  assert.equal(renders.at(-1), 'abcd efghijklmnopqrstuvwxyz');
});

test('browser Companion adaptive reveal flushes an already-scheduled frame when the surface becomes hidden', async () => {
  let hidden = false;
  const frames = [];
  const cancelled = [];
  const renders = [];
  const reveal = createBrowserCompanionAdaptiveReveal({
    render(content) { renders.push(content); },
    requestFrame(callback) { frames.push(callback); return frames.length; },
    cancelFrame(handle) { cancelled.push(handle); },
    now: () => 0,
    visible: () => !hidden,
    reducedMotion: () => false
  });
  reveal.push('abcd');
  assert.equal(frames.length, 1);
  hidden = true;
  await reveal.finish();
  assert.deepEqual(cancelled, [1]);
  assert.equal(reveal.snapshot().backlogUnits, 0);
  assert.equal(renders.at(-1), 'abcd');
});

test('browser Companion adaptive reveal bypasses animation for reduced motion', async () => {
  const frames = [];
  const renders = [];
  const reveal = createBrowserCompanionAdaptiveReveal({
    render(content) { renders.push(content); },
    requestFrame(callback) { frames.push(callback); return frames.length; },
    cancelFrame() {},
    now: () => 0,
    visible: () => true,
    reducedMotion: () => true
  });
  reveal.push('Immediate received text.');
  assert.deepEqual(renders, ['Immediate received text.']);
  assert.equal(frames.length, 0);
  await reveal.finish();
  assert.equal(reveal.snapshot().backlogUnits, 0);
});

test('browser source consumes provider deltas without waiting for paint and fast-drains before durable projection', () => {
  const source = fs.readFileSync(path.join(ROOT, 'reference/browser/modules/chat-controller.js'), 'utf8');
  assert.match(source, /companionStreamReveal = createBrowserCompanionAdaptiveReveal/u);
  assert.match(source, /renderCompanionWorkPlaceholder\(channel\);\s*const sendIdempotencyKey/u);
  assert.match(source, /onProgress\(progress\) \{\s*renderCompanionWorkProgress\(channel, progress\);\s*\}/u);
  assert.match(source, /onDelta\(delta\) \{\s*companionStreamReveal\.push\(delta\.contentDelta\);\s*\}/u);
  assert.doesNotMatch(source, /async\s+onDelta\(delta\)/u);
  assert.match(source, /await companionStreamReveal\.finish\(\);\s*clearCompanionStreamProgress\(channel\);/u);
});

test('browser companion runtime binding is server-side numeric loopback only', () => {
  assert.equal(resolveBrowserCompanionRuntimeBinding({}).state, 'UNBOUND');
  assert.equal(resolveBrowserCompanionRuntimeBinding({ endpoint: 'http://127.0.0.1:18080', model: 'Qwen3.5-4B-Q4_K_M' }).state, 'BOUND');
  assert.equal(resolveBrowserCompanionRuntimeBinding({ endpoint: 'http://localhost:18080', model: 'Qwen3.5-4B-Q4_K_M' }).state, 'MISCONFIGURED');
  assert.equal(resolveBrowserCompanionRuntimeBinding({ endpoint: 'https://127.0.0.1:18080', model: 'Qwen3.5-4B-Q4_K_M' }).state, 'MISCONFIGURED');
  assert.equal(resolveBrowserCompanionRuntimeBinding({ endpoint: 'http://127.0.0.1:18080?token=secret', model: 'Qwen3.5-4B-Q4_K_M' }).state, 'MISCONFIGURED');
});

test('browser request cannot inject endpoint, Home, runtime or authorization authority', () => {
  const admitted = {
    projectRef: 'project.self-development',
    threadRef: 'thread.self-development.open-conversation',
    channelRef: 'channel.self-development.companion',
    content: 'Hello Vex',
    idempotencyKey: 'browser-send.test-request-validation-001',
    messageCreatedAt: '2026-10-19T07:00:00.000Z',
    originalLanguage: 'en',
    screenRef: 'screen.vexlife.chat',
    selectedNodeRef: 'element.channel.companion'
  };
  assert.equal(validateBrowserCompanionConversationRequest(admitted).content, 'Hello Vex');
  assert.equal(validateBrowserCompanionConversationRequest({ ...admitted, semanticRelayInput: semanticRelayInput() }).semanticRelayInput.relayRef, 'relay.browser-companion-test');
  for (const extra of ['endpoint', 'home', 'runtimeExecutable', 'authorization']) {
    assert.throws(
      () => validateBrowserCompanionConversationRequest({ ...admitted, [extra]: 'forbidden' }),
      (error) => error instanceof BrowserCompanionBridgeError && error.code === 'COMPANION_REQUEST_NOT_ADMITTED'
    );
  }
});

test('Conversation currentness read admits only exact direct Companion identity and performs no effect', async () => {
  const request = {
    projectRef: 'project.self-development',
    threadRef: 'thread.self-development.open-conversation',
    channelRef: 'channel.self-development.companion'
  };
  assert.deepEqual(validateBrowserCompanionConversationCurrentnessRequest(request), request);
  assert.throws(
    () => validateBrowserCompanionConversationCurrentnessRequest({ ...request, content: 'must-not-enter-read' }),
    (error) => error instanceof BrowserCompanionBridgeError && error.code === 'COMPANION_CURRENTNESS_REQUEST_NOT_ADMITTED'
  );

  const { root, home } = makeHome();
  const model = await startModelServer();
  try {
    const bridge = createBrowserCompanionBridge({
      home,
      endpoint: model.endpoint,
      model: 'Qwen3.5-4B-Q4_K_M',
      instanceRef: 'instance.vexlife.browser-conversation-currentness'
    });
    const absent = bridge.conversationCurrentness(request);
    assert.equal(absent.state, 'ABSENT');
    assert.equal(absent.truthClass, 'CURRENT_LOCAL_CONVERSATION_IDENTITY');
    assert.equal(absent.canonicalConversationHeadSha256, null);
    assert.equal(absent.effectsPerformed, false);
    assert.equal(model.calls.length, 0);

    const turn = await browserTurn(bridge, {
      ...request,
      content: 'Bind one durable current head.'
    });
    const current = bridge.conversationCurrentness(request);
    assert.equal(current.state, 'CURRENT');
    assert.equal(current.projectRef, request.projectRef);
    assert.equal(current.threadRef, request.threadRef);
    assert.equal(current.channelRef, request.channelRef);
    assert.equal(current.canonicalConversationHeadSha256, turn.canonicalConversationHeadSha256);
    assert.equal(current.headMessageRefOrNull, turn.responseMessageRef);
    assert.equal(current.headSequenceOrNull, turn.companionMessageSequence);
    assert.equal(current.effectsPerformed, false);
    assert.equal(model.calls.length, 1);

    assert.throws(
      () => bridge.conversationCurrentness({ ...request, projectRef: 'project.local-vex' }),
      (error) => error instanceof BrowserCompanionBridgeError && error.code === 'COMPANION_CONVERSATION_BINDING_NOT_ADMITTED'
    );
  } finally {
    await model.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('generic runtime turn remains separate from durable Conversation Send while the product route stays strict', async () => {
  const generic = {
    threadRef: 'thread.vexlife.browser-runtime-compatibility',
    channelRef: 'channel.local-vex.runtime-compatibility',
    content: 'Exercise the reusable lower-level runtime seam.'
  };
  const admitted = validateBrowserCompanionRequest(generic);
  assert.equal(admitted.projectRef, null);
  assert.equal(admitted.threadRef, generic.threadRef);
  assert.throws(
    () => validateBrowserCompanionRequest({ ...generic, idempotencyKey: 'browser-send.must-not-enter-runtime' }),
    (error) => error instanceof BrowserCompanionBridgeError && error.code === 'COMPANION_REQUEST_NOT_ADMITTED'
  );

  const { root, home } = makeHome();
  const model = await startModelServer();
  try {
    const bridge = createBrowserCompanionBridge({
      home,
      endpoint: model.endpoint,
      model: 'Qwen3.5-4B-Q4_K_M',
      instanceRef: 'instance.vexlife.browser-runtime-compatibility'
    });
    const result = await bridge.performTurn(generic);
    assert.equal(result.state, 'TURN_COMPLETED');
    assert.match(result.requestEventRef, /^event\.vexlife\.request\./u);
    assert.match(result.responseMessageRef, /^message\.vexlife\.browser-companion\.response\./u);
    assert.equal(Object.hasOwn(result, 'sendState'), false);
    assert.equal(model.calls.length, 1);

    await assert.rejects(
      () => bridge.performConversationTurn(generic),
      (error) => error instanceof BrowserCompanionBridgeError && error.code === 'COMPANION_REQUEST_NOT_ADMITTED'
    );
  } finally {
    await model.close();
    fs.rmSync(root, { recursive: true, force: true });
  }

  const serverCore = fs.readFileSync(path.join(ROOT, 'scripts/serve-browser-core.mjs'), 'utf8');
  assert.match(serverCore, /companionBridge\.performConversationTurn\(input\)/u);
  assert.doesNotMatch(serverCore, /const result = await companionBridge\.performTurn\(input\)/u);
});


test('Conversation projection reads the exact durable direct Companion lineage without model or mutation effect', async () => {
  const request = {
    projectRef: 'project.self-development',
    threadRef: 'thread.self-development.open-conversation',
    channelRef: 'channel.self-development.companion'
  };
  const { root, home } = makeHome();
  const model = await startModelServer();
  try {
    const bridge = createBrowserCompanionBridge({
      home,
      endpoint: model.endpoint,
      model: 'Qwen3.5-4B-Q4_K_M',
      instanceRef: 'instance.vexlife.browser-conversation-projection'
    });
    const absent = bridge.conversationProjection(request);
    assert.equal(absent.state, 'ABSENT');
    assert.deepEqual(absent.messages, []);
    assert.equal(absent.effectsPerformed, false);
    assert.equal(model.calls.length, 0);

    const completed = await browserTurn(bridge, { ...request, content: 'Durable projection source message.' });
    assert.equal(completed.state, 'TURN_COMPLETED');
    assert.equal(model.calls.length, 1);

    const beforeReadCallCount = model.calls.length;
    const projection = bridge.conversationProjection(request);
    assert.equal(projection.state, 'CURRENT');
    assert.equal(projection.truthClass, 'CURRENT_LOCAL_CONVERSATION_PROJECTION');
    assert.equal(projection.messages.length, 2);
    assert.deepEqual(projection.messages.map((message) => message.speakerRole), ['VICTOR', 'COMPANION']);
    assert.deepEqual(projection.messages.map((message) => message.sequence), [0, 1]);
    assert.equal(projection.messages[0].content, 'Durable projection source message.');
    assert.equal(projection.messages[1].content, 'Real local bridge reply.');
    assert.equal(projection.headMessageRefOrNull, projection.messages[1].messageRef);
    assert.equal(projection.headSequenceOrNull, projection.messages[1].sequence);
    assert.match(projection.canonicalConversationHeadSha256, /^[0-9a-f]{64}$/u);
    assert.equal(projection.effectsPerformed, false);
    assert.equal(projection.truncated, false);
    assert.equal(model.calls.length, beforeReadCallCount);
  } finally {
    await model.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unbound browser companion fails closed without synthetic output', async () => {
  const { root, home } = makeHome();
  try {
    const bridge = createBrowserCompanionBridge({ home });
    assert.equal(bridge.status().state, 'UNBOUND');
    await assert.rejects(
      () => browserTurn(bridge, {
        threadRef: 'thread.self-development.open-conversation',
        channelRef: 'channel.self-development.companion',
        content: 'This must not fabricate a reply.'
      }),
      (error) => error instanceof BrowserCompanionBridgeError && error.code === 'COMPANION_RUNTIME_UNBOUND'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('browser companion delegates the visible turn to G01 and persists its exact head', async () => {
  const { root, home } = makeHome();
  const model = await startModelServer();
  try {
    const bridge = createBrowserCompanionBridge({
      home,
      endpoint: model.endpoint,
      model: 'Qwen3.5-4B-Q4_K_M',
      instanceRef: 'instance.vexlife.browser-companion-test'
    });
    assert.equal(bridge.status().state, 'BOUND');
    const result = await browserTurn(bridge, {
      projectRef: 'project.self-development',
      threadRef: 'thread.self-development.open-conversation',
      channelRef: 'channel.self-development.companion',
      content: 'Show me one real local reply.',
      screenRef: 'screen.vexlife.chat',
      selectedNodeRef: 'element.channel.companion'
    });
    assert.equal(result.state, 'TURN_COMPLETED');
    assert.equal(result.truthClass, 'CURRENT_LOCAL_MODEL');
    assert.equal(result.content, 'Real local bridge reply.');
    assert.equal(result.actualHttpCall, true);
    assert.equal(result.loopbackOnly, true);
    assert.equal(result.writerLeaseReleased, true);
    assert.match(result.conversationHeadSha256, /^[a-f0-9]{64}$/u);
    assert.match(result.requestEventRef, /^event\.vexlife\.request\./u);
    assert.match(result.requestEventSha256, /^[a-f0-9]{64}$/u);
    assert.match(result.responseEventRef, /^event\.vexlife\.response\./u);
    assert.match(result.responseEventSha256, /^[a-f0-9]{64}$/u);
    assert.equal(model.calls.length, 1);
    assert.equal(model.calls[0].path, '/v1/chat/completions');
    assert.equal(model.calls[0].body.model, 'Qwen3.5-4B-Q4_K_M');

    const headPath = path.join(
      home,
      'conversations',
      'companion-lineage.vexlife.browser-companion-test',
      'thread.self-development.open-conversation',
      'head.json'
    );
    const head = JSON.parse(fs.readFileSync(headPath, 'utf8'));
    assert.equal(head.conversationHeadSha256, result.conversationHeadSha256);
    assert.equal(head.threadRef, 'thread.self-development.open-conversation');
  } finally {
    await model.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('browser source never routes companion channel through simulatedReply', () => {
  const chat = fs.readFileSync(path.join(ROOT, 'reference/browser/modules/chat-controller.js'), 'utf8');
  const birth = fs.readFileSync(path.join(ROOT, 'reference/browser/modules/vex-birth-lab-controller.js'), 'utf8');
  const serverEntry = fs.readFileSync(path.join(ROOT, 'scripts/serve-browser.mjs'), 'utf8');
  const serverCore = fs.readFileSync(path.join(ROOT, 'scripts/serve-browser-core.mjs'), 'utf8');
  const server = `${serverEntry}\n${serverCore}`;
  assert.match(chat, /channel\.roleKey === 'companion'[\s\S]*requestRealCompanionReply/u);
  assert.match(chat, /simulatedReply\(channel, frameAtSend\)[\s\S]*channel\.roleKey === 'companion'\) return false/u);
  assert.match(chat, /fetch\(BROWSER_COMPANION_STREAM_API_PATH/u);
  assert.match(chat, /EPHEMERAL_LOCAL_MODEL_PROGRESS/u);
  assert.match(server, /BROWSER_COMPANION_STREAM_API_PATH/u);
  assert.match(server, /application\/x-ndjson/u);
  assert.match(server, /frameType, sequence, payload/u);
  assert.match(server, /writeCompanionStreamFrame\(response, 'PROGRESS'/u);
  assert.match(chat, /hiddenReasoningIncluded !== false/u);
  assert.match(chat, /companion-work-sparkle/u);
  assert.match(chat, /companion-work-live-trace/u);
  assert.match(chat, /&lt;Thinking&gt;/u);
  assert.match(chat, /View work trace/u);
  assert.match(chat, /renderCompanionFailureDisclosure/u);
  assert.match(chat, /companionFailure = Object\.freeze/u);
  assert.match(chat, /body\.failureCode/u);
  assert.match(chat, /Vex could not complete this response\./u);
  assert.match(chat, /const interfaceCurrentnessMatchesChannel = \(channel = currentChannel\(\)\) => Boolean/u);
  assert.match(chat, /interfaceCurrentness\.scope\?\.projectRef === channel\.projectRef[\s\S]*interfaceCurrentness\.scope\?\.threadRef === channel\.threadRef[\s\S]*interfaceCurrentness\.scope\?\.channelRef === channel\.channelRef/u);
  assert.match(chat, /channel\?\.roleKey === 'companion'[\s\S]*interfaceCurrentnessMatchesChannel\(channel\) && !companionTurnPending[\s\S]*isVexAvailable\(\)/u);
  assert.doesNotMatch(chat, /if \(currentChannel\(\)\?\.roleKey === 'companion'\) void refreshCompanionAvailability\(\);\s+return \{/u);
  const selectThreadSource = chat.slice(chat.indexOf('function selectThread'), chat.indexOf('function renderChannels'));
  assert.doesNotMatch(selectThreadSource, /refreshCompanionAvailability\(\)/u);
  const selectChannelSource = chat.slice(chat.indexOf('function selectChannel'), chat.indexOf('function renderPresence'));
  assert.doesNotMatch(selectChannelSource, /refreshCompanionAvailability\(\)/u);
  assert.doesNotMatch(chat, /channel\.roleKey === 'companion' && !channelIsAvailable\(channel\) && !companionTurnPending[\s\S]*await refreshCompanionAvailability\(\);/u);
  assert.match(selectThreadSource, /requestInterfaceObservation\('conversation-scope-change'\)/u);
  assert.match(selectChannelSource, /requestInterfaceObservation\('conversation-scope-change'\)/u);
  assert.match(chat, /const submitAvailable = slashCandidate \|\| \(channel\.roleKey === 'companion' \? available && !companionTurnPending : available\);/u);
  assert.doesNotMatch(birth, /controller\.refreshStatus\(\);\s+return controller;/u);
  assert.match(birth, /function open\(\)[\s\S]*refreshStatus\(\);/u);
  assert.doesNotMatch(chat, /endpoint\s*:/u);
  assert.match(server, /VEXLIFE_COMPANION_ENDPOINT/u);
  assert.match(server, /createBrowserCompanionBridge/u);
});

test('Health consumes canonical Companion availability only on explicit Health open or refresh', () => {
  const app = fs.readFileSync(path.join(ROOT, 'reference/browser/app.js'), 'utf8');
  assert.match(app, /BROWSER_COMPANION_AVAILABILITY_PATH[\s\S]*normalizeBrowserCompanionAvailability/u);

  const refreshStart = app.indexOf('async function refreshHealthCompanionAvailability');
  const openStart = app.indexOf('async function openHealth');
  const renderStart = app.indexOf('function renderHealth');
  const setWorkspaceStart = app.indexOf('function setWorkspaceOpen');
  assert.ok(refreshStart >= 0 && openStart > refreshStart && renderStart > openStart && setWorkspaceStart > renderStart);

  const refreshSource = app.slice(refreshStart, openStart);
  assert.match(refreshSource, /fetch\(BROWSER_COMPANION_AVAILABILITY_PATH,\{method:'GET',cache:'no-store'\}\)/u);
  assert.equal((refreshSource.match(/fetch\(/gu) ?? []).length, 1);
  assert.match(refreshSource, /healthCompanionAvailability=null;[\s\S]*healthCompanionAvailabilityReadState='LOADING'/u);
  assert.match(refreshSource, /normalizeBrowserCompanionAvailability\(await response\.json\(\)\)/u);
  assert.match(refreshSource, /COMPANION_AVAILABILITY_INVALID/u);
  assert.doesNotMatch(refreshSource, /\/api\/v1\/companion\/status/u);
  assert.doesNotMatch(refreshSource, /\/api\/v1\/companion\/recovery/u);
  assert.doesNotMatch(refreshSource, /method:'POST'/u);

  const openSource = app.slice(openStart, renderStart);
  assert.match(openSource, /openContext\('health'\)/u);
  assert.match(openSource, /await refreshHealthCompanionAvailability\(\)/u);

  const renderSource = app.slice(renderStart, setWorkspaceStart);
  for (const field of [
    'availabilityState',
    'bindingState',
    'modelRefOrNull',
    'generationRefOrNull',
    'runtimeOwnershipState',
    'runtimeState',
    'qualificationState',
    'recoveryClass',
    'reasonCode',
    'runtimeAdapterRef',
    'runtimeObservationRef'
  ]) {
    assert.match(renderSource, new RegExp(field));
  }
  assert.match(renderSource, /companionAvailability:availability/u);
  assert.match(renderSource, /executed:false/u);
  assert.doesNotMatch(renderSource, /modelReceipt:\{state:'UNAVAILABLE',executed:false,currentness:'UNKNOWN'\}/u);

  assert.match(app, /#openHealth'\)\.addEventListener\('click',[\s\S]*routeCurrentSurface\('surface\.vexlife\.health',\(\)=>void openHealth\(\)\)/u);
  assert.match(app, /action==='health'\)void openHealth\(\)/u);
  assert.match(app, /vexlife:open-context'[\s\S]*context==='health'\)void openHealth\(\)/u);

  const bootstrapStart = app.indexOf('chat.renderProjectRail();chat.renderChannels();');
  const globalExportStart = app.indexOf('globalThis.__VEXLIFE_APP__=');
  assert.ok(bootstrapStart >= 0 && globalExportStart > bootstrapStart);
  const bootstrapSource = app.slice(bootstrapStart, globalExportStart);
  assert.doesNotMatch(bootstrapSource, /refreshHealthCompanionAvailability\(\)/u);

  assert.match(app, /openHealth,refreshHealthCompanionAvailability,healthCompanionAvailability:healthCompanionAvailabilitySnapshot/u);
});

function semanticRelayInput(overrides = {}) {
  return {
    relayRef: 'relay.browser-companion-test',
    sourceLanguageRef: 'language.en',
    sourceLocaleRef: 'locale.en-US',
    preferredConversationLanguageRef: 'language.en',
    requestedResponseLanguageRef: 'language.ja',
    uiLocaleRef: 'locale.en-US',
    originatorRef: 'person.local-user',
    originatorKind: 'HUMAN',
    onBehalfOfOriginator: true,
    materiality: 'MATERIAL',
    ambiguityState: 'AMBIGUOUS',
    recipientRefs: ['role.vex.companion'],
    intentRefs: ['intent.browser-companion-test'],
    canonicalMeaningRefs: ['meaning.browser-companion-test'],
    interpretationProjectionRef: 'projection.interpretation.browser-companion-test',
    interpretationState: 'CANDIDATE',
    boundaryClassRef: 'boundary.browser-companion-test',
    sourceRefs: ['source.browser-companion-test'],
    evidenceRefs: ['evidence.browser-companion-test'],
    authorityRefs: ['authority.browser-companion-test'],
    targets: [{
      recipientRef: 'role.vex.companion',
      recipientPreferredLanguageRef: 'language.ja',
      targetLanguageRef: 'language.ja',
      targetAudienceRef: 'audience.local-vex',
      runtimeCapability: {
        capabilityRef: 'capability.runtime.multilingual.browser-companion-test',
        currentnessState: 'CURRENT',
        multilingualOutput: true,
        supportedLanguageRefs: ['language.en', 'language.ja'],
        evidenceRefs: ['evidence.runtime.multilingual.current.browser-companion-test']
      },
      localeQualityState: 'ADMITTED',
      terminologyState: 'ADMITTED',
      authorityState: 'ADMITTED',
      localizationReadinessState: 'TRANSLATION_READY',
      humanReviewAvailable: false,
      deliveryState: 'NOT_DELIVERED',
      acknowledgementState: 'NOT_REQUESTED',
      understandingState: 'NOT_ASSESSED',
      equivalenceReceipt: {
        canonicalMeaningRefs: ['meaning.browser-companion-test'],
        intentRefs: ['intent.browser-companion-test'],
        sourceRefs: ['source.browser-companion-test'],
        evidenceRefs: ['evidence.browser-companion-test'],
        boundaryClassRef: 'boundary.browser-companion-test'
      }
    }],
    ...overrides
  };
}

test('material browser semantic relay holds before model or durable message effect until originating human confirms', async () => {
  const { root, home } = makeHome();
  const model = await startModelServer();
  try {
    const bridge = createBrowserCompanionBridge({ home, endpoint: model.endpoint, model: 'Qwen3.5-4B-Q4_K_M', instanceRef: 'instance.vexlife.browser-companion-relay-test' });
    const attention = await browserTurn(bridge, {
      threadRef: 'thread.self-development.open-conversation',
      channelRef: 'channel.self-development.companion',
      content: 'Do not send until I confirm the meaning.',
      semanticRelayInput: semanticRelayInput()
    });
    assert.equal(attention.state, 'CONFIRMATION_REQUIRED');
    assert.equal(attention.truthClass, 'CURRENT_SEMANTIC_RELAY_ATTENTION');
    assert.equal(attention.rawTextIncluded, false);
    assert.deepEqual(attention.requiredActions, ['CONFIRM', 'CORRECT', 'HOLD']);
    assert.equal(model.calls.length, 0);
    const headPath = path.join(home, 'conversations', 'companion-lineage.vexlife.browser-companion-test', 'thread.self-development.open-conversation', 'head.json');
    assert.equal(fs.existsSync(headPath), false);
  } finally {
    await model.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('originating-human CONFIRM persists the exact reference-only relay and still uses the real G01 path', async () => {
  const { root, home } = makeHome();
  const model = await startModelServer();
  try {
    const bridge = createBrowserCompanionBridge({ home, endpoint: model.endpoint, model: 'Qwen3.5-4B-Q4_K_M', instanceRef: 'instance.vexlife.browser-companion-relay-confirm-test' });
    const result = await browserTurn(bridge, {
      threadRef: 'thread.self-development.open-conversation',
      channelRef: 'channel.self-development.companion',
      content: 'Confirmed source content remains canonical.',
      semanticRelayInput: semanticRelayInput(),
      semanticRelayAction: 'CONFIRM'
    });
    assert.equal(result.state, 'TURN_COMPLETED');
    assert.equal(result.requestSemanticRelay.interpretationState, 'CONFIRMED');
    assert.equal(result.requestSemanticRelay.confirmedByRef, 'person.local-user');
    assert.equal(result.requestSemanticRelay.sourceLanguageRef, 'language.en');
    assert.equal(result.requestSemanticRelay.requestedResponseLanguageRef, 'language.ja');
    assert.equal(result.requestSemanticRelay.uiLocaleRef, 'locale.en-US');
    assert.equal(result.requestSemanticRelay.targets[0].projectionMode, 'MODEL_NATIVE');
    assert.equal(result.requestSemanticRelay.targets[0].runtimeCapability.currentnessState, 'CURRENT');
    assert.equal(result.responseSemanticRelay, null);
    assert.equal(model.calls.length, 1);
    assert.equal(model.calls[0].body.messages[0].content, 'Confirmed source content remains canonical.');
    const eventsRoot = path.join(home, 'conversations', 'companion-lineage.vexlife.browser-companion-test', 'thread.self-development.open-conversation', 'events');
    const events = fs.readdirSync(eventsRoot).sort().map((name) => JSON.parse(fs.readFileSync(path.join(eventsRoot, name), 'utf8')));
    assert.equal(events[0].content, 'Confirmed source content remains canonical.');
    assert.equal(events[0].semanticRelay.relayRef, 'relay.browser-companion-test');
    assert.equal(Object.hasOwn(events[0].semanticRelay, 'rawText'), false);
  } finally {
    await model.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('browser semantic relay rejects raw-text metadata before endpoint or durable message effect', async () => {
  const { root, home } = makeHome();
  const model = await startModelServer();
  try {
    const bridge = createBrowserCompanionBridge({ home, endpoint: model.endpoint, model: 'Qwen3.5-4B-Q4_K_M', instanceRef: 'instance.vexlife.browser-companion-relay-invalid-test' });
    await assert.rejects(
      () => browserTurn(bridge, {
        threadRef: 'thread.self-development.open-conversation',
        channelRef: 'channel.self-development.companion',
        content: 'This source stays outside relay metadata.',
        semanticRelayInput: semanticRelayInput({ rawText: 'forbidden duplicate' })
      }),
      (error) => error instanceof BrowserCompanionBridgeError && error.code === 'COMPANION_SEMANTIC_RELAY_INVALID'
    );
    assert.equal(model.calls.length, 0);
  } finally {
    await model.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('originating-human CORRECT mints a distinct server-side interpretation projection and preserves supersession lineage', async () => {
  const { root, home } = makeHome();
  const model = await startModelServer();
  try {
    const bridge = createBrowserCompanionBridge({ home, endpoint: model.endpoint, model: 'Qwen3.5-4B-Q4_K_M', instanceRef: 'instance.vexlife.browser-companion-relay-correct-test' });
    const priorProjectionRef = 'projection.interpretation.browser-companion-test';
    const result = await browserTurn(bridge, {
      threadRef: 'thread.self-development.open-conversation',
      channelRef: 'channel.self-development.companion',
      content: 'Corrected source content remains canonical.',
      semanticRelayInput: semanticRelayInput({ interpretationProjectionRef: priorProjectionRef }),
      semanticRelayAction: 'CORRECT'
    });
    assert.equal(result.state, 'TURN_COMPLETED');
    assert.equal(result.requestSemanticRelay.interpretationState, 'CORRECTED');
    assert.equal(result.requestSemanticRelay.supersedesInterpretationProjectionRef, priorProjectionRef);
    assert.notEqual(result.requestSemanticRelay.interpretationProjectionRef, priorProjectionRef);
    assert.match(result.requestSemanticRelay.interpretationProjectionRef, /^projection\.interpretation\.browser-correction\.[0-9a-f-]{36}$/u);
    assert.equal(result.requestSemanticRelay.confirmedByRef, 'person.local-user');
    assert.equal(model.calls.length, 1);
    assert.equal(model.calls[0].body.messages[0].content, 'Corrected source content remains canonical.');
    const eventsRoot = path.join(home, 'conversations', 'companion-lineage.vexlife.browser-companion-test', 'thread.self-development.open-conversation', 'events');
    const events = fs.readdirSync(eventsRoot).sort().map((name) => JSON.parse(fs.readFileSync(path.join(eventsRoot, name), 'utf8')));
    assert.equal(events[0].content, 'Corrected source content remains canonical.');
    assert.equal(events[0].semanticRelay.interpretationState, 'CORRECTED');
    assert.equal(events[0].semanticRelay.supersedesInterpretationProjectionRef, priorProjectionRef);
    assert.equal(Object.hasOwn(events[0].semanticRelay, 'rawText'), false);
  } finally {
    await model.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function browserPromptContextLease(selectedSourceRefs) {
  const now=Date.now();
  return createContextLease({
    leaseRef:`lease.browser-prompt-context.${crypto.randomUUID()}`, workerRef:'worker.browser-prompt-context.test', workNodeRef:'work-node.browser-prompt-context.test',
    graphFingerprint:'1'.repeat(64), trustSnapshotFingerprint:'2'.repeat(64), runtimeSnapshotFingerprint:'3'.repeat(64), schedulerGeneration:1,
    resourceLeaseFingerprint:'4'.repeat(64), capabilityLeaseFingerprint:'5'.repeat(64), effectLeaseFingerprint:'6'.repeat(64), cancellationTokenRef:'cancel.browser-prompt-context.test',
    foundationKernelRef:'foundation.browser-prompt-context.test', roleFrameRef:'role-frame.browser-prompt-context.test', intentFrameRef:'intent-frame.browser-prompt-context.test',
    selectedAtlasRefs:[], selectedSourceRefs, applicableCultureRefs:[], applicableLessonRefs:[], applicableReleaseRefs:[], inputTokenEstimate:2048, reservedOutputTokens:512, hardTokenLimit:4096,
    formedAt:new Date(now-1000).toISOString(), expiresAt:new Date(now+600000).toISOString(), observedAt:new Date(now).toISOString(), currentness:'CURRENT', lifecycle:'ACTIVE', checkpointReturnRef:'checkpoint.browser-prompt-context.test'
  }).lease;
}
function browserPromptContinuity(lineageRef,threadRef,lease){
  const core={schemaVersion:'vexlife.continuity-stream-adapter-projection/v1',currentness:'CURRENT',currentnessReasonRefs:[],portableFrame:{sourceRefs:[]},owners:{context:{leaseRef:lease.leaseRef,semanticFingerprint:lease.semanticFingerprint,currentness:'CURRENT',lifecycle:'ACTIVE'}},current:{lineageRef,threadRef,cursorEventRef:'event.cursor.browser-prompt',frameRef:'frame.browser-prompt',frameFingerprint:`sha256:${'7'.repeat(64)}`,activeWorkNodeRefs:[],currentIntentReceiptRefs:[],openLoopRefs:[],currentStatementRefs:[],currentContinuityRecordRefs:[],currentDailyStratumRefOrNull:null,recoveryPhaseOrNull:null},sourceRefs:[],effects:{homeMutated:false,memoryPromoted:false,scoreAppended:false,intentTransitioned:false,contextLeaseCreated:false,continuityAcceptanceCreated:false,recoveryActionApplied:false,dailyDreamCommitted:false,journalRewritten:false,providerCalled:false,networkCalled:false,publicationPerformed:false,modelCalled:false,trainingRan:false,modelWeightsChanged:false,relationshipMutated:false,externalDisclosure:false},projectionTruth:{readOnly:true,ownerMutationPerformed:false,rawTranscriptIncluded:false,hiddenReasoningIncluded:false,rawPrivatePayloadIncluded:false,semanticAcceptanceCreated:false,memoryPromotionPerformed:false,recoveryActionPerformed:false,externalEffectPerformed:false}};
  const semanticFingerprint=semanticHash(core);return {...core,adapterProjectionRef:`projection.vexlife.continuity-stream-adapter.${semanticFingerprint.slice(0,32)}`,semanticFingerprint};
}

function browserPromptSelectedBinding(home, lineageRef, threadRef, eventRef) {
  const eventsRoot = path.join(home, 'conversations', lineageRef, threadRef, 'events');
  const event = fs.readdirSync(eventsRoot).sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(eventsRoot, name), 'utf8')))
    .find((candidate) => candidate.eventRef === eventRef);
  if (!event) throw new Error(`browser prompt test event missing ${eventRef}`);
  const headsRoot = path.join(home, 'conversations', lineageRef, threadRef, 'heads');
  for (const name of fs.readdirSync(headsRoot).sort()) {
    const head = JSON.parse(fs.readFileSync(path.join(headsRoot, name), 'utf8'));
    const context = JSON.parse(fs.readFileSync(path.join(home, ...head.contextPath.split('/')), 'utf8'));
    if (context.requestEventHash === event.eventHash || context.responseEventHash === event.eventHash) {
      return {
        eventRef: event.eventRef,
        eventHash: event.eventHash,
        sequence: event.sequence,
        completedHeadSha256: head.conversationHeadSha256
      };
    }
  }
  throw new Error(`browser prompt test completed head missing ${eventRef}`);
}

function browserPromptAuthority(home, lineageRef, threadRef, lease, continuityProjection, query) {
  return {
    schemaVersion: 'vexlife.prompt-context-owner-currentness-witness/v2',
    phase: query.phase,
    authorityRef: 'authority.browser-prompt-context.test',
    contextLeaseFingerprint: lease.semanticFingerprint,
    contextLeaseRef: lease.leaseRef,
    continuityProjectionFingerprint: continuityProjection.semanticFingerprint,
    continuityProjectionRef: continuityProjection.adapterProjectionRef,
    currentRequestEventBinding: {
      eventRef: query.currentRequestEventRef,
      eventHash: query.currentRequestEventHash,
      sequence: query.currentRequestSequence
    },
    currentness: 'CURRENT',
    lifecycle: 'ACTIVE',
    lineageRef,
    materializationReceiptFingerprintOrNull: query.materializationReceiptFingerprintOrNull,
    materializationReceiptRefOrNull: query.materializationReceiptRefOrNull,
    observedAt: new Date().toISOString(),
    priorConversationHeadSha256: query.priorConversationHeadSha256,
    runtimeSnapshotFingerprint: lease.runtimeSnapshotFingerprint,
    schedulerGeneration: lease.schedulerGeneration,
    selectedEventBindings: query.selectedConversationEventRefs.map((eventRef) =>
      browserPromptSelectedBinding(home, lineageRef, threadRef, eventRef)),
    threadRef
  };
}


test('browser prompt-context resolver materializes selected lived events into the actual loopback messages request', async () => {
  const {root,home}=makeHome(); const model=await startModelServer(); const threadRef='thread.self-development.open-conversation';
  try {
    const firstBridge=createBrowserCompanionBridge({home,endpoint:model.endpoint,model:'Qwen3.5-4B-Q4_K_M',instanceRef:'instance.vexlife.browser-prompt-first'});
    await browserTurn(firstBridge, {threadRef,channelRef:'channel.self-development.companion',content:'Remember cobalt lantern.'});
    const eventsRoot=path.join(home,'conversations','companion-lineage.vexlife.browser-companion-test',threadRef,'events');
    const priorEvents=fs.readdirSync(eventsRoot).sort().map(name=>JSON.parse(fs.readFileSync(path.join(eventsRoot,name),'utf8')));
    const selectedRefs=priorEvents.map(event=>event.eventRef); const lease=browserPromptContextLease(selectedRefs); const continuityProjection=browserPromptContinuity('companion-lineage.vexlife.browser-companion-test',threadRef,lease);
    const bridge=createBrowserCompanionBridge({home,endpoint:model.endpoint,model:'Qwen3.5-4B-Q4_K_M',instanceRef:'instance.vexlife.browser-prompt-second',promptContextResolver:async()=>({contextLease:lease,continuityProjection,selectedConversationEventRefs:selectedRefs}),promptContextAuthorityVerifier:async(query)=>browserPromptAuthority(home,'companion-lineage.vexlife.browser-companion-test',threadRef,lease,continuityProjection,query)});
    const result=await browserTurn(bridge, {threadRef,channelRef:'channel.self-development.companion',content:'What phrase did I ask you to remember?'});
    assert.deepEqual(model.calls.at(-1).body.messages,[{role:'user',content:'Remember cobalt lantern.'},{role:'assistant',content:'Real local bridge reply.'},{role:'user',content:'What phrase did I ask you to remember?'}]);
    assert.equal(result.promptContextMaterialization.currentRequestIncludedExactlyOnce,true);
    assert.equal(result.promptContextMaterialization.exactMessagesSha256,semanticHash(model.calls.at(-1).body.messages));
    assert.equal(result.promptContextMaterialization.providerBoundaryCurrentnessVerified,true);
    assert.equal(result.promptContextMaterialization.providerBoundarySourceBindingsVerified,true);
    assert.deepEqual(result.promptContextContinuityProjection, continuityProjection);
    assert.equal(Object.prototype.propertyIsEnumerable.call(result, 'promptContextContinuityProjection'), false);
    assert.equal(JSON.stringify(result).includes('promptContextContinuityProjection'), false);
    assert.equal(result.promptContextMaterialization.continuityProjectionRef, result.promptContextContinuityProjection.adapterProjectionRef);
    assert.equal(result.promptContextMaterialization.continuityProjectionFingerprint, result.promptContextContinuityProjection.semanticFingerprint);
  } finally {await model.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('browser context wrapper leaves differently-shaped Home School internal inference prompts separately governed', async () => {
  const {root,home}=makeHome(); const model=await startModelServer(); const threadRef='thread.self-development.open-conversation';
  try {
    const firstBridge=createBrowserCompanionBridge({home,endpoint:model.endpoint,model:'Qwen3.5-4B-Q4_K_M',instanceRef:'instance.vexlife.browser-prompt-governed-first'});
    await browserTurn(firstBridge, {threadRef,channelRef:'channel.self-development.companion',content:'Prior exact context.'});
    const eventsRoot=path.join(home,'conversations','companion-lineage.vexlife.browser-companion-test',threadRef,'events');
    const selectedRefs=fs.readdirSync(eventsRoot).sort().map(name=>JSON.parse(fs.readFileSync(path.join(eventsRoot,name),'utf8')).eventRef); const lease=browserPromptContextLease(selectedRefs); const continuityProjection=browserPromptContinuity('companion-lineage.vexlife.browser-companion-test',threadRef,lease);
    const capabilityRuntime={resolveTurn:async({inference,endpointProfile,taskIntent,inMemoryAuthorization,timeoutMs})=>{await inference({endpointProfile,requestContent:'HOME_SCHOOL_INTERNAL_PROMPT',inMemoryAuthorization,timeoutMs});const response=await inference({endpointProfile,requestContent:taskIntent,inMemoryAuthorization,timeoutMs});return {response,actualHttpCall:true,contextSourceRefs:[],runtimeProjection:{schemaVersion:'test.home-school-separated/v1'}};}};
    const bridge=createBrowserCompanionBridge({home,endpoint:model.endpoint,model:'Qwen3.5-4B-Q4_K_M',instanceRef:'instance.vexlife.browser-prompt-governed-second',capabilityRuntime,promptContextResolver:async()=>({contextLease:lease,continuityProjection,selectedConversationEventRefs:selectedRefs}),promptContextAuthorityVerifier:async(query)=>browserPromptAuthority(home,'companion-lineage.vexlife.browser-companion-test',threadRef,lease,continuityProjection,query)});
    const before=model.calls.length; await browserTurn(bridge, {threadRef,channelRef:'channel.self-development.companion',content:'Current exact human request.'}); const calls=model.calls.slice(before);
    assert.deepEqual(calls[0].body.messages,[{role:'user',content:'HOME_SCHOOL_INTERNAL_PROMPT'}]);
    assert.deepEqual(calls[1].body.messages,[{role:'user',content:'Prior exact context.'},{role:'assistant',content:'Real local bridge reply.'},{role:'user',content:'Current exact human request.'}]);
  } finally {await model.close();fs.rmSync(root,{recursive:true,force:true});}
});


test('browser bridge carries one server-owned same-turn model-connection projection and bounded self-frame', async () => {
  const { root, home } = makeHome();
  const model = await startModelServer();
  let compositionInput = null;
  try {
    const capabilityRuntime = {
      resolveTurn: async ({ inference, endpointProfile, taskIntent, inMemoryAuthorization, timeoutMs }) => {
        const response = await inference({ endpointProfile, requestContent: taskIntent, inMemoryAuthorization, timeoutMs });
        return {
          response,
          runtimeProjection: {
            schemaVersion: 'vexlife.capability-assimilation-runtime/v1',
            mode: 'ADOPTED_READ_ONLY',
            inferenceCount: 1,
            toolRequestCount: 0,
            observationRefs: [],
            schedulerDispatchReceipts: [],
            capabilityFrameInput: {
              roleRef: 'role.vex.companion',
              platformRef: 'platform.browser',
              projectCapabilityStages: {},
              permissionStages: {},
              effectStages: {},
              resourceStages: {}
            },
            hiddenReasoningIncluded: false,
            externalEffectsExecuted: false
          }
        };
      }
    };
    const modelConnectionComposer = {
      composeTurn(input) {
        compositionInput = input;
        const modelConnectionProjection = {
          schemaVersion: 'vexlife.model-connection-projection/v1',
          truthClass: 'SOURCE_BOUND_MODEL_CONNECTION',
          projectionRef: 'projection.vexlife.model-connection.browser-carry',
          projectionSha256: 'a'.repeat(64),
          modelTurnWitnessRef: input.modelTurnWitness.witnessRef,
          currentnessRefs: [],
          sourceRefs: [],
          effectAuthorityGranted: false
        };
        const selfCapabilityFrame = {
          schemaVersion: 'vexlife.vex-self-capability-frame/v1',
          truthClass: 'BOUNDED_SOURCE_BOUND_SELF_CAPABILITY_FRAME',
          selfCapabilityFrameRef: 'frame.vex-self-capability.browser-carry',
          semanticFingerprint: 'b'.repeat(64),
          modelConnectionProjectionRef: modelConnectionProjection.projectionRef,
          availableCapabilityRefs: [],
          heldCapabilityEntries: [],
          unavailableCapabilityRefs: [],
          unknownCapabilityRefs: [],
          actuallyUsedRefs: [],
          effectAuthorityGranted: false
        };
        return { modelConnectionProjection, selfCapabilityFrame };
      }
    };
    const bridge = createBrowserCompanionBridge({
      home,
      endpoint: model.endpoint,
      model: 'Qwen3.5-4B-Q4_K_M',
      instanceRef: 'instance.vexlife.browser-model-connection-carry',
      capabilityRuntime,
      modelConnectionComposer
    });
    const result = await browserTurn(bridge, {
      projectRef: 'project.self-development',
      threadRef: 'thread.self-development.open-conversation',
      channelRef: 'channel.self-development.companion',
      content: 'Carry the current projection.',
      screenRef: 'screen.vexlife.chat',
      selectedNodeRef: 'element.channel.companion'
    });
    assert.equal(compositionInput.modelTurnWitness.witnessRef, result.modelTurnWitness.witnessRef);
    assert.equal(compositionInput.capabilityRuntime.mode, 'ADOPTED_READ_ONLY');
    assert.equal(compositionInput.currentContext.projectRef, 'project.self-development');
    assert.equal(compositionInput.currentContext.screenRef, 'screen.vexlife.chat');
    assert.equal(result.modelConnectionProjection.modelTurnWitnessRef, result.modelTurnWitness.witnessRef);
    assert.equal(result.selfCapabilityFrame.modelConnectionProjectionRef, result.modelConnectionProjection.projectionRef);
  } finally {
    await model.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('browser active-turn projection is UNKNOWN until a current Context Lease supplies cancellation identity', async () => {
  const { root, home } = makeHome();
  const model = await startModelServer();
  let observedProjection = null;
  let bridge = null;
  try {
    const capabilityRuntime = {
      resolveTurn: async ({ inference, endpointProfile, taskIntent, inMemoryAuthorization, timeoutMs }) => {
        const pending = inference({ endpointProfile, requestContent: taskIntent, inMemoryAuthorization, timeoutMs });
        await new Promise((resolve) => setImmediate(resolve));
        observedProjection = bridge.activeTurnCurrentness();
        return { response: await pending };
      }
    };
    bridge = createBrowserCompanionBridge({
      home,
      endpoint: model.endpoint,
      model: 'Qwen3.5-4B-Q4_K_M',
      instanceRef: 'instance.vexlife.browser-active-turn-unknown',
      capabilityRuntime
    });
    const result = await browserTurn(bridge, {
      threadRef: 'thread.self-development.open-conversation',
      channelRef: 'channel.self-development.companion',
      content: 'Observe the active turn without inventing cancellation identity.'
    });
    assert.equal(observedProjection.state, 'UNKNOWN');
    assert.equal(observedProjection.currentness, 'UNKNOWN');
    assert.equal(observedProjection.phase, 'ACTIVE');
    assert.equal(observedProjection.turnRefOrNull, result.turnRef);
    assert.equal(observedProjection.cancellationTargetRefOrNull, null);
    assert.equal(observedProjection.reasonCodeOrNull, 'CANCELLATION_TARGET_UNAVAILABLE');
    assert.equal(observedProjection.effectAuthorityGranted, false);
    assert.equal(bridge.activeTurnCurrentness().state, 'ABSENT');
    assert.equal(bridge.activeTurnCurrentness({ expectedTurnRef: result.turnRef }).state, 'STALE');
  } finally {
    await model.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('browser active-turn projection becomes CURRENT only after validated Context Lease cancellation binding', async () => {
  const { root, home } = makeHome();
  const model = await startModelServer();
  const threadRef = 'thread.self-development.open-conversation';
  const lease = browserPromptContextLease([]);
  const continuityProjection = browserPromptContinuity('companion-lineage.vexlife.browser-companion-test', threadRef, lease);
  let observedProjection = null;
  let bridge = null;
  try {
    const capabilityRuntime = {
      resolveTurn: async ({ inference, endpointProfile, taskIntent, inMemoryAuthorization, timeoutMs }) => {
        const pending = inference({ endpointProfile, requestContent: taskIntent, inMemoryAuthorization, timeoutMs });
        await new Promise((resolve) => setImmediate(resolve));
        observedProjection = bridge.activeTurnCurrentness();
        return { response: await pending };
      }
    };
    bridge = createBrowserCompanionBridge({
      home,
      endpoint: model.endpoint,
      model: 'Qwen3.5-4B-Q4_K_M',
      instanceRef: 'instance.vexlife.browser-active-turn-current',
      capabilityRuntime,
      promptContextResolver: async () => ({
        contextLease: lease,
        continuityProjection,
        selectedConversationEventRefs: []
      }),
      promptContextAuthorityVerifier: async (query) => browserPromptAuthority(
        home,
        'companion-lineage.vexlife.browser-companion-test',
        threadRef,
        lease,
        continuityProjection,
        query
      )
    });
    const result = await browserTurn(bridge, {
      threadRef,
      channelRef: 'channel.self-development.companion',
      content: 'Bind this active turn only to the current Context Lease.'
    });
    assert.equal(observedProjection.state, 'CURRENT');
    assert.equal(observedProjection.currentness, 'CURRENT');
    assert.equal(observedProjection.phase, 'ACTIVE');
    assert.equal(observedProjection.turnRefOrNull, result.turnRef);
    assert.equal(observedProjection.cancellationTargetRefOrNull, lease.cancellationTokenRef);
    assert.equal(observedProjection.cancellationTargetExpiresAtOrNull, lease.expiresAt);
    assert.equal(observedProjection.sourceRefs.includes(lease.leaseRef), true);
    assert.equal(observedProjection.effectAuthorityGranted, false);
    assert.equal(bridge.activeTurnCurrentness().state, 'ABSENT');
    const stale = bridge.activeTurnCurrentness({ expectedTurnRef: result.turnRef });
    assert.equal(stale.state, 'STALE');
    assert.equal(stale.reasonCodeOrNull, 'EXPECTED_TURN_NOT_ACTIVE');
  } finally {
    await model.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});



test('Conversation-first browser send is durable before model failure and retries Companion attention without duplicating the human message', async () => {
  const { root, home } = makeHome();
  const failing = http.createServer((request, response) => {
    request.resume();
    response.statusCode = 500;
    response.end('{}');
  });
  await new Promise((resolve, reject) => {
    failing.once('error', reject);
    failing.listen(0, '127.0.0.1', resolve);
  });
  const failingEndpoint = `http://127.0.0.1:${failing.address().port}`;
  const send = {
    projectRef: 'project.self-development',
    threadRef: 'thread.self-development.open-conversation',
    channelRef: 'channel.self-development.companion',
    content: 'Keep this human message even if the model fails.',
    idempotencyKey: 'browser-send.test-durable-failure-001',
    messageCreatedAt: '2026-10-19T07:00:00.000Z',
    originalLanguage: 'en'
  };
  try {
    const first = createBrowserCompanionBridge({
      home,
      endpoint: failingEndpoint,
      model: 'Qwen3.5-4B-Q4_K_M',
      instanceRef: 'instance.vexlife.browser-durable-failure'
    });
    let firstError = null;
    await assert.rejects(
      () => first.performConversationTurn(send),
      (error) => {
        firstError = error;
        return error instanceof BrowserCompanionBridgeError && error.durableSend?.state === 'DURABLE';
      }
    );
    assert.match(firstError.durableSend.requestMessageRef, /^message\.vexlife\.conversation\.human\./u);
    const durableHuman = readConversationMessage({
      home,
      channelRef: send.channelRef,
      messageRef: firstError.durableSend.requestMessageRef
    });
    assert.equal(durableHuman.state, 'CURRENT');
    assert.equal(durableHuman.event.content, send.content);
    assert.equal(durableHuman.event.speakerRef, 'person.proof-user');

    await new Promise((resolve) => failing.close(resolve));
    const model = await startModelServer();
    try {
      const retry = createBrowserCompanionBridge({
        home,
        endpoint: model.endpoint,
        model: 'Qwen3.5-4B-Q4_K_M',
        instanceRef: 'instance.vexlife.browser-durable-retry'
      });
      const completed = await retry.performConversationTurn(send);
      assert.equal(completed.state, 'TURN_COMPLETED');
      assert.equal(completed.requestMessageRef, firstError.durableSend.requestMessageRef);
      assert.equal(model.calls.length, 1);
      const channel = readConversationChannel({ home, channelRef: send.channelRef });
      assert.equal(channel.messages.filter((message) => message.messageRef === completed.requestMessageRef).length, 1);
      assert.equal(channel.messages.filter((message) => message.messageRef === completed.responseMessageRef).length, 1);
    } finally {
      await model.close();
    }
  } finally {
    if (failing.listening) await new Promise((resolve) => failing.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('exact browser retry reuses the completed Lived pair and Conversation response without a second model call', async () => {
  const { root, home } = makeHome();
  const model = await startModelServer();
  const send = {
    projectRef: 'project.self-development',
    threadRef: 'thread.self-development.open-conversation',
    channelRef: 'channel.self-development.companion',
    content: 'One exact browser retry.',
    idempotencyKey: 'browser-send.test-completed-retry-001',
    messageCreatedAt: '2026-10-19T07:00:01.000Z',
    originalLanguage: 'en'
  };
  try {
    const bridge = createBrowserCompanionBridge({
      home,
      endpoint: model.endpoint,
      model: 'Qwen3.5-4B-Q4_K_M',
      instanceRef: 'instance.vexlife.browser-completed-retry'
    });
    const first = await bridge.performConversationTurn(send);
    const second = await bridge.performConversationTurn(send);
    assert.equal(model.calls.length, 1);
    assert.equal(second.requestMessageRef, first.requestMessageRef);
    assert.equal(second.responseMessageRef, first.responseMessageRef);
    assert.equal(second.modelCallPerformed, false);
    assert.equal(second.recoveredCompletedTurn, true);
    const channel = readConversationChannel({ home, channelRef: send.channelRef });
    assert.equal(channel.messages.filter((message) => message.messageRef === first.requestMessageRef).length, 1);
    assert.equal(channel.messages.filter((message) => message.messageRef === first.responseMessageRef).length, 1);
  } finally {
    await model.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ordinary Conversation real prompt runtime projection carries exact Context Lease owner truth into the V4 planner', async () => {
  const { root, home } = makeHome();
  const model = await startModelServer();
  const threadRef = 'thread.self-development.open-conversation';
  const channelRef = 'channel.self-development.companion';
  try {
    const first = createBrowserCompanionBridge({
      home,
      endpoint: model.endpoint,
      model: 'Qwen3.5-4B-Q4_K_M',
      instanceRef: 'instance.vexlife.browser-v4-real-projection-prior'
    });
    await browserTurn(first, {
      threadRef,
      channelRef,
      content: 'Prior exact context for the real V4 projection.'
    });

    const promptOwner = createBrowserPromptContextRuntime({
      home,
      homeRef: 'vex-home.browser-companion-test',
      deviceRef: 'device.vexlife.browser-companion-test',
      companionLineageRef: 'companion-lineage.vexlife.browser-companion-test'
    });
    const second = createBrowserCompanionBridge({
      home,
      endpoint: model.endpoint,
      model: 'Qwen3.5-4B-Q4_K_M',
      instanceRef: 'instance.vexlife.browser-v4-real-projection-current',
      promptContextResolver: promptOwner.promptContextResolver,
      promptContextAuthorityVerifier: promptOwner.promptContextAuthorityVerifier
    });
    const result = await browserTurn(second, {
      threadRef,
      channelRef,
      content: 'Carry the real prompt runtime projection into V4 planning.'
    });

    const continuity = result.promptContextContinuityProjection;
    assert.ok(continuity);
    assert.equal(Object.prototype.propertyIsEnumerable.call(result, 'promptContextContinuityProjection'), false);
    assert.equal(JSON.stringify(result).includes('promptContextContinuityProjection'), false);
    assert.equal(continuity.owners.context.leaseRef, result.promptContextMaterialization.contextLeaseRef);
    assert.equal(continuity.owners.context.semanticFingerprint, result.promptContextMaterialization.contextLeaseFingerprint);
    assert.match(continuity.owners.context.checkpointReturnRef, /^checkpoint\.vexlife\.browser-prompt-context\./u);
    assert.equal(Number.isSafeInteger(continuity.owners.context.schedulerGeneration), true);
    assert.match(continuity.owners.context.workNodeRef, /^work-node\.vexlife\.browser-prompt-context\./u);
    assert.deepEqual(
      continuity.owners.context.selectedSourceRefs,
      [...result.promptContextMaterialization.selectedConversationEventRefs, ...result.promptContextMaterialization.memorySourceRefs].sort()
    );

    const pressure = projectResourceContextPressure({
      promptContextMaterialization: result.promptContextMaterialization,
      companionAvailability: null
    });
    const plan = formContinuityRolloverPlan({
      resourceContextPressure: pressure,
      continuityStream: continuity
    });
    assert.equal(plan.state, 'HELD_RESOURCE_ATTENTION');
    assert.equal(plan.continuityProjectionRef, continuity.adapterProjectionRef);
    assert.equal(plan.continuityProjectionFingerprint, continuity.semanticFingerprint);
    assert.equal(plan.effectAuthorityGranted, false);
  } finally {
    await model.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('browser server composes V3 pressure into the accepted effect-free V4 rollover plan without exposing the internal continuity projection', () => {
  const serverCore = fs.readFileSync(path.join(ROOT, 'scripts/serve-browser-core.mjs'), 'utf8');
  assert.match(serverCore, /createResourceContextPressureTracker/u);
  assert.match(serverCore, /formContinuityRolloverPlan/u);
  assert.match(serverCore, /resourceContextPressureTrackerFactory = createResourceContextPressureTracker/u);
  assert.match(serverCore, /promptContextContinuityProjection = null/u);
  assert.match(serverCore, /\.\.\.publicResult/u);
  assert.match(serverCore, /continuityProjectionRef !== promptContextContinuityProjection\.adapterProjectionRef/u);
  assert.match(serverCore, /continuityProjectionFingerprint !== promptContextContinuityProjection\.semanticFingerprint/u);
  assert.match(serverCore, /let companionAvailability = null;/u);
  assert.match(serverCore, /companionAvailability = await resolveCompanionAvailability\(\)/u);
  assert.match(serverCore, /resourceContextPressureTracker\.project\(/u);
  assert.match(serverCore, /promptContextMaterialization: publicResult\.promptContextMaterialization/u);
  assert.match(serverCore, /formContinuityRolloverPlan\(\{/u);
  assert.match(serverCore, /resourceContextPressure: pressure/u);
  assert.match(serverCore, /continuityStream: promptContextContinuityProjection/u);
  assert.match(serverCore, /continuityRolloverPlan/u);
  assert.match(serverCore, /createBrowserWorkingContinuityOwner/u);
  assert.match(serverCore, /workingContinuityOwnerFactory/u);
  assert.match(serverCore, /currentWorkingContinuityOwner/u);
  assert.match(serverCore, /readCurrent\(\{ threadRef: input\.threadRef \}\)/u);
  assert.match(serverCore, /priorWorkingCheckpoint: currentWorkingContinuity\.state === 'CURRENT'/u);
  assert.match(
    serverCore,
    /commitPlan\(\{\s*plan: continuityRolloverPlan,\s*resourceContextPressure: pressure,\s*continuityStream: promptContextContinuityProjection\s*\}\)/u
  );
  assert.match(serverCore, /workingContinuityCommit/u);
  assert.match(serverCore, /result = await attachResourceContextPressure\(result, input\)/u);
  assert.doesNotMatch(serverCore, /return \{ \.\.\.result, resourceContextPressure/u);
  assert.doesNotMatch(serverCore, /workingContinuityCommit[\s\S]{0,220}successorContextAuthorization/u);
  assert.doesNotMatch(serverCore, /continuityRolloverPlan[\s\S]{0,180}(?:process\.kill|memoryPromot|successorContextAuthorization)/u);
});

// [VXG RealForever]
