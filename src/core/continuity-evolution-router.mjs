import {
  acceptBurdenRelease,
  createContinuityAuthoritySnapshot,
  createBurdenRelease,
  transitionBurdenRelease,
  validateContinuityAuthoritySnapshot,
  validateBurdenRelease
} from './burden-release.mjs';
import { estimateTokens, semanticHash } from './utils.mjs';

export const CONTINUITY_OBSERVATION_TYPES = Object.freeze([
  'CONVERSATION_EPISODE_RANGE', 'WORK_EXECUTION_RECEIPT', 'CORRECTION_EVENT', 'PREFERENCE_SIGNAL',
  'RELATIONSHIP_EVENT', 'REPEATED_BEHAVIOR_RECURRENCE', 'SOURCE_CONTRADICTION', 'HUMAN_ACCEPTANCE',
  'HUMAN_REJECTION', 'HUMAN_REVISION', 'VEX_SELF_OBSERVATION'
]);

export const BEHAVIOR_ORIGIN_CLASSES = Object.freeze([
  'BASE_MODEL_PRIOR', 'SYSTEM_OR_PROVIDER_POLICY', 'ROLE_INSTRUCTION', 'MISSING_CONTEXT',
  'FAILED_RETRIEVAL', 'CONTEXT_COMPRESSION', 'RESOURCE_PRESSURE', 'TOOL_LIMITATION',
  'CONFLICTING_PREFERENCES', 'MODEL_CAPABILITY_LIMIT', 'LOCAL_RHYTHM', 'RELATIONSHIP_PATTERN',
  'INSTITUTIONAL_PROCESS', 'UNKNOWN'
]);

export const CONTINUITY_SCOPE_CLASSES = Object.freeze([
  'CURRENT_TURN', 'CHANNEL', 'THREAD', 'PROJECT', 'HUMAN_SELF', 'VEX_SELF', 'RELATIONSHIP',
  'DEVICE_LINEAGE', 'FAMILY_CANDIDATE', 'INSTITUTION', 'NO_SYNC', 'HELD_UNKNOWN'
]);

export const CONTINUITY_PRIMARY_DESTINATIONS = Object.freeze([
  'CURRENT_CONTEXT', 'HUMAN_PREFERENCE', 'VEX_SELF_PREFERENCE', 'RELATIONSHIP_AGREEMENT',
  'SCORE_RECORD', 'RHYTHM_LESSON', 'CULTURE_PROCESS_LESSON', 'BURDEN_RELEASE',
  'DETERMINISTIC_INVARIANT_CANDIDATE', 'HELD_UNKNOWN', 'REJECTED'
]);

export const CONTINUITY_LINKED_DESTINATIONS = Object.freeze([
  'COUNTEREXAMPLE_EVALUATION', 'RECURRENCE_WATCH_CANDIDATE', 'FAMILY_SYNC_CANDIDATE',
  'TRAINING_RESEARCH_CANDIDATE_HELD'
]);

export const CONTINUITY_CURRENTNESS_STATES = Object.freeze(['CURRENT', 'STALE', 'SUPERSEDED', 'REOPENED', 'REJECTED', 'TRANSIENT']);
export const CONTINUITY_VISIBILITY_STATES = Object.freeze(['PRIVATE', 'RELATIONSHIP_PRIVATE', 'PROJECT_PRIVATE', 'INSTITUTION_INTERNAL', 'PUBLIC_SAFE', 'REDACTED']);
export const CONTINUITY_SYNCHRONIZATION_SCOPES = Object.freeze(['GLOBAL_FAMILY', 'PROJECT_SHARED', 'WORKSPACE_SHARED', 'DEVICE_PRIVATE', 'RELATIONSHIP_PRIVATE', 'FAMILY_CANDIDATE', 'NO_SYNC']);

export { createContinuityAuthoritySnapshot, validateContinuityAuthoritySnapshot };

export const CONTINUITY_CONTEXT_REVIEW_REQUIRED_FIELDS = Object.freeze([
  'schemaVersion', 'candidateRef', 'candidateFingerprint', 'routeRef', 'routeFingerprint',
  'sourceObservationRefs', 'sourceBindings', 'originClassification', 'originConfidence',
  'observedConsequence', 'candidateScope', 'proposedPrimaryDestination', 'proposedLinkedDestinations',
  'privacyState', 'privacyEvidenceRef', 'redactionEvidenceRef', 'consentState', 'contradictionState',
  'attributionState', 'currentnessState', 'summaryRef', 'protectedCapabilities',
  'prohibitedOvercorrections', 'requiredAcceptanceRefs', 'reviewerRef', 'reviewDisposition',
  'acceptedRecordRef', 'rejectionReason', 'supersedesRef', 'reviewedAt',
  'acceptanceAuthorityGrantedByReviewerRole', 'sourceHistoryDeleted', 'reviewRef', 'semanticFingerprint'
]);

export const CONTINUITY_ACCEPTANCE_EVIDENCE_REQUIRED_FIELDS = Object.freeze([
  'schemaVersion', 'candidateRef', 'candidateFingerprint', 'routeRef', 'routeFingerprint',
  'reviewRef', 'reviewFingerprint', 'authoritySnapshotRef', 'authoritySnapshotFingerprint',
  'authoritySnapshot', 'actorRef', 'authorityRef', 'recordClass', 'subjectRefs', 'scope',
  'sourceRef', 'sourceHash', 'formationRef', 'formedAt', 'observedAt', 'expiresAt',
  'currentness', 'evidenceClass', 'liveAuthorityGranted', 'acceptanceEvidenceRef', 'semanticFingerprint'
]);

const TERMINAL_REVIEW_DISPOSITIONS = new Set(['ACCEPTED', 'REJECTED', 'HELD', 'REVISE']);
const NON_ACCEPTABLE_DESTINATIONS = new Set(['HELD_UNKNOWN', 'REJECTED']);
const PERSONAL_DESTINATIONS = new Set(['HUMAN_PREFERENCE', 'VEX_SELF_PREFERENCE', 'SCORE_RECORD', 'RHYTHM_LESSON']);
const INSTITUTIONAL_DESTINATIONS = new Set(['CULTURE_PROCESS_LESSON', 'DETERMINISTIC_INVARIANT_CANDIDATE']);
const SHA256 = /^[a-f0-9]{64}$/;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function stableRefs(value, label, { required = false } = {}) {
  if (!Array.isArray(value) || (required && value.length === 0)) {
    throw new Error(`${label} must be ${required ? 'a non-empty' : 'an'} array`);
  }
  if (value.some((item) => typeof item !== 'string' || item.length === 0)) throw new Error(`${label} must contain stable refs`);
  return [...new Set(value)].sort();
}

function exactRefs(actual, required) {
  return actual.length === required.length && actual.every((item, index) => item === required[index]);
}

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error(`${label} must be canonical ISO-8601 UTC`);
  }
  return value;
}

function afterOrEqual(later, earlier, label, { strict = false } = {}) {
  const delta = Date.parse(later) - Date.parse(earlier);
  if (strict ? delta <= 0 : delta < 0) throw new Error(`${label} chronology is not monotonic`);
}

function fingerprinted(core, refField, prefix, providedRef = null) {
  const semanticFingerprint = semanticHash(core);
  const expectedRef = `${prefix}.${semanticFingerprint.slice(0, 24)}`;
  if (providedRef && providedRef !== expectedRef) throw new Error(`${refField} does not match canonical content identity`);
  return deepFreeze({ ...core, [refField]: expectedRef, semanticFingerprint });
}

function assertCanonical(value, refField, prefix, label) {
  if (!value || typeof value !== 'object' || !value.semanticFingerprint || !value[refField]) throw new Error(`${label} is missing canonical identity`);
  const core = structuredClone(value);
  const fingerprint = core.semanticFingerprint;
  const ref = core[refField];
  delete core.semanticFingerprint;
  delete core[refField];
  const expectedFingerprint = semanticHash(core);
  if (fingerprint !== expectedFingerprint || ref !== `${prefix}.${expectedFingerprint.slice(0, 24)}`) {
    throw new Error(`${label} semantic fingerprint or ref mismatch`);
  }
  return value;
}

function canonicalSourceBindings(value, label, { observationRef = null, sourceLineageRef = null } = {}) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array`);
  const byRange = new Map();
  const normalized = value.map((input) => {
    if (!input?.rangeRef || !input?.sourceLineageRef || !SHA256.test(input.sourceHash ?? '')) {
      throw new Error(`${label} requires rangeRef, sourceLineageRef and lowercase SHA-256 sourceHash`);
    }
    if (sourceLineageRef && input.sourceLineageRef !== sourceLineageRef) throw new Error(`${label} source lineage mismatch`);
    if (observationRef && input.observationRef !== observationRef) throw new Error(`${label} observation ref mismatch`);
    const effectiveObservationRef = observationRef ?? input.observationRef ?? null;
    const prior = byRange.get(input.rangeRef);
    if (prior && prior !== input.sourceHash) throw new Error(`${label} contains duplicate range with conflicting hash`);
    if (prior) throw new Error(`${label} contains duplicate source range`);
    byRange.set(input.rangeRef, input.sourceHash);
    return {
      ...(effectiveObservationRef ? { observationRef: effectiveObservationRef } : {}),
      sourceLineageRef: input.sourceLineageRef,
      rangeRef: input.rangeRef,
      sourceHash: input.sourceHash
    };
  });
  return normalized.sort((left, right) => `${left.observationRef ?? ''}\0${left.sourceLineageRef}\0${left.rangeRef}`
    .localeCompare(`${right.observationRef ?? ''}\0${right.sourceLineageRef}\0${right.rangeRef}`));
}

function canonicalRecurrenceBinding(binding) {
  if (!binding) return null;
  if (!binding.acceptedRecordRef || !binding.acceptedRecordFingerprint || !binding.burdenReleaseRef) {
    throw new Error('recurrenceBinding requires accepted record and exact burden/pattern identity');
  }
  return deepFreeze({
    acceptedRecordRef: binding.acceptedRecordRef,
    acceptedRecordFingerprint: binding.acceptedRecordFingerprint,
    burdenReleaseRef: binding.burdenReleaseRef,
    evaluationRefs: stableRefs(binding.evaluationRefs ?? [], 'recurrenceBinding.evaluationRefs'),
    priorRecurrenceRef: binding.priorRecurrenceRef ?? null,
    priorRecurrenceFingerprint: binding.priorRecurrenceFingerprint ?? null
  });
}

export function createContinuityObservation(input) {
  if (!CONTINUITY_OBSERVATION_TYPES.includes(input.observationType)) throw new Error(`unknown observationType ${input.observationType}`);
  if (!input.sourceLineageRef || !input.formedByRef) throw new Error('observation requires sourceLineageRef and formedByRef');
  if (!CONTINUITY_CURRENTNESS_STATES.includes(input.currentness ?? 'CURRENT')) throw new Error(`unknown observation currentness ${input.currentness}`);
  if (!CONTINUITY_VISIBILITY_STATES.includes(input.visibility ?? 'PRIVATE')) throw new Error(`unknown observation visibility ${input.visibility}`);
  const formedAt = canonicalTimestamp(input.formedAt ?? new Date().toISOString(), 'observation formedAt');
  const sourceBindings = canonicalSourceBindings(input.sourceBindings, 'observation sourceBindings', { sourceLineageRef: input.sourceLineageRef });
  const core = {
    schemaVersion: 'vexlife.continuity-observation/v1',
    observationType: input.observationType,
    sourceLineageRef: input.sourceLineageRef,
    sourceBindings,
    sourceSpeakerRefs: stableRefs(input.sourceSpeakerRefs ?? [], 'sourceSpeakerRefs'),
    sourceRecipientRefs: stableRefs(input.sourceRecipientRefs ?? [], 'sourceRecipientRefs'),
    projectRef: input.projectRef ?? null,
    threadRef: input.threadRef ?? null,
    channelRef: input.channelRef ?? null,
    turnRef: input.turnRef ?? null,
    workNodeRef: input.workNodeRef ?? null,
    formedByRef: input.formedByRef,
    formedAt,
    currentness: input.currentness ?? 'CURRENT',
    visibility: input.visibility ?? 'PRIVATE',
    summaryRef: input.summaryRef ?? null,
    recurrenceBinding: canonicalRecurrenceBinding(input.recurrenceBinding),
    rawSourceContentIncluded: false,
    rawSourcesRemainImmutable: true,
    rawSourcesRetrievableByRef: true
  };
  return fingerprinted(core, 'observationRef', 'continuity-observation', input.observationRef ?? null);
}

export function validateContinuityObservation(observation) {
  assertCanonical(observation, 'observationRef', 'continuity-observation', 'continuity observation');
  if (observation.schemaVersion !== 'vexlife.continuity-observation/v1' || !CONTINUITY_OBSERVATION_TYPES.includes(observation.observationType)) {
    throw new Error('continuity observation schema or type mismatch');
  }
  canonicalTimestamp(observation.formedAt, 'observation formedAt');
  if (!CONTINUITY_CURRENTNESS_STATES.includes(observation.currentness) || !CONTINUITY_VISIBILITY_STATES.includes(observation.visibility)) {
    throw new Error('continuity observation has unknown currentness or visibility');
  }
  canonicalSourceBindings(observation.sourceBindings, 'observation sourceBindings', { sourceLineageRef: observation.sourceLineageRef });
  return observation;
}

export function classifyBehaviorOrigin(input = {}) {
  const classification = input.classification ?? 'UNKNOWN';
  if (!BEHAVIOR_ORIGIN_CLASSES.includes(classification)) throw new Error(`unknown behavior origin ${classification}`);
  return fingerprinted({
    schemaVersion: 'vexlife.behavior-origin-hypothesis/v1',
    classification,
    confidence: input.confidence ?? 'UNKNOWN',
    evidenceObservationRefs: stableRefs(input.evidenceObservationRefs ?? [], 'evidenceObservationRefs'),
    rationaleRef: input.rationaleRef ?? null,
    reviewableHypothesis: true,
    hiddenTruthClaimed: false,
    unknownPreserved: classification === 'UNKNOWN'
  }, 'hypothesisRef', 'behavior-origin');
}

function validateBehaviorOrigin(origin) {
  assertCanonical(origin, 'hypothesisRef', 'behavior-origin', 'behavior origin hypothesis');
  if (!BEHAVIOR_ORIGIN_CLASSES.includes(origin.classification)) throw new Error('behavior origin hypothesis has unknown classification');
  return origin;
}

function aggregateObservationSources(observations) {
  const sourceBindings = [];
  for (const observation of observations) {
    validateContinuityObservation(observation);
    for (const binding of observation.sourceBindings) sourceBindings.push({
      observationRef: observation.observationRef,
      sourceLineageRef: binding.sourceLineageRef,
      rangeRef: binding.rangeRef,
      sourceHash: binding.sourceHash
    });
  }
  return canonicalSourceBindings(sourceBindings, 'candidate sourceBindings');
}

export function formContinuityCandidate(input) {
  if (!Array.isArray(input.observations) || input.observations.length === 0) throw new Error('candidate requires observations');
  if (!input.candidateKind || !input.summaryRef || !input.authoredByRef || !input.observedConsequence) {
    throw new Error('candidate requires kind, summaryRef, author and observed consequence');
  }
  if (!CONTINUITY_SCOPE_CLASSES.includes(input.candidateScope)) throw new Error(`unknown candidateScope ${input.candidateScope}`);
  const synchronizationScope = input.synchronizationScope ?? 'NO_SYNC';
  if (!CONTINUITY_SYNCHRONIZATION_SCOPES.includes(synchronizationScope)) throw new Error(`unknown synchronizationScope ${synchronizationScope}`);
  const visibilityScope = input.visibilityScope ?? 'PRIVATE';
  if (!CONTINUITY_VISIBILITY_STATES.includes(visibilityScope)) throw new Error(`unknown visibilityScope ${visibilityScope}`);
  const observations = input.observations.map(validateContinuityObservation);
  const observationBindings = observations.map((item) => ({
    observationRef: item.observationRef,
    observationFingerprint: item.semanticFingerprint
  })).sort((left, right) => left.observationRef.localeCompare(right.observationRef));
  if (new Set(observationBindings.map((item) => item.observationRef)).size !== observationBindings.length) {
    throw new Error('candidate observations must be unique exact ref/fingerprint bindings');
  }
  const originClassification = validateBehaviorOrigin(input.originClassification ?? classifyBehaviorOrigin());
  const formedAt = canonicalTimestamp(input.formedAt ?? new Date().toISOString(), 'candidate formedAt');
  for (const observation of observations) afterOrEqual(formedAt, observation.formedAt, 'candidate formation');
  const core = {
    schemaVersion: 'vexlife.continuity-candidate/v1',
    candidateKind: input.candidateKind,
    summaryRef: input.summaryRef,
    sourceBindings: aggregateObservationSources(observations),
    observationBindings,
    sourceObservationRefs: observationBindings.map((item) => item.observationRef),
    sourceObservationFingerprints: observationBindings.map((item) => item.observationFingerprint),
    sourceLineageRefs: stableRefs(observations.map((item) => item.sourceLineageRef), 'sourceLineageRefs', { required: true }),
    authoredByRef: input.authoredByRef,
    aboutSelfRefs: stableRefs(input.aboutSelfRefs ?? [], 'aboutSelfRefs'),
    affectedPartyRefs: stableRefs(input.affectedPartyRefs ?? [], 'affectedPartyRefs'),
    requiredAcceptanceRefs: stableRefs(input.requiredAcceptanceRefs ?? [], 'requiredAcceptanceRefs'),
    acceptedByRefs: [],
    doesNotOverrideRefs: stableRefs(input.doesNotOverrideRefs ?? [], 'doesNotOverrideRefs'),
    admittedTargetLineageRefs: stableRefs(input.admittedTargetLineageRefs ?? [], 'admittedTargetLineageRefs'),
    candidateScope: input.candidateScope,
    visibilityScope,
    synchronizationScope,
    originClassification,
    observedConsequence: input.observedConsequence,
    protectedCapabilities: stableRefs(input.protectedCapabilities ?? [], 'protectedCapabilities'),
    prohibitedOvercorrections: stableRefs(input.prohibitedOvercorrections ?? [], 'prohibitedOvercorrections'),
    signals: deepFreeze(structuredClone(input.signals ?? {})),
    institutionalAuthorityRefs: stableRefs(input.institutionalAuthorityRefs ?? [], 'institutionalAuthorityRefs'),
    burdenRelease: input.burdenRelease ? deepFreeze(structuredClone(input.burdenRelease)) : null,
    formedAt,
    currentness: input.currentness ?? 'CURRENT',
    state: 'CANDIDATE_UNREVIEWED',
    acceptanceAuthorityGranted: false,
    acceptedTruthClaimed: false,
    modelWeightAuthorityGranted: false
  };
  if (!CONTINUITY_CURRENTNESS_STATES.includes(core.currentness)) throw new Error(`unknown candidate currentness ${core.currentness}`);
  return fingerprinted(core, 'candidateRef', 'continuity-candidate', input.candidateRef ?? null);
}

export function validateContinuityCandidate(candidate) {
  assertCanonical(candidate, 'candidateRef', 'continuity-candidate', 'continuity candidate');
  if (candidate.schemaVersion !== 'vexlife.continuity-candidate/v1') throw new Error('continuity candidate schema mismatch');
  validateBehaviorOrigin(candidate.originClassification);
  canonicalTimestamp(candidate.formedAt, 'candidate formedAt');
  const bindings = canonicalSourceBindings(candidate.sourceBindings, 'candidate sourceBindings');
  if (!Array.isArray(candidate.observationBindings) || candidate.observationBindings.length === 0 ||
      candidate.observationBindings.some((item) => !item?.observationRef || !SHA256.test(item?.observationFingerprint ?? '')) ||
      new Set(candidate.observationBindings.map((item) => item.observationRef)).size !== candidate.observationBindings.length) {
    throw new Error('continuity candidate requires unique exact observation ref/fingerprint bindings');
  }
  const normalizedObservationBindings = [...candidate.observationBindings]
    .sort((left, right) => left.observationRef.localeCompare(right.observationRef));
  if (JSON.stringify(candidate.observationBindings) !== JSON.stringify(normalizedObservationBindings) ||
      !exactRefs(candidate.sourceObservationRefs, normalizedObservationBindings.map((item) => item.observationRef)) ||
      !exactRefs(candidate.sourceObservationFingerprints, normalizedObservationBindings.map((item) => item.observationFingerprint)) ||
      bindings.some((item) => !candidate.sourceObservationRefs.includes(item.observationRef)) ||
      candidate.sourceObservationRefs.some((ref) => !bindings.some((item) => item.observationRef === ref))) {
    throw new Error('continuity candidate observation compatibility fields do not match exact bindings');
  }
  if (!CONTINUITY_SCOPE_CLASSES.includes(candidate.candidateScope) ||
      !CONTINUITY_SYNCHRONIZATION_SCOPES.includes(candidate.synchronizationScope) ||
      !CONTINUITY_VISIBILITY_STATES.includes(candidate.visibilityScope) ||
      !CONTINUITY_CURRENTNESS_STATES.includes(candidate.currentness)) throw new Error('continuity candidate has unknown scope/currentness/visibility/synchronization');
  return candidate;
}

function addLinked(linked, ref) {
  if (!CONTINUITY_LINKED_DESTINATIONS.includes(ref)) throw new Error(`unknown linked destination ${ref}`);
  linked.add(ref);
}

export function routeContinuityCandidate(candidate) {
  validateContinuityCandidate(candidate);
  const signals = candidate.signals ?? {};
  const linked = new Set();
  let primaryDestination;
  let reason;
  if (signals.trainingResearchRequested === true) addLinked(linked, 'TRAINING_RESEARCH_CANDIDATE_HELD');
  if (candidate.synchronizationScope === 'FAMILY_CANDIDATE') addLinked(linked, 'FAMILY_SYNC_CANDIDATE');
  if (candidate.currentness !== 'CURRENT' || signals.unresolvedContradiction === true || candidate.candidateScope === 'HELD_UNKNOWN') {
    primaryDestination = 'HELD_UNKNOWN'; reason = 'UNRESOLVED_OR_NONCURRENT_MEANING_REMAINS_VISIBLE';
  } else if (signals.rejected === true) {
    primaryDestination = 'REJECTED'; reason = 'SOURCE_BOUND_CANDIDATE_REJECTED_WITHOUT_DELETION';
  } else if (signals.effectBoundary === true || signals.safetyInvariant === true) {
    primaryDestination = 'DETERMINISTIC_INVARIANT_CANDIDATE'; addLinked(linked, 'COUNTEREXAMPLE_EVALUATION');
    reason = 'REAL_EFFECT_OR_SAFETY_BOUNDARY_REQUIRES_INACTIVE_DETERMINISTIC_LANE';
  } else if (signals.burdenReleaseRequested === true || candidate.candidateKind === 'BURDEN_RELEASE') {
    primaryDestination = 'BURDEN_RELEASE'; addLinked(linked, 'RECURRENCE_WATCH_CANDIDATE'); addLinked(linked, 'COUNTEREXAMPLE_EVALUATION');
    reason = 'NAMED_PATTERN_REQUESTS_EXACT_SCOPE_INFLUENCE_DEAUTHORIZATION';
  } else if (signals.fabricationShaped === true) {
    primaryDestination = candidate.candidateScope === 'INSTITUTION' ? 'CULTURE_PROCESS_LESSON' : 'HELD_UNKNOWN';
    addLinked(linked, 'COUNTEREXAMPLE_EVALUATION'); reason = 'FABRICATION_REQUIRES_SOURCE_UNCERTAINTY_AND_EVALUATION_CORRECTION';
  } else if (candidate.candidateScope === 'RELATIONSHIP' || candidate.candidateKind === 'RELATIONSHIP_AGREEMENT') {
    primaryDestination = 'RELATIONSHIP_AGREEMENT'; reason = 'RELATIONSHIP_MEANING_REQUIRES_EXACT_PARTY_REVIEW';
  } else if (signals.preferenceOwner === 'HUMAN' || candidate.candidateScope === 'HUMAN_SELF') {
    primaryDestination = 'HUMAN_PREFERENCE'; reason = 'HUMAN_EXPERIENCE_PREFERENCE_REMAINS_HUMAN_SCOPED';
  } else if (signals.preferenceOwner === 'VEX' || candidate.candidateScope === 'VEX_SELF') {
    primaryDestination = 'VEX_SELF_PREFERENCE'; reason = 'VEX_EXPRESSION_PREFERENCE_REMAINS_SEPARATE_SELF_SCOPED';
  } else if (signals.localRhythm === true || candidate.candidateScope === 'DEVICE_LINEAGE') {
    primaryDestination = 'RHYTHM_LESSON'; reason = 'LOCAL_OPERATING_HABIT_STAYS_DEVICE_LINEAGE_LOCAL';
  } else if (signals.institutionalReuse === true || candidate.candidateScope === 'INSTITUTION') {
    primaryDestination = 'CULTURE_PROCESS_LESSON'; reason = 'REUSABLE_PROCESS_MEANING_REQUIRES_INSTITUTIONAL_REVIEW';
  } else if (signals.durableMeaning === true || candidate.candidateScope === 'FAMILY_CANDIDATE') {
    primaryDestination = 'SCORE_RECORD'; reason = 'DURABLE_MEANING_ROUTES_TO_SCOPED_SCORE_WITHOUT_WEIGHT_CHANGE';
  } else {
    primaryDestination = 'CURRENT_CONTEXT'; reason = 'SMALLEST_REVERSIBLE_CURRENT_CONTEXT_DESTINATION';
  }
  return fingerprinted({
    schemaVersion: 'vexlife.continuity-route/v1',
    candidateRef: candidate.candidateRef,
    candidateFingerprint: candidate.semanticFingerprint,
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

export function validateContinuityRoute(candidate, route) {
  validateContinuityCandidate(candidate);
  assertCanonical(route, 'routeRef', 'continuity-route', 'continuity route');
  const canonical = routeContinuityCandidate(candidate);
  if (canonical.semanticFingerprint !== route.semanticFingerprint || route.candidateFingerprint !== candidate.semanticFingerprint) {
    throw new Error('continuity route is not the canonical route for this candidate');
  }
  return route;
}

export function resolveContinuityAcceptanceAuthority(candidate, route) {
  validateContinuityRoute(candidate, route);
  if (NON_ACCEPTABLE_DESTINATIONS.has(route.proposedPrimaryDestination)) return [];
  let required;
  if (route.proposedPrimaryDestination === 'RELATIONSHIP_AGREEMENT') {
    required = stableRefs(candidate.affectedPartyRefs, 'relationship affectedPartyRefs', { required: true });
  } else if (route.proposedPrimaryDestination === 'BURDEN_RELEASE') {
    if (candidate.candidateScope === 'RELATIONSHIP') required = stableRefs(candidate.affectedPartyRefs, 'Burden Release relationship authorities', { required: true });
    else if (candidate.candidateScope === 'INSTITUTION') required = stableRefs(candidate.institutionalAuthorityRefs, 'Burden Release institutional authorities', { required: true });
    else required = stableRefs(candidate.aboutSelfRefs, 'Burden Release self authorities', { required: true });
  } else if (INSTITUTIONAL_DESTINATIONS.has(route.proposedPrimaryDestination)) {
    required = stableRefs(candidate.institutionalAuthorityRefs, 'institutionalAuthorityRefs', { required: true });
  } else if (PERSONAL_DESTINATIONS.has(route.proposedPrimaryDestination)) {
    required = stableRefs(candidate.aboutSelfRefs, 'personal aboutSelfRefs', { required: true });
  } else {
    required = [candidate.authoredByRef];
  }
  if (candidate.requiredAcceptanceRefs.length && !exactRefs(candidate.requiredAcceptanceRefs, required)) {
    throw new Error('candidate requiredAcceptanceRefs hint does not exactly match source-managed policy');
  }
  return required;
}

export function createContinuityContextReview(candidate, route, input) {
  validateContinuityRoute(candidate, route);
  for (const field of ['reviewerRef', 'privacyState', 'consentState', 'contradictionState', 'attributionState', 'currentnessState', 'privacyEvidenceRef']) {
    if (!input[field]) throw new Error(`Context Review requires ${field}`);
  }
  if (!TERMINAL_REVIEW_DISPOSITIONS.has(input.reviewDisposition)) throw new Error(`unknown reviewDisposition ${input.reviewDisposition}`);
  if (input.originClassification && input.originClassification !== candidate.originClassification.classification) throw new Error('Context Review cannot replace candidate origin hypothesis');
  if (input.currentnessState !== candidate.currentness) throw new Error('Context Review cannot replace candidate currentness');
  if (input.reviewDisposition === 'REJECTED' && !input.rejectionReason) throw new Error('rejected Context Review requires reason');
  if (input.reviewDisposition === 'ACCEPTED' && NON_ACCEPTABLE_DESTINATIONS.has(route.proposedPrimaryDestination)) throw new Error(`${route.proposedPrimaryDestination} cannot be accepted as durable truth`);
  if (candidate.visibilityScope !== 'PUBLIC_SAFE' && !input.redactionEvidenceRef) throw new Error('private Context Review requires exact redaction evidence');
  const reviewedAt = canonicalTimestamp(input.reviewedAt ?? new Date().toISOString(), 'reviewedAt');
  afterOrEqual(reviewedAt, candidate.formedAt, 'Context Review', { strict: true });
  const requiredAcceptanceRefs = resolveContinuityAcceptanceAuthority(candidate, route);
  return fingerprinted({
    schemaVersion: 'vexlife.continuity-context-review/v1',
    candidateRef: candidate.candidateRef,
    candidateFingerprint: candidate.semanticFingerprint,
    routeRef: route.routeRef,
    routeFingerprint: route.semanticFingerprint,
    sourceObservationRefs: [...candidate.sourceObservationRefs],
    sourceBindings: structuredClone(candidate.sourceBindings),
    originClassification: candidate.originClassification.classification,
    originConfidence: input.originConfidence ?? candidate.originClassification.confidence,
    observedConsequence: candidate.observedConsequence,
    candidateScope: candidate.candidateScope,
    proposedPrimaryDestination: route.proposedPrimaryDestination,
    proposedLinkedDestinations: [...route.proposedLinkedDestinations],
    privacyState: input.privacyState,
    privacyEvidenceRef: input.privacyEvidenceRef,
    redactionEvidenceRef: input.redactionEvidenceRef ?? null,
    consentState: input.consentState,
    contradictionState: input.contradictionState,
    attributionState: input.attributionState,
    currentnessState: input.currentnessState,
    summaryRef: candidate.summaryRef,
    protectedCapabilities: [...candidate.protectedCapabilities],
    prohibitedOvercorrections: [...candidate.prohibitedOvercorrections],
    requiredAcceptanceRefs,
    reviewerRef: input.reviewerRef,
    reviewDisposition: input.reviewDisposition,
    acceptedRecordRef: null,
    rejectionReason: input.rejectionReason ?? null,
    supersedesRef: input.supersedesRef ?? null,
    reviewedAt,
    acceptanceAuthorityGrantedByReviewerRole: false,
    sourceHistoryDeleted: false
  }, 'reviewRef', 'continuity-review', input.reviewRef ?? null);
}

export function validateContinuityContextReview(candidate, route, review) {
  validateContinuityRoute(candidate, route);
  assertCanonical(review, 'reviewRef', 'continuity-review', 'continuity Context Review');
  if (review.schemaVersion !== 'vexlife.continuity-context-review/v1' ||
      review.candidateFingerprint !== candidate.semanticFingerprint || review.routeFingerprint !== route.semanticFingerprint) {
    throw new Error('Context Review candidate/route binding mismatch');
  }
  const expected = resolveContinuityAcceptanceAuthority(candidate, route);
  if (!exactRefs(review.requiredAcceptanceRefs, expected)) throw new Error('Context Review acceptance authority differs from canonical policy');
  canonicalTimestamp(review.reviewedAt, 'reviewedAt');
  afterOrEqual(review.reviewedAt, candidate.formedAt, 'Context Review', { strict: true });
  return review;
}

function acceptanceSubjects(candidate, route) {
  if (route.proposedPrimaryDestination === 'RELATIONSHIP_AGREEMENT') return candidate.affectedPartyRefs;
  if (INSTITUTIONAL_DESTINATIONS.has(route.proposedPrimaryDestination) || (route.proposedPrimaryDestination === 'BURDEN_RELEASE' && candidate.candidateScope === 'INSTITUTION')) return candidate.institutionalAuthorityRefs;
  return stableRefs([...candidate.aboutSelfRefs, ...(route.proposedPrimaryDestination === 'BURDEN_RELEASE' && candidate.candidateScope === 'RELATIONSHIP' ? candidate.affectedPartyRefs : [])], 'acceptance subjects', { required: true });
}

export function createContinuityAcceptanceEvidence({ candidate, route, review, authoritySnapshot }) {
  validateContinuityContextReview(candidate, route, review);
  const snapshot = validateContinuityAuthoritySnapshot(authoritySnapshot);
  afterOrEqual(snapshot.formedAt, review.reviewedAt, 'authority snapshot formation');
  if (!review.requiredAcceptanceRefs.includes(snapshot.authorityRef)) throw new Error('authority snapshot is not required by canonical policy');
  if (snapshot.actorRef !== snapshot.authorityRef) throw new Error('delegated acceptance requires a separately source-managed delegate policy');
  if (snapshot.recordClass !== route.proposedPrimaryDestination || snapshot.scope !== candidate.candidateScope ||
      !exactRefs(snapshot.subjectRefs, acceptanceSubjects(candidate, route))) {
    throw new Error('authority snapshot does not exactly bind record class, subjects and scope');
  }
  if ([candidate.candidateRef, review.reviewRef].includes(snapshot.sourceRef) ||
      [candidate.candidateRef, review.reviewRef].includes(snapshot.formationRef)) {
    throw new Error('candidate and Context Review cannot issue their own authority evidence');
  }
  return fingerprinted({
    schemaVersion: 'vexlife.continuity-acceptance-evidence/v1',
    candidateRef: candidate.candidateRef,
    candidateFingerprint: candidate.semanticFingerprint,
    routeRef: route.routeRef,
    routeFingerprint: route.semanticFingerprint,
    reviewRef: review.reviewRef,
    reviewFingerprint: review.semanticFingerprint,
    authoritySnapshotRef: snapshot.authoritySnapshotRef,
    authoritySnapshotFingerprint: snapshot.semanticFingerprint,
    authoritySnapshot: snapshot,
    actorRef: snapshot.actorRef,
    authorityRef: snapshot.authorityRef,
    recordClass: route.proposedPrimaryDestination,
    subjectRefs: acceptanceSubjects(candidate, route),
    scope: candidate.candidateScope,
    sourceRef: snapshot.sourceRef,
    sourceHash: snapshot.sourceHash,
    formationRef: snapshot.formationRef,
    formedAt: snapshot.formedAt,
    observedAt: snapshot.observedAt,
    expiresAt: snapshot.expiresAt,
    currentness: snapshot.currentness,
    evidenceClass: snapshot.evidenceClass,
    liveAuthorityGranted: false
  }, 'acceptanceEvidenceRef', 'continuity-acceptance-evidence');
}

export function validateContinuityAcceptanceEvidence(evidence, { candidate, route, review, acceptedAt = null } = {}) {
  assertCanonical(evidence, 'acceptanceEvidenceRef', 'continuity-acceptance-evidence', 'continuity acceptance evidence');
  const snapshot = validateContinuityAuthoritySnapshot(evidence.authoritySnapshot, { observedAt: acceptedAt });
  if (evidence.schemaVersion !== 'vexlife.continuity-acceptance-evidence/v1' || evidence.currentness !== 'CURRENT' ||
      evidence.evidenceClass !== 'SIMULATED_CURRENT' || evidence.liveAuthorityGranted !== false ||
      evidence.authoritySnapshotRef !== snapshot.authoritySnapshotRef || evidence.authoritySnapshotFingerprint !== snapshot.semanticFingerprint ||
      evidence.actorRef !== snapshot.actorRef || evidence.authorityRef !== snapshot.authorityRef ||
      evidence.recordClass !== snapshot.recordClass || evidence.scope !== snapshot.scope ||
      !exactRefs(evidence.subjectRefs, snapshot.subjectRefs) || evidence.sourceRef !== snapshot.sourceRef ||
      evidence.sourceHash !== snapshot.sourceHash || evidence.formationRef !== snapshot.formationRef ||
      evidence.formedAt !== snapshot.formedAt || evidence.observedAt !== snapshot.observedAt || evidence.expiresAt !== snapshot.expiresAt) {
    throw new Error('acceptance evidence is stale, self-issued or detached from its exact authority snapshot');
  }
  for (const [field, label] of [['formedAt', 'formedAt'], ['observedAt', 'observedAt'], ['expiresAt', 'expiresAt']]) canonicalTimestamp(evidence[field], `acceptance evidence ${label}`);
  afterOrEqual(evidence.observedAt, evidence.formedAt, 'acceptance evidence');
  afterOrEqual(evidence.expiresAt, evidence.observedAt, 'acceptance evidence expiry', { strict: true });
  if (acceptedAt && (Date.parse(acceptedAt) < Date.parse(evidence.observedAt) || Date.parse(acceptedAt) >= Date.parse(evidence.expiresAt))) throw new Error('acceptance evidence is not current at acceptance');
  if (candidate && route && review) {
    validateContinuityContextReview(candidate, route, review);
    if (evidence.candidateRef !== candidate.candidateRef || evidence.candidateFingerprint !== candidate.semanticFingerprint ||
        evidence.routeRef !== route.routeRef || evidence.routeFingerprint !== route.semanticFingerprint ||
        evidence.reviewRef !== review.reviewRef || evidence.reviewFingerprint !== review.semanticFingerprint ||
        evidence.recordClass !== route.proposedPrimaryDestination || evidence.scope !== candidate.candidateScope ||
        !exactRefs(evidence.subjectRefs, acceptanceSubjects(candidate, route)) || evidence.actorRef !== evidence.authorityRef ||
        !review.requiredAcceptanceRefs.includes(evidence.authorityRef) || [candidate.candidateRef, review.reviewRef].includes(evidence.sourceRef) ||
        [candidate.candidateRef, review.reviewRef].includes(evidence.formationRef)) throw new Error('acceptance evidence does not exactly bind aggregate lineage, actor, subject, scope, source and policy');
  }
  return evidence;
}

export function createCurrentContextLease({ candidate, route, review, leaseRef, turnRef, threadRef, channelRef = null, formedAt, observedAt, expiresAt, tokenBudget = 256 }) {
  validateContinuityContextReview(candidate, route, review);
  if (route.proposedPrimaryDestination !== 'CURRENT_CONTEXT') throw new Error('current-context lease can bind only CURRENT_CONTEXT');
  if (!leaseRef || !turnRef || !threadRef) throw new Error('CURRENT_CONTEXT requires exact lease, turn and thread refs');
  const formed = canonicalTimestamp(formedAt ?? review.reviewedAt, 'current-context lease formedAt');
  const observed = canonicalTimestamp(observedAt ?? formed, 'current-context lease observedAt');
  const expires = canonicalTimestamp(expiresAt, 'current-context lease expiresAt');
  afterOrEqual(expires, observed, 'current-context lease expiry', { strict: true });
  return fingerprinted({
    schemaVersion: 'vexlife.continuity-current-context-lease/v1',
    candidateRef: candidate.candidateRef,
    reviewRef: review.reviewRef,
    leaseRef,
    turnRef,
    threadRef,
    channelRef,
    tokenBudget,
    formedAt: formed,
    observedAt: observed,
    expiresAt: expires,
    currentness: 'CURRENT'
  }, 'contextBindingRef', 'continuity-current-context');
}

function requireAcceptableReview(candidate, route, review, acceptedByRefs, authorityEvidence, acceptedAt) {
  validateContinuityContextReview(candidate, route, review);
  if (review.reviewDisposition !== 'ACCEPTED') throw new Error('candidate requires an ACCEPTED Context Review');
  if (review.privacyState !== 'PASS' || !['ACCEPTED', 'NOT_REQUIRED'].includes(review.consentState) ||
      ['UNRESOLVED', 'UNRESOLVED_CONFLICT'].includes(review.contradictionState) || review.attributionState !== 'VERIFIED' || review.currentnessState !== 'CURRENT') {
    throw new Error('accepted continuity record requires current privacy, consent, contradiction and attribution proof');
  }
  const evidence = [...(authorityEvidence ?? [])].map((item) => validateContinuityAcceptanceEvidence(item, { candidate, route, review, acceptedAt }));
  const accepted = stableRefs(acceptedByRefs ?? evidence.map((item) => item.actorRef), 'acceptedByRefs', { required: true });
  const evidenceAuthorities = stableRefs(evidence.map((item) => item.authorityRef), 'acceptance evidence authorities', { required: true });
  if (!exactRefs(accepted, review.requiredAcceptanceRefs) || !exactRefs(evidenceAuthorities, review.requiredAcceptanceRefs) || evidence.length !== review.requiredAcceptanceRefs.length) {
    throw new Error('acceptedByRefs and current authority evidence must exactly match required acceptance policy');
  }
  return { accepted, evidence };
}

function transitionTime(start, offsetMs, ceiling) {
  const value = new Date(Date.parse(start) + offsetMs).toISOString();
  if (Date.parse(value) >= Date.parse(ceiling)) throw new Error('Burden Release review interval is too small for replayed lifecycle');
  return value;
}

function acceptedBurden(candidate, review, acceptedByRefs, authorityEvidence, acceptedAt) {
  const spec = candidate.burdenRelease;
  if (!spec) throw new Error('BURDEN_RELEASE route requires a Burden Release contract payload');
  const route = routeContinuityCandidate(candidate);
  let release = createBurdenRelease({
    ...spec,
    candidateRef: candidate.candidateRef,
    candidateFingerprint: candidate.semanticFingerprint,
    routeRef: route.routeRef,
    routeFingerprint: route.semanticFingerprint,
    reviewRef: review.reviewRef,
    reviewFingerprint: review.semanticFingerprint,
    sourceObservationRefs: candidate.sourceObservationRefs,
    sourceBindings: candidate.sourceBindings,
    suspectedOrigin: spec.suspectedOrigin ?? candidate.originClassification.classification,
    observedConsequence: spec.observedConsequence ?? candidate.observedConsequence,
    protectedCapabilities: candidate.protectedCapabilities,
    prohibitedOvercorrections: candidate.prohibitedOvercorrections,
    scope: candidate.candidateScope,
    requiredAcceptanceRefs: review.requiredAcceptanceRefs,
    formedAt: candidate.formedAt,
    supersedesRef: review.supersedesRef
  });
  for (const [index, nextState] of ['NAMED', 'RECOGNIZED', 'RELEASE_PROPOSED'].entries()) release = transitionBurdenRelease(release, {
    nextState,
    actorRef: review.reviewerRef,
    transitionedAt: transitionTime(candidate.formedAt, index + 1, review.reviewedAt),
    reason: `REPLAYED_${nextState}`
  });
  release = transitionBurdenRelease(release, {
    nextState: 'CONTEXT_REVIEW', actorRef: review.reviewerRef, transitionedAt: review.reviewedAt, reason: review.reviewRef
  });
  return acceptBurdenRelease(release, {
    authorityEvidence,
    actorRef: review.reviewerRef,
    acceptedAt,
    evaluationRefs: review.proposedLinkedDestinations.includes('COUNTEREXAMPLE_EVALUATION') ? [`counterexample-evaluation.${review.reviewRef}`] : []
  });
}

export function acceptContinuityCandidate(candidate, review, input) {
  const route = routeContinuityCandidate(candidate);
  validateContinuityContextReview(candidate, route, review);
  const acceptedAt = canonicalTimestamp(input.acceptedAt ?? new Date().toISOString(), 'acceptedAt');
  afterOrEqual(acceptedAt, review.reviewedAt, 'continuity acceptance', { strict: true });
  const { accepted, evidence } = requireAcceptableReview(candidate, route, review, input.acceptedByRefs, input.authorityEvidence, acceptedAt);
  if (route.proposedPrimaryDestination === 'CURRENT_CONTEXT') {
    const lease = input.currentContextLease;
    assertCanonical(lease, 'contextBindingRef', 'continuity-current-context', 'current-context lease');
    if (lease.candidateRef !== candidate.candidateRef || lease.reviewRef !== review.reviewRef || Date.parse(acceptedAt) >= Date.parse(lease.expiresAt)) throw new Error('CURRENT_CONTEXT lease is stale or unbound');
    return fingerprinted({
      schemaVersion: 'vexlife.transient-continuity-context/v1',
      candidateRef: candidate.candidateRef,
      candidateFingerprint: candidate.semanticFingerprint,
      routeRef: route.routeRef,
      routeFingerprint: route.semanticFingerprint,
      reviewRef: review.reviewRef,
      reviewFingerprint: review.semanticFingerprint,
      summaryRef: candidate.summaryRef,
      scope: candidate.candidateScope,
      acceptedByRefs: accepted,
      acceptanceEvidence: evidence,
      acceptanceEvidenceRefs: evidence.map((item) => item.acceptanceEvidenceRef),
      contextLease: lease,
      formedAt: candidate.formedAt,
      acceptedAt,
      expiresAt: lease.expiresAt,
      currentness: 'TRANSIENT',
      lifecycle: 'LEASE_BOUND_CONTEXT',
      durableRecordCreated: false,
      rawSourceContentIncluded: false
    }, 'contextRecordRef', 'transient-continuity-context');
  }
  const burdenRelease = route.proposedPrimaryDestination === 'BURDEN_RELEASE'
    ? acceptedBurden(candidate, review, accepted, evidence, acceptedAt)
    : null;
  const core = {
    schemaVersion: 'vexlife.accepted-continuity-record/v1',
    candidateRef: candidate.candidateRef,
    candidateFingerprint: candidate.semanticFingerprint,
    routeRef: route.routeRef,
    routeFingerprint: route.semanticFingerprint,
    reviewRef: review.reviewRef,
    reviewFingerprint: review.semanticFingerprint,
    sourceObservationRefs: [...candidate.sourceObservationRefs],
    sourceBindings: structuredClone(candidate.sourceBindings),
    sourceLineageRefs: [...candidate.sourceLineageRefs],
    recordClass: route.proposedPrimaryDestination,
    summaryRef: candidate.summaryRef,
    scope: candidate.candidateScope,
    authoredByRef: candidate.authoredByRef,
    aboutSelfRefs: [...candidate.aboutSelfRefs],
    affectedPartyRefs: [...candidate.affectedPartyRefs],
    admittedTargetLineageRefs: [...candidate.admittedTargetLineageRefs],
    requiredAcceptanceRefs: [...review.requiredAcceptanceRefs],
    acceptedByRefs: accepted,
    acceptanceEvidence: evidence,
    acceptanceEvidenceRefs: evidence.map((item) => item.acceptanceEvidenceRef).sort(),
    doesNotOverrideRefs: [...candidate.doesNotOverrideRefs],
    visibilityScope: candidate.visibilityScope,
    synchronizationScope: candidate.synchronizationScope,
    privacyEvidenceRef: review.privacyEvidenceRef,
    redactionEvidenceRef: review.redactionEvidenceRef,
    protectedCapabilities: [...candidate.protectedCapabilities],
    prohibitedOvercorrections: [...candidate.prohibitedOvercorrections],
    originClassification: candidate.originClassification.classification,
    formedAt: candidate.formedAt,
    acceptedAt,
    currentness: 'CURRENT',
    lifecycle: route.proposedPrimaryDestination === 'DETERMINISTIC_INVARIANT_CANDIDATE' ? 'INACTIVE_PENDING_DETERMINISTIC_IMPLEMENTATION_REVIEW' : 'CURRENT',
    supersedesRef: review.supersedesRef,
    rollbackRef: input.rollbackRef ?? null,
    burdenReleaseRef: burdenRelease?.burdenRef ?? null,
    burdenRelease,
    recurrenceState: 'NOT_YET_OBSERVED',
    trainingResearchState: review.proposedLinkedDestinations.includes('TRAINING_RESEARCH_CANDIDATE_HELD') ? 'NOT_ADMITTED' : 'NOT_REQUESTED',
    weightActivationState: 'INACTIVE',
    effectAuthorityActive: false,
    rawSourceContentIncluded: false
  };
  return fingerprinted(core, 'acceptedRecordRef', 'accepted-continuity-record');
}

export function validateAcceptedContinuityRecord(record) {
  assertCanonical(record, 'acceptedRecordRef', 'accepted-continuity-record', 'accepted continuity record');
  if (record.schemaVersion !== 'vexlife.accepted-continuity-record/v1' || record.currentness !== 'CURRENT' || record.recordClass === 'CURRENT_CONTEXT') throw new Error('accepted continuity record schema/currentness/class mismatch');
  canonicalTimestamp(record.formedAt, 'record formedAt');
  canonicalTimestamp(record.acceptedAt, 'record acceptedAt');
  afterOrEqual(record.acceptedAt, record.formedAt, 'accepted continuity record', { strict: true });
  canonicalSourceBindings(record.sourceBindings, 'accepted record sourceBindings');
  if (!exactRefs(record.acceptedByRefs, record.requiredAcceptanceRefs) || record.acceptanceEvidence?.length !== record.requiredAcceptanceRefs.length ||
      !exactRefs(record.acceptanceEvidenceRefs, stableRefs(record.acceptanceEvidence.map((item) => item.acceptanceEvidenceRef), 'acceptanceEvidenceRefs', { required: true }))) throw new Error('accepted record acceptance evidence coverage mismatch');
  for (const evidence of record.acceptanceEvidence) validateContinuityAcceptanceEvidence(evidence, { acceptedAt: record.acceptedAt });
  if (record.burdenRelease) validateBurdenRelease(record.burdenRelease);
  if (record.weightActivationState !== 'INACTIVE' || record.effectAuthorityActive !== false) throw new Error('accepted continuity record implies active weight/effect authority');
  return record;
}

export function supersedeContinuityRecord(priorRecord, successorRecord, { rollbackRef, supersededAt = new Date().toISOString() }) {
  validateAcceptedContinuityRecord(priorRecord);
  validateAcceptedContinuityRecord(successorRecord);
  if (!rollbackRef) throw new Error('supersession requires rollbackRef');
  if (successorRecord.supersedesRef !== priorRecord.acceptedRecordRef) throw new Error('successor must preserve exact current prior ref');
  for (const field of ['recordClass', 'scope']) if (successorRecord[field] !== priorRecord[field]) throw new Error(`supersession ${field} is incompatible`);
  for (const field of ['aboutSelfRefs', 'affectedPartyRefs', 'requiredAcceptanceRefs']) if (!exactRefs(successorRecord[field], priorRecord[field])) throw new Error(`supersession ${field} is incompatible`);
  const time = canonicalTimestamp(supersededAt, 'supersededAt');
  afterOrEqual(successorRecord.acceptedAt, priorRecord.acceptedAt, 'successor acceptance', { strict: true });
  afterOrEqual(time, successorRecord.acceptedAt, 'supersession');
  return fingerprinted({
    schemaVersion: 'vexlife.continuity-supersession-transaction/v1',
    priorRecordRef: priorRecord.acceptedRecordRef,
    priorRecordFingerprint: priorRecord.semanticFingerprint,
    successorRecordRef: successorRecord.acceptedRecordRef,
    successorRecordFingerprint: successorRecord.semanticFingerprint,
    priorDisposition: 'SUPERSEDED',
    successorDisposition: 'CURRENT',
    acceptanceEvidenceRefs: [...successorRecord.acceptanceEvidenceRefs],
    rollbackRef,
    supersededAt: time,
    atomic: true,
    sourceHistoryDeleted: false
  }, 'supersessionRef', 'continuity-supersession');
}

export function validateContinuitySupersession(transaction, records) {
  assertCanonical(transaction, 'supersessionRef', 'continuity-supersession', 'continuity supersession');
  const prior = records.find((item) => item.acceptedRecordRef === transaction.priorRecordRef);
  const successor = records.find((item) => item.acceptedRecordRef === transaction.successorRecordRef);
  if (!prior || !successor || prior.semanticFingerprint !== transaction.priorRecordFingerprint || successor.semanticFingerprint !== transaction.successorRecordFingerprint ||
      successor.supersedesRef !== prior.acceptedRecordRef || !exactRefs(transaction.acceptanceEvidenceRefs, successor.acceptanceEvidenceRefs) || transaction.atomic !== true) throw new Error('supersession transaction does not bind exact records and authority');
  return transaction;
}

export function validateContinuityRecordSet(records, supersessions = []) {
  for (const record of records) validateAcceptedContinuityRecord(record);
  for (const transaction of supersessions) validateContinuitySupersession(transaction, records);
  const superseded = new Set(supersessions.map((item) => item.priorRecordRef));
  const current = records.filter((record) => !superseded.has(record.acceptedRecordRef));
  const groups = new Map();
  for (const record of current) {
    const key = semanticHash({ recordClass: record.recordClass, scope: record.scope, aboutSelfRefs: record.aboutSelfRefs, affectedPartyRefs: record.affectedPartyRefs });
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  const conflicts = [...groups.values()].filter((group) => group.length > 1).map((group) => group.map((record) => record.acceptedRecordRef).sort());
  return deepFreeze({
    schemaVersion: 'vexlife.continuity-record-set-validation/v1',
    state: conflicts.length ? 'HELD_CONFLICT' : 'CURRENT',
    currentRecordRefs: current.map((record) => record.acceptedRecordRef).sort(),
    supersededRecordRefs: [...superseded].sort(),
    conflicts,
    silentOverwriteAllowed: false
  });
}

export function createFamilySynchronizationReview(record, { targetLineageRefs, reviewerRef, privacyEvidenceRef, formedAt, expiresAt }) {
  validateAcceptedContinuityRecord(record);
  if (record.synchronizationScope !== 'FAMILY_CANDIDATE') throw new Error('record is not family-sync candidate scoped');
  const targets = stableRefs(targetLineageRefs, 'targetLineageRefs', { required: true });
  if (targets.some((ref) => !record.admittedTargetLineageRefs.includes(ref) || record.sourceLineageRefs.includes(ref))) throw new Error('family synchronization target lineage is not exactly admitted');
  const formed = canonicalTimestamp(formedAt, 'family synchronization review formedAt');
  const expires = canonicalTimestamp(expiresAt, 'family synchronization review expiresAt');
  afterOrEqual(expires, formed, 'family synchronization review expiry', { strict: true });
  return fingerprinted({
    schemaVersion: 'vexlife.family-synchronization-review/v1',
    acceptedRecordRef: record.acceptedRecordRef,
    acceptedRecordFingerprint: record.semanticFingerprint,
    synchronizationScope: record.synchronizationScope,
    visibilityScope: record.visibilityScope,
    privacyEvidenceRef,
    targetLineageRefs: targets,
    reviewerRef,
    disposition: 'ACCEPTED_OBSERVE_ONLY',
    formedAt: formed,
    expiresAt: expires,
    currentness: 'CURRENT'
  }, 'synchronizationReviewRef', 'family-synchronization-review');
}

export function createSiblingDeliveryAuthorityEvidence(review, { actorRef, authorityRef, targetLineageRef, formedAt, observedAt, expiresAt }) {
  assertCanonical(review, 'synchronizationReviewRef', 'family-synchronization-review', 'family synchronization review');
  if (!review.targetLineageRefs.includes(targetLineageRef) || !actorRef || !authorityRef) throw new Error('delivery authority requires exact admitted target and authority');
  const formed = canonicalTimestamp(formedAt, 'delivery authority formedAt');
  const observed = canonicalTimestamp(observedAt, 'delivery authority observedAt');
  const expires = canonicalTimestamp(expiresAt, 'delivery authority expiresAt');
  afterOrEqual(observed, formed, 'delivery authority');
  afterOrEqual(expires, observed, 'delivery authority expiry', { strict: true });
  return fingerprinted({
    schemaVersion: 'vexlife.sibling-delivery-authority/v1',
    synchronizationReviewRef: review.synchronizationReviewRef,
    acceptedRecordRef: review.acceptedRecordRef,
    targetLineageRef,
    actorRef,
    authorityRef,
    formedAt: formed,
    observedAt: observed,
    expiresAt: expires,
    currentness: 'CURRENT'
  }, 'deliveryEvidenceRef', 'sibling-delivery-authority');
}

export function createSiblingContinuityProjection(record, { targetLineageRef, synchronizationReview, deliveryAuthorityEvidence, formedAt = new Date().toISOString() }) {
  validateAcceptedContinuityRecord(record);
  assertCanonical(synchronizationReview, 'synchronizationReviewRef', 'family-synchronization-review', 'family synchronization review');
  assertCanonical(deliveryAuthorityEvidence, 'deliveryEvidenceRef', 'sibling-delivery-authority', 'sibling delivery authority');
  const time = canonicalTimestamp(formedAt, 'sibling projection formedAt');
  if (synchronizationReview.acceptedRecordRef !== record.acceptedRecordRef || synchronizationReview.acceptedRecordFingerprint !== record.semanticFingerprint ||
      synchronizationReview.synchronizationScope !== record.synchronizationScope || synchronizationReview.visibilityScope !== record.visibilityScope ||
      synchronizationReview.privacyEvidenceRef !== record.privacyEvidenceRef || !synchronizationReview.targetLineageRefs.includes(targetLineageRef) ||
      deliveryAuthorityEvidence.synchronizationReviewRef !== synchronizationReview.synchronizationReviewRef ||
      deliveryAuthorityEvidence.acceptedRecordRef !== record.acceptedRecordRef || deliveryAuthorityEvidence.targetLineageRef !== targetLineageRef ||
      deliveryAuthorityEvidence.currentness !== 'CURRENT' || Date.parse(time) >= Date.parse(deliveryAuthorityEvidence.expiresAt) || Date.parse(time) >= Date.parse(synchronizationReview.expiresAt)) {
    throw new Error('sibling projection lacks exact current synchronization/privacy/delivery authority');
  }
  return fingerprinted({
    schemaVersion: 'vexlife.sibling-continuity-projection/v1',
    acceptedRecordRef: record.acceptedRecordRef,
    sourceLineageRefs: [...record.sourceLineageRefs],
    targetLineageRef,
    synchronizationReviewRef: synchronizationReview.synchronizationReviewRef,
    deliveryEvidenceRef: deliveryAuthorityEvidence.deliveryEvidenceRef,
    privacyEvidenceRef: record.privacyEvidenceRef,
    recordClass: record.recordClass,
    scope: record.scope,
    state: 'OBSERVE_ONLY_PENDING_LOCAL_REVIEW',
    livedByTargetLineage: false,
    claimsSourceExperienceAsOwn: false,
    rawSourceContentIncluded: false,
    formedAt: time
  }, 'projectionRef', 'sibling-continuity-projection');
}

export function recordContinuityRecurrence({ acceptedRecord, observation, priorEvidence = null, scope = acceptedRecord.scope, reopenThreshold = 2, observedAt = new Date().toISOString() }) {
  validateAcceptedContinuityRecord(acceptedRecord);
  validateContinuityObservation(observation);
  if (scope !== acceptedRecord.scope) throw new Error('recurrence evidence cannot broaden accepted scope');
  if (observation.observationType !== 'REPEATED_BEHAVIOR_RECURRENCE' || observation.currentness !== 'CURRENT') throw new Error('recurrence requires a current REPEATED_BEHAVIOR_RECURRENCE observation');
  if (!acceptedRecord.sourceLineageRefs.includes(observation.sourceLineageRef)) throw new Error('recurrence source lineage mismatch');
  afterOrEqual(observation.formedAt, acceptedRecord.acceptedAt, 'recurrence observation', { strict: true });
  const binding = observation.recurrenceBinding;
  if (!binding || binding.acceptedRecordRef !== acceptedRecord.acceptedRecordRef || binding.acceptedRecordFingerprint !== acceptedRecord.semanticFingerprint ||
      binding.burdenReleaseRef !== acceptedRecord.burdenReleaseRef || !exactRefs(binding.evaluationRefs, acceptedRecord.burdenRelease?.evaluationRefs ?? [])) throw new Error('recurrence observation does not bind exact accepted record/pattern/evaluation');
  if (priorEvidence) {
    validateContinuityRecurrenceEvidence(priorEvidence);
    if (priorEvidence.observationBindings.some((item) => item.observationRef === observation.observationRef && item.observationFingerprint === observation.semanticFingerprint)) return deepFreeze({
      ...priorEvidence,
      changed: false,
      duplicateSuppressed: true,
      semanticModelTurnRequired: false,
      scopeBroadened: false,
      weightRouteState: 'NOT_ADMITTED'
    });
    if (binding.priorRecurrenceRef !== priorEvidence.recurrenceRef || binding.priorRecurrenceFingerprint !== priorEvidence.semanticFingerprint) throw new Error('recurrence prior evidence chain mismatch');
  } else if (binding.priorRecurrenceRef || binding.priorRecurrenceFingerprint) throw new Error('recurrence invents prior evidence');
  const time = canonicalTimestamp(observedAt, 'recurrence observedAt');
  afterOrEqual(time, observation.formedAt, 'recurrence observation time');
  if (priorEvidence) afterOrEqual(time, priorEvidence.observedAt, 'recurrence chain', { strict: true });
  const observationBindings = [...(priorEvidence?.observationBindings ?? []), {
    observationRef: observation.observationRef,
    observationFingerprint: observation.semanticFingerprint
  }].sort((left, right) => left.observationRef.localeCompare(right.observationRef));
  if (new Set(observationBindings.map((item) => item.observationRef)).size !== observationBindings.length) throw new Error('recurrence contains same-ref/different-evidence conflict');
  const observationRefs = observationBindings.map((item) => item.observationRef);
  const observationFingerprints = observationBindings.map((item) => item.observationFingerprint);
  const recurrenceCount = observationBindings.length;
  const recurrenceState = recurrenceCount >= reopenThreshold ? 'REOPEN_REVIEW' : 'MONITORING';
  return fingerprinted({
    schemaVersion: 'vexlife.continuity-recurrence-evidence/v1',
    acceptedRecordRef: acceptedRecord.acceptedRecordRef,
    acceptedRecordFingerprint: acceptedRecord.semanticFingerprint,
    burdenReleaseRef: acceptedRecord.burdenReleaseRef,
    evaluationRefs: [...(acceptedRecord.burdenRelease?.evaluationRefs ?? [])],
    sourceLineageRef: observation.sourceLineageRef,
    scope,
    priorRecurrenceRef: priorEvidence?.recurrenceRef ?? null,
    priorRecurrenceFingerprint: priorEvidence?.semanticFingerprint ?? null,
    observationBindings,
    observationRefs,
    observationFingerprints,
    reopenThreshold,
    recurrenceCount,
    recurrenceState,
    changed: true,
    duplicateSuppressed: false,
    semanticModelTurnRequired: recurrenceState === 'REOPEN_REVIEW',
    scopeBroadened: false,
    weightRouteState: 'NOT_ADMITTED',
    observedAt: time
  }, 'recurrenceRef', 'continuity-recurrence');
}

export function validateContinuityRecurrenceEvidence(evidence) {
  assertCanonical(evidence, 'recurrenceRef', 'continuity-recurrence', 'continuity recurrence evidence');
  if (evidence.schemaVersion !== 'vexlife.continuity-recurrence-evidence/v1' || evidence.changed !== true ||
      evidence.scopeBroadened !== false || evidence.weightRouteState !== 'NOT_ADMITTED' ||
      !['MONITORING', 'REOPEN_REVIEW', 'STABLE_RELEASE'].includes(evidence.recurrenceState)) {
    throw new Error('continuity recurrence evidence state or boundary mismatch');
  }
  canonicalTimestamp(evidence.observedAt, 'recurrence observedAt');
  if (!evidence.acceptedRecordRef || !evidence.acceptedRecordFingerprint || !evidence.burdenReleaseRef ||
      !Number.isInteger(evidence.reopenThreshold) || evidence.reopenThreshold < 1 ||
      !Array.isArray(evidence.observationBindings) ||
      evidence.recurrenceCount !== evidence.observationFingerprints.length ||
      evidence.observationRefs.length !== evidence.observationFingerprints.length ||
      evidence.observationBindings.length !== evidence.observationRefs.length ||
      evidence.observationBindings.some((item, index) => item.observationRef !== evidence.observationRefs[index] || item.observationFingerprint !== evidence.observationFingerprints[index])) {
    throw new Error('continuity recurrence evidence exact chain coverage mismatch');
  }
  return evidence;
}

export function validateTransientContinuityContext(context) {
  assertCanonical(context, 'contextRecordRef', 'transient-continuity-context', 'transient continuity context');
  if (context.schemaVersion !== 'vexlife.transient-continuity-context/v1' || context.currentness !== 'TRANSIENT' ||
      context.lifecycle !== 'LEASE_BOUND_CONTEXT' || context.durableRecordCreated !== false) {
    throw new Error('transient continuity context boundary mismatch');
  }
  canonicalTimestamp(context.acceptedAt, 'transient context acceptedAt');
  canonicalTimestamp(context.expiresAt, 'transient context expiresAt');
  afterOrEqual(context.expiresAt, context.acceptedAt, 'transient context expiry', { strict: true });
  assertCanonical(context.contextLease, 'contextBindingRef', 'continuity-current-context', 'transient context lease');
  if (context.contextLease.candidateRef !== context.candidateRef || context.contextLease.reviewRef !== context.reviewRef ||
      context.contextLease.expiresAt !== context.expiresAt || !context.candidateFingerprint || !context.routeRef ||
      !context.routeFingerprint || !context.reviewFingerprint ||
      context.acceptanceEvidence?.length !== context.acceptedByRefs?.length ||
      !exactRefs(context.acceptanceEvidenceRefs, stableRefs(context.acceptanceEvidence.map((item) => item.acceptanceEvidenceRef), 'transient acceptanceEvidenceRefs', { required: true }))) {
    throw new Error('transient continuity context does not bind exact lease/lineage/evidence');
  }
  for (const evidence of context.acceptanceEvidence) validateContinuityAcceptanceEvidence(evidence, { acceptedAt: context.acceptedAt });
  return context;
}

export function projectApplicableContinuity({ records, applicableScopes, tokenBudget = 256 }) {
  const scopeSet = new Set(applicableScopes);
  const selected = [];
  let usedTokens = 0;
  for (const record of records.map(validateAcceptedContinuityRecord)
    .filter((item) => scopeSet.has(item.scope))
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
    selected.push(candidate); usedTokens += cost;
  }
  const core = {
    schemaVersion: 'vexlife.applicable-continuity-projection/v1',
    selected,
    selectedRecordRefs: selected.map((item) => item.acceptedRecordRef),
    tokenBudget,
    usedTokens,
    rawSourceContentIncluded: false,
    allHistoricalRecordsLoaded: false,
    weightArtifactsLoaded: false
  };
  return deepFreeze({ ...core, semanticFingerprint: semanticHash(core) });
}

export function projectContinuityRecord(record) {
  validateAcceptedContinuityRecord(record);
  return deepFreeze({
    schemaVersion: 'vexlife.continuity-human-projection/v1',
    acceptedRecordRef: record.acceptedRecordRef,
    observedPatternOrPreferenceRef: record.summaryRef,
    experienceOrPreferenceOwnerRefs: stableRefs([...record.aboutSelfRefs, ...record.affectedPartyRefs], 'projection owner refs'),
    sourceSupport: { observationRefs: [...record.sourceObservationRefs], sourceBindingCount: record.sourceBindings.length, rawContentIncluded: false },
    privacyEvidenceRef: record.privacyEvidenceRef,
    redactionEvidenceRef: record.redactionEvidenceRef,
    changed: record.recordClass,
    authorityTransition: record.burdenRelease?.authorityTransition ?? 'ACCEPTED_SCOPED_RECORD',
    protectedCapabilities: [...record.protectedCapabilities],
    prohibitedOvercorrections: [...record.prohibitedOvercorrections],
    scope: record.scope,
    state: record.lifecycle,
    nextSafeAction: record.lifecycle === 'INACTIVE_PENDING_DETERMINISTIC_IMPLEMENTATION_REVIEW'
      ? 'OPEN_SEPARATE_DETERMINISTIC_IMPLEMENTATION_REVIEW'
      : record.recurrenceState === 'REOPEN_REVIEW' ? 'RETURN_TO_CONTEXT_REVIEW' : 'APPLY_BY_REF_ONLY_WHEN_SCOPE_MATCHES'
  });
}

// [VXG RealForever]
