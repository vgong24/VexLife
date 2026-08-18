import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  SOURCE_MANIFEST_V2_SCHEMA,
  SOURCE_MANIFEST_V3_SCHEMA,
  buildSourceManifest,
  buildSourceManifestDescriptor,
  changedSourceManifestBuckets,
  compareSourceManifest,
  hydrateStoredSourceManifest,
  partitionSourceManifestFiles,
  sourceManifestBucketClaim,
  sourceManifestBucketId,
  sourceManifestBucketOverlap,
  sourceManifestBucketPath
} from '../src/core/source-manifest.mjs';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

function record(relativePath, content = relativePath, mode = '100644') {
  return {
    path: relativePath,
    mode,
    bytes: Buffer.byteLength(content),
    sha256: crypto.createHash('sha256').update(content).digest('hex')
  };
}

function v3Stored(actual) {
  const descriptor = buildSourceManifestDescriptor(actual);
  const parts = partitionSourceManifestFiles(actual.files).map((bucket) => ({
    ref: bucket.path,
    value: { schemaVersion: actual.partSchemaVersion, bucketId: bucket.bucketId, files: bucket.files }
  }));
  return { descriptor, parts };
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
  assert.equal(first.schemaVersion, SOURCE_MANIFEST_V3_SCHEMA);
  assert.equal(first.sourceKind, 'GIT_INDEX_CANONICAL_BLOBS');
  assert.equal(first.sourceRecordSchemaVersion, 'vexlife.source-manifest-record/v1');
  assert.equal(first.partSchemaVersion, 'vexlife.source-manifest-part/v1');
  assert.equal(first.candidate.state, 'CURRENT');
  assert.deepEqual(first.files.map((file) => file.path), ['.gitattributes', '.gitignore', 'src/a.txt']);
  assert.equal(first.files.find((file) => file.path === 'src/a.txt').mode, '100644');
  assert.deepEqual(first.exclusionRules, {
    rootFiles: ['SOURCE-MANIFEST.json'],
    rootDirectories: [
      '.agents',
      '.codex',
      '.git',
      '.vexlife',
      'artifacts',
      'generated',
      'models',
      'runtime',
      'source-manifest-parts'
    ],
    anyDepthDirectories: ['node_modules'],
    ignoredUntrackedPolicy: 'GIT_EXCLUDE_STANDARD'
  });
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

test('staged mode-only transitions change the tree hash and exact path evidence', (t) => {
  const root = seedRepository(t);
  const before = buildSourceManifest(root);
  git(root, 'update-index', '--chmod=+x', 'src/a.txt');
  fs.chmodSync(path.join(root, 'src/a.txt'), 0o755);
  const after = buildSourceManifest(root);
  const comparison = compareSourceManifest(before, after);

  assert.equal(before.files.find((file) => file.path === 'src/a.txt').mode, '100644');
  assert.equal(after.files.find((file) => file.path === 'src/a.txt').mode, '100755');
  assert.equal(after.candidate.state, 'CURRENT');
  assert.notEqual(after.treeSha256, before.treeSha256);
  assert.deepEqual(comparison.pathDifferences.changed, {
    total: 1,
    paths: ['src/a.txt'],
    truncated: false
  });
});

test('root-anchored state names do not exclude similarly named nested source', (t) => {
  const root = seedRepository(t);
  for (const relativePath of [
    'runtime/root-state.mjs',
    'models/root-model.mjs',
    'generated/root-output.mjs',
    'artifacts/root-artifact.mjs',
    'src/runtime/worker.mjs',
    'src/models/domain.mjs',
    'src/generated/schema.mjs',
    'src/artifacts/catalog.mjs'
  ]) {
    write(root, relativePath, `export const source = ${JSON.stringify(relativePath)};\n`);
  }
  git(root, 'add', '--all');

  const actual = buildSourceManifest(root);
  const paths = actual.files.map((file) => file.path);

  assert.equal(actual.candidate.state, 'CURRENT');
  assert.deepEqual(
    paths.filter((relativePath) => relativePath.startsWith('src/')),
    ['src/a.txt', 'src/artifacts/catalog.mjs', 'src/generated/schema.mjs', 'src/models/domain.mjs', 'src/runtime/worker.mjs']
  );
  assert.equal(paths.some((relativePath) => relativePath.startsWith('runtime/')), false);
  assert.equal(paths.some((relativePath) => relativePath.startsWith('models/')), false);
  assert.equal(paths.some((relativePath) => relativePath.startsWith('generated/')), false);
  assert.equal(paths.some((relativePath) => relativePath.startsWith('artifacts/')), false);
});

test('unstaged and untracked nested source remains visible', (t) => {
  const root = seedRepository(t);
  write(root, 'src/runtime/worker.mjs', 'export const state = "staged";\n');
  git(root, 'add', 'src/runtime/worker.mjs');
  write(root, 'src/runtime/worker.mjs', 'export const state = "unstaged";\n');
  write(root, 'src/models/untracked.mjs', 'export const state = "untracked";\n');

  const actual = buildSourceManifest(root);

  assert.deepEqual(blocker(actual, 'UNSTAGED_SOURCE'), {
    kind: 'UNSTAGED_SOURCE',
    total: 1,
    paths: ['src/runtime/worker.mjs'],
    truncated: false
  });
  assert.deepEqual(blocker(actual, 'UNTRACKED_SOURCE'), {
    kind: 'UNTRACKED_SOURCE',
    total: 1,
    paths: ['src/models/untracked.mjs'],
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
    schemaVersion: SOURCE_MANIFEST_V2_SCHEMA,
    fileCount: 4,
    treeSha256: 'expected',
    files: [
      { path: 'a.txt', mode: '100644', bytes: 1, sha256: 'a' },
      { path: 'b.txt', mode: '100644', bytes: 1, sha256: 'b' },
      { path: 'c.txt', mode: '100644', bytes: 1, sha256: 'c' },
      { path: 'd.txt', mode: '100644', bytes: 1, sha256: 'd' }
    ]
  };
  const actual = {
    schemaVersion: SOURCE_MANIFEST_V2_SCHEMA,
    fileCount: 4,
    treeSha256: 'actual',
    files: [
      { path: 'b.txt', mode: '100755', bytes: 2, sha256: 'changed' },
      { path: 'e.txt', mode: '100644', bytes: 1, sha256: 'e' },
      { path: 'f.txt', mode: '100644', bytes: 1, sha256: 'f' },
      { path: 'g.txt', mode: '100644', bytes: 1, sha256: 'g' }
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

test('v3 path hashing uses the first SHA-256 byte of exact UTF-8 Git path bytes', () => {
  for (const relativePath of ['src/a.txt', 'src/日本語.mjs', 'reference/browser/index.html']) {
    const expected = crypto.createHash('sha256').update(Buffer.from(relativePath, 'utf8')).digest('hex').slice(0, 2);
    assert.equal(sourceManifestBucketId(relativePath), expected);
    assert.equal(sourceManifestBucketPath(expected), `source-manifest-parts/bucket-${expected}.json`);
  }
});

test('v3 stable descriptor excludes candidate aggregate snapshot fields', (t) => {
  const root = seedRepository(t);
  const actual = buildSourceManifest(root);
  const descriptor = buildSourceManifestDescriptor(actual);

  assert.equal(descriptor.schemaVersion, SOURCE_MANIFEST_V3_SCHEMA);
  assert.equal(descriptor.partition.bucketCount, 256);
  assert.equal(descriptor.partition.bucketInput, 'EXACT_UTF8_GIT_PATH_BYTES');
  assert.equal(descriptor.partition.emptyBucketPolicy, 'OMIT');
  assert.equal(Object.hasOwn(descriptor, 'files'), false);
  assert.equal(Object.hasOwn(descriptor, 'fileCount'), false);
  assert.equal(Object.hasOwn(descriptor, 'treeSha256'), false);
  assert.match(descriptor.contractSha256, /^[0-9a-f]{64}$/u);
});

test('v3 partition hydration reproduces canonical aggregate exactly', (t) => {
  const root = seedRepository(t);
  write(root, 'src/日本語.mjs', 'export const multilingual = true;\n');
  git(root, 'add', 'src/日本語.mjs');
  const actual = buildSourceManifest(root);
  const stored = v3Stored(actual);
  const hydrated = hydrateStoredSourceManifest(stored.descriptor, stored.parts);

  assert.equal(hydrated.fileCount, actual.fileCount);
  assert.equal(hydrated.treeSha256, actual.treeSha256);
  assert.deepEqual(hydrated.files, actual.files);
  assert.equal(compareSourceManifest(hydrated, actual).ok, true);
});

test('v2 positional manifest remains readable for migration equivalence', (t) => {
  const root = seedRepository(t);
  write(root, 'src/b.txt', 'bravo\n');
  git(root, 'add', 'src/b.txt');
  const v2 = buildSourceManifest(root, { schemaVersion: SOURCE_MANIFEST_V2_SCHEMA });
  const descriptor = {
    ...Object.fromEntries(Object.entries(v2).filter(([key]) => !['files', 'candidate'].includes(key))),
    composition: 'GENERATED_FRAGMENT_COMPOSITION',
    parts: ['source-manifest-parts/part-01.json']
  };
  const hydrated = hydrateStoredSourceManifest(descriptor, [{
    ref: 'source-manifest-parts/part-01.json',
    value: { schemaVersion: v2.partSchemaVersion, files: v2.files }
  }]);

  assert.equal(hydrated.treeSha256, v2.treeSha256);
  assert.deepEqual(hydrated.files, v2.files);
});

test('content and mode edits touch one stable bucket and leave root contract byte-stable', (t) => {
  const root = seedRepository(t);
  const before = buildSourceManifest(root);
  const descriptorBefore = buildSourceManifestDescriptor(before);
  write(root, 'src/a.txt', 'beta\n');
  git(root, 'add', 'src/a.txt');
  const contentAfter = buildSourceManifest(root);
  assert.deepEqual(changedSourceManifestBuckets(before.files, contentAfter.files), sourceManifestBucketClaim(['src/a.txt']));
  assert.deepEqual(buildSourceManifestDescriptor(contentAfter), descriptorBefore);

  git(root, 'update-index', '--chmod=+x', 'src/a.txt');
  fs.chmodSync(path.join(root, 'src/a.txt'), 0o755);
  const modeAfter = buildSourceManifest(root);
  assert.deepEqual(changedSourceManifestBuckets(contentAfter.files, modeAfter.files), sourceManifestBucketClaim(['src/a.txt']));
  assert.deepEqual(buildSourceManifestDescriptor(modeAfter), descriptorBefore);
});

test('add/delete changes one bucket and rename changes at most two', (t) => {
  const root = seedRepository(t);
  const before = buildSourceManifest(root);
  write(root, 'src/new.mjs', 'export const x = 1;\n');
  git(root, 'add', 'src/new.mjs');
  const added = buildSourceManifest(root);
  assert.deepEqual(changedSourceManifestBuckets(before.files, added.files), sourceManifestBucketClaim(['src/new.mjs']));

  git(root, 'rm', '--quiet', '--force', 'src/new.mjs');
  const deleted = buildSourceManifest(root);
  assert.deepEqual(changedSourceManifestBuckets(added.files, deleted.files), sourceManifestBucketClaim(['src/new.mjs']));

  git(root, 'mv', 'src/a.txt', 'src/renamed-a.txt');
  const renamed = buildSourceManifest(root);
  assert.equal(changedSourceManifestBuckets(deleted.files, renamed.files).length <= 2, true);
  assert.deepEqual(
    changedSourceManifestBuckets(deleted.files, renamed.files),
    sourceManifestBucketClaim(['src/a.txt', 'src/renamed-a.txt'])
  );
});

test('disjoint bucket claims compose and same-bucket claims remain truthful collisions', () => {
  let different = null;
  let same = null;
  const basePath = 'src/candidate-0.mjs';
  const baseBucket = sourceManifestBucketId(basePath);
  for (let index = 1; index < 10000 && (!different || !same); index += 1) {
    const candidate = `src/candidate-${index}.mjs`;
    const bucket = sourceManifestBucketId(candidate);
    if (!different && bucket !== baseBucket) different = candidate;
    if (!same && bucket === baseBucket) same = candidate;
  }
  assert.ok(different);
  assert.ok(same);
  assert.deepEqual(sourceManifestBucketOverlap([basePath], [different]), []);
  assert.deepEqual(sourceManifestBucketOverlap([basePath], [same]), sourceManifestBucketClaim([basePath]));
});

test('v3 reader fails closed on unknown, misbucketed, duplicate, and dynamically snapshotted parts', () => {
  const files = [record('src/a.txt'), record('src/b.txt')].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const actual = {
    schemaVersion: SOURCE_MANIFEST_V3_SCHEMA,
    manifestRef: 'source-manifest.vexlife.universal-blueprint.001',
    rootRef: 'source-root.vexlife.universal-blueprint',
    sourceRecordSchemaVersion: 'vexlife.source-manifest-record/v1',
    partSchemaVersion: 'vexlife.source-manifest-part/v1',
    sourceKind: 'GIT_INDEX_CANONICAL_BLOBS',
    pathOrder: 'GIT_PATH_UTF8_BYTE_ORDER',
    exclusionRules: { rootFiles: [], rootDirectories: [], anyDepthDirectories: [], ignoredUntrackedPolicy: 'GIT_EXCLUDE_STANDARD' },
    excludedClasses: [],
    composition: 'STABLE_PATH_HASH_BUCKET_COMPOSITION',
    partition: {
      algorithm: 'FIXED_DETERMINISTIC_PATH_HASH_BUCKETS', bucketCount: 256, bucketBits: 8, bucketHash: 'SHA-256',
      bucketInput: 'EXACT_UTF8_GIT_PATH_BYTES', bucketId: 'LOWERCASE_HEX_OF_FIRST_SHA256_BYTE',
      bucketPath: 'source-manifest-parts/bucket-<00..ff>.json', emptyBucketPolicy: 'OMIT',
      withinBucketOrder: 'GIT_PATH_UTF8_BYTE_ORDER', globalCompositionOrder: 'GIT_PATH_UTF8_BYTE_ORDER'
    },
    files,
    candidate: { state: 'CURRENT', blockers: [] }
  };
  actual.contractSha256 = buildSourceManifestDescriptor(actual).contractSha256;
  const descriptor = buildSourceManifestDescriptor(actual);
  const buckets = partitionSourceManifestFiles(files);
  const parts = buckets.map((bucket) => ({ ref: bucket.path, value: { schemaVersion: actual.partSchemaVersion, bucketId: bucket.bucketId, files: bucket.files } }));

  assert.throws(() => hydrateStoredSourceManifest(descriptor, [...parts, { ref: 'source-manifest-parts/part-99.json', value: {} }]), /unknown generated part/u);

  const wrongBucket = sourceManifestBucketId(files[0].path) === '00' ? '01' : '00';
  assert.throws(() => hydrateStoredSourceManifest(descriptor, [{
    ref: `source-manifest-parts/bucket-${wrongBucket}.json`,
    value: { schemaVersion: actual.partSchemaVersion, bucketId: wrongBucket, files: [files[0]] }
  }]), /misbucketed/u);

  assert.throws(() => hydrateStoredSourceManifest(descriptor, [parts[0], parts[0]]), /duplicates bucket/u);
  assert.throws(() => hydrateStoredSourceManifest({ ...descriptor, fileCount: 2 }, parts), /must not store dynamic fileCount/u);
});

test('CI keeps Linux foundation, Windows/Linux manifest cells, and derives aggregate identity from source', () => {
  const workflow = fs.readFileSync(path.join(REPOSITORY_ROOT, '.github/workflows/check.yml'), 'utf8');

  assert.match(workflow, /foundation:\s+name: Source, blueprint, and actual browser contracts/);
  assert.match(workflow, /manifest-portability:/);
  assert.match(workflow, /runner: ubuntu-latest/);
  assert.match(workflow, /runner: windows-latest/);
  assert.match(workflow, /node --test test\/source-manifest\.test\.mjs/);
  assert.match(workflow, /npm(?:\.cmd)? run --silent manifest:check/);
  assert.match(workflow, /candidateHeadSha/);
  assert.match(workflow, /baseSha/);
  assert.match(workflow, /manifestSchemaVersion/);
  assert.match(workflow, /sourceRecordSchemaVersion/);
  assert.match(workflow, /partSchemaVersion/);
  assert.match(workflow, /buildSourceManifest/);
  assert.match(workflow, /treeSha256: actualManifest\.treeSha256/);
  assert.match(workflow, /source-manifest-portability-\$\{\{ matrix\.id \}\}\.json/);
});

// [VXG RealForever]
