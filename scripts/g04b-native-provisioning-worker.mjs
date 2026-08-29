#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { downloadVerifiedArtifact } from '../src/core/model-provision.mjs';
import {
  buildG04BProvisioningWorkerManifest,
  executeG04BProvisioningWorker,
  G04BProvisioningWorkerError,
  verifyG04BProvisioningEnvelope,
  verifyG04BProvisioningNodeRuntimeBinding,
  verifyG04BProvisioningResult,
  validateG04BProvisioningPacket
} from '../src/core/g04b-native-provisioning-worker.mjs';
import {
  consumeNativeWorkerResult,
  launchDetachedNativeWorkerHost,
  prepareNativeWorker
} from '../src/core/native-worker-supervisor.mjs';
import { assertSafeMacExtractedTree, assertSafeMacTarArchive } from './macos-lifecycle.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = path.resolve(HERE, '..');
const NWS_CLI = path.join(HERE, 'native-worker-supervisor.mjs');
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
function loadJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function loadPacket(raw) { return validateG04BProvisioningPacket(loadJson(exactSourcePath(raw, '--packet'))); }
function print(payload) { process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`); }

async function extractMacRuntime({ archivePath, stagingRoot, runtimeArtifact }) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('G04B first provisioning runtime extraction requires darwin/arm64');
  if (runtimeArtifact.archiveClass !== 'POSIX_TAR_GZ') throw new Error('unsupported runtime archive class');
  assertSafeMacTarArchive(archivePath);
  const result = spawnSync('/usr/bin/tar', ['-xzf', archivePath, '-C', stagingRoot], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: false
  });
  if (result.error || result.status !== 0) throw new Error(`Python runtime archive extraction failed: ${result.stderr || result.error?.message || 'unknown error'}`);
  assertSafeMacExtractedTree(stagingRoot);
}

async function main() {
  if (command === 'manifest') {
    const packetRelativePath = required('--packet');
    print(buildG04BProvisioningWorkerManifest(loadPacket(packetRelativePath), { packetRelativePath }));
    return 0;
  }
  if (command === 'prepare') {
    const packetRelativePath = required('--packet');
    const packet = loadPacket(packetRelativePath);
    const suppliedBinding = loadJson(path.resolve(required('--node-binding')));
    verifyG04BProvisioningNodeRuntimeBinding(packet, suppliedBinding, { verifyExecutable: true });
    const manifest = buildG04BProvisioningWorkerManifest(packet, { packetRelativePath });
    print(prepareNativeWorker({
      runtimeRoot: path.resolve(required('--runtime-root')),
      sourceRoot: SOURCE_ROOT,
      manifest,
      binding: suppliedBinding
    }));
    return 0;
  }
  if (command === 'start') {
    print(launchDetachedNativeWorkerHost({ workerRoot: path.resolve(required('--worker-root')), cliPath: NWS_CLI }));
    return 0;
  }
  if (command === 'run') {
    const packet = loadPacket(required('--packet'));
    print(await executeG04BProvisioningWorker(packet, {
      downloadArtifact: downloadVerifiedArtifact,
      extractRuntime: extractMacRuntime
    }));
    return 0;
  }
  if (command === 'consume') {
    const packet = loadPacket(required('--packet'));
    const workerRoot = path.resolve(required('--worker-root'));
    verifyG04BProvisioningEnvelope(packet, workerRoot);
    const result = verifyG04BProvisioningResult(loadJson(path.join(workerRoot, 'g04b-provisioning-result.json')), packet);
    print(consumeNativeWorkerResult(workerRoot, {
      resultRef: packet.resultRef,
      machineCompletionRecord: result,
      humanSummary: 'G04B exact runtime/model pre-provisioning completed; training remains separately held.'
    }));
    return 0;
  }
  throw new Error('usage: g04b-native-provisioning-worker.mjs manifest|prepare|start|run|consume ...');
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  const payload = error instanceof G04BProvisioningWorkerError
    ? { schemaVersion: 'vexlife.g04b-provisioning-error/v1', code: error.code, error: error.message, details: error.details }
    : { schemaVersion: 'vexlife.g04b-provisioning-error/v1', code: 'G04B_PROVISION_UNEXPECTED', error: error?.message ?? String(error) };
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = 2;
});
