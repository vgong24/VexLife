#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { compilePresentationGraph, loadPresentationRegistry, writeProjectionSet } from './presentation-graph.mjs';
import { runBrowserObservation } from './presentation-graph-observer.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
const HELD = new Set(['ROUTE_TO_RIGHTFUL_OWNER', 'HELD_WITH_EXACT_WAKE_CONDITION']);
const DISPOSITIONS = new Set([
  'ACCEPTED_CURRENT', 'PATCH_THIS_LANE', 'ROUTE_TO_RIGHTFUL_OWNER',
  'HELD_WITH_EXACT_WAKE_CONDITION', 'OBSOLETE_REMOVE_ONLY_IF_SEPARATELY_AUTHORIZED'
]);

function browserScoped(scope) {
  return scope === 'BROWSER' || (Array.isArray(scope) && scope.includes('BROWSER'));
}
function accountOk(item, label, errors) {
  for (const field of ['subjectRef', 'disposition', 'ownerRef', 'reason']) {
    if (typeof item?.[field] !== 'string' || !item[field]) errors.push(`${label}.${field} is required`);
  }
  if (item?.disposition && !DISPOSITIONS.has(item.disposition)) errors.push(`${label}.disposition unsupported`);
  if (HELD.has(item?.disposition) && (typeof item.wakeCondition !== 'string' || !item.wakeCondition)) {
    errors.push(`${label}.wakeCondition is required`);
  }
  if (HELD.has(item?.disposition) && !/^github\.issue\./.test(item.ownerRef ?? '')) {
    errors.push(`${label}.ownerRef durable owner required`);
  }
}
function indexed(items, field, label, errors) {
  const map = new Map();
  for (const [i, item] of (items ?? []).entries()) {
    const ref = item?.[field];
    if (typeof ref !== 'string' || !ref) { errors.push(`${label}[${i}].${field} is required`); continue; }
    if (map.has(ref)) errors.push(`${label} duplicates ${field} ${ref}`);
    map.set(ref, item);
  }
  return map;
}
function addHold(holds, item, subjectRef = item.subjectRef) {
  holds.push({
    subjectRef, disposition: item.disposition, ownerRef: item.ownerRef,
    reason: item.reason, wakeCondition: item.wakeCondition
  });
}

export function derivePresentationStructuralHealth({ bundle, registry, compiled = compilePresentationGraph(bundle, registry) }) {
  const errors = [];
  const externalHolds = [];
  const policy = bundle.buildHealth?.presentationAccounting ?? {};
  if (policy.schemaVersion !== 'vexlife.presentation-health-accounting/v1') {
    errors.push('presentationAccounting schema must be vexlife.presentation-health-accounting/v1');
  }

  const nodes = indexed(registry.presentationNodes, 'presentationRef', 'presentationNodes', errors);
  const placements = indexed(registry.placements, 'placementRef', 'placements', errors);
  const byNode = new Map();
  for (const placement of placements.values()) {
    if (!nodes.has(placement.presentationRef)) errors.push(`${placement.placementRef} references unknown presentationRef ${placement.presentationRef}`);
    const rows = byNode.get(placement.presentationRef) ?? [];
    rows.push(placement); byNode.set(placement.presentationRef, rows);
  }
  for (const node of nodes.values()) {
    if (typeof node.presentationOwnerRef !== 'string' || !node.presentationOwnerRef) errors.push(`${node.presentationRef}.presentationOwnerRef is required`);
    const rows = byNode.get(node.presentationRef) ?? [];
    if (rows.length !== 1) errors.push(`${node.presentationRef} must have exactly one placement; observed ${rows.length}`);
    if (rows.length === 1) {
      const placement = rows[0];
      if (placement.presentationOwnerRef !== node.presentationOwnerRef) errors.push(`${node.presentationRef} placement owner mismatch`);
      if (node.semanticOwnerRefOrNull?.startsWith('screen.') && placement.screenRef !== node.semanticOwnerRefOrNull) {
        errors.push(`${node.presentationRef} placement screen mismatch`);
      }
    }
  }

  const graphScreens = new Set([...nodes.values()].map((n) => n.semanticOwnerRefOrNull).filter((r) => r?.startsWith('screen.')));
  const screens = new Set((bundle.blueprint.screens ?? []).map((s) => s.screenRef));
  const screenAccounts = indexed(policy.screenAccounts, 'subjectRef', 'screenAccounts', errors);
  for (const [ref, item] of screenAccounts) accountOk(item, `screenAccounts.${ref}`, errors);
  const screenCoverage = [];
  for (const screenRef of [...screens].sort()) {
    if (graphScreens.has(screenRef)) {
      screenCoverage.push({ screenRef, state: 'PRESENTATION_GRAPH_CURRENT' });
      if (screenAccounts.has(screenRef)) errors.push(`screen account is stale because ${screenRef} is now graph-covered`);
    } else {
      const account = screenAccounts.get(screenRef);
      if (!account) {
        errors.push(`unaccounted canonical presentation screen ${screenRef}`);
        screenCoverage.push({ screenRef, state: 'UNACCOUNTED' });
      } else {
        screenCoverage.push({ screenRef, state: account.disposition, ownerRef: account.ownerRef });
        if (HELD.has(account.disposition)) addHold(externalHolds, account);
      }
    }
  }
  for (const ref of screenAccounts.keys()) if (!screens.has(ref)) errors.push(`screenAccounts contains stale screen ${ref}`);

  const reachSteps = new Set((registry.reachabilityPaths ?? []).flatMap((p) => p.steps ?? []));
  for (const screenRef of graphScreens) {
    const refs = [...nodes.values()].filter((n) => n.semanticOwnerRefOrNull === screenRef).map((n) => n.presentationRef);
    if (!refs.some((ref) => reachSteps.has(ref))) errors.push(`${screenRef} has graph anatomy but no reachable presentation node`);
  }

  const obligations = indexed(registry.testObligations, 'obligationRef', 'testObligations', errors);
  const witnessCounts = new Map();
  for (const witness of registry.behaviorWitnesses ?? []) {
    if (!obligations.has(witness.obligationRef)) errors.push(`${witness.witnessRef} references unknown obligation ${witness.obligationRef}`);
    witnessCounts.set(witness.obligationRef, (witnessCounts.get(witness.obligationRef) ?? 0) + 1);
  }
  for (const ref of obligations.keys()) if (witnessCounts.get(ref) !== 1) errors.push(`${ref} must have exactly one behavior witness`);
  const unresolvedWitnesses = (registry.behaviorWitnesses ?? []).filter((w) => w.state !== 'PASS' || w.currentness !== 'CURRENT');
  if (unresolvedWitnesses.length) {
    accountOk(policy.witnessCurrentnessAccount, 'witnessCurrentnessAccount', errors);
    if (policy.witnessCurrentnessAccount?.subjectRef !== registry.registryRef) errors.push('witnessCurrentnessAccount must bind registryRef');
    if (HELD.has(policy.witnessCurrentnessAccount?.disposition)) {
      addHold(externalHolds, { ...policy.witnessCurrentnessAccount, reason: `${policy.witnessCurrentnessAccount.reason}; unresolved=${unresolvedWitnesses.length}` });
    }
  } else if (policy.witnessCurrentnessAccount && policy.witnessCurrentnessAccount.disposition !== 'ACCEPTED_CURRENT') {
    errors.push('witnessCurrentnessAccount is stale');
  }

  const surfaceAccounts = indexed(policy.externalSurfaceAccounts, 'subjectRef', 'externalSurfaceAccounts', errors);
  for (const [ref, item] of surfaceAccounts) {
    accountOk(item, `externalSurfaceAccounts.${ref}`, errors);
    if (HELD.has(item.disposition)) addHold(externalHolds, item);
  }
  const docAccounts = indexed(policy.standaloneDocuments, 'moduleRef', 'standaloneDocuments', errors);
  const browserDocs = (bundle.modules?.modules ?? []).filter((m) => browserScoped(m.platformScope) && m.path?.endsWith('.html'));
  const standaloneCoverage = [];
  for (const mod of browserDocs) {
    const item = docAccounts.get(mod.moduleRef);
    if (!item) { errors.push(`unaccounted standalone browser document ${mod.moduleRef}`); continue; }
    if (!item.sourceOwnerRef) errors.push(`${mod.moduleRef}.sourceOwnerRef is required`);
    if (item.routeKind === 'SCREEN') {
      if (!screens.has(item.subjectRef)) errors.push(`${mod.moduleRef} maps to unknown screen ${item.subjectRef}`);
      if (!graphScreens.has(item.subjectRef) && !screenAccounts.has(item.subjectRef)) errors.push(`${mod.moduleRef} screen is not graph/owner-accounted`);
    } else if (item.routeKind === 'SURFACE') {
      if (!surfaceAccounts.has(item.subjectRef)) errors.push(`${mod.moduleRef} surface lacks externalSurfaceAccount`);
    } else if (item.routeKind === 'NON_SEMANTIC_REDIRECT') {
      if (item.disposition !== 'ACCEPTED_CURRENT' || !item.reason) errors.push(`${mod.moduleRef} redirect accounting invalid`);
    } else errors.push(`${mod.moduleRef} routeKind unsupported`);
    standaloneCoverage.push({ moduleRef: mod.moduleRef, path: mod.path, routeKind: item.routeKind, subjectRef: item.subjectRef });
  }
  for (const ref of docAccounts.keys()) if (!browserDocs.some((m) => m.moduleRef === ref)) errors.push(`standaloneDocuments contains stale module ${ref}`);

  const platformByRef = new Map((policy.platformAccounts ?? []).map((p) => [p.platformRef, p]));
  const platformCoverage = [];
  for (const platform of bundle.blueprint.platforms ?? []) {
    const item = platformByRef.get(platform.platformRef);
    if (!item) { errors.push(`platformAccounts missing ${platform.platformRef}`); continue; }
    accountOk({ ...item, subjectRef: platform.platformRef }, `platformAccounts.${platform.platformRef}`, errors);
    if (item.supportState !== platform.supportState) errors.push(`${platform.platformRef} accounting supportState drifted`);
    if (HELD.has(item.disposition)) addHold(externalHolds, item, platform.platformRef);
    platformCoverage.push({ platformRef: platform.platformRef, supportState: platform.supportState, disposition: item.disposition, ownerRef: item.ownerRef });
  }
  for (const ref of platformByRef.keys()) if (!(bundle.blueprint.platforms ?? []).some((p) => p.platformRef === ref)) errors.push(`platformAccounts contains stale platform ${ref}`);

  const requiredLocales = [...(bundle.blueprint.product?.requiredLanguages ?? [])].sort();
  for (const locale of requiredLocales) if (!bundle.strings?.[locale]) errors.push(`required locale ${locale} has no loaded catalog`);
  const checkRefs = new Set((bundle.buildHealth?.checks ?? []).map((c) => c.checkRef));
  for (const ref of ['check.localization', 'check.browser-integration', 'check.tests']) if (!checkRefs.has(ref)) errors.push(`presentation conformance requires ${ref}`);

  return {
    schemaVersion: 'vexlife.presentation-structural-health/v1',
    state: errors.length ? 'BLOCKED' : 'PASS',
    currentness: 'CURRENT',
    graphRevision: compiled.graphRevision,
    presentationRegistryRef: registry.registryRef,
    presentationRegistryVersion: registry.registryVersion,
    canonicalScreenCount: screens.size,
    graphCoveredScreenCount: graphScreens.size,
    presentationNodeCount: nodes.size,
    placementCount: placements.size,
    reachabilityPathCount: registry.reachabilityPaths?.length ?? 0,
    testObligationCount: obligations.size,
    behaviorWitnessCount: registry.behaviorWitnesses?.length ?? 0,
    unresolvedWitnessCount: unresolvedWitnesses.length,
    screenCoverage, standaloneCoverage, platformCoverage,
    conformance: {
      requiredLocales,
      localizationCheckRef: 'check.localization',
      inputBrowserCheckRef: 'check.browser-integration',
      accessibilityEvidenceBoundary: 'SOURCE_CONTRACT_AND_RENDERED_BROWSER_ONLY__LIVED_ASSISTIVE_TECH_NOT_INFERRED',
      recoveryEvidenceBoundary: 'PRESENTATION_OBLIGATIONS_PLUS_CANONICAL_NAVIGATION__NO_SCREENSHOT_INFERENCE',
      nativeConformanceClaimedFromScaffold: false
    },
    externalHolds,
    unclassifiedGaps: errors.filter((e) => /unaccounted|lacks externalSurfaceAccount/.test(e)).length,
    unknownOwners: errors.filter((e) => /owner.*required|owner mismatch/.test(e)).length,
    localRepairsRemaining: errors.length,
    hiddenLocalActions: 0,
    errors
  };
}

export async function runPresentationHealth({ root = ROOT, observeRuntime = true, writeProjections = true } = {}) {
  const bundle = loadBlueprint(root);
  const registry = loadPresentationRegistry(root);
  const compiled = compilePresentationGraph(bundle, registry);
  const structural = derivePresentationStructuralHealth({ bundle, registry, compiled });
  const writtenProjectionPaths = structural.state === 'PASS' && writeProjections
    ? writeProjectionSet(compiled, { root, generated: registry.generatedProjections }) : [];
  let runtimeObservation = { state: observeRuntime ? 'NOT_REACHED' : 'NOT_REQUESTED', graphRevision: compiled.graphRevision };
  if (structural.state === 'PASS' && observeRuntime) {
    try {
      const trace = await runBrowserObservation({ root });
      runtimeObservation = {
        state: 'EXECUTED_CURRENT_PROCESS', graphRevision: compiled.graphRevision,
        registryRef: trace.sourceBinding?.registryRef ?? null, registryOwnerRef: trace.sourceBinding?.ownerRef ?? null,
        eventCount: trace.events?.length ?? 0, rawPointerLogging: trace.rawPointerLogging,
        screenRef: trace.snapshot?.semanticFrame?.screenRef ?? null,
        observedElementCount: trace.snapshot?.observedElements?.length ?? 0
      };
      if (runtimeObservation.registryRef !== registry.registryRef ||
          runtimeObservation.registryOwnerRef !== registry.ownerRef ||
          runtimeObservation.rawPointerLogging !== false) {
        structural.errors.push('runtime observation is not bound to current Presentation Graph policy');
      }
    } catch (error) {
      structural.errors.push(`runtime presentation observation failed: ${error.message}`);
      runtimeObservation = { state: 'FAILED', graphRevision: compiled.graphRevision, error: error.message };
    }
  }
  if (structural.errors.length) {
    structural.state = 'BLOCKED';
    structural.localRepairsRemaining = structural.errors.length;
  }
  return { ...structural, writtenProjectionPaths, runtimeObservation };
}

async function main() {
  const result = await runPresentationHealth();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.state !== 'PASS') process.exitCode = 1;
}
const invokedAsMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedAsMain) await main();

// [VXG RealForever]
