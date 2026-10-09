package vexlife.android.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test
import vexlife.android.home.AndroidPrivateTransportConsumerContract
import vexlife.android.home.AndroidPrivateTransportConsumerInput

class R6BPrivateTransportConsumerContractTest {
    private fun input() = AndroidPrivateTransportConsumerInput(
        r6State = "READY_FOR_PRIVATE_TRANSPORT",
        homeRef = "home.vex.fixture",
        stableSessionBindingRef = "session-binding.vexlife.r6b.fixture",
        principalRef = "person.victor-gong",
        deviceRef = "device.android.r6b.fixture",
        membershipRef = "membership.vexlife.r6b.fixture",
        leaseRef = "lease.vexlife.r6b.fixture",
        r6RevocationGeneration = 9L,
        authorityRevocationGeneration = 9L,
        reachabilityRevocationGeneration = 9L,
        privateTransportRef = "transport.vexlife.tailscale",
        canonicalWriter = "DESKTOP_HOME_NODE",
        remoteWriterGranted = false,
        routeRef = "route.vex.fixture",
        routeState = "REMOTE_CANDIDATE",
        routeGeneration = 4L,
        gatewayRef = "gateway.vex.fixture",
        gatewayState = "READY",
        gatewayGeneration = 3L,
        remoteCanonicalWrite = false,
        rawModelEndpointIsGateway = false,
        revisionDigest = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        revisionGeneration = 6L,
        pointerDigest = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        pointerGeneration = 7L,
        signatureReceiptRef = "receipt.signature.r6b.fixture",
        acceptanceReceiptRef = "receipt.acceptance.r6b.fixture",
        signerFingerprintRef = "signer-fingerprint.ed25519.r6bfixture",
        cryptographicallyVerified = true,
        pointerAcceptanceVerified = true,
        provesLiveReachability = false,
        authenticates = false,
        authorizes = false,
        grantsAuthority = false,
    )

    @Test fun acceptedOpaqueOwnerStateProjectsAdapterReadinessWithoutEffects() {
        val ready = AndroidPrivateTransportConsumerContract.admit(input())
        assertEquals("READY_FOR_RUNTIME_PRIVATE_TRANSPORT_ADAPTER", ready.state)
        assertEquals("home.vex.fixture", ready.homeRef)
        assertEquals("route.vex.fixture", ready.routeRef)
        assertEquals("gateway.vex.fixture", ready.gatewayRef)
        assertEquals("DESKTOP_HOME_NODE", ready.canonicalWriter)
        assertFalse(ready.remoteWriterGranted)
        assertFalse(ready.provesLiveReachability)
        assertFalse(ready.networkConnectionPerformed)
        assertFalse(ready.endpointMaterializationPerformed)
        assertFalse(ready.homePayloadReadOrWritePerformed)
        assertFalse(ready.remoteHomeWritePerformed)
        assertFalse(ready.credentialEffectPerformed)
        assertFalse(ready.modelRuntimeEffectPerformed)
        assertFalse(ready.physicalDeviceEffectPerformed)
    }

    @Test fun staleRevocationFailsClosed() {
        assertThrows(IllegalArgumentException::class.java) { AndroidPrivateTransportConsumerContract.admit(input().copy(reachabilityRevocationGeneration = 8L)) }
    }

    @Test fun unavailableGatewayFailsClosed() {
        assertThrows(IllegalArgumentException::class.java) { AndroidPrivateTransportConsumerContract.admit(input().copy(gatewayState = "UNAVAILABLE")) }
    }

    @Test fun unverifiedAcceptedPointerFailsClosed() {
        assertThrows(IllegalArgumentException::class.java) { AndroidPrivateTransportConsumerContract.admit(input().copy(pointerAcceptanceVerified = false)) }
    }

    @Test fun unsupportedTransportFailsClosed() {
        assertThrows(IllegalArgumentException::class.java) { AndroidPrivateTransportConsumerContract.admit(input().copy(privateTransportRef = "transport.vexlife.loopback")) }
    }
}
