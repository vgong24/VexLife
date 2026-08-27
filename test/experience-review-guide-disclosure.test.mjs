import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import {
  PORTABLE_CONTRACT_REF,
  PORTABLE_SCHEMA_VERSION,
  buildSparseBrowserCapturePlan
} from '../src/core/experience-review-kit.mjs';
import {
  ADAPTER_VERSION_REF,
  createBrowserExperienceReviewAdapter
} from '../reference/browser/modules/experience-review-adapter.js';
import { createVexLifeBrowserServer } from '../scripts/serve-browser.mjs';

const CURRENT_TRUTH = 'CURRENT_ACCEPTED_IMPLEMENTATION';
const CASE_REF = 'review-case.test.stage5-guide-disclosure';
const CAPTURE_REF = 'capture.test.stage5-guide-disclosure';
const EPOCH_REF = 'epoch.test.stage5-guide-disclosure';
const PLAN_REF = 'plan.test.stage5-guide-disclosure';
const REQUEST_REF = 'request.test.stage5-guide-disclosure';

const steps = Object.freeze([
  Object.freeze({
    reviewStepRef: 'review-step.test.stage5.vex-summon',
    sequence: 0,
    actionRef: 'action.vex.summon',
    targetNodeRef: 'element.vex.summon',
    expectedStateRef: 'state.guide'
  }),
  Object.freeze({
    reviewStepRef: 'review-step.test.stage5.chat-entry',
    sequence: 1,
    actionRef: 'action.view.select',
    targetNodeRef: 'element.nav.chat',
    expectedStateRef: 'state.navigation'
  }),
  Object.freeze({
    reviewStepRef: 'review-step.test.stage5.thread-select',
    sequence: 2,
    actionRef: 'action.thread.select',
    targetNodeRef: 'element.thread.open-conversation',
    expectedStateRef: 'state.selection'
  }),
  Object.freeze({
    reviewStepRef: 'review-step.test.stage5.channel-select',
    sequence: 3,
    actionRef: 'action.channel.select',
    targetNodeRef: 'element.channel.group',
    expectedStateRef: 'state.selection'
  }),
  Object.freeze({
    reviewStepRef: 'review-step.test.stage5.guide-current',
    sequence: 4,
    actionRef: 'action.guide.ask',
    targetNodeRef: 'element.guide.ask-current',
    expectedStateRef: 'state.guide'
  })
]);

function reviewBundle({ onlyGuide = false } = {}) {
  const selectedSteps = onlyGuide ? [structuredClone(steps.at(-1))] : steps.map((step) => structuredClone(step));
  if (onlyGuide) selectedSteps[0].sequence = 0;
  const guideStepRef = selectedSteps.at(-1).reviewStepRef;
  return {
    schemaVersion: 'vexlife.experience-review.request/v0',
    portableContractRef: PORTABLE_CONTRACT_REF,
    portableSchemaVersionRef: PORTABLE_SCHEMA_VERSION,
    reviewEpoch: {
      reviewEpochRef: EPOCH_REF,
      reviewPlanRef: PLAN_REF,
      reviewRequestRef: REQUEST_REF,
      sourceVersionRef: 'github.commit.vexlife.stage5-guide-disclosure-test',
      truthClass: CURRENT_TRUTH,
      state: 'PLANNED'
    },
    reviewPlan: {
      reviewPlanRef: PLAN_REF,
      purpose: 'Prove fixed disclosure of the minimized Guide current target.',
      experienceProfileRefs: ['experience.vexlife.companionship-simple'],
      reviewCaseRefs: [CASE_REF],
      lensRefs: ['lens.vexlife.usability-and-journey'],
      humanBurden: 'NATURAL_REACTION_OR_QUESTION'
    },
    reviewRequest: {
      reviewRequestRef: REQUEST_REF,
      reviewEpochRef: EPOCH_REF,
      reviewCaseRefs: [CASE_REF],
      captureRequestRefs: [CAPTURE_REF],
      comparisonMode: 'BASELINE_ONLY'
    },
    reviewCases: [{
      reviewCaseRef: CASE_REF,
      title: 'Stage 5 Guide disclosure',
      featureOrJourneyRef: 'suite.vexlife.browser.cross-feature/v1',
      whyItMatters: 'Human review must reach the canonical Guide current action without inventing a semantic step.',
      reviewQuestion: 'Can the accepted adapter reveal and invoke the current Guide action after the exact Chat context replay?',
      truthClass: CURRENT_TRUTH,
      startingStateRef: 'state.navigation',
      routeRef: 'route.terrain',
      reviewStepRefs: selectedSteps.map((step) => step.reviewStepRef),
      knownLimitations: ['Browser-reference proof only.'],
      doesNotProve: ['Human acceptance', 'Native-platform conformance']
    }],
    captureRequests: [{
      captureRequestRef: CAPTURE_REF,
      reviewEpochRef: EPOCH_REF,
      reviewCaseRef: CASE_REF,
      platformRef: 'platform.browser',
      experienceProfileRef: 'experience.vexlife.companionship-simple',
      routeRef: 'route.terrain',
      initialStateRef: 'state.navigation',
      localeRef: 'locale.en',
      themeRef: 'theme.foundation',
      deviceProfileRef: 'device.browser.desktop.reference',
      sourceVersionRef: 'github.commit.vexlife.stage5-guide-disclosure-test',
      truthClass: CURRENT_TRUTH,
      steps: selectedSteps,
      captureAtStepRefs: [guideStepRef],
      reviewOverlay: {
        highlightTarget: false,
        showStableRef: false,
        showAction: false
      }
    }]
  };
}

function browserBinding(pageUrl, { onlyGuide = false } = {}) {
  const selectedSteps = onlyGuide ? [steps.at(-1)] : steps;
  const stepBindings = Object.fromEntries(selectedSteps.map((step) => [
    step.reviewStepRef,
    { kind: step.targetNodeRef === 'element.nav.chat' ? 'CLICK_CONTEXTUAL_PROJECTION_TARGET' : 'CLICK_STABLE_TARGET' }
  ]));
  return {
    captureRequestRef: CAPTURE_REF,
    pageUrl,
    viewport: { width: 1440, height: 900 },
    waitUntil: 'load',
    timeoutMs: 30000,
    settleMs: 0,
    fullPage: true,
    stepBindings,
    artifactSlugs: {
      [selectedSteps.at(-1).reviewStepRef]: 'stage5-guide-disclosure-regression'
    }
  };
}

function instrumentedChromium(observedDisclosureClicks) {
  const wrapLocator = (locator, selector) => new Proxy(locator, {
    get(target, property) {
      if (property === 'first') return () => wrapLocator(target.first(), selector);
      if (property === 'click') {
        return async (...args) => {
          if (selector === '#guideMinimize') observedDisclosureClicks.push(selector);
          return target.click(...args);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
  const wrapPage = (page) => new Proxy(page, {
    get(target, property) {
      if (property === 'locator') return (selector, ...args) => wrapLocator(target.locator(selector, ...args), selector);
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
  return {
    async launch(options) {
      const browser = await chromium.launch(options);
      return {
        async newPage(optionsForPage) {
          return wrapPage(await browser.newPage(optionsForPage));
        },
        async close() {
          await browser.close();
        }
      };
    }
  };
}

function missingDisclosureBrowser() {
  const targetSelector = '[data-node-ref="element.guide.ask-current"]';
  const page = {
    async goto() {},
    on() {},
    locator(selector) {
      const isTarget = selector === targetSelector;
      const isDisclosure = selector === '#guideMinimize';
      return {
        first() { return this; },
        async count() { return isTarget ? 1 : isDisclosure ? 0 : 0; },
        async isVisible() { return false; },
        async click() {},
        async focus() {},
        async fill() {},
        async press() {}
      };
    },
    async evaluate() {},
    mouse: { async move() {}, async down() {}, async up() {} },
    async screenshot() {},
    async close() {}
  };
  return {
    async launch() {
      return {
        async newPage() { return page; },
        async close() {}
      };
    }
  };
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(typeof address, 'object');
  return `http://127.0.0.1:${address.port}/reference/browser/`;
}

test('real Stage-5 replay reveals the minimized Guide through the canonical fixed disclosure', async (t) => {
  const server = createVexLifeBrowserServer();
  const pageUrl = await listen(server);
  t.after(() => new Promise((resolve) => server.close(() => resolve())));
  const observedDisclosureClicks = [];
  const tasks = buildSparseBrowserCapturePlan(reviewBundle(), [browserBinding(pageUrl)]).tasks;
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'stage5-guide-disclosure-'));
  const adapter = createBrowserExperienceReviewAdapter({
    browserType: instrumentedChromium(observedDisclosureClicks),
    settleMs: 0
  });
  const evidence = await adapter.captureTasks(tasks, out);
  assert.equal(adapter.adapterVersionRef, ADAPTER_VERSION_REF);
  assert.equal(tasks.length, 1);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].captureState, 'CAPTURED', JSON.stringify(evidence[0].adapterReceipt.deviations));
  assert.deepEqual(evidence[0].adapterReceipt.deviations, []);
  assert.deepEqual(observedDisclosureClicks, ['#guideMinimize']);
  assert.ok(fs.existsSync(path.join(out, tasks[0].artifactFileName)));
});

test('Guide disclosure remains fail-safe when the canonical reveal control is unavailable', async () => {
  const tasks = buildSparseBrowserCapturePlan(
    reviewBundle({ onlyGuide: true }),
    [browserBinding('http://127.0.0.1:1/reference/browser/', { onlyGuide: true })]
  ).tasks;
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'stage5-guide-disclosure-fail-safe-'));
  const adapter = createBrowserExperienceReviewAdapter({ browserType: missingDisclosureBrowser(), settleMs: 0 });
  const evidence = await adapter.captureTasks(tasks, out);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].captureState, 'FAILED_SAFE');
  assert.match(evidence[0].adapterReceipt.deviations[0], /Stable-target disclosure control was unavailable for: element\.guide\.ask-current/);
});

// [VXG RealForever]
