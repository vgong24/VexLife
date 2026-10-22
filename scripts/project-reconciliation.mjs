#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadBlueprint } from '../src/core/blueprint.mjs';
import { compileProjectContinuity } from '../src/core/project-continuity.mjs';
import { reconcileProjectEvidence } from '../src/core/project-reconciliation.mjs';
import { readIntentWorkgraphRuntimeSnapshotEntries } from '../src/core/intent-workgraph-runtime-snapshot.mjs';
import { requireSafeRelativePath } from '../src/core/utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const allowed = new Set([
  '--home',
  '--project',
  '--relation',
  '--orientation',
  '--validation-evidence',
  '--provider',
]);
for (let index = 0; index < args.length; index += 2) {
  if (!allowed.has(args[index]) || !args[index + 1]) {
    console.error('Usage: npm run project:reconcile -- --home <vex-home> --project <project.json> --relation <relation.json> --orientation <orientation.json> --validation-evidence <bundle.json> --provider <provider.json>');
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

const home = value('--home');
const projectPath = value('--project');
const relationPath = value('--relation');
const orientationPath = value('--orientation');
const validationEvidencePath = value('--validation-evidence');
const providerPath = value('--provider');
if (!home || !projectPath || !relationPath || !orientationPath || !validationEvidencePath || !providerPath) {
  console.error('project:reconcile requires --home, --project, --relation, --orientation, --validation-evidence and --provider');
  process.exit(2);
}

const sourceBundle = loadBlueprint(ROOT);
const projectContinuityRegistry = readSource('blueprint/project-continuity-registry.json', 'Project Continuity registry');
const projectReconciliationRegistry = readSource('blueprint/project-reconciliation-registry.json', 'Project Reconciliation registry');
const intentTrustSnapshot = readSource('blueprint/intent-trust-snapshot.json', 'Intent trust snapshot');
const project = readSource(projectPath, 'Project definition');
const relation = readSource(relationPath, 'Project evidence relation');
const orientationReceipt = readSource(orientationPath, 'Orientation receipt');
const validationEvidenceBundle = readSource(validationEvidencePath, 'Build Health validation evidence bundle');
const providerObservation = readSource(providerPath, 'Project provider observation');
const workgraphEntries = readIntentWorkgraphRuntimeSnapshotEntries({ home });

const projectSnapshot = compileProjectContinuity({
  registry: projectContinuityRegistry,
  intentRegistry: sourceBundle.intentRegistry,
  project,
  workgraphEntries,
  intentValidationContext: {
    registeredProcessRefs: sourceBundle.factory.processes.map((item) => item.processRef),
    registeredRoleRefs: sourceBundle.blueprint.roles.map((item) => item.roleRef),
    trustSnapshot: intentTrustSnapshot,
  },
  registeredFeatureRefs: sourceBundle.featureRegistry.features.map((item) => item.featureRef),
});

const result = reconcileProjectEvidence({
  registry: projectReconciliationRegistry,
  projectSnapshot,
  relation,
  orientationReceipt,
  validationEvidenceBundle,
  validationEvidencePolicy: sourceBundle.buildHealth.validationEvidencePolicy,
  providerObservation,
  intentRegistry: sourceBundle.intentRegistry,
});

console.log(JSON.stringify(result, null, 2));

// [VXG RealForever]
