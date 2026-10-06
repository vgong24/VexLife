#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enumerateBlueprintSources, mapBlueprintToPlatformBlueprint } from '../src/core/blueprint-mapper.mjs';
import { compileAndroidConstructionBlueprint } from '../src/core/android-construction-compiler.mjs';
import { generateAndroidProjectPracticum } from '../src/core/android-project-generator.mjs';
import { compileAndroidTestEvidenceObligations } from '../src/core/android-test-evidence-obligations.mjs';
import {
  ANDROID_R2_GENERATED_PATHS,
  ANDROID_R2_PROJECT_SKELETON_STAGE,
  checkAndroidR2ProjectSkeleton,
  generateAndroidR2ProjectSkeleton,
  renderAndroidR2ProjectSkeleton,
} from '../src/core/android-r2-project-skeleton.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const androidRoot = path.join(repoRoot, 'platform', 'android');

const EXISTING_PREIMAGES = Object.freeze({
  'README.md': 'f7deee74f730e8d7f670923e2214c2b73e4c645e1970be8dc8b36e01aa10cda0',
  'settings.gradle.kts': 'c79aa6d402288b01e61e8fecb467bf5359c5bb01e7c7db3c03ec7149901eac90',
  'build.gradle.kts': '1db291a6efd53cd9396c8f08e31afa31e8bee114d253363a14ce44de719c8fb1',
  'gradle/libs.versions.toml': '1a7f0833a862a2928ab9bb10a7fa3555e5d845fab53876fa5cddf293c1c9a17e',
});
const NEW_PATHS = Object.freeze(ANDROID_R2_GENERATED_PATHS.filter((item) => !(item in EXISTING_PREIMAGES)));

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, ...relativePath.split('/')), 'utf8'));
}
function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}
function mappingRules(blueprint) {
  return enumerateBlueprintSources(blueprint).map(({ ancestryPath }) => ({
    ancestryPath,
    disposition: 'HELD',
    reasonOrNull: 'R2 durable project adoption preserves canonical semantic ancestry without claiming feature implementation.',
  }));
}
function formAcceptedInput() {
  const blueprint = readJson('blueprint/vexlife.blueprint.json');
  const platforms = readJson('blueprint/platforms.json');
  const foundation = readJson('blueprint/android-construction-foundation.json');
  const mapping = mapBlueprintToPlatformBlueprint({
    sourceBlueprint: blueprint,
    platformRegistry: platforms,
    platformRef: 'platform.android',
    foundation,
    mappingRef: 'mapping.vexlife.android-construction.r2.durable-project-skeleton',
    mappingRules: mappingRules(blueprint),
  });
  const constructionBlueprint = compileAndroidConstructionBlueprint({
    mapping,
    compilerRef: 'compiler.vexlife.android-construction.r2.durable-project-skeleton',
  });
  const a4Root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-r2-a4-'));
  try {
    const generationResult = generateAndroidProjectPracticum({ constructionBlueprint, outputRoot: a4Root });
    const projectPlan = JSON.parse(fs.readFileSync(path.join(a4Root, 'generated', 'project-plan.json'), 'utf8'));
    const evidenceObligations = compileAndroidTestEvidenceObligations({
      projectPlan,
      generationResult,
      compilerRef: 'compiler.vexlife.android-test-evidence.r2.durable-project-skeleton',
    });
    return { projectPlan, generationResult, evidenceObligations };
  } finally {
    fs.rmSync(a4Root, { recursive: true, force: true });
  }
}
function assertWritePreconditions() {
  for (const [relativePath, expectedSha256] of Object.entries(EXISTING_PREIMAGES)) {
    const target = path.join(androidRoot, ...relativePath.split('/'));
    if (!fs.existsSync(target)) throw new Error(`R2_PREIMAGE_MISSING:${relativePath}`);
    const observed = sha256File(target);
    if (observed !== expectedSha256) throw new Error(`R2_PREIMAGE_DRIFT:${relativePath}:${observed}:${expectedSha256}`);
  }
  for (const relativePath of NEW_PATHS) {
    const target = path.join(androidRoot, ...relativePath.split('/'));
    if (fs.existsSync(target)) throw new Error(`R2_EXPECTED_ABSENCE_DRIFT:${relativePath}`);
  }
}
function resultProjection(result) {
  return {
    state: 'PASS',
    currentness: 'CURRENT',
    stage: ANDROID_R2_PROJECT_SKELETON_STAGE,
    architectureBaselineRef: result.architectureBaselineRef,
    generatedPaths: result.generatedPaths,
    inventory: result.inventory,
    semanticFingerprint: result.semanticFingerprint,
    heldImplementationChoices: result.heldImplementationChoices,
    effects: result.effects,
  };
}

const write = process.argv.includes('--write');
const check = process.argv.includes('--check');
if (write === check) {
  console.error('Use exactly one of --write or --check');
  process.exit(2);
}

const input = formAcceptedInput();
if (write) {
  assertWritePreconditions();
  const result = generateAndroidR2ProjectSkeleton({ ...input, outputRoot: androidRoot });
  console.log(JSON.stringify(resultProjection(result), null, 2));
} else {
  const rendered = renderAndroidR2ProjectSkeleton(input);
  const result = checkAndroidR2ProjectSkeleton({ ...input, outputRoot: androidRoot });
  console.log(JSON.stringify({
    state: result.state,
    currentness: result.state === 'PASS' ? 'CURRENT' : 'DRIFTED',
    stage: ANDROID_R2_PROJECT_SKELETON_STAGE,
    semanticFingerprint: rendered.semanticFingerprint,
    expectedPaths: result.expectedPaths,
    mismatches: result.mismatches,
  }, null, 2));
  if (result.state !== 'PASS') process.exitCode = 1;
}

// [VXG RealForever]
