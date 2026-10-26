import {
  CONTINUITY_STREAM_ADAPTER_EFFECT_KEYS,
  CONTINUITY_STREAM_ADAPTER_SCHEMA
} from './continuity-stream-adapter.mjs';
import {
  RESOURCE_CONTEXT_PRESSURE_SCHEMA,
  verifyResourceContextPressureProjection
} from './resource-context-pressure.mjs';
import { semanticHash } from './utils.mjs';

export const WORKING_CONTINUITY_CHECKPOINT_SCHEMA =
  'vexlife.working-continuity-checkpoint/v1';
export const WORKING_CONTINUITY_CHECKPOINT_SUPERSESSION_PLAN_SCHEMA =
  'vexlife.working-continuity-checkpoint-supersession-plan/v1';
export const CONTINUITY_ROLLOVER_PLAN_SCHEMA =
  'vexlife.continuity-rollover-plan/v1';

export const CONTINUITY_ROLLOVER_PLAN_STATES = Object.freeze([
  'NO_ACTION_REQUIRED',
  'CHECKPOINT_READY',
  'ROLLOVER_READY',
  'HELD_RESOURCE_ATTENTION',
  'HELD_CONTINUITY_NOT_CURRENT',
  'HELD_RECOVERY_ACTIVE'
]);

const PRESSURE_EFFECT_KEYS = Object.freeze([
  'checkpointPerformed',
  'rolloverPerformed',
  'cleanupPerformed',
  'processKillPerformed',
  'memoryPromotionPerformed',
  'homeMutated',
  'providerCalled',
  'modelCalled',
  'trainingRan',
  'modelWeightsChanged'
]);

const CHECKPOINT_EFFECTS = Object.freeze({
  checkpointPersisted: false,
  schedulerCheckpointPerformed: false,
  successorContextLeaseIssued: false,
  semanticAcceptanceCreated: false,
  memoryPromotionPerformed: false,
  sourceHistoryDeleted: false,
  homeMutated: false,
  providerCalled: false,
  modelCalled: false,
  trainingRan: false,
  modelWeightsChanged: false
});

const PLAN_EFFECTS = Object.freeze({
  checkpointPersisted: false,
  schedulerCheckpointPerformed: false,
  successorContextLeaseIssued: false,
  semanticAcceptanceCreated: false,
  memoryPromotionPerformed: false,
  cleanupPerformed: false,
  processKillPerformed: false,
  homeMutated: false,
  providerCalled: false,
  modelCalled: false,
  trainingRan: false,
  modelWeightsChanged: false
});

const REF = /^[A-Za-z0-9][A-Za-z0-9._:/#-]*$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const SHA256_REF = /^sha256:[0-9a-f]{64}$/u;
const RECOVERY_CLEAR_STATES = new Set([null, 'READY', 'COMPLETED']);

function fail(message) {
  throw new TypeError(message);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be one object`);
  }
  return value;
}

function ref(value, label) {
  if (typeof value !== 'string' || !REF.test(value)) fail(`${label} must be one stable ref`);
  return value;
}

function optionalRef(value, label) {
  return value === null || value === undefined ? null : ref(value, label);
}

function sha(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(`${label} must be one lowercase SHA-256`);
  return value;
}

function shaRef(value, label) {
  if (typeof value !== 'string' || !SHA256_REF.test(value)) fail(`${label} must be one sha256: ref`);
  return value;
}

function refs(values, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || !REF.test(value))) {
    fail(`${label} must contain only stable refs`);
  }
  return [...new Set(values)].sort();
}

function exactFalseEffects(value, expectedKeys, label) {
  object(value, label);
  const observed = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(observed) !== JSON.stringify(expected) || expected.some((key) => value[key] !== false)) {
    fail(`${label} must preserve the exact all-false effect contract`);
  }
  return value;
}

function canonicalIdentity(value, { refField, prefix, label }) {
  object(value, label);
  const fingerprint = sha(value.semanticFingerprint, `${label}.semanticFingerprint`);
  const identityRef = ref(value[refField], `${label}.${refField}`);
  const core = structuredClone(value);
  delete core.semanticFingerprint;
  delete core[refField];
  const expected = semanticHash(core);
  if (expected !== fingerprint || identityRef !== `${prefix}.${fingerprint.slice(0, 32)}`) {
    fail(`${label} semantic identity is invalid`);
  }
  return value;
}

function canonicalContinuityProjection(value) {
  object(value, 'continuity');
  if (value.schemaVersion !== CONTINUITY_STREAM_ADAPTER_SCHEMA) {
    fail('continuity schema is unsupported');
  }
  canonicalIdentity(value, {
    refField: 'adapterProjectionRef',
    prefix: 'projection.vexlife.continuity-stream-adapter',
    label: 'continuity'
  });
  exactFalseEffects(value.effects, CONTINUITY_STREAM_ADAPTER_EFFECT_KEYS, 'continuity.effects');
  if (value.projectionTruth?.readOnly !== true ||
      value.projectionTruth?.ownerMutationPerformed !== false ||
      value.projectionTruth?.rawTranscriptIncluded !== false ||
      value.projectionTruth?.hiddenReasoningIncluded !== false ||
      value.projectionTruth?.rawPrivatePayloadIncluded !== false ||
      value.projectionTruth?.semanticAcceptanceCreated !== false ||
      value.projectionTruth?.memoryPromotionPerformed !== false ||
      value.projectionTruth?.recoveryActionPerformed !== false ||
      value.projectionTruth?.externalEffectPerformed !== false) {
    fail('continuity projection crossed its read-only boundary');
  }
  const current = object(value.current, 'continuity.current');
  const context = object(value.owners?.context, 'continuity.owners.context');
  return Object.freeze({
    projection: value,
    projectionRef: value.adapterProjectionRef,
    projectionFingerprint: value.semanticFingerprint,
    currentness: value.currentness,
    currentnessReasonRefs: refs(value.currentnessReasonRefs ?? [], 'continuity.currentnessReasonRefs'),
    lineageRef: ref(current.lineageRef, 'continuity.current.lineageRef'),
    threadRef: ref(current.threadRef, 'continuity.current.threadRef'),
    cursorEventRef: ref(current.cursorEventRef, 'continuity.current.cursorEventRef'),
    frameRef: ref(current.frameRef, 'continuity.current.frameRef'),
    frameFingerprint: shaRef(current.frameFingerprint, 'continuity.current.frameFingerprint'),
    activeWorkNodeRefs: refs(current.activeWorkNodeRefs ?? [], 'continuity.current.activeWorkNodeRefs'),
    currentIntentReceiptRefs: refs(current.currentIntentReceiptRefs ?? [], 'continuity.current.currentIntentReceiptRefs'),
    openLoopRefs: refs(current.openLoopRefs ?? [], 'continuity.current.openLoopRefs'),
    currentStatementRefs: refs(current.currentStatementRefs ?? [], 'continuity.current.currentStatementRefs'),
    currentContinuityRecordRefs: refs(current.currentContinuityRecordRefs ?? [], 'continuity.current.currentContinuityRecordRefs'),
    currentDailyStratumRefOrNull: optionalRef(current.currentDailyStratumRefOrNull, 'continuity.current.currentDailyStratumRefOrNull'),
    recoveryPhaseOrNull: current.recoveryPhaseOrNull ?? null,
    sourceRefs: refs(value.sourceRefs ?? [], 'continuity.sourceRefs'),
    contextLeaseRef: ref(context.leaseRef, 'continuity.owners.context.leaseRef'),
    contextLeaseFingerprint: sha(context.semanticFingerprint, 'continuity.owners.context.semanticFingerprint'),
    checkpointReturnRef: ref(context.checkpointReturnRef, 'continuity.owners.context.checkpointReturnRef'),
    schedulerGeneration: Number.isSafeInteger(context.schedulerGeneration) && context.schedulerGeneration >= 0
      ? context.schedulerGeneration
      : fail('continuity.owners.context.schedulerGeneration must be a non-negative safe integer'),
    workNodeRef: ref(context.workNodeRef, 'continuity.owners.context.workNodeRef'),
    selectedSourceRefs: refs(context.selectedSourceRefs ?? [], 'continuity.owners.context.selectedSourceRefs')
  });
}

function canonicalPressure(value) {
  if (!verifyResourceContextPressureProjection(value) || value.schemaVersion !== RESOURCE_CONTEXT_PRESSURE_SCHEMA) {
    fail('resourceContextPressure semantic identity is invalid');
  }
  exactFalseEffects(value.effects, PRESSURE_EFFECT_KEYS, 'resourceContextPressure.effects');
  return value;
}

function checkpointCore(pressure, continuity, priorCheckpoint) {
  if (priorCheckpoint !== null) {
    if (!verifyWorkingContinuityCheckpoint(priorCheckpoint)) {
      fail('prior working checkpoint semantic identity is invalid');
    }
    if (priorCheckpoint.lineageRef !== continuity.lineageRef || priorCheckpoint.threadRef !== continuity.threadRef) {
      fail('prior working checkpoint belongs to another lineage or thread');
    }
    if (priorCheckpoint.lifecycle !== 'CURRENT') {
      fail('prior working checkpoint must be CURRENT before supersession');
    }
  }
  const sourceRefs = refs([
    ...continuity.sourceRefs,
    ...continuity.selectedSourceRefs,
    ...(pressure.sourceRefs ?? []),
    continuity.projectionRef,
    pressure.pressureRef
  ], 'working checkpoint sourceRefs');
  return {
    schemaVersion: WORKING_CONTINUITY_CHECKPOINT_SCHEMA,
    truthClass: 'SOURCE_BOUND_NON_SEMANTIC_WORKING_CONTINUITY_CHECKPOINT',
    currentness: 'CURRENT',
    lifecycle: 'CURRENT',
    lineageRef: continuity.lineageRef,
    threadRef: continuity.threadRef,
    pressureRef: pressure.pressureRef,
    pressureFingerprint: pressure.semanticFingerprint,
    pressureState: pressure.state,
    continuityProjectionRef: continuity.projectionRef,
    continuityProjectionFingerprint: continuity.projectionFingerprint,
    contextLease: {
      leaseRef: continuity.contextLeaseRef,
      semanticFingerprint: continuity.contextLeaseFingerprint,
      checkpointReturnRef: continuity.checkpointReturnRef,
      schedulerGeneration: continuity.schedulerGeneration,
      workNodeRef: continuity.workNodeRef
    },
    workingSet: {
      cursorEventRef: continuity.cursorEventRef,
      frameRef: continuity.frameRef,
      frameFingerprint: continuity.frameFingerprint,
      activeWorkNodeRefs: continuity.activeWorkNodeRefs,
      currentIntentReceiptRefs: continuity.currentIntentReceiptRefs,
      openLoopRefs: continuity.openLoopRefs,
      currentStatementRefs: continuity.currentStatementRefs,
      currentContinuityRecordRefs: continuity.currentContinuityRecordRefs,
      currentDailyStratumRefOrNull: continuity.currentDailyStratumRefOrNull,
      recoveryPhaseOrNull: continuity.recoveryPhaseOrNull
    },
    priorCheckpointRefOrNull: priorCheckpoint?.checkpointRef ?? null,
    priorCheckpointFingerprintOrNull: priorCheckpoint?.semanticFingerprint ?? null,
    sourceRefs,
    effectAuthorityGranted: false,
    semanticMemoryPromotionAuthorized: false,
    modelOutputAcceptedAsMemory: false,
    effects: { ...CHECKPOINT_EFFECTS },
    checkpointTruth: {
      referenceOnly: true,
      rawTranscriptIncluded: false,
      rawPrivatePayloadIncluded: false,
      modelSummaryIncluded: false,
      priorCheckpointBodyEmbedded: false,
      semanticAcceptanceCreated: false,
      memoryPromotionPerformed: false,
      sourceHistoryDeleted: false,
      persistencePerformed: false,
      schedulerCheckpointPerformed: false,
      successorContextLeaseIssued: false
    }
  };
}

function formCheckpoint(pressure, continuity, priorCheckpoint) {
  const core = checkpointCore(pressure, continuity, priorCheckpoint);
  const semanticFingerprint = semanticHash(core);
  return Object.freeze({
    ...core,
    checkpointRef: `checkpoint.vexlife.working-continuity.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

function formSupersessionPlan(priorCheckpoint, successorCheckpoint) {
  if (priorCheckpoint === null) return null;
  const core = {
    schemaVersion: WORKING_CONTINUITY_CHECKPOINT_SUPERSESSION_PLAN_SCHEMA,
    priorCheckpointRef: priorCheckpoint.checkpointRef,
    priorCheckpointFingerprint: priorCheckpoint.semanticFingerprint,
    successorCheckpointRef: successorCheckpoint.checkpointRef,
    successorCheckpointFingerprint: successorCheckpoint.semanticFingerprint,
    lineageRef: successorCheckpoint.lineageRef,
    threadRef: successorCheckpoint.threadRef,
    priorDisposition: 'SUPERSEDED_WHEN_EFFECT_OWNER_COMMITS',
    successorDisposition: 'CURRENT_WHEN_EFFECT_OWNER_COMMITS',
    atomicEffectRequired: true,
    priorCheckpointBodyEmbedded: false,
    sourceHistoryDeleted: false,
    effectPerformed: false,
    effectAuthorityGranted: false
  };
  const semanticFingerprint = semanticHash(core);
  return Object.freeze({
    ...core,
    supersessionPlanRef: `plan.vexlife.working-continuity-supersession.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

function heldPlan({ state, reasons, pressure, continuity }) {
  return finalizedPlan({
    state,
    reasonCodes: reasons,
    pressure,
    continuity,
    checkpoint: null,
    supersessionPlan: null,
    nextSafeAction: state === 'HELD_RESOURCE_ATTENTION'
      ? 'RESOLVE_RESOURCE_ATTENTION_WITH_RIGHTFUL_OWNER'
      : state === 'HELD_RECOVERY_ACTIVE'
        ? 'DEFER_TO_ACTIVE_RECOVERY_OWNER'
        : 'REFRESH_CURRENT_CONTINUITY_OWNER_PROJECTION'
  });
}

function finalizedPlan({ state, reasonCodes, pressure, continuity, checkpoint, supersessionPlan, nextSafeAction }) {
  const core = {
    schemaVersion: CONTINUITY_ROLLOVER_PLAN_SCHEMA,
    truthClass: 'SOURCE_BOUND_EFFECT_FREE_CONTINUITY_ROLLOVER_PLAN',
    currentness: 'CURRENT',
    state,
    reasonCodes: [...new Set(reasonCodes)].sort(),
    lineageRef: pressure.lineageRef,
    threadRef: pressure.threadRef,
    pressureRef: pressure.pressureRef,
    pressureFingerprint: pressure.semanticFingerprint,
    continuityProjectionRef: continuity.projectionRef,
    continuityProjectionFingerprint: continuity.projectionFingerprint,
    checkpoint,
    supersessionPlan,
    nextSafeAction,
    effectAuthorityGranted: false,
    effects: { ...PLAN_EFFECTS },
    planTruth: {
      readOnly: true,
      checkpointEffectPerformed: false,
      rolloverEffectPerformed: false,
      contextLeaseIssued: false,
      semanticAcceptanceCreated: false,
      memoryPromotionPerformed: false,
      processKillAuthorityGranted: false,
      rawTranscriptIncluded: false,
      rawPrivatePayloadIncluded: false,
      modelSummaryIncluded: false
    }
  };
  const semanticFingerprint = semanticHash(core);
  return Object.freeze({
    ...core,
    planRef: `plan.vexlife.continuity-rollover.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

export function verifyWorkingContinuityCheckpoint(value) {
  try {
    canonicalIdentity(value, {
      refField: 'checkpointRef',
      prefix: 'checkpoint.vexlife.working-continuity',
      label: 'working checkpoint'
    });
    if (value.schemaVersion !== WORKING_CONTINUITY_CHECKPOINT_SCHEMA ||
        value.truthClass !== 'SOURCE_BOUND_NON_SEMANTIC_WORKING_CONTINUITY_CHECKPOINT' ||
        value.currentness !== 'CURRENT' || value.lifecycle !== 'CURRENT' ||
        value.effectAuthorityGranted !== false ||
        value.semanticMemoryPromotionAuthorized !== false ||
        value.modelOutputAcceptedAsMemory !== false) return false;
    exactFalseEffects(value.effects, Object.keys(CHECKPOINT_EFFECTS), 'working checkpoint effects');
    if (value.checkpointTruth?.referenceOnly !== true ||
        value.checkpointTruth?.rawTranscriptIncluded !== false ||
        value.checkpointTruth?.rawPrivatePayloadIncluded !== false ||
        value.checkpointTruth?.modelSummaryIncluded !== false ||
        value.checkpointTruth?.priorCheckpointBodyEmbedded !== false ||
        value.checkpointTruth?.semanticAcceptanceCreated !== false ||
        value.checkpointTruth?.memoryPromotionPerformed !== false ||
        value.checkpointTruth?.sourceHistoryDeleted !== false ||
        value.checkpointTruth?.persistencePerformed !== false ||
        value.checkpointTruth?.schedulerCheckpointPerformed !== false ||
        value.checkpointTruth?.successorContextLeaseIssued !== false) return false;
    return true;
  } catch {
    return false;
  }
}


export function verifyWorkingContinuityCheckpointSupersessionPlan(value) {
  try {
    canonicalIdentity(value, {
      refField: 'supersessionPlanRef',
      prefix: 'plan.vexlife.working-continuity-supersession',
      label: 'working checkpoint supersession plan'
    });
    return value.schemaVersion === WORKING_CONTINUITY_CHECKPOINT_SUPERSESSION_PLAN_SCHEMA &&
      value.priorDisposition === 'SUPERSEDED_WHEN_EFFECT_OWNER_COMMITS' &&
      value.successorDisposition === 'CURRENT_WHEN_EFFECT_OWNER_COMMITS' &&
      value.atomicEffectRequired === true &&
      value.priorCheckpointBodyEmbedded === false &&
      value.sourceHistoryDeleted === false &&
      value.effectPerformed === false &&
      value.effectAuthorityGranted === false &&
      typeof value.priorCheckpointRef === 'string' &&
      typeof value.successorCheckpointRef === 'string' &&
      SHA256.test(value.priorCheckpointFingerprint ?? '') &&
      SHA256.test(value.successorCheckpointFingerprint ?? '');
  } catch {
    return false;
  }
}

export function verifyContinuityRolloverPlan(value) {
  try {
    canonicalIdentity(value, {
      refField: 'planRef',
      prefix: 'plan.vexlife.continuity-rollover',
      label: 'continuity rollover plan'
    });
    if (value.schemaVersion !== CONTINUITY_ROLLOVER_PLAN_SCHEMA ||
        value.truthClass !== 'SOURCE_BOUND_EFFECT_FREE_CONTINUITY_ROLLOVER_PLAN' ||
        value.currentness !== 'CURRENT' ||
        !CONTINUITY_ROLLOVER_PLAN_STATES.includes(value.state) ||
        value.effectAuthorityGranted !== false) return false;
    exactFalseEffects(value.effects, Object.keys(PLAN_EFFECTS), 'continuity rollover plan effects');
    if (value.planTruth?.readOnly !== true ||
        value.planTruth?.checkpointEffectPerformed !== false ||
        value.planTruth?.rolloverEffectPerformed !== false ||
        value.planTruth?.contextLeaseIssued !== false ||
        value.planTruth?.semanticAcceptanceCreated !== false ||
        value.planTruth?.memoryPromotionPerformed !== false ||
        value.planTruth?.processKillAuthorityGranted !== false ||
        value.planTruth?.rawTranscriptIncluded !== false ||
        value.planTruth?.rawPrivatePayloadIncluded !== false ||
        value.planTruth?.modelSummaryIncluded !== false) return false;
    const readyState = ['CHECKPOINT_READY', 'ROLLOVER_READY'].includes(value.state);
    if (readyState !== (value.checkpoint !== null)) return false;
    if (!readyState && value.supersessionPlan !== null) return false;
    if (value.checkpoint !== null) {
      if (!verifyWorkingContinuityCheckpoint(value.checkpoint) ||
          value.checkpoint.lineageRef !== value.lineageRef ||
          value.checkpoint.threadRef !== value.threadRef ||
          value.checkpoint.pressureRef !== value.pressureRef ||
          value.checkpoint.pressureFingerprint !== value.pressureFingerprint ||
          value.checkpoint.continuityProjectionRef !== value.continuityProjectionRef ||
          value.checkpoint.continuityProjectionFingerprint !== value.continuityProjectionFingerprint) return false;
    }
    if (value.supersessionPlan !== null) {
      if (!verifyWorkingContinuityCheckpointSupersessionPlan(value.supersessionPlan) ||
          value.checkpoint === null ||
          value.supersessionPlan.successorCheckpointRef !== value.checkpoint.checkpointRef ||
          value.supersessionPlan.successorCheckpointFingerprint !== value.checkpoint.semanticFingerprint ||
          value.supersessionPlan.priorCheckpointRef !== value.checkpoint.priorCheckpointRefOrNull ||
          value.supersessionPlan.priorCheckpointFingerprint !== value.checkpoint.priorCheckpointFingerprintOrNull ||
          value.supersessionPlan.lineageRef !== value.lineageRef ||
          value.supersessionPlan.threadRef !== value.threadRef) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function formContinuityRolloverPlan({
  resourceContextPressure,
  continuityStream,
  priorWorkingCheckpoint = null
} = {}) {
  const pressure = canonicalPressure(resourceContextPressure);
  const continuity = canonicalContinuityProjection(continuityStream);

  if (pressure.lineageRef !== continuity.lineageRef || pressure.threadRef !== continuity.threadRef) {
    fail('pressure and continuity projections must bind the same lineage and thread');
  }

  if (continuity.currentness !== 'CURRENT') {
    return heldPlan({
      state: 'HELD_CONTINUITY_NOT_CURRENT',
      reasons: ['CONTINUITY_STREAM_NOT_CURRENT', ...continuity.currentnessReasonRefs],
      pressure,
      continuity
    });
  }

  if (pressure.state === 'RESOURCE_ATTENTION') {
    return heldPlan({
      state: 'HELD_RESOURCE_ATTENTION',
      reasons: ['RESOURCE_ATTENTION_REQUIRES_RIGHTFUL_OWNER'],
      pressure,
      continuity
    });
  }

  if (!RECOVERY_CLEAR_STATES.has(continuity.recoveryPhaseOrNull)) {
    return heldPlan({
      state: 'HELD_RECOVERY_ACTIVE',
      reasons: [`RECOVERY_PHASE_${continuity.recoveryPhaseOrNull}`],
      pressure,
      continuity
    });
  }

  if (pressure.state === 'NORMAL' || pressure.state === 'WATCH') {
    return finalizedPlan({
      state: 'NO_ACTION_REQUIRED',
      reasonCodes: [pressure.state === 'NORMAL' ? 'PRESSURE_NORMAL' : 'PRESSURE_WATCH_ONLY'],
      pressure,
      continuity,
      checkpoint: null,
      supersessionPlan: null,
      nextSafeAction: 'CONTINUE_CURRENT_CONTEXT'
    });
  }

  if (!['CHECKPOINT_RECOMMENDED', 'ROLLOVER_REQUIRED'].includes(pressure.state)) {
    fail(`unsupported pressure state ${pressure.state}`);
  }

  const checkpoint = formCheckpoint(pressure, continuity, priorWorkingCheckpoint);
  const supersessionPlan = formSupersessionPlan(priorWorkingCheckpoint, checkpoint);
  return finalizedPlan({
    state: pressure.state === 'ROLLOVER_REQUIRED' ? 'ROLLOVER_READY' : 'CHECKPOINT_READY',
    reasonCodes: [
      pressure.state,
      priorWorkingCheckpoint ? 'PRIOR_WORKING_CHECKPOINT_SUPERSESSION_REQUIRED' : 'FIRST_WORKING_CHECKPOINT'
    ],
    pressure,
    continuity,
    checkpoint,
    supersessionPlan,
    nextSafeAction: pressure.state === 'ROLLOVER_REQUIRED'
      ? 'DELEGATE_CHECKPOINT_THEN_SCHEDULER_ISSUED_SUCCESSOR_CONTEXT'
      : 'DELEGATE_WORKING_CHECKPOINT_TO_RIGHTFUL_CHECKPOINT_OWNER'
  });
}

// [VXG RealForever]
