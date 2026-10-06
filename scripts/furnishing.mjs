#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SUBJECT_CLASSES = Object.freeze([
  'RESOURCE_PLACEMENT',
  'DERIVED_COLLECTION',
  'PRESENCE',
  'CONTEXTUAL_INDEX',
  'EXTERNAL_SERVICE'
]);

export const MOVEMENT_CLASSES = Object.freeze(['G', 'P', 'V', 'A', 'S']);
export const PLACEMENT_POSTURES = Object.freeze(['PLACED', 'MULTI_HOME', 'UNPLACED', 'HELD']);
export const ADDRESSABILITY_LINK_CLASSES = Object.freeze([
  'ORIENTATION_NEIGHBOR',
  'CONTEXTUAL_PROJECTION',
  'CONTINUATION_ENTRY',
  'SOURCE_ASSOCIATION'
]);
export const PLATFORM_POSTURES = Object.freeze([
  'SHARED_IDENTITY',
  'ADAPTER_REQUIRED',
  'HELD',
  'NOT_APPLICABLE'
]);
export const STATE_VOCABULARIES = Object.freeze({
  currentness: Object.freeze(['CURRENT', 'HELD', 'UNKNOWN']),
  visibility: Object.freeze(['VISIBLE', 'HIDDEN', 'HELD', 'UNKNOWN']),
  reachability: Object.freeze(['REACHABLE', 'UNREACHABLE', 'HELD', 'UNKNOWN']),
  availability: Object.freeze(['AVAILABLE', 'UNAVAILABLE', 'HELD', 'UNKNOWN']),
  attention: Object.freeze(['ATTENTION', 'NONE', 'HELD', 'UNKNOWN']),
  recovery: Object.freeze(['AVAILABLE', 'UNAVAILABLE', 'HELD', 'UNKNOWN'])
});
export const ACTION_AVAILABILITY_STATES = Object.freeze(['AVAILABLE', 'HELD', 'UNAVAILABLE', 'UNKNOWN']);

const AXES = Object.keys(STATE_VOCABULARIES);
const EFFECTS = [
  'network', 'provider', 'publication', 'Home', 'Memory', 'training', 'modelWeights',
  'sensorActivation', 'relationshipMutation', 'conversationMutation', 'libraryMutation',
  'semanticMutation', 'effectAuthority'
];
const NON_COLLAPSE = [
  'VEX_FURNISHING != SEMANTIC_OWNER',
  'RESOURCE_IDENTITY != CURRENT_PLACEMENT',
  'PLACEMENT_MOVE != RESOURCE_MIGRATION',
  'GEOMETRY_MOVE != SEMANTIC_MOVE',
  'MULTI_HOME_PROJECTION != DUPLICATE_RESOURCE',
  'PLACED != CURRENTLY_VISIBLE',
  'CURRENTLY_VISIBLE != CURRENTLY_EXECUTABLE',
  'ADDRESSABILITY_LINK != SEMANTIC_RELATIONSHIP_EDGE',
  'ACTION_REFERENCE != EFFECT_AUTHORITY',
  'FURNISHING_REGISTRY != CURRENT_STATE_STORE',
  'FURNISHING_PROJECTION != PRODUCT_TRUTH',
  'PRESENTATION_GRAPH != SEMANTIC_OWNER',
  'NAVIGATION_ROUTE != EFFECT_AUTHORITY',
  'ANDROID_PROJECTION != ANDROID_SEMANTIC_FORK',
  'VEX_PERCEPTION != EFFECT_AUTHORITY'
];

const copy = (value) => structuredClone(value);
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const req = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value;
};
const nullable = (value, label) => {
  if (value !== null) req(value, label);
};
const uniqStrings = (value, label, nonempty = false) => {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) {
    throw new Error(`${label} must be ${nonempty ? 'a non-empty ' : 'an '}array`);
  }
  value.forEach((entry, index) => req(entry, `${label}[${index}]`));
  if (new Set(value).size !== value.length) throw new Error(`${label} contains duplicate values`);
  return [...value];
};
const exact = (value, keys, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const extra = Object.keys(value).find((key) => !keys.includes(key));
  if (extra) throw new Error(`${label} has unsupported field ${extra}`);
  const missing = keys.find((key) => !Object.hasOwn(value, key));
  if (missing) throw new Error(`${label} missing ${missing}`);
};
const setEq = (actual, expected, label) => {
  if (JSON.stringify([...actual].sort(compareText)) !== JSON.stringify([...expected].sort(compareText))) {
    throw new Error(`${label} does not match closed vocabulary`);
  }
};
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort(compareText).map((key) => [key, stable(value[key])]));
}
function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function placement(value, label) {
  exact(value, [
    'placementRef', 'terrainNodeRefOrNull', 'presentationRefOrNull', 'routeRefOrNull',
    'experienceDispositionRefOrNull', 'ownerRefs', 'sourceRefs'
  ], label);
  req(value.placementRef, `${label}.placementRef`);
  nullable(value.terrainNodeRefOrNull, `${label}.terrainNodeRefOrNull`);
  nullable(value.presentationRefOrNull, `${label}.presentationRefOrNull`);
  nullable(value.routeRefOrNull, `${label}.routeRefOrNull`);
  nullable(value.experienceDispositionRefOrNull, `${label}.experienceDispositionRefOrNull`);
  uniqStrings(value.ownerRefs, `${label}.ownerRefs`, true);
  uniqStrings(value.sourceRefs, `${label}.sourceRefs`, true);
  if (!value.terrainNodeRefOrNull && !value.presentationRefOrNull && !value.routeRefOrNull) {
    throw new Error(`${label} must bind Terrain, Presentation, or Navigation`);
  }
  return {
    ...copy(value),
    ownerRefs: [...value.ownerRefs].sort(compareText),
    sourceRefs: [...value.sourceRefs].sort(compareText)
  };
}

function binding(value, axis, label) {
  exact(value, ['bindingRef', 'ownerRef', 'sourceRef', 'required'], label);
  req(value.bindingRef, `${label}.bindingRef`);
  req(value.ownerRef, `${label}.ownerRef`);
  req(value.sourceRef, `${label}.sourceRef`);
  if (typeof value.required !== 'boolean') throw new Error(`${label}.required must be boolean`);
  return { ...copy(value), axis };
}

function addressabilityLink(value, label) {
  exact(value, [
    'linkRef', 'linkClass', 'targetSubjectRef', 'ownerRef', 'sourceRef', 'semanticRelationAuthority'
  ], label);
  req(value.linkRef, `${label}.linkRef`);
  if (!ADDRESSABILITY_LINK_CLASSES.includes(value.linkClass)) throw new Error(`${label} has unsupported linkClass`);
  req(value.targetSubjectRef, `${label}.targetSubjectRef`);
  req(value.ownerRef, `${label}.ownerRef`);
  req(value.sourceRef, `${label}.sourceRef`);
  if (value.semanticRelationAuthority !== false) {
    throw new Error(`${label} cannot acquire semantic relation authority`);
  }
  return copy(value);
}

function actionBinding(value, label) {
  exact(value, [
    'actionBindingRef', 'actionRef', 'permissionRefOrNull', 'actionSourceRef',
    'availabilityBindingRef', 'availabilityOwnerRef', 'availabilitySourceRef', 'required'
  ], label);
  req(value.actionBindingRef, `${label}.actionBindingRef`);
  req(value.actionRef, `${label}.actionRef`);
  nullable(value.permissionRefOrNull, `${label}.permissionRefOrNull`);
  req(value.actionSourceRef, `${label}.actionSourceRef`);
  req(value.availabilityBindingRef, `${label}.availabilityBindingRef`);
  req(value.availabilityOwnerRef, `${label}.availabilityOwnerRef`);
  req(value.availabilitySourceRef, `${label}.availabilitySourceRef`);
  if (typeof value.required !== 'boolean') throw new Error(`${label}.required must be boolean`);
  return copy(value);
}

function normalizedRecord(record, label) {
  exact(record, [
    'furnishingRef', 'subject', 'placement', 'bindings', 'actionBindings',
    'addressabilityLinks', 'platformProjections', 'wakePredicates'
  ], label);
  req(record.furnishingRef, `${label}.furnishingRef`);

  exact(record.subject, ['subjectClass', 'subjectRef', 'resourceRefOrNull', 'semanticOwnerRefs', 'sourceRefs'], `${label}.subject`);
  if (!SUBJECT_CLASSES.includes(record.subject.subjectClass)) throw new Error(`${label}.subject has unsupported subjectClass`);
  req(record.subject.subjectRef, `${label}.subject.subjectRef`);
  nullable(record.subject.resourceRefOrNull, `${label}.subject.resourceRefOrNull`);
  uniqStrings(record.subject.semanticOwnerRefs, `${label}.subject.semanticOwnerRefs`);
  uniqStrings(record.subject.sourceRefs, `${label}.subject.sourceRefs`, true);
  if (record.subject.subjectClass === 'RESOURCE_PLACEMENT' && !record.subject.resourceRefOrNull) {
    throw new Error(`${label} RESOURCE_PLACEMENT requires resourceRefOrNull`);
  }
  if (['DERIVED_COLLECTION', 'CONTEXTUAL_INDEX'].includes(record.subject.subjectClass) && record.subject.resourceRefOrNull !== null) {
    throw new Error(`${label} ${record.subject.subjectClass} must not claim a canonical resource store`);
  }

  exact(record.placement, ['posture', 'primary', 'contextual'], `${label}.placement`);
  if (!PLACEMENT_POSTURES.includes(record.placement.posture)) throw new Error(`${label}.placement has unsupported posture`);
  const primary = record.placement.primary === null ? null : placement(record.placement.primary, `${label}.placement.primary`);
  if (!Array.isArray(record.placement.contextual)) throw new Error(`${label}.placement.contextual must be an array`);
  const contextual = record.placement.contextual
    .map((value, index) => placement(value, `${label}.placement.contextual[${index}]`))
    .sort((left, right) => compareText(left.placementRef, right.placementRef));
  const placementCount = (primary ? 1 : 0) + contextual.length;
  if (record.placement.posture === 'PLACED' && (!primary || contextual.length !== 0)) {
    throw new Error(`${label} PLACED posture requires exactly one primary placement; use MULTI_HOME for multiple homes`);
  }
  if (record.placement.posture === 'MULTI_HOME' && placementCount < 2) {
    throw new Error(`${label} MULTI_HOME posture requires at least two placements`);
  }
  if (record.placement.posture === 'UNPLACED' && placementCount !== 0) {
    throw new Error(`${label} UNPLACED posture cannot carry placements`);
  }
  if (!record.subject.semanticOwnerRefs.length
      && !['DERIVED_COLLECTION', 'CONTEXTUAL_INDEX'].includes(record.subject.subjectClass)
      && record.placement.posture !== 'HELD') {
    throw new Error(`${label} requires semantic owner or HELD posture`);
  }
  const placementRefs = [primary, ...contextual].filter(Boolean).map((value) => value.placementRef);
  if (new Set(placementRefs).size !== placementRefs.length) throw new Error(`${label} contains duplicate placementRef`);

  exact(record.bindings, AXES, `${label}.bindings`);
  const bindings = {};
  const bindingRefs = [];
  for (const axis of AXES) {
    if (!Array.isArray(record.bindings[axis])) throw new Error(`${label}.bindings.${axis} must be an array`);
    bindings[axis] = record.bindings[axis]
      .map((value, index) => binding(value, axis, `${label}.bindings.${axis}[${index}]`))
      .sort((left, right) => compareText(left.bindingRef, right.bindingRef));
    bindingRefs.push(...bindings[axis].map((value) => value.bindingRef));
  }

  if (!Array.isArray(record.actionBindings)) throw new Error(`${label}.actionBindings must be an array`);
  const actionBindings = record.actionBindings
    .map((value, index) => actionBinding(value, `${label}.actionBindings[${index}]`))
    .sort((left, right) => compareText(left.actionBindingRef, right.actionBindingRef));
  const actionBindingRefs = actionBindings.map((value) => value.actionBindingRef);
  const actionAvailabilityBindingRefs = actionBindings.map((value) => value.availabilityBindingRef);
  if (new Set(actionBindingRefs).size !== actionBindingRefs.length) throw new Error(`${label} contains duplicate actionBindingRef`);
  if (new Set(actionAvailabilityBindingRefs).size !== actionAvailabilityBindingRefs.length) {
    throw new Error(`${label} contains duplicate action availability bindingRef`);
  }

  const allDynamicBindingRefs = [...bindingRefs, ...actionAvailabilityBindingRefs];
  if (new Set(allDynamicBindingRefs).size !== allDynamicBindingRefs.length) throw new Error(`${label} contains duplicate bindingRef`);

  if (!Array.isArray(record.addressabilityLinks)) throw new Error(`${label}.addressabilityLinks must be an array`);
  const addressabilityLinks = record.addressabilityLinks
    .map((value, index) => addressabilityLink(value, `${label}.addressabilityLinks[${index}]`))
    .sort((left, right) => compareText(left.linkRef, right.linkRef));
  if (new Set(addressabilityLinks.map((value) => value.linkRef)).size !== addressabilityLinks.length) {
    throw new Error(`${label} contains duplicate linkRef`);
  }

  if (!Array.isArray(record.platformProjections)) throw new Error(`${label}.platformProjections must be an array`);
  const platformProjections = record.platformProjections
    .map((value, index) => {
      const itemLabel = `${label}.platformProjections[${index}]`;
      exact(value, ['projectionRef', 'platformRef', 'posture', 'ownerRef', 'sourceRef'], itemLabel);
      req(value.projectionRef, `${itemLabel}.projectionRef`);
      req(value.platformRef, `${itemLabel}.platformRef`);
      if (!PLATFORM_POSTURES.includes(value.posture)) throw new Error(`${itemLabel} has unsupported posture`);
      req(value.ownerRef, `${itemLabel}.ownerRef`);
      req(value.sourceRef, `${itemLabel}.sourceRef`);
      return copy(value);
    })
    .sort((left, right) => compareText(left.projectionRef, right.projectionRef));
  if (new Set(platformProjections.map((value) => value.projectionRef)).size !== platformProjections.length) {
    throw new Error(`${label} contains duplicate projectionRef`);
  }

  if (!Array.isArray(record.wakePredicates)) throw new Error(`${label}.wakePredicates must be an array`);
  const wakePredicates = record.wakePredicates
    .map((value, index) => {
      const itemLabel = `${label}.wakePredicates[${index}]`;
      exact(value, ['predicateRef', 'ownerRef', 'sourceRef'], itemLabel);
      req(value.predicateRef, `${itemLabel}.predicateRef`);
      req(value.ownerRef, `${itemLabel}.ownerRef`);
      req(value.sourceRef, `${itemLabel}.sourceRef`);
      return copy(value);
    })
    .sort((left, right) => compareText(left.predicateRef, right.predicateRef));
  if (new Set(wakePredicates.map((value) => value.predicateRef)).size !== wakePredicates.length) {
    throw new Error(`${label} contains duplicate predicateRef`);
  }

  return {
    furnishingRef: record.furnishingRef,
    subject: {
      ...copy(record.subject),
      semanticOwnerRefs: [...record.subject.semanticOwnerRefs].sort(compareText),
      sourceRefs: [...record.subject.sourceRefs].sort(compareText)
    },
    placement: { posture: record.placement.posture, primary, contextual },
    bindings,
    actionBindings,
    addressabilityLinks,
    platformProjections,
    wakePredicates
  };
}

function checkKnown(record, knownRefs, internalSubjectRefs) {
  const check = (refValue, label) => {
    if (!knownRefs.has(refValue)) throw new Error(`${record.furnishingRef} ${label} references unknown ref ${refValue}`);
  };
  if (record.subject.subjectClass === 'RESOURCE_PLACEMENT') check(record.subject.subjectRef, 'subjectRef');
  if (record.subject.resourceRefOrNull) check(record.subject.resourceRefOrNull, 'resourceRefOrNull');
  record.subject.semanticOwnerRefs.forEach((value) => check(value, 'semanticOwnerRef'));
  record.subject.sourceRefs.forEach((value) => check(value, 'subject sourceRef'));
  for (const item of [record.placement.primary, ...record.placement.contextual].filter(Boolean)) {
    for (const value of [item.terrainNodeRefOrNull, item.presentationRefOrNull, item.routeRefOrNull, item.experienceDispositionRefOrNull].filter(Boolean)) {
      check(value, 'placement identity');
    }
    item.ownerRefs.forEach((value) => check(value, 'placement ownerRef'));
    item.sourceRefs.forEach((value) => check(value, 'placement sourceRef'));
  }
  for (const axis of AXES) {
    for (const item of record.bindings[axis]) {
      check(item.ownerRef, `${axis} ownerRef`);
      check(item.sourceRef, `${axis} sourceRef`);
    }
  }
  for (const item of record.actionBindings) {
    check(item.actionRef, 'actionRef');
    if (item.permissionRefOrNull) check(item.permissionRefOrNull, 'permissionRefOrNull');
    check(item.actionSourceRef, 'action sourceRef');
    check(item.availabilityOwnerRef, 'action availability ownerRef');
    check(item.availabilitySourceRef, 'action availability sourceRef');
  }
  for (const item of record.addressabilityLinks) {
    if (!internalSubjectRefs.has(item.targetSubjectRef)) check(item.targetSubjectRef, 'addressability targetSubjectRef');
    check(item.ownerRef, 'addressability ownerRef');
    check(item.sourceRef, 'addressability sourceRef');
  }
  for (const item of record.platformProjections) {
    check(item.platformRef, 'platformRef');
    check(item.ownerRef, 'platform ownerRef');
    check(item.sourceRef, 'platform sourceRef');
  }
  for (const item of record.wakePredicates) {
    check(item.ownerRef, 'wake ownerRef');
    check(item.sourceRef, 'wake sourceRef');
  }
}

export function loadFurnishingRegistry(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, 'blueprint/furnishing-registry.json'), 'utf8'));
}

export function validateFurnishingRegistry(registry) {
  exact(registry, [
    'schemaVersion', 'registryRef', 'registryVersion', 'ownerRef', 'parentRef', 'sourcePlacementRef',
    'purpose', 'effects', 'nonCollapseRules', 'contract', 'furnishings'
  ], 'furnishing registry');
  if (registry.schemaVersion !== 'vexlife.furnishing-registry/v0') throw new Error('unsupported Furnishing registry schemaVersion');
  req(registry.registryRef, 'registryRef');
  if (!Number.isInteger(registry.registryVersion) || registry.registryVersion < 1) {
    throw new Error('registryVersion must be a positive integer');
  }
  ['ownerRef', 'parentRef', 'sourcePlacementRef', 'purpose'].forEach((key) => req(registry[key], key));

  exact(registry.effects, EFFECTS, 'effects');
  EFFECTS.forEach((key) => {
    if (registry.effects[key] !== false) throw new Error(`Furnishing registry may not grant ${key}`);
  });
  uniqStrings(registry.nonCollapseRules, 'nonCollapseRules', true);
  NON_COLLAPSE.forEach((value) => {
    if (!registry.nonCollapseRules.includes(value)) throw new Error(`missing non-collapse rule ${value}`);
  });

  exact(registry.contract, [
    'subjectClasses', 'movementClasses', 'placementPostures', 'addressabilityLinkClasses',
    'platformPostures', 'derivedStateVocabularies', 'actionAvailabilityStates', 'projectionPolicy'
  ], 'contract');
  setEq(uniqStrings(registry.contract.subjectClasses, 'contract.subjectClasses'), SUBJECT_CLASSES, 'subjectClasses');
  setEq(uniqStrings(registry.contract.movementClasses, 'contract.movementClasses'), MOVEMENT_CLASSES, 'movementClasses');
  setEq(uniqStrings(registry.contract.placementPostures, 'contract.placementPostures'), PLACEMENT_POSTURES, 'placementPostures');
  setEq(uniqStrings(registry.contract.addressabilityLinkClasses, 'contract.addressabilityLinkClasses'), ADDRESSABILITY_LINK_CLASSES, 'addressabilityLinkClasses');
  setEq(uniqStrings(registry.contract.platformPostures, 'contract.platformPostures'), PLATFORM_POSTURES, 'platformPostures');
  exact(registry.contract.derivedStateVocabularies, AXES, 'derivedStateVocabularies');
  AXES.forEach((axis) => setEq(
    uniqStrings(registry.contract.derivedStateVocabularies[axis], `contract.derivedStateVocabularies.${axis}`),
    STATE_VOCABULARIES[axis],
    axis
  ));
  setEq(
    uniqStrings(registry.contract.actionAvailabilityStates, 'contract.actionAvailabilityStates'),
    ACTION_AVAILABILITY_STATES,
    'actionAvailabilityStates'
  );

  const policy = registry.contract.projectionPolicy;
  exact(policy, [
    'registryStoresDynamicTruth', 'missingRequiredBindingState', 'conflictingSourceObservationsState',
    'semanticRelationAuthority', 'addressabilityLinksAreSemanticRelations', 'effectAuthorityGranted',
    'boundedNeighborhoods', 'rawHistoryRequired'
  ], 'projectionPolicy');
  if (policy.registryStoresDynamicTruth
      || policy.semanticRelationAuthority
      || policy.addressabilityLinksAreSemanticRelations
      || policy.effectAuthorityGranted
      || !policy.boundedNeighborhoods
      || policy.rawHistoryRequired
      || policy.missingRequiredBindingState !== 'UNKNOWN'
      || policy.conflictingSourceObservationsState !== 'UNKNOWN') {
    throw new Error('invalid Furnishing projection authority/currentness policy');
  }

  if (!Array.isArray(registry.furnishings)) throw new Error('furnishings must be an array');
  const normalized = registry.furnishings.map((value, index) => normalizedRecord(value, `furnishings[${index}]`));
  if (new Set(normalized.map((value) => value.furnishingRef)).size !== normalized.length) throw new Error('duplicate furnishingRef');
  return { ok: true, furnishingCount: normalized.length };
}

export function compileFurnishingRegistry(registry, { knownRefs = null } = {}) {
  validateFurnishingRegistry(registry);
  const furnishings = registry.furnishings
    .map((value, index) => normalizedRecord(value, `furnishings[${index}]`))
    .sort((left, right) => compareText(left.furnishingRef, right.furnishingRef));
  const internalSubjectRefs = new Set(furnishings.map((value) => value.subject.subjectRef));
  if (internalSubjectRefs.size !== furnishings.length) throw new Error('duplicate subjectRef');
  if (knownRefs !== null && !(knownRefs instanceof Set)) throw new Error('knownRefs must be a Set');
  if (knownRefs) furnishings.forEach((record) => checkKnown(record, knownRefs, internalSubjectRefs));

  const core = {
    schemaVersion: 'vexlife.furnishing-contract/v0',
    registryRef: registry.registryRef,
    registryVersion: registry.registryVersion,
    ownerRef: registry.ownerRef,
    subjectClasses: [...SUBJECT_CLASSES],
    movementClasses: [...MOVEMENT_CLASSES],
    placementPostures: [...PLACEMENT_POSTURES],
    addressabilityLinkClasses: [...ADDRESSABILITY_LINK_CLASSES],
    stateVocabularies: copy(STATE_VOCABULARIES),
    actionAvailabilityStates: [...ACTION_AVAILABILITY_STATES],
    furnishings
  };
  return {
    ...core,
    registryRevision: digest(core),
    semanticAuthority: false,
    semanticRelationAuthority: false,
    currentStateAuthority: false,
    effectAuthority: false
  };
}

function semanticIdentity(record) {
  return {
    subjectClass: record.subject.subjectClass,
    subjectRef: record.subject.subjectRef,
    resourceRefOrNull: record.subject.resourceRefOrNull,
    semanticOwnerRefs: [...record.subject.semanticOwnerRefs].sort(compareText),
    sourceRefs: [...record.subject.sourceRefs].sort(compareText)
  };
}

function withoutPlacement(record) {
  const copyRecord = copy(record);
  delete copyRecord.placement;
  return stable(copyRecord);
}

export function validateMovement(before, after, movementClass) {
  if (!MOVEMENT_CLASSES.includes(movementClass)) throw new Error(`unsupported movementClass ${movementClass}`);
  const prior = normalizedRecord(before, 'before');
  const next = normalizedRecord(after, 'after');
  if (movementClass === 'S') throw new Error('S semantic migration must be routed to the semantic owner');
  if (prior.furnishingRef !== next.furnishingRef
      || JSON.stringify(semanticIdentity(prior)) !== JSON.stringify(semanticIdentity(next))) {
    throw new Error(`${movementClass} movement cannot change Furnishing or semantic subject identity`);
  }
  if (['G', 'V', 'A'].includes(movementClass) && JSON.stringify(stable(prior)) !== JSON.stringify(stable(next))) {
    throw new Error(`${movementClass} movement is external projection truth and must not rewrite static Furnishing registry semantics`);
  }
  if (movementClass === 'P' && JSON.stringify(withoutPlacement(prior)) !== JSON.stringify(withoutPlacement(next))) {
    throw new Error('P movement may change placement composition only');
  }
  return { ok: true, movementClass, semanticIdentityPreserved: true };
}

function observationMap(observations) {
  if (!Array.isArray(observations)) throw new Error('observations must be an array');
  const map = new Map();
  observations.forEach((value, index) => {
    const label = `observations[${index}]`;
    exact(value, ['bindingRef', 'ownerRef', 'sourceRef', 'state', 'reasonRefs', 'evidenceRefs', 'effectAuthorityGranted'], label);
    ['bindingRef', 'ownerRef', 'sourceRef', 'state'].forEach((key) => req(value[key], `${label}.${key}`));
    uniqStrings(value.reasonRefs, `${label}.reasonRefs`);
    uniqStrings(value.evidenceRefs, `${label}.evidenceRefs`);
    if (value.effectAuthorityGranted !== false) throw new Error(`${value.bindingRef} observation attempts to grant effect authority`);
    if (map.has(value.bindingRef)) throw new Error(`duplicate observation for ${value.bindingRef}`);
    map.set(value.bindingRef, copy(value));
  });
  return map;
}

function axisState(bindings, axis, observations) {
  if (bindings.length === 0) return { state: 'UNKNOWN', observations: [], unknowns: [`NO_${axis.toUpperCase()}_BINDINGS`] };
  const used = [];
  const unknowns = [];
  for (const item of bindings) {
    const observation = observations.get(item.bindingRef);
    if (!observation) {
      if (item.required) unknowns.push(`MISSING_REQUIRED_BINDING:${item.bindingRef}`);
      continue;
    }
    if (observation.ownerRef !== item.ownerRef || observation.sourceRef !== item.sourceRef) {
      throw new Error(`${item.bindingRef} observation identity mismatch`);
    }
    if (!STATE_VOCABULARIES[axis].includes(observation.state)) {
      throw new Error(`${item.bindingRef} has invalid ${axis} state ${observation.state}`);
    }
    used.push(observation);
  }
  used.sort((left, right) => compareText(left.bindingRef, right.bindingRef));
  if (unknowns.length) return { state: 'UNKNOWN', observations: used, unknowns };
  if (used.length === 0) return { state: 'UNKNOWN', observations: [], unknowns: [`NO_${axis.toUpperCase()}_OBSERVATIONS`] };
  const states = [...new Set(used.map((value) => value.state))];
  return states.length === 1
    ? { state: states[0], observations: used, unknowns: [] }
    : { state: 'UNKNOWN', observations: used, unknowns: [`CONFLICTING_${axis.toUpperCase()}_SOURCE_OBSERVATIONS`] };
}

function projectedAction(bindingSpec, observations) {
  const observation = observations.get(bindingSpec.availabilityBindingRef);
  if (!observation) {
    return {
      actionBindingRef: bindingSpec.actionBindingRef,
      actionRef: bindingSpec.actionRef,
      permissionRefOrNull: bindingSpec.permissionRefOrNull,
      state: 'UNKNOWN',
      reasonRefs: [],
      evidenceRefs: [],
      unknowns: bindingSpec.required ? [`MISSING_REQUIRED_BINDING:${bindingSpec.availabilityBindingRef}`] : ['NO_ACTION_AVAILABILITY_OBSERVATION'],
      sourceRefs: [bindingSpec.actionSourceRef, bindingSpec.availabilitySourceRef].sort(compareText),
      effectAuthorityGranted: false
    };
  }
  if (observation.ownerRef !== bindingSpec.availabilityOwnerRef
      || observation.sourceRef !== bindingSpec.availabilitySourceRef) {
    throw new Error(`${bindingSpec.availabilityBindingRef} action availability observation identity mismatch`);
  }
  if (!ACTION_AVAILABILITY_STATES.includes(observation.state)) {
    throw new Error(`${bindingSpec.availabilityBindingRef} has invalid action availability state ${observation.state}`);
  }
  return {
    actionBindingRef: bindingSpec.actionBindingRef,
    actionRef: bindingSpec.actionRef,
    permissionRefOrNull: bindingSpec.permissionRefOrNull,
    state: observation.state,
    reasonRefs: [...observation.reasonRefs].sort(compareText),
    evidenceRefs: [...observation.evidenceRefs].sort(compareText),
    unknowns: [],
    sourceRefs: [bindingSpec.actionSourceRef, bindingSpec.availabilitySourceRef].sort(compareText),
    effectAuthorityGranted: false
  };
}

export function selectFurnishingNeighborhood(compiled, { seedFurnishingRefs, maxHops = 1, maxResults = 32 } = {}) {
  if (compiled?.schemaVersion !== 'vexlife.furnishing-contract/v0') throw new Error('compiled Furnishing contract required');
  if (!Array.isArray(seedFurnishingRefs) || seedFurnishingRefs.length === 0) throw new Error('seedFurnishingRefs must be a non-empty array');
  if (!Number.isInteger(maxHops) || maxHops < 0 || maxHops > 8) throw new Error('maxHops must be an integer between 0 and 8');
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 128) throw new Error('maxResults must be an integer between 1 and 128');

  const byFurnishingRef = new Map(compiled.furnishings.map((value) => [value.furnishingRef, value]));
  const bySubjectRef = new Map(compiled.furnishings.map((value) => [value.subject.subjectRef, value.furnishingRef]));
  const queue = [];
  const distance = new Map();
  for (const refValue of [...new Set(seedFurnishingRefs)].sort(compareText)) {
    if (!byFurnishingRef.has(refValue)) throw new Error(`unknown seed Furnishing ref ${refValue}`);
    distance.set(refValue, 0);
    queue.push(refValue);
  }
  while (queue.length && distance.size < maxResults) {
    const current = queue.shift();
    const hops = distance.get(current);
    if (hops >= maxHops) continue;
    for (const link of byFurnishingRef.get(current).addressabilityLinks) {
      const target = bySubjectRef.get(link.targetSubjectRef);
      if (!target || distance.has(target)) continue;
      distance.set(target, hops + 1);
      queue.push(target);
      if (distance.size >= maxResults) break;
    }
  }
  return [...distance]
    .sort((left, right) => left[1] - right[1] || compareText(left[0], right[0]))
    .map(([furnishingRef, hops]) => ({ furnishingRef, hops }));
}

export function projectFurnishings(compiled, {
  observations = [],
  currentSemanticContextRefOrNull = null,
  selectedFurnishingRefOrNull = null,
  includeFurnishingRefsOrNull = null
} = {}) {
  if (compiled?.schemaVersion !== 'vexlife.furnishing-contract/v0') throw new Error('compiled Furnishing contract required');
  nullable(currentSemanticContextRefOrNull, 'currentSemanticContextRefOrNull');
  nullable(selectedFurnishingRefOrNull, 'selectedFurnishingRefOrNull');

  const byRef = new Map(compiled.furnishings.map((value) => [value.furnishingRef, value]));
  const refs = includeFurnishingRefsOrNull === null
    ? [...byRef.keys()].sort(compareText)
    : uniqStrings(includeFurnishingRefsOrNull, 'includeFurnishingRefsOrNull').sort(compareText);
  refs.forEach((value) => {
    if (!byRef.has(value)) throw new Error(`unknown included Furnishing ref ${value}`);
  });
  if (selectedFurnishingRefOrNull && !byRef.has(selectedFurnishingRefOrNull)) {
    throw new Error(`unknown selected Furnishing ref ${selectedFurnishingRefOrNull}`);
  }
  if (selectedFurnishingRefOrNull && !refs.includes(selectedFurnishingRefOrNull)) {
    throw new Error('selected Furnishing ref must be included in the bounded projection');
  }

  const observationByBinding = observationMap(observations);
  const allowedBindings = new Set(refs.flatMap((refValue) => {
    const item = byRef.get(refValue);
    return [
      ...AXES.flatMap((axis) => item.bindings[axis].map((bindingSpec) => bindingSpec.bindingRef)),
      ...item.actionBindings.map((action) => action.availabilityBindingRef)
    ];
  }));
  for (const bindingRef of observationByBinding.keys()) {
    if (!allowedBindings.has(bindingRef)) throw new Error(`observation references unknown or out-of-scope binding ${bindingRef}`);
  }

  const furnishings = refs.map((refValue) => {
    const item = byRef.get(refValue);
    const states = Object.fromEntries(AXES.map((axis) => [axis, axisState(item.bindings[axis], axis, observationByBinding)]));
    const actions = item.actionBindings.map((action) => projectedAction(action, observationByBinding));
    const availableActions = actions.filter((action) => action.state === 'AVAILABLE').map((action) => action.actionRef);
    const heldActionsWithReasons = actions
      .filter((action) => ['HELD', 'UNAVAILABLE'].includes(action.state))
      .map((action) => ({ actionRef: action.actionRef, state: action.state, reasonRefs: [...action.reasonRefs] }));
    const unknownActionRefs = actions.filter((action) => action.state === 'UNKNOWN').map((action) => action.actionRef);
    const whyVisible = states.visibility.observations
      .filter((observation) => observation.state === 'VISIBLE')
      .flatMap((observation) => observation.reasonRefs)
      .sort(compareText);
    const attentionReasons = states.attention.observations
      .filter((observation) => observation.state === 'ATTENTION')
      .flatMap((observation) => observation.reasonRefs)
      .sort(compareText);
    const unknowns = [
      ...AXES.flatMap((axis) => states[axis].unknowns),
      ...actions.flatMap((action) => action.unknowns)
    ].sort(compareText);
    const sourceRefs = new Set(item.subject.sourceRefs);
    for (const placementItem of [item.placement.primary, ...item.placement.contextual].filter(Boolean)) {
      placementItem.sourceRefs.forEach((sourceRef) => sourceRefs.add(sourceRef));
    }
    AXES.forEach((axis) => item.bindings[axis].forEach((bindingSpec) => sourceRefs.add(bindingSpec.sourceRef)));
    item.actionBindings.forEach((action) => {
      sourceRefs.add(action.actionSourceRef);
      sourceRefs.add(action.availabilitySourceRef);
    });
    [...item.addressabilityLinks, ...item.platformProjections, ...item.wakePredicates]
      .forEach((value) => sourceRefs.add(value.sourceRef));
    AXES.forEach((axis) => states[axis].observations
      .forEach((observation) => observation.evidenceRefs.forEach((evidenceRef) => sourceRefs.add(evidenceRef))));
    actions.forEach((action) => action.evidenceRefs.forEach((evidenceRef) => sourceRefs.add(evidenceRef)));

    return {
      furnishingRef: item.furnishingRef,
      subject: copy(item.subject),
      placement: copy(item.placement),
      addressabilityLinks: copy(item.addressabilityLinks),
      ...states,
      actions,
      availableActions,
      heldActionsWithReasons,
      unknownActionRefs,
      platformProjections: copy(item.platformProjections),
      wakePredicates: copy(item.wakePredicates),
      whyVisible,
      attentionReasons,
      unknowns,
      sourceRefs: [...sourceRefs].sort(compareText),
      semanticAuthority: false,
      semanticRelationAuthority: false,
      effectAuthorityGranted: false
    };
  });

  const frameSeed = { registryRevision: compiled.registryRevision, currentSemanticContextRefOrNull, selectedFurnishingRefOrNull, refs };
  const neighborhoodId = digest(frameSeed).slice(0, 24);
  return {
    schemaVersion: 'vexlife.furnishing-projection/v0',
    sourceRegistryRef: compiled.registryRef,
    registryRevision: compiled.registryRevision,
    currentSemanticContextRefOrNull,
    currentFurnishingNeighborhoodRef: `neighborhood.vexlife.furnishing.${neighborhoodId}`,
    selectedFurnishingRefOrNull,
    furnishingRefs: refs,
    furnishings,
    availableActions: furnishings.flatMap((item) => item.availableActions.map((actionRef) => ({ furnishingRef: item.furnishingRef, actionRef }))),
    heldActionsWithReasons: furnishings.flatMap((item) => item.heldActionsWithReasons.map((action) => ({ furnishingRef: item.furnishingRef, ...action }))),
    unknownActions: furnishings.flatMap((item) => item.unknownActionRefs.map((actionRef) => ({ furnishingRef: item.furnishingRef, actionRef }))),
    semanticAuthority: false,
    semanticRelationAuthority: false,
    effectAuthorityGranted: false
  };
}

async function main() {
  const compiled = compileFurnishingRegistry(loadFurnishingRegistry(ROOT));
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 'vexlife.furnishing-compiler-result/v0',
    state: 'PASS',
    registryRef: compiled.registryRef,
    registryRevision: compiled.registryRevision,
    furnishingCount: compiled.furnishings.length,
    semanticAuthority: compiled.semanticAuthority,
    semanticRelationAuthority: compiled.semanticRelationAuthority,
    currentStateAuthority: compiled.currentStateAuthority,
    effectAuthority: compiled.effectAuthority
  }, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();

// [VXG RealForever]