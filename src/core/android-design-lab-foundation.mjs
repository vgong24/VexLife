import crypto from 'node:crypto';

export const ANDROID_DESIGN_LAB_SCHEMA = 'vexlife.android-design-lab-foundation/v0';
export const ANDROID_DESIGN_LAB_STAGE = 'DESIGN_LAB_FIRST_VISIBLE_SLICE';
export const ACCEPTED_ANDROID_BASE = 'cade06306541d34265254c8e5efc2ae2f3b99693';
export const MAIN_ACTIVITY_PATH = 'platform/android/app/src/main/kotlin/vexlife/android/app/MainActivity.kt';
export const ACCEPTED_MAIN_ACTIVITY_SHA256 = '91636d079ea64f3bf8311f793cfa8f5db02df66a62e0ee10394ce1dadee949ce';
export const DESIGN_LAB_REGISTRY_PATH = 'blueprint/android-design-lab-registry.json';

const OUTPUT_PATHS = Object.freeze([
  MAIN_ACTIVITY_PATH,
  'platform/android/app/src/main/kotlin/vexlife/android/presentation/VexComposePrimitives.kt',
  'platform/android/app/src/main/kotlin/vexlife/android/presentation/VexDesignLabSurface.kt',
  'platform/android/app/src/test/kotlin/vexlife/android/app/DesignLabContractTest.kt',
  'platform/android/app/src/main/res/drawable/ic_vex_design_lab.xml',
  'platform/android/app/src/main/res/values/design_lab.xml',
  'platform/android/app/src/main/res/values-ja/design_lab.xml',
  'platform/android/app/src/main/res/values-zh-rCN/design_lab.xml',
]);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function quoteKotlin(value) {
  return JSON.stringify(value);
}

function xmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function validateRef(value, label) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]+$/u.test(value)) {
    throw new Error(`${label} must be one stable lowercase ref`);
  }
}

export function validateAndroidDesignLabRegistry(registry) {
  if (!registry || typeof registry !== 'object') throw new TypeError('Design Lab registry must be an object');
  if (registry.schemaVersion !== 'vexlife.android-design-lab-registry/v0') {
    throw new Error(`DESIGN_LAB_REGISTRY_SCHEMA_MISMATCH:${registry.schemaVersion}`);
  }
  if (registry.ownerRef !== 'github.issue.vexlife.783') throw new Error('DESIGN_LAB_OWNER_MISMATCH');
  if (registry.mode !== 'DEBUG_DEVELOPER_ONLY') throw new Error('DESIGN_LAB_MODE_MISMATCH');
  if (registry.doorway?.componentRef !== 'component.vexlife.action-vessel') {
    throw new Error('DESIGN_LAB_DOORWAY_COMPONENT_MISMATCH');
  }
  if (registry.doorway?.permissionRef !== 'permission.none' || registry.doorway?.effectClass !== 'PRESENTATION_LOCAL') {
    throw new Error('DESIGN_LAB_DOORWAY_EFFECT_WIDENED');
  }
  validateRef(registry.registryRef, 'registryRef');
  validateRef(registry.surfaceRef, 'surfaceRef');
  validateRef(registry.presentationRef, 'presentationRef');
  validateRef(registry.doorway.elementRef, 'doorway.elementRef');
  validateRef(registry.doorway.actionRef, 'doorway.actionRef');
  if (!Array.isArray(registry.sections) || registry.sections.length !== 4) {
    throw new Error('DESIGN_LAB_SECTION_SET_MISMATCH');
  }
  const expectedSections = [
    'section.vexlife.design-lab.play',
    'section.vexlife.design-lab.building-blocks',
    'section.vexlife.design-lab.tokens-themes',
    'section.vexlife.design-lab.inspect',
  ];
  if (registry.sections.map((item) => item.sectionRef).join('\n') !== expectedSections.join('\n')) {
    throw new Error('DESIGN_LAB_SECTION_IDENTITY_MISMATCH');
  }
  const currentSections = registry.sections.filter((item) => item.state === 'CURRENT');
  if (currentSections.length !== 1 || currentSections[0].sectionRef !== expectedSections[1]) {
    throw new Error('DESIGN_LAB_CURRENT_SECTION_MISMATCH');
  }
  if (!Array.isArray(registry.specimens) || registry.specimens.length !== 1) {
    throw new Error('DESIGN_LAB_FIRST_SLICE_SPECIMEN_COUNT_MISMATCH');
  }
  const specimen = registry.specimens[0];
  if (specimen.specimenRef !== 'specimen.vexlife.design-lab.vex-button.001') {
    throw new Error('DESIGN_LAB_SPECIMEN_IDENTITY_MISMATCH');
  }
  if (specimen.permissionRef !== 'permission.none' || specimen.effectClass !== 'LOCAL_FIXTURE') {
    throw new Error('DESIGN_LAB_SPECIMEN_EFFECT_WIDENED');
  }
  for (const field of ['homeEffect', 'networkEffect', 'pairingEffect', 'modelEffect', 'keyEffect', 'memoryEffect', 'trainingEffect', 'persistentThemeMutation', 'publicationAuthority']) {
    if (registry.authority?.[field] !== false) throw new Error(`DESIGN_LAB_AUTHORITY_WIDENED:${field}`);
  }
  for (const locale of ['en', 'ja', 'zh-rCN']) {
    const strings = registry.localizations?.[locale];
    if (!strings || typeof strings !== 'object') throw new Error(`DESIGN_LAB_LOCALIZATION_MISSING:${locale}`);
    for (const key of Object.keys(registry.localizations.en)) {
      if (typeof strings[key] !== 'string' || strings[key].length === 0) {
        throw new Error(`DESIGN_LAB_LOCALIZATION_KEY_MISSING:${locale}:${key}`);
      }
    }
  }
  return Object.freeze({ state: 'PASS', registryRef: registry.registryRef });
}

export function validateAcceptedMainActivityPreimage(source) {
  if (typeof source !== 'string') throw new TypeError('MainActivity source must be a string');
  const observedSha256 = sha256(source);
  if (observedSha256 !== ACCEPTED_MAIN_ACTIVITY_SHA256) {
    throw new Error(`DESIGN_LAB_MAIN_ACTIVITY_PREIMAGE_DRIFT:${observedSha256}`);
  }
  return Object.freeze({ state: 'PASS', path: MAIN_ACTIVITY_PATH, sha256: observedSha256 });
}

function renderMainActivity(source) {
  validateAcceptedMainActivityPreimage(source);
  return `package vexlife.android.app

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
`;
}

function renderVexComposePrimitives() {
  return `package vexlife.android.presentation

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Button
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag

@Composable
fun VexButton(
    semanticRef: String,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Button(
        onClick = onClick,
        modifier = modifier.testTag(semanticRef),
    ) { Text(label) }
}

@Composable
fun VexFab(
    elementRef: String,
    actionRef: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Box(modifier = modifier.testTag(elementRef)) {
        FloatingActionButton(
            onClick = onClick,
            modifier = Modifier.testTag(actionRef),
        ) { content() }
    }
}
`;
}

function renderDesignLabSurface(registry) {
  const specimen = registry.specimens[0];
  const sectionEntries = registry.sections.map((section) =>
    `        DesignLabSectionSpec(${quoteKotlin(section.sectionRef)}, R.string.${section.labelStringRef}, ${section.state === 'CURRENT'}),`
  ).join('\n');
  return `package vexlife.android.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import vexlife.android.app.R

object VexDesignLabRefs {
    const val REGISTRY_REF: String = ${quoteKotlin(registry.registryRef)}
    const val SURFACE_REF: String = ${quoteKotlin(registry.surfaceRef)}
    const val PRESENTATION_REF: String = ${quoteKotlin(registry.presentationRef)}
    const val DOORWAY_COMPONENT_REF: String = ${quoteKotlin(registry.doorway.componentRef)}
    const val DOORWAY_ELEMENT_REF: String = ${quoteKotlin(registry.doorway.elementRef)}
    const val DOORWAY_ACTION_REF: String = ${quoteKotlin(registry.doorway.actionRef)}
    const val SPECIMEN_REF: String = ${quoteKotlin(specimen.specimenRef)}
    const val BUTTON_COMPONENT_REF: String = ${quoteKotlin(specimen.componentRef)}
    const val BUTTON_ELEMENT_REF: String = ${quoteKotlin(specimen.elementRef)}
    const val BUTTON_ACTION_REF: String = ${quoteKotlin(specimen.actionRef)}
    const val OUTPUT_CONSOLE_ELEMENT_REF: String = ${quoteKotlin(registry.outputConsole.elementRef)}
    const val OUTPUT_RESULT: String = ${quoteKotlin(registry.outputConsole.result)}
    const val PRESENTATION_EVENT: String = ${quoteKotlin(registry.outputConsole.presentationEvent)}
}

data class VexDesignLabReceipt(
    val actionRequested: Boolean,
    val elementRef: String,
    val actionRef: String,
    val itemRefOrNull: String?,
    val operationRefOrNull: String?,
    val preRevision: Int,
    val result: String,
    val postRevision: Int,
    val presentationEvent: String,
)

fun nextVexButtonReceipt(preRevision: Int): VexDesignLabReceipt =
    VexDesignLabReceipt(
        actionRequested = true,
        elementRef = VexDesignLabRefs.BUTTON_ELEMENT_REF,
        actionRef = VexDesignLabRefs.BUTTON_ACTION_REF,
        itemRefOrNull = null,
        operationRefOrNull = null,
        preRevision = preRevision,
        result = VexDesignLabRefs.OUTPUT_RESULT,
        postRevision = preRevision + 1,
        presentationEvent = VexDesignLabRefs.PRESENTATION_EVENT,
    )

private data class DesignLabSectionSpec(
    val sectionRef: String,
    val labelRes: Int,
    val current: Boolean,
)

private val designLabSections = listOf(
${sectionEntries}
)

@Composable
fun VexDesignLabDoorwayFab(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    VexFab(
        elementRef = VexDesignLabRefs.DOORWAY_ELEMENT_REF,
        actionRef = VexDesignLabRefs.DOORWAY_ACTION_REF,
        onClick = onClick,
        modifier = modifier,
    ) {
        Icon(
            painter = painterResource(R.drawable.ic_vex_design_lab),
            contentDescription = stringResource(R.string.design_lab_open),
        )
    }
}

@Composable
fun VexDesignLabSurface(onClose: () -> Unit) {
    var revision by remember { mutableIntStateOf(0) }
    var receipt by remember { mutableStateOf<VexDesignLabReceipt?>(null) }

    Surface(
        modifier = Modifier
            .fillMaxSize()
            .testTag(VexDesignLabRefs.PRESENTATION_REF),
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(20.dp),
            modifier = Modifier
                .safeDrawingPadding()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
        ) {
            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = stringResource(R.string.design_lab_title),
                    style = MaterialTheme.typography.headlineMedium,
                )
                TextButton(onClick = onClose) {
                    Text(stringResource(R.string.design_lab_close))
                }
            }

            designLabSections.forEach { section ->
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.testTag(section.sectionRef),
                ) {
                    Text(
                        text = stringResource(section.labelRes),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    if (section.current) {
                        Text(
                            text = stringResource(R.string.design_lab_vex_button),
                            style = MaterialTheme.typography.titleSmall,
                        )
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag(VexDesignLabRefs.BUTTON_ELEMENT_REF),
                        ) {
                            Column(
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.padding(16.dp),
                            ) {
                                VexButton(
                            semanticRef = VexDesignLabRefs.BUTTON_ACTION_REF,
                            label = stringResource(R.string.design_lab_vex_button_action),
                            onClick = {
                                val next = nextVexButtonReceipt(revision)
                                revision = next.postRevision
                                receipt = next
                            },
                                )
                            }
                        }
                        OutputConsole(receipt)
                    } else {
                        Text(
                            text = stringResource(R.string.design_lab_held_later),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun OutputConsole(receipt: VexDesignLabReceipt?) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag(VexDesignLabRefs.OUTPUT_CONSOLE_ELEMENT_REF),
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.padding(16.dp),
        ) {
            Text(
                text = stringResource(R.string.design_lab_output_console),
                style = MaterialTheme.typography.titleSmall,
            )
            if (receipt == null) {
                Text(stringResource(R.string.design_lab_output_waiting))
            } else {
                Text("${'$'}{stringResource(R.string.design_lab_output_action_requested)}=${'$'}{receipt.actionRequested}")
                Text("${'$'}{stringResource(R.string.design_lab_output_element)}=${'$'}{receipt.elementRef}")
                Text("${'$'}{stringResource(R.string.design_lab_output_action)}=${'$'}{receipt.actionRef}")
                Text("${'$'}{stringResource(R.string.design_lab_output_pre_revision)}=${'$'}{receipt.preRevision}")
                Text("${'$'}{stringResource(R.string.design_lab_output_result)}=${'$'}{receipt.result}")
                Text("${'$'}{stringResource(R.string.design_lab_output_post_revision)}=${'$'}{receipt.postRevision}")
                Text("${'$'}{stringResource(R.string.design_lab_output_presentation_event)}=${'$'}{receipt.presentationEvent}")
            }
        }
    }
}
`;
}

function renderKotlinTest() {
  return `package vexlife.android.app

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
`;
}

function renderIcon() {
  return `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="@android:color/transparent"
        android:pathData="M7,4 L10,4 L10,9 L6,16 C5.2,17.4 6.2,20 8.2,20 L15.8,20 C17.8,20 18.8,17.4 18,16 L14,9 L14,4 L17,4"
        android:strokeColor="#FFFFFFFF"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:strokeWidth="2" />
    <path
        android:fillColor="@android:color/transparent"
        android:pathData="M8,15 L16,15"
        android:strokeColor="#FFFFFFFF"
        android:strokeLineCap="round"
        android:strokeWidth="2" />
</vector>
`;
}

function renderStrings(strings) {
  const body = Object.entries(strings)
    .map(([name, value]) => `    <string name="${name}">${xmlEscape(value)}</string>`)
    .join('\n');
  return `<resources>\n${body}\n</resources>\n`;
}

export function renderAndroidDesignLabFoundation(mainActivitySource, registry) {
  validateAcceptedMainActivityPreimage(mainActivitySource);
  validateAndroidDesignLabRegistry(registry);
  const files = Object.freeze({
    [MAIN_ACTIVITY_PATH]: renderMainActivity(mainActivitySource),
    'platform/android/app/src/main/kotlin/vexlife/android/presentation/VexComposePrimitives.kt': renderVexComposePrimitives(),
    'platform/android/app/src/main/kotlin/vexlife/android/presentation/VexDesignLabSurface.kt': renderDesignLabSurface(registry),
    'platform/android/app/src/test/kotlin/vexlife/android/app/DesignLabContractTest.kt': renderKotlinTest(),
    'platform/android/app/src/main/res/drawable/ic_vex_design_lab.xml': renderIcon(),
    'platform/android/app/src/main/res/values/design_lab.xml': renderStrings(registry.localizations.en),
    'platform/android/app/src/main/res/values-ja/design_lab.xml': renderStrings(registry.localizations.ja),
    'platform/android/app/src/main/res/values-zh-rCN/design_lab.xml': renderStrings(registry.localizations['zh-rCN']),
  });
  return Object.freeze({
    schemaVersion: ANDROID_DESIGN_LAB_SCHEMA,
    stage: ANDROID_DESIGN_LAB_STAGE,
    registryRef: registry.registryRef,
    files,
    inventory: Object.freeze(OUTPUT_PATHS.map((path) => ({ path, sha256: sha256(files[path]) }))),
    effects: Object.freeze({
      debugDeveloperOnly: true,
      productSemanticOwnership: false,
      externalEffectAuthority: false,
      homeEffect: false,
      networkEffect: false,
      modelEffect: false,
      pairingEffect: false,
      persistentThemeMutation: false,
      firstVexButtonSpecimen: true,
      boundedOutputConsole: true,
    }),
  });
}

export { OUTPUT_PATHS };
