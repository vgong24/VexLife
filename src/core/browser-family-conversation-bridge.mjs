import { evaluateRemoteRequest } from './home-bridge.mjs';
import {
  FamilySpaceStoreError,
  readFamilySpace
} from './family-space-store.mjs';
import {
  FamilyConversationError,
  createFamilyMessage,
  contextForFamilyParticipant
} from './family-conversation.mjs';
import {
  ConversationStoreError,
  appendConversationMessage,
  readConversationChannel,
  readConversationMessage
} from './conversation-store.mjs';
import { semanticHash } from './utils.mjs';

export const BROWSER_FAMILY_CONVERSATION_BRIDGE_SCHEMA = 'vexlife.browser-family-conversation-bridge/v1';
export const BROWSER_FAMILY_CONVERSATION_ACTIONS = Object.freeze({
  APPEND: 'action.vex-family.conversation.append',
  READ: 'action.vex-family.conversation.read',
  LIST: 'action.vex-family.conversation.list'
});

const ACTION_REFS = Object.freeze(Object.values(BROWSER_FAMILY_CONVERSATION_ACTIONS));
const APPEND_INTENT_FIELDS = new Set([
  'spaceRef',
  'channelRef',
  'content',
  'expectedMembershipGeneration',
  'idempotencyKey'
]);
const READ_INTENT_FIELDS = new Set([
  'spaceRef',
  'channelRef',
  'expectedMembershipGeneration'
]);
const LIST_INTENT_FIELDS = new Set([
  'spaceRef',
  'expectedMembershipGeneration'
]);

export class BrowserFamilyConversationBridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BrowserFamilyConversationBridgeError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new BrowserFamilyConversationBridgeError(code, message);
};

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function exactIntent(intent, allowedFields, { requireChannel = false, requireContent = false } = {}) {
  if (!isObject(intent)) fail('BROWSER_FAMILY_BRIDGE_INPUT_INVALID', 'Family browser intent must be an object');
  for (const key of Object.keys(intent)) {
    if (!allowedFields.has(key)) {
      fail('BROWSER_FAMILY_BRIDGE_UNTRUSTED_FIELD', 'Family browser intent contains an untrusted authority field');
    }
  }
  if (typeof intent.spaceRef !== 'string' || !intent.spaceRef) {
    fail('BROWSER_FAMILY_BRIDGE_INPUT_INVALID', 'spaceRef is required');
  }
  if (requireChannel && (typeof intent.channelRef !== 'string' || !intent.channelRef)) {
    fail('BROWSER_FAMILY_BRIDGE_INPUT_INVALID', 'channelRef is required');
  }
  if (!Number.isSafeInteger(intent.expectedMembershipGeneration) || intent.expectedMembershipGeneration < 0) {
    fail('BROWSER_FAMILY_BRIDGE_INPUT_INVALID', 'expectedMembershipGeneration must be a non-negative safe integer');
  }
  if (requireContent) {
    if (typeof intent.content !== 'string' || intent.content.length === 0) {
      fail('BROWSER_FAMILY_BRIDGE_INPUT_INVALID', 'content is required');
    }
    if (typeof intent.idempotencyKey !== 'string' || intent.idempotencyKey.length === 0 || intent.idempotencyKey.length > 512) {
      fail('BROWSER_FAMILY_BRIDGE_INPUT_INVALID', 'idempotencyKey must be a non-empty bounded string');
    }
  }
  return intent;
}

function bridgeRequestRef(actionRef, membership, intent) {
  return `request.vex-family.browser.${semanticHash({
    schemaVersion: BROWSER_FAMILY_CONVERSATION_BRIDGE_SCHEMA,
    actionRef,
    deviceRef: membership?.deviceRef ?? null,
    principalRef: membership?.principalRef ?? null,
    spaceRef: intent.spaceRef,
    channelRef: intent.channelRef ?? null,
    idempotencyKey: intent.idempotencyKey ?? null
  }).slice(0, 32)}`;
}

function admitHomePrincipal({ actionRef, intent, membership, lease, currentRevocationGeneration, now }) {
  if (!isObject(membership) || !isObject(lease)) {
    fail('BROWSER_FAMILY_BRIDGE_DENIED', 'Trusted device membership and capability lease are required');
  }
  const request = {
    requestRef: bridgeRequestRef(actionRef, membership, intent),
    deviceRef: membership.deviceRef,
    leaseRef: lease.leaseRef,
    channelRef: intent.channelRef ?? 'channel.vex-family.list',
    speakerRef: membership.principalRef,
    actionRef,
    idempotencyKey: intent.idempotencyKey ?? null
  };
  const admission = evaluateRemoteRequest({
    request,
    membership,
    lease,
    now,
    currentRevocationGeneration,
    registeredActionRefs: ACTION_REFS,
    requiredCapabilityRefs: [],
    rawModelEndpointExposed: false
  });
  if (admission.state !== 'REMOTE_REQUEST_ADMITTED') {
    fail('BROWSER_FAMILY_BRIDGE_DENIED', 'Trusted Home Bridge request admission failed');
  }
  return admission.principalRef;
}

function currentFamilyMember({ home, intent, principalRef }) {
  const snapshot = readFamilySpace({ home, spaceRef: intent.spaceRef });
  if (snapshot.state !== 'CURRENT' || !snapshot.record) {
    fail('BROWSER_FAMILY_BRIDGE_NOT_FOUND', 'Family Space is unavailable');
  }
  const record = snapshot.record;
  if (record.membershipGeneration !== intent.expectedMembershipGeneration) {
    fail('BROWSER_FAMILY_BRIDGE_STALE', 'Family membership generation is stale');
  }
  const member = record.members.find((candidate) => candidate.principalRef === principalRef && candidate.status === 'ACTIVE');
  if (!member) {
    fail('BROWSER_FAMILY_BRIDGE_DENIED', 'Authenticated principal is not a current active Family member');
  }
  return Object.freeze({ record, member });
}

function assertChannelIdentity(channel, intent) {
  if (!isObject(channel) || channel.channelRef !== intent.channelRef) {
    fail('BROWSER_FAMILY_BRIDGE_DENIED', 'Requested channel does not match the trusted Family channel');
  }
  if (channel.familySpaceBinding?.spaceRef !== intent.spaceRef) {
    fail('BROWSER_FAMILY_BRIDGE_DENIED', 'Requested Family Space does not match the trusted Family channel');
  }
  const bindings = channel.familySpaceBinding?.audienceMemberBindings;
  const principalRefs = Array.isArray(bindings) ? bindings.map((binding) => binding?.principalRef) : [];
  if (
    principalRefs.length < 2
    || principalRefs.some((principalRef) => typeof principalRef !== 'string')
    || new Set(principalRefs).size !== principalRefs.length
  ) {
    fail('BROWSER_FAMILY_BRIDGE_DENIED', 'Trusted Family channel audience must contain distinct human principals');
  }
}

function visibleToCurrentMember(messages, channel, record, member) {
  return contextForFamilyParticipant(
    messages,
    channel,
    record,
    member.principalRef,
    member.principalBindingRef
  );
}

function currentHumanRecipients(channel, speakerRef) {
  const bindings = channel?.familySpaceBinding?.audienceMemberBindings;
  if (!Array.isArray(bindings)) {
    fail('BROWSER_FAMILY_BRIDGE_DENIED', 'Trusted Family channel lacks an audience binding');
  }
  const recipients = bindings
    .map((binding) => binding?.principalRef)
    .filter((principalRef) => typeof principalRef === 'string' && principalRef !== speakerRef);
  if (new Set(recipients).size !== recipients.length || recipients.length === 0) {
    fail('BROWSER_FAMILY_BRIDGE_DENIED', 'Trusted Family channel does not expose a valid human recipient set');
  }
  return recipients;
}

function deterministicMessageRef(intent, principalRef) {
  return `message.vex-family.browser.${semanticHash({
    schemaVersion: 'vexlife.browser-family-message-identity/v1',
    spaceRef: intent.spaceRef,
    channelRef: intent.channelRef,
    principalRef,
    idempotencyKey: intent.idempotencyKey
  }).slice(0, 32)}`;
}

function safeMessage(event) {
  return Object.freeze({
    messageRef: event.messageRef,
    spaceRef: event.spaceRef,
    threadRef: event.threadRef,
    channelRef: event.channelRef,
    speakerRef: event.speakerRef,
    recipientRefs: Object.freeze([...(event.recipientRefs ?? [])]),
    membershipGeneration: event.membershipGeneration,
    sequence: event.sequence,
    content: event.content,
    contentHash: event.contentHash,
    createdAt: event.createdAt
  });
}

function sameRetryIntent(event, { intent, member, channel }) {
  const expectedRecipients = currentHumanRecipients(channel, member.principalRef);
  const expectedContentHash = semanticHash(intent.content);
  return event.spaceRef === intent.spaceRef
    && event.channelRef === intent.channelRef
    && event.speakerRef === member.principalRef
    && event.membershipGeneration === intent.expectedMembershipGeneration
    && event.contentHash === expectedContentHash
    && JSON.stringify(event.recipientRefs) === JSON.stringify(expectedRecipients);
}

function sanitizeOwnerError(error) {
  if (error instanceof BrowserFamilyConversationBridgeError) throw error;
  if (error instanceof FamilyConversationError) {
    if (error.code === 'FAMILY_CONVERSATION_STALE') {
      fail('BROWSER_FAMILY_BRIDGE_STALE', 'Family conversation binding is stale');
    }
    fail('BROWSER_FAMILY_BRIDGE_DENIED', 'Family conversation admission failed');
  }
  if (error instanceof FamilySpaceStoreError) {
    fail('BROWSER_FAMILY_BRIDGE_FAMILY_SPACE_UNAVAILABLE', 'Family Space currentness could not be established');
  }
  if (error instanceof ConversationStoreError) {
    fail('BROWSER_FAMILY_BRIDGE_STORE_UNAVAILABLE', 'Conversation Store operation could not be completed');
  }
  throw error;
}

export function appendBrowserFamilyMessage({
  home,
  intent,
  channel,
  membership,
  lease,
  currentRevocationGeneration,
  now,
  instanceRef
} = {}) {
  try {
    const currentIntent = exactIntent(intent, APPEND_INTENT_FIELDS, { requireChannel: true, requireContent: true });
    assertChannelIdentity(channel, currentIntent);
    const principalRef = admitHomePrincipal({
      actionRef: BROWSER_FAMILY_CONVERSATION_ACTIONS.APPEND,
      intent: currentIntent,
      membership,
      lease,
      currentRevocationGeneration,
      now
    });
    const { record, member } = currentFamilyMember({ home, intent: currentIntent, principalRef });
    visibleToCurrentMember([], channel, record, member);

    const messageRef = deterministicMessageRef(currentIntent, member.principalRef);
    const existing = readConversationMessage({ home, channelRef: currentIntent.channelRef, messageRef });
    if (existing.state === 'CURRENT') {
      if (!sameRetryIntent(existing.event, { intent: currentIntent, member, channel })) {
        fail('BROWSER_FAMILY_BRIDGE_IDEMPOTENCY_CONFLICT', 'idempotencyKey is already bound to different canonical message content');
      }
      visibleToCurrentMember([existing.event], channel, record, member);
      return Object.freeze({
        schemaVersion: BROWSER_FAMILY_CONVERSATION_BRIDGE_SCHEMA,
        state: 'IDEMPOTENT_CURRENT',
        message: safeMessage(existing.event)
      });
    }

    const projection = readConversationChannel({ home, channelRef: currentIntent.channelRef, limit: 1 });
    const sequence = projection.head ? projection.head.sequence + 1 : 0;
    const message = createFamilyMessage({
      messageRef,
      channel,
      familySpaceRecord: record,
      speakerRef: member.principalRef,
      speakerPrincipalBindingRef: member.principalBindingRef,
      recipientRefs: currentHumanRecipients(channel, member.principalRef),
      content: currentIntent.content,
      sequence,
      createdAt: now
    });
    const appended = appendConversationMessage({
      home,
      message,
      instanceRef,
      observedAt: now
    });
    return Object.freeze({
      schemaVersion: BROWSER_FAMILY_CONVERSATION_BRIDGE_SCHEMA,
      state: appended.state,
      message: safeMessage(appended.event)
    });
  } catch (error) {
    return sanitizeOwnerError(error);
  }
}

export function readBrowserFamilyConversation({
  home,
  intent,
  channel,
  membership,
  lease,
  currentRevocationGeneration,
  now,
  limit = 100
} = {}) {
  try {
    const currentIntent = exactIntent(intent, READ_INTENT_FIELDS, { requireChannel: true });
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
      fail('BROWSER_FAMILY_BRIDGE_INPUT_INVALID', 'limit must be 1..1000');
    }
    assertChannelIdentity(channel, currentIntent);
    const principalRef = admitHomePrincipal({
      actionRef: BROWSER_FAMILY_CONVERSATION_ACTIONS.READ,
      intent: currentIntent,
      membership,
      lease,
      currentRevocationGeneration,
      now
    });
    const { record, member } = currentFamilyMember({ home, intent: currentIntent, principalRef });
    const projection = readConversationChannel({ home, channelRef: currentIntent.channelRef, limit });
    const visible = visibleToCurrentMember(projection.messages, channel, record, member);
    return Object.freeze({
      schemaVersion: BROWSER_FAMILY_CONVERSATION_BRIDGE_SCHEMA,
      state: projection.state,
      channelRef: currentIntent.channelRef,
      messages: Object.freeze(visible.map(safeMessage)),
      truncated: projection.truncated
    });
  } catch (error) {
    return sanitizeOwnerError(error);
  }
}

export function listBrowserFamilyChannels({
  home,
  intent,
  channels,
  membership,
  lease,
  currentRevocationGeneration,
  now
} = {}) {
  try {
    const currentIntent = exactIntent(intent, LIST_INTENT_FIELDS);
    if (!Array.isArray(channels)) {
      fail('BROWSER_FAMILY_BRIDGE_INPUT_INVALID', 'trusted channels must be an array');
    }
    const principalRef = admitHomePrincipal({
      actionRef: BROWSER_FAMILY_CONVERSATION_ACTIONS.LIST,
      intent: currentIntent,
      membership,
      lease,
      currentRevocationGeneration,
      now
    });
    const { record, member } = currentFamilyMember({ home, intent: currentIntent, principalRef });
    const visible = [];
    for (const channel of channels) {
      if (!isObject(channel) || channel.familySpaceBinding?.spaceRef !== currentIntent.spaceRef) continue;
      try {
        visibleToCurrentMember([], channel, record, member);
      } catch (error) {
        if (error instanceof FamilyConversationError) continue;
        throw error;
      }
      visible.push(Object.freeze({
        channelRef: channel.channelRef,
        threadRef: channel.threadRef,
        kind: channel.kind
      }));
    }
    return Object.freeze({
      schemaVersion: BROWSER_FAMILY_CONVERSATION_BRIDGE_SCHEMA,
      state: 'CURRENT',
      channels: Object.freeze(visible)
    });
  } catch (error) {
    return sanitizeOwnerError(error);
  }
}

// [VXG RealForever]
