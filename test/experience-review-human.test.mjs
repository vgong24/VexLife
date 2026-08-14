import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HUMAN_REVIEW_FRAMING,
  HUMAN_REVIEW_SCHEMA_VERSION,
  renderHumanContinuityReviewHtml,
  validateHumanReviewContext
} from '../reference/browser/modules/experience-review-human.js';

const context = () => ({
  schemaVersion: HUMAN_REVIEW_SCHEMA_VERSION,
  reviewEpochRef: 'review-epoch.vexlife.e27.stage-c.convergence.001',
  current: {
    title: 'Accepted Stage-B descendant',
    sourceVersionRef: 'github.commit.vexlife.73abef401aba2c1b993ca2eaee77a8e138df35df',
    url: 'http://127.0.0.1:4173/reference/browser/'
  },
  baseline: {
    title: 'Authoritative E2.7 root',
    artifactRef: 'design-baseline.vexlife.e2.7.scoped-layers-vexorg-sandbox.34f17a12-38b6-438c-b899-6d07c36f1eb0',
    url: '/baseline/E2.7-START-HERE.html',
    explanation: 'This accepted E2.7 root is the authoritative design comparator, not a second product to approve.'
  },
  machineEvidence: { state: 'PASS', caseCount: 12 },
  reviewQuestion: 'Does this E2.7-rooted VexLife faithfully carry the authoritative E2.7 root experience in the direction you want to keep?',
  contextSentence: 'The large surface is the exact E2.7-rooted candidate. The root comparator is available only to check the accepted design grammar; it is not a second product.',
  submitPath: '/submit',
  handoff: { returnFilename: 'RETURN-THIS-TO-CHATGPT-VEXLIFE-E27-STAGE-C-REVIEW.zip', explorerWillOpen: true }
});

test('human review context preserves wire compatibility while source-managing E2.7-root-first framing', () => {
  const value = validateHumanReviewContext(context());
  assert.equal(value.current.title, 'Accepted Stage-B descendant');
  assert.deepEqual(value.framing, HUMAN_REVIEW_FRAMING);
  assert.equal(value.framing.currentFirstFraming, false);
  assert.equal(value.framing.candidateClass, 'E2.7_ROOTED_CURRENT_CANDIDATE');
  assert.equal(value.framing.comparatorClass, 'AUTHORITATIVE_E2.7_ROOT');
  assert.equal(value.framing.machineEvidenceSubstitutesForHumanConvergence, false);
  const remote = context(); remote.current.url = 'https://example.com/reference/browser/';
  assert.throws(() => validateHumanReviewContext(remote), /remain local/);
  const executable = context(); executable.baseline.url = 'javascript:alert(1)';
  assert.throws(() => validateHumanReviewContext(executable), /executable URL/);
});

test('human review shell starts with one E2.7-rooted candidate and an authority comparator', () => {
  const html = renderHumanContinuityReviewHtml(context());
  assert.match(html, /E2\.7-ROOTED CURRENT OBJECT - HUMAN CONVERGENCE REVIEW/);
  assert.match(html, /You are reviewing the E2\.7-rooted VexLife candidate/);
  assert.match(html, />E2\.7-rooted candidate<\/button>/);
  assert.match(html, />Authoritative E2\.7 root<\/button>/);
  assert.match(html, /authoritative design comparator, not a second product to approve/);
  assert.match(html, /does <strong>not<\/strong> decide human design convergence/);
  assert.doesNotMatch(html, /Why E2\.7\?/);
  assert.doesNotMatch(html, /You are reviewing: Current accepted VexLife/);
});

test('candidate is the initial rendered object and comparator is opt-in context', () => {
  const html = renderHumanContinuityReviewHtml(context());
  assert.match(html, /id="showCurrent" aria-pressed="true"/);
  assert.match(html, /id="showBaseline" aria-pressed="false"/);
  assert.match(html, /iframe id="reviewFrame" src="http:\/\/127\.0\.0\.1:4173\/reference\/browser\/" title="E2\.7-rooted VexLife candidate"/);
  assert.match(html, /frame\.title=root\?'Authoritative E2\.7 root comparator':'E2\.7-rooted VexLife candidate'/);
});

test('human review shell does not expose evidence-matrix navigation as human burden', () => {
  const html = renderHumanContinuityReviewHtml(context());
  for (const marker of [/C01 -/, /C10 -/, />kind:/, />locale:/, />theme:/, />device:/, />platform:/]) assert.doesNotMatch(html, marker);
});

test('submit binds review object and comparator classes and visibly completes handoff', () => {
  const html = renderHumanContinuityReviewHtml(context());
  assert.match(html, /reviewObjectClass:C\.framing\.candidateClass/);
  assert.match(html, /comparatorClass:C\.framing\.comparatorClass/);
  assert.match(html, /Handoff complete\./);
  assert.match(html, /Explorer will open\/select it automatically/);
  assert.match(html, /window\.close\(\)/);
});

test('review shell escapes human-visible context', () => {
  const value = context(); value.current.title = '<img src=x onerror=alert(1)>';
  const html = renderHumanContinuityReviewHtml(value);
  assert.doesNotMatch(html, /<h1[^>]*><img/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

// [VXG RealForever]
