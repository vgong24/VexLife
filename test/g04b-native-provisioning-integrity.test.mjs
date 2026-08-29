import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  G04B_PROVISIONING_HOST_PROFILE,
  G04B_PROVISIONING_PACKET_SCHEMA,
  G04B_PROVISIONING_SOURCE_REPO,
  G04B_PROVISIONING_SOURCE_REVISION
} from '../src/core/g04b-native-provisioning-worker.mjs';
import {
  executeVerifiedG04BProvisioningWorker,
  verifyG04BProvisionedState
} from '../src/core/g04b-native-provisioning-integrity.mjs';

const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-g04b-provision-integrity-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true });
  const nodePath = path.join(home, 'runtime', 'artifacts', 'node-v22', 'bin', 'node');
  fs.mkdirSync(path.dirname(nodePath), { recursive: true });
  fs.writeFileSync(nodePath, '# exact fake node\n');
  const runtimeBytes = Buffer.from('exact fake runtime archive');
  const wheelBytes = Buffer.from('exact fake torch wheel');
  const modelBytes = Buffer.from('exact fake qwen config');
  const runtimeUrl = 'https://artifacts.example.test/python-runtime.tar.gz';
  const wheelUrl = 'https://wheels.example.test/torch-2.8.0-py3-none-any.whl';
  const modelUrl = 'https://huggingface.example.test/config.json';
  const sourceArtifacts = new Map([
    [runtimeUrl, runtimeBytes], [wheelUrl, wheelBytes], [modelUrl, modelBytes]
  ]);
  const nodeRuntimeBinding = {
    schemaVersion: 'vexlife.native-worker-runtime-binding/v1',
    bindingRef: 'binding.node.g04b.preprovision.integrity.001',
    executableRef: 'runtime.node.v22.exact',
    executablePath: nodePath,
    executableSha256: sha(fs.readFileSync(nodePath)),
    hostRef: 'host.macos.m4-pro.first-proof',
    observedAt: '2026-08-29T09:30:00.000Z'
  };
  const packet = {
    schemaVersion: G04B_PROVISIONING_PACKET_SCHEMA,
    workerRef: 'worker.g04b.preprovision.integrity.001',
    workRef: 'work.vexlife.g04b.real-neural-foundation-evolution.20260824.001',
    purposeRef: 'purpose.g04b.preprovision.integrity',
    resultContractRef: 'result-contract.g04b.preprovision.v1',
    resultRef: 'result.g04b.preprovision.integrity.001',
    executionAuthorityRef: 'authority.g04b.preprovision.integrity.001',
    hostRef: nodeRuntimeBinding.hostRef,
    nodeRuntimeBinding,
    expectedHardwareProfileRef: G04B_PROVISIONING_HOST_PROFILE,
    vexHomeRoot: home,
    pythonRuntime: {
      runtimeRef: 'runtime.python.cpython-3.12.g04b-integrity',
      pythonVersion: '3.12',
      artifactRef: 'artifact.python.cpython-3.12.macos-arm64',
      filename: 'python-runtime.tar.gz',
      url: runtimeUrl,
      sha256: sha(runtimeBytes),
      expectedBytes: runtimeBytes.length,
      maxBytes: runtimeBytes.length + 1024,
      sourceRef: 'source.python.runtime',
      licenseRef: 'license.python-psf',
      archiveClass: 'POSIX_TAR_GZ',
      executableRelativePath: 'python/bin/python3.12'
    },
    pythonDependencyLock: {
      pythonVersion: '3.12',
      packages: [{
        project: 'torch', version: '2.8.0', filename: 'torch-2.8.0-py3-none-any.whl', url: wheelUrl,
        sha256: sha(wheelBytes), expectedBytes: wheelBytes.length, maxBytes: wheelBytes.length + 1024,
        sourceRef: 'source.torch.wheel', licenseRef: 'license.torch'
      }]
    },
    sourceModel: {
      repo: G04B_PROVISIONING_SOURCE_REPO,
      revision: G04B_PROVISIONING_SOURCE_REVISION,
      licenseRef: 'license.apache-2.0.qwen3.5',
      files: [{
        path: 'config.json', url: modelUrl, sha256: sha(modelBytes), expectedBytes: modelBytes.length,
        maxBytes: modelBytes.length + 1024, sourceRef: 'hf.qwen.config'
      }]
    }
  };
  return { root, home, sourceArtifacts, packet };
}

function downloaderFor(fx, { holdRuntime = null } = {}) {
  return async ({ url, expectedSha256, expectedBytes, finalPath }) => {
    if (holdRuntime && url === fx.packet.pythonRuntime.url) await holdRuntime();
    if (fs.existsSync(finalPath)) {
      const bytes = fs.readFileSync(finalPath);
      if (bytes.length !== expectedBytes || sha(bytes) !== expectedSha256) throw new Error('existing artifact mismatch');
      return { disposition: 'REUSED_VERIFIED', path: finalPath, bytes: bytes.length, actualSha256: sha(bytes) };
    }
    const bytes = fx.sourceArtifacts.get(url);
    if (!bytes || bytes.length !== expectedBytes || sha(bytes) !== expectedSha256) throw new Error('fixture artifact mismatch');
    fs.mkdirSync(path.dirname(finalPath), { recursive: true });
    fs.writeFileSync(finalPath, bytes);
    return { disposition: 'DOWNLOADED_AND_VERIFIED', path: finalPath, bytes: bytes.length, actualSha256: sha(bytes) };
  };
}
function extractor({ stagingRoot, runtimeArtifact }) {
  const executable = path.join(stagingRoot, ...runtimeArtifact.executableRelativePath.split('/'));
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(executable, '# isolated python 3.12 bytes\n');
}
function runner() {
  return async (_executable, argv, options = {}) => {
    if (argv.includes('install')) {
      assert.equal(argv.includes('--no-index'), true);
      assert.equal(argv.includes('--no-deps'), true);
      assert.equal(argv.includes('--require-hashes'), true);
      assert.equal(options.env.PIP_NO_INDEX, '1');
      return { code: 0, signal: null, stdout: '', stderr: '' };
    }
    if (argv.includes('check')) return { code: 0, signal: null, stdout: 'No broken requirements found.\n', stderr: '' };
    if (argv.includes('-c')) {
      const expected = JSON.parse(argv.at(-1));
      return {
        code: 0, signal: null, stderr: '',
        stdout: JSON.stringify({
          pythonVersion: '3.12', platform: 'Darwin', architecture: 'arm64', packageVersions: expected,
          torchVersion: expected.torch ?? '2.8.0', mpsBuilt: true, mpsAvailable: true
        })
      };
    }
    throw new Error(`unexpected process invocation: ${argv.join(' ')}`);
  };
}
async function materialize(fx) {
  return executeVerifiedG04BProvisioningWorker(fx.packet, {
    downloadArtifact: downloaderFor(fx), extractRuntime: extractor, processRunner: runner()
  });
}

test('verified provisioning route independently rebinds deterministic paths, packet snapshot identity, runtime receipt and Python qualification', async () => {
  const fx = fixture();
  const result = await materialize(fx);
  const verified = await verifyG04BProvisionedState(result, fx.packet, { processRunner: runner() });
  assert.equal(verified.result.pythonExecutablePath, path.join(fx.home, 'runtime', 'training', fx.packet.pythonRuntime.runtimeRef, 'python', 'bin', 'python3.12'));
  assert.equal(verified.result.huggingFaceHubCacheRoot, path.join(fx.home, 'models', 'huggingface', 'hub'));
  assert.equal(verified.result.sourceSnapshotRoot, path.join(fx.home, 'models', 'huggingface', 'hub', 'models--Qwen--Qwen3.5-4B', 'snapshots', G04B_PROVISIONING_SOURCE_REVISION));
  assert.equal(verified.snapshotInventory.files[0].path, 'config.json');
  assert.equal(verified.qualification.packageVersions.torch, '2.8.0');
});

test('materialized-state verifier rejects result path laundering and self-consistent-looking snapshot identity substitution', async () => {
  const fx = fixture();
  const result = await materialize(fx);
  await assert.rejects(
    verifyG04BProvisionedState({ ...result, pythonExecutablePath: path.join(fx.home, 'forged-python') }, fx.packet, { processRunner: runner() }),
    (error) => error.code === 'G04B_PROVISION_STATE_RESULT_INVALID'
  );
  const forgedInventory = structuredClone(result.sourceSnapshotInventory);
  forgedInventory.files[0].sha256 = '9'.repeat(64);
  forgedInventory.snapshotFingerprint = '8'.repeat(64);
  await assert.rejects(
    verifyG04BProvisionedState({ ...result, sourceSnapshotInventory: forgedInventory, sourceModelSnapshotFingerprint: forgedInventory.snapshotFingerprint }, fx.packet, { processRunner: runner() }),
    (error) => error.code === 'G04B_PROVISION_STATE_RESULT_INVALID'
  );
});

test('materialized-state verifier derives download/install truth instead of trusting terminal booleans or disposition paths', async () => {
  const fx = fixture();
  const result = await materialize(fx);
  await assert.rejects(
    verifyG04BProvisionedState({ ...result, modelDownloadPerformed: false }, fx.packet, { processRunner: runner() }),
    (error) => error.code === 'G04B_PROVISION_STATE_RESULT_INVALID'
  );
  const dispositions = structuredClone(result.modelArtifactDispositions);
  dispositions[0].path = 'forged.json';
  await assert.rejects(
    verifyG04BProvisionedState({ ...result, modelArtifactDispositions: dispositions }, fx.packet, { processRunner: runner() }),
    (error) => error.code === 'G04B_PROVISION_STATE_RESULT_INVALID'
  );
  await assert.rejects(
    verifyG04BProvisionedState({ ...result, packageInstallationExecuted: false }, fx.packet, { processRunner: runner() }),
    (error) => error.code === 'G04B_PROVISION_STATE_RESULT_INVALID'
  );
});

test('materialized-state verifier re-hashes source snapshot after provisioning and rejects post-result byte mutation', async () => {
  const fx = fixture();
  const result = await materialize(fx);
  fs.appendFileSync(path.join(result.sourceSnapshotRoot, 'config.json'), 'mutated-after-result');
  await assert.rejects(
    verifyG04BProvisionedState(result, fx.packet, { processRunner: runner() }),
    (error) => error.code === 'G04B_PROVISION_STATE_SNAPSHOT_MISMATCH'
  );
});

test('verified provisioning route serializes concurrent first-proof materialization before any shared runtime/snapshot mutation', async () => {
  const fx = fixture();
  let enteredResolve;
  let releaseResolve;
  const entered = new Promise((resolve) => { enteredResolve = resolve; });
  const release = new Promise((resolve) => { releaseResolve = resolve; });
  let held = false;
  const holdRuntime = async () => {
    if (held) return;
    held = true;
    enteredResolve();
    await release;
  };
  const first = executeVerifiedG04BProvisioningWorker(fx.packet, {
    downloadArtifact: downloaderFor(fx, { holdRuntime }), extractRuntime: extractor, processRunner: runner()
  });
  await entered;
  await assert.rejects(
    executeVerifiedG04BProvisioningWorker(fx.packet, {
      downloadArtifact: downloaderFor(fx), extractRuntime: extractor, processRunner: runner()
    }),
    (error) => error.code === 'G04B_PROVISION_RUNTIME_LOCKED'
  );
  releaseResolve();
  const result = await first;
  assert.equal(result.trainingActuallyExecuted, false);
  assert.equal(fs.existsSync(path.join(fx.home, 'runtime', '.locks', 'g04b-preprovision-first-proof.lock')), false);
});
