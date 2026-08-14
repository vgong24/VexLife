import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { evaluateVnav00Fixture, VNAV00_CONTRACT, evaluateHomeRoutedCompanionNavigation, HOME_ROUTED_NAVIGATION_ACTION_REF, COMPANION_NAVIGATION_CAPABILITY_REF } from '../src/core/companion-navigation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(root, 'fixtures/companion-navigation/vnav-00.synthetic.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));

function normalized(value) {
  return JSON.stringify(value);
}

test('VNAV00 A00/A01 deterministic source-only fixture composes one stable receipt', () => {
  const first = evaluateVnav00Fixture(clone(fixture));
  const second = evaluateVnav00Fixture(clone(fixture));
  assert.equal(first.disposition, 'VNAV00_SYNTHETIC_PASS');
  assert.equal(normalized(first), normalized(second));
  assert.equal(first.truth.externalEffectPerformed, false);
  assert.equal(VNAV00_CONTRACT.sourceOnly, true);
  assert.equal(VNAV00_CONTRACT.effectFree, true);
});

test('VNAV00 N2-N6 route, map match, missed turn, reroute and ETA stay non-collapsed', () => {
  const result = evaluateVnav00Fixture(clone(fixture));
  assert.deepEqual(result.route.initialPathNodeRefs, [
    'place.synthetic.a', 'place.synthetic.b', 'place.synthetic.e', 'place.synthetic.d'
  ]);
  assert.equal(result.route.initialDistanceMeters, 260);
  assert.equal(result.route.deviationDetected, true);
  assert.equal(result.route.deviationMatchedNodeRef, 'place.synthetic.c');
  assert.deepEqual(result.route.reroutePathNodeRefs, ['place.synthetic.c', 'place.synthetic.d']);
  assert.equal(result.route.rerouteDistanceMeters, 100);
  assert.equal(result.mapMatching.sourceClass, 'GPS_FIX');
  assert.equal(result.mapMatching.outputClass, 'MAP_MATCHED_POSITION');
  assert.equal(result.mapMatching.fullBody3dTruthClaimed, false);
  assert.equal(result.eta.remainingDistanceMeters, 100);
  assert.equal(result.eta.remainingDurationSeconds, 10);
  assert.equal(result.eta.trafficAware, false);
});

test('VNAV00 N7 low-distraction attention defers a large answer near a critical maneuver', () => {
  const result = evaluateVnav00Fixture(clone(fixture));
  assert.equal(result.attention.profile, 'DRIVING_LOW_DISTRACTION_SYNTHETIC');
  assert.equal(result.attention.disposition, 'DEFERRED_UNTIL_AFTER_CRITICAL_MANEUVER');
  assert.equal(result.attention.screenInspectionRequired, false);
});

test('VNAV00 N8 addressed human message is prepared but never sent or re-authored as Vex', () => {
  const result = evaluateVnav00Fixture(clone(fixture));
  assert.equal(result.addressedConversationFeatureRef, 'feature.vexlife.addressed-conversation');
  assert.equal(result.messaging.state, 'MESSAGE_PREPARED');
  assert.equal(result.messaging.sent, false);
  assert.equal(result.messaging.addressedConversationReused, true);
  assert.equal(result.messaging.humanMessageEqualsVexMessage, false);
  assert.notEqual(result.messaging.humanSpeakerRef, result.messaging.vexAuthorRef);
});

test('VNAV00 N9 detour remains a recommendation and cannot silently change the route', () => {
  const result = evaluateVnav00Fixture(clone(fixture));
  assert.equal(result.detour.recommendationOnly, true);
  assert.equal(result.detour.routeChanged, false);
  assert.equal(result.detour.baseDistanceMeters, 260);
  assert.equal(result.detour.candidateDistanceMeters, 320);
  assert.equal(result.detour.extraDistanceMeters, 60);
});

test('VNAV00 N10 network loss preserves local guidance only from current local data', () => {
  const result = evaluateVnav00Fixture(clone(fixture));
  assert.equal(result.continuity.networkDisposition, 'LOCAL_GUIDANCE_PRESERVED_WITHOUT_NETWORK');
  assert.equal(result.continuity.localMapDataSufficient, true);
  assert.equal(result.truth.routeGuidanceIsVehicleControl, false);
});

test('VNAV00 N10 network loss fails closed when local guidance data is insufficient', () => {
  const candidate = clone(fixture);
  candidate.network.available = false;
  candidate.network.localMapDataSufficient = false;
  const result = evaluateVnav00Fixture(candidate);
  assert.equal(result.disposition, 'BLOCKED');
  assert.deepEqual(result.blockers, ['LOCAL_GUIDANCE_DATA_INSUFFICIENT']);
  assert.equal(result.truth.routeGuidanceIsVehicleControl, false);
});

test('VNAV00 N11 stale map data fails visibly and live traffic is never fabricated', () => {
  const candidate = clone(fixture);
  candidate.mapPack.currentness = 'STALE';
  const result = evaluateVnav00Fixture(candidate);
  assert.equal(result.disposition, 'BLOCKED');
  assert.deepEqual(result.blockers, ['MAP_DATA_NOT_CURRENT']);
  assert.equal(result.currentness.mapData, 'STALE');
  assert.equal(result.currentness.traffic, 'UNKNOWN');
  assert.equal(result.truth.liveTrafficClaimed, false);
});

test('VNAV00 N11 missing routing currentness fails closed', () => {
  const candidate = clone(fixture);
  candidate.router.currentness = 'UNKNOWN';
  const result = evaluateVnav00Fixture(candidate);
  assert.equal(result.disposition, 'BLOCKED');
  assert.deepEqual(result.blockers, ['ROUTING_GRAPH_NOT_CURRENT']);
});

test('VNAV00 destination web result is not trusted navigation coordinate until locally resolved', () => {
  const candidate = clone(fixture);
  candidate.destination.sourceClass = 'WEB_PLACE_RESULT';
  candidate.destination.coordinateTrust = 'SOURCE_ONLY_UNRESOLVED';
  const result = evaluateVnav00Fixture(candidate);
  assert.equal(result.disposition, 'BLOCKED');
  assert.deepEqual(result.blockers, ['WEB_PLACE_COORDINATE_UNTRUSTED']);
});

test('VNAV00 N12 output excludes raw GPS/search history and performs no Memory promotion', () => {
  const result = evaluateVnav00Fixture(clone(fixture));
  assert.equal(result.continuity.rawGpsTraceIncluded, false);
  assert.equal(result.continuity.rawSearchHistoryIncluded, false);
  assert.equal(result.continuity.tripMemoryCreated, false);
  assert.equal(result.continuity.memoryPromotionPerformed, false);
  assert.equal(Object.hasOwn(result, 'syntheticGpsTrace'), false);
  assert.equal(result.truth.searchHistoryIsMemoryByDefault, false);
  assert.equal(result.truth.witnessedTripEqualsRememberedTrip, false);
});

test('VNAV00 privacy/effect adversaries fail closed', () => {
  for (const mutate of [
    (value) => { value.privacy.rawGpsRetention = 'DURABLE'; },
    (value) => { value.privacy.memoryPromotion = true; },
    (value) => { value.effectBoundary.realGpsRead = true; },
    (value) => { value.effectBoundary.networkEffect = true; },
    (value) => { value.effectBoundary.vehicleControl = true; },
    (value) => { value.effectBoundary.humanMessageSend = true; },
    (value) => { value.router.externalDependencyMaterialized = true; }
  ]) {
    const candidate = clone(fixture);
    mutate(candidate);
    assert.equal(evaluateVnav00Fixture(candidate).disposition, 'BLOCKED');
  }
});

test('VNAV00 permanent distinction receipt remains explicit', () => {
  const truth = evaluateVnav00Fixture(clone(fixture)).truth;
  assert.deepEqual(truth, {
    gpsFixEqualsMapMatchedPosition: false,
    mapMatchedPositionEqualsFullBody3dTruth: false,
    locationPermissionImpliesRetention: false,
    routeFoundEqualsRoadOpen: false,
    staticMapDataEqualsLiveTraffic: false,
    routeGuidanceIsVehicleControl: false,
    messagePreparedEqualsMessageSent: false,
    searchHistoryIsMemoryByDefault: false,
    witnessedTripEqualsRememberedTrip: false,
    externalEffectPerformed: false
  });
});

const HOME_ROUTED_CAP = 'capability.vexlife.companion-navigation';

function homeRoutedCandidate() {
  return {
    request: {
      requestRef: 'request.vnav.c4.synthetic.001',
      deviceRef: 'device.vexlife.synthetic.remote.001',
      actionRef: HOME_ROUTED_NAVIGATION_ACTION_REF
    },
    membership: {
      membershipRef: 'membership.vexlife.synthetic.001',
      homeRef: 'vex-home.synthetic.001',
      deviceRef: 'device.vexlife.synthetic.remote.001',
      state: 'ACTIVE',
      capabilityRefs: [HOME_ROUTED_CAP],
      revocationGeneration: 0,
      standingHomeAuthority: false
    },
    lease: {
      leaseRef: 'lease.vexlife.synthetic.navigation.001',
      homeRef: 'vex-home.synthetic.001',
      deviceRef: 'device.vexlife.synthetic.remote.001',
      state: 'ACTIVE',
      capabilityRefs: [HOME_ROUTED_CAP],
      revocationGeneration: 0,
      issuedAt: '2026-08-14T06:00:00.000Z',
      expiresAt: '2026-08-14T06:30:00.000Z'
    },
    homeAccess: {
      authenticationCurrent: true,
      authorizationState: 'ACCEPTED',
      authorizationCurrentnessClass: 'CURRENT_ACCEPTED',
      authorizationValidUntil: '2026-08-14T06:30:00.000Z',
      authorized: true,
      leaseRef: 'lease.vexlife.synthetic.navigation.001',
      effectiveCapabilityRefs: [HOME_ROUTED_CAP],
      standingHomeAuthority: false,
      remoteHomeWriteGranted: false
    },
    privateRoute: {
      homeRef: 'vex-home.synthetic.001',
      routeRef: 'route.vexlife.synthetic.private.001',
      routeState: 'REMOTE_CANDIDATE',
      gatewayRef: 'gateway.vexlife.synthetic.private.001',
      gatewayState: 'READY',
      currentness: 'CURRENT_ACCEPTED'
    },
    fullNav: {
      runtimeQualified: true,
      runtimeCurrentness: 'CURRENT',
      graphCurrentness: 'CURRENT',
      dataCurrentness: 'CURRENT',
      runtimeQualificationRef: 'runtime-qualification.vnav.synthetic.001',
      graphQualificationRef: 'graph-qualification.vnav.synthetic.001',
      graphFingerprint: 'synthetic-graph-fingerprint',
      regionRef: 'region.synthetic.001'
    },
    now: '2026-08-14T06:10:00.000Z',
    currentRevocationGeneration: 0,
    roleCapabilityRefs: [HOME_ROUTED_CAP],
    projectCapabilityRefs: [HOME_ROUTED_CAP],
    resourceCapabilityRefs: [HOME_ROUTED_CAP],
    rawModelEndpointExposed: false
  };
}

test('VNAV-N3 C4 HOME_ROUTED composes accepted Home bridge + FullNav without standing authority', () => {
  const result = evaluateHomeRoutedCompanionNavigation(homeRoutedCandidate());
  assert.equal(result.state, 'HOME_ROUTED');
  assert.equal(result.actionRef, HOME_ROUTED_NAVIGATION_ACTION_REF);
  assert.deepEqual(result.effectiveCapabilityRefs, [COMPANION_NAVIGATION_CAPABILITY_REF]);
  assert.equal(result.canonicalWriter, 'DESKTOP_HOME_NODE');
  assert.equal(result.remoteWriterGranted, false);
  assert.equal(result.standingHomeAuthority, false);
  assert.equal(result.truth.homeRoutedEqualsStandingHomeAuthority, false);
  assert.equal(result.truth.routeGuidanceIsVehicleControl, false);
  assert.equal(result.truth.memoryAuthorityGranted, false);
  assert.equal(result.truth.gpsHistoryAuthorityGranted, false);
});

test('VNAV-N3 C4 HOME_ROUTED degrades on every currentness/authorization boundary', () => {
  const cases = [
    ['FULL_NAV_RUNTIME_NOT_QUALIFIED', (c) => { c.fullNav.runtimeQualified = false; }],
    ['FULL_NAV_RUNTIME_STALE', (c) => { c.fullNav.runtimeCurrentness = 'STALE'; }],
    ['ROUTING_GRAPH_STALE', (c) => { c.fullNav.graphCurrentness = 'STALE'; }],
    ['MAP_DATA_STALE', (c) => { c.fullNav.dataCurrentness = 'STALE'; }],
    ['PRIVATE_HOME_ROUTE_OR_GATEWAY_STALE', (c) => { c.privateRoute.routeState = 'LOCAL_ONLY'; }],
    ['PRIVATE_HOME_ROUTE_OR_GATEWAY_STALE', (c) => { c.privateRoute.gatewayState = 'UNAVAILABLE'; }],
    ['AUTHENTICATION_STALE', (c) => { c.homeAccess.authenticationCurrent = false; }],
    ['REMOTE_HOME_ACCESS_NOT_CURRENT', (c) => { c.homeAccess.authorizationState = 'NOT_AUTHORIZED'; c.homeAccess.authorized = false; }],
    ['REMOTE_HOME_ACCESS_EXPIRED', (c) => { c.homeAccess.authorizationValidUntil = '2026-08-14T06:09:59.000Z'; }],
    ['CAPABILITY_INTERSECTION_MISSING', (c) => { c.homeAccess.effectiveCapabilityRefs = []; }],
    ['AUTHORITY_BOUNDARY_COLLAPSE', (c) => { c.homeAccess.standingHomeAuthority = true; }],
    ['AUTHORITY_BOUNDARY_COLLAPSE', (c) => { c.homeAccess.remoteHomeWriteGranted = true; }]
  ];
  for (const [reason, mutate] of cases) {
    const candidate = homeRoutedCandidate();
    mutate(candidate);
    const result = evaluateHomeRoutedCompanionNavigation(candidate);
    assert.equal(result.state, 'HOME_ROUTED_UNAVAILABLE');
    assert.equal(result.reason, reason);
    assert.equal(result.standingHomeAuthority, false);
    assert.equal(result.remoteWriterGranted, false);
  }
});

test('VNAV-N3 C4 HOME_ROUTED preserves Home-bridge expiry/revocation/action/scope failures', () => {
  for (const [expectedReason, mutate] of [
    ['HOME_BRIDGE_LEASE_EXPIRED', (c) => { c.lease.expiresAt = '2026-08-14T06:09:59.000Z'; }],
    ['HOME_BRIDGE_DEVICE_REVOKED', (c) => { c.currentRevocationGeneration = 1; }],
    ['HOME_BRIDGE_CAPABILITY_DENIED', (c) => { c.roleCapabilityRefs = []; }],
    ['HOME_BRIDGE_CAPABILITY_DENIED', (c) => { c.projectCapabilityRefs = []; }],
    ['HOME_BRIDGE_CAPABILITY_DENIED', (c) => { c.resourceCapabilityRefs = []; }],
    ['HOME_BRIDGE_CAPABILITY_DENIED', (c) => { c.rawModelEndpointExposed = true; }]
  ]) {
    const candidate = homeRoutedCandidate();
    mutate(candidate);
    const result = evaluateHomeRoutedCompanionNavigation(candidate);
    assert.equal(result.state, 'HOME_ROUTED_UNAVAILABLE');
    assert.equal(result.reason, expectedReason);
  }
});

test('VNAV-N3 C4 feature/Home-bridge seam binds one concrete action while C0 capability vocabulary remains actionless and requestable', () => {
  const actions = JSON.parse(fs.readFileSync(path.join(root, 'blueprint/fragments/actions.json'), 'utf8'));
  const capabilities = JSON.parse(fs.readFileSync(path.join(root, 'blueprint/capability-registry.json'), 'utf8'));
  const features = JSON.parse(fs.readFileSync(path.join(root, 'blueprint/feature-registry.json'), 'utf8'));
  const coreModules = JSON.parse(fs.readFileSync(path.join(root, 'blueprint/module-registry/core.json'), 'utf8'));
  const governanceAndBridgeModules = JSON.parse(fs.readFileSync(path.join(root, 'blueprint/module-registry/governance-and-bridge.json'), 'utf8'));

  const action = actions.find((item) => item.actionRef === HOME_ROUTED_NAVIGATION_ACTION_REF);
  assert.ok(action);
  assert.equal(action.permissionRef, 'permission.none');
  assert.equal(action.effectClass, 'PRIVATE_HOME_ROUTED_READ_INVOKE_NAVIGATION_GUIDANCE');

  const capability = capabilities.capabilities.find((item) => item.capabilityRef === COMPANION_NAVIGATION_CAPABILITY_REF);
  assert.deepEqual(capability.actionRefs, []);
  assert.equal(capability.defaultStage, 'REQUESTABLE');

  const feature = features.features.find((item) => item.featureRef === 'feature.vexlife.companion-navigation');
  assert.equal(feature.status, 'IMPLEMENTED_REFERENCE');
  assert.ok(feature.actionRefs.includes(HOME_ROUTED_NAVIGATION_ACTION_REF));
  assert.ok(feature.moduleRefs.includes('module.vexlife.core.companion-navigation'));
  assert.ok(feature.moduleRefs.includes('module.vexlife.core.home-bridge'));
  assert.ok(feature.projectionRefs.includes('projection.vexlife.companion-navigation.home-routed'));

  assert.equal(governanceAndBridgeModules.filter((item) => item.moduleRef === 'module.vexlife.core.home-bridge').length, 1);
  assert.equal(coreModules.filter((item) => item.moduleRef === 'module.vexlife.core.home-bridge').length, 0);
  assert.equal(coreModules.filter((item) => item.moduleRef === 'module.vexlife.core.companion-navigation').length, 1);
});

test('VNAV-N3 C4 HOME_ROUTED output remains content-absent and never exposes route coordinates', () => {
  const result = evaluateHomeRoutedCompanionNavigation(homeRoutedCandidate());
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('latitude'), false);
  assert.equal(serialized.includes('longitude'), false);
  assert.equal(serialized.includes('hostname'), false);
  assert.equal(serialized.includes('ipAddress'), false);
  assert.equal(serialized.includes('rawModelEndpoint'), false);
  assert.equal(serialized.includes('privateKey'), false);
});

// [VXG RealForever]
