package vexlife.android.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import vexlife.android.identity.GeneratedCanonicalRefs
import vexlife.android.presentation.AndroidRemoteVesselReferenceContract

class R4PresentationContractTest {
    @Test fun remoteVesselReferenceKeepsCanonicalIdentityAndNoEffectBoundary() {
        assertEquals(
            AndroidRemoteVesselReferenceContract.PRESENTATION_REF,
            GeneratedCanonicalRefs.remoteVesselPresentation.value,
        )
        assertEquals("UNPAIRED", AndroidRemoteVesselReferenceContract.REFERENCE_STATE)
        assertEquals("DESKTOP_HOME_NODE", AndroidRemoteVesselReferenceContract.CANONICAL_WRITER)
        assertFalse(AndroidRemoteVesselReferenceContract.REMOTE_WRITER_GRANTED)
        assertFalse(AndroidRemoteVesselReferenceContract.PRODUCT_SEMANTIC_OWNERSHIP)
        assertFalse(AndroidRemoteVesselReferenceContract.ACTIVE_HOME_ACCESS)
        assertFalse(AndroidRemoteVesselReferenceContract.RAW_MODEL_ENDPOINT_EXPOSED)
        assertFalse(AndroidRemoteVesselReferenceContract.EFFECT_AUTHORITY_GRANTED)
    }

    @Test fun localizedHumanLabelsRemainSeparateFromSemanticRefs() {
        assertEquals("presentation.vexlife.security-access.android-remote-vessel", GeneratedCanonicalRefs.REMOTE_VESSEL_PRESENTATION_REF)
        assertEquals("registry.vexlife.android-remote-vessel.001", GeneratedCanonicalRefs.REMOTE_VESSEL_REGISTRY_REF)
        assertEquals("bridge.vexlife.personal-home.001", GeneratedCanonicalRefs.REMOTE_VESSEL_HOME_BRIDGE_REF)
    }
}
