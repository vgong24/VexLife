package vexlife.android.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import vexlife.android.presentation.VexDesignLabRefs
import vexlife.android.presentation.nextVexButtonReceipt

class DesignLabContractTest {
    @Test
    fun localFixtureReceiptPreservesSemanticIdentityAndRevision() {
        val receipt = nextVexButtonReceipt(7)
        assertTrue(receipt.actionRequested)
        assertEquals(VexDesignLabRefs.BUTTON_ELEMENT_REF, receipt.elementRef)
        assertEquals(VexDesignLabRefs.BUTTON_ACTION_REF, receipt.actionRef)
        assertNull(receipt.itemRefOrNull)
        assertNull(receipt.operationRefOrNull)
        assertEquals(7, receipt.preRevision)
        assertEquals(VexDesignLabRefs.OUTPUT_RESULT, receipt.result)
        assertEquals(8, receipt.postRevision)
        assertEquals(VexDesignLabRefs.PRESENTATION_EVENT, receipt.presentationEvent)
    }
}
