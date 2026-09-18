#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFoundationTrainingPlan } from './foundation-training-plan.mjs';
import {
  buildG04BNativeWorkerManifest,
  executeG04BNativeTrainingWorker,
  G04BNativeTrainingWorkerError,
  verifyG04BNodeRuntimeBinding
} from '../src/core/g04b-native-training-worker.mjs';
import {
  G04BTerminalEvidenceError,
  verifyG04BTerminalEvidence
} from '../src/core/g04b-native-training-terminal.mjs';
import {
  launchDetachedNativeWorkerHost,
  prepareNativeWorker
} from '../src/core/native-worker-supervisor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = path.resolve(HERE, '..');
const G04B_SUPERVISOR_CLI = path.join(HERE, 'g04b-native-training-supervisor.mjs');
const args = process.argv.slice(2);
const command = args[0] ?? 'help';
const value = (name) => {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
};
const required = (name) => {
  const result = value(name);
  if (!result) throw new Error(`${name} is required`);
  return result;
};

function exactSourcePath(raw, label) {
  if (typeof raw !== 'string' || !raw || path.isAbsolute(raw)) throw new Error(`${label} must be source-root-relative`);
  const target = path.resolve(SOURCE_ROOT, raw);
  const relative = path.relative(SOURCE_ROOT, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`${label} escapes source root`);
  return target;
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadPacket(raw) {
  return loadJson(exactSourcePath(raw, '--packet'));
}

function print(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function main() {
  if (command === 'manifest') {
    const packetRelativePath = required('--packet');
    const packet = loadPacket(packetRelativePath);
    print(buildG04BNativeWorkerManifest(packet, { packetRelativePath }));
    return 0;
  }
  if (command === 'prepare') {
    const packetRelativePath = required('--packet');
    const packet = loadPacket(packetRelativePath);
    const suppliedBinding = loadJson(path.resolve(required('--node-binding')));
    const { binding } = verifyG04BNodeRuntimeBinding(packet, suppliedBinding, { verifyExecutable: true });
    const manifest = buildG04BNativeWorkerManifest(packet, { packetRelativePath });
    print(prepareNativeWorker({
      runtimeRoot: path.resolve(required('--runtime-root')),
      sourceRoot: SOURCE_ROOT,
      manifest,
      binding
    }));
    return 0;
  }
  if (command === 'start') {
    print(launchDetachedNativeWorkerHost({
      workerRoot: path.resolve(required('--worker-root')),
      cliPath: G04B_SUPERVISOR_CLI
    }));
    return 0;
  }
  if (command === 'run') {
    const packet = loadPacket(required('--packet'));
    const result = await executeG04BNativeTrainingWorker(packet, {
      sourceRoot: SOURCE_ROOT,
      planValidator: loadFoundationTrainingPlan
    });
    if (result?.schemaVersion === 'vexlife.g04b-native-training-worker-yield/v1') {
      print(result);
      return 75;
    }
    const terminal = verifyG04BTerminalEvidence(packet, result, {
      sourceRoot: SOURCE_ROOT,
      planValidator: loadFoundationTrainingPlan
    });
    print(terminal.result);
    return 0;
  }
  if (command === 'consume') {
    throw new G04BTerminalEvidenceError(
      'G04B_UNSEALED_STANDALONE_CONSUME_FORBIDDEN',
      'standalone WRAPPING_UP consumption is not trusted; the G04B supervisor must consume its independently captured terminal result in the same host process'
    );
  }
  throw new Error('usage: g04b-native-training-worker.mjs manifest|prepare|start|run|consume ...');
}

main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  const payload = error instanceof G04BNativeTrainingWorkerError || error instanceof G04BTerminalEvidenceError
    ? { schemaVersion: 'vexlife.g04b-native-training-worker-error/v1', code: error.code, error: error.message, details: error.details }
    : { schemaVersion: 'vexlife.g04b-native-training-worker-error/v1', code: 'G04B_WORKER_UNEXPECTED', error: error?.message ?? String(error) };
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = 2;
});
