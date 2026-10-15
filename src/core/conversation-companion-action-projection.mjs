import { semanticHash } from './utils.mjs';

export const CONVERSATION_COMPANION_ACTION_PROJECTION_SCHEMA =
  'vexlife.conversation-companion-action-projection/v1';
export const CONVERSATION_COMPANION_ACTION_PROJECTION_TRUTH_CLASS =
  'SOURCE_BOUND_CONVERSATION_COMPANION_ACTION_PROJECTION';
export const CONVERSATION_COMPANION_ACTION_PATTERN_REF = 'pattern.vexlife.action-decision';
export const CONVERSATION_MESSAGE_SEND_ACTION_REF = 'action.message.send';
export const CONVERSATION_COMPANION_REENTRY_ACTION_REF = 'action.companion.reenter-current-binding';

const COMPANION_AVAILABILITY_SCHEMA = 'vexlife.companion-availability/v1';
const COMPANION_AVAILABILITY_TRUTH_CLASS = 'SOURCE_BOUND_COMPANION_AVAILABILITY';
const COMPANION_AVAILABILITY_STATES = new Set([
  'READY',
  'STARTING',
  'RECOVERABLE',
  'ACTION_REQUIRED',
  'UNAVAILABLE',
  'HELD'
]);
const EXPERIENCE_AVAILABILITY = Object.freeze({
  AVAILABLE: 'availability.vexlife.available',
  HELD: 'availability.vexlife.held',
  UNAVAILABLE: 'availability.vexlife.unavailable'
});
const AUTHORITY_FIELDS = Object.freeze([
  'effectAuthorityGranted',
  'rendererAuthorityGranted',
  'modelIdentityAuthorityGranted',
  'processAuthorityGranted',
  'conversationAuthorityGranted'
]);

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonempty(value) {
  return typeof value === 'string' && value.length > 0;
}

function uniqueRefs(value, label) {
  if (!Array.isArray(value) || value.some((item) => !nonempty(item)) || new Set(value).size !== value.length) {
    throw new TypeError(`${label} must contain unique non-empty refs`);
  }
  return Object.freeze([...value]);
}

function freezeDeep(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (object(value)) {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, freezeDeep(child)])
    ));
  }
  return value;
}

function validateAvailability(value) {
  if (!object(value)) throw new TypeError('companionAvailability must be one object');
  if (
    value.schemaVersion !== COMPANION_AVAILABILITY_SCHEMA
    || value.truthClass !== COMPANION_AVAILABILITY_TRUTH_CLASS
    || !COMPANION_AVAILABILITY_STATES.has(value.availabilityState)
  ) {
    throw new TypeError('companionAvailability schema/truth/state is invalid');
  }
  for (const field of ['projectionRef', 'recoveryClass', 'reasonCode']) {
    if (!nonempty(value[field])) throw new TypeError(`companionAvailability.${field} is required`);
  }
  if (!/^[0-9a-f]{64}$/u.test(value.projectionSha256 ?? '')) {
    throw new TypeError('companionAvailability.projectionSha256 is invalid');
  }
  for (const field of AUTHORITY_FIELDS) {
    if (value[field] !== false) {
      throw new TypeError(`companionAvailability.${field} must remain false`);
    }
  }
  return freezeDeep({
    schemaVersion: value.schemaVersion,
    truthClass: value.truthClass,
    projectionRef: value.projectionRef,
    projectionSha256: value.projectionSha256,
    availabilityState: value.availabilityState,
    recoveryClass: value.recoveryClass,
    reasonCode: value.reasonCode,
    sourceRefs: uniqueRefs(value.sourceRefs, 'companionAvailability.sourceRefs')
  });
}

function actionDecision({
  actionRef,
  availabilityRef,
  reasonCode,
  recoveryActionRefs = []
}) {
  const operable = availabilityRef === EXPERIENCE_AVAILABILITY.AVAILABLE;
  return freezeDeep({
    patternRef: CONVERSATION_COMPANION_ACTION_PATTERN_REF,
    actionRef,
    availabilityRef,
    operable,
    reasonCode,
    recoveryActionRefs: uniqueRefs(recoveryActionRefs, `${actionRef}.recoveryActionRefs`),
    effectAuthorityGranted: false
  });
}

function sendDecision(availability) {
  switch (availability.availabilityState) {
    case 'READY':
      return actionDecision({
        actionRef: CONVERSATION_MESSAGE_SEND_ACTION_REF,
        availabilityRef: EXPERIENCE_AVAILABILITY.AVAILABLE,
        reasonCode: 'COMPANION_READY'
      });
    case 'STARTING':
      return actionDecision({
        actionRef: CONVERSATION_MESSAGE_SEND_ACTION_REF,
        availabilityRef: EXPERIENCE_AVAILABILITY.HELD,
        reasonCode: availability.reasonCode
      });
    case 'RECOVERABLE':
      return actionDecision({
        actionRef: CONVERSATION_MESSAGE_SEND_ACTION_REF,
        availabilityRef: EXPERIENCE_AVAILABILITY.HELD,
        reasonCode: 'COMPANION_RECOVERY_REQUIRED_BEFORE_SEND',
        recoveryActionRefs: availability.recoveryClass === 'SAFE_REENTRY_AVAILABLE'
          ? [CONVERSATION_COMPANION_REENTRY_ACTION_REF]
          : []
      });
    case 'HELD':
      return actionDecision({
        actionRef: CONVERSATION_MESSAGE_SEND_ACTION_REF,
        availabilityRef: EXPERIENCE_AVAILABILITY.HELD,
        reasonCode: availability.reasonCode
      });
    case 'ACTION_REQUIRED':
    case 'UNAVAILABLE':
      return actionDecision({
        actionRef: CONVERSATION_MESSAGE_SEND_ACTION_REF,
        availabilityRef: EXPERIENCE_AVAILABILITY.UNAVAILABLE,
        reasonCode: availability.reasonCode,
        recoveryActionRefs: availability.recoveryClass === 'SAFE_REENTRY_AVAILABLE'
          ? [CONVERSATION_COMPANION_REENTRY_ACTION_REF]
          : []
      });
    default:
      throw new TypeError(`Unsupported Companion availability state ${availability.availabilityState}`);
  }
}

function reentryDecision(availability) {
  if (
    availability.availabilityState === 'RECOVERABLE'
    && availability.recoveryClass === 'SAFE_REENTRY_AVAILABLE'
  ) {
    return actionDecision({
      actionRef: CONVERSATION_COMPANION_REENTRY_ACTION_REF,
      availabilityRef: EXPERIENCE_AVAILABILITY.AVAILABLE,
      reasonCode: availability.reasonCode
    });
  }
  if (availability.availabilityState === 'STARTING' || availability.availabilityState === 'HELD') {
    return actionDecision({
      actionRef: CONVERSATION_COMPANION_REENTRY_ACTION_REF,
      availabilityRef: EXPERIENCE_AVAILABILITY.HELD,
      reasonCode: availability.reasonCode
    });
  }
  return actionDecision({
    actionRef: CONVERSATION_COMPANION_REENTRY_ACTION_REF,
    availabilityRef: EXPERIENCE_AVAILABILITY.UNAVAILABLE,
    reasonCode: availability.availabilityState === 'READY'
      ? 'COMPANION_ALREADY_READY'
      : availability.reasonCode
  });
}

export function projectConversationCompanionActionDecisions({
  channelRef,
  companionAvailability
} = {}) {
  if (!nonempty(channelRef)) throw new TypeError('channelRef must be one non-empty ref');
  const availability = validateAvailability(companionAvailability);
  const core = {
    schemaVersion: CONVERSATION_COMPANION_ACTION_PROJECTION_SCHEMA,
    truthClass: CONVERSATION_COMPANION_ACTION_PROJECTION_TRUTH_CLASS,
    featureRef: 'feature.vexlife.addressed-conversation',
    conversationOwnerRef: 'module.vexlife.core.conversation',
    companionAvailabilityOwnerRef: 'module.vexlife.core.companion-availability-reentry',
    experiencePatternRef: CONVERSATION_COMPANION_ACTION_PATTERN_REF,
    channelRef,
    sourceAvailabilityProjectionRef: availability.projectionRef,
    sourceAvailabilityProjectionSha256: availability.projectionSha256,
    sourceAvailabilityState: availability.availabilityState,
    sourceRecoveryClass: availability.recoveryClass,
    sourceReasonCode: availability.reasonCode,
    sourceRefs: [...new Set([...availability.sourceRefs, availability.projectionRef])].sort(),
    decisions: {
      send: sendDecision(availability),
      reenterCurrentBinding: reentryDecision(availability)
    },
    effectAuthorityGranted: false,
    rendererAuthorityGranted: false,
    effects: {
      messageSend: false,
      companionReentry: false
    }
  };
  const projectionSha256 = semanticHash(core);
  return freezeDeep({
    ...core,
    projectionRef: `projection.vexlife.conversation-companion-actions.${projectionSha256.slice(0, 32)}`,
    projectionSha256
  });
}

// [VXG RealForever]
