import assert from 'node:assert/strict';
import test from 'node:test';
import { ProcessFactory } from '../src/core/process-factory.mjs';
import { semanticHash } from '../src/core/utils.mjs';
import {
  REVIEW_PROCESS_REF,
  compileReviewExpectationSet,
  compileReviewCoverageReceipt,
  createReviewFor
} from '../src/core/review-composition.mjs';

const COMMIT = '1'.repeat(40);
const TREE = '2'.repeat(40);

const reviewProcess = {
  processRef: REVIEW_PROCESS_REF,
  processVersion: 1,
  purpose: 'Compile one exact review subject into deterministic no-effect expectation and coverage projections.',
  applicabilityRules: ['review subject and purpose are explicit'],
  requiredInputs: ['subjectRefs', 'purposeRefs', 'reviewDepthPolicyRef', 'sourceBundleRef', 'evidenceBundleRef'],
  optionalInputs: [],
  sourceResolutionRules: ['consume independently verified current source bindings only'],
  preconditions: ['all source kinds current', 'effects remain empty'],
  steps: ['admit-review-plan', 'compile-review-expectation-set', 'compile-review-coverage-receipt', 'render-process-receipt'],
  effectOwnerRule: 'Review composition owns no effects; later execution must independently bind effect authority.',
  authorityEnvelope: { effects: [], pathScope: [] },
  outputTemplateRefs: [],
  canonicalDispositionVocabulary: ['REVIEW_COMPOSITION_READY', 'BLOCKED'],
  returnRouteRule: 'return the no-effect plan and derived projections',
  closureRule: 'close after deterministic projections and process receipt are emitted',
  recoveryRule: 'discard derived projections and recompile from current verified source bindings',
  foundationDependencies: [
    'foundation.vexlife.identity-lattice.v1',
    'foundation.vexlife.state-relay.v1',
    'foundation.vexlife.permission-effects.v1'
  ],
  downstreamConsumerRefs: [],
  invalidationTriggers: ['review-source-currentness-change'],
  testRefs: ['test.review-composition.contract']
};

const foundations = [
  { foundationRef: 'foundation.vexlife.identity-lattice.v1', foundationVersion: 1 },
  { foundationRef: 'foundation.vexlife.state-relay.v1', foundationVersion: 1 },
  { foundationRef: 'foundation.vexlife.permission-effects.v1', foundationVersion: 1 }
];

const foundationVersions = Object.fromEntries(foundations.map((item) => [item.foundationRef, item.foundationVersion]));

function factory() {
  return new ProcessFactory({ foundations, processes: [reviewProcess], templates: [] });
}

function sourceEntry(sourceKind, value, n) {
  return {
    sourceKind,
    envelope: {
      sourceKind,
      repositoryRef: 'github.vgong24.VexLife',
      commitRef: COMMIT,
      treeRefOrNull: TREE,
      sourcePathRef: `fixture/${n}-${sourceKind}.json`,
      blobRef: n.toString(16).padStart(40, '0'),
      schemaVersionOrNull: `fixture.${sourceKind.toLowerCase()}/v1`,
      registryRefOrNull: null,
      registryVersionOrNull: 1,
      currentness: 'CURRENT',
      bindingState: 'VERIFIED',
      verificationRef: `evidence.fixture.${sourceKind.toLowerCase()}.${n}`,
      valueSemanticHash: semanticHash(value)
    },
    value
  };
}

function sourceBundle() {
  const values = {
    FEATURE_REGISTRY: {
      features: [{
        featureRef: 'feature.test.chat',
        purpose: 'fixture chat',
        status: 'IMPLEMENTED_REFERENCE',
        canonicalNodeRefs: ['screen.test.chat', 'element.test.send'],
        stateRefs: ['state.test.chat'],
        actionRefs: ['action.test.send'],
        permissionRefs: ['permission.test.send'],
        processRefs: [],
        moduleRefs: [],
        localizationRefs: ['string.test.send'],
        testRefs: ['test.test.chat'],
        platformRefs: ['platform.browser'],
        reviewLensRefs: ['lens.vexlife.design-system', 'lens.vexlife.accessibility', 'lens.vexlife.assurance-and-adversarial'],
        effectClass: 'APPEND_ONLY_MESSAGE',
        rollbackRouteRef: 'recovery.test.chat',
        projectionRefs: ['projection.test.chat']
      }]
    },
    REVIEW_LENS_REGISTRY: {
      lenses: [
        { lensRef: 'lens.vexlife.design-system', requiredEvidence: ['componentRefs', 'interactionStateRefs'] },
        { lensRef: 'lens.vexlife.accessibility', requiredEvidence: ['accessibilityRefs', 'keyboardEvidence', 'reducedMotionEvidence'] },
        { lensRef: 'lens.vexlife.assurance-and-adversarial', requiredEvidence: ['negativeTestRefs', 'knownUnknowns'] }
      ]
    },
    INTERFACE_SCREEN_AND_SHARED_SURFACE: {
      screens: [
        { screenRef: 'screen.test.chat', regionRefs: ['region.test.chat.body'] },
        { screenRef: 'screen.vexlife.health', regionRefs: ['region.health.summary'] }
      ],
      regions: [
        { regionRef: 'region.test.chat.body', screenRef: 'screen.test.chat', elementRefs: ['element.test.send'] },
        { regionRef: 'region.health.summary', screenRef: 'screen.vexlife.health', elementRefs: ['element.health.disclosure'] }
      ],
      elements: [
        {
          elementRef: 'element.test.send',
          screenRef: 'screen.test.chat',
          regionRef: 'region.test.chat.body',
          actionRef: 'action.test.send',
          permissionRef: 'permission.test.send',
          interactionStateRefs: ['interaction-state.test.focused']
        },
        {
          elementRef: 'element.health.disclosure',
          screenRef: 'screen.vexlife.health',
          regionRef: 'region.health.summary',
          actionRef: 'action.health.disclose'
        }
      ]
    },
    ACTION_PERMISSION_EFFECT: {
      actions: [
        { actionRef: 'action.test.send', permissionRef: 'permission.test.send', effectRef: 'effect.test.append' },
        { actionRef: 'action.health.disclose', permissionRef: 'permission.none', effectRef: 'effect.none' }
      ],
      permissions: [
        { permissionRef: 'permission.test.send' },
        { permissionRef: 'permission.none' }
      ],
      effects: [
        { effectRef: 'effect.test.append' },
        { effectRef: 'effect.none' }
      ]
    },
    STATE_DOMAIN_OWNER: {
      states: [{ stateRef: 'state.test.chat', ownerRef: 'owner.state.test.chat' }],
      stateOwners: [{ stateOwnerRef: 'owner.state.test.chat' }]
    },
    EXPERIENCE_PROFILE_GESTURE_VESSEL: {
      experienceProfiles: [{ experienceProfileRef: 'experience.test.chat', screenRefs: ['screen.test.chat'] }],
      gestureContracts: [{ gestureRef: 'gesture.test.activate', screenRefs: ['screen.test.chat'] }],
      vessels: [{ vesselRef: 'vessel.test.button', elementRefs: ['element.test.send'] }]
    },
    TEST_AND_OWNER_DOMAIN_EVIDENCE: {
      tests: [{ testRef: 'test.test.chat' }],
      ownerDomainEvidence: [{ evidenceRef: 'evidence.test.chat', testRefs: ['test.test.chat'] }]
    },
    EXPERIENCE_REVIEW_CAPTURE_SEAM: {
      captures: [{ captureRef: 'capture.test.chat', screenRefs: ['screen.test.chat'] }]
    }
  };
  return {
    sources: Object.entries(values).map(([kind, value], index) => sourceEntry(kind, value, index + 10))
  };
}

function request(subjectRefs = ['feature.test.chat']) {
  return {
    subjectRefs,
    purposeRefs: ['purpose.review.usability'],
    reviewDepthPolicyRef: 'REVIEW_DEPTH_FEATURE',
    expectationOverrideRefs: [],
    libertySuggestionPolicyRef: 'liberty.review.suggestions.nonblocking',
    contextRefOrNull: null,
    contextSourceRefs: [],
    environmentScope: {
      platformRefs: ['platform.browser'],
      localeRefs: ['locale.en'],
      viewportClassRefs: ['viewport.desktop'],
      inputModalityRefs: ['input.keyboard'],
      reducedMotionRefs: ['motion.reduced']
    },
    evidenceBudget: { maxEvidenceMilestones: 8 }
  };
}

function evidenceBundle() {
  return {
    evidence: [
      {
        evidenceRef: 'evidence.current.identity',
        dimension: 'canonicalIdentity',
        state: 'CURRENT_PROVEN',
        coversRefs: ['feature.test.chat', 'screen.test.chat'],
        sourceBindingRef: 'evidence.fixture.feature_registry.10'
      },
      {
        evidenceRef: 'evidence.current.accessibility',
        dimension: 'accessibility',
        state: 'CURRENT_PROVEN',
        coversRefs: ['lens.vexlife.accessibility'],
        sourceBindingRef: 'evidence.fixture.test_and_owner_domain_evidence.16'
      },
      {
        evidenceRef: 'evidence.held.platform',
        dimension: 'platform',
        state: 'HELD_NO_EXACT_EVIDENCE',
        coversRefs: ['platform.browser'],
        sourceBindingRef: 'evidence.fixture.test_and_owner_domain_evidence.16'
      }
    ]
  };
}

test('RCP-00 exact verified source envelopes compile with all-false effects', () => {
  const result = createReviewFor({
    processFactory: factory(),
    request: request(),
    sourceBundle: sourceBundle(),
    evidenceBundle: evidenceBundle(),
    currentFoundationVersions: foundationVersions,
    resourceBudget: { requiredTokens: 10, availableTokens: 100 },
    now: '2026-08-24T00:00:00.000Z'
  });
  assert.equal(result.state, 'REVIEW_COMPOSITION_READY_NO_EFFECT');
  assert.deepEqual(result.reviewPlan.authorityEnvelope, { effects: [], pathScope: [] });
  assert.deepEqual(result.effects, {
    sourceMutation: false,
    HomeEffect: false,
    MemoryEffect: false,
    modelRuntimeEffect: false,
    networkEffect: false,
    publicationEffect: false
  });
});

test('RCP-01 Feature-backed subject compiles stable source-owned refs', () => {
  const set = compileReviewExpectationSet({ request: request(), sourceBundle: sourceBundle() });
  assert.deepEqual(set.reviewSubject.featureRefs, ['feature.test.chat']);
  assert.ok(set.screenRefs.includes('screen.test.chat'));
  assert.ok(set.actionRefs.includes('action.test.send'));
  assert.ok(set.permissionRefs.includes('permission.test.send'));
});

test('RCP-02 shared Health surface remains featureRefs=[] with UNKNOWN feature binding', () => {
  const set = compileReviewExpectationSet({ request: request(['screen.vexlife.health']), sourceBundle: sourceBundle() });
  assert.deepEqual(set.reviewSubject.featureRefs, []);
  assert.equal(set.reviewSubject.featureBindingDisposition, 'UNKNOWN');
  assert.match(set.reviewSubject.unresolvedFeatureBindingQuestionOrNull, /Which canonical Feature/);
});

test('RCP-03 Review Lens obligations join by refs without copying canonical records', () => {
  const set = compileReviewExpectationSet({ request: request(), sourceBundle: sourceBundle() });
  assert.ok(set.reviewLensRefs.includes('lens.vexlife.design-system'));
  assert.deepEqual(
    set.lensEvidenceRequirements.find((item) => item.lensRef === 'lens.vexlife.design-system').requiredEvidence,
    ['componentRefs', 'interactionStateRefs']
  );
  assert.equal('requiredQuestions' in set, false);
});

test('RCP-04 action, permission, effect class and state owner relations remain exact', () => {
  const set = compileReviewExpectationSet({ request: request(), sourceBundle: sourceBundle() });
  assert.deepEqual(set.actionRefs, ['action.test.send']);
  assert.deepEqual(set.permissionRefs, ['permission.test.send']);
  assert.deepEqual(set.effectClasses, ['APPEND_ONLY_MESSAGE']);
  assert.deepEqual(set.stateOwnerRefs, ['owner.state.test.chat']);
});

test('RCP-05 Experience refs are deterministic and caller source bundle remains unchanged', () => {
  const bundle = sourceBundle();
  const before = structuredClone(bundle);
  const one = compileReviewExpectationSet({ request: request(), sourceBundle: bundle });
  const two = compileReviewExpectationSet({ request: request(), sourceBundle: bundle });
  assert.equal(one.projectionHash, two.projectionHash);
  assert.ok(one.experienceProfileRefs.includes('experience.test.chat'));
  assert.ok(one.gestureRefs.includes('gesture.test.activate'));
  assert.ok(one.vesselRefs.includes('vessel.test.button'));
  assert.deepEqual(bundle, before);
});


test('RCP-05b structural traversal does not spread through shared permission or action refs', () => {
  const set = compileReviewExpectationSet({ request: request(), sourceBundle: sourceBundle() });
  assert.equal(set.screenRefs.includes('screen.vexlife.health'), false);
  assert.equal(set.elementRefs.includes('element.health.disclosure'), false);
});

test('RCP-06 owner-domain evidence and review captures stay evidence refs, not portable semantics', () => {
  const set = compileReviewExpectationSet({ request: request(), sourceBundle: sourceBundle() });
  assert.deepEqual(set.ownerDomainEvidenceRefs, ['evidence.test.chat']);
  assert.deepEqual(set.reviewCaptureRefs, ['capture.test.chat']);
  assert.equal(set.canonicalNodeRefs.includes('evidence.test.chat'), false);
  assert.ok(set.doesNotProve.includes('TEST_REFERENCE_DOES_NOT_PROVE_CURRENT_EXECUTION'));
});

test('RCP-07 unresolved feedback states stay UNKNOWN while explicit focused state is PLACED', () => {
  const set = compileReviewExpectationSet({ request: request(), sourceBundle: sourceBundle() });
  assert.equal(set.feedbackExpectations.find((item) => item.state === 'FOCUSED').disposition, 'PLACED');
  assert.equal(set.feedbackExpectations.find((item) => item.state === 'BUSY').disposition, 'UNKNOWN');
  assert.ok(set.unknowns.some((item) => item.kind === 'INTERACTION_FEEDBACK' && item.state === 'BUSY'));
});

test('RCP-08 platform registration never becomes CURRENT_PROVEN without exact evidence', () => {
  const set = compileReviewExpectationSet({ request: request(), sourceBundle: sourceBundle() });
  assert.equal(set.environmentCells[0].evidenceState, 'HELD_NO_EXACT_EVIDENCE');
  const receipt = compileReviewCoverageReceipt({ expectationSet: set, evidenceBundle: evidenceBundle() });
  assert.equal(receipt.coverageDimensions.platform.state, 'HELD_NO_EXACT_EVIDENCE');
});

test('RCP-09 deterministic ordering is stable across source input order', () => {
  const first = sourceBundle();
  const second = sourceBundle();
  second.sources.reverse();
  const a = compileReviewExpectationSet({ request: request(), sourceBundle: first });
  const b = compileReviewExpectationSet({ request: request(), sourceBundle: second });
  assert.equal(a.projectionHash, b.projectionHash);
  assert.deepEqual(a.placedRefs, [...a.placedRefs].sort());
});

test('RCP-10 createReviewFor does not mutate request, source bundle or evidence bundle', () => {
  const req = request();
  const bundle = sourceBundle();
  const evidence = evidenceBundle();
  const before = structuredClone({ req, bundle, evidence });
  createReviewFor({
    processFactory: factory(),
    request: req,
    sourceBundle: bundle,
    evidenceBundle: evidence,
    currentFoundationVersions: foundationVersions,
    now: '2026-08-24T00:00:00.000Z'
  });
  assert.deepEqual({ req, bundle, evidence }, before);
});

test('RCP-11 missing or stale source binding fails closed', () => {
  const missing = sourceBundle();
  missing.sources = missing.sources.filter((item) => item.sourceKind !== 'REVIEW_LENS_REGISTRY');
  const missingResult = createReviewFor({
    processFactory: factory(), request: request(), sourceBundle: missing, evidenceBundle: evidenceBundle(), currentFoundationVersions: foundationVersions
  });
  assert.equal(missingResult.state, 'BLOCKED_REVIEW_COMPOSITION');
  assert.equal(missingResult.blocker.code, 'MISSING_SOURCE_KIND');

  const stale = sourceBundle();
  stale.sources[0].envelope.currentness = 'STALE';
  stale.sources[0].envelope.valueSemanticHash = semanticHash(stale.sources[0].value);
  const staleResult = createReviewFor({
    processFactory: factory(), request: request(), sourceBundle: stale, evidenceBundle: evidenceBundle(), currentFoundationVersions: foundationVersions
  });
  assert.equal(staleResult.state, 'BLOCKED_REVIEW_COMPOSITION');
  assert.equal(staleResult.blocker.code, 'STALE_SOURCE_BINDING');
});

test('RCP-12 duplicate canonical identities fail closed', () => {
  const bundle = sourceBundle();
  const interfaceSource = bundle.sources.find((item) => item.sourceKind === 'INTERFACE_SCREEN_AND_SHARED_SURFACE');
  interfaceSource.value.screens.push({ screenRef: 'screen.test.chat' });
  interfaceSource.envelope.valueSemanticHash = semanticHash(interfaceSource.value);
  const result = createReviewFor({
    processFactory: factory(), request: request(), sourceBundle: bundle, evidenceBundle: evidenceBundle(), currentFoundationVersions: foundationVersions
  });
  assert.equal(result.state, 'BLOCKED_REVIEW_COMPOSITION');
  assert.equal(result.blocker.code, 'DUPLICATE_IDENTITY');
});

test('RCP-13 coverage preserves separate placed, unknown, failed/current/stale dimensions', () => {
  const set = compileReviewExpectationSet({ request: request(), sourceBundle: sourceBundle() });
  const evidence = evidenceBundle();
  evidence.evidence.push({
    evidenceRef: 'evidence.failed.keyboard',
    dimension: 'keyboard',
    state: 'FAILED',
    coversRefs: ['lens.vexlife.accessibility'],
    sourceBindingRef: 'evidence.fixture.test_and_owner_domain_evidence.16'
  });
  const receipt = compileReviewCoverageReceipt({ expectationSet: set, evidenceBundle: evidence });
  assert.equal(receipt.coverageDimensions.canonicalIdentity.state, 'CURRENT_PROVEN');
  assert.equal(receipt.coverageDimensions.keyboard.state, 'FAILED');
  assert.ok(receipt.unknowns.length > 0);
  assert.equal(typeof receipt.effects.sourceMutation, 'boolean');
  assert.equal(receipt.effects.sourceMutation, false);
});

test('RCP-14 ProcessFactory admission gates public createReviewFor before projections', () => {
  const result = createReviewFor({
    processFactory: factory(),
    request: request(),
    sourceBundle: sourceBundle(),
    evidenceBundle: evidenceBundle(),
    currentFoundationVersions: { ...foundationVersions, 'foundation.vexlife.identity-lattice.v1': 999 },
    now: '2026-08-24T00:00:00.000Z'
  });
  assert.equal(result.state, 'BLOCKED_STALE_FOUNDATION');
  assert.equal(result.expectationSet, undefined);
  assert.equal(result.coverageReceipt, undefined);
});

test('RCP-14b missing foundation currentness blocks before ProcessFactory plan admission', () => {
  const currentness = { ...foundationVersions };
  delete currentness['foundation.vexlife.permission-effects.v1'];
  const result = createReviewFor({
    processFactory: factory(), request: request(), sourceBundle: sourceBundle(), evidenceBundle: evidenceBundle(), currentFoundationVersions: currentness
  });
  assert.equal(result.state, 'BLOCKED_CURRENTNESS_BINDING');
  assert.equal(result.expectationSet, undefined);
});

test('RCP-15 no ReviewGraph, Review Registry, ReviewFinding owner or effect authority is emitted', () => {
  const result = createReviewFor({
    processFactory: factory(),
    request: request(),
    sourceBundle: sourceBundle(),
    evidenceBundle: evidenceBundle(),
    currentFoundationVersions: foundationVersions,
    now: '2026-08-24T00:00:00.000Z'
  });
  const text = JSON.stringify(result);
  assert.equal(text.includes('ReviewGraph'), false);
  assert.equal(text.includes('ReviewFinding'), false);
  assert.equal(result.reviewPlan.authorityEnvelope.effects.length, 0);
  assert.equal(result.reviewPlan.authorityEnvelope.pathScope.length, 0);
});
