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
  if (failure.partialEffectState === 'CONFIRMED_IRREVERSIBLE') return 'QUARANTINE_ADAPTER_OR_ARTIFACT';
  if (['CONFIRMED_REVERSIBLE', 'POSSIBLE'].includes(failure.partialEffectState)) return 'ROLLBACK_TO_BEFORE_IMAGE';
  switch (failure.failureClass) {
    case 'CONTEXT_BUDGET_EXCEEDED': return 'CONDENSE_CONTEXT_AND_REACQUIRE';
    case 'MODEL_TIMEOUT_SIMULATED': return 'RETRY_SAME_BUDGET';
    case 'RESOURCE_EXHAUSTION_SIMULATED': return 'RETRY_REDUCED_BUDGET';
    case 'PROCESS_TERMINATED_SIMULATED': return 'RESTORE_LAST_KNOWN_GOOD';
    case 'DISK_FULL_SIMULATED': return 'CHECKPOINT_AND_WAIT';
    case 'NETWORK_INTERRUPTION_SIMULATED': return 'CHECKPOINT_AND_WAIT';
    case 'PARTIAL_WRITE_SIMULATED': return 'ROLLBACK_TO_BEFORE_IMAGE';
    case 'DUPLICATE_OR_REPLAYED_EVENT': return 'TERMINAL_BLOCK';
    case 'STALE_OR_CORRUPTED_CHECKPOINT': return 'TERMINAL_BLOCK';
    case 'ROLLBACK_FAILED_SIMULATED': return 'QUARANTINE_ADAPTER_OR_ARTIFACT';
    case 'UNKNOWN_FAILURE': return 'REQUEST_HUMAN_DECISION';
    case 'INVALID_INDEX_OR_BOUNDS':
    case 'INVALID_STATE_TRANSITION':
    case 'MALFORMED_INPUT_OR_RESULT': return 'REQUEST_HUMAN_DECISION';
    default: return 'CHECKPOINT_AND_WAIT';
  }
}

export function resolveRecoveryPolicy({
  failure,
  aggregate,
  checkpoint = null,
  resourceAdmission = null,
  contextAdmission = null,
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
  const budget = aggregate?.retryBudget ?? registry?.retryPolicy;
  if (!budget) throw new Error('recovery policy requires source-managed retry budget');
  const attempts = aggregate?.attemptLedger?.length ?? 0;
  const repeated = matchingAttempts(aggregate, failure).length;
  let action = policyAction(failure);
  const reasons = [`FAILURE_CLASS:${failure.failureClass}`];

  if (authorityBoundary !== 'UNCHANGED') {
    action = 'TERMINAL_BLOCK';
    reasons.push('AUTHORITY_BOUNDARY_CHANGED');
  } else if (attempts >= budget.maximumAttemptCount) {
    action = failure.humanAttentionClass === 'NONE' ? 'TERMINAL_BLOCK' : 'REQUEST_HUMAN_DECISION';
    reasons.push('MAXIMUM_ATTEMPT_COUNT_REACHED');
  } else if (repeated >= budget.maximumRepeatedIdenticalFailureCount) {
    action = failure.partialEffectState === 'NONE' ? 'REQUEST_HUMAN_DECISION' : 'QUARANTINE_ADAPTER_OR_ARTIFACT';
    reasons.push('IDENTICAL_FAILURE_RECURRENCE_THRESHOLD_REACHED');
  }

  if (failure.failureClass === 'RESOURCE_EXHAUSTION_SIMULATED' && resourceAdmission?.admitted === false) {
    action = resourceAdmission.reducedBudgetAdmitted ? 'RETRY_REDUCED_BUDGET' : 'CHECKPOINT_AND_WAIT';
    reasons.push('CURRENT_RESOURCE_ADMISSION_REQUIRED');
  }
  if (failure.failureClass === 'CONTEXT_BUDGET_EXCEEDED' && contextAdmission?.fits === false) {
    action = contextAdmission.canCondense ? 'CONDENSE_CONTEXT_AND_REACQUIRE'
      : contextAdmission.canSplit ? 'SPLIT_WORK_NODE'
        : contextAdmission.clarificationRef ? 'REQUEST_HUMAN_DECISION' : 'TERMINAL_BLOCK';
    reasons.push('CURRENT_CONTEXT_ADMISSION_REQUIRED');
  }

  let retryAuthorized = RETRY_ACTIONS.has(action);
  if (retryAuthorized) {
    const checkpointCurrent = checkpoint?.currentness === 'CURRENT' &&
      checkpoint.workNodeRef === failure.workNodeRef &&
      checkpoint.sourceStateFingerprint === failure.sourceStateFingerprint &&
      checkpoint.schedulerGeneration === failure.schedulerGeneration;
    if (!checkpointCurrent) {
      action = 'CHECKPOINT_AND_WAIT';
      retryAuthorized = false;
      reasons.push('CURRENT_EXACT_CHECKPOINT_REQUIRED');
    } else {
      reasons.push('CURRENT_EXACT_CHECKPOINT_PRESENT');
    }
  }

  const decision = {
    schemaVersion: 'vexlife.runtime-recovery-policy-decision/v0',
    failureRef: failure.failureRef,
    failureFingerprint: failure.semanticFingerprint,
    action,
    executorOutcome: outcomeFor(action),
    retryAuthorized,
    retryBudgetRef: budget.budgetRef,
    attemptCount: attempts,
    identicalFailureCount: repeated,
    maximumAttemptCount: budget.maximumAttemptCount,
    maximumRepeatedIdenticalFailureCount: budget.maximumRepeatedIdenticalFailureCount,
    maximumWallTimeClass: budget.maximumWallTimeClass,
    authorityBoundary,
    observedAt,
    reasons
  };
  decision.semanticFingerprint = semanticHash(decision);
  decision.decisionRef = `decision.runtime-recovery.${decision.semanticFingerprint.slice(0, 32)}`;
  return Object.freeze(decision);
}

// [VXG RealForever]
