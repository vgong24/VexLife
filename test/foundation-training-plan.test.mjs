import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  FoundationTrainingPlanError,
  validateFoundationTrainingManifest
} from '../scripts/foundation-training-plan.mjs';

const sha = value => crypto.createHash('sha256').update(value).digest('hex');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-g04b-'));
  const train = Buffer.from('{"exampleRef":"e1"}\n');
  const heldout = Buffer.from('{"exampleRef":"h1"}\n');
  fs.writeFileSync(path.join(root, 'train.jsonl'), train);
  fs.writeFileSync(path.join(root, 'heldout.jsonl'), heldout);
  const manifest = {
    schemaVersion: 'vexlife.foundation-training-manifest/v1',
    trainingRunRef: 'training-run.vexlife.g04b.test.001',
    trainingMode: 'FOUNDATION_PARTIAL_FULL_RANK',
    sourceModelRepo: 'Qwen/Qwen3.5-4B',
    sourceModelRevision: '1'.repeat(40),
    sourceModelSnapshotFingerprint: '2'.repeat(64),
    licenseRef: 'license.apache-2.0.qwen3.5',
    trainingDatasetPath: 'train.jsonl',
    trainingDatasetSha256: sha(train),
    heldoutDatasetPath: 'heldout.jsonl',
    heldoutDatasetSha256: sha(heldout),
    sourceLessonRefs: ['github.issue.vextreme-sdk.335'],
    sourceScoreRefs: [],
    consentReceiptRefs: ['consent.g04b.test'],
    trainingIdentityRefs: ['github.issue.vextreme-sdk.335'],
    protectedInvariantRefs: ['invariant.accepted-model-generation-not-overwritten-in-place'],
    parameterSelection: {
      strategy: 'LAST_N_LANGUAGE_BLOCKS',
      count: 2,
      includeLmHead: false
    },
    seed: 240824,
    maxSteps: 1,
    epochs: 1,
    learningRate: 0.000002,
    maxSequenceLength: 512,
    gradientAccumulationSteps: 1,
    precision: 'bf16',
    optimizer: 'adamw',
    outputDir: 'output/candidate',
    expectedHardwareProfileRef: 'hardware.windows-x64.nvidia.cuda12-compatible',
    rollbackArtifactRef: 'profile.vexlife.operational.qwen3.5-4b.llama-cpp-b10107.windows-x64-nvidia.001',
    activationAuthorized: false,
    publicUploadAuthorized: false
  };
  return {root, manifest};
}

function expectCode(fn, code) {
  assert.throws(fn, error => {
    assert.ok(error instanceof FoundationTrainingPlanError);
    assert.equal(error.code, code);
    return true;
  });
}

test('G04B partial full-rank plan is admitted only as real-weight-change eligible', t => {
  const {root, manifest} = fixture();
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const plan = validateFoundationTrainingManifest(manifest, {repoRoot: root});
  assert.equal(plan.trainingMode, 'FOUNDATION_PARTIAL_FULL_RANK');
  assert.equal(plan.foundationWeightChangeEligible, true);
  assert.equal(plan.adapterOnlyTerminalEligible, false);
  assert.equal(plan.realExecutionRequired, true);
  assert.equal(plan.nonzeroChangedParameterRequired, true);
  assert.equal(plan.automaticActivation, false);
  assert.equal(plan.currentAcceptedGenerationOverwrite, false);
});

test('FOUNDATION_FULL remains a first-class permitted plan', t => {
  const {root, manifest} = fixture();
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  manifest.trainingMode = 'FOUNDATION_FULL';
  delete manifest.parameterSelection;
  const plan = validateFoundationTrainingManifest(manifest, {repoRoot: root});
  assert.equal(plan.trainingMode, 'FOUNDATION_FULL');
  assert.equal(plan.foundationWeightChangeEligible, true);
  assert.equal(plan.adapterOnlyTerminalEligible, false);
});

test('adapter probe can never satisfy the foundation terminal predicate', t => {
  const {root, manifest} = fixture();
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  manifest.trainingMode = 'ADAPTER_PROBE';
  delete manifest.parameterSelection;
  const plan = validateFoundationTrainingManifest(manifest, {repoRoot: root});
  assert.equal(plan.foundationWeightChangeEligible, false);
  assert.equal(plan.adapterOnlyTerminalEligible, false);
  assert.equal(plan.realExecutionRequired, true);
});

test('unpinned model revision fails closed', t => {
  const {root, manifest} = fixture();
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  manifest.sourceModelRevision = 'main';
  expectCode(() => validateFoundationTrainingManifest(manifest, {repoRoot: root}), 'G04B_SOURCE_MODEL_NOT_PINNED');
});

test('dataset hash mismatch fails closed', t => {
  const {root, manifest} = fixture();
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  manifest.trainingDatasetSha256 = '0'.repeat(64);
  expectCode(() => validateFoundationTrainingManifest(manifest, {repoRoot: root}), 'G04B_DATASET_HASH_MISMATCH');
});

test('zero-step plan cannot masquerade as neural learning', t => {
  const {root, manifest} = fixture();
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  manifest.maxSteps = 0;
  expectCode(() => validateFoundationTrainingManifest(manifest, {repoRoot: root}), 'G04B_NO_REAL_STEP');
});

test('training cannot authorize its own activation', t => {
  const {root, manifest} = fixture();
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  manifest.activationAuthorized = true;
  expectCode(() => validateFoundationTrainingManifest(manifest, {repoRoot: root}), 'G04B_ACTIVATION_COLLAPSE');
});

test('partial full-rank mode requires an explicit nonzero language-block selection', t => {
  const {root, manifest} = fixture();
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  manifest.parameterSelection.count = 0;
  expectCode(() => validateFoundationTrainingManifest(manifest, {repoRoot: root}), 'G04B_PARAMETER_SELECTION_INVALID');
});
