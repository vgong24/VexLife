import os from 'node:os';

import { createResourceSnapshot } from './resource-admission.mjs';
import {
  createSchedulerRuntimeTrustSnapshot,
  WorkerLeaseAuthority
} from './scheduler-runtime-trust.mjs';
import { semanticHash } from './utils.mjs';

export const COMPANION_READ_RUNTIME_SOURCE_REF =
  'source.intent-scheduler.companion-read-runtime-observer';
export const COMPANION_READ_RUNTIME_AUTHORITY_REF =
  'authority.intent-scheduler.companion-read-runtime-observer';
export const COMPANION_READ_RUNTIME_FORMATION_REF =
  'formation.intent-scheduler.companion-read-runtime-observer.v1';
export const COMPANION_READ_RUNTIME_EVIDENCE_CLASS = 'LIVE_RUNTIME_CURRENT';
export const COMPANION_READ_RUNTIME_SUPPORTED_PLATFORMS = Object.freeze([
  'darwin',
  'linux',
  'win32'
]);
export const COMPANION_READ_WORKER_REFS = Object.freeze(
  Array.from({ length: 8 }, (_, index) =>
    `worker.companion.read.slot.${String(index + 1).padStart(2, '0')}`)
);
export const COMPANION_READ_RESOURCE_REQUEST = Object.freeze({
  cpuSlots: 1,
  ramMb: 64,
  vramMb: 0,
  modelTurn: false,
  heavyTool: false,
  background: false
});

export const COMPANION_READ_RUNTIME_SOURCE_DESCRIPTOR = Object.freeze({
  schemaVersion: 'vexlife.intent-scheduler.live-runtime-source-descriptor/v1',
  sourceRef: COMPANION_READ_RUNTIME_SOURCE_REF,
  sourceClass: 'SOURCE_MANAGED_NODE_DESKTOP_COMPANION_READ_RUNTIME_OBSERVER',
  path: 'src/core/scheduler-runtime-observer.mjs',
  evidenceClass: COMPANION_READ_RUNTIME_EVIDENCE_CLASS,
  authorityRef: COMPANION_READ_RUNTIME_AUTHORITY_REF,
  workerRefs: [...COMPANION_READ_WORKER_REFS],
  workerClass: 'NON_MODEL_COMPANION_READ_EXECUTOR_SLOT',
  readWorkerSlotMaximum: 8,
  supportedPlatforms: [...COMPANION_READ_RUNTIME_SUPPORTED_PLATFORMS],
  clockRef: 'clock.intent-scheduler.canonical-utc',
  resourceProvider: 'NODE_OS_OBSERVATION_WITH_CONSERVATIVE_UNKNOWN_LOGICAL_STATE',
  selfCertificationAllowed: false
});

export const COMPANION_READ_RUNTIME_SOURCE_HASH = semanticHash(
  COMPANION_READ_RUNTIME_SOURCE_DESCRIPTOR
);

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function requiredRef(value, label) {
  if (typeof value !== 'string' || !value) throw new Error(`${label} is required`);
  return value;
}

function cpuTotals() {
  const cpus = os.cpus();
  if (!cpus.length) return { total: 0, idle: 0 };
  return cpus.reduce((aggregate, cpu) => {
    const times = Object.values(cpu.times ?? {}).filter(Number.isFinite);
    aggregate.total += times.reduce((sum, value) => sum + value, 0);
    aggregate.idle += Number.isFinite(cpu.times?.idle) ? cpu.times.idle : 0;
    return aggregate;
  }, { total: 0, idle: 0 });
}

async function measureCpuLoadPct(delayMs = 120) {
  const first = cpuTotals();
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  const second = cpuTotals();
  const total = second.total - first.total;
  if (!(total > 0)) return 100;
  const idle = Math.max(0, second.idle - first.idle);
  return Math.max(0, Math.min(100, Number((((total - idle) / total) * 100).toFixed(2))));
}

function canonicalNow(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('runtime observer clock returned an invalid time');
  return date.toISOString();
}

function expiresAfter(observedAt, ttlMs) {
  if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
    throw new Error('runtime observer ttlMs must be a positive integer');
  }
  return new Date(Date.parse(observedAt) + ttlMs).toISOString();
}

function assertRegistryBinding(schedulerRegistry) {
  const source = schedulerRegistry?.runtimeSourceIdentities?.find(
    (item) => item.sourceRef === COMPANION_READ_RUNTIME_SOURCE_REF
  );
  if (!source) throw new Error('scheduler registry does not register the Companion read runtime source');
  if (source.evidenceClass !== COMPANION_READ_RUNTIME_EVIDENCE_CLASS ||
      source.authorityRef !== COMPANION_READ_RUNTIME_AUTHORITY_REF ||
      source.liveRuntime !== true ||
      source.sourceHash !== COMPANION_READ_RUNTIME_SOURCE_HASH ||
      semanticHash(source.sourceDescriptor) !== COMPANION_READ_RUNTIME_SOURCE_HASH) {
    throw new Error('scheduler registry Companion read runtime source binding mismatch');
  }
  if (JSON.stringify(source.sourceDescriptor?.workerRefs) !== JSON.stringify(COMPANION_READ_WORKER_REFS)) {
    throw new Error('scheduler registry Companion read worker source binding mismatch');
  }
  for (const workerRef of COMPANION_READ_WORKER_REFS) {
    const worker = schedulerRegistry.workerIdentities?.find((item) => item.workerRef === workerRef);
    if (!worker || worker.workerKind !== 'NON_MODEL_COMPANION_READ_EXECUTOR_SLOT' ||
        JSON.stringify(worker.evidenceClasses) !== JSON.stringify([COMPANION_READ_RUNTIME_EVIDENCE_CLASS])) {
      throw new Error(`scheduler registry Companion read worker identity mismatch: ${workerRef}`);
    }
  }
  return source;
}

export class CompanionReadRuntimeAuthority {
  #schedulerRegistry;
  #platform;
  #clock;
  #ttlMs;
  #workerLeaseAuthority;

  constructor({
    schedulerRegistry,
    platform = process.platform,
    clock = () => new Date(),
    ttlMs = 60_000
  } = {}) {
    if (!COMPANION_READ_RUNTIME_SUPPORTED_PLATFORMS.includes(platform)) {
      throw new Error(`unsupported Companion read runtime platform ${platform}`);
    }
    if (typeof clock !== 'function') throw new Error('runtime observer clock must be a function');
    assertRegistryBinding(schedulerRegistry);
    this.#schedulerRegistry = schedulerRegistry;
    this.#platform = platform;
    this.#clock = clock;
    this.#ttlMs = ttlMs;
    this.#workerLeaseAuthority = new WorkerLeaseAuthority({
      sourceRef: COMPANION_READ_RUNTIME_SOURCE_REF
    });
  }

  get sourceRef() { return COMPANION_READ_RUNTIME_SOURCE_REF; }
  get sourceHash() { return COMPANION_READ_RUNTIME_SOURCE_HASH; }
  get authorityRef() { return COMPANION_READ_RUNTIME_AUTHORITY_REF; }
  get workerRefs() { return [...COMPANION_READ_WORKER_REFS]; }
  get runtimeAuthority() { return this.#workerLeaseAuthority; }

  async observe({
    workerRef,
    schedulerGeneration,
    actorRef,
    roleRef,
    claimRef,
    occupancyRef
  }) {
    if (!COMPANION_READ_WORKER_REFS.includes(workerRef)) {
      throw new Error(`unregistered Companion read worker ${workerRef}`);
    }
    if (!Number.isInteger(schedulerGeneration) || schedulerGeneration < 0) {
      throw new Error('runtime observer schedulerGeneration must be a non-negative integer');
    }
    requiredRef(actorRef, 'actorRef');
    requiredRef(roleRef, 'roleRef');
    requiredRef(claimRef, 'claimRef');
    requiredRef(occupancyRef, 'occupancyRef');

    const formedAt = canonicalNow(this.#clock);
    const cpuLoadPct = await measureCpuLoadPct();
    const observedAt = canonicalNow(this.#clock);
    const expiresAt = expiresAfter(observedAt, this.#ttlMs);
    const activeReadLeases = this.#workerLeaseAuthority.snapshot().activeLeases.length;
    const cpuConcurrencyLimit = Math.max(
      1,
      Number.isInteger(os.availableParallelism?.())
        ? os.availableParallelism()
        : os.cpus().length || 1
    );
    const observedCpuActiveCount = Math.ceil((cpuLoadPct / 100) * cpuConcurrencyLimit);
    const cpuActiveCount = Math.min(
      cpuConcurrencyLimit,
      Math.max(activeReadLeases, observedCpuActiveCount)
    );
    const ramAvailableMb = Math.max(0, Math.floor(os.freemem() / (1024 * 1024)));
    const resourceIdentity = semanticHash({
      sourceRef: COMPANION_READ_RUNTIME_SOURCE_REF,
      workerRef,
      schedulerGeneration,
      platform: this.#platform,
      observedAt
    }).slice(0, 24);

    const resourceSnapshot = createResourceSnapshot({
      snapshotRef: `resource-snapshot.companion-read.${resourceIdentity}`,
      generation: schedulerGeneration,
      sourceRef: COMPANION_READ_RUNTIME_SOURCE_REF,
      sourceHash: COMPANION_READ_RUNTIME_SOURCE_HASH,
      formationRef: COMPANION_READ_RUNTIME_FORMATION_REF,
      evidenceClass: COMPANION_READ_RUNTIME_EVIDENCE_CLASS,
      cpuLoadPct,
      cpuConcurrencyLimit,
      cpuActiveCount,
      ramAvailableMb,
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
      formedAt,
      observedAt,
      expiresAt
    });

    const runtimeTrustSnapshot = createSchedulerRuntimeTrustSnapshot({
      snapshotRef: `runtime-snapshot.companion-read.${resourceIdentity}`,
      sourceRef: COMPANION_READ_RUNTIME_SOURCE_REF,
      sourceHash: COMPANION_READ_RUNTIME_SOURCE_HASH,
      formationRef: COMPANION_READ_RUNTIME_FORMATION_REF,
      evidenceClass: COMPANION_READ_RUNTIME_EVIDENCE_CLASS,
      schedulerGeneration,
      formedAt,
      observedAt,
      expiresAt,
      workerRef,
      actorRef,
      roleRef,
      claimRef,
      occupancyRef,
      leaseAuthorityRef: COMPANION_READ_RUNTIME_AUTHORITY_REF,
      resourceSnapshotRef: resourceSnapshot.snapshotRef,
      resourceSnapshotFingerprint: resourceSnapshot.semanticFingerprint,
      currentness: 'CURRENT'
    }, {
      schedulerRegistry: this.#schedulerRegistry,
      resourceSnapshot
    });

    return freeze({
      platform: this.#platform,
      sourceDescriptor: COMPANION_READ_RUNTIME_SOURCE_DESCRIPTOR,
      sourceHash: COMPANION_READ_RUNTIME_SOURCE_HASH,
      workerRef,
      resourceRequest: COMPANION_READ_RESOURCE_REQUEST,
      resourceSnapshot,
      runtimeTrustSnapshot,
      externalEffectsExecuted: false
    });
  }
}

// [VXG RealForever]
