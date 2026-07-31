#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { validateIntentRegistry } from '../src/core/intent-validation.mjs';
import { compileRegistryPack } from '../src/core/registry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = loadBlueprint(root);
const registry = bundle.intentRegistry;
const contract = validateIntentRegistry(registry);
const errors = [...contract.errors];
const compiled = compileRegistryPack(bundle);

const requiredModuleRefs = [
  'module.vexlife.core.intent-workgraph',
  'module.vexlife.core.intent-validation',
  'module.vexlife.core.intent-projection',
  'module.vexlife.script.intent-check',
  'module.vexlife.script.intent-plan',
  'module.vexlife.script.intent-status'
];
const processRefs = new Set((bundle.factory?.processes ?? []).map((item) => item.processRef));
const moduleRefs = new Set((bundle.modules?.modules ?? []).map((item) => item.moduleRef));
const testRefs = new Set(bundle.blueprint.tests.map((item) => item.testRef));
for (const ref of registry.processRefs) if (!processRefs.has(ref)) errors.push(`canonical process registry missing ${ref}`);
for (const ref of requiredModuleRefs) if (!moduleRefs.has(ref)) errors.push(`canonical module registry missing ${ref}`);
if (!bundle.blueprint.stateDomains.some((item) => item.stateRef === 'state.intent-workgraph')) errors.push('canonical state registry missing state.intent-workgraph');
if (!bundle.featureRegistry.features.some((item) => item.featureRef === 'feature.vexlife.intent-orchestration-spine')) errors.push('feature registry missing feature.vexlife.intent-orchestration-spine');
if (!bundle.buildHealth.checks.some((item) => item.checkRef === 'check.intent-orchestration' && item.command === 'npm run intent:check')) errors.push('build health registry missing check.intent-orchestration');
if (!bundle.implementationPlan.workUnits.some((item) => item.workRef === 'work.vexlife.intent-orchestration-spine')) errors.push('implementation plan missing work.vexlife.intent-orchestration-spine');
for (const ref of [
  'test.intent.original-immutable',
  'test.intent.simple-process-resolution',
  'test.intent.acyclic-decomposition',
  'test.intent.cycle-self-rejected',
  'test.intent.active-semantic-dedup',
  'test.intent.binding-fail-closed',
  'test.intent.dependency-receipts',
  'test.intent.completion-evidence',
  'test.intent.mutation-head-transition',
  'test.intent.parent-convergence',
  'test.intent.held-unknown-visible',
  'test.intent.cancellation-lineage',
  'test.intent.transition-no-op',
  'test.intent.compact-source-descent',
  'test.intent.registry-resolution',
  'test.intent.full-gate'
]) if (!testRefs.has(ref)) errors.push(`canonical test registry missing ${ref}`);
for (const ref of [
  registry.registryRef,
  registry.systemRef,
  registry.receiptContract.contractRef,
  ...registry.lifecycleStateRefs.map((item) => item.ref),
  ...registry.receiptStateRefs.map((item) => item.ref),
  ...registry.projectionIdentities.map((item) => item.projectionRef),
  ...Object.values(registry.attributedProjectionContracts).map((item) => item.contractRef),
  ...registry.knownIntentProcessRoutes.map((item) => item.resolutionRef)
]) if (!compiled.get(ref)) errors.push(`compiled Atlas registry missing ${ref}`);

const result = {
  schemaVersion: 'vexlife.intent-check-result/v0',
  state: errors.length ? 'FAILED' : 'VALID',
  currentness: 'CURRENT',
  intentState: errors.length ? 'INTENT_ORCHESTRATION_INVALID' : 'INTENT_ORCHESTRATION_VALID',
  registryRef: registry.registryRef,
  systemRef: registry.systemRef,
  lifecycleStates: contract.stats.lifecycleStates,
  processRefs: contract.stats.processRefs,
  moduleRefs: requiredModuleRefs.length,
  registeredTests: [...testRefs].filter((ref) => ref.startsWith('test.intent.')).length,
  errors
};
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;

// [VXG RealForever]
