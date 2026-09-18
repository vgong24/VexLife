import {
  createFamilySpace
} from './family-space-store.mjs';
import {
  createFamilyChannel,
  FAMILY_HISTORY_FROM_JOIN_POLICY
} from './family-conversation.mjs';
import {
  materializeConversationChannel
} from './conversation-store.mjs';
import { semanticHash } from './utils.mjs';

export const FAMILY_HOST_RUNTIME_SCHEMA = 'vexlife.family-host-runtime/v1';
export const FAMILY_HOST_PRINCIPAL_BINDING_SCHEMA = 'vexlife.family-principal-binding/v1';
export const FAMILY_HOST_ESTABLISHMENT_IDENTITY_SCHEMA = 'vexlife.family-establishment-identity/v1';

const REF = /^[A-Za-z0-9][A-Za-z0-9._:/#@+-]{0,511}$/u;
const STABLE = /^[a-z0-9](?:[a-z0-9._-]{0,190}[a-z0-9])?$/u;
const SHA = /^[0-9a-f]{64}$/u;
const REQUEST_KEYS = new Set([
  'home',
  'currentAuthorityProjection',
  'idempotencyKey',
  'observedAt',
  'instanceRef',
  'faults'
]);
const AUTHORITY_KEYS = new Set(['membership', 'lease', 'currentRevocationGeneration']);
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
const FAULT_KEYS = new Set(['failAfterSpaceCreation']);
const FAMILY_CHANNEL_LABEL_STRING_REF = 'family-room.channel';

export class FamilyHostRuntimeError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'FamilyHostRuntimeError';
    this.code = code;
    this.details = details;
  }
}

const fail = (code, message, details = null) => {
  throw new FamilyHostRuntimeError(code, message, details);
};

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function exactKeys(value, allowed, label) {
  if (!isObject(value)) {
    fail('FAMILY_HOST_INPUT_INVALID', `${label} must be one object`);
  }
  const keys = Object.keys(value);
  const extras = keys.filter((key) => !allowed.has(key));
  if (extras.length > 0) {
    fail('FAMILY_HOST_UNTRUSTED_FIELD', `${label} contains untrusted field ${extras.sort()[0]}`);
  }
  if (keys.length !== allowed.size) {
    fail('FAMILY_HOST_INPUT_INVALID', `${label} is missing required fields`);
  }
  return value;
}

function ref(value, label) {
  if (typeof value !== 'string' || !REF.test(value)) {
    fail('FAMILY_HOST_INPUT_INVALID', `${label} must be one safe opaque ref`);
  }
  return value;
}

function stable(value, label) {
  if (typeof value !== 'string' || !STABLE.test(value)) {
    fail('FAMILY_HOST_INPUT_INVALID', `${label} must be one portable lowercase stable ref`);
  }
  return value;
}

function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('FAMILY_HOST_INPUT_INVALID', `${label} must be one non-negative safe integer`);
  }
  return value;
}

function time(value, label) {
  if (
    typeof value !== 'string'
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    fail('FAMILY_HOST_INPUT_INVALID', `${label} must be canonical ISO-8601 UTC`);
  }
  return value;
}

function refs(value, label) {
  if (!Array.isArray(value)) {
    fail('FAMILY_HOST_AUTHORITY_INVALID', `${label} must be a ref array`);
  }
  const normalized = value.map((entry, index) => ref(entry, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    fail('FAMILY_HOST_AUTHORITY_INVALID', `${label} must not contain duplicates`);
  }
  return normalized;
}

function hashBoundObject(value, keys, hashField, label) {
  exactKeys(value, keys, label);
  if (!SHA.test(value[hashField] ?? '')) {
    fail('FAMILY_HOST_AUTHORITY_INVALID', `${label} is missing one canonical SHA-256`);
  }
  const core = structuredClone(value);
  delete core[hashField];
  if (semanticHash(core) !== value[hashField]) {
    fail('FAMILY_HOST_AUTHORITY_INVALID', `${label} hash does not match its canonical content`);
  }
  return value;
}

function currentAuthority(value, observedAt) {
  exactKeys(value, AUTHORITY_KEYS, 'currentAuthorityProjection');
  const membership = hashBoundObject(
    value.membership,
    MEMBERSHIP_KEYS,
    'membershipHash',
    'currentAuthorityProjection.membership'
  );
  const lease = hashBoundObject(
    value.lease,
    LEASE_KEYS,
    'leaseHash',
    'currentAuthorityProjection.lease'
  );
  const currentRevocationGeneration = integer(
    value.currentRevocationGeneration,
    'currentAuthorityProjection.currentRevocationGeneration'
  );

  if (
    membership.schemaVersion !== 'vexlife.bridge-device-membership/v1'
    || membership.state !== 'ACTIVE'
    || lease.schemaVersion !== 'vexlife.bridge-capability-lease/v1'
    || lease.state !== 'ACTIVE'
  ) {
    fail(
      'FAMILY_HOST_AUTHORITY_NOT_CURRENT',
      'Host requires one active current VEX_CORE Family authority projection'
    );
  }

  const membershipRef = ref(membership.membershipRef, 'membership.membershipRef');
  const homeRef = ref(membership.homeNodeRef, 'membership.homeNodeRef');
  const principalRef = ref(membership.principalRef, 'membership.principalRef');
  const deviceRef = ref(membership.deviceRef, 'membership.deviceRef');
  ref(lease.leaseRef, 'lease.leaseRef');
  refs(membership.capabilityRefs, 'membership.capabilityRefs');
  refs(lease.capabilityRefs, 'lease.capabilityRefs');
  refs(lease.projectRefs, 'lease.projectRefs');

  if (
    lease.homeNodeRef !== homeRef
    || lease.principalRef !== principalRef
    || lease.deviceRef !== deviceRef
  ) {
    fail(
      'FAMILY_HOST_AUTHORITY_IDENTITY_MISMATCH',
      'Home membership and capability lease do not identify the same current human/device/home tuple'
    );
  }

  if (
    integer(membership.revocationGeneration, 'membership.revocationGeneration')
      !== currentRevocationGeneration
    || integer(lease.revocationGeneration, 'lease.revocationGeneration')
      !== currentRevocationGeneration
  ) {
    fail(
      'FAMILY_HOST_AUTHORITY_REVOCATION_MISMATCH',
      'Home membership and capability lease do not match the current revocation generation'
    );
  }

  const at = Date.parse(observedAt);
  const issuedAt = Date.parse(time(lease.issuedAt, 'lease.issuedAt'));
  const expiresAt = Date.parse(time(lease.expiresAt, 'lease.expiresAt'));
  if (issuedAt > at || expiresAt <= issuedAt || at >= expiresAt) {
    fail('FAMILY_HOST_AUTHORITY_NOT_CURRENT', 'Home capability lease is outside its current window');
  }

  return Object.freeze({
    membershipRef,
    homeRef,
    principalRef,
    deviceRef,
    currentRevocationGeneration
  });
}

function derivedRef(prefix, value) {
  return `${prefix}.${semanticHash(value).slice(0, 32)}`;
}

export function deriveFamilyPrincipalBindingRef(currentAuthorityProjection, observedAt) {
  const at = time(observedAt, 'observedAt');
  const authority = currentAuthority(currentAuthorityProjection, at);
  return derivedRef('principal-binding.vex.family', {
    schemaVersion: FAMILY_HOST_PRINCIPAL_BINDING_SCHEMA,
    membershipRef: authority.membershipRef,
    homeRef: authority.homeRef,
    principalRef: authority.principalRef,
    deviceRef: authority.deviceRef,
    currentRevocationGeneration: authority.currentRevocationGeneration
  });
}

export function deriveFamilyEstablishmentIdentity({
  currentAuthorityProjection,
  idempotencyKey,
  observedAt
} = {}) {
  const at = time(observedAt, 'observedAt');
  const key = stable(idempotencyKey, 'idempotencyKey');
  const authority = currentAuthority(currentAuthorityProjection, at);
  const principalBindingRef = deriveFamilyPrincipalBindingRef(currentAuthorityProjection, at);
  const root = Object.freeze({
    schemaVersion: FAMILY_HOST_ESTABLISHMENT_IDENTITY_SCHEMA,
    principalBindingRef,
    membershipRef: authority.membershipRef,
    homeRef: authority.homeRef,
    principalRef: authority.principalRef,
    deviceRef: authority.deviceRef,
    currentRevocationGeneration: authority.currentRevocationGeneration,
    idempotencyKey: key
  });
  const one = (kind, prefix) => derivedRef(prefix, { ...root, kind });
  return Object.freeze({
    principalBindingRef,
    establishmentRef: one('ESTABLISHMENT', 'establishment.vex.family'),
    spaceRef: one('SPACE', 'space.vex.family'),
    familyCompanionLineageRef: one('FAMILY_COMPANION_LINEAGE', 'lineage.vex.family'),
    threadRef: one('THREAD', 'thread.vex.family'),
    initialChannelRef: one('INITIAL_GROUP_CHANNEL', 'channel.vex.family.initial')
  });
}

export function hostFamily(input = {}) {
  exactKeys(input, REQUEST_KEYS, 'Host request');
  exactKeys(input.faults, FAULT_KEYS, 'Host request faults');

  const observedAt = time(input.observedAt, 'observedAt');
  const instanceRef = stable(input.instanceRef, 'instanceRef');
  const authority = currentAuthority(input.currentAuthorityProjection, observedAt);
  const identities = deriveFamilyEstablishmentIdentity({
    currentAuthorityProjection: input.currentAuthorityProjection,
    idempotencyKey: input.idempotencyKey,
    observedAt
  });

  const spaceResult = createFamilySpace({
    home: input.home,
    spaceRef: identities.spaceRef,
    ownerPrincipalRef: authority.principalRef,
    ownerPrincipalBindingRef: identities.principalBindingRef,
    familyCompanionLineageRef: identities.familyCompanionLineageRef,
    familyCompanionState: 'ACTIVE',
    historyVisibilityPolicyRef: FAMILY_HISTORY_FROM_JOIN_POLICY,
    observedAt,
    instanceRef: `${instanceRef}.space`
  });
  const record = spaceResult.record;

  if (input.faults.failAfterSpaceCreation === true) {
    fail(
      'FAMILY_HOST_CHANNEL_CONTINUATION_REQUIRED',
      'Family Space is durable but initial Family channel materialization was intentionally interrupted',
      {
        establishmentRef: identities.establishmentRef,
        spaceRef: identities.spaceRef,
        familyCompanionLineageRef: identities.familyCompanionLineageRef,
        threadRef: identities.threadRef,
        initialChannelRef: identities.initialChannelRef,
        recordSha256: record.recordSha256
      }
    );
  }

  const channel = createFamilyChannel({
    channelRef: identities.initialChannelRef,
    threadRef: identities.threadRef,
    kind: 'GROUP',
    familySpaceRecord: record,
    labelStringRef: FAMILY_CHANNEL_LABEL_STRING_REF,
    createdAt: record.createdAt
  });
  const channelResult = materializeConversationChannel({
    home: input.home,
    channel,
    instanceRef: `${instanceRef}.channel`,
    observedAt: channel.createdAt
  });

  const created = spaceResult.state === 'CREATED';
  const materialized = channelResult.state === 'MATERIALIZED';

  return Object.freeze({
    schemaVersion: FAMILY_HOST_RUNTIME_SCHEMA,
    state:
      created || materialized
        ? 'FAMILY_HOST_ESTABLISHED'
        : 'FAMILY_HOST_IDEMPOTENT_CURRENT',
    establishmentRef: identities.establishmentRef,
    spaceRef: identities.spaceRef,
    familyCompanionLineageRef: identities.familyCompanionLineageRef,
    threadRef: identities.threadRef,
    initialChannelRef: identities.initialChannelRef,
    ownerPrincipalRef: authority.principalRef,
    ownerPrincipalBindingRef: identities.principalBindingRef,
    membershipGeneration: record.membershipGeneration,
    familySpaceRecordSha256: record.recordSha256,
    familySpaceState: spaceResult.state,
    channelMaterializationState: channelResult.state,
    effects: Object.freeze({
      familySpaceMutation: created,
      conversationChannelMutation: materialized,
      homeAuthorityMutation: false,
      personalCompanionLineageMutation: false,
      invitationMutation: false,
      relationshipsMutation: false,
      modelInvocation: false,
      modelActivation: false,
      trainingMutation: false,
      memoryMutation: false,
      publicationMutation: false
    })
  });
}

// [VXG RealForever]
