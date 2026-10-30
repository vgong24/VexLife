import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const MACOS_USER_LAUNCHD_PROCESS_SCHEMA = 'vexlife.macos-user-launchd-process/v2';
export const MACOS_USER_LAUNCHD_PROCESS_LEGACY_SCHEMA = 'vexlife.macos-user-launchd-process/v1';
export const MACOS_USER_LAUNCHD_SUBSTRATE_REF = 'substrate.vexlife.macos-user-launchd-process.001';

const LAUNCHCTL = '/bin/launchctl';
const LABEL_RE = /^com\.vexlife\.[a-z0-9][a-z0-9.-]*$/u;
const DEFAULT_START_TIMEOUT_MS = 15000;
const DEFAULT_POLL_MS = 100;

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be one object`);
  return value;
}
function absolute(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new TypeError(`${label} must be absolute`);
  return path.resolve(value);
}
function nonempty(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be one non-empty string`);
  return value;
}
function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
function launchctlDefault(args) {
  const result = spawnSync(LAUNCHCTL, args, { encoding: 'utf8', shell: false });
  return {
    status: result.status,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
    error: result.error ?? null,
  };
}
function processAliveDefault(pid) {
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}
function currentUid() {
  if (typeof process.getuid !== 'function') throw new Error('macOS user launchd requires a numeric user id');
  return process.getuid();
}
function domainForUid(uid) {
  if (!Number.isInteger(uid) || uid < 0) throw new TypeError('launchd uid must be a non-negative integer');
  return `gui/${uid}`;
}
function jobTarget(value) {
  return `${value.domainTarget}/${value.label}`;
}
function parsePid(stdout) {
  const match = /^\s*pid\s*=\s*(\d+)\s*$/mu.exec(String(stdout));
  return match ? Number(match[1]) : null;
}
function missingService(result) {
  return /could not find service|service not found|no such process|no such file or directory/iu.test(`${result.stdout}\n${result.stderr}`);
}
function renderPlist(spec) {
  const argumentsXml = [spec.programPath, ...spec.programArguments]
    .map((value) => `    <string>${xml(value)}</string>`)
    .join('\n');
  const environmentEntries = Object.entries(spec.environment)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `    <key>${xml(key)}</key>\n    <string>${xml(value)}</string>`)
    .join('\n');
  const environmentBlock = environmentEntries
    ? `  <key>EnvironmentVariables</key>\n  <dict>\n${environmentEntries}\n  </dict>\n`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>Label</key>\n  <string>${xml(spec.label)}</string>\n  <key>ProgramArguments</key>\n  <array>\n${argumentsXml}\n  </array>\n  <key>WorkingDirectory</key>\n  <string>${xml(spec.workingDirectory)}</string>\n  <key>StandardOutPath</key>\n  <string>${xml(spec.stdoutPath)}</string>\n  <key>StandardErrorPath</key>\n  <string>${xml(spec.stderrPath)}</string>\n${environmentBlock}  <key>RunAtLoad</key>\n  <true/>\n  <key>KeepAlive</key>\n  <${spec.keepAlive ? 'true' : 'false'}/>\n  <key>ProcessType</key>\n  <string>Background</string>\n</dict>\n</plist>\n`;
}
function writePlist(spec) {
  fs.mkdirSync(path.dirname(spec.plistPath), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.dirname(spec.stdoutPath), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.dirname(spec.stderrPath), { recursive: true, mode: 0o700 });
  const temp = `${spec.plistPath}.partial-${process.pid}`;
  fs.writeFileSync(temp, renderPlist(spec), { mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, spec.plistPath);
}
function removePlist(plistPath) {
  fs.rmSync(plistPath, { force: true });
}

function receiptFromSpec(spec, pid) {
  return Object.freeze({
    schemaVersion: MACOS_USER_LAUNCHD_PROCESS_SCHEMA,
    substrateRef: MACOS_USER_LAUNCHD_SUBSTRATE_REF,
    label: spec.label,
    domainTarget: spec.domainTarget,
    plistPath: spec.plistPath,
    programPath: spec.programPath,
    programArguments: Object.freeze([...spec.programArguments]),
    workingDirectory: spec.workingDirectory,
    stdoutPath: spec.stdoutPath,
    stderrPath: spec.stderrPath,
    keepAlive: spec.keepAlive,
    pid,
  });
}

export function formMacUserLaunchdProcess({
  label,
  plistPath,
  programPath,
  programArguments = [],
  workingDirectory,
  stdoutPath,
  stderrPath,
  environment = {},
  keepAlive = false,
  uid = currentUid(),
} = {}) {
  nonempty(label, 'launchd label');
  if (!LABEL_RE.test(label)) throw new TypeError('launchd label must be one com.vexlife.* identity');
  if (!Array.isArray(programArguments) || programArguments.some((value) => typeof value !== 'string')) {
    throw new TypeError('launchd programArguments must be strings');
  }
  object(environment, 'launchd environment');
  if (typeof keepAlive !== 'boolean') throw new TypeError('launchd keepAlive must be boolean');
  const normalizedEnvironment = {};
  for (const [key, value] of Object.entries(environment)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key) || typeof value !== 'string') {
      throw new TypeError(`launchd environment entry is invalid: ${key}`);
    }
    normalizedEnvironment[key] = value;
  }
  return Object.freeze({
    schemaVersion: MACOS_USER_LAUNCHD_PROCESS_SCHEMA,
    substrateRef: MACOS_USER_LAUNCHD_SUBSTRATE_REF,
    label,
    domainTarget: domainForUid(uid),
    plistPath: absolute(plistPath, 'launchd plistPath'),
    programPath: absolute(programPath, 'launchd programPath'),
    programArguments: Object.freeze([...programArguments]),
    workingDirectory: absolute(workingDirectory, 'launchd workingDirectory'),
    stdoutPath: absolute(stdoutPath, 'launchd stdoutPath'),
    stderrPath: absolute(stderrPath, 'launchd stderrPath'),
    environment: Object.freeze(normalizedEnvironment),
    keepAlive,
  });
}

export function validateMacUserLaunchdProcess(value) {
  object(value, 'launchd process');
  const legacy = value.schemaVersion === MACOS_USER_LAUNCHD_PROCESS_LEGACY_SCHEMA;
  if ((!legacy && value.schemaVersion !== MACOS_USER_LAUNCHD_PROCESS_SCHEMA) || value.substrateRef !== MACOS_USER_LAUNCHD_SUBSTRATE_REF) {
    throw new TypeError('launchd process schema/substrate is not current or compatible');
  }
  const [kind, uidRaw] = String(value.domainTarget ?? '').split('/');
  if (kind !== 'gui' || !/^\d+$/u.test(uidRaw ?? '')) throw new TypeError('launchd process domainTarget is invalid');
  if (legacy && value.keepAlive !== false) throw new TypeError('legacy launchd process KeepAlive must remain false');
  if (!legacy && typeof value.keepAlive !== 'boolean') throw new TypeError('launchd process KeepAlive must be boolean');
  const spec = formMacUserLaunchdProcess({
    label: value.label,
    plistPath: value.plistPath,
    programPath: value.programPath,
    programArguments: value.programArguments,
    workingDirectory: value.workingDirectory,
    stdoutPath: value.stdoutPath,
    stderrPath: value.stderrPath,
    environment: value.environment ?? {},
    keepAlive: legacy ? false : value.keepAlive,
    uid: Number(uidRaw),
  });
  if (value.pid !== undefined && (!Number.isInteger(value.pid) || value.pid <= 0)) throw new TypeError('launchd process pid is invalid');
  return Object.freeze({ ...spec, ...(value.pid === undefined ? {} : { pid: value.pid }) });
}

export function validateMacUserLaunchdProcessReceipt(value) {
  const validated = validateMacUserLaunchdProcess({ ...object(value, 'launchd receipt'), environment: {} });
  if (!Number.isInteger(validated.pid) || validated.pid <= 0) throw new TypeError('launchd receipt requires one pid');
  return receiptFromSpec(validated, validated.pid);
}

export function observeMacUserLaunchdProcess(value, { launchctl = launchctlDefault } = {}) {
  const spec = validateMacUserLaunchdProcess(value);
  const result = launchctl(['print', jobTarget(spec)]);
  if (result.error) return Object.freeze({ state: 'UNKNOWN', pid: null, error: result.error.message });
  if (result.status !== 0) {
    if (missingService(result)) return Object.freeze({ state: 'ABSENT', pid: null });
    return Object.freeze({ state: 'UNKNOWN', pid: null, detail: `${result.stdout}\n${result.stderr}`.trim() });
  }
  const pid = parsePid(result.stdout);
  return Object.freeze({ state: pid ? 'RUNNING' : 'LOADED_STOPPED', pid });
}

export async function startMacUserLaunchdProcess(input, {
  launchctl = launchctlDefault,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  nowMs = () => Date.now(),
  timeoutMs = DEFAULT_START_TIMEOUT_MS,
  pollMs = DEFAULT_POLL_MS,
} = {}) {
  const spec = formMacUserLaunchdProcess(input);
  const before = observeMacUserLaunchdProcess(spec, { launchctl });
  if (before.state !== 'ABSENT') throw new Error(`launchd job must be absent before bootstrap: ${before.state}`);
  writePlist(spec);
  const bootstrap = launchctl(['bootstrap', spec.domainTarget, spec.plistPath]);
  if (bootstrap.error || bootstrap.status !== 0) {
    removePlist(spec.plistPath);
    throw new Error(`launchd bootstrap failed: ${bootstrap.error?.message ?? `${bootstrap.stdout}\n${bootstrap.stderr}`.trim()}`);
  }
  const cleanupAfterFailedBootstrap = () => {
    launchctl(['bootout', jobTarget(spec)]);
    removePlist(spec.plistPath);
  };
  const deadline = nowMs() + timeoutMs;
  while (nowMs() < deadline) {
    const observed = observeMacUserLaunchdProcess(spec, { launchctl });
    if (observed.state === 'RUNNING') return receiptFromSpec(spec, observed.pid);
    if (observed.state === 'UNKNOWN') {
      cleanupAfterFailedBootstrap();
      throw new Error(`launchd job observation failed: ${observed.detail ?? observed.error ?? 'UNKNOWN'}`);
    }
    await sleep(pollMs);
  }
  cleanupAfterFailedBootstrap();
  throw new Error('launchd job did not reach RUNNING before bounded startup timeout');
}

export async function retireMacUserLaunchdProcess(value, {
  expectedPid = value?.pid ?? null,
  launchctl = launchctlDefault,
  processAlive = processAliveDefault,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  nowMs = () => Date.now(),
  timeoutMs = 10000,
  pollMs = DEFAULT_POLL_MS,
} = {}) {
  const spec = validateMacUserLaunchdProcess(value);
  const before = observeMacUserLaunchdProcess(spec, { launchctl });
  if (before.state === 'UNKNOWN') throw new Error(`launchd job ownership is unknown: ${before.detail ?? before.error ?? 'UNKNOWN'}`);
  if (before.state === 'RUNNING' && expectedPid !== null && before.pid !== expectedPid && !spec.keepAlive) {
    throw new Error(`launchd job pid mismatch: expected ${expectedPid}, observed ${before.pid}`);
  }
  const retirementPid = before.state === 'RUNNING'
    ? before.pid
    : spec.keepAlive ? null : expectedPid;
  if (before.state !== 'ABSENT') {
    const bootout = launchctl(['bootout', jobTarget(spec)]);
    if (bootout.error || bootout.status !== 0) {
      throw new Error(`launchd bootout failed: ${bootout.error?.message ?? `${bootout.stdout}\n${bootout.stderr}`.trim()}`);
    }
  }
  const deadline = nowMs() + timeoutMs;
  for (;;) {
    const observed = observeMacUserLaunchdProcess(spec, { launchctl });
    const pidLive = retirementPid !== null && processAlive(retirementPid);
    if (observed.state === 'ABSENT' && !pidLive) {
      removePlist(spec.plistPath);
      return Object.freeze({
        state: 'RETIRED_VERIFIED',
        exactOwnershipVerified: true,
        verifiedNotLive: true,
        signalSent: before.state === 'ABSENT' ? null : 'LAUNCHD_BOOTOUT',
        launchdLabel: spec.label,
        launchdDomainTarget: spec.domainTarget,
      });
    }
    if (observed.state === 'UNKNOWN') throw new Error(`launchd retirement observation failed: ${observed.detail ?? observed.error ?? 'UNKNOWN'}`);
    if (nowMs() >= deadline) throw new Error('launchd job retirement was not verified before bounded timeout');
    await sleep(pollMs);
  }
}

// [VXG RealForever]
