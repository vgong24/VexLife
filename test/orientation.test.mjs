import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (script, args) => spawnSync(process.execPath, [`scripts/${script}`, ...args], { cwd: ROOT, encoding: 'utf8' });

test('orientation grounds bounded repository, Git, blueprint and route state', () => {
  const result = run('orient.mjs', ['--visibility', 'PRIVATE', '--pr', '1', '--work-ref', 'work.vexlife.foundation.corrections']);
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.repository.slug, 'vgong24/VexLife');
  assert.equal(receipt.repository.visibility.value, 'PRIVATE');
  assert.equal(receipt.currentWork.prRef, 'github-pr.vgong24/VexLife.1');
  assert.equal(receipt.blueprint.pathTopologyState, 'ROOT_RELATIVE');
  assert.equal(receipt.blueprint.state, 'CURRENT');
  assert.ok(receipt.requiredSources.length > 0);
  assert.match(receipt.exactNextRoute.held, /Do not merge, publish/);
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
