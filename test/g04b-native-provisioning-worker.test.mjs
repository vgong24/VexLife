import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  G04B_PROVISIONING_HOST_PROFILE,
  G04B_PROVISIONING_PACKET_SCHEMA,
  G04B_PROVISIONING_RESULT_SCHEMA,
  G04B_PROVISIONING_SOURCE_REPO,
  G04B_PROVISIONING_SOURCE_REVISION,
  buildG04BProvisioningWorkerManifest,
  executeG04BProvisioningWorker,
  g04bDependencyLockFingerprint,
  g04bProvisioningPacketFingerprint,
  validateG04BProvisioningPacket,
  verifyG04BProvisioningNodeRuntimeBinding,
  verifyG04BProvisioningResult
} from '../src/core/g04b-native-provisioning-worker.mjs';

const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-g04b-provision-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true });
  const nodePath = path.join(home, 'runtime', 'artifacts', 'node-v22', 'bin', 'node');
  fs.mkdirSync(path.dirname(nodePath), { recursive: true });
  fs.writeFileSync(nodePath, '# exact fake node\n');
  const runtimeBytes = Buffer.from('fake-runtime-archive');
  const wheels = [
    ['accelerate', '1.10.1', 'accelerate-1.10.1-py3-none-any.whl', Buffer.from('accelerate wheel')],
    ['numpy', '2.2.6', 'numpy-2.2.6-cp312-cp312-macosx_14_0_arm64.whl', Buffer.from('numpy wheel')],
    ['torch', '2.8.0', 'torch-2.8.0-cp312-none-macosx_11_0_arm64.whl', Buffer.from('torch wheel')],
    ['transformers', '5.12.1', 'transformers-5.12.1-py3-none-any.whl', Buffer.from('transformers wheel')]
  ];
  const modelFiles = [
    ['config.json', Buffer.from('{"model_type":"qwen3_5"}\n')],
    ['model-00001-of-00002.safetensors', Buffer.from('model shard one')],
    ['model-00002-of-00002.safetensors', Buffer.from('model shard two')],
    ['tokenizer.json', Buffer.from('{"version":"1.0"}\n')]
  ];
  const sourceArtifacts = new Map();
  const runtimeUrl = 'https://artifacts.example.test/python-runtime.tar.gz';
  sourceArtifacts.set(runtimeUrl, runtimeBytes);
  const packages = wheels.map(([project, version, filename, bytes]) => {
    const url = `https://wheels.example.test/${filename}`;
    sourceArtifacts.set(url, bytes);
    return {
      project, version, filename, url,
      sha256: sha(bytes), expectedBytes: bytes.length, maxBytes: bytes.length + 1024,
      sourceRef: `source.${project}.wheel`, licenseRef: `license.${project}`
    };
  }).sort((a, b) => a.project.localeCompare(b.project) || a.filename.localeCompare(b.filename));
  const files = modelFiles.map(([modelPath, bytes]) => {
    const url = `https://huggingface.example.test/${modelPath}`;
    sourceArtifacts.set(url, bytes);
    return {
      path: modelPath, url, sha256: sha(bytes), expectedBytes: bytes.length,
      maxBytes: bytes.length + 1024, sourceRef: `hf.qwen.${modelPath.replaceAll(/[^A-Za-z0-9]/g, '-')}`.toLowerCase()
    };
  }).sort((a, b) => a.path.localeCompare(b.path));
  const nodeRuntimeBinding = {
    schemaVersion: 'vexlife.native-worker-runtime-binding/v1',
    bindingRef: 'binding.node.g04b.preprovision.001',
    executableRef: 'runtime.node.v22.exact',
    executablePath: nodePath,
    executableSha256: sha(fs.readFileSync(nodePath)),
    hostRef: 'host.macos.m4-pro.first-proof',
    observedAt: '2026-08-29T09:00:00.000Z'
  };
  const packet = {
    schemaVersion: G04B_PROVISIONING_PACKET_SCHEMA,
    workerRef: 'worker.g04b.preprovision.001',
    workRef: 'work.vexlife.g04b.real-neural-foundation-evolution.20260824.001',
    purposeRef: 'purpose.g04b.preprovision.first-proof',
    resultContractRef: 'result-contract.g04b.preprovision.v1',
    resultRef: 'result.g04b.preprovision.001',
    executionAuthorityRef: 'authority.g04b.preprovision.001',
    hostRef: nodeRuntimeBinding.hostRef,
    nodeRuntimeBinding,
    expectedHardwareProfileRef: G04B_PROVISIONING_HOST_PROFILE,
    vexHomeRoot: home,
    pythonRuntime: {
      runtimeRef: 'runtime.python.cpython-3.12.g04b-first-proof',
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
    pythonDependencyLock: { pythonVersion: '3.12', packages },
    sourceModel: {
      repo: G04B_PROVISIONING_SOURCE_REPO,
      revision: G04B_PROVISIONING_SOURCE_REVISION,
      licenseRef: 'license.apache-2.0.qwen3.5',
      files
    }
  };
  return { root, home, nodePath, sourceArtifacts, packet };
}

function downloaderFor(fx, { corruptUrl = null } = {}) {
  return async ({ url, expectedSha256, expectedBytes, finalPath }) => {
    if (fs.existsSync(finalPath)) {
      const bytes = fs.readFileSync(finalPath);
      if (bytes.length !== expectedBytes || sha(bytes) !== expectedSha256) throw new Error('existing artifact failed verification');
      return { disposition: 'REUSED_VERIFIED', path: finalPath, bytes: bytes.length, actualSha256: sha(bytes) };
    }
    let bytes = fx.sourceArtifacts.get(url);
    if (!bytes) throw new Error(`unbound URL: ${url}`);
    if (url === corruptUrl) bytes = Buffer.concat([bytes, Buffer.from('corrupt')]);
    if (bytes.length !== expectedBytes || sha(bytes) !== expectedSha256) throw new Error('fixture checksum/size mismatch');
    fs.mkdirSync(path.dirname(finalPath), { recursive: true });
    fs.writeFileSync(finalPath, bytes);
    return { disposition: 'DOWNLOADED_AND_VERIFIED', path: finalPath, bytes: bytes.length, actualSha256: sha(bytes) };
  };
}

function extractorFor({ symlinkPython = false } = {}) {
  return async ({ stagingRoot, runtimeArtifact }) => {
    const executable = path.join(stagingRoot, ...runtimeArtifact.executableRelativePath.split('/'));
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    if (symlinkPython) {
      fs.writeFileSync(path.join(path.dirname(executable), 'real-python'), '# real python\n');
      fs.symlinkSync('real-python', executable);
    } else {
      fs.writeFileSync(executable, '# isolated python 3.12\n');
    }
  };
}

function runnerFor({ packageVersionOverride = null, failInstall = false } = {}) {
  const calls = [];
  const runner = async (executable, argv, options = {}) => {
    calls.push({ executable, argv: [...argv], env: { ...(options.env ?? {}) } });
    if (argv.includes('install')) {
      assert.equal(argv.includes('--no-index'), true);
      assert.equal(argv.includes('--no-deps'), true);
      assert.equal(argv.includes('--require-hashes'), true);
      assert.equal(options.env.PIP_NO_INDEX, '1');
      return { code: failInstall ? 2 : 0, signal: null, stdout: '', stderr: failInstall ? 'install failed' : '' };
    }
    if (argv.includes('check')) return { code: 0, signal: null, stdout: 'No broken requirements found.\n', stderr: '' };
    if (argv.includes('-c')) {
      const expected = JSON.parse(argv.at(-1));
      const packageVersions = { ...expected, ...(packageVersionOverride ?? {}) };
      return {
        code: 0, signal: null, stderr: '',
        stdout: JSON.stringify({
          pythonVersion: '3.12', platform: 'Darwin', architecture: 'arm64',
          packageVersions, torchVersion: packageVersions.torch ?? '2.8.0', mpsBuilt: true, mpsAvailable: true
        })
      };
    }
    throw new Error(`unexpected process call: ${argv.join(' ')}`);
  };
  return { calls, runner };
}

test('G04B typed pre-provision worker materializes exact isolated runtime + offline lock + complete snapshot without training', async () => {
  const fx = fixture();
  const { calls, runner } = runnerFor();
  const result = await executeG04BProvisioningWorker(fx.packet, {
    downloadArtifact: downloaderFor(fx),
    extractRuntime: extractorFor(),
    processRunner: runner
  });
  assert.equal(result.schemaVersion, G04B_PROVISIONING_RESULT_SCHEMA);
  assert.equal(result.packetFingerprint, g04bProvisioningPacketFingerprint(fx.packet));
  assert.equal(result.dependencyLockFingerprint, g04bDependencyLockFingerprint(fx.packet.pythonDependencyLock));
  assert.equal(result.runtimeDisposition, 'MATERIALIZED_VERIFIED_RUNTIME');
  assert.equal(result.packageInstallationExecuted, true);
  assert.equal(result.modelDownloadPerformed, true);
  assert.equal(result.trainingActuallyExecuted, false);
  assert.equal(result.optimizerStepPerformed, false);
  assert.equal(result.activationPerformed, false);
  assert.equal(result.publicUploadPerformed, false);
  assert.equal(result.sourceSnapshotInventory.files.length, fx.packet.sourceModel.files.length);
  assert.equal(result.sourceSnapshotInventory.snapshotFingerprint, result.sourceModelSnapshotFingerprint);
  assert.equal(fs.lstatSync(result.pythonExecutablePath).isSymbolicLink(), false);
  assert.equal(result.pythonExecutablePath.startsWith(fx.home + path.sep), true);
  assert.equal(calls.some((call) => call.argv.includes('install')), true);
  assert.equal(calls.some((call) => call.argv.includes('check')), true);
  assert.equal(calls.some((call) => call.argv.includes('-c')), true);
  assert.deepEqual(verifyG04BProvisioningResult(result, fx.packet), result);
});

test('G04B pre-provision rerun reuses exact qualified runtime and exact model artifacts without reinstall/download truth laundering', async () => {
  const fx = fixture();
  const firstRunner = runnerFor();
  await executeG04BProvisioningWorker(fx.packet, {
    downloadArtifact: downloaderFor(fx), extractRuntime: extractorFor(), processRunner: firstRunner.runner
  });
  const secondRunner = runnerFor();
  const result = await executeG04BProvisioningWorker(fx.packet, {
    downloadArtifact: downloaderFor(fx), extractRuntime: extractorFor(), processRunner: secondRunner.runner
  });
  assert.equal(result.runtimeDisposition, 'REUSED_VERIFIED_RUNTIME');
  assert.equal(result.packageInstallationExecuted, false);
  assert.equal(result.modelDownloadPerformed, false);
  assert.equal(result.modelArtifactDispositions.every((entry) => entry.disposition === 'REUSED_VERIFIED'), true);
  assert.equal(secondRunner.calls.some((call) => call.argv.includes('install')), false);
  assert.equal(secondRunner.calls.some((call) => call.argv.includes('-c')), true);
});

test('G04B provisioning packet rejects host, source revision, unsafe executable path and dynamically unordered locks', () => {
  const cases = [
    { mutate: (packet) => { packet.expectedHardwareProfileRef = 'hardware.windows-x64.nvidia.cuda12-compatible'; }, code: 'G04B_PROVISION_HOST_INVALID' },
    { mutate: (packet) => { packet.sourceModel.revision = '0'.repeat(40); }, code: 'G04B_PROVISION_SOURCE_MODEL_INVALID' },
    { mutate: (packet) => { packet.pythonRuntime.executableRelativePath = '../../usr/bin/python3'; }, code: 'G04B_PROVISION_PACKET_INVALID' },
    { mutate: (packet) => { packet.pythonDependencyLock.packages.reverse(); }, code: 'G04B_PROVISION_PACKET_INVALID' }
  ];
  for (const { mutate, code } of cases) {
    const fx = fixture();
    const packet = structuredClone(fx.packet);
    mutate(packet);
    assert.throws(() => validateG04BProvisioningPacket(packet), (error) => error.code === code);
  }
});

test('G04B provisioning supplied Node binding must equal the exact frozen packet binding', () => {
  const fx = fixture();
  assert.doesNotThrow(() => verifyG04BProvisioningNodeRuntimeBinding(fx.packet, fx.packet.nodeRuntimeBinding, { verifyExecutable: true }));
  const forged = { ...fx.packet.nodeRuntimeBinding, bindingRef: 'binding.node.g04b.preprovision.forged' };
  assert.throws(() => verifyG04BProvisioningNodeRuntimeBinding(fx.packet, forged), (error) => error.code === 'G04B_PROVISION_NWS_BINDING_MISMATCH');
});

test('G04B provisioning rejects a symlinked materialized Python executable and removes incomplete final runtime', async () => {
  const fx = fixture();
  await assert.rejects(
    executeG04BProvisioningWorker(fx.packet, {
      downloadArtifact: downloaderFor(fx), extractRuntime: extractorFor({ symlinkPython: true }), processRunner: runnerFor().runner
    }),
    (error) => error.code === 'G04B_PROVISION_PYTHON_EXECUTABLE_INVALID'
  );
  const finalRoot = path.join(fx.home, 'runtime', 'training', fx.packet.pythonRuntime.runtimeRef);
  assert.equal(fs.existsSync(finalRoot), false);
});

test('G04B provisioning refuses a corrupt exact model artifact rather than returning a snapshot', async () => {
  const fx = fixture();
  const corruptUrl = fx.packet.sourceModel.files[0].url;
  await assert.rejects(
    executeG04BProvisioningWorker(fx.packet, {
      downloadArtifact: downloaderFor(fx, { corruptUrl }), extractRuntime: extractorFor(), processRunner: runnerFor().runner
    }),
    /fixture checksum\/size mismatch/
  );
});

test('G04B provisioning rejects unbound extra snapshot paths on rerun', async () => {
  const fx = fixture();
  await executeG04BProvisioningWorker(fx.packet, {
    downloadArtifact: downloaderFor(fx), extractRuntime: extractorFor(), processRunner: runnerFor().runner
  });
  const snapshotRoot = path.join(fx.home, 'models', 'huggingface', 'hub', 'models--Qwen--Qwen3.5-4B', 'snapshots', G04B_PROVISIONING_SOURCE_REVISION);
  fs.writeFileSync(path.join(snapshotRoot, 'forged-extra.bin'), 'forged');
  await assert.rejects(
    executeG04BProvisioningWorker(fx.packet, {
      downloadArtifact: downloaderFor(fx), extractRuntime: extractorFor(), processRunner: runnerFor().runner
    }),
    (error) => error.code === 'G04B_PROVISION_SNAPSHOT_PATH_SET_MISMATCH'
  );
});

test('G04B provisioning fails closed when offline dependency installation fails and never reports a qualified runtime', async () => {
  const fx = fixture();
  const { runner } = runnerFor({ failInstall: true });
  await assert.rejects(
    executeG04BProvisioningWorker(fx.packet, {
      downloadArtifact: downloaderFor(fx), extractRuntime: extractorFor(), processRunner: runner
    }),
    (error) => error.code === 'G04B_PROVISION_PROCESS_FAILED'
  );
  const finalRoot = path.join(fx.home, 'runtime', 'training', fx.packet.pythonRuntime.runtimeRef);
  assert.equal(fs.existsSync(finalRoot), false);
});

test('G04B provisioning rejects qualification package-version drift even after offline install succeeds', async () => {
  const fx = fixture();
  await assert.rejects(
    executeG04BProvisioningWorker(fx.packet, {
      downloadArtifact: downloaderFor(fx), extractRuntime: extractorFor(), processRunner: runnerFor({ packageVersionOverride: { torch: '9.9.9' } }).runner
    }),
    (error) => error.code === 'G04B_PROVISION_DEPENDENCY_QUALIFICATION_FAILED'
  );
  const finalRoot = path.join(fx.home, 'runtime', 'training', fx.packet.pythonRuntime.runtimeRef);
  assert.equal(fs.existsSync(finalRoot), false);
});

test('G04B provisioning result rejects training/optimizer/activation/publication authority collapse', async () => {
  const fx = fixture();
  const result = await executeG04BProvisioningWorker(fx.packet, {
    downloadArtifact: downloaderFor(fx), extractRuntime: extractorFor(), processRunner: runnerFor().runner
  });
  for (const field of ['trainingActuallyExecuted', 'optimizerStepPerformed', 'activationPerformed', 'publicUploadPerformed']) {
    assert.throws(
      () => verifyG04BProvisioningResult({ ...result, [field]: true }, fx.packet),
      (error) => error.code === 'G04B_PROVISION_AUTHORITY_COLLAPSE',
      field
    );
  }
});

test('G04B provisioning NWS manifest is exact BACKGROUND / non-pausable and carries no external discovery argv', () => {
  const fx = fixture();
  const manifest = buildG04BProvisioningWorkerManifest(fx.packet, { packetRelativePath: 'runtime/provision/g04b/packet.json' });
  assert.equal(manifest.schedulingClass, 'BACKGROUND');
  assert.equal(manifest.pauseMode, 'NONE');
  assert.deepEqual(manifest.argv, ['g04b-native-provisioning-worker.mjs', 'run', '--packet', 'runtime/provision/g04b/packet.json']);
  assert.equal(manifest.workRef, fx.packet.workRef);
});
