import { semanticHash } from './utils.mjs';
import {
  MAPS_PLACE_SEARCH_CAPABILITY_REF,
  evaluateHomeMapsPlaceSearchAdmission
} from './home-maps-place-search.mjs';
import {
  prepareHomeMapsPhotonPlaceSearch,
  projectHomeMapsPhotonPlaceSearch
} from './home-maps-photon-place-search.mjs';

export const SERVER_HOME_MAPS_PLACE_SEARCH_SCHEMA =
  'vexlife.server-home-maps-place-search-result/v1';

const SEARCH_KEYS = new Set([
  'intent',
  'sessionAuthority',
  'roleCapabilityRefs',
  'projectCapabilityRefs',
  'resourceCapabilityRefs',
  'rawModelEndpointExposed',
  'signal'
]);
const REQUIRED_SEARCH_KEYS = new Set([
  'intent',
  'sessionAuthority',
  'roleCapabilityRefs',
  'projectCapabilityRefs',
  'resourceCapabilityRefs',
  'rawModelEndpointExposed'
]);

export class ServerHomeMapsPlaceSearchCapabilityError extends Error {
  constructor(code, message, httpStatus = 502) {
    super(message);
    this.name = 'ServerHomeMapsPlaceSearchCapabilityError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const fail = (code, message, httpStatus = 502) => {
  throw new ServerHomeMapsPlaceSearchCapabilityError(code, message, httpStatus);
};

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function closedInput(value) {
  if (!object(value)) {
    fail('SERVER_HOME_MAPS_INPUT_INVALID', 'Home Maps search input must be one object', 400);
  }
  const extra = Object.keys(value).find((key) => !SEARCH_KEYS.has(key));
  if (extra) {
    fail('SERVER_HOME_MAPS_UNTRUSTED_FIELD', `Home Maps search input.${extra} is not admitted`, 400);
  }
  const missing = [...REQUIRED_SEARCH_KEYS].find((key) => !Object.hasOwn(value, key));
  if (missing) {
    fail('SERVER_HOME_MAPS_INPUT_INVALID', `Home Maps search input.${missing} is required`, 400);
  }
  if (typeof value.rawModelEndpointExposed !== 'boolean') {
    fail('SERVER_HOME_MAPS_INPUT_INVALID', 'rawModelEndpointExposed must be boolean', 400);
  }
  if (Object.hasOwn(value, 'signal') && value.signal !== null) {
    if (!object(value.signal) || typeof value.signal.aborted !== 'boolean') {
      fail('SERVER_HOME_MAPS_INPUT_INVALID', 'signal must be an AbortSignal-compatible object', 400);
    }
  }
  return value;
}

function dependency(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} must be a function`);
  return value;
}

function currentTime(nowProvider) {
  const value = nowProvider();
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) {
    fail('SERVER_HOME_MAPS_TIME_UNAVAILABLE', 'current server time is unavailable', 503);
  }
  return value;
}

function text(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function distinctText(values) {
  const seen = new Set();
  const result = [];
  for (const raw of values) {
    const value = text(raw);
    if (value === null) continue;
    const identity = value.toLowerCase();
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(value);
  }
  return result;
}

function subtitleFor(candidate) {
  const address = candidate.address ?? {};
  const street = distinctText([address.houseNumber, address.street]).join(' ');
  const locality = text(address.locality)
    ?? text(address.city)
    ?? text(address.district)
    ?? text(address.county);
  const parts = distinctText([
    street || null,
    locality,
    address.state,
    address.postcode,
    address.country
  ]);
  const subtitle = parts.join(', ');
  if (subtitle.length === 0) return null;
  if (subtitle.toLowerCase() === candidate.name.toLowerCase()) return null;
  return subtitle;
}

function projectHomeCandidate(candidate) {
  const candidateFingerprint = semanticHash({
    sourceCandidateRef: candidate.candidateRef
  });
  return Object.freeze({
    resultRef: `place.vexlife.maps.home.${candidateFingerprint.slice(0, 32)}`,
    name: candidate.name,
    subtitle: subtitleFor(candidate),
    coordinate: Object.freeze({
      latitude: candidate.coordinate.latitude,
      longitude: candidate.coordinate.longitude
    })
  });
}

function resultTruth() {
  return Object.freeze({
    providerExecutionInvoked: true,
    queryEchoed: false,
    queryPersistedByCapability: false,
    providerResultPersistedByCapability: false,
    providerIdentityExposedToClient: false,
    deviceLocationReadOrRetained: false,
    destinationSelected: false,
    routePrepared: false,
    navigationStarted: false,
    HomePayloadReadOrWrite: false,
    MemoryMutation: false
  });
}

export function createServerHomeMapsPlaceSearchCapability({
  executePhotonRequest,
  nowProvider = () => new Date().toISOString()
} = {}) {
  dependency(executePhotonRequest, 'executePhotonRequest');
  if (typeof nowProvider !== 'function') throw new TypeError('nowProvider must be a function');

  async function search(input = {}) {
    const value = closedInput(input);
    const signal = value.signal ?? null;
    if (signal?.aborted) {
      fail('SERVER_HOME_MAPS_CANCELLED', 'Home Maps place search was cancelled', 504);
    }

    const admission = evaluateHomeMapsPlaceSearchAdmission({
      intent: value.intent,
      sessionAuthority: value.sessionAuthority,
      now: currentTime(nowProvider),
      roleCapabilityRefs: value.roleCapabilityRefs,
      projectCapabilityRefs: value.projectCapabilityRefs,
      resourceCapabilityRefs: value.resourceCapabilityRefs,
      rawModelEndpointExposed: value.rawModelEndpointExposed
    });
    if (admission.state !== 'HOME_ROUTED_PLACE_SEARCH_ADMITTED') {
      fail(
        'SERVER_HOME_MAPS_ADMISSION_DENIED',
        `Home Maps place search admission denied: ${admission.reason ?? 'UNKNOWN'}`,
        403
      );
    }

    const prepared = prepareHomeMapsPhotonPlaceSearch({ admission });
    let response;
    try {
      response = await executePhotonRequest(Object.freeze({
        prepared,
        signal
      }));
    } catch {
      if (signal?.aborted) {
        fail('SERVER_HOME_MAPS_CANCELLED', 'Home Maps place search was cancelled', 504);
      }
      fail(
        'SERVER_HOME_MAPS_PROVIDER_EXECUTION_FAILED',
        'Home Maps provider execution failed',
        502
      );
    }

    if (signal?.aborted) {
      fail('SERVER_HOME_MAPS_CANCELLED', 'Home Maps place search was cancelled', 504);
    }

    let projected;
    try {
      projected = projectHomeMapsPhotonPlaceSearch({
        prepared,
        response
      });
    } catch {
      fail(
        'SERVER_HOME_MAPS_PROVIDER_RESPONSE_INVALID',
        'Home Maps provider response was not accepted',
        502
      );
    }

    const candidates = Object.freeze(projected.candidates.map(projectHomeCandidate));
    const core = Object.freeze({
      schemaVersion: SERVER_HOME_MAPS_PLACE_SEARCH_SCHEMA,
      state: 'CURRENT',
      capabilityRef: MAPS_PLACE_SEARCH_CAPABILITY_REF,
      requestRef: admission.searchRequest.requestRef,
      admissionRef: admission.admissionRef,
      returnedCount: candidates.length,
      candidates,
      attribution: projected.attribution,
      featureResultCurrentnessOwner: 'FEATURE_CLIENT',
      truth: resultTruth()
    });
    const semanticFingerprint = semanticHash(core);
    return Object.freeze({
      ...core,
      resultRef: `result.vexlife.maps.home-place-search.${semanticFingerprint.slice(0, 32)}`,
      semanticFingerprint
    });
  }

  return Object.freeze({
    schemaVersion: SERVER_HOME_MAPS_PLACE_SEARCH_SCHEMA,
    search
  });
}

// [VXG RealForever]
