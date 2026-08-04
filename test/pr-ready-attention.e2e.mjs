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

test('unknown or unverified PR workRef remains ATTENTION rather than becoming grounded or blocked', () => {
  const environment = { ...process.env };
  for (const name of [
    'VEXLIFE_REPOSITORY_VISIBILITY',
    'VEXLIFE_LIFECYCLE_STATE',
    'VEXLIFE_PR_NUMBER',
    'VEXLIFE_WORK_REF',
    'VEXLIFE_PRIOR_REVIEWED_HEAD',
    'VEXLIFE_CURRENT_WORK_PROJECTION',
    'VEXLIFE_CURRENT_WORK_EVENT_PATH',
    'VEXLIFE_CURRENT_WORK_EVENT_NAME',
    'GITHUB_EVENT_PATH',
    'GITHUB_EVENT_NAME',
    'VEXLIFE_CANDIDATE_HEAD_SHA',
    'VEXLIFE_TESTED_MERGE_SHA',
    'VEXLIFE_BASE_SHA'
  ]) delete environment[name];
  const orientation = spawnSync(process.execPath, ['scripts/orient.mjs'], {
    cwd: ROOT,
    env: environment,
    encoding: 'utf8'
  });
  assert.equal(orientation.status, 0, orientation.stderr);
  const receipt = JSON.parse(orientation.stdout);
  assert.equal(receipt.state, 'ATTENTION');
  assert.equal(receipt.currentWork.workRef, null);
  assert.equal(receipt.currentWork.workSource, 'UNKNOWN');
  assert.ok(receipt.attentions.some((item) => /workRef is UNKNOWN|current work is UNKNOWN/.test(item)));
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
