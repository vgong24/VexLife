import { semanticHash } from './utils.mjs';
import {
  HOME_MAPS_PLACE_SEARCH_ACTION_REF,
  HOME_MAPS_PLACE_SEARCH_ADMISSION_SCHEMA,
  MAPS_PLACE_SEARCH_CAPABILITY_REF
} from './home-maps-place-search.mjs';

export const HOME_MAPS_PHOTON_ENGINE_REF = 'engine.vexlife.maps.photon';
export const HOME_MAPS_PHOTON_OPERATION = 'FORWARD_PLACE_SEARCH';
export const HOME_MAPS_PHOTON_REQUEST_SCHEMA = 'vexlife.home-maps-photon-place-search-request/v1';
export const HOME_MAPS_PHOTON_RESULT_SCHEMA = 'vexlife.home-maps-photon-place-search-result/v1';

const REF = /^[A-Za-z0-9][A-Za-z0-9._:/#@+-]{0,511}$/u;
const HEX64 = /^[0-9a-f]{64}$/u;
const OSM_TYPES = new Set(['N', 'W', 'R']);
const MAX_OSM_ID = 9223372036854775807n;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_TEXT = 512;
const MAX_OSM_TEXT = 128;
const C1_ADMISSION_KEYS = Object.freeze([
  'actionRef',
  'admissionRef',
  'admittedCapabilityRefs',
  'authorityReceiptRef',
  'canonicalWriter',
  'capabilityRef',
  'currentnessRefs',
  'remoteWriterGranted',
  'requestHash',
  'schemaVersion',
  'searchIntentHash',
  'searchRequest',
  'sourceReceiptRefs',
  'standingHomeAuthority',
  'state',
  'truth'
].sort());
const C1_SEARCH_REQUEST_KEYS = Object.freeze(['limit', 'query', 'requestRef']);
const C1_NO_EFFECT_TRUTH = Object.freeze({
  admissionEqualsProviderExecution: false,
  providerRequestPerformed: false,
  providerCredentialExposed: false,
  queryPersisted: false,
  providerResultPersisted: false,
  locationReadOrRetained: false,
  destinationSelected: false,
  routePrepared: false,
  navigationStarted: false,
  remoteHomeWriteGranted: false,
  memoryMutation: false
});

export const HOME_MAPS_PHOTON_ATTRIBUTION = Object.freeze({
  sourceRef: 'data.openstreetmap',
  requiredText: '© OpenStreetMap contributors',
  licenseRef: 'license.opendatacommons.odbl-1.0',
  copyrightUrl: 'https://www.openstreetmap.org/copyright'
});

export const HOME_MAPS_PHOTON_PREPARE_EFFECTS = Object.freeze({
  networkEffectPerformed: false,
  providerRequestPerformed: false,
  queryPersisted: false,
  providerResultPersisted: false,
  locationReadOrRetained: false,
  destinationSelected: false,
  routePrepared: false,
  navigationStarted: false,
  HomePayloadReadOrWrite: false,
  MemoryMutation: false
});

export const HOME_MAPS_PHOTON_PROJECTION_EFFECTS = Object.freeze({
  networkEffectPerformedByAdapter: false,
  providerResultPersistedByAdapter: false,
  deviceLocationReadOrRetained: false,
  destinationSelected: false,
  routePrepared: false,
  navigationStarted: false,
  HomePayloadReadOrWrite: false,
  MemoryMutation: false
});

export class HomeMapsPhotonPlaceSearchError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'HomeMapsPhotonPlaceSearchError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new HomeMapsPhotonPlaceSearchError(code, message);
};

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeRef(value, label, code = 'PHOTON_ADAPTER_INPUT_INVALID') {
  if (typeof value !== 'string' || !REF.test(value)) fail(code, `${label} must be one safe opaque ref`);
  return value;
}

function safeHash(value, label, code = 'PHOTON_ADAPTER_INPUT_INVALID') {
  if (typeof value !== 'string' || !HEX64.test(value)) fail(code, `${label} must be one SHA-256 semantic hash`);
  return value;
}

function exactObjectKeys(value, expectedKeys, code, label) {
  if (!object(value)) fail(code, `${label} must be one object`);
  const observed = Object.keys(value).sort();
  if (JSON.stringify(observed) !== JSON.stringify(expectedKeys)) {
    fail(code, `${label} shape is not exact`);
  }
  return value;
}

function safeRefArray(value, label, { nonEmpty = false, code = 'PHOTON_ADAPTER_INPUT_INVALID' } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) fail(code, `${label} must be a ref array`);
  const normalized = value.map((item, index) => safeRef(item, `${label}[${index}]`, code));
  if (new Set(normalized).size !== normalized.length) fail(code, `${label} must not contain duplicate refs`);
  return normalized;
}

function safeText(value, label, { required = false, max = MAX_TEXT } = {}) {
  if (value == null && !required) return null;
  if (typeof value !== 'string') fail('PHOTON_RESPONSE_INVALID', `${label} must be text`);
  const normalized = value.trim();
  if ((required && normalized.length === 0) || normalized.length > max || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    fail('PHOTON_RESPONSE_INVALID', `${label} is outside the admitted text boundary`);
  }
  return normalized || null;
}

function exactFalseEffects(value, expected, label, code = 'PHOTON_ADAPTER_INPUT_INVALID') {
  if (!object(value)) fail(code, `${label} is required`);
  const expectedKeys = Object.keys(expected).sort();
  const observedKeys = Object.keys(value).sort();
  if (JSON.stringify(observedKeys) !== JSON.stringify(expectedKeys)) fail(code, `${label} shape is not exact`);
  for (const key of expectedKeys) if (value[key] !== false) fail(code, `${label} unexpectedly grants ${key}`);
}

function normalizeAdmission(admission) {
  if (!object(admission)) fail('PHOTON_ADMISSION_REQUIRED', 'one accepted Maps Home admission is required');
  exactObjectKeys(admission, C1_ADMISSION_KEYS, 'PHOTON_ADMISSION_MISMATCH', 'admission');
  exactObjectKeys(admission.searchRequest, C1_SEARCH_REQUEST_KEYS, 'PHOTON_ADMISSION_MISMATCH', 'admission.searchRequest');
  exactFalseEffects(admission.truth, C1_NO_EFFECT_TRUTH, 'admission.truth', 'PHOTON_ADMISSION_MISMATCH');
  if (!Array.isArray(admission.admittedCapabilityRefs)
      || admission.admittedCapabilityRefs.length !== 1
      || admission.admittedCapabilityRefs[0] !== MAPS_PLACE_SEARCH_CAPABILITY_REF) {
    fail('PHOTON_ADMISSION_MISMATCH', 'accepted admission must contain exactly the Maps place-search capability');
  }
  safeRef(admission.authorityReceiptRef, 'admission.authorityReceiptRef', 'PHOTON_ADMISSION_MISMATCH');
  safeRefArray(admission.sourceReceiptRefs, 'admission.sourceReceiptRefs', { nonEmpty: true, code: 'PHOTON_ADMISSION_MISMATCH' });
  safeRefArray(admission.currentnessRefs, 'admission.currentnessRefs', { nonEmpty: true, code: 'PHOTON_ADMISSION_MISMATCH' });
  if (admission.schemaVersion !== HOME_MAPS_PLACE_SEARCH_ADMISSION_SCHEMA
      || admission.state !== 'HOME_ROUTED_PLACE_SEARCH_ADMITTED') {
    fail('PHOTON_ADMISSION_REQUIRED', 'Photon preparation requires accepted C1 Home-routed place-search admission');
  }
  if (admission.actionRef !== HOME_MAPS_PLACE_SEARCH_ACTION_REF
      || admission.capabilityRef !== MAPS_PLACE_SEARCH_CAPABILITY_REF) {
    fail('PHOTON_ADMISSION_MISMATCH', 'Photon preparation requires the exact Maps place-search action/capability');
  }
  if (admission.canonicalWriter !== 'DESKTOP_HOME_NODE'
      || admission.remoteWriterGranted !== false
      || admission.standingHomeAuthority !== false) {
    fail('PHOTON_ADMISSION_MISMATCH', 'Photon preparation cannot widen the accepted Home writer boundary');
  }
  safeRef(admission.admissionRef, 'admission.admissionRef', 'PHOTON_ADMISSION_MISMATCH');
  safeRef(admission.searchRequest.requestRef, 'admission.searchRequest.requestRef', 'PHOTON_ADMISSION_MISMATCH');
  safeHash(admission.requestHash, 'admission.requestHash', 'PHOTON_ADMISSION_MISMATCH');
  safeHash(admission.searchIntentHash, 'admission.searchIntentHash', 'PHOTON_ADMISSION_MISMATCH');

  const query = admission.searchRequest.query;
  const limit = admission.searchRequest.limit;
  if (typeof query !== 'string' || query !== query.trim() || [...query].length < 1 || [...query].length > 256
      || /[\u0000-\u001f\u007f]/u.test(query)) {
    fail('PHOTON_ADMISSION_MISMATCH', 'accepted search query is outside the C1 boundary');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    fail('PHOTON_ADMISSION_MISMATCH', 'accepted search limit is outside the C1 boundary');
  }
  const expectedSearchIntentHash = semanticHash({
    requestRef: admission.searchRequest.requestRef,
    query,
    limit
  });
  if (admission.searchIntentHash !== expectedSearchIntentHash) {
    fail('PHOTON_ADMISSION_MISMATCH', 'accepted C1 search intent hash does not match requestRef/query/limit');
  }
  return Object.freeze({
    requestRef: admission.searchRequest.requestRef,
    admissionRef: admission.admissionRef,
    requestHash: admission.requestHash,
    searchIntentHash: admission.searchIntentHash,
    query,
    limit
  });
}

function preparedCore(admission) {
  return Object.freeze({
    schemaVersion: HOME_MAPS_PHOTON_REQUEST_SCHEMA,
    state: 'PHOTON_FORWARD_SEARCH_PREPARED_NO_EFFECT',
    engineRef: HOME_MAPS_PHOTON_ENGINE_REF,
    operation: HOME_MAPS_PHOTON_OPERATION,
    requestRef: admission.requestRef,
    admissionRef: admission.admissionRef,
    requestHash: admission.requestHash,
    searchIntentHash: admission.searchIntentHash,
    transportRequest: Object.freeze({
      method: 'GET',
      path: '/api',
      query: Object.freeze({ q: admission.query, limit: admission.limit })
    }),
    locationBiasIncluded: false,
    endpointIncluded: false,
    credentialIncluded: false,
    effects: HOME_MAPS_PHOTON_PREPARE_EFFECTS
  });
}

export function prepareHomeMapsPhotonPlaceSearch({ admission } = {}) {
  const normalized = normalizeAdmission(admission);
  const core = preparedCore(normalized);
  const semanticFingerprint = semanticHash(core);
  return Object.freeze({
    ...core,
    preparedRef: `request.vexlife.maps.photon.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

function validatePrepared(prepared) {
  if (!object(prepared)
      || prepared.schemaVersion !== HOME_MAPS_PHOTON_REQUEST_SCHEMA
      || prepared.state !== 'PHOTON_FORWARD_SEARCH_PREPARED_NO_EFFECT'
      || prepared.engineRef !== HOME_MAPS_PHOTON_ENGINE_REF
      || prepared.operation !== HOME_MAPS_PHOTON_OPERATION) {
    fail('PHOTON_PREPARED_REQUEST_INVALID', 'prepared Photon request identity is invalid');
  }
  safeRef(prepared.requestRef, 'prepared.requestRef', 'PHOTON_PREPARED_REQUEST_INVALID');
  safeRef(prepared.admissionRef, 'prepared.admissionRef', 'PHOTON_PREPARED_REQUEST_INVALID');
  safeHash(prepared.requestHash, 'prepared.requestHash', 'PHOTON_PREPARED_REQUEST_INVALID');
  safeHash(prepared.searchIntentHash, 'prepared.searchIntentHash', 'PHOTON_PREPARED_REQUEST_INVALID');
  safeHash(prepared.semanticFingerprint, 'prepared.semanticFingerprint', 'PHOTON_PREPARED_REQUEST_INVALID');
  safeRef(prepared.preparedRef, 'prepared.preparedRef', 'PHOTON_PREPARED_REQUEST_INVALID');
  if (!object(prepared.transportRequest)
      || prepared.transportRequest.method !== 'GET'
      || prepared.transportRequest.path !== '/api'
      || !object(prepared.transportRequest.query)) {
    fail('PHOTON_PREPARED_REQUEST_INVALID', 'prepared Photon transport descriptor is invalid');
  }
  if (JSON.stringify(Object.keys(prepared.transportRequest).sort()) !== JSON.stringify(['method', 'path', 'query'])) {
    fail('PHOTON_PREPARED_REQUEST_INVALID', 'prepared Photon transport descriptor shape is not exact');
  }
  if (JSON.stringify(Object.keys(prepared.transportRequest.query).sort()) !== JSON.stringify(['limit', 'q'])) {
    fail('PHOTON_PREPARED_REQUEST_INVALID', 'prepared Photon query shape is not exact');
  }
  const { q, limit } = prepared.transportRequest.query;
  if (typeof q !== 'string' || q !== q.trim() || [...q].length < 1 || [...q].length > 256
      || /[\u0000-\u001f\u007f]/u.test(q)
      || !Number.isInteger(limit) || limit < 1 || limit > 20) {
    fail('PHOTON_PREPARED_REQUEST_INVALID', 'prepared Photon query does not preserve C1 bounds');
  }
  const expectedSearchIntentHash = semanticHash({ requestRef: prepared.requestRef, query: q, limit });
  if (prepared.searchIntentHash !== expectedSearchIntentHash) {
    fail('PHOTON_PREPARED_REQUEST_INVALID', 'prepared Photon query does not match the admitted C1 search intent hash');
  }
  if (prepared.locationBiasIncluded !== false || prepared.endpointIncluded !== false || prepared.credentialIncluded !== false) {
    fail('PHOTON_PREPARED_REQUEST_INVALID', 'prepared Photon request widens held transport/location authority');
  }
  exactFalseEffects(prepared.effects, HOME_MAPS_PHOTON_PREPARE_EFFECTS, 'prepared.effects', 'PHOTON_PREPARED_REQUEST_INVALID');

  const core = {
    schemaVersion: prepared.schemaVersion,
    state: prepared.state,
    engineRef: prepared.engineRef,
    operation: prepared.operation,
    requestRef: prepared.requestRef,
    admissionRef: prepared.admissionRef,
    requestHash: prepared.requestHash,
    searchIntentHash: prepared.searchIntentHash,
    transportRequest: prepared.transportRequest,
    locationBiasIncluded: prepared.locationBiasIncluded,
    endpointIncluded: prepared.endpointIncluded,
    credentialIncluded: prepared.credentialIncluded,
    effects: prepared.effects
  };
  const expectedKeys = [...Object.keys(core), 'preparedRef', 'semanticFingerprint'].sort();
  const observedKeys = Object.keys(prepared).sort();
  if (JSON.stringify(observedKeys) !== JSON.stringify(expectedKeys)) {
    fail('PHOTON_PREPARED_REQUEST_INVALID', 'prepared Photon request shape is not exact');
  }
  const semanticFingerprint = semanticHash(core);
  if (semanticFingerprint !== prepared.semanticFingerprint
      || prepared.preparedRef !== `request.vexlife.maps.photon.${semanticFingerprint.slice(0, 32)}`) {
    fail('PHOTON_PREPARED_REQUEST_INVALID', 'prepared Photon request was forged or same-ref/different-meaning');
  }
  return prepared;
}

function responseBytes(response) {
  let serialized;
  try { serialized = JSON.stringify(response); }
  catch { fail('PHOTON_RESPONSE_INVALID', 'Photon response must be JSON-serializable'); }
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > MAX_RESPONSE_BYTES) fail('PHOTON_RESPONSE_TOO_LARGE', 'Photon response exceeds the bounded projection size');
  return bytes;
}

function normalizeOsmId(value) {
  let normalized;
  if (Number.isSafeInteger(value)) {
    normalized = BigInt(value);
  } else if (typeof value === 'string' && /^\d{1,20}$/u.test(value)) {
    normalized = BigInt(value);
  } else {
    fail('PHOTON_RESPONSE_INVALID', 'Photon OSM identity is invalid');
  }
  if (normalized <= 0n || normalized > MAX_OSM_ID) {
    fail('PHOTON_RESPONSE_INVALID', 'Photon OSM identity must be one positive 64-bit OSM element id');
  }
  return normalized.toString();
}

function optionalAddress(properties) {
  const address = {
    houseNumber: safeText(properties.housenumber, 'feature.properties.housenumber'),
    street: safeText(properties.street, 'feature.properties.street'),
    locality: safeText(properties.locality, 'feature.properties.locality'),
    district: safeText(properties.district, 'feature.properties.district'),
    city: safeText(properties.city, 'feature.properties.city'),
    county: safeText(properties.county, 'feature.properties.county'),
    state: safeText(properties.state, 'feature.properties.state'),
    postcode: safeText(properties.postcode, 'feature.properties.postcode'),
    country: safeText(properties.country, 'feature.properties.country'),
    countryCode: properties.countrycode == null
      ? null
      : (() => {
        const code = safeText(properties.countrycode, 'feature.properties.countrycode', { max: 2 });
        if (!/^[A-Za-z]{2}$/u.test(code)) fail('PHOTON_RESPONSE_INVALID', 'Photon country code must be ISO alpha-2');
        return code.toUpperCase();
      })()
  };
  return Object.freeze(address);
}

function normalizeFeature(feature, index) {
  if (!object(feature) || feature.type !== 'Feature' || !object(feature.geometry)
      || feature.geometry.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)
      || feature.geometry.coordinates.length < 2) {
    fail('PHOTON_RESPONSE_INVALID', `Photon feature ${index} must be one GeoJSON Point`);
  }
  const [longitude, latitude] = feature.geometry.coordinates;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180
      || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    fail('PHOTON_RESPONSE_INVALID', `Photon feature ${index} coordinates are invalid`);
  }
  if (!object(feature.properties)) fail('PHOTON_RESPONSE_INVALID', `Photon feature ${index} properties are required`);
  const name = safeText(feature.properties.name, `feature[${index}].properties.name`, { required: true });
  const osmType = safeText(feature.properties.osm_type, `feature[${index}].properties.osm_type`, { required: true, max: 1 });
  if (!OSM_TYPES.has(osmType)) fail('PHOTON_RESPONSE_INVALID', `Photon feature ${index} OSM type is unsupported`);
  const osmId = normalizeOsmId(feature.properties.osm_id);
  const osmKey = safeText(feature.properties.osm_key, `feature[${index}].properties.osm_key`, { max: MAX_OSM_TEXT });
  const osmValue = safeText(feature.properties.osm_value, `feature[${index}].properties.osm_value`, { max: MAX_OSM_TEXT });
  const candidateFingerprint = semanticHash({ engineRef: HOME_MAPS_PHOTON_ENGINE_REF, osmType, osmId });
  return Object.freeze({
    candidateRef: `candidate.vexlife.maps.photon.${candidateFingerprint.slice(0, 32)}`,
    engineRef: HOME_MAPS_PHOTON_ENGINE_REF,
    name,
    address: optionalAddress(feature.properties),
    coordinate: Object.freeze({ longitude, latitude }),
    providerIdentity: Object.freeze({ osmType, osmId, osmKey, osmValue }),
    selected: false,
    routePrepared: false,
    navigationStarted: false
  });
}

export function projectHomeMapsPhotonPlaceSearch({ prepared, response } = {}) {
  const accepted = validatePrepared(prepared);
  if (!object(response) || response.type !== 'FeatureCollection' || !Array.isArray(response.features)) {
    fail('PHOTON_RESPONSE_INVALID', 'Photon response must be one GeoJSON FeatureCollection');
  }
  const responseByteLength = responseBytes(response);
  if (response.features.length > accepted.transportRequest.query.limit) {
    fail('PHOTON_RESPONSE_LIMIT_EXCEEDED', 'Photon returned more features than the admitted request limit');
  }
  const candidates = response.features.map(normalizeFeature);
  const refs = candidates.map((candidate) => candidate.candidateRef);
  if (new Set(refs).size !== refs.length) fail('PHOTON_RESPONSE_DUPLICATE_IDENTITY', 'Photon response repeats one provider identity');

  const core = Object.freeze({
    schemaVersion: HOME_MAPS_PHOTON_RESULT_SCHEMA,
    state: 'PHOTON_PLACE_SEARCH_RESULT_PROJECTED',
    engineRef: HOME_MAPS_PHOTON_ENGINE_REF,
    requestRef: accepted.requestRef,
    admissionRef: accepted.admissionRef,
    requestHash: accepted.requestHash,
    searchIntentHash: accepted.searchIntentHash,
    preparedRef: accepted.preparedRef,
    returnedCount: candidates.length,
    responseByteLength,
    candidates: Object.freeze(candidates),
    attribution: HOME_MAPS_PHOTON_ATTRIBUTION,
    featureResultCurrentnessOwner: 'FEATURE_CLIENT',
    projectionEffects: HOME_MAPS_PHOTON_PROJECTION_EFFECTS
  });
  const semanticFingerprint = semanticHash(core);
  return Object.freeze({
    ...core,
    resultRef: `result.vexlife.maps.photon.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

// [VXG RealForever]
