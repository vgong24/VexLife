import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURE_WALKTHROUGH_RUNNER_STATES,
  createFeatureWalkthroughRunner,
  createLocalStorageFeatureWalkthroughPreferenceStore,
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

test('FPB1-A01 malformed preference identity fails closed instead of suppressing or re-offering', () => {
  const values = new Map();
  const key = featureWalkthroughPreferenceKey({ featureRef:'feature.test', planRef:'plan.test.001', sourceVersionRef:'source-version.test.001' });
  values.set(key, { state:'SUPPRESSED', featureRef:'feature.other', planRef:'plan.test.001', sourceVersionRef:'source-version.test.001' });
  const result = make({ preferenceStore:store(values) }).offer('feature.test');
  assert.equal(result.state, FEATURE_WALKTHROUGH_RUNNER_STATES.UNAVAILABLE);
  assert.equal(result.reason, 'PREFERENCE_RECORD_INVALID');
  assert.equal(result.effects.memoryWritten, false);
  assert.equal(result.effects.protectedActionExecuted, false);
});

test('FPB1-A02 injected adapter and storage write/clear failures remain no-effect unavailable states', () => {
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

test('FPB1-A04 unreadable or malformed scoped preference storage blocks offers fail closed', () => {
  let result = make({ preferenceStore:{
    read(){throw new Error('storage denied');},
    write(){},
    remove(){}
  } }).offer('feature.test');
  assert.equal(result.state, FEATURE_WALKTHROUGH_RUNNER_STATES.UNAVAILABLE);
  assert.equal(result.reason, 'PREFERENCE_READ_FAILED');
  assert.equal(result.effects.journeyCompletionCreated, false);
  assert.equal(result.effects.memoryWritten, false);

  const malformedStorage = {
    getItem(){ return '{not-json'; },
    setItem(){},
    removeItem(){}
  };
  const localStore = createLocalStorageFeatureWalkthroughPreferenceStore(malformedStorage);
  result = make({ preferenceStore:localStore }).offer('feature.test');
  assert.equal(result.state, FEATURE_WALKTHROUGH_RUNNER_STATES.UNAVAILABLE);
  assert.equal(result.reason, 'PREFERENCE_READ_FAILED');
  assert.equal(result.effects.protectedActionExecuted, false);
});

test('FPB1-A05 required repeated target binding cannot silently fall back to a singleton match', () => {
  const runner = make({
    evaluateTarget: (targetRef) => ({
      state: 'AVAILABLE',
      targetNodeRef: targetRef,
      actionRef: 'action.test.open',
      bindingRequired: true,
      targetBindingOrNull: null
    })
  });
  const result = runner.stage(runner.showMe('feature.test'));
  assert.equal(result.state, FEATURE_WALKTHROUGH_RUNNER_STATES.UNAVAILABLE);
  assert.equal(result.reason, 'TARGET_BINDING_REQUIRED');
  assert.equal(result.effects.protectedActionExecuted, false);
  assert.equal('stage' in result, false);
});

test('FPB1-A06 ambiguous dynamic action-bearing target fails closed without an exact instance or selection', () => {
  const runner = make({
    evaluateTarget: (targetRef) => ({
      state: 'AVAILABLE',
      targetNodeRef: targetRef,
      actionRef: 'action.test.open',
      bindingRequired: true,
      targetBindingOrNull: {
        targetRef,
        targetKind: 'ELEMENT',
        screenRefOrNull: 'screen.test',
        regionRefOrNull: 'region.test.rows',
        componentRefOrNull: 'component.test.row',
        slotRefOrNull: null,
        instanceRefOrNull: null,
        entityRefOrNull: null,
        selectionRefOrNull: null,
        bindingPolicy: 'CURRENT_SELECTED_INSTANCE'
      }
    })
  });
  const result = runner.stage(runner.showMe('feature.test'));
  assert.equal(result.state, FEATURE_WALKTHROUGH_RUNNER_STATES.UNAVAILABLE);
  assert.equal(result.reason, 'TARGET_BINDING_INVALID');
  assert.match(result.bindingErrors[0], /exact selectionRefOrNull or instanceRefOrNull/);
  assert.equal(result.effects.protectedActionExecuted, false);
});

test('FPB1-A07 runtime binding cannot point at a different canonical target than the plan stage', () => {
  const runner = make({
    evaluateTarget: () => ({
      state: 'AVAILABLE',
      actionRef: 'action.test.open',
      targetBindingOrNull: {
        targetRef: 'element.test.other',
        targetKind: 'ELEMENT',
        screenRefOrNull: 'screen.test',
        regionRefOrNull: null,
        componentRefOrNull: null,
        slotRefOrNull: null,
        instanceRefOrNull: null,
        entityRefOrNull: null,
        selectionRefOrNull: null,
        bindingPolicy: 'STATIC_CANONICAL_TARGET'
      }
    })
  });
  const result = runner.stage(runner.showMe('feature.test'));
  assert.equal(result.state, FEATURE_WALKTHROUGH_RUNNER_STATES.UNAVAILABLE);
  assert.equal(result.reason, 'TARGET_BINDING_INVALID');
  assert.match(result.bindingErrors[0], /must match the walkthrough targetRef/);
  assert.equal(result.effects.protectedActionExecuted, false);
});

// [VXG RealForever]
