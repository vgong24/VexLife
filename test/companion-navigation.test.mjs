import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { evaluateVnav00Fixture, VNAV00_CONTRACT } from '../src/core/companion-navigation.mjs';

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

// [VXG RealForever]
