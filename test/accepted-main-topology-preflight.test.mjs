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

test('accepted-main preflight reproduces a clean canonical depth-1 detached push checkout', () => {
  const source = workflowText();
  assert.match(source, /git clone --depth=1 --no-tags --branch vexlife-accepted-main-preflight/);
  assert.match(source, /checkout --detach "\$PREFLIGHT_MERGE_SHA"/);
  assert.match(source, /remote set-url origin "https:\/\/github\.com\/\$\{GITHUB_REPOSITORY\}"/);
  assert.match(source, /status --porcelain=v1 --untracked-files=all/);
  assert.match(source, /cat-file -e 'HEAD\^'/);
  assert.match(source, /VEXLIFE_CURRENT_WORK_EVENT_NAME=push/);
  assert.match(source, /VEXLIFE_TESTED_MERGE_SHA=/);
  assert.match(source, /VEXLIFE_CANDIDATE_HEAD_SHA=\$PREFLIGHT_MERGE_SHA/);
});

test('accepted-main preflight validates committed source without materializing a different tree before the gate', () => {
  const source = workflowText();
  assert.equal(source.includes('npm run manifest:write'), false);
  const orientIndex = source.indexOf('npm run orient');
  const manifestCheckIndex = source.indexOf('npm run --silent manifest:check');
  const buildAdmissionIndex = source.indexOf('npm run build-admission:check');
  const prReadyIndex = source.indexOf('npm run pr-ready');
  const healthIndex = source.indexOf('npm run health:check');
  assert.ok(orientIndex >= 0);
  assert.ok(manifestCheckIndex > orientIndex);
  assert.ok(buildAdmissionIndex > manifestCheckIndex);
  assert.ok(prReadyIndex > buildAdmissionIndex);
  assert.ok(healthIndex > prReadyIndex);
});

test('accepted-main preflight always seals evidence before its terminal enforcement step', () => {
  const source = workflowText();
  const sealIndex = source.indexOf('- name: Seal accepted-main topology receipt');
  const preserveIndex = source.indexOf('- name: Preserve accepted-main topology evidence');
  const enforceIndex = source.indexOf('- name: Enforce accepted-main topology preflight');
  assert.ok(sealIndex >= 0);
  assert.ok(preserveIndex > sealIndex);
  assert.ok(enforceIndex > preserveIndex);
  assert.match(source, /if: always\(\)/);
  assert.match(source, /gateExitCodes: exits/);
});

test('accepted-main preflight requires the complete retained gate and seals exact topology evidence', () => {
  const source = workflowText();
  assert.match(source, /vexlife\.accepted-main-topology-preflight\/v1/);
  assert.match(source, /ORDINARY_TWO_PARENT_MERGE_THEN_DEPTH_1_PUSH_CHECKOUT/);
  assert.match(source, /prReady\?\.state === 'PR_READY_PASSED'/);
  assert.match(source, /parentCommitAvailable === false/);
  assert.match(source, /allProductionEffectsAuthorized: false/);
  assert.match(source, /receipt\.state !== 'PASS'/);
});

// [VXG RealForever]
