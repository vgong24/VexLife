#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanPublicSafety } from '../src/core/public-safety.mjs';
import { readJson } from '../src/core/utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = readJson(path.join(root, 'PUBLIC-SAFETY-MANIFEST.json'));
const result = scanPublicSafety(root, manifest);
console.log(JSON.stringify({
  state: result.state,
  filesScanned: result.filesScanned,
  manifestRef: result.manifestRef,
  forbiddenPatterns: result.forbiddenPatterns,
  exclusionPatterns: result.exclusionPatterns,
  allowedBinaryPatterns: result.allowedBinaryPatterns,
  deliberateBinaryClassifications: result.classifications.filter((item) => item.classification !== 'TEXT_SCANNED'),
  licenseState: manifest.licenseState,
  errors: result.errors
}, null, 2));
if (result.errors.length) process.exitCode = 1;

// [VXG RealForever]
