export const ANDROID_CONSTRUCTION_BLUEPRINT_SCHEMA = 'vexlife.android-construction-blueprint/v0';
export const ANDROID_CONSTRUCTION_COMPILER_STAGE = 'A3_ANDROID_CONSTRUCTION_BLUEPRINT_COMPILER';

const A0_MAPPING_SCHEMA = 'vexlife.blueprint-to-blueprint-mapping/v0';
const EXPECTED_PIPELINE = Object.freeze([
  'UNIVERSAL_BLUEPRINT',
  'BLUEPRINT_TO_BLUEPRINT_MAPPER',
  'ANDROID_CONSTRUCTION_BLUEPRINT',
  'ANDROID_PROJECT_GENERATOR',
  'KOTLIN_COMPOSE_MANIFEST_GRADLE_RESOURCES_TESTS'
]);
const MAPPING_DISPOSITIONS = new Set(['MAPPED', 'PLATFORM_SPECIFIC', 'HELD', 'UNSUPPORTED']);
const A0_BOUNDARY_FIELDS = Object.freeze([
  'canonicalRegistryWrites',
  'stateRelayRuntimeMutation',
  'androidRuntimeGeneration',
  'compose',
  'gradle',
  'manifest',
  'home',
  'network',
  'model',
  'publication'
]);
const CONSTRUCTION_STATE = Object.freeze({
  MAPPED: 'CONTRACT_PROJECTION_REQUIRED',
  PLATFORM_SPECIFIC: 'ANDROID_ADAPTER_REQUIRED',
  HELD: 'HELD',
  UNSUPPORTED: 'UNSUPPORTED'
});

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

function optionalStringOrNull(value, label) {
  if (value === undefined || value === null) return null;
  return requiredString(value, label);
}

function cloneValue(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function repositoryPath(value, label) {
  const text = requiredString(value, label);
  if (text.startsWith('/') || text.includes('\\') || /^[A-Za-z]:/u.test(text)) {
    throw new Error(`${label} must be a repository-relative path`);
  }
  const segments = text.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new Error(`${label} contains unsafe path segments`);
  }
  return text;
}

function validatePipeline(value) {
  if (!Array.isArray(value) || value.length !== EXPECTED_PIPELINE.length) {
    throw new Error('mapping foundation pipeline must match the accepted Android construction pipeline');
  }
  if (value.some((entry, index) => entry !== EXPECTED_PIPELINE[index])) {
    throw new Error('mapping foundation pipeline drifted from the accepted Android construction pipeline');
  }
  return [...value];
}

function validateA0Boundaries(value) {
  const boundaries = requiredObject(value, 'mapping.boundaries');
  for (const field of A0_BOUNDARY_FIELDS) {
    if (boundaries[field] !== false) throw new Error(`A0 boundary must remain false: ${field}`);
  }
  return cloneValue(boundaries);
}

function validateMappings(value) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError('mapping.mappings must be a non-empty array');
  const seen = new Set();
  let previous = null;
  return value.map((raw, index) => {
    const entry = requiredObject(raw, `mapping.mappings[${index}]`);
    const ancestryPath = requiredString(entry.ancestryPath, `mapping.mappings[${index}].ancestryPath`);
    const sourcePath = repositoryPath(entry.sourcePath, `mapping.mappings[${index}].sourcePath`);
    const disposition = requiredString(entry.disposition, `mapping.mappings[${index}].disposition`);
    if (!MAPPING_DISPOSITIONS.has(disposition)) throw new Error(`unsupported A0 mapping disposition ${disposition}`);
    if (seen.has(ancestryPath)) throw new Error(`duplicate mapping ancestry ${ancestryPath}`);
    if (previous !== null && compareText(previous, ancestryPath) >= 0) {
      throw new Error(`mapping ancestry must be strictly ordered: ${previous} then ${ancestryPath}`);
    }
    seen.add(ancestryPath);
    previous = ancestryPath;
    const platformBindingRefOrNull = optionalStringOrNull(
      entry.platformBindingRefOrNull,
      `mapping.mappings[${index}].platformBindingRefOrNull`
    );
    const reasonOrNull = optionalStringOrNull(entry.reasonOrNull, `mapping.mappings[${index}].reasonOrNull`);
    if (['HELD', 'UNSUPPORTED'].includes(disposition)) {
      if (reasonOrNull === null) throw new Error(`${disposition} mapping must preserve a reason: ${ancestryPath}`);
      if (platformBindingRefOrNull !== null) throw new Error(`${disposition} mapping cannot gain an Android binding: ${ancestryPath}`);
    }
    return {
      ancestryPath,
      sourcePath,
      disposition,
      platformBindingRefOrNull,
      reasonOrNull
    };
  });
}

function validateA0Mapping(input) {
  const mapping = requiredObject(input, 'mapping');
  if (mapping.schemaVersion !== A0_MAPPING_SCHEMA) {
    throw new Error(`mapping schema must equal ${A0_MAPPING_SCHEMA}`);
  }
  requiredString(mapping.mappingRef, 'mapping.mappingRef');
  const sourceBlueprint = requiredObject(mapping.sourceBlueprint, 'mapping.sourceBlueprint');
  const foundation = requiredObject(mapping.foundation, 'mapping.foundation');
  const targetPlatform = requiredObject(mapping.targetPlatform, 'mapping.targetPlatform');
  if (targetPlatform.id !== 'android' || targetPlatform.platformRef !== 'platform.android') {
    throw new Error('A3 compiler requires the Android A0 target platform');
  }
  if (mapping.canonicalAncestryRequired !== true) throw new Error('A3 compiler requires canonical A0 ancestry');
  if (mapping.registrationState !== 'INERT_NOT_COMPOSED') throw new Error('A3 compiler requires INERT_NOT_COMPOSED input');
  if (mapping.effects !== false) throw new Error('A3 compiler requires effect-free A0 input');

  const validated = {
    mappingRef: mapping.mappingRef,
    sourceBlueprint: {
      schemaVersion: requiredString(sourceBlueprint.schemaVersion, 'mapping.sourceBlueprint.schemaVersion'),
      blueprintRef: requiredString(sourceBlueprint.blueprintRef, 'mapping.sourceBlueprint.blueprintRef'),
      version: requiredString(sourceBlueprint.version, 'mapping.sourceBlueprint.version'),
      contractVersion: sourceBlueprint.contractVersion ?? null
    },
    foundation: {
      registryRef: requiredString(foundation.registryRef, 'mapping.foundation.registryRef'),
      ownerRef: requiredString(foundation.ownerRef, 'mapping.foundation.ownerRef'),
      parentOrchestrationRef: requiredString(foundation.parentOrchestrationRef, 'mapping.foundation.parentOrchestrationRef'),
      mappingPipeline: validatePipeline(foundation.mappingPipeline)
    },
    targetPlatform: {
      id: targetPlatform.id,
      platformRef: targetPlatform.platformRef,
      language: requiredString(targetPlatform.language, 'mapping.targetPlatform.language'),
      ui: requiredString(targetPlatform.ui, 'mapping.targetPlatform.ui'),
      state: requiredString(targetPlatform.state, 'mapping.targetPlatform.state')
    },
    boundaries: validateA0Boundaries(mapping.boundaries),
    mappings: validateMappings(mapping.mappings)
  };
  return validated;
}

function dispositionCounts(mappings) {
  const counts = { MAPPED: 0, PLATFORM_SPECIFIC: 0, HELD: 0, UNSUPPORTED: 0 };
  for (const mapping of mappings) counts[mapping.disposition] += 1;
  return counts;
}

export function compileAndroidConstructionBlueprint({ mapping, compilerRef }) {
  const value = validateA0Mapping(mapping);
  const mappings = cloneValue(value.mappings);
  const constructionUnits = mappings.map((entry) => ({
    ancestryPath: entry.ancestryPath,
    sourcePath: entry.sourcePath,
    disposition: entry.disposition,
    platformBindingRefOrNull: entry.platformBindingRefOrNull,
    reasonOrNull: entry.reasonOrNull,
    constructionState: CONSTRUCTION_STATE[entry.disposition]
  }));

  return deepFreeze({
    schemaVersion: ANDROID_CONSTRUCTION_BLUEPRINT_SCHEMA,
    compilerRef: requiredString(compilerRef, 'compilerRef'),
    compilerStage: ANDROID_CONSTRUCTION_COMPILER_STAGE,
    sourceMappingRef: value.mappingRef,
    sourceBlueprint: cloneValue(value.sourceBlueprint),
    foundation: cloneValue(value.foundation),
    targetPlatform: cloneValue(value.targetPlatform),
    canonicalAncestryRequired: true,
    registrationState: 'INERT_NOT_COMPOSED',
    effects: false,
    mappings,
    constructionUnits,
    dispositionCounts: dispositionCounts(mappings),
    stateProjectionSurface: {
      semanticOwnerRef: 'module.vexlife.core.state-relay',
      workspacePath: 'platform/android/state-relay',
      snapshotType: 'vexlife.android.state.VexStateSnapshot',
      projectionType: 'vexlife.android.state.VexStateProjection',
      stateFlowIsEventLedger: false
    },
    generationBoundary: {
      durableWorkspaceRoot: 'platform/android',
      existingHandwrittenRoots: ['platform/android/state-relay'],
      generatedAndHandwrittenBoundaryRequired: true,
      projectGeneratorStage: 'A4_MINIMAL_GENERATED_ANDROID_PROJECT_PRACTICUM',
      generatedPathSelectionState: 'HELD_FOR_A4_SOURCE_PLACEMENT',
      projectGenerationAllowed: false
    },
    boundaries: {
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
    }
  });
}

// [VXG RealForever]
