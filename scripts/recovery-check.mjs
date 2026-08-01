#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Atlas } from '../src/core/atlas.mjs';
import { buildIdentityIndex, loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import {
  FAILURE_CLASSES,
  FAILURE_ENVELOPE_REQUIRED_FIELDS
} from '../src/core/runtime-failure.mjs';
import {
  RECOVERY_AGGREGATE_REQUIRED_FIELDS,
  RECOVERY_EVENT_TYPES
} from '../src/core/runtime-recovery.mjs';
import {
  EXECUTOR_OUTCOMES,
  RECOVERY_ACTIONS
} from '../src/core/recovery-policy.mjs';
import { readJson, semanticHash } from '../src/core/utils.mjs';
import { runRecoverySimulation, validateIntegratedRecoverySimulationReceipt } from './recovery-simulate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = loadBlueprint(root);
const registry = bundle.blueprint.runtimeRecovery;
const blueprint = validateBlueprint(bundle);
const errors = blueprint.ok ? [] : blueprint.errors.map((item) => `blueprint: ${item}`);

function exactArray(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push(`${label} does not match source implementation vocabulary`);
}

if (!registry || registry.schemaVersion !== 'vexlife.runtime-recovery-registry/v1') {
  errors.push('runtime recovery registry is missing or has the wrong schema');
} else {
  exactArray('failureClasses', registry.failureClasses, FAILURE_CLASSES);
  exactArray('executorOutcomes', registry.executorOutcomes, EXECUTOR_OUTCOMES);
  exactArray('recoveryActions', registry.recoveryActions, RECOVERY_ACTIONS);
  exactArray('failure envelope required fields', registry.failureEnvelope.requiredFields, FAILURE_ENVELOPE_REQUIRED_FIELDS);
  exactArray('recovery aggregate required fields', registry.recoveryAggregate.requiredFields, RECOVERY_AGGREGATE_REQUIRED_FIELDS);
  exactArray('recovery event types', registry.recoveryAggregate.eventTypes, RECOVERY_EVENT_TYPES);
  const classifierSources = registry.classifierContract?.sources ?? [];
  if (!registry.classifierContract?.executorFieldsAreEvidenceOnly ||
      !registry.classifierContract?.canonicalDefaultsArePolicyAuthority ||
      classifierSources.length < 4 || new Set(classifierSources.map((item) => item.sourceRef)).size !== classifierSources.length ||
      classifierSources.some((item) => !item.adapterRef || !item.allowedFailureClasses?.length)) {
    errors.push('classifier source/adapter provenance contract is incomplete');
  }
  const eventContracts = registry.recoveryAggregate.eventPayloadContracts ?? [];
  if (eventContracts.length !== RECOVERY_EVENT_TYPES.length ||
      new Set(eventContracts.map((item) => item.type)).size !== RECOVERY_EVENT_TYPES.length ||
      RECOVERY_EVENT_TYPES.some((type) => !eventContracts.some((item) => item.type === type && item.fields?.length))) {
    errors.push('edge-specific typed event payload contracts are incomplete');
  }
  const actionMatrix = registry.recoveryActionEvidenceMatrix ?? [];
  if (actionMatrix.length !== RECOVERY_ACTIONS.length ||
      new Set(actionMatrix.map((item) => item.action)).size !== RECOVERY_ACTIONS.length ||
      RECOVERY_ACTIONS.some((action) => !actionMatrix.some((item) => item.action === action)) ||
      actionMatrix.some((item) => !Array.isArray(item.required) || !Array.isArray(item.optional) ||
        !Array.isArray(item.forbidden) || typeof item.continuationRequired !== 'boolean' ||
        typeof item.completionEligible !== 'boolean')) {
    errors.push('action-specific recovery evidence matrix is incomplete');
  }
  if (!registry.checkpointContract.requiresSchedulerOwnedCurrentPointerConsumptionReceipt ||
      !registry.checkpointContract.bindsExactAggregateAndFailure ||
      !registry.checkpointContract.onceOnlyActivationRequired ||
      registry.checkpointContract.releasedLeaseReuseAllowed !== false) {
    errors.push('checkpoint/release single-use ownership contract is incomplete');
  }
  if (!registry.schedulerContinuationContract?.requiresSchedulerOwnedResumeReceipt ||
      !registry.schedulerContinuationContract?.requiresExactActionAndCheckpointAdmission ||
      !registry.schedulerContinuationContract?.requiresSixFreshLeases ||
      registry.schedulerContinuationContract?.genericContextOrDetachedResourceSubstitutionAllowed !== false) {
    errors.push('scheduler recovery-output consumption contract is incomplete');
  }
  if (semanticHash(bundle.blueprint.runtimeRecovery) !== semanticHash(registry)) {
    errors.push('canonical runtime recovery composition does not match universal Blueprint');
  }
  if (registry.retryPolicy.recursiveRetryAllowed !== false || registry.retryPolicy.callerMayResetBudget !== false ||
      registry.retryPolicy.callerMayBroadenAuthority !== false) errors.push('retry authority boundary is not fail-closed');
  if (!Number.isInteger(registry.retryPolicy.maximumWallTimeMs) ||
      !Number.isInteger(registry.retryPolicy.maximumTotalWallTimeMs) ||
      registry.retryPolicy.maximumTotalWallTimeMs < registry.retryPolicy.maximumWallTimeMs) {
    errors.push('retry wall-time budget is not exact and bounded');
  }
  if (registry.simulationContract.externalEffectsExecuted !== false || registry.simulationContract.realModelInvoked !== false ||
      registry.simulationContract.modelWeightsChanged !== false) errors.push('simulation contract crosses a held effect boundary');
}

const stateRefs = new Set(bundle.blueprint.stateDomains.map((item) => item.stateRef));
const processRefs = new Set(bundle.factory.processes.map((item) => item.processRef));
const moduleRefs = new Set(bundle.modules.modules.map((item) => item.moduleRef));
const testRefs = new Set(bundle.blueprint.tests.map((item) => item.testRef));
if (!stateRefs.has('state.runtime-recovery')) errors.push('state registry missing state.runtime-recovery');
for (const ref of registry?.processRefs ?? []) if (!processRefs.has(ref)) errors.push(`process registry missing ${ref}`);
for (const ref of registry?.moduleRefs ?? []) if (!moduleRefs.has(ref)) errors.push(`module registry missing ${ref}`);
for (const ref of registry?.testRefs ?? []) if (!testRefs.has(ref)) errors.push(`test registry missing ${ref}`);
if (!bundle.featureRegistry.features.some((item) => item.featureRef === 'feature.vexlife.runtime-failure-recovery')) {
  errors.push('feature registry missing feature.vexlife.runtime-failure-recovery');
}
if (!bundle.buildHealth.checks.some((item) => item.checkRef === 'check.runtime-recovery' && item.command === 'npm run recovery:check')) {
  errors.push('build health registry missing check.runtime-recovery');
}
if (!bundle.implementationPlan.workUnits.some((item) => item.workRef === 'work.vexlife.runtime-failure-recovery')) {
  errors.push('implementation plan missing work.vexlife.runtime-failure-recovery');
}
for (const requiredCheck of ['check.tests', 'check.manifest', 'check.browser-integration', 'check.runtime-recovery']) {
  if (!bundle.buildHealth.checks.some((item) => item.checkRef === requiredCheck && item.blocking === true)) {
    errors.push(`R24 full gate missing blocking ${requiredCheck}`);
  }
}
const packageJson = readJson(path.join(root, 'package.json'));
for (const command of ['recovery:check', 'recovery:simulate', 'recovery:status', 'pr-ready', 'health:check']) {
  if (!packageJson.scripts?.[command]) errors.push(`package scripts missing ${command}`);
}

try {
  const atlas = new Atlas(buildIdentityIndex(bundle));
  const traversal = atlas.query({
    startRefs: ['feature.vexlife.runtime-failure-recovery'],
    depthLimit: 2,
    resultLimit: 96,
    tokenBudget: 16000
  });
  for (const ref of [
    'feature.vexlife.runtime-failure-recovery',
    'state.runtime-recovery',
    'process.vexlife.runtime.recover-execute',
    'module.vexlife.core.runtime-recovery',
    'test.runtime-recovery.r24-full-gate'
  ]) {
    if (!traversal.results.some((item) => item.ref === ref)) errors.push(`bounded recovery Atlas traversal cannot resolve ${ref}`);
  }
} catch (error) {
  errors.push(`bounded recovery Atlas traversal failed: ${error.message}`);
}

let simulation = null;
try {
  simulation = runRecoverySimulation({ root, writeReceipt: true, receiptPath: registry.simulationContract.receiptPath });
  const repositoryGit = {
    candidateHeadSha: simulation.receipt.candidateHeadSha,
    checkoutSha: simulation.receipt.testedCheckoutSha,
    testedMergeSha: simulation.receipt.testedMergeSha,
    baseSha: simulation.receipt.baseSha
  };
  const validation = validateIntegratedRecoverySimulationReceipt(simulation.receipt, {
    runtimeRecoveryRegistry: registry,
    blueprintHash: blueprint.semanticHash,
    sourceTreeSha256: simulation.receipt.sourceTreeSha256,
    repositoryGit
  });
  errors.push(...validation.errors.map((item) => `simulation: ${item}`));
} catch (error) {
  errors.push(`integrated runtime recovery simulation failed: ${error.message}`);
}

const result = {
  schemaVersion: 'vexlife.runtime-recovery-check-result/v0',
  state: errors.length ? 'FAILED' : 'VALID',
  currentness: 'CURRENT',
  recoveryState: errors.length ? 'RUNTIME_RECOVERY_INVALID' : 'RUNTIME_RECOVERY_VALID',
  registryRef: registry?.registryRef ?? null,
  systemRef: registry?.systemRef ?? null,
  registeredFailureClasses: registry?.failureClasses?.length ?? 0,
  registeredActions: registry?.recoveryActions?.length ?? 0,
  registeredTests: registry?.testRefs?.length ?? 0,
  maximumAttemptCount: registry?.retryPolicy?.maximumAttemptCount ?? null,
  registryHash: registry ? semanticHash(registry) : null,
  blueprintHash: blueprint.semanticHash,
  simulationReceiptPath: simulation?.receiptPath ?? registry?.simulationContract?.receiptPath ?? null,
  simulationReceiptFingerprint: simulation?.receipt?.semanticFingerprint ?? null,
  simulationJourneyStates: simulation?.receipt?.journeyStates ?? [],
  errors
};
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;

// [VXG RealForever]
