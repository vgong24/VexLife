import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { semanticHash } from '../src/core/utils.mjs';
import {
  HOME_MAPS_PLACE_SEARCH_ACTION_REF,
  MAPS_PLACE_SEARCH_CAPABILITY_REF,
  evaluateHomeMapsPlaceSearchAdmission
} from '../src/core/home-maps-place-search.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = '2026-10-17T16:00:00.000Z';

function rehash(value, field) {
  const core = structuredClone(value);
  delete core[field];
  return { ...core, [field]: semanticHash(core) };
}

function authority() {
  const membership = rehash({
    schemaVersion: 'vexlife.bridge-device-membership/v1',
    membershipRef: 'membership.vexlife.maps-search.001',
    homeNodeRef: 'home-node.vexlife.maps-search.001',
    principalRef: 'person.victor-gong',
    deviceRef: 'device.vexlife.maps-search.android.001',
    devicePublicKey: 'synthetic-public-key',
    capabilityRefs: [MAPS_PLACE_SEARCH_CAPABILITY_REF],
    approvedBy: 'person.victor-gong',
    approvedAt: '2026-10-17T15:00:00.000Z',
    revocationGeneration: 3,
    state: 'ACTIVE'
  }, 'membershipHash');
  const lease = rehash({
    schemaVersion: 'vexlife.bridge-capability-lease/v1',
    leaseRef: 'lease.vexlife.maps-search.001',
    homeNodeRef: membership.homeNodeRef,
    principalRef: membership.principalRef,
    deviceRef: membership.deviceRef,
    capabilityRefs: [MAPS_PLACE_SEARCH_CAPABILITY_REF],
    projectRefs: [],
    issuedAt: '2026-10-17T15:30:00.000Z',
    expiresAt: '2026-10-17T16:30:00.000Z',
    revocationGeneration: 3,
    state: 'ACTIVE'
  }, 'leaseHash');
  return {
    schemaVersion: 'vexlife.home-bridge-session-authority/v1',
    state: 'CURRENT',
    authorityReceiptRef: 'receipt.vexlife.home-bridge-session-authority.maps-search.001',
    stableSessionBindingRef: 'session-binding.vexlife.maps-search.001',
    principalRef: membership.principalRef,
    deviceRef: membership.deviceRef,
    membership,
    lease,
    currentRevocationGeneration: 3,
    sourceReceiptRefs: ['receipt.source.maps-search.001'],
    currentnessRefs: ['currentness.maps-search.001'],
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

function candidate(overrides = {}) {
  return {
    intent: {
      requestRef: 'request.vexlife.maps-search.001',
      query: '  in n out  ',
      limit: 20
    },
    sessionAuthority: authority(),
    now: NOW,
    roleCapabilityRefs: [MAPS_PLACE_SEARCH_CAPABILITY_REF],
    projectCapabilityRefs: [MAPS_PLACE_SEARCH_CAPABILITY_REF],
    resourceCapabilityRefs: [MAPS_PLACE_SEARCH_CAPABILITY_REF],
    rawModelEndpointExposed: false,
    ...overrides
  };
}

test('C1 admits one bounded transient Home-routed Maps place-search request without provider execution', () => {
  const result = evaluateHomeMapsPlaceSearchAdmission(candidate());
  assert.equal(result.state, 'HOME_ROUTED_PLACE_SEARCH_ADMITTED');
  assert.equal(result.actionRef, HOME_MAPS_PLACE_SEARCH_ACTION_REF);
  assert.equal(result.capabilityRef, MAPS_PLACE_SEARCH_CAPABILITY_REF);
  assert.deepEqual(result.searchRequest, {
    requestRef: 'request.vexlife.maps-search.001',
    query: 'in n out',
    limit: 20
  });
  assert.deepEqual(result.admittedCapabilityRefs, [MAPS_PLACE_SEARCH_CAPABILITY_REF]);
  assert.equal(result.canonicalWriter, 'DESKTOP_HOME_NODE');
  assert.equal(result.remoteWriterGranted, false);
  assert.equal(result.standingHomeAuthority, false);
  assert.equal(result.truth.admissionEqualsProviderExecution, false);
  assert.equal(result.truth.providerRequestPerformed, false);
  assert.equal(result.truth.queryPersisted, false);
  assert.equal(result.truth.locationReadOrRetained, false);
  assert.equal(result.truth.destinationSelected, false);
  assert.equal(result.truth.routePrepared, false);
  assert.equal(result.truth.memoryMutation, false);
});

test('C1 remote semantic intent cannot author principal/device/lease or provider authority', () => {
  for (const field of ['principalRef', 'deviceRef', 'leaseRef', 'providerRef']) {
    const value = candidate();
    value.intent = { ...value.intent, [field]: 'forged' };
    const result = evaluateHomeMapsPlaceSearchAdmission(value);
    assert.equal(result.state, 'HOME_ROUTED_PLACE_SEARCH_UNAVAILABLE');
    assert.equal(result.reason, 'UNTRUSTED_FIELD');
    assert.equal(result.searchRequest, null);
  }
});

test('C1 fails closed on malformed query and result-limit breadth', () => {
  for (const [reason, query, limit] of [
    ['QUERY_INVALID', '   ', 5],
    ['QUERY_INVALID', 'x'.repeat(257), 5],
    ['QUERY_INVALID', 'bad\nquery', 5],
    ['LIMIT_INVALID', 'coffee', 0],
    ['LIMIT_INVALID', 'coffee', 21],
    ['LIMIT_INVALID', 'coffee', 1.5]
  ]) {
    const value = candidate();
    value.intent = { ...value.intent, query, limit };
    const result = evaluateHomeMapsPlaceSearchAdmission(value);
    assert.equal(result.state, 'HOME_ROUTED_PLACE_SEARCH_UNAVAILABLE');
    assert.equal(result.reason, reason);
  }
});

test('C1 requires exact current effect-free session authority and Maps membership+lease', () => {
  const cases = [
    ['SESSION_AUTHORITY_NOT_CURRENT', (a) => { a.state = 'STALE'; }],
    ['SESSION_AUTHORITY_EFFECTFUL', (a) => { a.effects.networkMutation = true; }],
    ['SESSION_AUTHORITY_IDENTITY_MISMATCH', (a) => {
      a.lease = rehash({ ...a.lease, deviceRef: 'device.other' }, 'leaseHash');
    }],
    ['SESSION_AUTHORITY_REVOCATION_MISMATCH', (a) => { a.currentRevocationGeneration = 4; }],
    ['MAPS_PLACE_SEARCH_LEASE_REQUIRED', (a) => {
      a.membership = rehash({ ...a.membership, capabilityRefs: [] }, 'membershipHash');
    }],
    ['MAPS_PLACE_SEARCH_LEASE_REQUIRED', (a) => {
      a.lease = rehash({ ...a.lease, capabilityRefs: [] }, 'leaseHash');
    }]
  ];
  for (const [reason, mutate] of cases) {
    const value = candidate();
    mutate(value.sessionAuthority);
    const result = evaluateHomeMapsPlaceSearchAdmission(value);
    assert.equal(result.state, 'HOME_ROUTED_PLACE_SEARCH_UNAVAILABLE', reason);
    assert.equal(result.reason, reason);
  }
});

test('C1 preserves Home Bridge expiry/runtime-scope/raw-endpoint denial', () => {
  const cases = [
    ['HOME_BRIDGE_LEASE_EXPIRED', (c) => {
      c.sessionAuthority.lease = rehash({
        ...c.sessionAuthority.lease,
        expiresAt: '2026-10-17T15:59:59.000Z'
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
    const result = evaluateHomeMapsPlaceSearchAdmission(value);
    assert.equal(result.state, 'HOME_ROUTED_PLACE_SEARCH_UNAVAILABLE', reason);
    assert.equal(result.reason, reason);
  }
});

test('C1 seam registers one concrete action/module while accepted C0 capability remains requestable and actionless', () => {
  const actions = JSON.parse(fs.readFileSync(path.join(root, 'blueprint/fragments/actions.json'), 'utf8'));
  const capabilities = JSON.parse(fs.readFileSync(path.join(root, 'blueprint/capability-registry.json'), 'utf8'));
  const modules = JSON.parse(fs.readFileSync(path.join(root, 'blueprint/module-registry/core.json'), 'utf8'));

  const action = actions.find((item) => item.actionRef === HOME_MAPS_PLACE_SEARCH_ACTION_REF);
  assert.ok(action);
  assert.equal(action.permissionRef, 'permission.none');
  assert.equal(action.effectClass, 'PRIVATE_HOME_ROUTED_READ_ADMIT_MAPS_PLACE_SEARCH');
  assert.deepEqual(Object.keys(action.inputSchema).sort(), ['limit', 'query', 'requestRef']);
  assert.deepEqual(action.outputStateRefs, []);

  const capability = capabilities.capabilities.find(
    (item) => item.capabilityRef === MAPS_PLACE_SEARCH_CAPABILITY_REF
  );
  assert.ok(capability);
  assert.equal(capability.defaultStage, 'REQUESTABLE');
  assert.deepEqual(capability.actionRefs, []);
  assert.equal(capability.toolContract, undefined);

  const module = modules.find((item) => item.moduleRef === 'module.vexlife.core.home-maps-place-search');
  assert.ok(module);
  assert.equal(module.path, 'src/core/home-maps-place-search.mjs');
  assert.deepEqual(module.writes, []);
  assert.ok(module.reads.includes('module.vexlife.core.home-bridge'));
  assert.ok(module.reads.includes('src/core/home-bridge-session-authority.mjs'));
  assert.ok(module.reads.includes(MAPS_PLACE_SEARCH_CAPABILITY_REF));
});

test('C1 admitted output exposes no identity, lease, provider, coordinate or secret material', () => {
  const result = evaluateHomeMapsPlaceSearchAdmission(candidate());
  const serialized = JSON.stringify(result);
  for (const forbidden of [
    'person.victor-gong',
    'device.vexlife.maps-search.android.001',
    'lease.vexlife.maps-search.001',
    'devicePublicKey',
    'providerRef',
    'apiKey',
    'latitude',
    'longitude',
    'hostname',
    'privateKey'
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal(serialized.includes('in n out'), true);
});

// [VXG RealForever]
