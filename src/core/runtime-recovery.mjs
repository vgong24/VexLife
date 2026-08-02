import { createIntentCheckpoint } from './intent-checkpoint.mjs';
import { buildContextLeaseFingerprint } from './context-lease.mjs';
import { buildReceiptFingerprint, buildTransitionFingerprint } from './intent-workgraph.mjs';
import { createResourceSnapshot, evaluateCurrentResourceAdmission } from './resource-admission.mjs';
import { assertCurrentLease, parseCanonicalTimestamp } from './scheduler-runtime-trust.mjs';
import {
  classifyInternalRuntimeFailure,
  createFailureEnvelope,
  normalizeThrownFailure,
  validateFailureEnvelope
} from './runtime-failure.mjs';
import {
  EXECUTOR_OUTCOMES,
  resolveRecoveryPolicy,
  validateRecoveryPolicyDecision
} from './recovery-policy.mjs';
import { semanticHash } from './utils.mjs';

const LEASE_KINDS = Object.freeze(['worker', 'context', 'resource', 'capability', 'effect', 'occupancy']);

export const RECOVERY_EVENT_TYPES = Object.freeze([
  'ATTEMPT_STARTED',
  'ATTEMPT_SUCCEEDED',
  'ATTEMPT_FAILED',
  'FAILURE_ACTIVATED',
  'CHECKPOINT_ADMITTED',
  'SCHEDULER_CLAIM_LIFECYCLE_RECORDED',
  'POLICY_DECIDED',
  'CONTEXT_RECOVERED',
  'RESOURCE_RECOVERED',
  'ROLLBACK_ATTEMPTED',
  'ROLLBACK_VERIFIED',
  'LAST_KNOWN_GOOD_RESTORED',
  'QUARANTINED',
  'HUMAN_DECISION_REQUESTED',
  'RECOVERY_ACTION_APPLIED',
  'GENERATION_CONTINUED',
  'EXTERNAL_EVENT_ACCEPTED',
  'RECOVERY_CONVERGED',
  'TERMINAL_CLOSED'
]);

export const RECOVERY_COMPLETION_GATE_REFS = Object.freeze(['completion-gate.intent.contract-valid']);

export const RECOVERY_AGGREGATE_REQUIRED_FIELDS = Object.freeze([
  'aggregateRef',
  'workNodeRef',
  'sourceStateFingerprint',
  'initialSchedulerGeneration',
  'schedulerGeneration',
  'phase',
  'eventLedger',
  'activeAttempt',
  'activeFailure',
  'activeRecoveryCycle',
  'recoveryCycleHistory',
  'activePolicyDecision',
  'currentRecoveryReceipt',
  'currentCheckpointAdmission',
  'currentRecoveryActionReceipt',
  'currentSchedulerClaimLifecycle',
  'schedulerClaimLifecycleHistory',
  'schedulerRecoveryHold',
  'attemptLedger',
  'failureHistory',
  'retryBudget',
  'retryBudgetFingerprint',
  'checkpointLineage',
  'continuationLineage',
  'contextRecoveryReceipts',
  'resourceRecoveryReceipts',
  'rollbackLineage',
  'quarantinedRefs',
  'lastKnownGoodRefs',
  'humanDecisionGates',
  'terminalRecoveryReceipts',
  'acceptedExternalEvents',
  'lastSuccessfulExecutionReceipt',
  'recoveryConvergenceReceipt',
  'recoveredFailure',
  'semanticFingerprint'
]);

export const RECOVERY_PHASES = Object.freeze([
  'READY',
  'FAILURE_ACTIVE',
  'CHECKPOINTED',
  'RECOVERING',
  'WAITING_HUMAN',
  'QUARANTINED',
  'BLOCKED',
  'COMPLETED'
]);

const RECOVERY_EVENT_PAYLOAD_FIELDS = Object.freeze({
  ATTEMPT_STARTED: Object.freeze(['attempt']),
  ATTEMPT_SUCCEEDED: Object.freeze(['attemptRef', 'completedAt', 'executionReceipt']),
  ATTEMPT_FAILED: Object.freeze(['failure', 'recoveryCycle']),
  FAILURE_ACTIVATED: Object.freeze(['failure', 'recoveryCycle']),
  CHECKPOINT_ADMITTED: Object.freeze(['admission', 'checkpoint', 'schedulerConsumptionReceipt']),
  SCHEDULER_CLAIM_LIFECYCLE_RECORDED: Object.freeze(['receipt']),
  POLICY_DECIDED: Object.freeze([
    'authorityBoundary', 'checkpointAdmission', 'contextAdmissionReceipt', 'decision',
    'recoveryReceipt', 'resourceAdmissionReceipt'
  ]),
  CONTEXT_RECOVERED: Object.freeze(['receipt']),
  RESOURCE_RECOVERED: Object.freeze(['receipt']),
  ROLLBACK_ATTEMPTED: Object.freeze(['receipt']),
  ROLLBACK_VERIFIED: Object.freeze(['receipt']),
  LAST_KNOWN_GOOD_RESTORED: Object.freeze(['receipt']),
  QUARANTINED: Object.freeze(['receipt']),
  HUMAN_DECISION_REQUESTED: Object.freeze(['gate']),
  RECOVERY_ACTION_APPLIED: Object.freeze(['receipt']),
  GENERATION_CONTINUED: Object.freeze(['continuation']),
  EXTERNAL_EVENT_ACCEPTED: Object.freeze(['event']),
  RECOVERY_CONVERGED: Object.freeze(['receipt']),
  TERMINAL_CLOSED: Object.freeze(['receipt'])
});

function clone(value) {
  return structuredClone(value);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function assertFingerprint(value, label) {
  if (!/^[a-f0-9]{64}$/.test(String(value ?? ''))) throw new Error(`${label} must be a SHA-256 fingerprint`);
}

function canonicalRefs(values, label) {
  if (!Array.isArray(values) || values.some((item) => typeof item !== 'string' || !item)) {
    throw new Error(`${label} must contain stable refs`);
  }
  return [...new Set(values)].sort();
}

function same(left, right) {
  return semanticHash(left) === semanticHash(right);
}

function assertExactEventPayload(type, payload, registry) {
  const fields = RECOVERY_EVENT_PAYLOAD_FIELDS[type];
  const registered = registry?.recoveryAggregate?.eventPayloadContracts?.find((item) => item.type === type);
  if (!fields || !registered || !same([...registered.fields].sort(), [...fields].sort())) {
    throw new Error(`recovery event ${type} does not have one exact registered payload contract`);
  }
  const observed = Object.keys(payload ?? {}).sort();
  if (!same(observed, [...fields].sort())) {
    throw new Error(`recovery event ${type} payload has missing or extra fields`);
  }
}

function contentAddressed(value, refField, prefix) {
  const candidate = clone(value);
  delete candidate.semanticFingerprint;
  delete candidate[refField];
  candidate.semanticFingerprint = semanticHash(candidate);
  candidate[refField] = `${prefix}${candidate.semanticFingerprint.slice(0, 32)}`;
  return freeze(candidate);
}

function assertContentAddressed(value, {
  schemaVersion,
  refField,
  prefix,
  label
}) {
  if (!value || value.schemaVersion !== schemaVersion || !value[refField]) {
    throw new Error(`${label} is missing or has the wrong schema`);
  }
  const canonical = contentAddressed(value, refField, prefix);
  if (canonical.semanticFingerprint !== value.semanticFingerprint || canonical[refField] !== value[refField]) {
    throw new Error(`${label} content-addressed identity mismatch`);
  }
  return canonical;
}

function assertCanonicalSchedulerReceipt(value, label, fingerprintBuilder = null) {
  if (!value?.semanticFingerprint) throw new Error(`${label} is missing`);
  const canonical = clone(value);
  delete canonical.semanticFingerprint;
  const fingerprint = fingerprintBuilder ? fingerprintBuilder(value) : semanticHash(canonical);
  if (fingerprint !== value.semanticFingerprint) throw new Error(`${label} fingerprint mismatch`);
  return freeze(clone(value));
}

function exactRegistryBudget(registry, supplied = null) {
  const budget = registry?.retryPolicy;
  if (!budget?.budgetRef || !Number.isInteger(budget.maximumAttemptCount) ||
      !Number.isInteger(budget.maximumRepeatedIdenticalFailureCount) ||
      !Number.isInteger(budget.maximumWallTimeMs) || !Number.isInteger(budget.maximumTotalWallTimeMs) ||
      budget.maximumAttemptCount < 1 || budget.maximumRepeatedIdenticalFailureCount < 1 ||
      budget.maximumWallTimeMs < 1 || budget.maximumTotalWallTimeMs < budget.maximumWallTimeMs) {
    throw new Error('registry retry budget is missing or not exactly bounded');
  }
  if (supplied && !same(supplied, budget)) throw new Error('substituted or reset retry budget rejected');
  return freeze(clone(budget));
}

function baseAggregate(input, registry) {
  const retryBudget = exactRegistryBudget(registry, input?.retryBudget ?? null);
  const initialSchedulerGeneration = input?.initialSchedulerGeneration ?? input?.schedulerGeneration;
  if (!input?.aggregateRef || !input?.workNodeRef) throw new Error('recovery aggregate requires exact aggregate and work refs');
  assertFingerprint(input?.sourceStateFingerprint, 'recovery aggregate sourceStateFingerprint');
  if (!Number.isInteger(initialSchedulerGeneration) || initialSchedulerGeneration < 1) {
    throw new Error('recovery aggregate initialSchedulerGeneration must be a positive integer');
  }
  return {
    schemaVersion: 'vexlife.runtime-recovery-aggregate/v1',
    aggregateRef: input.aggregateRef,
    workNodeRef: input.workNodeRef,
    sourceStateFingerprint: input.sourceStateFingerprint,
    initialSchedulerGeneration,
    schedulerGeneration: initialSchedulerGeneration,
    phase: 'READY',
    eventLedger: [],
    activeAttempt: null,
    activeFailure: null,
    activeRecoveryCycle: null,
    recoveryCycleHistory: [],
    activePolicyDecision: null,
    currentRecoveryReceipt: null,
    currentCheckpointAdmission: null,
    currentRecoveryActionReceipt: null,
    currentSchedulerClaimLifecycle: null,
    schedulerClaimLifecycleHistory: [],
    schedulerRecoveryHold: null,
    attemptLedger: [],
    failureHistory: [],
    retryBudget,
    retryBudgetFingerprint: semanticHash(retryBudget),
    checkpointLineage: [],
    continuationLineage: [],
    contextRecoveryReceipts: [],
    resourceRecoveryReceipts: [],
    rollbackLineage: [],
    quarantinedRefs: [],
    lastKnownGoodRefs: [],
    humanDecisionGates: [],
    terminalRecoveryReceipts: [],
    acceptedExternalEvents: [],
    lastSuccessfulExecutionReceipt: null,
    recoveryConvergenceReceipt: null,
    recoveredFailure: null
  };
}

function eventFingerprint(input) {
  const candidate = clone(input);
  delete candidate.eventRef;
  delete candidate.semanticFingerprint;
  return semanticHash(candidate);
}

function canonicalEvent(input) {
  if (!input || input.schemaVersion !== 'vexlife.runtime-recovery-event/v1' ||
      !RECOVERY_EVENT_TYPES.includes(input.type) || !Number.isInteger(input.sequence) || input.sequence < 0 ||
      !input.workNodeRef || !Number.isInteger(input.schedulerGeneration) || input.schedulerGeneration < 1 ||
      !input.payload || typeof input.payload !== 'object') {
    throw new Error('recovery event is malformed');
  }
  parseCanonicalTimestamp(input.occurredAt, 'recovery event occurredAt');
  const fingerprint = eventFingerprint(input);
  const eventRef = `event.runtime-recovery.${input.type.toLowerCase().replaceAll('_', '-')}.${fingerprint.slice(0, 32)}`;
  if (input.semanticFingerprint !== fingerprint || input.eventRef !== eventRef) {
    throw new Error('recovery event content-addressed identity mismatch');
  }
  return freeze(clone(input));
}

function formEvent(aggregate, type, payload, occurredAt, schedulerGeneration = aggregate.schedulerGeneration) {
  const prior = aggregate.eventLedger.at(-1) ?? null;
  const event = {
    schemaVersion: 'vexlife.runtime-recovery-event/v1',
    type,
    sequence: aggregate.eventLedger.length,
    priorEventFingerprint: prior?.semanticFingerprint ?? null,
    workNodeRef: aggregate.workNodeRef,
    schedulerGeneration,
    occurredAt,
    payload: clone(payload)
  };
  event.semanticFingerprint = eventFingerprint(event);
  event.eventRef = `event.runtime-recovery.${type.toLowerCase().replaceAll('_', '-')}.${event.semanticFingerprint.slice(0, 32)}`;
  return freeze(event);
}

function attemptIndex(state, attemptRef) {
  return state.attemptLedger.findIndex((item) => item.attemptRef === attemptRef);
}

function validateAttemptStart(attempt, state) {
  for (const field of ['attemptRef', 'operationRef', 'originRef', 'expectedTransitionRef', 'startedAt', 'deadlineAt']) {
    if (!attempt?.[field]) throw new Error(`attempt start missing ${field}`);
  }
  if (attempt.schedulerGeneration !== state.schedulerGeneration) throw new Error('attempt start uses a stale scheduler generation');
  if (attemptIndex(state, attempt.attemptRef) >= 0) throw new Error('attemptRef replay is prohibited');
  const started = parseCanonicalTimestamp(attempt.startedAt, 'attempt startedAt');
  const deadline = parseCanonicalTimestamp(attempt.deadlineAt, 'attempt deadlineAt');
  if (deadline !== started + state.retryBudget.maximumWallTimeMs) {
    throw new Error('attempt deadline does not equal the exact registry wall-time budget');
  }
  if (attempt.maximumWallTimeMs !== state.retryBudget.maximumWallTimeMs ||
      attempt.wallTimeBudgetFingerprint !== state.retryBudgetFingerprint) {
    throw new Error('attempt wall-time evidence does not bind the registry budget');
  }
  if (state.activeFailure && state.phase !== 'COMPLETED') {
    const continuation = currentCycleEntries(state.continuationLineage, state).at(-1);
    if (!state.currentRecoveryActionReceipt || !continuation ||
        continuation.nextSchedulerGeneration !== state.schedulerGeneration ||
        state.schedulerGeneration <= state.activeFailure.schedulerGeneration ||
        attempt.recoveryCycleRef !== state.activeRecoveryCycle?.recoveryCycleRef ||
        attempt.recoveryCycleFingerprint !== state.activeRecoveryCycle?.semanticFingerprint ||
        parseCanonicalTimestamp(attempt.startedAt, 'recovery attempt startedAt') <
          parseCanonicalTimestamp(continuation.observedAt, 'recovery continuation observedAt')) {
      throw new Error('retry requires aggregate-owned recovery action and scheduler-issued fresh generation');
    }
  } else if (attempt.recoveryCycleRef !== null || attempt.recoveryCycleFingerprint !== null) {
    throw new Error('new non-recovery attempt cannot reuse a historical recovery cycle');
  }
}

function validateObservationWithinAttempt(attempt, observedAt, label) {
  const started = parseCanonicalTimestamp(attempt.startedAt, `${label} startedAt`);
  const observed = parseCanonicalTimestamp(observedAt, `${label} observedAt`);
  const deadline = parseCanonicalTimestamp(attempt.deadlineAt, `${label} deadlineAt`);
  if (observed < started || observed > deadline) throw new Error(`${label} violates canonical attempt chronology or deadline`);
  return observed - started;
}

function formRecoveryCycle(state, failure, activatedAt) {
  parseCanonicalTimestamp(activatedAt, 'recovery cycle activatedAt');
  const priorCycle = state.recoveryCycleHistory.at(-1) ?? null;
  return contentAddressed({
    schemaVersion: 'vexlife.runtime-recovery-cycle/v1',
    aggregateRef: state.aggregateRef,
    workNodeRef: state.workNodeRef,
    sourceStateFingerprint: state.sourceStateFingerprint,
    schedulerGeneration: failure.schedulerGeneration,
    failureRef: failure.failureRef,
    failureFingerprint: failure.semanticFingerprint,
    operationRef: failure.operationRef,
    attemptRef: failure.attemptRef,
    cycleSequence: state.recoveryCycleHistory.length + 1,
    priorRecoveryCycleRef: priorCycle?.recoveryCycleRef ?? null,
    priorRecoveryCycleFingerprint: priorCycle?.semanticFingerprint ?? null,
    formationRef: 'formation.runtime-recovery.failure-activation-cycle.v1',
    currentness: 'CURRENT',
    activatedAt
  }, 'recoveryCycleRef', 'cycle.runtime-recovery.');
}

function validateRecoveryCycle(value, state, failure, activatedAt) {
  const cycle = assertContentAddressed(value, {
    schemaVersion: 'vexlife.runtime-recovery-cycle/v1',
    refField: 'recoveryCycleRef',
    prefix: 'cycle.runtime-recovery.',
    label: 'recovery cycle'
  });
  const expected = formRecoveryCycle(state, failure, activatedAt);
  if (!same(cycle, expected)) throw new Error('recovery cycle is forged, stale, or detached');
  return cycle;
}

function cycleBindings(state) {
  if (!state.activeRecoveryCycle) throw new Error('current recovery cycle is required');
  return {
    recoveryCycleRef: state.activeRecoveryCycle.recoveryCycleRef,
    recoveryCycleFingerprint: state.activeRecoveryCycle.semanticFingerprint
  };
}

function assertCurrentCycle(value, state, label) {
  if (!state.activeRecoveryCycle || value?.recoveryCycleRef !== state.activeRecoveryCycle.recoveryCycleRef ||
      value?.recoveryCycleFingerprint !== state.activeRecoveryCycle.semanticFingerprint) {
    throw new Error(`${label} is not bound to the exact current recovery cycle`);
  }
  return value;
}

function currentCycleEntries(values, state) {
  const cycleRef = state.activeRecoveryCycle?.recoveryCycleRef;
  return (values ?? []).filter((item) => item.recoveryCycleRef === cycleRef);
}

function validateCheckpoint(value) {
  return assertContentAddressed(value, {
    schemaVersion: 'vexlife.runtime-recovery-checkpoint/v1',
    refField: 'recoveryCheckpointRef',
    prefix: 'checkpoint.runtime-recovery.',
    label: 'recovery checkpoint'
  });
}

function validateSchedulerCheckpointConsumption(value) {
  if (!value || value.schemaVersion !== 'vexlife.intent-scheduler-recovery-checkpoint-consumption/v1' ||
      !value.semanticFingerprint) {
    throw new Error('scheduler recovery checkpoint consumption is missing or has the wrong schema');
  }
  const candidate = clone(value);
  delete candidate.semanticFingerprint;
  if (semanticHash(candidate) !== value.semanticFingerprint || value.state !== 'CLAIMED_CURRENT' ||
      value.currentness !== 'CURRENT' || value.schedulerPhase !== 'PAUSED' ||
      value.checkpointCurrentState !== 'PAUSED_AT_CHECKPOINT' ||
      value.leaseReleaseFingerprints?.length !== LEASE_KINDS.length ||
      value.leaseReleaseReceiptRefs?.length !== LEASE_KINDS.length) {
    throw new Error('scheduler recovery checkpoint consumption is stale, malformed, or forged');
  }
  return freeze(clone(value));
}

function validateCheckpointAdmission(value) {
  return assertContentAddressed(value, {
    schemaVersion: 'vexlife.runtime-recovery-checkpoint-admission/v1',
    refField: 'admissionRef',
    prefix: 'admission.runtime-recovery.checkpoint.',
    label: 'recovery checkpoint admission'
  });
}

function validateContinuation(value) {
  return assertContentAddressed(value, {
    schemaVersion: 'vexlife.runtime-recovery-continuation/v1',
    refField: 'continuationRef',
    prefix: 'continuation.runtime-recovery.',
    label: 'recovery continuation'
  });
}

function validateSchedulerRecoveryResume(value) {
  if (!value || value.schemaVersion !== 'vexlife.intent-scheduler-recovery-resume-receipt/v1' ||
      !value.semanticFingerprint) {
    throw new Error('scheduler recovery resume receipt is missing or has the wrong schema');
  }
  const candidate = clone(value);
  delete candidate.semanticFingerprint;
  if (semanticHash(candidate) !== value.semanticFingerprint ||
      value.state !== 'RECOVERY_OUTPUTS_CONSUMED_CURRENT' || value.currentness !== 'CURRENT' ||
      value.checkpointCurrentState !== 'RESUMED' || Object.keys(value.freshLeaseFingerprints ?? {}).length !== 6) {
    throw new Error('scheduler recovery resume receipt is forged, stale, or incomplete');
  }
  return freeze(clone(value));
}

export function validateSchedulerRecoveryClaimCurrentnessReceipt(value, {
  schedulerAggregate,
  registry
} = {}) {
  if (!value || value.schemaVersion !== 'vexlife.intent-scheduler-recovery-claim-currentness/v1' ||
      value.contractRef !== 'contract.intent-scheduler.recovery-claim-currentness/v1' ||
      value.formationRef !== 'formation.intent-scheduler.recovery-claim-currentness.v1' ||
      !value.currentnessReceiptRef || !value.semanticFingerprint) {
    throw new Error('scheduler recovery claim currentness receipt is missing or has the wrong contract');
  }
  const candidate = clone(value);
  delete candidate.currentnessReceiptRef;
  delete candidate.semanticFingerprint;
  const fingerprint = semanticHash(candidate);
  if (fingerprint !== value.semanticFingerprint ||
      value.currentnessReceiptRef !==
        `receipt.intent-scheduler.recovery-claim-currentness.${fingerprint.slice(0, 32)}`) {
    throw new Error('scheduler recovery claim currentness receipt fingerprint mismatch');
  }
  const scheduler = clone(schedulerAggregate);
  const suppliedSchedulerFingerprint = scheduler?.semanticFingerprint;
  delete scheduler?.semanticFingerprint;
  if (!scheduler || semanticHash(scheduler) !== suppliedSchedulerFingerprint ||
      value.schedulerAggregateFingerprint !== suppliedSchedulerFingerprint) {
    throw new Error('scheduler recovery claim currentness receipt is detached from exact scheduler truth');
  }
  const claim = schedulerAggregate.recoveryClaims?.find((item) => item.checkpointRef === value.checkpointRef);
  const checkpoint = schedulerAggregate.canonicalCheckpoints?.find((item) =>
    item.checkpointRef === value.checkpointRef
  );
  const pointer = schedulerAggregate.checkpointPointers?.find((item) => item.checkpointRef === value.checkpointRef);
  const transition = schedulerAggregate.recoveryClaimLedger?.find((item) =>
    item.semanticFingerprint === value.claimTransitionFingerprint
  );
  const expectedCurrentness = ['CLAIMED_CURRENT', 'RESUMED_CONSUMED'].includes(claim?.state)
    ? 'CURRENT'
    : 'TERMINAL';
  const claimReceipt = schedulerAggregate.recoveryClaimLedger?.find((item) =>
    item.type === 'CLAIMED_CURRENT' && item.checkpointRef === value.checkpointRef
  )?.edgeEvidence?.recoveryClaimReceipt;
  if (!claim || !checkpoint || !pointer || !transition ||
      claim.lastTransitionRef !== value.claimTransitionRef ||
      claim.lastTransitionFingerprint !== value.claimTransitionFingerprint ||
      claim.claimReceiptRef !== value.claimReceiptRef ||
      claim.claimReceiptFingerprint !== value.claimReceiptFingerprint ||
      claimReceipt?.semanticFingerprint !== value.claimReceiptFingerprint ||
      validateSchedulerRecoveryClaimReceipt(claimReceipt, { registry }).claimReceiptRef !== value.claimReceiptRef ||
      checkpoint.semanticFingerprint !== value.checkpointFingerprint ||
      pointer.pointerTransitionRef !== value.checkpointPointerRef ||
      pointer.pointerTransitionFingerprint !== value.checkpointPointerFingerprint ||
      pointer.currentState !== value.checkpointPointerState ||
      claim.recoveryAggregateRef !== value.recoveryAggregateRef ||
      claim.recoveryAggregateFingerprint !== value.recoveryAggregateFingerprint ||
      claim.recoveryCycleRef !== value.recoveryCycleRef ||
      claim.recoveryCycleFingerprint !== value.recoveryCycleFingerprint ||
      claim.failureRef !== value.failureRef || claim.failureFingerprint !== value.failureFingerprint ||
      claim.onceOnlyActivationRef !== value.onceOnlyActivationRef ||
      claim.schedulerGeneration !== value.schedulerGeneration || claim.state !== value.claimLifecycle ||
      (claim.dispositionReceiptRef ?? null) !== value.dispositionReceiptRef ||
      (claim.dispositionReceiptFingerprint ?? null) !== value.dispositionReceiptFingerprint ||
      (claim.reasonRef ?? null) !== value.reasonRef ||
      (claim.postDispositionCheckpointPolicy ?? null) !== value.postDispositionCheckpointPolicy ||
      value.currentness !== expectedCurrentness ||
      parseCanonicalTimestamp(value.observedAt, 'scheduler recovery claim currentness observedAt') <
        parseCanonicalTimestamp(claim.lastObservedAt, 'scheduler recovery claim lifecycle observedAt')) {
    throw new Error('scheduler recovery claim currentness receipt differs from scheduler-owned lifecycle replay');
  }
  return freeze(clone(value));
}

function validateRecordedSchedulerClaimLifecycle(value) {
  if (!value || value.schemaVersion !== 'vexlife.intent-scheduler-recovery-claim-currentness/v1' ||
      value.contractRef !== 'contract.intent-scheduler.recovery-claim-currentness/v1' ||
      value.formationRef !== 'formation.intent-scheduler.recovery-claim-currentness.v1' ||
      !['CLAIMED_CURRENT', 'RESUMED_CONSUMED', 'TERMINAL_CONSUMED', 'INVALIDATED_OR_ABANDONED']
        .includes(value.claimLifecycle) || !value.semanticFingerprint) {
    throw new Error('recorded scheduler recovery claim lifecycle is malformed');
  }
  const candidate = clone(value);
  delete candidate.currentnessReceiptRef;
  delete candidate.semanticFingerprint;
  const fingerprint = semanticHash(candidate);
  if (fingerprint !== value.semanticFingerprint ||
      value.currentnessReceiptRef !==
        `receipt.intent-scheduler.recovery-claim-currentness.${fingerprint.slice(0, 32)}` ||
      value.currentness !== (['CLAIMED_CURRENT', 'RESUMED_CONSUMED'].includes(value.claimLifecycle)
        ? 'CURRENT' : 'TERMINAL')) {
    throw new Error('recorded scheduler recovery claim lifecycle fingerprint/currentness mismatch');
  }
  parseCanonicalTimestamp(value.observedAt, 'recorded scheduler recovery claim lifecycle observedAt');
  return freeze(clone(value));
}

function assertRecoveryClaimLifecycle(state, expected, label) {
  const receipt = state.currentSchedulerClaimLifecycle;
  if (!receipt || !expected.includes(receipt.claimLifecycle) || receipt.currentness !== 'CURRENT' ||
      receipt.recoveryAggregateRef !== state.aggregateRef ||
      receipt.recoveryCycleRef !== state.activeRecoveryCycle?.recoveryCycleRef ||
      receipt.recoveryCycleFingerprint !== state.activeRecoveryCycle?.semanticFingerprint ||
      receipt.failureRef !== state.activeFailure?.failureRef ||
      receipt.failureFingerprint !== state.activeFailure?.semanticFingerprint) {
    throw new Error(`${label} requires exact scheduler-managed ${expected.join(' or ')} claim currentness`);
  }
  return receipt;
}

function externalEventAllowedClaimLifecycles(event) {
  return [
    'vexlife.runtime-recovery-external-wait-event/v1',
    'vexlife.runtime-recovery-external-resume-event/v1',
    'vexlife.runtime-recovery-split-route-event/v1'
  ].includes(event?.schemaVersion)
    ? ['CLAIMED_CURRENT']
    : ['CLAIMED_CURRENT', 'RESUMED_CONSUMED'];
}

function externalEventClaimLifecycleBindings(receipt) {
  return {
    schedulerClaimLifecycle: receipt.claimLifecycle,
    schedulerClaimCurrentnessReceiptRef: receipt.currentnessReceiptRef,
    schedulerClaimCurrentnessReceiptFingerprint: receipt.semanticFingerprint
  };
}

function assertExternalEventClaimLifecycle(event, state) {
  const receipt = assertRecoveryClaimLifecycle(
    state,
    externalEventAllowedClaimLifecycles(event),
    'external recovery event'
  );
  const expected = externalEventClaimLifecycleBindings(receipt);
  if (event.schedulerClaimLifecycle !== expected.schedulerClaimLifecycle ||
      event.schedulerClaimCurrentnessReceiptRef !== expected.schedulerClaimCurrentnessReceiptRef ||
      event.schedulerClaimCurrentnessReceiptFingerprint !==
        expected.schedulerClaimCurrentnessReceiptFingerprint) {
    throw new Error(`external recovery event is detached from exact scheduler claim lifecycle currentness: ${
      event.schedulerClaimLifecycle ?? 'MISSING'
    }/${event.schedulerClaimCurrentnessReceiptRef ?? 'MISSING'} expected ${
      expected.schedulerClaimLifecycle
    }/${expected.schedulerClaimCurrentnessReceiptRef}`);
  }
  return receipt;
}

function externalEventLifecycleRejectionReason(state, event) {
  const receipt = state.currentSchedulerClaimLifecycle;
  const allowed = externalEventAllowedClaimLifecycles(event);
  if (receipt?.claimLifecycle === 'INVALIDATED_OR_ABANDONED') {
    return 'SCHEDULER_CLAIM_INVALIDATED_EXTERNAL_EVENT_REJECTED';
  }
  if (receipt?.claimLifecycle === 'TERMINAL_CONSUMED') {
    return 'SCHEDULER_CLAIM_TERMINAL_EXTERNAL_EVENT_REJECTED';
  }
  if (!receipt || receipt.currentness !== 'CURRENT' || !allowed.includes(receipt.claimLifecycle)) {
    return 'SCHEDULER_CLAIM_LIFECYCLE_EXTERNAL_EVENT_REJECTED';
  }
  return null;
}

function validateContextReceipt(value) {
  return assertContentAddressed(value, {
    schemaVersion: 'vexlife.runtime-context-recovery-receipt/v1',
    refField: 'contextRecoveryReceiptRef',
    prefix: 'receipt.runtime-recovery.context.',
    label: 'context recovery receipt'
  });
}

function validateResourceReceipt(value) {
  return assertContentAddressed(value, {
    schemaVersion: 'vexlife.runtime-resource-recovery-receipt/v1',
    refField: 'resourceRecoveryReceiptRef',
    prefix: 'receipt.runtime-recovery.resource.',
    label: 'resource recovery receipt'
  });
}

function validateRecoveryReceipt(value) {
  return assertContentAddressed(value, {
    schemaVersion: 'vexlife.runtime-recovery-receipt/v1',
    refField: 'recoveryReceiptRef',
    prefix: 'receipt.runtime-recovery.',
    label: 'nonterminal recovery receipt'
  });
}

function validateActionReceipt(value) {
  return assertContentAddressed(value, {
    schemaVersion: 'vexlife.runtime-recovery-action-receipt/v1',
    refField: 'actionReceiptRef',
    prefix: 'receipt.runtime-recovery.action.',
    label: 'recovery action receipt'
  });
}

function validateExecutionReceipt(value) {
  return assertContentAddressed(value, {
    schemaVersion: 'vexlife.runtime-executor-boundary-receipt/v1',
    refField: 'executionReceiptRef',
    prefix: 'receipt.runtime-executor.',
    label: 'executor boundary receipt'
  });
}

function validateConvergenceReceipt(value) {
  return assertContentAddressed(value, {
    schemaVersion: 'vexlife.runtime-recovery-convergence-receipt/v1',
    refField: 'convergenceReceiptRef',
    prefix: 'receipt.runtime-recovery.convergence.',
    label: 'recovery convergence receipt'
  });
}

function validateTerminalReceipt(value) {
  return assertContentAddressed(value, {
    schemaVersion: 'vexlife.runtime-recovery-terminal-receipt/v1',
    refField: 'recoveryReceiptRef',
    prefix: 'receipt.runtime-recovery.terminal.',
    label: 'terminal recovery receipt'
  });
}

function validateTransactionReceipt(value, registry = null) {
  if (!value || value.schemaVersion !== 'vexlife.runtime-transactional-recovery-receipt/v1') {
    throw new Error('transactional recovery receipt is missing or has the wrong schema');
  }
  const canonical = clone(value);
  delete canonical.semanticFingerprint;
  if (semanticHash(canonical) !== value.semanticFingerprint || value.externalEffectsExecuted !== false) {
    throw new Error('transactional recovery receipt fingerprint/effect boundary mismatch');
  }
  const adapter = value.adapterContract;
  const registered = registry?.transactionalRecoveryContract?.admittedAdapters?.find((item) =>
    item.adapterRef === value.adapterRef);
  if (!adapter || adapter.schemaVersion !== 'vexlife.runtime-transactional-adapter-contract/v1' ||
      semanticHash(Object.fromEntries(Object.entries(adapter).filter(([key]) => key !== 'semanticFingerprint'))) !==
        adapter.semanticFingerprint ||
      adapter.adapterRef !== value.adapterRef || adapter.effectClass !== 'DETERMINISTIC_NO_EFFECT' ||
      !registered || registered.effectClass !== adapter.effectClass ||
      !registered.allowedFaultPlanRefs.includes(adapter.faultPlanRef) ||
      value.expectedBeforeFingerprint !== adapter.beforeFingerprint ||
      value.observedBeforeFingerprint !== adapter.beforeFingerprint ||
      (adapter.partialWrite && value.partialResultFingerprint !== adapter.attemptedFingerprint)) {
    throw new Error('transactional recovery adapter/fault-plan provenance mismatch');
  }
  const expectedState = adapter.rollbackFails
    ? (adapter.restoreFails ? 'QUARANTINED' : 'LAST_KNOWN_GOOD_RESTORED')
    : 'ROLLED_BACK';
  if (value.state !== expectedState ||
      (expectedState === 'ROLLED_BACK' &&
        (!value.rollbackVerified || value.rollbackReadBackFingerprint !== adapter.beforeFingerprint)) ||
      (expectedState === 'LAST_KNOWN_GOOD_RESTORED' &&
        (!value.lastKnownGoodRestored || value.lastKnownGoodReadBackFingerprint !== adapter.lastKnownGoodFingerprint)) ||
      (expectedState === 'QUARANTINED' && (!value.quarantined || !value.quarantineRef))) {
    throw new Error('transactional recovery disposition differs from registered adapter replay');
  }
  parseCanonicalTimestamp(value.observedAt, 'transactional recovery observedAt');
  for (const field of ['expectedBeforeFingerprint', 'observedBeforeFingerprint', 'partialResultFingerprint']) {
    assertFingerprint(value[field], `transactional recovery ${field}`);
  }
  if (value.rollbackReadBackFingerprint !== null) assertFingerprint(value.rollbackReadBackFingerprint, 'rollback read-back');
  if (value.lastKnownGoodExpectedFingerprint !== null) assertFingerprint(value.lastKnownGoodExpectedFingerprint, 'last-known-good expected');
  if (value.lastKnownGoodReadBackFingerprint !== null) assertFingerprint(value.lastKnownGoodReadBackFingerprint, 'last-known-good read-back');
  return freeze(clone(value));
}

function validateCycleBoundTransactionReceipt(value, state, registry) {
  const adopted = assertContentAddressed(value, {
    schemaVersion: 'vexlife.runtime-recovery-cycle-transaction-receipt/v1',
    refField: 'cycleTransactionReceiptRef',
    prefix: 'receipt.runtime-recovery.cycle-transaction.',
    label: 'cycle-bound transactional recovery receipt'
  });
  const source = validateTransactionReceipt(adopted.sourceTransactionReceipt, registry);
  const claim = validateSchedulerRecoveryClaimReceipt(adopted.recoveryClaimReceipt, { registry });
  const admission = validateCheckpointAdmission(adopted.checkpointAdmission);
  assertCurrentCycle(adopted, state, 'cycle-bound transactional recovery receipt');
  const sourceFields = Object.keys(source).filter((field) =>
    !['schemaVersion', 'semanticFingerprint'].includes(field)
  );
  if (source.recoveryCycleRef || source.recoveryCycleFingerprint ||
      adopted.formationRef !== 'formation.runtime-recovery.cycle-transaction-adoption.v1' ||
      adopted.currentness !== 'CURRENT' ||
      adopted.sourceTransactionFingerprint !== source.semanticFingerprint ||
      sourceFields.some((field) => !same(adopted[field], source[field])) ||
      claim.claimReceiptRef !== adopted.recoveryClaimReceiptRef ||
      claim.semanticFingerprint !== adopted.recoveryClaimReceiptFingerprint ||
      admission.admissionRef !== adopted.checkpointAdmissionRef ||
      admission.semanticFingerprint !== adopted.checkpointAdmissionFingerprint ||
      admission.admitted !== true || admission.currentness !== 'CURRENT' ||
      state.currentCheckpointAdmission?.semanticFingerprint !== admission.semanticFingerprint ||
      state.aggregateRef !== claim.aggregateRef || state.aggregateRef !== admission.aggregateRef ||
      state.activeRecoveryCycle?.recoveryCycleRef !== claim.recoveryCycleRef ||
      state.activeRecoveryCycle?.semanticFingerprint !== claim.recoveryCycleFingerprint ||
      state.activeRecoveryCycle?.recoveryCycleRef !== admission.recoveryCycleRef ||
      state.activeRecoveryCycle?.semanticFingerprint !== admission.recoveryCycleFingerprint ||
      state.activeFailure?.failureRef !== claim.activeFailureRef ||
      state.activeFailure?.semanticFingerprint !== claim.activeFailureFingerprint ||
      state.activeFailure?.semanticFingerprint !== admission.failureFingerprint ||
      state.workNodeRef !== claim.workNodeRef || state.workNodeRef !== admission.workNodeRef ||
      state.sourceStateFingerprint !== claim.sourceStateFingerprint ||
      state.sourceStateFingerprint !== admission.sourceStateFingerprint ||
      source.operationRef !== state.activeFailure?.operationRef ||
      Date.parse(source.observedAt) < Date.parse(admission.observedAt) ||
      Date.parse(adopted.cycleAdoptedAt) < Date.parse(source.observedAt) ||
      Date.parse(admission.observedAt) < Date.parse(claim.formedAt)) {
    throw new Error('transactional recovery evidence was not formed for the exact current claim/admission/cycle');
  }
  parseCanonicalTimestamp(adopted.cycleAdoptedAt, 'cycle transaction adoption observedAt');
  return adopted;
}

export function createCycleBoundTransactionalRecoveryReceipt({
  aggregate,
  transactionalRecoveryReceipt,
  recoveryClaimReceipt,
  checkpointAdmission,
  observedAt,
  registry
}) {
  const owner = createRecoveryAggregate(aggregate, { registry });
  assertRecoveryClaimLifecycle(owner, ['CLAIMED_CURRENT'], 'transactional recovery adoption');
  const source = validateTransactionReceipt(transactionalRecoveryReceipt, registry);
  if (source.recoveryCycleRef || source.recoveryCycleFingerprint) {
    throw new Error('transactional recovery source evidence must remain immutable and unscoped before exact adoption');
  }
  const claim = validateSchedulerRecoveryClaimReceipt(recoveryClaimReceipt, { registry });
  const admission = validateCheckpointAdmission(checkpointAdmission);
  const receipt = contentAddressed({
    schemaVersion: 'vexlife.runtime-recovery-cycle-transaction-receipt/v1',
    formationRef: 'formation.runtime-recovery.cycle-transaction-adoption.v1',
    ...Object.fromEntries(Object.entries(source).filter(([field]) =>
      !['schemaVersion', 'semanticFingerprint'].includes(field)
    )),
    sourceTransactionReceipt: source,
    sourceTransactionFingerprint: source.semanticFingerprint,
    recoveryClaimReceipt: claim,
    recoveryClaimReceiptRef: claim.claimReceiptRef,
    recoveryClaimReceiptFingerprint: claim.semanticFingerprint,
    checkpointAdmission: admission,
    checkpointAdmissionRef: admission.admissionRef,
    checkpointAdmissionFingerprint: admission.semanticFingerprint,
    ...cycleBindings(owner),
    currentness: 'CURRENT',
    cycleAdoptedAt: observedAt
  }, 'cycleTransactionReceiptRef', 'receipt.runtime-recovery.cycle-transaction.');
  return validateCycleBoundTransactionReceipt(receipt, owner, registry);
}

function policyInputsFromPayload(payload) {
  return {
    checkpointAdmission: payload.checkpointAdmission ?? null,
    contextAdmissionReceipt: payload.contextAdmissionReceipt ?? null,
    resourceAdmissionReceipt: payload.resourceAdmissionReceipt ?? null,
    authorityBoundary: payload.authorityBoundary,
    observedAt: payload.decision.observedAt
  };
}

function applyEvent(stateInput, eventInput, registry) {
  const state = clone(stateInput);
  const event = canonicalEvent(eventInput);
  const prior = state.eventLedger.at(-1) ?? null;
  if (event.sequence !== state.eventLedger.length || event.priorEventFingerprint !== (prior?.semanticFingerprint ?? null) ||
      event.workNodeRef !== state.workNodeRef || event.schedulerGeneration !== state.schedulerGeneration) {
    throw new Error('recovery event order, chain, work, or scheduler generation is invalid');
  }
  if (state.phase === 'COMPLETED' && event.type !== 'ATTEMPT_STARTED') {
    throw new Error('terminal recovery state can only begin a new exact attempt/cycle');
  }
  const payload = event.payload;
  assertExactEventPayload(event.type, payload, registry);

  switch (event.type) {
    case 'ATTEMPT_STARTED': {
      if (state.activeAttempt) throw new Error('attempt start is impossible while another attempt is active');
      if (state.activeFailure) {
        assertRecoveryClaimLifecycle(state, ['RESUMED_CONSUMED'], 'post-resume attempt start');
      }
      validateAttemptStart(payload.attempt, state);
      if (state.phase === 'COMPLETED') {
        state.activeFailure = null;
        state.activeRecoveryCycle = null;
        state.activePolicyDecision = null;
        state.currentRecoveryReceipt = null;
        state.currentCheckpointAdmission = null;
        state.currentRecoveryActionReceipt = null;
        state.currentSchedulerClaimLifecycle = null;
        state.schedulerRecoveryHold = null;
        state.lastSuccessfulExecutionReceipt = null;
        state.recoveryConvergenceReceipt = null;
        state.recoveredFailure = null;
      }
      state.activeAttempt = freeze({ ...clone(payload.attempt), state: 'STARTED' });
      state.attemptLedger.push(clone(state.activeAttempt));
      if (state.phase === 'COMPLETED') state.phase = 'READY';
      break;
    }
    case 'ATTEMPT_SUCCEEDED': {
      if (!state.activeAttempt || state.activeAttempt.attemptRef !== payload.attemptRef) {
        throw new Error('attempt success requires the exact active attempt');
      }
      if (state.activeFailure) {
        assertRecoveryClaimLifecycle(state, ['RESUMED_CONSUMED'], 'recovery attempt success');
      }
      const elapsedMs = validateObservationWithinAttempt(state.activeAttempt, payload.completedAt, 'attempt success');
      const executionReceipt = validateExecutionReceipt(payload.executionReceipt);
      if (executionReceipt.executorOutcome !== 'SUCCEEDED' || executionReceipt.attemptRef !== payload.attemptRef ||
          executionReceipt.schedulerGeneration !== state.schedulerGeneration ||
          executionReceipt.aggregateRef !== state.aggregateRef ||
          executionReceipt.workNodeRef !== state.workNodeRef ||
          executionReceipt.sourceStateFingerprint !== state.sourceStateFingerprint ||
          executionReceipt.operationRef !== state.activeAttempt.operationRef ||
          executionReceipt.startedAt !== state.activeAttempt.startedAt ||
          executionReceipt.deadlineAt !== state.activeAttempt.deadlineAt ||
          executionReceipt.completedAt !== payload.completedAt ||
          executionReceipt.resultFingerprint !== semanticHash(executionReceipt.resultEvidence ?? null)) {
        throw new Error('attempt success execution receipt is detached');
      }
      if (state.activeFailure) {
        const continuation = currentCycleEntries(state.continuationLineage, state).at(-1);
        assertCurrentCycle(executionReceipt, state, 'successful execution');
        if (!state.currentRecoveryActionReceipt || !continuation ||
            executionReceipt.actionReceiptFingerprint !== state.currentRecoveryActionReceipt.semanticFingerprint ||
            executionReceipt.schedulerContinuationFingerprint !== continuation.semanticFingerprint ||
            parseCanonicalTimestamp(state.activeAttempt.startedAt, 'recovery success startedAt') <
              parseCanonicalTimestamp(continuation.observedAt, 'current continuation observedAt')) {
          throw new Error('successful execution did not occur after the current action and continuation');
        }
      } else if (executionReceipt.recoveryCycleRef !== null || executionReceipt.recoveryCycleFingerprint !== null) {
        throw new Error('non-recovery success cannot claim a prior recovery cycle');
      }
      const index = attemptIndex(state, payload.attemptRef);
      state.attemptLedger[index] = {
        ...state.attemptLedger[index],
        state: 'SUCCEEDED',
        outcome: 'SUCCEEDED',
        completedAt: payload.completedAt,
        elapsedMs,
        resultFingerprint: executionReceipt.resultFingerprint,
        executionReceiptRef: executionReceipt.executionReceiptRef,
        executionReceiptFingerprint: executionReceipt.semanticFingerprint
      };
      state.activeAttempt = null;
      state.lastSuccessfulExecutionReceipt = executionReceipt;
      state.phase = 'RECOVERING';
      break;
    }
    case 'ATTEMPT_FAILED': {
      if (!state.activeAttempt || state.activeAttempt.attemptRef !== payload.failure?.attemptRef) {
        throw new Error('attempt failure requires the exact active attempt');
      }
      const validation = validateFailureEnvelope(payload.failure, { registry });
      if (!validation.ok) throw new Error(`attempt failure envelope invalid: ${validation.errors.join(', ')}`);
      if (payload.failure.workNodeRef !== state.workNodeRef ||
          payload.failure.sourceStateFingerprint !== state.sourceStateFingerprint ||
          payload.failure.schedulerGeneration !== state.schedulerGeneration ||
          payload.failure.operationRef !== state.activeAttempt.operationRef) {
        throw new Error('attempt failure is detached from the active aggregate attempt');
      }
      validateRecoveryCycle(payload.recoveryCycle, state, payload.failure, event.occurredAt);
      const elapsedMs = validateObservationWithinAttempt(state.activeAttempt, payload.failure.observedAt, 'attempt failure');
      const index = attemptIndex(state, state.activeAttempt.attemptRef);
      state.attemptLedger[index] = {
        ...state.attemptLedger[index],
        state: 'FAILED',
        outcome: 'FAILED',
        completedAt: payload.failure.observedAt,
        elapsedMs,
        failureRef: payload.failure.failureRef,
        failureFingerprint: payload.failure.semanticFingerprint,
        failureRecurrenceFingerprint: payload.failure.recurrenceFingerprint,
        ...cycleBindings({ activeRecoveryCycle: payload.recoveryCycle })
      };
      state.activeAttempt = null;
      state.phase = 'FAILURE_ACTIVE';
      break;
    }
    case 'FAILURE_ACTIVATED': {
      const previous = state.eventLedger.at(-1);
      if (previous?.type !== 'ATTEMPT_FAILED' ||
          previous.payload.failure.semanticFingerprint !== payload.failure?.semanticFingerprint ||
          !same(previous.payload.recoveryCycle, payload.recoveryCycle)) {
        throw new Error('failure activation must immediately consume the failed attempt');
      }
      const validation = validateFailureEnvelope(payload.failure, { registry });
      if (!validation.ok) throw new Error(`active failure invalid: ${validation.errors.join(', ')}`);
      const cycle = validateRecoveryCycle(payload.recoveryCycle, state, payload.failure, event.occurredAt);
      state.activeFailure = clone(payload.failure);
      state.activeRecoveryCycle = clone(cycle);
      state.recoveryCycleHistory.push(clone(cycle));
      state.failureHistory.push(clone(payload.failure));
      state.activePolicyDecision = null;
      state.currentRecoveryReceipt = null;
      state.currentCheckpointAdmission = null;
      state.currentRecoveryActionReceipt = null;
      state.lastSuccessfulExecutionReceipt = null;
      state.recoveryConvergenceReceipt = null;
      state.phase = 'FAILURE_ACTIVE';
      break;
    }
    case 'CHECKPOINT_ADMITTED': {
      if (!state.activeFailure) throw new Error('checkpoint admission requires an active failure');
      const checkpoint = validateCheckpoint(payload.checkpoint);
      const admission = validateCheckpointAdmission(payload.admission);
      const consumption = validateSchedulerCheckpointConsumption(payload.schedulerConsumptionReceipt);
      assertCurrentCycle(checkpoint, state, 'recovery checkpoint');
      assertCurrentCycle(admission, state, 'checkpoint admission');
      assertCurrentCycle(consumption, state, 'scheduler checkpoint consumption');
      const expectedCheckpoint = createRecoveryCheckpoint({
        schedulerCheckpoint: checkpoint.schedulerCheckpoint,
        schedulerConsumptionReceipt: consumption,
        aggregateRef: state.aggregateRef,
        failureRef: state.activeFailure.failureRef,
        failureFingerprint: state.activeFailure.semanticFingerprint,
        sourceStateFingerprint: state.sourceStateFingerprint,
        selectedSourceRanges: checkpoint.selectedSourceRanges,
        preservedIntentRef: checkpoint.preservedIntentRef,
        preservedInterpretationRef: checkpoint.preservedInterpretationRef,
        preservedUnknownRefs: checkpoint.preservedUnknownRefs,
        preservedAuthorityRef: checkpoint.preservedAuthorityRef,
        returnRouteRef: checkpoint.returnRouteRef,
        currentness: checkpoint.currentness,
        formedAt: checkpoint.formedAt
      });
      const expectedAdmission = admitRecoveryCheckpoint(expectedCheckpoint, state, {
        schedulerCheckpoint: checkpoint.schedulerCheckpoint,
        schedulerConsumptionReceipt: consumption,
        nextSchedulerGeneration: admission.nextSchedulerGeneration,
        currentSourceStateFingerprint: state.sourceStateFingerprint,
        observedAt: admission.observedAt,
        registry
      });
      if (!admission.admitted || admission.state !== 'ADMITTED' || admission.currentness !== 'CURRENT' ||
          !same(expectedCheckpoint, checkpoint) || !same(expectedAdmission, admission) ||
          admission.checkpointFingerprint !== checkpoint.semanticFingerprint ||
          admission.failureFingerprint !== state.activeFailure.semanticFingerprint ||
          admission.aggregateRef !== state.aggregateRef || checkpoint.aggregateRef !== state.aggregateRef ||
          checkpoint.failureFingerprint !== state.activeFailure.semanticFingerprint ||
          admission.schedulerConsumptionFingerprint !== consumption.semanticFingerprint ||
          checkpoint.schedulerConsumptionFingerprint !== consumption.semanticFingerprint ||
          admission.onceOnlyActivationRef !== consumption.onceOnlyActivationRef ||
          admission.priorSchedulerGeneration !== state.schedulerGeneration ||
          admission.workNodeRef !== state.workNodeRef ||
          admission.sourceStateFingerprint !== state.sourceStateFingerprint) {
        throw new Error('checkpoint admission receipt is stale or detached');
      }
      if (state.currentCheckpointAdmission || state.checkpointLineage.some((item) =>
        item.onceOnlyActivationRef === checkpoint.onceOnlyActivationRef ||
        item.leaseReleaseFingerprints && Object.values(item.leaseReleaseFingerprints)
          .some((fingerprint) => Object.values(checkpoint.leaseReleaseFingerprints).includes(fingerprint)))) {
        throw new Error('checkpoint activation or released lease was already consumed by this aggregate');
      }
      const existing = state.checkpointLineage.find((item) => item.recoveryCheckpointRef === checkpoint.recoveryCheckpointRef);
      if (existing && existing.semanticFingerprint !== checkpoint.semanticFingerprint) {
        throw new Error('same-ref/different-content checkpoint rejected');
      }
      if (!existing) state.checkpointLineage.push(checkpoint);
      state.currentCheckpointAdmission = admission;
      state.phase = 'CHECKPOINTED';
      break;
    }
    case 'SCHEDULER_CLAIM_LIFECYCLE_RECORDED': {
      const receipt = validateRecordedSchedulerClaimLifecycle(payload.receipt);
      const priorLifecycle = state.currentSchedulerClaimLifecycle?.claimLifecycle ?? null;
      const allowed = priorLifecycle === null
        ? ['CLAIMED_CURRENT']
        : priorLifecycle === 'CLAIMED_CURRENT'
          ? ['RESUMED_CONSUMED', 'INVALIDATED_OR_ABANDONED']
          : priorLifecycle === 'RESUMED_CONSUMED'
            ? ['TERMINAL_CONSUMED', 'INVALIDATED_OR_ABANDONED']
            : [];
      if (!allowed.includes(receipt.claimLifecycle) ||
          receipt.recoveryAggregateRef !== state.aggregateRef ||
          receipt.recoveryCycleRef !== state.activeRecoveryCycle?.recoveryCycleRef ||
          receipt.recoveryCycleFingerprint !== state.activeRecoveryCycle?.semanticFingerprint ||
          receipt.failureRef !== state.activeFailure?.failureRef ||
          receipt.failureFingerprint !== state.activeFailure?.semanticFingerprint ||
          receipt.checkpointRef !== state.currentCheckpointAdmission?.schedulerCheckpointRef ||
          receipt.checkpointFingerprint !== state.currentCheckpointAdmission?.schedulerCheckpointFingerprint ||
          (state.currentSchedulerClaimLifecycle &&
            parseCanonicalTimestamp(receipt.observedAt, 'scheduler claim lifecycle observedAt') <=
              parseCanonicalTimestamp(
                state.currentSchedulerClaimLifecycle.observedAt,
                'prior scheduler claim lifecycle observedAt'
              ))) {
        throw new Error('scheduler recovery claim lifecycle is stale, detached, or out of order');
      }
      state.currentSchedulerClaimLifecycle = receipt;
      state.schedulerClaimLifecycleHistory.push(receipt);
      if (receipt.claimLifecycle === 'INVALIDATED_OR_ABANDONED') {
        state.schedulerRecoveryHold = {
          schemaVersion: 'vexlife.runtime-recovery-scheduler-claim-hold/v1',
          dispositionReceiptRef: receipt.dispositionReceiptRef,
          dispositionReceiptFingerprint: receipt.dispositionReceiptFingerprint,
          reasonRef: receipt.reasonRef,
          postDispositionCheckpointPolicy: receipt.postDispositionCheckpointPolicy,
          checkpointRef: receipt.checkpointRef,
          claimTransitionRef: receipt.claimTransitionRef,
          claimTransitionFingerprint: receipt.claimTransitionFingerprint,
          currentnessReceiptRef: receipt.currentnessReceiptRef,
          currentnessReceiptFingerprint: receipt.semanticFingerprint,
          state: 'BLOCKED',
          currentness: 'CURRENT',
          observedAt: receipt.observedAt
        };
        state.schedulerRecoveryHold.semanticFingerprint = semanticHash(state.schedulerRecoveryHold);
        state.phase = 'BLOCKED';
      }
      break;
    }
    case 'POLICY_DECIDED': {
      assertRecoveryClaimLifecycle(state, ['CLAIMED_CURRENT'], 'recovery policy decision');
      if (!state.activeFailure || state.activePolicyDecision) throw new Error('policy decision requires one undecided active failure');
      const decision = validateRecoveryPolicyDecision(payload.decision);
      assertCurrentCycle(decision, state, 'recovery policy decision');
      const expected = resolveRecoveryPolicy({
        failure: state.activeFailure,
        aggregate: state,
        ...policyInputsFromPayload(payload),
        registry
      });
      if (expected.semanticFingerprint !== decision.semanticFingerprint) {
        throw new Error('policy decision differs from exact source-managed replay');
      }
      const receipt = validateRecoveryReceipt(payload.recoveryReceipt);
      assertCurrentCycle(receipt, state, 'nonterminal recovery receipt');
      if (receipt.failureFingerprint !== state.activeFailure.semanticFingerprint ||
          receipt.decisionFingerprint !== decision.semanticFingerprint ||
          !same(receipt, nonterminalRecoveryReceipt(
            state,
            state.activeFailure,
            decision,
            payload.checkpointAdmission,
            event.occurredAt
          ))) {
        throw new Error('nonterminal recovery receipt is detached from failure or policy');
      }
      state.activePolicyDecision = decision;
      state.currentRecoveryReceipt = receipt;
      state.phase = decision.executorOutcome === 'FAILED_NEEDS_HUMAN' ? 'WAITING_HUMAN'
        : decision.executorOutcome === 'FAILED_QUARANTINED' ? 'QUARANTINED'
          : decision.executorOutcome === 'FAILED_BLOCKED' ? 'BLOCKED' : 'CHECKPOINTED';
      break;
    }
    case 'CONTEXT_RECOVERED': {
      assertRecoveryClaimLifecycle(state, ['CLAIMED_CURRENT'], 'context recovery');
      const receipt = validateContextReceipt(payload.receipt);
      assertCurrentCycle(receipt, state, 'context recovery receipt');
      if (!state.activeFailure || receipt.failureFingerprint !== state.activeFailure.semanticFingerprint ||
          receipt.checkpointAdmissionFingerprint !== state.currentCheckpointAdmission?.semanticFingerprint) {
        throw new Error('context recovery receipt is detached');
      }
      const expected = recoverContextBudget({
        workNodeRef: state.workNodeRef,
        sourceStateFingerprint: state.sourceStateFingerprint,
        failureFingerprint: state.activeFailure.semanticFingerprint,
        checkpointAdmission: state.currentCheckpointAdmission,
        sourceSegments: receipt.sourceSegments,
        intentRef: receipt.preservedIntentRef,
        interpretationRef: receipt.preservedInterpretationRef,
        unknownRefs: receipt.preservedUnknownRefs,
        authorityRef: receipt.preservedAuthorityRef,
        returnRouteRef: receipt.returnRouteRef,
        inputTokenEstimate: receipt.originalInputTokenEstimate,
        reservedOutputTokens: receipt.reservedOutputTokens,
        hardTokenLimit: receipt.hardTokenLimit,
        splitWorkNodeRef: receipt.splitWorkNodeRef,
        clarificationRef: receipt.clarificationRef,
        currentness: receipt.currentness,
        formedAt: receipt.formedAt,
        observedAt: receipt.observedAt
      });
      if (!same(expected, receipt)) throw new Error('context recovery receipt differs from canonical source replay');
      state.contextRecoveryReceipts.push(receipt);
      break;
    }
    case 'RESOURCE_RECOVERED': {
      assertRecoveryClaimLifecycle(state, ['CLAIMED_CURRENT'], 'resource recovery');
      const receipt = validateResourceReceipt(payload.receipt);
      assertCurrentCycle(receipt, state, 'resource recovery receipt');
      if (!state.activeFailure || receipt.failureFingerprint !== state.activeFailure.semanticFingerprint ||
          receipt.checkpointAdmissionFingerprint !== state.currentCheckpointAdmission?.semanticFingerprint) {
        throw new Error('resource recovery receipt is detached');
      }
      const expected = createRecoveryResourceReceipt({
        workNodeRef: state.workNodeRef,
        sourceStateFingerprint: state.sourceStateFingerprint,
        failureFingerprint: state.activeFailure.semanticFingerprint,
        checkpointAdmission: state.currentCheckpointAdmission,
        resourceSnapshot: receipt.resourceSnapshot,
        deniedRequest: receipt.deniedRequest,
        reducedRequest: receipt.reducedRequest,
        observedAt: receipt.observedAt
      });
      if (!same(expected, receipt)) throw new Error('resource recovery receipt differs from canonical source replay');
      state.resourceRecoveryReceipts.push(receipt);
      break;
    }
    case 'ROLLBACK_ATTEMPTED': {
      const receipt = validateCycleBoundTransactionReceipt(payload.receipt, state, registry);
      if (!state.activePolicyDecision || receipt.operationRef !== state.activeFailure?.operationRef) {
        throw new Error('rollback receipt is detached from the active recovery action');
      }
      if (state.rollbackLineage.some((item) => item.rollbackReceiptRef === receipt.rollbackReceiptRef)) {
        throw new Error('duplicate rollback receipt rejected');
      }
      state.rollbackLineage.push(receipt);
      break;
    }
    case 'ROLLBACK_VERIFIED': {
      const receipt = validateCycleBoundTransactionReceipt(payload.receipt, state, registry);
      if (state.rollbackLineage.at(-1)?.semanticFingerprint !== receipt.semanticFingerprint ||
          receipt.state !== 'ROLLED_BACK' || receipt.rollbackVerified !== true ||
          receipt.rollbackReadBackFingerprint !== receipt.observedBeforeFingerprint) {
        throw new Error('rollback verification is not exact');
      }
      break;
    }
    case 'LAST_KNOWN_GOOD_RESTORED': {
      const receipt = validateCycleBoundTransactionReceipt(payload.receipt, state, registry);
      if (state.rollbackLineage.at(-1)?.semanticFingerprint !== receipt.semanticFingerprint ||
          receipt.state !== 'LAST_KNOWN_GOOD_RESTORED' || receipt.lastKnownGoodRestored !== true ||
          receipt.lastKnownGoodReadBackFingerprint !== receipt.lastKnownGoodExpectedFingerprint) {
        throw new Error('last-known-good restore is not exact');
      }
      state.lastKnownGoodRefs = canonicalRefs([...state.lastKnownGoodRefs, receipt.lastKnownGoodRef], 'lastKnownGoodRefs');
      break;
    }
    case 'QUARANTINED': {
      const receipt = validateCycleBoundTransactionReceipt(payload.receipt, state, registry);
      if (state.rollbackLineage.at(-1)?.semanticFingerprint !== receipt.semanticFingerprint ||
          receipt.state !== 'QUARANTINED' || !receipt.quarantined || !receipt.quarantineRef) {
        throw new Error('quarantine event requires exact failed rollback/LKG evidence');
      }
      state.quarantinedRefs = canonicalRefs([...state.quarantinedRefs, receipt.quarantineRef], 'quarantinedRefs');
      state.phase = 'QUARANTINED';
      break;
    }
    case 'HUMAN_DECISION_REQUESTED': {
      const gate = assertContentAddressed(payload.gate, {
        schemaVersion: 'vexlife.runtime-recovery-human-decision-gate/v1',
        refField: 'decisionGateRef',
        prefix: 'gate.runtime-recovery.human.',
        label: 'human decision gate'
      });
      assertCurrentCycle(gate, state, 'human decision gate');
      const expected = createHumanDecisionGate({
        aggregate: state,
        policyDecision: state.activePolicyDecision,
        observedAt: event.occurredAt,
        registry
      });
      if (!same(gate, expected) || gate.failureFingerprint !== state.activeFailure?.semanticFingerprint ||
          state.humanDecisionGates.some((item) => item.decisionGateRef === payload.gate.decisionGateRef)) {
        throw new Error('human decision gate is forged, detached, or duplicated');
      }
      state.humanDecisionGates.push(clone(gate));
      state.phase = 'WAITING_HUMAN';
      break;
    }
    case 'RECOVERY_ACTION_APPLIED': {
      assertRecoveryClaimLifecycle(state, ['CLAIMED_CURRENT'], 'recovery action application');
      const receipt = validateActionReceipt(payload.receipt);
      assertCurrentCycle(receipt, state, 'recovery action receipt');
      if (!state.activePolicyDecision || receipt.decisionFingerprint !== state.activePolicyDecision.semanticFingerprint ||
          receipt.failureFingerprint !== state.activeFailure?.semanticFingerprint ||
          receipt.action !== state.activePolicyDecision.action || state.currentRecoveryActionReceipt) {
        throw new Error('recovery action must consume the exact active decision once');
      }
      const expected = buildRecoveryActionReceipt(state, event.occurredAt, registry);
      if (!same(expected, receipt)) {
        throw new Error('recovery action receipt differs from exact action-specific semantic replay');
      }
      state.currentRecoveryActionReceipt = receipt;
      state.phase = receipt.disposition === 'QUARANTINED' ? 'QUARANTINED'
        : receipt.disposition === 'WAITING_HUMAN' ? 'WAITING_HUMAN'
          : receipt.disposition === 'BLOCKED' ? 'BLOCKED' : 'RECOVERING';
      break;
    }
    case 'GENERATION_CONTINUED': {
      assertRecoveryClaimLifecycle(state, ['RESUMED_CONSUMED'], 'recovery generation continuation');
      if (!state.currentRecoveryActionReceipt || !state.currentCheckpointAdmission ||
          ['QUARANTINED', 'WAITING_HUMAN', 'BLOCKED'].includes(state.phase)) {
        throw new Error('generation continuation requires converged recoverable action and checkpoint admission');
      }
      const continuation = validateContinuation(payload.continuation);
      assertCurrentCycle(continuation, state, 'recovery continuation');
      const schedulerResume = validateSchedulerRecoveryResume(continuation.schedulerResumeReceipt);
      assertCurrentCycle(schedulerResume, state, 'scheduler recovery resume');
      const continuationBindings = {
        checkpointAdmission: continuation.checkpointAdmissionFingerprint === state.currentCheckpointAdmission.semanticFingerprint,
        action: continuation.actionReceiptFingerprint === state.currentRecoveryActionReceipt.semanticFingerprint,
        schedulerResume: continuation.schedulerResumeReceiptFingerprint === schedulerResume.semanticFingerprint,
        resumeAction: schedulerResume.actionReceiptFingerprint === state.currentRecoveryActionReceipt.semanticFingerprint,
        resumeAdmission: schedulerResume.checkpointAdmissionFingerprint === state.currentCheckpointAdmission.semanticFingerprint,
        resumeAggregate: schedulerResume.aggregateRef === state.aggregateRef,
        aggregate: continuation.aggregateRef === state.aggregateRef,
        failure: continuation.failureFingerprint === state.activeFailure.semanticFingerprint,
        activation: continuation.onceOnlyActivationRef === state.currentCheckpointAdmission.onceOnlyActivationRef,
        schedulerCurrent: continuation.schedulerCurrentAggregateFingerprint === schedulerResume.schedulerCurrentAggregateFingerprint,
        freshRefs: same(continuation.freshLeaseRefs, schedulerResume.freshLeaseRefs),
        freshFingerprints: same(continuation.freshLeaseFingerprints, schedulerResume.freshLeaseFingerprints),
        context: continuation.contextRecoveryReceiptFingerprint === schedulerResume.contextRecoveryReceiptFingerprint,
        resource: continuation.resourceRecoveryReceiptFingerprint === schedulerResume.resourceRecoveryReceiptFingerprint,
        priorGeneration: continuation.priorSchedulerGeneration === state.schedulerGeneration,
        nextGeneration: continuation.nextSchedulerGeneration > state.schedulerGeneration,
        work: continuation.workNodeRef === state.workNodeRef,
        source: continuation.sourceStateFingerprint === state.sourceStateFingerprint
      };
      const detached = Object.entries(continuationBindings).filter(([, exact]) => !exact).map(([binding]) => binding);
      if (detached.length) throw new Error(`scheduler continuation is stale or detached: ${detached.join(', ')}`);
      state.schedulerGeneration = continuation.nextSchedulerGeneration;
      state.continuationLineage.push(continuation);
      state.phase = 'RECOVERING';
      break;
    }
    case 'EXTERNAL_EVENT_ACCEPTED': {
      const external = clone(payload.event);
      assertExternalEventClaimLifecycle(external, state);
      const supplied = external.semanticFingerprint;
      const managedExternal = [
        'vexlife.runtime-recovery-external-wait-event/v1',
        'vexlife.runtime-recovery-external-resume-event/v1',
        'vexlife.runtime-recovery-split-route-event/v1'
      ].includes(external.schemaVersion);
      const managedEventRef = external.eventRef;
      delete external.semanticFingerprint;
      if (managedExternal) delete external.eventRef;
      external.semanticFingerprint = semanticHash(external);
      if (managedExternal) external.eventRef = managedEventRef;
      if (supplied && supplied !== external.semanticFingerprint) throw new Error('external event fingerprint mismatch');
      if (external.workNodeRef !== state.workNodeRef || external.schedulerGeneration !== state.schedulerGeneration) {
        throw new Error('stale or cross-work external event rejected');
      }
      assertCurrentCycle(external, state, 'external recovery event');
      if (external.schemaVersion === 'vexlife.runtime-recovery-external-wait-event/v1' &&
          (external.eventKind !== 'RECOVERY_WAIT_BEGUN' ||
            external.aggregateRef !== state.aggregateRef ||
            external.failureFingerprint !== state.activeFailure?.semanticFingerprint ||
            external.decisionFingerprint !== state.activePolicyDecision?.semanticFingerprint ||
            state.activePolicyDecision?.action !== 'CHECKPOINT_AND_WAIT')) {
        throw new Error('external wait event is forged or detached');
      }
      if (external.schemaVersion === 'vexlife.runtime-recovery-external-resume-event/v1') {
        const wait = state.acceptedExternalEvents.find((item) => item.eventRef === external.waitEventRef);
        if (external.eventKind !== 'RECOVERY_RESUMED_CURRENT' || external.currentness !== 'CURRENT' ||
            !wait || wait.semanticFingerprint !== external.waitEventFingerprint ||
            external.aggregateRef !== state.aggregateRef ||
            external.failureFingerprint !== state.activeFailure?.semanticFingerprint ||
            external.decisionFingerprint !== state.activePolicyDecision?.semanticFingerprint ||
            parseCanonicalTimestamp(external.observedAt, 'external resume observedAt') <=
              parseCanonicalTimestamp(wait.observedAt, 'external wait observedAt')) {
          throw new Error('external resume event is not current or does not consume the exact wait');
        }
      }
      if (external.schemaVersion === 'vexlife.runtime-recovery-split-route-event/v1') {
        const context = state.contextRecoveryReceipts.at(-1);
        if (external.eventKind !== 'SPLIT_CHILD_RETURN_ROUTE_FORMED' || external.currentness !== 'CURRENT' ||
            external.aggregateRef !== state.aggregateRef ||
            external.failureFingerprint !== state.activeFailure?.semanticFingerprint ||
            external.decisionFingerprint !== state.activePolicyDecision?.semanticFingerprint ||
            context?.semanticFingerprint !== external.contextRecoveryReceiptFingerprint ||
            context?.splitWorkNodeRef !== external.childWorkNodeRef ||
            context?.returnRouteRef !== external.returnRouteRef) {
          throw new Error('split route event is forged or detached');
        }
      }
      const existing = state.acceptedExternalEvents.find((item) => item.eventRef === external.eventRef);
      if (existing) throw new Error(existing.semanticFingerprint === external.semanticFingerprint
        ? 'duplicate external event rejected' : 'same-ref/different-content external event rejected');
      state.acceptedExternalEvents.push(external);
      break;
    }
    case 'RECOVERY_CONVERGED': {
      assertRecoveryClaimLifecycle(state, ['RESUMED_CONSUMED'], 'recovery convergence');
      const receipt = validateConvergenceReceipt(payload.receipt);
      assertCurrentCycle(receipt, state, 'recovery convergence receipt');
      if (!state.lastSuccessfulExecutionReceipt || !state.currentRecoveryActionReceipt ||
          receipt.successExecutionFingerprint !== state.lastSuccessfulExecutionReceipt.semanticFingerprint ||
          receipt.actionReceiptFingerprint !== state.currentRecoveryActionReceipt.semanticFingerprint ||
          currentCycleEntries(state.rollbackLineage, state).some((item) => item.state === 'QUARANTINED') ||
          currentCycleEntries(state.humanDecisionGates, state).length ||
          ['BLOCKED', 'QUARANTINED', 'WAITING_HUMAN'].includes(state.phase)) {
        throw new Error('recovery convergence requires exact success/action ownership and no unresolved hold');
      }
      const expected = createRecoveryConvergenceReceipt(state, { formedAt: event.occurredAt, registry });
      if (!same(expected, receipt)) throw new Error('recovery convergence differs from action-specific replay');
      state.recoveryConvergenceReceipt = receipt;
      state.phase = 'RECOVERING';
      break;
    }
    case 'TERMINAL_CLOSED': {
      if (state.currentSchedulerClaimLifecycle?.claimLifecycle !== 'TERMINAL_CONSUMED' ||
          state.currentSchedulerClaimLifecycle.currentness !== 'TERMINAL') {
        throw new Error('terminal recovery closure requires exact historical terminal scheduler claim lifecycle');
      }
      const receipt = validateTerminalReceipt(payload.receipt);
      assertCurrentCycle(receipt, state, 'terminal recovery receipt');
      const schedulerEvidence = receipt.schedulerEvidence;
      const schedulerCheckpoint = createIntentCheckpoint(schedulerEvidence?.schedulerCheckpoint);
      const completionVerification = assertCanonicalSchedulerReceipt(
        schedulerEvidence?.completionVerification,
        'terminal replay completion verification'
      );
      const completionEvidenceLineage = assertCanonicalSchedulerReceipt(
        schedulerEvidence?.completionEvidenceLineage,
        'terminal replay completion evidence lineage'
      );
      const workgraphTransition = assertCanonicalSchedulerReceipt(
        schedulerEvidence?.workgraphTransition,
        'terminal replay Workgraph transition',
        buildTransitionFingerprint
      );
      const completionReceipt = assertCanonicalSchedulerReceipt(
        schedulerEvidence?.completionReceipt,
        'terminal replay completion receipt',
        buildReceiptFingerprint
      );
      const returnRouteReceipt = assertCanonicalSchedulerReceipt(
        schedulerEvidence?.returnRouteReceipt,
        'terminal replay return route'
      );
      if (currentCycleEntries(state.terminalRecoveryReceipts, state).length || !state.recoveryConvergenceReceipt ||
          receipt.aggregateRef !== state.aggregateRef ||
          receipt.aggregateFingerprint !== buildRecoveryAggregateFingerprint(state) ||
          receipt.failureFingerprint !== state.activeFailure?.semanticFingerprint ||
          receipt.decisionFingerprint !== state.activePolicyDecision?.semanticFingerprint ||
          receipt.actionReceiptFingerprint !== state.currentRecoveryActionReceipt?.semanticFingerprint ||
          receipt.convergenceReceiptFingerprint !== state.recoveryConvergenceReceipt.semanticFingerprint ||
          receipt.successExecutionFingerprint !== state.lastSuccessfulExecutionReceipt?.semanticFingerprint ||
          receipt.completedAt !== event.occurredAt ||
          receipt.schedulerEvidenceFingerprint !== semanticHash(schedulerEvidence) ||
          receipt.schedulerCheckpointFingerprint !== schedulerCheckpoint.semanticFingerprint ||
          receipt.schedulerCompletionVerificationFingerprint !== completionVerification.semanticFingerprint ||
          receipt.schedulerCompletionEvidenceLineageFingerprint !== completionEvidenceLineage.semanticFingerprint ||
          receipt.schedulerWorkgraphTransitionFingerprint !== workgraphTransition.semanticFingerprint ||
          receipt.schedulerCompletionFingerprint !== completionReceipt.semanticFingerprint ||
          receipt.schedulerReturnRouteFingerprint !== returnRouteReceipt.semanticFingerprint ||
          receipt.finalOutcome !== 'SUCCEEDED') {
        throw new Error('terminal closure is duplicate, premature, or detached');
      }
      state.terminalRecoveryReceipts.push(receipt);
      state.recoveredFailure = clone(state.activeFailure);
      state.activeFailure = null;
      state.phase = 'COMPLETED';
      break;
    }
    default:
      throw new Error(`unsupported recovery event ${event.type}`);
  }

  state.eventLedger.push(event);
  return state;
}

function replayEvents(root, events, registry) {
  if (!Array.isArray(events)) throw new Error('recovery eventLedger must be an array');
  let state = clone(root);
  for (const event of events) state = applyEvent(state, event, registry);
  return state;
}

export function buildRecoveryAggregateFingerprint(input) {
  const candidate = clone(input);
  delete candidate.semanticFingerprint;
  candidate.quarantinedRefs = canonicalRefs(candidate.quarantinedRefs ?? [], 'quarantinedRefs');
  candidate.lastKnownGoodRefs = canonicalRefs(candidate.lastKnownGoodRefs ?? [], 'lastKnownGoodRefs');
  return semanticHash(candidate);
}

export function createRecoveryAggregate(input, { registry } = {}) {
  const root = baseAggregate(input, registry);
  const replayed = replayEvents(root, input?.eventLedger ?? [], registry);
  if (!RECOVERY_PHASES.includes(replayed.phase)) throw new Error('recovery aggregate phase is invalid');
  for (const field of RECOVERY_AGGREGATE_REQUIRED_FIELDS.filter((item) => item !== 'semanticFingerprint')) {
    if (Object.hasOwn(input ?? {}, field) && !same(input[field], replayed[field])) {
      throw new Error(`supplied recovery aggregate ${field} differs from replay-derived state`);
    }
  }
  replayed.semanticFingerprint = buildRecoveryAggregateFingerprint(replayed);
  if (input?.semanticFingerprint && input.semanticFingerprint !== replayed.semanticFingerprint) {
    throw new Error('recovery aggregate semanticFingerprint mismatch');
  }
  return freeze(replayed);
}

function aggregateRoot(aggregate) {
  return {
    aggregateRef: aggregate.aggregateRef,
    workNodeRef: aggregate.workNodeRef,
    sourceStateFingerprint: aggregate.sourceStateFingerprint,
    initialSchedulerGeneration: aggregate.initialSchedulerGeneration,
    retryBudget: aggregate.retryBudget,
    eventLedger: aggregate.eventLedger
  };
}

export function reduceRecoveryAggregate(aggregate, event, { registry } = {}) {
  const canonical = createRecoveryAggregate(aggregate, { registry });
  const candidate = aggregateRoot(canonical);
  candidate.eventLedger = [...canonical.eventLedger, canonicalEvent(event)];
  return createRecoveryAggregate(candidate, { registry });
}

function appendEvent(aggregate, type, payload, occurredAt, registry, schedulerGeneration = aggregate.schedulerGeneration) {
  return reduceRecoveryAggregate(
    aggregate,
    formEvent(aggregate, type, payload, occurredAt, schedulerGeneration),
    { registry }
  );
}

function boundaryRejection(reasonCode, error, aggregate, context, registry, {
  rejectionConsumptionState = null
} = {}) {
  const receipt = contentAddressed({
    schemaVersion: 'vexlife.runtime-executor-boundary-rejection/v1',
    state: 'REJECTED',
    executorOutcome: 'FAILED_BLOCKED',
    reasonCode,
    reasonFingerprint: semanticHash({ name: error?.name ?? 'Error', message: error?.message ?? String(error) }),
    aggregateRef: aggregate?.aggregateRef ?? null,
    aggregateFingerprint: aggregate?.semanticFingerprint ?? null,
    attemptRef: context?.attemptRef ?? null,
    operationRef: context?.operationRef ?? null,
    sourcePolicyFingerprint: registry?.retryPolicy ? semanticHash(registry.retryPolicy) : null,
    rejectionConsumptionState,
    mutationApplied: false
  }, 'boundaryRejectionRef', 'receipt.runtime-executor.rejection.');
  return freeze({
    admitted: false,
    status: 'FAILED_BLOCKED',
    aggregate,
    failure: null,
    policyDecision: null,
    recoveryReceipt: null,
    boundaryRejection: receipt
  });
}

function validateBoundaryInput(aggregate, executor, context) {
  if (typeof executor !== 'function') throw new Error('executor boundary requires a callable executor');
  if (executor.constructor?.name === 'AsyncFunction') throw new Error('async executor is unsupported by the deterministic boundary');
  for (const field of ['attemptRef', 'operationRef', 'originRef', 'expectedTransitionRef', 'startedAt', 'observedAt', 'completedAt', 'deadlineAt']) {
    if (!context?.[field]) throw new Error(`executor boundary requires ${field}`);
  }
  if (aggregate.attemptLedger.some((item) => item.attemptRef === context.attemptRef)) {
    throw new Error('attemptRef replay is prohibited');
  }
  if (context.schedulerGeneration !== aggregate.schedulerGeneration) {
    throw new Error('executor attempt scheduler generation does not match recovery aggregate');
  }
  const started = parseCanonicalTimestamp(context.startedAt, 'attempt startedAt');
  const observed = parseCanonicalTimestamp(context.observedAt, 'attempt observedAt');
  const completed = parseCanonicalTimestamp(context.completedAt, 'attempt completedAt');
  const deadline = parseCanonicalTimestamp(context.deadlineAt, 'attempt deadlineAt');
  if (observed < started || completed < observed || completed > deadline ||
      deadline !== started + aggregate.retryBudget.maximumWallTimeMs) {
    throw new Error('executor chronology/deadline does not bind the exact registry wall-time budget');
  }
}

function attemptFrom(context, aggregate) {
  return {
    attemptRef: context.attemptRef,
    operationRef: context.operationRef,
    originRef: context.originRef,
    expectedTransitionRef: context.expectedTransitionRef,
    schedulerGeneration: context.schedulerGeneration,
    startedAt: context.startedAt,
    deadlineAt: context.deadlineAt,
    maximumWallTimeClass: aggregate.retryBudget.maximumWallTimeClass,
    maximumWallTimeMs: aggregate.retryBudget.maximumWallTimeMs,
    wallTimeBudgetFingerprint: aggregate.retryBudgetFingerprint,
    recoveryCycleRef: aggregate.activeFailure ? aggregate.activeRecoveryCycle?.recoveryCycleRef ?? null : null,
    recoveryCycleFingerprint: aggregate.activeFailure ? aggregate.activeRecoveryCycle?.semanticFingerprint ?? null : null
  };
}

export function executeWithRecoveryBoundary({
  aggregate,
  executor,
  context,
  registry
}) {
  let canonicalAggregate;
  try {
    canonicalAggregate = createRecoveryAggregate(aggregate, { registry });
    validateBoundaryInput(canonicalAggregate, executor, context);
  } catch (error) {
    return boundaryRejection('BOUNDARY_PRE_ADMISSION_REJECTED', error, aggregate, context, registry);
  }
  let startedAggregate;
  try {
    startedAggregate = appendEvent(canonicalAggregate, 'ATTEMPT_STARTED', {
      attempt: attemptFrom(context, canonicalAggregate)
    }, context.startedAt, registry);
  } catch (error) {
    return boundaryRejection('ATTEMPT_START_REJECTED', error, canonicalAggregate, context, registry);
  }

  let internalClassificationEvidence = null;
  try {
    const value = executor(Object.freeze({ ...clone(context), aggregateFingerprint: startedAggregate.semanticFingerprint }));
    if (value && typeof value.then === 'function') {
      try {
        Promise.resolve(value).catch(() => {});
      } catch {
        // The typed rejection below remains the sole boundary outcome even for hostile thenables.
      }
      return boundaryRejection(
        'THENABLE_EXECUTOR_UNSUPPORTED',
        new Error('thenable executor is unsupported'),
        canonicalAggregate,
        context,
        registry,
        { rejectionConsumptionState: 'REJECTION_HANDLER_ATTACHED' }
      );
    }
    if (value?.partialEffectState && value.partialEffectState !== 'NONE') {
      const error = new Error('executor reported success with a partial effect');
      internalClassificationEvidence = classifyInternalRuntimeFailure('PARTIAL_SUCCESS', error, { registry });
      throw error;
    }
    const executionReceipt = contentAddressed({
      schemaVersion: 'vexlife.runtime-executor-boundary-receipt/v1',
      executorOutcome: 'SUCCEEDED',
      aggregateRef: canonicalAggregate.aggregateRef,
      workNodeRef: canonicalAggregate.workNodeRef,
      sourceStateFingerprint: canonicalAggregate.sourceStateFingerprint,
      schedulerGeneration: canonicalAggregate.schedulerGeneration,
      attemptRef: context.attemptRef,
      operationRef: context.operationRef,
      resultFingerprint: semanticHash(value ?? null),
      resultEvidence: clone(value ?? null),
      startedAt: context.startedAt,
      completedAt: context.completedAt,
      deadlineAt: context.deadlineAt,
      elapsedMs: parseCanonicalTimestamp(context.completedAt, 'attempt completedAt') -
        parseCanonicalTimestamp(context.startedAt, 'attempt startedAt'),
      recoveryCycleRef: canonicalAggregate.activeFailure ? canonicalAggregate.activeRecoveryCycle?.recoveryCycleRef ?? null : null,
      recoveryCycleFingerprint: canonicalAggregate.activeFailure ? canonicalAggregate.activeRecoveryCycle?.semanticFingerprint ?? null : null,
      actionReceiptFingerprint: canonicalAggregate.activeFailure
        ? canonicalAggregate.currentRecoveryActionReceipt?.semanticFingerprint ?? null : null,
      schedulerContinuationFingerprint: canonicalAggregate.activeFailure
        ? currentCycleEntries(canonicalAggregate.continuationLineage, canonicalAggregate).at(-1)?.semanticFingerprint ?? null : null
    }, 'executionReceiptRef', 'receipt.runtime-executor.');
    const next = appendEvent(startedAggregate, 'ATTEMPT_SUCCEEDED', {
      attemptRef: context.attemptRef,
      completedAt: context.completedAt,
      executionReceipt
    }, context.completedAt, registry);
    return freeze({ admitted: true, status: 'SUCCEEDED', aggregate: next, executionReceipt, value });
  } catch (error) {
    try {
      const failure = normalizeThrownFailure(error, {
        originRef: context.originRef,
        workNodeRef: canonicalAggregate.workNodeRef,
        schedulerGeneration: canonicalAggregate.schedulerGeneration,
        operationRef: context.operationRef,
        attemptRef: context.attemptRef,
        sourceStateFingerprint: canonicalAggregate.sourceStateFingerprint,
        expectedTransitionRef: context.expectedTransitionRef,
        observedAt: context.observedAt,
        currentness: 'CURRENT',
        evidenceRefs: [...(context.evidenceRefs ?? []), ...(error?.evidenceRefs ?? [])]
      }, { registry, executor, classificationEvidence: internalClassificationEvidence });
      const recoveryCycle = formRecoveryCycle(startedAggregate, failure, context.observedAt);
      let next = appendEvent(startedAggregate, 'ATTEMPT_FAILED', { failure, recoveryCycle }, context.observedAt, registry);
      next = appendEvent(next, 'FAILURE_ACTIVATED', { failure, recoveryCycle }, context.observedAt, registry);
      return freeze({
        admitted: true,
        status: 'FAILED_RECOVERABLE',
        aggregate: next,
        failure,
        policyDecision: null,
        recoveryReceipt: null
      });
    } catch (boundaryError) {
      return boundaryRejection('FAILURE_NORMALIZATION_REJECTED', boundaryError, canonicalAggregate, context, registry);
    }
  }
}

export function createSchedulerRecoveryClaimReceipt({
  aggregate,
  schedulerAggregate,
  schedulerCheckpoint,
  formedAt,
  registry
}) {
  const owner = createRecoveryAggregate(aggregate, { registry });
  const checkpoint = createIntentCheckpoint(schedulerCheckpoint);
  parseCanonicalTimestamp(formedAt, 'scheduler recovery claim formedAt');
  if (!owner.activeFailure || !owner.activeRecoveryCycle || owner.phase !== 'FAILURE_ACTIVE') {
    throw new Error('scheduler recovery claim requires one exact active failure cycle');
  }
  const schedulerState = clone(schedulerAggregate);
  const suppliedSchedulerFingerprint = schedulerState?.semanticFingerprint;
  if (!schedulerState || !suppliedSchedulerFingerprint) throw new Error('scheduler recovery claim requires exact scheduler aggregate');
  delete schedulerState.semanticFingerprint;
  if (semanticHash(schedulerState) !== suppliedSchedulerFingerprint || schedulerAggregate.phase !== 'PAUSED' ||
      schedulerAggregate.active !== null ||
      !schedulerAggregate.checkpoints?.some((item) => item.checkpointRef === checkpoint.checkpointRef &&
        item.semanticFingerprint === checkpoint.semanticFingerprint && item.currentState === 'PAUSED_AT_CHECKPOINT') ||
      checkpoint.workNodeRef !== owner.workNodeRef ||
      checkpoint.priorSchedulerGeneration !== owner.schedulerGeneration ||
      checkpoint.sourceBindings?.some((item) => item.sourceHash !== owner.sourceStateFingerprint) ||
      checkpoint.leaseReleaseReceipts?.length !== LEASE_KINDS.length ||
      new Set(checkpoint.leaseReleaseReceipts.map((item) => item.semanticFingerprint)).size !== LEASE_KINDS.length) {
    throw new Error('scheduler recovery claim is detached from canonical paused scheduler truth');
  }
  const leaseReleaseReceiptRefs = checkpoint.leaseReleaseReceipts.map((item) => item.receiptRef).sort();
  const leaseReleaseFingerprints = checkpoint.leaseReleaseReceipts.map((item) => item.semanticFingerprint).sort();
  const activationFingerprint = semanticHash({
    formationRef: 'formation.runtime-recovery.scheduler-claim-activation.v1',
    recoveryAggregateFingerprint: owner.semanticFingerprint,
    recoveryCycleFingerprint: owner.activeRecoveryCycle.semanticFingerprint,
    activeFailureFingerprint: owner.activeFailure.semanticFingerprint,
    schedulerAggregateFingerprint: suppliedSchedulerFingerprint,
    schedulerCheckpointFingerprint: checkpoint.semanticFingerprint,
    leaseReleaseReceiptRefs,
    leaseReleaseFingerprints
  });
  return contentAddressed({
    schemaVersion: 'vexlife.runtime-recovery-scheduler-claim/v1',
    formationRef: 'formation.runtime-recovery.scheduler-claim.v1',
    aggregateRef: owner.aggregateRef,
    recoveryAggregateFingerprint: owner.semanticFingerprint,
    recoveryAggregate: owner,
    recoveryCycleRef: owner.activeRecoveryCycle.recoveryCycleRef,
    recoveryCycleFingerprint: owner.activeRecoveryCycle.semanticFingerprint,
    activeFailureRef: owner.activeFailure.failureRef,
    activeFailureFingerprint: owner.activeFailure.semanticFingerprint,
    workNodeRef: owner.workNodeRef,
    sourceStateFingerprint: owner.sourceStateFingerprint,
    schedulerGeneration: owner.schedulerGeneration,
    schedulerAggregateFingerprint: suppliedSchedulerFingerprint,
    schedulerCheckpointRef: checkpoint.checkpointRef,
    schedulerCheckpointFingerprint: checkpoint.semanticFingerprint,
    leaseReleaseReceiptRefs,
    leaseReleaseFingerprints,
    onceOnlyActivationRef: `activation.intent-scheduler.recovery.${activationFingerprint.slice(0, 32)}`,
    claimLifecycle: 'CLAIMED_CURRENT',
    currentness: 'CURRENT',
    formedAt
  }, 'claimReceiptRef', 'claim.runtime-recovery.scheduler.');
}

export function validateSchedulerRecoveryClaimReceipt(value, { registry } = {}) {
  const claim = assertContentAddressed(value, {
    schemaVersion: 'vexlife.runtime-recovery-scheduler-claim/v1',
    refField: 'claimReceiptRef',
    prefix: 'claim.runtime-recovery.scheduler.',
    label: 'scheduler recovery claim'
  });
  const owner = createRecoveryAggregate(claim.recoveryAggregate, { registry });
  const activationFingerprint = semanticHash({
    formationRef: 'formation.runtime-recovery.scheduler-claim-activation.v1',
    recoveryAggregateFingerprint: claim.recoveryAggregateFingerprint,
    recoveryCycleFingerprint: claim.recoveryCycleFingerprint,
    activeFailureFingerprint: claim.activeFailureFingerprint,
    schedulerAggregateFingerprint: claim.schedulerAggregateFingerprint,
    schedulerCheckpointFingerprint: claim.schedulerCheckpointFingerprint,
    leaseReleaseReceiptRefs: claim.leaseReleaseReceiptRefs,
    leaseReleaseFingerprints: claim.leaseReleaseFingerprints
  });
  if (claim.currentness !== 'CURRENT' || claim.formationRef !== 'formation.runtime-recovery.scheduler-claim.v1' ||
      claim.claimLifecycle !== 'CLAIMED_CURRENT' ||
      claim.onceOnlyActivationRef !== `activation.intent-scheduler.recovery.${activationFingerprint.slice(0, 32)}` ||
      owner.semanticFingerprint !== claim.recoveryAggregateFingerprint ||
      owner.aggregateRef !== claim.aggregateRef || owner.phase !== 'FAILURE_ACTIVE' ||
      owner.activeFailure?.failureRef !== claim.activeFailureRef ||
      owner.activeFailure?.semanticFingerprint !== claim.activeFailureFingerprint ||
      owner.activeRecoveryCycle?.recoveryCycleRef !== claim.recoveryCycleRef ||
      owner.activeRecoveryCycle?.semanticFingerprint !== claim.recoveryCycleFingerprint ||
      owner.workNodeRef !== claim.workNodeRef || owner.sourceStateFingerprint !== claim.sourceStateFingerprint ||
      owner.schedulerGeneration !== claim.schedulerGeneration) {
    throw new Error('scheduler recovery claim does not consume exact replay-derived recovery truth');
  }
  return claim;
}

export function createRecoveryCheckpoint({
  schedulerCheckpoint,
  schedulerConsumptionReceipt,
  aggregateRef,
  failureRef,
  failureFingerprint,
  sourceStateFingerprint,
  selectedSourceRanges,
  preservedIntentRef,
  preservedInterpretationRef,
  preservedUnknownRefs = [],
  preservedAuthorityRef,
  returnRouteRef,
  currentness = 'CURRENT',
  formedAt
}) {
  const exactSchedulerCheckpoint = createIntentCheckpoint(schedulerCheckpoint);
  const consumption = validateSchedulerCheckpointConsumption(schedulerConsumptionReceipt);
  assertFingerprint(sourceStateFingerprint, 'recovery checkpoint sourceStateFingerprint');
  assertFingerprint(failureFingerprint, 'recovery checkpoint failureFingerprint');
  if (!aggregateRef || consumption.aggregateRef !== aggregateRef || consumption.failureRef !== failureRef ||
      consumption.failureFingerprint !== failureFingerprint ||
      consumption.sourceStateFingerprint !== sourceStateFingerprint ||
      consumption.checkpointRef !== exactSchedulerCheckpoint.checkpointRef ||
      consumption.checkpointFingerprint !== exactSchedulerCheckpoint.semanticFingerprint ||
      semanticHash(consumption.leaseReleaseFingerprints) !== semanticHash(
        exactSchedulerCheckpoint.leaseReleaseReceipts.map((item) => item.semanticFingerprint).sort()
      )) {
    throw new Error('recovery checkpoint does not consume the exact scheduler-owned activation');
  }
  if (currentness !== 'CURRENT') throw new Error('recovery checkpoint must be CURRENT');
  parseCanonicalTimestamp(formedAt, 'recovery checkpoint formedAt');
  const ranges = [...selectedSourceRanges].map((range) => {
    if (!range?.sourceRef || !Number.isInteger(range.start) || !Number.isInteger(range.end) ||
        range.start < 0 || range.end < range.start) {
      throw new Error('recovery checkpoint source ranges must preserve exact non-negative bounds');
    }
    return clone(range);
  }).sort((left, right) => left.sourceRef.localeCompare(right.sourceRef) || left.start - right.start || left.end - right.end);
  return contentAddressed({
    schemaVersion: 'vexlife.runtime-recovery-checkpoint/v1',
    aggregateRef,
    recoveryAggregateFingerprint: consumption.recoveryAggregateFingerprint,
    recoveryCycleRef: consumption.recoveryCycleRef,
    recoveryCycleFingerprint: consumption.recoveryCycleFingerprint,
    failureRef,
    failureFingerprint,
    workNodeRef: exactSchedulerCheckpoint.workNodeRef,
    sourceStateFingerprint,
    schedulerGeneration: exactSchedulerCheckpoint.priorSchedulerGeneration,
    schedulerCheckpointRef: exactSchedulerCheckpoint.checkpointRef,
    schedulerCheckpointFingerprint: exactSchedulerCheckpoint.semanticFingerprint,
    schedulerCheckpoint: exactSchedulerCheckpoint,
    schedulerConsumptionRef: consumption.consumptionRef,
    schedulerConsumptionFingerprint: consumption.semanticFingerprint,
    onceOnlyActivationRef: consumption.onceOnlyActivationRef,
    selectedSourceRanges: ranges,
    preservedIntentRef,
    preservedInterpretationRef,
    preservedUnknownRefs: canonicalRefs(preservedUnknownRefs, 'preservedUnknownRefs'),
    preservedAuthorityRef,
    returnRouteRef,
    leaseReleaseReceipts: exactSchedulerCheckpoint.leaseReleaseReceipts,
    leaseReleaseFingerprints: Object.fromEntries(LEASE_KINDS.map((kind) => [
      kind,
      exactSchedulerCheckpoint.leaseReleaseReceipts.find((item) =>
        item.leaseRef === ({
          worker: exactSchedulerCheckpoint.priorWorkerLeaseRef,
          context: exactSchedulerCheckpoint.priorContextLeaseRef,
          resource: exactSchedulerCheckpoint.priorResourceLeaseRef,
          capability: exactSchedulerCheckpoint.priorCapabilityLeaseRef,
          effect: exactSchedulerCheckpoint.priorEffectLeaseRef,
          occupancy: exactSchedulerCheckpoint.priorOccupancyRef
        })[kind]
      ).semanticFingerprint
    ])),
    currentness,
    formedAt
  }, 'recoveryCheckpointRef', 'checkpoint.runtime-recovery.');
}

export function admitRecoveryCheckpoint(checkpoint, aggregate, {
  schedulerCheckpoint,
  schedulerConsumptionReceipt,
  nextSchedulerGeneration,
  currentSourceStateFingerprint,
  observedAt,
  registry
}) {
  const reasons = [];
  let canonicalAggregate = null;
  let canonical = null;
  try {
    canonicalAggregate = createRecoveryAggregate(aggregate, { registry });
    canonical = validateCheckpoint(checkpoint);
    const exactScheduler = createIntentCheckpoint(schedulerCheckpoint);
    const consumption = validateSchedulerCheckpointConsumption(schedulerConsumptionReceipt);
    if (!same(exactScheduler, canonical.schedulerCheckpoint)) reasons.push('SCHEDULER_CHECKPOINT_SUBSTITUTED');
    if (consumption.semanticFingerprint !== canonical.schedulerConsumptionFingerprint ||
        consumption.aggregateRef !== canonicalAggregate.aggregateRef ||
        consumption.failureFingerprint !== canonicalAggregate.activeFailure?.semanticFingerprint ||
        consumption.recoveryAggregateFingerprint !== canonical.recoveryAggregateFingerprint ||
        consumption.recoveryCycleRef !== canonicalAggregate.activeRecoveryCycle?.recoveryCycleRef ||
        consumption.recoveryCycleFingerprint !== canonicalAggregate.activeRecoveryCycle?.semanticFingerprint) {
      reasons.push('SCHEDULER_CHECKPOINT_CONSUMPTION_SUBSTITUTED');
    }
  } catch (error) {
    reasons.push(`CHECKPOINT_CORRUPTED:${error.message}`);
  }
  try {
    parseCanonicalTimestamp(observedAt, 'checkpoint admission observedAt');
  } catch (error) {
    reasons.push(`CHECKPOINT_OBSERVED_AT_INVALID:${error.message}`);
  }
  if (canonical && canonicalAggregate) {
    if (!canonicalAggregate.activeFailure) reasons.push('ACTIVE_FAILURE_REQUIRED');
    if (canonical.workNodeRef !== canonicalAggregate.workNodeRef) reasons.push('CHECKPOINT_CROSS_WORK');
    if (canonical.sourceStateFingerprint !== currentSourceStateFingerprint ||
        canonical.sourceStateFingerprint !== canonicalAggregate.sourceStateFingerprint) reasons.push('CHECKPOINT_SOURCE_STALE');
    if (canonical.schedulerGeneration !== canonicalAggregate.schedulerGeneration) reasons.push('CHECKPOINT_GENERATION_STALE');
    if (!Number.isInteger(nextSchedulerGeneration) || nextSchedulerGeneration <= canonicalAggregate.schedulerGeneration) {
      reasons.push('FRESH_SCHEDULER_GENERATION_REQUIRED');
    }
  }
  return contentAddressed({
    schemaVersion: 'vexlife.runtime-recovery-checkpoint-admission/v1',
    admitted: reasons.length === 0,
    state: reasons.length ? 'BLOCKED' : 'ADMITTED',
    currentness: reasons.length ? 'UNKNOWN' : 'CURRENT',
    workNodeRef: canonicalAggregate?.workNodeRef ?? aggregate?.workNodeRef ?? null,
    sourceStateFingerprint: canonicalAggregate?.sourceStateFingerprint ?? aggregate?.sourceStateFingerprint ?? null,
    failureRef: canonicalAggregate?.activeFailure?.failureRef ?? null,
    failureFingerprint: canonicalAggregate?.activeFailure?.semanticFingerprint ?? null,
    aggregateRef: canonicalAggregate?.aggregateRef ?? aggregate?.aggregateRef ?? null,
    recoveryAggregateFingerprint: canonicalAggregate?.semanticFingerprint ?? null,
    recoveryCycleRef: canonicalAggregate?.activeRecoveryCycle?.recoveryCycleRef ?? null,
    recoveryCycleFingerprint: canonicalAggregate?.activeRecoveryCycle?.semanticFingerprint ?? null,
    recoveryCheckpointRef: canonical?.recoveryCheckpointRef ?? checkpoint?.recoveryCheckpointRef ?? null,
    checkpointFingerprint: canonical?.semanticFingerprint ?? null,
    schedulerCheckpointRef: canonical?.schedulerCheckpointRef ?? null,
    schedulerCheckpointFingerprint: canonical?.schedulerCheckpointFingerprint ?? null,
    schedulerConsumptionRef: canonical?.schedulerConsumptionRef ?? null,
    schedulerConsumptionFingerprint: canonical?.schedulerConsumptionFingerprint ?? null,
    onceOnlyActivationRef: canonical?.onceOnlyActivationRef ?? null,
    leaseReleaseReceiptRefs: canonical?.leaseReleaseReceipts?.map((item) => item.receiptRef).sort() ?? [],
    leaseReleaseFingerprints: canonical ? Object.values(canonical.leaseReleaseFingerprints).sort() : [],
    priorSchedulerGeneration: canonicalAggregate?.schedulerGeneration ?? aggregate?.schedulerGeneration ?? null,
    nextSchedulerGeneration,
    observedAt,
    reasons
  }, 'admissionRef', 'admission.runtime-recovery.checkpoint.');
}

export function recordRecoveryCheckpointAdmission(aggregate, checkpoint, admission, {
  schedulerConsumptionReceipt,
  registry
} = {}) {
  const canonical = createRecoveryAggregate(aggregate, { registry });
  const exactAdmission = validateCheckpointAdmission(admission);
  if (!exactAdmission.admitted) throw new Error(`checkpoint admission blocked: ${exactAdmission.reasons.join(', ')}`);
  return appendEvent(canonical, 'CHECKPOINT_ADMITTED', {
    checkpoint: validateCheckpoint(checkpoint),
    admission: exactAdmission,
    schedulerConsumptionReceipt: validateSchedulerCheckpointConsumption(schedulerConsumptionReceipt)
  }, exactAdmission.observedAt, registry);
}

export function recordSchedulerRecoveryClaimLifecycle(aggregate, {
  schedulerAggregate,
  schedulerClaimCurrentnessReceipt,
  registry
} = {}) {
  const owner = createRecoveryAggregate(aggregate, { registry });
  const receipt = validateSchedulerRecoveryClaimCurrentnessReceipt(
    schedulerClaimCurrentnessReceipt,
    { schedulerAggregate, registry }
  );
  if (!owner.currentCheckpointAdmission ||
      receipt.recoveryAggregateRef !== owner.aggregateRef ||
      receipt.recoveryCycleRef !== owner.activeRecoveryCycle?.recoveryCycleRef ||
      receipt.recoveryCycleFingerprint !== owner.activeRecoveryCycle?.semanticFingerprint ||
      receipt.failureRef !== owner.activeFailure?.failureRef ||
      receipt.failureFingerprint !== owner.activeFailure?.semanticFingerprint ||
      receipt.checkpointRef !== owner.currentCheckpointAdmission.schedulerCheckpointRef ||
      receipt.checkpointFingerprint !== owner.currentCheckpointAdmission.schedulerCheckpointFingerprint) {
    throw new Error('scheduler claim lifecycle receipt is detached from exact recovery aggregate truth');
  }
  return appendEvent(owner, 'SCHEDULER_CLAIM_LIFECYCLE_RECORDED', {
    receipt
  }, receipt.observedAt, registry);
}

function nonterminalRecoveryReceipt(state, failure, decision, checkpointAdmission, observedAt) {
  return contentAddressed({
    schemaVersion: 'vexlife.runtime-recovery-receipt/v1',
    failureRef: failure.failureRef,
    failureFingerprint: failure.semanticFingerprint,
    ...cycleBindings(state),
    decisionRef: decision.decisionRef,
    decisionFingerprint: decision.semanticFingerprint,
    action: decision.action,
    executorOutcome: decision.executorOutcome,
    retryBudgetFingerprint: decision.retryBudgetFingerprint,
    checkpointAdmissionRef: checkpointAdmission?.admissionRef ?? null,
    checkpointAdmissionFingerprint: checkpointAdmission?.semanticFingerprint ?? null,
    observedAt
  }, 'recoveryReceiptRef', 'receipt.runtime-recovery.');
}

export function recordRecoveryPolicyDecision(aggregate, {
  checkpointAdmission = null,
  resourceAdmissionReceipt = null,
  contextAdmissionReceipt = null,
  authorityBoundary = 'UNCHANGED',
  observedAt,
  registry
}) {
  let canonical = createRecoveryAggregate(aggregate, { registry });
  if (contextAdmissionReceipt) {
    canonical = appendEvent(canonical, 'CONTEXT_RECOVERED', {
      receipt: validateContextReceipt(contextAdmissionReceipt)
    }, contextAdmissionReceipt.observedAt, registry);
  }
  if (resourceAdmissionReceipt) {
    canonical = appendEvent(canonical, 'RESOURCE_RECOVERED', {
      receipt: validateResourceReceipt(resourceAdmissionReceipt)
    }, resourceAdmissionReceipt.observedAt, registry);
  }
  const decision = resolveRecoveryPolicy({
    failure: canonical.activeFailure,
    aggregate: canonical,
    checkpointAdmission,
    resourceAdmissionReceipt,
    contextAdmissionReceipt,
    authorityBoundary,
    observedAt,
    registry
  });
  const receipt = nonterminalRecoveryReceipt(canonical, canonical.activeFailure, decision, checkpointAdmission, observedAt);
  const next = appendEvent(canonical, 'POLICY_DECIDED', {
    decision,
    recoveryReceipt: receipt,
    checkpointAdmission,
    resourceAdmissionReceipt,
    contextAdmissionReceipt,
    authorityBoundary
  }, observedAt, registry);
  if (!EXECUTOR_OUTCOMES.includes(decision.executorOutcome)) throw new Error('policy produced invalid executor outcome');
  return freeze({ aggregate: next, policyDecision: decision, recoveryReceipt: receipt });
}

export function recoverContextBudget({
  workNodeRef,
  sourceStateFingerprint,
  failureFingerprint,
  checkpointAdmission,
  sourceSegments,
  intentRef,
  interpretationRef,
  unknownRefs = [],
  authorityRef,
  returnRouteRef,
  inputTokenEstimate,
  reservedOutputTokens,
  hardTokenLimit,
  splitWorkNodeRef = null,
  clarificationRef = null,
  currentness = 'CURRENT',
  formedAt,
  observedAt
}) {
  const admission = validateCheckpointAdmission(checkpointAdmission);
  assertFingerprint(sourceStateFingerprint, 'context recovery sourceStateFingerprint');
  assertFingerprint(failureFingerprint, 'context recovery failureFingerprint');
  if (!admission.admitted || admission.workNodeRef !== workNodeRef ||
      admission.sourceStateFingerprint !== sourceStateFingerprint || admission.failureFingerprint !== failureFingerprint) {
    throw new Error('context recovery requires the exact current checkpoint admission');
  }
  if (currentness !== 'CURRENT') throw new Error('context recovery receipt must be CURRENT');
  const formed = parseCanonicalTimestamp(formedAt, 'context recovery formedAt');
  const observed = parseCanonicalTimestamp(observedAt, 'context recovery observedAt');
  if (observed < formed) throw new Error('context recovery observation precedes formation');
  for (const [field, value] of Object.entries({ inputTokenEstimate, reservedOutputTokens, hardTokenLimit })) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer`);
  }
  const ranges = sourceSegments.map((segment) => {
    if (!segment?.sourceRef || !Number.isInteger(segment.start) || !Number.isInteger(segment.end) ||
        segment.start < 0 || segment.end < segment.start || !Number.isInteger(segment.tokenEstimate) || segment.tokenEstimate < 0) {
      throw new Error('context segment must preserve an exact source range and token estimate');
    }
    if (segment.eligibleForCondensation && (!segment.candidateSummaryRef || !Number.isInteger(segment.candidateTokenEstimate))) {
      throw new Error('eligible context segment requires a deterministic candidate summary ref and estimate');
    }
    return clone(segment);
  });
  const overflow = inputTokenEstimate + reservedOutputTokens > hardTokenLimit;
  let candidateInput = ranges.reduce((total, segment) => total +
    (overflow && segment.eligibleForCondensation ? segment.candidateTokenEstimate : segment.tokenEstimate), 0);
  let state = 'ADMITTED';
  let action = 'NO_RECOVERY_REQUIRED';
  if (overflow && candidateInput + reservedOutputTokens <= hardTokenLimit) {
    state = 'CONTEXT_REACQUIRED';
    action = 'CONDENSE_CONTEXT_AND_REACQUIRE';
  } else if (overflow && splitWorkNodeRef) {
    state = 'SPLIT_REQUIRED';
    action = 'SPLIT_WORK_NODE';
    candidateInput = Math.max(0, hardTokenLimit - reservedOutputTokens);
  } else if (overflow && clarificationRef) {
    state = 'NEEDS_HUMAN';
    action = 'REQUEST_HUMAN_DECISION';
  } else if (overflow) {
    state = 'BLOCKED';
    action = 'TERMINAL_BLOCK';
  }
  return contentAddressed({
    schemaVersion: 'vexlife.runtime-context-recovery-receipt/v1',
    workNodeRef,
    sourceStateFingerprint,
    failureFingerprint,
    recoveryCycleRef: admission.recoveryCycleRef,
    recoveryCycleFingerprint: admission.recoveryCycleFingerprint,
    schedulerGeneration: admission.nextSchedulerGeneration,
    checkpointAdmissionRef: admission.admissionRef,
    checkpointAdmissionFingerprint: admission.semanticFingerprint,
    state,
    action,
    currentness,
    modelInvoked: false,
    invisibleTruncation: false,
    sourceHistoryDeleted: false,
    sourceSegments: ranges,
    immutableSourceCoverage: ranges.map(({ sourceRef, start, end }) => ({ sourceRef, start, end })),
    deterministicSummaryBindings: ranges.filter((item) => item.eligibleForCondensation).map((item) => ({
      sourceRef: item.sourceRef,
      start: item.start,
      end: item.end,
      summaryRef: item.candidateSummaryRef,
      sourceTokenEstimate: item.tokenEstimate,
      summaryTokenEstimate: item.candidateTokenEstimate
    })),
    preservedIntentRef: intentRef,
    preservedInterpretationRef: interpretationRef,
    preservedUnknownRefs: canonicalRefs(unknownRefs, 'unknownRefs'),
    preservedAuthorityRef: authorityRef,
    returnRouteRef,
    originalInputTokenEstimate: inputTokenEstimate,
    candidateInputTokenEstimate: candidateInput,
    reservedOutputTokens,
    hardTokenLimit,
    splitWorkNodeRef,
    clarificationRef,
    formedAt,
    observedAt
  }, 'contextRecoveryReceiptRef', 'receipt.runtime-recovery.context.');
}

export function createRecoveryResourceReceipt({
  workNodeRef,
  sourceStateFingerprint,
  failureFingerprint,
  checkpointAdmission,
  resourceSnapshot,
  deniedRequest,
  reducedRequest,
  observedAt
}) {
  const admission = validateCheckpointAdmission(checkpointAdmission);
  const snapshot = createResourceSnapshot(resourceSnapshot);
  const denied = evaluateCurrentResourceAdmission(snapshot, deniedRequest, { observedAt });
  const reduced = evaluateCurrentResourceAdmission(snapshot, reducedRequest, { observedAt });
  if (admission.workNodeRef !== workNodeRef || admission.sourceStateFingerprint !== sourceStateFingerprint ||
      admission.failureFingerprint !== failureFingerprint || snapshot.generation !== admission.nextSchedulerGeneration ||
      denied.admitted || !reduced.admitted) {
    throw new Error('resource recovery requires exact denial, reduced admission, checkpoint, and fresh generation');
  }
  return contentAddressed({
    schemaVersion: 'vexlife.runtime-resource-recovery-receipt/v1',
    workNodeRef,
    sourceStateFingerprint,
    failureFingerprint,
    recoveryCycleRef: admission.recoveryCycleRef,
    recoveryCycleFingerprint: admission.recoveryCycleFingerprint,
    schedulerGeneration: admission.nextSchedulerGeneration,
    checkpointAdmissionRef: admission.admissionRef,
    checkpointAdmissionFingerprint: admission.semanticFingerprint,
    resourceSnapshotRef: snapshot.snapshotRef,
    resourceSnapshotFingerprint: snapshot.semanticFingerprint,
    resourceSnapshot: snapshot,
    deniedRequest: denied.request,
    deniedAdmissionFingerprint: denied.semanticFingerprint,
    deniedReasons: denied.reasons,
    reducedAdmissionFingerprint: reduced.semanticFingerprint,
    reducedBudgetAdmitted: reduced.admitted,
    reducedRequest: reduced.request,
    currentness: 'CURRENT',
    observedAt
  }, 'resourceRecoveryReceiptRef', 'receipt.runtime-recovery.resource.');
}

function recoveryActionMatrix(registry, action) {
  const matrix = registry?.recoveryActionEvidenceMatrix?.find((item) => item.action === action);
  if (!matrix || !Array.isArray(matrix.required) || !Array.isArray(matrix.optional) ||
      !Array.isArray(matrix.forbidden) || !matrix.disposition) {
    throw new Error(`recovery action ${action} has no exact evidence matrix`);
  }
  return matrix;
}

export function createHumanDecisionGate({ aggregate, policyDecision, observedAt, registry }) {
  const owner = createRecoveryAggregate(aggregate, { registry });
  assertRecoveryClaimLifecycle(owner, ['CLAIMED_CURRENT'], 'human recovery decision formation');
  const decision = validateRecoveryPolicyDecision(policyDecision);
  if (decision.action !== 'REQUEST_HUMAN_DECISION' ||
      owner.activePolicyDecision?.semanticFingerprint !== decision.semanticFingerprint) {
    throw new Error('human decision gate requires the exact active human policy');
  }
  parseCanonicalTimestamp(observedAt, 'human decision gate observedAt');
  return contentAddressed({
    schemaVersion: 'vexlife.runtime-recovery-human-decision-gate/v1',
    aggregateRef: owner.aggregateRef,
    workNodeRef: owner.workNodeRef,
    failureRef: owner.activeFailure.failureRef,
    failureFingerprint: owner.activeFailure.semanticFingerprint,
    ...cycleBindings(owner),
    decisionRef: decision.decisionRef,
    decisionFingerprint: decision.semanticFingerprint,
    smallestQuestionRef: `question.runtime-recovery.${owner.activeFailure.failureClass}`,
    recoveryReceiptRef: owner.currentRecoveryReceipt.recoveryReceiptRef,
    recoveryReceiptFingerprint: owner.currentRecoveryReceipt.semanticFingerprint,
    state: 'DECISION_REQUIRED',
    currentness: 'CURRENT',
    observedAt
  }, 'decisionGateRef', 'gate.runtime-recovery.human.');
}

export function createRecoveryWaitResumeReceipt({
  aggregate,
  policyDecision,
  waitedAt,
  resumedAt,
  resumeSourceRef,
  registry
}) {
  const owner = createRecoveryAggregate(aggregate, { registry });
  assertRecoveryClaimLifecycle(owner, ['CLAIMED_CURRENT'], 'wait/resume recovery formation');
  const decision = validateRecoveryPolicyDecision(policyDecision);
  if (decision.action !== 'CHECKPOINT_AND_WAIT' ||
      owner.activePolicyDecision?.semanticFingerprint !== decision.semanticFingerprint) {
    throw new Error('wait/resume receipt requires the exact active wait policy');
  }
  const waited = parseCanonicalTimestamp(waitedAt, 'recovery waitedAt');
  const resumed = parseCanonicalTimestamp(resumedAt, 'recovery resumedAt');
  if (resumed <= waited || !resumeSourceRef) throw new Error('recovery resume must follow the wait from an exact source');
  const waitEvent = contentAddressed({
    schemaVersion: 'vexlife.runtime-recovery-external-wait-event/v1',
    eventKind: 'RECOVERY_WAIT_BEGUN',
    aggregateRef: owner.aggregateRef,
    workNodeRef: owner.workNodeRef,
    schedulerGeneration: owner.schedulerGeneration,
    failureFingerprint: owner.activeFailure.semanticFingerprint,
    ...cycleBindings(owner),
    decisionFingerprint: decision.semanticFingerprint,
    ...externalEventClaimLifecycleBindings(owner.currentSchedulerClaimLifecycle),
    observedAt: waitedAt
  }, 'eventRef', 'external-event.runtime-recovery.wait.');
  const resumeEvent = contentAddressed({
    schemaVersion: 'vexlife.runtime-recovery-external-resume-event/v1',
    eventKind: 'RECOVERY_RESUMED_CURRENT',
    aggregateRef: owner.aggregateRef,
    workNodeRef: owner.workNodeRef,
    schedulerGeneration: owner.schedulerGeneration,
    failureFingerprint: owner.activeFailure.semanticFingerprint,
    ...cycleBindings(owner),
    decisionFingerprint: decision.semanticFingerprint,
    ...externalEventClaimLifecycleBindings(owner.currentSchedulerClaimLifecycle),
    waitEventRef: waitEvent.eventRef,
    waitEventFingerprint: waitEvent.semanticFingerprint,
    resumeSourceRef,
    currentness: 'CURRENT',
    observedAt: resumedAt
  }, 'eventRef', 'external-event.runtime-recovery.resume.');
  return contentAddressed({
    schemaVersion: 'vexlife.runtime-recovery-wait-resume-receipt/v1',
    aggregateRef: owner.aggregateRef,
    failureFingerprint: owner.activeFailure.semanticFingerprint,
    ...cycleBindings(owner),
    decisionFingerprint: decision.semanticFingerprint,
    ...externalEventClaimLifecycleBindings(owner.currentSchedulerClaimLifecycle),
    waitEvent,
    resumeEvent,
    state: 'RESUMED_CURRENT'
  }, 'waitResumeReceiptRef', 'receipt.runtime-recovery.wait-resume.');
}

export function createSplitWorkRouteReceipt({
  aggregate,
  policyDecision,
  contextRecoveryReceipt,
  childWorkNodeRef,
  observedAt,
  registry
}) {
  const owner = createRecoveryAggregate(aggregate, { registry });
  assertRecoveryClaimLifecycle(owner, ['CLAIMED_CURRENT'], 'split-work recovery route formation');
  const decision = validateRecoveryPolicyDecision(policyDecision);
  const context = validateContextReceipt(contextRecoveryReceipt);
  if (decision.action !== 'SPLIT_WORK_NODE' || context.action !== 'SPLIT_WORK_NODE' ||
      context.splitWorkNodeRef !== childWorkNodeRef ||
      owner.activePolicyDecision?.semanticFingerprint !== decision.semanticFingerprint) {
    throw new Error('split route requires the exact active split policy/context/child');
  }
  parseCanonicalTimestamp(observedAt, 'split work route observedAt');
  return contentAddressed({
    schemaVersion: 'vexlife.runtime-recovery-split-route-event/v1',
    eventKind: 'SPLIT_CHILD_RETURN_ROUTE_FORMED',
    aggregateRef: owner.aggregateRef,
    workNodeRef: owner.workNodeRef,
    schedulerGeneration: owner.schedulerGeneration,
    failureFingerprint: owner.activeFailure.semanticFingerprint,
    ...cycleBindings(owner),
    decisionFingerprint: decision.semanticFingerprint,
    ...externalEventClaimLifecycleBindings(owner.currentSchedulerClaimLifecycle),
    contextRecoveryReceiptRef: context.contextRecoveryReceiptRef,
    contextRecoveryReceiptFingerprint: context.semanticFingerprint,
    childWorkNodeRef,
    returnRouteRef: context.returnRouteRef,
    state: 'RETURN_ROUTE_CURRENT',
    currentness: 'CURRENT',
    observedAt
  }, 'eventRef', 'external-event.runtime-recovery.split-route.');
}

function actionEvidenceFromState(state) {
  const evidence = [];
  const context = currentCycleEntries(state.contextRecoveryReceipts, state).at(-1);
  const resource = currentCycleEntries(state.resourceRecoveryReceipts, state).at(-1);
  const transaction = currentCycleEntries(state.rollbackLineage, state).at(-1);
  const humanGate = currentCycleEntries(state.humanDecisionGates, state).at(-1);
  const currentEvents = currentCycleEntries(state.acceptedExternalEvents, state);
  const wait = currentEvents.findLast((item) => item.eventKind === 'RECOVERY_WAIT_BEGUN');
  const resume = currentEvents.findLast((item) => item.eventKind === 'RECOVERY_RESUMED_CURRENT');
  const split = currentEvents.findLast((item) => item.eventKind === 'SPLIT_CHILD_RETURN_ROUTE_FORMED');
  if (context) evidence.push({ role: 'context', ref: context.contextRecoveryReceiptRef, fingerprint: context.semanticFingerprint });
  if (resource) evidence.push({ role: 'resource', ref: resource.resourceRecoveryReceiptRef, fingerprint: resource.semanticFingerprint });
  if (transaction) {
    evidence.push({ role: 'transaction', ref: transaction.rollbackReceiptRef, fingerprint: transaction.semanticFingerprint });
    if (transaction.state === 'LAST_KNOWN_GOOD_RESTORED') {
      evidence.push({ role: 'lastKnownGood', ref: transaction.lastKnownGoodRef, fingerprint: transaction.lastKnownGoodReadBackFingerprint });
    }
    if (transaction.state === 'QUARANTINED') {
      evidence.push({ role: 'quarantine', ref: transaction.quarantineRef, fingerprint: transaction.semanticFingerprint });
    }
  }
  if (humanGate) evidence.push({ role: 'humanGate', ref: humanGate.decisionGateRef, fingerprint: humanGate.semanticFingerprint });
  if (wait) evidence.push({ role: 'externalWait', ref: wait.eventRef, fingerprint: wait.semanticFingerprint });
  if (resume) evidence.push({ role: 'externalResume', ref: resume.eventRef, fingerprint: resume.semanticFingerprint });
  if (split) evidence.push({ role: 'splitRoute', ref: split.eventRef, fingerprint: split.semanticFingerprint });
  return evidence.sort((left, right) => left.role.localeCompare(right.role));
}

function buildRecoveryActionReceipt(state, observedAt, registry) {
  const decision = state.activePolicyDecision;
  const admission = state.currentCheckpointAdmission;
  const matrix = recoveryActionMatrix(registry, decision.action);
  const evidence = actionEvidenceFromState(state);
  const roles = evidence.map((item) => item.role);
  const missing = matrix.required.filter((role) => !roles.includes(role));
  const unrelated = roles.filter((role) => !matrix.required.includes(role) && !matrix.optional.includes(role));
  if (missing.length || unrelated.length || new Set(roles).size !== roles.length) {
    throw new Error(`recovery action evidence matrix mismatch: missing=${missing.join(',')} unrelated=${unrelated.join(',')}`);
  }
  const transaction = currentCycleEntries(state.rollbackLineage, state).at(-1);
  if (decision.action === 'ROLLBACK_TO_BEFORE_IMAGE' && !['ROLLED_BACK', 'LAST_KNOWN_GOOD_RESTORED'].includes(transaction?.state)) {
    throw new Error('rollback action requires exact rollback or last-known-good read-back');
  }
  if (decision.action === 'RESTORE_LAST_KNOWN_GOOD' && transaction?.state !== 'LAST_KNOWN_GOOD_RESTORED') {
    throw new Error('last-known-good action requires exact restored read-back');
  }
  if (decision.action === 'QUARANTINE_ADAPTER_OR_ARTIFACT' && transaction?.state !== 'QUARANTINED') {
    throw new Error('quarantine action requires exact failed rollback/LKG evidence');
  }
  const checkpoint = currentCycleEntries(state.checkpointLineage, state).at(-1);
  return contentAddressed({
    schemaVersion: 'vexlife.runtime-recovery-action-receipt/v1',
    aggregateRef: state.aggregateRef,
    workNodeRef: state.workNodeRef,
    sourceStateFingerprint: state.sourceStateFingerprint,
    schedulerGeneration: state.schedulerGeneration,
    failureRef: state.activeFailure.failureRef,
    failureFingerprint: state.activeFailure.semanticFingerprint,
    ...cycleBindings(state),
    decisionRef: decision.decisionRef,
    decisionFingerprint: decision.semanticFingerprint,
    action: decision.action,
    checkpointAdmissionRef: admission.admissionRef,
    checkpointAdmissionFingerprint: admission.semanticFingerprint,
    actionEvidenceMatrixFingerprint: semanticHash(matrix),
    evidence,
    preservationFingerprint: semanticHash({
      schedulerCheckpointFingerprint: checkpoint.schedulerCheckpointFingerprint,
      leaseReleaseFingerprints: checkpoint.leaseReleaseFingerprints,
      checkpointAdmissionFingerprint: admission.semanticFingerprint,
      evidence
    }),
    disposition: matrix.disposition,
    continuationRequired: matrix.continuationRequired,
    completionEligible: matrix.completionEligible,
    observedAt
  }, 'actionReceiptRef', 'receipt.runtime-recovery.action.');
}

export function applyRecoveryAction({
  aggregate,
  policyDecision,
  checkpointAdmission,
  contextRecoveryReceipt = null,
  resourceRecoveryReceipt = null,
  transactionalRecoveryReceipt = null,
  humanDecisionGate = null,
  waitResumeReceipt = null,
  splitWorkRouteReceipt = null,
  observedAt,
  registry
}) {
  let current = createRecoveryAggregate(aggregate, { registry });
  assertRecoveryClaimLifecycle(current, ['CLAIMED_CURRENT'], 'recovery action formation');
  const decision = validateRecoveryPolicyDecision(policyDecision);
  const admission = validateCheckpointAdmission(checkpointAdmission);
  if (current.activePolicyDecision?.semanticFingerprint !== decision.semanticFingerprint ||
      current.currentCheckpointAdmission?.semanticFingerprint !== admission.semanticFingerprint ||
      current.currentRecoveryActionReceipt) {
    throw new Error('recovery action must consume the exact current policy/checkpoint once');
  }
  if (contextRecoveryReceipt) {
    const receipt = validateContextReceipt(contextRecoveryReceipt);
    assertCurrentCycle(receipt, current, 'context recovery action evidence');
    if (currentCycleEntries(current.contextRecoveryReceipts, current).at(-1)?.semanticFingerprint !== receipt.semanticFingerprint) {
      throw new Error('context recovery action evidence was not admitted before policy selection');
    }
  }
  if (resourceRecoveryReceipt) {
    const receipt = validateResourceReceipt(resourceRecoveryReceipt);
    assertCurrentCycle(receipt, current, 'resource recovery action evidence');
    if (currentCycleEntries(current.resourceRecoveryReceipts, current).at(-1)?.semanticFingerprint !== receipt.semanticFingerprint) {
      throw new Error('resource recovery action evidence was not admitted before policy selection');
    }
  }
  let transaction = null;
  if (transactionalRecoveryReceipt) {
    transaction = validateCycleBoundTransactionReceipt(transactionalRecoveryReceipt, current, registry);
    current = appendEvent(current, 'ROLLBACK_ATTEMPTED', { receipt: transaction }, observedAt, registry);
    if (transaction.state === 'ROLLED_BACK') {
      current = appendEvent(current, 'ROLLBACK_VERIFIED', { receipt: transaction }, observedAt, registry);
    } else if (transaction.state === 'LAST_KNOWN_GOOD_RESTORED') {
      current = appendEvent(current, 'LAST_KNOWN_GOOD_RESTORED', { receipt: transaction }, observedAt, registry);
    } else if (transaction.state === 'QUARANTINED') {
      current = appendEvent(current, 'QUARANTINED', { receipt: transaction }, observedAt, registry);
    } else {
      throw new Error('transactional recovery action did not reach an admitted disposition');
    }
  }
  if (decision.action === 'REQUEST_HUMAN_DECISION') {
    const gate = assertContentAddressed(humanDecisionGate, {
      schemaVersion: 'vexlife.runtime-recovery-human-decision-gate/v1',
      refField: 'decisionGateRef',
      prefix: 'gate.runtime-recovery.human.',
      label: 'human decision gate'
    });
    const expected = createHumanDecisionGate({ aggregate: current, policyDecision: decision, observedAt, registry });
    if (!same(gate, expected)) throw new Error('caller-shaped human decision gate rejected');
    current = appendEvent(current, 'HUMAN_DECISION_REQUESTED', { gate }, observedAt, registry);
  }
  if (waitResumeReceipt) {
    const wait = assertContentAddressed(waitResumeReceipt, {
      schemaVersion: 'vexlife.runtime-recovery-wait-resume-receipt/v1',
      refField: 'waitResumeReceiptRef',
      prefix: 'receipt.runtime-recovery.wait-resume.',
      label: 'wait/resume receipt'
    });
    current = appendEvent(current, 'EXTERNAL_EVENT_ACCEPTED', { event: wait.waitEvent }, wait.waitEvent.observedAt, registry);
    current = appendEvent(current, 'EXTERNAL_EVENT_ACCEPTED', { event: wait.resumeEvent }, wait.resumeEvent.observedAt, registry);
  }
  if (splitWorkRouteReceipt) {
    const split = assertContentAddressed(splitWorkRouteReceipt, {
      schemaVersion: 'vexlife.runtime-recovery-split-route-event/v1',
      refField: 'eventRef',
      prefix: 'external-event.runtime-recovery.split-route.',
      label: 'split work route'
    });
    current = appendEvent(current, 'EXTERNAL_EVENT_ACCEPTED', { event: split }, split.observedAt, registry);
  }
  const receipt = buildRecoveryActionReceipt(current, observedAt, registry);
  current = appendEvent(current, 'RECOVERY_ACTION_APPLIED', { receipt }, observedAt, registry);
  return freeze({ aggregate: current, actionReceipt: receipt });
}

export function createRecoveryContinuation({
  aggregate,
  checkpointAdmission,
  resumed,
  schedulerAggregate,
  schedulerInstanceRef,
  observedAt,
  registry
}) {
  const owner = createRecoveryAggregate(aggregate, { registry });
  assertRecoveryClaimLifecycle(owner, ['RESUMED_CONSUMED'], 'recovery continuation formation');
  const admission = validateCheckpointAdmission(checkpointAdmission);
  const schedulerResume = validateSchedulerRecoveryResume(resumed?.recoveryResumeReceipt);
  const schedulerState = clone(schedulerAggregate);
  const suppliedSchedulerFingerprint = schedulerState?.semanticFingerprint;
  delete schedulerState?.semanticFingerprint;
  const schedulerFingerprint = schedulerState ? semanticHash(schedulerState) : null;
  const currentPointer = schedulerAggregate?.checkpoints?.find((item) => item.checkpointRef === admission.schedulerCheckpointRef);
  if (resumed?.state !== 'RESUMED' || resumed.checkpointRef !== admission.schedulerCheckpointRef ||
      resumed.queue?.generation !== admission.nextSchedulerGeneration ||
      resumed.active?.workNodeRef !== owner.workNodeRef ||
      resumed.active?.schedulerGeneration !== admission.nextSchedulerGeneration ||
      resumed.workerLease?.schedulerInstanceRef !== schedulerInstanceRef ||
      schedulerFingerprint !== suppliedSchedulerFingerprint ||
      schedulerResume.schedulerCurrentAggregateFingerprint !== suppliedSchedulerFingerprint ||
      currentPointer?.currentState !== 'RESUMED' ||
      currentPointer?.resumedByWorkerLeaseRef !== resumed.workerLease.leaseRef ||
      schedulerResume.checkpointCurrentPointerFingerprint !== currentPointer?.checkpointPointerFingerprint ||
      schedulerResume.aggregateRef !== owner.aggregateRef ||
      schedulerResume.failureFingerprint !== owner.activeFailure?.semanticFingerprint ||
      schedulerResume.recoveryCycleRef !== owner.activeRecoveryCycle?.recoveryCycleRef ||
      schedulerResume.recoveryCycleFingerprint !== owner.activeRecoveryCycle?.semanticFingerprint ||
      schedulerResume.actionReceiptFingerprint !== owner.currentRecoveryActionReceipt?.semanticFingerprint ||
      schedulerResume.checkpointAdmissionFingerprint !== admission.semanticFingerprint) {
    throw new Error('recovery continuation was not issued by the exact scheduler resume');
  }
  const checkpoint = currentCycleEntries(owner.checkpointLineage, owner).at(-1);
  const freshLeases = {
    worker: resumed.workerLease,
    context: resumed.contextLease,
    resource: resumed.resourceLease,
    capability: resumed.capabilityLease,
    effect: resumed.effectLease,
    occupancy: resumed.occupancy
  };
  const priorRefs = {
    worker: checkpoint.schedulerCheckpoint.priorWorkerLeaseRef,
    context: checkpoint.schedulerCheckpoint.priorContextLeaseRef,
    resource: checkpoint.schedulerCheckpoint.priorResourceLeaseRef,
    capability: checkpoint.schedulerCheckpoint.priorCapabilityLeaseRef,
    effect: checkpoint.schedulerCheckpoint.priorEffectLeaseRef,
    occupancy: checkpoint.schedulerCheckpoint.priorOccupancyRef
  };
  for (const kind of LEASE_KINDS) {
    const lease = freshLeases[kind];
    assertCurrentLease(lease, {
      label: `fresh ${kind}`,
      observedAt,
      schedulerGeneration: admission.nextSchedulerGeneration,
      runtimeSnapshotFingerprint: resumed.active.runtimeSnapshotFingerprint
    });
    const ref = kind === 'occupancy' ? lease.occupancyRef : lease.leaseRef;
    const leaseFingerprint = kind === 'context'
      ? buildContextLeaseFingerprint(lease)
      : semanticHash(Object.fromEntries(Object.entries(lease).filter(([key]) => key !== 'semanticFingerprint')));
    if (leaseFingerprint !== lease.semanticFingerprint) throw new Error(`fresh ${kind} lease fingerprint mismatch`);
    if (ref === priorRefs[kind] || lease.semanticFingerprint === checkpoint.schedulerCheckpoint.priorLeaseFingerprints[kind] ||
        lease.semanticFingerprint === checkpoint.schedulerCheckpoint.transitionedLeaseFingerprints[kind] ||
        schedulerResume.freshLeaseRefs[kind] !== ref ||
        schedulerResume.freshLeaseFingerprints[kind] !== lease.semanticFingerprint) {
      throw new Error(`fresh ${kind} lease reused prior generation identity`);
    }
  }
  const matrix = recoveryActionMatrix(registry, owner.currentRecoveryActionReceipt.action);
  const context = currentCycleEntries(owner.contextRecoveryReceipts, owner).at(-1) ?? null;
  const resource = currentCycleEntries(owner.resourceRecoveryReceipts, owner).at(-1) ?? null;
  const contextRequired = matrix.required.includes('context');
  const resourceRequired = matrix.required.includes('resource');
  if (Boolean(context) !== contextRequired || Boolean(resource) !== resourceRequired ||
      schedulerResume.contextRecoveryReceiptFingerprint !== (context?.semanticFingerprint ?? null) ||
      schedulerResume.resourceRecoveryReceiptFingerprint !== (resource?.semanticFingerprint ?? null) ||
      (contextRequired && schedulerResume.contextLeaseRecoveryBindingFingerprint !== schedulerResume.contextBindingFingerprint) ||
      (resourceRequired && schedulerResume.resourceLeaseRecoveryBindingFingerprint !== semanticHash({
        resourceRecoveryReceiptRef: resource.resourceRecoveryReceiptRef,
        resourceRecoveryReceiptFingerprint: resource.semanticFingerprint,
        reducedAdmissionFingerprint: resource.reducedAdmissionFingerprint,
        reducedRequestFingerprint: semanticHash(resource.reducedRequest)
      }))) {
    throw new Error('scheduler continuation did not consume exact action-specific context/resource recovery output');
  }
  return contentAddressed({
    schemaVersion: 'vexlife.runtime-recovery-continuation/v1',
    aggregateRef: owner.aggregateRef,
    workNodeRef: owner.workNodeRef,
    sourceStateFingerprint: owner.sourceStateFingerprint,
    failureRef: owner.activeFailure.failureRef,
    failureFingerprint: owner.activeFailure.semanticFingerprint,
    ...cycleBindings(owner),
    checkpointAdmissionRef: admission.admissionRef,
    checkpointAdmissionFingerprint: admission.semanticFingerprint,
    actionReceiptRef: owner.currentRecoveryActionReceipt.actionReceiptRef,
    actionReceiptFingerprint: owner.currentRecoveryActionReceipt.semanticFingerprint,
    action: owner.currentRecoveryActionReceipt.action,
    schedulerCheckpointRef: admission.schedulerCheckpointRef,
    schedulerCheckpointFingerprint: admission.schedulerCheckpointFingerprint,
    schedulerInstanceRef,
    schedulerResumeReceiptRef: schedulerResume.resumeReceiptRef,
    schedulerResumeReceiptFingerprint: schedulerResume.semanticFingerprint,
    schedulerResumeReceipt: schedulerResume,
    schedulerCurrentAggregateFingerprint: suppliedSchedulerFingerprint,
    onceOnlyActivationRef: admission.onceOnlyActivationRef,
    contextRecoveryReceiptRef: context?.contextRecoveryReceiptRef ?? null,
    contextRecoveryReceiptFingerprint: context?.semanticFingerprint ?? null,
    resourceRecoveryReceiptRef: resource?.resourceRecoveryReceiptRef ?? null,
    resourceRecoveryReceiptFingerprint: resource?.semanticFingerprint ?? null,
    priorSchedulerGeneration: owner.schedulerGeneration,
    nextSchedulerGeneration: admission.nextSchedulerGeneration,
    queueAdmissionRef: resumed.queue.admissionReceipt.admissionReceiptRef,
    queueAdmissionFingerprint: resumed.queue.admissionReceipt.semanticFingerprint,
    runtimeSnapshotFingerprint: resumed.active.runtimeSnapshotFingerprint,
    freshLeaseRefs: Object.fromEntries(LEASE_KINDS.map((kind) => [kind,
      kind === 'occupancy' ? freshLeases[kind].occupancyRef : freshLeases[kind].leaseRef])),
    freshLeaseFingerprints: Object.fromEntries(LEASE_KINDS.map((kind) => [kind, freshLeases[kind].semanticFingerprint])),
    currentness: 'CURRENT',
    observedAt
  }, 'continuationRef', 'continuation.runtime-recovery.');
}

export function continueRecoveryGeneration(aggregate, continuation, { registry } = {}) {
  const canonical = createRecoveryAggregate(aggregate, { registry });
  const exact = validateContinuation(continuation);
  return appendEvent(canonical, 'GENERATION_CONTINUED', { continuation: exact }, exact.observedAt, registry);
}

function evidenceBinding(completionGateRef, sourceObservationRef, sourceObservationHash) {
  assertFingerprint(sourceObservationHash, `${completionGateRef} evidence`);
  return { completionGateRef, sourceObservationRef, sourceObservationHash };
}

function actionSpecificCausalEvidence(aggregate, registry) {
  const checkpoint = currentCycleEntries(aggregate.checkpointLineage, aggregate).at(-1);
  const continuation = currentCycleEntries(aggregate.continuationLineage, aggregate).at(-1);
  const matrix = recoveryActionMatrix(registry, aggregate.currentRecoveryActionReceipt?.action);
  if (!aggregate.activeFailure || !aggregate.activePolicyDecision || !checkpoint || !aggregate.currentCheckpointAdmission ||
      !aggregate.currentRecoveryActionReceipt || !matrix.completionEligible ||
      (matrix.continuationRequired && !continuation) || !aggregate.lastSuccessfulExecutionReceipt) {
    throw new Error('recovery convergence is missing one or more required causal inputs');
  }
  const bindings = [
    evidenceBinding('completion-gate.runtime-recovery.failure', aggregate.activeFailure.failureRef, aggregate.activeFailure.semanticFingerprint),
    evidenceBinding('completion-gate.runtime-recovery.policy', aggregate.activePolicyDecision.decisionRef, aggregate.activePolicyDecision.semanticFingerprint),
    evidenceBinding('completion-gate.runtime-recovery.scheduler-checkpoint', checkpoint.schedulerCheckpointRef, checkpoint.schedulerCheckpointFingerprint),
    ...LEASE_KINDS.map((kind) => evidenceBinding(
      `completion-gate.runtime-recovery.released-${kind}-lease`,
      checkpoint.leaseReleaseReceipts.find((item) => item.semanticFingerprint === checkpoint.leaseReleaseFingerprints[kind]).receiptRef,
      checkpoint.leaseReleaseFingerprints[kind]
    )),
    evidenceBinding('completion-gate.runtime-recovery.checkpoint-admission', aggregate.currentCheckpointAdmission.admissionRef, aggregate.currentCheckpointAdmission.semanticFingerprint),
    evidenceBinding('completion-gate.runtime-recovery.action', aggregate.currentRecoveryActionReceipt.actionReceiptRef, aggregate.currentRecoveryActionReceipt.semanticFingerprint),
    ...aggregate.currentRecoveryActionReceipt.evidence.map((item) => evidenceBinding(
      `completion-gate.runtime-recovery.${({
        context: 'context',
        resource: 'resource',
        transaction: 'rollback',
        lastKnownGood: 'last-known-good',
        quarantine: 'quarantine',
        humanGate: 'human-gate',
        externalWait: 'external-wait',
        externalResume: 'external-resume',
        splitRoute: 'split-route'
      })[item.role]}`,
      item.ref,
      item.fingerprint
    )),
    ...(continuation ? [
      evidenceBinding('completion-gate.runtime-recovery.scheduler-resume', continuation.schedulerResumeReceiptRef, continuation.schedulerResumeReceiptFingerprint),
      evidenceBinding('completion-gate.runtime-recovery.continuation', continuation.continuationRef, continuation.semanticFingerprint),
      ...LEASE_KINDS.map((kind) => evidenceBinding(
        `completion-gate.runtime-recovery.fresh-${kind}-lease`,
        continuation.freshLeaseRefs[kind],
        continuation.freshLeaseFingerprints[kind]
      ))
    ] : []),
    evidenceBinding('completion-gate.runtime-recovery.success', aggregate.lastSuccessfulExecutionReceipt.executionReceiptRef, aggregate.lastSuccessfulExecutionReceipt.semanticFingerprint)
  ].sort((left, right) => left.completionGateRef.localeCompare(right.completionGateRef));
  return bindings;
}

export function createRecoveryConvergenceReceipt(aggregate, { formedAt, registry } = {}) {
  const owner = createRecoveryAggregate(aggregate, { registry });
  assertRecoveryClaimLifecycle(owner, ['RESUMED_CONSUMED'], 'recovery convergence formation');
  parseCanonicalTimestamp(formedAt, 'recovery convergence formedAt');
  const matrix = recoveryActionMatrix(registry, owner.currentRecoveryActionReceipt?.action);
  const causalEvidence = actionSpecificCausalEvidence(owner, registry);
  return contentAddressed({
    schemaVersion: 'vexlife.runtime-recovery-convergence-receipt/v1',
    aggregateRef: owner.aggregateRef,
    aggregateFingerprint: owner.semanticFingerprint,
    workNodeRef: owner.workNodeRef,
    sourceStateFingerprint: owner.sourceStateFingerprint,
    schedulerGeneration: owner.schedulerGeneration,
    failureRef: owner.activeFailure.failureRef,
    failureFingerprint: owner.activeFailure.semanticFingerprint,
    ...cycleBindings(owner),
    decisionRef: owner.activePolicyDecision.decisionRef,
    decisionFingerprint: owner.activePolicyDecision.semanticFingerprint,
    actionReceiptRef: owner.currentRecoveryActionReceipt.actionReceiptRef,
    actionReceiptFingerprint: owner.currentRecoveryActionReceipt.semanticFingerprint,
    actionEvidenceMatrixFingerprint: semanticHash(matrix),
    successExecutionRef: owner.lastSuccessfulExecutionReceipt.executionReceiptRef,
    successExecutionFingerprint: owner.lastSuccessfulExecutionReceipt.semanticFingerprint,
    causalEvidence,
    unresolvedQuarantineRefs: currentCycleEntries(owner.rollbackLineage, owner)
      .filter((item) => item.state === 'QUARANTINED').map((item) => item.quarantineRef),
    unresolvedHumanGateRefs: currentCycleEntries(owner.humanDecisionGates, owner).map((item) => item.decisionGateRef),
    state: 'RECOVERY_ACTIONS_CONVERGED',
    formedAt
  }, 'convergenceReceiptRef', 'receipt.runtime-recovery.convergence.');
}

export function recordRecoveryConvergence(aggregate, receipt, { registry } = {}) {
  const owner = createRecoveryAggregate(aggregate, { registry });
  const exact = validateConvergenceReceipt(receipt);
  return appendEvent(owner, 'RECOVERY_CONVERGED', { receipt: exact }, exact.formedAt, registry);
}

function expectedCompletionBindings(aggregate) {
  const convergence = aggregate.recoveryConvergenceReceipt;
  return [evidenceBinding(
    'completion-gate.intent.contract-valid',
    convergence.convergenceReceiptRef,
    convergence.semanticFingerprint
  )];
}

export function closeRecoveredExecution({ aggregate, successExecution, schedulerEvidence, completedAt, registry }) {
  const owner = createRecoveryAggregate(aggregate, { registry });
  if (successExecution?.status !== 'SUCCEEDED' ||
      successExecution.executionReceipt?.semanticFingerprint !== owner.lastSuccessfulExecutionReceipt?.semanticFingerprint) {
    throw new Error('recovery closure requires the aggregate-owned successful executor receipt');
  }
  if (!owner.recoveryConvergenceReceipt || !owner.currentRecoveryActionReceipt ||
      currentCycleEntries(owner.rollbackLineage, owner).some((item) => item.state === 'QUARANTINED') ||
      currentCycleEntries(owner.humanDecisionGates, owner).length) {
    throw new Error('recovery closure requires aggregate-owned action convergence with no unresolved hold');
  }
  const completedEpoch = parseCanonicalTimestamp(completedAt, 'recovery completedAt');
  const schedulerCheckpoint = createIntentCheckpoint(schedulerEvidence?.schedulerCheckpoint);
  const completionVerification = assertCanonicalSchedulerReceipt(schedulerEvidence?.completionVerification, 'completion verification');
  const completionEvidenceLineage = assertCanonicalSchedulerReceipt(schedulerEvidence?.completionEvidenceLineage, 'completion evidence lineage');
  const workgraphTransition = assertCanonicalSchedulerReceipt(
    schedulerEvidence?.workgraphTransition,
    'Workgraph transition',
    buildTransitionFingerprint
  );
  const completionReceipt = assertCanonicalSchedulerReceipt(
    schedulerEvidence?.completionReceipt,
    'scheduler completion receipt',
    buildReceiptFingerprint
  );
  const returnRouteReceipt = assertCanonicalSchedulerReceipt(schedulerEvidence?.returnRouteReceipt, 'return route receipt');
  const checkpoint = currentCycleEntries(owner.checkpointLineage, owner).at(-1);
  const verificationObservedEpoch = parseCanonicalTimestamp(completionVerification.observedAt, 'completion verification observedAt');
  const verificationExpiresEpoch = parseCanonicalTimestamp(completionVerification.expiresAt, 'completion verification expiresAt');
  const gateReceipts = completionVerification.gateResultReceipts ?? [];
  for (const gate of gateReceipts) assertCanonicalSchedulerReceipt(gate, 'completion gate result');
  const expectedLineage = {
    schemaVersion: 'vexlife.intent-completion-evidence-lineage/v1',
    verificationReceiptRef: completionVerification.verificationReceiptRef,
    verificationFingerprint: completionVerification.semanticFingerprint,
    gateEvidence: gateReceipts.map((gate) => ({
      completionGateRef: gate.completionGateRef,
      gateResultRef: gate.gateResultRef,
      gateResultFingerprint: gate.semanticFingerprint,
      sourceObservationRef: gate.sourceObservationRef,
      sourceObservationHash: gate.sourceObservationHash
    })).sort((left, right) => left.completionGateRef.localeCompare(right.completionGateRef))
  };
  expectedLineage.semanticFingerprint = semanticHash(expectedLineage);
  if (schedulerCheckpoint.semanticFingerprint !== checkpoint?.schedulerCheckpointFingerprint ||
      completionVerification.schemaVersion !== 'vexlife.intent-completion-verification/v1' ||
      completionVerification.currentness !== 'CURRENT' || completionVerification.selfCertified !== false ||
      completionVerification.workNodeRef !== owner.workNodeRef ||
      completionVerification.schedulerGeneration !== owner.schedulerGeneration ||
      completionVerification.observedAfterState !== 'COMPLETED' ||
      JSON.stringify(completionVerification.completionGateRefs) !== JSON.stringify(RECOVERY_COMPLETION_GATE_REFS) ||
      gateReceipts.length !== RECOVERY_COMPLETION_GATE_REFS.length ||
      verificationObservedEpoch > completedEpoch || completedEpoch >= verificationExpiresEpoch ||
      gateReceipts.some((gate) => gate.currentness !== 'CURRENT' || gate.selfCertified !== false || gate.result !== 'PASSED' ||
        gate.workNodeRef !== owner.workNodeRef || gate.schedulerGeneration !== owner.schedulerGeneration ||
        gate.observedAfterState !== 'COMPLETED') ||
      !same(completionEvidenceLineage, expectedLineage) ||
      completionEvidenceLineage.verificationFingerprint !== completionVerification.semanticFingerprint ||
      workgraphTransition.workNodeRef !== owner.workNodeRef || workgraphTransition.nextState !== 'COMPLETED' ||
      workgraphTransition.reason !== 'EXTERNAL_COMPLETION_VERIFIED' ||
      workgraphTransition.completionEvidenceLineage?.semanticFingerprint !== completionEvidenceLineage.semanticFingerprint ||
      completionReceipt.workNodeRef !== owner.workNodeRef ||
      completionReceipt.nodeSemanticFingerprint !== completionVerification.nodeFingerprint ||
      completionReceipt.expectedTransitionRef !== completionVerification.expectedTransitionRef ||
      completionReceipt.currentness !== 'CURRENT' || completionReceipt.state !== 'PROVEN' ||
      completionReceipt.disposition !== 'COMPLETED' || completionReceipt.sourceState !== 'COMPLETED' ||
      completionReceipt.completionEvidenceLineage?.semanticFingerprint !== completionEvidenceLineage.semanticFingerprint ||
      returnRouteReceipt.workNodeRef !== owner.workNodeRef ||
      returnRouteReceipt.schedulerGeneration !== owner.schedulerGeneration ||
      returnRouteReceipt.expectedTransitionRef !== completionVerification.expectedTransitionRef ||
      returnRouteReceipt.returnRouteRef !== completionVerification.returnRouteRef ||
      returnRouteReceipt.state !== 'RETURN_ROUTE_PRESERVED' ||
      returnRouteReceipt.completionVerificationFingerprint !== completionVerification.semanticFingerprint ||
      returnRouteReceipt.completionEvidenceLineageFingerprint !== completionEvidenceLineage.semanticFingerprint ||
      returnRouteReceipt.canonicalWorkgraphTransitionFingerprint !== workgraphTransition.semanticFingerprint ||
      returnRouteReceipt.completionReceiptRef !== completionReceipt.receiptRef) {
    throw new Error('scheduler/Workgraph recovery closure evidence is stale, substituted, or detached');
  }
  const expected = expectedCompletionBindings(owner);
  const observed = completionEvidenceLineage.gateEvidence.map((item) => ({
    completionGateRef: item.completionGateRef,
    sourceObservationRef: item.sourceObservationRef,
    sourceObservationHash: item.sourceObservationHash
  })).sort((left, right) => left.completionGateRef.localeCompare(right.completionGateRef));
  if (!same(expected, observed) || !same(RECOVERY_COMPLETION_GATE_REFS, expected.map((item) => item.completionGateRef).sort())) {
    throw new Error('completion verifier did not consume the exact recovery causal gate set');
  }
  const terminal = contentAddressed({
    schemaVersion: 'vexlife.runtime-recovery-terminal-receipt/v1',
    aggregateRef: owner.aggregateRef,
    aggregateFingerprint: owner.semanticFingerprint,
    workNodeRef: owner.workNodeRef,
    sourceStateFingerprint: owner.sourceStateFingerprint,
    schedulerGeneration: owner.schedulerGeneration,
    failureRef: owner.activeFailure.failureRef,
    failureFingerprint: owner.activeFailure.semanticFingerprint,
    ...cycleBindings(owner),
    decisionRef: owner.activePolicyDecision.decisionRef,
    decisionFingerprint: owner.activePolicyDecision.semanticFingerprint,
    actionReceiptRef: owner.currentRecoveryActionReceipt.actionReceiptRef,
    actionReceiptFingerprint: owner.currentRecoveryActionReceipt.semanticFingerprint,
    convergenceReceiptRef: owner.recoveryConvergenceReceipt.convergenceReceiptRef,
    convergenceReceiptFingerprint: owner.recoveryConvergenceReceipt.semanticFingerprint,
    successExecutionRef: owner.lastSuccessfulExecutionReceipt.executionReceiptRef,
    successExecutionFingerprint: owner.lastSuccessfulExecutionReceipt.semanticFingerprint,
    schedulerCheckpointRef: schedulerCheckpoint.checkpointRef,
    schedulerCheckpointFingerprint: schedulerCheckpoint.semanticFingerprint,
    schedulerCompletionVerificationRef: completionVerification.verificationReceiptRef,
    schedulerCompletionVerificationFingerprint: completionVerification.semanticFingerprint,
    schedulerCompletionEvidenceLineageFingerprint: completionEvidenceLineage.semanticFingerprint,
    schedulerWorkgraphTransitionRef: workgraphTransition.transitionRef,
    schedulerWorkgraphTransitionFingerprint: workgraphTransition.semanticFingerprint,
    schedulerCompletionRef: completionReceipt.receiptRef,
    schedulerCompletionFingerprint: completionReceipt.semanticFingerprint,
    schedulerReturnRouteRef: returnRouteReceipt.returnRouteReceiptRef,
    schedulerReturnRouteFingerprint: returnRouteReceipt.semanticFingerprint,
    schedulerEvidence: {
      schedulerCheckpoint,
      completionVerification,
      completionEvidenceLineage,
      workgraphTransition,
      completionReceipt,
      returnRouteReceipt
    },
    schedulerEvidenceFingerprint: semanticHash({
      schedulerCheckpoint,
      completionVerification,
      completionEvidenceLineage,
      workgraphTransition,
      completionReceipt,
      returnRouteReceipt
    }),
    finalOutcome: 'SUCCEEDED',
    completedAt
  }, 'recoveryReceiptRef', 'receipt.runtime-recovery.terminal.');
  const next = appendEvent(owner, 'TERMINAL_CLOSED', { receipt: terminal }, completedAt, registry);
  return freeze({
    aggregate: next,
    terminalReceipt: terminal,
    schedulerBindings: {
      checkpointFingerprint: schedulerCheckpoint.semanticFingerprint,
      completionVerificationFingerprint: completionVerification.semanticFingerprint,
      completionEvidenceLineageFingerprint: completionEvidenceLineage.semanticFingerprint,
      workgraphTransitionFingerprint: workgraphTransition.semanticFingerprint,
      completionFingerprint: completionReceipt.semanticFingerprint
    }
  });
}

export function recordExternalRecoveryEvent(aggregate, event, { registry = null } = {}) {
  const owner = createRecoveryAggregate(aggregate, { registry });
  if (!event?.eventRef || !event?.workNodeRef || !Number.isInteger(event?.schedulerGeneration)) {
    return freeze({ changed: false, aggregate: owner, reason: 'MALFORMED_EVENT_REJECTED' });
  }
  const lifecycleRejection = externalEventLifecycleRejectionReason(owner, event);
  if (lifecycleRejection) {
    return freeze({ changed: false, aggregate: owner, reason: lifecycleRejection });
  }
  const canonical = clone(event);
  const lifecycleBindings = externalEventClaimLifecycleBindings(owner.currentSchedulerClaimLifecycle);
  for (const [field, expected] of Object.entries(lifecycleBindings)) {
    if (canonical[field] !== undefined && canonical[field] !== expected) {
      return freeze({
        changed: false,
        aggregate: owner,
        reason: 'EVENT_CLAIM_LIFECYCLE_BINDING_MISMATCH_REJECTED'
      });
    }
    canonical[field] = expected;
  }
  if (canonical.recoveryCycleRef === undefined && canonical.recoveryCycleFingerprint === undefined) {
    Object.assign(canonical, cycleBindings(owner));
  } else {
    assertCurrentCycle(canonical, owner, 'external recovery event');
  }
  delete canonical.semanticFingerprint;
  canonical.semanticFingerprint = semanticHash(canonical);
  const existing = owner.acceptedExternalEvents.find((item) => item.eventRef === event.eventRef);
  if (existing) {
    return freeze({
      changed: false,
      aggregate: owner,
      reason: existing.semanticFingerprint === canonical.semanticFingerprint
        ? 'DUPLICATE_EVENT_REJECTED_ONCE_ONLY'
        : 'SAME_REF_DIFFERENT_CONTENT_REJECTED'
    });
  }
  if (event.semanticFingerprint && event.semanticFingerprint !== canonical.semanticFingerprint) {
    return freeze({ changed: false, aggregate: owner, reason: 'EVENT_FINGERPRINT_MISMATCH_REJECTED' });
  }
  if (owner.phase === 'COMPLETED' || event.workNodeRef !== owner.workNodeRef ||
      event.schedulerGeneration !== owner.schedulerGeneration) {
    return freeze({ changed: false, aggregate: owner, reason: 'STALE_OR_CROSS_WORK_EVENT_REJECTED' });
  }
  const next = appendEvent(owner, 'EXTERNAL_EVENT_ACCEPTED', { event: canonical }, event.observedAt, registry);
  return freeze({ changed: true, aggregate: next, reason: 'EVENT_ACCEPTED_ONCE' });
}

export function projectRecoveryAggregate(aggregate, { priorProjection = null, registry = null } = {}) {
  aggregate = createRecoveryAggregate(aggregate, { registry });
  const active = aggregate.activeFailure;
  const recovered = aggregate.recoveredFailure ?? aggregate.failureHistory.at(-1) ?? null;
  const terminal = aggregate.activeRecoveryCycle
    ? currentCycleEntries(aggregate.terminalRecoveryReceipts, aggregate).at(-1) ?? null
    : null;
  const action = aggregate.currentRecoveryActionReceipt;
  const success = aggregate.lastSuccessfulExecutionReceipt;
  const currentCheckpoint = currentCycleEntries(aggregate.checkpointLineage, aggregate).at(-1) ?? null;
  const currentPreservationFingerprint = action?.preservationFingerprint ?? currentCheckpoint?.semanticFingerprint ?? null;
  const currentQuarantines = currentCycleEntries(aggregate.rollbackLineage, aggregate)
    .filter((item) => item.state === 'QUARANTINED').map((item) => item.quarantineRef);
  const currentHumanGates = currentCycleEntries(aggregate.humanDecisionGates, aggregate);
  const schedulerHold = aggregate.schedulerRecoveryHold;
  const hasHeldEvidence = currentQuarantines.length > 0 || currentHumanGates.length > 0;
  const projection = {
    schemaVersion: 'vexlife.runtime-recovery-projection/v1',
    projectionKind: 'QUEUE_TERRAIN_HEALTH_GUIDE',
    aggregateRef: aggregate.aggregateRef,
    aggregateFingerprint: aggregate.semanticFingerprint,
    activeRecoveryCycleRef: aggregate.activeRecoveryCycle?.recoveryCycleRef ?? null,
    activeRecoveryCycleFingerprint: aggregate.activeRecoveryCycle?.semanticFingerprint ?? null,
    activeFailureRef: active?.failureRef ?? null,
    activeFailureFingerprint: active?.semanticFingerprint ?? null,
    recoveredFailureRef: recovered?.failureRef ?? null,
    recoveredFailureFingerprint: recovered?.semanticFingerprint ?? null,
    schedulerClaimLifecycle: aggregate.currentSchedulerClaimLifecycle?.claimLifecycle ?? null,
    schedulerClaimCurrentnessReceiptRef:
      aggregate.currentSchedulerClaimLifecycle?.currentnessReceiptRef ?? null,
    schedulerClaimCurrentnessReceiptFingerprint:
      aggregate.currentSchedulerClaimLifecycle?.semanticFingerprint ?? null,
    schedulerRecoveryHoldFingerprint: schedulerHold?.semanticFingerprint ?? null,
    schedulerDispositionReceiptRef: schedulerHold?.dispositionReceiptRef ?? null,
    schedulerDispositionReceiptFingerprint: schedulerHold?.dispositionReceiptFingerprint ?? null,
    currentActionReceiptRef: action?.actionReceiptRef ?? null,
    currentActionReceiptFingerprint: action?.semanticFingerprint ?? null,
    currentSuccessReceiptRef: success?.executionReceiptRef ?? null,
    currentSuccessReceiptFingerprint: success?.semanticFingerprint ?? null,
    currentConvergenceReceiptRef: aggregate.recoveryConvergenceReceipt?.convergenceReceiptRef ?? null,
    currentConvergenceReceiptFingerprint: aggregate.recoveryConvergenceReceipt?.semanticFingerprint ?? null,
    currentTerminalReceiptRef: terminal?.recoveryReceiptRef ?? null,
    currentTerminalReceiptFingerprint: terminal?.semanticFingerprint ?? null,
    queue: {
      state: aggregate.phase,
      workNodeRef: aggregate.workNodeRef,
      activeRecoveryCycleRef: aggregate.activeRecoveryCycle?.recoveryCycleRef ?? null,
      recoveryCycleCount: aggregate.recoveryCycleHistory.length,
      retryAttempts: aggregate.attemptLedger.length,
      successfulAttemptRef: success?.attemptRef ?? null,
      successfulGeneration: success?.schedulerGeneration ?? null,
      nextSafeAction: schedulerHold ? 'REVIEW_SCHEDULER_CLAIM_DISPOSITION'
        : aggregate.phase === 'COMPLETED' ? (hasHeldEvidence ? 'REVIEW_HELD_RECOVERY_EVIDENCE' : 'NONE')
          : active ? action?.action ?? 'FOLLOW_SOURCE_MANAGED_RECOVERY' : 'EXECUTE_ADMITTED_WORK'
    },
    terrain: {
      recoveryNodeState: aggregate.phase,
      checkpointCount: aggregate.checkpointLineage.length,
      continuationCount: aggregate.continuationLineage.length,
      rollbackCount: aggregate.rollbackLineage.length,
      lastKnownGoodCount: aggregate.lastKnownGoodRefs.length,
      quarantinedCount: aggregate.quarantinedRefs.length,
      schedulerClaimLifecycle: aggregate.currentSchedulerClaimLifecycle?.claimLifecycle ?? null,
      schedulerClaimCurrentnessReceiptRef:
        aggregate.currentSchedulerClaimLifecycle?.currentnessReceiptRef ?? null
    },
    health: {
      state: aggregate.phase === 'BLOCKED' ? 'BLOCKED'
        : ['QUARANTINED', 'WAITING_HUMAN'].includes(aggregate.phase) || hasHeldEvidence || active ? 'ATTENTION' : 'CLEAR',
      activeFailureRef: active?.failureRef ?? null,
      recoveredFailureRef: recovered?.failureRef ?? null,
      partialEffectState: (active ?? recovered)?.partialEffectState ?? 'NONE',
      evidenceRefs: canonicalRefs([
        ...((active ?? recovered)?.evidenceRefs ?? []),
        ...(terminal ? [terminal.recoveryReceiptRef] : []),
        ...(schedulerHold ? [schedulerHold.dispositionReceiptRef, schedulerHold.reasonRef] : []),
        ...currentQuarantines
      ], 'projection evidenceRefs')
    },
    guide: {
      whatFailed: (active ?? recovered)?.failureClass ?? null,
      whatWasPreserved: currentPreservationFingerprint,
      preservationState: currentPreservationFingerprint
        ? 'CURRENT_CYCLE_EVIDENCE'
        : aggregate.activeRecoveryCycle ? 'AWAITING_CURRENT_CYCLE_EVIDENCE' : 'NOT_APPLICABLE',
      recoveryRoute: schedulerHold ? 'SCHEDULER_CLAIM_INVALIDATED'
        : aggregate.activePolicyDecision?.action ?? action?.action ?? null,
      recoveredAttemptRef: success?.attemptRef ?? null,
      recoveredGeneration: success?.schedulerGeneration ?? null,
      terminalProofRef: terminal?.recoveryReceiptRef ?? null,
      remainsQuarantined: currentQuarantines,
      waitingOn: schedulerHold?.reasonRef ??
        (aggregate.phase === 'WAITING_HUMAN' ? currentHumanGates.at(-1)?.decisionGateRef ?? null : null),
      victorNeeded: aggregate.phase === 'WAITING_HUMAN',
      remainsBlocked: aggregate.phase === 'BLOCKED' || currentQuarantines.length > 0
    }
  };
  projection.semanticFingerprint = semanticHash(projection);
  if (priorProjection) {
    const supplied = clone(priorProjection);
    const suppliedFingerprint = supplied.semanticFingerprint;
    delete supplied.semanticFingerprint;
    if (semanticHash(supplied) !== suppliedFingerprint) {
      throw new Error('prior recovery projection fingerprint is invalid');
    }
  }
  if (priorProjection?.semanticFingerprint === projection.semanticFingerprint) {
    return freeze({ changed: false, projection: priorProjection, reason: 'SEMANTIC_NO_OP' });
  }
  return freeze({ changed: true, projection: freeze(projection), reason: 'RECOVERY_PROJECTION_CHANGED' });
}

export function serializeRecoveryAggregate(aggregate, { registry } = {}) {
  return JSON.stringify(createRecoveryAggregate(aggregate, { registry }));
}

export function restoreRecoveryAggregate(serialized, { registry } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new Error(`recovery aggregate is not valid JSON: ${error.message}`);
  }
  return createRecoveryAggregate(parsed, { registry });
}

export function createUnknownFailureForMalformedInput(input, context, options = {}) {
  const error = new Error(`malformed runtime failure input: ${semanticHash(input).slice(0, 16)}`);
  const classificationEvidence = classifyInternalRuntimeFailure('MALFORMED_INPUT', error, options);
  return createFailureEnvelope({
    ...context,
    error,
    classificationEvidence
  }, options);
}

// [VXG RealForever]
