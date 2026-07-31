import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('orientation ATTENTION remains unresolved through pr-ready and repository Health', () => {
  const receiptPath = path.join(os.tmpdir(), `vexlife-pr-ready-attention-${process.pid}-${Date.now()}.json`);
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
    const prReady = spawnSync(process.execPath, ['scripts/pr-ready.mjs', '--receipt', receiptPath], {
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

    const health = spawnSync(process.execPath, ['scripts/health-check.mjs', '--receipt', receiptPath], {
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

// [VXG RealForever]
