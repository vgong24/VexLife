import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURE_WALKTHROUGH_RUNNER_STATES,
  createFeatureWalkthroughRunner,
  featureWalkthroughPreferenceKey
} from '../reference/browser/modules/feature-walkthrough-runner.js';

const feature = (overrides = {}) => ({
  featureRef: 'feature.test',
  humanIntroduction: {
    disposition: 'WALKTHROUGH',
    routeState: 'CURRENT',
    planRefOrNull: 'plan.test.001',
    rationale: 'adversarial fixture',
    ...overrides
  }
});
const plan = (overrides = {}) => ({
  planRef: 'plan.test.001',
  journeyRef: 'journey.test.001',
  featureRef: 'feature.test',
  sourceVersionRef: 'source-version.test.001',
  experienceProfileRef: 'experience.test',
  effects: false,
  replayable: true,
  stages: [{
    stageRef: 'stage.test.001', sequence: 0, purposeClass: 'OPEN',
    contentStringRef: 'guide.test.open', targetRefOrNull: 'element.test.open',
    actionRefOrNull: 'action.test.open', expectedOutcomeClass: 'VISIBLE',
    captureRequired: false, recoveryClass: 'STOP_WITHOUT_EFFECT'
  }],
  truthBoundaries: ['PLAN_EXISTS != PLAN_LIVED'],
  supersedesPlanRefOrNull: null,
  ...overrides
});
function store(initial = new Map()) {
  return {
    values: initial,
    read: (key) => initial.get(key) ?? null,
    write: (key, value) => initial.set(key, structuredClone(value)),
    remove: (key) => initial.delete(key)
  };
}
function make({ features = [feature()], plans = [plan()], preferenceStore = store(), evaluateTarget = () => ({ state:'AVAILABLE', actionRef:'action.test.open' }), currentFrame = () => ({ screenRef:'screen.test' }) } = {}) {
  return createFeatureWalkthroughRunner({
    featureRegistry: { features },
    experience: { featureWalkthroughPlans: plans },
    preferenceStore,
    evaluateTarget,
    currentFrame,
    runRefFactory: () => 'run.test.001'
  });
}

test('FPB1-A00 unknown dispositions, held no-plan routes, and duplicate refs fail closed', () => {
  assert.equal(make({ features:[feature({ disposition:'MAGIC' })] }).offer('feature.test').reason, 'HUMAN_INTRODUCTION_DISPOSITION_INVALID');
  assert.equal(make({ features:[feature({ disposition:'DISCOVERABLE_ONLY', routeState:'HELD', planRefOrNull:null })] }).offer('feature.test').state, FEATURE_WALKTHROUGH_RUNNER_STATES.HELD);
  assert.equal(make({ features:[feature(), feature()] }).offer('feature.test').reason, 'FEATURE_REF_AMBIGUOUS');
  assert.equal(make({ plans:[plan(), plan()] }).offer('feature.test').reason, 'CURRENT_PLAN_AMBIGUOUS');
});

test('FPB1-A01 malformed preference identity cannot suppress a current route', () => {
  const values = new Map();
  const key = featureWalkthroughPreferenceKey({ featureRef:'feature.test', planRef:'plan.test.001', sourceVersionRef:'source-version.test.001' });
  values.set(key, { state:'SUPPRESSED', featureRef:'feature.other', planRef:'plan.test.001', sourceVersionRef:'source-version.test.001' });
  assert.equal(make({ preferenceStore:store(values) }).offer('feature.test').state, FEATURE_WALKTHROUGH_RUNNER_STATES.READY);
});

test('FPB1-A02 injected adapter and storage failures remain no-effect unavailable states', () => {
  let runner = make({ evaluateTarget(){ throw new Error('adapter failed'); } });
  let result = runner.stage(runner.showMe('feature.test'));
  assert.equal(result.reason, 'TARGET_EVALUATION_FAILED');
  assert.equal(result.effects.protectedActionExecuted, false);
  assert.equal(result.effects.memoryWritten, false);

  runner = make({ preferenceStore:{ read(){return null;}, write(){throw new Error('disk');}, remove(){throw new Error('disk');} } });
  result = runner.suppress('feature.test');
  assert.equal(result.reason, 'PREFERENCE_WRITE_FAILED');
  assert.equal(result.effects.memoryWritten, false);
  result = runner.clearPreference('feature.test');
  assert.equal(result.reason, 'PREFERENCE_CLEAR_FAILED');
});

test('FPB1-A03 forged run state and malformed plan stages do not crash into runnable truth', () => {
  const runner = make();
  assert.equal(runner.stage({ state:'ACTIVE', featureRef:'feature.test', runRef:'run.test', planRef:'plan.test.001', sourceVersionRef:'source-version.test.001', stageIndex:'zero' }).reason, 'RUN_NOT_ACTIVE');
  const malformed = plan();
  malformed.stages[0].targetRefOrNull = '';
  assert.equal(make({ plans:[malformed] }).offer('feature.test').reason, 'PLAN_STAGE_IDENTITY_INVALID');
});

// [VXG RealForever]
