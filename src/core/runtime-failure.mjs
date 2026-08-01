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

function inferFailureClass(error) {
  const explicit = error?.failureClass ?? error?.code;
  if (FAILURE_CLASSES.includes(explicit)) return explicit;
  const text = `${error?.name ?? ''} ${error?.message ?? error ?? ''}`.toLowerCase();
  if (/range|bounds|index/.test(text)) return 'INVALID_INDEX_OR_BOUNDS';
  if (/invalid state|state transition/.test(text)) return 'INVALID_STATE_TRANSITION';
  if (/malformed|parse|schema/.test(text)) return 'MALFORMED_INPUT_OR_RESULT';
  if (/context|token budget|hard limit/.test(text)) return 'CONTEXT_BUDGET_EXCEEDED';
  if (/timeout/.test(text)) return 'MODEL_TIMEOUT_SIMULATED';
  if (/resource|memory exhausted/.test(text)) return 'RESOURCE_EXHAUSTION_SIMULATED';
  return error instanceof Error ? 'UNEXPECTED_EXCEPTION' : 'UNKNOWN_FAILURE';
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

export function buildFailureFingerprint(input) {
  const candidate = clone(input);
  delete candidate.failureRef;
  delete candidate.semanticFingerprint;
  candidate.evidenceRefs = canonicalRefs(candidate.evidenceRefs ?? []);
  return semanticHash(candidate);
}

export function createFailureEnvelope(input, { registry = null } = {}) {
  const error = input?.error;
  const failureClass = FAILURE_CLASSES.includes(input?.failureClass)
    ? input.failureClass
    : inferFailureClass(error);
  const defaults = CLASS_DEFAULTS[failureClass] ?? CLASS_DEFAULTS.UNKNOWN_FAILURE;
  const errorEvidence = canonicalErrorEvidence(error ?? input?.errorEvidence ?? failureClass);
  const candidate = {
    schemaVersion: 'vexlife.runtime-failure-envelope/v0',
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
    retriableClass: input?.retriableClass ?? defaults[0],
    partialEffectState: input?.partialEffectState ?? error?.partialEffectState ?? defaults[1],
    humanAttentionClass: input?.humanAttentionClass ?? error?.humanAttentionClass ?? defaults[2],
    evidenceRefs: canonicalRefs([
      ...(input?.evidenceRefs ?? []),
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
  return createFailureEnvelope({ ...context, error, failureClass: error?.failureClass }, options);
}

// [VXG RealForever]
