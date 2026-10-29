import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileModelConnection } from '../src/core/model-connection-compiler.mjs';
import {
  formVexSelfCapabilityFrame,
  projectVexSelfCapabilityCurrentContext
} from '../src/core/vex-self-capability-frame.mjs';
import { normalizeModelRuntimeResponse } from '../src/core/model-runtime-adapter.mjs';
import { formModelRuntimeInvocationEvidence, formModelTurnWitness } from '../src/core/model-turn-witness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));

function witness() {
  const endpointProfile = {
    profileRef: 'model-profile.vexlife.browser-companion.local',
    admitted: true,
    endpoint: 'http://127.0.0.1:18080',
    model: 'Qwen3.5-4B-Q4_K_M'
  };
  const normalized = normalizeModelRuntimeResponse({
    responseBody: {
      model: 'C:\\private\\models\\Qwen_Qwen3.5-4B-Q4_K_M.gguf',
      choices: [{ index: 0, finish_reason: 'stop', message: {
        role: 'assistant',
        content: 'Visible answer only.',
        reasoning_content: 'raw-r3-reasoning-must-not-project'
      }}]
    },
    endpointProfile,
    observedAt: '2026-09-03T03:41:00.000Z'
  });
  const invocation = formModelRuntimeInvocationEvidence({
    endpointProfileRef: endpointProfile.profileRef,
    sanitizedEndpointOrigin: endpointProfile.endpoint,
    requestBodySha256: 'b'.repeat(64),
    runtimeObservation: normalized.runtimeObservation,
    httpStatus: 200,
    actualHttpCall: true,
    formedAt: '2026-09-03T03:41:01.000Z'
  });
  return formModelTurnWitness({
    turnRef: 'turn.vexlife.r3-frame',
    requestMessageRef: 'message.vexlife.r3-frame.request',
    responseMessageRef: 'message.vexlife.r3-frame.response',
    runtimeObservation: normalized.runtimeObservation,
    invocationEvidence: invocation,
    currentnessRefs: ['github.commit.vexlife.97919adb85d0609633ea7d1673adc83ed1300c7f'],
    formedAt: '2026-09-03T03:41:02.000Z'
  });
}

function projection() {
  return compileModelConnection({
    capabilityRegistry: readJson('blueprint/capability-registry.json'),
    capabilityInput: {
      roleRef: 'role.vex.operations',
      platformRef: 'platform.windows'
    },
    runtimeCapabilityRegistry: readJson('blueprint/model-runtime-capabilities.json'),
    modelConnectionBindingRegistry: readJson('blueprint/model-connection-binding-registry.json'),
    modelBundleRegistry: readJson('blueprint/model-bundle-registry.json'),
    operationalProfileRegistry: readJson('blueprint/vex-operational-profiles.json'),
    modelTurnWitness: witness(),
    actuallyUsedRefs: []
  });
}

test('self-capability frame is bounded source truth and grants no effect authority', () => {
  const frame = formVexSelfCapabilityFrame({
    modelConnectionProjection: projection(),
    currentContext: {
      homeRef: 'vex-home.local',
      deviceRef: 'device.local',
      companionLineageRef: 'companion-lineage.local',
      projectRef: 'project.local',
      threadRef: 'thread.local',
      channelRef: 'channel.local',
      screenRef: 'screen.vexlife.chat',
      selectedNodeRef: 'element.channel.companion'
    },
    tokenBudget: 2400,
    formedAt: '2026-09-03T03:41:03.000Z'
  });
  assert.equal(frame.effectAuthorityGranted, false);
  assert.equal(frame.modelBundleRef, 'model-bundle.vexlife.g0.qwen3.5-4b.q4-k-m.001');
  assert.deepEqual(frame.runtimeCapability.heldCellEntries.map((entry) => entry.cellRef), ['C11', 'C12']);
  assert.equal(frame.availableCapabilityRefs.includes('capability.search'), true);
  assert.equal(frame.heldCapabilityEntries.some((entry) => entry.capabilityRef === 'capability.search'), false);
  const text = JSON.stringify(frame);
  for (const forbidden of [
    'C:\\private\\models\\Qwen_Qwen3.5-4B-Q4_K_M.gguf',
    'raw-r3-reasoning-must-not-project',
    'Visible answer only.'
  ]) {
    assert.equal(text.includes(forbidden), false, forbidden);
  }
});

test('current-context projector extracts only admitted refs from richer runtime context', () => {
  const context = projectVexSelfCapabilityCurrentContext({
    taskRef: 'task.runtime-only',
    sourceRefs: ['source.runtime-only'],
    homeRef: 'vex-home.local',
    deviceRef: 'device.local',
    companionLineageRef: 'companion-lineage.local',
    projectRef: 'project.self-development',
    threadRef: 'thread.self-development.open-conversation',
    channelRef: 'channel.self-development.companion',
    screenRef: 'screen.vexlife.chat',
    selectedNodeRef: 'element.channel.companion'
  });
  assert.deepEqual(context, {
    homeRef: 'vex-home.local',
    deviceRef: 'device.local',
    companionLineageRef: 'companion-lineage.local',
    projectRef: 'project.self-development',
    threadRef: 'thread.self-development.open-conversation',
    channelRef: 'channel.self-development.companion',
    screenRef: 'screen.vexlife.chat',
    selectedNodeRef: 'element.channel.companion'
  });
  assert.equal(Object.hasOwn(context, 'taskRef'), false);
  assert.equal(Object.hasOwn(context, 'sourceRefs'), false);
  assert.throws(() => projectVexSelfCapabilityCurrentContext({ threadRef: { unsafe: true } }), /currentContext\.threadRef/);
});

test('self frame rejects ambient/unbounded context fields', () => {
  assert.throws(
    () => formVexSelfCapabilityFrame({
      modelConnectionProjection: projection(),
      currentContext: { threadRef: 'thread.local', rawConversation: 'private body' },
      formedAt: '2026-09-03T03:41:03.000Z'
    }),
    /unadmitted fields/
  );
});

test('self frame content address changes only when bounded inputs change', () => {
  const first = formVexSelfCapabilityFrame({
    modelConnectionProjection: projection(),
    currentContext: { threadRef: 'thread.local' },
    tokenBudget: 2400,
    formedAt: '2026-09-03T03:41:03.000Z'
  });
  const second = formVexSelfCapabilityFrame({
    modelConnectionProjection: projection(),
    currentContext: { threadRef: 'thread.local' },
    tokenBudget: 2400,
    formedAt: '2026-09-03T03:41:03.000Z'
  });
  assert.equal(first.semanticFingerprint, second.semanticFingerprint);
  assert.deepEqual(first, second);

  const changed = formVexSelfCapabilityFrame({
    modelConnectionProjection: projection(),
    currentContext: { threadRef: 'thread.other' },
    tokenBudget: 2400,
    formedAt: '2026-09-03T03:41:03.000Z'
  });
  assert.notEqual(first.semanticFingerprint, changed.semanticFingerprint);
});

test('small token budget fails closed rather than dropping the canonical root kernel', () => {
  assert.throws(
    () => formVexSelfCapabilityFrame({
      modelConnectionProjection: projection(),
      currentContext: { threadRef: 'thread.local' },
      tokenBudget: 128,
      formedAt: '2026-09-03T03:41:03.000Z'
    }),
    /root capability kernel/
  );
});

function hereticWitness({ endpoint = 'http://127.0.0.1:8765', model = 'default_model' } = {}) {
  const endpointProfile = {
    profileRef: 'model-profile.vexlife.browser-companion.heretic',
    admitted: true,
    endpoint,
    model
  };
  const normalized = normalizeModelRuntimeResponse({
    endpointProfile,
    observedAt: '2026-10-26T02:40:46.657Z',
    responseBody: {
      model,
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: 'grep expedition or oral history' }
      }],
      usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 }
    }
  });
  const invocationEvidence = formModelRuntimeInvocationEvidence({
    endpointProfileRef: endpointProfile.profileRef,
    sanitizedEndpointOrigin: endpointProfile.endpoint,
    requestBodySha256: 'd'.repeat(64),
    runtimeObservation: normalized.runtimeObservation,
    httpStatus: 200,
    actualHttpCall: true,
    formedAt: '2026-10-26T02:40:46.658Z'
  });
  return formModelTurnWitness({
    turnRef: 'turn.vexlife.interface-refinement.heretic-model-connection',
    requestMessageRef: 'message.vexlife.interface-refinement.heretic-model-connection.request',
    responseMessageRef: 'message.vexlife.interface-refinement.heretic-model-connection.response',
    runtimeObservation: normalized.runtimeObservation,
    invocationEvidence,
    currentnessRefs: ['artifact.vexlife.interface-refinement.home-tool.a005.return.sha256.10377b2574b36bdf82bcc1eda7be52fd51a7934eeddc958ca85ced6b9edfdd87'],
    formedAt: '2026-10-26T02:40:46.659Z'
  });
}

test('Heretic model connection projects a bounded self-capability frame without a legacy operational-profile alias', () => {
  const modelConnectionProjection = compileModelConnection({
    capabilityRegistry: readJson('blueprint/capability-registry.json'),
    capabilityInput: {
      roleRef: 'role.vex.companion',
      platformRef: 'platform.browser'
    },
    runtimeCapabilityRegistry: readJson('blueprint/model-runtime-capabilities.json'),
    modelConnectionBindingRegistry: readJson('blueprint/model-connection-binding-registry.json'),
    modelBundleRegistry: readJson('blueprint/model-bundle-registry.json'),
    operationalProfileRegistry: readJson('blueprint/vex-operational-profiles.json'),
    modelTurnWitness: hereticWitness(),
    actuallyUsedRefs: ['capability.vexlife.code.read']
  });
  const frame = formVexSelfCapabilityFrame({
    modelConnectionProjection,
    currentContext: {
      projectRef: 'project.self-development',
      threadRef: 'thread.self-development.open-conversation',
      channelRef: 'channel.self-development.companion',
      screenRef: 'screen.vexlife.chat'
    },
    tokenBudget: 2400,
    formedAt: '2026-10-26T02:40:46.660Z'
  });
  assert.equal(frame.modelBundleRef, 'model-bundle.vexlife.heretic.qwen3.8-27b.mlx4.329658ee8f27.001');
  assert.equal(frame.operationalProfileRef, null);
  assert.equal(frame.availableCapabilityRefs.includes('capability.vexlife.code.read'), true);
  assert.equal(frame.actuallyUsedRefs.includes('capability.vexlife.code.read'), true);
  assert.equal(frame.effectAuthorityGranted, false);
});

// [VXG RealForever]
