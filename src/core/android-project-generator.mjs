import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ANDROID_PROJECT_PRACTICUM_SCHEMA = 'vexlife.android-project-practicum/v0';
export const ANDROID_PROJECT_GENERATOR_STAGE = 'A4_MINIMAL_GENERATED_ANDROID_PROJECT_PRACTICUM';

const A3_SCHEMA = 'vexlife.android-construction-blueprint/v0';
const A3_STAGE = 'A3_ANDROID_CONSTRUCTION_BLUEPRINT_COMPILER';
const FOUNDATION = {
  registryRef: 'registry.vexlife.android-construction-foundation.001',
  ownerRef: 'github.issue.vexlife.783',
  parentOrchestrationRef: 'github.issue.vexlife.624'
};
const TARGET = {
  id: 'android',
  platformRef: 'platform.android',
  language: 'Kotlin',
  ui: 'Jetpack Compose',
  state: 'StateFlow'
};
const STATE_PROJECTION = {
  semanticOwnerRef: 'module.vexlife.core.state-relay',
  workspacePath: 'platform/android/state-relay',
  snapshotType: 'vexlife.android.state.VexStateSnapshot',
  projectionType: 'vexlife.android.state.VexStateProjection',
  stateFlowIsEventLedger: false
};
const A3_BOUNDARIES = [
  'canonicalRegistryWrites', 'stateRelayRuntimeMutation', 'androidRuntimeGeneration',
  'projectGeneration', 'compose', 'gradle', 'manifest', 'resources', 'home', 'network',
  'model', 'device', 'install', 'signing', 'publication'
];
const CONSTRUCTION_STATE = {
  MAPPED: 'CONTRACT_PROJECTION_REQUIRED',
  PLATFORM_SPECIFIC: 'ANDROID_ADAPTER_REQUIRED',
  HELD: 'HELD',
  UNSUPPORTED: 'UNSUPPORTED'
};
const MATERIALIZATION_STATE = {
  MAPPED: 'PLANNED_CONTRACT_PROJECTION',
  PLATFORM_SPECIFIC: 'PLANNED_ANDROID_ADAPTER',
  HELD: 'HELD',
  UNSUPPORTED: 'UNSUPPORTED'
};
const GENERATED_PATHS = [
  'README.md',
  'build.gradle.kts',
  'generated/android-construction-blueprint.json',
  'generated/project-plan.json',
  'gradle.properties',
  'settings.gradle.kts'
];

const A3_BLUEPRINT_KEYS = [
  'schemaVersion', 'compilerRef', 'compilerStage', 'sourceMappingRef', 'sourceBlueprint',
  'foundation', 'targetPlatform', 'canonicalAncestryRequired', 'registrationState', 'effects',
  'mappings', 'constructionUnits', 'dispositionCounts', 'stateProjectionSurface',
  'generationBoundary', 'boundaries'
];
const SOURCE_BLUEPRINT_KEYS = ['schemaVersion', 'blueprintRef', 'version', 'contractVersion'];
const FOUNDATION_KEYS = ['registryRef', 'ownerRef', 'parentOrchestrationRef', 'mappingPipeline'];
const TARGET_KEYS = Object.keys(TARGET);
const STATE_PROJECTION_KEYS = Object.keys(STATE_PROJECTION);
const GENERATION_BOUNDARY_KEYS = [
  'durableWorkspaceRoot', 'existingHandwrittenRoots', 'generatedAndHandwrittenBoundaryRequired',
  'projectGeneratorStage', 'generatedPathSelectionState', 'projectGenerationAllowed'
];
const MAPPING_KEYS = ['ancestryPath', 'sourcePath', 'disposition', 'platformBindingRefOrNull', 'reasonOrNull'];
const CONSTRUCTION_UNIT_KEYS = [...MAPPING_KEYS, 'constructionState'];
const DISPOSITION_COUNT_KEYS = ['MAPPED', 'PLATFORM_SPECIFIC', 'HELD', 'UNSUPPORTED'];
const SOURCE_REPOSITORY_ROOT = fs.realpathSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
);
const SOURCE_GENERATED_ROOT = path.resolve(SOURCE_REPOSITORY_ROOT, 'generated');

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(label + ' must be an object');
  return value;
}
function exactKeys(value, expectedKeys, label) {
  const actual = Object.keys(object(value, label)).sort(compare);
  const expected = [...expectedKeys].sort(compare);
  if (actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) {
    throw new Error(label + ' must contain exactly: ' + expected.join(', '));
  }
  return value;
}
function string(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(label + ' must be a non-empty string');
  return value;
}
function exact(value, expected, label) {
  if (value !== expected) throw new Error(label + ' must equal ' + String(expected));
}
function clone(value) { return structuredClone(value); }
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort(compare).map((key) => [key, canonical(value[key])]));
}
function json(value) { return JSON.stringify(canonical(value), null, 2) + '\n'; }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

function validateIdentity(value, expected, label, extraKeys = []) {
  const actual = exactKeys(value, [...Object.keys(expected), ...extraKeys], label);
  for (const [field, expectedValue] of Object.entries(expected)) exact(actual[field], expectedValue, label + '.' + field);
  return clone(actual);
}

function validatePipeline(foundation) {
  const expected = [
    'UNIVERSAL_BLUEPRINT',
    'BLUEPRINT_TO_BLUEPRINT_MAPPER',
    'ANDROID_CONSTRUCTION_BLUEPRINT',
    'ANDROID_PROJECT_GENERATOR',
    'KOTLIN_COMPOSE_MANIFEST_GRADLE_RESOURCES_TESTS'
  ];
  if (!Array.isArray(foundation.mappingPipeline) ||
      foundation.mappingPipeline.length !== expected.length ||
      foundation.mappingPipeline.some((entry, index) => entry !== expected[index])) {
    throw new Error('constructionBlueprint.foundation.mappingPipeline must match the accepted Android construction pipeline');
  }
}

function validateBoundary(value) {
  const boundary = exactKeys(value, GENERATION_BOUNDARY_KEYS, 'constructionBlueprint.generationBoundary');
  exact(boundary.durableWorkspaceRoot, 'platform/android', 'constructionBlueprint.generationBoundary.durableWorkspaceRoot');
  if (!Array.isArray(boundary.existingHandwrittenRoots) ||
      boundary.existingHandwrittenRoots.length !== 1 ||
      boundary.existingHandwrittenRoots[0] !== 'platform/android/state-relay') {
    throw new Error('constructionBlueprint.generationBoundary.existingHandwrittenRoots must preserve the accepted A2 root');
  }
  exact(boundary.generatedAndHandwrittenBoundaryRequired, true, 'constructionBlueprint.generationBoundary.generatedAndHandwrittenBoundaryRequired');
  exact(boundary.projectGeneratorStage, ANDROID_PROJECT_GENERATOR_STAGE, 'constructionBlueprint.generationBoundary.projectGeneratorStage');
  exact(boundary.generatedPathSelectionState, 'HELD_FOR_A4_SOURCE_PLACEMENT', 'constructionBlueprint.generationBoundary.generatedPathSelectionState');
  exact(boundary.projectGenerationAllowed, false, 'constructionBlueprint.generationBoundary.projectGenerationAllowed');
  return clone(boundary);
}

function validateOrdered(value) {
  if (!Array.isArray(value.mappings) || value.mappings.length === 0) throw new TypeError('constructionBlueprint.mappings must be a non-empty array');
  if (!Array.isArray(value.constructionUnits) || value.constructionUnits.length !== value.mappings.length) {
    throw new Error('constructionBlueprint.constructionUnits must align one-to-one with mappings');
  }
  const mappings = [], units = [], seen = new Set();
  const counts = { MAPPED: 0, PLATFORM_SPECIFIC: 0, HELD: 0, UNSUPPORTED: 0 };
  let prior = null;
  for (let index = 0; index < value.mappings.length; index += 1) {
    const mapping = exactKeys(value.mappings[index], MAPPING_KEYS, 'constructionBlueprint.mappings[' + index + ']');
    const unit = exactKeys(value.constructionUnits[index], CONSTRUCTION_UNIT_KEYS, 'constructionBlueprint.constructionUnits[' + index + ']');
    const ancestryPath = string(mapping.ancestryPath, 'constructionBlueprint.mappings[' + index + '].ancestryPath');
    if (seen.has(ancestryPath)) throw new Error('duplicate construction ancestry ' + ancestryPath);
    if (prior !== null && compare(prior, ancestryPath) >= 0) throw new Error('construction ancestry must be strictly ordered');
    seen.add(ancestryPath);
    prior = ancestryPath;

    const disposition = string(mapping.disposition, 'constructionBlueprint.mappings[' + index + '].disposition');
    if (!Object.hasOwn(CONSTRUCTION_STATE, disposition)) throw new Error('unsupported construction disposition ' + disposition);
    const sourcePath = string(mapping.sourcePath, 'constructionBlueprint.mappings[' + index + '].sourcePath');
    const platformBindingRefOrNull = mapping.platformBindingRefOrNull ?? null;
    const reasonOrNull = mapping.reasonOrNull ?? null;
    if (platformBindingRefOrNull !== null) string(platformBindingRefOrNull, 'platformBindingRefOrNull');
    if (reasonOrNull !== null) string(reasonOrNull, 'reasonOrNull');
    if (['HELD', 'UNSUPPORTED'].includes(disposition) && (platformBindingRefOrNull !== null || reasonOrNull === null)) {
      throw new Error(disposition + ' construction must preserve held/unsupported truth');
    }
    for (const [field, expectedValue] of Object.entries({ ancestryPath, sourcePath, disposition, platformBindingRefOrNull, reasonOrNull })) {
      if ((unit[field] ?? null) !== expectedValue) throw new Error('construction unit ' + index + ' drifted from mapping field ' + field);
    }
    exact(unit.constructionState, CONSTRUCTION_STATE[disposition], 'constructionBlueprint.constructionUnits[' + index + '].constructionState');
    counts[disposition] += 1;
    mappings.push(clone(mapping));
    units.push(clone(unit));
  }
  const supplied = exactKeys(value.dispositionCounts, DISPOSITION_COUNT_KEYS, 'constructionBlueprint.dispositionCounts');
  for (const [field, count] of Object.entries(counts)) exact(supplied[field], count, 'constructionBlueprint.dispositionCounts.' + field);
  return { mappings, units, counts };
}

function validateBlueprint(input) {
  const value = object(input, 'constructionBlueprint');
  exact(value.schemaVersion, A3_SCHEMA, 'constructionBlueprint.schemaVersion');
  exactKeys(value, A3_BLUEPRINT_KEYS, 'constructionBlueprint');
  exact(value.compilerStage, A3_STAGE, 'constructionBlueprint.compilerStage');
  const compilerRef = string(value.compilerRef, 'constructionBlueprint.compilerRef');
  const sourceMappingRef = string(value.sourceMappingRef, 'constructionBlueprint.sourceMappingRef');
  const sourceBlueprint = exactKeys(value.sourceBlueprint, SOURCE_BLUEPRINT_KEYS, 'constructionBlueprint.sourceBlueprint');
  string(sourceBlueprint.schemaVersion, 'constructionBlueprint.sourceBlueprint.schemaVersion');
  string(sourceBlueprint.blueprintRef, 'constructionBlueprint.sourceBlueprint.blueprintRef');
  string(sourceBlueprint.version, 'constructionBlueprint.sourceBlueprint.version');
  exact(value.canonicalAncestryRequired, true, 'constructionBlueprint.canonicalAncestryRequired');
  exact(value.registrationState, 'INERT_NOT_COMPOSED', 'constructionBlueprint.registrationState');
  exact(value.effects, false, 'constructionBlueprint.effects');

  const foundation = validateIdentity(value.foundation, FOUNDATION, 'constructionBlueprint.foundation', ['mappingPipeline']);
  exactKeys(foundation, FOUNDATION_KEYS, 'constructionBlueprint.foundation');
  validatePipeline(foundation);
  const targetPlatform = validateIdentity(value.targetPlatform, TARGET, 'constructionBlueprint.targetPlatform');
  exactKeys(targetPlatform, TARGET_KEYS, 'constructionBlueprint.targetPlatform');
  const stateProjectionSurface = validateIdentity(value.stateProjectionSurface, STATE_PROJECTION, 'constructionBlueprint.stateProjectionSurface');
  exactKeys(stateProjectionSurface, STATE_PROJECTION_KEYS, 'constructionBlueprint.stateProjectionSurface');
  const generationBoundary = validateBoundary(value.generationBoundary);
  const boundaries = exactKeys(value.boundaries, A3_BOUNDARIES, 'constructionBlueprint.boundaries');
  for (const field of A3_BOUNDARIES) exact(boundaries[field], false, 'constructionBlueprint.boundaries.' + field);
  const ordered = validateOrdered(value);

  return {
    compilerRef,
    sourceMappingRef,
    sourceBlueprint: clone(sourceBlueprint),
    foundation,
    targetPlatform,
    stateProjectionSurface,
    generationBoundary,
    boundaries: clone(boundaries),
    mappings: ordered.mappings,
    constructionUnits: ordered.units,
    dispositionCounts: ordered.counts
  };
}

function isWithin(root, targetPath) {
  const relative = path.relative(root, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function validateOutputRoot(outputRoot) {
  const root = string(outputRoot, 'outputRoot');
  if (!path.isAbsolute(root)) throw new Error('outputRoot must be an absolute path');
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink()) throw new Error('outputRoot cannot be a symbolic link');
  if (!stat.isDirectory()) throw new Error('outputRoot must be a directory');
  if (fs.readdirSync(root).length !== 0) throw new Error('outputRoot must be empty before generation');
  const realRoot = fs.realpathSync(root);
  if (isWithin(SOURCE_REPOSITORY_ROOT, realRoot) && !isWithin(SOURCE_GENERATED_ROOT, realRoot)) {
    throw new Error('outputRoot inside VexLife source custody is forbidden; use an external or source-excluded generated practicum root');
  }
  return realRoot;
}

function target(root, relativePath) {
  if (!relativePath || relativePath.startsWith('/') || relativePath.includes('\\')) throw new Error('generated path is unsafe: ' + relativePath);
  const segments = relativePath.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) throw new Error('generated path contains unsafe segments: ' + relativePath);
  const absolute = path.resolve(root, ...segments);
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('generated path escapes outputRoot: ' + relativePath);
  return absolute;
}

function projectPlan(value, blueprintSha256) {
  return {
    schemaVersion: ANDROID_PROJECT_PRACTICUM_SCHEMA,
    generatorStage: ANDROID_PROJECT_GENERATOR_STAGE,
    constructionBlueprintSha256: blueprintSha256,
    sourceMappingRef: value.sourceMappingRef,
    sourceBlueprint: clone(value.sourceBlueprint),
    foundation: clone(value.foundation),
    targetPlatform: clone(value.targetPlatform),
    stateProjectionSurface: clone(value.stateProjectionSurface),
    generationCustody: {
      outputClass: 'CALLER_OWNED_DISPOSABLE_PRACTICUM_ROOT',
      durableWorkspaceRoot: value.generationBoundary.durableWorkspaceRoot,
      durableWorkspaceMutation: false,
      generatedAndHandwrittenBoundaryRequired: true
    },
    constructionUnits: value.constructionUnits.map((unit) => ({
      ancestryPath: unit.ancestryPath,
      sourcePath: unit.sourcePath,
      disposition: unit.disposition,
      platformBindingRefOrNull: unit.platformBindingRefOrNull ?? null,
      reasonOrNull: unit.reasonOrNull ?? null,
      constructionState: unit.constructionState,
      materializationState: MATERIALIZATION_STATE[unit.disposition],
      implementationEvidence: false
    })),
    boundaries: {
      composeImplementation: false,
      androidManifestProductAdoption: false,
      androidResourcesProductAdoption: false,
      durableAndroidWorkspaceMutation: false,
      androidSdkOrAgpInstallation: false,
      buildPassClaimed: false,
      apkProduced: false,
      deviceOrEmulatorLaunch: false,
      home: false,
      network: false,
      model: false,
      install: false,
      signing: false,
      publication: false
    }
  };
}

function filesFor(value) {
  const constructionJson = json({
    schemaVersion: A3_SCHEMA,
    compilerRef: value.compilerRef,
    compilerStage: A3_STAGE,
    sourceMappingRef: value.sourceMappingRef,
    sourceBlueprint: value.sourceBlueprint,
    foundation: value.foundation,
    targetPlatform: value.targetPlatform,
    canonicalAncestryRequired: true,
    registrationState: 'INERT_NOT_COMPOSED',
    effects: false,
    mappings: value.mappings,
    constructionUnits: value.constructionUnits,
    dispositionCounts: value.dispositionCounts,
    stateProjectionSurface: value.stateProjectionSurface,
    generationBoundary: value.generationBoundary,
    boundaries: value.boundaries
  });
  const blueprintSha256 = sha256(Buffer.from(constructionJson, 'utf8'));
  const plan = projectPlan(value, blueprintSha256);
  return {
    blueprintSha256,
    files: new Map([
      ['README.md', [
        '# VexLife Android A4 project-generation practicum',
        '',
        'Generated from A3 construction blueprint ' + blueprintSha256 + '.',
        '',
        'This disposable scaffold proves deterministic project generation only. It is not durable Android adoption, Compose/Manifest implementation, an APK, or device evidence.',
        '',
        '<!-- [VXG RealForever] -->',
        ''
      ].join('\n')],
      ['build.gradle.kts', [
        'tasks.register("verifyPracticum") {',
        '    doLast {',
        '        println("VexLife Android A4 project-generation practicum")',
        '    }',
        '}',
        '',
        '// [VXG RealForever]',
        ''
      ].join('\n')],
      ['generated/android-construction-blueprint.json', constructionJson],
      ['generated/project-plan.json', json(plan)],
      ['gradle.properties', [
        'org.gradle.configuration-cache=true',
        'org.gradle.caching=true',
        'org.gradle.warning.mode=all',
        '',
        '# [VXG RealForever]',
        ''
      ].join('\n')],
      ['settings.gradle.kts', [
        'rootProject.name = "vexlife-android-a4-practicum"',
        '',
        '// [VXG RealForever]',
        ''
      ].join('\n')]
    ])
  };
}

export function generateAndroidProjectPracticum({ constructionBlueprint, outputRoot } = {}) {
  const value = validateBlueprint(constructionBlueprint);
  const root = validateOutputRoot(outputRoot);
  const formed = filesFor(value);
  const paths = [...formed.files.keys()].sort(compare);
  if (paths.length !== GENERATED_PATHS.length || paths.some((entry, index) => entry !== GENERATED_PATHS[index])) {
    throw new Error('A4 generated path set drifted from the admitted practicum');
  }

  const inventory = [];
  for (const relativePath of paths) {
    const absolute = target(root, relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    const content = formed.files.get(relativePath);
    fs.writeFileSync(absolute, content, { encoding: 'utf8', flag: 'wx' });
    const bytes = Buffer.from(content, 'utf8');
    inventory.push({ path: relativePath, bytes: bytes.length, sha256: sha256(bytes) });
  }

  return Object.freeze({
    schemaVersion: 'vexlife.android-project-practicum-result/v0',
    generatorStage: ANDROID_PROJECT_GENERATOR_STAGE,
    constructionBlueprintSha256: formed.blueprintSha256,
    generatedPaths: Object.freeze(paths),
    inventory: Object.freeze(inventory.map((entry) => Object.freeze({ ...entry }))),
    effects: Object.freeze({
      localFilesystemMaterializationPerformed: true,
      durableAndroidWorkspaceMutationPerformed: false,
      composeImplementationPerformed: false,
      androidManifestProductAdoptionPerformed: false,
      androidResourcesProductAdoptionPerformed: false,
      buildPerformed: false,
      apkProduced: false,
      deviceOrEmulatorLaunchPerformed: false,
      networkPerformed: false,
      modelPerformed: false,
      installPerformed: false,
      signingPerformed: false,
      publicationPerformed: false
    })
  });
}

// [VXG RealForever]
