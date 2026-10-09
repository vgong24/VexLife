#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ANDROID_DEVICE_HOST_OPERATIONS,
  ANDROID_DEVICE_STATES,
  adbForDevice,
  assertHostCommandSafety,
  buildInstallUpdateCommands,
  classifyAdbInventory,
  createAndroidDeviceHostContractSummary,
  durableDeviceProjection,
  parseAdbDevicesList,
  typedCommand,
  verifyBufferIdentity,
} from '../src/core/android-device-host.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const DEFAULT_LAUNCH_SETTLE_TIMEOUT_MS = 12000;
const DEFAULT_LAUNCH_POLL_INTERVAL_MS = 250;

function existsExecutable(candidate) {
  try { fs.accessSync(candidate, fs.constants.X_OK); return true; } catch { return false; }
}

function sleepMs(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

export function resolveAdbPath({ env = process.env, which = spawnSync } = {}) {
  const roots = [env.ANDROID_HOME, env.ANDROID_SDK_ROOT].filter(Boolean);
  const candidates = roots.map((root) => path.join(root, 'platform-tools', 'adb'));
  const whichResult = which('/usr/bin/env', ['which', 'adb'], { encoding: 'utf8', shell: false });
  if (whichResult.status === 0 && whichResult.stdout?.trim()) candidates.push(whichResult.stdout.trim());
  candidates.push(
    '/opt/homebrew/share/android-commandlinetools/platform-tools/adb',
    '/opt/homebrew/bin/adb',
    '/usr/local/bin/adb',
  );
  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    if (existsExecutable(candidate)) return fs.realpathSync.native(candidate);
  }
  throw new Error('ANDROID_DEVICE_HOST_ADB_NOT_FOUND');
}

export function runTyped(command, { spawn = spawnSync, encoding = 'utf8', allowFailure = false, timeout = 30000 } = {}) {
  const result = spawn(command.program, [...command.args], {
    encoding,
    shell: false,
    timeout,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const status = Number.isInteger(result.status) ? result.status : null;
  const stderr = result.error?.message ?? result.stderr ?? (encoding === null ? Buffer.alloc(0) : '');
  if (!allowFailure && (result.error || status !== 0)) {
    const detail = Buffer.isBuffer(stderr) ? stderr.toString('utf8').trim() : String(stderr).trim();
    throw new Error(`${command.label} failed: ${detail || `exit ${status}`}`);
  }
  return { status, stdout: result.stdout ?? (encoding === null ? Buffer.alloc(0) : ''), stderr };
}

function argsObject(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value == null) throw new Error('ANDROID_DEVICE_HOST_ARGUMENT_SHAPE_INVALID');
    result[key.slice(2)] = value;
  }
  return result;
}

function sha256File(filePath) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('ANDROID_DEVICE_HOST_APK_MUST_BE_REGULAR_FILE');
  const canonicalPath = fs.realpathSync.native(filePath);
  const bytes = fs.readFileSync(canonicalPath);
  return { canonicalPath, bytes, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

function captureFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, data);
  const bytes = fs.readFileSync(filePath);
  return { path: filePath, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

function foregroundMatches(output, packageName, component) {
  const text = String(output ?? '');
  return text.includes(packageName) || text.includes(component);
}

export function settleAndroidLaunchReadiness({
  commands,
  packageName,
  component,
  spawn = spawnSync,
  now = Date.now,
  sleep = sleepMs,
  timeoutMs = DEFAULT_LAUNCH_SETTLE_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_LAUNCH_POLL_INTERVAL_MS,
} = {}) {
  if (!commands?.pid || !commands?.foreground) throw new Error('ANDROID_DEVICE_HOST_READINESS_COMMANDS_REQUIRED');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) throw new Error('ANDROID_DEVICE_HOST_LAUNCH_TIMEOUT_INVALID');
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1) throw new Error('ANDROID_DEVICE_HOST_LAUNCH_POLL_INTERVAL_INVALID');
  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  let attempts = 0;
  let pidObserved = false;
  let foregroundObserved = false;

  while (true) {
    attempts += 1;
    const pidResult = runTyped(commands.pid, { spawn, allowFailure: true });
    const pid = pidResult.status === 0 ? String(pidResult.stdout ?? '').trim().split(/\s+/u)[0] || null : null;
    if (pid) pidObserved = true;

    const foregroundResult = runTyped(commands.foreground, { spawn, allowFailure: true });
    if (foregroundResult.status === 0 && foregroundMatches(foregroundResult.stdout, packageName, component)) {
      foregroundObserved = true;
    }

    const observedAt = now();
    if (pidObserved && foregroundObserved) {
      return Object.freeze({
        state: 'SETTLED',
        attempts,
        elapsedMs: Math.max(0, observedAt - startedAt),
        pidObserved,
        foregroundObserved,
      });
    }
    const remaining = deadline - observedAt;
    if (remaining <= 0) {
      return Object.freeze({
        state: 'UNCONFIRMED',
        attempts,
        elapsedMs: Math.max(0, observedAt - startedAt),
        pidObserved,
        foregroundObserved,
      });
    }
    sleep(Math.min(pollIntervalMs, remaining));
  }
}

export function runAndroidDeviceHost(options, dependencies = {}) {
  const spawn = dependencies.spawn ?? spawnSync;
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? sleepMs;
  const adbPath = options.adbPath ?? resolveAdbPath({ env: dependencies.env ?? process.env, which: spawn });
  const operation = options.operation ?? ANDROID_DEVICE_HOST_OPERATIONS.OBSERVE;
  if (!Object.values(ANDROID_DEVICE_HOST_OPERATIONS).includes(operation)) throw new Error('ANDROID_DEVICE_HOST_OPERATION_INVALID');

  runTyped(typedCommand(adbPath, ['start-server'], 'start adb server'), { spawn });
  const inventoryResult = runTyped(typedCommand(adbPath, ['devices', '-l'], 'observe adb devices'), { spawn });
  const devices = parseAdbDevicesList(inventoryResult.stdout);
  const classification = classifyAdbInventory(devices);
  const durableDevice = durableDeviceProjection(classification);
  const baseReceipt = {
    schemaVersion: 'vexlife.android-device-host-receipt/v1',
    operation,
    state: classification.state,
    device: durableDevice,
    app: null,
    capture: null,
    effects: {
      adbServerObservedOrStarted: true,
      installPerformed: false,
      launchPerformed: false,
      capturePerformed: false,
      uninstallPerformed: false,
      userDataClearPerformed: false,
      networkConfigurationPerformed: false,
      pairingPerformed: false,
      homeEffectPerformed: false,
      keyEffectPerformed: false,
      modelEffectPerformed: false,
    },
    contract: createAndroidDeviceHostContractSummary(),
  };
  if (classification.state !== ANDROID_DEVICE_STATES.AUTHORIZED) return Object.freeze(baseReceipt);
  const serial = classification.selected.serial;
  const qemu = runTyped(adbForDevice(adbPath, serial, ['shell', 'getprop', 'ro.kernel.qemu'], 'observe emulator state'), { spawn }).stdout.trim();
  if (qemu === '1') return Object.freeze({ ...baseReceipt, state: 'EMULATOR_NOT_ADMITTED' });
  const model = runTyped(adbForDevice(adbPath, serial, ['shell', 'getprop', 'ro.product.model'], 'observe device model'), { spawn }).stdout.trim();
  const api = runTyped(adbForDevice(adbPath, serial, ['shell', 'getprop', 'ro.build.version.sdk'], 'observe Android API'), { spawn }).stdout.trim();

  if (options.expectedModel && model !== options.expectedModel) throw new Error(`ANDROID_DEVICE_HOST_MODEL_MISMATCH:${model}`);
  if (options.expectedApi && api !== String(options.expectedApi)) throw new Error(`ANDROID_DEVICE_HOST_API_MISMATCH:${api}`);
  const receipt = { ...baseReceipt, state: 'AUTHORIZED_PHYSICAL_DEVICE', device: { ...durableDevice, model, api } };
  if (operation === ANDROID_DEVICE_HOST_OPERATIONS.OBSERVE) return Object.freeze(receipt);

  const packageName = options.packageName;
  const component = options.component;
  if (!packageName || !component) throw new Error('ANDROID_DEVICE_HOST_APP_IDENTITY_REQUIRED');
  const commands = buildInstallUpdateCommands({ adbPath, serial, packageName, component, apkPath: options.apkPath ?? '/not-used' });
  assertHostCommandSafety(commands);
  const prior = runTyped(commands.observeInstall, { spawn, allowFailure: true });
  const priorInstalled = prior.status === 0 && String(prior.stdout).includes('package:');

  if (operation === ANDROID_DEVICE_HOST_OPERATIONS.INSTALL_UPDATE_LAUNCH) {
    if (!options.apkPath || !Number.isSafeInteger(options.expectedApkBytes) || !SHA256.test(options.expectedApkSha256 ?? '')) {
      throw new Error('ANDROID_DEVICE_HOST_APK_IDENTITY_REQUIRED');
    }
    const apk = sha256File(options.apkPath);
    verifyBufferIdentity(apk.bytes, { expectedBytes: options.expectedApkBytes, expectedSha256: options.expectedApkSha256 });
    const exactCommands = buildInstallUpdateCommands({ adbPath, serial, packageName, component, apkPath: apk.canonicalPath });
    assertHostCommandSafety(exactCommands);
    runTyped(exactCommands.installUpdate, { spawn, timeout: 120000 });
    runTyped(exactCommands.forceStop, { spawn });
    runTyped(exactCommands.launch, { spawn });
    const readiness = settleAndroidLaunchReadiness({
      commands: exactCommands,
      packageName,
      component,
      spawn,
      now,
      sleep,
      timeoutMs: options.launchSettleTimeoutMs ?? DEFAULT_LAUNCH_SETTLE_TIMEOUT_MS,
      pollIntervalMs: options.launchPollIntervalMs ?? DEFAULT_LAUNCH_POLL_INTERVAL_MS,
    });
    const effects = { ...receipt.effects, installPerformed: true, launchPerformed: true };
    const app = {
      packageName,
      component,
      priorInstalled,
      apkBytes: apk.bytes.length,
      apkSha256: apk.sha256,
      pidObserved: readiness.pidObserved,
      foregroundObserved: readiness.foregroundObserved,
      readinessAttempts: readiness.attempts,
      readinessElapsedMs: readiness.elapsedMs,
    };
    return Object.freeze({
      ...receipt,
      state: readiness.state === 'SETTLED' ? 'INSTALL_UPDATE_LAUNCH_PASS' : 'INSTALL_UPDATE_LAUNCH_UNCONFIRMED',
      app,
      effects,
    });
  }

  const pidResult = runTyped(commands.pid, { spawn, allowFailure: true });
  const pid = String(pidResult.stdout ?? '').trim().split(/\s+/u)[0] || null;
  if (!pid) throw new Error('ANDROID_DEVICE_HOST_CAPTURE_REQUIRES_RUNNING_APP');
  const outDir = options.outDir;
  if (!outDir) throw new Error('ANDROID_DEVICE_HOST_CAPTURE_OUT_DIR_REQUIRED');
  const screenshot = runTyped(adbForDevice(adbPath, serial, ['exec-out', 'screencap', '-p'], 'capture screenshot'), { spawn, encoding: null, timeout: 30000 });
  const hierarchy = runTyped(adbForDevice(adbPath, serial, ['exec-out', 'uiautomator', 'dump', '/dev/tty'], 'capture UI hierarchy'), { spawn, timeout: 30000 });
  const logs = runTyped(adbForDevice(adbPath, serial, ['logcat', '-d', '--pid', pid, '-v', 'threadtime', '-t', '400'], 'capture bounded app logs'), { spawn, timeout: 30000 });
  const captures = {
    screenshot: captureFile(path.join(outDir, 'screenshot.png'), screenshot.stdout),
    hierarchy: captureFile(path.join(outDir, 'ui.xml'), hierarchy.stdout),
    appLog: captureFile(path.join(outDir, 'app-log.txt'), logs.stdout),
  };
  return Object.freeze({
    ...receipt,
    state: 'CAPTURE_PASS',
    app: { packageName, component, priorInstalled, pidObserved: true },
    capture: captures,
    effects: { ...receipt.effects, capturePerformed: true },
  });
}

function main() {
  const args = argsObject(process.argv.slice(2));
  const operation = args.operation ?? ANDROID_DEVICE_HOST_OPERATIONS.OBSERVE;
  const result = runAndroidDeviceHost({
    operation,
    adbPath: args.adb,
    packageName: args.package,
    component: args.component,
    apkPath: args.apk,
    expectedApkBytes: args['apk-bytes'] ? Number(args['apk-bytes']) : undefined,
    expectedApkSha256: args['apk-sha256'],
    expectedModel: args['expect-model'],
    expectedApi: args['expect-api'],
    outDir: args['out-dir'],
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (![ANDROID_DEVICE_STATES.AUTHORIZED, 'AUTHORIZED_PHYSICAL_DEVICE', 'INSTALL_UPDATE_LAUNCH_PASS', 'CAPTURE_PASS'].includes(result.state)) process.exitCode = 3;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(JSON.stringify({ state: 'FAIL', error: error.message }, null, 2)); process.exitCode = 1; }
}

// [VXG RealForever]
