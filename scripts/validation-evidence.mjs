#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateValidationEvidenceBundle } from '../src/core/build-health.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function failUsage(message) {
  if (message) console.error(message);
  console.error('Usage: node scripts/validation-evidence.mjs --bundle <json> --repository <owner/name> --base <sha> --head <sha> --tree <sha> --source-tree <sha256> [--observed-head <sha>] [--registry <json>]');
  process.exit(2);
}

function valueFor(name, { required = false } = {}) {
  const index = args.indexOf(name);
  if (index < 0) {
    if (required) failUsage(`missing ${name}`);
    return null;
  }
  const value = args[index + 1];
  if (!value || value.startsWith('--')) failUsage(`missing value for ${name}`);
  return value;
}

const known = new Set(['--bundle', '--repository', '--base', '--head', '--tree', '--source-tree', '--observed-head', '--registry']);
for (let index = 0; index < args.length; index += 2) {
  if (!known.has(args[index])) failUsage(`unknown argument ${args[index] ?? ''}`);
  if (index + 1 >= args.length) failUsage(`missing value for ${args[index]}`);
}

const bundlePath = path.resolve(ROOT, valueFor('--bundle', { required: true }));
const registryPath = path.resolve(ROOT, valueFor('--registry') ?? 'blueprint/build-health-registry.json');
const expectedTarget = {
  repositoryRef: valueFor('--repository', { required: true }),
  baseSha: valueFor('--base', { required: true }),
  candidateHeadSha: valueFor('--head', { required: true }),
  candidateTreeSha: valueFor('--tree', { required: true }),
  sourceTreeSha256: valueFor('--source-tree', { required: true }),
  observedHeadSha: valueFor('--observed-head') ?? valueFor('--head', { required: true })
};

let bundle;
let registry;
try {
  bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
} catch (error) {
  console.log(JSON.stringify({
    state: 'VALIDATION_EVIDENCE_BLOCKED',
    currentness: 'BLOCKED',
    errors: [`input unavailable: ${error.message}`]
  }, null, 2));
  process.exit(1);
}

const validation = validateValidationEvidenceBundle(bundle, registry.validationEvidencePolicy, expectedTarget);
console.log(JSON.stringify({
  state: validation.ok ? 'VALIDATION_EVIDENCE_VALID' : 'VALIDATION_EVIDENCE_BLOCKED',
  currentness: validation.ok ? 'CURRENT' : 'BLOCKED',
  validationEvidenceRef: bundle.validationEvidenceRef ?? null,
  validationProfileRef: bundle.validationProfileRef ?? null,
  candidateHeadSha: bundle.candidateHeadSha ?? null,
  candidateTreeSha: bundle.candidateTreeSha ?? null,
  sourceTreeSha256: bundle.sourceTreeSha256 ?? null,
  semanticFingerprint: bundle.semanticFingerprint ?? null,
  stats: validation.stats,
  satisfiedProofCells: validation.satisfiedProofCells,
  errors: validation.errors
}, null, 2));
if (!validation.ok) process.exitCode = 1;

// [VXG RealForever]
