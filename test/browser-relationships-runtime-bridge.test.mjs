import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ACCEPTED_CDR_S5_PRODUCT_MERGE,
  ACCEPTED_FRIEND_GROUP_MERGE,
  ACCEPTED_RELATIONSHIPS_VISIBLE_MERGE,
  ACCEPTED_REPLICA_RECONCILIATION_MERGE,
  ACCEPTED_SDK_CDR_S5_MERGE,
  ACCEPTED_SDK_CDR_S5_POLICY_SHA256,
  ACCEPTED_SOCIAL_BRIDGE_COMPOSITION_MERGE,
  BrowserRelationshipsRuntimeBridgeError,
  createBrowserRelationshipsRuntimeBridge,
  validateRelationshipsRuntimeBridgeSources
} from '../src/core/browser-relationships-runtime-bridge.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = Object.freeze({
  relationshipsRegistry: JSON.parse(fs.readFileSync(path.join(repoRoot, 'blueprint', 'relationships-browser-registry.json'), 'utf8')),
  cdrRegistry: JSON.parse(fs.readFileSync(path.join(repoRoot, 'blueprint', 'cdr-s5-closed-alpha-browser-registry.json'), 'utf8'))
});
const clone = (value) => JSON.parse(JSON.stringify(value));

function admitted(overrides = {}) {
  return {
    alphaConsentAcknowledged: true,
    invitationState: 'RECEIVED_VERIFIED_REFERENCE',
    invitationDecision: 'ACCEPT',
    identityState: 'VERIFIED_CURRENT',
    presenceClass: 'APP_ON_MODEL_UNLOADED',
    routeClass: 'DIRECT_CANDIDATE',
    failureState: 'NONE',
    withdrawn: false,
    revoked: false,
    disconnected: false,
    blocked: false,
    localRelationshipFormed: true,
    ...overrides
  };
}

function errorCode(fn) {
  try { fn(); } catch (error) { return error.code; }
  return null;
}

test('Relationships runtime bridge source validation binds the accepted invite-only/no-effect product and CDR registries', () => {
  const result = validateRelationshipsRuntimeBridgeSources(sources);
  assert.equal(result.relationshipsRegistry.registryRef, 'registry.vexlife.relationships-browser.002');
  assert.equal(result.relationshipsRegistry.resource.resourceRef, 'resource.vexlife.relationships');
  assert.equal(result.relationshipsRegistry.discoveryMode, 'INVITE_ONLY');
  assert.equal(result.relationshipsRegistry.publicSearch, false);
  assert.equal(result.relationshipsRegistry.relationshipTruth.localDirectionalOnly, true);
  assert.equal(result.relationshipsRegistry.relationshipTruth.counterpartClaimIndependent, true);
  assert.equal(result.relationshipsRegistry.relationshipTruth.groupMembershipImpliesFriendship, false);
  assert.equal(result.relationshipsRegistry.relationshipTruth.invitationAcceptanceImpliesPersistence, false);
  assert.equal(result.cdrRegistry.registryRef, 'registry.vexlife.cdr-s5.closed-alpha-browser.001');
  assert.equal(result.cdrRegistry.discoveryMode, 'INVITE_ONLY');
  assert.equal(result.cdrRegistry.publicSearch, false);
  assert.equal(result.cdrRegistry.networkEffectAllowed, false);
  assert.equal(result.cdrRegistry.relationshipMutationAllowed, false);
});

test('Relationships runtime bridge fails closed when accepted source truth drifts', () => {
  const relationshipDrift = clone(sources);
  relationshipDrift.relationshipsRegistry.relationshipTruth.invitationAcceptanceImpliesPersistence = true;
  assert.equal(errorCode(() => validateRelationshipsRuntimeBridgeSources(relationshipDrift)), 'RELATIONSHIPS_RUNTIME_SOURCE_NOT_CURRENT');

  const cdrDrift = clone(sources);
  cdrDrift.cdrRegistry.publicSearch = true;
  assert.equal(errorCode(() => validateRelationshipsRuntimeBridgeSources(cdrDrift)), 'RELATIONSHIPS_RUNTIME_SOURCE_NOT_CURRENT');

  const routeDrift = clone(sources);
  routeDrift.cdrRegistry.routeClasses = routeDrift.cdrRegistry.routeClasses.filter((value) => value !== 'UNAVAILABLE');
  assert.equal(errorCode(() => validateRelationshipsRuntimeBridgeSources(routeDrift)), 'RELATIONSHIPS_RUNTIME_SOURCE_NOT_CURRENT');
});

test('fully admitted product truth produces HOST_BINDING_REQUIRED and exact accepted source bindings without performing an effect', () => {
  const plan = createBrowserRelationshipsRuntimeBridge(sources).prepare(admitted());
  assert.equal(plan.state, 'HOST_BINDING_REQUIRED');
  assert.equal(plan.truthClass, 'CURRENT_PRODUCT_TO_ACCEPTED_CDR_BRIDGE_PLAN');
  assert.deepEqual(plan.reasons, []);
  assert.equal(plan.productGateSnapshot.discoveryMode, 'INVITE_ONLY');
  assert.equal(plan.productGateSnapshot.publicSearch, false);
  assert.equal(plan.productGateSnapshot.presenceClass, 'APP_ON_MODEL_UNLOADED');
  assert.equal(plan.relationshipProjection.localRelationshipFormed, true);
  assert.equal(plan.relationshipProjection.localDirectionalOnly, true);
  assert.equal(plan.relationshipProjection.counterpartClaimIndependent, true);
  assert.equal(plan.relationshipProjection.relationshipPersisted, false);
  assert.equal(plan.hostExecutionDeferred, true);
  assert.equal(plan.semanticAcknowledged, false);
  assert.equal(plan.realOutsideParticipantRequired, false);
  assert.deepEqual(plan.requiredHostRoles, [
    { platformRole: 'MAC_LISTENER', runtimeRole: 'LISTENER' },
    { platformRole: 'WINDOWS_CONNECTOR', runtimeRole: 'CONNECTOR' }
  ]);
  assert.equal(plan.sourceBindings.relationships.acceptedVisibleMerge, ACCEPTED_RELATIONSHIPS_VISIBLE_MERGE);
  assert.equal(plan.sourceBindings.cdrProduct.acceptedMerge, ACCEPTED_CDR_S5_PRODUCT_MERGE);
  assert.equal(plan.sourceBindings.sdkCoordinator.acceptedMerge, ACCEPTED_SDK_CDR_S5_MERGE);
  assert.equal(plan.sourceBindings.sdkCoordinator.procedurePolicySha256, ACCEPTED_SDK_CDR_S5_POLICY_SHA256);
  assert.equal(plan.sourceBindings.friendGroup.acceptedMerge, ACCEPTED_FRIEND_GROUP_MERGE);
  assert.equal(plan.sourceBindings.replicaReconciliation.acceptedMerge, ACCEPTED_REPLICA_RECONCILIATION_MERGE);
  assert.equal(plan.sourceBindings.socialBridgeComposition.acceptedMerge, ACCEPTED_SOCIAL_BRIDGE_COMPOSITION_MERGE);
  assert.equal(Object.values(plan.effects).every((value) => value === false), true);
});

test('every product/runtime gate remains fail-closed and cannot manufacture host readiness', () => {
  const cases = [
    [{ alphaConsentAcknowledged: false }, 'ALPHA_CONSENT_NOT_ACKNOWLEDGED'],
    [{ invitationState: 'CREATED_LOCAL_REFERENCE' }, 'INVITATION_NOT_RECEIVED_VERIFIED'],
    [{ invitationDecision: 'DEFER' }, 'INVITATION_DECISION_NOT_AFFIRMATIVE'],
    [{ invitationDecision: 'DENY' }, 'INVITATION_DECISION_NOT_AFFIRMATIVE'],
    [{ invitationDecision: 'BLOCK' }, 'INVITATION_DECISION_NOT_AFFIRMATIVE'],
    [{ identityState: 'STALE_EVIDENCE' }, 'IDENTITY_NOT_VERIFIED_CURRENT'],
    [{ routeClass: 'UNAVAILABLE' }, 'ROUTE_UNAVAILABLE'],
    [{ failureState: 'PEER_UNREACHABLE' }, 'FAILURE_STATE_HELD'],
    [{ withdrawn: true }, 'PARTICIPATION_WITHDRAWN'],
    [{ revoked: true }, 'INVITATION_REVOKED'],
    [{ disconnected: true }, 'SESSION_DISCONNECTED'],
    [{ blocked: true }, 'RELATIONSHIP_BLOCKED'],
    [{ localRelationshipFormed: false }, 'LOCAL_RELATIONSHIP_PREVIEW_NOT_READY']
  ];
  const bridge = createBrowserRelationshipsRuntimeBridge(sources);
  for (const [change, expectedReason] of cases) {
    const plan = bridge.prepare(admitted(change));
    assert.equal(plan.state, 'HELD', JSON.stringify(change));
    assert.ok(plan.reasons.includes(expectedReason), `${JSON.stringify(change)} -> ${plan.reasons.join(',')}`);
    assert.deepEqual(plan.requiredHostRoles, []);
    assert.deepEqual(plan.requiredOpaqueBindings, []);
    assert.deepEqual(plan.requiredPrivateBindings, []);
    assert.equal(Object.values(plan.effects).every((value) => value === false), true);
  }
});

test('accepted NARROW and truthful nonblank CDR presence states remain compatible without inventing semantic acknowledgement', () => {
  const bridge = createBrowserRelationshipsRuntimeBridge(sources);
  for (const presenceClass of sources.cdrRegistry.presenceStates) {
    const plan = bridge.prepare(admitted({ invitationDecision: 'NARROW', presenceClass }));
    assert.equal(plan.state, 'HOST_BINDING_REQUIRED', presenceClass);
    assert.equal(plan.semanticAcknowledged, false);
    assert.equal(plan.effects.relationshipMutationPerformed, false);
  }
});

test('browser request cannot inject host bindings, raw endpoints, scenario identity, or undeclared fields', () => {
  const bridge = createBrowserRelationshipsRuntimeBridge(sources);
  for (const [key, value] of [
    ['scenarioRef', 'scenario.attacker'],
    ['candidateRef', 'candidate.attacker'],
    ['stateRootPath', '/tmp/attacker'],
    ['deviceRef', 'device.attacker'],
    ['host', '192.168.1.55'],
    ['port', 18110],
    ['endpoint', 'http://127.0.0.1:18110']
  ]) {
    assert.equal(
      errorCode(() => bridge.prepare({ ...admitted(), [key]: value })),
      'RELATIONSHIPS_RUNTIME_REQUEST_NOT_ADMITTED',
      key
    );
  }
});

test('request enums and booleans are admitted only from current accepted registries', () => {
  const bridge = createBrowserRelationshipsRuntimeBridge(sources);
  assert.equal(errorCode(() => bridge.prepare(admitted({ invitationState: 'FUTURE_STATE' }))), 'RELATIONSHIPS_RUNTIME_REQUEST_NOT_ADMITTED');
  assert.equal(errorCode(() => bridge.prepare(admitted({ presenceClass: 'FUTURE_PRESENCE' }))), 'RELATIONSHIPS_RUNTIME_REQUEST_NOT_ADMITTED');
  assert.equal(errorCode(() => bridge.prepare(admitted({ routeClass: 'RAW_LAN_ENDPOINT' }))), 'RELATIONSHIPS_RUNTIME_REQUEST_NOT_ADMITTED');
  assert.equal(errorCode(() => bridge.prepare(admitted({ failureState: 'SUCCESS_ANYWAY' }))), 'RELATIONSHIPS_RUNTIME_REQUEST_NOT_ADMITTED');
  assert.equal(errorCode(() => bridge.prepare(admitted({ revoked: 'false' }))), 'RELATIONSHIPS_RUNTIME_REQUEST_NOT_ADMITTED');
});

test('durable/browser plan contains binding names but never raw private binding values', () => {
  const plan = createBrowserRelationshipsRuntimeBridge(sources).prepare(admitted());
  const serialized = JSON.stringify(plan);
  assert.ok(plan.requiredPrivateBindings.includes('VEX_CDR_S2_LAN_HOST'));
  assert.ok(plan.requiredPrivateBindings.includes('VEX_CDR_S2_LAN_PORT'));
  assert.ok(plan.requiredPrivateBindings.includes('mac.stateRootPath'));
  assert.ok(plan.requiredPrivateBindings.includes('windows.stateRootPath'));
  assert.doesNotMatch(serialized, /192\.168\.|127\.0\.0\.1|localhost|:\/\//u);
  assert.equal(serialized.includes('/tmp/'), false);
  assert.equal(plan.effects.networkEffectPerformed, false);
  assert.equal(plan.effects.hostExecutionPerformed, false);
});

test('bridge errors are typed and do not require internal cause exposure', () => {
  assert.throws(
    () => createBrowserRelationshipsRuntimeBridge(sources).prepare(null),
    (error) => error instanceof BrowserRelationshipsRuntimeBridgeError && error.code === 'RELATIONSHIPS_RUNTIME_REQUEST_NOT_ADMITTED'
  );
});

// [VXG RealForever]
