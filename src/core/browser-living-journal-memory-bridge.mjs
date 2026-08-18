import {
  LIVING_JOURNAL_MEMORY_PROJECTION_SCHEMA,
  projectLivingJournalMemory
} from './living-journal-memory-projection.mjs';

export const BROWSER_LIVING_JOURNAL_MEMORY_API_PATH = '/api/v1/living-journal/memory';
export const BROWSER_LIVING_JOURNAL_MEMORY_MAX_PAGES = 24;

const REQUEST_KEYS = new Set(['threadRef', 'maxPages']);
const IDENTITY_KEYS = new Set(['home', 'homeRef', 'deviceRef', 'companionLineageRef']);
const EFFECT_KEYS = Object.freeze([
  'homeMutated',
  'memoryMutated',
  'semanticAcceptanceCreated',
  'firstPersonAuthorityGranted',
  'modelCalled',
  'translationCalled',
  'networkCalled',
  'trainingRan',
  'modelWeightsChanged',
  'publicationPerformed'
]);
const PORTABLE_REF = /^[a-z0-9](?:[a-z0-9._-]{0,254}[a-z0-9])?$/u;

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value) => typeof value === 'string' && value.length > 0;
const sameStrings = (left, right) => Array.isArray(left)
  && Array.isArray(right)
  && left.length === right.length
  && left.every((value, index) => value === right[index]);

function portableRef(value) {
  return nonempty(value) && PORTABLE_REF.test(value);
}

function exactKeys(value, expected) {
  if (!object(value)) return false;
  const observed = Object.keys(value).sort();
  const required = [...expected].sort();
  return sameStrings(observed, required);
}

export class BrowserLivingJournalMemoryBridgeError extends Error {
  constructor(code, message, httpStatus = 500) {
    super(message);
    this.name = 'BrowserLivingJournalMemoryBridgeError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function validateBrowserLivingJournalMemoryIdentity(value) {
  if (!exactKeys(value, IDENTITY_KEYS)) {
    throw new BrowserLivingJournalMemoryBridgeError(
      'LIVING_JOURNAL_MEMORY_IDENTITY_INVALID',
      'Living Journal server identity must contain only the admitted Home identity fields',
      500
    );
  }
  if (!nonempty(value.home) || value.home.length > 4096) {
    throw new BrowserLivingJournalMemoryBridgeError(
      'LIVING_JOURNAL_MEMORY_IDENTITY_INVALID',
      'Living Journal Home path is unavailable or invalid',
      500
    );
  }
  for (const key of ['homeRef', 'deviceRef', 'companionLineageRef']) {
    if (!portableRef(value[key])) {
      throw new BrowserLivingJournalMemoryBridgeError(
        'LIVING_JOURNAL_MEMORY_IDENTITY_INVALID',
        `Living Journal ${key} is invalid`,
        500
      );
    }
  }
  return Object.freeze({
    home: value.home,
    homeRef: value.homeRef,
    deviceRef: value.deviceRef,
    companionLineageRef: value.companionLineageRef
  });
}

export function validateBrowserLivingJournalMemoryRequest(value) {
  if (!object(value)) {
    throw new BrowserLivingJournalMemoryBridgeError(
      'LIVING_JOURNAL_MEMORY_REQUEST_NOT_ADMITTED',
      'Living Journal Memory request must be one JSON object',
      400
    );
  }
  const extras = Object.keys(value).filter((key) => !REQUEST_KEYS.has(key));
  if (extras.length) {
    throw new BrowserLivingJournalMemoryBridgeError(
      'LIVING_JOURNAL_MEMORY_REQUEST_NOT_ADMITTED',
      'Living Journal Memory request contains unadmitted fields',
      400
    );
  }
  if (!portableRef(value.threadRef)) {
    throw new BrowserLivingJournalMemoryBridgeError(
      'LIVING_JOURNAL_MEMORY_REQUEST_NOT_ADMITTED',
      'threadRef must be one portable canonical ref',
      400
    );
  }
  const maxPages = value.maxPages ?? BROWSER_LIVING_JOURNAL_MEMORY_MAX_PAGES;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > BROWSER_LIVING_JOURNAL_MEMORY_MAX_PAGES) {
    throw new BrowserLivingJournalMemoryBridgeError(
      'LIVING_JOURNAL_MEMORY_REQUEST_NOT_ADMITTED',
      `maxPages must be an integer from 1 through ${BROWSER_LIVING_JOURNAL_MEMORY_MAX_PAGES}`,
      400
    );
  }
  return Object.freeze({ threadRef: value.threadRef, maxPages });
}

function assertNoEffectProjection(projection) {
  if (!object(projection) || projection.schemaVersion !== LIVING_JOURNAL_MEMORY_PROJECTION_SCHEMA || !object(projection.effects)) {
    throw new BrowserLivingJournalMemoryBridgeError(
      'LIVING_JOURNAL_MEMORY_PROJECTION_INVALID',
      'Living Journal Memory projection schema/effect contract is invalid',
      500
    );
  }
  const observed = Object.keys(projection.effects).sort();
  const expected = [...EFFECT_KEYS].sort();
  if (!sameStrings(observed, expected) || EFFECT_KEYS.some((key) => projection.effects[key] !== false)) {
    throw new BrowserLivingJournalMemoryBridgeError(
      'LIVING_JOURNAL_MEMORY_PROJECTION_INVALID',
      'Living Journal Memory projection did not preserve the complete zero-effect contract',
      500
    );
  }
  if (projection.rawConversationContentIncluded !== false) {
    throw new BrowserLivingJournalMemoryBridgeError(
      'LIVING_JOURNAL_MEMORY_PROJECTION_INVALID',
      'Living Journal Memory projection unexpectedly includes raw conversation content',
      500
    );
  }
  const current = projection.state === 'CURRENT'
    && projection.currentness === 'CURRENT'
    && projection.truthClass === 'CURRENT_MEMORY_REFERENCE'
    && projection.realMemoryLoaded === true;
  const held = projection.state === 'HELD'
    && projection.currentness === 'HELD'
    && projection.truthClass === 'MEMORY_REFERENCE_HELD'
    && projection.realMemoryLoaded === false;
  if (!current && !held) {
    throw new BrowserLivingJournalMemoryBridgeError(
      'LIVING_JOURNAL_MEMORY_PROJECTION_INVALID',
      'Living Journal Memory projection truth/currentness state is not admitted',
      500
    );
  }
  return projection;
}

function publicFailureFor(error) {
  if (error instanceof BrowserLivingJournalMemoryBridgeError) return error;
  const code = error?.code;
  if (code === 'LIVING_JOURNAL_MEMORY_INPUT_INVALID') {
    return new BrowserLivingJournalMemoryBridgeError(
      code,
      'Living Journal Memory read request was rejected safely',
      400
    );
  }
  if (code === 'LIVING_JOURNAL_MEMORY_SOURCE_INVALID') {
    return new BrowserLivingJournalMemoryBridgeError(
      code,
      'Living Journal Memory source state is unavailable or inconsistent',
      409
    );
  }
  return new BrowserLivingJournalMemoryBridgeError(
    'LIVING_JOURNAL_MEMORY_READ_FAILED',
    'Living Journal Memory read failed safely',
    500
  );
}

export function createBrowserLivingJournalMemoryBridge({ identity }) {
  const serverIdentity = validateBrowserLivingJournalMemoryIdentity(identity);

  function read(input) {
    const request = validateBrowserLivingJournalMemoryRequest(input);
    try {
      const projection = projectLivingJournalMemory({
        ...serverIdentity,
        threadRef: request.threadRef,
        maxPages: request.maxPages
      });
      return assertNoEffectProjection(projection);
    } catch (error) {
      throw publicFailureFor(error);
    }
  }

  return Object.freeze({ read });
}

export function browserLivingJournalMemoryFailurePayload(error) {
  const typed = publicFailureFor(error);
  return Object.freeze({
    schemaVersion: 'vexlife.browser-living-journal-memory-failure/v1',
    state: 'FAILED',
    truthClass: 'CURRENT_LOCAL_MEMORY_FAILURE',
    failureCode: typed.code,
    message: typed.message
  });
}

// [VXG RealForever]
