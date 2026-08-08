import test from 'node:test';
import assert from 'node:assert/strict';
import * as g05a from '../src/core/scheduled-daily-autonomy.mjs';

const base = {
  humanSubjectRef: 'human.synthetic.g05a.unit', homeRef: 'home.g05a.unit', deviceRef: 'device.g05a.unit',
  companionLineageRef: 'lineage.g05a.unit', threadRef: 'thread.g05a.unit', timeZoneRef: 'America/Los_Angeles',
  restWindowStartLocalMinute: 1200, restWindowEndLocalMinute: 1380, optionalLearningPolicy: 'ABSENT',
  formedAt: '2026-08-08T03:30:00.000Z'
};

test('G05A policy is configuration-only and content-addressed', () => {
  const first = g05a.formStandingRestPolicy(base);
  const second = g05a.formStandingRestPolicy(base);
  assert.equal(first.schemaVersion, 'vexlife.g05a.standing-rest-policy/v2');
  assert.equal(first.executionAuthority, 'NONE_CONFIGURATION_ONLY');
  assert.equal(first.policySha256, second.policySha256);
  assert.equal('consentState' in first, false);
  assert.equal('standingRestAuthorityRef' in first, false);
  assert.equal('formScheduledAutonomyAdmissionEvidence' in g05a, false);
  assert.equal('commitAdmission' in g05a, false);
  assert.equal('loadAdmissionHistory' in g05a, false);
});

test('G05A policy rejects caller consent or authority vocabulary', () => {
  assert.throws(() => g05a.formStandingRestPolicy({ ...base, consentState: 'PERMITTED' }), /unknown|authority|configuration|fields|consent/i);
  assert.throws(() => g05a.formStandingRestPolicy({ ...base, standingRestAuthorityRef: 'authority.fake' }), /unknown|authority|configuration|fields/i);
});

test('G05A exact Safety standing scope is derived from configuration', () => {
  const policy = g05a.formStandingRestPolicy(base);
  const result = g05a.buildScheduledStandingScopeForPolicy(policy);
  assert.equal(result.scope.purposeRef, 'purpose.vexlife.g05.scheduled-daily-memory-dream');
  assert.equal(result.scope.selectedMode, 'MEMORY_ONLY_CONSOLIDATION');
  assert.equal(result.scope.exactlyOnceCalendarDay, true);
  assert.equal(result.scope.interactiveYieldRequired, true);
  assert.equal(result.scope.localOnly, true);
  assert.deepEqual(result.scope.permittedUseRefs, [
    'use.vexlife.g05.form-bounded-supervisor-admission-and-wake-receipts',
    'use.vexlife.g05.schedule-one-g03-memory-only-dream-per-local-calendar-day'
  ].sort());
  assert.equal(/^[0-9a-f]{64}$/u.test(result.standingScopeFingerprint), true);
});

test('G05A optional G04 Stage-A use is explicit and no broader use is admitted', () => {
  const policy = g05a.formStandingRestPolicy({ ...base, optionalLearningPolicy: 'EVALUATE_AFTER_WAKE' });
  const result = g05a.buildScheduledStandingScopeForPolicy(policy);
  assert.equal(result.scope.permittedUseRefs.includes('use.vexlife.g05.after-wake-g04-stage-a-simulated-inactive-evaluation'), true);
  assert.equal(result.scope.permittedUseRefs.includes('use.vexlife.g05.real-training'), false);
  assert.equal(result.scope.prohibitedUseRefs.includes('use.vexlife.g05.real-training'), true);
});

test('G05A rest window uses configured timezone deterministically', () => {
  const policy = g05a.formStandingRestPolicy(base);
  assert.equal(g05a.isRestWindowEligible(policy, '2026-08-08T04:30:00.000Z').eligible, true);
  assert.equal(g05a.isRestWindowEligible(policy, '2026-08-07T17:00:00.000Z').eligible, false);
});

test('G05A wrapping rest windows remain deterministic', () => {
  const policy = g05a.formStandingRestPolicy({ ...base, restWindowStartLocalMinute: 1320, restWindowEndLocalMinute: 360 });
  assert.equal(g05a.isRestWindowEligible(policy, '2026-08-08T06:00:00.000Z').eligible, true);
  assert.equal(g05a.isRestWindowEligible(policy, '2026-08-08T12:00:00.000Z').eligible, true);
  assert.equal(g05a.isRestWindowEligible(policy, '2026-08-08T19:00:00.000Z').eligible, false);
});

test('G05A committed admission lineage remains private to the source-owned execution path', () => {
  assert.equal('commitAdmission' in g05a, false);
  assert.equal('loadAdmissionHistory' in g05a, false);
  assert.equal('findRecoveryAdmission' in g05a, false);
});

test('G05A source exposes the authority-provenance failure vocabulary', () => {
  for (const code of ['G05A_ADMISSION_EVIDENCE_INVALID','G05A_SUPERVISOR_RECOVERY_REQUIRED','G05A_RECOVERY_POLICY_DRIFT','G05A_SOURCE_STALE']) {
    assert.equal(g05a.G05A_FAILURE_CODES.includes(code), true);
  }
});

// [VXG RealForever]
