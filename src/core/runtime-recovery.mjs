import { parseCanonicalTimestamp } from './scheduler-runtime-trust.mjs';
import { createFailureEnvelope, normalizeThrownFailure, validateFailureEnvelope } from './runtime-failure.mjs';
import { EXECUTOR_OUTCOMES, resolveRecoveryPolicy } from './recovery-policy.mjs';
import { semanticHash } from './utils.mjs';

export const RECOVERY_AGGREGATE_REQUIRED_FIELDS = Object.freeze([
  'aggregateRef',
  'workNodeRef',
  'sourceStateFingerprint',
  'schedulerGeneration',
  'phase',
  'activeFailure',
  'attemptLedger',
  'retryBudget',
  'checkpointLineage',
  'rollbackLineage',
  'quarantinedRefs',
  'lastKnownGoodRefs',
  'humanDecisionGates',
  'terminalRecoveryReceipts',
  'acceptedExternalEvents',
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

function canonicalLedger(values, refField, label) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  const refs = values.map((item) => item?.[refField]);
  if (refs.some((ref) => typeof ref !== 'string' || !ref) || new Set(refs).size !== refs.length) {
    throw new Error(`${label} must contain unique ${refField} values`);
  }
  return values.map(clone);
}

export function buildRecoveryAggregateFingerprint(input) {
  const candidate = clone(input);
  delete candidate.semanticFingerprint;
  for (const field of ['quarantinedRefs', 'lastKnownGoodRefs']) {
    candidate[field] = canonicalRefs(candidate[field] ?? [], field);
  }
  return semanticHash(candidate);
}

export function createRecoveryAggregate(input, { registry = null } = {}) {
  const budget = input?.retryBudget ?? registry?.retryPolicy;
  const aggregate = {
    schemaVersion: 'vexlife.runtime-recovery-aggregate/v0',
    aggregateRef: input?.aggregateRef,
    workNodeRef: input?.workNodeRef,
    sourceStateFingerprint: input?.sourceStateFingerprint,
    schedulerGeneration: input?.schedulerGeneration ?? 0,
    phase: input?.phase ?? 'READY',
    activeFailure: input?.activeFailure ?? null,
    attemptLedger: canonicalLedger(input?.attemptLedger ?? [], 'attemptRef', 'attemptLedger'),
    retryBudget: clone(budget),
    checkpointLineage: canonicalLedger(input?.checkpointLineage ?? [], 'checkpointRef', 'checkpointLineage'),
    rollbackLineage: canonicalLedger(input?.rollbackLineage ?? [], 'rollbackReceiptRef', 'rollbackLineage'),
    quarantinedRefs: canonicalRefs(input?.quarantinedRefs ?? [], 'quarantinedRefs'),
    lastKnownGoodRefs: canonicalRefs(input?.lastKnownGoodRefs ?? [], 'lastKnownGoodRefs'),
    humanDecisionGates: canonicalLedger(input?.humanDecisionGates ?? [], 'decisionGateRef', 'humanDecisionGates'),
    terminalRecoveryReceipts: canonicalLedger(input?.terminalRecoveryReceipts ?? [], 'recoveryReceiptRef', 'terminalRecoveryReceipts'),
    acceptedExternalEvents: canonicalLedger(input?.acceptedExternalEvents ?? [], 'eventRef', 'acceptedExternalEvents')
  };
  const missing = ['aggregateRef', 'workNodeRef', 'sourceStateFingerprint', 'retryBudget']
    .filter((field) => aggregate[field] === undefined || aggregate[field] === null || aggregate[field] === '');
  if (missing.length) throw new Error(`recovery aggregate missing required fields: ${missing.join(', ')}`);
  assertFingerprint(aggregate.sourceStateFingerprint, 'recovery aggregate sourceStateFingerprint');
  if (!Number.isInteger(aggregate.schedulerGeneration) || aggregate.schedulerGeneration < 0) {
    throw new Error('recovery aggregate schedulerGeneration must be a non-negative integer');
  }
  if (!RECOVERY_PHASES.includes(aggregate.phase)) throw new Error('recovery aggregate phase is invalid');
  for (const field of ['maximumAttemptCount', 'maximumRepeatedIdenticalFailureCount']) {
    if (!Number.isInteger(aggregate.retryBudget?.[field]) || aggregate.retryBudget[field] < 1) {
      throw new Error(`recovery retry budget ${field} must be a positive integer`);
    }
  }
  if (!aggregate.retryBudget?.budgetRef || !aggregate.retryBudget?.maximumWallTimeClass) {
    throw new Error('recovery retry budget must be source-managed and bounded');
  }
  if (aggregate.activeFailure) {
    const validation = validateFailureEnvelope(aggregate.activeFailure, { registry });
    if (!validation.ok) throw new Error(`aggregate active failure invalid: ${validation.errors.join(', ')}`);
  }
  aggregate.semanticFingerprint = buildRecoveryAggregateFingerprint(aggregate);
  if (input?.semanticFingerprint && input.semanticFingerprint !== aggregate.semanticFingerprint) {
    throw new Error('recovery aggregate semanticFingerprint mismatch');
  }
  return freeze(aggregate);
}

export function createRecoveryCheckpoint(input) {
  const required = [
    'checkpointRef', 'workNodeRef', 'schedulerGeneration', 'sourceStateFingerprint',
    'schedulerCheckpointFingerprint', 'selectedSourceRanges', 'preservedIntentRef',
    'preservedInterpretationRef', 'preservedAuthorityRef', 'returnRouteRef',
    'leaseReleaseFingerprints', 'currentness', 'formedAt'
  ];
  const missing = required.filter((field) => input?.[field] === undefined || input?.[field] === null || input?.[field] === '');
  if (missing.length) throw new Error(`recovery checkpoint missing required fields: ${missing.join(', ')}`);
  assertFingerprint(input.sourceStateFingerprint, 'recovery checkpoint sourceStateFingerprint');
  assertFingerprint(input.schedulerCheckpointFingerprint, 'recovery checkpoint schedulerCheckpointFingerprint');
  if (!Number.isInteger(input.schedulerGeneration) || input.schedulerGeneration < 0) {
    throw new Error('recovery checkpoint schedulerGeneration must be a non-negative integer');
  }
  if (input.currentness !== 'CURRENT') throw new Error('recovery checkpoint must be CURRENT');
  parseCanonicalTimestamp(input.formedAt, 'recovery checkpoint formedAt');
  const ranges = [...input.selectedSourceRanges].map((range) => {
    if (!range?.sourceRef || !Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 || range.end < range.start) {
      throw new Error('recovery checkpoint source ranges must preserve exact non-negative bounds');
    }
    return clone(range);
  }).sort((left, right) => left.sourceRef.localeCompare(right.sourceRef) || left.start - right.start || left.end - right.end);
  const leaseKinds = ['worker', 'context', 'resource', 'capability', 'effect', 'occupancy'];
  for (const kind of leaseKinds) assertFingerprint(input.leaseReleaseFingerprints?.[kind], `recovery checkpoint ${kind} release fingerprint`);
  const checkpoint = {
    schemaVersion: 'vexlife.runtime-recovery-checkpoint/v0',
    ...clone(input),
    selectedSourceRanges: ranges,
    preservedUnknownRefs: canonicalRefs(input.preservedUnknownRefs ?? [], 'preservedUnknownRefs'),
    leaseReleaseFingerprints: Object.fromEntries(leaseKinds.map((kind) => [kind, input.leaseReleaseFingerprints[kind]]))
  };
  delete checkpoint.semanticFingerprint;
  checkpoint.semanticFingerprint = semanticHash(checkpoint);
  if (input.semanticFingerprint && input.semanticFingerprint !== checkpoint.semanticFingerprint) {
    throw new Error('recovery checkpoint semanticFingerprint mismatch');
  }
  return freeze(checkpoint);
}

export function admitRecoveryCheckpoint(checkpoint, aggregate, {
  nextSchedulerGeneration,
  currentSourceStateFingerprint
}) {
  const reasons = [];
  let canonical = null;
  try {
    canonical = createRecoveryCheckpoint(checkpoint);
  } catch (error) {
    reasons.push(`CHECKPOINT_CORRUPTED:${error.message}`);
  }
  if (canonical) {
    if (canonical.workNodeRef !== aggregate.workNodeRef) reasons.push('CHECKPOINT_CROSS_WORK');
    if (canonical.sourceStateFingerprint !== currentSourceStateFingerprint ||
        canonical.sourceStateFingerprint !== aggregate.sourceStateFingerprint) reasons.push('CHECKPOINT_SOURCE_STALE');
    if (canonical.schedulerGeneration !== aggregate.schedulerGeneration) reasons.push('CHECKPOINT_GENERATION_STALE');
    if (!Number.isInteger(nextSchedulerGeneration) || nextSchedulerGeneration <= aggregate.schedulerGeneration) {
      reasons.push('FRESH_SCHEDULER_GENERATION_REQUIRED');
    }
    if (aggregate.checkpointLineage.some((item) =>
      item.checkpointRef === canonical.checkpointRef && item.semanticFingerprint !== canonical.semanticFingerprint)) {
      reasons.push('CHECKPOINT_SAME_REF_DIFFERENT_CONTENT');
    }
  }
  const result = {
    schemaVersion: 'vexlife.runtime-recovery-checkpoint-admission/v0',
    admitted: reasons.length === 0,
    state: reasons.length ? 'BLOCKED' : 'ADMITTED',
    checkpointRef: canonical?.checkpointRef ?? checkpoint?.checkpointRef ?? null,
    checkpointFingerprint: canonical?.semanticFingerprint ?? null,
    priorSchedulerGeneration: aggregate.schedulerGeneration,
    nextSchedulerGeneration,
    reasons
  };
  result.semanticFingerprint = semanticHash(result);
  return freeze(result);
}

function appendAttempt(aggregate, attempt, options) {
  return createRecoveryAggregate({
    ...clone(aggregate),
    semanticFingerprint: undefined,
    attemptLedger: [...aggregate.attemptLedger, attempt]
  }, options);
}

function recoveryReceipt({ failure, decision, checkpoint, observedAt }) {
  const receipt = {
    schemaVersion: 'vexlife.runtime-recovery-receipt/v0',
    failureRef: failure.failureRef,
    failureFingerprint: failure.semanticFingerprint,
    decisionRef: decision.decisionRef,
    decisionFingerprint: decision.semanticFingerprint,
    action: decision.action,
    executorOutcome: decision.executorOutcome,
    checkpointRef: checkpoint?.checkpointRef ?? null,
    checkpointFingerprint: checkpoint?.semanticFingerprint ?? null,
    observedAt
  };
  receipt.semanticFingerprint = semanticHash(receipt);
  receipt.recoveryReceiptRef = `receipt.runtime-recovery.${receipt.semanticFingerprint.slice(0, 32)}`;
  return freeze(receipt);
}

export function executeWithRecoveryBoundary({
  aggregate,
  executor,
  context,
  registry,
  checkpoint = null,
  resourceAdmission = null,
  contextAdmission = null,
  authorityBoundary = 'UNCHANGED'
}) {
  if (typeof executor !== 'function') throw new Error('executor boundary requires a callable executor');
  const canonicalAggregate = createRecoveryAggregate(aggregate, { registry });
  if (canonicalAggregate.attemptLedger.some((item) => item.attemptRef === context?.attemptRef)) {
    throw new Error('attemptRef replay is prohibited');
  }
  const baseAttempt = {
    attemptRef: context?.attemptRef,
    operationRef: context?.operationRef,
    schedulerGeneration: context?.schedulerGeneration,
    startedAt: context?.startedAt,
    wallTimeClass: context?.wallTimeClass ?? canonicalAggregate.retryBudget.maximumWallTimeClass
  };
  if (!baseAttempt.attemptRef || !baseAttempt.operationRef) throw new Error('executor boundary requires exact attempt and operation refs');
  parseCanonicalTimestamp(baseAttempt.startedAt, 'attempt startedAt');
  if (baseAttempt.schedulerGeneration !== canonicalAggregate.schedulerGeneration) {
    throw new Error('executor attempt scheduler generation does not match recovery aggregate');
  }
  try {
    const value = executor(Object.freeze({ ...clone(context), aggregateFingerprint: canonicalAggregate.semanticFingerprint }));
    if (value?.partialEffectState && value.partialEffectState !== 'NONE') {
      throw Object.assign(new Error('executor reported success with a partial effect'), {
        failureClass: 'MALFORMED_INPUT_OR_RESULT',
        partialEffectState: value.partialEffectState
      });
    }
    const resultFingerprint = semanticHash(value ?? null);
    const attempt = freeze({ ...baseAttempt, outcome: 'SUCCEEDED', resultFingerprint, failureFingerprint: null });
    const next = appendAttempt(canonicalAggregate, attempt, { registry });
    const executionReceipt = {
      schemaVersion: 'vexlife.runtime-executor-boundary-receipt/v0',
      executorOutcome: 'SUCCEEDED',
      attemptRef: attempt.attemptRef,
      operationRef: attempt.operationRef,
      resultFingerprint,
      failureRef: null
    };
    executionReceipt.semanticFingerprint = semanticHash(executionReceipt);
    return freeze({ status: 'SUCCEEDED', aggregate: next, executionReceipt, value });
  } catch (error) {
    const failure = normalizeThrownFailure(error, {
      originRef: context.originRef,
      workNodeRef: canonicalAggregate.workNodeRef,
      schedulerGeneration: canonicalAggregate.schedulerGeneration,
      operationRef: baseAttempt.operationRef,
      attemptRef: baseAttempt.attemptRef,
      sourceStateFingerprint: canonicalAggregate.sourceStateFingerprint,
      expectedTransitionRef: context.expectedTransitionRef,
      observedAt: context.observedAt,
      currentness: 'CURRENT',
      evidenceRefs: context.evidenceRefs ?? []
    }, { registry });
    const failedAttempt = freeze({
      ...baseAttempt,
      outcome: 'FAILED',
      resultFingerprint: null,
      failureRef: failure.failureRef,
      failureFingerprint: failure.semanticFingerprint,
      failureRecurrenceFingerprint: failure.recurrenceFingerprint
    });
    let next = appendAttempt(canonicalAggregate, failedAttempt, { registry });
    const decision = resolveRecoveryPolicy({
      failure,
      aggregate: next,
      checkpoint,
      resourceAdmission,
      contextAdmission,
      authorityBoundary,
      observedAt: context.observedAt,
      registry
    });
    const receipt = recoveryReceipt({ failure, decision, checkpoint, observedAt: context.observedAt });
    const humanDecisionGates = decision.executorOutcome === 'FAILED_NEEDS_HUMAN'
      ? [...next.humanDecisionGates, {
          decisionGateRef: `gate.human.${failure.failureRef}`,
          failureRef: failure.failureRef,
          smallestQuestionRef: `question.runtime-recovery.${failure.failureClass}`,
          recoveryReceiptRef: receipt.recoveryReceiptRef
        }]
      : next.humanDecisionGates;
    const quarantinedRefs = decision.executorOutcome === 'FAILED_QUARANTINED'
      ? [...next.quarantinedRefs, failure.operationRef]
      : next.quarantinedRefs;
    const terminal = ['FAILED_NEEDS_HUMAN', 'FAILED_QUARANTINED', 'FAILED_BLOCKED'].includes(decision.executorOutcome)
      ? [...next.terminalRecoveryReceipts, receipt]
      : next.terminalRecoveryReceipts;
    const phase = decision.executorOutcome === 'FAILED_NEEDS_HUMAN' ? 'WAITING_HUMAN'
      : decision.executorOutcome === 'FAILED_QUARANTINED' ? 'QUARANTINED'
        : decision.executorOutcome === 'FAILED_BLOCKED' ? 'BLOCKED'
          : checkpoint ? 'RECOVERING' : 'FAILURE_ACTIVE';
    next = createRecoveryAggregate({
      ...clone(next),
      semanticFingerprint: undefined,
      phase,
      activeFailure: failure,
      checkpointLineage: checkpoint && !next.checkpointLineage.some((item) => item.checkpointRef === checkpoint.checkpointRef)
        ? [...next.checkpointLineage, checkpoint]
        : next.checkpointLineage,
      humanDecisionGates,
      quarantinedRefs,
      terminalRecoveryReceipts: terminal
    }, { registry });
    if (!EXECUTOR_OUTCOMES.includes(decision.executorOutcome)) throw new Error('policy produced invalid executor outcome');
    return freeze({
      status: decision.executorOutcome,
      aggregate: next,
      failure,
      policyDecision: decision,
      recoveryReceipt: receipt
    });
  }
}

export function closeRecoveredExecution({ aggregate, successExecution, recoveryReceipt, schedulerEvidence, completedAt, registry }) {
  if (successExecution?.status !== 'SUCCEEDED') throw new Error('recovery closure requires a successful executor boundary');
  for (const field of ['completionFingerprint', 'completionEvidenceLineageFingerprint', 'workgraphTransitionFingerprint']) {
    assertFingerprint(schedulerEvidence?.[field], `scheduler evidence ${field}`);
  }
  parseCanonicalTimestamp(completedAt, 'recovery completedAt');
  const terminal = {
    schemaVersion: 'vexlife.runtime-recovery-terminal-receipt/v0',
    priorRecoveryReceiptRef: recoveryReceipt.recoveryReceiptRef,
    priorRecoveryReceiptFingerprint: recoveryReceipt.semanticFingerprint,
    successExecutionFingerprint: successExecution.executionReceipt.semanticFingerprint,
    schedulerCompletionFingerprint: schedulerEvidence.completionFingerprint,
    schedulerCompletionEvidenceLineageFingerprint: schedulerEvidence.completionEvidenceLineageFingerprint,
    schedulerWorkgraphTransitionFingerprint: schedulerEvidence.workgraphTransitionFingerprint,
    finalOutcome: 'SUCCEEDED',
    completedAt
  };
  terminal.semanticFingerprint = semanticHash(terminal);
  terminal.recoveryReceiptRef = `receipt.runtime-recovery.terminal.${terminal.semanticFingerprint.slice(0, 32)}`;
  const next = createRecoveryAggregate({
    ...clone(successExecution.aggregate),
    semanticFingerprint: undefined,
    phase: 'COMPLETED',
    activeFailure: null,
    terminalRecoveryReceipts: [...successExecution.aggregate.terminalRecoveryReceipts, terminal]
  }, { registry });
  return freeze({ aggregate: next, terminalReceipt: freeze(terminal) });
}

export function recoverContextBudget({
  workNodeRef,
  checkpointRef,
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
  clarificationRef = null
}) {
  for (const field of ['inputTokenEstimate', 'reservedOutputTokens', 'hardTokenLimit']) {
    if (!Number.isInteger(arguments[0][field]) || arguments[0][field] < 0) throw new Error(`${field} must be a non-negative integer`);
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
  const coverage = ranges.map(({ sourceRef, start, end }) => ({ sourceRef, start, end }));
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
  const plan = {
    schemaVersion: 'vexlife.runtime-context-recovery-plan/v0',
    workNodeRef,
    checkpointRef,
    state,
    action,
    modelInvoked: false,
    invisibleTruncation: false,
    sourceHistoryDeleted: false,
    immutableSourceCoverage: coverage,
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
    clarificationRef
  };
  plan.semanticFingerprint = semanticHash(plan);
  return freeze(plan);
}

export function recordExternalRecoveryEvent(aggregate, event, { registry = null } = {}) {
  if (!event?.eventRef || !event?.workNodeRef || !Number.isInteger(event?.schedulerGeneration)) {
    throw new Error('external recovery event requires exact ref, work node and generation');
  }
  const canonical = clone(event);
  delete canonical.semanticFingerprint;
  canonical.semanticFingerprint = semanticHash(canonical);
  if (event.semanticFingerprint && event.semanticFingerprint !== canonical.semanticFingerprint) {
    throw new Error('external recovery event fingerprint mismatch');
  }
  const existing = aggregate.acceptedExternalEvents.find((item) => item.eventRef === event.eventRef);
  if (existing) {
    if (existing.semanticFingerprint !== canonical.semanticFingerprint) {
      throw new Error('same-ref/different-content external recovery event rejected');
    }
    return freeze({ changed: false, aggregate, reason: 'DUPLICATE_EVENT_REJECTED_ONCE_ONLY' });
  }
  if (event.workNodeRef !== aggregate.workNodeRef || event.schedulerGeneration !== aggregate.schedulerGeneration) {
    return freeze({ changed: false, aggregate, reason: 'STALE_OR_CROSS_WORK_EVENT_REJECTED' });
  }
  const next = createRecoveryAggregate({
    ...clone(aggregate),
    semanticFingerprint: undefined,
    acceptedExternalEvents: [...aggregate.acceptedExternalEvents, canonical]
  }, { registry });
  return freeze({ changed: true, aggregate: next, reason: 'EVENT_ACCEPTED_ONCE' });
}

export function projectRecoveryAggregate(aggregate, { priorProjection = null } = {}) {
  const active = aggregate.activeFailure;
  const terminal = aggregate.terminalRecoveryReceipts.at(-1) ?? null;
  const projection = {
    schemaVersion: 'vexlife.runtime-recovery-projection/v0',
    aggregateRef: aggregate.aggregateRef,
    aggregateFingerprint: aggregate.semanticFingerprint,
    queue: {
      state: aggregate.phase,
      workNodeRef: aggregate.workNodeRef,
      retryAttempts: aggregate.attemptLedger.length,
      nextSafeAction: active ? terminal?.action ?? 'FOLLOW_SOURCE_MANAGED_RECOVERY' : aggregate.phase === 'COMPLETED' ? 'NONE' : 'EXECUTE_ADMITTED_WORK'
    },
    terrain: {
      recoveryNodeState: aggregate.phase,
      checkpointCount: aggregate.checkpointLineage.length,
      rollbackCount: aggregate.rollbackLineage.length,
      quarantinedCount: aggregate.quarantinedRefs.length
    },
    health: {
      state: aggregate.phase === 'COMPLETED' ? 'CLEAR'
        : aggregate.phase === 'BLOCKED' ? 'BLOCKED'
          : ['QUARANTINED', 'WAITING_HUMAN'].includes(aggregate.phase) ? 'ATTENTION' : active ? 'ATTENTION' : 'CLEAR',
      activeFailureRef: active?.failureRef ?? null,
      partialEffectState: active?.partialEffectState ?? 'NONE',
      evidenceRefs: active?.evidenceRefs ?? []
    },
    guide: {
      whatFailed: active?.failureClass ?? null,
      whatWasPreserved: aggregate.checkpointLineage.at(-1)?.checkpointRef ?? null,
      isRetrySafe: active ? terminal?.executorOutcome === 'FAILED_RECOVERABLE' : null,
      recoveryRoute: terminal?.action ?? null,
      waitingOn: aggregate.phase === 'WAITING_HUMAN' ? aggregate.humanDecisionGates.at(-1)?.decisionGateRef ?? null : null,
      victorNeeded: aggregate.phase === 'WAITING_HUMAN',
      remainsBlocked: aggregate.phase === 'BLOCKED'
    }
  };
  projection.semanticFingerprint = semanticHash(projection);
  if (priorProjection?.semanticFingerprint === projection.semanticFingerprint) {
    return freeze({ changed: false, projection: priorProjection, reason: 'SEMANTIC_NO_OP' });
  }
  return freeze({ changed: true, projection: freeze(projection), reason: 'RECOVERY_PROJECTION_CHANGED' });
}

export function serializeRecoveryAggregate(aggregate) {
  return JSON.stringify(createRecoveryAggregate(aggregate));
}

export function restoreRecoveryAggregate(serialized, options = {}) {
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new Error(`recovery aggregate is not valid JSON: ${error.message}`);
  }
  return createRecoveryAggregate(parsed, options);
}

export function createUnknownFailureForMalformedInput(input, context, options = {}) {
  return createFailureEnvelope({
    ...context,
    error: new Error(`malformed runtime failure input: ${semanticHash(input).slice(0, 16)}`),
    failureClass: 'UNKNOWN_FAILURE',
    partialEffectState: 'UNKNOWN',
    humanAttentionClass: 'DECISION_REQUIRED'
  }, options);
}

// [VXG RealForever]
