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

@Composable
fun AndroidHomeLoopbackSurface() {
    Column(
        verticalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier.testTag(GeneratedCanonicalRefs.homeLoopbackPresentation.value),
    ) {
        Text(
            text = stringResource(R.string.r5_home_loopback_title),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.testTag(GeneratedCanonicalRefs.homeLoopbackTitleElement.value),
        )
        Text(
            text = stringResource(R.string.r5_home_loopback_status),
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.testTag(GeneratedCanonicalRefs.homeLoopbackStatusElement.value),
        )
    }
}
