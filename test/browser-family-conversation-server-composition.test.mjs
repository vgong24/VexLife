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
  readFamilySpace
} from '../src/core/family-space-store.mjs';
import { createFamilyChannel } from '../src/core/family-conversation.mjs';
import {
  materializeConversationChannel,
  readConversationChannelBinding
} from '../src/core/conversation-store.mjs';
import { leaveFamilyAndContinueConversation } from '../src/core/family-membership-runtime.mjs';
import {
  BROWSER_FAMILY_CONVERSATION_API_PATH,
  BROWSER_FAMILY_ROOM_BOOTSTRAP_API_PATH,
  createVexLifeBrowserServer
} from '../scripts/serve-browser.mjs';

const T0 = '2026-09-13T20:00:00.000Z';
const T1 = '2026-09-13T20:10:00.000Z';
const T2 = '2026-09-13T20:20:00.000Z';
const T3 = '2026-09-13T20:30:00.000Z';
const T4 = '2026-09-13T20:40:00.000Z';
const T5 = '2026-09-13T20:50:00.000Z';
const T6 = '2026-09-13T21:00:00.000Z';
const T9 = '2026-09-14T02:00:00.000Z';
const SPACE = 'space.vex-family.server-composition-test';
const GROUP = 'channel.vex-family.server-composition-group';

function tempHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vex-family-server-composition-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function trustedIdentity(name, { approvedBy = 'principal.victor' } = {}) {
  const principalRef = `principal.${name}`;
  const deviceRef = `device.${name}`;
  const offer = createPairingOffer({
    pairingRef: `pairing.server-composition.${name}`,
    homeNodeRef: 'home.vex-family.server-composition-test',
    homePublicKey: 'server-composition-test-home-public-key',
    oneTimeNonceHash: `server-composition-nonce-${name}`,
    humanFingerprint: `server-composition-fingerprint-${name}`,
    requestedCapabilityRefs: [],
    expiresAt: T9
  });
  const paired = approvePairing({
    offer,
    principalRef,
    deviceRef,
    devicePublicKey: `server-composition-device-key-${name}`,
    approvedCapabilityRefs: [],
    approvedBy,
    approvedAt: T0,
    expectedFingerprint: `server-composition-fingerprint-${name}`
  });
  assert.equal(paired.state, 'PAIRED');
  const lease = issueCapabilityLease({
    leaseRef: `lease.server-composition.${name}`,
    membership: paired.membership,
    requestedCapabilityRefs: [],
    projectRefs: ['project.vex-family.server-composition-test'],
    issuedAt: T0,
    expiresAt: T9,
    revocationGeneration: paired.membership.revocationGeneration
  });
  return Object.freeze({
    membership: paired.membership,
    lease,
    currentRevocationGeneration: paired.membership.revocationGeneration
  });
}

function addMember(home, record, name, observedAt) {
  return addFamilyMember({
    home,
    spaceRef: SPACE,
    actorPrincipalRef: 'principal.victor',
    principalRef: `principal.${name}`,
    principalBindingRef: `principal-binding.${name}`,
    expectedRevision: record.revision,
    expectedMembershipGeneration: record.membershipGeneration,
    observedAt,
    instanceRef: `instance.server-composition.add-${name}`
  }).record;
}

function setupFamily(t) {
  const home = tempHome(t);
  let record = createFamilySpace({
    home,
    spaceRef: SPACE,
    ownerPrincipalRef: 'principal.victor',
    ownerPrincipalBindingRef: 'principal-binding.victor',
    familyCompanionLineageRef: 'lineage.vex.family.server-composition-test',
    observedAt: T0,
    instanceRef: 'instance.server-composition.family-create'
  }).record;
  record = addMember(home, record, 'alex', T1);
  record = addMember(home, record, 'bri', T2);
  const channel = createFamilyChannel({
    channelRef: GROUP,
    threadRef: 'thread.vex-family.server-composition-group',
    familySpaceRecord: record,
    createdAt: T3
  });
  const materialized = materializeConversationChannel({
    home,
    channel,
    instanceRef: 'instance.server-composition.channel-materialize',
    observedAt: T3
  });
  assert.equal(materialized.state, 'MATERIALIZED');
  return Object.freeze({ home, record, channel });
}

function fakeCompanion(modelCounter) {
  return Object.freeze({
    status() {
      return Object.freeze({ state: 'TEST_ONLY' });
    },
    async performTurn() {
      modelCounter.count += 1;
      throw new Error('Family conversation HTTP composition must not invoke the model path');
    }
  });
}

async function listen(server, t) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function postFamily(base, body, sessionRef = null) {
  const headers = { 'content-type': 'application/json' };
  if (sessionRef) headers['x-vex-test-session'] = sessionRef;
  const response = await fetch(`${base}${BROWSER_FAMILY_CONVERSATION_API_PATH}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  return Object.freeze({
    status: response.status,
    body: await response.json()
  });
}

function appendIntent(record, content, idempotencyKey) {
  return {
    spaceRef: SPACE,
    channelRef: GROUP,
    content,
    expectedMembershipGeneration: record.membershipGeneration,
    idempotencyKey
  };
}

test('SC-00/SC-01/SC-02/SC-07: real HTTP composition resolves durable channel and trusted sessions for three humans without model work', async (t) => {
  const { home, record } = setupFamily(t);
  const identities = new Map([
    ['session-victor', trustedIdentity('victor')],
    ['session-alex', trustedIdentity('alex')],
    ['session-bri', trustedIdentity('bri')]
  ]);
  const modelCounter = { count: 0 };
  const server = createVexLifeBrowserServer({
    companionBridge: fakeCompanion(modelCounter),
    familyConversationHome: home,
    familyConversationNow: () => T5,
    familyConversationInstanceRef: 'instance.server-composition.http',
    resolveFamilyConversationAuthority: ({ request }) => identities.get(request.headers['x-vex-test-session']) ?? null
  });
  const base = await listen(server, t);

  const sends = [
    ['session-victor', 'Victor to family.', 'server-send-victor', 'principal.victor'],
    ['session-alex', 'Alex to family.', 'server-send-alex', 'principal.alex'],
    ['session-bri', 'Bri to family.', 'server-send-bri', 'principal.bri']
  ];
  for (const [sessionRef, content, idempotencyKey, principalRef] of sends) {
    const result = await postFamily(base, {
      operation: 'APPEND',
      intent: appendIntent(record, content, idempotencyKey)
    }, sessionRef);
    assert.equal(result.status, 200);
    assert.equal(result.body.message.speakerRef, principalRef);
  }

  const read = await postFamily(base, {
    operation: 'READ',
    intent: {
      spaceRef: SPACE,
      channelRef: GROUP,
      expectedMembershipGeneration: record.membershipGeneration
    }
  }, 'session-bri');
  assert.equal(read.status, 200);
  assert.deepEqual(
    read.body.messages.map((message) => message.speakerRef),
    ['principal.victor', 'principal.alex', 'principal.bri']
  );

  const listed = await postFamily(base, {
    operation: 'LIST',
    intent: {
      spaceRef: SPACE,
      expectedMembershipGeneration: record.membershipGeneration
    }
  }, 'session-alex');
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.channels.map((channel) => channel.channelRef), [GROUP]);

  const durable = readConversationChannelBinding({ home, channelRef: GROUP });
  assert.equal(durable.state, 'CURRENT');
  assert.equal(durable.channel.channelRef, GROUP);
  assert.equal(modelCounter.count, 0);
});

test('TH-00/TH-01/TH-02/TH-06/TH-07: real HTTP thread history spans Family generations without changing current READ', async (t) => {
  const { home, record, channel } = setupFamily(t);
  const identities = new Map([
    ['session-victor', trustedIdentity('victor')],
    ['session-bri', trustedIdentity('bri')]
  ]);
  const modelCounter = { count: 0 };
  let now = T3;
  const server = createVexLifeBrowserServer({
    companionBridge: fakeCompanion(modelCounter),
    familyConversationHome: home,
    familyConversationNow: () => now,
    familyConversationInstanceRef: 'instance.server-composition.thread-history',
    resolveFamilyConversationAuthority: ({ request }) => identities.get(request.headers['x-vex-test-session']) ?? null
  });
  const base = await listen(server, t);

  const before = await postFamily(base, {
    operation: 'APPEND',
    intent: appendIntent(record, 'Before Alex left.', 'thread-history-before-leave')
  }, 'session-victor');
  assert.equal(before.status, 200);

  const continued = leaveFamilyAndContinueConversation({
    home,
    spaceRef: SPACE,
    priorChannelRef: channel.channelRef,
    currentPrincipalRef: 'principal.alex',
    expectedRevision: record.revision,
    expectedMembershipGeneration: record.membershipGeneration,
    observedAt: T4,
    instanceRef: 'instance.server-composition.thread-history.leave-alex'
  });
  const currentRecord = readFamilySpace({ home, spaceRef: SPACE }).record;
  const currentBinding = readConversationChannelBinding({
    home,
    channelRef: continued.successorChannelRef
  });
  assert.equal(currentBinding.state, 'CURRENT');
  assert.ok(currentBinding.channel);

  now = T5;
  const after = await postFamily(base, {
    operation: 'APPEND',
    intent: {
      spaceRef: SPACE,
      channelRef: continued.successorChannelRef,
      content: 'After Alex left.',
      expectedMembershipGeneration: currentRecord.membershipGeneration,
      idempotencyKey: 'thread-history-after-leave'
    }
  }, 'session-bri');
  assert.equal(after.status, 200);

  now = T6;
  const history = await postFamily(base, {
    operation: 'READ_THREAD_HISTORY',
    intent: {
      spaceRef: SPACE,
      channelRef: continued.successorChannelRef,
      expectedMembershipGeneration: currentRecord.membershipGeneration
    }
  }, 'session-bri');
  assert.equal(history.status, 200);
  assert.equal(history.body.state, 'CURRENT');
  assert.equal(history.body.spaceRef, SPACE);
  assert.equal(history.body.threadRef, channel.threadRef);
  assert.equal(history.body.currentChannelRef, continued.successorChannelRef);
  assert.equal(history.body.membershipGeneration, currentRecord.membershipGeneration);
  assert.deepEqual(
    history.body.segmentRefs,
    [channel.channelRef, continued.successorChannelRef]
  );
  assert.deepEqual(
    history.body.messages.map((message) => message.messageRef),
    [before.body.message.messageRef, after.body.message.messageRef]
  );
  assert.deepEqual(
    history.body.messages.map((message) => message.channelRef),
    [channel.channelRef, continued.successorChannelRef]
  );
  assert.deepEqual(
    history.body.messages.map((message) => message.membershipGeneration),
    [record.membershipGeneration, currentRecord.membershipGeneration]
  );
  assert.ok(history.body.messages[0].recipientRefs.includes('principal.bri'));
  assert.ok(history.body.messages[0].witnessRefs.includes('principal.alex'));
  assert.ok(history.body.messages[0].witnessRefs.includes('principal.bri'));
  assert.equal(history.body.messages[1].witnessRefs.includes('principal.alex'), false);
  assert.ok(history.body.messages[1].witnessRefs.includes('principal.bri'));
  assert.equal(Object.hasOwn(history.body.messages[0], 'principalBindingRef'), false);
  assert.equal(Object.hasOwn(history.body.messages[0], 'membershipSnapshotRef'), false);
  assert.equal(Object.hasOwn(history.body.messages[0], 'familySpaceRecordSha256'), false);

  const currentRead = await postFamily(base, {
    operation: 'READ',
    intent: {
      spaceRef: SPACE,
      channelRef: continued.successorChannelRef,
      expectedMembershipGeneration: currentRecord.membershipGeneration
    }
  }, 'session-bri');
  assert.equal(currentRead.status, 200);
  assert.deepEqual(
    currentRead.body.messages.map((message) => message.messageRef),
    [after.body.message.messageRef]
  );
  assert.equal(Object.hasOwn(currentRead.body.messages[0], 'witnessRefs'), false);
  assert.equal(modelCounter.count, 0);
});

test('SC-03/SC-04/SC-05: browser authority forgery, revoked authority, and stale Family generation fail closed independently', async (t) => {
  const { home, record, channel } = setupFamily(t);
  const victor = trustedIdentity('victor');
  const authorities = new Map([
    ['session-victor', victor],
    ['session-revoked', Object.freeze({
      ...victor,
      currentRevocationGeneration: victor.currentRevocationGeneration + 1
    })]
  ]);
  const server = createVexLifeBrowserServer({
    companionBridge: fakeCompanion({ count: 0 }),
    familyConversationHome: home,
    familyConversationNow: () => T5,
    resolveFamilyConversationAuthority: ({ request }) => authorities.get(request.headers['x-vex-test-session']) ?? null
  });
  const base = await listen(server, t);

  const topLevelForgery = await postFamily(base, {
    operation: 'APPEND',
    intent: appendIntent(record, 'Forged top-level authority.', 'server-forged-top-level'),
    membership: victor.membership,
    channel
  }, 'session-victor');
  assert.equal(topLevelForgery.status, 400);
  assert.equal(topLevelForgery.body.failureCode, 'FAMILY_CONVERSATION_REQUEST_NOT_ADMITTED');

  const speakerForgery = await postFamily(base, {
    operation: 'APPEND',
    intent: {
      ...appendIntent(record, 'Forged speaker.', 'server-forged-speaker'),
      speakerRef: 'principal.alex'
    }
  }, 'session-victor');
  assert.equal(speakerForgery.status, 400);
  assert.equal(speakerForgery.body.failureCode, 'BROWSER_FAMILY_BRIDGE_UNTRUSTED_FIELD');

  const revoked = await postFamily(base, {
    operation: 'READ',
    intent: {
      spaceRef: SPACE,
      channelRef: GROUP,
      expectedMembershipGeneration: record.membershipGeneration
    }
  }, 'session-revoked');
  assert.equal(revoked.status, 403);
  assert.equal(revoked.body.failureCode, 'BROWSER_FAMILY_BRIDGE_DENIED');

  const stale = await postFamily(base, {
    operation: 'READ',
    intent: {
      spaceRef: SPACE,
      channelRef: GROUP,
      expectedMembershipGeneration: record.membershipGeneration - 1
    }
  }, 'session-victor');
  assert.equal(stale.status, 409);
  assert.equal(stale.body.failureCode, 'BROWSER_FAMILY_BRIDGE_STALE');

  const staleHistory = await postFamily(base, {
    operation: 'READ_THREAD_HISTORY',
    intent: {
      spaceRef: SPACE,
      channelRef: GROUP,
      expectedMembershipGeneration: record.membershipGeneration - 1
    }
  }, 'session-victor');
  assert.equal(staleHistory.status, 409);
  assert.equal(staleHistory.body.failureCode, 'BROWSER_FAMILY_BRIDGE_STALE');

  const forgedHistory = await postFamily(base, {
    operation: 'READ_THREAD_HISTORY',
    intent: {
      spaceRef: SPACE,
      channelRef: GROUP,
      expectedMembershipGeneration: record.membershipGeneration,
      principalBindingRef: 'principal-binding.forged'
    }
  }, 'session-victor');
  assert.equal(forgedHistory.status, 400);
  assert.equal(forgedHistory.body.failureCode, 'BROWSER_FAMILY_BRIDGE_UNTRUSTED_FIELD');
});

test('SC-06: production-default Family route has no synthetic session fallback and fails closed', async (t) => {
  const { home, record } = setupFamily(t);
  const server = createVexLifeBrowserServer({
    companionBridge: fakeCompanion({ count: 0 }),
    familyConversationHome: home,
    familyConversationNow: () => T5
  });
  const base = await listen(server, t);

  const result = await postFamily(base, {
    operation: 'LIST',
    intent: {
      spaceRef: SPACE,
      expectedMembershipGeneration: record.membershipGeneration
    }
  });
  assert.equal(result.status, 503);
  assert.equal(result.body.failureCode, 'FAMILY_SESSION_AUTHORITY_UNAVAILABLE');
});


test('SC-08: browser carrier delegates Family semantic work to ServerFamilyConversationCapability without passing raw transport', async (t) => {
  const authority = trustedIdentity('victor');
  const calls = [];
  const server = createVexLifeBrowserServer({
    companionBridge: fakeCompanion({ count: 0 }),
    familyConversationHome: tempHome(t),
    resolveFamilyConversationAuthority: () => authority,
    serverFamilyConversationCapabilityFactory: (dependencies) => {
      assert.equal(typeof dependencies.appendFamilyMessage, 'function');
      assert.equal(typeof dependencies.readFamilyConversation, 'function');
      assert.equal(typeof dependencies.readFamilyThreadHistory, 'function');
      assert.equal(typeof dependencies.listFamilyChannels, 'function');
      return Object.freeze({
        bootstrap(input) {
          calls.push(['BOOTSTRAP', input]);
          return Object.freeze({
            state: 'EMPTY',
            truthClass: 'CURRENT_LIVE_FAMILY',
            currentPrincipalRef: input.authority.membership.principalRef,
            rooms: Object.freeze([])
          });
        },
        perform(input) {
          calls.push(['PERFORM', input]);
          return Object.freeze({ state: 'CURRENT', channels: Object.freeze([]) });
        }
      });
    }
  });
  const base = await listen(server, t);

  const bootstrapResponse = await fetch(`${base}${BROWSER_FAMILY_ROOM_BOOTSTRAP_API_PATH}`);
  assert.equal(bootstrapResponse.status, 200);
  const bootstrap = await bootstrapResponse.json();
  assert.equal(bootstrap.state, 'EMPTY');

  const listed = await postFamily(base, {
    operation: 'LIST',
    intent: {
      spaceRef: SPACE,
      expectedMembershipGeneration: 0
    }
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.state, 'CURRENT');

  assert.deepEqual(calls.map(([kind]) => kind), ['BOOTSTRAP', 'PERFORM']);
  assert.deepEqual(Object.keys(calls[0][1]), ['authority']);
  assert.deepEqual(Object.keys(calls[1][1]).sort(), ['authority', 'intent', 'operation']);
  assert.equal(Object.hasOwn(calls[1][1], 'request'), false);
  assert.equal(Object.hasOwn(calls[1][1], 'headers'), false);
  assert.equal(Object.hasOwn(calls[1][1], 'sessionRef'), false);
});

// [VXG RealForever]
