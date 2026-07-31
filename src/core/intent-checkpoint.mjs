import { evaluateResourceAdmission } from './resource-admission.mjs';
import {
  assertCurrentLease,
  parseCanonicalTimestamp
} from './scheduler-runtime-trust.mjs';
import { semanticHash } from './utils.mjs';

const REQUIRED_FIELDS = [
  'checkpointRef',
  'workNodeRef',
  'graphFingerprint',
  'trustSnapshotFingerprint',
  'runtimeSnapshotFingerprint',
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
  'priorOccupancyRef',
  'priorCapabilityLeaseRef',
  'priorEffectLeaseRef',
  'priorResourceLeaseRef',
  'priorContextLeaseRef',
  'priorWorkerLeaseRef',
  'resourceSnapshotFingerprint',
  'sourceBindings',
  'leaseReleaseReceipts',
  'formedAt'
];

const REF_ARRAY_FIELDS = [
  'selectedSourceRefs',
  'selectedContextRefs',
  'producedArtifactRefs',
  'producedReceiptRefs',
  'openQuestions'
];

function clone(value) {
  return structuredClone(value);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function canonicalRefs(values, field) {
  if (!Array.isArray(values) || values.some((item) => typeof item !== 'string' || !item)) {
    throw new Error(`${field} must be an array of stable refs`);
  }
  return [...new Set(values)].sort();
}

export function canonicalSourceBindings(values, field = 'sourceBindings') {
  if (!Array.isArray(values)) throw new Error(`${field} must be an array`);
  const normalized = values.map((item) => {
    if (!item?.sourceRef || !/^[a-f0-9]{64}$/.test(String(item.sourceHash ?? ''))) {
      throw new Error(`${field} requires exact sourceRef/sourceHash pairs`);
    }
    return { sourceRef: item.sourceRef, sourceHash: item.sourceHash };
  }).sort((left, right) =>
    left.sourceRef.localeCompare(right.sourceRef) || left.sourceHash.localeCompare(right.sourceHash)
  );
  const keys = normalized.map((item) => `${item.sourceRef}\u0000${item.sourceHash}`);
  if (new Set(keys).size !== keys.length) throw new Error(`${field} contains duplicate source/hash pairs`);
  return normalized;
}

export function buildCheckpointFingerprint(checkpoint) {
  const candidate = clone(checkpoint);
  delete candidate.semanticFingerprint;
  for (const field of REF_ARRAY_FIELDS) candidate[field] = canonicalRefs(candidate[field] ?? [], field);
  candidate.sourceBindings = canonicalSourceBindings(candidate.sourceBindings ?? []);
  candidate.leaseReleaseReceipts = [...(candidate.leaseReleaseReceipts ?? [])]
    .map((item) => clone(item))
    .sort((left, right) => left.receiptRef.localeCompare(right.receiptRef));
  return semanticHash(candidate);
}

export function createIntentCheckpoint(input) {
  const missing = REQUIRED_FIELDS.filter((field) => input?.[field] === undefined || input?.[field] === null || input?.[field] === '');
  if (missing.length) throw new Error(`checkpoint missing required fields: ${missing.join(', ')}`);
  if (!Number.isInteger(input.priorSchedulerGeneration) || input.priorSchedulerGeneration < 0) {
    throw new Error('checkpoint priorSchedulerGeneration must be a non-negative integer');
  }
  if (input.currentState !== 'PAUSED_AT_CHECKPOINT') {
    throw new Error('checkpoint currentState must be PAUSED_AT_CHECKPOINT');
  }
  parseCanonicalTimestamp(input.formedAt, 'checkpoint.formedAt');
  const receiptStates = new Set((input.leaseReleaseReceipts ?? []).map((item) => item.lifecycle));
  if (!receiptStates.has('RELEASED') || (input.leaseReleaseReceipts?.length ?? 0) < 5) {
    throw new Error('checkpoint requires transactional release receipts for every active lease');
  }
  const checkpoint = {
    schemaVersion: 'vexlife.intent-checkpoint/v1',
    ...clone(input)
  };
  for (const field of REF_ARRAY_FIELDS) checkpoint[field] = canonicalRefs(checkpoint[field] ?? [], field);
  checkpoint.sourceBindings = canonicalSourceBindings(checkpoint.sourceBindings);
  checkpoint.leaseReleaseReceipts = [...checkpoint.leaseReleaseReceipts]
    .sort((left, right) => left.receiptRef.localeCompare(right.receiptRef));
  checkpoint.semanticFingerprint = buildCheckpointFingerprint(checkpoint);
  if (input.semanticFingerprint && input.semanticFingerprint !== checkpoint.semanticFingerprint) {
    throw new Error('checkpoint semanticFingerprint does not match canonical identity');
  }
  return freeze(checkpoint);
}

export function validateCheckpointResume(checkpoint, {
  graphFingerprint,
  trustSnapshotFingerprint,
  runtimeTrustSnapshot,
  occupancy,
  capabilityLease,
  effectLease,
  resourceSnapshot,
  resourceRequest,
  resourceLease,
  sourceBindings = [],
  schedulerGeneration,
  observedAt
}) {
  const staleReasons = [];
  const blockedReasons = [];
  let currentSourceBindings = [];
  if (checkpoint.currentState !== 'PAUSED_AT_CHECKPOINT') blockedReasons.push('CHECKPOINT_NOT_PAUSED');
  if (checkpoint.graphFingerprint !== graphFingerprint) staleReasons.push('GRAPH_FINGERPRINT_STALE');
  if (checkpoint.trustSnapshotFingerprint !== trustSnapshotFingerprint) staleReasons.push('TRUST_SNAPSHOT_STALE');
  try {
    const priorSources = canonicalSourceBindings(checkpoint.sourceBindings);
    currentSourceBindings = canonicalSourceBindings(sourceBindings);
    if (semanticHash(priorSources) !== semanticHash(currentSourceBindings)) staleReasons.push('SOURCE_BINDINGS_STALE');
  } catch {
    staleReasons.push('SOURCE_BINDINGS_INVALID');
  }
  if (!Number.isInteger(schedulerGeneration) || schedulerGeneration <= checkpoint.priorSchedulerGeneration) {
    blockedReasons.push('SCHEDULER_GENERATION_NOT_ADVANCED');
  }
  if (!runtimeTrustSnapshot?.semanticFingerprint ||
      runtimeTrustSnapshot.schedulerGeneration !== schedulerGeneration ||
      runtimeTrustSnapshot.semanticFingerprint === checkpoint.runtimeSnapshotFingerprint) {
    staleReasons.push('RUNTIME_TRUST_NOT_FRESH');
  }
  if (!resourceSnapshot?.semanticFingerprint ||
      resourceSnapshot.semanticFingerprint === checkpoint.resourceSnapshotFingerprint ||
      resourceSnapshot.generation !== schedulerGeneration) {
    staleReasons.push('RESOURCE_SNAPSHOT_NOT_FRESH');
  }
  if (!occupancy?.occupancyRef ||
      occupancy.occupancyRef === checkpoint.priorOccupancyRef ||
      occupancy.schedulerGeneration !== schedulerGeneration ||
      occupancy.runtimeSnapshotFingerprint !== runtimeTrustSnapshot?.semanticFingerprint ||
      occupancy.currentness !== 'CURRENT' ||
      occupancy.lifecycle !== 'ACTIVE') {
    blockedReasons.push('OCCUPANCY_NOT_FRESH_CURRENT');
  }
  for (const [label, lease, priorRef] of [
    ['CAPABILITY', capabilityLease, checkpoint.priorCapabilityLeaseRef],
    ['EFFECT', effectLease, checkpoint.priorEffectLeaseRef],
    ['RESOURCE', resourceLease, checkpoint.priorResourceLeaseRef]
  ]) {
    try {
      assertCurrentLease(lease, {
        label: label.toLowerCase(),
        observedAt,
        schedulerGeneration,
        runtimeSnapshotFingerprint: runtimeTrustSnapshot?.semanticFingerprint
      });
      if (lease.leaseRef === priorRef) blockedReasons.push(`${label}_LEASE_NOT_FRESH`);
    } catch (error) {
      blockedReasons.push(`${label}_LEASE_INVALID:${error.message}`);
    }
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
      runtimeSnapshotFingerprint: runtimeTrustSnapshot?.semanticFingerprint,
      occupancyFingerprint: occupancy?.semanticFingerprint,
      capabilityLeaseFingerprint: capabilityLease?.semanticFingerprint,
      effectLeaseFingerprint: effectLease?.semanticFingerprint,
      resourceSnapshotFingerprint: resourceSnapshot?.semanticFingerprint,
      resourceLeaseFingerprint: resourceLease?.semanticFingerprint,
      sourceBindings: currentSourceBindings,
      schedulerGeneration,
      observedAt,
      reasons
    })
  };
}

// [VXG RealForever]
