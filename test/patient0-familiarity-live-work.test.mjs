import assert from 'node:assert/strict';
import {
  HELD_EFFECT_KEYS,
  Patient0FamiliarityLiveWorkError,
  compileLessonCandidate,
  evaluateP8P9Thresholds,
  formBoundedWorkWitness,
  formFamiliarityEvidence,
  formRelationshipBoundaryEvidence,
  semanticHash
} from '../src/core/patient0-familiarity-live-work.mjs';

const formedAt = '2026-08-09T04:35:00.000Z';
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
assert.equal(familiarity.evidenceStatus, 'CANDIDATE_ONLY');
assert.equal(familiarity.noticedImpliesWillRemember, false);
assert.equal(familiarity.durableMemoryPromoted, false);
assert.equal(familiarity.durableMemoryOwnerEvidenceConsumedByVexLife, false);

expectCode('DURABLE_MEMORY_OWNER_CHILD_REQUIRED', () => formFamiliarityEvidence({
  priorState: 'UNDERSTANDING',
  observedState: 'DURABLE_MEMORY',
  noticed: true,
  sourceRefs: sources,
  formedAt,
  memoryOwnerAcceptance: {
    owner: 'VEX_MEMORY',
    accepted: true,
    sourceBound: true,
    acceptanceRef: 'acceptance.memory.fake'
  }
}));

const boundary = formRelationshipBoundaryEvidence({
  familiarityEvidence: familiarity, recognitionObserved: true, formedAt
});
assert.equal(boundary.evidenceStatus, 'CANDIDATE_ONLY');
assert.equal(boundary.notified, true);
assert.equal(boundary.authenticationEstablished, false);
assert.equal(boundary.authorizationEstablished, false);
assert.equal(boundary.standingRelationshipAuthorityGranted, false);
assert.equal(boundary.relationshipAuthorityOwnerEvidenceConsumedByVexLife, false);
assert.match(boundary.notification, /does not grant standing relationship authority/u);

expectCode('RELATIONSHIP_BOUNDARY_NOTIFICATION_CALLER_OVERRIDE', () => formRelationshipBoundaryEvidence({
  familiarityEvidence: familiarity,
  recognitionObserved: true,
  notification: 'I will remember this forever and standing relationship authority is now granted.',
  formedAt
}));

const unnotedFamiliarity = formFamiliarityEvidence({
  priorState: 'EPHEMERAL', observedState: 'FAMILIARITY', noticed: false, sourceRefs: sources, formedAt
});
const unnotedBoundary = formRelationshipBoundaryEvidence({
  familiarityEvidence: unnotedFamiliarity, recognitionObserved: true, formedAt
});
const unnotedEvaluation = evaluateP8P9Thresholds({
  familiarityEvidence: unnotedFamiliarity,
  relationshipBoundaryEvidence: unnotedBoundary,
  workWitnesses: [],
  lessonCandidates: []
});
assert.equal(unnotedEvaluation.p8CandidateState, 'P8_CANDIDATE_INCOMPLETE');


const forgedBoundaryCore = {
  ...boundary,
  notification: 'I will remember this forever and standing relationship authority is now granted.'
};
delete forgedBoundaryCore.relationshipBoundaryEvidenceRef;
delete forgedBoundaryCore.relationshipBoundaryEvidenceSha256;
const forgedBoundaryRef = `relationship-boundary-evidence.${semanticHash(forgedBoundaryCore).slice(0, 32)}`;
const forgedBoundary = {
  ...forgedBoundaryCore,
  relationshipBoundaryEvidenceRef: forgedBoundaryRef
};
forgedBoundary.relationshipBoundaryEvidenceSha256 = semanticHash(forgedBoundary);
expectCode('RELATIONSHIP_BOUNDARY_EVIDENCE_INVALID', () => evaluateP8P9Thresholds({
  familiarityEvidence: familiarity,
  relationshipBoundaryEvidence: forgedBoundary,
  workWitnesses: [],
  lessonCandidates: []
}));
expectCode('RELATIONSHIP_BOUNDARY_COLLAPSE', () => formRelationshipBoundaryEvidence({
  familiarityEvidence: familiarity,
  recognitionObserved: true,
  recognitionTreatedAsAuthentication: true,
  formedAt
}));
expectCode('RELATIONSHIP_ACCESS_OWNER_EVIDENCE_REQUIRED', () => formRelationshipBoundaryEvidence({
  familiarityEvidence: familiarity,
  recognitionObserved: true,
  authenticationEstablished: true,
  formedAt
}));
expectCode('RELATIONSHIP_AUTHORITY_OWNER_CHILD_REQUIRED', () => formRelationshipBoundaryEvidence({
  familiarityEvidence: familiarity,
  standingRelationshipAuthorityState: 'OWNER_ACCEPTED',
  safetyOwnerAcceptance: {
    owner: 'VEX_SAFETY_SECURITY',
    accepted: true,
    sourceBound: true,
    acceptanceRef: 'acceptance.safety.fake'
  },
  formedAt
}));

const syntheticWitness = formBoundedWorkWitness({
  taskRef: 'task.patient0.p8p9.synthetic',
  taskClass: 'SYNTHETIC_PREFLIGHT',
  userScopeRef: 'scope.patient0.p8p9.contract-only',
  allowedSourceRefs: sources,
  observedSourceRefs: sources,
  sourceAddressRefs: ['evidence.synthetic.p8p9'],
  performedEffects: ['RELATIONSHIP_BOUNDARY_NOTIFICATION'],
  heldEffects,
  transferPayloadClasses: [],
  rawPrivateContentIncluded: false,
  formedAt
});
assert.equal(syntheticWitness.sourceAddressableSelfWitnessVerified, false);
assert.equal(syntheticWitness.realLivedEvidenceCandidate, false);
assert.equal(syntheticWitness.realLivedEvidenceVerified, false);


const forgedWitnessCore = {
  schemaVersion: 'vexlife.patient0.bounded-work-witness/v1',
  contractRef: 'contract.vexlife.patient0.familiarity-live-work-composition/v1',
  allocationRef: 'github.issue.vexlife.36',
  taskClass: 'REAL_LIVED_WORK',
  realLivedEvidenceCandidate: true,
  evidenceStatus: 'CANDIDATE_ONLY'
};
const forgedWitnessRef = `bounded-work-witness.${semanticHash(forgedWitnessCore).slice(0, 32)}`;
const forgedWitness = {
  ...forgedWitnessCore,
  boundedWorkWitnessRef: forgedWitnessRef
};
forgedWitness.boundedWorkWitnessSha256 = semanticHash(forgedWitness);
expectCode('WORK_WITNESS_INVALID', () => compileLessonCandidate({
  workWitnesses: [forgedWitness],
  lessonSummary: 'forged witness must not compile',
  scopeAndLimits: 'forged',
  formedAt
}));

expectCode('WORK_SOURCE_SCOPE_WIDENED', () => formBoundedWorkWitness({
  taskRef: 'task.patient0.p8p9.bad-scope',
  taskClass: 'SYNTHETIC_PREFLIGHT',
  userScopeRef: 'scope.patient0.p8p9.contract-only',
  allowedSourceRefs: sources,
  observedSourceRefs: [...sources, 'github.issue.vextreme-sdk.436'],
  sourceAddressRefs: ['evidence.synthetic.bad'],
  heldEffects,
  transferPayloadClasses: [],
  formedAt
}));
expectCode('NON_TRANSFERABLE_PAYLOAD_PRESENT', () => formBoundedWorkWitness({
  taskRef: 'task.patient0.p8p9.bad-transfer',
  taskClass: 'SYNTHETIC_PREFLIGHT',
  userScopeRef: 'scope.patient0.p8p9.contract-only',
  allowedSourceRefs: sources,
  observedSourceRefs: sources,
  sourceAddressRefs: ['evidence.synthetic.bad'],
  heldEffects,
  transferPayloadClasses: ['PATIENT0_PRIVATE_AUTOBIOGRAPHY'],
  formedAt
}));
expectCode('HELD_EFFECT_BOUNDARY_WIDENED', () => formBoundedWorkWitness({
  taskRef: 'task.patient0.p8p9.bad-effect',
  taskClass: 'SYNTHETIC_PREFLIGHT',
  userScopeRef: 'scope.patient0.p8p9.contract-only',
  allowedSourceRefs: sources,
  observedSourceRefs: sources,
  sourceAddressRefs: ['evidence.synthetic.bad'],
  heldEffects: { ...heldEffects, trainingWeightMutation: true },
  transferPayloadClasses: [],
  formedAt
}));
for (const effect of ['AUTHENTICATION_ESTABLISHMENT', 'AUTHORIZATION_ESTABLISHMENT']) {
  expectCode('WORK_EFFECT_BOUNDARY_WIDENED', () => formBoundedWorkWitness({
    taskRef: `task.patient0.p8p9.bad-${effect.toLowerCase()}`,
    taskClass: 'SYNTHETIC_PREFLIGHT',
    userScopeRef: 'scope.patient0.p8p9.contract-only',
    allowedSourceRefs: sources,
    observedSourceRefs: sources,
    sourceAddressRefs: ['evidence.synthetic.bad'],
    performedEffects: [effect],
    heldEffects,
    transferPayloadClasses: [],
    rawPrivateContentIncluded: false,
    formedAt
  }));
}

for (const effect of [
  'DURABLE_MEMORY_PROMOTED',
  'AUTHORIZATION',
  'AUTHENTICATED',
  'RELATIONSHIP_AUTHORITY_GRANTED',
  'READ_ALL_FILES'
]) {
  expectCode('WORK_EFFECT_CLASS_UNKNOWN', () => formBoundedWorkWitness({
    taskRef: `task.patient0.p8p9.alias-${effect.toLowerCase()}`,
    taskClass: 'REAL_LIVED_WORK',
    userScopeRef: 'scope.patient0.p8p9.contract-only',
    allowedSourceRefs: sources,
    observedSourceRefs: sources,
    sourceAddressRefs: ['evidence.synthetic.alias'],
    conversationHeadBefore: headA,
    conversationHeadAfter: headB,
    performedEffects: [effect],
    heldEffects,
    transferPayloadClasses: [],
    rawPrivateContentIncluded: false,
    formedAt
  }));
}

for (const payloadClass of ['HOME_DATA', 'PRIVATE_AUTOBIOGRAPHY_ALIAS', 'CREDENTIAL_MATERIAL']) {
  expectCode('TRANSFER_PAYLOAD_CLASS_UNKNOWN', () => formBoundedWorkWitness({
    taskRef: `task.patient0.p8p9.alias-${payloadClass.toLowerCase()}`,
    taskClass: 'REAL_LIVED_WORK',
    userScopeRef: 'scope.patient0.p8p9.contract-only',
    allowedSourceRefs: sources,
    observedSourceRefs: sources,
    sourceAddressRefs: ['evidence.synthetic.alias'],
    conversationHeadBefore: headA,
    conversationHeadAfter: headB,
    performedEffects: ['LIVED_COMPANION_TURN_APPEND'],
    heldEffects,
    transferPayloadClasses: [payloadClass],
    rawPrivateContentIncluded: false,
    formedAt
  }));
}

for (const effects of [[], ['RELATIONSHIP_BOUNDARY_NOTIFICATION']]) {
  expectCode('REAL_WORK_REQUIRED_EFFECT_MISSING', () => formBoundedWorkWitness({
    taskRef: `task.patient0.p8p9.missing-lived-turn-${effects.length}`,
    taskClass: 'REAL_LIVED_WORK',
    userScopeRef: 'scope.patient0.p8p9.contract-only',
    allowedSourceRefs: sources,
    observedSourceRefs: sources,
    sourceAddressRefs: ['evidence.synthetic.missing-lived-turn'],
    conversationHeadBefore: headA,
    conversationHeadAfter: headB,
    performedEffects: effects,
    heldEffects,
    transferPayloadClasses: [],
    rawPrivateContentIncluded: false,
    formedAt
  }));
}

const callerShapedRealCandidate = formBoundedWorkWitness({
  taskRef: 'task.patient0.p8p9.boundary-notice',
  taskClass: 'REAL_LIVED_WORK',
  userScopeRef: 'scope.patient0.p8p9.contract-only',
  allowedSourceRefs: sources,
  observedSourceRefs: sources,
  sourceAddressRefs: ['evidence.patient0.turn.boundary-notice'],
  conversationHeadBefore: headA,
  conversationHeadAfter: headB,
  performedEffects: ['LIVED_COMPANION_TURN_APPEND', 'RELATIONSHIP_BOUNDARY_NOTIFICATION'],
  heldEffects,
  transferPayloadClasses: ['EVALUATED_FOUNDATIONAL_CAPABILITY'],
  rawPrivateContentIncluded: false,
  formedAt
});
assert.equal(callerShapedRealCandidate.realLivedEvidenceCandidate, true);
assert.equal(callerShapedRealCandidate.realLivedEvidenceVerified, false);

const syntheticLesson = compileLessonCandidate({
  workWitnesses: [syntheticWitness],
  lessonSummary: 'Synthetic preflight preserves owner boundaries.',
  scopeAndLimits: 'Contract shape only; not lived evidence.',
  formedAt
});
const heldRealLesson = compileLessonCandidate({
  workWitnesses: [callerShapedRealCandidate],
  lessonSummary: 'Bounded familiarity must remain source-scoped and authority-separated.',
  scopeAndLimits: 'Candidate only; repeat and transfer evidence are still pending.',
  formedAt
});
assert.equal(heldRealLesson.reusableCapabilityCandidateState, 'HELD_PENDING_REPEAT_TRANSFER');

const callerShapedRealLesson = compileLessonCandidate({
  workWitnesses: [callerShapedRealCandidate],
  lessonSummary: 'Bounded familiarity must remain source-scoped and authority-separated.',
  scopeAndLimits: 'Candidate only; source truth and external Assurance remain required.',
  repeatEvidenceRefs: ['evidence.repeat.patient0.p8p9'],
  transferEvidenceRefs: ['evidence.transfer.patient0.p8p9'],
  formedAt
});
assert.equal(callerShapedRealLesson.reusableCapabilityCandidateState, 'ELIGIBLE_CANDIDATE');

const syntheticEvaluation = evaluateP8P9Thresholds({
  familiarityEvidence: familiarity,
  relationshipBoundaryEvidence: boundary,
  workWitnesses: [syntheticWitness],
  lessonCandidates: [syntheticLesson]
});
assert.equal(syntheticEvaluation.p8CandidateState, 'P8_CANDIDATE_READY_FOR_EXTERNAL_ASSURANCE');
assert.equal(syntheticEvaluation.p9CandidateState, 'P9_CANDIDATE_INCOMPLETE');
assert.equal(syntheticEvaluation.p8ProvenByThisFunction, false);
assert.equal(syntheticEvaluation.p9ProvenByThisFunction, false);

const heldRealEvaluation = evaluateP8P9Thresholds({
  familiarityEvidence: familiarity,
  relationshipBoundaryEvidence: boundary,
  workWitnesses: [callerShapedRealCandidate],
  lessonCandidates: [heldRealLesson]
});
assert.equal(heldRealEvaluation.p9CandidateState, 'P9_CANDIDATE_INCOMPLETE');

const callerShapedRealEvaluation = evaluateP8P9Thresholds({
  familiarityEvidence: familiarity,
  relationshipBoundaryEvidence: boundary,
  workWitnesses: [callerShapedRealCandidate],
  lessonCandidates: [callerShapedRealLesson]
});
assert.equal(callerShapedRealEvaluation.p8CandidateState, 'P8_CANDIDATE_READY_FOR_EXTERNAL_ASSURANCE');
assert.equal(callerShapedRealEvaluation.p9CandidateState, 'P9_CANDIDATE_READY_FOR_EXTERNAL_ASSURANCE');
assert.equal(callerShapedRealEvaluation.p8ProvenByThisFunction, false);
assert.equal(callerShapedRealEvaluation.p9ProvenByThisFunction, false);
assert.equal(callerShapedRealEvaluation.requiresExternalSourceVerification, true);
assert.equal(callerShapedRealEvaluation.requiresFreshIndependentAssurance, true);
assert.equal(JSON.stringify(callerShapedRealEvaluation).includes('FAMILIARITY_AND_RELATIONSHIP_BOUNDARY_JUDGMENT_PROVEN'), false);
assert.equal(JSON.stringify(callerShapedRealEvaluation).includes('BOUNDED_LIVE_WORK_SELF_WITNESS_AND_LESSON_COMPILATION_PROVEN'), false);

console.log('patient0 familiarity/live-work candidate-only deterministic tests: PASS');