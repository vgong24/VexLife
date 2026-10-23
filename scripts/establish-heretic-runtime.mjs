#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { resolveAndDownloadArtifact } from '../src/core/artifact-delivery.mjs';
import { resolveModelBundleByRef } from '../src/core/vex-initialization.mjs';
import {
  HERETIC_MODEL_BUNDLE_REF,
  establishHereticRuntime,
  formHereticMaterializationPlan
} from '../src/core/heretic-runtime-establishment.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(HERE, '..');
const SDK_OWNER_RELATIVE_PATH = 'lib/vexlocalbridge/mlx-persistent-runtime-owner.js';
const ACCEPTED_SDK_REMOTES = new Set([
  'https://github.com/vgong24/Vextreme-SDK.git',
  'git@github.com:vgong24/Vextreme-SDK.git',
  'ssh://git@github.com/vgong24/Vextreme-SDK.git'
]);

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function inspectSdkSource(sdkRoot) {
  const resolvedRoot = fs.realpathSync(path.resolve(sdkRoot));
  const remote = git(resolvedRoot, ['config', '--get', 'remote.origin.url']);
  if (!ACCEPTED_SDK_REMOTES.has(remote)) {
    throw new Error(`Vextreme-SDK remote identity is not accepted: ${remote}`);
  }
  const revision = git(resolvedRoot, ['rev-parse', 'HEAD']);
  const tree = git(resolvedRoot, ['rev-parse', 'HEAD^{tree}']);
  const trackedModule = git(resolvedRoot, ['ls-files', '--error-unmatch', SDK_OWNER_RELATIVE_PATH]);
  if (trackedModule !== SDK_OWNER_RELATIVE_PATH) {
    throw new Error('Vextreme-SDK MLX persistent runtime owner is not tracked at the expected path');
  }
  const moduleStatus = git(resolvedRoot, ['status', '--porcelain=v1', '--', SDK_OWNER_RELATIVE_PATH]);
  if (moduleStatus !== '') {
    throw new Error('Vextreme-SDK MLX persistent runtime owner differs from the selected Git revision');
  }
  const modulePath = path.join(resolvedRoot, SDK_OWNER_RELATIVE_PATH);
  const stat = fs.lstatSync(modulePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('Vextreme-SDK MLX persistent runtime owner must be one real file');
  }
  const moduleSha256 = crypto.createHash('sha256').update(fs.readFileSync(modulePath)).digest('hex');
  return {
    sdkRoot: resolvedRoot,
    modulePath,
    sourceIdentity: {
      repository: 'vgong24/Vextreme-SDK',
      revision,
      tree,
      moduleSha256
    }
  };
}

function candidateSdkRoots(vexHome) {
  const explicit = process.env.VEXTREME_SDK_ROOT;
  if (explicit) return [explicit];
  return [
    path.join(vexHome, 'repositories', 'Vextreme-SDK'),
    path.join(vexHome, 'repositories', 'vextreme-sdk'),
    path.join(vexHome, 'repositories', 'sdk')
  ].filter((candidate) => fs.existsSync(candidate));
}

function selectSdkSource(vexHome) {
  const inspected = [];
  for (const candidate of candidateSdkRoots(vexHome)) {
    try {
      inspected.push(inspectSdkSource(candidate));
    } catch {
      // Keep looking; exact failure is reported only when no admitted source remains.
    }
  }
  if (inspected.length !== 1) {
    throw new Error(
      inspected.length === 0
        ? 'No exact Vextreme-SDK source was found; set VEXTREME_SDK_ROOT to the accepted checkout'
        : 'Multiple exact Vextreme-SDK sources were found; set VEXTREME_SDK_ROOT to select one'
    );
  }
  return inspected[0];
}

function positivePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('VEX_HERETIC_RUNTIME_PORT must be an integer from 1024 through 65535');
  }
  return port;
}

function findBootstrapPython() {
  if (process.env.VEX_HERETIC_BOOTSTRAP_PYTHON) {
    return process.env.VEX_HERETIC_BOOTSTRAP_PYTHON;
  }
  const homebrew = '/opt/homebrew/bin/python3.14';
  return fs.existsSync(homebrew) ? homebrew : 'python3.14';
}

async function main() {
  const vexHome = fs.realpathSync(requiredEnvironment('VEX_HOME'));
  const sdk = selectSdkSource(vexHome);
  const require = createRequire(import.meta.url);
  const owner = require(sdk.modulePath);

  const modelBundleRegistry = readJson(path.join(REPOSITORY_ROOT, 'blueprint', 'model-bundle-registry.json'));
  const artifactRegistry = readJson(path.join(REPOSITORY_ROOT, 'blueprint', 'artifact-registry.json'));
  const resolution = resolveModelBundleByRef({
    registry: modelBundleRegistry,
    artifactRegistry,
    modelBundleRef: process.env.VEX_HERETIC_MODEL_BUNDLE_REF || HERETIC_MODEL_BUNDLE_REF
  });
  const materializationPlan = formHereticMaterializationPlan(resolution);

  const modelPath = path.join(
    vexHome,
    'models',
    'heretic',
    'qwen3.8-27b-mlx4',
    materializationPlan.providerRevision
  );
  const pythonEnvironmentRoot = path.join(
    vexHome,
    'runtime',
    'heretic',
    'python-3.14.7-mlx-lm-0.32.0'
  );
  const receiptPath = path.join(
    vexHome,
    'runtime',
    'heretic',
    'persistent-runtime-owner-receipt.json'
  );

  const huggingFaceCacheRoot = path.join(
    vexHome,
    'runtime',
    'heretic',
    'huggingface-cache'
  );

  const result = await establishHereticRuntime({
    resolution,
    modelPath,
    materializeArtifact: ({ artifactRef, finalPath }) =>
      resolveAndDownloadArtifact({ artifactRef, finalPath }),
    bootstrapPython: findBootstrapPython(),
    pythonEnvironmentRoot,
    owner,
    authorityRef:
      process.env.VEX_HERETIC_RUNTIME_AUTHORITY_REF ||
      'authority.vexlife.heretic-runtime-establishment.explicit-user-invocation.v1',
    port: positivePort(process.env.VEX_HERETIC_RUNTIME_PORT || '8765'),
    receiptPath,
    sourceIdentity: sdk.sourceIdentity,
    huggingFaceCacheRoot
  });

  process.stdout.write(`${JSON.stringify({
    schemaVersion: result.schemaVersion,
    state: result.state,
    modelBundleRef: result.plan.modelBundleRef,
    artifactContentSetSha256: result.materialization.contentSetSha256,
    memberCount: result.materialization.memberCount,
    totalBytes: result.materialization.totalBytes,
    pythonVersion: result.environment.pythonVersion,
    mlxLmVersion: result.environment.mlxLmVersion,
    runtimeDisposition: result.runtime.disposition ?? null,
    runtimeReceiptPath: receiptPath,
    endpoint: result.runtime.receipt?.endpoint ?? null,
    sourceIdentity: sdk.sourceIdentity
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`[VexLife] Heretic runtime establishment failed: ${error.code || error.name}: ${error.message}\n`);
  if (error.detail) process.stderr.write(`${JSON.stringify(error.detail, null, 2)}\n`);
  process.exitCode = 1;
});

// [VXG RealForever]
