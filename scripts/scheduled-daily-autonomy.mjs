#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDailyMemoryDreamFixture } from './daily-memory-dream.mjs';
import { DAILY_MEMORY_DREAM_CONTRACT, loadDailyMemoryDreamState } from '../src/core/daily-memory-dream.mjs';
import { EVALUATED_RHYTHM_MODE } from '../src/core/evaluated-rhythm-learning.mjs';
import {
  SCHEDULED_DAILY_AUTONOMY_MODE,
  formStandingRestPolicy,
  commitStandingRestPolicy,
  runScheduledDailyAutonomyTick,
  observeScheduledSourceFrontier,
  projectScheduledDailyAutonomy,
  sourceDescentScheduledDailyAutonomy
} from '../src/core/scheduled-daily-autonomy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function policyInput(fixture, suffix, overrides = {}) {
  return {
    ...fixture.ids,
    standingRestAuthorityRef: overrides.standingRestAuthorityRef ?? `authority.g05a.${suffix}`,
    consentState: overrides.consentState ?? 'PERMITTED',
    timeZoneRef: overrides.timeZoneRef ?? 'America/Los_Angeles',
    restWindowStartLocalMinute: overrides.restWindowStartLocalMinute ?? 1200,
    restWindowEndLocalMinute: overrides.restWindowEndLocalMinute ?? 1380,
    optionalLearningPolicy: overrides.optionalLearningPolicy ?? 'ABSENT',
    formedAt: overrides.formedAt ?? '2026-08-08T03:30:00.000Z'
  };
}

function tickInput(fixture, suffix, overrides = {}) {
  return {
    ...fixture.ids,
    observedAt: overrides.observedAt ?? '2026-08-08T04:30:00.000Z',
    supervisorRef: overrides.supervisorRef ?? `supervisor.g05a.${suffix}`,
    instanceRef: overrides.instanceRef ?? `instance.g05a.${suffix}`,
    modelWorkerRef: overrides.modelWorkerRef ?? `worker.g05a.${suffix}`,
    interactivePending: overrides.interactivePending ?? false,
    resourceEvidence: overrides.resourceEvidence ?? { state: 'SUFFICIENT', sourceRef: `resource.g05a.${suffix}`, observedAt: overrides.observedAt ?? '2026-08-08T04:30:00.000Z' },
    expectedSourceFrontier: overrides.expectedSourceFrontier,
    optionalLearningCallback: overrides.optionalLearningCallback,
    faults: overrides.faults
  };
}

function result(ok, details = {}) { return { state: ok ? 'PASS' : 'FAIL', ...details }; }

async function expectCode(fn, codes) {
  try { await fn(); return { rejected: false, code: null }; }
  catch (error) { return { rejected: codes.includes(error?.code), code: error?.code ?? null }; }
}

function freshFixture(label, homeOverride = null) {
  return createDailyMemoryDreamFixture(`g05a-${label}`, homeOverride);
}

async function runProof() {
  const proofHome = process.env.VEXLIFE_G05A_PROOF_HOME ? path.resolve(process.env.VEXLIFE_G05A_PROOF_HOME) : null;
  const main = freshFixture('main', proofHome);

  const invalidConsent = await expectCode(
    () => Promise.resolve(formStandingRestPolicy(policyInput(main, 'bad', { consentState: 'UNKNOWN' }))),
    ['G05A_POLICY_INVALID']
  );
  const mainPolicy = commitStandingRestPolicy(policyInput(main, 'main'));

  const outside = await runScheduledDailyAutonomyTick(tickInput(main, 'outside', { observedAt: '2026-08-07T17:00:00.000Z' }));
  const interactive = await runScheduledDailyAutonomyTick(tickInput(main, 'interactive', { interactivePending: true }));
  const resourceUnknown = await runScheduledDailyAutonomyTick(tickInput(main, 'resource-unknown', { resourceEvidence: { state: 'UNKNOWN', sourceRef: 'resource.g05a.unknown' } }));

  const staleFrontier = observeScheduledSourceFrontier(main.ids);
  const staleRejected = await expectCode(
    () => runScheduledDailyAutonomyTick(tickInput(main, 'stale', { expectedSourceFrontier: { ...staleFrontier, scoreHeadSha256: '0'.repeat(64) } })),
    ['G05A_SOURCE_STALE']
  );

  const lockPath = path.join(main.ids.home, 'scheduled-daily-autonomy', main.ids.companionLineageRef, main.ids.threadRef, 'supervisor.lock');
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify({ synthetic: true }), 'utf8');
  const concurrentRejected = await expectCode(
    () => runScheduledDailyAutonomyTick(tickInput(main, 'concurrent')),
    ['G05A_SUPERVISOR_CONFLICT']
  );
  fs.rmSync(lockPath, { force: true });

  const collapsedSupervisorRejected = await expectCode(
    () => runScheduledDailyAutonomyTick(tickInput(main, 'collapsed', { supervisorRef: 'worker.g05a.same', modelWorkerRef: 'worker.g05a.same' })),
    ['G05A_SUPERVISOR_CONFLICT']
  );

  const mainFrontier = observeScheduledSourceFrontier(main.ids);
  const completed = await runScheduledDailyAutonomyTick(tickInput(main, 'main', { expectedSourceFrontier: mainFrontier }));
  const duplicate = await runScheduledDailyAutonomyTick(tickInput(main, 'duplicate'));
  const projection = projectScheduledDailyAutonomy(main.ids);
  const descent = sourceDescentScheduledDailyAutonomy(main.ids);

  const deferredFixture = freshFixture('deferred');
  commitStandingRestPolicy(policyInput(deferredFixture, 'deferred', { optionalLearningPolicy: 'DEFERRED' }));
  const deferred = await runScheduledDailyAutonomyTick(tickInput(deferredFixture, 'deferred'));

  const rejectedFixture = freshFixture('rejected');
  commitStandingRestPolicy(policyInput(rejectedFixture, 'rejected', { optionalLearningPolicy: 'EVALUATE_AFTER_WAKE' }));
  const rejected = await runScheduledDailyAutonomyTick(tickInput(rejectedFixture, 'rejected', {
    optionalLearningCallback: async () => ({ disposition: 'REJECTED' })
  }));

  const failedFixture = freshFixture('failed');
  commitStandingRestPolicy(policyInput(failedFixture, 'failed', { optionalLearningPolicy: 'EVALUATE_AFTER_WAKE' }));
  const failed = await runScheduledDailyAutonomyTick(tickInput(failedFixture, 'failed', {
    optionalLearningCallback: async () => { const error = new Error('synthetic optional learning failure'); error.code = 'SYNTHETIC_OPTIONAL_FAILURE'; throw error; }
  }));

  const crashFixture = freshFixture('crash');
  commitStandingRestPolicy(policyInput(crashFixture, 'crash'));
  const crash = await expectCode(
    () => runScheduledDailyAutonomyTick(tickInput(crashFixture, 'crash', { faults: { failAfterWakeBeforeReceipt: true } })),
    ['G05A_AFTER_WAKE_FAULT']
  );
  const crashDreamAfterFault = loadDailyMemoryDreamState(crashFixture.ids);
  const recovery = await runScheduledDailyAutonomyTick(tickInput(crashFixture, 'recovery'));
  const crashDreamAfterRecovery = loadDailyMemoryDreamState(crashFixture.ids);

  const driftFixture = freshFixture('drift');
  commitStandingRestPolicy(policyInput(driftFixture, 'drift-a'));
  const driftCrash = await expectCode(
    () => runScheduledDailyAutonomyTick(tickInput(driftFixture, 'drift-a', { faults: { failAfterWakeBeforeReceipt: true } })),
    ['G05A_AFTER_WAKE_FAULT']
  );
  commitStandingRestPolicy(policyInput(driftFixture, 'drift-b', {
    standingRestAuthorityRef: 'authority.g05a.drift.changed',
    formedAt: '2026-08-08T03:31:00.000Z'
  }));
  const driftRejected = await expectCode(
    () => runScheduledDailyAutonomyTick(tickInput(driftFixture, 'drift-b')),
    ['G05A_RECOVERY_POLICY_DRIFT']
  );

  const check0 = DAILY_MEMORY_DREAM_CONTRACT === 'contract.multivex.g03.daily-memory-only-dream/v1' && EVALUATED_RHYTHM_MODE === 'FAITHFUL_SIMULATED_RHYTHM_CANDIDATE';
  const check1 = invalidConsent.rejected && mainPolicy.policy.consentState === 'PERMITTED';
  const check2 = outside.state === 'OUTSIDE_REST_WINDOW' && outside.noEffect === true;
  const check3 = concurrentRejected.rejected && collapsedSupervisorRejected.rejected;
  const check4 = interactive.state === 'YIELDED_INTERACTIVE' && resourceUnknown.state === 'YIELDED_RESOURCE_UNKNOWN';
  const check5 = completed.state === 'COMPLETED' && completed.wakeCommitted === true && completed.receipt.g03WakeReceiptSha256 && completed.receipt.g03DreamHeadSha256;
  const check6 = staleRejected.rejected;
  const check7 = duplicate.state === 'DUPLICATE_SUPPRESSED' && duplicate.duplicateSuppressed === true && duplicate.receipt.dailyAutonomyReceiptSha256 === completed.receipt.dailyAutonomyReceiptSha256;
  const check8 = completed.receipt.optionalLearningDisposition === 'ABSENT' && deferred.receipt.optionalLearningDisposition === 'DEFERRED' && rejected.receipt.optionalLearningDisposition === 'REJECTED';
  const check9 = failed.receipt.optionalLearningDisposition === 'FAILED' && failed.receipt.optionalLearningFailureCode === 'SYNTHETIC_OPTIONAL_FAILURE' && failed.receipt.wakeCommitted === true;
  const check10 = crash.rejected && recovery.resumedAfterWake === true && crashDreamAfterFault.head.dailyDreamHeadSha256 === crashDreamAfterRecovery.head.dailyDreamHeadSha256 && driftCrash.rejected && driftRejected.rejected;
  const check11 = projection.wakeCommitted === true && descent.dailyAutonomyReceiptSha256 === completed.receipt.dailyAutonomyReceiptSha256 && descent.g03WakeReceiptSha256 === completed.receipt.g03WakeReceiptSha256 && descent.noRawConversationContent === true;
  const heldKeys = ['synchronizationPerformed','trainingPerformed','modelWeightsChanged','adapterChanged','rhythmActivationPerformed','powerControlPerformed','nativeWindowsServiceInstalled','publicationPerformed'];
  const check12 = heldKeys.every((key) => completed.receipt[key] === false && projection[key] === false) && failed.receipt.g03WakeReceiptSha256 === loadDailyMemoryDreamState(failedFixture.ids).head.wakeReceiptSha256;

  const checks = {
    'G05A-0': result(check0, { predecessorContractsBound: true, laterAuthorityGranted: false }),
    'G05A-1': result(check1, { positiveStandingAuthorityRequired: true }),
    'G05A-2': result(check2, { outsideWindowNoEffect: true }),
    'G05A-3': result(check3, { independentSupervisor: true, singleWriter: true }),
    'G05A-4': result(check4, { interactiveYield: true, unknownResourceYield: true }),
    'G05A-5': result(check5, { automaticDreamAdmission: true, wakeCommitted: completed.wakeCommitted }),
    'G05A-6': result(check6, { staleFrontierRejected: staleRejected.rejected }),
    'G05A-7': result(check7, { duplicateDaySuppressed: duplicate.duplicateSuppressed }),
    'G05A-8': result(check8, { dispositions: [completed.receipt.optionalLearningDisposition, deferred.receipt.optionalLearningDisposition, rejected.receipt.optionalLearningDisposition] }),
    'G05A-9': result(check9, { optionalFailureCode: failed.receipt.optionalLearningFailureCode, wakeCommitted: failed.receipt.wakeCommitted }),
    'G05A-10': result(check10, { recoveryPreservedDreamHead: crashDreamAfterFault.head.dailyDreamHeadSha256 === crashDreamAfterRecovery.head.dailyDreamHeadSha256, driftRejected: driftRejected.rejected }),
    'G05A-11': result(check11, { projectionState: projection.state, sourceDescent: true }),
    'G05A-12': result(check12, Object.fromEntries(heldKeys.map((key) => [key, false])))
  };
  const failedChecks = Object.entries(checks).filter(([, value]) => value.state !== 'PASS').map(([key]) => key);
  const receipt = {
    schemaVersion: 'vexlife.g05a.scheduled-daily-autonomy-proof/v1',
    state: failedChecks.length ? 'FAIL' : 'PASS',
    mode: SCHEDULED_DAILY_AUTONOMY_MODE,
    platform: process.platform,
    candidateHeadSha: process.env.VEXLIFE_CANDIDATE_HEAD_SHA || null,
    standingRestPolicy: true,
    independentSupervisor: true,
    automaticDreamAdmission: true,
    wakeIndependentOfOptionalLearning: check9,
    dailyReceiptVisible: check11,
    interactivePriorityPreserved: check4,
    duplicateDaySuppressed: check7,
    crashRecoveryPreservesWake: check10,
    hostSupervisorInstalled: false,
    nativeWindowsServiceInstalled: false,
    powerControlPerformed: false,
    synchronizationPerformed: false,
    trainingPerformed: false,
    modelWeightsChanged: false,
    adapterChanged: false,
    rhythmActivationPerformed: false,
    publicationPerformed: false,
    StageBRealTrainingState: 'HELD_SEPARATE_ADMISSION',
    standingPolicyRef: mainPolicy.policy.policyRef,
    standingPolicySha256: mainPolicy.policy.policySha256,
    supervisorRef: completed.receipt.supervisorRef,
    g03DreamHeadSha256: completed.receipt.g03DreamHeadSha256,
    g03DailyStratumSha256: completed.receipt.g03DailyStratumSha256,
    g03WakeReceiptSha256: completed.receipt.g03WakeReceiptSha256,
    dailyAutonomyReceiptRef: completed.receipt.dailyAutonomyReceiptRef,
    dailyAutonomyReceiptSha256: completed.receipt.dailyAutonomyReceiptSha256,
    optionalLearningEvidence: {
      absent: completed.receipt.optionalLearningDisposition,
      deferred: deferred.receipt.optionalLearningDisposition,
      rejected: rejected.receipt.optionalLearningDisposition,
      failed: failed.receipt.optionalLearningDisposition,
      failedCode: failed.receipt.optionalLearningFailureCode
    },
    checks,
    failedChecks,
    formedAt: new Date().toISOString()
  };
  if (failedChecks.length) throw new Error(`G05A proof failed: ${failedChecks.join(', ')}`);
  return receipt;
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  if (process.argv[2] !== 'proof') {
    process.stderr.write('Usage: node scripts/scheduled-daily-autonomy.mjs proof\n');
    process.exit(2);
  }
  const receipt = await runProof();
  const output = path.resolve(process.env.VEXLIFE_G05A_PROOF_RECEIPT ?? path.join(ROOT, 'generated', 'health', 'g05a-scheduled-daily-autonomy-windows-proof.json'));
  writeJson(output, receipt);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

export { runProof as runScheduledDailyAutonomyProof };

// [VXG RealForever]
