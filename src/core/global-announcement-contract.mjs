import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GLOBAL_ANNOUNCEMENT_CONTRACT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../blueprint/global-announcement-contract.json'
);

function cloneFreeze(value) {
  const cloned = structuredClone(value);
  const freeze = (item) => {
    if (item && typeof item === 'object' && !Object.isFrozen(item)) {
      for (const nested of Object.values(item)) freeze(nested);
      Object.freeze(item);
    }
    return item;
  };
  return freeze(cloned);
}

function loadContractArtifact() {
  const value = JSON.parse(fs.readFileSync(GLOBAL_ANNOUNCEMENT_CONTRACT_PATH, 'utf8'));
  if (value?.schemaVersion !== 'vexlife.global-announcement-contract/v1') {
    throw new Error('GLOBAL_ANNOUNCEMENT_CONTRACT_ARTIFACT_SCHEMA_UNSUPPORTED');
  }
  if (value?.contractRef !== 'contract.vexlife.global-announcement.poll/v1') {
    throw new Error('GLOBAL_ANNOUNCEMENT_CONTRACT_ARTIFACT_REF_UNSUPPORTED');
  }
  if (value?.operation !== 'POLL' || value?.operationRef !== 'operation.vexlife.global-announcement.poll') {
    throw new Error('GLOBAL_ANNOUNCEMENT_CONTRACT_ARTIFACT_OPERATION_INVALID');
  }
  return cloneFreeze(value);
}

export const GLOBAL_ANNOUNCEMENT_POLL_CONTRACT = loadContractArtifact();
export const GLOBAL_ANNOUNCEMENT_CONTRACT_SCHEMA = GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.schemaVersion;
export const GLOBAL_ANNOUNCEMENT_CONTRACT_REF = GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.contractRef;
export const GLOBAL_ANNOUNCEMENT_SERVICE_REF = GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.serviceRef;
export const GLOBAL_ANNOUNCEMENT_FEATURE_REF = GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.featureRef;
export const GLOBAL_ANNOUNCEMENT_POLL_REQUEST_SCHEMA = GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.request.schemaVersion;
export const GLOBAL_ANNOUNCEMENT_RECORD_SCHEMA = GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.announcementRecord.schemaVersion;
export const GLOBAL_ANNOUNCEMENT_POLL_OBSERVATION_SCHEMA = GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.observation.schemaVersion;
export const GLOBAL_ANNOUNCEMENT_SEVERITIES = Object.freeze([
  ...GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.announcementRecord.fields.severity.allowedValues
]);

const SEVERITY_SET = new Set(GLOBAL_ANNOUNCEMENT_SEVERITIES);
const REF_POLICY = GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.portablePolicies.ref;
const TEXT_POLICY = GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.portablePolicies.boundedText;
const TIMESTAMP_POLICY = GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.portablePolicies.utcTimestamp;
const REF = new RegExp(REF_POLICY.pattern, 'u');
const REQUEST_KEYS = new Set([
  ...GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.request.envelopeFields,
  ...GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.request.minimumFields
]);
const RECORD_REQUIRED_KEYS = Object.freeze([
  ...GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.announcementRecord.envelopeFields,
  ...GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.announcementRecord.minimumFields
]);
const RECORD_OPTIONAL_KEYS = Object.freeze(
  GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.announcementRecord.richerFields.filter(
    (field) => !GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.announcementRecord.minimumFields.includes(field)
  )
);
const RECORD_KEYS = new Set([...RECORD_REQUIRED_KEYS, ...RECORD_OPTIONAL_KEYS]);
const OBSERVATION_KEYS = new Set([
  ...GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.observation.envelopeFields,
  ...Object.keys(GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.observation.fields)
]);

const MAX_TITLE_CODE_POINTS = GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.announcementRecord.fields.title.maxCodePoints;
const MAX_BODY_CODE_POINTS = GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.announcementRecord.fields.body.maxCodePoints;

export class GlobalAnnouncementContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GlobalAnnouncementContractError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new GlobalAnnouncementContractError(code, message);
};

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, allowed, required, label) {
  if (!object(value)) fail('GLOBAL_ANNOUNCEMENT_INPUT_INVALID', `${label} must be one object`);
  const keys = Object.keys(value);
  const extra = keys.find((key) => !allowed.has(key));
  if (extra) fail('GLOBAL_ANNOUNCEMENT_UNREGISTERED_FIELD', `${label}.${extra} is not admitted`);
  const missing = required.find((key) => !Object.hasOwn(value, key));
  if (missing) fail('GLOBAL_ANNOUNCEMENT_INPUT_INVALID', `${label}.${missing} is required`);
  return value;
}

function ref(value, label) {
  if (typeof value !== 'string' || !REF.test(value)) {
    fail('GLOBAL_ANNOUNCEMENT_REF_INVALID', `${label} must be one safe opaque ref`);
  }
  return value;
}

function refs(values, label) {
  if (!Array.isArray(values) || values.length === 0) {
    fail('GLOBAL_ANNOUNCEMENT_SOURCE_REFS_REQUIRED', `${label} must be a non-empty ref array`);
  }
  const normalized = values.map((value, index) => ref(value, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    fail('GLOBAL_ANNOUNCEMENT_SOURCE_REFS_REQUIRED', `${label} must not contain duplicate refs`);
  }
  return Object.freeze([...normalized].sort());
}

function disallowedTextCodePoint(codePoint) {
  return TEXT_POLICY.disallowedCodePointRanges.some(([start, end]) => codePoint >= start && codePoint <= end);
}

function boundedText(value, label, maxCodePoints) {
  if (typeof value !== 'string') {
    fail('GLOBAL_ANNOUNCEMENT_TEXT_INVALID', `${label} must be text`);
  }
  const codePoints = [...value];
  if (
    (TEXT_POLICY.allowEmpty === false && codePoints.length < 1)
    || codePoints.length > maxCodePoints
    || codePoints.some((value) => disallowedTextCodePoint(value.codePointAt(0)))
  ) {
    fail(
      'GLOBAL_ANNOUNCEMENT_TEXT_INVALID',
      `${label} must satisfy ${TEXT_POLICY.policyRef} within ${maxCodePoints} code points`
    );
  }
  return value;
}

function canonicalTimestamp(value, label) {
  if (
    TIMESTAMP_POLICY.canonicalFormat !== 'UTC_ISO_8601_MILLISECONDS'
    || TIMESTAMP_POLICY.roundTripRequired !== true
    || typeof value !== 'string'
    || !Number.isFinite(Date.parse(value))
  ) {
    fail('GLOBAL_ANNOUNCEMENT_TIMESTAMP_INVALID', `${label} must satisfy ${TIMESTAMP_POLICY.policyRef}`);
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) {
    fail('GLOBAL_ANNOUNCEMENT_TIMESTAMP_INVALID', `${label} must satisfy ${TIMESTAMP_POLICY.policyRef}`);
  }
  return value;
}

export function validateGlobalAnnouncementPollRequest(value) {
  exactKeys(value, REQUEST_KEYS, [...REQUEST_KEYS], 'pollRequest');
  if (value.schemaVersion !== GLOBAL_ANNOUNCEMENT_POLL_REQUEST_SCHEMA) {
    fail('GLOBAL_ANNOUNCEMENT_REQUEST_SCHEMA_UNSUPPORTED', 'poll request schema is unsupported');
  }
  if (value.contractRef !== GLOBAL_ANNOUNCEMENT_CONTRACT_REF) {
    fail('GLOBAL_ANNOUNCEMENT_CONTRACT_MISMATCH', 'poll request contractRef is unsupported');
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    contractRef: value.contractRef,
    requestRef: ref(value.requestRef, 'pollRequest.requestRef')
  });
}

export function validateGlobalAnnouncementRecord(value) {
  exactKeys(value, RECORD_KEYS, RECORD_REQUIRED_KEYS, 'announcementRecord');
  if (value.schemaVersion !== GLOBAL_ANNOUNCEMENT_RECORD_SCHEMA) {
    fail('GLOBAL_ANNOUNCEMENT_RECORD_SCHEMA_UNSUPPORTED', 'announcement record schema is unsupported');
  }
  const announcementRef = ref(value.announcementRef, 'announcementRecord.announcementRef');
  const title = boundedText(value.title, 'announcementRecord.title', MAX_TITLE_CODE_POINTS);
  const body = boundedText(value.body, 'announcementRecord.body', MAX_BODY_CODE_POINTS);
  if (!SEVERITY_SET.has(value.severity)) {
    fail('GLOBAL_ANNOUNCEMENT_SEVERITY_INVALID', 'announcementRecord.severity is outside the closed contract enum');
  }

  const effectiveAt = value.effectiveAt === undefined
    ? undefined
    : canonicalTimestamp(value.effectiveAt, 'announcementRecord.effectiveAt');
  const expiresAt = value.expiresAt === undefined
    ? undefined
    : canonicalTimestamp(value.expiresAt, 'announcementRecord.expiresAt');
  if (effectiveAt !== undefined && expiresAt !== undefined && Date.parse(expiresAt) <= Date.parse(effectiveAt)) {
    fail('GLOBAL_ANNOUNCEMENT_TIME_RANGE_INVALID', 'expiresAt must be later than effectiveAt');
  }
  if (value.acknowledgementRequired !== undefined && typeof value.acknowledgementRequired !== 'boolean') {
    fail('GLOBAL_ANNOUNCEMENT_ACKNOWLEDGEMENT_INVALID', 'acknowledgementRequired must be boolean when present');
  }

  return cloneFreeze({
    schemaVersion: value.schemaVersion,
    announcementRef,
    title,
    body,
    severity: value.severity,
    ...(effectiveAt === undefined ? {} : { effectiveAt }),
    ...(expiresAt === undefined ? {} : { expiresAt }),
    ...(value.acknowledgementRequired === undefined
      ? {}
      : { acknowledgementRequired: value.acknowledgementRequired })
  });
}

export function validateGlobalAnnouncementPollObservation(value) {
  exactKeys(value, OBSERVATION_KEYS, [...OBSERVATION_KEYS], 'pollObservation');
  if (value.schemaVersion !== GLOBAL_ANNOUNCEMENT_POLL_OBSERVATION_SCHEMA) {
    fail('GLOBAL_ANNOUNCEMENT_OBSERVATION_SCHEMA_UNSUPPORTED', 'poll observation schema is unsupported');
  }
  if (value.contractRef !== GLOBAL_ANNOUNCEMENT_CONTRACT_REF) {
    fail('GLOBAL_ANNOUNCEMENT_CONTRACT_MISMATCH', 'poll observation contractRef is unsupported');
  }
  const requestRef = ref(value.requestRef, 'pollObservation.requestRef');
  const observedAt = canonicalTimestamp(value.observedAt, 'pollObservation.observedAt');
  const sourceRefs = refs(value.sourceRefs, 'pollObservation.sourceRefs');
  const announcementOrNull = value.announcementOrNull === null
    ? null
    : validateGlobalAnnouncementRecord(value.announcementOrNull);

  return cloneFreeze({
    schemaVersion: value.schemaVersion,
    contractRef: value.contractRef,
    requestRef,
    observedAt,
    announcementOrNull,
    sourceRefs
  });
}

// [VXG RealForever]
