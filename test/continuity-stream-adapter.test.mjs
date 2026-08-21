import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTINUITY_STREAM_ADAPTER_ALL_FALSE_EFFECTS,
  createContinuityStreamAdapterProjection,
} from '../src/core/continuity-stream-adapter.mjs';
import { semanticHash } from '../src/core/utils.mjs';
import { buildGraphSnapshotFingerprint } from '../src/core/intent-workgraph.mjs';
import { buildContextLeaseFingerprint } from '../src/core/context-lease.mjs';
import { buildRecoveryAggregateFingerprint } from '../src/core/runtime-recovery.mjs';

const H = (label) => semanticHash(label);

function fixture() {
  const intent = {
    schemaVersion: 'vexlife.intent-workgraph/v0',
    graphRef: 'graph.fixture.continuity',
    rootIntentRef: 'intent.fixture.continuity',
    intent: { semanticFingerprint: H('intent') },
    interpretations: [],
    proposedPlans: [],
    authorizations: [],
    nodes: [{ workNodeRef: 'work.fixture.current', sourceRefs: [] }],
    transitions: [],
    receipts: [],
    bindingRefs: {},
    currentPointers: {
      transitionByWorkNodeRef: {
        'work.fixture.current': 'transition.fixture.current',
      },
      currentReceiptRefs: ['receipt.fixture.current'],
    },
    createdAt: '2026-08-21T00:00:00.000Z',
  };
  intent.semanticFingerprint = buildGraphSnapshotFingerprint(intent);

  const context = {
    schemaVersion: 'vexlife.intent-context-lease/v1',
    leaseRef: 'context-lease.fixture.current',
    workerRef: 'worker.fixture.current',
    workNodeRef: 'work.fixture.current',
    graphFingerprint: intent.semanticFingerprint,
    trustSnapshotFingerprint: H('trust'),
    runtimeSnapshotFingerprint: H('runtime'),
    schedulerGeneration: 2,
    resourceLeaseFingerprint: H('resource'),
    capabilityLeaseFingerprint: H('capability'),
    effectLeaseFingerprint: H('effect'),
    cancellationTokenRef: 'cancel.fixture.current',
    foundationKernelRef: 'foundation.fixture',
    roleFrameRef: 'role-frame.fixture',
    intentFrameRef: 'intent-frame.fixture',
    selectedAtlasRefs: ['atlas.fixture'],
    selectedSourceRefs: ['source.fixture.current'],
    applicableCultureRefs: ['culture.fixture'],
    applicableLessonRefs: [],
    applicableReleaseRefs: [],
    inputTokenEstimate: 100,
    reservedOutputTokens: 100,
    hardTokenLimit: 1000,
    formedAt: '2026-08-21T00:00:00.000Z',
    expiresAt: '2026-08-21T01:00:00.000Z',
    observedAt: '2026-08-21T00:00:01.000Z',
    currentness: 'CURRENT',
    lifecycle: 'ACTIVE',
    checkpointReturnRef: 'checkpoint.fixture.return',
    observationRefs: [],
  };
  context.semanticFingerprint = buildContextLeaseFingerprint(context);

  const recovery = {
    schemaVersion: 'vexlife.runtime-recovery-aggregate/v1',
    aggregateRef: 'recovery.fixture',
    workNodeRef: 'work.fixture.current',
    sourceStateFingerprint: H('source-state'),
    initialSchedulerGeneration: 2,
    schedulerGeneration: 2,
    phase: 'READY',
    eventLedger: [],
    activeAttempt: null,
    activeFailure: null,
    activeRecoveryCycle: null,
    recoveryCycleHistory: [],
    activePolicyDecision: null,
    currentRecoveryReceipt: null,
    currentCheckpointAdmission: null,
    currentRecoveryActionReceipt: null,
    currentSchedulerClaimLifecycle: null,
    schedulerClaimLifecycleHistory: [],
    schedulerRecoveryHold: null,
    attemptLedger: [],
    failureHistory: [],
    retryBudget: {},
    retryBudgetFingerprint: H('budget'),
    checkpointLineage: [],
    continuationLineage: [],
    contextRecoveryReceipts: [],
    resourceRecoveryReceipts: [],
    rollbackLineage: [],
    quarantinedRefs: [],
    lastKnownGoodRefs: [],
    humanDecisionGates: [],
    terminalRecoveryReceipts: [],
    acceptedExternalEvents: [],
    lastSuccessfulExecutionReceipt: null,
    recoveryConvergenceReceipt: null,
    recoveredFailure: null,
  };
  recovery.semanticFingerprint = buildRecoveryAggregateFingerprint(recovery);

  return {
    portableFrame: {
      schemaVersion: 'vexlife.continuity-stream-portable-frame-binding/v1',
      sourceContractRef: 'contract.vextreme.vex-continuity-stream.v1',
      sdkAcceptedMergeRef: 'github.commit.vextreme-sdk.67dc92a63926955907b500a122f68e85d789608e',
      streamRef: 'stream.fixture',
      lineageRef: 'lineage.fixture',
      threadRef: 'thread.fixture',
      occupancyRef: 'occupancy.fixture',
      runtimeRef: 'runtime.fixture',
      modelSessionRefOrNull: null,
      cursorEventRef: 'event.fixture.3',
      frameRef: 'frame.fixture.3',
      frameFingerprint: `sha256:${H('frame')}`,
      currentness: 'CURRENT',
      sourceRefs: ['source.sdk.frame.fixture'],
    },
    scoreContext: {
      schemaVersion: 'vexlife.score-context-projection/v1',
      state: 'CURRENT',
      currentness: 'CURRENT',
      companionLineageRef: 'lineage.fixture',
      threadRef: 'thread.fixture',
      scoreHeadSha256: H('score-head'),
      sourceConversationHeadSha256: H('conversation-head'),
      currentStatements: [{
        statementRef: 'statement.fixture.current',
        summary: 'private summary must not cross adapter',
        summaryHash: H('private-summary'),
      }],
      openLoops: [{ openLoopRef: 'loop.fixture.open', detail: 'not projected' }],
      attention: [],
      dreamCompleted: false,
      modelWeightsChanged: false,
      rhythmLearned: false,
      synchronizationActivated: false,
      semanticAuthorityCurrentHeadSha256: H('semantic-head'),
    },
    intentWorkgraph: intent,
    contextLease: context,
    continuityObservations: [],
    continuityRecords: [],
    continuitySupersessions: [],
    dailyMemory: {
      schemaVersion: 'vexlife.daily-memory-dream-projection/v1',
      state: 'CURRENT',
      currentness: 'CURRENT',
      currentDailyDreamHead: { privateDetail: 'not projected' },
      currentDailyStratumRef: 'daily-stratum.fixture.current',
      currentDailyStratumSha256: H('daily-stratum'),
      dayRef: 'day.fixture',
      dayIndex: 4,
      activeContinuityStatementRefs: ['statement.fixture.current'],
      heldOrDeferredStatementRefs: [],
      openLoopRefs: ['loop.fixture.open'],
    },
    livingJournal: {
      schemaVersion: 'vexlife.living-journal.memory-archive/v1',
      ownerRef: 'github.issue.vexlife.151',
      state: 'CURRENT',
      currentness: 'CURRENT',
      rawConversationContentIncluded: false,
      totalCommittedDays: 4,
      latestCommittedDailyStratumSha256: H('daily-stratum'),
      selectedDay: {
        archiveDayRef: 'archive-day.fixture',
        dailyStratumRef: 'daily-stratum.fixture.current',
        dailyStratumSha256: H('daily-stratum'),
        pages: [{ summary: 'private archive page must not cross adapter' }],
      },
      effects: {
        homeMutated: false,
        memoryMutated: false,
        semanticAcceptanceCreated: false,
        firstPersonAuthorityGranted: false,
        modelCalled: false,
        translationCalled: false,
        networkCalled: false,
        trainingRan: false,
        modelWeightsChanged: false,
        publicationPerformed: false,
      },
    },
    recoveryAggregate: recovery,
    sourceRefs: [
      'github.issue.vextreme-sdk.1007',
      'github.commit.vexlife.7006a5a39b2b0772eb4f84faa42d404e60c4073a',
    ],
  };
}

test('Stage C projection is deterministic and content addressed', () => {
  const a = createContinuityStreamAdapterProjection(fixture());
  const b = createContinuityStreamAdapterProjection(fixture());
  assert.deepEqual(a, b);
  assert.match(a.semanticFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(
    a.adapterProjectionRef,
    `projection.vexlife.continuity-stream-adapter.${a.semanticFingerprint.slice(0, 32)}`,
  );
});

test('portable lineage and thread bind to accepted Score owner projection', () => {
  const p = createContinuityStreamAdapterProjection(fixture());
  assert.equal(p.current.lineageRef, 'lineage.fixture');
  assert.equal(p.current.threadRef, 'thread.fixture');
  assert.deepEqual(p.current.openLoopRefs, ['loop.fixture.open']);
});

test('adapter exposes only reference-level Score truth, never summary bodies', () => {
  const p = createContinuityStreamAdapterProjection(fixture());
  assert.deepEqual(p.owners.score.currentStatementRefs, ['statement.fixture.current']);
  assert.doesNotMatch(JSON.stringify(p), /private summary must not cross adapter/);
});

test('adapter exposes intent current pointers without creating transitions', () => {
  const p = createContinuityStreamAdapterProjection(fixture());
  assert.deepEqual(p.current.activeWorkNodeRefs, ['work.fixture.current']);
  assert.deepEqual(p.current.currentIntentReceiptRefs, ['receipt.fixture.current']);
  assert.equal(p.effects.intentTransitioned, false);
});

test('intent owner fingerprint mismatch fails closed', () => {
  const f = fixture();
  f.intentWorkgraph.semanticFingerprint = H('forged-intent');
  assert.throws(
    () => createContinuityStreamAdapterProjection(f),
    (error) => error.code === 'INTENT_OWNER_FINGERPRINT_MISMATCH',
  );
});

test('context owner fingerprint mismatch fails closed', () => {
  const f = fixture();
  f.contextLease.selectedSourceRefs.push('source.forged');
  assert.throws(
    () => createContinuityStreamAdapterProjection(f),
    (error) => error.code === 'CONTEXT_OWNER_FINGERPRINT_MISMATCH',
  );
});

test('context work node must remain current in intent owner pointers', () => {
  const f = fixture();
  f.contextLease.workNodeRef = 'work.fixture.other';
  f.contextLease.semanticFingerprint = buildContextLeaseFingerprint(f.contextLease);
  assert.throws(
    () => createContinuityStreamAdapterProjection(f),
    (error) => error.code === 'CROSS_OWNER_IDENTITY_MISMATCH',
  );
});

test('empty accepted continuity record set is owner-validated and non-authorizing', () => {
  const p = createContinuityStreamAdapterProjection(fixture());
  assert.deepEqual(p.current.currentContinuityRecordRefs, []);
  assert.equal(p.effects.continuityAcceptanceCreated, false);
  assert.equal(p.owners.continuity.silentOverwriteAllowed, false);
});

test('malformed continuity record cannot be smuggled through adapter', () => {
  const f = fixture();
  f.continuityRecords = [{}];
  assert.throws(() => createContinuityStreamAdapterProjection(f));
});

test('Daily Memory is observed by refs and does not commit Dream', () => {
  const p = createContinuityStreamAdapterProjection(fixture());
  assert.equal(p.current.currentDailyStratumRefOrNull, 'daily-stratum.fixture.current');
  assert.equal(p.effects.dailyDreamCommitted, false);
});

test('Living Journal page content is filtered out of adapter projection', () => {
  const p = createContinuityStreamAdapterProjection(fixture());
  assert.equal(p.owners.livingJournal.selectedDay.archiveDayRef, 'archive-day.fixture');
  assert.doesNotMatch(JSON.stringify(p), /private archive page must not cross adapter/);
  assert.equal(p.effects.journalRewritten, false);
});

test('Living Journal requires content-absent archive truth', () => {
  const f = fixture();
  f.livingJournal.rawConversationContentIncluded = true;
  assert.throws(
    () => createContinuityStreamAdapterProjection(f),
    (error) => error.code === 'JOURNAL_OWNER_INVALID',
  );
});

test('Living Journal owner effects must remain false', () => {
  const f = fixture();
  f.livingJournal.effects.memoryMutated = true;
  assert.throws(
    () => createContinuityStreamAdapterProjection(f),
    (error) => error.code === 'OWNER_EFFECT_OBSERVED',
  );
});

test('recovery aggregate fingerprint is owner-validated and only phase is projected', () => {
  const p = createContinuityStreamAdapterProjection(fixture());
  assert.equal(p.current.recoveryPhaseOrNull, 'READY');
  assert.equal(p.owners.recovery.eventCount, 0);
  assert.equal(p.effects.recoveryActionApplied, false);
});

test('recovery aggregate fingerprint mismatch fails closed', () => {
  const f = fixture();
  f.recoveryAggregate.phase = 'RECOVERING';
  assert.throws(
    () => createContinuityStreamAdapterProjection(f),
    (error) => error.code === 'RECOVERY_OWNER_FINGERPRINT_MISMATCH',
  );
});

test('accepted Memory observation is not adapter Memory promotion', () => {
  const f = fixture();
  f.scoreContext.currentStatements.push({
    statementRef: 'statement.fixture.accepted-memory',
    summary: 'accepted Memory body remains owner-private',
  });
  const p = createContinuityStreamAdapterProjection(f);
  assert.ok(p.owners.score.currentStatementRefs.includes('statement.fixture.accepted-memory'));
  assert.equal(p.effects.memoryPromoted, false);
  assert.equal(p.projectionTruth.memoryPromotionPerformed, false);
  assert.doesNotMatch(JSON.stringify(p), /accepted Memory body remains owner-private/);
});

test('portable and Score lineage mismatch fails closed', () => {
  const f = fixture();
  f.portableFrame.lineageRef = 'lineage.other';
  assert.throws(
    () => createContinuityStreamAdapterProjection(f),
    (error) => error.code === 'CROSS_OWNER_IDENTITY_MISMATCH',
  );
});

test('portable and Score thread mismatch fails closed', () => {
  const f = fixture();
  f.portableFrame.threadRef = 'thread.other';
  assert.throws(
    () => createContinuityStreamAdapterProjection(f),
    (error) => error.code === 'CROSS_OWNER_IDENTITY_MISMATCH',
  );
});

test('stale portable frame is held rather than promoted to current truth', () => {
  const f = fixture();
  f.portableFrame.currentness = 'STALE';
  const p = createContinuityStreamAdapterProjection(f);
  assert.equal(p.currentness, 'HELD');
  assert.ok(p.currentnessReasonRefs.some((ref) => ref.includes('portable-frame-not-current')));
});

test('Score attention holds adapter currentness without deleting source truth', () => {
  const f = fixture();
  f.scoreContext.attention = [{ code: 'SOURCE_TAIL_ATTENTION', privateDetail: 'not projected' }];
  const p = createContinuityStreamAdapterProjection(f);
  assert.equal(p.currentness, 'HELD');
  assert.equal(p.owners.score.attentionCount, 1);
  assert.doesNotMatch(JSON.stringify(p), /privateDetail/);
});

test('stale Daily Memory or Journal owner holds adapter currentness', () => {
  for (const field of ['dailyMemory', 'livingJournal']) {
    const f = fixture();
    f[field].currentness = 'STALE';
    const p = createContinuityStreamAdapterProjection(f);
    assert.equal(p.currentness, 'HELD');
  }
});

test('every adapter-owned effect remains false', () => {
  const p = createContinuityStreamAdapterProjection(fixture());
  assert.deepEqual(p.effects, CONTINUITY_STREAM_ADAPTER_ALL_FALSE_EFFECTS);
  assert.equal(p.projectionTruth.ownerMutationPerformed, false);
  assert.equal(p.projectionTruth.externalEffectPerformed, false);
});

test('source refs are deterministic, unique and reference-only', () => {
  const f = fixture();
  f.sourceRefs.push('github.issue.vextreme-sdk.1007');
  const p = createContinuityStreamAdapterProjection(f);
  assert.equal(new Set(p.sourceRefs).size, p.sourceRefs.length);
  assert.ok(p.sourceRefs.includes('source.sdk.frame.fixture'));
});

test('adapter output carries no raw transcript, hidden reasoning, private payload, or owner body', () => {
  const p = createContinuityStreamAdapterProjection(fixture());
  const serialized = JSON.stringify(p);
  for (const forbidden of [
    'private summary must not cross adapter',
    'private archive page must not cross adapter',
    'hiddenChainOfThought',
    'raw transcript body',
    'raw payload body',
  ]) assert.doesNotMatch(serialized, new RegExp(forbidden, 'i'));
  assert.equal(p.projectionTruth.rawTranscriptIncluded, false);
  assert.equal(p.projectionTruth.hiddenReasoningIncluded, false);
  assert.equal(p.projectionTruth.rawPrivatePayloadIncluded, false);
});

// [VXG RealForever]
