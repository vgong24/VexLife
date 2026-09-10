export const BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_API_PATH = '/api/v1/relationships/cdr-persistence-binding';
export const BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_SCHEMA = 'vexlife.browser-relationships-cdr-persistence-binding/v1';
export const BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_FAILURE_SCHEMA = 'vexlife.browser-relationships-cdr-persistence-binding-failure/v1';
export const BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_CLIENT_SCHEMA = 'vexlife.browser-relationships-cdr-persistence-binding-client/v1';

const REF = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u;
const FAILURE_CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;
const BINDING_KEYS = new Set([
  'localParticipantRef',
  'localStateRootRef',
  'counterpartParticipantRef',
  'counterpartCurrentKeyRef',
  'invitationRef',
  'invitationCurrentnessRef',
  'instanceRef',
  'lastAcceptedPeerCurrentnessRef',
  'routeRef',
  'sessionGeneration',
  'deliveryObservationRef'
]);

function held(failureCode) {
  return Object.freeze({
    schemaVersion: BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_CLIENT_SCHEMA,
    state: 'HELD_BINDING_REQUIRED',
    binding: null,
    failureCode
  });
}

function canonicalRef(value, label, optional = false) {
  if (optional && (value === null || value === undefined)) return null;
  if (typeof value !== 'string' || !REF.test(value)) throw new Error(`${label} is not a portable canonical ref`);
  return value;
}

function normalizeBinding(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Relationships CDR persistence binding must be one object');
  const keys = Object.keys(value);
  if (keys.length !== BINDING_KEYS.size || keys.some((key) => !BINDING_KEYS.has(key))) {
    throw new Error('Relationships CDR persistence binding field set is invalid');
  }
  const sessionGeneration = value.sessionGeneration ?? null;
  if (sessionGeneration !== null && (!Number.isSafeInteger(sessionGeneration) || sessionGeneration < 0)) {
    throw new Error('Relationships CDR persistence binding session generation is invalid');
  }
  return Object.freeze({
    localParticipantRef: canonicalRef(value.localParticipantRef, 'localParticipantRef'),
    localStateRootRef: canonicalRef(value.localStateRootRef, 'localStateRootRef'),
    counterpartParticipantRef: canonicalRef(value.counterpartParticipantRef, 'counterpartParticipantRef'),
    counterpartCurrentKeyRef: canonicalRef(value.counterpartCurrentKeyRef, 'counterpartCurrentKeyRef'),
    invitationRef: canonicalRef(value.invitationRef, 'invitationRef'),
    invitationCurrentnessRef: canonicalRef(value.invitationCurrentnessRef, 'invitationCurrentnessRef'),
    instanceRef: canonicalRef(value.instanceRef, 'instanceRef'),
    lastAcceptedPeerCurrentnessRef: canonicalRef(value.lastAcceptedPeerCurrentnessRef, 'lastAcceptedPeerCurrentnessRef', true),
    routeRef: canonicalRef(value.routeRef, 'routeRef', true),
    sessionGeneration,
    deliveryObservationRef: canonicalRef(value.deliveryObservationRef, 'deliveryObservationRef', true)
  });
}

function safeFailureCode(payload) {
  return typeof payload?.failureCode === 'string' && FAILURE_CODE.test(payload.failureCode)
    ? payload.failureCode
    : 'RELATIONSHIPS_CDR_PERSISTENCE_BINDING_UNAVAILABLE';
}

function isHeldPayload(payload) {
  return Boolean(
    payload && typeof payload === 'object' && !Array.isArray(payload) &&
    Object.keys(payload).length === 3 &&
    payload.schemaVersion === BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_FAILURE_SCHEMA &&
    payload.state === 'HELD_BINDING_REQUIRED' &&
    typeof payload.failureCode === 'string' && FAILURE_CODE.test(payload.failureCode)
  );
}

export async function loadRelationshipsCdrPersistenceBinding({
  fetchImpl = globalThis.fetch,
  apiPath = BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_API_PATH
} = {}) {
  if (typeof fetchImpl !== 'function') return held('RELATIONSHIPS_CDR_PERSISTENCE_BINDING_UNAVAILABLE');
  if (apiPath !== BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_API_PATH) return held('RELATIONSHIPS_CDR_PERSISTENCE_BINDING_PATH_INVALID');

  let response;
  try {
    response = await fetchImpl(apiPath, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store'
    });
  } catch {
    return held('RELATIONSHIPS_CDR_PERSISTENCE_BINDING_UNAVAILABLE');
  }

  let payload = null;
  try {
    payload = await response?.json?.();
  } catch {
    return held('RELATIONSHIPS_CDR_PERSISTENCE_BINDING_RESPONSE_INVALID');
  }
  if (isHeldPayload(payload)) return held(payload.failureCode);
  if (response?.ok !== true) return held(safeFailureCode(payload));
  if (
    !payload || typeof payload !== 'object' || Array.isArray(payload) ||
    Object.keys(payload).length !== 3 ||
    payload.schemaVersion !== BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_SCHEMA ||
    payload.state !== 'BOUND_CURRENT'
  ) {
    return held('RELATIONSHIPS_CDR_PERSISTENCE_BINDING_RESPONSE_INVALID');
  }

  try {
    return Object.freeze({
      schemaVersion: BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_CLIENT_SCHEMA,
      state: 'BOUND_CURRENT',
      binding: normalizeBinding(payload.binding),
      failureCode: null
    });
  } catch {
    return held('RELATIONSHIPS_CDR_PERSISTENCE_BINDING_RESPONSE_INVALID');
  }
}

// [VXG RealForever]
