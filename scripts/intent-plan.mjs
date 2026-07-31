#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { projectIntentPlan } from '../src/core/intent-projection.mjs';
import { readJson, requireSafeRelativePath } from '../src/core/utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--fixture' || !args[1]) {
  console.error('Usage: npm run intent:plan -- --fixture <safe-repository-relative-path>');
  process.exit(2);
}

let fixturePath;
try {
  fixturePath = path.resolve(root, requireSafeRelativePath(args[1], 'fixture'));
} catch (error) {
  console.error(JSON.stringify({ state: 'BLOCKED', currentness: 'CURRENT', errors: [error.message] }, null, 2));
  process.exit(1);
}
if (!fs.existsSync(fixturePath)) {
  console.error(JSON.stringify({ state: 'BLOCKED', currentness: 'CURRENT', errors: [`fixture not found: ${args[1]}`] }, null, 2));
  process.exit(1);
}

const bundle = loadBlueprint(root);
const registry = bundle.intentRegistry;
const graph = readJson(fixturePath);
const projection = projectIntentPlan(graph, {
  registry,
  registeredProcessRefs: bundle.factory.processes.map((item) => item.processRef),
  registeredRoleRefs: bundle.blueprint.roles.map((item) => item.roleRef),
  registeredBindingRefs: graph.bindingRefs
});
console.log(JSON.stringify(projection, null, 2));
if (projection.state === 'BLOCKED') process.exitCode = 1;

// [VXG RealForever]
