import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadBlueprint } from '../src/core/blueprint.mjs';
import {
  resolveMockToolContract,
  validateIntentSchedulerRegistry
} from '../src/core/scheduler-runtime-trust.mjs';
import { createToolCall, ToolResultRelay } from '../src/core/tool-result-relay.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schedulerRegistry = JSON.parse(
  fs.readFileSync(path.join(root, 'blueprint/intent-scheduler-registry.json'), 'utf8')
);
const diagnosticBundle = loadBlueprint(root);
const diagnosticAuthority = diagnosticBundle.blueprint.concernWatch.schedulerIntegration.externalSchedulerAuthority;
const diagnosticActual = {
  intentRegistryRef: diagnosticBundle.intentRegistry.registryRef,
  intentRegistryFingerprint: semanticHash(diagnosticBundle.intentRegistry),
  schedulerRegistryRef: diagnosticBundle.schedulerRegistry.registryRef,
  schedulerRegistryFingerprint: semanticHash(diagnosticBundle.schedulerRegistry),
  registeredProcessRefsFingerprint: semanticHash(
    [...diagnosticBundle.factory.processes.map((item) => item.processRef)].sort()
  ),
  registeredRoleRefsFingerprint: semanticHash(
    [...diagnosticBundle.blueprint.roles.map((item) => item.roleRef)].sort()
  )
};
const diagnosticExpected = {
  intentRegistryRef: diagnosticAuthority.intentRegistryRef,
  intentRegistryFingerprint: diagnosticAuthority.intentRegistryFingerprint,
  schedulerRegistryRef: diagnosticAuthority.schedulerRegistryRef,
  schedulerRegistryFingerprint: diagnosticAuthority.schedulerRegistryFingerprint,
  registeredProcessRefsFingerprint: diagnosticAuthority.registeredProcessRefsFingerprint,
  registeredRoleRefsFingerprint: diagnosticAuthority.registeredRoleRefsFingerprint
};
console.log(`# HS353_AUTHORITY_CONTEXT ${JSON.stringify({ actual: diagnosticActual, expected: diagnosticExpected })}`);

const PRACTICE = {
  contractRef: 'contract.intent-scheduler.mock-tool.capability-practice-read/v1',
  toolRef: 'tool.mock.capability-practice-read',
  effectRef: 'effect.mock.capability-practice-read',
  argumentSchemaRef: 'schema.tool.mock.capability-practice-read/v1',
  resultSchemaRef: 'schema.tool.mock.capability-practice-observation/v1',
  executorRef: 'executor.mock.deterministic.capability-practice-read',
  requiredArgumentFields: [
    'capabilityRef',
    'capabilityToolRef',
    'capabilityEffectRef',
    'capabilityArguments'
  ],
  requiredResultFields: [
    'summaryRef',
    'capabilityRef',
    'sourceRefs',
    'currentness',
    'payload'
  ],
  maxObservationBytes: 8192,
  externalEffectsExecuted: false
};

const INSPECT = {
  contractRef: 'contract.intent-scheduler.mock-tool.inspect/v0',
  toolRef: 'tool.mock.inspect',
  effectRef: 'effect.mock.read',
  argumentSchemaRef: 'schema.tool.mock.inspect/v0',
  resultSchemaRef: 'schema.tool.mock.result/v0',
  executorRef: 'executor.mock.deterministic.inspect',
  requiredArgumentFields: ['sourceRef'],
  requiredResultFields: ['summaryRef'],
  maxObservationBytes: 1024,
  externalEffectsExecuted: false
};

const FORMED = '2026-09-01T03:00:00.000Z';
const OBSERVED = '2026-09-01T03:01:00.000Z';
const RESULT_AT = '2026-09-01T03:02:00.000Z';
const EXPIRES = '2026-09-01T03:10:00.000Z';
const RUNTIME_FINGERPRINT = 'runtime-fingerprint.capability-practice';
const GRAPH_FINGERPRINT = 'graph-fingerprint.capability-practice';
const TRUST_FINGERPRINT = 'trust-fingerprint.capability-practice';
const WORK_NODE_REF = 'work.intent-scheduler.capability-practice';
const WORKER_REF = 'worker.companion.read.slot.01';
const GENERATION = 7;
const CANCELLATION_TOKEN_REF = 'cancellation-token.capability-practice';

function activeLease(label, extras = {}) {
  return {
    leaseRef: `${label}-lease.capability-practice`,
    workNodeRef: WORK_NODE_REF,
    graphFingerprint: GRAPH_FINGERPRINT,
    runtimeSnapshotFingerprint: RUNTIME_FINGERPRINT,
    schedulerGeneration: GENERATION,
    formedAt: FORMED,
    observedAt: OBSERVED,
    expiresAt: EXPIRES,
    currentness: 'CURRENT',
    lifecycle: 'ACTIVE',
    semanticFingerprint: `${label}-fingerprint.capability-practice`,
    ...extras
  };
}

function exactToolCall(overrides = {}) {
  const workerLease = activeLease('worker', {
    workerRef: WORKER_REF,
    schedulerInstanceRef: 'instance.intent-scheduler.capability-practice'
  });
  const contextLease = activeLease('context', {
    cancellationTokenRef: CANCELLATION_TOKEN_REF,
    trustSnapshotFingerprint: TRUST_FINGERPRINT
  });
  const capabilityLease = activeLease('capability', {
    toolRefs: [PRACTICE.toolRef]
  });
  const effectLease = activeLease('effect', {
    effectDisposition: 'EFFECT_ENVELOPE_BOUND',
    allowedEffectRefs: [PRACTICE.effectRef]
  });
  const resourceLease = activeLease('resource');
  const runtimeTrustSnapshot = {
    semanticFingerprint: RUNTIME_FINGERPRINT,
    schedulerGeneration: GENERATION,
    workerRef: WORKER_REF
  };
  const input = {
    toolCallRef: 'tool-call.capability-practice',
    workNodeRef: WORK_NODE_REF,
    toolRef: PRACTICE.toolRef,
    effectRef: PRACTICE.effectRef,
    arguments: {
      capabilityRef: 'capability.search',
      capabilityToolRef: 'tool.vexlife.capability.search',
      capabilityEffectRef: 'effect.vexlife.read-only',
      capabilityArguments: { query: 'current source' }
    },
    schedulerGeneration: GENERATION,
    cancellationTokenRef: CANCELLATION_TOKEN_REF,
    sourceEvidenceRef: 'source.capability-practice.test',
    sourceEvidenceHash: 'a'.repeat(64),
    proposedAt: FORMED,
    timeoutAt: EXPIRES,
    cancellationPolicy: 'CANCEL_ON_TIMEOUT',
    ...overrides
  };
  return createToolCall(input, {
    contextLease,
    capabilityLease,
    effectLease,
    resourceLease,
    workerLease,
    runtimeTrustSnapshot,
    schedulerRegistry,
    observedAt: OBSERVED
  });
}

function resultFrom(call, observation, overrides = {}) {
  return {
    toolCallRef: call.toolCallRef,
    observationRef: 'observation.capability-practice',
    workNodeRef: call.workNodeRef,
    workerRef: call.workerRef,
    workerLeaseRef: call.workerLeaseRef,
    graphFingerprint: call.graphFingerprint,
    trustSnapshotFingerprint: call.trustSnapshotFingerprint,
    runtimeSnapshotFingerprint: call.runtimeSnapshotFingerprint,
    contextLeaseRef: call.contextLeaseRef,
    contextLeaseFingerprint: call.contextLeaseFingerprint,
    toolRef: call.toolRef,
    effectRef: call.effectRef,
    capabilityLeaseFingerprint: call.capabilityLeaseFingerprint,
    effectLeaseFingerprint: call.effectLeaseFingerprint,
    resourceLeaseFingerprint: call.resourceLeaseFingerprint,
    schedulerGeneration: call.schedulerGeneration,
    cancellationTokenRef: call.cancellationTokenRef,
    executorRef: call.executorRef,
    sourceEvidenceRef: call.sourceEvidenceRef,
    sourceEvidenceHash: call.sourceEvidenceHash,
    schemaRef: call.resultSchemaRef,
    observation,
    artifactRefs: [],
    ...overrides
  };
}

test('capability-practice contract is one unique scheduler-owned no-effect envelope', () => {
  const validation = validateIntentSchedulerRegistry(schedulerRegistry);
  assert.equal(validation.ok, true, validation.errors.join('\n'));

  const contract = resolveMockToolContract(schedulerRegistry, {
    toolRef: PRACTICE.toolRef,
    effectRef: PRACTICE.effectRef
  });
  assert.deepEqual(contract, PRACTICE);
  assert.deepEqual(
    resolveMockToolContract(schedulerRegistry, { toolRef: INSPECT.toolRef, effectRef: INSPECT.effectRef }),
    INSPECT
  );
  assert.equal(schedulerRegistry.physicalWorkerPolicy.modelInferenceConcurrency, 1);
  assert.equal(
    schedulerRegistry.mockToolContracts.some((item) => item.effectRef === 'effect.vexlife.read-only'),
    false
  );
  assert.equal(
    schedulerRegistry.runtimeSourceIdentities.some((item) =>
      item.sourceRef === 'source.intent-scheduler.companion-read-runtime-observer'
    ),
    true
  );
  assert.deepEqual(
    schedulerRegistry.workerIdentities
      .filter((item) => item.workerRef.startsWith('worker.companion.read.slot.'))
      .map((item) => item.workerRef),
    Array.from({ length: 8 }, (_, index) =>
      `worker.companion.read.slot.${String(index + 1).padStart(2, '0')}`
    )
  );
});

test('the R003 ownership-graft shape is rejected instead of normalizing duplicate capability effects', () => {
  const invalid = structuredClone(schedulerRegistry);
  invalid.mockToolContracts.push(
    {
      ...PRACTICE,
      contractRef: 'contract.test.capability.search',
      toolRef: 'tool.test.capability.search',
      argumentSchemaRef: 'schema.test.capability.search.arguments',
      resultSchemaRef: 'schema.test.capability.search.result',
      executorRef: 'executor.test.capability.search',
      effectRef: 'effect.vexlife.read-only'
    },
    {
      ...PRACTICE,
      contractRef: 'contract.test.process.resolve',
      toolRef: 'tool.test.process.resolve',
      argumentSchemaRef: 'schema.test.process.resolve.arguments',
      resultSchemaRef: 'schema.test.process.resolve.result',
      executorRef: 'executor.test.process.resolve',
      effectRef: 'effect.vexlife.read-only'
    }
  );
  const validation = validateIntentSchedulerRegistry(invalid);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes('scheduler registry contains duplicate owned identity refs'));
});

test('createToolCall binds the practice envelope while capability meaning remains arguments', () => {
  const call = exactToolCall();
  assert.equal(call.toolContractRef, PRACTICE.contractRef);
  assert.equal(call.toolRef, PRACTICE.toolRef);
  assert.equal(call.effectRef, PRACTICE.effectRef);
  assert.equal(call.argumentSchemaRef, PRACTICE.argumentSchemaRef);
  assert.equal(call.resultSchemaRef, PRACTICE.resultSchemaRef);
  assert.equal(call.executorRef, PRACTICE.executorRef);
  assert.equal(call.maxObservationBytes, PRACTICE.maxObservationBytes);
  assert.deepEqual(call.resultRequiredFields, PRACTICE.requiredResultFields);
  assert.equal(call.arguments.capabilityEffectRef, 'effect.vexlife.read-only');

  assert.throws(
    () => exactToolCall({
      arguments: {
        capabilityRef: 'capability.search',
        capabilityToolRef: 'tool.vexlife.capability.search',
        capabilityArguments: {}
      }
    }),
    /tool arguments missing canonical field capabilityEffectRef/u
  );
  assert.throws(
    () => exactToolCall({ effectRef: 'effect.vexlife.read-only' }),
    /unknown canonical mock tool\/effect identity/u
  );
});

test('ToolResultRelay accepts the exact bounded practice observation and rejects schema/size drift', () => {
  const call = exactToolCall();
  const relay = new ToolResultRelay(null, { schedulerRegistry });
  assert.equal(relay.register(call).changed, true);

  const observation = {
    summaryRef: 'summary.capability-practice',
    capabilityRef: call.arguments.capabilityRef,
    sourceRefs: ['source.capability-practice.test'],
    currentness: 'CURRENT',
    payload: { answer: 'bounded no-effect practice' }
  };
  const accepted = relay.accept(resultFrom(call, observation), { receivedAt: RESULT_AT });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.observation.externalEffectsExecuted, false);
  assert.equal(accepted.observation.rawLogsIncluded, false);

  const wrongSchemaRelay = new ToolResultRelay(null, { schedulerRegistry });
  wrongSchemaRelay.register(call);
  const wrongSchema = wrongSchemaRelay.accept(
    resultFrom(call, observation, { schemaRef: 'schema.wrong' }),
    { receivedAt: RESULT_AT }
  );
  assert.equal(wrongSchema.accepted, false);
  assert.equal(wrongSchema.reason, 'RESULT_SCHEMA_MISMATCH');

  const oversizedRelay = new ToolResultRelay(null, { schedulerRegistry });
  oversizedRelay.register(call);
  const oversized = oversizedRelay.accept(
    resultFrom(call, { ...observation, payload: { answer: 'x'.repeat(PRACTICE.maxObservationBytes) } }),
    { receivedAt: RESULT_AT }
  );
  assert.equal(oversized.accepted, false);
  assert.equal(oversized.reason, 'RESULT_OBSERVATION_TOO_LARGE');
});
