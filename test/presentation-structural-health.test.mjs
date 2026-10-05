import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { compilePresentationGraph, loadPresentationRegistry, ROOT } from '../scripts/presentation-graph.mjs';
import { derivePresentationStructuralHealth } from '../scripts/presentation-health.mjs';

const bundle = loadBlueprint(ROOT);
const registry = loadPresentationRegistry(ROOT);
function current() {
  const b = structuredClone(bundle); b.root = bundle.root;
  const r = structuredClone(registry);
  return { bundle: b, registry: r, compiled: compilePresentationGraph(b, r) };
}

test('current presentation source is fully accounted without converting owner holds into green proof', () => {
  const result = derivePresentationStructuralHealth(current());
  assert.equal(result.state, 'PASS', result.errors.join('\n'));
  assert.equal(result.unclassifiedGaps, 0);
  assert.equal(result.unknownOwners, 0);
  assert.equal(result.localRepairsRemaining, 0);
  assert.equal(result.hiddenLocalActions, 0);
  assert.equal(result.canonicalScreenCount, 10);
  assert.equal(result.graphCoveredScreenCount, 8);
  for (const ref of [
    'screen.vexlife.guide-overlay',
    'screen.vexlife.cdr-s5-closed-alpha',
    'surface.vexlife.public-learning.architecture-atlas.001',
    'registry.vexlife.presentation-graph.001'
  ]) assert.ok(result.externalHolds.some((item) => item.subjectRef === ref), ref);
  assert.equal(result.conformance.nativeConformanceClaimedFromScaffold, false);
});

test('a canonical screen cannot exist outside graph or explicit owner accounting', () => {
  const f = current();
  f.bundle.blueprint.screens.push({
    screenRef: 'screen.vexlife.synthetic-unaccounted', titleStringRef: 'screen.chat.title',
    routeRef: 'route.synthetic-unaccounted', conceptRef: 'concept.screen.vexlife.synthetic-unaccounted', regions: []
  });
  f.compiled = compilePresentationGraph(f.bundle, f.registry);
  const result = derivePresentationStructuralHealth(f);
  assert.equal(result.state, 'BLOCKED');
  assert.ok(result.errors.some((e) => e.includes('unaccounted canonical presentation screen screen.vexlife.synthetic-unaccounted')));
});

test('presentation nodes require one owner-aligned placement', () => {
  const f = current();
  delete f.registry.presentationNodes[0].presentationOwnerRef;
  f.compiled = compilePresentationGraph(f.bundle, f.registry);
  assert.ok(derivePresentationStructuralHealth(f).errors.some((e) => e.includes('presentationOwnerRef is required')));

  const d = current();
  d.registry.placements.push({ ...structuredClone(d.registry.placements[0]), placementRef: 'placement.vexlife.synthetic-duplicate' });
  d.compiled = compilePresentationGraph(d.bundle, d.registry);
  assert.ok(derivePresentationStructuralHealth(d).errors.some((e) => e.includes('must have exactly one placement')));
});

test('adoption makes a prior owner-hold stale rather than hiding debt', () => {
  const f = current();
  f.registry.presentationNodes.push({
    presentationRef: 'presentation.vexlife.guide.synthetic-adopted', presentationKind: 'SYNTHETIC_TEST_ONLY',
    parentPresentationRefOrNull: null, semanticOwnerRefOrNull: 'screen.vexlife.guide-overlay',
    presentationOwnerRef: 'github.issue.vexlife.719', sourceRef: 'screen.vexlife.guide-overlay', runtimeBindingRef: '#guide'
  });
  f.registry.placements.push({
    placementRef: 'placement.vexlife.guide.synthetic-adopted',
    presentationRef: 'presentation.vexlife.guide.synthetic-adopted', screenRef: 'screen.vexlife.guide-overlay',
    parentPresentationRefOrNull: null, componentRefOrNull: null, slotRefOrNull: null,
    elementRefOrNull: null, styleRefOrNull: '#guide', primaryChrome: false,
    presentationOwnerRef: 'github.issue.vexlife.719'
  });
  f.registry.reachabilityPaths.push({
    reachabilityRef: 'reachability.vexlife.guide.synthetic-adopted',
    targetRef: 'presentation.vexlife.guide.synthetic-adopted', state: 'CURRENTLY_RENDERED',
    steps: ['presentation.vexlife.guide.synthetic-adopted']
  });
  f.compiled = compilePresentationGraph(f.bundle, f.registry);
  assert.ok(derivePresentationStructuralHealth(f).errors.some((e) => e.includes('screen account is stale because screen.vexlife.guide-overlay is now graph-covered')));
});

test('standalone browser documents cannot bypass explicit accounting', () => {
  const f = current();
  f.bundle.buildHealth.presentationAccounting.standaloneDocuments =
    f.bundle.buildHealth.presentationAccounting.standaloneDocuments
      .filter((item) => item.moduleRef !== 'module.vexlife.browser.architecture-atlas-document');
  const result = derivePresentationStructuralHealth(f);
  assert.ok(result.errors.some((e) => e.includes('unaccounted standalone browser document module.vexlife.browser.architecture-atlas-document')));
});

test('unknown witness currentness requires exact owner and wake', () => {
  const f = current();
  delete f.bundle.buildHealth.presentationAccounting.witnessCurrentnessAccount;
  const result = derivePresentationStructuralHealth(f);
  assert.equal(result.state, 'BLOCKED');
  assert.ok(result.errors.some((e) => e.includes('witnessCurrentnessAccount')));
});

test('platform scaffold state cannot impersonate native conformance', () => {
  const f = current();
  f.bundle.buildHealth.presentationAccounting.platformAccounts
    .find((item) => item.platformRef === 'platform.android').supportState = 'REFERENCE_IMPLEMENTED';
  const result = derivePresentationStructuralHealth(f);
  assert.ok(result.errors.some((e) => e.includes('platform.android accounting supportState drifted')));
});


test('owner-held presentation debt requires a durable issue owner route', () => {
  const f = current();
  f.bundle.buildHealth.presentationAccounting.platformAccounts
    .find((item) => item.platformRef === 'platform.ios').ownerRef = 'module.vexlife.core.platform-generator';
  const result = derivePresentationStructuralHealth(f);
  assert.equal(result.state, 'BLOCKED');
  assert.ok(result.unknownOwners > 0);
  assert.ok(result.errors.some((e) => e.includes('platformAccounts.platform.ios.ownerRef durable owner required')));
});
