import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

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
  resolveCurrentG05StandingAuthority
} from '../src/core/g05-runtime-authority-substrate.mjs';
import { createResourceSnapshot } from '../src/core/resource-admission.mjs';
import { createSchedulerRuntimeTrustSnapshot } from '../src/core/scheduler-runtime-trust.mjs';
import { semanticHash } from '../src/core/utils.mjs';

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function scope() {
  return {
    schemaVersion: 'vextreme.daily-dream-standing-consent-scope/v1',
    humanSubjectRef: 'human.synthetic.g05s',
    homeRef: 'home.synthetic.g05s',
    deviceRef: 'device.synthetic.g05s',
    companionLineageRef: 'lineage.synthetic.g05s',
    threadRef: 'thread.synthetic.g05s',
    purposeRef: G05_STANDING_PURPOSE_REF,
    selectedMode: G05_MEMORY_ONLY_MODE,
    privacyClass: 'DEVICE_PRIVATE',
    permittedUseRefs: [
      'use.vexlife.g05.form-bounded-supervisor-admission-and-wake-receipts',
      'use.vexlife.g05.schedule-one-g03-memory-only-dream-per-local-calendar-day'
    ].sort(),
    prohibitedUseRefs: ['use.vexlife.g05.real-training'],
    timeZoneRef: 'America/Los_Angeles',
    restWindowStartLocalMinute: 30,
    restWindowEndLocalMinute: 240,
    exactlyOnceCalendarDay: true,
    interactiveYieldRequired: true,
    localOnly: true
  };
}

function buildConsent(s, { disposition = 'PERMITTED', expiresAt = null } = {}) {
  const preimage = {
    schemaVersion: 'vextreme.daily-dream-standing-consent-disposition/v1',
    humanSubjectRef: s.humanSubjectRef,
    homeRef: s.homeRef,
    deviceRef: s.deviceRef,
    companionLineageRef: s.companionLineageRef,
    threadRef: s.threadRef,
    purposeRef: s.purposeRef,
    selectedMode: s.selectedMode,
    privacyClass: s.privacyClass,
    permittedUseRefs: [...s.permittedUseRefs],
    prohibitedUseRefs: [...s.prohibitedUseRefs],
    timeZoneRef: s.timeZoneRef,
    restWindowStartLocalMinute: s.restWindowStartLocalMinute,
    restWindowEndLocalMinute: s.restWindowEndLocalMinute,
    exactlyOnceCalendarDay: true,
    interactiveYieldRequired: true,
    localOnly: true,
    disposition,
    formedAt: '2026-08-08T00:00:00.000Z',
    expiresAt,
    issuerRef: 'owner.vex-safety.synthetic.g05s',
    issuerClass: 'SYNTHETIC_TEST_OWNER',
    sourceEvidenceRefs: ['github.issue.vextreme-sdk.350.comment.5225148306']
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
function bindingMember(consent, binding, scopeFingerprint) {
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
function key(item) { return semanticHash({ humanSubjectRef: item.humanSubjectRef, purposeRef: item.purposeRef, scopeFingerprint: item.scopeFingerprint }); }
function buildHead(s, members, { generation = 0, prior = null } = {}) {
  const currentStandingConsentBindings = [...members].sort((a, b) => key(a).localeCompare(key(b)) || a.standingConsentSha256.localeCompare(b.standingConsentSha256));
  const preimage = {
    schemaVersion: 'vextreme.daily-dream-standing-consent-authority-head/v1',
    contractRef: G05_STANDING_AUTHORITY_CONTRACT_REF,
    sourceLineageRef: s.companionLineageRef,
    sourceThreadRef: s.threadRef,
    generation,
    priorAuthorityHeadSha256: prior,
    currentStandingConsentBindings,
    formedAt: '2026-08-08T00:00:00.000Z',
    ownerDispositionRef: 'owner-disposition.vex-safety.synthetic.g05s'
  };
  const authorityHeadRef = `daily-dream-standing-authority-head.${semanticHash(preimage).slice(0, 32)}`;
  const authorityHeadSha256 = semanticHash({ ...preimage, authorityHeadRef });
  return { ...preimage, authorityHeadRef, authorityHeadSha256 };
}
function seed(home, s, options = {}) {
  const sf = buildG05StandingScopeFingerprint(s);
  const consent = buildConsent(s, options);
  const binding = buildBinding(consent, sf);
  const member = bindingMember(consent, binding, sf);
  const members = options.duplicate ? [member, { ...member }] : [member];
  const head = buildHead(s, members);
  const root = path.join(home, 'semantic-authority', 'daily-dream-standing-rest', s.companionLineageRef, s.threadRef);
  writeJson(path.join(root, 'consents', `${consent.standingConsentSha256}.json`), consent);
  writeJson(path.join(root, 'authority-bindings', `${binding.authoritySha256}.json`), binding);
  writeJson(path.join(root, 'heads', `${head.authorityHeadSha256}.json`), head);
  writeJson(path.join(root, 'head.json'), head);
  return { consent, binding, head, scopeFingerprint: sf };
}

function tempHome() { return fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-g05s-test-')); }
function registry() { return JSON.parse(fs.readFileSync(path.resolve('blueprint/intent-scheduler-registry.json'), 'utf8')); }

const OBSERVED_AT = '2026-08-08T01:00:00.000Z';

test('G05S standing authority resolves only exact current source-owned membership', () => {
  const home = tempHome();
  const s = scope();
  const seeded = seed(home, s);
  const resolved = resolveCurrentG05StandingAuthority({
    home,
    companionLineageRef: s.companionLineageRef,
    threadRef: s.threadRef,
    humanSubjectRef: s.humanSubjectRef,
    expectedScope: s,
    observedAt: OBSERVED_AT
  });
  assert.equal(resolved.livePositiveStandingConsent, true);
  assert.equal(resolved.currentAuthorityHeadSha256, seeded.head.authorityHeadSha256);
  assert.equal(resolved.standingConsentSha256, seeded.consent.standingConsentSha256);
  assert.equal(resolved.authoritySha256, seeded.binding.authoritySha256);
  assert.equal(resolved.scopeFingerprint, seeded.scopeFingerprint);
});

test('G05S standing authority rejects duplicate current scope and withdrawn state', () => {
  const s = scope();
  const duplicate = tempHome();
  seed(duplicate, s, { duplicate: true });
  assert.throws(() => resolveCurrentG05StandingAuthority({ home: duplicate, companionLineageRef: s.companionLineageRef, threadRef: s.threadRef, humanSubjectRef: s.humanSubjectRef, expectedScope: s, observedAt: OBSERVED_AT }), /duplicate|conflicting/i);

  const withdrawn = tempHome();
  seed(withdrawn, s, { disposition: 'WITHDRAWN' });
  assert.throws(() => resolveCurrentG05StandingAuthority({ home: withdrawn, companionLineageRef: s.companionLineageRef, threadRef: s.threadRef, humanSubjectRef: s.humanSubjectRef, expectedScope: s, observedAt: OBSERVED_AT }), /WITHDRAWN|not permitted/i);
});

test('G05S nullable expiry remains current-head-controlled and expired authority fails', () => {
  const s = scope();
  const noExpiry = tempHome();
  seed(noExpiry, s, { expiresAt: null });
  assert.doesNotThrow(() => resolveCurrentG05StandingAuthority({ home: noExpiry, companionLineageRef: s.companionLineageRef, threadRef: s.threadRef, humanSubjectRef: s.humanSubjectRef, expectedScope: s, observedAt: OBSERVED_AT }));

  const expired = tempHome();
  seed(expired, s, { expiresAt: '2026-08-08T00:30:00.000Z' });
  assert.throws(() => resolveCurrentG05StandingAuthority({ home: expired, companionLineageRef: s.companionLineageRef, threadRef: s.threadRef, humanSubjectRef: s.humanSubjectRef, expectedScope: s, observedAt: OBSERVED_AT }), /not live|stale/i);
});


test('G05S standing scope rejects widened permitted uses and future owner heads', () => {
  const widened = scope();
  widened.permittedUseRefs = [...widened.permittedUseRefs, 'use.vexlife.g05.real-training'].sort();
  assert.throws(() => buildG05StandingScopeFingerprint(widened), /inadmissible permitted use/i);

  const home = tempHome();
  const s = scope();
  const scopeFingerprint = buildG05StandingScopeFingerprint(s);
  const consent = buildConsent(s);
  const binding = buildBinding(consent, scopeFingerprint);
  const member = bindingMember(consent, binding, scopeFingerprint);
  const futureHead = buildHead(s, [member]);
  futureHead.formedAt = '2099-01-01T00:00:00.000Z';
  const preimage = { ...futureHead };
  delete preimage.authorityHeadRef;
  delete preimage.authorityHeadSha256;
  futureHead.authorityHeadRef = `daily-dream-standing-authority-head.${semanticHash(preimage).slice(0, 32)}`;
  futureHead.authorityHeadSha256 = semanticHash({ ...preimage, authorityHeadRef: futureHead.authorityHeadRef });
  const root = path.join(home, 'semantic-authority', 'daily-dream-standing-rest', s.companionLineageRef, s.threadRef);
  writeJson(path.join(root, 'consents', `${consent.standingConsentSha256}.json`), consent);
  writeJson(path.join(root, 'authority-bindings', `${binding.authoritySha256}.json`), binding);
  writeJson(path.join(root, 'heads', `${futureHead.authorityHeadSha256}.json`), futureHead);
  writeJson(path.join(root, 'head.json'), futureHead);
  assert.throws(() => resolveCurrentG05StandingAuthority({ home, companionLineageRef: s.companionLineageRef, threadRef: s.threadRef, humanSubjectRef: s.humanSubjectRef, expectedScope: s, observedAt: OBSERVED_AT }), /newer than the exact runtime observation/i);
});

test('G05S live runtime source is registry-pinned and wrong source hash fails scheduler trust', () => {
  const r = registry();
  const source = r.runtimeSourceIdentities.find((item) => item.sourceRef === G05_LIVE_RUNTIME_SOURCE_REF);
  const worker = r.workerIdentities.find((item) => item.workerRef === G05_LIVE_RUNTIME_WORKER_REF);
  assert.equal(source.sourceHash, G05_LIVE_RUNTIME_SOURCE_HASH);
  assert.equal(semanticHash(source.sourceDescriptor), G05_LIVE_RUNTIME_SOURCE_HASH);
  assert.equal(semanticHash(G05_LIVE_RUNTIME_SOURCE_DESCRIPTOR), G05_LIVE_RUNTIME_SOURCE_HASH);
  assert.equal(source.authorityRef, G05_LIVE_RUNTIME_AUTHORITY_REF);
  assert.equal(source.evidenceClass, G05_LIVE_RUNTIME_EVIDENCE_CLASS);
  assert.equal(source.liveRuntime, true);
  assert.equal(worker.workerKind, 'NON_MODEL_RUNTIME_SUPERVISOR');

  const wrongHash = '0'.repeat(64) === G05_LIVE_RUNTIME_SOURCE_HASH ? '1'.repeat(64) : '0'.repeat(64);
  const resource = createResourceSnapshot({
    snapshotRef: 'snapshot.g05s.synthetic-wrong-hash', generation: 0, sourceRef: G05_LIVE_RUNTIME_SOURCE_REF, sourceHash: wrongHash,
    formationRef: 'formation.g05s.synthetic', evidenceClass: G05_LIVE_RUNTIME_EVIDENCE_CLASS,
    cpuLoadPct: 0, cpuConcurrencyLimit: 4, cpuActiveCount: 0, ramAvailableMb: 4096, ramReservedMb: 0,
    gpuAvailable: false, vramAvailableMb: 0, vramReservedMb: 0, modelResident: false, activeModelTurn: true,
    activeHeavyTool: true, interactiveWaitState: 'WAITING', backgroundWorkAdmission: 'HELD', thermalPowerState: 'NOT_EXPOSED',
    currentness: 'CURRENT', formedAt: '2026-08-08T00:59:59.000Z', observedAt: OBSERVED_AT, expiresAt: '2026-08-08T01:00:30.000Z'
  });
  assert.throws(() => createSchedulerRuntimeTrustSnapshot({
    snapshotRef: 'trust.g05s.synthetic-wrong-hash', sourceRef: G05_LIVE_RUNTIME_SOURCE_REF, sourceHash: wrongHash,
    formationRef: 'formation.g05s.synthetic', evidenceClass: G05_LIVE_RUNTIME_EVIDENCE_CLASS, schedulerGeneration: 0,
    formedAt: '2026-08-08T00:59:59.000Z', observedAt: OBSERVED_AT, expiresAt: '2026-08-08T01:00:30.000Z',
    workerRef: G05_LIVE_RUNTIME_WORKER_REF, actorRef: 'actor.synthetic.g05s', roleRef: 'role.synthetic.g05s', claimRef: 'claim.synthetic.g05s',
    occupancyRef: 'occupancy.synthetic.g05s', leaseAuthorityRef: G05_LIVE_RUNTIME_AUTHORITY_REF,
    resourceSnapshotRef: resource.snapshotRef, resourceSnapshotFingerprint: resource.semanticFingerprint, currentness: 'CURRENT'
  }, { schedulerRegistry: r, resourceSnapshot: resource }), /sourceHash mismatch/i);
});

test('G05S live observer never accepts caller runtime fact overrides', { skip: process.platform !== 'win32' }, async () => {
  const result = await observeWindowsG05Runtime({ schedulerGeneration: 0, observedAt: '1999-01-01T00:00:00.000Z', sourceRef: 'source.fake', cpuLoadPct: 0, backgroundWorkAdmission: 'ADMITTED' });
  assert.notEqual(result.observedAt, '1999-01-01T00:00:00.000Z');
  assert.equal(result.sourceRef, G05_LIVE_RUNTIME_SOURCE_REF);
  assert.equal(result.sourceHash, G05_LIVE_RUNTIME_SOURCE_HASH);
  assert.equal(result.resourceSnapshot.backgroundWorkAdmission, 'HELD');
  assert.equal(result.resourceSnapshot.interactiveWaitState, 'WAITING');
  assert.notEqual(result.resourceAdmission.state, 'ADMITTED');
  assert.equal(result.selfCertified, false);
  assert.equal(result.currentHostMatchesVictorProfileClaimed, false);
});

test('G05S current scheduled admission binds Safety + live runtime and performs no effect', { skip: process.platform !== 'win32' }, async () => {
  const home = tempHome();
  const s = scope();
  const seeded = seed(home, s);
  const policyBinding = {
    schemaVersion: 'vexlife.g05s.scheduled-policy-binding/v1', invocationClass: 'SCHEDULED_G05A', policyRef: 'policy.g05a.synthetic-test',
    policySha256: semanticHash({ policy: 'synthetic-test' }), policyHeadSha256: semanticHash({ head: 'synthetic-test' }), policyGeneration: 0,
    standingScope: s, standingScopeFingerprint: seeded.scopeFingerprint
  };
  const frontier = {
    conversationHeadSha256: semanticHash({ f: 'c' }), scoreHeadSha256: semanticHash({ f: 's' }), semanticAuthorityHeadSha256: semanticHash({ f: 'a' }),
    dreamHeadSha256: null, dailyStratumSha256: null, wakeReceiptSha256: null
  };
  const result = await resolveCurrentG05ScheduledAdmission({ home, humanSubjectRef: s.humanSubjectRef, companionLineageRef: s.companionLineageRef, threadRef: s.threadRef, policyBinding, sourceFrontier: frontier });
  assert.equal(result.state, 'HELD_RUNTIME_RESOURCE_OR_INTERACTIVE_STATE');
  assert.equal(result.provenance.standingAuthorityHeadSha256, seeded.head.authorityHeadSha256);
  assert.equal(result.provenance.runtimeSourceHash, G05_LIVE_RUNTIME_SOURCE_HASH);
  assert.equal(result.provenance.manualG03OneShotAuthorityAccepted, false);
  assert.equal(result.provenance.actualDreamInvocationPerformed, false);
  assert.equal(result.provenance.externalEffectAuthorityGranted, false);
  assert.equal(result.nativeSupervisorInstalled, false);
});
