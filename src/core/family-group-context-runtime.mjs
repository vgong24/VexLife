import {
  FAMILY_HISTORY_FROM_JOIN_POLICY,
  contextForFamilyParticipant,
  familySpaceRecordSnapshotRef
} from './family-conversation.mjs';
import { readFamilySpace } from './family-space-store.mjs';
import {
  readConversationChannel,
  readConversationChannelBinding
} from './conversation-store.mjs';
import { createContextLease } from './context-lease.mjs';
import { semanticHash } from './utils.mjs';

export const FAMILY_GROUP_FRONTIER_SCHEMA = 'vexlife.family-group-conversation-frontier/v1';
export const FAMILY_GROUP_FRONTIER_CURRENTNESS = 'CURRENT';
export const FAMILY_GROUP_FRONTIER_ADVANCED = 'FRONTIER_ADVANCED_DURING_INFERENCE';

const REF = /^[a-z0-9](?:[a-z0-9._-]{0,220}[a-z0-9])?$/u;
const SHA = /^[0-9a-f]{64}$/u;

export class FamilyGroupContextError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'FamilyGroupContextError';
    this.code = code;
    this.details = details;
  }
}

const fail = (code, message, details = null) => {
  throw new FamilyGroupContextError(code, message, details);
};
const ref = (value, label) => {
  if (typeof value !== 'string' || !REF.test(value)) {
    fail('FAMILY_GROUP_CONTEXT_INPUT_INVALID', `${label} must be one portable lowercase stable ref`);
  }
  return value;
};
const time = (value, label) => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail('FAMILY_GROUP_CONTEXT_INPUT_INVALID', `${label} must be canonical ISO-8601 UTC`);
  }
  return value;
};
const positiveBound = (value, label, maximum) => {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    fail('FAMILY_GROUP_CONTEXT_INPUT_INVALID', `${label} must be an integer in 1..${maximum}`);
  }
  return value;
};
const canonicalRefs = (values) => [...new Set(values)].sort();
const sameOrderedRefs = (left, right) =>
  Array.isArray(left)
  && Array.isArray(right)
  && left.length === right.length
  && left.every((value, index) => value === right[index]);

function estimateContentTokens(content) {
  const bytes = Buffer.byteLength(String(content ?? ''), 'utf8');
  return Math.max(1, Math.ceil(bytes / 4));
}

function readCurrentOwners({ home, spaceRef, channelRef }) {
  const family = readFamilySpace({ home, spaceRef });
  if (family.state !== 'CURRENT' || !family.record) {
    fail('FAMILY_GROUP_CONTEXT_FAMILY_NOT_FOUND', 'current Family Space record is unavailable');
  }
  const channelBinding = readConversationChannelBinding({ home, channelRef });
  if (channelBinding.state !== 'CURRENT' || !channelBinding.channel || !channelBinding.record) {
    fail('FAMILY_GROUP_CONTEXT_CHANNEL_NOT_FOUND', 'durable Family channel binding is unavailable');
  }
  const channel = channelBinding.channel;
  const binding = channel.familySpaceBinding;
  if (!binding || channel.kind !== 'GROUP' || binding.audienceKind !== 'GROUP') {
    fail('FAMILY_GROUP_CONTEXT_CHANNEL_DENIED', 'Family group context requires one canonical GROUP Family channel');
  }
  if (
    binding.spaceRef !== family.record.spaceRef
    || binding.familySpaceRecordSha256 !== family.record.recordSha256
    || binding.membershipGeneration !== family.record.membershipGeneration
  ) {
    fail('FAMILY_GROUP_CONTEXT_STALE', 'durable Family channel binding is not current with Family Space');
  }
  if (
    family.record.familyCompanionState !== 'ACTIVE'
    || !family.record.familyCompanionLineageRef
    || binding.familyCompanionIncluded !== true
    || binding.familyCompanionLineageRef !== family.record.familyCompanionLineageRef
  ) {
    fail('FAMILY_GROUP_CONTEXT_STALE', 'Family Vex lineage is not current on the group channel');
  }
  if (binding.historyVisibilityPolicyRef !== FAMILY_HISTORY_FROM_JOIN_POLICY) {
    fail('FAMILY_GROUP_CONTEXT_HISTORY_POLICY_UNSUPPORTED', 'only source-managed FROM_JOIN Family history is admitted');
  }
  return { family: family.record, channel, channelRecord: channelBinding.record };
}

function currentRequestMember(familyRecord, requestPrincipalRef, requestPrincipalBindingRef) {
  const member = familyRecord.members.find((candidate) => candidate.principalRef === requestPrincipalRef);
  if (!member || member.status !== 'ACTIVE') {
    fail('FAMILY_GROUP_CONTEXT_MEMBER_DENIED', 'request principal is not an active Family member');
  }
  if (member.principalBindingRef !== requestPrincipalBindingRef) {
    fail('FAMILY_GROUP_CONTEXT_BINDING_MISMATCH', 'request principal binding is not current');
  }
  if (member.historyVisibilityPolicyRef !== FAMILY_HISTORY_FROM_JOIN_POLICY) {
    fail('FAMILY_GROUP_CONTEXT_HISTORY_POLICY_UNSUPPORTED', 'request principal lacks accepted FROM_JOIN history');
  }
  return member;
}

function assertCanonicalFamilyEvent(event, family, channel) {
  const binding = channel.familySpaceBinding;
  if (
    event.spaceRef !== family.spaceRef
    || event.threadRef !== channel.threadRef
    || event.channelRef !== channel.channelRef
    || event.membershipGeneration !== family.membershipGeneration
    || event.membershipSnapshotRef !== familySpaceRecordSnapshotRef(family.recordSha256)
  ) {
    fail('FAMILY_GROUP_CONTEXT_SOURCE_INVALID', 'durable Family event is not bound to the exact current Family source identity');
  }
  if (!sameOrderedRefs(event.witnessRefs, binding.channelMemberRefs)) {
    fail('FAMILY_GROUP_CONTEXT_SOURCE_INVALID', 'durable Family event witnesses do not match the exact channel audience');
  }
  if (!Array.isArray(event.recipientRefs) || event.recipientRefs.some((recipientRef) => !binding.channelMemberRefs.includes(recipientRef))) {
    fail('FAMILY_GROUP_CONTEXT_SOURCE_INVALID', 'durable Family event recipients escape the exact channel audience');
  }
  const humanSpeaker = binding.audienceMemberBindings.find((member) => member.principalRef === event.speakerRef);
  const companionSpeaker = event.speakerRef === binding.familyCompanionLineageRef;
  if (!humanSpeaker && !companionSpeaker) {
    fail('FAMILY_GROUP_CONTEXT_MEMBER_DENIED', 'durable Family event speaker is not an admitted Family human or exact Family Vex lineage');
  }
  return event;
}

function selectedBinding(event) {
  if (!SHA.test(event.eventSha256 ?? '')) {
    fail('FAMILY_GROUP_CONTEXT_SOURCE_INVALID', 'selected conversation event lacks exact event identity');
  }
  return Object.freeze({
    messageRef: ref(event.messageRef, 'messageRef'),
    speakerRef: ref(event.speakerRef, 'speakerRef'),
    recipientRefs: Object.freeze([...event.recipientRefs]),
    witnessRefs: Object.freeze([...event.witnessRefs]),
    contentHash: event.contentHash,
    eventSha256: event.eventSha256,
    sequence: event.sequence,
    membershipGeneration: event.membershipGeneration,
    createdAt: event.createdAt
  });
}

function frontierCore({
  family,
  channel,
  requestMember,
  requestPrincipalRef,
  trigger,
  selected,
  inputTokenEstimate,
  maxMessages,
  maxInputTokens,
  formedAt
}) {
  const selectedMessageBindings = Object.freeze(selected.map(selectedBinding));
  const last = selectedMessageBindings.at(-1) ?? null;
  return {
    schemaVersion: FAMILY_GROUP_FRONTIER_SCHEMA,
    spaceRef: family.spaceRef,
    threadRef: channel.threadRef,
    channelRef: channel.channelRef,
    familyCompanionLineageRef: family.familyCompanionLineageRef,
    familySpaceRecordSha256: family.recordSha256,
    membershipGeneration: family.membershipGeneration,
    requestPrincipalRef,
    requestPrincipalBindingRef: requestMember.principalBindingRef,
    triggerMessageRef: trigger.messageRef,
    triggerMessageHash: trigger.eventSha256,
    selectedMessageBindings,
    lastIncludedMessageRef: last?.messageRef ?? trigger.messageRef,
    lastIncludedMessageHash: last?.eventSha256 ?? trigger.eventSha256,
    historyVisibilityPolicyRef: FAMILY_HISTORY_FROM_JOIN_POLICY,
    maxMessages,
    maxInputTokens,
    inputTokenEstimate,
    formedAt,
    currentness: FAMILY_GROUP_FRONTIER_CURRENTNESS,
    sourceRefs: Object.freeze(canonicalRefs(selectedMessageBindings.map((message) => message.messageRef)))
  };
}

export function formFamilyGroupFrontier({
  home,
  spaceRef,
  channelRef,
  triggerMessageRef,
  expectedMembershipGeneration,
  maxMessages = 64,
  maxInputTokens = 4096,
  formedAt = new Date().toISOString()
} = {}) {
  const space = ref(spaceRef, 'spaceRef');
  const channelId = ref(channelRef, 'channelRef');
  const triggerRef = ref(triggerMessageRef, 'triggerMessageRef');
  const at = time(formedAt, 'formedAt');
  const messageBound = positiveBound(maxMessages, 'maxMessages', 1000);
  const tokenBound = positiveBound(maxInputTokens, 'maxInputTokens', 1_000_000);

  const { family, channel } = readCurrentOwners({ home, spaceRef: space, channelRef: channelId });
  if (!Number.isSafeInteger(expectedMembershipGeneration) || expectedMembershipGeneration < 0) {
    fail('FAMILY_GROUP_CONTEXT_INPUT_INVALID', 'expectedMembershipGeneration must be a non-negative safe integer');
  }
  if (family.membershipGeneration !== expectedMembershipGeneration) {
    fail('FAMILY_GROUP_CONTEXT_STALE', 'expected Family membership generation is stale');
  }

  const projection = readConversationChannel({ home, channelRef: channelId, limit: 1000 });
  if (projection.state !== 'CURRENT' || !Array.isArray(projection.messages)) {
    fail('FAMILY_GROUP_CONTEXT_EMPTY', 'Family group conversation has no current message frontier');
  }
  if (projection.truncated) {
    fail('FAMILY_GROUP_CONTEXT_BOUNDS_EXCEEDED', 'conversation exceeds the maximum verifiable durable read bound');
  }
  for (const event of projection.messages) assertCanonicalFamilyEvent(event, family, channel);
  const trigger = projection.messages.find((event) => event.messageRef === triggerRef);
  if (!trigger) {
    fail('FAMILY_GROUP_CONTEXT_TRIGGER_NOT_FOUND', 'trigger message is not in the exact current channel lineage');
  }
  const requestPrincipalRef = ref(trigger.speakerRef, 'trigger.speakerRef');
  const boundSpeaker = channel.familySpaceBinding.audienceMemberBindings
    .find((member) => member.principalRef === requestPrincipalRef);
  if (!boundSpeaker) {
    fail('FAMILY_GROUP_CONTEXT_MEMBER_DENIED', 'trigger speaker is not in the admitted Family audience');
  }
  const requestMember = currentRequestMember(family, requestPrincipalRef, boundSpeaker.principalBindingRef);

  const visible = contextForFamilyParticipant(
    projection.messages,
    channel,
    family,
    requestPrincipalRef,
    requestMember.principalBindingRef
  ).filter((event) => event.createdAt <= at);

  const selectedTriggerCount = visible.filter((event) => event.messageRef === triggerRef).length;
  if (selectedTriggerCount !== 1) {
    fail('FAMILY_GROUP_CONTEXT_TRIGGER_INVALID', 'trigger message must appear exactly once in the current visible frontier');
  }
  if (visible.length > messageBound) {
    fail('FAMILY_GROUP_CONTEXT_BOUNDS_EXCEEDED', 'visible Family frontier exceeds maxMessages');
  }
  const inputTokenEstimate = visible.reduce((sum, event) => sum + estimateContentTokens(event.content), 0);
  if (inputTokenEstimate > tokenBound) {
    fail('FAMILY_GROUP_CONTEXT_BOUNDS_EXCEEDED', 'visible Family frontier exceeds maxInputTokens');
  }

  const core = frontierCore({
    family,
    channel,
    requestMember,
    requestPrincipalRef,
    trigger,
    selected: visible,
    inputTokenEstimate,
    maxMessages: messageBound,
    maxInputTokens: tokenBound,
    formedAt: at
  });
  const frontierSha256 = semanticHash(core);
  return Object.freeze({
    ...core,
    frontierRef: `frontier.vex-family.${frontierSha256}`,
    frontierSha256
  });
}

function assertFrontierIdentity(frontier) {
  if (!frontier || frontier.schemaVersion !== FAMILY_GROUP_FRONTIER_SCHEMA || !SHA.test(frontier.frontierSha256 ?? '')) {
    fail('FAMILY_GROUP_CONTEXT_FRONTIER_INVALID', 'Family frontier identity is invalid');
  }
  const core = structuredClone(frontier);
  delete core.frontierRef;
  delete core.frontierSha256;
  const expected = semanticHash(core);
  if (frontier.frontierSha256 !== expected || frontier.frontierRef !== `frontier.vex-family.${expected}`) {
    fail('FAMILY_GROUP_CONTEXT_FRONTIER_INVALID', 'Family frontier fingerprint does not match exact frontier bytes');
  }
}

export function verifyFamilyGroupFrontierCurrent({ home, frontier, observedAt = new Date().toISOString() } = {}) {
  assertFrontierIdentity(frontier);
  const at = time(observedAt, 'observedAt');
  const { family, channel } = readCurrentOwners({
    home,
    spaceRef: frontier.spaceRef,
    channelRef: frontier.channelRef
  });
  if (
    family.recordSha256 !== frontier.familySpaceRecordSha256
    || family.membershipGeneration !== frontier.membershipGeneration
    || family.familyCompanionLineageRef !== frontier.familyCompanionLineageRef
  ) {
    fail('FAMILY_GROUP_CONTEXT_STALE', 'Family frontier owner identity is no longer current');
  }
  currentRequestMember(family, frontier.requestPrincipalRef, frontier.requestPrincipalBindingRef);

  const projection = readConversationChannel({ home, channelRef: frontier.channelRef, limit: 1000 });
  if (projection.state !== 'CURRENT' || projection.truncated) {
    fail('FAMILY_GROUP_CONTEXT_STALE', 'Family frontier channel lineage is unavailable or no longer bounded');
  }
  for (const event of projection.messages) assertCanonicalFamilyEvent(event, family, channel);
  const byRef = new Map(projection.messages.map((event) => [event.messageRef, event]));
  for (const binding of frontier.selectedMessageBindings) {
    const event = byRef.get(binding.messageRef);
    if (
      !event
      || event.eventSha256 !== binding.eventSha256
      || event.contentHash !== binding.contentHash
      || event.speakerRef !== binding.speakerRef
      || event.sequence !== binding.sequence
    ) {
      fail('FAMILY_GROUP_CONTEXT_STALE', 'selected Family source event changed or disappeared');
    }
  }
  const trigger = byRef.get(frontier.triggerMessageRef);
  if (!trigger || trigger.eventSha256 !== frontier.triggerMessageHash) {
    fail('FAMILY_GROUP_CONTEXT_STALE', 'trigger message identity is no longer current');
  }

  const lastSequence = frontier.selectedMessageBindings.at(-1)?.sequence ?? trigger.sequence;
  const advanced = projection.messages.find((event) => event.sequence > lastSequence);
  if (advanced) {
    return Object.freeze({
      state: FAMILY_GROUP_FRONTIER_ADVANCED,
      frontierRef: frontier.frontierRef,
      frontierSha256: frontier.frontierSha256,
      latestMessageRef: projection.head?.messageRef ?? null,
      advancedMessageRef: advanced.messageRef,
      verifiedAt: at
    });
  }

  const reproduced = formFamilyGroupFrontier({
    home,
    spaceRef: frontier.spaceRef,
    channelRef: frontier.channelRef,
    triggerMessageRef: frontier.triggerMessageRef,
    expectedMembershipGeneration: frontier.membershipGeneration,
    maxMessages: frontier.maxMessages,
    maxInputTokens: frontier.maxInputTokens,
    formedAt: frontier.formedAt
  });
  if (reproduced.frontierSha256 !== frontier.frontierSha256) {
    fail('FAMILY_GROUP_CONTEXT_STALE', 'Family frontier no longer reproduces the exact current authorized selection');
  }

  return Object.freeze({
    state: FAMILY_GROUP_FRONTIER_CURRENTNESS,
    frontierRef: frontier.frontierRef,
    frontierSha256: frontier.frontierSha256,
    latestMessageRef: projection.head?.messageRef ?? null,
    advancedMessageRef: null,
    verifiedAt: at
  });
}

export function createFamilyGroupContextLease({
  home,
  frontier,
  leaseInput,
  observedAt = leaseInput?.observedAt
} = {}) {
  assertFrontierIdentity(frontier);
  const verification = verifyFamilyGroupFrontierCurrent({ home, frontier, observedAt });
  if (verification.state !== FAMILY_GROUP_FRONTIER_CURRENTNESS) {
    fail(
      'FAMILY_GROUP_CONTEXT_ADVANCED',
      'Family conversation advanced after frontier formation; re-form a fresh frontier before leasing',
      { advancedMessageRef: verification.advancedMessageRef }
    );
  }
  if (!leaseInput || typeof leaseInput !== 'object' || Array.isArray(leaseInput)) {
    fail('FAMILY_GROUP_CONTEXT_INPUT_INVALID', 'leaseInput must be one Context Lease input object');
  }
  const selectedSourceRefs = frontier.selectedMessageBindings.map((message) => message.messageRef);
  const result = createContextLease({
    ...leaseInput,
    selectedSourceRefs,
    inputTokenEstimate: frontier.inputTokenEstimate,
    familyGroupFrontierRef: frontier.frontierRef,
    familyGroupFrontierSha256: frontier.frontierSha256
  });
  return Object.freeze({
    ...result,
    frontierRef: frontier.frontierRef,
    frontierSha256: frontier.frontierSha256,
    currentnessWitness: verification
  });
}

// [VXG RealForever]
