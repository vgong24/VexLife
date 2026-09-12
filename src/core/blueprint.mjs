import * as base from './blueprint-base.mjs';

export * from './blueprint-base.mjs';

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

// [VXG RealForever]
