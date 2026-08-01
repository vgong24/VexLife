#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { createResourceSnapshot, evaluateResourceAdmission } from '../src/core/resource-admission.mjs';
import {
  admitRecoveryCheckpoint,
  closeRecoveredExecution,
  createRecoveryAggregate,
  createRecoveryCheckpoint,
  executeWithRecoveryBoundary,
  projectRecoveryAggregate,
  recordExternalRecoveryEvent,
  recoverContextBudget,
  restoreRecoveryAggregate,
  serializeRecoveryAggregate
} from '../src/core/runtime-recovery.mjs';
import { validateFailureEnvelope } from '../src/core/runtime-failure.mjs';
import {
  createDeterministicFaultInjector,
  createNoEffectTransactionalAdapter,
  simulateTransactionalRecovery
} from '../src/core/recovery-fault-injector.mjs';
import { collectRepositoryEvidence } from '../src/core/repository-evidence.mjs';
import { buildSourceManifest } from '../src/core/source-manifest.mjs';
import { readJson, resolveSafeGeneratedReceiptPath, semanticHash, writeJson } from '../src/core/utils.mjs';
import { runSchedulerSimulation } from './scheduler-simulate.mjs';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORMED = '2026-08-01T00:00:00.000Z';
const FAILED_AT = '2026-08-01T00:00:01.000Z';
const RETRIED_AT = '2026-08-01T00:00:02.000Z';
const COMPLETED_AT = '2026-08-01T00:00:03.000Z';

function runtimeResource(sourceHash) {
  return createResourceSnapshot({
    snapshotRef: 'snapshot.runtime-recovery.resource.1',
    generation: 1,
    sourceRef: 'source.runtime-recovery.simulated-resource',
    sourceHash,
    formationRef: 'formation.runtime-recovery.simulated-resource',
    evidenceClass: 'SIMULATED_CURRENT',
    cpuLoadPct: 94,
    cpuConcurrencyLimit: 2,
    cpuActiveCount: 1,
    ramAvailableMb: 2048,
    ramReservedMb: 512,
    gpuAvailable: false,
    vramAvailableMb: 0,
    vramReservedMb: 0,
    modelResident: true,
    activeModelTurn: false,
    activeHeavyTool: false,
    interactiveWaitState: 'IDLE',
    backgroundWorkAdmission: 'ADMITTED',
    thermalPowerState: 'NOMINAL',
    currentness: 'CURRENT',
    formedAt: FORMED,
    observedAt: FAILED_AT,
    expiresAt: '2026-08-01T00:10:00.000Z'
  });
}

export function validateIntegratedRecoverySimulationReceipt(receipt, {
  runtimeRecoveryRegistry,
  blueprintHash,
  sourceTreeSha256,
  repositoryGit
}) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object') return { ok: false, state: 'INVALID', errors: ['runtime recovery simulation receipt missing'] };
  if (receipt.schemaVersion !== 'vexlife.runtime-recovery-simulation-receipt/v0') errors.push('runtime recovery receipt schema mismatch');
  if (receipt.contractRef !== runtimeRecoveryRegistry?.simulationContract?.contractRef) errors.push('runtime recovery contractRef mismatch');
  if (receipt.state !== 'PASS' || receipt.currentness !== 'CURRENT') errors.push('runtime recovery receipt is not current PASS');
  if (receipt.candidateHeadSha !== repositoryGit?.candidateHeadSha ||
      receipt.testedCheckoutSha !== repositoryGit?.checkoutSha ||
      receipt.testedMergeSha !== repositoryGit?.testedMergeSha ||
      receipt.baseSha !== repositoryGit?.baseSha) errors.push('runtime recovery repository identity is stale');
  if (receipt.sourceTreeSha256 !== sourceTreeSha256) errors.push('runtime recovery source tree is stale');
  if (receipt.blueprintHash !== blueprintHash) errors.push('runtime recovery Blueprint hash is stale');
  if (receipt.runtimeRecoveryRegistryHash !== semanticHash(runtimeRecoveryRegistry)) errors.push('runtime recovery registry hash is stale');
  if (JSON.stringify(receipt.journeyStates) !== JSON.stringify(runtimeRecoveryRegistry?.simulationContract?.requiredJourneyStates)) {
    errors.push('runtime recovery journey states do not match the source contract');
  }
  if (receipt.externalEffectsExecuted !== false || receipt.realModelInvoked !== false ||
      receipt.modelWeightsChanged !== false || receipt.selfCertifiedRuntimeEvidence !== false) {
    errors.push('runtime recovery simulation crossed a held effect or trust boundary');
  }
  const failureValidation = validateFailureEnvelope(receipt.canonicalFailure, { registry: runtimeRecoveryRegistry });
  errors.push(...failureValidation.errors.map((item) => `canonical failure: ${item}`));
  if (receipt.firstExecutorOutcome !== 'FAILED_RECOVERABLE' || receipt.finalExecutorOutcome !== 'SUCCEEDED') {
    errors.push('executor totality journey outcomes are not exact');
  }
  if (receipt.canonicalWorkNodeRef !== runtimeRecoveryRegistry?.simulationContract?.workNodeRef ||
      receipt.canonicalWorkNodeFinalState !== 'COMPLETED') errors.push('recovery simulation did not bind the canonical completed Workgraph node');
  for (const field of runtimeRecoveryRegistry?.simulationContract?.requiredSchedulerBindings ?? []) {
    if (!/^[a-f0-9]{64}$/.test(String(receipt.schedulerBindings?.[field] ?? ''))) errors.push(`runtime recovery scheduler binding missing ${field}`);
  }
  if (receipt.terminalReceipt?.schedulerCompletionFingerprint !== receipt.schedulerBindings?.completionFingerprint ||
      receipt.terminalReceipt?.schedulerCompletionEvidenceLineageFingerprint !== receipt.schedulerBindings?.completionEvidenceLineageFingerprint ||
      receipt.terminalReceipt?.schedulerWorkgraphTransitionFingerprint !== receipt.schedulerBindings?.workgraphTransitionFingerprint) {
    errors.push('terminal recovery receipt does not causally consume exact scheduler/Workgraph evidence');
  }
  if (receipt.replayProof?.duplicateChanged !== false || receipt.replayProof?.staleChanged !== false ||
      receipt.replayProof?.restoredAggregateFingerprint !== receipt.replayProof?.serializedAggregateFingerprint) {
    errors.push('restart/replay proof is incomplete');
  }
  if (receipt.transactionalProof?.rollbackState !== 'ROLLED_BACK' ||
      receipt.transactionalProof?.rollbackFailureState !== 'QUARANTINED') errors.push('transactional rollback/quarantine proof is incomplete');
  if (receipt.contextProof?.modelInvoked !== false || receipt.contextProof?.invisibleTruncation !== false ||
      receipt.contextProof?.sourceHistoryDeleted !== false) errors.push('context recovery crossed a held truncation or invocation boundary');
  const canonical = structuredClone(receipt);
  delete canonical.semanticFingerprint;
  if (semanticHash(canonical) !== receipt.semanticFingerprint) errors.push('runtime recovery receipt semanticFingerprint mismatch');
  return { ok: errors.length === 0, state: errors.length ? 'INVALID' : 'EXECUTED_CURRENT', errors };
}

export function runRecoverySimulation({
  root = DEFAULT_ROOT,
  writeReceipt = true,
  receiptPath = null
} = {}) {
  const bundle = loadBlueprint(root);
  const registry = bundle.blueprint.runtimeRecovery;
  const target = resolveSafeGeneratedReceiptPath(
    root,
    receiptPath ?? registry.simulationContract.receiptPath,
    'runtime recovery simulation receipt path'
  );
  const journeyStates = [];
  const scheduler = runSchedulerSimulation({ root, writeReceipt: false }).receipt;
  journeyStates.push('WORK_ADMITTED');
  const sourceStateFingerprint = semanticHash(registry);
  const aggregate = createRecoveryAggregate({
    aggregateRef: 'aggregate.runtime-recovery.simulation',
    workNodeRef: registry.simulationContract.workNodeRef,
    sourceStateFingerprint,
    schedulerGeneration: 1,
    retryBudget: registry.retryPolicy
  }, { registry });
  const checkpoint = createRecoveryCheckpoint({
    checkpointRef: 'checkpoint.runtime-recovery.simulation.1',
    workNodeRef: aggregate.workNodeRef,
    schedulerGeneration: 1,
    sourceStateFingerprint,
    schedulerCheckpointFingerprint: scheduler.checkpointFingerprint,
    selectedSourceRanges: [{ sourceRef: 'blueprint/runtime-recovery-registry.json', start: 0, end: 1 }],
    preservedIntentRef: 'intent.scheduler.simulation',
    preservedInterpretationRef: 'interpretation.runtime-recovery.simulation',
    preservedUnknownRefs: ['unknown.runtime-recovery.none'],
    preservedAuthorityRef: 'authority.runtime-recovery.no-effect-only',
    returnRouteRef: 'return-route.intent.verify-transition',
    leaseReleaseFingerprints: scheduler.leaseFingerprints.checkpointReleased,
    currentness: 'CURRENT',
    formedAt: FAILED_AT
  });
  const checkpointAdmission = admitRecoveryCheckpoint(checkpoint, aggregate, {
    nextSchedulerGeneration: 2,
    currentSourceStateFingerprint: sourceStateFingerprint
  });
  if (!checkpointAdmission.admitted) throw new Error(`simulation checkpoint was not admitted: ${checkpointAdmission.reasons.join(', ')}`);
  const executor = createDeterministicFaultInjector({
    failures: [{ attempt: 1, failureClass: 'MODEL_TIMEOUT_SIMULATED', message: 'deterministic model timeout' }],
    successValue: { state: 'PASS', partialEffectState: 'NONE', outputRef: 'output.runtime-recovery.simulation' }
  });
  journeyStates.push('DETERMINISTIC_EXECUTOR_THROWN');
  const failed = executeWithRecoveryBoundary({
    aggregate,
    executor,
    registry,
    checkpoint,
    context: {
      attemptRef: 'attempt.runtime-recovery.simulation.1',
      operationRef: 'operation.runtime-recovery.simulation',
      schedulerGeneration: 1,
      originRef: 'origin.runtime-recovery.simulation',
      expectedTransitionRef: 'expected-transition.intent.contract-current',
      evidenceRefs: ['evidence.scheduler.simulation.worker-leased'],
      startedAt: FORMED,
      observedAt: FAILED_AT
    }
  });
  journeyStates.push('CANONICAL_FAILURE_FORMED');
  journeyStates.push('CHECKPOINT_AND_SIX_LEASE_TRANSITION_BOUND');
  if (failed.status !== 'FAILED_RECOVERABLE' || !failed.policyDecision.retryAuthorized) {
    throw new Error('source-managed timeout retry was not admitted');
  }
  journeyStates.push('SOURCE_MANAGED_RETRY_ADMITTED');

  const contextProof = recoverContextBudget({
    workNodeRef: aggregate.workNodeRef,
    checkpointRef: checkpoint.checkpointRef,
    sourceSegments: [
      { sourceRef: 'message.runtime-recovery.1', start: 0, end: 100, tokenEstimate: 700, eligibleForCondensation: false },
      { sourceRef: 'message.runtime-recovery.older', start: 0, end: 400, tokenEstimate: 1200, eligibleForCondensation: true, candidateSummaryRef: 'summary.runtime-recovery.older', candidateTokenEstimate: 180 }
    ],
    intentRef: checkpoint.preservedIntentRef,
    interpretationRef: checkpoint.preservedInterpretationRef,
    unknownRefs: checkpoint.preservedUnknownRefs,
    authorityRef: checkpoint.preservedAuthorityRef,
    returnRouteRef: checkpoint.returnRouteRef,
    inputTokenEstimate: 1900,
    reservedOutputTokens: 400,
    hardTokenLimit: 1600
  });
  const resourceSnapshot = runtimeResource(sourceStateFingerprint);
  const resourceDenied = evaluateResourceAdmission(resourceSnapshot, { cpuSlots: 2, ramMb: 1800, modelTurn: true });
  const resourceReduced = evaluateResourceAdmission(resourceSnapshot, { cpuSlots: 1, ramMb: 512, modelTurn: true });
  if (contextProof.state !== 'CONTEXT_REACQUIRED' || resourceDenied.admitted || !resourceReduced.admitted) {
    throw new Error('context/resource reduction proof did not follow source admission');
  }
  journeyStates.push('CONTEXT_AND_RESOURCE_REDUCTION_PROVEN');
  const retriedAggregate = createRecoveryAggregate({
    ...structuredClone(failed.aggregate),
    semanticFingerprint: undefined,
    schedulerGeneration: 2,
    checkpointLineage: failed.aggregate.checkpointLineage,
    phase: 'RECOVERING'
  }, { registry });
  const succeeded = executeWithRecoveryBoundary({
    aggregate: retriedAggregate,
    executor,
    registry,
    context: {
      attemptRef: 'attempt.runtime-recovery.simulation.2',
      operationRef: 'operation.runtime-recovery.simulation',
      schedulerGeneration: 2,
      originRef: 'origin.runtime-recovery.simulation',
      expectedTransitionRef: 'expected-transition.intent.contract-current',
      evidenceRefs: [checkpoint.checkpointRef, resourceSnapshot.snapshotRef],
      startedAt: RETRIED_AT,
      observedAt: RETRIED_AT
    }
  });
  if (succeeded.status !== 'SUCCEEDED') throw new Error('fresh generation deterministic retry did not succeed');
  journeyStates.push('FRESH_GENERATION_RETRY_SUCCEEDED');

  const transaction = simulateTransactionalRecovery({
    adapter: createNoEffectTransactionalAdapter({
      initialState: { value: 'before' },
      attemptedState: { value: 'partial' }
    }),
    operationRef: 'operation.runtime-recovery.transaction.rollback',
    expectedBeforeFingerprint: semanticHash({ value: 'before' }),
    rollbackReceiptRef: 'receipt.runtime-recovery.rollback.1',
    lastKnownGoodRef: 'state.runtime-recovery.last-known-good.1',
    observedAt: RETRIED_AT
  });
  const quarantinedTransaction = simulateTransactionalRecovery({
    adapter: createNoEffectTransactionalAdapter({
      adapterRef: 'adapter.runtime-recovery.no-effect.quarantine',
      initialState: { value: 'before' },
      attemptedState: { value: 'partial' },
      rollbackFails: true,
      restoreFails: true
    }),
    operationRef: 'operation.runtime-recovery.transaction.quarantine',
    expectedBeforeFingerprint: semanticHash({ value: 'before' }),
    rollbackReceiptRef: 'receipt.runtime-recovery.rollback.2',
    lastKnownGoodRef: 'state.runtime-recovery.last-known-good.2',
    observedAt: RETRIED_AT
  });
  if (transaction.state !== 'ROLLED_BACK' || quarantinedTransaction.state !== 'QUARANTINED') {
    throw new Error('transactional rollback/quarantine simulation did not fail closed');
  }
  journeyStates.push('ROLLBACK_AND_LAST_KNOWN_GOOD_PROVEN');
  const serialized = serializeRecoveryAggregate(succeeded.aggregate);
  const restored = restoreRecoveryAggregate(serialized, { registry });
  const event = {
    eventRef: 'event.runtime-recovery.simulation.1',
    workNodeRef: restored.workNodeRef,
    schedulerGeneration: restored.schedulerGeneration,
    resultRef: 'result.runtime-recovery.simulation.1'
  };
  const accepted = recordExternalRecoveryEvent(restored, event, { registry });
  const duplicate = recordExternalRecoveryEvent(accepted.aggregate, event, { registry });
  const stale = recordExternalRecoveryEvent(accepted.aggregate, {
    ...event,
    eventRef: 'event.runtime-recovery.simulation.stale',
    schedulerGeneration: 1
  }, { registry });
  if (duplicate.changed || stale.changed) throw new Error('restart/replay event was not rejected once-only');
  journeyStates.push('RESTART_AND_REPLAY_REJECTED');

  const schedulerBindings = {
    checkpointFingerprint: scheduler.checkpointFingerprint,
    completionVerificationFingerprint: scheduler.completionVerificationFingerprint,
    completionEvidenceLineageFingerprint: scheduler.completionEvidenceLineageFingerprint,
    workgraphTransitionFingerprint: scheduler.workgraphTransitionFingerprint,
    completionFingerprint: scheduler.completionFingerprint
  };
  journeyStates.push('WORKGRAPH_COMPLETION_FINGERPRINT_BOUND');
  const closed = closeRecoveredExecution({
    aggregate: accepted.aggregate,
    successExecution: { ...succeeded, aggregate: accepted.aggregate },
    recoveryReceipt: failed.recoveryReceipt,
    schedulerEvidence: schedulerBindings,
    completedAt: COMPLETED_AT,
    registry
  });
  journeyStates.push('RECOVERY_TERMINAL_RECEIPT_FORMED');
  const projection = projectRecoveryAggregate(closed.aggregate).projection;
  const noOp = projectRecoveryAggregate(closed.aggregate, { priorProjection: projection });
  if (noOp.changed) throw new Error('unchanged recovery projection emitted another revision');
  journeyStates.push('QUEUE_TERRAIN_HEALTH_GUIDE_PROJECTED');

  const repository = collectRepositoryEvidence(root);
  const sourceManifest = buildSourceManifest(root);
  const blueprint = validateBlueprint(bundle);
  const receipt = {
    schemaVersion: 'vexlife.runtime-recovery-simulation-receipt/v0',
    receiptRef: `receipt.runtime-recovery.simulation.${sourceManifest.treeSha256.slice(0, 24)}`,
    contractRef: registry.simulationContract.contractRef,
    state: JSON.stringify(journeyStates) === JSON.stringify(registry.simulationContract.requiredJourneyStates) ? 'PASS' : 'FAILED',
    currentness: 'CURRENT',
    candidateHeadSha: repository.git.candidateHeadSha,
    testedCheckoutSha: repository.git.checkoutSha,
    testedMergeSha: repository.git.testedMergeSha,
    baseSha: repository.git.baseSha,
    sourceTreeSha256: sourceManifest.treeSha256,
    blueprintHash: blueprint.semanticHash,
    runtimeRecoveryRegistryHash: semanticHash(registry),
    journeyStates,
    canonicalFailure: failed.failure,
    firstExecutorOutcome: failed.status,
    finalExecutorOutcome: succeeded.status,
    checkpointAdmissionFingerprint: checkpointAdmission.semanticFingerprint,
    contextProof,
    resourceProof: {
      deniedFingerprint: resourceDenied.semanticFingerprint,
      reducedFingerprint: resourceReduced.semanticFingerprint,
      reducedBudgetAdmitted: resourceReduced.admitted
    },
    transactionalProof: {
      rollbackState: transaction.state,
      rollbackReceiptFingerprint: transaction.semanticFingerprint,
      rollbackFailureState: quarantinedTransaction.state,
      rollbackFailureReceiptFingerprint: quarantinedTransaction.semanticFingerprint
    },
    replayProof: {
      serializedAggregateFingerprint: succeeded.aggregate.semanticFingerprint,
      restoredAggregateFingerprint: restored.semanticFingerprint,
      acceptedEventFingerprint: accepted.aggregate.acceptedExternalEvents[0].semanticFingerprint,
      duplicateChanged: duplicate.changed,
      staleChanged: stale.changed
    },
    schedulerBindings,
    canonicalWorkNodeRef: registry.simulationContract.workNodeRef,
    canonicalWorkNodeFinalState: scheduler.workgraphConvergenceProof.finalNodeState,
    terminalReceipt: closed.terminalReceipt,
    finalAggregateFingerprint: closed.aggregate.semanticFingerprint,
    finalProjection: projection,
    semanticNoOpProven: noOp.reason === 'SEMANTIC_NO_OP',
    externalEffectsExecuted: false,
    realModelInvoked: false,
    modelWeightsChanged: false,
    selfCertifiedRuntimeEvidence: false,
    formedAt: COMPLETED_AT
  };
  receipt.semanticFingerprint = semanticHash(receipt);
  if (writeReceipt) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    writeJson(target, receipt);
  }
  return Object.freeze({
    receipt: Object.freeze(receipt),
    receiptPath: path.relative(root, target).split(path.sep).join('/'),
    aggregate: closed.aggregate,
    projection
  });
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const receiptIndex = args.indexOf('--receipt');
  if (args.some((item, index) => item !== '--receipt' && index !== receiptIndex + 1) ||
      (receiptIndex >= 0 && !args[receiptIndex + 1])) {
    console.error('Usage: npm run recovery:simulate -- [--receipt <safe-generated-path>]');
    process.exit(2);
  }
  const result = runRecoverySimulation({ receiptPath: receiptIndex >= 0 ? args[receiptIndex + 1] : null });
  console.log(JSON.stringify({
    state: result.receipt.state,
    currentness: result.receipt.currentness,
    receiptPath: result.receiptPath,
    candidateHeadSha: result.receipt.candidateHeadSha,
    sourceTreeSha256: result.receipt.sourceTreeSha256,
    blueprintHash: result.receipt.blueprintHash,
    journeyStates: result.receipt.journeyStates,
    firstExecutorOutcome: result.receipt.firstExecutorOutcome,
    finalExecutorOutcome: result.receipt.finalExecutorOutcome,
    externalEffectsExecuted: result.receipt.externalEffectsExecuted,
    semanticFingerprint: result.receipt.semanticFingerprint
  }, null, 2));
  if (result.receipt.state !== 'PASS') process.exitCode = 1;
}

// [VXG RealForever]
