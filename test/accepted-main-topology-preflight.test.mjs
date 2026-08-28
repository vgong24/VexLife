import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = path.join(ROOT, '.github/workflows/accepted-main-preflight.yml');

function workflowText() {
  return fs.readFileSync(WORKFLOW, 'utf8');
}

test('accepted-main preflight is a pull-request gate over an ordinary current-main merge', () => {
  const source = workflowText();
  assert.match(source, /^name: Accepted-main topology preflight$/mu);
  assert.match(source, /^  pull_request:$/mu);
  assert.match(source, /git fetch --no-tags origin/);
  assert.match(source, /git merge --no-ff --no-commit "\$PR_HEAD_SHA"/);
  assert.match(source, /Signed-off-by: VexGPT <victor\.gong@vextreme24\.com>/);
});

test('accepted-main preflight reproduces the depth-1 push checkout instead of reusing PR synthetic topology', () => {
  const source = workflowText();
  assert.match(source, /git clone --depth=1 --no-tags --branch vexlife-accepted-main-preflight/);
  assert.match(source, /cat-file -e 'HEAD\^'/);
  assert.match(source, /VEXLIFE_CURRENT_WORK_EVENT_NAME=push/);
  assert.match(source, /VEXLIFE_TESTED_MERGE_SHA=/);
  assert.match(source, /VEXLIFE_CANDIDATE_HEAD_SHA=\$PREFLIGHT_MERGE_SHA/);
});

test('accepted-main preflight requires the complete retained gate and seals exact topology evidence', () => {
  const source = workflowText();
  assert.match(source, /npm run orient/);
  assert.match(source, /npm run build-admission:check/);
  assert.match(source, /npm run pr-ready/);
  assert.match(source, /npm run health:check/);
  assert.match(source, /vexlife\.accepted-main-topology-preflight\/v1/);
  assert.match(source, /ORDINARY_TWO_PARENT_MERGE_THEN_DEPTH_1_PUSH_CHECKOUT/);
  assert.match(source, /prReady\.state === 'PR_READY_PASSED'/);
  assert.match(source, /parentCommitAvailable === false/);
  assert.match(source, /allProductionEffectsAuthorized: false/);
});

// [VXG RealForever]
