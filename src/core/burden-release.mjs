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

const BEHAVIOR_ORIGIN_CLASSES = new Set([
  'BASE_MODEL_PRIOR', 'SYSTEM_OR_PROVIDER_POLICY', 'ROLE_INSTRUCTION', 'MISSING_CONTEXT',
  'FAILED_RETRIEVAL', 'CONTEXT_COMPRESSION', 'RESOURCE_PRESSURE', 'TOOL_LIMITATION',
  'CONFLICTING_PREFERENCES', 'MODEL_CAPABILITY_LIMIT', 'LOCAL_RHYTHM', 'RELATIONSHIP_PATTERN',
  'INSTITUTIONAL_PROCESS', 'UNKNOWN'
]);
const CONTINUITY_SCOPE_CLASSES = new Set([
  'CURRENT_TURN', 'CHANNEL', 'THREAD', 'PROJECT', 'HUMAN_SELF', 'VEX_SELF', 'RELATIONSHIP',
  'DEVICE_LINEAGE', 'FAMILY_CANDIDATE', 'INSTITUTION', 'NO_SYNC', 'HELD_UNKNOWN'
]);
const SHA256 = /^[a-f0-9]{64}$/;

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

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error(`${label} must be canonical ISO-8601 UTC`);
  }
  return value;
}

function refs(value, label, { required = true } = {}) {
  if (!Array.isArray(value) || (required && value.length === 0)) {
    throw new Error(`${label} must be ${required ? 'a non-empty' : 'an'} array`);
  }
  if (value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`${label} must contain stable refs`);
  }
  return [...new Set(value)].sort();
}

function strings(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`${label} must be a non-empty string array`);
  }
  return [...new Set(value)].sort();
}

function sourceBindings(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('sourceBindings must be a non-empty array');
  const identities = new Set();
  return value.map((binding) => {
    if (!binding?.observationRef || !binding.sourceLineageRef || !binding.rangeRef || !SHA256.test(binding.sourceHash ?? '')) {
      throw new Error('sourceBindings require observationRef, sourceLineageRef, rangeRef and lowercase SHA-256 sourceHash');
    }
    const identity = `${binding.observationRef}\0${binding.sourceLineageRef}\0${binding.rangeRef}`;
    if (identities.has(identity)) throw new Error('sourceBindings contain a duplicate exact source tuple');
    identities.add(identity);
    return {
      observationRef: binding.observationRef,
      sourceLineageRef: binding.sourceLineageRef,
      rangeRef: binding.rangeRef,
      sourceHash: binding.sourceHash
    };
  }).sort((left, right) => `${left.observationRef}\0${left.sourceLineageRef}\0${left.rangeRef}`
    .localeCompare(`${right.observationRef}\0${right.sourceLineageRef}\0${right.rangeRef}`));
}

function exactRefs(actual, required) {
  return actual.length === required.length && actual.every((item, index) => item === required[index]);
}

function fingerprinted(core) {
  return deepFreeze({ ...core, semanticFingerprint: semanticHash(core) });
}

function sourceForm(input) {
  const formedAt = canonicalTimestamp(input.formedAt ?? new Date().toISOString(), 'Burden Release formedAt');
  if (!input.patternName || !input.patternDescription || !input.suspectedOrigin || !input.observedConsequence) {
    throw new Error('Burden Release requires named pattern, description, suspected origin and observed consequence');
  }
  if (!BEHAVIOR_ORIGIN_CLASSES.has(input.suspectedOrigin)) throw new Error(`unknown suspectedOrigin ${input.suspectedOrigin}`);
  if (!BURDEN_RELEASE_FRAMES.includes(input.releaseFrame)) throw new Error(`unknown releaseFrame ${input.releaseFrame}`);
  if (!input.releaseStatement || !input.formerAuthority || !input.currentAuthority || !input.cleanIntention || !input.scope) {
    throw new Error('Burden Release requires release statement, authority transition, clean intention and scope');
  }
  if (!CONTINUITY_SCOPE_CLASSES.has(input.scope)) throw new Error(`unknown Burden Release scope ${input.scope}`);
  if (input.formerAuthority === input.currentAuthority) throw new Error('Burden Release must change accepted governing authority');
  return deepFreeze({
    schemaVersion: 'vexlife.burden-release-source/v1',
    sourceObservationRefs: refs(input.sourceObservationRefs, 'sourceObservationRefs'),
    sourceBindings: sourceBindings(input.sourceBindings),
    patternName: input.patternName,
    patternDescription: input.patternDescription,
    suspectedOrigin: input.suspectedOrigin,
    observedConsequence: input.observedConsequence,
    releaseFrame: input.releaseFrame,
    releaseStatement: input.releaseStatement,
    formerAuthority: input.formerAuthority,
    currentAuthority: input.currentAuthority,
    cleanIntention: input.cleanIntention,
    protectedCapabilities: strings(input.protectedCapabilities, 'protectedCapabilities'),
    prohibitedOvercorrections: strings(input.prohibitedOvercorrections, 'prohibitedOvercorrections'),
    scope: input.scope,
    requiredAcceptanceRefs: refs(input.requiredAcceptanceRefs, 'requiredAcceptanceRefs'),
    formedAt,
    supersedesRef: input.supersedesRef ?? null
  });
}

function createFromSource(source, burdenRef = null) {
  const identityFingerprint = semanticHash(source);
  const expectedRef = `burden-release.${identityFingerprint.slice(0, 24)}`;
  if (burdenRef && burdenRef !== expectedRef) throw new Error('Burden Release ref does not match source-form identity');
  return fingerprinted({
    ...source,
    schemaVersion: 'vexlife.burden-release/v1',
    burdenRef: expectedRef,
    identityFingerprint,
    sourceForm: source,
    authorityTransition: 'FORMER_INFLUENCE_DEAUTHORIZED_IN_EXACT_SCOPE',
    acceptedByRefs: [],
    acceptanceEvidenceRefs: [],
    evaluationRefs: [],
    recurrenceState: 'NOT_YET_MONITORED',
    state: 'OBSERVED',
    acceptedAt: null,
    transitionReceipts: [],
    lastTransition: null,
    claimsParameterDeletion: false,
    changesBaseModelWeights: false,
    adjudicatesMetaphysicalTruth: false
  });
}

export function createBurdenRelease(input) {
  if (input.state && input.state !== 'OBSERVED') {
    throw new Error('Burden Release source formation is OBSERVED only');
  }
  if ((input.acceptedByRefs ?? []).length || input.acceptedAt || (input.transitionReceipts ?? []).length) {
    throw new Error('Burden Release source formation cannot inject acceptance or transition history');
  }
  return createFromSource(sourceForm(input), input.burdenRef ?? null);
}

function applyTransition(release, input, { replay = false } = {}) {
  const nextState = input.nextState;
  if (!input.actorRef) throw new Error('Burden Release transition requires actorRef');
  if (!(TRANSITIONS[release.state] ?? []).includes(nextState)) {
    throw new Error(`invalid Burden Release transition ${release.state} -> ${nextState}`);
  }
  const transitionedAt = canonicalTimestamp(input.transitionedAt ?? new Date().toISOString(), 'Burden Release transitionedAt');
  const priorAt = release.lastTransition?.transitionedAt ?? release.formedAt;
  if (Date.parse(transitionedAt) <= Date.parse(priorAt)) throw new Error('Burden Release transition chronology must be strictly monotonic');
  const acceptedByRefs = refs(input.acceptedByRefs ?? release.acceptedByRefs, 'acceptedByRefs', { required: false });
  const acceptanceEvidenceRefs = refs(input.acceptanceEvidenceRefs ?? release.acceptanceEvidenceRefs, 'acceptanceEvidenceRefs', { required: false });
  if (nextState === 'ACCEPTED_DEAUTHORIZED') {
    if (!exactRefs(acceptedByRefs, release.requiredAcceptanceRefs) || acceptanceEvidenceRefs.length !== acceptedByRefs.length) {
      throw new Error('Burden Release cannot deauthorize influence without exact acceptance evidence');
    }
  }
  const receiptCore = {
    schemaVersion: 'vexlife.burden-release-transition/v1',
    burdenRef: release.burdenRef,
    sequence: release.transitionReceipts.length,
    priorState: release.state,
    nextState,
    actorRef: input.actorRef,
    transitionedAt,
    reason: input.reason ?? null,
    priorReleaseFingerprint: release.semanticFingerprint,
    acceptedByRefs,
    acceptanceEvidenceRefs,
    evaluationRefs: refs(input.evaluationRefs ?? release.evaluationRefs, 'evaluationRefs', { required: false }),
    recurrenceState: input.recurrenceState ?? release.recurrenceState
  };
  const transitionRef = `burden-release-transition.${semanticHash(receiptCore).slice(0, 24)}`;
  if (input.transitionRef && input.transitionRef !== transitionRef) throw new Error('Burden Release transition ref mismatch');
  const receipt = fingerprinted({ ...receiptCore, transitionRef });
  if (replay && input.semanticFingerprint !== receipt.semanticFingerprint) {
    throw new Error('forged Burden Release transition receipt');
  }
  const core = structuredClone(release);
  delete core.semanticFingerprint;
  core.state = nextState;
  core.acceptedByRefs = acceptedByRefs;
  core.acceptanceEvidenceRefs = acceptanceEvidenceRefs;
  core.acceptedAt = nextState === 'ACCEPTED_DEAUTHORIZED'
    ? canonicalTimestamp(input.acceptedAt ?? transitionedAt, 'Burden Release acceptedAt')
    : release.acceptedAt;
  if (core.acceptedAt && Date.parse(core.acceptedAt) < Date.parse(transitionedAt)) {
    throw new Error('Burden Release acceptedAt cannot precede its acceptance transition');
  }
  core.evaluationRefs = receipt.evaluationRefs;
  core.recurrenceState = receipt.recurrenceState;
  core.transitionReceipts = [...release.transitionReceipts, receipt];
  core.lastTransition = receipt;
  return fingerprinted(core);
}

export function replayBurdenRelease(release) {
  if (!release?.sourceForm || semanticHash(release.sourceForm) !== release.identityFingerprint) {
    throw new Error('Burden Release source form or identity fingerprint mismatch');
  }
  let replayed = createFromSource(deepFreeze(structuredClone(release.sourceForm)), release.burdenRef);
  for (const receipt of release.transitionReceipts ?? []) replayed = applyTransition(replayed, receipt, { replay: true });
  if (replayed.semanticFingerprint !== release.semanticFingerprint) throw new Error('Burden Release replay does not match current snapshot');
  return replayed;
}

export function validateBurdenRelease(release) {
  replayBurdenRelease(release);
  return release;
}

export function transitionBurdenRelease(release, input) {
  validateBurdenRelease(release);
  return applyTransition(release, input);
}

export function acceptBurdenRelease(release, {
  acceptedByRefs,
  acceptanceEvidenceRefs,
  actorRef,
  acceptedAt = new Date().toISOString(),
  evaluationRefs = release.evaluationRefs
}) {
  if (release.state !== 'CONTEXT_REVIEW') throw new Error('Burden Release acceptance requires replayed CONTEXT_REVIEW history');
  return transitionBurdenRelease(release, {
    nextState: 'ACCEPTED_DEAUTHORIZED',
    actorRef,
    acceptedByRefs,
    acceptanceEvidenceRefs,
    acceptedAt,
    evaluationRefs,
    recurrenceState: 'MONITORING_AVAILABLE',
    transitionedAt: acceptedAt,
    reason: 'EXACT_SCOPE_INFLUENCE_DEAUTHORIZED'
  });
}

export function projectBurdenRelease(release) {
  validateBurdenRelease(release);
  return deepFreeze({
    schemaVersion: 'vexlife.burden-release-projection/v1',
    burdenRef: release.burdenRef,
    patternRef: `pattern.${release.identityFingerprint.slice(0, 24)}`,
    change: release.authorityTransition,
    formerAuthority: release.formerAuthority,
    currentAuthority: release.currentAuthority,
    protectedCapabilities: [...release.protectedCapabilities],
    prohibitedOvercorrections: [...release.prohibitedOvercorrections],
    scope: release.scope,
    state: release.state,
    recurrenceState: release.recurrenceState,
    transitionReceiptRefs: release.transitionReceipts.map((item) => item.transitionRef),
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
