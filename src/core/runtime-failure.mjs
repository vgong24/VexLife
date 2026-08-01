import { parseCanonicalTimestamp } from './scheduler-runtime-trust.mjs';
import { semanticHash } from './utils.mjs';

export const FAILURE_CLASSES = Object.freeze([
  'UNEXPECTED_EXCEPTION',
  'INVALID_INDEX_OR_BOUNDS',
  'INVALID_STATE_TRANSITION',
  'MALFORMED_INPUT_OR_RESULT',
  'CONTEXT_BUDGET_EXCEEDED',
  'MODEL_TIMEOUT_SIMULATED',
  'RESOURCE_EXHAUSTION_SIMULATED',
  'PROCESS_TERMINATED_SIMULATED',
  'DISK_FULL_SIMULATED',
  'PARTIAL_WRITE_SIMULATED',
  'NETWORK_INTERRUPTION_SIMULATED',
  'DUPLICATE_OR_REPLAYED_EVENT',
  'STALE_OR_CORRUPTED_CHECKPOINT',
  'ROLLBACK_FAILED_SIMULATED',
  'UNKNOWN_FAILURE'
]);

export const RETRIABLE_CLASSES = Object.freeze([
  'RETRY_WITH_CURRENT_ADMISSION',
  'RETRY_REDUCED_BUDGET',
  'RECOVER_BEFORE_RETRY',
  'NOT_RETRIABLE',
  'UNKNOWN_REQUIRES_DECISION'
]);

export const PARTIAL_EFFECT_STATES = Object.freeze([
  'NONE',
  'POSSIBLE',
  'CONFIRMED_REVERSIBLE',
  'CONFIRMED_IRREVERSIBLE',
  'UNKNOWN'
]);

export const HUMAN_ATTENTION_CLASSES = Object.freeze([
  'NONE',
  'ONLY_IF_RECOVERY_EXHAUSTED',
  'DECISION_REQUIRED',
  'IMMEDIATE'
]);

export const FAILURE_ENVELOPE_REQUIRED_FIELDS = Object.freeze([
  'failureRef',
  'failureClass',
  'originRef',
  'workNodeRef',
  'schedulerGeneration',
  'operationRef',
  'attemptRef',
  'sourceStateFingerprint',
  'expectedTransitionRef',
  'observedAt',
  'currentness',
  'retriableClass',
  'partialEffectState',
  'humanAttentionClass',
  'classificationSourceRef',
  'classificationEvidenceFingerprint',
  'evidenceRefs',
  'semanticFingerprint'
]);

const CLASS_DEFAULTS = Object.freeze({
  UNEXPECTED_EXCEPTION: ['RECOVER_BEFORE_RETRY', 'UNKNOWN', 'ONLY_IF_RECOVERY_EXHAUSTED'],
  INVALID_INDEX_OR_BOUNDS: ['NOT_RETRIABLE', 'NONE', 'DECISION_REQUIRED'],
  INVALID_STATE_TRANSITION: ['NOT_RETRIABLE', 'NONE', 'DECISION_REQUIRED'],
  MALFORMED_INPUT_OR_RESULT: ['NOT_RETRIABLE', 'UNKNOWN', 'DECISION_REQUIRED'],
  CONTEXT_BUDGET_EXCEEDED: ['RETRY_REDUCED_BUDGET', 'NONE', 'NONE'],
  MODEL_TIMEOUT_SIMULATED: ['RETRY_WITH_CURRENT_ADMISSION', 'NONE', 'ONLY_IF_RECOVERY_EXHAUSTED'],
  RESOURCE_EXHAUSTION_SIMULATED: ['RETRY_REDUCED_BUDGET', 'NONE', 'ONLY_IF_RECOVERY_EXHAUSTED'],
  PROCESS_TERMINATED_SIMULATED: ['RECOVER_BEFORE_RETRY', 'UNKNOWN', 'ONLY_IF_RECOVERY_EXHAUSTED'],
  DISK_FULL_SIMULATED: ['RECOVER_BEFORE_RETRY', 'POSSIBLE', 'ONLY_IF_RECOVERY_EXHAUSTED'],
  PARTIAL_WRITE_SIMULATED: ['RECOVER_BEFORE_RETRY', 'CONFIRMED_REVERSIBLE', 'ONLY_IF_RECOVERY_EXHAUSTED'],
  NETWORK_INTERRUPTION_SIMULATED: ['RETRY_WITH_CURRENT_ADMISSION', 'UNKNOWN', 'ONLY_IF_RECOVERY_EXHAUSTED'],
  DUPLICATE_OR_REPLAYED_EVENT: ['NOT_RETRIABLE', 'NONE', 'NONE'],
  STALE_OR_CORRUPTED_CHECKPOINT: ['NOT_RETRIABLE', 'NONE', 'DECISION_REQUIRED'],
  ROLLBACK_FAILED_SIMULATED: ['NOT_RETRIABLE', 'UNKNOWN', 'IMMEDIATE'],
  UNKNOWN_FAILURE: ['UNKNOWN_REQUIRES_DECISION', 'UNKNOWN', 'DECISION_REQUIRED']
});

function clone(value) {
  return structuredClone(value);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function canonicalRefs(values, label = 'evidenceRefs') {
  if (!Array.isArray(values) || values.some((item) => typeof item !== 'string' || !item)) {
    throw new Error(`${label} must contain only stable refs`);
  }
  return [...new Set(values)].sort();
}

function assertFingerprint(value, label) {
  if (!/^[a-f0-9]{64}$/.test(String(value ?? ''))) throw new Error(`${label} must be a SHA-256 fingerprint`);
}

function canonicalErrorEvidence(error) {
  const evidence = {
    name: typeof error?.name === 'string' && error.name ? error.name : 'UnknownThrownValue',
    code: typeof error?.code === 'string' && error.code ? error.code : null,
    message: typeof error?.message === 'string' ? error.message : String(error ?? 'unknown failure')
  };
  evidence.evidenceFingerprint = semanticHash(evidence);
  return evidence;
}

export function createSourceManagedFailureEvidence({
  failureClass,
  sourceRef,
  error,
  currentness = 'CURRENT'
}) {
  if (!FAILURE_CLASSES.includes(failureClass)) throw new Error('source-managed failure evidence class is invalid');
  if (!sourceRef) throw new Error('source-managed failure evidence requires sourceRef');
  if (currentness !== 'CURRENT') throw new Error('source-managed failure evidence must be CURRENT');
  const errorEvidence = canonicalErrorEvidence(error);
  const evidence = {
    schemaVersion: 'vexlife.runtime-failure-classification-evidence/v0',
    failureClass,
    sourceRef,
    errorEvidenceFingerprint: errorEvidence.evidenceFingerprint,
    currentness
  };
  evidence.semanticFingerprint = semanticHash(evidence);
  evidence.evidenceRef = `evidence.runtime-failure.classification.${evidence.semanticFingerprint.slice(0, 32)}`;
  return freeze(evidence);
}

function canonicalClassification(input, errorEvidence, error) {
  const supplied = error?.sourceManagedFailureEvidence ?? input?.sourceManagedFailureEvidence ?? null;
  if (supplied) {
    const canonical = createSourceManagedFailureEvidence({
      failureClass: supplied.failureClass,
      sourceRef: supplied.sourceRef,
      error,
      currentness: supplied.currentness
    });
    if (canonical.errorEvidenceFingerprint !== errorEvidence.evidenceFingerprint ||
        canonical.semanticFingerprint !== supplied.semanticFingerprint ||
        canonical.evidenceRef !== supplied.evidenceRef) {
      throw new Error('source-managed failure classification evidence mismatch');
    }
    return canonical;
  }
  if (FAILURE_CLASSES.includes(input?.failureClass) && input?.classificationSourceRef &&
      input?.classificationEvidenceFingerprint) {
    const canonical = createSourceManagedFailureEvidence({
      failureClass: input.failureClass,
      sourceRef: input.classificationSourceRef,
      error: error ?? input.errorEvidence,
      currentness: 'CURRENT'
    });
    if (canonical.errorEvidenceFingerprint !== errorEvidence.evidenceFingerprint ||
        canonical.semanticFingerprint !== input.classificationEvidenceFingerprint) {
      throw new Error('failure classification evidence fingerprint mismatch');
    }
    return canonical;
  }
  const fallback = {
    failureClass: error instanceof Error ? 'UNEXPECTED_EXCEPTION' : 'UNKNOWN_FAILURE',
    sourceRef: 'source.runtime-recovery.default-unexpected',
    errorEvidenceFingerprint: errorEvidence.evidenceFingerprint,
    currentness: 'CURRENT'
  };
  fallback.semanticFingerprint = semanticHash(fallback);
  fallback.evidenceRef = `evidence.runtime-failure.classification.${fallback.semanticFingerprint.slice(0, 32)}`;
  return freeze(fallback);
}

const RETRIABLE_SEVERITY = Object.freeze({
  RETRY_WITH_CURRENT_ADMISSION: 0,
  RETRY_REDUCED_BUDGET: 1,
  RECOVER_BEFORE_RETRY: 2,
  UNKNOWN_REQUIRES_DECISION: 3,
  NOT_RETRIABLE: 4
});
const PARTIAL_EFFECT_SEVERITY = Object.freeze({
  NONE: 0,
  POSSIBLE: 1,
  CONFIRMED_REVERSIBLE: 2,
  UNKNOWN: 3,
  CONFIRMED_IRREVERSIBLE: 4
});
const HUMAN_ATTENTION_SEVERITY = Object.freeze({
  NONE: 0,
  ONLY_IF_RECOVERY_EXHAUSTED: 1,
  DECISION_REQUIRED: 2,
  IMMEDIATE: 3
});

function noWeaker(supplied, sourceManaged, vocabulary, severity) {
  if (!vocabulary.includes(supplied)) return sourceManaged;
  return severity[supplied] > severity[sourceManaged] ? supplied : sourceManaged;
}

export function buildFailureFingerprint(input) {
  const candidate = clone(input);
  delete candidate.failureRef;
  delete candidate.semanticFingerprint;
  candidate.evidenceRefs = canonicalRefs(candidate.evidenceRefs ?? []);
  return semanticHash(candidate);
}

export function createFailureEnvelope(input, { registry = null } = {}) {
  const error = input?.error;
  const errorEvidence = canonicalErrorEvidence(error ?? input?.errorEvidence ?? 'unknown failure');
  const classification = canonicalClassification(input, errorEvidence, error ?? input?.errorEvidence);
  const failureClass = classification.failureClass;
  const defaults = CLASS_DEFAULTS[failureClass] ?? CLASS_DEFAULTS.UNKNOWN_FAILURE;
  const candidate = {
    schemaVersion: 'vexlife.runtime-failure-envelope/v1',
    failureClass,
    originRef: input?.originRef,
    workNodeRef: input?.workNodeRef,
    schedulerGeneration: input?.schedulerGeneration,
    operationRef: input?.operationRef,
    attemptRef: input?.attemptRef,
    sourceStateFingerprint: input?.sourceStateFingerprint,
    expectedTransitionRef: input?.expectedTransitionRef,
    observedAt: input?.observedAt,
    currentness: input?.currentness ?? 'CURRENT',
    retriableClass: noWeaker(input?.retriableClass, defaults[0], RETRIABLE_CLASSES, RETRIABLE_SEVERITY),
    partialEffectState: noWeaker(input?.partialEffectState, defaults[1], PARTIAL_EFFECT_STATES, PARTIAL_EFFECT_SEVERITY),
    humanAttentionClass: noWeaker(input?.humanAttentionClass, defaults[2], HUMAN_ATTENTION_CLASSES, HUMAN_ATTENTION_SEVERITY),
    classificationSourceRef: classification.sourceRef,
    classificationEvidenceFingerprint: classification.semanticFingerprint,
    evidenceRefs: canonicalRefs([
      ...(input?.evidenceRefs ?? []),
      classification.evidenceRef,
      `evidence.runtime-failure.${errorEvidence.evidenceFingerprint.slice(0, 32)}`
    ]),
    errorEvidence
  };
  candidate.recurrenceFingerprint = semanticHash({
    failureClass: candidate.failureClass,
    originRef: candidate.originRef,
    workNodeRef: candidate.workNodeRef,
    sourceStateFingerprint: candidate.sourceStateFingerprint,
    expectedTransitionRef: candidate.expectedTransitionRef,
    retriableClass: candidate.retriableClass,
    partialEffectState: candidate.partialEffectState,
    errorEvidenceFingerprint: errorEvidence.evidenceFingerprint
  });
  const required = (registry?.failureEnvelope?.requiredFields ?? FAILURE_ENVELOPE_REQUIRED_FIELDS)
    .filter((field) => !['failureRef', 'semanticFingerprint'].includes(field));
  const missing = required.filter((field) => candidate[field] === undefined || candidate[field] === null || candidate[field] === '');
  if (missing.length) throw new Error(`failure envelope missing required fields: ${missing.join(', ')}`);
  if (!Number.isInteger(candidate.schedulerGeneration) || candidate.schedulerGeneration < 0) {
    throw new Error('failure schedulerGeneration must be a non-negative integer');
  }
  assertFingerprint(candidate.sourceStateFingerprint, 'failure sourceStateFingerprint');
  parseCanonicalTimestamp(candidate.observedAt, 'failure observedAt');
  if (candidate.currentness !== 'CURRENT') throw new Error('new failure envelope must be CURRENT');
  if (!RETRIABLE_CLASSES.includes(candidate.retriableClass)) throw new Error('failure retriableClass is invalid');
  if (!PARTIAL_EFFECT_STATES.includes(candidate.partialEffectState)) throw new Error('failure partialEffectState is invalid');
  if (!HUMAN_ATTENTION_CLASSES.includes(candidate.humanAttentionClass)) throw new Error('failure humanAttentionClass is invalid');
  candidate.semanticFingerprint = buildFailureFingerprint(candidate);
  candidate.failureRef = `failure.vexlife.runtime.${candidate.semanticFingerprint.slice(0, 32)}`;
  if (input?.failureRef && input.failureRef !== candidate.failureRef) {
    throw new Error('failureRef does not match canonical failure content');
  }
  if (input?.semanticFingerprint && input.semanticFingerprint !== candidate.semanticFingerprint) {
    throw new Error('failure semanticFingerprint does not match canonical content');
  }
  return freeze(candidate);
}

export function validateFailureEnvelope(value, options = {}) {
  const errors = [];
  try {
    const canonical = createFailureEnvelope({ ...clone(value), error: value?.errorEvidence }, options);
    if (canonical.failureRef !== value?.failureRef) errors.push('failureRef is not content-addressed');
    if (canonical.semanticFingerprint !== value?.semanticFingerprint) errors.push('failure semanticFingerprint mismatch');
    if (JSON.stringify(canonical.evidenceRefs) !== JSON.stringify(value?.evidenceRefs)) errors.push('failure evidenceRefs are not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return { ok: errors.length === 0, errors };
}

export function normalizeThrownFailure(error, context, options = {}) {
  return createFailureEnvelope({ ...context, error }, options);
}

// [VXG RealForever]
