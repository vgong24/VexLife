package vexlife.android.app

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModelProvider
import vexlife.android.identity.GeneratedCanonicalRefs
import vexlife.android.presentation.AndroidRemoteVesselSurface
import vexlife.android.presentation.AndroidHomeLoopbackSurface
import vexlife.android.architecture.SemanticRef
import vexlife.android.architecture.VexRuntimeWitness

class MainActivity : ComponentActivity() {
    private val compositionRoot by lazy { VexCompositionRoot() }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.BLACK),
            navigationBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.BLACK),
        )
        super.onCreate(savedInstanceState)
        val viewModel = ViewModelProvider(
            this,
            compositionRoot.viewModelFactory(),
        )[VexAppViewModel::class.java]
        setContent { MaterialTheme { R2Witness(viewModel) } }
    }
}

@Composable
private fun R2Witness(viewModel: VexAppViewModel) {
    val view by viewModel.viewState.collectAsState()
    Surface(
        Modifier
            .fillMaxSize()
            .semantics { testTagsAsResourceId = true },
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.safeDrawingPadding().padding(24.dp),
        ) {
            Text(
                stringResource(R.string.r2_architecture_title),
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.testTag(GeneratedCanonicalRefs.architectureTitleElement.value),
            )
            Text(statusText(view.statusRef), Modifier.testTag(view.testRef.value))
            AndroidRemoteVesselSurface()
            AndroidHomeLoopbackSurface()
            Button(
                onClick = viewModel::requestConversationAttention,
                modifier = Modifier.testTag(GeneratedCanonicalRefs.requestAttentionAction.value),
            ) { Text(stringResource(R.string.r2_request_attention)) }
        }
    }
}

@Composable
private fun statusText(statusRef: SemanticRef): String =
    if (statusRef.value == VexRuntimeWitness.STATUS_ATTENTION_ADMITTED) {
        stringResource(R.string.r2_attention_admitted)
    } else {
        stringResource(R.string.r2_ready)
    }