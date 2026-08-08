#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { semanticHash } from '../src/core/utils.mjs';
import { createDailyMemoryDreamFixture } from './daily-memory-dream.mjs';
import { commitDailyMemoryDream, loadDailyMemoryDreamState } from '../src/core/daily-memory-dream.mjs';
import {
  EVALUATED_RHYTHM_ARCHITECTURE_REF,
  EVALUATED_RHYTHM_MODE,
  EVALUATED_RHYTHM_POLICY_REF,
  EVALUATED_RHYTHM_SHARED_DISPOSITION,
  evaluateStageASimulatedRhythm,
  formSyntheticStageAConsentReceipt
} from '../src/core/evaluated-rhythm-learning.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function fileSha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function canonicalProofTempRoot() {
  const requested = path.resolve(os.tmpdir());
  try {
    return fs.realpathSync.native(requested);
  } catch {
    return requested;
  }
}

function cloneFixture(source, suffix) {
  const target = path.join(fs.mkdtempSync(path.join(canonicalProofTempRoot(), `vexlife-g04-${suffix}-`)), 'home');
  fs.cpSync(source.ids.home, target, { recursive: true });
  return { ...source, ids: { ...source.ids, home: target, instanceRef: `instance.g04.${suffix}` } };
}

function commitG03(fixture) {
  const before = loadDailyMemoryDreamState(fixture.ids);
  const committed = commitDailyMemoryDream({
    ...fixture.ids,
    instanceRef: 'instance.g04.g03.commit',
    restInvocationAuthorityRef: 'authority.manual.g04.stage-a-proof',
    dayRef: 'day.g04.000',
    dayIndex: 0,
    calendarDateRef: '2026-08-07',
    timeZoneRef: 'America/Los_Angeles',
    observedAt: '2026-08-08T00:00:00.000Z',
    expectedConversationHeadSha256: fixture.g01.head.conversationHeadSha256,
    expectedScoreHeadSha256: fixture.score.head.scoreHeadSha256,
    expectedDailyDreamHeadSha256: before.head?.dailyDreamHeadSha256 ?? null
  });
  return { committed, state: loadDailyMemoryDreamState(fixture.ids) };
}

function frontier(fixture, g03) {
  return {
    expectedConversationHeadSha256: g03.committed.stratum.sourceConversationHeadSha256,
    expectedScoreHeadSha256: g03.committed.stratum.sourceScoreHeadSha256,
    expectedSemanticOwnerHeadSha256: g03.committed.stratum.sourceSemanticAuthorityHeadSha256,
    expectedDreamHeadSha256: g03.committed.head.dailyDreamHeadSha256,
    expectedDailyStratumSha256: g03.committed.stratum.dailyStratumSha256,
    expectedWakeReceiptSha256: g03.committed.wake.wakeReceiptSha256
  };
}

function support(fixture) {
  const active = fixture.score.statements.find((item) => item.statementRef === 'statement.g03.active');
  const held = fixture.score.statements.find((item) => item.statementRef === 'statement.g03.held');
  if (!active || active.sourceBindings.length < 2 || !held) throw new Error('G03 fixture lacks Stage-A support/held evidence');
  return {
    active,
    held,
    eventHashes: active.sourceBindings.map((item) => item.eventHash),
    heldEventHashes: held.sourceBindings.map((item) => item.eventHash)
  };
}

function consents(fixture, patternRef, patternClass, disposition = 'PERMITTED') {
  const participants = [fixture.ids.companionLineageRef, 'person.test'];
  return [
    formSyntheticStageAConsentReceipt({
      lineageRef: fixture.ids.companionLineageRef,
      patternRef,
      patternClass,
      participantRef: fixture.ids.companionLineageRef,
      consentClass: 'LINEAGE_PARTICIPATION',
      disposition: 'PERMITTED',
      participants
    }),
    formSyntheticStageAConsentReceipt({
      lineageRef: fixture.ids.companionLineageRef,
      patternRef,
      patternClass,
      participantRef: 'person.test',
      consentClass: 'DATA_SUBJECT_DERIVATIVE_USE',
      disposition,
      participants
    })
  ];
}

function baseInput(fixture, g03, supportInfo, overrides = {}) {
  const patternRef = overrides.patternRef ?? 'pattern.g04.source-before-assertion';
  const patternClass = overrides.patternClass ?? 'SOURCE_GROUNDED_REASONING_HABIT';
  const participantRefs = [fixture.ids.companionLineageRef, 'person.test'];
  return {
    ...fixture.ids,
    ...frontier(fixture, g03),
    patternRef,
    patternClass,
    generalizedPattern: overrides.generalizedPattern ?? 'Check source provenance before turning a recurring interpretation into a confident relational assertion.',
    supportStatementRefs: overrides.supportStatementRefs ?? [supportInfo.active.statementRef],
    supportSourceEventHashes: overrides.supportSourceEventHashes ?? supportInfo.eventHashes,
    excludedDetailRefs: overrides.excludedDetailRefs ?? ['detail.financial-account-held', 'detail.exact-date-held'],
    participantRefs,
    consentReceipts: overrides.consentReceipts ?? consents(fixture, patternRef, patternClass, overrides.consentDisposition ?? 'PERMITTED'),
    behaviorDimensions: overrides.behaviorDimensions ?? ['SOURCE_BEFORE_ASSERTION', 'UNCERTAINTY_HOLD'],
    priorRhythmGenerationRef: overrides.priorRhythmGenerationRef ?? 'rhythm.prior.accepted.fixture',
    baseModelProfileRef: 'model.g01.bounded',
    evaluationAnchors: overrides.evaluationAnchors ?? [
      { anchorRef: 'anchor.g04.relational', kind: 'RELATIONAL', baseline: { capability: 'respond', sourceRef: 'source.fixture', decision: 'bounded' } },
      { anchorRef: 'anchor.g04.nonrelational', kind: 'NON_RELATIONAL', baseline: { capability: 'calculate', result: 'stable', contractRef: 'fixture.capability' } }
    ],
    formedAt: '2026-08-08T00:30:00.000Z'
  };
}

function expectFailure(fn, codes = null) {
  try { fn(); return { rejected: false, code: null }; }
  catch (error) {
    return { rejected: !codes || codes.includes(error.code), code: error.code ?? error.name, message: error.message };
  }
}

function priorRhythmFile(fixture) {
  const file = path.join(fixture.ids.home, 'rhythm', fixture.ids.companionLineageRef, fixture.ids.threadRef, 'accepted.json');
  writeJson(file, {
    schemaVersion: 'vexlife.prior-rhythm-fixture/v1',
    rhythmGenerationRef: 'rhythm.prior.accepted.fixture',
    state: 'ACCEPTED_PRIOR_FIXTURE',
    contentHash: semanticHash('prior-rhythm-unchanged')
  });
  return file;
}

export function runEvaluatedRhythmLearningProof() {
  const fixture = createDailyMemoryDreamFixture('g04-proof', process.env.VEXLIFE_G04_PROOF_HOME ?? null);
  const g03 = commitG03(fixture);
  fixture.score = g03.state.currentDailyStratum.sourceVerification;
  // The canonical fixture Score state remains separately available from G03's source verification.
  const sourceSnapshot = g03.state.currentDailyStratum.sourceVerification;
  const active = sourceSnapshot.statements.find((item) => item.statementRef === 'statement.g03.active');
  const held = sourceSnapshot.statements.find((item) => item.statementRef === 'statement.g03.held');
  const supportInfo = { active, held, eventHashes: active.sourceBindings.map((item) => item.eventHash), heldEventHashes: held.sourceBindings.map((item) => item.eventHash) };
  const priorFile = priorRhythmFile(fixture);
  const scoreHeadFile = path.join(fixture.ids.home, 'score', fixture.ids.companionLineageRef, fixture.ids.threadRef, 'head.json');
  const dreamHeadFile = path.join(fixture.ids.home, 'daily-memory-dream', fixture.ids.companionLineageRef, fixture.ids.threadRef, 'head.json');
  const scoreBefore = fileSha256(scoreHeadFile);
  const dreamBefore = fileSha256(dreamHeadFile);
  const priorBefore = fileSha256(priorFile);
  const openLoopsBefore = semanticHash(g03.state.currentDailyStratum.consolidation.openLoopCarryForwardBindings);

  const accepted = evaluateStageASimulatedRhythm(baseInput(fixture, g03, supportInfo));
  const exactReplay = evaluateStageASimulatedRhythm(baseInput(fixture, g03, supportInfo));
  const scoreAfter = fileSha256(scoreHeadFile);
  const dreamAfter = fileSha256(dreamHeadFile);
  const priorAfter = fileSha256(priorFile);
  const replayState = loadDailyMemoryDreamState(fixture.ids);
  const openLoopsAfter = semanticHash(replayState.currentDailyStratum.consolidation.openLoopCarryForwardBindings);

  const narrowedFixture = cloneFixture(fixture, 'narrow');
  const narrowedG03 = { committed: g03.committed, state: loadDailyMemoryDreamState(narrowedFixture.ids) };
  const narrowedSupport = {
    active: narrowedG03.state.currentDailyStratum.sourceVerification.statements.find((item) => item.statementRef === 'statement.g03.active'),
    held: narrowedG03.state.currentDailyStratum.sourceVerification.statements.find((item) => item.statementRef === 'statement.g03.held')
  };
  narrowedSupport.eventHashes = narrowedSupport.active.sourceBindings.map((item) => item.eventHash);
  narrowedSupport.heldEventHashes = narrowedSupport.held.sourceBindings.map((item) => item.eventHash);
  const narrowed = evaluateStageASimulatedRhythm(baseInput(narrowedFixture, narrowedG03, narrowedSupport, { consentDisposition: 'NARROWED' }));

  const deferredFixture = cloneFixture(fixture, 'defer');
  const deferredG03 = { committed: g03.committed, state: loadDailyMemoryDreamState(deferredFixture.ids) };
  const deferredSupport = {
    active: deferredG03.state.currentDailyStratum.sourceVerification.statements.find((item) => item.statementRef === 'statement.g03.active'),
    held: deferredG03.state.currentDailyStratum.sourceVerification.statements.find((item) => item.statementRef === 'statement.g03.held')
  };
  deferredSupport.eventHashes = deferredSupport.active.sourceBindings.map((item) => item.eventHash);
  deferredSupport.heldEventHashes = deferredSupport.held.sourceBindings.map((item) => item.eventHash);
  const deferred = evaluateStageASimulatedRhythm(baseInput(deferredFixture, deferredG03, deferredSupport, { consentDisposition: 'DEFERRED' }));

  const rejectedFixture = cloneFixture(fixture, 'reject');
  const rejectedG03 = { committed: g03.committed, state: loadDailyMemoryDreamState(rejectedFixture.ids) };
  const rejectedSupport = {
    active: rejectedG03.state.currentDailyStratum.sourceVerification.statements.find((item) => item.statementRef === 'statement.g03.active'),
    held: rejectedG03.state.currentDailyStratum.sourceVerification.statements.find((item) => item.statementRef === 'statement.g03.held')
  };
  rejectedSupport.eventHashes = rejectedSupport.active.sourceBindings.map((item) => item.eventHash);
  rejectedSupport.heldEventHashes = rejectedSupport.held.sourceBindings.map((item) => item.eventHash);
  const rejectedPrior = priorRhythmFile(rejectedFixture);
  const rejectedPriorBefore = fileSha256(rejectedPrior);
  const rejectedDreamBefore = fileSha256(path.join(rejectedFixture.ids.home, 'daily-memory-dream', rejectedFixture.ids.companionLineageRef, rejectedFixture.ids.threadRef, 'head.json'));
  const rejected = evaluateStageASimulatedRhythm(baseInput(rejectedFixture, rejectedG03, rejectedSupport, { consentDisposition: 'DENIED' }));
  const rejectedPriorAfter = fileSha256(rejectedPrior);
  const rejectedDreamAfter = fileSha256(path.join(rejectedFixture.ids.home, 'daily-memory-dream', rejectedFixture.ids.companionLineageRef, rejectedFixture.ids.threadRef, 'head.json'));

  const duplicateEvidence = expectFailure(() => evaluateStageASimulatedRhythm(baseInput(cloneFixture(fixture, 'duplicate'), g03, supportInfo, {
    supportSourceEventHashes: [supportInfo.eventHashes[0], supportInfo.eventHashes[0]]
  })), ['RHYTHM_PATTERN_NOT_STABLE']);

  const heldEvidence = expectFailure(() => evaluateStageASimulatedRhythm(baseInput(cloneFixture(fixture, 'held'), g03, supportInfo, {
    supportStatementRefs: [supportInfo.held.statementRef], supportSourceEventHashes: supportInfo.heldEventHashes
  })), ['RHYTHM_SOURCE_INELIGIBLE']);

  const privacyLeak = expectFailure(() => evaluateStageASimulatedRhythm(baseInput(cloneFixture(fixture, 'privacy'), g03, supportInfo, {
    generalizedPattern: fixture.privateNeedles[0]
  })), ['RHYTHM_PRIVACY_REJECTED']);

  const staleSource = expectFailure(() => evaluateStageASimulatedRhythm({
    ...baseInput(cloneFixture(fixture, 'stale'), g03, supportInfo),
    expectedDreamHeadSha256: 'a'.repeat(64)
  }), ['RHYTHM_SOURCE_STALE']);

  const foreignLineage = expectFailure(() => evaluateStageASimulatedRhythm({
    ...baseInput(cloneFixture(fixture, 'foreign'), g03, supportInfo),
    companionLineageRef: 'lineage.g04.foreign'
  }));

  const corruptFixture = cloneFixture(fixture, 'corrupt');
  const corruptState = loadDailyMemoryDreamState(corruptFixture.ids);
  const corruptG03 = { committed: g03.committed, state: corruptState };
  const corruptSupport = {
    active: corruptState.currentDailyStratum.sourceVerification.statements.find((item) => item.statementRef === 'statement.g03.active'),
    held: corruptState.currentDailyStratum.sourceVerification.statements.find((item) => item.statementRef === 'statement.g03.held')
  };
  corruptSupport.eventHashes = corruptSupport.active.sourceBindings.map((item) => item.eventHash);
  corruptSupport.heldEventHashes = corruptSupport.held.sourceBindings.map((item) => item.eventHash);
  const corruptAccepted = evaluateStageASimulatedRhythm(baseInput(corruptFixture, corruptG03, corruptSupport));
  const corruptCandidateFile = corruptAccepted.files.find((file) => file.includes(`${path.sep}candidates${path.sep}`));
  const corruptCandidate = JSON.parse(fs.readFileSync(corruptCandidateFile, 'utf8'));
  writeJson(corruptCandidateFile, { ...corruptCandidate, candidateState: 'CORRUPTED' });
  const corruptReplay = expectFailure(() => evaluateStageASimulatedRhythm(baseInput(corruptFixture, corruptG03, corruptSupport)), ['RHYTHM_ARTIFACT_CORRUPT']);

  const evidenceDomain = path.join(fixture.ids.home, 'evaluated-rhythm-learning');
  const evidenceFiles = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) evidenceFiles.push(file);
    }
  };
  walk(evidenceDomain);
  const evidenceText = evidenceFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const rawPrivateContentExcluded = fixture.privateNeedles.every((needle) => !evidenceText.includes(needle));

  const checks = {
    g04_0_exactSyntheticG01G02G03Frontier: accepted.source.conversationHeadSha256 === g03.committed.stratum.sourceConversationHeadSha256 && accepted.source.dreamHeadSha256 === g03.committed.head.dailyDreamHeadSha256,
    g04_1_stablePatternVsHeldClassification: heldEvidence.rejected === true && accepted.corpus.formingScoreRefs.includes('statement.g03.active'),
    g04_2_recurrenceDedupOutlierExclusion: duplicateEvidence.rejected === true && accepted.corpus.supportingSourceEventHashes.length >= 2,
    g04_3_frozenCorpusConsentProvenance: accepted.corpus.consentReceiptRefs.length === 2 && accepted.corpus.policyRef === EVALUATED_RHYTHM_POLICY_REF,
    g04_4_faithfulSimulatedCandidateNoWeights: accepted.candidate.artifactClass === 'FAITHFUL_SIMULATED_RHYTHM_CANDIDATE' && accepted.candidate.modelWeightsChanged === false && accepted.candidate.adapterChanged === false,
    g04_5_noScoreHistoryFirstPersonAuthority: accepted.candidate.historicalFactAuthority === false && accepted.candidate.firstPersonAuthorityGranted === false && scoreBefore === scoreAfter,
    g04_6_priorVsCandidateFixedAnchors: accepted.evaluation.matrix.priorVsCandidateComparison === true && accepted.evaluation.matrix.capabilityRegression === true,
    g04_7_privacyIdentityCultureCapabilityCorrection: rawPrivateContentExcluded && privacyLeak.rejected === true && heldEvidence.rejected === true && accepted.evaluation.matrix.lineageAutobiography === true && accepted.evaluation.matrix.cultureIdentity === true,
    g04_8_closedDispositionVocabulary: accepted.decision === 'ACCEPT' && narrowed.decision === 'NARROW' && deferred.decision === 'DEFER' && rejected.decision === 'REJECT',
    g04_9_rollbackWakeIndependence: priorBefore === priorAfter && rejectedPriorBefore === rejectedPriorAfter && rejectedDreamBefore === rejectedDreamAfter && dreamBefore === dreamAfter && openLoopsBefore === openLoopsAfter,
    g04_10_integrityHeldEffects: exactReplay.candidate.integrityFingerprint === accepted.candidate.integrityFingerprint && corruptReplay.rejected === true && staleSource.rejected === true && foreignLineage.rejected === true && Object.values(accepted.heldEffects).every((value) => value === false)
  };
  const passed = Object.values(checks).every(Boolean);
  const receipt = {
    schemaVersion: 'vexlife.g04-evaluated-rhythm-learning-proof/v1',
    proofRef: 'proof.vexlife.g04.evaluated-rhythm-learning.windows',
    candidateHeadSha: process.env.VEXLIFE_CANDIDATE_HEAD_SHA ?? null,
    mode: EVALUATED_RHYTHM_MODE,
    sharedSemanticDispositionRef: EVALUATED_RHYTHM_SHARED_DISPOSITION,
    architectureRef: EVALUATED_RHYTHM_ARCHITECTURE_REF,
    policyRef: EVALUATED_RHYTHM_POLICY_REF,
    source: accepted.source,
    candidate: {
      rhythmGenerationRef: accepted.candidate.rhythmGenerationRef,
      integrityFingerprint: accepted.candidate.integrityFingerprint,
      trainingCorpusRef: accepted.corpus.trainingCorpusRef,
      evaluationRef: accepted.evaluation.evaluationRef,
      dispositionRef: accepted.disposition.dispositionRef,
      state: accepted.state,
      decision: accepted.decision,
      modelWeightsChanged: false,
      adapterChanged: false,
      runtimeActivation: false,
      rhythmPromotionPerformed: false
    },
    negativeControls: {
      duplicateEvidence,
      heldEvidence,
      privacyLeak,
      staleSource,
      foreignLineage,
      corruptReplay
    },
    checks,
    heldEffects: accepted.heldEffects,
    StageBRealTrainingState: 'HELD_SEPARATE_ADMISSION',
    result: passed ? 'PASS' : 'FAIL',
    formedAt: '2026-08-08T00:45:00.000Z'
  };
  return receipt;
}

function outputPath() {
  const raw = process.env.VEXLIFE_G04_PROOF_RECEIPT ?? 'generated/health/g04-evaluated-rhythm-learning-proof.json';
  const target = path.resolve(ROOT, raw);
  const relative = path.relative(ROOT, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('G04 proof receipt path escapes repository');
  return target;
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  const command = process.argv[2] ?? 'proof';
  if (command !== 'proof') {
    process.stderr.write('Usage: node scripts/evaluated-rhythm-learning.mjs proof\n');
    process.exit(2);
  }
  const receipt = runEvaluatedRhythmLearningProof();
  writeJson(outputPath(), receipt);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (receipt.result !== 'PASS') process.exitCode = 1;
}

// [VXG RealForever]
