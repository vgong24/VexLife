export const BLUEPRINT_MAPPING_SCHEMA = 'vexlife.blueprint-to-blueprint-mapping/v0';
export const MAPPING_DISPOSITIONS = Object.freeze([
  'MAPPED',
  'PLATFORM_SPECIFIC',
  'HELD',
  'UNSUPPORTED'
]);

const DISPOSITION_SET = new Set(MAPPING_DISPOSITIONS);

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

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function cloneValue(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function collectIncludeSources(value, ancestryPath, output) {
  if (typeof value === 'string') {
    output.push({ ancestryPath, sourcePath: requiredString(value, ancestryPath) });
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) throw new Error(`${ancestryPath} must not be empty`);
    value.forEach((entry, index) => collectIncludeSources(entry, `${ancestryPath}[${index}]`, output));
    return;
  }
  throw new TypeError(`${ancestryPath} must be a source path string or array of source path strings`);
}

export function enumerateBlueprintSources(sourceBlueprint) {
  const blueprint = requiredObject(sourceBlueprint, 'sourceBlueprint');
  requiredString(blueprint.blueprintRef, 'sourceBlueprint.blueprintRef');
  requiredString(blueprint.version, 'sourceBlueprint.version');
  const includes = requiredObject(blueprint.includes, 'sourceBlueprint.includes');
  const sources = [];
  for (const key of Object.keys(includes).sort(compareText)) {
    collectIncludeSources(includes[key], `includes.${key}`, sources);
  }
  sources.sort((left, right) => compareText(left.ancestryPath, right.ancestryPath));
  const seen = new Set();
  for (const source of sources) {
    if (seen.has(source.ancestryPath)) throw new Error(`duplicate blueprint ancestry path ${source.ancestryPath}`);
    seen.add(source.ancestryPath);
  }
  return deepFreeze(sources.map((source) => ({ ...source })));
}

function resolvePlatform(platformRegistry, platformRef) {
  const registry = requiredObject(platformRegistry, 'platformRegistry');
  if (!Array.isArray(registry.platforms)) throw new TypeError('platformRegistry.platforms must be an array');
  const matches = registry.platforms.filter((entry) => entry?.platformRef === platformRef);
  if (matches.length !== 1) throw new Error(`platformRef must resolve exactly once: ${platformRef}`);
  const platform = requiredObject(matches[0], 'platform');
  return {
    id: requiredString(platform.id, 'platform.id'),
    platformRef: requiredString(platform.platformRef, 'platform.platformRef'),
    language: requiredString(platform.language, 'platform.language'),
    ui: requiredString(platform.ui, 'platform.ui'),
    state: requiredString(platform.state, 'platform.state')
  };
}

function validateFoundation(foundation, platformRef) {
  const value = requiredObject(foundation, 'foundation');
  const registryRef = requiredString(value.registryRef, 'foundation.registryRef');
  if (requiredString(value.platformRef, 'foundation.platformRef') !== platformRef) {
    throw new Error(`foundation platform mismatch: expected ${platformRef} actual ${value.platformRef}`);
  }
  if (value.registrationState !== 'INERT_NOT_COMPOSED') {
    throw new Error(`foundation must remain INERT_NOT_COMPOSED: ${value.registrationState}`);
  }
  if (value.effects !== false) throw new Error('foundation.effects must remain false');
  if (!Array.isArray(value.mappingPipeline) || !value.mappingPipeline.includes('BLUEPRINT_TO_BLUEPRINT_MAPPER')) {
    throw new Error('foundation mapping pipeline must include BLUEPRINT_TO_BLUEPRINT_MAPPER');
  }
  return {
    registryRef,
    ownerRef: requiredString(value.ownerRef, 'foundation.ownerRef'),
    parentOrchestrationRef: requiredString(value.parentOrchestrationRef, 'foundation.parentOrchestrationRef'),
    mappingPipeline: value.mappingPipeline.map((entry, index) => requiredString(entry, `foundation.mappingPipeline[${index}]`))
  };
}

function normalizeMappingRules(mappingRules, sources) {
  if (!Array.isArray(mappingRules)) throw new TypeError('mappingRules must be an array');
  const sourceByAncestry = new Map(sources.map((source) => [source.ancestryPath, source]));
  const ruleByAncestry = new Map();

  for (const [index, raw] of mappingRules.entries()) {
    const rule = requiredObject(raw, `mappingRules[${index}]`);
    const ancestryPath = requiredString(rule.ancestryPath, `mappingRules[${index}].ancestryPath`);
    if (!sourceByAncestry.has(ancestryPath)) throw new Error(`mapping rule references unknown ancestry path ${ancestryPath}`);
    if (ruleByAncestry.has(ancestryPath)) throw new Error(`duplicate mapping rule ${ancestryPath}`);
    const disposition = requiredString(rule.disposition, `mappingRules[${index}].disposition`);
    if (!DISPOSITION_SET.has(disposition)) throw new Error(`unsupported mapping disposition ${disposition}`);
    const platformBindingRefOrNull = optionalStringOrNull(rule.platformBindingRefOrNull, `mappingRules[${index}].platformBindingRefOrNull`);
    const reasonOrNull = optionalStringOrNull(rule.reasonOrNull, `mappingRules[${index}].reasonOrNull`);
    if (['HELD', 'UNSUPPORTED'].includes(disposition) && reasonOrNull === null) {
      throw new Error(`${disposition} mapping requires reasonOrNull for ${ancestryPath}`);
    }
    if (['HELD', 'UNSUPPORTED'].includes(disposition) && platformBindingRefOrNull !== null) {
      throw new Error(`${disposition} mapping cannot claim platformBindingRefOrNull for ${ancestryPath}`);
    }
    ruleByAncestry.set(ancestryPath, { disposition, platformBindingRefOrNull, reasonOrNull });
  }

  const missing = sources.filter((source) => !ruleByAncestry.has(source.ancestryPath)).map((source) => source.ancestryPath);
  if (missing.length) throw new Error(`every canonical source requires an explicit mapping rule: ${missing.join(', ')}`);

  return sources.map((source) => ({
    ancestryPath: source.ancestryPath,
    sourcePath: source.sourcePath,
    ...ruleByAncestry.get(source.ancestryPath)
  }));
}

export function mapBlueprintToPlatformBlueprint({
  sourceBlueprint,
  platformRegistry,
  platformRef,
  foundation,
  mappingRef,
  mappingRules
}) {
  const blueprint = requiredObject(sourceBlueprint, 'sourceBlueprint');
  const resolvedPlatformRef = requiredString(platformRef, 'platformRef');
  const sources = enumerateBlueprintSources(blueprint);
  const platform = resolvePlatform(platformRegistry, resolvedPlatformRef);
  const foundationBinding = validateFoundation(foundation, resolvedPlatformRef);
  const mappings = normalizeMappingRules(mappingRules, sources);

  const output = {
    schemaVersion: BLUEPRINT_MAPPING_SCHEMA,
    mappingRef: requiredString(mappingRef, 'mappingRef'),
    sourceBlueprint: {
      schemaVersion: requiredString(blueprint.schemaVersion, 'sourceBlueprint.schemaVersion'),
      blueprintRef: requiredString(blueprint.blueprintRef, 'sourceBlueprint.blueprintRef'),
      version: requiredString(blueprint.version, 'sourceBlueprint.version'),
      contractVersion: blueprint.contractVersion ?? null
    },
    foundation: cloneValue(foundationBinding),
    targetPlatform: cloneValue(platform),
    canonicalAncestryRequired: true,
    registrationState: 'INERT_NOT_COMPOSED',
    effects: false,
    mappings: cloneValue(mappings),
    boundaries: {
      canonicalRegistryWrites: false,
      stateRelayRuntimeMutation: false,
      androidRuntimeGeneration: false,
      compose: false,
      gradle: false,
      manifest: false,
      home: false,
      network: false,
      model: false,
      publication: false
    }
  };

  return deepFreeze(output);
}

// [VXG RealForever]
