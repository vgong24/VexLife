import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveOrientationReceipt } from '../src/core/orientation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (script, args) => spawnSync(process.execPath, [`scripts/${script}`, ...args], { cwd: ROOT, encoding: 'utf8' });
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint/orientation.json'), 'utf8'));
const blueprint = {
  state: 'CURRENT',
  semanticHash: 'blueprint.fixture',
  sourceManifestState: 'CURRENT',
  sourceTreeSha256: 'tree.fixture',
  pathTopologyState: 'ROOT_RELATIVE',
  valid: true,
  sourceManifestCurrent: true,
  pathTopologyValid: true
};
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/orientation', `${name}.json`), 'utf8'));

test('orientation grounds live current PR inputs without stable correction defaults', () => {
  const result = run('orient.mjs', [
    '--visibility', 'PRIVATE',
    '--lifecycle', 'PRIVATE_STAGING',
    '--pr', '1',
    '--work-ref', 'work.vexlife.foundation.corrections',
    '--prior-reviewed-head', 'cadcbaf3dd6a2a4ad03cc6b692cedd24aae0ce5f'
  ]);
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.repository.slug, 'vgong24/VexLife');
  assert.equal(receipt.repository.visibility.value, 'PRIVATE');
  assert.equal(receipt.currentWork.prRef, 'github-pr.vgong24/VexLife.1');
  assert.equal(receipt.lifecycle.state, 'PRIVATE_STAGING');
  assert.equal(receipt.blueprint.pathTopologyState, 'ROOT_RELATIVE');
  assert.equal(receipt.blueprint.state, 'CURRENT');
  assert.ok(receipt.requiredSources.length > 0);
  assert.equal(receipt.stableRepositoryIdentity.activeBranch, undefined);
  assert.equal(receipt.stableRepositoryIdentity.activePr, undefined);
  assert.equal(receipt.stableRepositoryIdentity.priorReviewedHead, undefined);
});

test('orientation lifecycle fixtures cover current PR, detached merge, accepted main, and public active', () => {
  const cases = [
    ['current-pr', 'ACTIVE_PR', 'PRIVATE_STAGING'],
    ['detached-merge', 'ACTIVE_PR', 'PRIVATE_STAGING'],
    ['accepted-main', 'ACCEPTED_MAIN', 'PRIVATE_STAGING'],
    ['public-active', 'ACCEPTED_MAIN', 'PUBLIC_ACTIVE']
  ];
  for (const [name, currentWorkState, lifecycleState] of cases) {
    const input = fixture(name);
    const receipt = deriveOrientationReceipt({ contract, ...input, blueprint });
    assert.equal(receipt.state, 'GROUNDED', `${name}: ${receipt.attentions.join('; ')} ${receipt.blockers.join('; ')}`);
    assert.equal(receipt.currentWork.state, currentWorkState);
    assert.equal(receipt.lifecycle.state, lifecycleState);
  }
});

test('detached synthetic merge keeps candidate head, tested merge, and base distinct', () => {
  const input = fixture('detached-merge');
  const receipt = deriveOrientationReceipt({ contract, ...input, blueprint });
  assert.notEqual(receipt.git.candidateHeadSha, receipt.git.testedMergeSha);
  assert.notEqual(receipt.git.baseSha, receipt.git.testedMergeSha);
  assert.equal(receipt.git.candidateHeadShaSeparatedFromTestedMergeSha, true);
  assert.equal(receipt.git.checkoutKind, 'SYNTHETIC_MERGE');
});

test('missing lifecycle, visibility, and current work stay UNKNOWN instead of restoring history', () => {
  const input = fixture('current-pr');
  input.currentWork = {
    visibility: 'UNKNOWN',
    visibilitySource: 'UNKNOWN',
    prNumber: null,
    prSource: 'UNKNOWN',
    workRef: null,
    workSource: 'UNKNOWN',
    priorReviewedHead: null,
    commitsAbovePriorHead: null
  };
  input.lifecycle = { state: 'UNKNOWN', source: 'UNKNOWN' };
  const receipt = deriveOrientationReceipt({ contract, ...input, blueprint });
  assert.equal(receipt.state, 'ATTENTION');
  assert.equal(receipt.repository.visibility.value, 'UNKNOWN');
  assert.equal(receipt.lifecycle.state, 'UNKNOWN');
  assert.equal(receipt.currentWork.state, 'UNKNOWN');
});

test('Atlas query enforces bounded traversal and returns coverage', () => {
  const result = run('atlas-query.mjs', ['--intent', 'repository health', '--depth', '1', '--limit', '4', '--tokens', '800']);
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.state, 'BOUNDED_RESULTS');
  assert.ok(receipt.results.length <= 4);
  assert.equal(receipt.coverage.depthLimit, 1);
  assert.equal(receipt.coverage.resultLimit, 4);
  assert.equal(receipt.coverage.tokenBudget, 800);
});

test('module description resolves one exact module and rejects broad requests', () => {
  const exact = run('module-describe.mjs', ['--module-ref', 'module.vexlife.core.atlas']);
  assert.equal(exact.status, 0, exact.stderr);
  const receipt = JSON.parse(exact.stdout);
  assert.equal(receipt.state, 'BOUNDED_MODULE');
  assert.equal(receipt.path, 'src/core/atlas.mjs');
  const broad = run('module-describe.mjs', ['--module-ref', '*']);
  assert.equal(broad.status, 1);
  assert.match(broad.stderr, /BLOCKED_UNKNOWN_MODULE/);
});

// [VXG RealForever]
