import crypto from 'node:crypto';

export const ANDROID_DEVICE_HOST_SCHEMA = 'vexlife.android-device-host/v1';
export const ANDROID_DEVICE_HOST_OPERATIONS = Object.freeze({
  OBSERVE: 'OBSERVE',
  INSTALL_UPDATE_LAUNCH: 'INSTALL_UPDATE_LAUNCH',
  CAPTURE: 'CAPTURE',
});
export const ANDROID_DEVICE_STATES = Object.freeze({
  ABSENT: 'ABSENT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  OFFLINE: 'OFFLINE',
  MULTIPLE: 'MULTIPLE',
  AUTHORIZED: 'AUTHORIZED',
  UNKNOWN: 'UNKNOWN',
});

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_TOKEN = /^[^\0\r\n]+$/u;

function token(value, label) {
  if (typeof value !== 'string' || !SAFE_TOKEN.test(value)) throw new Error(`ANDROID_DEVICE_HOST_INVALID_${label.toUpperCase()}`);
  return value;
}

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function parseAdbDevicesList(raw) {
  if (typeof raw !== 'string') throw new TypeError('adb devices output must be text');
  const devices = [];
  for (const sourceLine of raw.split(/\r?\n/u)) {
    const line = sourceLine.trim();
    if (!line || line === 'List of devices attached' || line.startsWith('* daemon ')) continue;
    const match = /^(\S+)\s+(device|unauthorized|offline|recovery|sideload|bootloader)(?:\s+(.*))?$/u.exec(line);
    if (!match) continue;
    const [, serial, state, detail = ''] = match;
    const properties = {};
    for (const field of detail.split(/\s+/u).filter(Boolean)) {
      const separator = field.indexOf(':');
      if (separator > 0) properties[field.slice(0, separator)] = field.slice(separator + 1);
    }
    const emulator = serial.startsWith('emulator-') || properties.product?.startsWith('sdk_') === true || properties.device?.startsWith('emu') === true;
    devices.push(Object.freeze({ serial, state, emulator, properties: Object.freeze(properties) }));
  }
  return Object.freeze(devices);
}

export function classifyAdbInventory(devices) {
  if (!Array.isArray(devices)) throw new TypeError('devices must be an array');
  if (devices.length === 0) return Object.freeze({ state: ANDROID_DEVICE_STATES.ABSENT, counts: counts(devices), selected: null });
  if (devices.length !== 1) return Object.freeze({ state: ANDROID_DEVICE_STATES.MULTIPLE, counts: counts(devices), selected: null });
  const selected = devices[0];
  const state = selected.state === 'device'
    ? ANDROID_DEVICE_STATES.AUTHORIZED
    : selected.state === 'unauthorized'
      ? ANDROID_DEVICE_STATES.UNAUTHORIZED
      : selected.state === 'offline'
        ? ANDROID_DEVICE_STATES.OFFLINE
        : ANDROID_DEVICE_STATES.UNKNOWN;
  return Object.freeze({ state, counts: counts(devices), selected });
}

function counts(devices) {
  return Object.freeze({
    total: devices.length,
    authorized: devices.filter((d) => d.state === 'device').length,
    unauthorized: devices.filter((d) => d.state === 'unauthorized').length,
    offline: devices.filter((d) => d.state === 'offline').length,
    emulator: devices.filter((d) => d.emulator).length,
  });
}

export function durableDeviceProjection(classification) {
  const selected = classification?.selected ?? null;
  return Object.freeze({
    state: classification.state,
    counts: classification.counts,
    deviceRef: selected ? `device.adb.sha256.${sha256Hex(Buffer.from(selected.serial, 'utf8'))}` : null,
    emulatorHint: selected?.emulator ?? null,
  });
}

export function verifyBufferIdentity(buffer, { expectedBytes, expectedSha256 }) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('APK identity input must be a Buffer');
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1) throw new Error('ANDROID_DEVICE_HOST_EXPECTED_BYTES_INVALID');
  if (typeof expectedSha256 !== 'string' || !SHA256.test(expectedSha256)) throw new Error('ANDROID_DEVICE_HOST_EXPECTED_SHA256_INVALID');
  const observed = Object.freeze({ bytes: buffer.length, sha256: sha256Hex(buffer) });
  if (observed.bytes !== expectedBytes) throw new Error(`ANDROID_DEVICE_HOST_APK_BYTES_MISMATCH:${observed.bytes}`);
  if (observed.sha256 !== expectedSha256) throw new Error(`ANDROID_DEVICE_HOST_APK_SHA256_MISMATCH:${observed.sha256}`);
  return observed;
}

export function typedCommand(program, args, label) {
  token(program, 'program');
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string' || !SAFE_TOKEN.test(arg))) {
    throw new Error('ANDROID_DEVICE_HOST_INVALID_ARGV');
  }
  return Object.freeze({ program, args: Object.freeze([...args]), label: token(label, 'label'), shell: false });
}

export function adbForDevice(adbPath, serial, args, label) {
  return typedCommand(adbPath, ['-s', token(serial, 'serial'), ...args], label);
}

export function buildInstallUpdateCommands({ adbPath, serial, packageName, component, apkPath }) {
  token(packageName, 'package');
  token(component, 'component');
  token(apkPath, 'apk_path');
  return Object.freeze({
    observeInstall: adbForDevice(adbPath, serial, ['shell', 'pm', 'path', packageName], 'observe existing package'),
    installUpdate: adbForDevice(adbPath, serial, ['install', '-r', apkPath], 'install/update exact APK'),
    forceStop: adbForDevice(adbPath, serial, ['shell', 'am', 'force-stop', packageName], 'cold stop package'),
    launch: adbForDevice(adbPath, serial, ['shell', 'am', 'start', '-n', component], 'launch exact component'),
    pid: adbForDevice(adbPath, serial, ['shell', 'pidof', packageName], 'resolve app pid'),
    foreground: adbForDevice(adbPath, serial, ['shell', 'dumpsys', 'activity', 'activities'], 'observe foreground activity'),
  });
}

export function assertHostCommandSafety(commandSet) {
  const serialized = JSON.stringify(commandSet);
  for (const forbidden of [' uninstall', 'pm clear', 'pair', 'connect ', 'tcpip', 'root ', 'remount']) {
    if (serialized.toLowerCase().includes(forbidden)) throw new Error(`ANDROID_DEVICE_HOST_FORBIDDEN_COMMAND:${forbidden.trim()}`);
  }
  return true;
}

export function createAndroidDeviceHostContractSummary() {
  return Object.freeze({
    schemaVersion: ANDROID_DEVICE_HOST_SCHEMA,
    effects: Object.freeze({
      productSemanticOwnership: false,
      productStateOwnership: false,
      networkConfiguration: false,
      pairing: false,
      home: false,
      keyGeneration: false,
      modelRuntime: false,
      uninstall: false,
      userDataClear: false,
      serialPersistence: false,
    }),
  });
}

// [VXG RealForever]
