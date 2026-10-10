package vexlife.android.app

import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModelProvider
import vexlife.android.architecture.SemanticRef
import vexlife.android.architecture.VexRuntimeWitness
import vexlife.android.identity.GeneratedCanonicalRefs
import vexlife.android.presentation.AndroidHomeLoopbackSurface
import vexlife.android.presentation.AndroidRemoteVesselSurface
import vexlife.android.presentation.VexDesignLabDoorwayFab
import vexlife.android.presentation.VexDesignLabSurface

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
        val designLabEnabled = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        setContent { MaterialTheme { R2Witness(viewModel, designLabEnabled) } }
    }
}

@Composable
private fun R2Witness(viewModel: VexAppViewModel, designLabEnabled: Boolean) {
    val view by viewModel.viewState.collectAsState()
    var designLabOpen by remember { mutableStateOf(false) }
    BackHandler(enabled = designLabOpen) { designLabOpen = false }
    Surface(
        Modifier
            .fillMaxSize()
            .semantics { testTagsAsResourceId = true },
    ) {
        if (designLabOpen) {
            VexDesignLabSurface(onClose = { designLabOpen = false })
        } else {
            Box(Modifier.fillMaxSize()) {
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
                if (designLabEnabled) {
                    VexDesignLabDoorwayFab(
                        onClick = { designLabOpen = true },
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .safeDrawingPadding()
                            .padding(24.dp),
                    )
                }
            }
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
