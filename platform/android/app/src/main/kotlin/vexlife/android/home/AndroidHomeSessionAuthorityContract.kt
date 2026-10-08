package vexlife.android.home

data class AndroidHomeSessionAuthorityInput(
    val schemaVersion: String,
    val state: String,
    val authorityReceiptRef: String,
    val stableSessionBindingRef: String,
    val principalRef: String,
    val deviceRef: String,
    val membershipRef: String,
    val membershipPrincipalRef: String,
    val membershipDeviceRef: String,
    val membershipRevocationGeneration: Long,
    val leaseRef: String,
    val leasePrincipalRef: String,
    val leaseDeviceRef: String,
    val leaseRevocationGeneration: Long,
    val leaseExpiresAt: String,
    val currentRevocationGeneration: Long,
    val sourceReceiptRefs: List<String>,
    val currentnessRefs: List<String>,
)

data class AndroidHomeSessionReadyProjection(
    val state: String,
    val homeBridgeRef: String,
    val authorityReceiptRef: String,
    val stableSessionBindingRef: String,
    val principalRef: String,
    val deviceRef: String,
    val membershipRef: String,
    val leaseRef: String,
    val leaseExpiresAt: String,
    val currentRevocationGeneration: Long,
    val sourceReceiptRefs: List<String>,
    val currentnessRefs: List<String>,
    val privateTransportRef: String,
    val canonicalWriter: String,
    val remoteWriterGranted: Boolean = false,
    val pairingMutationPerformed: Boolean = false,
    val authenticationMutationPerformed: Boolean = false,
    val authorizationMutationPerformed: Boolean = false,
    val capabilityLeaseMutationPerformed: Boolean = false,
    val revocationMutationPerformed: Boolean = false,
    val networkConnectionPerformed: Boolean = false,
    val homePayloadReadOrWritePerformed: Boolean = false,
    val credentialEffectPerformed: Boolean = false,
    val modelRuntimeEffectPerformed: Boolean = false,
    val physicalDeviceEffectPerformed: Boolean = false,
)

object AndroidHomeSessionAuthorityContract {
    const val STAGE: String = "R6_HOME_SESSION_AUTHORITY_ADMISSION"
    const val SOURCE_AUTHORITY_SCHEMA: String = "vexlife.home-bridge-session-authority/v1"
    const val SOURCE_AUTHENTICATED_SESSION_SCHEMA: String = "vexlife.home-bridge-authenticated-session/v1"
    const val SOURCE_AUTHORITY_ACTION_REF: String = "action.vexlife.home-bridge.session-authority.resolve"
    const val HOME_BRIDGE_REF: String = "bridge.vexlife.personal-home.001"
    const val READY_STATE: String = "READY_FOR_PRIVATE_TRANSPORT"
    const val CANONICAL_WRITER: String = "DESKTOP_HOME_NODE"
    val ALLOWED_PRIVATE_TRANSPORT_REFS: Set<String> = setOf(
        "transport.vexlife.tailscale",
        "transport.vexlife.wireguard",
    )

    fun admit(input: AndroidHomeSessionAuthorityInput, privateTransportRef: String): AndroidHomeSessionReadyProjection {
        require(input.schemaVersion == SOURCE_AUTHORITY_SCHEMA) { "source authority schema mismatch" }
        require(input.state == "CURRENT") { "source authority is not current" }
        require(input.authorityReceiptRef.isNotBlank())
        require(input.stableSessionBindingRef.isNotBlank())
        require(input.principalRef.isNotBlank() && input.deviceRef.isNotBlank())
        require(input.membershipRef.isNotBlank() && input.leaseRef.isNotBlank())
        require(input.membershipPrincipalRef == input.principalRef && input.leasePrincipalRef == input.principalRef) { "principal binding mismatch" }
        require(input.membershipDeviceRef == input.deviceRef && input.leaseDeviceRef == input.deviceRef) { "device binding mismatch" }
        require(input.currentRevocationGeneration >= 0L)
        require(input.membershipRevocationGeneration == input.currentRevocationGeneration) { "membership revocation generation mismatch" }
        require(input.leaseRevocationGeneration == input.currentRevocationGeneration) { "lease revocation generation mismatch" }
        require(input.leaseExpiresAt.isNotBlank())
        require(input.sourceReceiptRefs.isNotEmpty() && input.sourceReceiptRefs.none(String::isBlank))
        require(input.sourceReceiptRefs.distinct().size == input.sourceReceiptRefs.size) { "duplicate source receipt ref" }
        require(input.currentnessRefs.isNotEmpty() && input.currentnessRefs.none(String::isBlank))
        require(input.currentnessRefs.distinct().size == input.currentnessRefs.size) { "duplicate currentness ref" }
        require(privateTransportRef in ALLOWED_PRIVATE_TRANSPORT_REFS) { "private transport is not accepted" }
        return AndroidHomeSessionReadyProjection(
            state = READY_STATE,
            homeBridgeRef = HOME_BRIDGE_REF,
            authorityReceiptRef = input.authorityReceiptRef,
            stableSessionBindingRef = input.stableSessionBindingRef,
            principalRef = input.principalRef,
            deviceRef = input.deviceRef,
            membershipRef = input.membershipRef,
            leaseRef = input.leaseRef,
            leaseExpiresAt = input.leaseExpiresAt,
            currentRevocationGeneration = input.currentRevocationGeneration,
            sourceReceiptRefs = input.sourceReceiptRefs.toList(),
            currentnessRefs = input.currentnessRefs.toList(),
            privateTransportRef = privateTransportRef,
            canonicalWriter = CANONICAL_WRITER,
        )
    }
}
