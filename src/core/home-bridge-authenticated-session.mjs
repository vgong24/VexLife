import crypto from 'node:crypto';

export const HOME_BRIDGE_AUTHENTICATED_SESSION_SCHEMA =
  'vexlife.home-bridge-authenticated-session/v1';
export const HOME_BRIDGE_LOCAL_DEVICE_AUTHENTICATION_EVIDENCE_SCHEMA =
  'vexlife.home-bridge-local-device-authentication-evidence/v1';
export const HOME_BRIDGE_PRINCIPAL_DECISION_SCHEMA =
  'vexlife.home-bridge-principal-decision/v1';

const REF = /^[A-Za-z0-9][A-Za-z0-9._:/#@+-]{0,511}$/u;
const DEFAULT_SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_SESSION_TTL_MS = 15 * 60 * 1000;

const AUTHENTICATION_KEYS = new Set([
  'schemaVersion',
  'state',
  'authenticationRef',
  'authenticationClass',
  'personRef',
  'deviceRef',
  'homeRef',
  'authenticatedAt',
  'expiresAt',
  'possessionState',
  'sourceReceiptRefs',
  'currentnessRefs'
]);

const PRINCIPAL_DECISION_KEYS = new Set([
  'schemaVersion',
  'state',
  'decisionRef',
  'decisionClass',
  'personRef',
  'principalRef',
  'sourceReceiptRefs'
]);

const SESSION_REQUEST_KEYS = new Set(['sessionRef']);
const REVOKE_KEYS = new Set(['sessionRef', 'reasonRef', 'revokedAt']);

export class HomeBridgeAuthenticatedSessionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'HomeBridgeAuthenticatedSessionError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new HomeBridgeAuthenticatedSessionError(code, message);
};

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function exactKeys(value, allowed, label) {
  if (!isObject(value)) fail('HOME_BRIDGE_SESSION_INPUT_INVALID', `${label} must be one object`);
  const keys = Object.keys(value);
  const extras = keys.filter((key) => !allowed.has(key));
  if (extras.length > 0) {
    fail(
      'HOME_BRIDGE_SESSION_UNTRUSTED_FIELD',
      `${label} contains unsupported field ${extras.sort()[0]}`
    );
  }
  if (keys.length !== allowed.size) {
    fail('HOME_BRIDGE_SESSION_INPUT_INVALID', `${label} is missing required fields`);
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
    fail('HOME_BRIDGE_SESSION_SOURCE_EVIDENCE_REQUIRED', `${label} must be a non-empty ref array`);
  }
  const normalized = values.map((value, index) => ref(value, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    fail('HOME_BRIDGE_SESSION_SOURCE_EVIDENCE_REQUIRED', `${label} must not contain duplicate refs`);
  }
  return Object.freeze([...normalized].sort());
}

function timestamp(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    fail('HOME_BRIDGE_SESSION_INPUT_INVALID', `${label} must be one ISO timestamp`);
  }
  return value;
}

function nowMs(value) {
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) {
    fail('HOME_BRIDGE_SESSION_INPUT_INVALID', 'current time is invalid');
  }
  return parsed;
}

function hashRef(prefix, value) {
  return `${prefix}.${crypto
    .createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')
    .slice(0, 32)}`;
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

function authenticationEvidence(value, expected, currentTime) {
  exactKeys(value, AUTHENTICATION_KEYS, 'authenticationEvidence');
  if (value.schemaVersion !== HOME_BRIDGE_LOCAL_DEVICE_AUTHENTICATION_EVIDENCE_SCHEMA) {
    fail(
      'HOME_BRIDGE_SESSION_AUTHENTICATION_REQUIRED',
      'local-device authentication evidence schema is not accepted'
    );
  }
  if (
    value.state !== 'CURRENT_ACCEPTED'
    || value.authenticationClass !== 'LOCAL_DEVICE_OPERATOR_CURRENT'
    || value.possessionState !== 'CURRENT_DEVICE_POSSESSION_VERIFIED'
  ) {
    fail(
      'HOME_BRIDGE_SESSION_AUTHENTICATION_REQUIRED',
      'local-device authentication evidence is not current and accepted'
    );
  }

  const authenticatedAt = timestamp(value.authenticatedAt, 'authenticationEvidence.authenticatedAt');
  const expiresAt = timestamp(value.expiresAt, 'authenticationEvidence.expiresAt');
  const authenticatedMs = Date.parse(authenticatedAt);
  const expiresMs = Date.parse(expiresAt);
  if (authenticatedMs > currentTime || expiresMs <= authenticatedMs || currentTime >= expiresMs) {
    fail(
      'HOME_BRIDGE_SESSION_AUTHENTICATION_STALE',
      'local-device authentication evidence is outside its current window'
    );
  }

  if (
    ref(value.homeRef, 'authenticationEvidence.homeRef') !== expected.homeRef
    || ref(value.deviceRef, 'authenticationEvidence.deviceRef') !== expected.deviceRef
    || ref(value.personRef, 'authenticationEvidence.personRef') !== expected.personRef
  ) {
    fail(
      'HOME_BRIDGE_SESSION_IDENTITY_MISMATCH',
      'local-device authentication evidence does not match the server-bound Home/device/person'
    );
  }

  return Object.freeze({
    schemaVersion: value.schemaVersion,
    state: value.state,
    authenticationRef: ref(value.authenticationRef, 'authenticationEvidence.authenticationRef'),
    authenticationClass: value.authenticationClass,
    personRef: value.personRef,
    deviceRef: value.deviceRef,
    homeRef: value.homeRef,
    authenticatedAt,
    expiresAt,
    possessionState: value.possessionState,
    sourceReceiptRefs: refs(value.sourceReceiptRefs, 'authenticationEvidence.sourceReceiptRefs'),
    currentnessRefs: refs(value.currentnessRefs, 'authenticationEvidence.currentnessRefs')
  });
}

function principalDecision(value, expectedPersonRef) {
  exactKeys(value, PRINCIPAL_DECISION_KEYS, 'principalDecision');
  if (
    value.schemaVersion !== HOME_BRIDGE_PRINCIPAL_DECISION_SCHEMA
    || value.state !== 'ACCEPTED'
    || value.decisionClass !== 'EXPLICIT_HUMAN_DECISION'
  ) {
    fail(
      'HOME_BRIDGE_SESSION_PRINCIPAL_DECISION_REQUIRED',
      'one explicit accepted human principal decision is required'
    );
  }
  if (ref(value.personRef, 'principalDecision.personRef') !== expectedPersonRef) {
    fail(
      'HOME_BRIDGE_SESSION_IDENTITY_MISMATCH',
      'principal decision does not bind the authenticated local person'
    );
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    state: value.state,
    decisionRef: ref(value.decisionRef, 'principalDecision.decisionRef'),
    decisionClass: value.decisionClass,
    personRef: value.personRef,
    principalRef: ref(value.principalRef, 'principalDecision.principalRef'),
    sourceReceiptRefs: refs(value.sourceReceiptRefs, 'principalDecision.sourceReceiptRefs')
  });
}

function combineRefs(...sets) {
  return Object.freeze([...new Set(sets.flat())].sort());
}

function safeTtl(value) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_SESSION_TTL_MS) {
    fail(
      'HOME_BRIDGE_SESSION_INPUT_INVALID',
      `session ttl must be an integer from 1 through ${MAX_SESSION_TTL_MS}`
    );
  }
  return value;
}

function sessionToken(entropyProvider) {
  const bytes = entropyProvider(32);
  if (!Buffer.isBuffer(bytes) || bytes.length !== 32) {
    fail('HOME_BRIDGE_SESSION_ENTROPY_INVALID', 'session entropy provider must return exactly 32 bytes');
  }
  return `session.vexlife.home-bridge.${bytes.toString('base64url')}`;
}

function tokenDigest(sessionRef) {
  return crypto.createHash('sha256').update(sessionRef, 'utf8').digest('hex');
}

export function createHomeBridgeAuthenticatedSessionOwner(options = {}) {
  if (!isObject(options)) {
    throw new TypeError('authenticated-session owner options must be one object');
  }

  const {
    homeRef,
    deviceRef,
    personRef,
    ownerSourceReceiptRefs,
    defaultSessionTtlMs = DEFAULT_SESSION_TTL_MS,
    testMode = false
  } = options;

  const customClock = Object.hasOwn(options, 'nowProvider');
  const customEntropy = Object.hasOwn(options, 'entropyProvider');
  if (testMode !== true && (customClock || customEntropy)) {
    throw new TypeError('custom clock/entropy providers are test-only');
  }

  const nowProvider = customClock ? options.nowProvider : () => Date.now();
  const entropyProvider = customEntropy ? options.entropyProvider : (size) => crypto.randomBytes(size);
  if (typeof nowProvider !== 'function' || typeof entropyProvider !== 'function') {
    throw new TypeError('nowProvider and entropyProvider must be functions');
  }

  const binding = Object.freeze({
    homeRef: ref(homeRef, 'homeRef'),
    deviceRef: ref(deviceRef, 'deviceRef'),
    personRef: ref(personRef, 'personRef'),
    ownerSourceReceiptRefs: refs(ownerSourceReceiptRefs, 'ownerSourceReceiptRefs')
  });
  const defaultTtl = safeTtl(defaultSessionTtlMs);
  const records = new Map();

  const currentTime = () => nowMs(nowProvider());

  function establish({ authenticationEvidence: rawAuthentication, principalDecision: rawDecision, ttlMs = defaultTtl } = {}) {
    const observedAt = currentTime();
    const authentication = authenticationEvidence(rawAuthentication, binding, observedAt);
    const decision = principalDecision(rawDecision, binding.personRef);
    const ttl = safeTtl(ttlMs);
    const expiresAtMs = Math.min(
      Date.parse(authentication.expiresAt),
      observedAt + ttl
    );
    if (expiresAtMs <= observedAt) {
      fail(
        'HOME_BRIDGE_SESSION_AUTHENTICATION_STALE',
        'authentication evidence expires before a session can be established'
      );
    }

    const stableSessionBindingRef = hashRef(
      'session-binding.vexlife.home-bridge',
      {
        homeRef: binding.homeRef,
        deviceRef: binding.deviceRef,
        personRef: binding.personRef,
        principalRef: decision.principalRef,
        authenticationRef: authentication.authenticationRef,
        decisionRef: decision.decisionRef
      }
    );
    const sessionRef = sessionToken(entropyProvider);
    const digest = tokenDigest(sessionRef);
    const currentnessRef = hashRef(
      'currentness.vexlife.home-bridge-authenticated-session',
      {
        stableSessionBindingRef,
        authenticationRef: authentication.authenticationRef,
        observedAt,
        expiresAtMs
      }
    );
    const sessionReceiptRef = hashRef(
      'receipt.vexlife.home-bridge-authenticated-session',
      {
        stableSessionBindingRef,
        principalRef: decision.principalRef,
        deviceRef: binding.deviceRef,
        authenticationRef: authentication.authenticationRef,
        currentnessRef
      }
    );
    const sourceReceiptRefs = combineRefs(
      binding.ownerSourceReceiptRefs,
      authentication.sourceReceiptRefs,
      decision.sourceReceiptRefs,
      [authentication.authenticationRef, decision.decisionRef, sessionReceiptRef]
    );
    const currentnessRefs = combineRefs(
      authentication.currentnessRefs,
      [currentnessRef]
    );
    const assertion = Object.freeze({
      schemaVersion: HOME_BRIDGE_AUTHENTICATED_SESSION_SCHEMA,
      state: 'AUTHENTICATED_CURRENT',
      stableSessionBindingRef,
      principalRef: decision.principalRef,
      deviceRef: binding.deviceRef
    });

    records.set(digest, {
      assertion,
      sourceReceiptRefs,
      currentnessRefs,
      expiresAtMs,
      revoked: false,
      sessionReceiptRef
    });

    const result = {
      state: 'AUTHENTICATED_SESSION_ESTABLISHED',
      stableSessionBindingRef,
      principalRef: decision.principalRef,
      deviceRef: binding.deviceRef,
      sessionReceiptRef,
      expiresAt: new Date(expiresAtMs).toISOString(),
      sourceReceiptRefs,
      currentnessRefs,
      effects: Object.freeze({
        authorizationGranted: false,
        capabilityLeaseGranted: false,
        homeBridgeMembershipMutated: false,
        familyMembershipMutated: false,
        standingHomeAuthorityGranted: false,
        remoteHomeWriteGranted: false,
        homePayloadRead: false,
        networkMutation: false,
        modelInvocation: false
      })
    };
    Object.defineProperty(result, 'sessionRef', {
      value: sessionRef,
      enumerable: false,
      writable: false,
      configurable: false
    });
    return Object.freeze(result);
  }

  function resolve(input = {}) {
    exactKeys(input, SESSION_REQUEST_KEYS, 'session request');
    const sessionRef = ref(input.sessionRef, 'sessionRef');
    const record = records.get(tokenDigest(sessionRef));
    if (!record) {
      fail('HOME_BRIDGE_SESSION_UNKNOWN', 'session handle is not current in this owner');
    }
    if (record.revoked) {
      fail('HOME_BRIDGE_SESSION_REVOKED', 'session handle has been revoked');
    }
    if (currentTime() >= record.expiresAtMs) {
      records.delete(tokenDigest(sessionRef));
      fail('HOME_BRIDGE_SESSION_EXPIRED', 'session handle has expired');
    }
    return Object.freeze({
      state: 'CURRENT',
      value: cloneFreeze(record.assertion),
      sourceReceiptRefs: record.sourceReceiptRefs,
      currentnessRefs: record.currentnessRefs
    });
  }

  function revoke(input = {}) {
    exactKeys(input, REVOKE_KEYS, 'session revocation');
    const sessionRef = ref(input.sessionRef, 'sessionRef');
    ref(input.reasonRef, 'reasonRef');
    const revokedAt = timestamp(input.revokedAt, 'revokedAt');
    if (Date.parse(revokedAt) > currentTime()) {
      fail('HOME_BRIDGE_SESSION_INPUT_INVALID', 'revocation time may not be in the future');
    }
    const digest = tokenDigest(sessionRef);
    const record = records.get(digest);
    if (!record) {
      fail('HOME_BRIDGE_SESSION_UNKNOWN', 'session handle is not current in this owner');
    }
    record.revoked = true;
    return Object.freeze({
      state: 'AUTHENTICATED_SESSION_REVOKED',
      stableSessionBindingRef: record.assertion.stableSessionBindingRef,
      sessionReceiptRef: record.sessionReceiptRef,
      reasonRef: input.reasonRef,
      revokedAt,
      effects: Object.freeze({
        authorizationGranted: false,
        capabilityLeaseGranted: false,
        standingHomeAuthorityGranted: false,
        remoteHomeWriteGranted: false
      })
    });
  }

  function status() {
    let current = 0;
    const observedAt = currentTime();
    for (const record of records.values()) {
      if (!record.revoked && observedAt < record.expiresAtMs) current += 1;
    }
    return Object.freeze({
      state: 'CURRENT',
      currentSessionCount: current,
      homeRef: binding.homeRef,
      deviceRef: binding.deviceRef,
      personRef: binding.personRef
    });
  }

  return Object.freeze({ establish, resolve, revoke, status });
}

// [VXG RealForever]
