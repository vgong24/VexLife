#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDailyMemoryDreamFixture } from './daily-memory-dream.mjs';
import { commitDailyMemoryDream, loadDailyMemoryDreamState } from '../src/core/daily-memory-dream.mjs';
import { semanticHash } from '../src/core/utils.mjs';
import {
  SCHEDULED_DAILY_AUTONOMY_MODE,
  buildScheduledStandingScopeForPolicy,
  commitStandingRestPolicy,
  formStandingRestPolicy,
  loadStandingRestPolicy,
  observeScheduledSourceFrontier,
  projectScheduledDailyAutonomy,
  runScheduledDailyAutonomyTick
} from '../src/core/scheduled-daily-autonomy.mjs';
import * as g05aModule from '../src/core/scheduled-daily-autonomy.mjs';
import { G05_LIVE_RUNTIME_SOURCE_REF, G05_LIVE_RUNTIME_SOURCE_HASH } from '../src/core/g05-runtime-authority-substrate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHA256 = /^[0-9a-f]{64}$/u;
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function zonedParts(date, timeZone) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).filter((item) => item.type !== 'literal').map((item) => [item.type, item.value]));
}
function localMinute(date = new Date(), timeZone = 'UTC') { const p = zonedParts(date, timeZone); return Number(p.hour) * 60 + Number(p.minute); }
function windowAround(date = new Date(), timeZone = 'UTC') { const m = localMinute(date, timeZone); return { start: (m + 1437) % 1440, end: (m + 3) % 1440 }; }
function calendarInZone(date, timeZone) { const p = zonedParts(date, timeZone); return `${p.year}-${p.month}-${p.day}`; }
function chooseSafeZone(date) { const zones = ['UTC','America/Los_Angeles','Pacific/Honolulu','Asia/Tokyo','Europe/London']; return zones.find((zone) => { const m = localMinute(date, zone); return m >= 120 && m <= 1320; }) || 'UTC'; }
function expectCode(error, code) { return error?.code === code; }

function policyInput(fixture, suffix, overrides = {}) {
  const now = overrides.now ?? new Date();
  const timeZoneRef = overrides.timeZoneRef ?? 'UTC';
  const window = overrides.window ?? windowAround(now, timeZoneRef);
  return {
    ...fixture.ids,
    humanSubjectRef: overrides.humanSubjectRef ?? `human.synthetic.g05a.${suffix}`,
    timeZoneRef,
    restWindowStartLocalMinute: overrides.restWindowStartLocalMinute ?? window.start,
    restWindowEndLocalMinute: overrides.restWindowEndLocalMinute ?? window.end,
    optionalLearningPolicy: overrides.optionalLearningPolicy ?? 'ABSENT',
    formedAt: overrides.formedAt ?? new Date(now.getTime() - 60_000).toISOString()
  };
}
function safetyRoot(home, scope) { return path.join(home, 'semantic-authority', 'daily-dream-standing-rest', scope.companionLineageRef, scope.threadRef); }
function seedSyntheticSafetyOwner(home, scope, observedAt) {
  const formedAt = new Date(Date.parse(observedAt) - 60_000).toISOString();
  const consentPreimage = {
    schemaVersion: 'vextreme.daily-dream-standing-consent-disposition/v1',
    humanSubjectRef: scope.humanSubjectRef, homeRef: scope.homeRef, deviceRef: scope.deviceRef,
    companionLineageRef: scope.companionLineageRef, threadRef: scope.threadRef, purposeRef: scope.purposeRef,
    selectedMode: scope.selectedMode, privacyClass: scope.privacyClass,
    permittedUseRefs: [...scope.permittedUseRefs], prohibitedUseRefs: [...scope.prohibitedUseRefs],
    timeZoneRef: scope.timeZoneRef, restWindowStartLocalMinute: scope.restWindowStartLocalMinute,
    restWindowEndLocalMinute: scope.restWindowEndLocalMinute, exactlyOnceCalendarDay: true,
    interactiveYieldRequired: true, localOnly: true, disposition: 'PERMITTED', formedAt, expiresAt: null,
    issuerRef: 'owner.vex-safety.synthetic.g05a', issuerClass: 'SYNTHETIC_TEST_OWNER',
    sourceEvidenceRefs: ['github.issue.vextreme-sdk.350.comment.5225148306']
  };
  const standingConsentRef = `daily-dream-standing-consent.${semanticHash(consentPreimage).slice(0, 32)}`;
  const consent = { ...consentPreimage, standingConsentRef, standingConsentSha256: semanticHash({ ...consentPreimage, standingConsentRef }) };
  const scopeFingerprint = semanticHash(scope);
  const bindingPreimage = {
    schemaVersion: 'vextreme.daily-dream-standing-authority-binding/v1', standingConsentRef: consent.standingConsentRef,
    standingConsentSha256: consent.standingConsentSha256, subjectRef: consent.humanSubjectRef, purposeRef: consent.purposeRef,
    scopeFingerprint, disposition: consent.disposition, formedAt: consent.formedAt, expiresAt: consent.expiresAt
  };
  const authorityRef = `daily-dream-standing-authority.${semanticHash(bindingPreimage).slice(0, 32)}`;
  const binding = { ...bindingPreimage, authorityRef, authoritySha256: semanticHash({ ...bindingPreimage, authorityRef }) };
  const member = {
    standingConsentRef: consent.standingConsentRef, standingConsentSha256: consent.standingConsentSha256,
    authorityRef: binding.authorityRef, authoritySha256: binding.authoritySha256,
    humanSubjectRef: consent.humanSubjectRef, purposeRef: consent.purposeRef, scopeFingerprint
  };
  const headPreimage = {
    schemaVersion: 'vextreme.daily-dream-standing-consent-authority-head/v1',
    contractRef: 'contract.multivex.safety.g05.scheduled-daily-memory-dream-standing-rest/v1',
    sourceLineageRef: scope.companionLineageRef, sourceThreadRef: scope.threadRef, generation: 0,
    priorAuthorityHeadSha256: null, currentStandingConsentBindings: [member], formedAt,
    ownerDispositionRef: 'owner-disposition.vex-safety.synthetic.g05a'
  };
  const authorityHeadRef = `daily-dream-standing-authority-head.${semanticHash(headPreimage).slice(0, 32)}`;
  const head = { ...headPreimage, authorityHeadRef, authorityHeadSha256: semanticHash({ ...headPreimage, authorityHeadRef }) };
  const root = safetyRoot(home, scope);
  writeJson(path.join(root, 'consents', `${consent.standingConsentSha256}.json`), consent);
  writeJson(path.join(root, 'authority-bindings', `${binding.authoritySha256}.json`), binding);
  writeJson(path.join(root, 'heads', `${head.authorityHeadSha256}.json`), head);
  writeJson(path.join(root, 'head.json'), head);
  return { consent, binding, head, scopeFingerprint };
}
function canonicalProofRoot() {
  const requested = path.resolve(process.env.VEXLIFE_G05A_PROOF_HOME || fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-g05a-c3-proof-')));
  fs.mkdirSync(requested, { recursive: true });
  return fs.realpathSync.native(requested);
}
async function runProof() {
  if (process.platform !== 'win32') throw new Error('G05A authority-provenance proof requires Windows');
  const proofRoot = canonicalProofRoot();
  const fixture = createDailyMemoryDreamFixture('g05a-c3-main', path.join(proofRoot, 'main-home'));
  const now = new Date();
  const committed = commitStandingRestPolicy(policyInput(fixture, 'main', { now }));
  const scopeResult = buildScheduledStandingScopeForPolicy(committed.policy);
  const safety = seedSyntheticSafetyOwner(fixture.ids.home, scopeResult.scope, now.toISOString());
  const beforeDream = loadDailyMemoryDreamState(fixture.ids);

  let rawRejected = false;
  try {
    await runScheduledDailyAutonomyTick({ ...fixture.ids, supervisorRef: 'supervisor.g05a.raw', instanceRef: 'instance.g05a.raw', modelWorkerRef: 'worker.g05a.raw', dreamWriterInstanceRef: 'dream-writer.g05a.raw', observedAt: '1999-01-01T00:00:00.000Z' });
  } catch (error) { rawRejected = expectCode(error, 'G05A_ADMISSION_EVIDENCE_INVALID'); }

  const held = await runScheduledDailyAutonomyTick({ ...fixture.ids, supervisorRef: 'supervisor.g05a.main', instanceRef: 'instance.g05a.main', modelWorkerRef: 'worker.g05a.main', dreamWriterInstanceRef: 'dream-writer.g05a.main' });
  const afterDream = loadDailyMemoryDreamState(fixture.ids);
  const projection = projectScheduledDailyAutonomy(fixture.ids);

  const manual = createDailyMemoryDreamFixture('g05a-c3-manual', path.join(proofRoot, 'manual-home'));
  const manualZone = chooseSafeZone(now);
  const manualPolicy = commitStandingRestPolicy(policyInput(manual, 'manual', { now, timeZoneRef: manualZone }));
  const manualDate = calendarInZone(now, manualZone);
  commitDailyMemoryDream({
    ...manual.ids,
    instanceRef: 'dream-writer.g05a.manual', restInvocationAuthorityRef: `authority.g05a.rest.${manualPolicy.policy.policySha256.slice(0, 24)}`,
    dayRef: `day.g05a.manual.${manualDate.replaceAll('-', '')}`, dayIndex: 0, calendarDateRef: manualDate,
    timeZoneRef: manualZone, observedAt: now.toISOString(),
    expectedConversationHeadSha256: manual.g01.head.conversationHeadSha256,
    expectedScoreHeadSha256: manual.score.head.scoreHeadSha256,
    expectedDailyDreamHeadSha256: null
  });
  // Form an abandoned supervisor lease plus an orphan malformed admission file.
  // Recovery must ignore the orphan because no admission-head lineage commits it.
  const exited = spawnSync(process.execPath, ['-e', 'process.exit(0)'], { encoding: 'utf8' });
  const abandonedPid = exited.pid;
  const scheduledRoot = path.join(manual.ids.home, 'scheduled-daily-autonomy', manual.ids.companionLineageRef, manual.ids.threadRef);
  fs.mkdirSync(path.join(scheduledRoot, 'admissions'), { recursive: true });
  const leaseCore = {
    schemaVersion: 'vexlife.g05a.supervisor-writer/v2',
    companionLineageRef: manual.ids.companionLineageRef,
    threadRef: manual.ids.threadRef,
    supervisorRef: 'supervisor.g05a.manual',
    instanceRef: 'instance.g05a.manual',
    pid: abandonedPid,
    token: 'orphan-recovery-probe-token',
    formedAt: new Date(now.getTime() - 30_000).toISOString()
  };
  writeJson(path.join(scheduledRoot, 'supervisor.lock'), { ...leaseCore, leaseSha256: semanticHash(leaseCore) });
  writeJson(path.join(scheduledRoot, 'admissions', `${'f'.repeat(64)}.json`), { malformedOrphanAdmission: true });
  let manualLaunderingRejected = false;
  let orphanHistoricalAdmissionIgnored = false;
  try {
    await runScheduledDailyAutonomyTick({ ...manual.ids, supervisorRef: 'supervisor.g05a.manual', instanceRef: 'instance.g05a.manual', modelWorkerRef: 'worker.g05a.manual', dreamWriterInstanceRef: 'dream-writer.g05a.manual2' });
  } catch (error) {
    manualLaunderingRejected = expectCode(error, 'G05A_RECOVERY_POLICY_DRIFT');
    orphanHistoricalAdmissionIgnored = manualLaunderingRejected;
  }

  const optionalPolicy = formStandingRestPolicy(policyInput(fixture, 'optional', { now, optionalLearningPolicy: 'EVALUATE_AFTER_WAKE' }));
  const optionalScope = buildScheduledStandingScopeForPolicy(optionalPolicy);
  const coreSource = fs.readFileSync(path.join(ROOT, 'src', 'core', 'scheduled-daily-autonomy.mjs'), 'utf8');
  const finalBoundaryRevalidationPresent = coreSource.split('resolveCurrentG05ScheduledAdmission({').length - 1 >= 2 &&
    coreSource.includes('finalCurrentAdmission = await resolveCurrentG05ScheduledAdmission({') &&
    coreSource.includes('const committedAdmission = commitAdmission(identity, threadRef, admission)') &&
    coreSource.includes('function loadAdmissionHistory(identity, threadRef)') &&
    !coreSource.includes('readdirSync(paths.admissions)');
  const checks = {
    'G05A-0': SCHEDULED_DAILY_AUTONOMY_MODE === 'DETERMINISTIC_SCHEDULED_AUTONOMY_CORE' && 'formScheduledAutonomyAdmissionEvidence' in g05aModule === false ? 'PASS' : 'FAIL',
    'G05A-1': committed.policy.executionAuthority === 'NONE_CONFIGURATION_ONLY' && !('consentState' in committed.policy) && !('standingRestAuthorityRef' in committed.policy) ? 'PASS' : 'FAIL',
    'G05A-2': scopeResult.scope.permittedUseRefs.includes('use.vexlife.g05.schedule-one-g03-memory-only-dream-per-local-calendar-day') && optionalScope.scope.permittedUseRefs.includes('use.vexlife.g05.after-wake-g04-stage-a-simulated-inactive-evaluation') ? 'PASS' : 'FAIL',
    'G05A-3': committed.head.generation === 0 && Number.isSafeInteger(committed.head.generation) ? 'PASS' : 'FAIL',
    'G05A-4': rawRejected ? 'PASS' : 'FAIL',
    'G05A-5': held.state === 'HELD_RUNTIME_RESOURCE_OR_INTERACTIVE_STATE' && held.resourceAdmissionState === 'BLOCKED' ? 'PASS' : 'FAIL',
    'G05A-6': (beforeDream.head?.dailyDreamHeadSha256 ?? null) === (afterDream.head?.dailyDreamHeadSha256 ?? null) ? 'PASS' : 'FAIL',
    'G05A-7': manualLaunderingRejected && orphanHistoricalAdmissionIgnored && !fs.existsSync(path.join(scheduledRoot, 'admission-head.json')) ? 'PASS' : 'FAIL',
    'G05A-8': projection.livePositiveStandingConsentMaterializedByG05A === false ? 'PASS' : 'FAIL',
    'G05A-9': projection.synchronizationPerformed === false && projection.trainingPerformed === false && projection.modelWeightsChanged === false && projection.adapterChanged === false ? 'PASS' : 'FAIL',
    'G05A-10': projection.nativeWindowsServiceInstalled === false && projection.powerControlPerformed === false && projection.publicationPerformed === false ? 'PASS' : 'FAIL',
    'G05A-11': SHA256.test(safety.head.authorityHeadSha256) && scopeResult.standingScopeFingerprint === safety.scopeFingerprint ? 'PASS' : 'FAIL',
    'G05A-12': G05_LIVE_RUNTIME_SOURCE_REF === 'source.intent-scheduler.windows-g05-runtime-observer' && SHA256.test(G05_LIVE_RUNTIME_SOURCE_HASH) && finalBoundaryRevalidationPresent ? 'PASS' : 'FAIL'
  };
  const state = Object.values(checks).every((item) => item === 'PASS') ? 'PASS' : 'FAIL';
  const receipt = {
    schemaVersion: 'vexlife.g05a.scheduled-daily-autonomy-proof/v2', state,
    mode: 'HOSTED_WINDOWS_SOURCE_OWNED_AUTHORITY_AND_HELD_RUNTIME_PROOF',
    candidateHeadSha: process.env.VEXLIFE_CANDIDATE_HEAD_SHA || null, checks,
    policyConfigurationOnly: true, callerContextLiveAdmissionAccepted: false,
    sourceOwnedStandingAuthorityResolvedInSyntheticOwnerStore: true,
    syntheticSafetyOwnerStoreUsed: true, syntheticStandingAuthorityHeadSha256: safety.head.authorityHeadSha256,
    standingScopeFingerprint: scopeResult.standingScopeFingerprint,
    liveRuntimeSourceRef: G05_LIVE_RUNTIME_SOURCE_REF, liveRuntimeSourceHash: G05_LIVE_RUNTIME_SOURCE_HASH,
    schedulerGenerationSource: 'G05A_DURABLE_CURRENT_HEAD_SEQUENCE_PLUS_ONE',
    schedulerGenerationSeparateFromPolicyGeneration: true,
    resourceAdmissionState: held.resourceAdmissionState,
    currentRuntimeSupervisorState: 'FAIL_CLOSED_UNOBSERVED_NO_NATIVE_SUPERVISOR',
    livePositiveStandingConsentMaterializedByG05A: false,
    actualStandingConsentMaterialized: false,
    actualAutomaticDreamInvocationPerformed: false,
    syntheticManualG03LaunderingProbePerformed: true,
    manualPolicyOnlyG03WakeAcceptedAsScheduled: false,
    orphanHistoricalAdmissionIgnored,
    committedAdmissionHeadRequired: true,
    finalG05sEffectBoundaryRevalidationRequired: true,
    finalG05sEffectBoundaryRevalidationStructuralProof: finalBoundaryRevalidationPresent,
    nativeSupervisorInstalled: false, realTrainingPerformed: false, modelOrAdapterMutationPerformed: false,
    rhythmActivationPerformed: false, synchronizationPerformed: false, powerControlPerformed: false,
    cloudUploadPerformed: false, publicationPerformed: false
  };
  const output = process.env.VEXLIFE_G05A_PROOF_RECEIPT ? path.resolve(process.env.VEXLIFE_G05A_PROOF_RECEIPT) : path.join(ROOT, 'generated', 'health', 'g05a-scheduled-daily-autonomy-windows-proof.json');
  writeJson(output, receipt);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (state !== 'PASS') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if ((process.argv[2] || 'proof') !== 'proof') throw new Error('usage: node scripts/scheduled-daily-autonomy.mjs proof');
  await runProof();
}
