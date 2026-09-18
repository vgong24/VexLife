import assert from 'node:assert/strict';
import test from 'node:test';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import {
  RECOVERY_EVENT_TYPES,
  admitRecoveryCheckpoint,
  applyRecoveryAction,
  closeRecoveredExecution,
  createExternalRecoveryEventAdoptionReceipt,
  createRecoveryAggregate,
  createRecoveryContinuation,
  createRecoveryConvergenceReceipt,
  executeWithRecoveryBoundary,
  projectRecoveryAggregate,
  recordExternalRecoveryEvent,
  recordRecoveryCheckpointAdmission,
  recordRecoveryPolicyDecision,
  restoreRecoveryAggregate,
  serializeRecoveryAggregate
} from '../src/core/runtime-recovery.mjs';
import {
  createDeterministicClassifiedExecutor,
  createFailureEnvelope,
  classifyThrownFailure,
  issueClassifierPlan,
  validateFailureEnvelope
} from '../src/core/runtime-failure.mjs';
import { resolveRecoveryPolicy } from '../src/core/recovery-policy.mjs';
import {
  createDeterministicFaultInjector,
  createNoEffectTransactionalAdapter,
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
const integrated = runRecoverySimulation({ root: ROOT, writeReceipt: false });

function aggregate(overrides = {}) {
  return createRecoveryAggregate({
    aggregateRef: 'aggregate.runtime-recovery.test',
    workNodeRef: registry.simulationContract.workNodeRef,
    sourceStateFingerprint,
    schedulerGeneration: 1,
    retryBudget: registry.retryPolicy,
    ...overrides
  }, { registry });
}

function context(attemptRef, overrides = {}) {
  return {
    attemptRef,
    operationRef: 'operation.runtime-recovery.test',
    schedulerGeneration: 1,
    originRef: 'origin.runtime-recovery.test',
    expectedTransitionRef: 'expected-transition.intent.contract-current',
    evidenceRefs: ['evidence.runtime-recovery.test'],
    startedAt: T0,
    observedAt: T1,
    completedAt: T1,
    deadlineAt: new Date(Date.parse(T0) + registry.retryPolicy.maximumWallTimeMs).toISOString(),
    ...overrides
  };
}

function eventFingerprint(input) {
  const candidate = structuredClone(input);
  delete candidate.eventRef;
  delete candidate.semanticFingerprint;
  return semanticHash(candidate);
}

function rechain(events) {
  let prior = null;
  return events.map((value, sequence) => {
    const event = structuredClone(value);
    event.sequence = sequence;
    event.priorEventFingerprint = prior;
    event.semanticFingerprint = eventFingerprint(event);
    event.eventRef = `event.runtime-recovery.${event.type.toLowerCase().replaceAll('_', '-')}.${event.semanticFingerprint.slice(0, 32)}`;
    prior = event.semanticFingerprint;
    return event;
  });
}

test('C1 source-managed classification ignores weakening error hints and keeps content-addressed identity', () => {
  const owner = aggregate();
  const executor = createDeterministicFaultInjector({
    registry,
    planRef: 'classifier-plan.runtime-recovery.test.classification',
    failures: [{
      attempt: 1,
      failureClass: 'PARTIAL_WRITE_SIMULATED',
      message: 'partial write',
      partialEffectState: 'NONE',
      humanAttentionClass: 'NONE'
    }]
  });
  const result = executeWithRecoveryBoundary({
    aggregate: owner,
    registry,
    executor,
    context: context('attempt.classification.1')
  });
  assert.equal(result.status, 'FAILED_RECOVERABLE');
  assert.equal(result.failure.partialEffectState, 'CONFIRMED_REVERSIBLE');
  assert.equal(result.failure.humanAttentionClass, 'ONLY_IF_RECOVERY_EXHAUSTED');
  assert.equal(result.failure.classificationSourceRef, 'source.runtime-recovery.deterministic-fault-plan');
  assert.equal(validateFailureEnvelope(result.failure, { registry }).ok, true);
  assert.throws(() => createFailureEnvelope({
    ...result.failure,
    failureRef: 'failure.forged',
    error: result.failure.errorEvidence
  }, { registry }), /failureRef/);
  assert.throws(() => createFailureEnvelope({
    ...result.failure,
    failureClass: 'MODEL_TIMEOUT_SIMULATED',
    error: result.failure.errorEvidence
  }, { registry }), /caller-selected failure class/);
  const forgedClassifier = structuredClone(result.failure);
  forgedClassifier.classificationEvidence.sourceRef = 'source.runtime-recovery.unknown-forged';
  assert.throws(() => createFailureEnvelope({
    ...forgedClassifier,
    error: forgedClassifier.errorEvidence
  }, { registry }), /not registered|forged/);
  const sameRefDifferentContent = structuredClone(result.failure);
  sameRefDifferentContent.classificationEvidence.errorEvidenceFingerprint = '0'.repeat(64);
  assert.throws(() => createFailureEnvelope({
    ...sameRefDifferentContent,
    error: sameRefDifferentContent.errorEvidence
  }, { registry }), /forged|same-ref/);
});

test('C11 exact source-managed classifier plan provenance fails closed for every non-issued or stale formation', () => {
  const exact = issueClassifierPlan('classifier-plan.runtime-recovery.test.classification', { registry });
  const executor = createDeterministicClassifiedExecutor({
    classifierPlanReceipt: exact,
    registry,
    invoke: () => ({ state: 'PASS' })
  });
  assert.deepEqual(executor(), { state: 'PASS' });
  assert.equal(exact.formationRef, 'formation.runtime-recovery.classifier-plan-registry.v1');
  assert.equal(exact.currentness, 'CURRENT');
  assert.throws(() => issueClassifierPlan('classifier-plan.runtime-recovery.unknown', { registry }),
    /unknown|stale|source-managed/);
  assert.throws(() => issueClassifierPlan('classifier-plan.runtime-recovery.allowed-but-not-issued', { registry }),
    /unknown|stale|source-managed/);
  assert.throws(() => createDeterministicClassifiedExecutor({
    sourceRef: exact.sourceRef,
    adapterRef: exact.adapterRef,
    planRef: exact.classifierPlanRef,
    plan: exact.classifierPlan,
    registry,
    invoke: () => null
  }), /receipt|schema|stale/);
  assert.throws(() => createDeterministicClassifiedExecutor({
    classifierPlanReceipt: { ...structuredClone(exact), currentness: 'STALE' },
    registry,
    invoke: () => null
  }), /stale/);
  const sameRefDifferent = structuredClone(exact);
  sameRefDifferent.classifierPlan[0].failureClass = 'MODEL_TIMEOUT_SIMULATED';
  assert.throws(() => createDeterministicClassifiedExecutor({
    classifierPlanReceipt: sameRefDifferent,
    registry,
    invoke: () => null
  }), /forged|superseded|same-ref/);
  const unissuedAttemptExecutor = createDeterministicClassifiedExecutor({
    classifierPlanReceipt: exact,
    registry,
    invoke: () => { throw new Error('planned throw'); }
  });
  try {
    unissuedAttemptExecutor();
  } catch (error) {
    assert.ok(classifyThrownFailure(unissuedAttemptExecutor, error, { registry }));
  }
  try {
    unissuedAttemptExecutor();
  } catch (error) {
    assert.throws(() => classifyThrownFailure(unissuedAttemptExecutor, error, { registry }), /exact executor attempt/);
  }
  assert.equal(integrated.receipt.exactClassifierPlanProvenanceProof.failClosed, true);
});

test('C1 every malformed, stale, replayed, over-budget, async, or thenable boundary input is typed and mutation-free', async () => {
  const owner = aggregate();
  for (const candidate of [
    { executor: null, context: context('attempt.reject.invalid-executor') },
    { executor: async () => ({ state: 'PASS' }), context: context('attempt.reject.async') },
    { executor: () => Promise.resolve({ state: 'PASS' }), context: context('attempt.reject.thenable') },
    { executor: () => ({ state: 'PASS' }), context: context('attempt.reject.generation', { schedulerGeneration: 2 }) },
    { executor: () => ({ state: 'PASS' }), context: context('attempt.reject.timestamp', { startedAt: 'not-a-time' }) },
    {
      executor: () => ({ state: 'PASS' }),
      context: context('attempt.reject.deadline', {
        completedAt: new Date(Date.parse(T0) + registry.retryPolicy.maximumWallTimeMs + 1).toISOString()
      })
    }
  ]) {
    const result = executeWithRecoveryBoundary({ aggregate: owner, registry, ...candidate });
    assert.equal(result.admitted, false);
    assert.equal(result.status, 'FAILED_BLOCKED');
    assert.equal(result.boundaryRejection.mutationApplied, false);
    assert.equal(result.aggregate.semanticFingerprint, owner.semanticFingerprint);
  }

  const first = executeWithRecoveryBoundary({
    aggregate: owner,
    registry,
    executor: () => ({ state: 'PASS' }),
    context: context('attempt.reject.replay')
  });
  const replay = executeWithRecoveryBoundary({
    aggregate: first.aggregate,
    registry,
    executor: () => ({ state: 'PASS' }),
    context: context('attempt.reject.replay')
  });
  assert.equal(replay.admitted, false);
  assert.equal(replay.aggregate.semanticFingerprint, first.aggregate.semanticFingerprint);

  const forgedBudget = { ...structuredClone(owner), semanticFingerprint: undefined };
  forgedBudget.retryBudget.maximumAttemptCount += 10;
  const substituted = executeWithRecoveryBoundary({
    aggregate: forgedBudget,
    registry,
    executor: () => ({ state: 'PASS' }),
    context: context('attempt.reject.budget')
  });
  assert.equal(substituted.admitted, false);
  assert.match(substituted.boundaryRejection.reasonCode, /PRE_ADMISSION/);

  const unhandled = [];
  const observeUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', observeUnhandled);
  const rejectedThenable = executeWithRecoveryBoundary({
    aggregate: owner,
    registry,
    executor: () => Promise.reject(new Error('deterministic rejected thenable')),
    context: context('attempt.reject.rejected-thenable')
  });
  await new Promise((resolve) => setImmediate(resolve));
  process.off('unhandledRejection', observeUnhandled);
  assert.equal(rejectedThenable.boundaryRejection.reasonCode, 'THENABLE_EXECUTOR_UNSUPPORTED');
  assert.deepEqual(unhandled, []);
});

test('C1 admitted attempts record canonical start/failure/success chronology and exact wall-time budget', () => {
  const failed = executeWithRecoveryBoundary({
    aggregate: aggregate(),
    registry,
    executor: createDeterministicFaultInjector({
      registry,
      planRef: 'classifier-plan.runtime-recovery.test.chronology',
      failures: [{ failureClass: 'MODEL_TIMEOUT_SIMULATED', message: 'timeout' }]
    }),
    context: context('attempt.chronology.failed')
  });
  assert.deepEqual(failed.aggregate.eventLedger.map((item) => item.type), [
    'ATTEMPT_STARTED', 'ATTEMPT_FAILED', 'FAILURE_ACTIVATED'
  ]);
  assert.equal(failed.aggregate.attemptLedger[0].elapsedMs, 1000);
  assert.equal(failed.aggregate.attemptLedger[0].maximumWallTimeMs, registry.retryPolicy.maximumWallTimeMs);
  assert.equal(failed.aggregate.retryBudgetFingerprint, semanticHash(registry.retryPolicy));
});

test('C2 checkpoint admission consumes the exact scheduler checkpoint and six release receipts', () => {
  const { failedAggregate, checkpoint, schedulerCheckpoint, checkpointAdmission } = integrated.artifacts;
  assert.equal(checkpointAdmission.admitted, true);
  assert.equal(checkpoint.schedulerCheckpointFingerprint, schedulerCheckpoint.semanticFingerprint);
  assert.equal(checkpoint.leaseReleaseReceipts.length, 6);
  assert.equal(new Set(checkpoint.leaseReleaseReceipts.map((item) => item.receiptRef)).size, 6);

  const raw = admitRecoveryCheckpoint(schedulerCheckpoint, failedAggregate, {
    schedulerCheckpoint,
    nextSchedulerGeneration: 2,
    currentSourceStateFingerprint: sourceStateFingerprint,
    observedAt: T2,
    registry
  });
  assert.equal(raw.admitted, false);
  const wrongSource = admitRecoveryCheckpoint(checkpoint, failedAggregate, {
    schedulerCheckpoint,
    nextSchedulerGeneration: 2,
    currentSourceStateFingerprint: '0'.repeat(64),
    observedAt: T2,
    registry
  });
  assert.equal(wrongSource.admitted, false);
  const sameGeneration = admitRecoveryCheckpoint(checkpoint, failedAggregate, {
    schedulerCheckpoint,
    nextSchedulerGeneration: 1,
    currentSourceStateFingerprint: sourceStateFingerprint,
    observedAt: T2,
    registry
  });
  assert.equal(sameGeneration.admitted, false);
  assert.throws(() => createRecoveryAggregate({
    ...structuredClone(failedAggregate),
    semanticFingerprint: undefined,
    schedulerGeneration: 2
  }, { registry }), /differs from replay-derived state/);
});

test('C2 continuation requires scheduler-issued fresh generation and six fresh, unreused leases', () => {
  const {
    actionAggregate,
    checkpointAdmission,
    resumed,
    continuation,
    schedulerAggregateAfterResume,
    resumedSchedulerCurrentness
  } = integrated.artifacts;
  assert.equal(continuation.priorSchedulerGeneration, 1);
  assert.equal(continuation.nextSchedulerGeneration, 2);
  assert.equal(Object.keys(continuation.freshLeaseFingerprints).length, 6);
  const priorContextRef = integrated.artifacts.schedulerCheckpoint.priorContextLeaseRef;
  assert.throws(() => createRecoveryContinuation({
    aggregate: actionAggregate,
    checkpointAdmission,
    resumed: {
      ...structuredClone(resumed),
      contextLease: { ...structuredClone(resumed.contextLease), leaseRef: priorContextRef }
    },
    schedulerAggregate: schedulerAggregateAfterResume,
    schedulerInstanceRef: 'instance.intent-scheduler.runtime-recovery',
    observedAt: '2026-08-01T00:00:04.000Z',
    schedulerCurrentness: resumedSchedulerCurrentness,
    registry
  }), /exact scheduler resume|reused prior generation identity|RESUMED_CONSUMED claim currentness|SCHEDULER_CLAIM_STALE_OPERATION_REJECTED/);

  const oldGenerationRetry = executeWithRecoveryBoundary({
    aggregate: integrated.artifacts.failedAggregate,
    registry,
    executor: () => ({ state: 'PASS' }),
    context: context('attempt.old-generation.retry')
  });
  assert.equal(oldGenerationRetry.admitted, false);
  assert.equal(oldGenerationRetry.aggregate.semanticFingerprint, integrated.artifacts.failedAggregate.semanticFingerprint);
});

test('C8 scheduler checkpoint activation and six releases are aggregate/failure owned and single-use', () => {
  const { checkpoint, schedulerCheckpoint, schedulerConsumption, checkpointAdmission, actionAggregate } = integrated.artifacts;
  const otherFailure = executeWithRecoveryBoundary({
    aggregate: aggregate({ aggregateRef: 'aggregate.runtime-recovery.other-owner' }),
    registry,
    executor: createDeterministicFaultInjector({
      registry,
      planRef: 'classifier-plan.runtime-recovery.test.other-owner',
      failures: [{ failureClass: 'MODEL_TIMEOUT_SIMULATED' }]
    }),
    context: context('attempt.other-owner.1')
  });
  const crossOwner = admitRecoveryCheckpoint(checkpoint, otherFailure.aggregate, {
    schedulerCheckpoint,
    schedulerConsumptionReceipt: schedulerConsumption,
    nextSchedulerGeneration: 2,
    currentSourceStateFingerprint: sourceStateFingerprint,
    observedAt: T2,
    registry
  });
  assert.equal(crossOwner.admitted, false);
  assert.match(crossOwner.reasons.join(','), /CONSUMPTION|CORRUPTED/);

  assert.throws(() => recordRecoveryCheckpointAdmission(
    actionAggregate,
    checkpoint,
    checkpointAdmission,
    { schedulerConsumptionReceipt: schedulerConsumption, registry }
  ), /activation|released lease|order|current|stale|detached/i);

  const forgedConsumption = structuredClone(schedulerConsumption);
  forgedConsumption.failureRef = 'failure.runtime-recovery.forged';
  assert.equal(admitRecoveryCheckpoint(checkpoint, integrated.artifacts.failedAggregate, {
    schedulerCheckpoint,
    schedulerConsumptionReceipt: forgedConsumption,
    nextSchedulerGeneration: 2,
    currentSourceStateFingerprint: sourceStateFingerprint,
    observedAt: T2,
    registry
  }).admitted, false);
});

test('C12 scheduler recovery ownership survives replay and consumes its durable claim through terminal lifecycle', () => {
  const proof = integrated.receipt.replayDurableSchedulerRecoveryOwnershipProof;
  const { schedulerClaimedSnapshot, schedulerAggregateAfterResume, schedulerAggregateAfterCompletion } = integrated.artifacts;
  assert.equal(proof.forgedClaimRejected, true);
  assert.equal(proof.forgedClaimMutationFree, true);
  assert.equal(proof.duplicateLiveClaimRejected, true);
  assert.equal(proof.duplicateRestartClaimRejected, true);
  assert.equal(proof.restartPreservedClaimOwnership, true);
  assert.equal(proof.releaseSetPreservedAcrossRestart, true);
  assert.equal(schedulerClaimedSnapshot.recoveryClaims.at(-1).state, 'CLAIMED_CURRENT');
  assert.equal(schedulerAggregateAfterResume.recoveryClaims.at(-1).state, 'RESUMED_CONSUMED');
  assert.equal(schedulerAggregateAfterCompletion.recoveryClaims.at(-1).state, 'TERMINAL_CONSUMED');
  assert.deepEqual(schedulerAggregateAfterCompletion.recoveryClaimLedger.map((item) => item.type), [
    'CLAIMED_CURRENT',
    'RESUMED_CONSUMED',
    'TERMINAL_CONSUMED'
  ]);
  assert.equal(new Set(schedulerClaimedSnapshot.recoveryClaims[0].leaseReleaseFingerprints).size, 6);
});

test('C14 scheduler restoration semantically replays every recovery-claim edge and rejects rehashed forgeries', () => {
  const proof = integrated.receipt.canonicalSchedulerClaimReplayProof;
  assert.deepEqual(proof.lifecycle, ['CLAIMED_CURRENT', 'RESUMED_CONSUMED', 'TERMINAL_CONSUMED']);
  assert.equal(proof.edgeContractRefs.length, 3);
  assert.equal(proof.edgeEvidenceFingerprints.every((item) => /^[a-f0-9]{64}$/.test(item)), true);
  assert.equal(proof.forgedRehashedRestoreRejected, true);
  assert.equal(proof.fakeReleaseRestoredClaimRejected, true);
  assert.equal(proof.missingClaimReceiptRestoredClaimRejected, true);
  assert.equal(proof.legitimateClaimAdmissibleAfterRejectedRestore, true);
  assert.equal(proof.suppliedPointersEqualSemanticReplay, true);
  assert.equal(proof.terminalReplayState, 'TERMINAL_CONSUMED');
});

test('C15 claimed recovery can be explicitly terminally held before resume without reusing its activation', () => {
  const proof = integrated.receipt.preResumeClaimDispositionProof;
  assert.equal(proof.failedResumeRejected, true);
  assert.equal(proof.claimVisibleAfterFailedResume, true);
  assert.equal(proof.disposition, 'ABANDONED_BEFORE_RESUME');
  assert.equal(proof.postDispositionCheckpointPolicy, 'TERMINALLY_HELD_WITH_EXACT_REASON');
  assert.equal(proof.oldActivationReusable, false);
  assert.equal(proof.oldReleaseSetReusable, false);
  assert.equal(proof.dispositionState, 'INVALIDATED_OR_ABANDONED');
  assert.equal(proof.checkpointState, 'RECOVERY_TERMINALLY_HELD');
  assert.equal(proof.restartPreservedDisposition, true);
  assert.equal(proof.oldActivationResumeRejected, true);
  assert.equal(proof.oldActivationReclaimRejected, true);
  assert.equal(proof.normalLifecycleUnchanged, true);
});

test('C17 canonical checkpoint and exact pre-claim scheduler state replay reject coordinated rehash', () => {
  const proof = integrated.receipt.canonicalCheckpointAndPreClaimReplayProof;
  assert.equal(proof.immutableCanonicalCheckpointPreserved, true);
  assert.equal(proof.independentPointerState, 'RESUMED');
  assert.equal(proof.pointerTransitionCount, 2);
  assert.equal(proof.exactReleaseCount, 6);
  assert.equal(proof.releaseObjectsEmbedExactPriorAndTransitionedLeases, true);
  assert.equal(proof.preClaimPhase, 'PAUSED');
  assert.equal(proof.coordinatedCheckpointReleaseClaimReplayRejected, true);
  assert.equal(proof.legitimateClaimAdmissibleAfterRejectedReplay, true);
});

test('C18 resumed, terminal and invalidated claim edges replay complete scheduler evidence', () => {
  const proof = integrated.receipt.completeClaimEdgeReplayProof;
  assert.deepEqual(proof.lifecycle, ['CLAIMED_CURRENT', 'RESUMED_CONSUMED', 'TERMINAL_CONSUMED']);
  assert.equal(proof.resumeEmbedsQueueActiveSixLeasesRuntimeResourcePointerClock, true);
  assert.equal(proof.terminalEmbedsCompleteCausalClosure, true);
  assert.equal(proof.dispositionEmbedsExactHoldPointerQueueAndClock, true);
  assert.equal(proof.coordinatedResumeEdgeForgeryRejected, true);
  assert.equal(proof.coordinatedTerminalEdgeForgeryRejected, true);
  assert.equal(proof.coordinatedDispositionEdgeForgeryRejected, true);
});

test('C19 scheduler claim lifecycle governs recovery use and exact invalidation hold projections', () => {
  const proof = integrated.receipt.schedulerClaimLifecycleRecoveryProof;
  assert.deepEqual(proof.normalLifecycle, ['CLAIMED_CURRENT', 'RESUMED_CONSUMED', 'TERMINAL_CONSUMED']);
  assert.deepEqual(proof.invalidatedLifecycle, ['CLAIMED_CURRENT', 'INVALIDATED_OR_ABANDONED']);
  assert.equal(proof.invalidatedRecoveryPhase, 'BLOCKED');
  assert.equal(proof.healthState, 'BLOCKED');
  assert.equal(proof.guideRoute, 'SCHEDULER_CLAIM_INVALIDATED');
  assert.equal(proof.guideWaitingOn, proof.exactDispositionReasonRef);
  assert.equal(proof.allStaleClaimUsesRejected, true);
  assert.equal(proof.schedulerAggregateUnchangedAfterStaleUse, true);
  assert.equal(proof.recoveryAggregateUnchangedAfterStaleUse, true);
  assert.equal(proof.normalPathUnchanged, true);
});

test('C20 scheduler prior-state proof stays non-recursive and within linear serialized growth budgets', () => {
  const proof = integrated.receipt.boundedNonRecursiveSchedulerStateProof;
  const contract = bundle.schedulerRegistry.runtimeRecoveryClaimContract.boundedPriorStateProof;
  assert.equal(proof.registeredContractFingerprint, semanticHash(contract));
  assert.equal(proof.growthClass, 'LINEAR_PER_RECOVERY_CLAIM_TRANSITION');
  assert.equal(proof.lifecycleCount, 2);
  assert.equal(proof.claimTransitionCount, 5);
  assert.equal(proof.noNestedStateSlices, true);
  assert.equal(proof.noPriorEdgeReceiptsInsideStateSlice, true);
  assert.equal(proof.exactPriorAggregateAndTransitionBound, true);
  assert.equal(proof.claimedRestartRestoresExactState, true);
  assert.equal(proof.invalidatedRestartRestoresExactState, true);
  assert.equal(proof.withinRegisteredBudgets, true);
  assert.equal(proof.linearGrowthProven, true);
  assert.ok(proof.maximumObservedPriorStateReceiptBytes <= contract.maximumPriorStateReceiptBytes);
  assert.ok(proof.maximumObservedAdditionalAggregateBytes <=
    contract.maximumAdditionalAggregateBytesPerClaimTransition);
});

test('C21 every external event is gated by exact current scheduler claim lifecycle', () => {
  const proof = integrated.receipt.externalEventClaimLifecycleProof;
  assert.equal(proof.normalAccepted, true);
  assert.equal(proof.normalAcceptedReason, 'EVENT_ACCEPTED_ONCE');
  assert.equal(proof.normalEventLifecycle, 'RESUMED_CONSUMED');
  assert.equal(proof.normalEventBoundToExactCurrentClaim, true);
  assert.deepEqual(Object.keys(proof.invalidatedReasons).sort(),
    ['generic', 'resume', 'sameRefDifferentContent', 'split', 'wait']);
  assert.equal(Object.values(proof.invalidatedReasons).every((reason) =>
    reason === 'SCHEDULER_CLAIM_INVALIDATED_EXTERNAL_EVENT_REJECTED'), true);
  assert.equal(Object.values(proof.terminalReasons).every((reason) =>
    reason === 'SCHEDULER_CLAIM_TERMINAL_EXTERNAL_EVENT_REJECTED'), true);
  assert.equal(proof.allInvalidatedKindsRejectedExact, true);
  assert.equal(proof.allTerminalKindsRejectedExact, true);
  assert.equal(proof.invalidatedAggregateUnchanged, true);
  assert.equal(proof.terminalAggregateUnchanged, true);
  assert.equal(Object.values(proof.managedFormationRejections).every(Boolean), true);
  assert.equal(proof.allManagedFormationUsesRejected, true);
  assert.equal(proof.replayExactCurrentnessTamperRejected, true);
});

test('C22 human recovery projections are owned by full aggregate replay', () => {
  const proof = integrated.receipt.replayOwnedRecoveryProjectionProof;
  assert.equal(proof.projectionKind, 'QUEUE_TERRAIN_HEALTH_GUIDE');
  assert.equal(proof.aggregateFingerprint, integrated.aggregate.semanticFingerprint);
  assert.equal(proof.recoveredFailureFingerprint, integrated.aggregate.recoveredFailure.semanticFingerprint);
  assert.equal(proof.projectionSemanticFingerprint, integrated.projection.semanticFingerprint);
  assert.equal(proof.projectionSemanticFingerprintExact, true);
  assert.equal(proof.terminalBindingsExact, true);
  assert.equal(proof.heldBindingsExact, true);
  assert.deepEqual(Object.keys(proof.tamperRejections).sort(), [
    'blockedShownCompleted',
    'historicalEvidenceSubstitution',
    'illegalLedgerHistory',
    'lifecycleCurrentnessSubstitution',
    'rehashedDisplayAggregate',
    'removedSchedulerHold'
  ]);
  assert.equal(Object.values(proof.tamperRejections).every(Boolean), true);
  assert.equal(proof.allTamperClassesRejected, true);
  assert.equal(proof.failedProjectionReturnedPlausibleView, false);
});

test('C23 source-managed canonical UTF-8 prior-state budgets bind the exact prior transition', () => {
  const proof = integrated.receipt.sourceManagedPriorStateBudgetAndTransitionProof;
  const contract = bundle.schedulerRegistry.runtimeRecoveryClaimContract.boundedPriorStateProof;
  assert.equal(proof.registeredContractFingerprint, semanticHash(contract));
  assert.equal(proof.canonicalSerializationExact, true);
  assert.equal(proof.maximumNestedStateSliceCount, 0);
  assert.equal(proof.maximumPriorEdgeReceiptCount, 0);
  assert.equal(proof.exactPriorTransitionEvidenceBound, true);
  assert.equal(proof.registryBudgetSubstitutionRejected, true);
  assert.equal(proof.oversizedCanonicalSliceRejected, true);
  assert.equal(proof.omittedPriorTransitionEvidenceRejected, true);
  assert.equal(proof.changedPriorTransitionEvidenceRejected, true);
  assert.equal(proof.sameStateSliceRefDifferentContentRejected, true);
  assert.equal(proof.samePriorStateReceiptRefDifferentContentRejected, true);
  assert.ok(proof.maximumObservedInitialClaimedSchedulerStateBytes <=
    contract.maximumInitialClaimedSchedulerStateBytes);
  assert.ok(proof.maximumObservedPriorStateSliceBytes <= contract.maximumPriorStateReceiptBytes);
});

test('C24 every recovery operation revalidates scheduler currentness and stale projections hold unknown', () => {
  const proof = integrated.receipt.operationTimeSchedulerCurrentnessProof;
  const contract = registry.operationTimeSchedulerCurrentnessContract;
  assert.equal(proof.contractFingerprint, semanticHash(contract));
  assert.deepEqual(Object.keys(proof.operationRouteReceipts).sort(), [...contract.operationClasses].sort());
  assert.equal(proof.everyRegisteredOperationRoutedExactly, true);
  assert.equal(proof.allInvalidatedOperationsRejectedExact, true);
  assert.equal(proof.allStaleOperationsRejectedExact, true);
  assert.equal(proof.allNonterminalOperationsRejectedAfterTerminal, true);
  assert.equal(proof.invalidatedCurrentProjectionState, 'HELD_UNKNOWN');
  assert.equal(proof.invalidatedCurrentProjectionQueueState, 'HELD_UNKNOWN');
  assert.equal(proof.invalidatedCurrentProjectionHealthState, 'ATTENTION');
  assert.equal(proof.staleCurrentProjectionState, 'HELD_UNKNOWN');
  assert.equal(proof.staleCurrentProjectionRoute, 'SCHEDULER_CURRENTNESS_STALE_OR_UNKNOWN');
  assert.equal(proof.historicalProjectionNeverCurrentOrClear, true);
  assert.equal(proof.schedulerAggregatesUnchanged, true);
  assert.equal(proof.recoveryAggregatesUnchanged, true);
  assert.equal(proof.synchronizedNormalPathIntact, true);
});

test('C25 immutable external source events require exact current scope or one adoption receipt', () => {
  const proof = integrated.receipt.externalEventFormationAdoptionProof;
  const contract = registry.externalEventFormationAdoptionContract;
  assert.equal(proof.contractFingerprint, semanticHash(contract));
  assert.equal(proof.exactImmutableSourceBinding, true);
  assert.equal(proof.exactCurrentSchedulerCycleFailureWorkGenerationBinding, true);
  assert.equal(proof.exactChronology, true);
  assert.equal(proof.sourceImmutableBeforeAndAfterAdoption, true);
  assert.equal(proof.unscopedWithoutAdoptionRejected, true);
  assert.equal(proof.preClaimSourceAdoptionRejected, true);
  assert.equal(proof.exactCurrentScopedSourceAcceptedWithoutAdoption, true);
  assert.equal(proof.allReaddressedExternalEventsRejected, true);
  assert.equal(proof.sameSourceRefDifferentContentRejected, true);
  assert.equal(proof.sameAdoptionRefDifferentContentRejected, true);
  assert.equal(proof.rehashedAdoptionBindingSubstitutionRejected, true);
  assert.equal(proof.managedEventsRemainContentAddressedWithoutAdoption, true);
  assert.equal(proof.replayExactAdoptionAndSourceTamperRejected, true);
  assert.equal(proof.invalidatedAndTerminalAdmissionsRejectedWithoutMutation, true);
});

test('C3 restore replays the typed ledger and rejects budget reset, impossible order, forged final state, and duplicate terminal closure', () => {
  const finalAggregate = integrated.aggregate;
  const restored = restoreRecoveryAggregate(serializeRecoveryAggregate(finalAggregate, { registry }), { registry });
  assert.equal(restored.semanticFingerprint, finalAggregate.semanticFingerprint);
  assert.equal(new Set(restored.eventLedger.map((item) => item.type)).has('POLICY_DECIDED'), true);
  assert.ok(restored.currentRecoveryReceipt);
  assert.ok(restored.activePolicyDecision);

  const phaseTamper = JSON.parse(serializeRecoveryAggregate(finalAggregate, { registry }));
  phaseTamper.phase = 'READY';
  phaseTamper.semanticFingerprint = semanticHash(Object.fromEntries(
    Object.entries(phaseTamper).filter(([key]) => key !== 'semanticFingerprint')
  ));
  assert.throws(() => restoreRecoveryAggregate(JSON.stringify(phaseTamper), { registry }), /differs from replay-derived state/);

  const budgetTamper = JSON.parse(serializeRecoveryAggregate(finalAggregate, { registry }));
  budgetTamper.retryBudget.maximumAttemptCount += 1;
  delete budgetTamper.semanticFingerprint;
  assert.throws(() => restoreRecoveryAggregate(JSON.stringify(budgetTamper), { registry }), /substituted or reset retry budget/);

  const successEvent = finalAggregate.eventLedger.find((item) => item.type === 'ATTEMPT_SUCCEEDED');
  assert.throws(() => createRecoveryAggregate({
    aggregateRef: 'aggregate.runtime-recovery.illegal-success',
    workNodeRef: finalAggregate.workNodeRef,
    sourceStateFingerprint,
    schedulerGeneration: 1,
    retryBudget: registry.retryPolicy,
    eventLedger: rechain([{ ...structuredClone(successEvent), schedulerGeneration: 1 }])
  }, { registry }), /exact active attempt/);

  const duplicateTerminal = rechain([
    ...finalAggregate.eventLedger,
    structuredClone(finalAggregate.eventLedger.at(-1))
  ]);
  assert.throws(() => createRecoveryAggregate({
    aggregateRef: finalAggregate.aggregateRef,
    workNodeRef: finalAggregate.workNodeRef,
    sourceStateFingerprint,
    schedulerGeneration: 1,
    retryBudget: registry.retryPolicy,
    eventLedger: duplicateTerminal
  }, { registry }), /terminal recovery state can only begin a new exact attempt\/cycle/);
});

test('C13 consecutive same-class/same-operation cycles isolate current action, success, convergence, terminal, and projection evidence', () => {
  const proof = integrated.receipt.recoveryCycleIsolationProof;
  const owner = integrated.artifacts.cycleIsolationAggregate;
  assert.equal(owner.recoveryCycleHistory.length, 2);
  assert.notEqual(owner.recoveryCycleHistory[0].semanticFingerprint, owner.recoveryCycleHistory[1].semanticFingerprint);
  assert.equal(owner.recoveryCycleHistory[1].priorRecoveryCycleFingerprint,
    owner.recoveryCycleHistory[0].semanticFingerprint);
  assert.equal(proof.sameFailureClassRecurrence, true);
  assert.equal(proof.sameOperationRecurrence, true);
  assert.equal(proof.differentActionRecovery, true);
  assert.equal(proof.priorCycleConvergenceRejected, true);
  assert.equal(proof.priorCycleTerminalRejected, true);
  assert.equal(proof.prematureCurrentSuccessRejected, true);
  assert.equal(proof.historicalTerminalIntact, true);
  assert.equal(proof.currentProjectionCycleRef, owner.activeRecoveryCycle.recoveryCycleRef);
  assert.equal(proof.currentProjectionTerminalProofRef, null);
  assert.equal(owner.currentRecoveryActionReceipt.recoveryCycleRef, owner.activeRecoveryCycle.recoveryCycleRef);
  assert.equal(owner.lastSuccessfulExecutionReceipt, null);
  assert.equal(owner.recoveryConvergenceReceipt, null);
  assert.equal(owner.terminalRecoveryReceipts[0].recoveryCycleRef, owner.recoveryCycleHistory[0].recoveryCycleRef);
});

test('C16 transaction formation and human preservation projection remain exact to the active cycle', () => {
  const proof = integrated.receipt.exactCycleLocalEvidenceProof;
  assert.equal(proof.sameFailureClassRecurrence, true);
  assert.equal(proof.sameOperationRecurrence, true);
  assert.equal(proof.preCheckpointHistoricalPreservationRejected, true);
  assert.equal(proof.preCheckpointPreservationState, 'AWAITING_CURRENT_CYCLE_EVIDENCE');
  assert.equal(proof.preCheckpointWhatWasPreserved, null);
  assert.equal(proof.priorTransactionEvidenceRejected, true);
  assert.equal(proof.unscopedTransactionRejected, true);
  assert.equal(proof.readdressedTransactionRejected, true);
  assert.equal(proof.staleTransactionFormationRejected, true);
  assert.equal(proof.sameRefDifferentContentTransactionRejected, true);
  assert.equal(proof.priorContextEvidenceRejected, true);
  assert.equal(proof.priorResourceEvidenceRejected, true);
  assert.equal(proof.priorWaitEvidenceRejected, true);
  assert.equal(proof.historicalEvidenceIntact, true);
  assert.equal(proof.currentCycleControlledDisposition, 'BLOCKED');
  assert.equal(proof.currentProjectionCycleRef, proof.secondRecoveryCycleRef);
});

test('C3 replay rejects same-ref/different-content and stale external events without mutation', () => {
  const owner = integrated.artifacts.succeeded.aggregate;
  const schedulerCurrentness = integrated.artifacts.resumedSchedulerCurrentness;
  const event = {
    eventRef: 'event.external.test.1',
    workNodeRef: owner.workNodeRef,
    schedulerGeneration: owner.schedulerGeneration,
    resultRef: 'result.external.test.1',
    observedAt: '2026-08-01T00:00:05.000Z'
  };
  event.semanticFingerprint = semanticHash(event);
  const adoptionReceipt = createExternalRecoveryEventAdoptionReceipt({
    aggregate: owner,
    event,
    adoptedAt: event.observedAt,
    schedulerCurrentness,
    registry
  });
  const accepted = recordExternalRecoveryEvent(owner, event, {
    adoptionReceipt,
    schedulerCurrentness,
    registry
  });
  assert.equal(accepted.changed, true);
  assert.equal(recordExternalRecoveryEvent(accepted.aggregate, event, {
    adoptionReceipt,
    schedulerCurrentness,
    registry
  }).changed, false);
  const differentEvent = { ...event, resultRef: 'result.forged' };
  delete differentEvent.semanticFingerprint;
  differentEvent.semanticFingerprint = semanticHash(differentEvent);
  const different = recordExternalRecoveryEvent(accepted.aggregate, differentEvent, {
    adoptionReceipt,
    schedulerCurrentness,
    registry
  });
  assert.equal(different.changed, false);
  assert.equal(different.reason, 'SAME_REF_DIFFERENT_CONTENT_REJECTED');
  const staleEvent = {
    ...event,
    eventRef: 'event.external.test.stale',
    schedulerGeneration: 1
  };
  delete staleEvent.semanticFingerprint;
  staleEvent.semanticFingerprint = semanticHash(staleEvent);
  const stale = recordExternalRecoveryEvent(accepted.aggregate, staleEvent, {
    adoptionReceipt,
    schedulerCurrentness,
    registry
  });
  assert.equal(stale.changed, false);
  assert.equal(stale.aggregate.semanticFingerprint, accepted.aggregate.semanticFingerprint);
});

test('C7 typed semantic replay rejects self-consistent forged context and action edge payloads', () => {
  const contextBranch = integrated.artifacts.representativeActions.find((item) => item.name === 'context-condensation');
  const contextEvents = structuredClone(contextBranch.aggregate.eventLedger);
  const contextEvent = contextEvents.find((item) => item.type === 'CONTEXT_RECOVERED');
  contextEvent.payload.receipt.immutableSourceCoverage[0].end += 1;
  delete contextEvent.payload.receipt.contextRecoveryReceiptRef;
  delete contextEvent.payload.receipt.semanticFingerprint;
  contextEvent.payload.receipt.semanticFingerprint = semanticHash(contextEvent.payload.receipt);
  contextEvent.payload.receipt.contextRecoveryReceiptRef =
    `receipt.runtime-recovery.context.${contextEvent.payload.receipt.semanticFingerprint.slice(0, 32)}`;
  assert.throws(() => createRecoveryAggregate({
    aggregateRef: contextBranch.aggregate.aggregateRef,
    workNodeRef: contextBranch.aggregate.workNodeRef,
    sourceStateFingerprint,
    schedulerGeneration: 1,
    retryBudget: registry.retryPolicy,
    eventLedger: rechain(contextEvents)
  }, { registry }), /canonical source replay|detached/);

  const directBranch = integrated.artifacts.representativeActions.find((item) => item.name === 'direct-timeout-retry');
  const actionEvents = structuredClone(directBranch.aggregate.eventLedger);
  const actionEvent = actionEvents.find((item) => item.type === 'RECOVERY_ACTION_APPLIED');
  actionEvent.payload.receipt.action = 'RETRY_REDUCED_BUDGET';
  delete actionEvent.payload.receipt.actionReceiptRef;
  delete actionEvent.payload.receipt.semanticFingerprint;
  actionEvent.payload.receipt.semanticFingerprint = semanticHash(actionEvent.payload.receipt);
  actionEvent.payload.receipt.actionReceiptRef =
    `receipt.runtime-recovery.action.${actionEvent.payload.receipt.semanticFingerprint.slice(0, 32)}`;
  assert.throws(() => createRecoveryAggregate({
    aggregateRef: directBranch.aggregate.aggregateRef,
    workNodeRef: directBranch.aggregate.workNodeRef,
    sourceStateFingerprint,
    schedulerGeneration: 1,
    retryBudget: registry.retryPolicy,
    eventLedger: rechain(actionEvents)
  }, { registry }), /exact active decision|semantic replay/);
});

test('C4 selected recovery actions, rollback/LKG/quarantine, and human gates are aggregate-owned and visible', () => {
  assert.ok(integrated.aggregate.currentRecoveryActionReceipt);
  assert.equal(integrated.aggregate.rollbackLineage.length, 1);
  assert.deepEqual(integrated.aggregate.lastKnownGoodRefs, ['state.runtime-recovery.last-known-good.main']);
  assert.equal(integrated.projection.guide.whatFailed, 'PARTIAL_WRITE_SIMULATED');
  assert.equal(integrated.projection.guide.recoveryRoute, 'ROLLBACK_TO_BEFORE_IMAGE');
  assert.ok(integrated.projection.guide.terminalProofRef);
  assert.equal(integrated.quarantineAggregate.rollbackLineage.length, 1);
  assert.equal(integrated.quarantineAggregate.quarantinedRefs.length, 1);
  assert.equal(integrated.quarantineProjection.health.state, 'ATTENTION');
  assert.equal(integrated.quarantineProjection.guide.remainsBlocked, true);

  const humanBranch = integrated.artifacts.representativeActions.find((item) => item.name === 'human-decision-hold');
  const humanOwner = humanBranch.aggregate;
  assert.equal(humanOwner.phase, 'WAITING_HUMAN');
  assert.equal(humanOwner.humanDecisionGates.length, 1);
  assert.equal(projectRecoveryAggregate(humanOwner, {
    projectionObservedAt: '2026-08-01T00:00:04.000Z',
    schedulerCurrentness: humanBranch.claimedSchedulerCurrentness,
    registry
  }).projection.guide.victorNeeded, true);
});

test('C4 transactional receipts bind before/partial/read-back/LKG/quarantine evidence', () => {
  const receipt = simulateTransactionalRecovery({
    adapter: createNoEffectTransactionalAdapter({
      initialState: { n: 1 },
      attemptedState: { n: 2 },
      rollbackFails: true
    }),
    operationRef: 'operation.runtime-recovery.test',
    expectedBeforeFingerprint: semanticHash({ n: 1 }),
    rollbackReceiptRef: 'receipt.transaction.test',
    lastKnownGoodRef: 'state.last-known-good.test',
    observedAt: T1
  });
  assert.equal(receipt.state, 'LAST_KNOWN_GOOD_RESTORED');
  assert.equal(receipt.partialResultFingerprint, semanticHash({ n: 2 }));
  assert.equal(receipt.lastKnownGoodReadBackFingerprint, receipt.lastKnownGoodExpectedFingerprint);
  assert.equal(receipt.externalEffectsExecuted, false);
});

test('C9 all ten actions use exact evidence matrices and only completable actions converge', () => {
  const representatives = integrated.artifacts.representativeActions;
  const byAction = new Map(representatives.map((item) => [item.action, item]));
  byAction.set(
    integrated.quarantineAggregate.currentRecoveryActionReceipt.action,
    {
      actionReceipt: integrated.quarantineAggregate.currentRecoveryActionReceipt,
      aggregate: integrated.quarantineAggregate,
      claimedSchedulerCurrentness: integrated.artifacts.quarantineSchedulerCurrentness
    }
  );
  assert.deepEqual([...byAction.keys()].sort(), [...registry.recoveryActions].sort());
  for (const matrix of registry.recoveryActionEvidenceMatrix) {
    const branch = byAction.get(matrix.action);
    const roles = branch.actionReceipt.evidence.map((item) => item.role);
    assert.equal(matrix.required.every((role) => roles.includes(role)), true, matrix.action);
    assert.equal(roles.every((role) => matrix.required.includes(role) || matrix.optional.includes(role)), true, matrix.action);
    assert.equal(branch.actionReceipt.disposition, matrix.disposition);
    assert.equal(branch.actionReceipt.continuationRequired, matrix.continuationRequired);
    assert.equal(branch.actionReceipt.completionEligible, matrix.completionEligible);
    if (matrix.continuationRequired) {
      assert.ok(branch.convergenceFingerprint, matrix.action);
    } else {
      assert.throws(() => createRecoveryConvergenceReceipt(branch.aggregate, {
        formedAt: '2026-08-01T00:00:04.000Z',
        schedulerCurrentness: branch.claimedSchedulerCurrentness,
        registry
      }),
        /missing one or more required causal inputs|completionEligible|convergence|SCHEDULER_CLAIM_STALE_OPERATION_REJECTED/);
    }
  }
  const wait = byAction.get('CHECKPOINT_AND_WAIT');
  assert.deepEqual(wait.actionReceipt.evidence.map((item) => item.role), ['externalResume', 'externalWait']);
  assert.equal(wait.waitResumeReceipt.state, 'RESUMED_CURRENT');
  const split = byAction.get('SPLIT_WORK_NODE');
  assert.equal(split.splitWorkRouteReceipt.childWorkNodeRef, split.contextProof.splitWorkNodeRef);
});

test('C10 scheduler resume receipt consumes exact action-specific context and resource outputs', () => {
  const contextBranch = integrated.artifacts.representativeActions.find((item) => item.name === 'context-condensation');
  assert.equal(contextBranch.continuation.contextRecoveryReceiptFingerprint, contextBranch.contextProof.semanticFingerprint);
  assert.equal(contextBranch.continuation.schedulerResumeReceipt.contextBindingFingerprint,
    contextBranch.continuation.schedulerResumeReceipt.contextLeaseRecoveryBindingFingerprint);
  const genericContext = structuredClone(contextBranch.resumed);
  genericContext.contextLease.selectedSourceRefs = ['blueprint/runtime-recovery-registry.json'];
  assert.throws(() => createRecoveryContinuation({
    aggregate: contextBranch.actionReceipt
      ? contextBranch.aggregate.eventLedger.some((item) => item.type === 'RECOVERY_CONVERGED')
        ? createRecoveryAggregate({
          aggregateRef: contextBranch.aggregate.aggregateRef,
          workNodeRef: contextBranch.aggregate.workNodeRef,
          sourceStateFingerprint,
          schedulerGeneration: 1,
          retryBudget: registry.retryPolicy,
          eventLedger: contextBranch.aggregate.eventLedger.slice(0,
            contextBranch.aggregate.eventLedger.findIndex((item) => item.type === 'GENERATION_CONTINUED'))
        }, { registry })
        : contextBranch.aggregate
      : contextBranch.aggregate,
    checkpointAdmission: contextBranch.checkpointAdmission,
    resumed: genericContext,
    schedulerAggregate: contextBranch.schedulerAggregateAfterResume,
    schedulerInstanceRef: 'instance.intent-scheduler.runtime-recovery.context-condensation',
    observedAt: '2026-08-01T00:00:04.000Z',
    schedulerCurrentness: contextBranch.resumedSchedulerCurrentness,
    registry
  }), /fingerprint mismatch|exact scheduler resume/);

  const resourceBranch = integrated.artifacts.representativeActions.find((item) => item.name === 'resource-reduced-retry');
  assert.equal(resourceBranch.continuation.resourceRecoveryReceiptFingerprint, resourceBranch.resourceProof.semanticFingerprint);
  assert.equal(resourceBranch.resumed.resourceLease.recoveryBinding.reducedRequestFingerprint,
    semanticHash(resourceBranch.resourceProof.reducedRequest));
  const detachedResource = structuredClone(resourceBranch.resumed);
  detachedResource.resourceLease.request.ramMb += 1;
  assert.throws(() => createRecoveryContinuation({
    aggregate: createRecoveryAggregate({
      aggregateRef: resourceBranch.aggregate.aggregateRef,
      workNodeRef: resourceBranch.aggregate.workNodeRef,
      sourceStateFingerprint,
      schedulerGeneration: 1,
      retryBudget: registry.retryPolicy,
      eventLedger: resourceBranch.aggregate.eventLedger.slice(0,
        resourceBranch.aggregate.eventLedger.findIndex((item) => item.type === 'GENERATION_CONTINUED'))
    }, { registry }),
    checkpointAdmission: resourceBranch.checkpointAdmission,
    resumed: detachedResource,
    schedulerAggregate: resourceBranch.schedulerAggregateAfterResume,
    schedulerInstanceRef: 'instance.intent-scheduler.runtime-recovery.resource-reduced-retry',
    observedAt: '2026-08-01T00:00:04.000Z',
    schedulerCurrentness: resourceBranch.resumedSchedulerCurrentness,
    registry
  }), /fingerprint mismatch|exact scheduler resume/);
});

test('C5 one actual recovery Workgraph node consumes convergence evidence and terminal closure rejects substitutions', () => {
  const receipt = integrated.receipt;
  const blueprint = validateBlueprint(bundle);
  const validation = validateIntegratedRecoverySimulationReceipt(receipt, {
    runtimeRecoveryRegistry: registry,
    blueprintHash: blueprint.semanticHash,
    sourceTreeSha256: receipt.sourceTreeSha256,
    repositoryGit: {
      candidateHeadSha: receipt.candidateHeadSha,
      checkoutSha: receipt.testedCheckoutSha,
      testedMergeSha: receipt.testedMergeSha,
      baseSha: receipt.baseSha
    }
  });
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  assert.equal(receipt.schedulerWorkgraphCausalRecoveryProof.independentSchedulerSimulationUsed, false);
  assert.equal(receipt.schedulerWorkgraphCausalRecoveryProof.exactGateCoverage, true);
  assert.equal(receipt.schedulerWorkgraphCausalRecoveryProof.recoveryConvergenceReceipt.causalEvidence.length, 22);
  assert.equal(receipt.schedulerWorkgraphCausalRecoveryProof.recoveryConvergenceReceipt.causalEvidence
    .some((item) => item.completionGateRef === 'completion-gate.runtime-recovery.context'), false);
  assert.equal(receipt.schedulerWorkgraphCausalRecoveryProof.gateEvidence[0].sourceObservationHash,
    receipt.schedulerWorkgraphCausalRecoveryProof.recoveryConvergenceReceipt.semanticFingerprint);
  assert.equal(receipt.terminalReceipt.schedulerCheckpointFingerprint, receipt.schedulerBindings.checkpointFingerprint);
  assert.equal(receipt.terminalReceipt.schedulerCompletionVerificationFingerprint,
    receipt.schedulerBindings.completionVerificationFingerprint);

  const { convergedAggregate, succeeded, completed, schedulerCheckpoint } = integrated.artifacts;
  assert.throws(() => closeRecoveredExecution({
    aggregate: convergedAggregate,
    successExecution: { ...succeeded, executionReceipt: { ...succeeded.executionReceipt, semanticFingerprint: '0'.repeat(64) } },
    schedulerEvidence: {
      schedulerCheckpoint,
      completionVerification: completed.completionVerification,
      completionEvidenceLineage: completed.completionEvidenceLineage,
      workgraphTransition: completed.canonicalWorkgraphTransition,
      completionReceipt: completed.completionReceipt,
      returnRouteReceipt: completed.returnRouteReceipt
    },
    completedAt: '2026-08-01T00:00:06.000Z',
    schedulerCurrentness: integrated.artifacts.terminalSchedulerCurrentness,
    registry
  }), /aggregate-owned successful executor receipt/);

  assert.throws(() => closeRecoveredExecution({
    aggregate: succeeded.aggregate,
    successExecution: succeeded,
    schedulerEvidence: {
      schedulerCheckpoint,
      completionVerification: completed.completionVerification,
      completionEvidenceLineage: completed.completionEvidenceLineage,
      workgraphTransition: completed.canonicalWorkgraphTransition,
      completionReceipt: completed.completionReceipt,
      returnRouteReceipt: completed.returnRouteReceipt
    },
    completedAt: '2026-08-01T00:00:06.000Z',
    schedulerCurrentness: integrated.artifacts.resumedSchedulerCurrentness,
    registry
  }), /aggregate-owned action convergence|SCHEDULER_CLAIM_STALE_OPERATION_REJECTED/);

  const staleVerification = structuredClone(completed.completionVerification);
  staleVerification.currentness = 'STALE';
  delete staleVerification.semanticFingerprint;
  staleVerification.semanticFingerprint = semanticHash(staleVerification);
  assert.throws(() => closeRecoveredExecution({
    aggregate: convergedAggregate,
    successExecution: succeeded,
    schedulerEvidence: {
      schedulerCheckpoint,
      completionVerification: staleVerification,
      completionEvidenceLineage: completed.completionEvidenceLineage,
      workgraphTransition: completed.canonicalWorkgraphTransition,
      completionReceipt: completed.completionReceipt,
      returnRouteReceipt: completed.returnRouteReceipt
    },
    completedAt: '2026-08-01T00:00:06.000Z',
    schedulerCurrentness: integrated.artifacts.terminalSchedulerCurrentness,
    registry
  }), /stale, substituted, or detached/);

  const tampered = structuredClone(receipt);
  tampered.schedulerBindings.completionFingerprint = '0'.repeat(64);
  assert.equal(validateIntegratedRecoverySimulationReceipt(tampered, {
    runtimeRecoveryRegistry: registry,
    blueprintHash: blueprint.semanticHash,
    sourceTreeSha256: receipt.sourceTreeSha256,
    repositoryGit: {
      candidateHeadSha: receipt.candidateHeadSha,
      checkoutSha: receipt.testedCheckoutSha,
      testedMergeSha: receipt.testedMergeSha,
      baseSha: receipt.baseSha
    }
  }).ok, false);

  const causalSubstitution = structuredClone(receipt);
  causalSubstitution.schedulerWorkgraphCausalRecoveryProof.recoveryConvergenceReceipt.causalEvidence[0].sourceObservationHash = '1'.repeat(64);
  const forgedConvergence = causalSubstitution.schedulerWorkgraphCausalRecoveryProof.recoveryConvergenceReceipt;
  delete forgedConvergence.convergenceReceiptRef;
  delete forgedConvergence.semanticFingerprint;
  forgedConvergence.semanticFingerprint = semanticHash(forgedConvergence);
  forgedConvergence.convergenceReceiptRef = `receipt.runtime-recovery.convergence.${forgedConvergence.semanticFingerprint.slice(0, 32)}`;
  delete causalSubstitution.semanticFingerprint;
  causalSubstitution.semanticFingerprint = semanticHash(causalSubstitution);
  assert.equal(validateIntegratedRecoverySimulationReceipt(causalSubstitution, {
    runtimeRecoveryRegistry: registry,
    blueprintHash: blueprint.semanticHash,
    sourceTreeSha256: receipt.sourceTreeSha256,
    repositoryGit: {
      candidateHeadSha: receipt.candidateHeadSha,
      checkoutSha: receipt.testedCheckoutSha,
      testedMergeSha: receipt.testedMergeSha,
      baseSha: receipt.baseSha
    }
  }).ok, false);
});

test('registry vocabulary matches replay/event implementation and full integrated simulation remains no-effect', () => {
  assert.deepEqual(registry.recoveryAggregate.eventTypes, RECOVERY_EVENT_TYPES);
  assert.equal(registry.retryPolicy.maximumWallTimeMs, 5000);
  assert.equal(registry.retryPolicy.maximumTotalWallTimeMs, 15000);
  assert.equal(integrated.receipt.externalEffectsExecuted, false);
  assert.equal(integrated.receipt.realModelInvoked, false);
  assert.equal(integrated.receipt.modelWeightsChanged, false);
  assert.equal(integrated.receipt.canonicalWorkNodeFinalState, 'COMPLETED');
});

test('policy rejects caller-authored action and substituted aggregate budget', () => {
  const failed = integrated.artifacts.failed;
  assert.throws(() => resolveRecoveryPolicy({
    failure: failed.failure,
    aggregate: failed.aggregate,
    checkpointAdmission: integrated.artifacts.checkpointAdmission,
    observedAt: T2,
    registry,
    callerPreferredAction: 'RETRY_SAME_BUDGET'
  }), /caller-authored recovery authority/);
  const forged = structuredClone(failed.aggregate);
  forged.retryBudget.maximumAttemptCount += 1;
  forged.retryBudgetFingerprint = semanticHash(forged.retryBudget);
  assert.throws(() => resolveRecoveryPolicy({
    failure: failed.failure,
    aggregate: forged,
    checkpointAdmission: integrated.artifacts.checkpointAdmission,
    observedAt: T2,
    registry
  }), /substituted or reset retry budget/);
});

// [VXG RealForever]
