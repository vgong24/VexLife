package vexlife.android.identity

import vexlife.android.architecture.SemanticRef

object GeneratedCanonicalRefs {
    const val ARCHITECTURE_BASELINE_REF: String = "architecture.vexlife.android-runtime.pre-r2.r1"
    const val SOURCE_A4_IDENTITY_FINGERPRINT: String = "6aef8e047a19dad7311f2e2923f3ac9ea013d25ac4f6f86cc384191f69b1bb8a"
    const val A5_SEMANTIC_FINGERPRINT: String = "067f263841c831c55abce6822abbba3dad0cb8c95072fa4d03fca7ebbdf14704"

    val architectureSurface = SemanticRef("surface.vexlife.android.r2.architecture")
    val architectureTitleElement = SemanticRef("element.vexlife.android.r2.architecture.title")
    val requestAttentionAction = SemanticRef("action.vexlife.conversation.request-attention")
    val statusElement = SemanticRef("element.vexlife.android.r2.architecture.status")
    val localPrincipal = SemanticRef("principal.vexlife.android.r2.local")
    val presentationSession = SemanticRef("session.vexlife.android.r2.presentation")
    const val REMOTE_VESSEL_PRESENTATION_REF: String = "presentation.vexlife.security-access.android-remote-vessel"
    const val REMOTE_VESSEL_REGISTRY_REF: String = "registry.vexlife.android-remote-vessel.001"
    const val REMOTE_VESSEL_HOME_BRIDGE_REF: String = "bridge.vexlife.personal-home.001"
    const val REMOTE_VESSEL_REFERENCE_STATE: String = "UNPAIRED"
    const val REMOTE_VESSEL_CANONICAL_WRITER: String = "DESKTOP_HOME_NODE"

    val remoteVesselPresentation = SemanticRef(REMOTE_VESSEL_PRESENTATION_REF)
    val remoteVesselTitleElement = SemanticRef("element.vexlife.android.remote-vessel.title")
    val remoteVesselStatusElement = SemanticRef("element.vexlife.android.remote-vessel.status")
}
