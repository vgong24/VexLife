import {
  readFamilySpace,
  transitionFamilyMember
} from './family-space-store.mjs';
import {
  createFamilyChannel,
  FAMILY_HISTORY_FROM_JOIN_POLICY,
  familySpaceRecordSha256FromMessage,
  validateFamilySpaceConversationRecord
} from './family-conversation.mjs';
import {
  listConversationChannelBindings,
  materializeConversationChannel,
  readConversationChannel,
  readConversationChannelBinding
} from './conversation-store.mjs';
import { semanticHash } from './utils.mjs';

export const FAMILY_MEMBERSHIP_RUNTIME_SCHEMA = 'vexlife.family-membership-runtime/v1';
export const FAMILY_CHANNEL_SUCCESSOR_SCHEMA = 'vexlife.family-channel-successor/v1';
export const FAMILY_THREAD_HISTORY_SCHEMA = 'vexlife.family-thread-history/v1';

const REF = /^[a-z0-9](?:[a-z0-9._-]{0,190}[a-z0-9])?$/u;
const SHA = /^[0-9a-f]{64}$/u;
const EXACT_LEAVE_FIELDS = new Set([
  'home',
  'spaceRef',
  'priorChannelRef',
  'currentPrincipalRef',
  'expectedRevision',
  'expectedMembershipGeneration',
  'observedAt',
  'instanceRef',
  'faults'
]);

export class FamilyMembershipRuntimeError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'FamilyMembershipRuntimeError';
    this.code = code;
    this.details = details;
  }
}

const fail = (code, message, details = null) => {
  throw new FamilyMembershipRuntimeError(code, message, details);
};

const stableRef = (value, label) => {
  if (typeof value !== 'string' || !REF.test(value)) {
    fail('FAMILY_MEMBERSHIP_RUNTIME_INPUT_INVALID', `${label} must be one portable lowercase stable ref`);
  }
  return value;
};

const generation = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('FAMILY_MEMBERSHIP_RUNTIME_INPUT_INVALID', `${label} must be one non-negative safe integer`);
  }
  return value;
};

const canonicalTime = (value, label) => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail('FAMILY_MEMBERSHIP_RUNTIME_INPUT_INVALID', `${label} must be canonical ISO-8601 UTC`);
  }
  return value;
};

const exactKeys = (value, allowed, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('FAMILY_MEMBERSHIP_RUNTIME_INPUT_INVALID', `${label} must be an object`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail('FAMILY_MEMBERSHIP_RUNTIME_UNTRUSTED_FIELD', `${label} contains untrusted field ${key}`);
    }
  }
};

function currentSpace(home, spaceRef) {
  const snapshot = readFamilySpace({ home, spaceRef });
  if (snapshot.state !== 'CURRENT' || !snapshot.record) {
    fail('FAMILY_MEMBERSHIP_RUNTIME_NOT_FOUND', 'Family Space is unavailable');
  }
  return validateFamilySpaceConversationRecord(snapshot.record);
}

function currentGroupChannel(home, priorChannelRef, spaceRef, expectedMembershipGeneration) {
  const projection = readConversationChannelBinding({ home, channelRef: priorChannelRef });
  if (projection.state !== 'CURRENT' || !projection.channel) {
    fail('FAMILY_MEMBERSHIP_RUNTIME_CHANNEL_NOT_FOUND', 'prior Family channel binding is unavailable');
  }
  const channel = projection.channel;
  const binding = channel.familySpaceBinding;
  if (
    channel.kind !== 'GROUP'
    || !binding
    || binding.audienceKind !== 'GROUP'
    || binding.spaceRef !== spaceRef
    || binding.membershipGeneration !== expectedMembershipGeneration
    || binding.familyCompanionIncluded !== true
    || typeof binding.familyCompanionLineageRef !== 'string'
  ) {
    fail('FAMILY_MEMBERSHIP_RUNTIME_CHANNEL_MISMATCH', 'prior channel is not the exact expected GROUP Family binding');
  }
  return channel;
}

function leaveTransitionRef(member) {
  return `transition.vex-family.member.leave.${member.membershipRef}`;
}

function assertRecoverableLeave({
  current,
  priorChannel,
  principalRef,
  expectedRevision,
  expectedMembershipGeneration
}) {
  if (
    current.revision !== expectedRevision + 1
    || current.membershipGeneration !== expectedMembershipGeneration + 1
    || current.priorRecordSha256 !== priorChannel.familySpaceBinding.familySpaceRecordSha256
  ) {
    fail('FAMILY_MEMBERSHIP_RUNTIME_STALE', 'current Family state is not the exact expected post-LEAVE generation');
  }
  const member = current.members.find((candidate) => candidate.principalRef === principalRef);
  if (!member || member.status !== 'LEFT' || current.transitionRef !== leaveTransitionRef(member)) {
    fail('FAMILY_MEMBERSHIP_RUNTIME_STALE', 'current Family state is not the exact expected self-LEAVE result');
  }
  return member;
}

function assertSuccessorCanForm(record, leavingPrincipalRef) {
  if (record.familyCompanionState !== 'ACTIVE' || typeof record.familyCompanionLineageRef !== 'string') {
    fail('FAMILY_MEMBERSHIP_RUNTIME_HELD', 'Family channel continuation requires one active Family companion lineage');
  }
  const remaining = record.members.filter(
    (member) => member.status === 'ACTIVE' && member.principalRef !== leavingPrincipalRef
  );
  if (remaining.length < 1) {
    fail('FAMILY_MEMBERSHIP_RUNTIME_HELD', 'self-LEAVE would leave no active human participant for the Family room');
  }
}

export function deriveFamilySuccessorChannelRef({
  spaceRef,
  threadRef,
  membershipGeneration,
  familySpaceRecordSha256,
  familyCompanionLineageRef
} = {}) {
  const core = {
    schemaVersion: FAMILY_CHANNEL_SUCCESSOR_SCHEMA,
    spaceRef: stableRef(spaceRef, 'spaceRef'),
    threadRef: stableRef(threadRef, 'threadRef'),
    membershipGeneration: generation(membershipGeneration, 'membershipGeneration'),
    familySpaceRecordSha256,
    familyCompanionLineageRef: stableRef(familyCompanionLineageRef, 'familyCompanionLineageRef')
  };
  if (!SHA.test(core.familySpaceRecordSha256 ?? '')) {
    fail('FAMILY_MEMBERSHIP_RUNTIME_INPUT_INVALID', 'familySpaceRecordSha256 must be one lowercase SHA-256');
  }
  return `channel.vex-family.successor.${semanticHash(core).slice(0, 32)}`;
}

export function leaveFamilyAndContinueConversation(input = {}) {
  exactKeys(input, EXACT_LEAVE_FIELDS, 'leave request');
  const {
    home,
    spaceRef,
    priorChannelRef,
    currentPrincipalRef,
    expectedRevision,
    expectedMembershipGeneration,
    observedAt,
    instanceRef,
    faults = {}
  } = input;
  if (!faults || typeof faults !== 'object' || Array.isArray(faults)) {
    fail('FAMILY_MEMBERSHIP_RUNTIME_INPUT_INVALID', 'faults must be an object');
  }
  for (const key of Object.keys(faults)) {
    if (key !== 'failAfterMembershipTransition') {
      fail('FAMILY_MEMBERSHIP_RUNTIME_UNTRUSTED_FIELD', `faults contains unsupported field ${key}`);
    }
  }

  const space = stableRef(spaceRef, 'spaceRef');
  const principal = stableRef(currentPrincipalRef, 'currentPrincipalRef');
  const priorRef = stableRef(priorChannelRef, 'priorChannelRef');
  const instance = stableRef(instanceRef, 'instanceRef');
  const at = canonicalTime(observedAt, 'observedAt');
  const expectedRevisionValue = generation(expectedRevision, 'expectedRevision');
  const expectedGenerationValue = generation(expectedMembershipGeneration, 'expectedMembershipGeneration');

  const priorChannel = currentGroupChannel(home, priorRef, space, expectedGenerationValue);
  let current = currentSpace(home, space);
  let membershipTransitionPerformed = false;

  if (current.membershipGeneration === expectedGenerationValue) {
    if (
      current.revision !== expectedRevisionValue
      || current.recordSha256 !== priorChannel.familySpaceBinding.familySpaceRecordSha256
      || current.familyCompanionLineageRef !== priorChannel.familySpaceBinding.familyCompanionLineageRef
    ) {
      fail('FAMILY_MEMBERSHIP_RUNTIME_STALE', 'expected Family state does not match the exact prior channel binding');
    }
    const leaving = current.members.find((member) => member.principalRef === principal);
    if (!leaving || leaving.status !== 'ACTIVE') {
      fail('FAMILY_MEMBERSHIP_RUNTIME_MEMBER_DENIED', 'current principal is not an active member of the expected Family generation');
    }
    if (!priorChannel.familySpaceBinding.audienceMemberBindings.some((member) => member.principalRef === principal)) {
      fail('FAMILY_MEMBERSHIP_RUNTIME_CHANNEL_MISMATCH', 'current principal is absent from the exact prior Family audience');
    }
    assertSuccessorCanForm(current, principal);
    const result = transitionFamilyMember({
      home,
      spaceRef: space,
      actorPrincipalRef: principal,
      principalRef: principal,
      action: 'LEAVE',
      expectedRevision: expectedRevisionValue,
      expectedMembershipGeneration: expectedGenerationValue,
      observedAt: at,
      instanceRef: instance
    });
    current = validateFamilySpaceConversationRecord(result.record);
    membershipTransitionPerformed = result.state === 'MEMBER_LEAVE';
    if (faults.failAfterMembershipTransition === true) {
      fail(
        'FAMILY_MEMBERSHIP_RUNTIME_CHANNEL_CONTINUATION_REQUIRED',
        'Family membership LEAVE is durable but successor channel materialization was intentionally interrupted',
        {
          membershipGeneration: current.membershipGeneration,
          recordSha256: current.recordSha256
        }
      );
    }
  } else {
    assertRecoverableLeave({
      current,
      priorChannel,
      principalRef: principal,
      expectedRevision: expectedRevisionValue,
      expectedMembershipGeneration: expectedGenerationValue
    });
  }

  assertRecoverableLeave({
    current,
    priorChannel,
    principalRef: principal,
    expectedRevision: expectedRevisionValue,
    expectedMembershipGeneration: expectedGenerationValue
  });
  assertSuccessorCanForm(current, principal);

  const successorChannelRef = deriveFamilySuccessorChannelRef({
    spaceRef: current.spaceRef,
    threadRef: priorChannel.threadRef,
    membershipGeneration: current.membershipGeneration,
    familySpaceRecordSha256: current.recordSha256,
    familyCompanionLineageRef: current.familyCompanionLineageRef
  });
  if (successorChannelRef === priorChannel.channelRef) {
    fail('FAMILY_MEMBERSHIP_RUNTIME_CHANNEL_CONFLICT', 'successor channel identity must differ from the immutable prior channel');
  }

  const successor = createFamilyChannel({
    channelRef: successorChannelRef,
    threadRef: priorChannel.threadRef,
    kind: 'GROUP',
    familySpaceRecord: current,
    labelStringRef: priorChannel.labelStringRef,
    createdAt: current.updatedAt
  });
  const channelInstanceRef = `instance.vex-family.membership-runtime.${semanticHash({
    schemaVersion: FAMILY_MEMBERSHIP_RUNTIME_SCHEMA,
    instanceRef: instance,
    successorChannelRef
  }).slice(0, 32)}`;
  const materialized = materializeConversationChannel({
    home,
    channel: successor,
    instanceRef: channelInstanceRef,
    observedAt: successor.createdAt
  });

  return Object.freeze({
    schemaVersion: FAMILY_MEMBERSHIP_RUNTIME_SCHEMA,
    state: membershipTransitionPerformed
      ? 'MEMBER_LEFT_AND_CHANNEL_CONTINUED'
      : 'RECOVERED_CHANNEL_CONTINUATION',
    spaceRef: current.spaceRef,
    principalRef: principal,
    priorChannelRef: priorChannel.channelRef,
    successorChannelRef,
    threadRef: successor.threadRef,
    priorMembershipGeneration: expectedGenerationValue,
    membershipGeneration: current.membershipGeneration,
    familySpaceRecordSha256: current.recordSha256,
    membershipTransitionPerformed,
    channelMaterializationState: materialized.state
  });
}

function exactCurrentMember(record, principalRef, principalBindingRef) {
  const member = record.members.find(
    (candidate) => candidate.principalRef === principalRef && candidate.status === 'ACTIVE'
  );
  if (!member) {
    fail('FAMILY_MEMBERSHIP_RUNTIME_MEMBER_DENIED', 'principal is not a current active Family member');
  }
  if (member.principalBindingRef !== principalBindingRef) {
    fail('FAMILY_MEMBERSHIP_RUNTIME_BINDING_MISMATCH', 'principal binding does not match current Family membership');
  }
  if (member.historyVisibilityPolicyRef !== FAMILY_HISTORY_FROM_JOIN_POLICY) {
    fail('FAMILY_MEMBERSHIP_RUNTIME_HISTORY_POLICY_UNSUPPORTED', 'only source-managed FROM_JOIN history is supported');
  }
  return member;
}

function segmentMatchesCurrentFamily(channel, record, threadRef) {
  const binding = channel?.familySpaceBinding;
  return Boolean(
    channel?.kind === 'GROUP'
    && binding?.audienceKind === 'GROUP'
    && binding.spaceRef === record.spaceRef
    && channel.threadRef === threadRef
    && binding.membershipGeneration <= record.membershipGeneration
    && binding.familyCompanionLineageRef === record.familyCompanionLineageRef
    && binding.familyCompanionIncluded === true
    && binding.historyVisibilityPolicyRef === FAMILY_HISTORY_FROM_JOIN_POLICY
  );
}

export function readFamilyThreadHistory({
  home,
  spaceRef,
  currentChannelRef,
  principalRef,
  principalBindingRef,
  limit = 200
} = {}) {
  const space = stableRef(spaceRef, 'spaceRef');
  const principal = stableRef(principalRef, 'principalRef');
  const bindingRef = stableRef(principalBindingRef, 'principalBindingRef');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    fail('FAMILY_MEMBERSHIP_RUNTIME_INPUT_INVALID', 'limit must be 1..1000');
  }

  const current = currentSpace(home, space);
  const member = exactCurrentMember(current, principal, bindingRef);
  const currentProjection = readConversationChannelBinding({
    home,
    channelRef: stableRef(currentChannelRef, 'currentChannelRef')
  });
  if (currentProjection.state !== 'CURRENT' || !currentProjection.channel) {
    fail('FAMILY_MEMBERSHIP_RUNTIME_CHANNEL_NOT_FOUND', 'current Family channel binding is unavailable');
  }
  const currentChannel = currentProjection.channel;
  if (
    !segmentMatchesCurrentFamily(currentChannel, current, currentChannel.threadRef)
    || currentChannel.familySpaceBinding.membershipGeneration !== current.membershipGeneration
    || currentChannel.familySpaceBinding.familySpaceRecordSha256 !== current.recordSha256
  ) {
    fail('FAMILY_MEMBERSHIP_RUNTIME_CHANNEL_MISMATCH', 'current Family channel is not bound to the exact current Family generation');
  }

  const listed = listConversationChannelBindings({ home, limit: 1000 });
  const segments = listed.channels
    .filter((channel) => segmentMatchesCurrentFamily(channel, current, currentChannel.threadRef))
    .sort((left, right) =>
      left.familySpaceBinding.membershipGeneration - right.familySpaceBinding.membershipGeneration
      || (left.channelRef < right.channelRef ? -1 : left.channelRef > right.channelRef ? 1 : 0)
    );

  const seenGeneration = new Set();
  const messages = [];
  for (const segment of segments) {
    const segmentGeneration = segment.familySpaceBinding.membershipGeneration;
    if (seenGeneration.has(segmentGeneration)) {
      fail(
        'FAMILY_MEMBERSHIP_RUNTIME_CHANNEL_CONFLICT',
        'multiple GROUP channel segments claim the same Family membership generation'
      );
    }
    seenGeneration.add(segmentGeneration);
    const projection = readConversationChannel({ home, channelRef: segment.channelRef, limit: 1000 });
    for (const message of projection.messages) {
      if (
        message.channelRef !== segment.channelRef
        || message.threadRef !== currentChannel.threadRef
        || message.spaceRef !== current.spaceRef
        || message.membershipGeneration !== segmentGeneration
        || message.membershipSnapshotRef !== segment.familySpaceBinding.membershipSnapshotRef
        || familySpaceRecordSha256FromMessage(message) !== segment.familySpaceBinding.familySpaceRecordSha256
      ) {
        fail('FAMILY_MEMBERSHIP_RUNTIME_HISTORY_CORRUPT', 'Family history segment contains a message with mismatched source binding');
      }
      if (
        message.createdAt >= member.joinedAt
        && Array.isArray(message.witnessRefs)
        && message.witnessRefs.includes(principal)
      ) {
        messages.push(Object.freeze({ ...message }));
      }
    }
  }

  const truncated = messages.length > limit;
  const selected = Object.freeze(messages.slice(Math.max(0, messages.length - limit)));
  return Object.freeze({
    schemaVersion: FAMILY_THREAD_HISTORY_SCHEMA,
    state: 'CURRENT',
    spaceRef: current.spaceRef,
    threadRef: currentChannel.threadRef,
    currentChannelRef: currentChannel.channelRef,
    membershipGeneration: current.membershipGeneration,
    principalRef: principal,
    segmentRefs: Object.freeze(segments.map((channel) => channel.channelRef)),
    messages: selected,
    truncated
  });
}

// [VXG RealForever]
