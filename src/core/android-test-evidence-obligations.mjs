import crypto from 'node:crypto';

export const ANDROID_TEST_EVIDENCE_OBLIGATIONS_SCHEMA = 'vexlife.android-test-evidence-obligations/v0';
export const ANDROID_TEST_EVIDENCE_GENERATOR_STAGE = 'A5_TEST_AND_EVIDENCE_GENERATION';

const A4_PLAN_SCHEMA = 'vexlife.android-project-practicum/v0';
const A4_RESULT_SCHEMA = 'vexlife.android-project-practicum-result/v0';
const A4_STAGE = 'A4_MINIMAL_GENERATED_ANDROID_PROJECT_PRACTICUM';

const FOUNDATION = Object.freeze({
  registryRef: 'registry.vexlife.android-construction-foundation.001',
  ownerRef: 'github.issue.vexlife.783',
  parentOrchestrationRef: 'github.issue.vexlife.624'
});
const TARGET = Object.freeze({
  id: 'android',
  platformRef: 'platform.android',
  language: 'Kotlin',
  ui: 'Jetpack Compose',
  state: 'StateFlow'
});
const STATE_PROJECTION = Object.freeze({
  semanticOwnerRef: 'module.vexlife.core.state-relay',
  workspacePath: 'platform/android/state-relay',
  snapshotType: 'vexlife.android.state.VexStateSnapshot',
  projectionType: 'vexlife.android.state.VexStateProjection',
  stateFlowIsEventLedger: false
});
const EXPECTED_PIPELINE = Object.freeze([
  'UNIVERSAL_BLUEPRINT',
  'BLUEPRINT_TO_BLUEPRINT_MAPPER',
  'ANDROID_CONSTRUCTION_BLUEPRINT',
  'ANDROID_PROJECT_GENERATOR',
  'KOTLIN_COMPOSE_MANIFEST_GRADLE_RESOURCES_TESTS'
]);
const GENERATED_PATHS = Object.freeze([
  'README.md',
  'build.gradle.kts',
  'generated/android-construction-blueprint.json',
  'generated/project-plan.json',
  'gradle.properties',
  'settings.gradle.kts'
]);
const PLAN_KEYS = Object.freeze([
  'schemaVersion', 'generatorStage', 'constructionBlueprintSha256', 'sourceMappingRef',
  'sourceBlueprint', 'foundation', 'targetPlatform', 'stateProjectionSurface',
  'generationCustody', 'constructionUnits', 'boundaries'
]);
const SOURCE_BLUEPRINT_KEYS = Object.freeze(['schemaVersion', 'blueprintRef', 'version', 'contractVersion']);
const FOUNDATION_KEYS = Object.freeze(['registryRef', 'ownerRef', 'parentOrchestrationRef', 'mappingPipeline']);
const TARGET_KEYS = Object.freeze(Object.keys(TARGET));
const STATE_PROJECTION_KEYS = Object.freeze(Object.keys(STATE_PROJECTION));
const CUSTODY_KEYS = Object.freeze([
  'outputClass', 'durableWorkspaceRoot', 'durableWorkspaceMutation',
  'generatedAndHandwrittenBoundaryRequired'
]);
const PLAN_BOUNDARY_KEYS = Object.freeze([
  'composeImplementation', 'androidManifestProductAdoption', 'androidResourcesProductAdoption',
  'durableAndroidWorkspaceMutation', 'androidSdkOrAgpInstallation', 'buildPassClaimed',
  'apkProduced', 'deviceOrEmulatorLaunch', 'home', 'network', 'model', 'install',
  'signing', 'publication'
]);
const UNIT_KEYS = Object.freeze([
  'ancestryPath', 'sourcePath', 'disposition', 'platformBindingRefOrNull', 'reasonOrNull',
  'constructionState', 'materializationState', 'implementationEvidence'
]);
const RESULT_KEYS = Object.freeze([
  'schemaVersion', 'generatorStage', 'constructionBlueprintSha256', 'generatedPaths',
  'inventory', 'effects'
]);
const INVENTORY_KEYS = Object.freeze(['path', 'bytes', 'sha256']);
const RESULT_EFFECT_KEYS = Object.freeze([
  'localFilesystemMaterializationPerformed', 'durableAndroidWorkspaceMutationPerformed',
  'composeImplementationPerformed', 'androidManifestProductAdoptionPerformed',
  'androidResourcesProductAdoptionPerformed', 'buildPerformed', 'apkProduced',
  'deviceOrEmulatorLaunchPerformed', 'networkPerformed', 'modelPerformed',
  'installPerformed', 'signingPerformed', 'publicationPerformed'
]);
const DISPOSITIONS = new Set(['MAPPED', 'PLATFORM_SPECIFIC', 'HELD', 'UNSUPPORTED']);
const CONSTRUCTION_STATE = Object.freeze({
  MAPPED: 'CONTRACT_PROJECTION_REQUIRED',
  PLATFORM_SPECIFIC: 'ANDROID_ADAPTER_REQUIRED',
  HELD: 'HELD',
  UNSUPPORTED: 'UNSUPPORTED'
});
const MATERIALIZATION_STATE = Object.freeze({
  MAPPED: 'PLANNED_CONTRACT_PROJECTION',
  PLATFORM_SPECIFIC: 'PLANNED_ANDROID_ADAPTER',
  HELD: 'HELD',
  UNSUPPORTED: 'UNSUPPORTED'
});
const SHA256_HEX = /^[0-9a-f]{64}$/u;

const CURRENT_REQUIRED_CLASSES = Object.freeze([
  'A4_INPUT_IDENTITY',
  'GENERATED_TREE_INVENTORY',
  'DETERMINISM',
  'ANCESTRY_PRESERVATION',
  'HELD_UNSUPPORTED_TRUTH',
  'DISPOSABLE_CUSTODY',
  'NO_UNEARNED_EFFECTS',
  'SOURCE_MANIFEST_CURRENTNESS_REQUIREMENT',
  'FOCUSED_CONTRACT_TEST_REQUIREMENT',
  'FULL_REPOSITORY_CHECK_REQUIREMENT'
]);

const HELD_CLASSES = Object.freeze([
  'DURABLE_ANDROID_PROJECT_ADOPTION',
  'COMPOSE_PRESENTATION',
  'ANDROID_MANIFEST_PRODUCT_ADOPTION',
  'ANDROID_RESOURCES_PRODUCT_ADOPTION',
  'COMMAND_LINE_ANDROID_BUILD',
  'DEBUG_APK',
  'EMULATOR_OR_DEVICE_LAUNCH',
  'ACCESSIBILITY_VISUAL_PRESENTATION',
  'HOME_NETWORK_MODEL',
  'INSTALL_SIGNING_PUBLICATION'
]);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requiredObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function exactKeys(value, expectedKeys, label) {
  const actual = Object.keys(requiredObject(value, label)).sort(compareText);
  const expected = [...expectedKeys].sort(compareText);
  if (actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) {
    throw new Error(`${label} must contain exactly: ${expected.join(', ')}`);
  }
  return value;
}

function exact(value, expected, label) {
  if (value !== expected) throw new Error(`${label} must equal ${String(expected)}`);
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort(compareText).map((key) => [key, canonical(value[key])])
  );
}

function semanticHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function validateExactIdentity(value, expected, keys, label, extraKeys = []) {
  const actual = exactKeys(value, [...keys, ...extraKeys], label);
  for (const [field, expectedValue] of Object.entries(expected)) {
    exact(actual[field], expectedValue, `${label}.${field}`);
  }
  return clone(actual);
}

function validatePipeline(foundation) {
  if (!Array.isArray(foundation.mappingPipeline) ||
      foundation.mappingPipeline.length !== EXPECTED_PIPELINE.length ||
      foundation.mappingPipeline.some((entry, index) => entry !== EXPECTED_PIPELINE[index])) {
    throw new Error('projectPlan.foundation.mappingPipeline must match the accepted Android construction pipeline');
  }
}

function validateSourceBlueprint(value) {
  const source = exactKeys(value, SOURCE_BLUEPRINT_KEYS, 'projectPlan.sourceBlueprint');
  requiredString(source.schemaVersion, 'projectPlan.sourceBlueprint.schemaVersion');
  requiredString(source.blueprintRef, 'projectPlan.sourceBlueprint.blueprintRef');
  requiredString(source.version, 'projectPlan.sourceBlueprint.version');
  return clone(source);
}

function validateConstructionUnits(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('projectPlan.constructionUnits must be a non-empty array');
  }
  const seen = new Set();
  let prior = null;
  return value.map((raw, index) => {
    const unit = exactKeys(raw, UNIT_KEYS, `projectPlan.constructionUnits[${index}]`);
    const ancestryPath = requiredString(unit.ancestryPath, `projectPlan.constructionUnits[${index}].ancestryPath`);
    const sourcePath = requiredString(unit.sourcePath, `projectPlan.constructionUnits[${index}].sourcePath`);
    const disposition = requiredString(unit.disposition, `projectPlan.constructionUnits[${index}].disposition`);
    if (!DISPOSITIONS.has(disposition)) throw new Error(`unsupported A4 construction disposition ${disposition}`);
    if (seen.has(ancestryPath)) throw new Error(`duplicate A4 construction ancestry ${ancestryPath}`);
    if (prior !== null && compareText(prior, ancestryPath) >= 0) {
      throw new Error(`A4 construction ancestry must be strictly ordered: ${prior} then ${ancestryPath}`);
    }
    seen.add(ancestryPath);
    prior = ancestryPath;
    const platformBindingRefOrNull = unit.platformBindingRefOrNull ?? null;
    const reasonOrNull = unit.reasonOrNull ?? null;
    if (platformBindingRefOrNull !== null) {
      requiredString(platformBindingRefOrNull, `projectPlan.constructionUnits[${index}].platformBindingRefOrNull`);
    }
    if (reasonOrNull !== null) requiredString(reasonOrNull, `projectPlan.constructionUnits[${index}].reasonOrNull`);
    if (['HELD', 'UNSUPPORTED'].includes(disposition)) {
      if (platformBindingRefOrNull !== null) throw new Error(`${disposition} A4 construction unit cannot gain a platform binding`);
      if (reasonOrNull === null) throw new Error(`${disposition} A4 construction unit must preserve a reason`);
    }
    exact(unit.constructionState, CONSTRUCTION_STATE[disposition], `projectPlan.constructionUnits[${index}].constructionState`);
    exact(unit.materializationState, MATERIALIZATION_STATE[disposition], `projectPlan.constructionUnits[${index}].materializationState`);
    exact(unit.implementationEvidence, false, `projectPlan.constructionUnits[${index}].implementationEvidence`);
    return {
      ancestryPath,
      sourcePath,
      disposition,
      platformBindingRefOrNull,
      reasonOrNull,
      constructionState: unit.constructionState,
      materializationState: unit.materializationState,
      implementationEvidence: false
    };
  });
}

function validatePlan(projectPlan) {
  const plan = requiredObject(projectPlan, 'projectPlan');
  exact(plan.schemaVersion, A4_PLAN_SCHEMA, 'projectPlan.schemaVersion');
  exactKeys(plan, PLAN_KEYS, 'projectPlan');
  exact(plan.generatorStage, A4_STAGE, 'projectPlan.generatorStage');
  if (!SHA256_HEX.test(plan.constructionBlueprintSha256)) {
    throw new Error('projectPlan.constructionBlueprintSha256 must be lowercase SHA-256');
  }
  const sourceMappingRef = requiredString(plan.sourceMappingRef, 'projectPlan.sourceMappingRef');
  const sourceBlueprint = validateSourceBlueprint(plan.sourceBlueprint);
  const foundation = validateExactIdentity(
    plan.foundation,
    FOUNDATION,
    FOUNDATION_KEYS.filter((field) => field !== 'mappingPipeline'),
    'projectPlan.foundation',
    ['mappingPipeline']
  );
  foundation.mappingPipeline = clone(plan.foundation.mappingPipeline);
  validatePipeline(foundation);
  const targetPlatform = validateExactIdentity(plan.targetPlatform, TARGET, TARGET_KEYS, 'projectPlan.targetPlatform');
  const stateProjectionSurface = validateExactIdentity(
    plan.stateProjectionSurface,
    STATE_PROJECTION,
    STATE_PROJECTION_KEYS,
    'projectPlan.stateProjectionSurface'
  );
  const custody = exactKeys(plan.generationCustody, CUSTODY_KEYS, 'projectPlan.generationCustody');
  exact(custody.outputClass, 'CALLER_OWNED_DISPOSABLE_PRACTICUM_ROOT', 'projectPlan.generationCustody.outputClass');
  exact(custody.durableWorkspaceRoot, 'platform/android', 'projectPlan.generationCustody.durableWorkspaceRoot');
  exact(custody.durableWorkspaceMutation, false, 'projectPlan.generationCustody.durableWorkspaceMutation');
  exact(
    custody.generatedAndHandwrittenBoundaryRequired,
    true,
    'projectPlan.generationCustody.generatedAndHandwrittenBoundaryRequired'
  );
  const boundaries = exactKeys(plan.boundaries, PLAN_BOUNDARY_KEYS, 'projectPlan.boundaries');
  for (const field of PLAN_BOUNDARY_KEYS) exact(boundaries[field], false, `projectPlan.boundaries.${field}`);
  const constructionUnits = validateConstructionUnits(plan.constructionUnits);
  return {
    constructionBlueprintSha256: plan.constructionBlueprintSha256,
    sourceMappingRef,
    sourceBlueprint,
    foundation,
    targetPlatform,
    stateProjectionSurface,
    generationCustody: clone(custody),
    constructionUnits,
    boundaries: clone(boundaries)
  };
}

function validateResult(generationResult, constructionBlueprintSha256) {
  const result = requiredObject(generationResult, 'generationResult');
  exact(result.schemaVersion, A4_RESULT_SCHEMA, 'generationResult.schemaVersion');
  exactKeys(result, RESULT_KEYS, 'generationResult');
  exact(result.generatorStage, A4_STAGE, 'generationResult.generatorStage');
  exact(
    result.constructionBlueprintSha256,
    constructionBlueprintSha256,
    'generationResult.constructionBlueprintSha256'
  );
  if (!Array.isArray(result.generatedPaths) ||
      result.generatedPaths.length !== GENERATED_PATHS.length ||
      result.generatedPaths.some((entry, index) => entry !== GENERATED_PATHS[index])) {
    throw new Error('generationResult.generatedPaths must equal the accepted A4 six-path set');
  }
  if (!Array.isArray(result.inventory) || result.inventory.length !== GENERATED_PATHS.length) {
    throw new Error('generationResult.inventory must bind every accepted A4 generated path exactly once');
  }
  const inventory = result.inventory.map((raw, index) => {
    const record = exactKeys(raw, INVENTORY_KEYS, `generationResult.inventory[${index}]`);
    exact(record.path, GENERATED_PATHS[index], `generationResult.inventory[${index}].path`);
    if (!Number.isSafeInteger(record.bytes) || record.bytes < 0) {
      throw new Error(`generationResult.inventory[${index}].bytes must be a non-negative safe integer`);
    }
    if (!SHA256_HEX.test(record.sha256)) {
      throw new Error(`generationResult.inventory[${index}].sha256 must be lowercase SHA-256`);
    }
    return { path: record.path, bytes: record.bytes, sha256: record.sha256 };
  });
  const effects = exactKeys(result.effects, RESULT_EFFECT_KEYS, 'generationResult.effects');
  exact(
    effects.localFilesystemMaterializationPerformed,
    true,
    'generationResult.effects.localFilesystemMaterializationPerformed'
  );
  for (const field of RESULT_EFFECT_KEYS.filter((field) => field !== 'localFilesystemMaterializationPerformed')) {
    exact(effects[field], false, `generationResult.effects.${field}`);
  }
  return {
    generatedPaths: [...GENERATED_PATHS],
    inventory,
    effects: clone(effects),
    inventoryFingerprint: semanticHash(inventory)
  };
}

function obligation({
  obligationClass,
  obligationState,
  subjectRef,
  predicateRef,
  requiredEvidenceClass,
  expectation
}) {
  const core = {
    obligationClass,
    obligationState,
    evidenceState: 'UNPROVEN',
    subjectRef,
    predicateRef,
    requiredEvidenceClass,
    expectation: canonical(expectation)
  };
  const identity = semanticHash(core);
  return {
    obligationRef: `obligation.vexlife.android-a5.${identity.slice(0, 24)}`,
    ...core
  };
}

function currentObligations(plan, result) {
  const output = [
    obligation({
      obligationClass: 'A4_INPUT_IDENTITY',
      obligationState: 'REQUIRED',
      subjectRef: `construction-blueprint.sha256.${plan.constructionBlueprintSha256}`,
      predicateRef: 'predicate.android.a5.a4-input-identity',
      requiredEvidenceClass: 'STRUCTURAL_CONTRACT',
      expectation: {
        planSchema: A4_PLAN_SCHEMA,
        resultSchema: A4_RESULT_SCHEMA,
        generatorStage: A4_STAGE,
        constructionBlueprintSha256: plan.constructionBlueprintSha256,
        sourceMappingRef: plan.sourceMappingRef
      }
    }),
    obligation({
      obligationClass: 'DETERMINISM',
      obligationState: 'REQUIRED',
      subjectRef: `construction-blueprint.sha256.${plan.constructionBlueprintSha256}`,
      predicateRef: 'predicate.android.a5.deterministic-generation',
      requiredEvidenceClass: 'REPEATABILITY',
      expectation: {
        sameInputProducesSameGeneratedPaths: true,
        sameInputProducesSameInventoryBytesAndSha256: true
      }
    }),
    obligation({
      obligationClass: 'DISPOSABLE_CUSTODY',
      obligationState: 'REQUIRED',
      subjectRef: 'platform.android.project-practicum-custody',
      predicateRef: 'predicate.android.a5.disposable-custody',
      requiredEvidenceClass: 'CUSTODY_BOUNDARY',
      expectation: clone(plan.generationCustody)
    }),
    obligation({
      obligationClass: 'NO_UNEARNED_EFFECTS',
      obligationState: 'REQUIRED',
      subjectRef: 'platform.android.a4-effect-boundary',
      predicateRef: 'predicate.android.a5.no-unearned-effects',
      requiredEvidenceClass: 'EFFECT_BOUNDARY',
      expectation: {
        planBoundaries: clone(plan.boundaries),
        resultEffects: clone(result.effects)
      }
    }),
    obligation({
      obligationClass: 'SOURCE_MANIFEST_CURRENTNESS_REQUIREMENT',
      obligationState: 'REQUIRED',
      subjectRef: 'source-manifest.vexlife.current',
      predicateRef: 'predicate.android.a5.source-manifest-current',
      requiredEvidenceClass: 'SOURCE_CURRENTNESS',
      expectation: { requiredState: 'SOURCE_MANIFEST_CURRENT' }
    }),
    obligation({
      obligationClass: 'FOCUSED_CONTRACT_TEST_REQUIREMENT',
      obligationState: 'REQUIRED',
      subjectRef: 'test.android.a0-a5.focused',
      predicateRef: 'predicate.android.a5.focused-contract-tests-pass',
      requiredEvidenceClass: 'TEST_EXECUTION',
      expectation: {
        requiredPaths: [
          'test/blueprint-mapper.test.mjs',
          'test/android-construction-compiler.test.mjs',
          'test/android-project-generator.test.mjs',
          'test/android-test-evidence-obligations.test.mjs'
        ]
      }
    }),
    obligation({
      obligationClass: 'FULL_REPOSITORY_CHECK_REQUIREMENT',
      obligationState: 'REQUIRED',
      subjectRef: 'repository.vexlife.full-check',
      predicateRef: 'predicate.android.a5.full-repository-check-pass',
      requiredEvidenceClass: 'REPOSITORY_CHECK',
      expectation: { command: 'npm run check' }
    })
  ];

  for (const record of result.inventory) {
    output.push(obligation({
      obligationClass: 'GENERATED_TREE_INVENTORY',
      obligationState: 'REQUIRED',
      subjectRef: `generated-path.${record.path}`,
      predicateRef: 'predicate.android.a5.generated-path-digest',
      requiredEvidenceClass: 'FILE_DIGEST',
      expectation: clone(record)
    }));
  }

  for (const unit of plan.constructionUnits) {
    output.push(obligation({
      obligationClass: 'ANCESTRY_PRESERVATION',
      obligationState: 'REQUIRED',
      subjectRef: `construction-unit.${unit.ancestryPath}`,
      predicateRef: 'predicate.android.a5.ancestry-preserved',
      requiredEvidenceClass: 'STRUCTURAL_CONTRACT',
      expectation: {
        ancestryPath: unit.ancestryPath,
        sourcePath: unit.sourcePath,
        disposition: unit.disposition,
        platformBindingRefOrNull: unit.platformBindingRefOrNull,
        reasonOrNull: unit.reasonOrNull,
        constructionState: unit.constructionState,
        materializationState: unit.materializationState,
        implementationEvidence: false
      }
    }));
    if (['HELD', 'UNSUPPORTED'].includes(unit.disposition)) {
      output.push(obligation({
        obligationClass: 'HELD_UNSUPPORTED_TRUTH',
        obligationState: 'REQUIRED',
        subjectRef: `construction-unit.${unit.ancestryPath}`,
        predicateRef: 'predicate.android.a5.held-unsupported-truth',
        requiredEvidenceClass: 'STRUCTURAL_CONTRACT',
        expectation: {
          disposition: unit.disposition,
          reasonOrNull: unit.reasonOrNull,
          platformBindingRefOrNull: null,
          implementationEvidence: false
        }
      }));
    }
  }
  return output;
}

function heldObligations() {
  return HELD_CLASSES.map((obligationClass) => obligation({
    obligationClass,
    obligationState: 'HELD',
    subjectRef: `platform.android.${obligationClass.toLowerCase().replaceAll('_', '-')}`,
    predicateRef: `predicate.android.a5.held.${obligationClass.toLowerCase().replaceAll('_', '-')}`,
    requiredEvidenceClass: 'LATER_STAGE_EVIDENCE',
    expectation: { evidenceMustBeEarnedByLaterSourcePlacedStage: true }
  }));
}

export function compileAndroidTestEvidenceObligations({
  projectPlan,
  generationResult,
  compilerRef
} = {}) {
  const plan = validatePlan(projectPlan);
  const result = validateResult(generationResult, plan.constructionBlueprintSha256);
  const resolvedCompilerRef = requiredString(compilerRef, 'compilerRef');
  const obligations = [...currentObligations(plan, result), ...heldObligations()]
    .sort((left, right) =>
      compareText(left.obligationClass, right.obligationClass) ||
      compareText(left.subjectRef, right.subjectRef) ||
      compareText(left.obligationRef, right.obligationRef)
    );

  const seen = new Set();
  for (const item of obligations) {
    if (seen.has(item.obligationRef)) throw new Error(`duplicate A5 obligation identity ${item.obligationRef}`);
    seen.add(item.obligationRef);
  }

  const byClass = {};
  let required = 0;
  let held = 0;
  for (const item of obligations) {
    byClass[item.obligationClass] = (byClass[item.obligationClass] ?? 0) + 1;
    if (item.obligationState === 'REQUIRED') required += 1;
    else held += 1;
  }

  const core = {
    schemaVersion: ANDROID_TEST_EVIDENCE_OBLIGATIONS_SCHEMA,
    compilerRef: resolvedCompilerRef,
    compilerStage: ANDROID_TEST_EVIDENCE_GENERATOR_STAGE,
    sourceA4: {
      planSchemaVersion: A4_PLAN_SCHEMA,
      resultSchemaVersion: A4_RESULT_SCHEMA,
      generatorStage: A4_STAGE,
      constructionBlueprintSha256: plan.constructionBlueprintSha256,
      sourceMappingRef: plan.sourceMappingRef,
      sourceBlueprint: plan.sourceBlueprint,
      foundation: plan.foundation,
      targetPlatform: plan.targetPlatform,
      stateProjectionSurface: plan.stateProjectionSurface,
      generatedPaths: result.generatedPaths,
      inventoryFingerprint: result.inventoryFingerprint
    },
    obligations,
    summary: {
      required,
      held,
      total: obligations.length,
      byClass: canonical(byClass),
      evidenceExecutionPerformed: false,
      evidenceReceiptFormed: false
    },
    boundaries: {
      testExecution: false,
      evidenceReceiptFormation: false,
      repositoryMutation: false,
      durableAndroidWorkspaceMutation: false,
      compose: false,
      manifestProductAdoption: false,
      resourcesProductAdoption: false,
      androidBuild: false,
      apk: false,
      deviceOrEmulatorLaunch: false,
      home: false,
      network: false,
      model: false,
      install: false,
      signing: false,
      publication: false,
      federatedCurrentStateOwnership: false
    }
  };
  return deepFreeze({ ...core, semanticFingerprint: semanticHash(core) });
}

export const currentA5ObligationClasses = CURRENT_REQUIRED_CLASSES;
export const heldA5ObligationClasses = HELD_CLASSES;

// [VXG RealForever]
