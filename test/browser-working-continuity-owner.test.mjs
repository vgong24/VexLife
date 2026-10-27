import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BrowserWorkingContinuityOwnerError,
  createBrowserWorkingContinuityOwner
} from '../src/core/browser-working-continuity-owner.mjs';
import { createContextLease } from '../src/core/context-lease.mjs';
import {
  CONTINUITY_STREAM_ADAPTER_ALL_FALSE_EFFECTS,
  CONTINUITY_STREAM_ADAPTER_SCHEMA
} from '../src/core/continuity-stream-adapter.mjs';
import { formContinuityRolloverPlan } from '../src/core/continuity-rollover.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const LINEAGE = 'companion-lineage.vexlife.working-continuity-test';
const THREAD = 'thread.vexlife.working-continuity-test';

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

function makeHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-working-continuity-owner-'));
  return { root, home: path.join(root, 'home') };
}

function clock(...values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function writerLockPath(home) {
  const key = semanticHash({ lineageRef: LINEAGE, threadRef: THREAD }).slice(0, 32);
  return path.join(home, 'runtime', 'working-continuity-writer-locks', `${key}.lock`);
}

function writerLock({
  pid,
  instanceRef = 'instance.vexlife.working-continuity-abandoned',
  formedAt = '2026-10-26T20:50:00.000Z'
}) {
  const core = {
    schemaVersion: 'vexlife.browser-working-continuity-writer-lock/v1',
    effectOwnerRef: 'owner.vexlife.browser-working-continuity.001',
    homeRef: 'vex-home.working-continuity-test',
    deviceRef: 'device.vexlife.working-continuity-test',
    companionLineageRef: LINEAGE,
    threadRef: THREAD,
    instanceRef,
    pid,
    lockToken: 'lock-token.vexlife.working-continuity-test',
    formedAt
  };
  return Object.freeze({ ...core, semanticFingerprint: semanticHash(core) });
}

function pressure(state = 'CHECKPOINT_RECOMMENDED', suffix = 'a') {
  const rollover = state === 'ROLLOVER_REQUIRED';
  const core = {
    schemaVersion: 'vexlife.resource-context-pressure-projection/v1',
    truthClass: 'SOURCE_BOUND_RESOURCE_CONTEXT_PRESSURE',
    currentness: 'CURRENT',
    lineageRef: LINEAGE,
    threadRef: THREAD,
    state,
    reasonCodes: [state],
    policyRef: 'policy.vexlife.resource-context-pressure.001',
    policyFingerprint: '1'.repeat(64),
    context: {
      materializedInputTokenEstimate: rollover ? 176_000 : 160_000,
      inputTokenBudget: 192_000,
      inputHeadroomTokens: rollover ? 16_000 : 32_000,
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
      leaseRef: `lease.vexlife.working-continuity.${suffix}`,
      currentness: 'CURRENT',
      lifecycle: 'ACTIVE',
      formedAt: '2026-10-26T20:00:00.000Z',
      expiresAt: '2026-10-26T20:01:00.000Z',
      observedAt: '2026-10-26T20:00:30.000Z',
      ageMs: 30_000,
      remainingMs: 30_000
    },
    runtime: {
      availabilityCurrent: true,
      availabilityProjectionRefOrNull: 'projection.vexlife.companion-availability.working-continuity',
      availabilityStateOrNull: 'READY',
      recoveryClassOrNull: 'NONE_REQUIRED',
      availabilityReasonCodeOrNull: 'EXACT_RUNTIME_READY',
      runtimeObservationRefOrNull: 'observation.vexlife.runtime.working-continuity',
      adapterRefOrNull: 'adapter.runtime.mlx.macos-victor.001',
      runtimeOwnershipStateOrNull: 'EXACT_OWNED',
      runtimeStateOrNull: 'HEALTHY',
      qualificationStateOrNull: 'CURRENT'
    },
    prior: { pressureRefOrNull: null, stateOrNull: null, hysteresisHeld: false },
    sourceRefs: [`receipt.vexlife.prompt-context-materialization.${suffix}`, `lease.vexlife.working-continuity.${suffix}`],
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
    }
  };
  const semanticFingerprint = semanticHash(core);
  return Object.freeze({
    ...core,
    pressureRef: `projection.vexlife.resource-context-pressure.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

function continuity(suffix = 'a') {
  const generation = suffix === 'a' ? 2 : suffix === 'b' ? 4 : 6;
  const core = {
    schemaVersion: CONTINUITY_STREAM_ADAPTER_SCHEMA,
    currentness: 'CURRENT',
    currentnessReasonRefs: [],
    portableFrame: { sourceRefs: [] },
    owners: {
      context: {
        leaseRef: `lease.vexlife.working-continuity.${suffix}`,
        semanticFingerprint: semanticHash({ lease: suffix }),
        checkpointReturnRef: `checkpoint.vexlife.browser-prompt-context.${suffix}`,
        schedulerGeneration: generation,
        workNodeRef: `work-node.vexlife.browser-prompt-context.${suffix}`,
        selectedSourceRefs: [`event.vexlife.prior.${suffix}`],
        currentness: 'CURRENT',
        lifecycle: 'ACTIVE'
      }
    },
    current: {
      lineageRef: LINEAGE,
      threadRef: THREAD,
      cursorEventRef: `event.vexlife.current.${suffix}`,
      frameRef: `frame.vexlife.working-continuity.${suffix}`,
      frameFingerprint: `sha256:${semanticHash({ frame: suffix })}`,
      activeWorkNodeRefs: [],
      currentIntentReceiptRefs: [],
      openLoopRefs: [`open-loop.vexlife.${suffix}`],
      currentStatementRefs: [],
      currentContinuityRecordRefs: [],
      currentDailyStratumRefOrNull: null,
      recoveryPhaseOrNull: null
    },
    sourceRefs: [`source.vexlife.working-continuity.${suffix}`],
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
  return Object.freeze({
    ...core,
    adapterProjectionRef: `projection.vexlife.continuity-stream-adapter.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

function owner(home, now) {
  return createBrowserWorkingContinuityOwner({
    home,
    homeRef: 'vex-home.working-continuity-test',
    deviceRef: 'device.vexlife.working-continuity-test',
    companionLineageRef: LINEAGE,
    instanceRef: 'instance.vexlife.working-continuity-test',
    now
  });
}

test('working continuity owner commits one reference-only checkpoint without semantic Memory or successor Context effects', () => {
  const fixture = makeHome();
  try {
    const effectOwner = owner(fixture.home, clock(
      '2026-10-26T20:10:00.000Z',
      '2026-10-26T20:10:00.100Z'
    ));
    const plan = formContinuityRolloverPlan({
      resourceContextPressure: pressure('CHECKPOINT_RECOMMENDED', 'a'),
      continuityStream: continuity('a')
    });
    assert.equal(plan.state, 'CHECKPOINT_READY');
    const committed = effectOwner.commitPlan({ plan });
    assert.equal(committed.state, 'COMMITTED');
    assert.equal(committed.commitReceipt.disposition, 'CHECKPOINT_COMMITTED');
    assert.equal(committed.commitReceipt.effects.checkpointPersisted, true);
    assert.equal(committed.commitReceipt.effects.priorCheckpointSuperseded, false);
    assert.equal(committed.commitReceipt.effects.successorContextLeaseIssued, false);
    assert.equal(committed.commitReceipt.effects.semanticAcceptanceCreated, false);
    assert.equal(committed.commitReceipt.effects.memoryPromotionPerformed, false);
    assert.equal(committed.commitReceipt.effects.sourceHistoryDeleted, false);
    assert.equal(committed.checkpoint.checkpointTruth.persistencePerformed, false);
    assert.equal(committed.checkpoint.checkpointTruth.modelSummaryIncluded, false);
    assert.equal(Object.hasOwn(committed.checkpoint, 'rawTranscript'), false);

    const current = effectOwner.readCurrent({ threadRef: THREAD });
    assert.equal(current.state, 'CURRENT');
    assert.equal(current.checkpoint.checkpointRef, plan.checkpoint.checkpointRef);
    assert.equal(current.commitReceipt.commitReceiptRef, committed.commitReceipt.commitReceiptRef);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('exact retry is idempotent and a fresh owner instance re-enters the same current checkpoint', () => {
  const fixture = makeHome();
  try {
    const firstOwner = owner(fixture.home, clock(
      '2026-10-26T20:20:00.000Z',
      '2026-10-26T20:20:00.100Z',
      '2026-10-26T20:20:01.000Z'
    ));
    const plan = formContinuityRolloverPlan({
      resourceContextPressure: pressure('CHECKPOINT_RECOMMENDED', 'a'),
      continuityStream: continuity('a')
    });
    const first = firstOwner.commitPlan({ plan });
    const retry = firstOwner.commitPlan({ plan });
    assert.equal(retry.state, 'IDEMPOTENT_CURRENT');
    assert.equal(retry.commitReceipt.commitReceiptRef, first.commitReceipt.commitReceiptRef);

    const restarted = owner(fixture.home, () => '2026-10-26T20:21:00.000Z');
    const current = restarted.readCurrent({ threadRef: THREAD });
    assert.equal(current.state, 'CURRENT');
    assert.equal(current.checkpoint.semanticFingerprint, plan.checkpoint.semanticFingerprint);
    assert.equal(current.commitReceipt.commitReceiptRef, first.commitReceipt.commitReceiptRef);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('ROLLOVER_READY atomically advances current checkpoint by exact ref/fingerprint while preserving prior body as history', () => {
  const fixture = makeHome();
  try {
    const effectOwner = owner(fixture.home, clock(
      '2026-10-26T20:30:00.000Z',
      '2026-10-26T20:30:00.100Z',
      '2026-10-26T20:31:00.000Z',
      '2026-10-26T20:31:00.100Z'
    ));
    const firstPlan = formContinuityRolloverPlan({
      resourceContextPressure: pressure('CHECKPOINT_RECOMMENDED', 'a'),
      continuityStream: continuity('a')
    });
    const first = effectOwner.commitPlan({ plan: firstPlan });
    const secondPlan = formContinuityRolloverPlan({
      resourceContextPressure: pressure('ROLLOVER_REQUIRED', 'b'),
      continuityStream: continuity('b'),
      priorWorkingCheckpoint: first.checkpoint
    });
    assert.equal(secondPlan.state, 'ROLLOVER_READY');
    const second = effectOwner.commitPlan({ plan: secondPlan });
    assert.equal(second.state, 'COMMITTED');
    assert.equal(second.commitReceipt.disposition, 'ROLLOVER_COMMITTED');
    assert.equal(second.commitReceipt.effects.priorCheckpointSuperseded, true);
    assert.equal(second.commitReceipt.successorContextRequired, true);
    assert.equal(second.commitReceipt.effects.successorContextLeaseIssued, false);
    assert.equal(second.checkpoint.priorCheckpointRefOrNull, first.checkpoint.checkpointRef);
    assert.equal(second.checkpoint.priorCheckpointFingerprintOrNull, first.checkpoint.semanticFingerprint);
    assert.equal(Object.hasOwn(second.checkpoint, 'priorCheckpoint'), false);

    const key = semanticHash({ lineageRef: LINEAGE, threadRef: THREAD }).slice(0, 32);
    const checkpointDir = path.join(fixture.home, 'working-continuity', key, 'checkpoints');
    assert.equal(fs.existsSync(path.join(checkpointDir, `${first.checkpoint.semanticFingerprint}.json`)), true);
    assert.equal(fs.existsSync(path.join(checkpointDir, `${second.checkpoint.semanticFingerprint}.json`)), true);
    const current = effectOwner.readCurrent({ threadRef: THREAD });
    assert.equal(current.checkpoint.checkpointRef, second.checkpoint.checkpointRef);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('owner rejects non-ready plans and stale successor lineage without mutating the current checkpoint', () => {
  const fixture = makeHome();
  try {
    const effectOwner = owner(fixture.home, clock(
      '2026-10-26T20:40:00.000Z',
      '2026-10-26T20:40:00.100Z',
      '2026-10-26T20:41:00.000Z'
    ));
    const normal = formContinuityRolloverPlan({
      resourceContextPressure: pressure('NORMAL', 'a'),
      continuityStream: continuity('a')
    });
    assert.throws(
      () => effectOwner.commitPlan({ plan: normal }),
      (error) => error instanceof BrowserWorkingContinuityOwnerError && error.code === 'WORKING_CONTINUITY_PLAN_NOT_COMMITTABLE'
    );

    const firstPlan = formContinuityRolloverPlan({
      resourceContextPressure: pressure('CHECKPOINT_RECOMMENDED', 'a'),
      continuityStream: continuity('a')
    });
    const first = effectOwner.commitPlan({ plan: firstPlan });
    const secondPlan = formContinuityRolloverPlan({
      resourceContextPressure: pressure('CHECKPOINT_RECOMMENDED', 'b'),
      continuityStream: continuity('b'),
      priorWorkingCheckpoint: first.checkpoint
    });
    const second = effectOwner.commitPlan({ plan: secondPlan });
    const stalePlan = formContinuityRolloverPlan({
      resourceContextPressure: pressure('ROLLOVER_REQUIRED', 'c'),
      continuityStream: continuity('c'),
      priorWorkingCheckpoint: first.checkpoint
    });
    assert.throws(
      () => effectOwner.commitPlan({ plan: stalePlan }),
      (error) => error instanceof BrowserWorkingContinuityOwnerError && error.code === 'WORKING_CONTINUITY_PRIOR_MISMATCH'
    );
    const current = effectOwner.readCurrent({ threadRef: THREAD });
    assert.equal(current.checkpoint.checkpointRef, second.checkpoint.checkpointRef);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});


test('abandoned writer recovery is exact, process-bound and does not mutate checkpoint or Memory state', () => {
  const fixture = makeHome();
  try {
    const effectOwner = owner(fixture.home, () => '2026-10-26T20:50:01.000Z');
    const lockPath = writerLockPath(fixture.home);
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, `${JSON.stringify(writerLock({ pid: 99_999_999 }), null, 2)}\n`, { mode: 0o600 });

    assert.throws(
      () => effectOwner.commitPlan({
        plan: formContinuityRolloverPlan({
          resourceContextPressure: pressure('CHECKPOINT_RECOMMENDED', 'a'),
          continuityStream: continuity('a')
        })
      }),
      (error) => error instanceof BrowserWorkingContinuityOwnerError &&
        error.code === 'WORKING_CONTINUITY_WRITER_RECOVERY_REQUIRED'
    );

    const recovery = effectOwner.recoverAbandonedWriter({
      threadRef: THREAD,
      expectedAbandonedInstanceRef: 'instance.vexlife.working-continuity-abandoned'
    });
    assert.equal(recovery.state, 'ABANDONED_WRITER_RECOVERED');
    assert.equal(recovery.recovered, true);
    assert.equal(recovery.effects.writerLockRemoved, true);
    assert.equal(recovery.effects.checkpointMutated, false);
    assert.equal(recovery.effects.currentHeadMutated, false);
    assert.equal(recovery.effects.memoryMutated, false);
    assert.equal(recovery.effects.modelCalled, false);
    assert.equal(fs.existsSync(lockPath), false);
    assert.equal(effectOwner.readCurrent({ threadRef: THREAD }).state, 'ABSENT');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('active writer recovery is refused and lock-release failure cannot be reported as COMMITTED', () => {
  const fixture = makeHome();
  const lockPath = writerLockPath(fixture.home);
  try {
    const recoveryOwner = owner(fixture.home, () => '2026-10-26T20:51:00.000Z');
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, `${JSON.stringify(writerLock({
      pid: process.pid,
      instanceRef: 'instance.vexlife.working-continuity-active'
    }), null, 2)}\n`, { mode: 0o600 });
    assert.throws(
      () => recoveryOwner.recoverAbandonedWriter({
        threadRef: THREAD,
        expectedAbandonedInstanceRef: 'instance.vexlife.working-continuity-active'
      }),
      (error) => error instanceof BrowserWorkingContinuityOwnerError &&
        error.code === 'WORKING_CONTINUITY_WRITER_CONFLICT'
    );
    fs.unlinkSync(lockPath);

    const effectOwner = owner(fixture.home, clock(
      '2026-10-26T20:52:00.000Z',
      '2026-10-26T20:52:00.100Z'
    ));
    const plan = formContinuityRolloverPlan({
      resourceContextPressure: pressure('CHECKPOINT_RECOMMENDED', 'a'),
      continuityStream: continuity('a')
    });
    const originalUnlink = fs.unlinkSync;
    fs.unlinkSync = (file) => {
      if (file === lockPath) throw new Error('SIMULATED_LOCK_RELEASE_FAILURE');
      return originalUnlink(file);
    };
    try {
      assert.throws(
        () => effectOwner.commitPlan({ plan }),
        (error) => error instanceof BrowserWorkingContinuityOwnerError &&
          error.code === 'WORKING_CONTINUITY_WRITER_CONFLICT' &&
          /could not be released safely/u.test(error.message)
      );
    } finally {
      fs.unlinkSync = originalUnlink;
    }
    assert.equal(fs.existsSync(lockPath), true);
    assert.equal(effectOwner.readCurrent({ threadRef: THREAD }).state, 'CURRENT');
    fs.unlinkSync(lockPath);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('ROLLOVER_COMMITTED admits one exact successor request and records one semantic Context Lease without mutating checkpoint head', () => {
  const fixture = makeHome();
  try {
    const effectOwner = owner(fixture.home, clock(
      '2026-10-26T21:00:00.000Z',
      '2026-10-26T21:00:00.100Z',
      '2026-10-26T21:00:01.000Z',
      '2026-10-26T21:00:01.100Z',
      '2026-10-26T21:00:02.000Z',
      '2026-10-26T21:00:02.100Z'
    ));
    const firstPlan = formContinuityRolloverPlan({
      resourceContextPressure: pressure('CHECKPOINT_RECOMMENDED', 'a'),
      continuityStream: continuity('a')
    });
    const first = effectOwner.commitPlan({ plan: firstPlan });
    const rolloverPlan = formContinuityRolloverPlan({
      resourceContextPressure: pressure('ROLLOVER_REQUIRED', 'b'),
      continuityStream: continuity('b'),
      priorWorkingCheckpoint: first.checkpoint
    });
    const rollover = effectOwner.commitPlan({ plan: rolloverPlan });
    const headBefore = effectOwner.readCurrent({ threadRef: THREAD }).head;
    const currentRequestEventBinding = Object.freeze({
      eventRef: 'event.vexlife.successor.request.001',
      eventHash: '7'.repeat(64),
      sequence: 7
    });
    const claimed = effectOwner.claimSuccessorContext({
      threadRef: THREAD,
      priorConversationHeadSha256: '8'.repeat(64),
      priorRequestEventRef: rollover.checkpoint.workingSet.cursorEventRef,
      currentRequestEventBinding
    });
    assert.equal(claimed.state, 'CLAIMED');
    assert.equal(claimed.successorClaim.effects.successorContextLeaseIssued, false);
    assert.equal(claimed.successorClaim.checkpointRef, rollover.checkpoint.checkpointRef);

    const selectedSourceRefs = [
      rollover.checkpoint.checkpointRef,
      rollover.commitReceipt.commitReceiptRef,
      claimed.successorClaim.successorClaimRef
    ].sort();
    const lease = createContextLease({
      leaseRef: 'lease.vexlife.browser-prompt-context.successor-test',
      workerRef: 'worker.vexlife.browser-prompt-context-runtime',
      workNodeRef: 'work-node.vexlife.browser-prompt-context.successor-test',
      graphFingerprint: semanticHash({ class: 'graph', selectedSourceRefs }),
      trustSnapshotFingerprint: semanticHash({ class: 'trust', selectedSourceRefs }),
      runtimeSnapshotFingerprint: semanticHash({ class: 'runtime', selectedSourceRefs }),
      schedulerGeneration: currentRequestEventBinding.sequence,
      resourceLeaseFingerprint: semanticHash({ class: 'resource', selectedSourceRefs }),
      capabilityLeaseFingerprint: semanticHash({ class: 'capability', selectedSourceRefs }),
      effectLeaseFingerprint: semanticHash({ class: 'effect', selectedSourceRefs }),
      cancellationTokenRef: 'cancellation.vexlife.browser-prompt-context.successor-test',
      foundationKernelRef: 'foundation.vexlife.browser-prompt-context-runtime',
      roleFrameRef: 'role-frame.vexlife.browser-prompt-context-runtime',
      intentFrameRef: 'intent-frame.vexlife.browser-prompt-context.successor-test',
      selectedAtlasRefs: [],
      selectedSourceRefs,
      applicableCultureRefs: [],
      applicableLessonRefs: [],
      applicableReleaseRefs: [],
      inputTokenEstimate: 192000,
      reservedOutputTokens: 16000,
      hardTokenLimit: 208000,
      formedAt: '2026-10-26T21:00:03.000Z',
      expiresAt: '2026-10-26T21:01:03.000Z',
      observedAt: '2026-10-26T21:00:03.000Z',
      currentness: 'CURRENT',
      lifecycle: 'ACTIVE',
      checkpointReturnRef: rollover.checkpoint.checkpointRef
    }).lease;
    const recorded = effectOwner.recordSuccessorContextLease({
      threadRef: THREAD,
      successorClaimRef: claimed.successorClaim.successorClaimRef,
      successorClaimFingerprint: claimed.successorClaim.semanticFingerprint,
      contextLease: lease
    });
    assert.equal(recorded.state, 'RECORDED');
    assert.equal(recorded.issuanceReceipt.effects.successorContextLeaseIssued, true);
    assert.equal(recorded.issuanceReceipt.effects.checkpointMutated, false);
    assert.equal(recorded.issuanceReceipt.effects.currentHeadMutated, false);
    assert.equal(recorded.issuanceReceipt.contextLeaseFingerprint, lease.semanticFingerprint);
    const successor = effectOwner.readSuccessorContext({ threadRef: THREAD });
    assert.equal(successor.state, 'ISSUED');
    assert.equal(successor.successorClaim.successorClaimRef, claimed.successorClaim.successorClaimRef);
    assert.equal(successor.issuanceReceipt.successorReceiptRef, recorded.issuanceReceipt.successorReceiptRef);
    assert.deepEqual(effectOwner.readCurrent({ threadRef: THREAD }).head, headBefore);

    const retriedClaim = effectOwner.claimSuccessorContext({
      threadRef: THREAD,
      priorConversationHeadSha256: '8'.repeat(64),
      priorRequestEventRef: rollover.checkpoint.workingSet.cursorEventRef,
      currentRequestEventBinding
    });
    assert.equal(retriedClaim.state, 'IDEMPOTENT_CURRENT');
    const retriedReceipt = effectOwner.recordSuccessorContextLease({
      threadRef: THREAD,
      successorClaimRef: claimed.successorClaim.successorClaimRef,
      successorClaimFingerprint: claimed.successorClaim.semanticFingerprint,
      contextLease: lease
    });
    assert.equal(retriedReceipt.state, 'IDEMPOTENT_CURRENT');
    assert.equal(retriedReceipt.issuanceReceipt.successorReceiptRef, recorded.issuanceReceipt.successorReceiptRef);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('successor claim refuses a different request and checkpoint-only commits do not mint successor authority', () => {
  const fixture = makeHome();
  try {
    const effectOwner = owner(fixture.home, clock(
      '2026-10-26T21:10:00.000Z',
      '2026-10-26T21:10:00.100Z',
      '2026-10-26T21:10:01.000Z',
      '2026-10-26T21:10:01.100Z'
    ));
    const checkpointPlan = formContinuityRolloverPlan({
      resourceContextPressure: pressure('CHECKPOINT_RECOMMENDED', 'a'),
      continuityStream: continuity('a')
    });
    const checkpoint = effectOwner.commitPlan({ plan: checkpointPlan });
    assert.equal(effectOwner.readSuccessorContext({ threadRef: THREAD }).state, 'NOT_REQUIRED');
    assert.throws(
      () => effectOwner.claimSuccessorContext({
        threadRef: THREAD,
        priorConversationHeadSha256: '8'.repeat(64),
        priorRequestEventRef: checkpoint.checkpoint.workingSet.cursorEventRef,
        currentRequestEventBinding: { eventRef: 'event.vexlife.successor.not-required', eventHash: '7'.repeat(64), sequence: 3 }
      }),
      (error) => error instanceof BrowserWorkingContinuityOwnerError && error.code === 'WORKING_CONTINUITY_SUCCESSOR_NOT_REQUIRED'
    );

    const rolloverPlan = formContinuityRolloverPlan({
      resourceContextPressure: pressure('ROLLOVER_REQUIRED', 'b'),
      continuityStream: continuity('b'),
      priorWorkingCheckpoint: checkpoint.checkpoint
    });
    const rollover = effectOwner.commitPlan({ plan: rolloverPlan });
    const binding = { eventRef: 'event.vexlife.successor.bound', eventHash: '6'.repeat(64), sequence: 7 };
    effectOwner.claimSuccessorContext({
      threadRef: THREAD,
      priorConversationHeadSha256: '5'.repeat(64),
      priorRequestEventRef: rollover.checkpoint.workingSet.cursorEventRef,
      currentRequestEventBinding: binding
    });
    assert.throws(
      () => effectOwner.claimSuccessorContext({
        threadRef: THREAD,
        priorConversationHeadSha256: '5'.repeat(64),
        priorRequestEventRef: rollover.checkpoint.workingSet.cursorEventRef,
        currentRequestEventBinding: { eventRef: 'event.vexlife.successor.other', eventHash: '4'.repeat(64), sequence: 7 }
      }),
      (error) => error instanceof BrowserWorkingContinuityOwnerError && error.code === 'WORKING_CONTINUITY_SUCCESSOR_ALREADY_CLAIMED'
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});


function continuityWithPriorCheckpointCursor(priorCheckpoint, suffix = 'b') {
  const value = structuredClone(continuity(suffix));
  value.owners.context.schedulerGeneration = priorCheckpoint.contextLease.schedulerGeneration + 2;
  value.owners.context.selectedSourceRefs = [...new Set([
    ...value.owners.context.selectedSourceRefs,
    priorCheckpoint.workingSet.cursorEventRef
  ])].sort();
  const core = structuredClone(value);
  delete core.adapterProjectionRef;
  delete core.semanticFingerprint;
  const semanticFingerprint = semanticHash(core);
  return Object.freeze({
    ...core,
    adapterProjectionRef: `projection.vexlife.continuity-stream-adapter.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

test('adjacent repeated checkpoint pressure commits rollover authority without rewriting checkpoint pressure state', () => {
  const fixture = makeHome();
  try {
    const effectOwner = owner(fixture.home, clock(
      '2026-10-26T23:00:00.000Z',
      '2026-10-26T23:00:00.100Z',
      '2026-10-26T23:01:00.000Z',
      '2026-10-26T23:01:00.100Z'
    ));
    const firstPlan = formContinuityRolloverPlan({
      resourceContextPressure: pressure('CHECKPOINT_RECOMMENDED', 'a'),
      continuityStream: continuity('a')
    });
    const first = effectOwner.commitPlan({ plan: firstPlan });
    assert.equal(first.commitReceipt.disposition, 'CHECKPOINT_COMMITTED');
    const rolloverPlan = formContinuityRolloverPlan({
      resourceContextPressure: pressure('CHECKPOINT_RECOMMENDED', 'b'),
      continuityStream: continuityWithPriorCheckpointCursor(first.checkpoint, 'b'),
      priorWorkingCheckpoint: first.checkpoint
    });
    assert.equal(rolloverPlan.state, 'ROLLOVER_READY');
    assert.equal(rolloverPlan.checkpoint.pressureState, 'CHECKPOINT_RECOMMENDED');
    const rollover = effectOwner.commitPlan({ plan: rolloverPlan });
    assert.equal(rollover.commitReceipt.disposition, 'ROLLOVER_COMMITTED');
    assert.equal(rollover.commitReceipt.successorContextRequired, true);
    assert.equal(rollover.checkpoint.pressureState, 'CHECKPOINT_RECOMMENDED');
    assert.equal(effectOwner.readSuccessorContext({ threadRef: THREAD }).state, 'READY');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

// [VXG RealForever]
