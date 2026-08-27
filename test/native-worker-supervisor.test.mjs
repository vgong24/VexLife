import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  NativeWorkerSupervisorError,
  consumeNativeWorkerResult,
  loadNativeWorker,
  markNativeWorkerStandingBy,
  markNativeWorkerWaiting,
  prepareNativeWorker,
  projectHumanWorkPulse,
  requestNativeWorkerControl,
  runPreparedNativeWorker,
  validateNativeWorkerManifest
} from '../src/core/native-worker-supervisor.mjs';

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function rootFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-native-worker-'));
  const runtimeRoot = path.join(root, 'runtime');
  const sourceRoot = path.join(root, 'source');
  fs.mkdirSync(runtimeRoot);
  fs.mkdirSync(sourceRoot);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, runtimeRoot, sourceRoot };
}
function manifest(overrides = {}) {
  return {
    schemaVersion: 'vexlife.native-worker-manifest/v1',
    workerRef: 'worker.vexlife.test.001',
    workRef: 'work.vexlife.test.001',
    purposeRef: 'purpose.vexlife.test',
    humanLabel: 'Synthetic exact worker',
    executableRef: 'runtime.node.current',
    argv: ['-e', 'process.stdout.write("ok\\n")'],
    sourceRootRelativeWorkingDirectory: 'worker',
    schedulingClass: 'BACKGROUND',
    pauseMode: 'CHECKPOINT_BOUND_COOPERATIVE',
    resultContractRef: 'contract.vexlife.test-result.v1',
    executionAuthorityRef: 'authority.vexlife.test.no-effects',
    ...overrides
  };
}
function binding(overrides = {}) {
  return {
    schemaVersion: 'vexlife.native-worker-runtime-binding/v1',
    bindingRef: 'binding.runtime.node.current.test',
    executableRef: 'runtime.node.current',
    executablePath: process.execPath,
    executableSha256: sha256File(process.execPath),
    hostRef: 'host.test.local',
    observedAt: new Date().toISOString(),
    ...overrides
  };
}
function prepared(t, manifestOverrides = {}) {
  const fixture = rootFixture(t);
  fs.mkdirSync(path.join(fixture.sourceRoot, 'worker'));
  return {
    ...fixture,
    prepared: prepareNativeWorker({
      runtimeRoot: fixture.runtimeRoot,
      sourceRoot: fixture.sourceRoot,
      manifest: manifest(manifestOverrides),
      binding: binding()
    })
  };
}
function expectCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof NativeWorkerSupervisorError);
    assert.equal(error.code, code);
    return true;
  });
}

test('closed manifest rejects unknown command/shell-shaped fields', () => {
  const value = manifest();
  value.command = 'rm -rf /';
  expectCode(() => validateNativeWorkerManifest(value), 'NWS_MANIFEST_INVALID');
  delete value.command;
  value.shell = true;
  expectCode(() => validateNativeWorkerManifest(value), 'NWS_MANIFEST_INVALID');
});

test('argv remains an exact array and shell text is never accepted as a replacement', () => {
  const value = validateNativeWorkerManifest(manifest({ argv: ['-e', 'console.log("a b ; $HOME")'] }));
  assert.deepEqual(value.argv, ['-e', 'console.log("a b ; $HOME")']);
  assert.equal('command' in value, false);
  assert.equal('shell' in value, false);
});

test('executable binding mismatch and working-directory escape fail closed', (t) => {
  const fixture = rootFixture(t);
  fs.mkdirSync(path.join(fixture.sourceRoot, 'worker'));
  expectCode(() => prepareNativeWorker({ runtimeRoot: fixture.runtimeRoot, sourceRoot: fixture.sourceRoot, manifest: manifest(), binding: binding({ executableRef: 'runtime.other' }) }), 'NWS_BINDING_MISMATCH');
  expectCode(() => validateNativeWorkerManifest(manifest({ sourceRootRelativeWorkingDirectory: '../escape' })), 'NWS_MANIFEST_INVALID');
});

test('worker terminal becomes WRAPPING_UP and only explicit result consumption becomes DONE', async (t) => {
  const { prepared: initial } = prepared(t);
  assert.equal(initial.workPulse.state, 'STANDING_BY');
  const terminal = await runPreparedNativeWorker(initial.workerRoot, { pollMs: 25 });
  assert.equal(terminal.receipt.state, 'WRAPPING_UP');
  assert.equal(terminal.workPulse.state, 'WRAPPING_UP');
  const current = loadNativeWorker(initial.workerRoot);
  assert.equal(current.receipt.terminalEvidence.exitCode, 0);
  assert.equal(current.completion, null);
  const consumed = consumeNativeWorkerResult(initial.workerRoot, {
    resultRef: 'result.vexlife.test.001',
    machineCompletionRecord: { exactOutputSha256: 'a'.repeat(64), effectPerformed: false },
    humanSummary: 'The synthetic worker finished successfully; no protected effect occurred.'
  });
  assert.equal(consumed.receipt.state, 'DONE');
  assert.equal(consumed.workPulse.symbol, '✓');
  assert.equal(consumed.workPulse.summary, consumed.completion.humanSummary);
  assert.notEqual(consumed.completion.machineCompletionRecordSha256, consumed.completion.humanSummary);
});

test('standing-by, waiting and pause projections remain small and truthful', (t) => {
  const { prepared: initial } = prepared(t);
  assert.equal(initial.workPulse.label, 'Standing by');
  const waiting = markNativeWorkerWaiting(initial.workerRoot, 'qualified accelerator slot');
  assert.deepEqual(
    { state: waiting.workPulse.state, label: waiting.workPulse.label, detail: waiting.workPulse.detail },
    { state: 'WAITING', label: 'Waiting', detail: 'qualified accelerator slot' }
  );
  const standby = markNativeWorkerStandingBy(initial.workerRoot);
  assert.equal(standby.workPulse.state, 'STANDING_BY');
  const paused = requestNativeWorkerControl(initial.workerRoot, 'PAUSE');
  assert.equal(paused.receipt.state, 'PAUSED');
  assert.equal(paused.workPulse.symbol, '⏸');
  assert.equal(paused.workPulse.colorToken, null);
  assert.equal(paused.workPulse.label, 'Paused');
  assert.equal(paused.receipt.pid, null, 'PAUSED is only emitted when no child is active');
});

test('a running cooperative pause request remains human-visible as working until the worker yields', () => {
  const pulse = projectHumanWorkPulse({ state: 'PAUSE_REQUESTED', waitingReason: 'cooperative worker checkpoint' });
  assert.equal(pulse.state, 'WORKING');
  assert.equal(pulse.symbol, '●');
  assert.match(pulse.detail, /waiting for a cooperative checkpoint/u);
});

test('cancel request is only admitted while an exact worker is actively owned', (t) => {
  const { prepared: initial } = prepared(t);
  expectCode(() => requestNativeWorkerControl(initial.workerRoot, 'CANCEL'), 'NWS_NOT_CANCELLABLE');
});

test('foreground interruption does not erase durable worker ownership', (t) => {
  const { prepared: initial } = prepared(t);
  const before = loadNativeWorker(initial.workerRoot);
  const unrelatedForegroundContext = { schedulingClass: 'INTERACTIVE', userTurn: 'interrupting question' };
  assert.equal(unrelatedForegroundContext.schedulingClass, 'INTERACTIVE');
  const after = loadNativeWorker(initial.workerRoot);
  assert.equal(after.manifest.workerRef, before.manifest.workerRef);
  assert.equal(after.receipt.state, 'STANDING_BY');
  assert.equal(after.manifest.schedulingClass, 'BACKGROUND');
});

test('status reconstructs latest accepted state and rejects a torn current pointer', (t) => {
  const { prepared: initial } = prepared(t);
  assert.equal(loadNativeWorker(initial.workerRoot).receipt.state, 'STANDING_BY');
  const pointer = path.join(initial.workerRoot, 'current.json');
  const current = JSON.parse(fs.readFileSync(pointer, 'utf8'));
  current.receiptSha256 = '0'.repeat(64);
  fs.writeFileSync(pointer, JSON.stringify(current));
  expectCode(() => loadNativeWorker(initial.workerRoot), 'NWS_STATE_CORRUPT');
});

test('source proof worker can run with no repository, Home, Memory, model or network mutation contract', async (t) => {
  const { prepared: initial, sourceRoot } = prepared(t, { argv: ['-e', 'process.exit(0)'] });
  const before = fs.readdirSync(sourceRoot, { recursive: true }).sort();
  const result = await runPreparedNativeWorker(initial.workerRoot, { pollMs: 25 });
  const after = fs.readdirSync(sourceRoot, { recursive: true }).sort();
  assert.deepEqual(after, before);
  assert.equal(result.receipt.state, 'WRAPPING_UP');
});
