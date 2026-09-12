import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import {
  approvePairing,
  classifyActiveCompanion,
  createPairingOffer,
  evaluateRemoteRequest,
  issueCapabilityLease,
  revokeDevice,
  validateHomeBridgeRegistry
} from '../src/core/home-bridge.mjs';

const bundle = loadBlueprint();
const offer = createPairingOffer({
  pairingRef: 'pairing.test.001',
  homeNodeRef: 'home.victor.windows',
  homePublicKey: 'public-key-placeholder',
  oneTimeNonceHash: 'nonce-hash-placeholder',
  humanFingerprint: 'LIME-RIVER-42',
  requestedCapabilityRefs: ['capability.vexlife.navigation', 'capability.vexlife.file.read'],
  expiresAt: '2026-07-30T12:05:00Z'
});

test('Home Bridge registry makes remote, sibling and hybrid identities explicit', () => {
  const result = validateHomeBridgeRegistry(bundle.bridge, { testRefs: new Set(bundle.blueprint.tests.map((item) => item.testRef)) });
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.deepEqual(bundle.bridge.modes, ['REMOTE_HOME', 'LOCAL_SIBLING', 'HYBRID']);
});

test('pairing is fingerprint-bound, expiring and single-use', () => {
  const approved = approvePairing({
    offer,
    deviceRef: 'device.victor.macbook',
    devicePublicKey: 'mac-public-key-placeholder',
    approvedCapabilityRefs: ['capability.vexlife.navigation', 'capability.vexlife.file.read', 'capability.vexlife.file.edit-with-recovery'],
    approvedBy: 'person.victor-gong',
    approvedAt: '2026-07-30T12:00:00Z',
    expectedFingerprint: 'LIME-RIVER-42'
  });
  assert.equal(approved.state, 'PAIRED');
  assert.deepEqual(approved.membership.capabilityRefs, ['capability.vexlife.file.read', 'capability.vexlife.navigation']);
  const replay = approvePairing({
    offer: approved.consumedOffer,
    deviceRef: 'device.victor.macbook',
    devicePublicKey: 'mac-public-key-placeholder',
    approvedCapabilityRefs: [],
    approvedBy: 'person.victor-gong',
    approvedAt: '2026-07-30T12:01:00Z'
  });
  assert.equal(replay.state, 'PAIRING_REPLAY_REJECTED');
});

test('remote request receives the most restrictive capability intersection and keeps desktop as writer', () => {
  const approved = approvePairing({
    offer,
    deviceRef: 'device.victor.macbook',
    devicePublicKey: 'mac-public-key-placeholder',
    approvedCapabilityRefs: ['capability.vexlife.navigation', 'capability.vexlife.file.read'],
    approvedBy: 'person.victor-gong',
    approvedAt: '2026-07-30T12:00:00Z'
  });
  const lease = issueCapabilityLease({
    leaseRef: 'lease.test.001',
    membership: approved.membership,
    requestedCapabilityRefs: ['capability.vexlife.navigation', 'capability.vexlife.file.read'],
    projectRefs: ['project.vexlife'],
    issuedAt: '2026-07-30T12:00:00Z',
    expiresAt: '2026-07-30T13:00:00Z'
  });
  const decision = evaluateRemoteRequest({
    request: { requestRef: 'request.test.001', deviceRef: approved.membership.deviceRef, actionRef: 'action.file.read' },
    membership: approved.membership,
    lease,
    now: '2026-07-30T12:30:00Z',
    currentRevocationGeneration: 0,
    registeredActionRefs: ['action.file.read'],
    requiredCapabilityRefs: ['capability.vexlife.file.read'],
    roleCapabilityRefs: ['capability.vexlife.file.read'],
    projectCapabilityRefs: ['capability.vexlife.file.read'],
    resourceCapabilityRefs: ['capability.vexlife.file.read'],
    rawModelEndpointExposed: false
  });
  assert.equal(decision.state, 'REMOTE_REQUEST_ADMITTED');
  assert.equal(decision.canonicalWriter, 'DESKTOP_HOME_NODE');
  assert.equal(decision.remoteWriterGranted, false);
});

test('raw model exposure fails closed and revocation invalidates prior lease generation', () => {
  const approved = approvePairing({
    offer,
    deviceRef: 'device.victor.macbook',
    devicePublicKey: 'mac-public-key-placeholder',
    approvedCapabilityRefs: ['capability.vexlife.navigation'],
    approvedBy: 'person.victor-gong',
    approvedAt: '2026-07-30T12:00:00Z'
  });
  const lease = issueCapabilityLease({
    leaseRef: 'lease.test.002', membership: approved.membership,
    requestedCapabilityRefs: ['capability.vexlife.navigation'],
    issuedAt: '2026-07-30T12:00:00Z', expiresAt: '2026-07-30T13:00:00Z'
  });
  const exposed = evaluateRemoteRequest({
    request: { requestRef: 'request.test.002', deviceRef: approved.membership.deviceRef, actionRef: 'action.view.select' },
    membership: approved.membership, lease, now: '2026-07-30T12:10:00Z', currentRevocationGeneration: 0,
    registeredActionRefs: ['action.view.select'], requiredCapabilityRefs: ['capability.vexlife.navigation'],
    roleCapabilityRefs: ['capability.vexlife.navigation'], projectCapabilityRefs: ['capability.vexlife.navigation'], resourceCapabilityRefs: ['capability.vexlife.navigation'],
    rawModelEndpointExposed: true
  });
  assert.equal(exposed.state, 'CAPABILITY_DENIED');
  assert.equal(exposed.reason, 'RAW_MODEL_ENDPOINT_EXPOSED');
  const revoked = revokeDevice({ membership: approved.membership, revokedAt: '2026-07-30T12:11:00Z', reason: 'user requested' });
  assert.equal(revoked.state, 'DEVICE_REVOKED');
  const after = evaluateRemoteRequest({
    request: { requestRef: 'request.test.003', deviceRef: approved.membership.deviceRef, actionRef: 'action.view.select' },
    membership: approved.membership, lease, now: '2026-07-30T12:12:00Z', currentRevocationGeneration: revoked.membership.revocationGeneration,
    registeredActionRefs: ['action.view.select'], requiredCapabilityRefs: ['capability.vexlife.navigation'],
    roleCapabilityRefs: ['capability.vexlife.navigation'], projectCapabilityRefs: ['capability.vexlife.navigation'], resourceCapabilityRefs: ['capability.vexlife.navigation']
  });
  assert.equal(after.state, 'DEVICE_REVOKED');
});

test('hybrid mode never silently substitutes a local sibling when the Home Vex is offline', () => {
  const state = classifyActiveCompanion({
    mode: 'HYBRID',
    remoteCompanionLineageRef: 'companion.victor.windows',
    localSiblingLineageRef: 'companion.victor.macbook',
    remoteReachable: false
  });
  assert.equal(state.state, 'EXPLICIT_LOCAL_SIBLING_CHOICE_REQUIRED');
  assert.equal(state.substitutionOccurred, false);
});

// [VXG RealForever]
