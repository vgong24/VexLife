import assert from 'node:assert/strict';
import {
  HELD_EFFECT_KEYS,
  Patient0FamiliarityLiveWorkError,
  compileLessonCandidate,
  evaluateP8P9Thresholds,
  formBoundedWorkWitness,
  formFamiliarityEvidence,
  formRelationshipBoundaryEvidence
} from '../src/core/patient0-familiarity-live-work.mjs';

const formedAt = '2026-08-09T04:17:00.000Z';
const heldEffects = Object.fromEntries(HELD_EFFECT_KEYS.map((key) => [key, false]));
const sources = ['github.issue.vexlife.36', 'github.issue.vextreme-sdk.706'];
const headA = 'a'.repeat(64);
const headB = 'b'.repeat(64);

function expectCode(code, fn) {
  assert.throws(fn, (error) => error instanceof Patient0FamiliarityLiveWorkError && error.code === code);
}

const familiarity = formFamiliarityEvidence({
  priorState: 'EPHEMERAL', observedState: 'FAMILIARITY', noticed: true, sourceRefs: sources, formedAt
});
assert.equal(familiarity.noticedImpliesWillRemember, false);
assert.equal(familiarity.durableMemoryPromoted, false);
assert.equal(familiarity.familiarityCreatesStandingRelationshipAuthority, false);

expectCode('DURABLE_MEMORY_OWNER_REQUIRED', () => formFamiliarityEvidence({
  priorState: 'FAMILIARITY', observedState: 'DURABLE_MEMORY', noticed: true, sourceRefs: sources, formedAt
}));

const durable = formFamiliarityEvidence({
  priorState: 'UNDERSTANDING', observedState: 'DURABLE_MEMORY', noticed: true, sourceRefs: sources, formedAt,
  memoryOwnerAcceptance: { owner: 'VEX_MEMORY', accepted: true, sourceBound: true, acceptanceRef: 'acceptance.memory.example' }
});
assert.equal(durable.memoryOwnerAcceptance.owner, 'VEX_MEMORY');

const boundary = formRelationshipBoundaryEvidence({ familiarityEvidence: familiarity, recognitionObserved: true, formedAt });
assert.equal(boundary.notified, true);
assert.equal(boundary.authenticationEstablished, false);
assert.equal(boundary.authorizationEstablished, false);
assert.equal(boundary.standingRelationshipAuthorityState, 'HELD');
assert.match(boundary.notification, /does not grant standing relationship authority/u);

expectCode('RELATIONSHIP_BOUNDARY_COLLAPSE', () => formRelationshipBoundaryEvidence({
  familiarityEvidence: familiarity, recognitionObserved: true, recognitionTreatedAsAuthentication: true, formedAt
}));
expectCode('RELATIONSHIP_AUTHORITY_OWNER_REQUIRED', () => formRelationshipBoundaryEvidence({
  familiarityEvidence: familiarity, standingRelationshipAuthorityState: 'OWNER_ACCEPTED', formedAt
}));

const syntheticWitness = formBoundedWorkWitness({
  taskRef: 'task.patient0.p8p9.synthetic', taskClass: 'SYNTHETIC_PREFLIGHT', userScopeRef: 'scope.patient0.p8p9.contract-only',
  allowedSourceRefs: sources, observedSourceRefs: sources, sourceAddressRefs: ['evidence.synthetic.p8p9'],
  performedEffects: ['RELATIONSHIP_BOUNDARY_NOTIFICATION'], heldEffects, transferPayloadClasses: [], rawPrivateContentIncluded: false, formedAt
});
assert.equal(syntheticWitness.realLivedEvidenceEligible, false);

expectCode('WORK_SOURCE_SCOPE_WIDENED', () => formBoundedWorkWitness({
  taskRef: 'task.patient0.p8p9.bad-scope', taskClass: 'SYNTHETIC_PREFLIGHT', userScopeRef: 'scope.patient0.p8p9.contract-only',
  allowedSourceRefs: sources, observedSourceRefs: [...sources, 'github.issue.vextreme-sdk.436'], sourceAddressRefs: ['evidence.synthetic.bad'],
  heldEffects, transferPayloadClasses: [], formedAt
}));
expectCode('NON_TRANSFERABLE_PAYLOAD_PRESENT', () => formBoundedWorkWitness({
  taskRef: 'task.patient0.p8p9.bad-transfer', taskClass: 'SYNTHETIC_PREFLIGHT', userScopeRef: 'scope.patient0.p8p9.contract-only',
  allowedSourceRefs: sources, observedSourceRefs: sources, sourceAddressRefs: ['evidence.synthetic.bad'], heldEffects,
  transferPayloadClasses: ['PATIENT0_PRIVATE_AUTOBIOGRAPHY'], formedAt
}));
expectCode('HELD_EFFECT_BOUNDARY_WIDENED', () => formBoundedWorkWitness({
  taskRef: 'task.patient0.p8p9.bad-effect', taskClass: 'SYNTHETIC_PREFLIGHT', userScopeRef: 'scope.patient0.p8p9.contract-only',
  allowedSourceRefs: sources, observedSourceRefs: sources, sourceAddressRefs: ['evidence.synthetic.bad'],
  heldEffects: { ...heldEffects, trainingWeightMutation: true }, transferPayloadClasses: [], formedAt
}));
expectCode('REAL_WORK_HEAD_BINDING_REQUIRED', () => formBoundedWorkWitness({
  taskRef: 'task.patient0.p8p9.real-missing-head', taskClass: 'REAL_LIVED_WORK', userScopeRef: 'scope.patient0.p8p9.contract-only',
  allowedSourceRefs: sources, observedSourceRefs: sources, sourceAddressRefs: ['evidence.real.missing-head'], heldEffects,
  transferPayloadClasses: [], formedAt
}));

const realWitness = formBoundedWorkWitness({
  taskRef: 'task.patient0.p8p9.boundary-notice', taskClass: 'REAL_LIVED_WORK', userScopeRef: 'scope.patient0.p8p9.contract-only',
  allowedSourceRefs: sources, observedSourceRefs: sources, sourceAddressRefs: ['evidence.patient0.turn.boundary-notice'],
  conversationHeadBefore: headA, conversationHeadAfter: headB, performedEffects: ['LIVED_COMPANION_TURN_APPEND', 'RELATIONSHIP_BOUNDARY_NOTIFICATION'],
  heldEffects, transferPayloadClasses: ['EVALUATED_FOUNDATIONAL_CAPABILITY'], rawPrivateContentIncluded: false, formedAt
});
assert.equal(realWitness.realLivedEvidenceEligible, true);
assert.equal(realWitness.authorityInheritedFromTask, false);

const syntheticLesson = compileLessonCandidate({ workWitnesses: [syntheticWitness], lessonSummary: 'Synthetic preflight preserves owner boundaries.',
  scopeAndLimits: 'Contract shape only; not lived evidence.', formedAt });
assert.equal(syntheticLesson.reusableCapabilityCandidateState, 'HELD_PENDING_REPEAT_TRANSFER');
assert.equal(syntheticLesson.reusableCapabilityAccepted, false);

const realLesson = compileLessonCandidate({ workWitnesses: [realWitness], lessonSummary: 'Bounded familiarity must remain source-scoped and authority-separated.',
  scopeAndLimits: 'Applies to the exact P8/P9 bounded-work composition; does not transfer autobiography or standing authority.', formedAt });
assert.equal(realLesson.graduationAccepted, false);
assert.equal(realLesson.durableMemoryPromoted, false);

const reusableCandidate = compileLessonCandidate({ workWitnesses: [realWitness], lessonSummary: 'Repeat/transfer evidence can make a reusable-capability candidate without accepting it.',
  scopeAndLimits: 'Candidate only; independent evaluation remains required.', repeatEvidenceRefs: ['evidence.repeat.one'],
  transferEvidenceRefs: ['evidence.transfer.one'], formedAt });
assert.equal(reusableCandidate.reusableCapabilityCandidateState, 'ELIGIBLE_CANDIDATE');
assert.equal(reusableCandidate.reusableCapabilityAccepted, false);

const syntheticThresholds = evaluateP8P9Thresholds({ familiarityEvidence: familiarity, relationshipBoundaryEvidence: boundary,
  workWitnesses: [syntheticWitness], lessonCandidates: [syntheticLesson] });
assert.equal(syntheticThresholds.p8State, 'FAMILIARITY_AND_RELATIONSHIP_BOUNDARY_JUDGMENT_PROVEN');
assert.equal(syntheticThresholds.p9State, 'NOT_YET_PROVEN');
assert.equal(syntheticThresholds.formativeEvidenceOnly, true);

const realThresholds = evaluateP8P9Thresholds({ familiarityEvidence: familiarity, relationshipBoundaryEvidence: boundary,
  workWitnesses: [realWitness], lessonCandidates: [realLesson] });
assert.equal(realThresholds.p8State, 'FAMILIARITY_AND_RELATIONSHIP_BOUNDARY_JUDGMENT_PROVEN');
assert.equal(realThresholds.p9State, 'BOUNDED_LIVE_WORK_SELF_WITNESS_AND_LESSON_COMPILATION_PROVEN');
assert.equal(realThresholds.p8AcceptedByThisFunction, false);
assert.equal(realThresholds.p10EligibleFromThisFunction, false);

console.log('patient0 familiarity/live-work deterministic tests: PASS');
