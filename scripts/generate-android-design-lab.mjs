#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ACCEPTED_ANDROID_BASE,
  ACCEPTED_MAIN_ACTIVITY_SHA256,
  ANDROID_DESIGN_LAB_STAGE,
  DESIGN_LAB_REGISTRY_PATH,
  MAIN_ACTIVITY_PATH,
  OUTPUT_PATHS,
  renderAndroidDesignLabFoundation,
  validateAcceptedMainActivityPreimage,
  validateAndroidDesignLabRegistry,
} from '../src/core/android-design-lab-foundation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function target(relativePath) { return path.join(ROOT, ...relativePath.split('/')); }
function git(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
function acceptedMainActivity() { return git(['show', `${ACCEPTED_ANDROID_BASE}:${MAIN_ACTIVITY_PATH}`]); }
function registry() { return JSON.parse(fs.readFileSync(target(DESIGN_LAB_REGISTRY_PATH), 'utf8')); }
function observed(relativePath) { return fs.existsSync(target(relativePath)) ? fs.readFileSync(target(relativePath), 'utf8') : null; }

const write = process.argv.includes('--write');
const check = process.argv.includes('--check');
if (write === check) {
  console.error('Use exactly one of --write or --check');
  process.exit(2);
}

try {
  const source = acceptedMainActivity();
  validateAcceptedMainActivityPreimage(source);
  const designLabRegistry = registry();
  validateAndroidDesignLabRegistry(designLabRegistry);
  const rendered = renderAndroidDesignLabFoundation(source, designLabRegistry);

  if (write) {
    for (const relativePath of OUTPUT_PATHS) {
      const prior = observed(relativePath);
      const expected = rendered.files[relativePath];
      if (relativePath === MAIN_ACTIVITY_PATH && prior !== expected) {
        validateAcceptedMainActivityPreimage(prior);
      }
      fs.mkdirSync(path.dirname(target(relativePath)), { recursive: true });
      fs.writeFileSync(target(relativePath), expected, 'utf8');
    }
  }

  const drifted = OUTPUT_PATHS.filter((relativePath) => observed(relativePath) !== rendered.files[relativePath]);
  const current = drifted.length === 0;
  console.log(JSON.stringify({
    state: current ? 'PASS' : 'FAIL',
    currentness: current ? 'CURRENT' : 'DRIFTED',
    stage: ANDROID_DESIGN_LAB_STAGE,
    operation: write ? 'WRITE' : 'CHECK',
    acceptedAndroidBase: ACCEPTED_ANDROID_BASE,
    acceptedMainActivitySha256: ACCEPTED_MAIN_ACTIVITY_SHA256,
    registryRef: designLabRegistry.registryRef,
    outputPaths: OUTPUT_PATHS,
    drifted,
    inventory: rendered.inventory,
    effects: rendered.effects,
  }, null, 2));
  if (!current) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    state: 'FAIL',
    currentness: 'BLOCKED',
    stage: ANDROID_DESIGN_LAB_STAGE,
    operation: write ? 'WRITE' : 'CHECK',
    error: error.message,
  }, null, 2));
  process.exitCode = 1;
}
