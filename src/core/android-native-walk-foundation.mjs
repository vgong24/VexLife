import crypto from 'node:crypto';

export const ANDROID_NATIVE_WALK_FOUNDATION_SCHEMA = 'vexlife.android-native-walk-foundation/v0';
export const ANDROID_NATIVE_WALK_FOUNDATION_STAGE = 'NW-00_NATIVE_SEMANTIC_WALK_FOUNDATION';
export const ACCEPTED_ANDROID_BASE = '78bed64878cc85264878e1cb5ab9fbab7bee293b';
export const MAIN_ACTIVITY_PATH = 'platform/android/app/src/main/kotlin/vexlife/android/app/MainActivity.kt';
export const ACCEPTED_MAIN_ACTIVITY_SHA256 = 'd88de48cb7f4306bfaaa21e8fa9824944575be71041d3c422a29dd04230239e0';
export const ACCEPTED_MAIN_ACTIVITY_SOURCE = "package vexlife.android.app\n\nimport android.os.Bundle\nimport androidx.activity.ComponentActivity\nimport androidx.activity.compose.setContent\nimport androidx.compose.foundation.layout.Arrangement\nimport androidx.compose.foundation.layout.Column\nimport androidx.compose.foundation.layout.fillMaxSize\nimport androidx.compose.foundation.layout.padding\nimport androidx.compose.material3.Button\nimport androidx.compose.material3.MaterialTheme\nimport androidx.compose.material3.Surface\nimport androidx.compose.material3.Text\nimport androidx.compose.runtime.Composable\nimport androidx.compose.runtime.collectAsState\nimport androidx.compose.runtime.getValue\nimport androidx.compose.ui.Modifier\nimport androidx.compose.ui.platform.testTag\nimport androidx.compose.ui.res.stringResource\nimport androidx.compose.ui.unit.dp\nimport androidx.lifecycle.ViewModelProvider\nimport vexlife.android.identity.GeneratedCanonicalRefs\nimport vexlife.android.presentation.AndroidRemoteVesselSurface\nimport vexlife.android.presentation.AndroidHomeLoopbackSurface\nimport vexlife.android.architecture.SemanticRef\nimport vexlife.android.architecture.VexRuntimeWitness\n\nclass MainActivity : ComponentActivity() {\n    private val compositionRoot by lazy { VexCompositionRoot() }\n\n    override fun onCreate(savedInstanceState: Bundle?) {\n        super.onCreate(savedInstanceState)\n        val viewModel = ViewModelProvider(\n            this,\n            compositionRoot.viewModelFactory(),\n        )[VexAppViewModel::class.java]\n        setContent { MaterialTheme { R2Witness(viewModel) } }\n    }\n}\n\n@Composable\nprivate fun R2Witness(viewModel: VexAppViewModel) {\n    val view by viewModel.viewState.collectAsState()\n    Surface(Modifier.fillMaxSize()) {\n        Column(\n            verticalArrangement = Arrangement.spacedBy(16.dp),\n            modifier = Modifier.padding(24.dp),\n        ) {\n            Text(\n                stringResource(R.string.r2_architecture_title),\n                style = MaterialTheme.typography.headlineSmall,\n                modifier = Modifier.testTag(GeneratedCanonicalRefs.architectureTitleElement.value),\n            )\n            Text(statusText(view.statusRef), Modifier.testTag(view.testRef.value))\n            AndroidRemoteVesselSurface()\n            AndroidHomeLoopbackSurface()\n            Button(\n                onClick = viewModel::requestConversationAttention,\n                modifier = Modifier.testTag(GeneratedCanonicalRefs.requestAttentionAction.value),\n            ) { Text(stringResource(R.string.r2_request_attention)) }\n        }\n    }\n}\n\n@Composable\nprivate fun statusText(statusRef: SemanticRef): String =\n    if (statusRef.value == VexRuntimeWitness.STATUS_ATTENTION_ADMITTED) {\n        stringResource(R.string.r2_attention_admitted)\n    } else {\n        stringResource(R.string.r2_ready)\n    }\n";

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function replaceExactlyOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  if (first < 0 || source.indexOf(find, first + find.length) >= 0) {
    throw new Error(`${label} expected exactly one replacement target`);
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + find.length)}`;
}

export function validateAcceptedMainActivityPreimage(source) {
  if (typeof source !== 'string') throw new TypeError('MainActivity source must be a string');
  const observedSha256 = sha256(source);
  if (observedSha256 !== ACCEPTED_MAIN_ACTIVITY_SHA256) {
    throw new Error(`NW00_MAIN_ACTIVITY_PREIMAGE_DRIFT:${observedSha256}`);
  }
  return Object.freeze({ state: 'PASS', path: MAIN_ACTIVITY_PATH, sha256: observedSha256 });
}

export function renderAndroidNativeWalkFoundation(mainActivitySource) {
  validateAcceptedMainActivityPreimage(mainActivitySource);
  let result = mainActivitySource;

  result = replaceExactlyOnce(
    result,
    'import android.os.Bundle\n',
    'import android.graphics.Color\nimport android.os.Bundle\n',
    'android Color import',
  );
  result = replaceExactlyOnce(
    result,
    'import androidx.activity.ComponentActivity\n',
    'import androidx.activity.ComponentActivity\nimport androidx.activity.SystemBarStyle\nimport androidx.activity.enableEdgeToEdge\n',
    'Activity edge-to-edge imports',
  );
  result = replaceExactlyOnce(
    result,
    'import androidx.compose.foundation.layout.padding\n',
    'import androidx.compose.foundation.layout.padding\nimport androidx.compose.foundation.layout.safeDrawingPadding\n',
    'safe-drawing import',
  );
  result = replaceExactlyOnce(
    result,
    'import androidx.compose.ui.platform.testTag\n',
    'import androidx.compose.ui.platform.testTag\nimport androidx.compose.ui.semantics.semantics\nimport androidx.compose.ui.semantics.testTagsAsResourceId\n',
    'native semantics imports',
  );
  result = replaceExactlyOnce(
    result,
    '    override fun onCreate(savedInstanceState: Bundle?) {\n        super.onCreate(savedInstanceState)\n',
    '    override fun onCreate(savedInstanceState: Bundle?) {\n        enableEdgeToEdge(\n            statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.BLACK),\n            navigationBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.BLACK),\n        )\n        super.onCreate(savedInstanceState)\n',
    'edge-to-edge setup',
  );
  result = replaceExactlyOnce(
    result,
    '    Surface(Modifier.fillMaxSize()) {\n',
    '    Surface(\n        Modifier\n            .fillMaxSize()\n            .semantics { testTagsAsResourceId = true },\n    ) {\n',
    'root semantics projection',
  );
  result = replaceExactlyOnce(
    result,
    '            modifier = Modifier.padding(24.dp),\n',
    '            modifier = Modifier.safeDrawingPadding().padding(24.dp),\n',
    'safe drawing content inset',
  );

  return Object.freeze({
    schemaVersion: ANDROID_NATIVE_WALK_FOUNDATION_SCHEMA,
    stage: ANDROID_NATIVE_WALK_FOUNDATION_STAGE,
    files: Object.freeze({ [MAIN_ACTIVITY_PATH]: result }),
    inventory: Object.freeze([{ path: MAIN_ACTIVITY_PATH, sha256: sha256(result) }]),
    effects: Object.freeze({
      productSemanticOwnership: false,
      actionContractMutation: false,
      stateOwnerMutation: false,
      homeEffect: false,
      networkEffect: false,
      modelEffect: false,
      pairingEffect: false,
      automationBackdoor: false,
      nativeSemanticIdentityProjection: true,
      safeDrawingInsets: true,
      explicitSystemBarContrast: true,
    }),
  });
}
