import { Atlas } from './atlas.mjs';
import { ProcessFactory } from './process-factory.mjs';
import { semanticHash } from './utils.mjs';

const REQUIRED_PLUGIN_FIELDS = Object.freeze([
  'pluginRef',
  'pluginVersion',
  'ownershipClass',
  'pluginClass',
  'processRef',
  'implementationModuleRef',
  'stepRefs',
  'foundationVersionBindings',
  'inputTemplateRefs',
  'outputTemplateRefs',
  'allowedEffects',
  'testPaths',
  'recoveryRule'
]);

function refMap(items, field) {
  return new Map((items ?? []).map((item) => [item[field], item]));
}

function sameSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

export function validateProviderProcessAdapterRegistry(registry, bundle) {
  const errors = [];
  if (registry?.schemaVersion !== 'vexlife.provider-process-adapter-registry/v1') {
    errors.push('provider/process adapter registry schemaVersion must be vexlife.provider-process-adapter-registry/v1');
  }
  if (!registry?.registryRef) errors.push('provider/process adapter registry missing registryRef');
  if (!Number.isInteger(registry?.registryVersion) || registry.registryVersion < 1) {
    errors.push('provider/process adapter registry version must be a positive integer');
  }
  if (registry?.ownershipClass !== 'VEXLIFE_REPOSITORY_LOCAL') {
    errors.push('provider/process adapter registry must be VEXLIFE_REPOSITORY_LOCAL');
  }
  const sharedBinding = registry?.sharedContractBinding;
  if (sharedBinding?.state !== 'PENDING_SHARED_CONVERGENCE' ||
      sharedBinding?.canonicalProviderPluginSchemaRef !== null ||
      sharedBinding?.canonicalProviderPluginApiRef !== null ||
      sharedBinding?.mayClaimUniversalCore !== false ||
      !sharedBinding?.candidateSetRef) {
    errors.push('shared provider/plugin binding must remain explicitly unresolved and non-canonical');
  }
  if (registry?.runtimeEvidencePolicy?.packageContainedEvidenceRequired !== true) {
    errors.push('provider/process adapter registry must require package-contained evidence');
  }
  if (registry?.runtimeEvidencePolicy?.historicalGitHubCommentScraping !== false) {
    errors.push('historical GitHub comment scraping must be disabled');
  }

  const processes = refMap(bundle?.factory?.processes, 'processRef');
  const foundations = refMap(bundle?.factory?.foundations, 'foundationRef');
  const templates = refMap(bundle?.factory?.templates, 'templateRef');
  const modules = refMap(bundle?.modules?.modules, 'moduleRef');
  const pluginRefs = new Set();
  const processBindings = new Set();

  for (const plugin of registry?.plugins ?? []) {
    for (const field of REQUIRED_PLUGIN_FIELDS) {
      const value = plugin?.[field];
      if (value === undefined || value === null || value === '') {
        errors.push(`${plugin?.pluginRef ?? 'plugin'} missing ${field}`);
      }
    }
    if (plugin.ownershipClass !== 'VEXLIFE_PROVIDER_LOCAL') {
      errors.push(`${plugin.pluginRef} is not a VexLife-local provider/process instance`);
    }
    if (pluginRefs.has(plugin.pluginRef)) errors.push(`duplicate plugin ${plugin.pluginRef}`);
    pluginRefs.add(plugin.pluginRef);
    if (processBindings.has(plugin.processRef)) errors.push(`multiple local plugins bind process ${plugin.processRef}`);
    processBindings.add(plugin.processRef);

    const process = processes.get(plugin.processRef);
    if (!process) {
      errors.push(`${plugin.pluginRef} references missing process ${plugin.processRef}`);
      continue;
    }
    if (process.ownershipClass !== 'VEXLIFE_PRODUCT_PROCESS') {
      errors.push(`${plugin.pluginRef} references a process that is not VEXLIFE_PRODUCT_PROCESS`);
    }
    if (!modules.has(plugin.implementationModuleRef)) {
      errors.push(`${plugin.pluginRef} references missing module ${plugin.implementationModuleRef}`);
    }
    if (JSON.stringify(plugin.stepRefs) !== JSON.stringify(process.steps ?? [])) {
      errors.push(`${plugin.pluginRef} stepRefs do not exactly bind ${plugin.processRef}`);
    }
    const dependencyRefs = process.foundationDependencies ?? [];
    const boundRefs = Object.keys(plugin.foundationVersionBindings ?? {});
    if (!sameSet(dependencyRefs, boundRefs)) {
      errors.push(`${plugin.pluginRef} foundation bindings do not exactly cover ${plugin.processRef}`);
    }
    for (const ref of boundRefs) {
      const foundation = foundations.get(ref);
      if (!foundation) errors.push(`${plugin.pluginRef} references missing foundation ${ref}`);
      else if (foundation.foundationVersion !== plugin.foundationVersionBindings[ref]) {
        errors.push(`${plugin.pluginRef} binds stale foundation ${ref}`);
      }
    }
    for (const ref of [...(plugin.inputTemplateRefs ?? []), ...(plugin.outputTemplateRefs ?? [])]) {
      const template = templates.get(ref);
      if (!template) errors.push(`${plugin.pluginRef} references missing template ${ref}`);
      else if (!Array.isArray(template.requiredFields) || template.requiredFields.length === 0) {
        errors.push(`${plugin.pluginRef} template ${ref} is not typed`);
      }
    }
    if (JSON.stringify(plugin.outputTemplateRefs ?? []) !== JSON.stringify(process.outputTemplateRefs ?? [])) {
      errors.push(`${plugin.pluginRef} outputTemplateRefs do not exactly bind ${plugin.processRef}`);
    }
    const requestedEffects = process.authorityEnvelope?.effects ?? [];
    const allowedEffects = plugin.allowedEffects ?? [];
    for (const effect of requestedEffects) {
      if (!allowedEffects.includes(effect)) errors.push(`${plugin.pluginRef} does not allow process effect ${effect}`);
    }
  }

  if (!(registry?.plugins ?? []).length) errors.push('provider/process adapter registry is empty');
  return {
    ok: errors.length === 0,
    errors,
    stats: {
      localPlugins: pluginRefs.size,
      localProcessesBound: processBindings.size,
      sharedBindingState: sharedBinding?.state ?? null
    },
    semanticHash: semanticHash(registry)
  };
}

export function buildProviderProcessAtlasNodes(registry) {
  const nodes = [{
    ref: registry.registryRef,
    kind: 'VEXLIFE_PROVIDER_PROCESS_ADAPTER_REGISTRY',
    brief: registry.purpose,
    edges: [
      ...(registry.plugins ?? []).map((plugin) => ({ type: 'LOCAL_PLUGIN', to: plugin.pluginRef })),
      { type: 'UPSTREAM_CANDIDATE_SET', to: registry.sharedContractBinding.candidateSetRef }
    ]
  }];
  for (const plugin of registry.plugins ?? []) {
    nodes.push({
      ref: plugin.pluginRef,
      kind: 'VEXLIFE_PROVIDER_PROCESS_ADAPTER',
      brief: `${plugin.pluginClass} -> ${plugin.processRef}`,
      edges: [
        { type: 'PARENT', to: registry.registryRef },
        { type: 'IMPLEMENTS_LOCAL_PROCESS', to: plugin.processRef },
        { type: 'IMPLEMENTED_BY', to: plugin.implementationModuleRef },
        ...Object.keys(plugin.foundationVersionBindings ?? {}).map((to) => ({ type: 'FOUNDATION', to })),
        ...(plugin.inputTemplateRefs ?? []).map((to) => ({ type: 'INPUT_TEMPLATE', to })),
        ...(plugin.outputTemplateRefs ?? []).map((to) => ({ type: 'OUTPUT_TEMPLATE', to }))
      ]
    });
  }
  return nodes;
}

export function buildProviderProcessAtlas(baseNodes, registry) {
  return new Atlas([...baseNodes, ...buildProviderProcessAtlasNodes(registry)]);
}

export function resolveProviderProcessBundle({ pluginRef, registry, bundle }) {
  const validation = validateProviderProcessAdapterRegistry(registry, bundle);
  if (!validation.ok) return { state: 'BLOCKED_PROVIDER_PROCESS_ADAPTER_REGISTRY', errors: validation.errors };
  const plugin = (registry.plugins ?? []).find((item) => item.pluginRef === pluginRef);
  if (!plugin) return { state: 'BLOCKED_LOCAL_PLUGIN_NOT_FOUND', pluginRef };
  const process = bundle.factory.processes.find((item) => item.processRef === plugin.processRef);
  const module = bundle.modules.modules.find((item) => item.moduleRef === plugin.implementationModuleRef);
  const templates = new Map(bundle.factory.templates.map((item) => [item.templateRef, item]));
  const foundations = new Map(bundle.factory.foundations.map((item) => [item.foundationRef, item]));
  const resolved = {
    plugin,
    process,
    module,
    inputTemplates: plugin.inputTemplateRefs.map((ref) => templates.get(ref)),
    outputTemplates: plugin.outputTemplateRefs.map((ref) => templates.get(ref)),
    foundations: Object.keys(plugin.foundationVersionBindings).map((ref) => foundations.get(ref)),
    sharedContractBinding: registry.sharedContractBinding
  };
  return { state: 'PROVIDER_PROCESS_BUNDLE_RESOLVED', bundle: resolved, bundleHash: semanticHash(resolved) };
}

export function compileProviderProcess({
  pluginRef,
  registry,
  bundle,
  inputs = {},
  sourceRefs = {},
  currentFoundationVersions = {},
  authority = {},
  resourceBudget = {},
  recipientRef = null,
  now = new Date().toISOString()
}) {
  const resolution = resolveProviderProcessBundle({ pluginRef, registry, bundle });
  if (resolution.state !== 'PROVIDER_PROCESS_BUNDLE_RESOLVED') return resolution;
  const factory = new ProcessFactory(bundle.factory);
  const compiled = factory.compile({
    processRef: resolution.bundle.process.processRef,
    inputs,
    sourceRefs,
    currentFoundationVersions,
    authority,
    resourceBudget,
    recipientRef,
    now
  });
  if (compiled.state !== 'PLAN_READY_NO_EFFECT') {
    return { ...compiled, pluginRef, pluginVersion: resolution.bundle.plugin.pluginVersion };
  }

  const compatibility = {
    pluginRef,
    pluginVersion: resolution.bundle.plugin.pluginVersion,
    processRef: resolution.bundle.process.processRef,
    processVersion: resolution.bundle.process.processVersion,
    implementationModuleRef: resolution.bundle.module.moduleRef,
    foundationRefs: compiled.plan.foundationRefs,
    inputTemplateRefs: [...resolution.bundle.plugin.inputTemplateRefs],
    outputTemplateRefs: [...resolution.bundle.plugin.outputTemplateRefs],
    authorityEnvelope: compiled.plan.authorityEnvelope,
    sharedContractBinding: structuredClone(resolution.bundle.sharedContractBinding),
    bundleHash: resolution.bundleHash
  };
  const planCore = { ...compiled.plan, ...compatibility };
  return {
    state: 'VEXLIFE_PROVIDER_PROCESS_PLAN_READY_NO_EFFECT',
    plan: { ...planCore, planHash: semanticHash(planCore) }
  };
}

export function renderProviderProcessReceipt(plan, {
  instanceRef,
  occupancyRef,
  providerBindingRef,
  threadRef,
  consumedPacketHash,
  disposition = 'ROOT_PACKET_COMPILED',
  now = new Date().toISOString()
}) {
  const receipt = {
    instanceRef,
    occupancyRef,
    providerBindingRef,
    threadRef,
    consumedPacketHash,
    pluginRef: plan.pluginRef,
    processRef: plan.processRef,
    planHash: plan.planHash,
    sharedContractBindingState: plan.sharedContractBinding?.state ?? null,
    disposition,
    formedAt: now
  };
  const missing = ['instanceRef', 'occupancyRef', 'providerBindingRef', 'threadRef', 'consumedPacketHash']
    .filter((field) => !receipt[field]);
  if (missing.length) return { state: 'BLOCKED_RECEIPT_MISSING_INPUT', missingFields: missing };
  return { state: 'VEXLIFE_PROVIDER_PROCESS_RECEIPT_READY', receipt: { ...receipt, receiptHash: semanticHash(receipt) } };
}

// [VXG RealForever]
