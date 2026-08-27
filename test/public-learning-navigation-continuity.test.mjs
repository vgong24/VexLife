import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPublicLearningNavigationTopology,
  createPublicLearningNavigationContinuity,
  publicLearningAvailableDoorRefs,
  publicLearningChildDoorRef,
  publicLearningPageStateRef,
  publicLearningUpDoorRef
} from '../reference/browser/modules/public-learning-navigation-continuity.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint/navigation-continuity-registry.json'), 'utf8'));
const receiptSchemas = Object.freeze({
  doors: 'vexlife.public-learning-registered-doors-receipt/v1',
  focus: 'vexlife.public-learning-registered-focus-receipt/v1'
});

const ROOT_REF = 'public-group.fixture.root';
const ALPHA = 'public-group.fixture.alpha';
const ALPHA_BRANCH = 'public-group.fixture.alpha.branch';
const ALPHA_LEAF = 'module.fixture.alpha.leaf';
const BETA = 'public-group.fixture.beta';
const BETA_BRANCH = 'public-group.fixture.beta.branch';
const BETA_LEAF = 'module.fixture.beta.leaf';

const presentation = Object.freeze([
  { terrainNodeRef: ROOT_REF, parentRef: null },
  { terrainNodeRef: ALPHA, parentRef: ROOT_REF },
  { terrainNodeRef: ALPHA_BRANCH, parentRef: ALPHA },
  { terrainNodeRef: ALPHA_LEAF, parentRef: ALPHA_BRANCH },
  { terrainNodeRef: BETA, parentRef: ROOT_REF },
  { terrainNodeRef: BETA_BRANCH, parentRef: BETA },
  { terrainNodeRef: BETA_LEAF, parentRef: BETA_BRANCH }
]);

function harness({ initialRef = ALPHA_LEAF, failAtCall = null, preferenceRefs = null } = {}) {
  let currentRef = initialRef;
  let activeFocusRef = null;
  let calls = 0;
  const performed = [];
  const dwell = [];

  const currentDoors = () => publicLearningAvailableDoorRefs(presentation, currentRef);
  const continuity = createPublicLearningNavigationContinuity({
    registry,
    presentation,
    initialRef,
    initialPreferenceRefs: preferenceRefs,
    navigationSessionRef: `navigation-session.public-learning.fixture.${initialRef.replaceAll('.', '-')}.${preferenceRefs?.pacingRef ?? 'default'}`,
    performTerrainTravel: async (targetRef, direction) => {
      calls += 1;
      if (calls === failAtCall) return false;
      const target = presentation.find((item) => item.terrainNodeRef === targetRef);
      const current = presentation.find((item) => item.terrainNodeRef === currentRef);
      assert.ok(target && current, 'performer only receives registered presentation refs');
      if (direction === 'out') assert.equal(current.parentRef, targetRef, 'OUT performer calls must be hierarchy-adjacent');
      else assert.equal(target.parentRef, currentRef, 'IN performer calls must be hierarchy-adjacent');
      performed.push({ fromRef: currentRef, targetRef, direction });
      currentRef = targetRef;
      activeFocusRef = null;
      return true;
    },
    observeCurrentRef: () => currentRef,
    synchronizeVisibleDoors: (observedRef) => {
      assert.equal(observedRef, currentRef);
      return {
        schemaVersion: receiptSchemas.doors,
        currentRef,
        availableElementRefs: currentDoors()
      };
    },
    focusRegisteredElement: (elementRef) => {
      const available = currentDoors();
      assert.ok(available.includes(elementRef), `focus target must be a currently visible registered door: ${elementRef}`);
      activeFocusRef = elementRef;
      return {
        schemaVersion: receiptSchemas.focus,
        elementRef,
        focused: true,
        semanticNavigationPerformed: false
      };
    },
    wait: async (milliseconds) => { dwell.push(milliseconds); }
  });

  return {
    continuity,
    performed,
    dwell,
    currentRef: () => currentRef,
    activeFocusRef: () => activeFocusRef
  };
}

const preference = (pacingRef, motionPolicyRef = 'motion.navigation.standard') => ({
  pacingRef,
  motionPolicyRef,
  traceVisibilityRef: 'trace-visibility.navigation.visible'
});

test('S7NC-00 topology exposes only hierarchy-adjacent visible child/up doors and no sibling teleport transition', () => {
  const topology = buildPublicLearningNavigationTopology({ registry, presentation, initialRef: ALPHA_LEAF });
  assert.equal(topology.pageStates.length, 7);
  assert.equal(topology.transitions.length, 12);
  for (const transition of topology.transitions) {
    const from = topology.pageStates.find((item) => item.pageStateRef === transition.fromPageStateRef);
    const to = topology.pageStates.find((item) => item.pageStateRef === transition.toPageStateRef);
    assert.ok(from && to);
    const adjacent = from.parentPageStateRefOrNull === to.pageStateRef || to.parentPageStateRefOrNull === from.pageStateRef;
    assert.equal(adjacent, true, transition.transitionRef);
    assert.equal(from.availableElementRefs.includes(transition.viaElementRef), true, transition.transitionRef);
    assert.equal(transition.transitionClassRef, 'transition-class.navigation.registered-door');
    assert.equal(transition.portalRefOrNull, null);
    assert.doesNotMatch(transition.transitionRef, /sibling/iu);
  }
  assert.deepEqual(publicLearningAvailableDoorRefs(presentation, ALPHA_LEAF), [publicLearningUpDoorRef(ALPHA_LEAF, ALPHA_BRANCH)]);
  assert.deepEqual(publicLearningAvailableDoorRefs(presentation, ROOT_REF), [
    publicLearningChildDoorRef(ROOT_REF, ALPHA),
    publicLearningChildDoorRef(ROOT_REF, BETA)
  ].sort());
});

test('S7NC-01 cross-branch navigation walks OUT to the LCA then IN with one exact performer call per committed step', async () => {
  const h = harness();
  const result = await h.continuity.navigateTo(BETA_LEAF, { commandRef: 'command.public-learning.fixture.cross-branch' });
  assert.equal(result.outcomeRef, 'outcome.navigation.committed');
  assert.equal(h.currentRef(), BETA_LEAF);
  assert.deepEqual(h.performed, [
    { fromRef: ALPHA_LEAF, targetRef: ALPHA_BRANCH, direction: 'out' },
    { fromRef: ALPHA_BRANCH, targetRef: ALPHA, direction: 'out' },
    { fromRef: ALPHA, targetRef: ROOT_REF, direction: 'out' },
    { fromRef: ROOT_REF, targetRef: BETA, direction: 'in' },
    { fromRef: BETA, targetRef: BETA_BRANCH, direction: 'in' },
    { fromRef: BETA_BRANCH, targetRef: BETA_LEAF, direction: 'in' }
  ]);
  const bundles = h.continuity.transitionBundles();
  assert.equal(bundles.length, 6);
  assert.deepEqual(bundles.map((bundle) => bundle.via.elementRef), [
    publicLearningUpDoorRef(ALPHA_LEAF, ALPHA_BRANCH),
    publicLearningUpDoorRef(ALPHA_BRANCH, ALPHA),
    publicLearningUpDoorRef(ALPHA, ROOT_REF),
    publicLearningChildDoorRef(ROOT_REF, BETA),
    publicLearningChildDoorRef(BETA, BETA_BRANCH),
    publicLearningChildDoorRef(BETA_BRANCH, BETA_LEAF)
  ]);
  assert.equal(bundles.every((bundle) => bundle.outcomeRef === 'outcome.navigation.committed'), true);
  assert.equal(h.activeFocusRef(), publicLearningUpDoorRef(BETA_LEAF, BETA_BRANCH));
});

test('S7NC-02 already-present is a no-effect result and never calls the Terrain performer', async () => {
  const h = harness({ initialRef: BETA_LEAF });
  const result = await h.continuity.navigateTo(BETA_LEAF, { commandRef: 'command.public-learning.fixture.already-present' });
  assert.equal(result.outcomeRef, 'outcome.navigation.already-present');
  assert.deepEqual(h.performed, []);
  assert.equal(h.continuity.transitionBundles().length, 0);
  assert.equal(h.currentRef(), BETA_LEAF);
});

test('S7NC-03 a held performer step stops at the last committed frame and cannot advance presence', async () => {
  const h = harness({ failAtCall: 4 });
  const result = await h.continuity.navigateTo(BETA_LEAF, { commandRef: 'command.public-learning.fixture.fail-four' });
  assert.equal(result.outcomeRef, 'outcome.navigation.adapter-failure');
  assert.equal(h.currentRef(), ROOT_REF);
  assert.equal(h.continuity.currentFrame().pageStateRef, publicLearningPageStateRef(ROOT_REF));
  assert.equal(h.continuity.transitionBundles().length, 3);
  assert.deepEqual(h.performed.map((item) => item.targetRef), [ALPHA_BRANCH, ALPHA, ROOT_REF]);
});

test('S7NC-04 repeated rapid goals remain serialized rather than racing private Terrain movement', async () => {
  const h = harness();
  const first = h.continuity.navigateTo(BETA_LEAF, { commandRef: 'command.public-learning.fixture.serial.first' });
  const second = h.continuity.navigateTo(ALPHA_LEAF, { commandRef: 'command.public-learning.fixture.serial.second' });
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.outcomeRef, 'outcome.navigation.committed');
  assert.equal(secondResult.outcomeRef, 'outcome.navigation.committed');
  assert.equal(h.currentRef(), ALPHA_LEAF);
  assert.equal(h.performed.length, 12);
  assert.deepEqual(h.performed.slice(0, 6).map((item) => item.targetRef), [ALPHA_BRANCH, ALPHA, ROOT_REF, BETA, BETA_BRANCH, BETA_LEAF]);
  assert.deepEqual(h.performed.slice(6).map((item) => item.targetRef), [BETA_BRANCH, BETA, ROOT_REF, ALPHA, ALPHA_BRANCH, ALPHA_LEAF]);
});

test('S7NC-05 fast, slow and reduced-motion preferences never collapse semantic route steps', async () => {
  for (const refs of [
    preference('navigation-pacing.vexlife.fast'),
    preference('navigation-pacing.vexlife.slow'),
    preference('navigation-pacing.vexlife.normal', 'motion.navigation.reduced')
  ]) {
    const h = harness({ preferenceRefs: refs });
    const result = await h.continuity.navigateTo(BETA_LEAF, { commandRef: `command.public-learning.fixture.pacing.${refs.pacingRef}.${refs.motionPolicyRef}` });
    assert.equal(result.outcomeRef, 'outcome.navigation.committed');
    assert.equal(h.performed.length, 6, JSON.stringify(refs));
    assert.equal(h.continuity.transitionBundles().length, 6, JSON.stringify(refs));
  }
});

test('S7NC-06 source binds canonical Navigation Continuity and never duplicates Terrain transition authority', () => {
  const helper = fs.readFileSync(path.join(ROOT, 'reference/browser/modules/public-learning-navigation-continuity.js'), 'utf8');
  assert.match(helper, /\.\.\/\.\.\/\.\.\/src\/core\/navigation-continuity\.mjs/u);
  assert.match(helper, /createNavigationContinuitySession/u);
  assert.match(helper, /performTerrainTravel\(targetRef, direction\)/u);
  assert.doesNotMatch(helper, /createTerrainController/u);
  assert.doesNotMatch(helper, /navigation\.navigate\(/u);
  assert.doesNotMatch(helper, /sibling.*transition/iu);
});

// [VXG RealForever]
