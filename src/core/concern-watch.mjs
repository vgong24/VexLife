import { canonicalize, semanticHash } from './utils.mjs';
import { admitIntentSchedulerQueue } from './intent-scheduler.mjs';
import {
  createIntentEnvelope,
  createIntentTrustSnapshot,
  createIntentWorkgraph,
  createWorkNode
} from './intent-workgraph.mjs';
import { createResourceSnapshot } from './resource-admission.mjs';
import { createSchedulerRuntimeTrustSnapshot } from './scheduler-runtime-trust.mjs';

export const CONCERN_OBSERVATION_REQUIRED_FIELDS = Object.freeze([
  'concernObservationRef',
  'sourceRef',
  'sourceFingerprint',
  'sourceRangeOrEventRef',
  'observedAt',
  'observerRef',
  'aboutScopeRef',
  'concernClass',
  'signalClass',
  'certaintyClass',
  'impactClass',
  'reversibilityClass',
  'humanAttentionClass',
  'evidenceOriginClass',
  'evidenceRefs',
  'unknownRefs',
  'semanticFingerprint'
]);

export const CONCERN_LIFECYCLE_STATES = Object.freeze([
  'OBSERVED',
  'DORMANT_WATCH',
  'ACCUMULATING',
  'THRESHOLD_MET',
  'ADMISSION_REVIEW',
  'ADMITTED_WORK',
  'WAITING_HUMAN',
  'HELD_UNKNOWN',
  'RESOLVED',
  'SUPERSEDED',
  'ARCHIVED'
]);

export const CONCERN_OUTCOMES = Object.freeze([
  'NO_CHANGE_REQUIRED',
  'WATCH_DORMANT',
  'EVIDENCE_REQUIRED',
  'THRESHOLD_MET_ADMISSION_REVIEW',
  'AUTO_RESOLUTION_ADMITTED',
  'HUMAN_ATTENTION_REQUIRED',
  'HELD_UNKNOWN'
]);

export const CONCERN_EVENT_TYPES = Object.freeze([
  'OBSERVATION_RECORDED',
  'THRESHOLD_EVALUATED',
  'ADMISSION_REVIEWED',
  'SCHEDULER_ADMITTED',
  'HUMAN_ATTENTION_REQUESTED',
  'RECOVERY_EVIDENCE_RECORDED',
  'CONCERN_CLOSED',
  'CONCERN_ARCHIVED'
]);

const TERMINAL_STATES = new Set(['RESOLVED', 'SUPERSEDED', 'ARCHIVED']);
const FORBIDDEN_OBSERVATION_FIELDS = Object.freeze([
  'concernSubjectRef', 'concernSubjectFingerprint', 'lifecycleState', 'state',
  'outcome', 'urgency', 'priorityClass', 'threshold', 'acceptedConcern', 'workOrder'
]);
const POLICY_SIGNAL_VOCABULARY = Object.freeze({
  deadlineOrTimeSensitivity: ['NONE', 'BOUNDED', 'IMMINENT'],
  rateOfChange: ['STABLE', 'INCREASING', 'RAPID'],
  resourcePressure: ['NONE', 'ELEVATED', 'CRITICAL'],
  humanAttentionCost: ['LOW', 'MEDIUM', 'HIGH'],
  costOfWaiting: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  costOfFalseAlarm: ['LOW', 'MEDIUM', 'HIGH']
});
const CALLER_AUTHORED_SCHEDULER_FIELDS = Object.freeze([
  'schedulerAggregateFingerprint', 'schedulerCurrentnessReceiptRef',
  'schedulerCurrentnessReceiptFingerprint', 'writerClaimRef', 'pathClaimFingerprint',
  'conflictingWriterRefs', 'schedulerGeneration', 'acceptedPriorityClass',
  'dependencyState', 'activeInteractiveWorkState', 'writerClaimState', 'state',
  'currentness', 'formedAt', 'observedAt', 'expiresAt'
]);
const SCHEDULER_OPTION_FIELDS = Object.freeze([
  'trustSnapshot', 'runtimeTrustSnapshot', 'resourceSnapshot',
  'resourceRequestByNodeRef', 'occupancyByNodeRef', 'capabilityLeaseByNodeRef',
  'effectLeaseByNodeRef', 'resourceLeaseRefByNodeRef', 'recoveryResourceBindingByNodeRef',
  'workerRef', 'schedulerGeneration', 'fairnessMaxDeferrals', 'fairnessLedger',
  'formedAt', 'expiresAt', 'observedAt'
]);
const NODE_INDEXED_SCHEDULER_OPTION_FIELDS = Object.freeze([
  'resourceRequestByNodeRef',
  'occupancyByNodeRef',
  'capabilityLeaseByNodeRef',
  'effectLeaseByNodeRef',
  'resourceLeaseRefByNodeRef',
  'recoveryResourceBindingByNodeRef',
  'fairnessLedger'
]);

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value;
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean`);
  return value;
}

function canonicalTimestamp(value, label) {
  requireString(value, label);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
  return value;
}

function assertChronology(later, earlier, label, { strict = false } = {}) {
  const left = Date.parse(canonicalTimestamp(later, `${label} later`));
  const right = Date.parse(canonicalTimestamp(earlier, `${label} earlier`));
  if (strict ? left <= right : left < right) throw new Error(`${label} chronology is invalid`);
}

function requireFingerprint(value, label) {
  if (!/^[a-f0-9]{64}$/.test(value ?? '')) throw new Error(`${label} must be a lowercase SHA-256 fingerprint`);
  return value;
}

function exactRefs(values, label, { required = false } = {}) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  const refs = values.map((value, index) => requireString(value, `${label}[${index}]`));
  if (new Set(refs).size !== refs.length) throw new Error(`${label} contains duplicate evidence`);
  if (required && refs.length === 0) throw new Error(`${label} cannot be empty`);
  return [...refs].sort();
}

function assertKnown(value, vocabulary, label) {
  if (!vocabulary.includes(value)) throw new Error(`${label} is unknown: ${value}`);
  return value;
}

function withoutIdentity(value, refField) {
  const core = clone(value);
  delete core[refField];
  delete core.semanticFingerprint;
  return core;
}

function contentAddressed(coreInput, refField, prefix, suppliedRef = null) {
  const core = clone(coreInput);
  delete core[refField];
  delete core.semanticFingerprint;
  const semanticFingerprint = semanticHash(core);
  const canonicalRef = `${prefix}.${semanticFingerprint.slice(0, 24)}`;
  if (suppliedRef && suppliedRef !== canonicalRef) throw new Error(`${refField} is not the canonical content identity`);
  return deepFreeze({ ...core, [refField]: canonicalRef, semanticFingerprint });
}

function assertContentAddressed(value, refField, prefix, label) {
  requireObject(value, label);
  const expected = contentAddressed(withoutIdentity(value, refField), refField, prefix);
  if (value[refField] !== expected[refField] || value.semanticFingerprint !== expected.semanticFingerprint) {
    throw new Error(`${label} is forged or reuses the same ref with different content`);
  }
  return value;
}

function registryOrThrow(registry) {
  const result = validateConcernWatchRegistry(registry);
  if (!result.ok) throw new Error(`ConcernWatch registry is invalid: ${result.errors.join('; ')}`);
  return registry;
}

function normalizePolicySignals(input = {}) {
  requireObject(input, 'policySignals');
  const allowed = new Set([
    ...Object.keys(POLICY_SIGNAL_VOCABULARY),
    'activeRecoveryOrIncident', 'availableAuthority', 'availableCapability',
    'relatedOpenConcernRefs', 'relatedOpenWorkRefs'
  ]);
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw new Error(`policySignals contains unknown factor ${key}`);
  const normalized = {
    deadlineOrTimeSensitivity: input.deadlineOrTimeSensitivity ?? 'NONE',
    rateOfChange: input.rateOfChange ?? 'STABLE',
    resourcePressure: input.resourcePressure ?? 'NONE',
    activeRecoveryOrIncident: input.activeRecoveryOrIncident ?? false,
    availableAuthority: input.availableAuthority ?? false,
    availableCapability: input.availableCapability ?? false,
    humanAttentionCost: input.humanAttentionCost ?? 'LOW',
    costOfWaiting: input.costOfWaiting ?? 'LOW',
    costOfFalseAlarm: input.costOfFalseAlarm ?? 'LOW',
    relatedOpenConcernRefs: exactRefs(input.relatedOpenConcernRefs ?? [], 'relatedOpenConcernRefs'),
    relatedOpenWorkRefs: exactRefs(input.relatedOpenWorkRefs ?? [], 'relatedOpenWorkRefs')
  };
  for (const [key, vocabulary] of Object.entries(POLICY_SIGNAL_VOCABULARY)) {
    assertKnown(normalized[key], vocabulary, `policySignals.${key}`);
  }
  requireBoolean(normalized.activeRecoveryOrIncident, 'policySignals.activeRecoveryOrIncident');
  requireBoolean(normalized.availableAuthority, 'policySignals.availableAuthority');
  requireBoolean(normalized.availableCapability, 'policySignals.availableCapability');
  return normalized;
}

function normalizeSubjectBinding(binding, label) {
  requireObject(binding, label);
  return {
    sourceRef: requireString(binding.sourceRef, `${label}.sourceRef`),
    sourceRangeOrEventRef: requireString(binding.sourceRangeOrEventRef, `${label}.sourceRangeOrEventRef`),
    sourceFingerprint: requireFingerprint(binding.sourceFingerprint, `${label}.sourceFingerprint`)
  };
}

function sourceAdmissionFingerprint(subjectBinding, source) {
  return semanticHash({
    concernSubjectRef: subjectBinding.concernSubjectRef,
    concernSubjectFingerprint: subjectBinding.concernSubjectFingerprint,
    subjectAnchorFingerprint: subjectBinding.subjectAnchorFingerprint,
    sourceBinding: normalizeSubjectBinding(source, 'subject source admission')
  });
}

function exactSubjectBinding(actual, subject, observation) {
  if (!actual || actual.concernSubjectRef !== subject.concernSubjectRef ||
      actual.concernSubjectFingerprint !== subject.semanticFingerprint ||
      actual.subjectAnchorFingerprint !== subject.subjectAnchorFingerprint) {
    throw new Error('observation has forged or substituted concern subject lineage');
  }
  if (actual.sourceAdmissionFingerprint !== sourceAdmissionFingerprint(actual, observation)) {
    throw new Error('observation has forged or substituted source-to-subject admission');
  }
}

function observationCore(input, registry) {
  requireObject(input, 'concern observation');
  for (const field of FORBIDDEN_OBSERVATION_FIELDS) {
    if (Object.hasOwn(input, field)) throw new Error(`concern observation cannot author ${field}`);
  }
  const vocab = registry.vocabularies;
  const core = {
    schemaVersion: registry.observationContract.schemaVersion,
    contractRef: registry.observationContract.contractRef,
    sourceRef: requireString(input.sourceRef, 'sourceRef'),
    sourceFingerprint: requireFingerprint(input.sourceFingerprint, 'sourceFingerprint'),
    sourceRangeOrEventRef: requireString(input.sourceRangeOrEventRef, 'sourceRangeOrEventRef'),
    observedAt: canonicalTimestamp(input.observedAt, 'observedAt'),
    observerRef: requireString(input.observerRef, 'observerRef'),
    aboutScopeRef: requireString(input.aboutScopeRef, 'aboutScopeRef'),
    concernClass: assertKnown(input.concernClass, vocab.concernClasses, 'concernClass'),
    signalClass: assertKnown(input.signalClass, vocab.signalClasses, 'signalClass'),
    certaintyClass: assertKnown(input.certaintyClass, vocab.certaintyClasses, 'certaintyClass'),
    impactClass: assertKnown(input.impactClass, vocab.impactClasses, 'impactClass'),
    reversibilityClass: assertKnown(input.reversibilityClass, vocab.reversibilityClasses, 'reversibilityClass'),
    humanAttentionClass: assertKnown(input.humanAttentionClass, vocab.humanAttentionClasses, 'humanAttentionClass'),
    evidenceOriginClass: assertKnown(input.evidenceOriginClass, vocab.evidenceOriginClasses, 'evidenceOriginClass'),
    evidenceRefs: exactRefs(input.evidenceRefs ?? [], 'evidenceRefs', { required: true }),
    unknownRefs: exactRefs(input.unknownRefs ?? [], 'unknownRefs'),
    policySignals: normalizePolicySignals(input.policySignals ?? {})
  };
  if (input.subjectBinding != null) {
    requireObject(input.subjectBinding, 'subjectBinding');
    core.subjectBinding = {
      concernSubjectRef: requireString(input.subjectBinding.concernSubjectRef, 'subjectBinding.concernSubjectRef'),
      concernSubjectFingerprint: requireFingerprint(input.subjectBinding.concernSubjectFingerprint, 'subjectBinding.concernSubjectFingerprint'),
      subjectAnchorFingerprint: requireFingerprint(input.subjectBinding.subjectAnchorFingerprint, 'subjectBinding.subjectAnchorFingerprint'),
      sourceAdmissionFingerprint: requireFingerprint(input.subjectBinding.sourceAdmissionFingerprint, 'subjectBinding.sourceAdmissionFingerprint')
    };
  } else core.subjectBinding = null;
  if (input.recurrenceBinding != null) {
    requireObject(input.recurrenceBinding, 'recurrenceBinding');
    core.recurrenceBinding = {
      priorConcernAggregateRef: requireString(input.recurrenceBinding.priorConcernAggregateRef, 'recurrenceBinding.priorConcernAggregateRef'),
      priorConcernAggregateFingerprint: requireFingerprint(input.recurrenceBinding.priorConcernAggregateFingerprint, 'recurrenceBinding.priorConcernAggregateFingerprint'),
      priorClosureRef: requireString(input.recurrenceBinding.priorClosureRef, 'recurrenceBinding.priorClosureRef'),
      priorClosureFingerprint: requireFingerprint(input.recurrenceBinding.priorClosureFingerprint, 'recurrenceBinding.priorClosureFingerprint')
    };
  } else core.recurrenceBinding = null;
  return core;
}

export function createConcernObservation(input, { registry } = {}) {
  const source = registryOrThrow(registry);
  return contentAddressed(
    observationCore(input, source),
    'concernObservationRef',
    'concern-observation',
    input.concernObservationRef
  );
}

export function validateConcernObservation(observation, { registry } = {}) {
  const source = registryOrThrow(registry);
  const errors = [];
  try {
    const expected = createConcernObservation(withoutIdentity(observation, 'concernObservationRef'), { registry: source });
    if (semanticHash(expected) !== semanticHash(observation)) errors.push('concern observation canonical content mismatch');
    for (const field of CONCERN_OBSERVATION_REQUIRED_FIELDS) if (!Object.hasOwn(observation, field)) errors.push(`concern observation missing ${field}`);
  } catch (error) {
    errors.push(error.message);
  }
  return { ok: errors.length === 0, errors };
}

export function deriveConcernSubject({ observations, subjectKind }, { registry } = {}) {
  const source = registryOrThrow(registry);
  if (!Array.isArray(observations) || observations.length === 0) throw new Error('subject requires source observations');
  assertKnown(subjectKind, source.subjectContract.subjectKinds, 'subjectKind');
  const bindings = observations.map((observation, index) => {
    const validation = validateConcernObservation(observation, { registry: source });
    if (!validation.ok) throw new Error(`subject observation ${index} is invalid: ${validation.errors.join('; ')}`);
    return normalizeSubjectBinding(observation, `subject observation ${index}`);
  });
  const distinct = new Map();
  for (const binding of bindings) {
    const key = semanticHash(binding);
    if (distinct.has(key)) throw new Error('subject source binding is duplicated');
    distinct.set(key, binding);
  }
  const sourceBindings = [...distinct.values()].sort((a, b) => semanticHash(a).localeCompare(semanticHash(b)));
  const subjectAnchorFingerprint = semanticHash({ subjectKind, sourceBindings });
  return contentAddressed({
    schemaVersion: source.subjectContract.schemaVersion,
    contractRef: source.subjectContract.contractRef,
    subjectKind,
    sourceBindings,
    subjectAnchorFingerprint
  }, 'concernSubjectRef', 'concern-subject');
}

export function validateConcernSubject(subject, { registry } = {}) {
  const source = registryOrThrow(registry);
  assertContentAddressed(subject, 'concernSubjectRef', 'concern-subject', 'concern subject');
  assertKnown(subject.subjectKind, source.subjectContract.subjectKinds, 'subjectKind');
  if (semanticHash({ subjectKind: subject.subjectKind, sourceBindings: subject.sourceBindings }) !== subject.subjectAnchorFingerprint) {
    throw new Error('concern subject anchor fingerprint is forged');
  }
  return { ok: true, errors: [] };
}

function policyFingerprint(registry) {
  return semanticHash(registry.thresholdPolicy);
}

function createAggregateRoot({ subject, formedAt, priorLineage = null, cycle = 1 }, registry) {
  validateConcernSubject(subject, { registry });
  canonicalTimestamp(formedAt, 'aggregate formedAt');
  if (!Number.isSafeInteger(cycle) || cycle < 1) throw new Error('concern cycle must be a positive integer');
  let normalizedPrior = null;
  if (priorLineage != null) {
    requireObject(priorLineage, 'priorLineage');
    normalizedPrior = {
      priorConcernAggregateRef: requireString(priorLineage.priorConcernAggregateRef, 'priorLineage.priorConcernAggregateRef'),
      priorConcernAggregateFingerprint: requireFingerprint(priorLineage.priorConcernAggregateFingerprint, 'priorLineage.priorConcernAggregateFingerprint'),
      priorClosureRef: requireString(priorLineage.priorClosureRef, 'priorLineage.priorClosureRef'),
      priorClosureFingerprint: requireFingerprint(priorLineage.priorClosureFingerprint, 'priorLineage.priorClosureFingerprint')
    };
  }
  const identity = semanticHash({ concernSubjectRef: subject.concernSubjectRef, priorLineage: normalizedPrior, cycle });
  return deepFreeze({
    schemaVersion: 'vexlife.concern-watch-aggregate-root/v1',
    aggregateRef: `concern-watch-aggregate.${identity.slice(0, 24)}`,
    concernSubject: clone(subject),
    policyRef: registry.thresholdPolicy.policyRef,
    policyFingerprint: policyFingerprint(registry),
    priorLineage: normalizedPrior,
    cycle,
    formedAt
  });
}

function initialSnapshot(root) {
  return {
    schemaVersion: 'vexlife.concern-watch-aggregate/v1',
    aggregateRef: root.aggregateRef,
    root: clone(root),
    concernSubjectRef: root.concernSubject.concernSubjectRef,
    concernSubjectFingerprint: root.concernSubject.semanticFingerprint,
    aboutScopeRef: null,
    cycle: root.cycle,
    state: 'OBSERVED',
    outcome: 'WATCH_DORMANT',
    observations: [],
    evidenceRefs: [],
    unknownRefs: [],
    thresholdReceipts: [],
    admissionReviews: [],
    schedulerAdmissions: [],
    humanAttentionRequests: [],
    recoveryEvidence: [],
    closures: [],
    events: [],
    active: true,
    queuePriorityActive: false,
    revision: 0
  };
}

function finalizeSnapshot(snapshot) {
  const core = clone(snapshot);
  delete core.semanticFingerprint;
  return deepFreeze({ ...core, semanticFingerprint: semanticHash(core) });
}

function currentSnapshotFingerprint(snapshot) {
  const core = clone(snapshot);
  delete core.semanticFingerprint;
  return semanticHash(core);
}

export function createConcernAggregate({ subject, formedAt, priorLineage = null, cycle = 1 }, { registry } = {}) {
  const source = registryOrThrow(registry);
  return finalizeSnapshot(initialSnapshot(createAggregateRoot({ subject, formedAt, priorLineage, cycle }, source)));
}

function eventCore(aggregate, type, payload, occurredAt, registry) {
  assertKnown(type, registry.lifecycleContract.eventTypes, 'ConcernWatch event type');
  canonicalTimestamp(occurredAt, 'event occurredAt');
  if (aggregate.events.length > 0) {
    assertChronology(occurredAt, aggregate.events.at(-1).occurredAt, 'event', { strict: false });
  } else assertChronology(occurredAt, aggregate.root.formedAt, 'event', { strict: false });
  return {
    schemaVersion: registry.lifecycleContract.schemaVersion,
    contractRef: registry.lifecycleContract.contractRef,
    aggregateRef: aggregate.aggregateRef,
    concernSubjectRef: aggregate.concernSubjectRef,
    cycle: aggregate.cycle,
    sequence: aggregate.events.length,
    priorEventFingerprint: aggregate.events.at(-1)?.semanticFingerprint ?? null,
    type,
    occurredAt,
    payload: clone(payload)
  };
}

function formEvent(aggregate, type, payload, occurredAt, registry) {
  const prefix = `concern-event.${type.toLowerCase().replaceAll('_', '-')}`;
  return contentAddressed(eventCore(aggregate, type, payload, occurredAt, registry), 'eventRef', prefix);
}

function assertLegalTransition(prior, next, registry) {
  if (prior === next && (registry.lifecycleContract.legalTransitions[prior] ?? []).includes(next)) return;
  if (!(registry.lifecycleContract.legalTransitions[prior] ?? []).includes(next)) {
    throw new Error(`illegal ConcernWatch lifecycle transition ${prior} -> ${next}`);
  }
}

function observationMatchesSubject(snapshot, observation) {
  const subject = snapshot.root.concernSubject;
  const sourceBinding = normalizeSubjectBinding(observation, 'observation source binding');
  const sourceIsBoundToSubject = subject.sourceBindings.some((binding) => semanticHash(binding) === semanticHash(sourceBinding));
  const isFirstObservation = snapshot.observations.length === 0;
  if (isFirstObservation && snapshot.root.priorLineage == null && !sourceIsBoundToSubject) {
    throw new Error('first observation source binding is not admitted by the exact concern subject');
  }
  if (!isFirstObservation || snapshot.root.priorLineage != null) {
    exactSubjectBinding(observation.subjectBinding, subject, observation);
  } else if (observation.subjectBinding != null) {
    exactSubjectBinding(observation.subjectBinding, subject, observation);
  }
  if (snapshot.root.priorLineage) {
    if (!observation.recurrenceBinding || semanticHash(observation.recurrenceBinding) !== semanticHash(snapshot.root.priorLineage)) {
      throw new Error('recurrence observation does not cite exact prior concern and closure lineage');
    }
  }
}

function appendObservation(snapshot, observation, registry) {
  const validation = validateConcernObservation(observation, { registry });
  if (!validation.ok) throw new Error(`invalid concern observation: ${validation.errors.join('; ')}`);
  observationMatchesSubject(snapshot, observation);
  if (snapshot.observations.some((item) => item.concernObservationRef === observation.concernObservationRef)) {
    throw new Error('duplicate observation event reached replay');
  }
  if (snapshot.aboutScopeRef == null) snapshot.aboutScopeRef = observation.aboutScopeRef;
  else if (snapshot.aboutScopeRef !== observation.aboutScopeRef) throw new Error('observation has wrong project, thread, person, or system scope');
  const existingEvidence = new Set(snapshot.evidenceRefs);
  const addedEvidence = observation.evidenceRefs.filter((ref) => !existingEvidence.has(ref));
  if (addedEvidence.length === 0) throw new Error('observation event has no new evidence');
  snapshot.observations.push(clone(observation));
  snapshot.evidenceRefs = [...new Set([...snapshot.evidenceRefs, ...addedEvidence])].sort();
  snapshot.unknownRefs = [...new Set([...snapshot.unknownRefs, ...observation.unknownRefs])].sort();
  const next = snapshot.observations.length === 1 ? 'DORMANT_WATCH' : 'ACCUMULATING';
  assertLegalTransition(snapshot.state, next, registry);
  snapshot.state = next;
  snapshot.outcome = snapshot.observations.length === 1 ? 'WATCH_DORMANT' : 'EVIDENCE_REQUIRED';
}

function severityRank(map, value) {
  const rank = map[value];
  if (!Number.isFinite(rank)) throw new Error(`threshold vocabulary has no score for ${value}`);
  return rank;
}

function maxClass(observations, field, scoreMap, fallback) {
  if (observations.length === 0) return fallback;
  return observations.reduce((best, item) => severityRank(scoreMap, item[field]) > severityRank(scoreMap, best) ? item[field] : best, fallback);
}

function policySignalScore(observations) {
  const values = observations.map((item) => item.policySignals);
  const includes = (field, value) => values.some((item) => item[field] === value);
  const activeRecovery = values.some((item) => item.activeRecoveryOrIncident);
  const relatedOpen = values.some((item) => item.relatedOpenConcernRefs.length || item.relatedOpenWorkRefs.length);
  return {
    deadlineOrTimeSensitivity: includes('deadlineOrTimeSensitivity', 'IMMINENT') ? 'IMMINENT' : includes('deadlineOrTimeSensitivity', 'BOUNDED') ? 'BOUNDED' : 'NONE',
    rateOfChange: includes('rateOfChange', 'RAPID') ? 'RAPID' : includes('rateOfChange', 'INCREASING') ? 'INCREASING' : 'STABLE',
    resourcePressure: includes('resourcePressure', 'CRITICAL') ? 'CRITICAL' : includes('resourcePressure', 'ELEVATED') ? 'ELEVATED' : 'NONE',
    activeRecoveryOrIncident: activeRecovery,
    availableAuthority: values.some((item) => item.availableAuthority),
    availableCapability: values.some((item) => item.availableCapability),
    humanAttentionCost: includes('humanAttentionCost', 'HIGH') ? 'HIGH' : includes('humanAttentionCost', 'MEDIUM') ? 'MEDIUM' : 'LOW',
    costOfWaiting: includes('costOfWaiting', 'CRITICAL') ? 'CRITICAL' : includes('costOfWaiting', 'HIGH') ? 'HIGH' : includes('costOfWaiting', 'MEDIUM') ? 'MEDIUM' : 'LOW',
    costOfFalseAlarm: includes('costOfFalseAlarm', 'HIGH') ? 'HIGH' : includes('costOfFalseAlarm', 'MEDIUM') ? 'MEDIUM' : 'LOW',
    relatedOpenConcernOrWork: relatedOpen
  };
}

function evidenceIdentity(observation, fields, identityKind) {
  return semanticHash({
    identityKind,
    ...Object.fromEntries(fields.map((field) => [field, observation[field]]))
  });
}

function distinctEvidence(observations, fields, identityKind) {
  const distinct = new Map();
  for (const observation of observations) {
    const identity = evidenceIdentity(observation, fields, identityKind);
    if (!distinct.has(identity)) distinct.set(identity, observation);
  }
  return distinct;
}

function thresholdStatistics(aggregate, registry) {
  const observations = aggregate.observations;
  const eligible = observations.filter((item) => item.evidenceOriginClass !== 'MODEL_INFERENCE');
  const model = observations.filter((item) => item.evidenceOriginClass === 'MODEL_INFERENCE');
  const identityPolicy = registry.thresholdPolicy.evidenceIdentityPolicy;
  const independent = distinctEvidence(eligible, identityPolicy.independenceIdentityIncludes, 'INDEPENDENCE');
  const recurrent = distinctEvidence(eligible, identityPolicy.recurrenceIdentityIncludes, 'RECURRENCE');
  const recurrenceObservations = [...recurrent.values()];
  const times = recurrenceObservations.map((item) => Date.parse(item.observedAt)).sort((a, b) => a - b);
  const minimumSpacing = registry.thresholdPolicy.standardActivation.minimumSpacingMs;
  const spacingSatisfied = times.length < 2 || times.slice(1).every((time, index) => time - times[index] >= minimumSpacing);
  const certaintyClass = maxClass(eligible, 'certaintyClass', registry.thresholdPolicy.certaintyScores, 'UNKNOWN');
  const impactClass = maxClass(eligible, 'impactClass', registry.thresholdPolicy.impactScores, 'LOW');
  const reversibilityClass = maxClass(eligible, 'reversibilityClass', registry.thresholdPolicy.reversibilityScores, 'FULLY_REVERSIBLE');
  const context = policySignalScore(eligible);
  const modelContext = policySignalScore(model);
  const contextScore =
    (context.deadlineOrTimeSensitivity === 'IMMINENT' ? 2 : context.deadlineOrTimeSensitivity === 'BOUNDED' ? 1 : 0) +
    (context.rateOfChange === 'RAPID' ? 2 : context.rateOfChange === 'INCREASING' ? 1 : 0) +
    (context.resourcePressure === 'CRITICAL' ? 2 : context.resourcePressure === 'ELEVATED' ? 1 : 0) +
    (context.activeRecoveryOrIncident ? 2 : 0) +
    (context.costOfWaiting === 'CRITICAL' ? 3 : context.costOfWaiting === 'HIGH' ? 2 : context.costOfWaiting === 'MEDIUM' ? 1 : 0) -
    (context.costOfFalseAlarm === 'HIGH' ? 2 : context.costOfFalseAlarm === 'MEDIUM' ? 1 : 0);
  const policyScore = independent.size +
    severityRank(registry.thresholdPolicy.certaintyScores, certaintyClass) +
    severityRank(registry.thresholdPolicy.impactScores, impactClass) +
    severityRank(registry.thresholdPolicy.reversibilityScores, reversibilityClass) + contextScore;
  return {
    observationCount: observations.length,
    independentEvidenceCount: independent.size,
    independenceIdentities: [...independent.keys()].sort(),
    modelEvidenceCount: model.length,
    recurrenceCount: recurrent.size,
    recurrenceIdentities: [...recurrent.keys()].sort(),
    spacingSatisfied,
    certaintyClass,
    impactClass,
    reversibilityClass,
    unknownCount: aggregate.unknownRefs.length,
    context,
    modelContext,
    modelContextUsedForPriority: false,
    policyScore
  };
}

function priorityRecommendation(stats, registry) {
  const policy = registry.priorityPolicy;
  if (stats.context.activeRecoveryOrIncident) return policy.activeRecovery;
  if (stats.impactClass === 'CRITICAL') return policy.criticalSafety;
  if (stats.impactClass === 'HIGH') return policy.highImpact;
  if (stats.independentEvidenceCount >= registry.thresholdPolicy.standardActivation.minimumIndependentEvidence) return policy.ordinaryThreshold;
  return policy.dormant;
}

function thresholdDecision(aggregate, observedAt, registry) {
  canonicalTimestamp(observedAt, 'threshold observedAt');
  const stats = thresholdStatistics(aggregate, registry);
  const standard = registry.thresholdPolicy.standardActivation;
  const highRule = registry.thresholdPolicy.singleObservationHighConsequenceRule;
  const independent = aggregate.observations.filter((item) => item.evidenceOriginClass !== 'MODEL_INFERENCE');
  const highConsequenceObservation = independent.find((item) =>
    highRule.allowedSignalClasses.includes(item.signalClass) &&
    severityRank(registry.thresholdPolicy.certaintyScores, item.certaintyClass) >= severityRank(registry.thresholdPolicy.certaintyScores, highRule.minimumCertaintyClass) &&
    severityRank(registry.thresholdPolicy.impactScores, item.impactClass) >= severityRank(registry.thresholdPolicy.impactScores, highRule.minimumImpactClass) &&
    highRule.allowedReversibilityClasses.includes(item.reversibilityClass)
  ) ?? null;
  const humanRequired = aggregate.observations.some((item) => ['DECISION_REQUIRED', 'IMMEDIATE_SAFETY'].includes(item.humanAttentionClass));
  const standardCrossed = stats.independentEvidenceCount >= standard.minimumIndependentEvidence &&
    stats.recurrenceCount >= standard.minimumRecurrenceCount && stats.spacingSatisfied &&
    severityRank(registry.thresholdPolicy.certaintyScores, stats.certaintyClass) >= severityRank(registry.thresholdPolicy.certaintyScores, standard.minimumCertaintyClass) &&
    severityRank(registry.thresholdPolicy.impactScores, stats.impactClass) >= severityRank(registry.thresholdPolicy.impactScores, standard.minimumImpactClass) &&
    stats.policyScore >= standard.minimumScore;
  let outcome = 'WATCH_DORMANT';
  let ruleRef = null;
  let thresholdCrossed = false;
  if (highConsequenceObservation) {
    thresholdCrossed = true;
    ruleRef = highRule.ruleRef;
    outcome = humanRequired ? 'HUMAN_ATTENTION_REQUIRED' : 'THRESHOLD_MET_ADMISSION_REVIEW';
  } else if (standardCrossed) {
    thresholdCrossed = true;
    ruleRef = standard.ruleRef ?? 'rule.concern-watch.standard-accumulation.001';
    outcome = humanRequired ? 'HUMAN_ATTENTION_REQUIRED' : 'THRESHOLD_MET_ADMISSION_REVIEW';
  } else if (stats.unknownCount > 0 && ['HIGH', 'CRITICAL'].includes(stats.impactClass)) {
    outcome = 'HELD_UNKNOWN';
    ruleRef = 'rule.concern-watch.high-impact-unknown-hold.001';
  } else if (stats.independentEvidenceCount === 0 && stats.modelEvidenceCount > 1) {
    outcome = registry.thresholdPolicy.modelRepetitionRule.repeatedModelOnlyOutcome;
    ruleRef = registry.thresholdPolicy.modelRepetitionRule.ruleRef;
  } else if (stats.observationCount > 1) {
    outcome = 'EVIDENCE_REQUIRED';
    ruleRef = 'rule.concern-watch.below-threshold-evidence.001';
  }
  return {
    schemaVersion: 'vexlife.concern-threshold-receipt/v1',
    contractRef: 'contract.vexlife.concern-threshold-receipt/v1',
    aggregateRef: aggregate.aggregateRef,
    aggregateFingerprint: aggregate.semanticFingerprint,
    concernSubjectRef: aggregate.concernSubjectRef,
    policyRef: registry.thresholdPolicy.policyRef,
    policyFingerprint: policyFingerprint(registry),
    policyVersion: registry.thresholdPolicy.policyVersion,
    observedAt,
    statistics: stats,
    ruleRef,
    thresholdCrossed,
    outcome,
    recommendedPriorityClass: priorityRecommendation(stats, registry),
    highConsequenceObservationRef: highConsequenceObservation?.concernObservationRef ?? null,
    executionAuthorityGranted: false,
    modelRepetitionRaisedUrgency: false
  };
}

export function evaluateConcernThreshold(aggregate, { observedAt, thresholdOverride, priorityOverride, urgency } = {}, { registry } = {}) {
  const source = registryOrThrow(registry);
  validateConcernAggregate(aggregate, { registry: source });
  if (thresholdOverride != null || priorityOverride != null || urgency != null) {
    throw new Error('caller threshold, priority, or urgency substitution is forbidden');
  }
  return contentAddressed(thresholdDecision(aggregate, observedAt, source), 'thresholdReceiptRef', 'concern-threshold-receipt');
}

function assertThresholdReceipt(snapshot, receipt, registry) {
  assertContentAddressed(receipt, 'thresholdReceiptRef', 'concern-threshold-receipt', 'threshold receipt');
  const aggregate = finalizeSnapshot({ ...clone(snapshot), events: clone(snapshot.events) });
  const expected = contentAddressed(thresholdDecision(aggregate, receipt.observedAt, registry), 'thresholdReceiptRef', 'concern-threshold-receipt');
  if (semanticHash(expected) !== semanticHash(receipt)) throw new Error('threshold receipt is stale, substituted, or caller-authored');
}

function applyThreshold(snapshot, receipt, registry) {
  assertThresholdReceipt(snapshot, receipt, registry);
  snapshot.thresholdReceipts.push(clone(receipt));
  let next = snapshot.state;
  if (['THRESHOLD_MET_ADMISSION_REVIEW', 'HUMAN_ATTENTION_REQUIRED'].includes(receipt.outcome)) next = 'THRESHOLD_MET';
  else if (receipt.outcome === 'HELD_UNKNOWN') next = 'HELD_UNKNOWN';
  else if (receipt.outcome === 'WATCH_DORMANT') next = 'DORMANT_WATCH';
  else if (receipt.outcome === 'EVIDENCE_REQUIRED') next = snapshot.observations.length > 1 ? 'ACCUMULATING' : 'DORMANT_WATCH';
  assertLegalTransition(snapshot.state, next, registry);
  snapshot.state = next;
  snapshot.outcome = receipt.outcome;
}

function validateAdmissionReview(review, snapshot) {
  assertContentAddressed(review, 'admissionReviewRef', 'concern-admission-review', 'admission review');
  const threshold = snapshot.thresholdReceipts.at(-1);
  const recorded = snapshot.admissionReviews.find((item) => item.admissionReviewRef === review.admissionReviewRef);
  if (recorded && recorded.semanticFingerprint !== review.semanticFingerprint) throw new Error('admission review same ref has different content');
  if (review.aggregateRef !== snapshot.aggregateRef || (!recorded && review.aggregateFingerprint !== currentSnapshotFingerprint(snapshot)) ||
      review.concernSubjectRef !== snapshot.concernSubjectRef ||
      review.thresholdReceiptRef !== threshold?.thresholdReceiptRef ||
      review.thresholdReceiptFingerprint !== threshold?.semanticFingerprint) {
    throw new Error('admission review does not bind current threshold lineage');
  }
  if (review.executionAuthorityGranted !== false || review.externalEffectsAuthorized !== false) {
    throw new Error('admission review leaked execution authority');
  }
}

function applyAdmissionReview(snapshot, review, registry) {
  if (snapshot.state !== 'THRESHOLD_MET') throw new Error('admission review requires THRESHOLD_MET');
  validateAdmissionReview(review, snapshot);
  assertLegalTransition(snapshot.state, 'ADMISSION_REVIEW', registry);
  snapshot.admissionReviews.push(clone(review));
  snapshot.state = 'ADMISSION_REVIEW';
}

function assertSchedulerOptionNodeDomains(schedulerOptions, workgraph, authority) {
  const nodeIndexedFields = exactRefs(
    authority.nodeIndexedSchedulerOptionFields,
    'external scheduler authority node-indexed option fields',
    { required: true }
  );
  if (semanticHash(nodeIndexedFields) !== semanticHash([...NODE_INDEXED_SCHEDULER_OPTION_FIELDS].sort()) ||
      authority.nodeIndexedSchedulerOptionDomain !== 'EXACT_WORKGRAPH_NODE_REFS' ||
      authority.writerConflictScope !== 'COMPLETE_SCHEDULER_OCCUPANCY_CLAIM_SCOPE' ||
      authority.unexpectedWorkNodeKeyDisposition !== 'REJECT_UNCHANGED') {
    throw new Error('external scheduler authority node scope contract is incomplete or substituted');
  }
  if (!Array.isArray(workgraph.nodes)) throw new Error('scheduler authority Workgraph nodes must be an array');
  const workNodeRefs = new Set(workgraph.nodes.map((node, index) =>
    requireString(node?.workNodeRef, `scheduler authority Workgraph nodes[${index}].workNodeRef`)
  ));
  for (const field of nodeIndexedFields) {
    const nodeMap = requireObject(schedulerOptions[field], `scheduler authority options.${field}`);
    const unexpectedRefs = Object.keys(nodeMap).filter((workNodeRef) => !workNodeRefs.has(workNodeRef)).sort();
    if (unexpectedRefs.length) {
      throw new Error(`scheduler authority options.${field} contains work-node keys outside the exact Workgraph scope: ${unexpectedRefs.join(', ')}`);
    }
  }
}

function schedulerAuthorityEvidenceCore(input, registry) {
  requireObject(input, 'scheduler authority evidence');
  const authority = requireObject(registry.schedulerIntegration.externalSchedulerAuthority, 'external scheduler authority contract');
  const schedulerOptions = requireObject(input.schedulerOptions, 'scheduler authority options');
  const unknownOptions = Object.keys(schedulerOptions).filter((field) => !SCHEDULER_OPTION_FIELDS.includes(field));
  if (unknownOptions.length) throw new Error(`scheduler authority options contain unknown fields: ${unknownOptions.join(', ')}`);
  const missingOptions = SCHEDULER_OPTION_FIELDS.filter((field) => !Object.hasOwn(schedulerOptions, field));
  if (missingOptions.length) throw new Error(`scheduler authority options omit required fields: ${missingOptions.join(', ')}`);
  const workgraph = clone(requireObject(input.workgraph, 'scheduler authority Workgraph'));
  assertSchedulerOptionNodeDomains(schedulerOptions, workgraph, authority);
  const intentRegistry = clone(requireObject(input.intentRegistry, 'scheduler authority Intent registry'));
  const schedulerRegistry = clone(requireObject(input.schedulerRegistry, 'scheduler authority Scheduler registry'));
  const registeredProcessRefs = exactRefs(input.registeredProcessRefs, 'scheduler authority registeredProcessRefs', { required: true });
  const registeredRoleRefs = exactRefs(input.registeredRoleRefs, 'scheduler authority registeredRoleRefs', { required: true });
  if (intentRegistry.registryRef !== authority.intentRegistryRef ||
      semanticHash(intentRegistry) !== authority.intentRegistryFingerprint ||
      schedulerRegistry.registryRef !== authority.schedulerRegistryRef ||
      semanticHash(schedulerRegistry) !== authority.schedulerRegistryFingerprint ||
      semanticHash(registeredProcessRefs) !== authority.registeredProcessRefsFingerprint ||
      semanticHash(registeredRoleRefs) !== authority.registeredRoleRefsFingerprint) {
    throw new Error('scheduler authority context is not the exact source-managed Intent/Scheduler context');
  }
  return {
    schemaVersion: authority.evidenceSchemaVersion,
    contractRef: authority.evidenceContractRef,
    validationRouteRef: authority.validationRouteRef,
    externalAdmissionSchemaVersion: authority.admissionSchemaVersion,
    externalAdmissionContractRef: authority.admissionContractRef,
    intentRegistry,
    schedulerRegistry,
    registeredProcessRefs,
    registeredRoleRefs,
    workgraph,
    schedulerOptions: Object.fromEntries(SCHEDULER_OPTION_FIELDS.map((field) => [field, clone(schedulerOptions[field])])),
    schedulerQueue: clone(requireObject(input.schedulerQueue, 'scheduler authority queue'))
  };
}

function formSchedulerAuthorityEvidence(input, registry) {
  const core = schedulerAuthorityEvidenceCore(input, registry);
  return contentAddressed(
    core,
    'schedulerAuthorityEvidenceRef',
    'evidence.concern-watch.scheduler-authority',
    input.schedulerAuthorityEvidenceRef
  );
}

function validateSchedulerAuthorityEvidence(evidence, review, registry) {
  assertContentAddressed(
    evidence,
    'schedulerAuthorityEvidenceRef',
    'evidence.concern-watch.scheduler-authority',
    'scheduler authority evidence'
  );
  const normalized = schedulerAuthorityEvidenceCore(evidence, registry);
  if (semanticHash(normalized) !== semanticHash(withoutIdentity(evidence, 'schedulerAuthorityEvidenceRef'))) {
    throw new Error('scheduler authority evidence schema or contract is stale or substituted');
  }
  const authority = registry.schedulerIntegration.externalSchedulerAuthority;
  const options = clone(evidence.schedulerOptions);
  const reconstructedQueue = admitIntentSchedulerQueue(evidence.workgraph, {
    ...options,
    intentRegistry: evidence.intentRegistry,
    schedulerRegistry: evidence.schedulerRegistry,
    registeredProcessRefs: evidence.registeredProcessRefs,
    registeredRoleRefs: evidence.registeredRoleRefs
  });
  if (semanticHash(reconstructedQueue) !== semanticHash(evidence.schedulerQueue)) {
    throw new Error('external scheduler queue is not reproduced by admitIntentSchedulerQueue');
  }
  const queue = evidence.schedulerQueue;
  const externalAdmission = queue.admissionReceipt;
  if (queue.schemaVersion !== authority.queueSchemaVersion || queue.state !== 'ADMITTED' ||
      queue.lifecycle !== 'ADMITTED' || queue.currentness !== 'CURRENT' ||
      externalAdmission?.schemaVersion !== authority.admissionSchemaVersion ||
      evidence.externalAdmissionContractRef !== authority.admissionContractRef ||
      externalAdmission?.currentness !== 'CURRENT' || externalAdmission?.lifecycle !== 'ACTIVE') {
    throw new Error('external scheduler schema, contract, lifecycle, or currentness is invalid');
  }
  const missingAdmissionFields = evidence.schedulerRegistry.admissionRequiredFields.filter((field) =>
    externalAdmission[field] === undefined || externalAdmission[field] === null || externalAdmission[field] === ''
  );
  const admissionContract = evidence.schedulerRegistry.requiredFieldContracts.find((item) =>
    item.contractKind === 'ADMISSION_RECEIPT' && item.sourceField === 'admissionRequiredFields'
  );
  if (missingAdmissionFields.length || admissionContract?.contractRef !== authority.admissionContractRef) {
    throw new Error('external scheduler admission does not satisfy its exact registered field contract');
  }
  const intent = evidence.workgraph.intent;
  const node = evidence.workgraph.nodes.find((item) => item.workNodeRef === review.workNodeRef);
  if (!intent || !node || review.proposedWorkRef !== node.workNodeRef ||
      review.intentEnvelopeRef !== intent.intentRef || review.intentEnvelopeFingerprint !== intent.semanticFingerprint ||
      review.workgraphRef !== evidence.workgraph.graphRef || review.workgraphFingerprint !== evidence.workgraph.semanticFingerprint ||
      review.workNodeFingerprint !== node.semanticFingerprint ||
      semanticHash(review.dependencyRefs) !== semanticHash(node.dependencyRefs) ||
      semanticHash(review.capabilityRefs) !== semanticHash([node.capabilityEnvelopeRef]) ||
      semanticHash(review.effectRefs) !== semanticHash([node.effectEnvelopeRef]) ||
      review.returnRouteRef !== node.returnRouteRef) {
    throw new Error('external scheduler material is detached from the exact bounded admission-review proposal');
  }
  if (queue.graphRef !== review.workgraphRef || queue.graphFingerprint !== review.workgraphFingerprint ||
      queue.selected?.workNodeRef !== review.workNodeRef || queue.selected?.nodeFingerprint !== review.workNodeFingerprint ||
      externalAdmission.graphRef !== review.workgraphRef || externalAdmission.graphFingerprint !== review.workgraphFingerprint ||
      externalAdmission.workNodeRef !== review.workNodeRef || externalAdmission.nodeFingerprint !== review.workNodeFingerprint ||
      externalAdmission.schedulerGeneration !== queue.generation || options.schedulerGeneration !== queue.generation) {
    throw new Error('external scheduler aggregate, work node, or generation binding is substituted');
  }
  const occupancy = queue.selectedBindings?.occupancy;
  const resourceRequest = options.resourceRequestByNodeRef?.[review.workNodeRef];
  const effectLease = queue.selectedBindings?.effectLease;
  const schedulerOccupancies = Object.entries(options.occupancyByNodeRef).map(([workNodeRef, value]) => {
    const item = requireObject(value, `scheduler authority occupancy ${workNodeRef}`);
    if (item.workNodeRef !== workNodeRef) throw new Error('scheduler authority occupancy is detached from its work-node key');
    return item;
  });
  const conflictRefs = schedulerOccupancies
    .filter((item) => item.claimRef === occupancy?.claimRef && item.workNodeRef !== review.workNodeRef)
    .map((item) => item.workNodeRef)
    .sort();
  const writerClaimState = conflictRefs.length === 0 ? 'EXACT_SINGLE_WRITER' : 'CONFLICTING_WRITERS';
  if (review.pathClaimRefs.length !== 1 || occupancy?.claimRef !== review.pathClaimRefs[0] ||
      writerClaimState !== registry.schedulerIntegration.writerClaimStateRequired ||
      queue.selected.schedulingClass === 'INTERACTIVE' || queue.selected.schedulingClass !== review.recommendedPriorityClass ||
      options.resourceSnapshot.activeModelTurn !== false || options.resourceSnapshot.interactiveWaitState !== 'IDLE' ||
      resourceRequest?.modelTurn !== false || effectLease?.effectDisposition !== 'NO_EFFECTS' ||
      (effectLease.allowedEffectRefs ?? []).length !== 0) {
    throw new Error('external scheduler authority bypasses exact writer, priority, interactive-work, worker, or effect boundaries');
  }
  if (options.formedAt !== externalAdmission.formedAt || options.observedAt !== externalAdmission.observedAt ||
      options.expiresAt !== externalAdmission.expiresAt || options.observedAt !== options.runtimeTrustSnapshot.observedAt ||
      options.observedAt !== options.resourceSnapshot.observedAt) {
    throw new Error('external scheduler chronology/currentness bindings are substituted');
  }
  assertChronology(externalAdmission.formedAt, review.formedAt, 'external scheduler formation');
  assertChronology(externalAdmission.observedAt, externalAdmission.formedAt, 'external scheduler observation');
  assertChronology(externalAdmission.expiresAt, externalAdmission.observedAt, 'external scheduler expiry', { strict: true });
  return {
    queue,
    externalAdmission,
    writerClaimRef: occupancy.claimRef,
    writerClaimState,
    pathClaimFingerprint: semanticHash(review.pathClaimRefs),
    acceptedPriorityClass: queue.selected.schedulingClass,
    conflictingWriterRefs: conflictRefs
  };
}

function validateSchedulerAdmissionReceipt(receipt, snapshot, registry) {
  assertContentAddressed(receipt, 'schedulerAdmissionRef', 'concern-scheduler-admission', 'scheduler admission');
  const review = snapshot.admissionReviews.at(-1);
  const threshold = snapshot.thresholdReceipts.at(-1);
  const authority = validateSchedulerAuthorityEvidence(receipt.schedulerAuthorityEvidence, review, registry);
  for (const [field, expected] of Object.entries({
    schemaVersion: registry.schedulerIntegration.admissionSchemaVersion,
    contractRef: registry.schedulerIntegration.admissionContractRef,
    concernAggregateRef: snapshot.aggregateRef,
    concernAggregateFingerprint: currentSnapshotFingerprint(snapshot),
    concernSubjectRef: snapshot.concernSubjectRef,
    thresholdReceiptRef: threshold?.thresholdReceiptRef,
    thresholdReceiptFingerprint: threshold?.semanticFingerprint,
    admissionReviewRef: review?.admissionReviewRef,
    admissionReviewFingerprint: review?.semanticFingerprint,
    intentEnvelopeRef: review?.intentEnvelopeRef,
    intentEnvelopeFingerprint: review?.intentEnvelopeFingerprint,
    workgraphRef: review?.workgraphRef,
    workgraphFingerprint: review?.workgraphFingerprint,
    workNodeRef: review?.workNodeRef,
    workNodeFingerprint: review?.workNodeFingerprint,
    schedulerAggregateFingerprint: authority.queue.semanticFingerprint,
    schedulerCurrentnessReceiptRef: authority.externalAdmission.admissionReceiptRef,
    schedulerCurrentnessReceiptFingerprint: authority.externalAdmission.semanticFingerprint,
    schedulerAuthorityEvidenceRef: receipt.schedulerAuthorityEvidence?.schedulerAuthorityEvidenceRef,
    schedulerAuthorityEvidenceFingerprint: receipt.schedulerAuthorityEvidence?.semanticFingerprint,
    externalSchedulerAdmissionSchemaVersion: authority.externalAdmission.schemaVersion,
    externalSchedulerAdmissionContractRef: registry.schedulerIntegration.externalSchedulerAuthority.admissionContractRef,
    writerClaimRef: authority.writerClaimRef,
    writerClaimState: authority.writerClaimState,
    pathClaimFingerprint: authority.pathClaimFingerprint,
    schedulerGeneration: authority.queue.generation,
    acceptedPriorityClass: authority.acceptedPriorityClass,
    formedAt: authority.externalAdmission.formedAt,
    observedAt: authority.externalAdmission.observedAt,
    expiresAt: authority.externalAdmission.expiresAt
  })) if (receipt[field] !== expected) throw new Error(`scheduler admission has stale ${field}`);
  if (receipt.state !== 'ADMITTED' || receipt.currentness !== registry.schedulerIntegration.schedulerCurrentnessRequired ||
      receipt.dependencyState !== registry.schedulerIntegration.dependencyStateRequired ||
      receipt.writerClaimState !== registry.schedulerIntegration.writerClaimStateRequired ||
      receipt.activeInteractiveWorkState !== 'RETAINED' || receipt.conflictingWriterRefs.length !== 0 ||
      receipt.externalEffectsAuthorized !== false || receipt.modelWorkerLeased !== false) {
    throw new Error('scheduler admission bypasses dependency, currentness, writer, interactive-work, worker, or effect authority');
  }
  if (!review.pathClaimRefs.includes(receipt.writerClaimRef) ||
      receipt.pathClaimFingerprint !== semanticHash(review.pathClaimRefs)) {
    throw new Error('scheduler admission writer claim is detached from the exact reviewed path claim');
  }
  if (receipt.acceptedPriorityClass === 'INTERACTIVE') throw new Error('ConcernWatch cannot claim INTERACTIVE scheduler priority');
}

function applySchedulerAdmission(snapshot, receipt, registry) {
  if (snapshot.state !== 'ADMISSION_REVIEW') throw new Error('scheduler admission requires ADMISSION_REVIEW');
  validateSchedulerAdmissionReceipt(receipt, snapshot, registry);
  if (snapshot.schedulerAdmissions.length) throw new Error('same concern was admitted twice');
  assertLegalTransition(snapshot.state, 'ADMITTED_WORK', registry);
  snapshot.schedulerAdmissions.push(clone(receipt));
  snapshot.state = 'ADMITTED_WORK';
  snapshot.outcome = 'AUTO_RESOLUTION_ADMITTED';
  snapshot.queuePriorityActive = true;
}

function validateHumanAttentionRequest(request, snapshot) {
  assertContentAddressed(request, 'humanAttentionRequestRef', 'concern-human-attention', 'human attention request');
  const threshold = snapshot.thresholdReceipts.at(-1);
  if (request.aggregateRef !== snapshot.aggregateRef || request.aggregateFingerprint !== currentSnapshotFingerprint(snapshot) ||
      request.thresholdReceiptRef !== threshold?.thresholdReceiptRef || request.thresholdReceiptFingerprint !== threshold?.semanticFingerprint) {
    throw new Error('human attention request is stale or detached from threshold evidence');
  }
  if (request.availableOptions.length < 2 || (request.recommendedOption != null && !request.availableOptions.includes(request.recommendedOption))) {
    throw new Error('human attention request options are not minimal and explicit');
  }
  if (request.agentRelayRequestedFromVictor || request.operationalClosureRequestedFromVictor) {
    throw new Error('human attention request asks Victor to relay or close operational records');
  }
}

function applyHumanAttention(snapshot, request, registry) {
  if (!['THRESHOLD_MET', 'ADMISSION_REVIEW', 'HELD_UNKNOWN'].includes(snapshot.state)) {
    throw new Error('human attention route requires active threshold, review, or hold');
  }
  validateHumanAttentionRequest(request, snapshot);
  assertLegalTransition(snapshot.state, 'WAITING_HUMAN', registry);
  snapshot.humanAttentionRequests.push(clone(request));
  snapshot.state = 'WAITING_HUMAN';
  snapshot.outcome = 'HUMAN_ATTENTION_REQUIRED';
}

function validateRecoveryEvidence(value, snapshot) {
  assertContentAddressed(value, 'recoveryConcernEvidenceRef', 'concern-recovery-evidence', 'recovery concern evidence');
  const admission = snapshot.schedulerAdmissions.at(-1);
  if (!admission || value.aggregateRef !== snapshot.aggregateRef || value.aggregateFingerprint !== currentSnapshotFingerprint(snapshot) ||
      value.workNodeRef !== admission.workNodeRef || value.currentness !== 'CURRENT' || value.schedulerCurrentness !== 'CURRENT') {
    throw new Error('recovery evidence is stale, prior-cycle, or not bound to admitted work');
  }
}

function applyRecoveryEvidence(snapshot, value, registry) {
  if (!['ADMITTED_WORK', 'WAITING_HUMAN', 'HELD_UNKNOWN'].includes(snapshot.state)) {
    throw new Error('recovery evidence requires active admitted or held concern');
  }
  validateRecoveryEvidence(value, snapshot);
  if (snapshot.recoveryEvidence.some((item) => item.failureRef === value.failureRef && item.failureFingerprint === value.failureFingerprint)) {
    throw new Error('duplicate recovery evidence reached replay');
  }
  assertLegalTransition(snapshot.state, snapshot.state, registry);
  snapshot.recoveryEvidence.push(clone(value));
}

function schedulerCompletionCore(value) {
  requireObject(value, 'scheduler completion');
  return {
    completionReceiptRef: requireString(value.completionReceiptRef, 'scheduler completion receiptRef'),
    completionReceiptFingerprint: requireFingerprint(value.completionReceiptFingerprint, 'scheduler completion fingerprint'),
    schedulerAggregateFingerprint: requireFingerprint(value.schedulerAggregateFingerprint, 'scheduler completion aggregate fingerprint'),
    workNodeRef: requireString(value.workNodeRef, 'scheduler completion workNodeRef'),
    workNodeFingerprint: requireFingerprint(value.workNodeFingerprint, 'scheduler completion workNodeFingerprint'),
    state: requireString(value.state, 'scheduler completion state'),
    currentness: requireString(value.currentness, 'scheduler completion currentness'),
    observedAt: canonicalTimestamp(value.observedAt, 'scheduler completion observedAt')
  };
}

function closureCore(snapshot, input, registry) {
  requireObject(input, 'concern closure');
  const disposition = assertKnown(input.disposition, registry.vocabularies.closureDispositions, 'closure disposition');
  const schedulerCompletion = input.schedulerCompletion == null ? null : schedulerCompletionCore(input.schedulerCompletion);
  if (snapshot.schedulerAdmissions.length === 0 && schedulerCompletion != null) {
    throw new Error('closure cannot cite scheduler completion without exact scheduler admission');
  }
  const successorConcernAggregateRef = input.successorConcernAggregateRef == null ? null :
    requireString(input.successorConcernAggregateRef, 'successor concern aggregateRef');
  const successorConcernAggregateFingerprint = input.successorConcernAggregateFingerprint == null ? null :
    requireFingerprint(input.successorConcernAggregateFingerprint, 'successor concern fingerprint');
  if (disposition === 'SUPERSEDED_BY_EXACT_SUCCESSOR') {
    if (!successorConcernAggregateRef || !successorConcernAggregateFingerprint) throw new Error('supersession requires exact successor');
  } else if (successorConcernAggregateRef != null || successorConcernAggregateFingerprint != null) {
    throw new Error('non-supersession closure cannot cite a successor');
  }
  const evidenceRefs = exactRefs(input.evidenceRefs ?? [], 'closure evidenceRefs');
  if (disposition === 'FALSE_POSITIVE_WITH_EVIDENCE' && evidenceRefs.length === 0) {
    throw new Error('false-positive closure requires evidence');
  }
  return {
    schemaVersion: registry.closureContract.schemaVersion,
    contractRef: registry.closureContract.contractRef,
    aggregateRef: snapshot.aggregateRef,
    aggregateFingerprint: currentSnapshotFingerprint(snapshot),
    concernSubjectRef: snapshot.concernSubjectRef,
    disposition,
    evidenceRefs,
    schedulerCompletion,
    successorConcernAggregateRef,
    successorConcernAggregateFingerprint,
    recurrenceWatch: disposition === 'RESOLVED_WATCH_FOR_RECURRENCE',
    closedByRef: requireString(input.closedByRef, 'closedByRef'),
    closedAt: canonicalTimestamp(input.closedAt, 'closedAt'),
    historyRetained: true,
    activeProjectionRemoved: disposition !== 'HELD_UNKNOWN',
    queuePriorityRemoved: true
  };
}

function validateClosure(closure, snapshot, registry) {
  assertContentAddressed(closure, 'closureRef', 'concern-closure', 'concern closure');
  const expected = contentAddressed(closureCore(snapshot, closure, registry), 'closureRef', 'concern-closure');
  if (semanticHash(expected) !== semanticHash(closure)) {
    throw new Error('closure does not match the exact source-managed closure contract');
  }
  if (snapshot.schedulerAdmissions.length) {
    const admission = snapshot.schedulerAdmissions.at(-1);
    const completion = closure.schedulerCompletion;
    if (!completion || completion.state !== 'COMPLETED' || completion.currentness !== 'CURRENT' ||
        completion.workNodeRef !== admission.workNodeRef || completion.workNodeFingerprint !== admission.workNodeFingerprint ||
        Date.parse(completion.observedAt) > Date.parse(closure.closedAt)) {
      throw new Error('admitted concern closure requires exact current scheduler completion');
    }
  }
}

function applyClosure(snapshot, closure, registry) {
  if (TERMINAL_STATES.has(snapshot.state)) throw new Error('concern is already terminal');
  validateClosure(closure, snapshot, registry);
  const stateByDisposition = {
    RESOLVED_NO_RECURRENCE_EXPECTED: 'RESOLVED',
    RESOLVED_WATCH_FOR_RECURRENCE: 'RESOLVED',
    SUPERSEDED_BY_EXACT_SUCCESSOR: 'SUPERSEDED',
    FALSE_POSITIVE_WITH_EVIDENCE: 'RESOLVED',
    ACCEPTED_RISK: 'RESOLVED',
    HELD_UNKNOWN: 'HELD_UNKNOWN'
  };
  const next = stateByDisposition[closure.disposition];
  if (!next) throw new Error(`closure disposition is unknown: ${closure.disposition}`);
  assertLegalTransition(snapshot.state, next, registry);
  snapshot.closures.push(clone(closure));
  snapshot.state = next;
  snapshot.outcome = next === 'HELD_UNKNOWN' ? 'HELD_UNKNOWN' : 'NO_CHANGE_REQUIRED';
  snapshot.active = next === 'HELD_UNKNOWN';
  snapshot.queuePriorityActive = false;
}

function applyArchive(snapshot, receipt, registry) {
  assertContentAddressed(receipt, 'archiveReceiptRef', 'concern-archive', 'archive receipt');
  if (!['RESOLVED', 'SUPERSEDED'].includes(snapshot.state) || receipt.aggregateRef !== snapshot.aggregateRef ||
      receipt.aggregateFingerprint !== currentSnapshotFingerprint(snapshot)) throw new Error('archive requires exact terminal concern');
  assertLegalTransition(snapshot.state, 'ARCHIVED', registry);
  snapshot.state = 'ARCHIVED';
  snapshot.active = false;
  snapshot.queuePriorityActive = false;
}

function applyEvent(snapshot, event, registry) {
  const prefix = `concern-event.${event.type.toLowerCase().replaceAll('_', '-')}`;
  assertContentAddressed(event, 'eventRef', prefix, 'ConcernWatch event');
  if (event.aggregateRef !== snapshot.aggregateRef || event.concernSubjectRef !== snapshot.concernSubjectRef ||
      event.cycle !== snapshot.cycle || event.sequence !== snapshot.events.length ||
      event.priorEventFingerprint !== (snapshot.events.at(-1)?.semanticFingerprint ?? null)) {
    throw new Error('ConcernWatch event has stale, forged, or prior-cycle replay lineage');
  }
  if (snapshot.events.some((item) => item.eventRef === event.eventRef)) throw new Error('duplicate event after restart');
  if (snapshot.events.length) assertChronology(event.occurredAt, snapshot.events.at(-1).occurredAt, 'event', { strict: false });
  if (event.type === 'OBSERVATION_RECORDED') appendObservation(snapshot, event.payload.observation, registry);
  else if (event.type === 'THRESHOLD_EVALUATED') applyThreshold(snapshot, event.payload.thresholdReceipt, registry);
  else if (event.type === 'ADMISSION_REVIEWED') applyAdmissionReview(snapshot, event.payload.admissionReview, registry);
  else if (event.type === 'SCHEDULER_ADMITTED') applySchedulerAdmission(snapshot, event.payload.schedulerAdmission, registry);
  else if (event.type === 'HUMAN_ATTENTION_REQUESTED') applyHumanAttention(snapshot, event.payload.humanAttentionRequest, registry);
  else if (event.type === 'RECOVERY_EVIDENCE_RECORDED') applyRecoveryEvidence(snapshot, event.payload.recoveryEvidence, registry);
  else if (event.type === 'CONCERN_CLOSED') applyClosure(snapshot, event.payload.closure, registry);
  else if (event.type === 'CONCERN_ARCHIVED') applyArchive(snapshot, event.payload.archiveReceipt, registry);
  else throw new Error(`unhandled ConcernWatch event ${event.type}`);
  snapshot.events.push(clone(event));
  snapshot.revision = snapshot.events.length;
  return snapshot;
}

function replay(root, events, registry) {
  const snapshot = initialSnapshot(root);
  for (const event of events) applyEvent(snapshot, event, registry);
  return finalizeSnapshot(snapshot);
}

function appendEvent(aggregate, type, payload, occurredAt, registry) {
  validateConcernAggregate(aggregate, { registry });
  const event = formEvent(aggregate, type, payload, occurredAt, registry);
  return replay(aggregate.root, [...aggregate.events, event], registry);
}

export function recordConcernObservation(aggregate, observation, { registry } = {}) {
  const source = registryOrThrow(registry);
  validateConcernAggregate(aggregate, { registry: source });
  const validation = validateConcernObservation(observation, { registry: source });
  if (!validation.ok) throw new Error(validation.errors.join('; '));
  const sameRef = aggregate.observations.find((item) => item.concernObservationRef === observation.concernObservationRef);
  if (sameRef) {
    if (sameRef.semanticFingerprint !== observation.semanticFingerprint) throw new Error('same observation ref has different meaning');
    return { aggregate, changed: false, outcome: 'NO_CHANGE_REQUIRED' };
  }
  observationMatchesSubject(aggregate, observation);
  const newEvidence = observation.evidenceRefs.filter((ref) => !aggregate.evidenceRefs.includes(ref));
  if (newEvidence.length === 0) return { aggregate, changed: false, outcome: 'NO_CHANGE_REQUIRED' };
  const next = appendEvent(aggregate, 'OBSERVATION_RECORDED', { observation }, observation.observedAt, source);
  return { aggregate: next, changed: true, outcome: next.outcome };
}

export function recordThresholdEvaluation(aggregate, receipt, { registry } = {}) {
  const source = registryOrThrow(registry);
  validateConcernAggregate(aggregate, { registry: source });
  if (aggregate.thresholdReceipts.at(-1)?.semanticFingerprint === receipt.semanticFingerprint) {
    return { aggregate, changed: false, outcome: 'NO_CHANGE_REQUIRED' };
  }
  const next = appendEvent(aggregate, 'THRESHOLD_EVALUATED', { thresholdReceipt: receipt }, receipt.observedAt, source);
  return { aggregate: next, changed: true, outcome: next.outcome };
}

export function formConcernAdmissionReview(aggregate, input, { registry } = {}) {
  const source = registryOrThrow(registry);
  validateConcernAggregate(aggregate, { registry: source });
  if (aggregate.state !== 'THRESHOLD_MET') throw new Error('admission review requires exact threshold crossing');
  if (input.priorityOverride != null || input.executionAuthorityGranted === true) throw new Error('admission review cannot override priority or grant execution');
  const threshold = aggregate.thresholdReceipts.at(-1);
  const core = {
    schemaVersion: 'vexlife.concern-admission-review/v1',
    contractRef: 'contract.vexlife.concern-admission-review/v1',
    aggregateRef: aggregate.aggregateRef,
    aggregateFingerprint: aggregate.semanticFingerprint,
    concernSubjectRef: aggregate.concernSubjectRef,
    thresholdReceiptRef: threshold.thresholdReceiptRef,
    thresholdReceiptFingerprint: threshold.semanticFingerprint,
    proposedWorkRef: requireString(input.proposedWorkRef, 'proposedWorkRef'),
    intentEnvelopeRef: requireString(input.intentEnvelopeRef, 'intentEnvelopeRef'),
    intentEnvelopeFingerprint: requireFingerprint(input.intentEnvelopeFingerprint, 'intentEnvelopeFingerprint'),
    workgraphRef: requireString(input.workgraphRef, 'workgraphRef'),
    workgraphFingerprint: requireFingerprint(input.workgraphFingerprint, 'workgraphFingerprint'),
    workNodeRef: requireString(input.workNodeRef, 'workNodeRef'),
    workNodeFingerprint: requireFingerprint(input.workNodeFingerprint, 'workNodeFingerprint'),
    dependencyRefs: exactRefs(input.dependencyRefs ?? [], 'dependencyRefs'),
    pathClaimRefs: exactRefs(input.pathClaimRefs ?? [], 'pathClaimRefs', { required: true }),
    capabilityRefs: exactRefs(input.capabilityRefs ?? [], 'capabilityRefs'),
    effectRefs: exactRefs(input.effectRefs ?? [], 'effectRefs'),
    returnRouteRef: requireString(input.returnRouteRef, 'returnRouteRef'),
    recommendedPriorityClass: threshold.recommendedPriorityClass,
    routeClass: input.routeClass ?? 'AUTO_RESOLUTION',
    formedAt: canonicalTimestamp(input.formedAt, 'admission review formedAt'),
    executionAuthorityGranted: false,
    externalEffectsAuthorized: false
  };
  assertChronology(core.formedAt, threshold.observedAt, 'admission review');
  return contentAddressed(core, 'admissionReviewRef', 'concern-admission-review');
}

export function recordConcernAdmissionReview(aggregate, review, { registry } = {}) {
  const source = registryOrThrow(registry);
  const next = appendEvent(aggregate, 'ADMISSION_REVIEWED', { admissionReview: review }, review.formedAt, source);
  return { aggregate: next, changed: true };
}

export function createConcernSchedulerAdmissionReceipt(aggregate, review, input, { registry } = {}) {
  const source = registryOrThrow(registry);
  validateConcernAggregate(aggregate, { registry: source });
  validateAdmissionReview(review, aggregate);
  if (aggregate.state !== 'ADMISSION_REVIEW' || aggregate.admissionReviews.at(-1)?.admissionReviewRef !== review.admissionReviewRef) {
    throw new Error('scheduler admission review is not current');
  }
  requireObject(input, 'scheduler admission input');
  const callerAuthored = CALLER_AUTHORED_SCHEDULER_FIELDS.filter((field) => Object.hasOwn(input, field));
  if (callerAuthored.length) {
    throw new Error(`caller-authored scheduler authority fields are forbidden: ${callerAuthored.join(', ')}`);
  }
  const unknownInput = Object.keys(input).filter((field) => field !== 'schedulerAuthorityEvidence');
  if (unknownInput.length) throw new Error(`scheduler admission input contains unknown fields: ${unknownInput.join(', ')}`);
  const threshold = aggregate.thresholdReceipts.at(-1);
  const schedulerAuthorityEvidence = formSchedulerAuthorityEvidence(input.schedulerAuthorityEvidence, source);
  const authority = validateSchedulerAuthorityEvidence(schedulerAuthorityEvidence, review, source);
  const acceptedPriorityClass = assertKnown(
    authority.acceptedPriorityClass,
    source.vocabularies.priorityClasses,
    'acceptedPriorityClass'
  );
  const core = {
    schemaVersion: source.schedulerIntegration.admissionSchemaVersion,
    contractRef: source.schedulerIntegration.admissionContractRef,
    concernAggregateRef: aggregate.aggregateRef,
    concernAggregateFingerprint: aggregate.semanticFingerprint,
    concernSubjectRef: aggregate.concernSubjectRef,
    thresholdReceiptRef: threshold.thresholdReceiptRef,
    thresholdReceiptFingerprint: threshold.semanticFingerprint,
    admissionReviewRef: review.admissionReviewRef,
    admissionReviewFingerprint: review.semanticFingerprint,
    intentEnvelopeRef: review.intentEnvelopeRef,
    intentEnvelopeFingerprint: review.intentEnvelopeFingerprint,
    workgraphRef: review.workgraphRef,
    workgraphFingerprint: review.workgraphFingerprint,
    workNodeRef: review.workNodeRef,
    workNodeFingerprint: review.workNodeFingerprint,
    schedulerAggregateFingerprint: authority.queue.semanticFingerprint,
    schedulerCurrentnessReceiptRef: authority.externalAdmission.admissionReceiptRef,
    schedulerCurrentnessReceiptFingerprint: authority.externalAdmission.semanticFingerprint,
    schedulerAuthorityEvidenceRef: schedulerAuthorityEvidence.schedulerAuthorityEvidenceRef,
    schedulerAuthorityEvidenceFingerprint: schedulerAuthorityEvidence.semanticFingerprint,
    externalSchedulerAdmissionSchemaVersion: authority.externalAdmission.schemaVersion,
    externalSchedulerAdmissionContractRef: source.schedulerIntegration.externalSchedulerAuthority.admissionContractRef,
    schedulerAuthorityEvidence,
    writerClaimRef: authority.writerClaimRef,
    pathClaimFingerprint: authority.pathClaimFingerprint,
    conflictingWriterRefs: authority.conflictingWriterRefs,
    schedulerGeneration: authority.queue.generation,
    acceptedPriorityClass,
    dependencyState: 'SATISFIED',
    activeInteractiveWorkState: 'RETAINED',
    writerClaimState: authority.writerClaimState,
    state: 'ADMITTED',
    currentness: 'CURRENT',
    formedAt: canonicalTimestamp(authority.externalAdmission.formedAt, 'scheduler admission formedAt'),
    observedAt: canonicalTimestamp(authority.externalAdmission.observedAt, 'scheduler admission observedAt'),
    expiresAt: canonicalTimestamp(authority.externalAdmission.expiresAt, 'scheduler admission expiresAt'),
    modelWorkerLeased: false,
    externalEffectsAuthorized: false
  };
  if (!Number.isSafeInteger(core.schedulerGeneration) || core.schedulerGeneration < 1) throw new Error('schedulerGeneration must be positive');
  assertChronology(core.observedAt, core.formedAt, 'scheduler admission observation');
  assertChronology(core.expiresAt, core.observedAt, 'scheduler admission expiry', { strict: true });
  const receipt = contentAddressed(core, 'schedulerAdmissionRef', 'concern-scheduler-admission');
  validateSchedulerAdmissionReceipt(receipt, aggregate, source);
  return receipt;
}

export function recordConcernSchedulerAdmission(aggregate, receipt, { registry } = {}) {
  const source = registryOrThrow(registry);
  const next = appendEvent(aggregate, 'SCHEDULER_ADMITTED', { schedulerAdmission: receipt }, receipt.observedAt, source);
  return { aggregate: next, changed: true };
}

export function createHumanAttentionRequest(aggregate, input, { registry } = {}) {
  const source = registryOrThrow(registry);
  validateConcernAggregate(aggregate, { registry: source });
  const threshold = aggregate.thresholdReceipts.at(-1);
  if (!threshold || !['THRESHOLD_MET', 'ADMISSION_REVIEW', 'HELD_UNKNOWN'].includes(aggregate.state)) {
    throw new Error('human attention requires current threshold or hold');
  }
  const options = exactRefs(input.availableOptions ?? [], 'availableOptions', { required: true });
  const core = {
    schemaVersion: source.humanAttentionContract.schemaVersion,
    contractRef: source.humanAttentionContract.contractRef,
    aggregateRef: aggregate.aggregateRef,
    aggregateFingerprint: aggregate.semanticFingerprint,
    concernSubjectRef: aggregate.concernSubjectRef,
    thresholdReceiptRef: threshold.thresholdReceiptRef,
    thresholdReceiptFingerprint: threshold.semanticFingerprint,
    whyVictorIsNeeded: requireString(input.whyVictorIsNeeded, 'whyVictorIsNeeded'),
    smallestDecisionOrEvidence: requireString(input.smallestDecisionOrEvidence, 'smallestDecisionOrEvidence'),
    availableOptions: options,
    recommendedOption: input.recommendedOption ?? null,
    consequenceOfWaiting: requireString(input.consequenceOfWaiting, 'consequenceOfWaiting'),
    safeUntil: input.safeUntil == null ? null : canonicalTimestamp(input.safeUntil, 'safeUntil'),
    returnRouteRef: requireString(input.returnRouteRef, 'returnRouteRef'),
    formedAt: canonicalTimestamp(input.formedAt, 'human attention formedAt'),
    agentRelayRequestedFromVictor: false,
    operationalClosureRequestedFromVictor: false
  };
  const request = contentAddressed(core, 'humanAttentionRequestRef', 'concern-human-attention');
  validateHumanAttentionRequest(request, aggregate);
  return request;
}

export function recordHumanAttentionRequest(aggregate, request, { registry } = {}) {
  const source = registryOrThrow(registry);
  const next = appendEvent(aggregate, 'HUMAN_ATTENTION_REQUESTED', { humanAttentionRequest: request }, request.formedAt, source);
  return { aggregate: next, changed: true };
}

export function createRecoveryConcernEvidence(aggregate, input, { registry } = {}) {
  const source = registryOrThrow(registry);
  validateConcernAggregate(aggregate, { registry: source });
  const admission = aggregate.schedulerAdmissions.at(-1);
  if (!admission) throw new Error('recovery concern evidence requires admitted work');
  const core = {
    schemaVersion: 'vexlife.concern-recovery-evidence/v1',
    aggregateRef: aggregate.aggregateRef,
    aggregateFingerprint: aggregate.semanticFingerprint,
    concernSubjectRef: aggregate.concernSubjectRef,
    workNodeRef: admission.workNodeRef,
    workNodeFingerprint: admission.workNodeFingerprint,
    recoveryAggregateRef: requireString(input.recoveryAggregateRef, 'recoveryAggregateRef'),
    recoveryAggregateFingerprint: requireFingerprint(input.recoveryAggregateFingerprint, 'recoveryAggregateFingerprint'),
    failureRef: requireString(input.failureRef, 'failureRef'),
    failureFingerprint: requireFingerprint(input.failureFingerprint, 'failureFingerprint'),
    recoveryDisposition: requireString(input.recoveryDisposition, 'recoveryDisposition'),
    schedulerCurrentnessReceiptRef: requireString(input.schedulerCurrentnessReceiptRef, 'schedulerCurrentnessReceiptRef'),
    schedulerCurrentnessReceiptFingerprint: requireFingerprint(input.schedulerCurrentnessReceiptFingerprint, 'schedulerCurrentnessReceiptFingerprint'),
    schedulerCurrentness: input.schedulerCurrentness,
    currentness: input.currentness,
    evidenceRefs: exactRefs(input.evidenceRefs ?? [], 'recovery evidenceRefs', { required: true }),
    observedAt: canonicalTimestamp(input.observedAt, 'recovery evidence observedAt')
  };
  const value = contentAddressed(core, 'recoveryConcernEvidenceRef', 'concern-recovery-evidence');
  validateRecoveryEvidence(value, aggregate);
  return value;
}

export function recordRecoveryConcernEvidence(aggregate, evidence, { registry } = {}) {
  const source = registryOrThrow(registry);
  if (aggregate.recoveryEvidence.some((item) => item.failureRef === evidence.failureRef && item.failureFingerprint === evidence.failureFingerprint)) {
    return { aggregate, changed: false, outcome: 'NO_CHANGE_REQUIRED' };
  }
  const next = appendEvent(aggregate, 'RECOVERY_EVIDENCE_RECORDED', { recoveryEvidence: evidence }, evidence.observedAt, source);
  return { aggregate: next, changed: true, outcome: next.outcome };
}

export function createConcernClosureReceipt(aggregate, input, { registry } = {}) {
  const source = registryOrThrow(registry);
  validateConcernAggregate(aggregate, { registry: source });
  const closure = contentAddressed(closureCore(aggregate, input, source), 'closureRef', 'concern-closure');
  validateClosure(closure, aggregate, source);
  return closure;
}

export function closeConcern(aggregate, closure, { registry } = {}) {
  const source = registryOrThrow(registry);
  const next = appendEvent(aggregate, 'CONCERN_CLOSED', { closure }, closure.closedAt, source);
  return { aggregate: next, changed: true };
}

export function archiveConcern(aggregate, { archivedAt, archivedByRef }, { registry } = {}) {
  const source = registryOrThrow(registry);
  validateConcernAggregate(aggregate, { registry: source });
  const receipt = contentAddressed({
    schemaVersion: 'vexlife.concern-archive-receipt/v1',
    aggregateRef: aggregate.aggregateRef,
    aggregateFingerprint: aggregate.semanticFingerprint,
    archivedByRef: requireString(archivedByRef, 'archivedByRef'),
    archivedAt: canonicalTimestamp(archivedAt, 'archivedAt'),
    historyRetained: true
  }, 'archiveReceiptRef', 'concern-archive');
  const next = appendEvent(aggregate, 'CONCERN_ARCHIVED', { archiveReceipt: receipt }, receipt.archivedAt, source);
  return { aggregate: next, archiveReceipt: receipt, changed: true };
}

export function reopenConcernFromRecurrence(priorAggregate, observation, { formedAt }, { registry } = {}) {
  const source = registryOrThrow(registry);
  validateConcernAggregate(priorAggregate, { registry: source });
  const closure = priorAggregate.closures.at(-1);
  if (priorAggregate.state !== 'RESOLVED' || closure?.disposition !== 'RESOLVED_WATCH_FOR_RECURRENCE') {
    throw new Error('prior concern is not resolved with recurrence watch');
  }
  exactSubjectBinding(observation.subjectBinding, priorAggregate.root.concernSubject, observation);
  const priorLineage = {
    priorConcernAggregateRef: priorAggregate.aggregateRef,
    priorConcernAggregateFingerprint: priorAggregate.semanticFingerprint,
    priorClosureRef: closure.closureRef,
    priorClosureFingerprint: closure.semanticFingerprint
  };
  if (semanticHash(observation.recurrenceBinding) !== semanticHash(priorLineage)) {
    throw new Error('recurrence cites stale or wrong prior concern lineage');
  }
  let aggregate = createConcernAggregate({
    subject: priorAggregate.root.concernSubject,
    formedAt,
    priorLineage,
    cycle: priorAggregate.cycle + 1
  }, { registry: source });
  aggregate = recordConcernObservation(aggregate, observation, { registry: source }).aggregate;
  return aggregate;
}

function compactMeaning(aggregate) {
  const threshold = aggregate.thresholdReceipts.at(-1) ?? null;
  const admission = aggregate.schedulerAdmissions.at(-1) ?? null;
  const human = aggregate.humanAttentionRequests.at(-1) ?? null;
  const closure = aggregate.closures.at(-1) ?? null;
  return {
    concernAggregateRef: aggregate.aggregateRef,
    concernSubjectRef: aggregate.concernSubjectRef,
    state: aggregate.state,
    outcome: aggregate.outcome,
    cycle: aggregate.cycle,
    active: aggregate.active,
    observationCount: aggregate.observations.length,
    evidenceCount: aggregate.evidenceRefs.length,
    unknownCount: aggregate.unknownRefs.length,
    latestObservationRef: aggregate.observations.at(-1)?.concernObservationRef ?? null,
    thresholdReceiptRef: threshold?.thresholdReceiptRef ?? null,
    thresholdCrossed: threshold?.thresholdCrossed ?? false,
    recommendedPriorityClass: threshold?.recommendedPriorityClass ?? 'BACKGROUND',
    workNodeRef: admission?.workNodeRef ?? null,
    schedulerAdmissionRef: admission?.schedulerAdmissionRef ?? null,
    humanAttentionRequestRef: human?.humanAttentionRequestRef ?? null,
    closureRef: closure?.closureRef ?? null,
    closureDisposition: closure?.disposition ?? null,
    priorConcernAggregateRef: aggregate.root.priorLineage?.priorConcernAggregateRef ?? null
  };
}

export function projectConcernAggregate(aggregate, { registry } = {}) {
  const source = registryOrThrow(registry);
  validateConcernAggregate(aggregate, { registry: source });
  const meaning = compactMeaning(aggregate);
  const active = meaning.active;
  const views = {
    QUEUE: active && ['ADMISSION_REVIEW', 'ADMITTED_WORK'].includes(meaning.state) ? {
      concernAggregateRef: meaning.concernAggregateRef,
      workNodeRef: meaning.workNodeRef,
      priorityClass: meaning.recommendedPriorityClass,
      state: meaning.state
    } : null,
    TERRAIN: active ? {
      concernAggregateRef: meaning.concernAggregateRef,
      concernSubjectRef: meaning.concernSubjectRef,
      state: meaning.state,
      thresholdCrossed: meaning.thresholdCrossed
    } : null,
    HEALTH: {
      state: meaning.state === 'HELD_UNKNOWN' ? 'ATTENTION' : active && meaning.thresholdCrossed ? 'ATTENTION' : 'CLEAR',
      activeConcernRef: active ? meaning.concernAggregateRef : null,
      evidenceCount: meaning.evidenceCount,
      unknownCount: meaning.unknownCount
    },
    GUIDE: active ? {
      concernAggregateRef: meaning.concernAggregateRef,
      whyNowRef: meaning.thresholdReceiptRef,
      nextRouteRef: meaning.humanAttentionRequestRef ?? meaning.schedulerAdmissionRef,
      state: meaning.state
    } : null,
    HUMAN_ATTENTION_INBOX: meaning.state === 'WAITING_HUMAN' ? {
      concernAggregateRef: meaning.concernAggregateRef,
      humanAttentionRequestRef: meaning.humanAttentionRequestRef
    } : null
  };
  return contentAddressed({
    schemaVersion: source.projectionContract.schemaVersion,
    contractRef: source.projectionContract.contractRef,
    sourceAggregateRef: aggregate.aggregateRef,
    sourceAggregateFingerprint: aggregate.semanticFingerprint,
    meaning,
    views,
    rawObservationHistoryIncluded: false,
    rawEvidencePayloadIncluded: false
  }, 'projectionRef', 'concern-watch-projection');
}

export function createConcernProjectionRelay(initialAggregate, { registry } = {}) {
  const source = registryOrThrow(registry);
  let projection = projectConcernAggregate(initialAggregate, { registry: source });
  let revision = 0;
  return {
    get value() { return projection; },
    get revision() { return revision; },
    update(aggregate) {
      const next = projectConcernAggregate(aggregate, { registry: source });
      if (next.semanticFingerprint === projection.semanticFingerprint) return { changed: false, projection, revision };
      projection = next;
      revision += 1;
      return { changed: true, projection, revision };
    }
  };
}

export function serializeConcernAggregate(aggregate, { registry } = {}) {
  validateConcernAggregate(aggregate, { registry });
  return JSON.stringify(canonicalize(aggregate));
}

export function restoreConcernAggregate(serialized, { registry } = {}) {
  const source = registryOrThrow(registry);
  let parsed;
  try { parsed = JSON.parse(serialized); } catch { throw new Error('serialized ConcernWatch aggregate is malformed'); }
  requireObject(parsed, 'serialized ConcernWatch aggregate');
  const restored = replay(parsed.root, parsed.events ?? [], source);
  if (semanticHash(restored) !== semanticHash(parsed)) throw new Error('serialized ConcernWatch aggregate is forged, stale, or not replay-derived');
  return restored;
}

export function validateConcernAggregate(aggregate, { registry } = {}) {
  const source = registryOrThrow(registry);
  requireObject(aggregate, 'ConcernWatch aggregate');
  if (aggregate.root.policyRef !== source.thresholdPolicy.policyRef || aggregate.root.policyFingerprint !== policyFingerprint(source)) {
    throw new Error('ConcernWatch aggregate threshold policy is stale or substituted');
  }
  validateConcernSubject(aggregate.root.concernSubject, { registry: source });
  const restored = replay(aggregate.root, aggregate.events ?? [], source);
  if (semanticHash(restored) !== semanticHash(aggregate)) throw new Error('ConcernWatch aggregate is not exact replay-derived current truth');
  return { ok: true, errors: [] };
}

function integratedReceiptCore(input, registry) {
  return {
    schemaVersion: registry.integratedJourney.schemaVersion,
    contractRef: registry.integratedJourney.contractRef,
    state: 'PASS',
    currentness: 'CURRENT',
    journeyStates: input.journeyStates,
    concernSubjectRef: input.subject.concernSubjectRef,
    concernSubjectFingerprint: input.subject.semanticFingerprint,
    resolvedConcernAggregateRef: input.resolved.aggregateRef,
    resolvedConcernAggregateFingerprint: input.resolved.semanticFingerprint,
    resolvedClosureRef: input.resolved.closures.at(-1).closureRef,
    recurrenceConcernAggregateRef: input.recurrence.aggregateRef,
    recurrenceConcernAggregateFingerprint: input.recurrence.semanticFingerprint,
    recurrencePriorConcernAggregateRef: input.recurrence.root.priorLineage.priorConcernAggregateRef,
    thresholdReceiptRef: input.threshold.thresholdReceiptRef,
    thresholdReceiptFingerprint: input.threshold.semanticFingerprint,
    admissionReviewRef: input.review.admissionReviewRef,
    admissionReviewFingerprint: input.review.semanticFingerprint,
    schedulerAdmissionRef: input.admission.schedulerAdmissionRef,
    schedulerAdmissionFingerprint: input.admission.semanticFingerprint,
    workgraphRef: input.admission.workgraphRef,
    workgraphFingerprint: input.admission.workgraphFingerprint,
    workNodeRef: input.admission.workNodeRef,
    workNodeFingerprint: input.admission.workNodeFingerprint,
    recoveryConcernEvidenceRef: input.recovery.recoveryConcernEvidenceRef,
    recoveryConcernEvidenceFingerprint: input.recovery.semanticFingerprint,
    projectionRef: input.projection.projectionRef,
    projectionFingerprint: input.projection.semanticFingerprint,
    duplicateObservationSuppressed: true,
    overlappingWriterRejectedUnchanged: true,
    dormantPhysicalWorkers: 0,
    dormantEffectAuthorities: 0,
    externalEffectsExecuted: false,
    modelTurnsExecuted: 0,
    liveClockUsed: false,
    generatedFromOneCausalLineage: true,
    proofRefs: clone(registry.integratedJourney.proofRefs),
    causalEvidence: {
      concernSubject: clone(input.subject),
      resolvedAggregate: clone(input.resolved),
      recurrenceAggregate: clone(input.recurrence),
      thresholdReceipt: clone(input.threshold),
      admissionReview: clone(input.review),
      schedulerAdmission: clone(input.admission),
      recoveryEvidence: clone(input.recovery),
      resolvedProjection: clone(input.projection)
    },
    repositoryGateRefs: [
      'check.tests',
      'check.manifest',
      'check.browser-integration',
      'workflow.dco',
      'workflow.manifest-linux',
      'workflow.manifest-windows'
    ]
  };
}

export function validateIntegratedConcernWatchReceipt(receipt, { registry } = {}) {
  const source = registryOrThrow(registry);
  const errors = [];
  try {
    assertContentAddressed(receipt, 'receiptRef', 'receipt.concern-watch.integrated', 'integrated ConcernWatch receipt');
    if (receipt.schemaVersion !== source.integratedJourney.schemaVersion || receipt.contractRef !== source.integratedJourney.contractRef ||
        receipt.state !== 'PASS' || receipt.currentness !== 'CURRENT') errors.push('integrated receipt state or contract mismatch');
    if (semanticHash(receipt.journeyStates) !== semanticHash(source.integratedJourney.requiredJourneyStates)) errors.push('integrated journey is incomplete or non-causal');
    if (receipt.externalEffectsExecuted !== false || receipt.modelTurnsExecuted !== 0 || receipt.liveClockUsed !== false ||
        receipt.dormantPhysicalWorkers !== 0 || receipt.dormantEffectAuthorities !== 0 || receipt.generatedFromOneCausalLineage !== true) {
      errors.push('integrated receipt violates no-effect, dormant, clock, or causal boundaries');
    }
    if (semanticHash(receipt.proofRefs) !== semanticHash(source.integratedJourney.proofRefs)) {
      errors.push('integrated receipt proof coverage is stale or substituted');
    }
    if (receipt.resolvedConcernAggregateRef !== receipt.recurrencePriorConcernAggregateRef ||
        !receipt.workgraphRef || !receipt.workNodeRef || !receipt.schedulerAdmissionRef || !receipt.recoveryConcernEvidenceRef) {
      errors.push('integrated receipt has detached scheduler, recovery, closure, or recurrence lineage');
    }
    const evidence = requireObject(receipt.causalEvidence, 'integrated causal evidence');
    validateConcernSubject(evidence.concernSubject, { registry: source });
    validateConcernAggregate(evidence.resolvedAggregate, { registry: source });
    validateConcernAggregate(evidence.recurrenceAggregate, { registry: source });
    const closure = evidence.resolvedAggregate.closures.at(-1);
    const priorLineage = evidence.recurrenceAggregate.root.priorLineage;
    if (evidence.resolvedAggregate.root.concernSubject.concernSubjectRef !== evidence.concernSubject.concernSubjectRef ||
        evidence.recurrenceAggregate.root.concernSubject.concernSubjectRef !== evidence.concernSubject.concernSubjectRef ||
        !closure || !priorLineage || priorLineage.priorConcernAggregateRef !== evidence.resolvedAggregate.aggregateRef ||
        priorLineage.priorConcernAggregateFingerprint !== evidence.resolvedAggregate.semanticFingerprint ||
        priorLineage.priorClosureRef !== closure.closureRef || priorLineage.priorClosureFingerprint !== closure.semanticFingerprint) {
      errors.push('integrated receipt causal aggregates do not share exact subject, closure, and recurrence lineage');
    }
    const schedulerEventIndex = evidence.resolvedAggregate.events.findIndex((event) => event.type === 'SCHEDULER_ADMITTED');
    if (schedulerEventIndex < 0) {
      errors.push('integrated receipt omits the external scheduler-admission event');
    } else {
      const preSchedulerAggregate = replay(
        evidence.resolvedAggregate.root,
        evidence.resolvedAggregate.events.slice(0, schedulerEventIndex),
        source
      );
      validateSchedulerAdmissionReceipt(evidence.schedulerAdmission, preSchedulerAggregate, source);
    }
    for (const [label, supplied, recorded] of [
      ['threshold receipt', evidence.thresholdReceipt, evidence.resolvedAggregate.thresholdReceipts.at(-1)],
      ['admission review', evidence.admissionReview, evidence.resolvedAggregate.admissionReviews.at(-1)],
      ['scheduler admission', evidence.schedulerAdmission, evidence.resolvedAggregate.schedulerAdmissions.at(-1)],
      ['recovery evidence', evidence.recoveryEvidence, evidence.resolvedAggregate.recoveryEvidence.at(-1)]
    ]) {
      if (!supplied || !recorded || semanticHash(supplied) !== semanticHash(recorded)) {
        errors.push(`integrated ${label} is not owned by the resolved aggregate replay`);
      }
    }
    const expectedProjection = projectConcernAggregate(evidence.resolvedAggregate, { registry: source });
    if (semanticHash(expectedProjection) !== semanticHash(evidence.resolvedProjection)) {
      errors.push('integrated projection is not derived from the resolved aggregate replay');
    }
    const expected = contentAddressed(integratedReceiptCore({
      journeyStates: receipt.journeyStates,
      subject: evidence.concernSubject,
      resolved: evidence.resolvedAggregate,
      recurrence: evidence.recurrenceAggregate,
      threshold: evidence.thresholdReceipt,
      review: evidence.admissionReview,
      admission: evidence.schedulerAdmission,
      recovery: evidence.recoveryEvidence,
      projection: evidence.resolvedProjection
    }, source), 'receiptRef', 'receipt.concern-watch.integrated');
    if (semanticHash(expected) !== semanticHash(receipt)) {
      errors.push('integrated receipt is not derived from its exact replayed causal evidence');
    }
  } catch (error) {
    errors.push(error.message);
  }
  return { ok: errors.length === 0, state: errors.length ? 'INVALID' : 'EXECUTED_CURRENT', errors };
}

export function createConcernWatchEvidenceConsumptionReceipt(integratedReceipt, consumerRef, { observedAt }, { registry } = {}) {
  const source = registryOrThrow(registry);
  const validation = validateIntegratedConcernWatchReceipt(integratedReceipt, { registry: source });
  if (!validation.ok) throw new Error(`cannot consume invalid integrated ConcernWatch receipt: ${validation.errors.join('; ')}`);
  assertKnown(consumerRef, source.evidenceConsumption.consumerRefs, 'ConcernWatch evidence consumer');
  return contentAddressed({
    schemaVersion: source.evidenceConsumption.schemaVersion,
    contractRef: source.evidenceConsumption.contractRef,
    consumerRef,
    integratedReceiptRef: integratedReceipt.receiptRef,
    integratedReceiptFingerprint: integratedReceipt.semanticFingerprint,
    integratedReceiptState: integratedReceipt.state,
    integratedReceiptCurrentness: integratedReceipt.currentness,
    observedAt: canonicalTimestamp(observedAt, 'evidence consumption observedAt'),
    admitted: true
  }, 'consumptionReceiptRef', `concern-watch-consumption.${consumerRef.toLowerCase().replaceAll('_', '-')}`);
}

function schedulerBindingRefs(nodes, intentRegistry) {
  return Object.fromEntries(intentRegistry.bindingFields.map((field) => [
    field,
    [...new Set(nodes.flatMap((item) => Array.isArray(item[field]) ? item[field] : [item[field]]).filter(Boolean))].sort()
  ]));
}

function deterministicSchedulerProposal({ schedulerContext, suffix, formedAt, transitionTimes, claimRef }) {
  const context = requireObject(schedulerContext, 'ConcernWatch deterministic scheduler context');
  const intentRegistry = requireObject(context.intentRegistry, 'ConcernWatch deterministic Intent registry');
  const intentRef = `intent.concern-watch.${suffix}`;
  const workNodeRef = `work-node.concern-watch.${suffix}`;
  const intent = createIntentEnvelope({
    intentRef,
    originMessageRef: `message.${intentRef}`,
    originSpeakerRef: 'person.victor',
    recipientRoleRef: 'role.vex.developer',
    projectRef: 'project.vexlife',
    threadRef: `thread.concern-watch.${suffix}`,
    channelRef: `channel.concern-watch.${suffix}`,
    originalContentHash: semanticHash({ suffix, source: 'ConcernWatch deterministic scheduler proposal' }),
    desiredOutcome: { intentKey: 'CONCERN_WATCH_NO_EFFECT_REPAIR', summary: 'Exercise exact scheduler authority without effects' },
    constraints: ['NO_EXTERNAL_EFFECTS', 'NO_MODEL_TURN'],
    createdAt: formedAt,
    sourceLineageRef: `lineage.concern-watch.${suffix}`
  }, intentRegistry);
  const node = createWorkNode({
    workNodeRef,
    rootIntentRef: intentRef,
    purpose: 'Validate the exact bounded ConcernWatch proposal through the accepted scheduler route',
    processRef: 'process.vexlife.intent.validate-workgraph',
    state: 'READY',
    dependencyRefs: [],
    childRefs: [],
    roleRef: 'role.vex.developer',
    priorityClass: 'HIGH',
    applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs: [],
    applicableBurdenReleaseRefs: [],
    capabilityEnvelopeRef: `capability-envelope.${workNodeRef}`,
    effectEnvelopeRef: `effect-envelope.${workNodeRef}`,
    resourceEnvelopeRef: `resource-envelope.${workNodeRef}`,
    expectedTransitionRef: `expected-transition.${workNodeRef}`,
    completionGateRefs: [`completion-gate.${workNodeRef}`],
    returnRouteRef: 'return-route.concern-watch.operations',
    sourceRefs: ['source.concern-watch.scheduler-authority'],
    createdAt: formedAt
  }, intentRegistry);
  let priorState = 'CAPTURED';
  const transitions = ['DECOMPOSED', 'PLAN_VALIDATED', 'READY'].map((nextState, sequence) => {
    const transition = {
      transitionRef: `transition.concern-watch.${suffix}.${sequence}`,
      workNodeRef,
      sequence,
      priorState,
      nextState,
      reason: 'ConcernWatch deterministic scheduler-authority formation',
      actorRef: 'vex.concern-watch.simulated',
      actorRoleRef: 'role.vex.developer',
      processRef: 'process.vexlife.intent.verify-transition',
      sourceRefs: ['source.concern-watch.scheduler-authority'],
      createdAt: transitionTimes[sequence]
    };
    priorState = nextState;
    return transition;
  });
  const workgraph = createIntentWorkgraph({
    graphRef: `intent-workgraph.concern-watch.${suffix}`,
    intent,
    nodes: [node],
    transitions,
    receipts: [],
    bindingRefs: schedulerBindingRefs([node], intentRegistry),
    createdAt: formedAt
  }, intentRegistry);
  return { intent, node, workgraph, claimRef };
}

function deterministicSchedulerAuthorityEvidence({ schedulerContext, proposal, formedAt, observedAt, expiresAt, suffix }) {
  const context = requireObject(schedulerContext, 'ConcernWatch deterministic scheduler context');
  const { intentRegistry, schedulerRegistry } = context;
  const registeredProcessRefs = exactRefs(context.registeredProcessRefs, 'deterministic scheduler registeredProcessRefs', { required: true });
  const registeredRoleRefs = exactRefs(context.registeredRoleRefs, 'deterministic scheduler registeredRoleRefs', { required: true });
  const sourceRef = 'source.intent-scheduler.test-runtime';
  const sourceHash = semanticHash({ source: 'ConcernWatch deterministic scheduler runtime/v1' });
  const schedulerGeneration = 1;
  const workerRef = 'worker.model.test.primary';
  const trustSnapshot = createIntentTrustSnapshot({
    schemaVersion: 'vexlife.intent-trust-snapshot/v0',
    snapshotRef: `trust-snapshot.concern-watch.${suffix}`,
    sourceRef: 'src/core/concern-watch.mjs#deterministic-scheduler-authority',
    formationRef: 'formation.concern-watch.scheduler-trust.v1',
    formedAt,
    currentness: 'CURRENT',
    bindingRefs: schedulerBindingRefs(proposal.workgraph.nodes, intentRegistry),
    actorRefs: ['person.victor', 'vex.concern-watch.simulated'],
    decisionRefs: [],
    authorizationBindings: []
  }, intentRegistry);
  const resourceSnapshot = createResourceSnapshot({
    snapshotRef: `resource-snapshot.concern-watch.${suffix}`,
    generation: schedulerGeneration,
    sourceRef,
    sourceHash,
    formationRef: 'formation.concern-watch.scheduler-resource.v1',
    evidenceClass: 'SIMULATED_CURRENT',
    cpuLoadPct: 20,
    cpuConcurrencyLimit: 4,
    cpuActiveCount: 0,
    ramAvailableMb: 16384,
    ramReservedMb: 1024,
    gpuAvailable: false,
    vramAvailableMb: 0,
    vramReservedMb: 0,
    modelResident: false,
    activeModelTurn: false,
    activeHeavyTool: false,
    interactiveWaitState: 'IDLE',
    backgroundWorkAdmission: 'ADMITTED',
    thermalPowerState: 'NOT_EXPOSED',
    currentness: 'CURRENT',
    formedAt,
    observedAt,
    expiresAt
  });
  const runtimeTrustSnapshot = createSchedulerRuntimeTrustSnapshot({
    snapshotRef: `runtime-snapshot.concern-watch.${suffix}`,
    sourceRef,
    sourceHash,
    formationRef: 'formation.concern-watch.scheduler-runtime.v1',
    evidenceClass: 'SIMULATED_CURRENT',
    schedulerGeneration,
    formedAt,
    observedAt,
    expiresAt,
    workerRef,
    actorRef: 'vex.concern-watch.simulated',
    roleRef: proposal.node.roleRef,
    claimRef: proposal.claimRef,
    occupancyRef: `occupancy.concern-watch.scheduler.${suffix}`,
    leaseAuthorityRef: 'authority.intent-scheduler.test-runtime',
    resourceSnapshotRef: resourceSnapshot.snapshotRef,
    resourceSnapshotFingerprint: resourceSnapshot.semanticFingerprint,
    currentness: 'CURRENT'
  }, { schedulerRegistry, resourceSnapshot });
  const common = {
    runtimeSnapshotRef: runtimeTrustSnapshot.snapshotRef,
    runtimeSnapshotFingerprint: runtimeTrustSnapshot.semanticFingerprint,
    schedulerGeneration,
    authorityRef: runtimeTrustSnapshot.leaseAuthorityRef,
    sourceRef,
    sourceHash,
    formedAt,
    observedAt,
    expiresAt,
    currentness: 'CURRENT',
    lifecycle: 'ACTIVE'
  };
  const workNodeRef = proposal.node.workNodeRef;
  const schedulerOptions = {
    trustSnapshot,
    runtimeTrustSnapshot,
    resourceSnapshot,
    resourceRequestByNodeRef: {
      [workNodeRef]: { cpuSlots: 1, ramMb: 64, vramMb: 0, modelTurn: false, heavyTool: false, background: false }
    },
    occupancyByNodeRef: {
      [workNodeRef]: {
        occupancyRef: runtimeTrustSnapshot.occupancyRef,
        actorRef: runtimeTrustSnapshot.actorRef,
        roleRef: proposal.node.roleRef,
        workNodeRef,
        graphFingerprint: proposal.workgraph.semanticFingerprint,
        claimRef: proposal.claimRef,
        formationRef: `formation.concern-watch.scheduler-occupancy.${suffix}`,
        ...common
      }
    },
    capabilityLeaseByNodeRef: {
      [workNodeRef]: {
        leaseRef: `capability-lease.concern-watch.${suffix}`,
        workNodeRef,
        graphFingerprint: proposal.workgraph.semanticFingerprint,
        trustSnapshotFingerprint: trustSnapshot.semanticFingerprint,
        envelopeRef: proposal.node.capabilityEnvelopeRef,
        formationRef: `formation.concern-watch.scheduler-capability.${suffix}`,
        toolRefs: [],
        ...common
      }
    },
    effectLeaseByNodeRef: {
      [workNodeRef]: {
        leaseRef: `effect-lease.concern-watch.${suffix}`,
        workNodeRef,
        graphFingerprint: proposal.workgraph.semanticFingerprint,
        trustSnapshotFingerprint: trustSnapshot.semanticFingerprint,
        envelopeRef: proposal.node.effectEnvelopeRef,
        formationRef: `formation.concern-watch.scheduler-effect.${suffix}`,
        effectDisposition: 'NO_EFFECTS',
        allowedEffectRefs: [],
        ...common
      }
    },
    resourceLeaseRefByNodeRef: { [workNodeRef]: `resource-lease.concern-watch.${suffix}` },
    recoveryResourceBindingByNodeRef: {},
    workerRef,
    schedulerGeneration,
    fairnessMaxDeferrals: schedulerRegistry.fairnessPolicy.maxDeferrals,
    fairnessLedger: {},
    formedAt,
    expiresAt,
    observedAt
  };
  const schedulerQueue = admitIntentSchedulerQueue(proposal.workgraph, {
    ...schedulerOptions,
    intentRegistry,
    schedulerRegistry,
    registeredProcessRefs,
    registeredRoleRefs
  });
  return {
    intentRegistry,
    schedulerRegistry,
    registeredProcessRefs,
    registeredRoleRefs,
    workgraph: proposal.workgraph,
    schedulerOptions,
    schedulerQueue
  };
}

function simulationObservation(registry, index, input, subject = null, recurrenceBinding = null) {
  const sourceBinding = {
    sourceRef: `source.concern-watch.simulation.${index}`,
    sourceFingerprint: semanticHash({ source: 'concern-watch-simulation', index, meaning: input.meaning ?? 'writer claim integrity' }),
    sourceRangeOrEventRef: `source-event.concern-watch.simulation.${index}`
  };
  const binding = subject ? {
    concernSubjectRef: subject.concernSubjectRef,
    concernSubjectFingerprint: subject.semanticFingerprint,
    subjectAnchorFingerprint: subject.subjectAnchorFingerprint
  } : null;
  if (binding) binding.sourceAdmissionFingerprint = sourceAdmissionFingerprint(binding, sourceBinding);
  return createConcernObservation({
    ...sourceBinding,
    observedAt: input.observedAt,
    observerRef: input.observerRef,
    aboutScopeRef: 'project.vexlife',
    concernClass: input.concernClass ?? 'SCOPE_OR_AUTHORITY',
    signalClass: input.signalClass,
    certaintyClass: input.certaintyClass,
    impactClass: input.impactClass,
    reversibilityClass: input.reversibilityClass ?? 'PARTIALLY_REVERSIBLE',
    humanAttentionClass: input.humanAttentionClass ?? 'ONLY_IF_THRESHOLD_MET',
    evidenceOriginClass: input.evidenceOriginClass,
    evidenceRefs: [input.evidenceRef],
    unknownRefs: input.unknownRefs ?? [],
    policySignals: input.policySignals ?? { costOfWaiting: 'MEDIUM' },
    subjectBinding: binding,
    recurrenceBinding
  }, { registry });
}

export function runDeterministicConcernWatchJourney({ registry, schedulerContext } = {}) {
  const source = registryOrThrow(registry);
  const t = (seconds) => new Date(Date.parse('2026-08-02T00:00:00.000Z') + seconds * 1000).toISOString();
  const journeyStates = [];
  const first = simulationObservation(source, 1, {
    observedAt: t(1), observerRef: 'actor.model.simulated', signalClass: 'MODEL_INFERENCE',
    certaintyClass: 'LOW_CONFIDENCE', impactClass: 'MEDIUM', evidenceOriginClass: 'MODEL_INFERENCE',
    evidenceRef: 'evidence.concern-watch.simulation.model.1'
  });
  const subject = deriveConcernSubject({ observations: [first], subjectKind: 'SCOPE_RISK' }, { registry: source });
  let aggregate = createConcernAggregate({ subject, formedAt: t(0) }, { registry: source });
  aggregate = recordConcernObservation(aggregate, first, { registry: source }).aggregate;
  let threshold = evaluateConcernThreshold(aggregate, { observedAt: t(2) }, { registry: source });
  aggregate = recordThresholdEvaluation(aggregate, threshold, { registry: source }).aggregate;
  journeyStates.push('LOW_CONFIDENCE_OBSERVATION_DORMANT');
  const beforeDuplicate = aggregate.semanticFingerprint;
  const duplicate = recordConcernObservation(aggregate, first, { registry: source });
  if (duplicate.changed || duplicate.aggregate.semanticFingerprint !== beforeDuplicate) throw new Error('duplicate observation was not a semantic no-op');
  journeyStates.push('REPEAT_WITHOUT_NEW_EVIDENCE_NO_OP');
  const second = simulationObservation(source, 2, {
    observedAt: t(3), observerRef: 'check.concern-watch.simulated.1', signalClass: 'FAILED_CHECK',
    certaintyClass: 'SUPPORTED', impactClass: 'HIGH', evidenceOriginClass: 'INDEPENDENT_CHECK',
    evidenceRef: 'evidence.concern-watch.simulation.check.1'
  }, subject);
  aggregate = recordConcernObservation(aggregate, second, { registry: source }).aggregate;
  journeyStates.push('INDEPENDENT_EVIDENCE_ACCUMULATED_ONCE');
  threshold = evaluateConcernThreshold(aggregate, { observedAt: t(4) }, { registry: source });
  aggregate = recordThresholdEvaluation(aggregate, threshold, { registry: source }).aggregate;
  if (threshold.thresholdCrossed) throw new Error('threshold crossed before exact rule');
  journeyStates.push('BELOW_THRESHOLD_REMAINS_INACTIVE');
  for (const [index, origin] of [[3, 'EXTERNAL_SOURCE'], [4, 'HUMAN_SOURCE']]) {
    const observation = simulationObservation(source, index, {
      observedAt: t(index * 2 - 1), observerRef: `observer.concern-watch.simulated.${index}`,
      signalClass: index === 3 ? 'EXTERNAL_NOTICE' : 'HUMAN_STATEMENT', certaintyClass: 'SUPPORTED',
      impactClass: 'HIGH', evidenceOriginClass: origin, evidenceRef: `evidence.concern-watch.simulation.independent.${index}`
    }, subject);
    aggregate = recordConcernObservation(aggregate, observation, { registry: source }).aggregate;
  }
  threshold = evaluateConcernThreshold(aggregate, { observedAt: t(8) }, { registry: source });
  aggregate = recordThresholdEvaluation(aggregate, threshold, { registry: source }).aggregate;
  if (!threshold.thresholdCrossed || aggregate.state !== 'THRESHOLD_MET') throw new Error('exact source-managed threshold did not cross');
  journeyStates.push('EXACT_POLICY_THRESHOLD_CROSSED');
  const claimRef = 'claim.vexlife.concernwatch.f36d83b2-d821-484c-8d40-ae74f8c9d745';
  const proposal = deterministicSchedulerProposal({
    schedulerContext,
    suffix: 'simulation.1',
    formedAt: t(8),
    transitionTimes: [t(8), t(9), t(10)],
    claimRef
  });
  const review = formConcernAdmissionReview(aggregate, {
    proposedWorkRef: proposal.node.workNodeRef,
    intentEnvelopeRef: proposal.intent.intentRef,
    intentEnvelopeFingerprint: proposal.intent.semanticFingerprint,
    workgraphRef: proposal.workgraph.graphRef,
    workgraphFingerprint: proposal.workgraph.semanticFingerprint,
    workNodeRef: proposal.node.workNodeRef,
    workNodeFingerprint: proposal.node.semanticFingerprint,
    dependencyRefs: proposal.node.dependencyRefs,
    pathClaimRefs: [claimRef],
    capabilityRefs: [proposal.node.capabilityEnvelopeRef],
    effectRefs: [proposal.node.effectEnvelopeRef],
    returnRouteRef: proposal.node.returnRouteRef,
    formedAt: t(11)
  }, { registry: source });
  aggregate = recordConcernAdmissionReview(aggregate, review, { registry: source }).aggregate;
  journeyStates.push('ADMISSION_REVIEW_FORMED');
  const schedulerInput = { schedulerAuthorityEvidence: deterministicSchedulerAuthorityEvidence({
    schedulerContext,
    proposal,
    formedAt: t(12),
    observedAt: t(13),
    expiresAt: t(60),
    suffix: 'simulation.1'
  }) };
  const admission = createConcernSchedulerAdmissionReceipt(aggregate, review, schedulerInput, { registry: source });
  aggregate = recordConcernSchedulerAdmission(aggregate, admission, { registry: source }).aggregate;
  journeyStates.push('ONE_WORKGRAPH_ROUTE_SCHEDULER_ADMITTED');
  const beforeOverlap = aggregate.semanticFingerprint;
  let overlapRejected = false;
  try {
    createConcernSchedulerAdmissionReceipt(aggregate, review, {
      ...schedulerInput,
      conflictingWriterRefs: ['writer.conflict.simulated']
    }, { registry: source });
  } catch {
    overlapRejected = true;
    if (aggregate.semanticFingerprint !== beforeOverlap) throw new Error('overlap rejection mutated aggregate');
  }
  if (!overlapRejected) throw new Error('overlapping writer admission was not rejected');
  journeyStates.push('OVERLAPPING_WRITER_REJECTED_UNCHANGED');
  const recovery = createRecoveryConcernEvidence(aggregate, {
    recoveryAggregateRef: 'aggregate.runtime-recovery.concern-watch.simulation.1',
    recoveryAggregateFingerprint: semanticHash({ recovery: 'concern-watch-simulation', current: true }),
    failureRef: 'failure.concern-watch.simulation.1', failureFingerprint: semanticHash({ failure: 'simulated-recoverable' }),
    recoveryDisposition: 'RETRY_WITH_CURRENT_EVIDENCE',
    schedulerCurrentnessReceiptRef: admission.schedulerCurrentnessReceiptRef,
    schedulerCurrentnessReceiptFingerprint: admission.schedulerCurrentnessReceiptFingerprint,
    schedulerCurrentness: 'CURRENT', currentness: 'CURRENT',
    evidenceRefs: ['evidence.concern-watch.recovery.simulation.1'], observedAt: t(14)
  }, { registry: source });
  aggregate = recordRecoveryConcernEvidence(aggregate, recovery, { registry: source }).aggregate;
  journeyStates.push('RECOVERY_FAILURE_RECORDED_AS_CURRENT_EVIDENCE');
  const completion = {
    completionReceiptRef: 'receipt.scheduler-completion.concern-watch.simulation.1',
    completionReceiptFingerprint: semanticHash({ completion: 'concern-watch-simulation', state: 'COMPLETED' }),
    schedulerAggregateFingerprint: semanticHash({ scheduler: 'concern-watch-simulation', generation: 1, completed: true }),
    workNodeRef: admission.workNodeRef, workNodeFingerprint: admission.workNodeFingerprint,
    state: 'COMPLETED', currentness: 'CURRENT', observedAt: t(15)
  };
  const closure = createConcernClosureReceipt(aggregate, {
    disposition: 'RESOLVED_WATCH_FOR_RECURRENCE', evidenceRefs: [recovery.recoveryConcernEvidenceRef],
    schedulerCompletion: completion, closedByRef: 'scheduler.concern-watch.simulated', closedAt: t(16)
  }, { registry: source });
  const resolved = closeConcern(aggregate, closure, { registry: source }).aggregate;
  const projection = projectConcernAggregate(resolved, { registry: source });
  if (projection.views.QUEUE || projection.views.TERRAIN || projection.views.GUIDE) throw new Error('resolved concern remained active in projections');
  journeyStates.push('WORK_COMPLETION_RESOLVED_ACTIVE_CONCERN');
  const priorLineage = {
    priorConcernAggregateRef: resolved.aggregateRef,
    priorConcernAggregateFingerprint: resolved.semanticFingerprint,
    priorClosureRef: closure.closureRef,
    priorClosureFingerprint: closure.semanticFingerprint
  };
  const recurrenceObservation = simulationObservation(source, 5, {
    observedAt: t(18), observerRef: 'check.concern-watch.simulated.recurrence', signalClass: 'FAILED_CHECK',
    certaintyClass: 'SUPPORTED', impactClass: 'HIGH', evidenceOriginClass: 'INDEPENDENT_CHECK',
    evidenceRef: 'evidence.concern-watch.simulation.recurrence.1'
  }, subject, priorLineage);
  const recurrence = reopenConcernFromRecurrence(resolved, recurrenceObservation, { formedAt: t(17) }, { registry: source });
  journeyStates.push('RECURRENCE_REOPENED_WITH_EXACT_PRIOR_LINEAGE');
  const receipt = contentAddressed(integratedReceiptCore({ journeyStates, subject, resolved, recurrence, threshold, review, admission, recovery, projection }, source), 'receiptRef', 'receipt.concern-watch.integrated');
  const validation = validateIntegratedConcernWatchReceipt(receipt, { registry: source });
  if (!validation.ok) throw new Error(validation.errors.join('; '));
  const prReadyReceipt = createConcernWatchEvidenceConsumptionReceipt(receipt, 'PR_READY', { observedAt: t(19) }, { registry: source });
  const healthReceipt = createConcernWatchEvidenceConsumptionReceipt(receipt, 'HEALTH', { observedAt: t(20) }, { registry: source });
  return deepFreeze({ receipt, prReadyReceipt, healthReceipt, resolvedAggregate: resolved, recurrenceAggregate: recurrence });
}

export function validateConcernWatchRegistry(registry) {
  const errors = [];
  if (!registry || typeof registry !== 'object') return { ok: false, errors: ['ConcernWatch registry is missing'] };
  for (const field of ['registryRef', 'systemRef', 'canonicalSourceRef', 'purpose']) if (!registry[field]) errors.push(`registry missing ${field}`);
  if (registry.schemaVersion !== 'vexlife.concern-watch-registry/v1' ||
      registry.canonicalSource?.sourceRef !== registry.canonicalSourceRef ||
      registry.canonicalSource?.path !== 'blueprint/concern-watch-registry.json' ||
      registry.canonicalSource?.field !== 'concernWatch' ||
      registry.canonicalSource?.compositionRef !== 'blueprint.vexlife.universal.001') {
    errors.push('registry canonical source identity is malformed');
  }
  const contracts = registry.contractIdentities ?? [];
  const contractRefs = contracts.map((item) => item.contractRef);
  if (contracts.length !== 13 || new Set(contractRefs).size !== contracts.length || contracts.some((item) => !item.contractKind)) {
    errors.push('registry contract identities are incomplete or duplicated');
  }
  if (semanticHash(registry.observationContract?.requiredFields) !== semanticHash(CONCERN_OBSERVATION_REQUIRED_FIELDS)) errors.push('observation required fields drifted from implementation');
  if (semanticHash(registry.vocabularies?.lifecycleStates) !== semanticHash(CONCERN_LIFECYCLE_STATES)) errors.push('lifecycle vocabulary drifted from implementation');
  if (semanticHash(registry.vocabularies?.outcomes) !== semanticHash(CONCERN_OUTCOMES)) errors.push('outcome vocabulary drifted from implementation');
  if (semanticHash(registry.lifecycleContract?.eventTypes) !== semanticHash(CONCERN_EVENT_TYPES)) errors.push('event vocabulary drifted from implementation');
  for (const contractRef of [
    registry.observationContract?.contractRef, registry.subjectContract?.contractRef,
    registry.lifecycleContract?.contractRef, registry.thresholdPolicy?.contractRef,
    registry.schedulerIntegration?.admissionContractRef, registry.humanAttentionContract?.contractRef,
    registry.schedulerIntegration?.externalSchedulerAuthority?.evidenceContractRef,
    registry.closureContract?.contractRef, registry.projectionContract?.contractRef,
    registry.integratedJourney?.contractRef, registry.evidenceConsumption?.contractRef
  ]) if (!contractRefs.includes(contractRef)) errors.push(`nested contract is not registered: ${contractRef}`);
  if (registry.thresholdPolicy?.callerOverrideAllowed !== false ||
      registry.thresholdPolicy?.thresholdCrossingGrantsExecutionAuthority !== false ||
      registry.thresholdPolicy?.modelRepetitionRule?.modelOnlyRecurrenceRaisesUrgency !== false ||
      registry.thresholdPolicy?.modelRepetitionRule?.modelPolicyContextRaisesPriority !== false) {
    errors.push('threshold policy permits caller authority or model anxiety amplification');
  }
  const identityPolicy = registry.thresholdPolicy?.evidenceIdentityPolicy;
  if (identityPolicy?.sourceManaged !== true || identityPolicy?.callerOverrideAllowed !== false ||
      identityPolicy?.evidenceRefsAffectIndependenceIdentity !== false || identityPolicy?.evidenceRefsAffectRecurrenceIdentity !== false ||
      semanticHash(identityPolicy?.independenceIdentityIncludes) !== semanticHash(['sourceRef', 'observerRef', 'evidenceOriginClass']) ||
      semanticHash(identityPolicy?.recurrenceIdentityIncludes) !== semanticHash(['sourceRef', 'sourceRangeOrEventRef', 'sourceFingerprint', 'observerRef', 'evidenceOriginClass'])) {
    errors.push('threshold evidence identity policy is not exact source-managed current truth');
  }
  const observationAdmission = registry.subjectContract?.observationAdmission;
  if (observationAdmission?.initialFirstObservationRequiresExactSubjectSourceBinding !== true ||
      observationAdmission?.subsequentObservationRequiresExactSubjectBinding !== true ||
      observationAdmission?.subjectBindingIncludesExactSourceAdmissionFingerprint !== true ||
      observationAdmission?.recurrenceFirstObservationRequiresExactSubjectAndPriorClosureLineage !== true ||
      observationAdmission?.replayRevalidatesAdmission !== true) {
    errors.push('subject observation admission is incomplete');
  }
  if (registry.closureContract?.recordAndReplayRequireExactSchemaAndContract !== true ||
      registry.closureContract?.recordAndReplayRequireKnownDisposition !== true ||
      registry.closureContract?.historyRetainedMustBeTrue !== true ||
      registry.closureContract?.projectionRemovalDerivedFromDisposition !== true ||
      registry.closureContract?.queuePriorityRemovedMustBeTrue !== true) {
    errors.push('closure record and replay invariants are incomplete');
  }
  if (registry.schedulerIntegration?.dormantWatchConsumesPhysicalWorker !== false ||
      registry.schedulerIntegration?.dormantWatchConsumesEffectAuthority !== false ||
      registry.schedulerIntegration?.activeInteractiveWorkMayBePreempted !== false ||
      registry.schedulerIntegration?.externalEffectsAuthorized !== false) {
    errors.push('scheduler integration violates dormant, interactive, or no-effect boundaries');
  }
  const externalSchedulerAuthority = registry.schedulerIntegration?.externalSchedulerAuthority;
  if (externalSchedulerAuthority?.evidenceSchemaVersion !== 'vexlife.concern-scheduler-authority-evidence/v1' ||
      externalSchedulerAuthority?.evidenceContractRef !== 'contract.vexlife.concern-scheduler-authority-evidence/v1' ||
      externalSchedulerAuthority?.validationRouteRef !== 'src/core/intent-scheduler.mjs#admitIntentSchedulerQueue' ||
      externalSchedulerAuthority?.queueSchemaVersion !== 'vexlife.intent-scheduler-queue/v1' ||
      externalSchedulerAuthority?.admissionSchemaVersion !== 'vexlife.intent-scheduler-admission-receipt/v1' ||
      externalSchedulerAuthority?.admissionContractRef !== 'contract.intent-scheduler.admission-fields' ||
      ![externalSchedulerAuthority?.intentRegistryFingerprint,
        externalSchedulerAuthority?.schedulerRegistryFingerprint,
        externalSchedulerAuthority?.registeredProcessRefsFingerprint,
        externalSchedulerAuthority?.registeredRoleRefsFingerprint].every((value) => /^[a-f0-9]{64}$/.test(value ?? '')) ||
      externalSchedulerAuthority?.recordRevalidatesExternalSchedulerRoute !== true ||
      externalSchedulerAuthority?.replayRevalidatesExternalSchedulerRoute !== true ||
      externalSchedulerAuthority?.integratedConsumerRevalidatesExternalSchedulerRoute !== true ||
      !Array.isArray(externalSchedulerAuthority?.nodeIndexedSchedulerOptionFields) ||
      new Set(externalSchedulerAuthority.nodeIndexedSchedulerOptionFields).size !== externalSchedulerAuthority.nodeIndexedSchedulerOptionFields.length ||
      semanticHash([...externalSchedulerAuthority.nodeIndexedSchedulerOptionFields].sort()) !== semanticHash([...NODE_INDEXED_SCHEDULER_OPTION_FIELDS].sort()) ||
      externalSchedulerAuthority?.nodeIndexedSchedulerOptionDomain !== 'EXACT_WORKGRAPH_NODE_REFS' ||
      externalSchedulerAuthority?.writerConflictScope !== 'COMPLETE_SCHEDULER_OCCUPANCY_CLAIM_SCOPE' ||
      externalSchedulerAuthority?.unexpectedWorkNodeKeyDisposition !== 'REJECT_UNCHANGED' ||
      externalSchedulerAuthority?.callerAuthoredCurrentnessAllowed !== false ||
      externalSchedulerAuthority?.liveClockRequired !== false) {
    errors.push('external scheduler authority contract is incomplete or permits self-attestation');
  }
  if (registry.projectionContract?.changedOnly !== true || registry.projectionContract?.derivedFromOneReplayedAggregate !== true ||
      registry.projectionContract?.normalProjectionContainsRawObservationHistory !== false ||
      registry.integratedJourney?.externalEffectsExecuted !== false || registry.integratedJourney?.modelTurnsExecuted !== 0 ||
      registry.integratedJourney?.liveClockUsed !== false) {
    errors.push('projection or integrated journey boundaries are malformed');
  }
  if (semanticHash(registry.integratedJourney?.proofRefs) !== semanticHash(Array.from({ length: 19 }, (_, index) => `CW${index}`))) {
    errors.push('CW0-CW18 proof coverage is incomplete');
  }
  return { ok: errors.length === 0, errors, stats: { contracts: contracts.length, proofs: registry.integratedJourney?.proofRefs?.length ?? 0 } };
}

// [VXG RealForever]
