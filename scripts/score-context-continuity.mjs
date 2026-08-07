#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initializeLivedCompanionHome, performLivedCompanionTurn } from '../src/core/lived-companion.mjs';
import {
  SCORE_CONTEXT_MEMORY_RELATIONS,
  SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION,
  SCORE_CONTEXT_STATEMENT_STATES,
  appendOpenLoop,
  appendScoreStatement,
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
  return { first, second };
}

function appendStatement(idsValue, source, input) {
  const state = loadScoreContextState(idsValue);
  return appendScoreStatement({ ...idsValue, instanceRef: input.instanceRef,
    expectedScoreHeadSha256: state.head?.scoreHeadSha256 ?? null,
    sourceConversationHeadSha256: source.head.conversationHeadSha256,
    sourceEvents: [source.requestEvent, source.responseEvent], ...input });
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
      const result = appendStatement(proofIds, ordinal === 0 ? g01.first : g01.second, {
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
    appendStatement(proofIds, g01.second, {
      instanceRef: 'instance.g02.proof.correction', statementRef: 'statement.g02.proof.correction',
      subjectRef: 'subject.g02.proof.00', memoryRelation: 'CURRENT_LINEAGE_AUTOBIOGRAPHY', statementState: 'CORRECTED',
      summary: 'Corrected autobiographical synthetic statement.', acceptedForContinuity: true, consentState: 'PERMITTED',
      correctsStatementRef: autobiography
    });
    appendStatement(proofIds, g01.second, {
      instanceRef: 'instance.g02.proof.supersession', statementRef: 'statement.g02.proof.superseding',
      subjectRef: 'subject.g02.proof.00', memoryRelation: 'CURRENT_LINEAGE_AUTOBIOGRAPHY', statementState: 'HUMAN_CONFIRMED',
      summary: 'Superseding autobiographical synthetic statement.', acceptedForContinuity: true, consentState: 'PERMITTED',
      supersedesStatementRef: 'statement.g02.proof.correction'
    });
    let state = loadScoreContextState(proofIds);
    appendOpenLoop({ ...proofIds, instanceRef: 'instance.g02.proof.open-loop', expectedScoreHeadSha256: state.head.scoreHeadSha256,
      sourceConversationHeadSha256: g01.second.head.conversationHeadSha256, sourceEvents: [g01.second.requestEvent, g01.second.responseEvent],
      openLoopRef: 'open-loop.g02.proof.one', openLoopState: 'OPEN', summaryRef: 'summary.g02.proof.open-loop',
      sourceStatementRefs: ['statement.g02.proof.superseding'] });
    state = loadScoreContextState(proofIds);
    const replay = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'resume', JSON.stringify({
      home: proofIds.home, homeRef: proofIds.homeRef, deviceRef: proofIds.deviceRef,
      companionLineageRef: proofIds.companionLineageRef, threadRef: proofIds.threadRef,
      expectedScoreHeadSha256: state.head.scoreHeadSha256
    })], { cwd: ROOT, encoding: 'utf8' });
    if (replay.status !== 0) throw new Error(`fresh-process replay failed: ${replay.stderr || replay.stdout}`);
    const replayReceipt = JSON.parse(replay.stdout.trim().split(/\r?\n/).at(-1));
    const currentStatement = state.statements.find((item) => item.statementRef === 'statement.g02.proof.superseding');
    const firstPerson = evaluateFirstPersonEligibility(currentStatement, {
      provenanceCurrent: true, branchRelationCurrent: true, identityStancePermits: true, consentPermits: true
    });
    const predecessor = state.statements.find((item) => item.memoryRelation === 'PREDECESSOR_WITNESS_HISTORY');
    const predecessorWording = evaluateFirstPersonEligibility(predecessor, {
      provenanceCurrent: true, branchRelationCurrent: true, identityStancePermits: true, consentPermits: true
    });
    const descent = sourceDescentForStatement(state, currentStatement.statementRef);
    const headBeforeFault = state.head.scoreHeadSha256;
    let simulatedFailure = null;
    try {
      appendStatement(proofIds, g01.second, {
        instanceRef: 'instance.g02.proof.tail-fault', statementRef: 'statement.g02.proof.uncommitted-tail',
        subjectRef: 'subject.g02.proof.tail', memoryRelation: 'INHERITED_CONTEXT', statementState: 'OBSERVED',
        summary: 'Durable but intentionally uncommitted synthetic tail.', acceptedForContinuity: false, consentState: 'UNKNOWN',
        faults: { failAfterEventWrite: true }
      });
    } catch (error) { simulatedFailure = { code: error.code ?? error.name, message: error.message }; }
    const afterFault = loadScoreContextState(proofIds);
    const invalidPath = path.join(proofIds.home, 'score', proofIds.companionLineageRef, proofIds.threadRef, 'events', `99999999-${'b'.repeat(64)}.json`);
    fs.writeFileSync(invalidPath, '{"schemaVersion":"invalid-tail"}\n', 'utf8');
    const invalidObserved = loadScoreContextState(proofIds);
    fs.rmSync(invalidPath, { force: true });
    const projection = projectScoreContext(proofIds);
    return {
      schemaVersion: 'vexlife.g02-score-context-continuity-proof/v1', state: 'PASS', currentness: 'CURRENT',
      candidateHeadSha: candidateHead, sharedSemanticDispositionRef: SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION,
      actualG01HttpTurns: 2, relationClassesCovered: [...SCORE_CONTEXT_MEMORY_RELATIONS], statementStatesRegistered: [...SCORE_CONTEXT_STATEMENT_STATES],
      preCorrectionHeadSha256: beforeCorrection.head.scoreHeadSha256, finalCommittedScoreHeadSha256: state.head.scoreHeadSha256,
      correctionPreservedPrior: state.statements.some((item) => item.statementRef === autobiography && item.current === false),
      supersessionPreservedPrior: state.statements.some((item) => item.statementRef === 'statement.g02.proof.correction' && item.effectiveState === 'SUPERSEDED'),
      openLoopCarryForward: state.openLoopRefs.includes('open-loop.g02.proof.one'), freshProcessReplay: replayReceipt.state === 'RESUMED',
      firstPersonAutobiographyEligible: firstPerson.eligible === true,
      predecessorImpersonationBlocked: predecessorWording.eligible === false && predecessorWording.wordingMode === 'PREDECESSOR_ATTRIBUTED',
      sourceDescentExact: descent.sourceBindings.length === 2 && descent.rawSourceContentIncluded === false,
      simulatedFailure, crashLikeTailPreserved: afterFault.uncommittedTail.some((item) => item.statementRef === 'statement.g02.proof.uncommitted-tail'),
      priorHeadRemainedCurrentAfterTail: afterFault.head.scoreHeadSha256 === headBeforeFault,
      invalidTailAttention: invalidObserved.state === 'ATTENTION' && invalidObserved.head.scoreHeadSha256 === headBeforeFault,
      rawDurableEventEqualsCommittedCurrentScore: false,
      dreamCompleted: projection.dreamCompleted, modelWeightsChanged: projection.modelWeightsChanged,
      rhythmLearned: projection.rhythmLearned, synchronizationActivated: projection.synchronizationActivated,
      personalEndpointActivated: false, LC18Performed: false,
      formedAt: new Date().toISOString()
    };
  });
  const requiredTrue = [
    receipt.correctionPreservedPrior, receipt.supersessionPreservedPrior, receipt.openLoopCarryForward,
    receipt.freshProcessReplay, receipt.firstPersonAutobiographyEligible, receipt.predecessorImpersonationBlocked,
    receipt.sourceDescentExact, receipt.crashLikeTailPreserved, receipt.priorHeadRemainedCurrentAfterTail,
    receipt.invalidTailAttention
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

const [command = 'proof', payload] = process.argv.slice(2);
if (command === 'proof') await runProof();
else if (command === 'resume') resume(payload);
else throw new Error(`unknown command ${command}`);

// [VXG RealForever]
