export const ANDROID_R6B_STAGE = 'R6B_EFFECT_FREE_PRIVATE_TRANSPORT_CONSUMER_CONTRACT';
export const ANDROID_R6B_READY_STATE = 'READY_FOR_RUNTIME_PRIVATE_TRANSPORT_ADAPTER';
export const ANDROID_R6B_R6A_SCHEMA = 'vexlife.android-r6-home-session-projection/v1';
export const ANDROID_R6B_VEX_CORE_SCHEMA = 'vextreme.vex-core.home-session-authority/v1';
export const ANDROID_R6B_LOCALVEX_LIVED_SCHEMA = 'localvex.home-reachability-lived-state/v1';
export const ANDROID_R6B_SDK_CONNECTIVITY_SCHEMA = 'vextreme.patient0.p7.connectivity-projection/v1';
export const ANDROID_R6B_CANONICAL_WRITER = 'DESKTOP_HOME_NODE';
export const ANDROID_R6B_ALLOWED_PRIVATE_TRANSPORT_REFS = Object.freeze([
  'transport.vexlife.tailscale',
  'transport.vexlife.wireguard',
]);
export const ANDROID_R6B_OUTPUT_PATHS = Object.freeze([
  'platform/android/app/src/main/kotlin/vexlife/android/home/AndroidPrivateTransportConsumerContract.kt',
  'platform/android/app/src/test/kotlin/vexlife/android/app/R6BPrivateTransportConsumerContractTest.kt',
]);

const REF = /^[A-Za-z0-9][A-Za-z0-9._:/#@+-]{0,511}$/u;
const HEX64 = /^[0-9a-f]{64}$/u;
const FORBIDDEN_KEY = /(^|_)(endpoint|url|hostname|host|ip|address|port|ssid|secret|token|password|credential|privatekey|recoverykey|recoverysecret)($|_)/iu;
const FORBIDDEN_VALUE = Object.freeze([
  /(?:https?:\/\/|wss?:\/\/|file:\/\/)/iu,
  /(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[?::1\]?)(?::\d+)?/iu,
  /(?:\b(?:\d{1,3}\.){3}\d{1,3}\b)/u,
  /(?:[A-Za-z]:\\|\/(?:Users|home)\/)/u,
  /-----BEGIN [A-Z ]*(?:PRIVATE KEY|SECRET)-----/u,
]);

const EFFECT_KEYS = Object.freeze([
  'pairingMutationPerformed',
  'authenticationMutationPerformed',
  'authorizationMutationPerformed',
  'capabilityLeaseMutationPerformed',
  'revocationMutationPerformed',
  'networkConnectionPerformed',
  'endpointMaterializationPerformed',
  'homePayloadReadOrWritePerformed',
  'remoteHomeWritePerformed',
  'credentialEffectPerformed',
  'modelRuntimeEffectPerformed',
  'physicalDeviceEffectPerformed',
  'publicationPerformed',
]);

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}
function ref(value, label) {
  if (typeof value !== 'string' || !REF.test(value)) throw new Error(`R6B_REF_INVALID:${label}`);
  return value;
}
function hex64(value, label) {
  if (typeof value !== 'string' || !HEX64.test(value)) throw new Error(`R6B_DIGEST_INVALID:${label}`);
  return value;
}
function generation(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`R6B_GENERATION_INVALID:${label}`);
  return value;
}
function refs(values, label) {
  if (!Array.isArray(values) || values.length === 0) throw new Error(`R6B_REFS_REQUIRED:${label}`);
  const normalized = values.map((value, index) => ref(value, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) throw new Error(`R6B_REFS_DUPLICATE:${label}`);
  return [...normalized];
}
function unionRefs(...groups) {
  return Object.freeze([...new Set(groups.flat())].sort());
}
function allFalse(effects, label) {
  object(effects, label);
  for (const [key, value] of Object.entries(effects)) {
    if (value !== false) throw new Error(`R6B_SOURCE_EFFECT_NOT_FALSE:${label}.${key}`);
  }
  return true;
}
function falseEffects() {
  return Object.freeze(Object.fromEntries(EFFECT_KEYS.map((key) => [key, false])));
}
function scanForbidden(value, path = '$') {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (FORBIDDEN_VALUE.some((pattern) => pattern.test(value))) throw new Error(`R6B_FORBIDDEN_DURABLE_MATERIAL:${path}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbidden(item, `${path}[${index}]`));
    return;
  }
  object(value, path);
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key) && !['credentialEffectPerformed'].includes(key)) {
      throw new Error(`R6B_FORBIDDEN_DURABLE_FIELD:${path}.${key}`);
    }
    scanForbidden(child, `${path}.${key}`);
  }
}

function validateR6Session(r6) {
  object(r6, 'r6Session');
  if (r6.schemaVersion !== ANDROID_R6B_R6A_SCHEMA) throw new Error('R6B_R6A_SCHEMA_MISMATCH');
  if (r6.state !== 'READY_FOR_PRIVATE_TRANSPORT') throw new Error('R6B_R6A_NOT_READY');
  if (r6.canonicalWriter !== ANDROID_R6B_CANONICAL_WRITER || r6.remoteWriterGranted !== false) throw new Error('R6B_R6A_WRITER_BOUNDARY_DRIFT');
  if (!ANDROID_R6B_ALLOWED_PRIVATE_TRANSPORT_REFS.includes(r6.privateTransportRef)) throw new Error('R6B_PRIVATE_TRANSPORT_NOT_ACCEPTED');
  ref(r6.stableSessionBindingRef, 'r6Session.stableSessionBindingRef');
  ref(r6.principalRef, 'r6Session.principalRef');
  ref(r6.deviceRef, 'r6Session.deviceRef');
  ref(r6.membershipRef, 'r6Session.membershipRef');
  ref(r6.leaseRef, 'r6Session.leaseRef');
  generation(r6.currentRevocationGeneration, 'r6Session.currentRevocationGeneration');
  refs(r6.sourceReceiptRefs, 'r6Session.sourceReceiptRefs');
  refs(r6.currentnessRefs, 'r6Session.currentnessRefs');
  allFalse(r6.effects, 'r6Session.effects');
  return r6;
}

function validateVexCore(authority, r6) {
  object(authority, 'homeSessionAuthority');
  if (authority.schemaVersion !== ANDROID_R6B_VEX_CORE_SCHEMA || authority.state !== 'CURRENT') throw new Error('R6B_VEX_CORE_AUTHORITY_NOT_CURRENT');
  for (const key of ['stableSessionBindingRef','principalRef','deviceRef','homeRef']) ref(authority[key], `homeSessionAuthority.${key}`);
  generation(authority.currentRevocationGeneration, 'homeSessionAuthority.currentRevocationGeneration');
  if (authority.stableSessionBindingRef !== r6.stableSessionBindingRef ||
      authority.principalRef !== r6.principalRef ||
      authority.deviceRef !== r6.deviceRef ||
      authority.currentRevocationGeneration !== r6.currentRevocationGeneration) {
    throw new Error('R6B_SESSION_IDENTITY_MISMATCH');
  }
  const membership = object(authority.membership, 'homeSessionAuthority.membership');
  const lease = object(authority.lease, 'homeSessionAuthority.lease');
  if (membership.homeNodeRef !== authority.homeRef || lease.homeNodeRef !== authority.homeRef) throw new Error('R6B_HOME_IDENTITY_MISMATCH');
  if (membership.membershipRef !== r6.membershipRef || lease.leaseRef !== r6.leaseRef) throw new Error('R6B_MEMBERSHIP_LEASE_MISMATCH');
  if (membership.principalRef !== r6.principalRef || lease.principalRef !== r6.principalRef ||
      membership.deviceRef !== r6.deviceRef || lease.deviceRef !== r6.deviceRef) {
    throw new Error('R6B_PRINCIPAL_DEVICE_MISMATCH');
  }
  if (membership.revocationGeneration !== authority.currentRevocationGeneration ||
      lease.revocationGeneration !== authority.currentRevocationGeneration) {
    throw new Error('R6B_VEX_CORE_REVOCATION_MISMATCH');
  }
  refs(authority.sourceReceiptRefs, 'homeSessionAuthority.sourceReceiptRefs');
  refs(authority.currentnessRefs, 'homeSessionAuthority.currentnessRefs');
  allFalse(authority.effects, 'homeSessionAuthority.effects');
  return authority;
}

function validateReachability(reachability, authority) {
  object(reachability, 'reachability');
  if (reachability.schemaVersion !== ANDROID_R6B_LOCALVEX_LIVED_SCHEMA) throw new Error('R6B_REACHABILITY_SCHEMA_MISMATCH');
  if (reachability.sourceAddressable !== true ||
      reachability.cryptographicallyVerified !== true ||
      reachability.pointerAcceptanceVerified !== true) {
    throw new Error('R6B_REACHABILITY_NOT_VERIFIED');
  }
  for (const key of ['provesLiveReachability','authenticates','authorizes','grantsAuthority']) {
    if (reachability[key] !== false) throw new Error(`R6B_REACHABILITY_BOUNDARY_DRIFT:${key}`);
  }
  const current = object(reachability.current, 'reachability.current');
  const revision = object(reachability.revision, 'reachability.revision');
  const pointer = object(reachability.pointerCandidate, 'reachability.pointerCandidate');
  const signature = object(reachability.signatureReceipt, 'reachability.signatureReceipt');
  const acceptance = object(reachability.acceptanceReceipt, 'reachability.acceptanceReceipt');

  if (current.homeRef !== authority.homeRef || revision.homeRef !== authority.homeRef || pointer.homeRef !== authority.homeRef ||
      signature.homeRef !== authority.homeRef || acceptance.homeRef !== authority.homeRef) {
    throw new Error('R6B_REACHABILITY_HOME_MISMATCH');
  }
  if (current.revocationGeneration !== authority.currentRevocationGeneration ||
      revision.revocationGeneration !== authority.currentRevocationGeneration ||
      pointer.revocationGeneration !== authority.currentRevocationGeneration ||
      acceptance.revocationGeneration !== authority.currentRevocationGeneration) {
    throw new Error('R6B_REACHABILITY_REVOCATION_MISMATCH');
  }
  hex64(current.revisionDigest, 'current.revisionDigest');
  hex64(current.pointerDigest, 'current.pointerDigest');
  if (revision.revisionDigest !== current.revisionDigest || pointer.revisionDigest !== current.revisionDigest ||
      signature.revisionDigest !== current.revisionDigest || acceptance.revisionDigest !== current.revisionDigest) {
    throw new Error('R6B_REACHABILITY_REVISION_MISMATCH');
  }
  if (pointer.pointerDigest !== current.pointerDigest || acceptance.pointerDigest !== current.pointerDigest) {
    throw new Error('R6B_REACHABILITY_POINTER_MISMATCH');
  }
  if (revision.revisionGeneration !== current.revisionGeneration) throw new Error('R6B_REACHABILITY_REVISION_GENERATION_MISMATCH');
  if (pointer.pointerGeneration !== current.pointerGeneration || acceptance.pointerGeneration !== current.pointerGeneration) {
    throw new Error('R6B_REACHABILITY_POINTER_GENERATION_MISMATCH');
  }
  const route = object(revision.route, 'reachability.revision.route');
  const gateway = object(revision.gateway, 'reachability.revision.gateway');
  ref(route.routeRef, 'reachability.revision.route.routeRef');
  ref(gateway.gatewayRef, 'reachability.revision.gateway.gatewayRef');
  generation(route.generation, 'reachability.revision.route.generation');
  generation(gateway.generation, 'reachability.revision.gateway.generation');
  if (route.state !== 'REMOTE_CANDIDATE') throw new Error('R6B_REMOTE_ROUTE_NOT_READY');
  if (gateway.state !== 'READY') throw new Error('R6B_GATEWAY_NOT_READY');
  if (gateway.remoteCanonicalWrite !== false || gateway.rawModelEndpointIsGateway !== false) throw new Error('R6B_GATEWAY_BOUNDARY_DRIFT');

  if (signature.signatureReceiptRef !== current.signatureReceiptRef ||
      signature.signerFingerprintRef !== current.signerFingerprintRef ||
      signature.cryptographicVerificationPerformed !== true ||
      signature.provesLiveReachability !== false ||
      signature.grantsAuthority !== false) {
    throw new Error('R6B_SIGNATURE_CURRENTNESS_MISMATCH');
  }
  if (acceptance.acceptanceReceiptRef !== current.acceptanceReceiptRef ||
      acceptance.signerFingerprintRef !== current.signerFingerprintRef ||
      acceptance.cryptographicVerificationPerformed !== true ||
      acceptance.pointerAcceptancePerformed !== true ||
      acceptance.provesLiveReachability !== false ||
      acceptance.authenticates !== false ||
      acceptance.authorizes !== false ||
      acceptance.grantsAuthority !== false) {
    throw new Error('R6B_ACCEPTANCE_CURRENTNESS_MISMATCH');
  }
  return { current, revision, pointer, signature, acceptance, route, gateway };
}

function validateDiagnosis(connectivityProjection, authority) {
  if (connectivityProjection == null) return null;
  object(connectivityProjection, 'connectivityProjection');
  if (connectivityProjection.schemaVersion !== ANDROID_R6B_SDK_CONNECTIVITY_SCHEMA) throw new Error('R6B_CONNECTIVITY_SCHEMA_MISMATCH');
  if (connectivityProjection.homeRef !== authority.homeRef) throw new Error('R6B_CONNECTIVITY_HOME_MISMATCH');
  if (connectivityProjection.projectionClass !== 'REFERENCE_ONLY_NO_EFFECT') throw new Error('R6B_CONNECTIVITY_EFFECT_BOUNDARY_DRIFT');
  object(connectivityProjection.truth, 'connectivityProjection.truth');
  if (connectivityProjection.truth.provesReachability !== false ||
      connectivityProjection.truth.authenticatesUser !== false ||
      connectivityProjection.truth.grantsAuthorization !== false ||
      connectivityProjection.truth.substitutesSiblingHome !== false ||
      connectivityProjection.truth.exposesRawModelEndpoint !== false) {
    throw new Error('R6B_CONNECTIVITY_TRUTH_BOUNDARY_DRIFT');
  }
  allFalse(connectivityProjection.effects, 'connectivityProjection.effects');
  if (typeof connectivityProjection.projectionRef === 'string') ref(connectivityProjection.projectionRef, 'connectivityProjection.projectionRef');
  return connectivityProjection;
}

export function projectAndroidR6BPrivateTransportConsumer({
  r6Session,
  homeSessionAuthority,
  reachability,
  connectivityProjection = null,
} = {}) {
  const r6 = validateR6Session(r6Session);
  const authority = validateVexCore(homeSessionAuthority, r6);
  const accepted = validateReachability(reachability, authority);
  const diagnosis = validateDiagnosis(connectivityProjection, authority);
  const projection = {
    schemaVersion: 'vexlife.android-r6b-private-transport-consumer/v1',
    stage: ANDROID_R6B_STAGE,
    state: ANDROID_R6B_READY_STATE,
    homeRef: authority.homeRef,
    stableSessionBindingRef: authority.stableSessionBindingRef,
    principalRef: authority.principalRef,
    deviceRef: authority.deviceRef,
    membershipRef: r6.membershipRef,
    leaseRef: r6.leaseRef,
    currentRevocationGeneration: authority.currentRevocationGeneration,
    privateTransportRef: r6.privateTransportRef,
    routeRef: accepted.route.routeRef,
    routeGeneration: accepted.route.generation,
    gatewayRef: accepted.gateway.gatewayRef,
    gatewayGeneration: accepted.gateway.generation,
    revisionDigest: accepted.current.revisionDigest,
    revisionGeneration: accepted.current.revisionGeneration,
    pointerDigest: accepted.current.pointerDigest,
    pointerGeneration: accepted.current.pointerGeneration,
    signerFingerprintRef: accepted.current.signerFingerprintRef,
    signatureReceiptRef: accepted.current.signatureReceiptRef,
    acceptanceReceiptRef: accepted.current.acceptanceReceiptRef,
    diagnosisProjectionRefOrNull: diagnosis?.projectionRef ?? null,
    sourceReceiptRefs: unionRefs(r6.sourceReceiptRefs, authority.sourceReceiptRefs),
    currentnessRefs: unionRefs(r6.currentnessRefs, authority.currentnessRefs),
    canonicalWriter: ANDROID_R6B_CANONICAL_WRITER,
    remoteWriterGranted: false,
    provesLiveReachability: false,
    authenticates: false,
    authorizes: false,
    grantsAuthority: false,
    effects: falseEffects(),
  };
  scanForbidden(projection);
  return Object.freeze(projection);
}

function kotlinString(value) { return JSON.stringify(value); }

function renderContract() {
  return `package vexlife.android.home\n\n` +
`data class AndroidPrivateTransportConsumerInput(\n` +
`    val r6State: String,\n` +
`    val homeRef: String,\n` +
`    val stableSessionBindingRef: String,\n` +
`    val principalRef: String,\n` +
`    val deviceRef: String,\n` +
`    val membershipRef: String,\n` +
`    val leaseRef: String,\n` +
`    val r6RevocationGeneration: Long,\n` +
`    val authorityRevocationGeneration: Long,\n` +
`    val reachabilityRevocationGeneration: Long,\n` +
`    val privateTransportRef: String,\n` +
`    val canonicalWriter: String,\n` +
`    val remoteWriterGranted: Boolean,\n` +
`    val routeRef: String,\n` +
`    val routeState: String,\n` +
`    val routeGeneration: Long,\n` +
`    val gatewayRef: String,\n` +
`    val gatewayState: String,\n` +
`    val gatewayGeneration: Long,\n` +
`    val remoteCanonicalWrite: Boolean,\n` +
`    val rawModelEndpointIsGateway: Boolean,\n` +
`    val revisionDigest: String,\n` +
`    val revisionGeneration: Long,\n` +
`    val pointerDigest: String,\n` +
`    val pointerGeneration: Long,\n` +
`    val signatureReceiptRef: String,\n` +
`    val acceptanceReceiptRef: String,\n` +
`    val signerFingerprintRef: String,\n` +
`    val cryptographicallyVerified: Boolean,\n` +
`    val pointerAcceptanceVerified: Boolean,\n` +
`    val provesLiveReachability: Boolean,\n` +
`    val authenticates: Boolean,\n` +
`    val authorizes: Boolean,\n` +
`    val grantsAuthority: Boolean,\n` +
`)\n\n` +
`data class AndroidPrivateTransportReadyProjection(\n` +
`    val state: String,\n` +
`    val homeRef: String,\n` +
`    val stableSessionBindingRef: String,\n` +
`    val principalRef: String,\n` +
`    val deviceRef: String,\n` +
`    val membershipRef: String,\n` +
`    val leaseRef: String,\n` +
`    val currentRevocationGeneration: Long,\n` +
`    val privateTransportRef: String,\n` +
`    val routeRef: String,\n` +
`    val routeGeneration: Long,\n` +
`    val gatewayRef: String,\n` +
`    val gatewayGeneration: Long,\n` +
`    val revisionDigest: String,\n` +
`    val revisionGeneration: Long,\n` +
`    val pointerDigest: String,\n` +
`    val pointerGeneration: Long,\n` +
`    val signatureReceiptRef: String,\n` +
`    val acceptanceReceiptRef: String,\n` +
`    val signerFingerprintRef: String,\n` +
`    val canonicalWriter: String,\n` +
`    val remoteWriterGranted: Boolean = false,\n` +
`    val provesLiveReachability: Boolean = false,\n` +
`    val authenticates: Boolean = false,\n` +
`    val authorizes: Boolean = false,\n` +
`    val grantsAuthority: Boolean = false,\n` +
`    val networkConnectionPerformed: Boolean = false,\n` +
`    val endpointMaterializationPerformed: Boolean = false,\n` +
`    val homePayloadReadOrWritePerformed: Boolean = false,\n` +
`    val remoteHomeWritePerformed: Boolean = false,\n` +
`    val credentialEffectPerformed: Boolean = false,\n` +
`    val modelRuntimeEffectPerformed: Boolean = false,\n` +
`    val physicalDeviceEffectPerformed: Boolean = false,\n` +
`)\n\n` +
`object AndroidPrivateTransportConsumerContract {\n` +
`    const val STAGE: String = ${kotlinString(ANDROID_R6B_STAGE)}\n` +
`    const val R6_READY_STATE: String = "READY_FOR_PRIVATE_TRANSPORT"\n` +
`    const val READY_STATE: String = ${kotlinString(ANDROID_R6B_READY_STATE)}\n` +
`    const val CANONICAL_WRITER: String = ${kotlinString(ANDROID_R6B_CANONICAL_WRITER)}\n` +
`    val ALLOWED_PRIVATE_TRANSPORT_REFS: Set<String> = setOf(\n` +
`        "transport.vexlife.tailscale",\n` +
`        "transport.vexlife.wireguard",\n` +
`    )\n\n` +
`    fun admit(input: AndroidPrivateTransportConsumerInput): AndroidPrivateTransportReadyProjection {\n` +
`        require(input.r6State == R6_READY_STATE) { "R6 session is not ready for private transport" }\n` +
`        require(input.homeRef.isNotBlank() && input.stableSessionBindingRef.isNotBlank())\n` +
`        require(input.principalRef.isNotBlank() && input.deviceRef.isNotBlank())\n` +
`        require(input.membershipRef.isNotBlank() && input.leaseRef.isNotBlank())\n` +
`        require(input.privateTransportRef in ALLOWED_PRIVATE_TRANSPORT_REFS) { "private transport is not accepted" }\n` +
`        require(input.canonicalWriter == CANONICAL_WRITER && !input.remoteWriterGranted) { "Home writer boundary drift" }\n` +
`        require(input.r6RevocationGeneration >= 0L)\n` +
`        require(input.r6RevocationGeneration == input.authorityRevocationGeneration) { "authority revocation generation mismatch" }\n` +
`        require(input.r6RevocationGeneration == input.reachabilityRevocationGeneration) { "reachability revocation generation mismatch" }\n` +
`        require(input.routeRef.startsWith("route.") && input.routeState == "REMOTE_CANDIDATE") { "remote route is not ready" }\n` +
`        require(input.gatewayRef.startsWith("gateway.") && input.gatewayState == "READY") { "gateway is not ready" }\n` +
`        require(input.routeGeneration >= 0L && input.gatewayGeneration >= 0L)\n` +
`        require(!input.remoteCanonicalWrite && !input.rawModelEndpointIsGateway) { "gateway boundary drift" }\n` +
`        require(input.revisionDigest.matches(Regex("[0-9a-f]{64}")) && input.pointerDigest.matches(Regex("[0-9a-f]{64}")))\n` +
`        require(input.revisionGeneration >= 1L && input.pointerGeneration >= 1L)\n` +
`        require(input.signatureReceiptRef.isNotBlank() && input.acceptanceReceiptRef.isNotBlank() && input.signerFingerprintRef.isNotBlank())\n` +
`        require(input.cryptographicallyVerified && input.pointerAcceptanceVerified) { "reachability state is not cryptographically accepted" }\n` +
`        require(!input.provesLiveReachability && !input.authenticates && !input.authorizes && !input.grantsAuthority) { "source boundary drift" }\n` +
`        return AndroidPrivateTransportReadyProjection(\n` +
`            state = READY_STATE,\n` +
`            homeRef = input.homeRef,\n` +
`            stableSessionBindingRef = input.stableSessionBindingRef,\n` +
`            principalRef = input.principalRef,\n` +
`            deviceRef = input.deviceRef,\n` +
`            membershipRef = input.membershipRef,\n` +
`            leaseRef = input.leaseRef,\n` +
`            currentRevocationGeneration = input.r6RevocationGeneration,\n` +
`            privateTransportRef = input.privateTransportRef,\n` +
`            routeRef = input.routeRef,\n` +
`            routeGeneration = input.routeGeneration,\n` +
`            gatewayRef = input.gatewayRef,\n` +
`            gatewayGeneration = input.gatewayGeneration,\n` +
`            revisionDigest = input.revisionDigest,\n` +
`            revisionGeneration = input.revisionGeneration,\n` +
`            pointerDigest = input.pointerDigest,\n` +
`            pointerGeneration = input.pointerGeneration,\n` +
`            signatureReceiptRef = input.signatureReceiptRef,\n` +
`            acceptanceReceiptRef = input.acceptanceReceiptRef,\n` +
`            signerFingerprintRef = input.signerFingerprintRef,\n` +
`            canonicalWriter = CANONICAL_WRITER,\n` +
`        )\n` +
`    }\n` +
`}\n`;
}

function renderTest() {
  return `package vexlife.android.app\n\n` +
`import org.junit.Assert.assertEquals\n` +
`import org.junit.Assert.assertFalse\n` +
`import org.junit.Assert.assertThrows\n` +
`import org.junit.Test\n` +
`import vexlife.android.home.AndroidPrivateTransportConsumerContract\n` +
`import vexlife.android.home.AndroidPrivateTransportConsumerInput\n\n` +
`class R6BPrivateTransportConsumerContractTest {\n` +
`    private fun input() = AndroidPrivateTransportConsumerInput(\n` +
`        r6State = "READY_FOR_PRIVATE_TRANSPORT",\n` +
`        homeRef = "home.vex.fixture",\n` +
`        stableSessionBindingRef = "session-binding.vexlife.r6b.fixture",\n` +
`        principalRef = "person.victor-gong",\n` +
`        deviceRef = "device.android.r6b.fixture",\n` +
`        membershipRef = "membership.vexlife.r6b.fixture",\n` +
`        leaseRef = "lease.vexlife.r6b.fixture",\n` +
`        r6RevocationGeneration = 9L,\n` +
`        authorityRevocationGeneration = 9L,\n` +
`        reachabilityRevocationGeneration = 9L,\n` +
`        privateTransportRef = "transport.vexlife.tailscale",\n` +
`        canonicalWriter = "DESKTOP_HOME_NODE",\n` +
`        remoteWriterGranted = false,\n` +
`        routeRef = "route.vex.fixture",\n` +
`        routeState = "REMOTE_CANDIDATE",\n` +
`        routeGeneration = 4L,\n` +
`        gatewayRef = "gateway.vex.fixture",\n` +
`        gatewayState = "READY",\n` +
`        gatewayGeneration = 3L,\n` +
`        remoteCanonicalWrite = false,\n` +
`        rawModelEndpointIsGateway = false,\n` +
`        revisionDigest = "${'a'.repeat(64)}",\n` +
`        revisionGeneration = 6L,\n` +
`        pointerDigest = "${'b'.repeat(64)}",\n` +
`        pointerGeneration = 7L,\n` +
`        signatureReceiptRef = "receipt.signature.r6b.fixture",\n` +
`        acceptanceReceiptRef = "receipt.acceptance.r6b.fixture",\n` +
`        signerFingerprintRef = "signer-fingerprint.ed25519.r6bfixture",\n` +
`        cryptographicallyVerified = true,\n` +
`        pointerAcceptanceVerified = true,\n` +
`        provesLiveReachability = false,\n` +
`        authenticates = false,\n` +
`        authorizes = false,\n` +
`        grantsAuthority = false,\n` +
`    )\n\n` +
`    @Test fun acceptedOpaqueOwnerStateProjectsAdapterReadinessWithoutEffects() {\n` +
`        val ready = AndroidPrivateTransportConsumerContract.admit(input())\n` +
`        assertEquals("READY_FOR_RUNTIME_PRIVATE_TRANSPORT_ADAPTER", ready.state)\n` +
`        assertEquals("home.vex.fixture", ready.homeRef)\n` +
`        assertEquals("route.vex.fixture", ready.routeRef)\n` +
`        assertEquals("gateway.vex.fixture", ready.gatewayRef)\n` +
`        assertEquals("DESKTOP_HOME_NODE", ready.canonicalWriter)\n` +
`        assertFalse(ready.remoteWriterGranted)\n` +
`        assertFalse(ready.provesLiveReachability)\n` +
`        assertFalse(ready.networkConnectionPerformed)\n` +
`        assertFalse(ready.endpointMaterializationPerformed)\n` +
`        assertFalse(ready.homePayloadReadOrWritePerformed)\n` +
`        assertFalse(ready.remoteHomeWritePerformed)\n` +
`        assertFalse(ready.credentialEffectPerformed)\n` +
`        assertFalse(ready.modelRuntimeEffectPerformed)\n` +
`        assertFalse(ready.physicalDeviceEffectPerformed)\n` +
`    }\n\n` +
`    @Test fun staleRevocationFailsClosed() {\n` +
`        assertThrows(IllegalArgumentException::class.java) { AndroidPrivateTransportConsumerContract.admit(input().copy(reachabilityRevocationGeneration = 8L)) }\n` +
`    }\n\n` +
`    @Test fun unavailableGatewayFailsClosed() {\n` +
`        assertThrows(IllegalArgumentException::class.java) { AndroidPrivateTransportConsumerContract.admit(input().copy(gatewayState = "UNAVAILABLE")) }\n` +
`    }\n\n` +
`    @Test fun unverifiedAcceptedPointerFailsClosed() {\n` +
`        assertThrows(IllegalArgumentException::class.java) { AndroidPrivateTransportConsumerContract.admit(input().copy(pointerAcceptanceVerified = false)) }\n` +
`    }\n\n` +
`    @Test fun unsupportedTransportFailsClosed() {\n` +
`        assertThrows(IllegalArgumentException::class.java) { AndroidPrivateTransportConsumerContract.admit(input().copy(privateTransportRef = "transport.vexlife.loopback")) }\n` +
`    }\n` +
`}\n`;
}

export function renderAndroidR6BOutputs() {
  const files = Object.freeze({
    [ANDROID_R6B_OUTPUT_PATHS[0]]: renderContract(),
    [ANDROID_R6B_OUTPUT_PATHS[1]]: renderTest(),
  });
  return Object.freeze({
    stage: ANDROID_R6B_STAGE,
    files,
    effects: falseEffects(),
  });
}

// [VXG RealForever]
