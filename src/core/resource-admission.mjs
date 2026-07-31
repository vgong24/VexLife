import {
  assertActiveInterval,
  assertSourceHash,
  transitionLease
} from './scheduler-runtime-trust.mjs';
import { semanticHash } from './utils.mjs';

const SNAPSHOT_FIELDS = [
  'snapshotRef',
  'generation',
  'sourceRef',
  'sourceHash',
  'formationRef',
  'evidenceClass',
  'cpuLoadPct',
  'cpuConcurrencyLimit',
  'cpuActiveCount',
  'ramAvailableMb',
  'ramReservedMb',
  'gpuAvailable',
  'vramAvailableMb',
  'vramReservedMb',
  'modelResident',
  'activeModelTurn',
  'activeHeavyTool',
  'interactiveWaitState',
  'backgroundWorkAdmission',
  'thermalPowerState',
  'currentness',
  'formedAt',
  'observedAt',
  'expiresAt'
];

function clone(value) {
  return structuredClone(value);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function missingFields(value, fields) {
  return fields.filter((field) => value?.[field] === undefined || value?.[field] === null || value?.[field] === '');
}

function assertNonNegativeNumber(value, field) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a known non-negative number`);
}

export function buildResourceSnapshotFingerprint(snapshot) {
  const candidate = clone(snapshot);
  delete candidate.semanticFingerprint;
  return semanticHash(candidate);
}

export function createResourceSnapshot(input) {
  const missing = missingFields(input, SNAPSHOT_FIELDS);
  if (missing.length) throw new Error(`resource snapshot missing required fields: ${missing.join(', ')}`);
  for (const field of [
    'cpuLoadPct',
    'cpuConcurrencyLimit',
    'cpuActiveCount',
    'ramAvailableMb',
    'ramReservedMb',
    'vramAvailableMb',
    'vramReservedMb'
  ]) assertNonNegativeNumber(input[field], field);
  if (input.cpuLoadPct > 100) throw new Error('cpuLoadPct must not exceed 100');
  if (!Number.isInteger(input.generation) || input.generation < 0) {
    throw new Error('resource snapshot generation must be a non-negative integer');
  }
  for (const field of ['gpuAvailable', 'modelResident', 'activeModelTurn', 'activeHeavyTool']) {
    if (typeof input[field] !== 'boolean') throw new Error(`${field} must be a known boolean`);
  }
  if (!['IDLE', 'WAITING'].includes(input.interactiveWaitState)) {
    throw new Error('interactiveWaitState must be IDLE or WAITING');
  }
  if (!['ADMITTED', 'HELD'].includes(input.backgroundWorkAdmission)) {
    throw new Error('backgroundWorkAdmission must be ADMITTED or HELD');
  }
  if (!['NOMINAL', 'CONSTRAINED', 'NOT_EXPOSED'].includes(input.thermalPowerState)) {
    throw new Error('thermalPowerState must be NOMINAL, CONSTRAINED, or NOT_EXPOSED');
  }
  if (!['SIMULATED_CURRENT', 'LIVE_RUNTIME_CURRENT'].includes(input.evidenceClass)) {
    throw new Error('resource snapshot evidenceClass is not externally recognizable');
  }
  if (input.currentness !== 'CURRENT') throw new Error('resource snapshot currentness must be CURRENT');
  assertSourceHash(input.sourceHash, 'resource snapshot sourceHash');
  assertActiveInterval(input, 'resource snapshot');
  const candidate = {
    schemaVersion: 'vexlife.intent-resource-snapshot/v1',
    ...clone(input)
  };
  delete candidate.semanticFingerprint;
  candidate.semanticFingerprint = buildResourceSnapshotFingerprint(candidate);
  if (input.semanticFingerprint && input.semanticFingerprint !== candidate.semanticFingerprint) {
    throw new Error('resource snapshot semanticFingerprint does not match canonical identity');
  }
  return freeze(candidate);
}

export function evaluateResourceAdmission(snapshot, request = {}) {
  const reasons = [];
  let current;
  try {
    current = createResourceSnapshot(snapshot);
  } catch (error) {
    return { admitted: false, state: 'BLOCKED', reasons: [`RESOURCE_SNAPSHOT_INVALID:${error.message}`] };
  }
  const normalized = {
    cpuSlots: request.cpuSlots ?? 1,
    ramMb: request.ramMb ?? 0,
    vramMb: request.vramMb ?? 0,
    modelTurn: request.modelTurn !== false,
    heavyTool: request.heavyTool === true,
    background: request.background === true
  };
  for (const field of ['cpuSlots', 'ramMb', 'vramMb']) {
    if (!Number.isFinite(normalized[field]) || normalized[field] < 0) reasons.push(`RESOURCE_REQUEST_UNKNOWN:${field}`);
  }
  if (current.cpuActiveCount + normalized.cpuSlots > current.cpuConcurrencyLimit) reasons.push('CPU_CONCURRENCY_INSUFFICIENT');
  if (current.cpuLoadPct >= 95 && normalized.cpuSlots > 0) reasons.push('CPU_LOAD_CONSTRAINED');
  if (current.ramAvailableMb - current.ramReservedMb < normalized.ramMb) reasons.push('RAM_INSUFFICIENT');
  if (normalized.vramMb > 0 && !current.gpuAvailable) reasons.push('GPU_UNAVAILABLE');
  if (current.vramAvailableMb - current.vramReservedMb < normalized.vramMb) reasons.push('VRAM_INSUFFICIENT');
  if (normalized.modelTurn && !current.modelResident) reasons.push('MODEL_UNAVAILABLE');
  if (normalized.modelTurn && current.activeModelTurn) reasons.push('MODEL_WORKER_BUSY');
  if (normalized.heavyTool && current.activeHeavyTool) reasons.push('HEAVY_TOOL_BUSY');
  if (normalized.background && current.interactiveWaitState === 'WAITING') reasons.push('INTERACTIVE_WORK_WAITING');
  if (normalized.background && current.backgroundWorkAdmission !== 'ADMITTED') reasons.push('BACKGROUND_WORK_HELD');
  if (current.thermalPowerState === 'CONSTRAINED' && (normalized.heavyTool || normalized.vramMb > 0)) {
    reasons.push('THERMAL_POWER_CONSTRAINED');
  }
  return {
    admitted: reasons.length === 0,
    state: reasons.length ? 'BLOCKED' : 'ADMITTED',
    reasons,
    snapshotRef: current.snapshotRef,
    snapshotFingerprint: current.semanticFingerprint,
    request: normalized,
    semanticFingerprint: semanticHash({
      snapshotFingerprint: current.semanticFingerprint,
      request: normalized,
      reasons
    })
  };
}

export function evaluateCurrentResourceAdmission(snapshot, request = {}, { observedAt } = {}) {
  const admission = evaluateResourceAdmission(snapshot, request);
  if (!admission.admitted) return admission;
  try {
    assertActiveInterval({
      formedAt: snapshot.formedAt,
      observedAt,
      expiresAt: snapshot.expiresAt
    }, 'resource admission observation');
  } catch (error) {
    return {
      ...admission,
      admitted: false,
      state: 'BLOCKED',
      reasons: [`RESOURCE_NOT_CURRENT_AT_ADMISSION:${error.message}`]
    };
  }
  return admission;
}

export function createResourceLease({
  leaseRef,
  workerRef,
  workNodeRef,
  graphFingerprint,
  schedulerGeneration,
  runtimeTrustSnapshot,
  resourceSnapshot,
  request,
  formedAt,
  expiresAt,
  observedAt
}) {
  const admission = evaluateCurrentResourceAdmission(resourceSnapshot, request, { observedAt });
  if (!admission.admitted) throw new Error(`resource admission failed: ${admission.reasons.join(', ')}`);
  if (!leaseRef || !workerRef || !workNodeRef || !graphFingerprint || !formedAt || !expiresAt || !observedAt) {
    throw new Error('resource lease requires exact lease, worker, node, graph, and canonical time bindings');
  }
  if (!Number.isInteger(schedulerGeneration) || schedulerGeneration < 0) {
    throw new Error('resource lease schedulerGeneration must be a non-negative integer');
  }
  if (!runtimeTrustSnapshot?.semanticFingerprint ||
      runtimeTrustSnapshot.schedulerGeneration !== schedulerGeneration ||
      runtimeTrustSnapshot.workerRef !== workerRef ||
      runtimeTrustSnapshot.resourceSnapshotFingerprint !== resourceSnapshot.semanticFingerprint) {
    throw new Error('resource lease runtime trust binding mismatch');
  }
  assertActiveInterval({ formedAt, observedAt, expiresAt }, 'resource lease');
  const lease = {
    schemaVersion: 'vexlife.intent-resource-lease/v1',
    leaseRef,
    workerRef,
    workNodeRef,
    graphFingerprint,
    runtimeSnapshotRef: runtimeTrustSnapshot.snapshotRef,
    runtimeSnapshotFingerprint: runtimeTrustSnapshot.semanticFingerprint,
    schedulerGeneration,
    resourceSnapshotRef: admission.snapshotRef,
    resourceSnapshotFingerprint: admission.snapshotFingerprint,
    request: admission.request,
    formedAt,
    expiresAt,
    observedAt,
    currentness: 'CURRENT',
    lifecycle: 'ACTIVE'
  };
  lease.semanticFingerprint = semanticHash(lease);
  return freeze(lease);
}

export function releaseResourceLease(lease, {
  releaseReceiptRef,
  releasedAt,
  reason = 'CHECKPOINT',
  lifecycle
}) {
  if (!lifecycle) throw new Error('resource lease release requires explicit lifecycle');
  const transitioned = transitionLease(lease, {
    lifecycle,
    receiptRef: releaseReceiptRef,
    transitionedAt: releasedAt,
    reason
  });
  return {
    releasedLease: transitioned.lease,
    releaseReceipt: transitioned.receipt
  };
}

// [VXG RealForever]
