import assert from 'node:assert/strict';
import test from 'node:test';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import {
  admitRecoveryCheckpoint,
  closeRecoveredExecution,
  createRecoveryAggregate,
  createRecoveryCheckpoint,
  createUnknownFailureForMalformedInput,
  executeWithRecoveryBoundary,
  projectRecoveryAggregate,
  recordExternalRecoveryEvent,
  recoverContextBudget,
  restoreRecoveryAggregate,
  serializeRecoveryAggregate
} from '../src/core/runtime-recovery.mjs';
import { createFailureEnvelope, validateFailureEnvelope } from '../src/core/runtime-failure.mjs';
import { resolveRecoveryPolicy } from '../src/core/recovery-policy.mjs';
import {
  createDeterministicFaultInjector,
  createNoEffectTransactionalAdapter,
  SimulatedRuntimeFailure,
  simulateTransactionalRecovery
} from '../src/core/recovery-fault-injector.mjs';
import { semanticHash } from '../src/core/utils.mjs';
import { runRecoverySimulation, validateIntegratedRecoverySimulationReceipt } from '../scripts/recovery-simulate.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1').replaceAll('/', process.platform === 'win32' ? '\\' : '/');
const bundle = loadBlueprint(ROOT);
const registry = bundle.blueprint.runtimeRecovery;
const sourceStateFingerprint = semanticHash(registry);
const T0 = '2026-08-01T00:00:00.000Z';
const T1 = '2026-08-01T00:00:01.000Z';
const T2 = '2026-08-01T00:00:02.000Z';

function aggregate(overrides = {}) {
  return createRecoveryAggregate({
    aggregateRef: 'aggregate.runtime-recovery.test',
    workNodeRef: 'work.runtime-recovery.test',
    sourceStateFingerprint,
    schedulerGeneration: 1,
    retryBudget: registry.retryPolicy,
    ...overrides
  }, { registry });
}

function leaseFingerprints(seed = 'lease') {
  return Object.fromEntries(['worker', 'context', 'resource', 'capability', 'effect', 'occupancy']
    .map((kind) => [kind, semanticHash(`${seed}.${kind}`)]));
}

function checkpoint(owner = aggregate(), overrides = {}) {
  return createRecoveryCheckpoint({
    checkpointRef: 'checkpoint.runtime-recovery.test.1',
    workNodeRef: owner.workNodeRef,
    schedulerGeneration: owner.schedulerGeneration,
    sourceStateFingerprint: owner.sourceStateFingerprint,
    schedulerCheckpointFingerprint: semanticHash('scheduler.checkpoint.test'),
    selectedSourceRanges: [{ sourceRef: 'source.test', start: 1, end: 3 }],
    preservedIntentRef: 'intent.test',
    preservedInterpretationRef: 'interpretation.test',
    preservedUnknownRefs: ['unknown.test'],
    preservedAuthorityRef: 'authority.no-effect.test',
    returnRouteRef: 'return.test',
    leaseReleaseFingerprints: leaseFingerprints(),
    currentness: 'CURRENT',
    formedAt: T1,
    ...overrides
  });
}

function executionContext(attemptRef, overrides = {}) {
  return {
    attemptRef,
    operationRef: 'operation.runtime-recovery.test',
    schedulerGeneration: 1,
    originRef: 'origin.runtime-recovery.test',
    expectedTransitionRef: 'transition.expected.test',
    evidenceRefs: ['evidence.test'],
    startedAt: T0,
    observedAt: T1,
    ...overrides
  };
}

test('R0-R2 executor totality forms content-addressed visible failures and never turns partial success green', () => {
  const owner = aggregate();
  const currentCheckpoint = checkpoint(owner);
  const timedOut = executeWithRecoveryBoundary({
    aggregate: owner,
    registry,
    checkpoint: currentCheckpoint,
    executor: () => { throw new SimulatedRuntimeFailure('MODEL_TIMEOUT_SIMULATED', 'same timeout'); },
    context: executionContext('attempt.totality.1')
  });
  assert.equal(timedOut.status, 'FAILED_RECOVERABLE');
  assert.equal(timedOut.policyDecision.retryAuthorized, true);
  assert.equal(validateFailureEnvelope(timedOut.failure, { registry }).ok, true);
  assert.equal(timedOut.failure.failureRef, `failure.vexlife.runtime.${timedOut.failure.semanticFingerprint.slice(0, 32)}`);
  assert.notEqual(timedOut.failure.errorEvidence.message, timedOut.failure.failureRef);

  const partialSuccess = executeWithRecoveryBoundary({
    aggregate: owner,
    registry,
    executor: () => ({ state: 'PASS', partialEffectState: 'POSSIBLE' }),
    context: executionContext('attempt.totality.partial')
  });
  assert.equal(partialSuccess.status, 'FAILED_RECOVERABLE');
  assert.equal(partialSuccess.failure.failureClass, 'MALFORMED_INPUT_OR_RESULT');

  const unknown = createUnknownFailureForMalformedInput({ nope: true }, {
    ...executionContext('attempt.unknown'),
    workNodeRef: owner.workNodeRef,
    sourceStateFingerprint
  }, { registry });
  assert.equal(unknown.failureClass, 'UNKNOWN_FAILURE');
  assert.equal(unknown.partialEffectState, 'UNKNOWN');
  assert.throws(() => createFailureEnvelope({ ...unknown, failureRef: 'failure.forged', error: unknown.errorEvidence }, { registry }), /failureRef/);
});

test('R3-R5 retry and identical-failure recurrence are bounded and require an exact current checkpoint', () => {
  const owner = aggregate();
  const currentCheckpoint = checkpoint(owner);
  const injector = createDeterministicFaultInjector({
    failures: [
      { attempt: 1, failureClass: 'MODEL_TIMEOUT_SIMULATED', message: 'identical timeout' },
      { attempt: 2, failureClass: 'MODEL_TIMEOUT_SIMULATED', message: 'identical timeout' }
    ]
  });
  const first = executeWithRecoveryBoundary({
    aggregate: owner,
    registry,
    checkpoint: currentCheckpoint,
    executor: injector,
    context: executionContext('attempt.recurrence.1')
  });
  assert.equal(first.policyDecision.retryAuthorized, true);
  const second = executeWithRecoveryBoundary({
    aggregate: first.aggregate,
    registry,
    checkpoint: currentCheckpoint,
    executor: injector,
    context: executionContext('attempt.recurrence.2')
  });
  assert.equal(second.policyDecision.identicalFailureCount, 2);
  assert.equal(second.policyDecision.retryAuthorized, false);
  assert.equal(second.status, 'FAILED_NEEDS_HUMAN');

  const noCheckpoint = executeWithRecoveryBoundary({
    aggregate: owner,
    registry,
    executor: () => { throw new SimulatedRuntimeFailure('MODEL_TIMEOUT_SIMULATED', 'timeout'); },
    context: executionContext('attempt.no-checkpoint')
  });
  assert.equal(noCheckpoint.policyDecision.action, 'CHECKPOINT_AND_WAIT');
  assert.equal(noCheckpoint.policyDecision.retryAuthorized, false);
  assert.throws(() => resolveRecoveryPolicy({
    failure: first.failure,
    aggregate: first.aggregate,
    checkpoint: currentCheckpoint,
    observedAt: T1,
    registry,
    callerPreferredAction: 'RETRY_SAME_BUDGET'
  }), /caller-authored recovery authority/);
});

test('R6 and R17 checkpoints reject stale, corrupted, cross-work, wrong-source and non-fresh generation evidence', () => {
  const owner = aggregate();
  const current = checkpoint(owner);
  assert.equal(admitRecoveryCheckpoint(current, owner, {
    nextSchedulerGeneration: 2,
    currentSourceStateFingerprint: sourceStateFingerprint
  }).admitted, true);
  assert.equal(admitRecoveryCheckpoint(current, owner, {
    nextSchedulerGeneration: 1,
    currentSourceStateFingerprint: sourceStateFingerprint
  }).admitted, false);
  assert.equal(admitRecoveryCheckpoint(current, owner, {
    nextSchedulerGeneration: 2,
    currentSourceStateFingerprint: semanticHash('wrong-source')
  }).admitted, false);
  const crossWork = checkpoint(owner, { workNodeRef: 'work.other', semanticFingerprint: undefined });
  assert.equal(admitRecoveryCheckpoint(crossWork, owner, {
    nextSchedulerGeneration: 2,
    currentSourceStateFingerprint: sourceStateFingerprint
  }).admitted, false);
  assert.equal(admitRecoveryCheckpoint({ ...current, semanticFingerprint: '0'.repeat(64) }, owner, {
    nextSchedulerGeneration: 2,
    currentSourceStateFingerprint: sourceStateFingerprint
  }).admitted, false);
});

test('R7-R10 context and resource routes preserve exact coverage, prevent invocation and split or clarify without truncation', () => {
  const common = {
    workNodeRef: 'work.context.test',
    checkpointRef: 'checkpoint.context.test',
    sourceSegments: [
      { sourceRef: 'message.current', start: 0, end: 20, tokenEstimate: 500, eligibleForCondensation: false },
      { sourceRef: 'message.old', start: 20, end: 80, tokenEstimate: 900, eligibleForCondensation: true, candidateSummaryRef: 'summary.old', candidateTokenEstimate: 150 }
    ],
    intentRef: 'intent.context.test',
    interpretationRef: 'interpretation.context.test',
    unknownRefs: ['unknown.context.test'],
    authorityRef: 'authority.context.test',
    returnRouteRef: 'return.context.test',
    inputTokenEstimate: 1400,
    reservedOutputTokens: 300,
    hardTokenLimit: 1200
  };
  const recovered = recoverContextBudget(common);
  assert.equal(recovered.state, 'CONTEXT_REACQUIRED');
  assert.equal(recovered.modelInvoked, false);
  assert.equal(recovered.invisibleTruncation, false);
  assert.deepEqual(recovered.immutableSourceCoverage, [
    { sourceRef: 'message.current', start: 0, end: 20 },
    { sourceRef: 'message.old', start: 20, end: 80 }
  ]);
  assert.equal(recovered.preservedAuthorityRef, common.authorityRef);
  const split = recoverContextBudget({ ...common, hardTokenLimit: 700, splitWorkNodeRef: 'work.context.split' });
  assert.equal(split.action, 'SPLIT_WORK_NODE');
  const clarify = recoverContextBudget({ ...common, hardTokenLimit: 700, clarificationRef: 'question.context.smallest' });
  assert.equal(clarify.action, 'REQUEST_HUMAN_DECISION');
  const blocked = recoverContextBudget({ ...common, hardTokenLimit: 700 });
  assert.equal(blocked.action, 'TERMINAL_BLOCK');
  assert.equal(blocked.sourceHistoryDeleted, false);

  const owner = aggregate();
  const resource = executeWithRecoveryBoundary({
    aggregate: owner,
    registry,
    checkpoint: checkpoint(owner),
    resourceAdmission: { admitted: false, reducedBudgetAdmitted: true },
    executor: () => { throw new SimulatedRuntimeFailure('RESOURCE_EXHAUSTION_SIMULATED', 'resource constrained'); },
    context: executionContext('attempt.resource')
  });
  assert.equal(resource.policyDecision.action, 'RETRY_REDUCED_BUDGET');
});

test('R11-R15 typed timeout, termination, disk, partial-write and network fixtures route without false success', () => {
  const owner = aggregate();
  const currentCheckpoint = checkpoint(owner);
  for (const [failureClass, expectedAction] of [
    ['MODEL_TIMEOUT_SIMULATED', 'RETRY_SAME_BUDGET'],
    ['PROCESS_TERMINATED_SIMULATED', 'RESTORE_LAST_KNOWN_GOOD'],
    ['DISK_FULL_SIMULATED', 'ROLLBACK_TO_BEFORE_IMAGE'],
    ['PARTIAL_WRITE_SIMULATED', 'ROLLBACK_TO_BEFORE_IMAGE'],
    ['NETWORK_INTERRUPTION_SIMULATED', 'ROLLBACK_TO_BEFORE_IMAGE']
  ]) {
    const result = executeWithRecoveryBoundary({
      aggregate: owner,
      registry,
      checkpoint: currentCheckpoint,
      executor: () => { throw new SimulatedRuntimeFailure(failureClass, failureClass, {
        partialEffectState: ['DISK_FULL_SIMULATED', 'PARTIAL_WRITE_SIMULATED', 'NETWORK_INTERRUPTION_SIMULATED'].includes(failureClass)
          ? 'POSSIBLE' : 'NONE'
      }); },
      context: executionContext(`attempt.${failureClass}`)
    });
    assert.notEqual(result.status, 'SUCCEEDED');
    assert.equal(result.policyDecision.action, expectedAction);
  }
});

test('R14, R18 and R19 transactional recovery verifies rollback, exact last-known-good and quarantine on total recovery failure', () => {
  const rolledBack = simulateTransactionalRecovery({
    adapter: createNoEffectTransactionalAdapter({ initialState: { n: 1 }, attemptedState: { n: 2 } }),
    operationRef: 'operation.transaction.rollback',
    expectedBeforeFingerprint: semanticHash({ n: 1 }),
    rollbackReceiptRef: 'receipt.transaction.rollback',
    lastKnownGoodRef: 'state.last-known-good.1',
    observedAt: T1
  });
  assert.equal(rolledBack.state, 'ROLLED_BACK');
  assert.equal(rolledBack.rollbackVerified, true);

  const restored = simulateTransactionalRecovery({
    adapter: createNoEffectTransactionalAdapter({ initialState: { n: 1 }, attemptedState: { n: 2 }, rollbackFails: true }),
    operationRef: 'operation.transaction.restore',
    expectedBeforeFingerprint: semanticHash({ n: 1 }),
    rollbackReceiptRef: 'receipt.transaction.restore',
    lastKnownGoodRef: 'state.last-known-good.2',
    observedAt: T1
  });
  assert.equal(restored.state, 'LAST_KNOWN_GOOD_RESTORED');
  assert.equal(restored.lastKnownGoodRestored, true);

  const quarantined = simulateTransactionalRecovery({
    adapter: createNoEffectTransactionalAdapter({
      initialState: { n: 1 }, attemptedState: { n: 2 }, rollbackFails: true, restoreFails: true
    }),
    operationRef: 'operation.transaction.quarantine',
    expectedBeforeFingerprint: semanticHash({ n: 1 }),
    rollbackReceiptRef: 'receipt.transaction.quarantine',
    lastKnownGoodRef: 'state.last-known-good.3',
    observedAt: T1
  });
  assert.equal(quarantined.state, 'QUARANTINED');
  assert.equal(quarantined.quarantined, true);
});

test('R12 and R16 serialized restart state rejects duplicate, stale and same-ref/different-content external events', () => {
  const owner = restoreRecoveryAggregate(serializeRecoveryAggregate(aggregate()), { registry });
  assert.equal(owner.semanticFingerprint, aggregate().semanticFingerprint);
  const event = { eventRef: 'event.restart.1', workNodeRef: owner.workNodeRef, schedulerGeneration: 1, resultRef: 'result.1' };
  const accepted = recordExternalRecoveryEvent(owner, event, { registry });
  assert.equal(accepted.changed, true);
  assert.equal(recordExternalRecoveryEvent(accepted.aggregate, event, { registry }).changed, false);
  assert.equal(recordExternalRecoveryEvent(accepted.aggregate, { ...event, eventRef: 'event.restart.stale', schedulerGeneration: 0 }, { registry }).changed, false);
  assert.throws(() => recordExternalRecoveryEvent(accepted.aggregate, { ...event, resultRef: 'result.forged' }, { registry }), /same-ref\/different-content/);
  assert.throws(() => restoreRecoveryAggregate('{not-json}', { registry }), /not valid JSON/);
});

test('R20-R22 human gates and Queue/Terrain/Health/Guide derive from one aggregate with semantic no-op suppression', () => {
  const owner = aggregate();
  const human = executeWithRecoveryBoundary({
    aggregate: owner,
    registry,
    executor: () => { throw new SimulatedRuntimeFailure('UNKNOWN_FAILURE', 'unknown'); },
    context: executionContext('attempt.human')
  });
  assert.equal(human.status, 'FAILED_NEEDS_HUMAN');
  assert.equal(human.aggregate.humanDecisionGates.length, 1);
  const projected = projectRecoveryAggregate(human.aggregate);
  assert.equal(projected.projection.guide.victorNeeded, true);
  assert.equal(projected.projection.health.state, 'ATTENTION');
  assert.equal(projectRecoveryAggregate(human.aggregate, { priorProjection: projected.projection }).changed, false);
  assert.equal(Object.hasOwn(projected.projection, 'attemptLedger'), false);
});

test('R23-R24 integrated scheduler/Workgraph recovery receipt is exact, current, no-effect and Blueprint admitted', () => {
  const result = runRecoverySimulation({ root: ROOT, writeReceipt: false });
  const blueprint = validateBlueprint(bundle);
  const validation = validateIntegratedRecoverySimulationReceipt(result.receipt, {
    runtimeRecoveryRegistry: registry,
    blueprintHash: blueprint.semanticHash,
    sourceTreeSha256: result.receipt.sourceTreeSha256,
    repositoryGit: {
      candidateHeadSha: result.receipt.candidateHeadSha,
      checkoutSha: result.receipt.testedCheckoutSha,
      testedMergeSha: result.receipt.testedMergeSha,
      baseSha: result.receipt.baseSha
    }
  });
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  assert.equal(result.receipt.terminalReceipt.schedulerCompletionFingerprint, result.receipt.schedulerBindings.completionFingerprint);
  assert.equal(result.receipt.canonicalWorkNodeFinalState, 'COMPLETED');
  assert.equal(result.receipt.externalEffectsExecuted, false);
  assert.equal(result.receipt.realModelInvoked, false);
  assert.equal(result.receipt.modelWeightsChanged, false);
  const tampered = structuredClone(result.receipt);
  tampered.schedulerBindings.completionFingerprint = '0'.repeat(64);
  assert.equal(validateIntegratedRecoverySimulationReceipt(tampered, {
    runtimeRecoveryRegistry: registry,
    blueprintHash: blueprint.semanticHash,
    sourceTreeSha256: result.receipt.sourceTreeSha256,
    repositoryGit: {
      candidateHeadSha: result.receipt.candidateHeadSha,
      checkoutSha: result.receipt.testedCheckoutSha,
      testedMergeSha: result.receipt.testedMergeSha,
      baseSha: result.receipt.baseSha
    }
  }).ok, false);
});

// [VXG RealForever]
