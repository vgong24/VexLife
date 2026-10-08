#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ANDROID_R5_NEW_GENERATED_PATHS,
  ANDROID_R5_OUTPUT_PATHS,
  ANDROID_R5_HOME_LOOPBACK_STAGE,
  renderAndroidR5Outputs,
} from '../src/core/android-r5-home-loopback.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ACCEPTED_R4_BASE = '4bf6f8cd758acb092cf92359f52b48a08ef0c1c6';

const R4_BASE_PREIMAGE_SHA256 = Object.freeze({
  'platform/android/README.md': '99bb3dc803a06245354a2e44dc245cc00d75f06bcaf34a7c433868e77b3445b9',
  'platform/android/app/src/main/kotlin/vexlife/android/app/MainActivity.kt': '71056f6626ec16c0e3cf9b4a1724e0b363928f594996b20b379ca0736fc462cb',
  'platform/android/app/src/main/kotlin/vexlife/android/identity/GeneratedCanonicalRefs.kt': '4d0c48dd9fa64c24fb16ee2db7a1ad52c5bbfc91a38df90d91d8096355a0f785',
  'platform/android/app/src/main/res/values/vexlife_r2.xml': 'c6e61de99bdc54854fe84840975d1d383d5d4db27f89d370737db935ca6cd7e0',
  'platform/android/app/src/main/res/values-ja/vexlife_r2.xml': 'f5afcc6f08a2b11f1668db94e148e271bef91208360bab99bc666fab3f6208cf',
  'platform/android/app/src/main/res/values-zh-rCN/vexlife_r2.xml': '2b70eb677d24d1da35eae3ebe7431479a61a6ea51de8a71f395376fd330f3c8d',
});

const PROTECTED_GIT_BLOBS = Object.freeze({
  'blueprint/home-bridge-registry.json': '7b2b13fb53d0efdf2ba799dfc6e8557d07b5223e',
  'src/core/home-bridge.mjs': 'ac22fe19347513fcea224cc083c1b5aaceda135e',
  'src/core/state-relay.mjs': 'ad5231ff2a24f46db5655184722d670c719db301',
  'src/core/android-r4-presentation-surface.mjs': '20ebc1587186e72c3cd85c2b9c03dd78ed8000ae',
  'platform/android/app/src/main/kotlin/vexlife/android/architecture/VexRuntimeContracts.kt': '4c376240d39c0fd4ef383c574e6dc47785460960',
});

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function git(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
function gitShowText(relativePath) { return git(['show', `${ACCEPTED_R4_BASE}:${relativePath}`]); }
function gitBlob(relativePath) { return git(['rev-parse', `${ACCEPTED_R4_BASE}:${relativePath}`]).trim(); }
function target(relativePath) { return path.join(ROOT, ...relativePath.split('/')); }
function worktreeText(relativePath) { return fs.readFileSync(target(relativePath), 'utf8'); }

function verifyProtectedGitBindings() {
  const mismatches = [];
  for (const [relativePath, expected] of Object.entries(PROTECTED_GIT_BLOBS)) {
    let observed = null;
    try { observed = gitBlob(relativePath); } catch { observed = 'MISSING'; }
    if (observed !== expected) mismatches.push({ path: relativePath, expected, observed });
  }
  if (mismatches.length) throw new Error(`R5_PROTECTED_GIT_BINDING_DRIFT:${JSON.stringify(mismatches)}`);
}

function renderBaseFilesFromGit() {
  return Object.fromEntries(Object.keys(R4_BASE_PREIMAGE_SHA256).map((relativePath) => [relativePath, gitShowText(relativePath)]));
}

function validateAcceptedR4GitPreimages(baseFiles) {
  const mismatches = [];
  for (const [relativePath, expectedSha256] of Object.entries(R4_BASE_PREIMAGE_SHA256)) {
    const observedSha256 = sha256(baseFiles[relativePath] ?? '');
    if (observedSha256 !== expectedSha256) mismatches.push({ path: relativePath, expectedSha256, observedSha256 });
  }
  if (mismatches.length) throw new Error(`R5_ACCEPTED_R4_GIT_PREIMAGE_DRIFT:${JSON.stringify(mismatches)}`);
}

function validateWorktreePreimages() {
  const mismatches = [];
  for (const [relativePath, expectedSha256] of Object.entries(R4_BASE_PREIMAGE_SHA256)) {
    if (!fs.existsSync(target(relativePath))) {
      mismatches.push({ path: relativePath, state: 'MISSING', expectedSha256 });
      continue;
    }
    const observedSha256 = sha256(worktreeText(relativePath));
    if (observedSha256 !== expectedSha256) mismatches.push({ path: relativePath, state: 'PREIMAGE_DRIFT', expectedSha256, observedSha256 });
  }
  if (mismatches.length) throw new Error(`R5_R4_WORKTREE_PREIMAGE_DRIFT:${JSON.stringify(mismatches)}`);
}

function verifyNewGeneratedPathsAbsent() {
  const existing = ANDROID_R5_NEW_GENERATED_PATHS.filter((relativePath) => fs.existsSync(target(relativePath)));
  if (existing.length) throw new Error(`R5_EXPECTED_ABSENCE_DRIFT:${existing.join(',')}`);
  const inBase = [];
  for (const relativePath of ANDROID_R5_NEW_GENERATED_PATHS) {
    try { git(['cat-file', '-e', `${ACCEPTED_R4_BASE}:${relativePath}`]); inBase.push(relativePath); } catch {}
  }
  if (inBase.length) throw new Error(`R5_ACCEPTED_R4_EXPECTED_ABSENCE_DRIFT:${inBase.join(',')}`);
}

function formRendered() {
  verifyProtectedGitBindings();
  const baseFiles = renderBaseFilesFromGit();
  validateAcceptedR4GitPreimages(baseFiles);
  const homeBridgeRegistry = JSON.parse(gitShowText('blueprint/home-bridge-registry.json'));
  return renderAndroidR5Outputs({ homeBridgeRegistry, baseFiles });
}
function writeRendered(rendered) {
  for (const relativePath of ANDROID_R5_OUTPUT_PATHS) {
    const out = target(relativePath);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, rendered.files[relativePath], 'utf8');
  }
}
function compareRendered(rendered) {
  const mismatches = [];
  for (const relativePath of ANDROID_R5_OUTPUT_PATHS) {
    if (!fs.existsSync(target(relativePath))) {
      mismatches.push({ path: relativePath, state: 'MISSING', expectedSha256: sha256(rendered.files[relativePath]) });
      continue;
    }
    const observed = worktreeText(relativePath);
    const expected = rendered.files[relativePath];
    if (observed !== expected) mismatches.push({
      path: relativePath,
      state: 'BYTE_DRIFT',
      expectedSha256: sha256(expected),
      observedSha256: sha256(observed),
    });
  }
  return mismatches;
}

const AUTHORED_PATHS = Object.freeze([
  'src/core/android-r5-home-loopback.mjs',
  'test/android-r5-home-loopback.test.mjs',
  'scripts/generate-android-r5.mjs',
]);
const MANIFEST_BUCKET_PATHS = Object.freeze([
  'source-manifest-parts/bucket-08.json',
  'source-manifest-parts/bucket-11.json',
  'source-manifest-parts/bucket-46.json',
  'source-manifest-parts/bucket-65.json',
  'source-manifest-parts/bucket-72.json',
  'source-manifest-parts/bucket-77.json',
  'source-manifest-parts/bucket-81.json',
  'source-manifest-parts/bucket-a0.json',
  'source-manifest-parts/bucket-ac.json',
  'source-manifest-parts/bucket-c0.json',
  'source-manifest-parts/bucket-f3.json',
  'source-manifest-parts/bucket-fa.json',
]);
const PRE_MANIFEST_STAGE_PATHS = Object.freeze([...AUTHORED_PATHS, ...ANDROID_R5_OUTPUT_PATHS].sort());
const FINAL_STAGE_PATHS = Object.freeze([...PRE_MANIFEST_STAGE_PATHS, ...MANIFEST_BUCKET_PATHS].sort());
function lines(value) { return value.split(/\r?\n/u).filter(Boolean).sort(); }
function assertStagedExact(expected, label) {
  const staged = lines(git(['diff','--cached','--name-only','--']));
  const unstaged = lines(git(['diff','--name-only','--']));
  const untracked = lines(git(['ls-files','--others','--exclude-standard']));
  if (JSON.stringify(staged) !== JSON.stringify([...expected].sort()) || unstaged.length || untracked.length) {
    throw new Error(`${label}_STAGE_DRIFT:${JSON.stringify({staged,unstaged,untracked,expected:[...expected].sort()})}`);
  }
  return { state:'PASS', label, stagedPaths: staged, unstagedPaths: unstaged, untrackedPaths: untracked };
}

const write = process.argv.includes('--write');
const check = process.argv.includes('--check');
const assertPre = process.argv.includes('--assert-staged-before-manifest');
const assertFinal = process.argv.includes('--assert-staged-final');
const modes = [write, check, assertPre, assertFinal].filter(Boolean).length;
if (modes !== 1) {
  console.error('Use exactly one of --write, --check, --assert-staged-before-manifest, --assert-staged-final');
  process.exit(2);
}

try {
  if (assertPre || assertFinal) {
    console.log(JSON.stringify(assertStagedExact(assertPre ? PRE_MANIFEST_STAGE_PATHS : FINAL_STAGE_PATHS, assertPre ? 'PRE_MANIFEST' : 'FINAL'), null, 2));
    process.exit(0);
  }
  const rendered = formRendered();
  if (write) {
    validateWorktreePreimages();
    verifyNewGeneratedPathsAbsent();
    writeRendered(rendered);
  }
  const mismatches = compareRendered(rendered);
  const payload = {
    state: mismatches.length ? 'FAIL' : 'PASS',
    currentness: mismatches.length ? 'DRIFTED' : 'CURRENT',
    stage: ANDROID_R5_HOME_LOOPBACK_STAGE,
    operation: write ? 'WRITE' : 'CHECK',
    acceptedR4Base: ACCEPTED_R4_BASE,
    renderBaseSource: 'EXACT_ACCEPTED_R4_GIT_OBJECTS',
    preWriteWorktreePreimageValidation: write,
    checkReadsGeneratedWorktreeAsBase: false,
    semanticFingerprint: rendered.semanticFingerprint,
    outputPaths: [...ANDROID_R5_OUTPUT_PATHS],
    inventory: rendered.inventory,
    mismatches,
    effects: rendered.effects,
  };
  console.log(JSON.stringify(payload, null, 2));
  if (mismatches.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    state: 'FAIL',
    currentness: 'BLOCKED',
    stage: ANDROID_R5_HOME_LOOPBACK_STAGE,
    operation: write ? 'WRITE' : 'CHECK',
    acceptedR4Base: ACCEPTED_R4_BASE,
    renderBaseSource: 'EXACT_ACCEPTED_R4_GIT_OBJECTS',
    preWriteWorktreePreimageValidation: write,
    checkReadsGeneratedWorktreeAsBase: false,
    error: error.message,
  }, null, 2));
  process.exitCode = 1;
}

// [VXG RealForever]
