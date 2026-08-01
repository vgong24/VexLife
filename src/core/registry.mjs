import { semanticHash } from './utils.mjs';

export class IdentityRegistry {
  constructor({ registryRef = 'registry.vexlife.runtime', entries = [] } = {}) {
    this.registryRef = registryRef;
    this.entries = new Map();
    this.aliases = new Map();
    for (const entry of entries) this.register(entry);
  }

  register(entry) {
    if (!entry?.ref) throw new Error('registry entry ref is required');
    if (this.entries.has(entry.ref)) throw new Error(`duplicate registry ref ${entry.ref}`);
    const normalized = { ...structuredClone(entry), stateHash: entry.stateHash ?? semanticHash(entry) };
    this.entries.set(entry.ref, normalized);
    for (const alias of entry.aliasRefs ?? []) {
      if (this.aliases.has(alias) || this.entries.has(alias)) throw new Error(`duplicate registry alias ${alias}`);
      this.aliases.set(alias, entry.ref);
    }
    return normalized;
  }

  canonicalRef(ref) { return this.aliases.get(ref) ?? ref; }
  get(ref) { return this.entries.get(this.canonicalRef(ref)) ?? null; }
  require(ref) {
    const entry = this.get(ref);
    if (!entry) throw new Error(`missing registry entry ${ref}`);
    return entry;
  }
  list({ kind = null, parentRef = null, consumerRef = null } = {}) {
    return [...this.entries.values()].filter((entry) =>
      (!kind || entry.kind === kind) &&
      (!parentRef || entry.parentRef === parentRef) &&
      (!consumerRef || (entry.consumerRefs ?? []).includes(consumerRef))
    );
  }
  project(refs, fields = ['ref', 'kind', 'brief', 'stateHash']) {
    return refs.map((ref) => this.require(ref)).map((entry) => Object.fromEntries(fields.filter((field) => field in entry).map((field) => [field, entry[field]])));
  }
}

function addUsage(map, stringRef, consumerRef) {
  if (!stringRef) return;
  const set = map.get(stringRef) ?? new Set();
  set.add(consumerRef);
  map.set(stringRef, set);
}

export function compileRegistryPack({
  blueprint,
  strings,
  factory,
  modules = null,
  experience = null,
  evolution = null,
  implementationPlan = null,
  capabilities = null,
  reviewLenses = null,
  featureRegistry = null,
  buildHealth = null,
  bridge = null,
  intentRegistry = blueprint?.intentOrchestration ?? null,
  schedulerRegistry = blueprint?.intentScheduler ?? null
}) {
  const registry = new IdentityRegistry({ registryRef: blueprint.registryRefs?.compiledIdentityRegistryRef });
  const stringUsage = new Map();

  registry.register({ ref: blueprint.blueprintRef, kind: 'BLUEPRINT', brief: blueprint.product.productRef, version: blueprint.version });
  registry.register({ ref: blueprint.product.productRef, kind: 'PRODUCT', brief: blueprint.product.displayNameStringRef });
  addUsage(stringUsage, blueprint.product.displayNameStringRef, blueprint.product.productRef);

  if (intentRegistry?.registryRef) {
    registry.register({
      ref: intentRegistry.registryRef,
      kind: 'INTENT_REGISTRY',
      brief: intentRegistry.purpose,
      version: intentRegistry.registryVersion,
      sourceRef: 'blueprint/intent-orchestration-registry.json',
      edges: [{ type: 'SYSTEM', to: intentRegistry.systemRef }]
    });
    registry.register({
      ref: intentRegistry.systemRef,
      kind: 'SYSTEM',
      brief: intentRegistry.purpose,
      parentRef: intentRegistry.registryRef,
      sourceRef: 'blueprint/intent-orchestration-registry.json',
      edges: [
        { type: 'PARENT', to: intentRegistry.registryRef },
        ...(intentRegistry.lifecycleStateRefs ?? []).map((item) => ({ type: 'LIFECYCLE_STATE', to: item.ref })),
        ...(intentRegistry.projectionIdentities ?? []).map((item) => ({ type: 'PROJECTS', to: item.projectionRef }))
      ]
    });
    for (const item of intentRegistry.lifecycleStateRefs ?? []) {
      registry.register({
        ref: item.ref,
        kind: 'INTENT_LIFECYCLE_STATE',
        brief: item.state,
        state: item.state,
        parentRef: intentRegistry.systemRef,
        sourceRef: 'blueprint/intent-orchestration-registry.json',
        edges: [{ type: 'PARENT', to: intentRegistry.systemRef }]
      });
    }
    if (intentRegistry.receiptContract?.contractRef) {
      registry.register({
        ref: intentRegistry.receiptContract.contractRef,
        kind: 'INTENT_RECEIPT_CONTRACT',
        brief: intentRegistry.receiptContract.purpose,
        parentRef: intentRegistry.systemRef,
        requiredFields: intentRegistry.receiptRequiredFields,
        sourceRef: 'blueprint/intent-orchestration-registry.json',
        edges: [{ type: 'PARENT', to: intentRegistry.systemRef }]
      });
    }
    for (const item of intentRegistry.receiptStateRefs ?? []) {
      registry.register({
        ref: item.ref,
        kind: 'INTENT_RECEIPT_STATE',
        brief: item.state,
        state: item.state,
        parentRef: intentRegistry.receiptContract.contractRef,
        sourceRef: 'blueprint/intent-orchestration-registry.json',
        edges: [{ type: 'PARENT', to: intentRegistry.receiptContract.contractRef }]
      });
    }
    for (const item of intentRegistry.projectionIdentities ?? []) {
      registry.register({
        ref: item.projectionRef,
        kind: 'INTENT_PROJECTION',
        brief: item.brief,
        parentRef: intentRegistry.systemRef,
        sourceRef: 'blueprint/intent-orchestration-registry.json',
        edges: [{ type: 'PARENT', to: intentRegistry.systemRef }]
      });
    }
    for (const [projectionKind, contract] of Object.entries(intentRegistry.attributedProjectionContracts ?? {})) {
      registry.register({
        ref: contract.contractRef,
        kind: 'INTENT_ATTRIBUTED_PROJECTION_CONTRACT',
        brief: projectionKind,
        projectionKind,
        parentRef: intentRegistry.systemRef,
        requiredFields: contract.requiredFields,
        sourceRef: 'blueprint/intent-orchestration-registry.json',
        edges: [{ type: 'PARENT', to: intentRegistry.systemRef }]
      });
    }
    for (const route of intentRegistry.knownIntentProcessRoutes ?? []) {
      registry.register({
        ...route,
        ref: route.resolutionRef,
        kind: 'INTENT_PROCESS_RESOLUTION',
        brief: `${route.intentKey} -> ${route.processRef}`,
        parentRef: intentRegistry.systemRef,
        sourceRef: 'blueprint/intent-orchestration-registry.json',
        edges: [
          { type: 'PARENT', to: intentRegistry.systemRef },
          { type: 'RESOLVES_TO_PROCESS', to: route.processRef }
        ]
      });
    }
  }

  if (schedulerRegistry?.registryRef) {
    const sourceRef = schedulerRegistry.canonicalSourceRef;
    const sourceEdge = { type: 'SOURCE', to: sourceRef };
    registry.register({
      ref: sourceRef,
      kind: 'SOURCE_CONTRACT',
      brief: schedulerRegistry.canonicalSource.path,
      path: schedulerRegistry.canonicalSource.path,
      sourceClass: schedulerRegistry.canonicalSource.sourceClass
    });
    registry.register({
      ref: schedulerRegistry.registryRef,
      kind: 'INTENT_SCHEDULER_REGISTRY',
      brief: schedulerRegistry.purpose,
      version: schedulerRegistry.registryVersion,
      sourceRef,
      edges: [
        sourceEdge,
        { type: 'SYSTEM', to: schedulerRegistry.systemRef }
      ]
    });
    registry.register({
      ref: schedulerRegistry.systemRef,
      kind: 'SYSTEM',
      brief: schedulerRegistry.purpose,
      parentRef: schedulerRegistry.registryRef,
      sourceRef,
      edges: [
        { type: 'PARENT', to: schedulerRegistry.registryRef },
        sourceEdge,
        ...(schedulerRegistry.priorityClassIdentities ?? []).map((item) => ({ type: 'PRIORITY_CLASS', to: item.priorityClassRef })),
        ...(schedulerRegistry.policyIdentities ?? []).map((item) => ({ type: 'POLICY', to: item.policyRef })),
        ...(schedulerRegistry.requiredFieldContracts ?? []).map((item) => ({ type: 'REQUIRED_FIELD_CONTRACT', to: item.contractRef })),
        ...(schedulerRegistry.projectionIdentities ?? []).map((item) => ({ type: 'PROJECTS', to: item.projectionRef })),
        ...(schedulerRegistry.processRefs ?? []).map((to) => ({ type: 'PROCESS', to })),
        ...(schedulerRegistry.testRefs ?? []).map((to) => ({ type: 'PROVED_BY', to })),
        { type: 'RUNTIME_TRUST', to: schedulerRegistry.runtimeTrustContract.contractRef },
        { type: 'SIMULATION_CONTRACT', to: schedulerRegistry.simulationContract.contractRef }
      ]
    });
    for (const item of schedulerRegistry.priorityClassIdentities ?? []) {
      registry.register({
        ...item,
        ref: item.priorityClassRef,
        kind: 'INTENT_SCHEDULER_PRIORITY_CLASS',
        brief: item.name,
        parentRef: schedulerRegistry.systemRef,
        sourceRef,
        edges: [{ type: 'PARENT', to: schedulerRegistry.systemRef }, sourceEdge]
      });
    }
    for (const item of schedulerRegistry.policyIdentities ?? []) {
      registry.register({
        ...item,
        ref: item.policyRef,
        kind: 'INTENT_SCHEDULER_POLICY',
        brief: item.policyKind,
        parentRef: schedulerRegistry.systemRef,
        sourceRef,
        policy: schedulerRegistry[item.sourceField],
        edges: [{ type: 'PARENT', to: schedulerRegistry.systemRef }, sourceEdge]
      });
    }
    for (const item of schedulerRegistry.requiredFieldContracts ?? []) {
      registry.register({
        ...item,
        ref: item.contractRef,
        kind: 'INTENT_SCHEDULER_REQUIRED_FIELD_CONTRACT',
        brief: item.contractKind,
        parentRef: schedulerRegistry.systemRef,
        sourceRef,
        requiredFields: schedulerRegistry[item.sourceField],
        edges: [{ type: 'PARENT', to: schedulerRegistry.systemRef }, sourceEdge]
      });
    }
    registry.register({
      ...schedulerRegistry.runtimeTrustContract,
      ref: schedulerRegistry.runtimeTrustContract.contractRef,
      kind: 'INTENT_SCHEDULER_RUNTIME_TRUST_CONTRACT',
      brief: schedulerRegistry.runtimeTrustContract.purpose,
      parentRef: schedulerRegistry.systemRef,
      sourceRef,
      edges: [
        { type: 'PARENT', to: schedulerRegistry.systemRef },
        { type: 'CLOCK', to: schedulerRegistry.runtimeTrustContract.clockRef },
        ...(schedulerRegistry.runtimeSourceIdentities ?? []).map((item) => ({ type: 'RUNTIME_SOURCE', to: item.sourceRef })),
        ...(schedulerRegistry.workerIdentities ?? []).map((item) => ({ type: 'WORKER', to: item.workerRef })),
        sourceEdge
      ]
    });
    registry.register({
      ref: schedulerRegistry.runtimeTrustContract.clockRef,
      kind: 'CANONICAL_CLOCK',
      brief: schedulerRegistry.runtimeTrustContract.activeWindowRule,
      parentRef: schedulerRegistry.runtimeTrustContract.contractRef,
      sourceRef,
      edges: [{ type: 'PARENT', to: schedulerRegistry.runtimeTrustContract.contractRef }, sourceEdge]
    });
    for (const item of schedulerRegistry.runtimeSourceIdentities ?? []) {
      registry.register({
        ...item,
        ref: item.sourceRef,
        kind: 'INTENT_SCHEDULER_RUNTIME_SOURCE',
        brief: item.evidenceClass,
        parentRef: schedulerRegistry.runtimeTrustContract.contractRef,
        sourceRef,
        edges: [
          { type: 'PARENT', to: schedulerRegistry.runtimeTrustContract.contractRef },
          { type: 'AUTHORITY', to: item.authorityRef },
          sourceEdge
        ]
      });
      registry.register({
        ref: item.authorityRef,
        kind: 'INTENT_SCHEDULER_RUNTIME_AUTHORITY',
        brief: item.sourceRef,
        parentRef: item.sourceRef,
        sourceRef,
        edges: [{ type: 'PARENT', to: item.sourceRef }, sourceEdge]
      });
    }
    for (const item of schedulerRegistry.workerIdentities ?? []) {
      registry.register({
        ...item,
        ref: item.workerRef,
        kind: 'INTENT_SCHEDULER_WORKER',
        brief: item.workerKind,
        parentRef: schedulerRegistry.runtimeTrustContract.contractRef,
        sourceRef,
        edges: [{ type: 'PARENT', to: schedulerRegistry.runtimeTrustContract.contractRef }, sourceEdge]
      });
    }
    for (const item of schedulerRegistry.mockToolContracts ?? []) {
      registry.register({
        ...item,
        ref: item.contractRef,
        kind: 'INTENT_SCHEDULER_MOCK_TOOL_CONTRACT',
        brief: `${item.toolRef} -> ${item.resultSchemaRef}`,
        parentRef: schedulerRegistry.systemRef,
        sourceRef,
        edges: [
          { type: 'PARENT', to: schedulerRegistry.systemRef },
          { type: 'TOOL', to: item.toolRef },
          { type: 'EFFECT', to: item.effectRef },
          { type: 'ARGUMENT_SCHEMA', to: item.argumentSchemaRef },
          { type: 'RESULT_SCHEMA', to: item.resultSchemaRef },
          { type: 'EXECUTOR', to: item.executorRef },
          sourceEdge
        ]
      });
      for (const [ref, kind, brief] of [
        [item.toolRef, 'INTENT_SCHEDULER_MOCK_TOOL', item.contractRef],
        [item.effectRef, 'INTENT_SCHEDULER_MOCK_EFFECT', item.contractRef],
        [item.argumentSchemaRef, 'INTENT_SCHEDULER_ARGUMENT_SCHEMA', item.contractRef],
        [item.resultSchemaRef, 'INTENT_SCHEDULER_RESULT_SCHEMA', item.contractRef],
        [item.executorRef, 'INTENT_SCHEDULER_MOCK_EXECUTOR', item.contractRef]
      ]) {
        registry.register({
          ref,
          kind,
          brief,
          parentRef: item.contractRef,
          sourceRef,
          edges: [{ type: 'PARENT', to: item.contractRef }, sourceEdge]
        });
      }
    }
    registry.register({
      ...schedulerRegistry.simulationContract,
      ref: schedulerRegistry.simulationContract.contractRef,
      kind: 'INTENT_SCHEDULER_SIMULATION_CONTRACT',
      brief: schedulerRegistry.simulationContract.receiptPath,
      parentRef: schedulerRegistry.systemRef,
      sourceRef,
      edges: [
        { type: 'PARENT', to: schedulerRegistry.systemRef },
        { type: 'PROVED_BY', to: schedulerRegistry.simulationContract.checkRef },
        sourceEdge
      ]
    });
    for (const item of schedulerRegistry.projectionIdentities ?? []) {
      registry.register({
        ...item,
        ref: item.projectionRef,
        kind: 'INTENT_SCHEDULER_PROJECTION',
        brief: item.brief,
        parentRef: schedulerRegistry.systemRef,
        sourceRef,
        edges: [{ type: 'PARENT', to: schedulerRegistry.systemRef }, sourceEdge]
      });
    }
  }

  for (const domain of blueprint.stateDomains) registry.register({ ref: domain.stateRef, kind: 'STATE_DOMAIN', brief: domain.brief, ownerRef: domain.ownerRef, edges: [{ type: 'OWNER', to: domain.ownerRef }] });
  for (const role of blueprint.roles) {
    registry.register({ ref: role.roleRef, kind: 'ROLE', brief: role.labelStringRef, level: role.level, edges: (role.mayReachRoleRefs ?? []).map((to) => ({ type: 'MAY_REACH', to })) });
    addUsage(stringUsage, role.labelStringRef, role.roleRef);
  }
  for (const component of blueprint.components ?? []) {
    registry.register({ ref: component.componentRef, kind: 'COMPONENT', brief: component.purpose, instanceRefPattern: component.instanceRefPattern, edges: (component.slots ?? []).map((slot) => ({ type: 'CONTAINS_SLOT', to: slot.slotRef })) });
    for (const slot of component.slots ?? []) registry.register({ ...slot, ref: slot.slotRef, kind: 'COMPONENT_SLOT', slotKind: slot.kind, brief: slot.kind, parentRef: component.componentRef, edges: [{ type: 'PARENT', to: component.componentRef }, ...(slot.actionRef ? [{ type: 'ACTION', to: slot.actionRef }] : [])] });
  }
  for (const permission of blueprint.permissions) registry.register({ ref: permission.permissionRef, kind: 'PERMISSION', brief: permission.effectClass, ...permission });
  for (const action of blueprint.actions) registry.register({ ref: action.actionRef, kind: 'ACTION', brief: action.actionRef, ...action, edges: [{ type: 'REQUIRES_PERMISSION', to: action.permissionRef }, ...(action.outputStateRefs ?? []).map((to) => ({ type: 'UPDATES', to }))] });

  for (const screen of blueprint.screens) {
    registry.register({ ref: screen.conceptRef, kind: 'CONCEPT', brief: `Meaning of ${screen.screenRef}`, edges: [{ type: 'REALIZED_BY', to: screen.screenRef }] });
    registry.register({ ref: screen.screenRef, kind: 'SCREEN', brief: screen.titleStringRef, conceptRef: screen.conceptRef, routeRef: screen.routeRef, navigationNodeRef: screen.navigationNodeRef, selectorRefs: screen.stateSelectorRefs, testRefs: screen.testRefs, edges: screen.regions.map((region) => ({ type: 'CONTAINS', to: region.regionRef })) });
    addUsage(stringUsage, screen.titleStringRef, screen.screenRef);
    registry.register({ ref: screen.routeRef, kind: 'ROUTE', brief: `Route for ${screen.screenRef}`, screenRef: screen.screenRef, edges: [{ type: 'OPENS', to: screen.screenRef }] });
    registry.register({ ref: screen.navigationNodeRef, kind: 'NAVIGATION_NODE', brief: `Navigation node for ${screen.screenRef}`, screenRef: screen.screenRef, parentRef: null, edges: [{ type: 'REPRESENTS', to: screen.screenRef }] });
    for (const region of screen.regions) {
      registry.register({ ref: region.conceptRef, kind: 'CONCEPT', brief: `Meaning of ${region.regionRef}`, edges: [{ type: 'REALIZED_BY', to: region.regionRef }] });
      registry.register({ ref: region.regionRef, kind: 'REGION', brief: region.labelStringRef, conceptRef: region.conceptRef, parentRef: screen.screenRef, navigationNodeRef: region.navigationNodeRef, edges: [{ type: 'PARENT', to: screen.screenRef }, ...region.elements.map((element) => ({ type: 'CONTAINS', to: element.elementRef }))] });
      addUsage(stringUsage, region.labelStringRef, region.regionRef);
      registry.register({ ref: region.navigationNodeRef, kind: 'NAVIGATION_NODE', brief: `Navigation node for ${region.regionRef}`, parentRef: screen.navigationNodeRef, screenRef: screen.screenRef, edges: [{ type: 'PARENT', to: screen.navigationNodeRef }, { type: 'REPRESENTS', to: region.regionRef }] });
      for (const element of region.elements) {
        registry.register({ ref: element.conceptRef, kind: 'CONCEPT', brief: `Meaning of ${element.elementRef}`, edges: [{ type: 'REALIZED_BY', to: element.elementRef }] });
        const edges = [{ type: 'PARENT', to: region.regionRef }, { type: 'INTERACTION', to: element.interactionRef }, { type: 'CONCEPT', to: element.conceptRef }];
        if (element.actionRef) edges.push({ type: 'ACTION', to: element.actionRef });
        if (element.permissionRef) edges.push({ type: 'PERMISSION', to: element.permissionRef });
        if (element.terrainNodeRef) edges.push({ type: 'TERRAIN', to: element.terrainNodeRef });
        if (element.navigationRef) edges.push({ type: 'NAVIGATION_PATH', to: element.navigationRef });
        for (const testRef of element.testRefs ?? []) edges.push({ type: 'PROVED_BY', to: testRef });
        registry.register({ ...element, ref: element.elementRef, kind: 'ELEMENT', elementKind: element.kind, brief: element.labelStringRef, parentRef: region.regionRef, screenRef: screen.screenRef, edges });
        registry.register({ ref: element.interactionRef, kind: 'INTERACTION', brief: `${element.kind} interaction`, elementRef: element.elementRef, actionRef: element.actionRef, journeyEventTypeRef: element.journeyEventTypeRef, edges: [{ type: 'ELEMENT', to: element.elementRef }, ...(element.actionRef ? [{ type: 'ACTION', to: element.actionRef }] : [])] });
        if (element.navigationRef) registry.register({ ref: element.navigationRef, kind: 'NAVIGATION_PATH', brief: `Semantic path from ${screen.screenRef} through ${element.elementRef}`, screenRef: screen.screenRef, elementRef: element.elementRef, actionRef: element.actionRef, parentRef: region.navigationNodeRef, edges: [{ type: 'FROM_SCREEN', to: screen.screenRef }, { type: 'VIA_ELEMENT', to: element.elementRef }] });
        addUsage(stringUsage, element.labelStringRef, element.elementRef);
      }
    }
  }

  for (const node of blueprint.terrain) {
    registry.register({ ...node, ref: node.terrainNodeRef, kind: 'TERRAIN', terrainKind: node.kind, brief: node.labelStringRef, edges: node.parentRef ? [{ type: 'PARENT', to: node.parentRef }] : [] });
    addUsage(stringUsage, node.labelStringRef, node.terrainNodeRef);
  }
  for (const platform of blueprint.platforms) registry.register({ ref: platform.platformRef, kind: 'PLATFORM', brief: platform.supportState, ...platform });
  for (const test of blueprint.tests) registry.register({ ref: test.testRef, kind: 'TEST', brief: test.brief });
  for (const profile of experience?.experienceProfiles ?? []) { registry.register({ ...profile, ref: profile.profileRef, kind: 'EXPERIENCE_PROFILE', brief: profile.purpose, edges: [{ type: 'DEFAULT_ROUTE', to: profile.defaultRouteRef }, { type: 'DEFAULT_ROLE', to: profile.defaultRoleRef }] }); addUsage(stringUsage, profile.labelStringRef, profile.profileRef); }
  for (const gesture of experience?.gestureContracts ?? []) { registry.register({ ...gesture, ref: gesture.gestureRef, kind: 'GESTURE', brief: gesture.helpStringRef, edges: [{ type: 'ACTION', to: gesture.resultActionRef }] }); addUsage(stringUsage, gesture.helpStringRef, gesture.gestureRef); }
  for (const vessel of experience?.vessels ?? []) { registry.register({ ...vessel, ref: vessel.vesselRef, kind: 'VESSEL', brief: vessel.purpose, edges: [{ type: 'COMPONENT', to: vessel.componentRef }, ...(vessel.actionRefs ?? []).map((to) => ({ type: 'ACTION', to }))] }); addUsage(stringUsage, vessel.labelStringRef, vessel.vesselRef); }



  if (capabilities?.registryRef) {
    registry.register({ ref: capabilities.registryRef, kind: 'CAPABILITY_REGISTRY', brief: 'Role/platform/project/permission/resource capability source', version: capabilities.registryVersion });
    for (const capability of capabilities.capabilities ?? []) registry.register({ ...capability, ref: capability.capabilityRef, kind: 'CAPABILITY', brief: capability.purpose, parentRef: capabilities.registryRef, edges: [
      { type: 'PARENT', to: capabilities.registryRef },
      { type: 'PERMISSION', to: capability.permissionRef },
      ...(capability.actionRefs ?? []).map((to) => ({ type: 'ACTION', to })),
      ...(capability.roleRefs ?? []).map((to) => ({ type: 'VISIBLE_TO_ROLE', to })),
      ...(capability.platformRefs ?? []).map((to) => ({ type: 'PLATFORM', to }))
    ] });
  }

  if (reviewLenses?.registryRef) {
    registry.register({ ref: reviewLenses.registryRef, kind: 'REVIEW_LENS_REGISTRY', brief: reviewLenses.purpose, version: reviewLenses.registryVersion });
    for (const lens of reviewLenses.lenses ?? []) registry.register({ ...lens, ref: lens.lensRef, kind: 'REVIEW_LENS', brief: lens.purpose, parentRef: reviewLenses.registryRef, edges: [{ type: 'PARENT', to: reviewLenses.registryRef }] });
  }

  if (bridge?.bridgeRef) {
    registry.register({ ...bridge, ref: bridge.bridgeRef, kind: 'HOME_BRIDGE', brief: bridge.purpose, version: bridge.bridgeVersion, edges: (bridge.transportAdapters ?? []).map((item) => ({ type: 'TRANSPORT_ADAPTER', to: item.transportRef })) });
    for (const transport of bridge.transportAdapters ?? []) registry.register({ ...transport, ref: transport.transportRef, kind: 'TRANSPORT', brief: transport.notes, parentRef: bridge.bridgeRef, edges: [{ type: 'PARENT', to: bridge.bridgeRef }] });
  }

  if (featureRegistry?.registryRef) {
    registry.register({ ref: featureRegistry.registryRef, kind: 'FEATURE_REGISTRY', brief: featureRegistry.purpose, version: featureRegistry.registryVersion });
    for (const feature of featureRegistry.features ?? []) registry.register({ ...feature, ref: feature.featureRef, kind: 'FEATURE', brief: feature.purpose, parentRef: featureRegistry.registryRef, edges: [
      { type: 'PARENT', to: featureRegistry.registryRef },
      ...(feature.canonicalNodeRefs ?? []).map((to) => ({ type: 'CANONICAL_NODE', to })),
      ...(feature.stateRefs ?? []).map((to) => ({ type: 'OBSERVES_STATE', to })),
      ...(feature.actionRefs ?? []).map((to) => ({ type: 'ACTION', to })),
      ...(feature.permissionRefs ?? []).map((to) => ({ type: 'PERMISSION', to })),
      ...(feature.processRefs ?? []).map((to) => ({ type: 'PROCESS', to })),
      ...(feature.moduleRefs ?? []).map((to) => ({ type: 'MODULE', to })),
      ...(feature.testRefs ?? []).map((to) => ({ type: 'PROVED_BY', to })),
      ...(feature.platformRefs ?? []).map((to) => ({ type: 'PLATFORM', to })),
      ...(feature.reviewLensRefs ?? []).map((to) => ({ type: 'REVIEWED_THROUGH', to }))
    ] });
  }

  if (buildHealth?.registryRef) {
    registry.register({ ref: buildHealth.registryRef, kind: 'BUILD_HEALTH_REGISTRY', brief: buildHealth.purpose, version: buildHealth.registryVersion });
    for (const check of buildHealth.checks ?? []) registry.register({ ...check, ref: check.checkRef, kind: 'HEALTH_CHECK', brief: check.purpose, parentRef: buildHealth.registryRef, edges: [{ type: 'PARENT', to: buildHealth.registryRef }, ...(check.lensRefs ?? []).map((to) => ({ type: 'PROTECTS_LENS', to }))] });
  }

  if (evolution?.registryRef) {
    registry.register({
      ref: evolution.registryRef,
      kind: 'EVOLUTION_REGISTRY',
      brief: evolution.purpose,
      version: evolution.registryVersion,
      sourceRef: evolution.canonicalSourceRef,
      edges: [
        { type: 'CANONICAL_SOURCE', to: evolution.canonicalSourceRef },
        { type: 'SYSTEM', to: evolution.systemRef }
      ]
    });
    registry.register({
      ...evolution.canonicalSource,
      ref: evolution.canonicalSourceRef,
      kind: 'EVOLUTION_SOURCE',
      brief: evolution.canonicalSource.path,
      parentRef: evolution.registryRef,
      edges: [
        { type: 'PARENT', to: evolution.registryRef },
        { type: 'COMPOSED_BY', to: evolution.canonicalSource.compositionRef },
        { type: 'DEFINES_SYSTEM', to: evolution.systemRef }
      ]
    });
    registry.register({
      ...evolution.system,
      ref: evolution.systemRef,
      kind: 'EVOLUTION_SYSTEM',
      brief: evolution.institutionalName,
      parentRef: evolution.registryRef,
      edges: [
        { type: 'PARENT', to: evolution.registryRef },
        { type: 'CANONICAL_SOURCE', to: evolution.canonicalSourceRef },
        ...(evolution.system.contractRefs ?? []).map((to) => ({ type: 'CONTRACT', to })),
        ...(evolution.processRefs ?? []).map((to) => ({ type: 'PROCESS', to })),
        ...(evolution.moduleRefs ?? []).map((to) => ({ type: 'MODULE', to })),
        ...(evolution.testRefs ?? []).map((to) => ({ type: 'PROVED_BY', to })),
        ...(evolution.projectionRefs ?? []).map((to) => ({ type: 'PROJECTS', to }))
      ]
    });
    for (const contract of evolution.contractIdentities ?? []) registry.register({
      ...contract,
      ref: contract.contractRef,
      kind: 'EVOLUTION_CONTRACT',
      brief: contract.contractKind,
      parentRef: evolution.systemRef,
      edges: [
        { type: 'PARENT', to: evolution.systemRef },
        { type: 'CANONICAL_SOURCE', to: evolution.canonicalSourceRef },
        ...(evolution.testRefs ?? []).map((to) => ({ type: 'PROVED_BY', to }))
      ]
    });
    for (const origin of evolution.behaviorOriginIdentities ?? []) registry.register({
      ...origin,
      ref: origin.originRef,
      kind: 'EVOLUTION_BEHAVIOR_ORIGIN',
      brief: origin.value,
      parentRef: evolution.systemRef,
      sourceRef: evolution.canonicalSourceRef,
      edges: [{ type: 'PARENT', to: evolution.systemRef }]
    });
    for (const scope of evolution.scopeIdentities ?? []) registry.register({
      ...scope,
      ref: scope.scopeRef,
      kind: 'EVOLUTION_SCOPE',
      brief: scope.value,
      parentRef: evolution.systemRef,
      sourceRef: evolution.canonicalSourceRef,
      edges: [{ type: 'PARENT', to: evolution.systemRef }]
    });
    for (const destination of evolution.primaryDestinationIdentities ?? []) registry.register({
      ...destination,
      ref: destination.destinationRef,
      kind: 'EVOLUTION_PRIMARY_DESTINATION',
      brief: destination.value,
      parentRef: evolution.systemRef,
      sourceRef: evolution.canonicalSourceRef,
      edges: [{ type: 'PARENT', to: evolution.systemRef }]
    });
    for (const destination of evolution.linkedDestinationIdentities ?? []) registry.register({
      ...destination,
      ref: destination.destinationRef,
      kind: 'EVOLUTION_LINKED_DESTINATION',
      brief: destination.value,
      parentRef: evolution.systemRef,
      sourceRef: evolution.canonicalSourceRef,
      edges: [{ type: 'PARENT', to: evolution.systemRef }]
    });
    for (const policy of evolution.acceptancePolicies ?? []) registry.register({
      ...policy,
      ref: policy.policyRef,
      kind: 'EVOLUTION_ACCEPTANCE_POLICY',
      brief: policy.authorityRule,
      parentRef: evolution.systemRef,
      sourceRef: evolution.canonicalSourceRef,
      edges: [{ type: 'PARENT', to: evolution.systemRef }]
    });
    for (const projection of evolution.projectionIdentities ?? []) registry.register({
      ...projection,
      ref: projection.projectionRef,
      kind: 'EVOLUTION_PROJECTION',
      brief: projection.projectionKind,
      parentRef: evolution.systemRef,
      sourceRef: evolution.canonicalSourceRef,
      edges: [{ type: 'PARENT', to: evolution.systemRef }]
    });
    for (const candidateType of evolution.candidateTypes ?? []) registry.register({ ...candidateType, ref: candidateType.candidateTypeRef, kind: 'DREAM_CANDIDATE_TYPE', brief: candidateType.riskClass, parentRef: evolution.registryRef, edges: [{ type: 'PARENT', to: evolution.registryRef }] });
  }

  if (implementationPlan?.planRef) {
    registry.register({ ref: implementationPlan.planRef, kind: 'IMPLEMENTATION_PLAN', brief: implementationPlan.demoContractRef, version: implementationPlan.planVersion, edges: (implementationPlan.milestones ?? []).map((item) => ({ type: 'CONTAINS_MILESTONE', to: item.milestoneRef })) });
    if (implementationPlan.demoContractRef) registry.register({ ref: implementationPlan.demoContractRef, kind: 'DEMO_CONTRACT', brief: 'First complete local VexLife journey', parentRef: implementationPlan.planRef, edges: [{ type: 'PARENT', to: implementationPlan.planRef }] });
    for (const milestone of implementationPlan.milestones ?? []) registry.register({ ...milestone, ref: milestone.milestoneRef, kind: 'MILESTONE', brief: milestone.purpose, parentRef: implementationPlan.planRef, edges: [{ type: 'PARENT', to: implementationPlan.planRef }] });
    for (const work of implementationPlan.workUnits ?? []) registry.register({ ...work, ref: work.workRef, kind: 'WORK_UNIT', brief: work.purpose, parentRef: work.milestoneRef, edges: [
      { type: 'PARENT', to: work.milestoneRef },
      ...(work.dependsOn ?? []).map((to) => ({ type: 'DEPENDS_ON_WORK', to })),
      ...(work.requiredSourceRefs ?? []).map((to) => ({ type: 'READS_SOURCE', to })),
      ...(work.requiredTestRefs ?? []).map((to) => ({ type: 'PROVED_BY', to }))
    ] });
  }

  for (const foundation of factory?.foundations ?? []) registry.register({ ref: foundation.foundationRef, kind: 'FOUNDATION', brief: foundation.purpose, version: foundation.foundationVersion, ...foundation });
  for (const process of factory?.processes ?? []) registry.register({ ref: process.processRef, kind: 'PROCESS', brief: process.purpose, version: process.processVersion, ...process, edges: [
    ...(process.foundationDependencies ?? []).map((to) => ({ type: 'DEPENDS_ON', to })),
    ...(process.downstreamConsumerRefs ?? []).map((to) => ({ type: 'CONSUMED_BY', to })),
    ...(process.testRefs ?? []).map((to) => ({ type: 'PROVED_BY', to }))
  ] });
  for (const template of factory?.templates ?? []) registry.register({ ref: template.templateRef, kind: 'TEMPLATE', brief: template.purpose, version: template.templateVersion, ...template });
  for (const example of factory?.workedExamples ?? []) registry.register({ ref: example.exampleRef, kind: 'WORKED_EXAMPLE', brief: example.observedOutcome, ...example, edges: [{ type: 'FORMED_FROM', to: example.formedFromProcessRef }] });

  for (const [stringRef, value] of Object.entries(strings[blueprint.product.defaultLanguage] ?? {})) {
    registry.register({
      ref: stringRef,
      kind: 'STRING',
      brief: value,
      sourceLocale: blueprint.product.defaultLanguage,
      values: Object.fromEntries(Object.entries(strings).map(([locale, catalog]) => [locale, catalog[stringRef] ?? null])),
      consumerRefs: [...(stringUsage.get(stringRef) ?? [])].sort()
    });
  }

  for (const module of modules?.modules ?? []) registry.register({ ref: module.moduleRef, kind: 'MODULE', brief: module.role, ...module, edges: [
    ...(module.reads ?? []).map((to) => ({ type: 'READS', to })),
    ...(module.writes ?? []).map((to) => ({ type: 'WRITES', to })),
    ...(module.tests ?? []).map((to) => ({ type: 'PROVED_BY_PATH', to }))
  ] });

  return registry;
}

export function buildRegistryProjection(registry) {
  const byKind = {};
  for (const entry of registry.entries.values()) byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;
  return {
    schemaVersion: 'vexlife.registry-projection/v0',
    registryRef: registry.registryRef,
    entryCount: registry.entries.size,
    byKind,
    semanticHash: semanticHash([...registry.entries.values()].map(({ ref, kind, stateHash }) => ({ ref, kind, stateHash })))
  };
}

// [VXG RealForever]
