import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTINUITY_STREAM_ADAPTER_ALL_FALSE_EFFECTS,
  CONTINUITY_STREAM_ADAPTER_SCHEMA
} from '../src/core/continuity-stream-adapter.mjs';
import {
  formContinuityRolloverPlan,
  verifyContinuityRolloverPlan,
  verifyWorkingContinuityCheckpoint
} from '../src/core/continuity-rollover.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const PRESSURE_EFFECTS = Object.freeze({
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

function pressure(state = 'NORMAL', overrides = {}) {
  const core = {
    schemaVersion: 'vexlife.resource-context-pressure-projection/v1',
    truthClass: 'SOURCE_BOUND_RESOURCE_CONTEXT_PRESSURE',
    currentness: 'CURRENT',
    lineageRef: 'companion-lineage.vexlife.rollover-test',
    threadRef: 'thread.vexlife.rollover-test',
    state,
    reasonCodes: state === 'NORMAL' ? ['PRESSURE_WITHIN_NORMAL_BOUNDS'] : [`STATE_${state}`],
    policyRef: 'policy.vexlife.resource-context-pressure.001',
    policyFingerprint: '1'.repeat(64),
    context: {
      materializedInputTokenEstimate: state === 'ROLLOVER_REQUIRED' ? 176_000 : 120_000,
      inputTokenBudget: 192_000,
      inputHeadroomTokens: state === 'ROLLOVER_REQUIRED' ? 16_000 : 72_000,
      reservedOutputTokens: 16_000,
      hardTokenLimit: 208_000
    },
    memory: {
      included: false,
      tokenCap: 1,
      estimatedSystemMessageTokens: 0,
      tokenBoundedOutPageCount: 0,
      boundedOutStatementCount: 0,
      heldOrDeferredStatementCount: 0
    },
    lease: {
      leaseRef: 'lease.vexlife.rollover-test.001',
      currentness: 'CURRENT',
      lifecycle: 'ACTIVE',
      formedAt: '2026-10-26T09:00:00.000Z',
      expiresAt: '2026-10-26T09:01:00.000Z',
      observedAt: '2026-10-26T09:00:30.000Z',
      ageMs: 30_000,
      remainingMs: 30_000
    },
    runtime: {
      availabilityCurrent: true,
      availabilityProjectionRefOrNull: 'projection.vexlife.companion-availability.rollover-test',
      availabilityStateOrNull: 'READY',
      recoveryClassOrNull: 'NONE_REQUIRED',
      availabilityReasonCodeOrNull: 'EXACT_RUNTIME_READY',
      runtimeObservationRefOrNull: 'observation.vexlife.runtime.rollover-test',
      adapterRefOrNull: 'adapter.runtime.mlx.macos-victor.001',
      runtimeOwnershipStateOrNull: 'EXACT_OWNED',
      runtimeStateOrNull: 'HEALTHY',
      qualificationStateOrNull: 'CURRENT'
    },
    prior: {
      pressureRefOrNull: null,
      stateOrNull: null,
      hysteresisHeld: false
    },
    sourceRefs: [
      'receipt.vexlife.prompt-context-materialization.rollover-test',
      'lease.vexlife.rollover-test.001'
    ],
    effectAuthorityGranted: false,
    effects: { ...PRESSURE_EFFECTS },
    projectionTruth: {
      readOnly: true,
      checkpointEffectPerformed: false,
      rolloverEffectPerformed: false,
      cleanupEffectPerformed: false,
      memoryPromotionPerformed: false,
      processKillAuthorityGranted: false,
      hiddenReasoningIncluded: false,
      rawPrivatePayloadIncluded: false
    },
    ...overrides
  };
  const semanticFingerprint = semanticHash(core);
  return {
    ...core,
    pressureRef: `projection.vexlife.resource-context-pressure.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  };
}

function continuity({ currentness = 'CURRENT', recoveryPhaseOrNull = null, suffix = 'a' } = {}) {
  const core = {
    schemaVersion: CONTINUITY_STREAM_ADAPTER_SCHEMA,
    currentness,
    currentnessReasonRefs: currentness === 'CURRENT' ? [] : ['reason.continuity-stream-adapter.test-held'],
    portableFrame: {
      schemaVersion: 'vexlife.continuity-stream-portable-frame-binding/v1',
      sourceContractRef: 'source.contract.vexlife.rollover-test',
      sdkAcceptedMergeRef: 'github.commit.vextreme-sdk.rollover-test',
      streamRef: 'stream.vexlife.rollover-test',
      lineageRef: 'companion-lineage.vexlife.rollover-test',
      threadRef: 'thread.vexlife.rollover-test',
      occupancyRef: 'occupancy.vexlife.rollover-test',
      runtimeRef: 'runtime.vexlife.rollover-test',
      modelSessionRefOrNull: null,
      cursorEventRef: `event.vexlife.rollover-test.${suffix}`,
      frameRef: `frame.vexlife.rollover-test.${suffix}`,
      frameFingerprint: `sha256:${'2'.repeat(64)}`,
      currentness: 'CURRENT',
      sourceRefs: ['source.vexlife.rollover-test']
    },
    owners: {
      score: { currentness: 'CURRENT' },
      intent: { validationState: 'PLAN_VALIDATED' },
      context: {
        schemaVersion: 'vexlife.intent-context-lease/v1',
        leaseRef: `context-lease.vexlife.rollover-test.${suffix}`,
        workerRef: 'worker.vexlife.rollover-test',
        workNodeRef: 'work.vexlife.rollover-test',
        graphFingerprint: '3'.repeat(64),
        schedulerGeneration: suffix === 'a' ? 7 : 8,
        semanticFingerprint: '4'.repeat(64),
        currentness: 'CURRENT',
        lifecycle: 'ACTIVE',
        selectedSourceRefs: ['source.vexlife.rollover-test', `receipt.intent.${suffix}`],
        checkpointReturnRef: `checkpoint.return.vexlife.rollover-test.${suffix}`
      },
      continuity: { state: 'CURRENT' },
      continuityObservationRefs: [],
      dailyMemory: null,
      livingJournal: null,
      recovery: recoveryPhaseOrNull ? { phase: recoveryPhaseOrNull } : null
    },
    current: {
      lineageRef: 'companion-lineage.vexlife.rollover-test',
      threadRef: 'thread.vexlife.rollover-test',
      cursorEventRef: `event.vexlife.rollover-test.${suffix}`,
      frameRef: `frame.vexlife.rollover-test.${suffix}`,
      frameFingerprint: `sha256:${'2'.repeat(64)}`,
      activeWorkNodeRefs: ['work.vexlife.rollover-test'],
      currentIntentReceiptRefs: [`receipt.intent.${suffix}`],
      openLoopRefs: ['open-loop.vexlife.rollover-test'],
      currentStatementRefs: ['statement.vexlife.accepted-memory'],
      currentContinuityRecordRefs: ['continuity-record.vexlife.accepted'],
      currentDailyStratumRefOrNull: null,
      recoveryPhaseOrNull
    },
    sourceRefs: ['source.vexlife.rollover-test'],
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
      externalEffectPerformed: false
    }
  };
  const semanticFingerprint = semanticHash(core);
  return {
    ...core,
    adapterProjectionRef: `projection.vexlife.continuity-stream-adapter.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  };
}

test('NORMAL and WATCH remain effect-free continuation truth without forming a checkpoint', () => {
  for (const state of ['NORMAL', 'WATCH']) {
    const plan = formContinuityRolloverPlan({
      resourceContextPressure: pressure(state),
      continuityStream: continuity()
    });
    assert.equal(plan.state, 'NO_ACTION_REQUIRED');
    assert.equal(plan.checkpoint, null);
    assert.equal(plan.supersessionPlan, null);
    assert.equal(plan.nextSafeAction, 'CONTINUE_CURRENT_CONTEXT');
    assert.equal(plan.effectAuthorityGranted, false);
    assert.ok(Object.values(plan.effects).every((value) => value === false));
    assert.equal(verifyContinuityRolloverPlan(plan), true);
  }
});

test('CHECKPOINT_RECOMMENDED forms one reference-only non-semantic working checkpoint', () => {
  const plan = formContinuityRolloverPlan({
    resourceContextPressure: pressure('CHECKPOINT_RECOMMENDED'),
    continuityStream: continuity()
  });
  assert.equal(plan.state, 'CHECKPOINT_READY');
  assert.equal(plan.nextSafeAction, 'DELEGATE_WORKING_CHECKPOINT_TO_RIGHTFUL_CHECKPOINT_OWNER');
  assert.equal(verifyContinuityRolloverPlan(plan), true);
  assert.equal(verifyWorkingContinuityCheckpoint(plan.checkpoint), true);
  assert.deepEqual(plan.checkpoint.workingSet.activeWorkNodeRefs, ['work.vexlife.rollover-test']);
  assert.deepEqual(plan.checkpoint.workingSet.currentIntentReceiptRefs, ['receipt.intent.a']);
  assert.deepEqual(plan.checkpoint.workingSet.openLoopRefs, ['open-loop.vexlife.rollover-test']);
  assert.deepEqual(plan.checkpoint.workingSet.currentStatementRefs, ['statement.vexlife.accepted-memory']);
  assert.deepEqual(plan.checkpoint.workingSet.currentContinuityRecordRefs, ['continuity-record.vexlife.accepted']);
  assert.equal(plan.checkpoint.semanticMemoryPromotionAuthorized, false);
  assert.equal(plan.checkpoint.modelOutputAcceptedAsMemory, false);
  assert.equal(plan.checkpoint.checkpointTruth.rawTranscriptIncluded, false);
  assert.equal(plan.checkpoint.checkpointTruth.modelSummaryIncluded, false);
  assert.equal(plan.checkpoint.checkpointTruth.persistencePerformed, false);
  assert.ok(Object.values(plan.checkpoint.effects).every((value) => value === false));
});

test('ROLLOVER_REQUIRED supersedes by exact prior ref/fingerprint without recursive checkpoint body stacking', () => {
  const first = formContinuityRolloverPlan({
    resourceContextPressure: pressure('CHECKPOINT_RECOMMENDED'),
    continuityStream: continuity({ suffix: 'a' })
  }).checkpoint;
  const plan = formContinuityRolloverPlan({
    resourceContextPressure: pressure('ROLLOVER_REQUIRED'),
    continuityStream: continuity({ suffix: 'b' }),
    priorWorkingCheckpoint: first
  });
  assert.equal(plan.state, 'ROLLOVER_READY');
  assert.equal(plan.nextSafeAction, 'DELEGATE_CHECKPOINT_THEN_SCHEDULER_ISSUED_SUCCESSOR_CONTEXT');
  assert.equal(plan.checkpoint.priorCheckpointRefOrNull, first.checkpointRef);
  assert.equal(plan.checkpoint.priorCheckpointFingerprintOrNull, first.semanticFingerprint);
  assert.equal(Object.hasOwn(plan.checkpoint, 'priorCheckpoint'), false);
  assert.equal(plan.checkpoint.checkpointTruth.priorCheckpointBodyEmbedded, false);
  assert.equal(plan.supersessionPlan.priorCheckpointRef, first.checkpointRef);
  assert.equal(plan.supersessionPlan.successorCheckpointRef, plan.checkpoint.checkpointRef);
  assert.equal(plan.supersessionPlan.atomicEffectRequired, true);
  assert.equal(plan.supersessionPlan.effectPerformed, false);
  assert.equal(plan.supersessionPlan.sourceHistoryDeleted, false);
  assert.equal(verifyContinuityRolloverPlan(plan), true);
  const tampered = structuredClone(plan);
  tampered.supersessionPlan.sourceHistoryDeleted = true;
  const core = structuredClone(tampered);
  delete core.planRef;
  delete core.semanticFingerprint;
  tampered.semanticFingerprint = semanticHash(core);
  tampered.planRef = `plan.vexlife.continuity-rollover.${tampered.semanticFingerprint.slice(0, 32)}`;
  assert.equal(verifyContinuityRolloverPlan(tampered), false);
});

test('RESOURCE_ATTENTION is held rather than converted into checkpoint or process authority', () => {
  const plan = formContinuityRolloverPlan({
    resourceContextPressure: pressure('RESOURCE_ATTENTION'),
    continuityStream: continuity()
  });
  assert.equal(plan.state, 'HELD_RESOURCE_ATTENTION');
  assert.equal(plan.checkpoint, null);
  assert.equal(plan.nextSafeAction, 'RESOLVE_RESOURCE_ATTENTION_WITH_RIGHTFUL_OWNER');
  assert.equal(plan.planTruth.processKillAuthorityGranted, false);
  assert.equal(plan.effects.processKillPerformed, false);
});

test('non-current continuity is held even when pressure recommends a checkpoint', () => {
  const plan = formContinuityRolloverPlan({
    resourceContextPressure: pressure('CHECKPOINT_RECOMMENDED'),
    continuityStream: continuity({ currentness: 'HELD' })
  });
  assert.equal(plan.state, 'HELD_CONTINUITY_NOT_CURRENT');
  assert.equal(plan.checkpoint, null);
  assert.equal(plan.nextSafeAction, 'REFRESH_CURRENT_CONTINUITY_OWNER_PROJECTION');
});

test('active recovery remains with the recovery owner rather than being repurposed as ordinary rollover', () => {
  const plan = formContinuityRolloverPlan({
    resourceContextPressure: pressure('ROLLOVER_REQUIRED'),
    continuityStream: continuity({ recoveryPhaseOrNull: 'RECOVERING' })
  });
  assert.equal(plan.state, 'HELD_RECOVERY_ACTIVE');
  assert.equal(plan.checkpoint, null);
  assert.equal(plan.nextSafeAction, 'DEFER_TO_ACTIVE_RECOVERY_OWNER');
});

test('pressure and continuity must bind the same lineage/thread and exact semantic identities', () => {
  assert.throws(() => formContinuityRolloverPlan({
    resourceContextPressure: pressure('CHECKPOINT_RECOMMENDED', { threadRef: 'thread.other' }),
    continuityStream: continuity()
  }), /same lineage and thread/u);

  const badPressure = pressure('CHECKPOINT_RECOMMENDED');
  badPressure.state = 'NORMAL';
  assert.throws(() => formContinuityRolloverPlan({
    resourceContextPressure: badPressure,
    continuityStream: continuity()
  }), /semantic identity is invalid/u);

  const badContinuity = continuity();
  badContinuity.current.openLoopRefs = ['open-loop.tampered'];
  assert.throws(() => formContinuityRolloverPlan({
    resourceContextPressure: pressure('CHECKPOINT_RECOMMENDED'),
    continuityStream: badContinuity
  }), /semantic identity is invalid/u);
});

test('prior checkpoint must be current and stay within the same continuity scope', () => {
  const first = formContinuityRolloverPlan({
    resourceContextPressure: pressure('CHECKPOINT_RECOMMENDED'),
    continuityStream: continuity()
  }).checkpoint;
  const stale = structuredClone(first);
  stale.lifecycle = 'SUPERSEDED';
  const core = structuredClone(stale);
  delete core.checkpointRef;
  delete core.semanticFingerprint;
  stale.semanticFingerprint = semanticHash(core);
  stale.checkpointRef = `checkpoint.vexlife.working-continuity.${stale.semanticFingerprint.slice(0, 32)}`;
  assert.throws(() => formContinuityRolloverPlan({
    resourceContextPressure: pressure('ROLLOVER_REQUIRED'),
    continuityStream: continuity({ suffix: 'b' }),
    priorWorkingCheckpoint: stale
  }), /must be CURRENT/u);
});

// [VXG RealForever]
