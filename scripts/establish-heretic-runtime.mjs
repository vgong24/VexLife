#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { classifyExactArtifact, resolveAndDownloadArtifact } from '../src/core/artifact-delivery.mjs';
import {
  HERETIC_MODEL_BUNDLE_REF,
  HERETIC_PYTHON_VERSION,
  establishHereticRuntime,
  formHereticMaterializationPlan
} from '../src/core/heretic-runtime-establishment.mjs';
import {
  HERETIC_RUNTIME_RECEIPT_RELATIVE_PATH,
  formHereticModelConfiguration,
  formHereticPendingModelConfiguration,
  isHereticModelConfiguration,
  validateHereticModelConfiguration
} from '../src/core/heretic-runtime-link.mjs';
import {
  currentHereticRuntimeOwnerSourceIdentity,
  startOrReuseHereticPersistentRuntime,
  stopHereticPersistentRuntime
} from '../src/core/heretic-persistent-runtime-owner.mjs';
import { resolveModelBundleByRef } from '../src/core/vex-initialization.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(HERE, '..');
const HERETIC_PLAN_SCHEMA = 'vexlife.heretic-normal-start-plan/v1';
const HERETIC_RESULT_SCHEMA = 'vexlife.heretic-normal-start-result/v1';
const BOOTSTRAP_PYTHON_CANDIDATES = Object.freeze([
  '/opt/homebrew/bin/python3.14',
  '/opt/homebrew/opt/python@3.14/bin/python3.14',
  '/usr/local/bin/python3.14',
  '/usr/local/opt/python@3.14/bin/python3.14',
  'python3.14'
]);

function fail(code, message, detail = null) {
  const error = new Error(message);
  error.code = code;
  error.detail = detail;
  throw error;
}
function argsMap(argv) {
  const out = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) fail('ARGUMENT_INVALID', `unexpected argument: ${key}`);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out.set(key, true);
    else { out.set(key, next); i += 1; }
  }
  return out;
}
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.partial-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temp, filePath);
}
function loadHomeIdentity(vexHome) {
  const value = readJson(path.join(vexHome, 'config', 'home.json'));
  if (!value || typeof value.homeRef !== 'string' || typeof value.currentCompanionLineageRef !== 'string') {
    fail('HERETIC_HOME_IDENTITY_INVALID', 'Vex Home identity is missing the current Home/Companion lineage');
  }
  return Object.freeze({ homeRef: value.homeRef, companionLineageRef: value.currentCompanionLineageRef });
}
function probePython(command) {
  const program = 'import json,sys;print(json.dumps({"pythonVersion":"%d.%d.%d"%sys.version_info[:3],"executable":sys.executable}))';
  const result = spawnSync(command, ['-c', program], { encoding: 'utf8', shell: false, timeout: 30000 });
  if (result.error || result.status !== 0) return null;
  try {
    const parsed = JSON.parse(result.stdout);
    return parsed.pythonVersion === HERETIC_PYTHON_VERSION ? Object.freeze({ command, ...parsed }) : null;
  } catch { return null; }
}
function findExactBootstrapPython() {
  for (const candidate of BOOTSTRAP_PYTHON_CANDIDATES) {
    const probe = probePython(candidate);
    if (probe) return probe;
  }
  return null;
}
function ensureExactBootstrapPython() {
  const current = findExactBootstrapPython();
  if (current) return Object.freeze({ ...current, disposition: 'REUSED_EXACT_BOOTSTRAP_PYTHON' });
  fail('HERETIC_BOOTSTRAP_PYTHON_PREREQUISITE_REQUIRED', `Exact Python ${HERETIC_PYTHON_VERSION} is required before Heretic runtime acquisition`);
}
function hostPlan({ requireBootstrapPython = true } = {}) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    return Object.freeze({
      schemaVersion: HERETIC_PLAN_SCHEMA,
      state: 'HERETIC_HOST_UNSUPPORTED_NO_EFFECT',
      platform: process.platform,
      architecture: process.arch,
      effects: false
    });
  }
  const chip = spawnSync('/usr/sbin/sysctl', ['-n', 'machdep.cpu.brand_string'], { encoding: 'utf8', shell: false, timeout: 5000 });
  const chipModel = chip.error || chip.status !== 0 ? null : String(chip.stdout || '').trim();
  if (chipModel !== 'Apple M4 Pro') {
    return Object.freeze({
      schemaVersion: HERETIC_PLAN_SCHEMA,
      state: 'HERETIC_HOST_UNSUPPORTED_NO_EFFECT',
      platform: process.platform,
      architecture: process.arch,
      expectedAppleChipModel: 'Apple M4 Pro',
      observedAppleChipModel: chipModel,
      effects: false
    });
  }
  if (os.totalmem() < 12 * 1024 * 1024 * 1024) {
    return Object.freeze({
      schemaVersion: HERETIC_PLAN_SCHEMA,
      state: 'HERETIC_HOST_UNSUPPORTED_NO_EFFECT',
      reason: 'INSUFFICIENT_SYSTEM_MEMORY',
      effects: false
    });
  }
  const modelBundleRegistry = readJson(path.join(REPOSITORY_ROOT, 'blueprint', 'model-bundle-registry.json'));
  const artifactRegistry = readJson(path.join(REPOSITORY_ROOT, 'blueprint', 'artifact-registry.json'));
  const resolution = resolveModelBundleByRef({ registry: modelBundleRegistry, artifactRegistry, modelBundleRef: HERETIC_MODEL_BUNDLE_REF });
  let materializationPlan;
  try { materializationPlan = formHereticMaterializationPlan(resolution); }
  catch (error) {
    return Object.freeze({
      schemaVersion: HERETIC_PLAN_SCHEMA,
      state: 'HERETIC_SOURCE_NOT_READY_NO_EFFECT',
      reason: error.code || error.message,
      effects: false
    });
  }
  const python = findExactBootstrapPython();
  if (requireBootstrapPython && !python) {
    return Object.freeze({
      schemaVersion: HERETIC_PLAN_SCHEMA,
      state: 'HERETIC_BOOTSTRAP_PYTHON_PREREQUISITE_REQUIRED_NO_EFFECT',
      platform: process.platform,
      architecture: process.arch,
      requiredPythonVersion: HERETIC_PYTHON_VERSION,
      effects: false
    });
  }
  return Object.freeze({
    schemaVersion: HERETIC_PLAN_SCHEMA,
    state: 'HERETIC_PLAN_READY_NO_EFFECT',
    platform: process.platform,
    architecture: process.arch,
    modelBundleRef: HERETIC_MODEL_BUNDLE_REF,
    artifactMemberCount: materializationPlan.members.length,
    expectedModelBytes: materializationPlan.totalBytes,
    requiredPythonVersion: HERETIC_PYTHON_VERSION,
    bootstrapPythonDisposition: python ? 'EXACT_REUSABLE' : 'NOT_REQUIRED_FOR_LOCAL_REUSE',
    effects: false
  });
}
function readExistingModelConfiguration(vexHome) {
  const filePath = path.join(vexHome, 'config', 'model.json');
  if (!fs.existsSync(filePath)) return null;
  return readJson(filePath);
}
function ensureHereticSelectionConfiguration(vexHome, homeIdentity) {
  const existing = readExistingModelConfiguration(vexHome);
  if (!existing || existing.state === 'UNCONFIGURED') {
    const pending = formHereticPendingModelConfiguration({ homeIdentity });
    writeJsonAtomic(path.join(vexHome, 'config', 'model.json'), pending);
    return pending;
  }
  if (isHereticModelConfiguration(existing)) {
    return validateHereticModelConfiguration(existing, { homeIdentity });
  }
  fail('HERETIC_EXISTING_HOME_MIGRATION_REQUIRED', 'existing Vex Home has a non-Heretic model binding; ordinary setup will not silently replace it');
}
async function materializeMember({ member, finalPath, allowAcquisition }) {
  const local = await classifyExactArtifact({
    finalPath,
    expectedSha256: member.sha256,
    expectedBytes: member.byteLength
  });
  if (local.state === 'VERIFIED_REUSABLE') return local;
  if (!allowAcquisition) {
    fail('HERETIC_ARTIFACT_REACQUISITION_REQUIRED', `Heretic artifact ${member.logicalPath} is not exactly reusable and acquisition was not authorized`, { state: local.state });
  }
  return resolveAndDownloadArtifact({ artifactRef: member.artifactRef, finalPath });
}

async function runOwnedHereticRuntime({ binding }) {
  let cancellationRequested = false;
  const requestStop = () => { cancellationRequested = true; };
  const onTerm = () => requestStop();
  const onInt = () => requestStop();
  process.on('SIGTERM', onTerm);
  process.on('SIGINT', onInt);
  try {
    const result = await startOrReuseHereticPersistentRuntime({
      binding,
      hooks: { cancellationRequested: () => cancellationRequested }
    });
    if (cancellationRequested) {
      await stopHereticPersistentRuntime({ binding });
      fail('HERETIC_RUNTIME_CANCELLED', 'Heretic runtime start was cancelled');
    }
    return result;
  } finally {
    process.off('SIGTERM', onTerm);
    process.off('SIGINT', onInt);
  }
}

export async function runHereticNormalStart(argv = process.argv.slice(2)) {
  const args = argsMap(argv);
  const planOnly = args.get('--plan-only') === true;
  const allowAcquisition = args.get('--allow-acquisition') === true;
  if (planOnly) return hostPlan();
  const currentPlan = hostPlan({ requireBootstrapPython: allowAcquisition });
  if (currentPlan.state !== 'HERETIC_PLAN_READY_NO_EFFECT') {
    fail(currentPlan.state, 'current host does not satisfy the ordinary Heretic product prerequisites', currentPlan);
  }
  const homeArg = args.get('--home') || process.env.VEX_HOME;
  if (typeof homeArg !== 'string' || homeArg.length === 0) fail('HERETIC_HOME_REQUIRED', '--home or VEX_HOME is required');
  const vexHome = fs.realpathSync(path.resolve(homeArg));
  const homeIdentity = loadHomeIdentity(vexHome);
  ensureHereticSelectionConfiguration(vexHome, homeIdentity);

  const modelBundleRegistry = readJson(path.join(REPOSITORY_ROOT, 'blueprint', 'model-bundle-registry.json'));
  const artifactRegistry = readJson(path.join(REPOSITORY_ROOT, 'blueprint', 'artifact-registry.json'));
  const resolution = resolveModelBundleByRef({
    registry: modelBundleRegistry,
    artifactRegistry,
    modelBundleRef: HERETIC_MODEL_BUNDLE_REF
  });
  const materializationPlan = formHereticMaterializationPlan(resolution);
  const modelPath = path.join(vexHome, 'models', 'heretic', 'qwen3.8-27b-mlx4', materializationPlan.providerRevision);
  const pythonEnvironmentRoot = path.join(vexHome, 'runtime', 'heretic', 'python-3.14.7-mlx-lm-0.32.0');
  const receiptPath = path.join(vexHome, ...HERETIC_RUNTIME_RECEIPT_RELATIVE_PATH.split('/'));
  const huggingFaceCacheRoot = path.join(vexHome, 'runtime', 'heretic', 'huggingface-cache');

  if (!allowAcquisition) {
    if (!fs.existsSync(modelPath) || !fs.existsSync(pythonEnvironmentRoot)) {
      fail('HERETIC_RUNTIME_REACQUISITION_REQUIRED', 'Heretic model/environment is not locally reusable and acquisition was not authorized');
    }
  }
  const bootstrapPython = allowAcquisition
    ? ensureExactBootstrapPython()
    : (findExactBootstrapPython() ?? Object.freeze({ command: 'python3.14', disposition: 'NOT_REQUIRED_FOR_LOCAL_REUSE' }));
  let established;
  try {
    established = await establishHereticRuntime({
      resolution,
      modelPath,
      materializeArtifact: ({ finalPath, member }) => materializeMember({ member, finalPath, allowAcquisition }),
      bootstrapPython: bootstrapPython.command,
      pythonEnvironmentRoot,
      authorityRef: 'authority.vexlife.heretic-runtime-establishment.explicit-user-setup.v1',
      port: 8765,
      receiptPath,
      sourceIdentity: currentHereticRuntimeOwnerSourceIdentity(),
      huggingFaceCacheRoot,
      allowEnvironmentCreation: allowAcquisition,
      runtimeOwner: runOwnedHereticRuntime
    });
    const configuration = formHereticModelConfiguration({ homeIdentity, receipt: established.runtime.receipt });
    writeJsonAtomic(path.join(vexHome, 'config', 'model.json'), configuration);
    return Object.freeze({
      schemaVersion: HERETIC_RESULT_SCHEMA,
      state: 'HERETIC_RUNTIME_ESTABLISHED',
      modelBundleRef: established.plan.modelBundleRef,
      modelRef: established.runtime.receipt.modelRef,
      modelProfileRef: established.runtime.receipt.modelProfileRef,
      artifactContentSetSha256: established.materialization.contentSetSha256,
      memberCount: established.materialization.memberCount,
      totalBytes: established.materialization.totalBytes,
      pythonVersion: established.environment.pythonVersion,
      mlxLmVersion: established.environment.mlxLmVersion,
      bootstrapPythonDisposition: bootstrapPython.disposition,
      runtimeDisposition: established.runtime.disposition,
      runtimePid: established.runtime.pid,
      runtimeReceiptPath: receiptPath,
      endpoint: established.runtime.receipt.endpoint,
      requestModel: established.runtime.receipt.requestModel,
      sourceIdentity: established.runtime.receipt.sourceIdentity,
      productConfigurationPath: path.join(vexHome, 'config', 'model.json')
    });
  } catch (error) {
    // The runtime owner cleans all failures before qualification. If product
    // configuration fails after qualification, retire the exact runtime rather
    // than leaving an unbound process behind.
    if (established?.binding) {
      try { await stopHereticPersistentRuntime({ binding: established.binding }); }
      catch (cleanupError) {
        error.cleanupError = cleanupError?.message || String(cleanupError);
      }
    }
    throw error;
  }
}

const directExecutionPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (directExecutionPath === fileURLToPath(import.meta.url)) {
  runHereticNormalStart().then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`[VexLife] Heretic normal start failed: ${error.code || error.name}: ${error.message}\n`);
    if (error.detail) process.stderr.write(`${JSON.stringify(error.detail, null, 2)}\n`);
    if (error.cleanupError) process.stderr.write(`cleanupError=${error.cleanupError}\n`);
    process.exitCode = 1;
  });
}

// [VXG RealForever]
