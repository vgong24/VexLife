#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { readJson, semanticHash } from '../src/core/utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = loadBlueprint(root);
const registry = readJson(path.join(root, 'blueprint/intent-scheduler-registry.json'));
const composed = bundle.blueprint.intentScheduler;
const errors = [];

if (registry.schemaVersion !== 'vexlife.intent-scheduler-registry/v0') errors.push('unexpected scheduler registry schema');
if (semanticHash(registry) !== semanticHash(composed)) errors.push('universal blueprint scheduler composition does not match source registry');
if (registry.physicalWorkerPolicy?.modelInferenceConcurrency !== 1) errors.push('modelInferenceConcurrency must equal one');
if (registry.physicalWorkerPolicy?.backgroundModelConcurrencyWhileInteractiveWaits !== 0) errors.push('background concurrency must be zero while interactive work waits');
if (registry.physicalWorkerPolicy?.activeContextLeasesPerWorker !== 1) errors.push('active context leases per worker must equal one');
if (registry.resourceUnknownPolicy !== 'UNKNOWN_IS_NOT_SPARE_CAPACITY') errors.push('unknown resource state must fail closed');
if (!(registry.fairnessPolicy?.maxDeferrals > 0)) errors.push('bounded fairness maxDeferrals must be positive');

for (const [field, minimum] of [
  ['admissionRequiredFields', 20],
  ['contextLeaseRequiredFields', 18],
  ['resourceSnapshotRequiredFields', 18],
  ['resourceLeaseRequiredFields', 12],
  ['checkpointRequiredFields', 20],
  ['toolCallRequiredFields', 14],
  ['toolResultMatchFields', 6]
]) {
  if ((registry[field]?.length ?? 0) < minimum) errors.push(`${field} is incomplete`);
  if (new Set(registry[field] ?? []).size !== (registry[field]?.length ?? 0)) errors.push(`${field} contains duplicates`);
}

const stateRefs = new Set(bundle.blueprint.stateDomains.map((item) => item.stateRef));
const processRefs = new Set(bundle.factory.processes.map((item) => item.processRef));
const moduleRefs = new Set(bundle.modules.modules.map((item) => item.moduleRef));
const testRefs = new Set(bundle.blueprint.tests.map((item) => item.testRef));
const featureRefs = new Set(bundle.featureRegistry.features.map((item) => item.featureRef));
const checkRefs = new Set(bundle.buildHealth.checks.map((item) => item.checkRef));
const workRefs = new Set(bundle.implementationPlan.workUnits.map((item) => item.workRef));

for (const ref of ['state.intent-scheduler', 'state.context-lease', 'state.intent-checkpoint', 'state.tool-result-relay']) {
  if (!stateRefs.has(ref)) errors.push(`canonical state registry missing ${ref}`);
}
for (const ref of registry.processRefs ?? []) if (!processRefs.has(ref)) errors.push(`canonical process registry missing ${ref}`);
for (const ref of [
  'module.vexlife.core.state',
  'module.vexlife.core.resource-admission',
  'module.vexlife.core.context-lease',
  'module.vexlife.core.intent-checkpoint',
  'module.vexlife.core.tool-result-relay',
  'module.vexlife.core.intent-scheduler',
  'module.vexlife.script.scheduler-check',
  'module.vexlife.script.scheduler-simulate',
  'module.vexlife.script.scheduler-status'
]) if (!moduleRefs.has(ref)) errors.push(`canonical module registry missing ${ref}`);
for (const ref of registry.testRefs ?? []) if (!testRefs.has(ref)) errors.push(`canonical test registry missing ${ref}`);
if (!featureRefs.has('feature.vexlife.intent-orchestration-scheduler')) errors.push('feature registry missing scheduler feature');
if (!checkRefs.has('check.intent-scheduler')) errors.push('build health registry missing scheduler check');
if (!workRefs.has('work.vexlife.intent-orchestration-scheduler')) errors.push('implementation plan missing scheduler work unit');

const result = {
  schemaVersion: 'vexlife.intent-scheduler-check-result/v0',
  state: errors.length ? 'FAILED' : 'VALID',
  currentness: 'CURRENT',
  schedulerState: errors.length ? 'INTENT_SCHEDULER_INVALID' : 'INTENT_SCHEDULER_VALID',
  registryRef: registry.registryRef,
  systemRef: registry.systemRef,
  modelInferenceConcurrency: registry.physicalWorkerPolicy?.modelInferenceConcurrency,
  priorityClasses: registry.priorityClasses?.length ?? 0,
  registeredProcesses: registry.processRefs?.length ?? 0,
  registeredTests: registry.testRefs?.length ?? 0,
  semanticHash: semanticHash(registry),
  errors
};
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;

// [VXG RealForever]
