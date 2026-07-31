#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { projectIntentPlan } from '../src/core/intent-projection.mjs';
import { readJson, requireSafeRelativePath } from '../src/core/utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fixtureIndex = args.indexOf('--fixture');
const snapshotIndex = args.indexOf('--trust-snapshot');
const expectedLength = snapshotIndex === -1 ? 2 : 4;
if (args.length !== expectedLength ||
    fixtureIndex === -1 ||
    !args[fixtureIndex + 1] ||
    (snapshotIndex !== -1 && !args[snapshotIndex + 1])) {
  console.error('Usage: npm run intent:plan -- --fixture <safe-repository-relative-path> [--trust-snapshot <safe-repository-relative-path>]');
  process.exit(2);
}

let fixturePath;
let snapshotPath;
try {
  fixturePath = path.resolve(root, requireSafeRelativePath(args[fixtureIndex + 1], 'fixture'));
  snapshotPath = path.resolve(root, requireSafeRelativePath(
    snapshotIndex === -1 ? 'blueprint/intent-trust-snapshot.json' : args[snapshotIndex + 1],
    'trust snapshot'
  ));
} catch (error) {
  console.error(JSON.stringify({ state: 'BLOCKED', currentness: 'CURRENT', errors: [error.message] }, null, 2));
  process.exit(1);
}
if (!fs.existsSync(fixturePath)) {
  console.error(JSON.stringify({ state: 'BLOCKED', currentness: 'CURRENT', errors: [`fixture not found: ${args[fixtureIndex + 1]}`] }, null, 2));
  process.exit(1);
}
if (!fs.existsSync(snapshotPath)) {
  console.error(JSON.stringify({ state: 'BLOCKED', currentness: 'CURRENT', errors: ['trusted intent snapshot not found'] }, null, 2));
  process.exit(1);
}

const bundle = loadBlueprint(root);
const registry = bundle.intentRegistry;
const graph = readJson(fixturePath);
const trustSnapshot = readJson(snapshotPath);
const projection = projectIntentPlan(graph, {
  registry,
  registeredProcessRefs: bundle.factory.processes.map((item) => item.processRef),
  registeredRoleRefs: bundle.blueprint.roles.map((item) => item.roleRef),
  trustSnapshot
});
console.log(JSON.stringify(projection, null, 2));
if (projection.state === 'BLOCKED') process.exitCode = 1;

// [VXG RealForever]
