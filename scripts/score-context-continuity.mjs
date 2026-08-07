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
  SCORE_CONTEXT_STATEMENT_STATES,
  appendOpenLoop,
  appendScoreStatement,
  createFirstPersonEligibilityEvidence,
  evaluateFirstPersonEligibility,
  loadScoreContextState,
  projectScoreContext,
  sourceDescentForStatement
} from '../src/core/score-context-continuity.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

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
    companionLineageRef: 'lineage.g02.proof', threadRef: 'thread.g02.proof'
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
  return { first, second, currentHead: second.head };
}

function appendStatement(idsValue, currentG01Head, sourceTurn, input) {
  const state = loadScoreContextState(idsValue);
  return appendScoreStatement({ ...idsValue, instanceRef: input.instanceRef,
    expectedScoreHeadSha256: state.head?.scoreHeadSha256 ?? null,
    sourceConversationHeadSha256: currentG01Head.conversationHeadSha256,
    sourceEvents: [sourceTurn.requestEvent, sourceTurn.responseEvent], ...input });
}

function formFirstPersonEvidence(state, statementRef) {
  const statement = state.statements.find((item) => item.statementRef === statementRef);
  const request = statement.sourceBindings.find((item) => item.eventKind === 'REQUEST');
  const response = statement.sourceBindings.find((item) => item.eventKind === 'RESPONSE');
  return createFirstPersonEligibilityEvidence(state, statementRef, {
    evidenceBindings: [
      { gate: 'PROVENANCE_CURRENT', sourceEventHash: request.eventHash, issuerRef: 'system.vexlife.score-context-continuity', disposition: 'PERMITTED' },
      { gate: 'BRANCH_RELATION_CURRENT', sourceEventHash: response.eventHash, issuerRef: 'system.vexlife.score-context-continuity', disposition: 'PERMITTED' },
      { gate: 'IDENTITY_STANCE_PERMITTED', sourceEventHash: response.eventHash, issuerRef: state.identity.companionLineageRef, disposition: 'PERMITTED' },
      { gate: 'CONSENT_PERMITTED', sourceEventHash: request.eventHash, issuerRef: 'person.proof-user', disposition: 'PERMITTED' }
    ]
  });
}

function rehashEvidence(evidence, mutate) {
  const copy = structuredClone(evidence);
  delete copy.semanticFingerprint;
  mutate(copy);
  copy.semanticFingerprint = semanticHash(copy);
  return copy;
}

function rehashGate(gate, mutate) {
  const copy = structuredClone(gate);
  delete copy.semanticFingerprint;
  mutate(copy);
  copy.semanticFingerprint = semanticHash(copy);
  return copy;
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

function abruptAppendPayload(idsValue, currentG01Head, sourceTurn, expectedScoreHeadSha256) {
  return {
    ...idsValue,
    instanceRef: 'instance.g02.proof.abrupt-exit',
    expectedScoreHeadSha256,
    sourceConversationHeadSha256: currentG01Head.conversationHeadSha256,
    sourceEvents: [sourceTurn.requestEvent, sourceTurn.responseEvent],
    statementRef: 'statement.g02.proof.uncommitted-tail',
    subjectRef: 'subject.g02.proof.tail',
    memoryRelation: 'INHERITED_CONTEXT',
    statementState: 'OBSERVED',
    summary: 'Durable but intentionally uncommitted synthetic tail.',
    acceptedForContinuity: false,
    consentState: 'UNKNOWN'
  };
}

async function runProof() {
  const requestedHome = process.env.VEXLIFE_G02_PROOF_HOME || path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-g02-proof-')), 'home');
  const receiptFile = process.env.VEXLIFE_G02_PROOF_RECEIPT || path.join(ROOT, 'generated', 'health', 'score-context-continuity-proof.json');
  const candidateHead = process.env.VEXLIFE_CANDIDATE_HEAD_SHA || 'UNBOUND_LOCAL_PROOF';
  const proofIds = ids(requestedHome);
  const receipt = await withLoopback(async (endpoint) => {
    const g01 = await buildG01(proofIds, endpoint);
    const relationStatements = [];
    let ordinal = 0;
    for (const relation of SCORE_CONTEXT_MEMORY_RELATIONS) {
      const statementRef = `statement.g02.proof.${String(ordinal).padStart(2, '0')}`;
      const statementState = relation === 'DISPUTED_OR_UNRESOLVED' ? 'CONFLICTED' : 'HUMAN_CONFIRMED';
      const sourceTurn = ordinal === 0 ? g01.first : g01.second;
      const result = appendStatement(proofIds, g01.currentHead, sourceTurn, {
        instanceRef: `instance.g02.proof.${String(ordinal).padStart(2, '0')}`,
        statementRef, subjectRef: `subject.g02.proof.${String(ordinal).padStart(2, '0')}`,
        memoryRelation: relation, statementState, summary: `Synthetic ${relation} statement.`,
        acceptedForContinuity: relation !== 'DISPUTED_OR_UNRESOLVED', consentState: 'PERMITTED'
      });
      relationStatements.push({ relation, statementRef, head: result.head.scoreHeadSha256 });
      ordinal += 1;
    }
    const beforeCorrection = loadScoreContextState(proofIds);
    const autobiography = relationStatements[0].statementRef;
    appendStatement(proofIds, g01.currentHead, g01.second, {
      instanceRef: 'instance.g02.proof.correction', statementRef: 'statement.g02.proof.correction',
      subjectRef: 'subject.g02.proof.00', memoryRelation: 'CURRENT_LINEAGE_AUTOBIOGRAPHY', statementState: 'CORRECTED',
      summary: 'Corrected autobiographical synthetic statement.', acceptedForContinuity: true, consentState: 'PERMITTED',
      correctsStatementRef: autobiography
    });
    appendStatement(proofIds, g01.currentHead, g01.second, {
      instanceRef: 'instance.g02.proof.supersession', statementRef: 'statement.g02.proof.superseding',
      subjectRef: 'subject.g02.proof.00', memoryRelation: 'CURRENT_LINEAGE_AUTOBIOGRAPHY', statementState: 'HUMAN_CONFIRMED',
      summary: 'Superseding autobiographical synthetic statement.', acceptedForContinuity: true, consentState: 'PERMITTED',
      supersedesStatementRef: 'statement.g02.proof.correction'
    });
    let state = loadScoreContextState(proofIds);
    appendOpenLoop({ ...proofIds, instanceRef: 'instance.g02.proof.open-loop', expectedScoreHeadSha256: state.head.scoreHeadSha256,
      sourceConversationHeadSha256: g01.currentHead.conversationHeadSha256,
      sourceEvents: [g01.second.requestEvent, g01.second.responseEvent],
      openLoopRef: 'open-loop.g02.proof.one', openLoopState: 'OPEN', summaryRef: 'summary.g02.proof.open-loop',
      sourceStatementRefs: ['statement.g02.proof.superseding'] });
    state = loadScoreContextState(proofIds);
    let coerciveResolutionHeld = false;
    try {
      appendOpenLoop({ ...proofIds, instanceRef: 'instance.g02.proof.resolve-held', expectedScoreHeadSha256: state.head.scoreHeadSha256,
        sourceConversationHeadSha256: g01.currentHead.conversationHeadSha256,
        sourceEvents: [g01.second.requestEvent, g01.second.responseEvent], openLoopRef: 'open-loop.g02.proof.one',
        openLoopState: 'RESOLVED', sourceStatementRefs: ['statement.g02.proof.superseding'] });
    } catch (error) {
      coerciveResolutionHeld = error.code === 'OPEN_LOOP_INVALID' &&
        error.details?.exactNextSafeRoute === 'SOURCE_MANAGED_OPEN_LOOP_RESOLUTION_NOT_ADMITTED_IN_G02';
    }

    const replay = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'resume', JSON.stringify({
      home: proofIds.home, homeRef: proofIds.homeRef, deviceRef: proofIds.deviceRef,
      companionLineageRef: proofIds.companionLineageRef, threadRef: proofIds.threadRef,
      expectedScoreHeadSha256: state.head.scoreHeadSha256
    })], { cwd: ROOT, encoding: 'utf8' });
    if (replay.status !== 0) throw new Error(`fresh-process replay failed: ${replay.stderr || replay.stdout}`);
    const replayReceipt = JSON.parse(replay.stdout.trim().split(/\r?\n/).at(-1));

    const currentRef = 'statement.g02.proof.superseding';
    const eligibilityEvidence = formFirstPersonEvidence(state, currentRef);
    const firstPerson = evaluateFirstPersonEligibility(state, currentRef, eligibilityEvidence);
    const missingFirstPerson = evaluateFirstPersonEligibility(state, currentRef, null);
    const substitutedEligibility = rehashEvidence(eligibilityEvidence, (copy) => {
      copy.evidenceBindings[0] = rehashGate(copy.evidenceBindings[0], (gate) => { gate.sourceEventHash = 'f'.repeat(64); });
    });
    const substitutedFirstPerson = evaluateFirstPersonEligibility(state, currentRef, substitutedEligibility);
    const predecessorRef = relationStatements.find((item) => item.relation === 'PREDECESSOR_WITNESS_HISTORY').statementRef;
    const predecessorEvidence = formFirstPersonEvidence(state, predecessorRef);
    const predecessorWording = evaluateFirstPersonEligibility(state, predecessorRef, predecessorEvidence);
    const descent = sourceDescentForStatement(state, currentRef);

    const headBeforeFault = state.head.scoreHeadSha256;
    const crashPayload = abruptAppendPayload(proofIds, g01.currentHead, g01.second, headBeforeFault);
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

    const projection = projectScoreContext(proofIds);
    return {
      schemaVersion: 'vexlife.g02-score-context-continuity-proof/v2', state: 'PASS', currentness: 'CURRENT',
      candidateHeadSha: candidateHead, sharedSemanticDispositionRef: SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION,
      actualG01HttpTurns: 2, committedG01SourceVerified: descent.observedCurrentConversationHeadSha256 === g01.currentHead.conversationHeadSha256,
      relationClassesCovered: [...SCORE_CONTEXT_MEMORY_RELATIONS], statementStatesRegistered: [...SCORE_CONTEXT_STATEMENT_STATES],
      preCorrectionHeadSha256: beforeCorrection.head.scoreHeadSha256, finalCommittedScoreHeadSha256: state.head.scoreHeadSha256,
      correctionPreservedPrior: state.statements.some((item) => item.statementRef === autobiography && item.current === false),
      supersessionPreservedPrior: state.statements.some((item) => item.statementRef === 'statement.g02.proof.correction' && item.effectiveState === 'SUPERSEDED'),
      openLoopCarryForward: state.openLoopRefs.includes('open-loop.g02.proof.one'), coerciveOpenLoopResolutionHeld: coerciveResolutionHeld,
      freshProcessReplay: replayReceipt.state === 'RESUMED',
      firstPersonAutobiographyEligible: firstPerson.eligible === true && firstPerson.evidenceState === 'EXACT_CURRENT_SOURCE_BOUND_EVIDENCE',
      missingFirstPersonEvidenceBlocked: missingFirstPerson.eligible === false,
      substitutedFirstPersonEvidenceBlocked: substitutedFirstPerson.eligible === false,
      predecessorImpersonationBlocked: predecessorWording.eligible === false && predecessorWording.wordingMode === 'PREDECESSOR_ATTRIBUTED',
      sourceDescentExact: descent.sourceBindings.length === 2 && descent.rawSourceContentIncluded === false,
      abruptProcessExitProven: crash.status === 91,
      crashLikeTailPreserved: Boolean(crashTail),
      priorHeadRemainedCurrentAfterTail: afterFault.head.scoreHeadSha256 === headBeforeFault,
      abandonedWriterRecoveryHeld: afterFault.writer.state === 'ABSENT',
      readdressedTailAttention: readdressedObserved.state === 'ATTENTION' && readdressedObserved.attention.some((item) => item.reason === 'REORDERED_OR_READRESSED_TAIL'),
      sourceSubstitutedTailAttention: sourceSubstitutedObserved.state === 'ATTENTION' && sourceSubstitutedObserved.attention.some((item) => item.reason === 'SCORE_SOURCE_INVALID'),
      rawDurableEventEqualsCommittedCurrentScore: false,
      dreamCompleted: projection.dreamCompleted, modelWeightsChanged: projection.modelWeightsChanged,
      rhythmLearned: projection.rhythmLearned, synchronizationActivated: projection.synchronizationActivated,
      personalEndpointActivated: false, LC18Performed: false,
      formedAt: new Date().toISOString()
    };
  });
  const requiredTrue = [
    receipt.committedG01SourceVerified, receipt.correctionPreservedPrior, receipt.supersessionPreservedPrior,
    receipt.openLoopCarryForward, receipt.coerciveOpenLoopResolutionHeld, receipt.freshProcessReplay,
    receipt.firstPersonAutobiographyEligible, receipt.missingFirstPersonEvidenceBlocked,
    receipt.substitutedFirstPersonEvidenceBlocked, receipt.predecessorImpersonationBlocked,
    receipt.sourceDescentExact, receipt.abruptProcessExitProven, receipt.crashLikeTailPreserved,
    receipt.priorHeadRemainedCurrentAfterTail, receipt.abandonedWriterRecoveryHeld,
    receipt.readdressedTailAttention, receipt.sourceSubstitutedTailAttention
  ];
  if (requiredTrue.some((value) => value !== true) || receipt.dreamCompleted || receipt.modelWeightsChanged || receipt.rhythmLearned || receipt.synchronizationActivated) {
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
  console.log(JSON.stringify({ schemaVersion: 'vexlife.g02-score-context-resume/v1', state: 'RESUMED',
    scoreHeadSha256: state.head.scoreHeadSha256, openLoopRefs: state.openLoopRefs, currentStatementRefs: state.currentStatementRefs }));
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
