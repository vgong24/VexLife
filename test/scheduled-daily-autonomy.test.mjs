import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEDULED_DAILY_AUTONOMY_MODE,
  formStandingRestPolicy,
  isRestWindowEligible
} from '../src/core/scheduled-daily-autonomy.mjs';

const base = {
  homeRef: 'home.g05a.test',
  deviceRef: 'device.g05a.test',
  companionLineageRef: 'lineage.g05a.test',
  threadRef: 'thread.g05a.test',
  standingRestAuthorityRef: 'authority.g05a.test',
  consentState: 'PERMITTED',
  timeZoneRef: 'America/Los_Angeles',
  restWindowStartLocalMinute: 1200,
  restWindowEndLocalMinute: 1380,
  optionalLearningPolicy: 'ABSENT',
  formedAt: '2026-08-08T03:30:00.000Z'
};

test('G05A policy is content addressed and deterministic', () => {
  const first = formStandingRestPolicy(base);
  const second = formStandingRestPolicy(base);
  assert.equal(first.schemaVersion, 'vexlife.g05a.standing-rest-policy/v1');
  assert.equal(first.policyRef, second.policyRef);
  assert.equal(first.policySha256, second.policySha256);
  assert.equal(SCHEDULED_DAILY_AUTONOMY_MODE, 'DETERMINISTIC_SCHEDULED_AUTONOMY_CORE');
});

test('G05A standing consent fails closed', () => {
  assert.throws(() => formStandingRestPolicy({ ...base, consentState: 'UNKNOWN' }), (error) => error?.code === 'G05A_POLICY_INVALID');
});

test('G05A rest window uses the configured timezone deterministically', () => {
  const policy = formStandingRestPolicy(base);
  const inside = isRestWindowEligible(policy, '2026-08-08T04:30:00.000Z'); // 21:30 PDT Aug 7
  const outside = isRestWindowEligible(policy, '2026-08-07T17:00:00.000Z'); // 10:00 PDT Aug 7
  assert.equal(inside.calendarDateRef, '2026-08-07');
  assert.equal(inside.eligible, true);
  assert.equal(outside.eligible, false);
});

test('G05A wrapping rest windows are deterministic', () => {
  const policy = formStandingRestPolicy({ ...base, restWindowStartLocalMinute: 1320, restWindowEndLocalMinute: 360 });
  assert.equal(isRestWindowEligible(policy, '2026-08-08T06:00:00.000Z').eligible, true); // 23:00 PDT
  assert.equal(isRestWindowEligible(policy, '2026-08-08T12:00:00.000Z').eligible, true); // 05:00 PDT
  assert.equal(isRestWindowEligible(policy, '2026-08-08T19:00:00.000Z').eligible, false); // 12:00 PDT
});

// [VXG RealForever]
