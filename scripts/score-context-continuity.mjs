#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initializeLivedCompanionHome, performLivedCompanionTurn } from '../src/core/lived-companion.mjs';
import { semanticHash } from '../src/core/utils.mjs';
import {
  SCORE_CONTEXT_MEMORY_RELATIONS,
  SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION,
  SCORE_CONTEXT_LIVE_SEMANTIC_CONTRACT,
  SCORE_CONTEXT_LIVE_SEMANTIC_DISPOSITION,
  SCORE_CONTEXT_LIVE_SEMANTIC_EXECUTABLE_ADDENDUM,
  SCORE_CONTEXT_SAFETY_SCOPE_ADDENDUM,
  SCORE_CONTEXT_LIVE_SEMANTIC_SCOPE_CONVERGENCE,
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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function write(file, value) { writeJson(file, value); }

async function withLoopback(fn) {
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const parsed = JSON.parse(body || '{}');
    const content = parsed?.messages?.[0]?.content ?? 'missing';
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ model: 'g02-bounded-loopback', choices: [{ message: { content: `reply:${content}` } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { return await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

function ids(home) {
  return {
    home, homeRef: 'home.g02.proof', familyRef: 'family.g02.proof', deviceRef: 'device.g02.proof',
    companionLineageRef: 'lineage.g02.proof', threadRef: 'thread.g02.proof', instanceRef: 'instance.g02.proof'
  };
}

async function buildG01(idsValue, endpoint) {
  initializeLivedCompanionHome(idsValue);
  const endpointProfile = { admitted: true, profileRef: 'endpoint.g02.loopback', endpoint, model: 'g02-bounded-loopback' };
  const first = await performLivedCompanionTurn({ ...idsValue, instanceRef: 'instance.g01.proof.one', channelRef: 'channel.g02.proof',
    turnRef: 'turn.g02.proof.one', requestMessageRef: 'message.g02.request.one', responseMessageRef: 'message.g02.response.one',
    speakerRef: 'person.proof-user', recipientRefs: ['vex.proof'], content: 'first synthetic G02 source turn', endpointProfile });
  const second = await performLivedCompanionTurn({ ...idsValue, instanceRef: 'instance.g01.proof.two', channelRef: 'channel.g02.proof',
    turnRef: 'turn.g02.proof.two', requestMessageRef: 'message.g02.request.two', responseMessageRef: 'message.g02.response.two',
    speakerRef: 'person.proof-user', recipientRefs: ['vex.proof'], content: 'second synthetic G02 source turn', endpointProfile });
  return { first, second, head: second.head, currentHead: second.head };
}

function cloneProofHome(idsValue, label) {
  const target = `${idsValue.home}-${label}`;
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(idsValue.home, target, { recursive: true });
  return { ...idsValue, home: target };
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

function fixtureConsentScopeFingerprint(value) {
  return semanticHash({
    schemaVersion: 'vextreme.score-consent-authority-scope/v1',
    candidateRef: value.candidateRef,
    candidateSha256: value.candidateSha256,
    semanticSubjectRef: value.semanticSubjectRef,
    semanticSubjectFingerprint: value.semanticSubjectFingerprint,
    purposeRef: value.purposeRef,
    privacyClass: value.privacyClass,
    implicatedSubjectRefs: [...value.implicatedSubjectRefs].sort((a, b) => a.localeCompare(b)),
    permittedUseRefs: [...value.permittedUseRefs].sort((a, b) => a.localeCompare(b)),
    prohibitedUseRefs: [...value.prohibitedUseRefs].sort((a, b) => a.localeCompare(b)),
    retentionBoundaryRef: value.retentionBoundaryRef,
    redisclosureBoundaryRef: value.redisclosureBoundaryRef,
    firstPersonBoundaryRef: value.firstPersonBoundaryRef
  });
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
  const positiveConsent = ['PERMITTED', 'NARROWED'].includes(consentDisposition);
  const purposeRef = input.consentPurposeRef ?? 'purpose.score.device-private-continuity';
  const implicatedSubjectRefs = input.implicatedSubjectRefs ?? ['person.test'];
  const permittedUseRefs = input.permittedUseRefs ?? (positiveConsent ? ['use.score.device-private-continuity'] : []);
  const prohibitedUseRefs = input.prohibitedUseRefs ?? ['use.score.first-person'];
  const retentionBoundaryRef = input.retentionBoundaryRef ?? 'retention.score.device-private';
  const redisclosureBoundaryRef = input.redisclosureBoundaryRef ?? 'redisclosure.score.not-admitted';
  const firstPersonBoundaryRef = input.firstPersonBoundaryRef ?? 'boundary.score.first-person.not-admitted';
  const consentScope = {
    candidateRef: candidate.candidateRef,
    candidateSha256: candidate.candidateSha256,
    semanticSubjectRef: candidate.semanticSubjectRef,
    semanticSubjectFingerprint: candidate.semanticSubjectFingerprint,
    purposeRef,
    privacyClass: 'DEVICE_PRIVATE',
    implicatedSubjectRefs,
    permittedUseRefs,
    prohibitedUseRefs,
    retentionBoundaryRef,
    redisclosureBoundaryRef,
    firstPersonBoundaryRef
  };
  const scopeFingerprint = fixtureConsentScopeFingerprint(consentScope);
  const authorityPurposeRef = input.authorityPurposeRef ?? purposeRef;
  const authorityDisposition = input.authorityDisposition ?? (positiveConsent ? 'PERMITTED' : 'UNKNOWN');
  const authorityBinding = {
    authorityRef: input.authorityRef ?? 'authority.test.score.continuity',
    authoritySha256: input.authoritySha256 ?? semanticHash({
      authorityRef: input.authorityRef ?? 'authority.test.score.continuity',
      candidateSha256: candidate.candidateSha256,
      subjectRef: input.authoritySubjectRef ?? implicatedSubjectRefs[0],
      purposeRef: authorityPurposeRef,
      scopeFingerprint: input.authorityScopeFingerprint ?? scopeFingerprint,
      disposition: authorityDisposition
    }),
    subjectRef: input.authoritySubjectRef ?? implicatedSubjectRefs[0],
    purposeRef: authorityPurposeRef,
    scopeFingerprint: input.authorityScopeFingerprint ?? scopeFingerprint,
    disposition: authorityDisposition,
    formedAt: input.authorityFormedAt ?? '2026-08-07T09:10:02.000Z',
    expiresAt: input.authorityExpiresAt ?? null
  };
  const requiredAuthorityBindings = input.requiredAuthorityBindings ?? (positiveConsent ? [authorityBinding] : []);
  const observedAuthorityBindings = input.observedAuthorityBindings ?? (positiveConsent ? structuredClone(requiredAuthorityBindings) : []);
  const consentCore = {
    schemaVersion: 'vextreme.score-consent-disposition/v1',
    candidateRef: candidate.candidateRef,
    candidateSha256: candidate.candidateSha256,
    semanticSubjectRef: candidate.semanticSubjectRef,
    semanticSubjectFingerprint: candidate.semanticSubjectFingerprint,
    purposeRef,
    privacyClass: 'DEVICE_PRIVATE',
    implicatedSubjectRefs,
    requiredAuthorityBindings,
    observedAuthorityBindings,
    disposition: consentDisposition,
    permittedUseRefs,
    prohibitedUseRefs,
    retentionBoundaryRef,
    redisclosureBoundaryRef,
    firstPersonBoundaryRef,
    formedAt: input.consentFormedAt ?? '2026-08-07T09:10:02.000Z',
    expiresAt: input.consentExpiresAt ?? null,
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

function scoreEventFile(idsValue, event) {
  return path.join(idsValue.home, 'score', idsValue.companionLineageRef, idsValue.threadRef, 'events',
    `${String(event.sequence).padStart(8, '0')}-${event.scoreEventHash}.json`);
}

function hostileRawOverride(sourceIds, g01) {
  const idsValue = cloneProofHome(sourceIds, 'hostile-raw-override');
  const authority = seedSemanticAuthority(idsValue, g01, {
    statementState: 'INFERRED', memoryRelation: 'DISPUTED_OR_UNRESOLVED', consentDisposition: 'UNKNOWN',
    acceptedForContinuity: false, summary: 'Owner accepted inferred summary.'
  });
  try {
    appendScoreStatement({ ...idsValue, expectedScoreHeadSha256: null, statementRef: 'statement.proof.raw-override',
      semanticAcceptanceRef: authority.acceptance.acceptanceRef,
      semanticAcceptanceSha256: authority.acceptance.acceptanceSha256,
      statementState: 'HUMAN_CONFIRMED' });
    return false;
  } catch (error) { return error.code === 'SCORE_SEMANTIC_AUTHORITY_MISMATCH'; }
}

function hostileDirectObject(sourceIds, g01) {
  const idsValue = cloneProofHome(sourceIds, 'hostile-direct-object');
  const authority = seedSemanticAuthority(idsValue, g01);
  try {
    appendScoreStatement({ ...idsValue, expectedScoreHeadSha256: null, statementRef: 'statement.proof.direct-object',
      semanticAcceptanceRef: authority.acceptance.acceptanceRef,
      semanticAcceptanceSha256: authority.acceptance.acceptanceSha256,
      semanticAcceptance: authority.acceptance });
    return false;
  } catch (error) { return error.code === 'SCORE_SEMANTIC_AUTHORITY_MISMATCH'; }
}

function hostileForgedAcceptance(sourceIds, g01) {
  const idsValue = cloneProofHome(sourceIds, 'hostile-forged-acceptance');
  const authority = seedSemanticAuthority(idsValue, g01, { statementState: 'INFERRED' });
  const preRefCore = structuredClone(authority.acceptance);
  delete preRefCore.acceptanceRef;
  delete preRefCore.acceptanceSha256;
  preRefCore.acceptedSummary = 'Forged but self-consistent summary.';
  preRefCore.acceptedSummarySha256 = semanticHash(preRefCore.acceptedSummary);
  const forged = addressed('score-semantic-acceptance', 'acceptanceRef', 'acceptanceSha256', preRefCore);
  writeJson(path.join(semanticAuthorityDir(idsValue, 'acceptances'), `${forged.acceptanceSha256}.json`), forged);
  try {
    appendScoreStatement({ ...idsValue, expectedScoreHeadSha256: null, statementRef: 'statement.proof.forged-acceptance',
      semanticAcceptanceRef: forged.acceptanceRef, semanticAcceptanceSha256: forged.acceptanceSha256 });
    return false;
  } catch (error) { return error.code === 'SCORE_SEMANTIC_AUTHORITY_STALE'; }
}

function hostileWrongHumanConfirmation(sourceIds, g01) {
  const idsValue = cloneProofHome(sourceIds, 'hostile-wrong-human-confirmation');
  const authority = seedSemanticAuthority(idsValue, g01, {
    humanConfirmation: {
      humanSubjectRef: 'person.proof-user',
      confirmationDispositionRef: 'confirmation.proof.wrong-candidate',
      confirmationDispositionSha256: 'a'.repeat(64),
      confirmedCandidateRef: 'score-semantic-candidate.wrong',
      confirmedCandidateSha256: 'b'.repeat(64),
      confirmedSemanticSubjectFingerprint: 'c'.repeat(64),
      confirmedSummarySha256: 'd'.repeat(64),
      confirmedAt: '2026-08-07T12:10:01.000Z'
    }
  });
  try {
    appendScoreStatement({ ...idsValue, expectedScoreHeadSha256: null, statementRef: 'statement.proof.wrong-human-confirmation',
      semanticAcceptanceRef: authority.acceptance.acceptanceRef,
      semanticAcceptanceSha256: authority.acceptance.acceptanceSha256 });
    return false;
  } catch (error) { return error.code === 'SCORE_CLASSIFICATION_EVIDENCE_INVALID'; }
}

function hostileMissingConsentAuthority(sourceIds, g01) {
  const idsValue = cloneProofHome(sourceIds, 'hostile-missing-consent');
  const required = [{
    authorityRef: 'authority.proof.required', authoritySha256: 'a'.repeat(64), subjectRef: 'person.proof-user',
    purposeRef: 'purpose.score.device-private-continuity', scopeFingerprint: 'b'.repeat(64), disposition: 'PERMITTED',
    formedAt: '2026-08-07T12:10:02.000Z', expiresAt: null
  }];
  const authority = seedSemanticAuthority(idsValue, g01, {
    consentDisposition: 'PERMITTED', requiredAuthorityBindings: required, observedAuthorityBindings: []
  });
  try {
    appendScoreStatement({ ...idsValue, expectedScoreHeadSha256: null, statementRef: 'statement.proof.missing-consent',
      semanticAcceptanceRef: authority.acceptance.acceptanceRef,
      semanticAcceptanceSha256: authority.acceptance.acceptanceSha256 });
    return false;
  } catch (error) { return error.code === 'SCORE_CONSENT_INVALID'; }
}


function hostileWrongConsentAuthorityPurpose(sourceIds, g01) {
  const idsValue = cloneProofHome(sourceIds, 'hostile-wrong-consent-authority-purpose');
  const authority = seedSemanticAuthority(idsValue, g01, {
    consentDisposition: 'PERMITTED',
    authorityPurposeRef: 'purpose.unrelated'
  });
  try {
    appendScoreStatement({ ...idsValue, expectedScoreHeadSha256: null, statementRef: 'statement.proof.wrong-consent-authority-purpose',
      semanticAcceptanceRef: authority.acceptance.acceptanceRef,
      semanticAcceptanceSha256: authority.acceptance.acceptanceSha256 });
    return false;
  } catch (error) { return error.code === 'SCORE_CONSENT_INVALID'; }
}

function hostileWrongConsentAuthorityScope(sourceIds, g01) {
  const idsValue = cloneProofHome(sourceIds, 'hostile-wrong-consent-authority-scope');
  const authority = seedSemanticAuthority(idsValue, g01, {
    consentDisposition: 'PERMITTED',
    authorityScopeFingerprint: 'b'.repeat(64)
  });
  try {
    appendScoreStatement({ ...idsValue, expectedScoreHeadSha256: null, statementRef: 'statement.proof.wrong-consent-authority-scope',
      semanticAcceptanceRef: authority.acceptance.acceptanceRef,
      semanticAcceptanceSha256: authority.acceptance.acceptanceSha256 });
    return false;
  } catch (error) { return error.code === 'SCORE_CONSENT_INVALID'; }
}

function hostileNonImplicatedConsentAuthority(sourceIds, g01) {
  const idsValue = cloneProofHome(sourceIds, 'hostile-non-implicated-consent-authority');
  const authority = seedSemanticAuthority(idsValue, g01, {
    consentDisposition: 'PERMITTED',
    implicatedSubjectRefs: ['person.proof-user'],
    authoritySubjectRef: 'person.other'
  });
  try {
    appendScoreStatement({ ...idsValue, expectedScoreHeadSha256: null, statementRef: 'statement.proof.non-implicated-consent-authority',
      semanticAcceptanceRef: authority.acceptance.acceptanceRef,
      semanticAcceptanceSha256: authority.acceptance.acceptanceSha256 });
    return false;
  } catch (error) { return error.code === 'SCORE_CONSENT_INVALID'; }
}

function hostileNonPositiveConsentAuthority(sourceIds, g01) {
  return ['DEFERRED', 'DENIED', 'UNKNOWN', 'WITHDRAWN'].every((disposition) => {
    const idsValue = cloneProofHome(sourceIds, `hostile-nonpositive-consent-authority-${disposition.toLowerCase()}`);
    const authority = seedSemanticAuthority(idsValue, g01, {
      consentDisposition: 'PERMITTED',
      authorityDisposition: disposition
    });
    try {
      appendScoreStatement({ ...idsValue, expectedScoreHeadSha256: null,
        statementRef: `statement.proof.nonpositive-consent-authority.${disposition.toLowerCase()}`,
        semanticAcceptanceRef: authority.acceptance.acceptanceRef,
        semanticAcceptanceSha256: authority.acceptance.acceptanceSha256 });
      return false;
    } catch (error) { return error.code === 'SCORE_CONSENT_INVALID'; }
  });
}

function hostileInvalidConsentChronology(sourceIds, g01) {
  const authorityIds = cloneProofHome(sourceIds, 'hostile-authority-expiry-chronology');
  const authority = seedSemanticAuthority(authorityIds, g01, {
    authorityFormedAt: '2026-08-07T12:10:03.000Z',
    authorityExpiresAt: '2026-08-07T12:10:02.000Z'
  });
  let authorityRejected = false;
  try {
    appendScoreStatement({ ...authorityIds, expectedScoreHeadSha256: null,
      statementRef: 'statement.proof.bad-authority-expiry',
      semanticAcceptanceRef: authority.acceptance.acceptanceRef,
      semanticAcceptanceSha256: authority.acceptance.acceptanceSha256 });
  } catch (error) { authorityRejected = error.code === 'SCORE_CONSENT_INVALID'; }

  const consentIds = cloneProofHome(sourceIds, 'hostile-consent-expiry-chronology');
  const consent = seedSemanticAuthority(consentIds, g01, {
    consentFormedAt: '2026-08-07T12:10:03.000Z',
    consentExpiresAt: '2026-08-07T12:10:02.000Z'
  });
  let consentRejected = false;
  try {
    appendScoreStatement({ ...consentIds, expectedScoreHeadSha256: null,
      statementRef: 'statement.proof.bad-consent-expiry',
      semanticAcceptanceRef: consent.acceptance.acceptanceRef,
      semanticAcceptanceSha256: consent.acceptance.acceptanceSha256 });
  } catch (error) { consentRejected = error.code === 'SCORE_CONSENT_INVALID'; }
  return authorityRejected && consentRejected;
}

function positiveNarrowedConsentAuthorityAccepted(sourceIds, g01) {
  const idsValue = cloneProofHome(sourceIds, 'positive-narrowed-consent-authority');
  const authority = seedSemanticAuthority(idsValue, g01, {
    consentDisposition: 'NARROWED',
    authorityDisposition: 'NARROWED',
    implicatedSubjectRefs: ['person.proof-user'],
    permittedUseRefs: ['use.score.device-private-continuity'],
    prohibitedUseRefs: ['use.score.first-person', 'use.score.redisclosure']
  });
  try {
    appendScoreStatement({ ...idsValue, expectedScoreHeadSha256: null, statementRef: 'statement.proof.narrowed-consent-authority',
      semanticAcceptanceRef: authority.acceptance.acceptanceRef,
      semanticAcceptanceSha256: authority.acceptance.acceptanceSha256 });
    const statement = loadScoreContextState(idsValue).statements.find((item) => item.statementRef === 'statement.proof.narrowed-consent-authority');
    return statement?.consentState === 'NARROWED' && statement?.acceptedForContinuity === true;
  } catch {
    return false;
  }
}

async function runProof() {
  const requestedHome = process.env.VEXLIFE_G02_PROOF_HOME || path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-g02-proof-')), 'home');
  const receiptFile = process.env.VEXLIFE_G02_PROOF_RECEIPT || path.join(ROOT, 'generated', 'health', 'score-context-continuity-proof.json');
  const candidateHead = process.env.VEXLIFE_CANDIDATE_HEAD_SHA || 'UNBOUND_LOCAL_PROOF';
  const proofIds = ids(requestedHome);
  const receipt = await withLoopback(async (endpoint) => {
    const g01 = await buildG01(proofIds, endpoint);

    const rawSemanticOverrideRejected = hostileRawOverride(proofIds, g01);
    const callerSemanticObjectRejected = hostileDirectObject(proofIds, g01);
    const forgedAcceptanceOutsideOwnerHeadRejected = hostileForgedAcceptance(proofIds, g01);
    const wrongCandidateHumanConfirmationRejected = hostileWrongHumanConfirmation(proofIds, g01);
    const missingPositiveConsentAuthorityRejected = hostileMissingConsentAuthority(proofIds, g01);
    const wrongConsentAuthorityPurposeRejected = hostileWrongConsentAuthorityPurpose(proofIds, g01);
    const wrongConsentAuthorityScopeRejected = hostileWrongConsentAuthorityScope(proofIds, g01);
    const nonImplicatedConsentAuthorityRejected = hostileNonImplicatedConsentAuthority(proofIds, g01);
    const nonPositiveConsentAuthorityRejected = hostileNonPositiveConsentAuthority(proofIds, g01);
    const invalidConsentChronologyRejected = hostileInvalidConsentChronology(proofIds, g01);
    const positiveNarrowedConsentAuthorityAcceptedFlag = positiveNarrowedConsentAuthorityAccepted(proofIds, g01);

    const relationStatements = [];
    let ordinal = 0;
    for (const relation of SCORE_CONTEXT_MEMORY_RELATIONS) {
      const isDisputed = relation === 'DISPUTED_OR_UNRESOLVED';
      const statementState = isDisputed ? 'INFERRED' : 'HUMAN_CONFIRMED';
      const consentDisposition = isDisputed ? 'UNKNOWN' : 'PERMITTED';
      const acceptedForContinuity = !isDisputed;
      const source = ordinal === 0 ? g01.first : g01.second;
      const authority = seedSemanticAuthority(proofIds, g01, {
        source,
        statementRef: `statement.g02.proof.${String(ordinal).padStart(2, '0')}`,
        subjectRef: `subject.g02.proof.${String(ordinal).padStart(2, '0')}`,
        memoryRelation: relation,
        statementState,
        consentDisposition,
        acceptedForContinuity,
        summary: `Owner-accepted ${relation} proof statement.`
      });
      const result = appendScoreStatement({ ...proofIds, instanceRef: `instance.g02.proof.${String(ordinal).padStart(2, '0')}`,
        expectedScoreHeadSha256: loadScoreContextState(proofIds).head?.scoreHeadSha256 ?? null,
        statementRef: `statement.g02.proof.${String(ordinal).padStart(2, '0')}`,
        semanticAcceptanceRef: authority.acceptance.acceptanceRef,
        semanticAcceptanceSha256: authority.acceptance.acceptanceSha256 });
      relationStatements.push({ relation, statementRef: `statement.g02.proof.${String(ordinal).padStart(2, '0')}`,
        acceptanceSha256: authority.acceptance.acceptanceSha256, head: result.head.scoreHeadSha256 });
      ordinal += 1;
    }

    const inferredRef = relationStatements.find((item) => item.relation === 'DISPUTED_OR_UNRESOLVED').statementRef;
    let state = loadScoreContextState(proofIds);
    const inferred = state.statements.find((item) => item.statementRef === inferredRef);
    const inferredPreserved = inferred.recordedStatementState === 'INFERRED' && inferred.acceptedForContinuity === false &&
      inferred.consentState === 'UNKNOWN' && evaluateFirstPersonEligibility(state, inferredRef).eligible === false;

    const autobiography = relationStatements[0].statementRef;
    const originalAuto = state.statements.find((item) => item.statementRef === autobiography);
    const correctionAuthority = seedSemanticAuthority(proofIds, g01, {
      source: g01.second,
      statementRef: 'statement.g02.proof.correction',
      subjectRef: originalAuto.subjectRef,
      subjectScopeRef: 'scope.score.thread',
      memoryRelation: originalAuto.memoryRelation,
      correctsStatementRef: autobiography,
      transitionKind: 'CORRECTS',
      transitionTargetRef: autobiography,
      transitionTargetAcceptanceSha256: originalAuto.semanticAcceptanceSha256,
      summary: 'Correction accepted from later committed G01 evidence.'
    });
    appendScoreStatement({ ...proofIds, instanceRef: 'instance.g02.proof.correction', expectedScoreHeadSha256: state.head.scoreHeadSha256,
      statementRef: 'statement.g02.proof.correction', semanticAcceptanceRef: correctionAuthority.acceptance.acceptanceRef,
      semanticAcceptanceSha256: correctionAuthority.acceptance.acceptanceSha256 });
    state = loadScoreContextState(proofIds);
    const correction = state.statements.find((item) => item.statementRef === 'statement.g02.proof.correction');
    const correctionUsesLaterSourceSameSubject = correction.semanticSubjectFingerprint === originalAuto.semanticSubjectFingerprint &&
      JSON.stringify(correction.sourceBindings.map((item) => item.eventHash)) !== JSON.stringify(originalAuto.sourceBindings.map((item) => item.eventHash));

    const wrongPredecessorIds = cloneProofHome(proofIds, 'hostile-wrong-predecessor');
    let wrongPredecessorAcceptanceRejected = false;
    try {
      const badAuthority = seedSemanticAuthority(wrongPredecessorIds, g01, {
        source: g01.second, statementRef: 'statement.g02.proof.bad-correction', subjectRef: originalAuto.subjectRef,
        memoryRelation: originalAuto.memoryRelation, correctsStatementRef: 'statement.g02.proof.correction', transitionKind: 'CORRECTS',
        transitionTargetRef: 'statement.g02.proof.correction', transitionTargetAcceptanceSha256: 'f'.repeat(64),
        summary: 'Wrong predecessor acceptance should fail.'
      });
      appendScoreStatement({ ...wrongPredecessorIds, instanceRef: 'instance.g02.proof.bad-correction',
        expectedScoreHeadSha256: loadScoreContextState(wrongPredecessorIds).head.scoreHeadSha256,
        statementRef: 'statement.g02.proof.bad-correction', semanticAcceptanceRef: badAuthority.acceptance.acceptanceRef,
        semanticAcceptanceSha256: badAuthority.acceptance.acceptanceSha256 });
    } catch (error) { wrongPredecessorAcceptanceRejected = error.code === 'SCORE_LINK_INVALID'; }

    const supersessionAuthority = seedSemanticAuthority(proofIds, g01, {
      source: g01.second,
      statementRef: 'statement.g02.proof.superseding',
      subjectRef: correction.subjectRef,
      memoryRelation: correction.memoryRelation,
      supersedesStatementRef: correction.statementRef,
      transitionKind: 'SUPERSEDES', transitionTargetRef: correction.statementRef,
      transitionTargetAcceptanceSha256: correction.semanticAcceptanceSha256,
      summary: 'Superseding accepted interpretation over immutable prior evidence.'
    });
    appendScoreStatement({ ...proofIds, instanceRef: 'instance.g02.proof.supersession', expectedScoreHeadSha256: state.head.scoreHeadSha256,
      statementRef: 'statement.g02.proof.superseding', semanticAcceptanceRef: supersessionAuthority.acceptance.acceptanceRef,
      semanticAcceptanceSha256: supersessionAuthority.acceptance.acceptanceSha256 });
    state = loadScoreContextState(proofIds);

    appendOpenLoop({ ...proofIds, instanceRef: 'instance.g02.proof.open-loop', expectedScoreHeadSha256: state.head.scoreHeadSha256,
      sourceConversationHeadSha256: g01.head.conversationHeadSha256,
      sourceEvents: [g01.second.requestEvent, g01.second.responseEvent],
      openLoopRef: 'open-loop.g02.proof.one', openLoopState: 'OPEN', summaryRef: 'summary.g02.proof.open-loop',
      sourceStatementRefs: ['statement.g02.proof.superseding'] });
    state = loadScoreContextState(proofIds);
    let coerciveResolutionHeld = false;
    try {
      appendOpenLoop({ ...proofIds, instanceRef: 'instance.g02.proof.resolve-held', expectedScoreHeadSha256: state.head.scoreHeadSha256,
        sourceConversationHeadSha256: g01.head.conversationHeadSha256,
        sourceEvents: [g01.second.requestEvent, g01.second.responseEvent], openLoopRef: 'open-loop.g02.proof.one',
        openLoopState: 'RESOLVED', sourceStatementRefs: ['statement.g02.proof.superseding'] });
    } catch (error) {
      coerciveResolutionHeld = error.code === 'OPEN_LOOP_INVALID' &&
        error.details?.exactNextSafeRoute === 'SOURCE_MANAGED_OPEN_LOOP_RESOLUTION_NOT_ADMITTED_IN_G02';
    }

    const currentRef = 'statement.g02.proof.superseding';
    const firstPerson = evaluateFirstPersonEligibility(state, currentRef, null);
    let localFirstPersonEvidenceMintingBlocked = false;
    try { createFirstPersonEligibilityEvidence(state, currentRef, { claimed: 'PERMITTED' }); }
    catch (error) {
      localFirstPersonEvidenceMintingBlocked = error.code === 'FIRST_PERSON_EVIDENCE_INVALID' &&
        error.details?.exactNextSafeRoute === 'SOURCE_MANAGED_SHARED_FIRST_PERSON_EVIDENCE_CONTRACT_REQUIRED';
    }
    const predecessorRef = relationStatements.find((item) => item.relation === 'PREDECESSOR_WITNESS_HISTORY').statementRef;
    const predecessorWording = evaluateFirstPersonEligibility(state, predecessorRef, null);
    const descent = sourceDescentForStatement(state, currentRef);

    const historicalStateBeforeReplacement = state;
    const historicalHeadBeforeReplacement = state.head.scoreHeadSha256;
    const historicalCurrentAcceptance = state.statements.find((item) => item.statementRef === currentRef).semanticAcceptanceSha256;
    seedSemanticAuthority(proofIds, g01, {
      source: g01.second, statementRef: 'statement.owner-head.replacement', subjectRef: correction.subjectRef,
      memoryRelation: correction.memoryRelation, summary: 'New owner-head meaning replacing current semantic authority for same subject.'
    });
    const afterOwnerReplacement = loadScoreContextState(proofIds);
    const projectionAfterOwnerReplacement = projectScoreContext(proofIds);
    const oldCurrentProjection = projectionAfterOwnerReplacement.currentStatements.find((item) => item.statementRef === currentRef);
    let staleAcceptanceRejectedForNewAppend = false;
    try {
      appendScoreStatement({ ...proofIds, instanceRef: 'instance.g02.proof.stale-acceptance', expectedScoreHeadSha256: historicalHeadBeforeReplacement,
        statementRef: 'statement.g02.proof.stale-acceptance',
        semanticAcceptanceRef: supersessionAuthority.acceptance.acceptanceRef,
        semanticAcceptanceSha256: supersessionAuthority.acceptance.acceptanceSha256 });
    } catch (error) { staleAcceptanceRejectedForNewAppend = error.code === 'SCORE_SEMANTIC_AUTHORITY_STALE'; }
    const historicalReplaySurvivesOwnerReplacement = afterOwnerReplacement.head.scoreHeadSha256 === historicalHeadBeforeReplacement &&
      historicalCurrentAcceptance === historicalStateBeforeReplacement.statements.find((item) => item.statementRef === currentRef).semanticAcceptanceSha256 &&
      oldCurrentProjection?.authorityCurrentForNewUse === false;

    const crashAuthority = seedSemanticAuthority(proofIds, g01, {
      source: g01.second, statementRef: 'statement.g02.proof.uncommitted-tail', subjectRef: 'subject.g02.proof.tail',
      memoryRelation: 'INHERITED_CONTEXT', statementState: 'INFERRED', consentDisposition: 'UNKNOWN',
      acceptedForContinuity: false, summary: 'Durable but intentionally uncommitted synthetic tail.'
    });
    const headBeforeFault = afterOwnerReplacement.head.scoreHeadSha256;
    const crashPayload = {
      ...proofIds, instanceRef: 'instance.g02.proof.abrupt-exit', expectedScoreHeadSha256: headBeforeFault,
      statementRef: 'statement.g02.proof.uncommitted-tail', semanticAcceptanceRef: crashAuthority.acceptance.acceptanceRef,
      semanticAcceptanceSha256: crashAuthority.acceptance.acceptanceSha256
    };
    const crash = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'crash-append', JSON.stringify(crashPayload)], {
      cwd: ROOT, encoding: 'utf8'
    });
    const afterFault = loadScoreContextState(proofIds);
    const crashTail = afterFault.uncommittedTail.find((item) => item.statementRef === crashPayload.statementRef);

    const readdressed = reformScoreEvent(crashTail, { sequence: crashTail.sequence + 17 });
    write(scoreEventFile(proofIds, readdressed), readdressed);
    const readdressedObserved = loadScoreContextState(proofIds);
    fs.rmSync(scoreEventFile(proofIds, readdressed), { force: true });

    const substitutedBindings = structuredClone(crashTail.sourceBindings);
    substitutedBindings[0] = { ...substitutedBindings[0], eventRef: 'event.g01.hostile.substitute', eventHash: 'c'.repeat(64), contentHash: 'd'.repeat(64) };
    const sourceSubstituted = reformScoreEvent(crashTail, { sourceBindings: substitutedBindings });
    write(scoreEventFile(proofIds, sourceSubstituted), sourceSubstituted);
    const sourceSubstitutedObserved = loadScoreContextState(proofIds);
    fs.rmSync(scoreEventFile(proofIds, sourceSubstituted), { force: true });

    const replay = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'resume', JSON.stringify({
      home: proofIds.home, homeRef: proofIds.homeRef, deviceRef: proofIds.deviceRef,
      companionLineageRef: proofIds.companionLineageRef, threadRef: proofIds.threadRef,
      expectedScoreHeadSha256: afterFault.head.scoreHeadSha256,
      expectedAcceptanceSha256: historicalCurrentAcceptance
    })], { cwd: ROOT, encoding: 'utf8' });
    if (replay.status !== 0) throw new Error(`fresh-process replay failed: ${replay.stderr || replay.stdout}`);
    const replayReceipt = JSON.parse(replay.stdout.trim().split(/\r?\n/).at(-1));

    const projection = projectScoreContext(proofIds);
    const finalState = loadScoreContextState(proofIds);
    return {
      schemaVersion: 'vexlife.g02-score-context-continuity-proof/v5',
      state: 'PASS', currentness: 'CURRENT', candidateHeadSha: candidateHead,
      sharedSemanticDispositionRef: SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION,
      liveSemanticContractRef: SCORE_CONTEXT_LIVE_SEMANTIC_CONTRACT,
      liveSemanticDispositionRef: SCORE_CONTEXT_LIVE_SEMANTIC_DISPOSITION,
      liveSemanticExecutableAddendumRef: SCORE_CONTEXT_LIVE_SEMANTIC_EXECUTABLE_ADDENDUM,
      safetyConsentScopeAddendumRef: SCORE_CONTEXT_SAFETY_SCOPE_ADDENDUM,
      liveSemanticScopeConvergenceRef: SCORE_CONTEXT_LIVE_SEMANTIC_SCOPE_CONVERGENCE,
      semanticAuthorityConsumerMode: 'READ_ONLY_OWNER_LEDGER',
      semanticAuthorityWriterExposedByG02: false,
      actualG01HttpTurns: 2,
      relationClassesCovered: [...SCORE_CONTEXT_MEMORY_RELATIONS],
      statementStatesRegistered: [...SCORE_CONTEXT_STATEMENT_STATES],
      rawSemanticOverrideRejected,
      callerSemanticObjectRejected,
      forgedAcceptanceOutsideOwnerHeadRejected,
      wrongCandidateHumanConfirmationRejected,
      missingPositiveConsentAuthorityRejected,
      wrongConsentAuthorityPurposeRejected,
      wrongConsentAuthorityScopeRejected,
      nonImplicatedConsentAuthorityRejected,
      nonPositiveConsentAuthorityRejected,
      invalidConsentChronologyRejected,
      positiveNarrowedConsentAuthorityAccepted: positiveNarrowedConsentAuthorityAcceptedFlag,
      inferredStatePreserved: inferredPreserved,
      correctionUsesLaterSourceSameSubject,
      wrongPredecessorAcceptanceRejected,
      correctionPreservedPrior: finalState.statements.some((item) => item.statementRef === autobiography && item.current === false),
      supersessionPreservedPrior: finalState.statements.some((item) => item.statementRef === 'statement.g02.proof.correction' && item.effectiveState === 'SUPERSEDED'),
      ownerHeadReplacementMakesPriorStaleForNewUse: staleAcceptanceRejectedForNewAppend,
      historicalReplaySurvivesOwnerHeadReplacement: historicalReplaySurvivesOwnerReplacement,
      openLoopCarryForward: finalState.openLoopRefs.includes('open-loop.g02.proof.one'),
      coerciveOpenLoopResolutionHeld: coerciveResolutionHeld,
      freshProcessReplay: replayReceipt.state === 'RESUMED' && replayReceipt.historicalSemanticAuthorityRevalidated === true,
      firstPersonEligibilityHeld: firstPerson.eligible === false && firstPerson.wordingMode === 'AUTOBIOGRAPHY_ATTRIBUTED_PENDING_AUTHORITY',
      localFirstPersonEvidenceMintingBlocked,
      predecessorImpersonationBlocked: predecessorWording.eligible === false && predecessorWording.wordingMode === 'PREDECESSOR_ATTRIBUTED',
      sourceDescentExact: descent.sourceBindings.length === 2 && descent.rawSourceContentIncluded === false,
      committedG01SourceVerified: descent.observedCurrentConversationHeadSha256 === g01.head.conversationHeadSha256,
      abruptProcessExitProven: crash.status === 91,
      crashLikeTailPreserved: Boolean(crashTail),
      priorHeadRemainedCurrentAfterTail: afterFault.head.scoreHeadSha256 === headBeforeFault,
      abandonedWriterRecoveryHeld: afterFault.writer.state === 'ABSENT',
      readdressedTailAttention: readdressedObserved.state === 'ATTENTION' && readdressedObserved.attention.some((item) => item.reason === 'REORDERED_OR_READRESSED_TAIL'),
      sourceSubstitutedTailAttention: sourceSubstitutedObserved.state === 'ATTENTION' && sourceSubstitutedObserved.attention.some((item) => item.reason === 'SCORE_SOURCE_INVALID'),
      rawDurableEventEqualsCommittedCurrentScore: false,
      dreamCompleted: projection.dreamCompleted,
      modelWeightsChanged: projection.modelWeightsChanged,
      rhythmLearned: projection.rhythmLearned,
      synchronizationActivated: projection.synchronizationActivated,
      personalEndpointActivated: false,
      LC18Performed: false,
      formedAt: new Date().toISOString()
    };
  });

  const requiredTrue = [
    receipt.rawSemanticOverrideRejected, receipt.callerSemanticObjectRejected,
    receipt.forgedAcceptanceOutsideOwnerHeadRejected, receipt.wrongCandidateHumanConfirmationRejected,
    receipt.missingPositiveConsentAuthorityRejected, receipt.wrongConsentAuthorityPurposeRejected,
    receipt.wrongConsentAuthorityScopeRejected, receipt.nonImplicatedConsentAuthorityRejected,
    receipt.nonPositiveConsentAuthorityRejected, receipt.invalidConsentChronologyRejected,
    receipt.positiveNarrowedConsentAuthorityAccepted, receipt.inferredStatePreserved,
    receipt.correctionUsesLaterSourceSameSubject, receipt.wrongPredecessorAcceptanceRejected,
    receipt.correctionPreservedPrior, receipt.supersessionPreservedPrior,
    receipt.ownerHeadReplacementMakesPriorStaleForNewUse, receipt.historicalReplaySurvivesOwnerHeadReplacement,
    receipt.openLoopCarryForward, receipt.coerciveOpenLoopResolutionHeld, receipt.freshProcessReplay,
    receipt.firstPersonEligibilityHeld, receipt.localFirstPersonEvidenceMintingBlocked,
    receipt.predecessorImpersonationBlocked, receipt.sourceDescentExact, receipt.committedG01SourceVerified,
    receipt.abruptProcessExitProven, receipt.crashLikeTailPreserved,
    receipt.priorHeadRemainedCurrentAfterTail, receipt.abandonedWriterRecoveryHeld,
    receipt.readdressedTailAttention, receipt.sourceSubstitutedTailAttention
  ];
  if (requiredTrue.some((value) => value !== true) || receipt.semanticAuthorityWriterExposedByG02 !== false ||
      receipt.dreamCompleted || receipt.modelWeightsChanged || receipt.rhythmLearned || receipt.synchronizationActivated) {
    receipt.state = 'FAILED';
  }
  write(receiptFile, receipt);
  console.log(JSON.stringify(receipt));
  if (receipt.state !== 'PASS') process.exitCode = 1;
}

function resume(payloadText) {
  const payload = JSON.parse(payloadText);
  const state = loadScoreContextState(payload);
  if (state.head?.scoreHeadSha256 !== payload.expectedScoreHeadSha256) throw new Error('fresh-process Score head mismatch');
  const acceptance = state.statements.find((item) => item.semanticAcceptanceSha256 === payload.expectedAcceptanceSha256);
  if (!acceptance) throw new Error('fresh-process historical semantic acceptance missing');
  console.log(JSON.stringify({
    schemaVersion: 'vexlife.g02-score-context-resume/v2', state: 'RESUMED',
    scoreHeadSha256: state.head.scoreHeadSha256,
    semanticAcceptanceSha256: acceptance.semanticAcceptanceSha256,
    semanticAuthorityHeadSha256: acceptance.semanticAuthorityHeadSha256,
    historicalSemanticAuthorityRevalidated: true,
    openLoopRefs: state.openLoopRefs, currentStatementRefs: state.currentStatementRefs
  }));
}

function crashAppend(payloadText) {
  const payload = JSON.parse(payloadText);
  appendScoreStatement({ ...payload, faults: { exitAfterEventWrite: true } });
  throw new Error('abrupt exit fault did not terminate process');
}

const [command = 'proof', payload] = process.argv.slice(2);
if (command === 'proof') await runProof();
else if (command === 'resume') resume(payload);
else if (command === 'crash-append') crashAppend(payload);
else throw new Error(`unknown command ${command}`);

// [VXG RealForever]
