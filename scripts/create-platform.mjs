#!/usr/bin/env node
import path from 'node:path';
import { generatePlatform, supportedPlatforms } from '../src/core/platform-generator.mjs';

const args = process.argv.slice(2);
const value = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const all = args.includes('--all');
const project = value('--project', 'IVexLife');
const out = path.resolve(value('--out', 'generated'));
const platform = value('--platform');
const selected = all ? supportedPlatforms : [platform];
if (!all && !supportedPlatforms.includes(platform)) {
  console.error(`Use --platform ${supportedPlatforms.join('|')} or --all`);
  process.exit(2);
}
for (const item of selected) {
  const target = all ? path.join(out, item) : out;
  const result = generatePlatform({ project, platform: item, outDir: target });
  console.error(`${item}: ${result.outDir}`);
}
console.log(JSON.stringify({
  schemaVersion: 'vexlife.check-command-result/v0',
  state: 'PASS',
  currentness: 'CURRENT',
  platforms: selected
}, null, 2));

// [VXG RealForever]
