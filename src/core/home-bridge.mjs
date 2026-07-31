import { semanticHash } from './utils.mjs';

function nowMs(value = Date.now()) {
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error('invalid clock value');
  return parsed;
}

export function createPairingOffer({ pairingRef, homeNodeRef, homePublicKey, oneTimeNonceHash, humanFingerprint, requestedCapabilityRefs = [], expiresAt } = {}) {
  if (!pairingRef || !homeNodeRef || !homePublicKey || !oneTimeNonceHash || !humanFingerprint || !expiresAt) throw new Error('pairing offer missing required field');
  const offer = {
    schemaVersion: 'vexlife.bridge-pairing-offer/v0',
    pairingRef,
    homeNodeRef,
    homePublicKey,
    oneTimeNonceHash,
    humanFingerprint,
    requestedCapabilityRefs: [...new Set(requestedCapabilityRefs)].sort(),
    expiresAt,
    state: 'PAIRING_OFFERED',
    useCount: 0
  };
  return { ...offer, offerHash: semanticHash(offer) };
}

export function approvePairing({ offer, deviceRef, devicePublicKey, approvedCapabilityRefs = [], approvedBy, approvedAt, expectedFingerprint } = {}) {
  if (!offer || !deviceRef || !devicePublicKey || !approvedBy || !approvedAt) throw new Error('pairing approval missing required field');
  if (offer.state !== 'PAIRING_OFFERED' || Number(offer.useCount ?? 0) !== 0) return { state: 'PAIRING_REPLAY_REJECTED' };
  if (nowMs(approvedAt) >= nowMs(offer.expiresAt)) return { state: 'PAIRING_EXPIRED' };
  if (expectedFingerprint && expectedFingerprint !== offer.humanFingerprint) return { state: 'PAIRING_REJECTED', reason: 'FINGERPRINT_MISMATCH' };
  const requested = new Set(offer.requestedCapabilityRefs ?? []);
  const approved = [...new Set(approvedCapabilityRefs)].filter((ref) => requested.has(ref)).sort();
  const membership = {
    schemaVersion: 'vexlife.bridge-device-membership/v0',
    membershipRef: `membership.${deviceRef}.${semanticHash({ deviceRef, devicePublicKey, approvedAt }).slice(0, 12)}`,
    homeNodeRef: offer.homeNodeRef,
    deviceRef,
    devicePublicKey,
    capabilityRefs: approved,
    approvedBy,
    approvedAt,
    revocationGeneration: 0,
    state: 'ACTIVE'
  };
  return {
    state: 'PAIRED',
    consumedOffer: { ...offer, state: 'PAIRING_APPROVED', useCount: 1 },
    membership: { ...membership, membershipHash: semanticHash(membership) }
  };
}

export function issueCapabilityLease({ leaseRef, membership, requestedCapabilityRefs = [], projectRefs = [], issuedAt, expiresAt, revocationGeneration } = {}) {
  if (!leaseRef || !membership || !issuedAt || !expiresAt) throw new Error('lease missing required field');
  if (membership.state !== 'ACTIVE') throw new Error('membership is not active');
  if (nowMs(expiresAt) <= nowMs(issuedAt)) throw new Error('lease expiry must be after issue time');
  const membershipCaps = new Set(membership.capabilityRefs ?? []);
  const capabilityRefs = [...new Set(requestedCapabilityRefs)].filter((ref) => membershipCaps.has(ref)).sort();
  const lease = {
    schemaVersion: 'vexlife.bridge-capability-lease/v0',
    leaseRef,
    homeNodeRef: membership.homeNodeRef,
    deviceRef: membership.deviceRef,
    capabilityRefs,
    projectRefs: [...new Set(projectRefs)].sort(),
    issuedAt,
    expiresAt,
    revocationGeneration: revocationGeneration ?? membership.revocationGeneration,
    state: 'ACTIVE'
  };
  return { ...lease, leaseHash: semanticHash(lease) };
}

export function intersectCapabilityScopes(...scopes) {
  const defined = scopes.filter((scope) => Array.isArray(scope));
  if (!defined.length) return [];
  let result = new Set(defined[0]);
  for (const scope of defined.slice(1)) result = new Set([...result].filter((ref) => new Set(scope).has(ref)));
  return [...result].sort();
}

export function classifyActiveCompanion({ mode, remoteCompanionLineageRef = null, localSiblingLineageRef = null, remoteReachable = false } = {}) {
  if (!['REMOTE_HOME', 'LOCAL_SIBLING', 'HYBRID'].includes(mode)) throw new Error('unknown bridge mode');
  if (mode === 'REMOTE_HOME') return remoteReachable
    ? { state: 'REMOTE_HOME_ACTIVE', companionLineageRef: remoteCompanionLineageRef, substitutionOccurred: false }
    : { state: 'REMOTE_HOME_UNREACHABLE', companionLineageRef: remoteCompanionLineageRef, substitutionOccurred: false };
  if (mode === 'LOCAL_SIBLING') return { state: 'LOCAL_SIBLING_ACTIVE', companionLineageRef: localSiblingLineageRef, substitutionOccurred: false };
  return remoteReachable
    ? { state: 'REMOTE_HOME_ACTIVE', companionLineageRef: remoteCompanionLineageRef, substitutionOccurred: false }
    : { state: 'EXPLICIT_LOCAL_SIBLING_CHOICE_REQUIRED', companionLineageRef: localSiblingLineageRef, substitutionOccurred: false };
}

export function evaluateRemoteRequest({ request, membership, lease, now, currentRevocationGeneration, registeredActionRefs = [], requiredCapabilityRefs = [], roleCapabilityRefs = [], projectCapabilityRefs = [], resourceCapabilityRefs = [], rawModelEndpointExposed = false } = {}) {
  if (!request || !membership || !lease) return { state: 'CAPABILITY_DENIED', reason: 'MISSING_IDENTITY_OR_LEASE' };
  if (rawModelEndpointExposed) return { state: 'CAPABILITY_DENIED', reason: 'RAW_MODEL_ENDPOINT_EXPOSED' };
  if (membership.state !== 'ACTIVE' || membership.deviceRef !== request.deviceRef || membership.homeNodeRef !== lease.homeNodeRef) return { state: 'DEVICE_REVOKED' };
  if (Number(currentRevocationGeneration) !== Number(lease.revocationGeneration)) return { state: 'DEVICE_REVOKED' };
  if (lease.state !== 'ACTIVE' || nowMs(now) >= nowMs(lease.expiresAt)) return { state: 'LEASE_EXPIRED' };
  if (!registeredActionRefs.includes(request.actionRef)) return { state: 'CAPABILITY_DENIED', reason: 'UNREGISTERED_ACTION' };
  const effective = intersectCapabilityScopes(
    membership.capabilityRefs,
    lease.capabilityRefs,
    roleCapabilityRefs,
    projectCapabilityRefs,
    resourceCapabilityRefs
  );
  for (const required of requiredCapabilityRefs) if (!effective.includes(required)) return { state: 'CAPABILITY_DENIED', reason: `MISSING_${required}` };
  return {
    state: 'REMOTE_REQUEST_ADMITTED',
    effectiveCapabilityRefs: effective,
    canonicalWriter: 'DESKTOP_HOME_NODE',
    remoteWriterGranted: false,
    requestHash: semanticHash(request)
  };
}

export function revokeDevice({ membership, revokedAt, reason } = {}) {
  if (!membership) throw new Error('membership required');
  if (membership.state === 'REVOKED') return { state: 'DEVICE_ALREADY_REVOKED', membership };
  const next = {
    ...membership,
    state: 'REVOKED',
    revokedAt,
    revocationReason: reason,
    revocationGeneration: Number(membership.revocationGeneration ?? 0) + 1
  };
  return { state: 'DEVICE_REVOKED', membership: { ...next, membershipHash: semanticHash(next) } };
}

export function validateHomeBridgeRegistry(registry, { testRefs = new Set() } = {}) {
  const errors = [];
  if (!registry?.bridgeRef) errors.push('bridge registry missing bridgeRef');
  for (const mode of ['REMOTE_HOME', 'LOCAL_SIBLING', 'HYBRID']) if (!(registry?.modes ?? []).includes(mode)) errors.push(`bridge missing mode ${mode}`);
  for (const invariant of ['remote surface never becomes the Home writer', 'local sibling is a distinct lineage', 'model endpoint remains loopback/private behind the gateway']) if (!(registry?.invariants ?? []).includes(invariant)) errors.push(`bridge missing invariant: ${invariant}`);
  if (registry?.pairingContract?.replayAllowed !== false) errors.push('pairing replay must be false');
  if (registry?.leaseContract?.implicitAdmin !== false) errors.push('implicit admin must be false');
  for (const testRef of registry?.testRefs ?? []) if (!testRefs.has(testRef)) errors.push(`bridge references missing test ${testRef}`);
  return { ok: errors.length === 0, errors, stats: { modes: registry?.modes?.length ?? 0, transports: registry?.transportAdapters?.length ?? 0 } };
}

// [VXG RealForever]
