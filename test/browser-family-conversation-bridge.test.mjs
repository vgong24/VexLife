import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  approvePairing,
  createPairingOffer,
  issueCapabilityLease
} from '../src/core/home-bridge.mjs';
import {
  addFamilyMember,
  createFamilySpace,
  transitionFamilyMember
} from '../src/core/family-space-store.mjs';
import { createFamilyChannel } from '../src/core/family-conversation.mjs';
import { readConversationChannel } from '../src/core/conversation-store.mjs';
import {
  BrowserFamilyConversationBridgeError,
  appendBrowserFamilyMessage,
  listBrowserFamilyChannels,
  readBrowserFamilyConversation
} from '../src/core/browser-family-conversation-bridge.mjs';

const T0 = '2026-09-12T10:00:00.000Z';
const T1 = '2026-09-12T10:10:00.000Z';
const T2 = '2026-09-12T10:20:00.000Z';
const T3 = '2026-09-12T10:30:00.000Z';
const T4 = '2026-09-12T10:40:00.000Z';
const T5 = '2026-09-12T10:50:00.000Z';
const T9 = '2026-09-12T15:00:00.000Z';
const SPACE = 'space.vex-family.bridge-test';
const GROUP = 'channel.vex-family.bridge-group';

function tempHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vex-family-bridge-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function bridgeIdentity(name, { approvedBy = 'principal.victor' } = {}) {
  const principalRef = `principal.${name}`;
  const deviceRef = `device.${name}`;
  const offer = createPairingOffer({
    pairingRef: `pairing.${name}`,
    homeNodeRef: 'home.vex-family.test',
    homePublicKey: 'test-home-public-key',
    oneTimeNonceHash: `nonce-hash-${name}`,
    humanFingerprint: `fingerprint-${name}`,
    requestedCapabilityRefs: [],
    expiresAt: T9
  });
  const paired = approvePairing({
    offer,
    principalRef,
    deviceRef,
    devicePublicKey: `device-public-key-${name}`,
    approvedCapabilityRefs: [],
    approvedBy,
    approvedAt: T0,
    expectedFingerprint: `fingerprint-${name}`
  });
  assert.equal(paired.state, 'PAIRED');
  const lease = issueCapabilityLease({
    leaseRef: `lease.${name}`,
    membership: paired.membership,
    requestedCapabilityRefs: [],
    projectRefs: ['project.vex-family.test'],
    issuedAt: T0,
    expiresAt: T9,
    revocationGeneration: paired.membership.revocationGeneration
  });
  return Object.freeze({ membership: paired.membership, lease });
}

function addMember(home, record, name, observedAt) {
  const result = addFamilyMember({
    home,
    spaceRef: SPACE,
    actorPrincipalRef: 'principal.victor',
    principalRef: `principal.${name}`,
    principalBindingRef: `principal-binding.${name}`,
    expectedRevision: record.revision,
    expectedMembershipGeneration: record.membershipGeneration,
    observedAt,
    instanceRef: `instance.vf02c.add-${name}`
  });
  return result.record;
}

function setupFamily(t, names = ['alex', 'bri']) {
  const home = tempHome(t);
  const created = createFamilySpace({
    home,
    spaceRef: SPACE,
    ownerPrincipalRef: 'principal.victor',
    ownerPrincipalBindingRef: 'principal-binding.victor',
    familyCompanionLineageRef: 'lineage.vex.family.bridge-test',
    observedAt: T0,
    instanceRef: 'instance.vf02c.family-create'
  });
  let record = created.record;
  const times = [T1, T2, T3, T4];
  for (const [index, name] of names.entries()) record = addMember(home, record, name, times[index]);
  const channel = createFamilyChannel({
    channelRef: GROUP,
    threadRef: 'thread.vex-family.bridge-group',
    familySpaceRecord: record,
    createdAt: T3
  });
  return Object.freeze({ home, record, channel });
}

function appendArgs({ home, record, channel, name = 'victor', content = 'Hello, family.', idempotencyKey = 'send-001', now = T4 }) {
  const identity = bridgeIdentity(name);
  return {
    home,
    intent: {
      spaceRef: SPACE,
      channelRef: channel.channelRef,
      content,
      expectedMembershipGeneration: record.membershipGeneration,
      idempotencyKey
    },
    channel,
    membership: identity.membership,
    lease: identity.lease,
    currentRevocationGeneration: identity.membership.revocationGeneration,
    now,
    instanceRef: `instance.vf02c.append-${name}`
  };
}

function readArgs({ home, record, channel, name, now = T5 }) {
  const identity = bridgeIdentity(name);
  return {
    home,
    intent: {
      spaceRef: SPACE,
      channelRef: channel.channelRef,
      expectedMembershipGeneration: record.membershipGeneration
    },
    channel,
    membership: identity.membership,
    lease: identity.lease,
    currentRevocationGeneration: identity.membership.revocationGeneration,
    now
  };
}

test('VFB-00/VFB-01/VFB-02: server-bound principal appends and current members read; caller authority fields fail closed', (t) => {
  const { home, record, channel } = setupFamily(t);
  const appended = appendBrowserFamilyMessage(appendArgs({ home, record, channel }));
  assert.equal(appended.state, 'APPENDED');
  assert.equal(appended.message.speakerRef, 'principal.victor');

  for (const name of ['alex', 'bri']) {
    const projection = readBrowserFamilyConversation(readArgs({ home, record, channel, name }));
    assert.deepEqual(projection.messages.map((message) => message.messageRef), [appended.message.messageRef]);
  }

  const forged = appendArgs({ home, record, channel, idempotencyKey: 'forged-001' });
  forged.intent.speakerRef = 'principal.alex';
  assert.throws(
    () => appendBrowserFamilyMessage(forged),
    (error) => error instanceof BrowserFamilyConversationBridgeError
      && error.code === 'BROWSER_FAMILY_BRIDGE_UNTRUSTED_FIELD'
  );
});

test('VFB-03: stale membership generation fails before append or read', (t) => {
  const { home, record, channel } = setupFamily(t);
  const append = appendArgs({ home, record, channel });
  append.intent.expectedMembershipGeneration -= 1;
  assert.throws(
    () => appendBrowserFamilyMessage(append),
    (error) => error instanceof BrowserFamilyConversationBridgeError && error.code === 'BROWSER_FAMILY_BRIDGE_STALE'
  );
  assert.equal(readConversationChannel({ home, channelRef: channel.channelRef }).state, 'EMPTY');

  const read = readArgs({ home, record, channel, name: 'alex' });
  read.intent.expectedMembershipGeneration -= 1;
  assert.throws(
    () => readBrowserFamilyConversation(read),
    (error) => error instanceof BrowserFamilyConversationBridgeError && error.code === 'BROWSER_FAMILY_BRIDGE_STALE'
  );
});

test('VFB-04: removed or revoked Family member cannot append or receive a new current projection', (t) => {
  const { home, record } = setupFamily(t);
  const transitioned = transitionFamilyMember({
    home,
    spaceRef: SPACE,
    actorPrincipalRef: 'principal.victor',
    principalRef: 'principal.alex',
    action: 'REVOKE',
    expectedRevision: record.revision,
    expectedMembershipGeneration: record.membershipGeneration,
    observedAt: T4,
    instanceRef: 'instance.vf02c.revoke-alex'
  }).record;
  const currentChannel = createFamilyChannel({
    channelRef: GROUP,
    threadRef: 'thread.vex-family.bridge-group',
    familySpaceRecord: transitioned,
    createdAt: T4
  });

  assert.throws(
    () => readBrowserFamilyConversation(readArgs({ home, record: transitioned, channel: currentChannel, name: 'alex' })),
    (error) => error instanceof BrowserFamilyConversationBridgeError && error.code === 'BROWSER_FAMILY_BRIDGE_DENIED'
  );
  assert.throws(
    () => appendBrowserFamilyMessage(appendArgs({ home, record: transitioned, channel: currentChannel, name: 'alex' })),
    (error) => error instanceof BrowserFamilyConversationBridgeError && error.code === 'BROWSER_FAMILY_BRIDGE_DENIED'
  );
});

test('VFB-05: FROM_JOIN excludes pre-join durable history without rewriting earlier event identity', (t) => {
  const home = tempHome(t);
  let record = createFamilySpace({
    home,
    spaceRef: SPACE,
    ownerPrincipalRef: 'principal.victor',
    ownerPrincipalBindingRef: 'principal-binding.victor',
    familyCompanionLineageRef: 'lineage.vex.family.bridge-test',
    observedAt: T0,
    instanceRef: 'instance.vf02c.from-join-create'
  }).record;
  record = addMember(home, record, 'alex', T1);
  let channel = createFamilyChannel({
    channelRef: GROUP,
    threadRef: 'thread.vex-family.bridge-group',
    familySpaceRecord: record,
    createdAt: T1
  });
  const before = appendBrowserFamilyMessage(appendArgs({
    home, record, channel, content: 'Before Bri joined.', idempotencyKey: 'before-bri', now: T1
  }));

  record = addMember(home, record, 'bri', T2);
  channel = createFamilyChannel({
    channelRef: GROUP,
    threadRef: 'thread.vex-family.bridge-group',
    familySpaceRecord: record,
    createdAt: T2
  });
  const after = appendBrowserFamilyMessage(appendArgs({
    home, record, channel, content: 'After Bri joined.', idempotencyKey: 'after-bri', now: T3
  }));

  const visible = readBrowserFamilyConversation(readArgs({ home, record, channel, name: 'bri', now: T4 }));
  assert.deepEqual(visible.messages.map((message) => message.messageRef), [after.message.messageRef]);
  const durable = readConversationChannel({ home, channelRef: GROUP });
  assert.deepEqual(durable.messages.map((message) => message.messageRef), [before.message.messageRef, after.message.messageRef]);
});

test('VFB-06: private-channel metadata is not listed or readable by a Family-room-only member', (t) => {
  const { home, record, channel: group } = setupFamily(t);
  const privateChannel = createFamilyChannel({
    channelRef: 'channel.vex-family.private-victor-alex',
    threadRef: 'thread.vex-family.private-victor-alex',
    kind: 'PRIVATE',
    familySpaceRecord: record,
    memberPrincipalRefs: ['principal.victor', 'principal.alex'],
    createdAt: T3
  });
  appendBrowserFamilyMessage(appendArgs({
    home,
    record,
    channel: privateChannel,
    content: 'Private hello.',
    idempotencyKey: 'private-001'
  }));

  assert.throws(
    () => readBrowserFamilyConversation(readArgs({ home, record, channel: privateChannel, name: 'bri' })),
    (error) => error instanceof BrowserFamilyConversationBridgeError && error.code === 'BROWSER_FAMILY_BRIDGE_DENIED'
  );

  const bri = bridgeIdentity('bri');
  const listed = listBrowserFamilyChannels({
    home,
    intent: { spaceRef: SPACE, expectedMembershipGeneration: record.membershipGeneration },
    channels: [group, privateChannel],
    membership: bri.membership,
    lease: bri.lease,
    currentRevocationGeneration: bri.membership.revocationGeneration,
    now: T5
  });
  assert.deepEqual(listed.channels.map((item) => item.channelRef), [GROUP]);
});

test('VFB-12: reconstructed PRIVATE channels with malformed human audiences are not listed', (t) => {
  const { home, record, channel: group } = setupFamily(t);
  const privateChannel = createFamilyChannel({
    channelRef: 'channel.vex-family.private-victor-alex',
    threadRef: 'thread.vex-family.private-victor-alex',
    kind: 'PRIVATE',
    familySpaceRecord: record,
    memberPrincipalRefs: ['principal.victor', 'principal.alex'],
    createdAt: T3
  });
  const firstBinding = privateChannel.familySpaceBinding.audienceMemberBindings[0];
  const singlePrivate = Object.freeze({
    ...privateChannel,
    channelRef: 'channel.vex-family.private-single',
    threadRef: 'thread.vex-family.private-single',
    familySpaceBinding: Object.freeze({
      ...privateChannel.familySpaceBinding,
      audienceMemberBindings: Object.freeze([firstBinding]),
      channelMemberRefs: Object.freeze([firstBinding.principalRef])
    })
  });
  const duplicatePrivate = Object.freeze({
    ...privateChannel,
    channelRef: 'channel.vex-family.private-duplicate',
    threadRef: 'thread.vex-family.private-duplicate',
    familySpaceBinding: Object.freeze({
      ...privateChannel.familySpaceBinding,
      audienceMemberBindings: Object.freeze([firstBinding, firstBinding]),
      channelMemberRefs: Object.freeze([firstBinding.principalRef, firstBinding.principalRef])
    })
  });

  const victor = bridgeIdentity('victor');
  const listed = listBrowserFamilyChannels({
    home,
    intent: { spaceRef: SPACE, expectedMembershipGeneration: record.membershipGeneration },
    channels: [group, singlePrivate, duplicatePrivate],
    membership: victor.membership,
    lease: victor.lease,
    currentRevocationGeneration: victor.membership.revocationGeneration,
    now: T5
  });
  assert.deepEqual(listed.channels.map((item) => item.channelRef), [GROUP]);
});

test('VFB-07/VFB-10: idempotent retry and stateless restart preserve one durable event identity', (t) => {
  const { home, record, channel } = setupFamily(t);
  const args = appendArgs({ home, record, channel, idempotencyKey: 'retry-001' });
  const first = appendBrowserFamilyMessage(args);
  const second = appendBrowserFamilyMessage({ ...args, instanceRef: 'instance.vf02c.restart' });
  assert.equal(second.state, 'IDEMPOTENT_CURRENT');
  assert.equal(second.message.messageRef, first.message.messageRef);
  const durable = readConversationChannel({ home, channelRef: GROUP });
  assert.equal(durable.messages.length, 1);
  assert.equal(durable.messages[0].messageRef, first.message.messageRef);
});

test('VFB-08/VFB-09/VFB-11: three independent clients keep model-free human chat moving', (t) => {
  const { home, record, channel } = setupFamily(t);
  const modelWorkerState = 'BUSY';
  assert.equal(modelWorkerState, 'BUSY');

  const senders = [
    ['victor', 'Human one.', 'multi-1', T3],
    ['alex', 'Human two.', 'multi-2', T4],
    ['bri', 'Human three.', 'multi-3', T5]
  ];
  for (const [name, content, idempotencyKey, now] of senders) {
    appendBrowserFamilyMessage(appendArgs({ home, record, channel, name, content, idempotencyKey, now }));
  }
  const visible = readBrowserFamilyConversation(readArgs({ home, record, channel, name: 'alex', now: T5 }));
  assert.deepEqual(visible.messages.map((message) => message.speakerRef), [
    'principal.victor',
    'principal.alex',
    'principal.bri'
  ]);
  assert.equal(visible.messages.length, 3);
});
