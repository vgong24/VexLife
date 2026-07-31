import { semanticHash } from './utils.mjs';

const REQUIRED_FIELDS = [
  'leaseRef',
  'workerRef',
  'workNodeRef',
  'graphFingerprint',
  'trustSnapshotFingerprint',
  'foundationKernelRef',
  'roleFrameRef',
  'intentFrameRef',
  'selectedAtlasRefs',
  'selectedSourceRefs',
  'applicableCultureRefs',
  'applicableLessonRefs',
  'applicableReleaseRefs',
  'inputTokenEstimate',
  'reservedOutputTokens',
  'hardTokenLimit',
  'formedAt',
  'expiresAt',
  'currentness',
  'checkpointReturnRef'
];

const REF_ARRAY_FIELDS = [
  'selectedAtlasRefs',
  'selectedSourceRefs',
  'applicableCultureRefs',
  'applicableLessonRefs',
  'applicableReleaseRefs',
  'observationRefs'
];

const HEAVY_PAYLOAD_FIELDS = [
  'graph',
  'history',
  'relationships',
  'architectureDocuments',
  'rawLogs',
  'artifactPayloads',
  'messageHistory'
];

function clone(value) {
  return structuredClone(value);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function canonicalRefs(value, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) {
    throw new Error(`${field} must contain only stable refs`);
  }
  return [...new Set(value)].sort();
}

export function buildContextLeaseFingerprint(lease) {
  const candidate = clone(lease);
  for (const field of ['schemaVersion', 'leaseRef', 'formedAt', 'expiresAt', 'semanticFingerprint']) delete candidate[field];
  for (const field of REF_ARRAY_FIELDS) candidate[field] = [...new Set(candidate[field] ?? [])].sort();
  return semanticHash(candidate);
}

export function createContextLease(input, { priorLease = null } = {}) {
  const missing = REQUIRED_FIELDS.filter((field) => input?.[field] === undefined || input?.[field] === null || input?.[field] === '');
  if (missing.length) throw new Error(`context lease missing required fields: ${missing.join(', ')}`);
  for (const field of HEAVY_PAYLOAD_FIELDS) if (Object.hasOwn(input, field)) {
    throw new Error(`context lease must keep ${field} external by ref`);
  }
  for (const field of ['inputTokenEstimate', 'reservedOutputTokens', 'hardTokenLimit']) {
    if (!Number.isInteger(input[field]) || input[field] < 0) throw new Error(`${field} must be a non-negative integer`);
  }
  if (input.hardTokenLimit === 0 || input.inputTokenEstimate + input.reservedOutputTokens > input.hardTokenLimit) {
    throw new Error('context lease token budget does not fit hardTokenLimit');
  }
  if (input.currentness !== 'CURRENT') throw new Error('context lease currentness must be CURRENT');
  const lease = {
    schemaVersion: 'vexlife.intent-context-lease/v0',
    ...clone(input)
  };
  for (const field of REF_ARRAY_FIELDS) lease[field] = canonicalRefs(lease[field] ?? [], field);
  lease.semanticFingerprint = buildContextLeaseFingerprint(lease);
  if (input.semanticFingerprint && input.semanticFingerprint !== lease.semanticFingerprint) {
    throw new Error('context lease semanticFingerprint does not match canonical selection');
  }
  if (priorLease?.currentness === 'CURRENT' &&
      priorLease.workerRef === lease.workerRef &&
      priorLease.semanticFingerprint === lease.semanticFingerprint) {
    return { changed: false, lease: priorLease, reason: 'SEMANTIC_NO_OP' };
  }
  return { changed: true, lease: freeze(lease), reason: 'CONTEXT_SELECTION_CHANGED' };
}

export function reinjectBoundedObservation(contextLease, observation) {
  if (!contextLease?.leaseRef || contextLease.currentness !== 'CURRENT') throw new Error('current context lease is required');
  if (!observation?.observationRef || observation.workNodeRef !== contextLease.workNodeRef) {
    throw new Error('observation does not match context lease work node');
  }
  const existing = new Set(contextLease.observationRefs ?? []);
  if (existing.has(observation.observationRef)) {
    return { changed: false, frame: contextLease, reason: 'OBSERVATION_ALREADY_REINJECTED' };
  }
  const frame = {
    schemaVersion: 'vexlife.intent-context-observation-frame/v0',
    contextLeaseRef: contextLease.leaseRef,
    workNodeRef: contextLease.workNodeRef,
    graphFingerprint: contextLease.graphFingerprint,
    observationRefs: [...existing, observation.observationRef].sort(),
    artifactRefs: [...new Set(observation.artifactRefs ?? [])].sort(),
    rawResultIncluded: false
  };
  frame.semanticFingerprint = semanticHash(frame);
  return { changed: true, frame: freeze(frame), reason: 'OBSERVATION_REINJECTED' };
}

// [VXG RealForever]
