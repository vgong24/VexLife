import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  validateG04BNativeWorkerPacket,
  verifyG04BEvaluationResult,
  verifyG04BMachineResult,
  verifyG04BTrainingResult
} from './g04b-native-training-worker.mjs';

export const G04B_TERMINAL_EVIDENCE_SCHEMA = 'vexlife.g04b-native-training-terminal-evidence/v1';
const HEX64 = /^[0-9a-f]{64}$/u;
const PYTHON_CANONICAL_FINGERPRINT_PROGRAM = String.raw`
import hashlib
import json
import sys
from pathlib import Path

source = Path(sys.argv[1])
value = json.loads(source.read_text(encoding="utf-8"))
canonical = json.dumps(
    value,
    ensure_ascii=False,
    sort_keys=True,
    separators=(",", ":"),
).encode("utf-8")
sys.stdout.write(hashlib.sha256(canonical).hexdigest())
`.trim();

export class G04BTerminalEvidenceError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'G04BTerminalEvidenceError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new G04BTerminalEvidenceError(code, message, details);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function g04bCanonicalFingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function inside(root, target, label) {
  const canonicalRoot = fs.realpathSync.native(path.resolve(root));
  const requested = path.resolve(target);
  const relative = path.relative(canonicalRoot, requested);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('G04B_TERMINAL_PATH_ESCAPE', `${label} must stay inside its admitted root`, { root: canonicalRoot, target: requested });
  }
  return { root: canonicalRoot, requested };
}

function exactRegularFile(target, label, code = 'G04B_TERMINAL_EVIDENCE_NOT_REGULAR') {
  const requested = path.resolve(target);
  if (!fs.existsSync(requested)) fail('G04B_TERMINAL_EVIDENCE_MISSING', `${label} is missing`, { requested });
  const stat = fs.lstatSync(requested);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    fail(code, `${label} must be one regular non-symlink file`, { requested });
  }
  const real = fs.realpathSync.native(requested);
  if (real !== requested) fail(code, `${label} path is not canonical`, { requested, real });
  return real;
}

export function loadExactG04BJsonFile(root, target, label) {
  const { root: canonicalRoot, requested } = inside(root, target, label);
  const real = exactRegularFile(requested, label);
  const relative = path.relative(canonicalRoot, real);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('G04B_TERMINAL_PATH_ESCAPE', `${label} resolved outside its admitted root`, { canonicalRoot, real });
  }
  try {
    return Object.freeze(JSON.parse(fs.readFileSync(real, 'utf8')));
  } catch (error) {
    fail('G04B_TERMINAL_EVIDENCE_INVALID_JSON', `${label} is not valid JSON`, { cause: error.message });
  }
}

export function pythonCanonicalJsonFingerprintFile(pythonExecutablePath, jsonFile) {
  const python = exactRegularFile(
    pythonExecutablePath,
    'bound Python executable',
    'G04B_PYTHON_CANONICALIZER_BINDING_INVALID'
  );
  const source = exactRegularFile(jsonFile, 'canonical JSON evidence file');
  const execution = spawnSync(
    python,
    ['-I', '-S', '-c', PYTHON_CANONICAL_FINGERPRINT_PROGRAM, source],
    {
      cwd: path.dirname(source),
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 16 * 1024,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
  if (execution.error) {
    fail('G04B_PYTHON_CANONICALIZATION_FAILED', 'exact Python canonical fingerprint process failed to start', {
      cause: execution.error.message
    });
  }
  if (execution.signal || execution.status !== 0) {
    fail('G04B_PYTHON_CANONICALIZATION_FAILED', 'exact Python canonical fingerprint process did not complete successfully', {
      status: execution.status,
      signal: execution.signal,
      stderr: String(execution.stderr ?? '').slice(0, 2000)
    });
  }
  const observed = String(execution.stdout ?? '').trim();
  if (!HEX64.test(observed)) {
    fail('G04B_PYTHON_CANONICALIZATION_FAILED', 'exact Python canonical fingerprint output is not lowercase SHA-256', {
      observed: observed.slice(0, 160)
    });
  }
  return observed;
}

function exactCandidateDirectory(sourceRoot, outputDir) {
  if (typeof outputDir !== 'string' || !outputDir || path.isAbsolute(outputDir)) {
    fail('G04B_TERMINAL_OUTPUT_INVALID', 'training manifest outputDir must be source-root-relative');
  }
  const source = fs.realpathSync.native(path.resolve(sourceRoot));
  const candidate = path.resolve(source, outputDir);
  const relative = path.relative(source, candidate);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('G04B_TERMINAL_OUTPUT_INVALID', 'training manifest outputDir escapes source root', { outputDir });
  }
  if (!fs.existsSync(candidate)) fail('G04B_TERMINAL_OUTPUT_MISSING', 'candidate output directory is missing', { candidate });
  const stat = fs.lstatSync(candidate);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail('G04B_TERMINAL_OUTPUT_INVALID', 'candidate output directory must be a regular non-symlink directory', { candidate });
  }
  const real = fs.realpathSync.native(candidate);
  if (real !== candidate) fail('G04B_TERMINAL_OUTPUT_INVALID', 'candidate output directory is not canonical', { candidate, real });
  return candidate;
}

function assertEqual(field, expected, observed, code = 'G04B_TERMINAL_EVIDENCE_MISMATCH') {
  if (observed !== expected) fail(code, `${field} does not match exact terminal evidence`, { field, expected, observed });
}

function exactFingerprint(value, label) {
  if (!HEX64.test(value ?? '')) fail('G04B_TERMINAL_FINGERPRINT_INVALID', `${label} must be one exact lowercase SHA-256`);
  return value;
}

export function verifyG04BDerivedPhaseFingerprints(
  manifest,
  trainingReceipt,
  evaluationReceipt,
  {
    manifestFingerprint,
    trainingReceiptFingerprint,
    evaluationReceiptFingerprint
  } = {}
) {
  void manifest;
  const exactManifestFingerprint = exactFingerprint(manifestFingerprint, 'manifestFingerprint');
  const exactTrainingReceiptFingerprint = exactFingerprint(trainingReceiptFingerprint, 'trainingReceiptFingerprint');
  const exactEvaluationReceiptFingerprint = exactFingerprint(evaluationReceiptFingerprint, 'evaluationReceiptFingerprint');

  assertEqual(
    'training.manifestFingerprint',
    exactManifestFingerprint,
    trainingReceipt?.manifestFingerprint,
    'G04B_TRAINING_MANIFEST_FINGERPRINT_MISMATCH'
  );
  assertEqual(
    'evaluation.trainingReceiptFingerprint',
    exactTrainingReceiptFingerprint,
    evaluationReceipt?.trainingReceiptFingerprint,
    'G04B_EVALUATION_TRAINING_RECEIPT_FINGERPRINT_MISMATCH'
  );
  assertEqual(
    'evaluation.trainingManifestFingerprint',
    exactManifestFingerprint,
    evaluationReceipt?.trainingManifestFingerprint,
    'G04B_EVALUATION_MANIFEST_FINGERPRINT_MISMATCH'
  );
  return Object.freeze({
    manifestFingerprint: exactManifestFingerprint,
    trainingReceiptFingerprint: exactTrainingReceiptFingerprint,
    evaluationReceiptFingerprint: exactEvaluationReceiptFingerprint,
    rawTrainingReceiptFingerprint: g04bCanonicalFingerprint(trainingReceipt),
    rawEvaluationReceiptFingerprint: g04bCanonicalFingerprint(evaluationReceipt)
  });
}

export function verifyG04BTerminalEvidence(packet, machineResult, {
  sourceRoot,
  planValidator
} = {}) {
  if (typeof planValidator !== 'function') {
    fail('G04B_TERMINAL_PLAN_VALIDATOR_REQUIRED', 'planValidator is required for terminal evidence verification');
  }
  const source = fs.realpathSync.native(path.resolve(sourceRoot));
  const validatedPacket = validateG04BNativeWorkerPacket(packet, {
    sourceRoot: source,
    verifyBoundFiles: true,
    verifySnapshot: false
  });

  const manifestPath = path.resolve(source, ...validatedPacket.trainingManifestPath.split('/'));
  const manifest = loadExactG04BJsonFile(source, manifestPath, 'training manifest');
  assertEqual('training manifest SHA-256', validatedPacket.trainingManifestSha256, sha256File(manifestPath), 'G04B_TERMINAL_MANIFEST_HASH_MISMATCH');

  const plan = planValidator(manifestPath, {
    repoRoot: source,
    verifyFiles: true,
    verifySourceManifest: true
  });
  for (const [field, expected] of [
    ['trainingRunRef', manifest.trainingRunRef],
    ['sourceModelRepo', manifest.sourceModelRepo],
    ['sourceModelRevision', manifest.sourceModelRevision],
    ['sourceModelSnapshotFingerprint', manifest.sourceModelSnapshotFingerprint],
    ['sourceManifestFingerprint', manifest.sourceManifestFingerprint],
    ['executionDevice', validatedPacket.expectedExecutionDevice],
    ['expectedHardwareProfileRef', validatedPacket.expectedHardwareProfileRef]
  ]) {
    assertEqual(`plan.${field}`, expected, plan[field], 'G04B_TERMINAL_PLAN_MISMATCH');
  }

  const candidateDirectory = exactCandidateDirectory(source, manifest.outputDir);
  const trainingReceiptPath = path.join(candidateDirectory, 'vex-foundation-training-receipt.json');
  const evaluationReceiptPath = path.join(candidateDirectory, 'vex-foundation-evaluation-receipt.json');
  const trainingReceipt = verifyG04BTrainingResult(
    loadExactG04BJsonFile(candidateDirectory, trainingReceiptPath, 'training receipt'),
    manifest,
    validatedPacket
  );
  const evaluationReceipt = verifyG04BEvaluationResult(
    loadExactG04BJsonFile(candidateDirectory, evaluationReceiptPath, 'evaluation receipt'),
    manifest,
    validatedPacket,
    trainingReceipt
  );
  const derived = verifyG04BDerivedPhaseFingerprints(
    manifest,
    trainingReceipt,
    evaluationReceipt,
    {
      manifestFingerprint: pythonCanonicalJsonFingerprintFile(validatedPacket.pythonExecutablePath, manifestPath),
      trainingReceiptFingerprint: pythonCanonicalJsonFingerprintFile(validatedPacket.pythonExecutablePath, trainingReceiptPath),
      evaluationReceiptFingerprint: pythonCanonicalJsonFingerprintFile(validatedPacket.pythonExecutablePath, evaluationReceiptPath)
    }
  );

  const capturedResult = verifyG04BMachineResult(machineResult, validatedPacket);
  for (const [field, expected] of [
    ['sourceManifestFingerprint', manifest.sourceManifestFingerprint],
    ['trainingReceiptFingerprint', derived.rawTrainingReceiptFingerprint],
    ['evaluationReceiptFingerprint', derived.rawEvaluationReceiptFingerprint],
    ['priorModelIdentity', trainingReceipt.priorModelIdentity],
    ['candidateModelIdentity', trainingReceipt.candidateModelIdentity],
    ['candidateArtifactFingerprint', trainingReceipt.candidateArtifactFingerprint],
    ['trainingActuallyExecuted', trainingReceipt.trainingActuallyExecuted],
    ['simulationOnly', trainingReceipt.simulationOnly],
    ['modelWeightsChanged', trainingReceipt.modelWeightsChanged],
    ['changedParameterCount', trainingReceipt.changedParameterCount],
    ['heldOutEvaluationReturned', evaluationReceipt.caseCount > 0 && evaluationReceipt.candidateArtifactBytesVerified === true],
    ['activationPerformed', trainingReceipt.activationPerformed],
    ['publicUploadPerformed', trainingReceipt.publicUploadPerformed]
  ]) {
    assertEqual(`machineResult.${field}`, expected, capturedResult[field], 'G04B_TERMINAL_RESULT_READDRESSING');
  }

  const canonicalResult = verifyG04BMachineResult({
    ...capturedResult,
    trainingReceiptFingerprint: derived.trainingReceiptFingerprint,
    evaluationReceiptFingerprint: derived.evaluationReceiptFingerprint
  }, validatedPacket);

  return Object.freeze({
    schemaVersion: G04B_TERMINAL_EVIDENCE_SCHEMA,
    result: capturedResult,
    canonicalResult,
    manifestFingerprint: derived.manifestFingerprint,
    trainingReceiptFingerprint: derived.trainingReceiptFingerprint,
    evaluationReceiptFingerprint: derived.evaluationReceiptFingerprint,
    candidateDirectory,
    sourceManifestFingerprint: manifest.sourceManifestFingerprint
  });
}

export function verifyG04BPersistedMachineResult(workerRoot, capturedResult, packet) {
  const root = fs.realpathSync.native(path.resolve(workerRoot));
  const persisted = loadExactG04BJsonFile(root, path.join(root, 'g04b-machine-result.json'), 'G04B persisted machine result');
  const persistedVerified = verifyG04BMachineResult(persisted, packet);
  const capturedVerified = verifyG04BMachineResult(capturedResult, packet);
  const persistedFingerprint = g04bCanonicalFingerprint(persistedVerified);
  const capturedFingerprint = g04bCanonicalFingerprint(capturedVerified);
  if (persistedFingerprint !== capturedFingerprint) {
    fail('G04B_PERSISTED_RESULT_READDRESSED', 'persisted G04B machine result differs from the independently captured terminal result', {
      persistedFingerprint,
      capturedFingerprint
    });
  }
  return capturedVerified;
}

// [VXG RealForever]
