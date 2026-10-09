import crypto from 'node:crypto';

export const ANDROID_NATIVE_WALK_FOUNDATION_SCHEMA = 'vexlife.android-native-walk-foundation/v0';
export const ANDROID_NATIVE_WALK_FOUNDATION_STAGE = 'NW-00_NATIVE_SEMANTIC_WALK_FOUNDATION';
export const MAIN_ACTIVITY_PATH = 'platform/android/app/src/main/kotlin/vexlife/android/app/MainActivity.kt';
export const ACCEPTED_MAIN_ACTIVITY_SHA256 = 'd88de48cb7f4306bfaaa21e8fa9824944575be71041d3c422a29dd04230239e0';

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