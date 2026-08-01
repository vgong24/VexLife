import { semanticHash } from './utils.mjs';

const ACCEPTED_DISPOSITIONS = new Set([
  'ACCEPTED_LOCAL_LESSON',
  'ACCEPTED_SCORE_RECORD',
  'ACCEPTED_FAMILY_CANDIDATE',
  'ACCEPTED_TRAINING_EXAMPLE'
]);

export function formDreamCandidate({
  sourceLineageRef,
  sourceRangeRefs,
  candidateType,
  summary,
  proposedScope = 'DEVICE_PRIVATE',
  visibility = 'PRIVATE',
  consentState = 'PENDING',
  formedByRef,
  formedAt = new Date().toISOString()
}) {
  if (!sourceLineageRef || !formedByRef) throw new Error('sourceLineageRef and formedByRef are required');
  if (!Array.isArray(sourceRangeRefs) || sourceRangeRefs.length === 0) throw new Error('sourceRangeRefs are required');
  if (!candidateType || !summary) throw new Error('candidateType and summary are required');
  const core = {
    schemaVersion: 'vexlife.dream-candidate/v0',
    sourceLineageRef,
    sourceRangeRefs: [...new Set(sourceRangeRefs)],
    candidateType,
    summary,
    proposedScope,
    visibility,
    consentState,
    formedByRef,
    formedAt,
    state: 'CANDIDATE_UNREVIEWED'
  };
  const contentHash = semanticHash(core);
  return { ...core, candidateRef: `dream-candidate.${contentHash.slice(0, 24)}`, contentHash };
}

export function reviewDreamCandidate(candidate, {
  reviewerRef,
  privacyState,
  contradictionState,
  disposition,
  acceptedScope = null,
  rejectionReason = null,
  supersedesRef = null,
  reviewedAt = new Date().toISOString()
}) {
  if (!reviewerRef || !privacyState || !contradictionState || !disposition) throw new Error('complete review fields are required');
  const accepted = ACCEPTED_DISPOSITIONS.has(disposition);
  if (accepted && privacyState !== 'PASS') throw new Error('accepted Dream candidate requires privacy PASS');
  if (accepted && candidate.consentState !== 'ACCEPTED') throw new Error('accepted Dream candidate requires accepted consent');
  if (accepted && contradictionState === 'UNRESOLVED_CONFLICT') throw new Error('accepted Dream candidate cannot retain unresolved conflict');
  if (accepted && !acceptedScope) throw new Error('accepted Dream candidate requires acceptedScope');
  if (!accepted && disposition === 'REJECTED' && !rejectionReason) throw new Error('rejected Dream candidate requires reason');
  const review = {
    schemaVersion: 'vexlife.dream-review/v0',
    candidateRef: candidate.candidateRef,
    reviewerRef,
    privacyState,
    contradictionState,
    disposition,
    acceptedScope,
    rejectionReason,
    supersedesRef,
    reviewedAt
  };
  const reviewHash = semanticHash(review);
  const acceptedRecordRef = accepted ? `accepted-evolution-record.${reviewHash.slice(0, 24)}` : null;
  return { ...review, reviewRef: `dream-review.${reviewHash.slice(0, 24)}`, reviewHash, acceptedRecordRef };
}

export function createFamilySyncEnvelope({ candidate, review, familyRef, targetLineageRefs = [], formedAt = new Date().toISOString() }) {
  if (review.candidateRef !== candidate.candidateRef) throw new Error('review does not bind candidate');
  if (!['ACCEPTED_FAMILY_CANDIDATE', 'ACCEPTED_SCORE_RECORD'].includes(review.disposition)) throw new Error('candidate is not family-sync eligible');
  if (!['GLOBAL_FAMILY', 'PROJECT_SHARED', 'WORKSPACE_SHARED'].includes(review.acceptedScope)) throw new Error('accepted scope is not family-sync eligible');
  const core = {
    schemaVersion: 'vexlife.family-evolution-sync-envelope/v0',
    familyRef,
    sourceLineageRef: candidate.sourceLineageRef,
    targetLineageRefs: [...new Set(targetLineageRefs)].filter((ref) => ref !== candidate.sourceLineageRef),
    candidateRef: candidate.candidateRef,
    reviewRef: review.reviewRef,
    acceptedRecordRef: review.acceptedRecordRef,
    acceptedScope: review.acceptedScope,
    sourceRangeRefs: candidate.sourceRangeRefs,
    summary: candidate.summary,
    formedAt,
    attributionRule: 'SIBLING_SOURCE_REMAINS_VISIBLE'
  };
  const contentHash = semanticHash(core);
  return { ...core, envelopeRef: `family-evolution-envelope.${contentHash.slice(0, 24)}`, contentHash };
}

export function receiveSiblingEvolution(envelope, { targetLineageRef, receivedAt = new Date().toISOString() }) {
  if (!envelope.targetLineageRefs.includes(targetLineageRef)) throw new Error('target lineage not admitted by envelope');
  return {
    schemaVersion: 'vexlife.sibling-evolution-candidate/v0',
    siblingCandidateRef: `sibling-candidate.${semanticHash({ envelopeRef: envelope.envelopeRef, targetLineageRef }).slice(0, 24)}`,
    envelopeRef: envelope.envelopeRef,
    sourceLineageRef: envelope.sourceLineageRef,
    targetLineageRef,
    summary: envelope.summary,
    acceptedScope: envelope.acceptedScope,
    state: 'OBSERVE_ONLY_PENDING_LOCAL_DECISION',
    livedByTargetLineage: false,
    receivedAt
  };
}

export function evaluateTrainingAdmission({ examples = [], evaluationManifestRef, privacyReceiptRefs = [], resourceLeaseRef, activationRequested = false }) {
  const invalid = examples.filter((example) => example.disposition !== 'ACCEPTED_TRAINING_EXAMPLE' || !example.acceptedRecordRef);
  if (invalid.length) return { state: 'BLOCKED_UNREVIEWED_EXAMPLES', invalidRefs: invalid.map((item) => item.candidateRef) };
  if (!evaluationManifestRef) return { state: 'BLOCKED_MISSING_EVALUATION_MANIFEST' };
  if (privacyReceiptRefs.length !== examples.length) return { state: 'BLOCKED_PRIVACY_RECEIPT_COVERAGE' };
  if (!resourceLeaseRef) return { state: 'BLOCKED_RESOURCE_LEASE' };
  if (activationRequested) return { state: 'BLOCKED_TRAINING_DOES_NOT_GRANT_ACTIVATION' };
  const core = {
    schemaVersion: 'vexlife.adapter-training-admission/v0',
    exampleRefs: examples.map((item) => item.acceptedRecordRef),
    evaluationManifestRef,
    privacyReceiptRefs: [...privacyReceiptRefs],
    resourceLeaseRef,
    outputState: 'CANDIDATE_TRAINING_ADMITTED_ACCEPTED_INACTIVE_ONLY'
  };
  return { state: 'TRAINING_ADMISSION_READY', admission: { ...core, admissionRef: `training-admission.${semanticHash(core).slice(0, 24)}` } };
}

export * from './burden-release.mjs';
export * from './continuity-evolution-router.mjs';

// [VXG RealForever]
