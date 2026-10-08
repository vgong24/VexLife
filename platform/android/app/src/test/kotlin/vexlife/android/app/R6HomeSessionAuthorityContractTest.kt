package vexlife.android.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test
import vexlife.android.home.AndroidHomeSessionAuthorityContract
import vexlife.android.home.AndroidHomeSessionAuthorityInput

class R6HomeSessionAuthorityContractTest {
    private fun input() = AndroidHomeSessionAuthorityInput(
        schemaVersion = AndroidHomeSessionAuthorityContract.SOURCE_AUTHORITY_SCHEMA,
        state = "CURRENT",
        authorityReceiptRef = "authority-receipt.vexlife.r6.fixture",
        stableSessionBindingRef = "session-binding.vexlife.r6.fixture",
        principalRef = "person.victor-gong",
        deviceRef = "device.android.r6.fixture",
        membershipRef = "membership.vexlife.r6.fixture",
        membershipPrincipalRef = "person.victor-gong",
        membershipDeviceRef = "device.android.r6.fixture",
        membershipRevocationGeneration = 4L,
        leaseRef = "lease.vexlife.r6.fixture",
        leasePrincipalRef = "person.victor-gong",
        leaseDeviceRef = "device.android.r6.fixture",
        leaseRevocationGeneration = 4L,
        leaseExpiresAt = "2030-01-01T00:00:00.000Z",
        currentRevocationGeneration = 4L,
        sourceReceiptRefs = listOf("receipt.home-bridge.r6.fixture"),
        currentnessRefs = listOf("currentness.home-bridge.r6.fixture"),
    )

    @Test fun currentOwnerAuthorityProjectsReadyWithoutPerformingEffects() {
        val ready = AndroidHomeSessionAuthorityContract.admit(input(), "transport.vexlife.tailscale")
        assertEquals("READY_FOR_PRIVATE_TRANSPORT", ready.state)
        assertEquals("person.victor-gong", ready.principalRef)
        assertEquals("device.android.r6.fixture", ready.deviceRef)
        assertEquals("DESKTOP_HOME_NODE", ready.canonicalWriter)
        assertFalse(ready.remoteWriterGranted)
        assertFalse(ready.pairingMutationPerformed)
        assertFalse(ready.authenticationMutationPerformed)
        assertFalse(ready.authorizationMutationPerformed)
        assertFalse(ready.capabilityLeaseMutationPerformed)
        assertFalse(ready.revocationMutationPerformed)
        assertFalse(ready.networkConnectionPerformed)
        assertFalse(ready.homePayloadReadOrWritePerformed)
        assertFalse(ready.credentialEffectPerformed)
        assertFalse(ready.modelRuntimeEffectPerformed)
        assertFalse(ready.physicalDeviceEffectPerformed)
    }

    @Test fun mismatchedPrincipalFailsClosed() {
        assertThrows(IllegalArgumentException::class.java) {
            AndroidHomeSessionAuthorityContract.admit(input().copy(leasePrincipalRef = "person.other"), "transport.vexlife.tailscale")
        }
    }

    @Test fun unsupportedTransportFailsClosed() {
        assertThrows(IllegalArgumentException::class.java) {
            AndroidHomeSessionAuthorityContract.admit(input(), "transport.vexlife.loopback")
        }
    }

    @Test fun duplicateCurrentnessEvidenceFailsClosed() {
        assertThrows(IllegalArgumentException::class.java) {
            AndroidHomeSessionAuthorityContract.admit(input().copy(currentnessRefs = listOf("same", "same")), "transport.vexlife.wireguard")
        }
    }
}
