import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { admitCheckResult } from '../src/core/check-result.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../blueprint/build-health-registry.json', import.meta.url), 'utf8'));
const contract = registry.checkResultContract;
const admit = ({ state, transportState = 'EXECUTED', exitCode = 0, currentness = 'CURRENT', stdout = null }) => admitCheckResult({
  checkRef: 'check.fixture',
  command: 'npm run fixture',
  contract,
  transportState,
  exitCode,
  stdout: stdout ?? JSON.stringify({ state, currentness }),
  stderr: ''
});

test('structured admission preserves attention and unknown instead of passing exit code zero', () => {
  assert.equal(admit({ state: 'ATTENTION' }).semanticState, 'ATTENTION');
  assert.equal(admit({ state: 'UNKNOWN' }).semanticState, 'UNKNOWN');
  assert.equal(admit({ state: 'NOT_RUN' }).semanticState, 'NOT_RUN');
  assert.equal(admit({ state: 'STALE' }).semanticState, 'STALE');
});

test('structured admission accepts only executed current recognized pass output', () => {
  const passed = admit({ state: 'GROUNDED' });
  assert.equal(passed.transportState, 'EXECUTED');
  assert.equal(passed.semanticState, 'PASSED');
  assert.equal(passed.currentness, 'CURRENT');
  assert.equal(admit({ state: 'PASS', currentness: 'STALE' }).semanticState, 'STALE');
});

test('structured admission preserves executed failure and rejects unparseable zero exit', () => {
  assert.equal(admit({ state: 'FAILED', exitCode: 1 }).semanticState, 'FAILED');
  assert.equal(admit({ state: null, stdout: 'not machine readable', exitCode: 0 }).semanticState, 'BLOCKED');
  assert.equal(admit({ state: 'PASS', exitCode: 1 }).semanticState, 'FAILED');
});

test('structured admission preserves spawn failure and timeout transport states', () => {
  assert.equal(admit({ state: null, transportState: 'SPAWN_FAILED', exitCode: null }).transportState, 'SPAWN_FAILED');
  assert.equal(admit({ state: null, transportState: 'TIMED_OUT', exitCode: null }).transportState, 'TIMED_OUT');
});

// [VXG RealForever]
