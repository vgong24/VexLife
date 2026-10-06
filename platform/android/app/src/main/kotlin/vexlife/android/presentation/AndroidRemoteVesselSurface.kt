package vexlife.android.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import vexlife.android.app.R
import vexlife.android.identity.GeneratedCanonicalRefs

object AndroidRemoteVesselReferenceContract {
    const val PRESENTATION_REF: String = "presentation.vexlife.security-access.android-remote-vessel"
    const val REGISTRY_REF: String = "registry.vexlife.android-remote-vessel.001"
    const val HOME_BRIDGE_REF: String = "bridge.vexlife.personal-home.001"
    const val REFERENCE_STATE: String = "UNPAIRED"
    const val CANONICAL_WRITER: String = "DESKTOP_HOME_NODE"
    const val REMOTE_WRITER_GRANTED: Boolean = false
    const val PRODUCT_SEMANTIC_OWNERSHIP: Boolean = false
    const val ACTIVE_HOME_ACCESS: Boolean = false
    const val RAW_MODEL_ENDPOINT_EXPOSED: Boolean = false
    const val EFFECT_AUTHORITY_GRANTED: Boolean = false
}

@Composable
fun AndroidRemoteVesselSurface() {
    Column(
        verticalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier.testTag(GeneratedCanonicalRefs.remoteVesselPresentation.value),
    ) {
        Text(
            text = stringResource(R.string.r4_remote_vessel_title),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.testTag(GeneratedCanonicalRefs.remoteVesselTitleElement.value),
        )
        Text(
            text = stringResource(R.string.r4_remote_vessel_status),
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.testTag(GeneratedCanonicalRefs.remoteVesselStatusElement.value),
        )
    }
}
