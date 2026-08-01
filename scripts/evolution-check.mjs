#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIdentityIndex, loadBlueprint, validateBlueprint, validateEvolutionRegistry } from '../src/core/blueprint.mjs';
import { Atlas } from '../src/core/atlas.mjs';
import {
  BEHAVIOR_ORIGIN_CLASSES,
  CONTINUITY_LINKED_DESTINATIONS,
  CONTINUITY_OBSERVATION_TYPES,
  CONTINUITY_PRIMARY_DESTINATIONS,
  CONTINUITY_SCOPE_CLASSES,
  CONTINUITY_CURRENTNESS_STATES,
  CONTINUITY_VISIBILITY_STATES,
  CONTINUITY_SYNCHRONIZATION_SCOPES
} from '../src/core/continuity-evolution-router.mjs';
import { BURDEN_RELEASE_FRAMES, BURDEN_RELEASE_STATES } from '../src/core/burden-release.mjs';
import { compileRegistryPack } from '../src/core/registry.mjs';
import { readJson, semanticHash } from '../src/core/utils.mjs';
import { runContinuityEvolutionSimulation } from './evolution-simulate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = loadBlueprint(root);
const evolution = bundle.evolution;
const blueprintValidation = validateBlueprint(bundle);
const errors = blueprintValidation.ok ? [] : blueprintValidation.errors.map((error) => `blueprint: ${error}`);
const evolutionValidation = validateEvolutionRegistry(evolution, bundle);
errors.push(...evolutionValidation.errors.map((error) => `evolution: ${error}`));

function exactArray(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push(`${label} does not match source implementation vocabulary`);
}

exactArray('observationTypes', evolution.observationTypes, CONTINUITY_OBSERVATION_TYPES);
exactArray('behaviorOriginClasses', evolution.behaviorOriginClasses, BEHAVIOR_ORIGIN_CLASSES);
exactArray('scopeClasses', evolution.scopeClasses, CONTINUITY_SCOPE_CLASSES);
exactArray('primaryDestinations', evolution.primaryDestinations, CONTINUITY_PRIMARY_DESTINATIONS);
exactArray('linkedDestinations', evolution.linkedDestinations, CONTINUITY_LINKED_DESTINATIONS);
exactArray('currentnessStates', evolution.currentnessStates, CONTINUITY_CURRENTNESS_STATES);
exactArray('visibilityStates', evolution.visibilityStates, CONTINUITY_VISIBILITY_STATES);
exactArray('synchronizationScopes', evolution.synchronizationScopes, CONTINUITY_SYNCHRONIZATION_SCOPES);
exactArray('Burden Release frames', evolution.burdenRelease?.releaseFrames, BURDEN_RELEASE_FRAMES);
exactArray('Burden Release states', evolution.burdenRelease?.states, BURDEN_RELEASE_STATES);

if (semanticHash(bundle.blueprint.evolution) !== semanticHash(evolution)) {
  errors.push('canonical bundle evolution composition does not match universal Blueprint');
}
if (evolution.resourceRules?.maximumConcurrentTrainingRuns !== 0) errors.push('maximumConcurrentTrainingRuns must remain 0');
if (evolution.recurrencePolicy?.automaticWeightEscalationAllowed !== false) errors.push('recurrence automatic weight escalation must remain false');
if (evolution.simulationContract?.externalEffectsExecuted !== false) errors.push('simulation contract must prohibit external effects');
if (evolution.simulationContract?.modelWeightsChanged !== false) errors.push('simulation contract must prohibit model-weight change');

const processRefs = new Set(bundle.factory.processes.map((item) => item.processRef));
const moduleRefs = new Set(bundle.modules.modules.map((item) => item.moduleRef));
const testRefs = new Set(bundle.blueprint.tests.map((item) => item.testRef));
for (const ref of evolution.processRefs ?? []) if (!processRefs.has(ref)) errors.push(`canonical process registry missing ${ref}`);
for (const ref of evolution.moduleRefs ?? []) if (!moduleRefs.has(ref)) errors.push(`canonical module registry missing ${ref}`);
for (const ref of evolution.testRefs ?? []) if (!testRefs.has(ref)) errors.push(`canonical test registry missing ${ref}`);
if (!bundle.blueprint.stateDomains.some((item) => item.stateRef === 'state.evolution')) errors.push('canonical state registry missing state.evolution');
if (!bundle.featureRegistry.features.some((item) => item.featureRef === 'feature.vexlife.continuity-evolution-router')) {
  errors.push('feature registry missing feature.vexlife.continuity-evolution-router');
}
if (!bundle.buildHealth.checks.some((item) => item.checkRef === 'check.continuity-evolution' && item.command === 'npm run evolution:check')) {
  errors.push('build health registry missing check.continuity-evolution');
}
if (!bundle.implementationPlan.workUnits.some((item) => item.workRef === 'work.vexlife.continuity-evolution-router')) {
  errors.push('implementation plan missing work.vexlife.continuity-evolution-router');
}
for (const requiredCheck of ['check.manifest', 'check.browser-integration', 'check.tests', 'check.continuity-evolution']) {
  if (!bundle.buildHealth.checks.some((item) => item.checkRef === requiredCheck && item.blocking === true)) {
    errors.push(`E22 full gate missing blocking ${requiredCheck}`);
  }
}
const packageJson = readJson(path.join(root, 'package.json'));
for (const command of ['evolution:check', 'evolution:simulate', 'evolution:status', 'pr-ready', 'health:check']) {
  if (!packageJson.scripts?.[command]) errors.push(`package scripts missing ${command}`);
}

let compiled = null;
try {
  compiled = compileRegistryPack(bundle);
  for (const ref of [
    evolution.registryRef,
    evolution.canonicalSourceRef,
    evolution.systemRef,
    evolution.burdenRelease.contractRef,
    evolution.contextReview.contractRef,
    evolution.recurrencePolicy.contractRef,
    evolution.simulationContract.contractRef,
    evolution.acceptancePolicies[0].policyRef,
    evolution.projectionIdentities[0].projectionRef,
    'feature.vexlife.continuity-evolution-router',
    'process.vexlife.continuity.observe-route-review',
    'process.vexlife.continuity.accept-and-project',
    'process.vexlife.continuity.monitor-recurrence',
    'module.vexlife.core.continuity-evolution-router',
    'module.vexlife.core.burden-release',
    'test.continuity-evolution.e22-full-gate'
  ]) compiled.require(ref);
  const atlas = new Atlas(buildIdentityIndex(bundle));
  const traversal = atlas.query({ startRefs: [evolution.registryRef], depthLimit: 2, resultLimit: 128, tokenBudget: 20000 });
  for (const ref of [evolution.systemRef, evolution.contextReview.contractRef, evolution.recurrencePolicy.contractRef, evolution.simulationContract.contractRef]) {
    if (!traversal.results.some((item) => item.ref === ref)) errors.push(`bounded Atlas traversal cannot resolve ${ref}`);
  }
} catch (error) {
  errors.push(`canonical evolution registry compilation failed: ${error.message}`);
}

let simulation = null;
try {
  simulation = runContinuityEvolutionSimulation({ root, writeReceipt: true, receiptPath: evolution.simulationContract.receiptPath });
  if (simulation.receipt.state !== 'PASS') errors.push('integrated continuity evolution simulation did not pass');
  if (JSON.stringify(simulation.receipt.journeyStates) !== JSON.stringify(evolution.simulationContract.requiredJourneyStates)) {
    errors.push('integrated continuity evolution journey does not match registry contract');
  }
  if (simulation.receipt.externalEffectsExecuted !== false) errors.push('integrated continuity evolution simulation executed an external effect');
  if (simulation.receipt.modelWeightsChanged !== false) errors.push('integrated continuity evolution simulation changed model weights');
  if (simulation.receipt.duplicateRecurrenceSuppressed !== true) errors.push('integrated continuity evolution simulation did not suppress duplicate recurrence');
  if (simulation.receipt.canonicalWorkNodeFinalState !== 'COMPLETED') errors.push('bound canonical Workgraph node did not complete');
  if (simulation.receipt.canonicalWorkNodeRef !== evolution.simulationContract.workNodeRef) errors.push('continuity simulation completed the wrong Workgraph node');
  if (simulation.receipt.evolutionRegistryHash !== semanticHash(evolution)) errors.push('continuity simulation receipt has stale evolution registry hash');
  if (Object.keys(simulation.receipt.continuityGateBindings ?? {}).length !== evolution.simulationContract.requiredBindingKinds.length) errors.push('continuity simulation did not bind all required evidence kinds');
  if (!simulation.receipt.schedulerContextApplicableReleaseRefs?.includes(simulation.receipt.burdenReleaseRef)) errors.push('continuity simulation scheduler context omitted the applicable release ref');
} catch (error) {
  errors.push(`integrated continuity evolution simulation failed: ${error.message}`);
}

const result = {
  schemaVersion: 'vexlife.continuity-evolution-check-result/v0',
  state: errors.length ? 'FAILED' : 'VALID',
  currentness: 'CURRENT',
  evolutionState: errors.length ? 'CONTINUITY_EVOLUTION_INVALID' : 'CONTINUITY_EVOLUTION_VALID',
  registryRef: evolution?.registryRef ?? null,
  systemRef: evolution?.systemRef ?? null,
  observationTypes: evolution?.observationTypes?.length ?? 0,
  behaviorOriginClasses: evolution?.behaviorOriginClasses?.length ?? 0,
  scopeClasses: evolution?.scopeClasses?.length ?? 0,
  primaryDestinations: evolution?.primaryDestinations?.length ?? 0,
  registeredProcesses: evolution?.processRefs?.length ?? 0,
  registeredModules: evolution?.moduleRefs?.length ?? 0,
  registeredTests: evolution?.testRefs?.filter((ref) => ref.startsWith('test.continuity-evolution.')).length ?? 0,
  canonicalRegistryEntries: compiled?.entries.size ?? 0,
  maximumConcurrentTrainingRuns: evolution?.resourceRules?.maximumConcurrentTrainingRuns ?? null,
  registryHash: semanticHash(evolution),
  blueprintHash: blueprintValidation.semanticHash,
  simulationReceiptPath: simulation?.receiptPath ?? evolution?.simulationContract?.receiptPath ?? null,
  simulationReceiptFingerprint: simulation?.receipt.semanticFingerprint ?? null,
  simulationJourneyStates: simulation?.receipt.journeyStates ?? [],
  errors
};
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;

// [VXG RealForever]
