import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { createBrowserCompanionBridge } from '../src/core/browser-companion-bridge.mjs';
import { initializeLivedCompanionHome } from '../src/core/lived-companion.mjs';
import { verifyModelTurnWitness } from '../src/core/model-turn-witness.mjs';
import { semanticHash } from '../src/core/utils.mjs';

function sha256Text(value) {
  return crypto.createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
}

function makeHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-r2b-browser-'));
  const home = path.join(root, 'home');
  initializeLivedCompanionHome({
    home,
    homeRef: 'vex-home.r2b-browser',
    familyRef: 'vex-family.r2b-browser',
    deviceRef: 'device.vexlife.r2b-browser',
    companionLineageRef: 'companion-lineage.vexlife.r2b-browser'
  });
  return { root, home };
}

async function startModelServer() {
  const calls = [];
  const responses = [];
  const rawModel = 'C:\\models\\Qwen_Qwen3.5-4B-Q4_K_M.gguf';
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    calls.push(body);
    const last = body.messages?.at(-1)?.content ?? '';
    const internal = last === 'R2B_INTERNAL_REQUEST_FORMATION';
    const responseBody = {
      id: internal ? 'chatcmpl-r2b-internal' : 'chatcmpl-r2b-visible',
      object: 'chat.completion',
      created: internal ? 1788390001 : 1788390002,
      model: rawModel,
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content: internal ? 'Internal planning response.' : 'Visible final response.',
          reasoning_content: internal ? 'internal-reasoning-never-persist' : 'final-reasoning-never-persist'
        }
      }],
      usage: { prompt_tokens: internal ? 3 : 9, completion_tokens: 4, total_tokens: internal ? 7 : 13 },
      timings: { prompt_n: internal ? 3 : 9, prompt_ms: internal ? 2.5 : 5.5, predicted_n: 4, predicted_ms: 3.25 },
      unknown_extension: { phase: internal ? 'internal-raw-never-persist' : 'final-raw-never-persist' }
    };
    responses.push(responseBody);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(responseBody));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    endpoint: `http://127.0.0.1:${server.address().port}`,
    rawModel,
    calls,
    responses,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

function readAllText(root) {
  const chunks = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.isFile()) chunks.push(fs.readFileSync(target, 'utf8'));
    }
  };
  walk(root);
  return chunks.join('\n');
}

test('browser scheduler normalization binds the final visible inference rather than internal request formation', async () => {
  const { root, home } = makeHome();
  const model = await startModelServer();
  const capabilityRuntime = {
    resolveTurn: async ({ inference, endpointProfile, taskIntent, inMemoryAuthorization, timeoutMs }) => {
      await inference({
        endpointProfile,
        requestContent: 'R2B_INTERNAL_REQUEST_FORMATION',
        inMemoryAuthorization,
        timeoutMs
      });
      const visible = await inference({
        endpointProfile,
        requestContent: taskIntent,
        inMemoryAuthorization,
        timeoutMs
      });
      return {
        response: { content: visible.content, model: visible.model },
        actualHttpCall: true,
        contextSourceRefs: [],
        runtimeProjection: {
          schemaVersion: 'test.r2b-scheduler-normalization/v1',
          inferenceCount: 2
        }
      };
    }
  };
  try {
    const bridge = createBrowserCompanionBridge({
      home,
      endpoint: model.endpoint,
      model: 'Qwen3.5-4B-Q4_K_M',
      instanceRef: 'instance.vexlife.r2b-browser',
      capabilityRuntime
    });
    const result = await bridge.performTurn({
      projectRef: 'project.local-vex',
      threadRef: 'thread.local-vex.r2b-browser',
      channelRef: 'channel.local-vex.companion',
      content: 'Current exact human request.',
      screenRef: 'screen.vexlife.chat',
      selectedNodeRef: 'element.channel.companion'
    });
    assert.equal(model.calls.length, 2);
    assert.equal(result.content, 'Visible final response.');
    assert.equal(result.modelNameOrBoundedTestProfileRef, 'Qwen3.5-4B-Q4_K_M');
    assert.ok(result.modelTurnWitness);
    assert.equal(verifyModelTurnWitness(result.modelTurnWitness), true);
    assert.equal(result.modelTurnWitness.runtimeObservation.output.contentSha256, sha256Text('Visible final response.'));
    assert.equal(result.modelTurnWitness.runtimeObservation.responseBodySha256, semanticHash(model.responses[1]));
    assert.notEqual(result.modelTurnWitness.runtimeObservation.responseBodySha256, semanticHash(model.responses[0]));
    assert.equal(result.modelTurnWitness.runtimeObservation.modelProvenance.reportedModelField.pathClass, 'LOCAL_PATH_LIKE');
    assert.equal(result.modelTurnWitness.runtimeObservation.reasoningTrace.rawPersisted, false);
    assert.equal(result.modelTurnWitness.capabilityDisposition.availableRefs.length, 0);
    const headPath = path.join(home, 'conversations', 'companion-lineage.vexlife.r2b-browser', 'thread.local-vex.r2b-browser', 'head.json');
    const head = JSON.parse(fs.readFileSync(headPath, 'utf8'));
    const context = JSON.parse(fs.readFileSync(path.join(home, head.contextPath), 'utf8'));
    assert.equal(context.contextSourceRefs.includes(result.modelTurnWitness.witnessRef), true);
    const persisted = readAllText(home);
    for (const forbidden of [model.rawModel, 'internal-reasoning-never-persist', 'final-reasoning-never-persist', 'internal-raw-never-persist', 'final-raw-never-persist']) {
      assert.equal(persisted.includes(forbidden), false, forbidden);
      assert.equal(JSON.stringify(result.modelTurnWitness).includes(forbidden), false, forbidden);
    }
  } finally {
    await model.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// [VXG RealForever]
