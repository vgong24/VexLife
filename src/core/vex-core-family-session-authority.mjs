const VEX_CORE_SCHEMA = 'vextreme.vex-core.home-session-authority/v1';
export const VEX_CORE_FAMILY_SESSION_AUTHORITY_SCHEMA = 'vexlife.vex-core-family-session-authority/v1';

const CONTEXT_KEYS = new Set(['request', 'operation', 'target']);
const TARGET_KEYS = new Set(['spaceRef', 'channelRef']);
const OPERATIONS = new Set(['APPEND', 'READ', 'LIST']);
const PROJECTION_KEYS = new Set([
  'schemaVersion',
  'state',
  'stableSessionBindingRef',
  'principalRef',
  'deviceRef',
  'homeRef',
  'currentRevocationGeneration',
  'securityMembershipRef',
  'securityAuthenticationReceiptRef',
  'securityAuthorizationReceiptRef',
  'securityLeaseRef',
  'safetyStateDigest',
  'safetyEvaluationRef',
  'allowedProductCapabilityRefs',
  'membership',
  'lease',
  'sourceReceiptRefs',
  'currentnessRefs',
  'effects'
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
const EFFECT_KEYS = new Set([
  'authenticationMutation',
  'authorizationMutation',
  'membershipMutation',
  'capabilityLeaseMutation',
  'revocationMutation',
  'HomePayloadReadOrWrite',
  'remoteHomeWrite',
  'networkMutation',
  'credentialMutation',
  'MemoryMutation',
  'RelationshipsMutation',
  'modelRuntimeEffect',
  'publication'
]);
const REF = /^[A-Za-z0-9][A-Za-z0-9._:/#@+-]{0,511}$/u;

export class VexCoreFamilySessionAuthorityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'VexCoreFamilySessionAuthorityError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new VexCoreFamilySessionAuthorityError(code, message);
};

const isObject = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

function exactKeys(value, keys, label, code = 'VEX_CORE_FAMILY_AUTHORITY_INVALID') {
  if (!isObject(value)) fail(code, `${label} must be one object`);
  const actual = Object.keys(value);
  const extras = actual.filter((key) => !keys.has(key));
  const missing = [...keys].filter((key) => !Object.hasOwn(value, key));
  if (extras.length || missing.length || actual.length !== keys.size) {
    fail(code, `${label} does not match the accepted contract`);
  }
  return value;
}

function ref(value, label) {
  if (typeof value !== 'string' || !REF.test(value)) {
    fail('VEX_CORE_FAMILY_AUTHORITY_INVALID', `${label} must be one safe opaque ref`);
  }
  return value;
}

function refs(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    fail(
      'VEX_CORE_FAMILY_AUTHORITY_INVALID',
      `${label} must be ${allowEmpty ? 'an' : 'a non-empty'} ref array`
    );
  }
  const normalized = value.map((entry, index) => ref(entry, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    fail('VEX_CORE_FAMILY_AUTHORITY_INVALID', `${label} must contain unique refs`);
  }
  return normalized;
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('VEX_CORE_FAMILY_AUTHORITY_INVALID', `${label} must be a non-negative safe integer`);
  }
  return value;
}

function cloneFreeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(cloneFreeze));
  if (!isObject(value)) return value;
  const copy = {};
  for (const [key, nested] of Object.entries(value)) copy[key] = cloneFreeze(nested);
  return Object.freeze(copy);
}

function context(value) {
  exactKeys(value, CONTEXT_KEYS, 'Family authority resolver context');
  if (!isObject(value.request)) {
    fail('VEX_CORE_FAMILY_AUTHORITY_INPUT_INVALID', 'resolver context requires one server request object');
  }
  if (!OPERATIONS.has(value.operation)) {
    fail('VEX_CORE_FAMILY_AUTHORITY_INPUT_INVALID', 'resolver context operation is not admitted');
  }
  exactKeys(value.target, TARGET_KEYS, 'Family authority target', 'VEX_CORE_FAMILY_AUTHORITY_INPUT_INVALID');
  for (const key of TARGET_KEYS) {
    const target = value.target[key];
    if (target !== null && (typeof target !== 'string' || target.length === 0)) {
      fail('VEX_CORE_FAMILY_AUTHORITY_INPUT_INVALID', `target.${key} must be a non-empty string or null`);
    }
  }
  return Object.freeze({
    request: value.request,
    operation: value.operation,
    target: Object.freeze({
      spaceRef: value.target.spaceRef,
      channelRef: value.target.channelRef
    })
  });
}

function currentProjection(value) {
  exactKeys(value, PROJECTION_KEYS, 'VEX_CORE authority projection');

  if (value.schemaVersion !== VEX_CORE_SCHEMA || value.state !== 'CURRENT') {
    fail(
      'VEX_CORE_FAMILY_AUTHORITY_NOT_CURRENT',
      'VEX_CORE authority projection must be one accepted CURRENT value'
    );
  }

  const principalRef = ref(value.principalRef, 'principalRef');
  const deviceRef = ref(value.deviceRef, 'deviceRef');
  const homeRef = ref(value.homeRef, 'homeRef');
  ref(value.stableSessionBindingRef, 'stableSessionBindingRef');
  ref(value.securityMembershipRef, 'securityMembershipRef');
  ref(value.securityAuthenticationReceiptRef, 'securityAuthenticationReceiptRef');
  ref(value.securityAuthorizationReceiptRef, 'securityAuthorizationReceiptRef');
  ref(value.securityLeaseRef, 'securityLeaseRef');
  ref(value.safetyStateDigest, 'safetyStateDigest');
  ref(value.safetyEvaluationRef, 'safetyEvaluationRef');
  refs(value.allowedProductCapabilityRefs, 'allowedProductCapabilityRefs', { allowEmpty: true });
  refs(value.sourceReceiptRefs, 'sourceReceiptRefs');
  refs(value.currentnessRefs, 'currentnessRefs');

  const currentRevocationGeneration = nonNegativeInteger(
    value.currentRevocationGeneration,
    'currentRevocationGeneration'
  );

  const membership = exactKeys(value.membership, MEMBERSHIP_KEYS, 'Home Bridge membership');
  const lease = exactKeys(value.lease, LEASE_KEYS, 'Home Bridge capability lease');

  if (
    membership.schemaVersion !== 'vexlife.bridge-device-membership/v1'
    || membership.state !== 'ACTIVE'
    || lease.schemaVersion !== 'vexlife.bridge-capability-lease/v1'
    || lease.state !== 'ACTIVE'
  ) {
    fail(
      'VEX_CORE_FAMILY_AUTHORITY_NOT_CURRENT',
      'VEX_CORE projection must carry active accepted Home Bridge membership and lease'
    );
  }

  if (
    membership.principalRef !== principalRef
    || lease.principalRef !== principalRef
    || membership.deviceRef !== deviceRef
    || lease.deviceRef !== deviceRef
    || membership.homeNodeRef !== homeRef
    || lease.homeNodeRef !== homeRef
  ) {
    fail(
      'VEX_CORE_FAMILY_AUTHORITY_IDENTITY_MISMATCH',
      'VEX_CORE projection and Home Bridge tuple identity do not match'
    );
  }

  if (
    nonNegativeInteger(membership.revocationGeneration, 'membership.revocationGeneration')
      !== currentRevocationGeneration
    || nonNegativeInteger(lease.revocationGeneration, 'lease.revocationGeneration')
      !== currentRevocationGeneration
  ) {
    fail(
      'VEX_CORE_FAMILY_AUTHORITY_REVOCATION_MISMATCH',
      'VEX_CORE projection and Home Bridge tuple revocation generations do not match'
    );
  }

  exactKeys(value.effects, EFFECT_KEYS, 'VEX_CORE effects');
  for (const key of EFFECT_KEYS) {
    if (value.effects[key] !== false) {
      fail(
        'VEX_CORE_FAMILY_AUTHORITY_EFFECTFUL_PROJECTION',
        'Family may consume only an effect-free VEX_CORE authority projection'
      );
    }
  }

  return Object.freeze({
    membership: cloneFreeze(membership),
    lease: cloneFreeze(lease),
    currentRevocationGeneration
  });
}

export function createVexCoreFamilySessionAuthorityResolver({
  resolveVexCoreAuthority
} = {}) {
  if (typeof resolveVexCoreAuthority !== 'function') {
    throw new TypeError('resolveVexCoreAuthority must be one server-owned resolver function');
  }

  return Object.freeze(async function resolveFamilyConversationAuthority(input = {}) {
    const currentContext = context(input);
    const projection = await resolveVexCoreAuthority(currentContext);
    return currentProjection(projection);
  });
}

// [VXG RealForever]
