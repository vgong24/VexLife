import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ANDROID_R2_GENERATED_PATHS,
  ANDROID_R2_PROJECT_SKELETON_SCHEMA,
  ANDROID_R2_PROJECT_SKELETON_STAGE,
  ANDROID_RUNTIME_ARCHITECTURE_BASELINE_REF,
  checkAndroidR2ProjectSkeleton,
  generateAndroidR2ProjectSkeleton,
  renderAndroidR2ProjectSkeleton,
} from '../src/core/android-r2-project-skeleton.mjs';

const HELD_CLASSES = [
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
];

function input() {
  const constructionBlueprintSha256 = 'a'.repeat(64);
  const sourceA4IdentityFingerprint = 'b'.repeat(64);
  return {
    projectPlan: {
      schemaVersion: 'vexlife.android-project-practicum/v0',
      generatorStage: 'A4_MINIMAL_GENERATED_ANDROID_PROJECT_PRACTICUM',
      constructionBlueprintSha256,
      sourceMappingRef: 'mapping.vexlife.android-construction.r2.test',
      sourceBlueprint: { blueprintRef: 'blueprint.vexlife.universal.001', version: '0.4.0-foundation-rc1' },
      generationCustody: { durableWorkspaceRoot: 'platform/android', durableWorkspaceMutation: false },
      boundaries: {
        composeImplementation: false,
        durableAndroidWorkspaceMutation: false,
        home: false,
        network: false,
        model: false,
      },
    },
    generationResult: {
      schemaVersion: 'vexlife.android-project-practicum-result/v0',
      generatorStage: 'A4_MINIMAL_GENERATED_ANDROID_PROJECT_PRACTICUM',
      constructionBlueprintSha256,
    },
    evidenceObligations: {
      schemaVersion: 'vexlife.android-test-evidence-obligations/v0',
      compilerRef: 'compiler.vexlife.android-test-evidence.r2.test',
      compilerStage: 'A5_TEST_AND_EVIDENCE_GENERATION',
      sourceA4: { constructionBlueprintSha256, sourceA4IdentityFingerprint },
      obligations: HELD_CLASSES.map((obligationClass) => ({ obligationClass, obligationState: 'HELD' })),
      summary: { evidenceExecutionPerformed: false, evidenceReceiptFormed: false },
      boundaries: { repositoryMutation: false, home: false, network: false, model: false },
      semanticFingerprint: 'c'.repeat(64),
    },
  };
}
function tempRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-r2-skeleton-')); }

function source(rendered, relativePath) { return rendered.files[relativePath]; }

test('R2 renders one deterministic closed durable Android project skeleton', () => {
  const first = renderAndroidR2ProjectSkeleton(input());
  const second = renderAndroidR2ProjectSkeleton(input());
  assert.equal(first.schemaVersion, ANDROID_R2_PROJECT_SKELETON_SCHEMA);
  assert.equal(first.generatorStage, ANDROID_R2_PROJECT_SKELETON_STAGE);
  assert.equal(first.architectureBaselineRef, ANDROID_RUNTIME_ARCHITECTURE_BASELINE_REF);
  assert.deepEqual(first.generatedPaths, [...ANDROID_R2_GENERATED_PATHS].sort());
  assert.equal(first.semanticFingerprint, second.semanticFingerprint);
  assert.deepEqual(first.inventory, second.inventory);
  for (const relativePath of first.generatedPaths) {
    assert.equal(source(first, relativePath), source(second, relativePath));
  }
});

test('R2 preserves the accepted ownership boundaries instead of selecting held frameworks', () => {
  const rendered = renderAndroidR2ProjectSkeleton(input());
  const runtime = source(rendered, 'app/src/main/kotlin/vexlife/android/architecture/VexRuntimeContracts.kt');
  const viewModel = source(rendered, 'app/src/main/kotlin/vexlife/android/app/VexAppViewModel.kt');
  const composition = source(rendered, 'app/src/main/kotlin/vexlife/android/app/VexCompositionRoot.kt');
  assert.match(runtime, /OperationRef/);
  assert.match(runtime, /AttemptRef/);
  assert.match(runtime, /ResultAdmissionController/);
  assert.match(runtime, /VexStateProjection/);
  assert.match(runtime, /SurfacePolicy/);
  assert.match(runtime, /VexView/);
  assert.doesNotMatch(viewModel, /MutableStateFlow/);
  assert.doesNotMatch(composition, /Hilt|Koin|Dagger/);
  assert.equal(rendered.heldImplementationChoices.includes('DI_FRAMEWORK_BACKEND'), true);
  assert.equal(rendered.heldImplementationChoices.includes('WORKER_TOPOLOGY'), true);
});

test('R2 has no INTERNET permission and explicit identities are not class or localized labels', () => {
  const rendered = renderAndroidR2ProjectSkeleton(input());
  const manifest = source(rendered, 'app/src/main/AndroidManifest.xml');
  const runtime = source(rendered, 'app/src/main/kotlin/vexlife/android/architecture/VexRuntimeContracts.kt');
  const refs = source(rendered, 'app/src/main/kotlin/vexlife/android/identity/GeneratedCanonicalRefs.kt');
  assert.doesNotMatch(manifest, /android\.permission\.INTERNET/);
  assert.match(runtime, /intention\.vexlife\.conversation\.request-attention\/v1/);
  assert.match(refs, /surface\.vexlife\.android\.r2\.architecture/);
  assert.doesNotMatch(runtime, /::class|simpleName|toString\(\)/);
});

test('R2 localizes human labels while stable semantic/test refs remain source constants', () => {
  const rendered = renderAndroidR2ProjectSkeleton(input());
  const en = source(rendered, 'app/src/main/res/values/vexlife_r2.xml');
  const ja = source(rendered, 'app/src/main/res/values-ja/vexlife_r2.xml');
  const zh = source(rendered, 'app/src/main/res/values-zh-rCN/vexlife_r2.xml');
  const refs = source(rendered, 'app/src/main/kotlin/vexlife/android/identity/GeneratedCanonicalRefs.kt');
  assert.notEqual(en, ja);
  assert.notEqual(en, zh);
  assert.notEqual(ja, zh);
  assert.match(refs, /element\.vexlife\.android\.r2\.architecture\.title/);
  assert.match(refs, /action\.vexlife\.conversation\.request-attention/);
});


test('R2 pins the accepted API 36 build surface without selecting the newer compileSdk 37 Compose line', () => {
  const rendered = renderAndroidR2ProjectSkeleton(input());
  const catalog = source(rendered, 'gradle/libs.versions.toml');
  const app = source(rendered, 'app/build.gradle.kts');
  const manifest = source(rendered, 'app/src/main/AndroidManifest.xml');
  assert.match(catalog, /composeBom = "2026\.05\.00"/);
  assert.match(app, /compileSdk = 36/);
  assert.match(app, /targetSdk = 36/);
  assert.match(catalog, /kotlin = "2\.4\.20"/);
  assert.match(catalog, /agp = "9\.4\.0"/);
  assert.match(catalog, /kotlinx-coroutines-android/);
  assert.match(manifest, /@android:style\/Theme\.Material\.Light\.NoActionBar/);
});

test('R2 composes with the accepted A2 Gradle workspace instead of replacing its read-only State Relay contracts', () => {
  const rendered = renderAndroidR2ProjectSkeleton(input());
  const settings = source(rendered, 'settings.gradle.kts');
  const rootBuild = source(rendered, 'build.gradle.kts');
  const catalog = source(rendered, 'gradle/libs.versions.toml');
  const appBuild = source(rendered, 'app/build.gradle.kts');

  assert.match(settings, /import org\.gradle\.api\.initialization\.resolve\.RepositoriesMode/);
  assert.match(settings, /generated\/android-gradle\/kotlin-persistent/);
  assert.match(settings, /set\("kotlin\.project\.persistent\.dir"/);
  assert.match(settings, /include\(":state-relay"\)/);
  assert.match(settings, /include\(":app"\)/);
  assert.match(rootBuild, /alias\(libs\.plugins\.kotlin\.jvm\) apply false/);
  assert.match(rootBuild, /generated\/android-gradle\/\$\{project\.name\}/);
  assert.match(catalog, /kotlinx-coroutines-core = \{ module = "org\.jetbrains\.kotlinx:kotlinx-coroutines-core"/);
  assert.match(catalog, /kotlin-jvm = \{ id = "org\.jetbrains\.kotlin\.jvm"/);
  assert.match(appBuild, /implementation\(libs\.kotlinx\.coroutines\.core\)/);
  assert.doesNotMatch(catalog, /^coroutinesCore\s*=/m);
  assert.doesNotMatch(catalog, /^kotlinJvm\s*=/m);
});

test('R2 check detects byte drift without mutating the durable output', () => {
  const root = tempRoot();
  try {
    const formed = generateAndroidR2ProjectSkeleton({ ...input(), outputRoot: root });
    assert.equal(formed.generatedPaths.length, ANDROID_R2_GENERATED_PATHS.length);
    assert.equal(checkAndroidR2ProjectSkeleton({ ...input(), outputRoot: root }).state, 'PASS');
    fs.appendFileSync(path.join(root, 'README.md'), '\nDRIFT\n');
    const drifted = checkAndroidR2ProjectSkeleton({ ...input(), outputRoot: root });
    assert.equal(drifted.state, 'FAIL');
    assert.deepEqual(drifted.mismatches.map((item) => item.path), ['README.md']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('R2 rejects missing A5 held obligations and unexpected evidence claims', () => {
  const missing = input();
  missing.evidenceObligations.obligations.pop();
  assert.throws(() => renderAndroidR2ProjectSkeleton(missing), /A5 held obligation missing/);
  const executed = input();
  executed.evidenceObligations.summary.evidenceExecutionPerformed = true;
  assert.throws(() => renderAndroidR2ProjectSkeleton(executed), /A5 evidence execution state/);
});

// [VXG RealForever]
