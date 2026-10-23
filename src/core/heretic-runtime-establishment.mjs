import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const HERETIC_RUNTIME_ESTABLISHMENT_SCHEMA =
  'vexlife.heretic-runtime-establishment/v1';
export const HERETIC_MODEL_BUNDLE_REF =
  'model-bundle.vexlife.heretic.qwen3.8-27b.mlx4.329658ee8f27.001';
export const HERETIC_MODEL_REF =
  'model.devex.heretic.qwen3.8-27b.mlx4.329658ee8f27';
export const HERETIC_MODEL_PROFILE_REF =
  'model-profile.devex.qwen38-27b-heretic-mlx4.certified.20260928A';
export const HERETIC_ARTIFACT_SET_REF =
  'artifact.devex.qwen3.8-27b-heretic-mlx-4bit.808b82a2';
export const HERETIC_ARTIFACT_CONTENT_SET_SHA256 =
  '329658ee8f270056bc29d8a6cfd6e9f1b7d9d14c659452c9e4dd46fc7c78d780';
export const HERETIC_RUNTIME_ADAPTER_REF =
  'adapter.runtime.mlx.macos-victor.001';
export const HERETIC_RUNTIME_CLASS = 'MLX_LM_DIRECT_RUNTIME';
export const HERETIC_HOST_EXECUTION_PROFILE_REF =
  'profile.repository.vextreme-sdk.macos-v1';
export const HERETIC_PYTHON_VERSION = '3.14.7';
export const HERETIC_MLX_LM_VERSION = '0.32.0';
export const HERETIC_TRAINER_SOURCE_COMMIT =
  '170a11c58ce7d22a720901a2535adb0c218b871b';

const SHA256 = /^[0-9a-f]{64}$/u;
const GIT_ID = /^[0-9a-f]{40,64}$/u;
const STABLE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;
const EXPECTED_RESOLUTION_STATE = 'MODEL_BUNDLE_RUNTIME_REALIZATION_HELD';

export class HereticRuntimeEstablishmentError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = 'HereticRuntimeEstablishmentError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, message, detail = null) {
  throw new HereticRuntimeEstablishmentError(code, message, detail);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('OBJECT_REQUIRED', `${label} must be an object`);
  }
  return value;
}

function absolute(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    fail('ABSOLUTE_PATH_REQUIRED', `${label} must be absolute`);
  }
  return path.resolve(value);
}

function stableRef(value, label) {
  if (typeof value !== 'string' || !STABLE_REF.test(value) || path.isAbsolute(value)) {
    fail('STABLE_REF_REQUIRED', `${label} must be a stable ref`);
  }
  return value;
}

function safeLogicalPath(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value === '.' ||
    value === '..' ||
    value.includes('\0') ||
    value.includes('/') ||
    value.includes('\\') ||
    path.basename(value) !== value
  ) {
    fail('UNSAFE_MODEL_MEMBER_PATH', 'model member filename must be one safe path segment', {
      filename: value
    });
  }
  return value;
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

export function computeArtifactContentSetSha256(members) {
  if (!Array.isArray(members) || members.length === 0) {
    fail('MODEL_MEMBER_SET_REQUIRED', 'members must be a non-empty array');
  }
  const ordered = members.map((member, index) => {
    object(member, `members[${index}]`);
    const logicalPath = safeLogicalPath(member.logicalPath);
    if (!SHA256.test(member.sha256)) {
      fail('MODEL_MEMBER_SHA256_REQUIRED', `members[${index}].sha256 must be lowercase SHA-256`);
    }
    if (!Number.isSafeInteger(member.byteLength) || member.byteLength < 0) {
      fail('MODEL_MEMBER_BYTE_LENGTH_REQUIRED', `members[${index}].byteLength must be a non-negative safe integer`);
    }
    return {
      logicalPath,
      sha256: member.sha256,
      byteLength: member.byteLength
    };
  }).sort((left, right) => compareUtf8(left.logicalPath, right.logicalPath));
  const seen = new Set();
  const hash = crypto.createHash('sha256');
  for (const member of ordered) {
    if (seen.has(member.logicalPath)) {
      fail('DUPLICATE_MODEL_MEMBER_PATH', `duplicate model member path: ${member.logicalPath}`);
    }
    seen.add(member.logicalPath);
    hash.update(member.logicalPath, 'utf8');
    hash.update(Buffer.from([0]));
    hash.update(member.sha256, 'ascii');
    hash.update(Buffer.from([0]));
    hash.update(String(member.byteLength), 'ascii');
    hash.update('\n', 'utf8');
  }
  return hash.digest('hex');
}

export function formHereticMaterializationPlan(resolution) {
  object(resolution, 'resolution');
  if (resolution.state !== EXPECTED_RESOLUTION_STATE) {
    fail('HERETIC_BUNDLE_NOT_STRUCTURALLY_RESOLVED', 'Heretic bundle must be the generalized held resolution', {
      actualState: resolution.state ?? null
    });
  }
  const bundle = object(resolution.bundle, 'resolution.bundle');
  if (bundle.modelBundleRef !== HERETIC_MODEL_BUNDLE_REF) {
    fail('HERETIC_BUNDLE_REF_MISMATCH', 'resolved modelBundleRef is not the certified Heretic bundle');
  }
  if (bundle.modelProfileRef !== HERETIC_MODEL_PROFILE_REF) {
    fail('HERETIC_MODEL_PROFILE_MISMATCH', 'resolved modelProfileRef is not the certified Heretic profile');
  }
  if (bundle.artifactSetRef !== HERETIC_ARTIFACT_SET_REF) {
    fail('HERETIC_ARTIFACT_SET_MISMATCH', 'resolved artifactSetRef is not the certified Heretic artifact set');
  }
  if (bundle.contentSetSha256 !== HERETIC_ARTIFACT_CONTENT_SET_SHA256) {
    fail('HERETIC_CONTENT_SET_MISMATCH', 'resolved contentSetSha256 is not the certified Heretic content set');
  }
  if (
    !Array.isArray(bundle.runtimeRealizationRefs) ||
    bundle.runtimeRealizationRefs.length !== 1 ||
    bundle.runtimeRealizationRefs[0] !== HERETIC_RUNTIME_ADAPTER_REF
  ) {
    fail('HERETIC_RUNTIME_REALIZATION_MISMATCH', 'Heretic bundle must bind exactly the certified MLX runtime adapter');
  }
  if (!Array.isArray(resolution.artifactBindings) || !Array.isArray(resolution.artifacts)) {
    fail('HERETIC_ARTIFACT_BINDINGS_REQUIRED', 'resolution must include artifactBindings and artifacts');
  }
  if (resolution.artifactBindings.length !== resolution.artifacts.length) {
    fail('HERETIC_ARTIFACT_BINDING_COUNT_MISMATCH', 'artifact binding and descriptor counts differ');
  }
  const artifactsByRef = new Map();
  for (const [index, artifact] of resolution.artifacts.entries()) {
    object(artifact, `resolution.artifacts[${index}]`);
    stableRef(artifact.artifactRef, `resolution.artifacts[${index}].artifactRef`);
    if (artifactsByRef.has(artifact.artifactRef)) {
      fail('DUPLICATE_ARTIFACT_REF', `duplicate artifactRef: ${artifact.artifactRef}`);
    }
    artifactsByRef.set(artifact.artifactRef, artifact);
  }
  const members = resolution.artifactBindings.map((binding, index) => {
    object(binding, `resolution.artifactBindings[${index}]`);
    stableRef(binding.roleRef, `resolution.artifactBindings[${index}].roleRef`);
    stableRef(binding.artifactRef, `resolution.artifactBindings[${index}].artifactRef`);
    const artifact = artifactsByRef.get(binding.artifactRef);
    if (!artifact) {
      fail('HERETIC_ARTIFACT_DESCRIPTOR_MISSING', `artifact descriptor missing for ${binding.artifactRef}`);
    }
    const logicalPath = safeLogicalPath(artifact.filename);
    if (!SHA256.test(artifact.sha256)) {
      fail('HERETIC_ARTIFACT_SHA256_REQUIRED', `${binding.artifactRef} has invalid sha256`);
    }
    if (!Number.isSafeInteger(artifact.expectedBytes) || artifact.expectedBytes < 0) {
      fail('HERETIC_ARTIFACT_BYTES_REQUIRED', `${binding.artifactRef} has invalid expectedBytes`);
    }
    return Object.freeze({
      roleRef: binding.roleRef,
      artifactRef: binding.artifactRef,
      logicalPath,
      sha256: artifact.sha256,
      byteLength: artifact.expectedBytes
    });
  }).sort((left, right) => compareUtf8(left.logicalPath, right.logicalPath));
  const actualContentSetSha256 = computeArtifactContentSetSha256(members);
  if (actualContentSetSha256 !== HERETIC_ARTIFACT_CONTENT_SET_SHA256) {
    fail('HERETIC_CONTENT_SET_RECOMPUTATION_FAILED', 'resolved members do not reproduce the certified Heretic content set', {
      actualContentSetSha256,
      expectedContentSetSha256: HERETIC_ARTIFACT_CONTENT_SET_SHA256
    });
  }
  return Object.freeze({
    schemaVersion: HERETIC_RUNTIME_ESTABLISHMENT_SCHEMA,
    modelBundleRef: HERETIC_MODEL_BUNDLE_REF,
    modelProfileRef: HERETIC_MODEL_PROFILE_REF,
    artifactSetRef: HERETIC_ARTIFACT_SET_REF,
    contentSetSha256: HERETIC_ARTIFACT_CONTENT_SET_SHA256,
    runtimeAdapterRef: HERETIC_RUNTIME_ADAPTER_REF,
    memberCount: members.length,
    totalBytes: members.reduce((sum, member) => sum + member.byteLength, 0),
    members: Object.freeze(members)
  });
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

function assertRealDirectory(directoryPath, label, { create = false } = {}) {
  if (!fs.existsSync(directoryPath)) {
    if (!create) fail('DIRECTORY_REQUIRED', `${label} is missing`, { path: directoryPath });
    fs.mkdirSync(directoryPath, { recursive: true, mode: 0o700 });
  }
  const stat = fs.lstatSync(directoryPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail('REAL_DIRECTORY_REQUIRED', `${label} must be one real directory`, { path: directoryPath });
  }
}

async function verifyExactMember(filePath, member) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail('MODEL_MEMBER_FILE_REQUIRED', `${member.logicalPath} is not one real regular file`);
  }
  if (stat.size !== member.byteLength) {
    fail('MODEL_MEMBER_SIZE_MISMATCH', `${member.logicalPath} byte length differs`, {
      actualBytes: stat.size,
      expectedBytes: member.byteLength
    });
  }
  const actualSha256 = await sha256File(filePath);
  if (actualSha256 !== member.sha256) {
    fail('MODEL_MEMBER_SHA256_MISMATCH', `${member.logicalPath} SHA-256 differs`, {
      actualSha256,
      expectedSha256: member.sha256
    });
  }
  return Object.freeze({
    artifactRef: member.artifactRef,
    logicalPath: member.logicalPath,
    path: filePath,
    bytes: stat.size,
    sha256: actualSha256
  });
}

export async function materializeHereticBundle({
  plan,
  modelPath,
  materializeArtifact
}) {
  object(plan, 'plan');
  const resolvedModelPath = absolute(modelPath, 'modelPath');
  if (typeof materializeArtifact !== 'function') {
    fail('MATERIALIZE_ARTIFACT_REQUIRED', 'materializeArtifact must be a function');
  }
  assertRealDirectory(resolvedModelPath, 'modelPath', { create: true });
  const receipts = [];
  for (const member of plan.members) {
    const finalPath = path.join(resolvedModelPath, member.logicalPath);
    await materializeArtifact({
      artifactRef: member.artifactRef,
      finalPath,
      member
    });
    receipts.push(await verifyExactMember(finalPath, member));
  }
  const actualContentSetSha256 = computeArtifactContentSetSha256(
    receipts.map((receipt) => ({
      logicalPath: receipt.logicalPath,
      sha256: receipt.sha256,
      byteLength: receipt.bytes
    }))
  );
  if (actualContentSetSha256 !== plan.contentSetSha256) {
    fail('MATERIALIZED_CONTENT_SET_MISMATCH', 'materialized members do not reproduce the certified content set', {
      actualContentSetSha256,
      expectedContentSetSha256: plan.contentSetSha256
    });
  }
  return Object.freeze({
    modelPath: resolvedModelPath,
    memberCount: receipts.length,
    totalBytes: receipts.reduce((sum, receipt) => sum + receipt.bytes, 0),
    contentSetSha256: actualContentSetSha256,
    receipts: Object.freeze(receipts)
  });
}

function runCommandDefault(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
    timeout: options.timeoutMs ?? 600000,
    env: options.env ?? process.env,
    cwd: options.cwd
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
    error: result.error ?? null
  };
}

function requireCommandPass(result, code, label) {
  if (result.error || result.status !== 0) {
    fail(code, `${label} failed`, {
      status: result.status,
      signal: result.signal,
      error: result.error?.message ?? null,
      stderr: result.stderr.slice(0, 4000)
    });
  }
  return result.stdout;
}

function runtimeProbe(pythonPath, runCommand) {
  const script = [
    'import importlib.metadata as md,json,sys',
    'import mlx_lm',
    'import mlx_lm.server',
    'print(json.dumps({',
    '"pythonVersion":"%d.%d.%d"%sys.version_info[:3],',
    '"mlxLmVersion":md.version("mlx-lm"),',
    '"prefix":sys.prefix,',
    '"executable":sys.executable',
    '}))'
  ].join('');
  const stdout = requireCommandPass(
    runCommand(pythonPath, ['-c', script], { timeoutMs: 60000 }),
    'HERETIC_ENVIRONMENT_PROBE_FAILED',
    'Heretic Python environment probe'
  );
  try {
    return JSON.parse(stdout);
  } catch {
    fail('HERETIC_ENVIRONMENT_PROBE_INVALID', 'Heretic Python environment probe returned invalid JSON');
  }
}

function bootstrapProbe(bootstrapPython, runCommand) {
  const script = 'import json,sys;print(json.dumps({"pythonVersion":"%d.%d.%d"%sys.version_info[:3],"executable":sys.executable}))';
  const stdout = requireCommandPass(
    runCommand(bootstrapPython, ['-c', script], { timeoutMs: 30000 }),
    'BOOTSTRAP_PYTHON_PROBE_FAILED',
    'bootstrap Python probe'
  );
  try {
    return JSON.parse(stdout);
  } catch {
    fail('BOOTSTRAP_PYTHON_PROBE_INVALID', 'bootstrap Python probe returned invalid JSON');
  }
}

function verifyEnvironmentProbe(probe, environmentRoot, pythonPath) {
  if (probe.pythonVersion !== HERETIC_PYTHON_VERSION || probe.mlxLmVersion !== HERETIC_MLX_LM_VERSION) {
    fail('HERETIC_ENVIRONMENT_VERSION_MISMATCH', 'Python/mlx-lm environment versions differ', {
      actualPythonVersion: probe.pythonVersion ?? null,
      actualMlxLmVersion: probe.mlxLmVersion ?? null
    });
  }
  if (path.resolve(probe.prefix) !== environmentRoot || path.resolve(probe.executable) !== pythonPath) {
    fail('HERETIC_ENVIRONMENT_IDENTITY_MISMATCH', 'Python probe does not bind the selected environment root/executable', {
      actualPrefix: probe.prefix ?? null,
      actualExecutable: probe.executable ?? null
    });
  }
}

export function hereticEnvironmentPythonPath(environmentRoot) {
  return path.join(absolute(environmentRoot, 'environmentRoot'), 'bin', 'python');
}

export async function ensureHereticPythonEnvironment({
  bootstrapPython,
  environmentRoot,
  runCommand = runCommandDefault
}) {
  if (typeof bootstrapPython !== 'string' || bootstrapPython.length === 0) {
    fail('BOOTSTRAP_PYTHON_REQUIRED', 'bootstrapPython must be a non-empty command or path');
  }
  if (typeof runCommand !== 'function') {
    fail('RUN_COMMAND_REQUIRED', 'runCommand must be a function');
  }
  const resolvedRoot = absolute(environmentRoot, 'environmentRoot');
  const pythonPath = hereticEnvironmentPythonPath(resolvedRoot);
  const existed = fs.existsSync(resolvedRoot);
  if (existed) {
    assertRealDirectory(resolvedRoot, 'environmentRoot');
    const probe = runtimeProbe(pythonPath, runCommand);
    verifyEnvironmentProbe(probe, resolvedRoot, pythonPath);
    const pipReportPath = path.join(resolvedRoot, 'vexlife-mlx-lm-install-report.json');
    if (!fs.existsSync(pipReportPath) || !fs.lstatSync(pipReportPath).isFile()) {
      fail('HERETIC_PIP_REPORT_MISSING', 'existing Heretic environment has no retained pip installation report');
    }
    return Object.freeze({
      state: 'REUSED_VERIFIED',
      pythonEnvironmentRoot: resolvedRoot,
      pythonPath,
      pythonVersion: HERETIC_PYTHON_VERSION,
      mlxLmVersion: HERETIC_MLX_LM_VERSION,
      pipReportPath
    });
  }

  const bootstrap = bootstrapProbe(bootstrapPython, runCommand);
  if (bootstrap.pythonVersion !== HERETIC_PYTHON_VERSION) {
    fail('BOOTSTRAP_PYTHON_VERSION_MISMATCH', 'bootstrap Python must be exactly 3.14.7', {
      actualPythonVersion: bootstrap.pythonVersion ?? null
    });
  }
  try {
    requireCommandPass(
      runCommand(bootstrapPython, ['-m', 'venv', resolvedRoot], { timeoutMs: 120000 }),
      'HERETIC_ENVIRONMENT_CREATE_FAILED',
      'Heretic virtual environment creation'
    );
    assertRealDirectory(resolvedRoot, 'environmentRoot');
    const pipReportPath = path.join(resolvedRoot, 'vexlife-mlx-lm-install-report.json');
    requireCommandPass(
      runCommand(
        pythonPath,
        [
          '-m',
          'pip',
          'install',
          '--only-binary=:all:',
          '--disable-pip-version-check',
          '--no-input',
          '--report',
          pipReportPath,
          `mlx-lm==${HERETIC_MLX_LM_VERSION}`
        ],
        { timeoutMs: 1800000 }
      ),
      'HERETIC_MLX_LM_INSTALL_FAILED',
      'binary-only mlx-lm installation'
    );
    const probe = runtimeProbe(pythonPath, runCommand);
    verifyEnvironmentProbe(probe, resolvedRoot, pythonPath);
    if (!fs.existsSync(pipReportPath) || !fs.lstatSync(pipReportPath).isFile()) {
      fail('HERETIC_PIP_REPORT_MISSING', 'pip did not retain the required installation report');
    }
    return Object.freeze({
      state: 'CREATED_VERIFIED',
      pythonEnvironmentRoot: resolvedRoot,
      pythonPath,
      pythonVersion: HERETIC_PYTHON_VERSION,
      mlxLmVersion: HERETIC_MLX_LM_VERSION,
      pipReportPath
    });
  } catch (error) {
    if (fs.existsSync(resolvedRoot)) {
      fs.rmSync(resolvedRoot, { recursive: true, force: true });
    }
    throw error;
  }
}

export function formHereticSdkOwnerBinding({
  authorityRef,
  modelPath,
  pythonEnvironmentRoot,
  port,
  receiptPath,
  sourceIdentity
}) {
  stableRef(authorityRef, 'authorityRef');
  const model = absolute(modelPath, 'modelPath');
  const environment = absolute(pythonEnvironmentRoot, 'pythonEnvironmentRoot');
  const receipt = absolute(receiptPath, 'receiptPath');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    fail('HERETIC_RUNTIME_PORT_INVALID', 'port must be an unprivileged numeric TCP port');
  }
  object(sourceIdentity, 'sourceIdentity');
  if (sourceIdentity.repository !== 'vgong24/Vextreme-SDK') {
    fail('SDK_SOURCE_REPOSITORY_MISMATCH', 'sourceIdentity.repository must be vgong24/Vextreme-SDK');
  }
  if (!GIT_ID.test(sourceIdentity.revision) || !GIT_ID.test(sourceIdentity.tree)) {
    fail('SDK_SOURCE_GIT_IDENTITY_REQUIRED', 'sourceIdentity revision/tree must be exact Git identities');
  }
  if (!SHA256.test(sourceIdentity.moduleSha256)) {
    fail('SDK_SOURCE_MODULE_SHA256_REQUIRED', 'sourceIdentity.moduleSha256 must be lowercase SHA-256');
  }
  return Object.freeze({
    schemaVersion: 'vexlocalbridge.mlx-persistent-runtime-owner-binding/v1',
    authorityRef,
    modelRef: HERETIC_MODEL_REF,
    modelProfileRef: HERETIC_MODEL_PROFILE_REF,
    artifactRef: HERETIC_ARTIFACT_SET_REF,
    artifactCustodyEvidenceRef:
      'resolution.model-preservation.artifact-custody.devex.qwen38-27b-heretic-mlx4.20260928A',
    artifactContentSetSha256: HERETIC_ARTIFACT_CONTENT_SET_SHA256,
    runtimeAdapterRef: HERETIC_RUNTIME_ADAPTER_REF,
    runtimeClass: HERETIC_RUNTIME_CLASS,
    hostExecutionProfileRef: HERETIC_HOST_EXECUTION_PROFILE_REF,
    pythonVersion: HERETIC_PYTHON_VERSION,
    mlxLmVersion: HERETIC_MLX_LM_VERSION,
    trainerSourceCommit: HERETIC_TRAINER_SOURCE_COMMIT,
    modelPath: model,
    pythonPath: hereticEnvironmentPythonPath(environment),
    pythonEnvironmentRoot: environment,
    port,
    receiptPath: receipt,
    sourceIdentity: Object.freeze({ ...sourceIdentity })
  });
}

export async function establishHereticRuntime({
  resolution,
  modelPath,
  materializeArtifact,
  bootstrapPython,
  pythonEnvironmentRoot,
  owner,
  authorityRef,
  port,
  receiptPath,
  sourceIdentity,
  runCommand = runCommandDefault
}) {
  if (!owner || typeof owner.startOrReusePersistentMlxRuntime !== 'function') {
    fail('SDK_RUNTIME_OWNER_REQUIRED', 'owner.startOrReusePersistentMlxRuntime must be a function');
  }
  const plan = formHereticMaterializationPlan(resolution);
  const materialization = await materializeHereticBundle({
    plan,
    modelPath,
    materializeArtifact
  });
  const environment = await ensureHereticPythonEnvironment({
    bootstrapPython,
    environmentRoot: pythonEnvironmentRoot,
    runCommand
  });
  const binding = formHereticSdkOwnerBinding({
    authorityRef,
    modelPath: materialization.modelPath,
    pythonEnvironmentRoot: environment.pythonEnvironmentRoot,
    port,
    receiptPath,
    sourceIdentity
  });
  const runtime = await owner.startOrReusePersistentMlxRuntime({ binding });
  return Object.freeze({
    schemaVersion: HERETIC_RUNTIME_ESTABLISHMENT_SCHEMA,
    state: 'HERETIC_RUNTIME_ESTABLISHED',
    plan,
    materialization,
    environment,
    binding,
    runtime
  });
}

// [VXG RealForever]
