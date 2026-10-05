import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enumerateBlueprintSources, mapBlueprintToPlatformBlueprint } from '../src/core/blueprint-mapper.mjs';
import { compileAndroidConstructionBlueprint } from '../src/core/android-construction-compiler.mjs';
import { generateAndroidProjectPracticum } from '../src/core/android-project-generator.mjs';
import {
  ANDROID_TEST_EVIDENCE_GENERATOR_STAGE,
  ANDROID_TEST_EVIDENCE_OBLIGATIONS_SCHEMA,
  compileAndroidTestEvidenceObligations,
  currentA5ObligationClasses,
  heldA5ObligationClasses
} from '../src/core/android-test-evidence-obligations.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.VEXLIFE_A5_TEST_ROOT || path.resolve(here, '..');

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
    reasonOrNull: 'A5 fixture keeps product implementation held unless explicitly overridden.'
  }));
}

function a0Mapping(
  overrides = new Map(),
  mappingRef = 'mapping.vexlife.android-construction.a5.test'
) {
  const { blueprint, platforms, foundation } = fixture();
  return mapBlueprintToPlatformBlueprint({
    sourceBlueprint: blueprint,
    platformRegistry: platforms,
    platformRef: 'platform.android',
    foundation,
    mappingRef,
    mappingRules: rulesFor(blueprint, overrides)
  });
}

function a3Blueprint(mapping = a0Mapping()) {
  return compileAndroidConstructionBlueprint({
    mapping,
    compilerRef: 'compiler.vexlife.android-construction.a5.test'
  });
}

function a4Evidence(mapping = a0Mapping()) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-a5-a4-'));
  const constructionBlueprint = a3Blueprint(mapping);
  const generationResult = generateAndroidProjectPracticum({
    constructionBlueprint,
    outputRoot: root
  });
  const projectPlan = readGenerated(root, 'generated/project-plan.json');
  return { root, constructionBlueprint, projectPlan, generationResult };
}

function readGenerated(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, ...relativePath.split('/')), 'utf8'));
}

function compile(projectPlan, generationResult) {
  return compileAndroidTestEvidenceObligations({
    projectPlan,
    generationResult,
    compilerRef: 'compiler.vexlife.android-test-evidence.a5.test'
  });
}

function byClass(output, obligationClass) {
  return output.obligations.filter((item) => item.obligationClass === obligationClass);
}

test('A5 deterministically compiles accepted A4 plan/result into immutable unproven obligations', () => {
  const evidence = a4Evidence();
  try {
    const one = compile(evidence.projectPlan, evidence.generationResult);
    const two = compile(evidence.projectPlan, evidence.generationResult);
    assert.deepEqual(one, two);
    assert.equal(one.schemaVersion, ANDROID_TEST_EVIDENCE_OBLIGATIONS_SCHEMA);
    assert.equal(one.compilerStage, ANDROID_TEST_EVIDENCE_GENERATOR_STAGE);
    assert.equal(one.sourceA4.constructionBlueprintSha256, evidence.generationResult.constructionBlueprintSha256);
    assert.equal(one.summary.evidenceExecutionPerformed, false);
    assert.equal(one.summary.evidenceReceiptFormed, false);
    assert.ok(one.obligations.every((item) => item.evidenceState === 'UNPROVEN'));
    assert.equal(Object.isFrozen(one), true);
    assert.equal(Object.isFrozen(one.obligations), true);
  } finally {
    fs.rmSync(evidence.root, { recursive: true, force: true });
  }
});

test('A5 binds every obligation ref to one exact A4 identity fingerprint', () => {
  const first = a4Evidence();
  const second = a4Evidence(a0Mapping(
    new Map(),
    'mapping.vexlife.android-construction.a5.alternate'
  ));
  try {
    const one = compile(first.projectPlan, first.generationResult);
    const two = compile(second.projectPlan, second.generationResult);

    assert.notEqual(
      one.sourceA4.sourceA4IdentityFingerprint,
      two.sourceA4.sourceA4IdentityFingerprint
    );
    assert.ok(one.obligations.every(
      (item) => item.sourceA4IdentityFingerprint === one.sourceA4.sourceA4IdentityFingerprint
    ));
    assert.ok(two.obligations.every(
      (item) => item.sourceA4IdentityFingerprint === two.sourceA4.sourceA4IdentityFingerprint
    ));

    const secondRefs = new Set(two.obligations.map((item) => item.obligationRef));
    assert.equal(
      one.obligations.some((item) => secondRefs.has(item.obligationRef)),
      false,
      'distinct accepted A4 identities must not alias any A5 obligationRef'
    );
  } finally {
    fs.rmSync(first.root, { recursive: true, force: true });
    fs.rmSync(second.root, { recursive: true, force: true });
  }
});

test('A5 binds every A4 generated path to exact bytes and sha256 without claiming proof', () => {
  const evidence = a4Evidence();
  try {
    const output = compile(evidence.projectPlan, evidence.generationResult);
    const inventoryObligations = byClass(output, 'GENERATED_TREE_INVENTORY');
    assert.equal(inventoryObligations.length, evidence.generationResult.inventory.length);
    for (const [index, item] of inventoryObligations.entries()) {
      const expected = evidence.generationResult.inventory[index];
      assert.equal(item.obligationState, 'REQUIRED');
      assert.equal(item.evidenceState, 'UNPROVEN');
      assert.deepEqual(item.expectation, expected);
    }
  } finally {
    fs.rmSync(evidence.root, { recursive: true, force: true });
  }
});

test('A5 preserves A4 ancestry, dispositions, held reasons and implementationEvidence=false', () => {
  const { blueprint } = fixture();
  const sources = enumerateBlueprintSources(blueprint);
  const overrides = new Map([
    [sources[0].ancestryPath, { ancestryPath: sources[0].ancestryPath, disposition: 'MAPPED', platformBindingRefOrNull: 'binding.android.a5.contract' }],
    [sources[1].ancestryPath, { ancestryPath: sources[1].ancestryPath, disposition: 'PLATFORM_SPECIFIC', platformBindingRefOrNull: 'binding.android.a5.adapter' }],
    [sources[2].ancestryPath, { ancestryPath: sources[2].ancestryPath, disposition: 'HELD', reasonOrNull: 'held by A5 test' }],
    [sources[3].ancestryPath, { ancestryPath: sources[3].ancestryPath, disposition: 'UNSUPPORTED', reasonOrNull: 'unsupported by A5 test' }]
  ]);
  const evidence = a4Evidence(a0Mapping(overrides));
  try {
    const output = compile(evidence.projectPlan, evidence.generationResult);
    const ancestry = new Map(byClass(output, 'ANCESTRY_PRESERVATION').map((item) => [item.expectation.ancestryPath, item]));
    for (const unit of evidence.projectPlan.constructionUnits) {
      assert.equal(ancestry.get(unit.ancestryPath).expectation.implementationEvidence, false);
      assert.equal(ancestry.get(unit.ancestryPath).expectation.disposition, unit.disposition);
      assert.equal(ancestry.get(unit.ancestryPath).expectation.reasonOrNull, unit.reasonOrNull);
    }
    const heldTruth = byClass(output, 'HELD_UNSUPPORTED_TRUTH');
    const expectedHeldUnits = evidence.projectPlan.constructionUnits
      .filter((unit) => ['HELD', 'UNSUPPORTED'].includes(unit.disposition));
    assert.equal(heldTruth.length, expectedHeldUnits.length);
    const heldByAncestry = new Map(heldTruth.map((item) => [item.subjectRef.replace('construction-unit.', ''), item]));
    for (const unit of expectedHeldUnits) {
      const item = heldByAncestry.get(unit.ancestryPath);
      assert.ok(item, `missing HELD/UNSUPPORTED truth obligation for ${unit.ancestryPath}`);
      assert.equal(item.expectation.disposition, unit.disposition);
      assert.equal(item.expectation.reasonOrNull, unit.reasonOrNull);
      assert.equal(item.expectation.platformBindingRefOrNull, null);
      assert.equal(item.expectation.implementationEvidence, false);
    }
  } finally {
    fs.rmSync(evidence.root, { recursive: true, force: true });
  }
});

test('A5 emits every current required class and every later held class without SATISFIED evidence', () => {
  const evidence = a4Evidence();
  try {
    const output = compile(evidence.projectPlan, evidence.generationResult);
    for (const obligationClass of currentA5ObligationClasses) {
      assert.ok(output.obligations.some((item) => item.obligationClass === obligationClass), obligationClass);
    }
    for (const obligationClass of heldA5ObligationClasses) {
      const items = byClass(output, obligationClass);
      assert.equal(items.length, 1, obligationClass);
      assert.equal(items[0].obligationState, 'HELD');
      assert.equal(items[0].evidenceState, 'UNPROVEN');
    }
    assert.equal(output.obligations.some((item) => item.evidenceState === 'SATISFIED'), false);
  } finally {
    fs.rmSync(evidence.root, { recursive: true, force: true });
  }
});

test('A5 preserves accepted A4 source, Android and StateFlow identities exactly', () => {
  const evidence = a4Evidence();
  try {
    const output = compile(evidence.projectPlan, evidence.generationResult);
    assert.equal(output.sourceA4.sourceMappingRef, evidence.projectPlan.sourceMappingRef);
    assert.deepEqual(output.sourceA4.sourceBlueprint, evidence.projectPlan.sourceBlueprint);
    assert.deepEqual(output.sourceA4.foundation, evidence.projectPlan.foundation);
    assert.deepEqual(output.sourceA4.targetPlatform, evidence.projectPlan.targetPlatform);
    assert.deepEqual(output.sourceA4.stateProjectionSurface, evidence.projectPlan.stateProjectionSurface);
  } finally {
    fs.rmSync(evidence.root, { recursive: true, force: true });
  }
});

test('A5 rejects raw A3/A0 input and mismatched A4 plan/result identities', () => {
  const evidence = a4Evidence();
  try {
    assert.throws(
      () => compile(a3Blueprint(), evidence.generationResult),
      /projectPlan.schemaVersion must equal vexlife\.android-project-practicum\/v0/u
    );
    assert.throws(
      () => compile(a0Mapping(), evidence.generationResult),
      /projectPlan.schemaVersion must equal vexlife\.android-project-practicum\/v0/u
    );
    const mismatch = structuredClone(evidence.generationResult);
    mismatch.constructionBlueprintSha256 = '0'.repeat(64);
    assert.throws(
      () => compile(evidence.projectPlan, mismatch),
      /generationResult\.constructionBlueprintSha256 must equal/u
    );
  } finally {
    fs.rmSync(evidence.root, { recursive: true, force: true });
  }
});

test('A5 rejects generated inventory omission, reordering, extras and malformed digests', () => {
  const evidence = a4Evidence();
  try {
    const cases = [
      (result) => { result.inventory.pop(); },
      (result) => { result.inventory.reverse(); },
      (result) => { result.generatedPaths.push('extra.txt'); },
      (result) => { result.inventory[0].sha256 = 'BAD'; }
    ];
    for (const mutate of cases) {
      const result = structuredClone(evidence.generationResult);
      mutate(result);
      assert.throws(
        () => compile(evidence.projectPlan, result),
        /generatedPaths|inventory|sha256/u
      );
    }
  } finally {
    fs.rmSync(evidence.root, { recursive: true, force: true });
  }
});

test('A5 rejects A4 effect/boundary inflation before forming obligations', () => {
  const evidence = a4Evidence();
  try {
    const plan = structuredClone(evidence.projectPlan);
    plan.boundaries.buildPassClaimed = true;
    assert.throws(() => compile(plan, evidence.generationResult), /buildPassClaimed must equal false/u);

    const result = structuredClone(evidence.generationResult);
    result.effects.apkProduced = true;
    assert.throws(() => compile(evidence.projectPlan, result), /apkProduced must equal false/u);
  } finally {
    fs.rmSync(evidence.root, { recursive: true, force: true });
  }
});

test('A5 rejects unknown caller fields in A4 plan/result nested structures', () => {
  const evidence = a4Evidence();
  try {
    const cases = [
      ['plan', (plan, result) => { plan.unreviewedEvidence = true; }],
      ['sourceBlueprint', (plan, result) => { plan.sourceBlueprint.unreviewedEvidence = true; }],
      ['foundation', (plan, result) => { plan.foundation.unreviewedEvidence = true; }],
      ['targetPlatform', (plan, result) => { plan.targetPlatform.unreviewedEvidence = true; }],
      ['stateProjectionSurface', (plan, result) => { plan.stateProjectionSurface.unreviewedEvidence = true; }],
      ['generationCustody', (plan, result) => { plan.generationCustody.unreviewedEvidence = true; }],
      ['constructionUnit', (plan, result) => { plan.constructionUnits[0].unreviewedEvidence = true; }],
      ['planBoundaries', (plan, result) => { plan.boundaries.unreviewedEvidence = false; }],
      ['result', (plan, result) => { result.unreviewedEvidence = true; }],
      ['inventory', (plan, result) => { result.inventory[0].unreviewedEvidence = true; }],
      ['resultEffects', (plan, result) => { result.effects.unreviewedEvidence = false; }]
    ];
    for (const [label, mutate] of cases) {
      const plan = structuredClone(evidence.projectPlan);
      const result = structuredClone(evidence.generationResult);
      mutate(plan, result);
      assert.throws(
        () => compile(plan, result),
        /must contain exactly/u,
        `${label} extra field must fail closed`
      );
    }
  } finally {
    fs.rmSync(evidence.root, { recursive: true, force: true });
  }
});

test('A5 obligation identities are unique and order is deterministic', () => {
  const evidence = a4Evidence();
  try {
    const output = compile(evidence.projectPlan, evidence.generationResult);
    const refs = output.obligations.map((item) => item.obligationRef);
    assert.equal(new Set(refs).size, refs.length);
    const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
    const sorted = [...output.obligations].sort((left, right) =>
      compare(left.obligationClass, right.obligationClass) ||
      compare(left.subjectRef, right.subjectRef) ||
      compare(left.obligationRef, right.obligationRef)
    );
    assert.deepEqual(output.obligations, sorted);
  } finally {
    fs.rmSync(evidence.root, { recursive: true, force: true });
  }
});

test('A5 compiler source is pure claim formation and does not execute evidence or effects', () => {
  const source = fs.readFileSync(path.join(here, '../src/core/android-test-evidence-obligations.mjs'), 'utf8');
  for (const forbidden of [
    'node:fs', 'node:child_process', 'fetch(', 'spawn', 'execFile', 'writeFile',
    'generateAndroidProjectPracticum(', 'generatePlatform(', 'gh ', 'git '
  ]) {
    assert.equal(source.includes(forbidden), false, `A5 compiler source must not contain ${forbidden}`);
  }
});

// [VXG RealForever]
