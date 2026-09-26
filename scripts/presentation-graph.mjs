#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { readJson, semanticHash, writeJson } from '../src/core/utils.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const REGISTRY_PATH = 'blueprint/presentation-graph-registry.json';
const REACHABILITY = new Set(['NOT_REGISTERED','REGISTERED_UNPLACED','PLACED_UNAVAILABLE','REACHABLE_VIA_SECONDARY_PATH','CURRENTLY_RENDERED','CURRENTLY_EXECUTABLE']);
const WITNESS = new Set(['PASS','FAIL','HELD','UNKNOWN']);

const req = (v, label) => {
  if (typeof v !== 'string' || !v) throw new Error(`${label} must be a non-empty string`);
  return v;
};
const clone = (v) => structuredClone(v);
const nameOf = (ref) => String(ref).split('.')
  .filter((p) => p && !['vexlife','element','screen','region','component','action'].includes(p))
  .flatMap((p) => p.split(/[-_]+/u))
  .map((p) => p ? p[0].toUpperCase() + p.slice(1) : '')
  .join(' ');
const typed = (prefix, ref) => `${prefix}.${nameOf(ref).replace(/\s+/gu, '') || 'Unknown'}`;

function unique(items, field, label) {
  const seen = new Set();
  for (const item of items ?? []) {
    const ref = req(item?.[field], `${label}.${field}`);
    if (seen.has(ref)) throw new Error(`${label} duplicate ${field} ${ref}`);
    seen.add(ref);
  }
  return seen;
}

function validateRegistry(registry) {
  if (registry?.schemaVersion !== 'vexlife.presentation-graph-registry/v1') throw new Error('unexpected Presentation Graph registry schema');
  if (registry.effects !== false) throw new Error('Presentation Graph registry must remain effect-free');
  if (registry.canonicalSource?.path !== REGISTRY_PATH) throw new Error(`canonical source path must remain ${REGISTRY_PATH}`);
  if (registry.identityPolicy?.canonicalElementIdentityField !== 'elementRef') throw new Error('elementRef must remain canonical element identity');
  if (registry.runtimeObservationPolicy?.rawPointerLogging !== false) throw new Error('raw pointer logging must remain false');
  if (!registry.nonCollapseRules?.includes('PRESENTATION_GRAPH != SEMANTIC_OWNER')) throw new Error('semantic-owner separation is required');
  unique(registry.presentationNodes, 'presentationRef', 'presentationNodes');
  unique(registry.placements, 'placementRef', 'placements');
  unique(registry.reachabilityPaths, 'reachabilityRef', 'reachabilityPaths');
  unique(registry.testObligations, 'obligationRef', 'testObligations');
  unique(registry.behaviorWitnesses, 'witnessRef', 'behaviorWitnesses');
  const parents = new Map((registry.presentationNodes ?? []).map((n) => [n.presentationRef, n.parentPresentationRefOrNull ?? null]));
  for (const start of parents.keys()) {
    const visited = new Set();
    for (let cur = start; cur; cur = parents.get(cur) ?? null) {
      if (visited.has(cur)) throw new Error(`presentation placement cycle includes ${cur}`);
      visited.add(cur);
    }
  }
  return registry;
}

export function loadPresentationRegistry(root = ROOT) {
  return validateRegistry(readJson(path.join(root, REGISTRY_PATH)));
}

function maps(bundle) {
  const screens = new Map(), regions = new Map(), elements = new Map();
  for (const screen of bundle.blueprint.screens ?? []) {
    screens.set(screen.screenRef, screen);
    for (const region of screen.regions ?? []) {
      regions.set(region.regionRef, { ...region, screenRef: screen.screenRef });
      for (const element of region.elements ?? []) elements.set(element.elementRef, { ...element, screenRef: screen.screenRef, regionRef: region.regionRef });
    }
  }
  return {
    screens, regions, elements,
    actions: new Map((bundle.blueprint.actions ?? []).map((x) => [x.actionRef, x])),
    permissions: new Map((bundle.blueprint.permissions ?? []).map((x) => [x.permissionRef, x])),
    components: new Map((bundle.blueprint.components ?? []).map((x) => [x.componentRef, x])),
    tests: new Set((bundle.blueprint.tests ?? []).map((x) => x.testRef))
  };
}

function featureRefs(bundle, refs) {
  const wanted = new Set(refs.filter(Boolean));
  return (bundle.featureRegistry?.features ?? [])
    .filter((f) => (f.canonicalNodeRefs ?? []).some((r) => wanted.has(r)))
    .map((f) => f.featureRef).sort();
}

function validateExtensions(bundle, registry, m) {
  const nodes = new Set((registry.presentationNodes ?? []).map((n) => n.presentationRef));
  const slots = new Map((bundle.blueprint.components ?? []).map((c) => [c.componentRef, new Set((c.slots ?? []).map((s) => s.slotRef))]));
  for (const p of registry.placements ?? []) {
    if (!m.screens.has(p.screenRef)) throw new Error(`${p.placementRef} references missing screen ${p.screenRef}`);
    if (p.elementRefOrNull && !m.elements.has(p.elementRefOrNull)) throw new Error(`${p.placementRef} references missing element ${p.elementRefOrNull}`);
    if (p.parentPresentationRefOrNull && !nodes.has(p.parentPresentationRefOrNull)) throw new Error(`${p.placementRef} references missing presentation parent ${p.parentPresentationRefOrNull}`);
    if (p.componentRefOrNull && !m.components.has(p.componentRefOrNull)) throw new Error(`${p.placementRef} references missing component ${p.componentRefOrNull}`);
    if (p.slotRefOrNull && !p.componentRefOrNull) throw new Error(`${p.placementRef} cannot bind slot without component`);
    if (p.slotRefOrNull && !slots.get(p.componentRefOrNull)?.has(p.slotRefOrNull)) throw new Error(`${p.placementRef} references invalid slot ${p.slotRefOrNull}`);
  }
  const known = (r) => m.elements.has(r) || m.screens.has(r) || nodes.has(r);
  for (const r of registry.reachabilityPaths ?? []) {
    if (!REACHABILITY.has(r.state)) throw new Error(`${r.reachabilityRef} has unsupported state ${r.state}`);
    if (!known(r.targetRef)) throw new Error(`${r.reachabilityRef} target is unknown: ${r.targetRef}`);
    if (!Array.isArray(r.steps) || !r.steps.length) throw new Error(`${r.reachabilityRef} steps must be non-empty`);
    const seen = new Set();
    for (const step of r.steps) {
      if (!known(step)) throw new Error(`${r.reachabilityRef} step is unknown: ${step}`);
      if (seen.has(step)) throw new Error(`${r.reachabilityRef} contains a reachability cycle at ${step}`);
      seen.add(step);
    }
  }
  const obligationRefs = new Set();
  for (const o of registry.testObligations ?? []) {
    const targetKnown = m.elements.has(o.targetRef) || m.screens.has(o.targetRef) || m.components.has(o.targetRef) || nodes.has(o.targetRef);
    if (!targetKnown) throw new Error(`${o.obligationRef} target is unknown: ${o.targetRef}`);
    if (!Array.isArray(o.requires) || !o.requires.length || new Set(o.requires).size !== o.requires.length) throw new Error(`${o.obligationRef} requires must be unique and non-empty`);
    obligationRefs.add(o.obligationRef);
  }
  for (const w of registry.behaviorWitnesses ?? []) {
    if (!obligationRefs.has(w.obligationRef)) throw new Error(`${w.witnessRef} references missing obligation ${w.obligationRef}`);
    if (!WITNESS.has(w.state)) throw new Error(`${w.witnessRef} has unsupported state ${w.state}`);
    if (w.testRefOrNull && !m.tests.has(w.testRefOrNull)) throw new Error(`${w.witnessRef} references missing test ${w.testRefOrNull}`);
  }
}

export function compilePresentationGraph(bundle, registry = loadPresentationRegistry(bundle.root ?? ROOT)) {
  validateRegistry(registry);
  const m = maps(bundle);
  validateExtensions(bundle, registry, m);

  const screens = [...m.screens.values()].map((s) => ({
    screenRef: s.screenRef,
    typedRef: typed(registry.identityPolicy.typedScreenProjectionPrefix, s.screenRef),
    semanticName: nameOf(s.screenRef),
    titleStringRef: s.titleStringRef,
    routeRef: s.routeRef,
    conceptRef: s.conceptRef,
    featureRefs: featureRefs(bundle, [s.screenRef, s.conceptRef]),
    regionRefs: (s.regions ?? []).map((r) => r.regionRef)
  }));
  const elements = [...m.elements.values()].map((e) => {
    const action = e.actionRef ? m.actions.get(e.actionRef) ?? null : null;
    if (e.actionRef && !action) throw new Error(`${e.elementRef} references missing action ${e.actionRef}`);
    const resolvedPermissionRef = e.permissionRef ?? action?.permissionRef ?? null;
    if (e.actionRef && !resolvedPermissionRef) throw new Error(`${e.elementRef} is action-bearing without permission binding`);
    if (resolvedPermissionRef && !m.permissions.has(resolvedPermissionRef)) {
      throw new Error(`${e.elementRef} references missing permission ${resolvedPermissionRef}`);
    }
    return {
      elementRef: e.elementRef,
      typedRef: typed(registry.identityPolicy.typedElementProjectionPrefix, e.elementRef),
      semanticName: nameOf(e.elementRef),
      labelStringRef: e.labelStringRef,
      owningScreenRef: e.screenRef,
      regionRef: e.regionRef,
      conceptRef: e.conceptRef,
      elementKind: e.kind,
      actionRef: e.actionRef ?? null,
      interactionRef: e.interactionRef ?? null,
      permissionRef: resolvedPermissionRef,
      elementPermissionRefOrNull: e.permissionRef ?? null,
      permissionBindingSource: e.permissionRef ? 'ELEMENT' : (action?.permissionRef ? 'ACTION' : null),
      navigationRef: e.navigationRef ?? null,
      journeyEventTypeRef: e.journeyEventTypeRef ?? null,
      featureRefs: featureRefs(bundle, [e.screenRef,e.regionRef,e.elementRef,e.conceptRef]),
      accessibilityContract: clone(e.accessibility ?? {}),
      testRefs: [...(e.testRefs ?? [])]
    };
  });
  for (const [label, rows] of [['typed element', elements],['typed screen', screens]]) {
    const seen = new Set();
    for (const row of rows) {
      if (seen.has(row.typedRef)) throw new Error(`${label} projection collision: ${row.typedRef}`);
      seen.add(row.typedRef);
    }
  }

  const nav = bundle.blueprint.navigationContinuity ?? {};
  const graphRevision = semanticHash({
    registryVersion: registry.registryVersion,
    presentationNodes: registry.presentationNodes,
    placements: registry.placements,
    reachabilityPaths: registry.reachabilityPaths,
    testObligations: registry.testObligations,
    behaviorWitnesses: registry.behaviorWitnesses,
    screens, elements,
    navigationRegistryRef: nav.registryRef ?? null,
    navigationContracts: nav.contracts ?? null,
    motionPolicyRefs: (nav.motionPolicies ?? []).map((x) => x.motionPolicyRef),
    blueprintRef: bundle.blueprint.blueprintRef,
    blueprintVersion: bundle.blueprint.version
  });

  return {
    graphRevision,
    uiIdentityRegistry: {
      schemaVersion: 'vexlife.ui-identity-registry/v1',
      registryRef: 'registry.vexlife.ui-identity.generated.001',
      sourceRegistryRef: registry.registryRef,
      canonicalElementIdentityField: 'elementRef',
      canonicalScreenIdentityField: 'screenRef',
      graphRevision,
      screens, elements,
      components: (bundle.blueprint.components ?? []).map((c) => ({
        componentRef: c.componentRef, semanticName: nameOf(c.componentRef), purpose: c.purpose,
        slotRefs: (c.slots ?? []).map((s) => s.slotRef)
      }))
    },
    presentationGraph: {
      schemaVersion: 'vexlife.presentation-graph/v1',
      graphRef: 'graph.vexlife.presentation.generated.001',
      sourceRegistryRef: registry.registryRef,
      graphRevision,
      semanticAuthority: false,
      presentationNodes: clone(registry.presentationNodes ?? []),
      placements: clone(registry.placements ?? [])
    },
    navigationProjection: {
      schemaVersion: 'vexlife.presentation-navigation-projection/v1',
      graphRevision,
      canonicalOwnerRegistryRef: nav.registryRef ?? null,
      contractRefs: clone(nav.contracts ?? {}),
      defaultPreferenceRefs: clone(nav.defaultPreferenceRefs ?? {}),
      currentContextAuthority: 'CANONICAL_NAVIGATION',
      journeyAuthority: 'CANONICAL_JOURNEY'
    },
    reachabilityGraph: {
      schemaVersion: 'vexlife.reachability-graph/v1',
      graphRevision,
      states: [...(registry.reachabilityStates ?? [])],
      paths: clone(registry.reachabilityPaths ?? [])
    },
    presentationStateManifest: {
      schemaVersion: 'vexlife.presentation-state-manifest/v1',
      graphRevision,
      coordinateSpaces: [...(registry.coordinateSpaces ?? [])],
      runtimeEventClasses: [...(registry.runtimeEventClasses ?? [])],
      observationPolicy: clone(registry.runtimeObservationPolicy ?? {}),
      executionContextContract: clone(registry.executionContextContract ?? {})
    },
    motionProjection: {
      schemaVersion: 'vexlife.presentation-motion-projection/v1',
      graphRevision,
      canonicalOwnerRegistryRef: nav.registryRef ?? null,
      motionPolicyRefs: (nav.motionPolicies ?? []).map((x) => x.motionPolicyRef),
      animationPolicyRefs: (nav.animationPolicies ?? []).map((x) => x.animationPolicyRef),
      animationStateIsCanonicalProductState: false
    },
    testObligations: {
      schemaVersion: 'vexlife.presentation-test-obligations/v1', graphRevision,
      obligations: clone(registry.testObligations ?? [])
    },
    behaviorWitnesses: {
      schemaVersion: 'vexlife.presentation-behavior-witnesses/v1', graphRevision,
      greenTestIsBehaviorLineageProof: false,
      witnesses: clone(registry.behaviorWitnesses ?? [])
    },
    platformCoverage: {
      schemaVersion: 'vexlife.presentation-platform-coverage/v1', graphRevision,
      platforms: (bundle.blueprint.platforms ?? []).map((p) => ({
        platformRef: p.platformRef,
        semanticIdentityShared: true,
        presentationAdapterState: 'FUTURE_OR_EXISTING_OWNER_ADOPTION'
      }))
    }
  };
}

export function writeProjectionSet(compiled, { root = ROOT, generated = loadPresentationRegistry(root).generatedProjections } = {}) {
  const pairs = [
    ['uiIdentityRegistry','uiIdentityRegistry'],
    ['presentationGraph','presentationGraph'],
    ['navigationProjection','navigationProjection'],
    ['reachabilityGraph','reachabilityGraph'],
    ['presentationStateManifest','presentationStateManifest'],
    ['motionProjection','motionProjection'],
    ['testObligations','testObligations'],
    ['behaviorWitnesses','behaviorWitnesses'],
    ['platformCoverage','platformCoverage']
  ];
  for (const [pathKey, valueKey] of pairs) {
    const target = path.join(root, req(generated[pathKey], `generated.${pathKey}`));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    writeJson(target, compiled[valueKey]);
  }
  return pairs.map(([key]) => generated[key]);
}

async function main() {
  const bundle = loadBlueprint(ROOT);
  const registry = loadPresentationRegistry(ROOT);
  const compiled = compilePresentationGraph(bundle, registry);
  const written = process.argv.includes('--write') ? writeProjectionSet(compiled, { root: ROOT, generated: registry.generatedProjections }) : [];
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 'vexlife.presentation-graph-compiler-result/v1',
    state: 'PASS',
    graphRevision: compiled.graphRevision,
    screens: compiled.uiIdentityRegistry.screens.length,
    elements: compiled.uiIdentityRegistry.elements.length,
    placements: compiled.presentationGraph.placements.length,
    reachabilityPaths: compiled.reachabilityGraph.paths.length,
    obligations: compiled.testObligations.obligations.length,
    witnesses: compiled.behaviorWitnesses.witnesses.length,
    written
  }, null, 2)}\n`);
}
const invokedAsMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedAsMain) await main();

// [VXG RealForever]
