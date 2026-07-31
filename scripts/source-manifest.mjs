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
    writeJson(path.join(partsRoot, name), { schemaVersion: 'vexlife.source-manifest-part/v0', files: part });
    partRefs.push(`source-manifest-parts/${name}`);
  }
  const { files, ...descriptor } = actual;
  writeJson(manifestPath, { ...descriptor, composition: 'GENERATED_FRAGMENT_COMPOSITION', parts: partRefs });
}

function readSplitManifest() {
  const descriptor = readJson(manifestPath);
  if (!descriptor.parts) return descriptor;
  const files = descriptor.parts.flatMap((partRef) => readJson(path.join(root, partRef)).files);
  const { parts, composition, ...metadata } = descriptor;
  return { ...metadata, files };
}

const actual = buildSourceManifest(root);
if (process.argv.includes('--write')) {
  writeSplitManifest(actual);
  console.log(JSON.stringify({ state: 'SOURCE_MANIFEST_WRITTEN', fileCount: actual.fileCount, parts: Math.ceil(actual.fileCount / 24), treeSha256: actual.treeSha256 }, null, 2));
} else {
  if (!fs.existsSync(manifestPath)) {
    console.error('SOURCE-MANIFEST.json is missing; run npm run manifest:write');
    process.exit(1);
  }
  const comparison = compareSourceManifest(readSplitManifest(), actual);
  console.log(JSON.stringify({ state: comparison.ok ? 'SOURCE_MANIFEST_CURRENT' : 'SOURCE_MANIFEST_DRIFT', ...comparison }, null, 2));
  if (!comparison.ok) process.exitCode = 1;
}

// [VXG RealForever]
