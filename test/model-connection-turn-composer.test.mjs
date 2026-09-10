import assert from 'node:assert/strict';
import test from 'node:test';

import { ROOT_CAPABILITY_KERNEL } from '../src/core/capability.mjs';
import {
  createModelConnectionTurnComposer,
  loadModelConnectionTurnSources
} from '../src/core/model-connection-turn-composer.mjs';
import { normalizeModelRuntimeResponse } from '../src/core/model-runtime-adapter.mjs';
import {
  formModelRuntimeInvocationEvidence,
  formModelTurnWitness
} from '../src/core/model-turn-witness.mjs';

const H = 'a'.repeat(64);

function externalWitness(model = 'Qwen3.5-4B-Q4_K_M') {
  const endpointProfile = {
    profileRef: 'model-profile.vexlife.browser-companion.local',
    admitted: true,
    endpoint: 'http://127.0.0.1:18080',
    model
  };
  const normalized = normalizeModelRuntimeResponse({
    endpointProfile,
    observedAt: '2026-09-06T01:00:00.000Z',
    responseBody: {
      model,
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: 'Source-bound turn projection.' }
      }],
      usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
      timings: { prompt_n: 3, prompt_ms: 2, predicted_n: 4, predicted_ms: 3 },
      future_field: { opaque: true }
    }
  });
  const invocationEvidence = formModelRuntimeInvocationEvidence({
    endpointProfileRef: endpointProfile.profileRef,
    sanitizedEndpointOrigin: endpointProfile.endpoint,
    requestBodySha256: H,
    runtimeObservation: normalized.runtimeObservation,
    httpStatus: 200,
    actualHttpCall: true,
    formedAt: '2026-09-06T01:00:01.000Z'
  });
  return formModelTurnWitness({
    turnRef: 'turn.vexlife.projection-composer-test',
    requestMessageRef: 'message.vexlife.projection-composer-test.request',
    responseMessageRef: 'message.vexlife.projection-composer-test.response',
    runtimeObservation: normalized.runtimeObservation,
    invocationEvidence,
    formedAt: '2026-09-06T01:00:02.000Z'
  });
}

function capabilityFrameInput() {
  return {
    roleRef: 'role.vex.companion',
    platformRef: 'platform.browser',
    projectCapabilityStages: Object.fromEntries(ROOT_CAPABILITY_KERNEL.map((ref) => [ref, 'COMPLETED'])),
    permissionStages: { 'permission.none': 'COMPLETED' },
    effectStages: { READ_ONLY: 'COMPLETED' },
    resourceStages: { IO_BOUNDED: 'COMPLETED' }
  };
}

function dispatch(capabilityRef, index = 1, overrides = {}) {
  return {
    schemaVersion: 'vexlife.capability-assimilation-scheduler-dispatch/v1',
    requestRef: `request.projection-composer.${index}`,
    capabilityRef,
    schedulerGeneration: index,
    workerLeaseRef: `worker-lease.projection-composer.${index}`,
    admissionReceiptRef: `admission.projection-composer.${index}`,
    admissionReceiptFingerprint: 'b'.repeat(64),
    toolCallRef: `tool-call.projection-composer.${index}`,
    completionReceiptRef: `completion.projection-composer.${index}`,
    completionReceiptFingerprint: 'c'.repeat(64),
    externalEffectsExecuted: false,
    ...overrides
  };
}

function adoptedRuntime(receipts = [dispatch('capability.search')]) {
  return {
    schemaVersion: 'vexlife.capability-assimilation-runtime/v1',
    mode: 'ADOPTED_READ_ONLY',
    capabilityFrameInput: capabilityFrameInput(),
    schedulerDispatchReceipts: receipts
  };
}

test('adopted runtime forms the accepted R3 projection and bounded self-frame from exact runtime-owned evidence', () => {
  const composer = createModelConnectionTurnComposer({
    sourceBundle: loadModelConnectionTurnSources(),
    clock: () => '2026-09-06T01:00:03.000Z'
  });
  const result = composer.composeTurn({
    modelTurnWitness: externalWitness(),
    capabilityRuntime: adoptedRuntime([
      dispatch('capability.search', 1),
      dispatch('context.where', 2)
    ]),
    currentContext: {
      homeRef: 'vex-home.test',
      deviceRef: 'device.test',
      companionLineageRef: 'companion-lineage.test',
      projectRef: 'project.test',
      threadRef: 'thread.test',
      channelRef: 'channel.test',
      screenRef: 'screen.vexlife.chat',
      selectedNodeRef: 'element.channel.companion'
    }
  });
  assert.equal(result.state, 'CURRENT_SOURCE_BOUND_REUSABLE_PROJECTION');
  assert.deepEqual(result.actuallyUsedRefs, ['capability.search', 'context.where']);
  assert.deepEqual(result.modelConnectionProjection.actuallyUsedRefs, result.actuallyUsedRefs);
  assert.deepEqual(result.modelConnectionProjection.runtimeCapability.heldCellEntries.map((entry) => entry.cellRef), ['C11', 'C12']);
  assert.equal(result.modelConnectionProjection.effectAuthorityGranted, false);
  assert.equal(result.selfCapabilityFrame.currentContext.projectRef, 'project.test');
  assert.equal(result.selfCapabilityFrame.effectAuthorityGranted, false);
});

test('direct single-turn mode stays typed UNKNOWN rather than borrowing adopted capability upgrades', () => {
  const composer = createModelConnectionTurnComposer({ sourceBundle: loadModelConnectionTurnSources() });
  const result = composer.composeTurn({
    modelTurnWitness: externalWitness(),
    capabilityRuntime: {
      schemaVersion: 'vexlife.capability-assimilation-runtime/v1',
      mode: 'DIRECT_SINGLE_TURN',
      inferenceCount: 1,
      toolRequestCount: 0,
      observationRefs: []
    }
  });
  assert.equal(result.state, 'UNKNOWN');
  assert.equal(result.reasonCode, 'UNKNOWN_CAPABILITY_INPUT_NOT_PROJECTED');
  assert.equal(result.modelConnectionProjection, null);
  assert.equal(result.selfCapabilityFrame, null);
});

test('actual use is admitted only from closed scheduler-dispatch evidence', () => {
  const composer = createModelConnectionTurnComposer({ sourceBundle: loadModelConnectionTurnSources() });
  const result = composer.composeTurn({
    modelTurnWitness: externalWitness(),
    capabilityRuntime: adoptedRuntime([
      dispatch('capability.search', 1, { externalEffectsExecuted: true })
    ])
  });
  assert.equal(result.state, 'UNKNOWN');
  assert.equal(result.reasonCode, 'UNKNOWN_RUNTIME_USE_EVIDENCE');
  assert.deepEqual(result.actuallyUsedRefs, []);
});

test('current source/model contradiction fails closed without surfacing raw compiler error detail', () => {
  const composer = createModelConnectionTurnComposer({ sourceBundle: loadModelConnectionTurnSources() });
  const result = composer.composeTurn({
    modelTurnWitness: externalWitness('DifferentModel'),
    capabilityRuntime: adoptedRuntime()
  });
  assert.equal(result.state, 'UNKNOWN');
  assert.equal(result.reasonCode, 'SOURCE_BINDING_REJECTED');
  assert.equal(result.modelConnectionProjection, null);
});

// [VXG RealForever]
