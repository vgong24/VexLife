import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadBlueprint } from '../src/core/blueprint.mjs';
import {
  CAPABILITY_ASSIMILATION_MODES,
  createCapabilityAssimilationRuntime
} from '../src/core/capability-assimilation-runtime.mjs';
import {
  ROOT_CAPABILITY_KERNEL,
  compileCapabilityFrame,
  projectCapabilityFrontier
} from '../src/core/capability.mjs';
import { initializeLivedCompanionHome, performLivedCompanionTurn } from '../src/core/lived-companion.mjs';
import { compileDependencyDag } from '../src/core/process-factory.mjs';
import { selectIndependentReadOnlyBatch } from '../src/core/intent-scheduler.mjs';

const bundle = loadBlueprint();

function fixedClock() {
  let time = Date.parse('2026-08-31T03:00:00.000Z');
  return () => time += 100;
}

function requestResult(requests) {
  return {
    content: JSON.stringify({
      intentDisposition: 'REQUEST_READ_ONLY_FUNCTIONS',
      requests
    }),
    model: 'model.test.request-formation'
  };
}

test('root capability kernel is always visible and projects every required frontier field', () => {
  const frame = compileCapabilityFrame(bundle.capabilities, {
    roleRef: 'role.unknown.cold-companion',
    platformRef: 'platform.unknown',
    projectCapabilityStages: Object.fromEntries(ROOT_CAPABILITY_KERNEL.map((ref) => [ref, 'COMPLETED'])),
    permissionStages: { 'permission.none': 'COMPLETED' },
    effectStages: { READ_ONLY: 'COMPLETED' },
    resourceStages: { IO_BOUNDED: 'COMPLETED' }
  });
  assert.deepEqual(frame.rootCapabilityKernel, [...ROOT_CAPABILITY_KERNEL].sort());
  for (const ref of ROOT_CAPABILITY_KERNEL) {
    const entry = frame.entries.find((item) => item.capabilityRef === ref);
    assert.ok(entry, ref);
    assert.equal(entry.rootKernel, true);
    assert.equal(entry.effectClass, 'READ_ONLY');
    assert.equal(entry.currentness.state, 'CURRENT');
    assert.equal(entry.competenceState, 'BOUNDED_COMPETENT');
    assert.equal(entry.parallelClass, 'INDEPENDENT_READ_ONLY');
  }
  const frontier = projectCapabilityFrontier(frame);
  for (const entry of frontier.entries) {
    for (const field of [
      'childCapabilityRefs',
      'recommendedNextCapabilityRefs',
      'heldNextCapabilities',
      'unknownDoorRefs',
      'competenceState',
      'currentness',
      'permissionStage',
      'effectStage',
      'resourceStage',
      'parallelClass',
      'dependencyRefs'
    ]) assert.ok(Object.hasOwn(entry, field), `${entry.capabilityRef} missing ${field}`);
  }
});

test('Process Factory dependency DAG is deterministic and cycles fail closed', () => {
  const dag = compileDependencyDag([
    { nodeRef: 'read.a', effectClass: 'READ_ONLY', parallelClass: 'INDEPENDENT_READ_ONLY', dependencyRefs: [] },
    { nodeRef: 'read.b', effectClass: 'READ_ONLY', parallelClass: 'INDEPENDENT_READ_ONLY', dependencyRefs: [] },
    { nodeRef: 'synthesize', effectClass: 'SERIAL_PROCESS_STEP', dependencyRefs: ['read.a', 'read.b'] }
  ]);
  assert.deepEqual(dag.topologicalOrder, ['read.a', 'read.b', 'synthesize']);
  assert.match(dag.graphHash, /^[a-f0-9]{64}$/u);
  assert.throws(() => compileDependencyDag([
    { nodeRef: 'a', dependencyRefs: ['b'] },
    { nodeRef: 'b', dependencyRefs: ['a'] }
  ]), /cycle/u);
});

test('Intent Scheduler batches only independent exact-current read-only nodes', () => {
  const selected = selectIndependentReadOnlyBatch({
    nodes: [
      { nodeRef: 'read.a', dependencyRefs: [], effectClass: 'READ_ONLY', parallelClass: 'INDEPENDENT_READ_ONLY' },
      { nodeRef: 'read.b', dependencyRefs: [], effectClass: 'READ_ONLY', parallelClass: 'INDEPENDENT_READ_ONLY' },
      { nodeRef: 'write.c', dependencyRefs: [], effectClass: 'LOCAL_WRITE', parallelClass: 'SERIAL_EFFECT' },
      { nodeRef: 'read.d', dependencyRefs: ['read.a'], effectClass: 'READ_ONLY', parallelClass: 'INDEPENDENT_READ_ONLY' }
    ],
    currentnessByNodeRef: { 'read.a': 'CURRENT', 'read.b': 'CURRENT', 'write.c': 'CURRENT', 'read.d': 'CURRENT' },
    authorityByNodeRef: { 'read.a': 'ADMITTED', 'read.b': 'ADMITTED', 'write.c': 'ADMITTED', 'read.d': 'ADMITTED' },
    resourceByNodeRef: { 'read.a': 'AVAILABLE', 'read.b': 'AVAILABLE', 'write.c': 'AVAILABLE', 'read.d': 'AVAILABLE' }
  });
  assert.deepEqual(selected.batch.map((node) => node.nodeRef), ['read.a', 'read.b']);
  assert.ok(selected.held.some((item) => item.nodeRef === 'write.c' && item.state === 'HELD_EFFECT_SERIALIZATION_REQUIRED'));
  assert.ok(selected.held.some((item) => item.nodeRef === 'read.d' && item.state === 'BLOCKED_DEPENDENCY'));
  assert.equal(selected.modelInferenceConcurrency, 1);
});

test('runtime executes independent reads concurrently, uses ToolResultRelay exactly once, then synthesizes once', async () => {
  let inferenceCount = 0;
  let activeReads = 0;
  let maximumActiveReads = 0;
  const sequence = [];
  const inference = async () => {
    inferenceCount += 1;
    if (inferenceCount === 1) return requestResult([
      { requestRef: 'read.search', capabilityRef: 'capability.search', arguments: { query: 'capability' }, dependencyRefs: [] },
      { requestRef: 'read.context', capabilityRef: 'context.where', arguments: {}, dependencyRefs: [] }
    ]);
    return { content: 'Synthesized from two current observations.', model: 'model.test.synthesis' };
  };
  const delayed = (name) => async () => {
    sequence.push(`start:${name}`);
    activeReads += 1;
    maximumActiveReads = Math.max(maximumActiveReads, activeReads);
    await new Promise((resolve) => setTimeout(resolve, 25));
    activeReads -= 1;
    sequence.push(`end:${name}`);
    return {
      summaryRef: `summary.${name}`,
      capabilityRef: name,
      sourceRefs: [`source.${name}`],
      currentness: { state: 'CURRENT', sourceRef: `source.${name}`, compatibility: 'COMPATIBLE' },
      payload: { name }
    };
  };
  const runtime = createCapabilityAssimilationRuntime({
    capabilityRegistry: bundle.capabilities,
    processFactoryDefinition: bundle.factory,
    schedulerRegistry: bundle.schedulerRegistry,
    clock: fixedClock(),
    exactlyOnceNegativeControl: true,
    executors: {
      'capability.search': delayed('capability.search'),
      'context.where': delayed('context.where')
    }
  });
  const result = await runtime.resolveTurn({
    taskIntent: 'Find current capability and context information.',
    inference,
    endpointProfile: { profileRef: 'profile.test', admitted: true, endpoint: 'http://127.0.0.1:1', model: 'test' },
    context: { taskRef: 'task.test.parallel', threadRef: 'thread.test.parallel' }
  });
  assert.equal(result.response.content, 'Synthesized from two current observations.');
  assert.equal(inferenceCount, 2);
  assert.equal(maximumActiveReads, 2);
  assert.equal(result.runtimeProjection.toolRequestCount, 2);
  assert.equal(result.runtimeProjection.observationRefs.length, 2);
  assert.equal(result.runtimeProjection.exactlyOnceReceipts.length, 2);
  assert.equal(result.runtimeProjection.modelSequenceReceipts.length, 2);
  assert.ok(result.runtimeProjection.modelSequenceReceipts.every((item) =>
    item.schedulerPolicyRef === bundle.schedulerRegistry.physicalWorkerPolicy.policyRef &&
    item.modelInferenceConcurrency === 1));
  assert.ok(result.runtimeProjection.exactlyOnceReceipts.every((item) =>
    item.duplicateAcceptReason === 'DUPLICATE_RESULT' &&
    item.duplicateReinjectReason === 'OBSERVATION_ALREADY_REINJECTED'));
  assert.ok(result.runtimeProjection.progress.every((item) => item.hiddenReasoningIncluded === false));
  assert.equal(result.runtimeProjection.externalEffectsExecuted, false);
  assert.equal(result.runtimeProjection.capabilityFrameInput.roleRef, 'role.vex.companion');
  assert.equal(result.runtimeProjection.capabilityFrameInput.platformRef, 'platform.browser');
  assert.deepEqual(result.runtimeProjection.capabilityFrameInput.projectCapabilityStages,
    Object.fromEntries(ROOT_CAPABILITY_KERNEL.map((ref) => [ref, 'COMPLETED'])));
  assert.equal(result.runtimeProjection.capabilityFrameInput.effectStages.READ_ONLY, 'COMPLETED');
  assert.equal(sequence.filter((item) => item.startsWith('start:')).length, 2);
});

test('source-managed scheduler gate serializes model inference across simultaneous Companion turns', async () => {
  let activeInferences = 0;
  let maximumActiveInferences = 0;
  const inference = async ({ requestContent }) => {
    activeInferences += 1;
    maximumActiveInferences = Math.max(maximumActiveInferences, activeInferences);
    await new Promise((resolve) => setTimeout(resolve, 15));
    activeInferences -= 1;
    if (requestContent.startsWith('VEXLIFE_CAPABILITY_REQUEST_FORMATION/v1')) {
      const task = requestContent.includes('first simultaneous turn') ? 'first' : 'second';
      return requestResult([{ requestRef: `read.${task}`, capabilityRef: 'context.where', arguments: {}, dependencyRefs: [] }]);
    }
    return { content: 'Serialized synthesis.', model: 'model.test.serialized' };
  };
  const runtime = createCapabilityAssimilationRuntime({
    capabilityRegistry: structuredClone(bundle.capabilities),
    processFactoryDefinition: bundle.factory,
    schedulerRegistry: bundle.schedulerRegistry,
    clock: fixedClock()
  });
  const endpointProfile = { profileRef: 'profile.test', admitted: true, endpoint: 'http://127.0.0.1:1', model: 'test' };
  const [first, second] = await Promise.all([
    runtime.resolveTurn({ taskIntent: 'first simultaneous turn', inference, endpointProfile, context: { taskRef: 'task.concurrent.first' } }),
    runtime.resolveTurn({ taskIntent: 'second simultaneous turn', inference, endpointProfile, context: { taskRef: 'task.concurrent.second' } })
  ]);
  assert.equal(maximumActiveInferences, 1);
  assert.equal(first.runtimeProjection.modelSequenceReceipts.length, 2);
  assert.equal(second.runtimeProjection.modelSequenceReceipts.length, 2);
  assert.deepEqual(
    [...first.runtimeProjection.modelSequenceReceipts, ...second.runtimeProjection.modelSequenceReceipts]
      .map((item) => item.sequence).sort((a, b) => a - b),
    [1, 2, 3, 4]
  );
});

test('execution currentness and authority are revalidated and revocation never reaches relay acceptance', async () => {
  const capabilityRegistry = structuredClone(bundle.capabilities);
  let inferenceCount = 0;
  let executorCount = 0;
  const runtime = createCapabilityAssimilationRuntime({
    capabilityRegistry,
    processFactoryDefinition: bundle.factory,
    schedulerRegistry: bundle.schedulerRegistry,
    clock: fixedClock(),
    executors: {
      'capability.search': async () => {
        executorCount += 1;
        const source = capabilityRegistry.capabilities.find((item) => item.capabilityRef === 'capability.search');
        source.currentness = { ...source.currentness, state: 'STALE' };
        return {
          summaryRef: 'summary.search.revoked',
          capabilityRef: 'capability.search',
          sourceRefs: ['source.search.revoked'],
          currentness: { state: 'CURRENT', sourceRef: 'source.search.revoked', compatibility: 'COMPATIBLE' },
          payload: {}
        };
      }
    }
  });
  await assert.rejects(() => runtime.resolveTurn({
    taskIntent: 'Search current capabilities.',
    inference: async () => {
      inferenceCount += 1;
      return inferenceCount === 1
        ? requestResult([{ requestRef: 'search', capabilityRef: 'capability.search', arguments: {}, dependencyRefs: [] }])
        : { content: 'Must not synthesize.', model: 'model.test.should-not-run' };
    },
    endpointProfile: { profileRef: 'profile.test', admitted: true, endpoint: 'http://127.0.0.1:1', model: 'test' }
  }), /execution evidence changed or was revoked before relay acceptance/u);
  assert.equal(executorCount, 1);
  assert.equal(inferenceCount, 1);

  const revokedBeforeFormation = structuredClone(bundle.capabilities);
  revokedBeforeFormation.capabilities.find((item) => item.capabilityRef === 'capability.search').permissionRef = 'permission.revoked';
  let revokedExecutorCount = 0;
  const revokedRuntime = createCapabilityAssimilationRuntime({
    capabilityRegistry: revokedBeforeFormation,
    processFactoryDefinition: bundle.factory,
    schedulerRegistry: bundle.schedulerRegistry,
    clock: fixedClock(),
    executors: { 'capability.search': async () => { revokedExecutorCount += 1; return {}; } }
  });
  await assert.rejects(() => revokedRuntime.resolveTurn({
    taskIntent: 'Search with revoked authority.',
    inference: async () => requestResult([{ requestRef: 'search', capabilityRef: 'capability.search', arguments: {}, dependencyRefs: [] }]),
    endpointProfile: { profileRef: 'profile.test', admitted: true, endpoint: 'http://127.0.0.1:1', model: 'test' }
  }), /capability is not executable/u);
  assert.equal(revokedExecutorCount, 0);
});

test('true request dependencies serialize read-only functions', async () => {
  let inferenceCount = 0;
  const sequence = [];
  const runtime = createCapabilityAssimilationRuntime({
    capabilityRegistry: bundle.capabilities,
    processFactoryDefinition: bundle.factory,
    schedulerRegistry: bundle.schedulerRegistry,
    clock: fixedClock(),
    executors: {
      'capability.search': async () => {
        sequence.push('search');
        return {
          summaryRef: 'summary.search', capabilityRef: 'capability.search', sourceRefs: ['source.search'],
          currentness: { state: 'CURRENT', sourceRef: 'source.search', compatibility: 'COMPATIBLE' }, payload: {}
        };
      },
      'capability.describe': async () => {
        sequence.push('describe');
        return {
          summaryRef: 'summary.describe', capabilityRef: 'capability.describe', sourceRefs: ['source.describe'],
          currentness: { state: 'CURRENT', sourceRef: 'source.describe', compatibility: 'COMPATIBLE' }, payload: {}
        };
      }
    }
  });
  await runtime.resolveTurn({
    taskIntent: 'Search, then describe.',
    inference: async () => {
      inferenceCount += 1;
      return inferenceCount === 1 ? requestResult([
        { requestRef: 'search', capabilityRef: 'capability.search', arguments: {}, dependencyRefs: [] },
        { requestRef: 'describe', capabilityRef: 'capability.describe', arguments: {}, dependencyRefs: ['search'] }
      ]) : { content: 'Done.', model: 'model.test.synthesis' };
    },
    endpointProfile: { profileRef: 'profile.test', admitted: true, endpoint: 'http://127.0.0.1:1', model: 'test' }
  });
  assert.deepEqual(sequence, ['search', 'describe']);
  assert.equal(inferenceCount, 2);
});

test('canonical E2 untaught-G0 policy is tool-free and performs one direct inference', async () => {
  let inferenceCount = 0;
  let executorCount = 0;
  const runtime = createCapabilityAssimilationRuntime({
    capabilityRegistry: bundle.capabilities,
    processFactoryDefinition: bundle.factory,
    schedulerRegistry: bundle.schedulerRegistry,
    mode: CAPABILITY_ASSIMILATION_MODES.CANONICAL_E2_UNTAUGHT_G0,
    clock: fixedClock(),
    executors: {
      'capability.search': async () => {
        executorCount += 1;
        return {};
      }
    }
  });
  const original = 'Untaught G0 prompt with no capability cue.';
  const result = await runtime.resolveTurn({
    taskIntent: original,
    inference: async ({ requestContent }) => {
      inferenceCount += 1;
      assert.equal(requestContent, original);
      return { content: 'Direct baseline response.', model: 'model.test.e2' };
    },
    endpointProfile: { profileRef: 'profile.test', admitted: true, endpoint: 'http://127.0.0.1:1', model: 'test' }
  });
  assert.equal(inferenceCount, 1);
  assert.equal(executorCount, 0);
  assert.equal(result.runtimeProjection.toolRequestCount, 0);
  assert.equal(result.runtimeProjection.modelSequenceReceipts.length, 1);
  assert.equal(result.runtimeProjection.mode, CAPABILITY_ASSIMILATION_MODES.CANONICAL_E2_UNTAUGHT_G0);
  assert.equal(Object.hasOwn(result.runtimeProjection, 'capabilityFrameInput'), false);
});

test('Lived Companion response resolver persists only the human request and final synthesis', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-capability-runtime-lived-'));
  const home = path.join(root, 'home');
  try {
    initializeLivedCompanionHome({
      home,
      homeRef: 'vex-home.capability-runtime-test',
      familyRef: 'vex-family.capability-runtime-test',
      deviceRef: 'device.vexlife.capability-runtime-test',
      companionLineageRef: 'companion-lineage.vexlife.capability-runtime-test'
    });
    const completed = await performLivedCompanionTurn({
      home,
      homeRef: 'vex-home.capability-runtime-test',
      deviceRef: 'device.vexlife.capability-runtime-test',
      companionLineageRef: 'companion-lineage.vexlife.capability-runtime-test',
      instanceRef: 'instance.vexlife.capability-runtime-test',
      threadRef: 'thread.vexlife.capability-runtime-test',
      channelRef: 'channel.vexlife.capability-runtime-test',
      turnRef: 'turn.vexlife.capability-runtime-test',
      requestMessageRef: 'message.vexlife.capability-runtime-test.request',
      responseMessageRef: 'message.vexlife.capability-runtime-test.response',
      speakerRef: 'person.local-user',
      recipientRefs: ['role.vex.companion'],
      content: 'Use current observations, then synthesize.',
      endpointProfile: {
        profileRef: 'profile.vexlife.capability-runtime-test',
        admitted: true,
        endpoint: 'http://127.0.0.1:1',
        model: 'test'
      },
      responseResolver: async () => ({
        response: { content: 'Final synthesized response.', model: 'model.test.synthesis' },
        contextSourceRefs: ['observation.capability-runtime-test'],
        runtimeProjection: {
          schemaVersion: 'vexlife.capability-assimilation-runtime/v1',
          inferenceCount: 2,
          observationRefs: ['observation.capability-runtime-test'],
          hiddenReasoningIncluded: false
        },
        actualHttpCall: true
      })
    });
    assert.equal(completed.responseEvent.content, 'Final synthesized response.');
    assert.equal(completed.responseDurablyRecorded, true);
    assert.equal(completed.runtimeProjection.inferenceCount, 2);
    assert.ok(completed.contextRecord.contextSourceRefs.includes('observation.capability-runtime-test'));
    const eventsRoot = path.join(home, 'conversations', 'companion-lineage.vexlife.capability-runtime-test', 'thread.vexlife.capability-runtime-test', 'events');
    const events = fs.readdirSync(eventsRoot).map((name) => JSON.parse(fs.readFileSync(path.join(eventsRoot, name), 'utf8')));
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((event) => event.eventKind).sort(), ['REQUEST', 'RESPONSE']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// [VXG RealForever]
