import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import {
  compilePresentationGraph,
  loadPresentationRegistry,
  ROOT
} from '../scripts/presentation-graph.mjs';

const bundle = loadBlueprint(ROOT);
const registry = loadPresentationRegistry(ROOT);

function fixtureRegistry() {
  const copy = structuredClone(registry);
  copy.presentationNodes = [
    {
      presentationRef: 'presentation.fixture.journal-options',
      presentationKind: 'TRANSIENT_LAYER',
      parentPresentationRefOrNull: null,
      semanticOwnerRefOrNull: 'screen.vexlife.living-journal'
    },
    {
      presentationRef: 'presentation.fixture.journal-history',
      presentationKind: 'CONTAINER',
      parentPresentationRefOrNull: 'presentation.fixture.journal-options',
      semanticOwnerRefOrNull: 'screen.vexlife.living-journal'
    }
  ];
  copy.placements = [
    {
      placementRef: 'placement.fixture.archive',
      screenRef: 'screen.vexlife.living-journal',
      parentPresentationRefOrNull: 'presentation.fixture.journal-history',
      componentRefOrNull: 'component.vexlife.action-vessel',
      slotRefOrNull: 'slot.action-vessel.menu',
      elementRefOrNull: 'element.living-journal.archive.open',
      styleRefOrNull: null,
      primaryChrome: false
    }
  ];
  copy.reachabilityPaths = [
    {
      reachabilityRef: 'reachability.fixture.journal-archive',
      targetRef: 'element.living-journal.archive.open',
      state: 'REACHABLE_VIA_SECONDARY_PATH',
      steps: [
        'presentation.fixture.journal-options',
        'presentation.fixture.journal-history',
        'element.living-journal.archive.open'
      ]
    }
  ];
  copy.testObligations = [
    {
      obligationRef: 'obligation.fixture.journal-archive',
      targetRef: 'element.living-journal.archive.open',
      requires: ['REGISTERED', 'PLACED', 'REACHABLE', 'PERMISSION_BOUND', 'ACTION_BOUND']
    }
  ];
  copy.behaviorWitnesses = [
    {
      witnessRef: 'witness.fixture.journal-archive',
      obligationRef: 'obligation.fixture.journal-archive',
      behaviorRefOrNull: 'behavior.fixture.archive-secondary-reachability',
      contractRefOrNull: 'contract.presentation-graph.reachability/v1',
      testRefOrNull: 'test.living-journal.archive-browser-navigation',
      sourceRevisionOrNull: null,
      expectedRelationship: 'ARCHIVE_REACHABLE_THROUGH_SECONDARY_PATH',
      evidenceRefs: [],
      state: 'UNKNOWN',
      currentness: 'UNPROVEN_REAL_INTEGRATION'
    }
  ];
  return copy;
}

test('current source compiles stable typed views without replacing canonical element identity', () => {
  const compiled = compilePresentationGraph(bundle, registry);
  const archive = compiled.uiIdentityRegistry.elements.find((item) => item.elementRef === 'element.living-journal.archive.open');
  const home = compiled.uiIdentityRegistry.elements.find((item) => item.elementRef === 'element.nav.home');
  assert.ok(archive);
  assert.ok(home);
  assert.equal(archive.typedRef, 'UIElementID.LivingJournalArchiveOpen');
  assert.equal(archive.elementRef, 'element.living-journal.archive.open');
  assert.equal(home.permissionRef, 'permission.none');
  assert.equal(home.elementPermissionRefOrNull, null);
  assert.equal(home.permissionBindingSource, 'ACTION');
  assert.equal(compiled.uiIdentityRegistry.canonicalElementIdentityField, 'elementRef');
  assert.equal(compiled.presentationGraph.semanticAuthority, false);
});

test('Navigation/Journey remain canonical owners and are referenced rather than redefined', () => {
  const compiled = compilePresentationGraph(bundle, registry);
  assert.equal(compiled.navigationProjection.canonicalOwnerRegistryRef, 'registry.vexlife.navigation-continuity.001');
  assert.equal(compiled.navigationProjection.currentContextAuthority, 'CANONICAL_NAVIGATION');
  assert.equal(compiled.navigationProjection.journeyAuthority, 'CANONICAL_JOURNEY');
  assert.equal(compiled.motionProjection.animationStateIsCanonicalProductState, false);
  assert.ok(compiled.motionProjection.motionPolicyRefs.includes('motion.navigation.standard'));
});

test('synthetic Patient Zero fixture proves placement, secondary reachability and witness grammar without claiming real integration', () => {
  const fixture = fixtureRegistry();
  const compiled = compilePresentationGraph(bundle, fixture);
  assert.equal(compiled.presentationGraph.placements[0].primaryChrome, false);
  assert.deepEqual(compiled.reachabilityGraph.paths[0].steps, [
    'presentation.fixture.journal-options',
    'presentation.fixture.journal-history',
    'element.living-journal.archive.open'
  ]);
  assert.equal(compiled.behaviorWitnesses.witnesses[0].state, 'UNKNOWN');
  assert.equal(compiled.behaviorWitnesses.witnesses[0].currentness, 'UNPROVEN_REAL_INTEGRATION');
});

test('canonical action permission satisfies the binding when the element does not duplicate it', () => {
  const compiled = compilePresentationGraph(bundle, registry);
  const home = compiled.uiIdentityRegistry.elements.find((item) => item.elementRef === 'element.nav.home');
  assert.equal(home.elementPermissionRefOrNull, null);
  assert.equal(home.permissionRef, 'permission.none');
  assert.equal(home.permissionBindingSource, 'ACTION');
});

test('action-bearing element without element or action permission still fails closed', () => {
  const broken = structuredClone(bundle);
  const home = broken.blueprint.screens
    .flatMap((screen) => screen.regions)
    .flatMap((region) => region.elements)
    .find((element) => element.elementRef === 'element.nav.home');
  const action = broken.blueprint.actions.find((item) => item.actionRef === 'action.navigation.home');
  home.permissionRef = null;
  action.permissionRef = null;
  assert.throws(() => compilePresentationGraph(broken, registry), /action-bearing without permission binding/u);
});

test('invalid slot placement fails closed', () => {
  const fixture = fixtureRegistry();
  fixture.placements[0].slotRefOrNull = 'slot.missing';
  assert.throws(() => compilePresentationGraph(bundle, fixture), /invalid slot/u);
});

test('presentation placement cycles fail closed', () => {
  const fixture = fixtureRegistry();
  fixture.presentationNodes[0].parentPresentationRefOrNull = 'presentation.fixture.journal-history';
  assert.throws(() => compilePresentationGraph(bundle, fixture), /placement cycle/u);
});

test('reachability cycles fail closed', () => {
  const fixture = fixtureRegistry();
  fixture.reachabilityPaths[0].steps = [
    'presentation.fixture.journal-options',
    'presentation.fixture.journal-history',
    'presentation.fixture.journal-options',
    'element.living-journal.archive.open'
  ];
  assert.throws(() => compilePresentationGraph(bundle, fixture), /reachability cycle/u);
});

test('missing canonical target fails closed instead of inventing identity', () => {
  const fixture = fixtureRegistry();
  fixture.placements[0].elementRefOrNull = 'element.vexlife.missing';
  assert.throws(() => compilePresentationGraph(bundle, fixture), /missing element/u);
});

test('graph revision is deterministic for the same source inputs', () => {
  const first = compilePresentationGraph(bundle, registry);
  const second = compilePresentationGraph(bundle, registry);
  assert.equal(first.graphRevision, second.graphRevision);
});


test('dangling presentation parents fail closed', () => {
  const fixture = fixtureRegistry();
  fixture.presentationNodes[1].parentPresentationRefOrNull = 'presentation.fixture.missing-parent';
  assert.throws(() => compilePresentationGraph(bundle, fixture), /missing presentation parent/u);
});

test('reachability paths must terminate at the declared target', () => {
  const fixture = fixtureRegistry();
  fixture.reachabilityPaths[0].steps = [
    'presentation.fixture.journal-options',
    'presentation.fixture.journal-history'
  ];
  assert.throws(() => compilePresentationGraph(bundle, fixture), /must terminate at target/u);
});

test('placements cannot move a canonical element onto another screen', () => {
  const fixture = fixtureRegistry();
  const otherScreen = bundle.blueprint.screens.find((screen) => screen.screenRef !== fixture.placements[0].screenRef);
  assert.ok(otherScreen);
  fixture.placements[0].screenRef = otherScreen.screenRef;
  assert.throws(() => compilePresentationGraph(bundle, fixture), /canonical owner screen/u);
});
