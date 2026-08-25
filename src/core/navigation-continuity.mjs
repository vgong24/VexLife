import { semanticHash } from './utils.mjs';

const REGISTRY_SCHEMA = 'vexlife.navigation-continuity-registry/v1';
const TOPOLOGY_SCHEMA = 'vexlife.navigation-topology/v1';
const COMPILED_TOPOLOGY_SCHEMA = 'vexlife.navigation-compiled-topology/v1';
const ROUTE_PLAN_SCHEMA = 'vexlife.navigation-route-plan/v1';
const PREFERENCE_STATE_SCHEMA = 'vexlife.navigation-preference-state/v1';
const FRAME_SCHEMA = 'vexlife.navigation-current-frame/v1';
const BUNDLE_SCHEMA = 'vexlife.navigation-transition-bundle/v1';
const COMMAND_RESULT_SCHEMA = 'vexlife.navigation-command-result/v1';
const CURRENT_PROJECTION_SCHEMA = 'vexlife.navigation-current-frame-projection/v1';
const TRACE_PROJECTION_SCHEMA = 'vexlife.navigation-recent-trace-projection/v1';
const REF = /^[A-Za-z0-9][A-Za-z0-9._:/#-]*$/u;

export class NavigationContinuityError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'NavigationContinuityError';
    this.code = code;
    this.details = structuredClone(details);
  }
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new NavigationContinuityError('INVALID_OBJECT', { label });
  }
  return value;
}

function stableRef(value, label) {
  if (typeof value !== 'string' || !REF.test(value)) {
    throw new NavigationContinuityError('INVALID_REF', { label, value });
  }
  return value;
}

function optionalRef(value, label) {
  return value === null ? null : stableRef(value, label);
}

function uniqueRefs(values, label, { allowEmpty = true } = {}) {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    throw new NavigationContinuityError('INVALID_REF_ARRAY', { label });
  }
  const refs = values.map((value, index) => stableRef(value, `${label}[${index}]`));
  if (new Set(refs).size !== refs.length) {
    throw new NavigationContinuityError('DUPLICATE_REF', { label });
  }
  return refs;
}

function exactKeys(value, expected, label) {
  object(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  const missing = wanted.filter((key) => !actual.includes(key));
  const extra = actual.filter((key) => !wanted.includes(key));
  if (missing.length || extra.length) {
    throw new NavigationContinuityError('INVALID_SHAPE', { label, missing, extra });
  }
}

function sameRefs(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function setDelta(before, after) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    disappeared: before.filter((ref) => !afterSet.has(ref)).sort(),
    appeared: after.filter((ref) => !beforeSet.has(ref)).sort(),
    retained: before.filter((ref) => afterSet.has(ref)).sort()
  };
}

function contentRef(prefix, value, length = 32) {
  return `${prefix}${semanticHash(value).slice(0, length)}`;
}

function descriptorMap(registry) {
  const map = new Map();
  for (const collection of registry.descriptorCollections) {
    for (const descriptor of registry[collection.field]) {
      map.set(descriptor[collection.identityField], deepFreeze(clone(descriptor)));
    }
  }
  return map;
}

function descriptor(registryState, ref, label) {
  const value = registryState.descriptors.get(stableRef(ref, label));
  if (!value) throw new NavigationContinuityError('MISSING_DESCRIPTOR', { label, ref });
  return value;
}

function outcomeRef(registryState, outcomeKind) {
  const match = registryState.registry.outcomeDescriptors.find((item) => item.outcomeKind === outcomeKind);
  if (!match) throw new NavigationContinuityError('MISSING_OUTCOME_DESCRIPTOR', { outcomeKind });
  return match.outcomeRef;
}

function requireFalseEffects(effects) {
  object(effects, 'registry.effects');
  for (const [key, value] of Object.entries(effects)) {
    if (value !== false) throw new NavigationContinuityError('EFFECT_BOUNDARY_VIOLATION', { key });
  }
}

export function validateNavigationContinuityRegistry(registry) {
  const errors = [];
  try {
    object(registry, 'registry');
    if (registry.schemaVersion !== REGISTRY_SCHEMA) {
      throw new NavigationContinuityError('REGISTRY_SCHEMA_UNSUPPORTED', { schemaVersion: registry.schemaVersion });
    }
    stableRef(registry.registryRef, 'registry.registryRef');
    stableRef(registry.canonicalSourceRef, 'registry.canonicalSourceRef');
    if (registry.canonicalSource?.sourceRef !== registry.canonicalSourceRef ||
        registry.canonicalSource?.path !== 'blueprint/navigation-continuity-registry.json' ||
        registry.canonicalSource?.sourceClass !== 'SOURCE_MANAGED_BLUEPRINT') {
      throw new NavigationContinuityError('REGISTRY_CANONICAL_SOURCE_INVALID');
    }
    if (!Number.isInteger(registry.registryVersion) || registry.registryVersion < 1) {
      throw new NavigationContinuityError('REGISTRY_VERSION_INVALID');
    }
    if (registry.identityRule?.canonicalRefOwnsMeaning !== true ||
        registry.identityRule?.displayNameOwnsMeaning !== false ||
        registry.identityRule?.propertyNameOwnsMeaning !== false ||
        registry.identityRule?.platformEnumOwnsMeaning !== false ||
        registry.identityRule?.descriptorExpansionIsDataDriven !== true) {
      throw new NavigationContinuityError('REGISTRY_IDENTITY_RULE_INVALID');
    }
    for (const [field, expected] of Object.entries({
      visibleStateChangeRequiresRegisteredVisibleDoor: true,
      semanticTeleportationAllowed: false,
      lookupMutatesPresence: false,
      routePlanMutatesPresence: false,
      crossRealmNonHierarchyRequiresVisiblePortal: true,
      failedStepAdvancesPresence: false,
      semanticStepsMayCollapseForPacing: false,
      traceBodiesEmbedded: false
    })) {
      if (registry.rules?.[field] !== expected) {
        throw new NavigationContinuityError('REGISTRY_RULE_INVALID', { field });
      }
    }
    if (!Array.isArray(registry.descriptorCollections) || registry.descriptorCollections.length === 0) {
      throw new NavigationContinuityError('REGISTRY_DESCRIPTOR_COLLECTIONS_EMPTY');
    }
    const collectionRefs = new Set();
    const allDescriptorRefs = new Set();
    for (const [collectionIndex, collection] of registry.descriptorCollections.entries()) {
      exactKeys(collection, ['collectionRef', 'field', 'identityField', 'descriptorClass'],
        `descriptorCollections[${collectionIndex}]`);
      stableRef(collection.collectionRef, `descriptorCollections[${collectionIndex}].collectionRef`);
      if (collectionRefs.has(collection.collectionRef)) {
        throw new NavigationContinuityError('DUPLICATE_COLLECTION_REF', { ref: collection.collectionRef });
      }
      collectionRefs.add(collection.collectionRef);
      if (!Array.isArray(registry[collection.field]) || registry[collection.field].length === 0) {
        throw new NavigationContinuityError('REGISTRY_DESCRIPTOR_COLLECTION_EMPTY', { field: collection.field });
      }
      for (const [descriptorIndex, item] of registry[collection.field].entries()) {
        object(item, `${collection.field}[${descriptorIndex}]`);
        const ref = stableRef(item[collection.identityField],
          `${collection.field}[${descriptorIndex}].${collection.identityField}`);
        if (allDescriptorRefs.has(ref)) {
          throw new NavigationContinuityError('DUPLICATE_DESCRIPTOR_REF', { ref });
        }
        allDescriptorRefs.add(ref);
      }
    }
    const state = { registry, descriptors: descriptorMap(registry) };
    for (const pacing of registry.pacingDescriptors) {
      descriptor(state, pacing.settlementPolicyRef, `${pacing.pacingRef}.settlementPolicyRef`);
      descriptor(state, pacing.animationPolicyRef, `${pacing.pacingRef}.animationPolicyRef`);
      descriptor(state, pacing.dwellPolicyRef, `${pacing.pacingRef}.dwellPolicyRef`);
      descriptor(state, pacing.advancePolicyRef, `${pacing.pacingRef}.advancePolicyRef`);
      descriptor(state, pacing.traceVisibilityRef, `${pacing.pacingRef}.traceVisibilityRef`);
      if (pacing.humanSelectable !== true) {
        throw new NavigationContinuityError('PACING_DESCRIPTOR_NOT_HUMAN_SELECTABLE', { ref: pacing.pacingRef });
      }
    }
    for (const policy of registry.motionPolicies) {
      if (policy.semanticStepsMayCollapse !== false) {
        throw new NavigationContinuityError('MOTION_POLICY_COLLAPSES_SEMANTICS', { ref: policy.motionPolicyRef });
      }
      if (policy.animationOverrideRefOrNull !== null) {
        descriptor(state, policy.animationOverrideRefOrNull, `${policy.motionPolicyRef}.animationOverrideRefOrNull`);
      }
    }
    for (const policy of registry.animationPolicies) {
      if (policy.semanticStepRemovalAllowed !== false) {
        throw new NavigationContinuityError('ANIMATION_POLICY_COLLAPSES_SEMANTICS', { ref: policy.animationPolicyRef });
      }
    }
    for (const trace of registry.traceVisibilityDescriptors) {
      if (trace.recordTrace !== true) {
        throw new NavigationContinuityError('TRACE_RECORDING_CANNOT_BE_DISABLED', { ref: trace.traceVisibilityRef });
      }
    }
    const outcomeKinds = new Set();
    for (const item of registry.outcomeDescriptors) {
      stableRef(item.outcomeKind, `${item.outcomeRef}.outcomeKind`);
      if (outcomeKinds.has(item.outcomeKind)) {
        throw new NavigationContinuityError('DUPLICATE_OUTCOME_KIND', { outcomeKind: item.outcomeKind });
      }
      outcomeKinds.add(item.outcomeKind);
    }
    for (const [field, ref] of Object.entries(registry.defaultPreferenceRefs ?? {})) {
      descriptor(state, ref, `defaultPreferenceRefs.${field}`);
    }
    if (!Number.isInteger(registry.limits?.maximumRecentTraceEntries) ||
        !Number.isInteger(registry.limits?.defaultRecentTraceEntries) ||
        !Number.isInteger(registry.limits?.maximumRouteSteps) ||
        registry.limits.defaultRecentTraceEntries < 1 ||
        registry.limits.maximumRecentTraceEntries < registry.limits.defaultRecentTraceEntries ||
        registry.limits.maximumRouteSteps < 1) {
      throw new NavigationContinuityError('REGISTRY_LIMITS_INVALID');
    }
    for (const ref of Object.values(registry.contracts ?? {})) stableRef(ref, 'registry.contracts');
    requireFalseEffects(registry.effects);
  } catch (error) {
    errors.push(error.code ? { code: error.code, details: error.details } : { code: 'UNKNOWN', detail: error.message });
  }
  return deepFreeze({
    ok: errors.length === 0,
    errors,
    registryRef: registry?.registryRef ?? null,
    semanticFingerprint: errors.length === 0 ? semanticHash(registry) : null
  });
}

function requireValidRegistry(registry) {
  const validation = validateNavigationContinuityRegistry(registry);
  if (!validation.ok) {
    throw new NavigationContinuityError('REGISTRY_INVALID', { errors: validation.errors });
  }
  return {
    registry: deepFreeze(clone(registry)),
    registryFingerprint: validation.semanticFingerprint,
    descriptors: descriptorMap(registry)
  };
}

function maybeRequireIdentity(identityRegistry, ref, label) {
  if (!identityRegistry) return;
  const found = typeof identityRegistry.get === 'function'
    ? identityRegistry.get(ref)
    : identityRegistry[ref] ?? null;
  if (!found) throw new NavigationContinuityError('IDENTITY_REGISTRY_REF_MISSING', { label, ref });
}

function normalizePageState(pageState, index) {
  exactKeys(pageState, [
    'pageStateRef', 'screenRef', 'routeRef', 'realmRef', 'parentPageStateRefOrNull',
    'resourceRefs', 'availableElementRefs', 'entryFocusElementRefOrNull'
  ], `pageStates[${index}]`);
  return deepFreeze({
    pageStateRef: stableRef(pageState.pageStateRef, `pageStates[${index}].pageStateRef`),
    screenRef: stableRef(pageState.screenRef, `pageStates[${index}].screenRef`),
    routeRef: stableRef(pageState.routeRef, `pageStates[${index}].routeRef`),
    realmRef: stableRef(pageState.realmRef, `pageStates[${index}].realmRef`),
    parentPageStateRefOrNull: optionalRef(pageState.parentPageStateRefOrNull,
      `pageStates[${index}].parentPageStateRefOrNull`),
    resourceRefs: uniqueRefs(pageState.resourceRefs, `pageStates[${index}].resourceRefs`, { allowEmpty: false }),
    availableElementRefs: uniqueRefs(pageState.availableElementRefs,
      `pageStates[${index}].availableElementRefs`),
    entryFocusElementRefOrNull: optionalRef(pageState.entryFocusElementRefOrNull,
      `pageStates[${index}].entryFocusElementRefOrNull`)
  });
}

function normalizeTransition(transition, index) {
  exactKeys(transition, [
    'transitionRef', 'fromPageStateRef', 'viaElementRef', 'interactionRef', 'actionRef',
    'toPageStateRef', 'transitionClassRef', 'userFacing', 'portalRefOrNull',
    'focusTargetElementRefOrNull'
  ], `transitions[${index}]`);
  if (transition.userFacing !== true) {
    throw new NavigationContinuityError('TRANSITION_NOT_USER_FACING', { transitionRef: transition.transitionRef });
  }
  return deepFreeze({
    transitionRef: stableRef(transition.transitionRef, `transitions[${index}].transitionRef`),
    fromPageStateRef: stableRef(transition.fromPageStateRef, `transitions[${index}].fromPageStateRef`),
    viaElementRef: stableRef(transition.viaElementRef, `transitions[${index}].viaElementRef`),
    interactionRef: stableRef(transition.interactionRef, `transitions[${index}].interactionRef`),
    actionRef: stableRef(transition.actionRef, `transitions[${index}].actionRef`),
    toPageStateRef: stableRef(transition.toPageStateRef, `transitions[${index}].toPageStateRef`),
    transitionClassRef: stableRef(transition.transitionClassRef,
      `transitions[${index}].transitionClassRef`),
    userFacing: true,
    portalRefOrNull: optionalRef(transition.portalRefOrNull, `transitions[${index}].portalRefOrNull`),
    focusTargetElementRefOrNull: optionalRef(transition.focusTargetElementRefOrNull,
      `transitions[${index}].focusTargetElementRefOrNull`)
  });
}

function assertParentAcyclic(pageStateByRef) {
  for (const pageState of Object.values(pageStateByRef)) {
    const seen = new Set();
    let cursor = pageState;
    while (cursor?.parentPageStateRefOrNull) {
      if (seen.has(cursor.pageStateRef)) {
        throw new NavigationContinuityError('PAGE_STATE_PARENT_CYCLE', { pageStateRef: pageState.pageStateRef });
      }
      seen.add(cursor.pageStateRef);
      cursor = pageStateByRef[cursor.parentPageStateRefOrNull];
    }
  }
}

export function compileNavigationTopology({ registry, identityRegistry = null, topology }) {
  const registryState = requireValidRegistry(registry);
  object(topology, 'topology');
  if (topology.schemaVersion !== TOPOLOGY_SCHEMA || topology.registryRef !== registry.registryRef) {
    throw new NavigationContinuityError('TOPOLOGY_IDENTITY_INVALID', {
      schemaVersion: topology.schemaVersion,
      registryRef: topology.registryRef
    });
  }
  stableRef(topology.topologyRef, 'topology.topologyRef');
  stableRef(topology.initialPageStateRef, 'topology.initialPageStateRef');
  if (!Array.isArray(topology.pageStates) || topology.pageStates.length === 0 ||
      !Array.isArray(topology.transitions)) {
    throw new NavigationContinuityError('TOPOLOGY_COLLECTION_INVALID');
  }

  const pageStates = topology.pageStates.map(normalizePageState);
  const transitions = topology.transitions.map(normalizeTransition);
  const pageStateByRef = {};
  const transitionByRef = {};
  const transitionsFrom = {};
  const resourceToPageStateRef = {};

  for (const pageState of pageStates) {
    if (pageStateByRef[pageState.pageStateRef]) {
      throw new NavigationContinuityError('DUPLICATE_PAGE_STATE_REF', { ref: pageState.pageStateRef });
    }
    pageStateByRef[pageState.pageStateRef] = pageState;
    maybeRequireIdentity(identityRegistry, pageState.screenRef, `${pageState.pageStateRef}.screenRef`);
    maybeRequireIdentity(identityRegistry, pageState.routeRef, `${pageState.pageStateRef}.routeRef`);
    for (const elementRef of pageState.availableElementRefs) {
      maybeRequireIdentity(identityRegistry, elementRef, `${pageState.pageStateRef}.availableElementRefs`);
    }
    for (const resourceRef of pageState.resourceRefs) {
      if (resourceToPageStateRef[resourceRef]) {
        throw new NavigationContinuityError('RESOURCE_DESTINATION_AMBIGUOUS', { resourceRef });
      }
      resourceToPageStateRef[resourceRef] = pageState.pageStateRef;
    }
  }
  if (!pageStateByRef[topology.initialPageStateRef]) {
    throw new NavigationContinuityError('INITIAL_PAGE_STATE_MISSING', { ref: topology.initialPageStateRef });
  }
  for (const pageState of pageStates) {
    if (pageState.parentPageStateRefOrNull && !pageStateByRef[pageState.parentPageStateRefOrNull]) {
      throw new NavigationContinuityError('PAGE_STATE_PARENT_MISSING', {
        pageStateRef: pageState.pageStateRef,
        parentPageStateRef: pageState.parentPageStateRefOrNull
      });
    }
    if (pageState.entryFocusElementRefOrNull &&
        !pageState.availableElementRefs.includes(pageState.entryFocusElementRefOrNull)) {
      throw new NavigationContinuityError('ENTRY_FOCUS_NOT_AVAILABLE', { pageStateRef: pageState.pageStateRef });
    }
  }
  assertParentAcyclic(pageStateByRef);

  for (const transition of transitions) {
    if (transitionByRef[transition.transitionRef]) {
      throw new NavigationContinuityError('DUPLICATE_TRANSITION_REF', { ref: transition.transitionRef });
    }
    const from = pageStateByRef[transition.fromPageStateRef];
    const to = pageStateByRef[transition.toPageStateRef];
    if (!from || !to) {
      throw new NavigationContinuityError('TRANSITION_PAGE_STATE_MISSING', {
        transitionRef: transition.transitionRef
      });
    }
    if (!from.availableElementRefs.includes(transition.viaElementRef)) {
      throw new NavigationContinuityError('TRANSITION_VISIBLE_ELEMENT_NOT_AVAILABLE', {
        transitionRef: transition.transitionRef,
        viaElementRef: transition.viaElementRef
      });
    }
    if (transition.focusTargetElementRefOrNull &&
        !to.availableElementRefs.includes(transition.focusTargetElementRefOrNull)) {
      throw new NavigationContinuityError('TRANSITION_FOCUS_TARGET_NOT_AVAILABLE', {
        transitionRef: transition.transitionRef
      });
    }
    const transitionClass = descriptor(registryState, transition.transitionClassRef,
      `${transition.transitionRef}.transitionClassRef`);
    const hierarchyAdjacent = from.parentPageStateRefOrNull === to.pageStateRef ||
      to.parentPageStateRefOrNull === from.pageStateRef;
    const crossRealm = from.realmRef !== to.realmRef;
    if (crossRealm && !hierarchyAdjacent && transitionClass.crossRealmNonHierarchyAllowed !== true) {
      throw new NavigationContinuityError('CROSS_REALM_TRANSITION_REQUIRES_VISIBLE_PORTAL', {
        transitionRef: transition.transitionRef
      });
    }
    if (transitionClass.visiblePortalRequired === true && !transition.portalRefOrNull) {
      throw new NavigationContinuityError('VISIBLE_PORTAL_IDENTITY_REQUIRED', {
        transitionRef: transition.transitionRef
      });
    }
    if (transition.portalRefOrNull && transitionClass.visiblePortalRequired !== true) {
      throw new NavigationContinuityError('PORTAL_CLASS_REQUIRED', {
        transitionRef: transition.transitionRef
      });
    }
    maybeRequireIdentity(identityRegistry, transition.viaElementRef, `${transition.transitionRef}.viaElementRef`);
    maybeRequireIdentity(identityRegistry, transition.interactionRef, `${transition.transitionRef}.interactionRef`);
    maybeRequireIdentity(identityRegistry, transition.actionRef, `${transition.transitionRef}.actionRef`);
    transitionByRef[transition.transitionRef] = transition;
    transitionsFrom[transition.fromPageStateRef] ??= [];
    transitionsFrom[transition.fromPageStateRef].push(transition.transitionRef);
  }
  for (const refs of Object.values(transitionsFrom)) refs.sort();

  const semanticCore = {
    schemaVersion: COMPILED_TOPOLOGY_SCHEMA,
    topologyRef: topology.topologyRef,
    registryRef: registry.registryRef,
    registryFingerprint: registryState.registryFingerprint,
    initialPageStateRef: topology.initialPageStateRef,
    pageStates: pageStates.map(clone).sort((a, b) => a.pageStateRef.localeCompare(b.pageStateRef)),
    transitions: transitions.map(clone).sort((a, b) => a.transitionRef.localeCompare(b.transitionRef))
  };
  const topologyFingerprint = semanticHash(semanticCore);
  const projectionRef = `projection.navigation-continuity.${topologyFingerprint.slice(0, 32)}`;
  return deepFreeze({
    ...semanticCore,
    topologyFingerprint,
    projectionRef,
    pageStateByRef,
    transitionByRef,
    transitionsFrom,
    resourceToPageStateRef
  });
}

export function resolveNavigationResource({ compiledTopology, resourceRef }) {
  stableRef(resourceRef, 'resourceRef');
  const pageStateRef = compiledTopology.resourceToPageStateRef[resourceRef] ?? null;
  return deepFreeze({
    schemaVersion: 'vexlife.navigation-resource-resolution/v1',
    topologyRef: compiledTopology.topologyRef,
    topologyFingerprint: compiledTopology.topologyFingerprint,
    resourceRef,
    pageStateRefOrNull: pageStateRef,
    presenceMutated: false,
    semanticFingerprint: semanticHash({
      topologyFingerprint: compiledTopology.topologyFingerprint,
      resourceRef,
      pageStateRefOrNull: pageStateRef
    })
  });
}

export function planNavigationRoute({ compiledTopology, fromPageStateRef, destinationResourceRef }) {
  stableRef(fromPageStateRef, 'fromPageStateRef');
  const from = compiledTopology.pageStateByRef[fromPageStateRef];
  if (!from) throw new NavigationContinuityError('PLAN_ORIGIN_MISSING', { fromPageStateRef });
  const resolution = resolveNavigationResource({ compiledTopology, resourceRef: destinationResourceRef });
  if (!resolution.pageStateRefOrNull) {
    throw new NavigationContinuityError('PLAN_DESTINATION_RESOURCE_MISSING', {
      destinationResourceRef
    });
  }
  const destinationPageStateRef = resolution.pageStateRefOrNull;
  const predecessor = new Map([[fromPageStateRef, null]]);
  const queue = [fromPageStateRef];
  let cursor = 0;
  while (cursor < queue.length && !predecessor.has(destinationPageStateRef)) {
    const pageStateRef = queue[cursor++];
    const outgoing = compiledTopology.transitionsFrom[pageStateRef] ?? [];
    for (const transitionRef of outgoing) {
      const transition = compiledTopology.transitionByRef[transitionRef];
      if (predecessor.has(transition.toPageStateRef)) continue;
      predecessor.set(transition.toPageStateRef, { priorPageStateRef: pageStateRef, transitionRef });
      queue.push(transition.toPageStateRef);
      if (queue.length > compiledTopology.pageStates.length + compiledTopology.transitions.length) {
        throw new NavigationContinuityError('PLAN_SEARCH_BOUND_EXCEEDED');
      }
    }
  }
  if (!predecessor.has(destinationPageStateRef)) {
    throw new NavigationContinuityError('NO_REGISTERED_VISIBLE_ROUTE', {
      fromPageStateRef,
      destinationPageStateRef,
      destinationResourceRef
    });
  }
  const stepRefs = [];
  let stepCursor = destinationPageStateRef;
  while (stepCursor !== fromPageStateRef) {
    const edge = predecessor.get(stepCursor);
    stepRefs.unshift(edge.transitionRef);
    stepCursor = edge.priorPageStateRef;
  }
  const steps = stepRefs.map((ref) => clone(compiledTopology.transitionByRef[ref]));
  const core = {
    schemaVersion: ROUTE_PLAN_SCHEMA,
    topologyRef: compiledTopology.topologyRef,
    topologyFingerprint: compiledTopology.topologyFingerprint,
    registryFingerprint: compiledTopology.registryFingerprint,
    fromPageStateRef,
    destinationResourceRef,
    destinationPageStateRef,
    steps,
    presenceMutated: false
  };
  const semanticFingerprint = semanticHash(core);
  return deepFreeze({
    ...core,
    routePlanRef: `route-plan.navigation.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

export function validateNavigationPlanCurrent({ plan, compiledTopology }) {
  const current = plan?.schemaVersion === ROUTE_PLAN_SCHEMA &&
    plan.topologyRef === compiledTopology.topologyRef &&
    plan.topologyFingerprint === compiledTopology.topologyFingerprint &&
    plan.registryFingerprint === compiledTopology.registryFingerprint;
  return deepFreeze({
    state: current ? 'CURRENT' : 'STALE',
    planRef: plan?.routePlanRef ?? null,
    currentTopologyFingerprint: compiledTopology.topologyFingerprint,
    plannedTopologyFingerprint: plan?.topologyFingerprint ?? null
  });
}

function normalizePreferenceRefs(registryState, refs) {
  exactKeys(refs, ['pacingRef', 'motionPolicyRef', 'traceVisibilityRef'], 'preferenceRefs');
  const pacing = descriptor(registryState, refs.pacingRef, 'preferenceRefs.pacingRef');
  const motion = descriptor(registryState, refs.motionPolicyRef, 'preferenceRefs.motionPolicyRef');
  const trace = descriptor(registryState, refs.traceVisibilityRef, 'preferenceRefs.traceVisibilityRef');
  if (!Object.hasOwn(pacing, 'pacingRef') || !Object.hasOwn(motion, 'motionPolicyRef') ||
      !Object.hasOwn(trace, 'traceVisibilityRef')) {
    throw new NavigationContinuityError('PREFERENCE_DESCRIPTOR_CLASS_MISMATCH');
  }
  return deepFreeze({
    schemaVersion: PREFERENCE_STATE_SCHEMA,
    pacingRef: refs.pacingRef,
    motionPolicyRef: refs.motionPolicyRef,
    traceVisibilityRef: refs.traceVisibilityRef,
    semanticFingerprint: semanticHash(refs)
  });
}

export function createNavigationPreferenceStore({ registry, initialPreferenceRefs = null }) {
  const registryState = requireValidRegistry(registry);
  let state = normalizePreferenceRefs(
    registryState,
    initialPreferenceRefs ?? registry.defaultPreferenceRefs
  );
  let revision = 0;
  const subscribers = new Set();
  return deepFreeze({
    registryRef: registry.registryRef,
    snapshot() {
      return deepFreeze({ ...clone(state), revision });
    },
    update(nextPreferenceRefs) {
      const next = normalizePreferenceRefs(registryState, nextPreferenceRefs);
      if (next.semanticFingerprint === state.semanticFingerprint) {
        return deepFreeze({ changed: false, revision, state: clone(state) });
      }
      const previous = state;
      state = next;
      revision += 1;
      const emission = deepFreeze({
        changed: true,
        revision,
        previous: clone(previous),
        state: clone(state)
      });
      for (const subscriber of subscribers) subscriber(emission);
      return emission;
    },
    subscribe(subscriber, { emitCurrent = true } = {}) {
      if (typeof subscriber !== 'function') {
        throw new NavigationContinuityError('PREFERENCE_SUBSCRIBER_INVALID');
      }
      subscribers.add(subscriber);
      if (emitCurrent) subscriber(deepFreeze({ changed: false, revision, state: clone(state), current: true }));
      return () => subscribers.delete(subscriber);
    }
  });
}

export function resolveNavigationPresentationPolicy({ registry, preferenceSnapshot }) {
  const registryState = requireValidRegistry(registry);
  const pacing = descriptor(registryState, preferenceSnapshot.pacingRef, 'preferenceSnapshot.pacingRef');
  const motion = descriptor(registryState, preferenceSnapshot.motionPolicyRef,
    'preferenceSnapshot.motionPolicyRef');
  const trace = descriptor(registryState, preferenceSnapshot.traceVisibilityRef,
    'preferenceSnapshot.traceVisibilityRef');
  const settlement = descriptor(registryState, pacing.settlementPolicyRef,
    `${pacing.pacingRef}.settlementPolicyRef`);
  const animationRef = motion.animationOverrideRefOrNull ?? pacing.animationPolicyRef;
  const animation = descriptor(registryState, animationRef, 'effectiveAnimationPolicyRef');
  const dwell = descriptor(registryState, pacing.dwellPolicyRef, `${pacing.pacingRef}.dwellPolicyRef`);
  const advance = descriptor(registryState, pacing.advancePolicyRef, `${pacing.pacingRef}.advancePolicyRef`);
  const core = {
    pacingRef: pacing.pacingRef,
    motionPolicyRef: motion.motionPolicyRef,
    traceVisibilityRef: trace.traceVisibilityRef,
    settlementPolicyRef: settlement.settlementPolicyRef,
    animationPolicyRef: animation.animationPolicyRef,
    dwellPolicyRef: dwell.dwellPolicyRef,
    advancePolicyRef: advance.advancePolicyRef,
    pacing: clone(pacing),
    motion: clone(motion),
    traceVisibility: clone(trace),
    settlement: clone(settlement),
    animation: clone(animation),
    dwell: clone(dwell),
    advance: clone(advance),
    semanticStepsMayCollapse: false
  };
  return deepFreeze({ ...core, semanticFingerprint: semanticHash(core) });
}

function availableTransitionRefs(compiledTopology, pageStateRef, availableElementRefs) {
  const available = new Set(availableElementRefs);
  return (compiledTopology.transitionsFrom[pageStateRef] ?? [])
    .filter((transitionRef) => available.has(compiledTopology.transitionByRef[transitionRef].viaElementRef))
    .sort();
}

function elementSetRef(pageStateRef, availableElementRefs) {
  return contentRef('element-set.navigation.', {
    pageStateRef,
    availableElementRefs: [...availableElementRefs].sort()
  });
}

function createFrame({
  compiledTopology,
  navigationSessionRef,
  pageStateRef,
  focusElementRefOrNull,
  availableElementRefs,
  goalRefOrNull,
  preferenceSnapshotFingerprint,
  sequence
}) {
  const pageState = compiledTopology.pageStateByRef[pageStateRef];
  if (!pageState) throw new NavigationContinuityError('FRAME_PAGE_STATE_MISSING', { pageStateRef });
  const normalizedElements = uniqueRefs(availableElementRefs, 'frame.availableElementRefs');
  if (!sameRefs(normalizedElements, pageState.availableElementRefs)) {
    throw new NavigationContinuityError('FRAME_AVAILABLE_ELEMENTS_DO_NOT_MATCH_TOPOLOGY', { pageStateRef });
  }
  if (focusElementRefOrNull !== null && !normalizedElements.includes(focusElementRefOrNull)) {
    throw new NavigationContinuityError('FRAME_FOCUS_NOT_AVAILABLE', { focusElementRefOrNull });
  }
  const core = {
    schemaVersion: FRAME_SCHEMA,
    navigationSessionRef,
    sequence,
    pageStateRef,
    screenRef: pageState.screenRef,
    routeRef: pageState.routeRef,
    realmRef: pageState.realmRef,
    focusElementRefOrNull,
    availableElementRefs: [...normalizedElements].sort(),
    availableElementSetRef: elementSetRef(pageStateRef, normalizedElements),
    availableTransitionRefs: availableTransitionRefs(compiledTopology, pageStateRef, normalizedElements),
    goalRefOrNull,
    registryFingerprint: compiledTopology.registryFingerprint,
    topologyFingerprint: compiledTopology.topologyFingerprint,
    preferenceSnapshotFingerprint,
    currentness: 'CURRENT'
  };
  const semanticFingerprint = semanticHash(core);
  return deepFreeze({
    ...core,
    frameRef: `frame.navigation.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

function compactFrame(frame) {
  return deepFreeze(clone(frame));
}

function verifyFrame(frame) {
  const cloneValue = clone(frame);
  const suppliedFingerprint = cloneValue.semanticFingerprint;
  const suppliedRef = cloneValue.frameRef;
  delete cloneValue.semanticFingerprint;
  delete cloneValue.frameRef;
  const fingerprint = semanticHash(cloneValue);
  if (suppliedFingerprint !== fingerprint || suppliedRef !== `frame.navigation.${fingerprint.slice(0, 32)}`) {
    throw new NavigationContinuityError('FRAME_FINGERPRINT_INVALID', { suppliedRef });
  }
  return frame;
}

export function commitNavigationTransitionBundle(input) {
  object(input, 'transitionBundleInput');
  for (const [field, value] of [
    ['navigationSessionRef', input.navigationSessionRef],
    ['commandRef', input.commandRef],
    ['goalRef', input.goalRef],
    ['registryProjectionRef', input.registryProjectionRef],
    ['registryFingerprint', input.registryFingerprint],
    ['topologyFingerprint', input.topologyFingerprint],
    ['transitionRef', input.transitionRef],
    ['elementRef', input.elementRef],
    ['interactionRef', input.interactionRef],
    ['actionRef', input.actionRef],
    ['pacingRef', input.pacingRef],
    ['motionPolicyRef', input.motionPolicyRef],
    ['traceVisibilityRef', input.traceVisibilityRef],
    ['outcomeRef', input.outcomeRef]
  ]) stableRef(value, `transitionBundleInput.${field}`);
  optionalRef(input.predecessorCommitRefOrNull, 'transitionBundleInput.predecessorCommitRefOrNull');
  optionalRef(input.journeyEventRefOrNull, 'transitionBundleInput.journeyEventRefOrNull');
  if (!Number.isInteger(input.sequence) || input.sequence < 1) {
    throw new NavigationContinuityError('TRANSITION_SEQUENCE_INVALID');
  }
  verifyFrame(input.fromFrame);
  verifyFrame(input.toFrame);
  if (input.fromFrame.navigationSessionRef !== input.navigationSessionRef ||
      input.toFrame.navigationSessionRef !== input.navigationSessionRef ||
      input.toFrame.sequence !== input.fromFrame.sequence + 1 ||
      input.sequence !== input.toFrame.sequence) {
    throw new NavigationContinuityError('TRANSITION_FRAME_SEQUENCE_INVALID');
  }
  const delta = {
    elementRefsDisappeared: uniqueRefs(input.elementRefsDisappeared, 'elementRefsDisappeared'),
    elementRefsAppeared: uniqueRefs(input.elementRefsAppeared, 'elementRefsAppeared'),
    elementRefsRetained: uniqueRefs(input.elementRefsRetained, 'elementRefsRetained')
  };
  const recomputed = setDelta(input.fromFrame.availableElementRefs, input.toFrame.availableElementRefs);
  if (!sameRefs(delta.elementRefsDisappeared, recomputed.disappeared) ||
      !sameRefs(delta.elementRefsAppeared, recomputed.appeared) ||
      !sameRefs(delta.elementRefsRetained, recomputed.retained)) {
    throw new NavigationContinuityError('TRANSITION_ELEMENT_DELTA_INVALID');
  }
  const core = {
    schemaVersion: BUNDLE_SCHEMA,
    navigationSessionRef: input.navigationSessionRef,
    commandRef: input.commandRef,
    sequence: input.sequence,
    predecessorCommitRefOrNull: input.predecessorCommitRefOrNull,
    goalRef: input.goalRef,
    registryProjectionRef: input.registryProjectionRef,
    registryFingerprint: input.registryFingerprint,
    topologyFingerprint: input.topologyFingerprint,
    from: compactFrame(input.fromFrame),
    via: {
      transitionRef: input.transitionRef,
      elementRef: input.elementRef,
      interactionRef: input.interactionRef,
      actionRef: input.actionRef
    },
    to: compactFrame(input.toFrame),
    delta,
    availableTransitionRefs: uniqueRefs(input.availableTransitionRefs, 'availableTransitionRefs'),
    journeyEventRefOrNull: input.journeyEventRefOrNull,
    continuityEventRefs: uniqueRefs(input.continuityEventRefs, 'continuityEventRefs'),
    captureRefs: uniqueRefs(input.captureRefs, 'captureRefs'),
    pacingRef: input.pacingRef,
    motionPolicyRef: input.motionPolicyRef,
    traceVisibilityRef: input.traceVisibilityRef,
    preferenceSnapshotFingerprint: stableRef(input.preferenceSnapshotFingerprint,
      'preferenceSnapshotFingerprint'),
    outcomeRef: input.outcomeRef
  };
  const semanticFingerprint = semanticHash(core);
  return deepFreeze({
    ...core,
    navigationCommitRef: `navigation-commit.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

function verifyBundle(bundle) {
  const cloneValue = clone(bundle);
  const suppliedFingerprint = cloneValue.semanticFingerprint;
  const suppliedRef = cloneValue.navigationCommitRef;
  delete cloneValue.semanticFingerprint;
  delete cloneValue.navigationCommitRef;
  const fingerprint = semanticHash(cloneValue);
  if (suppliedFingerprint !== fingerprint ||
      suppliedRef !== `navigation-commit.${fingerprint.slice(0, 32)}`) {
    throw new NavigationContinuityError('TRANSITION_BUNDLE_FINGERPRINT_INVALID', { suppliedRef });
  }
  verifyFrame(bundle.from);
  verifyFrame(bundle.to);
  return bundle;
}

function commandResult({
  registryState,
  navigationSessionRef,
  commandRef,
  resourceRef,
  goalRef,
  outcomeKind,
  routePlanRefOrNull,
  startingFrameRef,
  currentFrameRef,
  lastKnownGoodFrameRef,
  transitionCommitRefs = [],
  failureRefOrNull = null,
  duplicateOfCommandRefOrNull = null
}) {
  const core = {
    schemaVersion: COMMAND_RESULT_SCHEMA,
    navigationSessionRef,
    commandRef,
    resourceRef,
    goalRef,
    outcomeRef: outcomeRef(registryState, outcomeKind),
    routePlanRefOrNull,
    startingFrameRef,
    currentFrameRef,
    lastKnownGoodFrameRef,
    transitionCommitRefs: [...transitionCommitRefs],
    failureRefOrNull,
    duplicateOfCommandRefOrNull,
    effects: clone(registryState.registry.effects)
  };
  const semanticFingerprint = semanticHash(core);
  return deepFreeze({
    ...core,
    commandResultRef: `result.navigation-command.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

function validateAdapterResult(result, expectedPageState, transition, presentationPolicy) {
  object(result, 'adapterResult');
  stableRef(result.adapterResultRef, 'adapterResult.adapterResultRef');
  optionalRef(result.failureRefOrNull, 'adapterResult.failureRefOrNull');
  stableRef(result.observedPageStateRef, 'adapterResult.observedPageStateRef');
  optionalRef(result.observedFocusElementRefOrNull, 'adapterResult.observedFocusElementRefOrNull');
  const observedElements = uniqueRefs(result.observedAvailableElementRefs,
    'adapterResult.observedAvailableElementRefs');
  uniqueRefs(result.captureRefs ?? [], 'adapterResult.captureRefs');
  uniqueRefs(result.continuityEventRefs ?? [], 'adapterResult.continuityEventRefs');
  if (result.failureRefOrNull) return { ok: false, failureRef: result.failureRefOrNull };
  if (presentationPolicy.settlement.adapterSemanticSettlementRequired === true &&
      result.semanticSettled !== true) {
    return { ok: false, failureRef: 'failure.navigation.semantic-settlement-not-observed' };
  }
  if (result.observedPageStateRef !== expectedPageState.pageStateRef ||
      !sameRefs(observedElements, expectedPageState.availableElementRefs)) {
    return { ok: false, failureRef: 'failure.navigation.observed-destination-mismatch' };
  }
  if (transition.focusTargetElementRefOrNull !== null &&
      result.observedFocusElementRefOrNull !== transition.focusTargetElementRefOrNull) {
    return { ok: false, failureRef: 'failure.navigation.observed-focus-mismatch' };
  }
  return { ok: true, observedElements };
}

function traceEntry(bundle) {
  return deepFreeze({
    navigationCommitRef: bundle.navigationCommitRef,
    commandRef: bundle.commandRef,
    sequence: bundle.sequence,
    goalRef: bundle.goalRef,
    fromPageStateRef: bundle.from.pageStateRef,
    transitionRef: bundle.via.transitionRef,
    elementRef: bundle.via.elementRef,
    actionRef: bundle.via.actionRef,
    toPageStateRef: bundle.to.pageStateRef,
    outcomeRef: bundle.outcomeRef,
    pacingRef: bundle.pacingRef,
    motionPolicyRef: bundle.motionPolicyRef,
    captureRefs: [...bundle.captureRefs]
  });
}

export function replayNavigationTransitionBundles({
  registry,
  compiledTopology,
  navigationSessionRef,
  initialFrame,
  bundles
}) {
  const registryState = requireValidRegistry(registry);
  stableRef(navigationSessionRef, 'navigationSessionRef');
  verifyFrame(initialFrame);
  if (initialFrame.navigationSessionRef !== navigationSessionRef) {
    throw new NavigationContinuityError('REPLAY_SESSION_MISMATCH');
  }
  if (!Array.isArray(bundles)) throw new NavigationContinuityError('REPLAY_BUNDLES_INVALID');
  let frame = initialFrame;
  let priorCommitRef = null;
  const acceptedBundles = [];
  for (const [index, rawBundle] of bundles.entries()) {
    const bundle = verifyBundle(rawBundle);
    if (bundle.navigationSessionRef !== navigationSessionRef ||
        bundle.predecessorCommitRefOrNull !== priorCommitRef ||
        bundle.from.frameRef !== frame.frameRef ||
        bundle.sequence !== index + 1) {
      throw new NavigationContinuityError('REPLAY_LINEARITY_INVALID', { index });
    }
    if (bundle.registryFingerprint !== registryState.registryFingerprint ||
        bundle.topologyFingerprint !== compiledTopology.topologyFingerprint) {
      return deepFreeze({
        state: 'STALE',
        reasonRef: 'reason.navigation.replay.registry-or-topology-drift',
        currentFrame: clone(frame),
        lastCommitRefOrNull: priorCommitRef,
        acceptedBundles: acceptedBundles.map(clone)
      });
    }
    const transition = compiledTopology.transitionByRef[bundle.via.transitionRef];
    if (!transition || transition.fromPageStateRef !== frame.pageStateRef ||
        transition.toPageStateRef !== bundle.to.pageStateRef ||
        transition.viaElementRef !== bundle.via.elementRef ||
        transition.actionRef !== bundle.via.actionRef ||
        transition.interactionRef !== bundle.via.interactionRef) {
      throw new NavigationContinuityError('REPLAY_TRANSITION_BINDING_INVALID', { index });
    }
    frame = bundle.to;
    priorCommitRef = bundle.navigationCommitRef;
    acceptedBundles.push(bundle);
  }
  return deepFreeze({
    state: 'CURRENT',
    currentFrame: clone(frame),
    lastCommitRefOrNull: priorCommitRef,
    acceptedBundles: acceptedBundles.map(clone),
    recentTrace: acceptedBundles.map(traceEntry)
  });
}

export function projectNavigationCurrentFrame(session) {
  const frame = session.currentFrame();
  const directions = session.availableDirections();
  const core = {
    schemaVersion: CURRENT_PROJECTION_SCHEMA,
    navigationSessionRef: session.navigationSessionRef,
    goalRefOrNull: frame.goalRefOrNull,
    current: clone(frame),
    availableDirections: directions,
    lastCommitRefOrNull: session.lastCommitRef(),
    currentness: frame.currentness,
    rawLogBodyIncluded: false,
    screenshotBodyIncluded: false
  };
  return deepFreeze({ ...core, semanticFingerprint: semanticHash(core) });
}

export function projectNavigationRecentTrace(session, { limit = null } = {}) {
  const maximum = session.registry.limits.maximumRecentTraceEntries;
  const selectedLimit = limit ?? session.registry.limits.defaultRecentTraceEntries;
  if (!Number.isInteger(selectedLimit) || selectedLimit < 1 || selectedLimit > maximum) {
    throw new NavigationContinuityError('TRACE_LIMIT_INVALID', { selectedLimit, maximum });
  }
  const entries = session.transitionBundles().slice(-selectedLimit).map(traceEntry);
  const core = {
    schemaVersion: TRACE_PROJECTION_SCHEMA,
    navigationSessionRef: session.navigationSessionRef,
    totalCommitCount: session.transitionBundles().length,
    entries,
    bounded: true,
    rawLogBodyIncluded: false,
    screenshotBodyIncluded: false
  };
  return deepFreeze({ ...core, semanticFingerprint: semanticHash(core) });
}

export function createNavigationContinuitySession({
  registry,
  compiledTopology,
  preferenceStore,
  adapter,
  navigationSessionRef,
  initialPageStateRef = compiledTopology.initialPageStateRef,
  initialGoalRefOrNull = null
}) {
  const registryState = requireValidRegistry(registry);
  stableRef(navigationSessionRef, 'navigationSessionRef');
  if (compiledTopology.registryFingerprint !== registryState.registryFingerprint) {
    throw new NavigationContinuityError('SESSION_REGISTRY_TOPOLOGY_MISMATCH');
  }
  if (!adapter || typeof adapter.performTransition !== 'function') {
    throw new NavigationContinuityError('PLATFORM_ADAPTER_INVALID');
  }
  const initialPageState = compiledTopology.pageStateByRef[initialPageStateRef];
  if (!initialPageState) throw new NavigationContinuityError('SESSION_INITIAL_PAGE_STATE_MISSING');
  const firstPreference = preferenceStore.snapshot();
  const initialFrame = createFrame({
    compiledTopology,
    navigationSessionRef,
    pageStateRef: initialPageStateRef,
    focusElementRefOrNull: initialPageState.entryFocusElementRefOrNull,
    availableElementRefs: initialPageState.availableElementRefs,
    goalRefOrNull: initialGoalRefOrNull,
    preferenceSnapshotFingerprint: firstPreference.semanticFingerprint,
    sequence: 0
  });
  let currentFrame = initialFrame;
  let lastCommitRefOrNull = null;
  let commandSequence = 0;
  let queueTail = Promise.resolve();
  const bundles = [];
  const commandLedger = new Map();

  function enqueue(operation) {
    const execution = queueTail.then(operation, operation);
    queueTail = execution.catch(() => undefined);
    return execution;
  }

  function directionProjection() {
    return (compiledTopology.transitionsFrom[currentFrame.pageStateRef] ?? [])
      .filter((transitionRef) => currentFrame.availableElementRefs
        .includes(compiledTopology.transitionByRef[transitionRef].viaElementRef))
      .map((transitionRef) => {
        const transition = compiledTopology.transitionByRef[transitionRef];
        return deepFreeze({
          transitionRef,
          viaElementRef: transition.viaElementRef,
          actionRef: transition.actionRef,
          destinationPageStateRef: transition.toPageStateRef,
          transitionClassRef: transition.transitionClassRef
        });
      });
  }

  async function executePlan(plan, {
    resourceRef,
    goalRef,
    expectedFrameRef,
    commandRef
  }) {
    const startingFrame = currentFrame;
    if (expectedFrameRef !== currentFrame.frameRef) {
      return commandResult({
        registryState,
        navigationSessionRef,
        commandRef,
        resourceRef,
        goalRef,
        outcomeKind: 'BLOCKED_STALE_FRAME',
        routePlanRefOrNull: plan?.routePlanRef ?? null,
        startingFrameRef: startingFrame.frameRef,
        currentFrameRef: currentFrame.frameRef,
        lastKnownGoodFrameRef: currentFrame.frameRef
      });
    }
    if (validateNavigationPlanCurrent({ plan, compiledTopology }).state !== 'CURRENT') {
      return commandResult({
        registryState,
        navigationSessionRef,
        commandRef,
        resourceRef,
        goalRef,
        outcomeKind: 'BLOCKED_STALE_TOPOLOGY',
        routePlanRefOrNull: plan?.routePlanRef ?? null,
        startingFrameRef: startingFrame.frameRef,
        currentFrameRef: currentFrame.frameRef,
        lastKnownGoodFrameRef: currentFrame.frameRef
      });
    }
    if (plan.fromPageStateRef !== currentFrame.pageStateRef) {
      return commandResult({
        registryState,
        navigationSessionRef,
        commandRef,
        resourceRef,
        goalRef,
        outcomeKind: 'BLOCKED_STALE_FRAME',
        routePlanRefOrNull: plan.routePlanRef,
        startingFrameRef: startingFrame.frameRef,
        currentFrameRef: currentFrame.frameRef,
        lastKnownGoodFrameRef: currentFrame.frameRef
      });
    }
    if (plan.steps.length === 0) {
      return commandResult({
        registryState,
        navigationSessionRef,
        commandRef,
        resourceRef,
        goalRef,
        outcomeKind: 'ALREADY_PRESENT',
        routePlanRefOrNull: plan.routePlanRef,
        startingFrameRef: startingFrame.frameRef,
        currentFrameRef: currentFrame.frameRef,
        lastKnownGoodFrameRef: currentFrame.frameRef
      });
    }

    const transitionCommitRefs = [];
    for (const [stepIndex, plannedTransition] of plan.steps.entries()) {
      const transition = compiledTopology.transitionByRef[plannedTransition.transitionRef];
      if (!transition || transition.fromPageStateRef !== currentFrame.pageStateRef ||
          !currentFrame.availableElementRefs.includes(transition.viaElementRef)) {
        return commandResult({
          registryState,
          navigationSessionRef,
          commandRef,
          resourceRef,
          goalRef,
          outcomeKind: 'BLOCKED_NO_VISIBLE_ROUTE',
          routePlanRefOrNull: plan.routePlanRef,
          startingFrameRef: startingFrame.frameRef,
          currentFrameRef: currentFrame.frameRef,
          lastKnownGoodFrameRef: currentFrame.frameRef,
          transitionCommitRefs
        });
      }
      const preferenceSnapshot = preferenceStore.snapshot();
      const presentationPolicy = resolveNavigationPresentationPolicy({
        registry,
        preferenceSnapshot
      });
      const expectedPageState = compiledTopology.pageStateByRef[transition.toPageStateRef];
      let adapterResult;
      try {
        adapterResult = await adapter.performTransition(deepFreeze({
          schemaVersion: 'vexlife.navigation-platform-transition-request/v1',
          navigationSessionRef,
          commandRef,
          goalRef,
          stepIndex,
          stepCount: plan.steps.length,
          fromFrame: clone(currentFrame),
          transition: clone(transition),
          expectedPageState: clone(expectedPageState),
          presentationPolicy: clone(presentationPolicy)
        }));
      } catch (error) {
        adapterResult = {
          adapterResultRef: `adapter-result.navigation.exception.${semanticHash({ commandRef, stepIndex, message: error.message }).slice(0, 24)}`,
          observedPageStateRef: currentFrame.pageStateRef,
          observedFocusElementRefOrNull: currentFrame.focusElementRefOrNull,
          observedAvailableElementRefs: currentFrame.availableElementRefs,
          semanticSettled: false,
          captureRefs: [],
          continuityEventRefs: [],
          failureRefOrNull: `failure.navigation.adapter-exception.${semanticHash(error.message).slice(0, 24)}`
        };
      }
      const observed = validateAdapterResult(adapterResult, expectedPageState, transition, presentationPolicy);
      if (!observed.ok) {
        return commandResult({
          registryState,
          navigationSessionRef,
          commandRef,
          resourceRef,
          goalRef,
          outcomeKind: 'ADAPTER_FAILURE',
          routePlanRefOrNull: plan.routePlanRef,
          startingFrameRef: startingFrame.frameRef,
          currentFrameRef: currentFrame.frameRef,
          lastKnownGoodFrameRef: currentFrame.frameRef,
          transitionCommitRefs,
          failureRefOrNull: observed.failureRef
        });
      }
      const toFrame = createFrame({
        compiledTopology,
        navigationSessionRef,
        pageStateRef: expectedPageState.pageStateRef,
        focusElementRefOrNull: adapterResult.observedFocusElementRefOrNull,
        availableElementRefs: observed.observedElements,
        goalRefOrNull: goalRef,
        preferenceSnapshotFingerprint: preferenceSnapshot.semanticFingerprint,
        sequence: currentFrame.sequence + 1
      });
      const delta = setDelta(currentFrame.availableElementRefs, toFrame.availableElementRefs);
      const journeyEventRefOrNull = contentRef('journey.navigation.', {
        navigationSessionRef,
        commandRef,
        sequence: toFrame.sequence,
        transitionRef: transition.transitionRef,
        fromFrameRef: currentFrame.frameRef,
        toFrameRef: toFrame.frameRef,
        goalRef
      });
      const bundle = commitNavigationTransitionBundle({
        navigationSessionRef,
        commandRef,
        sequence: toFrame.sequence,
        predecessorCommitRefOrNull: lastCommitRefOrNull,
        goalRef,
        registryProjectionRef: compiledTopology.projectionRef,
        registryFingerprint: compiledTopology.registryFingerprint,
        topologyFingerprint: compiledTopology.topologyFingerprint,
        fromFrame: currentFrame,
        transitionRef: transition.transitionRef,
        elementRef: transition.viaElementRef,
        interactionRef: transition.interactionRef,
        actionRef: transition.actionRef,
        toFrame,
        elementRefsDisappeared: delta.disappeared,
        elementRefsAppeared: delta.appeared,
        elementRefsRetained: delta.retained,
        availableTransitionRefs: toFrame.availableTransitionRefs,
        journeyEventRefOrNull,
        continuityEventRefs: adapterResult.continuityEventRefs ?? [],
        captureRefs: adapterResult.captureRefs ?? [],
        pacingRef: presentationPolicy.pacingRef,
        motionPolicyRef: presentationPolicy.motionPolicyRef,
        traceVisibilityRef: presentationPolicy.traceVisibilityRef,
        preferenceSnapshotFingerprint: preferenceSnapshot.semanticFingerprint,
        outcomeRef: outcomeRef(registryState, 'COMMITTED')
      });
      bundles.push(bundle);
      currentFrame = toFrame;
      lastCommitRefOrNull = bundle.navigationCommitRef;
      transitionCommitRefs.push(bundle.navigationCommitRef);

      if (typeof adapter.waitForPerceptionDwell === 'function') {
        await adapter.waitForPerceptionDwell(deepFreeze({
          navigationSessionRef,
          commandRef,
          navigationCommitRef: bundle.navigationCommitRef,
          dwellPolicy: clone(presentationPolicy.dwell)
        }));
      }
      const hasNextStep = stepIndex < plan.steps.length - 1;
      if (hasNextStep && presentationPolicy.advance.humanAdvanceRequired === true) {
        if (typeof adapter.awaitHumanAdvance !== 'function') {
          return commandResult({
            registryState,
            navigationSessionRef,
            commandRef,
            resourceRef,
            goalRef,
            outcomeKind: 'ADAPTER_FAILURE',
            routePlanRefOrNull: plan.routePlanRef,
            startingFrameRef: startingFrame.frameRef,
            currentFrameRef: currentFrame.frameRef,
            lastKnownGoodFrameRef: currentFrame.frameRef,
            transitionCommitRefs,
            failureRefOrNull: 'failure.navigation.human-advance-adapter-missing'
          });
        }
        await adapter.awaitHumanAdvance(deepFreeze({
          navigationSessionRef,
          commandRef,
          navigationCommitRef: bundle.navigationCommitRef,
          advancePolicy: clone(presentationPolicy.advance)
        }));
      }
    }
    return commandResult({
      registryState,
      navigationSessionRef,
      commandRef,
      resourceRef,
      goalRef,
      outcomeKind: 'COMMITTED',
      routePlanRefOrNull: plan.routePlanRef,
      startingFrameRef: startingFrame.frameRef,
      currentFrameRef: currentFrame.frameRef,
      lastKnownGoodFrameRef: currentFrame.frameRef,
      transitionCommitRefs
    });
  }

  async function executeCommand(resourceRef, options) {
    const goalRef = stableRef(options.goalRef, 'navigateTo.goalRef');
    const expectedFrameRef = options.expectedFrameRef === null
      ? currentFrame.frameRef
      : stableRef(options.expectedFrameRef, 'navigateTo.expectedFrameRef');
    const commandRef = stableRef(options.commandRef, 'navigateTo.commandRef');
    const inputFingerprint = semanticHash({ resourceRef, goalRef, expectedFrameRef });
    const prior = commandLedger.get(commandRef);
    if (prior) {
      if (prior.inputFingerprint !== inputFingerprint) {
        return commandResult({
          registryState,
          navigationSessionRef,
          commandRef,
          resourceRef,
          goalRef,
          outcomeKind: 'DIVERGENT_COMMAND_IDENTITY',
          routePlanRefOrNull: null,
          startingFrameRef: currentFrame.frameRef,
          currentFrameRef: currentFrame.frameRef,
          lastKnownGoodFrameRef: currentFrame.frameRef,
          duplicateOfCommandRefOrNull: commandRef
        });
      }
      return commandResult({
        registryState,
        navigationSessionRef,
        commandRef,
        resourceRef,
        goalRef,
        outcomeKind: 'DUPLICATE_EXACT_NOOP',
        routePlanRefOrNull: prior.result.routePlanRefOrNull,
        startingFrameRef: prior.result.startingFrameRef,
        currentFrameRef: currentFrame.frameRef,
        lastKnownGoodFrameRef: currentFrame.frameRef,
        transitionCommitRefs: prior.result.transitionCommitRefs,
        duplicateOfCommandRefOrNull: commandRef
      });
    }
    if (expectedFrameRef !== currentFrame.frameRef) {
      const result = commandResult({
        registryState,
        navigationSessionRef,
        commandRef,
        resourceRef,
        goalRef,
        outcomeKind: 'BLOCKED_STALE_FRAME',
        routePlanRefOrNull: null,
        startingFrameRef: currentFrame.frameRef,
        currentFrameRef: currentFrame.frameRef,
        lastKnownGoodFrameRef: currentFrame.frameRef
      });
      commandLedger.set(commandRef, { inputFingerprint, result });
      return result;
    }
    let plan;
    try {
      plan = planNavigationRoute({
        compiledTopology,
        fromPageStateRef: currentFrame.pageStateRef,
        destinationResourceRef: resourceRef
      });
    } catch (error) {
      if (error.code !== 'NO_REGISTERED_VISIBLE_ROUTE') throw error;
      const result = commandResult({
        registryState,
        navigationSessionRef,
        commandRef,
        resourceRef,
        goalRef,
        outcomeKind: 'BLOCKED_NO_VISIBLE_ROUTE',
        routePlanRefOrNull: null,
        startingFrameRef: currentFrame.frameRef,
        currentFrameRef: currentFrame.frameRef,
        lastKnownGoodFrameRef: currentFrame.frameRef
      });
      commandLedger.set(commandRef, { inputFingerprint, result });
      return result;
    }
    const result = await executePlan(plan, {
      resourceRef,
      goalRef,
      expectedFrameRef,
      commandRef
    });
    commandLedger.set(commandRef, { inputFingerprint, result });
    return result;
  }

  const session = {
    schemaVersion: 'vexlife.navigation-continuity-session/v1',
    registry,
    navigationSessionRef,
    initialFrame: () => clone(initialFrame),
    currentFrame: () => clone(currentFrame),
    lastCommitRef: () => lastCommitRefOrNull,
    transitionBundles: () => bundles.map(clone),
    availableDirections: directionProjection,
    navigateTo(resourceRef, options = {}) {
      stableRef(resourceRef, 'navigateTo.resourceRef');
      commandSequence += 1;
      const normalizedOptions = {
        goalRef: options.goalRef,
        expectedFrameRef: options.expectedFrameRef ?? null,
        commandRef: options.commandRef ?? `command.navigation.${navigationSessionRef}.${commandSequence}`
      };
      return enqueue(() => executeCommand(resourceRef, normalizedOptions));
    },
    executePlan(plan, options) {
      return enqueue(() => executePlan(plan, options));
    },
    projectCurrentFrame() {
      return projectNavigationCurrentFrame(session);
    },
    projectRecentTrace(options = {}) {
      return projectNavigationRecentTrace(session, options);
    }
  };
  return deepFreeze(session);
}

// [VXG RealForever]
