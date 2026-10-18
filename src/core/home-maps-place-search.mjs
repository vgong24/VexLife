import { evaluateRemoteRequest } from './home-bridge.mjs';
import { HOME_BRIDGE_SESSION_AUTHORITY_SCHEMA } from './home-bridge-session-authority.mjs';
import { semanticHash } from './utils.mjs';

export const HOME_MAPS_PLACE_SEARCH_ACTION_REF = 'action.maps-place-search.home-routed-request';
export const MAPS_PLACE_SEARCH_CAPABILITY_REF = 'capability.vexlife.maps-place-search';
export const HOME_MAPS_PLACE_SEARCH_ADMISSION_SCHEMA = 'vexlife.home-maps-place-search-admission/v1';

const REF = /^[A-Za-z0-9][A-Za-z0-9._:/#@+-]{0,511}$/u;
const INTENT_KEYS = new Set(['requestRef', 'query', 'limit']);
const AUTHORITY_KEYS = new Set([
  'schemaVersion',
  'state',
  'authorityReceiptRef',
  'stableSessionBindingRef',
  'principalRef',
  'deviceRef',
  'membership',
  'lease',
  'currentRevocationGeneration',
  'sourceReceiptRefs',
  'currentnessRefs',
  'effects'
]);
const EFFECT_KEYS = new Set([
  'pairingMutation',
  'principalRebinding',
  'authenticationMutation',
  'authorizationMutation',
  'capabilityLeaseMutation',
  'revocationMutation',
  'HomePayloadReadOrWrite',
  'networkMutation',
  'MemoryMutation',
  'RelationshipsMutation',
  'modelRuntimeEffect',
  'training',
  'publication'
]);
const MEMBERSHIP_KEYS = new Set([
  'schemaVersion',
  'membershipRef',
  'homeNodeRef',
  'principalRef',
  'deviceRef',
  'devicePublicKey',
  'capabilityRefs',
  'approvedBy',
  'approvedAt',
  'revocationGeneration',
  'state',
  'membershipHash'
]);
const LEASE_KEYS = new Set([
  'schemaVersion',
  'leaseRef',
  'homeNodeRef',
  'principalRef',
  'deviceRef',
  'capabilityRefs',
  'projectRefs',
  'issuedAt',
  'expiresAt',
  'revocationGeneration',
  'state',
  'leaseHash'
]);

class HomeMapsPlaceSearchAdmissionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'HomeMapsPlaceSearchAdmissionError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new HomeMapsPlaceSearchAdmissionError(code, message);
};

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, allowed, label) {
  if (!isObject(value)) fail('INPUT_INVALID', `${label} must be one object`);
  const keys = Object.keys(value);
  const extras = keys.filter((key) => !allowed.has(key));
  if (extras.length) fail('UNTRUSTED_FIELD', `${label} contains untrusted field ${extras[0]}`);
  if (keys.length !== allowed.size) fail('INPUT_INVALID', `${label} is missing required source-managed fields`);
  return value;
}

function safeRef(value, label) {
  if (typeof value !== 'string' || !REF.test(value)) {
    fail('INPUT_INVALID', `${label} must be one safe opaque ref`);
  }
  return value;
}

function refs(values, label, { nonEmpty = false } = {}) {
  if (!Array.isArray(values) || (nonEmpty && values.length === 0)) {
    fail('INPUT_INVALID', `${label} must be a ref array`);
  }
  const normalized = values.map((value, index) => safeRef(value, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    fail('INPUT_INVALID', `${label} must not contain duplicate refs`);
  }
  return [...normalized].sort();
}

function canonicalHash(value, hashField, label) {
  if (typeof value[hashField] !== 'string') {
    fail('SESSION_AUTHORITY_INVALID', `${label} source hash is missing`);
  }
  const core = structuredClone(value);
  delete core[hashField];
  if (semanticHash(core) !== value[hashField]) {
    fail('SESSION_AUTHORITY_INVALID', `${label} source hash does not match its content`);
  }
}

function validateSessionAuthority(authority) {
  exactKeys(authority, AUTHORITY_KEYS, 'sessionAuthority');
  if (authority.schemaVersion !== HOME_BRIDGE_SESSION_AUTHORITY_SCHEMA || authority.state !== 'CURRENT') {
    fail('SESSION_AUTHORITY_NOT_CURRENT', 'current Home Bridge session authority is required');
  }
  for (const field of ['authorityReceiptRef', 'stableSessionBindingRef', 'principalRef', 'deviceRef']) {
    safeRef(authority[field], `sessionAuthority.${field}`);
  }
  refs(authority.sourceReceiptRefs, 'sessionAuthority.sourceReceiptRefs', { nonEmpty: true });
  refs(authority.currentnessRefs, 'sessionAuthority.currentnessRefs', { nonEmpty: true });
  if (!Number.isSafeInteger(authority.currentRevocationGeneration) || authority.currentRevocationGeneration < 0) {
    fail('SESSION_AUTHORITY_INVALID', 'current revocation generation must be a non-negative integer');
  }

  exactKeys(authority.effects, EFFECT_KEYS, 'sessionAuthority.effects');
  for (const [effect, value] of Object.entries(authority.effects)) {
    if (value !== false) fail('SESSION_AUTHORITY_EFFECTFUL', `session authority unexpectedly grants ${effect}`);
  }

  const membership = exactKeys(authority.membership, MEMBERSHIP_KEYS, 'sessionAuthority.membership');
  const lease = exactKeys(authority.lease, LEASE_KEYS, 'sessionAuthority.lease');
  if (membership.schemaVersion !== 'vexlife.bridge-device-membership/v1' || membership.state !== 'ACTIVE') {
    fail('SESSION_AUTHORITY_INVALID', 'current active Home Bridge membership is required');
  }
  if (lease.schemaVersion !== 'vexlife.bridge-capability-lease/v1' || lease.state !== 'ACTIVE') {
    fail('SESSION_AUTHORITY_INVALID', 'current active Home Bridge capability lease is required');
  }
  canonicalHash(membership, 'membershipHash', 'membership');
  canonicalHash(lease, 'leaseHash', 'lease');

  for (const field of ['membershipRef', 'homeNodeRef', 'principalRef', 'deviceRef', 'approvedBy']) {
    safeRef(membership[field], `membership.${field}`);
  }
  for (const field of ['leaseRef', 'homeNodeRef', 'principalRef', 'deviceRef']) {
    safeRef(lease[field], `lease.${field}`);
  }
  const membershipCaps = refs(membership.capabilityRefs, 'membership.capabilityRefs');
  const leaseCaps = refs(lease.capabilityRefs, 'lease.capabilityRefs');
  refs(lease.projectRefs, 'lease.projectRefs');

  for (const field of ['principalRef', 'deviceRef']) {
    if (membership[field] !== authority[field] || lease[field] !== authority[field]) {
      fail('SESSION_AUTHORITY_IDENTITY_MISMATCH', `authority, membership, and lease ${field} must match`);
    }
  }
  if (membership.homeNodeRef !== lease.homeNodeRef) {
    fail('SESSION_AUTHORITY_IDENTITY_MISMATCH', 'membership and lease Home identity must match');
  }
  if (
    membership.revocationGeneration !== authority.currentRevocationGeneration
    || lease.revocationGeneration !== authority.currentRevocationGeneration
  ) {
    fail('SESSION_AUTHORITY_REVOCATION_MISMATCH', 'session authority is stale against revocation truth');
  }
  if (!membershipCaps.includes(MAPS_PLACE_SEARCH_CAPABILITY_REF)
      || !leaseCaps.includes(MAPS_PLACE_SEARCH_CAPABILITY_REF)) {
    fail('MAPS_PLACE_SEARCH_LEASE_REQUIRED', 'membership and lease must both contain Maps place-search capability');
  }
  return authority;
}

function normalizeIntent(intent) {
  exactKeys(intent, INTENT_KEYS, 'intent');
  const requestRef = safeRef(intent.requestRef, 'intent.requestRef');
  if (typeof intent.query !== 'string') fail('QUERY_INVALID', 'query must be a string');
  const query = intent.query.trim();
  const queryLength = [...query].length;
  if (queryLength < 1 || queryLength > 256 || /[\u0000-\u001f\u007f]/u.test(query)) {
    fail('QUERY_INVALID', 'query must be 1..256 visible characters without control characters');
  }
  if (!Number.isInteger(intent.limit) || intent.limit < 1 || intent.limit > 20) {
    fail('LIMIT_INVALID', 'limit must be an integer from 1 through 20');
  }
  return Object.freeze({ requestRef, query, limit: intent.limit });
}

function normalizeClock(value) {
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) fail('CLOCK_INVALID', 'current time is invalid');
}

function noEffectTruth() {
  return Object.freeze({
    admissionEqualsProviderExecution: false,
    providerRequestPerformed: false,
    providerCredentialExposed: false,
    queryPersisted: false,
    providerResultPersisted: false,
    locationReadOrRetained: false,
    destinationSelected: false,
    routePrepared: false,
    navigationStarted: false,
    remoteHomeWriteGranted: false,
    memoryMutation: false
  });
}

function unavailable(reason, details = {}) {
  return Object.freeze({
    schemaVersion: HOME_MAPS_PLACE_SEARCH_ADMISSION_SCHEMA,
    actionRef: HOME_MAPS_PLACE_SEARCH_ACTION_REF,
    capabilityRef: MAPS_PLACE_SEARCH_CAPABILITY_REF,
    state: 'HOME_ROUTED_PLACE_SEARCH_UNAVAILABLE',
    reason,
    details: Object.freeze(structuredClone(details)),
    searchRequest: null,
    canonicalWriter: null,
    remoteWriterGranted: false,
    standingHomeAuthority: false,
    truth: noEffectTruth()
  });
}

export function evaluateHomeMapsPlaceSearchAdmission({
  intent,
  sessionAuthority,
  now,
  roleCapabilityRefs = [],
  projectCapabilityRefs = [],
  resourceCapabilityRefs = [],
  rawModelEndpointExposed = false
} = {}) {
  try {
    normalizeClock(now);
    const searchIntent = normalizeIntent(intent);
    const authority = validateSessionAuthority(sessionAuthority);
    const roleScope = refs(roleCapabilityRefs, 'roleCapabilityRefs');
    const projectScope = refs(projectCapabilityRefs, 'projectCapabilityRefs');
    const resourceScope = refs(resourceCapabilityRefs, 'resourceCapabilityRefs');

    const request = Object.freeze({
      requestRef: searchIntent.requestRef,
      deviceRef: authority.deviceRef,
      leaseRef: authority.lease.leaseRef,
      channelRef: 'channel.vexlife.maps-place-search',
      speakerRef: authority.principalRef,
      actionRef: HOME_MAPS_PLACE_SEARCH_ACTION_REF,
      idempotencyKey: null
    });
    const admission = evaluateRemoteRequest({
      request,
      membership: authority.membership,
      lease: authority.lease,
      now,
      currentRevocationGeneration: authority.currentRevocationGeneration,
      registeredActionRefs: [HOME_MAPS_PLACE_SEARCH_ACTION_REF],
      requiredCapabilityRefs: [MAPS_PLACE_SEARCH_CAPABILITY_REF],
      roleCapabilityRefs: roleScope,
      projectCapabilityRefs: projectScope,
      resourceCapabilityRefs: resourceScope,
      rawModelEndpointExposed
    });
    if (admission.state !== 'REMOTE_REQUEST_ADMITTED') {
      return unavailable(`HOME_BRIDGE_${admission.state}`, {
        bridgeReason: admission.reason ?? null
      });
    }
    if (!admission.effectiveCapabilityRefs.includes(MAPS_PLACE_SEARCH_CAPABILITY_REF)) {
      return unavailable('HOME_BRIDGE_CAPABILITY_INTERSECTION_MISSING');
    }
    if (admission.canonicalWriter !== 'DESKTOP_HOME_NODE' || admission.remoteWriterGranted !== false) {
      return unavailable('HOME_BRIDGE_WRITER_BOUNDARY_COLLAPSE');
    }

    const searchIntentHash = semanticHash(searchIntent);
    const admissionRef = `admission.vexlife.maps-place-search.${semanticHash({
      requestHash: admission.requestHash,
      searchIntentHash,
      authorityReceiptRef: authority.authorityReceiptRef
    }).slice(0, 32)}`;

    return Object.freeze({
      schemaVersion: HOME_MAPS_PLACE_SEARCH_ADMISSION_SCHEMA,
      actionRef: HOME_MAPS_PLACE_SEARCH_ACTION_REF,
      capabilityRef: MAPS_PLACE_SEARCH_CAPABILITY_REF,
      state: 'HOME_ROUTED_PLACE_SEARCH_ADMITTED',
      admissionRef,
      requestHash: admission.requestHash,
      searchIntentHash,
      authorityReceiptRef: authority.authorityReceiptRef,
      sourceReceiptRefs: Object.freeze([...authority.sourceReceiptRefs]),
      currentnessRefs: Object.freeze([...authority.currentnessRefs]),
      searchRequest: Object.freeze({
        requestRef: searchIntent.requestRef,
        query: searchIntent.query,
        limit: searchIntent.limit
      }),
      admittedCapabilityRefs: Object.freeze([MAPS_PLACE_SEARCH_CAPABILITY_REF]),
      canonicalWriter: admission.canonicalWriter,
      remoteWriterGranted: false,
      standingHomeAuthority: false,
      truth: noEffectTruth()
    });
  } catch (error) {
    if (error instanceof HomeMapsPlaceSearchAdmissionError) {
      return unavailable(error.code);
    }
    throw error;
  }
}

// [VXG RealForever]
