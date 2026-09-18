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
import { materializeConversationChannel } from '../src/core/conversation-store.mjs';
import {
  BROWSER_FAMILY_CONVERSATION_API_PATH,
  createVexLifeBrowserServer
} from '../scripts/serve-browser-core.mjs';
import {
  VEX_CORE_FAMILY_SESSION_AUTHORITY_SCHEMA,
  VexCoreFamilySessionAuthorityError,
  createVexCoreFamilySessionAuthorityResolver
} from '../src/core/vex-core-family-session-authority.mjs';

const T0 = '2026-09-18T00:00:00.000Z';
const T1 = '2026-09-18T00:10:00.000Z';
const T2 = '2026-09-18T00:20:00.000Z';
const T9 = '2026-09-18T06:00:00.000Z';
const HOME_NODE = 'home.vex-family.vex-core-authority-test';
const SPACE = 'space.vex-family.vex-core-authority-test';
const CHANNEL = 'channel.vex-family.vex-core-authority-test';

const EFFECTS = Object.freeze({
  authenticationMutation: false,
  authorizationMutation: false,
  membershipMutation: false,
  capabilityLeaseMutation: false,
  revocationMutation: false,
  HomePayloadReadOrWrite: false,
  remoteHomeWrite: false,
  networkMutation: false,
  credentialMutation: false,
  MemoryMutation: false,
  RelationshipsMutation: false,
  modelRuntimeEffect: false,
  publication: false
});

function tempHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vex-family-vex-core-authority-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function trustedIdentity(name) {
  const principalRef = `principal.${name}`;
  const deviceRef = `device.${name}`;
  const offer = createPairingOffer({
    pairingRef: `pairing.vex-core-authority.${name}`,
    homeNodeRef: HOME_NODE,
    homePublicKey: 'vex-core-authority-home-public-key',
    oneTimeNonceHash: `vex-core-authority-nonce-${name}`,
    humanFingerprint: `vex-core-authority-fingerprint-${name}`,
    requestedCapabilityRefs: [],
    expiresAt: T9
  });
  const paired = approvePairing({
    offer,
    principalRef,
    deviceRef,
    devicePublicKey: `vex-core-authority-device-key-${name}`,
    approvedCapabilityRefs: [],
    approvedBy: 'principal.victor',
    approvedAt: T0,
    expectedFingerprint: `vex-core-authority-fingerprint-${name}`
  });
  assert.equal(paired.state, 'PAIRED');
  const lease = issueCapabilityLease({
    leaseRef: `lease.vex-core-authority.${name}`,
    membership: paired.membership,
    requestedCapabilityRefs: [],
    projectRefs: ['project.vex-family.vex-core-authority-test'],
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

function vexCoreProjection(identity, name) {
  return Object.freeze({
    schemaVersion: 'vextreme.vex-core.home-session-authority/v1',
    state: 'CURRENT',
    stableSessionBindingRef: `session-binding.vex-core-authority.${name}`,
    principalRef: identity.membership.principalRef,
    deviceRef: identity.membership.deviceRef,
    homeRef: identity.membership.homeNodeRef,
    currentRevocationGeneration: identity.currentRevocationGeneration,
    securityMembershipRef: `membership.security.vex-core-authority.${name}`,
    securityAuthenticationReceiptRef: `authentication.vex-core-authority.${name}`,
    securityAuthorizationReceiptRef: `authority.vex-core-authority.${name}`,
    securityLeaseRef: `lease.security.vex-core-authority.${name}`,
    safetyStateDigest: `safety-state.vex-core-authority.${name}`,
    safetyEvaluationRef: `owner-evaluation.vex-core-authority.${name}`,
    allowedProductCapabilityRefs: Object.freeze([]),
    membership: identity.membership,
    lease: identity.lease,
    sourceReceiptRefs: Object.freeze([
      `receipt.session.vex-core-authority.${name}`,
      `receipt.safety.vex-core-authority.${name}`
    ]),
    currentnessRefs: Object.freeze([
      `currentness.session.vex-core-authority.${name}`,
      `currentness.safety.vex-core-authority.${name}`
    ]),
    effects: EFFECTS
  });
}

function setupFamily(t) {
  const home = tempHome(t);
  let record = createFamilySpace({
    home,
    spaceRef: SPACE,
    ownerPrincipalRef: 'principal.victor',
    ownerPrincipalBindingRef: 'principal-binding.victor',
    familyCompanionLineageRef: 'lineage.vex.family.vex-core-authority-test',
    observedAt: T0,
    instanceRef: 'instance.vex-core-authority.family-create'
  }).record;
  record = addFamilyMember({
    home,
    spaceRef: SPACE,
    actorPrincipalRef: 'principal.victor',
    principalRef: 'principal.alex',
    principalBindingRef: 'principal-binding.alex',
    expectedRevision: record.revision,
    expectedMembershipGeneration: record.membershipGeneration,
    observedAt: T1,
    instanceRef: 'instance.vex-core-authority.add-alex'
  }).record;
  const channel = createFamilyChannel({
    channelRef: CHANNEL,
    threadRef: 'thread.vex-family.vex-core-authority-test',
    familySpaceRecord: record,
    createdAt: T1
  });
  materializeConversationChannel({
    home,
    channel,
    instanceRef: 'instance.vex-core-authority.channel-materialize',
    observedAt: T1
  });
  return Object.freeze({ home, record });
}

function fakeCompanion() {
  return Object.freeze({
    status() {
      return Object.freeze({ state: 'TEST_ONLY' });
    },
    async performTurn() {
      throw new Error('Family authority projection test must not invoke model work');
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

async function post(base, body, sessionRef) {
  const response = await fetch(`${base}${BROWSER_FAMILY_CONVERSATION_API_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-vex-test-session': sessionRef
    },
    body: JSON.stringify(body)
  });
  return Object.freeze({
    status: response.status,
    body: await response.json()
  });
}

test('VFA-00: effect-free CURRENT VEX_CORE projection maps to only the trusted Family tuple', async () => {
  const identity = trustedIdentity('victor');
  const projection = vexCoreProjection(identity, 'victor');
  let observedContext = null;
  const resolver = createVexCoreFamilySessionAuthorityResolver({
    resolveVexCoreAuthority: async (context) => {
      observedContext = context;
      return projection;
    }
  });

  const request = Object.freeze({ serverOwned: true });
  const result = await resolver({
    request,
    operation: 'READ',
    target: { spaceRef: SPACE, channelRef: CHANNEL }
  });

  assert.equal(VEX_CORE_FAMILY_SESSION_AUTHORITY_SCHEMA, 'vexlife.vex-core-family-session-authority/v1');
  assert.deepEqual(Object.keys(result).sort(), [
    'currentRevocationGeneration',
    'lease',
    'membership'
  ]);
  assert.equal(result.membership.principalRef, 'principal.victor');
  assert.equal(result.lease.principalRef, 'principal.victor');
  assert.equal(result.currentRevocationGeneration, 0);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.membership));
  assert.ok(Object.isFrozen(result.lease));
  assert.equal(observedContext.request, request);
  assert.equal(observedContext.operation, 'READ');
  assert.deepEqual(observedContext.target, { spaceRef: SPACE, channelRef: CHANNEL });
  assert.equal(Object.hasOwn(result, 'stableSessionBindingRef'), false);
  assert.equal(Object.hasOwn(result, 'effects'), false);
});

test('VFA-01: effectful, stale, or identity-mismatched VEX_CORE projections fail closed', async () => {
  const identity = trustedIdentity('victor');
  const current = vexCoreProjection(identity, 'victor');

  const cases = [
    {
      projection: { ...current, state: 'STALE' },
      code: 'VEX_CORE_FAMILY_AUTHORITY_NOT_CURRENT'
    },
    {
      projection: {
        ...current,
        effects: { ...current.effects, networkMutation: true }
      },
      code: 'VEX_CORE_FAMILY_AUTHORITY_EFFECTFUL_PROJECTION'
    },
    {
      projection: {
        ...current,
        principalRef: 'principal.alex'
      },
      code: 'VEX_CORE_FAMILY_AUTHORITY_IDENTITY_MISMATCH'
    },
    {
      projection: {
        ...current,
        currentRevocationGeneration: 1
      },
      code: 'VEX_CORE_FAMILY_AUTHORITY_REVOCATION_MISMATCH'
    }
  ];

  for (const item of cases) {
    const resolver = createVexCoreFamilySessionAuthorityResolver({
      resolveVexCoreAuthority: async () => item.projection
    });
    await assert.rejects(
      resolver({
        request: {},
        operation: 'LIST',
        target: { spaceRef: SPACE, channelRef: null }
      }),
      (error) => (
        error instanceof VexCoreFamilySessionAuthorityError
        && error.code === item.code
      )
    );
  }
});

test('VFA-02: accepted Family HTTP seam consumes the VEX_CORE projection without browser-authored authority', async (t) => {
  const { home, record } = setupFamily(t);
  const victor = trustedIdentity('victor');
  const projections = new Map([
    ['session-victor', vexCoreProjection(victor, 'victor')]
  ]);
  const resolver = createVexCoreFamilySessionAuthorityResolver({
    resolveVexCoreAuthority: async ({ request }) => (
      projections.get(request.headers['x-vex-test-session']) ?? null
    )
  });

  const server = createVexLifeBrowserServer({
    companionBridge: fakeCompanion(),
    familyConversationHome: home,
    familyConversationNow: () => T2,
    familyConversationInstanceRef: 'instance.vex-core-authority.http',
    resolveFamilyConversationAuthority: resolver
  });
  const base = await listen(server, t);

  const appended = await post(base, {
    operation: 'APPEND',
    intent: {
      spaceRef: SPACE,
      channelRef: CHANNEL,
      content: 'Bounded VEX_CORE authority reaches Family.',
      expectedMembershipGeneration: record.membershipGeneration,
      idempotencyKey: 'vex-core-authority-append-1'
    }
  }, 'session-victor');
  assert.equal(appended.status, 200);
  assert.equal(appended.body.message.speakerRef, 'principal.victor');

  const read = await post(base, {
    operation: 'READ',
    intent: {
      spaceRef: SPACE,
      channelRef: CHANNEL,
      expectedMembershipGeneration: record.membershipGeneration
    }
  }, 'session-victor');
  assert.equal(read.status, 200);
  assert.deepEqual(
    read.body.messages.map((message) => message.speakerRef),
    ['principal.victor']
  );

  const forged = await fetch(`${base}${BROWSER_FAMILY_CONVERSATION_API_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-vex-test-session': 'session-victor'
    },
    body: JSON.stringify({
      operation: 'READ',
      intent: {
        spaceRef: SPACE,
        channelRef: CHANNEL,
        expectedMembershipGeneration: record.membershipGeneration
      },
      principalRef: 'principal.alex'
    })
  });
  assert.equal(forged.status, 400);
  assert.equal((await forged.json()).failureCode, 'FAMILY_CONVERSATION_REQUEST_NOT_ADMITTED');
});

test('VFA-03: VEX_CORE resolver failure remains a 503 server-authority hold', async (t) => {
  const { home, record } = setupFamily(t);
  const server = createVexLifeBrowserServer({
    companionBridge: fakeCompanion(),
    familyConversationHome: home,
    familyConversationNow: () => T2,
    familyConversationInstanceRef: 'instance.vex-core-authority.failure',
    resolveFamilyConversationAuthority: createVexCoreFamilySessionAuthorityResolver({
      resolveVexCoreAuthority: async () => {
        throw new Error('synthetic VEX_CORE owner unavailable');
      }
    })
  });
  const base = await listen(server, t);

  const result = await post(base, {
    operation: 'LIST',
    intent: {
      spaceRef: SPACE,
      expectedMembershipGeneration: record.membershipGeneration
    }
  }, 'session-unavailable');

  assert.equal(result.status, 503);
  assert.equal(result.body.failureCode, 'FAMILY_SESSION_AUTHORITY_UNAVAILABLE');
});

// [VXG RealForever]
