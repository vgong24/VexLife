import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HUMAN_REVIEW_SCHEMA_VERSION,
  renderHumanContinuityReviewHtml,
  validateHumanReviewContext
} from '../reference/browser/modules/experience-review-human.js';

const context = () => ({
  schemaVersion: HUMAN_REVIEW_SCHEMA_VERSION,
  reviewEpochRef: 'review-epoch.vexlife.e27.stage-c.replay.001',
  current: {
    title: 'Current accepted VexLife',
    sourceVersionRef: 'github.commit.vexlife.6f63285c',
    url: 'http://127.0.0.1:4173/reference/browser/'
  },
  baseline: {
    title: 'E2.7 experience-intention reference',
    artifactRef: 'design-baseline.vexlife.e2.7.reference',
    url: '/baseline/E2.7-START-HERE.html',
    explanation: 'E2.7 is here to explain the intended experience direction. It is not the current product and it is not a second thing you must approve.'
  },
  machineEvidence: { state: 'PASS', caseCount: 10 },
  reviewQuestion: 'Does the current VexLife carry the E2.7 experience intention forward in the direction you actually want?',
  contextSentence: 'The large surface is the newest accepted VexLife. Use E2.7 only when you want context for why the experience should feel a certain way.',
  submitPath: '/submit',
  handoff: {
    returnFilename: 'RETURN-THIS-TO-CHATGPT-VEXLIFE-E27-STAGE-C-REVIEW.zip',
    explorerWillOpen: true
  }
});

test('human review context is current-first and local-only', () => {
  const value = validateHumanReviewContext(context());
  assert.equal(value.current.title, 'Current accepted VexLife');
  assert.equal(value.machineEvidence.caseCount, 10);
  const remote = context();
  remote.current.url = 'https://example.com/reference/browser/';
  assert.throws(() => validateHumanReviewContext(remote), /remain local/);
  const executable = context();
  executable.baseline.url = 'javascript:alert(1)';
  assert.throws(() => validateHumanReviewContext(executable), /executable URL/);
});

test('human review shell makes one current object obvious', () => {
  const html = renderHumanContinuityReviewHtml(context());
  assert.match(html, /ONE CURRENT OBJECT · HUMAN DIRECTION REVIEW/);
  assert.match(html, /You are reviewing: Current accepted VexLife/);
  assert.match(html, /What am I deciding\?/);
  assert.match(html, /Does the current VexLife carry the E2\.7 experience intention forward/);
  assert.match(html, /You do <strong>not<\/strong> need to review those cases individually/);
  assert.match(html, /Why E2\.7\?/);
  assert.match(html, /not the current product and it is not a second thing you must approve/);
});

test('human review shell does not expose evidence-matrix navigation as human burden', () => {
  const html = renderHumanContinuityReviewHtml(context());
  assert.doesNotMatch(html, /C01 —/);
  assert.doesNotMatch(html, /C10 —/);
  assert.doesNotMatch(html, />kind:/);
  assert.doesNotMatch(html, />locale:/);
  assert.doesNotMatch(html, />theme:/);
  assert.doesNotMatch(html, />device:/);
  assert.doesNotMatch(html, />platform:/);
});

test('submit visibly completes the handoff and attempts to close the review window', () => {
  const html = renderHumanContinuityReviewHtml(context());
  assert.match(html, /Handoff complete\./);
  assert.match(html, /Explorer will open\/select it automatically/);
  assert.match(html, /Explorer is opening the canonical return ZIP/);
  assert.match(html, /window\.close\(\)/);
  assert.match(html, /handoffComplete/);
});

test('review shell escapes human-visible context', () => {
  const value = context();
  value.current.title = '<img src=x onerror=alert(1)>';
  const html = renderHumanContinuityReviewHtml(value);
  assert.doesNotMatch(html, /<h1[^>]*><img/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

// [VXG RealForever]
