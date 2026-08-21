import path from 'node:path';
import { loadBlueprint, VEXLIFE_ROOT } from './blueprint.mjs';
import { createContextLease } from './context-lease.mjs';
import {
  validateContinuityObservation,
  validateContinuityRecordSet,
} from './continuity-evolution-router.mjs';
import { validateIntentWorkgraph } from './intent-validation.mjs';
import { createRecoveryAggregate } from './runtime-recovery.mjs';
import { readJson, semanticHash } from './utils.mjs';

const OWNER_VALIDATION_BUNDLE = loadBlueprint(VEXLIFE_ROOT);
const OWNER_INTENT_REGISTRY = OWNER_VALIDATION_BUNDLE.intentRegistry;
const OWNER_INTENT_TRUST_SNAPSHOT = readJson(
  path.join(VEXLIFE_ROOT, 'blueprint/intent-trust-snapshot.json'),
);
const OWNER_INTENT_PROCESS_REFS = OWNER_VALIDATION_BUNDLE.factory.processes
  .map((item) => item.processRef);
const OWNER_INTENT_ROLE_REFS = OWNER_VALIDATION_BUNDLE.blueprint.roles
  .map((item) => item.roleRef);
const OWNER_RECOVERY_REGISTRY = OWNER_VALIDATION_BUNDLE.blueprint.runtimeRecovery;

export const CONTINUITY_STREAM_ADAPTER_SCHEMA =
  'vexlife.continuity-stream-adapter-projection/v1';

export const CONTINUITY_STREAM_ADAPTER_EFFECT_KEYS = Object.freeze([
  'homeMutated',
  'memoryPromoted',
  'scoreAppended',
  'intentTransitioned',
  'contextLeaseCreated',
  'continuityAcceptanceCreated',
  'recoveryActionApplied',
  'dailyDreamCommitted',
  'journalRewritten',
  'providerCalled',
  'networkCalled',
  'publicationPerformed',
  'modelCalled',
  'trainingRan',
  'modelWeightsChanged',
  'relationshipMutated',
  'externalDisclosure',
]);

export const CONTINUITY_STREAM_ADAPTER_ALL_FALSE_EFFECTS = Object.freeze(
  Object.fromEntries(CONTINUITY_STREAM_ADAPTER_EFFECT_KEYS.map((key) => [key, false])),
);

const SHA256 = /^[0-9a-f]{64}$/u;
const SHA256_REF = /^sha256:[0-9a-f]{64}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9._:/#-]*$/u;
const CURRENTNESS = new Set(['CURRENT', 'STALE', 'UNKNOWN', 'HELD']);
const RECOVERY_PHASES = new Set([
  'READY', 'FAILURE_ACTIVE', 'CHECKPOINTED', 'RECOVERING',
  'WAITING_HUMAN', 'QUARANTINED', 'BLOCKED', 'COMPLETED',
]);

function fail(code, message, details = null) {
  const error = new Error(message);
  error.name = 'ContinuityStreamAdapterError';
  error.code = code;
  error.details = details;
  throw error;
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('ADAPTER_INPUT_INVALID', `${label} must be an object`);
  }
  return value;
}

function stableRef(value, label) {
  if (typeof value !== 'string' || !REF.test(value)) {
    fail('ADAPTER_INPUT_INVALID', `${label} must be a stable reference`);
  }
  return value;
}

function optionalRef(value, label) {
  return value === null || value === undefined ? null : stableRef(value, label);
}

function sha256(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail('ADAPTER_INPUT_INVALID', `${label} must be a lowercase SHA-256`);
  }
  return value;
}

function sha256Ref(value, label) {
  if (typeof value !== 'string' || !SHA256_REF.test(value)) {
    fail('ADAPTER_INPUT_INVALID', `${label} must be a sha256: reference`);
  }
  return value;
}

function stableRefs(values, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || !REF.test(value))) {
    fail('ADAPTER_INPUT_INVALID', `${label} must contain only stable references`);
  }
  return [...new Set(values)].sort();
}

function optionalSha256(value, label) {
  return value === null || value === undefined ? null : sha256(value, label);
}

function safeInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail('ADAPTER_INPUT_INVALID', `${label} must be a safe integer >= ${minimum}`);
  }
  return value;
}

function optionalSafeInteger(value, label, minimum = 0) {
  return value === null || value === undefined ? null : safeInteger(value, label, minimum);
}

function allObservedEffectsFalse(value, label) {
  if (value === undefined || value === null) return true;
  object(value, label);
  const active = Object.entries(value).filter(([, observed]) => observed !== false);
  if (active.length) {
    fail('OWNER_EFFECT_OBSERVED', `${label} contains a non-false owner effect`, {
      fields: active.map(([key]) => key).sort(),
    });
  }
  return true;
}

function portableFrameBinding(value) {
  object(value, 'portableFrame');
  if (value.schemaVersion !== 'vexlife.continuity-stream-portable-frame-binding/v1') {
    fail('PORTABLE_FRAME_INVALID', 'portableFrame schema is unsupported');
  }
  if (!CURRENTNESS.has(value.currentness)) {
    fail('PORTABLE_FRAME_INVALID', 'portableFrame currentness is unsupported');
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    sourceContractRef: stableRef(value.sourceContractRef, 'portableFrame.sourceContractRef'),
    sdkAcceptedMergeRef: stableRef(value.sdkAcceptedMergeRef, 'portableFrame.sdkAcceptedMergeRef'),
    streamRef: stableRef(value.streamRef, 'portableFrame.streamRef'),
    lineageRef: stableRef(value.lineageRef, 'portableFrame.lineageRef'),
    threadRef: stableRef(value.threadRef, 'portableFrame.threadRef'),
    occupancyRef: stableRef(value.occupancyRef, 'portableFrame.occupancyRef'),
    runtimeRef: stableRef(value.runtimeRef, 'portableFrame.runtimeRef'),
    modelSessionRefOrNull: optionalRef(value.modelSessionRefOrNull, 'portableFrame.modelSessionRefOrNull'),
    cursorEventRef: stableRef(value.cursorEventRef, 'portableFrame.cursorEventRef'),
    frameRef: stableRef(value.frameRef, 'portableFrame.frameRef'),
    frameFingerprint: sha256Ref(value.frameFingerprint, 'portableFrame.frameFingerprint'),
    currentness: value.currentness,
    sourceRefs: stableRefs(value.sourceRefs ?? [], 'portableFrame.sourceRefs'),
  });
}

function scoreBinding(value) {
  object(value, 'scoreContext');
  if (value.schemaVersion !== 'vexlife.score-context-projection/v1') {
    fail('SCORE_OWNER_INVALID', 'scoreContext is not the accepted owner projection schema');
  }
  const currentStatements = Array.isArray(value.currentStatements) ? value.currentStatements : [];
  const openLoops = Array.isArray(value.openLoops) ? value.openLoops : [];
  allObservedEffectsFalse({
    dreamCompleted: value.dreamCompleted,
    modelWeightsChanged: value.modelWeightsChanged,
    rhythmLearned: value.rhythmLearned,
    synchronizationActivated: value.synchronizationActivated,
  }, 'scoreContext observed effects');
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    state: stableRef(value.state, 'scoreContext.state'),
    currentness: stableRef(value.currentness, 'scoreContext.currentness'),
    companionLineageRef: stableRef(value.companionLineageRef, 'scoreContext.companionLineageRef'),
    threadRef: stableRef(value.threadRef, 'scoreContext.threadRef'),
    scoreHeadSha256: optionalSha256(value.scoreHeadSha256, 'scoreContext.scoreHeadSha256'),
    sourceConversationHeadSha256: optionalSha256(
      value.sourceConversationHeadSha256,
      'scoreContext.sourceConversationHeadSha256',
    ),
    semanticAuthorityCurrentHeadSha256: optionalSha256(
      value.semanticAuthorityCurrentHeadSha256,
      'scoreContext.semanticAuthorityCurrentHeadSha256',
    ),
    currentStatementRefs: stableRefs(
      currentStatements.map((item, index) =>
        stableRef(item?.statementRef, `scoreContext.currentStatements[${index}].statementRef`)),
      'scoreContext.currentStatementRefs',
    ),
    openLoopRefs: stableRefs(
      openLoops.map((item, index) =>
        stableRef(item?.openLoopRef ?? item?.loopRef, `scoreContext.openLoops[${index}].openLoopRef`)),
      'scoreContext.openLoopRefs',
    ),
    attentionCount: Array.isArray(value.attention) ? value.attention.length : 0,
  });
}

function intentBinding(value) {
  object(value, 'intentWorkgraph');
  if (value.schemaVersion !== 'vexlife.intent-workgraph/v0') {
    fail('INTENT_OWNER_INVALID', 'intentWorkgraph is not the accepted owner schema');
  }
  const validation = validateIntentWorkgraph(value, {
    registry: OWNER_INTENT_REGISTRY,
    registeredProcessRefs: OWNER_INTENT_PROCESS_REFS,
    registeredRoleRefs: OWNER_INTENT_ROLE_REFS,
    trustSnapshot: OWNER_INTENT_TRUST_SNAPSHOT,
  });
  if (!validation.ok) {
    fail('INTENT_OWNER_INVALID', 'intentWorkgraph failed its source-managed owner validator', {
      errors: validation.errors,
    });
  }
  const envelope = object(value.intent, 'intentWorkgraph.intent');
  const pointers = object(value.currentPointers ?? {}, 'intentWorkgraph.currentPointers');
  const transitions = object(
    pointers.transitionByWorkNodeRef ?? {},
    'intentWorkgraph.currentPointers.transitionByWorkNodeRef',
  );
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    graphRef: stableRef(value.graphRef, 'intentWorkgraph.graphRef'),
    rootIntentRef: stableRef(value.rootIntentRef, 'intentWorkgraph.rootIntentRef'),
    semanticFingerprint: sha256(value.semanticFingerprint, 'intentWorkgraph.semanticFingerprint'),
    sourceLineageRef: stableRef(envelope.sourceLineageRef, 'intentWorkgraph.intent.sourceLineageRef'),
    threadRef: stableRef(envelope.threadRef, 'intentWorkgraph.intent.threadRef'),
    validationState: validation.state,
    attentionCount: Array.isArray(validation.attentions) ? validation.attentions.length : 0,
    nodeRefs: stableRefs(
      (value.nodes ?? []).map((item, index) =>
        stableRef(item?.workNodeRef, `intentWorkgraph.nodes[${index}].workNodeRef`)),
      'intentWorkgraph.nodeRefs',
    ),
    currentWorkNodeRefs: stableRefs(Object.keys(transitions), 'intentWorkgraph.currentWorkNodeRefs'),
    currentTransitionRefs: stableRefs(Object.values(transitions), 'intentWorkgraph.currentTransitionRefs'),
    currentReceiptRefs: stableRefs(pointers.currentReceiptRefs ?? [], 'intentWorkgraph.currentReceiptRefs'),
  });
}

function contextBinding(value) {
  object(value, 'contextLease');
  if (value.schemaVersion !== 'vexlife.intent-context-lease/v1') {
    fail('CONTEXT_OWNER_INVALID', 'contextLease is not the accepted owner schema');
  }
  let canonical;
  try {
    canonical = createContextLease(value).lease;
  } catch (error) {
    fail('CONTEXT_OWNER_INVALID', 'contextLease failed its source-managed owner constructor', {
      ownerError: error.message,
    });
  }
  return Object.freeze({
    schemaVersion: canonical.schemaVersion,
    leaseRef: stableRef(canonical.leaseRef, 'contextLease.leaseRef'),
    workerRef: stableRef(canonical.workerRef, 'contextLease.workerRef'),
    workNodeRef: stableRef(canonical.workNodeRef, 'contextLease.workNodeRef'),
    graphFingerprint: sha256(canonical.graphFingerprint, 'contextLease.graphFingerprint'),
    schedulerGeneration: safeInteger(
      canonical.schedulerGeneration,
      'contextLease.schedulerGeneration',
      0,
    ),
    semanticFingerprint: sha256(canonical.semanticFingerprint, 'contextLease.semanticFingerprint'),
    currentness: stableRef(canonical.currentness, 'contextLease.currentness'),
    lifecycle: stableRef(canonical.lifecycle, 'contextLease.lifecycle'),
    selectedSourceRefs: stableRefs(
      canonical.selectedSourceRefs ?? [],
      'contextLease.selectedSourceRefs',
    ),
    checkpointReturnRef: stableRef(
      canonical.checkpointReturnRef,
      'contextLease.checkpointReturnRef',
    ),
  });
}

function continuityBinding(records, supersessions) {
  if (!Array.isArray(records) || !Array.isArray(supersessions)) {
    fail('CONTINUITY_OWNER_INVALID', 'continuity records and supersessions must be arrays');
  }
  const receipt = validateContinuityRecordSet(records, supersessions);
  object(receipt, 'continuityRecordSet');
  return Object.freeze({
    currentRecordSetRef: stableRef(receipt.currentRecordSetRef, 'continuityRecordSet.currentRecordSetRef'),
    semanticFingerprint: sha256(receipt.semanticFingerprint, 'continuityRecordSet.semanticFingerprint'),
    state: stableRef(receipt.state, 'continuityRecordSet.state'),
    currentRecordRefs: stableRefs(receipt.currentRecordRefs ?? [], 'continuityRecordSet.currentRecordRefs'),
    supersededRecordRefs: stableRefs(
      receipt.supersededRecordRefs ?? [],
      'continuityRecordSet.supersededRecordRefs',
    ),
    conflictCount: Array.isArray(receipt.conflicts) ? receipt.conflicts.length : 0,
    silentOverwriteAllowed: receipt.silentOverwriteAllowed === true,
  });
}

function observationBinding(values) {
  if (!Array.isArray(values)) {
    fail('CONTINUITY_OWNER_INVALID', 'continuityObservations must be an array');
  }
  return stableRefs(values.map((item, index) => {
    const canonical = validateContinuityObservation(item);
    return stableRef(
      canonical.observationRef,
      `continuityObservations[${index}].observationRef`,
    );
  }), 'continuityObservationRefs');
}

function dailyMemoryBinding(value) {
  if (value === null || value === undefined) return null;
  object(value, 'dailyMemory');
  if (value.schemaVersion !== 'vexlife.daily-memory-dream-projection/v1') {
    fail('DAILY_MEMORY_OWNER_INVALID', 'dailyMemory is not the accepted owner projection schema');
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    state: stableRef(value.state, 'dailyMemory.state'),
    currentness: stableRef(value.currentness, 'dailyMemory.currentness'),
    currentDailyStratumRef: optionalRef(value.currentDailyStratumRef, 'dailyMemory.currentDailyStratumRef'),
    currentDailyStratumSha256: optionalSha256(
      value.currentDailyStratumSha256,
      'dailyMemory.currentDailyStratumSha256',
    ),
    dayRef: optionalRef(value.dayRef, 'dailyMemory.dayRef'),
    dayIndex: optionalSafeInteger(value.dayIndex, 'dailyMemory.dayIndex', 0),
    activeContinuityStatementRefs: stableRefs(
      value.activeContinuityStatementRefs ?? [],
      'dailyMemory.activeContinuityStatementRefs',
    ),
    heldOrDeferredStatementRefs: stableRefs(
      value.heldOrDeferredStatementRefs ?? [],
      'dailyMemory.heldOrDeferredStatementRefs',
    ),
    openLoopRefs: stableRefs(value.openLoopRefs ?? [], 'dailyMemory.openLoopRefs'),
  });
}

function journalBinding(value) {
  if (value === null || value === undefined) return null;
  object(value, 'livingJournal');
  if (value.schemaVersion !== 'vexlife.living-journal.memory-archive/v1') {
    fail('JOURNAL_OWNER_INVALID', 'livingJournal is not the accepted owner projection schema');
  }
  if (value.rawConversationContentIncluded !== false) {
    fail('JOURNAL_OWNER_INVALID', 'livingJournal must attest rawConversationContentIncluded=false');
  }
  allObservedEffectsFalse(value.effects, 'livingJournal.effects');
  const selected = value.selectedDay && typeof value.selectedDay === 'object'
    ? {
        archiveDayRef: optionalRef(
          value.selectedDay.archiveDayRef,
          'livingJournal.selectedDay.archiveDayRef',
        ),
        dailyStratumRef: optionalRef(
          value.selectedDay.dailyStratumRef,
          'livingJournal.selectedDay.dailyStratumRef',
        ),
        dailyStratumSha256: optionalSha256(
          value.selectedDay.dailyStratumSha256,
          'livingJournal.selectedDay.dailyStratumSha256',
        ),
      }
    : null;
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    ownerRef: stableRef(value.ownerRef, 'livingJournal.ownerRef'),
    state: stableRef(value.state, 'livingJournal.state'),
    currentness: stableRef(value.currentness, 'livingJournal.currentness'),
    totalCommittedDays: Number.isSafeInteger(value.totalCommittedDays) ? value.totalCommittedDays : 0,
    latestCommittedDailyStratumSha256: optionalSha256(
      value.latestCommittedDailyStratumSha256,
      'livingJournal.latestCommittedDailyStratumSha256',
    ),
    selectedDay: selected,
  });
}

function recoveryBinding(value) {
  if (value === null || value === undefined) return null;
  object(value, 'recoveryAggregate');
  if (value.schemaVersion !== 'vexlife.runtime-recovery-aggregate/v1') {
    fail('RECOVERY_OWNER_INVALID', 'recoveryAggregate is not the accepted owner aggregate schema');
  }
  let canonical;
  try {
    canonical = createRecoveryAggregate(value, { registry: OWNER_RECOVERY_REGISTRY });
  } catch (error) {
    fail('RECOVERY_OWNER_INVALID', 'recoveryAggregate failed owner-native replay validation', {
      ownerError: error.message,
    });
  }
  if (!RECOVERY_PHASES.has(canonical.phase)) {
    fail('RECOVERY_OWNER_INVALID', 'recoveryAggregate phase is unsupported');
  }
  return Object.freeze({
    schemaVersion: canonical.schemaVersion,
    aggregateRef: stableRef(canonical.aggregateRef, 'recoveryAggregate.aggregateRef'),
    workNodeRef: stableRef(canonical.workNodeRef, 'recoveryAggregate.workNodeRef'),
    sourceStateFingerprint: sha256(
      canonical.sourceStateFingerprint,
      'recoveryAggregate.sourceStateFingerprint',
    ),
    semanticFingerprint: sha256(
      canonical.semanticFingerprint,
      'recoveryAggregate.semanticFingerprint',
    ),
    phase: canonical.phase,
    schedulerGeneration: safeInteger(
      canonical.schedulerGeneration,
      'recoveryAggregate.schedulerGeneration',
      1,
    ),
    eventCount: canonical.eventLedger.length,
    currentCheckpointRefOrNull: optionalRef(
      canonical.currentCheckpointAdmission?.checkpointRef
        ?? canonical.currentCheckpointAdmission?.recoveryCheckpointRef
        ?? null,
      'recoveryAggregate.currentCheckpointRefOrNull',
    ),
  });
}

function adapterCurrentness({
  portable,
  score,
  intent,
  context,
  continuity,
  dailyMemory,
  livingJournal,
}) {
  const reasons = [];
  if (portable.currentness !== 'CURRENT') reasons.push('PORTABLE_FRAME_NOT_CURRENT');
  if (score.currentness !== 'CURRENT' || score.attentionCount > 0) reasons.push('SCORE_NOT_CURRENT');
  if (intent.validationState !== 'PLAN_VALIDATED' || intent.attentionCount > 0) {
    reasons.push('INTENT_NOT_CURRENT');
  }
  if (context.currentness !== 'CURRENT' || context.lifecycle !== 'ACTIVE') reasons.push('CONTEXT_NOT_CURRENT');
  if (continuity.state !== 'CURRENT' || continuity.conflictCount > 0) {
    reasons.push('CONTINUITY_RECORD_SET_NOT_CURRENT');
  }
  if (dailyMemory && dailyMemory.currentness !== 'CURRENT') reasons.push('DAILY_MEMORY_NOT_CURRENT');
  if (livingJournal && livingJournal.currentness !== 'CURRENT') reasons.push('LIVING_JOURNAL_NOT_CURRENT');
  return {
    state: reasons.length ? 'HELD' : 'CURRENT',
    reasonRefs: reasons.map((reason) =>
      `reason.continuity-stream-adapter.${reason.toLowerCase().replaceAll('_', '-')}`),
  };
}

function assertCrossOwnerIdentity(portable, score, intent, context, recovery) {
  if (portable.lineageRef !== score.companionLineageRef
      || portable.lineageRef !== intent.sourceLineageRef) {
    fail(
      'CROSS_OWNER_IDENTITY_MISMATCH',
      'portable, Score and intent lineage references must be exact-equal',
    );
  }
  if (portable.threadRef !== score.threadRef || portable.threadRef !== intent.threadRef) {
    fail(
      'CROSS_OWNER_IDENTITY_MISMATCH',
      'portable, Score and intent thread references must be exact-equal',
    );
  }
  if (context.graphFingerprint !== intent.semanticFingerprint) {
    fail(
      'CROSS_OWNER_IDENTITY_MISMATCH',
      'context lease graph fingerprint does not equal current intent graph fingerprint',
    );
  }
  if (!intent.nodeRefs.includes(context.workNodeRef)) {
    fail(
      'CROSS_OWNER_IDENTITY_MISMATCH',
      'context lease work node does not exist in the validated intent workgraph',
    );
  }
  if (intent.currentWorkNodeRefs.length
      && !intent.currentWorkNodeRefs.includes(context.workNodeRef)) {
    fail(
      'CROSS_OWNER_IDENTITY_MISMATCH',
      'context lease work node is not current in validated intent pointers',
    );
  }
  if (recovery && recovery.workNodeRef !== context.workNodeRef) {
    fail(
      'CROSS_OWNER_IDENTITY_MISMATCH',
      'recovery work node does not equal current context lease work node',
    );
  }
  if (recovery && recovery.schedulerGeneration !== context.schedulerGeneration) {
    fail(
      'CROSS_OWNER_IDENTITY_MISMATCH',
      'recovery scheduler generation does not equal current context lease generation',
    );
  }
}

export function createContinuityStreamAdapterProjection(input) {
  object(input, 'input');

  const portable = portableFrameBinding(input.portableFrame);
  const score = scoreBinding(input.scoreContext);
  const intent = intentBinding(input.intentWorkgraph);
  const context = contextBinding(input.contextLease);
  const continuity = continuityBinding(
    input.continuityRecords ?? [],
    input.continuitySupersessions ?? [],
  );
  const continuityObservationRefs = observationBinding(input.continuityObservations ?? []);
  const dailyMemory = dailyMemoryBinding(input.dailyMemory ?? null);
  const livingJournal = journalBinding(input.livingJournal ?? null);
  const recovery = recoveryBinding(input.recoveryAggregate ?? null);
  assertCrossOwnerIdentity(portable, score, intent, context, recovery);

  const currentness = adapterCurrentness({
    portable,
    score,
    intent,
    context,
    continuity,
    dailyMemory,
    livingJournal,
  });

  const openLoopRefs = stableRefs([
    ...score.openLoopRefs,
    ...(dailyMemory?.openLoopRefs ?? []),
  ], 'adapter.openLoopRefs');

  const sourceRefs = stableRefs([
    ...(input.sourceRefs ?? []),
    ...portable.sourceRefs,
  ], 'adapter.sourceRefs');

  const core = {
    schemaVersion: CONTINUITY_STREAM_ADAPTER_SCHEMA,
    currentness: currentness.state,
    currentnessReasonRefs: currentness.reasonRefs,
    portableFrame: portable,
    owners: {
      score,
      intent,
      context,
      continuity,
      continuityObservationRefs,
      dailyMemory,
      livingJournal,
      recovery,
    },
    current: {
      lineageRef: portable.lineageRef,
      threadRef: portable.threadRef,
      cursorEventRef: portable.cursorEventRef,
      frameRef: portable.frameRef,
      frameFingerprint: portable.frameFingerprint,
      activeWorkNodeRefs: intent.currentWorkNodeRefs,
      currentIntentReceiptRefs: intent.currentReceiptRefs,
      openLoopRefs,
      currentStatementRefs: score.currentStatementRefs,
      currentContinuityRecordRefs: continuity.currentRecordRefs,
      currentDailyStratumRefOrNull: dailyMemory?.currentDailyStratumRef ?? null,
      recoveryPhaseOrNull: recovery?.phase ?? null,
    },
    sourceRefs,
    effects: { ...CONTINUITY_STREAM_ADAPTER_ALL_FALSE_EFFECTS },
    projectionTruth: {
      readOnly: true,
      ownerMutationPerformed: false,
      rawTranscriptIncluded: false,
      hiddenReasoningIncluded: false,
      rawPrivatePayloadIncluded: false,
      semanticAcceptanceCreated: false,
      memoryPromotionPerformed: false,
      recoveryActionPerformed: false,
      externalEffectPerformed: false,
    },
  };
  const semanticFingerprint = semanticHash(core);
  return Object.freeze({
    ...core,
    adapterProjectionRef:
      `projection.vexlife.continuity-stream-adapter.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint,
  });
}

// [VXG RealForever]
