import {
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
export const CONTINUITY_AUTHORITY_EVIDENCE_CLASSES = Object.freeze(['SIMULATED_CURRENT']);

export { createContinuityAuthoritySnapshot, validateContinuityAuthoritySnapshot };

export const CONTINUITY_SCOPE_TARGET_REQUIRED_FIELDS = Object.freeze([
  'schemaVersion', 'scopeClass', 'targetKind', 'targetRefs', 'projectRef', 'threadRef',
  'channelRef', 'turnRef', 'subjectRefs', 'applicable', 'scopeTargetRef', 'semanticFingerprint'
]);

export const CONTINUITY_CONTEXT_REVIEW_REQUIRED_FIELDS = Object.freeze([
  'schemaVersion', 'candidateRef', 'candidateFingerprint', 'routeRef', 'routeFingerprint',
  'sourceObservationRefs', 'sourceBindings', 'originClassification', 'originConfidence',
  'observedConsequence', 'candidateScope', 'scopeTargetRef', 'scopeTargetFingerprint',
  'proposedPrimaryDestination', 'proposedLinkedDestinations',
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
  'scopeTargetRef', 'scopeTargetFingerprint', 'burdenRef', 'burdenIdentityFingerprint',
  'burdenSourceFingerprint',
  'sourceRef', 'sourceHash', 'formationRef', 'formedAt', 'observedAt', 'expiresAt',
  'currentness', 'evidenceClass', 'simulatedAuthority', 'liveAuthorityGranted',
  'externalEffectsAuthorized', 'acceptanceDisposition', 'acceptanceEvidenceRef', 'semanticFingerprint'
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

function exactObservationCoordinate(observations, field, scopeClass) {
  if (observations.some((item) => !item[field])) throw new Error(`${scopeClass} scope requires every source observation to carry ${field}`);
  const values = stableRefs(observations.map((item) => item[field]), `${scopeClass}.${field}`, { required: true });
  if (values.length !== 1) throw new Error(`${scopeClass} scope has ambiguous multiple ${field} targets`);
  return values[0];
}

function sourceSubjectRefs(observations) {
  return stableRefs(observations.flatMap((item) => [
    item.sourceLineageRef,
    ...item.sourceSpeakerRefs,
    ...item.sourceRecipientRefs
  ]), 'source subject refs', { required: true });
}

function requireSourceSubjects(observations, targets, label) {
  const sourceSubjects = new Set(sourceSubjectRefs(observations));
  if (targets.some((ref) => !sourceSubjects.has(ref))) throw new Error(`${label} target is not present in source subjects or lineage`);
}

export function deriveContinuityScopeTarget({
  observations,
  scopeClass,
  aboutSelfRefs = [],
  affectedPartyRefs = [],
  institutionalAuthorityRefs = [],
  admittedTargetLineageRefs = []
}) {
  const sources = observations.map(validateContinuityObservation);
  if (!CONTINUITY_SCOPE_CLASSES.includes(scopeClass)) throw new Error(`unknown scope target class ${scopeClass}`);
  let targetKind = scopeClass;
  let targetRefs = [];
  let projectRef = null;
  let threadRef = null;
  let channelRef = null;
  let turnRef = null;
  let subjectRefs = [];
  let applicable = true;
  const sourceLineageRefs = stableRefs(sources.map((item) => item.sourceLineageRef), 'scope target sourceLineageRefs', { required: true });
  if (scopeClass === 'CURRENT_TURN') {
    turnRef = exactObservationCoordinate(sources, 'turnRef', scopeClass);
    threadRef = exactObservationCoordinate(sources, 'threadRef', scopeClass);
    channelRef = exactObservationCoordinate(sources, 'channelRef', scopeClass);
    targetRefs = [turnRef, threadRef, channelRef].sort();
  } else if (scopeClass === 'CHANNEL') {
    channelRef = exactObservationCoordinate(sources, 'channelRef', scopeClass);
    targetRefs = [channelRef];
  } else if (scopeClass === 'THREAD') {
    threadRef = exactObservationCoordinate(sources, 'threadRef', scopeClass);
    targetRefs = [threadRef];
  } else if (scopeClass === 'PROJECT') {
    projectRef = exactObservationCoordinate(sources, 'projectRef', scopeClass);
    targetRefs = [projectRef];
  } else if (['HUMAN_SELF', 'VEX_SELF'].includes(scopeClass)) {
    subjectRefs = stableRefs(aboutSelfRefs, `${scopeClass} aboutSelfRefs`, { required: true });
    requireSourceSubjects(sources, subjectRefs, scopeClass);
    targetRefs = [...subjectRefs];
  } else if (scopeClass === 'RELATIONSHIP') {
    subjectRefs = stableRefs(affectedPartyRefs, 'RELATIONSHIP affectedPartyRefs', { required: true });
    if (subjectRefs.length < 2) throw new Error('RELATIONSHIP scope requires an exact affected-party set');
    requireSourceSubjects(sources, subjectRefs, scopeClass);
    targetRefs = [...subjectRefs];
  } else if (scopeClass === 'DEVICE_LINEAGE') {
    targetKind = 'DEVICE_LINEAGE';
    targetRefs = [...sourceLineageRefs];
    if (targetRefs.length !== 1) throw new Error('DEVICE_LINEAGE scope requires one exact source lineage target');
  } else if (scopeClass === 'FAMILY_CANDIDATE') {
    targetKind = 'FAMILY_CANDIDATE_SET';
    targetRefs = stableRefs([...sourceLineageRefs, ...admittedTargetLineageRefs], 'FAMILY_CANDIDATE lineage targets', { required: true });
  } else if (scopeClass === 'INSTITUTION') {
    targetKind = 'INSTITUTIONAL_AUTHORITY_SET';
    subjectRefs = stableRefs(institutionalAuthorityRefs, 'INSTITUTION authority targets', { required: true });
    targetRefs = [...subjectRefs];
  } else {
    targetKind = 'HELD_NON_APPLICABLE';
    targetRefs = sources.map((item) => item.observationRef).sort();
    applicable = false;
  }
  return fingerprinted({
    schemaVersion: 'vexlife.continuity-scope-target/v1',
    scopeClass,
    targetKind,
    targetRefs,
    projectRef,
    threadRef,
    channelRef,
    turnRef,
    subjectRefs,
    applicable
  }, 'scopeTargetRef', 'continuity-scope-target');
}

export function validateContinuityScopeTarget(scopeTarget) {
  assertCanonical(scopeTarget, 'scopeTargetRef', 'continuity-scope-target', 'continuity scope target');
  if (scopeTarget.schemaVersion !== 'vexlife.continuity-scope-target/v1' ||
      !CONTINUITY_SCOPE_CLASSES.includes(scopeTarget.scopeClass) ||
      !Array.isArray(scopeTarget.targetRefs) || !Array.isArray(scopeTarget.subjectRefs) ||
      typeof scopeTarget.applicable !== 'boolean') throw new Error('continuity scope target contract is malformed');
  return scopeTarget;
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
  const scopeTarget = deriveContinuityScopeTarget({
    observations,
    scopeClass: input.candidateScope,
    aboutSelfRefs: input.aboutSelfRefs,
    affectedPartyRefs: input.affectedPartyRefs,
    institutionalAuthorityRefs: input.institutionalAuthorityRefs,
    admittedTargetLineageRefs: input.admittedTargetLineageRefs
  });
  if (input.scopeTarget && input.scopeTarget.semanticFingerprint !== scopeTarget.semanticFingerprint) {
    throw new Error('candidate-provided scope target does not match the source-derived target');
  }
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
    scopeTarget,
    scopeTargetRef: scopeTarget.scopeTargetRef,
    scopeTargetFingerprint: scopeTarget.semanticFingerprint,
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
  validateContinuityScopeTarget(candidate.scopeTarget);
  if (candidate.scopeTarget.scopeClass !== candidate.candidateScope || candidate.scopeTargetRef !== candidate.scopeTarget.scopeTargetRef ||
      candidate.scopeTargetFingerprint !== candidate.scopeTarget.semanticFingerprint) throw new Error('continuity candidate scope target binding mismatch');
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
    candidateScope: candidate.candidateScope,
    scopeTargetRef: candidate.scopeTargetRef,
    scopeTargetFingerprint: candidate.scopeTargetFingerprint,
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
    scopeTargetRef: candidate.scopeTargetRef,
    scopeTargetFingerprint: candidate.scopeTargetFingerprint,
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
      review.candidateFingerprint !== candidate.semanticFingerprint || review.routeFingerprint !== route.semanticFingerprint ||
      review.scopeTargetRef !== candidate.scopeTargetRef || review.scopeTargetFingerprint !== candidate.scopeTargetFingerprint ||
      route.scopeTargetRef !== candidate.scopeTargetRef || route.scopeTargetFingerprint !== candidate.scopeTargetFingerprint) {
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
      snapshot.scopeTargetRef !== candidate.scopeTargetRef || snapshot.scopeTargetFingerprint !== candidate.scopeTargetFingerprint ||
      !exactRefs(snapshot.subjectRefs, acceptanceSubjects(candidate, route))) {
    throw new Error('authority snapshot does not exactly bind record class, subjects, scope and target');
  }
  if ([candidate.candidateRef, review.reviewRef].includes(snapshot.sourceRef) ||
      [candidate.candidateRef, review.reviewRef].includes(snapshot.formationRef)) {
    throw new Error('candidate and Context Review cannot issue their own authority evidence');
  }
  const burden = route.proposedPrimaryDestination === 'BURDEN_RELEASE'
    ? formReviewedBurdenRelease(candidate, route, review)
    : null;
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
    scopeTargetRef: candidate.scopeTargetRef,
    scopeTargetFingerprint: candidate.scopeTargetFingerprint,
    burdenRef: burden?.burdenRef ?? null,
    burdenIdentityFingerprint: burden?.identityFingerprint ?? null,
    burdenSourceFingerprint: burden ? semanticHash(burden.sourceForm) : null,
    sourceRef: snapshot.sourceRef,
    sourceHash: snapshot.sourceHash,
    formationRef: snapshot.formationRef,
    formedAt: snapshot.formedAt,
    observedAt: snapshot.observedAt,
    expiresAt: snapshot.expiresAt,
    currentness: snapshot.currentness,
    evidenceClass: snapshot.evidenceClass,
    simulatedAuthority: true,
    liveAuthorityGranted: false,
    externalEffectsAuthorized: false,
    acceptanceDisposition: 'SIMULATION_ONLY_INACTIVE'
  }, 'acceptanceEvidenceRef', 'continuity-acceptance-evidence');
}

export function validateContinuityAcceptanceEvidence(evidence, { candidate, route, review, acceptedAt = null } = {}) {
  assertCanonical(evidence, 'acceptanceEvidenceRef', 'continuity-acceptance-evidence', 'continuity acceptance evidence');
  const snapshot = validateContinuityAuthoritySnapshot(evidence.authoritySnapshot, { observedAt: acceptedAt });
  if (evidence.schemaVersion !== 'vexlife.continuity-acceptance-evidence/v1' || evidence.currentness !== 'CURRENT' ||
      evidence.evidenceClass !== 'SIMULATED_CURRENT' || evidence.simulatedAuthority !== true ||
      evidence.liveAuthorityGranted !== false || evidence.externalEffectsAuthorized !== false ||
      evidence.acceptanceDisposition !== 'SIMULATION_ONLY_INACTIVE' ||
      evidence.authoritySnapshotRef !== snapshot.authoritySnapshotRef || evidence.authoritySnapshotFingerprint !== snapshot.semanticFingerprint ||
      evidence.actorRef !== snapshot.actorRef || evidence.authorityRef !== snapshot.authorityRef ||
      evidence.recordClass !== snapshot.recordClass || evidence.scope !== snapshot.scope ||
      evidence.scopeTargetRef !== snapshot.scopeTargetRef || evidence.scopeTargetFingerprint !== snapshot.scopeTargetFingerprint ||
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
        evidence.scopeTargetRef !== candidate.scopeTargetRef || evidence.scopeTargetFingerprint !== candidate.scopeTargetFingerprint ||
        !exactRefs(evidence.subjectRefs, acceptanceSubjects(candidate, route)) || evidence.actorRef !== evidence.authorityRef ||
        !review.requiredAcceptanceRefs.includes(evidence.authorityRef) || [candidate.candidateRef, review.reviewRef].includes(evidence.sourceRef) ||
        [candidate.candidateRef, review.reviewRef].includes(evidence.formationRef)) throw new Error('acceptance evidence does not exactly bind aggregate lineage, actor, subject, scope, source and policy');
    const burden = route.proposedPrimaryDestination === 'BURDEN_RELEASE'
      ? formReviewedBurdenRelease(candidate, route, review)
      : null;
    if (evidence.burdenRef !== (burden?.burdenRef ?? null) ||
        evidence.burdenIdentityFingerprint !== (burden?.identityFingerprint ?? null) ||
        evidence.burdenSourceFingerprint !== (burden ? semanticHash(burden.sourceForm) : null)) {
      throw new Error('acceptance evidence does not bind the exact reviewed Burden meaning');
    }
  }
  return evidence;
}

export function createCurrentContextLease({ candidate, route, review, leaseRef, turnRef, threadRef, channelRef = null, formedAt, observedAt, expiresAt, tokenBudget = 256 }) {
  validateContinuityContextReview(candidate, route, review);
  if (route.proposedPrimaryDestination !== 'CURRENT_CONTEXT') throw new Error('current-context lease can bind only CURRENT_CONTEXT');
  if (!leaseRef || !turnRef || !threadRef || !channelRef) throw new Error('CURRENT_CONTEXT requires exact lease, turn, thread and channel refs');
  if (candidate.candidateScope !== 'CURRENT_TURN' || candidate.scopeTarget.targetKind !== 'CURRENT_TURN' ||
      candidate.scopeTarget.turnRef !== turnRef || candidate.scopeTarget.threadRef !== threadRef || candidate.scopeTarget.channelRef !== channelRef) {
    throw new Error('CURRENT_CONTEXT lease coordinates do not exactly match the source-derived turn/thread/channel target');
  }
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
    scopeTargetRef: candidate.scopeTargetRef,
    scopeTargetFingerprint: candidate.scopeTargetFingerprint,
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

function authorityDisposition(authorityEvidence) {
  const evidence = [...authorityEvidence];
  const classes = stableRefs(evidence.map((item) => item.evidenceClass), 'authority evidence classes', { required: true });
  if (!exactRefs(classes, ['SIMULATED_CURRENT']) || evidence.some((item) =>
    item.simulatedAuthority !== true || item.liveAuthorityGranted !== false ||
    item.externalEffectsAuthorized !== false || item.acceptanceDisposition !== 'SIMULATION_ONLY_INACTIVE')) {
    throw new Error('mixed or promoted authority evidence cannot form one accepted continuity disposition');
  }
  return deepFreeze({
    authorityEvidenceClass: 'SIMULATED_CURRENT',
    simulatedAuthority: true,
    liveAuthorityGranted: false,
    externalEffectsAuthorized: false,
    acceptanceDisposition: 'SIMULATION_ONLY_INACTIVE',
    liveApplicabilityGranted: false,
    synchronizationAuthorityActive: false,
    familyDeliveryAuthorized: false,
    publicationAuthorityActive: false
  });
}

function transitionTime(start, offsetMs, ceiling) {
  const value = new Date(Date.parse(start) + offsetMs).toISOString();
  if (Date.parse(value) >= Date.parse(ceiling)) throw new Error('Burden Release review interval is too small for replayed lifecycle');
  return value;
}

function formReviewedBurdenRelease(candidate, route, review) {
  const spec = candidate.burdenRelease;
  if (!spec) throw new Error('BURDEN_RELEASE route requires a Burden Release contract payload');
  return createBurdenRelease({
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
    scopeTargetRef: candidate.scopeTargetRef,
    scopeTargetFingerprint: candidate.scopeTargetFingerprint,
    requiredAcceptanceRefs: review.requiredAcceptanceRefs,
    formedAt: candidate.formedAt,
    supersedesRef: review.supersedesRef
  });
}

function validateAggregateSnapshot(aggregate) {
  if (!aggregate || aggregate.schemaVersion !== 'vexlife.continuity-evolution-aggregate/v1' ||
      aggregate.currentness !== 'CURRENT' || !SHA256.test(aggregate.semanticFingerprint ?? '')) {
    throw new Error('Burden Release acceptance requires an exact current continuity aggregate');
  }
  const core = structuredClone(aggregate);
  const fingerprint = core.semanticFingerprint;
  delete core.semanticFingerprint;
  if (semanticHash(core) !== fingerprint) throw new Error('continuity aggregate fingerprint mismatch');
  return aggregate;
}

function validateAggregateOwnedBurdenAcceptance(aggregate, candidate, route, review, authorityEvidence) {
  validateAggregateSnapshot(aggregate);
  const storedCandidate = aggregate.candidates?.find((item) => item.candidateRef === candidate.candidateRef);
  const storedReview = aggregate.reviews?.find((item) => item.reviewRef === review.reviewRef);
  if (!storedCandidate || storedCandidate.semanticFingerprint !== candidate.semanticFingerprint ||
      semanticHash(storedCandidate) !== semanticHash(candidate)) {
    throw new Error('Burden Release candidate is not exact aggregate-owned current lineage');
  }
  const observations = candidate.observationBindings.map((binding) => {
    const stored = aggregate.observations?.find((item) => item.observationRef === binding.observationRef);
    if (!stored || stored.semanticFingerprint !== binding.observationFingerprint) {
      throw new Error('Burden Release candidate source is not exact aggregate-owned observation lineage');
    }
    validateContinuityObservation(stored);
    return stored;
  });
  const expectedTarget = deriveContinuityScopeTarget({
    observations,
    scopeClass: candidate.candidateScope,
    aboutSelfRefs: candidate.aboutSelfRefs,
    affectedPartyRefs: candidate.affectedPartyRefs,
    institutionalAuthorityRefs: candidate.institutionalAuthorityRefs,
    admittedTargetLineageRefs: candidate.admittedTargetLineageRefs
  });
  if (expectedTarget.semanticFingerprint !== candidate.scopeTargetFingerprint ||
      expectedTarget.scopeTargetRef !== candidate.scopeTargetRef ||
      !storedReview || storedReview.semanticFingerprint !== review.semanticFingerprint ||
      semanticHash(storedReview) !== semanticHash(review)) {
    throw new Error('Burden Release route or Context Review is not exact aggregate-owned policy');
  }
  validateContinuityCandidate(storedCandidate);
  const canonicalRoute = routeContinuityCandidate(storedCandidate);
  if (canonicalRoute.semanticFingerprint !== route.semanticFingerprint || canonicalRoute.routeRef !== route.routeRef) {
    throw new Error('Burden Release route is not canonical aggregate-owned policy');
  }
  validateContinuityContextReview(storedCandidate, canonicalRoute, storedReview);
  for (const supplied of authorityEvidence) {
    const stored = aggregate.authorityEvidence?.find((item) => item.acceptanceEvidenceRef === supplied.acceptanceEvidenceRef);
    if (!stored || stored.semanticFingerprint !== supplied.semanticFingerprint || semanticHash(stored) !== semanticHash(supplied)) {
      throw new Error('Burden Release authority evidence is well-formed but not aggregate-recorded current evidence');
    }
    validateContinuityAcceptanceEvidence(stored, { candidate: storedCandidate, route: canonicalRoute, review: storedReview });
  }
}

function acceptReviewedBurdenRelease(release, { candidate, route, review, authorityEvidence, actorRef, acceptedAt, evaluationRefs }) {
  validateBurdenRelease(release);
  const expected = formReviewedBurdenRelease(candidate, route, review);
  if (release.state !== 'CONTEXT_REVIEW' || release.burdenRef !== expected.burdenRef ||
      release.identityFingerprint !== expected.identityFingerprint ||
      semanticHash(release.sourceForm) !== semanticHash(expected.sourceForm)) {
    throw new Error('Burden Release acceptance requires the exact canonical reviewed source form at CONTEXT_REVIEW');
  }
  const accepted = stableRefs(authorityEvidence.map((item) => item.authorityRef), 'Burden Release acceptedByRefs', { required: true });
  if (!exactRefs(accepted, review.requiredAcceptanceRefs)) {
    throw new Error('Burden Release cannot deauthorize influence without exact canonical authority policy');
  }
  const evidence = [...authorityEvidence]
    .map((item) => structuredClone(item))
    .sort((left, right) => left.acceptanceEvidenceRef.localeCompare(right.acceptanceEvidenceRef));
  const acceptanceEvidenceRefs = stableRefs(evidence.map((item) => item.acceptanceEvidenceRef), 'Burden Release acceptanceEvidenceRefs', { required: true });
  const authoritySnapshotRefs = stableRefs(evidence.map((item) => item.authoritySnapshotRef), 'Burden Release authoritySnapshotRefs', { required: true });
  const transitionedAt = canonicalTimestamp(acceptedAt, 'Burden Release acceptedAt');
  afterOrEqual(transitionedAt, release.lastTransition?.transitionedAt ?? release.formedAt, 'Burden Release transition', { strict: true });
  const receiptCore = {
    schemaVersion: 'vexlife.burden-release-transition/v1',
    burdenRef: release.burdenRef,
    sequence: release.transitionReceipts.length,
    priorState: release.state,
    nextState: 'ACCEPTED_DEAUTHORIZED',
    actorRef,
    transitionedAt,
    reason: 'EXACT_SCOPE_INFLUENCE_DEAUTHORIZED',
    priorReleaseFingerprint: release.semanticFingerprint,
    acceptedByRefs: accepted,
    authorityEvidence: evidence,
    acceptanceEvidenceRefs,
    authoritySnapshotRefs,
    evaluationRefs: stableRefs(evaluationRefs ?? [], 'Burden Release evaluationRefs'),
    recurrenceState: 'MONITORING_AVAILABLE'
  };
  const transitionRef = `burden-release-transition.${semanticHash(receiptCore).slice(0, 24)}`;
  const receiptWithoutFingerprint = { ...receiptCore, transitionRef };
  const receipt = deepFreeze({ ...receiptWithoutFingerprint, semanticFingerprint: semanticHash(receiptWithoutFingerprint) });
  const core = structuredClone(release);
  delete core.semanticFingerprint;
  core.state = 'ACCEPTED_DEAUTHORIZED';
  core.acceptedByRefs = accepted;
  core.acceptanceEvidence = evidence;
  core.acceptanceEvidenceRefs = acceptanceEvidenceRefs;
  core.authoritySnapshotRefs = authoritySnapshotRefs;
  core.acceptedAt = transitionedAt;
  core.evaluationRefs = receipt.evaluationRefs;
  core.recurrenceState = receipt.recurrenceState;
  core.transitionReceipts = [...release.transitionReceipts, receipt];
  core.lastTransition = receipt;
  const acceptedRelease = deepFreeze({ ...core, semanticFingerprint: semanticHash(core) });
  validateBurdenRelease(acceptedRelease);
  return acceptedRelease;
}

function acceptedBurden(candidate, review, acceptedByRefs, authorityEvidence, acceptedAt) {
  const route = routeContinuityCandidate(candidate);
  let release = formReviewedBurdenRelease(candidate, route, review);
  for (const [index, nextState] of ['NAMED', 'RECOGNIZED', 'RELEASE_PROPOSED'].entries()) release = transitionBurdenRelease(release, {
    nextState,
    actorRef: review.reviewerRef,
    transitionedAt: transitionTime(candidate.formedAt, index + 1, review.reviewedAt),
    reason: `REPLAYED_${nextState}`
  });
  release = transitionBurdenRelease(release, {
    nextState: 'CONTEXT_REVIEW', actorRef: review.reviewerRef, transitionedAt: review.reviewedAt, reason: review.reviewRef
  });
  return acceptReviewedBurdenRelease(release, {
    candidate,
    route,
    review,
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
  const disposition = authorityDisposition(evidence);
  if (route.proposedPrimaryDestination === 'BURDEN_RELEASE') {
    validateAggregateOwnedBurdenAcceptance(input.aggregate, candidate, route, review, evidence);
  }
  if (route.proposedPrimaryDestination === 'CURRENT_CONTEXT') {
    const lease = input.currentContextLease;
    assertCanonical(lease, 'contextBindingRef', 'continuity-current-context', 'current-context lease');
    const expectedLease = createCurrentContextLease({
      candidate,
      route,
      review,
      leaseRef: lease.leaseRef,
      turnRef: lease.turnRef,
      threadRef: lease.threadRef,
      channelRef: lease.channelRef,
      formedAt: lease.formedAt,
      observedAt: lease.observedAt,
      expiresAt: lease.expiresAt,
      tokenBudget: lease.tokenBudget
    });
    if (lease.semanticFingerprint !== expectedLease.semanticFingerprint || lease.candidateRef !== candidate.candidateRef ||
        lease.reviewRef !== review.reviewRef || lease.scopeTargetRef !== candidate.scopeTargetRef ||
        lease.scopeTargetFingerprint !== candidate.scopeTargetFingerprint || Date.parse(acceptedAt) >= Date.parse(lease.expiresAt)) {
      throw new Error('CURRENT_CONTEXT lease is stale, cross-target or unbound');
    }
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
      scopeTargetRef: candidate.scopeTargetRef,
      scopeTargetFingerprint: candidate.scopeTargetFingerprint,
      acceptedByRefs: accepted,
      acceptanceEvidence: evidence,
      acceptanceEvidenceRefs: evidence.map((item) => item.acceptanceEvidenceRef),
      contextLease: lease,
      formedAt: candidate.formedAt,
      acceptedAt,
      expiresAt: lease.expiresAt,
      currentness: 'TRANSIENT',
      lifecycle: 'LEASE_BOUND_CONTEXT',
      ...disposition,
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
    scopeTargetRef: candidate.scopeTargetRef,
    scopeTargetFingerprint: candidate.scopeTargetFingerprint,
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
    lifecycle: route.proposedPrimaryDestination === 'DETERMINISTIC_INVARIANT_CANDIDATE'
      ? 'INACTIVE_PENDING_DETERMINISTIC_IMPLEMENTATION_REVIEW'
      : 'SIMULATION_ONLY_INACTIVE',
    ...disposition,
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
  if (record.scopeTargetRef !== `continuity-scope-target.${record.scopeTargetFingerprint?.slice(0, 24)}` || !SHA256.test(record.scopeTargetFingerprint ?? '') ||
      record.authorityEvidenceClass !== 'SIMULATED_CURRENT' || record.simulatedAuthority !== true ||
      record.liveAuthorityGranted !== false || record.externalEffectsAuthorized !== false ||
      record.acceptanceDisposition !== 'SIMULATION_ONLY_INACTIVE' || record.liveApplicabilityGranted !== false ||
      record.synchronizationAuthorityActive !== false || record.familyDeliveryAuthorized !== false ||
      record.publicationAuthorityActive !== false ||
      !['SIMULATION_ONLY_INACTIVE', 'INACTIVE_PENDING_DETERMINISTIC_IMPLEMENTATION_REVIEW'].includes(record.lifecycle)) {
    throw new Error('accepted continuity record loses or promotes simulation-only authority disposition');
  }
  if (!exactRefs(record.acceptedByRefs, record.requiredAcceptanceRefs) || record.acceptanceEvidence?.length !== record.requiredAcceptanceRefs.length ||
      !exactRefs(record.acceptanceEvidenceRefs, stableRefs(record.acceptanceEvidence.map((item) => item.acceptanceEvidenceRef), 'acceptanceEvidenceRefs', { required: true }))) throw new Error('accepted record acceptance evidence coverage mismatch');
  for (const evidence of record.acceptanceEvidence) {
    validateContinuityAcceptanceEvidence(evidence, { acceptedAt: record.acceptedAt });
    if (evidence.candidateRef !== record.candidateRef || evidence.candidateFingerprint !== record.candidateFingerprint ||
        evidence.routeRef !== record.routeRef || evidence.routeFingerprint !== record.routeFingerprint ||
        evidence.reviewRef !== record.reviewRef || evidence.reviewFingerprint !== record.reviewFingerprint ||
        evidence.recordClass !== record.recordClass || evidence.scope !== record.scope ||
        evidence.scopeTargetRef !== record.scopeTargetRef || evidence.scopeTargetFingerprint !== record.scopeTargetFingerprint ||
        evidence.evidenceClass !== record.authorityEvidenceClass || evidence.simulatedAuthority !== record.simulatedAuthority ||
        evidence.liveAuthorityGranted !== record.liveAuthorityGranted ||
        evidence.externalEffectsAuthorized !== record.externalEffectsAuthorized ||
        evidence.acceptanceDisposition !== record.acceptanceDisposition ||
        !record.acceptedByRefs.includes(evidence.authorityRef)) {
      throw new Error('accepted record outer meaning is detached from its candidate/route/review/authority evidence');
    }
  }
  authorityDisposition(record.acceptanceEvidence);
  if (record.burdenRelease) {
    validateBurdenRelease(record.burdenRelease);
    if (record.recordClass !== 'BURDEN_RELEASE' || record.burdenReleaseRef !== record.burdenRelease.burdenRef ||
        record.burdenRelease.candidateRef !== record.candidateRef ||
        record.burdenRelease.candidateFingerprint !== record.candidateFingerprint ||
        record.burdenRelease.routeRef !== record.routeRef || record.burdenRelease.routeFingerprint !== record.routeFingerprint ||
        record.burdenRelease.reviewRef !== record.reviewRef || record.burdenRelease.reviewFingerprint !== record.reviewFingerprint ||
        record.burdenRelease.scope !== record.scope || record.burdenRelease.scopeTargetRef !== record.scopeTargetRef ||
        record.burdenRelease.scopeTargetFingerprint !== record.scopeTargetFingerprint ||
        !exactRefs(record.burdenRelease.acceptanceEvidenceRefs, record.acceptanceEvidenceRefs)) {
      throw new Error('accepted record Burden meaning is detached from its exact outer lineage');
    }
  } else if (record.recordClass === 'BURDEN_RELEASE' || record.burdenReleaseRef !== null ||
      record.acceptanceEvidence.some((item) => item.burdenRef !== null)) {
    throw new Error('accepted Burden record is missing exact reviewed Burden meaning');
  }
  if (record.weightActivationState !== 'INACTIVE' || record.effectAuthorityActive !== false) throw new Error('accepted continuity record implies active weight/effect authority');
  return record;
}

export function supersedeContinuityRecord(priorRecord, successorRecord, { rollbackRef, supersededAt = new Date().toISOString() }) {
  validateAcceptedContinuityRecord(priorRecord);
  validateAcceptedContinuityRecord(successorRecord);
  if (typeof rollbackRef !== 'string' || rollbackRef.trim() !== rollbackRef || rollbackRef.length === 0) {
    throw new Error('supersession requires an exact nonempty rollbackRef');
  }
  if (successorRecord.supersedesRef !== priorRecord.acceptedRecordRef) throw new Error('successor must preserve exact current prior ref');
  for (const field of ['recordClass', 'scope', 'scopeTargetRef', 'scopeTargetFingerprint', 'authorityEvidenceClass', 'acceptanceDisposition']) {
    if (successorRecord[field] !== priorRecord[field]) throw new Error(`supersession ${field} is incompatible`);
  }
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
  const priorMatches = records.filter((item) => item.acceptedRecordRef === transaction.priorRecordRef);
  const successorMatches = records.filter((item) => item.acceptedRecordRef === transaction.successorRecordRef);
  if (priorMatches.length !== 1 || successorMatches.length !== 1) {
    throw new Error('supersession transaction requires one exact prior and one exact successor');
  }
  const [prior] = priorMatches;
  const [successor] = successorMatches;
  if (prior.semanticFingerprint !== transaction.priorRecordFingerprint ||
      successor.semanticFingerprint !== transaction.successorRecordFingerprint) {
    throw new Error('supersession transaction does not bind exact aggregate-owned record fingerprints');
  }
  const expected = supersedeContinuityRecord(prior, successor, {
    rollbackRef: transaction.rollbackRef,
    supersededAt: transaction.supersededAt
  });
  if (transaction.schemaVersion !== 'vexlife.continuity-supersession-transaction/v1' ||
      transaction.supersessionRef !== expected.supersessionRef ||
      transaction.semanticFingerprint !== expected.semanticFingerprint ||
      semanticHash(transaction) !== semanticHash(expected)) {
    throw new Error('supersession transaction is not the exact recomputed source-managed transaction');
  }
  return transaction;
}

export function validateContinuityRecordSet(records, supersessions = []) {
  for (const record of records) validateAcceptedContinuityRecord(record);
  if (new Set(records.map((record) => record.acceptedRecordRef)).size !== records.length) {
    throw new Error('continuity record set contains duplicate record identity');
  }
  const transactionRefs = new Set();
  const supersededPriorRefs = new Set();
  for (const transaction of supersessions) {
    validateContinuitySupersession(transaction, records);
    if (transactionRefs.has(transaction.supersessionRef)) {
      throw new Error('continuity record set contains duplicate supersession transaction identity');
    }
    if (supersededPriorRefs.has(transaction.priorRecordRef)) {
      throw new Error('continuity record set contains more than one successor transaction for one prior');
    }
    transactionRefs.add(transaction.supersessionRef);
    supersededPriorRefs.add(transaction.priorRecordRef);
  }
  for (const transaction of supersessions) {
    const visited = new Set([transaction.priorRecordRef]);
    let successorRef = transaction.successorRecordRef;
    while (supersededPriorRefs.has(successorRef)) {
      if (visited.has(successorRef)) throw new Error('continuity supersession chain contains a cycle');
      visited.add(successorRef);
      successorRef = supersessions.find((item) => item.priorRecordRef === successorRef).successorRecordRef;
    }
  }
  const superseded = new Set(supersessions.map((item) => item.priorRecordRef));
  const current = records.filter((record) => !superseded.has(record.acceptedRecordRef));
  const groups = new Map();
  for (const record of current) {
    const key = semanticHash({
      recordClass: record.recordClass,
      scope: record.scope,
      scopeTargetRef: record.scopeTargetRef,
      scopeTargetFingerprint: record.scopeTargetFingerprint,
      aboutSelfRefs: record.aboutSelfRefs,
      affectedPartyRefs: record.affectedPartyRefs
    });
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  const conflicts = [...groups.values()].filter((group) => group.length > 1).map((group) => group.map((record) => record.acceptedRecordRef).sort());
  return fingerprinted({
    schemaVersion: 'vexlife.continuity-record-set-validation/v1',
    recordBindings: records.map((record) => ({
      acceptedRecordRef: record.acceptedRecordRef,
      acceptedRecordFingerprint: record.semanticFingerprint
    })).sort((left, right) => left.acceptedRecordRef.localeCompare(right.acceptedRecordRef)),
    supersessionBindings: supersessions.map((transaction) => ({
      supersessionRef: transaction.supersessionRef,
      supersessionFingerprint: transaction.semanticFingerprint
    })).sort((left, right) => left.supersessionRef.localeCompare(right.supersessionRef)),
    state: conflicts.length ? 'HELD_CONFLICT' : 'CURRENT',
    currentRecordRefs: current.map((record) => record.acceptedRecordRef).sort(),
    supersededRecordRefs: [...superseded].sort(),
    conflicts,
    silentOverwriteAllowed: false
  }, 'currentRecordSetRef', 'continuity-current-record-set');
}

export function createFamilySynchronizationReview(record, { targetLineageRefs, reviewerRef, privacyEvidenceRef, formedAt, expiresAt }) {
  validateAcceptedContinuityRecord(record);
  if (record.simulatedAuthority === true || record.familyDeliveryAuthorized !== true) {
    throw new Error('simulation-only continuity cannot authorize family synchronization or delivery');
  }
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
  if (record.simulatedAuthority === true || record.familyDeliveryAuthorized !== true) {
    throw new Error('simulation-only continuity cannot be projected for family delivery');
  }
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
    scopeTargetRef: record.scopeTargetRef,
    scopeTargetFingerprint: record.scopeTargetFingerprint,
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
    scopeTargetRef: acceptedRecord.scopeTargetRef,
    scopeTargetFingerprint: acceptedRecord.scopeTargetFingerprint,
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
      evidence.scopeTargetRef !== `continuity-scope-target.${evidence.scopeTargetFingerprint?.slice(0, 24)}` ||
      !SHA256.test(evidence.scopeTargetFingerprint ?? '') ||
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
      !context.routeFingerprint || !context.reviewFingerprint || context.scopeTargetRef !== context.contextLease.scopeTargetRef ||
      context.scopeTargetFingerprint !== context.contextLease.scopeTargetFingerprint ||
      context.authorityEvidenceClass !== 'SIMULATED_CURRENT' || context.simulatedAuthority !== true ||
      context.liveAuthorityGranted !== false || context.externalEffectsAuthorized !== false ||
      context.acceptanceDisposition !== 'SIMULATION_ONLY_INACTIVE' || context.liveApplicabilityGranted !== false ||
      context.synchronizationAuthorityActive !== false || context.familyDeliveryAuthorized !== false ||
      context.publicationAuthorityActive !== false ||
      context.acceptanceEvidence?.length !== context.acceptedByRefs?.length ||
      !exactRefs(context.acceptanceEvidenceRefs, stableRefs(context.acceptanceEvidence.map((item) => item.acceptanceEvidenceRef), 'transient acceptanceEvidenceRefs', { required: true }))) {
    throw new Error('transient continuity context does not bind exact lease/lineage/evidence');
  }
  for (const evidence of context.acceptanceEvidence) {
    validateContinuityAcceptanceEvidence(evidence, { acceptedAt: context.acceptedAt });
    if (evidence.candidateRef !== context.candidateRef || evidence.candidateFingerprint !== context.candidateFingerprint ||
        evidence.routeRef !== context.routeRef || evidence.routeFingerprint !== context.routeFingerprint ||
        evidence.reviewRef !== context.reviewRef || evidence.reviewFingerprint !== context.reviewFingerprint ||
        evidence.recordClass !== 'CURRENT_CONTEXT' || evidence.scope !== context.scope ||
        evidence.scopeTargetRef !== context.scopeTargetRef || evidence.scopeTargetFingerprint !== context.scopeTargetFingerprint ||
        evidence.evidenceClass !== context.authorityEvidenceClass || evidence.simulatedAuthority !== context.simulatedAuthority ||
        evidence.liveAuthorityGranted !== context.liveAuthorityGranted ||
        evidence.externalEffectsAuthorized !== context.externalEffectsAuthorized ||
        evidence.acceptanceDisposition !== context.acceptanceDisposition ||
        !context.acceptedByRefs.includes(evidence.authorityRef)) {
      throw new Error('transient context outer meaning is detached from its candidate/route/review/authority evidence');
    }
  }
  authorityDisposition(context.acceptanceEvidence);
  return context;
}

export function projectApplicableContinuity({ records, applicableScopeTargets, allowedAuthorityEvidenceClasses = [], tokenBudget = 256 }) {
  void records; void applicableScopeTargets; void allowedAuthorityEvidenceClasses; void tokenBudget;
  throw new Error('applicable continuity projection requires the aggregate-owned current-record-set boundary');
  /* Legacy formatter retained below only as an unreachable shape reference until the next schema-removal lane. */
  if (!Array.isArray(applicableScopeTargets) || applicableScopeTargets.length === 0) {
    throw new Error('applicable continuity requires exact canonical scope targets, not scope classes alone');
  }
  const targetBindings = applicableScopeTargets.map((target) => {
    validateContinuityScopeTarget(target);
    return `${target.scopeClass}\0${target.scopeTargetRef}\0${target.semanticFingerprint}`;
  });
  const targetSet = new Set(targetBindings);
  if (targetSet.size !== targetBindings.length) throw new Error('applicable continuity scope targets are duplicated');
  const allowedClasses = stableRefs(allowedAuthorityEvidenceClasses, 'allowed authority evidence classes');
  if (allowedClasses.some((item) => !CONTINUITY_AUTHORITY_EVIDENCE_CLASSES.includes(item))) {
    throw new Error('applicable continuity authority evidence class is unknown');
  }
  const allowedClassSet = new Set(allowedClasses);
  const selected = [];
  let usedTokens = 0;
  for (const record of records.map(validateAcceptedContinuityRecord)
    .filter((item) => targetSet.has(`${item.scope}\0${item.scopeTargetRef}\0${item.scopeTargetFingerprint}`))
    .filter((item) => allowedClassSet.has(item.authorityEvidenceClass))
    .sort((left, right) => left.acceptedRecordRef.localeCompare(right.acceptedRecordRef))) {
    const candidate = {
      acceptedRecordRef: record.acceptedRecordRef,
      recordClass: record.recordClass,
      scope: record.scope,
      scopeTargetRef: record.scopeTargetRef,
      scopeTargetFingerprint: record.scopeTargetFingerprint,
      authorityEvidenceClass: record.authorityEvidenceClass,
      simulatedAuthority: record.simulatedAuthority,
      liveAuthorityGranted: record.liveAuthorityGranted,
      externalEffectsAuthorized: record.externalEffectsAuthorized,
      acceptanceDisposition: record.acceptanceDisposition,
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
    applicableScopeTargetRefs: applicableScopeTargets.map((item) => item.scopeTargetRef).sort(),
    allowedAuthorityEvidenceClasses: allowedClasses,
    simulationAuthorityExplicitlyAllowed: allowedClassSet.has('SIMULATED_CURRENT'),
    tokenBudget,
    usedTokens,
    rawSourceContentIncluded: false,
    allHistoricalRecordsLoaded: false,
    weightArtifactsLoaded: false
  };
  return deepFreeze({ ...core, semanticFingerprint: semanticHash(core) });
}

export function projectContinuityRecord(record) {
  void record;
  throw new Error('continuity record projection requires an exact aggregate-owned record');
  /* Legacy formatter retained below only as an unreachable shape reference until the next schema-removal lane. */
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
    scopeTargetRef: record.scopeTargetRef,
    scopeTargetFingerprint: record.scopeTargetFingerprint,
    authorityEvidenceClass: record.authorityEvidenceClass,
    simulatedAuthority: record.simulatedAuthority,
    liveAuthorityGranted: record.liveAuthorityGranted,
    externalEffectsAuthorized: record.externalEffectsAuthorized,
    acceptanceDisposition: record.acceptanceDisposition,
    liveApplicabilityGranted: record.liveApplicabilityGranted,
    state: record.lifecycle,
    nextSafeAction: record.acceptanceDisposition === 'SIMULATION_ONLY_INACTIVE'
      ? 'USE_ONLY_IN_EXPLICIT_SIMULATED_CURRENT_CONTEXT'
      : record.lifecycle === 'INACTIVE_PENDING_DETERMINISTIC_IMPLEMENTATION_REVIEW'
      ? 'OPEN_SEPARATE_DETERMINISTIC_IMPLEMENTATION_REVIEW'
      : record.recurrenceState === 'REOPEN_REVIEW' ? 'RETURN_TO_CONTEXT_REVIEW' : 'APPLY_BY_REF_ONLY_WHEN_SCOPE_MATCHES'
  });
}

// [VXG RealForever]
