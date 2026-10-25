import { semanticHash } from './utils.mjs';

export const INTERACTION_ACTIVE_TURN_CURRENTNESS_SCHEMA = 'vexlife.interaction-active-turn-currentness/v1';
export const INTERACTION_ACTIVE_TURN_CURRENTNESS_TRUTH_CLASS = 'READ_ONLY_ACTIVE_TURN_CURRENTNESS';

const PORTABLE_REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/u;
const STATES = new Set(['CURRENT', 'STALE', 'UNKNOWN', 'ABSENT']);
const CURRENTNESS = new Set(['CURRENT', 'STALE', 'UNKNOWN']);
const PHASES = new Set(['ACTIVE', 'IDLE', 'UNKNOWN']);

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function stableRef(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !PORTABLE_REF.test(value) || value.includes('..')) {
    throw new TypeError(`${label} must be one stable portable ref${nullable ? ' or null' : ''}`);
  }
  return value;
}

function stableRefs(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError(`${label} must be a non-empty array`);
  const canonical = [...new Set(value.map((item) => stableRef(item, label)))].sort();
  if (canonical.length !== value.length) throw new TypeError(`${label} must contain unique refs`);
  return canonical;
}

function canonicalTimestamp(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new TypeError(`${label} must be an ISO timestamp${nullable ? ' or null' : ''}`);
  const canonical = new Date(Date.parse(value)).toISOString();
  if (value !== canonical && value !== canonical.replace('.000Z', 'Z')) throw new TypeError(`${label} must be canonical UTC`);
  return canonical;
}

function projectionCore({
  state,
  currentness,
  phase,
  expectedTurnRefOrNull,
  turnRefOrNull,
  cancellationTargetRefOrNull,
  cancellationTargetExpiresAtOrNull,
  observedAt,
  sourceRefs,
  reasonCodeOrNull
}) {
  if (!STATES.has(state)) throw new TypeError('active-turn state is invalid');
  if (!CURRENTNESS.has(currentness)) throw new TypeError('active-turn currentness is invalid');
  if (!PHASES.has(phase)) throw new TypeError('active-turn phase is invalid');
  return {
    schemaVersion: INTERACTION_ACTIVE_TURN_CURRENTNESS_SCHEMA,
    truthClass: INTERACTION_ACTIVE_TURN_CURRENTNESS_TRUTH_CLASS,
    state,
    currentness,
    phase,
    expectedTurnRefOrNull: stableRef(expectedTurnRefOrNull, 'expectedTurnRefOrNull', { nullable: true }),
    turnRefOrNull: stableRef(turnRefOrNull, 'turnRefOrNull', { nullable: true }),
    cancellationTargetRefOrNull: stableRef(cancellationTargetRefOrNull, 'cancellationTargetRefOrNull', { nullable: true }),
    cancellationTargetExpiresAtOrNull: canonicalTimestamp(cancellationTargetExpiresAtOrNull, 'cancellationTargetExpiresAtOrNull', { nullable: true }),
    observedAt: canonicalTimestamp(observedAt, 'observedAt'),
    sourceRefs: stableRefs(sourceRefs, 'sourceRefs'),
    reasonCodeOrNull: reasonCodeOrNull === null ? null : stableRef(reasonCodeOrNull, 'reasonCodeOrNull'),
    effectAuthorityGranted: false
  };
}

export function projectActiveTurnCurrentness({
  expectedTurnRef = null,
  turnRef = null,
  cancellationTargetRef = null,
  cancellationTargetExpiresAt = null,
  lifecyclePhase = 'IDLE',
  sourceRefs,
  ambiguous = false,
  observedAt = new Date().toISOString()
} = {}) {
  stableRef(expectedTurnRef, 'expectedTurnRef', { nullable: true });
  stableRef(turnRef, 'turnRef', { nullable: true });
  stableRef(cancellationTargetRef, 'cancellationTargetRef', { nullable: true });
  const at = canonicalTimestamp(observedAt, 'observedAt');
  const expiry = canonicalTimestamp(cancellationTargetExpiresAt, 'cancellationTargetExpiresAt', { nullable: true });
  if (!['ACTIVE', 'IDLE'].includes(lifecyclePhase)) throw new TypeError('lifecyclePhase must be ACTIVE or IDLE');
  if (typeof ambiguous !== 'boolean') throw new TypeError('ambiguous must be boolean');

  let state;
  let currentness;
  let phase;
  let reasonCodeOrNull = null;

  if (expectedTurnRef !== null && expectedTurnRef !== turnRef) {
    state = 'STALE';
    currentness = 'STALE';
    phase = turnRef === null ? 'IDLE' : 'ACTIVE';
    reasonCodeOrNull = 'EXPECTED_TURN_NOT_ACTIVE';
  } else if (ambiguous) {
    state = 'UNKNOWN';
    currentness = 'UNKNOWN';
    phase = 'UNKNOWN';
    reasonCodeOrNull = 'MULTIPLE_ACTIVE_TURNS';
  } else if (turnRef === null) {
    state = 'ABSENT';
    currentness = 'CURRENT';
    phase = 'IDLE';
    reasonCodeOrNull = 'NO_ACTIVE_TURN';
  } else if (lifecyclePhase !== 'ACTIVE') {
    state = 'STALE';
    currentness = 'STALE';
    phase = 'IDLE';
    reasonCodeOrNull = 'TURN_NOT_ACTIVE';
  } else if (cancellationTargetRef === null) {
    state = 'UNKNOWN';
    currentness = 'UNKNOWN';
    phase = 'ACTIVE';
    reasonCodeOrNull = 'CANCELLATION_TARGET_UNAVAILABLE';
  } else if (expiry !== null && Date.parse(at) >= Date.parse(expiry)) {
    state = 'STALE';
    currentness = 'STALE';
    phase = 'ACTIVE';
    reasonCodeOrNull = 'CANCELLATION_TARGET_EXPIRED';
  } else {
    state = 'CURRENT';
    currentness = 'CURRENT';
    phase = 'ACTIVE';
  }

  const core = projectionCore({
    state,
    currentness,
    phase,
    expectedTurnRefOrNull: expectedTurnRef,
    turnRefOrNull: turnRef,
    cancellationTargetRefOrNull: cancellationTargetRef,
    cancellationTargetExpiresAtOrNull: expiry,
    observedAt: at,
    sourceRefs,
    reasonCodeOrNull
  });
  const semanticFingerprint = semanticHash(core);
  return freeze({
    ...core,
    projectionRef: `projection.vexlife.interaction-active-turn.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

export function verifyActiveTurnCurrentnessProjection(value) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (value.schemaVersion !== INTERACTION_ACTIVE_TURN_CURRENTNESS_SCHEMA || value.truthClass !== INTERACTION_ACTIVE_TURN_CURRENTNESS_TRUTH_CLASS) return false;
    if (typeof value.semanticFingerprint !== 'string' || !/^[0-9a-f]{64}$/u.test(value.semanticFingerprint)) return false;
    if (value.projectionRef !== `projection.vexlife.interaction-active-turn.${value.semanticFingerprint.slice(0, 32)}`) return false;
    const { projectionRef, semanticFingerprint, ...coreInput } = value;
    const core = projectionCore({
      state: coreInput.state,
      currentness: coreInput.currentness,
      phase: coreInput.phase,
      expectedTurnRefOrNull: coreInput.expectedTurnRefOrNull,
      turnRefOrNull: coreInput.turnRefOrNull,
      cancellationTargetRefOrNull: coreInput.cancellationTargetRefOrNull,
      cancellationTargetExpiresAtOrNull: coreInput.cancellationTargetExpiresAtOrNull,
      observedAt: coreInput.observedAt,
      sourceRefs: coreInput.sourceRefs,
      reasonCodeOrNull: coreInput.reasonCodeOrNull
    });
    return coreInput.effectAuthorityGranted === false && semanticHash(core) === semanticFingerprint;
  } catch {
    return false;
  }
}

export function toCurrentActiveTurnEvidence(projection) {
  if (!verifyActiveTurnCurrentnessProjection(projection)) throw new TypeError('active-turn currentness projection is invalid');
  if (
    projection.state !== 'CURRENT' ||
    projection.currentness !== 'CURRENT' ||
    projection.phase !== 'ACTIVE' ||
    projection.turnRefOrNull === null ||
    projection.cancellationTargetRefOrNull === null
  ) {
    throw new TypeError(`active turn is not CURRENT: ${projection.state}`);
  }
  return freeze({
    projectionRef: projection.projectionRef,
    turnRef: projection.turnRefOrNull,
    phase: 'ACTIVE',
    currentness: 'CURRENT',
    cancellationTargetRef: projection.cancellationTargetRefOrNull,
    sourceRefs: [...projection.sourceRefs]
  });
}

// [VXG RealForever]
