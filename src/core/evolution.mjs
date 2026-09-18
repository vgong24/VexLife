import { semanticHash } from './utils.mjs';

const LEGACY_ACCEPTED_DISPOSITIONS = new Set([
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
    state: 'COMPATIBILITY_CANDIDATE_ONLY',
    durableAcceptanceAllowed: false,
    familySynchronizationAllowed: false,
    trainingAdmissionAllowed: false,
    modelActivationAllowed: false,
    requiredNextMembrane: 'contract.vexlife.continuity-context-review/v1'
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
  const accepted = LEGACY_ACCEPTED_DISPOSITIONS.has(disposition);
  if (accepted) throw new Error('legacy Dream v0 is compatibility-candidate-only and cannot create durable acceptance');
  if (disposition === 'REJECTED' && !rejectionReason) throw new Error('rejected Dream candidate requires reason');
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
  return {
    ...review,
    reviewRef: `dream-review.${reviewHash.slice(0, 24)}`,
    reviewHash,
    acceptedRecordRef: null,
    durableAcceptanceAllowed: false,
    requiredNextMembrane: 'contract.vexlife.continuity-context-review/v1'
  };
}

export function createFamilySyncEnvelope({ candidate, review, familyRef, targetLineageRefs = [], formedAt = new Date().toISOString() }) {
  void candidate; void review; void familyRef; void targetLineageRefs; void formedAt;
  throw new Error('legacy Dream v0 cannot create family synchronization; use the reviewed continuity synchronization membrane');
}

export function receiveSiblingEvolution(envelope, { targetLineageRef, receivedAt = new Date().toISOString() }) {
  void envelope; void targetLineageRef; void receivedAt;
  throw new Error('legacy Dream v0 sibling receive is closed; use an exact reviewed sibling continuity projection');
}

export function evaluateTrainingAdmission({ examples = [], evaluationManifestRef, privacyReceiptRefs = [], resourceLeaseRef, activationRequested = false }) {
  if (examples.some((example) => example?.schemaVersion?.startsWith('vexlife.dream-') || example?.disposition)) {
    return { state: 'BLOCKED_LEGACY_COMPATIBILITY_PATH' };
  }
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
