import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ANDROID_R2_PROJECT_SKELETON_SCHEMA = 'vexlife.android-r2-project-skeleton/v0';
export const ANDROID_R2_PROJECT_SKELETON_STAGE = 'R2_MINIMAL_GENERATED_ANDROID_PROJECT_SKELETON';
export const ANDROID_RUNTIME_ARCHITECTURE_BASELINE_REF = 'architecture.vexlife.android-runtime.pre-r2.r1';

const A4_PLAN_SCHEMA = 'vexlife.android-project-practicum/v0';
const A4_RESULT_SCHEMA = 'vexlife.android-project-practicum-result/v0';
const A4_STAGE = 'A4_MINIMAL_GENERATED_ANDROID_PROJECT_PRACTICUM';
const A5_SCHEMA = 'vexlife.android-test-evidence-obligations/v0';
const A5_STAGE = 'A5_TEST_AND_EVIDENCE_GENERATION';
const REQUIRED_A5_HELD_CLASSES = Object.freeze([
  'DURABLE_ANDROID_PROJECT_ADOPTION',
  'COMPOSE_PRESENTATION',
  'ANDROID_MANIFEST_PRODUCT_ADOPTION',
  'ANDROID_RESOURCES_PRODUCT_ADOPTION',
  'COMMAND_LINE_ANDROID_BUILD',
  'DEBUG_APK',
  'EMULATOR_OR_DEVICE_LAUNCH',
  'ACCESSIBILITY_VISUAL_PRESENTATION',
  'HOME_NETWORK_MODEL',
  'INSTALL_SIGNING_PUBLICATION',
]);

export const ANDROID_R2_GENERATED_PATHS = Object.freeze([
  'README.md',
  'settings.gradle.kts',
  'build.gradle.kts',
  'gradle/libs.versions.toml',
  'app/build.gradle.kts',
  'app/src/main/AndroidManifest.xml',
  'app/src/main/kotlin/vexlife/android/app/MainActivity.kt',
  'app/src/main/kotlin/vexlife/android/app/VexAppViewModel.kt',
  'app/src/main/kotlin/vexlife/android/app/VexCompositionRoot.kt',
  'app/src/main/kotlin/vexlife/android/architecture/VexRuntimeContracts.kt',
  'app/src/main/kotlin/vexlife/android/identity/GeneratedCanonicalRefs.kt',
  'app/src/main/res/values/vexlife_r2.xml',
  'app/src/main/res/values-ja/vexlife_r2.xml',
  'app/src/main/res/values-zh-rCN/vexlife_r2.xml',
  'app/src/test/kotlin/vexlife/android/app/R2ArchitectureContractTest.kt',
]);

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}
function string(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}
function exact(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} must equal ${String(expected)}`);
}
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort(compare).map((key) => [key, canonical(value[key])]));
}
function fingerprint(value) { return sha256(JSON.stringify(canonical(value))); }
function kotlin(value) { return JSON.stringify(String(value)); }

function validateInputs(projectPlan, generationResult, evidenceObligations) {
  const plan = object(projectPlan, 'projectPlan');
  const result = object(generationResult, 'generationResult');
  const a5 = object(evidenceObligations, 'evidenceObligations');
  exact(plan.schemaVersion, A4_PLAN_SCHEMA, 'projectPlan.schemaVersion');
  exact(plan.generatorStage, A4_STAGE, 'projectPlan.generatorStage');
  exact(result.schemaVersion, A4_RESULT_SCHEMA, 'generationResult.schemaVersion');
  exact(result.generatorStage, A4_STAGE, 'generationResult.generatorStage');
  exact(a5.schemaVersion, A5_SCHEMA, 'evidenceObligations.schemaVersion');
  exact(a5.compilerStage, A5_STAGE, 'evidenceObligations.compilerStage');
  exact(result.constructionBlueprintSha256, plan.constructionBlueprintSha256, 'A4 construction blueprint identity');
  exact(a5.sourceA4?.constructionBlueprintSha256, plan.constructionBlueprintSha256, 'A5/A4 construction blueprint identity');
  exact(plan.generationCustody?.durableWorkspaceRoot, 'platform/android', 'A4 durable workspace');
  exact(plan.generationCustody?.durableWorkspaceMutation, false, 'A4 durable mutation boundary');
  for (const field of ['composeImplementation','durableAndroidWorkspaceMutation','home','network','model']) {
    exact(plan.boundaries?.[field], false, `A4 boundary ${field}`);
  }
  for (const field of ['repositoryMutation','home','network','model']) {
    exact(a5.boundaries?.[field], false, `A5 boundary ${field}`);
  }
  exact(a5.summary?.evidenceExecutionPerformed, false, 'A5 evidence execution state');
  exact(a5.summary?.evidenceReceiptFormed, false, 'A5 evidence receipt state');
  const held = new Set((a5.obligations ?? [])
    .filter((item) => item?.obligationState === 'HELD')
    .map((item) => item.obligationClass));
  for (const obligationClass of REQUIRED_A5_HELD_CLASSES) {
    if (!held.has(obligationClass)) throw new Error(`A5 held obligation missing: ${obligationClass}`);
  }
  return Object.freeze({
    constructionBlueprintSha256: string(plan.constructionBlueprintSha256, 'constructionBlueprintSha256'),
    sourceMappingRef: string(plan.sourceMappingRef, 'sourceMappingRef'),
    sourceBlueprintRef: string(plan.sourceBlueprint?.blueprintRef, 'sourceBlueprintRef'),
    sourceBlueprintVersion: string(plan.sourceBlueprint?.version, 'sourceBlueprintVersion'),
    sourceA4IdentityFingerprint: string(a5.sourceA4?.sourceA4IdentityFingerprint, 'sourceA4IdentityFingerprint'),
    a5CompilerRef: string(a5.compilerRef, 'a5CompilerRef'),
    a5SemanticFingerprint: string(a5.semanticFingerprint, 'a5SemanticFingerprint'),
  });
}

function strings(values) {
  const [title, ready, request, admitted] = values;
  return `<resources>
    <string name="app_name">VexLife</string>
    <string name="r2_architecture_title">${title}</string>
    <string name="r2_ready">${ready}</string>
    <string name="r2_request_attention">${request}</string>
    <string name="r2_attention_admitted">${admitted}</string>
</resources>
`;
}

function files(a) {
  const ancestry = [
    `architectureBaselineRef=${ANDROID_RUNTIME_ARCHITECTURE_BASELINE_REF}`,
    `sourceBlueprint=${a.sourceBlueprintRef}@${a.sourceBlueprintVersion}`,
    `sourceMappingRef=${a.sourceMappingRef}`,
    `constructionBlueprintSha256=${a.constructionBlueprintSha256}`,
    `sourceA4IdentityFingerprint=${a.sourceA4IdentityFingerprint}`,
    `a5CompilerRef=${a.a5CompilerRef}`,
    `a5SemanticFingerprint=${a.a5SemanticFingerprint}`,
  ].join('\\n');

  return {
    'README.md': `# VexLife Android R2 project skeleton

[VXG RealForever]

This is the first durable Android app/module adoption generated under the accepted
pre-R2 runtime architecture baseline.

\`\`\`text
${ancestry}
\`\`\`

The application ID \`com.vextreme.vexlife.r2\` and minSdk 23 are bounded R2 build
choices, not a public release identity or permanent support floor.

Permanent boundaries:

\`\`\`text
VIEWMODEL != PRODUCT_STATE_OWNER
WORKER != SEMANTIC_OWNER
ANDROID_SERVICE != DOMAIN_RUNTIME
REPOSITORY != STATE_OWNER_BY_DEFAULT
COROUTINE != OPERATION
OPERATION_IDENTITY != ATTEMPT_IDENTITY
STATEFLOW != EVENT_LEDGER
DEPENDENCY_GRAPH != DI_FRAMEWORK
CAPABILITY != AUTHORITY
CODE_SYMBOL != SERIAL_NAME != SEMANTIC_FIELD_REF != HUMAN_LABEL
\`\`\`

R2 intentionally has no INTERNET permission, Home/model/network integration,
durable operation store, WorkManager topology, Hilt/Koin choice, Current Context
adapter, resource arbiter, external bridge, signing, installation, or publication.
`,
    'settings.gradle.kts': `import org.gradle.api.initialization.resolve.RepositoriesMode

pluginManagement {
    repositories {
        google()
        gradlePluginPortal()
        mavenCentral()
    }
}

val kotlinPersistentDir = rootDir.resolve("../../generated/android-gradle/kotlin-persistent").canonicalFile
check(kotlinPersistentDir.mkdirs() || kotlinPersistentDir.isDirectory) {
    "Unable to create Kotlin persistent project directory: $kotlinPersistentDir"
}
val kotlinPersistentSessions = kotlinPersistentDir.resolve("sessions")
check(kotlinPersistentSessions.mkdirs() || kotlinPersistentSessions.isDirectory) {
    "Unable to create Kotlin compiler sessions directory: $kotlinPersistentSessions"
}

gradle.beforeProject {
    extensions.extraProperties.apply {
        set("kotlin.project.persistent.dir", kotlinPersistentDir.absolutePath)
        set("kotlin.user.home", kotlinPersistentDir.absolutePath)
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "vexlife-android"
include(":state-relay")
include(":app")
`,
    'build.gradle.kts': `plugins {
    alias(libs.plugins.androidApplication) apply false
    alias(libs.plugins.composeCompiler) apply false
    alias(libs.plugins.kotlin.jvm) apply false
}

allprojects {
    group = "vexlife.android"
    version = "0.0.0-r2-skeleton"
    layout.buildDirectory.set(
        rootProject.layout.projectDirectory.dir("../../generated/android-gradle/\${project.name}"),
    )
}
`,
    'gradle/libs.versions.toml': `[versions]
agp = "9.4.0"
kotlin = "2.4.20"
coroutines = "1.10.2"
composeBom = "2026.05.00"
activity = "1.13.0"
lifecycle = "2.10.0"
junit = "4.13.2"

[libraries]
kotlinx-coroutines-core = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-core", version.ref = "coroutines" }
coroutinesAndroid = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-android", version.ref = "coroutines" }
composeBom = { module = "androidx.compose:compose-bom", version.ref = "composeBom" }
composeMaterial3 = { module = "androidx.compose.material3:material3" }
composeUiToolingPreview = { module = "androidx.compose.ui:ui-tooling-preview" }
composeUiTooling = { module = "androidx.compose.ui:ui-tooling" }
activityCompose = { module = "androidx.activity:activity-compose", version.ref = "activity" }
lifecycleViewModel = { module = "androidx.lifecycle:lifecycle-viewmodel", version.ref = "lifecycle" }
junit = { module = "junit:junit", version.ref = "junit" }

[plugins]
androidApplication = { id = "com.android.application", version.ref = "agp" }
composeCompiler = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
kotlin-jvm = { id = "org.jetbrains.kotlin.jvm", version.ref = "kotlin" }
`,
    'app/build.gradle.kts': `plugins {
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.composeCompiler)
}

android {
    namespace = "vexlife.android.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.vextreme.vexlife.r2"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "0.0.0-r2-skeleton"
    }

    buildFeatures {
        compose = true
        buildConfig = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(project(":state-relay"))
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.coroutinesAndroid)
    implementation(platform(libs.composeBom))
    implementation(libs.composeMaterial3)
    implementation(libs.composeUiToolingPreview)
    debugImplementation(libs.composeUiTooling)
    implementation(libs.activityCompose)
    implementation(libs.lifecycleViewModel)
    testImplementation(libs.junit)
}
`,
    'app/src/main/AndroidManifest.xml': `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:allowBackup="false"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@android:style/Theme.Material.Light.NoActionBar">
        <activity android:name=".MainActivity" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`,
    'app/src/main/kotlin/vexlife/android/identity/GeneratedCanonicalRefs.kt': `package vexlife.android.identity

import vexlife.android.architecture.SemanticRef

object GeneratedCanonicalRefs {
    const val ARCHITECTURE_BASELINE_REF: String = ${kotlin(ANDROID_RUNTIME_ARCHITECTURE_BASELINE_REF)}
    const val SOURCE_A4_IDENTITY_FINGERPRINT: String = ${kotlin(a.sourceA4IdentityFingerprint)}
    const val A5_SEMANTIC_FINGERPRINT: String = ${kotlin(a.a5SemanticFingerprint)}

    val architectureSurface = SemanticRef("surface.vexlife.android.r2.architecture")
    val architectureTitleElement = SemanticRef("element.vexlife.android.r2.architecture.title")
    val requestAttentionAction = SemanticRef("action.vexlife.conversation.request-attention")
    val statusElement = SemanticRef("element.vexlife.android.r2.architecture.status")
    val localPrincipal = SemanticRef("principal.vexlife.android.r2.local")
    val presentationSession = SemanticRef("session.vexlife.android.r2.presentation")
}
`,
    'app/src/main/kotlin/vexlife/android/architecture/VexRuntimeContracts.kt': `package vexlife.android.architecture

import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import vexlife.android.state.VexObservation
import vexlife.android.state.VexProjectionAdmission
import vexlife.android.state.VexStateProjection
import vexlife.android.state.VexStateSnapshot

@JvmInline value class SemanticRef(val value: String) {
    init { require(value.isNotBlank()) }
}
@JvmInline value class OperationRef(val value: String) {
    init { require(value.isNotBlank()) }
}
@JvmInline value class AttemptRef(val value: String) {
    init { require(value.isNotBlank()) }
}
@JvmInline value class ResultRef(val value: String) {
    init { require(value.isNotBlank()) }
}

enum class IntentionLifetime { PRESENTATION_BOUND, SESSION_BOUND, DURABLE }

sealed interface VexIntention {
    val semanticTypeRef: SemanticRef
    val lifetime: IntentionLifetime
}

data class RequestConversationAttention(
    val conversationRef: SemanticRef,
) : VexIntention {
    override val semanticTypeRef = SemanticRef(WIRE_TYPE_REF)
    override val lifetime = IntentionLifetime.PRESENTATION_BOUND
    companion object {
        const val WIRE_TYPE_REF = "intention.vexlife.conversation.request-attention/v1"
    }
}

data class PrincipalSessionFence(
    val principalRef: SemanticRef,
    val sessionRef: SemanticRef,
)

data class OperationRecord(
    val operationRef: OperationRef,
    val intention: VexIntention,
    val fence: PrincipalSessionFence,
    val acceptedAtEpochMillis: Long,
)

sealed interface EffectResult {
    val resultRef: ResultRef
    val operationRef: OperationRef
    val attemptRef: AttemptRef
    val fence: PrincipalSessionFence

    data class Success(
        override val resultRef: ResultRef,
        override val operationRef: OperationRef,
        override val attemptRef: AttemptRef,
        override val fence: PrincipalSessionFence,
        val resultTypeRef: SemanticRef,
    ) : EffectResult
}

enum class ResultAdmission {
    ADMIT_CURRENT,
    IGNORE_STALE,
    IGNORE_DUPLICATE,
    SUPERSEDED,
    HOLD_CONFLICT,
    FAIL_CONTRACT,
}

fun interface OperationExecutor {
    suspend fun execute(record: OperationRecord, attemptRef: AttemptRef): EffectResult
}
fun interface VexClock { fun nowEpochMillis(): Long }

interface VexDispatchers {
    val main: CoroutineDispatcher
    val default: CoroutineDispatcher
    val io: CoroutineDispatcher
}
object AndroidVexDispatchers : VexDispatchers {
    override val main = Dispatchers.Main.immediate
    override val default = Dispatchers.Default
    override val io = Dispatchers.IO
}
object SystemVexClock : VexClock {
    override fun nowEpochMillis(): Long = System.currentTimeMillis()
}

interface VexIdentityFactory {
    fun newOperationRef(intention: VexIntention): OperationRef
    fun newAttemptRef(operationRef: OperationRef): AttemptRef
    fun newResultRef(operationRef: OperationRef): ResultRef
}

class ProcessLocalR2IdentityFactory : VexIdentityFactory {
    private val sequence = AtomicLong(0)
    override fun newOperationRef(intention: VexIntention) =
        OperationRef("operation.r2.\${sequence.incrementAndGet()}")
    override fun newAttemptRef(operationRef: OperationRef) =
        AttemptRef("\${operationRef.value}.attempt.\${sequence.incrementAndGet()}")
    override fun newResultRef(operationRef: OperationRef) =
        ResultRef("\${operationRef.value}.result.\${sequence.incrementAndGet()}")
}

class ResultAdmissionController {
    private val admittedResultRefs = linkedSetOf<ResultRef>()

    fun admit(record: OperationRecord, currentAttemptRef: AttemptRef, result: EffectResult): ResultAdmission {
        if (result.operationRef != record.operationRef) return ResultAdmission.HOLD_CONFLICT
        if (result.fence != record.fence) return ResultAdmission.HOLD_CONFLICT
        if (result.resultRef in admittedResultRefs) return ResultAdmission.IGNORE_DUPLICATE
        if (result.attemptRef != currentAttemptRef) return ResultAdmission.IGNORE_STALE
        admittedResultRefs += result.resultRef
        return ResultAdmission.ADMIT_CURRENT
    }
}

data class VexOutputState(
    val statusRef: SemanticRef,
    val operationRefOrNull: OperationRef?,
    val lastAdmissionOrNull: ResultAdmission?,
)
data class VexView(
    val statusRef: SemanticRef,
    val operationRefOrNull: OperationRef?,
    val testRef: SemanticRef,
)
fun interface SurfacePolicy { fun present(output: VexOutputState): VexView }

class R2ArchitectureSurfacePolicy(private val testRef: SemanticRef) : SurfacePolicy {
    override fun present(output: VexOutputState) =
        VexView(output.statusRef, output.operationRefOrNull, testRef)
}

class VexRuntimeWitness(
    private val executor: OperationExecutor,
    private val clock: VexClock,
    private val identities: VexIdentityFactory,
    initialInstanceRef: String = "runtime.vexlife.android.r2.instance.001",
) {
    private var revision = 0L
    private val projection = VexStateProjection(
        initial = snapshot(
            revision = revision,
            transitionRefOrNull = null,
            output = VexOutputState(SemanticRef(STATUS_READY), null, null),
            instanceRef = initialInstanceRef,
        ),
        copyValue = { value -> value?.copy() },
    )
    private val admission = ResultAdmissionController()
    private val admissionMutex = Mutex()
    val outputState: StateFlow<VexStateSnapshot<VexOutputState>> = projection.state

    suspend fun submit(intention: VexIntention, fence: PrincipalSessionFence): ResultAdmission {
        val operationRef = identities.newOperationRef(intention)
        val attemptRef = identities.newAttemptRef(operationRef)
        require(operationRef.value != attemptRef.value)
        val record = OperationRecord(operationRef, intention, fence, clock.nowEpochMillis())
        val result = executor.execute(record, attemptRef)
        return admissionMutex.withLock {
            val disposition = admission.admit(record, attemptRef, result)
            if (disposition == ResultAdmission.ADMIT_CURRENT) {
                revision += 1
                val accepted = projection.admit(
                    snapshot(
                        revision = revision,
                        transitionRefOrNull = "transition.r2.\$revision",
                        output = VexOutputState(
                            SemanticRef(STATUS_ATTENTION_ADMITTED),
                            operationRef,
                            disposition,
                        ),
                        instanceRef = outputState.value.instanceRef,
                    ),
                )
                require(accepted == VexProjectionAdmission.EMITTED)
            }
            disposition
        }
    }

    private fun snapshot(
        revision: Long,
        transitionRefOrNull: String?,
        output: VexOutputState,
        instanceRef: String,
    ) = VexStateSnapshot(
        stateRef = STATE_REF,
        instanceRef = instanceRef,
        revision = revision,
        transitionRefOrNull = transitionRefOrNull,
        observation = VexObservation.PRESENT,
        semanticHash = "\${output.statusRef.value}|\${output.operationRefOrNull?.value ?: "none"}|\${output.lastAdmissionOrNull?.name ?: "none"}",
        valueOrNull = output,
    )

    companion object {
        const val STATE_REF = "state.vexlife.android.r2.output"
        const val STATUS_READY = "output.vexlife.android.r2.ready"
        const val STATUS_ATTENTION_ADMITTED = "output.vexlife.android.r2.attention-admitted"
    }
}

class R2NoEffectOperationExecutor(private val identities: VexIdentityFactory) : OperationExecutor {
    override suspend fun execute(record: OperationRecord, attemptRef: AttemptRef) =
        EffectResult.Success(
            resultRef = identities.newResultRef(record.operationRef),
            operationRef = record.operationRef,
            attemptRef = attemptRef,
            fence = record.fence,
            resultTypeRef = SemanticRef("effect-result.vexlife.android.r2.no-effect/v1"),
        )
}
`,
    'app/src/main/kotlin/vexlife/android/app/VexCompositionRoot.kt': `package vexlife.android.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import vexlife.android.identity.GeneratedCanonicalRefs
import vexlife.android.architecture.AndroidVexDispatchers
import vexlife.android.architecture.PrincipalSessionFence
import vexlife.android.architecture.ProcessLocalR2IdentityFactory
import vexlife.android.architecture.R2ArchitectureSurfacePolicy
import vexlife.android.architecture.R2NoEffectOperationExecutor
import vexlife.android.architecture.SystemVexClock
import vexlife.android.architecture.VexClock
import vexlife.android.architecture.VexDispatchers
import vexlife.android.architecture.VexIdentityFactory
import vexlife.android.architecture.VexRuntimeWitness

class VexCompositionRoot(
    private val dispatchers: VexDispatchers = AndroidVexDispatchers,
    private val clock: VexClock = SystemVexClock,
    private val identities: VexIdentityFactory = ProcessLocalR2IdentityFactory(),
) {
    private val executor = R2NoEffectOperationExecutor(identities)
    private val runtime = VexRuntimeWitness(executor, clock, identities)
    private val surfacePolicy = R2ArchitectureSurfacePolicy(GeneratedCanonicalRefs.statusElement)
    private val fence = PrincipalSessionFence(
        GeneratedCanonicalRefs.localPrincipal,
        GeneratedCanonicalRefs.presentationSession,
    )

    fun viewModelFactory(): ViewModelProvider.Factory =
        object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                require(modelClass == VexAppViewModel::class.java)
                return VexAppViewModel(runtime, surfacePolicy, fence, dispatchers) as T
            }
        }
}
`,
    'app/src/main/kotlin/vexlife/android/app/VexAppViewModel.kt': `package vexlife.android.app

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import vexlife.android.identity.GeneratedCanonicalRefs
import vexlife.android.architecture.PrincipalSessionFence
import vexlife.android.architecture.RequestConversationAttention
import vexlife.android.architecture.SurfacePolicy
import vexlife.android.architecture.VexDispatchers
import vexlife.android.architecture.VexRuntimeWitness

class VexAppViewModel(
    private val runtime: VexRuntimeWitness,
    private val surfacePolicy: SurfacePolicy,
    private val fence: PrincipalSessionFence,
    dispatchers: VexDispatchers,
) : ViewModel() {
    private val attemptJob: Job = SupervisorJob()
    private val presentationAttemptScope = CoroutineScope(attemptJob + dispatchers.main)

    val viewState = runtime.outputState
        .map { snapshot -> surfacePolicy.present(requireNotNull(snapshot.valueOrNull)) }
        .stateIn(
            presentationAttemptScope,
            SharingStarted.Eagerly,
            surfacePolicy.present(requireNotNull(runtime.outputState.value.valueOrNull)),
        )

    fun requestConversationAttention() {
        presentationAttemptScope.launch {
            runtime.submit(
                RequestConversationAttention(GeneratedCanonicalRefs.architectureSurface),
                fence,
            )
        }
    }

    override fun onCleared() {
        presentationAttemptScope.cancel()
    }
}
`,
    'app/src/main/kotlin/vexlife/android/app/MainActivity.kt': `package vexlife.android.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModelProvider
import vexlife.android.identity.GeneratedCanonicalRefs
import vexlife.android.architecture.SemanticRef
import vexlife.android.architecture.VexRuntimeWitness

class MainActivity : ComponentActivity() {
    private val compositionRoot by lazy { VexCompositionRoot() }

    override fun onCreate(savedInstanceState: Bundle?) {
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
    Surface(Modifier.fillMaxSize()) {
        Column(
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.padding(24.dp),
        ) {
            Text(
                stringResource(R.string.r2_architecture_title),
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.testTag(GeneratedCanonicalRefs.architectureTitleElement.value),
            )
            Text(statusText(view.statusRef), Modifier.testTag(view.testRef.value))
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
`,
    'app/src/main/res/values/vexlife_r2.xml': strings([
      'Android Runtime Architecture',
      'R2 architecture skeleton ready',
      'Request conversation attention',
      'Attention request admitted locally',
    ]),
    'app/src/main/res/values-ja/vexlife_r2.xml': strings([
      'Android ランタイム アーキテクチャ',
      'R2 アーキテクチャ スケルトンは準備完了です',
      '会話への注意をリクエスト',
      '注意リクエストをローカルで受理しました',
    ]),
    'app/src/main/res/values-zh-rCN/vexlife_r2.xml': strings([
      'Android 运行时架构',
      'R2 架构骨架已就绪',
      '请求关注会话',
      '关注请求已在本地受理',
    ]),
    'app/src/test/kotlin/vexlife/android/app/R2ArchitectureContractTest.kt': `package vexlife.android.app

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import vexlife.android.identity.GeneratedCanonicalRefs
import vexlife.android.architecture.AttemptRef
import vexlife.android.architecture.EffectResult
import vexlife.android.architecture.OperationExecutor
import vexlife.android.architecture.OperationRecord
import vexlife.android.architecture.PrincipalSessionFence
import vexlife.android.architecture.ProcessLocalR2IdentityFactory
import vexlife.android.architecture.RequestConversationAttention
import vexlife.android.architecture.ResultAdmission
import vexlife.android.architecture.ResultAdmissionController
import vexlife.android.architecture.ResultRef
import vexlife.android.architecture.SemanticRef
import vexlife.android.architecture.VexClock
import vexlife.android.architecture.VexDispatchers
import vexlife.android.architecture.VexRuntimeWitness

class R2ArchitectureContractTest {
    @Test fun operationIdentityIsNotAttemptIdentity() {
        val identities = ProcessLocalR2IdentityFactory()
        val intention = RequestConversationAttention(SemanticRef("conversation.test"))
        val operation = identities.newOperationRef(intention)
        val attempt = identities.newAttemptRef(operation)
        assertNotEquals(operation.value, attempt.value)
    }

    @Test fun duplicateAndStaleResultsAreRejectedDeterministically() {
        val record = OperationRecord(
            vexlife.android.architecture.OperationRef("operation.test"),
            RequestConversationAttention(SemanticRef("conversation.test")),
            PrincipalSessionFence(SemanticRef("principal.test"), SemanticRef("session.test")),
            1L,
        )
        val current = AttemptRef("attempt.current")
        val stale = EffectResult.Success(
            ResultRef("result.stale"), record.operationRef, AttemptRef("attempt.stale"), record.fence,
            SemanticRef("effect-result.test/v1"),
        )
        val accepted = EffectResult.Success(
            ResultRef("result.current"), record.operationRef, current, record.fence,
            SemanticRef("effect-result.test/v1"),
        )
        val admission = ResultAdmissionController()
        val wrongFence = accepted.copy(
            resultRef = ResultRef("result.wrong-fence"),
            fence = PrincipalSessionFence(SemanticRef("principal.other"), SemanticRef("session.other")),
        )
        assertEquals(ResultAdmission.IGNORE_STALE, admission.admit(record, current, stale))
        assertEquals(ResultAdmission.HOLD_CONFLICT, admission.admit(record, current, wrongFence))
        assertEquals(ResultAdmission.ADMIT_CURRENT, admission.admit(record, current, accepted))
        assertEquals(ResultAdmission.IGNORE_DUPLICATE, admission.admit(record, current, accepted))
    }

    @Test fun sentenceLikeIntentionCrossesTypedAdmissionBoundary() = runBlocking {
        val identities = ProcessLocalR2IdentityFactory()
        val executor = OperationExecutor { record, attempt ->
            EffectResult.Success(
                identities.newResultRef(record.operationRef), record.operationRef, attempt, record.fence,
                SemanticRef("effect-result.test.no-effect/v1"),
            )
        }
        val runtime = VexRuntimeWitness(executor, VexClock { 100L }, identities)
        val disposition = runtime.submit(
            RequestConversationAttention(SemanticRef("conversation.test")),
            PrincipalSessionFence(SemanticRef("principal.test"), SemanticRef("session.test")),
        )
        assertEquals(ResultAdmission.ADMIT_CURRENT, disposition)
        assertEquals(
            VexRuntimeWitness.STATUS_ATTENTION_ADMITTED,
            runtime.outputState.value.valueOrNull?.statusRef?.value,
        )
    }

    @Test fun semanticIdentityIsIndependentOfLocalizedLabels() {
        assertEquals(
            "action.vexlife.conversation.request-attention",
            GeneratedCanonicalRefs.requestAttentionAction.value,
        )
        assertTrue(GeneratedCanonicalRefs.ARCHITECTURE_BASELINE_REF.startsWith("architecture.vexlife."))
    }

    @Test fun dispatcherAndClockAreSubstitutable() {
        val dispatchers = object : VexDispatchers {
            override val main = Dispatchers.Unconfined
            override val default = Dispatchers.Unconfined
            override val io = Dispatchers.Unconfined
        }
        val clock = VexClock { 42L }
        assertEquals(Dispatchers.Unconfined, dispatchers.main)
        assertEquals(42L, clock.nowEpochMillis())
    }
}
`,
  };
}

export function renderAndroidR2ProjectSkeleton({ projectPlan, generationResult, evidenceObligations } = {}) {
  const ancestry = validateInputs(projectPlan, generationResult, evidenceObligations);
  const rendered = files(ancestry);
  const observedPaths = Object.keys(rendered).sort(compare);
  const expectedPaths = [...ANDROID_R2_GENERATED_PATHS].sort(compare);
  if (JSON.stringify(observedPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error(`R2 generated path set drifted: ${JSON.stringify(observedPaths)}`);
  }
  const inventory = observedPaths.map((relativePath) => {
    const bytes = Buffer.from(rendered[relativePath], 'utf8');
    return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
  });
  const core = {
    schemaVersion: ANDROID_R2_PROJECT_SKELETON_SCHEMA,
    generatorStage: ANDROID_R2_PROJECT_SKELETON_STAGE,
    architectureBaselineRef: ANDROID_RUNTIME_ARCHITECTURE_BASELINE_REF,
    ancestry: structuredClone(ancestry),
    generatedPaths: observedPaths,
    inventory,
    heldImplementationChoices: [
      'DI_FRAMEWORK_BACKEND',
      'WORKER_TOPOLOGY',
      'PERSISTENT_OPERATION_STORE',
      'RUNTIME_DIRECTORY',
      'FULL_RUNTIME_NODE_API',
      'FULL_DOMAIN_RUNTIME_API',
      'RESOURCE_ARBITER',
      'CURRENT_CONTEXT_ADAPTER',
      'EXTERNAL_BRIDGE_PROTOCOL',
    ],
    effects: { home: false, network: false, model: false, install: false, signing: false, publication: false },
  };
  return Object.freeze({ ...core, semanticFingerprint: fingerprint(core), files: Object.freeze(rendered) });
}

export function generateAndroidR2ProjectSkeleton({ projectPlan, generationResult, evidenceObligations, outputRoot } = {}) {
  const rendered = renderAndroidR2ProjectSkeleton({ projectPlan, generationResult, evidenceObligations });
  const root = path.resolve(string(outputRoot, 'outputRoot'));
  fs.mkdirSync(root, { recursive: true });
  for (const relativePath of rendered.generatedPaths) {
    const target = path.join(root, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, rendered.files[relativePath], 'utf8');
  }
  return Object.freeze({
    schemaVersion: rendered.schemaVersion,
    generatorStage: rendered.generatorStage,
    architectureBaselineRef: rendered.architectureBaselineRef,
    ancestry: structuredClone(rendered.ancestry),
    generatedPaths: [...rendered.generatedPaths],
    inventory: structuredClone(rendered.inventory),
    heldImplementationChoices: [...rendered.heldImplementationChoices],
    effects: structuredClone(rendered.effects),
    semanticFingerprint: rendered.semanticFingerprint,
  });
}

export function checkAndroidR2ProjectSkeleton({ projectPlan, generationResult, evidenceObligations, outputRoot } = {}) {
  const rendered = renderAndroidR2ProjectSkeleton({ projectPlan, generationResult, evidenceObligations });
  const root = path.resolve(string(outputRoot, 'outputRoot'));
  const mismatches = [];
  for (const relativePath of rendered.generatedPaths) {
    const target = path.join(root, ...relativePath.split('/'));
    if (!fs.existsSync(target)) {
      mismatches.push({ path: relativePath, state: 'MISSING' });
      continue;
    }
    const observed = fs.readFileSync(target);
    const expected = Buffer.from(rendered.files[relativePath], 'utf8');
    if (!observed.equals(expected)) {
      mismatches.push({
        path: relativePath,
        state: 'BYTE_DRIFT',
        expectedSha256: sha256(expected),
        observedSha256: sha256(observed),
      });
    }
  }
  return Object.freeze({
    state: mismatches.length === 0 ? 'PASS' : 'FAIL',
    mismatches: Object.freeze(mismatches.map(Object.freeze)),
    expectedPaths: [...rendered.generatedPaths],
    semanticFingerprint: rendered.semanticFingerprint,
  });
}

// [VXG RealForever]
