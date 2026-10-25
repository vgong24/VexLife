#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadBlueprint } from '../src/core/blueprint.mjs';
import { compileProjectContinuity } from '../src/core/project-continuity.mjs';
import {
  PROJECT_PLANNING_TRANSACTION_SCHEMA,
  PROJECT_WORK_TRANSITION_REQUEST_SCHEMA,
  validateProjectWorkTransitionRequest,
} from '../src/core/project-planning.mjs';
import { applyProjectPlanningRuntimeTransaction } from '../src/core/project-planning-runtime-snapshot.mjs';
import {
  readIntentWorkgraphRuntimeSnapshotEntries,
  recordIntentWorkgraphRuntimeTransition,
} from '../src/core/intent-workgraph-runtime-snapshot.mjs';
import { requireSafeRelativePath } from '../src/core/utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const values = (name) => args.flatMap((item, index) => item === name && args[index + 1] ? [args[index + 1]] : []);
const allowed = new Set(['--home', '--project', '--transaction', '--view']);
for (let index = 0; index < args.length; index += 2) {
  if (!allowed.has(args[index]) || !args[index + 1]) {
    console.error('Usage: npm run project:planning -- --home <vex-home> --project <project.json> --transaction <transaction.json> [--view <view.json> ...]');
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
const transactionPath = value('--transaction');
if (!home || !projectPath || !transactionPath) {
  console.error('project:planning requires --home, --project and --transaction');
  process.exit(2);
}

const sourceBundle = loadBlueprint(ROOT);
const projectContinuityRegistry = readSource('blueprint/project-continuity-registry.json', 'Project Continuity registry');
const projectPlanningRegistry = readSource('blueprint/project-planning-registry.json', 'Project Planning registry');
const intentTrustSnapshot = readSource('blueprint/intent-trust-snapshot.json', 'Intent trust snapshot');
const project = readSource(projectPath, 'Project definition');
const views = values('--view').map((source) => readSource(source, 'Project view'));
const transaction = readSource(transactionPath, 'Project transaction');
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

const knownLaneRefs = projectContinuityRegistry.boardLanes.map((lane) => lane.laneRef);
const knownViewRefs = views
  .filter((view) => view?.projectRef === projectSnapshot.projectRef)
  .map((view) => view.viewRef);

let result;
if (transaction.schemaVersion === PROJECT_PLANNING_TRANSACTION_SCHEMA) {
  const applied = applyProjectPlanningRuntimeTransaction({
    home,
    transaction,
    projectSnapshot,
    knownLaneRefs,
    knownViewRefs,
    registry: projectPlanningRegistry,
  });
  result = {
    schemaVersion: 'vexlife.project-planning-command-result/v1',
    disposition: 'PASS',
    transactionClass: 'PLANNING',
    projectRef: projectSnapshot.projectRef,
    changed: applied.changed,
    reasonOrNull: applied.reason,
    planningPointer: applied.pointer,
    planningSnapshot: applied.snapshot,
    workgraphPointer: null,
    effects: {
      planningMutationPerformed: applied.changed,
      workgraphMutationPerformed: false,
      providerMutationPerformed: false,
    },
  };
} else if (transaction.schemaVersion === PROJECT_WORK_TRANSITION_REQUEST_SCHEMA) {
  const workgraphEntry = workgraphEntries.find((entry) => entry.graph.graphRef === transaction.graphRef);
  const validated = validateProjectWorkTransitionRequest({
    request: transaction,
    projectSnapshot,
    workgraphEntry,
    intentRegistry: sourceBundle.intentRegistry,
  });
  const applied = recordIntentWorkgraphRuntimeTransition({
    home,
    graphRef: validated.request.graphRef,
    expectedPointerSha256: validated.request.expectedWorkgraphPointerSha256,
    transition: validated.transition,
    registry: sourceBundle.intentRegistry,
    instanceRef: validated.request.instanceRef,
    observedAt: validated.request.requestedAt,
  });
  result = {
    schemaVersion: 'vexlife.project-planning-command-result/v1',
    disposition: 'PASS',
    transactionClass: 'WORK_TRANSITION',
    projectRef: projectSnapshot.projectRef,
    changed: applied.changed,
    reasonOrNull: applied.reason,
    planningPointer: null,
    planningSnapshot: null,
    workgraphPointer: applied.pointer,
    effects: {
      planningMutationPerformed: false,
      workgraphMutationPerformed: applied.changed,
      providerMutationPerformed: false,
    },
  };
} else {
  throw new Error(`unsupported Project transaction schema ${transaction.schemaVersion ?? 'MISSING'}`);
}

console.log(JSON.stringify(result, null, 2));

// [VXG RealForever]
