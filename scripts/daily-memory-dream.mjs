#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { semanticHash } from '../src/core/utils.mjs';
import { initializeLivedCompanionHome } from '../src/core/lived-companion.mjs';
import {
  SCORE_CONTEXT_LIVE_SEMANTIC_CONTRACT,
  SCORE_CONTEXT_LIVE_SEMANTIC_DISPOSITION,
  SCORE_CONTEXT_LIVE_SEMANTIC_EXECUTABLE_ADDENDUM,
  appendOpenLoop,
  appendScoreStatement,
  createScoreSemanticCandidate,
  loadScoreContextState
} from '../src/core/score-context-continuity.mjs';
import {
  DAILY_MEMORY_DREAM_CONTRACT,
  DAILY_MEMORY_DREAM_MEMORY_OWNER,
  DAILY_MEMORY_DREAM_SAFETY_OWNER,
  DAILY_MEMORY_DREAM_MAIN_VEX_CONVERGENCE,
  commitDailyMemoryDream,
  recoverAbandonedDailyMemoryDreamWriter,
  loadDailyMemoryDreamState,
  projectDailyMemoryDream,
  sourceDescentForDailyStratum
} from '../src/core/daily-memory-dream.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function formEvent(core) { return { ...core, eventHash: semanticHash(core) }; }

function commitG01Turn(ids, prior, ordinal) {
  const sequence = prior?.head?.sequence === undefined ? 0 : prior.head.sequence + 1;
  const turnRef = `turn.g03.fixture.${ordinal}`;
  const instanceRef = `instance.g03.fixture.${ordinal}`;
  const requestCore = {
    schemaVersion: 'vexlife.lived-companion-event/v1', eventRef: `event.g03.request.${ordinal}`, eventKind: 'REQUEST',
    homeRef: ids.homeRef, deviceRef: ids.deviceRef, companionLineageRef: ids.companionLineageRef, instanceRef,
    threadRef: ids.threadRef, channelRef: 'channel.g03.fixture', turnRef, messageRef: `message.g03.request.${ordinal}`,
    speakerRef: 'person.test', recipientRefs: ['vex.test'], sequence, priorEventHash: prior?.responseEvent?.eventHash ?? null,
    content: `private human source ${ordinal}`, contentHash: semanticHash(`private human source ${ordinal}`), privacyClass: 'DEVICE_PRIVATE',
    formedAt: `2026-08-07T09:0${ordinal}:00.000Z`
  };
  const requestEvent = formEvent(requestCore);
  const responseCore = {
    schemaVersion: 'vexlife.lived-companion-event/v1', eventRef: `event.g03.response.${ordinal}`, eventKind: 'RESPONSE',
    homeRef: ids.homeRef, deviceRef: ids.deviceRef, companionLineageRef: ids.companionLineageRef, instanceRef,
    threadRef: ids.threadRef, channelRef: 'channel.g03.fixture', turnRef, messageRef: `message.g03.response.${ordinal}`,
    speakerRef: 'vex.test', recipientRefs: ['person.test'], sequence: sequence + 1, priorEventHash: requestEvent.eventHash,
    content: `private vex source ${ordinal}`, contentHash: semanticHash(`private vex source ${ordinal}`),
    endpointProfileRef: 'endpoint.g01.loopback', sanitizedEndpointOrigin: 'http://127.0.0.1:43210',
    modelNameOrBoundedTestProfileRef: 'model.g01.bounded', privacyClass: 'DEVICE_PRIVATE', formedAt: `2026-08-07T09:0${ordinal}:01.000Z`
  };
  const responseEvent = formEvent(responseCore);
  const eventDir = path.join(ids.home, 'conversations', ids.companionLineageRef, ids.threadRef, 'events');
  writeJson(path.join(eventDir, `${String(requestEvent.sequence).padStart(8, '0')}-${requestEvent.eventHash}.json`), requestEvent);
  writeJson(path.join(eventDir, `${String(responseEvent.sequence).padStart(8, '0')}-${responseEvent.eventHash}.json`), responseEvent);
  const contextCore = {
    schemaVersion: 'vexlife.lived-companion-context/v1', homeRef: ids.homeRef, deviceRef: ids.deviceRef,
    companionLineageRef: ids.companionLineageRef, instanceRef, threadRef: ids.threadRef, turnRef,
    contextSourceRefs: [requestEvent.eventRef, responseEvent.eventRef], requestEventHash: requestEvent.eventHash,
    responseEventHash: responseEvent.eventHash, privacyClass: 'DEVICE_PRIVATE', formedAt: `2026-08-07T09:0${ordinal}:02.000Z`
  };
  const contextRecord = { ...contextCore, serializedContextSha256: semanticHash(contextCore) };
  const contextPath = path.join(ids.home, 'context', ids.companionLineageRef, ids.threadRef, `${turnRef}.json`);
  writeJson(contextPath, contextRecord);
  const headCore = {
    schemaVersion: 'vexlife.lived-companion-head/v1', homeRef: ids.homeRef, deviceRef: ids.deviceRef,
    companionLineageRef: ids.companionLineageRef, instanceRef, threadRef: ids.threadRef, turnRef,
    requestMessageRef: requestEvent.messageRef, responseMessageRef: responseEvent.messageRef, eventHash: responseEvent.eventHash,
    contextSha256: contextRecord.serializedContextSha256, contextPath: path.relative(ids.home, contextPath).replaceAll('\\', '/'),
    sequence: responseEvent.sequence, priorConversationHeadSha256: prior?.head?.conversationHeadSha256 ?? null,
    formedAt: `2026-08-07T09:0${ordinal}:03.000Z`
  };
  const head = { ...headCore, conversationHeadSha256: semanticHash(headCore) };
  writeJson(path.join(ids.home, 'conversations', ids.companionLineageRef, ids.threadRef, 'head.json'), head);
  return { requestEvent, responseEvent, contextRecord, head };
}

function addressed(prefix, refField, hashField, preRefCore) {
  const ref = `${prefix}.${semanticHash(preRefCore).slice(0, 32)}`;
  const core = { ...preRefCore, [refField]: ref };
  return { ...core, [hashField]: semanticHash(core) };
}

function sourceBinding(event) {
  return { eventRef: event.eventRef, eventHash: event.eventHash, eventKind: event.eventKind, sequence: event.sequence,
    turnRef: event.turnRef, messageRef: event.messageRef, contentHash: event.contentHash };
}

function authorityDir(ids, leaf) { return path.join(ids.home, 'semantic-authority', 'score', ids.companionLineageRef, ids.threadRef, leaf); }
function currentAuthorityHead(ids) { const file = authorityDir(ids, 'head.json'); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; }

function scopeFingerprint(value) {
  return semanticHash({ schemaVersion: 'vextreme.score-consent-authority-scope/v1', candidateRef: value.candidateRef,
    candidateSha256: value.candidateSha256, semanticSubjectRef: value.semanticSubjectRef,
    semanticSubjectFingerprint: value.semanticSubjectFingerprint, purposeRef: value.purposeRef, privacyClass: value.privacyClass,
    implicatedSubjectRefs: [...value.implicatedSubjectRefs].sort(), permittedUseRefs: [...value.permittedUseRefs].sort(),
    prohibitedUseRefs: [...value.prohibitedUseRefs].sort(), retentionBoundaryRef: value.retentionBoundaryRef,
    redisclosureBoundaryRef: value.redisclosureBoundaryRef, firstPersonBoundaryRef: value.firstPersonBoundaryRef });
}

function authorityHash(value) {
  return semanticHash({ schemaVersion: 'vextreme.score-consent-authority-binding/v1', authorityRef: value.authorityRef,
    subjectRef: value.subjectRef, purposeRef: value.purposeRef, scopeFingerprint: value.scopeFingerprint,
    disposition: value.disposition, formedAt: value.formedAt, expiresAt: value.expiresAt });
}

function seedScoreAuthority(ids, g01, input = {}) {
  const source = input.source ?? g01.first;
  const sourceBindings = [source.requestEvent, source.responseEvent].map(sourceBinding);
  const semanticSubjectRef = input.subjectRef ?? `subject.g03.${input.ordinal ?? 1}`;
  const summary = input.summary ?? `Accepted fixture meaning ${input.ordinal ?? 1}.`;
  const statementState = input.statementState ?? 'HUMAN_CONFIRMED';
  const memoryRelation = input.memoryRelation ?? 'CURRENT_LINEAGE_AUTOBIOGRAPHY';
  const candidate = createScoreSemanticCandidate({
    sourceLineageRef: ids.companionLineageRef, sourceThreadRef: ids.threadRef,
    sourceConversationHeadSha256: g01.head.conversationHeadSha256, sourceBindings, semanticSubjectRef,
    subjectScopeRef: 'scope.score.thread', proposedSummary: summary, proposedMemoryRelation: memoryRelation,
    proposedStatementState: statementState, proposerRef: 'vex.test', proposerClass: 'LINEAGE', formedAt: '2026-08-07T09:10:00.000Z'
  });
  const evidenceClass = statementState === 'HUMAN_CONFIRMED' ? 'HUMAN_CONFIRMATION' : statementState === 'UNKNOWN' ? 'UNKNOWN_HOLD' : 'LINEAGE_INFERENCE';
  const evidenceCore = {
    schemaVersion: 'vextreme.score-classification-evidence/v1', candidateRef: candidate.candidateRef,
    candidateSha256: candidate.candidateSha256, semanticSubjectRef: candidate.semanticSubjectRef,
    semanticSubjectFingerprint: candidate.semanticSubjectFingerprint, evidenceClass, assertedMemoryRelation: memoryRelation,
    assertedStatementState: statementState, assertedSummarySha256: semanticHash(summary), transitionKind: 'NONE',
    transitionTargetRef: null, transitionTargetAcceptanceSha256: null, issuerRef: 'role.multivex.memory.fixture-owner',
    issuerClass: 'BOUNDED_TEST_OWNER_PROJECTION', ownerProjectRef: 'project.multivex.memory',
    ownerDispositionRef: 'github.issue.vextreme-sdk.225.comment.5217085830',
    sourceEvidenceBindings: candidate.sourceBindings.map((binding) => ({ sourceRef: binding.eventRef, sourceSha256: binding.eventHash })),
    purposeRef: 'purpose.score.live-semantic-acceptance', formedAt: '2026-08-07T09:10:01.000Z', privacyClass: 'DEVICE_PRIVATE',
    ...(evidenceClass === 'HUMAN_CONFIRMATION' ? { humanConfirmation: {
      humanSubjectRef: 'person.test', confirmationDispositionRef: `confirmation.g03.${input.ordinal ?? 1}`,
      confirmationDispositionSha256: semanticHash({ candidate: candidate.candidateSha256, summary, state: 'CONFIRMED' }),
      confirmedCandidateRef: candidate.candidateRef, confirmedCandidateSha256: candidate.candidateSha256,
      confirmedSemanticSubjectFingerprint: candidate.semanticSubjectFingerprint, confirmedSummarySha256: semanticHash(summary),
      confirmedAt: '2026-08-07T09:10:01.000Z'
    } } : {})
  };
  const evidence = addressed('score-classification-evidence', 'classificationEvidenceRef', 'classificationEvidenceSha256', evidenceCore);
  const consentDisposition = input.consentDisposition ?? 'PERMITTED';
  const positive = ['PERMITTED', 'NARROWED'].includes(consentDisposition);
  const purposeRef = 'purpose.score.device-private-continuity';
  const implicatedSubjectRefs = ['person.test'];
  const permittedUseRefs = positive ? ['use.score.device-private-continuity'] : [];
  const prohibitedUseRefs = ['use.score.first-person'];
  const envelope = { candidateRef: candidate.candidateRef, candidateSha256: candidate.candidateSha256,
    semanticSubjectRef: candidate.semanticSubjectRef, semanticSubjectFingerprint: candidate.semanticSubjectFingerprint,
    purposeRef, privacyClass: 'DEVICE_PRIVATE', implicatedSubjectRefs, permittedUseRefs, prohibitedUseRefs,
    retentionBoundaryRef: 'retention.score.device-private', redisclosureBoundaryRef: 'redisclosure.score.not-admitted',
    firstPersonBoundaryRef: 'boundary.score.first-person.not-admitted' };
  const scope = scopeFingerprint(envelope);
  const authorityCore = { authorityRef: `authority.g03.${input.ordinal ?? 1}`, subjectRef: 'person.test', purposeRef, scopeFingerprint: scope,
    disposition: positive ? consentDisposition : 'UNKNOWN', formedAt: '2026-08-07T09:10:02.000Z', expiresAt: null };
  const authority = { ...authorityCore, authoritySha256: authorityHash(authorityCore) };
  const consentCore = { schemaVersion: 'vextreme.score-consent-disposition/v1', ...envelope,
    requiredAuthorityBindings: positive ? [authority] : [], observedAuthorityBindings: positive ? [structuredClone(authority)] : [],
    disposition: consentDisposition, formedAt: '2026-08-07T09:10:02.000Z', expiresAt: null,
    issuerRef: 'role.multivex.safety.fixture-owner', issuerClass: 'BOUNDED_TEST_OWNER_PROJECTION',
    ownerProjectRef: 'project.multivex.safety', ownerDispositionRef: 'github.issue.vextreme-sdk.226.comment.5217090896',
    sourceEvidenceBindings: [{ sourceRef: evidence.classificationEvidenceRef, sourceSha256: evidence.classificationEvidenceSha256 }] };
  const consent = addressed('score-consent-disposition', 'consentDispositionRef', 'consentDispositionSha256', consentCore);
  const acceptedForContinuity = input.acceptedForContinuity ?? positive;
  const acceptanceCore = { schemaVersion: 'vextreme.score-semantic-acceptance/v1', contractRef: SCORE_CONTEXT_LIVE_SEMANTIC_CONTRACT,
    semanticContractDispositionRef: SCORE_CONTEXT_LIVE_SEMANTIC_DISPOSITION, semanticExecutableAddendumRef: SCORE_CONTEXT_LIVE_SEMANTIC_EXECUTABLE_ADDENDUM,
    candidateRef: candidate.candidateRef, candidateSha256: candidate.candidateSha256, sourceLineageRef: candidate.sourceLineageRef,
    sourceThreadRef: candidate.sourceThreadRef, sourceConversationHeadSha256: candidate.sourceConversationHeadSha256,
    sourceBindingHashes: candidate.sourceBindings.map((binding) => binding.eventHash), semanticSubjectRef: candidate.semanticSubjectRef,
    semanticSubjectFingerprint: candidate.semanticSubjectFingerprint, acceptedSummary: summary, acceptedSummarySha256: semanticHash(summary),
    memoryRelation, statementState, acceptedForContinuity, transitionKind: 'NONE', transitionTargetRef: null,
    transitionTargetAcceptanceSha256: null, classificationEvidenceBindings: [{ classificationEvidenceRef: evidence.classificationEvidenceRef,
      classificationEvidenceSha256: evidence.classificationEvidenceSha256 }], consentDispositionRef: consent.consentDispositionRef,
    consentDispositionSha256: consent.consentDispositionSha256, issuerRef: 'role.multivex.main-vex.fixture-owner',
    issuerClass: 'BOUNDED_TEST_SHARED_SEMANTIC_PROJECTION', ownerDispositionRef: SCORE_CONTEXT_LIVE_SEMANTIC_EXECUTABLE_ADDENDUM,
    formedAt: '2026-08-07T09:10:03.000Z', privacyClass: 'DEVICE_PRIVATE' };
  const acceptance = addressed('score-semantic-acceptance', 'acceptanceRef', 'acceptanceSha256', acceptanceCore);
  writeJson(path.join(authorityDir(ids, 'candidates'), `${candidate.candidateSha256}.json`), candidate);
  writeJson(path.join(authorityDir(ids, 'classification-evidence'), `${evidence.classificationEvidenceSha256}.json`), evidence);
  writeJson(path.join(authorityDir(ids, 'consents'), `${consent.consentDispositionSha256}.json`), consent);
  writeJson(path.join(authorityDir(ids, 'acceptances'), `${acceptance.acceptanceSha256}.json`), acceptance);
  const prior = currentAuthorityHead(ids);
  const binding = { semanticSubjectFingerprint: candidate.semanticSubjectFingerprint, acceptanceRef: acceptance.acceptanceRef,
    acceptanceSha256: acceptance.acceptanceSha256, candidateRef: candidate.candidateRef, candidateSha256: candidate.candidateSha256,
    classificationEvidenceBindings: structuredClone(acceptance.classificationEvidenceBindings), consentDispositionRef: consent.consentDispositionRef,
    consentDispositionSha256: consent.consentDispositionSha256 };
  const currentAcceptanceBindings = [...(prior?.currentAcceptanceBindings ?? []).filter((item) => item.semanticSubjectFingerprint !== candidate.semanticSubjectFingerprint), binding]
    .sort((a,b) => a.semanticSubjectFingerprint.localeCompare(b.semanticSubjectFingerprint));
  const headCore = { schemaVersion: 'vextreme.score-semantic-authority-head/v1', sourceLineageRef: ids.companionLineageRef,
    sourceThreadRef: ids.threadRef, sequence: prior ? prior.sequence + 1 : 0, priorSemanticAuthorityHeadSha256: prior?.semanticAuthorityHeadSha256 ?? null,
    currentAcceptanceBindings, formedAt: `2026-08-07T09:10:${String(4 + (prior?.sequence ?? 0)).padStart(2,'0')}.000Z`,
    contractRef: SCORE_CONTEXT_LIVE_SEMANTIC_CONTRACT, semanticExecutableAddendumRef: SCORE_CONTEXT_LIVE_SEMANTIC_EXECUTABLE_ADDENDUM,
    ownerRefs: ['project.multivex.memory','project.multivex.safety'] };
  const head = addressed('score-semantic-authority-head','semanticAuthorityHeadRef','semanticAuthorityHeadSha256',headCore);
  writeJson(path.join(authorityDir(ids,'heads'),`${head.semanticAuthorityHeadSha256}.json`),head);
  writeJson(authorityDir(ids,'head.json'),head);
  return { candidate, evidence, consent, acceptance, head };
}

function appendStatement(ids, authority, statementRef) {
  const state = loadScoreContextState(ids);
  return appendScoreStatement({ ...ids, expectedScoreHeadSha256: state.head?.scoreHeadSha256 ?? null, statementRef,
    semanticAcceptanceRef: authority.acceptance.acceptanceRef, semanticAcceptanceSha256: authority.acceptance.acceptanceSha256 });
}

function canonicalProofTempRoot() {
  const requested = path.resolve(os.tmpdir());
  try {
    return fs.realpathSync.native(requested);
  } catch {
    return requested;
  }
}

export function createDailyMemoryDreamFixture(prefix = 'proof', homeOverride = null) {
  const home = homeOverride ? path.resolve(homeOverride) : path.join(fs.mkdtempSync(path.join(canonicalProofTempRoot(), `vexlife-g03-${prefix}-`)), 'home');
  if (homeOverride) fs.rmSync(home, { recursive: true, force: true });
  const ids = { home, homeRef: `home.g03.${prefix}`, familyRef: `family.g03.${prefix}`, deviceRef: `device.g03.${prefix}`,
    companionLineageRef: `lineage.g03.${prefix}`, threadRef: `thread.g03.${prefix}`, instanceRef: `instance.g03.${prefix}` };
  initializeLivedCompanionHome({ home, ...ids });
  const first = commitG01Turn(ids, null, 1); const second = commitG01Turn(ids, first, 2); const g01 = { first, second, head: second.head };
  const activeAuthority = seedScoreAuthority(ids, g01, { ordinal: 1, summary: 'Accepted active continuity.', consentDisposition: 'PERMITTED', acceptedForContinuity: true });
  appendStatement(ids, activeAuthority, 'statement.g03.active');
  const heldAuthority = seedScoreAuthority(ids, g01, { ordinal: 2, subjectRef: 'subject.g03.held', summary: 'Held unresolved continuity.', statementState: 'UNKNOWN',
    memoryRelation: 'DISPUTED_OR_UNRESOLVED', consentDisposition: 'UNKNOWN', acceptedForContinuity: false });
  appendStatement(ids, heldAuthority, 'statement.g03.held');
  const score = loadScoreContextState(ids);
  appendOpenLoop({ ...ids, expectedScoreHeadSha256: score.head.scoreHeadSha256, sourceConversationHeadSha256: g01.head.conversationHeadSha256,
    openLoopRef: 'loop.g03.one', openLoopState: 'OPEN', summaryRef: 'summary.g03.loop', sourceStatementRefs: ['statement.g03.held'],
    sourceEvents: [g01.second.requestEvent, g01.second.responseEvent] });
  return { ids, g01, score: loadScoreContextState(ids), privateNeedles: ['private human source 1','private human source 2','private vex source 1','private vex source 2'] };
}

function commitInput(fixture, overrides = {}) {
  const state = loadDailyMemoryDreamState(fixture.ids);
  return { ...fixture.ids, instanceRef: overrides.instanceRef ?? fixture.ids.instanceRef, restInvocationAuthorityRef: overrides.restInvocationAuthorityRef ?? 'authority.manual.g03.proof',
    dayRef: overrides.dayRef ?? 'day.g03.000', dayIndex: overrides.dayIndex ?? 0, calendarDateRef: overrides.calendarDateRef ?? '2026-08-07',
    timeZoneRef: overrides.timeZoneRef ?? 'America/Los_Angeles', observedAt: overrides.observedAt ?? '2026-08-07T21:00:00.000Z',
    expectedConversationHeadSha256: overrides.expectedConversationHeadSha256 ?? fixture.g01.head.conversationHeadSha256,
    expectedScoreHeadSha256: overrides.expectedScoreHeadSha256 ?? fixture.score.head.scoreHeadSha256,
    expectedDailyDreamHeadSha256: Object.hasOwn(overrides,'expectedDailyDreamHeadSha256') ? overrides.expectedDailyDreamHeadSha256 : (state.head?.dailyDreamHeadSha256 ?? null),
    faults: overrides.faults };
}

function cloneFixture(source, suffix) {
  const target = path.join(fs.mkdtempSync(path.join(canonicalProofTempRoot(), `vexlife-g03-${suffix}-`)), 'home');
  fs.cpSync(source.ids.home, target, { recursive: true });
  const ids = { ...source.ids, home: target, instanceRef: `instance.g03.${suffix}` };
  return { ids, g01: structuredClone(source.g01), score: structuredClone(source.score), privateNeedles: source.privateNeedles };
}

function trySymlinkAliasProof(fixture) {
  const committed = commitDailyMemoryDream(commitInput(fixture));
  const stratumFile = path.join(fixture.ids.home,'daily-memory-dream',fixture.ids.companionLineageRef,fixture.ids.threadRef,'strata',`${committed.stratum.dailyStratumSha256}.json`);
  const external = path.join(path.dirname(fixture.ids.home), 'external-stratum.json');
  fs.copyFileSync(stratumFile, external); fs.unlinkSync(stratumFile);
  try { fs.symlinkSync(external, stratumFile, 'file'); }
  catch (error) { return { supported: false, rejected: null, reason: error.code ?? error.message }; }
  try { loadDailyMemoryDreamState(fixture.ids); return { supported: true, rejected: false }; }
  catch (error) { return { supported: true, rejected: ['DREAM_RECEIPT_CORRUPT','DREAM_HOME_IDENTITY_MISMATCH'].includes(error.code), code: error.code }; }
}

export function runDailyMemoryDreamProof() {
  const fixture = createDailyMemoryDreamFixture('proof', process.env.VEXLIFE_G03_PROOF_HOME ?? null);
  const before = loadDailyMemoryDreamState(fixture.ids);
  const committed = commitDailyMemoryDream(commitInput(fixture));
  const after = loadDailyMemoryDreamState(fixture.ids);
  const projection = projectDailyMemoryDream(fixture.ids);
  const descent = sourceDescentForDailyStratum(fixture.ids);
  const rawText = JSON.stringify(after.currentDailyStratum);
  const exactDuplicate = commitDailyMemoryDream(commitInput(fixture, { expectedDailyDreamHeadSha256: null }));
  const changedSameDayCases = [
    { calendarDateRef:'2026-08-08' },
    { observedAt:'2026-08-07T21:00:01.000Z' },
    { restInvocationAuthorityRef:'authority.manual.g03.changed' },
    { expectedScoreHeadSha256:'a'.repeat(64) }
  ];
  const changedSameDayRejected = changedSameDayCases.every((changes) => {
    try { commitDailyMemoryDream({ ...commitInput(fixture, changes), expectedDailyDreamHeadSha256:null }); return false; }
    catch (e) { return e.code === 'DREAM_DAY_CONFLICT'; }
  });
  let staleG01Rejected = false; try { commitDailyMemoryDream(commitInput(fixture,{ dayRef:'day.g03.next',dayIndex:1,calendarDateRef:'2026-08-08',observedAt:'2026-08-08T21:00:00.000Z',expectedConversationHeadSha256:'a'.repeat(64) })); } catch (e) { staleG01Rejected = e.code === 'DREAM_SOURCE_STALE'; }
  let staleG02Rejected = false; try { commitDailyMemoryDream(commitInput(fixture,{ dayRef:'day.g03.next',dayIndex:1,calendarDateRef:'2026-08-08',observedAt:'2026-08-08T21:00:00.000Z',expectedScoreHeadSha256:'b'.repeat(64) })); } catch (e) { staleG02Rejected = e.code === 'DREAM_SOURCE_STALE'; }

  const crash = cloneFixture(fixture,'crash');
  const crashArgs = [fileURLToPath(import.meta.url),'--crash-child',JSON.stringify(commitInput(crash,{ dayRef:'day.g03.crash',dayIndex:1,calendarDateRef:'2026-08-08',observedAt:'2026-08-08T22:00:00.000Z',instanceRef:'instance.g03.crash.child',faults:{exitAfterStratumWrite:true} }))];
  const child = spawnSync(process.execPath, crashArgs, { cwd: path.resolve(HERE,'..'), encoding:'utf8' });
  const crashState = loadDailyMemoryDreamState(crash.ids);
  let abandonedWriterRecovered = false;
  let crashTailExactRetryCommitted = false;
  let crashTailClearedAfterRecovery = false;
  try {
    const recovery = recoverAbandonedDailyMemoryDreamWriter({ ...crash.ids, expectedAbandonedInstanceRef:'instance.g03.crash.child' });
    abandonedWriterRecovered = recovery.recovered === true;
    const completed = commitDailyMemoryDream({ ...JSON.parse(crashArgs[2]), instanceRef:'instance.g03.crash.recovery', faults:{} });
    crashTailExactRetryCommitted = completed.state === 'COMMITTED';
    const recoveredState = loadDailyMemoryDreamState(crash.ids);
    crashTailClearedAfterRecovery = recoveredState.chain.length === 2 && recoveredState.uncommittedTail.length === 0 && recoveredState.writer.state === 'NONE';
  } catch {}
  const symlink = trySymlinkAliasProof(cloneFixture(createDailyMemoryDreamFixture('symlink-source'),'symlink'));
  const moduleText = fs.readFileSync(path.resolve(HERE,'../src/core/daily-memory-dream.mjs'),'utf8');
  const receipt = {
    schemaVersion: 'vexlife.g03-daily-memory-only-dream-proof/v1', state:'PASS', currentness:'CURRENT', candidateHeadSha: process.env.VEXLIFE_CANDIDATE_HEAD_SHA ?? null, contractRef: DAILY_MEMORY_DREAM_CONTRACT,
    memoryOwnerRef: DAILY_MEMORY_DREAM_MEMORY_OWNER, safetyOwnerRef: DAILY_MEMORY_DREAM_SAFETY_OWNER, mainVexConvergenceRef: DAILY_MEMORY_DREAM_MAIN_VEX_CONVERGENCE,
    exactG01HeadPinned: committed.preDream.sourceConversationHeadSha256 === fixture.g01.head.conversationHeadSha256,
    exactG02HeadPinned: committed.preDream.sourceScoreHeadSha256 === fixture.score.head.scoreHeadSha256,
    preRestOrientationBoundBeforeClosure: committed.closure.preDreamStateSha256 === committed.preDream.preDreamStateSha256 && committed.preDream.orientationSha256 === committed.orientation.orientationSha256,
    scoreFieldsCarriedWithoutReclassification: committed.consolidation.carriedCurrentScoreBindings.length === 1 && committed.consolidation.carriedCurrentScoreBindings[0].statementRef === 'statement.g03.active',
    heldMaterialPreservedWithoutPromotion: committed.consolidation.heldOrDeferredScoreBindings.length === 1 && committed.consolidation.heldOrDeferredScoreBindings[0].acceptedForContinuity === false,
    allOpenLoopsCarryForwardOpen: committed.consolidation.openLoopCarryForwardBindings.length === 1 && committed.consolidation.openLoopCarryForwardBindings[0].state === 'OPEN',
    rawG01BodyCopiedIntoDreamStore: fixture.privateNeedles.some((needle)=>rawText.includes(needle)),
    referenceOnlyConsolidation: committed.consolidation.referenceLevelOnly === true && committed.consolidation.newSemanticAcceptanceCreated === false,
    runtimeUnchanged: committed.postDream.selectedRuntimeRef === committed.postDream.preDreamRuntimeRef && committed.wake.selectedRuntimeRef === committed.wake.preDreamRuntimeRef,
    modelProfileUnchanged: committed.postDream.selectedModelProfileRef === committed.postDream.preDreamModelProfileRef && committed.wake.selectedModelProfileRef === committed.wake.preDreamModelProfileRef,
    modelWeightsChanged: projection.modelWeightsChanged,
    trainingRan: projection.trainingRan,
    rhythmLearned: projection.rhythmLearned,
    synchronizationActivated: projection.synchronizationActivated,
    freshProcessReplayReady: after.head.dailyDreamHeadSha256 === committed.head.dailyDreamHeadSha256 && descent.dailyStratumSha256 === committed.stratum.dailyStratumSha256,
    crashExitObserved: child.status === 93,
    crashTailLeftPriorFrontierCurrent: crashState.head?.dailyDreamHeadSha256 === committed.head.dailyDreamHeadSha256 && crashState.uncommittedTail.length === 1,
    abandonedWriterRecovered,
    crashTailExactRetryCommitted,
    crashTailClearedAfterRecovery,
    symlinkAliasTestSupported: symlink.supported,
    symlinkAliasRejected: symlink.rejected,
    canonicalFinalFileAliasGuardPresent: moduleText.includes('must be one regular canonical file') && moduleText.includes('is not its canonical file identity'),
    exactDuplicateDayIdempotent: exactDuplicate.state === 'IDEMPOTENT_REPLAY',
    changedSameDayRejected,
    staleG01Rejected,
    staleG02Rejected,
    firstPersonAuthorityGranted: projection.firstPersonAuthorityGranted,
    lineageAwareGenerativeDreamRan: projection.lineageAwareGenerativeDreamRan,
    poweredDown: projection.poweredDown,
    publicationPerformed: projection.publicationPerformed,
    initialDreamHeadWasNull: before.head === null
  };
  const requiredTrue = ['exactG01HeadPinned','exactG02HeadPinned','preRestOrientationBoundBeforeClosure','scoreFieldsCarriedWithoutReclassification','heldMaterialPreservedWithoutPromotion','allOpenLoopsCarryForwardOpen','referenceOnlyConsolidation','runtimeUnchanged','modelProfileUnchanged','freshProcessReplayReady','crashExitObserved','crashTailLeftPriorFrontierCurrent','abandonedWriterRecovered','crashTailExactRetryCommitted','crashTailClearedAfterRecovery','canonicalFinalFileAliasGuardPresent','exactDuplicateDayIdempotent','changedSameDayRejected','staleG01Rejected','staleG02Rejected','initialDreamHeadWasNull'];
  const requiredFalse = ['rawG01BodyCopiedIntoDreamStore','modelWeightsChanged','trainingRan','rhythmLearned','synchronizationActivated','firstPersonAuthorityGranted','lineageAwareGenerativeDreamRan','poweredDown','publicationPerformed'];
  const failed = [...requiredTrue.filter((key)=>receipt[key] !== true), ...requiredFalse.filter((key)=>receipt[key] !== false)];
  if (receipt.symlinkAliasTestSupported === true && receipt.symlinkAliasRejected !== true) failed.push('symlinkAliasRejected');
  if (failed.length) throw new Error(`G03 proof failed: ${failed.join(', ')}`);
  return receipt;
}

if (process.argv[2] === '--crash-child') {
  const input = JSON.parse(process.argv[3]);
  commitDailyMemoryDream(input);
  process.exit(94);
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  const receipt = runDailyMemoryDreamProof();
  const output = path.resolve(process.env.VEXLIFE_G03_PROOF_RECEIPT ?? path.join(process.cwd(),'generated','health','g03-daily-memory-dream-proof.json'));
  writeJson(output, receipt);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

// [VXG RealForever]
