import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserBundle } from '../reference/browser/modules/browser-bundle.js';
import {
  FEATURE_WALKTHROUGH_RUNNER_STATES,
  createFeatureWalkthroughRunner,
  featureWalkthroughPreferenceKey
} from '../reference/browser/modules/feature-walkthrough-runner.js';

function source({ routeState = 'CURRENT', sourceVersionRef = 'source-version.test.001', planFeatureRef = 'feature.test' } = {}) {
  return {
    featureRegistry: {
      features: [
        {
          featureRef: 'feature.test',
          humanIntroduction: {
            disposition: 'WALKTHROUGH',
            routeState,
            planRefOrNull: 'plan.test.001',
            rationale: 'runner fixture'
          }
        },
        {
          featureRef: 'feature.discoverable',
          humanIntroduction: {
            disposition: 'DISCOVERABLE_ONLY',
            routeState: 'CURRENT',
            planRefOrNull: null,
            rationale: 'discoverable fixture'
          }
        }
      ]
    },
    experience: {
      featureWalkthroughPlans: [
        {
          planRef: 'plan.test.001',
          journeyRef: 'journey.test.001',
          featureRef: planFeatureRef,
          sourceVersionRef,
          experienceProfileRef: 'experience.test',
          effects: false,
          replayable: true,
          stages: [
            {
              stageRef: 'stage.test.open',
              sequence: 0,
              purposeClass: 'OPEN',
              contentStringRef: 'guide.test.open',
              targetRefOrNull: 'element.test.open',
              actionRefOrNull: 'action.test.open',
              expectedOutcomeClass: 'VISIBLE',
              captureRequired: false,
              recoveryClass: 'STOP_WITHOUT_EFFECT'
            },
            {
              stageRef: 'stage.test.explain',
              sequence: 1,
              purposeClass: 'EXPLAIN',
              contentStringRef: 'guide.test.explain',
              targetRefOrNull: null,
              actionRefOrNull: null,
              expectedOutcomeClass: 'UNDERSTOOD',
              captureRequired: true,
              recoveryClass: 'STOP_WITHOUT_EFFECT'
            }
          ],
          truthBoundaries: ['PLAN_EXISTS != PLAN_LIVED'],
          supersedesPlanRefOrNull: null
        }
      ]
    }
  };
}

function preferenceStore() {
  const values = new Map();
  return {
    values,
    read: (key) => values.has(key) ? structuredClone(values.get(key)) : null,
    write: (key, value) => { values.set(key, structuredClone(value)); return structuredClone(value); },
    remove: (key) => values.delete(key)
  };
}

function runner(options = {}) {
  const fixture = source(options.source);
  const store = options.store ?? preferenceStore();
  const frame = options.frame ?? { screenRef: 'screen.test' };
  const evaluateTarget = options.evaluateTarget ?? ((targetRef, currentFrame) => ({
    state: targetRef === 'element.test.open' && currentFrame?.screenRef === 'screen.test' ? 'AVAILABLE' : 'UNAVAILABLE',
    targetNodeRef: targetRef,
    actionRef: 'action.test.open',
    screenRef: currentFrame?.screenRef ?? null,
    reason: 'TEST_EVALUATION'
  }));
  return {
    fixture,
    store,
    value: createFeatureWalkthroughRunner({
      ...fixture,
      preferenceStore: store,
      currentFrame: () => frame,
      evaluateTarget,
      runRefFactory: () => options.runRef ?? 'run.test.001'
    })
  };
}

test('FPB1-00 CURRENT walkthrough resolves the exact same-feature plan', () => {
  const { value } = runner();
  const offer = value.offer('feature.test');
  assert.equal(offer.state, FEATURE_WALKTHROUGH_RUNNER_STATES.READY);
  assert.equal(offer.planRef, 'plan.test.001');
  assert.equal(offer.sourceVersionRef, 'source-version.test.001');
  assert.equal(offer.stageCount, 2);
  assert.equal('plan' in offer, false);
});

test('FPB1-01 HELD, missing and mismatched plans fail closed', () => {
  assert.equal(runner({ source: { routeState: 'HELD' } }).value.offer('feature.test').state, FEATURE_WALKTHROUGH_RUNNER_STATES.HELD);
  assert.equal(runner({ source: { planFeatureRef: 'feature.other' } }).value.offer('feature.test').reason, 'PLAN_FEATURE_MISMATCH');

  const fixture = source();
  fixture.experience.featureWalkthroughPlans = [];
  const result = createFeatureWalkthroughRunner({
    ...fixture,
    preferenceStore: preferenceStore(),
    currentFrame: () => ({ screenRef: 'screen.test' }),
    evaluateTarget: () => ({ state: 'AVAILABLE', actionRef: 'action.test.open' })
  }).offer('feature.test');
  assert.equal(result.reason, 'CURRENT_PLAN_MISSING');
  assert.equal(result.effects.protectedActionExecuted, false);
});

test('FPB1-02 Show me creates only a fresh ephemeral run identity', () => {
  const { value } = runner({ runRef: 'run.test.explicit' });
  const run = value.showMe('feature.test');
  assert.equal(run.state, FEATURE_WALKTHROUGH_RUNNER_STATES.ACTIVE);
  assert.equal(run.runRef, 'run.test.explicit');
  assert.equal(run.stageIndex, 0);
  assert.equal(run.effects.journeyCompletionCreated, false);
  assert.equal(run.effects.memoryWritten, false);
});

test('FPB1-03 current-frame target rejection produces no fabricated runnable stage', () => {
  const { value } = runner({ frame: { screenRef: 'screen.other' } });
  const stage = value.stage(value.showMe('feature.test'));
  assert.equal(stage.state, FEATURE_WALKTHROUGH_RUNNER_STATES.UNAVAILABLE);
  assert.equal(stage.reason, 'CURRENT_TARGET_UNAVAILABLE');
  assert.equal(stage.effects.protectedActionExecuted, false);
  assert.equal('stage' in stage, false);
});

test('FPB1-04 actionRef remains descriptive and is never auto-executed', () => {
  let calls = 0;
  const { value } = runner({
    evaluateTarget(targetRef) {
      calls += 1;
      return { state: 'AVAILABLE', targetNodeRef: targetRef, actionRef: 'action.test.open' };
    }
  });
  const stage = value.stage(value.showMe('feature.test'));
  assert.equal(calls, 1);
  assert.equal(stage.stage.actionRefOrNull, 'action.test.open');
  assert.equal(stage.autoExecute, false);
  assert.equal(stage.effects.protectedActionExecuted, false);
});

test('FPB1-05 Later persists DEFERRED without creating completion', () => {
  const { value, store } = runner();
  const deferred = value.later('feature.test');
  assert.equal(deferred.state, 'DEFERRED');
  assert.equal(deferred.completionAuthority, 'JOURNEY_REQUIRED');
  assert.equal(deferred.effects.journeyCompletionCreated, false);
  assert.equal(value.offer('feature.test').state, FEATURE_WALKTHROUGH_RUNNER_STATES.DEFERRED);
  assert.equal(store.values.size, 1);
});

test("FPB1-06 Don't introduce again is scoped to exact feature/plan/sourceVersion", () => {
  const store = preferenceStore();
  const first = runner({ store });
  const suppressed = first.value.suppress('feature.test');
  assert.equal(suppressed.state, 'SUPPRESSED');
  assert.equal(first.value.offer('feature.test').state, FEATURE_WALKTHROUGH_RUNNER_STATES.SUPPRESSED);
  assert.equal(suppressed.effects.memoryWritten, false);

  const expectedKey = featureWalkthroughPreferenceKey({
    featureRef: 'feature.test',
    planRef: 'plan.test.001',
    sourceVersionRef: 'source-version.test.001'
  });
  assert.equal(store.values.has(expectedKey), true);
});

test('FPB1-07 sourceVersion change does not inherit old suppression', () => {
  const store = preferenceStore();
  runner({ store }).value.suppress('feature.test');
  const next = runner({ store, source: { sourceVersionRef: 'source-version.test.002' } });
  assert.equal(next.value.offer('feature.test').state, FEATURE_WALKTHROUGH_RUNNER_STATES.READY);
  assert.equal(store.values.size, 1);
});

test('FPB1-08 exhausting plan stages never creates Journey completion', () => {
  const { value } = runner();
  const first = value.showMe('feature.test');
  const second = value.advance(first);
  assert.equal(second.stageIndex, 1);
  const exhaustedRun = value.advance(second);
  assert.equal(exhaustedRun.stageIndex, 2);
  const exhausted = value.stage(exhaustedRun);
  assert.equal(exhausted.state, FEATURE_WALKTHROUGH_RUNNER_STATES.PLAN_STAGES_EXHAUSTED);
  assert.equal(exhausted.completionAuthority, 'JOURNEY_REQUIRED');
  assert.equal(exhausted.effects.journeyCompletionCreated, false);
  assert.equal('completed' in exhausted, false);
});

test('FPB1-09 browser bundle exposes FeatureRegistry without removing existing fields', async () => {
  const previousFetch = globalThis.fetch;
  const seen = [];
  const fixtures = new Map([
    ['blueprint/vexlife.blueprint.json', { screens: [], includes: null }],
    ['blueprint/experience-registry.json', { registryRef: 'experience.test' }],
    ['blueprint/feature-registry.json', { registryRef: 'features.test', features: [] }],
    ['blueprint/design-tokens.json', { tokenSetRef: 'tokens.test' }],
    ['blueprint/strings/en.json', { language: 'English' }],
    ['blueprint/strings/zh.json', { language: '中文' }],
    ['blueprint/strings/ja.json', { language: '日本語' }]
  ]);
  globalThis.fetch = async (url) => {
    const relative = String(url).replace(/^test-root\//, '');
    seen.push(relative);
    return {
      ok: fixtures.has(relative),
      status: fixtures.has(relative) ? 200 : 404,
      async json() { return structuredClone(fixtures.get(relative)); }
    };
  };
  try {
    const bundle = await loadBrowserBundle('test-root/');
    assert.equal(bundle.featureRegistry.registryRef, 'features.test');
    assert.equal(bundle.experience.registryRef, 'experience.test');
    assert.equal(bundle.designTokens.tokenSetRef, 'tokens.test');
    assert.deepEqual(Object.keys(bundle.catalogs).sort(), ['en', 'ja', 'zh']);
    assert.equal(seen.includes('blueprint/feature-registry.json'), true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

// [VXG RealForever]
