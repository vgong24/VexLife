import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  G04B_NATIVE_WORKER_PACKET_SCHEMA,
  G04B_SOURCE_SNAPSHOT_FINGERPRINT_SCHEMA,
  G04B_SOURCE_SNAPSHOT_INVENTORY_SCHEMA,
  nodeRuntimeBindingFingerprint,
  packetFingerprint
} from '../src/core/g04b-native-training-worker.mjs';
import {
  G04BTerminalEvidenceError,
  g04bCanonicalFingerprint,
  pythonCanonicalJsonFingerprintFile,
  verifyG04BDerivedPhaseFingerprints,
  verifyG04BPersistedMachineResult
} from '../src/core/g04b-native-training-terminal.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function expectCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof G04BTerminalEvidenceError);
    assert.equal(error.code, code);
    return true;
  });
}

function exactSystemPython() {
  for (const candidate of ['python3', 'python']) {
    const probe = spawnSync(candidate, ['-I', '-S', '-c', 'import sys; print(sys.executable)'], {
      encoding: 'utf8',
      windowsHide: true
    });
    if (probe.status !== 0 || probe.signal || !String(probe.stdout ?? '').trim()) continue;
    return fs.realpathSync.native(path.resolve(String(probe.stdout).trim()));
  }
  assert.fail('cross-language G04B terminal proof requires an available Python 3 runtime');
}

function packetFixture() {
  const revision = '851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a';
  const files = [{
    path: 'config.json',
    bytes: 1,
    sha256: '1'.repeat(64)
  }];
  const snapshotFingerprint = g04bCanonicalFingerprint({
    schemaVersion: G04B_SOURCE_SNAPSHOT_FINGERPRINT_SCHEMA,
    sourceModelRepo: 'Qwen/Qwen3.5-4B',
    sourceModelRevision: revision,
    files
  });
  const sourceSnapshotInventory = {
    schemaVersion: G04B_SOURCE_SNAPSHOT_INVENTORY_SCHEMA,
    sourceModelRepo: 'Qwen/Qwen3.5-4B',
    sourceModelRevision: revision,
    files,
    snapshotFingerprint
  };
  const nodeRuntimeBinding = {
    schemaVersion: 'vexlife.native-worker-runtime-binding/v1',
    bindingRef: 'binding.node.g04b.terminal.001',
    executableRef: 'runtime.node.v22.exact',
    executablePath: path.resolve(os.tmpdir(), 'node-v22.23.2'),
    executableSha256: '2'.repeat(64),
    hostRef: 'host.macos.m4-pro.terminal',
    observedAt: '2026-08-29T01:00:00.000Z'
  };
  const packet = {
    schemaVersion: G04B_NATIVE_WORKER_PACKET_SCHEMA,
    workerRef: 'worker.g04b.terminal.001',
    workRef: 'work.vexlife.g04b.real-neural-foundation-evolution.20260824.001',
    purposeRef: 'purpose.g04b.real-neural-terminal',
    resultContractRef: 'result-contract.g04b.real-neural-first-proof.v1',
    resultRef: 'result.g04b.real-neural-terminal.001',
    executionAuthorityRef: 'authority.g04b.real-training-effect.001',
    hostRef: nodeRuntimeBinding.hostRef,
    nodeRuntimeBinding,
    trainingManifestPath: 'runtime/training/g04b/manifest.json',
    trainingManifestSha256: '3'.repeat(64),
    pythonExecutableRef: 'runtime.python.cpython-3.12.14.macos-arm64',
    pythonExecutablePath: path.resolve(os.tmpdir(), 'python3.12'),
    pythonExecutableSha256: '4'.repeat(64),
    vexHomeRoot: path.resolve(os.tmpdir(), 'vexlife-home'),
    huggingFaceHubCacheRoot: path.resolve(os.tmpdir(), 'vexlife-home', 'models', 'huggingface', 'hub'),
    sourceSnapshotRoot: path.resolve(os.tmpdir(), 'vexlife-home', 'models', 'huggingface', 'hub', 'snapshot'),
    sourceSnapshotInventory,
    expectedExecutionDevice: 'MPS',
    expectedHardwareProfileRef: 'hardware.macos-arm64.apple-m4-pro.metal'
  };
  return packet;
}

function machineResultFixture(packet) {
  return {
    schemaVersion: 'vexlife.g04b-native-training-worker-result/v1',
    workerRef: packet.workerRef,
    workRef: packet.workRef,
    purposeRef: packet.purposeRef,
    resultContractRef: packet.resultContractRef,
    resultRef: packet.resultRef,
    packetFingerprint: packetFingerprint(packet),
    hostRef: packet.hostRef,
    nodeBindingRef: packet.nodeRuntimeBinding.bindingRef,
    nodeExecutableRef: packet.nodeRuntimeBinding.executableRef,
    nodeExecutableSha256: packet.nodeRuntimeBinding.executableSha256,
    nodeRuntimeBindingFingerprint: nodeRuntimeBindingFingerprint(packet.nodeRuntimeBinding),
    trainingManifestSha256: packet.trainingManifestSha256,
    sourceModelRepo: packet.sourceSnapshotInventory.sourceModelRepo,
    sourceModelRevision: packet.sourceSnapshotInventory.sourceModelRevision,
    sourceModelSnapshotFingerprint: packet.sourceSnapshotInventory.snapshotFingerprint,
    sourceModelSnapshotFingerprintObserved: true,
    sourceManifestFingerprint: '5'.repeat(64),
    executionDevice: packet.expectedExecutionDevice,
    expectedHardwareProfileRef: packet.expectedHardwareProfileRef,
    inspectionFingerprint: '6'.repeat(64),
    trainingReceiptFingerprint: '7'.repeat(64),
    evaluationReceiptFingerprint: '8'.repeat(64),
    priorModelIdentity: 'model-source.vexlife.sha256.terminal',
    candidateModelIdentity: 'model-candidate.vexlife.sha256.terminal',
    candidateArtifactFingerprint: '9'.repeat(64),
    trainingActuallyExecuted: true,
    simulationOnly: false,
    modelWeightsChanged: true,
    changedParameterCount: 1,
    heldOutEvaluationReturned: true,
    activationPerformed: false,
    publicUploadPerformed: false
  };
}

test('Python canonical fingerprint matches trainer/evaluator float semantics and visibly differs from JS JSON.stringify', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-g04b-python-canonical-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'numeric-evidence.json');
  fs.writeFileSync(file, `{
  "floatOne": 1.0,
  "learningRate": 2e-05,
  "small": 1e-06,
  "tiny": 1e-07,
  "unicode": "天地"
}
`);
  const expectedCanonical = '{"floatOne":1.0,"learningRate":2e-05,"small":1e-06,"tiny":1e-07,"unicode":"天地"}';
  const expected = crypto.createHash('sha256').update(expectedCanonical).digest('hex');
  const python = exactSystemPython();
  const observed = pythonCanonicalJsonFingerprintFile(python, file);
  const jsFingerprint = g04bCanonicalFingerprint(JSON.parse(fs.readFileSync(file, 'utf8')));

  assert.equal(observed, expected);
  assert.notEqual(jsFingerprint, expected);
});

test('G04B terminal derivation binds exact Python phase fingerprints while retaining raw child-object fingerprints for the same-host seal', () => {
  const manifestFingerprint = 'a'.repeat(64);
  const trainingReceiptFingerprint = 'b'.repeat(64);
  const evaluationReceiptFingerprint = 'c'.repeat(64);
  const manifest = {
    schemaVersion: 'vexlife.foundation-training-manifest/v1',
    trainingRunRef: 'training.g04b.terminal.001',
    sourceManifestFingerprint: 'd'.repeat(64),
    learningRate: 0.00002
  };
  const training = {
    schemaVersion: 'vexlife.foundation-training-receipt/v1',
    manifestFingerprint,
    candidateArtifactFingerprint: 'e'.repeat(64),
    meanTrainingLoss: 1.0,
    elapsedSeconds: 2.0
  };
  const evaluation = {
    schemaVersion: 'vexlife.foundation-evaluation-receipt/v1',
    trainingManifestFingerprint: manifestFingerprint,
    trainingReceiptFingerprint,
    elapsedSeconds: 3.0
  };

  const derived = verifyG04BDerivedPhaseFingerprints(
    manifest,
    training,
    evaluation,
    { manifestFingerprint, trainingReceiptFingerprint, evaluationReceiptFingerprint }
  );
  assert.equal(derived.manifestFingerprint, manifestFingerprint);
  assert.equal(derived.trainingReceiptFingerprint, trainingReceiptFingerprint);
  assert.equal(derived.evaluationReceiptFingerprint, evaluationReceiptFingerprint);
  assert.equal(derived.rawTrainingReceiptFingerprint, g04bCanonicalFingerprint(training));
  assert.equal(derived.rawEvaluationReceiptFingerprint, g04bCanonicalFingerprint(evaluation));

  expectCode(
    () => verifyG04BDerivedPhaseFingerprints(
      manifest,
      { ...training, manifestFingerprint: 'f'.repeat(64) },
      evaluation,
      { manifestFingerprint, trainingReceiptFingerprint, evaluationReceiptFingerprint }
    ),
    'G04B_TRAINING_MANIFEST_FINGERPRINT_MISMATCH'
  );

  expectCode(
    () => verifyG04BDerivedPhaseFingerprints(
      manifest,
      training,
      { ...evaluation, trainingReceiptFingerprint: '0'.repeat(64) },
      { manifestFingerprint, trainingReceiptFingerprint, evaluationReceiptFingerprint }
    ),
    'G04B_EVALUATION_TRAINING_RECEIPT_FINGERPRINT_MISMATCH'
  );
});

test('post-worker machine-result re-addressing is rejected against independently captured result truth', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-g04b-result-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const packet = packetFixture();
  const captured = machineResultFixture(packet);
  const readdressed = {
    ...captured,
    sourceManifestFingerprint: 'a'.repeat(64),
    priorModelIdentity: 'model-source.vexlife.sha256.forged',
    candidateModelIdentity: 'model-candidate.vexlife.sha256.forged',
    candidateArtifactFingerprint: 'b'.repeat(64),
    trainingReceiptFingerprint: 'c'.repeat(64),
    evaluationReceiptFingerprint: 'd'.repeat(64)
  };
  fs.writeFileSync(
    path.join(root, 'g04b-machine-result.json'),
    `${JSON.stringify(readdressed, null, 2)}\n`
  );

  expectCode(
    () => verifyG04BPersistedMachineResult(root, captured, packet),
    'G04B_PERSISTED_RESULT_READDRESSED'
  );
});

test('symlinked machine result cannot substitute bytes before G04B consumption', (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows symlink creation is privilege-dependent; Linux Foundation owns this hostile filesystem cell');
    return;
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-g04b-result-symlink-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const packet = packetFixture();
  const captured = machineResultFixture(packet);
  const outside = path.join(os.tmpdir(), `vexlife-g04b-outside-${process.pid}-${Date.now()}.json`);
  t.after(() => fs.rmSync(outside, { force: true }));
  fs.writeFileSync(outside, `${JSON.stringify(captured, null, 2)}\n`);
  fs.symlinkSync(outside, path.join(root, 'g04b-machine-result.json'));

  expectCode(
    () => verifyG04BPersistedMachineResult(root, captured, packet),
    'G04B_TERMINAL_EVIDENCE_NOT_REGULAR'
  );
});

test('G04B start owns same-host verified capture, canonical terminal normalization and fail-closed later consume', () => {
  const workerSource = fs.readFileSync(path.join(ROOT, 'scripts', 'g04b-native-training-worker.mjs'), 'utf8');
  const supervisorSource = fs.readFileSync(path.join(ROOT, 'scripts', 'g04b-native-training-supervisor.mjs'), 'utf8');

  assert.match(workerSource, /G04B_SUPERVISOR_CLI/u);
  assert.match(workerSource, /verifyG04BTerminalEvidence/u);
  assert.match(workerSource, /G04B_UNSEALED_STANDALONE_CONSUME_FORBIDDEN/u);

  assert.match(supervisorSource, /makeVerifiedCapturingSpawn/u);
  assert.match(supervisorSource, /stdio: \['ignore', 'pipe', 'pipe'\]/u);
  assert.match(supervisorSource, /verifyG04BTerminalEvidence/u);
  assert.match(supervisorSource, /verifyG04BPersistedMachineResult/u);
  assert.match(supervisorSource, /terminal\.canonicalResult/u);
  assert.match(supervisorSource, /capture\.sealedResult/u);
  assert.match(supervisorSource, /consumeNativeWorkerResult/u);
});

// [VXG RealForever]
