package vexlife.android.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec

data class HomeDevicePossessionSigningPayload(
    val schemaVersion: String,
    val challengeRef: String,
    val homeRef: String,
    val principalRef: String,
    val deviceRef: String,
    val membershipRef: String,
    val membershipHash: String,
    val revocationGeneration: Long,
    val devicePublicKeyFingerprintRef: String,
    val nonceBase64Url: String,
    val issuedAtMs: Long,
    val expiresAtMs: Long,
)

data class DevicePossessionKeyDescriptor(
    val keyRef: String,
    val provider: String,
    val credentialClass: String,
    val signatureAlgorithmRef: String,
    val publicKeyEncoding: String,
    val publicKeyBase64Url: String,
    val devicePublicKeyFingerprintRef: String,
    val privateKeyExportable: Boolean = false,
)

interface DevicePossessionKeyProvider {
    fun ensureCurrentKey(): DevicePossessionKeyDescriptor
    fun publicDescriptor(): DevicePossessionKeyDescriptor
    fun signCanonicalChallenge(bytes: ByteArray): ByteArray
}

object AndroidHomeDevicePossessionProfile {
    const val STAGE: String = "R8_OS_BACKED_DEVICE_POSSESSION"
    const val SIGNING_PAYLOAD_SCHEMA: String = "vextreme.security.home-device-possession-signing-payload/v1"
    const val PROVIDER: String = "AndroidKeyStore"
    const val CREDENTIAL_CLASS: String = "OS_BACKED_DEVICE_SIGNING_KEY"
    const val KEY_ALGORITHM: String = "EC"
    const val CURVE: String = "secp256r1"
    const val DIGEST: String = "SHA-256"
    const val SIGNATURE_ALGORITHM: String = "SHA256withECDSA"
    const val SIGNATURE_ALGORITHM_REF: String = "signature.vextreme.ecdsa-p256-sha256"
    const val PUBLIC_KEY_ENCODING: String = "X509_SPKI_DER_BASE64URL"
    const val DEFAULT_ALIAS: String = "vexlife.home.device-possession.v1"
    private val REF = Regex("[A-Za-z0-9][A-Za-z0-9._:/#@+\\-]{0,511}")
    private val SHA256_HEX = Regex("[0-9a-f]{64}")
    private val FINGERPRINT_REF = Regex("fingerprint\\.sha256\\.[0-9a-f]{64}")
    private val BASE64URL = Regex("[A-Za-z0-9_-]{8,512}")

    private fun jsonString(value: String): String = buildString {
        append('"')
        for (character in value) {
            when (character) {
                '"' -> append("\\\"")
                '\\' -> append("\\\\")
                '\b' -> append("\\b")
                '\u000C' -> append("\\f")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> if (character.code < 0x20) {
                    append("\\u")
                    append(character.code.toString(16).padStart(4, '0'))
                } else append(character)
            }
        }
        append('"')
    }

    private fun validate(payload: HomeDevicePossessionSigningPayload) {
        require(payload.schemaVersion == SIGNING_PAYLOAD_SCHEMA) { "signing payload schema mismatch" }
        require(payload.challengeRef.matches(REF))
        require(payload.homeRef.matches(REF))
        require(payload.principalRef.matches(REF))
        require(payload.deviceRef.matches(REF))
        require(payload.membershipRef.matches(REF))
        require(payload.membershipHash.matches(SHA256_HEX))
        require(payload.revocationGeneration >= 0L)
        require(payload.devicePublicKeyFingerprintRef.matches(FINGERPRINT_REF))
        require(payload.nonceBase64Url.matches(BASE64URL))
        require(payload.issuedAtMs > 0L && payload.expiresAtMs > payload.issuedAtMs)
    }

    fun canonicalSigningBytes(payload: HomeDevicePossessionSigningPayload): ByteArray {
        validate(payload)
        val json = "{" +
            "\"challengeRef\":" + jsonString(payload.challengeRef) + "," +
            "\"devicePublicKeyFingerprintRef\":" + jsonString(payload.devicePublicKeyFingerprintRef) + "," +
            "\"deviceRef\":" + jsonString(payload.deviceRef) + "," +
            "\"expiresAtMs\":" + payload.expiresAtMs + "," +
            "\"homeRef\":" + jsonString(payload.homeRef) + "," +
            "\"issuedAtMs\":" + payload.issuedAtMs + "," +
            "\"membershipHash\":" + jsonString(payload.membershipHash) + "," +
            "\"membershipRef\":" + jsonString(payload.membershipRef) + "," +
            "\"nonceBase64Url\":" + jsonString(payload.nonceBase64Url) + "," +
            "\"principalRef\":" + jsonString(payload.principalRef) + "," +
            "\"revocationGeneration\":" + payload.revocationGeneration + "," +
            "\"schemaVersion\":" + jsonString(payload.schemaVersion) +
            "}\n"
        return json.toByteArray(Charsets.UTF_8)
    }

    fun signingPayloadSha256(payload: HomeDevicePossessionSigningPayload): String =
        sha256Hex(canonicalSigningBytes(payload))

    fun fingerprintRef(spkiDer: ByteArray): String {
        require(spkiDer.isNotEmpty())
        return "fingerprint.sha256." + sha256Hex(spkiDer)
    }

    fun keyRef(alias: String): String {
        require(alias.isNotBlank())
        return "key.android-keystore." + sha256Hex(alias.toByteArray(Charsets.UTF_8))
    }

    fun encodeSpkiBase64Url(spkiDer: ByteArray): String =
        Base64.encodeToString(spkiDer, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

    private fun sha256Hex(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 0xff) }
}

class AndroidKeystoreDevicePossessionKeyProvider(
    private val alias: String = AndroidHomeDevicePossessionProfile.DEFAULT_ALIAS,
) : DevicePossessionKeyProvider {
    private fun keyStore(): KeyStore = KeyStore.getInstance(AndroidHomeDevicePossessionProfile.PROVIDER).apply { load(null) }

    override fun ensureCurrentKey(): DevicePossessionKeyDescriptor {
        val store = keyStore()
        if (!store.containsAlias(alias)) {
            val generator = KeyPairGenerator.getInstance(
                AndroidHomeDevicePossessionProfile.KEY_ALGORITHM,
                AndroidHomeDevicePossessionProfile.PROVIDER,
            )
            val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
                .setAlgorithmParameterSpec(ECGenParameterSpec(AndroidHomeDevicePossessionProfile.CURVE))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .build()
            generator.initialize(spec)
            generator.generateKeyPair()
        }
        return publicDescriptor()
    }

    override fun publicDescriptor(): DevicePossessionKeyDescriptor {
        val certificate = keyStore().getCertificate(alias) ?: error("AndroidKeyStore device-possession key is absent")
        val spki = certificate.publicKey.encoded ?: error("AndroidKeyStore public key encoding unavailable")
        return DevicePossessionKeyDescriptor(
            keyRef = AndroidHomeDevicePossessionProfile.keyRef(alias),
            provider = AndroidHomeDevicePossessionProfile.PROVIDER,
            credentialClass = AndroidHomeDevicePossessionProfile.CREDENTIAL_CLASS,
            signatureAlgorithmRef = AndroidHomeDevicePossessionProfile.SIGNATURE_ALGORITHM_REF,
            publicKeyEncoding = AndroidHomeDevicePossessionProfile.PUBLIC_KEY_ENCODING,
            publicKeyBase64Url = AndroidHomeDevicePossessionProfile.encodeSpkiBase64Url(spki),
            devicePublicKeyFingerprintRef = AndroidHomeDevicePossessionProfile.fingerprintRef(spki),
            privateKeyExportable = false,
        )
    }

    override fun signCanonicalChallenge(bytes: ByteArray): ByteArray {
        require(bytes.isNotEmpty()) { "canonical challenge bytes required" }
        val privateKey = keyStore().getKey(alias, null) as? PrivateKey
            ?: error("AndroidKeyStore device-possession private key is absent")
        val signature = Signature.getInstance(AndroidHomeDevicePossessionProfile.SIGNATURE_ALGORITHM)
        signature.initSign(privateKey)
        signature.update(bytes)
        return signature.sign()
    }
}

class FakeDevicePossessionKeyProvider(
    private val descriptor: DevicePossessionKeyDescriptor,
    private val signer: (ByteArray) -> ByteArray,
) : DevicePossessionKeyProvider {
    override fun ensureCurrentKey(): DevicePossessionKeyDescriptor = descriptor
    override fun publicDescriptor(): DevicePossessionKeyDescriptor = descriptor
    override fun signCanonicalChallenge(bytes: ByteArray): ByteArray = signer(bytes.copyOf())
}
