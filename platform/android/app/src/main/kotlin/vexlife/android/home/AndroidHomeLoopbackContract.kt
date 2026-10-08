package vexlife.android.home

object AndroidHomeLoopbackContract {
    const val PROOF_LABEL: String = "SYNTHETIC / LOOPBACK"
    const val HOME_BRIDGE_REF: String = "bridge.vexlife.personal-home.001"
    const val TRANSPORT_REF: String = "transport.vexlife.loopback"
    const val REQUEST_REF: String = "synthetic.request.android-r5.loopback.001"
    const val RECEIPT_REF: String = "synthetic.receipt.android-r5.loopback.001"
    const val PROJECTION_REF: String = "projection.vexlife.android.r5.home-loopback"
    const val STATE_REF: String = "state.vexlife.android.r5.home-loopback"
    const val CANONICAL_WRITER: String = "DESKTOP_HOME_NODE"
    const val REMOTE_WRITER_GRANTED: Boolean = false
    const val SYNTHETIC_FIXTURE: Boolean = true
    const val REAL_HOME_CONNECTED: Boolean = false
    const val REAL_NETWORK_CONNECTED: Boolean = false
    const val HOME_WRITER_GRANTED: Boolean = false
    const val RAW_MODEL_ENDPOINT_EXPOSED: Boolean = false
}
