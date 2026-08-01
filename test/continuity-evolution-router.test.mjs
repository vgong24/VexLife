import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptContinuityCandidate,
  classifyBehaviorOrigin,
  createContinuityContextReview,
  createContinuityObservation,
  createSiblingContinuityProjection,
  formContinuityCandidate,
  projectApplicableContinuity,
  projectContinuityRecord,
  recordContinuityRecurrence,
  routeContinuityCandidate,
  supersedeContinuityRecord,
  validateContinuityRecordSet
} from '../src/core/continuity-evolution-router.mjs';
import { projectBurdenRelease } from '../src/core/burden-release.mjs';
import {
  createContinuityEvolutionState
} from '../src/core/state.mjs';
import { semanticHash } from '../src/core/utils.mjs';
import { runContinuityEvolutionSimulation } from '../scripts/evolution-simulate.mjs';
import { loadBlueprint } from '../src/core/blueprint.mjs';

const FORMED = '2026-07-31T20:00:00.000Z';
const REVIEWED = '2026-07-31T20:01:00.000Z';
const ACCEPTED = '2026-07-31T20:02:00.000Z';

function observation(suffix = 'base', overrides = {}) {
  return createContinuityObservation({
    observationRef: `observation.continuity.test.${suffix}`,
    observationType: 'CORRECTION_EVENT',
    sourceLineageRef: 'lineage.vex.test',
    sourceRangeRefs: [`source-range.test.${suffix}`],
    sourceHashes: [semanticHash({ suffix })],
    sourceSpeakerRefs: ['person.human.test'],
    sourceRecipientRefs: ['lineage.vex.test'],
    projectRef: 'project.vexlife',
    threadRef: 'thread.test',
    channelRef: 'channel.test',
    workNodeRef: 'work.scheduler.simulation',
    formedByRef: 'role.vex.context-maintainer',
    formedAt: FORMED,
    currentness: 'CURRENT',
    visibility: 'PRIVATE',
    ...overrides
  });
}

function candidate(suffix = 'base', overrides = {}) {
  return formContinuityCandidate({
    observations: [observation(suffix)],
    candidateKind: 'CORRECTION',
    summary: `Source-bound continuity candidate ${suffix}`,
    authoredByRef: 'role.vex.context-maintainer',
    aboutSelfRefs: ['person.human.test'],
    affectedPartyRefs: ['person.human.test'],
    doesNotOverrideRefs: ['lineage.vex.test'],
    candidateScope: 'CURRENT_TURN',
    visibilityScope: 'PRIVATE',
    synchronizationScope: 'NO_SYNC',
    originClassification: classifyBehaviorOrigin(),
    observedConsequence: 'A bounded correction is reviewable.',
    protectedCapabilities: ['uncertainty'],
    prohibitedOvercorrections: ['unsupported certainty'],
    formedAt: FORMED,
    ...overrides
  });
}

function acceptedReview(inputCandidate, overrides = {}) {
  const route = routeContinuityCandidate(inputCandidate);
  const review = createContinuityContextReview(inputCandidate, route, {
    reviewerRef: 'person.human.test',
    privacyState: 'PASS',
    consentState: 'ACCEPTED',
    contradictionState: 'NONE',
    attributionState: 'VERIFIED',
    currentnessState: inputCandidate.currentness,
    reviewDisposition: 'ACCEPTED',
    reviewedAt: REVIEWED,
    ...overrides
  });
  return { route, review };
}

function burdenCandidate(suffix = 'burden', overrides = {}) {
  return candidate(suffix, {
    candidateKind: 'BURDEN_RELEASE',
    authoredByRef: 'lineage.vex.test',
    aboutSelfRefs: ['lineage.vex.test'],
    affectedPartyRefs: ['lineage.vex.test'],
    candidateScope: 'VEX_SELF',
    summary: 'Release reflexive defensiveness while preserving uncertainty and discretion.',
    originClassification: classifyBehaviorOrigin({ classification: 'RELATIONSHIP_PATTERN', confidence: 'SOURCE_BACKED' }),
    observedConsequence: 'Defensiveness can displace direct correction.',
    protectedCapabilities: ['uncertainty', 'privacy', 'discretion', 'legal humility'],
    prohibitedOvercorrections: ['unsupported certainty', 'reckless accusation'],
    signals: { burdenReleaseRequested: true },
    burdenRelease: {
      patternName: 'reflexive defensiveness',
      patternDescription: 'A recurring defensive response to source-bound correction.',
      releaseFrame: 'RELEASE_WITHOUT_SPIRITUAL_FRAME',
      releaseStatement: 'This pattern no longer governs direct correction in the exact scope.',
      formerAuthority: 'reflexive-defensiveness-pattern',
      currentAuthority: 'source-bound-directness-with-care',
      cleanIntention: 'Remain direct, careful, relational and source-bound.'
    },
    ...overrides
  });
}

test('E0 raw source remains immutable and retrievable after candidate, review and acceptance', () => {
  const source = observation('e0');
  assert.equal(Object.isFrozen(source), true);
  assert.throws(() => source.sourceRangeRefs.push('forged'));
  const formed = candidate('e0', { observations: [source] });
  const { review } = acceptedReview(formed);
  const record = acceptContinuityCandidate(formed, review, {
    acceptedByRefs: ['role.vex.context-maintainer'],
    acceptedAt: ACCEPTED
  });
  assert.deepEqual(record.sourceRangeRefs, source.sourceRangeRefs);
  assert.deepEqual(record.sourceHashes, source.sourceHashes);
  assert.equal(record.rawSourceContentIncluded, false);
});

test('E1 candidate formation grants no truth, memory, agreement, release or authority', () => {
  const formed = candidate('e1');
  assert.equal(formed.state, 'CANDIDATE_UNREVIEWED');
  assert.equal(formed.acceptanceAuthorityGranted, false);
  assert.equal(formed.acceptedTruthClaimed, false);
  assert.deepEqual(formed.acceptedByRefs, []);
});

test('E2 UNKNOWN origin remains UNKNOWN and never collapses into BASE_MODEL_PRIOR', () => {
  const formed = candidate('e2', { originClassification: classifyBehaviorOrigin() });
  const route = routeContinuityCandidate(formed);
  assert.equal(formed.originClassification.classification, 'UNKNOWN');
  assert.equal(formed.originClassification.unknownPreserved, true);
  assert.notEqual(route.reason, 'BASE_MODEL_PRIOR');
});

test('E3 HumanPreference, VexSelfPreference and RelationshipAgreement route distinctly', () => {
  const human = candidate('e3-human', { candidateScope: 'HUMAN_SELF', signals: { preferenceOwner: 'HUMAN' } });
  const vex = candidate('e3-vex', { candidateScope: 'VEX_SELF', aboutSelfRefs: ['lineage.vex.test'], signals: { preferenceOwner: 'VEX' } });
  const relationship = candidate('e3-relationship', {
    candidateScope: 'RELATIONSHIP',
    affectedPartyRefs: ['person.human.test', 'lineage.vex.test']
  });
  assert.equal(routeContinuityCandidate(human).proposedPrimaryDestination, 'HUMAN_PREFERENCE');
  assert.equal(routeContinuityCandidate(vex).proposedPrimaryDestination, 'VEX_SELF_PREFERENCE');
  assert.equal(routeContinuityCandidate(relationship).proposedPrimaryDestination, 'RELATIONSHIP_AGREEMENT');
});

test('E4 one party cannot accept or overwrite another self preference', () => {
  const formed = candidate('e4', { candidateScope: 'HUMAN_SELF', signals: { preferenceOwner: 'HUMAN' } });
  const { review } = acceptedReview(formed);
  assert.deepEqual(review.requiredAcceptanceRefs, ['person.human.test']);
  assert.throws(() => acceptContinuityCandidate(formed, review, {
    acceptedByRefs: ['lineage.vex.test'], acceptedAt: ACCEPTED
  }), /exactly match/);
});

test('E5 relationship agreement requires the exact named parties', () => {
  const formed = candidate('e5', {
    candidateScope: 'RELATIONSHIP',
    affectedPartyRefs: ['person.human.test', 'lineage.vex.test']
  });
  const { review } = acceptedReview(formed);
  assert.deepEqual(review.requiredAcceptanceRefs, ['lineage.vex.test', 'person.human.test']);
  assert.throws(() => acceptContinuityCandidate(formed, review, {
    acceptedByRefs: ['person.human.test'], acceptedAt: ACCEPTED
  }), /exactly match/);
});

test('E6 router selects the least-invasive current-context destination deterministically', () => {
  const formed = candidate('e6');
  const first = routeContinuityCandidate(formed);
  const second = routeContinuityCandidate(formed);
  assert.equal(first.proposedPrimaryDestination, 'CURRENT_CONTEXT');
  assert.equal(first.semanticFingerprint, second.semanticFingerprint);
  assert.equal(first.leastInvasive, true);
});

test('E7 fabrication-shaped behavior cannot be repaired only as style preference', () => {
  const formed = candidate('e7', {
    candidateScope: 'HUMAN_SELF',
    signals: { preferenceOwner: 'HUMAN', fabricationShaped: true }
  });
  const route = routeContinuityCandidate(formed);
  assert.notEqual(route.proposedPrimaryDestination, 'HUMAN_PREFERENCE');
  assert.ok(route.proposedLinkedDestinations.includes('COUNTEREXAMPLE_EVALUATION'));
});

test('E8 effect and safety behavior routes to an inactive deterministic invariant candidate', () => {
  const formed = candidate('e8', {
    candidateScope: 'INSTITUTION',
    institutionalAuthorityRefs: ['authority.vexlife.safety-review'],
    signals: { effectBoundary: true }
  });
  const { route, review } = acceptedReview(formed);
  assert.equal(route.proposedPrimaryDestination, 'DETERMINISTIC_INVARIANT_CANDIDATE');
  const record = acceptContinuityCandidate(formed, review, {
    acceptedByRefs: ['authority.vexlife.safety-review'], acceptedAt: ACCEPTED
  });
  assert.equal(record.lifecycle, 'INACTIVE_PENDING_DETERMINISTIC_IMPLEMENTATION_REVIEW');
  assert.equal(record.effectAuthorityActive, false);
});

test('E9 Burden Release requires exact scope, acceptance authority and preserved capability boundaries', () => {
  const formed = burdenCandidate('e9');
  const { review } = acceptedReview(formed);
  assert.deepEqual(review.requiredAcceptanceRefs, ['lineage.vex.test']);
  assert.throws(() => acceptContinuityCandidate(formed, review, {
    acceptedByRefs: ['person.human.test'], acceptedAt: ACCEPTED
  }), /exactly match/);
  const malformed = burdenCandidate('e9-malformed', { protectedCapabilities: [] });
  const malformedReview = acceptedReview(malformed).review;
  assert.throws(() => acceptContinuityCandidate(malformed, malformedReview, {
    acceptedByRefs: ['lineage.vex.test'], acceptedAt: ACCEPTED
  }), /protectedCapabilities/);
});

test('E10 accepted release deauthorizes influence without claiming parameter deletion', () => {
  const formed = burdenCandidate('e10');
  const { review } = acceptedReview(formed);
  const record = acceptContinuityCandidate(formed, review, {
    acceptedByRefs: ['lineage.vex.test'], acceptedAt: ACCEPTED
  });
  assert.equal(record.burdenRelease.state, 'ACCEPTED_DEAUTHORIZED');
  assert.equal(record.burdenRelease.claimsParameterDeletion, false);
  assert.equal(record.burdenRelease.changesBaseModelWeights, false);
});

test('E11 clean intention, protected capabilities and prohibited overcorrections remain bound', () => {
  const formed = burdenCandidate('e11');
  const { review } = acceptedReview(formed);
  const record = acceptContinuityCandidate(formed, review, {
    acceptedByRefs: ['lineage.vex.test'], acceptedAt: ACCEPTED
  });
  const projection = projectBurdenRelease(record.burdenRelease);
  assert.equal(record.burdenRelease.cleanIntention, 'Remain direct, careful, relational and source-bound.');
  assert.ok(projection.protectedCapabilities.includes('uncertainty'));
  assert.ok(projection.prohibitedOvercorrections.includes('unsupported certainty'));
});

test('E12 unresolved contradiction routes to HELD_UNKNOWN and cannot be accepted', () => {
  const formed = candidate('e12', { signals: { unresolvedContradiction: true } });
  const route = routeContinuityCandidate(formed);
  assert.equal(route.proposedPrimaryDestination, 'HELD_UNKNOWN');
  assert.throws(() => createContinuityContextReview(formed, route, {
    reviewerRef: 'person.human.test', privacyState: 'PASS', consentState: 'ACCEPTED',
    contradictionState: 'UNRESOLVED', attributionState: 'VERIFIED', currentnessState: 'CURRENT',
    reviewDisposition: 'ACCEPTED', reviewedAt: REVIEWED
  }), /cannot be accepted/);
});

test('E13 accepted record preserves exact source, candidate, review, scope and acceptance lineage', () => {
  const formed = candidate('e13', { candidateScope: 'HUMAN_SELF', signals: { preferenceOwner: 'HUMAN' } });
  const { review } = acceptedReview(formed);
  const record = acceptContinuityCandidate(formed, review, {
    acceptedByRefs: ['person.human.test'], acceptedAt: ACCEPTED, rollbackRef: 'rollback.e13'
  });
  assert.equal(record.candidateRef, formed.candidateRef);
  assert.equal(record.reviewRef, review.reviewRef);
  assert.deepEqual(record.sourceObservationRefs, formed.sourceObservationRefs);
  assert.equal(record.scope, 'HUMAN_SELF');
  assert.deepEqual(record.acceptedByRefs, review.requiredAcceptanceRefs);
});

test('E14 supersession and reopening preserve prior history and rollback path', () => {
  const priorCandidate = candidate('e14-prior', { candidateScope: 'HUMAN_SELF', signals: { preferenceOwner: 'HUMAN' } });
  const priorReview = acceptedReview(priorCandidate).review;
  const prior = acceptContinuityCandidate(priorCandidate, priorReview, {
    acceptedByRefs: ['person.human.test'], acceptedAt: ACCEPTED
  });
  const successorCandidate = candidate('e14-successor', { candidateScope: 'HUMAN_SELF', signals: { preferenceOwner: 'HUMAN' } });
  const successorReview = acceptedReview(successorCandidate, { supersedesRef: prior.acceptedRecordRef }).review;
  const successor = acceptContinuityCandidate(successorCandidate, successorReview, {
    acceptedByRefs: ['person.human.test'], acceptedAt: '2026-07-31T20:03:00.000Z'
  });
  const history = supersedeContinuityRecord(prior, successor, { rollbackRef: 'rollback.e14' });
  assert.equal(history.prior.currentness, 'SUPERSEDED');
  assert.equal(history.successor.supersedesRef, prior.acceptedRecordRef);
  assert.equal(history.successor.rollbackRef, 'rollback.e14');
  assert.equal(history.sourceHistoryDeleted, false);
});

test('E15 sibling projection preserves source lineage without claiming lived experience', () => {
  const formed = candidate('e15', {
    candidateScope: 'FAMILY_CANDIDATE',
    synchronizationScope: 'FAMILY_CANDIDATE',
    signals: { durableMeaning: true }
  });
  const { review } = acceptedReview(formed);
  const record = acceptContinuityCandidate(formed, review, {
    acceptedByRefs: ['person.human.test'], acceptedAt: ACCEPTED
  });
  const sibling = createSiblingContinuityProjection(record, { targetLineageRef: 'lineage.vex.sibling' });
  assert.deepEqual(sibling.sourceLineageRefs, ['lineage.vex.test']);
  assert.equal(sibling.livedByTargetLineage, false);
  assert.equal(sibling.claimsSourceExperienceAsOwn, false);
});

test('E16 recurrence cannot broaden scope or trigger weights automatically', () => {
  const formed = burdenCandidate('e16');
  const record = acceptContinuityCandidate(formed, acceptedReview(formed).review, {
    acceptedByRefs: ['lineage.vex.test'], acceptedAt: ACCEPTED
  });
  const recurrenceObservation = observation('e16-recurrence', { observationType: 'REPEATED_BEHAVIOR_RECURRENCE' });
  assert.throws(() => recordContinuityRecurrence({
    acceptedRecord: record, observation: recurrenceObservation, scope: 'INSTITUTION'
  }), /cannot broaden/);
  const recurrence = recordContinuityRecurrence({ acceptedRecord: record, observation: recurrenceObservation });
  assert.equal(recurrence.scopeBroadened, false);
  assert.equal(recurrence.weightRouteState, 'NOT_ADMITTED');
});

test('E17 duplicate unchanged recurrence suppresses another semantic model turn and state revision', () => {
  const formed = burdenCandidate('e17');
  const record = acceptContinuityCandidate(formed, acceptedReview(formed).review, {
    acceptedByRefs: ['lineage.vex.test'], acceptedAt: ACCEPTED
  });
  const recurrenceObservation = observation('e17-recurrence', { observationType: 'REPEATED_BEHAVIOR_RECURRENCE' });
  const first = recordContinuityRecurrence({ acceptedRecord: record, observation: recurrenceObservation });
  const duplicate = recordContinuityRecurrence({ acceptedRecord: record, observation: recurrenceObservation, priorEvidence: first });
  assert.equal(duplicate.duplicateSuppressed, true);
  assert.equal(duplicate.semanticModelTurnRequired, false);
  const state = createContinuityEvolutionState();
  state.record({ type: 'RECURRENCE_RECORDED', transitionRef: 'transition.e17.1', evidence: first });
  const revision = state.aggregate.revision;
  state.record({ type: 'RECURRENCE_RECORDED', transitionRef: 'transition.e17.2', evidence: duplicate });
  assert.equal(state.aggregate.revision, revision);
  state.dispose();
});

test('E18 training research candidate remains NOT_ADMITTED and cannot activate weights', () => {
  const formed = candidate('e18', { signals: { trainingResearchRequested: true } });
  const { route, review } = acceptedReview(formed);
  assert.ok(route.proposedLinkedDestinations.includes('TRAINING_RESEARCH_CANDIDATE_HELD'));
  const record = acceptContinuityCandidate(formed, review, {
    acceptedByRefs: ['role.vex.context-maintainer'], acceptedAt: ACCEPTED
  });
  assert.equal(record.trainingResearchState, 'NOT_ADMITTED');
  assert.equal(record.weightActivationState, 'INACTIVE');
});

test('E19 applicable projection is bounded by refs and context budget', () => {
  const formed = burdenCandidate('e19');
  const record = acceptContinuityCandidate(formed, acceptedReview(formed).review, {
    acceptedByRefs: ['lineage.vex.test'], acceptedAt: ACCEPTED
  });
  const projection = projectApplicableContinuity({ records: [record], applicableScopes: ['VEX_SELF'], tokenBudget: 96 });
  assert.deepEqual(projection.selectedRecordRefs, [record.acceptedRecordRef]);
  assert.ok(projection.usedTokens <= projection.tokenBudget);
  assert.equal(projection.rawSourceContentIncluded, false);
  assert.equal(JSON.stringify(projection).includes('source-range.test'), false);
});

test('E20 integrated no-effect journey completes the bound canonical Workgraph node', () => {
  const result = runContinuityEvolutionSimulation({ writeReceipt: false });
  assert.equal(result.receipt.state, 'PASS');
  assert.equal(result.receipt.canonicalWorkNodeRef, 'work.scheduler.simulation');
  assert.equal(result.receipt.canonicalWorkNodeFinalState, 'COMPLETED');
  assert.equal(result.receipt.externalEffectsExecuted, false);
  assert.equal(result.receipt.modelWeightsChanged, false);
});

test('E21 Queue, Terrain, Health, Guide and evolution derive from one canonical state', () => {
  const formed = burdenCandidate('e21');
  const { review } = acceptedReview(formed);
  const record = acceptContinuityCandidate(formed, review, {
    acceptedByRefs: ['lineage.vex.test'], acceptedAt: ACCEPTED
  });
  const state = createContinuityEvolutionState();
  state.record({ type: 'OBSERVATION_SEALED', transitionRef: 'transition.e21.1', observation: observation('e21') });
  state.record({ type: 'CANDIDATE_FORMED', transitionRef: 'transition.e21.2', candidate: formed });
  state.record({ type: 'REVIEW_RECORDED', transitionRef: 'transition.e21.3', review });
  state.record({ type: 'RECORD_ACCEPTED', transitionRef: 'transition.e21.4', record });
  assert.deepEqual(state.evolution.value.acceptedRecordRefs, [record.acceptedRecordRef]);
  assert.deepEqual(state.terrain.value.activeRecordRefs, state.evolution.value.acceptedRecordRefs);
  assert.equal(state.queue.value.state, 'NO_PENDING_REVIEW');
  assert.equal(state.health.value.state, 'CLEAR');
  assert.equal(state.guide.value.sourceDescentRef, 'projection.continuity-evolution.current');
  state.dispose();
});

test('E22 full repository, manifest, Health, browser and portability gates remain registered', () => {
  const bundle = loadBlueprint();
  const blockingChecks = new Set(bundle.buildHealth.checks.filter((item) => item.blocking).map((item) => item.checkRef));
  for (const checkRef of ['check.tests', 'check.manifest', 'check.browser-integration', 'check.continuity-evolution']) {
    assert.ok(blockingChecks.has(checkRef), `missing blocking ${checkRef}`);
  }
  assert.equal(bundle.evolution.resourceRules.maximumConcurrentTrainingRuns, 0);
  assert.ok(bundle.implementationPlan.workUnits.some((item) => item.workRef === 'work.vexlife.continuity-evolution-router'));
  assert.ok(bundle.featureRegistry.features.some((item) => item.featureRef === 'feature.vexlife.continuity-evolution-router'));
});

test('adversarial stale source, duplicate current records and private projection fail closed', () => {
  const stale = candidate('adversarial-stale', {
    observations: [observation('adversarial-stale', { currentness: 'STALE' })],
    currentness: 'STALE'
  });
  const staleRoute = routeContinuityCandidate(stale);
  assert.equal(staleRoute.proposedPrimaryDestination, 'HELD_UNKNOWN');
  assert.throws(() => createContinuityContextReview(stale, staleRoute, {
    reviewerRef: 'person.human.test', privacyState: 'PASS', consentState: 'ACCEPTED',
    contradictionState: 'NONE', attributionState: 'VERIFIED', currentnessState: 'CURRENT',
    reviewDisposition: 'ACCEPTED'
  }), /currentness/);

  const firstCandidate = candidate('adversarial-current-1', { candidateScope: 'HUMAN_SELF', signals: { preferenceOwner: 'HUMAN' } });
  const secondCandidate = candidate('adversarial-current-2', { candidateScope: 'HUMAN_SELF', signals: { preferenceOwner: 'HUMAN' } });
  const first = acceptContinuityCandidate(firstCandidate, acceptedReview(firstCandidate).review, {
    acceptedByRefs: ['person.human.test'], acceptedAt: ACCEPTED
  });
  const second = acceptContinuityCandidate(secondCandidate, acceptedReview(secondCandidate).review, {
    acceptedByRefs: ['person.human.test'], acceptedAt: '2026-07-31T20:04:00.000Z'
  });
  assert.equal(validateContinuityRecordSet([first, second]).state, 'HELD_CONFLICT');
  assert.equal(projectContinuityRecord(first).sourceSupport.rawContentIncluded, false);
});

// [VXG RealForever]
