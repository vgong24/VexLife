import { evaluateRemoteRequest } from './home-bridge.mjs';
import { semanticHash } from './utils.mjs';

export const HOME_BRIDGE_SESSION_AUTHORITY_SCHEMA = 'vexlife.home-bridge-session-authority/v1';
export const HOME_BRIDGE_SESSION_ASSERTION_SCHEMA = 'vexlife.home-bridge-authenticated-session/v1';
export const HOME_BRIDGE_SESSION_AUTHORITY_ACTION_REF = 'action.vexlife.home-bridge.session-authority.resolve';

const REF = /^[A-Za-z0-9][A-Za-z0-9._:/#@+-]{0,511}$/u;
const REQUEST_KEYS = new Set(['sessionRef']);
const ENVELOPE_KEYS = new Set(['state', 'value', 'sourceReceiptRefs', 'currentnessRefs']);
const SESSION_KEYS = new Set([
  'schemaVersion',
  'state',
  'stableSessionBindingRef',
  'principalRef',
  'deviceRef'
]);

export class HomeBridgeSessionAuthorityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'HomeBridgeSessionAuthorityError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new HomeBridgeSessionAuthorityError(code, message);
};

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function exactKeys(value, allowed, label) {
  if (!isObject(value)) fail('HOME_BRIDGE_SESSION_INPUT_INVALID', `${label} must be one object`);
  const extras = Object.keys(value).filter((key) => !allowed.has(key));
  if (extras.length) {
    fail(
      'HOME_BRIDGE_SESSION_UNTRUSTED_FIELD',
      `${label} contains untrusted field ${extras[0]}`
    );
  }
  return value;
}

function ref(value, label) {
  if (typeof value !== 'string' || !REF.test(value)) {
    fail('HOME_BRIDGE_SESSION_INPUT_INVALID', `${label} must be one safe opaque ref`);
  }
  return value;
}

function refs(values, label) {
  if (!Array.isArray(values) || values.length === 0) {
    fail('HOME_BRIDGE_SESSION_OWNER_EVIDENCE_REQUIRED', `${label} must be a non-empty ref array`);
  }
  const normalized = values.map((value, index) => ref(value, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    fail('HOME_BRIDGE_SESSION_OWNER_EVIDENCE_REQUIRED', `${label} must not contain duplicate refs`);
  }
  return normalized;
}

function ownerEnvelope(result, label) {
  if (Array.isArray(result)) {
    fail('HOME_BRIDGE_SESSION_AMBIGUOUS_OWNER_RESULT', `${label} returned multiple candidates`);
  }
  exactKeys(result, ENVELOPE_KEYS, label);
  if (result.state !== 'CURRENT') {
    fail('HOME_BRIDGE_SESSION_OWNER_NOT_CURRENT', `${label} is not current`);
  }
  if (Array.isArray(result.value)) {
    fail('HOME_BRIDGE_SESSION_AMBIGUOUS_OWNER_RESULT', `${label} returned multiple candidates`);
  }
  if (result.value === null || result.value === undefined) {
    fail('HOME_BRIDGE_SESSION_OWNER_NOT_CURRENT', `${label} did not return one current value`);
  }
  return Object.freeze({
    value: result.value,
    sourceReceiptRefs: Object.freeze(refs(result.sourceReceiptRefs, `${label}.sourceReceiptRefs`)),
    currentnessRefs: Object.freeze(refs(result.currentnessRefs, `${label}.currentnessRefs`))
  });
}

function authenticatedSession(value) {
  exactKeys(value, SESSION_KEYS, 'authenticatedSession');
  if (value.schemaVersion !== HOME_BRIDGE_SESSION_ASSERTION_SCHEMA) {
    fail('HOME_BRIDGE_SESSION_AUTHENTICATION_REQUIRED', 'authenticated session schema is not accepted');
  }
  if (value.state !== 'AUTHENTICATED_CURRENT') {
    fail('HOME_BRIDGE_SESSION_AUTHENTICATION_REQUIRED', 'session is not authenticated and current');
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    state: value.state,
    stableSessionBindingRef: ref(value.stableSessionBindingRef, 'stableSessionBindingRef'),
    principalRef: ref(value.principalRef, 'principalRef'),
    deviceRef: ref(value.deviceRef, 'deviceRef')
  });
}

function membership(value, session) {
  if (!isObject(value) || value.schemaVersion !== 'vexlife.bridge-device-membership/v1') {
    fail('HOME_BRIDGE_SESSION_MEMBERSHIP_REQUIRED', 'current Home Bridge membership is required');
  }
  if (value.state !== 'ACTIVE') {
    fail('HOME_BRIDGE_SESSION_MEMBERSHIP_REQUIRED', 'Home Bridge membership is not active');
  }
  if (value.principalRef !== session.principalRef || value.deviceRef !== session.deviceRef) {
    fail(
      'HOME_BRIDGE_SESSION_IDENTITY_MISMATCH',
      'authenticated session does not match Home Bridge membership'
    );
  }
  if (!Number.isSafeInteger(value.revocationGeneration) || value.revocationGeneration < 0) {
    fail('HOME_BRIDGE_SESSION_MEMBERSHIP_REQUIRED', 'membership revocation generation is invalid');
  }
  ref(value.membershipRef, 'membership.membershipRef');
  ref(value.homeNodeRef, 'membership.homeNodeRef');
  return value;
}

function lease(value, session, currentMembership, now) {
  if (!isObject(value) || value.schemaVersion !== 'vexlife.bridge-capability-lease/v1') {
    fail('HOME_BRIDGE_SESSION_LEASE_REQUIRED', 'current Home Bridge capability lease is required');
  }
  if (value.state !== 'ACTIVE') {
    fail('HOME_BRIDGE_SESSION_LEASE_REQUIRED', 'Home Bridge capability lease is not active');
  }
  if (
    value.principalRef !== session.principalRef
    || value.deviceRef !== session.deviceRef
    || value.principalRef !== currentMembership.principalRef
    || value.deviceRef !== currentMembership.deviceRef
    || value.homeNodeRef !== currentMembership.homeNodeRef
  ) {
    fail(
      'HOME_BRIDGE_SESSION_IDENTITY_MISMATCH',
      'authenticated session, membership, and lease identity do not match'
    );
  }
  if (!Number.isSafeInteger(value.revocationGeneration) || value.revocationGeneration < 0) {
    fail('HOME_BRIDGE_SESSION_LEASE_REQUIRED', 'lease revocation generation is invalid');
  }
  if (typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt))) {
    fail('HOME_BRIDGE_SESSION_LEASE_REQUIRED', 'lease expiry is invalid');
  }
  const nowMs = typeof now === 'number' ? now : Date.parse(now);
  if (!Number.isFinite(nowMs)) {
    fail('HOME_BRIDGE_SESSION_INPUT_INVALID', 'current time is invalid');
  }
  if (nowMs >= Date.parse(value.expiresAt)) {
    fail('HOME_BRIDGE_SESSION_LEASE_EXPIRED', 'Home Bridge capability lease is expired');
  }
  ref(value.leaseRef, 'lease.leaseRef');
  return value;
}

function revocationGeneration(value) {
  if (
    !isObject(value)
    || Object.keys(value).length !== 1
    || !Object.hasOwn(value, 'generation')
    || !Number.isSafeInteger(value.generation)
    || value.generation < 0
  ) {
    fail(
      'HOME_BRIDGE_SESSION_REVOCATION_REQUIRED',
      'current revocation generation owner must return one non-negative generation'
    );
  }
  return value.generation;
}

function combineRefs(envelopes, field) {
  return Object.freeze([
    ...new Set(envelopes.flatMap((envelope) => envelope[field]))
  ].sort());
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function cloneFreeze(value) {
  return deepFreeze(structuredClone(value));
}

export function createHomeBridgeSessionAuthorityResolver({
  resolveAuthenticatedSession,
  resolveMembership,
  resolveLease,
  resolveCurrentRevocationGeneration,
  nowProvider = () => new Date().toISOString()
} = {}) {
  for (const [label, resolver] of Object.entries({
    resolveAuthenticatedSession,
    resolveMembership,
    resolveLease,
    resolveCurrentRevocationGeneration
  })) {
    if (typeof resolver !== 'function') {
      throw new TypeError(`${label} must be one server-owned resolver function`);
    }
  }
  if (typeof nowProvider !== 'function') {
    throw new TypeError('nowProvider must be one function');
  }

  return Object.freeze({
    async resolve(input = {}) {
      exactKeys(input, REQUEST_KEYS, 'session authority request');
      const sessionRef = ref(input.sessionRef, 'sessionRef');

      const sessionEnvelope = ownerEnvelope(
        await resolveAuthenticatedSession(Object.freeze({ sessionRef })),
        'authenticated session owner'
      );
      const session = authenticatedSession(sessionEnvelope.value);

      const identity = Object.freeze({
        stableSessionBindingRef: session.stableSessionBindingRef,
        principalRef: session.principalRef,
        deviceRef: session.deviceRef
      });
      const membershipEnvelope = ownerEnvelope(
        await resolveMembership(identity),
        'Home Bridge membership owner'
      );
      const currentMembership = membership(membershipEnvelope.value, session);

      const leaseEnvelope = ownerEnvelope(
        await resolveLease(Object.freeze({
          ...identity,
          membershipRef: currentMembership.membershipRef,
          homeNodeRef: currentMembership.homeNodeRef
        })),
        'Home Bridge lease owner'
      );
      const currentLease = lease(
        leaseEnvelope.value,
        session,
        currentMembership,
        nowProvider()
      );

      const revocationEnvelope = ownerEnvelope(
        await resolveCurrentRevocationGeneration(Object.freeze({
          ...identity,
          membershipRef: currentMembership.membershipRef,
          leaseRef: currentLease.leaseRef,
          homeNodeRef: currentMembership.homeNodeRef
        })),
        'Home Bridge revocation owner'
      );
      const currentRevocationGeneration = revocationGeneration(revocationEnvelope.value);

      if (
        currentMembership.revocationGeneration !== currentRevocationGeneration
        || currentLease.revocationGeneration !== currentRevocationGeneration
      ) {
        fail(
          'HOME_BRIDGE_SESSION_REVOCATION_MISMATCH',
          'session authority is stale against the current revocation generation'
        );
      }

      const request = Object.freeze({
        requestRef: `request.vexlife.home-bridge-session-authority.${semanticHash({
          stableSessionBindingRef: session.stableSessionBindingRef,
          principalRef: session.principalRef,
          deviceRef: session.deviceRef,
          membershipRef: currentMembership.membershipRef,
          leaseRef: currentLease.leaseRef,
          currentRevocationGeneration
        }).slice(0, 32)}`,
        deviceRef: session.deviceRef,
        leaseRef: currentLease.leaseRef,
        channelRef: 'channel.vexlife.home-bridge-session-authority',
        speakerRef: session.principalRef,
        actionRef: HOME_BRIDGE_SESSION_AUTHORITY_ACTION_REF,
        idempotencyKey: null
      });
      const admission = evaluateRemoteRequest({
        request,
        membership: currentMembership,
        lease: currentLease,
        now: nowProvider(),
        currentRevocationGeneration,
        registeredActionRefs: [HOME_BRIDGE_SESSION_AUTHORITY_ACTION_REF],
        requiredCapabilityRefs: [],
        rawModelEndpointExposed: false
      });
      if (admission.state !== 'REMOTE_REQUEST_ADMITTED') {
        fail(
          'HOME_BRIDGE_SESSION_AUTHORITY_DENIED',
          'accepted Home Bridge request admission denied current session authority'
        );
      }

      const envelopes = [
        sessionEnvelope,
        membershipEnvelope,
        leaseEnvelope,
        revocationEnvelope
      ];
      const sourceReceiptRefs = combineRefs(envelopes, 'sourceReceiptRefs');
      const currentnessRefs = combineRefs(envelopes, 'currentnessRefs');
      const authorityReceiptRef = `receipt.vexlife.home-bridge-session-authority.${semanticHash({
        stableSessionBindingRef: session.stableSessionBindingRef,
        principalRef: session.principalRef,
        deviceRef: session.deviceRef,
        membershipRef: currentMembership.membershipRef,
        leaseRef: currentLease.leaseRef,
        currentRevocationGeneration,
        sourceReceiptRefs,
        currentnessRefs
      }).slice(0, 32)}`;

      return Object.freeze({
        schemaVersion: HOME_BRIDGE_SESSION_AUTHORITY_SCHEMA,
        state: 'CURRENT',
        authorityReceiptRef,
        stableSessionBindingRef: session.stableSessionBindingRef,
        principalRef: session.principalRef,
        deviceRef: session.deviceRef,
        membership: cloneFreeze(currentMembership),
        lease: cloneFreeze(currentLease),
        currentRevocationGeneration,
        sourceReceiptRefs,
        currentnessRefs,
        effects: Object.freeze({
          pairingMutation: false,
          principalRebinding: false,
          authenticationMutation: false,
          authorizationMutation: false,
          capabilityLeaseMutation: false,
          revocationMutation: false,
          HomePayloadReadOrWrite: false,
          networkMutation: false,
          MemoryMutation: false,
          RelationshipsMutation: false,
          modelRuntimeEffect: false,
          training: false,
          publication: false
        })
      });
    }
  });
}

// [VXG RealForever]
