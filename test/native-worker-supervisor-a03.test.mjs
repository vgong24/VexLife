import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  NATIVE_WORKER_BINDING_SCHEMA,
  NATIVE_WORKER_MANIFEST_SCHEMA,
  loadNativeWorker,
  prepareNativeWorker,
  runPreparedNativeWorker
} from '../src/core/native-worker-supervisor.mjs';

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function fixture(t) {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-nws-a03-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const runtimeRoot = path.join(base, 'runtime');
  const sourceRoot = path.join(base, 'source');
  fs.mkdirSync(runtimeRoot);
  fs.mkdirSync(path.join(sourceRoot, 'worker'), { recursive: true });
  const executablePath = fs.realpathSync.native(process.execPath);
  const manifest = {
    schemaVersion: NATIVE_WORKER_MANIFEST_SCHEMA,
    workerRef: 'worker.vexlife.a03.prepayload',
    workRef: 'work.vexlife.a03.prepayload',
    purposeRef: 'purpose.vexlife.a03.prepayload',
    humanLabel: 'A03 pre-payload host failure proof',
    executableRef: 'runtime.node.a03',
    argv: ['-e', 'process.exit(0)'],
    sourceRootRelativeWorkingDirectory: 'worker',
    schedulingClass: 'BACKGROUND',
    pauseMode: 'CHECKPOINT_BOUND_COOPERATIVE',
    resultContractRef: 'result-contract.vexlife.a03',
    executionAuthorityRef: 'authority.vexlife.a03.no-effect'
  };
  const binding = {
    schemaVersion: NATIVE_WORKER_BINDING_SCHEMA,
    bindingRef: 'binding.vexlife.a03.node',
    executableRef: 'runtime.node.a03',
    executablePath,
    executableSha256: sha256File(executablePath),
    hostRef: 'host.vexlife.a03.synthetic',
    observedAt: '2026-08-27T00:00:00.000Z'
  };
  return prepareNativeWorker({ runtimeRoot, sourceRoot, manifest, binding });
}

test('NWS-A03 caught host-side pre-payload setup failure cannot remain human-visible as Working', async (t) => {
  const prepared = fixture(t);
  fs.mkdirSync(path.join(prepared.workerRoot, 'stdout.log'));

  const result = await runPreparedNativeWorker(prepared.workerRoot, { pollMs: 20 });
  const current = loadNativeWorker(prepared.workerRoot);

  assert.equal(result.receipt.state, 'NEEDS_ATTENTION');
  assert.equal(result.workPulse.state, 'NEEDS_ATTENTION');
  assert.equal(result.workPulse.label, 'Needs attention');
  assert.equal(result.receipt.pid, null);
  assert.equal(result.receipt.terminalEvidence.payloadStarted, false);
  assert.equal(result.receipt.terminalEvidence.errorClass, 'SUPERVISOR_HOST_PRE_PAYLOAD_FAILED');
  assert.equal(result.receipt.terminalEvidence.terminalObserved, false);
  assert.equal(current.receipt.state, 'NEEDS_ATTENTION');
  assert.notEqual(current.workPulse.state, 'WORKING');
});

test('NWS-A04 post-spawn state-write failure requests exact cleanup and records collision-safe attention', async (t) => {
  const prepared = fixture(t);
  const collision = path.join(prepared.workerRoot, 'receipts', '00000003-working.json');
  let payloadSpawns = 0;
  let killCalls = 0;

  const result = await runPreparedNativeWorker(prepared.workerRoot, {
    pollMs: 20,
    spawnImpl: () => {
      payloadSpawns += 1;
      fs.writeFileSync(collision, '{}\n', { flag: 'wx' });
      const child = new EventEmitter();
      child.pid = 7711;
      child.kill = (signal) => {
        assert.equal(signal, 'SIGTERM');
        killCalls += 1;
        return true;
      };
      return child;
    }
  });

  const current = loadNativeWorker(prepared.workerRoot);
  const receipts = fs.readdirSync(path.join(prepared.workerRoot, 'receipts')).sort();
  assert.equal(payloadSpawns, 1);
  assert.equal(killCalls, 1);
  assert.equal(fs.readFileSync(collision, 'utf8'), '{}\n', 'colliding immutable generation is never overwritten');
  assert.equal(result.receipt.state, 'NEEDS_ATTENTION');
  assert.equal(result.workPulse.state, 'NEEDS_ATTENTION');
  assert.equal(result.receipt.pid, 7711);
  assert.equal(result.receipt.generation, 4, 'recovery skips the occupied generation rather than reusing it');
  assert.equal(result.receipt.terminalEvidence.payloadStarted, true);
  assert.equal(result.receipt.terminalEvidence.errorClass, 'WORKING_STATE_PERSIST_FAILED');
  assert.equal(result.receipt.terminalEvidence.statePersistenceErrorCode, 'NWS_RECEIPT_COLLISION');
  assert.equal(result.receipt.terminalEvidence.cleanupAttempted, true);
  assert.equal(result.receipt.terminalEvidence.cleanupSignalSent, true);
  assert.equal(result.receipt.terminalEvidence.terminalObserved, false);
  assert.equal(current.receipt.state, 'NEEDS_ATTENTION');
  assert.equal(current.workPulse.state, 'NEEDS_ATTENTION');
  assert.ok(receipts.includes('00000004-needs-attention.json'));
});

// [VXG RealForever]
