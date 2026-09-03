#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  FROZEN_RELEASE_SOURCE,
  writePlanningPacket,
} from '../src/core/release-bootstrap-packaging.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
  return [
    'Usage:',
    '  node scripts/release-bootstrap-package.mjs --platform windows|macos --source-tar <path> --out <relative-subdirectory>',
    '',
    'This command validates the exact frozen source TAR and forms only an effect-free',
    'platform package planning/notice packet beneath generated/release-bootstrap-packages/.',
    'Native package creation is owned by the platform build script recorded in package-plan.json.',
  ].join('\n');
}

function parseArgs(argv) {
  const result = { platform: null, sourceTarPath: null, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === '--platform') result.platform = value;
    else if (arg === '--source-tar') result.sourceTarPath = value;
    else if (arg === '--out') result.out = value;
    else if (arg === '--help' || arg === '-h') return { help: true };
    else throw new Error(`unknown argument: ${arg}`);
    index += 1;
  }
  if (!['windows', 'macos'].includes(result.platform)) throw new Error('--platform must be windows or macos');
  if (!result.sourceTarPath) throw new Error('--source-tar is required');
  if (!result.out) throw new Error('--out is required');
  return result;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  const result = writePlanningPacket(args);
  console.log(JSON.stringify({
    state: 'UNSIGNED_PLATFORM_PACKAGE_PLAN_READY',
    platform: result.plan.platform,
    sourceCommit: FROZEN_RELEASE_SOURCE.sourceCommit,
    sourceTarSha256: FROZEN_RELEASE_SOURCE.sourceTarSha256,
    outputDir: path.relative(ROOT, result.outputDir).replaceAll(path.sep, '/'),
    signing: false,
    notarization: false,
    publication: false,
    officialVerifiedBuildPromotion: false,
  }, null, 2));
} catch (error) {
  console.error(`VEXLIFE_RELEASE_BOOTSTRAP_HELD: ${error instanceof Error ? error.message : String(error)}`);
  console.error(usage());
  process.exit(2);
}
