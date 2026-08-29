import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  G04B_NATIVE_WORKER_PACKET_SCHEMA,
  G04B_SOURCE_SNAPSHOT_FINGERPRINT_SCHEMA,
  G04B_SOURCE_SNAPSHOT_INVENTORY_SCHEMA,
  buildG04BNativeWorkerManifest,
  executeG04BNativeTrainingWorker,
  nodeRuntimeBindingFingerprint,
  verifyG04BMachineResult,
  verifyG04BNodeRuntimeBinding,
  verifyG04BSourceSnapshot
} from '../src/core/g04b-native-training-worker.mjs';

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const canonicalize = (value) => Array.isArray(value)
  ? value.map(canonicalize)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
    : value;
const fingerprint = (value) => sha(JSON.stringify(canonicalize(value)));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-g04b-worker-'));
  const sourceRoot = path.join(root, 'source');
  const vexHomeRoot = path.join(root, 'home');
  const cacheRoot = path.join(vexHomeRoot, 'models', 'huggingface', 'hub');
  const revision = '851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a';
  const snapshotRoot = path.join(cacheRoot, 'models--Qwen--Qwen3.5-4B', 'snapshots', revision);
  const nodeExecutablePath = path.join(vexHomeRoot, 'runtime', 'artifacts', 'node-v22.23.2', 'bin', 'node');
  const pythonExecutablePath = path.join(vexHomeRoot, 'runtime', 'artifacts', 'cpython-3.12.14', 'bin', 'python3.12');
  const manifestPath = path.join(sourceRoot, 'runtime', 'training', 'g04b', 'manifest.json');
  const trainerPath = path.join(sourceRoot, 'training', 'foundation-generation', 'foundation_train.py');
  const evaluatorPath = path.join(sourceRoot, 'training', 'foundation-generation', 'foundation_evaluate.py');
  for (const directory of [snapshotRoot, path.dirname(nodeExecutablePath), path.dirname(pythonExecutablePath), path.dirname(manifestPath), path.dirname(trainerPath)]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.writeFileSync(nodeExecutablePath, '# fake exact node runtime bytes\n');
  fs.writeFileSync(pythonExecutablePath, '# fake isolated python bytes\n');
  fs.writeFileSync(trainerPath, '# fixed trainer placeholder\n');
  fs.writeFileSync(evaluatorPath, '# fixed evaluator placeholder\n');
  const snapshotFiles = [
    ['config.json', Buffer.from('{"model_type":"qwen3_5"}\n')],
    ['model-00001-of-00002.safetensors', Buffer.from('first shard bytes')]
  ];
  const files = snapshotFiles.map(([relative, bytes]) => {
    const target = path.join(snapshotRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    return { path: relative, bytes: bytes.length, sha256: sha(bytes) };
  }).sort((a, b) => a.path.localeCompare(b.path));
  const inventoryBase = {
    schemaVersion: G04B_SOURCE_SNAPSHOT_INVENTORY_SCHEMA,
    sourceModelRepo: 'Qwen/Qwen3.5-4B',
    sourceModelRevision: revision,
    files
  };
  const snapshotFingerprint = fingerprint({
    schemaVersion: G04B_SOURCE_SNAPSHOT_FINGERPRINT_SCHEMA,
    sourceModelRepo: inventoryBase.sourceModelRepo,
    sourceModelRevision: inventoryBase.sourceModelRevision,
    files
  });
  const inventory = { ...inventoryBase, snapshotFingerprint };
  const sourceManifestFingerprint = 'a'.repeat(64);
  const manifest = {
    schemaVersion: 'vexlife.foundation-training-manifest/v1',
    trainingRunRef: 'training.g04b.first-proof.001',
    trainingMode: 'FOUNDATION_PARTIAL_FULL_RANK',
    sourceModelRepo: inventory.sourceModelRepo,
    sourceModelRevision: revision,
    sourceModelSnapshotFingerprint: snapshotFingerprint,
    sourceManifestFingerprint,
    licenseRef: 'license.apache-2.0.qwen3.5-4b',
    trainingDatasetPath: 'runtime/training/g04b/train.jsonl',
    trainingDatasetSha256: 'b'.repeat(64),
    heldoutDatasetPath: 'runtime/training/g04b/heldout.jsonl',
    heldoutDatasetSha256: 'c'.repeat(64),
    sourceLessonRefs: ['lesson.g04b.first-proof'],
    sourceScoreRefs: [],
    consentReceiptRefs: ['consent.g04b.first-proof.001'],
    trainingIdentityRefs: ['training-identity.g04b.first-proof'],
    protectedInvariantRefs: ['invariant.no-activation'],
    parameterSelection: { strategy: 'LAST_N_LANGUAGE_BLOCKS', count: 1, includeLmHead: false },
    seed: 7,
    maxSteps: 1,
    epochs: 1,
    learningRate: 0.000001,
    maxSequenceLength: 64,
    gradientAccumulationSteps: 1,
    precision: 'fp32',
    optimizer: 'adamw',
    executionDevice: 'MPS',
    expectedHardwareProfileRef: 'hardware.macos-arm64.apple-m4-pro.metal',
    rollbackArtifactRef: 'rollback.g04b.first-proof.g0',
    outputDir: 'runtime/training/g04b/candidate-001',
    activationAuthorized: false,
    publicUploadAuthorized: false
  };
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(manifestPath, manifestBytes);
  fs.writeFileSync(path.join(sourceRoot, 'runtime', 'training', 'g04b', 'train.jsonl'), '{}\n');
  fs.writeFileSync(path.join(sourceRoot, 'runtime', 'training', 'g04b', 'heldout.jsonl'), '{}\n');
  const nodeRuntimeBinding = {
    schemaVersion: 'vexlife.native-worker-runtime-binding/v1',
    bindingRef: 'binding.node.g04b.first-proof.001',
    executableRef: 'runtime.node.v22.exact',
    executablePath: nodeExecutablePath,
    executableSha256: sha(fs.readFileSync(nodeExecutablePath)),
    hostRef: 'host.macos.m4-pro.first-proof',
    observedAt: '2026-08-29T01:00:00.000Z'
  };
  const packet = {
    schemaVersion: G04B_NATIVE_WORKER_PACKET_SCHEMA,
    workerRef: 'worker.g04b.first-proof.001',
    workRef: 'work.vexlife.g04b.real-neural-foundation-evolution.20260824.001',
    purposeRef: 'purpose.g04b.real-neural-first-proof',
    resultContractRef: 'result-contract.g04b.real-neural-first-proof.v1',
    resultRef: 'result.g04b.real-neural-first-proof.001',
    executionAuthorityRef: 'authority.g04b.real-training-effect.001',
    hostRef: nodeRuntimeBinding.hostRef,
    nodeRuntimeBinding,
    trainingManifestPath: 'runtime/training/g04b/manifest.json',
    trainingManifestSha256: sha(manifestBytes),
    pythonExecutableRef: 'runtime.python.cpython-3.12.14.macos-arm64',
    pythonExecutablePath,
    pythonExecutableSha256: sha(fs.readFileSync(pythonExecutablePath)),
    vexHomeRoot,
    huggingFaceHubCacheRoot: cacheRoot,
    sourceSnapshotRoot: snapshotRoot,
    sourceSnapshotInventory: inventory,
    expectedExecutionDevice: 'MPS',
    expectedHardwareProfileRef: 'hardware.macos-arm64.apple-m4-pro.metal'
  };
  const executionObservationFingerprint = 'd'.repeat(64);
  const observation = { observationFingerprint: executionObservationFingerprint };
  const priorModelIdentity = 'model-source.vexlife.sha256.' + 'e'.repeat(64);
  const candidateModelIdentity = 'model-candidate.vexlife.sha256.' + 'f'.repeat(64);
  const candidateArtifactFingerprint = '1'.repeat(64);
  const inspection = {
    schemaVersion: 'vexlife.foundation-training-inspection/v1',
    trainingRunRef: manifest.trainingRunRef,
    sourceModelRepo: manifest.sourceModelRepo,
    sourceModelRevision: manifest.sourceModelRevision,
    sourceModelSnapshotFingerprint: manifest.sourceModelSnapshotFingerprint,
    sourceModelSnapshotFingerprintObserved: false,
    sourceManifestFingerprint: manifest.sourceManifestFingerprint,
    sourceManifestFingerprintObserved: false,
    executionDevice: 'MPS',
    expectedHardwareProfileRef: manifest.expectedHardwareProfileRef,
    executionObservation: observation,
    executionObservationFingerprint,
    localFilesOnly: true,
    modelPlacedOnExecutionDevice: true,
    deviceType: 'mps'
  };
  const training = {
    ...inspection,
    schemaVersion: 'vexlife.foundation-training-receipt/v1',
    priorModelIdentity,
    candidateModelIdentity,
    candidateArtifactFingerprint,
    trainingActuallyExecuted: true,
    modelWeightsChanged: true,
    changedParameterCount: 42,
    activationPerformed: false
  };
  delete training.localFilesOnly;
  delete training.modelPlacedOnExecutionDevice;
  delete training.deviceType;
  const evaluation = {
    schemaVersion: 'vexlife.foundation-evaluation-receipt/v1',
    trainingRunRef: manifest.trainingRunRef,
    trainingExecutionDevice: 'MPS',
    trainingExpectedHardwareProfileRef: manifest.expectedHardwareProfileRef,
    priorModelIdentity,
    candidateModelIdentity,
    candidateArtifactFingerprint,
    automaticPromotion: false
  };
  const plan = {
    trainingRunRef: manifest.trainingRunRef,
    sourceModelRepo: manifest.sourceModelRepo,
    sourceModelRevision: manifest.sourceModelRevision,
    sourceModelSnapshotFingerprint: manifest.sourceModelSnapshotFingerprint,
    executionDevice: 'MPS',
    expectedHardwareProfileRef: manifest.expectedHardwareProfileRef,
    realExecutionRequired: true,
    realOptimizerStepRequired: true,
    nonzeroChangedParameterRequired: true,
    automaticActivation: false
  };
  return { root, sourceRoot, vexHomeRoot, cacheRoot, snapshotRoot, manifestPath, manifest, nodeRuntimeBinding, packet, inspection, training, evaluation, plan };
}

function runnerFor(fx, { forgeEvaluation = false } = {}) {
  const calls = [];
  const runner = async (_executable, argv) => {
    calls.push(argv);
    if (argv.includes('--inspect-only')) return { code: 0, signal: null, stdout: JSON.stringify(fx.inspection), stderr: '' };
    if (argv.includes('--execute')) return { code: 0, signal: null, stdout: JSON.stringify(fx.training), stderr: '' };
    const evaluation = forgeEvaluation ? { ...fx.evaluation, candidateArtifactFingerprint: '9'.repeat(64) } : fx.evaluation;
    return { code: 0, signal: null, stdout: JSON.stringify(evaluation), stderr: '' };
  };
  return { calls, runner };
}

function planValidatorFor(fx) {
  return () => structuredClone(fx.plan);
}

function writeEnvelope(fx, { manifestOverrides = {}, bindingOverrides = {} } = {}) {
  const workerRoot = path.join(fx.vexHomeRoot, 'runtime', 'native-workers', fx.packet.workerRef);
  fs.mkdirSync(workerRoot, { recursive: true });
  const manifest = buildG04BNativeWorkerManifest(fx.packet, {
    packetRelativePath: 'runtime/training/g04b/worker-packet.json'
  });
  fs.writeFileSync(path.join(workerRoot, 'manifest.json'), `${JSON.stringify({ ...manifest, ...manifestOverrides }, null, 2)}\n`);
  fs.writeFileSync(path.join(workerRoot, 'binding.json'), `${JSON.stringify({ ...fx.nodeRuntimeBinding, ...bindingOverrides }, null, 2)}\n`);
  return workerRoot;
}

test('G04B source-managed first worker composes exact NWS envelope through inspect, real train, evaluate, and bounded machine result', async () => {
  const fx = fixture();
  const workerRoot = writeEnvelope(fx);
  const { calls, runner } = runnerFor(fx);
  const result = await executeG04BNativeTrainingWorker(fx.packet, {
    sourceRoot: fx.sourceRoot,
    planValidator: planValidatorFor(fx),
    processRunner: runner,
    workerRoot,
    controlPath: path.join(workerRoot, 'control.json')
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].at(-1), '--inspect-only');
  assert.equal(calls[1].at(-1), '--execute');
  assert.equal(calls[2][0].endsWith('foundation_evaluate.py'), true);
  assert.equal(result.trainingActuallyExecuted, true);
  assert.equal(result.simulationOnly, false);
  assert.equal(result.modelWeightsChanged, true);
  assert.equal(result.changedParameterCount, 42);
  assert.equal(result.heldOutEvaluationReturned, true);
  assert.equal(result.sourceModelSnapshotFingerprintObserved, true);
  assert.equal(result.resultRef, fx.packet.resultRef);
  assert.equal(result.hostRef, fx.nodeRuntimeBinding.hostRef);
  assert.equal(result.nodeBindingRef, fx.nodeRuntimeBinding.bindingRef);
  assert.equal(result.nodeExecutableRef, fx.nodeRuntimeBinding.executableRef);
  assert.equal(result.nodeExecutableSha256, fx.nodeRuntimeBinding.executableSha256);
  assert.equal(result.nodeRuntimeBindingFingerprint, nodeRuntimeBindingFingerprint(fx.nodeRuntimeBinding));
  assert.deepEqual(verifyG04BMachineResult(result, fx.packet), result);
  const materialized = JSON.parse(fs.readFileSync(path.join(workerRoot, 'g04b-machine-result.json'), 'utf8'));
  assert.equal(materialized.packetFingerprint, result.packetFingerprint);
});

test('G04B first worker cooperatively yields only at the explicit pre-optimizer checkpoint', async () => {
  const fx = fixture();
  const workerRoot = writeEnvelope(fx);
  const controlPath = path.join(workerRoot, 'control.json');
  fs.writeFileSync(controlPath, `${JSON.stringify({
    schemaVersion: 'vexlife.native-worker-control/v1',
    workerRef: fx.packet.workerRef,
    generation: 1,
    action: 'PAUSE',
    requestedAt: '2026-08-29T01:00:00.000Z'
  }, null, 2)}\n`);
  const { calls, runner } = runnerFor(fx);
  const result = await executeG04BNativeTrainingWorker(fx.packet, {
    sourceRoot: fx.sourceRoot,
    planValidator: planValidatorFor(fx),
    processRunner: runner,
    workerRoot,
    controlPath
  });
  assert.equal(result.schemaVersion, 'vexlife.g04b-native-training-worker-yield/v1');
  assert.equal(result.exitCode, 75);
  assert.equal(result.safeCheckpoint, 'AFTER_INSPECTION_BEFORE_OPTIMIZER_EFFECT');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].includes('--execute'), false);
});

test('G04B worker rejects a persisted NWS workRef substitution before any phase executes', async () => {
  const fx = fixture();
  const workerRoot = writeEnvelope(fx, { manifestOverrides: { workRef: 'work.vexlife.g04b.forged' } });
  const { calls, runner } = runnerFor(fx);
  await assert.rejects(
    executeG04BNativeTrainingWorker(fx.packet, {
      sourceRoot: fx.sourceRoot,
      planValidator: planValidatorFor(fx),
      processRunner: runner,
      workerRoot,
      controlPath: path.join(workerRoot, 'control.json')
    }),
    (error) => error.code === 'G04B_NWS_ENVELOPE_MISMATCH'
  );
  assert.equal(calls.length, 0);
});

test('G04B exact NWS Node binding rejects host, binding, executable-ref, and executable-hash substitution before trainer phases', async () => {
  const substitutions = [
    { label: 'hostRef', bindingOverrides: { hostRef: 'host.macos.m4-pro.forged' } },
    { label: 'bindingRef', bindingOverrides: { bindingRef: 'binding.node.g04b.forged.001' } },
    { label: 'executableRef', bindingOverrides: { executableRef: 'runtime.node.v22.forged' } },
    { label: 'executableSha256', bindingOverrides: { executableSha256: '9'.repeat(64) } }
  ];
  for (const substitution of substitutions) {
    const fx = fixture();
    const workerRoot = writeEnvelope(fx, { bindingOverrides: substitution.bindingOverrides });
    const { calls, runner } = runnerFor(fx);
    await assert.rejects(
      executeG04BNativeTrainingWorker(fx.packet, {
        sourceRoot: fx.sourceRoot,
        planValidator: planValidatorFor(fx),
        processRunner: runner,
        workerRoot,
        controlPath: path.join(workerRoot, 'control.json')
      }),
      (error) => error.code === 'G04B_NWS_BINDING_MISMATCH',
      substitution.label
    );
    assert.equal(calls.length, 0, substitution.label);
  }
});

test('G04B supplied Node binding must exactly match the frozen packet before NWS prepare', () => {
  const fx = fixture();
  const verified = verifyG04BNodeRuntimeBinding(fx.packet, fx.nodeRuntimeBinding, { verifyExecutable: true });
  assert.equal(verified.bindingFingerprint, nodeRuntimeBindingFingerprint(fx.nodeRuntimeBinding));
  assert.throws(
    () => verifyG04BNodeRuntimeBinding(fx.packet, { ...fx.nodeRuntimeBinding, observedAt: '2026-08-29T01:00:01.000Z' }),
    (error) => error.code === 'G04B_NWS_BINDING_MISMATCH'
  );
});

test('G04B first worker rejects non-MPS host substitution', () => {
  const fx = fixture();
  const forged = {
    ...fx.packet,
    expectedExecutionDevice: 'CUDA',
    expectedHardwareProfileRef: 'hardware.windows-x64.nvidia.cuda12-compatible'
  };
  assert.throws(
    () => buildG04BNativeWorkerManifest(forged, {
      packetRelativePath: 'runtime/training/g04b/worker-packet.json'
    }),
    (error) => error.code === 'G04B_FIRST_WORKER_HOST_MISMATCH'
  );
});

test('G04B source snapshot verifier rejects byte drift and extra-path injection', () => {
  const fx = fixture();
  assert.equal(verifyG04BSourceSnapshot(fx.packet).independentlyObserved, true);
  fs.appendFileSync(path.join(fx.snapshotRoot, 'config.json'), 'drift');
  assert.throws(() => verifyG04BSourceSnapshot(fx.packet), (error) => error.code === 'G04B_SNAPSHOT_FILE_MISMATCH');

  const fx2 = fixture();
  fs.writeFileSync(path.join(fx2.snapshotRoot, 'untracked.bin'), 'extra');
  assert.throws(() => verifyG04BSourceSnapshot(fx2.packet), (error) => error.code === 'G04B_SNAPSHOT_PATH_SET_MISMATCH');
});

test('G04B worker rejects forged evaluation candidate identity after a real-training receipt', async () => {
  const fx = fixture();
  const workerRoot = writeEnvelope(fx);
  const { runner } = runnerFor(fx, { forgeEvaluation: true });
  await assert.rejects(
    executeG04BNativeTrainingWorker(fx.packet, {
      sourceRoot: fx.sourceRoot,
      planValidator: planValidatorFor(fx),
      processRunner: runner,
      workerRoot,
      controlPath: path.join(workerRoot, 'control.json')
    }),
    (error) => error.code === 'G04B_EVALUATION_IDENTITY_MISMATCH'
  );
});

test('G04B result consumer contract rejects resultRef and Node-runtime identity laundering', async () => {
  const fx = fixture();
  const workerRoot = writeEnvelope(fx);
  const { runner } = runnerFor(fx);
  const result = await executeG04BNativeTrainingWorker(fx.packet, {
    sourceRoot: fx.sourceRoot,
    planValidator: planValidatorFor(fx),
    processRunner: runner,
    workerRoot,
    controlPath: path.join(workerRoot, 'control.json')
  });
  assert.throws(
    () => verifyG04BMachineResult({ ...result, resultRef: 'result.g04b.forged' }, fx.packet),
    (error) => error.code === 'G04B_MACHINE_RESULT_IDENTITY_MISMATCH'
  );
  assert.throws(
    () => verifyG04BMachineResult({ ...result, nodeBindingRef: 'binding.node.g04b.forged.001' }, fx.packet),
    (error) => error.code === 'G04B_MACHINE_RESULT_IDENTITY_MISMATCH'
  );
});

test('G04B machine result rejects unknown and missing terminal fields before NWS consumption', async () => {
  const fx = fixture();
  const workerRoot = writeEnvelope(fx);
  const { runner } = runnerFor(fx);
  const result = await executeG04BNativeTrainingWorker(fx.packet, {
    sourceRoot: fx.sourceRoot,
    planValidator: planValidatorFor(fx),
    processRunner: runner,
    workerRoot,
    controlPath: path.join(workerRoot, 'control.json')
  });
  assert.throws(
    () => verifyG04BMachineResult({ ...result, rawPayload: 'forged-extra' }, fx.packet),
    (error) => error.code === 'G04B_MACHINE_RESULT_INVALID'
  );
  const missing = { ...result };
  delete missing.publicUploadPerformed;
  assert.throws(
    () => verifyG04BMachineResult(missing, fx.packet),
    (error) => error.code === 'G04B_MACHINE_RESULT_INVALID'
  );
});
