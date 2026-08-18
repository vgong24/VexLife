#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SOURCE_MANIFEST_V2_SCHEMA,
  SOURCE_MANIFEST_V3_SCHEMA,
  buildSourceManifest,
  buildSourceManifestDescriptor,
  compareSourceManifest,
  hydrateStoredSourceManifest,
  partitionSourceManifestFiles
} from '../src/core/source-manifest.mjs';
import { readJson } from '../src/core/utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'SOURCE-MANIFEST.json');
const partsRoot = path.join(root, 'source-manifest-parts');
const migrateV3 = process.argv.includes('--migrate-v3');
const writeRequested = process.argv.includes('--write');

function jsonBytes(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeJsonIfChanged(filePath, value) {
  const next = jsonBytes(value);
  const prior = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (prior === next) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, next, 'utf8');
  return true;
}

function readStoredPartEntries(descriptor) {
  if (descriptor.schemaVersion === SOURCE_MANIFEST_V2_SCHEMA) {
    if (!Array.isArray(descriptor.parts)) throw new Error('v2 source manifest descriptor requires parts[]');
    return descriptor.parts.map((ref) => ({ ref, value: readJson(path.join(root, ref)) }));
  }
  if (descriptor.schemaVersion === SOURCE_MANIFEST_V3_SCHEMA) {
    if (!fs.existsSync(partsRoot)) return [];
    return fs.readdirSync(partsRoot, { withFileTypes: true })
      .map((entry) => {
        if (!entry.isFile()) throw new Error(`v3 source manifest has unknown generated entry: source-manifest-parts/${entry.name}`);
        const ref = `source-manifest-parts/${entry.name}`;
        return { ref, value: readJson(path.join(root, ref)) };
      });
  }
  throw new Error(`Unsupported stored source manifest schema: ${descriptor.schemaVersion}`);
}

function readStoredManifest() {
  const descriptor = readJson(manifestPath);
  return hydrateStoredSourceManifest(descriptor, readStoredPartEntries(descriptor));
}

function writeStableManifest(actual, { allowLegacyMigration }) {
  const descriptor = buildSourceManifestDescriptor(actual);
  const buckets = partitionSourceManifestFiles(actual.files);
  const desiredByName = new Map(buckets.map((bucket) => [path.basename(bucket.path), bucket]));
  fs.mkdirSync(partsRoot, { recursive: true });

  const existingNames = fs.readdirSync(partsRoot);
  const deleted = [];
  const written = [];
  const unchanged = [];
  for (const name of existingNames) {
    const isLegacy = /^part-[0-9]+\.json$/u.test(name);
    const isBucket = /^bucket-[0-9a-f]{2}\.json$/u.test(name);
    if (!isLegacy && !isBucket) {
      throw new Error(`v3 source manifest has unknown generated part: source-manifest-parts/${name}`);
    }
    if (isLegacy && !allowLegacyMigration) {
      throw new Error(`legacy v2 source manifest part requires explicit migration: source-manifest-parts/${name}`);
    }
    if ((isLegacy && allowLegacyMigration) || (isBucket && !desiredByName.has(name))) {
      fs.rmSync(path.join(partsRoot, name));
      deleted.push(`source-manifest-parts/${name}`);
    }
  }

  for (const bucket of buckets) {
    const value = { schemaVersion: actual.partSchemaVersion, bucketId: bucket.bucketId, files: bucket.files };
    if (writeJsonIfChanged(path.join(root, bucket.path), value)) written.push(bucket.path);
    else unchanged.push(bucket.path);
  }
  const rootChanged = writeJsonIfChanged(manifestPath, descriptor);
  return { rootChanged, deleted, written, unchanged, bucketCount: buckets.length };
}

try {
  const actual = buildSourceManifest(root);
  if (actual.candidate.state !== 'CURRENT') {
    console.log(
      JSON.stringify(
        {
          state: 'SOURCE_MANIFEST_BLOCKED',
          currentness: 'BLOCKED',
          candidateState: actual.candidate.state,
          candidateBlockers: actual.candidate.blockers,
          fileCount: actual.fileCount,
          treeSha256: actual.treeSha256
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  } else if (writeRequested) {
    const existingDescriptor = fs.existsSync(manifestPath) ? readJson(manifestPath) : null;
    const allowLegacyMigration = migrateV3 || existingDescriptor?.schemaVersion === SOURCE_MANIFEST_V2_SCHEMA;
    const writeResult = writeStableManifest(actual, { allowLegacyMigration });
    console.log(
      JSON.stringify(
        {
          state: 'SOURCE_MANIFEST_WRITTEN',
          currentness: 'CURRENT',
          migrationPerformed: existingDescriptor?.schemaVersion === SOURCE_MANIFEST_V2_SCHEMA,
          sourceKind: actual.sourceKind,
          schemaVersion: actual.schemaVersion,
          fileCount: actual.fileCount,
          nonemptyBuckets: writeResult.bucketCount,
          rootChanged: writeResult.rootChanged,
          written: writeResult.written,
          deleted: writeResult.deleted,
          unchangedBucketCount: writeResult.unchanged.length,
          treeSha256: actual.treeSha256,
          contractSha256: actual.contractSha256
        },
        null,
        2
      )
    );
  } else if (!fs.existsSync(manifestPath)) {
    console.log(
      JSON.stringify(
        {
          state: 'SOURCE_MANIFEST_BLOCKED',
          currentness: 'BLOCKED',
          reason: 'SOURCE_MANIFEST_MISSING',
          path: 'SOURCE-MANIFEST.json'
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  } else {
    const expected = readStoredManifest();
    const comparison = compareSourceManifest(expected, actual);
    const phaseAHold = expected.schemaVersion === SOURCE_MANIFEST_V2_SCHEMA && actual.schemaVersion === SOURCE_MANIFEST_V3_SCHEMA;
    console.log(
      JSON.stringify(
        {
          state: comparison.ok ? 'SOURCE_MANIFEST_CURRENT' : 'SOURCE_MANIFEST_DRIFT',
          currentness: comparison.ok ? 'CURRENT' : 'STALE',
          reason: !comparison.ok && phaseAHold ? 'EXPECTED_PHASE_A_GENERATED_CURRENTNESS_HOLD' : undefined,
          ...comparison
        },
        null,
        2
      )
    );
    if (!comparison.ok) process.exitCode = 1;
  }
} catch (error) {
  console.log(
    JSON.stringify(
      {
        state: 'SOURCE_MANIFEST_BLOCKED',
        currentness: 'BLOCKED',
        reason: 'GIT_CANDIDATE_UNAVAILABLE',
        detail: error.message
      },
      null,
      2
    )
  );
  process.exitCode = 1;
}

// [VXG RealForever]
