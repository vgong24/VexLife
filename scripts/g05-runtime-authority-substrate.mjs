#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import * as g05sModule from '../src/core/g05-runtime-authority-substrate.mjs';

import {
  G05_LIVE_RUNTIME_AUTHORITY_REF,
  G05_LIVE_RUNTIME_EVIDENCE_CLASS,
  G05_LIVE_RUNTIME_SOURCE_DESCRIPTOR,
  G05_LIVE_RUNTIME_SOURCE_HASH,
  G05_LIVE_RUNTIME_SOURCE_REF,
  G05_LIVE_RUNTIME_WORKER_REF,
  G05_MEMORY_ONLY_MODE,
  G05_STANDING_AUTHORITY_CONTRACT_REF,
  G05_STANDING_PURPOSE_REF,
  buildG05StandingScopeFingerprint,
  observeWindowsG05Runtime,
  resolveCurrentG05ScheduledAdmission,
  resolveCurrentG05StandingAuthority,
  validateG05LiveRuntimeRegistry,
  validateHistoricalG05ScheduledAdmissionProvenance
} from '../src/core/g05-runtime-authority-substrate.mjs';
import { createResourceSnapshot } from '../src/core/resource-admission.mjs';
import { createSchedulerRuntimeTrustSnapshot } from '../src/core/scheduler-runtime-trust.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const mode = process.argv[2] || '';
if (mode !== 'proof') {
  process.stderr.write('usage: node scripts/g05-runtime-authority-substrate.mjs proof\n');
  process.exit(2);
}
if (process.platform !== 'win32') {
  process.stderr.write('G05S hosted proof requires Windows\n');
  process.exit(3);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function assert(value, label) {
  if (!value) throw new Error(`proof assertion failed: ${label}`);
}
function expectThrow(operation, pattern, label) {
  let error = null;
  try { operation(); } catch (caught) { error = caught; }
  assert(error, `${label} throws`);
  if (pattern) assert(pattern.test(String(error.message)), `${label} message`);
  return error;
}
async function expectThrowAsync(operation, pattern, label) {
  let error = null;
  try { await operation(); } catch (caught) { error = caught; }
  assert(error, `${label} throws`);
  if (pattern) assert(pattern.test(String(error.message)), `${label} message`);
  return error;
}

function buildConsent(scope, { disposition = 'PERMITTED', formedAt = '2026-08-08T00:00:00.000Z', expiresAt = null } = {}) {
  const preimage = {
    schemaVersion: 'vextreme.daily-dream-standing-consent-disposition/v1',
    humanSubjectRef: scope.humanSubjectRef,
    homeRef: scope.homeRef,
    deviceRef: scope.deviceRef,
    companionLineageRef: scope.companionLineageRef,
    threadRef: scope.threadRef,
    purposeRef: scope.purposeRef,
    selectedMode: scope.selectedMode,
    privacyClass: scope.privacyClass,
    permittedUseRefs: [...scope.permittedUseRefs],
    prohibitedUseRefs: [...scope.prohibitedUseRefs],
    timeZoneRef: scope.timeZoneRef,
    restWindowStartLocalMinute: scope.restWindowStartLocalMinute,
    restWindowEndLocalMinute: scope.restWindowEndLocalMinute,
    exactlyOnceCalendarDay: true,
    interactiveYieldRequired: true,
    localOnly: true,
    disposition,
    formedAt,
    expiresAt,
    issuerRef: 'owner.vex-safety.g05-standing-rest.synthetic-proof',
    issuerClass: 'SYNTHETIC_VEX_SAFETY_OWNER_FIXTURE',
    sourceEvidenceRefs: [
      'github.issue.vextreme-sdk.226.comment.5225146308',
      'github.issue.vextreme-sdk.350.comment.5225148306'
    ].sort()
  };
  const standingConsentRef = `daily-dream-standing-consent.${semanticHash(preimage).slice(0, 32)}`;
  const standingConsentSha256 = semanticHash({ ...preimage, standingConsentRef });
  return { ...preimage, standingConsentRef, standingConsentSha256 };
}

function buildBinding(consent, scopeFingerprint) {
  const preimage = {
    schemaVersion: 'vextreme.daily-dream-standing-authority-binding/v1',
    standingConsentRef: consent.standingConsentRef,
    standingConsentSha256: consent.standingConsentSha256,
    subjectRef: consent.humanSubjectRef,
    purposeRef: consent.purposeRef,
    scopeFingerprint,
    disposition: consent.disposition,
    formedAt: consent.formedAt,
    expiresAt: consent.expiresAt
  };
  const authorityRef = `daily-dream-standing-authority.${semanticHash(preimage).slice(0, 32)}`;
  const authoritySha256 = semanticHash({ ...preimage, authorityRef });
  return { ...preimage, authorityRef, authoritySha256 };
}

function currentBinding(consent, binding, scopeFingerprint) {
  return {
    standingConsentRef: consent.standingConsentRef,
    standingConsentSha256: consent.standingConsentSha256,
    authorityRef: binding.authorityRef,
    authoritySha256: binding.authoritySha256,
    humanSubjectRef: consent.humanSubjectRef,
    purposeRef: consent.purposeRef,
    scopeFingerprint
  };
}
function bindingKey(item) {
  return semanticHash({ humanSubjectRef: item.humanSubjectRef, purposeRef: item.purposeRef, scopeFingerprint: item.scopeFingerprint });
}
function buildHead({ lineageRef, threadRef, generation = 0, priorAuthorityHeadSha256 = null, currentBindings, formedAt = '2026-08-08T00:00:00.000Z' }) {
  const currentStandingConsentBindings = [...currentBindings].sort((a, b) => bindingKey(a).localeCompare(bindingKey(b)) || a.standingConsentSha256.localeCompare(b.standingConsentSha256));
  const preimage = {
    schemaVersion: 'vextreme.daily-dream-standing-consent-authority-head/v1',
    contractRef: G05_STANDING_AUTHORITY_CONTRACT_REF,
    sourceLineageRef: lineageRef,
    sourceThreadRef: threadRef,
    generation,
    priorAuthorityHeadSha256,
    currentStandingConsentBindings,
    formedAt,
    ownerDispositionRef: 'owner-disposition.vex-safety.g05-standing-rest.synthetic-proof'
  };
  const authorityHeadRef = `daily-dream-standing-authority-head.${semanticHash(preimage).slice(0, 32)}`;
  const authorityHeadSha256 = semanticHash({ ...preimage, authorityHeadRef });
  return { ...preimage, authorityHeadRef, authorityHeadSha256 };
}

function seedSyntheticOwnerStore(home, scope, { disposition = 'PERMITTED', duplicate = false, formedAt = '2026-08-08T00:00:00.000Z', expiresAt = null, headFormedAt = formedAt } = {}) {
  const scopeFingerprint = buildG05StandingScopeFingerprint(scope);
  const consent = buildConsent(scope, { disposition, formedAt, expiresAt });
  const binding = buildBinding(consent, scopeFingerprint);
  const member = currentBinding(consent, binding, scopeFingerprint);
  const bindings = duplicate ? [member, { ...member }] : [member];
  const head = buildHead({ lineageRef: scope.companionLineageRef, threadRef: scope.threadRef, currentBindings: bindings, formedAt: headFormedAt });
  const root = path.join(home, 'semantic-authority', 'daily-dream-standing-rest', scope.companionLineageRef, scope.threadRef);
  writeJson(path.join(root, 'consents', `${consent.standingConsentSha256}.json`), consent);
  writeJson(path.join(root, 'authority-bindings', `${binding.authoritySha256}.json`), binding);
  writeJson(path.join(root, 'heads', `${head.authorityHeadSha256}.json`), head);
  writeJson(path.join(root, 'head.json'), head);
  return { consent, binding, head, scopeFingerprint };
}

function loadRegistry() {
  return JSON.parse(fs.readFileSync(path.resolve('blueprint', 'intent-scheduler-registry.json'), 'utf8'));
}

const proofRootRequested = path.resolve(process.env.VEXLIFE_G05S_PROOF_HOME || fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-g05s-proof-')));
fs.mkdirSync(proofRootRequested, { recursive: true });
const proofRoot = fs.realpathSync.native(proofRootRequested);
const syntheticHomeRequested = path.join(proofRoot, 'synthetic-home');
fs.mkdirSync(syntheticHomeRequested, { recursive: true });
const syntheticHome = fs.realpathSync.native(syntheticHomeRequested);

const scope = {
  schemaVersion: 'vextreme.daily-dream-standing-consent-scope/v1',
  humanSubjectRef: 'human.victor.synthetic-proof',
  homeRef: 'home.vexlife.synthetic-proof',
  deviceRef: 'device.windows.synthetic-proof',
  companionLineageRef: 'lineage.vex.synthetic-proof',
  threadRef: 'thread.vex.synthetic-proof',
  purposeRef: G05_STANDING_PURPOSE_REF,
  selectedMode: G05_MEMORY_ONLY_MODE,
  privacyClass: 'DEVICE_PRIVATE',
  permittedUseRefs: [
    'use.vexlife.g05.form-bounded-supervisor-admission-and-wake-receipts',
    'use.vexlife.g05.schedule-one-g03-memory-only-dream-per-local-calendar-day'
  ].sort(),
  prohibitedUseRefs: [
    'use.vexlife.g05.cross-device-sync',
    'use.vexlife.g05.real-training',
    'use.vexlife.g05.rhythm-activation'
  ].sort(),
  timeZoneRef: 'America/Los_Angeles',
  restWindowStartLocalMinute: 60,
  restWindowEndLocalMinute: 300,
  exactlyOnceCalendarDay: true,
  interactiveYieldRequired: true,
  localOnly: true
};

const seeded = seedSyntheticOwnerStore(syntheticHome, scope);
const registry = loadRegistry();
const source = registry.runtimeSourceIdentities.find((item) => item.sourceRef === G05_LIVE_RUNTIME_SOURCE_REF);
const worker = registry.workerIdentities.find((item) => item.workerRef === G05_LIVE_RUNTIME_WORKER_REF);
assert(source?.sourceHash === G05_LIVE_RUNTIME_SOURCE_HASH, 'registered live source hash is exact');
assert(semanticHash(source.sourceDescriptor) === G05_LIVE_RUNTIME_SOURCE_HASH, 'registered source descriptor recomputes');
assert(semanticHash(G05_LIVE_RUNTIME_SOURCE_DESCRIPTOR) === G05_LIVE_RUNTIME_SOURCE_HASH, 'module source descriptor recomputes');
assert(source.evidenceClass === G05_LIVE_RUNTIME_EVIDENCE_CLASS && source.liveRuntime === true, 'live source evidence class');
assert(source.authorityRef === G05_LIVE_RUNTIME_AUTHORITY_REF, 'live source authority');
assert(worker?.workerKind === 'NON_MODEL_RUNTIME_SUPERVISOR' && worker.evidenceClasses.includes(G05_LIVE_RUNTIME_EVIDENCE_CLASS), 'non-model live worker');

const runtime = await observeWindowsG05Runtime({
  schedulerGeneration: 7,
  observedAt: '1999-01-01T00:00:00.000Z',
  sourceRef: 'source.fake',
  authorityRef: 'authority.fake',
  workerRef: 'worker.fake',
  cpuLoadPct: 0,
  backgroundWorkAdmission: 'ADMITTED'
});
assert(runtime.observedAt !== '1999-01-01T00:00:00.000Z', 'live observer owns observedAt');
assert(runtime.sourceRef === G05_LIVE_RUNTIME_SOURCE_REF && runtime.authorityRef === G05_LIVE_RUNTIME_AUTHORITY_REF && runtime.workerRef === G05_LIVE_RUNTIME_WORKER_REF, 'live observer owns runtime identities');
assert(runtime.resourceSnapshot.sourceHash === G05_LIVE_RUNTIME_SOURCE_HASH, 'live observer owns sourceHash');
assert(runtime.resourceSnapshot.backgroundWorkAdmission === 'HELD' && runtime.resourceSnapshot.interactiveWaitState === 'WAITING', 'unobserved logical supervisor state fails closed');
assert(runtime.resourceAdmission.state !== 'ADMITTED', 'inactive substrate cannot silently admit background effect');
assert(runtime.selfCertified === false && runtime.trustSnapshot.selfCertified === false, 'runtime evidence is not self-certified');
assert(runtime.currentHostMatchesVictorProfileClaimed === false, 'hosted runner does not impersonate Victor profile');

const standing = resolveCurrentG05StandingAuthority({
  home: syntheticHome,
  companionLineageRef: scope.companionLineageRef,
  threadRef: scope.threadRef,
  humanSubjectRef: scope.humanSubjectRef,
  expectedScope: scope,
  observedAt: runtime.observedAt
});
assert(standing.livePositiveStandingConsent === true, 'synthetic owner store resolves positive fixture authority');
assert(standing.authoritySha256 === seeded.binding.authoritySha256 && standing.currentAuthorityHeadSha256 === seeded.head.authorityHeadSha256, 'standing authority binds exact synthetic owner objects');

const policyBinding = {
  schemaVersion: 'vexlife.g05s.scheduled-policy-binding/v1',
  invocationClass: 'SCHEDULED_G05A',
  policyRef: 'policy.g05a.synthetic-proof',
  policySha256: semanticHash({ policy: 'g05a-synthetic-proof' }),
  policyHeadSha256: semanticHash({ head: 'g05a-synthetic-proof' }),
  policyGeneration: 0,
  standingScope: scope,
  standingScopeFingerprint: seeded.scopeFingerprint
};
const frontier = {
  conversationHeadSha256: semanticHash({ frontier: 'conversation' }),
  scoreHeadSha256: semanticHash({ frontier: 'score' }),
  semanticAuthorityHeadSha256: semanticHash({ frontier: 'semantic' }),
  dreamHeadSha256: null,
  dailyStratumSha256: null,
  wakeReceiptSha256: null
};
const admission = await resolveCurrentG05ScheduledAdmission({
  home: syntheticHome,
  humanSubjectRef: scope.humanSubjectRef,
  companionLineageRef: scope.companionLineageRef,
  threadRef: scope.threadRef,
  policyBinding,
  schedulerGeneration: 7,
  sourceFrontier: frontier
});
assert(admission.state === 'HELD_RUNTIME_RESOURCE_OR_INTERACTIVE_STATE', 'current production path remains held without native supervisor state');
assert(admission.schedulerGeneration === 7 && admission.provenance.schedulerGeneration === 7, 'scheduler generation is bound distinctly');
assert(admission.provenance.policyGeneration === 0 && admission.provenance.schedulerGeneration !== admission.provenance.policyGeneration, 'policy and scheduler generations do not collapse');
assert(admission.provenance.manualG03OneShotAuthorityAccepted === false, 'manual G03 authority cannot satisfy scheduled provenance');
assert(admission.provenance.actualDreamInvocationPerformed === false && admission.provenance.externalEffectAuthorityGranted === false, 'substrate performs no Dream/effect');
assert(admission.provenance.standingAuthorityHeadSha256 === seeded.head.authorityHeadSha256 && admission.provenance.runtimeSourceHash === G05_LIVE_RUNTIME_SOURCE_HASH, 'provenance binds Safety head and runtime source');
assert(admission.provenance.sourceFrontier.semanticAuthorityHeadSha256 === frontier.semanticAuthorityHeadSha256, 'provenance binds source frontier');

// A duplicate exact-scope current binding invalidates the whole owner head.
const duplicateHome = path.join(proofRoot, 'duplicate-home');
fs.mkdirSync(duplicateHome, { recursive: true });
seedSyntheticOwnerStore(duplicateHome, scope, { duplicate: true });
expectThrow(() => resolveCurrentG05StandingAuthority({
  home: duplicateHome,
  companionLineageRef: scope.companionLineageRef,
  threadRef: scope.threadRef,
  humanSubjectRef: scope.humanSubjectRef,
  expectedScope: scope,
  observedAt: runtime.observedAt
}), /duplicate|conflicting/i, 'duplicate current binding');

// Withdrawn current authority is historical evidence only.
const withdrawnHome = path.join(proofRoot, 'withdrawn-home');
fs.mkdirSync(withdrawnHome, { recursive: true });
seedSyntheticOwnerStore(withdrawnHome, scope, { disposition: 'WITHDRAWN' });
expectThrow(() => resolveCurrentG05StandingAuthority({
  home: withdrawnHome,
  companionLineageRef: scope.companionLineageRef,
  threadRef: scope.threadRef,
  humanSubjectRef: scope.humanSubjectRef,
  expectedScope: scope,
  observedAt: runtime.observedAt
}), /WITHDRAWN|not permitted/i, 'withdrawn current authority');

for (const disposition of ['DENIED', 'DEFERRED', 'UNKNOWN']) {
  const home = path.join(proofRoot, `${disposition.toLowerCase()}-home`);
  fs.mkdirSync(home, { recursive: true });
  seedSyntheticOwnerStore(home, scope, { disposition });
  expectThrow(() => resolveCurrentG05StandingAuthority({
    home, companionLineageRef: scope.companionLineageRef, threadRef: scope.threadRef,
    humanSubjectRef: scope.humanSubjectRef, expectedScope: scope, observedAt: runtime.observedAt
  }), /not permitted|DENIED|DEFERRED|UNKNOWN/i, `${disposition} current authority`);
}

const expiredHome = path.join(proofRoot, 'expired-home');
fs.mkdirSync(expiredHome, { recursive: true });
seedSyntheticOwnerStore(expiredHome, scope, { expiresAt: '2026-08-08T00:30:00.000Z' });
expectThrow(() => resolveCurrentG05StandingAuthority({
  home: expiredHome, companionLineageRef: scope.companionLineageRef, threadRef: scope.threadRef,
  humanSubjectRef: scope.humanSubjectRef, expectedScope: scope, observedAt: runtime.observedAt
}), /not live|stale/i, 'expired current authority');

const futureHeadHome = path.join(proofRoot, 'future-head-home');
fs.mkdirSync(futureHeadHome, { recursive: true });
seedSyntheticOwnerStore(futureHeadHome, scope, { headFormedAt: '2099-01-01T00:00:00.000Z' });
expectThrow(() => resolveCurrentG05StandingAuthority({
  home: futureHeadHome, companionLineageRef: scope.companionLineageRef, threadRef: scope.threadRef,
  humanSubjectRef: scope.humanSubjectRef, expectedScope: scope, observedAt: runtime.observedAt
}), /newer than the exact runtime observation|stale/i, 'future/stale current owner head');

expectThrow(() => resolveCurrentG05StandingAuthority({
  home: syntheticHome, companionLineageRef: scope.companionLineageRef, threadRef: scope.threadRef,
  humanSubjectRef: 'human.other.synthetic-proof', expectedScope: scope, observedAt: runtime.observedAt
}), /expected standing scope identity differs|mismatch/i, 'wrong human subject');

const wrongScope = { ...scope, restWindowEndLocalMinute: scope.restWindowEndLocalMinute + 1 };
expectThrow(() => resolveCurrentG05StandingAuthority({
  home: syntheticHome, companionLineageRef: scope.companionLineageRef, threadRef: scope.threadRef,
  humanSubjectRef: scope.humanSubjectRef, expectedScope: wrongScope, observedAt: runtime.observedAt
}), /absent from the canonical current owner head|mismatch/i, 'wrong exact scope');

const wrongPurposeScope = { ...scope, purposeRef: 'purpose.vexlife.g05.wrong-proof' };
expectThrow(() => resolveCurrentG05StandingAuthority({
  home: syntheticHome, companionLineageRef: scope.companionLineageRef, threadRef: scope.threadRef,
  humanSubjectRef: scope.humanSubjectRef, expectedScope: wrongPurposeScope, observedAt: runtime.observedAt
}), /semantic boundary|purpose/i, 'wrong purpose');

const widenedScope = { ...scope, permittedUseRefs: [...scope.permittedUseRefs, 'use.vexlife.g05.real-training'].sort() };
expectThrow(() => buildG05StandingScopeFingerprint(widenedScope), /inadmissible permitted use/i, 'widened standing use');

for (const forbiddenExport of ['mintPositiveStandingConsent', 'writeSafetyOwnerHead', 'selfCertifyStandingAuthority', 'booleanOrStringToPermission']) {
  assert(!(forbiddenExport in g05sModule), `production export ${forbiddenExport} is absent`);
}

// Scheduler trust must reject a different well-formed hash for the pinned live source.
const wrongHash = '0'.repeat(64) === G05_LIVE_RUNTIME_SOURCE_HASH ? '1'.repeat(64) : '0'.repeat(64);
const wrongResource = createResourceSnapshot({
  ...runtime.resourceSnapshot,
  sourceHash: wrongHash,
  semanticFingerprint: undefined
});
expectThrow(() => createSchedulerRuntimeTrustSnapshot({
  snapshotRef: 'g05s-wrong-source-hash-proof',
  sourceRef: G05_LIVE_RUNTIME_SOURCE_REF,
  sourceHash: wrongHash,
  formationRef: runtime.trustSnapshot.formationRef,
  evidenceClass: G05_LIVE_RUNTIME_EVIDENCE_CLASS,
  schedulerGeneration: runtime.trustSnapshot.schedulerGeneration,
  formedAt: runtime.trustSnapshot.formedAt,
  observedAt: runtime.trustSnapshot.observedAt,
  expiresAt: runtime.trustSnapshot.expiresAt,
  workerRef: G05_LIVE_RUNTIME_WORKER_REF,
  actorRef: runtime.trustSnapshot.actorRef,
  roleRef: runtime.trustSnapshot.roleRef,
  claimRef: runtime.trustSnapshot.claimRef,
  occupancyRef: runtime.trustSnapshot.occupancyRef,
  leaseAuthorityRef: G05_LIVE_RUNTIME_AUTHORITY_REF,
  resourceSnapshotRef: wrongResource.snapshotRef,
  resourceSnapshotFingerprint: wrongResource.semanticFingerprint,
  currentness: 'CURRENT'
}, { schedulerRegistry: registry, resourceSnapshot: wrongResource }), /sourceHash mismatch/i, 'pinned live source hash');

expectThrow(() => createSchedulerRuntimeTrustSnapshot({
  ...runtime.trustSnapshot,
  leaseAuthorityRef: 'authority.intent-scheduler.wrong-proof',
  semanticFingerprint: undefined
}, { schedulerRegistry: registry, resourceSnapshot: runtime.resourceSnapshot }), /authority mismatch/i, 'wrong live source authority');
expectThrow(() => createSchedulerRuntimeTrustSnapshot({
  ...runtime.trustSnapshot,
  workerRef: 'worker.model.mock.primary',
  semanticFingerprint: undefined
}, { schedulerRegistry: registry, resourceSnapshot: runtime.resourceSnapshot }), /not admitted|evidence class/i, 'wrong live worker');

const unknownSourceResource = createResourceSnapshot({ ...runtime.resourceSnapshot, sourceRef: 'source.intent-scheduler.unknown-proof', semanticFingerprint: undefined });
expectThrow(() => createSchedulerRuntimeTrustSnapshot({
  ...runtime.trustSnapshot,
  sourceRef: 'source.intent-scheduler.unknown-proof',
  resourceSnapshotRef: unknownSourceResource.snapshotRef,
  resourceSnapshotFingerprint: unknownSourceResource.semanticFingerprint,
  semanticFingerprint: undefined
}, { schedulerRegistry: registry, resourceSnapshot: unknownSourceResource }), /unknown scheduler runtime source/i, 'wrong live source identity');

const wrongClassResource = createResourceSnapshot({ ...runtime.resourceSnapshot, evidenceClass: 'SIMULATED_CURRENT', semanticFingerprint: undefined });
expectThrow(() => createSchedulerRuntimeTrustSnapshot({
  ...runtime.trustSnapshot,
  evidenceClass: 'SIMULATED_CURRENT',
  resourceSnapshotRef: wrongClassResource.snapshotRef,
  resourceSnapshotFingerprint: wrongClassResource.semanticFingerprint,
  semanticFingerprint: undefined
}, { schedulerRegistry: registry, resourceSnapshot: wrongClassResource }), /evidence class mismatch/i, 'wrong live evidence class');

expectThrow(() => createSchedulerRuntimeTrustSnapshot({
  ...runtime.trustSnapshot,
  expiresAt: runtime.trustSnapshot.observedAt,
  semanticFingerprint: undefined
}, { schedulerRegistry: registry, resourceSnapshot: runtime.resourceSnapshot }), /formedAt <= observedAt < expiresAt/i, 'stale live trust interval');

const wrongProfileRegistry = structuredClone(registry);
const wrongProfileSource = wrongProfileRegistry.runtimeSourceIdentities.find((item) => item.sourceRef === G05_LIVE_RUNTIME_SOURCE_REF);
wrongProfileSource.sourceDescriptor.mechanicalProfileRef = 'profile.vexlife.windows.wrong-proof';
expectThrow(() => validateG05LiveRuntimeRegistry(wrongProfileRegistry), /descriptor\/hash binding|mechanical-profile provenance/i, 'wrong mechanical profile provenance');

const historicalReplay = validateHistoricalG05ScheduledAdmissionProvenance(admission.provenance);
assert(historicalReplay.state === 'HISTORICAL_INTEGRITY_ONLY' && historicalReplay.grantsCurrentAuthority === false, 'historical provenance replay cannot grant current authority');
assert(!('validateG05ScheduledAdmissionProvenance' in g05sModule), 'caller-context live provenance validator is not exported');
expectThrow(() => validateHistoricalG05ScheduledAdmissionProvenance({
  ...admission.provenance,
  sourceFrontier: { ...frontier, scoreHeadSha256: semanticHash({ frontier: 'score-drift' }) }
}), /content address|provenance/i, 'source-frontier drift changes provenance identity');
expectThrow(() => validateHistoricalG05ScheduledAdmissionProvenance({
  ...admission.provenance,
  schedulerGeneration: admission.provenance.schedulerGeneration + 1
}), /content address|provenance/i, 'scheduler generation drift changes provenance identity');

const proof = {
  schemaVersion: 'vexlife.g05s.runtime-authority-substrate-proof/v1',
  state: 'PASS',
  mode: 'HOSTED_WINDOWS_RUNTIME_AND_SYNTHETIC_SAFETY_OWNER_PROOF',
  candidateHeadSha: process.env.VEXLIFE_CANDIDATE_HEAD_SHA || null,
  checks: {
    S0: 'PASS', S1: 'PASS', S2: 'PASS', S3: 'PASS', S4: 'PASS', S5: 'PASS',
    R0: 'PASS', R1: 'PASS', R2: 'PASS', R3: 'PASS', R4: 'PASS',
    P0: 'PASS', P1: 'PASS', P2: 'PASS', H0: 'PASS', H1: 'PASS'
  },
  standingAuthorityContractRef: G05_STANDING_AUTHORITY_CONTRACT_REF,
  liveRuntimeSourceRef: G05_LIVE_RUNTIME_SOURCE_REF,
  liveRuntimeSourceHash: G05_LIVE_RUNTIME_SOURCE_HASH,
  liveRuntimeAuthorityRef: G05_LIVE_RUNTIME_AUTHORITY_REF,
  liveRuntimeWorkerRef: G05_LIVE_RUNTIME_WORKER_REF,
  liveRuntimeEvidenceClass: G05_LIVE_RUNTIME_EVIDENCE_CLASS,
  sourceOwnedUtcObservation: true,
  sourceOwnedOsResourceObservation: true,
  callerContextLiveProvenanceValidatorExported: false,
  historicalProvenanceReplayState: historicalReplay.state,
  historicalProvenanceReplayGrantsCurrentAuthority: historicalReplay.grantsCurrentAuthority,
  schedulerGenerationBoundSeparatelyFromPolicyGeneration: true,
  schedulerGeneration: admission.provenance.schedulerGeneration,
  policyGeneration: admission.provenance.policyGeneration,
  logicalSupervisorState: runtime.logicalSupervisorState,
  resourceAdmissionState: runtime.resourceAdmission.state,
  syntheticSafetyOwnerStoreUsed: true,
  livePositiveStandingConsent: false,
  actualStandingConsentMaterialized: false,
  actualAutomaticDreamInvocationPerformed: false,
  manualG03OneShotAuthorityAccepted: false,
  nativeSupervisorInstalled: false,
  realTrainingPerformed: false,
  modelOrAdapterMutationPerformed: false,
  rhythmActivationPerformed: false,
  synchronizationPerformed: false,
  powerControlPerformed: false,
  cloudUploadPerformed: false,
  publicationPerformed: false,
  currentHostMatchesVictorProfileClaimed: false,
  mechanicalProfileDependencyRef: G05_LIVE_RUNTIME_SOURCE_DESCRIPTOR.mechanicalProfileRef,
  mechanicalProfileDependencyDigestSha256: G05_LIVE_RUNTIME_SOURCE_DESCRIPTOR.mechanicalProfileDigestSha256,
  runtimeObservedAt: runtime.observedAt,
  runtimeObservationFingerprint: runtime.semanticFingerprint,
  syntheticStandingAuthorityHeadSha256: seeded.head.authorityHeadSha256,
  scheduledProvenanceSha256: admission.provenance.provenanceSha256
};

const receipt = path.resolve(process.env.VEXLIFE_G05S_PROOF_RECEIPT || 'generated/health/g05-runtime-authority-substrate-windows-proof.json');
writeJson(receipt, proof);
process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
