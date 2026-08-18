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
  validateBrowserCompanionRequest
} from '../src/core/browser-companion-bridge.mjs';
import { initializeLivedCompanionHome } from '../src/core/lived-companion.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-browser-companion-'));
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

test('browser companion runtime binding is server-side numeric loopback only', () => {
  assert.equal(resolveBrowserCompanionRuntimeBinding({}).state, 'UNBOUND');
  assert.equal(resolveBrowserCompanionRuntimeBinding({ endpoint: 'http://127.0.0.1:18080', model: 'Qwen3.5-4B-Q4_K_M' }).state, 'BOUND');
  assert.equal(resolveBrowserCompanionRuntimeBinding({ endpoint: 'http://localhost:18080', model: 'Qwen3.5-4B-Q4_K_M' }).state, 'MISCONFIGURED');
  assert.equal(resolveBrowserCompanionRuntimeBinding({ endpoint: 'https://127.0.0.1:18080', model: 'Qwen3.5-4B-Q4_K_M' }).state, 'MISCONFIGURED');
  assert.equal(resolveBrowserCompanionRuntimeBinding({ endpoint: 'http://127.0.0.1:18080?token=secret', model: 'Qwen3.5-4B-Q4_K_M' }).state, 'MISCONFIGURED');
});

test('browser request cannot inject endpoint, Home, runtime or authorization authority', () => {
  const admitted = {
    projectRef: 'project.local-vex',
    threadRef: 'thread.local-vex.foundation',
    channelRef: 'channel.local-vex.companion',
    content: 'Hello Vex',
    screenRef: 'screen.vexlife.chat',
    selectedNodeRef: 'element.channel.companion'
  };
  assert.equal(validateBrowserCompanionRequest(admitted).content, 'Hello Vex');
  for (const extra of ['endpoint', 'home', 'runtimeExecutable', 'authorization']) {
    assert.throws(
      () => validateBrowserCompanionRequest({ ...admitted, [extra]: 'forbidden' }),
      (error) => error instanceof BrowserCompanionBridgeError && error.code === 'COMPANION_REQUEST_NOT_ADMITTED'
    );
  }
});

test('unbound browser companion fails closed without synthetic output', async () => {
  const { root, home } = makeHome();
  try {
    const bridge = createBrowserCompanionBridge({ home });
    assert.equal(bridge.status().state, 'UNBOUND');
    await assert.rejects(
      () => bridge.performTurn({
        threadRef: 'thread.local-vex.foundation',
        channelRef: 'channel.local-vex.companion',
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
    const result = await bridge.performTurn({
      projectRef: 'project.local-vex',
      threadRef: 'thread.local-vex.foundation',
      channelRef: 'channel.local-vex.companion',
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
    assert.equal(model.calls.length, 1);
    assert.equal(model.calls[0].path, '/v1/chat/completions');
    assert.equal(model.calls[0].body.model, 'Qwen3.5-4B-Q4_K_M');

    const headPath = path.join(
      home,
      'conversations',
      'companion-lineage.vexlife.browser-companion-test',
      'thread.local-vex.foundation',
      'head.json'
    );
    const head = JSON.parse(fs.readFileSync(headPath, 'utf8'));
    assert.equal(head.conversationHeadSha256, result.conversationHeadSha256);
    assert.equal(head.threadRef, 'thread.local-vex.foundation');
  } finally {
    await model.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('browser source never routes companion channel through simulatedReply', () => {
  const chat = fs.readFileSync(path.join(ROOT, 'reference/browser/modules/chat-controller.js'), 'utf8');
  const server = fs.readFileSync(path.join(ROOT, 'scripts/serve-browser.mjs'), 'utf8');
  assert.match(chat, /channel\.roleKey === 'companion'[\s\S]*requestRealCompanionReply/u);
  assert.match(chat, /simulatedReply\(channel, frameAtSend\)[\s\S]*channel\.roleKey === 'companion'\) return false/u);
  assert.match(chat, /fetch\('\/api\/v1\/companion\/turn'/u);
  assert.match(chat, /channel\.roleKey === 'companion' \? companionBindingState === 'BOUND' : isVexAvailable\(\)/u);
  assert.doesNotMatch(chat, /endpoint\s*:/u);
  assert.match(server, /VEXLIFE_COMPANION_ENDPOINT/u);
  assert.match(server, /createBrowserCompanionBridge/u);
});

// [VXG RealForever]
