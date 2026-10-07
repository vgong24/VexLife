package vexlife.android.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import vexlife.android.home.AndroidHomeLoopbackContract
import vexlife.android.identity.GeneratedCanonicalRefs

class R5HomeLoopbackContractTest {
    @Test fun syntheticLoopbackProjectionCannotBecomeRealHomeTruth() {
        assertEquals("SYNTHETIC / LOOPBACK", AndroidHomeLoopbackContract.PROOF_LABEL)
        assertEquals("bridge.vexlife.personal-home.001", AndroidHomeLoopbackContract.HOME_BRIDGE_REF)
        assertEquals("transport.vexlife.loopback", AndroidHomeLoopbackContract.TRANSPORT_REF)
        assertEquals(AndroidHomeLoopbackContract.REQUEST_REF, GeneratedCanonicalRefs.R5_REQUEST_REF)
        assertEquals(AndroidHomeLoopbackContract.RECEIPT_REF, GeneratedCanonicalRefs.R5_RECEIPT_REF)
        assertTrue(AndroidHomeLoopbackContract.SYNTHETIC_FIXTURE)
        assertFalse(AndroidHomeLoopbackContract.REMOTE_WRITER_GRANTED)
        assertFalse(AndroidHomeLoopbackContract.REAL_HOME_CONNECTED)
        assertFalse(AndroidHomeLoopbackContract.REAL_NETWORK_CONNECTED)
        assertFalse(AndroidHomeLoopbackContract.HOME_WRITER_GRANTED)
        assertFalse(AndroidHomeLoopbackContract.RAW_MODEL_ENDPOINT_EXPOSED)
    }
}
