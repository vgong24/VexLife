import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { semanticHash } from '../src/core/utils.mjs';
import { initializeLivedCompanionHome } from '../src/core/lived-companion.mjs';
import {
  SCORE_CONTEXT_MEMORY_RELATIONS,
  SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION,
  SCORE_CONTEXT_LIVE_SEMANTIC_CONTRACT,
  SCORE_CONTEXT_LIVE_SEMANTIC_DISPOSITION,
  SCORE_CONTEXT_LIVE_SEMANTIC_EXECUTABLE_ADDENDUM,
  SCORE_CONTEXT_STATEMENT_STATES,
  appendOpenLoop,
  appendScoreStatement,
  createScoreSemanticCandidate,
  createFirstPersonEligibilityEvidence,
  evaluateFirstPersonEligibility,
  loadScoreContextState,
  projectScoreContext,
  sourceDescentForStatement
} from '../src/core/score-context-continuity.mjs';

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function tempHome() {
  const home = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-g02-test-')), 'home');
  const ids = {
    homeRef: 'home.g02.test', familyRef: 'family.g02.test', deviceRef: 'device.g02.test',
    companionLineageRef: 'lineage.g02.test', threadRef: 'thread.g02.test', instanceRef: 'instance.g02.test'
  };
  initializeLivedCompanionHome({ home, ...ids });
  return { home, ...ids };
}

function formEvent(core) {
  return { ...core, eventHash: semanticHash(core) };
}

function commitG01Turn(ids, prior, ordinal) {
  const sequence = prior?.head?.sequence === undefined ? 0 : prior.head.sequence + 1;
  const turnRef = `turn.g01.test.${ordinal}`;
  const instanceRef = `instance.g01.test.${ordinal}`;
  const requestCore = {
    schemaVersion: 'vexlife.lived-companion-event/v1',
    eventRef: `event.g01.request.${ordinal}`,
    eventKind: 'REQUEST',
    homeRef: ids.homeRef,
    deviceRef: ids.deviceRef,
    companionLineageRef: ids.companionLineageRef,
    instanceRef,
    threadRef: ids.threadRef,
    channelRef: 'channel.g02.test',
    turnRef,
    messageRef: `message.g01.request.${ordinal}`,
    speakerRef: 'person.test',
    recipientRefs: ['vex.test'],
    sequence,
    priorEventHash: prior?.responseEvent?.eventHash ?? null,
    content: `human committed source ${ordinal}`,
    contentHash: semanticHash(`human committed source ${ordinal}`),
    privacyClass: 'DEVICE_PRIVATE',
    formedAt: `2026-08-07T09:0${ordinal}:00.000Z`
  };
  const requestEvent = formEvent(requestCore);
  const responseCore = {
    schemaVersion: 'vexlife.lived-companion-event/v1',
    eventRef: `event.g01.response.${ordinal}`,
    eventKind: 'RESPONSE',
    homeRef: ids.homeRef,
    deviceRef: ids.deviceRef,
    companionLineageRef: ids.companionLineageRef,
    instanceRef,
    threadRef: ids.threadRef,
    channelRef: 'channel.g02.test',
    turnRef,
    messageRef: `message.g01.response.${ordinal}`,
    speakerRef: 'vex.test',
    recipientRefs: ['person.test'],
    sequence: sequence + 1,
    priorEventHash: requestEvent.eventHash,
    content: `vex committed response ${ordinal}`,
    contentHash: semanticHash(`vex committed response ${ordinal}`),
    endpointProfileRef: 'endpoint.g01.loopback',
    sanitizedEndpointOrigin: 'http://127.0.0.1:43210',
    modelNameOrBoundedTestProfileRef: 'g01-bounded-test',
    privacyClass: 'DEVICE_PRIVATE',
    formedAt: `2026-08-07T09:0${ordinal}:01.000Z`
  };
  const responseEvent = formEvent(responseCore);
  const eventDir = path.join(ids.home, 'conversations', ids.companionLineageRef, ids.threadRef, 'events');
  writeJson(path.join(eventDir, `${String(requestEvent.sequence).padStart(8, '0')}-${requestEvent.eventHash}.json`), requestEvent);
  writeJson(path.join(eventDir, `${String(responseEvent.sequence).padStart(8, '0')}-${responseEvent.eventHash}.json`), responseEvent);

  const contextCore = {
    schemaVersion: 'vexlife.lived-companion-context/v1',
    homeRef: ids.homeRef,
    deviceRef: ids.deviceRef,
    companionLineageRef: ids.companionLineageRef,
    instanceRef,
    threadRef: ids.threadRef,
    turnRef,
    contextSourceRefs: [requestEvent.eventRef, responseEvent.eventRef],
    requestEventHash: requestEvent.eventHash,
    responseEventHash: responseEvent.eventHash,
    privacyClass: 'DEVICE_PRIVATE',
    formedAt: `2026-08-07T09:0${ordinal}:02.000Z`
  };
  const contextRecord = { ...contextCore, serializedContextSha256: semanticHash(contextCore) };
  const contextPath = path.join(ids.home, 'context', ids.companionLineageRef, ids.threadRef, `${turnRef}.json`);
  writeJson(contextPath, contextRecord);
  const headCore = {
    schemaVersion: 'vexlife.lived-companion-head/v1',
    homeRef: ids.homeRef,
    deviceRef: ids.deviceRef,
    companionLineageRef: ids.companionLineageRef,
    instanceRef,
    threadRef: ids.threadRef,
    turnRef,
    requestMessageRef: requestEvent.messageRef,
    responseMessageRef: responseEvent.messageRef,
    eventHash: responseEvent.eventHash,
    contextSha256: contextRecord.serializedContextSha256,
    contextPath: path.relative(ids.home, contextPath).replaceAll('\\', '/'),
    sequence: responseEvent.sequence,
    priorConversationHeadSha256: prior?.head?.conversationHeadSha256 ?? null,
    formedAt: `2026-08-07T09:0${ordinal}:03.000Z`
  };
  const head = { ...headCore, conversationHeadSha256: semanticHash(headCore) };
  writeJson(path.join(ids.home, 'conversations', ids.companionLineageRef, ids.threadRef, 'head.json'), head);
  return { requestEvent, responseEvent, contextRecord, head };
}

function committedG01(ids) {
  const first = commitG01Turn(ids, null, 1);
  const second = commitG01Turn(ids, first, 2);
  return { first, second, head: second.head };
}

function addressed(prefix, refField, hashField, preRefCore) {
  const ref = `${prefix}.${semanticHash(preRefCore).slice(0, 32)}`;
  const core = { ...preRefCore, [refField]: ref };
  return { ...core, [hashField]: semanticHash(core) };
}

function sourceBinding(event) {
  return {
    eventRef: event.eventRef,
    eventHash: event.eventHash,
    eventKind: event.eventKind,
    sequence: event.sequence,
    turnRef: event.turnRef,
    messageRef: event.messageRef,
    contentHash: event.contentHash
  };
}

function semanticAuthorityDir(ids, leaf) {
  return path.join(ids.home, 'semantic-authority', 'score', ids.companionLineageRef, ids.threadRef, leaf);
}

function readCurrentSemanticHead(ids) {
  const file = semanticAuthorityDir(ids, 'head.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function classificationEvidenceClass(statementState) {
  return {
    OBSERVED: 'STRUCTURAL_OBSERVATION',
    HUMAN_CONFIRMED: 'HUMAN_CONFIRMATION',
    INFERRED: 'LINEAGE_INFERENCE',
    CONFLICTED: 'CONFLICT_PRESERVATION',
    UNKNOWN: 'UNKNOWN_HOLD',
    RELEASED_OR_TOMBSTONED: 'RELEASE_TOMBSTONE_AUTHORITY'
  }[statementState];
}

function transitionEvidenceClass(transitionKind) {
  return transitionKind === 'CORRECTS' ? 'CORRECTION_ACCEPTANCE'
    : transitionKind === 'SUPERSEDES' ? 'SUPERSESSION_ACCEPTANCE'
      : transitionKind === 'RELEASES_OR_TOMBSTONES' ? 'RELEASE_TOMBSTONE_AUTHORITY' : null;
}

function seedSemanticAuthority(ids, g01, input = {}) {
  const source = input.source ?? g01.first;
  const sourceEvents = input.sourceEvents ?? [source.requestEvent, source.responseEvent];
  const sourceBindings = sourceEvents.map(sourceBinding);
  const semanticSubjectRef = input.subjectRef ?? 'subject.g02.one';
  const subjectScopeRef = input.subjectScopeRef ?? 'scope.score.thread';
  const proposedSummary = input.proposedSummary ?? input.summary ?? 'Source-bound accepted memory.';
  const acceptedSummary = input.acceptedSummary ?? input.summary ?? proposedSummary;
  const memoryRelation = input.memoryRelation ?? 'CURRENT_LINEAGE_AUTOBIOGRAPHY';
  const transitionKind = input.transitionKind ?? (input.correctsStatementRef ? 'CORRECTS'
    : input.supersedesStatementRef ? 'SUPERSEDES'
      : input.releasesOrTombstonesStatementRef ? 'RELEASES_OR_TOMBSTONES' : 'NONE');
  const statementState = input.statementState ?? (transitionKind === 'RELEASES_OR_TOMBSTONES' ? 'RELEASED_OR_TOMBSTONED' : 'HUMAN_CONFIRMED');
  const candidate = createScoreSemanticCandidate({
    sourceLineageRef: ids.companionLineageRef,
    sourceThreadRef: ids.threadRef,
    sourceConversationHeadSha256: input.sourceConversationHeadSha256 ?? g01.head.conversationHeadSha256,
    sourceBindings,
    semanticSubjectRef,
    subjectScopeRef,
    proposedSummary,
    proposedMemoryRelation: input.proposedMemoryRelation ?? memoryRelation,
    proposedStatementState: input.proposedStatementState ?? statementState,
    proposerRef: input.proposerRef ?? 'vex.test',
    proposerClass: input.proposerClass ?? 'LINEAGE',
    formedAt: input.candidateFormedAt ?? '2026-08-07T09:10:00.000Z'
  });

  const transitionTargetRef = input.transitionTargetRef ?? input.correctsStatementRef ?? input.supersedesStatementRef ?? input.releasesOrTombstonesStatementRef ?? null;
  const priorState = loadScoreContextState(ids);
  const priorStatement = transitionTargetRef ? priorState.statements.find((item) => item.statementRef === transitionTargetRef) : null;
  const transitionTargetAcceptanceSha256 = input.transitionTargetAcceptanceSha256 ?? priorStatement?.semanticAcceptanceSha256 ?? null;
  const sourceEvidenceBindings = input.sourceEvidenceBindings ?? candidate.sourceBindings.map((binding) => ({ sourceRef: binding.eventRef, sourceSha256: binding.eventHash }));

  function makeEvidence(evidenceClass, evidenceTransitionKind = 'NONE', ordinal = 1) {
    const isHuman = evidenceClass === 'HUMAN_CONFIRMATION';
    const evidenceCore = {
      schemaVersion: 'vextreme.score-classification-evidence/v1',
      candidateRef: candidate.candidateRef,
      candidateSha256: candidate.candidateSha256,
      semanticSubjectRef: candidate.semanticSubjectRef,
      semanticSubjectFingerprint: candidate.semanticSubjectFingerprint,
      evidenceClass,
      assertedMemoryRelation: memoryRelation,
      assertedStatementState: statementState,
      assertedSummarySha256: semanticHash(acceptedSummary),
      transitionKind: evidenceTransitionKind,
      transitionTargetRef: evidenceTransitionKind === 'NONE' ? null : transitionTargetRef,
      transitionTargetAcceptanceSha256: evidenceTransitionKind === 'NONE' ? null : transitionTargetAcceptanceSha256,
      issuerRef: input.classificationIssuerRef ?? 'role.multivex.memory.fixture-owner',
      issuerClass: input.classificationIssuerClass ?? 'BOUNDED_TEST_OWNER_PROJECTION',
      ownerProjectRef: 'project.multivex.memory',
      ownerDispositionRef: 'github.issue.vextreme-sdk.225.comment.5217085830',
      sourceEvidenceBindings,
      purposeRef: 'purpose.score.live-semantic-acceptance',
      formedAt: input.evidenceFormedAt ?? `2026-08-07T09:10:0${ordinal}.000Z`,
      privacyClass: 'DEVICE_PRIVATE',
      ...(isHuman ? {
        humanConfirmation: input.humanConfirmation ?? {
          humanSubjectRef: 'person.test',
          confirmationDispositionRef: 'confirmation.test.score',
          confirmationDispositionSha256: semanticHash({ candidateSha256: candidate.candidateSha256, summary: acceptedSummary, disposition: 'CONFIRMED' }),
          confirmedCandidateRef: candidate.candidateRef,
          confirmedCandidateSha256: candidate.candidateSha256,
          confirmedSemanticSubjectFingerprint: candidate.semanticSubjectFingerprint,
          confirmedSummarySha256: semanticHash(acceptedSummary),
          confirmedAt: '2026-08-07T09:10:01.000Z'
        }
      } : {})
    };
    return addressed('score-classification-evidence', 'classificationEvidenceRef', 'classificationEvidenceSha256', evidenceCore);
  }

  const primaryEvidenceClass = input.evidenceClass ?? classificationEvidenceClass(statementState);
  if (!primaryEvidenceClass) throw new Error(`No fixture evidence class for ${statementState}`);
  const evidence = [makeEvidence(primaryEvidenceClass, transitionKind === 'RELEASES_OR_TOMBSTONES' ? transitionKind : 'NONE', 1)];
  const transitionClass = transitionKind !== 'NONE' && transitionKind !== 'RELEASES_OR_TOMBSTONES' ? transitionEvidenceClass(transitionKind) : null;
  if (transitionClass) evidence.push(makeEvidence(transitionClass, transitionKind, 2));

  const consentDisposition = input.consentDisposition ?? 'PERMITTED';
  const purposeRef = input.consentPurposeRef ?? 'purpose.score.device-private-continuity';
  const scopeFingerprint = semanticHash({ candidate: candidate.candidateSha256, purposeRef, privacyClass: 'DEVICE_PRIVATE' });
  const authorityBinding = {
    authorityRef: 'authority.test.score.continuity',
    authoritySha256: semanticHash({ authorityRef: 'authority.test.score.continuity', candidateSha256: candidate.candidateSha256, purposeRef }),
    subjectRef: 'person.test',
    purposeRef,
    scopeFingerprint,
    disposition: 'PERMITTED',
    formedAt: '2026-08-07T09:10:02.000Z',
    expiresAt: null
  };
  const requiredAuthorityBindings = input.requiredAuthorityBindings ?? (['PERMITTED', 'NARROWED'].includes(consentDisposition) ? [authorityBinding] : []);
  const observedAuthorityBindings = input.observedAuthorityBindings ?? (['PERMITTED', 'NARROWED'].includes(consentDisposition) ? structuredClone(requiredAuthorityBindings) : []);
  const consentCore = {
    schemaVersion: 'vextreme.score-consent-disposition/v1',
    candidateRef: candidate.candidateRef,
    candidateSha256: candidate.candidateSha256,
    semanticSubjectRef: candidate.semanticSubjectRef,
    semanticSubjectFingerprint: candidate.semanticSubjectFingerprint,
    purposeRef,
    privacyClass: 'DEVICE_PRIVATE',
    implicatedSubjectRefs: ['person.test'],
    requiredAuthorityBindings,
    observedAuthorityBindings,
    disposition: consentDisposition,
    permittedUseRefs: input.permittedUseRefs ?? (['PERMITTED', 'NARROWED'].includes(consentDisposition) ? ['use.score.device-private-continuity'] : []),
    prohibitedUseRefs: input.prohibitedUseRefs ?? ['use.score.first-person'],
    retentionBoundaryRef: 'retention.score.device-private',
    redisclosureBoundaryRef: 'redisclosure.score.not-admitted',
    firstPersonBoundaryRef: 'boundary.score.first-person.not-admitted',
    formedAt: input.consentFormedAt ?? '2026-08-07T09:10:02.000Z',
    expiresAt: null,
    issuerRef: 'role.multivex.safety.fixture-owner',
    issuerClass: 'BOUNDED_TEST_OWNER_PROJECTION',
    ownerProjectRef: 'project.multivex.safety',
    ownerDispositionRef: 'github.issue.vextreme-sdk.226.comment.5217090896',
    sourceEvidenceBindings: evidence.map((item) => ({ sourceRef: item.classificationEvidenceRef, sourceSha256: item.classificationEvidenceSha256 }))
  };
  const consent = addressed('score-consent-disposition', 'consentDispositionRef', 'consentDispositionSha256', consentCore);

  const acceptedForContinuity = input.acceptedForContinuity ?? ['PERMITTED', 'NARROWED'].includes(consentDisposition);
  const acceptanceCore = {
    schemaVersion: 'vextreme.score-semantic-acceptance/v1',
    contractRef: SCORE_CONTEXT_LIVE_SEMANTIC_CONTRACT,
    semanticContractDispositionRef: SCORE_CONTEXT_LIVE_SEMANTIC_DISPOSITION,
    semanticExecutableAddendumRef: SCORE_CONTEXT_LIVE_SEMANTIC_EXECUTABLE_ADDENDUM,
    candidateRef: candidate.candidateRef,
    candidateSha256: candidate.candidateSha256,
    sourceLineageRef: candidate.sourceLineageRef,
    sourceThreadRef: candidate.sourceThreadRef,
    sourceConversationHeadSha256: candidate.sourceConversationHeadSha256,
    sourceBindingHashes: candidate.sourceBindings.map((binding) => binding.eventHash),
    semanticSubjectRef: candidate.semanticSubjectRef,
    semanticSubjectFingerprint: candidate.semanticSubjectFingerprint,
    acceptedSummary,
    acceptedSummarySha256: semanticHash(acceptedSummary),
    memoryRelation,
    statementState,
    acceptedForContinuity,
    transitionKind,
    transitionTargetRef,
    transitionTargetAcceptanceSha256,
    classificationEvidenceBindings: evidence.map((item) => ({
      classificationEvidenceRef: item.classificationEvidenceRef,
      classificationEvidenceSha256: item.classificationEvidenceSha256
    })),
    consentDispositionRef: consent.consentDispositionRef,
    consentDispositionSha256: consent.consentDispositionSha256,
    issuerRef: 'role.multivex.main-vex.fixture-owner',
    issuerClass: 'BOUNDED_TEST_SHARED_SEMANTIC_PROJECTION',
    ownerDispositionRef: SCORE_CONTEXT_LIVE_SEMANTIC_EXECUTABLE_ADDENDUM,
    formedAt: input.acceptanceFormedAt ?? '2026-08-07T09:10:03.000Z',
    privacyClass: 'DEVICE_PRIVATE'
  };
  const acceptance = addressed('score-semantic-acceptance', 'acceptanceRef', 'acceptanceSha256', acceptanceCore);

  writeJson(path.join(semanticAuthorityDir(ids, 'candidates'), `${candidate.candidateSha256}.json`), candidate);
  for (const item of evidence) writeJson(path.join(semanticAuthorityDir(ids, 'classification-evidence'), `${item.classificationEvidenceSha256}.json`), item);
  writeJson(path.join(semanticAuthorityDir(ids, 'consents'), `${consent.consentDispositionSha256}.json`), consent);
  writeJson(path.join(semanticAuthorityDir(ids, 'acceptances'), `${acceptance.acceptanceSha256}.json`), acceptance);

  const previousHead = readCurrentSemanticHead(ids);
  const previousBindings = previousHead?.currentAcceptanceBindings ?? [];
  const binding = {
    semanticSubjectFingerprint: candidate.semanticSubjectFingerprint,
    acceptanceRef: acceptance.acceptanceRef,
    acceptanceSha256: acceptance.acceptanceSha256,
    candidateRef: candidate.candidateRef,
    candidateSha256: candidate.candidateSha256,
    classificationEvidenceBindings: structuredClone(acceptance.classificationEvidenceBindings),
    consentDispositionRef: consent.consentDispositionRef,
    consentDispositionSha256: consent.consentDispositionSha256
  };
  const currentAcceptanceBindings = [
    ...previousBindings.filter((item) => item.semanticSubjectFingerprint !== candidate.semanticSubjectFingerprint),
    binding
  ].sort((a, b) => a.semanticSubjectFingerprint.localeCompare(b.semanticSubjectFingerprint));
  const headCore = {
    schemaVersion: 'vextreme.score-semantic-authority-head/v1',
    sourceLineageRef: ids.companionLineageRef,
    sourceThreadRef: ids.threadRef,
    sequence: previousHead ? previousHead.sequence + 1 : 0,
    priorSemanticAuthorityHeadSha256: previousHead?.semanticAuthorityHeadSha256 ?? null,
    currentAcceptanceBindings,
    formedAt: input.headFormedAt ?? `2026-08-07T09:10:${String(4 + (previousHead?.sequence ?? 0)).padStart(2, '0')}.000Z`,
    contractRef: SCORE_CONTEXT_LIVE_SEMANTIC_CONTRACT,
    semanticExecutableAddendumRef: SCORE_CONTEXT_LIVE_SEMANTIC_EXECUTABLE_ADDENDUM,
    ownerRefs: ['project.multivex.memory', 'project.multivex.safety']
  };
  const head = addressed('score-semantic-authority-head', 'semanticAuthorityHeadRef', 'semanticAuthorityHeadSha256', headCore);
  writeJson(path.join(semanticAuthorityDir(ids, 'heads'), `${head.semanticAuthorityHeadSha256}.json`), head);
  writeJson(semanticAuthorityDir(ids, 'head.json'), head);
  return { candidate, evidence, consent, acceptance, head };
}

function append(ids, g01, input = {}) {
  const state = loadScoreContextState(ids);
  const authority = input.authority ?? seedSemanticAuthority(ids, g01, input);
  return appendScoreStatement({
    ...ids,
    instanceRef: input.instanceRef ?? ids.instanceRef,
    expectedScoreHeadSha256: input.expectedScoreHeadSha256 ?? state.head?.scoreHeadSha256 ?? null,
    statementRef: input.statementRef ?? 'statement.g02.one',
    semanticAcceptanceRef: input.semanticAcceptanceRef ?? authority.acceptance.acceptanceRef,
    semanticAcceptanceSha256: input.semanticAcceptanceSha256 ?? authority.acceptance.acceptanceSha256,
    ...(input.semanticConvenience ?? {}),
    faults: input.faults
  });
}

function reformScoreEvent(event, changes = {}) {
  const core = structuredClone(event);
  delete core.scoreEventHash;
  delete core.scoreEventRef;
  Object.assign(core, changes);
  const scoreEventRef = `score-event.${semanticHash(core).slice(0, 32)}`;
  const finalCore = { ...core, scoreEventRef };
  return { ...finalCore, scoreEventHash: semanticHash(finalCore) };
}

test('G02 binds the exact accepted shared semantic disposition and closed vocabularies', () => {
  assert.equal(SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION, 'github.issue.vextreme-sdk.350.comment.5215288414');
  assert.equal(SCORE_CONTEXT_LIVE_SEMANTIC_CONTRACT, 'contract.multivex.score.live-semantic-acceptance.v1');
  assert.equal(SCORE_CONTEXT_LIVE_SEMANTIC_DISPOSITION, 'github.issue.vextreme-sdk.350.comment.5216924433');
  assert.equal(SCORE_CONTEXT_LIVE_SEMANTIC_EXECUTABLE_ADDENDUM, 'github.issue.vextreme-sdk.350.comment.5217097749');
  assert.deepEqual(SCORE_CONTEXT_MEMORY_RELATIONS, [
    'CURRENT_LINEAGE_AUTOBIOGRAPHY','SHARED_RELATIONSHIP_HISTORY','PREDECESSOR_WITNESS_HISTORY',
    'INHERITED_CONTEXT','EXTERNAL_EVIDENCE','DISPUTED_OR_UNRESOLVED'
  ]);
  assert.deepEqual(SCORE_CONTEXT_STATEMENT_STATES, [
    'OBSERVED','HUMAN_CONFIRMED','INFERRED','CONFLICTED','UNKNOWN','CORRECTED','SUPERSEDED','RELEASED_OR_TOMBSTONED'
  ]);
});

test('Score intake accepts exact committed G01 events and exact current G01 head only', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  const result = append(ids, g01);
  assert.equal(loadScoreContextState(ids).head.scoreHeadSha256, result.head.scoreHeadSha256);
  assert.throws(() => append(ids, g01, {
    statementRef: 'statement.g02.bad-head',
    sourceConversationHeadSha256: 'a'.repeat(64)
  }), (error) => error.code === 'SCORE_SOURCE_INVALID');
});

test('caller-fabricated self-hashed G01 event is rejected unless exact committed on-disk source', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  const fabricatedCore = { ...g01.first.requestEvent, content: 'fabricated but self-hashed' };
  delete fabricatedCore.eventHash;
  fabricatedCore.contentHash = semanticHash(fabricatedCore.content);
  const fabricated = { ...fabricatedCore, eventHash: semanticHash(fabricatedCore) };
  assert.throws(() => append(ids, g01, {
    sourceEvents: [fabricated, g01.first.responseEvent]
  }), (error) => error.code === 'SCORE_SOURCE_INVALID');
});

test('well-formed orphan G01 event on disk is not committed source authority', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  const orphanCore = {
    ...g01.second.requestEvent,
    eventRef: 'event.g01.orphan',
    sequence: 99,
    priorEventHash: g01.second.responseEvent.eventHash,
    turnRef: 'turn.g01.orphan',
    messageRef: 'message.g01.orphan',
    content: 'well formed orphan source'
  };
  delete orphanCore.eventHash;
  orphanCore.contentHash = semanticHash(orphanCore.content);
  const orphan = { ...orphanCore, eventHash: semanticHash(orphanCore) };
  const eventDir = path.join(ids.home, 'conversations', ids.companionLineageRef, ids.threadRef, 'events');
  writeJson(path.join(eventDir, `${String(orphan.sequence).padStart(8, '0')}-${orphan.eventHash}.json`), orphan);
  assert.throws(() => append(ids, g01, { sourceEvents: [orphan, g01.second.responseEvent] }),
    (error) => error.code === 'SCORE_SOURCE_INVALID');
});

test('committed Score replay fails typed when bound G01 source bytes are substituted', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  const file = path.join(ids.home, 'conversations', ids.companionLineageRef, ids.threadRef, 'events',
    `${String(g01.first.requestEvent.sequence).padStart(8, '0')}-${g01.first.requestEvent.eventHash}.json`);
  fs.writeFileSync(file, '{"schemaVersion":"substituted"}\n', 'utf8');
  assert.throws(() => loadScoreContextState(ids), (error) => error.code === 'SCORE_SOURCE_INVALID');
});

test('statement event commits only through atomic current Score head', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  const result = append(ids, g01);
  const state = loadScoreContextState(ids);
  assert.equal(state.head.scoreHeadSha256, result.head.scoreHeadSha256);
  assert.deepEqual(state.currentStatementRefs, ['statement.g02.one']);
  assert.equal(state.rawDurableEventEqualsCommittedCurrentScore, false);
});

test('correction and supersession preserve exact semantic subject/relation and prior evidence', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  append(ids, g01, { statementRef: 'statement.g02.two', correctsStatementRef: 'statement.g02.one', summary: 'Corrected source-bound memory.' });
  append(ids, g01, { statementRef: 'statement.g02.three', supersedesStatementRef: 'statement.g02.two', summary: 'Superseding source-bound memory.' });
  const state = loadScoreContextState(ids);
  assert.equal(state.statements.find((x) => x.statementRef === 'statement.g02.one').effectiveState, 'CORRECTED');
  assert.equal(state.statements.find((x) => x.statementRef === 'statement.g02.two').effectiveState, 'SUPERSEDED');
  assert.deepEqual(state.currentStatementRefs, ['statement.g02.three']);
});

test('cross-subject and cross-relation correction/supersession fail closed', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  assert.throws(() => append(ids, g01, {
    statementRef: 'statement.g02.cross-subject', subjectRef: 'subject.g02.other', correctsStatementRef: 'statement.g02.one'
  }), (error) => error.code === 'SCORE_LINK_INVALID');
  assert.throws(() => append(ids, g01, {
    statementRef: 'statement.g02.cross-relation', memoryRelation: 'INHERITED_CONTEXT', supersedesStatementRef: 'statement.g02.one'
  }), (error) => error.code === 'SCORE_LINK_INVALID');
});

test('open loop survives replay but G02 resolution remains held against coercive closure', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  const state = loadScoreContextState(ids);
  appendOpenLoop({ ...ids, instanceRef: 'instance.g02.loop', expectedScoreHeadSha256: state.head.scoreHeadSha256,
    sourceConversationHeadSha256: g01.head.conversationHeadSha256,
    sourceEvents: [g01.second.requestEvent, g01.second.responseEvent],
    openLoopRef: 'open-loop.g02.one', openLoopState: 'OPEN', summaryRef: 'summary.g02.open-loop',
    sourceStatementRefs: ['statement.g02.one'] });
  const replay = loadScoreContextState(ids);
  assert.deepEqual(replay.openLoopRefs, ['open-loop.g02.one']);
  assert.throws(() => appendOpenLoop({ ...ids, instanceRef: 'instance.g02.resolve', expectedScoreHeadSha256: replay.head.scoreHeadSha256,
    sourceConversationHeadSha256: g01.head.conversationHeadSha256,
    sourceEvents: [g01.second.requestEvent, g01.second.responseEvent], openLoopRef: 'open-loop.g02.one', openLoopState: 'RESOLVED',
    sourceStatementRefs: ['statement.g02.one'] }), (error) =>
      error.code === 'OPEN_LOOP_INVALID' && error.details?.exactNextSafeRoute === 'SOURCE_MANAGED_OPEN_LOOP_RESOLUTION_NOT_ADMITTED_IN_G02');
});

test('failure after event durability leaves prior head current and exact-next tail uncommitted', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  const prior = loadScoreContextState(ids).head.scoreHeadSha256;
  assert.throws(() => append(ids, g01, { statementRef: 'statement.g02.tail', summary: 'Uncommitted tail.', faults: { failAfterEventWrite: true } }));
  const state = loadScoreContextState(ids);
  assert.equal(state.head.scoreHeadSha256, prior);
  assert.equal(state.uncommittedTail.length, 1);
  assert.equal(state.uncommittedTail[0].statementRef, 'statement.g02.tail');
  assert.equal(state.state, 'CURRENT');
});

test('well-formed reordered/readdressed tail produces attention instead of uncommitted authority', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  assert.throws(() => append(ids, g01, { statementRef: 'statement.g02.tail', faults: { failAfterEventWrite: true } }));
  let state = loadScoreContextState(ids);
  const original = state.uncommittedTail[0];
  const eventDir = path.join(ids.home, 'score', ids.companionLineageRef, ids.threadRef, 'events');
  fs.unlinkSync(path.join(eventDir, `${String(original.sequence).padStart(8, '0')}-${original.scoreEventHash}.json`));
  const hostile = reformScoreEvent(original, { sequence: original.sequence + 7 });
  writeJson(path.join(eventDir, `${String(hostile.sequence).padStart(8, '0')}-${hostile.scoreEventHash}.json`), hostile);
  state = loadScoreContextState(ids);
  assert.equal(state.state, 'ATTENTION');
  assert.equal(state.uncommittedTail.length, 0);
  assert.ok(state.attention.some((item) => item.reason === 'REORDERED_OR_READRESSED_TAIL'));
});

test('well-formed source-substituted tail produces attention', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  assert.throws(() => append(ids, g01, { statementRef: 'statement.g02.tail', faults: { failAfterEventWrite: true } }));
  let state = loadScoreContextState(ids);
  const original = state.uncommittedTail[0];
  const eventDir = path.join(ids.home, 'score', ids.companionLineageRef, ids.threadRef, 'events');
  fs.unlinkSync(path.join(eventDir, `${String(original.sequence).padStart(8, '0')}-${original.scoreEventHash}.json`));
  const substitutedBindings = structuredClone(original.sourceBindings);
  substitutedBindings[0] = { ...substitutedBindings[0], eventRef: 'event.g01.substituted', eventHash: 'c'.repeat(64), contentHash: 'd'.repeat(64) };
  const hostile = reformScoreEvent(original, { sourceBindings: substitutedBindings });
  writeJson(path.join(eventDir, `${String(hostile.sequence).padStart(8, '0')}-${hostile.scoreEventHash}.json`), hostile);
  state = loadScoreContextState(ids);
  assert.equal(state.state, 'ATTENTION');
  assert.equal(state.uncommittedTail.length, 0);
  assert.ok(state.attention.some((item) => item.reason === 'SCORE_SOURCE_INVALID'));
});

test('source descent revalidates exact committed G01 evidence and never returns raw source', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  const state = loadScoreContextState(ids);
  const descent = sourceDescentForStatement(state, 'statement.g02.one');
  assert.equal(descent.rawSourceContentIncluded, false);
  assert.equal(descent.observedCurrentConversationHeadSha256, g01.head.conversationHeadSha256);
  assert.deepEqual(descent.observedCommittedSourceEventRefs, [g01.first.requestEvent.eventRef, g01.first.responseEvent.eventRef]);
});

test('G02 cannot mint first-person authority locally and autobiography remains attributed pending shared authority', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  const state = loadScoreContextState(ids);
  const result = evaluateFirstPersonEligibility(state, 'statement.g02.one');
  assert.equal(result.eligible, false);
  assert.equal(result.wordingMode, 'AUTOBIOGRAPHY_ATTRIBUTED_PENDING_AUTHORITY');
  assert.equal(result.evidenceState, 'SOURCE_MANAGED_FIRST_PERSON_AUTHORITY_NOT_ADMITTED');

  const statement = state.statements.find((item) => item.statementRef === 'statement.g02.one');
  const request = statement.sourceBindings.find((item) => item.eventKind === 'REQUEST');
  assert.throws(() => createFirstPersonEligibilityEvidence(state, 'statement.g02.one', {
    evidenceBindings: [
      { gate: 'CONSENT_PERMITTED', sourceEventHash: request.eventHash, issuerRef: 'person.test', disposition: 'PERMITTED' }
    ]
  }), (error) => error.code === 'FIRST_PERSON_EVIDENCE_INVALID' &&
    error.details?.exactNextSafeRoute === 'SOURCE_MANAGED_SHARED_FIRST_PERSON_EVIDENCE_CONTRACT_REQUIRED');

  const forged = {
    schemaVersion: 'vexlife.first-person-eligibility-evidence/v2',
    statementRef: 'statement.g02.one',
    currentness: 'CURRENT',
    evidenceBindings: [{ gate: 'CONSENT_PERMITTED', sourceEventHash: request.eventHash, disposition: 'PERMITTED' }],
    semanticFingerprint: semanticHash({ statementRef: 'statement.g02.one', claimed: 'PERMITTED' })
  };
  const forgedResult = evaluateFirstPersonEligibility(state, 'statement.g02.one', forged);
  assert.equal(forgedResult.eligible, false);
  assert.equal(forgedResult.suppliedEvidenceIgnored, true);
});

test('non-autobiographical relations remain attributed while positive first-person authority is held', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01, { memoryRelation: 'PREDECESSOR_WITNESS_HISTORY' });
  const state = loadScoreContextState(ids);
  const result = evaluateFirstPersonEligibility(state, 'statement.g02.one');
  assert.equal(result.eligible, false);
  assert.equal(result.wordingMode, 'PREDECESSOR_ATTRIBUTED');
});

function symlinkFileOrSkip(t, target, linkPath) {
  try {
    fs.symlinkSync(target, linkPath, 'file');
    return true;
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP', 'EINVAL'].includes(error?.code)) {
      t.skip(`host cannot create file symlink: ${error.code}`);
      return false;
    }
    throw error;
  }
}

test('raw semantic caller fields cannot override exact owner acceptance', () => {
  const cases = [
    ['statementState', 'HUMAN_CONFIRMED'],
    ['acceptedForContinuity', true],
    ['consentState', 'PERMITTED'],
    ['summary', 'Caller-authored semantic substitution.']
  ];
  for (const [field, value] of cases) {
    const ids = tempHome();
    const g01 = committedG01(ids);
    const authority = seedSemanticAuthority(ids, g01, {
      statementState: 'INFERRED', memoryRelation: 'DISPUTED_OR_UNRESOLVED',
      consentDisposition: 'UNKNOWN', acceptedForContinuity: false, summary: 'Owner accepted inferred summary.'
    });
    assert.throws(() => appendScoreStatement({
      ...ids, expectedScoreHeadSha256: null, statementRef: `statement.override.${field.toLowerCase()}`,
      semanticAcceptanceRef: authority.acceptance.acceptanceRef,
      semanticAcceptanceSha256: authority.acceptance.acceptanceSha256,
      [field]: value
    }), (error) => error.code === 'SCORE_SEMANTIC_AUTHORITY_MISMATCH');
  }
});

test('caller-passed semantic objects and raw sourceEvents are never semantic authority', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  const authority = seedSemanticAuthority(ids, g01);
  assert.throws(() => appendScoreStatement({
    ...ids, expectedScoreHeadSha256: null, statementRef: 'statement.g02.direct-object',
    semanticAcceptanceRef: authority.acceptance.acceptanceRef,
    semanticAcceptanceSha256: authority.acceptance.acceptanceSha256,
    semanticAcceptance: authority.acceptance
  }), (error) => error.code === 'SCORE_SEMANTIC_AUTHORITY_MISMATCH');
  assert.throws(() => appendScoreStatement({
    ...ids, expectedScoreHeadSha256: null, statementRef: 'statement.g02.raw-source',
    semanticAcceptanceRef: authority.acceptance.acceptanceRef,
    semanticAcceptanceSha256: authority.acceptance.acceptanceSha256,
    sourceEvents: [g01.first.requestEvent, g01.first.responseEvent]
  }), (error) => error.code === 'SCORE_SEMANTIC_AUTHORITY_MISMATCH');
});

test('self-hashed acceptance outside current owner head cannot become Score authority', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  const authority = seedSemanticAuthority(ids, g01, { statementState: 'INFERRED' });
  const preRefCore = structuredClone(authority.acceptance);
  delete preRefCore.acceptanceRef;
  delete preRefCore.acceptanceSha256;
  preRefCore.acceptedSummary = 'Forged but self-consistent summary.';
  preRefCore.acceptedSummarySha256 = semanticHash(preRefCore.acceptedSummary);
  const forged = addressed('score-semantic-acceptance', 'acceptanceRef', 'acceptanceSha256', preRefCore);
  writeJson(path.join(semanticAuthorityDir(ids, 'acceptances'), `${forged.acceptanceSha256}.json`), forged);
  assert.throws(() => appendScoreStatement({
    ...ids, expectedScoreHeadSha256: null, statementRef: 'statement.g02.forged-acceptance',
    semanticAcceptanceRef: forged.acceptanceRef, semanticAcceptanceSha256: forged.acceptanceSha256
  }), (error) => error.code === 'SCORE_SEMANTIC_AUTHORITY_STALE');
});

test('HUMAN_CONFIRMED rejects human confirmation bound to another candidate', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  const authority = seedSemanticAuthority(ids, g01, {
    humanConfirmation: {
      humanSubjectRef: 'person.test',
      confirmationDispositionRef: 'confirmation.test.wrong-candidate',
      confirmationDispositionSha256: 'a'.repeat(64),
      confirmedCandidateRef: 'score-semantic-candidate.wrong',
      confirmedCandidateSha256: 'b'.repeat(64),
      confirmedSemanticSubjectFingerprint: 'c'.repeat(64),
      confirmedSummarySha256: 'd'.repeat(64),
      confirmedAt: '2026-08-07T09:10:01.000Z'
    }
  });
  assert.throws(() => appendScoreStatement({
    ...ids, expectedScoreHeadSha256: null, statementRef: 'statement.g02.wrong-human-confirmation',
    semanticAcceptanceRef: authority.acceptance.acceptanceRef,
    semanticAcceptanceSha256: authority.acceptance.acceptanceSha256
  }), (error) => error.code === 'SCORE_CLASSIFICATION_EVIDENCE_INVALID');
});

test('positive consent fails when the exact required authority set is not observed', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  const required = [{
    authorityRef: 'authority.test.required', authoritySha256: 'a'.repeat(64), subjectRef: 'person.test',
    purposeRef: 'purpose.score.device-private-continuity', scopeFingerprint: 'b'.repeat(64), disposition: 'PERMITTED',
    formedAt: '2026-08-07T09:10:02.000Z', expiresAt: null
  }];
  const authority = seedSemanticAuthority(ids, g01, {
    consentDisposition: 'PERMITTED', requiredAuthorityBindings: required, observedAuthorityBindings: []
  });
  assert.throws(() => appendScoreStatement({
    ...ids, expectedScoreHeadSha256: null, statementRef: 'statement.g02.missing-consent-authority',
    semanticAcceptanceRef: authority.acceptance.acceptanceRef,
    semanticAcceptanceSha256: authority.acceptance.acceptanceSha256
  }), (error) => error.code === 'SCORE_CONSENT_INVALID');
});

test('INFERRED owner acceptance preserves inference and cannot silently become continuity or first-person fact', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01, {
    statementState: 'INFERRED', memoryRelation: 'DISPUTED_OR_UNRESOLVED',
    consentDisposition: 'UNKNOWN', acceptedForContinuity: false, summary: 'Bounded inference only.'
  });
  const state = loadScoreContextState(ids);
  const statement = state.statements.find((item) => item.statementRef === 'statement.g02.one');
  assert.equal(statement.recordedStatementState, 'INFERRED');
  assert.equal(statement.memoryRelation, 'DISPUTED_OR_UNRESOLVED');
  assert.equal(statement.acceptedForContinuity, false);
  assert.equal(statement.consentState, 'UNKNOWN');
  const firstPerson = evaluateFirstPersonEligibility(state, statement.statementRef);
  assert.equal(firstPerson.eligible, false);
});

test('correction can use later committed source generation only with same subject and exact predecessor acceptance', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  const before = loadScoreContextState(ids).statements.find((item) => item.statementRef === 'statement.g02.one');
  append(ids, g01, {
    source: g01.second,
    statementRef: 'statement.g02.later-correction',
    correctsStatementRef: 'statement.g02.one',
    summary: 'Correction from later committed evidence.'
  });
  const state = loadScoreContextState(ids);
  const successor = state.statements.find((item) => item.statementRef === 'statement.g02.later-correction');
  assert.equal(successor.semanticSubjectFingerprint, before.semanticSubjectFingerprint);
  assert.notDeepEqual(successor.sourceBindings.map((item) => item.eventHash), before.sourceBindings.map((item) => item.eventHash));
  assert.deepEqual(state.currentStatementRefs, ['statement.g02.later-correction']);
});

test('wrong predecessor acceptance hash cannot authorize correction or supersession', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  assert.throws(() => append(ids, g01, {
    statementRef: 'statement.g02.wrong-predecessor', correctsStatementRef: 'statement.g02.one',
    transitionTargetAcceptanceSha256: 'f'.repeat(64), summary: 'Wrong predecessor binding.'
  }), (error) => error.code === 'SCORE_LINK_INVALID');
});

test('owner-head replacement makes prior acceptance stale for new append but historical Score replay remains valid', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  const firstAuthority = seedSemanticAuthority(ids, g01, { summary: 'First accepted meaning.' });
  append(ids, g01, { authority: firstAuthority });
  const committedState = loadScoreContextState(ids);
  const committedHead = committedState.head.scoreHeadSha256;
  seedSemanticAuthority(ids, g01, { summary: 'New owner-head meaning for same subject.' });
  const replay = loadScoreContextState(ids);
  assert.equal(replay.head.scoreHeadSha256, committedHead);
  assert.equal(projectScoreContext(ids).currentStatements[0].authorityCurrentForNewUse, false);
  assert.throws(() => appendScoreStatement({
    ...ids, expectedScoreHeadSha256: committedHead, statementRef: 'statement.g02.stale-owner-head',
    semanticAcceptanceRef: firstAuthority.acceptance.acceptanceRef,
    semanticAcceptanceSha256: firstAuthority.acceptance.acceptanceSha256
  }), (error) => error.code === 'SCORE_SEMANTIC_AUTHORITY_STALE');
});

test('fresh process replay revalidates historical semantic authority and consent provenance', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  const moduleUrl = pathToFileURL(path.resolve('src/core/score-context-continuity.mjs')).href;
  const program = `import { loadScoreContextState } from ${JSON.stringify(moduleUrl)};\n` +
    `const state = loadScoreContextState(${JSON.stringify(ids)});\n` +
    `process.stdout.write(JSON.stringify({head:state.head.scoreHeadSha256,acceptance:state.statements[0].semanticAcceptanceSha256,consent:state.statements[0].consentDispositionSha256}));`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', program], { cwd: path.resolve('.'), encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  const observed = JSON.parse(child.stdout);
  const state = loadScoreContextState(ids);
  assert.equal(observed.head, state.head.scoreHeadSha256);
  assert.equal(observed.acceptance, state.statements[0].semanticAcceptanceSha256);
  assert.equal(observed.consent, state.statements[0].consentDispositionSha256);
});

test('G01 final bounded-context file cannot be a symlink alias outside Vex Home', (t) => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  const contextFile = path.join(ids.home, g01.head.contextPath);
  const external = path.join(path.dirname(ids.home), 'external-g01-context.json');
  fs.copyFileSync(contextFile, external);
  fs.unlinkSync(contextFile);
  if (!symlinkFileOrSkip(t, external, contextFile)) return;
  assert.throws(() => loadScoreContextState(ids), (error) =>
    ['HOME_IDENTITY_MISMATCH', 'SCORE_SOURCE_INVALID'].includes(error.code));
});

test('immutable Score-head receipt cannot be a symlink alias outside Vex Home', (t) => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  const state = loadScoreContextState(ids);
  const immutableHead = path.join(ids.home, 'score', ids.companionLineageRef, ids.threadRef, 'heads', `${state.head.scoreHeadSha256}.json`);
  const external = path.join(path.dirname(ids.home), 'external-score-head.json');
  fs.copyFileSync(immutableHead, external);
  fs.unlinkSync(immutableHead);
  if (!symlinkFileOrSkip(t, external, immutableHead)) return;
  assert.throws(() => loadScoreContextState(ids), (error) => error.code === 'HOME_IDENTITY_MISMATCH');
});

test('projection keeps Dream, Rhythm learning, synchronization and weights held', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  const projection = projectScoreContext(ids);
  assert.equal(projection.dreamCompleted, false);
  assert.equal(projection.modelWeightsChanged, false);
  assert.equal(projection.rhythmLearned, false);
  assert.equal(projection.synchronizationActivated, false);
});
