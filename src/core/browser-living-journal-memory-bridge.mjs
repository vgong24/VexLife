import {
  LIVING_JOURNAL_MEMORY_PROJECTION_SCHEMA,
  projectLivingJournalMemory
} from './living-journal-memory-projection.mjs';
import {
  LIVING_JOURNAL_MEMORY_ARCHIVE_SCHEMA,
  projectLivingJournalMemoryArchive
} from './living-journal-memory-archive.mjs';

export const BROWSER_LIVING_JOURNAL_MEMORY_API_PATH = '/api/v1/living-journal/memory';
export const BROWSER_LIVING_JOURNAL_MEMORY_MAX_PAGES = 24;
export const BROWSER_LIVING_JOURNAL_ARCHIVE_API_PATH = '/api/v1/living-journal/archive';
export const BROWSER_LIVING_JOURNAL_ARCHIVE_MAX_DAYS = 30;
export const BROWSER_LIVING_JOURNAL_ARCHIVE_MAX_PAGES = 24;

const MEMORY_REQUEST_KEYS = new Set(['threadRef', 'maxPages']);
const ARCHIVE_REQUEST_KEYS = new Set(['threadRef', 'maxDays', 'dayOffset', 'maxPages', 'selectedDayRef', 'selectedDailyStratumSha256']);
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
  const extras = Object.keys(value).filter((key) => !MEMORY_REQUEST_KEYS.has(key));
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

export function validateBrowserLivingJournalArchiveRequest(value) {
  if (!object(value)) {
    throw new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_ARCHIVE_REQUEST_NOT_ADMITTED', 'Living Journal archive request must be one JSON object', 400);
  }
  const extras = Object.keys(value).filter((key) => !ARCHIVE_REQUEST_KEYS.has(key));
  if (extras.length) {
    throw new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_ARCHIVE_REQUEST_NOT_ADMITTED', 'Living Journal archive request contains unadmitted fields', 400);
  }
  if (!portableRef(value.threadRef)) {
    throw new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_ARCHIVE_REQUEST_NOT_ADMITTED', 'threadRef must be one portable canonical ref', 400);
  }
  const maxDays = value.maxDays ?? BROWSER_LIVING_JOURNAL_ARCHIVE_MAX_DAYS;
  const dayOffset = value.dayOffset ?? 0;
  const maxPages = value.maxPages ?? BROWSER_LIVING_JOURNAL_ARCHIVE_MAX_PAGES;
  if (!Number.isInteger(maxDays) || maxDays < 1 || maxDays > BROWSER_LIVING_JOURNAL_ARCHIVE_MAX_DAYS) {
    throw new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_ARCHIVE_REQUEST_NOT_ADMITTED', `maxDays must be an integer from 1 through ${BROWSER_LIVING_JOURNAL_ARCHIVE_MAX_DAYS}`, 400);
  }
  if (!Number.isInteger(dayOffset) || dayOffset < 0 || dayOffset > 1000000) {
    throw new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_ARCHIVE_REQUEST_NOT_ADMITTED', 'dayOffset must be an integer from 0 through 1000000', 400);
  }
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > BROWSER_LIVING_JOURNAL_ARCHIVE_MAX_PAGES) {
    throw new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_ARCHIVE_REQUEST_NOT_ADMITTED', `maxPages must be an integer from 1 through ${BROWSER_LIVING_JOURNAL_ARCHIVE_MAX_PAGES}`, 400);
  }
  const selectedDayRef = value.selectedDayRef ?? null;
  const selectedDailyStratumSha256 = value.selectedDailyStratumSha256 ?? null;
  if (selectedDayRef !== null && !portableRef(selectedDayRef)) {
    throw new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_ARCHIVE_REQUEST_NOT_ADMITTED', 'selectedDayRef must be one portable canonical ref when supplied', 400);
  }
  if (selectedDailyStratumSha256 !== null && !/^[0-9a-f]{64}$/u.test(selectedDailyStratumSha256)) {
    throw new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_ARCHIVE_REQUEST_NOT_ADMITTED', 'selectedDailyStratumSha256 must be one lowercase SHA-256 when supplied', 400);
  }
  return Object.freeze({ threadRef: value.threadRef, maxDays, dayOffset, maxPages, selectedDayRef, selectedDailyStratumSha256 });
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

function assertNoEffectArchiveProjection(projection) {
  if (!object(projection) || projection.schemaVersion !== LIVING_JOURNAL_MEMORY_ARCHIVE_SCHEMA || !object(projection.effects)) {
    throw new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_ARCHIVE_PROJECTION_INVALID', 'Living Journal archive projection schema/effect contract is invalid', 500);
  }
  const observed = Object.keys(projection.effects).sort();
  const expected = [...EFFECT_KEYS].sort();
  if (!sameStrings(observed, expected) || EFFECT_KEYS.some((key) => projection.effects[key] !== false)) {
    throw new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_ARCHIVE_PROJECTION_INVALID', 'Living Journal archive projection did not preserve the complete zero-effect contract', 500);
  }
  if (projection.rawConversationContentIncluded !== false) {
    throw new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_ARCHIVE_PROJECTION_INVALID', 'Living Journal archive projection unexpectedly includes raw conversation content', 500);
  }
  const current = projection.state === 'CURRENT' && projection.currentness === 'CURRENT' && projection.truthClass === 'COMMITTED_MEMORY_ARCHIVE';
  const held = projection.state === 'HELD' && projection.currentness === 'HELD' && projection.truthClass === 'MEMORY_ARCHIVE_HELD';
  if (!current && !held) {
    throw new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_ARCHIVE_PROJECTION_INVALID', 'Living Journal archive truth/currentness state is not admitted', 500);
  }
  if (projection.selectedDay !== null) {
    const selected = projection.selectedDay;
    if (!object(selected) || selected.temporalTruthClass !== 'COMMITTED_MEMORY_AT_DAY' || selected.currentNowEvaluated !== false || selected.rawConversationContentIncluded !== false || !Array.isArray(selected.pages)) {
      throw new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_ARCHIVE_PROJECTION_INVALID', 'Selected historical day did not preserve COMMITTED_AT_DAY truth', 500);
    }
    if (selected.pages.some((page) => !object(page) || page.temporalTruthClass !== 'COMMITTED_MEMORY_AT_DAY' || page.currentNowEvaluated !== false || page.rawSourceContentIncluded !== false || page.firstPersonAuthorityGranted !== false)) {
      throw new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_ARCHIVE_PROJECTION_INVALID', 'Historical archive page crossed its temporal/source boundary', 500);
    }
  }
  return projection;
}

function publicArchiveFailureFor(error) {
  if (error instanceof BrowserLivingJournalMemoryBridgeError) return error;
  const code = error?.code;
  if (code === 'LIVING_JOURNAL_ARCHIVE_INPUT_INVALID' || code === 'LIVING_JOURNAL_ARCHIVE_SELECTION_INVALID') {
    return new BrowserLivingJournalMemoryBridgeError(code, 'Living Journal archive read request was rejected safely', 400);
  }
  if (code === 'LIVING_JOURNAL_ARCHIVE_SOURCE_INVALID') {
    return new BrowserLivingJournalMemoryBridgeError(code, 'Living Journal historical archive source is unavailable or inconsistent', 409);
  }
  return new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_ARCHIVE_READ_FAILED', 'Living Journal archive read failed safely', 500);
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

  function readArchive(input) {
    const request = validateBrowserLivingJournalArchiveRequest(input);
    try {
      const projection = projectLivingJournalMemoryArchive({
        ...serverIdentity,
        threadRef: request.threadRef,
        maxDays: request.maxDays,
        dayOffset: request.dayOffset,
        maxPages: request.maxPages,
        ...(request.selectedDayRef ? { selectedDayRef: request.selectedDayRef } : {}),
        ...(request.selectedDailyStratumSha256 ? { selectedDailyStratumSha256: request.selectedDailyStratumSha256 } : {})
      });
      return assertNoEffectArchiveProjection(projection);
    } catch (error) {
      throw publicArchiveFailureFor(error);
    }
  }

  return Object.freeze({ read, readArchive });
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

export function browserLivingJournalArchiveFailurePayload(error) {
  const typed = publicArchiveFailureFor(error);
  return Object.freeze({
    schemaVersion: 'vexlife.browser-living-journal-archive-failure/v1',
    state: 'FAILED',
    truthClass: 'LOCAL_COMMITTED_MEMORY_ARCHIVE_FAILURE',
    failureCode: typed.code,
    message: typed.message
  });
}

// [VXG RealForever]
