import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPublicLearningNavigationContinuity,
  publicLearningAvailableDoorRefs,
  publicLearningPageStateRef
} from '../reference/browser/modules/public-learning-navigation-continuity.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint/navigation-continuity-registry.json'), 'utf8'));
const DOORS_SCHEMA = 'vexlife.public-learning-registered-doors-receipt/v1';
const FOCUS_SCHEMA = 'vexlife.public-learning-registered-focus-receipt/v1';
const ROOT_REF = 'public-group.preflight.root';
const CHILD_REF = 'module.preflight.child';
const presentation = Object.freeze([
  { terrainNodeRef: ROOT_REF, parentRef: null },
  { terrainNodeRef: CHILD_REF, parentRef: ROOT_REF }
]);

function createHarness({ staleDoorsOnPreflight = false, externalPresenceDrift = false } = {}) {
  let currentRef = CHILD_REF;
  let syncCalls = 0;
  let performerCalls = 0;

  const continuity = createPublicLearningNavigationContinuity({
    registry,
    presentation,
    initialRef: CHILD_REF,
    navigationSessionRef: `navigation-session.public-learning.preflight.${staleDoorsOnPreflight}.${externalPresenceDrift}`,
    performTerrainTravel: async (targetRef, direction) => {
      performerCalls += 1;
      assert.equal(targetRef, ROOT_REF);
      assert.equal(direction, 'out');
      currentRef = targetRef;
      return true;
    },
    observeCurrentRef: () => currentRef,
    synchronizeVisibleDoors: (observedRef) => {
      syncCalls += 1;
      const availableElementRefs = staleDoorsOnPreflight && syncCalls === 2
        ? []
        : publicLearningAvailableDoorRefs(presentation, observedRef);
      return {
        schemaVersion: DOORS_SCHEMA,
        currentRef: observedRef,
        availableElementRefs,
        semanticNavigationPerformed: false
      };
    },
    focusRegisteredElement: (elementRef) => ({
      schemaVersion: FOCUS_SCHEMA,
      elementRef,
      focused: true,
      semanticNavigationPerformed: false
    }),
    wait: async () => {}
  });

  if (externalPresenceDrift) currentRef = ROOT_REF;

  return {
    continuity,
    performerCalls: () => performerCalls,
    syncCalls: () => syncCalls,
    currentRef: () => currentRef
  };
}

test('S7NC-PREFLIGHT-00 stale rerendered door set holds before the Terrain performer can move', async () => {
  const h = createHarness({ staleDoorsOnPreflight: true });
  const result = await h.continuity.navigateTo(ROOT_REF, {
    commandRef: 'command.public-learning.preflight.stale-door'
  });
  assert.equal(result.outcomeRef, 'outcome.navigation.adapter-failure');
  assert.equal(h.performerCalls(), 0);
  assert.equal(h.currentRef(), CHILD_REF);
  assert.equal(h.continuity.currentFrame().pageStateRef, publicLearningPageStateRef(CHILD_REF));
  assert.equal(h.continuity.transitionBundles().length, 0);
  assert.equal(h.syncCalls(), 2);
});

test('S7NC-PREFLIGHT-01 out-of-band Terrain presence drift holds before replaying an NC step from stale presence', async () => {
  const h = createHarness({ externalPresenceDrift: true });
  const result = await h.continuity.navigateTo(ROOT_REF, {
    commandRef: 'command.public-learning.preflight.presence-drift'
  });
  assert.equal(result.outcomeRef, 'outcome.navigation.adapter-failure');
  assert.equal(h.performerCalls(), 0);
  assert.equal(h.currentRef(), ROOT_REF);
  assert.equal(h.continuity.currentFrame().pageStateRef, publicLearningPageStateRef(CHILD_REF));
  assert.equal(h.continuity.transitionBundles().length, 0);
  assert.equal(h.syncCalls(), 2);
});

// [VXG RealForever]
