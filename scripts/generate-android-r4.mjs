#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANDROID_R4_OUTPUT_PATHS,
  ANDROID_R4_PRESENTATION_STAGE,
  R2_BASE_PREIMAGE_SHA256,
  renderAndroidR4PresentationSurface,
  validateAcceptedR2Preimages,
} from '../src/core/android-r4-presentation-surface.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, ...relativePath.split('/')), 'utf8'));
}
function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, ...relativePath.split('/')), 'utf8');
}
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function formInput() {
  return {
    presentationGraph: readJson('blueprint/presentation-graph-registry.json'),
    androidRemoteVesselRegistry: readJson('blueprint/android-remote-vessel-registry.json'),
    homeBridgeRegistry: readJson('blueprint/home-bridge-registry.json'),
    securityAccessPreviewRegistry: readJson('blueprint/security-access-preview-registry.json'),
    localizationCatalogs: {
      en: readJson('blueprint/strings/en.json'),
      ja: readJson('blueprint/strings/ja.json'),
      zh: readJson('blueprint/strings/zh.json'),
    },
  };
}
function observedR2Preimages() {
  return Object.fromEntries(Object.keys(R2_BASE_PREIMAGE_SHA256).map((relativePath) => [relativePath, readText(relativePath)]));
}
function verifyNewPathsAbsent(newPaths) {
  const existing = newPaths.filter((relativePath) => fs.existsSync(path.join(ROOT, ...relativePath.split('/'))));
  if (existing.length) throw new Error(`R4_EXPECTED_ABSENCE_DRIFT:${existing.join(',')}`);
}
function writeRendered(rendered) {
  for (const relativePath of ANDROID_R4_OUTPUT_PATHS) {
    const target = path.join(ROOT, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, rendered.files[relativePath], 'utf8');
  }
}
function compareRendered(rendered) {
  const mismatches = [];
  for (const relativePath of ANDROID_R4_OUTPUT_PATHS) {
    const target = path.join(ROOT, ...relativePath.split('/'));
    if (!fs.existsSync(target)) {
      mismatches.push({ path: relativePath, state: 'MISSING', expectedSha256: sha256(rendered.files[relativePath]) });
      continue;
    }
    const observed = fs.readFileSync(target, 'utf8');
    const expected = rendered.files[relativePath];
    if (observed !== expected) {
      mismatches.push({
        path: relativePath,
        state: 'BYTE_DRIFT',
        expectedSha256: sha256(expected),
        observedSha256: sha256(observed),
      });
    }
  }
  return mismatches;
}

const write = process.argv.includes('--write');
const check = process.argv.includes('--check');
if (write === check) {
  console.error('Use exactly one of --write or --check');
  process.exit(2);
}

try {
  const rendered = renderAndroidR4PresentationSurface(formInput());
  if (write) {
    const preimage = validateAcceptedR2Preimages(observedR2Preimages());
    if (preimage.state !== 'PASS') throw new Error(`R4_R2_PREIMAGE_DRIFT:${JSON.stringify(preimage.mismatches)}`);
    verifyNewPathsAbsent(rendered.newPaths);
    writeRendered(rendered);
    const mismatches = compareRendered(rendered);
    if (mismatches.length) throw new Error(`R4_POST_WRITE_DRIFT:${JSON.stringify(mismatches)}`);
    console.log(JSON.stringify({
      state: 'PASS',
      currentness: 'CURRENT',
      stage: ANDROID_R4_PRESENTATION_STAGE,
      operation: 'WRITE',
      semanticFingerprint: rendered.semanticFingerprint,
      outputPaths: [...ANDROID_R4_OUTPUT_PATHS],
      inventory: rendered.inventory,
      effects: rendered.effects,
    }, null, 2));
  } else {
    const mismatches = compareRendered(rendered);
    console.log(JSON.stringify({
      state: mismatches.length ? 'FAIL' : 'PASS',
      currentness: mismatches.length ? 'DRIFTED' : 'CURRENT',
      stage: ANDROID_R4_PRESENTATION_STAGE,
      operation: 'CHECK',
      semanticFingerprint: rendered.semanticFingerprint,
      expectedPaths: [...ANDROID_R4_OUTPUT_PATHS],
      mismatches,
      effects: rendered.effects,
    }, null, 2));
    if (mismatches.length) process.exitCode = 1;
  }
} catch (error) {
  console.error(JSON.stringify({
    state: 'FAIL',
    currentness: 'BLOCKED',
    stage: ANDROID_R4_PRESENTATION_STAGE,
    operation: write ? 'WRITE' : 'CHECK',
    error: error.message,
  }, null, 2));
  process.exitCode = 1;
}

// [VXG RealForever]
