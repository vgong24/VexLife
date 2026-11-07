import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  GLOBAL_ANNOUNCEMENT_CONTRACT_REF,
  GLOBAL_ANNOUNCEMENT_POLL_REQUEST_SCHEMA
} from '../src/core/global-announcement-contract.mjs';
import {
  GLOBAL_ANNOUNCEMENT_POLL_CAPABILITY_REF,
  HOME_GLOBAL_ANNOUNCEMENT_POLL_ACTION_REF,
  evaluateHomeGlobalAnnouncementPollAdmission
} from '../src/core/home-global-announcement-poll.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = '2026-11-07T08:00:00.000Z';

function rehash(value, field) {
  const core = structuredClone(value);
  delete core[field];
  return { ...core, [field]: semanticHash(core) };
}

function authority() {
  const membership = rehash({
    schemaVersion: 'vexlife.bridge-device-membership/v1',
    membershipRef: 'membership.vexlife.global-announcement.001',
    homeNodeRef: 'home-node.vexlife.global-announcement.001',
    principalRef: 'person.victor-gong',
    deviceRef: 'device.vexlife.global-announcement.001',
    devicePublicKey: 'synthetic-public-key',
    capabilityRefs: [GLOBAL_ANNOUNCEMENT_POLL_CAPABILITY_REF],
    approvedBy: 'person.victor-gong',
    approvedAt: '2026-11-07T07:00:00.000Z',
    revocationGeneration: 4,
    state: 'ACTIVE'
  }, 'membershipHash');
  const lease = rehash({
    schemaVersion: 'vexlife.bridge-capability-lease/v1',
    leaseRef: 'lease.vexlife.global-announcement.001',
    homeNodeRef: membership.homeNodeRef,
    principalRef: membership.principalRef,
    deviceRef: membership.deviceRef,
    capabilityRefs: [GLOBAL_ANNOUNCEMENT_POLL_CAPABILITY_REF],
    projectRefs: [],
    issuedAt: '2026-11-07T07:30:00.000Z',
    expiresAt: '2026-11-07T08:30:00.000Z',
    revocationGeneration: 4,
    state: 'ACTIVE'
  }, 'leaseHash');
  return {
    schemaVersion: 'vexlife.home-bridge-session-authority/v1',
    state: 'CURRENT',
    authorityReceiptRef: 'receipt.vexlife.home-bridge-session-authority.global-announcement.001',
    stableSessionBindingRef: 'session-binding.vexlife.global-announcement.001',
    principalRef: membership.principalRef,
    deviceRef: membership.deviceRef,
    membership,
    lease,
    currentRevocationGeneration: 4,
    sourceReceiptRefs: ['receipt.source.global-announcement.001'],
    currentnessRefs: ['currentness.global-announcement.001'],
    effects: {
      pairingMutation: false,
      principalRebinding: false,
      authenticationMutation: false,
      authorizationMutation: false,
      capabilityLeaseMutation: false,
      revocationMutation: false,
      HomePayloadReadOrWrite: false,
      networkMutation: false,
      MemoryMutation: false,
      RelationshipsMutation: false,
      modelRuntimeEffect: false,
      training: false,
      publication: false
    }
  };
}

function pollRequest(overrides = {}) {
  return {
    schemaVersion: GLOBAL_ANNOUNCEMENT_POLL_REQUEST_SCHEMA,
    contractRef: GLOBAL_ANNOUNCEMENT_CONTRACT_REF,
    requestRef: 'request.vexlife.global-announcement.poll.001',
    ...overrides
  };
}

function candidate(overrides = {}) {
  return {
    pollRequest: pollRequest(),
    sessionAuthority: authority(),
    now: NOW,
    roleCapabilityRefs: [GLOBAL_ANNOUNCEMENT_POLL_CAPABILITY_REF],
    projectCapabilityRefs: [GLOBAL_ANNOUNCEMENT_POLL_CAPABILITY_REF],
    resourceCapabilityRefs: [GLOBAL_ANNOUNCEMENT_POLL_CAPABILITY_REF],
    rawModelEndpointExposed: false,
    ...overrides
  };
}

test('C1 admits one valid portable Poll request without provider or network execution', () => {
  const result = evaluateHomeGlobalAnnouncementPollAdmission(candidate());
  assert.equal(result.state, 'HOME_ROUTED_GLOBAL_ANNOUNCEMENT_POLL_ADMITTED');
  assert.equal(result.contractRef, GLOBAL_ANNOUNCEMENT_CONTRACT_REF);
  assert.equal(result.actionRef, HOME_GLOBAL_ANNOUNCEMENT_POLL_ACTION_REF);
  assert.equal(result.capabilityRef, GLOBAL_ANNOUNCEMENT_POLL_CAPABILITY_REF);
  assert.deepEqual(result.pollRequest, pollRequest());
  assert.equal(result.pollRequestHash, semanticHash(pollRequest()));
  assert.deepEqual(result.admittedCapabilityRefs, [GLOBAL_ANNOUNCEMENT_POLL_CAPABILITY_REF]);
  assert.equal(result.canonicalWriter, 'DESKTOP_HOME_NODE');
  assert.equal(result.remoteWriterGranted, false);
  assert.equal(result.standingHomeAuthority, false);
  assert.ok(Object.values(result.truth).every((value) => value === false));
});

test('C1 consumes the accepted C0 request validator and rejects session-local field invention', () => {
  const value = candidate();
  value.pollRequest = pollRequest({ principalRef: 'principal.forged' });
  const result = evaluateHomeGlobalAnnouncementPollAdmission(value);
  assert.equal(result.state, 'HOME_ROUTED_GLOBAL_ANNOUNCEMENT_POLL_UNAVAILABLE');
  assert.equal(result.reason, 'GLOBAL_ANNOUNCEMENT_UNREGISTERED_FIELD');
  assert.equal(result.pollRequest, null);
});

test('C1 requires one exact current effect-free Home session-authority projection', () => {
  const cases = [
    ['HOME_BRIDGE_SESSION_AUTHORITY_NOT_CURRENT', (a) => { a.state = 'STALE'; }],
    ['HOME_BRIDGE_SESSION_AUTHORITY_EFFECTFUL', (a) => { a.effects.networkMutation = true; }],
    ['HOME_BRIDGE_SESSION_REVOCATION_MISMATCH', (a) => { a.currentRevocationGeneration = 5; }]
  ];
  for (const [reason, mutate] of cases) {
    const value = candidate();
    mutate(value.sessionAuthority);
    const result = evaluateHomeGlobalAnnouncementPollAdmission(value);
    assert.equal(result.state, 'HOME_ROUTED_GLOBAL_ANNOUNCEMENT_POLL_UNAVAILABLE', reason);
    assert.equal(result.reason, reason);
  }
});

test('C1 preserves Home Bridge expiry, scope intersection, and raw-model-endpoint denial', () => {
  const cases = [
    ['HOME_BRIDGE_LEASE_EXPIRED', (c) => {
      c.sessionAuthority.lease = rehash({
        ...c.sessionAuthority.lease,
        expiresAt: '2026-11-07T07:59:59.000Z'
      }, 'leaseHash');
    }],
    ['HOME_BRIDGE_CAPABILITY_DENIED', (c) => { c.roleCapabilityRefs = []; }],
    ['HOME_BRIDGE_CAPABILITY_DENIED', (c) => { c.projectCapabilityRefs = []; }],
    ['HOME_BRIDGE_CAPABILITY_DENIED', (c) => { c.resourceCapabilityRefs = []; }],
    ['HOME_BRIDGE_CAPABILITY_DENIED', (c) => { c.rawModelEndpointExposed = true; }]
  ];
  for (const [reason, mutate] of cases) {
    const value = candidate();
    mutate(value);
    const result = evaluateHomeGlobalAnnouncementPollAdmission(value);
    assert.equal(result.state, 'HOME_ROUTED_GLOBAL_ANNOUNCEMENT_POLL_UNAVAILABLE', reason);
    assert.equal(result.reason, reason);
  }
});

test('C1 registers one concrete private Home admission action/module while capability remains requestable', () => {
  const actions = JSON.parse(fs.readFileSync(path.join(root, 'blueprint/fragments/actions.json'), 'utf8'));
  const capabilities = JSON.parse(fs.readFileSync(path.join(root, 'blueprint/capability-registry.json'), 'utf8'));
  const modules = JSON.parse(fs.readFileSync(path.join(root, 'blueprint/module-registry/core.json'), 'utf8'));

  const action = actions.find((item) => item.actionRef === HOME_GLOBAL_ANNOUNCEMENT_POLL_ACTION_REF);
  assert.ok(action);
  assert.equal(action.permissionRef, 'permission.none');
  assert.equal(action.effectClass, 'PRIVATE_HOME_ROUTED_READ_ADMIT_GLOBAL_ANNOUNCEMENT_POLL');
  assert.deepEqual(action.inputSchema, { requestRef: 'ref' });
  assert.deepEqual(action.outputStateRefs, []);

  const capability = capabilities.capabilities.find(
    (item) => item.capabilityRef === GLOBAL_ANNOUNCEMENT_POLL_CAPABILITY_REF
  );
  assert.ok(capability);
  assert.equal(capability.defaultStage, 'REQUESTABLE');
  assert.deepEqual(capability.actionRefs, []);
  assert.equal(capability.toolContract, undefined);

  const module = modules.find(
    (item) => item.moduleRef === 'module.vexlife.core.home-global-announcement-poll'
  );
  assert.ok(module);
  assert.equal(module.path, 'src/core/home-global-announcement-poll.mjs');
  assert.deepEqual(module.writes, []);
  assert.ok(module.reads.includes('module.vexlife.core.global-announcement-contract'));
  assert.ok(module.reads.includes('module.vexlife.core.home-bridge'));
  assert.ok(module.reads.includes('src/core/home-bridge-session-authority.mjs'));
  assert.ok(module.reads.includes(GLOBAL_ANNOUNCEMENT_POLL_CAPABILITY_REF));
});

test('C1 admitted output exposes no principal, device, lease, key, provider, endpoint or network truth', () => {
  const result = evaluateHomeGlobalAnnouncementPollAdmission(candidate());
  const serialized = JSON.stringify(result);
  for (const forbidden of [
    'person.victor-gong',
    'device.vexlife.global-announcement.001',
    'lease.vexlife.global-announcement.001',
    'devicePublicKey',
    'providerRef',
    'apiKey',
    'endpoint',
    'privateKey'
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  for (const absentField of [
    'networkAvailable',
    'serviceAvailable',
    'providerResult',
    'announcementState',
    'notificationDecision'
  ]) {
    assert.equal(Object.hasOwn(result, absentField), false, absentField);
  }
});

// [VXG RealForever]
