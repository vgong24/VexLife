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
  formHereticSdkOwnerBinding,
  materializeHereticBundle,
  withHereticHuggingFaceCache
} from '../src/core/heretic-runtime-establishment.mjs';

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

test('SDK owner binding carries exact Heretic identity without changing Home activation', () => {
  const binding = formHereticSdkOwnerBinding({
    authorityRef: 'authority.test.heretic.explicit',
    modelPath: '/tmp/model',
    pythonEnvironmentRoot: '/tmp/env',
    port: 8765,
    receiptPath: '/tmp/runtime/receipt.json',
    sourceIdentity: {
      repository: 'vgong24/Vextreme-SDK',
      revision: '1'.repeat(40),
      tree: '2'.repeat(40),
      moduleSha256: '3'.repeat(64)
    }
  });
  assert.equal(binding.artifactContentSetSha256, HERETIC_ARTIFACT_CONTENT_SET_SHA256);
  assert.equal(binding.pythonVersion, HERETIC_PYTHON_VERSION);
  assert.equal(binding.mlxLmVersion, HERETIC_MLX_LM_VERSION);
  assert.equal(binding.pythonPath, '/tmp/env/bin/python');
  assert.equal(Object.hasOwn(binding, 'activeModelBundleRef'), false);
});

// [VXG RealForever]
