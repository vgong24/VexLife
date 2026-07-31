import { evaluateResourceAdmission, releaseResourceLease } from './resource-admission.mjs';
import { semanticHash } from './utils.mjs';

const REQUIRED_FIELDS = [
  'checkpointRef',
  'workNodeRef',
  'graphFingerprint',
  'trustSnapshotFingerprint',
  'priorSchedulerGeneration',
  'lastCompletedStep',
  'currentState',
  'selectedSourceRefs',
  'selectedContextRefs',
  'producedArtifactRefs',
  'producedReceiptRefs',
  'openQuestions',
  'nextSafeAction',
  'pendingToolCallRef',
  'capabilityLeaseRef',
  'effectLeaseRef',
  'resourceSnapshotFingerprint',
  'sourceHashes',
  'resourceReleaseReceipt',
  'formedAt'
];

function clone(value) {
  return structuredClone(value);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function canonical(values, field) {
  if (!Array.isArray(values)) throw new Error(`${field} must be an array`);
  return [...new Set(values.map((item) => typeof item === 'string' ? item : JSON.stringify(item)))].sort();
}

export function buildCheckpointFingerprint(checkpoint) {
  const candidate = clone(checkpoint);
  delete candidate.semanticFingerprint;
  for (const field of [
    'selectedSourceRefs',
    'selectedContextRefs',
    'producedArtifactRefs',
    'producedReceiptRefs',
    'openQuestions',
    'sourceHashes'
  ]) candidate[field] = canonical(candidate[field] ?? [], field);
  return semanticHash(candidate);
}

export function createIntentCheckpoint(input) {
  const missing = REQUIRED_FIELDS.filter((field) => input?.[field] === undefined || input?.[field] === null || input?.[field] === '');
  if (missing.length) throw new Error(`checkpoint missing required fields: ${missing.join(', ')}`);
  if (!Number.isInteger(input.priorSchedulerGeneration) || input.priorSchedulerGeneration < 0) {
    throw new Error('checkpoint priorSchedulerGeneration must be a non-negative integer');
  }
  if (input.currentState !== 'PAUSED_AT_CHECKPOINT') throw new Error('checkpoint currentState must be PAUSED_AT_CHECKPOINT');
  if (input.resourceReleaseReceipt.state !== 'RELEASED') throw new Error('checkpoint requires a released resource receipt');
  const checkpoint = {
    schemaVersion: 'vexlife.intent-checkpoint/v0',
    ...clone(input)
  };
  for (const field of [
    'selectedSourceRefs',
    'selectedContextRefs',
    'producedArtifactRefs',
    'producedReceiptRefs',
    'openQuestions',
    'sourceHashes'
  ]) checkpoint[field] = canonical(checkpoint[field] ?? [], field);
  checkpoint.semanticFingerprint = buildCheckpointFingerprint(checkpoint);
  if (input.semanticFingerprint && input.semanticFingerprint !== checkpoint.semanticFingerprint) {
    throw new Error('checkpoint semanticFingerprint does not match canonical identity');
  }
  return freeze(checkpoint);
}

export function checkpointActiveLease({
  checkpointInput,
  activeLease,
  resourceLease,
  releaseReceiptRef,
  releasedAt
}) {
  if (!activeLease || activeLease.workNodeRef !== checkpointInput.workNodeRef) {
    throw new Error('active worker lease does not match checkpoint work node');
  }
  if (!resourceLease || resourceLease.leaseRef !== activeLease.resourceLeaseRef) {
    throw new Error('active worker resource lease does not match checkpoint');
  }
  const resourceReleaseReceipt = releaseResourceLease(resourceLease, {
    releaseReceiptRef,
    releasedAt,
    reason: 'CHECKPOINT'
  });
  const checkpoint = createIntentCheckpoint({
    ...checkpointInput,
    graphFingerprint: activeLease.graphFingerprint,
    priorSchedulerGeneration: activeLease.generation,
    currentState: 'PAUSED_AT_CHECKPOINT',
    resourceReleaseReceipt
  });
  const workerReleaseReceipt = {
    schemaVersion: 'vexlife.intent-worker-release-receipt/v0',
    releaseReceiptRef: `${releaseReceiptRef}.worker`,
    workerLeaseRef: activeLease.workerLeaseRef,
    workerRef: activeLease.workerRef,
    workNodeRef: activeLease.workNodeRef,
    schedulerGeneration: activeLease.generation,
    reason: 'CHECKPOINT',
    releasedAt,
    state: 'RELEASED'
  };
  workerReleaseReceipt.semanticFingerprint = semanticHash(workerReleaseReceipt);
  return { checkpoint, resourceReleaseReceipt, workerReleaseReceipt: freeze(workerReleaseReceipt) };
}

export function validateCheckpointResume(checkpoint, {
  graphFingerprint,
  trustSnapshotFingerprint,
  capabilityLeaseRef,
  effectLeaseRef,
  resourceSnapshot,
  resourceRequest,
  sourceHashes = [],
  schedulerGeneration
}) {
  const staleReasons = [];
  const blockedReasons = [];
  if (checkpoint.graphFingerprint !== graphFingerprint) staleReasons.push('GRAPH_FINGERPRINT_STALE');
  if (checkpoint.trustSnapshotFingerprint !== trustSnapshotFingerprint) staleReasons.push('TRUST_SNAPSHOT_STALE');
  if (checkpoint.resourceSnapshotFingerprint !== resourceSnapshot?.semanticFingerprint) staleReasons.push('RESOURCE_SNAPSHOT_STALE');
  if (semanticHash([...checkpoint.sourceHashes].sort()) !== semanticHash([...sourceHashes].sort())) staleReasons.push('SOURCE_HASHES_STALE');
  if (checkpoint.capabilityLeaseRef !== capabilityLeaseRef) blockedReasons.push('CAPABILITY_LEASE_MISMATCH');
  if (checkpoint.effectLeaseRef !== effectLeaseRef) blockedReasons.push('EFFECT_LEASE_MISMATCH');
  if (!Number.isInteger(schedulerGeneration) || schedulerGeneration <= checkpoint.priorSchedulerGeneration) {
    blockedReasons.push('SCHEDULER_GENERATION_NOT_ADVANCED');
  }
  const resource = evaluateResourceAdmission(resourceSnapshot, resourceRequest);
  if (!resource.admitted) blockedReasons.push(...resource.reasons.map((reason) => `RESOURCE:${reason}`));
  const reasons = [...staleReasons, ...blockedReasons];
  return {
    admitted: reasons.length === 0,
    state: staleReasons.length ? 'HELD_UNKNOWN' : blockedReasons.length ? 'BLOCKED' : 'READY',
    checkpointRef: checkpoint.checkpointRef,
    workNodeRef: checkpoint.workNodeRef,
    nextSafeAction: reasons.length ? 'RECOVER_OR_REVALIDATE_CHECKPOINT' : checkpoint.nextSafeAction,
    reasons,
    semanticFingerprint: semanticHash({
      checkpointFingerprint: checkpoint.semanticFingerprint,
      graphFingerprint,
      trustSnapshotFingerprint,
      capabilityLeaseRef,
      effectLeaseRef,
      resourceSnapshotFingerprint: resourceSnapshot?.semanticFingerprint,
      sourceHashes: [...sourceHashes].sort(),
      schedulerGeneration,
      reasons
    })
  };
}

// [VXG RealForever]
