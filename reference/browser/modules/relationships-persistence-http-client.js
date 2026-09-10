export const BROWSER_RELATIONSHIPS_PERSISTENCE_API_PATH = '/api/v1/relationships/persistence';
export const BROWSER_RELATIONSHIPS_PERSISTENCE_HTTP_CLIENT_PREPARED_SCHEMA = 'vexlife.browser-relationships-persistence-http-client-prepared/v1';

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

    let payload;
    try {
      payload = await response?.json?.();
    } catch {
      fail('RELATIONSHIPS_PERSISTENCE_HTTP_RESPONSE_INVALID', 'Relationships persistence response is invalid', Number.isInteger(response?.status) ? response.status : null);
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      fail('RELATIONSHIPS_PERSISTENCE_HTTP_RESPONSE_INVALID', 'Relationships persistence response is invalid', Number.isInteger(response?.status) ? response.status : null);
    }
    if (response?.ok !== true) {
      const code = safeRemoteFailureCode(payload);
      fail(code, code, Number.isInteger(response?.status) ? response.status : null);
    }
    return payload;
  }

  return Object.freeze({
    ownerBinding: owner,
    prepare,
    commit
  });
}

// [VXG RealForever]
