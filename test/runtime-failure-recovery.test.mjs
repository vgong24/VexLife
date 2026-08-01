import assert from 'node:assert/strict';
import test from 'node:test';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import {
  RECOVERY_EVENT_TYPES,
  admitRecoveryCheckpoint,
  applyRecoveryAction,
  closeRecoveredExecution,
  createRecoveryAggregate,
  createRecoveryContinuation,
  executeWithRecoveryBoundary,
  projectRecoveryAggregate,
  recordExternalRecoveryEvent,
  recordRecoveryCheckpointAdmission,
  recordRecoveryPolicyDecision,
  restoreRecoveryAggregate,
  serializeRecoveryAggregate
} from '../src/core/runtime-recovery.mjs';
import { createFailureEnvelope, validateFailureEnvelope } from '../src/core/runtime-failure.mjs';
import { resolveRecoveryPolicy } from '../src/core/recovery-policy.mjs';
import {
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
  const result = executeWithRecoveryBoundary({
    aggregate: owner,
    registry,
    executor: () => {
      throw new SimulatedRuntimeFailure('PARTIAL_WRITE_SIMULATED', 'partial write', {
        partialEffectState: 'NONE',
        humanAttentionClass: 'NONE'
      });
    },
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
});

test('C1 every malformed, stale, replayed, over-budget, async, or thenable boundary input is typed and mutation-free', () => {
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
});

test('C1 admitted attempts record canonical start/failure/success chronology and exact wall-time budget', () => {
  const failed = executeWithRecoveryBoundary({
    aggregate: aggregate(),
    registry,
    executor: () => { throw new SimulatedRuntimeFailure('MODEL_TIMEOUT_SIMULATED', 'timeout'); },
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
  const { actionAggregate, checkpointAdmission, resumed, continuation } = integrated.artifacts;
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
    schedulerInstanceRef: 'instance.intent-scheduler.runtime-recovery',
    observedAt: '2026-08-01T00:00:04.000Z',
    registry
  }), /reused prior generation identity/);

  const oldGenerationRetry = executeWithRecoveryBoundary({
    aggregate: integrated.artifacts.failedAggregate,
    registry,
    executor: () => ({ state: 'PASS' }),
    context: context('attempt.old-generation.retry')
  });
  assert.equal(oldGenerationRetry.admitted, false);
  assert.equal(oldGenerationRetry.aggregate.semanticFingerprint, integrated.artifacts.failedAggregate.semanticFingerprint);
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
  }, { registry }), /terminal recovery state cannot accept later events/);
});

test('C3 replay rejects same-ref/different-content and stale external events without mutation', () => {
  const owner = integrated.artifacts.succeeded.aggregate;
  const event = {
    eventRef: 'event.external.test.1',
    workNodeRef: owner.workNodeRef,
    schedulerGeneration: owner.schedulerGeneration,
    resultRef: 'result.external.test.1',
    observedAt: T2
  };
  const accepted = recordExternalRecoveryEvent(owner, event, { registry });
  assert.equal(accepted.changed, true);
  assert.equal(recordExternalRecoveryEvent(accepted.aggregate, event, { registry }).changed, false);
  const different = recordExternalRecoveryEvent(accepted.aggregate, { ...event, resultRef: 'result.forged' }, { registry });
  assert.equal(different.changed, false);
  assert.equal(different.reason, 'SAME_REF_DIFFERENT_CONTENT_REJECTED');
  const stale = recordExternalRecoveryEvent(accepted.aggregate, {
    ...event,
    eventRef: 'event.external.test.stale',
    schedulerGeneration: 1
  }, { registry });
  assert.equal(stale.changed, false);
  assert.equal(stale.aggregate.semanticFingerprint, accepted.aggregate.semanticFingerprint);
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

  let humanOwner = aggregate({ aggregateRef: 'aggregate.runtime-recovery.human' });
  const humanFailure = executeWithRecoveryBoundary({
    aggregate: humanOwner,
    registry,
    executor: () => { throw new SimulatedRuntimeFailure('INVALID_STATE_TRANSITION', 'human decision required'); },
    context: context('attempt.human.1')
  });
  humanOwner = humanFailure.aggregate;
  const humanAdmission = admitRecoveryCheckpoint(integrated.artifacts.checkpoint, humanOwner, {
    schedulerCheckpoint: integrated.artifacts.schedulerCheckpoint,
    nextSchedulerGeneration: 2,
    currentSourceStateFingerprint: sourceStateFingerprint,
    observedAt: T2,
    registry
  });
  humanOwner = recordRecoveryCheckpointAdmission(humanOwner, integrated.artifacts.checkpoint, humanAdmission, { registry });
  const humanDecision = recordRecoveryPolicyDecision(humanOwner, {
    checkpointAdmission: humanAdmission,
    observedAt: T2,
    registry
  });
  humanOwner = applyRecoveryAction({
    aggregate: humanDecision.aggregate,
    policyDecision: humanDecision.policyDecision,
    checkpointAdmission: humanAdmission,
    observedAt: T2,
    registry
  }).aggregate;
  assert.equal(humanOwner.phase, 'WAITING_HUMAN');
  assert.equal(humanOwner.humanDecisionGates.length, 1);
  assert.equal(projectRecoveryAggregate(humanOwner).projection.guide.victorNeeded, true);
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
  assert.equal(receipt.schedulerWorkgraphCausalRecoveryProof.recoveryConvergenceReceipt.causalEvidence.length, 23);
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
    registry
  }), /aggregate-owned action convergence/);

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
