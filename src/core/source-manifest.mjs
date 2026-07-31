import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { semanticHash } from './utils.mjs';

const EXCLUDED_DIRECTORIES = new Set(['.git', 'node_modules', 'generated', 'runtime', 'models', '.vexlife', 'artifacts', 'source-manifest-parts']);
const EXCLUDED_FILES = new Set(['SOURCE-MANIFEST.json']);

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function collectSourceFiles(root) {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isDirectory()) walk(absolute);
      else if (!EXCLUDED_FILES.has(relative)) files.push(relative);
    }
  }
  walk(root);
  return files;
}

export function buildSourceManifest(root) {
  const files = collectSourceFiles(root).map((relativePath) => {
    const absolute = path.join(root, relativePath);
    const stat = fs.statSync(absolute);
    return { path: relativePath, bytes: stat.size, sha256: sha256File(absolute) };
  });
  return {
    schemaVersion: 'vexlife.source-manifest/v0',
    manifestRef: 'source-manifest.vexlife.universal-blueprint.001',
    rootRef: 'source-root.vexlife.universal-blueprint',
    excludedClasses: ['generated output', 'runtime state', 'model artifacts', 'node dependencies', 'Git internals'],
    fileCount: files.length,
    files,
    treeSha256: semanticHash(files)
  };
}

export function compareSourceManifest(expected, actual) {
  return {
    ok: expected.treeSha256 === actual.treeSha256 && expected.fileCount === actual.fileCount,
    expectedTreeSha256: expected.treeSha256,
    actualTreeSha256: actual.treeSha256,
    expectedFileCount: expected.fileCount,
    actualFileCount: actual.fileCount
  };
}

// [VXG RealForever]
