#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ANDROID_R8_OUTPUT_PATHS,
  ANDROID_R8_STAGE,
  renderAndroidR8DevicePossessionOutputs,
} from '../src/core/android-r8-device-possession.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACCEPTED_R8_BASE = 'b9c91a87cc0ddc44869fa77cac4a48dc6984da77';
const PROTECTED_GIT_BLOBS = Object.freeze({
  'platform/android/app/build.gradle.kts': '937a1ab2eb058a1492fddfa926d99ce82e5266fc',
  'src/core/android-r6b-private-transport-consumer.mjs': '056a423121a2b9f08ac7291f717069aa985309ac',
});
const AUTHORED_PATHS = Object.freeze([
  'src/core/android-r8-device-possession.mjs',
  'test/android-r8-home-device-possession.test.mjs',
  'scripts/generate-android-r8.mjs',
]);
const MANIFEST_BUCKET_PATHS = Object.freeze([
  'source-manifest-parts/bucket-9b.json',
  'source-manifest-parts/bucket-ec.json',
  'source-manifest-parts/bucket-fe.json',
  'source-manifest-parts/bucket-3c.json',
  'source-manifest-parts/bucket-bb.json',
]);
const PRE_MANIFEST_STAGE_PATHS = Object.freeze([...AUTHORED_PATHS, ...ANDROID_R8_OUTPUT_PATHS].sort());
const FINAL_STAGE_PATHS = Object.freeze([...PRE_MANIFEST_STAGE_PATHS, ...MANIFEST_BUCKET_PATHS].sort());

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function target(relativePath) { return path.join(ROOT, ...relativePath.split('/')); }
function lines(value) { return value.split(/\r?\n/u).filter(Boolean).sort(); }

function verifyProtectedGitBindings() {
  git(['cat-file', '-e', `${ACCEPTED_R8_BASE}^{commit}`]);
  const mismatches = [];
  for (const [relativePath, expected] of Object.entries(PROTECTED_GIT_BLOBS)) {
    let observed = 'MISSING';
    try { observed = git(['rev-parse', `${ACCEPTED_R8_BASE}:${relativePath}`]); } catch {}
    if (observed !== expected) mismatches.push({ path: relativePath, expected, observed });
  }
  if (mismatches.length) throw new Error(`R8_PROTECTED_SOURCE_DRIFT:${JSON.stringify(mismatches)}`);
}
function verifyGeneratedPathsAbsent() {
  const existing = ANDROID_R8_OUTPUT_PATHS.filter((relativePath) => fs.existsSync(target(relativePath)));
  if (existing.length) throw new Error(`R8_EXPECTED_ABSENCE_DRIFT:${existing.join(',')}`);
  const inBase = [];
  for (const relativePath of ANDROID_R8_OUTPUT_PATHS) {
    try { execFileSync('git', ['cat-file', '-e', `${ACCEPTED_R8_BASE}:${relativePath}`], { cwd: ROOT, stdio: 'ignore' }); inBase.push(relativePath); } catch {}
  }
  if (inBase.length) throw new Error(`R8_BASE_EXPECTED_ABSENCE_DRIFT:${inBase.join(',')}`);
}
function writeRendered(rendered) {
  for (const relativePath of ANDROID_R8_OUTPUT_PATHS) {
    const out = target(relativePath);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, rendered.files[relativePath], 'utf8');
  }
}
function compareRendered(rendered) {
  return ANDROID_R8_OUTPUT_PATHS.flatMap((relativePath) => {
    if (!fs.existsSync(target(relativePath))) return [{ path: relativePath, state: 'MISSING' }];
    return fs.readFileSync(target(relativePath), 'utf8') === rendered.files[relativePath]
      ? [] : [{ path: relativePath, state: 'BYTE_DRIFT' }];
  });
}
function assertStagedExact(expected, label) {
  const staged = lines(git(['diff', '--cached', '--name-only', '--']));
  const unstaged = lines(git(['diff', '--name-only', '--']));
  const untracked = lines(git(['ls-files', '--others', '--exclude-standard']));
  if (JSON.stringify(staged) !== JSON.stringify([...expected].sort()) || unstaged.length || untracked.length) {
    throw new Error(`${label}_STAGE_DRIFT:${JSON.stringify({ staged, unstaged, untracked, expected: [...expected].sort() })}`);
  }
  return { state: 'PASS', label, stagedPaths: staged, unstagedPaths: unstaged, untrackedPaths: untracked };
}

const write = process.argv.includes('--write');
const check = process.argv.includes('--check');
const assertPre = process.argv.includes('--assert-staged-before-manifest');
const assertFinal = process.argv.includes('--assert-staged-final');
if ([write, check, assertPre, assertFinal].filter(Boolean).length !== 1) {
  console.error('Use exactly one of --write, --check, --assert-staged-before-manifest, --assert-staged-final');
  process.exit(2);
}

try {
  if (assertPre || assertFinal) {
    console.log(JSON.stringify(assertStagedExact(assertPre ? PRE_MANIFEST_STAGE_PATHS : FINAL_STAGE_PATHS, assertPre ? 'PRE_MANIFEST' : 'FINAL'), null, 2));
    process.exit(0);
  }
  verifyProtectedGitBindings();
  const rendered = renderAndroidR8DevicePossessionOutputs();
  if (write) {
    verifyGeneratedPathsAbsent();
    writeRendered(rendered);
  }
  const mismatches = compareRendered(rendered);
  console.log(JSON.stringify({
    state: mismatches.length ? 'FAIL' : 'PASS',
    currentness: mismatches.length ? 'DRIFTED' : 'CURRENT',
    stage: ANDROID_R8_STAGE,
    operation: write ? 'WRITE' : 'CHECK',
    acceptedBase: ACCEPTED_R8_BASE,
    outputPaths: [...ANDROID_R8_OUTPUT_PATHS],
    protectedBindings: PROTECTED_GIT_BLOBS,
    effects: rendered.effects,
    mismatches,
  }, null, 2));
  if (mismatches.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    state: 'FAIL',
    currentness: 'BLOCKED',
    stage: ANDROID_R8_STAGE,
    operation: write ? 'WRITE' : 'CHECK',
    acceptedBase: ACCEPTED_R8_BASE,
    error: error.message,
  }, null, 2));
  process.exitCode = 1;
}

// [VXG RealForever]
