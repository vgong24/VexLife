import assert from 'node:assert/strict';
import test from 'node:test';
import { semanticHash } from '../src/core/utils.mjs';

import {
  RESOURCE_CONTEXT_PRESSURE_POLICY,
  createResourceContextPressureTracker,
  projectResourceContextPressure,
  verifyResourceContextPressureProjection
} from '../src/core/resource-context-pressure.mjs';

function receipt({
  used = 120_000,
  memoryIncluded = false,
  tokenBoundedOutPageCount = 0,
  boundedOutStatementCount = 0,
  heldOrDeferredStatementCount = 0,
  leaseCurrentness = 'CURRENT',
  leaseLifecycle = 'ACTIVE',
  observedAt = '2026-10-26T04:00:30.000Z'
} = {}) {
  const core = {
    schemaVersion: 'vexlife.prompt-context-materialization-receipt/v2',
    authorityRef: 'authority.vexlife.browser-prompt-context-runtime',
    authorityObservedAt: '2026-10-26T04:00:20.000Z',
    providerAuthorityRef: 'authority.vexlife.browser-prompt-context-runtime',
    providerAuthorityObservedAt: observedAt,
    providerBoundaryCurrentnessVerified: true,
    providerBoundarySourceBindingsVerified: true,
    providerExactEventFileReadCount: 3,
    providerHeadMetadataReadCount: 1,
    contextLeaseRef: 'lease.vexlife.browser-prompt-context.test',
    contextLeaseFingerprint: 'a'.repeat(64),
    contextLeaseFormedAt: '2026-10-26T04:00:00.000Z',
    contextLeaseExpiresAt: '2026-10-26T04:01:00.000Z',
    contextLeaseCurrentness: leaseCurrentness,
    contextLeaseLifecycle: leaseLifecycle,
    continuityProjectionRef: 'projection.vexlife.continuity-stream-adapter.test',
    continuityProjectionFingerprint: 'b'.repeat(64),
    lineageRef: 'companion-lineage.vexlife.pressure-test',
    threadRef: 'thread.vexlife.pressure-test',
    priorConversationHeadSha256: 'c'.repeat(64),
    turnRef: 'turn.vexlife.pressure-test',
    currentRequestEventRef: 'event.vexlife.request.pressure-test',
    currentRequestContentHash: 'd'.repeat(64),
    selectedConversationEventRefs: ['event.vexlife.request.prior','event.vexlife.response.prior'],
    memoryContextRefOrNull: memoryIncluded ? 'memory-context.vexlife.prompt.test' : null,
    memoryContextFingerprintOrNull: memoryIncluded ? 'e'.repeat(64) : null,
    memoryContextIncluded: memoryIncluded,
    memorySourceRefs: memoryIncluded ? ['statement.pressure-test'] : [],
    memoryTokenCap: memoryIncluded ? 100_000 : 1,
    memoryEstimatedSystemMessageTokens: memoryIncluded ? 2_000 : 0,
    memoryTokenBoundedOutPageCount: tokenBoundedOutPageCount,
    memoryBoundedOutStatementCount: boundedOutStatementCount,
    memoryHeldOrDeferredStatementCount: heldOrDeferredStatementCount,
    includedSourceRefs: ['event.vexlife.request.prior','event.vexlife.response.prior','event.vexlife.request.pressure-test'],
    orderedMaterializationEntries: [],
    exactMessagesSha256: 'f'.repeat(64),
    messageCount: 3,
    materializedInputTokenEstimate: used,
    contextLeaseInputTokenEstimate: 192_000,
    reservedOutputTokens: 16_000,
    hardTokenLimit: 208_000,
    exactEventFileReadCount: 3,
    headMetadataReadCount: 1,
    wholeHistoryEventEnumerationPerformed: false,
    currentRequestIncludedExactlyOnce: true,
    priorHumanMessagesUnmodified: true,
    priorAssistantMessagesUnmodified: true,
    tokenBudgetSatisfied: true,
    sourceCurrentnessVerified: true,
    crossLineageLeakage: false,
    crossThreadLeakage: false,
    memoryEffectPerformed: false,
    trainingSelectionPerformed: false,
    modelWeightEffectPerformed: false,
    hiddenReasoningIncluded: false
  };
  const semanticFingerprint = semanticHash(core);
  return {
    ...core,
    receiptRef: `receipt.vexlife.prompt-context-materialization.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  };
}

function availability(overrides = {}) {
  const core = {
    schemaVersion: 'vexlife.companion-availability/v1',
    truthClass: 'SOURCE_BOUND_COMPANION_AVAILABILITY',
    registryRef: 'registry.vexlife.companion-availability-reentry.001',
    bindingRef: 'binding.vexlife.heretic-pressure-test',
    homeRef: 'vex-home.pressure-test',
    companionLineageRef: 'companion-lineage.vexlife.pressure-test',
    modelRefOrNull: 'model.devex.heretic.qwen3.8-27b.mlx4.329658ee8f27',
    generationRefOrNull: null,
    runtimeAdapterRef: 'adapter.runtime.mlx.macos-victor.001',
    runtimeObservationRef: 'observation.vexlife.heretic-pressure-test',
    availabilityState: 'READY',
    recoveryClass: 'NONE_REQUIRED',
    reasonCode: 'EXACT_RUNTIME_READY',
    bindingState: 'BOUND',
    runtimeOwnershipState: 'EXACT_OWNED',
    runtimeState: 'HEALTHY',
    qualificationState: 'CURRENT',
    sourceRefs: ['receipt.vexlife.heretic-pressure-test'],
    effectAuthorityGranted: false,
    rendererAuthorityGranted: false,
    modelIdentityAuthorityGranted: false,
    processAuthorityGranted: false,
    conversationAuthorityGranted: false,
    ...overrides
  };
  const projectionSha256 = semanticHash(core);
  return {
    ...core,
    projectionRef: `projection.vexlife.companion-availability.${projectionSha256.slice(0, 32)}`,
    projectionSha256
  };
}

test('pressure policy derives context bands from the source-owned output reserve', () => {
  assert.equal(RESOURCE_CONTEXT_PRESSURE_POLICY.watchEnterReserveMultiples, 3);
  assert.equal(projectResourceContextPressure({ promptContextMaterialization: receipt({ used: 128_000 }), companionAvailability: availability() }).state, 'NORMAL');
  assert.equal(projectResourceContextPressure({ promptContextMaterialization: receipt({ used: 144_000 }), companionAvailability: availability() }).state, 'WATCH');
  assert.equal(projectResourceContextPressure({ promptContextMaterialization: receipt({ used: 160_000 }), companionAvailability: availability() }).state, 'CHECKPOINT_RECOMMENDED');
  assert.equal(projectResourceContextPressure({ promptContextMaterialization: receipt({ used: 176_000 }), companionAvailability: availability() }).state, 'ROLLOVER_REQUIRED');
});

test('Memory bounded-out truth raises pressure without promoting Memory or granting an effect', () => {
  const projection = projectResourceContextPressure({
    promptContextMaterialization: receipt({
      used: 120_000,
      memoryIncluded: true,
      tokenBoundedOutPageCount: 2
    }),
    companionAvailability: availability()
  });
  assert.equal(projection.state, 'CHECKPOINT_RECOMMENDED');
  assert.ok(projection.reasonCodes.includes('MEMORY_CONTINUITY_BOUNDED_OUT'));
  assert.equal(projection.memory.tokenBoundedOutPageCount, 2);
  assert.equal(projection.effectAuthorityGranted, false);
  assert.equal(projection.effects.memoryPromotionPerformed, false);
  assert.equal(projection.projectionTruth.checkpointEffectPerformed, false);
});

test('non-current lease or unhealthy runtime projects RESOURCE_ATTENTION without cleanup authority', () => {
  const leaseAttention = projectResourceContextPressure({
    promptContextMaterialization: receipt({ leaseCurrentness: 'STALE' }),
    companionAvailability: availability()
  });
  assert.equal(leaseAttention.state, 'RESOURCE_ATTENTION');
  assert.ok(leaseAttention.reasonCodes.includes('CONTEXT_LEASE_NOT_CURRENT'));

  const runtimeAttention = projectResourceContextPressure({
    promptContextMaterialization: receipt(),
    companionAvailability: availability({ availabilityState: 'RECOVERABLE', recoveryClass: 'SAFE_REENTRY_AVAILABLE', reasonCode: 'EXACT_SAME_BINDING_REENTRY_AVAILABLE', runtimeOwnershipState: 'NO_OWNED_RUNTIME', runtimeState: 'STOPPED', qualificationState: 'STALE' })
  });
  assert.equal(runtimeAttention.state, 'RESOURCE_ATTENTION');
  assert.ok(runtimeAttention.reasonCodes.includes('RUNTIME_NOT_HEALTHY'));
  assert.equal(runtimeAttention.effects.processKillPerformed, false);
  assert.equal(runtimeAttention.projectionTruth.processKillAuthorityGranted, false);
});

test('missing Companion availability becomes attention rather than inventing healthy runtime truth', () => {
  const projection = projectResourceContextPressure({
    promptContextMaterialization: receipt(),
    companionAvailability: null
  });
  assert.equal(projection.state, 'RESOURCE_ATTENTION');
  assert.ok(projection.reasonCodes.includes('COMPANION_AVAILABILITY_UNAVAILABLE'));
  assert.equal(projection.runtime.availabilityCurrent, false);
});

test('prompt receipt semantic drift fails before source-bound pressure can be projected', () => {
  const canonical = receipt();
  assert.throws(
    () => projectResourceContextPressure({
      promptContextMaterialization: { ...canonical, materializedInputTokenEstimate: canonical.materializedInputTokenEstimate + 1 },
      companionAvailability: availability()
    }),
    /semantic identity is invalid/u
  );
});

test('cross-lineage or invalid Companion availability fails closed to RESOURCE_ATTENTION', () => {
  const crossLineage = projectResourceContextPressure({
    promptContextMaterialization: receipt(),
    companionAvailability: availability({ companionLineageRef: 'companion-lineage.other' })
  });
  assert.equal(crossLineage.state, 'RESOURCE_ATTENTION');
  assert.ok(crossLineage.reasonCodes.includes('COMPANION_IDENTITY_MISMATCH'));

  const invalid = availability();
  const invalidProjection = projectResourceContextPressure({
    promptContextMaterialization: receipt(),
    companionAvailability: { ...invalid, processAuthorityGranted: true }
  });
  assert.equal(invalidProjection.state, 'RESOURCE_ATTENTION');
  assert.ok(invalidProjection.reasonCodes.includes('COMPANION_AVAILABILITY_INVALID'));
});

test('context hysteresis holds prior pressure until a whole output-reserve exit band is crossed', () => {
  const watch = projectResourceContextPressure({
    promptContextMaterialization: receipt({ used: 144_000 }),
    companionAvailability: availability()
  });
  const heldWatch = projectResourceContextPressure({
    promptContextMaterialization: receipt({ used: 132_000 }),
    companionAvailability: availability(),
    previousProjection: watch
  });
  assert.equal(heldWatch.state, 'WATCH');
  assert.equal(heldWatch.prior.hysteresisHeld, true);

  const clearWatch = projectResourceContextPressure({
    promptContextMaterialization: receipt({ used: 127_000 }),
    companionAvailability: availability(),
    previousProjection: heldWatch
  });
  assert.equal(clearWatch.state, 'NORMAL');
  assert.equal(clearWatch.prior.hysteresisHeld, false);

  const rollover = projectResourceContextPressure({
    promptContextMaterialization: receipt({ used: 176_000 }),
    companionAvailability: availability()
  });
  const heldRollover = projectResourceContextPressure({
    promptContextMaterialization: receipt({ used: 162_000 }),
    companionAvailability: availability(),
    previousProjection: rollover
  });
  assert.equal(heldRollover.state, 'ROLLOVER_REQUIRED');
  assert.equal(heldRollover.prior.hysteresisHeld, true);
});

test('projection exposes lease age/headroom and verifies its own source-bound semantic identity', () => {
  const projection = projectResourceContextPressure({
    promptContextMaterialization: receipt({ used: 144_000, memoryIncluded: true }),
    companionAvailability: availability()
  });
  assert.equal(projection.context.inputHeadroomTokens, 48_000);
  assert.equal(projection.context.reservedOutputTokens, 16_000);
  assert.equal(projection.lease.ageMs, 30_000);
  assert.equal(projection.lease.remainingMs, 30_000);
  assert.equal(projection.runtime.runtimeOwnershipStateOrNull, 'EXACT_OWNED');
  assert.equal(verifyResourceContextPressureProjection(projection), true);
  assert.equal(verifyResourceContextPressureProjection({ ...projection, state: 'NORMAL' }), false);
});


test('bounded tracker carries hysteresis per scope without becoming a durable owner', () => {
  const tracker = createResourceContextPressureTracker({ maxEntries: 1 });
  const first = tracker.project({
    scopeRef: 'scope.pressure.one',
    promptContextMaterialization: receipt({ used: 144_000 }),
    companionAvailability: availability()
  });
  assert.equal(first.state, 'WATCH');
  const second = tracker.project({
    scopeRef: 'scope.pressure.one',
    promptContextMaterialization: receipt({ used: 132_000 }),
    companionAvailability: availability()
  });
  assert.equal(second.state, 'WATCH');
  assert.equal(second.prior.hysteresisHeld, true);
  tracker.project({
    scopeRef: 'scope.pressure.two',
    promptContextMaterialization: receipt({ used: 128_000 }),
    companionAvailability: availability()
  });
  assert.equal(tracker.currentSize(), 1);
  assert.equal(tracker.forget('scope.pressure.two'), true);
  assert.equal(tracker.currentSize(), 0);
});

// [VXG RealForever]
