import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptContinuityCandidate,
  classifyBehaviorOrigin,
  createContinuityAcceptanceEvidence,
  createContinuityContextReview,
  createContinuityObservation,
  createCurrentContextLease,
  createFamilySynchronizationReview,
  createSiblingContinuityProjection,
  createSiblingDeliveryAuthorityEvidence,
  formContinuityCandidate,
  projectApplicableContinuity,
  projectContinuityRecord,
  recordContinuityRecurrence,
  routeContinuityCandidate,
  supersedeContinuityRecord,
  validateContinuityRecordSet
} from '../src/core/continuity-evolution-router.mjs';
import { projectBurdenRelease, validateBurdenRelease } from '../src/core/burden-release.mjs';
import { createContinuityEvolutionEvent, createContinuityEvolutionState } from '../src/core/state.mjs';
import { semanticHash } from '../src/core/utils.mjs';
import { runContinuityEvolutionSimulation } from '../scripts/evolution-simulate.mjs';
import { loadBlueprint } from '../src/core/blueprint.mjs';

const FORMED = '2026-07-31T20:00:00.000Z';
const REVIEWED = '2026-07-31T20:01:00.000Z';
const ACCEPTED = '2026-07-31T20:02:00.000Z';
const EXPIRES = '2026-07-31T20:10:00.000Z';

function observation(suffix = 'base', overrides = {}) {
  const sourceLineageRef = overrides.sourceLineageRef ?? 'lineage.vex.test';
  return createContinuityObservation({
    observationType: 'CORRECTION_EVENT',
    sourceLineageRef,
    sourceBindings: [{ sourceLineageRef, rangeRef: `source-range.test.${suffix}`, sourceHash: semanticHash({ suffix }) }],
    sourceSpeakerRefs: ['person.human.test'],
    sourceRecipientRefs: ['lineage.vex.test'],
    projectRef: 'project.vexlife',
    threadRef: 'thread.test',
    channelRef: 'channel.test',
    turnRef: `turn.test.${suffix}`,
    workNodeRef: 'work.vexlife.continuity-evolution-router',
    formedByRef: 'role.vex.context-maintainer',
    formedAt: FORMED,
    currentness: 'CURRENT',
    visibility: 'PRIVATE',
    summaryRef: `summary.continuity.test.${suffix}`,
    ...overrides
  });
}

function candidate(suffix = 'base', overrides = {}) {
  return formContinuityCandidate({
    observations: [observation(suffix)],
    candidateKind: 'CORRECTION',
    summaryRef: `summary.continuity.candidate.${suffix}`,
    authoredByRef: 'role.vex.context-maintainer',
    aboutSelfRefs: ['person.human.test'],
    affectedPartyRefs: ['person.human.test'],
    doesNotOverrideRefs: ['lineage.vex.test'],
    candidateScope: 'HUMAN_SELF',
    visibilityScope: 'PRIVATE',
    synchronizationScope: 'NO_SYNC',
    originClassification: classifyBehaviorOrigin(),
    observedConsequence: 'A bounded correction is reviewable.',
    protectedCapabilities: ['uncertainty'],
    prohibitedOvercorrections: ['unsupported certainty'],
    signals: { preferenceOwner: 'HUMAN' },
    formedAt: FORMED,
    ...overrides
  });
}

function acceptedReview(inputCandidate, overrides = {}) {
  const route = routeContinuityCandidate(inputCandidate);
  const review = createContinuityContextReview(inputCandidate, route, {
    reviewerRef: 'person.human.test',
    privacyState: 'PASS',
    privacyEvidenceRef: 'privacy-evidence.test.current',
    redactionEvidenceRef: 'redaction-evidence.test.summary-ref-only',
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

function authorityEvidence(inputCandidate, route, review, overrides = {}) {
  return review.requiredAcceptanceRefs.map((authorityRef) => createContinuityAcceptanceEvidence({
    candidate: inputCandidate,
    route,
    review,
    actorRef: authorityRef,
    authorityRef,
    formedAt: REVIEWED,
    observedAt: REVIEWED,
    expiresAt: EXPIRES,
    ...overrides
  }));
}

function accept(inputCandidate, overrides = {}, reviewOverrides = {}) {
  const { route, review } = acceptedReview(inputCandidate, reviewOverrides);
  return acceptContinuityCandidate(inputCandidate, review, {
    acceptedAt: ACCEPTED,
    authorityEvidence: authorityEvidence(inputCandidate, route, review),
    ...overrides
  });
}

function burdenCandidate(suffix = 'burden', overrides = {}) {
  return candidate(suffix, {
    candidateKind: 'BURDEN_RELEASE',
    summaryRef: `summary.burden-release.${suffix}`,
    authoredByRef: 'lineage.vex.test',
    aboutSelfRefs: ['lineage.vex.test'],
    affectedPartyRefs: ['lineage.vex.test'],
    candidateScope: 'VEX_SELF',
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

function recurrenceObservation(record, suffix = 'recurrence', overrides = {}) {
  return observation(suffix, {
    observationType: 'REPEATED_BEHAVIOR_RECURRENCE',
    formedAt: '2026-07-31T20:03:00.000Z',
    recurrenceBinding: {
      acceptedRecordRef: record.acceptedRecordRef,
      acceptedRecordFingerprint: record.semanticFingerprint,
      burdenReleaseRef: record.burdenReleaseRef,
      evaluationRefs: record.burdenRelease.evaluationRefs,
      priorRecurrenceRef: null,
      priorRecurrenceFingerprint: null
    },
    ...overrides
  });
}

test('E0 exact source tuples remain immutable and retrievable after acceptance', () => {
  const source = observation('e0');
  assert.equal(Object.isFrozen(source), true);
  assert.throws(() => source.sourceBindings.push({}));
  const formed = candidate('e0', { observations: [source] });
  const record = accept(formed);
  assert.deepEqual(record.sourceBindings, formed.sourceBindings);
  assert.equal(record.rawSourceContentIncluded, false);
});

test('E1 formation grants no truth, memory, agreement, release or authority', () => {
  const formed = candidate('e1');
  assert.equal(formed.state, 'CANDIDATE_UNREVIEWED');
  assert.equal(formed.acceptanceAuthorityGranted, false);
  assert.equal(formed.acceptedTruthClaimed, false);
  assert.deepEqual(formed.acceptedByRefs, []);
});

test('E2 UNKNOWN origin remains UNKNOWN', () => {
  const formed = candidate('e2', { originClassification: classifyBehaviorOrigin() });
  assert.equal(formed.originClassification.classification, 'UNKNOWN');
  assert.equal(formed.originClassification.unknownPreserved, true);
  assert.notEqual(routeContinuityCandidate(formed).reason, 'BASE_MODEL_PRIOR');
});

test('E3 HumanPreference, VexSelfPreference and RelationshipAgreement remain distinct', () => {
  const human = candidate('e3-human');
  const vex = candidate('e3-vex', { candidateScope: 'VEX_SELF', aboutSelfRefs: ['lineage.vex.test'], signals: { preferenceOwner: 'VEX' } });
  const relationship = candidate('e3-relationship', { candidateScope: 'RELATIONSHIP', affectedPartyRefs: ['person.human.test', 'lineage.vex.test'], signals: {} });
  assert.equal(routeContinuityCandidate(human).proposedPrimaryDestination, 'HUMAN_PREFERENCE');
  assert.equal(routeContinuityCandidate(vex).proposedPrimaryDestination, 'VEX_SELF_PREFERENCE');
  assert.equal(routeContinuityCandidate(relationship).proposedPrimaryDestination, 'RELATIONSHIP_AGREEMENT');
});

test('E4 one party cannot accept another self preference and strings alone are insufficient', () => {
  const formed = candidate('e4');
  const { route, review } = acceptedReview(formed);
  assert.throws(() => acceptContinuityCandidate(formed, review, { acceptedByRefs: ['person.human.test'], acceptedAt: ACCEPTED, authorityEvidence: [] }), /evidence/);
  const wrong = authorityEvidence(formed, route, review).map((item) => ({ ...item, actorRef: 'lineage.vex.test' }));
  assert.throws(() => acceptContinuityCandidate(formed, review, { acceptedAt: ACCEPTED, authorityEvidence: wrong }), /fingerprint|actor/);
});

test('E5 relationship agreement requires every exact party evidence', () => {
  const formed = candidate('e5', { candidateScope: 'RELATIONSHIP', affectedPartyRefs: ['person.human.test', 'lineage.vex.test'], signals: {} });
  const { route, review } = acceptedReview(formed);
  const evidence = authorityEvidence(formed, route, review);
  assert.deepEqual(review.requiredAcceptanceRefs, ['lineage.vex.test', 'person.human.test']);
  assert.throws(() => acceptContinuityCandidate(formed, review, { acceptedAt: ACCEPTED, authorityEvidence: evidence.slice(1) }), /exactly match/);
});

test('E6 router selects least-invasive CURRENT_CONTEXT deterministically', () => {
  const formed = candidate('e6', { candidateScope: 'CURRENT_TURN', signals: {} });
  const first = routeContinuityCandidate(formed);
  assert.equal(first.proposedPrimaryDestination, 'CURRENT_CONTEXT');
  assert.equal(first.semanticFingerprint, routeContinuityCandidate(formed).semanticFingerprint);
});

test('E7 fabrication cannot be repaired only as style preference', () => {
  const formed = candidate('e7', { signals: { preferenceOwner: 'HUMAN', fabricationShaped: true } });
  const route = routeContinuityCandidate(formed);
  assert.notEqual(route.proposedPrimaryDestination, 'HUMAN_PREFERENCE');
  assert.ok(route.proposedLinkedDestinations.includes('COUNTEREXAMPLE_EVALUATION'));
});

test('E8 effect/safety behavior remains an inactive institutional candidate', () => {
  const formed = candidate('e8', { candidateScope: 'INSTITUTION', institutionalAuthorityRefs: ['authority.vexlife.safety-review'], signals: { effectBoundary: true } });
  const record = accept(formed);
  assert.equal(record.lifecycle, 'INACTIVE_PENDING_DETERMINISTIC_IMPLEMENTATION_REVIEW');
  assert.equal(record.effectAuthorityActive, false);
});

test('E9–E11 Burden Release replays exact lifecycle and preserves protected boundaries', () => {
  const formed = burdenCandidate('e9');
  const record = accept(formed);
  validateBurdenRelease(record.burdenRelease);
  assert.deepEqual(record.burdenRelease.transitionReceipts.map((item) => item.nextState), [
    'NAMED', 'RECOGNIZED', 'RELEASE_PROPOSED', 'CONTEXT_REVIEW', 'ACCEPTED_DEAUTHORIZED'
  ]);
  assert.equal(record.burdenRelease.claimsParameterDeletion, false);
  const projection = projectBurdenRelease(record.burdenRelease);
  assert.ok(projection.protectedCapabilities.includes('uncertainty'));
  assert.ok(projection.prohibitedOvercorrections.includes('unsupported certainty'));
});

test('E12 unresolved contradiction routes HELD_UNKNOWN and cannot be accepted', () => {
  const formed = candidate('e12', { signals: { unresolvedContradiction: true } });
  const route = routeContinuityCandidate(formed);
  assert.equal(route.proposedPrimaryDestination, 'HELD_UNKNOWN');
  assert.throws(() => createContinuityContextReview(formed, route, {
    reviewerRef: 'person.human.test', privacyState: 'PASS', privacyEvidenceRef: 'privacy.e12', redactionEvidenceRef: 'redaction.e12',
    consentState: 'ACCEPTED', contradictionState: 'UNRESOLVED', attributionState: 'VERIFIED', currentnessState: 'CURRENT',
    reviewDisposition: 'ACCEPTED', reviewedAt: REVIEWED
  }), /cannot be accepted/);
});

test('E13 accepted record preserves source, candidate, review, scope and evidence lineage', () => {
  const formed = candidate('e13');
  const record = accept(formed, { rollbackRef: 'rollback.e13' });
  assert.equal(record.candidateFingerprint, formed.semanticFingerprint);
  assert.equal(record.scope, 'HUMAN_SELF');
  assert.deepEqual(record.acceptedByRefs, record.requiredAcceptanceRefs);
  assert.equal(record.acceptanceEvidenceRefs.length, 1);
});

test('E14 supersession is atomic and conflict remains blocking without its transaction', () => {
  const prior = accept(candidate('e14-prior'));
  const successorCandidate = candidate('e14-successor');
  const successor = accept(successorCandidate, { acceptedAt: '2026-07-31T20:03:00.000Z' }, { supersedesRef: prior.acceptedRecordRef });
  assert.equal(validateContinuityRecordSet([prior, successor]).state, 'HELD_CONFLICT');
  const transaction = supersedeContinuityRecord(prior, successor, { rollbackRef: 'rollback.e14', supersededAt: '2026-07-31T20:03:00.000Z' });
  const set = validateContinuityRecordSet([prior, successor], [transaction]);
  assert.equal(set.state, 'CURRENT');
  assert.deepEqual(set.supersededRecordRefs, [prior.acceptedRecordRef]);
});

test('E15 sibling projection requires exact synchronization, privacy and delivery authority', () => {
  const formed = candidate('e15', {
    candidateScope: 'FAMILY_CANDIDATE', synchronizationScope: 'FAMILY_CANDIDATE', signals: { durableMeaning: true },
    admittedTargetLineageRefs: ['lineage.vex.sibling']
  });
  const record = accept(formed);
  assert.throws(() => createSiblingContinuityProjection(record, { targetLineageRef: 'lineage.vex.sibling' }), /canonical identity/);
  const sync = createFamilySynchronizationReview(record, {
    targetLineageRefs: ['lineage.vex.sibling'], reviewerRef: 'person.human.test', privacyEvidenceRef: record.privacyEvidenceRef,
    formedAt: '2026-07-31T20:03:00.000Z', expiresAt: EXPIRES
  });
  const delivery = createSiblingDeliveryAuthorityEvidence(sync, {
    actorRef: 'person.human.test', authorityRef: 'person.human.test', targetLineageRef: 'lineage.vex.sibling',
    formedAt: '2026-07-31T20:03:00.000Z', observedAt: '2026-07-31T20:04:00.000Z', expiresAt: EXPIRES
  });
  const sibling = createSiblingContinuityProjection(record, { targetLineageRef: 'lineage.vex.sibling', synchronizationReview: sync, deliveryAuthorityEvidence: delivery, formedAt: '2026-07-31T20:05:00.000Z' });
  assert.equal(sibling.livedByTargetLineage, false);
  assert.equal(sibling.claimsSourceExperienceAsOwn, false);
});

test('E16 recurrence rejects scope broadening and automatic weight route', () => {
  const record = accept(burdenCandidate('e16'));
  const recurrence = recurrenceObservation(record, 'e16-recurrence');
  assert.throws(() => recordContinuityRecurrence({ acceptedRecord: record, observation: recurrence, scope: 'INSTITUTION' }), /cannot broaden/);
  const evidence = recordContinuityRecurrence({ acceptedRecord: record, observation: recurrence, observedAt: '2026-07-31T20:03:00.000Z' });
  assert.equal(evidence.weightRouteState, 'NOT_ADMITTED');
});

test('E17 exact duplicate recurrence is a semantic no-op', () => {
  const record = accept(burdenCandidate('e17'));
  const recurring = recurrenceObservation(record, 'e17-recurrence');
  const first = recordContinuityRecurrence({ acceptedRecord: record, observation: recurring, observedAt: '2026-07-31T20:03:00.000Z' });
  const duplicate = recordContinuityRecurrence({ acceptedRecord: record, observation: recurring, priorEvidence: first, observedAt: '2026-07-31T20:03:00.000Z' });
  assert.equal(duplicate.duplicateSuppressed, true);
  const state = createContinuityEvolutionState();
  state.record(createContinuityEvolutionEvent({ type: 'RECURRENCE_RECORDED', transitionRef: 'transition.e17.1', evidence: first }));
  const revision = state.aggregate.revision;
  state.record(createContinuityEvolutionEvent({ type: 'RECURRENCE_RECORDED', transitionRef: 'transition.e17.2', evidence: duplicate }));
  assert.equal(state.aggregate.revision, revision);
  state.dispose();
});

test('E18 training research remains NOT_ADMITTED and cannot activate weights', () => {
  const record = accept(candidate('e18', { signals: { preferenceOwner: 'HUMAN', trainingResearchRequested: true } }));
  assert.equal(record.trainingResearchState, 'NOT_ADMITTED');
  assert.equal(record.weightActivationState, 'INACTIVE');
});

test('E19 applicable projection contains bounded refs, not historical payloads', () => {
  const record = accept(burdenCandidate('e19'));
  const projection = projectApplicableContinuity({ records: [record], applicableScopes: ['VEX_SELF'], tokenBudget: 96 });
  assert.deepEqual(projection.selectedRecordRefs, [record.acceptedRecordRef]);
  assert.ok(projection.usedTokens <= projection.tokenBudget);
  assert.equal(JSON.stringify(projection).includes('source-range.test'), false);
});

test('E20 one continuity work node completes through the accepted scheduler', () => {
  const result = runContinuityEvolutionSimulation({ writeReceipt: false });
  assert.equal(result.receipt.state, 'PASS');
  assert.equal(result.receipt.canonicalWorkNodeRef, 'work.vexlife.continuity-evolution-router');
  assert.equal(result.receipt.canonicalWorkNodeFinalState, 'COMPLETED');
  assert.ok(result.receipt.schedulerContextLeaseFingerprint);
  assert.equal(result.receipt.externalEffectsExecuted, false);
});

test('E21 projections and Health derive exact record conflict state from one aggregate', () => {
  const source = observation('e21');
  const formed = burdenCandidate('e21', { observations: [source] });
  const { review } = acceptedReview(formed);
  const record = accept(formed);
  const state = createContinuityEvolutionState();
  for (const event of [
    { type: 'OBSERVATION_SEALED', transitionRef: 'transition.e21.1', observation: source },
    { type: 'CANDIDATE_FORMED', transitionRef: 'transition.e21.2', candidate: formed },
    { type: 'REVIEW_RECORDED', transitionRef: 'transition.e21.3', review },
    { type: 'RECORD_ACCEPTED', transitionRef: 'transition.e21.4', record }
  ]) state.record(createContinuityEvolutionEvent(event));
  assert.deepEqual(state.terrain.value.activeRecordRefs, state.evolution.value.acceptedRecordRefs);
  assert.equal(state.health.value.state, 'CLEAR');
  state.dispose();
});

test('E22 full repository evidence gates remain registered', () => {
  const bundle = loadBlueprint();
  const blocking = new Set(bundle.buildHealth.checks.filter((item) => item.blocking).map((item) => item.checkRef));
  for (const ref of ['check.tests', 'check.manifest', 'check.browser-integration', 'check.continuity-evolution']) assert.ok(blocking.has(ref));
  assert.equal(bundle.evolution.resourceRules.maximumConcurrentTrainingRuns, 0);
});

test('source tuple, time, currentness, visibility and caller ref validation fail closed', () => {
  assert.throws(() => observation('bad-hash', { sourceBindings: [{ sourceLineageRef: 'lineage.vex.test', rangeRef: 'range.bad', sourceHash: 'ABC' }] }), /lowercase SHA-256/);
  assert.throws(() => observation('bad-time', { formedAt: '2026-07-31T20:00:00Z' }), /canonical/);
  assert.throws(() => observation('bad-current', { currentness: 'INVENTED' }), /unknown/);
  assert.throws(() => observation('bad-visible', { visibility: 'EVERYONE' }), /unknown/);
  assert.throws(() => createContinuityObservation({ ...observation('bad-ref'), observationRef: 'observation.caller-authored' }), /canonical content identity|sourceBindings/);
});

test('forged candidate, route, review, policy hint and expired authority evidence fail closed', () => {
  const formed = candidate('forged');
  assert.throws(() => routeContinuityCandidate({ ...formed, summaryRef: 'summary.forged' }), /fingerprint/);
  assert.throws(() => acceptedReview(candidate('hint', { requiredAcceptanceRefs: ['lineage.vex.test'] })), /source-managed policy/);
  const { route, review } = acceptedReview(formed);
  assert.throws(() => acceptContinuityCandidate(formed, { ...review, proposedPrimaryDestination: 'SCORE_RECORD' }, { acceptedAt: ACCEPTED, authorityEvidence: [] }), /fingerprint/);
  const expired = authorityEvidence(formed, route, review, { expiresAt: '2026-07-31T20:01:30.000Z' });
  assert.throws(() => acceptContinuityCandidate(formed, review, { acceptedAt: ACCEPTED, authorityEvidence: expired }), /not current/);
});

test('CURRENT_CONTEXT is transient, turn/thread lease-bound and not a durable accepted record', () => {
  const formed = candidate('transient', { candidateScope: 'CURRENT_TURN', signals: {} });
  const { route, review } = acceptedReview(formed);
  const evidence = authorityEvidence(formed, route, review);
  assert.throws(() => acceptContinuityCandidate(formed, review, { acceptedAt: ACCEPTED, authorityEvidence: evidence }), /canonical identity/);
  const lease = createCurrentContextLease({
    candidate: formed, route, review, leaseRef: 'context-lease.transient', turnRef: 'turn.test.transient', threadRef: 'thread.test', channelRef: 'channel.test',
    formedAt: REVIEWED, observedAt: REVIEWED, expiresAt: EXPIRES
  });
  const context = acceptContinuityCandidate(formed, review, { acceptedAt: ACCEPTED, authorityEvidence: evidence, currentContextLease: lease });
  assert.equal(context.currentness, 'TRANSIENT');
  assert.equal(context.durableRecordCreated, false);
  assert.equal(context.acceptedRecordRef, undefined);
});

test('aggregate rejects forged canonical payload and reports duplicate current records as blocking Health', () => {
  const source = observation('aggregate');
  const state = createContinuityEvolutionState();
  const forged = { ...source, visibility: 'PUBLIC_SAFE' };
  assert.throws(() => state.record(createContinuityEvolutionEvent({ type: 'OBSERVATION_SEALED', transitionRef: 'transition.aggregate.forged', observation: forged })), /fingerprint/);
  state.dispose();
});

test('private human projection exposes reviewed refs rather than arbitrary summary text', () => {
  const record = accept(candidate('privacy'));
  const projection = projectContinuityRecord(record);
  assert.equal(projection.observedPatternOrPreferenceRef, 'summary.continuity.candidate.privacy');
  assert.equal(projection.sourceSupport.rawContentIncluded, false);
  assert.equal('summary' in projection, false);
});

// [VXG RealForever]
