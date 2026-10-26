import assert from 'node:assert/strict';
import test from 'node:test';

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
  return {
    schemaVersion: 'vexlife.prompt-context-materialization-receipt/v2',
    receiptRef: 'receipt.vexlife.prompt-context-materialization.test',
    authorityObservedAt: '2026-10-26T04:00:20.000Z',
    providerAuthorityObservedAt: observedAt,
    providerBoundaryCurrentnessVerified: true,
    providerBoundarySourceBindingsVerified: true,
    contextLeaseRef: 'lease.vexlife.browser-prompt-context.test',
    contextLeaseCurrentness: leaseCurrentness,
    contextLeaseLifecycle: leaseLifecycle,
    contextLeaseFormedAt: '2026-10-26T04:00:00.000Z',
    contextLeaseExpiresAt: '2026-10-26T04:01:00.000Z',
    continuityProjectionRef: 'projection.vexlife.continuity-stream-adapter.test',
    lineageRef: 'companion-lineage.vexlife.pressure-test',
    threadRef: 'thread.vexlife.pressure-test',
    memoryContextRefOrNull: memoryIncluded ? 'memory-context.vexlife.prompt.test' : null,
    memoryContextIncluded: memoryIncluded,
    memoryTokenCap: memoryIncluded ? 100_000 : 1,
    memoryEstimatedSystemMessageTokens: memoryIncluded ? 2_000 : 0,
    memoryTokenBoundedOutPageCount: tokenBoundedOutPageCount,
    memoryBoundedOutStatementCount: boundedOutStatementCount,
    memoryHeldOrDeferredStatementCount: heldOrDeferredStatementCount,
    materializedInputTokenEstimate: used,
    contextLeaseInputTokenEstimate: 192_000,
    reservedOutputTokens: 16_000,
    hardTokenLimit: 208_000
  };
}

function runtime(overrides = {}) {
  return {
    schemaVersion: 'vexlife.companion-runtime-adapter-observation/v1',
    observationRef: 'observation.vexlife.heretic-pressure-test',
    adapterRef: 'adapter.runtime.mlx.macos-victor.001',
    currentness: 'CURRENT',
    runtimeOwnershipState: 'EXACT_OWNED',
    runtimeState: 'HEALTHY',
    qualificationState: 'CURRENT',
    safeReentryState: 'HELD',
    ...overrides
  };
}

test('pressure policy derives context bands from the source-owned output reserve', () => {
  assert.equal(RESOURCE_CONTEXT_PRESSURE_POLICY.watchEnterReserveMultiples, 3);
  assert.equal(projectResourceContextPressure({ promptContextMaterialization: receipt({ used: 128_000 }), runtimeObservation: runtime() }).state, 'NORMAL');
  assert.equal(projectResourceContextPressure({ promptContextMaterialization: receipt({ used: 144_000 }), runtimeObservation: runtime() }).state, 'WATCH');
  assert.equal(projectResourceContextPressure({ promptContextMaterialization: receipt({ used: 160_000 }), runtimeObservation: runtime() }).state, 'CHECKPOINT_RECOMMENDED');
  assert.equal(projectResourceContextPressure({ promptContextMaterialization: receipt({ used: 176_000 }), runtimeObservation: runtime() }).state, 'ROLLOVER_REQUIRED');
});

test('Memory bounded-out truth raises pressure without promoting Memory or granting an effect', () => {
  const projection = projectResourceContextPressure({
    promptContextMaterialization: receipt({
      used: 120_000,
      memoryIncluded: true,
      tokenBoundedOutPageCount: 2
    }),
    runtimeObservation: runtime()
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
    runtimeObservation: runtime()
  });
  assert.equal(leaseAttention.state, 'RESOURCE_ATTENTION');
  assert.ok(leaseAttention.reasonCodes.includes('CONTEXT_LEASE_NOT_CURRENT'));

  const runtimeAttention = projectResourceContextPressure({
    promptContextMaterialization: receipt(),
    runtimeObservation: runtime({ runtimeState: 'STOPPED', qualificationState: 'STALE' })
  });
  assert.equal(runtimeAttention.state, 'RESOURCE_ATTENTION');
  assert.ok(runtimeAttention.reasonCodes.includes('RUNTIME_NOT_HEALTHY'));
  assert.equal(runtimeAttention.effects.processKillPerformed, false);
  assert.equal(runtimeAttention.projectionTruth.processKillAuthorityGranted, false);
});

test('missing runtime observation becomes attention rather than inventing healthy host truth', () => {
  const projection = projectResourceContextPressure({
    promptContextMaterialization: receipt(),
    runtimeObservation: null
  });
  assert.equal(projection.state, 'RESOURCE_ATTENTION');
  assert.ok(projection.reasonCodes.includes('RUNTIME_OBSERVATION_UNAVAILABLE'));
  assert.equal(projection.runtime.observationAvailable, false);
});

test('context hysteresis holds prior pressure until a whole output-reserve exit band is crossed', () => {
  const watch = projectResourceContextPressure({
    promptContextMaterialization: receipt({ used: 144_000 }),
    runtimeObservation: runtime()
  });
  const heldWatch = projectResourceContextPressure({
    promptContextMaterialization: receipt({ used: 132_000 }),
    runtimeObservation: runtime(),
    previousProjection: watch
  });
  assert.equal(heldWatch.state, 'WATCH');
  assert.equal(heldWatch.prior.hysteresisHeld, true);

  const clearWatch = projectResourceContextPressure({
    promptContextMaterialization: receipt({ used: 127_000 }),
    runtimeObservation: runtime(),
    previousProjection: heldWatch
  });
  assert.equal(clearWatch.state, 'NORMAL');
  assert.equal(clearWatch.prior.hysteresisHeld, false);

  const rollover = projectResourceContextPressure({
    promptContextMaterialization: receipt({ used: 176_000 }),
    runtimeObservation: runtime()
  });
  const heldRollover = projectResourceContextPressure({
    promptContextMaterialization: receipt({ used: 162_000 }),
    runtimeObservation: runtime(),
    previousProjection: rollover
  });
  assert.equal(heldRollover.state, 'ROLLOVER_REQUIRED');
  assert.equal(heldRollover.prior.hysteresisHeld, true);
});

test('projection exposes lease age/headroom and verifies its own source-bound semantic identity', () => {
  const projection = projectResourceContextPressure({
    promptContextMaterialization: receipt({ used: 144_000, memoryIncluded: true }),
    runtimeObservation: runtime()
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
    runtimeObservation: runtime()
  });
  assert.equal(first.state, 'WATCH');
  const second = tracker.project({
    scopeRef: 'scope.pressure.one',
    promptContextMaterialization: receipt({ used: 132_000 }),
    runtimeObservation: runtime()
  });
  assert.equal(second.state, 'WATCH');
  assert.equal(second.prior.hysteresisHeld, true);
  tracker.project({
    scopeRef: 'scope.pressure.two',
    promptContextMaterialization: receipt({ used: 128_000 }),
    runtimeObservation: runtime()
  });
  assert.equal(tracker.currentSize(), 1);
  assert.equal(tracker.forget('scope.pressure.two'), true);
  assert.equal(tracker.currentSize(), 0);
});

// [VXG RealForever]
