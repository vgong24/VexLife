import { createHash } from 'node:crypto';

export const BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_API_PATH = '/api/v1/relationships/invitation-product';
export const BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_REQUEST_SCHEMA = 'vexlife.browser-relationships-invitation-product-request/v1';
export const BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_RESULT_SCHEMA = 'vexlife.browser-relationships-invitation-product-result/v1';
export const BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_FAILURE_SCHEMA = 'vexlife.browser-relationships-invitation-product-failure/v1';
export const ACCEPTED_VEXINTERFACE_INVITATION_PRODUCT_CONTRACT = 'vextreme.vexinterface.invitation-product-request/v1';
export const ACCEPTED_CDR_CANONICAL_INVITATION_SCHEMA = 'vextreme.cdr.bridge-invitation-signing-payload/v1';
export const BROWSER_RELATIONSHIPS_INVITATION_MAX_BYTES = 64 * 1024;

const OPERATIONS = new Set(['CREATE_EXPORT', 'IMPORT_VERIFY']);
const TRANSPORTS = new Set(['FILE', 'CODE', 'QR']);
const SHA256 = /^[a-f0-9]{64}$/u;
const REF = /^[A-Za-z0-9](?:[A-Za-z0-9._:/#@+-]{0,254}[A-Za-z0-9])?$/u;
const FAILURE_CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;
const PROTECTED_KEYS = new Set([
  'privatekey', 'privatekeymaterial', 'keymaterial', 'secret', 'recoverysecret',
  'password', 'token', 'accesstoken', 'refreshtoken', 'apikey', 'authorization',
  'authheader', 'cookie', 'credentialvalue', 'credentials', 'providerendpoint',
]);

export const RELATIONSHIPS_INVITATION_EFFECTS_NONE = Object.freeze({
  canonicalBytesMinted: false,
  cryptographyPerformed: false,
  credentialAccessPerformed: false,
  trustFactsMinted: false,
  relationshipPersisted: false,
  reciprocalFriendshipCreated: false,
  networkDelivered: false,
  semanticAcknowledgementCreated: false,
  providerInvokedByVexLife: false,
  HomeEffectPerformed: false,
  MemoryEffectPerformed: false,
  modelRuntimePerformed: false,
  publicSearchPerformed: false,
  publicationPerformed: false,
});

export class BrowserRelationshipsInvitationProductBridgeError extends Error {
  constructor(code, message = code, httpStatus = 409) {
    super(message);
    this.name = 'BrowserRelationshipsInvitationProductBridgeError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function fail(code, message = code, httpStatus = 409) {
  throw new BrowserRelationshipsInvitationProductBridgeError(code, message, httpStatus);
}

function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('RELATIONSHIPS_INVITATION_REQUEST_INVALID', `${label} must be one object`, 400);
  const allowed = new Set(keys);
  const extra = Object.keys(value).find((key) => !allowed.has(key));
  if (extra) fail('RELATIONSHIPS_INVITATION_REQUEST_INVALID', `${label}.${extra} is not admitted`, 400);
  const missing = keys.find((key) => !Object.hasOwn(value, key));
  if (missing) fail('RELATIONSHIPS_INVITATION_REQUEST_INVALID', `${label}.${missing} is required`, 400);
}

function normalizedFieldName(value) {
  return String(value).replace(/[^A-Za-z0-9]/gu, '').toLowerCase();
}

function protectedString(value) {
  if (typeof value !== 'string') return false;
  return /-----BEGIN[ A-Z0-9]*PRIVATE KEY-----/u.test(value)
    || /\b(?:ghp|gho|ghs|ghu|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/u.test(value)
    || /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/iu.test(value);
}

function clonePublicJson(value, path = 'value') {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('RELATIONSHIPS_INVITATION_PROTECTED_INPUT', `${path} must be JSON-safe`, 400);
    return value;
  }
  if (typeof value === 'string') {
    if (protectedString(value)) fail('RELATIONSHIPS_INVITATION_PROTECTED_INPUT', `${path} contains protected material`, 400);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => clonePublicJson(item, `${path}[${index}]`));
  if (!value || typeof value !== 'object') fail('RELATIONSHIPS_INVITATION_REQUEST_INVALID', `${path} must be JSON-safe`, 400);
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (PROTECTED_KEYS.has(normalizedFieldName(key))) fail('RELATIONSHIPS_INVITATION_PROTECTED_INPUT', `${path}.${key} is protected`, 400);
    out[key] = clonePublicJson(child, `${path}.${key}`);
  }
  return out;
}

function ref(value, label, optional = false) {
  if (optional && value === null) return null;
  if (typeof value !== 'string' || !REF.test(value) || protectedString(value)) fail('RELATIONSHIPS_INVITATION_REF_INVALID', `${label} must be a portable public reference`, 400);
  return value;
}

function refs(value, label) {
  if (!Array.isArray(value) || value.length === 0 || new Set(value).size !== value.length) fail('RELATIONSHIPS_INVITATION_REF_INVALID', `${label} must be duplicate-free public references`, 400);
  return Object.freeze(value.map((item, index) => ref(item, `${label}[${index}]`)));
}

function digest(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) fail('RELATIONSHIPS_INVITATION_ARTIFACT_INVALID', `${label} must be a lowercase SHA-256 digest`, 400);
  return value;
}

function decodeArtifact(base64, maxBytes) {
  if (typeof base64 !== 'string' || !base64 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(base64)) {
    fail('RELATIONSHIPS_INVITATION_ARTIFACT_INVALID', 'artifactBytesBase64 must be canonical base64', 400);
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0 || bytes.length > maxBytes || bytes.toString('base64') !== base64) {
    fail(bytes.length > maxBytes ? 'RELATIONSHIPS_INVITATION_ARTIFACT_TOO_LARGE' : 'RELATIONSHIPS_INVITATION_ARTIFACT_INVALID', 'artifact bytes are not admitted', bytes.length > maxBytes ? 413 : 400);
  }
  if (protectedString(bytes.toString('utf8'))) fail('RELATIONSHIPS_INVITATION_PROTECTED_INPUT', 'artifact contains protected material', 400);
  return bytes;
}

function validateEffects(value) {
  exact(value, Object.keys(RELATIONSHIPS_INVITATION_EFFECTS_NONE), 'result.effects');
  for (const key of Object.keys(RELATIONSHIPS_INVITATION_EFFECTS_NONE)) {
    if (value[key] !== false) fail('RELATIONSHIPS_INVITATION_EFFECT_CONTRADICTION', `result.effects.${key} must remain false`);
  }
  return RELATIONSHIPS_INVITATION_EFFECTS_NONE;
}

function requestEnvelope(value, maxBytes) {
  exact(value, ['schemaVersion', 'operation', 'requestRef', 'transport', 'productContractRef', 'payload', 'sourceRefs'], 'request');
  if (value.schemaVersion !== BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_REQUEST_SCHEMA) fail('RELATIONSHIPS_INVITATION_REQUEST_SCHEMA_UNSUPPORTED', 'request schema is unsupported', 400);
  if (!OPERATIONS.has(value.operation)) fail('RELATIONSHIPS_INVITATION_OPERATION_UNSUPPORTED', 'request operation is unsupported', 400);
  if (!TRANSPORTS.has(value.transport)) fail('RELATIONSHIPS_INVITATION_TRANSPORT_UNSUPPORTED', 'request transport is unsupported', 400);
  if (value.productContractRef !== ACCEPTED_VEXINTERFACE_INVITATION_PRODUCT_CONTRACT) fail('RELATIONSHIPS_INVITATION_PRODUCT_CONTRACT_UNSUPPORTED', 'product contract is unsupported', 400);
  const requestRef = ref(value.requestRef, 'request.requestRef');
  const sourceRefs = refs(value.sourceRefs, 'request.sourceRefs');
  const payload = clonePublicJson(value.payload, 'request.payload');
  if (value.operation === 'IMPORT_VERIFY') {
    exact(payload, ['artifactBytesBase64', 'expectedArtifactSha256', 'transportRecoveryEvidenceRefOrNull'], 'request.payload');
    const bytes = decodeArtifact(payload.artifactBytesBase64, maxBytes);
    const expected = digest(payload.expectedArtifactSha256, 'request.payload.expectedArtifactSha256');
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== expected) fail('RELATIONSHIPS_INVITATION_ARTIFACT_DIGEST_MISMATCH', 'imported artifact digest does not match exact bytes', 400);
    if (value.transport !== 'FILE' && payload.transportRecoveryEvidenceRefOrNull === null) {
      fail('RELATIONSHIPS_INVITATION_CODEC_EVIDENCE_REQUIRED', 'CODE/QR import requires supplied transport recovery evidence', 409);
    }
    if (payload.transportRecoveryEvidenceRefOrNull !== null) ref(payload.transportRecoveryEvidenceRefOrNull, 'request.payload.transportRecoveryEvidenceRefOrNull');
  }
  return Object.freeze({ ...value, requestRef, payload: Object.freeze(payload), sourceRefs });
}

function heldResult(request, code, state = 'HELD_HOST_BINDING_REQUIRED') {
  return Object.freeze({
    schemaVersion: BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_RESULT_SCHEMA,
    operation: request.operation,
    requestRef: request.requestRef,
    state,
    transport: request.transport,
    artifact: null,
    evidence: null,
    failureCode: code,
    syntheticAdapter: false,
    sourceRefs: request.sourceRefs,
    effects: RELATIONSHIPS_INVITATION_EFFECTS_NONE,
  });
}

function normalizeArtifact(value, transport, maxBytes) {
  exact(value, ['artifactSchemaRef', 'canonicalPayloadSchemaRef', 'artifactSha256', 'artifactBytesBase64', 'artifactByteLength', 'transport', 'transportProjectionState'], 'result.artifact');
  ref(value.artifactSchemaRef, 'result.artifact.artifactSchemaRef');
  if (value.canonicalPayloadSchemaRef !== ACCEPTED_CDR_CANONICAL_INVITATION_SCHEMA) fail('RELATIONSHIPS_INVITATION_CDR_SCHEMA_MISMATCH', 'artifact canonical payload schema does not match accepted CDR schema');
  if (value.transport !== transport) fail('RELATIONSHIPS_INVITATION_TRANSPORT_MISMATCH', 'adapter result transport does not bind request');
  const bytes = decodeArtifact(value.artifactBytesBase64, maxBytes);
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (digest(value.artifactSha256, 'result.artifact.artifactSha256') !== actual || value.artifactByteLength !== bytes.length) {
    fail('RELATIONSHIPS_INVITATION_ARTIFACT_DIGEST_MISMATCH', 'adapter artifact identity does not bind exact bytes');
  }
  if (!Number.isSafeInteger(value.artifactByteLength) || value.artifactByteLength <= 0) fail('RELATIONSHIPS_INVITATION_ARTIFACT_INVALID', 'artifactByteLength is invalid');
  const expectedProjection = transport === 'FILE' ? 'EXACT_FILE_BYTES_READY' : 'TEXTUAL_TRANSPORT_CODEC_DEPENDENCY_HELD';
  if (value.transportProjectionState !== expectedProjection) fail('RELATIONSHIPS_INVITATION_TRANSPORT_PROJECTION_INVALID', 'adapter transport projection state is invalid');
  return Object.freeze({ ...value });
}

function normalizeAdapterResult(request, value, maxBytes) {
  exact(value, ['state', 'adapterEvidenceRef', 'syntheticAdapter', 'artifact', 'evidence', 'sourceRefs', 'effects'], 'result');
  ref(value.adapterEvidenceRef, 'result.adapterEvidenceRef');
  if (typeof value.syntheticAdapter !== 'boolean') fail('RELATIONSHIPS_INVITATION_ADAPTER_RESULT_INVALID', 'syntheticAdapter must be explicit');
  const sourceRefs = refs(value.sourceRefs, 'result.sourceRefs');
  const effects = validateEffects(value.effects);
  if (value.state === 'HELD_CODEC_DEPENDENCY') {
    if (request.transport === 'FILE' || value.artifact !== null || value.evidence !== null) fail('RELATIONSHIPS_INVITATION_ADAPTER_RESULT_INVALID', 'codec hold must be non-FILE and effect-free');
    return Object.freeze({
      schemaVersion: BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_RESULT_SCHEMA,
      operation: request.operation,
      requestRef: request.requestRef,
      state: value.state,
      transport: request.transport,
      artifact: null,
      evidence: null,
      failureCode: 'RELATIONSHIPS_INVITATION_CODEC_DEPENDENCY_HELD',
      syntheticAdapter: value.syntheticAdapter,
      sourceRefs,
      effects,
    });
  }
  if (!['EXPORTED', 'IMPORTED_VERIFIED_CURRENT'].includes(value.state)) fail('RELATIONSHIPS_INVITATION_ADAPTER_RESULT_INVALID', 'adapter state is unsupported');
  const artifact = normalizeArtifact(value.artifact, request.transport, maxBytes);
  const evidence = clonePublicJson(value.evidence, 'result.evidence');
  if (value.state === 'EXPORTED' && request.operation !== 'CREATE_EXPORT') fail('RELATIONSHIPS_INVITATION_ADAPTER_RESULT_INVALID', 'EXPORTED does not bind request operation');
  if (value.state === 'IMPORTED_VERIFIED_CURRENT' && request.operation !== 'IMPORT_VERIFY') fail('RELATIONSHIPS_INVITATION_ADAPTER_RESULT_INVALID', 'IMPORTED_VERIFIED_CURRENT does not bind request operation');
  if (value.state === 'IMPORTED_VERIFIED_CURRENT') {
    exact(evidence, ['verificationEvidenceRef', 'currentnessEvidenceRef', 'cdrObservation'], 'result.evidence');
    ref(evidence.verificationEvidenceRef, 'result.evidence.verificationEvidenceRef');
    ref(evidence.currentnessEvidenceRef, 'result.evidence.currentnessEvidenceRef');
    if (!evidence.cdrObservation || typeof evidence.cdrObservation !== 'object' || Array.isArray(evidence.cdrObservation)) fail('RELATIONSHIPS_INVITATION_ADAPTER_RESULT_INVALID', 'cdrObservation must be supplied by upstream');
  }
  return Object.freeze({
    schemaVersion: BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_RESULT_SCHEMA,
    operation: request.operation,
    requestRef: request.requestRef,
    state: value.state,
    transport: request.transport,
    artifact,
    evidence: Object.freeze(evidence),
    failureCode: null,
    syntheticAdapter: value.syntheticAdapter,
    sourceRefs,
    effects,
  });
}

export function createBrowserRelationshipsInvitationProductBridge({ upstreamAdapter = null, maxArtifactBytes = BROWSER_RELATIONSHIPS_INVITATION_MAX_BYTES } = {}) {
  if (!Number.isSafeInteger(maxArtifactBytes) || maxArtifactBytes < 1024 || maxArtifactBytes > BROWSER_RELATIONSHIPS_INVITATION_MAX_BYTES) {
    fail('RELATIONSHIPS_INVITATION_LIMIT_INVALID', 'artifact size limit is invalid');
  }
  if (upstreamAdapter !== null && typeof upstreamAdapter?.invoke !== 'function') fail('RELATIONSHIPS_INVITATION_ADAPTER_INVALID', 'upstream adapter must expose invoke(request)');
  return Object.freeze({
    async execute(input) {
      const request = requestEnvelope(input, maxArtifactBytes);
      if (upstreamAdapter === null) return heldResult(request, 'RELATIONSHIPS_INVITATION_HOST_BINDING_REQUIRED');
      let raw;
      try {
        raw = await upstreamAdapter.invoke(request);
      } catch {
        return heldResult(request, 'RELATIONSHIPS_INVITATION_UPSTREAM_UNAVAILABLE', 'HELD_UPSTREAM_UNAVAILABLE');
      }
      return normalizeAdapterResult(request, raw, maxArtifactBytes);
    }
  });
}

export function browserRelationshipsInvitationProductFailurePayload(error) {
  const typed = error instanceof BrowserRelationshipsInvitationProductBridgeError
    ? error
    : new BrowserRelationshipsInvitationProductBridgeError('RELATIONSHIPS_INVITATION_BRIDGE_FAILED', 'Relationships invitation bridge failed safely', 500);
  const code = FAILURE_CODE.test(typed.code) ? typed.code : 'RELATIONSHIPS_INVITATION_BRIDGE_FAILED';
  return Object.freeze({
    schemaVersion: BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_FAILURE_SCHEMA,
    state: 'HELD',
    failureCode: code,
    effects: RELATIONSHIPS_INVITATION_EFFECTS_NONE,
  });
}

// [VXG RealForever]
