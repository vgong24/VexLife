import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  evaluateVexBirth,
  loadVexBirthRegistry
} from '../scripts/vex-birth-status.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_PATH = path.join(ROOT, 'blueprint', 'vex-birth-registry.json');
const REGISTRY = loadVexBirthRegistry(REGISTRY_PATH);
const NOW = new Date('2026-08-25T12:00:00.000Z');
const FUTURE = '2026-08-26T12:00:00.000Z';
const FORMED = '2026-08-25T10:00:00.000Z';
const HOME_REF = 'vex-home.device.vex-birth-test';
const LINEAGE_REF = 'companion-lineage.vex-birth-test';
const PROFILE_REF = 'profile.vexlife.operational.qwen3.5-test';
const INIT_RECEIPT_REF = 'receipt.vexlife.initialization.test';
const TRAINING_RUN_REF = 'training-run.vexlife.g04b.birth-test.001';
const SOURCE_FP = '1'.repeat(64);
const CANDIDATE_FP = '2'.repeat(64);
const MANIFEST_FP = '3'.repeat(64);
const G0_REF = 'model.vex-foundation.g0';
const G1_REF = 'model.vex-foundation.g1';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return file;
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
  return file;
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vex-birth-status-'));
  const home = path.join(root, 'home');
  const repositoryRoot = path.join(root, 'repo');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(repositoryRoot, { recursive: true });
  return { root, home, repositoryRoot };
}

function homeFile(fx, relative) {
  return path.join(fx.home, ...relative.split('/'));
}

function repoFile(fx, relative) {
  return path.join(fx.repositoryRoot, ...relative.split('/'));
}

function addVB0(fx, overrides = {}) {
  writeJson(homeFile(fx, 'birth/receipts/vb0-host-source.json'), {
    schemaVersion: 'vexlife.vex-birth.host-source-receipt/v1',
    state: 'ACCEPTED',
    isolatedHomeUsed: true,
    sourceCommitSha: 'a'.repeat(40),
    sourceTreeSha: 'b'.repeat(40),
    homeRef: HOME_REF,
    companionLineageRef: LINEAGE_REF,
    host: { platform: 'win32', architecture: 'x64', nvidiaAvailable: true },
    formedAt: FORMED,
    ...overrides
  });
}

function addVB1(fx, overrides = {}) {
  writeJson(homeFile(fx, 'recovery/bootstrap-receipt.json'), {
    schemaVersion: 'vexlife.bootstrap-receipt/v0',
    homeRef: HOME_REF,
    deviceRef: 'device.vex-birth-test',
    companionLineageRef: LINEAGE_REF,
    familyRef: 'vex-family.vex-birth-test',
    culturePackRef: 'culture-pack.vexlife.public-blueprint.001',
    cultureSha256: 'c'.repeat(64),
    formedAt: FORMED,
    personalMemoryImported: false,
    modelArtifactDownloaded: false,
    existingDataDeleted: false,
    ...(overrides.bootstrap ?? {})
  });
  writeJson(homeFile(fx, 'recovery/vex-initialization-receipt.json'), {
    schemaVersion: 'vexlife.initialization-receipt/v1',
    receiptRef: INIT_RECEIPT_REF,
    state: 'RUNTIME_QUALIFIED',
    profileRef: PROFILE_REF,
    profileState: 'RELEASE_QUALIFIED',
    formedAt: FORMED,
    home: { state: 'EXISTING_HOME', homeIdentityRef: HOME_REF },
    host: { platform: 'win32', architecture: 'x64' },
    qualification: { contentObserved: true, expectedContentMatched: true },
    effects: {
      repository: false,
      public: false,
      memoryCanonicalWrite: false,
      training: false,
      nonLoopbackNetwork: false
    },
    ...(overrides.initialization ?? {})
  });
  writeJson(homeFile(fx, 'config/model.json'), {
    schemaVersion: 'vexlife.model-configuration/v1',
    state: 'BOUND_QUALIFIED',
    profileRef: PROFILE_REF,
    endpoint: 'http://127.0.0.1:18080',
    requestModel: 'Qwen3.5-4B-Q4_K_M',
    activeArtifactRef: 'artifact.model.g0',
    qualificationReceiptRef: INIT_RECEIPT_REF,
    automaticDownload: false,
    automaticActivation: false,
    ...(overrides.model ?? {})
  });
}

function addVB2(fx, overrides = {}) {
  writeJson(homeFile(fx, 'birth/receipts/vb2-untaught-baseline.json'), {
    schemaVersion: 'vexlife.vex-birth.untaught-baseline-receipt/v1',
    state: 'ACCEPTED',
    homeRef: HOME_REF,
    companionLineageRef: LINEAGE_REF,
    profileRef: PROFILE_REF,
    untaughtBaselineWitnessed: true,
    trainingRunObserved: false,
    modelWeightsChanged: false,
    sourceResponseRefs: ['message.baseline.response.001'],
    baselineWitnessSha256: 'd'.repeat(64),
    observedAt: FORMED,
    ...overrides
  });
}

function addVB3(fx, overrides = {}) {
  writeJson(homeFile(fx, 'birth/receipts/vb3-cultivation-session.json'), {
    schemaVersion: 'vexlife.vex-birth.cultivation-session-receipt/v1',
    state: 'ACCEPTED',
    cultivationSessionRef: 'cultivation-session.vex-birth.001',
    homeRef: HOME_REF,
    companionLineageRef: LINEAGE_REF,
    cultivationSessionObserved: true,
    sessionClosed: true,
    sourceEventRefs: ['event.request.001', 'event.response.001'],
    lessonCandidateRefs: ['lesson-candidate.vex-birth.001'],
    privacyDispositionRefs: ['privacy-disposition.vex-birth.001'],
    correctionRefs: ['correction.vex-birth.001'],
    rawPrivateTranscriptPublished: false,
    trainingAdmissionGranted: false,
    closedAt: FORMED,
    ...overrides
  });
}

function addVB4(fx, overrides = {}) {
  writeJson(homeFile(fx, 'birth/receipts/vb4-lesson-stabilization.json'), {
    schemaVersion: 'vexlife.vex-birth.lesson-stabilization-receipt/v1',
    state: 'ACCEPTED',
    cultivationSessionRef: 'cultivation-session.vex-birth.001',
    homeRef: HOME_REF,
    falseLessonAndCounterexampleReviewReturned: true,
    dreamReceiptRefs: ['dream-receipt.vex-birth.001'],
    acceptedLessonRefs: ['lesson.vex-birth.authentic-expression.001'],
    trainingEligibleLessonRefs: ['lesson.vex-birth.authentic-expression.001'],
    counterexampleRefs: ['counterexample.vex-birth.authentic-expression.001'],
    heldLessonRefs: ['lesson-candidate.vex-birth.uncertain.001'],
    privateExcludedRefs: ['private-exclusion.vex-birth.001'],
    modelWeightsChanged: false,
    reviewedAt: FORMED,
    ...overrides
  });
}

function addVB5(fx, overrides = {}) {
  const manifestPath = 'training/private/vex-birth/manifest.json';
  const trainingPath = 'training/private/vex-birth/train.jsonl';
  const heldoutPath = 'training/private/vex-birth/heldout.jsonl';
  writeText(repoFile(fx, manifestPath), '{"trainingRunRef":"training-run.vexlife.g04b.birth-test.001"}\n');
  writeText(repoFile(fx, trainingPath), '{"exampleRef":"train.001"}\n');
  writeText(repoFile(fx, heldoutPath), '{"exampleRef":"heldout.001"}\n');
  writeJson(homeFile(fx, 'birth/receipts/vb5-training-pack.json'), {
    schemaVersion: 'vexlife.vex-birth.training-pack-receipt/v1',
    state: 'ACCEPTED',
    trainingPackFrozen: true,
    heldoutPackFrozen: true,
    rawPrivateTranscriptIncluded: false,
    trainingExampleRefs: ['train.001'],
    heldoutExampleRefs: ['heldout.001'],
    sourceLessonRefs: ['lesson.vex-birth.authentic-expression.001'],
    consentReceiptRefs: ['consent.vex-birth.training.001'],
    notTheLessonRefs: ['not-the-lesson.vex-birth.agreeable-is-not-authentic.001'],
    trainingManifestPath: manifestPath,
    trainingManifestSha256: sha256File(repoFile(fx, manifestPath)),
    trainingDatasetPath: trainingPath,
    trainingDatasetSha256: sha256File(repoFile(fx, trainingPath)),
    heldoutDatasetPath: heldoutPath,
    heldoutDatasetSha256: sha256File(repoFile(fx, heldoutPath)),
    frozenAt: FORMED,
    ...overrides
  });
}

function packReceipt(fx) {
  return JSON.parse(fs.readFileSync(homeFile(fx, 'birth/receipts/vb5-training-pack.json'), 'utf8'));
}

function addVB6(fx, overrides = {}) {
  const pack = packReceipt(fx);
  writeJson(homeFile(fx, 'birth/receipts/vb6-training-admission.json'), {
    schemaVersion: 'vexlife.vex-birth.training-admission-receipt/v1',
    state: 'ACCEPTED',
    trainingRunRef: TRAINING_RUN_REF,
    singleUse: true,
    trainingMode: 'FOUNDATION_PARTIAL_FULL_RANK',
    sourceModelRevision: 'e'.repeat(40),
    sourceModelSnapshotFingerprint: SOURCE_FP,
    trainingManifestSha256: pack.trainingManifestSha256,
    trainingDatasetSha256: pack.trainingDatasetSha256,
    heldoutDatasetSha256: pack.heldoutDatasetSha256,
    manifestFingerprint: MANIFEST_FP,
    activationAuthorized: false,
    acceptedModelOverwriteAuthorized: false,
    publicUploadAuthorized: false,
    consentReceiptRefs: ['consent.vex-birth.training.001'],
    admittedAt: FORMED,
    expiresAt: FUTURE,
    ...overrides
  });
}

function addVB7(fx, overrides = {}, trainingOverrides = {}) {
  const actualPath = 'runtime/training/vex-foundation-g1-candidate/vex-foundation-training-receipt.json';
  const actual = {
    schemaVersion: 'vexlife.foundation-training-receipt/v1',
    trainingRunRef: TRAINING_RUN_REF,
    trainingMode: 'FOUNDATION_PARTIAL_FULL_RANK',
    manifestFingerprint: MANIFEST_FP,
    sourceModelSnapshotFingerprint: SOURCE_FP,
    trainingActuallyExecuted: true,
    simulationOnly: false,
    modelWeightsChanged: true,
    changedParameterCount: 1024,
    candidateArtifactFingerprint: CANDIDATE_FP,
    activationPerformed: false,
    acceptedCurrentModelOverwritten: false,
    publicUploadPerformed: false,
    rollbackArtifactRef: 'profile.vexlife.operational.g0',
    ...trainingOverrides
  };
  writeJson(homeFile(fx, actualPath), actual);
  writeJson(homeFile(fx, 'birth/receipts/vb7-training-binding.json'), {
    schemaVersion: 'vexlife.vex-birth.training-binding-receipt/v1',
    state: 'ACCEPTED',
    trainingRunRef: TRAINING_RUN_REF,
    realTrainingRunObserved: true,
    sourceArtifactFingerprint: SOURCE_FP,
    candidateArtifactFingerprint: CANDIDATE_FP,
    trainingReceiptPath: actualPath,
    trainingReceiptSha256: sha256File(homeFile(fx, actualPath)),
    boundAt: FORMED,
    ...overrides
  });
}

function addVB8(fx, overrides = {}, evaluationOverrides = {}) {
  const evaluationPath = 'runtime/training/vex-foundation-g1-candidate/vex-foundation-evaluation-receipt.json';
  writeJson(homeFile(fx, evaluationPath), {
    schemaVersion: 'vexlife.foundation-evaluation-receipt/v1',
    trainingRunRef: TRAINING_RUN_REF,
    candidateArtifactFingerprint: CANDIDATE_FP,
    caseCount: 7,
    automaticPromotion: false,
    evaluationDisposition: 'REQUIRES_SEMANTIC_PRIVACY_IDENTITY_CAPABILITY_REVIEW',
    ...evaluationOverrides
  });
  writeJson(homeFile(fx, 'birth/receipts/vb8-baseline-candidate-review.json'), {
    schemaVersion: 'vexlife.vex-birth.baseline-candidate-review-receipt/v1',
    state: 'ACCEPTED',
    trainingRunRef: TRAINING_RUN_REF,
    heldoutEvaluationReturned: true,
    independentAssuranceClear: true,
    humanExperienceReviewRefs: ['review.hx.vex-birth.001'],
    trainingIdentityReviewRefs: ['review.training-identity.vex-birth.001'],
    independentAssuranceRefs: ['assurance.vex-birth.001'],
    reviewLensRefs: [...REGISTRY.reviewLensRefs],
    automaticPromotion: false,
    evaluationReceiptPath: evaluationPath,
    evaluationReceiptSha256: sha256File(homeFile(fx, evaluationPath)),
    reviewedAt: FORMED,
    ...overrides
  });
}

function addVB9(fx, disposition = 'ACCEPT', overrides = {}) {
  const state = disposition === 'REJECT' ? 'REJECTED' : disposition === 'NARROW' ? 'IN_PROGRESS' : 'ACCEPTED';
  writeJson(homeFile(fx, 'birth/receipts/vb9-candidate-disposition.json'), {
    schemaVersion: 'vexlife.vex-birth.candidate-disposition-receipt/v1',
    state,
    trainingRunRef: TRAINING_RUN_REF,
    candidateArtifactFingerprint: CANDIDATE_FP,
    candidateDisposition: disposition,
    independentAssuranceClear: true,
    dispositionRef: `disposition.vex-birth.${disposition.toLowerCase()}.001`,
    formedAt: FORMED,
    ...overrides
  });
}

function addVB10(fx, overrides = {}) {
  writeJson(homeFile(fx, 'birth/receipts/vb10-g1-registration.json'), {
    schemaVersion: 'vexlife.vex-birth.g1-registration-receipt/v1',
    state: 'ACCEPTED',
    acceptedG1Registered: true,
    g0RollbackPreserved: true,
    g0ModelRef: G0_REF,
    g1ModelRef: G1_REF,
    candidateArtifactFingerprint: CANDIDATE_FP,
    registeredAt: FORMED,
    ...(overrides.registration ?? {})
  });
  writeJson(homeFile(fx, 'birth/receipts/vb10-g1-activation.json'), {
    schemaVersion: 'vexlife.vex-birth.g1-activation-receipt/v1',
    state: 'ACCEPTED',
    g1ActivatedBySeparateAuthority: true,
    separateFromTrainingRun: true,
    trainingRunPerformedActivation: false,
    g0RollbackPreserved: true,
    selectedModelRef: G1_REF,
    priorModelRef: G0_REF,
    activatedAt: FORMED,
    ...(overrides.activation ?? {})
  });
}

function addVB11(fx, overrides = {}) {
  writeJson(homeFile(fx, 'birth/receipts/vb11-g1-wake.json'), {
    schemaVersion: 'vexlife.vex-birth.g1-wake-receipt/v1',
    state: 'ACCEPTED',
    selectedModelRef: G1_REF,
    homeRef: HOME_REF,
    companionLineageRef: LINEAGE_REF,
    g1WakeWitnessed: true,
    sameHomeRef: true,
    sameCompanionLineageRef: true,
    relationshipContinuityWitnessed: true,
    generationIdentityTruthful: true,
    witnessResponseRefs: ['message.g1-wake.response.001'],
    wokeAt: FORMED,
    ...overrides
  });
}

function addVB12(fx, overrides = {}) {
  writeJson(homeFile(fx, 'birth/receipts/vb12-clean-replay.json'), {
    schemaVersion: 'vexlife.vex-birth.clean-replay-receipt/v1',
    state: 'ACCEPTED',
    victorReadableRunbookAccepted: true,
    cleanReadmeReplayObserved: true,
    isolatedHomeUsed: true,
    hiddenDevelopmentHelpUsed: false,
    runbookCommitSha: 'f'.repeat(40),
    replayedStageRefs: REGISTRY.stages.slice(0, 12).map((stage) => stage.stageRef),
    replayedAt: FORMED,
    ...overrides
  });
}

const ADDERS = [addVB0, addVB1, addVB2, addVB3, addVB4, addVB5, addVB6, addVB7, addVB8];

function addThrough(fx, lastCode, options = {}) {
  const number = Number(lastCode.slice(2));
  for (let index = 0; index <= Math.min(number, 8); index += 1) ADDERS[index](fx);
  if (number >= 9) addVB9(fx, options.disposition ?? 'ACCEPT');
  if (number >= 10) addVB10(fx);
  if (number >= 11) addVB11(fx);
  if (number >= 12) addVB12(fx);
}

function evaluate(fx) {
  return evaluateVexBirth({
    home: fx.home,
    repositoryRoot: fx.repositoryRoot,
    registry: REGISTRY,
    now: NOW
  });
}

function treeFingerprint(root) {
  const entries = [];
  function visit(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name);
      const relative = path.relative(root, file).replaceAll(path.sep, '/');
      const stat = fs.lstatSync(file);
      if (stat.isDirectory()) {
        entries.push(`D ${relative}`);
        visit(file);
      } else entries.push(`F ${relative} ${stat.size} ${sha256File(file)}`);
    }
  }
  visit(root);
  return sha256(entries.join('\n'));
}

function cleanup(t, fx) {
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));
}

test('empty Home is honest: VB0 is ready and no completion claim is allowed', (t) => {
  const fx = fixture(); cleanup(t, fx);
  fs.rmSync(fx.home, { recursive: true, force: true });
  const status = evaluate(fx);
  assert.equal(status.birthState, 'VEX_BIRTH_INCOMPLETE');
  assert.equal(status.currentStageCode, 'VB0');
  assert.equal(status.stages[0].state, 'READY_FOR_HUMAN_ACTION');
  assert.equal(status.completionClaimAllowed, false);
});

test('clean base install does not impersonate an untaught baseline witness', (t) => {
  const fx = fixture(); cleanup(t, fx);
  addVB0(fx); addVB1(fx);
  const status = evaluate(fx);
  assert.equal(status.stages[0].state, 'ACCEPTED');
  assert.equal(status.stages[1].state, 'ACCEPTED');
  assert.equal(status.currentStageCode, 'VB2');
  assert.equal(status.stages[2].state, 'READY_FOR_HUMAN_ACTION');
  assert.equal(status.terminalPredicate.values.untaughtBaselineWitnessed, false);
});

test('cultivation and Dream evidence cannot claim neural learning', (t) => {
  const fx = fixture(); cleanup(t, fx);
  addThrough(fx, 'VB4');
  const status = evaluate(fx);
  assert.equal(status.stages[4].state, 'ACCEPTED');
  assert.equal(status.currentStageCode, 'VB5');
  assert.equal(status.terminalPredicate.values.modelWeightsChanged, false);
  assert.equal(status.completionClaimAllowed, false);
});

test('source-green training plan without execution remains blocked before VB7', (t) => {
  const fx = fixture(); cleanup(t, fx);
  addThrough(fx, 'VB6');
  const status = evaluate(fx);
  assert.equal(status.stages[6].state, 'ACCEPTED');
  assert.equal(status.currentStageCode, 'VB7');
  assert.equal(status.stages[7].state, 'IN_PROGRESS');
  assert.equal(status.terminalPredicate.values.trainingActuallyExecuted, false);
});

test('a receipt claiming changed weights=false is rejected as invalid VB7 evidence', (t) => {
  const fx = fixture(); cleanup(t, fx);
  addThrough(fx, 'VB6');
  addVB7(fx, {}, { modelWeightsChanged: false });
  const status = evaluate(fx);
  assert.equal(status.stages[7].state, 'BLOCKED');
  assert.match(status.stages[7].evidence[0].errors.join('\n'), /modelWeightsChanged/);
  assert.equal(status.completionClaimAllowed, false);
});

test('changed weights without held-out evaluation cannot advance beyond VB7', (t) => {
  const fx = fixture(); cleanup(t, fx);
  addThrough(fx, 'VB7');
  const status = evaluate(fx);
  assert.equal(status.stages[7].state, 'ACCEPTED');
  assert.equal(status.currentStageCode, 'VB8');
  assert.equal(status.terminalPredicate.values.modelWeightsChanged, true);
  assert.equal(status.terminalPredicate.values.heldoutEvaluationReturned, false);
});

test('candidate artifact must differ from the source artifact', (t) => {
  const fx = fixture(); cleanup(t, fx);
  addThrough(fx, 'VB6');
  addVB7(fx, { candidateArtifactFingerprint: SOURCE_FP });
  const status = evaluate(fx);
  assert.equal(status.stages[7].state, 'BLOCKED');
  assert.match(status.stages[7].evidence[0].errors.join('\n'), /must differ/);
});

test('mismatched training-run identity blocks evaluation composition', (t) => {
  const fx = fixture(); cleanup(t, fx);
  addThrough(fx, 'VB7');
  addVB8(fx, { trainingRunRef: 'training-run.other' });
  const status = evaluate(fx);
  assert.equal(status.stages[8].state, 'BLOCKED');
  assert.match(status.stages[8].bindingErrors.join('\n'), /does not match/);
});

test('NARROW returns to stabilization and never activates G1', (t) => {
  const fx = fixture(); cleanup(t, fx);
  addThrough(fx, 'VB9', { disposition: 'NARROW' });
  const status = evaluate(fx);
  assert.equal(status.birthState, 'VEX_BIRTH_INCOMPLETE');
  assert.equal(status.stages[9].state, 'IN_PROGRESS');
  assert.match(status.nextAction, /Return to VB4\/VB5/);
  assert.equal(status.stages[10].state, 'BLOCKED');
});

test('REJECT preserves G0 and cannot be represented as first birth', (t) => {
  const fx = fixture(); cleanup(t, fx);
  addThrough(fx, 'VB9', { disposition: 'REJECT' });
  const status = evaluate(fx);
  assert.equal(status.birthState, 'VEX_G1_CANDIDATE_REJECTED');
  assert.equal(status.stages[9].state, 'REJECTED');
  assert.equal(status.completionClaimAllowed, false);
  assert.match(status.nextAction, /Keep G0 current/);
});

test('ACCEPT without separate activation remains incomplete at VB10', (t) => {
  const fx = fixture(); cleanup(t, fx);
  addThrough(fx, 'VB9');
  const status = evaluate(fx);
  assert.equal(status.stages[9].state, 'ACCEPTED');
  assert.equal(status.currentStageCode, 'VB10');
  assert.equal(status.terminalPredicate.values.g1ActivatedBySeparateAuthority, false);
});

test('registration without activation is partial evidence, not acceptance', (t) => {
  const fx = fixture(); cleanup(t, fx);
  addThrough(fx, 'VB9');
  writeJson(homeFile(fx, 'birth/receipts/vb10-g1-registration.json'), {
    schemaVersion: 'vexlife.vex-birth.g1-registration-receipt/v1',
    state: 'ACCEPTED',
    acceptedG1Registered: true,
    g0RollbackPreserved: true,
    g0ModelRef: G0_REF,
    g1ModelRef: G1_REF,
    candidateArtifactFingerprint: CANDIDATE_FP,
    registeredAt: FORMED
  });
  const status = evaluate(fx);
  assert.equal(status.stages[10].state, 'IN_PROGRESS');
  assert.equal(status.terminalPredicate.values.acceptedG1Registered, true);
  assert.equal(status.terminalPredicate.values.g1ActivatedBySeparateAuthority, false);
});

test('activation without a truthful G1 wake remains incomplete at VB11', (t) => {
  const fx = fixture(); cleanup(t, fx);
  addThrough(fx, 'VB10');
  const status = evaluate(fx);
  assert.equal(status.stages[10].state, 'ACCEPTED');
  assert.equal(status.currentStageCode, 'VB11');
  assert.equal(status.terminalPredicate.values.g1WakeWitnessed, false);
});

test('a witnessed G1 wake still requires a clean Victor-runbook replay', (t) => {
  const fx = fixture(); cleanup(t, fx);
  addThrough(fx, 'VB11');
  const status = evaluate(fx);
  assert.equal(status.stages[11].state, 'ACCEPTED');
  assert.equal(status.currentStageCode, 'VB12');
  assert.equal(status.terminalPredicate.values.cleanReadmeReplayObserved, false);
});

test('all exact terminal evidence is required before VEX_G1_BORN', (t) => {
  const fx = fixture(); cleanup(t, fx);
  addThrough(fx, 'VB12');
  const status = evaluate(fx);
  assert.equal(status.birthState, 'VEX_G1_BORN');
  assert.equal(status.completionClaimAllowed, true);
  assert.equal(status.summary.acceptedStages, 13);
  assert.equal(status.terminalPredicate.satisfied, true);
  assert.equal(status.terminalPredicate.ordered.every((item) => item.satisfied), true);
});

test('malformed evidence fails closed and does not erase the exact failure', (t) => {
  const fx = fixture(); cleanup(t, fx);
  addVB0(fx);
  fs.mkdirSync(path.dirname(homeFile(fx, 'recovery/bootstrap-receipt.json')), { recursive: true });
  fs.writeFileSync(homeFile(fx, 'recovery/bootstrap-receipt.json'), '{', 'utf8');
  const status = evaluate(fx);
  assert.equal(status.stages[1].state, 'BLOCKED');
  assert.match(status.stages[1].evidence[0].errors.join('\n'), /invalid JSON/);
});

test('status evaluation is read-only over Home and repository evidence', (t) => {
  const fx = fixture(); cleanup(t, fx);
  addThrough(fx, 'VB12');
  const beforeHome = treeFingerprint(fx.home);
  const beforeRepo = treeFingerprint(fx.repositoryRoot);
  const status = evaluate(fx);
  const afterHome = treeFingerprint(fx.home);
  const afterRepo = treeFingerprint(fx.repositoryRoot);
  assert.equal(status.readOnly, true);
  assert.equal(afterHome, beforeHome);
  assert.equal(afterRepo, beforeRepo);
});
