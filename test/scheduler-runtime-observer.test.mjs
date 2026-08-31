import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadBlueprint } from '../src/core/blueprint.mjs';
import { createResourceSnapshot } from '../src/core/resource-admission.mjs';
import {
  createSchedulerRuntimeTrustSnapshot
} from '../src/core/scheduler-runtime-trust.mjs';
import {
  CompanionReadRuntimeAuthority,
  COMPANION_READ_RESOURCE_REQUEST,
  COMPANION_READ_RUNTIME_AUTHORITY_REF,
  COMPANION_READ_RUNTIME_EVIDENCE_CLASS,
  COMPANION_READ_RUNTIME_SOURCE_DESCRIPTOR,
  COMPANION_READ_RUNTIME_SOURCE_HASH,
  COMPANION_READ_RUNTIME_SOURCE_REF,
  COMPANION_READ_WORKER_REFS
} from '../src/core/scheduler-runtime-observer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schedulerRegistry = loadBlueprint(root).schedulerRegistry;
const OBSERVED = '2026-08-31T20:00:00.000Z';
const EXPIRES = '2026-08-31T20:01:00.000Z';
const GENERATION = 7;
const GENERIC_SOURCE_HASH = '93c5df1596471fb48738876ab255a0f3d98f6580a0c8a345e7ae1fa694eaa283';

function observer() {
  return new CompanionReadRuntimeAuthority({
    schedulerRegistry,
    platform: 'linux',
    clock: () => new Date(OBSERVED),
    ttlMs: 60_000
  });
}

function observation(authority, workerRef = COMPANION_READ_WORKER_REFS[0], generation = GENERATION) {
  return authority.observe({
    workerRef,
    schedulerGeneration: generation,
    actorRef: 'vex.companion.runtime',
    roleRef: 'role.vex.developer',
    claimRef: `claim.companion.read.${generation}.${workerRef.split('.').at(-1)}`,
    occupancyRef: `occupancy.companion.read.${generation}.${workerRef.split('.').at(-1)}`,
    sourceRef: 'source.forged.caller',
    sourceHash: 'f'.repeat(64),
    authorityRef: 'authority.forged.caller',
    observedAt: '1999-01-01T00:00:00.000Z',
    currentness: 'FORGED'
  });
}

function workerLease(runtimeTrustSnapshot, {
  leaseRef,
  schedulerInstanceRef
}) {
  return {
    schemaVersion: 'vexlife.intent-worker-lease/v1',
    leaseRef,
    workerLeaseRef: leaseRef,
    workerRef: runtimeTrustSnapshot.workerRef,
    schedulerInstanceRef,
    workNodeRef: `work.${schedulerInstanceRef}`,
    graphFingerprint: 'a'.repeat(64),
    trustSnapshotFingerprint: 'b'.repeat(64),
    runtimeSnapshotRef: runtimeTrustSnapshot.snapshotRef,
    runtimeSnapshotFingerprint: runtimeTrustSnapshot.semanticFingerprint,
    schedulerGeneration: runtimeTrustSnapshot.schedulerGeneration,
    formedAt: runtimeTrustSnapshot.formedAt,
    observedAt: runtimeTrustSnapshot.observedAt,
    expiresAt: runtimeTrustSnapshot.expiresAt,
    currentness: 'CURRENT',
    lifecycle: 'ACTIVE'
  };
}

test('generic Companion read runtime source is exact, live, bounded and source-managed', () => {
  assert.equal(COMPANION_READ_RUNTIME_SOURCE_HASH, GENERIC_SOURCE_HASH);
  assert.equal(COMPANION_READ_RUNTIME_SOURCE_DESCRIPTOR.readWorkerSlotMaximum, 8);
  assert.deepEqual(COMPANION_READ_RUNTIME_SOURCE_DESCRIPTOR.supportedPlatforms, ['darwin', 'linux', 'win32']);
  assert.deepEqual(COMPANION_READ_RUNTIME_SOURCE_DESCRIPTOR.workerRefs, COMPANION_READ_WORKER_REFS);
  assert.equal(COMPANION_READ_RUNTIME_SOURCE_DESCRIPTOR.workerClass, 'NON_MODEL_COMPANION_READ_EXECUTOR_SLOT');
  assert.equal(COMPANION_READ_RUNTIME_SOURCE_DESCRIPTOR.selfCertificationAllowed, false);
  assert.deepEqual(COMPANION_READ_RESOURCE_REQUEST, {
    cpuSlots: 1,
    ramMb: 64,
    vramMb: 0,
    modelTurn: false,
    heavyTool: false,
    background: false
  });

  const registered = schedulerRegistry.runtimeSourceIdentities.find(
    (item) => item.sourceRef === COMPANION_READ_RUNTIME_SOURCE_REF
  );
  assert.ok(registered);
  assert.equal(registered.evidenceClass, COMPANION_READ_RUNTIME_EVIDENCE_CLASS);
  assert.equal(registered.authorityRef, COMPANION_READ_RUNTIME_AUTHORITY_REF);
  assert.equal(registered.liveRuntime, true);
  assert.equal(registered.sourceHash, GENERIC_SOURCE_HASH);
  assert.deepEqual(registered.sourceDescriptor, COMPANION_READ_RUNTIME_SOURCE_DESCRIPTOR);

  for (const workerRef of COMPANION_READ_WORKER_REFS) {
    const worker = schedulerRegistry.workerIdentities.find((item) => item.workerRef === workerRef);
    assert.deepEqual(worker, {
      workerRef,
      workerKind: 'NON_MODEL_COMPANION_READ_EXECUTOR_SLOT',
      evidenceClasses: ['LIVE_RUNTIME_CURRENT']
    });
  }
});

test('unsupported hosts fail before runtime evidence formation', () => {
  assert.throws(() => new CompanionReadRuntimeAuthority({
    schedulerRegistry,
    platform: 'aix',
    clock: () => new Date(OBSERVED)
  }), /unsupported Companion read runtime platform/);
});

test('observer owns source identity, clock and currentness and uses conservative host evidence', () => {
  const result = observation(observer());
  assert.equal(result.externalEffectsExecuted, false);
  assert.equal(result.sourceHash, GENERIC_SOURCE_HASH);
  assert.equal(result.runtimeTrustSnapshot.sourceRef, COMPANION_READ_RUNTIME_SOURCE_REF);
  assert.equal(result.runtimeTrustSnapshot.sourceHash, GENERIC_SOURCE_HASH);
  assert.equal(result.runtimeTrustSnapshot.leaseAuthorityRef, COMPANION_READ_RUNTIME_AUTHORITY_REF);
  assert.equal(result.runtimeTrustSnapshot.evidenceClass, 'LIVE_RUNTIME_CURRENT');
  assert.equal(result.runtimeTrustSnapshot.currentness, 'CURRENT');
  assert.equal(result.runtimeTrustSnapshot.formedAt, OBSERVED);
  assert.equal(result.runtimeTrustSnapshot.observedAt, OBSERVED);
  assert.equal(result.runtimeTrustSnapshot.expiresAt, EXPIRES);
  assert.equal(result.resourceSnapshot.sourceRef, COMPANION_READ_RUNTIME_SOURCE_REF);
  assert.equal(result.resourceSnapshot.sourceHash, GENERIC_SOURCE_HASH);
  assert.equal(result.resourceSnapshot.evidenceClass, 'LIVE_RUNTIME_CURRENT');
  assert.equal(result.resourceSnapshot.currentness, 'CURRENT');
  assert.ok(result.resourceSnapshot.cpuConcurrencyLimit >= 1);
  assert.ok(result.resourceSnapshot.cpuLoadPct >= 0 && result.resourceSnapshot.cpuLoadPct <= 100);
  assert.ok(result.resourceSnapshot.ramAvailableMb >= 0);
  assert.equal(result.resourceSnapshot.modelResident, false);
  assert.equal(result.resourceSnapshot.activeModelTurn, true);
  assert.equal(result.resourceSnapshot.activeHeavyTool, true);
  assert.equal(result.resourceSnapshot.interactiveWaitState, 'WAITING');
  assert.equal(result.resourceSnapshot.backgroundWorkAdmission, 'HELD');
  assert.equal(result.resourceSnapshot.thermalPowerState, 'NOT_EXPOSED');
});

test('simulated evidence cannot be promoted through the generic live source', () => {
  const live = observation(observer());
  const { semanticFingerprint: _liveResourceFingerprint, ...liveResourceFields } = live.resourceSnapshot;
  const simulatedResource = createResourceSnapshot({
    ...liveResourceFields,
    snapshotRef: 'resource-snapshot.companion-read.simulated-forgery',
    evidenceClass: 'SIMULATED_CURRENT'
  });
  const { semanticFingerprint: _liveRuntimeFingerprint, ...liveRuntimeFields } = live.runtimeTrustSnapshot;
  assert.throws(() => createSchedulerRuntimeTrustSnapshot({
    ...liveRuntimeFields,
    snapshotRef: 'runtime-snapshot.companion-read.simulated-forgery',
    evidenceClass: 'SIMULATED_CURRENT',
    resourceSnapshotRef: simulatedResource.snapshotRef,
    resourceSnapshotFingerprint: simulatedResource.semanticFingerprint
  }, {
    schedulerRegistry,
    resourceSnapshot: simulatedResource
  }), /source evidence class mismatch|not admitted/);
});

test('live runtime sources cannot issue trust for another source worker', () => {
  const generic = observation(observer());
  const g05 = schedulerRegistry.runtimeSourceIdentities.find(
    (item) => item.sourceRef === 'source.intent-scheduler.windows-g05-runtime-observer'
  );
  assert.ok(g05?.sourceHash);
  const g05Resource = createResourceSnapshot({
    snapshotRef: 'resource-snapshot.g05.cross-source-test',
    generation: GENERATION,
    sourceRef: g05.sourceRef,
    sourceHash: g05.sourceHash,
    formationRef: 'formation.intent-scheduler.windows-g05-runtime-observer.v1',
    evidenceClass: 'LIVE_RUNTIME_CURRENT',
    cpuLoadPct: 10,
    cpuConcurrencyLimit: 4,
    cpuActiveCount: 0,
    ramAvailableMb: 4096,
    ramReservedMb: 0,
    gpuAvailable: false,
    vramAvailableMb: 0,
    vramReservedMb: 0,
    modelResident: false,
    activeModelTurn: true,
    activeHeavyTool: true,
    interactiveWaitState: 'WAITING',
    backgroundWorkAdmission: 'HELD',
    thermalPowerState: 'NOT_EXPOSED',
    currentness: 'CURRENT',
    formedAt: OBSERVED,
    observedAt: OBSERVED,
    expiresAt: EXPIRES
  });

  assert.throws(() => createSchedulerRuntimeTrustSnapshot({
    snapshotRef: 'runtime-snapshot.g05.cross-source-test',
    sourceRef: g05.sourceRef,
    sourceHash: g05.sourceHash,
    formationRef: 'formation.intent-scheduler.windows-g05-runtime-observer.v1',
    evidenceClass: 'LIVE_RUNTIME_CURRENT',
    schedulerGeneration: GENERATION,
    formedAt: OBSERVED,
    observedAt: OBSERVED,
    expiresAt: EXPIRES,
    workerRef: COMPANION_READ_WORKER_REFS[0],
    actorRef: 'vex.cross-source.test',
    roleRef: 'role.vex.developer',
    claimRef: 'claim.cross-source.test',
    occupancyRef: 'occupancy.cross-source.test',
    leaseAuthorityRef: g05.authorityRef,
    resourceSnapshotRef: g05Resource.snapshotRef,
    resourceSnapshotFingerprint: g05Resource.semanticFingerprint,
    currentness: 'CURRENT'
  }, {
    schedulerRegistry,
    resourceSnapshot: g05Resource
  }), /runtime source does not own worker/);

  assert.throws(() => createSchedulerRuntimeTrustSnapshot({
    ...generic.runtimeTrustSnapshot,
    snapshotRef: 'runtime-snapshot.companion-read.g05-worker-forgery',
    workerRef: 'worker.supervisor.windows-g05-runtime-observer'
  }, {
    schedulerRegistry,
    resourceSnapshot: generic.resourceSnapshot
  }), /runtime source does not own worker/);
});

test('shared source authority blocks same-slot reuse while allowing distinct read slots', () => {
  const authority = observer();
  const first = observation(authority, COMPANION_READ_WORKER_REFS[0], GENERATION);
  const second = observation(authority, COMPANION_READ_WORKER_REFS[1], GENERATION);

  const firstLease = workerLease(first.runtimeTrustSnapshot, {
    leaseRef: 'worker-lease.companion-read.slot-01.first',
    schedulerInstanceRef: 'instance.companion-read.slot-01.first'
  });
  const forgedReuse = workerLease(first.runtimeTrustSnapshot, {
    leaseRef: 'worker-lease.companion-read.slot-01.second',
    schedulerInstanceRef: 'instance.companion-read.slot-01.second'
  });
  const secondLease = workerLease(second.runtimeTrustSnapshot, {
    leaseRef: 'worker-lease.companion-read.slot-02.first',
    schedulerInstanceRef: 'instance.companion-read.slot-02.first'
  });

  assert.equal(authority.runtimeAuthority.claim(firstLease, first.runtimeTrustSnapshot).admitted, true);
  const duplicate = authority.runtimeAuthority.claim(forgedReuse, first.runtimeTrustSnapshot);
  assert.equal(duplicate.admitted, false);
  assert.equal(duplicate.reason, 'EXACT_WORKER_SOURCE_ALREADY_LEASED');
  assert.equal(authority.runtimeAuthority.claim(secondLease, second.runtimeTrustSnapshot).admitted, true);
  assert.equal(authority.runtimeAuthority.snapshot().activeLeases.length, 2);
});

// [VXG RealForever]
