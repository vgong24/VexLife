#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testRoot = path.join(ROOT, 'test');
const isolatedTestFiles = new Set([
  // This suite contains live loopback and atomic-writer timing assertions.
  // Keep its internal concurrency intact, but do not let unrelated test-file
  // scheduling consume the endpoint timeout window it is explicitly proving.
  'lived-companion.test.mjs'
]);
const regularNames = fs.readdirSync(testRoot)
  .filter((name) => name.endsWith('.test.mjs'))
  .sort();
const regular = regularNames
  .filter((name) => !isolatedTestFiles.has(name))
  .map((name) => path.join('test', name));
const isolated = regularNames
  .filter((name) => isolatedTestFiles.has(name))
  .map((name) => path.join('test', name));
const endToEnd = process.env.VEXLIFE_NESTED_PR_READY === '1'
  ? []
  : fs.readdirSync(testRoot)
    .filter((name) => name.endsWith('.e2e.mjs'))
    .sort()
    .map((name) => path.join('test', name));
const groups = [
  {
    executionClass: 'CONCURRENT_DEFAULT',
    files: [...regular, ...endToEnd],
    arguments: ['--test', ...regular, ...endToEnd]
  },
  ...isolated.map((file) => ({
    executionClass: 'ISOLATED_TIMING_SENSITIVE',
    files: [file],
    arguments: ['--test', '--test-concurrency=1', file]
  }))
].filter((group) => group.files.length > 0);

let failed = false;
const executions = [];
for (const group of groups) {
  const result = spawnSync(process.execPath, group.arguments, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const exitCode = Number.isInteger(result.status) ? result.status : 1;
  executions.push({
    executionClass: group.executionClass,
    testFiles: group.files.length,
    exitCode
  });
  if (exitCode !== 0) failed = true;
}

const files = [...regular, ...isolated, ...endToEnd];
console.log(JSON.stringify({
  schemaVersion: 'vexlife.check-command-result/v0',
  state: failed ? 'FAILED' : 'PASS',
  currentness: 'CURRENT',
  testFiles: files.length,
  nestedPrReady: process.env.VEXLIFE_NESTED_PR_READY === '1',
  isolatedTestFiles: isolated,
  executions
}, null, 2));
if (failed) process.exitCode = 1;

// [VXG RealForever]
