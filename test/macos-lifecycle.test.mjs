import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  evaluateOperationalProfileHost,
  selectOperationalProfile,
  runtimeProcessEvidenceMatches,
  validateOperationalProfileRegistry
} from '../src/core/vex-initialization.mjs';
import {
  ALLOWED_OPERATIONS,
  choicesForLifecycleState,
  classifyMacLifecycleState,
  cleanupRebuildPreserveState,
  protectedHomeSnapshot,
  validateMacTarEntries,
  validateMacTarTopology
} from '../scripts/macos-lifecycle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint', 'vex-operational-profiles.json'), 'utf8'));
const MAC_REF = 'profile.vexlife.operational.qwen3.5-4b.llama-cpp-b10107.macos-arm64-m4-pro-metal.001';
const WIN_REF = 'profile.vexlife.operational.qwen3.5-4b.llama-cpp-b10107.windows-x64-nvidia.001';

test('MAC00 registry admits exact Windows and macOS arm64 pairs only', () => {
  const checked = validateOperationalProfileRegistry(registry);
  assert.equal(checked.ok, true, checked.errors.join('; '));
  assert.deepEqual(registry.profiles.map((p) => p.profileRef).sort(), [MAC_REF, WIN_REF].sort());
});

test('MAC01 normal Mac selection remains held until RELEASE_QUALIFIED', () => {
  const selected = selectOperationalProfile({ registry, platform: 'darwin', architecture: 'arm64' });
  assert.equal(selected.state, 'NO_RELEASE_QUALIFIED_PROFILE');
  assert.equal(selected.heldProfileRef, MAC_REF);
  assert.equal(selected.heldProfileState, 'CANDIDATE_QUALIFICATION');
});

test('MAC01B M4 Pro host predicate is exact and fails closed for plain M4 or missing Apple evidence', () => {
  const mac = registry.profiles.find((p) => p.profileRef === MAC_REF);
  assert.equal(mac.hostRequirements.appleChipModel, 'Apple M4 Pro');
  const baseHost = {
    platform: 'darwin', architecture: 'arm64',
    totalMemoryBytes: 48 * 1024 * 1024 * 1024,
    freeDiskBytes: 64 * 1024 * 1024 * 1024,
    nvidia: { available: false }
  };
  assert.deepEqual(
    evaluateOperationalProfileHost(mac, { ...baseHost, apple: { available: true, chipModel: 'Apple M4 Pro', machineModel: 'Mac16,7' } }),
    { ok: true, state: 'HOST_ELIGIBLE' }
  );
  const wrong = evaluateOperationalProfileHost(
    mac,
    { ...baseHost, apple: { available: true, chipModel: 'Apple M4', machineModel: 'Mac16,10' } }
  );
  assert.equal(wrong.ok, false);
  assert.equal(wrong.reason, 'APPLE_CHIP_MODEL_MISMATCH');
  const missing = evaluateOperationalProfileHost(mac, { ...baseHost, apple: { available: false, chipModel: null } });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'APPLE_CHIP_MODEL_MISMATCH');
});

test('MAC02 candidate Mac selection is exact and nullable executable hash cannot self-promote', () => {
  const selected = selectOperationalProfile({
    registry, platform: 'darwin', architecture: 'arm64',
    mode: 'candidate-qualification', profileRef: MAC_REF
  });
  assert.equal(selected.state, 'PROFILE_RESOLVED');
  assert.equal(selected.profile.runtime.executableSha256, null);
  assert.equal(selected.profile.runtime.executableSha256DiscoveryRequired, true);

  const promoted = structuredClone(registry);
  const mac = promoted.profiles.find((p) => p.profileRef === MAC_REF);
  mac.state = 'RELEASE_QUALIFIED';
  const checked = validateOperationalProfileRegistry(promoted);
  assert.equal(checked.ok, false);
  assert.match(checked.errors.join('; '), /executableSha256/i);
});

test('MAC03 tar topology admits only bounded same-directory file aliases and rejects link write-through classes', () => {
  assert.equal(validateMacTarEntries(['./llama-b10107/llama-server', './llama-b10107/libggml.dylib']), true);
  assert.throws(() => validateMacTarEntries(['../outside']), /parent traversal/);
  assert.throws(() => validateMacTarEntries(['/tmp/outside']), /absolute path/);

  const names = [
    'llama-b10107/',
    'llama-b10107/libggml.0.17.0.dylib',
    'llama-b10107/libggml.0.dylib',
    'llama-b10107/libggml.dylib',
    'llama-b10107/llama-server'
  ];
  const verbose = [
    'drwxr-xr-x  0 user group 0 Jan  1 00:00 llama-b10107/',
    '-rwxr-xr-x  0 user group 1 Jan  1 00:00 llama-b10107/libggml.0.17.0.dylib',
    'lrwxr-xr-x  0 user group 0 Jan  1 00:00 llama-b10107/libggml.0.dylib -> libggml.0.17.0.dylib',
    'lrwxr-xr-x  0 user group 0 Jan  1 00:00 llama-b10107/libggml.dylib -> libggml.0.dylib',
    '-rwxr-xr-x  0 user group 1 Jan  1 00:00 llama-b10107/llama-server'
  ];
  assert.deepEqual(validateMacTarTopology(names, verbose), {
    entryCount: 5, symlinkCount: 2, hardlinkCount: 0, specialCount: 0
  });

  const hostile = (candidateNames, candidateVerbose, pattern) =>
    assert.throws(() => validateMacTarTopology(candidateNames, candidateVerbose), pattern);

  hostile(
    ['llama-b10107/link', 'llama-b10107/file'],
    ['lrwxr-xr-x 0 u g 0 Jan 1 00:00 llama-b10107/link -> ../outside', '-rw-r--r-- 0 u g 1 Jan 1 00:00 llama-b10107/file'],
    /same-directory/
  );
  hostile(
    ['llama-b10107/link'],
    ['lrwxr-xr-x 0 u g 0 Jan 1 00:00 llama-b10107/link -> missing.dylib'],
    /target is missing/
  );
  hostile(
    ['llama-b10107/a', 'llama-b10107/b'],
    ['lrwxr-xr-x 0 u g 0 Jan 1 00:00 llama-b10107/a -> b', 'lrwxr-xr-x 0 u g 0 Jan 1 00:00 llama-b10107/b -> a'],
    /cycle/
  );
  hostile(
    ['llama-b10107/dir/', 'llama-b10107/link'],
    ['drwxr-xr-x 0 u g 0 Jan 1 00:00 llama-b10107/dir/', 'lrwxr-xr-x 0 u g 0 Jan 1 00:00 llama-b10107/link -> dir'],
    /terminate at a regular file/
  );
  hostile(
    ['llama-b10107/file', 'llama-b10107/hard'],
    ['-rw-r--r-- 0 u g 1 Jan 1 00:00 llama-b10107/file', 'hrw-r--r-- 0 u g 0 Jan 1 00:00 llama-b10107/hard link to llama-b10107/file'],
    /hardlink/
  );
  hostile(
    ['llama-b10107/fifo'],
    ['prw-r--r-- 0 u g 0 Jan 1 00:00 llama-b10107/fifo'],
    /special/
  );
  hostile(
    ['llama-b10107/file', 'llama-b10107/link', 'llama-b10107/link/child'],
    ['-rw-r--r-- 0 u g 1 Jan 1 00:00 llama-b10107/file', 'lrwxr-xr-x 0 u g 0 Jan 1 00:00 llama-b10107/link -> file', '-rw-r--r-- 0 u g 1 Jan 1 00:00 llama-b10107/link/child'],
    /ancestor/
  );
  hostile(
    ['llama-b10107/a/./b'],
    ['-rw-r--r-- 0 u g 1 Jan 1 00:00 llama-b10107/a/./b'],
    /not canonical/
  );
  hostile(
    ['llama-b10107/a//b'],
    ['-rw-r--r-- 0 u g 1 Jan 1 00:00 llama-b10107/a//b'],
    /repeated separators/
  );
  hostile(
    ['llama-b10107/dir//'],
    ['drwxr-xr-x 0 u g 0 Jan 1 00:00 llama-b10107/dir//'],
    /repeated separators/
  );
  hostile(
    ['././llama-b10107/file'],
    ['-rw-r--r-- 0 u g 1 Jan 1 00:00 ././llama-b10107/file'],
    /not canonical/
  );
  hostile(
    ['llama-b10107/file', 'llama-b10107/./file'],
    ['-rw-r--r-- 0 u g 1 Jan 1 00:00 llama-b10107/file', 'lrwxr-xr-x 0 u g 0 Jan 1 00:00 llama-b10107/./file -> file'],
    /not canonical/
  );
});

test('MAC04 process evidence is generic to exact expected executable basename, path and argv', () => {
  const executable = '/tmp/VexHome/runtime/llama-b10107/llama-server';
  const args = ['-m', '/tmp/VexHome/models/model.gguf', '--host', '127.0.0.1', '--port', '18080'];
  const evidence = { name: 'llama-server', executablePath: executable, commandLine: [executable, ...args].join(' ') };
  assert.equal(runtimeProcessEvidenceMatches({ processEvidence: evidence, expectedExecutablePath: executable, expectedArguments: args }), true);
  assert.equal(runtimeProcessEvidenceMatches({ processEvidence: { ...evidence, executablePath: '/tmp/other/llama-server' }, expectedExecutablePath: executable, expectedArguments: args }), false);
  assert.equal(runtimeProcessEvidenceMatches({ processEvidence: evidence, expectedExecutablePath: executable, expectedArguments: [...args, '--extra'] }), false);
});

test('MAC05 Windows normal profile selection remains unchanged', () => {
  const selected = selectOperationalProfile({ registry, platform: 'win32', architecture: 'x64' });
  assert.equal(selected.state, 'PROFILE_RESOLVED');
  assert.equal(selected.profile.profileRef, WIN_REF);
  assert.equal(selected.profile.state, 'RELEASE_QUALIFIED');
});

test('MAC06 lifecycle state distinguishes absent, healthy and repairable existing Home', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-mac-state-'));
  const absent = path.join(root, 'absent');
  assert.equal(classifyMacLifecycleState(absent), 'ABSENT');

  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(home, 'config'), { recursive: true });
  fs.writeFileSync(path.join(home, 'config', 'home.json'), '{"homeRef":"home.test"}\n');
  assert.equal(classifyMacLifecycleState(home), 'EXISTING_DEGRADED_REPAIRABLE');
  fs.writeFileSync(path.join(home, 'config', 'model.json'), '{"state":"BOUND_QUALIFIED"}\n');
  fs.mkdirSync(path.join(home, 'recovery'), { recursive: true });
  fs.writeFileSync(path.join(home, 'recovery', 'vex-initialization-receipt.json'), '{"state":"RUNTIME_QUALIFIED"}\n');
  assert.equal(classifyMacLifecycleState(home), 'EXISTING_HEALTHY');
  fs.rmSync(root, { recursive: true, force: true });
});

test('MAC07 rebuild-preserve cleanup removes runtime binding while preserving Home, model cache, Memory and heads', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-mac-rebuild-'));
  const home = path.join(root, 'home');
  for (const dir of ['config','runtime/llama-cpp','recovery','models','memory','conversations/thread-1']) {
    fs.mkdirSync(path.join(home, dir), { recursive: true });
  }
  fs.writeFileSync(path.join(home, 'config', 'home.json'), '{"homeRef":"home.keep"}\n');
  fs.writeFileSync(path.join(home, 'config', 'model.json'), '{"state":"BOUND_QUALIFIED"}\n');
  fs.writeFileSync(path.join(home, 'runtime', 'llama-cpp', 'llama-server'), 'runtime');
  fs.writeFileSync(path.join(home, 'recovery', 'vex-initialization-receipt.json'), '{"state":"RUNTIME_QUALIFIED"}\n');
  fs.writeFileSync(path.join(home, 'models', 'model.gguf'), 'model-cache');
  fs.writeFileSync(path.join(home, 'memory', 'memory.json'), '{"keep":true}\n');
  fs.writeFileSync(path.join(home, 'conversations', 'thread-1', 'head.json'), '{"head":"abc"}\n');

  const before = protectedHomeSnapshot(home);
  const removed = cleanupRebuildPreserveState(home);
  const after = protectedHomeSnapshot(home);
  assert.ok(removed.includes('runtime'));
  assert.equal(fs.existsSync(path.join(home, 'runtime')), false);
  assert.equal(fs.existsSync(path.join(home, 'config', 'model.json')), false);
  assert.equal(fs.readFileSync(path.join(home, 'models', 'model.gguf'), 'utf8'), 'model-cache');
  assert.equal(fs.readFileSync(path.join(home, 'memory', 'memory.json'), 'utf8'), '{"keep":true}\n');
  assert.equal(fs.readFileSync(path.join(home, 'conversations', 'thread-1', 'head.json'), 'utf8'), '{"head":"abc"}\n');
  assert.equal(before.fileCount, after.fileCount);
  assert.equal(before.fingerprintSha256, after.fingerprintSha256);
  fs.rmSync(root, { recursive: true, force: true });
});

test('MAC08 lifecycle exposes no destructive local-data removal operation', () => {
  assert.equal(ALLOWED_OPERATIONS.includes('remove-local-data'), false);
  assert.deepEqual(choicesForLifecycleState('EXISTING_HEALTHY'), ['start','repair','rebuild-preserve','uninstall-preserve']);
  assert.equal(choicesForLifecycleState('HELD_NONCANONICAL_HOME').length, 0);
});

test('MAC09 shell entrypoints delegate to the single Mac lifecycle owner', () => {
  const setup = fs.readFileSync(path.join(ROOT, 'install', 'vexlife-setup.sh'), 'utf8');
  const start = fs.readFileSync(path.join(ROOT, 'start-vexlife.sh'), 'utf8');
  assert.match(setup, /scripts\/macos-lifecycle\.mjs/);
  assert.match(setup, /--operation auto/);
  assert.match(start, /scripts\/macos-lifecycle\.mjs/);
  assert.doesNotMatch(start, /serve-browser\.mjs/);
});

test('MAC10 candidate initializer source contains bounded POSIX extraction and unpinned reuse guard', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'initialize-vex.mjs'), 'utf8');
  assert.match(source, /POSIX_TAR_GZ/);
  assert.match(source, /UNPINNED_CANDIDATE_RUNTIME_REUSE_FORBIDDEN/);
  assert.match(source, /readMacProcessEvidence/);
  assert.match(source, /runtimeExecutableSha256/);
});

// [VXG RealForever]
