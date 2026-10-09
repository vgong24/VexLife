import crypto from 'node:crypto';

export const ANDROID_R8_STAGE = 'R8_OS_BACKED_DEVICE_POSSESSION';
export const ANDROID_R8_SIGNING_PAYLOAD_SCHEMA = 'vextreme.security.home-device-possession-signing-payload/v1';
export const ANDROID_R8_SIGNATURE_ALGORITHM_REF = 'signature.vextreme.ecdsa-p256-sha256';
export const ANDROID_R8_KEY_PROFILE = Object.freeze({
  provider: 'AndroidKeyStore',
  credentialClass: 'OS_BACKED_DEVICE_SIGNING_KEY',
  keyAlgorithm: 'EC',
  curve: 'secp256r1',
  keyPurpose: 'SIGN',
  digest: 'SHA-256',
  signatureAlgorithm: 'SHA256withECDSA',
  signatureAlgorithmRef: ANDROID_R8_SIGNATURE_ALGORITHM_REF,
  publicKeyEncoding: 'X509_SPKI_DER_BASE64URL',
  privateKeyExportable: false,
});
export const ANDROID_R8_OUTPUT_PATHS = Object.freeze([
  'platform/android/app/src/main/kotlin/vexlife/android/security/AndroidHomeDevicePossessionKey.kt',
  'platform/android/app/src/test/kotlin/vexlife/android/app/R8DevicePossessionKeyTest.kt',
]);

const SIGNING_PAYLOAD_KEYS = Object.freeze([
  'schemaVersion',
  'challengeRef',
  'homeRef',
  'principalRef',
  'deviceRef',
  'membershipRef',
  'membershipHash',
  'revocationGeneration',
  'devicePublicKeyFingerprintRef',
  'nonceBase64Url',
  'issuedAtMs',
  'expiresAtMs',
]);
const REF = /^[A-Za-z0-9][A-Za-z0-9._:/#@+-]{0,511}$/u;
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const FINGERPRINT_REF = /^fingerprint\.sha256\.[0-9a-f]{64}$/u;
const BASE64URL = /^[A-Za-z0-9_-]{8,512}$/u;
const FORBIDDEN_FIELD = /(private.?key|secret|password|token|credentialvalue|endpoint|hostname|ipaddress|url|uri|port)/iu;

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}
function exactKeys(value, keys, label) {
  object(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`R8_${label.toUpperCase()}_FIELDS:${JSON.stringify({ actual, expected })}`);
}
function ref(value, label) {
  if (typeof value !== 'string' || !REF.test(value)) throw new Error(`R8_REF_INVALID:${label}`);
  return value;
}
function timestamp(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`R8_TIMESTAMP_INVALID:${label}`);
  return value;
}
function generation(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('R8_REVOCATION_GENERATION_INVALID');
  return value;
}
function scanForbidden(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanForbidden(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_FIELD.test(key)) throw new Error(`R8_FORBIDDEN_FIELD:${path}.${key}`);
    scanForbidden(entry, `${path}.${key}`);
  }
}

export function validateAndroidR8DevicePossessionProfile(profile = ANDROID_R8_KEY_PROFILE) {
  exactKeys(profile, Object.keys(ANDROID_R8_KEY_PROFILE), 'profile');
  for (const [key, expected] of Object.entries(ANDROID_R8_KEY_PROFILE)) {
    if (profile[key] !== expected) throw new Error(`R8_PROFILE_DRIFT:${key}`);
  }
  return Object.freeze({ ...profile });
}

export function normalizeAndroidR8SigningPayload(payload) {
  exactKeys(payload, SIGNING_PAYLOAD_KEYS, 'signing_payload');
  if (payload.schemaVersion !== ANDROID_R8_SIGNING_PAYLOAD_SCHEMA) throw new Error('R8_SIGNING_PAYLOAD_SCHEMA_MISMATCH');
  const normalized = {
    schemaVersion: payload.schemaVersion,
    challengeRef: ref(payload.challengeRef, 'challengeRef'),
    homeRef: ref(payload.homeRef, 'homeRef'),
    principalRef: ref(payload.principalRef, 'principalRef'),
    deviceRef: ref(payload.deviceRef, 'deviceRef'),
    membershipRef: ref(payload.membershipRef, 'membershipRef'),
    membershipHash: payload.membershipHash,
    revocationGeneration: generation(payload.revocationGeneration),
    devicePublicKeyFingerprintRef: payload.devicePublicKeyFingerprintRef,
    nonceBase64Url: payload.nonceBase64Url,
    issuedAtMs: timestamp(payload.issuedAtMs, 'issuedAtMs'),
    expiresAtMs: timestamp(payload.expiresAtMs, 'expiresAtMs'),
  };
  if (!SHA256_HEX.test(normalized.membershipHash)) throw new Error('R8_MEMBERSHIP_HASH_INVALID');
  if (!FINGERPRINT_REF.test(normalized.devicePublicKeyFingerprintRef)) throw new Error('R8_PUBLIC_KEY_FINGERPRINT_REF_INVALID');
  if (!BASE64URL.test(normalized.nonceBase64Url)) throw new Error('R8_NONCE_BASE64URL_INVALID');
  if (normalized.expiresAtMs <= normalized.issuedAtMs) throw new Error('R8_SIGNING_PAYLOAD_EXPIRY_INVALID');
  return Object.freeze(normalized);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function canonicalAndroidR8SigningBytes(payload) {
  const normalized = normalizeAndroidR8SigningPayload(payload);
  return Buffer.from(`${JSON.stringify(canonicalize(normalized))}\n`, 'utf8');
}

export function androidR8SigningPayloadSha256(payload) {
  return crypto.createHash('sha256').update(canonicalAndroidR8SigningBytes(payload)).digest('hex');
}

function falseEffects() {
  return Object.freeze({
    realKeyGenerationPerformed: false,
    realSignaturePerformed: false,
    privateKeyExportPerformed: false,
    pairingMutationPerformed: false,
    membershipMutationPerformed: false,
    authenticationMutationPerformed: false,
    authorizationMutationPerformed: false,
    capabilityLeaseMutationPerformed: false,
    networkEffectPerformed: false,
    homePayloadReadOrWritePerformed: false,
    cameraEffectPerformed: false,
    modelRuntimeEffectPerformed: false,
    physicalDeviceEffectPerformed: false,
  });
}

function kotlinString(value) { return JSON.stringify(value); }

function renderContract() {
  const profile = validateAndroidR8DevicePossessionProfile();
  return `package vexlife.android.security\n\n` +
`import android.security.keystore.KeyGenParameterSpec\n` +
`import android.security.keystore.KeyProperties\n` +
`import android.util.Base64\n` +
`import java.security.KeyPairGenerator\n` +
`import java.security.KeyStore\n` +
`import java.security.MessageDigest\n` +
`import java.security.PrivateKey\n` +
`import java.security.Signature\n` +
`import java.security.spec.ECGenParameterSpec\n\n` +
`data class HomeDevicePossessionSigningPayload(\n` +
`    val schemaVersion: String,\n` +
`    val challengeRef: String,\n` +
`    val homeRef: String,\n` +
`    val principalRef: String,\n` +
`    val deviceRef: String,\n` +
`    val membershipRef: String,\n` +
`    val membershipHash: String,\n` +
`    val revocationGeneration: Long,\n` +
`    val devicePublicKeyFingerprintRef: String,\n` +
`    val nonceBase64Url: String,\n` +
`    val issuedAtMs: Long,\n` +
`    val expiresAtMs: Long,\n` +
`)\n\n` +
`data class DevicePossessionKeyDescriptor(\n` +
`    val keyRef: String,\n` +
`    val provider: String,\n` +
`    val credentialClass: String,\n` +
`    val signatureAlgorithmRef: String,\n` +
`    val publicKeyEncoding: String,\n` +
`    val publicKeyBase64Url: String,\n` +
`    val devicePublicKeyFingerprintRef: String,\n` +
`    val privateKeyExportable: Boolean = false,\n` +
`)\n\n` +
`interface DevicePossessionKeyProvider {\n` +
`    fun ensureCurrentKey(): DevicePossessionKeyDescriptor\n` +
`    fun publicDescriptor(): DevicePossessionKeyDescriptor\n` +
`    fun signCanonicalChallenge(bytes: ByteArray): ByteArray\n` +
`}\n\n` +
`object AndroidHomeDevicePossessionProfile {\n` +
`    const val STAGE: String = ${kotlinString(ANDROID_R8_STAGE)}\n` +
`    const val SIGNING_PAYLOAD_SCHEMA: String = ${kotlinString(ANDROID_R8_SIGNING_PAYLOAD_SCHEMA)}\n` +
`    const val PROVIDER: String = ${kotlinString(profile.provider)}\n` +
`    const val CREDENTIAL_CLASS: String = ${kotlinString(profile.credentialClass)}\n` +
`    const val KEY_ALGORITHM: String = ${kotlinString(profile.keyAlgorithm)}\n` +
`    const val CURVE: String = ${kotlinString(profile.curve)}\n` +
`    const val DIGEST: String = ${kotlinString(profile.digest)}\n` +
`    const val SIGNATURE_ALGORITHM: String = ${kotlinString(profile.signatureAlgorithm)}\n` +
`    const val SIGNATURE_ALGORITHM_REF: String = ${kotlinString(profile.signatureAlgorithmRef)}\n` +
`    const val PUBLIC_KEY_ENCODING: String = ${kotlinString(profile.publicKeyEncoding)}\n` +
`    const val DEFAULT_ALIAS: String = "vexlife.home.device-possession.v1"\n` +
`    private val REF = Regex("[A-Za-z0-9][A-Za-z0-9._:/#@+\\\\-]{0,511}")\n` +
`    private val SHA256_HEX = Regex("[0-9a-f]{64}")\n` +
`    private val FINGERPRINT_REF = Regex("fingerprint\\\\.sha256\\\\.[0-9a-f]{64}")\n` +
`    private val BASE64URL = Regex("[A-Za-z0-9_-]{8,512}")\n\n` +
`    private fun jsonString(value: String): String = buildString {\n` +
`        append('"')\n` +
`        for (character in value) {\n` +
`            when (character) {\n` +
`                '"' -> append("\\\\\\\"")\n` +
`                '\\\\' -> append("\\\\\\\\")\n` +
`                '\\b' -> append("\\\\b")\n` +
`                '\\u000C' -> append("\\\\f")\n` +
`                '\\n' -> append("\\\\n")\n` +
`                '\\r' -> append("\\\\r")\n` +
`                '\\t' -> append("\\\\t")\n` +
`                else -> if (character.code < 0x20) {\n` +
`                    append("\\\\u")\n` +
`                    append(character.code.toString(16).padStart(4, '0'))\n` +
`                } else append(character)\n` +
`            }\n` +
`        }\n` +
`        append('"')\n` +
`    }\n\n` +
`    private fun validate(payload: HomeDevicePossessionSigningPayload) {\n` +
`        require(payload.schemaVersion == SIGNING_PAYLOAD_SCHEMA) { "signing payload schema mismatch" }\n` +
`        require(payload.challengeRef.matches(REF))\n` +
`        require(payload.homeRef.matches(REF))\n` +
`        require(payload.principalRef.matches(REF))\n` +
`        require(payload.deviceRef.matches(REF))\n` +
`        require(payload.membershipRef.matches(REF))\n` +
`        require(payload.membershipHash.matches(SHA256_HEX))\n` +
`        require(payload.revocationGeneration >= 0L)\n` +
`        require(payload.devicePublicKeyFingerprintRef.matches(FINGERPRINT_REF))\n` +
`        require(payload.nonceBase64Url.matches(BASE64URL))\n` +
`        require(payload.issuedAtMs > 0L && payload.expiresAtMs > payload.issuedAtMs)\n` +
`    }\n\n` +
`    fun canonicalSigningBytes(payload: HomeDevicePossessionSigningPayload): ByteArray {\n` +
`        validate(payload)\n` +
`        val json = "{" +\n` +
`            "\\\"challengeRef\\\":" + jsonString(payload.challengeRef) + "," +\n` +
`            "\\\"devicePublicKeyFingerprintRef\\\":" + jsonString(payload.devicePublicKeyFingerprintRef) + "," +\n` +
`            "\\\"deviceRef\\\":" + jsonString(payload.deviceRef) + "," +\n` +
`            "\\\"expiresAtMs\\\":" + payload.expiresAtMs + "," +\n` +
`            "\\\"homeRef\\\":" + jsonString(payload.homeRef) + "," +\n` +
`            "\\\"issuedAtMs\\\":" + payload.issuedAtMs + "," +\n` +
`            "\\\"membershipHash\\\":" + jsonString(payload.membershipHash) + "," +\n` +
`            "\\\"membershipRef\\\":" + jsonString(payload.membershipRef) + "," +\n` +
`            "\\\"nonceBase64Url\\\":" + jsonString(payload.nonceBase64Url) + "," +\n` +
`            "\\\"principalRef\\\":" + jsonString(payload.principalRef) + "," +\n` +
`            "\\\"revocationGeneration\\\":" + payload.revocationGeneration + "," +\n` +
`            "\\\"schemaVersion\\\":" + jsonString(payload.schemaVersion) +\n` +
`            "}\\n"\n` +
`        return json.toByteArray(Charsets.UTF_8)\n` +
`    }\n\n` +
`    fun signingPayloadSha256(payload: HomeDevicePossessionSigningPayload): String =\n` +
`        sha256Hex(canonicalSigningBytes(payload))\n\n` +
`    fun fingerprintRef(spkiDer: ByteArray): String {\n` +
`        require(spkiDer.isNotEmpty())\n` +
`        return "fingerprint.sha256." + sha256Hex(spkiDer)\n` +
`    }\n\n` +
`    fun keyRef(alias: String): String {\n` +
`        require(alias.isNotBlank())\n` +
`        return "key.android-keystore." + sha256Hex(alias.toByteArray(Charsets.UTF_8))\n` +
`    }\n\n` +
`    fun encodeSpkiBase64Url(spkiDer: ByteArray): String =\n` +
`        Base64.encodeToString(spkiDer, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)\n\n` +
`    private fun sha256Hex(bytes: ByteArray): String =\n` +
`        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 0xff) }\n` +
`}\n\n` +
`class AndroidKeystoreDevicePossessionKeyProvider(\n` +
`    private val alias: String = AndroidHomeDevicePossessionProfile.DEFAULT_ALIAS,\n` +
`) : DevicePossessionKeyProvider {\n` +
`    private fun keyStore(): KeyStore = KeyStore.getInstance(AndroidHomeDevicePossessionProfile.PROVIDER).apply { load(null) }\n\n` +
`    override fun ensureCurrentKey(): DevicePossessionKeyDescriptor {\n` +
`        val store = keyStore()\n` +
`        if (!store.containsAlias(alias)) {\n` +
`            val generator = KeyPairGenerator.getInstance(\n` +
`                AndroidHomeDevicePossessionProfile.KEY_ALGORITHM,\n` +
`                AndroidHomeDevicePossessionProfile.PROVIDER,\n` +
`            )\n` +
`            val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)\n` +
`                .setAlgorithmParameterSpec(ECGenParameterSpec(AndroidHomeDevicePossessionProfile.CURVE))\n` +
`                .setDigests(KeyProperties.DIGEST_SHA256)\n` +
`                .build()\n` +
`            generator.initialize(spec)\n` +
`            generator.generateKeyPair()\n` +
`        }\n` +
`        return publicDescriptor()\n` +
`    }\n\n` +
`    override fun publicDescriptor(): DevicePossessionKeyDescriptor {\n` +
`        val certificate = keyStore().getCertificate(alias) ?: error("AndroidKeyStore device-possession key is absent")\n` +
`        val spki = certificate.publicKey.encoded ?: error("AndroidKeyStore public key encoding unavailable")\n` +
`        return DevicePossessionKeyDescriptor(\n` +
`            keyRef = AndroidHomeDevicePossessionProfile.keyRef(alias),\n` +
`            provider = AndroidHomeDevicePossessionProfile.PROVIDER,\n` +
`            credentialClass = AndroidHomeDevicePossessionProfile.CREDENTIAL_CLASS,\n` +
`            signatureAlgorithmRef = AndroidHomeDevicePossessionProfile.SIGNATURE_ALGORITHM_REF,\n` +
`            publicKeyEncoding = AndroidHomeDevicePossessionProfile.PUBLIC_KEY_ENCODING,\n` +
`            publicKeyBase64Url = AndroidHomeDevicePossessionProfile.encodeSpkiBase64Url(spki),\n` +
`            devicePublicKeyFingerprintRef = AndroidHomeDevicePossessionProfile.fingerprintRef(spki),\n` +
`            privateKeyExportable = false,\n` +
`        )\n` +
`    }\n\n` +
`    override fun signCanonicalChallenge(bytes: ByteArray): ByteArray {\n` +
`        require(bytes.isNotEmpty()) { "canonical challenge bytes required" }\n` +
`        val privateKey = keyStore().getKey(alias, null) as? PrivateKey\n` +
`            ?: error("AndroidKeyStore device-possession private key is absent")\n` +
`        val signature = Signature.getInstance(AndroidHomeDevicePossessionProfile.SIGNATURE_ALGORITHM)\n` +
`        signature.initSign(privateKey)\n` +
`        signature.update(bytes)\n` +
`        return signature.sign()\n` +
`    }\n` +
`}\n\n` +
`class FakeDevicePossessionKeyProvider(\n` +
`    private val descriptor: DevicePossessionKeyDescriptor,\n` +
`    private val signer: (ByteArray) -> ByteArray,\n` +
`) : DevicePossessionKeyProvider {\n` +
`    override fun ensureCurrentKey(): DevicePossessionKeyDescriptor = descriptor\n` +
`    override fun publicDescriptor(): DevicePossessionKeyDescriptor = descriptor\n` +
`    override fun signCanonicalChallenge(bytes: ByteArray): ByteArray = signer(bytes.copyOf())\n` +
`}\n`;
}

function renderTest() {
  return `package vexlife.android.app\n\n` +
`import org.junit.Assert.assertArrayEquals\n` +
`import org.junit.Assert.assertEquals\n` +
`import org.junit.Assert.assertFalse\n` +
`import org.junit.Assert.assertNotEquals\n` +
`import org.junit.Assert.assertThrows\n` +
`import org.junit.Test\n` +
`import vexlife.android.security.AndroidHomeDevicePossessionProfile\n` +
`import vexlife.android.security.DevicePossessionKeyDescriptor\n` +
`import vexlife.android.security.FakeDevicePossessionKeyProvider\n` +
`import vexlife.android.security.HomeDevicePossessionSigningPayload\n\n` +
`class R8DevicePossessionKeyTest {\n` +
`    private fun fixture() = HomeDevicePossessionSigningPayload(\n` +
`        schemaVersion = "vextreme.security.home-device-possession-signing-payload/v1",\n` +
`        challengeRef = "challenge.home-possession.fixture.001",\n` +
`        homeRef = "home.fixture",\n` +
`        principalRef = "principal.fixture",\n` +
`        deviceRef = "device.android.fixture",\n` +
`        membershipRef = "membership.fixture",\n` +
`        membershipHash = "${'a'.repeat(64)}",\n` +
`        revocationGeneration = 7L,\n` +
`        devicePublicKeyFingerprintRef = "fingerprint.sha256.${'b'.repeat(64)}",\n` +
`        nonceBase64Url = "AAECAwQFBgcICQ",\n` +
`        issuedAtMs = 1760000000000L,\n` +
`        expiresAtMs = 1760000300000L,\n` +
`    )\n\n` +
`    @Test fun canonicalVectorMatchesSecurityProfile() {\n` +
`        val bytes = AndroidHomeDevicePossessionProfile.canonicalSigningBytes(fixture())\n` +
`        assertEquals(585, bytes.size)\n` +
`        assertEquals("16a22f6bbd4a7fababfa0e220b5b7c5d4d86182e12ccb1f89f3e7da78adc0bba", AndroidHomeDevicePossessionProfile.signingPayloadSha256(fixture()))\n` +
`        assertEquals('\\n'.code.toByte(), bytes.last())\n` +
`    }\n\n` +
`    @Test fun semanticIdentityChangeChangesDigest() {\n` +
`        assertNotEquals(\n` +
`            AndroidHomeDevicePossessionProfile.signingPayloadSha256(fixture()),\n` +
`            AndroidHomeDevicePossessionProfile.signingPayloadSha256(fixture().copy(deviceRef = "device.android.other")),\n` +
`        )\n` +
`    }\n\n` +
`    @Test fun profileBindsNonExportableAndroidKeyStoreP256Sha256() {\n` +
`        assertEquals("AndroidKeyStore", AndroidHomeDevicePossessionProfile.PROVIDER)\n` +
`        assertEquals("EC", AndroidHomeDevicePossessionProfile.KEY_ALGORITHM)\n` +
`        assertEquals("secp256r1", AndroidHomeDevicePossessionProfile.CURVE)\n` +
`        assertEquals("SHA256withECDSA", AndroidHomeDevicePossessionProfile.SIGNATURE_ALGORITHM)\n` +
`        assertEquals("signature.vextreme.ecdsa-p256-sha256", AndroidHomeDevicePossessionProfile.SIGNATURE_ALGORITHM_REF)\n` +
`    }\n\n` +
`    @Test fun fakeProviderIsExplicitAndDoesNotExportPrivateMaterial() {\n` +
`        val descriptor = DevicePossessionKeyDescriptor(\n` +
`            keyRef = "key.android-keystore.fixture",\n` +
`            provider = "FakeDevicePossessionKeyProvider",\n` +
`            credentialClass = "OS_BACKED_DEVICE_SIGNING_KEY",\n` +
`            signatureAlgorithmRef = "signature.vextreme.ecdsa-p256-sha256",\n` +
`            publicKeyEncoding = "X509_SPKI_DER_BASE64URL",\n` +
`            publicKeyBase64Url = "fixture",\n` +
`            devicePublicKeyFingerprintRef = "fingerprint.sha256.${'c'.repeat(64)}",\n` +
`            privateKeyExportable = false,\n` +
`        )\n` +
`        val provider = FakeDevicePossessionKeyProvider(descriptor) { input -> byteArrayOf(input.size.toByte()) }\n` +
`        assertFalse(provider.publicDescriptor().privateKeyExportable)\n` +
`        assertArrayEquals(byteArrayOf(3), provider.signCanonicalChallenge(byteArrayOf(1, 2, 3)))\n` +
`    }\n\n` +
`    @Test fun invalidExpiryFailsClosedBeforeSigning() {\n` +
`        assertThrows(IllegalArgumentException::class.java) {\n` +
`            AndroidHomeDevicePossessionProfile.canonicalSigningBytes(fixture().copy(expiresAtMs = fixture().issuedAtMs))\n` +
`        }\n` +
`    }\n` +
`}\n`;
}

export function renderAndroidR8DevicePossessionOutputs() {
  const files = Object.freeze({
    [ANDROID_R8_OUTPUT_PATHS[0]]: renderContract(),
    [ANDROID_R8_OUTPUT_PATHS[1]]: renderTest(),
  });
  return Object.freeze({ stage: ANDROID_R8_STAGE, files, effects: falseEffects() });
}

// [VXG RealForever]
