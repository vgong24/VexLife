export const BROWSER_RELATIONSHIPS_PERSISTENCE_API_PATH = '/api/v1/relationships/persistence';
export const BROWSER_RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_PREPARED_SCHEMA = 'vexlife.browser-relationships-persistence-http-client-prepared/v1';
export const BROWSER_RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_LIST_SCHEMA = 'vexlife.relationships-store/v1';

const REF = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u;
const FAILURE_CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;
const OWNER_KEYS = new Set(['localParticipantRef', 'localStateRootRef']);
const SAVE_INPUT_KEYS = new Set([
  'counterpartParticipantRef',
  'counterpartCurrentKeyRef',
  'localRelationshipClass',
  'invitationRef',
  'invitationCurrentnessRef',
  'observedAt',
  'instanceRef',
  'lastAcceptedPeerCurrentnessRef',
  'routeRef',
  'sessionGeneration',
  'deliveryObservationRef'
]);
const PREPARED_KEYS = new Set(['schemaVersion', 'state', 'input', 'effects']);
const LIST_KEYS = new Set([
  'schemaVersion', 'state', 'localParticipantRef', 'localStateRootRef',
  'totalCount', 'returnedCount', 'truncated', 'relationships'
]);
const LIST_RELATIONSHIP_KEYS = new Set([
  'relationshipRef', 'counterpartParticipantRef', 'localRelationshipClass',
  'status', 'revision', 'updatedAt', 'tombstoned'
]);
const RELATIONSHIP_CLASSES = new Set(['FRIEND', 'FAMILY', 'COLLABORATOR', 'OTHER']);
const RELATIONSHIP_STATUSES = new Set(['ACTIVE', 'BLOCKED', 'REVOKED', 'WITHDRAWN', 'DISCONNECTED']);

export const BROWSER_RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_NO_EFFECTS = Object.freeze({
  relationshipMutationPerformed: false,
  canonicalRelationshipPersisted: false,
  networkEffectPerformed: false,
  providerEffectPerformed: false,
  MemoryEffectPerformed: false,
  HomeLayoutEffectPerformed: false,
  modelRuntimePerformed: false,
  publicationPerformed: false,
  publicSearchPerformed: false,
  semanticAcknowledgementCreated: false,
  reciprocalFriendshipCreated: false
});

export class BrowserRelationshipsPersistenceHttpClientError extends Error {
  constructor(code, message = code, httpStatus = null) {
    super(message);
    this.name = 'BrowserRelationshipsPersistenceHttpClientError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function fail(code, message = code, httpStatus = null) {
  throw new BrowserRelationshipsPersistenceHttpClientError(code, message, httpStatus);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_INPUT_INVALID', `${label} must be one object`);
  }
  return value;
}

function exactKeys(value, admitted, label, requiredCount = null) {
  object(value, label);
  const keys = Object.keys(value);
  if (requiredCount !== null && keys.length !== requiredCount) {
    fail('RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_INPUT_INVALID', `${label} has an invalid field set`);
  }
  const extra = keys.find((key) => !admitted.has(key));
  if (extra) {
    fail('RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_INPUT_INVALID', `${label} contains an unadmitted field`);
  }
  return value;
}

function canonicalRef(value, label) {
  if (typeof value !== 'string' || !REF.test(value)) {
    fail('RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_IDENTITY_INVALID', `${label} must be one lowercase portable canonical ref`);
  }
  return value;
}

function clone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    fail('RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_INPUT_INVALID', 'Relationships persistence input must be JSON-serializable');
  }
}

function normalizeOwnerBinding(value) {
  exactKeys(value, OWNER_KEYS, 'local owner binding', OWNER_KEYS.size);
  return Object.freeze({
    localParticipantRef: canonicalRef(value.localParticipantRef, 'localParticipantRef'),
    localStateRootRef: canonicalRef(value.localStateRootRef, 'localStateRootRef')
  });
}

function normalizeSaveInput(value) {
  exactKeys(value, SAVE_INPUT_KEYS, 'save input');
  return Object.freeze(clone(value));
}

function assertNoEffects(value) {
  exactKeys(value, new Set(Object.keys(BROWSER_RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_NO_EFFECTS)), 'prepared effects', Object.keys(BROWSER_RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_NO_EFFECTS).length);
  for (const [key, expected] of Object.entries(BROWSER_RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_NO_EFFECTS)) {
    if (value[key] !== expected) {
      fail('RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_PREPARED_INVALID', 'Prepared persistence effects must remain false');
    }
  }
}

function validatePrepared(value) {
  exactKeys(value, PREPARED_KEYS, 'prepared persistence input', PREPARED_KEYS.size);
  if (
    value.schemaVersion !== BROWSER_RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_PREPARED_SCHEMA ||
    value.state !== 'PREPARED_NO_EFFECT'
  ) {
    fail('RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_PREPARED_INVALID', 'Prepared persistence identity is invalid');
  }
  assertNoEffects(value.effects);
  return normalizeSaveInput(value.input);
}

function safeRemoteFailureCode(payload) {
  const candidate = payload?.failureCode;
  return typeof candidate === 'string' && FAILURE_CODE.test(candidate)
    ? candidate
    : 'RELATIONSHIPS_PERSISTENCE_HTTP_FAILED';
}

function responseInvalid(httpStatus = null) {
  fail('RELATIONSHIPS_PERSISTENCE_HTTP_RESPONSE_INVALID', 'Relationships persistence response is invalid', httpStatus);
}

function exactResponseKeys(value, admitted, httpStatus) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) responseInvalid(httpStatus);
  const keys = Object.keys(value);
  if (keys.length !== admitted.size || keys.some((key) => !admitted.has(key))) responseInvalid(httpStatus);
}

function canonicalResponseRef(value, httpStatus) {
  if (typeof value !== 'string' || !REF.test(value)) responseInvalid(httpStatus);
  return value;
}

function canonicalResponseTime(value, httpStatus) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) responseInvalid(httpStatus);
  return value;
}

function validateListPayload(payload, owner, httpStatus) {
  exactResponseKeys(payload, LIST_KEYS, httpStatus);
  if (payload.schemaVersion !== BROWSER_RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_LIST_SCHEMA || payload.state !== 'CURRENT_LIST') responseInvalid(httpStatus);
  const localParticipantRef = canonicalResponseRef(payload.localParticipantRef, httpStatus);
  const localStateRootRef = canonicalResponseRef(payload.localStateRootRef, httpStatus);
  if (localParticipantRef !== owner.localParticipantRef || localStateRootRef !== owner.localStateRootRef) responseInvalid(httpStatus);
  if (!Number.isSafeInteger(payload.totalCount) || payload.totalCount < 0) responseInvalid(httpStatus);
  if (!Number.isSafeInteger(payload.returnedCount) || payload.returnedCount < 0 || payload.returnedCount > payload.totalCount) responseInvalid(httpStatus);
  if (typeof payload.truncated !== 'boolean' || !Array.isArray(payload.relationships) || payload.relationships.length !== payload.returnedCount) responseInvalid(httpStatus);
  if (payload.truncated !== (payload.returnedCount < payload.totalCount)) responseInvalid(httpStatus);
  const seen = new Set();
  const relationships = payload.relationships.map((item) => {
    exactResponseKeys(item, LIST_RELATIONSHIP_KEYS, httpStatus);
    const relationshipRef = canonicalResponseRef(item.relationshipRef, httpStatus);
    if (seen.has(relationshipRef)) responseInvalid(httpStatus);
    seen.add(relationshipRef);
    const counterpartParticipantRef = canonicalResponseRef(item.counterpartParticipantRef, httpStatus);
    if (!RELATIONSHIP_CLASSES.has(item.localRelationshipClass) || !RELATIONSHIP_STATUSES.has(item.status)) responseInvalid(httpStatus);
    if (!Number.isSafeInteger(item.revision) || item.revision < 0) responseInvalid(httpStatus);
    const updatedAt = canonicalResponseTime(item.updatedAt, httpStatus);
    if (item.tombstoned !== false) responseInvalid(httpStatus);
    return Object.freeze({
      relationshipRef,
      counterpartParticipantRef,
      localRelationshipClass: item.localRelationshipClass,
      status: item.status,
      revision: item.revision,
      updatedAt,
      tombstoned: false
    });
  });
  return Object.freeze({
    schemaVersion: payload.schemaVersion,
    state: payload.state,
    localParticipantRef,
    localStateRootRef,
    totalCount: payload.totalCount,
    returnedCount: payload.returnedCount,
    truncated: payload.truncated,
    relationships: Object.freeze(relationships)
  });
}

export function createRelationshipsPersistenceHttpClient({
  ownerBinding,
  fetchImpl = globalThis.fetch,
  apiPath = BROWSER_RELATIONSHIPS_PERSISTENCE_API_PATH
} = {}) {
  const owner = normalizeOwnerBinding(ownerBinding);
  if (typeof fetchImpl !== 'function') {
    fail('RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_UNAVAILABLE', 'Relationships persistence HTTP client is unavailable');
  }
  if (apiPath !== BROWSER_RELATIONSHIPS_PERSISTENCE_API_PATH) {
    fail('RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_PATH_INVALID', 'Relationships persistence client must use the accepted same-origin path');
  }

  function prepare(input) {
    return Object.freeze({
      schemaVersion: BROWSER_RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_PREPARED_SCHEMA,
      state: 'PREPARED_NO_EFFECT',
      input: normalizeSaveInput(input),
      effects: BROWSER_RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_NO_EFFECTS
    });
  }

  async function parseResponse(response, unavailableMessage) {
    let payload;
    try {
      payload = await response?.json?.();
    } catch {
      responseInvalid(Number.isInteger(response?.status) ? response.status : null);
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      responseInvalid(Number.isInteger(response?.status) ? response.status : null);
    }
    if (response?.ok !== true) {
      const code = safeRemoteFailureCode(payload);
      fail(code, code, Number.isInteger(response?.status) ? response.status : null);
    }
    if (!response) fail('RELATIONSHIPS_PERSISTENCE_HTTP_UNAVAILABLE', unavailableMessage);
    return payload;
  }

  async function commit(prepared) {
    const input = validatePrepared(prepared);
    let response;
    try {
      response = await fetchImpl(apiPath, {
        method: 'POST',
        headers: Object.freeze({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ localOwnerBinding: owner, input }),
        credentials: 'same-origin',
        cache: 'no-store'
      });
    } catch {
      fail('RELATIONSHIPS_PERSISTENCE_HTTP_UNAVAILABLE', 'Relationships persistence request is unavailable');
    }
    return parseResponse(response, 'Relationships persistence request is unavailable');
  }

  async function list() {
    let response;
    try {
      response = await fetchImpl(apiPath, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store'
      });
    } catch {
      fail('RELATIONSHIPS_PERSISTENCE_HTTP_UNAVAILABLE', 'Relationships persistence list is unavailable');
    }
    const payload = await parseResponse(response, 'Relationships persistence list is unavailable');
    return validateListPayload(payload, owner, Number.isInteger(response?.status) ? response.status : null);
  }

  return Object.freeze({
    ownerBinding: owner,
    prepare,
    commit,
    list
  });
}

// [VXG RealForever]
