import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { collectRepositoryEvidence } from '../src/core/repository-evidence.mjs';
import { buildSourceManifest } from '../src/core/source-manifest.mjs';
import { runContinuityEvolutionSimulation, validateContinuityEvolutionSimulationReceipt } from '../scripts/evolution-simulate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('orientation ATTENTION remains unresolved through pr-ready and repository Health', () => {
  const receiptArg = `generated/health/vexlife-pr-ready-attention-${process.pid}-${Date.now()}.json`;
  const receiptPath = path.join(ROOT, ...receiptArg.split('/'));
  const environment = { ...process.env, VEXLIFE_NESTED_PR_READY: '1' };
  for (const name of [
    'VEXLIFE_REPOSITORY_VISIBILITY',
    'VEXLIFE_LIFECYCLE_STATE',
    'VEXLIFE_PR_NUMBER',
    'VEXLIFE_WORK_REF',
    'VEXLIFE_PRIOR_REVIEWED_HEAD',
    'VEXLIFE_CURRENT_WORK_PROJECTION',
    'VEXLIFE_CANDIDATE_HEAD_SHA',
    'VEXLIFE_TESTED_MERGE_SHA',
    'VEXLIFE_BASE_SHA'
  ]) delete environment[name];
  try {
    const prReady = spawnSync(process.execPath, ['scripts/pr-ready.mjs', '--receipt', receiptArg], {
      cwd: ROOT,
      env: environment,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 300000
    });
    assert.equal(prReady.status, 1, prReady.stderr);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    const orientation = receipt.checkResults.find((item) => item.checkRef === 'check.orientation');
    assert.equal(orientation.transportState, 'EXECUTED');
    assert.equal(orientation.rawState, 'ATTENTION');
    assert.equal(orientation.semanticState, 'ATTENTION');
    assert.equal(receipt.state, 'PR_READY_FAILED');
    assert.equal(receipt.health.state, 'ATTENTION');
    assert.ok(receipt.health.receiptSummary.executedCurrentPassed < receipt.health.receiptSummary.total);
    assert.ok(receipt.health.unresolvedCheckRefs.includes('check.orientation'));

    const health = spawnSync(process.execPath, ['scripts/health-check.mjs', '--receipt', receiptArg], {
      cwd: ROOT,
      env: environment,
      encoding: 'utf8'
    });
    assert.equal(health.status, 1, health.stderr);
    assert.equal(JSON.parse(health.stdout).state, 'ATTENTION');
  } finally {
    fs.rmSync(receiptPath, { force: true });
  }
});

test('generic successful evolution command output cannot substitute for exact structured continuity receipt', () => {
  const bundle = loadBlueprint(ROOT);
  const blueprint = validateBlueprint(bundle);
  const source = buildSourceManifest(ROOT);
  const repository = collectRepositoryEvidence(ROOT);
  const context = {
    evolutionRegistry: bundle.evolution,
    blueprintHash: blueprint.semanticHash,
    sourceTreeSha256: source.treeSha256,
    repositoryGit: repository.git
  };
  const genericSuccess = { schemaVersion: 'vexlife.continuity-evolution-check-result/v0', state: 'VALID', currentness: 'CURRENT' };
  const missingStructured = validateContinuityEvolutionSimulationReceipt(genericSuccess, context);
  assert.equal(missingStructured.ok, false);
  assert.match(missingStructured.errors.join('\n'), /schema|identity|stale|journey|binding/i);

  const exact = runContinuityEvolutionSimulation({ root: ROOT, writeReceipt: false }).receipt;
  const stale = { ...exact, candidateHeadSha: '0'.repeat(40) };
  const staleValidation = validateContinuityEvolutionSimulationReceipt(stale, context);
  assert.equal(staleValidation.ok, false);
  assert.match(staleValidation.errors.join('\n'), /identity|candidateHeadSha/);
});

// [VXG RealForever]
