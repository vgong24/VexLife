import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SERVER_FAMILY_CONVERSATION_BOOTSTRAP_SCHEMA,
  SERVER_FAMILY_CONVERSATION_CAPABILITY_SCHEMA,
  ServerFamilyConversationCapabilityError,
  createServerFamilyConversationCapability
} from '../src/core/server-family-conversation-capability.mjs';

const NOW = '2026-10-19T09:58:00.000Z';

function authority(overrides = {}) {
  return {
    membership: { principalRef: 'person.victor', deviceRef: 'device.android' },
    lease: { leaseRef: 'lease.current' },
    currentRevocationGeneration: 7,
    ...overrides
  };
}

function groupChannel(overrides = {}) {
  return {
    channelRef: 'channel.family.group',
    threadRef: 'thread.family.group',
    kind: 'GROUP',
    familySpaceBinding: {
      spaceRef: 'space.family.current',
      audienceKind: 'GROUP',
      membershipGeneration: 4,
      audienceMemberBindings: [
        { principalRef: 'person.victor', role: 'MEMBER' },
        { principalRef: 'person.alex', role: 'MEMBER' }
      ],
      familyCompanionLineageRef: 'companion.family.current',
      familyCompanionIncluded: true
    },
    ...overrides
  };
}

function harness(overrides = {}) {
  const calls = [];
  const channel = groupChannel();
  const owners = {
    appendFamilyMessage: (input) => { calls.push(['APPEND', input]); return { state: 'APPENDED', message: { messageRef: 'message.1' } }; },
    readFamilyConversation: (input) => { calls.push(['READ', input]); return { state: 'CURRENT', messages: [] }; },
    readFamilyThreadHistory: (input) => { calls.push(['READ_THREAD_HISTORY', input]); return { state: 'CURRENT', messages: [] }; },
    listFamilyChannels: (input) => { calls.push(['LIST', input]); return { state: 'CURRENT', channels: input.channels.map((item) => ({ channelRef: item.channelRef })) }; },
    readChannelBinding: ({ channelRef }) => channelRef === channel.channelRef ? { state: 'CURRENT', channel } : { state: 'ABSENT', channel: null },
    listChannelBindings: () => ({ state: 'CURRENT', channels: [channel, { channelRef: 'channel.non-family', kind: 'DIRECT' }] }),
    ...overrides
  };
  const capability = createServerFamilyConversationCapability({
    home: '/synthetic/home',
    nowProvider: () => NOW,
    instanceRef: 'instance.server.family.001',
    ...owners
  });
  return { capability, calls, channel };
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => error instanceof ServerFamilyConversationCapabilityError && error.code === code);
}

test('capability owns one closed serving-side question and bootstrap projects only current visible GROUP rooms', () => {
  const { capability, calls } = harness();
  assert.equal(capability.schemaVersion, SERVER_FAMILY_CONVERSATION_CAPABILITY_SCHEMA);
  const result = capability.bootstrap({ authority: authority() });
  assert.equal(result.schemaVersion, SERVER_FAMILY_CONVERSATION_BOOTSTRAP_SCHEMA);
  assert.equal(result.state, 'CURRENT');
  assert.equal(result.currentPrincipalRef, 'person.victor');
  assert.equal(result.rooms.length, 1);
  assert.deepEqual(result.rooms[0].audience, [
    { principalRef: 'person.victor', role: 'MEMBER' },
    { principalRef: 'person.alex', role: 'MEMBER' }
  ]);
  assert.equal(calls.filter(([kind]) => kind === 'LIST').length, 1);
});

test('perform delegates APPEND/READ/READ_THREAD_HISTORY/LIST to existing semantic owners with current authority', () => {
  const { capability, calls, channel } = harness();
  const base = { authority: authority(), intent: { spaceRef: 'space.family.current', channelRef: channel.channelRef, expectedMembershipGeneration: 4 } };

  assert.equal(capability.perform({ ...base, operation: 'APPEND' }).state, 'APPENDED');
  assert.equal(capability.perform({ ...base, operation: 'READ' }).state, 'CURRENT');
  assert.equal(capability.perform({ ...base, operation: 'READ_THREAD_HISTORY' }).state, 'CURRENT');
  assert.equal(capability.perform({ operation: 'LIST', authority: authority(), intent: { spaceRef: 'space.family.current', expectedMembershipGeneration: 4 } }).state, 'CURRENT');

  assert.deepEqual(calls.map(([kind]) => kind), ['APPEND', 'READ', 'READ_THREAD_HISTORY', 'LIST']);
  const appendInput = calls[0][1];
  assert.equal(appendInput.membership.principalRef, 'person.victor');
  assert.equal(appendInput.currentRevocationGeneration, 7);
  assert.equal(appendInput.instanceRef, 'instance.server.family.001');
  assert.equal(Object.hasOwn(appendInput, 'request'), false);
  assert.equal(Object.hasOwn(appendInput, 'sessionRef'), false);
});

test('raw transport/session fields are rejected instead of becoming capability vocabulary', () => {
  const { capability, channel } = harness();
  expectCode(() => capability.bootstrap({ authority: authority(), request: {} }), 'SERVER_FAMILY_CONVERSATION_UNTRUSTED_FIELD');
  expectCode(() => capability.perform({
    operation: 'READ',
    intent: { spaceRef: 'space.family.current', channelRef: channel.channelRef, expectedMembershipGeneration: 4 },
    authority: authority(),
    headers: { authorization: 'opaque' }
  }), 'SERVER_FAMILY_CONVERSATION_UNTRUSTED_FIELD');
  expectCode(() => capability.perform({
    operation: 'READ',
    intent: { spaceRef: 'space.family.current', channelRef: channel.channelRef, expectedMembershipGeneration: 4 },
    authority: { ...authority(), sessionRef: 'session.raw' }
  }), 'SERVER_FAMILY_CONVERSATION_UNTRUSTED_FIELD');
});

test('invalid authority, time, operation, limit, and missing channel fail closed', () => {
  const { capability, channel } = harness();
  const intent = { spaceRef: 'space.family.current', channelRef: channel.channelRef, expectedMembershipGeneration: 4 };
  expectCode(() => capability.perform({ operation: 'READ', intent, authority: { membership: {}, lease: {}, currentRevocationGeneration: -1 } }), 'SERVER_FAMILY_CONVERSATION_AUTHORITY_UNAVAILABLE');
  expectCode(() => capability.perform({ operation: 'DELETE', intent, authority: authority() }), 'SERVER_FAMILY_CONVERSATION_OPERATION_NOT_ADMITTED');
  expectCode(() => capability.perform({ operation: 'READ', intent, authority: authority(), limit: 1001 }), 'SERVER_FAMILY_CONVERSATION_INPUT_INVALID');
  expectCode(() => capability.perform({ operation: 'READ', intent: { ...intent, channelRef: 'channel.missing' }, authority: authority() }), 'SERVER_FAMILY_CONVERSATION_CHANNEL_NOT_FOUND');

  const badTime = harness({});
  const broken = createServerFamilyConversationCapability({
    home: '/synthetic/home',
    nowProvider: () => 'not-a-time',
    instanceRef: 'instance.server.family.001',
    appendFamilyMessage: () => ({}),
    readFamilyConversation: () => ({}),
    readFamilyThreadHistory: () => ({}),
    listFamilyChannels: () => ({ state: 'CURRENT', channels: [] }),
    readChannelBinding: () => ({ state: 'CURRENT', channel: badTime.channel }),
    listChannelBindings: () => ({ state: 'CURRENT', channels: [] })
  });
  expectCode(() => broken.bootstrap({ authority: authority() }), 'SERVER_FAMILY_CONVERSATION_TIME_UNAVAILABLE');
});

test('bootstrap skips only denied/stale Family channels and propagates other owner failures', () => {
  const stale = harness({
    listFamilyChannels: () => {
      const error = new Error('stale');
      error.code = 'BROWSER_FAMILY_BRIDGE_STALE';
      throw error;
    }
  });
  assert.equal(stale.capability.bootstrap({ authority: authority() }).state, 'EMPTY');

  const broken = harness({
    listFamilyChannels: () => {
      const error = new Error('store unavailable');
      error.code = 'BROWSER_FAMILY_BRIDGE_STORE_UNAVAILABLE';
      throw error;
    }
  });
  assert.throws(() => broken.capability.bootstrap({ authority: authority() }), /store unavailable/u);
});

// [VXG RealForever]
