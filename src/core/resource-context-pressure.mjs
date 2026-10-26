import { semanticHash } from './utils.mjs';

export const RESOURCE_CONTEXT_PRESSURE_SCHEMA =
  'vexlife.resource-context-pressure-projection/v1';

export const RESOURCE_CONTEXT_PRESSURE_STATES = Object.freeze([
  'NORMAL',
  'WATCH',
  'CHECKPOINT_RECOMMENDED',
  'ROLLOVER_REQUIRED',
  'RESOURCE_ATTENTION'
]);

export const RESOURCE_CONTEXT_PRESSURE_POLICY = Object.freeze({
  schemaVersion: 'vexlife.resource-context-pressure-policy/v1',
  policyRef: 'policy.vexlife.resource-context-pressure.001',
  watchEnterReserveMultiples: 3,
  checkpointEnterReserveMultiples: 2,
  rolloverEnterReserveMultiples: 1,
  watchExitReserveMultiples: 4,
  checkpointExitReserveMultiples: 3,
  rolloverExitReserveMultiples: 2,
  memoryBoundedOutFloor: 'CHECKPOINT_RECOMMENDED'
});

const STATE_SEVERITY = Object.freeze({
  NORMAL: 0,
  WATCH: 1,
  CHECKPOINT_RECOMMENDED: 2,
  ROLLOVER_REQUIRED: 3
});

const EFFECTS = Object.freeze({
  checkpointPerformed: false,
  rolloverPerformed: false,
  cleanupPerformed: false,
  processKillPerformed: false,
  memoryPromotionPerformed: false,
  homeMutated: false,
  providerCalled: false,
  modelCalled: false,
  trainingRan: false,
  modelWeightsChanged: false
});

function fail(message) {
  throw new TypeError(message);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be one object`);
  return value;
}

function nonempty(value, label) {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be one non-empty string`);
  return value;
}

function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(`${label} must be a safe integer >= ${minimum}`);
  return value;
}

function canonicalTimestamp(value, label) {
  nonempty(value, label);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) fail(`${label} must be one canonical timestamp`);
  return ms;
}

function canonicalPromptReceipt(value) {
  object(value, 'promptContextMaterialization');
  if (value.schemaVersion !== 'vexlife.prompt-context-materialization-receipt/v2') {
    fail('promptContextMaterialization schema is unsupported');
  }
  for (const field of [
    'receiptRef',
    'contextLeaseRef',
    'contextLeaseCurrentness',
    'contextLeaseLifecycle',
    'lineageRef',
    'threadRef'
  ]) nonempty(value[field], `promptContextMaterialization.${field}`);

  const formedMs = canonicalTimestamp(value.contextLeaseFormedAt, 'promptContextMaterialization.contextLeaseFormedAt');
  const expiresMs = canonicalTimestamp(value.contextLeaseExpiresAt, 'promptContextMaterialization.contextLeaseExpiresAt');
  const observedAt = value.providerAuthorityObservedAt ?? value.authorityObservedAt;
  const observedMs = canonicalTimestamp(observedAt, 'promptContextMaterialization.observedAt');
  if (expiresMs <= formedMs || observedMs < formedMs) fail('Context Lease timing is contradictory');

  const inputBudget = integer(value.contextLeaseInputTokenEstimate, 'contextLeaseInputTokenEstimate', 1);
  const used = integer(value.materializedInputTokenEstimate, 'materializedInputTokenEstimate', 1);
  const reserve = integer(value.reservedOutputTokens, 'reservedOutputTokens', 1);
  const hardLimit = integer(value.hardTokenLimit, 'hardTokenLimit', 1);
  if (hardLimit < reserve || inputBudget > hardLimit - reserve || used > inputBudget || used > hardLimit - reserve) {
    fail('prompt materialization token bounds are contradictory');
  }

  for (const field of [
    'memoryTokenCap',
    'memoryEstimatedSystemMessageTokens',
    'memoryTokenBoundedOutPageCount',
    'memoryBoundedOutStatementCount',
    'memoryHeldOrDeferredStatementCount'
  ]) integer(value[field], field, 0);

  if (typeof value.memoryContextIncluded !== 'boolean' ||
      typeof value.providerBoundaryCurrentnessVerified !== 'boolean' ||
      typeof value.providerBoundarySourceBindingsVerified !== 'boolean' ||
      value.memoryEstimatedSystemMessageTokens > value.memoryTokenCap) {
    fail('prompt materialization pressure facts are invalid');
  }

  return Object.freeze({
    receiptRef: value.receiptRef,
    continuityProjectionRef: value.continuityProjectionRef ?? null,
    lineageRef: value.lineageRef,
    threadRef: value.threadRef,
    leaseRef: value.contextLeaseRef,
    leaseCurrentness: value.contextLeaseCurrentness,
    leaseLifecycle: value.contextLeaseLifecycle,
    leaseFormedAt: value.contextLeaseFormedAt,
    leaseExpiresAt: value.contextLeaseExpiresAt,
    observedAt,
    formedMs,
    expiresMs,
    observedMs,
    providerBoundaryCurrentnessVerified: value.providerBoundaryCurrentnessVerified,
    providerBoundarySourceBindingsVerified: value.providerBoundarySourceBindingsVerified,
    inputBudget,
    used,
    reserve,
    hardLimit,
    memoryContextRefOrNull: value.memoryContextRefOrNull ?? null,
    memoryIncluded: value.memoryContextIncluded,
    memoryTokenCap: value.memoryTokenCap,
    memoryEstimatedSystemMessageTokens: value.memoryEstimatedSystemMessageTokens,
    memoryTokenBoundedOutPageCount: value.memoryTokenBoundedOutPageCount,
    memoryBoundedOutStatementCount: value.memoryBoundedOutStatementCount,
    memoryHeldOrDeferredStatementCount: value.memoryHeldOrDeferredStatementCount
  });
}

function runtimeBinding(value) {
  if (value === null || value === undefined) {
    return Object.freeze({
      valid: false,
      observationRef: null,
      adapterRef: null,
      currentness: null,
      runtimeOwnershipState: null,
      runtimeState: null,
      qualificationState: null,
      safeReentryState: null
    });
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.schemaVersion !== 'vexlife.companion-runtime-adapter-observation/v1') {
    return Object.freeze({
      valid: false,
      observationRef: null,
      adapterRef: null,
      currentness: null,
      runtimeOwnershipState: null,
      runtimeState: null,
      qualificationState: null,
      safeReentryState: null
    });
  }
  return Object.freeze({
    valid: typeof value.observationRef === 'string' && value.observationRef.length > 0,
    observationRef: typeof value.observationRef === 'string' ? value.observationRef : null,
    adapterRef: typeof value.adapterRef === 'string' ? value.adapterRef : null,
    currentness: typeof value.currentness === 'string' ? value.currentness : null,
    runtimeOwnershipState: typeof value.runtimeOwnershipState === 'string' ? value.runtimeOwnershipState : null,
    runtimeState: typeof value.runtimeState === 'string' ? value.runtimeState : null,
    qualificationState: typeof value.qualificationState === 'string' ? value.qualificationState : null,
    safeReentryState: typeof value.safeReentryState === 'string' ? value.safeReentryState : null
  });
}

function stateForHeadroom(headroom, reserve) {
  if (headroom <= reserve * RESOURCE_CONTEXT_PRESSURE_POLICY.rolloverEnterReserveMultiples) {
    return 'ROLLOVER_REQUIRED';
  }
  if (headroom <= reserve * RESOURCE_CONTEXT_PRESSURE_POLICY.checkpointEnterReserveMultiples) {
    return 'CHECKPOINT_RECOMMENDED';
  }
  if (headroom <= reserve * RESOURCE_CONTEXT_PRESSURE_POLICY.watchEnterReserveMultiples) {
    return 'WATCH';
  }
  return 'NORMAL';
}

function maxState(left, right) {
  return STATE_SEVERITY[left] >= STATE_SEVERITY[right] ? left : right;
}

function validPrevious(value, lineageRef, threadRef) {
  if (value === null || value === undefined) return null;
  if (!verifyResourceContextPressureProjection(value) ||
      value.lineageRef !== lineageRef ||
      value.threadRef !== threadRef ||
      !Object.hasOwn(STATE_SEVERITY, value.state)) {
    return null;
  }
  return value;
}

function applyHysteresis(baseState, headroom, reserve, previous) {
  if (!previous || STATE_SEVERITY[baseState] >= STATE_SEVERITY[previous.state]) {
    return { state: baseState, held: false };
  }
  const exitMultiple = previous.state === 'ROLLOVER_REQUIRED'
    ? RESOURCE_CONTEXT_PRESSURE_POLICY.rolloverExitReserveMultiples
    : previous.state === 'CHECKPOINT_RECOMMENDED'
      ? RESOURCE_CONTEXT_PRESSURE_POLICY.checkpointExitReserveMultiples
      : previous.state === 'WATCH'
        ? RESOURCE_CONTEXT_PRESSURE_POLICY.watchExitReserveMultiples
        : 0;
  if (exitMultiple > 0 && headroom <= reserve * exitMultiple) {
    return { state: previous.state, held: true };
  }
  return { state: baseState, held: false };
}

export function projectResourceContextPressure({
  promptContextMaterialization,
  runtimeObservation = null,
  previousProjection = null
} = {}) {
  const prompt = canonicalPromptReceipt(promptContextMaterialization);
  const runtime = runtimeBinding(runtimeObservation);
  const reasons = [];
  const inputHeadroomTokens = prompt.inputBudget - prompt.used;
  const leaseAgeMs = prompt.observedMs - prompt.formedMs;
  const leaseRemainingMs = prompt.expiresMs - prompt.observedMs;

  if (!prompt.providerBoundaryCurrentnessVerified) reasons.push('PROMPT_CONTEXT_PROVIDER_CURRENTNESS_NOT_VERIFIED');
  if (!prompt.providerBoundarySourceBindingsVerified) reasons.push('PROMPT_CONTEXT_SOURCE_BINDINGS_NOT_VERIFIED');
  if (prompt.leaseCurrentness !== 'CURRENT') reasons.push('CONTEXT_LEASE_NOT_CURRENT');
  if (prompt.leaseLifecycle !== 'ACTIVE') reasons.push('CONTEXT_LEASE_NOT_ACTIVE');
  if (leaseRemainingMs <= 0) reasons.push('CONTEXT_LEASE_EXPIRED');

  if (!runtime.valid) reasons.push('RUNTIME_OBSERVATION_UNAVAILABLE');
  else {
    if (runtime.currentness !== 'CURRENT') reasons.push('RUNTIME_OBSERVATION_NOT_CURRENT');
    if (runtime.runtimeOwnershipState !== 'EXACT_OWNED') reasons.push('RUNTIME_OWNERSHIP_NOT_EXACT');
    if (runtime.runtimeState !== 'HEALTHY') reasons.push('RUNTIME_NOT_HEALTHY');
    if (runtime.qualificationState !== 'CURRENT') reasons.push('RUNTIME_QUALIFICATION_NOT_CURRENT');
  }

  const resourceAttention = reasons.length > 0;
  let state = stateForHeadroom(inputHeadroomTokens, prompt.reserve);
  if (state === 'ROLLOVER_REQUIRED') reasons.push('CONTEXT_HEADROOM_AT_OR_BELOW_ONE_OUTPUT_RESERVE');
  else if (state === 'CHECKPOINT_RECOMMENDED') reasons.push('CONTEXT_HEADROOM_AT_OR_BELOW_TWO_OUTPUT_RESERVES');
  else if (state === 'WATCH') reasons.push('CONTEXT_HEADROOM_AT_OR_BELOW_THREE_OUTPUT_RESERVES');

  const memoryBoundedOut =
    prompt.memoryTokenBoundedOutPageCount > 0 ||
    prompt.memoryBoundedOutStatementCount > 0;
  if (memoryBoundedOut) {
    state = maxState(state, RESOURCE_CONTEXT_PRESSURE_POLICY.memoryBoundedOutFloor);
    reasons.push('MEMORY_CONTINUITY_BOUNDED_OUT');
  }

  const previous = validPrevious(previousProjection, prompt.lineageRef, prompt.threadRef);
  let hysteresisHeld = false;
  if (!resourceAttention) {
    const hysteresis = applyHysteresis(state, inputHeadroomTokens, prompt.reserve, previous);
    state = hysteresis.state;
    hysteresisHeld = hysteresis.held;
    if (hysteresisHeld) reasons.push(`HYSTERESIS_HOLD_${state}`);
  } else {
    state = 'RESOURCE_ATTENTION';
  }

  if (state === 'NORMAL' && reasons.length === 0) reasons.push('PRESSURE_WITHIN_NORMAL_BOUNDS');

  const policyFingerprint = semanticHash(RESOURCE_CONTEXT_PRESSURE_POLICY);
  const sourceRefs = [
    prompt.receiptRef,
    prompt.leaseRef,
    prompt.continuityProjectionRef,
    prompt.memoryContextRefOrNull,
    runtime.observationRef
  ].filter(Boolean).sort();

  const core = {
    schemaVersion: RESOURCE_CONTEXT_PRESSURE_SCHEMA,
    truthClass: 'SOURCE_BOUND_RESOURCE_CONTEXT_PRESSURE',
    currentness: 'CURRENT',
    lineageRef: prompt.lineageRef,
    threadRef: prompt.threadRef,
    state,
    reasonCodes: [...new Set(reasons)].sort(),
    policyRef: RESOURCE_CONTEXT_PRESSURE_POLICY.policyRef,
    policyFingerprint,
    context: {
      materializedInputTokenEstimate: prompt.used,
      inputTokenBudget: prompt.inputBudget,
      inputHeadroomTokens,
      reservedOutputTokens: prompt.reserve,
      hardTokenLimit: prompt.hardLimit
    },
    memory: {
      included: prompt.memoryIncluded,
      tokenCap: prompt.memoryTokenCap,
      estimatedSystemMessageTokens: prompt.memoryEstimatedSystemMessageTokens,
      tokenBoundedOutPageCount: prompt.memoryTokenBoundedOutPageCount,
      boundedOutStatementCount: prompt.memoryBoundedOutStatementCount,
      heldOrDeferredStatementCount: prompt.memoryHeldOrDeferredStatementCount
    },
    lease: {
      leaseRef: prompt.leaseRef,
      currentness: prompt.leaseCurrentness,
      lifecycle: prompt.leaseLifecycle,
      formedAt: prompt.leaseFormedAt,
      expiresAt: prompt.leaseExpiresAt,
      observedAt: prompt.observedAt,
      ageMs: leaseAgeMs,
      remainingMs: Math.max(0, leaseRemainingMs)
    },
    runtime: {
      observationAvailable: runtime.valid,
      observationRefOrNull: runtime.observationRef,
      adapterRefOrNull: runtime.adapterRef,
      currentnessOrNull: runtime.currentness,
      runtimeOwnershipStateOrNull: runtime.runtimeOwnershipState,
      runtimeStateOrNull: runtime.runtimeState,
      qualificationStateOrNull: runtime.qualificationState,
      safeReentryStateOrNull: runtime.safeReentryState
    },
    prior: {
      pressureRefOrNull: previous?.pressureRef ?? null,
      stateOrNull: previous?.state ?? null,
      hysteresisHeld
    },
    sourceRefs: [...new Set(sourceRefs)],
    effectAuthorityGranted: false,
    effects: { ...EFFECTS },
    projectionTruth: {
      readOnly: true,
      checkpointEffectPerformed: false,
      rolloverEffectPerformed: false,
      cleanupEffectPerformed: false,
      memoryPromotionPerformed: false,
      processKillAuthorityGranted: false,
      hiddenReasoningIncluded: false,
      rawPrivatePayloadIncluded: false
    }
  };
  const semanticFingerprint = semanticHash(core);
  return Object.freeze({
    ...core,
    pressureRef: `projection.vexlife.resource-context-pressure.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

export function verifyResourceContextPressureProjection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.schemaVersion !== RESOURCE_CONTEXT_PRESSURE_SCHEMA ||
      value.truthClass !== 'SOURCE_BOUND_RESOURCE_CONTEXT_PRESSURE' ||
      value.currentness !== 'CURRENT' ||
      !RESOURCE_CONTEXT_PRESSURE_STATES.includes(value.state) ||
      value.effectAuthorityGranted !== false ||
      Object.values(value.effects ?? {}).some((entry) => entry !== false) ||
      value.projectionTruth?.readOnly !== true ||
      value.projectionTruth?.checkpointEffectPerformed !== false ||
      value.projectionTruth?.rolloverEffectPerformed !== false ||
      value.projectionTruth?.cleanupEffectPerformed !== false ||
      value.projectionTruth?.memoryPromotionPerformed !== false ||
      value.projectionTruth?.processKillAuthorityGranted !== false ||
      value.projectionTruth?.hiddenReasoningIncluded !== false ||
      value.projectionTruth?.rawPrivatePayloadIncluded !== false ||
      typeof value.pressureRef !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(value.semanticFingerprint ?? '')) return false;
  const { pressureRef, semanticFingerprint, ...core } = value;
  return pressureRef === `projection.vexlife.resource-context-pressure.${semanticFingerprint.slice(0, 32)}` &&
    semanticHash(core) === semanticFingerprint;
}


export function createResourceContextPressureTracker({
  maxEntries = 64
} = {}) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 1024) {
    fail('resource-context pressure tracker maxEntries must be between 1 and 1024');
  }
  const current = new Map();
  const project = ({ scopeRef, promptContextMaterialization, runtimeObservation = null } = {}) => {
    nonempty(scopeRef, 'scopeRef');
    const previousProjection = current.get(scopeRef) ?? null;
    const projection = projectResourceContextPressure({
      promptContextMaterialization,
      runtimeObservation,
      previousProjection
    });
    current.delete(scopeRef);
    current.set(scopeRef, projection);
    while (current.size > maxEntries) current.delete(current.keys().next().value);
    return projection;
  };
  return Object.freeze({
    project,
    currentSize: () => current.size,
    forget: (scopeRef) => current.delete(scopeRef)
  });
}

// [VXG RealForever]
