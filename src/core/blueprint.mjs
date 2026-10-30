import * as base from './blueprint-base.mjs';
import {
  buildPortableBehaviorIdentityEntries,
  validatePortableBehaviorContracts
} from './portable-behavior-contract.mjs';
import {
  buildPortableConvergenceIdentityEntries,
  validatePortableConvergenceContracts
} from './portable-convergence-contract.mjs';

export * from './blueprint-base.mjs';
export * from './portable-behavior-contract.mjs';
export * from './portable-convergence-contract.mjs';

const REGISTRATION_EXTENSION_KEYS = new Set([
  'schemaVersion',
  'registrationRef',
  'features',
  'featureWalkthroughPlans',
  'strings'
]);

function assertRegistrationExtensions(extensions) {
  if (!Array.isArray(extensions)) throw new Error('registrationExtensions must be an array');
  const registrationRefs = new Set();
  for (const [index, extension] of extensions.entries()) {
    if (!extension || typeof extension !== 'object' || Array.isArray(extension)) {
      throw new Error(`registration extension ${index} must be an object`);
    }
    const extraKeys = Object.keys(extension).filter((key) => !REGISTRATION_EXTENSION_KEYS.has(key));
    if (extraKeys.length) throw new Error(`${extension.registrationRef ?? `registration extension ${index}`} unsupported field ${extraKeys[0]}`);
    if (typeof extension.registrationRef !== 'string' || !extension.registrationRef) {
      throw new Error(`registration extension ${index} missing registrationRef`);
    }
    if (registrationRefs.has(extension.registrationRef)) {
      throw new Error(`duplicate registration extension ${extension.registrationRef}`);
    }
    registrationRefs.add(extension.registrationRef);
    for (const field of ['features', 'featureWalkthroughPlans']) {
      if (extension[field] !== undefined && !Array.isArray(extension[field])) {
        throw new Error(`${extension.registrationRef} ${field} must be an array`);
      }
    }
    if (extension.strings !== undefined && (!extension.strings || typeof extension.strings !== 'object' || Array.isArray(extension.strings))) {
      throw new Error(`${extension.registrationRef} strings must be an object`);
    }
  }
}

function mergeUniqueRecords(baseRecords = [], extensions, field, refField) {
  const merged = [...baseRecords];
  const refs = new Set(baseRecords.map((item) => item?.[refField]).filter(Boolean));
  for (const extension of extensions) {
    for (const record of extension[field] ?? []) {
      const ref = record?.[refField];
      if (typeof ref !== 'string' || !ref) throw new Error(`${extension.registrationRef} ${field} record missing ${refField}`);
      if (refs.has(ref)) throw new Error(`${extension.registrationRef} duplicates ${refField} ${ref}`);
      refs.add(ref);
      merged.push(structuredClone(record));
    }
  }
  return merged;
}

function mergeRegistrationStrings(baseStrings, extensions) {
  const merged = structuredClone(baseStrings);
  for (const extension of extensions) {
    for (const [language, catalog] of Object.entries(extension.strings ?? {})) {
      if (!Object.hasOwn(merged, language)) throw new Error(`${extension.registrationRef} references unsupported language ${language}`);
      if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
        throw new Error(`${extension.registrationRef} ${language} strings must be an object`);
      }
      for (const [ref, value] of Object.entries(catalog)) {
        if (typeof value !== 'string' || !value) throw new Error(`${extension.registrationRef} ${language} string ${ref} must be non-empty`);
        if (Object.hasOwn(merged[language], ref)) throw new Error(`${extension.registrationRef} duplicates ${language} string ${ref}`);
        merged[language][ref] = value;
      }
    }
  }
  return merged;
}

export function loadBlueprint(root = base.VEXLIFE_ROOT) {
  const bundle = base.loadBlueprint(root);
  const extensions = bundle.blueprint.registrationExtensions ?? [];
  assertRegistrationExtensions(extensions);
  if (!extensions.length) return bundle;
  return {
    ...bundle,
    featureRegistry: {
      ...bundle.featureRegistry,
      features: mergeUniqueRecords(bundle.featureRegistry?.features ?? [], extensions, 'features', 'featureRef')
    },
    experience: {
      ...bundle.experience,
      featureWalkthroughPlans: mergeUniqueRecords(bundle.experience?.featureWalkthroughPlans ?? [], extensions, 'featureWalkthroughPlans', 'planRef')
    },
    strings: mergeRegistrationStrings(bundle.strings, extensions)
  };
}

function convergenceOwnerRefs(bundle, behaviorValidation) {
  if (!behaviorValidation.ok) return null;
  const baseEntries = base.buildIdentityIndex(bundle);
  const behaviorEntries = buildPortableBehaviorIdentityEntries(bundle?.blueprint?.behaviorContracts);
  return new Set([...baseEntries, ...behaviorEntries].map((entry) => entry.ref));
}

export function validateBlueprint(bundle) {
  const baseValidation = base.validateBlueprint(bundle);
  const behaviorValidation = validatePortableBehaviorContracts(bundle?.blueprint?.behaviorContracts);
  let ownerRefs = null;
  let ownerResolutionError = null;
  try {
    ownerRefs = convergenceOwnerRefs(bundle, behaviorValidation);
  } catch (error) {
    ownerResolutionError = error;
  }
  const convergenceValidation = validatePortableConvergenceContracts(
    bundle?.blueprint?.convergenceContracts,
    { knownOwnerRefs: ownerRefs }
  );
  const errors = [
    ...baseValidation.errors,
    ...behaviorValidation.errors.map((error) => `portable behavior: ${error}`),
    ...(ownerResolutionError ? [`portable convergence owner resolution: ${ownerResolutionError.message}`] : []),
    ...convergenceValidation.errors.map((error) => `portable convergence: ${error}`)
  ];
  return {
    ...baseValidation,
    ok: errors.length === 0,
    errors,
    stats: {
      ...baseValidation.stats,
      portableBehaviorContracts: behaviorValidation.stats.contracts,
      portableBehaviorRows: behaviorValidation.stats.rows,
      portableBehaviorOwnedRefs: behaviorValidation.stats.ownedRefs,
      portableConvergenceContracts: convergenceValidation.stats.contracts,
      portableConvergenceLaws: convergenceValidation.stats.laws,
      portableConvergenceOwnedRefs: convergenceValidation.stats.ownedRefs,
      portableConvergenceInputs: convergenceValidation.stats.inputs,
      portableConvergenceStates: convergenceValidation.stats.states
    }
  };
}

export function buildIdentityIndex(blueprintOrBundle) {
  const blueprint = blueprintOrBundle?.blueprint ?? blueprintOrBundle;
  const baseEntries = base.buildIdentityIndex(blueprintOrBundle);
  const behaviorEntries = buildPortableBehaviorIdentityEntries(blueprint?.behaviorContracts);
  const ownerRefs = new Set([...baseEntries, ...behaviorEntries].map((entry) => entry.ref));
  const convergenceValidation = validatePortableConvergenceContracts(
    blueprint?.convergenceContracts,
    { knownOwnerRefs: ownerRefs }
  );
  if (!convergenceValidation.ok) {
    throw new Error(`Portable Convergence invalid: ${convergenceValidation.errors.join('; ')}`);
  }
  const convergenceEntries = buildPortableConvergenceIdentityEntries(blueprint?.convergenceContracts);
  const seen = new Set();
  for (const entry of [...baseEntries, ...behaviorEntries, ...convergenceEntries]) {
    if (seen.has(entry.ref)) throw new Error(`duplicate identity index ref ${entry.ref}`);
    seen.add(entry.ref);
  }
  return [...baseEntries, ...behaviorEntries, ...convergenceEntries];
}

// [VXG RealForever]
