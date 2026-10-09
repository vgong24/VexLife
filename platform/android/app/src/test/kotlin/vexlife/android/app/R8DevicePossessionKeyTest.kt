package vexlife.android.app

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import vexlife.android.security.AndroidHomeDevicePossessionProfile
import vexlife.android.security.DevicePossessionKeyDescriptor
import vexlife.android.security.FakeDevicePossessionKeyProvider
import vexlife.android.security.HomeDevicePossessionSigningPayload

class R8DevicePossessionKeyTest {
    private fun fixture() = HomeDevicePossessionSigningPayload(
        schemaVersion = "vextreme.security.home-device-possession-signing-payload/v1",
        challengeRef = "challenge.home-possession.fixture.001",
        homeRef = "home.fixture",
        principalRef = "principal.fixture",
        deviceRef = "device.android.fixture",
        membershipRef = "membership.fixture",
        membershipHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        revocationGeneration = 7L,
        devicePublicKeyFingerprintRef = "fingerprint.sha256.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        nonceBase64Url = "AAECAwQFBgcICQ",
        issuedAtMs = 1760000000000L,
        expiresAtMs = 1760000300000L,
    )

    @Test fun canonicalVectorMatchesSecurityProfile() {
        val bytes = AndroidHomeDevicePossessionProfile.canonicalSigningBytes(fixture())
        assertEquals(585, bytes.size)
        assertEquals("16a22f6bbd4a7fababfa0e220b5b7c5d4d86182e12ccb1f89f3e7da78adc0bba", AndroidHomeDevicePossessionProfile.signingPayloadSha256(fixture()))
        assertEquals('\n'.code.toByte(), bytes.last())
    }

    @Test fun semanticIdentityChangeChangesDigest() {
        assertNotEquals(
            AndroidHomeDevicePossessionProfile.signingPayloadSha256(fixture()),
            AndroidHomeDevicePossessionProfile.signingPayloadSha256(fixture().copy(deviceRef = "device.android.other")),
        )
    }

    @Test fun profileBindsNonExportableAndroidKeyStoreP256Sha256() {
        assertEquals("AndroidKeyStore", AndroidHomeDevicePossessionProfile.PROVIDER)
        assertEquals("EC", AndroidHomeDevicePossessionProfile.KEY_ALGORITHM)
        assertEquals("secp256r1", AndroidHomeDevicePossessionProfile.CURVE)
        assertEquals("SHA256withECDSA", AndroidHomeDevicePossessionProfile.SIGNATURE_ALGORITHM)
        assertEquals("signature.vextreme.ecdsa-p256-sha256", AndroidHomeDevicePossessionProfile.SIGNATURE_ALGORITHM_REF)
    }

    @Test fun fakeProviderIsExplicitAndDoesNotExportPrivateMaterial() {
        val descriptor = DevicePossessionKeyDescriptor(
            keyRef = "key.android-keystore.fixture",
            provider = "FakeDevicePossessionKeyProvider",
            credentialClass = "OS_BACKED_DEVICE_SIGNING_KEY",
            signatureAlgorithmRef = "signature.vextreme.ecdsa-p256-sha256",
            publicKeyEncoding = "X509_SPKI_DER_BASE64URL",
            publicKeyBase64Url = "fixture",
            devicePublicKeyFingerprintRef = "fingerprint.sha256.cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
            privateKeyExportable = false,
        )
        val provider = FakeDevicePossessionKeyProvider(descriptor) { input -> byteArrayOf(input.size.toByte()) }
        assertFalse(provider.publicDescriptor().privateKeyExportable)
        assertArrayEquals(byteArrayOf(3), provider.signCanonicalChallenge(byteArrayOf(1, 2, 3)))
    }

    @Test fun invalidExpiryFailsClosedBeforeSigning() {
        assertThrows(IllegalArgumentException::class.java) {
            AndroidHomeDevicePossessionProfile.canonicalSigningBytes(fixture().copy(expiresAtMs = fixture().issuedAtMs))
        }
    }
}
