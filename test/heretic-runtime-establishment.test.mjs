import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  HERETIC_ARTIFACT_CONTENT_SET_SHA256,
  HERETIC_ARTIFACT_SET_REF,
  HERETIC_MLX_LM_VERSION,
  HERETIC_MODEL_BUNDLE_REF,
  HERETIC_MODEL_PROFILE_REF,
  HERETIC_PYTHON_VERSION,
  HERETIC_RUNTIME_ADAPTER_REF,
  computeArtifactContentSetSha256,
  ensureHereticPythonEnvironment,
  formHereticMaterializationPlan,
  formHereticRuntimeOwnerBinding,
  materializeHereticBundle,
  withHereticHuggingFaceCache
} from '../src/core/heretic-runtime-establishment.mjs';
import {
  currentHereticRuntimeOwnerSourceIdentity,
  HERETIC_QUALIFICATION_COMPLETION_TIMEOUT_MS,
  startOrReuseHereticPersistentRuntime,
  stopHereticPersistentRuntime
} from '../src/core/heretic-persistent-runtime-owner.mjs';

const rows = [
  ['.gitattributes', '34448b82c17d60fec9b65b1f093c115ddbaadc04beb1b0140b6bfed2e012a930', 1570],
  ['README.md', '43d4f27187bedb6668bee8e29578e3279fdef77b76ad176580c2e60cb1953b1a', 3686],
  ['chat_template.jinja', 'c3cf9e34abf4f9e36c2d72165aa9c132d3e2a725b6c2586aaa3a8af9d7a81041', 8952],
  ['config.json', '21ec916f33652b2433e289cc999a0a75ea42958b2770c0973d31d6006941bb94', 4192],
  ['generation_config.json', 'd0d0ed2e37cdfafef4a5067d5ea2407b05f4fb50526e47c008a5b235d50240fb', 214],
  ['model-00001-of-00003.safetensors', '075eac5fbba3951bc4870c1ac65d684c32e0abb24284201bd27f49df56735963', 5328325648],
  ['model-00002-of-00003.safetensors', 'd936fce99536decc4e0584590305acf2af461d867d8c9a79e2dfbdd328b14e5c', 5354185130],
  ['model-00003-of-00003.safetensors', '139547bce74259fa4181a9c1b6664c1d14ffa3763e998ea52f0be7fdf12955bb', 4450532735],
  ['model.safetensors.index.json', 'a2161f6a6c9f7c434145f97a4a4262a74eb3e16a95088e713754eb108b198511', 189789],
  ['tokenizer.json', '06b9509352d2af50381ab2247e083b80d32d5c0aba91c272ca9ff729b6a0e523', 19989325],
  ['tokenizer_config.json', '5d9c0d3314a253b714ddbbfeef7a55e9295c45c3da9f5fd9907dae6ebe6cc731', 1265]
];

test('certified Heretic content set recomputes from sorted path/NUL/hash/NUL/size/LF rows', () => {
  const actual = computeArtifactContentSetSha256(
    rows.map(([logicalPath, sha256, byteLength]) => ({ logicalPath, sha256, byteLength })).reverse()
  );
  assert.equal(actual, HERETIC_ARTIFACT_CONTENT_SET_SHA256);
});

test('materialization plan binds the registered generalized bundle without activating it', () => {
  const artifactBindings = rows.map(([logicalPath], index) => ({
    roleRef: `role.test.${index}`,
    artifactRef: `artifact.test.${index}`
  }));
  const artifacts = rows.map(([filename, sha256, expectedBytes], index) => ({
    artifactRef: `artifact.test.${index}`,
    filename,
    sha256,
    expectedBytes,
    sourceRef: 'hf.donedynamics.qwen3.8-27b-heretic-mlx-4bit.808b82a2bd04b2bac362b5d0b7a1197aeea59e57'
  }));
  const plan = formHereticMaterializationPlan({
    state: 'MODEL_BUNDLE_RUNTIME_REALIZATION_HELD',
    bundle: {
      state: 'RELEASE_QUALIFIED',
      modelBundleRef: HERETIC_MODEL_BUNDLE_REF,
      modelProfileRef: HERETIC_MODEL_PROFILE_REF,
      artifactSetRef: HERETIC_ARTIFACT_SET_REF,
      contentSetSha256: HERETIC_ARTIFACT_CONTENT_SET_SHA256,
      runtimeRealizationRefs: [HERETIC_RUNTIME_ADAPTER_REF]
    },
    artifactBindings,
    artifacts
  });
  assert.equal(plan.memberCount, 11);
  assert.equal(plan.totalBytes, 15153242506);
  assert.equal(plan.contentSetSha256, HERETIC_ARTIFACT_CONTENT_SET_SHA256);
  assert.equal(plan.providerRevision, '808b82a2bd04b2bac362b5d0b7a1197aeea59e57');
});

test('materialization independently verifies bytes after the delivery owner returns', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-heretic-materialization-'));
  try {
    const payloads = new Map([
      ['artifact.test.a', Buffer.from('alpha')],
      ['artifact.test.b', Buffer.from('beta')]
    ]);
    const members = [...payloads].map(([artifactRef, bytes]) => ({
      roleRef: `role.${artifactRef}`,
      artifactRef,
      logicalPath: `${artifactRef}.bin`,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      byteLength: bytes.length
    }));
    const plan = {
      contentSetSha256: computeArtifactContentSetSha256(members),
      members
    };
    const result = await materializeHereticBundle({
      plan,
      modelPath: path.join(root, 'model'),
      materializeArtifact: async ({ artifactRef, finalPath }) => {
        fs.writeFileSync(finalPath, payloads.get(artifactRef));
      }
    });
    assert.equal(result.memberCount, 2);
    assert.equal(result.contentSetSha256, plan.contentSetSha256);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fresh environment uses exact Python, binary-only pinned mlx-lm, retains report, and returns verified paths', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-heretic-env-'));
  const environmentRoot = path.join(root, 'env');
  const commands = [];
  const runCommand = (command, args) => {
    commands.push([command, args]);
    if (args[0] === '-m' && args[1] === 'venv') {
      fs.mkdirSync(path.join(environmentRoot, 'bin'), { recursive: true });
      fs.writeFileSync(path.join(environmentRoot, 'bin', 'python'), '');
      return { status: 0, stdout: '', stderr: '' };
    }
    if (command === '/opt/homebrew/bin/python3.14') {
      return {
        status: 0,
        stdout: JSON.stringify({ pythonVersion: HERETIC_PYTHON_VERSION, executable: command }),
        stderr: ''
      };
    }
    if (args[0] === '-m' && args[1] === 'pip') {
      const report = args[args.indexOf('--report') + 1];
      fs.writeFileSync(report, '{}\n');
      return { status: 0, stdout: '', stderr: '' };
    }
    return {
      status: 0,
      stdout: JSON.stringify({
        pythonVersion: HERETIC_PYTHON_VERSION,
        mlxLmVersion: HERETIC_MLX_LM_VERSION,
        prefix: environmentRoot,
        executable: path.join(environmentRoot, 'bin', 'python')
      }),
      stderr: ''
    };
  };
  try {
    const result = await ensureHereticPythonEnvironment({
      bootstrapPython: '/opt/homebrew/bin/python3.14',
      environmentRoot,
      runCommand
    });
    assert.equal(result.state, 'CREATED_VERIFIED');
    assert.ok(commands.some(([, args]) => args.includes('--only-binary=:all:')));
    assert.ok(commands.some(([, args]) => args.includes(`mlx-lm==${HERETIC_MLX_LM_VERSION}`)));
    assert.ok(fs.existsSync(result.pipReportPath));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('materialization plan rejects artifact descriptors that disagree on provider revision', () => {
  const artifactBindings = rows.map(([,], index) => ({
    roleRef: `role.test.${index}`,
    artifactRef: `artifact.test.${index}`
  }));
  const artifacts = rows.map(([filename, sha256, expectedBytes], index) => ({
    artifactRef: `artifact.test.${index}`,
    filename,
    sha256,
    expectedBytes,
    sourceRef: index === 10
      ? 'hf.donedynamics.qwen3.8-27b-heretic-mlx-4bit.1111111111111111111111111111111111111111'
      : 'hf.donedynamics.qwen3.8-27b-heretic-mlx-4bit.808b82a2bd04b2bac362b5d0b7a1197aeea59e57'
  }));
  assert.throws(
    () => formHereticMaterializationPlan({
      state: 'MODEL_BUNDLE_RUNTIME_REALIZATION_HELD',
      bundle: {
        state: 'RELEASE_QUALIFIED',
        modelBundleRef: HERETIC_MODEL_BUNDLE_REF,
        modelProfileRef: HERETIC_MODEL_PROFILE_REF,
        artifactSetRef: HERETIC_ARTIFACT_SET_REF,
        contentSetSha256: HERETIC_ARTIFACT_CONTENT_SET_SHA256,
        runtimeRealizationRefs: [HERETIC_RUNTIME_ADAPTER_REF]
      },
      artifactBindings,
      artifacts
    }),
    (error) => error?.code === 'HERETIC_PROVIDER_REVISION_SET_MISMATCH'
  );
});

test('fresh-host Hugging Face cache is real, bound during owner work, and restored afterward', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-heretic-hf-cache-'));
  const cacheRoot = path.join(root, 'cache');
  const prior = process.env.HF_HUB_CACHE;
  process.env.HF_HUB_CACHE = path.join(root, 'prior-cache');
  try {
    const observed = await withHereticHuggingFaceCache({
      cacheRoot,
      action: async (resolvedRoot) => ({
        resolvedRoot,
        environment: process.env.HF_HUB_CACHE,
        realDirectory: fs.lstatSync(resolvedRoot).isDirectory()
      })
    });
    assert.equal(observed.resolvedRoot, path.resolve(cacheRoot));
    assert.equal(observed.environment, path.resolve(cacheRoot));
    assert.equal(observed.realDirectory, true);
    assert.equal(process.env.HF_HUB_CACHE, path.join(root, 'prior-cache'));
  } finally {
    if (prior === undefined) delete process.env.HF_HUB_CACHE;
    else process.env.HF_HUB_CACHE = prior;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fresh-host Hugging Face cache binding is restored even when owner work fails', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-heretic-hf-cache-failure-'));
  const cacheRoot = path.join(root, 'cache');
  const prior = process.env.HF_HUB_CACHE;
  delete process.env.HF_HUB_CACHE;
  try {
    await assert.rejects(
      withHereticHuggingFaceCache({
        cacheRoot,
        action: async () => {
          assert.equal(process.env.HF_HUB_CACHE, path.resolve(cacheRoot));
          throw new Error('synthetic owner failure');
        }
      }),
      /synthetic owner failure/
    );
    assert.equal(process.env.HF_HUB_CACHE, undefined);
  } finally {
    if (prior === undefined) delete process.env.HF_HUB_CACHE;
    else process.env.HF_HUB_CACHE = prior;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('explicit acquisition repairs a real stale Heretic Python environment while reuse-only holds', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-heretic-env-repair-'));
  const environmentRoot = path.join(root, 'env');
  const pythonPath = path.join(environmentRoot, 'bin', 'python');
  try {
    fs.mkdirSync(path.dirname(pythonPath), { recursive: true });
    fs.writeFileSync(pythonPath, 'stale-python');
    let recreated = false;
    const runCommand = async (command, args) => {
      if (command === pythonPath && args[0] === '-c' && !recreated) {
        return { status: 0, signal: null, stdout: JSON.stringify({ pythonVersion: '3.13.0', mlxLmVersion: HERETIC_MLX_LM_VERSION, prefix: environmentRoot, executable: pythonPath }), stderr: '', error: null };
      }
      if (command === 'python3.14' && args[0] === '-c') {
        return { status: 0, signal: null, stdout: JSON.stringify({ pythonVersion: HERETIC_PYTHON_VERSION, executable: '/bootstrap/python3.14' }), stderr: '', error: null };
      }
      if (command === 'python3.14' && args[0] === '-m' && args[1] === 'venv') {
        recreated = true;
        fs.mkdirSync(path.dirname(pythonPath), { recursive: true });
        fs.writeFileSync(pythonPath, 'fresh-python');
        return { status: 0, signal: null, stdout: '', stderr: '', error: null };
      }
      if (command === pythonPath && args[0] === '-m' && args[1] === 'pip') {
        const reportIndex = args.indexOf('--report');
        fs.writeFileSync(args[reportIndex + 1], '{}\\n');
        return { status: 0, signal: null, stdout: '', stderr: '', error: null };
      }
      if (command === pythonPath && args[0] === '-c' && recreated) {
        return { status: 0, signal: null, stdout: JSON.stringify({ pythonVersion: HERETIC_PYTHON_VERSION, mlxLmVersion: HERETIC_MLX_LM_VERSION, prefix: environmentRoot, executable: pythonPath }), stderr: '', error: null };
      }
      throw new Error(`unexpected command ${command} ${args.join(' ')}`);
    };
    await assert.rejects(
      ensureHereticPythonEnvironment({ bootstrapPython: 'python3.14', environmentRoot, allowCreation: false, runCommand }),
      (error) => error?.code === 'HERETIC_ENVIRONMENT_VERSION_MISMATCH'
    );
    assert.equal(fs.readFileSync(pythonPath, 'utf8'), 'stale-python');
    const repaired = await ensureHereticPythonEnvironment({ bootstrapPython: 'python3.14', environmentRoot, allowCreation: true, runCommand });
    assert.equal(repaired.state, 'CREATED_VERIFIED');
    assert.equal(recreated, true);
    assert.equal(fs.readFileSync(pythonPath, 'utf8'), 'fresh-python');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('cold Heretic qualification keeps and applies the lived Conversation response window', () => {
  assert.equal(HERETIC_QUALIFICATION_COMPLETION_TIMEOUT_MS, 180000);
  const ownerSource = fs.readFileSync(new URL('../src/core/heretic-persistent-runtime-owner.mjs', import.meta.url), 'utf8');
  assert.match(ownerSource, /AbortSignal\.timeout\(HERETIC_QUALIFICATION_COMPLETION_TIMEOUT_MS\)/u);
  assert.doesNotMatch(ownerSource, /v1\/chat\/completions[\\s\\S]{0,700}AbortSignal\.timeout\(30000\)/u);
});

test('VexLife-local runtime owner source identity is exact without private SDK checkout', () => {
  const sourceIdentity = currentHereticRuntimeOwnerSourceIdentity();
  assert.equal(sourceIdentity.repository, 'vgong24/VexLife');
  assert.equal(sourceIdentity.modulePath, 'src/core/heretic-persistent-runtime-owner.mjs');
  assert.match(sourceIdentity.moduleSha256, /^[0-9a-f]{64}$/u);
  const binding = formHereticRuntimeOwnerBinding({
    authorityRef: 'authority.test.heretic.explicit',
    modelPath: '/tmp/model',
    pythonEnvironmentRoot: '/tmp/env',
    port: 8765,
    receiptPath: '/tmp/runtime/receipt.json',
    sourceIdentity
  });
  assert.equal(binding.artifactContentSetSha256, HERETIC_ARTIFACT_CONTENT_SET_SHA256);
  assert.equal(binding.pythonVersion, HERETIC_PYTHON_VERSION);
  assert.equal(binding.mlxLmVersion, HERETIC_MLX_LM_VERSION);
  assert.equal(binding.pythonPath, '/tmp/env/bin/python');
  assert.equal(binding.hostExecutionProfileRef, 'profile.repository.vexlife.macos-v1');
  assert.equal(Object.hasOwn(binding, 'activeModelBundleRef'), false);
});

test('VexLife Heretic runtime owner records STARTING before qualification and stops only exact ownership', async () => {
  const binding = formHereticRuntimeOwnerBinding({
    authorityRef: 'authority.test.heretic.explicit',
    modelPath: '/tmp/model',
    pythonEnvironmentRoot: '/tmp/env',
    port: 8765,
    receiptPath: '/tmp/runtime/receipt.json'
  });
  let receipt = null;
  const live = new Set();
  const writes = [];
  const hooks = {
    host: { platform: 'darwin', architecture: 'arm64' },
    versionProbe: async () => ({
      pythonVersion: HERETIC_PYTHON_VERSION,
      mlxLmVersion: HERETIC_MLX_LM_VERSION,
      prefix: '/tmp/env',
      executable: '/tmp/env/bin/python'
    }),
    readReceipt: () => receipt,
    writeReceipt: (_path, value) => { receipt = value; writes.push(value.state); },
    deleteReceipt: () => { receipt = null; },
    processAlive: (pid) => live.has(pid),
    processIdentity: ({ pid }) => live.has(pid)
      ? { pid, pgid: pid, exactOwnedDetachedGroup: true }
      : null,
    listMatchingProcesses: async () => [],
    portOccupied: async () => false,
    spawnRuntime: async () => { live.add(5151); return 5151; },
    terminateRuntime: async ({ pid }) => {
      live.delete(pid);
      return { state: 'RETIRED_VERIFIED', exactOwnershipVerified: true, verifiedNotLive: true, processGroupId: pid, signalSent: 'SIGTERM' };
    },
    endpointHealthy: async () => true,
    fetchImpl: async (url) => {
      if (url.endsWith('/health')) return { ok: true, json: async () => ({ status: 'ok' }) };
      if (url.endsWith('/v1/models')) return { ok: true, json: async () => ({ data: [{ id: '/tmp/model' }] }) };
      if (url.endsWith('/v1/chat/completions')) return { ok: true, json: async () => ({ model: 'default_model', choices: [{ message: { content: 'OK' } }] }) };
      throw new Error(`unexpected URL ${url}`);
    },
    sleep: async () => {},
    now: () => '2026-10-23T09:00:00.000Z',
    nowMs: (() => { let value = 0; return () => (value += 10); })()
  };
  const started = await startOrReuseHereticPersistentRuntime({ binding, hooks });
  assert.equal(started.disposition, 'STARTED_NEW_EXACT_MLX_RUNTIME');
  assert.deepEqual(writes, ['PERSISTENT_MLX_RUNTIME_STARTING', 'PERSISTENT_MLX_RUNTIME_QUALIFIED']);
  assert.equal(receipt.sourceIdentity.repository, 'vgong24/VexLife');
  const stopped = await stopHereticPersistentRuntime({ binding, hooks });
  assert.equal(stopped.disposition, 'STOPPED_EXACT_OWNED_MLX_RUNTIME');
  assert.equal(stopped.processTerminationPerformed, true);
  assert.equal(live.has(5151), false);
});


test('VexLife Heretic runtime cancellation after STARTING receipt retires the exact provisional process', async () => {
  const binding = formHereticRuntimeOwnerBinding({
    authorityRef: 'authority.test.heretic.cancel',
    modelPath: '/tmp/model-cancel',
    pythonEnvironmentRoot: '/tmp/env-cancel',
    port: 8765,
    receiptPath: '/tmp/runtime/cancel-receipt.json'
  });
  let receipt = null;
  let cancelled = false;
  const live = new Set();
  const hooks = {
    host: { platform: 'darwin', architecture: 'arm64' },
    versionProbe: async () => ({
      pythonVersion: HERETIC_PYTHON_VERSION,
      mlxLmVersion: HERETIC_MLX_LM_VERSION,
      prefix: '/tmp/env-cancel',
      executable: '/tmp/env-cancel/bin/python'
    }),
    readReceipt: () => receipt,
    writeReceipt: (_path, value) => {
      receipt = value;
      if (value.state === 'PERSISTENT_MLX_RUNTIME_STARTING') cancelled = true;
    },
    deleteReceipt: () => { receipt = null; },
    processAlive: (pid) => live.has(pid),
    processIdentity: ({ pid }) => live.has(pid) ? { pid, pgid: pid, exactOwnedDetachedGroup: true } : null,
    listMatchingProcesses: async () => [],
    portOccupied: async () => false,
    spawnRuntime: async () => { live.add(6161); return 6161; },
    terminateRuntime: async ({ pid }) => {
      live.delete(pid);
      return { state: 'RETIRED_VERIFIED', exactOwnershipVerified: true, verifiedNotLive: true, processGroupId: pid, signalSent: 'SIGTERM' };
    },
    endpointHealthy: async () => false,
    fetchImpl: async () => { throw new Error('qualification must not run after cancellation'); },
    sleep: async () => {},
    now: () => '2026-10-23T09:00:00.000Z',
    nowMs: (() => { let value = 0; return () => (value += 10); })(),
    cancellationRequested: () => cancelled
  };
  await assert.rejects(
    startOrReuseHereticPersistentRuntime({ binding, hooks }),
    (error) => error?.code === 'HERETIC_RUNTIME_CANCELLED'
  );
  assert.equal(live.has(6161), false);
  assert.equal(receipt, null);
});

test('VexLife Heretic runtime rotates an exact stale-source receipt before current-source restart', async () => {
  const binding = formHereticRuntimeOwnerBinding({
    authorityRef: 'authority.test.heretic.rotate',
    modelPath: '/tmp/model-rotate',
    pythonEnvironmentRoot: '/tmp/env-rotate',
    port: 8765,
    receiptPath: '/tmp/runtime/rotate-receipt.json'
  });
  const args = ['-m','mlx_lm.server','--model','/tmp/model-rotate','--host','127.0.0.1','--port','8765','--chat-template-args','{"enable_thinking":false}'];
  let receipt = {
    schemaVersion: 'vexlife.heretic-persistent-runtime-owner-receipt/v1',
    receiptRef: 'receipt.vexlife.heretic-persistent-runtime.stale',
    state: 'PERSISTENT_MLX_RUNTIME_QUALIFIED',
    formedAt: '2026-10-23T08:00:00.000Z',
    authorityRef: binding.authorityRef,
    modelRef: binding.modelRef,
    modelProfileRef: binding.modelProfileRef,
    artifactRef: binding.artifactRef,
    artifactCustodyEvidenceRef: binding.artifactCustodyEvidenceRef,
    artifactContentSetSha256: binding.artifactContentSetSha256,
    runtimeAdapterRef: binding.runtimeAdapterRef,
    runtimeClass: binding.runtimeClass,
    transportClass: 'MLX_LM_OPENAI_NUMERIC_LOOPBACK',
    hostExecutionProfileRef: binding.hostExecutionProfileRef,
    pythonVersion: binding.pythonVersion,
    mlxLmVersion: binding.mlxLmVersion,
    trainerSourceCommit: binding.trainerSourceCommit,
    modelPath: binding.modelPath,
    pythonPath: binding.pythonPath,
    pythonEnvironmentRoot: binding.pythonEnvironmentRoot,
    endpoint: 'http://127.0.0.1:8765',
    requestModel: 'default_model',
    sourceIdentity: { ...binding.sourceIdentity, moduleSha256: 'a'.repeat(64) },
    runtime: { pid: 7171, processGroupId: 7171, exactOwnedDetachedGroup: true, args },
    qualification: { healthAndExactModelVerified: true, actualChatCompletionPerformed: true, loadResultRef: null },
    effects: {
      modelRuntime: true, providerNetwork: false, modelDownload: false, artifactMutation: false,
      training: false, weightMutation: false, memoryMutation: false, activation: false,
      succession: false, publication: false, repositoryMutation: false, homeMutation: false
    }
  };
  const live = new Set([7171]);
  let nextPid = 8181;
  const hooks = {
    host: { platform: 'darwin', architecture: 'arm64' },
    versionProbe: async () => ({
      pythonVersion: HERETIC_PYTHON_VERSION,
      mlxLmVersion: HERETIC_MLX_LM_VERSION,
      prefix: '/tmp/env-rotate',
      executable: '/tmp/env-rotate/bin/python'
    }),
    readReceipt: () => receipt,
    writeReceipt: (_path, value) => { receipt = value; },
    deleteReceipt: () => { receipt = null; },
    processAlive: (pid) => live.has(pid),
    processIdentity: ({ pid }) => live.has(pid) ? { pid, pgid: pid, exactOwnedDetachedGroup: true } : null,
    listMatchingProcesses: async () => [],
    portOccupied: async () => false,
    spawnRuntime: async () => { live.add(nextPid); return nextPid; },
    terminateRuntime: async ({ pid }) => {
      live.delete(pid);
      return { state: 'RETIRED_VERIFIED', exactOwnershipVerified: true, verifiedNotLive: true, processGroupId: pid, signalSent: 'SIGTERM' };
    },
    endpointHealthy: async () => true,
    fetchImpl: async (url) => {
      if (url.endsWith('/health')) return { ok: true, json: async () => ({ status: 'ok' }) };
      if (url.endsWith('/v1/models')) return { ok: true, json: async () => ({ data: [{ id: '/tmp/model-rotate' }] }) };
      if (url.endsWith('/v1/chat/completions')) return { ok: true, json: async () => ({ model: 'default_model', choices: [{ message: { content: 'OK' } }] }) };
      throw new Error(`unexpected URL ${url}`);
    },
    sleep: async () => {},
    now: () => '2026-10-23T09:00:00.000Z',
    nowMs: (() => { let value = 0; return () => (value += 10); })()
  };
  const result = await startOrReuseHereticPersistentRuntime({ binding, hooks });
  assert.equal(result.disposition, 'ROTATED_STALE_SOURCE_AND_STARTED_NEW_EXACT_MLX_RUNTIME');
  assert.equal(live.has(7171), false);
  assert.equal(live.has(8181), true);
  assert.equal(receipt.sourceIdentity.moduleSha256, binding.sourceIdentity.moduleSha256);
});

test('registered Heretic product bundle is release-qualified without moving the legacy cross-platform active pointer', () => {
  const registry = JSON.parse(fs.readFileSync(new URL('../blueprint/model-bundle-registry.json', import.meta.url), 'utf8'));
  const heretic = registry.bundles.find((bundle) => bundle.modelBundleRef === HERETIC_MODEL_BUNDLE_REF);
  assert.equal(heretic.state, 'RELEASE_QUALIFIED');
  assert.notEqual(registry.activeModelBundleRef, HERETIC_MODEL_BUNDLE_REF);
});


test('Heretic environment runtime probe preserves Python statement boundaries', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-heretic-env-probe-program-'));
  const environmentRoot = path.join(root, 'env');
  const pythonPath = path.join(environmentRoot, 'bin', 'python');
  let observedProgram = null;
  const runCommand = (command, args) => {
    if (command === '/opt/homebrew/bin/python3.14' && args[0] === '-c') {
      return {
        status: 0,
        stdout: JSON.stringify({ pythonVersion: HERETIC_PYTHON_VERSION, executable: command }),
        stderr: ''
      };
    }
    if (command === '/opt/homebrew/bin/python3.14' && args[0] === '-m' && args[1] === 'venv') {
      fs.mkdirSync(path.dirname(pythonPath), { recursive: true });
      fs.writeFileSync(pythonPath, '');
      return { status: 0, stdout: '', stderr: '' };
    }
    if (command === pythonPath && args[0] === '-m' && args[1] === 'pip') {
      const report = args[args.indexOf('--report') + 1];
      fs.writeFileSync(report, '{}\n');
      return { status: 0, stdout: '', stderr: '' };
    }
    if (command === pythonPath && args[0] === '-c') {
      observedProgram = args[1];
      assert.match(observedProgram, /import importlib\.metadata as md,json,sys\nimport mlx_lm\nimport mlx_lm\.server\nprint/);
      assert.doesNotMatch(observedProgram, /sysimport mlx_lm/);
      return {
        status: 0,
        stdout: JSON.stringify({
          pythonVersion: HERETIC_PYTHON_VERSION,
          mlxLmVersion: HERETIC_MLX_LM_VERSION,
          prefix: environmentRoot,
          executable: pythonPath
        }),
        stderr: ''
      };
    }
    throw new Error(`unexpected command ${command} ${args.join(' ')}`);
  };
  try {
    const result = await ensureHereticPythonEnvironment({
      bootstrapPython: '/opt/homebrew/bin/python3.14',
      environmentRoot,
      runCommand
    });
    assert.equal(result.state, 'CREATED_VERIFIED');
    assert.ok(observedProgram);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('VexLife Heretic runtime carries and retires the exact launchd lifetime substrate without moving semantic ownership', async () => {
  const binding = formHereticRuntimeOwnerBinding({
    authorityRef: 'authority.test.heretic.launchd',
    modelPath: '/tmp/model-launchd',
    pythonEnvironmentRoot: '/tmp/env-launchd',
    port: 8765,
    receiptPath: '/tmp/runtime/launchd-receipt.json'
  });
  const pid = 9292;
  const live = new Set();
  let receipt = null;
  let retiredSubstrate = null;
  const processSubstrate = {
    schemaVersion: 'vexlife.macos-user-launchd-process/v1',
    substrateRef: 'substrate.vexlife.macos-user-launchd-process.001',
    label: 'com.vexlife.heretic.test-launchd',
    domainTarget: 'gui/501',
    plistPath: '/tmp/runtime/launchd/test.plist',
    programPath: '/tmp/env-launchd/bin/python',
    programArguments: ['-m', 'mlx_lm.server'],
    workingDirectory: '/tmp/env-launchd',
    stdoutPath: '/tmp/runtime/launchd.out.log',
    stderrPath: '/tmp/runtime/launchd.err.log',
    keepAlive: false,
    pid,
  };
  const hooks = {
    host: { platform: 'darwin', architecture: 'arm64' },
    versionProbe: async () => ({
      pythonVersion: HERETIC_PYTHON_VERSION,
      mlxLmVersion: HERETIC_MLX_LM_VERSION,
      prefix: '/tmp/env-launchd',
      executable: '/tmp/env-launchd/bin/python'
    }),
    readReceipt: () => receipt,
    writeReceipt: (_path, value) => { receipt = value; },
    deleteReceipt: () => { receipt = null; },
    processAlive: (value) => live.has(value),
    processIdentity: ({ pid: value }) => live.has(value) ? { pid: value, pgid: value, exactOwnedDetachedGroup: true } : null,
    observeProcessSubstrate: (value) => ({ state: live.has(value.pid) ? 'RUNNING' : 'LOADED_STOPPED', pid: live.has(value.pid) ? value.pid : null }),
    listMatchingProcesses: async () => [],
    portOccupied: async () => false,
    spawnRuntime: async () => { live.add(pid); return { pid, processSubstrate }; },
    terminateRuntime: async ({ pid: value, processSubstrate: substrate }) => {
      retiredSubstrate = substrate;
      live.delete(value);
      return { state: 'RETIRED_VERIFIED', exactOwnershipVerified: true, verifiedNotLive: true, processGroupId: value, signalSent: 'LAUNCHD_BOOTOUT' };
    },
    endpointHealthy: async () => true,
    fetchImpl: async (url) => {
      if (url.endsWith('/health')) return { ok: true, json: async () => ({ status: 'ok' }) };
      if (url.endsWith('/v1/models')) return { ok: true, json: async () => ({ data: [{ id: '/tmp/model-launchd' }] }) };
      if (url.endsWith('/v1/chat/completions')) return { ok: true, json: async () => ({ model: 'default_model', choices: [{ message: { content: 'OK' } }] }) };
      throw new Error(`unexpected URL ${url}`);
    },
    sleep: async () => {},
    now: () => '2026-10-28T12:00:00.000Z',
    nowMs: (() => { let value = 0; return () => (value += 10); })()
  };

  const started = await startOrReuseHereticPersistentRuntime({ binding, hooks });
  assert.equal(started.receipt.runtime.processSubstrate.label, processSubstrate.label);
  assert.equal(started.receipt.runtime.processSubstrate.keepAlive, false);
  assert.equal(started.receipt.runtime.processSubstrate.pid, pid);

  const stopped = await stopHereticPersistentRuntime({ binding, hooks });
  assert.equal(stopped.stop.signalSent, 'LAUNCHD_BOOTOUT');
  assert.equal(retiredSubstrate.label, processSubstrate.label);
  assert.equal(live.has(pid), false);
});



test('VexLife Heretic launchd start waits beyond the former five-second identity window for the same exact-owned process predicate', async () => {
  const binding = formHereticRuntimeOwnerBinding({
    authorityRef: 'authority.test.heretic.launchd-delayed-identity',
    modelPath: '/tmp/model-launchd-delayed',
    pythonEnvironmentRoot: '/tmp/env-launchd-delayed',
    port: 8765,
    receiptPath: '/tmp/runtime/launchd-delayed-receipt.json'
  });
  const pid = 9393;
  let receipt = null;
  let elapsedMs = 0;
  let identityCalls = 0;
  const writes = [];
  const processSubstrate = {
    schemaVersion: 'vexlife.macos-user-launchd-process/v1',
    substrateRef: 'substrate.vexlife.macos-user-launchd-process.001',
    label: 'com.vexlife.heretic.test-delayed-identity',
    domainTarget: 'gui/501',
    plistPath: '/tmp/runtime/launchd/delayed.plist',
    programPath: '/tmp/env-launchd-delayed/bin/python',
    programArguments: ['-m', 'mlx_lm.server'],
    workingDirectory: '/tmp/env-launchd-delayed',
    stdoutPath: '/tmp/runtime/launchd-delayed.out.log',
    stderrPath: '/tmp/runtime/launchd-delayed.err.log',
    keepAlive: false,
    pid,
  };
  const hooks = {
    host: { platform: 'darwin', architecture: 'arm64' },
    versionProbe: async () => ({
      pythonVersion: HERETIC_PYTHON_VERSION,
      mlxLmVersion: HERETIC_MLX_LM_VERSION,
      prefix: '/tmp/env-launchd-delayed',
      executable: '/tmp/env-launchd-delayed/bin/python'
    }),
    readReceipt: () => receipt,
    writeReceipt: (_path, value) => { receipt = value; writes.push(value.state); },
    deleteReceipt: () => { receipt = null; },
    processAlive: () => true,
    processIdentity: ({ pid: value }) => {
      identityCalls += 1;
      return elapsedMs >= 5500
        ? { pid: value, pgid: value, commandMatches: true, exactOwnedDetachedGroup: true }
        : { pid: value, pgid: value, commandMatches: false, exactOwnedDetachedGroup: false };
    },
    observeProcessSubstrate: () => ({ state: 'RUNNING', pid }),
    listMatchingProcesses: async () => [],
    portOccupied: async () => false,
    spawnRuntime: async () => ({ pid, processSubstrate }),
    terminateRuntime: async () => { throw new Error('delayed-but-valid exact launchd process must not be retired'); },
    endpointHealthy: async () => true,
    fetchImpl: async (url) => {
      if (url.endsWith('/health')) return { ok: true, json: async () => ({ status: 'ok' }) };
      if (url.endsWith('/v1/models')) return { ok: true, json: async () => ({ data: [{ id: '/tmp/model-launchd-delayed' }] }) };
      if (url.endsWith('/v1/chat/completions')) return { ok: true, json: async () => ({ model: 'default_model', choices: [{ message: { content: 'OK' } }] }) };
      throw new Error(`unexpected URL ${url}`);
    },
    sleep: async (ms) => { elapsedMs += ms; },
    now: () => '2026-10-28T23:50:00.000Z',
    nowMs: () => elapsedMs,
  };
  const started = await startOrReuseHereticPersistentRuntime({ binding, hooks });
  assert.equal(started.disposition, 'STARTED_NEW_EXACT_MLX_RUNTIME');
  assert.ok(elapsedMs >= 5500);
  assert.ok(identityCalls > 100);
  assert.deepEqual(writes, ['PERSISTENT_MLX_RUNTIME_STARTING', 'PERSISTENT_MLX_RUNTIME_QUALIFIED']);
  assert.equal(receipt.runtime.processSubstrate.label, processSubstrate.label);
});

test('VexLife Heretic launchd start still fails closed and retires the exact substrate when ownership never stabilizes before the bounded timeout', async () => {
  const binding = formHereticRuntimeOwnerBinding({
    authorityRef: 'authority.test.heretic.launchd-identity-timeout',
    modelPath: '/tmp/model-launchd-timeout',
    pythonEnvironmentRoot: '/tmp/env-launchd-timeout',
    port: 8765,
    receiptPath: '/tmp/runtime/launchd-timeout-receipt.json'
  });
  const pid = 9494;
  let elapsedMs = 0;
  let retired = false;
  let live = true;
  const processSubstrate = {
    schemaVersion: 'vexlife.macos-user-launchd-process/v1',
    substrateRef: 'substrate.vexlife.macos-user-launchd-process.001',
    label: 'com.vexlife.heretic.test-identity-timeout',
    domainTarget: 'gui/501',
    plistPath: '/tmp/runtime/launchd/timeout.plist',
    programPath: '/tmp/env-launchd-timeout/bin/python',
    programArguments: ['-m', 'mlx_lm.server'],
    workingDirectory: '/tmp/env-launchd-timeout',
    stdoutPath: '/tmp/runtime/launchd-timeout.out.log',
    stderrPath: '/tmp/runtime/launchd-timeout.err.log',
    keepAlive: false,
    pid,
  };
  const hooks = {
    host: { platform: 'darwin', architecture: 'arm64' },
    versionProbe: async () => ({
      pythonVersion: HERETIC_PYTHON_VERSION,
      mlxLmVersion: HERETIC_MLX_LM_VERSION,
      prefix: '/tmp/env-launchd-timeout',
      executable: '/tmp/env-launchd-timeout/bin/python'
    }),
    readReceipt: () => null,
    writeReceipt: () => { throw new Error('receipt must not be written without exact process ownership'); },
    deleteReceipt: () => {},
    processAlive: () => live,
    processIdentity: ({ pid: value }) => ({ pid: value, pgid: value, commandMatches: false, exactOwnedDetachedGroup: false }),
    observeProcessSubstrate: () => ({ state: live ? 'RUNNING' : 'ABSENT', pid: live ? pid : null }),
    retireProcessSubstrate: async (observed, { expectedPid }) => {
      assert.equal(observed.label, processSubstrate.label);
      assert.equal(expectedPid, pid);
      retired = true;
      live = false;
      return { state: 'RETIRED_VERIFIED', exactOwnershipVerified: true, verifiedNotLive: true, processGroupId: pid, signalSent: 'LAUNCHD_BOOTOUT' };
    },
    listMatchingProcesses: async () => [],
    portOccupied: async () => false,
    spawnRuntime: async () => ({ pid, processSubstrate }),
    terminateRuntime: async () => { throw new Error('final-process terminate path must not be used before exact semantic ownership'); },
    endpointHealthy: async () => { throw new Error('readiness must not run without exact ownership'); },
    fetchImpl: async () => { throw new Error('qualification must not run without exact ownership'); },
    sleep: async (ms) => { elapsedMs += ms; },
    now: () => '2026-10-28T23:50:00.000Z',
    nowMs: () => elapsedMs,
  };
  await assert.rejects(
    startOrReuseHereticPersistentRuntime({ binding, hooks }),
    (error) => error?.code === 'HERETIC_RUNTIME_PROCESS_OWNERSHIP_CONFLICT'
      && error?.detail?.ownershipState === 'TIMEOUT'
      && error?.detail?.cleanup?.state === 'RETIRED_VERIFIED'
      && error?.detail?.cleanup?.exactOwnershipVerified === true
      && error?.detail?.cleanup?.verifiedNotLive === true
  );
  assert.ok(elapsedMs >= 30000);
  assert.equal(retired, true);
  assert.equal(live, false);
});

test('VexLife Heretic launchd ownership wait observes cancellation and retires provisional launchd custody before any STARTING receipt', async () => {
  const binding = formHereticRuntimeOwnerBinding({
    authorityRef: 'authority.test.heretic.launchd-ownership-cancel',
    modelPath: '/tmp/model-launchd-cancel',
    pythonEnvironmentRoot: '/tmp/env-launchd-cancel',
    port: 8765,
    receiptPath: '/tmp/runtime/launchd-cancel-receipt.json'
  });
  const pid = 9595;
  let elapsedMs = 0;
  let retired = false;
  let live = true;
  const writes = [];
  const processSubstrate = {
    schemaVersion: 'vexlife.macos-user-launchd-process/v1',
    substrateRef: 'substrate.vexlife.macos-user-launchd-process.001',
    label: 'com.vexlife.heretic.test-ownership-cancel',
    domainTarget: 'gui/501',
    plistPath: '/tmp/runtime/launchd/cancel.plist',
    programPath: '/tmp/env-launchd-cancel/bin/python',
    programArguments: ['-m', 'mlx_lm.server'],
    workingDirectory: '/tmp/env-launchd-cancel',
    stdoutPath: '/tmp/runtime/launchd-cancel.out.log',
    stderrPath: '/tmp/runtime/launchd-cancel.err.log',
    keepAlive: false,
    pid,
  };
  const hooks = {
    host: { platform: 'darwin', architecture: 'arm64' },
    versionProbe: async () => ({
      pythonVersion: HERETIC_PYTHON_VERSION,
      mlxLmVersion: HERETIC_MLX_LM_VERSION,
      prefix: '/tmp/env-launchd-cancel',
      executable: '/tmp/env-launchd-cancel/bin/python'
    }),
    readReceipt: () => null,
    writeReceipt: (_path, value) => { writes.push(value.state); },
    deleteReceipt: () => {},
    processAlive: () => live,
    processIdentity: ({ pid: value }) => ({ pid: value, pgid: value, commandMatches: false, exactOwnedDetachedGroup: false }),
    observeProcessSubstrate: () => ({ state: live ? 'RUNNING' : 'ABSENT', pid: live ? pid : null }),
    retireProcessSubstrate: async (observed, { expectedPid }) => {
      assert.equal(observed.label, processSubstrate.label);
      assert.equal(expectedPid, pid);
      retired = true;
      live = false;
      return { state: 'RETIRED_VERIFIED', exactOwnershipVerified: true, verifiedNotLive: true, processGroupId: pid, signalSent: 'LAUNCHD_BOOTOUT' };
    },
    listMatchingProcesses: async () => [],
    portOccupied: async () => false,
    spawnRuntime: async () => ({ pid, processSubstrate }),
    terminateRuntime: async () => { throw new Error('final-process terminate path must not be used for provisional cancellation'); },
    endpointHealthy: async () => { throw new Error('readiness must not run after provisional cancellation'); },
    fetchImpl: async () => { throw new Error('qualification must not run after provisional cancellation'); },
    sleep: async (ms) => { elapsedMs += ms; },
    now: () => '2026-10-29T00:00:00.000Z',
    nowMs: () => elapsedMs,
    cancellationRequested: () => elapsedMs >= 200,
  };

  await assert.rejects(
    startOrReuseHereticPersistentRuntime({ binding, hooks }),
    (error) => error?.code === 'HERETIC_RUNTIME_CANCELLED'
  );
  assert.ok(elapsedMs >= 200 && elapsedMs < 1000);
  assert.equal(retired, true);
  assert.equal(live, false);
  assert.deepEqual(writes, []);
});



test('VexLife Heretic launchd start preserves the last-known-good direct mlx_lm.server argv and explicit Hugging Face cache environment', () => {
  const source = fs.readFileSync(new URL('../src/core/heretic-persistent-runtime-owner.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /HERETIC_PROCESS_GROUP_WRAPPER/u);
  assert.doesNotMatch(source, /programArguments:\s*\['-c'/u);
  assert.match(source, /programPath:\s*binding\.pythonPath/u);
  assert.match(source, /programArguments:\s*\[\.\.\.args\]/u);
  assert.match(source, /'HF_HUB_CACHE'/u);
});


test('VexLife Heretic launchd ownership establishment does not treat a transient kill-zero miss as process exit while the exact launchd substrate remains running', async () => {
  const binding = formHereticRuntimeOwnerBinding({
    authorityRef: 'authority.test.heretic.launchd-transient-kill-zero',
    modelPath: '/tmp/model-launchd-transient-kill-zero',
    pythonEnvironmentRoot: '/tmp/env-launchd-transient-kill-zero',
    port: 8765,
    receiptPath: '/tmp/runtime/launchd-transient-kill-zero-receipt.json'
  });
  const pid = 9696;
  let elapsedMs = 0;
  let receipt = null;
  let retired = false;
  const processSubstrate = {
    schemaVersion: 'vexlife.macos-user-launchd-process/v1',
    substrateRef: 'substrate.vexlife.macos-user-launchd-process.001',
    label: 'com.vexlife.heretic.test-transient-kill-zero',
    domainTarget: 'gui/501',
    plistPath: '/tmp/runtime/launchd/transient-kill-zero.plist',
    programPath: '/tmp/env-launchd-transient-kill-zero/bin/python',
    programArguments: ['-m', 'mlx_lm.server'],
    workingDirectory: '/tmp/env-launchd-transient-kill-zero',
    stdoutPath: '/tmp/runtime/launchd-transient-kill-zero.out.log',
    stderrPath: '/tmp/runtime/launchd-transient-kill-zero.err.log',
    keepAlive: false,
    pid,
  };
  const hooks = {
    host: { platform: 'darwin', architecture: 'arm64' },
    versionProbe: async () => ({
      pythonVersion: HERETIC_PYTHON_VERSION,
      mlxLmVersion: HERETIC_MLX_LM_VERSION,
      prefix: '/tmp/env-launchd-transient-kill-zero',
      executable: '/tmp/env-launchd-transient-kill-zero/bin/python'
    }),
    readReceipt: () => receipt,
    writeReceipt: (_path, value) => { receipt = value; },
    deleteReceipt: () => { receipt = null; },
    processAlive: () => elapsedMs >= 200,
    processIdentity: ({ pid: value }) => elapsedMs >= 200
      ? { pid: value, pgid: value, commandMatches: true, exactOwnedDetachedGroup: true }
      : null,
    observeProcessSubstrate: () => ({ state: 'RUNNING', pid }),
    retireProcessSubstrate: async () => {
      retired = true;
      return { state: 'RETIRED_VERIFIED', exactOwnershipVerified: true, verifiedNotLive: true, signalSent: 'LAUNCHD_BOOTOUT' };
    },
    listMatchingProcesses: async () => [],
    portOccupied: async () => false,
    spawnRuntime: async () => ({ pid, processSubstrate }),
    terminateRuntime: async () => { throw new Error('transient launchd establishment must not be retired'); },
    endpointHealthy: async () => true,
    fetchImpl: async (url) => {
      if (url.endsWith('/health')) return { ok: true, json: async () => ({ status: 'ok' }) };
      if (url.endsWith('/v1/models')) return { ok: true, json: async () => ({ data: [{ id: '/tmp/model-launchd-transient-kill-zero' }] }) };
      if (url.endsWith('/v1/chat/completions')) return { ok: true, json: async () => ({ model: 'default_model', choices: [{ message: { content: 'OK' } }] }) };
      throw new Error(`unexpected URL ${url}`);
    },
    sleep: async (ms) => { elapsedMs += ms; },
    now: () => '2026-10-29T01:00:00.000Z',
    nowMs: () => elapsedMs,
  };

  const started = await startOrReuseHereticPersistentRuntime({ binding, hooks });
  assert.equal(started.disposition, 'STARTED_NEW_EXACT_MLX_RUNTIME');
  assert.ok(elapsedMs >= 200);
  assert.equal(retired, false);
  assert.equal(receipt.state, 'PERSISTENT_MLX_RUNTIME_QUALIFIED');
  assert.equal(receipt.runtime.processSubstrate.label, processSubstrate.label);
});

// [VXG RealForever]
