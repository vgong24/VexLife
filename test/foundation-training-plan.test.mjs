import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
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

function pythonRuntime() {
  const candidates = process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];
  for (const command of candidates) {
    const probe = spawnSync(command, command === 'py' ? ['-3', '--version'] : ['--version'], {encoding: 'utf8'});
    if (!probe.error && probe.status === 0) return {command, prefix: command === 'py' ? ['-3'] : []};
  }
  return null;
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
  assert.equal(plan.sourceModelSnapshotFingerprint, manifest.sourceModelSnapshotFingerprint);
  assert.equal(plan.sourceModelSnapshotFingerprintObserved, false);
  assert.equal(plan.sourceModelIdentityClass, 'EXACT_REPOSITORY_PLUS_COMMIT_REVISION');
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

test('training manifest cannot carry source-model network authority', t => {
  for (const modelDownloadAuthorized of [false, true]) {
    const {root, manifest} = fixture();
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    manifest.modelDownloadAuthorized = modelDownloadAuthorized;
    expectCode(() => validateFoundationTrainingManifest(manifest, {repoRoot: root}), 'G04B_NETWORK_AUTHORITY_COLLAPSE');
  }
});

test('partial full-rank mode requires an explicit nonzero language-block selection', t => {
  const {root, manifest} = fixture();
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  manifest.parameterSelection.count = 0;
  expectCode(() => validateFoundationTrainingManifest(manifest, {repoRoot: root}), 'G04B_PARAMETER_SELECTION_INVALID');
});

test('generation-1 Python trainer and evaluator compile without mutating the source tree', t => {
  const runtime = pythonRuntime();
  if (!runtime) {
    t.skip('Python runtime is not available on this repository validation host');
    return;
  }
  const files = [
    'training/foundation-generation/foundation_train.py',
    'training/foundation-generation/foundation_evaluate.py'
  ];
  const compileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-g04b-python-compile-'));
  t.after(() => fs.rmSync(compileRoot, {recursive: true, force: true}));
  const compileScript = [
    'import pathlib, py_compile, sys',
    'output = pathlib.Path(sys.argv[1])',
    'output.mkdir(parents=True, exist_ok=True)',
    'for index, source in enumerate(sys.argv[2:]):',
    "    py_compile.compile(source, cfile=str(output / f'{index}.pyc'), doraise=True)"
  ].join('\n');
  const result = spawnSync(runtime.command, [
    ...runtime.prefix,
    '-c',
    compileScript,
    compileRoot,
    ...files
  ], {encoding: 'utf8'});
  assert.equal(result.status, 0, `Python compile failed:\n${result.stdout}\n${result.stderr}`);
  assert.deepEqual(
    fs.readdirSync(compileRoot).sort(),
    ['0.pyc', '1.pyc'],
    'Python validation must emit bytecode only into the isolated temporary compile root'
  );
});

test('Python trainer and evaluator reject caller model-download authority before runtime loading', t => {
  const runtime = pythonRuntime();
  if (!runtime) {
    t.skip('Python runtime is not available on this repository validation host');
    return;
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-g04b-network-authority-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const manifestPath = path.join(root, 'manifest.json');
  const {root: fixtureRoot, manifest} = fixture();
  t.after(() => fs.rmSync(fixtureRoot, {recursive: true, force: true}));
  manifest.modelDownloadAuthorized = true;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const trainSource = path.resolve('training/foundation-generation/foundation_train.py');
  const evalSource = path.resolve('training/foundation-generation/foundation_evaluate.py');
  const script = [
    'import importlib.util, pathlib, sys',
    'manifest = pathlib.Path(sys.argv[1])',
    'for index, source in enumerate(sys.argv[2:]):',
    '    spec = importlib.util.spec_from_file_location(f"g04b_module_{index}", pathlib.Path(source))',
    '    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)',
    '    try:',
    '        mod.load_manifest(manifest)',
    '    except Exception as exc:',
    '        if "modelDownloadAuthorized" not in str(exc): raise',
    '    else:',
    '        raise SystemExit(f"{source} accepted caller model-download authority")',
    'print("NETWORK_AUTHORITY_REJECTED")'
  ].join('\n');
  const result = spawnSync(runtime.command, [...runtime.prefix, '-c', script, manifestPath, trainSource, evalSource], {
    encoding: 'utf8',
    env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /NETWORK_AUTHORITY_REJECTED/u);
});

test('post-optimizer failures preserve effect truth instead of claiming no training occurred', t => {
  const runtime = pythonRuntime();
  if (!runtime) {
    t.skip('Python runtime is not available on this repository validation host');
    return;
  }
  const source = path.resolve('training/foundation-generation/foundation_train.py');
  const script = [
    'import importlib.util, json, pathlib, sys',
    'spec = importlib.util.spec_from_file_location("g04b_train", pathlib.Path(sys.argv[1]))',
    'mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)',
    'states = []',
    'states.append(mod.training_failure_truth(mod.fresh_attempt_state()))',
    'states.append(mod.training_failure_truth({"optimizerAttempted": True, "optimizerSteps": 0, "selectedParameterChangeState": "NOT_OBSERVED"}))',
    'states.append(mod.training_failure_truth({"optimizerAttempted": True, "optimizerSteps": 1, "selectedParameterChangeState": "NOT_OBSERVED"}))',
    'states.append(mod.training_failure_truth({"optimizerAttempted": True, "optimizerSteps": 1, "selectedParameterChangeState": "CHANGED"}))',
    'states.append(mod.training_failure_truth({"optimizerAttempted": True, "optimizerSteps": 1, "selectedParameterChangeState": "UNCHANGED"}))',
    'print(json.dumps(states))'
  ].join('\n');
  const result = spawnSync(runtime.command, [...runtime.prefix, '-c', script, source], {
    encoding: 'utf8',
    env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}
  });
  assert.equal(result.status, 0, result.stderr);
  const states = JSON.parse(result.stdout);
  assert.deepEqual(states[0], {effectState: 'PRE_EXECUTION_NO_EFFECT', trainingActuallyExecuted: false, modelWeightsChanged: false, optimizerSteps: 0});
  assert.equal(states[1].effectState, 'OPTIMIZER_ATTEMPT_EFFECT_UNKNOWN');
  assert.equal(states[1].trainingActuallyExecuted, null);
  assert.equal(states[1].modelWeightsChanged, null);
  assert.equal(states[2].effectState, 'POST_OPTIMIZER_CHANGE_UNKNOWN');
  assert.equal(states[2].trainingActuallyExecuted, true);
  assert.equal(states[2].modelWeightsChanged, null);
  assert.equal(states[3].effectState, 'POST_OPTIMIZER_CHANGED');
  assert.equal(states[3].trainingActuallyExecuted, true);
  assert.equal(states[3].modelWeightsChanged, true);
  assert.equal(states[4].effectState, 'POST_OPTIMIZER_UNCHANGED');
  assert.equal(states[4].trainingActuallyExecuted, true);
  assert.equal(states[4].modelWeightsChanged, false);
});

test('evaluator rebinds exact candidate bytes and rejects post-training drift', t => {
  const runtime = pythonRuntime();
  if (!runtime) {
    t.skip('Python runtime is not available on this repository validation host');
    return;
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-g04b-candidate-binding-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const candidate = path.join(root, 'candidate');
  fs.mkdirSync(candidate);
  fs.writeFileSync(path.join(candidate, 'model.safetensors'), 'candidate-v1');
  fs.writeFileSync(path.join(candidate, 'config.json'), '{}');
  const source = path.resolve('training/foundation-generation/foundation_evaluate.py');
  const script = [
    'import importlib.util, json, pathlib, sys',
    'source = pathlib.Path(sys.argv[1]); candidate = pathlib.Path(sys.argv[2])',
    'spec = importlib.util.spec_from_file_location("g04b_eval", source)',
    'mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)',
    'manifest = {"trainingRunRef":"run.test","sourceModelRepo":"Qwen/Qwen3.5-4B","sourceModelRevision":"1"*40,"sourceModelSnapshotFingerprint":"2"*64,"trainingDatasetSha256":"3"*64,"heldoutDatasetSha256":"4"*64}',
    'digests = mod.candidate_file_digests(candidate)',
    'fingerprint = mod.sha256_bytes(mod.canonical_json(digests))',
    'receipt = {"schemaVersion":"vexlife.foundation-training-receipt/v1","trainingRunRef":manifest["trainingRunRef"],"sourceModelRepo":manifest["sourceModelRepo"],"sourceModelRevision":manifest["sourceModelRevision"],"sourceModelSnapshotFingerprint":manifest["sourceModelSnapshotFingerprint"],"sourceModelSnapshotFingerprintObserved":False,"sourceModelIdentityClass":"EXACT_REPOSITORY_PLUS_COMMIT_REVISION","trainingDatasetSha256":manifest["trainingDatasetSha256"],"heldoutDatasetSha256":manifest["heldoutDatasetSha256"],"trainingActuallyExecuted":True,"modelWeightsChanged":True,"changedParameterCount":1,"candidateArtifactDigests":digests,"candidateArtifactFingerprint":fingerprint}',
    '(candidate / "vex-foundation-training-receipt.json").write_text(json.dumps(receipt), encoding="utf-8")',
    'verified = mod.verify_candidate_receipt_binding(candidate, manifest)',
    'print("PASS1", verified[2])',
    '(candidate / "model.safetensors").write_text("candidate-v2", encoding="utf-8")',
    'try:',
    '    mod.verify_candidate_receipt_binding(candidate, manifest)',
    'except mod.FoundationEvaluationError as exc:',
    '    print("PASS2", str(exc))',
    'else:',
    '    raise SystemExit("post-training candidate drift was accepted")'
  ].join('\n');
  const result = spawnSync(runtime.command, [...runtime.prefix, '-c', script, source, candidate], {
    encoding: 'utf8',
    env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS1 [0-9a-f]{64}/u);
  assert.match(result.stdout, /PASS2 candidate bytes drifted after training/u);
});