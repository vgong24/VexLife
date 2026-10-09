#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ACCEPTED_MAIN_ACTIVITY_SHA256,
  ANDROID_NATIVE_WALK_FOUNDATION_STAGE,
  MAIN_ACTIVITY_PATH,
  renderAndroidNativeWalkFoundation,
  validateAcceptedMainActivityPreimage,
} from '../src/core/android-native-walk-foundation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ACCEPTED_ANDROID_BASE = '78bed64878cc85264878e1cb5ab9fbab7bee293b';

function target(relativePath) { return path.join(ROOT, ...relativePath.split('/')); }
function git(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
function acceptedSource() { return git(['show', `${ACCEPTED_ANDROID_BASE}:${MAIN_ACTIVITY_PATH}`]); }
function worktreeSource() { return fs.readFileSync(target(MAIN_ACTIVITY_PATH), 'utf8'); }
function render() {
  const source = acceptedSource();
  validateAcceptedMainActivityPreimage(source);
  return renderAndroidNativeWalkFoundation(source);
}

const write = process.argv.includes('--write');
const check = process.argv.includes('--check');
if (write === check) {
  console.error('Use exactly one of --write or --check');
  process.exit(2);
}

try {
  const rendered = render();
  const expected = rendered.files[MAIN_ACTIVITY_PATH];
  if (write) {
    validateAcceptedMainActivityPreimage(worktreeSource());
    fs.writeFileSync(target(MAIN_ACTIVITY_PATH), expected, 'utf8');
  }
  const observed = worktreeSource();
  const current = observed === expected;
  console.log(JSON.stringify({
    state: current ? 'PASS' : 'FAIL',
    currentness: current ? 'CURRENT' : 'DRIFTED',
    stage: ANDROID_NATIVE_WALK_FOUNDATION_STAGE,
    operation: write ? 'WRITE' : 'CHECK',
    acceptedAndroidBase: ACCEPTED_ANDROID_BASE,
    acceptedMainActivitySha256: ACCEPTED_MAIN_ACTIVITY_SHA256,
    outputPaths: [MAIN_ACTIVITY_PATH],
    inventory: rendered.inventory,
    effects: rendered.effects,
  }, null, 2));
  if (!current) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    state: 'FAIL',
    currentness: 'BLOCKED',
    stage: ANDROID_NATIVE_WALK_FOUNDATION_STAGE,
    operation: write ? 'WRITE' : 'CHECK',
    error: error.message,
  }, null, 2));
  process.exitCode = 1;
}
