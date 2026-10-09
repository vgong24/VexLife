import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  ANDROID_DEVICE_HOST_OPERATIONS,
  ANDROID_DEVICE_STATES,
  buildInstallUpdateCommands,
  classifyAdbInventory,
  createAndroidDeviceHostContractSummary,
  durableDeviceProjection,
  parseAdbDevicesList,
  verifyBufferIdentity,
} from '../src/core/android-device-host.mjs';
import { runAndroidDeviceHost } from '../scripts/android-device-host.mjs';

function adbInventory(lines) { return `List of devices attached\n${lines}\n`; }

function sequenceValue(sequence, index, fallback) {
  if (!Array.isArray(sequence) || sequence.length === 0) return fallback;
  return sequence[Math.min(index, sequence.length - 1)];
}

function fakeSpawn({
  inventory = adbInventory('SERIAL123\tdevice product:dm3q model:SM-S908U device:dm3q transport_id:1'),
  priorInstalled = true,
  pidSequence = ['4242\n'],
  foregroundSequence = ['mResumedActivity com.example/.MainActivity\n'],
} = {}) {
  const calls = [];
  let pidIndex = 0;
  let foregroundIndex = 0;
  const spawn = (program, args, options) => {
    calls.push({ program, args: [...args], shell: options.shell });
    const joined = args.join(' ');
    if (joined === 'start-server') return { status: 0, stdout: '', stderr: '' };
    if (joined === 'devices -l') return { status: 0, stdout: inventory, stderr: '' };
    if (joined.includes('getprop ro.kernel.qemu')) return { status: 0, stdout: '0\n', stderr: '' };
    if (joined.includes('getprop ro.product.model')) return { status: 0, stdout: 'SM-S908U\n', stderr: '' };
    if (joined.includes('getprop ro.build.version.sdk')) return { status: 0, stdout: '36\n', stderr: '' };
    if (joined.includes('shell pm path')) return priorInstalled ? { status: 0, stdout: 'package:/data/app/base.apk\n', stderr: '' } : { status: 1, stdout: '', stderr: 'not found' };
    if (joined.includes(' install -r ')) return { status: 0, stdout: 'Success\n', stderr: '' };
    if (joined.includes('shell am force-stop')) return { status: 0, stdout: '', stderr: '' };
    if (joined.includes('shell am start -n')) return { status: 0, stdout: 'Starting: Intent\n', stderr: '' };
    if (joined.includes('shell pidof')) {
      const value = sequenceValue(pidSequence, pidIndex++, '4242\n');
      return value == null ? { status: 1, stdout: '', stderr: 'not ready' } : { status: 0, stdout: value, stderr: '' };
    }
    if (joined.includes('shell dumpsys activity activities')) {
      const value = sequenceValue(foregroundSequence, foregroundIndex++, 'mResumedActivity com.example/.MainActivity\n');
      return value == null ? { status: 1, stdout: '', stderr: 'not ready' } : { status: 0, stdout: value, stderr: '' };
    }
    throw new Error(`unexpected fake command ${program} ${joined}`);
  };
  return { spawn, calls };
}

function fakeClock() {
  let current = 0;
  return {
    now: () => current,
    sleep(milliseconds) { current += milliseconds; },
  };
}

function apkFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahf00-'));
  const apkPath = path.join(dir, 'app.apk');
  fs.writeFileSync(apkPath, 'exact-apk');
  const bytes = fs.readFileSync(apkPath);
  const identity = { expectedApkBytes: bytes.length, expectedApkSha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  return { dir, apkPath, identity };
}

test('AHF00-01 parses and classifies zero, unauthorized, offline, multiple and one authorized target', () => {
  assert.equal(classifyAdbInventory(parseAdbDevicesList(adbInventory(''))).state, ANDROID_DEVICE_STATES.ABSENT);
  assert.equal(classifyAdbInventory(parseAdbDevicesList(adbInventory('A\tunauthorized'))).state, ANDROID_DEVICE_STATES.UNAUTHORIZED);
  assert.equal(classifyAdbInventory(parseAdbDevicesList(adbInventory('A\toffline'))).state, ANDROID_DEVICE_STATES.OFFLINE);
  assert.equal(classifyAdbInventory(parseAdbDevicesList(adbInventory('A\tdevice\nB\tdevice'))).state, ANDROID_DEVICE_STATES.MULTIPLE);
  assert.equal(classifyAdbInventory(parseAdbDevicesList(adbInventory('A\tdevice model:Phone'))).state, ANDROID_DEVICE_STATES.AUTHORIZED);
});

test('AHF00-02 durable device projection hashes serial instead of persisting it', () => {
  const classified = classifyAdbInventory(parseAdbDevicesList(adbInventory('SECRET-SERIAL\tdevice model:Phone')));
  const projected = durableDeviceProjection(classified);
  assert.equal(JSON.stringify(projected).includes('SECRET-SERIAL'), false);
  assert.match(projected.deviceRef, /^device\.adb\.sha256\.[0-9a-f]{64}$/u);
});

test('AHF00-03 exact APK identity rejects byte/hash drift before install', () => {
  const apk = Buffer.from('apk-fixture');
  const hash = crypto.createHash('sha256').update(apk).digest('hex');
  assert.deepEqual(verifyBufferIdentity(apk, { expectedBytes: apk.length, expectedSha256: hash }), { bytes: apk.length, sha256: hash });
  assert.throws(() => verifyBufferIdentity(apk, { expectedBytes: apk.length + 1, expectedSha256: hash }), /APK_BYTES_MISMATCH/u);
  assert.throws(() => verifyBufferIdentity(apk, { expectedBytes: apk.length, expectedSha256: '0'.repeat(64) }), /APK_SHA256_MISMATCH/u);
});

test('AHF00-04 existing and absent installs converge on identical adb install -r command', () => {
  const common = { adbPath: '/sdk/adb', serial: 'SERIAL', packageName: 'com.example', component: 'com.example/.MainActivity', apkPath: '/tmp/app.apk' };
  const commands = buildInstallUpdateCommands(common);
  assert.deepEqual(commands.installUpdate.args, ['-s', 'SERIAL', 'install', '-r', '/tmp/app.apk']);
  assert.equal(JSON.stringify(commands).includes('uninstall'), false);
  assert.equal(JSON.stringify(commands).includes('pm clear'), false);
});

test('AHF00-05 install/update launch uses typed shell-free argv and preserves prior-install observation only', () => {
  const { dir, apkPath, identity } = apkFixture();
  for (const priorInstalled of [true, false]) {
    const fixture = fakeSpawn({ priorInstalled });
    const receipt = runAndroidDeviceHost({
      operation: ANDROID_DEVICE_HOST_OPERATIONS.INSTALL_UPDATE_LAUNCH,
      adbPath: '/sdk/adb', packageName: 'com.example', component: 'com.example/.MainActivity', apkPath, ...identity,
    }, { spawn: fixture.spawn });
    assert.equal(receipt.state, 'INSTALL_UPDATE_LAUNCH_PASS');
    assert.equal(receipt.app.priorInstalled, priorInstalled);
    assert.equal(receipt.effects.installPerformed, true);
    assert.equal(receipt.effects.launchPerformed, true);
    assert.equal(receipt.app.pidObserved, true);
    assert.equal(receipt.app.foregroundObserved, true);
    assert.equal(fixture.calls.every((call) => call.shell === false), true);
    assert.equal(fixture.calls.some((call) => call.args.includes('uninstall')), false);
    assert.equal(fixture.calls.some((call) => call.args.join(' ').includes('pm clear')), false);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('AHF00-06 hash mismatch stops before adb install', () => {
  const { dir, apkPath } = apkFixture();
  const fixture = fakeSpawn();
  assert.throws(() => runAndroidDeviceHost({
    operation: ANDROID_DEVICE_HOST_OPERATIONS.INSTALL_UPDATE_LAUNCH,
    adbPath: '/sdk/adb', packageName: 'com.example', component: 'com.example/.MainActivity', apkPath,
    expectedApkBytes: 999, expectedApkSha256: '0'.repeat(64),
  }, { spawn: fixture.spawn }), /APK_BYTES_MISMATCH/u);
  assert.equal(fixture.calls.some((call) => call.args.includes('install')), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('AHF00-07 no-device state is precise and produces no app effect', () => {
  const fixture = fakeSpawn({ inventory: adbInventory('') });
  const receipt = runAndroidDeviceHost({ operation: ANDROID_DEVICE_HOST_OPERATIONS.OBSERVE, adbPath: '/sdk/adb' }, { spawn: fixture.spawn });
  assert.equal(receipt.state, ANDROID_DEVICE_STATES.ABSENT);
  assert.equal(receipt.effects.installPerformed, false);
  assert.equal(receipt.effects.launchPerformed, false);
});

test('AHF00-08 foundation owns no feature semantics or prohibited effect', () => {
  const contract = createAndroidDeviceHostContractSummary();
  assert.deepEqual(contract.effects, {
    productSemanticOwnership: false, productStateOwnership: false, networkConfiguration: false, pairing: false,
    home: false, keyGeneration: false, modelRuntime: false, uninstall: false, userDataClear: false, serialPersistence: false,
  });
  const sources = [
    fs.readFileSync(new URL('../src/core/android-device-host.mjs', import.meta.url), 'utf8'),
    fs.readFileSync(new URL('../scripts/android-device-host.mjs', import.meta.url), 'utf8'),
  ].join('\n');
  for (const forbidden of ['action.vexlife.conversation.request-attention', 'element.vexlife.android.r2.architecture.status', 'RequestConversationAttention', 'com.vextreme.vexlife.r2']) {
    assert.equal(sources.includes(forbidden), false, forbidden);
  }
});

test('AHF00-09 launch readiness polls until delayed PID and foreground settle without reinstalling', () => {
  const { dir, apkPath, identity } = apkFixture();
  const fixture = fakeSpawn({
    pidSequence: [null, null, '4242\n'],
    foregroundSequence: ['mResumedActivity com.other/.MainActivity\n', null, 'mResumedActivity com.example/.MainActivity\n'],
  });
  const clock = fakeClock();
  const receipt = runAndroidDeviceHost({
    operation: ANDROID_DEVICE_HOST_OPERATIONS.INSTALL_UPDATE_LAUNCH,
    adbPath: '/sdk/adb', packageName: 'com.example', component: 'com.example/.MainActivity', apkPath, ...identity,
    launchSettleTimeoutMs: 1000, launchPollIntervalMs: 100,
  }, { spawn: fixture.spawn, now: clock.now, sleep: clock.sleep });
  assert.equal(receipt.state, 'INSTALL_UPDATE_LAUNCH_PASS');
  assert.equal(receipt.app.pidObserved, true);
  assert.equal(receipt.app.foregroundObserved, true);
  assert.equal(receipt.app.readinessAttempts, 3);
  assert.equal(fixture.calls.filter((call) => call.args.includes('install')).length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('AHF00-10 foreground may lag an observed PID and settle later', () => {
  const { dir, apkPath, identity } = apkFixture();
  const fixture = fakeSpawn({
    pidSequence: ['4242\n'],
    foregroundSequence: ['mResumedActivity com.other/.MainActivity\n', 'mResumedActivity com.example/.MainActivity\n'],
  });
  const clock = fakeClock();
  const receipt = runAndroidDeviceHost({
    operation: ANDROID_DEVICE_HOST_OPERATIONS.INSTALL_UPDATE_LAUNCH,
    adbPath: '/sdk/adb', packageName: 'com.example', component: 'com.example/.MainActivity', apkPath, ...identity,
    launchSettleTimeoutMs: 1000, launchPollIntervalMs: 100,
  }, { spawn: fixture.spawn, now: clock.now, sleep: clock.sleep });
  assert.equal(receipt.state, 'INSTALL_UPDATE_LAUNCH_PASS');
  assert.equal(receipt.app.pidObserved, true);
  assert.equal(receipt.app.foregroundObserved, true);
  assert.equal(receipt.app.readinessAttempts, 2);
  assert.equal(fixture.calls.filter((call) => call.args.includes('install')).length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('AHF00-11 launch readiness timeout returns truthful partial-effect receipt', () => {
  const { dir, apkPath, identity } = apkFixture();
  const fixture = fakeSpawn({
    pidSequence: [null],
    foregroundSequence: ['mResumedActivity com.other/.MainActivity\n'],
  });
  const clock = fakeClock();
  const receipt = runAndroidDeviceHost({
    operation: ANDROID_DEVICE_HOST_OPERATIONS.INSTALL_UPDATE_LAUNCH,
    adbPath: '/sdk/adb', packageName: 'com.example', component: 'com.example/.MainActivity', apkPath, ...identity,
    launchSettleTimeoutMs: 250, launchPollIntervalMs: 100,
  }, { spawn: fixture.spawn, now: clock.now, sleep: clock.sleep });
  assert.equal(receipt.state, 'INSTALL_UPDATE_LAUNCH_UNCONFIRMED');
  assert.equal(receipt.effects.installPerformed, true);
  assert.equal(receipt.effects.launchPerformed, true);
  assert.equal(receipt.app.pidObserved, false);
  assert.equal(receipt.app.foregroundObserved, false);
  assert.ok(receipt.app.readinessAttempts >= 3);
  assert.equal(fixture.calls.filter((call) => call.args.includes('install')).length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

// [VXG RealForever]
