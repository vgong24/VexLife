import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ROOT_CAPABILITY_KERNEL } from '../src/core/capability.mjs';
import { CAPABILITY_ASSIMILATION_MODES } from '../src/core/capability-assimilation-runtime.mjs';
import { normalizeModelRuntimeResponse } from '../src/core/model-runtime-adapter.mjs';
import {
  formModelRuntimeInvocationEvidence,
  formModelTurnWitness
} from '../src/core/model-turn-witness.mjs';
import { createServerOwnedBrowserCompanionBridge } from '../scripts/serve-browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const H = 'a'.repeat(64);

function capabilityFrameInput() {
  return {
    roleRef: 'role.vex.companion',
    platformRef: 'platform.browser',
    projectCapabilityStages: Object.fromEntries(
      ROOT_CAPABILITY_KERNEL.map((capabilityRef) => [capabilityRef, 'COMPLETED'])
    ),
    permissionStages: { 'permission.none': 'COMPLETED' },
    effectStages: { READ_ONLY: 'COMPLETED' },
    resourceStages: { IO_BOUNDED: 'COMPLETED' }
  };
}

function schedulerDispatch(capabilityRef = 'context.where') {
  return {
    schemaVersion: 'vexlife.capability-assimilation-scheduler-dispatch/v1',
    requestRef: 'request.vmcf.server-tail.context',
    capabilityRef,
    schedulerGeneration: 1,
    workerLeaseRef: 'worker-lease.vmcf.server-tail.context',
    admissionReceiptRef: 'admission.vmcf.server-tail.context',
    admissionReceiptFingerprint: 'b'.repeat(64),
    toolCallRef: 'tool-call.vmcf.server-tail.context',
    completionReceiptRef: 'completion.vmcf.server-tail.context',
    completionReceiptFingerprint: 'c'.repeat(64),
    externalEffectsExecuted: false
  };
}

function externalWitness() {
  const endpointProfile = {
    profileRef: 'model-profile.vexlife.browser-companion.local',
    admitted: true,
    endpoint: 'http://127.0.0.1:18080',
    model: 'Qwen3.5-4B-Q4_K_M'
  };
  const normalized = normalizeModelRuntimeResponse({
    endpointProfile,
    observedAt: '2026-09-06T08:00:00.000Z',
    responseBody: {
      model: 'Qwen3.5-4B-Q4_K_M',
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: 'Server-owned projection composition.' }
      }],
      usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
      timings: { prompt_n: 3, prompt_ms: 2, predicted_n: 4, predicted_ms: 3 }
    }
  });
  const invocationEvidence = formModelRuntimeInvocationEvidence({
    endpointProfileRef: endpointProfile.profileRef,
    sanitizedEndpointOrigin: endpointProfile.endpoint,
    requestBodySha256: H,
    runtimeObservation: normalized.runtimeObservation,
    httpStatus: 200,
    actualHttpCall: true,
    formedAt: '2026-09-06T08:00:01.000Z'
  });
  return formModelTurnWitness({
    turnRef: 'turn.vexlife.vmcf.server-tail',
    requestMessageRef: 'message.vexlife.vmcf.server-tail.request',
    responseMessageRef: 'message.vexlife.vmcf.server-tail.response',
    runtimeObservation: normalized.runtimeObservation,
    invocationEvidence,
    formedAt: '2026-09-06T08:00:02.000Z'
  });
}

test('server-owned adopted composition injects the canonical runtime and real model-connection composer into the browser bridge', () => {
  let captured = null;
  const sentinel = Object.freeze({ ref: 'bridge.vmcf.server-tail.adopted' });
  const result = createServerOwnedBrowserCompanionBridge({
    sourceRoot: ROOT,
    companionHome: '/not-read-by-captured-bridge',
    endpoint: 'http://127.0.0.1:18080',
    model: 'Qwen3.5-4B-Q4_K_M',
    runtimeMode: CAPABILITY_ASSIMILATION_MODES.ADOPTED_READ_ONLY,
    bridgeFactory(options) {
      captured = options;
      return sentinel;
    }
  });

  assert.equal(result, sentinel);
  assert.ok(captured);
  assert.equal(captured.capabilityRuntime.mode, CAPABILITY_ASSIMILATION_MODES.ADOPTED_READ_ONLY);
  assert.equal(typeof captured.capabilityRuntime.resolveTurn, 'function');
  assert.equal(captured.modelConnectionComposer.schemaVersion, 'vexlife.model-connection-turn-composer/v1');
  assert.equal(typeof captured.modelConnectionComposer.composeTurn, 'function');

  const composed = captured.modelConnectionComposer.composeTurn({
    modelTurnWitness: externalWitness(),
    capabilityRuntime: {
      schemaVersion: 'vexlife.capability-assimilation-runtime/v1',
      mode: 'ADOPTED_READ_ONLY',
      capabilityFrameInput: capabilityFrameInput(),
      schedulerDispatchReceipts: [schedulerDispatch()]
    },
    currentContext: {
      projectRef: 'project.local-vex',
      threadRef: 'thread.local-vex.vmcf-server-tail',
      channelRef: 'channel.local-vex.companion',
      screenRef: 'screen.vexlife.chat',
      selectedNodeRef: 'element.channel.companion'
    }
  });

  assert.equal(composed.state, 'CURRENT_SOURCE_BOUND_REUSABLE_PROJECTION');
  assert.deepEqual(composed.actuallyUsedRefs, ['context.where']);
  assert.equal(composed.modelConnectionProjection.modelTurnWitnessRef, externalWitness().witnessRef);
  assert.deepEqual(
    composed.modelConnectionProjection.runtimeCapability.heldCellEntries.map((entry) => entry.cellRef),
    ['C11', 'C12']
  );
  assert.equal(composed.modelConnectionProjection.effectAuthorityGranted, false);
  assert.equal(composed.selfCapabilityFrame.effectAuthorityGranted, false);
});

test('server-owned direct single-turn composition keeps R3 projection ownership absent rather than borrowing adopted truth', () => {
  let captured = null;
  const sentinel = Object.freeze({ ref: 'bridge.vmcf.server-tail.direct' });
  const result = createServerOwnedBrowserCompanionBridge({
    sourceRoot: ROOT,
    companionHome: '/not-read-by-captured-bridge',
    endpoint: 'http://127.0.0.1:18080',
    model: 'Qwen3.5-4B-Q4_K_M',
    runtimeMode: CAPABILITY_ASSIMILATION_MODES.DIRECT_SINGLE_TURN,
    bridgeFactory(options) {
      captured = options;
      return sentinel;
    }
  });

  assert.equal(result, sentinel);
  assert.ok(captured);
  assert.equal(captured.capabilityRuntime, null);
  assert.equal(captured.modelConnectionComposer, null);
});

test('canonical module registries bind the composer to serve-browser exactly once', () => {
  const scripts = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'blueprint/module-registry/scripts.json'),
    'utf8'
  ));
  const modelConnection = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'blueprint/module-registry/model-connection.json'),
    'utf8'
  ));
  const server = scripts.find((entry) => entry.moduleRef === 'module.vexlife.script.serve-browser');
  const composer = modelConnection.find(
    (entry) => entry.moduleRef === 'module.vexlife.core.model-connection-turn-composer'
  );

  assert.ok(server);
  assert.ok(composer);
  assert.equal(
    server.reads.filter((ref) => ref === 'module.vexlife.core.model-connection-turn-composer').length,
    1
  );
  assert.equal(
    server.tests.filter((ref) => ref === 'test/browser-model-connection-server-composition.test.mjs').length,
    1
  );
  assert.equal(
    composer.loadedBy.filter((ref) => ref === 'module.vexlife.script.serve-browser').length,
    1
  );
});

// [VXG RealForever]
