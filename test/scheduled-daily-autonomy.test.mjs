import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEDULED_DAILY_AUTONOMY_MODE,
  G05A_FAILURE_CODES,
  formStandingRestPolicy,
  formScheduledAutonomyAdmissionEvidence,
  isRestWindowEligible
} from '../src/core/scheduled-daily-autonomy.mjs';
import { semanticHash } from '../src/core/utils.mjs';

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
  assert.ok(G05A_FAILURE_CODES.includes('G05A_SUPERVISOR_RECOVERY_REQUIRED'));
  assert.ok(G05A_FAILURE_CODES.includes('G05A_ADMISSION_EVIDENCE_INVALID'));
});


function resourceSnapshot(observedAt = '2026-08-08T04:30:00.000Z', overrides = {}) {
  const sourceRef = overrides.sourceRef ?? 'resource-source.g05a.test';
  const core = {
    schemaVersion: 'vexlife.intent-resource-snapshot/v1', snapshotRef: 'resource-snapshot.g05a.test', generation: 1,
    sourceRef, sourceHash: semanticHash(`source-managed:${sourceRef}`), formationRef: 'formation.g05a.test-resource',
    evidenceClass: 'LIVE_RUNTIME_CURRENT', cpuLoadPct: 10, cpuConcurrencyLimit: 4, cpuActiveCount: 0,
    ramAvailableMb: 8192, ramReservedMb: 512, gpuAvailable: false, vramAvailableMb: 0, vramReservedMb: 0,
    modelResident: false, activeModelTurn: false, activeHeavyTool: false,
    interactiveWaitState: overrides.interactiveWaitState ?? 'IDLE', backgroundWorkAdmission: overrides.backgroundWorkAdmission ?? 'ADMITTED',
    thermalPowerState: 'NOMINAL', currentness: 'CURRENT',
    formedAt: '2026-08-08T04:29:59.000Z', observedAt, expiresAt: '2026-08-08T04:31:00.000Z'
  };
  return { ...core, semanticFingerprint: semanticHash(core) };
}

test('G05A supervisor admission evidence is exact, current, and content addressed', () => {
  const policy = formStandingRestPolicy(base);
  const sourceFrontier = {
    conversationHeadSha256: '1'.repeat(64),
    scoreHeadSha256: '2'.repeat(64),
    semanticAuthorityHeadSha256: '3'.repeat(64),
    dreamHeadSha256: null,
    dailyStratumSha256: null,
    wakeReceiptSha256: null
  };
  const evidence = formScheduledAutonomyAdmissionEvidence({
    homeRef: base.homeRef,
    deviceRef: base.deviceRef,
    companionLineageRef: base.companionLineageRef,
    threadRef: base.threadRef,
    supervisorRef: 'supervisor.g05a.test',
    supervisorInstanceRef: 'instance.g05a.test',
    standingPolicyRef: policy.policyRef,
    standingPolicySha256: policy.policySha256,
    standingPolicyHeadSha256: '4'.repeat(64),
    standingRestAuthorityRef: policy.standingRestAuthorityRef,
    observedAt: '2026-08-08T04:30:00.000Z',
    sourceFrontier,
    resourceSnapshot: resourceSnapshot()
  });
  assert.equal(evidence.schemaVersion, 'vexlife.g05a.supervisor-admission-evidence/v1');
  assert.equal(evidence.resourceAdmissionState, 'ADMITTED');
  assert.equal(evidence.interactiveWaitState, 'IDLE');
  assert.equal(evidence.resourceEvidenceClass, 'LIVE_RUNTIME_CURRENT');
  assert.equal(evidence.externalEffectAuthorityGranted, false);
  assert.equal(evidence.nativeHostConformanceClaimed, false);
  assert.throws(() => formScheduledAutonomyAdmissionEvidence({
    homeRef: base.homeRef, deviceRef: base.deviceRef, companionLineageRef: base.companionLineageRef, threadRef: base.threadRef,
    supervisorRef: 'supervisor.g05a.test', supervisorInstanceRef: 'instance.g05a.test',
    standingPolicyRef: policy.policyRef, standingPolicySha256: policy.policySha256, standingPolicyHeadSha256: '4'.repeat(64),
    standingRestAuthorityRef: policy.standingRestAuthorityRef, observedAt: '2026-08-08T04:30:00.000Z', sourceFrontier,
    resourceSnapshot: { ...resourceSnapshot(), evidenceClass: 'SIMULATED_CURRENT' }
  }), (error) => error?.code === 'G05A_ADMISSION_EVIDENCE_INVALID');
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
