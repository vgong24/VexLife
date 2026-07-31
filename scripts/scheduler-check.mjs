#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildIdentityIndex,
  loadBlueprint,
  validateBlueprint
} from '../src/core/blueprint.mjs';
import { Atlas } from '../src/core/atlas.mjs';
import { compileRegistryPack } from '../src/core/registry.mjs';
import { validateIntentSchedulerRegistry } from '../src/core/scheduler-runtime-trust.mjs';
import { semanticHash } from '../src/core/utils.mjs';
import { runSchedulerSimulation } from './scheduler-simulate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = loadBlueprint(root);
const schedulerRegistry = bundle.schedulerRegistry;
const schedulerValidation = validateIntentSchedulerRegistry(schedulerRegistry);
const blueprintValidation = validateBlueprint(bundle);
const errors = [
  ...schedulerValidation.errors.map((error) => `scheduler registry: ${error}`),
  ...(blueprintValidation.ok ? [] : blueprintValidation.errors.map((error) => `blueprint: ${error}`))
];

if (semanticHash(bundle.blueprint.intentScheduler) !== semanticHash(schedulerRegistry)) {
  errors.push('canonical bundle scheduler composition does not match universal Blueprint');
}

let registry = null;
try {
  registry = compileRegistryPack(bundle);
  for (const ref of [
    schedulerRegistry.registryRef,
    schedulerRegistry.systemRef,
    schedulerRegistry.canonicalSourceRef,
    schedulerRegistry.runtimeTrustContract.contractRef,
    schedulerRegistry.runtimeTrustContract.clockRef,
    schedulerRegistry.simulationContract.contractRef,
    ...schedulerRegistry.priorityClassIdentities.map((item) => item.priorityClassRef),
    ...schedulerRegistry.policyIdentities.map((item) => item.policyRef),
    ...schedulerRegistry.requiredFieldContracts.map((item) => item.contractRef),
    ...schedulerRegistry.runtimeSourceIdentities.flatMap((item) => [item.sourceRef, item.authorityRef]),
    ...schedulerRegistry.workerIdentities.map((item) => item.workerRef),
    ...schedulerRegistry.mockToolContracts.flatMap((item) => [
      item.contractRef,
      item.toolRef,
      item.effectRef,
      item.argumentSchemaRef,
      item.resultSchemaRef,
      item.executorRef
    ]),
    ...schedulerRegistry.projectionIdentities.map((item) => item.projectionRef),
    ...schedulerRegistry.processRefs,
    ...schedulerRegistry.testRefs
  ]) registry.require(ref);
} catch (error) {
  errors.push(`canonical scheduler registry compilation failed: ${error.message}`);
}

const atlas = new Atlas(buildIdentityIndex(bundle));
const atlasResult = atlas.query({
  startRefs: [schedulerRegistry.registryRef],
  depthLimit: 2,
  resultLimit: 64,
  tokenBudget: 12000
});
for (const ref of [
  schedulerRegistry.registryRef,
  schedulerRegistry.systemRef,
  schedulerRegistry.canonicalSourceRef,
  schedulerRegistry.runtimeTrustContract.contractRef,
  schedulerRegistry.simulationContract.contractRef
]) {
  if (!atlasResult.results.some((item) => item.ref === ref)) errors.push(`bounded scheduler Atlas traversal did not resolve ${ref}`);
}

let simulation = null;
try {
  simulation = runSchedulerSimulation({ root, writeReceipt: true });
  if (simulation.receipt.state !== 'PASS') errors.push('integrated scheduler simulation did not pass');
  if (simulation.receipt.externalEffectsExecuted !== false) errors.push('integrated scheduler simulation executed an external effect');
  if (simulation.receipt.orphanedPendingToolCalls !== 0) errors.push('integrated scheduler simulation left an orphaned tool call');
  if (simulation.receipt.selfCertifiedRuntimeEvidence !== false) errors.push('integrated scheduler simulation used self-certified runtime evidence');
} catch (error) {
  errors.push(`integrated scheduler simulation failed: ${error.message}`);
}

const result = {
  schemaVersion: 'vexlife.intent-scheduler-check-result/v1',
  state: errors.length ? 'FAILED' : 'VALID',
  currentness: 'CURRENT',
  schedulerState: errors.length ? 'INTENT_SCHEDULER_INVALID' : 'INTENT_SCHEDULER_VALID',
  registryRef: schedulerRegistry?.registryRef ?? null,
  systemRef: schedulerRegistry?.systemRef ?? null,
  canonicalSourceRef: schedulerRegistry?.canonicalSourceRef ?? null,
  modelInferenceConcurrency: schedulerRegistry?.physicalWorkerPolicy?.modelInferenceConcurrency,
  priorityClasses: schedulerRegistry?.priorityClassIdentities?.length ?? 0,
  registeredProcesses: schedulerRegistry?.processRefs?.length ?? 0,
  registeredTests: schedulerRegistry?.testRefs?.length ?? 0,
  canonicalRegistryEntries: registry?.entries.size ?? 0,
  schedulerOwnedRefs: schedulerValidation.stats.ownedRefs,
  atlasResolvedRefs: atlasResult.results.length,
  schedulerRegistryHash: semanticHash(schedulerRegistry),
  blueprintHash: blueprintValidation.semanticHash,
  simulationReceiptPath: simulation?.receiptPath ?? schedulerRegistry?.simulationContract?.receiptPath ?? null,
  simulationReceiptFingerprint: simulation?.receipt.semanticFingerprint ?? null,
  simulationJourneyStates: simulation?.receipt.journeyStates ?? [],
  errors
};
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;

// [VXG RealForever]
