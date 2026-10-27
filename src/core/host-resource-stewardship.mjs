import { semanticHash } from './utils.mjs';
import { RESOURCE_CONTEXT_PRESSURE_STATES, verifyResourceContextPressureProjection } from './resource-context-pressure.mjs';

export const HOST_RESOURCE_STEWARDSHIP_SCHEMA = 'vexlife.host-resource-stewardship-decision/v1';
export const HOST_RESOURCE_OBSERVATION_SCHEMA = 'vexlife.host-resource-observation/v1';
export const HOST_RESOURCE_LEASE_OBSERVATION_SCHEMA = 'vexlife.host-resource-lease-observation/v1';
export const HOST_RESOURCE_STEWARDSHIP_OWNER_REF = 'owner.vexlife.host-resource-stewardship.001';

export const HOST_RESOURCE_OWNERSHIP_STATES = Object.freeze([
  'EXACT_VEX_OWNED',
  'UNOWNED',
  'UNKNOWN',
  'AMBIGUOUS',
  'USER_WORKLOAD'
]);

export const HOST_RESOURCE_LIFECYCLE_STATES = Object.freeze([
  'CURRENT',
  'STALE',
  'ABANDONED',
  'UNKNOWN'
]);

export const HOST_RESOURCE_LEASE_STATES = Object.freeze([
  'ACTIVE',
  'NONE',
  'EXPIRED',
  'STALE',
  'UNKNOWN'
]);

const CURRENTNESS = new Set(['CURRENT', 'STALE', 'UNKNOWN']);
const OWNERSHIP = new Set(HOST_RESOURCE_OWNERSHIP_STATES);
const LIFECYCLE = new Set(HOST_RESOURCE_LIFECYCLE_STATES);
const LEASE = new Set(HOST_RESOURCE_LEASE_STATES);
const SHA256 = /^[0-9a-f]{64}$/u;
const RESOURCE_KEYS = new Set(['schemaVersion','truthClass','resourceObservationRef','semanticFingerprint','resourceRef','resourceClass','ownershipState','lifecycleState','lifecycleEvidenceRefOrNull','currentness','ownershipProof','sourceRefs']);
const OWNERSHIP_PROOF_KEYS = new Set(['currentness','ownerReceiptRef','runtimeIdentityRef','executableIdentityRef','processGroupIdentityRef','pidMatchOnly','exactOwnedProcessInstance']);
const LEASE_KEYS = new Set(['schemaVersion','truthClass','leaseObservationRef','semanticFingerprint','resourceRef','state','currentness','leaseRefOrNull','sourceRefs']);
const DECISION_KEYS = new Set(['schemaVersion','truthClass','stewardshipOwnerRef','resourceRef','resourceClass','ownershipState','resourceLifecycleState','resourceCurrentness','leaseState','leaseCurrentness','pressureStateOrNull','pressureCurrent','disposition','reasonCodes','cleanupEligibility','rightfulCleanupOwnerRefOrNull','rightfulCleanupActionRefOrNull','humanProposalRequired','automaticCleanupAuthorized','executionAuthorityGranted','sourceRefs','effects','decisionRef','semanticFingerprint']);
const DISPOSITIONS = new Set(['KEEP','HELD','HUMAN_PROPOSAL_REQUIRED','AUTO_CLEANUP_ELIGIBLE']);
const CLEANUP_ELIGIBILITY = new Set(['NOT_ELIGIBLE','ELIGIBLE_FOR_RIGHTFUL_OWNER_DELEGATION']);
const PRESSURE_REASON_CODES = new Set(['PRESSURE_NOT_SUPPLIED','PRESSURE_INVALID','PRESSURE_NOT_CURRENT']);
const EFFECTS = Object.freeze({
  hostMutated: false,
  processSignalled: false,
  processTerminated: false,
  runtimeMutated: false,
  homeMutated: false,
  memoryMutated: false,
  semanticAcceptanceCreated: false,
  trainingRan: false,
  modelWeightsChanged: false,
  publicationPerformed: false
});

function fail(message, details = null) {
  const error = new Error(message);
  error.code = 'HOST_RESOURCE_STEWARDSHIP_INPUT_INVALID';
  error.details = details;
  throw error;
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be one object`);
  return value;
}

function ref(value, label) {
  if (typeof value !== 'string' || value.length === 0 || /[\0\r\n]/u.test(value)) fail(`${label} must be one non-empty stable ref`);
  return value;
}

function exactKeys(value, allowed, label) {
  object(value, label);
  const extra = Object.keys(value).filter((key) => !allowed.has(key));
  if (extra.length) fail(`${label} contains unsupported field ${extra[0]}`);
}

function refs(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    fail(`${label} must contain at least one non-empty source ref`);
  }
  return Object.freeze([...new Set(value)].sort());
}

function addressed(value, { schemaVersion, refField, prefix, label }) {
  object(value, label);
  if (value.schemaVersion !== schemaVersion) fail(`${label} schema is not current`);
  const semanticFingerprint = value.semanticFingerprint;
  if (!SHA256.test(semanticFingerprint ?? '')) fail(`${label} semanticFingerprint must be lowercase SHA-256`);
  const observedRef = ref(value[refField], `${label}.${refField}`);
  const core = structuredClone(value);
  delete core[refField];
  delete core.semanticFingerprint;
  const expected = semanticHash(core);
  if (expected !== semanticFingerprint || observedRef !== `${prefix}.${expected.slice(0, 32)}`) {
    fail(`${label} content address is invalid`);
  }
  return value;
}

function validateOwnershipProof(value, ownershipState) {
  if (ownershipState !== 'EXACT_VEX_OWNED') {
    if (value !== null) fail('non-exact ownership cannot carry exact ownershipProof');
    return null;
  }
  exactKeys(value, OWNERSHIP_PROOF_KEYS, 'resourceObservation.ownershipProof');
  if (value.currentness !== 'CURRENT') fail('exact ownership proof must be CURRENT');
  for (const key of ['ownerReceiptRef', 'runtimeIdentityRef', 'executableIdentityRef', 'processGroupIdentityRef']) {
    ref(value[key], `resourceObservation.ownershipProof.${key}`);
  }
  if (value.pidMatchOnly === true) fail('PID match alone cannot establish exact Vex ownership');
  if (value.exactOwnedProcessInstance !== true) fail('exact ownership proof must bind one exact process instance');
  return Object.freeze(structuredClone(value));
}

export function validateHostResourceObservation(value) {
  exactKeys(value, RESOURCE_KEYS, 'resourceObservation');
  addressed(value, {
    schemaVersion: HOST_RESOURCE_OBSERVATION_SCHEMA,
    refField: 'resourceObservationRef',
    prefix: 'observation.vexlife.host-resource',
    label: 'resourceObservation'
  });
  if (value.truthClass !== 'SOURCE_BOUND_HOST_RESOURCE_OBSERVATION') fail('resourceObservation.truthClass is invalid');
  ref(value.resourceRef, 'resourceObservation.resourceRef');
  ref(value.resourceClass, 'resourceObservation.resourceClass');
  if (!OWNERSHIP.has(value.ownershipState)) fail('resourceObservation.ownershipState is invalid');
  if (!LIFECYCLE.has(value.lifecycleState)) fail('resourceObservation.lifecycleState is invalid');
  if (!CURRENTNESS.has(value.currentness)) fail('resourceObservation.currentness is invalid');
  const sourceRefs = refs(value.sourceRefs, 'resourceObservation.sourceRefs');
  const ownershipProof = validateOwnershipProof(value.ownershipProof ?? null, value.ownershipState);
  if (['STALE', 'ABANDONED'].includes(value.lifecycleState)) ref(value.lifecycleEvidenceRefOrNull, 'resourceObservation.lifecycleEvidenceRefOrNull');
  else if (!(value.lifecycleEvidenceRefOrNull === null || typeof value.lifecycleEvidenceRefOrNull === 'string')) fail('resourceObservation.lifecycleEvidenceRefOrNull is invalid');
  return Object.freeze({ ...structuredClone(value), sourceRefs, ownershipProof });
}

export function validateHostResourceLeaseObservation(value) {
  exactKeys(value, LEASE_KEYS, 'leaseObservation');
  addressed(value, {
    schemaVersion: HOST_RESOURCE_LEASE_OBSERVATION_SCHEMA,
    refField: 'leaseObservationRef',
    prefix: 'observation.vexlife.host-resource-lease',
    label: 'leaseObservation'
  });
  if (value.truthClass !== 'SOURCE_BOUND_HOST_RESOURCE_LEASE_OBSERVATION') fail('leaseObservation.truthClass is invalid');
  ref(value.resourceRef, 'leaseObservation.resourceRef');
  if (!LEASE.has(value.state)) fail('leaseObservation.state is invalid');
  if (!CURRENTNESS.has(value.currentness)) fail('leaseObservation.currentness is invalid');
  const sourceRefs = refs(value.sourceRefs, 'leaseObservation.sourceRefs');
  if (value.state === 'ACTIVE') ref(value.leaseRefOrNull, 'leaseObservation.leaseRefOrNull');
  if (value.state === 'NONE' && value.leaseRefOrNull !== null) fail('NONE lease observation cannot name an active lease');
  if (!(value.leaseRefOrNull === null || typeof value.leaseRefOrNull === 'string')) fail('leaseObservation.leaseRefOrNull is invalid');
  return Object.freeze({ ...structuredClone(value), sourceRefs });
}

function pressureBinding(value) {
  if (value === null || value === undefined) {
    return Object.freeze({ state: null, current: false, valid: false, sourceRefs: Object.freeze([]), reasonCode: 'PRESSURE_NOT_SUPPLIED' });
  }
  if (!verifyResourceContextPressureProjection(value)) {
    return Object.freeze({ state: null, current: false, valid: false, sourceRefs: Object.freeze([]), reasonCode: 'PRESSURE_INVALID' });
  }
  return Object.freeze({
    state: value.state,
    current: value.currentness === 'CURRENT',
    valid: true,
    sourceRefs: Object.freeze([value.pressureRef, ...(value.sourceRefs ?? [])].filter(Boolean).sort()),
    reasonCode: value.currentness === 'CURRENT' ? null : 'PRESSURE_NOT_CURRENT'
  });
}

function decideFromState({
  resourceCurrentness,
  ownershipState,
  resourceLifecycleState,
  leaseCurrentness,
  leaseState
}) {
  if (resourceCurrentness !== 'CURRENT') {
    return ['HELD', 'RESOURCE_CURRENTNESS_REQUIRED', false, false];
  }
  if (ownershipState !== 'EXACT_VEX_OWNED') {
    if (['UNOWNED', 'USER_WORKLOAD'].includes(ownershipState)) {
      return ['HUMAN_PROPOSAL_REQUIRED', 'NON_VEX_OR_USER_RESOURCE', false, true];
    }
    return ['HELD', 'OWNERSHIP_UNCERTAIN', false, true];
  }
  if (resourceLifecycleState === 'CURRENT') {
    return ['KEEP', 'RESOURCE_CURRENT', false, false];
  }
  if (resourceLifecycleState === 'UNKNOWN') {
    return ['HELD', 'RESOURCE_LIFECYCLE_UNCERTAIN', false, false];
  }
  if (leaseCurrentness !== 'CURRENT') {
    return ['HELD', 'LEASE_CURRENTNESS_REQUIRED', false, false];
  }
  if (leaseState === 'ACTIVE') {
    return ['KEEP', 'ACTIVE_LEASE_BLOCKS_CLEANUP', false, false];
  }
  if (leaseState !== 'NONE') {
    return ['HELD', 'LEASE_REFRESH_REQUIRED', false, false];
  }
  return ['AUTO_CLEANUP_ELIGIBLE', 'EXACT_OWNED_STALE_NO_ACTIVE_LEASE', true, false];
}

function decide(resource, lease) {
  return decideFromState({
    resourceCurrentness: resource.currentness,
    ownershipState: resource.ownershipState,
    resourceLifecycleState: resource.lifecycleState,
    leaseCurrentness: lease.currentness,
    leaseState: lease.state
  });
}

export function projectHostResourceStewardship({
  resourceObservation,
  leaseObservation,
  resourceContextPressure = null,
  rightfulCleanupOwnerRef = null,
  rightfulCleanupActionRef = null
} = {}) {
  const resource = validateHostResourceObservation(resourceObservation);
  const lease = validateHostResourceLeaseObservation(leaseObservation);
  if (resource.resourceRef !== lease.resourceRef) fail('resource and lease observations refer to different resources');
  const pressure = pressureBinding(resourceContextPressure);
  let [disposition, reasonCode, eligibleForDelegation, humanProposalRequired] = decide(resource, lease);
  let cleanupOwner = rightfulCleanupOwnerRef;
  let cleanupAction = rightfulCleanupActionRef;
  if (eligibleForDelegation) {
    if (!cleanupOwner || !cleanupAction) {
      disposition = 'HELD';
      reasonCode = 'RIGHTFUL_CLEANUP_OWNER_REQUIRED';
      eligibleForDelegation = false;
    } else {
      cleanupOwner = ref(cleanupOwner, 'rightfulCleanupOwnerRef');
      cleanupAction = ref(cleanupAction, 'rightfulCleanupActionRef');
    }
  } else {
    cleanupOwner = null;
    cleanupAction = null;
  }
  const reasonCodes = [reasonCode, pressure.reasonCode].filter(Boolean).sort();
  const sourceRefs = [...new Set([
    ...resource.sourceRefs,
    ...lease.sourceRefs,
    ...pressure.sourceRefs,
    resource.resourceObservationRef,
    lease.leaseObservationRef
  ])].sort();
  const core = {
    schemaVersion: HOST_RESOURCE_STEWARDSHIP_SCHEMA,
    truthClass: 'NO_EFFECT_HOST_RESOURCE_STEWARDSHIP_DECISION',
    stewardshipOwnerRef: HOST_RESOURCE_STEWARDSHIP_OWNER_REF,
    resourceRef: resource.resourceRef,
    resourceClass: resource.resourceClass,
    ownershipState: resource.ownershipState,
    resourceLifecycleState: resource.lifecycleState,
    resourceCurrentness: resource.currentness,
    leaseState: lease.state,
    leaseCurrentness: lease.currentness,
    pressureStateOrNull: pressure.state,
    pressureCurrent: pressure.current,
    disposition,
    reasonCodes,
    cleanupEligibility: eligibleForDelegation ? 'ELIGIBLE_FOR_RIGHTFUL_OWNER_DELEGATION' : 'NOT_ELIGIBLE',
    rightfulCleanupOwnerRefOrNull: cleanupOwner,
    rightfulCleanupActionRefOrNull: cleanupAction,
    humanProposalRequired,
    automaticCleanupAuthorized: false,
    executionAuthorityGranted: false,
    sourceRefs,
    effects: { ...EFFECTS }
  };
  const semanticFingerprint = semanticHash(core);
  return Object.freeze({
    ...core,
    decisionRef: `decision.vexlife.host-resource-stewardship.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

export function verifyHostResourceStewardshipDecision(value) {
  try {
    exactKeys(value, DECISION_KEYS, 'decision');
    if (value.schemaVersion !== HOST_RESOURCE_STEWARDSHIP_SCHEMA) return false;
    if (value.truthClass !== 'NO_EFFECT_HOST_RESOURCE_STEWARDSHIP_DECISION' || value.stewardshipOwnerRef !== HOST_RESOURCE_STEWARDSHIP_OWNER_REF) return false;
    ref(value.resourceRef, 'decision.resourceRef');
    ref(value.resourceClass, 'decision.resourceClass');
    if (!OWNERSHIP.has(value.ownershipState) ||
        !LIFECYCLE.has(value.resourceLifecycleState) ||
        !CURRENTNESS.has(value.resourceCurrentness) ||
        !LEASE.has(value.leaseState) ||
        !CURRENTNESS.has(value.leaseCurrentness) ||
        !DISPOSITIONS.has(value.disposition) ||
        !CLEANUP_ELIGIBILITY.has(value.cleanupEligibility) ||
        typeof value.humanProposalRequired !== 'boolean' ||
        typeof value.pressureCurrent !== 'boolean') return false;
    const canonicalSourceRefs = refs(value.sourceRefs, 'decision.sourceRefs');
    if (JSON.stringify(canonicalSourceRefs) !== JSON.stringify(value.sourceRefs)) return false;
    if (!Array.isArray(value.reasonCodes) || value.reasonCodes.length === 0 ||
        value.reasonCodes.some((item) => typeof item !== 'string' || item.length === 0) ||
        new Set(value.reasonCodes).size !== value.reasonCodes.length ||
        JSON.stringify([...value.reasonCodes].sort()) !== JSON.stringify(value.reasonCodes)) return false;

    const [baseDisposition, baseReasonCode, baseEligible, expectedHumanProposal] = decideFromState({
      resourceCurrentness: value.resourceCurrentness,
      ownershipState: value.ownershipState,
      resourceLifecycleState: value.resourceLifecycleState,
      leaseCurrentness: value.leaseCurrentness,
      leaseState: value.leaseState
    });

    let expectedDisposition = baseDisposition;
    let expectedEligibility = baseEligible;
    let expectedReasonCode = baseReasonCode;
    if (baseEligible) {
      const ownerPresent = typeof value.rightfulCleanupOwnerRefOrNull === 'string' && value.rightfulCleanupOwnerRefOrNull.length > 0;
      const actionPresent = typeof value.rightfulCleanupActionRefOrNull === 'string' && value.rightfulCleanupActionRefOrNull.length > 0;
      if (ownerPresent !== actionPresent) return false;
      if (!ownerPresent) {
        expectedDisposition = 'HELD';
        expectedEligibility = false;
        expectedReasonCode = 'RIGHTFUL_CLEANUP_OWNER_REQUIRED';
      } else {
        ref(value.rightfulCleanupOwnerRefOrNull, 'decision.rightfulCleanupOwnerRefOrNull');
        ref(value.rightfulCleanupActionRefOrNull, 'decision.rightfulCleanupActionRefOrNull');
      }
    } else if (value.rightfulCleanupOwnerRefOrNull !== null || value.rightfulCleanupActionRefOrNull !== null) {
      return false;
    }

    if (value.disposition !== expectedDisposition ||
        value.cleanupEligibility !== (expectedEligibility ? 'ELIGIBLE_FOR_RIGHTFUL_OWNER_DELEGATION' : 'NOT_ELIGIBLE') ||
        value.humanProposalRequired !== expectedHumanProposal) return false;

    const pressureReasons = value.reasonCodes.filter((code) => PRESSURE_REASON_CODES.has(code));
    let expectedPressureReason = null;
    if (value.pressureStateOrNull === null) {
      if (value.pressureCurrent !== false || pressureReasons.length !== 1 ||
          !['PRESSURE_NOT_SUPPLIED', 'PRESSURE_INVALID'].includes(pressureReasons[0])) return false;
      expectedPressureReason = pressureReasons[0];
    } else if (!RESOURCE_CONTEXT_PRESSURE_STATES.includes(value.pressureStateOrNull)) {
      return false;
    } else if (value.pressureCurrent) {
      if (pressureReasons.length !== 0) return false;
    } else {
      if (pressureReasons.length !== 1 || pressureReasons[0] !== 'PRESSURE_NOT_CURRENT') return false;
      expectedPressureReason = 'PRESSURE_NOT_CURRENT';
    }

    const expectedReasonCodes = [...new Set([expectedReasonCode, expectedPressureReason].filter(Boolean))].sort();
    if (JSON.stringify(value.reasonCodes) !== JSON.stringify(expectedReasonCodes)) return false;

    if (value.executionAuthorityGranted !== false || value.automaticCleanupAuthorized !== false) return false;
    if (!value.effects || typeof value.effects !== 'object' || Array.isArray(value.effects) ||
        JSON.stringify(Object.keys(value.effects).sort()) !== JSON.stringify(Object.keys(EFFECTS).sort()) ||
        !Object.values(value.effects).every((effect) => effect === false)) return false;
    const core = structuredClone(value);
    delete core.decisionRef;
    delete core.semanticFingerprint;
    const semanticFingerprint = semanticHash(core);
    return value.semanticFingerprint === semanticFingerprint &&
      value.decisionRef === `decision.vexlife.host-resource-stewardship.${semanticFingerprint.slice(0, 32)}`;
  } catch {
    return false;
  }
}

// [VXG RealForever]
