import {
  HOME_BRIDGE_SESSION_ASSERTION_SCHEMA,
  HOME_BRIDGE_SESSION_AUTHORITY_ACTION_REF,
  HOME_BRIDGE_SESSION_AUTHORITY_SCHEMA,
} from './home-bridge-session-authority.mjs';

export const ANDROID_R6_HOME_SESSION_STAGE = 'R6_HOME_SESSION_AUTHORITY_ADMISSION';
export const ANDROID_R6_HOME_BRIDGE_REF = 'bridge.vexlife.personal-home.001';
export const ANDROID_R6_READY_STATE = 'READY_FOR_PRIVATE_TRANSPORT';
export const ANDROID_R6_CANONICAL_WRITER = 'DESKTOP_HOME_NODE';
export const ANDROID_R6_ALLOWED_PRIVATE_TRANSPORT_REFS = Object.freeze([
  'transport.vexlife.tailscale',
  'transport.vexlife.wireguard',
]);
export const ANDROID_R6_OUTPUT_PATHS = Object.freeze([
  'platform/android/app/src/main/kotlin/vexlife/android/home/AndroidHomeSessionAuthorityContract.kt',
  'platform/android/app/src/test/kotlin/vexlife/android/app/R6HomeSessionAuthorityContractTest.kt',
]);

const REF = /^[A-Za-z0-9][A-Za-z0-9._:/#@+-]{0,511}$/u;
const AUTHORITY_KEYS = new Set([
  'schemaVersion',
  'state',
  'authorityReceiptRef',
  'stableSessionBindingRef',
  'principalRef',
  'deviceRef',
  'membership',
  'lease',
  'currentRevocationGeneration',
  'sourceReceiptRefs',
  'currentnessRefs',
  'effects',
]);
const EFFECT_KEYS = Object.freeze([
  'pairingMutation',
  'principalRebinding',
  'authenticationMutation',
  'authorizationMutation',
  'capabilityLeaseMutation',
  'revocationMutation',
  'HomePayloadReadOrWrite',
  'networkMutation',
  'MemoryMutation',
  'RelationshipsMutation',
  'modelRuntimeEffect',
  'training',
  'publication',
]);

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  object(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`R6A_${label.toUpperCase()}_FIELDS:${JSON.stringify({ actual, wanted })}`);
  }
}

function ref(value, label) {
  if (typeof value !== 'string' || !REF.test(value)) {
    throw new Error(`R6A_REF_INVALID:${label}`);
  }
  return value;
}

function refs(values, label) {
  if (!Array.isArray(values) || values.length === 0) throw new Error(`R6A_REFS_REQUIRED:${label}`);
  const normalized = values.map((value, index) => ref(value, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) throw new Error(`R6A_REFS_DUPLICATE:${label}`);
  return Object.freeze([...normalized]);
}

function generation(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`R6A_REVOCATION_GENERATION_INVALID:${label}`);
  return value;
}

function verifyOwnerEffects(effects) {
  object(effects, 'effects');
  const actual = Object.keys(effects).sort();
  const wanted = [...EFFECT_KEYS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`R6A_EFFECT_FIELDS:${JSON.stringify({ actual, wanted })}`);
  }
  for (const key of EFFECT_KEYS) {
    if (effects[key] !== false) throw new Error(`R6A_SOURCE_EFFECT_NOT_FALSE:${key}`);
  }
}

export function validateAndroidR6SourceBindings(homeBridgeRegistry) {
  object(homeBridgeRegistry, 'homeBridgeRegistry');
  if (homeBridgeRegistry.bridgeRef !== ANDROID_R6_HOME_BRIDGE_REF) throw new Error('R6A_HOME_BRIDGE_REF_DRIFT');
  const transports = new Map((homeBridgeRegistry.transportAdapters ?? []).map((entry) => [entry.transportRef, entry]));
  const tailscale = transports.get('transport.vexlife.tailscale');
  const wireguard = transports.get('transport.vexlife.wireguard');
  if (tailscale?.state !== 'RECOMMENDED_PERSONAL_ADAPTER' || wireguard?.state !== 'SUPPORTED_CONTRACT') {
    throw new Error('R6A_PRIVATE_TRANSPORT_BINDING_DRIFT');
  }
  if (!(homeBridgeRegistry.invariants ?? []).includes('remote surface never becomes the Home writer')) {
    throw new Error('R6A_HOME_WRITER_INVARIANT_DRIFT');
  }
  return Object.freeze({
    homeBridgeRef: ANDROID_R6_HOME_BRIDGE_REF,
    authoritySchemaVersion: HOME_BRIDGE_SESSION_AUTHORITY_SCHEMA,
    authenticatedSessionSchemaVersion: HOME_BRIDGE_SESSION_ASSERTION_SCHEMA,
    authorityActionRef: HOME_BRIDGE_SESSION_AUTHORITY_ACTION_REF,
    allowedPrivateTransportRefs: Object.freeze([...ANDROID_R6_ALLOWED_PRIVATE_TRANSPORT_REFS]),
    canonicalWriter: ANDROID_R6_CANONICAL_WRITER,
  });
}

export function projectAndroidR6HomeSessionAuthority(authority, { homeBridgeRegistry, privateTransportRef } = {}) {
  const bindings = validateAndroidR6SourceBindings(homeBridgeRegistry);
  exactKeys(authority, AUTHORITY_KEYS, 'authority');
  if (authority.schemaVersion !== HOME_BRIDGE_SESSION_AUTHORITY_SCHEMA) throw new Error('R6A_SOURCE_SCHEMA_MISMATCH');
  if (authority.state !== 'CURRENT') throw new Error(`R6A_AUTHORITY_NOT_CURRENT:${authority.state}`);
  const authorityReceiptRef = ref(authority.authorityReceiptRef, 'authorityReceiptRef');
  const stableSessionBindingRef = ref(authority.stableSessionBindingRef, 'stableSessionBindingRef');
  const principalRef = ref(authority.principalRef, 'principalRef');
  const deviceRef = ref(authority.deviceRef, 'deviceRef');
  const membership = object(authority.membership, 'membership');
  const lease = object(authority.lease, 'lease');
  const membershipRef = ref(membership.membershipRef, 'membership.membershipRef');
  const leaseRef = ref(lease.leaseRef, 'lease.leaseRef');
  if (membership.principalRef !== principalRef || lease.principalRef !== principalRef) throw new Error('R6A_PRINCIPAL_BINDING_MISMATCH');
  if (membership.deviceRef !== deviceRef || lease.deviceRef !== deviceRef) throw new Error('R6A_DEVICE_BINDING_MISMATCH');
  const currentRevocationGeneration = generation(authority.currentRevocationGeneration, 'current');
  if (generation(membership.revocationGeneration, 'membership') !== currentRevocationGeneration ||
      generation(lease.revocationGeneration, 'lease') !== currentRevocationGeneration) {
    throw new Error('R6A_REVOCATION_GENERATION_MISMATCH');
  }
  const sourceReceiptRefs = refs(authority.sourceReceiptRefs, 'sourceReceiptRefs');
  const currentnessRefs = refs(authority.currentnessRefs, 'currentnessRefs');
  verifyOwnerEffects(authority.effects);
  if (!ANDROID_R6_ALLOWED_PRIVATE_TRANSPORT_REFS.includes(privateTransportRef)) {
    throw new Error(`R6A_PRIVATE_TRANSPORT_NOT_ACCEPTED:${privateTransportRef ?? 'MISSING'}`);
  }
  ref(lease.expiresAt, 'lease.expiresAt');
  return Object.freeze({
    schemaVersion: 'vexlife.android-r6-home-session-projection/v1',
    stage: ANDROID_R6_HOME_SESSION_STAGE,
    state: ANDROID_R6_READY_STATE,
    homeBridgeRef: ANDROID_R6_HOME_BRIDGE_REF,
    sourceAuthoritySchemaVersion: bindings.authoritySchemaVersion,
    sourceAuthenticatedSessionSchemaVersion: bindings.authenticatedSessionSchemaVersion,
    sourceAuthorityActionRef: bindings.authorityActionRef,
    authorityReceiptRef,
    stableSessionBindingRef,
    principalRef,
    deviceRef,
    membershipRef,
    leaseRef,
    leaseExpiresAt: lease.expiresAt,
    currentRevocationGeneration,
    sourceReceiptRefs,
    currentnessRefs,
    privateTransportRef,
    canonicalWriter: bindings.canonicalWriter,
    remoteWriterGranted: false,
    effects: Object.freeze({
      pairingMutationPerformed: false,
      authenticationMutationPerformed: false,
      authorizationMutationPerformed: false,
      capabilityLeaseMutationPerformed: false,
      revocationMutationPerformed: false,
      networkConnectionPerformed: false,
      homePayloadReadOrWritePerformed: false,
      credentialEffectPerformed: false,
      modelRuntimeEffectPerformed: false,
      physicalDeviceEffectPerformed: false,
    }),
  });
}

function kotlinString(value) {
  return JSON.stringify(value);
}

function renderContract() {
  return `package vexlife.android.home\n\n` +
`data class AndroidHomeSessionAuthorityInput(\n` +
`    val schemaVersion: String,\n` +
`    val state: String,\n` +
`    val authorityReceiptRef: String,\n` +
`    val stableSessionBindingRef: String,\n` +
`    val principalRef: String,\n` +
`    val deviceRef: String,\n` +
`    val membershipRef: String,\n` +
`    val membershipPrincipalRef: String,\n` +
`    val membershipDeviceRef: String,\n` +
`    val membershipRevocationGeneration: Long,\n` +
`    val leaseRef: String,\n` +
`    val leasePrincipalRef: String,\n` +
`    val leaseDeviceRef: String,\n` +
`    val leaseRevocationGeneration: Long,\n` +
`    val leaseExpiresAt: String,\n` +
`    val currentRevocationGeneration: Long,\n` +
`    val sourceReceiptRefs: List<String>,\n` +
`    val currentnessRefs: List<String>,\n` +
`)\n\n` +
`data class AndroidHomeSessionReadyProjection(\n` +
`    val state: String,\n` +
`    val homeBridgeRef: String,\n` +
`    val authorityReceiptRef: String,\n` +
`    val stableSessionBindingRef: String,\n` +
`    val principalRef: String,\n` +
`    val deviceRef: String,\n` +
`    val membershipRef: String,\n` +
`    val leaseRef: String,\n` +
`    val leaseExpiresAt: String,\n` +
`    val currentRevocationGeneration: Long,\n` +
`    val sourceReceiptRefs: List<String>,\n` +
`    val currentnessRefs: List<String>,\n` +
`    val privateTransportRef: String,\n` +
`    val canonicalWriter: String,\n` +
`    val remoteWriterGranted: Boolean = false,\n` +
`    val pairingMutationPerformed: Boolean = false,\n` +
`    val authenticationMutationPerformed: Boolean = false,\n` +
`    val authorizationMutationPerformed: Boolean = false,\n` +
`    val capabilityLeaseMutationPerformed: Boolean = false,\n` +
`    val revocationMutationPerformed: Boolean = false,\n` +
`    val networkConnectionPerformed: Boolean = false,\n` +
`    val homePayloadReadOrWritePerformed: Boolean = false,\n` +
`    val credentialEffectPerformed: Boolean = false,\n` +
`    val modelRuntimeEffectPerformed: Boolean = false,\n` +
`    val physicalDeviceEffectPerformed: Boolean = false,\n` +
`)\n\n` +
`object AndroidHomeSessionAuthorityContract {\n` +
`    const val STAGE: String = ${kotlinString(ANDROID_R6_HOME_SESSION_STAGE)}\n` +
`    const val SOURCE_AUTHORITY_SCHEMA: String = ${kotlinString(HOME_BRIDGE_SESSION_AUTHORITY_SCHEMA)}\n` +
`    const val SOURCE_AUTHENTICATED_SESSION_SCHEMA: String = ${kotlinString(HOME_BRIDGE_SESSION_ASSERTION_SCHEMA)}\n` +
`    const val SOURCE_AUTHORITY_ACTION_REF: String = ${kotlinString(HOME_BRIDGE_SESSION_AUTHORITY_ACTION_REF)}\n` +
`    const val HOME_BRIDGE_REF: String = ${kotlinString(ANDROID_R6_HOME_BRIDGE_REF)}\n` +
`    const val READY_STATE: String = ${kotlinString(ANDROID_R6_READY_STATE)}\n` +
`    const val CANONICAL_WRITER: String = ${kotlinString(ANDROID_R6_CANONICAL_WRITER)}\n` +
`    val ALLOWED_PRIVATE_TRANSPORT_REFS: Set<String> = setOf(\n` +
`        "transport.vexlife.tailscale",\n` +
`        "transport.vexlife.wireguard",\n` +
`    )\n\n` +
`    fun admit(input: AndroidHomeSessionAuthorityInput, privateTransportRef: String): AndroidHomeSessionReadyProjection {\n` +
`        require(input.schemaVersion == SOURCE_AUTHORITY_SCHEMA) { "source authority schema mismatch" }\n` +
`        require(input.state == "CURRENT") { "source authority is not current" }\n` +
`        require(input.authorityReceiptRef.isNotBlank())\n` +
`        require(input.stableSessionBindingRef.isNotBlank())\n` +
`        require(input.principalRef.isNotBlank() && input.deviceRef.isNotBlank())\n` +
`        require(input.membershipRef.isNotBlank() && input.leaseRef.isNotBlank())\n` +
`        require(input.membershipPrincipalRef == input.principalRef && input.leasePrincipalRef == input.principalRef) { "principal binding mismatch" }\n` +
`        require(input.membershipDeviceRef == input.deviceRef && input.leaseDeviceRef == input.deviceRef) { "device binding mismatch" }\n` +
`        require(input.currentRevocationGeneration >= 0L)\n` +
`        require(input.membershipRevocationGeneration == input.currentRevocationGeneration) { "membership revocation generation mismatch" }\n` +
`        require(input.leaseRevocationGeneration == input.currentRevocationGeneration) { "lease revocation generation mismatch" }\n` +
`        require(input.leaseExpiresAt.isNotBlank())\n` +
`        require(input.sourceReceiptRefs.isNotEmpty() && input.sourceReceiptRefs.none(String::isBlank))\n` +
`        require(input.sourceReceiptRefs.distinct().size == input.sourceReceiptRefs.size) { "duplicate source receipt ref" }\n` +
`        require(input.currentnessRefs.isNotEmpty() && input.currentnessRefs.none(String::isBlank))\n` +
`        require(input.currentnessRefs.distinct().size == input.currentnessRefs.size) { "duplicate currentness ref" }\n` +
`        require(privateTransportRef in ALLOWED_PRIVATE_TRANSPORT_REFS) { "private transport is not accepted" }\n` +
`        return AndroidHomeSessionReadyProjection(\n` +
`            state = READY_STATE,\n` +
`            homeBridgeRef = HOME_BRIDGE_REF,\n` +
`            authorityReceiptRef = input.authorityReceiptRef,\n` +
`            stableSessionBindingRef = input.stableSessionBindingRef,\n` +
`            principalRef = input.principalRef,\n` +
`            deviceRef = input.deviceRef,\n` +
`            membershipRef = input.membershipRef,\n` +
`            leaseRef = input.leaseRef,\n` +
`            leaseExpiresAt = input.leaseExpiresAt,\n` +
`            currentRevocationGeneration = input.currentRevocationGeneration,\n` +
`            sourceReceiptRefs = input.sourceReceiptRefs.toList(),\n` +
`            currentnessRefs = input.currentnessRefs.toList(),\n` +
`            privateTransportRef = privateTransportRef,\n` +
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
`import vexlife.android.home.AndroidHomeSessionAuthorityContract\n` +
`import vexlife.android.home.AndroidHomeSessionAuthorityInput\n\n` +
`class R6HomeSessionAuthorityContractTest {\n` +
`    private fun input() = AndroidHomeSessionAuthorityInput(\n` +
`        schemaVersion = AndroidHomeSessionAuthorityContract.SOURCE_AUTHORITY_SCHEMA,\n` +
`        state = "CURRENT",\n` +
`        authorityReceiptRef = "authority-receipt.vexlife.r6.fixture",\n` +
`        stableSessionBindingRef = "session-binding.vexlife.r6.fixture",\n` +
`        principalRef = "person.victor-gong",\n` +
`        deviceRef = "device.android.r6.fixture",\n` +
`        membershipRef = "membership.vexlife.r6.fixture",\n` +
`        membershipPrincipalRef = "person.victor-gong",\n` +
`        membershipDeviceRef = "device.android.r6.fixture",\n` +
`        membershipRevocationGeneration = 4L,\n` +
`        leaseRef = "lease.vexlife.r6.fixture",\n` +
`        leasePrincipalRef = "person.victor-gong",\n` +
`        leaseDeviceRef = "device.android.r6.fixture",\n` +
`        leaseRevocationGeneration = 4L,\n` +
`        leaseExpiresAt = "2030-01-01T00:00:00.000Z",\n` +
`        currentRevocationGeneration = 4L,\n` +
`        sourceReceiptRefs = listOf("receipt.home-bridge.r6.fixture"),\n` +
`        currentnessRefs = listOf("currentness.home-bridge.r6.fixture"),\n` +
`    )\n\n` +
`    @Test fun currentOwnerAuthorityProjectsReadyWithoutPerformingEffects() {\n` +
`        val ready = AndroidHomeSessionAuthorityContract.admit(input(), "transport.vexlife.tailscale")\n` +
`        assertEquals("READY_FOR_PRIVATE_TRANSPORT", ready.state)\n` +
`        assertEquals("person.victor-gong", ready.principalRef)\n` +
`        assertEquals("device.android.r6.fixture", ready.deviceRef)\n` +
`        assertEquals("DESKTOP_HOME_NODE", ready.canonicalWriter)\n` +
`        assertFalse(ready.remoteWriterGranted)\n` +
`        assertFalse(ready.pairingMutationPerformed)\n` +
`        assertFalse(ready.authenticationMutationPerformed)\n` +
`        assertFalse(ready.authorizationMutationPerformed)\n` +
`        assertFalse(ready.capabilityLeaseMutationPerformed)\n` +
`        assertFalse(ready.revocationMutationPerformed)\n` +
`        assertFalse(ready.networkConnectionPerformed)\n` +
`        assertFalse(ready.homePayloadReadOrWritePerformed)\n` +
`        assertFalse(ready.credentialEffectPerformed)\n` +
`        assertFalse(ready.modelRuntimeEffectPerformed)\n` +
`        assertFalse(ready.physicalDeviceEffectPerformed)\n` +
`    }\n\n` +
`    @Test fun mismatchedPrincipalFailsClosed() {\n` +
`        assertThrows(IllegalArgumentException::class.java) {\n` +
`            AndroidHomeSessionAuthorityContract.admit(input().copy(leasePrincipalRef = "person.other"), "transport.vexlife.tailscale")\n` +
`        }\n` +
`    }\n\n` +
`    @Test fun unsupportedTransportFailsClosed() {\n` +
`        assertThrows(IllegalArgumentException::class.java) {\n` +
`            AndroidHomeSessionAuthorityContract.admit(input(), "transport.vexlife.loopback")\n` +
`        }\n` +
`    }\n\n` +
`    @Test fun duplicateCurrentnessEvidenceFailsClosed() {\n` +
`        assertThrows(IllegalArgumentException::class.java) {\n` +
`            AndroidHomeSessionAuthorityContract.admit(input().copy(currentnessRefs = listOf("same", "same")), "transport.vexlife.wireguard")\n` +
`        }\n` +
`    }\n` +
`}\n`;
}

export function renderAndroidR6Outputs({ homeBridgeRegistry } = {}) {
  const bindings = validateAndroidR6SourceBindings(homeBridgeRegistry);
  const files = Object.freeze({
    [ANDROID_R6_OUTPUT_PATHS[0]]: renderContract(),
    [ANDROID_R6_OUTPUT_PATHS[1]]: renderTest(),
  });
  return Object.freeze({
    stage: ANDROID_R6_HOME_SESSION_STAGE,
    files,
    bindings,
    effects: Object.freeze({
      pairingMutationPerformed: false,
      authenticationMutationPerformed: false,
      authorizationMutationPerformed: false,
      capabilityLeaseMutationPerformed: false,
      revocationMutationPerformed: false,
      networkConnectionPerformed: false,
      homePayloadReadOrWritePerformed: false,
      credentialEffectPerformed: false,
      modelRuntimeEffectPerformed: false,
      physicalDeviceEffectPerformed: false,
    }),
  });
}

// [VXG RealForever]
