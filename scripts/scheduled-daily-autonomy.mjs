#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDailyMemoryDreamFixture } from './daily-memory-dream.mjs';
import { DAILY_MEMORY_DREAM_CONTRACT, commitDailyMemoryDream, loadDailyMemoryDreamState } from '../src/core/daily-memory-dream.mjs';
import { loadScoreContextState } from '../src/core/score-context-continuity.mjs';
import { EVALUATED_RHYTHM_MODE, formSyntheticStageAConsentReceipt } from '../src/core/evaluated-rhythm-learning.mjs';
import { semanticHash } from '../src/core/utils.mjs';
import {
  SCHEDULED_DAILY_AUTONOMY_MODE,
  formStandingRestPolicy,
  formScheduledAutonomyAdmissionEvidence,
  commitStandingRestPolicy,
  loadStandingRestPolicy,
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

function sourceManagedResourceSnapshot(suffix, observedAt, overrides = {}) {
  const sourceRef = overrides.resourceSourceRef ?? `resource-source.g05a.${suffix}`;
  const core = {
    schemaVersion: 'vexlife.intent-resource-snapshot/v1',
    snapshotRef: overrides.snapshotRef ?? `resource-snapshot.g05a.${suffix}`,
    generation: overrides.generation ?? 1,
    sourceRef,
    sourceHash: overrides.resourceSourceHash ?? semanticHash(`source-managed:${sourceRef}`),
    formationRef: overrides.resourceFormationRef ?? 'formation.g05a.proof-resource-snapshot',
    evidenceClass: 'LIVE_RUNTIME_CURRENT',
    cpuLoadPct: overrides.cpuLoadPct ?? 10,
    cpuConcurrencyLimit: overrides.cpuConcurrencyLimit ?? 4,
    cpuActiveCount: overrides.cpuActiveCount ?? 0,
    ramAvailableMb: overrides.ramAvailableMb ?? 8192,
    ramReservedMb: overrides.ramReservedMb ?? 512,
    gpuAvailable: overrides.gpuAvailable ?? false,
    vramAvailableMb: overrides.vramAvailableMb ?? 0,
    vramReservedMb: overrides.vramReservedMb ?? 0,
    modelResident: overrides.modelResident ?? false,
    activeModelTurn: overrides.activeModelTurn ?? false,
    activeHeavyTool: overrides.activeHeavyTool ?? false,
    interactiveWaitState: overrides.interactiveWaitState ?? 'IDLE',
    backgroundWorkAdmission: overrides.backgroundWorkAdmission ?? 'ADMITTED',
    thermalPowerState: overrides.thermalPowerState ?? 'NOMINAL',
    currentness: 'CURRENT',
    formedAt: overrides.resourceFormedAt ?? new Date(Date.parse(observedAt) - 1000).toISOString(),
    observedAt,
    expiresAt: overrides.resourceExpiresAt ?? new Date(Date.parse(observedAt) + 60000).toISOString()
  };
  const candidate = { ...core };
  candidate.semanticFingerprint = semanticHash(candidate);
  return candidate;
}

function admissionEvidence(fixture, suffix, overrides = {}) {
  const observedAt = overrides.observedAt ?? '2026-08-08T04:30:00.000Z';
  const supervisorRef = overrides.supervisorRef ?? `supervisor.g05a.${suffix}`;
  const instanceRef = overrides.instanceRef ?? `instance.g05a.${suffix}`;
  const standing = loadStandingRestPolicy(fixture.ids);
  const sourceFrontier = overrides.admissionSourceFrontier ?? observeScheduledSourceFrontier(fixture.ids);
  return formScheduledAutonomyAdmissionEvidence({
    ...fixture.ids,
    supervisorRef,
    supervisorInstanceRef: instanceRef,
    standingPolicyRef: standing.policy.policyRef,
    standingPolicySha256: standing.policy.policySha256,
    standingPolicyHeadSha256: standing.head.policyHeadSha256,
    standingRestAuthorityRef: standing.policy.standingRestAuthorityRef,
    observedAt,
    sourceFrontier,
    resourceSnapshot: overrides.resourceSnapshot ?? sourceManagedResourceSnapshot(suffix, observedAt, overrides)
  });
}

function tickInput(fixture, suffix, overrides = {}) {
  const observedAt = overrides.observedAt ?? '2026-08-08T04:30:00.000Z';
  const supervisorRef = overrides.supervisorRef ?? `supervisor.g05a.${suffix}`;
  const instanceRef = overrides.instanceRef ?? `instance.g05a.${suffix}`;
  return {
    ...fixture.ids,
    observedAt,
    supervisorRef,
    instanceRef,
    modelWorkerRef: overrides.modelWorkerRef ?? `worker.g05a.${suffix}`,
    dreamWriterInstanceRef: overrides.dreamWriterInstanceRef ?? `dream-writer.g05a.${suffix}`,
    expectedPolicyHeadSha256: overrides.expectedPolicyHeadSha256,
    supervisorAdmissionEvidence: Object.prototype.hasOwnProperty.call(overrides, 'supervisorAdmissionEvidence')
      ? overrides.supervisorAdmissionEvidence
      : admissionEvidence(fixture, suffix, { ...overrides, observedAt, supervisorRef, instanceRef }),
    expectedSourceFrontier: overrides.expectedSourceFrontier,
    optionalLearningPlan: overrides.optionalLearningPlan,
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


function g04OptionalPlan(fixture, suffix, derivativeDisposition = 'PERMITTED') {
  const score = loadScoreContextState(fixture.ids);
  const active = score.statements.find((item) => item.current === true && item.acceptedForContinuity === true);
  if (!active || !Array.isArray(active.sourceBindings) || active.sourceBindings.length < 2) throw new Error('G05A optional-learning fixture lacks exact active Score support');
  const patternRef = `pattern.g05a.${suffix}`;
  const patternClass = 'SOURCE_GROUNDED_REASONING_HABIT';
  const participants = [fixture.ids.companionLineageRef, 'person.test'];
  const common = { lineageRef: fixture.ids.companionLineageRef, patternRef, patternClass, participants };
  const consentReceipts = [
    formSyntheticStageAConsentReceipt({ ...common, participantRef: fixture.ids.companionLineageRef, consentClass: 'LINEAGE_PARTICIPATION', disposition: 'PERMITTED' }),
    formSyntheticStageAConsentReceipt({ ...common, participantRef: 'person.test', consentClass: 'DATA_SUBJECT_DERIVATIVE_USE', disposition: derivativeDisposition })
  ];
  return {
    patternRef,
    patternClass,
    generalizedPattern: `Source-grounded correction discipline ${suffix}`,
    supportStatementRefs: [active.statementRef],
    supportSourceEventHashes: active.sourceBindings.map((binding) => binding.eventHash),
    behaviorDimensions: ['SOURCE_BEFORE_ASSERTION'],
    participantRefs: participants,
    consentReceipts,
    baseModelProfileRef: 'model.g01.bounded',
    formedAt: '2026-08-08T04:30:00.000Z'
  };
}

function readdressG05AReceipt(value) {
  const core = structuredClone(value);
  delete core.dailyAutonomyReceiptRef;
  delete core.dailyAutonomyReceiptSha256;
  const ref = `g05a-daily-receipt.${semanticHash(core).slice(0, 32)}`;
  const withRef = { ...core, dailyAutonomyReceiptRef: ref };
  return { ...withRef, dailyAutonomyReceiptSha256: semanticHash(withRef) };
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
  const interactive = await runScheduledDailyAutonomyTick(tickInput(main, 'interactive', { interactiveWaitState: 'WAITING' }));
  const resourceUnknown = await runScheduledDailyAutonomyTick(tickInput(main, 'resource-unknown', { backgroundWorkAdmission: 'HELD', resourceSourceRef: 'resource-source.g05a.held' }));

  const staleFrontier = observeScheduledSourceFrontier(main.ids);
  const staleRejected = await expectCode(
    () => runScheduledDailyAutonomyTick(tickInput(main, 'stale', { expectedSourceFrontier: { ...staleFrontier, scoreHeadSha256: '0'.repeat(64) } })),
    ['G05A_SOURCE_STALE']
  );

  const rawAuthorityFixture = freshFixture('raw-authority');
  commitStandingRestPolicy(policyInput(rawAuthorityFixture, 'raw-authority'));
  const rawAuthorityRejected = await expectCode(
    () => runScheduledDailyAutonomyTick({
      ...tickInput(rawAuthorityFixture, 'raw-authority', { supervisorAdmissionEvidence: null }),
      interactivePending: false,
      resourceEvidence: { state: 'SUFFICIENT' }
    }),
    ['G05A_ADMISSION_EVIDENCE_INVALID']
  );

  const staleWakeFixture = freshFixture('stale-wake');
  commitDailyMemoryDream({
    ...staleWakeFixture.ids,
    instanceRef: 'instance.g05a.stale-wake-dream',
    restInvocationAuthorityRef: 'authority.manual.g05a.stale-wake',
    dayRef: 'day.g05a.prior',
    dayIndex: 0,
    calendarDateRef: '2026-08-06',
    timeZoneRef: 'America/Los_Angeles',
    observedAt: '2026-08-07T04:30:00.000Z',
    expectedConversationHeadSha256: staleWakeFixture.g01.head.conversationHeadSha256,
    expectedScoreHeadSha256: staleWakeFixture.score.head.scoreHeadSha256
  });
  commitStandingRestPolicy(policyInput(staleWakeFixture, 'stale-wake'));
  const exactWakeFrontier = observeScheduledSourceFrontier(staleWakeFixture.ids);
  const staleWakeRejected = await expectCode(
    () => runScheduledDailyAutonomyTick(tickInput(staleWakeFixture, 'stale-wake', {
      expectedSourceFrontier: { ...exactWakeFrontier, wakeReceiptSha256: '0'.repeat(64) }
    })),
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
    optionalLearningPlan: g04OptionalPlan(rejectedFixture, 'rejected', 'DENIED')
  }));

  const failedFixture = freshFixture('failed');
  commitStandingRestPolicy(policyInput(failedFixture, 'failed', { optionalLearningPolicy: 'EVALUATE_AFTER_WAKE' }));
  const failedPlan = g04OptionalPlan(failedFixture, 'failed');
  failedPlan.patternClass = 'INVALID_PATTERN_CLASS';
  const failed = await runScheduledDailyAutonomyTick(tickInput(failedFixture, 'failed', { optionalLearningPlan: failedPlan }));

  const crashFixture = freshFixture('crash');
  commitStandingRestPolicy(policyInput(crashFixture, 'crash'));
  const crashInputFile = path.join(path.dirname(crashFixture.ids.home), 'g05a-crash-child-input.json');
  writeJson(crashInputFile, tickInput(crashFixture, 'crash-child', { faults: { terminateProcessAfterWakeBeforeReceipt: true } }));
  const crashChild = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'crash-child', crashInputFile], { cwd: ROOT, encoding: 'utf8', env: process.env, timeout: 120000 });
  const crashLock = path.join(crashFixture.ids.home, 'scheduled-daily-autonomy', crashFixture.ids.companionLineageRef, crashFixture.ids.threadRef, 'supervisor.lock');
  const crash = { rejected: crashChild.status === 86, code: crashChild.status === 86 ? 'PROCESS_EXIT_AFTER_WAKE' : `EXIT_${crashChild.status}` };
  const crashDreamAfterFault = loadDailyMemoryDreamState(crashFixture.ids);
  const abandonedLockPersisted = fs.existsSync(crashLock);
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

  const policyCurrentnessFixture = freshFixture('policy-currentness');
  const policyA = commitStandingRestPolicy(policyInput(policyCurrentnessFixture, 'policy-a'));
  commitStandingRestPolicy(policyInput(policyCurrentnessFixture, 'policy-b', { standingRestAuthorityRef: 'authority.g05a.policy.changed', formedAt: '2026-08-08T03:32:00.000Z' }));
  const stalePolicyRejected = await expectCode(
    () => runScheduledDailyAutonomyTick(tickInput(policyCurrentnessFixture, 'policy-stale', { expectedPolicyHeadSha256: policyA.head.policyHeadSha256 })),
    ['G05A_POLICY_NOT_CURRENT']
  );

  const callbackFixture = freshFixture('callback-forbidden');
  commitStandingRestPolicy(policyInput(callbackFixture, 'callback-forbidden', { optionalLearningPolicy: 'EVALUATE_AFTER_WAKE' }));
  const arbitraryCallbackRejected = await expectCode(
    () => runScheduledDailyAutonomyTick(tickInput(callbackFixture, 'callback-forbidden', { optionalLearningCallback: async () => ({ disposition: 'REJECTED' }) })),
    ['G05A_HELD_EFFECT_VIOLATION']
  );

  const orphan = readdressG05AReceipt({ ...completed.receipt, supervisorInstanceRef: 'instance.g05a.orphan' });
  const orphanFile = path.join(main.ids.home, 'scheduled-daily-autonomy', main.ids.companionLineageRef, main.ids.threadRef, 'receipts', `${orphan.dailyAutonomyReceiptSha256}.json`);
  writeJson(orphanFile, orphan);
  const orphanRejected = await expectCode(
    () => Promise.resolve(sourceDescentScheduledDailyAutonomy(main.ids, orphan.dailyAutonomyReceiptSha256)),
    ['G05A_RECEIPT_CORRUPT']
  );

  const check0 = DAILY_MEMORY_DREAM_CONTRACT === 'contract.multivex.g03.daily-memory-only-dream/v1' && EVALUATED_RHYTHM_MODE === 'FAITHFUL_SIMULATED_RHYTHM_CANDIDATE';
  const check1 = invalidConsent.rejected && mainPolicy.policy.consentState === 'PERMITTED';
  const check2 = outside.state === 'OUTSIDE_REST_WINDOW' && outside.noEffect === true;
  const check3 = concurrentRejected.rejected && collapsedSupervisorRejected.rejected;
  const check4 = interactive.state === 'YIELDED_INTERACTIVE' && resourceUnknown.state === 'YIELDED_RESOURCE' && rawAuthorityRejected.rejected;
  const check5 = completed.state === 'COMPLETED' && completed.wakeCommitted === true && completed.receipt.g03WakeReceiptSha256 && completed.receipt.g03DreamHeadSha256;
  const check6 = staleRejected.rejected && staleWakeRejected.rejected;
  const check7 = duplicate.state === 'DUPLICATE_SUPPRESSED' && duplicate.duplicateSuppressed === true && duplicate.receipt.dailyAutonomyReceiptSha256 === completed.receipt.dailyAutonomyReceiptSha256;
  const check8 = completed.receipt.optionalLearningDisposition === 'ABSENT' && deferred.receipt.optionalLearningDisposition === 'DEFERRED' && rejected.receipt.optionalLearningDisposition === 'REJECTED';
  const check9 = failed.receipt.optionalLearningDisposition === 'FAILED' && failed.receipt.optionalLearningFailureCode === 'RHYTHM_PATTERN_INVALID' && failed.receipt.wakeCommitted === true && arbitraryCallbackRejected.rejected;
  const check10 = crash.rejected && abandonedLockPersisted && recovery.resumedAfterWake === true && recovery.recoveredAbandonedSupervisor === true && crashDreamAfterFault.head.dailyDreamHeadSha256 === crashDreamAfterRecovery.head.dailyDreamHeadSha256 && driftCrash.rejected && driftRejected.rejected && stalePolicyRejected.rejected;
  const check11 = projection.wakeCommitted === true && descent.dailyAutonomyReceiptSha256 === completed.receipt.dailyAutonomyReceiptSha256 && descent.g03WakeReceiptSha256 === completed.receipt.g03WakeReceiptSha256 && descent.noRawConversationContent === true && orphanRejected.rejected;
  const heldKeys = ['synchronizationPerformed','trainingPerformed','modelWeightsChanged','adapterChanged','rhythmActivationPerformed','powerControlPerformed','nativeWindowsServiceInstalled','publicationPerformed'];
  const check12 = heldKeys.every((key) => completed.receipt[key] === false && projection[key] === false) && failed.receipt.g03WakeReceiptSha256 === loadDailyMemoryDreamState(failedFixture.ids).head.wakeReceiptSha256;

  const checks = {
    'G05A-0': result(check0, { predecessorContractsBound: true, laterAuthorityGranted: false }),
    'G05A-1': result(check1, { positiveStandingAuthorityRequired: true }),
    'G05A-2': result(check2, { outsideWindowNoEffect: true }),
    'G05A-3': result(check3, { independentSupervisor: true, singleWriter: true }),
    'G05A-4': result(check4, { interactiveYield: true, unknownResourceYield: true, rawCallerAuthorityRejected: rawAuthorityRejected.rejected, exactAdmissionEvidenceRequired: true }),
    'G05A-5': result(check5, { automaticDreamAdmission: true, wakeCommitted: completed.wakeCommitted }),
    'G05A-6': result(check6, { staleFrontierRejected: staleRejected.rejected, staleWakeIdentityRejected: staleWakeRejected.rejected, allAdvertisedFrontierFieldsValidated: true }),
    'G05A-7': result(check7, { duplicateDaySuppressed: duplicate.duplicateSuppressed }),
    'G05A-8': result(check8, { dispositions: [completed.receipt.optionalLearningDisposition, deferred.receipt.optionalLearningDisposition, rejected.receipt.optionalLearningDisposition] }),
    'G05A-9': result(check9, { optionalFailureCode: failed.receipt.optionalLearningFailureCode, wakeCommitted: failed.receipt.wakeCommitted, arbitraryCallbackRejected: arbitraryCallbackRejected.rejected }),
    'G05A-10': result(check10, { realProcessExitObserved: crash.rejected, abandonedLockPersisted, recoveredAbandonedSupervisor: recovery.recoveredAbandonedSupervisor, recoveryPreservedDreamHead: crashDreamAfterFault.head.dailyDreamHeadSha256 === crashDreamAfterRecovery.head.dailyDreamHeadSha256, driftRejected: driftRejected.rejected, stalePolicyRejected: stalePolicyRejected.rejected }),
    'G05A-11': result(check11, { projectionState: projection.state, sourceDescent: true, orphanReceiptRejected: orphanRejected.rejected }),
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
    supervisorAdmissionEvidenceRequired: check4,
    sourceManagedResourceSnapshotRequired: check4,
    allAdvertisedFrontierFieldsValidated: check6,
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
    supervisorAdmissionEvidenceRef: completed.receipt.supervisorAdmissionEvidenceRef,
    supervisorAdmissionEvidenceSha256: completed.receipt.supervisorAdmissionEvidenceSha256,
    resourceSnapshotRef: completed.receipt.resourceSnapshotRef,
    resourceSnapshotFingerprint: completed.receipt.resourceSnapshotFingerprint,
    resourceAdmissionFingerprint: completed.receipt.resourceAdmissionFingerprint,
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
  if (process.argv[2] === 'crash-child') {
    const inputFile = process.argv[3];
    if (!inputFile) { process.stderr.write('crash-child requires an input file\n'); process.exit(2); }
    const input = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    await runScheduledDailyAutonomyTick(input);
    process.exit(0);
  }
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
