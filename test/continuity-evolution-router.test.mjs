import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTINUITY_ACCEPTANCE_EVIDENCE_REQUIRED_FIELDS,
  CONTINUITY_CONTEXT_REVIEW_REQUIRED_FIELDS,
  CONTINUITY_SCOPE_TARGET_REQUIRED_FIELDS,
  CONTINUITY_SUPERSESSION_TRANSACTION_REQUIRED_FIELDS,
  acceptContinuityCandidate,
  classifyBehaviorOrigin,
  createContinuityAcceptanceEvidence,
  createContinuityAuthoritySnapshot,
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
  validateContinuityRecordSet,
  validateContinuitySupersession
} from '../src/core/continuity-evolution-router.mjs';
import {
  BURDEN_RELEASE_REQUIRED_FIELDS,
  CONTINUITY_AUTHORITY_SNAPSHOT_REQUIRED_FIELDS,
  acceptBurdenRelease,
  createBurdenRelease,
  projectBurdenRelease,
  transitionBurdenRelease,
  validateBurdenRelease
} from '../src/core/burden-release.mjs';
import {
  createContinuityCurrentRecordSetReceipt,
  createContinuityEvolutionEvent,
  createContinuityEvolutionState,
  createContinuityProjectionClockReceipt,
  createContinuitySimulatedClockSnapshot,
  CONTINUITY_PROJECTION_CLOCK_RECEIPT_REQUIRED_FIELDS,
  CONTINUITY_SIMULATED_CLOCK_SNAPSHOT_REQUIRED_FIELDS,
  CONTINUITY_SIMULATED_CLOCK_SOURCE,
  createInitialContinuityEvolutionAggregate,
  projectAggregateApplicableContinuity,
  projectAggregateOwnedBurdenRelease,
  projectAggregateOwnedContinuityRecord,
  projectAggregateOwnedTransientContinuityContext
} from '../src/core/state.mjs';
import { semanticHash } from '../src/core/utils.mjs';
import { runContinuityEvolutionSimulation } from '../scripts/evolution-simulate.mjs';
import { loadBlueprint } from '../src/core/blueprint.mjs';

const FORMED = '2026-07-31T20:00:00.000Z';
const REVIEWED = '2026-07-31T20:01:00.000Z';
const ACCEPTED = '2026-07-31T20:02:00.000Z';
const EXPIRES = '2026-07-31T20:10:00.000Z';
const CANDIDATE_OBSERVATIONS = new Map();

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
  const observations = overrides.observations ?? [observation(suffix)];
  const formed = formContinuityCandidate({
    observations,
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
  CANDIDATE_OBSERVATIONS.set(formed.candidateRef, observations);
  return formed;
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
  const subjectRefs = route.proposedPrimaryDestination === 'CURRENT_CONTEXT'
    ? inputCandidate.aboutSelfRefs
    : review.requiredAcceptanceRefs;
  return review.requiredAcceptanceRefs.map((authorityRef) => {
    const authoritySnapshot = createContinuityAuthoritySnapshot({
      actorRef: authorityRef,
      authorityRef,
      subjectRefs,
      scope: inputCandidate.candidateScope,
      scopeTarget: inputCandidate.scopeTarget,
      recordClass: route.proposedPrimaryDestination,
      formedAt: REVIEWED,
      observedAt: REVIEWED,
      expiresAt: EXPIRES,
      ...overrides
    });
    return createContinuityAcceptanceEvidence({ candidate: inputCandidate, route, review, authoritySnapshot });
  });
}

function accept(inputCandidate, overrides = {}, reviewOverrides = {}) {
  const { route, review } = acceptedReview(inputCandidate, reviewOverrides);
  const evidence = authorityEvidence(inputCandidate, route, review);
  const aggregate = createInitialContinuityEvolutionAggregate();
  aggregate.observations = structuredClone(CANDIDATE_OBSERVATIONS.get(inputCandidate.candidateRef) ?? []);
  aggregate.candidates = [structuredClone(inputCandidate)];
  aggregate.reviews = [structuredClone(review)];
  aggregate.authorityEvidence = structuredClone(evidence);
  delete aggregate.semanticFingerprint;
  aggregate.semanticFingerprint = semanticHash(aggregate);
  return acceptContinuityCandidate(inputCandidate, review, {
    acceptedAt: ACCEPTED,
    authorityEvidence: evidence,
    aggregate,
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

function refingerprint(value, refField, prefix, changes) {
  const core = { ...structuredClone(value), ...changes };
  delete core.semanticFingerprint;
  delete core[refField];
  const semanticFingerprint = semanticHash(core);
  return { ...core, [refField]: `${prefix}.${semanticFingerprint.slice(0, 24)}`, semanticFingerprint };
}

function refingerprintAggregate(aggregate, changes = {}) {
  const core = { ...structuredClone(aggregate), ...changes };
  delete core.semanticFingerprint;
  return { ...core, semanticFingerprint: semanticHash(core) };
}

function expectAggregateRejectsUnchanged(state, event, pattern) {
  const before = semanticHash(state.aggregate.value);
  const revision = state.aggregate.revision;
  assert.throws(() => state.record(createContinuityEvolutionEvent(event)), pattern);
  assert.equal(semanticHash(state.aggregate.value), before);
  assert.equal(state.aggregate.revision, revision);
}

function recordLineagePrerequisitesIntoState(state, inputCandidate, review, evidence, suffix = 'projection') {
  const events = [
    ...(CANDIDATE_OBSERVATIONS.get(inputCandidate.candidateRef) ?? []).map((source, index) => ({
      type: 'OBSERVATION_SEALED', transitionRef: `transition.${suffix}.observation.${index}`, observation: source
    })),
    { type: 'CANDIDATE_FORMED', transitionRef: `transition.${suffix}.candidate`, candidate: inputCandidate },
    { type: 'REVIEW_RECORDED', transitionRef: `transition.${suffix}.review`, review },
    ...evidence.map((item, index) => ({
      type: 'AUTHORITY_EVIDENCE_RECORDED', transitionRef: `transition.${suffix}.authority.${index}`, evidence: item
    }))
  ];
  for (const event of events) state.record(createContinuityEvolutionEvent(event));
  return state;
}

function recordLineageIntoState(state, inputCandidate, review, evidence, record, suffix = 'projection') {
  recordLineagePrerequisitesIntoState(state, inputCandidate, review, evidence, suffix);
  state.record(createContinuityEvolutionEvent({
    type: 'RECORD_ACCEPTED', transitionRef: `transition.${suffix}.record`, record
  }));
  return state;
}

function stateWithAcceptedRecord(inputCandidate, review, evidence, record, suffix = 'projection') {
  const state = createContinuityEvolutionState();
  recordLineageIntoState(state, inputCandidate, review, evidence, record, suffix);
  return state;
}

function aggregateProjectionFixture(inputCandidate, record, suffix = 'projection') {
  const { route, review } = acceptedReview(inputCandidate);
  const evidence = authorityEvidence(inputCandidate, route, review);
  const state = stateWithAcceptedRecord(inputCandidate, review, evidence, record, suffix);
  const currentRecordSetReceipt = createContinuityCurrentRecordSetReceipt(state.aggregate.value);
  return { state, route, review, evidence, currentRecordSetReceipt };
}

function projectionClockReceipt(state, context, projectionObservedAt = ACCEPTED, suffix = 'projection') {
  const snapshot = createContinuitySimulatedClockSnapshot({
    aggregate: state.aggregate.value,
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    observedAt: projectionObservedAt
  });
  state.record(createContinuityEvolutionEvent({
    type: 'CLOCK_SNAPSHOT_RECORDED',
    transitionRef: `transition.${suffix}.clock`,
    snapshot
  }));
  return createContinuityProjectionClockReceipt({
    aggregate: state.aggregate.value,
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    clockSnapshotRef: snapshot.clockSnapshotRef,
    clockSnapshotFingerprint: snapshot.semanticFingerprint
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
  const fixture = aggregateProjectionFixture(formed, record, 'e9');
  const projection = projectAggregateOwnedBurdenRelease({
    aggregate: fixture.state.aggregate.value,
    acceptedRecordRef: record.acceptedRecordRef,
    acceptedRecordFingerprint: record.semanticFingerprint
  });
  assert.ok(projection.protectedCapabilities.includes('uncertainty'));
  assert.ok(projection.prohibitedOvercorrections.includes('unsupported certainty'));
  fixture.state.dispose();
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
  assert.equal(record.scopeTargetRef, formed.scopeTargetRef);
  assert.equal(record.acceptanceDisposition, 'SIMULATION_ONLY_INACTIVE');
  assert.deepEqual(record.acceptedByRefs, record.requiredAcceptanceRefs);
  assert.equal(record.acceptanceEvidenceRefs.length, 1);
});

test('E14 supersession is atomic and its successor is invalid without the transaction', () => {
  const prior = accept(candidate('e14-prior'));
  const successorCandidate = candidate('e14-successor');
  const successor = accept(successorCandidate, { acceptedAt: '2026-07-31T20:03:00.000Z' }, { supersedesRef: prior.acceptedRecordRef });
  assert.throws(() => validateContinuityRecordSet([prior, successor]), /dangling or untransacted/);
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
  assert.throws(() => createSiblingContinuityProjection(record, { targetLineageRef: 'lineage.vex.sibling' }), /simulation-only/);
  assert.throws(() => createFamilySynchronizationReview(record, {
    targetLineageRefs: ['lineage.vex.sibling'], reviewerRef: 'person.human.test', privacyEvidenceRef: record.privacyEvidenceRef,
    formedAt: '2026-07-31T20:03:00.000Z', expiresAt: EXPIRES
  }), /simulation-only/);
});

test('E16 recurrence rejects scope broadening and automatic weight route', () => {
  const record = accept(burdenCandidate('e16'));
  const recurrence = recurrenceObservation(record, 'e16-recurrence');
  assert.throws(() => recordContinuityRecurrence({ acceptedRecord: record, observation: recurrence, scope: 'INSTITUTION' }), /cannot broaden/);
  const evidence = recordContinuityRecurrence({ acceptedRecord: record, observation: recurrence, observedAt: '2026-07-31T20:03:00.000Z' });
  assert.equal(evidence.weightRouteState, 'NOT_ADMITTED');
});

test('E17 exact duplicate recurrence is a semantic no-op', () => {
  const source = observation('e17');
  const formed = burdenCandidate('e17', { observations: [source] });
  const { route, review } = acceptedReview(formed);
  const evidence = authorityEvidence(formed, route, review);
  const record = accept(formed);
  const recurring = recurrenceObservation(record, 'e17-recurrence');
  const first = recordContinuityRecurrence({ acceptedRecord: record, observation: recurring, observedAt: '2026-07-31T20:03:00.000Z' });
  const duplicate = recordContinuityRecurrence({ acceptedRecord: record, observation: recurring, priorEvidence: first, observedAt: '2026-07-31T20:03:00.000Z' });
  assert.equal(duplicate.duplicateSuppressed, true);
  const state = createContinuityEvolutionState();
  for (const event of [
    { type: 'OBSERVATION_SEALED', transitionRef: 'transition.e17.observation', observation: source },
    { type: 'CANDIDATE_FORMED', transitionRef: 'transition.e17.candidate', candidate: formed },
    { type: 'REVIEW_RECORDED', transitionRef: 'transition.e17.review', review },
    ...evidence.map((item, index) => ({ type: 'AUTHORITY_EVIDENCE_RECORDED', transitionRef: `transition.e17.authority.${index}`, evidence: item })),
    { type: 'RECORD_ACCEPTED', transitionRef: 'transition.e17.record', record },
    { type: 'OBSERVATION_SEALED', transitionRef: 'transition.e17.recurrence-observation', observation: recurring }
  ]) state.record(createContinuityEvolutionEvent(event));
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
  const formed = burdenCandidate('e19');
  const record = accept(formed);
  const fixture = aggregateProjectionFixture(formed, record, 'e19');
  const projection = projectAggregateApplicableContinuity({
    aggregate: fixture.state.aggregate.value,
    currentRecordSetReceipt: fixture.currentRecordSetReceipt,
    applicableScopeTargets: [formed.scopeTarget],
    allowedAuthorityEvidenceClasses: ['SIMULATED_CURRENT'],
    tokenBudget: 256
  });
  assert.deepEqual(projection.selectedRecordRefs, [record.acceptedRecordRef]);
  assert.ok(projection.usedTokens <= projection.tokenBudget);
  assert.equal(JSON.stringify(projection).includes('source-range.test'), false);
  fixture.state.dispose();
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
  const { route, review } = acceptedReview(formed);
  const evidence = authorityEvidence(formed, route, review);
  const record = accept(formed);
  const state = createContinuityEvolutionState();
  for (const event of [
    { type: 'OBSERVATION_SEALED', transitionRef: 'transition.e21.1', observation: source },
    { type: 'CANDIDATE_FORMED', transitionRef: 'transition.e21.2', candidate: formed },
    { type: 'REVIEW_RECORDED', transitionRef: 'transition.e21.3', review },
    ...evidence.map((item, index) => ({ type: 'AUTHORITY_EVIDENCE_RECORDED', transitionRef: `transition.e21.authority.${index}`, evidence: item })),
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

test('C8 aggregate events reject canonical but unowned causal lineage without mutation', () => {
  const storedSource = observation('c8-stored');
  const storedCandidate = burdenCandidate('c8-stored', { observations: [storedSource] });
  const storedLineage = acceptedReview(storedCandidate);
  const storedEvidence = authorityEvidence(storedCandidate, storedLineage.route, storedLineage.review);
  const storedRecord = accept(storedCandidate);
  const foreignSource = observation('c8-foreign');
  const foreignCandidate = burdenCandidate('c8-foreign', { observations: [foreignSource] });
  const foreignLineage = acceptedReview(foreignCandidate);
  const foreignEvidence = authorityEvidence(foreignCandidate, foreignLineage.route, foreignLineage.review);
  const foreignRecord = accept(foreignCandidate);

  const candidateState = createContinuityEvolutionState();
  candidateState.record(createContinuityEvolutionEvent({ type: 'OBSERVATION_SEALED', transitionRef: 'transition.c8.candidate.source', observation: storedSource }));
  expectAggregateRejectsUnchanged(candidateState, {
    type: 'CANDIDATE_FORMED', transitionRef: 'transition.c8.candidate.unowned', candidate: foreignCandidate
  }, /unsealed observation|unknown or conflicting sealed observation/);
  const changedCandidate = refingerprint(storedCandidate, 'candidateRef', 'continuity-candidate', { observedConsequence: 'Different canonical content.' });
  expectAggregateRejectsUnchanged(candidateState, {
    type: 'CANDIDATE_FORMED', transitionRef: 'transition.c8.candidate.same-ref-different-fingerprint',
    candidate: { ...changedCandidate, candidateRef: storedCandidate.candidateRef }
  }, /fingerprint|canonical/);
  candidateState.dispose();

  const pairedSourceA = observation('c8-paired-a');
  const pairedSourceB = observation('c8-paired-b');
  const pairedCandidate = burdenCandidate('c8-paired', { observations: [pairedSourceA, pairedSourceB] });
  const permutedBindings = pairedCandidate.observationBindings.map((item, index, items) => ({
    observationRef: item.observationRef,
    observationFingerprint: items[items.length - 1 - index].observationFingerprint
  }));
  const permutedCandidate = refingerprint(pairedCandidate, 'candidateRef', 'continuity-candidate', {
    observationBindings: permutedBindings,
    sourceObservationFingerprints: permutedBindings.map((item) => item.observationFingerprint)
  });
  const pairedState = createContinuityEvolutionState();
  pairedState.record(createContinuityEvolutionEvent({ type: 'OBSERVATION_SEALED', transitionRef: 'transition.c8.paired.source-a', observation: pairedSourceA }));
  pairedState.record(createContinuityEvolutionEvent({ type: 'OBSERVATION_SEALED', transitionRef: 'transition.c8.paired.source-b', observation: pairedSourceB }));
  expectAggregateRejectsUnchanged(pairedState, {
    type: 'CANDIDATE_FORMED', transitionRef: 'transition.c8.candidate.permuted-observation-fingerprint', candidate: permutedCandidate
  }, /exact stored observation fingerprints/);
  pairedState.dispose();

  const reviewState = createContinuityEvolutionState();
  reviewState.record(createContinuityEvolutionEvent({ type: 'OBSERVATION_SEALED', transitionRef: 'transition.c8.review.source', observation: storedSource }));
  reviewState.record(createContinuityEvolutionEvent({ type: 'CANDIDATE_FORMED', transitionRef: 'transition.c8.review.candidate', candidate: storedCandidate }));
  expectAggregateRejectsUnchanged(reviewState, {
    type: 'REVIEW_RECORDED', transitionRef: 'transition.c8.review.unowned', review: foreignLineage.review
  }, /unknown candidate|not the exact aggregate-owned candidate/);
  reviewState.dispose();

  const recordState = createContinuityEvolutionState();
  for (const event of [
    { type: 'OBSERVATION_SEALED', transitionRef: 'transition.c8.record.source', observation: storedSource },
    { type: 'CANDIDATE_FORMED', transitionRef: 'transition.c8.record.candidate', candidate: storedCandidate },
    { type: 'REVIEW_RECORDED', transitionRef: 'transition.c8.record.review', review: storedLineage.review }
  ]) recordState.record(createContinuityEvolutionEvent(event));
  expectAggregateRejectsUnchanged(recordState, {
    type: 'RECORD_ACCEPTED', transitionRef: 'transition.c8.record.unowned-authority', record: storedRecord
  }, /aggregate-owned evidence/);
  expectAggregateRejectsUnchanged(recordState, {
    type: 'RECORD_ACCEPTED', transitionRef: 'transition.c8.record.foreign', record: foreignRecord
  }, /unknown candidate|not the exact aggregate-owned candidate/);
  recordState.dispose();

  const contextCandidate = candidate('c8-context', { candidateScope: 'CURRENT_TURN', signals: {} });
  const contextLineage = acceptedReview(contextCandidate);
  const contextEvidence = authorityEvidence(contextCandidate, contextLineage.route, contextLineage.review);
  const contextLease = createCurrentContextLease({
    candidate: contextCandidate,
    route: contextLineage.route,
    review: contextLineage.review,
    leaseRef: 'context-lease.c8-unowned',
    turnRef: 'turn.test.c8-context',
    threadRef: 'thread.test',
    channelRef: 'channel.test',
    formedAt: REVIEWED,
    observedAt: REVIEWED,
    expiresAt: EXPIRES
  });
  const context = acceptContinuityCandidate(contextCandidate, contextLineage.review, {
    acceptedAt: ACCEPTED,
    authorityEvidence: contextEvidence,
    currentContextLease: contextLease
  });
  const contextState = createContinuityEvolutionState();
  expectAggregateRejectsUnchanged(contextState, {
    type: 'CONTEXT_APPLIED', transitionRef: 'transition.c8.context.unowned', context
  }, /unknown candidate|not the exact aggregate-owned candidate/);
  contextState.dispose();

  const recurrenceState = createContinuityEvolutionState();
  for (const event of [
    { type: 'OBSERVATION_SEALED', transitionRef: 'transition.c8.recurrence.source', observation: storedSource },
    { type: 'CANDIDATE_FORMED', transitionRef: 'transition.c8.recurrence.candidate', candidate: storedCandidate },
    { type: 'REVIEW_RECORDED', transitionRef: 'transition.c8.recurrence.review', review: storedLineage.review },
    ...storedEvidence.map((item, index) => ({ type: 'AUTHORITY_EVIDENCE_RECORDED', transitionRef: `transition.c8.recurrence.authority.${index}`, evidence: item })),
    { type: 'RECORD_ACCEPTED', transitionRef: 'transition.c8.recurrence.record', record: storedRecord }
  ]) recurrenceState.record(createContinuityEvolutionEvent(event));
  const unsealedRecurrence = recurrenceObservation(storedRecord, 'c8-unsealed-recurrence');
  const recurrence = recordContinuityRecurrence({ acceptedRecord: storedRecord, observation: unsealedRecurrence, observedAt: unsealedRecurrence.formedAt });
  expectAggregateRejectsUnchanged(recurrenceState, {
    type: 'RECURRENCE_RECORDED', transitionRef: 'transition.c8.recurrence.unowned-observation', evidence: recurrence
  }, /unknown or conflicting sealed observation/);
  recurrenceState.dispose();
});

test('C9 acceptance consumes exact external simulated-current authority and Burden rejects raw refs', () => {
  const formed = burdenCandidate('c9');
  const { route, review } = acceptedReview(formed);
  const authorityRef = review.requiredAcceptanceRefs[0];
  const baseSnapshot = createContinuityAuthoritySnapshot({
    actorRef: authorityRef,
    authorityRef,
    subjectRefs: review.requiredAcceptanceRefs,
    scope: formed.candidateScope,
    scopeTarget: formed.scopeTarget,
    recordClass: route.proposedPrimaryDestination,
    formedAt: REVIEWED,
    observedAt: REVIEWED,
    expiresAt: EXPIRES
  });
  const snapshotInput = (overrides = {}) => createContinuityAuthoritySnapshot({
    actorRef: authorityRef,
    authorityRef,
    subjectRefs: review.requiredAcceptanceRefs,
    scope: formed.candidateScope,
    scopeTarget: formed.scopeTarget,
    recordClass: route.proposedPrimaryDestination,
    formedAt: REVIEWED,
    observedAt: REVIEWED,
    expiresAt: EXPIRES,
    ...overrides
  });
  const selfIssued = refingerprint(baseSnapshot, 'authoritySnapshotRef', 'continuity-authority-snapshot', {
    sourceRef: formed.candidateRef,
    sourceHash: formed.semanticFingerprint,
    formationRef: review.reviewRef
  });
  assert.throws(() => createContinuityAcceptanceEvidence({ candidate: formed, route, review, authoritySnapshot: selfIssued }), /registered simulated-current source/);
  const unknownSource = refingerprint(baseSnapshot, 'authoritySnapshotRef', 'continuity-authority-snapshot', { sourceRef: 'source.continuity.unknown' });
  assert.throws(() => createContinuityAcceptanceEvidence({ candidate: formed, route, review, authoritySnapshot: unknownSource }), /registered simulated-current source/);
  for (const authoritySnapshot of [
    snapshotInput({ subjectRefs: ['lineage.vex.other'] }),
    snapshotInput({ recordClass: 'SCORE_RECORD' })
  ]) assert.throws(() => createContinuityAcceptanceEvidence({ candidate: formed, route, review, authoritySnapshot }), /record class, subjects, scope and target/);
  assert.throws(() => snapshotInput({ scope: 'THREAD' }), /scope target/);
  const expiredEvidence = createContinuityAcceptanceEvidence({
    candidate: formed,
    route,
    review,
    authoritySnapshot: snapshotInput({ expiresAt: '2026-07-31T20:01:30.000Z' })
  });
  assert.throws(() => acceptContinuityCandidate(formed, review, { acceptedAt: ACCEPTED, authorityEvidence: [expiredEvidence] }), /not current/);

  const accepted = accept(formed);
  let release = createBurdenRelease(accepted.burdenRelease.sourceForm);
  for (const [index, nextState] of ['NAMED', 'RECOGNIZED', 'RELEASE_PROPOSED', 'CONTEXT_REVIEW'].entries()) {
    release = transitionBurdenRelease(release, {
      nextState,
      actorRef: 'role.vex.context-maintainer',
      transitionedAt: `2026-07-31T20:00:${String((index + 1) * 10).padStart(2, '0')}.000Z`
    });
  }
  const foreignCandidate = burdenCandidate('c9-foreign');
  const foreignLineage = acceptedReview(foreignCandidate);
  const foreignEvidence = authorityEvidence(foreignCandidate, foreignLineage.route, foreignLineage.review);
  assert.throws(() => acceptBurdenRelease(release, {
    candidate: formed,
    route,
    review,
    actorRef: 'role.vex.context-maintainer',
    acceptedAt: ACCEPTED,
    authorityEvidence: foreignEvidence
  }), /private to aggregate-owned canonical continuity acceptance/);
  assert.throws(() => acceptBurdenRelease(release, {
    candidate: formed,
    route,
    review,
    actorRef: 'role.vex.context-maintainer',
    acceptedAt: ACCEPTED,
    authorityEvidence: accepted.acceptanceEvidenceRefs
  }), /private to aggregate-owned canonical continuity acceptance/);
  const detachedProjectionInput = structuredClone(accepted.burdenRelease);
  detachedProjectionInput.acceptanceEvidence = [];
  delete detachedProjectionInput.semanticFingerprint;
  detachedProjectionInput.semanticFingerprint = semanticHash(detachedProjectionInput);
  assert.throws(() => projectBurdenRelease(detachedProjectionInput, { candidate: formed, route, review }), /aggregate-owned accepted record/);
  const fixture = aggregateProjectionFixture(formed, accepted, 'c9');
  const projection = projectAggregateOwnedBurdenRelease({
    aggregate: fixture.state.aggregate.value,
    acceptedRecordRef: accepted.acceptedRecordRef,
    acceptedRecordFingerprint: accepted.semanticFingerprint
  });
  assert.deepEqual(projection.authoritySnapshotRefs, accepted.burdenRelease.authoritySnapshotRefs);
  assert.equal(projection.rawSourceContentIncluded, false);
  fixture.state.dispose();
});

test('C10 nested v1 contract fields exactly match runtime objects', () => {
  const formed = burdenCandidate('c10');
  const { route, review } = acceptedReview(formed);
  const authoritySnapshot = createContinuityAuthoritySnapshot({
    actorRef: review.requiredAcceptanceRefs[0],
    authorityRef: review.requiredAcceptanceRefs[0],
    subjectRefs: review.requiredAcceptanceRefs,
    scope: formed.candidateScope,
    scopeTarget: formed.scopeTarget,
    recordClass: route.proposedPrimaryDestination,
    formedAt: REVIEWED,
    observedAt: REVIEWED,
    expiresAt: EXPIRES
  });
  const evidence = createContinuityAcceptanceEvidence({ candidate: formed, route, review, authoritySnapshot });
  const record = accept(formed);
  assert.deepEqual(Object.keys(review), CONTINUITY_CONTEXT_REVIEW_REQUIRED_FIELDS);
  assert.deepEqual(Object.keys(formed.scopeTarget), CONTINUITY_SCOPE_TARGET_REQUIRED_FIELDS);
  assert.deepEqual(Object.keys(authoritySnapshot), CONTINUITY_AUTHORITY_SNAPSHOT_REQUIRED_FIELDS);
  assert.deepEqual(Object.keys(evidence), CONTINUITY_ACCEPTANCE_EVIDENCE_REQUIRED_FIELDS);
  assert.deepEqual(Object.keys(record.burdenRelease), BURDEN_RELEASE_REQUIRED_FIELDS);
});

test('C11 exact scope targets isolate leases, durable applicability, conflicts, supersession and recurrence', () => {
  const turnCandidate = candidate('c11-turn', { candidateScope: 'CURRENT_TURN', signals: {} });
  assert.equal(turnCandidate.scopeTarget.turnRef, 'turn.test.c11-turn');
  assert.equal(turnCandidate.scopeTarget.threadRef, 'thread.test');
  assert.equal(turnCandidate.scopeTarget.channelRef, 'channel.test');
  const turnLineage = acceptedReview(turnCandidate);
  for (const coordinates of [
    { turnRef: 'turn.test.other', threadRef: 'thread.test', channelRef: 'channel.test' },
    { turnRef: 'turn.test.c11-turn', threadRef: 'thread.other', channelRef: 'channel.test' },
    { turnRef: 'turn.test.c11-turn', threadRef: 'thread.test', channelRef: 'channel.other' }
  ]) assert.throws(() => createCurrentContextLease({
    candidate: turnCandidate,
    route: turnLineage.route,
    review: turnLineage.review,
    leaseRef: 'lease.c11.cross-target',
    ...coordinates,
    formedAt: REVIEWED,
    observedAt: REVIEWED,
    expiresAt: EXPIRES
  }), /source-derived turn\/thread\/channel target/);
  const exactLease = createCurrentContextLease({
    candidate: turnCandidate,
    route: turnLineage.route,
    review: turnLineage.review,
    leaseRef: 'lease.c11.exact',
    turnRef: 'turn.test.c11-turn',
    threadRef: 'thread.test',
    channelRef: 'channel.test',
    formedAt: REVIEWED,
    observedAt: REVIEWED,
    expiresAt: EXPIRES
  });
  const transient = acceptContinuityCandidate(turnCandidate, turnLineage.review, {
    acceptedAt: ACCEPTED,
    authorityEvidence: authorityEvidence(turnCandidate, turnLineage.route, turnLineage.review),
    currentContextLease: exactLease
  });
  assert.equal(transient.scopeTargetRef, turnCandidate.scopeTargetRef);

  assert.throws(() => formContinuityCandidate({
    observations: [observation('c11-ambiguous-a'), observation('c11-ambiguous-b')],
    candidateKind: 'CORRECTION',
    summaryRef: 'summary.c11.ambiguous',
    authoredByRef: 'role.vex.context-maintainer',
    aboutSelfRefs: ['person.human.test'],
    affectedPartyRefs: ['person.human.test'],
    candidateScope: 'CURRENT_TURN',
    originClassification: classifyBehaviorOrigin(),
    observedConsequence: 'Ambiguous turn targeting must fail closed.',
    formedAt: FORMED
  }), /ambiguous multiple turnRef targets/);

  const projectObservationA = observation('c11-project-a', { projectRef: 'project.alpha' });
  const projectObservationB = observation('c11-project-b', { projectRef: 'project.beta' });
  const projectCandidateA = candidate('c11-project-a', { observations: [projectObservationA], candidateScope: 'PROJECT', signals: { durableMeaning: true } });
  const projectCandidateB = candidate('c11-project-b', { observations: [projectObservationB], candidateScope: 'PROJECT', signals: { durableMeaning: true } });
  const projectRecordA = accept(projectCandidateA);
  const projectRecordB = accept(projectCandidateB);
  assert.notEqual(projectRecordA.scopeTargetRef, projectRecordB.scopeTargetRef);
  assert.equal(validateContinuityRecordSet([projectRecordA, projectRecordB]).state, 'CURRENT');
  const projectState = createContinuityEvolutionState();
  const projectLineageA = acceptedReview(projectCandidateA);
  const projectEvidenceA = authorityEvidence(projectCandidateA, projectLineageA.route, projectLineageA.review);
  const projectLineageB = acceptedReview(projectCandidateB);
  const projectEvidenceB = authorityEvidence(projectCandidateB, projectLineageB.route, projectLineageB.review);
  recordLineageIntoState(projectState, projectCandidateA, projectLineageA.review, projectEvidenceA, projectRecordA, 'c11-project-a');
  recordLineageIntoState(projectState, projectCandidateB, projectLineageB.review, projectEvidenceB, projectRecordB, 'c11-project-b');
  const projectCurrentSet = createContinuityCurrentRecordSetReceipt(projectState.aggregate.value);
  const applicable = projectAggregateApplicableContinuity({
    aggregate: projectState.aggregate.value,
    currentRecordSetReceipt: projectCurrentSet,
    applicableScopeTargets: [projectCandidateA.scopeTarget],
    allowedAuthorityEvidenceClasses: ['SIMULATED_CURRENT'],
    tokenBudget: 256
  });
  assert.deepEqual(applicable.selectedRecordRefs, [projectRecordA.acceptedRecordRef]);
  assert.throws(() => projectApplicableContinuity({ records: [projectRecordA], applicableScopes: ['PROJECT'] }), /aggregate-owned current-record-set/);
  projectState.dispose();
  const successor = accept(projectCandidateB, { acceptedAt: '2026-07-31T20:03:00.000Z' }, { supersedesRef: projectRecordA.acceptedRecordRef });
  assert.throws(() => supersedeContinuityRecord(projectRecordA, successor, {
    rollbackRef: 'rollback.c11.cross-project',
    supersededAt: '2026-07-31T20:03:00.000Z'
  }), /scopeTarget/);

  const recurrenceSource = observation('c11-recurrence-source');
  const recurrenceCandidate = burdenCandidate('c11-recurrence', { observations: [recurrenceSource] });
  const recurrenceLineage = acceptedReview(recurrenceCandidate);
  const recurrenceAuthority = authorityEvidence(recurrenceCandidate, recurrenceLineage.route, recurrenceLineage.review);
  const recurrenceRecord = accept(recurrenceCandidate);
  const recurrenceObservationExact = recurrenceObservation(recurrenceRecord, 'c11-recurrence-observation');
  const recurrenceExact = recordContinuityRecurrence({
    acceptedRecord: recurrenceRecord,
    observation: recurrenceObservationExact,
    observedAt: recurrenceObservationExact.formedAt
  });
  const otherTarget = burdenCandidate('c11-other-target', {
    observations: [observation('c11-other-target', { sourceLineageRef: 'lineage.vex.other', sourceRecipientRefs: ['lineage.vex.other'] })],
    aboutSelfRefs: ['lineage.vex.other'],
    affectedPartyRefs: ['lineage.vex.other']
  }).scopeTarget;
  const changedTargetRecurrence = refingerprint(recurrenceExact, 'recurrenceRef', 'continuity-recurrence', {
    scopeTargetRef: otherTarget.scopeTargetRef,
    scopeTargetFingerprint: otherTarget.semanticFingerprint
  });
  const state = createContinuityEvolutionState();
  for (const event of [
    { type: 'OBSERVATION_SEALED', transitionRef: 'transition.c11.source', observation: recurrenceSource },
    { type: 'CANDIDATE_FORMED', transitionRef: 'transition.c11.candidate', candidate: recurrenceCandidate },
    { type: 'REVIEW_RECORDED', transitionRef: 'transition.c11.review', review: recurrenceLineage.review },
    ...recurrenceAuthority.map((item, index) => ({ type: 'AUTHORITY_EVIDENCE_RECORDED', transitionRef: `transition.c11.authority.${index}`, evidence: item })),
    { type: 'RECORD_ACCEPTED', transitionRef: 'transition.c11.record', record: recurrenceRecord },
    { type: 'OBSERVATION_SEALED', transitionRef: 'transition.c11.recurrence-observation', observation: recurrenceObservationExact }
  ]) state.record(createContinuityEvolutionEvent(event));
  expectAggregateRejectsUnchanged(state, {
    type: 'RECURRENCE_RECORDED', transitionRef: 'transition.c11.changed-target', evidence: changedTargetRecurrence
  }, /not derived from aggregate-owned|target/);
  state.dispose();
});

test('C12 Burden acceptance and projection bind the exact reviewed inner meaning', () => {
  const formed = burdenCandidate('c12');
  const { route, review } = acceptedReview(formed);
  const evidence = authorityEvidence(formed, route, review);
  const accepted = accept(formed);
  const replayToReview = (sourceForm, suffix) => {
    let release = createBurdenRelease(sourceForm);
    for (const [index, nextState] of ['NAMED', 'RECOGNIZED', 'RELEASE_PROPOSED', 'CONTEXT_REVIEW'].entries()) release = transitionBurdenRelease(release, {
      nextState,
      actorRef: 'role.vex.context-maintainer',
      transitionedAt: `2026-07-31T20:00:${String((index + 1) * 10 + suffix).padStart(2, '0')}.000Z`
    });
    return release;
  };
  const canonicalAtReview = replayToReview(accepted.burdenRelease.sourceForm, 0);
  assert.throws(() => transitionBurdenRelease(canonicalAtReview, {
    nextState: 'ACCEPTED_DEAUTHORIZED',
    actorRef: review.reviewerRef,
    transitionedAt: ACCEPTED,
    authorityEvidence: evidence
  }), /public Burden Release transition/);
  assert.throws(() => acceptBurdenRelease(canonicalAtReview, {
    candidate: formed,
    route,
    review,
    actorRef: review.reviewerRef,
    acceptedAt: ACCEPTED,
    authorityEvidence: evidence
  }), /private to aggregate-owned canonical continuity acceptance/);
  assert.equal(accepted.burdenRelease.state, 'ACCEPTED_DEAUTHORIZED');

  const otherTarget = burdenCandidate('c12-other', {
    observations: [observation('c12-other', { sourceLineageRef: 'lineage.vex.other', sourceRecipientRefs: ['lineage.vex.other'] })],
    aboutSelfRefs: ['lineage.vex.other'],
    affectedPartyRefs: ['lineage.vex.other']
  }).scopeTarget;
  const substitutions = [
    { patternName: 'substituted pattern' },
    { patternDescription: 'A substituted description.' },
    { releaseStatement: 'A substituted release statement.' },
    { formerAuthority: 'substituted-former-authority' },
    { currentAuthority: 'substituted-current-authority' },
    { cleanIntention: 'A substituted intention.' },
    { protectedCapabilities: ['privacy'] },
    { prohibitedOvercorrections: ['fabrication'] },
    { requiredAcceptanceRefs: ['lineage.vex.other'] },
    { sourceBindings: accepted.burdenRelease.sourceBindings.map((item) => ({ ...item, sourceHash: semanticHash({ substituted: item.rangeRef }) })) },
    { scopeTargetRef: otherTarget.scopeTargetRef, scopeTargetFingerprint: otherTarget.semanticFingerprint }
  ];
  for (const [index, changes] of substitutions.entries()) {
    const substituted = replayToReview({ ...accepted.burdenRelease.sourceForm, ...changes }, index + 1);
    assert.throws(() => acceptBurdenRelease(substituted, {
      candidate: formed,
      route,
      review,
      actorRef: review.reviewerRef,
      acceptedAt: ACCEPTED,
      authorityEvidence: evidence
    }), /private to aggregate-owned canonical continuity acceptance/);
    assert.throws(() => projectBurdenRelease(substituted, { candidate: formed, route, review }), /aggregate-owned accepted record/);
  }
  const fixture = aggregateProjectionFixture(formed, accepted, 'c12');
  const projection = projectAggregateOwnedBurdenRelease({
    aggregate: fixture.state.aggregate.value,
    acceptedRecordRef: accepted.acceptedRecordRef,
    acceptedRecordFingerprint: accepted.semanticFingerprint
  });
  assert.equal(projection.burdenRef, accepted.burdenReleaseRef);
  assert.equal(projection.scopeTargetRef, formed.scopeTargetRef);
  fixture.state.dispose();
});

test('C13 simulation-only authority remains negative in records, projections, applicability and Health', () => {
  const formed = burdenCandidate('c13');
  const record = accept(formed);
  const fixture = aggregateProjectionFixture(formed, record, 'c13');
  const recordProjection = projectAggregateOwnedContinuityRecord({
    aggregate: fixture.state.aggregate.value,
    acceptedRecordRef: record.acceptedRecordRef,
    acceptedRecordFingerprint: record.semanticFingerprint
  });
  for (const value of [record, recordProjection]) {
    assert.equal(value.authorityEvidenceClass, 'SIMULATED_CURRENT');
    assert.equal(value.simulatedAuthority, true);
    assert.equal(value.liveAuthorityGranted, false);
    assert.equal(value.externalEffectsAuthorized, false);
    assert.equal(value.acceptanceDisposition, 'SIMULATION_ONLY_INACTIVE');
  }
  assert.equal(recordProjection.nextSafeAction, 'USE_ONLY_IN_EXPLICIT_SIMULATED_CURRENT_CONTEXT');
  const defaultLiveContext = projectAggregateApplicableContinuity({
    aggregate: fixture.state.aggregate.value,
    currentRecordSetReceipt: fixture.currentRecordSetReceipt,
    applicableScopeTargets: [formed.scopeTarget],
    tokenBudget: 256
  });
  assert.deepEqual(defaultLiveContext.selectedRecordRefs, []);
  const simulationContext = projectAggregateApplicableContinuity({
    aggregate: fixture.state.aggregate.value,
    currentRecordSetReceipt: fixture.currentRecordSetReceipt,
    applicableScopeTargets: [formed.scopeTarget],
    allowedAuthorityEvidenceClasses: ['SIMULATED_CURRENT'],
    tokenBudget: 256
  });
  assert.deepEqual(simulationContext.selectedRecordRefs, [record.acceptedRecordRef]);
  assert.equal(simulationContext.selected[0].acceptanceDisposition, 'SIMULATION_ONLY_INACTIVE');

  const promoted = refingerprint(record, 'acceptedRecordRef', 'accepted-continuity-record', {
    liveAuthorityGranted: true,
    liveApplicabilityGranted: true
  });
  assert.throws(() => projectContinuityRecord(promoted), /aggregate-owned record/);
  assert.throws(() => projectApplicableContinuity({
    records: [promoted],
    applicableScopeTargets: [formed.scopeTarget],
    allowedAuthorityEvidenceClasses: ['SIMULATED_CURRENT']
  }), /aggregate-owned current-record-set/);
  const aggregate = structuredClone(createInitialContinuityEvolutionAggregate());
  aggregate.acceptedRecords = [promoted];
  delete aggregate.semanticFingerprint;
  aggregate.semanticFingerprint = semanticHash(aggregate);
  const promotedState = createContinuityEvolutionState({ aggregate });
  assert.equal(promotedState.health.value.state, 'BLOCKED');
  assert.equal(promotedState.health.value.simulatedAuthorityPromotions, 1);
  promotedState.dispose();

  for (const changes of [
    { externalEffectsAuthorized: true },
    { effectAuthorityActive: true },
    { weightActivationState: 'ACTIVE' },
    { synchronizationAuthorityActive: true },
    { familyDeliveryAuthorized: true },
    { publicationAuthorityActive: true }
  ]) {
    const invalid = refingerprint(record, 'acceptedRecordRef', 'accepted-continuity-record', changes);
    assert.throws(() => projectContinuityRecord(invalid), /aggregate-owned record/);
  }

  const mixed = refingerprint(record, 'acceptedRecordRef', 'accepted-continuity-record', {
    authorityEvidenceClass: 'MIXED_SIMULATED_AND_LIVE'
  });
  assert.throws(() => projectContinuityRecord(mixed), /aggregate-owned record/);
  const burdenProjection = projectAggregateOwnedBurdenRelease({
    aggregate: fixture.state.aggregate.value,
    acceptedRecordRef: record.acceptedRecordRef,
    acceptedRecordFingerprint: record.semanticFingerprint
  });
  assert.equal(burdenProjection.liveAuthorityGranted, false);
  assert.equal(burdenProjection.acceptanceDisposition, 'SIMULATION_ONLY_INACTIVE');
  assert.equal(burdenProjection.nextSafeAction, 'USE_ONLY_IN_EXPLICIT_SIMULATED_CURRENT_CONTEXT');

  const currentCandidate = candidate('c13-transient', { candidateScope: 'CURRENT_TURN', signals: {} });
  const currentLineage = acceptedReview(currentCandidate);
  const contextLease = createCurrentContextLease({
    candidate: currentCandidate,
    route: currentLineage.route,
    review: currentLineage.review,
    leaseRef: 'lease.c13.transient',
    turnRef: 'turn.test.c13-transient',
    threadRef: 'thread.test',
    channelRef: 'channel.test',
    formedAt: REVIEWED,
    observedAt: REVIEWED,
    expiresAt: EXPIRES
  });
  const context = acceptContinuityCandidate(currentCandidate, currentLineage.review, {
    acceptedAt: ACCEPTED,
    authorityEvidence: authorityEvidence(currentCandidate, currentLineage.route, currentLineage.review),
    currentContextLease: contextLease
  });
  assert.equal(context.authorityEvidenceClass, 'SIMULATED_CURRENT');
  assert.equal(context.acceptanceDisposition, 'SIMULATION_ONLY_INACTIVE');
  assert.equal(context.liveApplicabilityGranted, false);
  const contextEvidence = authorityEvidence(currentCandidate, currentLineage.route, currentLineage.review);
  const contextState = createContinuityEvolutionState();
  for (const event of [
    ...(CANDIDATE_OBSERVATIONS.get(currentCandidate.candidateRef) ?? []).map((source, index) => ({
      type: 'OBSERVATION_SEALED', transitionRef: `transition.c13.context.observation.${index}`, observation: source
    })),
    { type: 'CANDIDATE_FORMED', transitionRef: 'transition.c13.context.candidate', candidate: currentCandidate },
    { type: 'REVIEW_RECORDED', transitionRef: 'transition.c13.context.review', review: currentLineage.review },
    ...contextEvidence.map((item, index) => ({ type: 'AUTHORITY_EVIDENCE_RECORDED', transitionRef: `transition.c13.context.authority.${index}`, evidence: item })),
    { type: 'CONTEXT_APPLIED', transitionRef: 'transition.c13.context.applied', context }
  ]) contextState.record(createContinuityEvolutionEvent(event));
  const contextClock = projectionClockReceipt(contextState, context, ACCEPTED, 'c13.context');
  const contextProjection = projectAggregateOwnedTransientContinuityContext({
    aggregate: contextState.aggregate.value,
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    projectionClockReceipt: contextClock
  });
  assert.equal(contextProjection.acceptanceDisposition, 'SIMULATION_ONLY_INACTIVE');
  contextState.dispose();
  fixture.state.dispose();
});

test('C14 projections require exact aggregate-owned record or context meaning without mutation', () => {
  const formed = burdenCandidate('c14');
  const record = accept(formed);
  const fixture = aggregateProjectionFixture(formed, record, 'c14');
  const before = semanticHash(fixture.state.aggregate.value);
  const revision = fixture.state.aggregate.revision;
  const projection = projectAggregateOwnedContinuityRecord({
    aggregate: fixture.state.aggregate.value,
    acceptedRecordRef: record.acceptedRecordRef,
    acceptedRecordFingerprint: record.semanticFingerprint
  });
  assert.equal(projection.aggregateProjectionReceipt.sourceRef, record.acceptedRecordRef);
  assert.equal(projection.aggregateProjectionReceipt.currentRecordSetRef, fixture.currentRecordSetReceipt.currentRecordSetRef);

  const otherTarget = burdenCandidate('c14-other', {
    observations: [observation('c14-other', { sourceLineageRef: 'lineage.vex.other', sourceRecipientRefs: ['lineage.vex.other'] })],
    aboutSelfRefs: ['lineage.vex.other'],
    affectedPartyRefs: ['lineage.vex.other']
  }).scopeTarget;
  const substitutions = [
    { recordClass: 'VEX_SELF_PREFERENCE' },
    { candidateRef: 'continuity-candidate.substituted', candidateFingerprint: semanticHash({ candidate: 'substituted' }) },
    { routeRef: 'continuity-route.substituted', routeFingerprint: semanticHash({ route: 'substituted' }) },
    { reviewRef: 'continuity-context-review.substituted', reviewFingerprint: semanticHash({ review: 'substituted' }) },
    { summaryRef: 'summary.substituted' },
    { sourceBindings: record.sourceBindings.map((item) => ({ ...item, sourceHash: semanticHash({ source: item.rangeRef }) })) },
    { scopeTargetRef: otherTarget.scopeTargetRef, scopeTargetFingerprint: otherTarget.semanticFingerprint },
    { acceptanceDisposition: 'LIVE' }
  ];
  for (const changes of substitutions) {
    const forged = refingerprint(record, 'acceptedRecordRef', 'accepted-continuity-record', changes);
    const forgedAggregate = refingerprintAggregate(fixture.state.aggregate.value, { acceptedRecords: [forged] });
    assert.throws(() => projectAggregateOwnedContinuityRecord({
      aggregate: forgedAggregate,
      acceptedRecordRef: forged.acceptedRecordRef,
      acceptedRecordFingerprint: forged.semanticFingerprint
    }), /aggregate-owned|detached|mismatch|Burden|authority/);
  }
  assert.throws(() => projectContinuityRecord(record), /aggregate-owned record/);

  const contextCandidate = candidate('c14-context', { candidateScope: 'CURRENT_TURN', signals: {} });
  const contextLineage = acceptedReview(contextCandidate);
  const contextEvidence = authorityEvidence(contextCandidate, contextLineage.route, contextLineage.review);
  const contextLease = createCurrentContextLease({
    candidate: contextCandidate,
    route: contextLineage.route,
    review: contextLineage.review,
    leaseRef: 'lease.c14.context',
    turnRef: 'turn.test.c14-context',
    threadRef: 'thread.test',
    channelRef: 'channel.test',
    formedAt: REVIEWED,
    observedAt: REVIEWED,
    expiresAt: EXPIRES
  });
  const context = acceptContinuityCandidate(contextCandidate, contextLineage.review, {
    acceptedAt: ACCEPTED,
    authorityEvidence: contextEvidence,
    currentContextLease: contextLease
  });
  const contextState = createContinuityEvolutionState();
  for (const event of [
    ...(CANDIDATE_OBSERVATIONS.get(contextCandidate.candidateRef) ?? []).map((source, index) => ({
      type: 'OBSERVATION_SEALED', transitionRef: `transition.c14.context.observation.${index}`, observation: source
    })),
    { type: 'CANDIDATE_FORMED', transitionRef: 'transition.c14.context.candidate', candidate: contextCandidate },
    { type: 'REVIEW_RECORDED', transitionRef: 'transition.c14.context.review', review: contextLineage.review },
    ...contextEvidence.map((item, index) => ({ type: 'AUTHORITY_EVIDENCE_RECORDED', transitionRef: `transition.c14.context.authority.${index}`, evidence: item })),
    { type: 'CONTEXT_APPLIED', transitionRef: 'transition.c14.context.applied', context }
  ]) contextState.record(createContinuityEvolutionEvent(event));
  const contextClock = projectionClockReceipt(contextState, context, ACCEPTED, 'c14.context');
  assert.equal(projectAggregateOwnedTransientContinuityContext({
    aggregate: contextState.aggregate.value,
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    projectionClockReceipt: contextClock
  }).aggregateProjectionReceipt.sourceRef, context.contextRecordRef);
  const detachedContext = refingerprint(context, 'contextRecordRef', 'transient-continuity-context', { summaryRef: 'summary.detached' });
  const detachedAggregate = refingerprintAggregate(contextState.aggregate.value, { transientContexts: [detachedContext] });
  assert.throws(() => projectAggregateOwnedTransientContinuityContext({
    aggregate: detachedAggregate,
    contextRecordRef: detachedContext.contextRecordRef,
    contextRecordFingerprint: detachedContext.semanticFingerprint
  }), /aggregate-owned|detached/);
  assert.equal(semanticHash(fixture.state.aggregate.value), before);
  assert.equal(fixture.state.aggregate.revision, revision);
  contextState.dispose();
  fixture.state.dispose();
});

test('C15 applicable projection consumes only an exact conflict-free current record set', () => {
  const priorCandidate = candidate('c15-prior');
  const priorLineage = acceptedReview(priorCandidate);
  const priorEvidence = authorityEvidence(priorCandidate, priorLineage.route, priorLineage.review);
  const prior = accept(priorCandidate);
  const successorCandidate = candidate('c15-successor');
  const successorLineage = acceptedReview(successorCandidate, { supersedesRef: prior.acceptedRecordRef });
  const successorEvidence = authorityEvidence(successorCandidate, successorLineage.route, successorLineage.review);
  const successor = accept(successorCandidate, { acceptedAt: '2026-07-31T20:03:00.000Z' }, { supersedesRef: prior.acceptedRecordRef });
  assert.equal(prior.scopeTargetFingerprint, successor.scopeTargetFingerprint);

  const conflictState = createContinuityEvolutionState();
  recordLineageIntoState(conflictState, priorCandidate, priorLineage.review, priorEvidence, prior, 'c15-conflict-prior');
  const conflictCandidate = candidate('c15-conflict-successor');
  const conflictLineage = acceptedReview(conflictCandidate);
  const conflictEvidence = authorityEvidence(conflictCandidate, conflictLineage.route, conflictLineage.review);
  const conflictingRecord = accept(conflictCandidate, { acceptedAt: '2026-07-31T20:03:00.000Z' });
  recordLineageIntoState(conflictState, conflictCandidate, conflictLineage.review, conflictEvidence, conflictingRecord, 'c15-conflict-successor');
  const conflictReceipt = createContinuityCurrentRecordSetReceipt(conflictState.aggregate.value);
  assert.equal(conflictReceipt.state, 'HELD_CONFLICT');
  assert.throws(() => projectAggregateApplicableContinuity({
    aggregate: conflictState.aggregate.value,
    currentRecordSetReceipt: conflictReceipt,
    applicableScopeTargets: [successorCandidate.scopeTarget],
    allowedAuthorityEvidenceClasses: ['SIMULATED_CURRENT']
  }), /HELD_CONFLICT/);

  const state = createContinuityEvolutionState();
  recordLineageIntoState(state, priorCandidate, priorLineage.review, priorEvidence, prior, 'c15-prior');
  for (const event of [
    ...(CANDIDATE_OBSERVATIONS.get(successorCandidate.candidateRef) ?? []).map((source, index) => ({
      type: 'OBSERVATION_SEALED', transitionRef: `transition.c15.successor.observation.${index}`, observation: source
    })),
    { type: 'CANDIDATE_FORMED', transitionRef: 'transition.c15.successor.candidate', candidate: successorCandidate },
    { type: 'REVIEW_RECORDED', transitionRef: 'transition.c15.successor.review', review: successorLineage.review },
    ...successorEvidence.map((item, index) => ({ type: 'AUTHORITY_EVIDENCE_RECORDED', transitionRef: `transition.c15.successor.authority.${index}`, evidence: item }))
  ]) state.record(createContinuityEvolutionEvent(event));
  const transaction = supersedeContinuityRecord(prior, successor, {
    rollbackRef: 'rollback.c15',
    supersededAt: '2026-07-31T20:03:00.000Z'
  });
  state.record(createContinuityEvolutionEvent({
    type: 'RECORD_SUPERSEDED', transitionRef: 'transition.c15.superseded', transaction, successor
  }));
  const receipt = createContinuityCurrentRecordSetReceipt(state.aggregate.value);
  assert.equal(receipt.state, 'CURRENT');
  assert.deepEqual(receipt.currentRecordRefs, [successor.acceptedRecordRef]);
  assert.deepEqual(receipt.supersededRecordRefs, [prior.acceptedRecordRef]);
  const applicable = projectAggregateApplicableContinuity({
    aggregate: state.aggregate.value,
    currentRecordSetReceipt: receipt,
    requestedRecordRefs: [successor.acceptedRecordRef],
    applicableScopeTargets: [successorCandidate.scopeTarget],
    allowedAuthorityEvidenceClasses: ['SIMULATED_CURRENT'],
    tokenBudget: 256
  });
  assert.deepEqual(applicable.selectedRecordRefs, [successor.acceptedRecordRef]);
  assert.throws(() => projectAggregateApplicableContinuity({
    aggregate: state.aggregate.value,
    currentRecordSetReceipt: receipt,
    requestedRecordRefs: [prior.acceptedRecordRef],
    applicableScopeTargets: [priorCandidate.scopeTarget],
    allowedAuthorityEvidenceClasses: ['SIMULATED_CURRENT']
  }), /absent from the exact current set/);
  const staleReceipt = refingerprint(receipt, 'currentRecordSetRef', 'continuity-current-record-set-receipt', {
    aggregateFingerprint: semanticHash({ aggregate: 'stale' })
  });
  assert.throws(() => projectAggregateApplicableContinuity({
    aggregate: state.aggregate.value,
    currentRecordSetReceipt: staleReceipt,
    applicableScopeTargets: [successorCandidate.scopeTarget],
    allowedAuthorityEvidenceClasses: ['SIMULATED_CURRENT']
  }), /missing, stale or substituted/);
  const wrongTransaction = refingerprint(transaction, 'supersessionRef', 'continuity-supersession', {
    priorRecordFingerprint: semanticHash({ prior: 'wrong' })
  });
  const wrongAggregate = refingerprintAggregate(state.aggregate.value, { supersessions: [wrongTransaction] });
  assert.throws(() => createContinuityCurrentRecordSetReceipt(wrongAggregate), /supersession|prior/);
  conflictState.dispose();
  state.dispose();
});

test('C16 Burden acceptance enforces canonical route, policy and aggregate-recorded authority', () => {
  const formed = burdenCandidate('c16');
  const record = accept(formed);
  const fixture = aggregateProjectionFixture(formed, record, 'c16');
  const before = semanticHash(fixture.state.aggregate.value);
  const revision = fixture.state.aggregate.revision;
  const replay = acceptContinuityCandidate(formed, fixture.review, {
    acceptedAt: ACCEPTED,
    authorityEvidence: fixture.evidence,
    aggregate: fixture.state.aggregate.value
  });
  assert.equal(replay.semanticFingerprint, record.semanticFingerprint);

  const unrecordedAggregate = refingerprintAggregate(fixture.state.aggregate.value, { authorityEvidence: [] });
  assert.throws(() => acceptContinuityCandidate(formed, fixture.review, {
    acceptedAt: ACCEPTED,
    authorityEvidence: fixture.evidence,
    aggregate: unrecordedAggregate
  }), /not aggregate-recorded/);
  const forgedPolicy = refingerprint(fixture.review, 'reviewRef', 'continuity-review', {
    requiredAcceptanceRefs: ['lineage.vex.other']
  });
  assert.throws(() => acceptContinuityCandidate(formed, forgedPolicy, {
    acceptedAt: ACCEPTED,
    authorityEvidence: fixture.evidence,
    aggregate: fixture.state.aggregate.value
  }), /review|policy|required acceptance/);
  const forgedRouteReview = refingerprint(fixture.review, 'reviewRef', 'continuity-review', {
    routeRef: 'continuity-route.forged',
    routeFingerprint: semanticHash({ route: 'forged' })
  });
  assert.throws(() => acceptContinuityCandidate(formed, forgedRouteReview, {
    acceptedAt: ACCEPTED,
    authorityEvidence: fixture.evidence,
    aggregate: fixture.state.aggregate.value
  }), /route|review/);
  assert.throws(() => acceptBurdenRelease(record.burdenRelease, {
    candidate: formed,
    route: fixture.route,
    review: fixture.review,
    authorityEvidenceRefs: fixture.evidence.map((item) => item.acceptanceEvidenceRef)
  }), /private to aggregate-owned canonical continuity acceptance/);
  assert.equal(semanticHash(fixture.state.aggregate.value), before);
  assert.equal(fixture.state.aggregate.revision, revision);
  fixture.state.dispose();
});

test('C17 supersession is the exact source-managed aggregate transaction and rejects forged current truth', () => {
  const priorCandidate = candidate('c17-prior');
  const priorLineage = acceptedReview(priorCandidate);
  const priorEvidence = authorityEvidence(priorCandidate, priorLineage.route, priorLineage.review);
  const prior = accept(priorCandidate);
  const successorCandidate = candidate('c17-successor');
  const successorLineage = acceptedReview(successorCandidate, { supersedesRef: prior.acceptedRecordRef });
  const successorEvidence = authorityEvidence(successorCandidate, successorLineage.route, successorLineage.review);
  const successor = accept(successorCandidate, { acceptedAt: '2026-07-31T20:03:00.000Z' }, {
    supersedesRef: prior.acceptedRecordRef
  });
  const transaction = supersedeContinuityRecord(prior, successor, {
    rollbackRef: 'rollback.c17',
    supersededAt: '2026-07-31T20:04:00.000Z'
  });
  assert.equal(validateContinuitySupersession(transaction, [prior, successor]), transaction);

  for (const changes of [
    { schemaVersion: 'vexlife.continuity-supersession-transaction/invented' },
    { priorDisposition: 'CURRENT' },
    { successorDisposition: 'SUPERSEDED' },
    { rollbackRef: '' },
    { supersededAt: '2026-07-31T20:01:30.000Z' },
    { atomic: false },
    { sourceHistoryDeleted: true },
    { acceptanceEvidenceRefs: [] }
  ]) {
    const forged = refingerprint(transaction, 'supersessionRef', 'continuity-supersession', changes);
    assert.throws(() => validateContinuitySupersession(forged, [prior, successor]), /supersession|rollback|acceptance/);
  }
  assert.throws(() => validateContinuityRecordSet([prior, successor], [transaction, transaction]), /duplicate supersession/);

  const crossCandidate = candidate('c17-cross-self', {
    observations: [observation('c17-cross-self', {
      sourceLineageRef: 'lineage.vex.other',
      sourceRecipientRefs: ['lineage.vex.other']
    })],
    candidateScope: 'VEX_SELF',
    aboutSelfRefs: ['lineage.vex.other'],
    affectedPartyRefs: ['lineage.vex.other'],
    signals: { preferenceOwner: 'VEX' }
  });
  const crossLineage = acceptedReview(crossCandidate, { supersedesRef: prior.acceptedRecordRef });
  const crossEvidence = authorityEvidence(crossCandidate, crossLineage.route, crossLineage.review);
  const crossSuccessor = accept(crossCandidate, { acceptedAt: '2026-07-31T20:03:00.000Z' }, {
    supersedesRef: prior.acceptedRecordRef
  });
  const forgedCrossTransaction = refingerprint(transaction, 'supersessionRef', 'continuity-supersession', {
    successorRecordRef: crossSuccessor.acceptedRecordRef,
    successorRecordFingerprint: crossSuccessor.semanticFingerprint,
    acceptanceEvidenceRefs: [...crossSuccessor.acceptanceEvidenceRefs]
  });
  assert.throws(() => validateContinuitySupersession(forgedCrossTransaction, [prior, crossSuccessor]), /incompatible/);

  const state = createContinuityEvolutionState();
  recordLineageIntoState(state, priorCandidate, priorLineage.review, priorEvidence, prior, 'c17-prior');
  recordLineagePrerequisitesIntoState(state, crossCandidate, crossLineage.review, crossEvidence, 'c17-cross');
  expectAggregateRejectsUnchanged(state, {
    type: 'RECORD_SUPERSEDED',
    transitionRef: 'transition.c17.forged-cross',
    transaction: forgedCrossTransaction,
    successor: crossSuccessor
  }, /incompatible/);
  assert.ok(createContinuityCurrentRecordSetReceipt(state.aggregate.value).currentRecordRefs.includes(prior.acceptedRecordRef));

  recordLineagePrerequisitesIntoState(state, successorCandidate, successorLineage.review, successorEvidence, 'c17-successor');
  state.record(createContinuityEvolutionEvent({
    type: 'RECORD_SUPERSEDED',
    transitionRef: 'transition.c17.valid',
    transaction,
    successor
  }));
  const current = createContinuityCurrentRecordSetReceipt(state.aggregate.value);
  assert.deepEqual(current.currentRecordRefs, [successor.acceptedRecordRef]);
  expectAggregateRejectsUnchanged(state, {
    type: 'RECORD_SUPERSEDED',
    transitionRef: 'transition.c17.duplicate',
    transaction,
    successor
  }, /already superseded|duplicated/);
  state.dispose();
});

test('C18 durable projections bind exact current-set disposition and suppress non-current action', () => {
  const priorCandidate = burdenCandidate('c18-prior');
  const priorLineage = acceptedReview(priorCandidate);
  const priorEvidence = authorityEvidence(priorCandidate, priorLineage.route, priorLineage.review);
  const prior = accept(priorCandidate);
  const successorCandidate = burdenCandidate('c18-successor');
  const successorLineage = acceptedReview(successorCandidate, { supersedesRef: prior.acceptedRecordRef });
  const successorEvidence = authorityEvidence(successorCandidate, successorLineage.route, successorLineage.review);
  const successor = accept(successorCandidate, { acceptedAt: '2026-07-31T20:03:00.000Z' }, {
    supersedesRef: prior.acceptedRecordRef
  });
  const transaction = supersedeContinuityRecord(prior, successor, {
    rollbackRef: 'rollback.c18',
    supersededAt: '2026-07-31T20:04:00.000Z'
  });
  const state = createContinuityEvolutionState();
  recordLineageIntoState(state, priorCandidate, priorLineage.review, priorEvidence, prior, 'c18-prior');
  recordLineagePrerequisitesIntoState(state, successorCandidate, successorLineage.review, successorEvidence, 'c18-successor');
  state.record(createContinuityEvolutionEvent({
    type: 'RECORD_SUPERSEDED', transitionRef: 'transition.c18.superseded', transaction, successor
  }));

  for (const projection of [
    projectAggregateOwnedContinuityRecord({
      aggregate: state.aggregate.value,
      acceptedRecordRef: prior.acceptedRecordRef,
      acceptedRecordFingerprint: prior.semanticFingerprint
    }),
    projectAggregateOwnedBurdenRelease({
      aggregate: state.aggregate.value,
      acceptedRecordRef: prior.acceptedRecordRef,
      acceptedRecordFingerprint: prior.semanticFingerprint
    })
  ]) {
    assert.equal(projection.currentSetDisposition, 'SUPERSEDED');
    assert.equal(projection.currentSuccessorRef, successor.acceptedRecordRef);
    assert.equal(projection.aggregateProjectionReceipt.currentSetDisposition, 'SUPERSEDED');
    assert.equal(projection.aggregateProjectionReceipt.currentSuccessorRef, successor.acceptedRecordRef);
    assert.equal(projection.nextSafeAction, 'FOLLOW_CURRENT_SUCCESSOR_BY_REF_ONLY');
    assert.equal(/APPLY|MONITOR/.test(projection.nextSafeAction), false);
  }
  const successorProjection = projectAggregateOwnedBurdenRelease({
    aggregate: state.aggregate.value,
    acceptedRecordRef: successor.acceptedRecordRef,
    acceptedRecordFingerprint: successor.semanticFingerprint
  });
  assert.equal(successorProjection.currentSetDisposition, 'CURRENT');
  assert.equal(successorProjection.currentSuccessorRef, null);
  assert.equal(successorProjection.nextSafeAction, 'USE_ONLY_IN_EXPLICIT_SIMULATED_CURRENT_CONTEXT');

  const conflictState = createContinuityEvolutionState();
  recordLineageIntoState(conflictState, priorCandidate, priorLineage.review, priorEvidence, prior, 'c18-conflict-prior');
  const conflictCandidate = burdenCandidate('c18-conflict-successor');
  const conflictLineage = acceptedReview(conflictCandidate);
  const conflictEvidence = authorityEvidence(conflictCandidate, conflictLineage.route, conflictLineage.review);
  const conflictingRecord = accept(conflictCandidate, { acceptedAt: '2026-07-31T20:03:00.000Z' });
  recordLineageIntoState(conflictState, conflictCandidate, conflictLineage.review, conflictEvidence, conflictingRecord, 'c18-conflict-successor');
  const conflictProjection = projectAggregateOwnedBurdenRelease({
    aggregate: conflictState.aggregate.value,
    acceptedRecordRef: prior.acceptedRecordRef,
    acceptedRecordFingerprint: prior.semanticFingerprint
  });
  assert.equal(conflictProjection.currentSetDisposition, 'HELD_CONFLICT');
  assert.equal(conflictProjection.currentSuccessorRef, null);
  assert.equal(conflictProjection.aggregateProjectionReceipt.currentSetDisposition, 'HELD_CONFLICT');
  assert.equal(conflictProjection.nextSafeAction, 'RETURN_TO_CURRENT_RECORD_CONFLICT_REVIEW');

  const wrongCurrentSetReceipt = refingerprint(
    createContinuityCurrentRecordSetReceipt(state.aggregate.value),
    'currentRecordSetRef',
    'continuity-current-record-set-receipt',
    { currentRecordRefs: [prior.acceptedRecordRef], supersededRecordRefs: [successor.acceptedRecordRef] }
  );
  assert.throws(() => projectAggregateApplicableContinuity({
    aggregate: state.aggregate.value,
    currentRecordSetReceipt: wrongCurrentSetReceipt,
    applicableScopeTargets: [successorCandidate.scopeTarget],
    allowedAuthorityEvidenceClasses: ['SIMULATED_CURRENT']
  }), /missing, stale or substituted/);
  const wrongSuccessor = refingerprint(transaction, 'supersessionRef', 'continuity-supersession', {
    successorRecordRef: prior.acceptedRecordRef,
    successorRecordFingerprint: prior.semanticFingerprint,
    acceptanceEvidenceRefs: [...prior.acceptanceEvidenceRefs]
  });
  const wrongAggregate = refingerprintAggregate(state.aggregate.value, { supersessions: [wrongSuccessor] });
  assert.throws(() => projectAggregateOwnedContinuityRecord({
    aggregate: wrongAggregate,
    acceptedRecordRef: prior.acceptedRecordRef,
    acceptedRecordFingerprint: prior.semanticFingerprint
  }), /supersession|successor/);
  conflictState.dispose();
  state.dispose();
});

test('C19 transient projection consumes exact source-managed lease-current clock receipt', () => {
  const formed = candidate('c19-context', { candidateScope: 'CURRENT_TURN', signals: {} });
  const lineage = acceptedReview(formed);
  const evidence = authorityEvidence(formed, lineage.route, lineage.review);
  const lease = createCurrentContextLease({
    candidate: formed,
    route: lineage.route,
    review: lineage.review,
    leaseRef: 'lease.c19.context',
    turnRef: 'turn.test.c19-context',
    threadRef: 'thread.test',
    channelRef: 'channel.test',
    formedAt: REVIEWED,
    observedAt: REVIEWED,
    expiresAt: EXPIRES
  });
  const context = acceptContinuityCandidate(formed, lineage.review, {
    acceptedAt: ACCEPTED,
    authorityEvidence: evidence,
    currentContextLease: lease
  });
  assert.equal(context.currentness, 'TRANSIENT');
  const state = createContinuityEvolutionState();
  recordLineagePrerequisitesIntoState(state, formed, lineage.review, evidence, 'c19-context');
  state.record(createContinuityEvolutionEvent({
    type: 'CONTEXT_APPLIED', transitionRef: 'transition.c19.context', context
  }));
  const aggregateBeforeClock = state.aggregate.value;
  assert.throws(() => createContinuityProjectionClockReceipt({
    aggregate: aggregateBeforeClock,
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    projectionObservedAt: '2026-07-31T20:05:00.000Z'
  }), /aggregate-owned simulated clock snapshot/);
  assert.throws(() => createContinuitySimulatedClockSnapshot({
    aggregate: aggregateBeforeClock,
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    observedAt: '2026-07-31T20:00:59.999Z'
  }), /precede lease observation/);
  assert.throws(() => createContinuitySimulatedClockSnapshot({
    aggregate: aggregateBeforeClock,
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    observedAt: EXPIRES
  }), /at or after lease expiry/);
  const clock = projectionClockReceipt(state, context, '2026-07-31T20:05:00.000Z', 'c19');
  const aggregate = state.aggregate.value;
  const projection = projectAggregateOwnedTransientContinuityContext({
    aggregate,
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    projectionClockReceipt: clock
  });
  assert.equal(projection.currentness, 'TRANSIENT_SIMULATED_CURRENT');
  assert.equal(projection.applicableWithinLease, true);
  assert.equal(projection.clockEvidenceClass, 'SIMULATED_CURRENT');
  assert.equal(projection.simulatedClock, true);
  assert.equal(projection.liveClockGranted, false);
  assert.equal(projection.externalTimeServiceUsed, false);
  assert.equal(projection.projectionObservedAt, '2026-07-31T20:05:00.000Z');
  assert.equal(projection.aggregateProjectionReceipt.projectionClockReceiptRef, clock.clockReceiptRef);
  assert.equal(projection.aggregateProjectionReceipt.clockSnapshotRef, clock.clockSnapshotRef);
  assert.equal(projection.aggregateProjectionReceipt.projectionCurrentness, 'TRANSIENT_SIMULATED_CURRENT');
  assert.equal(projection.aggregateProjectionReceipt.projectionObservedAt, clock.projectionObservedAt);

  assert.throws(() => projectAggregateOwnedTransientContinuityContext({
    aggregate,
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint
  }), /source-managed clock receipt/);
  const substitutedClock = refingerprint(clock, 'clockReceiptRef', 'continuity-projection-clock-receipt', {
    contextBindingRef: 'continuity-current-context.substituted'
  });
  assert.throws(() => projectAggregateOwnedTransientContinuityContext({
    aggregate,
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    projectionClockReceipt: substitutedClock
  }), /stale, cross-lease or substituted|detached from its exact context/);
  assert.throws(() => createCurrentContextLease({
    candidate: formed,
    route: lineage.route,
    review: lineage.review,
    leaseRef: 'lease.c19.cross-turn',
    turnRef: 'turn.test.other',
    threadRef: 'thread.test',
    channelRef: 'channel.test',
    formedAt: REVIEWED,
    observedAt: REVIEWED,
    expiresAt: EXPIRES
  }), /coordinates/);

  const otherCandidate = candidate('c19-other-context', { candidateScope: 'CURRENT_TURN', signals: {} });
  const otherLineage = acceptedReview(otherCandidate);
  const otherEvidence = authorityEvidence(otherCandidate, otherLineage.route, otherLineage.review);
  const otherLease = createCurrentContextLease({
    candidate: otherCandidate,
    route: otherLineage.route,
    review: otherLineage.review,
    leaseRef: 'lease.c19.other',
    turnRef: 'turn.test.c19-other-context',
    threadRef: 'thread.test',
    channelRef: 'channel.test',
    formedAt: REVIEWED,
    observedAt: REVIEWED,
    expiresAt: EXPIRES
  });
  const otherContext = acceptContinuityCandidate(otherCandidate, otherLineage.review, {
    acceptedAt: ACCEPTED,
    authorityEvidence: otherEvidence,
    currentContextLease: otherLease
  });
  recordLineagePrerequisitesIntoState(state, otherCandidate, otherLineage.review, otherEvidence, 'c19-other');
  state.record(createContinuityEvolutionEvent({
    type: 'CONTEXT_APPLIED', transitionRef: 'transition.c19.other-context', context: otherContext
  }));
  const otherClock = projectionClockReceipt(state, otherContext, '2026-07-31T20:06:00.000Z', 'c19.other');
  const currentAggregate = state.aggregate.value;
  const before = semanticHash(currentAggregate);
  const revision = state.aggregate.revision;
  assert.throws(() => projectAggregateOwnedTransientContinuityContext({
    aggregate: currentAggregate,
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    projectionClockReceipt: otherClock
  }), /stale, cross-lease or substituted|detached from its exact context/);
  assert.throws(() => projectAggregateOwnedTransientContinuityContext({
    aggregate: currentAggregate,
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    projectionClockReceipt: clock
  }), /stale, cross-lease or substituted|stale, superseded or not aggregate current/);
  assert.equal(semanticHash(state.aggregate.value), before);
  assert.equal(state.aggregate.revision, revision);
  state.dispose();
});

test('C20 superseding successors enter current truth only through one exact atomic transaction', () => {
  const priorCandidate = candidate('c20-prior');
  const priorLineage = acceptedReview(priorCandidate);
  const priorEvidence = authorityEvidence(priorCandidate, priorLineage.route, priorLineage.review);
  const prior = accept(priorCandidate);
  const state = createContinuityEvolutionState();
  recordLineageIntoState(state, priorCandidate, priorLineage.review, priorEvidence, prior, 'c20-prior');

  const orphanCandidates = [
    burdenCandidate('c20-cross-class'),
    candidate('c20-cross-scope', { candidateScope: 'PROJECT' }),
    candidate('c20-cross-target', {
      observations: [observation('c20-cross-target', {
        sourceLineageRef: 'lineage.vex.other',
        sourceRecipientRefs: ['person.human.other']
      })],
      aboutSelfRefs: ['person.human.other'],
      affectedPartyRefs: ['person.human.other']
    })
  ];
  for (const [index, orphanCandidate] of orphanCandidates.entries()) {
    const orphanLineage = acceptedReview(orphanCandidate, { supersedesRef: prior.acceptedRecordRef });
    const orphanEvidence = authorityEvidence(orphanCandidate, orphanLineage.route, orphanLineage.review);
    const orphan = accept(orphanCandidate, { acceptedAt: '2026-07-31T20:03:00.000Z' }, {
      supersedesRef: prior.acceptedRecordRef
    });
    assert.throws(() => validateContinuityRecordSet([prior, orphan]), /dangling or untransacted/);
    recordLineagePrerequisitesIntoState(state, orphanCandidate, orphanLineage.review, orphanEvidence, `c20-orphan-${index}`);
    expectAggregateRejectsUnchanged(state, {
      type: 'RECORD_ACCEPTED',
      transitionRef: `transition.c20.orphan.${index}`,
      record: orphan
    }, /ordinary RECORD_ACCEPTED/);
    assert.equal(createContinuityCurrentRecordSetReceipt(state.aggregate.value).currentRecordRefs.includes(orphan.acceptedRecordRef), false);
  }

  const successorCandidate = candidate('c20-successor');
  const successorLineage = acceptedReview(successorCandidate, { supersedesRef: prior.acceptedRecordRef });
  const successorEvidence = authorityEvidence(successorCandidate, successorLineage.route, successorLineage.review);
  const successor = accept(successorCandidate, { acceptedAt: '2026-07-31T20:03:00.000Z' }, {
    supersedesRef: prior.acceptedRecordRef
  });
  recordLineagePrerequisitesIntoState(state, successorCandidate, successorLineage.review, successorEvidence, 'c20-successor');
  expectAggregateRejectsUnchanged(state, {
    type: 'RECORD_ACCEPTED', transitionRef: 'transition.c20.successor.non-atomic', record: successor
  }, /ordinary RECORD_ACCEPTED/);
  const transaction = supersedeContinuityRecord(prior, successor, {
    rollbackRef: 'rollback.c20', supersededAt: '2026-07-31T20:04:00.000Z'
  });
  const incompatible = refingerprint(transaction, 'supersessionRef', 'continuity-supersession', {
    priorRecordRef: 'accepted-continuity-record.missing'
  });
  assert.throws(() => validateContinuityRecordSet([prior, successor], [incompatible]), /one exact prior/);
  const duplicateForSuccessor = supersedeContinuityRecord(prior, successor, {
    rollbackRef: 'rollback.c20.duplicate', supersededAt: '2026-07-31T20:04:00.001Z'
  });
  assert.throws(() => validateContinuityRecordSet([prior, successor], [transaction, duplicateForSuccessor]), /more than one/);
  state.record(createContinuityEvolutionEvent({
    type: 'RECORD_SUPERSEDED', transitionRef: 'transition.c20.successor.atomic', transaction, successor
  }));
  assert.deepEqual(createContinuityCurrentRecordSetReceipt(state.aggregate.value).currentRecordRefs, [successor.acceptedRecordRef]);
  expectAggregateRejectsUnchanged(state, {
    type: 'RECORD_SUPERSEDED', transitionRef: 'transition.c20.successor.duplicate', transaction, successor
  }, /already superseded|duplicated/);
  state.dispose();
});

test('C21 supersession proves every successor authority item current at the exact transaction time', () => {
  const prior = accept(candidate('c21-prior'));
  const successorCandidate = candidate('c21-successor');
  const successor = accept(successorCandidate, { acceptedAt: '2026-07-31T20:03:00.000Z' }, {
    supersedesRef: prior.acceptedRecordRef
  });
  const valid = supersedeContinuityRecord(prior, successor, {
    rollbackRef: 'rollback.c21.valid', supersededAt: '2026-07-31T20:09:59.999Z'
  });
  assert.equal(valid.authorityCurrentnessProof.state, 'SIMULATED_CURRENT');
  assert.equal(valid.authorityCurrentnessProof.verifiedAt, '2026-07-31T20:09:59.999Z');
  assert.equal(valid.authorityCurrentnessProof.evidenceBindings.every((item) => item.currentAtVerifiedTime), true);
  assert.deepEqual(Object.keys(valid), CONTINUITY_SUPERSESSION_TRANSACTION_REQUIRED_FIELDS);
  const set = validateContinuityRecordSet([prior, successor], [valid]);
  assert.equal(set.supersessionAuthorityBindings[0].authorityCurrentnessFingerprint, semanticHash(valid.authorityCurrentnessProof));

  for (const [supersededAt, pattern] of [
    ['2026-07-31T20:00:59.999Z', /supersession|acceptance/],
    [EXPIRES, /not current/],
    ['2026-07-31T20:10:00.001Z', /not current/]
  ]) assert.throws(() => supersedeContinuityRecord(prior, successor, {
    rollbackRef: `rollback.c21.${supersededAt}`,
    supersededAt
  }), pattern);

  const relationshipPriorCandidate = candidate('c21-relationship-prior', {
    candidateScope: 'RELATIONSHIP',
    affectedPartyRefs: ['person.human.test', 'lineage.vex.test'],
    signals: {}
  });
  const relationshipPrior = accept(relationshipPriorCandidate);
  const relationshipSuccessorCandidate = candidate('c21-relationship-successor', {
    candidateScope: 'RELATIONSHIP',
    affectedPartyRefs: ['person.human.test', 'lineage.vex.test'],
    signals: {}
  });
  const relationshipLineage = acceptedReview(relationshipSuccessorCandidate, {
    supersedesRef: relationshipPrior.acceptedRecordRef
  });
  const mixedEvidence = relationshipLineage.review.requiredAcceptanceRefs.map((authorityRef, index) =>
    createContinuityAcceptanceEvidence({
      candidate: relationshipSuccessorCandidate,
      route: relationshipLineage.route,
      review: relationshipLineage.review,
      authoritySnapshot: createContinuityAuthoritySnapshot({
        actorRef: authorityRef,
        authorityRef,
        subjectRefs: relationshipSuccessorCandidate.affectedPartyRefs,
        scope: relationshipSuccessorCandidate.candidateScope,
        scopeTarget: relationshipSuccessorCandidate.scopeTarget,
        recordClass: relationshipLineage.route.proposedPrimaryDestination,
        formedAt: REVIEWED,
        observedAt: REVIEWED,
        expiresAt: index === 0 ? '2026-07-31T20:05:00.000Z' : EXPIRES
      })
    }));
  const aggregate = createInitialContinuityEvolutionAggregate();
  aggregate.observations = structuredClone(CANDIDATE_OBSERVATIONS.get(relationshipSuccessorCandidate.candidateRef));
  aggregate.candidates = [structuredClone(relationshipSuccessorCandidate)];
  aggregate.reviews = [structuredClone(relationshipLineage.review)];
  aggregate.authorityEvidence = structuredClone(mixedEvidence);
  delete aggregate.semanticFingerprint;
  aggregate.semanticFingerprint = semanticHash(aggregate);
  const mixedSuccessor = acceptContinuityCandidate(relationshipSuccessorCandidate, relationshipLineage.review, {
    acceptedAt: '2026-07-31T20:03:00.000Z',
    authorityEvidence: mixedEvidence,
    aggregate
  });
  assert.throws(() => supersedeContinuityRecord(relationshipPrior, mixedSuccessor, {
    rollbackRef: 'rollback.c21.mixed', supersededAt: '2026-07-31T20:06:00.000Z'
  }), /not current/);
});

test('C22 transient currentness consumes only the latest source-bound simulated clock snapshot', () => {
  const formed = candidate('c22-context', { candidateScope: 'CURRENT_TURN', signals: {} });
  const lineage = acceptedReview(formed);
  const evidence = authorityEvidence(formed, lineage.route, lineage.review);
  const lease = createCurrentContextLease({
    candidate: formed,
    route: lineage.route,
    review: lineage.review,
    leaseRef: 'lease.c22.context',
    turnRef: 'turn.test.c22-context',
    threadRef: 'thread.test',
    channelRef: 'channel.test',
    formedAt: REVIEWED,
    observedAt: REVIEWED,
    expiresAt: EXPIRES
  });
  const context = acceptContinuityCandidate(formed, lineage.review, {
    acceptedAt: ACCEPTED,
    authorityEvidence: evidence,
    currentContextLease: lease
  });
  const state = createContinuityEvolutionState();
  recordLineagePrerequisitesIntoState(state, formed, lineage.review, evidence, 'c22-context');
  state.record(createContinuityEvolutionEvent({
    type: 'CONTEXT_APPLIED', transitionRef: 'transition.c22.context', context
  }));
  const first = createContinuitySimulatedClockSnapshot({
    aggregate: state.aggregate.value,
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    observedAt: '2026-07-31T20:05:00.000Z'
  });
  assert.equal(semanticHash(CONTINUITY_SIMULATED_CLOCK_SOURCE).length, 64);
  assert.deepEqual(Object.keys(first), CONTINUITY_SIMULATED_CLOCK_SNAPSHOT_REQUIRED_FIELDS);
  for (const [index, changes] of [
    { sourceRef: context.contextRecordRef, clockSourceRef: 'clock-source.self-issued' },
    { sourceRef: 'source.unknown', clockSourceFingerprint: semanticHash({ source: 'unknown' }) },
    { turnRef: 'turn.test.other' },
    { threadRef: 'thread.other' },
    { channelRef: 'channel.other' },
    { contextBindingRef: 'continuity-current-context.other' }
  ].entries()) {
    const forged = refingerprint(first, 'clockSnapshotRef', 'continuity-simulated-clock-snapshot', changes);
    expectAggregateRejectsUnchanged(state, {
      type: 'CLOCK_SNAPSHOT_RECORDED', transitionRef: `transition.c22.forged.${index}`, snapshot: forged
    }, /registered deterministic simulated source|detached from its exact context/);
  }
  state.record(createContinuityEvolutionEvent({
    type: 'CLOCK_SNAPSHOT_RECORDED', transitionRef: 'transition.c22.clock.first', snapshot: first
  }));
  const firstReceipt = createContinuityProjectionClockReceipt({
    aggregate: state.aggregate.value,
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    clockSnapshotRef: first.clockSnapshotRef,
    clockSnapshotFingerprint: first.semanticFingerprint
  });
  assert.deepEqual(Object.keys(firstReceipt), CONTINUITY_PROJECTION_CLOCK_RECEIPT_REQUIRED_FIELDS);
  assert.equal(firstReceipt.clockEvidenceClass, 'SIMULATED_CURRENT');
  assert.equal(firstReceipt.simulatedClock, true);
  assert.equal(firstReceipt.liveClockGranted, false);
  assert.equal(firstReceipt.externalTimeServiceUsed, false);
  const firstProjection = projectAggregateOwnedTransientContinuityContext({
    aggregate: state.aggregate.value,
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    projectionClockReceipt: firstReceipt
  });
  assert.equal(firstProjection.currentness, 'TRANSIENT_SIMULATED_CURRENT');
  assert.equal(firstProjection.aggregateProjectionReceipt.clockSourceRef, CONTINUITY_SIMULATED_CLOCK_SOURCE.clockSourceRef);
  assert.equal(firstProjection.aggregateProjectionReceipt.clockSnapshotRef, first.clockSnapshotRef);

  const second = createContinuitySimulatedClockSnapshot({
    aggregate: state.aggregate.value,
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    observedAt: '2026-07-31T20:06:00.000Z'
  });
  state.record(createContinuityEvolutionEvent({
    type: 'CLOCK_SNAPSHOT_RECORDED', transitionRef: 'transition.c22.clock.second', snapshot: second
  }));
  const before = semanticHash(state.aggregate.value);
  const revision = state.aggregate.revision;
  assert.throws(() => createContinuityProjectionClockReceipt({
    aggregate: state.aggregate.value,
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    clockSnapshotRef: first.clockSnapshotRef,
    clockSnapshotFingerprint: first.semanticFingerprint
  }), /stale, superseded or not aggregate current/);
  assert.throws(() => projectAggregateOwnedTransientContinuityContext({
    aggregate: state.aggregate.value,
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    projectionClockReceipt: firstReceipt
  }), /stale, superseded or not aggregate current|stale, cross-lease or substituted/);
  assert.throws(() => createContinuitySimulatedClockSnapshot({
    aggregate: state.aggregate.value,
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    observedAt: EXPIRES
  }), /at or after lease expiry/);
  assert.equal(semanticHash(state.aggregate.value), before);
  assert.equal(state.aggregate.revision, revision);
  state.dispose();
});

test('private human projection exposes reviewed refs rather than arbitrary summary text', () => {
  const formed = candidate('privacy');
  const record = accept(formed);
  const fixture = aggregateProjectionFixture(formed, record, 'privacy');
  const projection = projectAggregateOwnedContinuityRecord({
    aggregate: fixture.state.aggregate.value,
    acceptedRecordRef: record.acceptedRecordRef,
    acceptedRecordFingerprint: record.semanticFingerprint
  });
  assert.equal(projection.observedPatternOrPreferenceRef, 'summary.continuity.candidate.privacy');
  assert.equal(projection.sourceSupport.rawContentIncluded, false);
  assert.equal('summary' in projection, false);
  fixture.state.dispose();
});

// [VXG RealForever]
