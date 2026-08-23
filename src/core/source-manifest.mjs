import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { semanticHash } from './utils.mjs';

export const SOURCE_MANIFEST_V2_SCHEMA = 'vexlife.source-manifest/v2';
export const SOURCE_MANIFEST_V3_SCHEMA = 'vexlife.source-manifest/v3';
export const SOURCE_MANIFEST_RECORD_SCHEMA = 'vexlife.source-manifest-record/v1';
export const SOURCE_MANIFEST_PART_SCHEMA = 'vexlife.source-manifest-part/v1';
export const SOURCE_MANIFEST_BUCKET_COUNT = 256;

const EXCLUSION_RULES = Object.freeze({
  rootFiles: Object.freeze(['SOURCE-MANIFEST.json']),
  rootDirectories: Object.freeze([
    '.agents',
    '.codex',
    '.git',
    '.vexlife',
    'artifacts',
    'generated',
    'models',
    'runtime',
    'source-manifest-parts'
  ]),
  anyDepthDirectories: Object.freeze(['node_modules']),
  ignoredUntrackedPolicy: 'GIT_EXCLUDE_STANDARD'
});
const EXCLUDED_ROOT_FILES = new Set(EXCLUSION_RULES.rootFiles);
const EXCLUDED_ROOT_DIRECTORIES = new Set(EXCLUSION_RULES.rootDirectories);
const EXCLUDED_ANY_DEPTH_DIRECTORIES = new Set(EXCLUSION_RULES.anyDepthDirectories);
const SUPPORTED_BLOB_MODES = new Set(['100644', '100755', '120000']);
const ZERO_OBJECT_ID = /^0+$/u;
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const BUCKET_ID = /^[0-9a-f]{2}$/u;
const V3_BUCKET_REF = /^source-manifest-parts\/bucket-([0-9a-f]{2})\.json$/u;
const DEFAULT_PATH_DIAGNOSTIC_LIMIT = 24;

const V3_PARTITION = Object.freeze({
  algorithm: 'FIXED_DETERMINISTIC_PATH_HASH_BUCKETS',
  bucketCount: SOURCE_MANIFEST_BUCKET_COUNT,
  bucketBits: 8,
  bucketHash: 'SHA-256',
  bucketInput: 'EXACT_UTF8_GIT_PATH_BYTES',
  bucketId: 'LOWERCASE_HEX_OF_FIRST_SHA256_BYTE',
  bucketPath: 'source-manifest-parts/bucket-<00..ff>.json',
  emptyBucketPolicy: 'OMIT',
  withinBucketOrder: 'GIT_PATH_UTF8_BYTE_ORDER',
  globalCompositionOrder: 'GIT_PATH_UTF8_BYTE_ORDER'
});

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

function resolveRepositoryRoot(root) {
  const requestedRoot = fs.realpathSync(path.resolve(root));
  const gitPrefix = runGit(requestedRoot, ['rev-parse', '--show-prefix']).toString('utf8').trim();
  const gitRoot = fs.realpathSync(runGit(requestedRoot, ['rev-parse', '--show-toplevel']).toString('utf8').trim());
  if (gitPrefix !== '') {
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

export function compareGitPaths(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function isExcludedPath(relativePath) {
  if (EXCLUDED_ROOT_FILES.has(relativePath)) return true;
  const segments = relativePath.split('/');
  if (segments.length > 1 && EXCLUDED_ROOT_DIRECTORIES.has(segments[0])) return true;
  return segments.some((segment) => EXCLUDED_ANY_DEPTH_DIRECTORIES.has(segment));
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
      mode: entry.mode,
      bytes: content.length,
      sha256: crypto.createHash('sha256').update(content).digest('hex')
    };
  });
}

function commonContractFields() {
  return {
    manifestRef: 'source-manifest.vexlife.universal-blueprint.001',
    rootRef: 'source-root.vexlife.universal-blueprint',
    sourceRecordSchemaVersion: SOURCE_MANIFEST_RECORD_SCHEMA,
    partSchemaVersion: SOURCE_MANIFEST_PART_SCHEMA,
    sourceKind: 'GIT_INDEX_CANONICAL_BLOBS',
    pathOrder: 'GIT_PATH_UTF8_BYTE_ORDER',
    exclusionRules: {
      rootFiles: [...EXCLUSION_RULES.rootFiles],
      rootDirectories: [...EXCLUSION_RULES.rootDirectories],
      anyDepthDirectories: [...EXCLUSION_RULES.anyDepthDirectories],
      ignoredUntrackedPolicy: EXCLUSION_RULES.ignoredUntrackedPolicy
    },
    excludedClasses: [
      'manifest self-files',
      'Git-ignored ambient files',
      'root-anchored tool-local artifacts',
      'root-anchored generated output',
      'root-anchored runtime state',
      'root-anchored model artifacts',
      'any-depth node dependencies',
      'Git internals'
    ]
  };
}

function manifestContract(manifest) {
  const contract = {
    schemaVersion: manifest.schemaVersion ?? null,
    manifestRef: manifest.manifestRef ?? null,
    rootRef: manifest.rootRef ?? null,
    sourceRecordSchemaVersion: manifest.sourceRecordSchemaVersion ?? null,
    partSchemaVersion: manifest.partSchemaVersion ?? null,
    sourceKind: manifest.sourceKind ?? null,
    pathOrder: manifest.pathOrder ?? null,
    exclusionRules: manifest.exclusionRules ?? null,
    excludedClasses: manifest.excludedClasses ?? null
  };
  if (manifest.schemaVersion === SOURCE_MANIFEST_V3_SCHEMA) {
    contract.composition = manifest.composition ?? null;
    contract.partition = manifest.partition ?? null;
  }
  return contract;
}

function contractForSchema(schemaVersion) {
  if (schemaVersion === SOURCE_MANIFEST_V2_SCHEMA) {
    return { schemaVersion, ...commonContractFields() };
  }
  if (schemaVersion === SOURCE_MANIFEST_V3_SCHEMA) {
    return {
      schemaVersion,
      ...commonContractFields(),
      composition: 'STABLE_PATH_HASH_BUCKET_COMPOSITION',
      partition: { ...V3_PARTITION }
    };
  }
  throw new Error(`Unsupported source manifest schema: ${schemaVersion}`);
}

export function sourceManifestBucketId(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new TypeError('source manifest bucket path must be a non-empty string');
  }
  const pathBytes = Buffer.from(relativePath, 'utf8');
  if (pathBytes.toString('utf8') !== relativePath) {
    throw new Error('source manifest bucket path must round-trip through UTF-8 exactly');
  }
  return crypto.createHash('sha256').update(pathBytes).digest().subarray(0, 1).toString('hex');
}

export function sourceManifestBucketPath(bucketId) {
  if (!BUCKET_ID.test(bucketId)) throw new Error(`Invalid source manifest bucket id: ${bucketId}`);
  return `source-manifest-parts/bucket-${bucketId}.json`;
}

function validateRecord(record, label) {
  if (!record || typeof record !== 'object') throw new Error(`${label} must be an object`);
  if (typeof record.path !== 'string' || record.path.length === 0) throw new Error(`${label}.path must be non-empty`);
  if (!SUPPORTED_BLOB_MODES.has(record.mode)) throw new Error(`${label}.mode is unsupported: ${record.mode}`);
  if (!Number.isSafeInteger(record.bytes) || record.bytes < 0) throw new Error(`${label}.bytes must be a non-negative safe integer`);
  if (!SHA256_HEX.test(record.sha256)) throw new Error(`${label}.sha256 must be lowercase SHA-256 hex`);
}

export function partitionSourceManifestFiles(files) {
  if (!Array.isArray(files)) throw new TypeError('source manifest files must be an array');
  const byBucket = new Map();
  for (const [index, record] of files.entries()) {
    validateRecord(record, `files[${index}]`);
    const bucketId = sourceManifestBucketId(record.path);
    if (!byBucket.has(bucketId)) byBucket.set(bucketId, []);
    byBucket.get(bucketId).push(record);
  }
  return [...byBucket.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([bucketId, bucketFiles]) => ({
      bucketId,
      path: sourceManifestBucketPath(bucketId),
      files: [...bucketFiles].sort((left, right) => compareGitPaths(left.path, right.path))
    }));
}

export function sourceManifestBucketClaim(paths) {
  if (!Array.isArray(paths)) throw new TypeError('source manifest claim paths must be an array');
  return [...new Set(paths.map((relativePath) => sourceManifestBucketPath(sourceManifestBucketId(relativePath))))]
    .sort(compareGitPaths);
}

export function sourceManifestBucketOverlap(leftPaths, rightPaths) {
  const left = new Set(sourceManifestBucketClaim(leftPaths));
  return sourceManifestBucketClaim(rightPaths).filter((bucketPath) => left.has(bucketPath));
}

export function changedSourceManifestBuckets(beforeFiles, afterFiles) {
  const beforeByPath = new Map(beforeFiles.map((record) => [record.path, record]));
  const afterByPath = new Map(afterFiles.map((record) => [record.path, record]));
  const changedPaths = [];
  for (const relativePath of new Set([...beforeByPath.keys(), ...afterByPath.keys()])) {
    const before = beforeByPath.get(relativePath);
    const after = afterByPath.get(relativePath);
    if (!before || !after || before.mode !== after.mode || before.bytes !== after.bytes || before.sha256 !== after.sha256) {
      changedPaths.push(relativePath);
    }
  }
  return sourceManifestBucketClaim(changedPaths);
}

export function buildSourceManifestDescriptor(actual) {
  if (actual.schemaVersion !== SOURCE_MANIFEST_V3_SCHEMA) {
    throw new Error(`Stable descriptor requires ${SOURCE_MANIFEST_V3_SCHEMA}`);
  }
  const contract = manifestContract(actual);
  return { ...contract, contractSha256: semanticHash(contract) };
}

export function buildSourceManifest(
  root,
  { maxPathDiagnostics = DEFAULT_PATH_DIAGNOSTIC_LIMIT, schemaVersion = SOURCE_MANIFEST_V3_SCHEMA } = {}
) {
  const repositoryRoot = resolveRepositoryRoot(root);
  const indexState = parseIndex(repositoryRoot);
  const files = hashIndexEntries(repositoryRoot, indexState.entries);
  const blockers = collectCandidateBlockers(repositoryRoot, indexState, maxPathDiagnostics);
  const contract = contractForSchema(schemaVersion);
  const result = {
    ...contract,
    fileCount: files.length,
    files,
    treeSha256: semanticHash(files),
    candidate: {
      state: blockers.length === 0 ? 'CURRENT' : 'BLOCKED',
      sourceKind: 'GIT_INDEX',
      blockers
    }
  };
  if (schemaVersion === SOURCE_MANIFEST_V3_SCHEMA) {
    result.contractSha256 = semanticHash(manifestContract(result));
  }
  return result;
}

function normalizePartEntries(partEntries) {
  if (partEntries instanceof Map) return [...partEntries.entries()].map(([ref, value]) => ({ ref, value }));
  if (!Array.isArray(partEntries)) throw new TypeError('source manifest part entries must be an array or Map');
  return partEntries.map((entry) => {
    if (!entry || typeof entry.ref !== 'string') throw new Error('source manifest part entry requires ref');
    return entry;
  });
}

function hydrateV2Manifest(descriptor, partEntries) {
  if (!Array.isArray(descriptor.parts)) throw new Error('v2 source manifest descriptor requires parts[]');
  const entries = normalizePartEntries(partEntries);
  const byRef = new Map(entries.map((entry) => [entry.ref, entry.value]));
  if (byRef.size !== entries.length) throw new Error('v2 source manifest contains duplicate part refs');
  const expectedRefs = new Set(descriptor.parts);
  const unknown = entries.map((entry) => entry.ref).filter((ref) => !expectedRefs.has(ref));
  if (unknown.length > 0) throw new Error(`v2 source manifest has unknown part refs: ${unknown.join(', ')}`);
  const files = descriptor.parts.flatMap((partRef) => {
    const part = byRef.get(partRef);
    if (!part) throw new Error(`v2 source manifest part missing: ${partRef}`);
    if (descriptor.partSchemaVersion && part.schemaVersion !== descriptor.partSchemaVersion) {
      throw new Error(
        `Source manifest part schema mismatch: ${partRef} expected=${descriptor.partSchemaVersion} actual=${part.schemaVersion}`
      );
    }
    if (!Array.isArray(part.files)) throw new Error(`v2 source manifest part files missing: ${partRef}`);
    return part.files;
  });
  return { ...descriptor, files, candidate: { state: 'CURRENT', blockers: [] } };
}

function hydrateV3Manifest(descriptor, partEntries) {
  for (const forbidden of ['fileCount', 'treeSha256', 'parts']) {
    if (Object.hasOwn(descriptor, forbidden)) {
      throw new Error(`v3 stable source manifest root must not store dynamic ${forbidden}`);
    }
  }
  const expectedContractSha256 = semanticHash(manifestContract(descriptor));
  if (descriptor.contractSha256 !== expectedContractSha256) {
    throw new Error(
      `v3 source manifest contract fingerprint mismatch: expected=${expectedContractSha256} actual=${descriptor.contractSha256}`
    );
  }
  const entries = normalizePartEntries(partEntries);
  const seenBuckets = new Set();
  const seenPaths = new Set();
  const files = [];

  for (const entry of entries) {
    const match = V3_BUCKET_REF.exec(entry.ref);
    if (!match) throw new Error(`v3 source manifest has unknown generated part: ${entry.ref}`);
    const bucketId = match[1];
    if (seenBuckets.has(bucketId)) throw new Error(`v3 source manifest duplicates bucket ${bucketId}`);
    seenBuckets.add(bucketId);
    const part = entry.value;
    if (!part || part.schemaVersion !== descriptor.partSchemaVersion) {
      throw new Error(`v3 source manifest bucket schema mismatch: ${entry.ref}`);
    }
    if (part.bucketId !== bucketId) {
      throw new Error(`v3 source manifest bucket id mismatch: ${entry.ref} declares ${part.bucketId}`);
    }
    if (!Array.isArray(part.files) || part.files.length === 0) {
      throw new Error(`v3 source manifest empty buckets must be omitted: ${entry.ref}`);
    }
    let previousPath = null;
    for (const [index, record] of part.files.entries()) {
      validateRecord(record, `${entry.ref}.files[${index}]`);
      if (sourceManifestBucketId(record.path) !== bucketId) {
        throw new Error(`v3 source manifest record is misbucketed: ${record.path} in ${entry.ref}`);
      }
      if (previousPath !== null && compareGitPaths(previousPath, record.path) >= 0) {
        throw new Error(`v3 source manifest bucket order is not strict: ${entry.ref}`);
      }
      if (seenPaths.has(record.path)) throw new Error(`v3 source manifest duplicates path: ${record.path}`);
      seenPaths.add(record.path);
      previousPath = record.path;
      files.push(record);
    }
  }

  files.sort((left, right) => compareGitPaths(left.path, right.path));
  return {
    ...descriptor,
    fileCount: files.length,
    files,
    treeSha256: semanticHash(files),
    candidate: { state: 'CURRENT', blockers: [] }
  };
}

export function hydrateStoredSourceManifest(descriptor, partEntries) {
  if (!descriptor || typeof descriptor !== 'object') throw new TypeError('source manifest descriptor must be an object');
  if (descriptor.schemaVersion === SOURCE_MANIFEST_V2_SCHEMA) return hydrateV2Manifest(descriptor, partEntries);
  if (descriptor.schemaVersion === SOURCE_MANIFEST_V3_SCHEMA) return hydrateV3Manifest(descriptor, partEntries);
  throw new Error(`Unsupported stored source manifest schema: ${descriptor.schemaVersion}`);
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
      return (
        actualFile &&
        (expectedFile.mode !== actualFile.mode ||
          expectedFile.bytes !== actualFile.bytes ||
          expectedFile.sha256 !== actualFile.sha256)
      );
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
  const expectedContractSha256 = semanticHash(manifestContract(expected));
  const actualContractSha256 = semanticHash(manifestContract(actual));
  const expectedContractFingerprintValid =
    expected.schemaVersion !== SOURCE_MANIFEST_V3_SCHEMA || expected.contractSha256 === expectedContractSha256;
  const actualContractFingerprintValid =
    actual.schemaVersion !== SOURCE_MANIFEST_V3_SCHEMA || actual.contractSha256 === actualContractSha256;
  const contractMatches = expectedContractSha256 === actualContractSha256;
  const treeMatches = expected.treeSha256 === actual.treeSha256;
  const fileCountMatches = expected.fileCount === actual.fileCount;
  const pathsMatch =
    pathDifferences.missing.total === 0 &&
    pathDifferences.extra.total === 0 &&
    pathDifferences.changed.total === 0 &&
    pathDifferences.reordered.total === 0;
  return {
    ok:
      candidateState === 'CURRENT' &&
      schemaMatches &&
      expectedContractFingerprintValid &&
      actualContractFingerprintValid &&
      contractMatches &&
      treeMatches &&
      fileCountMatches &&
      pathsMatch,
    candidateState,
    candidateBlockers: actual.candidate?.blockers ?? [],
    schemaMatches,
    contractMatches,
    expectedContractFingerprintValid,
    actualContractFingerprintValid,
    expectedContractSha256,
    actualContractSha256,
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