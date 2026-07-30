#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { scaffoldFeatureContract } from '../src/core/feature-registry.mjs';
import { requireSafeRelativePath } from '../src/core/utils.mjs';

const args = process.argv.slice(2);
const get = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const featureRef = get('--feature-ref');
const purpose = get('--purpose');
const platformRefs = (get('--platforms') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const candidate = scaffoldFeatureContract({ featureRef, purpose, platformRefs });
const output = get('--out');
if (!output) {
  console.log(JSON.stringify(candidate, null, 2));
} else {
  const safe = requireSafeRelativePath(output, '--out');
  const absolute = path.resolve(process.cwd(), safe);
  if (!args.includes('--write')) throw new Error('--out requires explicit --write');
  if (fs.existsSync(absolute)) throw new Error(`refusing to overwrite ${safe}`);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(candidate, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ state: 'FEATURE_SCAFFOLD_WRITTEN', path: safe, featureRef }, null, 2));
}

// [VXG RealForever]
