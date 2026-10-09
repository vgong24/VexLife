package vexlife.android.home

data class AndroidPrivateTransportConsumerInput(
    val r6State: String,
    val homeRef: String,
    val stableSessionBindingRef: String,
    val principalRef: String,
    val deviceRef: String,
    val membershipRef: String,
    val leaseRef: String,
    val r6RevocationGeneration: Long,
    val authorityRevocationGeneration: Long,
    val reachabilityRevocationGeneration: Long,
    val privateTransportRef: String,
    val canonicalWriter: String,
    val remoteWriterGranted: Boolean,
    val routeRef: String,
    val routeState: String,
    val routeGeneration: Long,
    val gatewayRef: String,
    val gatewayState: String,
    val gatewayGeneration: Long,
    val remoteCanonicalWrite: Boolean,
    val rawModelEndpointIsGateway: Boolean,
    val revisionDigest: String,
    val revisionGeneration: Long,
    val pointerDigest: String,
    val pointerGeneration: Long,
    val signatureReceiptRef: String,
    val acceptanceReceiptRef: String,
    val signerFingerprintRef: String,
    val cryptographicallyVerified: Boolean,
    val pointerAcceptanceVerified: Boolean,
    val provesLiveReachability: Boolean,
    val authenticates: Boolean,
    val authorizes: Boolean,
    val grantsAuthority: Boolean,
)

data class AndroidPrivateTransportReadyProjection(
    val state: String,
    val homeRef: String,
    val stableSessionBindingRef: String,
    val principalRef: String,
    val deviceRef: String,
    val membershipRef: String,
    val leaseRef: String,
    val currentRevocationGeneration: Long,
    val privateTransportRef: String,
    val routeRef: String,
    val routeGeneration: Long,
    val gatewayRef: String,
    val gatewayGeneration: Long,
    val revisionDigest: String,
    val revisionGeneration: Long,
    val pointerDigest: String,
    val pointerGeneration: Long,
    val signatureReceiptRef: String,
    val acceptanceReceiptRef: String,
    val signerFingerprintRef: String,
    val canonicalWriter: String,
    val remoteWriterGranted: Boolean = false,
    val provesLiveReachability: Boolean = false,
    val authenticates: Boolean = false,
    val authorizes: Boolean = false,
    val grantsAuthority: Boolean = false,
    val networkConnectionPerformed: Boolean = false,
    val endpointMaterializationPerformed: Boolean = false,
    val homePayloadReadOrWritePerformed: Boolean = false,
    val remoteHomeWritePerformed: Boolean = false,
    val credentialEffectPerformed: Boolean = false,
    val modelRuntimeEffectPerformed: Boolean = false,
    val physicalDeviceEffectPerformed: Boolean = false,
)

object AndroidPrivateTransportConsumerContract {
    const val STAGE: String = "R6B_EFFECT_FREE_PRIVATE_TRANSPORT_CONSUMER_CONTRACT"
    const val R6_READY_STATE: String = "READY_FOR_PRIVATE_TRANSPORT"
    const val READY_STATE: String = "READY_FOR_RUNTIME_PRIVATE_TRANSPORT_ADAPTER"
    const val CANONICAL_WRITER: String = "DESKTOP_HOME_NODE"
    val ALLOWED_PRIVATE_TRANSPORT_REFS: Set<String> = setOf(
        "transport.vexlife.tailscale",
        "transport.vexlife.wireguard",
    )

    fun admit(input: AndroidPrivateTransportConsumerInput): AndroidPrivateTransportReadyProjection {
        require(input.r6State == R6_READY_STATE) { "R6 session is not ready for private transport" }
        require(input.homeRef.isNotBlank() && input.stableSessionBindingRef.isNotBlank())
        require(input.principalRef.isNotBlank() && input.deviceRef.isNotBlank())
        require(input.membershipRef.isNotBlank() && input.leaseRef.isNotBlank())
        require(input.privateTransportRef in ALLOWED_PRIVATE_TRANSPORT_REFS) { "private transport is not accepted" }
        require(input.canonicalWriter == CANONICAL_WRITER && !input.remoteWriterGranted) { "Home writer boundary drift" }
        require(input.r6RevocationGeneration >= 0L)
        require(input.r6RevocationGeneration == input.authorityRevocationGeneration) { "authority revocation generation mismatch" }
        require(input.r6RevocationGeneration == input.reachabilityRevocationGeneration) { "reachability revocation generation mismatch" }
        require(input.routeRef.startsWith("route.") && input.routeState == "REMOTE_CANDIDATE") { "remote route is not ready" }
        require(input.gatewayRef.startsWith("gateway.") && input.gatewayState == "READY") { "gateway is not ready" }
        require(input.routeGeneration >= 0L && input.gatewayGeneration >= 0L)
        require(!input.remoteCanonicalWrite && !input.rawModelEndpointIsGateway) { "gateway boundary drift" }
        require(input.revisionDigest.matches(Regex("[0-9a-f]{64}")) && input.pointerDigest.matches(Regex("[0-9a-f]{64}")))
        require(input.revisionGeneration >= 1L && input.pointerGeneration >= 1L)
        require(input.signatureReceiptRef.isNotBlank() && input.acceptanceReceiptRef.isNotBlank() && input.signerFingerprintRef.isNotBlank())
        require(input.cryptographicallyVerified && input.pointerAcceptanceVerified) { "reachability state is not cryptographically accepted" }
        require(!input.provesLiveReachability && !input.authenticates && !input.authorizes && !input.grantsAuthority) { "source boundary drift" }
        return AndroidPrivateTransportReadyProjection(
            state = READY_STATE,
            homeRef = input.homeRef,
            stableSessionBindingRef = input.stableSessionBindingRef,
            principalRef = input.principalRef,
            deviceRef = input.deviceRef,
            membershipRef = input.membershipRef,
            leaseRef = input.leaseRef,
            currentRevocationGeneration = input.r6RevocationGeneration,
            privateTransportRef = input.privateTransportRef,
            routeRef = input.routeRef,
            routeGeneration = input.routeGeneration,
            gatewayRef = input.gatewayRef,
            gatewayGeneration = input.gatewayGeneration,
            revisionDigest = input.revisionDigest,
            revisionGeneration = input.revisionGeneration,
            pointerDigest = input.pointerDigest,
            pointerGeneration = input.pointerGeneration,
            signatureReceiptRef = input.signatureReceiptRef,
            acceptanceReceiptRef = input.acceptanceReceiptRef,
            signerFingerprintRef = input.signerFingerprintRef,
            canonicalWriter = CANONICAL_WRITER,
        )
    }
}
