#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { deriveRepositoryHealth, validateBuildHealthRegistry } from '../src/core/build-health.mjs';
import { buildSourceManifest } from '../src/core/source-manifest.mjs';
import { writeJson } from '../src/core/utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = loadBlueprint(ROOT);
const registry = validateBuildHealthRegistry(bundle.buildHealth, bundle.reviewLenses);
const blueprint = validateBlueprint(bundle);
if (!registry.ok || !blueprint.ok) {
  console.error(JSON.stringify({
    state: 'PR_READY_BLOCKED_INVALID_REGISTRY',
    registryErrors: registry.errors,
    blueprintErrors: blueprint.errors
  }, null, 2));
  process.exit(1);
}
const initialSource = buildSourceManifest(ROOT);
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const checkResultsByRef = new Map();
const commandPattern = /^npm run ([A-Za-z0-9:_-]+)$/;

for (const check of bundle.buildHealth.checks) {
  const match = check.command.match(commandPattern);
  if (!match) {
    checkResultsByRef.set(check.checkRef, { checkRef: check.checkRef, state: 'BLOCKED', executed: false, currentness: 'UNKNOWN', detailRef: `UNSUPPORTED_COMMAND:${check.command}` });
    continue;
  }
  const result = spawnSync(npmExecutable, ['run', match[1]], { cwd: ROOT, stdio: 'inherit' });
  checkResultsByRef.set(check.checkRef, {
    checkRef: check.checkRef,
    state: result.status === 0 ? 'PASSED' : 'FAILED',
    executed: true,
    currentness: 'CURRENT',
    detailRef: check.command
  });
}

const checkResults = bundle.buildHealth.checks.map((check) => checkResultsByRef.get(check.checkRef) ?? ({
  checkRef: check.checkRef,
  state: 'NOT_RUN',
  executed: false,
  currentness: 'UNKNOWN',
  detailRef: check.command
}));
const finalSource = buildSourceManifest(ROOT);
if (initialSource.treeSha256 !== finalSource.treeSha256) {
  checkResults.push({ checkRef: 'check.pr-ready-source-stability', state: 'BLOCKED', executed: true, currentness: 'CURRENT', detailRef: 'source tree changed while checks executed' });
}
const { projection } = deriveRepositoryHealth({
  sourceTreeRef: finalSource.treeSha256,
  blueprintHash: blueprint.semanticHash,
  checkResults
});
const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
const receipt = {
  schemaVersion: 'vexlife.pr-ready-receipt/v0',
  receiptRef: `receipt.vexlife.pr-ready.${finalSource.treeSha256.slice(0, 24)}`,
  state: projection.state === 'HEALTHY' ? 'PR_READY_PASSED' : 'PR_READY_FAILED',
  headSha: head.status === 0 ? head.stdout.trim() : null,
  sourceTreeSha256: finalSource.treeSha256,
  blueprintHash: blueprint.semanticHash,
  formedAt: new Date().toISOString(),
  checkResults,
  health: projection
};
const receiptPath = path.join(ROOT, 'generated/health/pr-ready.json');
fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
writeJson(receiptPath, receipt);
console.log(JSON.stringify({
  state: receipt.state,
  receiptPath: path.relative(ROOT, receiptPath).split(path.sep).join('/'),
  headSha: receipt.headSha,
  sourceTreeSha256: receipt.sourceTreeSha256,
  blueprintHash: receipt.blueprintHash,
  receiptSummary: projection.receiptSummary,
  blockingCheckRefs: projection.blockingCheckRefs,
  unresolvedCheckRefs: projection.unresolvedCheckRefs
}, null, 2));
if (receipt.state !== 'PR_READY_PASSED') process.exitCode = 1;

// [VXG RealForever]
