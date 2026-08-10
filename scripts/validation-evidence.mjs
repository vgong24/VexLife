#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { validateProviderNeutralValidationEvidence } from '../src/core/build-health.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const valueFlags = ['--evidence', '--repository', '--base', '--head', '--tree', '--source-tree'];
const values = {};
const consumed = new Set();
for (const flag of valueFlags) {
  const index = args.indexOf(flag);
  if (index < 0) continue;
  if (!args[index + 1]) {
    console.error(`missing value for ${flag}`);
    process.exit(2);
  }
  values[flag] = args[index + 1];
  consumed.add(index);
  consumed.add(index + 1);
}
if (args.some((_, index) => !consumed.has(index)) || !values['--evidence']) {
  console.error('Usage: node scripts/validation-evidence.mjs --evidence <json> [--repository ref] [--base sha] [--head sha] [--tree sha] [--source-tree sha256]');
  process.exit(2);
}
const evidencePath = path.resolve(ROOT, values['--evidence']);
const relative = path.relative(ROOT, evidencePath);
if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
  console.error('evidence path must remain inside the repository');
  process.exit(2);
}
let bundle;
try {
  bundle = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
} catch (error) {
  console.error(JSON.stringify({ state: 'VALIDATION_EVIDENCE_BLOCKED', currentness: 'BLOCKED', errors: [error.message] }, null, 2));
  process.exit(1);
}
const { buildHealth } = loadBlueprint(ROOT);
const result = validateProviderNeutralValidationEvidence(bundle, {
  registry: buildHealth,
  expectedRepositoryRef: values['--repository'] ?? null,
  expectedBaseSha: values['--base'] ?? null,
  expectedCandidateHeadSha: values['--head'] ?? null,
  expectedCandidateTreeSha: values['--tree'] ?? null,
  expectedSourceTreeSha256: values['--source-tree'] ?? null
});
console.log(JSON.stringify({
  state: result.state,
  currentness: result.currentness,
  validationProfileRef: result.profile.validationProfileRef,
  validationProfileVersion: result.profile.validationProfileVersion,
  validationProfileFingerprint: result.profile.semanticFingerprint,
  semanticCheckCount: result.profile.semanticChecks.length,
  proofCellCount: result.profile.proofCells.length,
  errors: result.errors
}, null, 2));
if (!result.ok) process.exitCode = 1;

// [VXG RealForever]
