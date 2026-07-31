#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSourceManifest, compareSourceManifest } from '../src/core/source-manifest.mjs';
import { readJson, writeJson } from '../src/core/utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'SOURCE-MANIFEST.json');
const partsRoot = path.join(root, 'source-manifest-parts');

function writeSplitManifest(actual) {
  fs.rmSync(partsRoot, { recursive: true, force: true });
  fs.mkdirSync(partsRoot, { recursive: true });
  const partRefs = [];
  for (let index = 0; index < actual.files.length; index += 24) {
    const part = actual.files.slice(index, index + 24);
    const name = `part-${String(partRefs.length + 1).padStart(2, '0')}.json`;
    writeJson(path.join(partsRoot, name), { schemaVersion: actual.partSchemaVersion, files: part });
    partRefs.push(`source-manifest-parts/${name}`);
  }
  const { files, candidate, ...descriptor } = actual;
  writeJson(manifestPath, { ...descriptor, composition: 'GENERATED_FRAGMENT_COMPOSITION', parts: partRefs });
}

function readSplitManifest() {
  const descriptor = readJson(manifestPath);
  if (!descriptor.parts) return descriptor;
  const files = descriptor.parts.flatMap((partRef) => {
    const part = readJson(path.join(root, partRef));
    if (descriptor.partSchemaVersion && part.schemaVersion !== descriptor.partSchemaVersion) {
      throw new Error(
        `Source manifest part schema mismatch: ${partRef} expected=${descriptor.partSchemaVersion} actual=${part.schemaVersion}`
      );
    }
    return part.files;
  });
  const { parts, composition, ...metadata } = descriptor;
  return { ...metadata, files };
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
  } else if (process.argv.includes('--write')) {
    writeSplitManifest(actual);
    console.log(
      JSON.stringify(
        {
          state: 'SOURCE_MANIFEST_WRITTEN',
          currentness: 'CURRENT',
          sourceKind: actual.sourceKind,
          fileCount: actual.fileCount,
          parts: Math.ceil(actual.fileCount / 24),
          treeSha256: actual.treeSha256
        },
        null,
        2
      )
    );
  } else {
    if (!fs.existsSync(manifestPath)) {
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
      const comparison = compareSourceManifest(readSplitManifest(), actual);
      console.log(
        JSON.stringify(
          {
            state: comparison.ok ? 'SOURCE_MANIFEST_CURRENT' : 'SOURCE_MANIFEST_DRIFT',
            currentness: comparison.ok ? 'CURRENT' : 'STALE',
            ...comparison
          },
          null,
          2
        )
      );
      if (!comparison.ok) process.exitCode = 1;
    }
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
