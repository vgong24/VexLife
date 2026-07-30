#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const excluded = new Set(['node_modules', 'generated', '.git', 'runtime', 'models']);
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (/\.(?:mjs|js)$/.test(entry.name)) files.push(absolute);
  }
}
walk(root);
const failures = [];
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) failures.push({ file: path.relative(root, file), output: result.stderr || result.stdout });
}
if (failures.length) {
  for (const failure of failures) console.error(`${failure.file}\n${failure.output}`);
  process.exit(1);
}
console.log(JSON.stringify({ state: 'SYNTAX_VALID', files: files.length }, null, 2));

// [VXG RealForever]
