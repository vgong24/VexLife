#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { validateBuildHealthRegistry, deriveRepositoryHealth } from '../src/core/build-health.mjs';
import { buildSourceManifest } from '../src/core/source-manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const receiptIndex = process.argv.indexOf('--receipt');
if (receiptIndex >= 0 && !process.argv[receiptIndex + 1]) {
  console.error('Usage: npm run health:check -- [--receipt generated/health/pr-ready.json]');
  process.exit(2);
}
const receiptPath = path.resolve(ROOT, receiptIndex >= 0 ? process.argv[receiptIndex + 1] : 'generated/health/pr-ready.json');
const bundle = loadBlueprint(ROOT);
const registry = validateBuildHealthRegistry(bundle.buildHealth, bundle.reviewLenses);
const blueprint = validateBlueprint(bundle);
const sourceManifest = buildSourceManifest(ROOT);
const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
const headSha = head.status === 0 ? head.stdout.trim() : null;
let receipt = null;
let receiptState = 'NOT_RUN';
const receiptErrors = [];
if (fs.existsSync(receiptPath)) {
  try {
    receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    const bindingCurrent = receipt.schemaVersion === 'vexlife.pr-ready-receipt/v0' &&
      receipt.headSha === headSha &&
      receipt.sourceTreeSha256 === sourceManifest.treeSha256 &&
      receipt.blueprintHash === blueprint.semanticHash;
    if (!bindingCurrent) {
      receiptState = 'STALE';
    } else if (!Array.isArray(receipt.checkResults)) {
      receiptState = 'INVALID';
      receiptErrors.push('current receipt missing checkResults');
    } else {
      const expectedRefs = bundle.buildHealth.checks.map((item) => item.checkRef).sort();
      const actualRefs = receipt.checkResults.map((item) => item.checkRef).sort();
      if (new Set(actualRefs).size !== actualRefs.length || JSON.stringify(actualRefs) !== JSON.stringify(expectedRefs)) {
        receiptState = 'INVALID';
        receiptErrors.push('current receipt check coverage does not exactly match the build-health registry');
      } else {
        receiptState = 'EXECUTED_CURRENT';
      }
    }
  } catch {
    receiptState = 'INVALID';
    receiptErrors.push('receipt is not valid JSON');
  }
}
const checkResults = receiptState === 'EXECUTED_CURRENT'
  ? receipt.checkResults
  : bundle.buildHealth.checks.map((item) => ({
      checkRef: item.checkRef,
      state: item.checkRef === 'check.blueprint' ? (blueprint.ok ? 'PASSED' : 'FAILED') : receiptState === 'STALE' ? 'UNKNOWN' : 'NOT_RUN',
      executed: item.checkRef === 'check.blueprint',
      currentness: item.checkRef === 'check.blueprint' ? 'CURRENT' : receiptState === 'STALE' ? 'STALE' : 'UNKNOWN',
      detailRef: item.command
    }));
const { projection } = deriveRepositoryHealth({ sourceTreeRef: sourceManifest.treeSha256, blueprintHash: blueprint.semanticHash, checkResults });
const errors = [...registry.errors, ...(blueprint.ok ? [] : blueprint.errors), ...receiptErrors];
console.log(JSON.stringify({
  state: errors.length ? 'REPOSITORY_HEALTH_INVALID' : projection.state,
  receiptState,
  receiptPath: path.relative(ROOT, receiptPath).split(path.sep).join('/'),
  registryChecks: registry.stats.checks,
  blueprintHash: blueprint.semanticHash,
  sourceTreeSha256: sourceManifest.treeSha256,
  receiptSummary: projection.receiptSummary,
  blockingCheckRefs: projection.blockingCheckRefs,
  unresolvedCheckRefs: projection.unresolvedCheckRefs,
  errors
}, null, 2));
if (errors.length || projection.state !== 'HEALTHY') process.exitCode = 1;

// [VXG RealForever]
