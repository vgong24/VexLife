import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadBlueprint } from '../src/core/blueprint.mjs';
import { createCapabilityAssimilationRuntime } from '../src/core/capability-assimilation-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = loadBlueprint(root);

function fixedClock() {
  let value = Date.parse('2026-09-01T10:00:00.000Z');
  return () => value += 250;
}

function requestResult(requests) {
  return {
    content: JSON.stringify({
      intentDisposition: 'REQUEST_READ_ONLY_FUNCTIONS',
      requests
    }),
    model: 'model.test.r004-request'
  };
}

test('R004 removes the R003 scheduler-ownership graft and binds only the accepted generic practice envelope', () => {
  const source = fs.readFileSync(path.join(root, 'src/core/capability-assimilation-runtime.mjs'), 'utf8');
  assert.doesNotMatch(source, /function runtimeSchedulerRegistry/u);
  assert.doesNotMatch(source, /function rootCapabilityContracts/u);
  assert.match(source, /contract\.intent-scheduler\.mock-tool\.capability-practice-read\/v1/u);
  assert.match(source, /CompanionReadRuntimeAuthority/u);
  assert.match(source, /SingleWorkerIntentScheduler/u);
  assert.match(source, /createToolCall/u);

  const capabilityEffects = new Set(
    bundle.capabilities.capabilities
      .filter((item) => ['capability.search','capability.describe','process.resolve','context.where','help.render'].includes(item.capabilityRef))
      .map((item) => item.toolContract.effectRef)
  );
  assert.deepEqual([...capabilityEffects], ['effect.vexlife.read-only']);
  assert.equal(
    bundle.schedulerRegistry.mockToolContracts.some((item) => item.effectRef === 'effect.vexlife.read-only'),
    false
  );
});

test('R004 rejects caller-supplied scheduler admission or lease evidence before inference or executor effect', async () => {
  let inferenceCount = 0;
  let executorCount = 0;
  const runtime = createCapabilityAssimilationRuntime({
    capabilityRegistry: bundle.capabilities,
    processFactoryDefinition: bundle.factory,
    schedulerRegistry: bundle.schedulerRegistry,
    clock: fixedClock(),
    executors: {
      'capability.search': async () => {
        executorCount += 1;
        return {};
      }
    }
  });

  await assert.rejects(() => runtime.resolveTurn({
    taskIntent: 'Do not trust caller scheduler evidence.',
    inference: async () => {
      inferenceCount += 1;
      return requestResult([{ requestRef: 'read.search', capabilityRef: 'capability.search', arguments: {}, dependencyRefs: [] }]);
    },
    endpointProfile: { profileRef: 'profile.test', admitted: true, endpoint: 'http://127.0.0.1:1', model: 'test' },
    context: {
      taskRef: 'task.r004.hostile-caller',
      schedulerAdmission: { plausible: true },
      workerLease: { plausible: true }
    }
  }), /caller cannot supply scheduler admission or lease evidence/u);

  assert.equal(inferenceCount, 0);
  assert.equal(executorCount, 0);
});

test('R004 independent capability reads use distinct source-managed slots and one generic scheduler contract each', async () => {
  let inferenceCount = 0;
  const runtime = createCapabilityAssimilationRuntime({
    capabilityRegistry: bundle.capabilities,
    processFactoryDefinition: bundle.factory,
    schedulerRegistry: bundle.schedulerRegistry,
    clock: fixedClock(),
    exactlyOnceNegativeControl: true
  });

  const result = await runtime.resolveTurn({
    taskIntent: 'Observe capability search and current context, then synthesize.',
    inference: async () => {
      inferenceCount += 1;
      return inferenceCount === 1
        ? requestResult([
            { requestRef: 'read.search', capabilityRef: 'capability.search', arguments: { query: 'capability' }, dependencyRefs: [] },
            { requestRef: 'read.context', capabilityRef: 'context.where', arguments: {}, dependencyRefs: [] }
          ])
        : { content: 'R004 synthesis complete.', model: 'model.test.r004-synthesis' };
    },
    endpointProfile: { profileRef: 'profile.test', admitted: true, endpoint: 'http://127.0.0.1:1', model: 'test' },
    context: { taskRef: 'task.r004.parallel', threadRef: 'thread.r004.parallel' }
  });

  assert.equal(result.response.content, 'R004 synthesis complete.');
  assert.equal(inferenceCount, 2);
  assert.equal(result.runtimeProjection.schedulerDispatchReceipts.length, 2);
  const receipts = [...result.runtimeProjection.schedulerDispatchReceipts].sort((a, b) => a.requestRef.localeCompare(b.requestRef));
  assert.equal(new Set(receipts.map((item) => item.workerRef)).size, 2);
  assert.ok(receipts.every((item) =>
    item.toolContractRef === 'contract.intent-scheduler.mock-tool.capability-practice-read/v1' &&
    item.toolRef === 'tool.mock.capability-practice-read' &&
    item.effectRef === 'effect.mock.capability-practice-read' &&
    item.capabilityEffectRef === 'effect.vexlife.read-only' &&
    item.completionReceiptRef &&
    item.completionReceiptFingerprint &&
    item.externalEffectsExecuted === false
  ));
  assert.deepEqual(
    receipts.map((item) => item.capabilityToolRef).sort(),
    ['capability.search', 'context.where'].map((capabilityRef) => bundle.capabilities.capabilities.find((item) => item.capabilityRef === capabilityRef).toolContract.toolRef).sort()
  );
  assert.ok(receipts.every((item) => item.workerRef.startsWith('worker.companion.read.slot.')));
  assert.equal(result.runtimeProjection.exactlyOnceReceipts.length, 2);
});

test('R004 capability ownership remains outside scheduler-owned identity space', () => {
  const practice = bundle.schedulerRegistry.mockToolContracts.find((item) =>
    item.contractRef === 'contract.intent-scheduler.mock-tool.capability-practice-read/v1'
  );
  assert.ok(practice);
  assert.equal(practice.toolRef, 'tool.mock.capability-practice-read');
  assert.equal(practice.effectRef, 'effect.mock.capability-practice-read');
  for (const capability of bundle.capabilities.capabilities.filter((item) => item.rootKernel === true)) {
    assert.notEqual(capability.toolContract.toolRef, practice.toolRef);
    assert.notEqual(capability.toolContract.effectRef, practice.effectRef);
  }
});

// [VXG RealForever]
