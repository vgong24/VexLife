import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  GLOBAL_ANNOUNCEMENT_CONTRACT_PATH,
  GLOBAL_ANNOUNCEMENT_CONTRACT_REF,
  GLOBAL_ANNOUNCEMENT_POLL_CONTRACT,
  GLOBAL_ANNOUNCEMENT_POLL_OBSERVATION_SCHEMA,
  GLOBAL_ANNOUNCEMENT_POLL_REQUEST_SCHEMA,
  GLOBAL_ANNOUNCEMENT_RECORD_SCHEMA,
  GlobalAnnouncementContractError,
  validateGlobalAnnouncementPollObservation,
  validateGlobalAnnouncementPollRequest,
  validateGlobalAnnouncementRecord
} from '../src/core/global-announcement-contract.mjs';

const REQUEST = Object.freeze({
  schemaVersion: GLOBAL_ANNOUNCEMENT_POLL_REQUEST_SCHEMA,
  contractRef: GLOBAL_ANNOUNCEMENT_CONTRACT_REF,
  requestRef: 'request.vexlife.global-announcement.patient-zero.001'
});

const MINIMUM_RECORD = Object.freeze({
  schemaVersion: GLOBAL_ANNOUNCEMENT_RECORD_SCHEMA,
  announcementRef: 'announcement.global.patient-zero.001',
  title: 'Maintenance notice',
  body: 'A bounded synthetic announcement for the first connected-operation proof.',
  severity: 'INFO'
});

function expectCode(fn, code) {
  assert.throws(
    fn,
    (error) => error instanceof GlobalAnnouncementContractError && error.code === code
  );
}



test('C0 language-neutral artifact is the portable meaning owner consumed by the JS POC', () => {
  const raw = JSON.parse(fs.readFileSync(GLOBAL_ANNOUNCEMENT_CONTRACT_PATH, 'utf8'));
  assert.equal(raw.contractRef, GLOBAL_ANNOUNCEMENT_CONTRACT_REF);
  assert.equal(raw.authority.portableMeaningOwner, true);
  assert.equal(raw.authority.platformRealizationOwner, false);
  assert.ok(raw.intendedConsumers.includes('VEXLIFE_PROD_COMMON_KOTLIN'));
  assert.ok(raw.intendedConsumers.includes('VEXLIFE_ANDROID_NATIVE'));
  assert.ok(raw.nonCollapse.includes('JAVASCRIPT_VALIDATOR != PORTABLE_CONTRACT_MEANING'));
  assert.ok(raw.nonCollapse.includes('KOTLIN_DATA_CLASS != PORTABLE_CONTRACT_MEANING'));
  assert.deepEqual(raw.announcementRecord.minimumFields, ['announcementRef', 'title', 'body', 'severity']);
});
test('C0 portable artifact owns REF, text, timestamp, and observation field constraints consumed by platform validators', () => {
  const raw = JSON.parse(fs.readFileSync(GLOBAL_ANNOUNCEMENT_CONTRACT_PATH, 'utf8'));
  assert.equal(raw.portablePolicies.ref.pattern, '^[A-Za-z0-9][A-Za-z0-9._:/#@+-]{0,511}$');
  assert.equal(raw.portablePolicies.boundedText.allowEmpty, false);
  assert.deepEqual(raw.portablePolicies.boundedText.disallowedCodePointRanges, [[0, 8], [11, 12], [14, 31], [127, 127]]);
  assert.equal(raw.portablePolicies.utcTimestamp.canonicalFormat, 'UTC_ISO_8601_MILLISECONDS');
  assert.equal(raw.portablePolicies.utcTimestamp.roundTripRequired, true);
  assert.equal(raw.request.fields.requestRef.policyRef, raw.portablePolicies.ref.policyRef);
  assert.equal(raw.announcementRecord.fields.announcementRef.policyRef, raw.portablePolicies.ref.policyRef);
  assert.equal(raw.announcementRecord.fields.title.policyRef, raw.portablePolicies.boundedText.policyRef);
  assert.equal(raw.announcementRecord.fields.effectiveAt.policyRef, raw.portablePolicies.utcTimestamp.policyRef);
  assert.equal(raw.observation.fields.requestRef.fieldRef, 'field.vexlife.global-announcement.observation.request-ref');
  assert.equal(raw.observation.fields.observedAt.policyRef, raw.portablePolicies.utcTimestamp.policyRef);
  assert.equal(raw.observation.fields.sourceRefs.itemPolicyRef, raw.portablePolicies.ref.policyRef);
  assert.equal(raw.observation.fields.sourceRefs.canonicalOrder, 'LEXICOGRAPHIC_ASCII');
});

test('C0 exposes one specific Poll contract without generic service-framework authority', () => {
  assert.equal(GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.contractRef, GLOBAL_ANNOUNCEMENT_CONTRACT_REF);
  assert.equal(GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.operation, 'POLL');
  assert.equal(GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.request.outwardScopeApplicable, false);
  assert.deepEqual(
    GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.announcementRecord.minimumFields,
    ['announcementRef', 'title', 'body', 'severity']
  );
  assert.deepEqual(
    GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.announcementRecord.richerFields,
    [
      'announcementRef',
      'title',
      'body',
      'severity',
      'effectiveAt',
      'expiresAt',
      'acknowledgementRequired'
    ]
  );
  assert.deepEqual(GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.request.minimumFields, ['requestRef']);
  assert.deepEqual(GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.request.envelopeFields, ['schemaVersion', 'contractRef']);
  assert.equal(
    GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.announcementRecord.fields.severity.fieldRef,
    'field.vexlife.global-announcement.record.severity'
  );
  assert.match(
    GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.announcementRecord.fields.severity.consumer,
    /semantic interpretation/u
  );
  assert.deepEqual(GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.lawfulServiceErrorForms, []);
  assert.equal(GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.authority.portableMeaningOwner, true);
  for (const [key, value] of Object.entries(GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.authority)) {
    if (key !== 'portableMeaningOwner') assert.equal(value, false, key);
  }
  assert.ok(GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.heldContractEvolution.includes('OUTWARD_ANNOUNCEMENT_EXPRESSION'));
  assert.ok(GLOBAL_ANNOUNCEMENT_POLL_CONTRACT.heldContractEvolution.includes('NOTIFICATION_DECISION'));
});

test('C0 Poll request is closed, contract-bound, and carries no security or target authority', () => {
  const accepted = validateGlobalAnnouncementPollRequest(REQUEST);
  assert.deepEqual(accepted, REQUEST);
  for (const field of ['principalRef', 'deviceRef', 'leaseRef', 'targetRef', 'sessionRef']) {
    expectCode(
      () => validateGlobalAnnouncementPollRequest({ ...REQUEST, [field]: 'forged' }),
      'GLOBAL_ANNOUNCEMENT_UNREGISTERED_FIELD'
    );
  }
  expectCode(
    () => validateGlobalAnnouncementPollRequest({ ...REQUEST, contractRef: 'contract.other' }),
    'GLOBAL_ANNOUNCEMENT_CONTRACT_MISMATCH'
  );
});

test('C0 minimum announcement record accepts only the admitted required meaning', () => {
  const accepted = validateGlobalAnnouncementRecord(MINIMUM_RECORD);
  assert.deepEqual(accepted, MINIMUM_RECORD);
  assert.equal(Object.isFrozen(accepted), true);
});

test('C0 richer announcement record admits only named optional timing and acknowledgement dimensions', () => {
  const accepted = validateGlobalAnnouncementRecord({
    ...MINIMUM_RECORD,
    severity: 'CRITICAL',
    effectiveAt: '2026-11-07T04:00:00.000Z',
    expiresAt: '2026-11-08T04:00:00.000Z',
    acknowledgementRequired: true
  });
  assert.equal(accepted.severity, 'CRITICAL');
  assert.equal(accepted.acknowledgementRequired, true);
});

test('C0 rejects session-local field invention and free-text severity', () => {
  expectCode(
    () => validateGlobalAnnouncementRecord({ ...MINIMUM_RECORD, newField: 'invented in Lab' }),
    'GLOBAL_ANNOUNCEMENT_UNREGISTERED_FIELD'
  );
  expectCode(
    () => validateGlobalAnnouncementRecord({ ...MINIMUM_RECORD, severity: 'VERY_IMPORTANT' }),
    'GLOBAL_ANNOUNCEMENT_SEVERITY_INVALID'
  );
});

test('C0 rejects malformed text and contradictory optional timing', () => {
  expectCode(
    () => validateGlobalAnnouncementRecord({ ...MINIMUM_RECORD, title: '' }),
    'GLOBAL_ANNOUNCEMENT_TEXT_INVALID'
  );
  expectCode(
    () => validateGlobalAnnouncementRecord({
      ...MINIMUM_RECORD,
      effectiveAt: '2026-11-08T04:00:00.000Z',
      expiresAt: '2026-11-07T04:00:00.000Z'
    }),
    'GLOBAL_ANNOUNCEMENT_TIME_RANGE_INVALID'
  );
});

test('C0 observation binds one Poll request to zero-or-one validated provider/domain record plus evidence', () => {
  const result = validateGlobalAnnouncementPollObservation({
    schemaVersion: GLOBAL_ANNOUNCEMENT_POLL_OBSERVATION_SCHEMA,
    contractRef: GLOBAL_ANNOUNCEMENT_CONTRACT_REF,
    requestRef: REQUEST.requestRef,
    observedAt: '2026-11-07T04:10:00.000Z',
    announcementOrNull: MINIMUM_RECORD,
    sourceRefs: ['source.synthetic.global-announcement.patient-zero.001']
  });
  assert.equal(result.announcementOrNull.announcementRef, MINIMUM_RECORD.announcementRef);
  assert.deepEqual(result.sourceRefs, ['source.synthetic.global-announcement.patient-zero.001']);

  const empty = validateGlobalAnnouncementPollObservation({
    schemaVersion: GLOBAL_ANNOUNCEMENT_POLL_OBSERVATION_SCHEMA,
    contractRef: GLOBAL_ANNOUNCEMENT_CONTRACT_REF,
    requestRef: REQUEST.requestRef,
    observedAt: '2026-11-07T04:10:00.000Z',
    announcementOrNull: null,
    sourceRefs: ['source.synthetic.global-announcement.patient-zero.001']
  });
  assert.equal(empty.announcementOrNull, null);
});

test('C0 observation remains provider/domain truth and cannot smuggle Family or effect authority', () => {
  const base = {
    schemaVersion: GLOBAL_ANNOUNCEMENT_POLL_OBSERVATION_SCHEMA,
    contractRef: GLOBAL_ANNOUNCEMENT_CONTRACT_REF,
    requestRef: REQUEST.requestRef,
    observedAt: '2026-11-07T04:10:00.000Z',
    announcementOrNull: MINIMUM_RECORD,
    sourceRefs: ['source.synthetic.global-announcement.patient-zero.001']
  };
  for (const [field, value] of [
    ['familyState', 'UNACKNOWLEDGED'],
    ['authorized', true],
    ['networkAvailable', true],
    ['notificationShouldFire', true],
    ['published', true]
  ]) {
    expectCode(
      () => validateGlobalAnnouncementPollObservation({ ...base, [field]: value }),
      'GLOBAL_ANNOUNCEMENT_UNREGISTERED_FIELD'
    );
  }
});
