import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { semanticHash } from '../src/core/utils.mjs';
import {
  MAPS_PLACE_SEARCH_CAPABILITY_REF,
  evaluateHomeMapsPlaceSearchAdmission
} from '../src/core/home-maps-place-search.mjs';
import {
  HOME_MAPS_PHOTON_ATTRIBUTION,
  HOME_MAPS_PHOTON_ENGINE_REF,
  HOME_MAPS_PHOTON_PREPARE_EFFECTS,
  HOME_MAPS_PHOTON_PROJECTION_EFFECTS,
  HOME_MAPS_PHOTON_REQUEST_SCHEMA,
  HOME_MAPS_PHOTON_RESULT_SCHEMA,
  prepareHomeMapsPhotonPlaceSearch,
  projectHomeMapsPhotonPlaceSearch
} from '../src/core/home-maps-photon-place-search.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = '2026-10-18T05:30:00.000Z';

function rehash(value, field) {
  const core = structuredClone(value);
  delete core[field];
  return { ...core, [field]: semanticHash(core) };
}

function sessionAuthority() {
  const membership = rehash({
    schemaVersion: 'vexlife.bridge-device-membership/v1',
    membershipRef: 'membership.vexlife.vcs03.maps-search.001',
    homeNodeRef: 'home-node.vexlife.vcs03.maps-search.001',
    principalRef: 'person.victor-gong',
    deviceRef: 'device.vexlife.vcs03.maps-search.android.001',
    devicePublicKey: 'synthetic-public-key',
    capabilityRefs: [MAPS_PLACE_SEARCH_CAPABILITY_REF],
    approvedBy: 'person.victor-gong',
    approvedAt: '2026-10-18T05:00:00.000Z',
    revocationGeneration: 4,
    state: 'ACTIVE'
  }, 'membershipHash');
  const lease = rehash({
    schemaVersion: 'vexlife.bridge-capability-lease/v1',
    leaseRef: 'lease.vexlife.vcs03.maps-search.001',
    homeNodeRef: membership.homeNodeRef,
    principalRef: membership.principalRef,
    deviceRef: membership.deviceRef,
    capabilityRefs: [MAPS_PLACE_SEARCH_CAPABILITY_REF],
    projectRefs: [],
    issuedAt: '2026-10-18T05:10:00.000Z',
    expiresAt: '2026-10-18T06:10:00.000Z',
    revocationGeneration: 4,
    state: 'ACTIVE'
  }, 'leaseHash');
  return {
    schemaVersion: 'vexlife.home-bridge-session-authority/v1',
    state: 'CURRENT',
    authorityReceiptRef: 'receipt.vexlife.home-bridge-session-authority.vcs03.maps-search.001',
    stableSessionBindingRef: 'session-binding.vexlife.vcs03.maps-search.001',
    principalRef: membership.principalRef,
    deviceRef: membership.deviceRef,
    membership,
    lease,
    currentRevocationGeneration: 4,
    sourceReceiptRefs: ['receipt.source.vcs03.maps-search.001'],
    currentnessRefs: ['currentness.vcs03.maps-search.001'],
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

function admission({ query = 'Coffee in Palmdale', limit = 2 } = {}) {
  const value = evaluateHomeMapsPlaceSearchAdmission({
    intent: { requestRef: 'request.vexlife.vcs03.maps-search.001', query, limit },
    sessionAuthority: sessionAuthority(),
    now: NOW,
    roleCapabilityRefs: [MAPS_PLACE_SEARCH_CAPABILITY_REF],
    projectCapabilityRefs: [MAPS_PLACE_SEARCH_CAPABILITY_REF],
    resourceCapabilityRefs: [MAPS_PLACE_SEARCH_CAPABILITY_REF],
    rawModelEndpointExposed: false
  });
  assert.equal(value.state, 'HOME_ROUTED_PLACE_SEARCH_ADMITTED');
  return value;
}

function photonResponse(features = [
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-118.1165, 34.5794] },
    properties: {
      name: 'Sample Coffee',
      street: 'Example Street',
      housenumber: '10',
      postcode: '93550',
      city: 'Palmdale',
      state: 'California',
      country: 'United States',
      countrycode: 'US',
      osm_key: 'amenity',
      osm_value: 'cafe',
      osm_type: 'N',
      osm_id: 123456789,
      extra: { privateUpstreamShape: 'must-not-project' }
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-118.1201, 34.581] },
    properties: {
      name: 'Second Coffee',
      locality: 'Palmdale',
      country: 'United States',
      countrycode: 'us',
      osm_key: 'amenity',
      osm_value: 'cafe',
      osm_type: 'W',
      osm_id: 987654321
    }
  }
]) {
  return { type: 'FeatureCollection', features, upstreamMetadata: { ignored: true } };
}

test('VCS03 Photon adapter prepares one exact no-effect /api q+limit descriptor from accepted C1 admission', () => {
  const accepted = admission();
  const prepared = prepareHomeMapsPhotonPlaceSearch({ admission: accepted });
  assert.equal(prepared.schemaVersion, HOME_MAPS_PHOTON_REQUEST_SCHEMA);
  assert.equal(prepared.state, 'PHOTON_FORWARD_SEARCH_PREPARED_NO_EFFECT');
  assert.equal(prepared.engineRef, HOME_MAPS_PHOTON_ENGINE_REF);
  assert.equal(prepared.requestRef, accepted.searchRequest.requestRef);
  assert.equal(prepared.admissionRef, accepted.admissionRef);
  assert.equal(prepared.requestHash, accepted.requestHash);
  assert.equal(prepared.searchIntentHash, accepted.searchIntentHash);
  assert.deepEqual(prepared.transportRequest, {
    method: 'GET',
    path: '/api',
    query: { q: 'Coffee in Palmdale', limit: 2 }
  });
  assert.equal(prepared.locationBiasIncluded, false);
  assert.equal(prepared.endpointIncluded, false);
  assert.equal(prepared.credentialIncluded, false);
  assert.deepEqual(prepared.effects, HOME_MAPS_PHOTON_PREPARE_EFFECTS);
  assert.ok(Object.values(prepared.effects).every((value) => value === false));
});

test('VCS03 Photon adapter refuses unavailable/non-C1 admission instead of minting provider authority', () => {
  const accepted = admission();
  for (const invalid of [
    { ...accepted, state: 'HOME_ROUTED_PLACE_SEARCH_UNAVAILABLE' },
    { ...accepted, canonicalWriter: 'REMOTE_DEVICE' },
    { ...accepted, remoteWriterGranted: true },
    { ...accepted, truth: { ...accepted.truth, providerRequestPerformed: true } }
  ]) {
    assert.throws(
      () => prepareHomeMapsPhotonPlaceSearch({ admission: invalid }),
      (error) => ['PHOTON_ADMISSION_REQUIRED', 'PHOTON_ADMISSION_MISMATCH'].includes(error?.code)
    );
  }
});

test('VCS03 Photon prepared request carries no endpoint, credential, location bias, principal, device or lease material', () => {
  const prepared = prepareHomeMapsPhotonPlaceSearch({ admission: admission() });
  const serialized = JSON.stringify(prepared);
  for (const forbidden of [
    'person.victor-gong',
    'device.vexlife.vcs03.maps-search.android.001',
    'lease.vexlife.vcs03.maps-search.001',
    'latitude',
    'longitude',
    'https://',
    'apiKey',
    'credential'
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal(serialized.includes('/api'), true);
});

test('VCS03 Photon projection validates GeoJSON and returns bounded provider-result candidates without selection/routing', () => {
  const prepared = prepareHomeMapsPhotonPlaceSearch({ admission: admission() });
  const result = projectHomeMapsPhotonPlaceSearch({ prepared, response: photonResponse() });
  assert.equal(result.schemaVersion, HOME_MAPS_PHOTON_RESULT_SCHEMA);
  assert.equal(result.state, 'PHOTON_PLACE_SEARCH_RESULT_PROJECTED');
  assert.equal(result.engineRef, HOME_MAPS_PHOTON_ENGINE_REF);
  assert.equal(result.requestRef, prepared.requestRef);
  assert.equal(result.admissionRef, prepared.admissionRef);
  assert.equal(result.searchIntentHash, prepared.searchIntentHash);
  assert.equal(result.preparedRef, prepared.preparedRef);
  assert.equal(result.returnedCount, 2);
  assert.equal(result.featureResultCurrentnessOwner, 'FEATURE_CLIENT');
  assert.deepEqual(result.projectionEffects, HOME_MAPS_PHOTON_PROJECTION_EFFECTS);
  assert.ok(Object.values(result.projectionEffects).every((value) => value === false));
  assert.deepEqual(result.candidates[0].coordinate, { longitude: -118.1165, latitude: 34.5794 });
  assert.deepEqual(result.candidates[0].providerIdentity, {
    osmType: 'N',
    osmId: '123456789',
    osmKey: 'amenity',
    osmValue: 'cafe'
  });
  assert.equal(result.candidates[0].selected, false);
  assert.equal(result.candidates[0].routePrepared, false);
  assert.equal(result.candidates[0].navigationStarted, false);
  assert.equal(result.candidates[1].address.countryCode, 'US');
});

test('VCS03 Photon projection whitelists provider fields and never echoes the private search query', () => {
  const prepared = prepareHomeMapsPhotonPlaceSearch({ admission: admission({ query: 'private search phrase', limit: 2 }) });
  const result = projectHomeMapsPhotonPlaceSearch({ prepared, response: photonResponse() });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('private search phrase'), false);
  assert.equal(serialized.includes('privateUpstreamShape'), false);
  assert.equal(serialized.includes('upstreamMetadata'), false);
  assert.equal(serialized.includes('devicePublicKey'), false);
  assert.equal(serialized.includes('membershipRef'), false);
});

test('VCS03 Photon projection preserves required OpenStreetMap attribution metadata', () => {
  const prepared = prepareHomeMapsPhotonPlaceSearch({ admission: admission() });
  const result = projectHomeMapsPhotonPlaceSearch({ prepared, response: photonResponse() });
  assert.deepEqual(result.attribution, HOME_MAPS_PHOTON_ATTRIBUTION);
  assert.equal(result.attribution.sourceRef, 'data.openstreetmap');
  assert.equal(result.attribution.licenseRef, 'license.opendatacommons.odbl-1.0');
  assert.match(result.attribution.requiredText, /OpenStreetMap contributors/u);
});

test('VCS03 Photon projection fails closed when provider result count exceeds the admitted C1 limit', () => {
  const prepared = prepareHomeMapsPhotonPlaceSearch({ admission: admission({ limit: 1 }) });
  assert.throws(
    () => projectHomeMapsPhotonPlaceSearch({ prepared, response: photonResponse() }),
    (error) => error?.code === 'PHOTON_RESPONSE_LIMIT_EXCEEDED'
  );
});

test('VCS03 Photon projection rejects malformed coordinates and provider identity', () => {
  const prepared = prepareHomeMapsPhotonPlaceSearch({ admission: admission({ limit: 1 }) });
  const base = photonResponse().features[0];
  const invalid = [
    { ...base, geometry: { type: 'Point', coordinates: [181, 34] } },
    { ...base, geometry: { type: 'Point', coordinates: [-118, -91] } },
    { ...base, properties: { ...base.properties, osm_type: 'X' } },
    { ...base, properties: { ...base.properties, osm_id: -1 } },
    { ...base, properties: { ...base.properties, name: '' } }
  ];
  for (const feature of invalid) {
    assert.throws(
      () => projectHomeMapsPhotonPlaceSearch({ prepared, response: photonResponse([feature]) }),
      (error) => error?.code === 'PHOTON_RESPONSE_INVALID'
    );
  }
});

test('VCS03 Photon projection rejects duplicate provider identity instead of silently choosing one result', () => {
  const prepared = prepareHomeMapsPhotonPlaceSearch({ admission: admission() });
  const first = photonResponse().features[0];
  const duplicate = {
    ...first,
    geometry: { type: 'Point', coordinates: [-118.2, 34.6] },
    properties: { ...first.properties, name: 'Different label, same OSM identity' }
  };
  assert.throws(
    () => projectHomeMapsPhotonPlaceSearch({ prepared, response: photonResponse([first, duplicate]) }),
    (error) => error?.code === 'PHOTON_RESPONSE_DUPLICATE_IDENTITY'
  );
});

test('VCS03 Stage A source has no ambient fetch, endpoint or runtime installation path', () => {
  const source = fs.readFileSync(path.join(root, 'src/core/home-maps-photon-place-search.mjs'), 'utf8');
  assert.doesNotMatch(source, /globalThis\.fetch|\bfetch\s*\(/u);
  assert.doesNotMatch(source, /photon\.komoot\.io/u);
  assert.doesNotMatch(source, /child_process|spawn|execFile|OpenSearch|java\s+-jar/u);
  assert.match(source, /path:\s*'\/api'/u);
});

// [VXG RealForever]
