import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { semanticHash } from './utils.mjs';

const EXCLUDED_DIRECTORY_SEGMENTS = new Set([
  '.agents',
  '.codex',
  '.git',
  '.vexlife',
  'artifacts',
  'generated',
  'models',
  'node_modules',
  'runtime',
  'source-manifest-parts'
]);
const EXCLUDED_ROOT_FILES = new Set(['SOURCE-MANIFEST.json']);
const SUPPORTED_BLOB_MODES = new Set(['100644', '100755', '120000']);
const ZERO_OBJECT_ID = /^0+$/u;
const DEFAULT_PATH_DIAGNOSTIC_LIMIT = 24;

function runGit(root, args, { input } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'buffer',
      input,
      maxBuffer: 32 * 1024 * 1024,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe']
    });
  } catch (error) {
    const stderr = Buffer.isBuffer(error.stderr) ? error.stderr.toString('utf8').trim() : '';
    const detail = stderr || error.message;
    throw new Error(`Git source-manifest command failed (${args.join(' ')}): ${detail}`);
  }
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  if (process.platform === 'win32') return normalizedLeft.toLowerCase() === normalizedRight.toLowerCase();
  return normalizedLeft === normalizedRight;
}

function resolveRepositoryRoot(root) {
  const requestedRoot = fs.realpathSync(path.resolve(root));
  const gitRoot = fs.realpathSync(runGit(requestedRoot, ['rev-parse', '--show-toplevel']).toString('utf8').trim());
  if (!samePath(requestedRoot, gitRoot)) {
    throw new Error(`Source manifest root must be the Git worktree root: requested=${requestedRoot} git=${gitRoot}`);
  }
  return gitRoot;
}

function splitNullRecords(buffer) {
  const records = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0) continue;
    if (index > start) records.push(buffer.subarray(start, index));
    start = index + 1;
  }
  if (start < buffer.length) records.push(buffer.subarray(start));
  return records;
}

function decodeGitPath(pathBuffer) {
  const decoded = pathBuffer.toString('utf8');
  if (!Buffer.from(decoded, 'utf8').equals(pathBuffer)) {
    throw new Error('Source manifest cannot represent a non-UTF-8 Git path without identity loss');
  }
  return decoded;
}

function compareGitPaths(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function isExcludedPath(relativePath) {
  if (EXCLUDED_ROOT_FILES.has(relativePath)) return true;
  return relativePath.split('/').some((segment) => EXCLUDED_DIRECTORY_SEGMENTS.has(segment));
}

function boundedPaths(paths, limit = DEFAULT_PATH_DIAGNOSTIC_LIMIT) {
  const ordered = [...new Set(paths)].sort(compareGitPaths);
  return {
    total: ordered.length,
    paths: ordered.slice(0, limit),
    truncated: ordered.length > limit
  };
}

function parseIndex(root) {
  const records = splitNullRecords(runGit(root, ['ls-files', '--cached', '--stage', '-z']));
  const entries = [];
  const unresolvedPaths = [];
  const unsupportedPaths = [];

  for (const record of records) {
    const separator = record.indexOf(9);
    if (separator < 0) throw new Error('Git index emitted a malformed staged entry');
    const [mode, objectId, stageText] = record.subarray(0, separator).toString('ascii').split(' ');
    const relativePath = decodeGitPath(record.subarray(separator + 1));
    const stage = Number(stageText);
    if (isExcludedPath(relativePath)) continue;
    if (stage !== 0) {
      unresolvedPaths.push(relativePath);
      continue;
    }
    if (!SUPPORTED_BLOB_MODES.has(mode) || ZERO_OBJECT_ID.test(objectId)) {
      unsupportedPaths.push(relativePath);
      continue;
    }
    entries.push({ mode, objectId, path: relativePath });
  }

  entries.sort((left, right) => compareGitPaths(left.path, right.path));
  return { entries, unresolvedPaths, unsupportedPaths };
}

function collectCandidateBlockers(root, indexState, maxPathDiagnostics) {
  const unstagedPaths = splitNullRecords(
    runGit(root, ['diff', '--name-only', '--no-ext-diff', '--ignore-submodules=none', '-z', '--'])
  )
    .map(decodeGitPath)
    .filter((relativePath) => !isExcludedPath(relativePath));
  const untrackedPaths = splitNullRecords(runGit(root, ['ls-files', '--others', '--exclude-standard', '-z']))
    .map(decodeGitPath)
    .filter((relativePath) => !isExcludedPath(relativePath));
  const blockers = [];

  for (const [kind, paths] of [
    ['UNRESOLVED_INDEX', indexState.unresolvedPaths],
    ['UNSUPPORTED_INDEX_ENTRY', indexState.unsupportedPaths],
    ['UNSTAGED_SOURCE', unstagedPaths],
    ['UNTRACKED_SOURCE', untrackedPaths]
  ]) {
    if (paths.length === 0) continue;
    blockers.push({ kind, ...boundedPaths(paths, maxPathDiagnostics) });
  }
  return blockers;
}

function hashIndexEntries(root, entries) {
  const objectIds = [...new Set(entries.map((entry) => entry.objectId))];
  if (objectIds.length === 0) return [];
  const batch = runGit(root, ['cat-file', '--batch'], { input: Buffer.from(`${objectIds.join('\n')}\n`, 'ascii') });
  const contentByObjectId = new Map();
  let offset = 0;
  for (const requestedObjectId of objectIds) {
    const headerEnd = batch.indexOf(10, offset);
    if (headerEnd < 0) throw new Error(`Git cat-file batch omitted the header for ${requestedObjectId}`);
    const [objectId, objectType, sizeText] = batch.subarray(offset, headerEnd).toString('ascii').split(' ');
    const size = Number(sizeText);
    if (objectId !== requestedObjectId || objectType !== 'blob' || !Number.isSafeInteger(size) || size < 0) {
      throw new Error(`Git cat-file batch returned an invalid blob header for ${requestedObjectId}`);
    }
    const contentStart = headerEnd + 1;
    const contentEnd = contentStart + size;
    if (contentEnd >= batch.length || batch[contentEnd] !== 10) {
      throw new Error(`Git cat-file batch returned a truncated blob for ${requestedObjectId}`);
    }
    contentByObjectId.set(objectId, batch.subarray(contentStart, contentEnd));
    offset = contentEnd + 1;
  }
  if (offset !== batch.length) throw new Error('Git cat-file batch returned unexpected trailing data');

  return entries.map((entry) => {
    const content = contentByObjectId.get(entry.objectId);
    return {
      path: entry.path,
      bytes: content.length,
      sha256: crypto.createHash('sha256').update(content).digest('hex')
    };
  });
}

export function buildSourceManifest(root, { maxPathDiagnostics = DEFAULT_PATH_DIAGNOSTIC_LIMIT } = {}) {
  const repositoryRoot = resolveRepositoryRoot(root);
  const indexState = parseIndex(repositoryRoot);
  const files = hashIndexEntries(repositoryRoot, indexState.entries);
  const blockers = collectCandidateBlockers(repositoryRoot, indexState, maxPathDiagnostics);
  return {
    schemaVersion: 'vexlife.source-manifest/v1',
    manifestRef: 'source-manifest.vexlife.universal-blueprint.001',
    rootRef: 'source-root.vexlife.universal-blueprint',
    sourceKind: 'GIT_INDEX_CANONICAL_BLOBS',
    pathOrder: 'GIT_PATH_UTF8_BYTE_ORDER',
    excludedClasses: [
      'manifest self-files',
      'Git-ignored ambient files',
      'tool-local artifacts',
      'generated output',
      'runtime state',
      'model artifacts',
      'node dependencies',
      'Git internals'
    ],
    fileCount: files.length,
    files,
    treeSha256: semanticHash(files),
    candidate: {
      state: blockers.length === 0 ? 'CURRENT' : 'BLOCKED',
      sourceKind: 'GIT_INDEX',
      blockers
    }
  };
}

function comparePathRecords(expectedFiles, actualFiles, maxPathDiagnostics) {
  if (!Array.isArray(expectedFiles) || !Array.isArray(actualFiles)) {
    const empty = boundedPaths([], maxPathDiagnostics);
    return { missing: empty, extra: empty, changed: empty, reordered: empty };
  }
  const expectedByPath = new Map(expectedFiles.map((file) => [file.path, file]));
  const actualByPath = new Map(actualFiles.map((file) => [file.path, file]));
  const missing = expectedFiles.map((file) => file.path).filter((relativePath) => !actualByPath.has(relativePath));
  const extra = actualFiles.map((file) => file.path).filter((relativePath) => !expectedByPath.has(relativePath));
  const changed = expectedFiles
    .map((file) => file.path)
    .filter((relativePath) => {
      const expectedFile = expectedByPath.get(relativePath);
      const actualFile = actualByPath.get(relativePath);
      return actualFile && (expectedFile.bytes !== actualFile.bytes || expectedFile.sha256 !== actualFile.sha256);
    });
  const reordered = actualFiles
    .map((file, index) => ({ actualPath: file.path, expectedPath: expectedFiles[index]?.path }))
    .filter(({ actualPath, expectedPath }) => expectedPath !== undefined && actualPath !== expectedPath)
    .map(({ actualPath }) => actualPath);
  return {
    missing: boundedPaths(missing, maxPathDiagnostics),
    extra: boundedPaths(extra, maxPathDiagnostics),
    changed: boundedPaths(changed, maxPathDiagnostics),
    reordered: boundedPaths(reordered, maxPathDiagnostics)
  };
}

export function compareSourceManifest(
  expected,
  actual,
  { maxPathDiagnostics = DEFAULT_PATH_DIAGNOSTIC_LIMIT } = {}
) {
  const pathDifferences = comparePathRecords(expected.files, actual.files, maxPathDiagnostics);
  const candidateState = actual.candidate?.state ?? 'CURRENT';
  const schemaMatches = expected.schemaVersion === actual.schemaVersion;
  const treeMatches = expected.treeSha256 === actual.treeSha256;
  const fileCountMatches = expected.fileCount === actual.fileCount;
  const pathsMatch =
    pathDifferences.missing.total === 0 &&
    pathDifferences.extra.total === 0 &&
    pathDifferences.changed.total === 0 &&
    pathDifferences.reordered.total === 0;
  return {
    ok: candidateState === 'CURRENT' && schemaMatches && treeMatches && fileCountMatches && pathsMatch,
    candidateState,
    candidateBlockers: actual.candidate?.blockers ?? [],
    schemaMatches,
    expectedSchemaVersion: expected.schemaVersion ?? null,
    actualSchemaVersion: actual.schemaVersion ?? null,
    expectedTreeSha256: expected.treeSha256,
    actualTreeSha256: actual.treeSha256,
    expectedFileCount: expected.fileCount,
    actualFileCount: actual.fileCount,
    pathDifferences
  };
}

// [VXG RealForever]
