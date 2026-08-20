#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  browserBindingForProfile,
  buildQualificationRequest,
  buildRuntimeArguments,
  buildVexInitializationPlan,
  classifyHomeState,
  runtimeProcessEvidenceMatches,
  selectOperationalProfile,
  validateOperationalProfileRegistry
} from '../src/core/vex-initialization.mjs';
import { classifyVerifiedArtifact, downloadVerifiedArtifact, sha256File } from '../src/core/model-provision.mjs';
import { writeJson } from '../src/core/utils.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = path.resolve(HERE, '..');
const PROFILE_PATH = path.join(SOURCE_ROOT, 'blueprint', 'vex-operational-profiles.json');
const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const value = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const mode = value('--mode', 'normal');
const requestedProfileRef = value('--profile-ref');
const candidateAuthorityRef = value('--candidate-authority-ref');
const yes = has('--yes');
const planOnly = has('--plan-only');
const home = path.resolve(value('--home', path.join(os.homedir(), '.vexlife')));

function progress(message) { console.error(`[VexLife] ${message}`); }
function fail(state, message, exitCode = 2, detail = {}) {
  const payload = { schemaVersion: 'vexlife.initialization-result/v1', state, message, ...detail };
  console.log(JSON.stringify(payload));
  process.exit(exitCode);
}
function loadJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
function pathState(homePath) {
  const manifest = path.join(homePath, 'config', 'home.json');
  const homeDirectoryPresent = fs.existsSync(homePath) && fs.statSync(homePath).isDirectory();
  let homeDirectoryNonEmpty = false;
  if (homeDirectoryPresent) homeDirectoryNonEmpty = fs.readdirSync(homePath).length > 0;
  return {
    state: classifyHomeState({ homeManifestPresent: fs.existsSync(manifest), homeDirectoryPresent, homeDirectoryNonEmpty }),
    manifest
  };
}
function diskFreeBytes(targetPath) {
  let cursor = targetPath;
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  const stat = fs.statfsSync(cursor);
  return Number(stat.bavail) * Number(stat.bsize);
}
function nvidiaEvidence() {
  const result = spawnSync('nvidia-smi', ['--query-gpu=name,driver_version', '--format=csv,noheader'], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) return { available: false, detail: null };
  const first = String(result.stdout).trim().split(/\r?\n/u)[0] ?? '';
  return { available: first.length > 0, detail: first || null };
}
function inspectHost() {
  const nvidia = nvidiaEvidence();
  return {
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    totalMemoryBytes: os.totalmem(),
    freeDiskBytes: diskFreeBytes(home),
    nvidia
  };
}
function assertHostEligible(profile, host) {
  if (host.platform !== profile.platform || host.architecture !== profile.architecture) throw Object.assign(new Error('This operational profile does not support this platform/architecture.'), { state: 'UNSUPPORTED_HOST' });
  const req = profile.hostRequirements ?? {};
  if (Number.isSafeInteger(req.minimumSystemMemoryBytes) && host.totalMemoryBytes < req.minimumSystemMemoryBytes) throw Object.assign(new Error('This computer does not have enough system memory for the current profile.'), { state: 'UNSUPPORTED_HOST' });
  if (Number.isSafeInteger(req.minimumFreeDiskBytes) && host.freeDiskBytes < req.minimumFreeDiskBytes) throw Object.assign(new Error('There is not enough free disk space for the current profile.'), { state: 'UNSUPPORTED_HOST' });
  if (req.requiresNvidiaSmi === true && !host.nvidia.available) throw Object.assign(new Error('The current Windows profile requires a compatible NVIDIA GPU/driver that nvidia-smi can identify.'), { state: 'UNSUPPORTED_HOST' });
}
function destinationForArtifact(profile, artifact) {
  const isModel = profile.modelArtifacts.some((entry) => entry.artifactRef === artifact.artifactRef);
  return isModel ? path.join(home, 'models', artifact.filename) : path.join(home, 'runtime', 'artifacts', artifact.filename);
}
function psQuote(value) { return String(value).replace(/'/gu, "''"); }
function expandArchive(archive, destination) {
  const command = `Expand-Archive -LiteralPath '${psQuote(archive)}' -DestinationPath '${psQuote(destination)}' -Force`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`runtime archive extraction failed: ${result.stderr || result.error?.message || 'unknown error'}`);
}
function findNamedFile(root, filename) {
  const found = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`runtime extraction produced a symbolic link: ${full}`);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) found.push(full);
    }
  };
  visit(root);
  if (found.length !== 1) throw new Error(`runtime extraction must contain exactly one ${filename}; found ${found.length}`);
  return found[0];
}
async function materializeRuntime(profile, artifactPaths) {
  const target = path.join(home, ...profile.runtime.extraction.subdirectory.split('/'));
  if (fs.existsSync(target)) {
    const executable = findNamedFile(target, profile.runtime.executableName);
    const actual = await sha256File(executable);
    if (actual !== profile.runtime.executableSha256) throw new Error('existing runtime materialization failed executable verification; refusing to overwrite it');
    return { state: 'REUSED_VERIFIED_RUNTIME', target, executable, executableSha256: actual };
  }
  const staging = `${target}.partial-${process.pid}`;
  if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  try {
    for (const artifact of profile.runtime.artifacts) expandArchive(artifactPaths.get(artifact.artifactRef), staging);
    const executable = findNamedFile(staging, profile.runtime.executableName);
    const actual = await sha256File(executable);
    if (actual !== profile.runtime.executableSha256) throw new Error(`runtime executable checksum mismatch: expected ${profile.runtime.executableSha256}, actual ${actual}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(staging, target);
    const finalExecutable = path.join(target, path.relative(staging, executable));
    return { state: 'MATERIALIZED_VERIFIED_RUNTIME', target, executable: finalExecutable, executableSha256: actual };
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}
async function endpointResponding(origin, pathname = '/health', timeoutMs = 1200) {
  try {
    const response = await fetch(`${origin}${pathname}`, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch { return false; }
}
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function windowsProcessEvidence(pid) {
  if (process.platform !== 'win32' || !Number.isInteger(pid) || pid <= 0) return null;
  const command = `$p=Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction SilentlyContinue; if($null -eq $p){exit 3}; [ordered]@{name=[string]$p.Name;executablePath=[string]$p.ExecutablePath;commandLine=[string]$p.CommandLine}|ConvertTo-Json -Compress`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0 || !String(result.stdout ?? '').trim()) return null;
  try { return JSON.parse(String(result.stdout).trim()); } catch { return null; }
}
async function existingRuntimeReuse(profile, receiptPath, { executable, modelPath, projectorPath }) {
  if (!fs.existsSync(receiptPath)) return null;
  try {
    const prior = loadJson(receiptPath);
    const pid = Number(prior.runtime?.pid);
    if (prior.profileRef !== profile.profileRef || prior.endpoint?.origin !== profile.endpoint.origin || !pidAlive(pid)) return null;
    const processEvidence = windowsProcessEvidence(pid);
    const expectedArguments = buildRuntimeArguments(profile, { modelPath, projectorPath });
    if (!runtimeProcessEvidenceMatches({ processEvidence, expectedExecutablePath: executable, expectedArguments })) return null;
    if (await sha256File(executable) !== profile.runtime.executableSha256) return null;
    if (!await endpointResponding(profile.endpoint.origin, profile.qualification.healthPath)) return null;
    return { pid, reusedReceiptRef: prior.receiptRef ?? null };
  } catch { return null; }
}
async function waitForRuntime(profile, pid) {
  const deadline = Date.now() + profile.qualification.timeoutMs;
  while (Date.now() < deadline) {
    if (!pidAlive(pid)) throw new Error('runtime process exited before qualification');
    if (await endpointResponding(profile.endpoint.origin, profile.qualification.healthPath, 1500)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('runtime did not become healthy before the qualification timeout');
}
async function qualifyInference(profile) {
  const response = await fetch(`${profile.endpoint.origin}${profile.qualification.chatPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildQualificationRequest(profile)),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`runtime inference qualification failed: HTTP ${response.status}`);
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) throw new Error('runtime inference qualification returned no assistant content');
  return { responseSha256: crypto.createHash('sha256').update(content).digest('hex'), contentObserved: true };
}
async function promptConsent(profile) {
  if (yes) return true;
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`Continue with Vex using ${profile.endpoint.requestModel}? This may download several GB and start a local-only model runtime. [Y/n] `);
    const normalized = answer.trim().toLowerCase();
    return normalized === '' || normalized === 'y' || normalized === 'yes';
  } finally { rl.close(); }
}
function writeFailureReceipt(profile, state, message, detail = {}) {
  if (!fs.existsSync(home)) return null;
  const receiptPath = path.join(home, 'recovery', 'vex-initialization-failure.json');
  writeJson(receiptPath, {
    schemaVersion: 'vexlife.initialization-failure/v1',
    state,
    message,
    profileRef: profile?.profileRef ?? null,
    formedAt: new Date().toISOString(),
    detail,
    effects: { repository: false, public: false, memoryCanonicalWrite: false, training: false, nonLoopbackNetwork: false }
  });
  return receiptPath;
}

let profile = null;
try {
  if (!fs.existsSync(PROFILE_PATH)) fail('SOURCE_NOT_FOUND', `Operational profile registry is missing: ${PROFILE_PATH}`, 2);
  const registry = loadJson(PROFILE_PATH);
  const registryValidation = validateOperationalProfileRegistry(registry);
  if (!registryValidation.ok) fail('SOURCE_INVALID', registryValidation.errors.join('; '), 2);
  if (mode === 'candidate-qualification' && (!requestedProfileRef || !candidateAuthorityRef)) {
    fail('CANDIDATE_AUTHORITY_REQUIRED', 'Candidate qualification requires --profile-ref and --candidate-authority-ref.', 2);
  }
  if (!['normal', 'candidate-qualification'].includes(mode)) fail('SOURCE_INVALID', `Unknown initialization mode: ${mode}`, 2);

  const host = inspectHost();
  const selection = selectOperationalProfile({ registry, platform: host.platform, architecture: host.architecture, mode, profileRef: requestedProfileRef });
  if (selection.state !== 'PROFILE_RESOLVED') fail(selection.state, 'No current operational profile is eligible for this route.', 4, selection);
  profile = selection.profile;
  assertHostEligible(profile, host);

  const homeStatus = pathState(home);
  if (homeStatus.state === 'HOME_REQUIRES_MIGRATION_PLAN') fail('HOME_REQUIRES_MIGRATION_PLAN', 'The selected Vex Home is non-empty but has no canonical Home identity. Nothing was changed.', 5);
  if (homeStatus.state === 'FRESH_HOME_ALLOWED') fail('HOME_NOT_ESTABLISHED', 'Vex Home must be established by the Frontdoor bootstrap before runtime initialization.', 5);

  const plan = buildVexInitializationPlan({ profile, home, homeState: homeStatus.state, hostEvidence: host, mode });
  if (planOnly) {
    console.log(JSON.stringify({ schemaVersion: 'vexlife.initialization-result/v1', state: 'PLAN_READY_NO_EFFECT', plan }));
    process.exit(0);
  }

  const consent = await promptConsent(profile);
  if (!consent) fail('NETWORK_NOT_AUTHORIZED', 'No download or runtime effect was performed.', 0);
  progress(`Profile ${profile.profileRef} selected under ${mode}.`);

  const artifactPaths = new Map();
  const artifactReceipts = [];
  for (const artifact of [...profile.runtime.artifacts, ...profile.modelArtifacts]) {
    const destination = destinationForArtifact(profile, artifact);
    progress(`Verifying ${artifact.filename}...`);
    const before = await classifyVerifiedArtifact({ finalPath: destination, expectedSha256: artifact.sha256, expectedBytes: artifact.expectedBytes });
    if (before.state === 'INVALID_HASH' || before.state === 'INVALID_SIZE' || before.state === 'INVALID_NOT_FILE') {
      throw Object.assign(new Error(`${artifact.filename} already exists but does not match the accepted profile; refusing to overwrite it`), { state: 'ARTIFACT_HASH_MISMATCH' });
    }
    const receipt = await downloadVerifiedArtifact({
      url: artifact.url,
      expectedSha256: artifact.sha256,
      expectedBytes: artifact.expectedBytes,
      maxBytes: artifact.maxBytes,
      finalPath: destination,
      onProgress: ({ bytes }) => progress(`${artifact.filename}: ${Math.floor(bytes / (1024 * 1024))} MiB received`)
    });
    artifactPaths.set(artifact.artifactRef, destination);
    artifactReceipts.push({ artifactRef: artifact.artifactRef, filename: artifact.filename, disposition: receipt.disposition, bytes: receipt.bytes, sha256: receipt.actualSha256 });
  }

  progress('Materializing the local runtime...');
  const materialization = await materializeRuntime(profile, artifactPaths);
  const modelPath = artifactPaths.get(profile.modelArtifacts[0].artifactRef);
  const projectorPath = artifactPaths.get(profile.modelArtifacts[1].artifactRef);
  const runtimeReceiptPath = path.join(home, 'runtime', 'initialization', 'receipt.json');
  fs.mkdirSync(path.dirname(runtimeReceiptPath), { recursive: true });

  let runtimePid;
  let runtimeDisposition;
  const existing = await existingRuntimeReuse(profile, runtimeReceiptPath, {
    executable: materialization.executable,
    modelPath,
    projectorPath
  });
  if (existing) {
    runtimePid = existing.pid;
    runtimeDisposition = 'REUSED_QUALIFIED_BOUND_RUNTIME';
    progress(`Reusing already-qualified runtime process ${runtimePid}.`);
  } else {
    if (await endpointResponding(profile.endpoint.origin, profile.qualification.healthPath)) {
      throw Object.assign(new Error(`Something is already answering at ${profile.endpoint.origin}, but it is not owned by this Home/profile receipt.`), { state: 'PORT_OWNERSHIP_CONFLICT' });
    }
    const runtimeDir = path.dirname(materialization.executable);
    const stdoutPath = path.join(home, 'runtime', 'llama-server.out.log');
    const stderrPath = path.join(home, 'runtime', 'llama-server.err.log');
    fs.mkdirSync(path.dirname(stdoutPath), { recursive: true });
    const outFd = fs.openSync(stdoutPath, 'a');
    const errFd = fs.openSync(stderrPath, 'a');
    const runtimeArgs = buildRuntimeArguments(profile, { modelPath, projectorPath });
    progress('Starting the local-only model runtime...');
    runtimePid = await new Promise((resolve, reject) => {
      const child = spawn(materialization.executable, runtimeArgs, { cwd: runtimeDir, detached: true, windowsHide: true, stdio: ['ignore', outFd, errFd] });
      const cleanupDescriptors = () => {
        try { fs.closeSync(outFd); } catch {}
        try { fs.closeSync(errFd); } catch {}
      };
      child.once('error', (error) => { cleanupDescriptors(); reject(error); });
      child.once('spawn', () => {
        const pid = child.pid;
        child.unref();
        cleanupDescriptors();
        if (!pid) reject(new Error('runtime process did not return a PID'));
        else resolve(pid);
      });
    });
    runtimeDisposition = 'STARTED_NEW_RUNTIME';
    await waitForRuntime(profile, runtimePid);
  }

  progress('Qualifying the exact runtime/model binding...');
  const qualification = await qualifyInference(profile);
  const binding = browserBindingForProfile(profile);
  const formedAt = new Date().toISOString();
  const receiptRef = `receipt.vexlife.initialization.${crypto.createHash('sha256').update(`${profile.profileRef}|${runtimePid}|${formedAt}`).digest('hex').slice(0, 24)}`;
  const receipt = {
    schemaVersion: 'vexlife.initialization-receipt/v1',
    receiptRef,
    state: 'RUNTIME_QUALIFIED',
    profileRef: profile.profileRef,
    profileState: profile.state,
    mode,
    candidateAuthorityRef: mode === 'candidate-qualification' ? candidateAuthorityRef : null,
    formedAt,
    planSha256: plan.planSha256,
    home: { state: homeStatus.state, homeIdentityRef: loadJson(homeStatus.manifest).homeRef ?? null },
    host,
    artifacts: artifactReceipts,
    materialization: { state: materialization.state, executableSha256: materialization.executableSha256 },
    runtime: { pid: runtimePid, disposition: runtimeDisposition },
    endpoint: profile.endpoint,
    qualification,
    browserBinding: binding,
    effects: { repository: false, public: false, memoryCanonicalWrite: false, training: false, nonLoopbackNetwork: false }
  };
  writeJson(runtimeReceiptPath, receipt);
  const recoveryReceiptPath = path.join(home, 'recovery', 'vex-initialization-receipt.json');
  writeJson(recoveryReceiptPath, receipt);
  writeJson(path.join(home, 'config', 'model.json'), {
    schemaVersion: 'vexlife.model-configuration/v1',
    state: 'BOUND_QUALIFIED',
    profileRef: profile.profileRef,
    endpoint: profile.endpoint.origin,
    requestModel: profile.endpoint.requestModel,
    activeArtifactRef: profile.modelArtifacts[0].artifactRef,
    runtimeDependencyRef: profile.runtime.dependencyRef,
    runtimePid,
    qualificationReceiptRef: receiptRef,
    automaticDownload: false,
    automaticActivation: false
  });

  console.log(JSON.stringify({
    schemaVersion: 'vexlife.initialization-result/v1',
    state: 'RUNTIME_QUALIFIED',
    profileRef: profile.profileRef,
    profileState: profile.state,
    runtimePid,
    endpoint: profile.endpoint.origin,
    requestModel: profile.endpoint.requestModel,
    browserBinding: binding,
    receiptPath: recoveryReceiptPath
  }));
} catch (error) {
  const state = error.state ?? (/checksum mismatch/u.test(error.message) ? 'ARTIFACT_HASH_MISMATCH' : 'INITIALIZATION_FAILED_SAFE');
  const receiptPath = writeFailureReceipt(profile, state, error.message);
  fail(state, error.message, 6, { receiptPath });
}

// [VXG RealForever]
