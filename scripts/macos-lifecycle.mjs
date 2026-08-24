#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import { runtimeProcessEvidenceMatches } from '../src/core/vex-initialization.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SOURCE_ROOT = path.resolve(HERE, '..');
export const MAC_LIFECYCLE_SCHEMA = 'vexlife.macos-lifecycle/v1';
export const MAC_BROWSER_RECEIPT_SCHEMA = 'vexlife.browser-process-receipt/v1';
export const ALLOWED_OPERATIONS = Object.freeze([
  'auto', 'status', 'start', 'repair', 'rebuild-preserve', 'uninstall-preserve'
]);

const TRANSIENT_EXACT = new Set([
  'config/model.json',
  'recovery/vex-initialization-receipt.json',
  'recovery/browser-process.json',
  'recovery/macos-lifecycle-receipt.json'
]);

function jsonRead(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.partial-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temp, filePath);
}
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function ensureInside(root, candidate, label) {
  const rootAbs = path.resolve(root);
  const candidateAbs = path.resolve(candidate);
  const relative = path.relative(rootAbs, candidateAbs);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes Vex Home: ${candidateAbs}`);
  }
  return candidateAbs;
}
function assertNoSymlinkTree(target) {
  if (!fs.existsSync(target)) return;
  const visit = (entry) => {
    const stat = fs.lstatSync(entry);
    if (stat.isSymbolicLink()) throw new Error(`symlink/junction-like entry is not admitted: ${entry}`);
    if (!stat.isDirectory()) return;
    for (const name of fs.readdirSync(entry)) visit(path.join(entry, name));
  };
  visit(target);
}
function canonicalExistingDirectory(value, label) {
  const full = path.resolve(value);
  if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) throw new Error(`${label} is not a directory: ${full}`);
  assertNoSymlinkTree(full);
  const real = fs.realpathSync(full);
  if (real !== full) throw new Error(`${label} is not its canonical filesystem identity: requested=${full} resolved=${real}`);
  return real;
}

export function validateMacTarEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('runtime archive entry list must be non-empty');
  for (const raw of entries) {
    const value = String(raw).trim();
    if (!value) continue;
    if (value.includes('\0')) throw new Error('runtime archive contains a NUL path');
    const normalized = value.replace(/^\.\//u, '');
    if (path.posix.isAbsolute(normalized)) throw new Error(`runtime archive contains an absolute path: ${value}`);
    if (normalized.split('/').some((segment) => segment === '..')) {
      throw new Error(`runtime archive contains parent traversal: ${value}`);
    }
  }
  return true;
}
function normalizeMacTarMemberName(raw) {
  const original = String(raw);
  if (!original || original !== original.trim()) {
    throw new Error('runtime archive member names must be non-empty and have no leading/trailing whitespace');
  }
  if (original.includes('\\') || original.includes('\0')) {
    throw new Error('runtime archive member name contains a non-admitted separator or NUL');
  }
  let value = original.startsWith('./') ? original.slice(2) : original;
  if (value.includes('//')) {
    throw new Error(`runtime archive member path contains repeated separators: ${original}`);
  }
  const directoryForm = value.endsWith('/');
  if (directoryForm) value = value.slice(0, -1);
  if (!value || value === '.') throw new Error(`runtime archive member path is empty or root-like: ${original}`);
  if (path.posix.isAbsolute(value)) throw new Error(`runtime archive contains an absolute path: ${original}`);
  if (value === '..' || value.startsWith('../') || value.split('/').some(segment => segment === '..')) {
    throw new Error(`runtime archive contains parent traversal: ${original}`);
  }
  const canonical = path.posix.normalize(value);
  if (canonical !== value || value.split('/').some(segment => segment === '.')) {
    throw new Error(`runtime archive member path is not canonical: ${original}`);
  }
  return canonical;
}
function pathInsideRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
export function validateMacTarTopology(entries, verboseLines) {
  validateMacTarEntries(entries);
  if (!Array.isArray(verboseLines) || verboseLines.length !== entries.length || entries.length === 0) {
    throw new Error('runtime archive name/type listings must have exact non-empty parity');
  }
  const normalized = entries.map(normalizeMacTarMemberName);
  if (new Set(normalized).size !== normalized.length) throw new Error('runtime archive contains duplicate or filesystem-equivalent member names');

  const records = normalized.map((name, index) => {
    const rawName = String(entries[index]).trim();
    const line = String(verboseLines[index] || '');
    const type = line[0] || '';
    if (type === '-') {
      if (!line.endsWith(rawName)) throw new Error(`runtime archive verbose/name order mismatch: ${rawName}`);
      return { name, type: 'regular', target: null };
    }
    if (type === 'd') {
      if (!line.endsWith(rawName)) throw new Error(`runtime archive verbose/name order mismatch: ${rawName}`);
      return { name, type: 'directory', target: null };
    }
    if (type === 'l') {
      const marker = `${rawName} -> `;
      const at = line.lastIndexOf(marker);
      if (at < 0) throw new Error(`runtime archive symlink target is not parseable: ${rawName}`);
      const target = line.slice(at + marker.length);
      if (!target || path.posix.isAbsolute(target) || target.includes('\\') ||
          path.posix.basename(target) !== target || target === '.' || target === '..') {
        throw new Error(`runtime archive symlink target is not an admitted same-directory filename: ${rawName}`);
      }
      return { name, type: 'symlink', target };
    }
    if (type === 'h') throw new Error(`runtime archive hardlink is not admitted: ${rawName}`);
    throw new Error(`runtime archive contains a special member type: ${type}`);
  });

  const byName = new Map(records.map(record => [record.name, record]));
  for (const record of records) {
    if (record.type !== 'symlink') continue;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(record.name), record.target));
    if (resolved === '..' || resolved.startsWith('../') || path.posix.isAbsolute(resolved)) {
      throw new Error(`runtime archive symlink escapes archive root: ${record.name}`);
    }
    if (!byName.has(resolved)) throw new Error(`runtime archive symlink target is missing: ${record.name}`);
    for (const candidate of normalized) {
      if (candidate !== record.name && candidate.startsWith(`${record.name}/`)) {
        throw new Error(`runtime archive symlink is an ancestor of another member: ${record.name}`);
      }
    }

    const seen = new Set([record.name]);
    let current = record;
    for (let hop = 0; hop < 16; hop += 1) {
      if (current.type !== 'symlink') {
        if (current.type !== 'regular') throw new Error(`runtime archive symlink chain does not terminate at a regular file: ${record.name}`);
        break;
      }
      const nextName = path.posix.normalize(path.posix.join(path.posix.dirname(current.name), current.target));
      if (seen.has(nextName)) throw new Error(`runtime archive symlink cycle detected: ${record.name}`);
      seen.add(nextName);
      const next = byName.get(nextName);
      if (!next) throw new Error(`runtime archive symlink chain target is missing: ${record.name}`);
      current = next;
      if (hop === 15) throw new Error(`runtime archive symlink chain exceeds bounded depth: ${record.name}`);
    }
  }
  return {
    entryCount: records.length,
    symlinkCount: records.filter(record => record.type === 'symlink').length,
    hardlinkCount: 0,
    specialCount: 0
  };
}
export function assertSafeMacTarArchive(archivePath, { spawnSyncImpl = spawnSync } = {}) {
  const names = spawnSyncImpl('/usr/bin/tar', ['-tzf', archivePath], {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, shell: false
  });
  if (names.error || names.status !== 0) {
    throw new Error(`macOS runtime archive listing failed: ${names.stderr || names.error?.message || 'unknown error'}`);
  }
  const entries = String(names.stdout || '').split(/\r?\n/u).filter(Boolean);

  const verbose = spawnSyncImpl('/usr/bin/tar', ['-tvzf', archivePath], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: false
  });
  if (verbose.error || verbose.status !== 0) {
    throw new Error(`macOS runtime archive type listing failed: ${verbose.stderr || verbose.error?.message || 'unknown error'}`);
  }
  const verboseLines = String(verbose.stdout || '').split(/\r?\n/u).filter(Boolean);
  return { entries, ...validateMacTarTopology(entries, verboseLines) };
}
export function assertSafeMacExtractedTree(root) {
  const rootAbs = path.resolve(root);
  if (!fs.existsSync(rootAbs) || !fs.lstatSync(rootAbs).isDirectory()) throw new Error('runtime extraction root must be a directory');
  const visit = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const target = path.join(dir, name);
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink()) {
        const rawLink = fs.readlinkSync(target);
        if (!rawLink || path.isAbsolute(rawLink) || rawLink.includes('/') || rawLink.includes('\\') ||
            path.basename(rawLink) !== rawLink || rawLink === '.' || rawLink === '..') {
          throw new Error(`runtime extraction contains a non-admitted symlink target: ${target}`);
        }
        const immediate = path.resolve(path.dirname(target), rawLink);
        if (!pathInsideRoot(rootAbs, immediate) || !fs.existsSync(immediate)) {
          throw new Error(`runtime extraction symlink target escapes or is missing: ${target}`);
        }
        let real;
        try { real = fs.realpathSync(target); } catch (error) {
          throw new Error(`runtime extraction symlink chain is invalid: ${target}: ${error.message}`);
        }
        if (!pathInsideRoot(rootAbs, real) || !fs.lstatSync(real).isFile()) {
          throw new Error(`runtime extraction symlink does not terminate at an in-root regular file: ${target}`);
        }
        continue;
      }
      if (stat.isDirectory()) { visit(target); continue; }
      if (!stat.isFile()) throw new Error(`runtime extraction contains a special filesystem entry: ${target}`);
    }
  };
  visit(rootAbs);
  return true;
}

function tokenizeCommandLine(text) {
  const tokens = [];
  let current = '';
  let quote = null;
  for (const ch of String(text || '')) {
    if ((ch === '"' || ch === "'") && (!quote || quote === ch)) { quote = quote ? null : ch; continue; }
    if (/\s/u.test(ch) && !quote) { if (current) { tokens.push(current); current = ''; } continue; }
    current += ch;
  }
  if (quote) return null;
  if (current) tokens.push(current);
  return tokens;
}
export function readMacProcessEvidence(pid, { spawnSyncImpl = spawnSync } = {}) {
  if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) return null;
  const ps = spawnSyncImpl('/bin/ps', ['-ww', '-p', String(pid), '-o', 'command='], {
    encoding: 'utf8', shell: false
  });
  if (ps.error || ps.status !== 0 || !String(ps.stdout || '').trim()) return null;
  const commandLine = String(ps.stdout).trim();
  const lsof = spawnSyncImpl('/usr/sbin/lsof', ['-a', '-p', String(pid), '-d', 'txt', '-Fn'], {
    encoding: 'utf8', shell: false
  });
  if (lsof.error || lsof.status !== 0) return null;
  const executablePath = String(lsof.stdout || '').split(/\r?\n/u)
    .find((line) => line.startsWith('n'))?.slice(1) || null;
  if (!executablePath) return null;
  return {
    name: path.basename(executablePath),
    executablePath,
    commandLine,
    tokens: tokenizeCommandLine(commandLine)
  };
}
function pidAlive(pid) {
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}
async function waitPidExit(pid, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!pidAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !pidAlive(pid);
}
async function stopPid(pid) {
  if (!pidAlive(pid)) return 'ALREADY_STOPPED';
  process.kill(pid, 'SIGTERM');
  if (!await waitPidExit(pid)) throw new Error(`owned process ${pid} did not stop after SIGTERM`);
  return 'STOPPED';
}
function browserReceiptPath(home) { return path.join(home, 'recovery', 'browser-process.json'); }
function lifecycleReceiptPath(home) { return path.join(home, 'recovery', 'macos-lifecycle-receipt.json'); }

function expectedBrowserArgs(repo, home, receipt) {
  return [
    path.join(repo, 'scripts', 'serve-browser.mjs'),
    '--vexlife-browser-owner-token', String(receipt.ownerToken),
    '--vexlife-home', home,
    '--vexlife-repo', repo
  ];
}
export function getOwnedBrowser(home, repo) {
  const receipt = jsonRead(browserReceiptPath(home));
  if (!receipt || receipt.state !== 'RUNNING') return null;
  if (receipt.schemaVersion !== MAC_BROWSER_RECEIPT_SCHEMA) throw new Error('browser process receipt schema is not current');
  if (path.resolve(receipt.vexHomePath) !== home || path.resolve(receipt.repoRootPath) !== repo) {
    throw new Error('browser process receipt Home/repo identity mismatch');
  }
  const pid = Number(receipt.pid);
  const evidence = readMacProcessEvidence(pid);
  if (!evidence) return null;
  const expectedExecutablePath = path.resolve(receipt.nodeExecutablePath);
  const expectedArguments = expectedBrowserArgs(repo, home, receipt);
  if (!runtimeProcessEvidenceMatches({ processEvidence: evidence, expectedExecutablePath, expectedArguments })) {
    throw new Error('browser receipt PID is active but exact process-instance ownership is not proven');
  }
  return { pid, receipt, evidence };
}
export async function stopOwnedBrowser(home, repo) {
  const receiptPath = browserReceiptPath(home);
  const receipt = jsonRead(receiptPath);
  if (!receipt) return { disposition: 'NO_BROWSER_RECEIPT', pid: null };
  const owned = getOwnedBrowser(home, repo);
  if (!owned) {
    if (pidAlive(Number(receipt.pid))) throw new Error('browser receipt PID is active but ownership cannot be proven');
    receipt.state = 'STALE_STOPPED';
    receipt.stoppedAtUtc = new Date().toISOString();
    writeJsonAtomic(receiptPath, receipt);
    return { disposition: 'ALREADY_STOPPED', pid: Number(receipt.pid) || null };
  }
  await stopPid(owned.pid);
  owned.receipt.state = 'STOPPED_BY_LIFECYCLE';
  owned.receipt.stoppedAtUtc = new Date().toISOString();
  writeJsonAtomic(receiptPath, owned.receipt);
  return { disposition: 'EXACT_BROWSER_STOPPED', pid: owned.pid };
}
export async function stopOwnedRuntime(home) {
  const model = jsonRead(path.join(home, 'config', 'model.json'));
  if (!model) return { disposition: 'NO_MODEL_CONFIGURATION', pid: null };
  const pid = Number(model.runtimePid);
  if (!pidAlive(pid)) return { disposition: 'ALREADY_STOPPED', pid: Number.isInteger(pid) ? pid : null };
  if (!model.runtimeExecutablePath || !model.runtimeExecutableSha256 || !Array.isArray(model.runtimeArguments)) {
    throw new Error('runtime process is active but current exact runtime ownership fields are incomplete; refusing stop');
  }
  const evidence = readMacProcessEvidence(pid);
  if (!evidence || !runtimeProcessEvidenceMatches({
    processEvidence: evidence,
    expectedExecutablePath: path.resolve(model.runtimeExecutablePath),
    expectedArguments: model.runtimeArguments
  })) {
    throw new Error('configured runtime PID is active but exact executable/argument ownership is not proven; refusing stop');
  }
  const actual = sha256(fs.readFileSync(path.resolve(model.runtimeExecutablePath)));
  if (actual !== model.runtimeExecutableSha256) throw new Error('runtime executable bytes moved after qualification; refusing stop');
  await stopPid(pid);
  return { disposition: 'EXACT_RUNTIME_STOPPED', pid };
}

function excludedFromProtectedSnapshot(relative) {
  const forward = relative.split(path.sep).join('/');
  return forward.startsWith('runtime/') || TRANSIENT_EXACT.has(forward);
}
export function protectedHomeSnapshot(home) {
  const root = path.resolve(home);
  const records = [];
  if (!fs.existsSync(root)) return { fileCount: 0, fingerprintSha256: sha256(Buffer.from('[]')) };
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const relative = path.relative(root, full);
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) throw new Error(`protected Home contains a symlink: ${relative}`);
      if (entry.isDirectory()) { visit(full); continue; }
      if (!entry.isFile() || excludedFromProtectedSnapshot(relative)) continue;
      const bytes = fs.readFileSync(full);
      records.push({ path: relative.split(path.sep).join('/'), bytes: bytes.length, sha256: sha256(bytes) });
    }
  };
  visit(root);
  records.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  return { fileCount: records.length, fingerprintSha256: sha256(Buffer.from(JSON.stringify(records))), records };
}
function removeConfined(home, relative) {
  const target = ensureInside(home, path.join(home, relative), relative);
  if (!fs.existsSync(target)) return false;
  assertNoSymlinkTree(target);
  fs.rmSync(target, { recursive: true, force: true });
  return true;
}
export function cleanupRepairState(home) {
  const removed = [];
  for (const relative of [
    'runtime/initialization',
    'runtime/llama-server.out.log',
    'runtime/llama-server.err.log',
    'runtime/serve-browser.log',
    'runtime/serve-browser.err.log',
    'config/model.json',
    'recovery/vex-initialization-receipt.json',
    'recovery/browser-process.json',
    'recovery/macos-lifecycle-receipt.json'
  ]) if (removeConfined(home, relative)) removed.push(relative);
  return removed;
}
export function cleanupRebuildPreserveState(home) {
  const removed = [];
  for (const relative of [
    'runtime',
    'config/model.json',
    'recovery/vex-initialization-receipt.json',
    'recovery/browser-process.json',
    'recovery/macos-lifecycle-receipt.json'
  ]) if (removeConfined(home, relative)) removed.push(relative);
  return removed;
}

export function classifyMacLifecycleState(home) {
  const root = path.resolve(home);
  if (!fs.existsSync(root)) return 'ABSENT';
  if (!fs.statSync(root).isDirectory()) return 'HELD_NONCANONICAL_HOME';
  const entries = fs.readdirSync(root);
  const homeManifest = path.join(root, 'config', 'home.json');
  if (!fs.existsSync(homeManifest)) return entries.length === 0 ? 'ABSENT' : 'HELD_NONCANONICAL_HOME';
  const model = jsonRead(path.join(root, 'config', 'model.json'));
  const initialization = jsonRead(path.join(root, 'recovery', 'vex-initialization-receipt.json'));
  if (model?.state === 'BOUND_QUALIFIED' && initialization?.state === 'RUNTIME_QUALIFIED') return 'EXISTING_HEALTHY';
  return 'EXISTING_DEGRADED_REPAIRABLE';
}
export function choicesForLifecycleState(state) {
  if (state === 'ABSENT') return ['start'];
  if (state === 'EXISTING_HEALTHY') return ['start', 'repair', 'rebuild-preserve', 'uninstall-preserve'];
  if (state === 'EXISTING_DEGRADED_REPAIRABLE') return ['repair', 'rebuild-preserve', 'uninstall-preserve'];
  return [];
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (value) => { socket.destroy(); resolve(value); };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}
async function waitPort(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portOpen(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}
function runNode(argv, { cwd = SOURCE_ROOT, accepted = [0], env = {} } = {}) {
  const result = spawnSync(process.execPath, argv, {
    cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, ...env }, shell: false
  });
  if (!accepted.includes(result.status ?? 127)) {
    throw new Error(`node ${argv.join(' ')} failed (${result.status}): ${String(result.stderr || '').trim()}`);
  }
  return result;
}
function parseLastJson(stdout) {
  const lines = String(stdout || '').split(/\r?\n/u).map((x) => x.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try { return JSON.parse(lines[i]); } catch {}
  }
  throw new Error('command emitted no machine-readable JSON result');
}
function bootstrap(home, repo) {
  return runNode([path.join(repo, 'scripts', 'bootstrap.mjs'), '--device-name', os.hostname(), '--home', home], {
    cwd: repo, accepted: [0, 3]
  });
}
function initialize(home, repo, options) {
  const argv = [path.join(repo, 'scripts', 'initialize-vex.mjs'), '--home', home, '--yes'];
  if (options.candidateProfileRef || options.candidateAuthorityRef) {
    if (!options.candidateProfileRef || !options.candidateAuthorityRef) {
      throw new Error('candidate qualification requires both profile and authority refs');
    }
    argv.push('--mode', 'candidate-qualification', '--profile-ref', options.candidateProfileRef,
      '--candidate-authority-ref', options.candidateAuthorityRef);
  }
  const result = runNode(argv, { cwd: repo });
  return parseLastJson(result.stdout);
}
async function startBrowser(home, repo, initialization) {
  const browserPort = 18110;
  const receiptPath = browserReceiptPath(home);
  if (await portOpen(browserPort)) {
    const owned = getOwnedBrowser(home, repo);
    if (!owned) throw new Error('port 18110 is already answering but exact browser ownership is not proven');
    return { disposition: 'REUSED_EXACT_BROWSER', pid: owned.pid };
  }
  const token = crypto.randomUUID().toLowerCase();
  const serverScript = path.join(repo, 'scripts', 'serve-browser.mjs');
  const args = [
    serverScript,
    '--vexlife-browser-owner-token', token,
    '--vexlife-home', home,
    '--vexlife-repo', repo
  ];
  const runtimeDir = path.join(home, 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });
  const outFd = fs.openSync(path.join(runtimeDir, 'serve-browser.log'), 'a');
  const errFd = fs.openSync(path.join(runtimeDir, 'serve-browser.err.log'), 'a');
  const child = spawn(process.execPath, args, {
    cwd: repo,
    detached: true,
    stdio: ['ignore', outFd, errFd],
    env: {
      ...process.env,
      VEXLIFE_HOME: home,
      VEXLIFE_COMPANION_ENDPOINT: initialization.endpoint,
      VEXLIFE_COMPANION_MODEL: initialization.requestModel,
      VEXLIFE_OPERATIONAL_PROFILE_REF: initialization.profileRef
    }
  });
  child.unref();
  fs.closeSync(outFd); fs.closeSync(errFd);
  if (!child.pid) throw new Error('browser process returned no PID');
  writeJsonAtomic(receiptPath, {
    schemaVersion: MAC_BROWSER_RECEIPT_SCHEMA,
    state: 'RUNNING',
    processInstanceRef: `browser-process.${token}`,
    ownerToken: token,
    pid: child.pid,
    nodeExecutablePath: process.execPath,
    serverScriptPath: serverScript,
    vexHomePath: home,
    repoRootPath: repo,
    formedAtUtc: new Date().toISOString()
  });
  if (!await waitPort(browserPort)) {
    try { process.kill(child.pid, 'SIGTERM'); } catch {}
    throw new Error('VexLife browser server did not answer within 15 seconds');
  }
  return { disposition: 'STARTED_NEW_BROWSER', pid: child.pid };
}

async function runStart(home, repo, options) {
  bootstrap(home, repo);
  const initialized = initialize(home, repo, options);
  if (initialized.state !== 'RUNTIME_QUALIFIED') throw new Error(`initializer did not qualify runtime: ${initialized.state}`);
  const browser = await startBrowser(home, repo, initialized);
  return { initialized, browser };
}
async function uninstallPreserve(home, repo) {
  const homeRoot = canonicalExistingDirectory(home, 'Vex Home');
  const repoRoot = canonicalExistingDirectory(repo, 'VexLife source root');
  const before = protectedHomeSnapshot(homeRoot);
  const browser = await stopOwnedBrowser(homeRoot, repoRoot);
  const runtime = await stopOwnedRuntime(homeRoot);
  const removed = cleanupRebuildPreserveState(homeRoot);
  const after = protectedHomeSnapshot(homeRoot);
  const continuityPreserved = before.fileCount === after.fileCount &&
    before.fingerprintSha256 === after.fingerprintSha256;
  const result = {
    schemaVersion: MAC_LIFECYCLE_SCHEMA,
    operation: 'uninstall-preserve',
    state: continuityPreserved ? 'UNINSTALL_PRESERVE_COMPLETED' : 'UNINSTALL_PRESERVE_CONTINUITY_MISMATCH',
    browser, runtime, removed,
    continuityPreserved,
    protectedBefore: { fileCount: before.fileCount, fingerprintSha256: before.fingerprintSha256 },
    protectedAfter: { fileCount: after.fileCount, fingerprintSha256: after.fingerprintSha256 },
    destructiveLocalDataRemovalPerformed: false,
    HomeDeleted: false,
    MemoryDeleted: false,
    modelArtifactsDeleted: false
  };
  writeJsonAtomic(lifecycleReceiptPath(homeRoot), result);
  if (!continuityPreserved) throw new Error('uninstall-preserve changed protected Home continuity');
  return result;
}
async function repair(home, repo, options) {
  const homeRoot = canonicalExistingDirectory(home, 'Vex Home');
  const repoRoot = canonicalExistingDirectory(repo, 'VexLife source root');
  const before = protectedHomeSnapshot(homeRoot);
  const browserStop = await stopOwnedBrowser(homeRoot, repoRoot);
  const runtimeStop = await stopOwnedRuntime(homeRoot);
  const removed = cleanupRepairState(homeRoot);
  const afterCleanup = protectedHomeSnapshot(homeRoot);
  if (before.fileCount !== afterCleanup.fileCount || before.fingerprintSha256 !== afterCleanup.fingerprintSha256) {
    throw new Error('repair cleanup changed protected Home continuity');
  }
  const started = await runStart(homeRoot, repoRoot, options);
  return { operation: 'repair', state: 'REPAIR_COMPLETED', browserStop, runtimeStop, removed, started };
}
async function rebuildPreserve(home, repo, options) {
  const uninstall = await uninstallPreserve(home, repo);
  const started = await runStart(path.resolve(home), path.resolve(repo), options);
  return { operation: 'rebuild-preserve', state: 'REBUILD_PRESERVE_COMPLETED', uninstall, started };
}
async function promptChoice(state) {
  const choices = choicesForLifecycleState(state);
  if (choices.length === 0) throw new Error(`lifecycle state is held: ${state}`);
  if (!process.stdin.isTTY) return choices[0];
  const rl = createInterface({ input, output });
  try {
    const friendly = state === 'EXISTING_HEALTHY'
      ? 'VexLife already exists. Choose: [Enter] resume, [r] repair, [b] rebuild while preserving Home, [u] uninstall-preserve, [q] quit: '
      : 'VexLife needs attention. Choose: [Enter] repair, [b] rebuild while preserving Home, [u] uninstall-preserve, [q] quit: ';
    const answer = (await rl.question(friendly)).trim().toLowerCase();
    if (answer === 'q') return 'quit';
    if (answer === 'b') return 'rebuild-preserve';
    if (answer === 'u') return 'uninstall-preserve';
    if (answer === 'r') return 'repair';
    return choices[0];
  } finally { rl.close(); }
}
function argsMap(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error(`unexpected argument: ${key}`);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

export async function runLifecycle(argv = process.argv.slice(2)) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error(`macOS lifecycle requires darwin/arm64, observed ${process.platform}/${process.arch}`);
  }
  const args = argsMap(argv);
  const operation = String(args['--operation'] || 'auto');
  if (!ALLOWED_OPERATIONS.includes(operation)) {
    throw new Error(`unsupported lifecycle operation ${operation}; destructive local-data removal is not available here`);
  }
  const repo = canonicalExistingDirectory(String(args['--repo'] || SOURCE_ROOT), 'VexLife source root');
  const home = path.resolve(String(args['--home'] || path.join(os.homedir(), '.vexlife')));
  const options = {
    candidateProfileRef: args['--candidate-profile-ref'] ? String(args['--candidate-profile-ref']) : null,
    candidateAuthorityRef: args['--candidate-authority-ref'] ? String(args['--candidate-authority-ref']) : null
  };
  const state = classifyMacLifecycleState(home);
  if (operation === 'status') return { schemaVersion: MAC_LIFECYCLE_SCHEMA, operation, state, choices: choicesForLifecycleState(state) };
  let chosen = operation;
  if (chosen === 'auto') chosen = await promptChoice(state);
  if (chosen === 'quit') return { schemaVersion: MAC_LIFECYCLE_SCHEMA, operation: 'quit', state: 'USER_STOPPED_NO_EFFECT' };
  if (chosen === 'start') {
    const started = await runStart(home, repo, options);
    return { schemaVersion: MAC_LIFECYCLE_SCHEMA, operation: 'start', state: 'START_OR_RESUME_COMPLETED', priorState: state, started };
  }
  if (chosen === 'repair') return { schemaVersion: MAC_LIFECYCLE_SCHEMA, ...(await repair(home, repo, options)), priorState: state };
  if (chosen === 'rebuild-preserve') return { schemaVersion: MAC_LIFECYCLE_SCHEMA, ...(await rebuildPreserve(home, repo, options)), priorState: state };
  if (chosen === 'uninstall-preserve') return { schemaVersion: MAC_LIFECYCLE_SCHEMA, ...(await uninstallPreserve(home, repo)), priorState: state };
  throw new Error(`unreachable lifecycle operation: ${chosen}`);
}

const invokedDirectly = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (invokedDirectly) {
  runLifecycle().then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`VEXLIFE_MAC_LIFECYCLE_HELD: ${error.message}\n`);
    process.exitCode = 1;
  });
}

// [VXG RealForever]
