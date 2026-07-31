#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { admitIntentSchedulerQueue } from '../src/core/intent-scheduler.mjs';
import { readJson, requireSafeRelativePath } from '../src/core/utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fixtureIndex = args.indexOf('--fixture');
if (args.length !== 2 || fixtureIndex === -1 || !args[fixtureIndex + 1]) {
  console.error('Usage: npm run scheduler:status -- --fixture <safe-repository-relative-path>');
  process.exit(2);
}

let fixturePath;
try {
  fixturePath = path.resolve(root, requireSafeRelativePath(args[fixtureIndex + 1], 'fixture'));
} catch (error) {
  console.error(JSON.stringify({ state: 'BLOCKED', currentness: 'CURRENT', errors: [error.message] }, null, 2));
  process.exit(1);
}
if (!fs.existsSync(fixturePath)) {
  console.error(JSON.stringify({ state: 'BLOCKED', currentness: 'CURRENT', errors: [`fixture not found: ${args[fixtureIndex + 1]}`] }, null, 2));
  process.exit(1);
}

const bundle = loadBlueprint(root);
const fixture = readJson(fixturePath);
const queue = admitIntentSchedulerQueue(fixture.graph, {
  intentRegistry: bundle.intentRegistry,
  registeredProcessRefs: bundle.factory.processes.map((item) => item.processRef),
  registeredRoleRefs: bundle.blueprint.roles.map((item) => item.roleRef),
  trustSnapshot: fixture.trustSnapshot,
  resourceSnapshot: fixture.resourceSnapshot,
  resourceRequestByNodeRef: fixture.resourceRequestByNodeRef,
  occupancyByNodeRef: fixture.occupancyByNodeRef,
  capabilityLeaseByNodeRef: fixture.capabilityLeaseByNodeRef,
  effectLeaseByNodeRef: fixture.effectLeaseByNodeRef,
  resourceLeaseRefByNodeRef: fixture.resourceLeaseRefByNodeRef,
  workerRef: fixture.workerRef,
  schedulerGeneration: fixture.schedulerGeneration,
  fairnessMaxDeferrals: fixture.fairnessMaxDeferrals,
  formedAt: fixture.formedAt,
  expiresAt: fixture.expiresAt
});
console.log(JSON.stringify({
  schemaVersion: 'vexlife.intent-scheduler-status/v0',
  state: queue.state,
  currentness: queue.currentness,
  generation: queue.generation,
  graphRef: queue.graphRef,
  graphFingerprint: queue.graphFingerprint,
  logicalReady: queue.logicalReady,
  selected: queue.selected,
  blocked: queue.blocked,
  admissionReceiptRef: queue.admissionReceipt?.admissionReceiptRef ?? null,
  sourceDescent: {
    fixture: args[fixtureIndex + 1],
    registryRef: 'registry.vexlife.intent-scheduler.001'
  },
  rawGraphIncluded: false,
  rawResourceSnapshotIncluded: false
}, null, 2));
if (queue.state === 'BLOCKED') process.exitCode = 1;

// [VXG RealForever]
