import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { buildSparseBrowserCapturePlan } from '../src/core/experience-review-kit.mjs';
import {
  buildSeededNoEffectBrowserCapturePlan,
  seededTimeBudgetRemaining,
  SEEDED_EXPLORATION_SCHEMA
} from '../src/core/experience-review-seeded.mjs';
import { createBrowserExperienceReviewAdapter } from '../reference/browser/modules/experience-review-adapter.js';
import { createVexLifeBrowserServer } from '../scripts/serve-browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACTIONS = loadBlueprint(ROOT).blueprint.actions;

function forbiddenEffectClasses(actions = ACTIONS) {
  return [...new Set(actions.map((action) => action.effectClass).filter((value) => value !== 'READ_ONLY'))].sort();
}

function steps() {
  return [
    {
      reviewStepRef: 'review-step.seeded.chat',
      sequence: 0,
      actionRef: 'action.view.select',
      targetNodeRef: 'element.nav.chat',
      expectedStateRef: 'state.navigation'
    },
    {
      reviewStepRef: 'review-step.seeded.thread',
      sequence: 1,
      actionRef: 'action.thread.select',
      targetNodeRef: 'element.thread.open-conversation',
      expectedStateRef: 'state.selection'
    },
    {
      reviewStepRef: 'review-step.seeded.channel',
      sequence: 2,
      actionRef: 'action.channel.select',
      targetNodeRef: 'element.channel.group',
      expectedStateRef: 'state.selection'
    }
  ];
}

function requestBundle({
  seed = 'seed.alpha',
  stepBudget = 3,
  timeBudgetMs = 30_000,
  admittedActionRefs = ['action.view.select', 'action.thread.select', 'action.channel.select'],
  captureSteps = steps(),
  platformRef = 'platform.browser'
} = {}) {
  const stepRefs = captureSteps.map((step) => step.reviewStepRef);
  return {
    schemaVersion: 'vexlife.experience-review.request/v0',
    portableContractRef: 'contract.vextreme.experience-review.portable.v0',
    portableSchemaVersionRef: 'vextreme.experience-review.portable-contract/v0',
    reviewEpoch: {
      reviewEpochRef: 'epoch.seeded.test',
      reviewPlanRef: 'plan.seeded.test',
      reviewRequestRef: 'request.seeded.test',
      sourceVersionRef: 'github.commit.vexlife.seeded-test',
      truthClass: 'CURRENT_ACCEPTED_IMPLEMENTATION',
      state: 'PLANNED'
    },
    reviewPlan: {
      reviewPlanRef: 'plan.seeded.test',
      purpose: 'Bounded seeded NO_EFFECT review',
      experienceProfileRefs: ['experience.vexlife.companionship-simple'],
      reviewCaseRefs: ['case.seeded.test'],
      lensRefs: ['lens.vexlife.usability-and-journey'],
      humanBurden: 'NATURAL_REACTION_OR_QUESTION',
      seededExploration: {
        schemaVersion: SEEDED_EXPLORATION_SCHEMA,
        captureRequestRef: 'capture.seeded.test',
        executionEffectPolicy: 'NO_EFFECT',
        admittedActionRefs,
        reproducibleSeed: seed,
        stepBudget,
        timeBudgetMs,
        forbiddenEffectClasses: forbiddenEffectClasses(),
        stopOnUnknown: true,
        rawPrivateLogging: false,
        effectAuthorityRef: null,
        fixtureRef: null
      }
    },
    reviewRequest: {
      reviewRequestRef: 'request.seeded.test',
      reviewEpochRef: 'epoch.seeded.test',
      reviewCaseRefs: ['case.seeded.test'],
      captureRequestRefs: ['capture.seeded.test'],
      comparisonMode: 'BASELINE_ONLY'
    },
    reviewCases: [{
      reviewCaseRef: 'case.seeded.test',
      title: 'Seeded path',
      featureOrJourneyRef: 'screen.vexlife.chat',
      whyItMatters: 'Bounded read-only traversal',
      reviewQuestion: 'Does the declared route remain coherent?',
      truthClass: 'CURRENT_ACCEPTED_IMPLEMENTATION',
      startingStateRef: 'state.navigation',
      routeRef: 'route.chat',
      reviewStepRefs: stepRefs,
      knownLimitations: [],
      doesNotProve: ['Human acceptance', 'Native-platform behavior', 'Effect authority']
    }],
    captureRequests: [{
      captureRequestRef: 'capture.seeded.test',
      reviewEpochRef: 'epoch.seeded.test',
      reviewCaseRef: 'case.seeded.test',
      platformRef,
      experienceProfileRef: 'experience.vexlife.companionship-simple',
      routeRef: 'route.chat',
      initialStateRef: 'state.navigation',
      localeRef: 'locale.en',
      themeRef: 'theme.foundation',
      deviceProfileRef: 'device.browser.desktop.reference',
      sourceVersionRef: 'github.commit.vexlife.seeded-test',
      truthClass: 'CURRENT_ACCEPTED_IMPLEMENTATION',
      steps: captureSteps,
      captureAtStepRefs: [stepRefs.at(-1)],
      reviewOverlay: { highlightTarget: false, showStableRef: false, showAction: false }
    }],
    package: { title: 'Seeded review test' }
  };
}

function binding(pageUrl = 'https://example.invalid/reference') {
  return [{
    captureRequestRef: 'capture.seeded.test',
    pageUrl,
    viewport: { width: 1440, height: 900 },
    stepBindings: {
      'review-step.seeded.chat': { kind: 'CLICK_CONTEXTUAL_PROJECTION_TARGET' },
      'review-step.seeded.thread': { kind: 'CLICK_STABLE_TARGET' },
      'review-step.seeded.channel': { kind: 'CLICK_STABLE_TARGET' }
    },
    artifactSlugs: {
      'review-step.seeded.chat': 'seeded-chat',
      'review-step.seeded.thread': 'seeded-thread',
      'review-step.seeded.channel': 'seeded-channel'
    }
  }];
}

function cloneActions() {
  return structuredClone(ACTIONS);
}

function action(actions, actionRef) {
  return actions.find((item) => item.actionRef === actionRef);
}

test('seeded NO_EFFECT selection is reproducible, seed-sensitive and exactly budgeted', () => {
  const alpha = buildSeededNoEffectBrowserCapturePlan(requestBundle({ seed: 'seed.alpha', stepBudget: 2 }), binding(), ACTIONS);
  const alphaAgain = buildSeededNoEffectBrowserCapturePlan(requestBundle({ seed: 'seed.alpha', stepBudget: 2 }), binding(), ACTIONS);
  const beta = buildSeededNoEffectBrowserCapturePlan(requestBundle({ seed: 'seed.beta', stepBudget: 2 }), binding(), ACTIONS);
  assert.deepEqual(alpha.selectedStepRefs, alphaAgain.selectedStepRefs);
  assert.notDeepEqual(alpha.selectedStepRefs, beta.selectedStepRefs);
  assert.equal(alpha.tasks.length, 2);
  assert.deepEqual(alpha.tasks.map((task) => task.captureRequest.steps.length), [1, 2]);
  assert.deepEqual(alpha.tasks.map((task) => task.captureRequest.captureAtStepRefs), alpha.selectedStepRefs.map((ref) => [ref]));
  assert.equal(alpha.executionEffectPolicy, 'NO_EFFECT');
  assert.equal(alpha.effectAuthorityRef, null);
  assert.equal(alpha.fixtureRef, null);
  assert.equal(alpha.rawPrivateLogging, false);
  assert.throws(
    () => buildSeededNoEffectBrowserCapturePlan(requestBundle({ stepBudget: 4 }), binding(), ACTIONS),
    /exceeds admitted capture step count/
  );
});

test('seeded NO_EFFECT admission re-resolves current actions and fails closed on authority or effect drift', () => {
  const permissioned = cloneActions();
  action(permissioned, 'action.view.select').permissionRef = 'permission.conversation.send';
  assert.throws(
    () => buildSeededNoEffectBrowserCapturePlan(requestBundle(), binding(), permissioned),
    /permissioned under current source/
  );

  const effectful = cloneActions();
  action(effectful, 'action.view.select').effectClass = 'LOCAL_APPEND';
  const effectfulRequest = requestBundle();
  effectfulRequest.reviewPlan.seededExploration.forbiddenEffectClasses = forbiddenEffectClasses(effectful);
  assert.throws(
    () => buildSeededNoEffectBrowserCapturePlan(effectfulRequest, binding(), effectful),
    /not READ_ONLY under current source/
  );

  const outsideAllowlist = requestBundle({ admittedActionRefs: ['action.architecture.open'] });
  assert.throws(
    () => buildSeededNoEffectBrowserCapturePlan(outsideAllowlist, binding(), ACTIONS),
    /outside the exact source-placed allowlist/
  );

  for (const effectActionRef of ['action.message.send', 'action.thread.delete', 'action.github.push-branch']) {
    const changedSteps = steps();
    changedSteps[1] = { ...changedSteps[1], actionRef: effectActionRef };
    assert.throws(
      () => buildSeededNoEffectBrowserCapturePlan(requestBundle({ captureSteps: changedSteps }), binding(), ACTIONS),
      /unadmitted action|permissioned|not READ_ONLY/
    );
  }
});

test('seeded NO_EFFECT plan refuses unknowns, fixtures, effect authority, native substitution and stale effect classes', () => {
  const unknownSteps = steps();
  unknownSteps[2] = { ...unknownSteps[2], actionRef: 'action.unknown.seeded' };
  assert.throws(
    () => buildSeededNoEffectBrowserCapturePlan(requestBundle({ captureSteps: unknownSteps }), binding(), ACTIONS),
    /unknown current action/
  );

  const unadmittedReadOnly = steps();
  unadmittedReadOnly[2] = { ...unadmittedReadOnly[2], actionRef: 'action.architecture.open' };
  assert.throws(
    () => buildSeededNoEffectBrowserCapturePlan(requestBundle({ captureSteps: unadmittedReadOnly }), binding(), ACTIONS),
    /unadmitted action/
  );

  const authority = requestBundle();
  authority.reviewPlan.seededExploration.effectAuthorityRef = 'authority.forbidden';
  assert.throws(() => buildSeededNoEffectBrowserCapturePlan(authority, binding(), ACTIONS), /must not carry effectAuthorityRef/);

  const fixture = requestBundle();
  fixture.reviewPlan.seededExploration.fixtureRef = 'fixture.forbidden';
  assert.throws(() => buildSeededNoEffectBrowserCapturePlan(fixture, binding(), ACTIONS), /must not carry fixtureRef/);

  const noStop = requestBundle();
  noStop.reviewPlan.seededExploration.stopOnUnknown = false;
  assert.throws(() => buildSeededNoEffectBrowserCapturePlan(noStop, binding(), ACTIONS), /stopOnUnknown must be true/);

  const privateLog = requestBundle();
  privateLog.reviewPlan.seededExploration.rawPrivateLogging = true;
  assert.throws(() => buildSeededNoEffectBrowserCapturePlan(privateLog, binding(), ACTIONS), /rawPrivateLogging must be false/);

  const native = requestBundle({ platformRef: 'platform.windows' });
  assert.throws(() => buildSeededNoEffectBrowserCapturePlan(native, binding(), ACTIONS), /native adapter is not admitted/);

  const stale = requestBundle();
  stale.reviewPlan.seededExploration.forbiddenEffectClasses = [];
  assert.throws(() => buildSeededNoEffectBrowserCapturePlan(stale, binding(), ACTIONS), /exactly cover current non-READ_ONLY effect classes/);
});

test('time budget helper is an exact stop bound and deterministic sparse review does not auto-activate seeded policy', () => {
  assert.equal(seededTimeBudgetRemaining(1_000, 500, 1_499), 1);
  assert.equal(seededTimeBudgetRemaining(1_000, 500, 1_500), 0);
  assert.equal(seededTimeBudgetRemaining(1_000, 500, 1_800), 0);

  const deterministic = buildSparseBrowserCapturePlan(requestBundle(), binding());
  assert.equal(deterministic.automaticCartesianExpansion, false);
  assert.equal(deterministic.matrixPolicy, 'EXPLICIT_CAPTURE_REQUESTS_ONLY');
  assert.equal(deterministic.tasks.length, 1);
  assert.equal(deterministic.tasks[0].step.reviewStepRef, 'review-step.seeded.channel');
  const acceptedCli = fs.readFileSync(path.join(ROOT, 'scripts', 'experience-review.mjs'), 'utf8');
  assert.doesNotMatch(acceptedCli, /experience-review-seeded|seededExploration/);
});

test('current browser route executes one bounded seeded READ_ONLY walk without native or effect authority', { timeout: 120_000 }, async (t) => {
  const server = createVexLifeBrowserServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.equal(typeof address, 'object');
  const pageUrl = `http://127.0.0.1:${address.port}/reference/browser/`;
  const oneStep = [steps()[0]];
  const request = requestBundle({
    seed: 'seed.real-browser',
    stepBudget: 1,
    admittedActionRefs: ['action.view.select'],
    captureSteps: oneStep
  });
  const plan = buildSeededNoEffectBrowserCapturePlan(request, binding(pageUrl), ACTIONS);
  assert.deepEqual(plan.selectedActionRefs, ['action.view.select']);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-seeded-review-'));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const adapter = createBrowserExperienceReviewAdapter({ browserType: chromium, settleMs: 0 });
  const evidence = await adapter.captureTasks(plan.tasks, out);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].captureState, 'CAPTURED', JSON.stringify(evidence[0].adapterReceipt.deviations));
  assert.equal(evidence[0].platformRef, 'platform.browser');
  assert.ok(fs.existsSync(path.join(out, plan.tasks[0].artifactFileName)));
});

// [VXG RealForever]
