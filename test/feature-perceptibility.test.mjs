import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import {
  scaffoldFeatureContract,
  validateFeatureRegistry
} from '../src/core/feature-registry.mjs';
import {
  ExperienceRegistry,
  GUIDED_ESTABLISHMENT_JOURNEY_REF,
  GUIDED_ESTABLISHMENT_PLAN_REF,
  GUIDED_ESTABLISHMENT_PROFILE_REF,
  GUIDED_ESTABLISHMENT_STAGE_PURPOSES,
  validateExperienceRegistry
} from '../src/core/experience.mjs';

const bundle = loadBlueprint();

const experienceValidationOptions = () => ({
  actionRefs: new Set((bundle.blueprint.actions ?? []).map((item) => item.actionRef)),
  componentRefs: new Set((bundle.blueprint.components ?? []).map((item) => item.componentRef)),
  stringRefs: new Set(Object.values(bundle.strings).flatMap((catalog) => Object.keys(catalog)))
});

const validateExperienceOnly = (source) => validateExperienceRegistry(source, experienceValidationOptions());
const validateFeatureOnly = (registry, experience = bundle.experience) => validateFeatureRegistry(
  registry,
  { ...bundle, featureRegistry: registry, experience }
);

function featurePlan({
  planRef = 'plan.vexlife.feature.test-introduction.001',
  journeyRef = 'journey.vexlife.feature.test-introduction.001',
  featureRef = 'feature.vexlife.addressed-conversation',
  sourceVersionRef = 'source-version.vexlife.feature.test-introduction.001',
  supersedesPlanRefOrNull = null
} = {}) {
  return {
    planRef,
    journeyRef,
    featureRef,
    sourceVersionRef,
    experienceProfileRef: GUIDED_ESTABLISHMENT_PROFILE_REF,
    effects: false,
    replayable: true,
    stages: [
      {
        stageRef: `${planRef}.stage.explain`,
        sequence: 0,
        purposeClass: 'EXPLAIN',
        contentStringRef: 'guide.title',
        targetRefOrNull: 'screen.vexlife.chat',
        actionRefOrNull: null,
        expectedOutcomeClass: 'FEATURE_INTRODUCTION_UNDERSTOOD',
        captureRequired: true,
        recoveryClass: 'STOP_WITHOUT_EFFECT'
      }
    ],
    truthBoundaries: [
      'PLAN_EXISTS != PLAN_LIVED',
      'PLAN_LIVED != REVIEW_ARCHIVE'
    ],
    supersedesPlanRefOrNull
  };
}

function withFeaturePlan(plan = featurePlan()) {
  const source = structuredClone(bundle.experience);
  source.featureWalkthroughPlans = [plan];
  return source;
}

function featureByRef(registry, featureRef) {
  const feature = registry.features.find((candidate) => candidate.featureRef === featureRef);
  assert.ok(feature, `missing test fixture ${featureRef}`);
  return feature;
}

test('FPA-00 current registry requires explicit humanIntroduction on every feature', () => {
  const current = validateFeatureOnly(bundle.featureRegistry);
  assert.equal(current.ok, true, current.errors.join('\n'));
  assert.equal(bundle.featureRegistry.featureSchema.requiredFields.includes('humanIntroduction'), true);
  assert.equal(bundle.featureRegistry.features.every((feature) => feature.humanIntroduction), true);

  const missing = structuredClone(bundle.featureRegistry);
  delete missing.features[0].humanIntroduction;
  const result = validateFeatureOnly(missing);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('missing humanIntroduction')));
});

test('FPA-01 unknown introduction disposition or route state fails closed', () => {
  const badDisposition = structuredClone(bundle.featureRegistry);
  badDisposition.features[0].humanIntroduction.disposition = 'MAGIC_DISCOVERY';
  let result = validateFeatureOnly(badDisposition);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('unknown disposition')));

  const badState = structuredClone(bundle.featureRegistry);
  badState.features[0].humanIntroduction.routeState = 'MAYBE';
  result = validateFeatureOnly(badState);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('unknown routeState')));
});

test('FPA-02 NONE_JUSTIFIED is explicit, reasoned, and unavailable to registered human-visible surfaces', () => {
  const blank = structuredClone(bundle.featureRegistry);
  featureByRef(blank, 'feature.vexlife.repository-health').humanIntroduction.rationale = '   ';
  let result = validateFeatureOnly(blank);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('requires explicit rationale')));

  const visible = structuredClone(bundle.featureRegistry);
  featureByRef(visible, 'feature.vexlife.addressed-conversation').humanIntroduction = {
    disposition: 'NONE_JUSTIFIED',
    routeState: 'CURRENT',
    planRefOrNull: null,
    rationale: 'candidate justification'
  };
  result = validateFeatureOnly(visible);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('cannot use NONE_JUSTIFIED')));
});

test('FPA-03 DISCOVERABLE_ONLY requires explicit rationale and cannot smuggle a walkthrough plan', () => {
  const blank = structuredClone(bundle.featureRegistry);
  featureByRef(blank, 'feature.vexlife.addressed-conversation').humanIntroduction.rationale = '';
  let result = validateFeatureOnly(blank);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('requires explicit rationale')));

  const withPlan = structuredClone(bundle.featureRegistry);
  featureByRef(withPlan, 'feature.vexlife.addressed-conversation').humanIntroduction.planRefOrNull = 'plan.vexlife.feature.unowned.001';
  result = validateFeatureOnly(withPlan);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('must not name a plan')));
});

test('FPA-04 CURRENT WALKTHROUGH requires a resolving feature walkthrough plan for the same feature', () => {
  const registry = structuredClone(bundle.featureRegistry);
  featureByRef(registry, 'feature.vexlife.addressed-conversation').humanIntroduction = {
    disposition: 'WALKTHROUGH',
    routeState: 'CURRENT',
    planRefOrNull: 'plan.vexlife.feature.test-introduction.001',
    rationale: 'test route'
  };

  let result = validateFeatureOnly(registry);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('missing feature walkthrough plan')));

  const experience = withFeaturePlan();
  assert.equal(validateExperienceOnly(experience).ok, true);
  result = validateFeatureOnly(registry, experience);
  assert.equal(result.ok, true, result.errors.join('\n'));

  experience.featureWalkthroughPlans[0].featureRef = 'feature.vexlife.terrain';
  result = validateFeatureOnly(registry, experience);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('belongs to feature.vexlife.terrain')));
});

test('FPA-05 HELD WALKTHROUGH reserves identity without pretending the route is current', () => {
  const livingJournal = featureByRef(bundle.featureRegistry, 'feature.vexlife.living-journal');
  assert.deepEqual(livingJournal.humanIntroduction, {
    disposition: 'WALKTHROUGH',
    routeState: 'HELD',
    planRefOrNull: 'plan.vexlife.feature.living-journal.introduction.001',
    rationale: livingJournal.humanIntroduction.rationale
  });
  assert.ok(livingJournal.humanIntroduction.rationale.length > 0);
  assert.equal(validateFeatureOnly(bundle.featureRegistry).ok, true);
});

test('FPA-06 FeatureWalkthroughPlan projection is declarative and creates no lived Journey completion', () => {
  const experience = withFeaturePlan();
  const registry = new ExperienceRegistry(experience);
  const projection = registry.buildFeatureWalkthroughProjection('plan.vexlife.feature.test-introduction.001');

  assert.equal(projection.effects, false);
  assert.equal(projection.featureRef, 'feature.vexlife.addressed-conversation');
  assert.equal(projection.journeyRef, 'journey.vexlife.feature.test-introduction.001');
  assert.equal(projection.replayable, true);
  for (const forbidden of ['runRef', 'completed', 'completion', 'journeyEvents', 'livedAt']) {
    assert.equal(Object.hasOwn(projection, forbidden), false);
  }
});

test('FPA-07 feature walkthrough grammar does not reopen canonical ONB-00 identity or ordering', () => {
  const before = new ExperienceRegistry(bundle.experience).guidedEstablishmentPlan(GUIDED_ESTABLISHMENT_PLAN_REF);
  const experience = withFeaturePlan();
  const result = validateExperienceOnly(experience);
  assert.equal(result.ok, true, result.errors.join('\n'));
  const after = new ExperienceRegistry(experience).guidedEstablishmentPlan(GUIDED_ESTABLISHMENT_PLAN_REF);

  assert.deepEqual(after, before);
  assert.equal(after.planRef, GUIDED_ESTABLISHMENT_PLAN_REF);
  assert.equal(after.journeyRef, GUIDED_ESTABLISHMENT_JOURNEY_REF);
  assert.deepEqual(after.stages.map((stage) => stage.purposeClass), [...GUIDED_ESTABLISHMENT_STAGE_PURPOSES]);
});

test('FPA-08 feature walkthrough stages require unique stable refs and contiguous order', () => {
  const duplicate = featurePlan();
  duplicate.stages.push({ ...structuredClone(duplicate.stages[0]), sequence: 1 });
  let result = validateExperienceOnly(withFeaturePlan(duplicate));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('duplicate stageRef')));

  const reordered = featurePlan();
  reordered.stages[0].sequence = 4;
  result = validateExperienceOnly(withFeaturePlan(reordered));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('sequence must be contiguous and zero-based')));
});

test('FPA-09 feature walkthrough plans are no-effect and cannot gain implicit auto-execution fields', () => {
  const effectful = featurePlan();
  effectful.effects = true;
  let result = validateExperienceOnly(withFeaturePlan(effectful));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('effects must be false')));

  const autoExecute = featurePlan();
  autoExecute.stages[0].autoExecute = true;
  result = validateExperienceOnly(withFeaturePlan(autoExecute));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('unsupported field autoExecute')));
});

test('FPA-10 Review Kit seed is source-version-bound and portable without renderer/backend selectors', () => {
  const experience = withFeaturePlan();
  const registry = new ExperienceRegistry(experience);
  const seed = registry.buildFeatureWalkthroughReviewSeed('plan.vexlife.feature.test-introduction.001');

  assert.equal(seed.featureOrJourneyRef, 'journey.vexlife.feature.test-introduction.001');
  assert.deepEqual(seed.reviewStepRefs, ['plan.vexlife.feature.test-introduction.001.stage.explain']);
  assert.deepEqual(seed.captureAtStepRefs, ['plan.vexlife.feature.test-introduction.001.stage.explain']);
  assert.equal(seed.sourceVersionRef, 'source-version.vexlife.feature.test-introduction.001');
  assert.equal(seed.effects, false);

  const serialized = JSON.stringify(seed);
  for (const forbidden of [
    'playwrightSelector',
    'cssSelector',
    'xpath',
    'backendCommand',
    'browserCommand',
    'pageUrl',
    'captureFunction'
  ]) assert.equal(serialized.includes(forbidden), false);
});

test('FPA-11 supersession is explicit identity metadata and cannot self-supersede', () => {
  const oldPlan = featurePlan();
  const replacement = featurePlan({
    planRef: 'plan.vexlife.feature.test-introduction.002',
    journeyRef: 'journey.vexlife.feature.test-introduction.002',
    sourceVersionRef: 'source-version.vexlife.feature.test-introduction.002',
    supersedesPlanRefOrNull: oldPlan.planRef
  });
  const source = structuredClone(bundle.experience);
  source.featureWalkthroughPlans = [oldPlan, replacement];
  let result = validateExperienceOnly(source);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(
    new ExperienceRegistry(source).buildFeatureWalkthroughProjection(replacement.planRef).supersedesPlanRefOrNull,
    oldPlan.planRef
  );

  replacement.supersedesPlanRefOrNull = replacement.planRef;
  result = validateExperienceOnly({ ...structuredClone(bundle.experience), featureWalkthroughPlans: [replacement] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('cannot supersede itself')));
});

test('FPA-12 feature scaffolding requires an explicit introduction decision and never invents a permissive default', () => {
  assert.throws(
    () => scaffoldFeatureContract({ featureRef: 'feature.vexlife.test', purpose: 'test feature' }),
    /humanIntroduction is required/
  );

  const candidate = scaffoldFeatureContract({
    featureRef: 'feature.vexlife.test',
    purpose: 'test feature',
    platformRefs: ['platform.browser'],
    humanIntroduction: {
      disposition: 'NONE_JUSTIFIED',
      routeState: 'CURRENT',
      planRefOrNull: null,
      rationale: 'No human-visible canonical surface has been registered yet.'
    }
  });
  assert.equal(candidate.humanIntroduction.disposition, 'NONE_JUSTIFIED');
  assert.equal(candidate.humanIntroduction.planRefOrNull, null);
});

test('FPA-13 full blueprint remains valid with explicit introduction migration and no concrete feature plan materialized', () => {
  assert.equal(Object.hasOwn(bundle.experience, 'featureWalkthroughPlans'), false);
  const result = validateBlueprint(bundle);
  assert.equal(result.ok, true, result.errors.join('\n'));
});

// [VXG RealForever]
