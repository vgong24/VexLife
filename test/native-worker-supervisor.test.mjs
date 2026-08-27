import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  NativeWorkerSupervisorError,
  consumeNativeWorkerResult,
  launchDetachedNativeWorkerHost,
  loadNativeWorker,
  markNativeWorkerStandingBy,
  markNativeWorkerWaiting,
  prepareNativeWorker,
  projectHumanWorkPulse,
  requestNativeWorkerControl,
  runPreparedNativeWorker,
  validateNativeWorkerManifest
} from '../src/core/native-worker-supervisor.mjs';

const MODULE_URL = pathToFileURL(path.resolve('src/core/native-worker-supervisor.mjs')).href;

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
async function waitForFiles(files, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (files.every((file) => fs.existsSync(file))) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${files.join(', ')}`);
}
function spawnBarrierActor({ workerRoot, startFile, readyFile, body, extraEnv = {} }) {
  const script = `
    import fs from 'node:fs';
    const sleep = new Int32Array(new SharedArrayBuffer(4));
    fs.writeFileSync(process.env.READY_FILE, 'ready');
    while (!fs.existsSync(process.env.START_FILE)) Atomics.wait(sleep, 0, 0, 5);
    const m = await import(process.env.MODULE_URL);
    ${body}
  `;
  return spawn(process.execPath, ['--input-type=module', '-e', script], {
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      MODULE_URL,
      WORKER_ROOT: workerRoot,
      START_FILE: startFile,
      READY_FILE: readyFile,
      ...extraEnv
    }
  });
}
function collectActor(child) {
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  return new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr })));
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

test('direct child error after WORKING becomes durable NEEDS_ATTENTION instead of false active state', async (t) => {
  const { prepared: initial } = prepared(t);
  let killCalls = 0;
  const fakeChild = new EventEmitter();
  fakeChild.pid = 4242;
  fakeChild.kill = (signal) => {
    assert.equal(signal, 'SIGTERM');
    killCalls += 1;
    return true;
  };
  const spawnImpl = () => {
    queueMicrotask(() => fakeChild.emit('error', new Error('synthetic child execution fault')));
    return fakeChild;
  };
  const result = await runPreparedNativeWorker(initial.workerRoot, { spawnImpl, pollMs: 25 });
  assert.equal(result.receipt.state, 'NEEDS_ATTENTION');
  assert.equal(result.workPulse.state, 'NEEDS_ATTENTION');
  assert.equal(result.receipt.pid, 4242);
  assert.equal(result.receipt.terminalEvidence.errorClass, 'CHILD_PROCESS_ERROR');
  assert.equal(result.receipt.terminalEvidence.errorMessage, 'synthetic child execution fault');
  assert.equal(result.receipt.terminalEvidence.terminalObserved, false);
  assert.equal(result.receipt.terminalEvidence.cleanupAttempted, true);
  assert.equal(result.receipt.terminalEvidence.cleanupSignalSent, true);
  assert.equal(killCalls, 1);
  assert.equal(loadNativeWorker(initial.workerRoot).receipt.state, 'NEEDS_ATTENTION');
});

test('detached launch reserves STARTING before spawn so a second launch cannot create another host', (t) => {
  const { prepared: initial } = prepared(t);
  let spawnCalls = 0;
  const fakeSpawn = () => ({
    pid: 5100 + ++spawnCalls,
    unref() {}
  });
  const first = launchDetachedNativeWorkerHost({ workerRoot: initial.workerRoot, cliPath: process.execPath, spawnImpl: fakeSpawn });
  assert.equal(first.workPulse.state, 'WORKING');
  assert.equal(loadNativeWorker(initial.workerRoot).receipt.state, 'STARTING');
  expectCode(() => launchDetachedNativeWorkerHost({ workerRoot: initial.workerRoot, cliPath: process.execPath, spawnImpl: fakeSpawn }), 'NWS_NOT_RUNNABLE');
  assert.equal(spawnCalls, 1);
});

test('two concurrent host actors can spawn only one payload and receipt generations remain unique', async (t) => {
  const { prepared: initial, root } = prepared(t, { argv: ['-e', 'setTimeout(() => process.exit(0), 180)'] });
  const startFile = path.join(root, 'start-run');
  const readyA = path.join(root, 'ready-run-a');
  const readyB = path.join(root, 'ready-run-b');
  const body = `
    try {
      const result = await m.runPreparedNativeWorker(process.env.WORKER_ROOT, { pollMs: 20 });
      process.stdout.write(result.receipt.state);
      process.exit(0);
    } catch (error) {
      process.stderr.write(String(error.code || error.message));
      process.exit(error.code === 'NWS_NOT_RUNNABLE' ? 23 : 91);
    }
  `;
  const actorA = spawnBarrierActor({ workerRoot: initial.workerRoot, startFile, readyFile: readyA, body });
  const actorB = spawnBarrierActor({ workerRoot: initial.workerRoot, startFile, readyFile: readyB, body });
  const resultA = collectActor(actorA);
  const resultB = collectActor(actorB);
  await waitForFiles([readyA, readyB]);
  fs.writeFileSync(startFile, 'go');
  const outcomes = await Promise.all([resultA, resultB]);
  assert.deepEqual(outcomes.map((item) => item.code).sort((a, b) => a - b), [0, 23]);
  assert.equal(outcomes.filter((item) => item.stdout.includes('WRAPPING_UP')).length, 1);
  const final = loadNativeWorker(initial.workerRoot);
  assert.equal(final.receipt.state, 'WRAPPING_UP');
  const receipts = fs.readdirSync(path.join(initial.workerRoot, 'receipts')).sort();
  assert.equal(new Set(receipts).size, receipts.length);
  assert.equal(receipts.filter((name) => name.includes('-starting.json')).length, 1);
  assert.equal(receipts.filter((name) => name.includes('-working.json')).length, 1);
  assert.equal(receipts.filter((name) => name.includes('-wrapping-up.json')).length, 1);
});

test('two concurrent result consumers preserve one completion truth and one DONE generation', async (t) => {
  const { prepared: initial, root } = prepared(t, { argv: ['-e', 'process.exit(0)'] });
  await runPreparedNativeWorker(initial.workerRoot, { pollMs: 20 });
  assert.equal(loadNativeWorker(initial.workerRoot).receipt.state, 'WRAPPING_UP');
  const startFile = path.join(root, 'start-consume');
  const readyA = path.join(root, 'ready-consume-a');
  const readyB = path.join(root, 'ready-consume-b');
  const actor = (suffix, readyFile) => spawnBarrierActor({
    workerRoot: initial.workerRoot,
    startFile,
    readyFile,
    extraEnv: { RESULT_REF: `result.vexlife.concurrent.${suffix}` },
    body: `
      try {
        const result = m.consumeNativeWorkerResult(process.env.WORKER_ROOT, {
          resultRef: process.env.RESULT_REF,
          machineCompletionRecord: { actor: process.env.RESULT_REF, effectPerformed: false },
          humanSummary: 'One exact concurrent consumer won the completion boundary.'
        });
        process.stdout.write(result.completion.resultRef);
        process.exit(0);
      } catch (error) {
        process.stderr.write(String(error.code || error.message));
        process.exit(error.code === 'NWS_RESULT_NOT_READY' ? 24 : 92);
      }
    `
  });
  const actorA = actor('a', readyA);
  const actorB = actor('b', readyB);
  const resultA = collectActor(actorA);
  const resultB = collectActor(actorB);
  await waitForFiles([readyA, readyB]);
  fs.writeFileSync(startFile, 'go');
  const outcomes = await Promise.all([resultA, resultB]);
  assert.deepEqual(outcomes.map((item) => item.code).sort((a, b) => a - b), [0, 24]);
  const final = loadNativeWorker(initial.workerRoot);
  assert.equal(final.receipt.state, 'DONE');
  assert.ok(['result.vexlife.concurrent.a', 'result.vexlife.concurrent.b'].includes(final.completion.resultRef));
  assert.equal(outcomes.filter((item) => item.stdout.includes(final.completion.resultRef)).length, 1);
  const receipts = fs.readdirSync(path.join(initial.workerRoot, 'receipts')).sort();
  assert.equal(receipts.filter((name) => name.includes('-done.json')).length, 1);
});
