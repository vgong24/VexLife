import assert from 'node:assert/strict';
import test from 'node:test';

import { semanticHash } from '../src/core/utils.mjs';
import { MAPS_PLACE_SEARCH_CAPABILITY_REF } from '../src/core/home-maps-place-search.mjs';
import {
  HOME_MAPS_PHOTON_ATTRIBUTION,
  HOME_MAPS_PHOTON_REQUEST_SCHEMA
} from '../src/core/home-maps-photon-place-search.mjs';
import {
  SERVER_HOME_MAPS_PLACE_SEARCH_SCHEMA,
  createServerHomeMapsPlaceSearchCapability
} from '../src/core/server-home-maps-place-search-capability.mjs';

const NOW = '2026-11-12T19:30:00.000-08:00';

function rehash(value, field) {
  const core = structuredClone(value);
  delete core[field];
  return { ...core, [field]: semanticHash(core) };
}

function sessionAuthority() {
  const membership = rehash({
    schemaVersion: 'vexlife.bridge-device-membership/v1',
    membershipRef: 'membership.vexlife.vmc01b.maps-search.001',
    homeNodeRef: 'home-node.vexlife.vmc01b.maps-search.001',
    principalRef: 'person.victor-gong',
    deviceRef: 'device.vexlife.vmc01b.maps-search.android.001',
    devicePublicKey: 'synthetic-public-key',
    capabilityRefs: [MAPS_PLACE_SEARCH_CAPABILITY_REF],
    approvedBy: 'person.victor-gong',
    approvedAt: '2026-11-12T19:00:00.000-08:00',
    revocationGeneration: 7,
    state: 'ACTIVE'
  }, 'membershipHash');
  const lease = rehash({
    schemaVersion: 'vexlife.bridge-capability-lease/v1',
    leaseRef: 'lease.vexlife.vmc01b.maps-search.001',
    homeNodeRef: membership.homeNodeRef,
    principalRef: membership.principalRef,
    deviceRef: membership.deviceRef,
    capabilityRefs: [MAPS_PLACE_SEARCH_CAPABILITY_REF],
    projectRefs: [],
    issuedAt: '2026-11-12T19:10:00.000-08:00',
    expiresAt: '2026-11-12T20:10:00.000-08:00',
    revocationGeneration: 7,
    state: 'ACTIVE'
  }, 'leaseHash');
  return {
    schemaVersion: 'vexlife.home-bridge-session-authority/v1',
    state: 'CURRENT',
    authorityReceiptRef: 'receipt.vexlife.home-bridge-session-authority.vmc01b.001',
    stableSessionBindingRef: 'session-binding.vexlife.vmc01b.maps-search.001',
    principalRef: membership.principalRef,
    deviceRef: membership.deviceRef,
    membership,
    lease,
    currentRevocationGeneration: 7,
    sourceReceiptRefs: ['receipt.source.vmc01b.maps-search.001'],
    currentnessRefs: ['currentness.vmc01b.maps-search.001'],
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

function searchInput(query = 'Coffee in Palmdale') {
  return {
    intent: {
      requestRef: 'request.vexlife.vmc01b.maps-search.001',
      query,
      limit: 2
    },
    sessionAuthority: sessionAuthority(),
    roleCapabilityRefs: [MAPS_PLACE_SEARCH_CAPABILITY_REF],
    projectCapabilityRefs: [MAPS_PLACE_SEARCH_CAPABILITY_REF],
    resourceCapabilityRefs: [MAPS_PLACE_SEARCH_CAPABILITY_REF],
    rawModelEndpointExposed: false
  };
}

function photonResponse() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-118.1165, 34.5794] },
        properties: {
          name: 'Sample Coffee',
          housenumber: '10',
          street: 'Example Street',
          city: 'Palmdale',
          state: 'California',
          postcode: '93550',
          country: 'United States',
          countrycode: 'US',
          osm_key: 'amenity',
          osm_value: 'cafe',
          osm_type: 'N',
          osm_id: 123456789
        }
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-118.1201, 34.581] },
        properties: {
          name: 'Second Coffee',
          locality: 'Palmdale',
          country: 'United States',
          countrycode: 'US',
          osm_key: 'amenity',
          osm_value: 'cafe',
          osm_type: 'W',
          osm_id: 987654321
        }
      }
    ]
  };
}

test('VMC-01B server capability composes C1 + Photon through one injected executor and returns Android-shaped Home candidates', async () => {
  let observed = null;
  const capability = createServerHomeMapsPlaceSearchCapability({
    nowProvider: () => NOW,
    executePhotonRequest: async (input) => {
      observed = input;
      return photonResponse();
    }
  });

  const result = await capability.search(searchInput());

  assert.equal(capability.schemaVersion, SERVER_HOME_MAPS_PLACE_SEARCH_SCHEMA);
  assert.equal(result.schemaVersion, SERVER_HOME_MAPS_PLACE_SEARCH_SCHEMA);
  assert.equal(result.state, 'CURRENT');
  assert.equal(result.capabilityRef, MAPS_PLACE_SEARCH_CAPABILITY_REF);
  assert.equal(result.requestRef, 'request.vexlife.vmc01b.maps-search.001');
  assert.equal(result.returnedCount, 2);
  assert.equal(result.featureResultCurrentnessOwner, 'FEATURE_CLIENT');
  assert.deepEqual(result.attribution, HOME_MAPS_PHOTON_ATTRIBUTION);
  assert.deepEqual(Object.keys(result.candidates[0]).sort(), [
    'coordinate',
    'name',
    'resultRef',
    'subtitle'
  ]);
  assert.match(result.candidates[0].resultRef, /^place\.vexlife\.maps\.home\.[0-9a-f]{32}$/u);
  assert.equal(result.candidates[0].name, 'Sample Coffee');
  assert.equal(result.candidates[0].subtitle, '10 Example Street, Palmdale, California, 93550, United States');
  assert.deepEqual(result.candidates[0].coordinate, {
    latitude: 34.5794,
    longitude: -118.1165
  });

  assert.equal(observed.prepared.schemaVersion, HOME_MAPS_PHOTON_REQUEST_SCHEMA);
  assert.deepEqual(observed.prepared.transportRequest, {
    method: 'GET',
    path: '/api',
    query: {
      q: 'Coffee in Palmdale',
      limit: 2
    }
  });
  assert.equal(observed.signal, null);
  assert.equal(Object.hasOwn(observed, 'sessionAuthority'), false);
  assert.equal(Object.hasOwn(observed.prepared, 'endpoint'), false);
  assert.equal(Object.hasOwn(observed.prepared, 'credential'), false);
});

test('VMC-01B server result does not echo private query, Home authority, Photon engine identity or OSM identity', async () => {
  const privateQuery = 'private coffee query only Victor typed';
  const capability = createServerHomeMapsPlaceSearchCapability({
    nowProvider: () => NOW,
    executePhotonRequest: async () => photonResponse()
  });

  const result = await capability.search(searchInput(privateQuery));
  const serialized = JSON.stringify(result);

  for (const forbidden of [
    privateQuery,
    'person.victor-gong',
    'device.vexlife.vmc01b.maps-search.android.001',
    'lease.vexlife.vmc01b.maps-search.001',
    'engine.vexlife.maps.photon',
    'candidate.vexlife.maps.photon',
    '123456789',
    '987654321'
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal(
    result.candidates.some((candidate) => Object.hasOwn(candidate, 'providerIdentity')),
    false
  );
  assert.equal(
    result.candidates.some((candidate) => Object.hasOwn(candidate, 'engineRef')),
    false
  );
  assert.equal(serialized.includes('"providerIdentity":'), false);
  assert.equal(serialized.includes('OpenStreetMap contributors'), true);
  assert.equal(result.truth.providerIdentityExposedToClient, false);
  assert.equal(result.truth.queryEchoed, false);
  assert.equal(result.truth.destinationSelected, false);
  assert.equal(result.truth.routePrepared, false);
  assert.equal(result.truth.navigationStarted, false);
});

test('VMC-01B authority denial stops before provider execution', async () => {
  let calls = 0;
  const capability = createServerHomeMapsPlaceSearchCapability({
    nowProvider: () => NOW,
    executePhotonRequest: async () => {
      calls += 1;
      return photonResponse();
    }
  });
  const input = searchInput();
  input.roleCapabilityRefs = [];

  await assert.rejects(
    capability.search(input),
    (error) => error?.code === 'SERVER_HOME_MAPS_ADMISSION_DENIED'
      && error?.httpStatus === 403
  );
  assert.equal(calls, 0);
});

test('VMC-01B provider execution failure is sanitized and never echoes the private query', async () => {
  const query = 'private provider failure query';
  const capability = createServerHomeMapsPlaceSearchCapability({
    nowProvider: () => NOW,
    executePhotonRequest: async () => {
      throw new Error(`upstream failed for ${query}`);
    }
  });

  await assert.rejects(
    capability.search(searchInput(query)),
    (error) => error?.code === 'SERVER_HOME_MAPS_PROVIDER_EXECUTION_FAILED'
      && error?.httpStatus === 502
      && !error.message.includes(query)
  );
});

test('VMC-01B malformed provider response is rejected behind the Home seam', async () => {
  const capability = createServerHomeMapsPlaceSearchCapability({
    nowProvider: () => NOW,
    executePhotonRequest: async () => ({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [181, 34] },
        properties: {
          name: 'Invalid',
          osm_type: 'N',
          osm_id: 1
        }
      }]
    })
  });

  await assert.rejects(
    capability.search(searchInput()),
    (error) => error?.code === 'SERVER_HOME_MAPS_PROVIDER_RESPONSE_INVALID'
      && error?.httpStatus === 502
  );
});

test('VMC-01B cancellation stops before provider execution when already aborted', async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  const capability = createServerHomeMapsPlaceSearchCapability({
    nowProvider: () => NOW,
    executePhotonRequest: async () => {
      calls += 1;
      return photonResponse();
    }
  });
  const input = {
    ...searchInput(),
    signal: controller.signal
  };

  await assert.rejects(
    capability.search(input),
    (error) => error?.code === 'SERVER_HOME_MAPS_CANCELLED'
      && error?.httpStatus === 504
  );
  assert.equal(calls, 0);
});

// [VXG RealForever]
