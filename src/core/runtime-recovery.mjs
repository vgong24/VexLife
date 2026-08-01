import { createIntentCheckpoint } from './intent-checkpoint.mjs';
import { buildReceiptFingerprint, buildTransitionFingerprint } from './intent-workgraph.mjs';
import { createResourceSnapshot, evaluateCurrentResourceAdmission } from './resource-admission.mjs';
import { assertCurrentLease, parseCanonicalTimestamp } from './scheduler-runtime-trust.mjs';
import {
  createFailureEnvelope,
  createSourceManagedFailureEvidence,
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
  'activePolicyDecision',
  'currentRecoveryReceipt',
  'currentCheckpointAdmission',
  'currentRecoveryActionReceipt',
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
    activePolicyDecision: null,
    currentRecoveryReceipt: null,
    currentCheckpointAdmission: null,
    currentRecoveryActionReceipt: null,
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
  if (state.activeFailure) {
    const continuation = state.continuationLineage.at(-1);
    if (!state.currentRecoveryActionReceipt || !continuation ||
        continuation.nextSchedulerGeneration !== state.schedulerGeneration ||
        state.schedulerGeneration <= state.activeFailure.schedulerGeneration) {
      throw new Error('retry requires aggregate-owned recovery action and scheduler-issued fresh generation');
    }
  }
}

function validateObservationWithinAttempt(attempt, observedAt, label) {
  const started = parseCanonicalTimestamp(attempt.startedAt, `${label} startedAt`);
  const observed = parseCanonicalTimestamp(observedAt, `${label} observedAt`);
  const deadline = parseCanonicalTimestamp(attempt.deadlineAt, `${label} deadlineAt`);
  if (observed < started || observed > deadline) throw new Error(`${label} violates canonical attempt chronology or deadline`);
  return observed - started;
}

function validateCheckpoint(value) {
  return assertContentAddressed(value, {
    schemaVersion: 'vexlife.runtime-recovery-checkpoint/v1',
    refField: 'recoveryCheckpointRef',
    prefix: 'checkpoint.runtime-recovery.',
    label: 'recovery checkpoint'
  });
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

function validateTransactionReceipt(value) {
  if (!value || value.schemaVersion !== 'vexlife.runtime-transactional-recovery-receipt/v1') {
    throw new Error('transactional recovery receipt is missing or has the wrong schema');
  }
  const canonical = clone(value);
  delete canonical.semanticFingerprint;
  if (semanticHash(canonical) !== value.semanticFingerprint || value.externalEffectsExecuted !== false) {
    throw new Error('transactional recovery receipt fingerprint/effect boundary mismatch');
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
  if (state.phase === 'COMPLETED') throw new Error('terminal recovery state cannot accept later events');
  const payload = event.payload;

  switch (event.type) {
    case 'ATTEMPT_STARTED': {
      if (state.activeAttempt) throw new Error('attempt start is impossible while another attempt is active');
      validateAttemptStart(payload.attempt, state);
      state.activeAttempt = freeze({ ...clone(payload.attempt), state: 'STARTED' });
      state.attemptLedger.push(clone(state.activeAttempt));
      break;
    }
    case 'ATTEMPT_SUCCEEDED': {
      if (!state.activeAttempt || state.activeAttempt.attemptRef !== payload.attemptRef) {
        throw new Error('attempt success requires the exact active attempt');
      }
      const elapsedMs = validateObservationWithinAttempt(state.activeAttempt, payload.completedAt, 'attempt success');
      const executionReceipt = validateExecutionReceipt(payload.executionReceipt);
      if (executionReceipt.executorOutcome !== 'SUCCEEDED' || executionReceipt.attemptRef !== payload.attemptRef ||
          executionReceipt.schedulerGeneration !== state.schedulerGeneration) {
        throw new Error('attempt success execution receipt is detached');
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
        failureRecurrenceFingerprint: payload.failure.recurrenceFingerprint
      };
      state.activeAttempt = null;
      state.phase = 'FAILURE_ACTIVE';
      break;
    }
    case 'FAILURE_ACTIVATED': {
      const previous = state.eventLedger.at(-1);
      if (previous?.type !== 'ATTEMPT_FAILED' ||
          previous.payload.failure.semanticFingerprint !== payload.failure?.semanticFingerprint) {
        throw new Error('failure activation must immediately consume the failed attempt');
      }
      const validation = validateFailureEnvelope(payload.failure, { registry });
      if (!validation.ok) throw new Error(`active failure invalid: ${validation.errors.join(', ')}`);
      state.activeFailure = clone(payload.failure);
      state.failureHistory.push(clone(payload.failure));
      state.activePolicyDecision = null;
      state.currentRecoveryReceipt = null;
      state.currentCheckpointAdmission = null;
      state.currentRecoveryActionReceipt = null;
      state.recoveryConvergenceReceipt = null;
      state.phase = 'FAILURE_ACTIVE';
      break;
    }
    case 'CHECKPOINT_ADMITTED': {
      if (!state.activeFailure) throw new Error('checkpoint admission requires an active failure');
      const checkpoint = validateCheckpoint(payload.checkpoint);
      const admission = validateCheckpointAdmission(payload.admission);
      if (!admission.admitted || admission.state !== 'ADMITTED' || admission.currentness !== 'CURRENT' ||
          admission.checkpointFingerprint !== checkpoint.semanticFingerprint ||
          admission.failureFingerprint !== state.activeFailure.semanticFingerprint ||
          admission.priorSchedulerGeneration !== state.schedulerGeneration ||
          admission.workNodeRef !== state.workNodeRef ||
          admission.sourceStateFingerprint !== state.sourceStateFingerprint) {
        throw new Error('checkpoint admission receipt is stale or detached');
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
    case 'POLICY_DECIDED': {
      if (!state.activeFailure || state.activePolicyDecision) throw new Error('policy decision requires one undecided active failure');
      const decision = validateRecoveryPolicyDecision(payload.decision);
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
      if (receipt.failureFingerprint !== state.activeFailure.semanticFingerprint ||
          receipt.decisionFingerprint !== decision.semanticFingerprint) {
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
      const receipt = validateContextReceipt(payload.receipt);
      if (!state.activeFailure || receipt.failureFingerprint !== state.activeFailure.semanticFingerprint ||
          receipt.checkpointAdmissionFingerprint !== state.currentCheckpointAdmission?.semanticFingerprint) {
        throw new Error('context recovery receipt is detached');
      }
      state.contextRecoveryReceipts.push(receipt);
      break;
    }
    case 'RESOURCE_RECOVERED': {
      const receipt = validateResourceReceipt(payload.receipt);
      if (!state.activeFailure || receipt.failureFingerprint !== state.activeFailure.semanticFingerprint ||
          receipt.checkpointAdmissionFingerprint !== state.currentCheckpointAdmission?.semanticFingerprint) {
        throw new Error('resource recovery receipt is detached');
      }
      state.resourceRecoveryReceipts.push(receipt);
      break;
    }
    case 'ROLLBACK_ATTEMPTED': {
      const receipt = validateTransactionReceipt(payload.receipt);
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
      const receipt = validateTransactionReceipt(payload.receipt);
      if (state.rollbackLineage.at(-1)?.semanticFingerprint !== receipt.semanticFingerprint ||
          receipt.state !== 'ROLLED_BACK' || receipt.rollbackVerified !== true ||
          receipt.rollbackReadBackFingerprint !== receipt.observedBeforeFingerprint) {
        throw new Error('rollback verification is not exact');
      }
      break;
    }
    case 'LAST_KNOWN_GOOD_RESTORED': {
      const receipt = validateTransactionReceipt(payload.receipt);
      if (state.rollbackLineage.at(-1)?.semanticFingerprint !== receipt.semanticFingerprint ||
          receipt.state !== 'LAST_KNOWN_GOOD_RESTORED' || receipt.lastKnownGoodRestored !== true ||
          receipt.lastKnownGoodReadBackFingerprint !== receipt.lastKnownGoodExpectedFingerprint) {
        throw new Error('last-known-good restore is not exact');
      }
      state.lastKnownGoodRefs = canonicalRefs([...state.lastKnownGoodRefs, receipt.lastKnownGoodRef], 'lastKnownGoodRefs');
      break;
    }
    case 'QUARANTINED': {
      const receipt = validateTransactionReceipt(payload.receipt);
      if (state.rollbackLineage.at(-1)?.semanticFingerprint !== receipt.semanticFingerprint ||
          receipt.state !== 'QUARANTINED' || !receipt.quarantined || !receipt.quarantineRef) {
        throw new Error('quarantine event requires exact failed rollback/LKG evidence');
      }
      state.quarantinedRefs = canonicalRefs([...state.quarantinedRefs, receipt.quarantineRef], 'quarantinedRefs');
      state.phase = 'QUARANTINED';
      break;
    }
    case 'HUMAN_DECISION_REQUESTED': {
      if (!payload.gate?.decisionGateRef || payload.gate.failureFingerprint !== state.activeFailure?.semanticFingerprint ||
          state.humanDecisionGates.some((item) => item.decisionGateRef === payload.gate.decisionGateRef)) {
        throw new Error('human decision gate is missing, detached, or duplicated');
      }
      state.humanDecisionGates.push(clone(payload.gate));
      state.phase = 'WAITING_HUMAN';
      break;
    }
    case 'RECOVERY_ACTION_APPLIED': {
      const receipt = validateActionReceipt(payload.receipt);
      if (!state.activePolicyDecision || receipt.decisionFingerprint !== state.activePolicyDecision.semanticFingerprint ||
          receipt.failureFingerprint !== state.activeFailure?.semanticFingerprint || state.currentRecoveryActionReceipt) {
        throw new Error('recovery action must consume the exact active decision once');
      }
      state.currentRecoveryActionReceipt = receipt;
      state.phase = receipt.disposition === 'QUARANTINED' ? 'QUARANTINED'
        : receipt.disposition === 'WAITING_HUMAN' ? 'WAITING_HUMAN'
          : receipt.disposition === 'BLOCKED' ? 'BLOCKED' : 'RECOVERING';
      break;
    }
    case 'GENERATION_CONTINUED': {
      if (!state.currentRecoveryActionReceipt || !state.currentCheckpointAdmission ||
          ['QUARANTINED', 'WAITING_HUMAN', 'BLOCKED'].includes(state.phase)) {
        throw new Error('generation continuation requires converged recoverable action and checkpoint admission');
      }
      const continuation = validateContinuation(payload.continuation);
      if (continuation.checkpointAdmissionFingerprint !== state.currentCheckpointAdmission.semanticFingerprint ||
          continuation.priorSchedulerGeneration !== state.schedulerGeneration ||
          continuation.nextSchedulerGeneration <= state.schedulerGeneration ||
          continuation.workNodeRef !== state.workNodeRef ||
          continuation.sourceStateFingerprint !== state.sourceStateFingerprint) {
        throw new Error('scheduler continuation is stale or detached');
      }
      state.schedulerGeneration = continuation.nextSchedulerGeneration;
      state.continuationLineage.push(continuation);
      state.phase = 'RECOVERING';
      break;
    }
    case 'EXTERNAL_EVENT_ACCEPTED': {
      const external = clone(payload.event);
      const supplied = external.semanticFingerprint;
      delete external.semanticFingerprint;
      external.semanticFingerprint = semanticHash(external);
      if (supplied && supplied !== external.semanticFingerprint) throw new Error('external event fingerprint mismatch');
      if (external.workNodeRef !== state.workNodeRef || external.schedulerGeneration !== state.schedulerGeneration) {
        throw new Error('stale or cross-work external event rejected');
      }
      const existing = state.acceptedExternalEvents.find((item) => item.eventRef === external.eventRef);
      if (existing) throw new Error(existing.semanticFingerprint === external.semanticFingerprint
        ? 'duplicate external event rejected' : 'same-ref/different-content external event rejected');
      state.acceptedExternalEvents.push(external);
      break;
    }
    case 'RECOVERY_CONVERGED': {
      const receipt = validateConvergenceReceipt(payload.receipt);
      if (!state.lastSuccessfulExecutionReceipt || !state.currentRecoveryActionReceipt ||
          receipt.successExecutionFingerprint !== state.lastSuccessfulExecutionReceipt.semanticFingerprint ||
          receipt.actionReceiptFingerprint !== state.currentRecoveryActionReceipt.semanticFingerprint ||
          state.quarantinedRefs.length || state.humanDecisionGates.length || ['BLOCKED', 'QUARANTINED', 'WAITING_HUMAN'].includes(state.phase)) {
        throw new Error('recovery convergence requires exact success/action ownership and no unresolved hold');
      }
      state.recoveryConvergenceReceipt = receipt;
      state.phase = 'RECOVERING';
      break;
    }
    case 'TERMINAL_CLOSED': {
      const receipt = validateTerminalReceipt(payload.receipt);
      if (state.terminalRecoveryReceipts.length || !state.recoveryConvergenceReceipt ||
          receipt.convergenceReceiptFingerprint !== state.recoveryConvergenceReceipt.semanticFingerprint ||
          receipt.successExecutionFingerprint !== state.lastSuccessfulExecutionReceipt?.semanticFingerprint ||
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

function boundaryRejection(reasonCode, error, aggregate, context, registry) {
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
    wallTimeBudgetFingerprint: aggregate.retryBudgetFingerprint
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

  try {
    const value = executor(Object.freeze({ ...clone(context), aggregateFingerprint: startedAggregate.semanticFingerprint }));
    if (value && typeof value.then === 'function') {
      return boundaryRejection('THENABLE_EXECUTOR_UNSUPPORTED', new Error('thenable executor is unsupported'), canonicalAggregate, context, registry);
    }
    if (value?.partialEffectState && value.partialEffectState !== 'NONE') {
      const error = new Error('executor reported success with a partial effect');
      error.sourceManagedFailureEvidence = createSourceManagedFailureEvidence({
        failureClass: 'MALFORMED_INPUT_OR_RESULT',
        sourceRef: 'source.runtime-recovery.internal.partial-success',
        error
      });
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
      startedAt: context.startedAt,
      completedAt: context.completedAt,
      deadlineAt: context.deadlineAt,
      elapsedMs: parseCanonicalTimestamp(context.completedAt, 'attempt completedAt') -
        parseCanonicalTimestamp(context.startedAt, 'attempt startedAt')
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
      }, { registry });
      let next = appendEvent(startedAggregate, 'ATTEMPT_FAILED', { failure }, context.observedAt, registry);
      next = appendEvent(next, 'FAILURE_ACTIVATED', { failure }, context.observedAt, registry);
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

export function createRecoveryCheckpoint({
  schedulerCheckpoint,
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
  assertFingerprint(sourceStateFingerprint, 'recovery checkpoint sourceStateFingerprint');
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
    workNodeRef: exactSchedulerCheckpoint.workNodeRef,
    sourceStateFingerprint,
    schedulerGeneration: exactSchedulerCheckpoint.priorSchedulerGeneration,
    schedulerCheckpointRef: exactSchedulerCheckpoint.checkpointRef,
    schedulerCheckpointFingerprint: exactSchedulerCheckpoint.semanticFingerprint,
    schedulerCheckpoint: exactSchedulerCheckpoint,
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
    if (!same(exactScheduler, canonical.schedulerCheckpoint)) reasons.push('SCHEDULER_CHECKPOINT_SUBSTITUTED');
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
    recoveryCheckpointRef: canonical?.recoveryCheckpointRef ?? checkpoint?.recoveryCheckpointRef ?? null,
    checkpointFingerprint: canonical?.semanticFingerprint ?? null,
    schedulerCheckpointRef: canonical?.schedulerCheckpointRef ?? null,
    schedulerCheckpointFingerprint: canonical?.schedulerCheckpointFingerprint ?? null,
    priorSchedulerGeneration: canonicalAggregate?.schedulerGeneration ?? aggregate?.schedulerGeneration ?? null,
    nextSchedulerGeneration,
    observedAt,
    reasons
  }, 'admissionRef', 'admission.runtime-recovery.checkpoint.');
}

export function recordRecoveryCheckpointAdmission(aggregate, checkpoint, admission, { registry } = {}) {
  const canonical = createRecoveryAggregate(aggregate, { registry });
  const exactAdmission = validateCheckpointAdmission(admission);
  if (!exactAdmission.admitted) throw new Error(`checkpoint admission blocked: ${exactAdmission.reasons.join(', ')}`);
  return appendEvent(canonical, 'CHECKPOINT_ADMITTED', {
    checkpoint: validateCheckpoint(checkpoint),
    admission: exactAdmission
  }, exactAdmission.observedAt, registry);
}

function nonterminalRecoveryReceipt(failure, decision, checkpointAdmission, observedAt) {
  return contentAddressed({
    schemaVersion: 'vexlife.runtime-recovery-receipt/v1',
    failureRef: failure.failureRef,
    failureFingerprint: failure.semanticFingerprint,
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
  const canonical = createRecoveryAggregate(aggregate, { registry });
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
  const receipt = nonterminalRecoveryReceipt(canonical.activeFailure, decision, checkpointAdmission, observedAt);
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
  const candidateInput = ranges.reduce((total, segment) => total +
    (overflow && segment.eligibleForCondensation ? segment.candidateTokenEstimate : segment.tokenEstimate), 0);
  let state = 'ADMITTED';
  let action = 'NO_RECOVERY_REQUIRED';
  if (overflow && candidateInput + reservedOutputTokens <= hardTokenLimit) {
    state = 'CONTEXT_REACQUIRED';
    action = 'CONDENSE_CONTEXT_AND_REACQUIRE';
  } else if (overflow && splitWorkNodeRef) {
    state = 'SPLIT_REQUIRED';
    action = 'SPLIT_WORK_NODE';
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
    schedulerGeneration: admission.nextSchedulerGeneration,
    checkpointAdmissionRef: admission.admissionRef,
    checkpointAdmissionFingerprint: admission.semanticFingerprint,
    state,
    action,
    currentness,
    modelInvoked: false,
    invisibleTruncation: false,
    sourceHistoryDeleted: false,
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
    schedulerGeneration: admission.nextSchedulerGeneration,
    checkpointAdmissionRef: admission.admissionRef,
    checkpointAdmissionFingerprint: admission.semanticFingerprint,
    resourceSnapshotRef: snapshot.snapshotRef,
    resourceSnapshotFingerprint: snapshot.semanticFingerprint,
    deniedAdmissionFingerprint: denied.semanticFingerprint,
    deniedReasons: denied.reasons,
    reducedAdmissionFingerprint: reduced.semanticFingerprint,
    reducedBudgetAdmitted: reduced.admitted,
    reducedRequest: reduced.request,
    currentness: 'CURRENT',
    observedAt
  }, 'resourceRecoveryReceiptRef', 'receipt.runtime-recovery.resource.');
}

export function applyRecoveryAction({
  aggregate,
  policyDecision,
  checkpointAdmission,
  contextRecoveryReceipt = null,
  resourceRecoveryReceipt = null,
  transactionalRecoveryReceipt = null,
  humanDecisionGate = null,
  observedAt,
  registry
}) {
  let current = createRecoveryAggregate(aggregate, { registry });
  const decision = validateRecoveryPolicyDecision(policyDecision);
  const admission = validateCheckpointAdmission(checkpointAdmission);
  if (current.activePolicyDecision?.semanticFingerprint !== decision.semanticFingerprint ||
      current.currentCheckpointAdmission?.semanticFingerprint !== admission.semanticFingerprint ||
      current.currentRecoveryActionReceipt) {
    throw new Error('recovery action must consume the exact current policy/checkpoint once');
  }
  const evidence = [];
  if (contextRecoveryReceipt) {
    const receipt = validateContextReceipt(contextRecoveryReceipt);
    current = appendEvent(current, 'CONTEXT_RECOVERED', { receipt }, observedAt, registry);
    evidence.push({ ref: receipt.contextRecoveryReceiptRef, fingerprint: receipt.semanticFingerprint });
  }
  if (resourceRecoveryReceipt) {
    const receipt = validateResourceReceipt(resourceRecoveryReceipt);
    current = appendEvent(current, 'RESOURCE_RECOVERED', { receipt }, observedAt, registry);
    evidence.push({ ref: receipt.resourceRecoveryReceiptRef, fingerprint: receipt.semanticFingerprint });
  }
  let transaction = null;
  if (transactionalRecoveryReceipt) {
    transaction = validateTransactionReceipt(transactionalRecoveryReceipt);
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
    evidence.push({ ref: transaction.rollbackReceiptRef, fingerprint: transaction.semanticFingerprint });
  }
  if (decision.action === 'ROLLBACK_TO_BEFORE_IMAGE' && !transaction) {
    throw new Error('rollback policy action requires exact transactional recovery evidence');
  }
  if (decision.action === 'QUARANTINE_ADAPTER_OR_ARTIFACT' && transaction?.state !== 'QUARANTINED') {
    throw new Error('quarantine policy action requires exact failed rollback/LKG evidence');
  }
  if (decision.action === 'CONDENSE_CONTEXT_AND_REACQUIRE' && !contextRecoveryReceipt) {
    throw new Error('context policy action requires exact context recovery receipt');
  }
  if (decision.action === 'RETRY_REDUCED_BUDGET' && !resourceRecoveryReceipt) {
    throw new Error('reduced-budget policy action requires exact resource recovery receipt');
  }
  if (decision.action === 'REQUEST_HUMAN_DECISION') {
    const gate = humanDecisionGate ?? {
      decisionGateRef: `gate.human.${current.activeFailure.failureRef}`,
      failureRef: current.activeFailure.failureRef,
      failureFingerprint: current.activeFailure.semanticFingerprint,
      smallestQuestionRef: `question.runtime-recovery.${current.activeFailure.failureClass}`,
      recoveryReceiptRef: current.currentRecoveryReceipt.recoveryReceiptRef
    };
    current = appendEvent(current, 'HUMAN_DECISION_REQUESTED', { gate }, observedAt, registry);
    evidence.push({ ref: gate.decisionGateRef, fingerprint: semanticHash(gate) });
  }
  const disposition = transaction?.state === 'QUARANTINED' || decision.action === 'QUARANTINE_ADAPTER_OR_ARTIFACT'
    ? 'QUARANTINED'
    : decision.action === 'REQUEST_HUMAN_DECISION' ? 'WAITING_HUMAN'
      : decision.action === 'TERMINAL_BLOCK' ? 'BLOCKED' : 'RECOVERING';
  const receipt = contentAddressed({
    schemaVersion: 'vexlife.runtime-recovery-action-receipt/v1',
    aggregateRef: current.aggregateRef,
    workNodeRef: current.workNodeRef,
    sourceStateFingerprint: current.sourceStateFingerprint,
    schedulerGeneration: current.schedulerGeneration,
    failureRef: current.activeFailure.failureRef,
    failureFingerprint: current.activeFailure.semanticFingerprint,
    decisionRef: decision.decisionRef,
    decisionFingerprint: decision.semanticFingerprint,
    action: decision.action,
    checkpointAdmissionRef: admission.admissionRef,
    checkpointAdmissionFingerprint: admission.semanticFingerprint,
    evidence: evidence.sort((left, right) => left.ref.localeCompare(right.ref)),
    preservationFingerprint: semanticHash({
      checkpointFingerprint: admission.checkpointFingerprint,
      contextFingerprint: contextRecoveryReceipt?.semanticFingerprint ?? null,
      resourceFingerprint: resourceRecoveryReceipt?.semanticFingerprint ?? null,
      transactionFingerprint: transaction?.semanticFingerprint ?? null
    }),
    disposition,
    observedAt
  }, 'actionReceiptRef', 'receipt.runtime-recovery.action.');
  current = appendEvent(current, 'RECOVERY_ACTION_APPLIED', { receipt }, observedAt, registry);
  return freeze({ aggregate: current, actionReceipt: receipt });
}

export function createRecoveryContinuation({
  aggregate,
  checkpointAdmission,
  resumed,
  schedulerInstanceRef,
  observedAt,
  registry
}) {
  const owner = createRecoveryAggregate(aggregate, { registry });
  const admission = validateCheckpointAdmission(checkpointAdmission);
  if (resumed?.state !== 'RESUMED' || resumed.checkpointRef !== admission.schedulerCheckpointRef ||
      resumed.queue?.generation !== admission.nextSchedulerGeneration ||
      resumed.active?.workNodeRef !== owner.workNodeRef ||
      resumed.active?.schedulerGeneration !== admission.nextSchedulerGeneration ||
      resumed.workerLease?.schedulerInstanceRef !== schedulerInstanceRef) {
    throw new Error('recovery continuation was not issued by the exact scheduler resume');
  }
  const checkpoint = owner.checkpointLineage.at(-1);
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
    if (ref === priorRefs[kind] || lease.semanticFingerprint === checkpoint.schedulerCheckpoint.priorLeaseFingerprints[kind] ||
        lease.semanticFingerprint === checkpoint.schedulerCheckpoint.transitionedLeaseFingerprints[kind]) {
      throw new Error(`fresh ${kind} lease reused prior generation identity`);
    }
  }
  return contentAddressed({
    schemaVersion: 'vexlife.runtime-recovery-continuation/v1',
    aggregateRef: owner.aggregateRef,
    workNodeRef: owner.workNodeRef,
    sourceStateFingerprint: owner.sourceStateFingerprint,
    checkpointAdmissionRef: admission.admissionRef,
    checkpointAdmissionFingerprint: admission.semanticFingerprint,
    schedulerCheckpointRef: admission.schedulerCheckpointRef,
    schedulerCheckpointFingerprint: admission.schedulerCheckpointFingerprint,
    schedulerInstanceRef,
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

function causalEvidenceFromAggregate(aggregate) {
  const checkpoint = aggregate.checkpointLineage.at(-1);
  const continuation = aggregate.continuationLineage.at(-1);
  const context = aggregate.contextRecoveryReceipts.at(-1);
  const resource = aggregate.resourceRecoveryReceipts.at(-1);
  const rollback = aggregate.rollbackLineage.at(-1);
  if (!aggregate.activeFailure || !aggregate.activePolicyDecision || !checkpoint || !aggregate.currentCheckpointAdmission ||
      !context || !resource || !rollback || !aggregate.lastKnownGoodRefs.length ||
      !aggregate.currentRecoveryActionReceipt || !continuation || !aggregate.lastSuccessfulExecutionReceipt) {
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
    evidenceBinding('completion-gate.runtime-recovery.context', context.contextRecoveryReceiptRef, context.semanticFingerprint),
    evidenceBinding('completion-gate.runtime-recovery.resource', resource.resourceRecoveryReceiptRef, resource.semanticFingerprint),
    evidenceBinding('completion-gate.runtime-recovery.rollback', rollback.rollbackReceiptRef, rollback.semanticFingerprint),
    evidenceBinding('completion-gate.runtime-recovery.last-known-good', rollback.lastKnownGoodRef, rollback.lastKnownGoodReadBackFingerprint),
    evidenceBinding('completion-gate.runtime-recovery.action', aggregate.currentRecoveryActionReceipt.actionReceiptRef, aggregate.currentRecoveryActionReceipt.semanticFingerprint),
    evidenceBinding('completion-gate.runtime-recovery.continuation', continuation.continuationRef, continuation.semanticFingerprint),
    ...LEASE_KINDS.map((kind) => evidenceBinding(
      `completion-gate.runtime-recovery.fresh-${kind}-lease`,
      continuation.freshLeaseRefs[kind],
      continuation.freshLeaseFingerprints[kind]
    )),
    evidenceBinding('completion-gate.runtime-recovery.success', aggregate.lastSuccessfulExecutionReceipt.executionReceiptRef, aggregate.lastSuccessfulExecutionReceipt.semanticFingerprint)
  ].sort((left, right) => left.completionGateRef.localeCompare(right.completionGateRef));
  return bindings;
}

export function createRecoveryConvergenceReceipt(aggregate, { formedAt, registry } = {}) {
  const owner = createRecoveryAggregate(aggregate, { registry });
  parseCanonicalTimestamp(formedAt, 'recovery convergence formedAt');
  const causalEvidence = causalEvidenceFromAggregate(owner);
  return contentAddressed({
    schemaVersion: 'vexlife.runtime-recovery-convergence-receipt/v1',
    aggregateRef: owner.aggregateRef,
    aggregateFingerprint: owner.semanticFingerprint,
    workNodeRef: owner.workNodeRef,
    sourceStateFingerprint: owner.sourceStateFingerprint,
    schedulerGeneration: owner.schedulerGeneration,
    failureRef: owner.activeFailure.failureRef,
    failureFingerprint: owner.activeFailure.semanticFingerprint,
    decisionRef: owner.activePolicyDecision.decisionRef,
    decisionFingerprint: owner.activePolicyDecision.semanticFingerprint,
    actionReceiptRef: owner.currentRecoveryActionReceipt.actionReceiptRef,
    actionReceiptFingerprint: owner.currentRecoveryActionReceipt.semanticFingerprint,
    successExecutionRef: owner.lastSuccessfulExecutionReceipt.executionReceiptRef,
    successExecutionFingerprint: owner.lastSuccessfulExecutionReceipt.semanticFingerprint,
    causalEvidence,
    unresolvedQuarantineRefs: owner.quarantinedRefs,
    unresolvedHumanGateRefs: owner.humanDecisionGates.map((item) => item.decisionGateRef),
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
      owner.quarantinedRefs.length || owner.humanDecisionGates.length) {
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
  const checkpoint = owner.checkpointLineage.at(-1);
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
  const canonical = clone(event);
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

export function projectRecoveryAggregate(aggregate, { priorProjection = null } = {}) {
  const active = aggregate.activeFailure;
  const recovered = aggregate.recoveredFailure ?? aggregate.failureHistory.at(-1) ?? null;
  const terminal = aggregate.terminalRecoveryReceipts.at(-1) ?? null;
  const action = aggregate.currentRecoveryActionReceipt;
  const success = aggregate.lastSuccessfulExecutionReceipt;
  const hasHeldEvidence = aggregate.quarantinedRefs.length > 0 || aggregate.humanDecisionGates.length > 0;
  const projection = {
    schemaVersion: 'vexlife.runtime-recovery-projection/v1',
    aggregateRef: aggregate.aggregateRef,
    aggregateFingerprint: aggregate.semanticFingerprint,
    queue: {
      state: aggregate.phase,
      workNodeRef: aggregate.workNodeRef,
      retryAttempts: aggregate.attemptLedger.length,
      successfulAttemptRef: success?.attemptRef ?? null,
      successfulGeneration: success?.schedulerGeneration ?? null,
      nextSafeAction: aggregate.phase === 'COMPLETED' ? (hasHeldEvidence ? 'REVIEW_HELD_RECOVERY_EVIDENCE' : 'NONE')
        : active ? action?.action ?? 'FOLLOW_SOURCE_MANAGED_RECOVERY' : 'EXECUTE_ADMITTED_WORK'
    },
    terrain: {
      recoveryNodeState: aggregate.phase,
      checkpointCount: aggregate.checkpointLineage.length,
      continuationCount: aggregate.continuationLineage.length,
      rollbackCount: aggregate.rollbackLineage.length,
      lastKnownGoodCount: aggregate.lastKnownGoodRefs.length,
      quarantinedCount: aggregate.quarantinedRefs.length
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
        ...aggregate.quarantinedRefs
      ], 'projection evidenceRefs')
    },
    guide: {
      whatFailed: (active ?? recovered)?.failureClass ?? null,
      whatWasPreserved: action?.preservationFingerprint ?? aggregate.checkpointLineage.at(-1)?.semanticFingerprint ?? null,
      recoveryRoute: aggregate.activePolicyDecision?.action ?? action?.action ?? null,
      recoveredAttemptRef: success?.attemptRef ?? null,
      recoveredGeneration: success?.schedulerGeneration ?? null,
      terminalProofRef: terminal?.recoveryReceiptRef ?? null,
      remainsQuarantined: [...aggregate.quarantinedRefs],
      waitingOn: aggregate.phase === 'WAITING_HUMAN' ? aggregate.humanDecisionGates.at(-1)?.decisionGateRef ?? null : null,
      victorNeeded: aggregate.phase === 'WAITING_HUMAN',
      remainsBlocked: aggregate.phase === 'BLOCKED' || aggregate.quarantinedRefs.length > 0
    }
  };
  projection.semanticFingerprint = semanticHash(projection);
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
  error.sourceManagedFailureEvidence = createSourceManagedFailureEvidence({
    failureClass: 'UNKNOWN_FAILURE',
    sourceRef: 'source.runtime-recovery.internal.malformed-input',
    error
  });
  return createFailureEnvelope({
    ...context,
    error,
    partialEffectState: 'UNKNOWN',
    humanAttentionClass: 'DECISION_REQUIRED'
  }, options);
}

// [VXG RealForever]
