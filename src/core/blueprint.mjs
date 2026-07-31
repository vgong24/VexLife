import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, semanticHash } from './utils.mjs';
import { validateProcessFactory } from './process-factory.mjs';
import { compileRegistryPack } from './registry.mjs';
import { validateExperienceRegistry } from './experience.mjs';
import { validateImplementationPlan } from './implementation-plan.mjs';
import { validateReviewLensRegistry, validateFeatureRegistry } from './feature-registry.mjs';
import { validateHomeBridgeRegistry } from './home-bridge.mjs';
import { validateBuildHealthRegistry } from './build-health.mjs';
import { validateIntentRegistry } from './intent-validation.mjs';
import { validateIntentSchedulerRegistry } from './scheduler-runtime-trust.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const VEXLIFE_ROOT = path.resolve(HERE, '../..');

function optionalJson(filePath, fallback) {
  return fs.existsSync(filePath) ? readJson(filePath) : fallback;
}

function resolveFragment(root, source) {
  return readJson(path.resolve(root, source));
}

export function loadComposedRecord(root, descriptorPath, fallback) {
  const absolute = path.join(root, descriptorPath);
  if (!fs.existsSync(absolute)) return fallback;
  const descriptor = readJson(absolute);
  if (!descriptor.includes) return descriptor;
  const output = Object.fromEntries(Object.entries(descriptor).filter(([key]) => key !== 'includes' && key !== 'composition'));
  for (const [field, source] of Object.entries(descriptor.includes)) {
    if (Array.isArray(source)) {
      const fragments = source.map((item) => resolveFragment(root, item));
      output[field] = fragments.every(Array.isArray) ? fragments.flat() : fragments;
    } else {
      output[field] = resolveFragment(root, source);
    }
  }
  return output;
}

export function loadBlueprint(root = VEXLIFE_ROOT) {
  const blueprint = loadComposedRecord(root, 'blueprint/vexlife.blueprint.json', {});
  const tokens = readJson(path.join(root, 'blueprint/design-tokens.json'));
  const platforms = readJson(path.join(root, 'blueprint/platforms.json'));
  const factory = loadComposedRecord(root, 'blueprint/process-factory.json', { foundations: [], processes: [], templates: [], workedExamples: [] });
  const modules = loadComposedRecord(root, 'blueprint/module-registry.json', { modules: [] });
  const experience = optionalJson(path.join(root, 'blueprint/experience-registry.json'), { experienceProfiles: [], gestureContracts: [], vessels: [] });
  const evolution = optionalJson(path.join(root, 'blueprint/evolution-registry.json'), { candidateTypes: [], dreamStates: [], synchronizationScopes: [], weightLifecycleStates: [] });
  const implementationPlan = loadComposedRecord(root, 'blueprint/implementation-plan.json', { milestones: [], workUnits: [] });
  const capabilities = optionalJson(path.join(root, 'blueprint/capability-registry.json'), { capabilities: [] });
  const reviewLenses = optionalJson(path.join(root, 'blueprint/review-lens-registry.json'), { lenses: [] });
  const featureRegistry = optionalJson(path.join(root, 'blueprint/feature-registry.json'), { features: [] });
  const buildHealth = optionalJson(path.join(root, 'blueprint/build-health-registry.json'), { checks: [] });
  const bridge = optionalJson(path.join(root, 'blueprint/home-bridge-registry.json'), {});
  const intentRegistry = blueprint.intentOrchestration ?? null;
  const schedulerRegistry = blueprint.intentScheduler ?? null;
  const strings = Object.fromEntries(blueprint.product.requiredLanguages.map((language) => [
    language,
    readJson(path.join(root, `blueprint/strings/${language}.json`))
  ]));
  return {
    blueprint,
    tokens,
    platforms,
    strings,
    factory,
    modules,
    experience,
    evolution,
    implementationPlan,
    capabilities,
    reviewLenses,
    featureRegistry,
    buildHealth,
    bridge,
    intentRegistry,
    schedulerRegistry,
    root
  };
}

function collectRefs(bundle) {
  const {
    blueprint,
    factory,
    modules,
    experience,
    evolution,
    implementationPlan,
    capabilities,
    reviewLenses,
    featureRegistry,
    buildHealth,
    bridge,
    intentRegistry,
    schedulerRegistry
  } = bundle;
  const refs = [];
  const add = (kind, ref) => refs.push({ kind, ref });
  add('blueprint', blueprint.blueprintRef);
  add('product', blueprint.product.productRef);
  for (const item of blueprint.stateDomains) add('state', item.stateRef);
  for (const item of blueprint.roles) add('role', item.roleRef);
  for (const item of blueprint.permissions) add('permission', item.permissionRef);
  for (const item of blueprint.actions) add('action', item.actionRef);
  for (const component of blueprint.components ?? []) { add('component', component.componentRef); for (const slot of component.slots ?? []) add('component-slot', slot.slotRef); }
  for (const screen of blueprint.screens) {
    add('screen', screen.screenRef);
    add('concept', screen.conceptRef);
    add('route', screen.routeRef);
    add('navigation-node', screen.navigationNodeRef);
    for (const region of screen.regions) {
      add('region', region.regionRef);
      add('concept', region.conceptRef);
      add('navigation-node', region.navigationNodeRef);
      for (const element of region.elements) {
        add('element', element.elementRef);
        add('concept', element.conceptRef);
        add('interaction', element.interactionRef);
        if (element.navigationRef) add('navigation-path', element.navigationRef);
      }
    }
  }
  for (const item of blueprint.terrain) add('terrain', item.terrainNodeRef);
  for (const item of blueprint.platforms) add('platform', item.platformRef);
  for (const item of blueprint.tests) add('test', item.testRef);
  for (const item of factory.foundations ?? []) add('foundation', item.foundationRef);
  for (const item of factory.processes ?? []) add('process', item.processRef);
  for (const item of factory.templates ?? []) add('template', item.templateRef);
  for (const item of factory.workedExamples ?? []) add('worked-example', item.exampleRef);
  for (const item of modules.modules ?? []) add('module', item.moduleRef);
  for (const item of experience?.experienceProfiles ?? []) add('experience-profile', item.profileRef);
  for (const item of experience?.gestureContracts ?? []) add('gesture', item.gestureRef);
  for (const item of experience?.vessels ?? []) add('vessel', item.vesselRef);
  if (evolution?.registryRef) add('evolution-registry', evolution.registryRef);
  for (const item of evolution?.candidateTypes ?? []) add('dream-candidate-type', item.candidateTypeRef);
  if (implementationPlan?.planRef) add('implementation-plan', implementationPlan.planRef);
  if (implementationPlan?.demoContractRef) add('demo-contract', implementationPlan.demoContractRef);
  for (const item of implementationPlan?.milestones ?? []) add('milestone', item.milestoneRef);
  for (const item of implementationPlan?.workUnits ?? []) add('work-unit', item.workRef);
  if (capabilities?.registryRef) add('capability-registry', capabilities.registryRef);
  for (const item of capabilities?.capabilities ?? []) add('capability', item.capabilityRef);
  if (reviewLenses?.registryRef) add('review-lens-registry', reviewLenses.registryRef);
  for (const item of reviewLenses?.lenses ?? []) add('review-lens', item.lensRef);
  if (featureRegistry?.registryRef) add('feature-registry', featureRegistry.registryRef);
  for (const item of featureRegistry?.features ?? []) add('feature', item.featureRef);
  if (buildHealth?.registryRef) add('build-health-registry', buildHealth.registryRef);
  for (const item of buildHealth?.checks ?? []) add('health-check', item.checkRef);
  if (bridge?.bridgeRef) add('home-bridge', bridge.bridgeRef);
  for (const item of bridge?.transportAdapters ?? []) add('transport', item.transportRef);
  if (intentRegistry?.registryRef) add('intent-registry', intentRegistry.registryRef);
  if (intentRegistry?.systemRef) add('intent-system', intentRegistry.systemRef);
  for (const item of intentRegistry?.lifecycleStateRefs ?? []) add('intent-lifecycle-state', item.ref);
  if (intentRegistry?.receiptContract?.contractRef) add('intent-receipt-contract', intentRegistry.receiptContract.contractRef);
  for (const item of intentRegistry?.receiptStateRefs ?? []) add('intent-receipt-state', item.ref);
  for (const item of intentRegistry?.projectionIdentities ?? []) add('intent-projection', item.projectionRef);
  for (const item of Object.values(intentRegistry?.attributedProjectionContracts ?? {})) add('intent-attributed-contract', item.contractRef);
  for (const item of intentRegistry?.knownIntentProcessRoutes ?? []) add('intent-resolution', item.resolutionRef);
  if (schedulerRegistry?.registryRef) add('intent-scheduler-registry', schedulerRegistry.registryRef);
  if (schedulerRegistry?.systemRef) add('intent-scheduler-system', schedulerRegistry.systemRef);
  if (schedulerRegistry?.canonicalSourceRef) add('intent-scheduler-source', schedulerRegistry.canonicalSourceRef);
  for (const item of schedulerRegistry?.priorityClassIdentities ?? []) add('intent-scheduler-priority', item.priorityClassRef);
  for (const item of schedulerRegistry?.policyIdentities ?? []) add('intent-scheduler-policy', item.policyRef);
  for (const item of schedulerRegistry?.requiredFieldContracts ?? []) add('intent-scheduler-field-contract', item.contractRef);
  if (schedulerRegistry?.runtimeTrustContract?.contractRef) add('intent-scheduler-runtime-contract', schedulerRegistry.runtimeTrustContract.contractRef);
  if (schedulerRegistry?.runtimeTrustContract?.clockRef) add('intent-scheduler-clock', schedulerRegistry.runtimeTrustContract.clockRef);
  for (const item of schedulerRegistry?.runtimeSourceIdentities ?? []) {
    add('intent-scheduler-runtime-source', item.sourceRef);
    add('intent-scheduler-runtime-authority', item.authorityRef);
  }
  for (const item of schedulerRegistry?.workerIdentities ?? []) add('intent-scheduler-worker', item.workerRef);
  for (const item of schedulerRegistry?.mockToolContracts ?? []) {
    add('intent-scheduler-mock-tool-contract', item.contractRef);
    add('intent-scheduler-mock-tool', item.toolRef);
    add('intent-scheduler-mock-effect', item.effectRef);
    add('intent-scheduler-argument-schema', item.argumentSchemaRef);
    add('intent-scheduler-result-schema', item.resultSchemaRef);
    add('intent-scheduler-executor', item.executorRef);
  }
  if (schedulerRegistry?.simulationContract?.contractRef) add('intent-scheduler-simulation-contract', schedulerRegistry.simulationContract.contractRef);
  for (const item of schedulerRegistry?.projectionIdentities ?? []) add('intent-scheduler-projection', item.projectionRef);
  return refs;
}

export function visibleStringRefs(blueprint, experience = null) {
  const refs = new Set([blueprint.product.displayNameStringRef]);
  for (const role of blueprint.roles) refs.add(role.labelStringRef);
  for (const screen of blueprint.screens) {
    refs.add(screen.titleStringRef);
    for (const region of screen.regions) {
      refs.add(region.labelStringRef);
      for (const element of region.elements) refs.add(element.labelStringRef);
    }
  }
  for (const node of blueprint.terrain) refs.add(node.labelStringRef);
  for (const profile of experience?.experienceProfiles ?? []) refs.add(profile.labelStringRef);
  for (const gesture of experience?.gestureContracts ?? []) refs.add(gesture.helpStringRef);
  for (const vessel of experience?.vessels ?? []) refs.add(vessel.labelStringRef);
  return [...refs].sort();
}

function validateModuleRegistry(bundle, errors) {
  const modules = bundle.modules?.modules ?? [];
  const moduleRefs = new Set();
  const paths = new Set();
  for (const module of modules) {
    if (!module.moduleRef) errors.push('module missing moduleRef');
    if (moduleRefs.has(module.moduleRef)) errors.push(`duplicate moduleRef ${module.moduleRef}`);
    moduleRefs.add(module.moduleRef);
    if (!module.path) errors.push(`${module.moduleRef} missing path`);
    if (paths.has(module.path)) errors.push(`duplicate module path ${module.path}`);
    paths.add(module.path);
    if (bundle.root && module.path && !fs.existsSync(path.join(bundle.root, module.path))) errors.push(`${module.moduleRef} path does not exist: ${module.path}`);
    if (bundle.root) for (const testPath of module.tests ?? []) if (!fs.existsSync(path.join(bundle.root, testPath))) errors.push(`${module.moduleRef} test path does not exist: ${testPath}`);
    if (!module.role) errors.push(`${module.moduleRef} missing role`);
  }
  if (!modules.length) errors.push('module registry is empty');
}

export function validateBlueprint(bundle) {
  const { blueprint, tokens, platforms, strings, factory } = bundle;
  const errors = [];
  const refs = collectRefs(bundle);
  const seen = new Map();
  for (const item of refs) {
    if (!item.ref) errors.push(`missing ${item.kind} ref`);
    if (seen.has(item.ref)) errors.push(`duplicate ref ${item.ref} (${seen.get(item.ref)} and ${item.kind})`);
    seen.set(item.ref, item.kind);
  }

  const stateRefs = new Set(blueprint.stateDomains.map((item) => item.stateRef));
  const permissionRefs = new Set(blueprint.permissions.map((item) => item.permissionRef));
  const actionRefs = new Set(blueprint.actions.map((item) => item.actionRef));
  const testRefs = new Set(blueprint.tests.map((item) => item.testRef));
  const terrainRefs = new Set(blueprint.terrain.map((item) => item.terrainNodeRef));
  const roleRefs = new Set(blueprint.roles.map((item) => item.roleRef));
  const platformRefs = new Set(blueprint.platforms.map((item) => item.platformRef));
  for (const capability of bundle.capabilities?.capabilities ?? []) {
    if (!capability.capabilityRef || !capability.purpose) errors.push('capability missing ref or purpose');
    if (!permissionRefs.has(capability.permissionRef)) errors.push(`${capability.capabilityRef} references missing permission ${capability.permissionRef}`);
    for (const actionRef of capability.actionRefs ?? []) if (!actionRefs.has(actionRef)) errors.push(`${capability.capabilityRef} references missing action ${actionRef}`);
    for (const roleRef of capability.roleRefs ?? []) if (!roleRefs.has(roleRef)) errors.push(`${capability.capabilityRef} references missing role ${roleRef}`);
    for (const platformRef of capability.platformRefs ?? []) if (!platformRefs.has(platformRef)) errors.push(`${capability.capabilityRef} references missing platform ${platformRef}`);
  }

  for (const component of blueprint.components ?? []) {
    if (!component.instanceRefPattern?.includes('{')) errors.push(`${component.componentRef} missing instance placeholder`);
    for (const slot of component.slots ?? []) if (slot.actionRef && !actionRefs.has(slot.actionRef)) errors.push(`${slot.slotRef} references missing action ${slot.actionRef}`);
  }
  for (const action of blueprint.actions) {
    if (!permissionRefs.has(action.permissionRef)) errors.push(`${action.actionRef} references missing permission ${action.permissionRef}`);
    for (const stateRef of action.outputStateRefs ?? []) if (!stateRefs.has(stateRef)) errors.push(`${action.actionRef} updates missing state ${stateRef}`);
    if (!action.effectClass) errors.push(`${action.actionRef} missing effectClass`);
  }
  for (const role of blueprint.roles) {
    for (const target of role.mayReachRoleRefs ?? []) if (!roleRefs.has(target)) errors.push(`${role.roleRef} reaches missing role ${target}`);
  }
  for (const screen of blueprint.screens) {
    if (!screen.conceptRef || !screen.navigationNodeRef) errors.push(`${screen.screenRef} missing concept or navigation node`);
    for (const region of screen.regions) {
      if (!region.conceptRef || !region.navigationNodeRef) errors.push(`${region.regionRef} missing concept or navigation node`);
      for (const element of region.elements) {
        if (!element.conceptRef || !element.interactionRef || !element.journeyEventTypeRef) errors.push(`${element.elementRef} missing identity/interaction/journey contract`);
        if (element.actionRef && !actionRefs.has(element.actionRef)) errors.push(`${element.elementRef} references missing action ${element.actionRef}`);
        if (element.permissionRef && !permissionRefs.has(element.permissionRef)) errors.push(`${element.elementRef} references missing permission ${element.permissionRef}`);
        if (element.terrainNodeRef && !terrainRefs.has(element.terrainNodeRef)) errors.push(`${element.elementRef} references missing Terrain node ${element.terrainNodeRef}`);
        for (const testRef of element.testRefs ?? []) if (!testRefs.has(testRef)) errors.push(`${element.elementRef} references missing test ${testRef}`);
        if (element.actionRef && !element.accessibility?.stableIdentifierRef) errors.push(`${element.elementRef} missing accessibility stable identifier`);
        if (element.accessibility?.minimumTargetPx < 44) errors.push(`${element.elementRef} target size below 44px`);
      }
    }
    for (const testRef of screen.testRefs ?? []) if (!testRefs.has(testRef)) errors.push(`${screen.screenRef} references missing test ${testRef}`);
  }
  for (const node of blueprint.terrain) if (node.parentRef && !terrainRefs.has(node.parentRef)) errors.push(`${node.terrainNodeRef} has missing parent ${node.parentRef}`);

  const requiredStrings = visibleStringRefs(blueprint, bundle.experience);
  for (const language of blueprint.product.requiredLanguages) {
    if (!strings[language]) {
      errors.push(`missing required language catalog ${language}`);
      continue;
    }
    for (const ref of requiredStrings) if (!(ref in strings[language])) errors.push(`${language} missing string ${ref}`);
  }

  if ((tokens.typography?.basePx ?? 0) < 16) errors.push('design token typography.basePx must be at least 16');
  if ((tokens.typography?.nodeTitlePx ?? 0) < 20) errors.push('terrain node title must be at least 20px');
  if ((tokens.accessibility?.minimumTargetPx ?? 0) < 44) errors.push('minimum target must be at least 44px');
  const registeredPlatformIds = new Set(platforms.platforms.map((item) => item.id));
  for (const platform of blueprint.platforms) if (!registeredPlatformIds.has(platform.generatorId)) errors.push(`missing platform generator ${platform.generatorId}`);

  for (const process of factory.processes ?? []) for (const testRef of process.testRefs ?? []) if (!testRefs.has(testRef)) errors.push(`${process.processRef} references missing test ${testRef}`);
  for (const work of bundle.implementationPlan?.workUnits ?? []) for (const testRef of work.requiredTestRefs ?? []) if (!testRefs.has(testRef)) errors.push(`${work.workRef} references missing test ${testRef}`);
  const factoryValidation = validateProcessFactory(factory);
  errors.push(...factoryValidation.errors.map((error) => `process factory: ${error}`));
  const planValidation = validateImplementationPlan(bundle.implementationPlan);
  errors.push(...planValidation.errors.map((error) => `implementation plan: ${error}`));
  const stringRefs = new Set(Object.keys(strings[blueprint.product.defaultLanguage] ?? {}));
  const experienceValidation = validateExperienceRegistry(bundle.experience, { actionRefs, componentRefs: new Set((blueprint.components ?? []).map((item) => item.componentRef)), stringRefs });
  errors.push(...experienceValidation.errors.map((error) => `experience registry: ${error}`));
  validateModuleRegistry(bundle, errors);
  const lensValidation = validateReviewLensRegistry(bundle.reviewLenses);
  errors.push(...lensValidation.errors.map((error) => `review lens registry: ${error}`));
  const featureValidation = validateFeatureRegistry(bundle.featureRegistry, bundle);
  errors.push(...featureValidation.errors.map((error) => `feature registry: ${error}`));
  const healthValidation = validateBuildHealthRegistry(bundle.buildHealth, bundle.reviewLenses);
  errors.push(...healthValidation.errors.map((error) => `build health registry: ${error}`));
  const bridgeValidation = validateHomeBridgeRegistry(bundle.bridge, { testRefs });
  errors.push(...bridgeValidation.errors.map((error) => `home bridge registry: ${error}`));
  if (!blueprint.intentOrchestration) errors.push('universal blueprint missing intentOrchestration composition');
  else if (semanticHash(blueprint.intentOrchestration) !== semanticHash(bundle.intentRegistry)) {
    errors.push('universal blueprint intentOrchestration composition does not match loaded intent registry');
  }
  const intentValidation = validateIntentRegistry(bundle.intentRegistry);
  errors.push(...intentValidation.errors.map((error) => `intent registry: ${error}`));
  if (!blueprint.intentScheduler) errors.push('universal blueprint missing intentScheduler composition');
  else if (!bundle.schedulerRegistry) errors.push('loaded bundle missing canonical intent scheduler registry');
  else if (semanticHash(blueprint.intentScheduler) !== semanticHash(bundle.schedulerRegistry)) {
    errors.push('universal blueprint intentScheduler composition does not match loaded scheduler registry');
  }
  const schedulerValidation = validateIntentSchedulerRegistry(bundle.schedulerRegistry);
  errors.push(...schedulerValidation.errors.map((error) => `intent scheduler registry: ${error}`));
  const processRefs = new Set(factory.processes.map((item) => item.processRef));
  const moduleRefs = new Set((bundle.modules?.modules ?? []).map((item) => item.moduleRef));
  for (const processRef of bundle.schedulerRegistry?.processRefs ?? []) {
    if (!processRefs.has(processRef)) errors.push(`intent scheduler registry references missing process ${processRef}`);
  }
  for (const testRef of bundle.schedulerRegistry?.testRefs ?? []) {
    if (!testRefs.has(testRef)) errors.push(`intent scheduler registry references missing test ${testRef}`);
  }
  for (const moduleRef of [
    'module.vexlife.core.scheduler-runtime-trust',
    'module.vexlife.core.resource-admission',
    'module.vexlife.core.context-lease',
    'module.vexlife.core.intent-checkpoint',
    'module.vexlife.core.tool-result-relay',
    'module.vexlife.core.intent-scheduler'
  ]) {
    if (!moduleRefs.has(moduleRef)) errors.push(`intent scheduler registry requires missing module ${moduleRef}`);
  }

  let registryStats = null;
  try {
    const registry = compileRegistryPack(bundle);
    registryStats = { entries: registry.entries.size };
  } catch (error) {
    errors.push(`registry compilation failed: ${error.message}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    stats: {
      refs: refs.length,
      screens: blueprint.screens.length,
      elements: blueprint.screens.flatMap((screen) => screen.regions.flatMap((region) => region.elements)).length,
      strings: requiredStrings.length,
      languages: blueprint.product.requiredLanguages.length,
      platforms: blueprint.platforms.length,
      processes: factoryValidation.stats.processes,
      modules: bundle.modules?.modules?.length ?? 0,
      milestones: planValidation.stats.milestones,
      workUnits: planValidation.stats.workUnits,
      dreamCandidateTypes: bundle.evolution?.candidateTypes?.length ?? 0,
      capabilities: bundle.capabilities?.capabilities?.length ?? 0,
      reviewLenses: lensValidation.stats.lenses,
      features: featureValidation.stats.features,
      healthChecks: healthValidation.stats.checks,
      bridgeModes: bridgeValidation.stats.modes,
      schedulerOwnedRefs: schedulerValidation.stats.ownedRefs,
      registryEntries: registryStats?.entries ?? 0
    },
    semanticHash: semanticHash({
      blueprint,
      tokens,
      platforms,
      strings,
      factory,
      modules: bundle.modules,
      experience: bundle.experience,
      evolution: bundle.evolution,
      implementationPlan: bundle.implementationPlan,
      capabilities: bundle.capabilities,
      reviewLenses: bundle.reviewLenses,
      featureRegistry: bundle.featureRegistry,
      buildHealth: bundle.buildHealth,
      bridge: bundle.bridge,
      intentRegistry: bundle.intentRegistry,
      schedulerRegistry: bundle.schedulerRegistry
    })
  };
}

export function buildIdentityIndex(blueprintOrBundle) {
  const bundle = blueprintOrBundle.blueprint ? blueprintOrBundle : {
    blueprint: blueprintOrBundle, strings: { [blueprintOrBundle.product.defaultLanguage]: {} },
    factory: { foundations: [], processes: [], templates: [], workedExamples: [] }, modules: { modules: [] },
    experience: { experienceProfiles: [], gestureContracts: [], vessels: [] }, evolution: { candidateTypes: [] }, implementationPlan: { milestones: [], workUnits: [] }, capabilities: { capabilities: [] }, reviewLenses: { lenses: [] }, featureRegistry: { features: [] }, buildHealth: { checks: [] }, bridge: {}, intentRegistry: blueprintOrBundle.intentOrchestration ?? null, schedulerRegistry: blueprintOrBundle.intentScheduler ?? null
  };
  return [...compileRegistryPack(bundle).entries.values()].map((entry) => ({
    ref: entry.ref,
    kind: entry.kind,
    brief: entry.brief,
    stateHash: entry.stateHash,
    edges: entry.edges ?? []
  }));
}

// [VXG RealForever]
