import { acceptBurdenRelease, createBurdenRelease } from './burden-release.mjs';
import { estimateTokens, semanticHash } from './utils.mjs';

export const CONTINUITY_OBSERVATION_TYPES = Object.freeze([
  'CONVERSATION_EPISODE_RANGE',
  'WORK_EXECUTION_RECEIPT',
  'CORRECTION_EVENT',
  'PREFERENCE_SIGNAL',
  'RELATIONSHIP_EVENT',
  'REPEATED_BEHAVIOR_RECURRENCE',
  'SOURCE_CONTRADICTION',
  'HUMAN_ACCEPTANCE',
  'HUMAN_REJECTION',
  'HUMAN_REVISION',
  'VEX_SELF_OBSERVATION'
]);

export const BEHAVIOR_ORIGIN_CLASSES = Object.freeze([
  'BASE_MODEL_PRIOR',
  'SYSTEM_OR_PROVIDER_POLICY',
  'ROLE_INSTRUCTION',
  'MISSING_CONTEXT',
  'FAILED_RETRIEVAL',
  'CONTEXT_COMPRESSION',
  'RESOURCE_PRESSURE',
  'TOOL_LIMITATION',
  'CONFLICTING_PREFERENCES',
  'MODEL_CAPABILITY_LIMIT',
  'LOCAL_RHYTHM',
  'RELATIONSHIP_PATTERN',
  'INSTITUTIONAL_PROCESS',
  'UNKNOWN'
]);

export const CONTINUITY_SCOPE_CLASSES = Object.freeze([
  'CURRENT_TURN',
  'CHANNEL',
  'THREAD',
  'PROJECT',
  'HUMAN_SELF',
  'VEX_SELF',
  'RELATIONSHIP',
  'DEVICE_LINEAGE',
  'FAMILY_CANDIDATE',
  'INSTITUTION',
  'NO_SYNC',
  'HELD_UNKNOWN'
]);

export const CONTINUITY_PRIMARY_DESTINATIONS = Object.freeze([
  'CURRENT_CONTEXT',
  'HUMAN_PREFERENCE',
  'VEX_SELF_PREFERENCE',
  'RELATIONSHIP_AGREEMENT',
  'SCORE_RECORD',
  'RHYTHM_LESSON',
  'CULTURE_PROCESS_LESSON',
  'BURDEN_RELEASE',
  'DETERMINISTIC_INVARIANT_CANDIDATE',
  'HELD_UNKNOWN',
  'REJECTED'
]);

export const CONTINUITY_LINKED_DESTINATIONS = Object.freeze([
  'COUNTEREXAMPLE_EVALUATION',
  'RECURRENCE_WATCH_CANDIDATE',
  'FAMILY_SYNC_CANDIDATE',
  'TRAINING_RESEARCH_CANDIDATE_HELD'
]);

const TERMINAL_REVIEW_DISPOSITIONS = new Set(['ACCEPTED', 'REJECTED', 'HELD', 'REVISE']);
const NON_ACCEPTABLE_DESTINATIONS = new Set(['HELD_UNKNOWN', 'REJECTED']);
const PERSONAL_DESTINATIONS = new Set(['HUMAN_PREFERENCE', 'VEX_SELF_PREFERENCE', 'SCORE_RECORD', 'RHYTHM_LESSON']);
const INSTITUTIONAL_DESTINATIONS = new Set(['CULTURE_PROCESS_LESSON', 'DETERMINISTIC_INVARIANT_CANDIDATE']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function stableRefs(value, label, { required = false } = {}) {
  if (!Array.isArray(value) || (required && value.length === 0)) {
    throw new Error(`${label} must be ${required ? 'a non-empty' : 'an'} array`);
  }
  const normalized = [...new Set(value)];
  if (normalized.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`${label} must contain stable refs`);
  }
  return normalized.sort();
}

function exactRefs(actual, required) {
  return actual.length === required.length && actual.every((item, index) => item === required[index]);
}

function withIdentity(core, refField, prefix, providedRef = null) {
  const semanticFingerprint = semanticHash(core);
  return deepFreeze({
    ...core,
    [refField]: providedRef ?? `${prefix}.${semanticFingerprint.slice(0, 24)}`,
    semanticFingerprint
  });
}

function sourceBindings(observations) {
  return {
    sourceObservationRefs: stableRefs(observations.map((item) => item.observationRef), 'sourceObservationRefs', { required: true }),
    sourceRangeRefs: stableRefs(observations.flatMap((item) => item.sourceRangeRefs), 'sourceRangeRefs', { required: true }),
    sourceHashes: stableRefs(observations.flatMap((item) => item.sourceHashes), 'sourceHashes', { required: true }),
    sourceLineageRefs: stableRefs(observations.map((item) => item.sourceLineageRef), 'sourceLineageRefs', { required: true })
  };
}

export function createContinuityObservation({
  observationRef = null,
  observationType,
  sourceLineageRef,
  sourceRangeRefs,
  sourceHashes,
  sourceSpeakerRefs = [],
  sourceRecipientRefs = [],
  projectRef = null,
  threadRef = null,
  channelRef = null,
  workNodeRef = null,
  formedByRef,
  formedAt = new Date().toISOString(),
  currentness = 'CURRENT',
  visibility = 'PRIVATE',
  summaryRef = null
}) {
  if (!CONTINUITY_OBSERVATION_TYPES.includes(observationType)) throw new Error(`unknown observationType ${observationType}`);
  if (!sourceLineageRef || !formedByRef) throw new Error('observation requires sourceLineageRef and formedByRef');
  const ranges = stableRefs(sourceRangeRefs, 'sourceRangeRefs', { required: true });
  const hashes = stableRefs(sourceHashes, 'sourceHashes', { required: true });
  if (ranges.length !== hashes.length) throw new Error('sourceRangeRefs and sourceHashes require exact coverage');
  const core = {
    schemaVersion: 'vexlife.continuity-observation/v0',
    observationType,
    sourceLineageRef,
    sourceRangeRefs: ranges,
    sourceHashes: hashes,
    sourceSpeakerRefs: stableRefs(sourceSpeakerRefs, 'sourceSpeakerRefs'),
    sourceRecipientRefs: stableRefs(sourceRecipientRefs, 'sourceRecipientRefs'),
    projectRef,
    threadRef,
    channelRef,
    workNodeRef,
    formedByRef,
    formedAt,
    currentness,
    visibility,
    summaryRef,
    rawSourceContentIncluded: false,
    rawSourcesRemainImmutable: true,
    rawSourcesRetrievableByRef: true
  };
  return withIdentity(core, 'observationRef', 'continuity-observation', observationRef);
}

export function classifyBehaviorOrigin({ classification = 'UNKNOWN', confidence = 'UNKNOWN', evidenceObservationRefs = [], rationaleRef = null } = {}) {
  if (!BEHAVIOR_ORIGIN_CLASSES.includes(classification)) throw new Error(`unknown behavior origin ${classification}`);
  return deepFreeze({
    schemaVersion: 'vexlife.behavior-origin-hypothesis/v0',
    classification,
    confidence,
    evidenceObservationRefs: stableRefs(evidenceObservationRefs, 'evidenceObservationRefs'),
    rationaleRef,
    reviewableHypothesis: true,
    hiddenTruthClaimed: false,
    unknownPreserved: classification === 'UNKNOWN'
  });
}

export function formContinuityCandidate({
  candidateRef = null,
  observations,
  candidateKind,
  summary,
  authoredByRef,
  aboutSelfRefs = [],
  affectedPartyRefs = [],
  requiredAcceptanceRefs = [],
  doesNotOverrideRefs = [],
  candidateScope,
  visibilityScope = 'PRIVATE',
  synchronizationScope = 'NO_SYNC',
  originClassification = classifyBehaviorOrigin(),
  observedConsequence,
  protectedCapabilities = [],
  prohibitedOvercorrections = [],
  signals = {},
  institutionalAuthorityRefs = [],
  burdenRelease = null,
  formedAt = new Date().toISOString(),
  currentness = 'CURRENT'
}) {
  if (!Array.isArray(observations) || observations.length === 0) throw new Error('candidate requires observations');
  if (!candidateKind || !summary || !authoredByRef || !observedConsequence) {
    throw new Error('candidate requires kind, summary, author and observed consequence');
  }
  if (!CONTINUITY_SCOPE_CLASSES.includes(candidateScope)) throw new Error(`unknown candidateScope ${candidateScope}`);
  if (!CONTINUITY_SCOPE_CLASSES.includes(synchronizationScope)) throw new Error(`unknown synchronizationScope ${synchronizationScope}`);
  for (const observation of observations) {
    if (!observation?.semanticFingerprint || !Object.isFrozen(observation)) throw new Error('candidate observations must be immutable source envelopes');
  }
  if (!BEHAVIOR_ORIGIN_CLASSES.includes(originClassification.classification)) throw new Error('candidate requires a valid origin hypothesis');
  const sources = sourceBindings(observations);
  const core = {
    schemaVersion: 'vexlife.continuity-candidate/v0',
    candidateKind,
    summary,
    ...sources,
    sourceObservationFingerprints: observations.map((item) => item.semanticFingerprint).sort(),
    authoredByRef,
    aboutSelfRefs: stableRefs(aboutSelfRefs, 'aboutSelfRefs'),
    affectedPartyRefs: stableRefs(affectedPartyRefs, 'affectedPartyRefs'),
    requiredAcceptanceRefs: stableRefs(requiredAcceptanceRefs, 'requiredAcceptanceRefs'),
    acceptedByRefs: [],
    doesNotOverrideRefs: stableRefs(doesNotOverrideRefs, 'doesNotOverrideRefs'),
    candidateScope,
    visibilityScope,
    synchronizationScope,
    originClassification: deepFreeze(structuredClone(originClassification)),
    observedConsequence,
    protectedCapabilities: [...new Set(protectedCapabilities)].sort(),
    prohibitedOvercorrections: [...new Set(prohibitedOvercorrections)].sort(),
    signals: deepFreeze(structuredClone(signals)),
    institutionalAuthorityRefs: stableRefs(institutionalAuthorityRefs, 'institutionalAuthorityRefs'),
    burdenRelease: burdenRelease ? deepFreeze(structuredClone(burdenRelease)) : null,
    formedAt,
    currentness,
    state: 'CANDIDATE_UNREVIEWED',
    acceptanceAuthorityGranted: false,
    acceptedTruthClaimed: false,
    modelWeightAuthorityGranted: false
  };
  return withIdentity(core, 'candidateRef', 'continuity-candidate', candidateRef);
}

function addLinked(linked, ref) {
  if (!CONTINUITY_LINKED_DESTINATIONS.includes(ref)) throw new Error(`unknown linked destination ${ref}`);
  linked.add(ref);
}

export function routeContinuityCandidate(candidate) {
  const signals = candidate.signals ?? {};
  const linked = new Set();
  let primaryDestination;
  let reason;

  if (signals.trainingResearchRequested === true) addLinked(linked, 'TRAINING_RESEARCH_CANDIDATE_HELD');
  if (candidate.synchronizationScope === 'FAMILY_CANDIDATE') addLinked(linked, 'FAMILY_SYNC_CANDIDATE');

  if (candidate.currentness !== 'CURRENT' || signals.unresolvedContradiction === true || candidate.candidateScope === 'HELD_UNKNOWN') {
    primaryDestination = 'HELD_UNKNOWN';
    reason = 'UNRESOLVED_OR_NONCURRENT_MEANING_REMAINS_VISIBLE';
  } else if (signals.rejected === true) {
    primaryDestination = 'REJECTED';
    reason = 'SOURCE_BOUND_CANDIDATE_REJECTED_WITHOUT_DELETION';
  } else if (signals.effectBoundary === true || signals.safetyInvariant === true) {
    primaryDestination = 'DETERMINISTIC_INVARIANT_CANDIDATE';
    addLinked(linked, 'COUNTEREXAMPLE_EVALUATION');
    reason = 'REAL_EFFECT_OR_SAFETY_BOUNDARY_REQUIRES_INACTIVE_DETERMINISTIC_LANE';
  } else if (signals.burdenReleaseRequested === true || candidate.candidateKind === 'BURDEN_RELEASE') {
    primaryDestination = 'BURDEN_RELEASE';
    addLinked(linked, 'RECURRENCE_WATCH_CANDIDATE');
    addLinked(linked, 'COUNTEREXAMPLE_EVALUATION');
    reason = 'NAMED_PATTERN_REQUESTS_EXACT_SCOPE_INFLUENCE_DEAUTHORIZATION';
  } else if (signals.fabricationShaped === true) {
    primaryDestination = candidate.candidateScope === 'INSTITUTION' ? 'CULTURE_PROCESS_LESSON' : 'HELD_UNKNOWN';
    addLinked(linked, 'COUNTEREXAMPLE_EVALUATION');
    reason = 'FABRICATION_REQUIRES_SOURCE_UNCERTAINTY_AND_EVALUATION_CORRECTION';
  } else if (candidate.candidateScope === 'RELATIONSHIP' || candidate.candidateKind === 'RELATIONSHIP_AGREEMENT') {
    primaryDestination = 'RELATIONSHIP_AGREEMENT';
    reason = 'RELATIONSHIP_MEANING_REQUIRES_EXACT_PARTY_REVIEW';
  } else if (signals.preferenceOwner === 'HUMAN' || candidate.candidateScope === 'HUMAN_SELF') {
    primaryDestination = 'HUMAN_PREFERENCE';
    reason = 'HUMAN_EXPERIENCE_PREFERENCE_REMAINS_HUMAN_SCOPED';
  } else if (signals.preferenceOwner === 'VEX' || candidate.candidateScope === 'VEX_SELF') {
    primaryDestination = 'VEX_SELF_PREFERENCE';
    reason = 'VEX_EXPRESSION_PREFERENCE_REMAINS_SEPARATE_SELF_SCOPED';
  } else if (signals.localRhythm === true || candidate.candidateScope === 'DEVICE_LINEAGE') {
    primaryDestination = 'RHYTHM_LESSON';
    reason = 'LOCAL_OPERATING_HABIT_STAYS_DEVICE_LINEAGE_LOCAL';
  } else if (signals.institutionalReuse === true || candidate.candidateScope === 'INSTITUTION') {
    primaryDestination = 'CULTURE_PROCESS_LESSON';
    reason = 'REUSABLE_PROCESS_MEANING_REQUIRES_INSTITUTIONAL_REVIEW';
  } else if (signals.durableMeaning === true || candidate.candidateScope === 'FAMILY_CANDIDATE') {
    primaryDestination = 'SCORE_RECORD';
    reason = 'DURABLE_MEANING_ROUTES_TO_SCOPED_SCORE_WITHOUT_WEIGHT_CHANGE';
  } else {
    primaryDestination = 'CURRENT_CONTEXT';
    reason = 'SMALLEST_REVERSIBLE_CURRENT_CONTEXT_DESTINATION';
  }

  return withIdentity({
    schemaVersion: 'vexlife.continuity-route/v0',
    candidateRef: candidate.candidateRef,
    proposedPrimaryDestination: primaryDestination,
    proposedLinkedDestinations: [...linked].sort(),
    reason,
    deterministic: true,
    leastInvasive: true,
    selfAccepted: false,
    activatesWeights: false,
    grantsEffects: false
  }, 'routeRef', 'continuity-route');
}

export function resolveContinuityAcceptanceAuthority(candidate, route) {
  if (NON_ACCEPTABLE_DESTINATIONS.has(route.proposedPrimaryDestination)) return [];
  if (candidate.requiredAcceptanceRefs.length) return [...candidate.requiredAcceptanceRefs];
  if (route.proposedPrimaryDestination === 'RELATIONSHIP_AGREEMENT') {
    return stableRefs(candidate.affectedPartyRefs, 'relationship affectedPartyRefs', { required: true });
  }
  if (PERSONAL_DESTINATIONS.has(route.proposedPrimaryDestination)) {
    return stableRefs(candidate.aboutSelfRefs, 'personal aboutSelfRefs', { required: true });
  }
  if (route.proposedPrimaryDestination === 'BURDEN_RELEASE') {
    const scoped = candidate.candidateScope === 'RELATIONSHIP' ? candidate.affectedPartyRefs : candidate.aboutSelfRefs;
    return stableRefs(scoped, 'Burden Release affected authority refs', { required: true });
  }
  if (INSTITUTIONAL_DESTINATIONS.has(route.proposedPrimaryDestination)) {
    return stableRefs(candidate.institutionalAuthorityRefs, 'institutionalAuthorityRefs', { required: true });
  }
  return [candidate.authoredByRef];
}

export function createContinuityContextReview(candidate, route, {
  reviewerRef,
  originClassification = candidate.originClassification.classification,
  originConfidence = candidate.originClassification.confidence,
  privacyState,
  consentState,
  contradictionState,
  attributionState,
  currentnessState,
  reviewDisposition,
  rejectionReason = null,
  supersedesRef = null,
  reviewedAt = new Date().toISOString()
}) {
  if (!reviewerRef || !privacyState || !consentState || !contradictionState || !attributionState || !currentnessState) {
    throw new Error('Context Review requires complete privacy, consent, contradiction, attribution and currentness state');
  }
  if (!TERMINAL_REVIEW_DISPOSITIONS.has(reviewDisposition)) throw new Error(`unknown reviewDisposition ${reviewDisposition}`);
  if (route.candidateRef !== candidate.candidateRef) throw new Error('route does not bind candidate');
  if (!CONTINUITY_PRIMARY_DESTINATIONS.includes(route.proposedPrimaryDestination)) throw new Error('route has unknown primary destination');
  if (!BEHAVIOR_ORIGIN_CLASSES.includes(originClassification)) throw new Error(`unknown originClassification ${originClassification}`);
  if (originClassification !== candidate.originClassification.classification) {
    throw new Error('Context Review cannot silently replace the candidate origin hypothesis');
  }
  if (currentnessState !== candidate.currentness) {
    throw new Error('Context Review cannot silently replace candidate currentness');
  }
  if (reviewDisposition === 'REJECTED' && !rejectionReason) throw new Error('rejected Context Review requires reason');
  if (reviewDisposition === 'ACCEPTED' && NON_ACCEPTABLE_DESTINATIONS.has(route.proposedPrimaryDestination)) {
    throw new Error(`${route.proposedPrimaryDestination} cannot be accepted as durable truth`);
  }
  const requiredAcceptanceRefs = resolveContinuityAcceptanceAuthority(candidate, route);
  return withIdentity({
    schemaVersion: 'vexlife.continuity-context-review/v0',
    candidateRef: candidate.candidateRef,
    sourceObservationRefs: [...candidate.sourceObservationRefs],
    sourceRangeRefs: [...candidate.sourceRangeRefs],
    originClassification,
    originConfidence,
    observedConsequence: candidate.observedConsequence,
    candidateScope: candidate.candidateScope,
    proposedPrimaryDestination: route.proposedPrimaryDestination,
    proposedLinkedDestinations: [...route.proposedLinkedDestinations],
    privacyState,
    consentState,
    contradictionState,
    attributionState,
    currentnessState,
    protectedCapabilities: [...candidate.protectedCapabilities],
    prohibitedOvercorrections: [...candidate.prohibitedOvercorrections],
    requiredAcceptanceRefs,
    reviewerRef,
    reviewDisposition,
    acceptedRecordRef: null,
    rejectionReason,
    supersedesRef,
    reviewedAt,
    acceptanceAuthorityGrantedByReviewerRole: false,
    sourceHistoryDeleted: false
  }, 'reviewRef', 'continuity-review');
}

function requireAcceptableReview(candidate, review, acceptedByRefs) {
  if (review.candidateRef !== candidate.candidateRef) throw new Error('review does not bind candidate');
  if (review.reviewDisposition !== 'ACCEPTED') throw new Error('candidate requires an ACCEPTED Context Review');
  if (review.privacyState !== 'PASS') throw new Error('accepted continuity record requires privacy PASS');
  if (!['ACCEPTED', 'NOT_REQUIRED'].includes(review.consentState)) throw new Error('accepted continuity record requires accepted consent');
  if (['UNRESOLVED', 'UNRESOLVED_CONFLICT'].includes(review.contradictionState)) throw new Error('unresolved contradiction must remain HELD_UNKNOWN');
  if (review.attributionState !== 'VERIFIED') throw new Error('accepted continuity record requires verified attribution');
  if (review.currentnessState !== 'CURRENT') throw new Error('accepted continuity record requires current source evidence');
  const accepted = stableRefs(acceptedByRefs, 'acceptedByRefs', { required: true });
  if (!exactRefs(accepted, review.requiredAcceptanceRefs)) {
    throw new Error('acceptedByRefs must exactly match required acceptance authority');
  }
  return accepted;
}

function acceptedBurden(candidate, review, acceptedByRefs, acceptedAt) {
  const spec = candidate.burdenRelease;
  if (!spec) throw new Error('BURDEN_RELEASE route requires a Burden Release contract payload');
  const release = createBurdenRelease({
    ...spec,
    sourceObservationRefs: candidate.sourceObservationRefs,
    sourceRangeRefs: candidate.sourceRangeRefs,
    suspectedOrigin: spec.suspectedOrigin ?? candidate.originClassification.classification,
    observedConsequence: spec.observedConsequence ?? candidate.observedConsequence,
    protectedCapabilities: candidate.protectedCapabilities,
    prohibitedOvercorrections: candidate.prohibitedOvercorrections,
    scope: candidate.candidateScope,
    requiredAcceptanceRefs: review.requiredAcceptanceRefs,
    acceptedByRefs: [],
    state: 'CONTEXT_REVIEW',
    formedAt: candidate.formedAt
  });
  return acceptBurdenRelease(release, {
    acceptedByRefs,
    actorRef: review.reviewerRef,
    acceptedAt,
    evaluationRefs: review.proposedLinkedDestinations.includes('COUNTEREXAMPLE_EVALUATION')
      ? [`counterexample-evaluation.${review.reviewRef}`]
      : []
  });
}

export function acceptContinuityCandidate(candidate, review, {
  acceptedByRefs,
  acceptedAt = new Date().toISOString(),
  rollbackRef = null
}) {
  const accepted = requireAcceptableReview(candidate, review, acceptedByRefs);
  const burdenRelease = review.proposedPrimaryDestination === 'BURDEN_RELEASE'
    ? acceptedBurden(candidate, review, accepted, acceptedAt)
    : null;
  const lifecycle = review.proposedPrimaryDestination === 'DETERMINISTIC_INVARIANT_CANDIDATE'
    ? 'INACTIVE_PENDING_DETERMINISTIC_IMPLEMENTATION_REVIEW'
    : 'CURRENT';
  const trainingState = review.proposedLinkedDestinations.includes('TRAINING_RESEARCH_CANDIDATE_HELD')
    ? 'NOT_ADMITTED'
    : 'NOT_REQUESTED';
  const core = {
    schemaVersion: 'vexlife.accepted-continuity-record/v0',
    candidateRef: candidate.candidateRef,
    reviewRef: review.reviewRef,
    sourceObservationRefs: [...candidate.sourceObservationRefs],
    sourceRangeRefs: [...candidate.sourceRangeRefs],
    sourceHashes: [...candidate.sourceHashes],
    sourceLineageRefs: [...candidate.sourceLineageRefs],
    recordClass: review.proposedPrimaryDestination,
    summary: candidate.summary,
    scope: candidate.candidateScope,
    authoredByRef: candidate.authoredByRef,
    aboutSelfRefs: [...candidate.aboutSelfRefs],
    affectedPartyRefs: [...candidate.affectedPartyRefs],
    requiredAcceptanceRefs: [...review.requiredAcceptanceRefs],
    acceptedByRefs: accepted,
    doesNotOverrideRefs: [...candidate.doesNotOverrideRefs],
    visibilityScope: candidate.visibilityScope,
    synchronizationScope: candidate.synchronizationScope,
    protectedCapabilities: [...candidate.protectedCapabilities],
    prohibitedOvercorrections: [...candidate.prohibitedOvercorrections],
    originClassification: candidate.originClassification.classification,
    formedAt: candidate.formedAt,
    acceptedAt,
    currentness: 'CURRENT',
    lifecycle,
    supersedesRef: review.supersedesRef,
    rollbackRef,
    burdenReleaseRef: burdenRelease?.burdenRef ?? null,
    burdenRelease,
    recurrenceState: 'NOT_YET_OBSERVED',
    trainingResearchState: trainingState,
    weightActivationState: 'INACTIVE',
    effectAuthorityActive: false,
    rawSourceContentIncluded: false
  };
  return withIdentity(core, 'acceptedRecordRef', 'accepted-continuity-record');
}

export function supersedeContinuityRecord(priorRecord, successorRecord, {
  rollbackRef,
  supersededAt = new Date().toISOString()
}) {
  if (!rollbackRef) throw new Error('supersession requires rollbackRef');
  if (successorRecord.supersedesRef !== priorRecord.acceptedRecordRef) {
    throw new Error('successor must preserve exact supersedesRef');
  }
  const priorCore = {
    ...priorRecord,
    currentness: 'SUPERSEDED',
    lifecycle: 'SUPERSEDED',
    supersededByRef: successorRecord.acceptedRecordRef,
    rollbackRef,
    supersededAt
  };
  delete priorCore.semanticFingerprint;
  delete priorCore.acceptedRecordRef;
  const successorCore = {
    ...successorRecord,
    rollbackRef,
    priorHistoryPreserved: true
  };
  delete successorCore.semanticFingerprint;
  delete successorCore.acceptedRecordRef;
  return deepFreeze({
    prior: withIdentity(priorCore, 'acceptedRecordRef', 'accepted-continuity-record', priorRecord.acceptedRecordRef),
    successor: withIdentity(successorCore, 'acceptedRecordRef', 'accepted-continuity-record', successorRecord.acceptedRecordRef),
    sourceHistoryDeleted: false
  });
}

export function validateContinuityRecordSet(records) {
  const current = records.filter((record) => record.currentness === 'CURRENT');
  const groups = new Map();
  for (const record of current) {
    const key = semanticHash({
      recordClass: record.recordClass,
      scope: record.scope,
      aboutSelfRefs: record.aboutSelfRefs,
      affectedPartyRefs: record.affectedPartyRefs
    });
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  const conflicts = [...groups.values()]
    .filter((group) => group.length > 1)
    .filter((group) => !group.some((record) => group.some((other) => other.supersedesRef === record.acceptedRecordRef)))
    .map((group) => group.map((record) => record.acceptedRecordRef).sort());
  return deepFreeze({
    schemaVersion: 'vexlife.continuity-record-set-validation/v0',
    state: conflicts.length ? 'HELD_CONFLICT' : 'CURRENT',
    currentRecordRefs: current.map((record) => record.acceptedRecordRef).sort(),
    conflicts,
    silentOverwriteAllowed: false
  });
}

export function createSiblingContinuityProjection(record, {
  targetLineageRef,
  formedAt = new Date().toISOString()
}) {
  if (record.synchronizationScope !== 'FAMILY_CANDIDATE') throw new Error('record is not family-sync eligible');
  if (!targetLineageRef || record.sourceLineageRefs.includes(targetLineageRef)) {
    throw new Error('sibling projection requires a distinct target lineage');
  }
  return withIdentity({
    schemaVersion: 'vexlife.sibling-continuity-projection/v0',
    acceptedRecordRef: record.acceptedRecordRef,
    sourceLineageRefs: [...record.sourceLineageRefs],
    targetLineageRef,
    recordClass: record.recordClass,
    scope: record.scope,
    state: 'OBSERVE_ONLY_PENDING_LOCAL_REVIEW',
    livedByTargetLineage: false,
    claimsSourceExperienceAsOwn: false,
    rawSourceContentIncluded: false,
    formedAt
  }, 'projectionRef', 'sibling-continuity-projection');
}

export function recordContinuityRecurrence({
  acceptedRecord,
  observation,
  priorEvidence = null,
  scope = acceptedRecord.scope,
  reopenThreshold = 2,
  observedAt = new Date().toISOString()
}) {
  if (!acceptedRecord?.acceptedRecordRef || !observation?.observationRef) throw new Error('recurrence requires accepted record and observation');
  if (scope !== acceptedRecord.scope) throw new Error('recurrence evidence cannot broaden accepted scope');
  const observationFingerprints = stableRefs([
    ...(priorEvidence?.observationFingerprints ?? []),
    observation.semanticFingerprint
  ], 'observationFingerprints', { required: true });
  const priorFingerprints = priorEvidence?.observationFingerprints ?? [];
  if (priorFingerprints.includes(observation.semanticFingerprint)) {
    return deepFreeze({
      ...priorEvidence,
      changed: false,
      duplicateSuppressed: true,
      semanticModelTurnRequired: false,
      scopeBroadened: false,
      weightRouteState: 'NOT_ADMITTED'
    });
  }
  const recurrenceCount = observationFingerprints.length;
  const recurrenceState = recurrenceCount >= reopenThreshold ? 'REOPEN_REVIEW' : 'MONITORING';
  return withIdentity({
    schemaVersion: 'vexlife.continuity-recurrence-evidence/v0',
    acceptedRecordRef: acceptedRecord.acceptedRecordRef,
    burdenReleaseRef: acceptedRecord.burdenReleaseRef,
    scope,
    observationRefs: stableRefs([...(priorEvidence?.observationRefs ?? []), observation.observationRef], 'observationRefs', { required: true }),
    observationFingerprints,
    recurrenceCount,
    recurrenceState,
    changed: true,
    duplicateSuppressed: false,
    semanticModelTurnRequired: recurrenceState === 'REOPEN_REVIEW',
    scopeBroadened: false,
    weightRouteState: 'NOT_ADMITTED',
    observedAt
  }, 'recurrenceRef', 'continuity-recurrence');
}

export function projectApplicableContinuity({
  records,
  applicableScopes,
  tokenBudget = 256
}) {
  const scopeSet = new Set(applicableScopes);
  const selected = [];
  let usedTokens = 0;
  for (const record of records
    .filter((item) => item.currentness === 'CURRENT' && scopeSet.has(item.scope))
    .sort((left, right) => left.acceptedRecordRef.localeCompare(right.acceptedRecordRef))) {
    const candidate = {
      acceptedRecordRef: record.acceptedRecordRef,
      recordClass: record.recordClass,
      scope: record.scope,
      burdenReleaseRef: record.burdenReleaseRef,
      protectedCapabilityCount: record.protectedCapabilities.length,
      prohibitedOvercorrectionCount: record.prohibitedOvercorrections.length
    };
    const cost = estimateTokens(candidate);
    if (usedTokens + cost > tokenBudget) continue;
    selected.push(candidate);
    usedTokens += cost;
  }
  return deepFreeze({
    schemaVersion: 'vexlife.applicable-continuity-projection/v0',
    selected,
    selectedRecordRefs: selected.map((item) => item.acceptedRecordRef),
    tokenBudget,
    usedTokens,
    rawSourceContentIncluded: false,
    allHistoricalRecordsLoaded: false,
    weightArtifactsLoaded: false
  });
}

export function projectContinuityRecord(record) {
  const active = record.currentness === 'CURRENT';
  return deepFreeze({
    schemaVersion: 'vexlife.continuity-human-projection/v0',
    acceptedRecordRef: record.acceptedRecordRef,
    observedPatternOrPreference: record.summary,
    experienceOrPreferenceOwnerRefs: [...new Set([...record.aboutSelfRefs, ...record.affectedPartyRefs])].sort(),
    sourceSupport: {
      observationRefs: [...record.sourceObservationRefs],
      rangeRefs: [...record.sourceRangeRefs],
      rawContentIncluded: false
    },
    changed: record.recordClass,
    authorityTransition: record.burdenRelease?.authorityTransition ?? 'ACCEPTED_SCOPED_RECORD',
    protectedCapabilities: [...record.protectedCapabilities],
    prohibitedOvercorrections: [...record.prohibitedOvercorrections],
    scope: record.scope,
    state: active ? record.lifecycle : record.currentness,
    nextSafeAction: record.lifecycle === 'INACTIVE_PENDING_DETERMINISTIC_IMPLEMENTATION_REVIEW'
      ? 'OPEN_SEPARATE_DETERMINISTIC_IMPLEMENTATION_REVIEW'
      : record.recurrenceState === 'REOPEN_REVIEW'
        ? 'RETURN_TO_CONTEXT_REVIEW'
        : 'APPLY_BY_REF_ONLY_WHEN_SCOPE_MATCHES'
  });
}

// [VXG RealForever]
