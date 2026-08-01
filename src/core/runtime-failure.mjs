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
  'classificationAdapterRef',
  'classifierPlanRef',
  'classificationEvidenceFingerprint',
  'classificationEvidence',
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

const EXECUTOR_CLASSIFIERS = new WeakMap();
const DEFAULT_CLASSIFIER_PLANS = Object.freeze({
  unexpected: Object.freeze({
    planRef: 'classifier-plan.runtime-recovery.default-unexpected',
    sourceRef: 'source.runtime-recovery.default-unexpected',
    adapterRef: 'adapter.runtime-recovery.classifier.default-unexpected',
    failureClass: 'UNEXPECTED_EXCEPTION'
  }),
  unknown: Object.freeze({
    planRef: 'classifier-plan.runtime-recovery.default-unknown',
    sourceRef: 'source.runtime-recovery.default-unexpected',
    adapterRef: 'adapter.runtime-recovery.classifier.default-unexpected',
    failureClass: 'UNKNOWN_FAILURE'
  }),
  malformedInput: Object.freeze({
    planRef: 'classifier-plan.runtime-recovery.internal-malformed-input',
    sourceRef: 'source.runtime-recovery.internal.malformed-input',
    adapterRef: 'adapter.runtime-recovery.classifier.internal-boundary',
    failureClass: 'UNKNOWN_FAILURE'
  }),
  partialSuccess: Object.freeze({
    planRef: 'classifier-plan.runtime-recovery.internal-partial-success',
    sourceRef: 'source.runtime-recovery.internal.partial-success',
    adapterRef: 'adapter.runtime-recovery.classifier.internal-boundary',
    failureClass: 'MALFORMED_INPUT_OR_RESULT'
  })
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

function classifierPlanFingerprint(plan) {
  return semanticHash({
    planRef: plan.planRef,
    sourceRef: plan.sourceRef,
    adapterRef: plan.adapterRef,
    plan: plan.planEntries ?? [{ attempt: 1, failureClass: plan.failureClass }]
  });
}

function registeredClassifierSource(registry, sourceRef) {
  return registry?.classifierContract?.sources?.find((source) => source.sourceRef === sourceRef) ?? null;
}

function formClassificationEvidence(plan, errorEvidence, registry) {
  if (!plan?.planRef || !plan?.sourceRef || !plan?.adapterRef || !FAILURE_CLASSES.includes(plan.failureClass)) {
    throw new Error('classifier plan is malformed');
  }
  const registered = registeredClassifierSource(registry, plan.sourceRef);
  if (!registered || registered.adapterRef !== plan.adapterRef ||
      !registered.allowedFailureClasses?.includes(plan.failureClass)) {
    throw new Error('classifier source/adapter/class is not registered');
  }
  const classifierPlan = clone(plan.planEntries ?? [{ attempt: 1, failureClass: plan.failureClass }]);
  const classifiedAttempt = plan.classifiedAttempt ?? 1;
  const planned = classifierPlan.find((item) => item.attempt === classifiedAttempt);
  if (!planned || planned.failureClass !== plan.failureClass ||
      classifierPlan.some((item) => !Number.isInteger(item.attempt) || item.attempt < 1 ||
        !registered.allowedFailureClasses.includes(item.failureClass))) {
    throw new Error('classifier plan does not issue the selected failure class for this attempt');
  }
  const evidence = {
    schemaVersion: 'vexlife.runtime-failure-classification-evidence/v1',
    sourceRef: plan.sourceRef,
    adapterRef: plan.adapterRef,
    classifierPlanRef: plan.planRef,
    classifierPlan,
    classifierPlanFingerprint: plan.planFingerprint ?? classifierPlanFingerprint({ ...plan, planEntries: classifierPlan }),
    classifiedAttempt,
    failureClass: plan.failureClass,
    errorEvidenceFingerprint: errorEvidence.evidenceFingerprint,
    currentness: 'CURRENT'
  };
  evidence.semanticFingerprint = semanticHash(evidence);
  evidence.evidenceRef = `evidence.runtime-failure.classification.${evidence.semanticFingerprint.slice(0, 32)}`;
  return freeze(evidence);
}

function validateClassificationEvidence(value, errorEvidence, registry) {
  if (!value || value.schemaVersion !== 'vexlife.runtime-failure-classification-evidence/v1' ||
      value.currentness !== 'CURRENT') {
    throw new Error('classifier evidence is missing, stale, or has the wrong schema');
  }
  const canonical = formClassificationEvidence({
    planRef: value.classifierPlanRef,
    sourceRef: value.sourceRef,
    adapterRef: value.adapterRef,
    failureClass: value.failureClass,
    planEntries: value.classifierPlan,
    classifiedAttempt: value.classifiedAttempt,
    planFingerprint: value.classifierPlanFingerprint
  }, errorEvidence, registry);
  if (canonical.errorEvidenceFingerprint !== value.errorEvidenceFingerprint ||
      canonical.semanticFingerprint !== value.semanticFingerprint ||
      canonical.evidenceRef !== value.evidenceRef ||
      classifierPlanFingerprint({
        planRef: value.classifierPlanRef,
        sourceRef: value.sourceRef,
        adapterRef: value.adapterRef,
        failureClass: value.failureClass,
        planEntries: value.classifierPlan
      }) !== value.classifierPlanFingerprint) {
    throw new Error('classifier evidence is forged or same-ref/different-content');
  }
  return canonical;
}

export function createDeterministicClassifiedExecutor({
  sourceRef,
  adapterRef,
  planRef,
  plan,
  invoke
}) {
  if (typeof invoke !== 'function' || !Array.isArray(plan) || !sourceRef || !adapterRef || !planRef) {
    throw new Error('deterministic classified executor formation is malformed');
  }
  const normalizedPlan = plan.map((item) => ({
    attempt: item.attempt,
    failureClass: item.failureClass
  }));
  if (normalizedPlan.some((item) => !Number.isInteger(item.attempt) || item.attempt < 1 ||
      !FAILURE_CLASSES.includes(item.failureClass))) {
    throw new Error('deterministic classifier plan contains an invalid attempt or failure class');
  }
  const descriptor = freeze({
    sourceRef,
    adapterRef,
    planRef,
    planFingerprint: semanticHash({ sourceRef, adapterRef, planRef, plan: normalizedPlan }),
    plan: normalizedPlan
  });
  let callCount = 0;
  const executor = (...args) => {
    callCount += 1;
    return invoke(callCount, ...args);
  };
  Object.defineProperty(executor, 'callCount', { get: () => callCount });
  Object.defineProperty(executor, 'classifierPlanRef', { value: planRef, enumerable: false });
  EXECUTOR_CLASSIFIERS.set(executor, { descriptor, currentAttempt: () => callCount });
  return executor;
}

export function classifyThrownFailure(executor, error, { registry } = {}) {
  const errorEvidence = canonicalErrorEvidence(error);
  const binding = typeof executor === 'function' ? EXECUTOR_CLASSIFIERS.get(executor) : null;
  if (binding) {
    const attempt = binding.currentAttempt();
    const planned = binding.descriptor.plan.find((item) => item.attempt === attempt);
    if (planned) {
      return formClassificationEvidence({
        planRef: binding.descriptor.planRef,
        sourceRef: binding.descriptor.sourceRef,
        adapterRef: binding.descriptor.adapterRef,
        failureClass: planned.failureClass,
        planEntries: binding.descriptor.plan,
        classifiedAttempt: attempt,
        planFingerprint: binding.descriptor.planFingerprint
      }, errorEvidence, registry);
    }
  }
  const fallback = error instanceof Error ? DEFAULT_CLASSIFIER_PLANS.unexpected : DEFAULT_CLASSIFIER_PLANS.unknown;
  return formClassificationEvidence(fallback, errorEvidence, registry);
}

export function classifyInternalRuntimeFailure(kind, error, { registry } = {}) {
  const plan = kind === 'PARTIAL_SUCCESS'
    ? DEFAULT_CLASSIFIER_PLANS.partialSuccess
    : DEFAULT_CLASSIFIER_PLANS.malformedInput;
  return formClassificationEvidence(plan, canonicalErrorEvidence(error), registry);
}

function canonicalClassification(input, errorEvidence, error, registry, suppliedEvidence = null) {
  const supplied = suppliedEvidence ?? input?.classificationEvidence ?? null;
  if (supplied) return validateClassificationEvidence(supplied, errorEvidence, registry);
  const fallback = error instanceof Error ? DEFAULT_CLASSIFIER_PLANS.unexpected : DEFAULT_CLASSIFIER_PLANS.unknown;
  return formClassificationEvidence(fallback, errorEvidence, registry);
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
  const classification = canonicalClassification(
    input,
    errorEvidence,
    error ?? input?.errorEvidence,
    registry,
    input?.classificationEvidence
  );
  const failureClass = classification.failureClass;
  if (input?.failureClass && input.failureClass !== failureClass) {
    throw new Error('caller-selected failure class differs from canonical classifier output');
  }
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
    retriableClass: defaults[0],
    partialEffectState: defaults[1],
    humanAttentionClass: defaults[2],
    classificationSourceRef: classification.sourceRef,
    classificationAdapterRef: classification.adapterRef,
    classifierPlanRef: classification.classifierPlanRef,
    classificationEvidenceFingerprint: classification.semanticFingerprint,
    classificationEvidence: classification,
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
  const classificationEvidence = options.classificationEvidence ??
    classifyThrownFailure(options.executor, error, { registry: options.registry });
  return createFailureEnvelope({ ...context, error, classificationEvidence }, options);
}

// [VXG RealForever]
