import { parseCanonicalTimestamp } from './scheduler-runtime-trust.mjs';
import { validateFailureEnvelope } from './runtime-failure.mjs';
import { semanticHash } from './utils.mjs';

export const RECOVERY_ACTIONS = Object.freeze([
  'RETRY_SAME_BUDGET',
  'RETRY_REDUCED_BUDGET',
  'CHECKPOINT_AND_WAIT',
  'CONDENSE_CONTEXT_AND_REACQUIRE',
  'SPLIT_WORK_NODE',
  'ROLLBACK_TO_BEFORE_IMAGE',
  'RESTORE_LAST_KNOWN_GOOD',
  'QUARANTINE_ADAPTER_OR_ARTIFACT',
  'REQUEST_HUMAN_DECISION',
  'TERMINAL_BLOCK'
]);

export const EXECUTOR_OUTCOMES = Object.freeze([
  'SUCCEEDED',
  'FAILED_RECOVERABLE',
  'FAILED_NEEDS_HUMAN',
  'FAILED_QUARANTINED',
  'FAILED_BLOCKED'
]);

const RETRY_ACTIONS = new Set(['RETRY_SAME_BUDGET', 'RETRY_REDUCED_BUDGET']);
const CONSEQUENT_RECOVERY_ACTIONS = new Set([
  ...RETRY_ACTIONS,
  'CONDENSE_CONTEXT_AND_REACQUIRE',
  'SPLIT_WORK_NODE',
  'ROLLBACK_TO_BEFORE_IMAGE',
  'RESTORE_LAST_KNOWN_GOOD',
  'QUARANTINE_ADAPTER_OR_ARTIFACT'
]);

function clone(value) {
  return structuredClone(value);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function outcomeFor(action) {
  if (action === 'REQUEST_HUMAN_DECISION') return 'FAILED_NEEDS_HUMAN';
  if (action === 'QUARANTINE_ADAPTER_OR_ARTIFACT') return 'FAILED_QUARANTINED';
  if (action === 'TERMINAL_BLOCK') return 'FAILED_BLOCKED';
  return 'FAILED_RECOVERABLE';
}

function matchingAttempts(aggregate, failure) {
  return (aggregate?.attemptLedger ?? []).filter((item) =>
    item.failureRecurrenceFingerprint === failure.recurrenceFingerprint
  );
}

function policyAction(failure) {
  switch (failure.failureClass) {
    case 'PARTIAL_WRITE_SIMULATED': return 'ROLLBACK_TO_BEFORE_IMAGE';
    case 'ROLLBACK_FAILED_SIMULATED': return 'QUARANTINE_ADAPTER_OR_ARTIFACT';
    case 'DISK_FULL_SIMULATED':
    case 'NETWORK_INTERRUPTION_SIMULATED': return 'CHECKPOINT_AND_WAIT';
    case 'PROCESS_TERMINATED_SIMULATED': return 'RESTORE_LAST_KNOWN_GOOD';
    default: break;
  }
  if (failure.partialEffectState === 'CONFIRMED_IRREVERSIBLE') return 'QUARANTINE_ADAPTER_OR_ARTIFACT';
  if (['CONFIRMED_REVERSIBLE', 'POSSIBLE', 'UNKNOWN'].includes(failure.partialEffectState)) {
    return 'ROLLBACK_TO_BEFORE_IMAGE';
  }
  switch (failure.failureClass) {
    case 'CONTEXT_BUDGET_EXCEEDED': return 'CONDENSE_CONTEXT_AND_REACQUIRE';
    case 'MODEL_TIMEOUT_SIMULATED': return 'RETRY_SAME_BUDGET';
    case 'RESOURCE_EXHAUSTION_SIMULATED': return 'RETRY_REDUCED_BUDGET';
    case 'DUPLICATE_OR_REPLAYED_EVENT': return 'TERMINAL_BLOCK';
    case 'STALE_OR_CORRUPTED_CHECKPOINT': return 'TERMINAL_BLOCK';
    case 'UNKNOWN_FAILURE': return 'REQUEST_HUMAN_DECISION';
    case 'INVALID_INDEX_OR_BOUNDS':
    case 'INVALID_STATE_TRANSITION':
    case 'MALFORMED_INPUT_OR_RESULT': return 'REQUEST_HUMAN_DECISION';
    default: return 'CHECKPOINT_AND_WAIT';
  }
}

function validateContentAddressedReceipt(value, {
  schemaVersion,
  refField,
  label
}) {
  if (!value || value.schemaVersion !== schemaVersion || !value[refField]) {
    throw new Error(`${label} is missing or has the wrong schema`);
  }
  const candidate = clone(value);
  delete candidate.semanticFingerprint;
  delete candidate[refField];
  const fingerprint = semanticHash(candidate);
  if (fingerprint !== value.semanticFingerprint || !value[refField].endsWith(fingerprint.slice(0, 32))) {
    throw new Error(`${label} content-addressed identity mismatch`);
  }
  return value;
}

function validateCheckpointAdmission(value, aggregate, failure) {
  const canonical = validateContentAddressedReceipt(value, {
    schemaVersion: 'vexlife.runtime-recovery-checkpoint-admission/v1',
    refField: 'admissionRef',
    label: 'checkpoint admission receipt'
  });
  if (!canonical.admitted || canonical.state !== 'ADMITTED' || canonical.currentness !== 'CURRENT' ||
      canonical.aggregateRef !== aggregate.aggregateRef ||
      canonical.workNodeRef !== aggregate.workNodeRef ||
      canonical.sourceStateFingerprint !== aggregate.sourceStateFingerprint ||
      canonical.failureFingerprint !== failure.semanticFingerprint ||
      !canonical.schedulerConsumptionRef || !canonical.schedulerConsumptionFingerprint ||
      !canonical.onceOnlyActivationRef || canonical.leaseReleaseFingerprints?.length !== 6 ||
      canonical.priorSchedulerGeneration !== aggregate.schedulerGeneration ||
      canonical.nextSchedulerGeneration <= canonical.priorSchedulerGeneration) {
    throw new Error('checkpoint admission is not exact current recovery evidence');
  }
  return canonical;
}

function validateSourceAdmission(value, aggregate, failure, kind) {
  const schemas = {
    context: ['vexlife.runtime-context-recovery-receipt/v1', 'contextRecoveryReceiptRef'],
    resource: ['vexlife.runtime-resource-recovery-receipt/v1', 'resourceRecoveryReceiptRef']
  };
  const [schemaVersion, refField] = schemas[kind];
  const canonical = validateContentAddressedReceipt(value, {
    schemaVersion,
    refField,
    label: `${kind} recovery admission receipt`
  });
  if (canonical.currentness !== 'CURRENT' || canonical.workNodeRef !== aggregate.workNodeRef ||
      canonical.sourceStateFingerprint !== aggregate.sourceStateFingerprint ||
      canonical.failureFingerprint !== failure.semanticFingerprint) {
    throw new Error(`${kind} recovery admission is stale or detached`);
  }
  return canonical;
}

export function validateRecoveryPolicyDecision(value) {
  return validateContentAddressedReceipt(value, {
    schemaVersion: 'vexlife.runtime-recovery-policy-decision/v1',
    refField: 'decisionRef',
    label: 'recovery policy decision'
  });
}

export function resolveRecoveryPolicy({
  failure,
  aggregate,
  checkpointAdmission = null,
  resourceAdmissionReceipt = null,
  contextAdmissionReceipt = null,
  authorityBoundary = 'UNCHANGED',
  observedAt,
  registry,
  callerPreferredAction
}) {
  if (callerPreferredAction !== undefined) {
    throw new Error('caller-authored recovery authority is prohibited');
  }
  const validation = validateFailureEnvelope(failure, { registry });
  if (!validation.ok) throw new Error(`recovery policy requires a canonical failure: ${validation.errors.join(', ')}`);
  if (aggregate?.activeFailure?.semanticFingerprint !== failure.semanticFingerprint) {
    throw new Error('recovery policy failure is not active in the canonical aggregate');
  }
  const budget = registry?.retryPolicy;
  if (!budget) throw new Error('recovery policy requires the registry retry budget');
  const budgetFingerprint = semanticHash(budget);
  if (aggregate.retryBudgetFingerprint !== budgetFingerprint ||
      semanticHash(aggregate.retryBudget) !== budgetFingerprint) {
    throw new Error('recovery policy rejected substituted or reset retry budget');
  }
  const observedEpoch = parseCanonicalTimestamp(observedAt, 'recovery policy observedAt');
  const attempts = aggregate.attemptLedger.length;
  const repeated = matchingAttempts(aggregate, failure).length;
  const firstStart = aggregate.attemptLedger[0]?.startedAt;
  const totalElapsedMs = firstStart ? observedEpoch - parseCanonicalTimestamp(firstStart, 'first attempt startedAt') : 0;
  let action = policyAction(failure);
  const reasons = [`FAILURE_CLASS:${failure.failureClass}`, 'REGISTRY_BUDGET_EXACT'];
  let exactCheckpoint = null;
  let exactContext = null;
  let exactResource = null;

  if (checkpointAdmission) exactCheckpoint = validateCheckpointAdmission(checkpointAdmission, aggregate, failure);
  if (contextAdmissionReceipt) exactContext = validateSourceAdmission(contextAdmissionReceipt, aggregate, failure, 'context');
  if (resourceAdmissionReceipt) exactResource = validateSourceAdmission(resourceAdmissionReceipt, aggregate, failure, 'resource');

  if (authorityBoundary !== 'UNCHANGED') {
    action = 'TERMINAL_BLOCK';
    reasons.push('AUTHORITY_BOUNDARY_CHANGED');
  } else if (totalElapsedMs > budget.maximumTotalWallTimeMs) {
    action = failure.humanAttentionClass === 'NONE' ? 'TERMINAL_BLOCK' : 'REQUEST_HUMAN_DECISION';
    reasons.push('MAXIMUM_TOTAL_WALL_TIME_REACHED');
  } else if (attempts >= budget.maximumAttemptCount) {
    action = failure.humanAttentionClass === 'NONE' ? 'TERMINAL_BLOCK' : 'REQUEST_HUMAN_DECISION';
    reasons.push('MAXIMUM_ATTEMPT_COUNT_REACHED');
  } else if (repeated >= budget.maximumRepeatedIdenticalFailureCount) {
    action = failure.partialEffectState === 'NONE' ? 'REQUEST_HUMAN_DECISION' : 'QUARANTINE_ADAPTER_OR_ARTIFACT';
    reasons.push('IDENTICAL_FAILURE_RECURRENCE_THRESHOLD_REACHED');
  }

  if (failure.failureClass === 'RESOURCE_EXHAUSTION_SIMULATED') {
    if (!exactResource) {
      action = 'CHECKPOINT_AND_WAIT';
      reasons.push('EXACT_CURRENT_RESOURCE_RECOVERY_RECEIPT_REQUIRED');
    } else {
      action = exactResource.reducedBudgetAdmitted ? 'RETRY_REDUCED_BUDGET' : 'CHECKPOINT_AND_WAIT';
      reasons.push('EXACT_CURRENT_RESOURCE_RECOVERY_RECEIPT_CONSUMED');
    }
  }
  if (failure.failureClass === 'CONTEXT_BUDGET_EXCEEDED') {
    if (!exactContext) {
      action = 'CHECKPOINT_AND_WAIT';
      reasons.push('EXACT_CURRENT_CONTEXT_RECOVERY_RECEIPT_REQUIRED');
    } else {
      action = exactContext.action;
      reasons.push('EXACT_CURRENT_CONTEXT_RECOVERY_RECEIPT_CONSUMED');
    }
  }

  let actionAuthorized = true;
  if (CONSEQUENT_RECOVERY_ACTIONS.has(action)) {
    if (!exactCheckpoint) {
      action = 'CHECKPOINT_AND_WAIT';
      actionAuthorized = false;
      reasons.push('EXACT_CURRENT_CHECKPOINT_ADMISSION_REQUIRED');
    } else {
      reasons.push('EXACT_CURRENT_CHECKPOINT_ADMISSION_CONSUMED');
    }
  }
  const retryAuthorized = RETRY_ACTIONS.has(action) && actionAuthorized;
  const decision = {
    schemaVersion: 'vexlife.runtime-recovery-policy-decision/v1',
    failureRef: failure.failureRef,
    failureFingerprint: failure.semanticFingerprint,
    action,
    executorOutcome: outcomeFor(action),
    actionAuthorized,
    retryAuthorized,
    retryBudgetRef: budget.budgetRef,
    retryBudgetFingerprint: budgetFingerprint,
    attemptCount: attempts,
    identicalFailureCount: repeated,
    maximumAttemptCount: budget.maximumAttemptCount,
    maximumRepeatedIdenticalFailureCount: budget.maximumRepeatedIdenticalFailureCount,
    maximumWallTimeClass: budget.maximumWallTimeClass,
    maximumWallTimeMs: budget.maximumWallTimeMs,
    maximumTotalWallTimeMs: budget.maximumTotalWallTimeMs,
    observedTotalWallTimeMs: totalElapsedMs,
    checkpointAdmissionRef: exactCheckpoint?.admissionRef ?? null,
    checkpointAdmissionFingerprint: exactCheckpoint?.semanticFingerprint ?? null,
    contextAdmissionRef: exactContext?.contextRecoveryReceiptRef ?? null,
    contextAdmissionFingerprint: exactContext?.semanticFingerprint ?? null,
    resourceAdmissionRef: exactResource?.resourceRecoveryReceiptRef ?? null,
    resourceAdmissionFingerprint: exactResource?.semanticFingerprint ?? null,
    authorityBoundary,
    observedAt,
    reasons
  };
  decision.semanticFingerprint = semanticHash(decision);
  decision.decisionRef = `decision.runtime-recovery.${decision.semanticFingerprint.slice(0, 32)}`;
  return freeze(decision);
}

// [VXG RealForever]
