#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { projectIntentStatus } from '../src/core/intent-projection.mjs';
import { readJson, requireSafeRelativePath } from '../src/core/utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const detail = args.includes('--detail');
const filtered = args.filter((arg) => arg !== '--detail');
const graphIndex = filtered.indexOf('--graph');
const snapshotIndex = filtered.indexOf('--trust-snapshot');
const expectedLength = snapshotIndex === -1 ? 2 : 4;
if (filtered.length !== expectedLength ||
    graphIndex === -1 ||
    !filtered[graphIndex + 1] ||
    (snapshotIndex !== -1 && !filtered[snapshotIndex + 1])) {
  console.error('Usage: npm run intent:status -- --graph <safe-repository-relative-path> [--trust-snapshot <safe-repository-relative-path>] [--detail]');
  process.exit(2);
}

let graphPath;
let snapshotPath;
try {
  graphPath = path.resolve(root, requireSafeRelativePath(filtered[graphIndex + 1], 'graph'));
  snapshotPath = path.resolve(root, requireSafeRelativePath(
    snapshotIndex === -1 ? 'blueprint/intent-trust-snapshot.json' : filtered[snapshotIndex + 1],
    'trust snapshot'
  ));
} catch (error) {
  console.error(JSON.stringify({ state: 'BLOCKED', currentness: 'CURRENT', errors: [error.message] }, null, 2));
  process.exit(1);
}
if (!fs.existsSync(graphPath)) {
  console.error(JSON.stringify({ state: 'BLOCKED', currentness: 'CURRENT', errors: [`graph not found: ${filtered[graphIndex + 1]}`] }, null, 2));
  process.exit(1);
}
if (!fs.existsSync(snapshotPath)) {
  console.error(JSON.stringify({ state: 'BLOCKED', currentness: 'CURRENT', errors: ['trusted intent snapshot not found'] }, null, 2));
  process.exit(1);
}

const bundle = loadBlueprint(root);
const registry = bundle.intentRegistry;
const graph = readJson(graphPath);
const trustSnapshot = readJson(snapshotPath);
const projection = projectIntentStatus(graph, {
  registry,
  registeredProcessRefs: bundle.factory.processes.map((item) => item.processRef),
  registeredRoleRefs: bundle.blueprint.roles.map((item) => item.roleRef),
  trustSnapshot
});
console.log(JSON.stringify(detail ? { ...projection, detail: graph } : projection, null, 2));
if (projection.state === 'BLOCKED') process.exitCode = 1;

// [VXG RealForever]
