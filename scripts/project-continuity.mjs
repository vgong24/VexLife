#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  compileProjectContinuity,
  formLaneFocusCard,
  projectProjectBoard,
  projectProjectGraph,
} from '../src/core/project-continuity.mjs';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { readIntentWorkgraphRuntimeSnapshotEntries } from '../src/core/intent-workgraph-runtime-snapshot.mjs';
import { requireSafeRelativePath } from '../src/core/utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const allowed = new Set(['--project', '--home', '--view', '--format', '--work-node']);
for (let index = 0; index < args.length; index += 2) {
  if (!allowed.has(args[index]) || !args[index + 1]) {
    console.error('Usage: npm run project:status -- --project <json> --home <vex-home> --format board|graph|focus [--view <json>] [--work-node <ref>]');
    process.exit(2);
  }
}

function readSource(relativePath, label) {
  requireSafeRelativePath(relativePath, label);
  const file = path.resolve(ROOT, relativePath);
  const rel = path.relative(ROOT, file);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`${label} escapes repository root`);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be one regular source file`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const projectPath = value('--project');
const home = value('--home');
const format = value('--format');
if (!projectPath || !home || !['board', 'graph', 'focus'].includes(format)) {
  console.error('project:status requires --project, --home, and --format board|graph|focus');
  process.exit(2);
}

const registry = readSource('blueprint/project-continuity-registry.json', 'project continuity registry');
const sourceBundle = loadBlueprint(ROOT);
const intentRegistry = sourceBundle.intentRegistry;
const intentTrustSnapshot = readSource('blueprint/intent-trust-snapshot.json', 'Intent trust snapshot');
const project = readSource(projectPath, 'project definition');
const workgraphEntries = readIntentWorkgraphRuntimeSnapshotEntries({ home });
const snapshot = compileProjectContinuity({
  registry,
  intentRegistry,
  project,
  workgraphEntries,
  intentValidationContext: {
    registeredProcessRefs: sourceBundle.factory.processes.map((item) => item.processRef),
    registeredRoleRefs: sourceBundle.blueprint.roles.map((item) => item.roleRef),
    trustSnapshot: intentTrustSnapshot,
  },
  registeredFeatureRefs: sourceBundle.featureRegistry.features.map((item) => item.featureRef),
});
let output;
if (format === 'board') {
  const viewPath = value('--view');
  if (!viewPath) throw new Error('board format requires --view');
  output = projectProjectBoard({ registry, snapshot, view: readSource(viewPath, 'project view') });
} else if (format === 'graph') {
  output = projectProjectGraph(snapshot);
} else {
  const workNodeRef = value('--work-node');
  if (!workNodeRef) throw new Error('focus format requires --work-node');
  output = formLaneFocusCard({ snapshot, workNodeRef, intentRegistry });
}
console.log(JSON.stringify(output, null, 2));

// [VXG RealForever]
