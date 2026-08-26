#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FOUNDATION_TRAINING_SCHEMA = 'vexlife.foundation-training-manifest/v1';
export const FOUNDATION_TRAINING_MODES = Object.freeze([
  'ADAPTER_PROBE',
  'FOUNDATION_PARTIAL_FULL_RANK',
  'FOUNDATION_FULL'
]);

const HEX40 = /^[0-9a-f]{40}$/u;
const HEX64 = /^[0-9a-f]{64}$/u;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export class FoundationTrainingPlanError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'FoundationTrainingPlanError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new FoundationTrainingPlanError(code, message, details);
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalFingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function stableRefs(value, label, {required = false} = {}) {
  if (!Array.isArray(value) || (required && value.length === 0)
      || value.some(item => typeof item !== 'string' || item.length === 0)
      || new Set(value).size !== value.length) {
    fail('G04B_MANIFEST_INVALID', `${label} must contain unique stable refs${required ? ' and must not be empty' : ''}`);
  }
  return [...value].sort();
}

function exactPath(raw, label, repoRoot = REPO_ROOT) {
  if (typeof raw !== 'string' || raw.length === 0) fail('G04B_MANIFEST_INVALID', `${label} is required`);
  const root = path.resolve(repoRoot);
  const target = path.resolve(root, raw);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('G04B_PATH_ESCAPE', `${label} must be a repository-relative file path`, {raw});
  }
  return target;
}

export function validateFoundationTrainingManifest(input, {repoRoot = REPO_ROOT, verifyFiles = true} = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('G04B_MANIFEST_INVALID', 'manifest must be an object');
  const manifest = structuredClone(input);
  if (manifest.schemaVersion !== FOUNDATION_TRAINING_SCHEMA) fail('G04B_MANIFEST_INVALID', `schemaVersion must be ${FOUNDATION_TRAINING_SCHEMA}`);
  if (!FOUNDATION_TRAINING_MODES.includes(manifest.trainingMode)) fail('G04B_MANIFEST_INVALID', `unknown trainingMode ${manifest.trainingMode}`);
  if (typeof manifest.trainingRunRef !== 'string' || !manifest.trainingRunRef) fail('G04B_MANIFEST_INVALID', 'trainingRunRef is required');
  if (typeof manifest.sourceModelRepo !== 'string' || !manifest.sourceModelRepo.includes('/')) fail('G04B_MANIFEST_INVALID', 'sourceModelRepo must be an exact owner/repository identity');
  if (!HEX40.test(manifest.sourceModelRevision ?? '')) fail('G04B_SOURCE_MODEL_NOT_PINNED', 'sourceModelRevision must be one exact 40-character lowercase commit');
  if (!HEX64.test(manifest.sourceModelSnapshotFingerprint ?? '')) fail('G04B_SOURCE_MODEL_NOT_PINNED', 'sourceModelSnapshotFingerprint must be a declared lowercase SHA-256 expectation');
  if (typeof manifest.licenseRef !== 'string' || !manifest.licenseRef) fail('G04B_MANIFEST_INVALID', 'licenseRef is required');
  if (!HEX64.test(manifest.trainingDatasetSha256 ?? '') || !HEX64.test(manifest.heldoutDatasetSha256 ?? '')) {
    fail('G04B_DATASET_NOT_PINNED', 'training and held-out datasets require lowercase SHA-256');
  }
  if (!Number.isSafeInteger(manifest.maxSteps) || manifest.maxSteps <= 0) fail('G04B_NO_REAL_STEP', 'maxSteps must be a positive integer');
  if (!Number.isSafeInteger(manifest.epochs) || manifest.epochs <= 0) fail('G04B_NO_REAL_STEP', 'epochs must be a positive integer');
  if (typeof manifest.learningRate !== 'number' || !(manifest.learningRate > 0)) fail('G04B_MANIFEST_INVALID', 'learningRate must be positive');
  if (!Number.isSafeInteger(manifest.maxSequenceLength) || manifest.maxSequenceLength < 32) fail('G04B_MANIFEST_INVALID', 'maxSequenceLength must be >= 32');
  if (!Number.isSafeInteger(manifest.gradientAccumulationSteps) || manifest.gradientAccumulationSteps <= 0) fail('G04B_MANIFEST_INVALID', 'gradientAccumulationSteps must be positive');
  if (!['bf16', 'fp16', 'fp32'].includes(manifest.precision)) fail('G04B_MANIFEST_INVALID', 'precision must be bf16, fp16 or fp32');
  if (manifest.optimizer !== 'adamw') fail('G04B_MANIFEST_INVALID', 'generation-1 optimizer must be adamw');
  if (manifest.activationAuthorized !== false) fail('G04B_ACTIVATION_COLLAPSE', 'training manifest must keep activationAuthorized=false');
  if (manifest.publicUploadAuthorized !== false) fail('G04B_PUBLICATION_COLLAPSE', 'training manifest must keep publicUploadAuthorized=false');
  if (Object.prototype.hasOwnProperty.call(manifest, 'modelDownloadAuthorized')) {
    fail('G04B_NETWORK_AUTHORITY_COLLAPSE', 'training manifest cannot carry modelDownloadAuthorized; source-model provisioning authority is external to G04B training');
  }

  manifest.sourceLessonRefs = stableRefs(manifest.sourceLessonRefs, 'sourceLessonRefs', {required: true});
  manifest.sourceScoreRefs = stableRefs(manifest.sourceScoreRefs ?? [], 'sourceScoreRefs');
  manifest.consentReceiptRefs = stableRefs(manifest.consentReceiptRefs, 'consentReceiptRefs', {required: true});
  manifest.trainingIdentityRefs = stableRefs(manifest.trainingIdentityRefs, 'trainingIdentityRefs', {required: true});
  manifest.protectedInvariantRefs = stableRefs(manifest.protectedInvariantRefs, 'protectedInvariantRefs', {required: true});

  if (manifest.trainingMode === 'FOUNDATION_PARTIAL_FULL_RANK') {
    if (manifest.parameterSelection?.strategy !== 'LAST_N_LANGUAGE_BLOCKS'
        || !Number.isSafeInteger(manifest.parameterSelection?.count)
        || manifest.parameterSelection.count <= 0
        || typeof manifest.parameterSelection.includeLmHead !== 'boolean') {
      fail('G04B_PARAMETER_SELECTION_INVALID', 'partial full-rank mode requires LAST_N_LANGUAGE_BLOCKS with positive count and includeLmHead boolean');
    }
  }

  const trainingDataset = exactPath(manifest.trainingDatasetPath, 'trainingDatasetPath', repoRoot);
  const heldoutDataset = exactPath(manifest.heldoutDatasetPath, 'heldoutDatasetPath', repoRoot);
  const outputDir = exactPath(manifest.outputDir, 'outputDir', repoRoot);
  if (verifyFiles) {
    for (const [file, expected, label] of [
      [trainingDataset, manifest.trainingDatasetSha256, 'training dataset'],
      [heldoutDataset, manifest.heldoutDatasetSha256, 'held-out dataset']
    ]) {
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail('G04B_DATASET_MISSING', `${label} is missing`, {file});
      const observed = sha256File(file);
      if (observed !== expected) fail('G04B_DATASET_HASH_MISMATCH', `${label} hash mismatch`, {expected, observed});
    }
  }

  const foundationWeightChangeEligible = ['FOUNDATION_PARTIAL_FULL_RANK', 'FOUNDATION_FULL'].includes(manifest.trainingMode);
  return Object.freeze({
    schemaVersion: 'vexlife.foundation-training-plan/v1',
    trainingRunRef: manifest.trainingRunRef,
    trainingMode: manifest.trainingMode,
    sourceModelRepo: manifest.sourceModelRepo,
    sourceModelRevision: manifest.sourceModelRevision,
    sourceModelSnapshotFingerprint: manifest.sourceModelSnapshotFingerprint,
    sourceModelSnapshotFingerprintObserved: false,
    sourceModelIdentityClass: 'EXACT_REPOSITORY_PLUS_COMMIT_REVISION',
    trainingDatasetPath: path.relative(path.resolve(repoRoot), trainingDataset).replaceAll(path.sep, '/'),
    heldoutDatasetPath: path.relative(path.resolve(repoRoot), heldoutDataset).replaceAll(path.sep, '/'),
    outputDir: path.relative(path.resolve(repoRoot), outputDir).replaceAll(path.sep, '/'),
    sourceLessonRefs: manifest.sourceLessonRefs,
    sourceScoreRefs: manifest.sourceScoreRefs,
    consentReceiptRefs: manifest.consentReceiptRefs,
    trainingIdentityRefs: manifest.trainingIdentityRefs,
    protectedInvariantRefs: manifest.protectedInvariantRefs,
    parameterSelection: structuredClone(manifest.parameterSelection ?? null),
    foundationWeightChangeEligible,
    adapterOnlyTerminalEligible: false,
    realExecutionRequired: true,
    realOptimizerStepRequired: true,
    nonzeroChangedParameterRequired: true,
    candidateDigestMustDiffer: true,
    automaticActivation: false,
    currentAcceptedGenerationOverwrite: false,
    planFingerprint: canonicalFingerprint(manifest)
  });
}

export function loadFoundationTrainingPlan(manifestPath, options = {}) {
  const resolved = path.resolve(manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    fail('G04B_MANIFEST_UNREADABLE', `manifest could not be read: ${error.message}`);
  }
  return validateFoundationTrainingManifest(manifest, options);
}

function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error('Usage: node scripts/foundation-training-plan.mjs <training-manifest.json>');
    process.exitCode = 2;
    return;
  }
  try {
    const plan = loadFoundationTrainingPlan(manifestPath);
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } catch (error) {
    const payload = error instanceof FoundationTrainingPlanError
      ? {schemaVersion: 'vexlife.foundation-training-plan-error/v1', code: error.code, error: error.message, details: error.details}
      : {schemaVersion: 'vexlife.foundation-training-plan-error/v1', code: 'G04B_UNEXPECTED', error: error.message};
    process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();