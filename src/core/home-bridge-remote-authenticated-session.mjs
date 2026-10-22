import crypto from 'node:crypto';
import { HOME_BRIDGE_AUTHENTICATED_SESSION_SCHEMA } from './home-bridge-authenticated-session.mjs';
import { semanticHash } from './utils.mjs';

export const HOME_BRIDGE_REMOTE_DEVICE_POSSESSION_RECEIPT_SCHEMA =
  'vextreme.security.home-device-possession-verify-receipt/v1';
export const HOME_BRIDGE_DEVICE_MEMBERSHIP_SCHEMA =
  'vexlife.bridge-device-membership/v1';

const SIGNATURE_ALGORITHM_REF = 'signature.vextreme.ecdsa-p256-sha256';
const DEFAULT_SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_SESSION_TTL_MS = 15 * 60 * 1000;
const REF = /^[A-Za-z0-9][A-Za-z0-9._:/#@+-]{0,511}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const FINGERPRINT_REF = /^fingerprint\.sha256\.[a-f0-9]{64}$/u;

const POSSESSION_KEYS = new Set([
  'schemaVersion', 'receiptRef', 'requestRef', 'challengeRef', 'homeRef', 'principalRef',
  'deviceRef', 'membershipRef', 'membershipHash', 'revocationGeneration',
  'devicePublicKeyFingerprintRef', 'signatureAlgorithmRef', 'signingPayloadSha256',
  'devicePossessionState', 'authenticationEvidenceEligible', 'homeAuthorization',
  'capabilityLease', 'networkAuthority', 'cameraAuthority', 'verificationEvidenceRef', 'observedAtMs',
  'expiresAtMs', 'sourceRefs', 'currentnessRefs'
]);
const MEMBERSHIP_KEYS = new Set([
  'schemaVersion', 'membershipRef', 'homeNodeRef', 'principalRef', 'deviceRef',
  'devicePublicKey', 'capabilityRefs', 'approvedBy', 'approvedAt',
  'revocationGeneration', 'state', 'membershipHash'
]);
const SESSION_REQUEST_KEYS = new Set(['sessionRef']);
const REVOKE_KEYS = new Set(['sessionRef', 'reasonRef', 'revokedAt']);

export class HomeBridgeRemoteAuthenticatedSessionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'HomeBridgeRemoteAuthenticatedSessionError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new HomeBridgeRemoteAuthenticatedSessionError(code, message);
};
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function exactKeys(value, allowed, label) {
  if (!isObject(value)) fail('HOME_BRIDGE_REMOTE_SESSION_INPUT_INVALID', `${label} must be one object`);
  const keys = Object.keys(value);
  const extras = keys.filter((key) => !allowed.has(key));
  if (extras.length > 0) fail('HOME_BRIDGE_REMOTE_SESSION_UNTRUSTED_FIELD', `${label} contains unsupported field ${extras.sort()[0]}`);
  if (keys.length !== allowed.size) fail('HOME_BRIDGE_REMOTE_SESSION_INPUT_INVALID', `${label} is missing required fields`);
  return value;
}
function ref(value, label) {
  if (typeof value !== 'string' || !REF.test(value)) fail('HOME_BRIDGE_REMOTE_SESSION_INPUT_INVALID', `${label} must be one safe opaque ref`);
  return value;
}
function refs(values, label) {
  if (!Array.isArray(values) || values.length === 0) fail('HOME_BRIDGE_REMOTE_SESSION_SOURCE_EVIDENCE_REQUIRED', `${label} must be a non-empty ref array`);
  const normalized = values.map((value, index) => ref(value, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) fail('HOME_BRIDGE_REMOTE_SESSION_SOURCE_EVIDENCE_REQUIRED', `${label} must not contain duplicate refs`);
  return Object.freeze([...normalized].sort());
}
function digest(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) fail('HOME_BRIDGE_REMOTE_SESSION_INPUT_INVALID', `${label} must be one lowercase SHA-256 digest`);
  return value;
}
function fingerprintRef(value, label) {
  if (typeof value !== 'string' || !FINGERPRINT_REF.test(value)) {
    fail('HOME_BRIDGE_REMOTE_SESSION_INPUT_INVALID', `${label} must be fingerprint.sha256.<lowercase SHA-256 hex>`);
  }
  return value;
}
function safeUint(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail('HOME_BRIDGE_REMOTE_SESSION_INPUT_INVALID', `${label} must be a non-negative safe integer`);
  return value;
}
function timestamp(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail('HOME_BRIDGE_REMOTE_SESSION_INPUT_INVALID', `${label} must be one ISO timestamp`);
  return value;
}
function nowMs(value) {
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) fail('HOME_BRIDGE_REMOTE_SESSION_INPUT_INVALID', 'current time is invalid');
  return parsed;
}
function combineRefs(...sets) {
  return Object.freeze([...new Set(sets.flat())].sort());
}
function hashRef(prefix, value) {
  return `${prefix}.${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32)}`;
}
function safeTtl(value) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_SESSION_TTL_MS) {
    fail('HOME_BRIDGE_REMOTE_SESSION_INPUT_INVALID', `session ttl must be an integer from 1 through ${MAX_SESSION_TTL_MS}`);
  }
  return value;
}
function sessionToken(entropyProvider) {
  const bytes = entropyProvider(32);
  if (!Buffer.isBuffer(bytes) || bytes.length !== 32) fail('HOME_BRIDGE_REMOTE_SESSION_ENTROPY_INVALID', 'session entropy provider must return exactly 32 bytes');
  return `session.vexlife.home-bridge.remote.${bytes.toString('base64url')}`;
}
function tokenDigest(sessionRef) {
  return crypto.createHash('sha256').update(sessionRef, 'utf8').digest('hex');
}
function cloneFreeze(value) {
  const cloned = structuredClone(value);
  const freeze = (item) => {
    if (item && typeof item === 'object' && !Object.isFrozen(item)) {
      for (const nested of Object.values(item)) freeze(nested);
      Object.freeze(item);
    }
    return item;
  };
  return freeze(cloned);
}

function validateMembership(value, binding, currentRevocationGeneration) {
  exactKeys(value, MEMBERSHIP_KEYS, 'membership');
  if (value.schemaVersion !== HOME_BRIDGE_DEVICE_MEMBERSHIP_SCHEMA || value.state !== 'ACTIVE') {
    fail('HOME_BRIDGE_REMOTE_SESSION_MEMBERSHIP_REQUIRED', 'current active Home Bridge membership is required');
  }
  ref(value.membershipRef, 'membership.membershipRef');
  ref(value.homeNodeRef, 'membership.homeNodeRef');
  ref(value.principalRef, 'membership.principalRef');
  ref(value.deviceRef, 'membership.deviceRef');
  ref(value.devicePublicKey, 'membership.devicePublicKey');
  refs(value.capabilityRefs, 'membership.capabilityRefs');
  ref(value.approvedBy, 'membership.approvedBy');
  timestamp(value.approvedAt, 'membership.approvedAt');
  safeUint(value.revocationGeneration, 'membership.revocationGeneration');
  digest(value.membershipHash, 'membership.membershipHash');
  if (value.homeNodeRef !== binding.homeRef || value.deviceRef !== binding.deviceRef || value.principalRef !== binding.principalRef) {
    fail('HOME_BRIDGE_REMOTE_SESSION_IDENTITY_MISMATCH', 'membership does not bind the server Home/device/principal');
  }
  if (value.revocationGeneration !== currentRevocationGeneration) {
    fail('HOME_BRIDGE_REMOTE_SESSION_REVOKED', 'membership revocation generation is not current');
  }
  const { membershipHash, ...semanticMembership } = value;
  if (semanticHash(semanticMembership) !== membershipHash) {
    fail('HOME_BRIDGE_REMOTE_SESSION_MEMBERSHIP_STALE', 'membership hash does not bind current membership fields');
  }
  return cloneFreeze(value);
}

function validatePossessionReceipt(value, membership, binding, currentTime, currentRevocationGeneration) {
  exactKeys(value, POSSESSION_KEYS, 'possessionReceipt');
  if (value.schemaVersion !== HOME_BRIDGE_REMOTE_DEVICE_POSSESSION_RECEIPT_SCHEMA) {
    fail('HOME_BRIDGE_REMOTE_SESSION_POSSESSION_REQUIRED', 'remote device-possession receipt schema is not accepted');
  }
  if (
    value.devicePossessionState !== 'VERIFIED_CURRENT'
    || value.authenticationEvidenceEligible !== true
    || value.homeAuthorization !== false
    || value.capabilityLease !== false
    || value.networkAuthority !== false
    || value.cameraAuthority !== false
    || value.signatureAlgorithmRef !== SIGNATURE_ALGORITHM_REF
  ) {
    fail('HOME_BRIDGE_REMOTE_SESSION_POSSESSION_REQUIRED', 'remote possession receipt is not current authentication evidence');
  }
  for (const key of ['receiptRef','requestRef','challengeRef','homeRef','principalRef','deviceRef','membershipRef','verificationEvidenceRef']) {
    ref(value[key], `possessionReceipt.${key}`);
  }
  for (const key of ['membershipHash','signingPayloadSha256']) digest(value[key], `possessionReceipt.${key}`);
  fingerprintRef(value.devicePublicKeyFingerprintRef, 'possessionReceipt.devicePublicKeyFingerprintRef');
  safeUint(value.revocationGeneration, 'possessionReceipt.revocationGeneration');
  safeUint(value.observedAtMs, 'possessionReceipt.observedAtMs');
  safeUint(value.expiresAtMs, 'possessionReceipt.expiresAtMs');
  refs(value.sourceRefs, 'possessionReceipt.sourceRefs');
  refs(value.currentnessRefs, 'possessionReceipt.currentnessRefs');
  if (value.observedAtMs > currentTime || value.expiresAtMs <= value.observedAtMs || currentTime >= value.expiresAtMs) {
    fail('HOME_BRIDGE_REMOTE_SESSION_POSSESSION_STALE', 'remote possession receipt is outside its current window');
  }
  if (
    value.homeRef !== binding.homeRef
    || value.deviceRef !== binding.deviceRef
    || value.principalRef !== binding.principalRef
    || value.membershipRef !== membership.membershipRef
    || value.membershipHash !== membership.membershipHash
    || value.revocationGeneration !== currentRevocationGeneration
  ) {
    fail('HOME_BRIDGE_REMOTE_SESSION_IDENTITY_MISMATCH', 'remote possession receipt does not bind current Home membership');
  }
  return cloneFreeze(value);
}

export function createHomeBridgeRemoteAuthenticatedSessionOwner(options = {}) {
  if (!isObject(options)) throw new TypeError('remote authenticated-session owner options must be one object');
  const {
    homeRef,
    deviceRef,
    principalRef,
    ownerSourceReceiptRefs,
    defaultSessionTtlMs = DEFAULT_SESSION_TTL_MS,
    testMode = false
  } = options;
  const customClock = Object.hasOwn(options, 'nowProvider');
  const customEntropy = Object.hasOwn(options, 'entropyProvider');
  if (testMode !== true && (customClock || customEntropy)) throw new TypeError('custom clock/entropy providers are test-only');
  const nowProvider = customClock ? options.nowProvider : () => Date.now();
  const entropyProvider = customEntropy ? options.entropyProvider : (size) => crypto.randomBytes(size);
  if (typeof nowProvider !== 'function' || typeof entropyProvider !== 'function') throw new TypeError('nowProvider and entropyProvider must be functions');

  const binding = Object.freeze({
    homeRef: ref(homeRef, 'homeRef'),
    deviceRef: ref(deviceRef, 'deviceRef'),
    principalRef: ref(principalRef, 'principalRef'),
    ownerSourceReceiptRefs: refs(ownerSourceReceiptRefs, 'ownerSourceReceiptRefs')
  });
  const defaultTtl = safeTtl(defaultSessionTtlMs);
  const records = new Map();
  const consumedPossessionReceiptRefs = new Set();
  const currentTime = () => nowMs(nowProvider());

  function establish({ possessionReceipt: rawPossession, membership: rawMembership, currentRevocationGeneration, ttlMs = defaultTtl } = {}) {
    safeUint(currentRevocationGeneration, 'currentRevocationGeneration');
    const observedAt = currentTime();
    const membership = validateMembership(rawMembership, binding, currentRevocationGeneration);
    const possession = validatePossessionReceipt(rawPossession, membership, binding, observedAt, currentRevocationGeneration);
    if (consumedPossessionReceiptRefs.has(possession.receiptRef)) {
      fail('HOME_BRIDGE_REMOTE_SESSION_POSSESSION_REPLAYED', 'remote possession receipt was already consumed for session establishment');
    }
    const ttl = safeTtl(ttlMs);
    const expiresAtMs = Math.min(possession.expiresAtMs, observedAt + ttl);
    if (expiresAtMs <= observedAt) fail('HOME_BRIDGE_REMOTE_SESSION_POSSESSION_STALE', 'possession receipt expires before a session can be established');

    const stableSessionBindingRef = hashRef('session-binding.vexlife.home-bridge.remote', {
      homeRef: binding.homeRef,
      deviceRef: binding.deviceRef,
      principalRef: binding.principalRef,
      membershipRef: membership.membershipRef,
      membershipHash: membership.membershipHash,
      revocationGeneration: currentRevocationGeneration,
      possessionReceiptRef: possession.receiptRef
    });
    const sessionRef = sessionToken(entropyProvider);
    const currentnessRef = hashRef('currentness.vexlife.home-bridge-remote-authenticated-session', {
      stableSessionBindingRef,
      possessionReceiptRef: possession.receiptRef,
      observedAt,
      expiresAtMs
    });
    const sessionReceiptRef = hashRef('receipt.vexlife.home-bridge-remote-authenticated-session', {
      stableSessionBindingRef,
      possessionReceiptRef: possession.receiptRef,
      principalRef: binding.principalRef,
      deviceRef: binding.deviceRef,
      currentnessRef
    });
    const assertion = Object.freeze({
      schemaVersion: HOME_BRIDGE_AUTHENTICATED_SESSION_SCHEMA,
      state: 'AUTHENTICATED_CURRENT',
      stableSessionBindingRef,
      principalRef: binding.principalRef,
      deviceRef: binding.deviceRef
    });
    const sourceReceiptRefs = combineRefs(
      binding.ownerSourceReceiptRefs,
      possession.sourceRefs,
      [possession.receiptRef, membership.membershipRef, sessionReceiptRef]
    );
    const currentnessRefs = combineRefs(possession.currentnessRefs, [currentnessRef]);
    records.set(tokenDigest(sessionRef), {
      assertion,
      sourceReceiptRefs,
      currentnessRefs,
      expiresAtMs,
      revoked: false,
      sessionReceiptRef
    });
    consumedPossessionReceiptRefs.add(possession.receiptRef);

    const result = {
      state: 'REMOTE_AUTHENTICATED_SESSION_ESTABLISHED',
      stableSessionBindingRef,
      principalRef: binding.principalRef,
      deviceRef: binding.deviceRef,
      membershipRef: membership.membershipRef,
      possessionReceiptRef: possession.receiptRef,
      sessionReceiptRef,
      expiresAt: new Date(expiresAtMs).toISOString(),
      sourceReceiptRefs,
      currentnessRefs,
      effects: Object.freeze({
        authorizationGranted: false,
        capabilityLeaseGranted: false,
        deviceMembershipMutated: false,
        standingHomeAuthorityGranted: false,
        remoteHomeWriteGranted: false,
        homePayloadRead: false,
        networkMutation: false,
        modelInvocation: false
      })
    };
    Object.defineProperty(result, 'sessionRef', { value: sessionRef, enumerable: false, writable: false, configurable: false });
    return Object.freeze(result);
  }

  function resolve(input = {}) {
    exactKeys(input, SESSION_REQUEST_KEYS, 'session request');
    const sessionRef = ref(input.sessionRef, 'sessionRef');
    const digestRef = tokenDigest(sessionRef);
    const record = records.get(digestRef);
    if (!record) fail('HOME_BRIDGE_REMOTE_SESSION_UNKNOWN', 'session handle is not current in this owner');
    if (record.revoked) fail('HOME_BRIDGE_REMOTE_SESSION_REVOKED', 'session handle has been revoked');
    if (currentTime() >= record.expiresAtMs) {
      records.delete(digestRef);
      fail('HOME_BRIDGE_REMOTE_SESSION_EXPIRED', 'session handle has expired');
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
    if (Date.parse(revokedAt) > currentTime()) fail('HOME_BRIDGE_REMOTE_SESSION_INPUT_INVALID', 'revocation time may not be in the future');
    const record = records.get(tokenDigest(sessionRef));
    if (!record) fail('HOME_BRIDGE_REMOTE_SESSION_UNKNOWN', 'session handle is not current in this owner');
    record.revoked = true;
    return Object.freeze({
      state: 'REMOTE_AUTHENTICATED_SESSION_REVOKED',
      stableSessionBindingRef: record.assertion.stableSessionBindingRef,
      sessionReceiptRef: record.sessionReceiptRef,
      reasonRef: input.reasonRef,
      revokedAt,
      effects: Object.freeze({ authorizationGranted: false, capabilityLeaseGranted: false, standingHomeAuthorityGranted: false, remoteHomeWriteGranted: false })
    });
  }

  function status() {
    const observedAt = currentTime();
    let current = 0;
    for (const record of records.values()) if (!record.revoked && observedAt < record.expiresAtMs) current += 1;
    return Object.freeze({
      state: 'CURRENT',
      currentSessionCount: current,
      consumedPossessionReceiptCount: consumedPossessionReceiptRefs.size,
      homeRef: binding.homeRef,
      deviceRef: binding.deviceRef,
      principalRef: binding.principalRef
    });
  }

  return Object.freeze({ establish, resolve, revoke, status });
}

// [VXG RealForever]
