export const BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_API_PATH = '/api/v1/relationships/invitation-product';
export const BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_REQUEST_SCHEMA = 'vexlife.browser-relationships-invitation-product-request/v1';
export const BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_RESULT_SCHEMA = 'vexlife.browser-relationships-invitation-product-result/v1';
export const BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_FAILURE_SCHEMA = 'vexlife.browser-relationships-invitation-product-failure/v1';
export const ACCEPTED_VEXINTERFACE_INVITATION_PRODUCT_CONTRACT = 'vextreme.vexinterface.invitation-product-request/v1';

const EFFECT_KEYS = Object.freeze([
  'canonicalBytesMinted', 'cryptographyPerformed', 'credentialAccessPerformed',
  'trustFactsMinted', 'relationshipPersisted', 'reciprocalFriendshipCreated',
  'networkDelivered', 'semanticAcknowledgementCreated', 'providerInvokedByVexLife',
  'HomeEffectPerformed', 'MemoryEffectPerformed', 'modelRuntimePerformed',
  'publicSearchPerformed', 'publicationPerformed'
]);
const RESULT_STATES = new Set([
  'HELD_HOST_BINDING_REQUIRED', 'HELD_UPSTREAM_UNAVAILABLE', 'HELD_CODEC_DEPENDENCY',
  'EXPORTED', 'IMPORTED_VERIFIED_CURRENT'
]);
const TRANSPORTS = new Set(['FILE', 'CODE', 'QR']);
const FAILURE_CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;

function held(operation, requestRef, transport, failureCode) {
  return Object.freeze({
    schemaVersion: BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_RESULT_SCHEMA,
    operation,
    requestRef,
    state: 'HELD_UPSTREAM_UNAVAILABLE',
    transport,
    artifact: null,
    evidence: null,
    failureCode,
    syntheticAdapter: false,
    sourceRefs: Object.freeze([]),
    effects: Object.freeze(Object.fromEntries(EFFECT_KEYS.map((key) => [key, false])))
  });
}

function effectsAllFalse(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === EFFECT_KEYS.length
    && EFFECT_KEYS.every((key) => value[key] === false);
}

function normalizeResult(payload, operation, requestRef, transport) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Relationships invitation result must be one object');
  const keys = new Set(['schemaVersion', 'operation', 'requestRef', 'state', 'transport', 'artifact', 'evidence', 'failureCode', 'syntheticAdapter', 'sourceRefs', 'effects']);
  if (Object.keys(payload).length !== keys.size || Object.keys(payload).some((key) => !keys.has(key))) throw new Error('Relationships invitation result field set is invalid');
  if (payload.schemaVersion !== BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_RESULT_SCHEMA) throw new Error('Relationships invitation result schema is invalid');
  if (payload.operation !== operation || payload.requestRef !== requestRef || payload.transport !== transport) throw new Error('Relationships invitation result does not bind request');
  if (!RESULT_STATES.has(payload.state)) throw new Error('Relationships invitation result state is invalid');
  if (typeof payload.syntheticAdapter !== 'boolean') throw new Error('Relationships invitation result synthetic marker is required');
  if (!Array.isArray(payload.sourceRefs) || payload.sourceRefs.some((value) => typeof value !== 'string' || !value)) throw new Error('Relationships invitation result source refs are invalid');
  if (!effectsAllFalse(payload.effects)) throw new Error('Relationships invitation result effects must remain all false');
  if (payload.failureCode !== null && (typeof payload.failureCode !== 'string' || !FAILURE_CODE.test(payload.failureCode))) throw new Error('Relationships invitation failure code is invalid');
  if (['EXPORTED', 'IMPORTED_VERIFIED_CURRENT'].includes(payload.state) && (payload.failureCode !== null || !payload.artifact)) throw new Error('Relationships invitation successful result is incomplete');
  if (!['EXPORTED', 'IMPORTED_VERIFIED_CURRENT'].includes(payload.state) && payload.failureCode === null) throw new Error('Relationships invitation held result requires a failure code');
  if (payload.state === 'IMPORTED_VERIFIED_CURRENT' && !payload.evidence) throw new Error('Relationships verified import requires supplied evidence');
  return Object.freeze({
    ...payload,
    sourceRefs: Object.freeze([...payload.sourceRefs]),
    effects: Object.freeze({ ...payload.effects }),
    artifact: payload.artifact ? Object.freeze({ ...payload.artifact }) : null,
    evidence: payload.evidence ? Object.freeze({ ...payload.evidence }) : null,
  });
}

export function createRelationshipsInvitationProductClient({
  fetchImpl = globalThis.fetch,
  apiPath = BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_API_PATH
} = {}) {
  async function invoke({ operation, requestRef, transport, payload, sourceRefs }) {
    if (!['CREATE_EXPORT', 'IMPORT_VERIFY'].includes(operation)) return held(operation, requestRef, transport, 'RELATIONSHIPS_INVITATION_OPERATION_UNSUPPORTED');
    if (!TRANSPORTS.has(transport)) return held(operation, requestRef, transport, 'RELATIONSHIPS_INVITATION_TRANSPORT_UNSUPPORTED');
    if (typeof fetchImpl !== 'function' || apiPath !== BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_API_PATH) {
      return held(operation, requestRef, transport, 'RELATIONSHIPS_INVITATION_HOST_BINDING_REQUIRED');
    }
    const request = {
      schemaVersion: BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_REQUEST_SCHEMA,
      operation,
      requestRef,
      transport,
      productContractRef: ACCEPTED_VEXINTERFACE_INVITATION_PRODUCT_CONTRACT,
      payload,
      sourceRefs
    };
    let response;
    try {
      response = await fetchImpl(apiPath, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request)
      });
    } catch {
      return held(operation, requestRef, transport, 'RELATIONSHIPS_INVITATION_UPSTREAM_UNAVAILABLE');
    }
    let body;
    try {
      body = await response?.json?.();
    } catch {
      return held(operation, requestRef, transport, 'RELATIONSHIPS_INVITATION_RESPONSE_INVALID');
    }
    if (response?.ok !== true) {
      const code = typeof body?.failureCode === 'string' && FAILURE_CODE.test(body.failureCode)
        ? body.failureCode
        : 'RELATIONSHIPS_INVITATION_UPSTREAM_UNAVAILABLE';
      return held(operation, requestRef, transport, code);
    }
    try {
      return normalizeResult(body, operation, requestRef, transport);
    } catch {
      return held(operation, requestRef, transport, 'RELATIONSHIPS_INVITATION_RESPONSE_INVALID');
    }
  }

  return Object.freeze({
    createExport(input) {
      return invoke({ ...input, operation: 'CREATE_EXPORT' });
    },
    importVerify(input) {
      return invoke({ ...input, operation: 'IMPORT_VERIFY' });
    }
  });
}

// [VXG RealForever]
