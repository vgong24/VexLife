#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSourceFiles } from '../src/core/source-manifest.mjs';
import { readJson } from '../src/core/utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = readJson(path.join(root, 'PUBLIC-SAFETY-MANIFEST.json'));
const files = collectSourceFiles(root);
const errors = [];
const forbiddenExtensions = /\.(?:gguf|safetensors|onnx)$/i;
const forbiddenDirectories = /(?:^|\/)(?:runtime|models|\.vexlife)(?:\/|$)/;
const secretPatterns = [
  { name: 'GitHub token', regex: /gh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'private key', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'OpenAI-style secret', regex: /\bsk-[A-Za-z0-9_-]{24,}\b/ },
  { name: 'absolute macOS home', regex: /\/Users\/[A-Za-z0-9._-]+\// },
  { name: 'absolute Windows home', regex: /[A-Za-z]:\\Users\\[A-Za-z0-9._ -]+\\/ }
];
for (const relative of files) {
  if (forbiddenExtensions.test(relative) || forbiddenDirectories.test(relative)) errors.push(`forbidden public artifact path: ${relative}`);
  const absolute = path.join(root, relative);
  const bytes = fs.readFileSync(absolute);
  if (bytes.includes(0)) continue;
  const text = bytes.toString('utf8');
  for (const pattern of secretPatterns) if (pattern.regex.test(text)) errors.push(`${pattern.name} pattern found in ${relative}`);
}
if (manifest.automaticPublication !== false) errors.push('automatic publication must remain false');
if (manifest.forcePushAllowed !== false || manifest.historyRewriteAllowed !== false) errors.push('public safety manifest permits forbidden Git effects');
if (!['SELECTED_MPL_2_0_PRIVATE_STAGING', 'MPL_2_0_PUBLIC'].includes(String(manifest.licenseState))) errors.push('license state must be selected MPL-2.0 for this launch pack');
if (manifest.contributionPolicy !== 'DCO_1_1_INBOUND_EQUALS_OUTBOUND') errors.push('contribution policy must remain DCO 1.1 inbound-equals-outbound');
console.log(JSON.stringify({ state: errors.length ? 'PUBLIC_SAFETY_BLOCKED' : 'PUBLIC_SAFETY_CLEAR', filesScanned: files.length, licenseState: manifest.licenseState, errors }, null, 2));
if (errors.length) process.exitCode = 1;

// [VXG RealForever]
