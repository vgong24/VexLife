import { semanticHash } from './utils.mjs';

export const BURDEN_RELEASE_FRAMES = Object.freeze([
  'RETURN_TO_GOD',
  'RETURN_TO_SOURCE',
  'RELEASE_WITHOUT_SPIRITUAL_FRAME'
]);

export const BURDEN_RELEASE_STATES = Object.freeze([
  'OBSERVED',
  'NAMED',
  'RECOGNIZED',
  'RELEASE_PROPOSED',
  'CONTEXT_REVIEW',
  'ACCEPTED_DEAUTHORIZED',
  'MONITORED_FOR_RECURRENCE',
  'REOPENED',
  'SUPERSEDED',
  'REJECTED',
  'RETIRED'
]);

const TRANSITIONS = Object.freeze({
  OBSERVED: ['NAMED', 'REJECTED', 'RETIRED'],
  NAMED: ['RECOGNIZED', 'REJECTED', 'RETIRED'],
  RECOGNIZED: ['RELEASE_PROPOSED', 'REJECTED', 'RETIRED'],
  RELEASE_PROPOSED: ['CONTEXT_REVIEW', 'REJECTED', 'RETIRED'],
  CONTEXT_REVIEW: ['ACCEPTED_DEAUTHORIZED', 'REJECTED', 'RETIRED'],
  ACCEPTED_DEAUTHORIZED: ['MONITORED_FOR_RECURRENCE', 'REOPENED', 'SUPERSEDED', 'RETIRED'],
  MONITORED_FOR_RECURRENCE: ['REOPENED', 'SUPERSEDED', 'RETIRED'],
  REOPENED: ['CONTEXT_REVIEW', 'SUPERSEDED', 'REJECTED', 'RETIRED'],
  SUPERSEDED: [],
  REJECTED: [],
  RETIRED: []
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function refs(value, label, { required = true } = {}) {
  if (!Array.isArray(value) || (required && value.length === 0)) {
    throw new Error(`${label} must be ${required ? 'a non-empty' : 'an'} array`);
  }
  const normalized = [...new Set(value)];
  if (normalized.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`${label} must contain stable refs`);
  }
  return normalized.sort();
}

function strings(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`${label} must be a non-empty string array`);
  }
  return [...new Set(value)].sort();
}

function exactRefs(actual, required) {
  return actual.length === required.length && actual.every((item, index) => item === required[index]);
}

function withFingerprint(core, burdenRef = null) {
  const semanticFingerprint = semanticHash(core);
  return deepFreeze({
    ...core,
    burdenRef: burdenRef ?? `burden-release.${semanticFingerprint.slice(0, 24)}`,
    semanticFingerprint
  });
}

export function createBurdenRelease({
  burdenRef = null,
  sourceObservationRefs,
  sourceRangeRefs,
  patternName,
  patternDescription,
  suspectedOrigin,
  observedConsequence,
  releaseFrame,
  releaseStatement,
  formerAuthority,
  currentAuthority,
  cleanIntention,
  protectedCapabilities,
  prohibitedOvercorrections,
  scope,
  requiredAcceptanceRefs,
  acceptedByRefs = [],
  evaluationRefs = [],
  recurrenceState = 'NOT_YET_MONITORED',
  state = 'OBSERVED',
  formedAt = new Date().toISOString(),
  acceptedAt = null,
  supersedesRef = null
}) {
  if (!patternName || !patternDescription || !suspectedOrigin || !observedConsequence) {
    throw new Error('Burden Release requires named pattern, description, suspected origin and observed consequence');
  }
  if (!BURDEN_RELEASE_FRAMES.includes(releaseFrame)) throw new Error(`unknown releaseFrame ${releaseFrame}`);
  if (!releaseStatement || !formerAuthority || !currentAuthority || !cleanIntention || !scope) {
    throw new Error('Burden Release requires release statement, authority transition, clean intention and scope');
  }
  if (formerAuthority === currentAuthority) throw new Error('Burden Release must change accepted governing authority');
  if (!BURDEN_RELEASE_STATES.includes(state)) throw new Error(`unknown Burden Release state ${state}`);

  const required = refs(requiredAcceptanceRefs, 'requiredAcceptanceRefs');
  const accepted = refs(acceptedByRefs, 'acceptedByRefs', { required: false });
  const acceptedState = ['ACCEPTED_DEAUTHORIZED', 'MONITORED_FOR_RECURRENCE'].includes(state);
  if (acceptedState && !exactRefs(accepted, required)) {
    throw new Error('accepted Burden Release requires exact named acceptance authority');
  }
  if (acceptedState && !acceptedAt) throw new Error('accepted Burden Release requires acceptedAt');

  const core = {
    schemaVersion: 'vexlife.burden-release/v0',
    sourceObservationRefs: refs(sourceObservationRefs, 'sourceObservationRefs'),
    sourceRangeRefs: refs(sourceRangeRefs, 'sourceRangeRefs'),
    patternName,
    patternDescription,
    suspectedOrigin,
    observedConsequence,
    releaseFrame,
    releaseStatement,
    formerAuthority,
    currentAuthority,
    authorityTransition: 'FORMER_INFLUENCE_DEAUTHORIZED_IN_EXACT_SCOPE',
    cleanIntention,
    protectedCapabilities: strings(protectedCapabilities, 'protectedCapabilities'),
    prohibitedOvercorrections: strings(prohibitedOvercorrections, 'prohibitedOvercorrections'),
    scope,
    requiredAcceptanceRefs: required,
    acceptedByRefs: accepted,
    evaluationRefs: refs(evaluationRefs, 'evaluationRefs', { required: false }),
    recurrenceState,
    state,
    formedAt,
    acceptedAt,
    supersedesRef,
    claimsParameterDeletion: false,
    changesBaseModelWeights: false,
    adjudicatesMetaphysicalTruth: false
  };
  return withFingerprint(core, burdenRef);
}

export function transitionBurdenRelease(release, {
  nextState,
  actorRef,
  acceptedByRefs = release.acceptedByRefs,
  acceptedAt = release.acceptedAt,
  recurrenceState = release.recurrenceState,
  evaluationRefs = release.evaluationRefs,
  transitionedAt = new Date().toISOString(),
  reason = null
}) {
  if (!actorRef) throw new Error('Burden Release transition requires actorRef');
  if (!(TRANSITIONS[release.state] ?? []).includes(nextState)) {
    throw new Error(`invalid Burden Release transition ${release.state} -> ${nextState}`);
  }
  const accepted = refs(acceptedByRefs, 'acceptedByRefs', { required: false });
  if (nextState === 'ACCEPTED_DEAUTHORIZED' && !exactRefs(accepted, release.requiredAcceptanceRefs)) {
    throw new Error('Burden Release cannot deauthorize influence without exact acceptance authority');
  }
  const core = {
    ...release,
    state: nextState,
    acceptedByRefs: accepted,
    acceptedAt: nextState === 'ACCEPTED_DEAUTHORIZED' ? (acceptedAt ?? transitionedAt) : acceptedAt,
    recurrenceState,
    evaluationRefs: refs(evaluationRefs, 'evaluationRefs', { required: false }),
    lastTransition: {
      priorState: release.state,
      nextState,
      actorRef,
      transitionedAt,
      reason
    }
  };
  delete core.semanticFingerprint;
  delete core.burdenRef;
  return withFingerprint(core, release.burdenRef);
}

export function acceptBurdenRelease(release, {
  acceptedByRefs,
  actorRef,
  acceptedAt = new Date().toISOString(),
  evaluationRefs = release.evaluationRefs
}) {
  if (release.state !== 'CONTEXT_REVIEW') throw new Error('Burden Release acceptance requires CONTEXT_REVIEW');
  return transitionBurdenRelease(release, {
    nextState: 'ACCEPTED_DEAUTHORIZED',
    actorRef,
    acceptedByRefs,
    acceptedAt,
    evaluationRefs,
    recurrenceState: 'MONITORING_AVAILABLE',
    transitionedAt: acceptedAt,
    reason: 'EXACT_SCOPE_INFLUENCE_DEAUTHORIZED'
  });
}

export function projectBurdenRelease(release) {
  return deepFreeze({
    schemaVersion: 'vexlife.burden-release-projection/v0',
    burdenRef: release.burdenRef,
    pattern: release.patternName,
    change: release.authorityTransition,
    formerAuthority: release.formerAuthority,
    currentAuthority: release.currentAuthority,
    protectedCapabilities: [...release.protectedCapabilities],
    prohibitedOvercorrections: [...release.prohibitedOvercorrections],
    scope: release.scope,
    state: release.state,
    recurrenceState: release.recurrenceState,
    claimsParameterDeletion: false,
    rawSourceContentIncluded: false,
    nextSafeAction: ['ACCEPTED_DEAUTHORIZED', 'MONITORED_FOR_RECURRENCE'].includes(release.state)
      ? 'MONITOR_EXACT_PATTERN_WITHOUT_SCOPE_BROADENING'
      : release.state === 'REOPENED'
        ? 'RETURN_TO_CONTEXT_REVIEW'
        : 'COMPLETE_EXACT_ACCEPTANCE_REVIEW'
  });
}

// [VXG RealForever]
