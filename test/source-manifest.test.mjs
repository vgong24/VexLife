import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { buildSourceManifest, compareSourceManifest } from '../src/core/source-manifest.mjs';

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function write(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

function createRepository(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-manifest-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '--quiet', '--initial-branch=main');
  git(root, 'config', 'user.name', 'VexLife Test');
  git(root, 'config', 'user.email', 'vexlife-test@example.invalid');
  return root;
}

function seedRepository(t, { source = 'alpha\n' } = {}) {
  const root = createRepository(t);
  write(root, '.gitattributes', '* text=auto eol=lf\n');
  write(root, '.gitignore', 'ignored/\n');
  write(root, 'src/a.txt', source);
  git(root, 'add', '--all');
  return root;
}

function blocker(actual, kind) {
  return actual.candidate.blockers.find((entry) => entry.kind === kind);
}

test('manifest hashes canonical index blobs and excludes ignored, tool-local, model, and self artifacts', (t) => {
  const root = seedRepository(t);
  write(root, 'ignored/ambient.log', 'ambient');
  write(root, '.codex/session.json', '{}');
  write(root, '.agents/local-state.json', '{}');
  write(root, 'models/large.gguf', 'not-source');
  write(root, 'SOURCE-MANIFEST.json', '{}');
  write(root, 'source-manifest-parts/part-01.json', '{}');
  git(root, 'add', '--force', '.codex/session.json', '.agents/local-state.json', 'models/large.gguf');

  const first = buildSourceManifest(root);
  const second = buildSourceManifest(root);

  assert.deepEqual(first, second);
  assert.equal(first.sourceKind, 'GIT_INDEX_CANONICAL_BLOBS');
  assert.equal(first.candidate.state, 'CURRENT');
  assert.deepEqual(first.files.map((file) => file.path), ['.gitattributes', '.gitignore', 'src/a.txt']);
  assert.equal(compareSourceManifest(first, second).ok, true);
});

test('LF and CRLF-capable worktrees converge on the same canonical Git source hash', (t) => {
  const lfRoot = seedRepository(t);
  const crlfRoot = seedRepository(t);
  write(crlfRoot, 'src/a.txt', 'alpha\r\n');

  const lfManifest = buildSourceManifest(lfRoot);
  const crlfManifest = buildSourceManifest(crlfRoot);

  assert.equal(crlfManifest.candidate.state, 'CURRENT');
  assert.equal(lfManifest.treeSha256, crlfManifest.treeSha256);
  assert.deepEqual(lfManifest.files, crlfManifest.files);
});

test('ignored ambient artifacts do not change or block the candidate manifest', (t) => {
  const root = seedRepository(t);
  const before = buildSourceManifest(root);
  write(root, 'ignored/tool-output.bin', 'ignored');
  const after = buildSourceManifest(root);

  assert.equal(after.candidate.state, 'CURRENT');
  assert.equal(after.treeSha256, before.treeSha256);
  assert.equal(compareSourceManifest(before, after).ok, true);
});

test('non-ignored untracked source is a visible blocker', (t) => {
  const root = seedRepository(t);
  const expected = buildSourceManifest(root);
  write(root, 'src/untracked.mjs', 'export const value = 1;\n');
  const actual = buildSourceManifest(root);

  assert.equal(actual.treeSha256, expected.treeSha256);
  assert.deepEqual(blocker(actual, 'UNTRACKED_SOURCE'), {
    kind: 'UNTRACKED_SOURCE',
    total: 1,
    paths: ['src/untracked.mjs'],
    truncated: false
  });
  assert.equal(compareSourceManifest(expected, actual).ok, false);
});

test('staged new source is included in the canonical manifest', (t) => {
  const root = seedRepository(t);
  const before = buildSourceManifest(root);
  write(root, 'src/new.mjs', 'export const value = 1;\n');
  git(root, 'add', 'src/new.mjs');
  const after = buildSourceManifest(root);

  assert.equal(after.candidate.state, 'CURRENT');
  assert.equal(after.fileCount, before.fileCount + 1);
  assert.equal(after.files.some((file) => file.path === 'src/new.mjs'), true);
  assert.notEqual(after.treeSha256, before.treeSha256);
});

test('staged edits deterministically change the file and tree hashes', (t) => {
  const root = seedRepository(t);
  const before = buildSourceManifest(root);
  write(root, 'src/a.txt', 'beta\n');
  git(root, 'add', 'src/a.txt');
  const first = buildSourceManifest(root);
  const second = buildSourceManifest(root);
  const comparison = compareSourceManifest(before, first);

  assert.deepEqual(first, second);
  assert.notEqual(first.treeSha256, before.treeSha256);
  assert.deepEqual(comparison.pathDifferences.changed, {
    total: 1,
    paths: ['src/a.txt'],
    truncated: false
  });
});

test('unstaged tracked edits cannot report current', (t) => {
  const root = seedRepository(t);
  const expected = buildSourceManifest(root);
  write(root, 'src/a.txt', 'unstaged\n');
  const actual = buildSourceManifest(root);

  assert.equal(actual.treeSha256, expected.treeSha256);
  assert.deepEqual(blocker(actual, 'UNSTAGED_SOURCE'), {
    kind: 'UNSTAGED_SOURCE',
    total: 1,
    paths: ['src/a.txt'],
    truncated: false
  });
  assert.equal(compareSourceManifest(expected, actual).ok, false);
});

test('unresolved index entries fail closed', (t) => {
  const root = seedRepository(t, { source: 'base\n' });
  git(root, 'commit', '--quiet', '-m', 'base');
  git(root, 'switch', '--quiet', '-c', 'conflict');
  write(root, 'src/a.txt', 'branch\n');
  git(root, 'add', 'src/a.txt');
  git(root, 'commit', '--quiet', '-m', 'branch');
  git(root, 'switch', '--quiet', 'main');
  write(root, 'src/a.txt', 'main\n');
  git(root, 'add', 'src/a.txt');
  git(root, 'commit', '--quiet', '-m', 'main');
  const merge = spawnSync('git', ['merge', '--no-edit', 'conflict'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(merge.status, 0);

  const actual = buildSourceManifest(root);

  assert.equal(actual.candidate.state, 'BLOCKED');
  assert.deepEqual(blocker(actual, 'UNRESOLVED_INDEX'), {
    kind: 'UNRESOLVED_INDEX',
    total: 1,
    paths: ['src/a.txt'],
    truncated: false
  });
});

test('missing, extra, changed, and reordered diagnostics are bounded', () => {
  const expected = {
    schemaVersion: 'vexlife.source-manifest/v1',
    fileCount: 4,
    treeSha256: 'expected',
    files: [
      { path: 'a.txt', bytes: 1, sha256: 'a' },
      { path: 'b.txt', bytes: 1, sha256: 'b' },
      { path: 'c.txt', bytes: 1, sha256: 'c' },
      { path: 'd.txt', bytes: 1, sha256: 'd' }
    ]
  };
  const actual = {
    schemaVersion: 'vexlife.source-manifest/v1',
    fileCount: 4,
    treeSha256: 'actual',
    files: [
      { path: 'b.txt', bytes: 2, sha256: 'changed' },
      { path: 'e.txt', bytes: 1, sha256: 'e' },
      { path: 'f.txt', bytes: 1, sha256: 'f' },
      { path: 'g.txt', bytes: 1, sha256: 'g' }
    ],
    candidate: { state: 'CURRENT', blockers: [] }
  };

  const comparison = compareSourceManifest(expected, actual, { maxPathDiagnostics: 2 });

  assert.deepEqual(comparison.pathDifferences.missing, {
    total: 3,
    paths: ['a.txt', 'c.txt'],
    truncated: true
  });
  assert.deepEqual(comparison.pathDifferences.extra, {
    total: 3,
    paths: ['e.txt', 'f.txt'],
    truncated: true
  });
  assert.deepEqual(comparison.pathDifferences.changed, {
    total: 1,
    paths: ['b.txt'],
    truncated: false
  });
  assert.equal(comparison.pathDifferences.reordered.total, 4);
  assert.equal(comparison.pathDifferences.reordered.paths.length, 2);
  assert.equal(comparison.pathDifferences.reordered.truncated, true);
});

// [VXG RealForever]
