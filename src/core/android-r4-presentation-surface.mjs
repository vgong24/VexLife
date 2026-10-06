import crypto from 'node:crypto';
import { projectAndroidRemoteVessel } from './android-remote-vessel-projection.mjs';

export const ANDROID_R4_PRESENTATION_SCHEMA = 'vexlife.android-r4-presentation-surface/v0';
export const ANDROID_R4_PRESENTATION_STAGE = 'R4_ANDROID_REMOTE_VESSEL_NATIVE_REFERENCE_SURFACE';
export const PRESENTATION_REF = 'presentation.vexlife.security-access.android-remote-vessel';
export const PRESENTATION_KIND = 'READ_ONLY_REMOTE_VESSEL_STATUS';
export const ANDROID_REMOTE_VESSEL_REGISTRY_REF = 'registry.vexlife.android-remote-vessel.001';
export const HOME_BRIDGE_REF = 'bridge.vexlife.personal-home.001';
export const REFERENCE_STATE = 'UNPAIRED';
export const CANONICAL_WRITER = 'DESKTOP_HOME_NODE';

const TITLE_STRING_REF = 'security-access.android-first';
const STATUS_STRING_REF = 'security-access.status.backend-unavailable';
const PRESENTATION_GRAPH_SCHEMA = 'vexlife.presentation-graph-registry/v1';
const PRESENTATION_GRAPH_REGISTRY_REF = 'registry.vexlife.presentation-graph.001';
const PRESENTATION_GRAPH_VERSION = 11;
const SECURITY_ACCESS_REGISTRY_REF = 'registry.vexlife.security-access-preview.001';
const REQUIRED_PRESENTATION_OBLIGATIONS = Object.freeze([
  'ANDROID_REMOTE_VESSEL_PRESENTATION_BOUND',
  'READ_ONLY_REMOTE_VESSEL_STATUS_ONLY',
  'PRODUCT_SEMANTIC_OWNERSHIP_FALSE',
  'REFERENCE_DEFAULT_UNPAIRED',
  'CANONICAL_WRITER_DESKTOP_HOME_NODE',
  'REMOTE_WRITER_GRANTED_FALSE',
  'PAIRING_AUTHENTICATION_AUTHORIZATION_REMAIN_DISTINCT_AND_UNGRANTED',
  'CAPABILITY_LEASE_EFFECT_FALSE',
  'TRANSPORT_AND_NETWORK_EFFECT_FALSE',
  'HOME_AND_MEMORY_EFFECT_FALSE',
  'CREDENTIAL_EFFECT_FALSE',
  'MODEL_RUNTIME_EFFECT_FALSE',
  'RAW_MODEL_ENDPOINT_EXPOSED_FALSE',
  'PUBLICATION_EFFECT_FALSE',
  'NO_NEW_ROUTE_OR_ACTION',
]);

export const R2_BASE_FILES = Object.freeze({"platform/android/README.md":"# VexLife Android R2 project skeleton\n\n[VXG RealForever]\n\nThis is the first durable Android app/module adoption generated under the accepted\npre-R2 runtime architecture baseline.\n\n```text\narchitectureBaselineRef=architecture.vexlife.android-runtime.pre-r2.r1\\nsourceBlueprint=blueprint.vexlife.universal.001@0.4.0-foundation-rc1\\nsourceMappingRef=mapping.vexlife.android-construction.r2.durable-project-skeleton\\nconstructionBlueprintSha256=e78c85ece2fae6072ecc9b489d16a7ad4890e6cfb1cd52e456ab45bf626e8927\\nsourceA4IdentityFingerprint=6aef8e047a19dad7311f2e2923f3ac9ea013d25ac4f6f86cc384191f69b1bb8a\\na5CompilerRef=compiler.vexlife.android-test-evidence.r2.durable-project-skeleton\\na5SemanticFingerprint=067f263841c831c55abce6822abbba3dad0cb8c95072fa4d03fca7ebbdf14704\n```\n\nThe application ID `com.vextreme.vexlife.r2` and minSdk 23 are bounded R2 build\nchoices, not a public release identity or permanent support floor.\n\nPermanent boundaries:\n\n```text\nVIEWMODEL != PRODUCT_STATE_OWNER\nWORKER != SEMANTIC_OWNER\nANDROID_SERVICE != DOMAIN_RUNTIME\nREPOSITORY != STATE_OWNER_BY_DEFAULT\nCOROUTINE != OPERATION\nOPERATION_IDENTITY != ATTEMPT_IDENTITY\nSTATEFLOW != EVENT_LEDGER\nDEPENDENCY_GRAPH != DI_FRAMEWORK\nCAPABILITY != AUTHORITY\nCODE_SYMBOL != SERIAL_NAME != SEMANTIC_FIELD_REF != HUMAN_LABEL\n```\n\nR2 intentionally has no INTERNET permission, Home/model/network integration,\ndurable operation store, WorkManager topology, Hilt/Koin choice, Current Context\nadapter, resource arbiter, external bridge, signing, installation, or publication.\n","platform/android/app/src/main/kotlin/vexlife/android/app/MainActivity.kt":"package vexlife.android.app\n\nimport android.os.Bundle\nimport androidx.activity.ComponentActivity\nimport androidx.activity.compose.setContent\nimport androidx.compose.foundation.layout.Arrangement\nimport androidx.compose.foundation.layout.Column\nimport androidx.compose.foundation.layout.fillMaxSize\nimport androidx.compose.foundation.layout.padding\nimport androidx.compose.material3.Button\nimport androidx.compose.material3.MaterialTheme\nimport androidx.compose.material3.Surface\nimport androidx.compose.material3.Text\nimport androidx.compose.runtime.Composable\nimport androidx.compose.runtime.collectAsState\nimport androidx.compose.runtime.getValue\nimport androidx.compose.ui.Modifier\nimport androidx.compose.ui.platform.testTag\nimport androidx.compose.ui.res.stringResource\nimport androidx.compose.ui.unit.dp\nimport androidx.lifecycle.ViewModelProvider\nimport vexlife.android.identity.GeneratedCanonicalRefs\nimport vexlife.android.architecture.SemanticRef\nimport vexlife.android.architecture.VexRuntimeWitness\n\nclass MainActivity : ComponentActivity() {\n    private val compositionRoot by lazy { VexCompositionRoot() }\n\n    override fun onCreate(savedInstanceState: Bundle?) {\n        super.onCreate(savedInstanceState)\n        val viewModel = ViewModelProvider(\n            this,\n            compositionRoot.viewModelFactory(),\n        )[VexAppViewModel::class.java]\n        setContent { MaterialTheme { R2Witness(viewModel) } }\n    }\n}\n\n@Composable\nprivate fun R2Witness(viewModel: VexAppViewModel) {\n    val view by viewModel.viewState.collectAsState()\n    Surface(Modifier.fillMaxSize()) {\n        Column(\n            verticalArrangement = Arrangement.spacedBy(16.dp),\n            modifier = Modifier.padding(24.dp),\n        ) {\n            Text(\n                stringResource(R.string.r2_architecture_title),\n                style = MaterialTheme.typography.headlineSmall,\n                modifier = Modifier.testTag(GeneratedCanonicalRefs.architectureTitleElement.value),\n            )\n            Text(statusText(view.statusRef), Modifier.testTag(view.testRef.value))\n            Button(\n                onClick = viewModel::requestConversationAttention,\n                modifier = Modifier.testTag(GeneratedCanonicalRefs.requestAttentionAction.value),\n            ) { Text(stringResource(R.string.r2_request_attention)) }\n        }\n    }\n}\n\n@Composable\nprivate fun statusText(statusRef: SemanticRef): String =\n    if (statusRef.value == VexRuntimeWitness.STATUS_ATTENTION_ADMITTED) {\n        stringResource(R.string.r2_attention_admitted)\n    } else {\n        stringResource(R.string.r2_ready)\n    }\n","platform/android/app/src/main/kotlin/vexlife/android/identity/GeneratedCanonicalRefs.kt":"package vexlife.android.identity\n\nimport vexlife.android.architecture.SemanticRef\n\nobject GeneratedCanonicalRefs {\n    const val ARCHITECTURE_BASELINE_REF: String = \"architecture.vexlife.android-runtime.pre-r2.r1\"\n    const val SOURCE_A4_IDENTITY_FINGERPRINT: String = \"6aef8e047a19dad7311f2e2923f3ac9ea013d25ac4f6f86cc384191f69b1bb8a\"\n    const val A5_SEMANTIC_FINGERPRINT: String = \"067f263841c831c55abce6822abbba3dad0cb8c95072fa4d03fca7ebbdf14704\"\n\n    val architectureSurface = SemanticRef(\"surface.vexlife.android.r2.architecture\")\n    val architectureTitleElement = SemanticRef(\"element.vexlife.android.r2.architecture.title\")\n    val requestAttentionAction = SemanticRef(\"action.vexlife.conversation.request-attention\")\n    val statusElement = SemanticRef(\"element.vexlife.android.r2.architecture.status\")\n    val localPrincipal = SemanticRef(\"principal.vexlife.android.r2.local\")\n    val presentationSession = SemanticRef(\"session.vexlife.android.r2.presentation\")\n}\n","platform/android/app/src/main/res/values/vexlife_r2.xml":"<resources>\n    <string name=\"app_name\">VexLife</string>\n    <string name=\"r2_architecture_title\">Android Runtime Architecture</string>\n    <string name=\"r2_ready\">R2 architecture skeleton ready</string>\n    <string name=\"r2_request_attention\">Request conversation attention</string>\n    <string name=\"r2_attention_admitted\">Attention request admitted locally</string>\n</resources>\n","platform/android/app/src/main/res/values-ja/vexlife_r2.xml":"<resources>\n    <string name=\"app_name\">VexLife</string>\n    <string name=\"r2_architecture_title\">Android ランタイム アーキテクチャ</string>\n    <string name=\"r2_ready\">R2 アーキテクチャ スケルトンは準備完了です</string>\n    <string name=\"r2_request_attention\">会話への注意をリクエスト</string>\n    <string name=\"r2_attention_admitted\">注意リクエストをローカルで受理しました</string>\n</resources>\n","platform/android/app/src/main/res/values-zh-rCN/vexlife_r2.xml":"<resources>\n    <string name=\"app_name\">VexLife</string>\n    <string name=\"r2_architecture_title\">Android 运行时架构</string>\n    <string name=\"r2_ready\">R2 架构骨架已就绪</string>\n    <string name=\"r2_request_attention\">请求关注会话</string>\n    <string name=\"r2_attention_admitted\">关注请求已在本地受理</string>\n</resources>\n"});
export const R2_BASE_PREIMAGE_SHA256 = Object.freeze({"platform/android/README.md":"d138608d271609b36eb44e7c02d69d4ac69e84b0003792af3e03132e44bfaadc","platform/android/app/src/main/kotlin/vexlife/android/app/MainActivity.kt":"344e5272b7b16eb95a2567c246fd7d788168894bcbedb54990d6b0899efef9bd","platform/android/app/src/main/kotlin/vexlife/android/identity/GeneratedCanonicalRefs.kt":"b0986d068be9808a8b92aaa29d9b208457caa8ab757b4a53947369e835c5ca79","platform/android/app/src/main/res/values/vexlife_r2.xml":"f6c80d67cdc8a49e268278071347baeeeeb3be7e8853e119e99c8147af369359","platform/android/app/src/main/res/values-ja/vexlife_r2.xml":"52f60679eb62ac40936b4638fc73f9115f6cfca1cb9075cdfacc2b831ff8a486","platform/android/app/src/main/res/values-zh-rCN/vexlife_r2.xml":"5f4c28bfc2bb2947d0daa2f4d08d372a289fca8c67969ac901221e6ac66db15f"});

export const ANDROID_R4_OUTPUT_PATHS = Object.freeze([
  'platform/android/README.md',
  'platform/android/app/src/main/kotlin/vexlife/android/app/MainActivity.kt',
  'platform/android/app/src/main/kotlin/vexlife/android/identity/GeneratedCanonicalRefs.kt',
  'platform/android/app/src/main/kotlin/vexlife/android/presentation/AndroidRemoteVesselSurface.kt',
  'platform/android/app/src/test/kotlin/vexlife/android/app/R4PresentationContractTest.kt',
  'platform/android/app/src/main/res/values/vexlife_r2.xml',
  'platform/android/app/src/main/res/values-ja/vexlife_r2.xml',
  'platform/android/app/src/main/res/values-zh-rCN/vexlife_r2.xml',
]);

const R4_NEW_PATHS = Object.freeze([
  'platform/android/app/src/main/kotlin/vexlife/android/presentation/AndroidRemoteVesselSurface.kt',
  'platform/android/app/src/test/kotlin/vexlife/android/app/R4PresentationContractTest.kt',
]);

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}
function exact(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} must equal ${String(expected)}`);
}
function requiredString(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function clone(value) { return structuredClone(value); }
function escapeKotlin(value) { return JSON.stringify(String(value)); }
function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}
function replaceExactlyOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  if (first < 0 || source.indexOf(find, first + find.length) >= 0) throw new Error(`${label} expected exactly one replacement target`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}
function findUnique(records, predicate, label) {
  const matches = (Array.isArray(records) ? records : []).filter(predicate);
  if (matches.length !== 1) throw new Error(`${label} must resolve exactly once; found ${matches.length}`);
  return matches[0];
}
function validateLocale(catalog, locale) {
  object(catalog, `localizationCatalogs.${locale}`);
  return {
    title: requiredString(catalog[TITLE_STRING_REF], `${locale}.${TITLE_STRING_REF}`),
    status: requiredString(catalog[STATUS_STRING_REF], `${locale}.${STATUS_STRING_REF}`),
  };
}

export function validateAndroidR4PresentationSources({
  presentationGraph,
  androidRemoteVesselRegistry,
  homeBridgeRegistry,
  securityAccessPreviewRegistry,
  localizationCatalogs,
} = {}) {
  object(presentationGraph, 'presentationGraph');
  exact(presentationGraph.schemaVersion, PRESENTATION_GRAPH_SCHEMA, 'presentationGraph.schemaVersion');
  exact(presentationGraph.registryRef, PRESENTATION_GRAPH_REGISTRY_REF, 'presentationGraph.registryRef');
  exact(presentationGraph.registryVersion, PRESENTATION_GRAPH_VERSION, 'presentationGraph.registryVersion');
  exact(presentationGraph.effects, false, 'presentationGraph.effects');

  const node = findUnique(
    presentationGraph.presentationNodes,
    (item) => item?.presentationRef === PRESENTATION_REF,
    'Android Remote Vessel presentation node',
  );
  exact(node.presentationKind, PRESENTATION_KIND, 'presentationNode.presentationKind');
  exact(node.productSemanticOwnership, false, 'presentationNode.productSemanticOwnership');
  exact(node.referenceState, REFERENCE_STATE, 'presentationNode.referenceState');
  exact(node.canonicalWriter, CANONICAL_WRITER, 'presentationNode.canonicalWriter');
  exact(node.remoteWriterGranted, false, 'presentationNode.remoteWriterGranted');
  exact(node.rawModelEndpointExposed, false, 'presentationNode.rawModelEndpointExposed');

  const obligation = findUnique(
    presentationGraph.testObligations,
    (item) => item?.targetRef === PRESENTATION_REF,
    'Android Remote Vessel presentation obligation',
  );
  const requirements = new Set(Array.isArray(obligation.requires) ? obligation.requires : []);
  for (const required of REQUIRED_PRESENTATION_OBLIGATIONS) {
    if (!requirements.has(required)) throw new Error(`presentation obligation missing ${required}`);
  }

  object(androidRemoteVesselRegistry, 'androidRemoteVesselRegistry');
  exact(androidRemoteVesselRegistry.registryRef, ANDROID_REMOTE_VESSEL_REGISTRY_REF, 'androidRemoteVesselRegistry.registryRef');
  exact(androidRemoteVesselRegistry.projection?.targetPlatformRef, 'platform.android', 'androidRemoteVesselRegistry.projection.targetPlatformRef');
  exact(androidRemoteVesselRegistry.browserRuntimeState, REFERENCE_STATE, 'androidRemoteVesselRegistry.browserRuntimeState');

  object(homeBridgeRegistry, 'homeBridgeRegistry');
  exact(homeBridgeRegistry.bridgeRef, HOME_BRIDGE_REF, 'homeBridgeRegistry.bridgeRef');

  object(securityAccessPreviewRegistry, 'securityAccessPreviewRegistry');
  exact(securityAccessPreviewRegistry.registryRef, SECURITY_ACCESS_REGISTRY_REF, 'securityAccessPreviewRegistry.registryRef');
  exact(securityAccessPreviewRegistry.androidRemoteVesselRegistryRef, ANDROID_REMOTE_VESSEL_REGISTRY_REF, 'securityAccessPreviewRegistry.androidRemoteVesselRegistryRef');
  exact(securityAccessPreviewRegistry.androidRemoteVesselProjectionRef, node.sourceRef, 'securityAccessPreviewRegistry.androidRemoteVesselProjectionRef');

  const projection = projectAndroidRemoteVessel(androidRemoteVesselRegistry, homeBridgeRegistry);
  exact(projection.connectionState, REFERENCE_STATE, 'projection.connectionState');
  exact(projection.canonicalWriter, CANONICAL_WRITER, 'projection.canonicalWriter');
  exact(projection.remoteWriterGranted, false, 'projection.remoteWriterGranted');
  exact(projection.activeHomeAccess, false, 'projection.activeHomeAccess');
  exact(projection.rawModelEndpointExposed, false, 'projection.rawModelEndpointExposed');
  if (Object.values(projection.effects).some((value) => value !== false)) throw new Error('projection effects must all remain false');

  object(localizationCatalogs, 'localizationCatalogs');
  const locales = {
    en: validateLocale(localizationCatalogs.en, 'en'),
    ja: validateLocale(localizationCatalogs.ja, 'ja'),
    zh: validateLocale(localizationCatalogs.zh, 'zh'),
  };

  return Object.freeze({ node: clone(node), obligation: clone(obligation), projection: clone(projection), locales });
}

function renderReadme(base) {
  return `${base}\n## R4 — native Android Remote Vessel reference surface\n\nR4 projects the accepted Android Remote Vessel reference into the native Compose host without\ncreating pairing, authentication, authorization, Home, network, credential or model authority.\n\n\`\`\`text\npresentationRef=${PRESENTATION_REF}\nreferenceState=${REFERENCE_STATE}\ncanonicalWriter=${CANONICAL_WRITER}\nremoteWriterGranted=false\nproductSemanticOwnership=false\nphysicalDeviceEffect=false\n\`\`\`\n\nThe surface is presentation-only: it has no action callback, route, network adapter, Home adapter,\nor mutable product-state owner. The accepted A2 StateFlow projection and R2 runtime ownership\nboundaries remain unchanged.\n`;
}

function renderMainActivity(base) {
  let result = replaceExactlyOnce(
    base,
    'import vexlife.android.identity.GeneratedCanonicalRefs\n',
    'import vexlife.android.identity.GeneratedCanonicalRefs\nimport vexlife.android.presentation.AndroidRemoteVesselSurface\n',
    'MainActivity import',
  );
  result = replaceExactlyOnce(
    result,
    '            Text(statusText(view.statusRef), Modifier.testTag(view.testRef.value))\n',
    '            Text(statusText(view.statusRef), Modifier.testTag(view.testRef.value))\n            AndroidRemoteVesselSurface()\n',
    'MainActivity surface insertion',
  );
  return result;
}

function renderCanonicalRefs(base) {
  const addition = `\n    const val REMOTE_VESSEL_PRESENTATION_REF: String = ${escapeKotlin(PRESENTATION_REF)}\n    const val REMOTE_VESSEL_REGISTRY_REF: String = ${escapeKotlin(ANDROID_REMOTE_VESSEL_REGISTRY_REF)}\n    const val REMOTE_VESSEL_HOME_BRIDGE_REF: String = ${escapeKotlin(HOME_BRIDGE_REF)}\n    const val REMOTE_VESSEL_REFERENCE_STATE: String = ${escapeKotlin(REFERENCE_STATE)}\n    const val REMOTE_VESSEL_CANONICAL_WRITER: String = ${escapeKotlin(CANONICAL_WRITER)}\n\n    val remoteVesselPresentation = SemanticRef(REMOTE_VESSEL_PRESENTATION_REF)\n    val remoteVesselTitleElement = SemanticRef("element.vexlife.android.remote-vessel.title")\n    val remoteVesselStatusElement = SemanticRef("element.vexlife.android.remote-vessel.status")\n`;
  return replaceExactlyOnce(base, '\n}\n', `${addition}}\n`, 'GeneratedCanonicalRefs closing brace');
}

function renderStrings(base, title, status) {
  const addition = `    <string name="r4_remote_vessel_title">${xml(title)}</string>\n    <string name="r4_remote_vessel_status">${xml(status)}</string>\n`;
  return replaceExactlyOnce(base, '</resources>\n', `${addition}</resources>\n`, 'Android string resources');
}

function renderSurfaceKotlin() {
  return `package vexlife.android.presentation\n\nimport androidx.compose.foundation.layout.Arrangement\nimport androidx.compose.foundation.layout.Column\nimport androidx.compose.material3.MaterialTheme\nimport androidx.compose.material3.Text\nimport androidx.compose.runtime.Composable\nimport androidx.compose.ui.Modifier\nimport androidx.compose.ui.platform.testTag\nimport androidx.compose.ui.res.stringResource\nimport androidx.compose.ui.unit.dp\nimport vexlife.android.app.R\nimport vexlife.android.identity.GeneratedCanonicalRefs\n\nobject AndroidRemoteVesselReferenceContract {\n    const val PRESENTATION_REF: String = ${escapeKotlin(PRESENTATION_REF)}\n    const val REGISTRY_REF: String = ${escapeKotlin(ANDROID_REMOTE_VESSEL_REGISTRY_REF)}\n    const val HOME_BRIDGE_REF: String = ${escapeKotlin(HOME_BRIDGE_REF)}\n    const val REFERENCE_STATE: String = ${escapeKotlin(REFERENCE_STATE)}\n    const val CANONICAL_WRITER: String = ${escapeKotlin(CANONICAL_WRITER)}\n    const val REMOTE_WRITER_GRANTED: Boolean = false\n    const val PRODUCT_SEMANTIC_OWNERSHIP: Boolean = false\n    const val ACTIVE_HOME_ACCESS: Boolean = false\n    const val RAW_MODEL_ENDPOINT_EXPOSED: Boolean = false\n    const val EFFECT_AUTHORITY_GRANTED: Boolean = false\n}\n\n@Composable\nfun AndroidRemoteVesselSurface() {\n    Column(\n        verticalArrangement = Arrangement.spacedBy(4.dp),\n        modifier = Modifier.testTag(GeneratedCanonicalRefs.remoteVesselPresentation.value),\n    ) {\n        Text(\n            text = stringResource(R.string.r4_remote_vessel_title),\n            style = MaterialTheme.typography.titleMedium,\n            modifier = Modifier.testTag(GeneratedCanonicalRefs.remoteVesselTitleElement.value),\n        )\n        Text(\n            text = stringResource(R.string.r4_remote_vessel_status),\n            style = MaterialTheme.typography.bodyMedium,\n            modifier = Modifier.testTag(GeneratedCanonicalRefs.remoteVesselStatusElement.value),\n        )\n    }\n}\n`;
}

function renderKotlinTest() {
  return `package vexlife.android.app\n\nimport org.junit.Assert.assertEquals\nimport org.junit.Assert.assertFalse\nimport org.junit.Test\nimport vexlife.android.identity.GeneratedCanonicalRefs\nimport vexlife.android.presentation.AndroidRemoteVesselReferenceContract\n\nclass R4PresentationContractTest {\n    @Test fun remoteVesselReferenceKeepsCanonicalIdentityAndNoEffectBoundary() {\n        assertEquals(\n            AndroidRemoteVesselReferenceContract.PRESENTATION_REF,\n            GeneratedCanonicalRefs.remoteVesselPresentation.value,\n        )\n        assertEquals("UNPAIRED", AndroidRemoteVesselReferenceContract.REFERENCE_STATE)\n        assertEquals("DESKTOP_HOME_NODE", AndroidRemoteVesselReferenceContract.CANONICAL_WRITER)\n        assertFalse(AndroidRemoteVesselReferenceContract.REMOTE_WRITER_GRANTED)\n        assertFalse(AndroidRemoteVesselReferenceContract.PRODUCT_SEMANTIC_OWNERSHIP)\n        assertFalse(AndroidRemoteVesselReferenceContract.ACTIVE_HOME_ACCESS)\n        assertFalse(AndroidRemoteVesselReferenceContract.RAW_MODEL_ENDPOINT_EXPOSED)\n        assertFalse(AndroidRemoteVesselReferenceContract.EFFECT_AUTHORITY_GRANTED)\n    }\n\n    @Test fun localizedHumanLabelsRemainSeparateFromSemanticRefs() {\n        assertEquals(${escapeKotlin(PRESENTATION_REF)}, GeneratedCanonicalRefs.REMOTE_VESSEL_PRESENTATION_REF)\n        assertEquals(${escapeKotlin(ANDROID_REMOTE_VESSEL_REGISTRY_REF)}, GeneratedCanonicalRefs.REMOTE_VESSEL_REGISTRY_REF)\n        assertEquals(${escapeKotlin(HOME_BRIDGE_REF)}, GeneratedCanonicalRefs.REMOTE_VESSEL_HOME_BRIDGE_REF)\n    }\n}\n`;
}

export function acceptedR2BaseFiles() { return clone(R2_BASE_FILES); }

export function validateAcceptedR2Preimages(observedFiles) {
  object(observedFiles, 'observedFiles');
  const mismatches = [];
  for (const [path, expectedSha256] of Object.entries(R2_BASE_PREIMAGE_SHA256)) {
    const observed = observedFiles[path];
    if (typeof observed !== 'string') {
      mismatches.push({ path, state: 'MISSING', expectedSha256 });
      continue;
    }
    const observedSha256 = sha256(observed);
    if (observedSha256 !== expectedSha256) mismatches.push({ path, state: 'PREIMAGE_DRIFT', expectedSha256, observedSha256 });
  }
  return Object.freeze({ state: mismatches.length ? 'FAIL' : 'PASS', mismatches: Object.freeze(mismatches.map(Object.freeze)) });
}

export function renderAndroidR4PresentationSurface(input = {}) {
  const bound = validateAndroidR4PresentationSources(input);
  const base = acceptedR2BaseFiles();
  const files = {
    'platform/android/README.md': renderReadme(base['platform/android/README.md']),
    'platform/android/app/src/main/kotlin/vexlife/android/app/MainActivity.kt': renderMainActivity(base['platform/android/app/src/main/kotlin/vexlife/android/app/MainActivity.kt']),
    'platform/android/app/src/main/kotlin/vexlife/android/identity/GeneratedCanonicalRefs.kt': renderCanonicalRefs(base['platform/android/app/src/main/kotlin/vexlife/android/identity/GeneratedCanonicalRefs.kt']),
    'platform/android/app/src/main/kotlin/vexlife/android/presentation/AndroidRemoteVesselSurface.kt': renderSurfaceKotlin(),
    'platform/android/app/src/test/kotlin/vexlife/android/app/R4PresentationContractTest.kt': renderKotlinTest(),
    'platform/android/app/src/main/res/values/vexlife_r2.xml': renderStrings(base['platform/android/app/src/main/res/values/vexlife_r2.xml'], bound.locales.en.title, bound.locales.en.status),
    'platform/android/app/src/main/res/values-ja/vexlife_r2.xml': renderStrings(base['platform/android/app/src/main/res/values-ja/vexlife_r2.xml'], bound.locales.ja.title, bound.locales.ja.status),
    'platform/android/app/src/main/res/values-zh-rCN/vexlife_r2.xml': renderStrings(base['platform/android/app/src/main/res/values-zh-rCN/vexlife_r2.xml'], bound.locales.zh.title, bound.locales.zh.status),
  };
  const paths = Object.keys(files).sort();
  if (JSON.stringify(paths) !== JSON.stringify([...ANDROID_R4_OUTPUT_PATHS].sort())) throw new Error('R4 output path set drift');
  const inventory = paths.map((path) => ({ path, bytes: Buffer.byteLength(files[path], 'utf8'), sha256: sha256(files[path]) }));
  const semanticCore = {
    schemaVersion: ANDROID_R4_PRESENTATION_SCHEMA,
    stage: ANDROID_R4_PRESENTATION_STAGE,
    presentationRef: PRESENTATION_REF,
    presentationGraphVersion: PRESENTATION_GRAPH_VERSION,
    registryRef: ANDROID_REMOTE_VESSEL_REGISTRY_REF,
    bridgeRef: HOME_BRIDGE_REF,
    referenceState: bound.projection.connectionState,
    canonicalWriter: bound.projection.canonicalWriter,
    sourceStringRefs: [TITLE_STRING_REF, STATUS_STRING_REF],
    outputInventory: inventory,
  };
  return Object.freeze({
    ...semanticCore,
    files: Object.freeze(files),
    inventory: Object.freeze(inventory.map(Object.freeze)),
    semanticFingerprint: sha256(JSON.stringify(semanticCore)),
    newPaths: [...R4_NEW_PATHS],
    effects: Object.freeze({ home: false, network: false, model: false, physicalDevice: false, publication: false }),
  });
}

// [VXG RealForever]
