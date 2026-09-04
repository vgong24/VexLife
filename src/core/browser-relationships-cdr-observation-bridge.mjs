import fs from 'node:fs';
import path from 'node:path';

import { bindRelationshipsCdrObservation } from './relationships-cdr-observation-binding.mjs';

export const BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_API_PATH = '/api/v1/relationships/cdr-persistence-binding';
export const BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_SCHEMA = 'vexlife.browser-relationships-cdr-persistence-binding/v1';
export const BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_FAILURE_SCHEMA = 'vexlife.browser-relationships-cdr-persistence-binding-failure/v1';
export const BROWSER_RELATIONSHIPS_CDR_OBSERVATION_MAX_BYTES = 64 * 1024;

const SAFE_FAILURE_CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;

export class BrowserRelationshipsCdrObservationBridgeError extends Error {
  constructor(code, message = code, httpStatus = 409) {
    super(message);
    this.name = 'BrowserRelationshipsCdrObservationBridgeError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function fail(code, message = code, httpStatus = 409) {
  throw new BrowserRelationshipsCdrObservationBridgeError(code, message, httpStatus);
}

function sameCanonicalPath(left, right) {
  const a = path.normalize(path.resolve(left));
  const b = path.normalize(path.resolve(right));
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function clone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    fail('RELATIONSHIPS_CDR_OBSERVATION_INVALID', 'Relationships CDR observation is not JSON-serializable');
  }
}

function readBoundedRegularFile({ requested, canonical, initialStat, maxBytes }) {
  let descriptor = null;
  try {
    descriptor = fs.openSync(canonical, 'r');
    const openedStat = fs.fstatSync(descriptor);
    if (!openedStat.isFile()) {
      fail('RELATIONSHIPS_CDR_OBSERVATION_PATH_INVALID', 'Relationships CDR observation must remain one regular file');
    }
    if (openedStat.dev !== initialStat.dev || openedStat.ino !== initialStat.ino) {
      fail('RELATIONSHIPS_CDR_OBSERVATION_PATH_INVALID', 'Relationships CDR observation changed before it could be opened');
    }

    const openedCanonical = fs.realpathSync.native(requested);
    if (!sameCanonicalPath(openedCanonical, canonical) || !sameCanonicalPath(openedCanonical, requested)) {
      fail('RELATIONSHIPS_CDR_OBSERVATION_PATH_INVALID', 'Relationships CDR observation path changed before it could be read');
    }
    if (openedStat.size > maxBytes) {
      fail('RELATIONSHIPS_CDR_OBSERVATION_TOO_LARGE', 'Relationships CDR observation exceeds the bounded size', 413);
    }

    const buffer = Buffer.alloc(maxBytes + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const count = fs.readSync(descriptor, buffer, offset, buffer.length - offset, null);
      if (count === 0) break;
      offset += count;
    }
    if (offset > maxBytes) {
      fail('RELATIONSHIPS_CDR_OBSERVATION_TOO_LARGE', 'Relationships CDR observation exceeded the bounded size while being read', 413);
    }
    return buffer.toString('utf8', 0, offset);
  } catch (error) {
    if (error instanceof BrowserRelationshipsCdrObservationBridgeError) throw error;
    fail('RELATIONSHIPS_CDR_OBSERVATION_UNAVAILABLE', 'Relationships CDR observation could not be read safely');
  } finally {
    if (descriptor !== null) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // The observation read is already complete or failed closed; no descriptor escapes this scope.
      }
    }
  }
}

function readObservationFile(observationPath, maxBytes) {
  if (typeof observationPath !== 'string' || !observationPath.trim()) {
    fail('RELATIONSHIPS_CDR_OBSERVATION_UNBOUND', 'Relationships CDR observation is not bound', 200);
  }
  if (!path.isAbsolute(observationPath)) {
    fail('RELATIONSHIPS_CDR_OBSERVATION_PATH_INVALID', 'Relationships CDR observation path must be absolute');
  }

  const requested = path.resolve(observationPath);
  let stat;
  try {
    stat = fs.lstatSync(requested);
  } catch {
    fail('RELATIONSHIPS_CDR_OBSERVATION_UNAVAILABLE', 'Relationships CDR observation is unavailable');
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    fail('RELATIONSHIPS_CDR_OBSERVATION_PATH_INVALID', 'Relationships CDR observation must be one regular non-link file');
  }

  let canonical;
  try {
    canonical = fs.realpathSync.native(requested);
  } catch {
    fail('RELATIONSHIPS_CDR_OBSERVATION_UNAVAILABLE', 'Relationships CDR observation is unavailable');
  }
  if (!sameCanonicalPath(canonical, requested)) {
    fail('RELATIONSHIPS_CDR_OBSERVATION_PATH_INVALID', 'Relationships CDR observation path is not canonical');
  }

  let value;
  try {
    const text = readBoundedRegularFile({ requested, canonical, initialStat: stat, maxBytes });
    value = JSON.parse(text);
  } catch (error) {
    if (error instanceof BrowserRelationshipsCdrObservationBridgeError) throw error;
    fail('RELATIONSHIPS_CDR_OBSERVATION_INVALID', 'Relationships CDR observation is not valid JSON');
  }
  return value;
}

function projectBinding(value) {
  const result = bindRelationshipsCdrObservation(value);
  if (result?.state !== 'BOUND_CURRENT' || !result.binding || typeof result.binding !== 'object' || Array.isArray(result.binding)) {
    const code = typeof result?.failureCode === 'string' && SAFE_FAILURE_CODE.test(result.failureCode)
      ? result.failureCode
      : 'RELATIONSHIPS_CDR_OBSERVATION_HELD';
    fail(code, 'Relationships CDR observation is not currently admissible');
  }
  return Object.freeze({
    schemaVersion: BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_SCHEMA,
    state: 'BOUND_CURRENT',
    binding: Object.freeze(clone(result.binding))
  });
}

export function createBrowserRelationshipsCdrObservationBridge({
  observationPath = null,
  maxBytes = BROWSER_RELATIONSHIPS_CDR_OBSERVATION_MAX_BYTES
} = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1024 || maxBytes > BROWSER_RELATIONSHIPS_CDR_OBSERVATION_MAX_BYTES) {
    fail('RELATIONSHIPS_CDR_OBSERVATION_LIMIT_INVALID', 'Relationships CDR observation size limit is invalid');
  }
  return Object.freeze({
    read() {
      return projectBinding(readObservationFile(observationPath, maxBytes));
    }
  });
}

export function browserRelationshipsCdrObservationFailurePayload(error) {
  const typed = error instanceof BrowserRelationshipsCdrObservationBridgeError
    ? error
    : new BrowserRelationshipsCdrObservationBridgeError(
      'RELATIONSHIPS_CDR_OBSERVATION_BINDING_FAILED',
      'Relationships CDR persistence binding failed safely',
      500
    );
  return Object.freeze({
    schemaVersion: BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_FAILURE_SCHEMA,
    state: 'HELD_BINDING_REQUIRED',
    failureCode: typed.code
  });
}

// [VXG RealForever]
