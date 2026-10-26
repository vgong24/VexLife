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
  const { receiptRef, semanticFingerprint, ...receiptCore } = value;
  if (!/^[0-9a-f]{64}$/u.test(semanticFingerprint ?? '') ||
      semanticHash(receiptCore) !== semanticFingerprint ||
      receiptRef !== `receipt.vexlife.prompt-context-materialization.${semanticFingerprint.slice(0, 32)}`) {
    fail('promptContextMaterialization semantic identity is invalid');
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

function companionAvailabilityBinding(value, promptLineageRef) {
  if (value === null || value === undefined) {
    return Object.freeze({
      valid: false,
      reasonCode: 'COMPANION_AVAILABILITY_UNAVAILABLE',
      projectionRef: null,
      sourceRefs: Object.freeze([]),
      companionLineageRef: null,
      runtimeAdapterRef: null,
      runtimeObservationRef: null,
      availabilityState: null,
      recoveryClass: null,
      availabilityReasonCode: null,
      runtimeOwnershipState: null,
      runtimeState: null,
      qualificationState: null
    });
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.schemaVersion !== 'vexlife.companion-availability/v1' ||
      value.truthClass !== 'SOURCE_BOUND_COMPANION_AVAILABILITY') {
    return Object.freeze({
      valid: false,
      reasonCode: 'COMPANION_AVAILABILITY_INVALID',
      projectionRef: null,
      sourceRefs: Object.freeze([]),
      companionLineageRef: null,
      runtimeAdapterRef: null,
      runtimeObservationRef: null,
      availabilityState: null,
      recoveryClass: null,
      availabilityReasonCode: null,
      runtimeOwnershipState: null,
      runtimeState: null,
      qualificationState: null
    });
  }
  const { projectionRef, projectionSha256, ...core } = value;
  if (!/^[0-9a-f]{64}$/u.test(projectionSha256 ?? '') ||
      semanticHash(core) !== projectionSha256 ||
      projectionRef !== `projection.vexlife.companion-availability.${projectionSha256.slice(0, 32)}` ||
      value.effectAuthorityGranted !== false ||
      value.rendererAuthorityGranted !== false ||
      value.modelIdentityAuthorityGranted !== false ||
      value.processAuthorityGranted !== false ||
      value.conversationAuthorityGranted !== false ||
      !Array.isArray(value.sourceRefs) ||
      value.sourceRefs.some((ref) => typeof ref !== 'string' || ref.length === 0) ||
      new Set(value.sourceRefs).size !== value.sourceRefs.length) {
    return Object.freeze({
      valid: false,
      reasonCode: 'COMPANION_AVAILABILITY_INVALID',
      projectionRef: null,
      sourceRefs: Object.freeze([]),
      companionLineageRef: null,
      runtimeAdapterRef: null,
      runtimeObservationRef: null,
      availabilityState: null,
      recoveryClass: null,
      availabilityReasonCode: null,
      runtimeOwnershipState: null,
      runtimeState: null,
      qualificationState: null
    });
  }
  if (value.companionLineageRef !== promptLineageRef) {
    return Object.freeze({
      valid: false,
      reasonCode: 'COMPANION_IDENTITY_MISMATCH',
      projectionRef,
      sourceRefs: Object.freeze([...value.sourceRefs]),
      companionLineageRef: value.companionLineageRef ?? null,
      runtimeAdapterRef: value.runtimeAdapterRef ?? null,
      runtimeObservationRef: value.runtimeObservationRef ?? null,
      availabilityState: value.availabilityState ?? null,
      recoveryClass: value.recoveryClass ?? null,
      availabilityReasonCode: value.reasonCode ?? null,
      runtimeOwnershipState: value.runtimeOwnershipState ?? null,
      runtimeState: value.runtimeState ?? null,
      qualificationState: value.qualificationState ?? null
    });
  }
  return Object.freeze({
    valid: true,
    reasonCode: null,
    projectionRef,
    sourceRefs: Object.freeze([...value.sourceRefs]),
    companionLineageRef: value.companionLineageRef,
    runtimeAdapterRef: value.runtimeAdapterRef,
    runtimeObservationRef: value.runtimeObservationRef,
    availabilityState: value.availabilityState,
    recoveryClass: value.recoveryClass,
    availabilityReasonCode: value.reasonCode,
    runtimeOwnershipState: value.runtimeOwnershipState,
    runtimeState: value.runtimeState,
    qualificationState: value.qualificationState
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
  companionAvailability = null,
  previousProjection = null
} = {}) {
  const prompt = canonicalPromptReceipt(promptContextMaterialization);
  const runtime = companionAvailabilityBinding(companionAvailability, prompt.lineageRef);
  const reasons = [];
  const inputHeadroomTokens = prompt.inputBudget - prompt.used;
  const leaseAgeMs = prompt.observedMs - prompt.formedMs;
  const leaseRemainingMs = prompt.expiresMs - prompt.observedMs;

  if (!prompt.providerBoundaryCurrentnessVerified) reasons.push('PROMPT_CONTEXT_PROVIDER_CURRENTNESS_NOT_VERIFIED');
  if (!prompt.providerBoundarySourceBindingsVerified) reasons.push('PROMPT_CONTEXT_SOURCE_BINDINGS_NOT_VERIFIED');
  if (prompt.leaseCurrentness !== 'CURRENT') reasons.push('CONTEXT_LEASE_NOT_CURRENT');
  if (prompt.leaseLifecycle !== 'ACTIVE') reasons.push('CONTEXT_LEASE_NOT_ACTIVE');
  if (leaseRemainingMs <= 0) reasons.push('CONTEXT_LEASE_EXPIRED');

  if (!runtime.valid) reasons.push(runtime.reasonCode);
  else {
    if (runtime.availabilityState !== 'READY') reasons.push('COMPANION_AVAILABILITY_NOT_READY');
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
    runtime.projectionRef,
    ...runtime.sourceRefs
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
      availabilityCurrent: runtime.valid,
      availabilityProjectionRefOrNull: runtime.projectionRef,
      availabilityStateOrNull: runtime.availabilityState,
      recoveryClassOrNull: runtime.recoveryClass,
      availabilityReasonCodeOrNull: runtime.availabilityReasonCode,
      runtimeObservationRefOrNull: runtime.runtimeObservationRef,
      adapterRefOrNull: runtime.runtimeAdapterRef,
      runtimeOwnershipStateOrNull: runtime.runtimeOwnershipState,
      runtimeStateOrNull: runtime.runtimeState,
      qualificationStateOrNull: runtime.qualificationState
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
  const project = ({ scopeRef, promptContextMaterialization, companionAvailability = null } = {}) => {
    nonempty(scopeRef, 'scopeRef');
    const previousProjection = current.get(scopeRef) ?? null;
    const projection = projectResourceContextPressure({
      promptContextMaterialization,
      companionAvailability,
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
