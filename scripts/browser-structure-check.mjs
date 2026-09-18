#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['reference/browser/app.js', 'reference/browser/integration-test.js'];
const failures = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) failures.push({ file, output: result.stderr || result.stdout });
}
console.log(JSON.stringify({
  schemaVersion: 'vexlife.check-command-result/v0',
  state: failures.length ? 'FAILED' : 'PASS',
  currentness: 'CURRENT',
  evidenceClass: 'STRUCTURAL_SOURCE_ONLY',
  files,
  failures
}, null, 2));
if (failures.length) process.exitCode = 1;

// [VXG RealForever]
