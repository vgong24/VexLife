import fs from 'node:fs';
import path from 'node:path';
import {
  IdentityRegistry,
  buildRegistryProjection,
  compileRegistryPack as compileCoreRegistryPack
} from './registry-core.mjs';
import { registerNavigationContinuityRegistry } from './navigation-continuity-registry.mjs';
import { readJson, semanticHash } from './utils.mjs';

export { IdentityRegistry, buildRegistryProjection };

export const EXPERIENCE_FOUNDATION_SOURCE_PATH = 'blueprint/experience-foundation.json';
export const EXPERIENCE_FOUNDATION_SCHEMA_VERSION = 'vexlife.experience-foundation/v1';

const EXPOSURE_CLASSES = new Set([
  'PRIMARY',
  'SECONDARY',
  'CONTEXTUAL',
  'RECOVERY',
  'EXPERT',
  'AMBIENT',
  'OVERFLOW_ONLY'
]);
const AVAILABILITY_STATES = new Set(['AVAILABLE', 'HELD', 'UNAVAILABLE', 'UNKNOWN']);
const INTERACTION_FORM_KINDS = new Set([
  'BUTTON',
  'ICON_ACTION',
  'MENU_ITEM',
  'VESSEL_ACTION',
  'NATIVE_CONTROL',
  'SLASH_ALIAS',
  'MODEL_TOOL',
  'VOICE_ACTION'
]);
const CONSUMER_CLASSES = new Set(['HUMAN', 'OPERATOR']);

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function uniqueRefs(items, refField, label, errors) {
  if (!Array.isArray(items) || items.length === 0) {
    errors.push(`Experience Foundation ${label} must be a non-empty array`);
    return new Set();
  }
  const refs = new Set();
  for (const [index, item] of items.entries()) {
    const ref = item?.[refField];
    if (!nonEmptyString(ref)) {
      errors.push(`Experience Foundation ${label}[${index}] missing ${refField}`);
      continue;
    }
    if (refs.has(ref)) errors.push(`Experience Foundation duplicate ${refField} ${ref}`);
    refs.add(ref);
  }
  return refs;
}

function requireRegistryRef(registry, ref, kinds, label, errors) {
  if (!nonEmptyString(ref)) {
    errors.push(`Experience Foundation ${label} is required`);
    return null;
  }
  const entry = registry?.get(ref) ?? null;
  if (!entry) {
    errors.push(`Experience Foundation ${label} references missing ref ${ref}`);
    return null;
  }
  if (kinds && !kinds.includes(entry.kind)) {
    errors.push(`Experience Foundation ${label} ${ref} has kind ${entry.kind}, expected ${kinds.join('|')}`);
  }
  return entry;
}

export function loadExperienceFoundation(bundle) {
  if (bundle?.experienceFoundation) return structuredClone(bundle.experienceFoundation);
  if (!bundle?.root) return null;
  const sourcePath = path.join(bundle.root, EXPERIENCE_FOUNDATION_SOURCE_PATH);
  if (!fs.existsSync(sourcePath)) return null;
  return readJson(sourcePath);
}

export function validateExperienceFoundation(foundation, {
  registry,
  parentExperienceRegistryRef
} = {}) {
  const errors = [];
  if (!foundation || typeof foundation !== 'object' || Array.isArray(foundation)) {
    return { ok: false, errors: ['Experience Foundation contract is missing'], stats: {} };
  }
  if (foundation.schemaVersion !== EXPERIENCE_FOUNDATION_SCHEMA_VERSION) {
    errors.push(`Experience Foundation schemaVersion must be ${EXPERIENCE_FOUNDATION_SCHEMA_VERSION}`);
  }
  for (const field of ['foundationRef', 'parentExperienceRegistryRef', 'sourceRef', 'sourcePath', 'purpose']) {
    if (!nonEmptyString(foundation[field])) errors.push(`Experience Foundation missing ${field}`);
  }
  if (foundation.sourcePath !== EXPERIENCE_FOUNDATION_SOURCE_PATH) {
    errors.push(`Experience Foundation sourcePath must be ${EXPERIENCE_FOUNDATION_SOURCE_PATH}`);
  }
  if (foundation.effects !== false) errors.push('Experience Foundation effects must be false');
  if (parentExperienceRegistryRef && foundation.parentExperienceRegistryRef !== parentExperienceRegistryRef) {
    errors.push(`Experience Foundation parent must remain ${parentExperienceRegistryRef}`);
  }
  if (!Array.isArray(foundation.nonCollapseRules) || foundation.nonCollapseRules.length === 0 ||
      new Set(foundation.nonCollapseRules).size !== foundation.nonCollapseRules.length) {
    errors.push('Experience Foundation nonCollapseRules must be unique and non-empty');
  }

  const exposureRefs = uniqueRefs(foundation.exposureClasses, 'exposureRef', 'exposureClasses', errors);
  const availabilityRefs = uniqueRefs(foundation.availabilityStates, 'availabilityRef', 'availabilityStates', errors);
  const formRefs = uniqueRefs(foundation.interactionForms, 'formRef', 'interactionForms', errors);
  const patternRefs = uniqueRefs(foundation.experiencePatterns, 'patternRef', 'experiencePatterns', errors);
  const commandRefs = uniqueRefs(foundation.commandBindings, 'commandRef', 'commandBindings', errors);

  const allFoundationRefs = new Set([foundation.foundationRef, foundation.sourceRef]);
  for (const refs of [exposureRefs, availabilityRefs, formRefs, patternRefs, commandRefs]) {
    for (const ref of refs) {
      if (allFoundationRefs.has(ref)) errors.push(`Experience Foundation duplicate stable ref ${ref}`);
      allFoundationRefs.add(ref);
    }
  }

  const seenExposureClasses = new Set();
  for (const exposure of foundation.exposureClasses ?? []) {
    if (!EXPOSURE_CLASSES.has(exposure.exposureClass)) errors.push(`${exposure.exposureRef} has unsupported exposureClass ${exposure.exposureClass}`);
    if (seenExposureClasses.has(exposure.exposureClass)) errors.push(`duplicate exposureClass ${exposure.exposureClass}`);
    seenExposureClasses.add(exposure.exposureClass);
    if (!nonEmptyString(exposure.purpose)) errors.push(`${exposure.exposureRef} missing purpose`);
  }

  const seenAvailabilityStates = new Set();
  for (const availability of foundation.availabilityStates ?? []) {
    if (!AVAILABILITY_STATES.has(availability.availabilityState)) {
      errors.push(`${availability.availabilityRef} has unsupported availabilityState ${availability.availabilityState}`);
    }
    if (seenAvailabilityStates.has(availability.availabilityState)) errors.push(`duplicate availabilityState ${availability.availabilityState}`);
    seenAvailabilityStates.add(availability.availabilityState);
    if (typeof availability.operable !== 'boolean') errors.push(`${availability.availabilityRef} operable must be boolean`);
    if (typeof availability.reasonRequired !== 'boolean') errors.push(`${availability.availabilityRef} reasonRequired must be boolean`);
    if (availability.availabilityState === 'AVAILABLE' && availability.operable !== true) {
      errors.push(`${availability.availabilityRef} AVAILABLE must be operable`);
    }
    if (availability.availabilityState !== 'AVAILABLE' && availability.operable !== false) {
      errors.push(`${availability.availabilityRef} ${availability.availabilityState} must fail closed as non-operable`);
    }
  }

  for (const form of foundation.interactionForms ?? []) {
    if (!INTERACTION_FORM_KINDS.has(form.formKind)) errors.push(`${form.formRef} has unsupported formKind ${form.formKind}`);
    if (!CONSUMER_CLASSES.has(form.consumerClass)) errors.push(`${form.formRef} has unsupported consumerClass ${form.consumerClass}`);
    if (!nonEmptyString(form.purpose)) errors.push(`${form.formRef} missing purpose`);
    if (!Array.isArray(form.platformRefs) || form.platformRefs.length === 0) errors.push(`${form.formRef} platformRefs must be non-empty`);
    for (const platformRef of form.platformRefs ?? []) {
      if (registry) requireRegistryRef(registry, platformRef, ['PLATFORM'], `${form.formRef}.platformRef`, errors);
    }
  }

  for (const pattern of foundation.experiencePatterns ?? []) {
    if (!nonEmptyString(pattern.patternKind) || !nonEmptyString(pattern.purpose)) {
      errors.push(`${pattern.patternRef ?? 'Experience pattern'} requires patternKind and purpose`);
    }
    if (!Array.isArray(pattern.formRefs) || pattern.formRefs.length === 0) errors.push(`${pattern.patternRef} formRefs must be non-empty`);
    for (const formRef of pattern.formRefs ?? []) if (!formRefs.has(formRef)) errors.push(`${pattern.patternRef} references missing form ${formRef}`);
    if (!exposureRefs.has(pattern.defaultExposureRef)) errors.push(`${pattern.patternRef} references missing exposure ${pattern.defaultExposureRef}`);
  }

  const aliasLiterals = new Set();
  for (const command of foundation.commandBindings ?? []) {
    if (!nonEmptyString(command.purpose)) errors.push(`${command.commandRef} missing purpose`);
    if (registry) requireRegistryRef(registry, command.capabilityRef, ['CAPABILITY'], `${command.commandRef}.capabilityRef`, errors);
    if (command.actionRefOrNull !== null && registry) {
      requireRegistryRef(registry, command.actionRefOrNull, ['ACTION'], `${command.commandRef}.actionRefOrNull`, errors);
    }
    if (command.processRefOrNull !== null && registry) {
      requireRegistryRef(registry, command.processRefOrNull, ['PROCESS'], `${command.commandRef}.processRefOrNull`, errors);
    }
    if (!Array.isArray(command.aliases) || command.aliases.length === 0) errors.push(`${command.commandRef} aliases must be non-empty`);
    for (const alias of command.aliases ?? []) {
      if (!nonEmptyString(alias.literal) || !alias.literal.startsWith('/')) errors.push(`${command.commandRef} alias literal must begin with /`);
      if (aliasLiterals.has(alias.literal)) errors.push(`duplicate command alias literal ${alias.literal}`);
      aliasLiterals.add(alias.literal);
      if (!formRefs.has(alias.formRef)) errors.push(`${command.commandRef} alias references missing form ${alias.formRef}`);
      const form = (foundation.interactionForms ?? []).find((item) => item.formRef === alias.formRef);
      if (form && form.formKind !== 'SLASH_ALIAS' && form.formKind !== 'MODEL_TOOL') {
        errors.push(`${command.commandRef} alias form ${alias.formRef} must be SLASH_ALIAS or MODEL_TOOL`);
      }
    }
  }

  const projectionRefs = foundation.projectionRefs ?? {};
  if (!nonEmptyString(projectionRefs.sourceMap) || !nonEmptyString(projectionRefs.revision) || projectionRefs.sourceMap === projectionRefs.revision) {
    errors.push('Experience Foundation projectionRefs.sourceMap and projectionRefs.revision must be distinct refs');
  }
  for (const ref of [projectionRefs.sourceMap, projectionRefs.revision].filter(Boolean)) {
    if (allFoundationRefs.has(ref)) errors.push(`Experience Foundation duplicate projection ref ${ref}`);
    allFoundationRefs.add(ref);
  }
  if (foundation.sourceMapPolicy?.referenceOnly !== true) errors.push('Experience Foundation source map must be reference-only');
  if (foundation.revisionPolicy?.includeStringCatalogValues !== false) {
    errors.push('Experience Foundation revision must not bind raw string catalog values');
  }

  return {
    ok: errors.length === 0,
    errors,
    stats: {
      exposureClasses: exposureRefs.size,
      availabilityStates: availabilityRefs.size,
      interactionForms: formRefs.size,
      experiencePatterns: patternRefs.size,
      commandBindings: commandRefs.size,
      aliases: aliasLiterals.size,
      ownedRefs: allFoundationRefs.size
    }
  };
}

function experienceRevisionInput(bundle, foundation) {
  const blueprint = bundle?.blueprint ?? {};
  return {
    schemaVersion: 'vexlife.experience-revision-input/v1',
    foundation,
    interface: {
      blueprintRef: blueprint.blueprintRef ?? null,
      contractVersion: blueprint.contractVersion ?? null,
      product: blueprint.product ?? null,
      stateDomains: blueprint.stateDomains ?? [],
      roles: blueprint.roles ?? [],
      permissions: blueprint.permissions ?? [],
      actions: blueprint.actions ?? [],
      components: blueprint.components ?? [],
      screens: blueprint.screens ?? [],
      terrain: blueprint.terrain ?? [],
      platforms: blueprint.platforms ?? [],
      tests: blueprint.tests ?? []
    },
    experience: bundle?.experience ?? null,
    capabilities: bundle?.capabilities ?? null
  };
}

export function compileExperienceRevision(bundle, foundation = loadExperienceFoundation(bundle)) {
  if (!foundation) return null;
  return semanticHash(experienceRevisionInput(bundle, foundation));
}

export function buildExperienceSourceMap(registry, foundationRef = 'foundation.vexlife.experience.001') {
  const foundation = registry?.get(foundationRef);
  if (!foundation) return Object.freeze([]);
  const sourceRef = foundation.sourceRef;
  const entries = [...registry.entries.values()]
    .filter((entry) => entry.ref === foundationRef || entry.parentRef === foundationRef || entry.sourceRef === sourceRef)
    .map((entry) => Object.freeze({
      ref: entry.ref,
      kind: entry.kind,
      parentRef: entry.parentRef ?? null,
      sourceRef: entry.sourceRef ?? null,
      edges: Object.freeze((entry.edges ?? []).map((edge) => Object.freeze({ type: edge.type, to: edge.to })))
    }))
    .sort((left, right) => left.ref.localeCompare(right.ref));
  return Object.freeze(entries);
}

export function registerExperienceFoundation({ registry, bundle, foundation = loadExperienceFoundation(bundle) }) {
  if (!foundation) return null;
  const parentExperienceRegistryRef = bundle?.experience?.registryRef ?? null;
  if (parentExperienceRegistryRef && !registry.get(parentExperienceRegistryRef)) {
    registry.register({
      ref: parentExperienceRegistryRef,
      kind: 'EXPERIENCE_REGISTRY',
      brief: 'Experience profiles, gestures, vessels and product interaction grammar',
      version: bundle.experience?.registryVersion ?? null,
      sourceRef: 'blueprint/experience-registry.json'
    });
  }

  const validation = validateExperienceFoundation(foundation, { registry, parentExperienceRegistryRef });
  if (!validation.ok) throw new Error(`Experience Foundation invalid: ${validation.errors.join('; ')}`);

  registry.register({
    ref: foundation.sourceRef,
    kind: 'SOURCE_CONTRACT',
    brief: foundation.sourcePath,
    path: foundation.sourcePath,
    sourceClass: 'PUBLIC_SOURCE_MANAGED_BLUEPRINT'
  });
  registry.register({
    ref: foundation.foundationRef,
    kind: 'EXPERIENCE_FOUNDATION',
    brief: foundation.purpose,
    parentRef: foundation.parentExperienceRegistryRef,
    sourceRef: foundation.sourceRef,
    version: foundation.foundationVersion,
    nonCollapseRules: structuredClone(foundation.nonCollapseRules),
    edges: [
      { type: 'PARENT', to: foundation.parentExperienceRegistryRef },
      { type: 'SOURCE', to: foundation.sourceRef },
      { type: 'PROJECTS', to: foundation.projectionRefs.sourceMap },
      { type: 'PROJECTS', to: foundation.projectionRefs.revision }
    ]
  });

  for (const exposure of foundation.exposureClasses) registry.register({
    ...structuredClone(exposure),
    ref: exposure.exposureRef,
    kind: 'EXPERIENCE_EXPOSURE_CLASS',
    brief: exposure.purpose,
    parentRef: foundation.foundationRef,
    sourceRef: foundation.sourceRef,
    edges: [{ type: 'PARENT', to: foundation.foundationRef }]
  });
  for (const availability of foundation.availabilityStates) registry.register({
    ...structuredClone(availability),
    ref: availability.availabilityRef,
    kind: 'EXPERIENCE_AVAILABILITY_STATE',
    brief: availability.availabilityState,
    parentRef: foundation.foundationRef,
    sourceRef: foundation.sourceRef,
    edges: [{ type: 'PARENT', to: foundation.foundationRef }]
  });
  for (const form of foundation.interactionForms) registry.register({
    ...structuredClone(form),
    ref: form.formRef,
    kind: 'INTERACTION_FORM',
    brief: form.purpose,
    parentRef: foundation.foundationRef,
    sourceRef: foundation.sourceRef,
    edges: [
      { type: 'PARENT', to: foundation.foundationRef },
      ...(form.platformRefs ?? []).map((to) => ({ type: 'PLATFORM', to }))
    ]
  });
  for (const pattern of foundation.experiencePatterns) registry.register({
    ...structuredClone(pattern),
    ref: pattern.patternRef,
    kind: 'EXPERIENCE_PATTERN',
    brief: pattern.purpose,
    parentRef: foundation.foundationRef,
    sourceRef: foundation.sourceRef,
    edges: [
      { type: 'PARENT', to: foundation.foundationRef },
      { type: 'DEFAULT_EXPOSURE', to: pattern.defaultExposureRef },
      ...(pattern.formRefs ?? []).map((to) => ({ type: 'INTERACTION_FORM', to }))
    ]
  });
  for (const command of foundation.commandBindings) registry.register({
    ...structuredClone(command),
    ref: command.commandRef,
    kind: 'COMMAND_BINDING',
    brief: command.purpose,
    parentRef: foundation.foundationRef,
    sourceRef: foundation.sourceRef,
    aliasRefs: (command.aliases ?? []).map((alias) => alias.literal),
    edges: [
      { type: 'PARENT', to: foundation.foundationRef },
      { type: 'CAPABILITY', to: command.capabilityRef },
      ...(command.actionRefOrNull ? [{ type: 'ACTION', to: command.actionRefOrNull }] : []),
      ...(command.processRefOrNull ? [{ type: 'PROCESS', to: command.processRefOrNull }] : []),
      ...(command.aliases ?? []).map((alias) => ({ type: 'INTERACTION_FORM', to: alias.formRef }))
    ]
  });

  const experienceRevision = compileExperienceRevision(bundle, foundation);
  registry.register({
    ref: foundation.projectionRefs.revision,
    kind: 'EXPERIENCE_REVISION_PROJECTION',
    brief: experienceRevision,
    parentRef: foundation.foundationRef,
    sourceRef: foundation.sourceRef,
    experienceRevision,
    edges: [{ type: 'PARENT', to: foundation.foundationRef }]
  });
  registry.register({
    ref: foundation.projectionRefs.sourceMap,
    kind: 'EXPERIENCE_SOURCE_MAP_PROJECTION',
    brief: 'Reference-only Experience source map',
    parentRef: foundation.foundationRef,
    sourceRef: foundation.sourceRef,
    referenceOnly: true,
    edges: [
      { type: 'PARENT', to: foundation.foundationRef },
      { type: 'REVISION', to: foundation.projectionRefs.revision }
    ]
  });

  const sourceMap = buildExperienceSourceMap(registry, foundation.foundationRef);
  const profile = Object.freeze({
    schemaVersion: 'vexlife.experience-foundation-profile/v1',
    foundationRef: foundation.foundationRef,
    parentExperienceRegistryRef: foundation.parentExperienceRegistryRef,
    experienceRevision,
    sourceMap,
    validation: Object.freeze({ ...validation, errors: Object.freeze([...validation.errors]), stats: Object.freeze({ ...validation.stats }) }),
    effects: false
  });
  registry.experienceFoundationProfile = profile;
  return profile;
}

export function compileRegistryPack(bundle) {
  const registry = compileCoreRegistryPack(bundle);
  registerNavigationContinuityRegistry({
    registry,
    navigationContinuity: bundle.blueprint?.navigationContinuity ?? null,
    expectedRegistryRef: bundle.blueprint?.registryRefs?.navigationContinuityRegistryRef ?? null
  });
  registerExperienceFoundation({ registry, bundle });
  return registry;
}

// [VXG RealForever]
