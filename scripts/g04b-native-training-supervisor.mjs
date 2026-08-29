#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadFoundationTrainingPlan } from './foundation-training-plan.mjs';
import { verifyG04BNativeWorkerEnvelope } from '../src/core/g04b-native-training-worker.mjs';
import {
  G04BTerminalEvidenceError,
  verifyG04BPersistedMachineResult,
  verifyG04BTerminalEvidence
} from '../src/core/g04b-native-training-terminal.mjs';
import {
  consumeNativeWorkerResult,
  loadNativeWorker,
  runPreparedNativeWorker
} from '../src/core/native-worker-supervisor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = path.resolve(HERE, '..');
const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;
const args = process.argv.slice(2);
const command = args[0] ?? 'host';
const value = (name) => {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
};
const required = (name) => {
  const result = value(name);
  if (!result) throw new Error(`${name} is required`);
  return result;
};

function fail(code, message, details = null) {
  throw new G04BTerminalEvidenceError(code, message, details);
}

function exactSourcePath(raw, label) {
  if (typeof raw !== 'string' || !raw || path.isAbsolute(raw)) {
    fail('G04B_SUPERVISOR_SOURCE_PATH_INVALID', `${label} must be source-root-relative`);
  }
  const source = fs.realpathSync.native(SOURCE_ROOT);
  const target = path.resolve(source, raw);
  const relative = path.relative(source, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('G04B_SUPERVISOR_SOURCE_PATH_INVALID', `${label} escapes source root`, { raw });
  }
  if (!fs.existsSync(target)) fail('G04B_SUPERVISOR_SOURCE_PATH_INVALID', `${label} is missing`, { target });
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    fail('G04B_SUPERVISOR_SOURCE_PATH_INVALID', `${label} must be one regular non-symlink source file`, { target });
  }
  const real = fs.realpathSync.native(target);
  if (real !== target) fail('G04B_SUPERVISOR_SOURCE_PATH_INVALID', `${label} path is not canonical`, { target, real });
  return target;
}

function packetRelativePathFromWorker(workerRoot) {
  const loaded = loadNativeWorker(workerRoot);
  const argv = loaded.manifest?.argv;
  if (!Array.isArray(argv)
      || argv.length !== 4
      || argv[0] !== 'g04b-native-training-worker.mjs'
      || argv[1] !== 'run'
      || argv[2] !== '--packet'
      || typeof argv[3] !== 'string'
      || !argv[3]) {
    fail('G04B_SUPERVISOR_MANIFEST_MISMATCH', 'NWS manifest argv is not the exact G04B run route', { argv });
  }
  return argv[3];
}

function loadPacket(relativePath) {
  const file = exactSourcePath(relativePath, 'G04B packet');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail('G04B_SUPERVISOR_PACKET_INVALID', 'G04B packet is not valid JSON', { cause: error.message });
  }
}

function appendCapture(capture, chunk) {
  if (capture.error) return;
  const bytes = Buffer.from(chunk);
  capture.bytes += bytes.length;
  if (capture.bytes > MAX_CAPTURE_BYTES) {
    capture.error = new G04BTerminalEvidenceError(
      'G04B_SUPERVISOR_CAPTURE_TOO_LARGE',
      `G04B payload stdout exceeded ${MAX_CAPTURE_BYTES} bytes`
    );
    return;
  }
  capture.chunks.push(bytes);
}

function parseCapturedResult(capture) {
  if (capture.error) {
    if (capture.error instanceof G04BTerminalEvidenceError) throw capture.error;
    fail('G04B_SUPERVISOR_CAPTURE_FAILED', 'failed to preserve NWS-owned stdout capture', { cause: capture.error.message });
  }
  const text = Buffer.concat(capture.chunks).toString('utf8').trim();
  if (!text) fail('G04B_SUPERVISOR_RESULT_MISSING', 'G04B payload returned no terminal JSON');
  try {
    const result = JSON.parse(text);
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      fail('G04B_SUPERVISOR_RESULT_INVALID', 'G04B terminal stdout must be one JSON object');
    }
    return result;
  } catch (error) {
    if (error instanceof G04BTerminalEvidenceError) throw error;
    fail('G04B_SUPERVISOR_RESULT_INVALID', 'G04B terminal stdout is not one JSON object', {
      cause: error.message,
      output: text.slice(0, 1000)
    });
  }
}

function appendSupervisorValidationError(stderrFd, error) {
  const payload = error instanceof G04BTerminalEvidenceError
    ? { schemaVersion: 'vexlife.g04b-native-training-supervisor-error/v1', code: error.code, error: error.message, details: error.details }
    : { schemaVersion: 'vexlife.g04b-native-training-supervisor-error/v1', code: 'G04B_SUPERVISOR_UNEXPECTED', error: error?.message ?? String(error) };
  try {
    fs.writeSync(stderrFd, `${JSON.stringify(payload)}\n`);
  } catch {}
}

function makeVerifiedCapturingSpawn({
  packet,
  workerRoot,
  capture,
  spawnImpl = spawn
}) {
  return (executable, argv, options = {}) => {
    const stdoutFd = options.stdio?.[1];
    const stderrFd = options.stdio?.[2];
    if (!Number.isInteger(stdoutFd) || !Number.isInteger(stderrFd)) {
      fail('G04B_SUPERVISOR_STDIO_INVALID', 'NWS did not provide exact owned stdout/stderr file descriptors');
    }

    const child = spawnImpl(executable, argv, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const proxy = new EventEmitter();
    proxy.pid = child.pid;
    proxy.kill = (...killArgs) => child.kill(...killArgs);

    child.stdout.on('data', (chunk) => {
      try {
        fs.writeSync(stdoutFd, chunk);
        appendCapture(capture.stdout, chunk);
        if (capture.stdout.error) child.kill('SIGTERM');
      } catch (error) {
        capture.stdout.error = error;
        try { child.kill('SIGTERM'); } catch {}
      }
    });
    child.stderr.on('data', (chunk) => {
      try {
        fs.writeSync(stderrFd, chunk);
      } catch (error) {
        capture.stderrError = error;
        try { child.kill('SIGTERM'); } catch {}
      }
    });
    child.once('error', (error) => proxy.emit('error', error));
    child.once('close', (code, signal) => {
      if (code === 0 && !signal) {
        try {
          if (capture.stderrError) {
            fail('G04B_SUPERVISOR_CAPTURE_FAILED', 'failed to preserve NWS-owned stderr capture', { cause: capture.stderrError.message });
          }
          const capturedResult = parseCapturedResult(capture.stdout);
          const terminal = verifyG04BTerminalEvidence(packet, capturedResult, {
            sourceRoot: SOURCE_ROOT,
            planValidator: loadFoundationTrainingPlan
          });
          verifyG04BPersistedMachineResult(workerRoot, terminal.result, packet);
          capture.sealedResult = terminal.canonicalResult;
        } catch (error) {
          capture.validationError = error;
          appendSupervisorValidationError(stderrFd, error);
          proxy.emit('close', 2, null);
          return;
        }
      }
      proxy.emit('close', code, signal);
    });
    return proxy;
  };
}

export async function runG04BNativeTrainingSupervisorHost(workerRoot, {
  launchRef,
  spawnImpl = spawn
} = {}) {
  const root = path.resolve(workerRoot);
  const packetRelativePath = packetRelativePathFromWorker(root);
  const packet = loadPacket(packetRelativePath);
  verifyG04BNativeWorkerEnvelope(packet, root);

  const capture = {
    stdout: { chunks: [], bytes: 0, error: null },
    stderrError: null,
    validationError: null,
    sealedResult: null
  };
  const terminal = await runPreparedNativeWorker(root, {
    launchRef,
    spawnImpl: makeVerifiedCapturingSpawn({ packet, workerRoot: root, capture, spawnImpl })
  });

  if (capture.validationError) throw capture.validationError;
  if (terminal.receipt.state !== 'WRAPPING_UP') return terminal;
  if (!capture.sealedResult) {
    fail('G04B_SUPERVISOR_SEAL_MISSING', 'NWS reached WRAPPING_UP without an independently captured and verified G04B result');
  }

  return consumeNativeWorkerResult(root, {
    resultRef: packet.resultRef,
    machineCompletionRecord: capture.sealedResult,
    humanSummary: 'G04B real training/evaluation result returned; semantic candidate disposition remains separate.'
  });
}

async function main() {
  if (command !== 'host') throw new Error('usage: g04b-native-training-supervisor.mjs host --worker-root <path> --launch-ref <ref>');
  return runG04BNativeTrainingSupervisorHost(
    path.resolve(required('--worker-root')),
    { launchRef: required('--launch-ref') }
  );
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error) => {
    const payload = error instanceof G04BTerminalEvidenceError
      ? { schemaVersion: 'vexlife.g04b-native-training-supervisor-error/v1', code: error.code, error: error.message, details: error.details }
      : { schemaVersion: 'vexlife.g04b-native-training-supervisor-error/v1', code: 'G04B_SUPERVISOR_UNEXPECTED', error: error?.message ?? String(error) };
    process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exitCode = 2;
  });
}

// [VXG RealForever]
