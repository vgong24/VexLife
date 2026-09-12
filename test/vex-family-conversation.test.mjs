import assert from 'node:assert/strict';
import test from 'node:test';

import { contextForParticipant, createChannel, createMessage, messagesForChannel } from '../src/core/conversation.mjs';
import {
  FAMILY_CONVERSATION_MESSAGE_SCHEMA,
  FAMILY_HISTORY_FROM_JOIN_POLICY,
  FamilyConversationError,
  contextForFamilyParticipant,
  createFamilyChannel,
  createFamilyMessage,
  familySpaceRecordSha256FromMessage,
  familySpaceRecordSnapshotRef,
  validateFamilySpaceConversationRecord
} from '../src/core/family-conversation.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const T0 = '2026-09-12T10:00:00.000Z';
const T1 = '2026-09-12T11:00:00.000Z';
const T2 = '2026-09-12T12:00:00.000Z';

const member = (name, {
  role = 'MEMBER',
  status = 'ACTIVE',
  joinedAt = T0,
  leftOrRevokedAtOrNull = null,
  historyVisibilityPolicyRef = FAMILY_HISTORY_FROM_JOIN_POLICY
} = {}) => Object.freeze({
  membershipRef: `membership.vex-family.${name}`,
  principalRef: `principal.${name}`,
  principalBindingRef: `principal-binding.${name}`,
  role,
  status,
  joinedAt,
  leftOrRevokedAtOrNull,
  historyVisibilityPolicyRef
});

function record({
  revision = 0,
  membershipGeneration = revision,
  members,
  priorRecordSha256 = null,
  updatedAt = T0,
  companionState = 'ACTIVE',
  companionRef = 'lineage.vex.family.household'
}) {
  const core = {
    schemaVersion: 'vexlife.family-space/v1',
    spaceRef: 'space.vex-family.household',
    revision,
    membershipGeneration,
    familyCompanionLineageRef: companionRef,
    familyCompanionBindingGeneration: 0,
    familyCompanionState: companionState,
    members,
    createdAt: T0,
    updatedAt,
    priorRecordSha256,
    transitionRef: `transition.vex-family.${revision}`
  };
  return Object.freeze({ ...core, recordSha256: semanticHash(core) });
}

const groupChannel = (familySpaceRecord, overrides = {}) => createFamilyChannel({
  channelRef: overrides.channelRef ?? 'channel.vex-family.household',
  threadRef: overrides.threadRef ?? 'thread.vex-family.household',
  familySpaceRecord,
  createdAt: overrides.createdAt ?? T0,
  ...overrides
});

const familyMessage = (channel, familySpaceRecord, speakerName, {
  messageRef = 'message.vex-family.001',
  recipients = ['principal.alex'],
  content = 'Hello, family.',
  sequence = 0,
  createdAt = T0,
  binding = `principal-binding.${speakerName}`
} = {}) => createFamilyMessage({
  messageRef,
  channel,
  familySpaceRecord,
  speakerRef: `principal.${speakerName}`,
  speakerPrincipalBindingRef: binding,
  recipientRefs: recipients,
  content,
  sequence,
  createdAt
});

test('VFC-00: exact Family Space record forms a 3-human plus Family Vex channel', () => {
  const snapshot = record({
    members: [member('victor', { role: 'OWNER' }), member('alex'), member('bri')]
  });
  const channel = groupChannel(snapshot);
  assert.deepEqual(channel.memberRefs, []);
  assert.deepEqual(channel.familySpaceBinding.channelMemberRefs, [
    'principal.victor',
    'principal.alex',
    'principal.bri',
    'lineage.vex.family.household'
  ]);
  assert.equal(channel.familySpaceBinding.familySpaceRecordSha256, snapshot.recordSha256);
  assert.equal(channel.familySpaceBinding.membershipGeneration, 0);
  assert.equal(
    channel.familySpaceBinding.membershipSnapshotRef,
    familySpaceRecordSnapshotRef(snapshot.recordSha256)
  );

  const message = familyMessage(channel, snapshot, 'victor');
  assert.equal(message.schemaVersion, FAMILY_CONVERSATION_MESSAGE_SCHEMA);
  assert.equal(message.spaceRef, snapshot.spaceRef);
  assert.equal(message.familySpaceRecordSha256, snapshot.recordSha256);
  assert.equal(familySpaceRecordSha256FromMessage(message), snapshot.recordSha256);
  assert.deepEqual(message.witnessRefs, channel.familySpaceBinding.channelMemberRefs);
  assert.equal(message.speakerPrincipalBindingRef, 'principal-binding.victor');
});

test('VFC-01/VFC-09: five humans retain independent identity and deterministic ordering', () => {
  const names = ['victor', 'alex', 'bri', 'casey', 'devon'];
  const snapshot = record({
    members: names.map((name, index) => member(name, { role: index === 0 ? 'OWNER' : 'MEMBER' }))
  });
  const channel = groupChannel(snapshot);
  const messages = [
    familyMessage(channel, snapshot, 'casey', {
      messageRef: 'message.vex-family.002', recipients: ['principal.victor'], sequence: 2, createdAt: T2
    }),
    familyMessage(channel, snapshot, 'victor', {
      messageRef: 'message.vex-family.000', recipients: ['principal.alex'], sequence: 0, createdAt: T0
    }),
    familyMessage(channel, snapshot, 'alex', {
      messageRef: 'message.vex-family.001', recipients: ['principal.bri'], sequence: 1, createdAt: T1
    })
  ];
  assert.deepEqual(messagesForChannel(messages, channel.channelRef).map((item) => item.sequence), [0, 1, 2]);
  for (const message of messages) {
    assert.equal(message.familyWitnessBindings.length, 5);
    assert.equal(new Set(message.familyWitnessBindings.map((binding) => binding.principalRef)).size, 5);
    assert.deepEqual(message.witnessRefs, channel.familySpaceBinding.channelMemberRefs);
  }
});

test('VFC-02/VFC-10: nonmember, device, relationship, display and binding substitution fail closed', () => {
  const snapshot = record({ members: [member('victor', { role: 'OWNER' }), member('alex'), member('bri')] });
  const channel = groupChannel(snapshot);

  for (const speakerRef of ['principal.stranger', 'device.victor-phone', 'relationship.friend.victor', 'display.victor']) {
    assert.throws(
      () => createFamilyMessage({
        messageRef: `message.${speakerRef.replaceAll('.', '-')}`,
        channel,
        familySpaceRecord: snapshot,
        speakerRef,
        speakerPrincipalBindingRef: 'principal-binding.victor',
        recipientRefs: ['principal.alex'],
        content: 'forged',
        sequence: 0,
        createdAt: T0
      }),
      (error) => error instanceof FamilyConversationError && error.code === 'FAMILY_CONVERSATION_MEMBER_DENIED'
    );
  }

  assert.throws(
    () => familyMessage(channel, snapshot, 'victor', { binding: 'principal-binding.alex' }),
    (error) => error instanceof FamilyConversationError && error.code === 'FAMILY_CONVERSATION_BINDING_MISMATCH'
  );
});

test('VFC-03: stale record hash or generation cannot form a Family message', () => {
  const initial = record({ members: [member('victor', { role: 'OWNER' }), member('alex')] });
  const channel = groupChannel(initial);
  const advanced = record({
    revision: 1,
    membershipGeneration: 1,
    priorRecordSha256: initial.recordSha256,
    updatedAt: T1,
    members: [member('victor', { role: 'OWNER' }), member('alex'), member('bri', { joinedAt: T1 })]
  });
  assert.throws(
    () => familyMessage(channel, advanced, 'victor'),
    (error) => error instanceof FamilyConversationError && error.code === 'FAMILY_CONVERSATION_STALE'
  );

  const altered = structuredClone(initial);
  altered.members[0].principalBindingRef = 'principal-binding.forged';
  assert.throws(
    () => validateFamilySpaceConversationRecord(altered),
    (error) => error instanceof FamilyConversationError && error.code === 'FAMILY_CONVERSATION_RECORD_INVALID'
  );
});

test('VFC-04: removal advances the future audience without rewriting historical witnesses', () => {
  const initial = record({
    members: [member('victor', { role: 'OWNER' }), member('alex'), member('bri')]
  });
  const firstChannel = groupChannel(initial);
  const beforeRemoval = familyMessage(firstChannel, initial, 'victor', {
    messageRef: 'message.vex-family.before-removal', recipients: ['principal.bri'], createdAt: T0
  });

  const advanced = record({
    revision: 1,
    membershipGeneration: 1,
    priorRecordSha256: initial.recordSha256,
    updatedAt: T1,
    members: [
      member('victor', { role: 'OWNER' }),
      member('alex'),
      member('bri', { status: 'REMOVED', leftOrRevokedAtOrNull: T1 })
    ]
  });
  const secondChannel = groupChannel(advanced, { createdAt: T1 });
  const afterRemoval = familyMessage(secondChannel, advanced, 'victor', {
    messageRef: 'message.vex-family.after-removal', recipients: ['principal.alex'], createdAt: T2
  });

  assert.ok(beforeRemoval.witnessRefs.includes('principal.bri'));
  assert.ok(!afterRemoval.witnessRefs.includes('principal.bri'));
  assert.throws(
    () => contextForFamilyParticipant(
      [beforeRemoval, afterRemoval], secondChannel, advanced, 'principal.bri', 'principal-binding.bri'
    ),
    (error) => error instanceof FamilyConversationError && error.code === 'FAMILY_CONVERSATION_MEMBER_DENIED'
  );
});

test('VFC-05: FROM_JOIN exposes no event before the admitted member visibility floor', () => {
  const initial = record({ members: [member('victor', { role: 'OWNER' }), member('alex')] });
  const firstChannel = groupChannel(initial);
  const earlier = familyMessage(firstChannel, initial, 'victor', {
    messageRef: 'message.vex-family.earlier', recipients: ['principal.alex'], createdAt: T0
  });

  const advanced = record({
    revision: 1,
    membershipGeneration: 1,
    priorRecordSha256: initial.recordSha256,
    updatedAt: T1,
    members: [member('victor', { role: 'OWNER' }), member('alex'), member('bri', { joinedAt: T1 })]
  });
  const secondChannel = groupChannel(advanced, { createdAt: T1 });
  const later = familyMessage(secondChannel, advanced, 'victor', {
    messageRef: 'message.vex-family.later', recipients: ['principal.bri'], sequence: 1, createdAt: T2
  });
  const visible = contextForFamilyParticipant(
    [later, earlier], secondChannel, advanced, 'principal.bri', 'principal-binding.bri'
  );
  assert.deepEqual(visible.map((message) => message.messageRef), ['message.vex-family.later']);
});

test('VFC-06: unsupported explicit historical release policy is rejected, not improvised', () => {
  const unsupported = record({
    members: [
      member('victor', { role: 'OWNER' }),
      member('alex', { historyVisibilityPolicyRef: 'policy.vex-family.history.explicit-release' })
    ]
  });
  assert.throws(
    () => groupChannel(unsupported),
    (error) => error instanceof FamilyConversationError
      && error.code === 'FAMILY_CONVERSATION_HISTORY_POLICY_UNSUPPORTED'
  );
});

test('VFC-07/VFC-08: addressed recipients do not change audience truth; private channels isolate context', () => {
  const snapshot = record({ members: [member('victor', { role: 'OWNER' }), member('alex'), member('bri')] });
  const group = groupChannel(snapshot);
  const addressed = familyMessage(group, snapshot, 'victor', {
    messageRef: 'message.vex-family.addressed', recipients: ['principal.alex']
  });
  assert.deepEqual(addressed.recipientRefs, ['principal.alex']);
  assert.ok(addressed.witnessRefs.includes('principal.bri'));

  const privateAB = createFamilyChannel({
    channelRef: 'channel.vex-family.private-ab',
    threadRef: 'thread.vex-family.private-ab',
    kind: 'PRIVATE',
    familySpaceRecord: snapshot,
    memberPrincipalRefs: ['principal.victor', 'principal.alex'],
    createdAt: T0
  });
  const privateAC = createFamilyChannel({
    channelRef: 'channel.vex-family.private-ac',
    threadRef: 'thread.vex-family.private-ac',
    kind: 'PRIVATE',
    familySpaceRecord: snapshot,
    memberPrincipalRefs: ['principal.victor', 'principal.bri'],
    createdAt: T0
  });
  const ab = familyMessage(privateAB, snapshot, 'victor', {
    messageRef: 'message.vex-family.private-ab', recipients: ['principal.alex']
  });
  const ac = familyMessage(privateAC, snapshot, 'victor', {
    messageRef: 'message.vex-family.private-ac', recipients: ['principal.bri']
  });
  const visible = contextForFamilyParticipant(
    [ac, ab], privateAB, snapshot, 'principal.alex', 'principal-binding.alex'
  );
  assert.deepEqual(visible.map((message) => message.messageRef), ['message.vex-family.private-ab']);
  assert.deepEqual(ab.witnessRefs, ['principal.victor', 'principal.alex']);
});

test('VFC-11: ordinary direct-channel behavior remains compatible; generic Family bypass is rejected', () => {
  const ordinary = createChannel({
    channelRef: 'channel.direct.victor-companion',
    threadRef: 'thread.direct.victor-companion',
    kind: 'DIRECT',
    memberRefs: ['principal.victor', 'role.companion'],
    labelStringRef: 'string.channel.direct'
  });
  const direct = createMessage({
    messageRef: 'message.direct.001',
    channel: ordinary,
    speakerRef: 'principal.victor',
    recipientRefs: ['role.companion'],
    content: 'Hello.',
    sequence: 0,
    createdAt: T0
  });
  assert.deepEqual(contextForParticipant([direct], ordinary, 'principal.victor'), [direct]);
  assert.deepEqual(direct.witnessRefs, ['principal.victor', 'role.companion']);
  assert.equal('familySpaceBinding' in ordinary, false);

  const snapshot = record({ members: [member('victor', { role: 'OWNER' }), member('alex')] });
  const family = groupChannel(snapshot);
  assert.throws(
    () => createMessage({
      messageRef: 'message.family.bypass', channel: family, speakerRef: 'principal.victor',
      recipientRefs: ['principal.alex'], content: 'bypass', sequence: 0, createdAt: T0
    }),
    (error) => error instanceof Error && /not a channel member/u.test(error.message)
  );
  assert.throws(
    () => contextForParticipant([], family, 'principal.victor'),
    (error) => error instanceof Error && /not a member of/u.test(error.message)
  );
});

test('VFC-12: record-bound functions are pure and perform no Home, model, network, Memory or Relationship effect', () => {
  const snapshot = record({ members: [member('victor', { role: 'OWNER' }), member('alex')] });
  const before = structuredClone(snapshot);
  const channel = groupChannel(snapshot);
  const message = familyMessage(channel, snapshot, 'victor');
  assert.deepEqual(snapshot, before);
  assert.equal(typeof message.contentHash, 'string');
  assert.equal('home' in channel, false);
  assert.equal('providerRef' in message, false);
  assert.equal('memoryRef' in message, false);
  assert.equal('relationshipRef' in message, false);
});
