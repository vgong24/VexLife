#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  consumeNativeWorkerResult,
  launchDetachedNativeWorkerHost,
  loadNativeWorker,
  markNativeWorkerStandingBy,
  markNativeWorkerWaiting,
  prepareNativeWorker,
  requestNativeWorkerControl,
  runPreparedNativeWorker
} from '../src/core/native-worker-supervisor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = path.resolve(HERE, '..');
const args = process.argv.slice(2);
const command = args[0] ?? 'status';
const value = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
};
const required = (name) => {
  const result = value(name);
  if (!result) throw new Error(`${name} is required`);
  return result;
};
const readJson = (file) => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
const print = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

async function main() {
  if (command === 'prepare') {
    print(prepareNativeWorker({
      runtimeRoot: required('--runtime-root'),
      sourceRoot: value('--source-root', SOURCE_ROOT),
      manifest: readJson(required('--manifest')),
      binding: readJson(required('--binding'))
    }));
    return;
  }
  const workerRoot = required('--worker-root');
  if (command === 'start') {
    print(launchDetachedNativeWorkerHost({ workerRoot, cliPath: fileURLToPath(import.meta.url) }));
    return;
  }
  if (command === 'host') {
    print(await runPreparedNativeWorker(workerRoot, { launchRef: required('--launch-ref') }));
    return;
  }
  if (command === 'status') {
    print(loadNativeWorker(workerRoot));
    return;
  }
  if (command === 'pause') {
    print(requestNativeWorkerControl(workerRoot, 'PAUSE'));
    return;
  }
  if (command === 'cancel') {
    print(requestNativeWorkerControl(workerRoot, 'CANCEL'));
    return;
  }
  if (command === 'wait') {
    print(markNativeWorkerWaiting(workerRoot, required('--reason')));
    return;
  }
  if (command === 'standby') {
    print(markNativeWorkerStandingBy(workerRoot));
    return;
  }
  if (command === 'consume') {
    print(consumeNativeWorkerResult(workerRoot, {
      resultRef: required('--result-ref'),
      machineCompletionRecord: readJson(required('--machine-record')),
      humanSummary: required('--human-summary')
    }));
    return;
  }
  throw new Error(`unsupported command ${command}`);
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.code ?? 'NWS_CLI_ERROR'}: ${error.message}\n`);
    process.exitCode = 2;
  });
}

// [VXG RealForever]
