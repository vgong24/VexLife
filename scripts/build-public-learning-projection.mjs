#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { buildPublicLearningProjection } from '../src/core/public-learning.mjs';
import { VEXLIFE_ROOT } from '../src/core/blueprint.mjs';
import { requireSafeRelativePath, writeJson } from '../src/core/utils.mjs';

function usage() {
  return `Build the VexLife public-learning projection\n\nUsage:\n  node scripts/build-public-learning-projection.mjs \\\n    --source-commit <40-hex> \\\n    --source-tree <40-hex> \\\n    --source-state <ACCEPTED_CURRENT|CANDIDATE_PROOF_ONLY> \\\n    [--output generated/public-learning/projection.json]\n\nThe builder performs no GitHub/API/network lookup and does not decide whether a\ncommit is accepted. The caller supplies the exact source binding; lifecycle proof\nmust establish that binding before a public deployment may call it ACCEPTED_CURRENT.\n`;
}

function parseArgs(argv) {
  const options = { output: 'generated/public-learning/projection.json' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { ...options, help: true };
    if (!['--source-commit', '--source-tree', '--source-state', '--output'].includes(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`${argument} requires a value`);
    if (argument === '--source-commit') options.sourceCommit = value;
    if (argument === '--source-tree') options.sourceTree = value;
    if (argument === '--source-state') options.sourceState = value;
    if (argument === '--output') options.output = value;
    index += 1;
  }
  return options;
}

function resolveOutput(root, value) {
  requireSafeRelativePath(value, 'public learning output');
  const normalized = value.replace(/\\/gu, '/');
  if (!normalized.startsWith('generated/public-learning/') || !normalized.endsWith('.json')) {
    throw new Error('public learning output must be a JSON file under generated/public-learning/');
  }
  const target = path.resolve(root, ...normalized.split('/'));
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('public learning output escapes the repository');
  }
  return target;
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exitCode = 2;
}

if (options?.help) {
  console.log(usage());
} else if (options) {
  try {
    const projection = buildPublicLearningProjection({
      root: VEXLIFE_ROOT,
      sourceBinding: {
        repository: 'vgong24/VexLife',
        commitSha: options.sourceCommit,
        treeSha: options.sourceTree,
        sourceAcceptanceState: options.sourceState
      }
    });
    const output = resolveOutput(VEXLIFE_ROOT, options.output);
    writeJson(output, projection);
    console.log(JSON.stringify({
      state: 'PASS',
      output: path.relative(VEXLIFE_ROOT, output).split(path.sep).join('/'),
      projectionHash: projection.projectionHash,
      sourceBinding: projection.sourceBinding,
      nodeCount: projection.nodes.length,
      leafCount: projection.leaves.length,
      effects: projection.effects
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      state: 'FAIL',
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exitCode = 1;
  }
}

// [VXG RealForever]
