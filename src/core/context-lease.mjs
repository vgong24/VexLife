import {
  assertActiveInterval,
  assertCurrentLease,
  parseCanonicalTimestamp
} from './scheduler-runtime-trust.mjs';
import { semanticHash } from './utils.mjs';

const REQUIRED_FIELDS = [
  'leaseRef',
  'workerRef',
  'workNodeRef',
  'graphFingerprint',
  'trustSnapshotFingerprint',
  'runtimeSnapshotFingerprint',
  'schedulerGeneration',
  'resourceLeaseFingerprint',
  'capabilityLeaseFingerprint',
  'effectLeaseFingerprint',
  'cancellationTokenRef',
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
  'observedAt',
  'currentness',
  'lifecycle',
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
  for (const field of ['schemaVersion', 'leaseRef', 'formedAt', 'expiresAt', 'observedAt', 'semanticFingerprint']) delete candidate[field];
  for (const field of REF_ARRAY_FIELDS) candidate[field] = [...new Set(candidate[field] ?? [])].sort();
  return semanticHash(candidate);
}

export function createSuccessorContextAuthorization(input) {
  const required = [
    'authorizationRef',
    'schedulerIssuerRef',
    'checkpointRef',
    'priorContextLeaseRef',
    'priorContextLeaseFingerprint',
    'observationRef',
    'observationFingerprint',
    'runtimeSnapshotFingerprint',
    'contextLeaseRef',
    'resourceLeaseFingerprint',
    'capabilityLeaseFingerprint',
    'effectLeaseFingerprint',
    'workerLeaseRef',
    'schedulerGeneration',
    'cancellationTokenRef',
    'issuedAt'
  ];
  const missing = required.filter((field) => input?.[field] === undefined || input?.[field] === null || input?.[field] === '');
  if (missing.length) throw new Error(`successor context authorization missing required fields: ${missing.join(', ')}`);
  if (!Number.isInteger(input.schedulerGeneration) || input.schedulerGeneration < 1) {
    throw new Error('successor context authorization generation must be a positive integer');
  }
  parseCanonicalTimestamp(input.issuedAt, 'successor context authorization issuedAt');
  const authorization = {
    schemaVersion: 'vexlife.intent-successor-context-authorization/v1',
    ...clone(input)
  };
  delete authorization.semanticFingerprint;
  authorization.semanticFingerprint = semanticHash(authorization);
  if (input.semanticFingerprint && input.semanticFingerprint !== authorization.semanticFingerprint) {
    throw new Error('successor context authorization fingerprint mismatch');
  }
  return freeze(authorization);
}

function assertSuccessorAuthorization(
  authorization,
  lease,
  priorLease,
  priorLeaseFingerprint = null,
  expectedSchedulerIssuerRef = null
) {
  const canonical = createSuccessorContextAuthorization(authorization);
  const expectedPriorFingerprint = priorLeaseFingerprint ?? priorLease?.semanticFingerprint;
  if (!priorLease?.leaseRef || !expectedPriorFingerprint ||
      canonical.priorContextLeaseRef !== priorLease.leaseRef ||
      canonical.priorContextLeaseFingerprint !== expectedPriorFingerprint) {
    throw new Error('successor context authorization prior context mismatch');
  }
  if (!expectedSchedulerIssuerRef || canonical.schedulerIssuerRef !== expectedSchedulerIssuerRef) {
    throw new Error('successor context authorization was not issued by the active scheduler');
  }
  if (canonical.workerLeaseRef !== `worker-lease.${lease.workerRef}.${lease.schedulerGeneration}`) {
    throw new Error('successor context authorization worker lease identity mismatch');
  }
  for (const [field, expected] of [
    ['contextLeaseRef', lease.leaseRef],
    ['runtimeSnapshotFingerprint', lease.runtimeSnapshotFingerprint],
    ['resourceLeaseFingerprint', lease.resourceLeaseFingerprint],
    ['capabilityLeaseFingerprint', lease.capabilityLeaseFingerprint],
    ['effectLeaseFingerprint', lease.effectLeaseFingerprint],
    ['schedulerGeneration', lease.schedulerGeneration],
    ['cancellationTokenRef', lease.cancellationTokenRef]
  ]) {
    if (canonical[field] !== expected) throw new Error(`successor context authorization ${field} mismatch`);
  }
  return canonical;
}

export function createContextLease(input, {
  priorLease = null,
  priorLeaseFingerprint = null,
  expectedSchedulerIssuerRef = null
} = {}) {
  const missing = REQUIRED_FIELDS.filter((field) => input?.[field] === undefined || input?.[field] === null || input?.[field] === '');
  if (missing.length) throw new Error(`context lease missing required fields: ${missing.join(', ')}`);
  for (const field of HEAVY_PAYLOAD_FIELDS) if (Object.hasOwn(input, field)) {
    throw new Error(`context lease must keep ${field} external by ref`);
  }
  for (const field of ['inputTokenEstimate', 'reservedOutputTokens', 'hardTokenLimit']) {
    if (!Number.isInteger(input[field]) || input[field] < 0) throw new Error(`${field} must be a non-negative integer`);
  }
  if (!Number.isInteger(input.schedulerGeneration) || input.schedulerGeneration < 0) {
    throw new Error('context lease schedulerGeneration must be a non-negative integer');
  }
  if (input.hardTokenLimit === 0 || input.inputTokenEstimate + input.reservedOutputTokens > input.hardTokenLimit) {
    throw new Error('context lease token budget does not fit hardTokenLimit');
  }
  if (input.currentness !== 'CURRENT' || input.lifecycle !== 'ACTIVE') {
    throw new Error('context lease must be current and ACTIVE');
  }
  if (Object.hasOwn(input, 'successorOfContextLeaseRef') || Object.hasOwn(input, 'authorizedObservationRefs')) {
    throw new Error('successor context authority must be scheduler-issued');
  }
  assertActiveInterval(input, 'context lease');
  const lease = {
    schemaVersion: 'vexlife.intent-context-lease/v1',
    ...clone(input)
  };
  for (const field of REF_ARRAY_FIELDS) lease[field] = canonicalRefs(lease[field] ?? [], field);
  if (lease.successorContextAuthorization) {
    lease.successorContextAuthorization = assertSuccessorAuthorization(
      lease.successorContextAuthorization,
      lease,
      priorLease,
      priorLeaseFingerprint,
      expectedSchedulerIssuerRef
    );
  }
  lease.semanticFingerprint = buildContextLeaseFingerprint(lease);
  if (input.semanticFingerprint && input.semanticFingerprint !== lease.semanticFingerprint) {
    throw new Error('context lease semanticFingerprint does not match canonical selection');
  }
  if (priorLease &&
      priorLease.workerRef === lease.workerRef &&
      priorLease.semanticFingerprint === lease.semanticFingerprint) {
    try {
      assertCurrentLease(priorLease, {
        label: 'prior context',
        observedAt: lease.observedAt,
        schedulerGeneration: lease.schedulerGeneration,
        runtimeSnapshotFingerprint: lease.runtimeSnapshotFingerprint
      });
      return { changed: false, lease: priorLease, reason: 'SEMANTIC_NO_OP' };
    } catch {
      // Expired, released, superseded, or stale-generation prior leases cannot be reused.
    }
  }
  return { changed: true, lease: freeze(lease), reason: 'CONTEXT_SELECTION_CHANGED' };
}

export function reinjectBoundedObservation(contextLease, observation, { observedAt } = {}) {
  if (buildContextLeaseFingerprint(contextLease) !== contextLease?.semanticFingerprint) {
    throw new Error('context lease semantic fingerprint mismatch');
  }
  assertCurrentLease(contextLease, {
    label: 'context',
    observedAt,
    schedulerGeneration: contextLease?.schedulerGeneration,
    runtimeSnapshotFingerprint: contextLease?.runtimeSnapshotFingerprint
  });
  if (!observation?.observationRef || observation.workNodeRef !== contextLease.workNodeRef) {
    throw new Error('observation does not match context lease work node');
  }
  const exactOrigin = observation.contextLeaseRef === contextLease.leaseRef &&
    observation.contextLeaseFingerprint === contextLease.semanticFingerprint &&
    observation.schedulerGeneration === contextLease.schedulerGeneration;
  let explicitSuccessor = false;
  if (contextLease.successorContextAuthorization) {
    const authorization = createSuccessorContextAuthorization(contextLease.successorContextAuthorization);
    explicitSuccessor = authorization.contextLeaseRef === contextLease.leaseRef &&
      authorization.priorContextLeaseRef === observation.contextLeaseRef &&
      authorization.priorContextLeaseFingerprint === observation.contextLeaseFingerprint &&
      authorization.observationRef === observation.observationRef &&
      authorization.observationFingerprint === observation.semanticFingerprint &&
      authorization.runtimeSnapshotFingerprint === contextLease.runtimeSnapshotFingerprint &&
      authorization.resourceLeaseFingerprint === contextLease.resourceLeaseFingerprint &&
      authorization.capabilityLeaseFingerprint === contextLease.capabilityLeaseFingerprint &&
      authorization.effectLeaseFingerprint === contextLease.effectLeaseFingerprint &&
      authorization.schedulerGeneration === contextLease.schedulerGeneration &&
      authorization.cancellationTokenRef === contextLease.cancellationTokenRef &&
      contextLease.schedulerGeneration > observation.schedulerGeneration;
  }
  if (!exactOrigin && !explicitSuccessor) {
    throw new Error('observation does not match the exact originating or authorized successor context');
  }
  if (observation.graphFingerprint !== contextLease.graphFingerprint ||
      observation.trustSnapshotFingerprint !== contextLease.trustSnapshotFingerprint) {
    throw new Error('observation graph or trust binding does not match context');
  }
  const existing = new Set(contextLease.observationRefs ?? []);
  if (existing.has(observation.observationRef)) {
    return { changed: false, frame: contextLease, reason: 'OBSERVATION_ALREADY_REINJECTED' };
  }
  const frame = {
    schemaVersion: 'vexlife.intent-context-observation-frame/v1',
    contextLeaseRef: contextLease.leaseRef,
    originatingContextLeaseRef: observation.contextLeaseRef,
    workNodeRef: contextLease.workNodeRef,
    graphFingerprint: contextLease.graphFingerprint,
    trustSnapshotFingerprint: contextLease.trustSnapshotFingerprint,
    runtimeSnapshotFingerprint: contextLease.runtimeSnapshotFingerprint,
    schedulerGeneration: contextLease.schedulerGeneration,
    observationRefs: [...existing, observation.observationRef].sort(),
    artifactRefs: [...new Set(observation.artifactRefs ?? [])].sort(),
    rawResultIncluded: false
  };
  frame.semanticFingerprint = semanticHash(frame);
  return { changed: true, frame: freeze(frame), reason: 'OBSERVATION_REINJECTED' };
}

// [VXG RealForever]
