import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enumerateBlueprintSources, mapBlueprintToPlatformBlueprint } from '../src/core/blueprint-mapper.mjs';
import { compileAndroidConstructionBlueprint } from '../src/core/android-construction-compiler.mjs';
import {
  ANDROID_PROJECT_GENERATOR_STAGE,
  ANDROID_PROJECT_PRACTICUM_SCHEMA,
  generateAndroidProjectPracticum
} from '../src/core/android-project-generator.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.VEXLIFE_A4_TEST_ROOT || path.resolve(here, '..');

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
    reasonOrNull: 'A4 practicum fixture keeps product implementation held unless explicitly overridden.'
  }));
}
function a0Mapping(overrides = new Map()) {
  const { blueprint, platforms, foundation } = fixture();
  return mapBlueprintToPlatformBlueprint({
    sourceBlueprint: blueprint,
    platformRegistry: platforms,
    platformRef: 'platform.android',
    foundation,
    mappingRef: 'mapping.vexlife.android-construction.a4.test',
    mappingRules: rulesFor(blueprint, overrides)
  });
}
function a3Blueprint(mapping = a0Mapping()) {
  return compileAndroidConstructionBlueprint({ mapping, compilerRef: 'compiler.vexlife.android-construction.a4.test' });
}
function tempRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-a4-project-')); }
function digest(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function files(root, current = root) {
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(current, entry.name);
    return entry.isDirectory() ? files(root, absolute) : [path.relative(root, absolute).split(path.sep).join('/')];
  }).sort();
}
function readGenerated(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, ...relativePath.split('/')), 'utf8'));
}

test('A4 generates a deterministic closed disposable project tree from accepted A3 output', () => {
  const input = a3Blueprint();
  const before = structuredClone(input);
  const one = tempRoot(), two = tempRoot();
  try {
    const first = generateAndroidProjectPracticum({ constructionBlueprint: input, outputRoot: one });
    const second = generateAndroidProjectPracticum({ constructionBlueprint: input, outputRoot: two });
    assert.deepEqual(input, before);
    assert.equal(first.generatorStage, ANDROID_PROJECT_GENERATOR_STAGE);
    assert.equal(first.constructionBlueprintSha256, second.constructionBlueprintSha256);
    assert.deepEqual(first.generatedPaths, second.generatedPaths);
    assert.deepEqual(first.inventory, second.inventory);
    assert.deepEqual(files(one), first.generatedPaths);
    for (const row of first.inventory) {
      const left = path.join(one, ...row.path.split('/'));
      const right = path.join(two, ...row.path.split('/'));
      assert.equal(fs.statSync(left).size, row.bytes);
      assert.equal(digest(left), row.sha256);
      assert.equal(digest(right), row.sha256);
      assert.deepEqual(fs.readFileSync(left), fs.readFileSync(right));
    }
  } finally {
    fs.rmSync(one, { recursive: true, force: true });
    fs.rmSync(two, { recursive: true, force: true });
  }
});

test('A4 plan preserves A3/A2 identity and keeps implementation effects held', () => {
  const root = tempRoot();
  try {
    const input = a3Blueprint();
    const result = generateAndroidProjectPracticum({ constructionBlueprint: input, outputRoot: root });
    const plan = readGenerated(root, 'generated/project-plan.json');
    assert.equal(plan.schemaVersion, ANDROID_PROJECT_PRACTICUM_SCHEMA);
    assert.equal(plan.generatorStage, ANDROID_PROJECT_GENERATOR_STAGE);
    assert.equal(plan.constructionBlueprintSha256, result.constructionBlueprintSha256);
    assert.equal(plan.sourceMappingRef, input.sourceMappingRef);
    assert.equal(plan.sourceBlueprint.contractVersion, input.sourceBlueprint.contractVersion);
    assert.equal(plan.sourceBlueprint.contractVersion, 1);
    assert.deepEqual(plan.foundation, input.foundation);
    assert.deepEqual(plan.targetPlatform, input.targetPlatform);
    assert.deepEqual(plan.stateProjectionSurface, input.stateProjectionSurface);
    assert.equal(plan.generationCustody.durableWorkspaceRoot, 'platform/android');
    assert.equal(plan.generationCustody.durableWorkspaceMutation, false);
    assert.ok(plan.constructionUnits.every((entry) => entry.implementationEvidence === false));
    assert.ok(plan.constructionUnits.every((entry) => entry.materializationState === 'HELD'));
    assert.equal(plan.boundaries.composeImplementation, false);
    assert.equal(plan.boundaries.apkProduced, false);
    assert.equal(plan.boundaries.deviceOrEmulatorLaunch, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('A4 preserves mixed dispositions without fabricating implementation evidence', () => {
  const { blueprint } = fixture();
  const sources = enumerateBlueprintSources(blueprint);
  const overrides = new Map([
    [sources[0].ancestryPath, { ancestryPath: sources[0].ancestryPath, disposition: 'MAPPED', platformBindingRefOrNull: 'binding.android.contract.a4' }],
    [sources[1].ancestryPath, { ancestryPath: sources[1].ancestryPath, disposition: 'PLATFORM_SPECIFIC', platformBindingRefOrNull: 'binding.android.adapter.a4' }],
    [sources[2].ancestryPath, { ancestryPath: sources[2].ancestryPath, disposition: 'HELD', reasonOrNull: 'held by A4 test' }],
    [sources[3].ancestryPath, { ancestryPath: sources[3].ancestryPath, disposition: 'UNSUPPORTED', reasonOrNull: 'unsupported by A4 test' }]
  ]);
  const root = tempRoot();
  try {
    generateAndroidProjectPracticum({ constructionBlueprint: a3Blueprint(a0Mapping(overrides)), outputRoot: root });
    const plan = readGenerated(root, 'generated/project-plan.json');
    const byPath = new Map(plan.constructionUnits.map((entry) => [entry.ancestryPath, entry]));
    assert.equal(byPath.get(sources[0].ancestryPath).materializationState, 'PLANNED_CONTRACT_PROJECTION');
    assert.equal(byPath.get(sources[1].ancestryPath).materializationState, 'PLANNED_ANDROID_ADAPTER');
    assert.equal(byPath.get(sources[2].ancestryPath).materializationState, 'HELD');
    assert.equal(byPath.get(sources[3].ancestryPath).materializationState, 'UNSUPPORTED');
    assert.ok(plan.constructionUnits.every((entry) => entry.implementationEvidence === false));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('A4 preserves the accepted numeric source blueprint contractVersion without inventing a new type contract', () => {
  const input = a3Blueprint();
  assert.equal(input.sourceBlueprint.contractVersion, 1);
  const root = tempRoot();
  try {
    generateAndroidProjectPracticum({ constructionBlueprint: input, outputRoot: root });
    const plan = readGenerated(root, 'generated/project-plan.json');
    const carried = readGenerated(root, 'generated/android-construction-blueprint.json');
    assert.equal(plan.sourceBlueprint.contractVersion, 1);
    assert.equal(carried.sourceBlueprint.contractVersion, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('A4 rejects Universal Blueprint and raw A0 input instead of bypassing A3', () => {
  const root = tempRoot();
  try {
    const { blueprint } = fixture();
    assert.throws(() => generateAndroidProjectPracticum({ constructionBlueprint: blueprint, outputRoot: root }), /schemaVersion must equal vexlife\.android-construction-blueprint\/v0/u);
    assert.throws(() => generateAndroidProjectPracticum({ constructionBlueprint: a0Mapping(), outputRoot: root }), /schemaVersion must equal vexlife\.android-construction-blueprint\/v0/u);
    assert.deepEqual(fs.readdirSync(root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('A4 rejects accepted identity drift before filesystem effects', () => {
  const cases = [
    ['foundation', 'registryRef', 'registry.fake', /foundation\.registryRef must equal/u],
    ['foundation', 'ownerRef', 'github.issue.fake', /foundation\.ownerRef must equal/u],
    ['targetPlatform', 'language', 'Rust', /targetPlatform\.language must equal Kotlin/u],
    ['targetPlatform', 'ui', 'XML', /targetPlatform\.ui must equal Jetpack Compose/u],
    ['stateProjectionSurface', 'semanticOwnerRef', 'module.fake', /stateProjectionSurface\.semanticOwnerRef must equal/u],
    ['stateProjectionSurface', 'workspacePath', 'platform/android/other', /stateProjectionSurface\.workspacePath must equal/u]
  ];
  for (const [parent, field, value, expected] of cases) {
    const input = structuredClone(a3Blueprint());
    input[parent][field] = value;
    const root = tempRoot();
    try {
      assert.throws(() => generateAndroidProjectPracticum({ constructionBlueprint: input, outputRoot: root }), expected);
      assert.deepEqual(fs.readdirSync(root), []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('A4 rejects duplicate, reordered, or mapping-divergent construction units', () => {
  const duplicate = structuredClone(a3Blueprint());
  duplicate.constructionUnits.splice(1, 0, structuredClone(duplicate.constructionUnits[0]));
  const reordered = structuredClone(a3Blueprint());
  reordered.constructionUnits = [...reordered.constructionUnits].reverse();
  const divergent = structuredClone(a3Blueprint());
  divergent.constructionUnits[0].sourcePath = 'forged/source.json';
  for (const input of [duplicate, reordered, divergent]) {
    const root = tempRoot();
    try {
      assert.throws(() => generateAndroidProjectPracticum({ constructionBlueprint: input, outputRoot: root }), /align one-to-one|drifted from mapping field|strictly ordered/u);
      assert.deepEqual(fs.readdirSync(root), []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('A4 requires an absolute empty non-symlink output root and preserves caller content', () => {
  const input = a3Blueprint();
  assert.throws(() => generateAndroidProjectPracticum({ constructionBlueprint: input, outputRoot: 'relative-output' }), /absolute path/u);
  const nonempty = tempRoot();
  fs.writeFileSync(path.join(nonempty, 'caller.txt'), 'keep me\n');
  try {
    assert.throws(() => generateAndroidProjectPracticum({ constructionBlueprint: input, outputRoot: nonempty }), /must be empty/u);
    assert.equal(fs.readFileSync(path.join(nonempty, 'caller.txt'), 'utf8'), 'keep me\n');
  } finally {
    fs.rmSync(nonempty, { recursive: true, force: true });
  }
  if (process.platform !== 'win32') {
    const parent = tempRoot(), target = path.join(parent, 'target'), link = path.join(parent, 'link');
    fs.mkdirSync(target);
    fs.symlinkSync(target, link, 'dir');
    try {
      assert.throws(() => generateAndroidProjectPracticum({ constructionBlueprint: input, outputRoot: link }), /symbolic link/u);
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  }
});

test('A4 rejects repository product-custody output roots before generated files are written', () => {
  const input = a3Blueprint();
  const repositoryLocal = fs.mkdtempSync(path.join(repoRoot, '.a4-practicum-custody-'));
  try {
    assert.throws(
      () => generateAndroidProjectPracticum({ constructionBlueprint: input, outputRoot: repositoryLocal }),
      /inside VexLife source custody is forbidden/u
    );
    assert.deepEqual(fs.readdirSync(repositoryLocal), []);
  } finally {
    fs.rmSync(repositoryLocal, { recursive: true, force: true });
  }

  const generatedBase = path.join(repoRoot, 'generated');
  fs.mkdirSync(generatedBase, { recursive: true });
  const sourceExcluded = fs.mkdtempSync(path.join(generatedBase, 'a4-practicum-custody-'));
  try {
    const result = generateAndroidProjectPracticum({ constructionBlueprint: input, outputRoot: sourceExcluded });
    assert.equal(result.generatedPaths.length, 6);
  } finally {
    fs.rmSync(sourceExcluded, { recursive: true, force: true });
  }
});

test('A4 rejects unknown A3 contract fields before filesystem effects', () => {
  const cases = [
    ['top-level', (value) => { value.unreviewedEffect = true; }],
    ['source blueprint', (value) => { value.sourceBlueprint.unreviewedIdentity = 'forged'; }],
    ['foundation', (value) => { value.foundation.unreviewedOwnerBinding = 'forged'; }],
    ['target platform', (value) => { value.targetPlatform.unreviewedRuntimeSemantics = 'forged'; }],
    ['state projection', (value) => { value.stateProjectionSurface.eventLedgerOverride = true; }],
    ['generation boundary', (value) => { value.generationBoundary.unreviewedCustody = 'forged'; }],
    ['boundaries', (value) => { value.boundaries.unreviewedEffect = false; }],
    ['disposition counts', (value) => { value.dispositionCounts.UNREVIEWED = 0; }],
    ['mapping', (value) => { value.mappings[0].unreviewedEffect = false; }],
    ['construction unit', (value) => { value.constructionUnits[0].unreviewedEffect = false; }]
  ];

  for (const [label, mutate] of cases) {
    const input = structuredClone(a3Blueprint());
    mutate(input);
    const root = tempRoot();
    try {
      assert.throws(
        () => generateAndroidProjectPracticum({ constructionBlueprint: input, outputRoot: root }),
        /must contain exactly/u,
        label + ' extra field must fail closed'
      );
      assert.deepEqual(fs.readdirSync(root), []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('A4 leaves durable platform/android byte-identical', () => {
  const durable = path.join(repoRoot, 'platform/android');
  const before = new Map(files(durable).map((relative) => [relative, digest(path.join(durable, ...relative.split('/')))]));
  const root = tempRoot();
  try {
    generateAndroidProjectPracticum({ constructionBlueprint: a3Blueprint(), outputRoot: root });
    const after = new Map(files(durable).map((relative) => [relative, digest(path.join(durable, ...relative.split('/')))]));
    assert.deepEqual(after, before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('A4 source has no process, network, Git, or generic-generator bypass', () => {
  const source = fs.readFileSync(path.join(here, '../src/core/android-project-generator.mjs'), 'utf8');
  for (const forbidden of ['node:child_process', 'generatePlatform(', 'fetch(', 'gh ', 'git ', 'platform-generator.mjs']) {
    assert.equal(source.includes(forbidden), false, 'A4 source must not contain ' + forbidden);
  }
});

// [VXG RealForever]
