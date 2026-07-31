#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testRoot = path.join(ROOT, 'test');
const regular = fs.readdirSync(testRoot).filter((name) => name.endsWith('.test.mjs')).sort().map((name) => path.join('test', name));
const endToEnd = process.env.VEXLIFE_NESTED_PR_READY === '1'
  ? []
  : fs.readdirSync(testRoot).filter((name) => name.endsWith('.e2e.mjs')).sort().map((name) => path.join('test', name));
const files = [...regular, ...endToEnd];
const result = spawnSync(process.execPath, ['--test', ...files], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
console.log(JSON.stringify({
  schemaVersion: 'vexlife.check-command-result/v0',
  state: result.status === 0 ? 'PASS' : 'FAILED',
  currentness: 'CURRENT',
  testFiles: files.length,
  nestedPrReady: process.env.VEXLIFE_NESTED_PR_READY === '1'
}, null, 2));
if (result.status !== 0) process.exitCode = 1;

// [VXG RealForever]
