export const SERVER_FAMILY_CONVERSATION_CAPABILITY_SCHEMA =
  'vexlife.server-family-conversation-capability/v1';
export const SERVER_FAMILY_CONVERSATION_BOOTSTRAP_SCHEMA =
  'vexlife.server-family-conversation-bootstrap/v1';
export const SERVER_FAMILY_CONVERSATION_OPERATIONS = Object.freeze([
  'APPEND',
  'READ',
  'READ_THREAD_HISTORY',
  'LIST'
]);

const OPERATION_SET = new Set(SERVER_FAMILY_CONVERSATION_OPERATIONS);
const AUTHORITY_KEYS = new Set(['membership', 'lease', 'currentRevocationGeneration']);
const BOOTSTRAP_KEYS = new Set(['authority']);
const PERFORM_KEYS = new Set(['operation', 'intent', 'authority', 'limit']);
const DEFAULT_LIST_LIMIT = 1000;

export class ServerFamilyConversationCapabilityError extends Error {
  constructor(code, message, httpStatus = 400) {
    super(message);
    this.name = 'ServerFamilyConversationCapabilityError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const fail = (code, message, httpStatus = 400) => {
  throw new ServerFamilyConversationCapabilityError(code, message, httpStatus);
};
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function closedInput(value, allowed, required, label) {
  if (!isObject(value)) fail('SERVER_FAMILY_CONVERSATION_INPUT_INVALID', `${label} must be one object`);
  const extra = Object.keys(value).find((key) => !allowed.has(key));
  if (extra) fail('SERVER_FAMILY_CONVERSATION_UNTRUSTED_FIELD', `${label}.${extra} is not admitted`);
  const missing = [...required].find((key) => !Object.hasOwn(value, key));
  if (missing) fail('SERVER_FAMILY_CONVERSATION_INPUT_INVALID', `${label}.${missing} is required`);
  return value;
}

function validateAuthority(value) {
  closedInput(value, AUTHORITY_KEYS, AUTHORITY_KEYS, 'authority');
  if (!isObject(value.membership) || !isObject(value.lease)) {
    fail('SERVER_FAMILY_CONVERSATION_AUTHORITY_UNAVAILABLE', 'current membership and lease projections are required', 503);
  }
  if (!Number.isSafeInteger(value.currentRevocationGeneration) || value.currentRevocationGeneration < 0) {
    fail('SERVER_FAMILY_CONVERSATION_AUTHORITY_UNAVAILABLE', 'current revocation generation is required', 503);
  }
  return Object.freeze({
    membership: value.membership,
    lease: value.lease,
    currentRevocationGeneration: value.currentRevocationGeneration
  });
}

function currentTime(nowProvider) {
  const now = nowProvider();
  if (typeof now !== 'string' || !Number.isFinite(Date.parse(now)) || new Date(now).toISOString() !== now) {
    fail('SERVER_FAMILY_CONVERSATION_TIME_UNAVAILABLE', 'current server time is unavailable', 503);
  }
  return now;
}

function boundedLimit(value, fallback) {
  const limit = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    fail('SERVER_FAMILY_CONVERSATION_INPUT_INVALID', 'limit must be 1..1000');
  }
  return limit;
}

function familyAudience(binding) {
  if (!Array.isArray(binding?.audienceMemberBindings)) {
    fail('SERVER_FAMILY_CONVERSATION_CHANNEL_INVALID', 'Family channel audience binding is unavailable', 503);
  }
  return Object.freeze(binding.audienceMemberBindings.map((member) => Object.freeze({
    principalRef: member.principalRef,
    role: member.role
  })));
}

function currentChannel({ home, intent, readChannelBinding }) {
  if (!isObject(intent) || typeof intent.channelRef !== 'string' || intent.channelRef.length === 0) {
    fail('SERVER_FAMILY_CONVERSATION_INPUT_INVALID', 'channelRef is required');
  }
  const binding = readChannelBinding({ home, channelRef: intent.channelRef });
  if (binding?.state !== 'CURRENT' || !binding.channel) {
    fail('SERVER_FAMILY_CONVERSATION_CHANNEL_NOT_FOUND', 'Family conversation channel is unavailable', 404);
  }
  return binding.channel;
}

function dependency(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} must be a function`);
  return value;
}

export function createServerFamilyConversationCapability({
  home,
  nowProvider = () => new Date().toISOString(),
  instanceRef,
  appendFamilyMessage,
  readFamilyConversation,
  readFamilyThreadHistory,
  listFamilyChannels,
  readChannelBinding,
  listChannelBindings
} = {}) {
  if (typeof home !== 'string' || home.length === 0) throw new TypeError('home must be a non-empty string');
  if (typeof nowProvider !== 'function') throw new TypeError('nowProvider must be a function');
  if (typeof instanceRef !== 'string' || instanceRef.length === 0) throw new TypeError('instanceRef must be a non-empty string');

  const owners = Object.freeze({
    appendFamilyMessage: dependency(appendFamilyMessage, 'appendFamilyMessage'),
    readFamilyConversation: dependency(readFamilyConversation, 'readFamilyConversation'),
    readFamilyThreadHistory: dependency(readFamilyThreadHistory, 'readFamilyThreadHistory'),
    listFamilyChannels: dependency(listFamilyChannels, 'listFamilyChannels'),
    readChannelBinding: dependency(readChannelBinding, 'readChannelBinding'),
    listChannelBindings: dependency(listChannelBindings, 'listChannelBindings')
  });

  function common(authority, intent) {
    const currentAuthority = validateAuthority(authority);
    return Object.freeze({
      home,
      intent,
      membership: currentAuthority.membership,
      lease: currentAuthority.lease,
      currentRevocationGeneration: currentAuthority.currentRevocationGeneration,
      now: currentTime(nowProvider)
    });
  }

  function bootstrap(input = {}) {
    closedInput(input, BOOTSTRAP_KEYS, BOOTSTRAP_KEYS, 'bootstrap');
    const authority = validateAuthority(input.authority);
    const now = currentTime(nowProvider);
    const durable = owners.listChannelBindings({ home, limit: DEFAULT_LIST_LIMIT });
    const rooms = [];

    for (const channel of durable?.channels ?? []) {
      const binding = channel?.familySpaceBinding;
      if (!binding || binding.audienceKind !== 'GROUP') continue;
      let visible;
      try {
        visible = owners.listFamilyChannels({
          home,
          intent: {
            spaceRef: binding.spaceRef,
            expectedMembershipGeneration: binding.membershipGeneration
          },
          channels: [channel],
          membership: authority.membership,
          lease: authority.lease,
          currentRevocationGeneration: authority.currentRevocationGeneration,
          now
        });
      } catch (error) {
        if (['BROWSER_FAMILY_BRIDGE_STALE', 'BROWSER_FAMILY_BRIDGE_DENIED'].includes(error?.code)) continue;
        throw error;
      }
      if (
        visible?.state !== 'CURRENT'
        || !Array.isArray(visible.channels)
        || visible.channels.length !== 1
        || visible.channels[0].channelRef !== channel.channelRef
      ) continue;
      rooms.push(Object.freeze({
        spaceRef: binding.spaceRef,
        channelRef: channel.channelRef,
        threadRef: channel.threadRef,
        kind: channel.kind,
        membershipGeneration: binding.membershipGeneration,
        audience: familyAudience(binding),
        familyCompanionLineageRef: binding.familyCompanionLineageRef,
        familyCompanionIncluded: binding.familyCompanionIncluded === true
      }));
    }

    rooms.sort((left, right) =>
      left.spaceRef < right.spaceRef ? -1
        : left.spaceRef > right.spaceRef ? 1
          : left.channelRef < right.channelRef ? -1
            : left.channelRef > right.channelRef ? 1 : 0
    );

    return Object.freeze({
      schemaVersion: SERVER_FAMILY_CONVERSATION_BOOTSTRAP_SCHEMA,
      state: rooms.length > 0 ? 'CURRENT' : 'EMPTY',
      truthClass: 'CURRENT_LIVE_FAMILY',
      currentPrincipalRef: authority.membership.principalRef,
      rooms: Object.freeze(rooms)
    });
  }

  function perform(input = {}) {
    closedInput(input, PERFORM_KEYS, new Set(['operation', 'intent', 'authority']), 'perform');
    if (!OPERATION_SET.has(input.operation)) {
      fail('SERVER_FAMILY_CONVERSATION_OPERATION_NOT_ADMITTED', 'Family Conversation operation is not admitted');
    }
    if (!isObject(input.intent)) {
      fail('SERVER_FAMILY_CONVERSATION_INPUT_INVALID', 'semantic intent must be one object');
    }
    const base = common(input.authority, input.intent);

    if (input.operation === 'APPEND') {
      return owners.appendFamilyMessage({
        ...base,
        channel: currentChannel({ home, intent: input.intent, readChannelBinding: owners.readChannelBinding }),
        instanceRef
      });
    }
    if (input.operation === 'READ') {
      return owners.readFamilyConversation({
        ...base,
        channel: currentChannel({ home, intent: input.intent, readChannelBinding: owners.readChannelBinding }),
        limit: boundedLimit(input.limit, 100)
      });
    }
    if (input.operation === 'READ_THREAD_HISTORY') {
      return owners.readFamilyThreadHistory({
        ...base,
        channel: currentChannel({ home, intent: input.intent, readChannelBinding: owners.readChannelBinding }),
        limit: boundedLimit(input.limit, 200)
      });
    }

    const bindings = owners.listChannelBindings({ home, limit: boundedLimit(input.limit, DEFAULT_LIST_LIMIT) });
    return owners.listFamilyChannels({
      ...base,
      channels: bindings?.channels ?? []
    });
  }

  return Object.freeze({
    schemaVersion: SERVER_FAMILY_CONVERSATION_CAPABILITY_SCHEMA,
    bootstrap,
    perform
  });
}

// [VXG RealForever]
