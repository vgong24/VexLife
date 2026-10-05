import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  enumerateBlueprintSources,
  mapBlueprintToPlatformBlueprint
} from '../src/core/blueprint-mapper.mjs';
import {
  ANDROID_CONSTRUCTION_BLUEPRINT_SCHEMA,
  ANDROID_CONSTRUCTION_COMPILER_STAGE,
  compileAndroidConstructionBlueprint
} from '../src/core/android-construction-compiler.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.VEXLIFE_A3_TEST_ROOT || path.resolve(here, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function fixture() {
  return {
    blueprint: readJson('blueprint/vexlife.blueprint.json'),
    platforms: readJson('blueprint/platforms.json'),
    foundation: readJson('blueprint/android-construction-foundation.json')
  };
}

function rulesFor(blueprint, overrides = new Map()) {
  return enumerateBlueprintSources(blueprint).map(({ ancestryPath }) => overrides.get(ancestryPath) ?? ({
    ancestryPath,
    disposition: 'HELD',
    reasonOrNull: 'A3 compiler proof fixture keeps implementation held unless explicitly overridden.'
  }));
}

function a0Mapping(overrides = new Map()) {
  const { blueprint, platforms, foundation } = fixture();
  return mapBlueprintToPlatformBlueprint({
    sourceBlueprint: blueprint,
    platformRegistry: platforms,
    platformRef: 'platform.android',
    foundation,
    mappingRef: 'mapping.vexlife.android-construction.a3.test',
    mappingRules: rulesFor(blueprint, overrides)
  });
}

function compile(mapping = a0Mapping()) {
  return compileAndroidConstructionBlueprint({
    mapping,
    compilerRef: 'compiler.vexlife.android-construction.a3.test'
  });
}

test('A3 compiles accepted A0 output into a deterministic inert Android construction blueprint', () => {
  const mapping = a0Mapping();
  const before = structuredClone(mapping);
  const first = compile(mapping);
  const second = compile(mapping);

  assert.deepEqual(first, second);
  assert.deepEqual(mapping, before);
  assert.equal(first.schemaVersion, ANDROID_CONSTRUCTION_BLUEPRINT_SCHEMA);
  assert.equal(first.compilerStage, ANDROID_CONSTRUCTION_COMPILER_STAGE);
  assert.equal(first.sourceMappingRef, mapping.mappingRef);
  assert.deepEqual(first.sourceBlueprint, mapping.sourceBlueprint);
  assert.deepEqual(first.foundation, mapping.foundation);
  assert.deepEqual(first.targetPlatform, mapping.targetPlatform);
  assert.deepEqual(first.mappings, mapping.mappings);
  assert.equal(first.registrationState, 'INERT_NOT_COMPOSED');
  assert.equal(first.effects, false);
  assert.equal(first.canonicalAncestryRequired, true);
  assert.equal(first.constructionUnits.length, mapping.mappings.length);
  assert.ok(first.constructionUnits.every((entry) => entry.constructionState === 'HELD'));
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.constructionUnits), true);
});

test('A3 preserves mixed A0 dispositions and never upgrades HELD or UNSUPPORTED', () => {
  const { blueprint } = fixture();
  const sources = enumerateBlueprintSources(blueprint);
  assert.ok(sources.length >= 4);
  const overrides = new Map([
    [sources[0].ancestryPath, { ancestryPath: sources[0].ancestryPath, disposition: 'MAPPED', platformBindingRefOrNull: 'binding.android.contract.test' }],
    [sources[1].ancestryPath, { ancestryPath: sources[1].ancestryPath, disposition: 'PLATFORM_SPECIFIC', platformBindingRefOrNull: 'binding.android.adapter.test' }],
    [sources[2].ancestryPath, { ancestryPath: sources[2].ancestryPath, disposition: 'HELD', reasonOrNull: 'held by test' }],
    [sources[3].ancestryPath, { ancestryPath: sources[3].ancestryPath, disposition: 'UNSUPPORTED', reasonOrNull: 'unsupported by test' }]
  ]);
  const mapping = a0Mapping(overrides);
  const output = compile(mapping);
  const byPath = new Map(output.constructionUnits.map((entry) => [entry.ancestryPath, entry]));

  assert.equal(byPath.get(sources[0].ancestryPath).constructionState, 'CONTRACT_PROJECTION_REQUIRED');
  assert.equal(byPath.get(sources[1].ancestryPath).constructionState, 'ANDROID_ADAPTER_REQUIRED');
  assert.equal(byPath.get(sources[2].ancestryPath).constructionState, 'HELD');
  assert.equal(byPath.get(sources[3].ancestryPath).constructionState, 'UNSUPPORTED');
  assert.equal(byPath.get(sources[2].ancestryPath).platformBindingRefOrNull, null);
  assert.equal(byPath.get(sources[3].ancestryPath).platformBindingRefOrNull, null);
  assert.equal(output.dispositionCounts.MAPPED, 1);
  assert.equal(output.dispositionCounts.PLATFORM_SPECIFIC, 1);
  assert.ok(output.dispositionCounts.HELD >= 1);
  assert.equal(output.dispositionCounts.UNSUPPORTED, 1);
});

test('A3 rejects non-Android, noncanonical, effectful, or boundary-drifted A0 mappings', () => {
  const base = a0Mapping();
  const wrongPlatform = structuredClone(base);
  wrongPlatform.targetPlatform.platformRef = 'platform.ios';
  wrongPlatform.targetPlatform.id = 'ios';
  assert.throws(() => compile(wrongPlatform), /requires the Android A0 target platform/u);

  const noncanonical = structuredClone(base);
  noncanonical.canonicalAncestryRequired = false;
  assert.throws(() => compile(noncanonical), /requires canonical A0 ancestry/u);

  const effectful = structuredClone(base);
  effectful.effects = true;
  assert.throws(() => compile(effectful), /requires effect-free A0 input/u);

  const boundaryDrift = structuredClone(base);
  boundaryDrift.boundaries.gradle = true;
  assert.throws(() => compile(boundaryDrift), /A0 boundary must remain false: gradle/u);
});

test('A3 rejects drift from the accepted Android foundation and target metadata', () => {
  const cases = [
    ['foundation.registryRef', 'registry.fake', /mapping\.foundation\.registryRef must equal registry\.vexlife\.android-construction-foundation\.001/u],
    ['foundation.ownerRef', 'github.issue.fake', /mapping\.foundation\.ownerRef must equal github\.issue\.vexlife\.783/u],
    ['foundation.parentOrchestrationRef', 'github.issue.fake', /mapping\.foundation\.parentOrchestrationRef must equal github\.issue\.vexlife\.624/u],
    ['targetPlatform.language', 'Rust', /mapping\.targetPlatform\.language must equal Kotlin/u],
    ['targetPlatform.ui', 'XML', /mapping\.targetPlatform\.ui must equal Jetpack Compose/u],
    ['targetPlatform.state', 'SomethingElse', /mapping\.targetPlatform\.state must equal StateFlow/u]
  ];

  for (const [field, value, expected] of cases) {
    const mapping = structuredClone(a0Mapping());
    const [parent, child] = field.split('.');
    mapping[parent][child] = value;
    assert.throws(() => compile(mapping), expected, `${field} drift must fail closed`);
  }
});

test('A3 rejects duplicate or reordered ancestry instead of normalizing ambiguous input', () => {
  const base = a0Mapping();
  const duplicate = structuredClone(base);
  duplicate.mappings.splice(1, 0, structuredClone(duplicate.mappings[0]));
  assert.throws(() => compile(duplicate), /duplicate mapping ancestry|strictly ordered/u);

  const reordered = structuredClone(base);
  reordered.mappings = [...reordered.mappings].reverse();
  assert.throws(() => compile(reordered), /strictly ordered/u);
});

test('A3 binds the accepted A2 StateFlow surface by reference only and keeps project generation held', () => {
  const output = compile();
  assert.deepEqual(output.stateProjectionSurface, {
    semanticOwnerRef: 'module.vexlife.core.state-relay',
    workspacePath: 'platform/android/state-relay',
    snapshotType: 'vexlife.android.state.VexStateSnapshot',
    projectionType: 'vexlife.android.state.VexStateProjection',
    stateFlowIsEventLedger: false
  });
  assert.equal(output.generationBoundary.durableWorkspaceRoot, 'platform/android');
  assert.deepEqual(output.generationBoundary.existingHandwrittenRoots, ['platform/android/state-relay']);
  assert.equal(output.generationBoundary.projectGeneratorStage, 'A4_MINIMAL_GENERATED_ANDROID_PROJECT_PRACTICUM');
  assert.equal(output.generationBoundary.generatedPathSelectionState, 'HELD_FOR_A4_SOURCE_PLACEMENT');
  assert.equal(output.generationBoundary.projectGenerationAllowed, false);
});

test('A3 output holds every source/runtime/project/release effect and compiler source is effect-free', () => {
  const output = compile();
  assert.deepEqual(output.boundaries, {
    canonicalRegistryWrites: false,
    stateRelayRuntimeMutation: false,
    androidRuntimeGeneration: false,
    projectGeneration: false,
    compose: false,
    gradle: false,
    manifest: false,
    resources: false,
    home: false,
    network: false,
    model: false,
    device: false,
    install: false,
    signing: false,
    publication: false
  });

  const source = fs.readFileSync(path.join(here, '../src/core/android-construction-compiler.mjs'), 'utf8');
  for (const forbidden of ['node:fs', 'node:child_process', 'writeFile', 'writeJson(', 'fetch(', 'gh ', 'git ', 'generatePlatform(']) {
    assert.equal(source.includes(forbidden), false, `pure A3 compiler source must not contain ${forbidden}`);
  }
});

// [VXG RealForever]
