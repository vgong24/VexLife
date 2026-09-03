import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import {
  initializeLivedCompanionHome,
  performLivedCompanionTurn
} from '../src/core/lived-companion.mjs';
import { verifyModelTurnWitness } from '../src/core/model-turn-witness.mjs';

function sha256Text(value) {
  return crypto.createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
}

function makeHome(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `vexlife-r2b-${label}-`));
  const home = path.join(root, 'home');
  const identity = {
    homeRef: `vex-home.r2b-${label}`,
    familyRef: `vex-family.r2b-${label}`,
    deviceRef: `device.vexlife.r2b-${label}`,
    companionLineageRef: `companion-lineage.vexlife.r2b-${label}`
  };
  initializeLivedCompanionHome({ home, ...identity });
  return { root, home, ...identity };
}

async function startModelServer() {
  const rawModel = 'C:\\models\\Qwen_Qwen3.5-4B-Q4_K_M.gguf';
  const rawReasoning = 'r2b-private-reasoning-never-persist';
  const rawUnknown = 'r2b-unknown-raw-value-never-persist';
  const responseBody = {
    id: 'chatcmpl-r2b-direct',
    object: 'chat.completion',
    created: 1788390000,
    model: rawModel,
    choices: [{
      index: 0,
      finish_reason: 'stop',
      message: {
        role: 'assistant',
        content: 'Witnessed local reply.',
        reasoning_content: rawReasoning,
        refusal: null
      }
    }],
    usage: { prompt_tokens: 7, completion_tokens: 5, total_tokens: 12, prompt_tokens_details: { cached_tokens: 2 } },
    timings: { prompt_n: 7, prompt_ms: 12.5, predicted_n: 5, predicted_ms: 9.25 },
    unknown_extension: { opaque: rawUnknown }
  };
  let calls = 0;
  const server = http.createServer((request, response) => {
    calls += 1;
    request.resume();
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(responseBody));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    endpoint: `http://127.0.0.1:${server.address().port}`,
    responseBody,
    rawModel,
    rawReasoning,
    rawUnknown,
    calls: () => calls,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

function turn(identity, endpoint, overrides = {}) {
  return {
    home: identity.home,
    homeRef: identity.homeRef,
    deviceRef: identity.deviceRef,
    companionLineageRef: identity.companionLineageRef,
    instanceRef: `instance.vexlife.r2b-${crypto.randomUUID()}`,
    threadRef: `thread.vexlife.r2b-${crypto.randomUUID()}`,
    channelRef: 'channel.local-vex.companion',
    turnRef: `turn.vexlife.r2b-${crypto.randomUUID()}`,
    requestMessageRef: `message.vexlife.r2b-request-${crypto.randomUUID()}`,
    responseMessageRef: `message.vexlife.r2b-response-${crypto.randomUUID()}`,
    speakerRef: 'person.local-user',
    recipientRefs: ['role.vex.companion'],
    content: 'Form one externally witnessed local turn.',
    endpointProfile: {
      profileRef: 'model-profile.vexlife.browser-companion.local',
      admitted: true,
      endpoint,
      model: 'Qwen3.5-4B-Q4_K_M'
    },
    contextSourceRefs: ['source.vexlife.r2b-focused-proof'],
    timeoutMs: 5000,
    ...overrides
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

test('direct lived local-model turn forms a closed external witness without persisting raw runtime fields', async () => {
  const identity = makeHome('direct');
  const model = await startModelServer();
  try {
    const result = await performLivedCompanionTurn(turn(identity, model.endpoint));
    assert.equal(model.calls(), 1);
    assert.equal(result.actualHttpCall, true);
    assert.ok(result.modelTurnWitness);
    assert.equal(verifyModelTurnWitness(result.modelTurnWitness), true);
    const witness = result.modelTurnWitness;
    assert.equal(witness.runtimeObservation.output.contentSha256, sha256Text('Witnessed local reply.'));
    assert.equal(witness.runtimeObservation.modelProvenance.compatibilityModel, 'Qwen3.5-4B-Q4_K_M');
    assert.equal(witness.runtimeObservation.modelProvenance.reportedModelField.pathClass, 'LOCAL_PATH_LIKE');
    assert.equal(witness.runtimeObservation.modelProvenance.reportedModelField.rawValuePersisted, false);
    assert.equal(witness.runtimeObservation.reasoningTrace.present, true);
    assert.equal(witness.runtimeObservation.reasoningTrace.rawPersisted, false);
    assert.equal(witness.runtimeObservation.reasoningTrace.humanProjection, 'SEALED_EXPLICIT_OPEN_ONLY');
    assert.equal(witness.runtimeObservation.usageSummary.present, true);
    assert.equal(witness.runtimeObservation.runtimeTimingSummary.present, true);
    const unknownExtension = witness.runtimeObservation.unknownUpstreamFields.find((entry) => entry.jsonPointer === '/unknown_extension');
    assert.ok(unknownExtension);
    assert.equal(unknownExtension.rawValuePersisted, false);
    assert.equal(unknownExtension.disposition, 'UNCLASSIFIED_RUNTIME_FIELD');
    assert.equal(witness.capabilityDisposition.availableRefs.length, 0);
    assert.equal(witness.capabilityDisposition.heldRefs.length, 0);
    assert.equal(witness.capabilityDisposition.unavailableRefs.length, 0);
    assert.equal(witness.capabilityDisposition.unknownRefs.length, 0);
    assert.equal(result.responseEvent.modelNameOrBoundedTestProfileRef, 'Qwen3.5-4B-Q4_K_M');
    assert.deepEqual(result.contextRecord.contextSourceRefs.slice(-2), [result.requestEvent.eventRef, result.responseEvent.eventRef]);
    assert.equal(result.contextRecord.contextSourceRefs.includes(witness.witnessRef), true);
    const persisted = readAllText(identity.home);
    for (const forbidden of [model.rawModel, model.rawReasoning, model.rawUnknown]) assert.equal(persisted.includes(forbidden), false, forbidden);
    const witnessText = JSON.stringify(witness);
    for (const forbidden of [model.rawModel, model.rawReasoning, model.rawUnknown]) assert.equal(witnessText.includes(forbidden), false, forbidden);
  } finally {
    await model.close();
    fs.rmSync(identity.root, { recursive: true, force: true });
  }
});

test('caller-authored compatibility actualHttpCall cannot mint a ModelTurnWitness', async () => {
  const identity = makeHome('caller');
  const model = await startModelServer();
  try {
    const result = await performLivedCompanionTurn(turn(identity, model.endpoint, {
      responseResolver: async () => ({
        response: { content: 'Compatibility-only synthetic response.', model: 'Qwen3.5-4B-Q4_K_M' },
        actualHttpCall: true,
        contextSourceRefs: []
      })
    }));
    assert.equal(result.actualHttpCall, true);
    assert.equal(result.modelTurnWitness, null);
    assert.equal(result.contextRecord.contextSourceRefs.some((value) => value.startsWith('witness.vexlife.model-turn.')), false);
    assert.equal(model.calls(), 0);
  } finally {
    await model.close();
    fs.rmSync(identity.root, { recursive: true, force: true });
  }
});

// [VXG RealForever]
