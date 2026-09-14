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
  createFamilySpace
} from '../src/core/family-space-store.mjs';
import { createFamilyChannel } from '../src/core/family-conversation.mjs';
import {
  materializeConversationChannel,
  readConversationChannelBinding
} from '../src/core/conversation-store.mjs';
import {
  BROWSER_FAMILY_CONVERSATION_API_PATH,
  createVexLifeBrowserServer
} from '../scripts/serve-browser.mjs';

const T0 = '2026-09-13T20:00:00.000Z';
const T1 = '2026-09-13T20:10:00.000Z';
const T2 = '2026-09-13T20:20:00.000Z';
const T3 = '2026-09-13T20:30:00.000Z';
const T4 = '2026-09-13T20:40:00.000Z';
const T5 = '2026-09-13T20:50:00.000Z';
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

// [VXG RealForever]
