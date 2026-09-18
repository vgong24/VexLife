import { createChannel, createMessage, messagesForChannel } from './conversation.mjs';
import { semanticHash } from './utils.mjs';

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const unique = (values) => [...new Set(values)];
const sameSet = (left, right) =>
  left.length === right.length
  && new Set(left).size === left.length
  && new Set(right).size === right.length
  && left.every((value) => right.includes(value));

export const FAMILY_CONVERSATION_BINDING_SCHEMA = 'vexlife.family-conversation-binding/v1';
export const FAMILY_CONVERSATION_MESSAGE_SCHEMA = 'vexlife.family-conversation-message/v1';
export const FAMILY_HISTORY_FROM_JOIN_POLICY = 'policy.vex-family.history.from-join';

const FAMILY_SPACE_SCHEMA = 'vexlife.family-space/v1';
const FAMILY_SPACE_RECORD_REF_PREFIX = 'record.vex-family.';
const FAMILY_SPACE_RECORD_SHA = /^[0-9a-f]{64}$/u;
const FAMILY_REF = /^[a-z0-9](?:[a-z0-9._-]{0,190}[a-z0-9])?$/u;
const FAMILY_COMPANION_LINEAGE_PREFIX = 'lineage.vex.family.';
const FAMILY_MEMBER_ROLES = new Set(['OWNER', 'ADMIN', 'MEMBER']);
const FAMILY_MEMBER_STATUSES = new Set(['ACTIVE', 'LEFT', 'REVOKED', 'REMOVED']);
const FAMILY_COMPANION_STATES = new Set(['ACTIVE', 'HELD', 'RETIRED']);
const FAMILY_CHANNEL_KINDS = new Set(['GROUP', 'PRIVATE']);

export class FamilyConversationError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'FamilyConversationError';
    this.code = code;
    this.details = details;
  }
}

const familyFail = (code, message, details = null) => {
  throw new FamilyConversationError(code, message, details);
};

const familyRef = (value, label) => {
  if (typeof value !== 'string' || !FAMILY_REF.test(value)) {
    familyFail('FAMILY_CONVERSATION_INPUT_INVALID', `${label} must be one portable lowercase stable reference`);
  }
  return value;
};

const familyTime = (value, label) => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    familyFail('FAMILY_CONVERSATION_INPUT_INVALID', `${label} must be canonical ISO-8601 UTC`);
  }
  return value;
};

const familyGeneration = (value, label = 'membershipGeneration') => {
  if (!Number.isSafeInteger(value) || value < 0) {
    familyFail('FAMILY_CONVERSATION_INPUT_INVALID', `${label} must be a non-negative safe integer`);
  }
  return value;
};

const sameOrderedRefs = (left, right) =>
  Array.isArray(left)
  && Array.isArray(right)
  && left.length === right.length
  && left.every((value, index) => value === right[index]);

function immutableFamilyMember(member) {
  if (!isObject(member)) familyFail('FAMILY_CONVERSATION_RECORD_INVALID', 'Family member must be an object');
  if (!FAMILY_MEMBER_ROLES.has(member.role) || !FAMILY_MEMBER_STATUSES.has(member.status)) {
    familyFail('FAMILY_CONVERSATION_RECORD_INVALID', 'Family member role/status is invalid');
  }
  if (member.historyVisibilityPolicyRef !== FAMILY_HISTORY_FROM_JOIN_POLICY) {
    familyFail(
      'FAMILY_CONVERSATION_HISTORY_POLICY_UNSUPPORTED',
      'Family conversation currently supports only source-managed FROM_JOIN history'
    );
  }
  return Object.freeze({
    membershipRef: familyRef(member.membershipRef, 'membershipRef'),
    principalRef: familyRef(member.principalRef, 'principalRef'),
    principalBindingRef: familyRef(member.principalBindingRef, 'principalBindingRef'),
    role: member.role,
    status: member.status,
    joinedAt: familyTime(member.joinedAt, 'joinedAt'),
    leftOrRevokedAtOrNull: member.leftOrRevokedAtOrNull == null
      ? null
      : familyTime(member.leftOrRevokedAtOrNull, 'leftOrRevokedAtOrNull'),
    historyVisibilityPolicyRef: member.historyVisibilityPolicyRef
  });
}

export function validateFamilySpaceConversationRecord(record) {
  if (!isObject(record) || record.schemaVersion !== FAMILY_SPACE_SCHEMA) {
    familyFail('FAMILY_CONVERSATION_RECORD_INVALID', 'Family Space record schema is invalid');
  }
  if (!FAMILY_SPACE_RECORD_SHA.test(record.recordSha256 ?? '')) {
    familyFail('FAMILY_CONVERSATION_RECORD_INVALID', 'Family Space record SHA-256 is invalid');
  }
  const core = structuredClone(record);
  delete core.recordSha256;
  if (semanticHash(core) !== record.recordSha256) {
    familyFail('FAMILY_CONVERSATION_RECORD_INVALID', 'Family Space record hash does not match exact record bytes');
  }
  familyRef(record.spaceRef, 'spaceRef');
  familyGeneration(record.revision, 'revision');
  familyGeneration(record.membershipGeneration);
  familyGeneration(record.familyCompanionBindingGeneration, 'familyCompanionBindingGeneration');
  if (!FAMILY_COMPANION_STATES.has(record.familyCompanionState)) {
    familyFail('FAMILY_CONVERSATION_RECORD_INVALID', 'Family companion state is invalid');
  }
  if (record.familyCompanionLineageRef != null) {
    const lineageRef = familyRef(record.familyCompanionLineageRef, 'familyCompanionLineageRef');
    if (!lineageRef.startsWith(FAMILY_COMPANION_LINEAGE_PREFIX)) {
      familyFail('FAMILY_CONVERSATION_RECORD_INVALID', 'Family companion lineage identity class is invalid');
    }
  } else if (record.familyCompanionState === 'ACTIVE') {
    familyFail('FAMILY_CONVERSATION_RECORD_INVALID', 'ACTIVE Family companion lacks lineage identity');
  }
  familyTime(record.createdAt, 'createdAt');
  familyTime(record.updatedAt, 'updatedAt');
  if (record.priorRecordSha256 != null && !FAMILY_SPACE_RECORD_SHA.test(record.priorRecordSha256)) {
    familyFail('FAMILY_CONVERSATION_RECORD_INVALID', 'priorRecordSha256 is invalid');
  }
  if (!Array.isArray(record.members)) {
    familyFail('FAMILY_CONVERSATION_RECORD_INVALID', 'Family Space members must be an array');
  }

  const members = record.members.map(immutableFamilyMember);
  if (members.length === 0) {
    familyFail('FAMILY_CONVERSATION_RECORD_INVALID', 'Family Space membership is empty');
  }
  for (const field of ['membershipRef', 'principalRef', 'principalBindingRef']) {
    if (new Set(members.map((member) => member[field])).size !== members.length) {
      familyFail('FAMILY_CONVERSATION_RECORD_INVALID', `Family member ${field} values must be unique`);
    }
  }
  if (!members.some((member) => member.role === 'OWNER' && member.status === 'ACTIVE')) {
    familyFail('FAMILY_CONVERSATION_RECORD_INVALID', 'Family Space requires one active OWNER');
  }
  return Object.freeze({ ...record, members: Object.freeze(members) });
}

export function familySpaceRecordSnapshotRef(recordSha256) {
  if (!FAMILY_SPACE_RECORD_SHA.test(recordSha256 ?? '')) {
    familyFail('FAMILY_CONVERSATION_INPUT_INVALID', 'recordSha256 must be one lowercase SHA-256');
  }
  return `${FAMILY_SPACE_RECORD_REF_PREFIX}${recordSha256}`;
}

export function familySpaceRecordSha256FromMessage(message) {
  const snapshotRef = message?.membershipSnapshotRef;
  if (typeof snapshotRef !== 'string' || !snapshotRef.startsWith(FAMILY_SPACE_RECORD_REF_PREFIX)) {
    familyFail('FAMILY_CONVERSATION_RECORD_INVALID', 'message lacks a Family Space record snapshot reference');
  }
  const recordSha256 = snapshotRef.slice(FAMILY_SPACE_RECORD_REF_PREFIX.length);
  if (!FAMILY_SPACE_RECORD_SHA.test(recordSha256)) {
    familyFail('FAMILY_CONVERSATION_RECORD_INVALID', 'message Family Space record snapshot reference is invalid');
  }
  if (message.familySpaceRecordSha256 != null && message.familySpaceRecordSha256 !== recordSha256) {
    familyFail('FAMILY_CONVERSATION_RECORD_INVALID', 'message Family Space record identities disagree');
  }
  return recordSha256;
}

function activeFamilyMembers(record) {
  return record.members.filter((member) => member.status === 'ACTIVE');
}

function audienceBindings(record, kind, memberPrincipalRefs) {
  const active = activeFamilyMembers(record);
  const activeByPrincipal = new Map(active.map((member) => [member.principalRef, member]));
  if (kind === 'GROUP') {
    if (memberPrincipalRefs != null) {
      const requested = unique(memberPrincipalRefs);
      const current = active.map((member) => member.principalRef);
      if (!sameSet(requested, current)) {
        familyFail(
          'FAMILY_CONVERSATION_AUDIENCE_INVALID',
          'GROUP Family channel audience must equal the exact active Family membership projection'
        );
      }
    }
    return active;
  }

  const requested = unique(memberPrincipalRefs ?? []);
  if (requested.length < 2) {
    familyFail('FAMILY_CONVERSATION_AUDIENCE_INVALID', 'PRIVATE Family channel requires at least two active human principals');
  }
  return requested.map((principalRef) => {
    const member = activeByPrincipal.get(familyRef(principalRef, 'memberPrincipalRef'));
    if (!member) {
      familyFail('FAMILY_CONVERSATION_MEMBER_DENIED', `${principalRef} is not an active Family member`);
    }
    return member;
  });
}

function frozenAudienceMember(member) {
  return Object.freeze({
    membershipRef: member.membershipRef,
    principalRef: member.principalRef,
    principalBindingRef: member.principalBindingRef,
    role: member.role,
    joinedAt: member.joinedAt,
    historyVisibilityPolicyRef: member.historyVisibilityPolicyRef
  });
}

function assertFamilyChannelCurrent(channel, rawRecord) {
  if (!isObject(channel?.familySpaceBinding) || channel.familySpaceBinding.schemaVersion !== FAMILY_CONVERSATION_BINDING_SCHEMA) {
    familyFail('FAMILY_CONVERSATION_INPUT_INVALID', 'Family channel binding is required');
  }
  const record = validateFamilySpaceConversationRecord(rawRecord);
  const binding = channel.familySpaceBinding;
  if (!FAMILY_CHANNEL_KINDS.has(binding.audienceKind) || channel.kind !== binding.audienceKind) {
    familyFail('FAMILY_CONVERSATION_STALE', 'Family channel kind does not match its admitted audience binding');
  }
  if (!Array.isArray(binding.audienceMemberBindings)) {
    familyFail('FAMILY_CONVERSATION_RECORD_INVALID', 'Family channel audience binding must be an array');
  }
  if (binding.historyVisibilityPolicyRef !== FAMILY_HISTORY_FROM_JOIN_POLICY) {
    familyFail(
      'FAMILY_CONVERSATION_HISTORY_POLICY_UNSUPPORTED',
      'Family channel history policy is not accepted FROM_JOIN'
    );
  }
  if (
    binding.spaceRef !== record.spaceRef
    || binding.familySpaceRecordSha256 !== record.recordSha256
    || binding.membershipSnapshotRef !== familySpaceRecordSnapshotRef(record.recordSha256)
    || binding.membershipGeneration !== record.membershipGeneration
  ) {
    familyFail(
      'FAMILY_CONVERSATION_STALE',
      'Family channel is not bound to the exact current Family Space record/generation'
    );
  }

  const currentByPrincipal = new Map(activeFamilyMembers(record).map((member) => [member.principalRef, member]));
  const expectedAudience = binding.audienceMemberBindings.map((boundMember) => {
    const current = currentByPrincipal.get(boundMember.principalRef);
    if (
      !current
      || current.membershipRef !== boundMember.membershipRef
      || current.principalBindingRef !== boundMember.principalBindingRef
      || current.joinedAt !== boundMember.joinedAt
      || current.historyVisibilityPolicyRef !== boundMember.historyVisibilityPolicyRef
    ) {
      familyFail('FAMILY_CONVERSATION_STALE', 'Family channel audience binding is no longer current');
    }
    return current;
  });

  if (binding.audienceKind === 'GROUP') {
    const allActive = activeFamilyMembers(record);
    if (expectedAudience.length !== allActive.length || !sameSet(
      expectedAudience.map((member) => member.principalRef),
      allActive.map((member) => member.principalRef)
    )) {
      familyFail('FAMILY_CONVERSATION_STALE', 'GROUP Family channel no longer matches exact active membership');
    }
  }

  const expectedCompanion = binding.familyCompanionIncluded === true && record.familyCompanionState === 'ACTIVE'
    ? record.familyCompanionLineageRef
    : null;
  if (binding.familyCompanionLineageRef !== expectedCompanion) {
    familyFail('FAMILY_CONVERSATION_STALE', 'Family companion channel binding is no longer current');
  }
  const expectedMemberRefs = [
    ...expectedAudience.map((member) => member.principalRef),
    ...(expectedCompanion ? [expectedCompanion] : [])
  ];
  if (!sameOrderedRefs(binding.channelMemberRefs, expectedMemberRefs)) {
    familyFail('FAMILY_CONVERSATION_STALE', 'Family channel witness membership differs from the admitted audience snapshot');
  }
  if (!Array.isArray(channel.memberRefs) || channel.memberRefs.length !== 0) {
    familyFail('FAMILY_CONVERSATION_STALE', 'Family channel generic member view must remain fail-closed');
  }
  return Object.freeze({ record, binding, audienceMembers: Object.freeze(expectedAudience) });
}


export function createFamilyChannel({
  channelRef,
  threadRef,
  kind = 'GROUP',
  familySpaceRecord,
  memberPrincipalRefs = null,
  includeFamilyCompanion = kind === 'GROUP',
  labelStringRef,
  createdAt = new Date().toISOString()
}) {
  if (!FAMILY_CHANNEL_KINDS.has(kind)) {
    familyFail('FAMILY_CONVERSATION_INPUT_INVALID', 'Family channel kind must be GROUP or PRIVATE');
  }
  const record = validateFamilySpaceConversationRecord(familySpaceRecord);
  const audience = audienceBindings(record, kind, memberPrincipalRefs);
  const companionRef = includeFamilyCompanion === true && record.familyCompanionState === 'ACTIVE'
    ? record.familyCompanionLineageRef
    : null;
  const memberRefs = [
    ...audience.map((member) => member.principalRef),
    ...(companionRef ? [companionRef] : [])
  ];
  const baseChannel = createChannel({ channelRef, threadRef, kind, memberRefs, labelStringRef });
  const binding = Object.freeze({
    schemaVersion: FAMILY_CONVERSATION_BINDING_SCHEMA,
    spaceRef: record.spaceRef,
    familySpaceRecordSha256: record.recordSha256,
    membershipSnapshotRef: familySpaceRecordSnapshotRef(record.recordSha256),
    membershipGeneration: record.membershipGeneration,
    historyVisibilityPolicyRef: FAMILY_HISTORY_FROM_JOIN_POLICY,
    audienceKind: kind,
    audienceMemberBindings: Object.freeze(audience.map(frozenAudienceMember)),
    channelMemberRefs: Object.freeze([...memberRefs]),
    familyCompanionIncluded: companionRef != null,
    familyCompanionLineageRef: companionRef,
    formedAt: familyTime(createdAt, 'createdAt')
  });
  return Object.freeze({
    ...baseChannel,
    memberRefs: Object.freeze([]),
    createdAt: binding.formedAt,
    familySpaceBinding: binding
  });
}

export function createFamilyMessage({
  messageRef,
  channel,
  familySpaceRecord,
  speakerRef,
  speakerPrincipalBindingRef,
  recipientRefs,
  content,
  language = 'en',
  sequence,
  createdAt = new Date().toISOString()
}) {
  const current = assertFamilyChannelCurrent(channel, familySpaceRecord);
  const speaker = current.audienceMembers.find((member) => member.principalRef === speakerRef);
  if (!speaker) {
    familyFail('FAMILY_CONVERSATION_MEMBER_DENIED', `${speakerRef} is not an active admitted human speaker`);
  }
  if (speaker.principalBindingRef !== speakerPrincipalBindingRef) {
    familyFail('FAMILY_CONVERSATION_BINDING_MISMATCH', 'speaker principal binding does not match current Family membership');
  }
  const baseMessage = createMessage({
    messageRef,
    channel: { ...channel, memberRefs: current.binding.channelMemberRefs },
    speakerRef,
    recipientRefs,
    content,
    language,
    sequence,
    createdAt: familyTime(createdAt, 'createdAt')
  });
  const snapshotRef = familySpaceRecordSnapshotRef(current.record.recordSha256);
  return Object.freeze({
    ...baseMessage,
    schemaVersion: FAMILY_CONVERSATION_MESSAGE_SCHEMA,
    spaceRef: current.record.spaceRef,
    membershipSnapshotRef: snapshotRef,
    familySpaceRecordSha256: current.record.recordSha256,
    membershipGeneration: current.record.membershipGeneration,
    speakerMembershipRef: speaker.membershipRef,
    speakerPrincipalBindingRef: speaker.principalBindingRef,
    historyVisibilityPolicyRef: speaker.historyVisibilityPolicyRef,
    familyWitnessBindings: Object.freeze(current.audienceMembers.map(frozenAudienceMember)),
    familyCompanionWitnessRef: current.binding.familyCompanionLineageRef
  });
}

export function contextForFamilyParticipant(
  messages,
  channel,
  familySpaceRecord,
  participantRef,
  participantPrincipalBindingRef
) {
  const current = assertFamilyChannelCurrent(channel, familySpaceRecord);
  const participant = current.audienceMembers.find((member) => member.principalRef === participantRef);
  if (!participant) {
    familyFail('FAMILY_CONVERSATION_MEMBER_DENIED', `${participantRef} is not an active admitted Family participant`);
  }
  if (participant.principalBindingRef !== participantPrincipalBindingRef) {
    familyFail('FAMILY_CONVERSATION_BINDING_MISMATCH', 'participant principal binding does not match current Family membership');
  }
  if (participant.historyVisibilityPolicyRef !== FAMILY_HISTORY_FROM_JOIN_POLICY) {
    familyFail('FAMILY_CONVERSATION_HISTORY_POLICY_UNSUPPORTED', 'participant history policy is not accepted FROM_JOIN');
  }

  return messagesForChannel(messages, channel.channelRef).filter((message) => {
    if (message.spaceRef !== current.record.spaceRef) {
      familyFail('FAMILY_CONVERSATION_RECORD_INVALID', 'Family message spaceRef does not match channel spaceRef');
    }
    familyGeneration(message.membershipGeneration);
    familyTime(message.createdAt, 'message.createdAt');
    familySpaceRecordSha256FromMessage(message);
    if (!Array.isArray(message.witnessRefs)) {
      familyFail('FAMILY_CONVERSATION_RECORD_INVALID', 'Family message witnessRefs are required');
    }
    return message.createdAt >= participant.joinedAt && message.witnessRefs.includes(participantRef);
  });
}


// [VXG RealForever]
