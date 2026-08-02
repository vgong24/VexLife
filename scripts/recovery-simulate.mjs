#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { SingleWorkerIntentScheduler, WorkerLeaseAuthority } from '../src/core/intent-scheduler.mjs';
import { createIntentEnvelope, createIntentWorkgraph, createWorkNode } from '../src/core/intent-workgraph.mjs';
import { createResourceSnapshot } from '../src/core/resource-admission.mjs';
import { createSchedulerRuntimeTrustSnapshot } from '../src/core/scheduler-runtime-trust.mjs';
import {
  RECOVERY_COMPLETION_GATE_REFS,
  RECOVERY_EVENT_TYPES,
  admitRecoveryCheckpoint,
  applyRecoveryAction,
  buildRecoveryAggregateFingerprint,
  closeRecoveredExecution,
  continueRecoveryGeneration,
  createCycleBoundTransactionalRecoveryReceipt,
  createExternalRecoveryEventAdoptionReceipt,
  createRecoveryAggregate,
  createRecoveryCheckpoint,
  createRecoveryOperationCurrentnessReceipt,
  createSchedulerRecoveryClaimReceipt,
  createRecoveryContinuation,
  createRecoveryConvergenceReceipt,
  createHumanDecisionGate,
  createRecoveryResourceReceipt,
  createRecoveryWaitResumeReceipt,
  createSplitWorkRouteReceipt,
  executeWithRecoveryBoundary,
  projectRecoveryAggregate,
  recordExternalRecoveryEvent,
  recordRecoveryCheckpointAdmission,
  recordSchedulerRecoveryClaimLifecycle,
  recordRecoveryConvergence,
  recordRecoveryPolicyDecision,
  recoverContextBudget,
  restoreRecoveryAggregate,
  serializeRecoveryAggregate
} from '../src/core/runtime-recovery.mjs';
import {
  createDeterministicClassifiedExecutor,
  issueClassifierPlan,
  validateFailureEnvelope
} from '../src/core/runtime-failure.mjs';
import {
  createDeterministicFaultInjector,
  createNoEffectTransactionalAdapter,
  simulateTransactionalRecovery
} from '../src/core/recovery-fault-injector.mjs';
import { collectRepositoryEvidence } from '../src/core/repository-evidence.mjs';
import { buildSourceManifest } from '../src/core/source-manifest.mjs';
import { readJson, resolveSafeGeneratedReceiptPath, semanticHash, writeJson } from '../src/core/utils.mjs';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORMED = '2026-08-01T00:00:00.000Z';
const OBSERVED = '2026-08-01T00:00:01.000Z';
const FAILED_AT = '2026-08-01T00:00:02.000Z';
const RECOVERED_AT = '2026-08-01T00:00:04.000Z';
const SUCCEEDED_AT = '2026-08-01T00:00:05.000Z';
const COMPLETED_AT = '2026-08-01T00:00:06.000Z';
const CYCLE_TWO_STARTED_AT = '2026-08-01T00:00:07.000Z';
const CYCLE_TWO_FAILED_AT = '2026-08-01T00:00:08.000Z';
const CYCLE_TWO_ACTION_AT = '2026-08-01T00:00:09.000Z';
const EXPIRES_AT = '2026-08-01T00:01:00.000Z';

function containsNamedProperty(value, propertyName) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) =>
    key === propertyName || containsNamedProperty(child, propertyName)
  );
}

function countNamedProperties(value, propertyNames) {
  if (!value || typeof value !== 'object') return 0;
  const names = new Set(propertyNames);
  return Object.entries(value).reduce((count, [key, child]) =>
    count + (names.has(key) ? 1 : 0) + countNamedProperties(child, propertyNames), 0);
}

function rehashRecoveryAggregate(value) {
  const candidate = structuredClone(value);
  delete candidate.semanticFingerprint;
  candidate.semanticFingerprint = buildRecoveryAggregateFingerprint(candidate);
  return candidate;
}

function expectedActionSpecificCausalGateRefs(actionReceipt) {
  const roleNames = {
    context: 'context',
    resource: 'resource',
    transaction: 'rollback',
    lastKnownGood: 'last-known-good',
    quarantine: 'quarantine',
    humanGate: 'human-gate',
    externalWait: 'external-wait',
    externalResume: 'external-resume',
    splitRoute: 'split-route'
  };
  return [
    'completion-gate.runtime-recovery.failure',
    'completion-gate.runtime-recovery.policy',
    'completion-gate.runtime-recovery.scheduler-checkpoint',
    ...['worker', 'context', 'resource', 'capability', 'effect', 'occupancy']
      .map((kind) => `completion-gate.runtime-recovery.released-${kind}-lease`),
    'completion-gate.runtime-recovery.checkpoint-admission',
    'completion-gate.runtime-recovery.action',
    ...(actionReceipt?.evidence ?? []).map((item) => `completion-gate.runtime-recovery.${roleNames[item.role]}`),
    ...(actionReceipt?.continuationRequired ? [
      'completion-gate.runtime-recovery.scheduler-resume',
      'completion-gate.runtime-recovery.continuation',
      ...['worker', 'context', 'resource', 'capability', 'effect', 'occupancy']
        .map((kind) => `completion-gate.runtime-recovery.fresh-${kind}-lease`)
    ] : []),
    'completion-gate.runtime-recovery.success'
  ].sort();
}

function deadline(startedAt, budgetMs) {
  return new Date(Date.parse(startedAt) + budgetMs).toISOString();
}

function schedulerCurrentness(scheduler, checkpointRef, observedAt) {
  return {
    schedulerAggregate: scheduler.aggregate,
    schedulerClaimCurrentnessReceipt: scheduler.recoveryClaimCurrentness(checkpointRef, { observedAt })
  };
}

function runtimeResource(generation, sourceHash, { formedAt, observedAt, cpuLoadPct, ramAvailableMb }) {
  return createResourceSnapshot({
    snapshotRef: `resource-snapshot.runtime-recovery.${generation}`,
    generation,
    sourceRef: 'source.intent-scheduler.simulation-runtime',
    sourceHash,
    formationRef: `formation.runtime-recovery.resource.${generation}`,
    evidenceClass: 'SIMULATED_CURRENT',
    cpuLoadPct,
    cpuConcurrencyLimit: 4,
    cpuActiveCount: 0,
    ramAvailableMb,
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
    formedAt,
    observedAt,
    expiresAt: EXPIRES_AT
  });
}

function runtimeTrust(schedulerRegistry, resourceSnapshot, generation, { formedAt, observedAt }) {
  return createSchedulerRuntimeTrustSnapshot({
    snapshotRef: `runtime-snapshot.runtime-recovery.${generation}`,
    sourceRef: resourceSnapshot.sourceRef,
    sourceHash: resourceSnapshot.sourceHash,
    formationRef: `formation.runtime-recovery.runtime.${generation}`,
    evidenceClass: 'SIMULATED_CURRENT',
    schedulerGeneration: generation,
    formedAt,
    observedAt,
    expiresAt: EXPIRES_AT,
    workerRef: 'worker.model.mock.primary',
    actorRef: 'person.vexlife.owner',
    roleRef: 'role.vex.operations',
    claimRef: 'claim.runtime-recovery.simulation',
    occupancyRef: `occupancy.runtime-recovery.${generation}`,
    leaseAuthorityRef: 'authority.intent-scheduler.simulation-runtime',
    resourceSnapshotRef: resourceSnapshot.snapshotRef,
    resourceSnapshotFingerprint: resourceSnapshot.semanticFingerprint,
    currentness: 'CURRENT'
  }, { schedulerRegistry, resourceSnapshot });
}

function schedulerOptions({ bundle, graph, node, trustSnapshot, resourceSnapshot, runtimeTrustSnapshot, generation, formedAt, observedAt }) {
  const runtimeFields = {
    runtimeSnapshotRef: runtimeTrustSnapshot.snapshotRef,
    runtimeSnapshotFingerprint: runtimeTrustSnapshot.semanticFingerprint,
    schedulerGeneration: generation,
    sourceRef: runtimeTrustSnapshot.sourceRef,
    sourceHash: runtimeTrustSnapshot.sourceHash,
    authorityRef: runtimeTrustSnapshot.leaseAuthorityRef,
    formedAt,
    observedAt,
    expiresAt: EXPIRES_AT,
    currentness: 'CURRENT',
    lifecycle: 'ACTIVE'
  };
  return {
    intentRegistry: bundle.intentRegistry,
    schedulerRegistry: bundle.schedulerRegistry,
    registeredProcessRefs: bundle.factory.processes.map((item) => item.processRef),
    registeredRoleRefs: bundle.blueprint.roles.map((item) => item.roleRef),
    trustSnapshot,
    runtimeTrustSnapshot,
    resourceSnapshot,
    resourceRequestByNodeRef: {
      [node.workNodeRef]: { cpuSlots: 1, ramMb: 256, vramMb: 0, modelTurn: true, heavyTool: false, background: false }
    },
    occupancyByNodeRef: {
      [node.workNodeRef]: {
        occupancyRef: runtimeTrustSnapshot.occupancyRef,
        actorRef: runtimeTrustSnapshot.actorRef,
        roleRef: node.roleRef,
        workNodeRef: node.workNodeRef,
        graphFingerprint: graph.semanticFingerprint,
        claimRef: runtimeTrustSnapshot.claimRef,
        formationRef: `formation.runtime-recovery.occupancy.${generation}`,
        ...runtimeFields
      }
    },
    capabilityLeaseByNodeRef: {
      [node.workNodeRef]: {
        leaseRef: `capability-lease.runtime-recovery.${generation}`,
        workNodeRef: node.workNodeRef,
        graphFingerprint: graph.semanticFingerprint,
        trustSnapshotFingerprint: trustSnapshot.semanticFingerprint,
        envelopeRef: node.capabilityEnvelopeRef,
        formationRef: `formation.runtime-recovery.capability.${generation}`,
        toolRefs: ['tool.mock.inspect'],
        ...runtimeFields
      }
    },
    effectLeaseByNodeRef: {
      [node.workNodeRef]: {
        leaseRef: `effect-lease.runtime-recovery.${generation}`,
        workNodeRef: node.workNodeRef,
        graphFingerprint: graph.semanticFingerprint,
        trustSnapshotFingerprint: trustSnapshot.semanticFingerprint,
        envelopeRef: node.effectEnvelopeRef,
        formationRef: `formation.runtime-recovery.effect.${generation}`,
        effectDisposition: 'EFFECT_ENVELOPE_BOUND',
        allowedEffectRefs: ['effect.mock.read'],
        ...runtimeFields
      }
    },
    resourceLeaseRefByNodeRef: { [node.workNodeRef]: `resource-lease.runtime-recovery.${generation}` },
    schedulerGeneration: generation,
    formedAt,
    observedAt,
    expiresAt: EXPIRES_AT
  };
}

function contextInput(generation, { formedAt, observedAt }) {
  return {
    leaseRef: `context-lease.runtime-recovery.${generation}`,
    cancellationTokenRef: `cancellation-token.runtime-recovery.${generation}`,
    foundationKernelRef: 'foundation-kernel.compact',
    roleFrameRef: 'role-frame.operations',
    intentFrameRef: 'intent-frame.runtime-recovery.simulation',
    selectedAtlasRefs: ['registry.vexlife.runtime-recovery.001', 'module.vexlife.core.runtime-recovery'],
    selectedSourceRefs: ['blueprint/runtime-recovery-registry.json'],
    applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs: [],
    applicableReleaseRefs: [],
    inputTokenEstimate: 256,
    reservedOutputTokens: 256,
    hardTokenLimit: 1024,
    formedAt,
    observedAt,
    expiresAt: EXPIRES_AT,
    checkpointReturnRef: 'return-route.intent.verify-transition'
  };
}

function contextInputFromRecovery(generation, receipt, { formedAt, observedAt, suffix = generation } = {}) {
  return {
    ...contextInput(generation, { formedAt, observedAt }),
    leaseRef: `context-lease.runtime-recovery.${suffix}`,
    cancellationTokenRef: `cancellation-token.runtime-recovery.${suffix}`,
    intentFrameRef: receipt.preservedIntentRef,
    selectedSourceRefs: [...new Set(receipt.immutableSourceCoverage.map((item) => item.sourceRef))].sort(),
    inputTokenEstimate: receipt.candidateInputTokenEstimate,
    reservedOutputTokens: receipt.reservedOutputTokens,
    hardTokenLimit: receipt.hardTokenLimit,
    checkpointReturnRef: receipt.returnRouteRef,
    contextRecoveryReceiptRef: receipt.contextRecoveryReceiptRef,
    contextRecoveryReceiptFingerprint: receipt.semanticFingerprint,
    immutableSourceCoverage: receipt.immutableSourceCoverage,
    deterministicSummaryBindings: receipt.deterministicSummaryBindings,
    preservedIntentRef: receipt.preservedIntentRef,
    preservedInterpretationRef: receipt.preservedInterpretationRef,
    preservedUnknownRefs: receipt.preservedUnknownRefs,
    preservedAuthorityRef: receipt.preservedAuthorityRef
  };
}

function createRecoveryGraph(bundle, registry, trustSnapshot) {
  const intent = createIntentEnvelope({
    intentRef: 'intent.runtime-recovery.simulation',
    originMessageRef: 'message.runtime-recovery.simulation',
    originSpeakerRef: 'person.vexlife.owner',
    recipientRoleRef: 'role.vex.operations',
    projectRef: 'project.vexlife',
    threadRef: 'thread.runtime-recovery.simulation',
    channelRef: 'channel.runtime-recovery.simulation',
    originalContentHash: semanticHash('runtime-recovery-simulation'),
    desiredOutcome: { intentKey: 'VALIDATE_WORKGRAPH', summary: 'Execute one causally bound runtime recovery work node' },
    constraints: ['deterministic-no-effect', 'source-managed-recovery'],
    createdAt: FORMED,
    sourceLineageRef: 'lineage.runtime-recovery.simulation'
  }, bundle.intentRegistry);
  const node = createWorkNode({
    workNodeRef: registry.simulationContract.workNodeRef,
    rootIntentRef: intent.intentRef,
    parentWorkNodeRef: null,
    purpose: 'Execute one causally bound runtime failure and recovery lifecycle',
    processRef: 'process.vexlife.intent.validate-workgraph',
    state: 'READY',
    dependencyRefs: [],
    childRefs: [],
    roleRef: 'role.vex.operations',
    priorityClass: 'NORMAL',
    applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs: [],
    applicableBurdenReleaseRefs: [],
    capabilityEnvelopeRef: 'capability-envelope.intent.contract-validation',
    effectEnvelopeRef: 'effect-envelope.intent.source-managed.bounded',
    resourceEnvelopeRef: 'resource-envelope.intent.deterministic-local-light',
    expectedTransitionRef: 'expected-transition.intent.contract-current',
    completionGateRefs: RECOVERY_COMPLETION_GATE_REFS,
    returnRouteRef: 'return-route.intent.verify-transition',
    sourceRefs: ['blueprint/runtime-recovery-registry.json'],
    createdAt: FORMED
  }, bundle.intentRegistry);
  let priorState = 'CAPTURED';
  const transitions = ['DECOMPOSED', 'PLAN_VALIDATED', 'READY'].map((nextState, sequence) => {
    const transition = {
      transitionRef: `transition.runtime-recovery.simulation.${sequence}`,
      workNodeRef: node.workNodeRef,
      sequence,
      priorState,
      nextState,
      reason: 'source-managed recovery simulation formation',
      actorRef: 'person.vexlife.owner',
      actorRoleRef: 'role.vex.operations',
      processRef: 'process.vexlife.intent.verify-transition',
      sourceRefs: ['blueprint/runtime-recovery-registry.json'],
      createdAt: `2026-08-01T00:00:0${sequence}.000Z`
    };
    priorState = nextState;
    return transition;
  });
  const bindingRefs = Object.fromEntries(bundle.intentRegistry.bindingFields.map((field) => [
    field,
    [...new Set(Array.isArray(node[field]) ? node[field] : [node[field]].filter(Boolean))].sort()
  ]));
  const graph = createIntentWorkgraph({
    graphRef: 'intent-workgraph.runtime-recovery.simulation',
    intent,
    nodes: [node],
    transitions,
    receipts: [],
    bindingRefs,
    createdAt: FORMED
  }, bundle.intentRegistry);
  return { intent, node, graph, trustSnapshot };
}

function boundaryContext(owner, attemptRef, schedulerGeneration, startedAt, completedAt) {
  return {
    attemptRef,
    operationRef: 'operation.runtime-recovery.simulation',
    schedulerGeneration,
    originRef: 'origin.runtime-recovery.simulation',
    expectedTransitionRef: 'expected-transition.intent.contract-current',
    evidenceRefs: ['evidence.runtime-recovery.scheduler-leased'],
    startedAt,
    observedAt: completedAt,
    completedAt,
    deadlineAt: deadline(startedAt, owner.retryBudget.maximumWallTimeMs)
  };
}

function contextReceipt(owner, admission, failure, formedAt, observedAt, currentness, registry) {
  return recoverContextBudget({
    aggregate: owner,
    workNodeRef: owner.workNodeRef,
    sourceStateFingerprint: owner.sourceStateFingerprint,
    failureFingerprint: failure.semanticFingerprint,
    checkpointAdmission: admission,
    sourceSegments: [
      { sourceRef: 'message.runtime-recovery.current', start: 0, end: 100, tokenEstimate: 700, eligibleForCondensation: false },
      { sourceRef: 'message.runtime-recovery.history', start: 0, end: 400, tokenEstimate: 1200, eligibleForCondensation: true, candidateSummaryRef: 'summary.runtime-recovery.history', candidateTokenEstimate: 180 }
    ],
    intentRef: 'intent.runtime-recovery.simulation',
    interpretationRef: 'interpretation.runtime-recovery.simulation',
    unknownRefs: ['unknown.runtime-recovery.none'],
    authorityRef: 'authority.runtime-recovery.no-effect-only',
    returnRouteRef: 'return-route.intent.verify-transition',
    inputTokenEstimate: 1900,
    reservedOutputTokens: 400,
    hardTokenLimit: 1600,
    formedAt,
    observedAt,
    schedulerCurrentness: currentness,
    registry
  });
}

function completionEvidence(node, graph, runtimeTwo, scheduler, convergence) {
  const evidenceByGate = new Map([
    ['completion-gate.intent.contract-valid', {
      completionGateRef: 'completion-gate.intent.contract-valid',
      sourceObservationRef: convergence.convergenceReceiptRef,
      sourceObservationHash: convergence.semanticFingerprint
    }]
  ]);
  return {
    verificationReceiptRef: 'verification.runtime-recovery.completion.2',
    workNodeRef: node.workNodeRef,
    nodeFingerprint: node.semanticFingerprint,
    graphRef: graph.graphRef,
    graphFingerprint: graph.semanticFingerprint,
    runtimeSnapshotFingerprint: runtimeTwo.semanticFingerprint,
    schedulerInstanceRef: scheduler.schedulerInstanceRef,
    schedulerGeneration: 2,
    expectedTransitionRef: node.expectedTransitionRef,
    gateObservations: node.completionGateRefs.map((completionGateRef) => {
      const binding = evidenceByGate.get(completionGateRef);
      if (!binding) throw new Error(`missing recovery completion evidence for ${completionGateRef}`);
      return {
        gateResultRef: `gate-result.runtime-recovery.${completionGateRef}.2`,
        completionGateRef,
        sourceObservationRef: binding.sourceObservationRef,
        sourceObservationHash: binding.sourceObservationHash,
        observedBeforeState: node.state,
        observedAfterState: 'COMPLETED',
        result: 'PASSED'
      };
    }),
    observedBeforeState: node.state,
    observedAfterState: 'COMPLETED',
    returnRouteRef: node.returnRouteRef,
    formedAt: RECOVERED_AT,
    observedAt: COMPLETED_AT,
    expiresAt: EXPIRES_AT,
    selfCertified: false
  };
}

function runRepresentativeActionBranch({
  name,
  failureClass,
  mode,
  bundle,
  registry,
  graph,
  node,
  trustSnapshot,
  sourceStateFingerprint
}) {
  const resourceOne = runtimeResource(1, sourceStateFingerprint, {
    formedAt: FORMED,
    observedAt: OBSERVED,
    cpuLoadPct: 10,
    ramAvailableMb: 8192
  });
  const runtimeOne = runtimeTrust(bundle.schedulerRegistry, resourceOne, 1, { formedAt: FORMED, observedAt: OBSERVED });
  const optionsOne = schedulerOptions({
    bundle, graph, node, trustSnapshot, resourceSnapshot: resourceOne, runtimeTrustSnapshot: runtimeOne,
    generation: 1, formedAt: FORMED, observedAt: OBSERVED
  });
  const scheduler = new SingleWorkerIntentScheduler({
    workerRef: runtimeOne.workerRef,
    schedulerInstanceRef: `instance.intent-scheduler.runtime-recovery.${name}`,
    schedulerRegistry: bundle.schedulerRegistry,
    runtimeRecoveryRegistry: registry,
    runtimeAuthority: new WorkerLeaseAuthority({ sourceRef: runtimeOne.sourceRef })
  });
  const queue = scheduler.admit(graph, optionsOne);
  const running = scheduler.leaseSelected({
    ...contextInput(1, { formedAt: FORMED, observedAt: OBSERVED }),
    leaseRef: `context-lease.runtime-recovery.${name}.1`,
    cancellationTokenRef: `cancellation-token.runtime-recovery.${name}.1`
  });
  if (queue.state !== 'ADMITTED' || !running.admitted) throw new Error(`${name} representative scheduler branch was not admitted`);
  let owner = createRecoveryAggregate({
    aggregateRef: `aggregate.runtime-recovery.representative.${name}`,
    workNodeRef: node.workNodeRef,
    sourceStateFingerprint,
    schedulerGeneration: 1,
    retryBudget: registry.retryPolicy
  }, { registry });
  const executor = createDeterministicFaultInjector({
    registry,
    planRef: `classifier-plan.runtime-recovery.representative.${name}`,
    failures: [{ attempt: 1, failureClass, message: `${name} deterministic failure` }],
    successValue: { state: 'PASS', partialEffectState: 'NONE', branchRef: name }
  });
  const failed = executeWithRecoveryBoundary({
    aggregate: owner,
    executor,
    registry,
    context: boundaryContext(owner, `attempt.runtime-recovery.${name}.1`, 1, OBSERVED, FAILED_AT)
  });
  owner = failed.aggregate;
  const sourceBindings = [{ sourceRef: 'blueprint/runtime-recovery-registry.json', sourceHash: sourceStateFingerprint }];
  const checkpointed = scheduler.checkpoint({
    checkpointRef: `checkpoint.runtime-recovery.scheduler.${name}.1`,
    workNodeRef: node.workNodeRef,
    lastCompletedStep: `typed-${name}-failure-formed`,
    selectedSourceRefs: ['blueprint/runtime-recovery-registry.json'],
    selectedContextRefs: [running.contextLease.leaseRef],
    producedArtifactRefs: [],
    producedReceiptRefs: [queue.admissionReceipt.admissionReceiptRef],
    openQuestions: [],
    nextSafeAction: 'FOLLOW_EXACT_RECOVERY_MATRIX',
    pendingToolCallRef: 'NONE',
    sourceBindings,
    formedAt: FAILED_AT
  }, { releaseReceiptRef: `release.runtime-recovery.checkpoint.${name}.1`, releasedAt: FAILED_AT });
  const recoveryClaimReceipt = createSchedulerRecoveryClaimReceipt({
    aggregate: owner,
    schedulerAggregate: scheduler.aggregate,
    schedulerCheckpoint: checkpointed.checkpoint,
    formedAt: FAILED_AT,
    registry
  });
  const consumption = scheduler.claimRecoveryCheckpoint(checkpointed.checkpoint.checkpointRef, {
    recoveryClaimReceipt,
    observedAt: FAILED_AT
  });
  const claimedCurrentness = scheduler.recoveryClaimCurrentness(checkpointed.checkpoint.checkpointRef, {
    observedAt: FAILED_AT
  });
  const checkpoint = createRecoveryCheckpoint({
    schedulerCheckpoint: checkpointed.checkpoint,
    schedulerConsumptionReceipt: consumption,
    aggregateRef: owner.aggregateRef,
    failureRef: failed.failure.failureRef,
    failureFingerprint: failed.failure.semanticFingerprint,
    sourceStateFingerprint,
    selectedSourceRanges: [{ sourceRef: 'blueprint/runtime-recovery-registry.json', start: 0, end: 1 }],
    preservedIntentRef: 'intent.runtime-recovery.simulation',
    preservedInterpretationRef: `interpretation.runtime-recovery.${name}`,
    preservedUnknownRefs: ['unknown.runtime-recovery.none'],
    preservedAuthorityRef: 'authority.runtime-recovery.no-effect-only',
    returnRouteRef: node.returnRouteRef,
    formedAt: FAILED_AT
  });
  const admission = admitRecoveryCheckpoint(checkpoint, owner, {
    schedulerCheckpoint: checkpointed.checkpoint,
    schedulerConsumptionReceipt: consumption,
    nextSchedulerGeneration: 2,
    currentSourceStateFingerprint: sourceStateFingerprint,
    observedAt: FAILED_AT,
    registry
  });
  owner = recordRecoveryCheckpointAdmission(owner, checkpoint, admission, {
    schedulerConsumptionReceipt: consumption,
    registry
  });
  owner = recordSchedulerRecoveryClaimLifecycle(owner, {
    schedulerAggregate: scheduler.aggregate,
    schedulerClaimCurrentnessReceipt: claimedCurrentness,
    registry
  });
  const claimedSchedulerCurrentness = schedulerCurrentness(
    scheduler,
    checkpointed.checkpoint.checkpointRef,
    RECOVERED_AT
  );
  const claimedSchedulerCurrentnessAtFailure = {
    schedulerAggregate: scheduler.aggregate,
    schedulerClaimCurrentnessReceipt: claimedCurrentness
  };
  const resourceTwo = runtimeResource(2, sourceStateFingerprint, {
    formedAt: FAILED_AT,
    observedAt: RECOVERED_AT,
    cpuLoadPct: 94,
    ramAvailableMb: 2048
  });
  let contextProof = null;
  let resourceProof = null;
  if (['context', 'split'].includes(mode)) {
    contextProof = mode === 'context'
      ? contextReceipt(
        owner,
        admission,
        failed.failure,
        FAILED_AT,
        RECOVERED_AT,
        claimedSchedulerCurrentness,
        registry
      )
      : recoverContextBudget({
        aggregate: owner,
        workNodeRef: owner.workNodeRef,
        sourceStateFingerprint,
        failureFingerprint: failed.failure.semanticFingerprint,
        checkpointAdmission: admission,
        sourceSegments: [{
          sourceRef: 'message.runtime-recovery.oversize', start: 0, end: 1000,
          tokenEstimate: 1900, eligibleForCondensation: false
        }],
        intentRef: 'intent.runtime-recovery.simulation',
        interpretationRef: `interpretation.runtime-recovery.${name}`,
        unknownRefs: ['unknown.runtime-recovery.none'],
        authorityRef: 'authority.runtime-recovery.no-effect-only',
        returnRouteRef: node.returnRouteRef,
        inputTokenEstimate: 1900,
        reservedOutputTokens: 400,
        hardTokenLimit: 1600,
        splitWorkNodeRef: `work.runtime-recovery.split-child.${name}`,
        formedAt: FAILED_AT,
        observedAt: RECOVERED_AT,
        schedulerCurrentness: claimedSchedulerCurrentness,
        registry
      });
  }
  if (mode === 'resource') {
    resourceProof = createRecoveryResourceReceipt({
      aggregate: owner,
      workNodeRef: owner.workNodeRef,
      sourceStateFingerprint,
      failureFingerprint: failed.failure.semanticFingerprint,
      checkpointAdmission: admission,
      resourceSnapshot: resourceTwo,
      deniedRequest: { cpuSlots: 4, ramMb: 1800, modelTurn: true },
      reducedRequest: { cpuSlots: 1, ramMb: 512, modelTurn: true },
      observedAt: RECOVERED_AT,
      schedulerCurrentness: claimedSchedulerCurrentness,
      registry
    });
  }
  const decided = recordRecoveryPolicyDecision(owner, {
    checkpointAdmission: admission,
    contextAdmissionReceipt: contextProof,
    resourceAdmissionReceipt: resourceProof,
    observedAt: RECOVERED_AT,
    schedulerCurrentness: claimedSchedulerCurrentness,
    registry
  });
  owner = decided.aggregate;
  let transaction = null;
  if (['transaction', 'restore'].includes(mode)) {
    const sourceTransaction = simulateTransactionalRecovery({
      adapter: createNoEffectTransactionalAdapter({
        initialState: { branch: name, state: 'before' },
        attemptedState: { branch: name, state: 'partial' },
        rollbackFails: mode === 'restore'
      }),
      operationRef: failed.failure.operationRef,
      expectedBeforeFingerprint: semanticHash({ branch: name, state: 'before' }),
      rollbackReceiptRef: `receipt.runtime-recovery.rollback.${name}`,
      lastKnownGoodRef: `state.runtime-recovery.last-known-good.${name}`,
      observedAt: RECOVERED_AT
    });
    transaction = createCycleBoundTransactionalRecoveryReceipt({
      aggregate: owner,
      transactionalRecoveryReceipt: sourceTransaction,
      recoveryClaimReceipt,
      checkpointAdmission: admission,
      observedAt: RECOVERED_AT,
      schedulerCurrentness: claimedSchedulerCurrentness,
      registry
    });
  }
  const gate = mode === 'human'
    ? createHumanDecisionGate({
      aggregate: owner,
      policyDecision: decided.policyDecision,
      observedAt: RECOVERED_AT,
      schedulerCurrentness: claimedSchedulerCurrentness,
      registry
    })
    : null;
  const wait = mode === 'wait'
    ? createRecoveryWaitResumeReceipt({
      aggregate: owner,
      policyDecision: decided.policyDecision,
      waitedAt: FAILED_AT,
      resumedAt: RECOVERED_AT,
      resumeSourceRef: `source.runtime-recovery.wait.${name}`,
      schedulerCurrentness: claimedSchedulerCurrentnessAtFailure,
      registry
    })
    : null;
  const split = mode === 'split'
    ? createSplitWorkRouteReceipt({
      aggregate: owner,
      policyDecision: decided.policyDecision,
      contextRecoveryReceipt: contextProof,
      childWorkNodeRef: contextProof.splitWorkNodeRef,
      observedAt: RECOVERED_AT,
      schedulerCurrentness: claimedSchedulerCurrentness,
      registry
    })
    : null;
  const action = applyRecoveryAction({
    aggregate: owner,
    policyDecision: decided.policyDecision,
    checkpointAdmission: admission,
    contextRecoveryReceipt: contextProof,
    resourceRecoveryReceipt: resourceProof,
    transactionalRecoveryReceipt: transaction,
    humanDecisionGate: gate,
    waitResumeReceipt: wait,
    splitWorkRouteReceipt: split,
    observedAt: RECOVERED_AT,
    schedulerCurrentness: claimedSchedulerCurrentness,
    registry
  });
  owner = action.aggregate;
  const continuable = action.actionReceipt.continuationRequired;
  let continuation = null;
  let succeeded = null;
  let convergence = null;
  let resumed = null;
  let schedulerAggregateAfterResume = null;
  let resumedSchedulerCurrentness = null;
  if (continuable) {
    const runtimeTwo = runtimeTrust(bundle.schedulerRegistry, resourceTwo, 2, {
      formedAt: FAILED_AT,
      observedAt: RECOVERED_AT
    });
    const optionsTwo = schedulerOptions({
      bundle, graph, node, trustSnapshot, resourceSnapshot: resourceTwo, runtimeTrustSnapshot: runtimeTwo,
      generation: 2, formedAt: FAILED_AT, observedAt: RECOVERED_AT
    });
    if (resourceProof) optionsTwo.resourceRequestByNodeRef[node.workNodeRef] = resourceProof.reducedRequest;
    const nextContext = contextProof
      ? contextInputFromRecovery(2, contextProof, { formedAt: FAILED_AT, observedAt: RECOVERED_AT, suffix: `${name}.2` })
      : {
        ...contextInput(2, { formedAt: FAILED_AT, observedAt: RECOVERED_AT }),
        leaseRef: `context-lease.runtime-recovery.${name}.2`,
        cancellationTokenRef: `cancellation-token.runtime-recovery.${name}.2`
      };
    resumed = scheduler.resume(checkpointed.checkpoint.checkpointRef, {
      graph,
      options: optionsTwo,
      sourceBindings,
      contextInput: nextContext,
      recovery: {
        checkpointConsumptionReceipt: consumption,
        checkpointAdmission: admission,
        actionReceipt: action.actionReceipt,
        contextRecoveryReceipt: contextProof,
        resourceRecoveryReceipt: resourceProof
      }
    });
    schedulerAggregateAfterResume = structuredClone(scheduler.aggregate);
    const resumedCurrentness = scheduler.recoveryClaimCurrentness(checkpointed.checkpoint.checkpointRef, {
      observedAt: RECOVERED_AT
    });
    owner = recordSchedulerRecoveryClaimLifecycle(owner, {
      schedulerAggregate: schedulerAggregateAfterResume,
      schedulerClaimCurrentnessReceipt: resumedCurrentness,
      registry
    });
    resumedSchedulerCurrentness = {
      schedulerAggregate: schedulerAggregateAfterResume,
      schedulerClaimCurrentnessReceipt: resumedCurrentness
    };
    continuation = createRecoveryContinuation({
      aggregate: owner,
      checkpointAdmission: admission,
      resumed,
      schedulerAggregate: schedulerAggregateAfterResume,
      schedulerInstanceRef: scheduler.schedulerInstanceRef,
      observedAt: RECOVERED_AT,
      schedulerCurrentness: resumedSchedulerCurrentness,
      registry
    });
    owner = continueRecoveryGeneration(owner, continuation, {
      schedulerCurrentness: resumedSchedulerCurrentness,
      registry
    });
    succeeded = executeWithRecoveryBoundary({
      aggregate: owner,
      executor,
      schedulerCurrentness: resumedSchedulerCurrentness,
      registry,
      context: boundaryContext(owner, `attempt.runtime-recovery.${name}.2`, 2, RECOVERED_AT, SUCCEEDED_AT)
    });
    owner = succeeded.aggregate;
    convergence = createRecoveryConvergenceReceipt(owner, {
      formedAt: SUCCEEDED_AT,
      schedulerCurrentness: resumedSchedulerCurrentness,
      registry
    });
    owner = recordRecoveryConvergence(owner, convergence, {
      schedulerCurrentness: resumedSchedulerCurrentness,
      registry
    });
  }
  return Object.freeze({
    name,
    action: decided.policyDecision.action,
    expectedAction: action.actionReceipt.action,
    disposition: action.actionReceipt.disposition,
    continuationRequired: action.actionReceipt.continuationRequired,
    completionEligible: action.actionReceipt.completionEligible,
    evidenceRoles: action.actionReceipt.evidence.map((item) => item.role),
    continuationFingerprint: continuation?.semanticFingerprint ?? null,
    schedulerResumeFingerprint: continuation?.schedulerResumeReceiptFingerprint ?? null,
    convergenceFingerprint: convergence?.semanticFingerprint ?? null,
    finalPhase: owner.phase,
    aggregate: owner,
    actionReceipt: action.actionReceipt,
    checkpoint,
    admission,
    consumption,
    contextProof,
    resourceProof,
    transaction,
    humanGate: gate,
    waitResumeReceipt: wait,
    splitWorkRouteReceipt: split,
    succeeded,
    resumed,
    schedulerAggregateAfterResume,
    claimedSchedulerCurrentness,
    resumedSchedulerCurrentness,
    checkpointAdmission: admission,
    continuation
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
  if (receipt.schemaVersion !== 'vexlife.runtime-recovery-simulation-receipt/v1') errors.push('runtime recovery receipt schema mismatch');
  if (receipt.contractRef !== runtimeRecoveryRegistry?.simulationContract?.contractRef) errors.push('runtime recovery contractRef mismatch');
  if (receipt.state !== 'PASS' || receipt.currentness !== 'CURRENT') errors.push('runtime recovery receipt is not current PASS');
  if (receipt.candidateHeadSha !== repositoryGit?.candidateHeadSha || receipt.testedCheckoutSha !== repositoryGit?.checkoutSha ||
      receipt.testedMergeSha !== repositoryGit?.testedMergeSha || receipt.baseSha !== repositoryGit?.baseSha) {
    errors.push('runtime recovery repository identity is stale');
  }
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
  if (receipt.boundaryTotalityAndSourcePolicyProof?.preAdmissionTyped !== true ||
      receipt.boundaryTotalityAndSourcePolicyProof?.resolvedThenableRejectedTyped !== true ||
      receipt.boundaryTotalityAndSourcePolicyProof?.rejectedThenableRejectedTyped !== true ||
      receipt.boundaryTotalityAndSourcePolicyProof?.rejectedThenableConsumed !== true ||
      !runtimeRecoveryRegistry.classifierContract.sources.some((source) =>
        source.sourceRef === receipt.boundaryTotalityAndSourcePolicyProof?.classifierSourceRef &&
        source.adapterRef === receipt.boundaryTotalityAndSourcePolicyProof?.classifierAdapterRef) ||
      !receipt.boundaryTotalityAndSourcePolicyProof?.classifierPlanRef ||
      !receipt.boundaryTotalityAndSourcePolicyProof?.classifierEvidenceFingerprint ||
      receipt.boundaryTotalityAndSourcePolicyProof?.registryBudgetFingerprint !== semanticHash(runtimeRecoveryRegistry.retryPolicy) ||
      receipt.boundaryTotalityAndSourcePolicyProof?.callerHintsCannotWeaken !== true) {
    errors.push('boundary/source-policy proof is incomplete');
  }
  const classifierProof = receipt.exactClassifierPlanProvenanceProof;
  if (!classifierProof || classifierProof.currentness !== 'CURRENT' ||
      classifierProof.planReceiptFingerprint !== receipt.canonicalFailure?.classifierPlanReceiptFingerprint ||
      classifierProof.evidenceFingerprint !== receipt.canonicalFailure?.classificationEvidenceFingerprint ||
      classifierProof.evidenceConsumesExactPlanReceipt !== true || classifierProof.failClosed !== true ||
      classifierProof.unknownPlanRejected !== true || classifierProof.allowedButNotIssuedPlanRejected !== true ||
      classifierProof.stalePlanReceiptRejected !== true || classifierProof.sameRefDifferentContentRejected !== true ||
      classifierProof.callerAuthoredInlinePlanRejected !== true ||
      !runtimeRecoveryRegistry.classifierContract.plans.some((item) =>
        item.planRef === classifierProof.classifierPlanRef && item.sourceRef === classifierProof.sourceRef &&
        item.adapterRef === classifierProof.adapterRef && item.formationRef === classifierProof.formationRef)) {
    errors.push('exact classifier plan provenance proof is incomplete or substituted');
  }
  const schedulerOwnership = receipt.replayDurableSchedulerRecoveryOwnershipProof;
  const checkpointReplay = receipt.canonicalCheckpointAndPreClaimReplayProof;
  if (!checkpointReplay || checkpointReplay.exactReleaseCount !== 6 ||
      checkpointReplay.immutableCanonicalCheckpointPreserved !== true ||
      checkpointReplay.independentPointerState !== 'RESUMED' ||
      checkpointReplay.pointerTransitionCount !== 2 ||
      checkpointReplay.releaseObjectsEmbedExactPriorAndTransitionedLeases !== true ||
      checkpointReplay.preClaimPhase !== 'PAUSED' ||
      checkpointReplay.coordinatedCheckpointReleaseClaimReplayRejected !== true ||
      checkpointReplay.legitimateClaimAdmissibleAfterRejectedReplay !== true) {
    errors.push('canonical checkpoint/pre-claim scheduler replay proof is incomplete');
  }
  const completeEdges = receipt.completeClaimEdgeReplayProof;
  if (!completeEdges ||
      JSON.stringify(completeEdges.lifecycle) !==
        JSON.stringify(['CLAIMED_CURRENT', 'RESUMED_CONSUMED', 'TERMINAL_CONSUMED']) ||
      completeEdges.resumeEmbedsQueueActiveSixLeasesRuntimeResourcePointerClock !== true ||
      completeEdges.terminalEmbedsCompleteCausalClosure !== true ||
      completeEdges.dispositionEmbedsExactHoldPointerQueueAndClock !== true ||
      completeEdges.coordinatedResumeEdgeForgeryRejected !== true ||
      completeEdges.coordinatedTerminalEdgeForgeryRejected !== true ||
      completeEdges.coordinatedDispositionEdgeForgeryRejected !== true) {
    errors.push('complete scheduler claim-edge replay proof is incomplete');
  }
  const boundedPriorState = receipt.boundedNonRecursiveSchedulerStateProof;
  const boundedPriorContract = boundedPriorState?.registeredContract;
  if (!boundedPriorState || boundedPriorState.contractRef !== boundedPriorContract?.contractRef ||
      boundedPriorState.registeredContractFingerprint !== semanticHash(boundedPriorContract) ||
      boundedPriorState.receiptSchemaVersion !== boundedPriorContract?.receiptSchemaVersion ||
      boundedPriorState.stateSliceSchemaVersion !== boundedPriorContract?.stateSliceSchemaVersion ||
      boundedPriorState.growthClass !== 'LINEAR_PER_RECOVERY_CLAIM_TRANSITION' ||
      boundedPriorState.lifecycleCount !== 2 || boundedPriorState.claimTransitionCount < 5 ||
      boundedPriorState.noNestedStateSlices !== true ||
      boundedPriorState.noPriorEdgeReceiptsInsideStateSlice !== true ||
      boundedPriorState.exactPriorAggregateAndTransitionBound !== true ||
      boundedPriorState.claimedRestartRestoresExactState !== true ||
      boundedPriorState.invalidatedRestartRestoresExactState !== true ||
      boundedPriorState.coordinatedResumeEdgeForgeryRejected !== true ||
      boundedPriorState.coordinatedTerminalEdgeForgeryRejected !== true ||
      boundedPriorState.coordinatedDispositionEdgeForgeryRejected !== true ||
      boundedPriorState.withinRegisteredBudgets !== true || boundedPriorState.linearGrowthProven !== true ||
      boundedPriorState.maximumObservedPriorStateReceiptBytes > boundedPriorContract?.maximumPriorStateReceiptBytes ||
      boundedPriorState.maximumObservedAdditionalAggregateBytes >
        boundedPriorContract?.maximumAdditionalAggregateBytesPerClaimTransition ||
      boundedPriorState.maximumLeaseBindingCount > boundedPriorContract?.maximumRecentLeaseBindings) {
    errors.push('bounded non-recursive scheduler prior-state proof is incomplete');
  }
  const sourceManagedPriorState = receipt.sourceManagedPriorStateBudgetAndTransitionProof;
  if (!sourceManagedPriorState || sourceManagedPriorState !== boundedPriorState &&
      semanticHash(sourceManagedPriorState) !== semanticHash(boundedPriorState) ||
      sourceManagedPriorState.canonicalSerializationExact !== true ||
      sourceManagedPriorState.exactPriorTransitionEvidenceBound !== true ||
      sourceManagedPriorState.maximumNestedStateSliceCount !== 0 ||
      sourceManagedPriorState.maximumPriorEdgeReceiptCount !== 0 ||
      sourceManagedPriorState.registryBudgetSubstitutionRejected !== true ||
      sourceManagedPriorState.oversizedCanonicalSliceRejected !== true ||
      sourceManagedPriorState.omittedPriorTransitionEvidenceRejected !== true ||
      sourceManagedPriorState.changedPriorTransitionEvidenceRejected !== true ||
      sourceManagedPriorState.sameStateSliceRefDifferentContentRejected !== true ||
      sourceManagedPriorState.samePriorStateReceiptRefDifferentContentRejected !== true ||
      sourceManagedPriorState.maximumObservedInitialClaimedSchedulerStateBytes >
        sourceManagedPriorState.registeredContract?.maximumInitialClaimedSchedulerStateBytes ||
      sourceManagedPriorState.maximumObservedPriorStateSliceBytes >
        sourceManagedPriorState.registeredContract?.maximumPriorStateReceiptBytes) {
    errors.push('source-managed prior-state budget and exact transition proof is incomplete');
  }
  const externalLifecycle = receipt.externalEventClaimLifecycleProof;
  const invalidatedReasons = Object.values(externalLifecycle?.invalidatedReasons ?? {});
  const terminalReasons = Object.values(externalLifecycle?.terminalReasons ?? {});
  if (!externalLifecycle || externalLifecycle.normalAccepted !== true ||
      externalLifecycle.normalAcceptedReason !== 'EVENT_ACCEPTED_ONCE' ||
      externalLifecycle.normalEventLifecycle !== 'RESUMED_CONSUMED' ||
      externalLifecycle.normalEventBoundToExactCurrentClaim !== true ||
      invalidatedReasons.length !== 5 || invalidatedReasons.some((reason) =>
        reason !== 'SCHEDULER_CLAIM_INVALIDATED_EXTERNAL_EVENT_REJECTED') ||
      terminalReasons.length !== 5 || terminalReasons.some((reason) =>
        reason !== 'SCHEDULER_CLAIM_TERMINAL_EXTERNAL_EVENT_REJECTED') ||
      externalLifecycle.allInvalidatedKindsRejectedExact !== true ||
      externalLifecycle.allTerminalKindsRejectedExact !== true ||
      externalLifecycle.invalidatedAggregateUnchanged !== true ||
      externalLifecycle.terminalAggregateUnchanged !== true ||
      Object.keys(externalLifecycle.managedFormationRejections ?? {}).length !== 4 ||
      Object.values(externalLifecycle.managedFormationRejections ?? {}).some((rejected) => rejected !== true) ||
      externalLifecycle.allManagedFormationUsesRejected !== true ||
      externalLifecycle.replayExactCurrentnessTamperRejected !== true) {
    errors.push('external recovery event claim lifecycle proof is incomplete');
  }
  const operationCurrentness = receipt.operationTimeSchedulerCurrentnessProof;
  const operationContract = runtimeRecoveryRegistry.operationTimeSchedulerCurrentnessContract;
  if (!operationCurrentness || operationCurrentness.contractRef !== operationContract?.contractRef ||
      operationCurrentness.contractFingerprint !== semanticHash(operationContract) ||
      operationCurrentness.everyRegisteredOperationRoutedExactly !== true ||
      Object.keys(operationCurrentness.operationRouteReceipts ?? {}).length !==
        operationContract?.operationClasses?.length ||
      operationCurrentness.allInvalidatedOperationsRejectedExact !== true ||
      operationCurrentness.allStaleOperationsRejectedExact !== true ||
      operationCurrentness.allNonterminalOperationsRejectedAfterTerminal !== true ||
      operationCurrentness.invalidatedCurrentProjectionState !== 'HELD_UNKNOWN' ||
      operationCurrentness.invalidatedCurrentProjectionQueueState !== 'HELD_UNKNOWN' ||
      operationCurrentness.invalidatedCurrentProjectionHealthState !== 'ATTENTION' ||
      operationCurrentness.staleCurrentProjectionState !== 'HELD_UNKNOWN' ||
      operationCurrentness.staleCurrentProjectionQueueState !== 'HELD_UNKNOWN' ||
      operationCurrentness.staleCurrentProjectionHealthState !== 'ATTENTION' ||
      operationCurrentness.terminalCurrentProjectionState !== 'CURRENT' ||
      operationCurrentness.historicalProjectionNeverCurrentOrClear !== true ||
      operationCurrentness.schedulerAggregatesUnchanged !== true ||
      operationCurrentness.recoveryAggregatesUnchanged !== true ||
      operationCurrentness.synchronizedNormalPathIntact !== true) {
    errors.push('operation-time scheduler currentness proof is incomplete');
  }
  const externalAdoption = receipt.externalEventFormationAdoptionProof;
  const adoptionContract = runtimeRecoveryRegistry.externalEventFormationAdoptionContract;
  if (!externalAdoption || externalAdoption.contractRef !== adoptionContract?.contractRef ||
      externalAdoption.contractFingerprint !== semanticHash(adoptionContract) ||
      externalAdoption.exactImmutableSourceBinding !== true ||
      externalAdoption.exactCurrentSchedulerCycleFailureWorkGenerationBinding !== true ||
      externalAdoption.exactChronology !== true ||
      externalAdoption.sourceImmutableBeforeAndAfterAdoption !== true ||
      externalAdoption.unscopedWithoutAdoptionRejected !== true ||
      externalAdoption.preClaimSourceAdoptionRejected !== true ||
      externalAdoption.exactCurrentScopedSourceAcceptedWithoutAdoption !== true ||
      externalAdoption.allReaddressedExternalEventsRejected !== true ||
      Object.keys(externalAdoption.readdressedExternalReasons ?? {}).length !== 3 ||
      externalAdoption.sameSourceRefDifferentContentRejected !== true ||
      externalAdoption.sameAdoptionRefDifferentContentRejected !== true ||
      externalAdoption.rehashedAdoptionBindingSubstitutionRejected !== true ||
      externalAdoption.managedEventsRemainContentAddressedWithoutAdoption !== true ||
      externalAdoption.replayExactAdoptionAndSourceTamperRejected !== true ||
      externalAdoption.invalidatedAndTerminalAdmissionsRejectedWithoutMutation !== true) {
    errors.push('external event formation/adoption proof is incomplete');
  }
  const replayProjection = receipt.replayOwnedRecoveryProjectionProof;
  if (!replayProjection || replayProjection.projectionKind !== 'QUEUE_TERRAIN_HEALTH_GUIDE' ||
      replayProjection.aggregateFingerprint !== receipt.finalAggregateFingerprint ||
      replayProjection.projectionSemanticFingerprint !== receipt.finalProjection?.semanticFingerprint ||
      replayProjection.projectionSemanticFingerprintExact !== true ||
      replayProjection.terminalBindingsExact !== true || replayProjection.heldBindingsExact !== true ||
      Object.keys(replayProjection.tamperRejections ?? {}).length !== 6 ||
      Object.values(replayProjection.tamperRejections ?? {}).some((rejected) => rejected !== true) ||
      replayProjection.allTamperClassesRejected !== true ||
      replayProjection.failedProjectionReturnedPlausibleView !== false) {
    errors.push('replay-owned recovery projection proof is incomplete');
  }
  const claimLifecycleRecovery = receipt.schedulerClaimLifecycleRecoveryProof;
  if (!claimLifecycleRecovery ||
      JSON.stringify(claimLifecycleRecovery.normalLifecycle) !==
        JSON.stringify(['CLAIMED_CURRENT', 'RESUMED_CONSUMED', 'TERMINAL_CONSUMED']) ||
      JSON.stringify(claimLifecycleRecovery.invalidatedLifecycle) !==
        JSON.stringify(['CLAIMED_CURRENT', 'INVALIDATED_OR_ABANDONED']) ||
      claimLifecycleRecovery.invalidatedRecoveryPhase !== 'BLOCKED' ||
      claimLifecycleRecovery.healthState !== 'BLOCKED' ||
      claimLifecycleRecovery.guideRoute !== 'SCHEDULER_CLAIM_INVALIDATED' ||
      claimLifecycleRecovery.guideWaitingOn !== claimLifecycleRecovery.exactDispositionReasonRef ||
      claimLifecycleRecovery.allStaleClaimUsesRejected !== true ||
      claimLifecycleRecovery.schedulerAggregateUnchangedAfterStaleUse !== true ||
      claimLifecycleRecovery.recoveryAggregateUnchangedAfterStaleUse !== true ||
      claimLifecycleRecovery.normalPathUnchanged !== true) {
    errors.push('scheduler claim lifecycle/recovery ownership proof is incomplete');
  }
  if (!schedulerOwnership || schedulerOwnership.leaseReleaseCount !== 6 ||
      schedulerOwnership.claimLifecycle !== 'CLAIMED_CURRENT' || schedulerOwnership.currentness !== 'CURRENT' ||
      schedulerOwnership.forgedClaimRejected !== true || schedulerOwnership.forgedClaimMutationFree !== true ||
      schedulerOwnership.duplicateLiveClaimRejected !== true || schedulerOwnership.duplicateRestartClaimRejected !== true ||
      schedulerOwnership.restartPreservedClaimOwnership !== true ||
      schedulerOwnership.releaseSetPreservedAcrossRestart !== true ||
      schedulerOwnership.claimedState !== 'CLAIMED_CURRENT' ||
      schedulerOwnership.resumedState !== 'RESUMED_CONSUMED' ||
      schedulerOwnership.terminalState !== 'TERMINAL_CONSUMED' ||
      schedulerOwnership.schedulerClaimLedgerLength !== 3 || !schedulerOwnership.onceOnlyActivationRef ||
      !schedulerOwnership.recoveryCycleRef ||
      !/^[a-f0-9]{64}$/.test(String(schedulerOwnership.recoveryCycleFingerprint ?? ''))) {
    errors.push('replay-durable scheduler recovery ownership proof is incomplete');
  }
  const canonicalClaimReplay = receipt.canonicalSchedulerClaimReplayProof;
  if (!canonicalClaimReplay || canonicalClaimReplay.exactReleaseCount !== 6 ||
      JSON.stringify(canonicalClaimReplay.lifecycle) !==
        JSON.stringify(['CLAIMED_CURRENT', 'RESUMED_CONSUMED', 'TERMINAL_CONSUMED']) ||
      canonicalClaimReplay.edgeContractRefs?.length !== 3 ||
      canonicalClaimReplay.edgeEvidenceFingerprints?.length !== 3 ||
      canonicalClaimReplay.forgedRehashedRestoreRejected !== true ||
      canonicalClaimReplay.fakeReleaseRestoredClaimRejected !== true ||
      canonicalClaimReplay.missingClaimReceiptRestoredClaimRejected !== true ||
      canonicalClaimReplay.legitimateClaimAdmissibleAfterRejectedRestore !== true ||
      canonicalClaimReplay.suppliedPointersEqualSemanticReplay !== true ||
      canonicalClaimReplay.terminalReplayState !== 'TERMINAL_CONSUMED') {
    errors.push('canonical scheduler recovery claim replay proof is incomplete');
  }
  const preResumeDisposition = receipt.preResumeClaimDispositionProof;
  if (!preResumeDisposition || preResumeDisposition.failedResumeRejected !== true ||
      preResumeDisposition.claimVisibleAfterFailedResume !== true ||
      preResumeDisposition.disposition !== 'ABANDONED_BEFORE_RESUME' ||
      preResumeDisposition.postDispositionCheckpointPolicy !== 'TERMINALLY_HELD_WITH_EXACT_REASON' ||
      preResumeDisposition.oldActivationReusable !== false || preResumeDisposition.oldReleaseSetReusable !== false ||
      preResumeDisposition.dispositionState !== 'INVALIDATED_OR_ABANDONED' ||
      preResumeDisposition.checkpointState !== 'RECOVERY_TERMINALLY_HELD' ||
      preResumeDisposition.restartPreservedDisposition !== true ||
      preResumeDisposition.oldActivationResumeRejected !== true ||
      preResumeDisposition.oldActivationReclaimRejected !== true ||
      preResumeDisposition.normalLifecycleUnchanged !== true) {
    errors.push('pre-resume recovery claim disposition proof is incomplete');
  }
  const cycleProof = receipt.recoveryCycleIsolationProof;
  if (!cycleProof || cycleProof.recoveryCycleCount !== 2 ||
      cycleProof.firstRecoveryCycleFingerprint !== cycleProof.priorCycleFingerprint ||
      cycleProof.firstRecoveryCycleRef !== cycleProof.firstTerminalCycleRef ||
      cycleProof.sameFailureClassRecurrence !== true || cycleProof.sameOperationRecurrence !== true ||
      cycleProof.differentActionRecovery !== true || cycleProof.priorCycleConvergenceRejected !== true ||
      cycleProof.priorCycleTerminalRejected !== true || cycleProof.prematureCurrentSuccessRejected !== true ||
      cycleProof.historicalTerminalIntact !== true ||
      cycleProof.currentProjectionCycleRef !== cycleProof.secondRecoveryCycleRef ||
      cycleProof.currentProjectionTerminalProofRef !== null ||
      cycleProof.currentProjectionState !== 'BLOCKED') {
    errors.push('recovery cycle isolation proof is incomplete or stale');
  }
  const cycleLocal = receipt.exactCycleLocalEvidenceProof;
  if (!cycleLocal || cycleLocal.sameFailureClassRecurrence !== true ||
      cycleLocal.sameOperationRecurrence !== true ||
      cycleLocal.preCheckpointHistoricalPreservationRejected !== true ||
      cycleLocal.preCheckpointPreservationState !== 'AWAITING_CURRENT_CYCLE_EVIDENCE' ||
      cycleLocal.preCheckpointWhatWasPreserved !== null ||
      cycleLocal.priorTransactionEvidenceRejected !== true ||
      cycleLocal.unscopedTransactionRejected !== true ||
      cycleLocal.readdressedTransactionRejected !== true ||
      cycleLocal.staleTransactionFormationRejected !== true ||
      cycleLocal.sameRefDifferentContentTransactionRejected !== true ||
      cycleLocal.priorContextEvidenceRejected !== true ||
      cycleLocal.priorResourceEvidenceRejected !== true ||
      cycleLocal.priorWaitEvidenceRejected !== true ||
      cycleLocal.historicalEvidenceIntact !== true ||
      cycleLocal.currentCycleControlledDisposition !== 'BLOCKED' ||
      cycleLocal.currentProjectionCycleRef !== cycleLocal.secondRecoveryCycleRef) {
    errors.push('exact cycle-local evidence/projection proof is incomplete');
  }
  if (receipt.checkpointFreshGenerationSixLeaseProof?.releasedLeaseCount !== 6 ||
      receipt.checkpointFreshGenerationSixLeaseProof?.freshLeaseCount !== 6 ||
      receipt.checkpointFreshGenerationSixLeaseProof?.generationAdvanced !== true ||
      !receipt.checkpointFreshGenerationSixLeaseProof?.schedulerConsumptionFingerprint ||
      !receipt.checkpointFreshGenerationSixLeaseProof?.onceOnlyActivationRef ||
      !receipt.checkpointFreshGenerationSixLeaseProof?.schedulerResumeFingerprint) {
    errors.push('checkpoint/fresh-generation/six-lease proof is incomplete');
  }
  if (receipt.replayedAggregateProof?.restoredFingerprint !== receipt.replayedAggregateProof?.serializedFingerprint ||
      receipt.replayedAggregateProof?.requiredEventTypesCovered !== true ||
      receipt.replayedAggregateProof?.illegalHistoryRejected !== true) {
    errors.push('replay-derived aggregate proof is incomplete');
  }
  if (receipt.aggregateOwnedRecoveryActionProof?.rollbackLineageCount < 1 ||
      receipt.aggregateOwnedRecoveryActionProof?.lastKnownGoodCount < 1 ||
      receipt.aggregateOwnedRecoveryActionProof?.quarantineLineageCount < 1 ||
      receipt.aggregateOwnedRecoveryActionProof?.quarantineHealth !== 'ATTENTION') {
    errors.push('aggregate-owned recovery action proof is incomplete');
  }
  const actionJourneys = receipt.actionSpecificRecoveryProof?.journeys ?? [];
  const actionJourneyByAction = new Map(actionJourneys.map((item) => [item.action, item]));
  const quarantineJourney = receipt.actionSpecificRecoveryProof?.quarantine;
  if (quarantineJourney?.action) actionJourneyByAction.set(quarantineJourney.action, quarantineJourney);
  if (receipt.actionSpecificRecoveryProof?.matrixFingerprint !== semanticHash(runtimeRecoveryRegistry.recoveryActionEvidenceMatrix) ||
      runtimeRecoveryRegistry.recoveryActions.some((action) => !actionJourneyByAction.has(action)) ||
      runtimeRecoveryRegistry.recoveryActionEvidenceMatrix.some((matrix) => {
        const journey = actionJourneyByAction.get(matrix.action);
        if (!journey || journey.disposition !== matrix.disposition) return true;
        const roles = journey.evidenceRoles ?? [];
        if (matrix.required.some((role) => !roles.includes(role)) ||
            roles.some((role) => !matrix.required.includes(role) && !matrix.optional.includes(role))) return true;
        return matrix.continuationRequired
          ? (!journey.schedulerResumeFingerprint || !journey.convergenceFingerprint)
          : Boolean(journey.convergenceFingerprint);
      })) {
    errors.push('action-specific recovery journey/matrix proof is incomplete');
  }
  const causalProof = receipt.schedulerWorkgraphCausalRecoveryProof;
  const convergence = causalProof?.recoveryConvergenceReceipt;
  const convergenceCanonical = convergence ? structuredClone(convergence) : null;
  if (convergenceCanonical) {
    delete convergenceCanonical.convergenceReceiptRef;
    delete convergenceCanonical.semanticFingerprint;
  }
  const convergenceFingerprint = convergenceCanonical ? semanticHash(convergenceCanonical) : null;
  const causalEvidence = convergence?.causalEvidence ?? [];
  const causalGateRefs = causalEvidence.map((item) => item.completionGateRef).sort();
  const actionReceipt = receipt.aggregateOwnedRecoveryActionProof?.actionReceipt;
  const expectedCausalGateRefs = expectedActionSpecificCausalGateRefs(actionReceipt);
  const causalFingerprintsValid = causalEvidence.every((item) =>
    item.sourceObservationRef && /^[a-f0-9]{64}$/.test(String(item.sourceObservationHash ?? '')));
  const releasedEvidenceFingerprints = causalEvidence
    .filter((item) => item.completionGateRef?.includes('.released-'))
    .map((item) => item.sourceObservationHash).sort();
  const freshEvidenceFingerprints = causalEvidence
    .filter((item) => item.completionGateRef?.includes('.fresh-'))
    .map((item) => item.sourceObservationHash).sort();
  const causalByGate = Object.fromEntries(causalEvidence.map((item) => [item.completionGateRef, item]));
  if (convergence?.schemaVersion !== 'vexlife.runtime-recovery-convergence-receipt/v1' ||
      convergence?.state !== 'RECOVERY_ACTIONS_CONVERGED' ||
      convergenceFingerprint !== convergence?.semanticFingerprint ||
      convergence?.convergenceReceiptRef !== `receipt.runtime-recovery.convergence.${String(convergenceFingerprint).slice(0, 32)}` ||
      JSON.stringify(causalGateRefs) !== JSON.stringify(expectedCausalGateRefs) ||
      causalFingerprintsValid !== true ||
      new Set(causalGateRefs).size !== expectedCausalGateRefs.length ||
      convergence?.failureFingerprint !== receipt.canonicalFailure?.semanticFingerprint ||
      convergence?.decisionFingerprint !== receipt.boundaryTotalityAndSourcePolicyProof?.policyDecisionFingerprint ||
      convergence?.actionReceiptFingerprint !== receipt.aggregateOwnedRecoveryActionProof?.actionReceiptFingerprint ||
      convergence?.successExecutionFingerprint !== receipt.terminalReceipt?.successExecutionFingerprint ||
      causalByGate['completion-gate.runtime-recovery.scheduler-checkpoint']?.sourceObservationHash !== receipt.checkpointFreshGenerationSixLeaseProof?.schedulerCheckpointFingerprint ||
      causalByGate['completion-gate.runtime-recovery.checkpoint-admission']?.sourceObservationHash !== receipt.checkpointFreshGenerationSixLeaseProof?.checkpointAdmissionFingerprint ||
      (receipt.aggregateOwnedRecoveryActionProof?.contextRecoveryFingerprint
        ? causalByGate['completion-gate.runtime-recovery.context']?.sourceObservationHash !== receipt.aggregateOwnedRecoveryActionProof.contextRecoveryFingerprint
        : causalByGate['completion-gate.runtime-recovery.context'] !== undefined) ||
      (receipt.aggregateOwnedRecoveryActionProof?.resourceRecoveryFingerprint
        ? causalByGate['completion-gate.runtime-recovery.resource']?.sourceObservationHash !== receipt.aggregateOwnedRecoveryActionProof.resourceRecoveryFingerprint
        : causalByGate['completion-gate.runtime-recovery.resource'] !== undefined) ||
      causalByGate['completion-gate.runtime-recovery.rollback']?.sourceObservationHash !== receipt.aggregateOwnedRecoveryActionProof?.transactionalRecoveryFingerprint ||
      causalByGate['completion-gate.runtime-recovery.last-known-good']?.sourceObservationHash !== receipt.aggregateOwnedRecoveryActionProof?.lastKnownGoodReadBackFingerprint ||
      causalByGate['completion-gate.runtime-recovery.action']?.sourceObservationHash !== receipt.aggregateOwnedRecoveryActionProof?.actionReceiptFingerprint ||
      causalByGate['completion-gate.runtime-recovery.scheduler-resume']?.sourceObservationHash !== receipt.checkpointFreshGenerationSixLeaseProof?.schedulerResumeFingerprint ||
      causalByGate['completion-gate.runtime-recovery.continuation']?.sourceObservationHash !== receipt.checkpointFreshGenerationSixLeaseProof?.continuationFingerprint ||
      JSON.stringify(releasedEvidenceFingerprints) !== JSON.stringify(Object.values(receipt.checkpointFreshGenerationSixLeaseProof?.releasedLeaseFingerprints ?? {}).sort()) ||
      JSON.stringify(freshEvidenceFingerprints) !== JSON.stringify(Object.values(receipt.checkpointFreshGenerationSixLeaseProof?.freshLeaseFingerprints ?? {}).sort())) {
    errors.push('recovery convergence causal evidence is incomplete or substituted');
  }
  if (receipt.schedulerWorkgraphCausalRecoveryProof?.independentSchedulerSimulationUsed !== false ||
      receipt.schedulerWorkgraphCausalRecoveryProof?.completionGateCount !== RECOVERY_COMPLETION_GATE_REFS.length ||
      receipt.schedulerWorkgraphCausalRecoveryProof?.exactGateCoverage !== true ||
      receipt.canonicalWorkNodeRef !== runtimeRecoveryRegistry.simulationContract.workNodeRef ||
      receipt.canonicalWorkNodeFinalState !== 'COMPLETED') {
    errors.push('scheduler/Workgraph causal recovery proof is incomplete');
  }
  const schedulerGateEvidence = causalProof?.gateEvidence ?? [];
  if (schedulerGateEvidence.length !== 1 ||
      schedulerGateEvidence[0]?.completionGateRef !== RECOVERY_COMPLETION_GATE_REFS[0] ||
      schedulerGateEvidence[0]?.sourceObservationRef !== convergence?.convergenceReceiptRef ||
      schedulerGateEvidence[0]?.sourceObservationHash !== convergence?.semanticFingerprint ||
      receipt.terminalReceipt?.convergenceReceiptRef !== convergence?.convergenceReceiptRef ||
      receipt.terminalReceipt?.convergenceReceiptFingerprint !== convergence?.semanticFingerprint) {
    errors.push('Workgraph completion did not consume the exact recovery convergence receipt');
  }
  for (const field of runtimeRecoveryRegistry?.simulationContract?.requiredSchedulerBindings ?? []) {
    if (!/^[a-f0-9]{64}$/.test(String(receipt.schedulerBindings?.[field] ?? ''))) {
      errors.push(`runtime recovery scheduler binding missing ${field}`);
    }
  }
  if (receipt.terminalReceipt?.schedulerCheckpointFingerprint !== receipt.schedulerBindings?.checkpointFingerprint ||
      receipt.terminalReceipt?.schedulerCompletionVerificationFingerprint !== receipt.schedulerBindings?.completionVerificationFingerprint ||
      receipt.terminalReceipt?.schedulerCompletionEvidenceLineageFingerprint !== receipt.schedulerBindings?.completionEvidenceLineageFingerprint ||
      receipt.terminalReceipt?.schedulerWorkgraphTransitionFingerprint !== receipt.schedulerBindings?.workgraphTransitionFingerprint ||
      receipt.terminalReceipt?.schedulerCompletionFingerprint !== receipt.schedulerBindings?.completionFingerprint) {
    errors.push('terminal receipt does not consume all exact scheduler bindings');
  }
  if (receipt.humanProjectionRecoveryEvidenceProof?.completedWhatFailed !== receipt.canonicalFailure.failureClass ||
      !receipt.humanProjectionRecoveryEvidenceProof?.completedRoute ||
      !receipt.humanProjectionRecoveryEvidenceProof?.terminalProofRef ||
      receipt.humanProjectionRecoveryEvidenceProof?.quarantineHealth !== 'ATTENTION') {
    errors.push('human projection recovery evidence was cleared or detached');
  }
  const canonical = structuredClone(receipt);
  delete canonical.semanticFingerprint;
  if (semanticHash(canonical) !== receipt.semanticFingerprint) errors.push('runtime recovery receipt semanticFingerprint mismatch');
  return { ok: errors.length === 0, state: errors.length ? 'INVALID' : 'EXECUTED_CURRENT', errors };
}

export function runRecoverySimulation({ root = DEFAULT_ROOT, writeReceipt = true, receiptPath = null } = {}) {
  const bundle = loadBlueprint(root);
  const registry = bundle.blueprint.runtimeRecovery;
  const target = resolveSafeGeneratedReceiptPath(root, receiptPath ?? registry.simulationContract.receiptPath,
    'runtime recovery simulation receipt path');
  const journeyStates = [];
  const sourceStateFingerprint = semanticHash(registry);
  const trustSnapshot = readJson(path.join(root, 'blueprint/intent-trust-snapshot.json'));
  const { node, graph } = createRecoveryGraph(bundle, registry, trustSnapshot);
  const resourceOne = runtimeResource(1, sourceStateFingerprint, {
    formedAt: FORMED,
    observedAt: OBSERVED,
    cpuLoadPct: 10,
    ramAvailableMb: 8192
  });
  const runtimeOne = runtimeTrust(bundle.schedulerRegistry, resourceOne, 1, { formedAt: FORMED, observedAt: OBSERVED });
  const optionsOne = schedulerOptions({
    bundle, graph, node, trustSnapshot, resourceSnapshot: resourceOne, runtimeTrustSnapshot: runtimeOne,
    generation: 1, formedAt: FORMED, observedAt: OBSERVED
  });
  const scheduler = new SingleWorkerIntentScheduler({
    workerRef: runtimeOne.workerRef,
    schedulerInstanceRef: 'instance.intent-scheduler.runtime-recovery',
    schedulerRegistry: bundle.schedulerRegistry,
    runtimeRecoveryRegistry: registry,
    runtimeAuthority: new WorkerLeaseAuthority({ sourceRef: runtimeOne.sourceRef })
  });
  const queue = scheduler.admit(graph, optionsOne);
  const running = scheduler.leaseSelected(contextInput(1, { formedAt: FORMED, observedAt: OBSERVED }));
  if (queue.state !== 'ADMITTED' || !running.admitted) {
    throw new Error(`actual recovery Workgraph node was not admitted and leased: ${JSON.stringify({
      queueState: queue.state,
      queue,
      runningState: running.state,
      runningReason: running.reason
    })}`);
  }
  journeyStates.push('RECOVERY_WORK_NODE_ADMITTED');

  let aggregate = createRecoveryAggregate({
    aggregateRef: 'aggregate.runtime-recovery.simulation',
    workNodeRef: node.workNodeRef,
    sourceStateFingerprint,
    schedulerGeneration: 1,
    retryBudget: registry.retryPolicy
  }, { registry });
  const executor = createDeterministicFaultInjector({
    registry,
    planRef: 'classifier-plan.runtime-recovery.simulation.main',
    failures: [{ attempt: 1, failureClass: 'PARTIAL_WRITE_SIMULATED', message: 'deterministic partial write' }],
    successValue: { state: 'PASS', partialEffectState: 'NONE', outputRef: 'output.runtime-recovery.simulation' }
  });
  const failed = executeWithRecoveryBoundary({
    aggregate,
    executor,
    registry,
    context: boundaryContext(aggregate, 'attempt.runtime-recovery.simulation.1', 1, OBSERVED, FAILED_AT)
  });
  if (!failed.admitted || failed.status !== 'FAILED_RECOVERABLE') {
    throw new Error(`typed runtime failure was not admitted: ${JSON.stringify({
      admitted: failed.admitted,
      status: failed.status,
      reason: failed.reason,
      boundaryRejection: failed.boundaryRejection
    })}`);
  }
  aggregate = failed.aggregate;
  journeyStates.push('TOTAL_BOUNDARY_FAILURE_TYPED');

  const sourceBindings = [{ sourceRef: 'blueprint/runtime-recovery-registry.json', sourceHash: sourceStateFingerprint }];
  const checkpointed = scheduler.checkpoint({
    checkpointRef: 'checkpoint.runtime-recovery.scheduler.1',
    workNodeRef: node.workNodeRef,
    lastCompletedStep: 'typed-runtime-failure-formed',
    selectedSourceRefs: ['blueprint/runtime-recovery-registry.json'],
    selectedContextRefs: [running.contextLease.leaseRef],
    producedArtifactRefs: [],
    producedReceiptRefs: [queue.admissionReceipt.admissionReceiptRef],
    openQuestions: [],
    nextSafeAction: 'RESUME_WITH_FRESH_RUNTIME',
    pendingToolCallRef: 'NONE',
    sourceBindings,
    formedAt: FAILED_AT
  }, { releaseReceiptRef: 'release.runtime-recovery.checkpoint.1', releasedAt: FAILED_AT });
  journeyStates.push('EXACT_SCHEDULER_CHECKPOINT_AND_SIX_RELEASES');
  const recoveryClaimReceipt = createSchedulerRecoveryClaimReceipt({
    aggregate,
    schedulerAggregate: scheduler.aggregate,
    schedulerCheckpoint: checkpointed.checkpoint,
    formedAt: FAILED_AT,
    registry
  });
  const schedulerPausedSnapshot = structuredClone(scheduler.aggregate);
  const schedulerFingerprintBeforeForgedClaim = scheduler.aggregate.semanticFingerprint;
  const forgedClaimReceipt = structuredClone(recoveryClaimReceipt);
  forgedClaimReceipt.aggregateRef = 'aggregate.runtime-recovery.forged-claimant';
  delete forgedClaimReceipt.claimReceiptRef;
  delete forgedClaimReceipt.semanticFingerprint;
  forgedClaimReceipt.semanticFingerprint = semanticHash(forgedClaimReceipt);
  forgedClaimReceipt.claimReceiptRef =
    `claim.runtime-recovery.scheduler.${forgedClaimReceipt.semanticFingerprint.slice(0, 32)}`;
  let forgedClaimRejected = false;
  try {
    scheduler.claimRecoveryCheckpoint(checkpointed.checkpoint.checkpointRef, {
      recoveryClaimReceipt: forgedClaimReceipt,
      observedAt: FAILED_AT
    });
  } catch {
    forgedClaimRejected = true;
  }
  const forgedClaimMutationFree = scheduler.aggregate.semanticFingerprint === schedulerFingerprintBeforeForgedClaim;
  const schedulerConsumption = scheduler.claimRecoveryCheckpoint(checkpointed.checkpoint.checkpointRef, {
    recoveryClaimReceipt,
    observedAt: FAILED_AT
  });
  const schedulerClaimedCurrentness = scheduler.recoveryClaimCurrentness(
    checkpointed.checkpoint.checkpointRef,
    { observedAt: FAILED_AT }
  );
  const schedulerClaimedSnapshot = structuredClone(scheduler.aggregate);
  const forgedRestoredAggregate = structuredClone(schedulerClaimedSnapshot);
  const forgedTransition = forgedRestoredAggregate.recoveryClaimLedger[0];
  forgedTransition.recoveryAggregateFingerprint = 'f'.repeat(64);
  delete forgedTransition.transitionRef;
  delete forgedTransition.semanticFingerprint;
  forgedTransition.semanticFingerprint = semanticHash(forgedTransition);
  forgedTransition.transitionRef =
    `transition.intent-scheduler.recovery-claim.claimed-current.${forgedTransition.semanticFingerprint.slice(0, 32)}`;
  forgedRestoredAggregate.recoveryClaims[0].recoveryAggregateFingerprint = forgedTransition.recoveryAggregateFingerprint;
  forgedRestoredAggregate.recoveryClaims[0].lastTransitionRef = forgedTransition.transitionRef;
  forgedRestoredAggregate.recoveryClaims[0].lastTransitionFingerprint = forgedTransition.semanticFingerprint;
  delete forgedRestoredAggregate.semanticFingerprint;
  forgedRestoredAggregate.semanticFingerprint = semanticHash(forgedRestoredAggregate);
  let forgedRehashedRestoreRejected = false;
  try {
    new SingleWorkerIntentScheduler({
      workerRef: runtimeOne.workerRef,
      schedulerInstanceRef: 'instance.intent-scheduler.runtime-recovery.forged-restore',
      schedulerRegistry: bundle.schedulerRegistry,
      runtimeRecoveryRegistry: registry,
      runtimeAuthority: new WorkerLeaseAuthority({ sourceRef: runtimeOne.sourceRef }),
      schedulerAggregate: forgedRestoredAggregate
    });
  } catch {
    forgedRehashedRestoreRejected = true;
  }
  const rehashClaimedRestore = (candidate) => {
    const transition = candidate.recoveryClaimLedger[0];
    const edge = transition.edgeEvidence;
    delete edge.evidenceRef;
    delete edge.semanticFingerprint;
    edge.semanticFingerprint = semanticHash(edge);
    edge.evidenceRef = `evidence.intent-scheduler.recovery-claim.claimed-current.${edge.semanticFingerprint.slice(0, 32)}`;
    transition.edgeEvidenceRef = edge.evidenceRef;
    transition.edgeEvidenceFingerprint = edge.semanticFingerprint;
    delete transition.transitionRef;
    delete transition.semanticFingerprint;
    transition.semanticFingerprint = semanticHash(transition);
    transition.transitionRef =
      `transition.intent-scheduler.recovery-claim.claimed-current.${transition.semanticFingerprint.slice(0, 32)}`;
    candidate.recoveryClaims[0].lastTransitionRef = transition.transitionRef;
    candidate.recoveryClaims[0].lastTransitionFingerprint = transition.semanticFingerprint;
    candidate.recoveryClaims[0].edgeEvidenceRef = edge.evidenceRef;
    candidate.recoveryClaims[0].edgeEvidenceFingerprint = edge.semanticFingerprint;
    delete candidate.semanticFingerprint;
    candidate.semanticFingerprint = semanticHash(candidate);
    return candidate;
  };
  const fakeReleaseRestoredAggregate = structuredClone(schedulerClaimedSnapshot);
  fakeReleaseRestoredAggregate.recoveryClaimLedger[0].leaseReleaseFingerprints[0] = 'e'.repeat(64);
  fakeReleaseRestoredAggregate.recoveryClaimLedger[0].edgeEvidence.leaseReleaseFingerprints[0] = 'e'.repeat(64);
  fakeReleaseRestoredAggregate.recoveryClaims[0].leaseReleaseFingerprints[0] = 'e'.repeat(64);
  rehashClaimedRestore(fakeReleaseRestoredAggregate);
  let fakeReleaseRestoredClaimRejected = false;
  try {
    new SingleWorkerIntentScheduler({
      workerRef: runtimeOne.workerRef,
      schedulerInstanceRef: 'instance.intent-scheduler.runtime-recovery.fake-release-restore',
      schedulerRegistry: bundle.schedulerRegistry,
      runtimeRecoveryRegistry: registry,
      runtimeAuthority: new WorkerLeaseAuthority({ sourceRef: runtimeOne.sourceRef }),
      schedulerAggregate: fakeReleaseRestoredAggregate
    });
  } catch {
    fakeReleaseRestoredClaimRejected = true;
  }
  const missingClaimReceiptRestoredAggregate = structuredClone(schedulerClaimedSnapshot);
  delete missingClaimReceiptRestoredAggregate.recoveryClaimLedger[0].edgeEvidence.recoveryClaimReceipt;
  rehashClaimedRestore(missingClaimReceiptRestoredAggregate);
  let missingClaimReceiptRestoredClaimRejected = false;
  try {
    new SingleWorkerIntentScheduler({
      workerRef: runtimeOne.workerRef,
      schedulerInstanceRef: 'instance.intent-scheduler.runtime-recovery.missing-claim-receipt-restore',
      schedulerRegistry: bundle.schedulerRegistry,
      runtimeRecoveryRegistry: registry,
      runtimeAuthority: new WorkerLeaseAuthority({ sourceRef: runtimeOne.sourceRef }),
      schedulerAggregate: missingClaimReceiptRestoredAggregate
    });
  } catch {
    missingClaimReceiptRestoredClaimRejected = true;
  }
  const legitimateAfterRejectedRestore = new SingleWorkerIntentScheduler({
    workerRef: runtimeOne.workerRef,
    schedulerInstanceRef: 'instance.intent-scheduler.runtime-recovery.legitimate-after-forged-restore',
    schedulerRegistry: bundle.schedulerRegistry,
    runtimeRecoveryRegistry: registry,
    runtimeAuthority: new WorkerLeaseAuthority({ sourceRef: runtimeOne.sourceRef }),
    schedulerAggregate: schedulerPausedSnapshot
  });
  const legitimateClaimAfterRejectedRestore = legitimateAfterRejectedRestore.claimRecoveryCheckpoint(
    checkpointed.checkpoint.checkpointRef,
    { recoveryClaimReceipt, observedAt: FAILED_AT }
  );
  let duplicateLiveClaimRejected = false;
  try {
    scheduler.claimRecoveryCheckpoint(checkpointed.checkpoint.checkpointRef, {
      recoveryClaimReceipt,
      observedAt: FAILED_AT
    });
  } catch {
    duplicateLiveClaimRejected = true;
  }
  const restartedClaimScheduler = new SingleWorkerIntentScheduler({
    workerRef: runtimeOne.workerRef,
    schedulerInstanceRef: 'instance.intent-scheduler.runtime-recovery',
    schedulerRegistry: bundle.schedulerRegistry,
    runtimeRecoveryRegistry: registry,
    runtimeAuthority: new WorkerLeaseAuthority({ sourceRef: runtimeOne.sourceRef }),
    schedulerAggregate: schedulerClaimedSnapshot
  });
  let duplicateRestartClaimRejected = false;
  try {
    restartedClaimScheduler.claimRecoveryCheckpoint(checkpointed.checkpoint.checkpointRef, {
      recoveryClaimReceipt,
      observedAt: FAILED_AT
    });
  } catch {
    duplicateRestartClaimRejected = true;
  }
  const restartPreservedClaimOwnership =
    restartedClaimScheduler.aggregate.semanticFingerprint === schedulerClaimedSnapshot.semanticFingerprint &&
    restartedClaimScheduler.aggregate.recoveryClaims.at(-1)?.state === 'CLAIMED_CURRENT';
  const preResumeDispositionScheduler = new SingleWorkerIntentScheduler({
    workerRef: runtimeOne.workerRef,
    schedulerInstanceRef: 'instance.intent-scheduler.runtime-recovery.pre-resume-disposition',
    schedulerRegistry: bundle.schedulerRegistry,
    runtimeRecoveryRegistry: registry,
    runtimeAuthority: new WorkerLeaseAuthority({ sourceRef: runtimeOne.sourceRef }),
    schedulerAggregate: schedulerClaimedSnapshot
  });
  let failedResumeRejected = false;
  try {
    preResumeDispositionScheduler.resume(checkpointed.checkpoint.checkpointRef, {
      graph,
      options: { ...optionsOne, schedulerGeneration: 2, observedAt: RECOVERED_AT },
      sourceBindings,
      contextInput: contextInput(2, { formedAt: FAILED_AT, observedAt: RECOVERED_AT }),
      recovery: {
        checkpointConsumptionReceipt: schedulerConsumption,
        checkpointAdmission: { schemaVersion: 'vexlife.runtime-recovery-checkpoint-admission/v1' },
        actionReceipt: null
      }
    });
  } catch {
    failedResumeRejected = true;
  }
  const claimVisibleAfterFailedResume =
    preResumeDispositionScheduler.aggregate.recoveryClaims.at(-1)?.state === 'CLAIMED_CURRENT';
  const preResumeDisposition = preResumeDispositionScheduler.abandonRecoveryClaim(
    checkpointed.checkpoint.checkpointRef,
    {
      checkpointConsumptionReceipt: schedulerConsumption,
      reasonRef: 'reason.intent-scheduler.recovery.resume-validation-failed',
      postDispositionCheckpointPolicy: 'TERMINALLY_HELD_WITH_EXACT_REASON',
      observedAt: RECOVERED_AT
    }
  );
  const preResumeDispositionCurrentness = preResumeDispositionScheduler.recoveryClaimCurrentness(
    checkpointed.checkpoint.checkpointRef,
    { observedAt: RECOVERED_AT }
  );
  const preResumeDispositionSnapshot = structuredClone(preResumeDispositionScheduler.aggregate);
  const restartedDispositionScheduler = new SingleWorkerIntentScheduler({
    workerRef: runtimeOne.workerRef,
    schedulerInstanceRef: 'instance.intent-scheduler.runtime-recovery.pre-resume-disposition.restart',
    schedulerRegistry: bundle.schedulerRegistry,
    runtimeRecoveryRegistry: registry,
    runtimeAuthority: new WorkerLeaseAuthority({ sourceRef: runtimeOne.sourceRef }),
    schedulerAggregate: preResumeDispositionSnapshot
  });
  let oldActivationResumeRejected = false;
  try {
    restartedDispositionScheduler.resume(checkpointed.checkpoint.checkpointRef, {
      graph,
      options: { ...optionsOne, schedulerGeneration: 2, observedAt: SUCCEEDED_AT },
      sourceBindings,
      contextInput: contextInput(2, { formedAt: FAILED_AT, observedAt: SUCCEEDED_AT }),
      recovery: null
    });
  } catch {
    oldActivationResumeRejected = true;
  }
  let oldActivationReclaimRejected = false;
  try {
    restartedDispositionScheduler.claimRecoveryCheckpoint(checkpointed.checkpoint.checkpointRef, {
      recoveryClaimReceipt,
      observedAt: SUCCEEDED_AT
    });
  } catch {
    oldActivationReclaimRejected = true;
  }
  journeyStates.push('CANONICAL_SCHEDULER_CLAIM_REPLAY_VERIFIED');
  journeyStates.push('PRE_RESUME_CLAIM_TERMINALLY_HELD');
  const checkpoint = createRecoveryCheckpoint({
    schedulerCheckpoint: checkpointed.checkpoint,
    schedulerConsumptionReceipt: schedulerConsumption,
    aggregateRef: aggregate.aggregateRef,
    failureRef: failed.failure.failureRef,
    failureFingerprint: failed.failure.semanticFingerprint,
    sourceStateFingerprint,
    selectedSourceRanges: [{ sourceRef: 'blueprint/runtime-recovery-registry.json', start: 0, end: 1 }],
    preservedIntentRef: 'intent.runtime-recovery.simulation',
    preservedInterpretationRef: 'interpretation.runtime-recovery.simulation',
    preservedUnknownRefs: ['unknown.runtime-recovery.none'],
    preservedAuthorityRef: 'authority.runtime-recovery.no-effect-only',
    returnRouteRef: node.returnRouteRef,
    formedAt: FAILED_AT
  });
  const checkpointAdmission = admitRecoveryCheckpoint(checkpoint, aggregate, {
    schedulerCheckpoint: checkpointed.checkpoint,
    schedulerConsumptionReceipt: schedulerConsumption,
    nextSchedulerGeneration: 2,
    currentSourceStateFingerprint: sourceStateFingerprint,
    observedAt: FAILED_AT,
    registry
  });
  aggregate = recordRecoveryCheckpointAdmission(aggregate, checkpoint, checkpointAdmission, {
    schedulerConsumptionReceipt: schedulerConsumption,
    registry
  });
  aggregate = recordSchedulerRecoveryClaimLifecycle(aggregate, {
    schedulerAggregate: scheduler.aggregate,
    schedulerClaimCurrentnessReceipt: schedulerClaimedCurrentness,
    registry
  });
  const claimedSchedulerCurrentness = schedulerCurrentness(
    scheduler,
    checkpointed.checkpoint.checkpointRef,
    RECOVERED_AT
  );
  journeyStates.push('CHECKPOINT_ADMISSION_RECORDED');

  const resourceTwo = runtimeResource(2, sourceStateFingerprint, {
    formedAt: FAILED_AT,
    observedAt: RECOVERED_AT,
    cpuLoadPct: 94,
    ramAvailableMb: 2048
  });
  const contextProof = contextReceipt(
    aggregate,
    checkpointAdmission,
    failed.failure,
    FAILED_AT,
    RECOVERED_AT,
    claimedSchedulerCurrentness,
    registry
  );
  const resourceProof = createRecoveryResourceReceipt({
    aggregate,
    workNodeRef: aggregate.workNodeRef,
    sourceStateFingerprint,
    failureFingerprint: failed.failure.semanticFingerprint,
    checkpointAdmission,
    resourceSnapshot: resourceTwo,
    deniedRequest: { cpuSlots: 4, ramMb: 1800, modelTurn: true },
    reducedRequest: { cpuSlots: 1, ramMb: 512, modelTurn: true },
    observedAt: RECOVERED_AT,
    schedulerCurrentness: claimedSchedulerCurrentness,
    registry
  });
  const decided = recordRecoveryPolicyDecision(aggregate, {
    checkpointAdmission,
    observedAt: RECOVERED_AT,
    schedulerCurrentness: claimedSchedulerCurrentness,
    registry
  });
  aggregate = decided.aggregate;
  if (decided.policyDecision.action !== 'ROLLBACK_TO_BEFORE_IMAGE' || !decided.policyDecision.actionAuthorized) {
    throw new Error('source-managed rollback policy was not exact');
  }
  journeyStates.push('EXACT_SOURCE_POLICY_DECIDED');
  const sourceTransaction = simulateTransactionalRecovery({
    adapter: createNoEffectTransactionalAdapter({
      initialState: { value: 'before' },
      attemptedState: { value: 'partial' },
      rollbackFails: true
    }),
    operationRef: failed.failure.operationRef,
    expectedBeforeFingerprint: semanticHash({ value: 'before' }),
    rollbackReceiptRef: 'receipt.runtime-recovery.rollback.main',
    lastKnownGoodRef: 'state.runtime-recovery.last-known-good.main',
    observedAt: RECOVERED_AT
  });
  const transaction = createCycleBoundTransactionalRecoveryReceipt({
    aggregate,
    transactionalRecoveryReceipt: sourceTransaction,
    recoveryClaimReceipt,
    checkpointAdmission,
    observedAt: RECOVERED_AT,
    schedulerCurrentness: claimedSchedulerCurrentness,
    registry
  });
  const action = applyRecoveryAction({
    aggregate,
    policyDecision: decided.policyDecision,
    checkpointAdmission,
    transactionalRecoveryReceipt: transaction,
    observedAt: RECOVERED_AT,
    schedulerCurrentness: claimedSchedulerCurrentness,
    registry
  });
  aggregate = action.aggregate;
  const disposedRecoveryAggregate = recordSchedulerRecoveryClaimLifecycle(action.aggregate, {
    schedulerAggregate: preResumeDispositionScheduler.aggregate,
    schedulerClaimCurrentnessReceipt: preResumeDispositionCurrentness,
    registry
  });
  const disposedSchedulerCurrentness = {
    schedulerAggregate: preResumeDispositionScheduler.aggregate,
    schedulerClaimCurrentnessReceipt: preResumeDispositionCurrentness
  };
  const disposedProjection = projectRecoveryAggregate(disposedRecoveryAggregate, {
    projectionObservedAt: RECOVERED_AT,
    schedulerCurrentness: disposedSchedulerCurrentness,
    registry
  }).projection;
  const schedulerBeforeStaleClaimUse = preResumeDispositionScheduler.aggregate.semanticFingerprint;
  const recoveryBeforeStaleClaimUse = disposedRecoveryAggregate.semanticFingerprint;
  const staleClaimUseRejected = {
    policy: false,
    context: false,
    resource: false,
    transaction: false,
    action: false,
    success: false,
    convergence: false,
    continuation: false,
    externalEvent: false
  };
  try {
    recordRecoveryPolicyDecision(disposedRecoveryAggregate, {
      checkpointAdmission,
      observedAt: SUCCEEDED_AT,
      registry
    });
  } catch { staleClaimUseRejected.policy = true; }
  try {
    recordRecoveryPolicyDecision(disposedRecoveryAggregate, {
      checkpointAdmission,
      contextAdmissionReceipt: contextProof,
      observedAt: SUCCEEDED_AT,
      registry
    });
  } catch { staleClaimUseRejected.context = true; }
  try {
    recordRecoveryPolicyDecision(disposedRecoveryAggregate, {
      checkpointAdmission,
      resourceAdmissionReceipt: resourceProof,
      observedAt: SUCCEEDED_AT,
      registry
    });
  } catch { staleClaimUseRejected.resource = true; }
  try {
    createCycleBoundTransactionalRecoveryReceipt({
      aggregate: disposedRecoveryAggregate,
      transactionalRecoveryReceipt: sourceTransaction,
      recoveryClaimReceipt,
      checkpointAdmission,
      observedAt: SUCCEEDED_AT,
      registry
    });
  } catch { staleClaimUseRejected.transaction = true; }
  try {
    applyRecoveryAction({
      aggregate: disposedRecoveryAggregate,
      policyDecision: decided.policyDecision,
      checkpointAdmission,
      transactionalRecoveryReceipt: transaction,
      observedAt: SUCCEEDED_AT,
      registry
    });
  } catch { staleClaimUseRejected.action = true; }
  const disposedSuccess = executeWithRecoveryBoundary({
    aggregate: disposedRecoveryAggregate,
    executor,
    registry,
    context: boundaryContext(
      disposedRecoveryAggregate,
      'attempt.runtime-recovery.disposed-claim.2',
      1,
      RECOVERED_AT,
      SUCCEEDED_AT
    )
  });
  staleClaimUseRejected.success = disposedSuccess.admitted === false;
  try {
    createRecoveryConvergenceReceipt(disposedRecoveryAggregate, { formedAt: SUCCEEDED_AT, registry });
  } catch { staleClaimUseRejected.convergence = true; }
  journeyStates.push('AGGREGATE_OWNED_RECOVERY_ACTION_APPLIED');
  journeyStates.push('SCHEDULER_CLAIM_LIFECYCLE_RECOVERY_HELD');

  let quarantineAggregate = createRecoveryAggregate({
    aggregateRef: 'aggregate.runtime-recovery.quarantine-proof',
    workNodeRef: node.workNodeRef,
    sourceStateFingerprint,
    schedulerGeneration: 1,
    retryBudget: registry.retryPolicy
  }, { registry });
  const quarantineScheduler = new SingleWorkerIntentScheduler({
    workerRef: runtimeOne.workerRef,
    schedulerInstanceRef: 'instance.intent-scheduler.runtime-recovery.quarantine',
    schedulerRegistry: bundle.schedulerRegistry,
    runtimeRecoveryRegistry: registry,
    runtimeAuthority: new WorkerLeaseAuthority({ sourceRef: runtimeOne.sourceRef })
  });
  const quarantineQueue = quarantineScheduler.admit(graph, optionsOne);
  const quarantineRunning = quarantineScheduler.leaseSelected({
    ...contextInput(1, { formedAt: FORMED, observedAt: OBSERVED }),
    leaseRef: 'context-lease.runtime-recovery.quarantine.1',
    cancellationTokenRef: 'cancellation-token.runtime-recovery.quarantine.1'
  });
  if (quarantineQueue.state !== 'ADMITTED' || !quarantineRunning.admitted) {
    throw new Error('quarantine proof did not receive its own scheduler-owned running lineage');
  }
  const quarantineExecutor = createDeterministicFaultInjector({
    registry,
    planRef: 'classifier-plan.runtime-recovery.simulation.quarantine',
    failures: [{ attempt: 1, failureClass: 'ROLLBACK_FAILED_SIMULATED', message: 'deterministic rollback and restore failure' }]
  });
  const quarantineFailure = executeWithRecoveryBoundary({
    aggregate: quarantineAggregate,
    executor: quarantineExecutor,
    registry,
    context: boundaryContext(quarantineAggregate, 'attempt.runtime-recovery.quarantine.1', 1, OBSERVED, FAILED_AT)
  });
  quarantineAggregate = quarantineFailure.aggregate;
  const quarantineCheckpointed = quarantineScheduler.checkpoint({
    checkpointRef: 'checkpoint.runtime-recovery.scheduler.quarantine.1',
    workNodeRef: node.workNodeRef,
    lastCompletedStep: 'typed-quarantine-failure-formed',
    selectedSourceRefs: ['blueprint/runtime-recovery-registry.json'],
    selectedContextRefs: [quarantineRunning.contextLease.leaseRef],
    producedArtifactRefs: [],
    producedReceiptRefs: [quarantineQueue.admissionReceipt.admissionReceiptRef],
    openQuestions: [],
    nextSafeAction: 'HOLD_QUARANTINE_FOR_REVIEW',
    pendingToolCallRef: 'NONE',
    sourceBindings,
    formedAt: FAILED_AT
  }, { releaseReceiptRef: 'release.runtime-recovery.checkpoint.quarantine.1', releasedAt: FAILED_AT });
  const quarantineClaimReceipt = createSchedulerRecoveryClaimReceipt({
    aggregate: quarantineAggregate,
    schedulerAggregate: quarantineScheduler.aggregate,
    schedulerCheckpoint: quarantineCheckpointed.checkpoint,
    formedAt: FAILED_AT,
    registry
  });
  const quarantineConsumption = quarantineScheduler.claimRecoveryCheckpoint(
    quarantineCheckpointed.checkpoint.checkpointRef,
    {
      recoveryClaimReceipt: quarantineClaimReceipt,
      observedAt: FAILED_AT
    }
  );
  const quarantineClaimedCurrentness = quarantineScheduler.recoveryClaimCurrentness(
    quarantineCheckpointed.checkpoint.checkpointRef,
    { observedAt: FAILED_AT }
  );
  const quarantineCheckpoint = createRecoveryCheckpoint({
    schedulerCheckpoint: quarantineCheckpointed.checkpoint,
    schedulerConsumptionReceipt: quarantineConsumption,
    aggregateRef: quarantineAggregate.aggregateRef,
    failureRef: quarantineFailure.failure.failureRef,
    failureFingerprint: quarantineFailure.failure.semanticFingerprint,
    sourceStateFingerprint,
    selectedSourceRanges: [{ sourceRef: 'blueprint/runtime-recovery-registry.json', start: 0, end: 1 }],
    preservedIntentRef: 'intent.runtime-recovery.simulation',
    preservedInterpretationRef: 'interpretation.runtime-recovery.simulation.quarantine',
    preservedUnknownRefs: ['unknown.runtime-recovery.none'],
    preservedAuthorityRef: 'authority.runtime-recovery.no-effect-only',
    returnRouteRef: node.returnRouteRef,
    formedAt: FAILED_AT
  });
  const quarantineAdmission = admitRecoveryCheckpoint(quarantineCheckpoint, quarantineAggregate, {
    schedulerCheckpoint: quarantineCheckpointed.checkpoint,
    schedulerConsumptionReceipt: quarantineConsumption,
    nextSchedulerGeneration: 2,
    currentSourceStateFingerprint: sourceStateFingerprint,
    observedAt: FAILED_AT,
    registry
  });
  quarantineAggregate = recordRecoveryCheckpointAdmission(
    quarantineAggregate,
    quarantineCheckpoint,
    quarantineAdmission,
    { schedulerConsumptionReceipt: quarantineConsumption, registry }
  );
  quarantineAggregate = recordSchedulerRecoveryClaimLifecycle(quarantineAggregate, {
    schedulerAggregate: quarantineScheduler.aggregate,
    schedulerClaimCurrentnessReceipt: quarantineClaimedCurrentness,
    registry
  });
  const quarantineSchedulerCurrentness = schedulerCurrentness(
    quarantineScheduler,
    quarantineCheckpointed.checkpoint.checkpointRef,
    RECOVERED_AT
  );
  const quarantineDecision = recordRecoveryPolicyDecision(quarantineAggregate, {
    checkpointAdmission: quarantineAdmission,
    observedAt: RECOVERED_AT,
    schedulerCurrentness: quarantineSchedulerCurrentness,
    registry
  });
  quarantineAggregate = quarantineDecision.aggregate;
  const quarantinedSourceTransaction = simulateTransactionalRecovery({
    adapter: createNoEffectTransactionalAdapter({
      adapterRef: 'adapter.runtime-recovery.no-effect.quarantine',
      initialState: { value: 'before' },
      attemptedState: { value: 'partial' },
      rollbackFails: true,
      restoreFails: true
    }),
    operationRef: quarantineFailure.failure.operationRef,
    expectedBeforeFingerprint: semanticHash({ value: 'before' }),
    rollbackReceiptRef: 'receipt.runtime-recovery.rollback.quarantine',
    lastKnownGoodRef: 'state.runtime-recovery.last-known-good.quarantine',
    observedAt: RECOVERED_AT
  });
  const quarantinedTransaction = createCycleBoundTransactionalRecoveryReceipt({
    aggregate: quarantineAggregate,
    transactionalRecoveryReceipt: quarantinedSourceTransaction,
    recoveryClaimReceipt: quarantineClaimReceipt,
    checkpointAdmission: quarantineAdmission,
    observedAt: RECOVERED_AT,
    schedulerCurrentness: quarantineSchedulerCurrentness,
    registry
  });
  quarantineAggregate = applyRecoveryAction({
    aggregate: quarantineAggregate,
    policyDecision: quarantineDecision.policyDecision,
    checkpointAdmission: quarantineAdmission,
    transactionalRecoveryReceipt: quarantinedTransaction,
    observedAt: RECOVERED_AT,
    schedulerCurrentness: quarantineSchedulerCurrentness,
    registry
  }).aggregate;
  const quarantineProjection = projectRecoveryAggregate(quarantineAggregate, {
    projectionObservedAt: RECOVERED_AT,
    schedulerCurrentness: quarantineSchedulerCurrentness,
    registry
  }).projection;
  if (quarantineProjection.health.state !== 'ATTENTION' || !quarantineProjection.guide.remainsBlocked) {
    throw new Error('aggregate-owned quarantine did not remain human-visible');
  }
  journeyStates.push('QUARANTINE_ATTENTION_OWNED');

  const representativeActions = [
    ['direct-timeout-retry', 'MODEL_TIMEOUT_SIMULATED', 'direct'],
    ['context-condensation', 'CONTEXT_BUDGET_EXCEEDED', 'context'],
    ['resource-reduced-retry', 'RESOURCE_EXHAUSTION_SIMULATED', 'resource'],
    ['transactional-rollback', 'PARTIAL_WRITE_SIMULATED', 'transaction'],
    ['last-known-good-restore', 'PROCESS_TERMINATED_SIMULATED', 'restore'],
    ['external-wait-resume', 'NETWORK_INTERRUPTION_SIMULATED', 'wait'],
    ['split-work-return', 'CONTEXT_BUDGET_EXCEEDED', 'split'],
    ['human-decision-hold', 'INVALID_STATE_TRANSITION', 'human'],
    ['terminal-block', 'STALE_OR_CORRUPTED_CHECKPOINT', 'terminal']
  ].map(([name, failureClass, mode]) => runRepresentativeActionBranch({
    name,
    failureClass,
    mode,
    bundle,
    registry,
    graph,
    node,
    trustSnapshot,
    sourceStateFingerprint
  }));

  const runtimeTwo = runtimeTrust(bundle.schedulerRegistry, resourceTwo, 2, {
    formedAt: FAILED_AT,
    observedAt: RECOVERED_AT
  });
  const resumed = scheduler.resume(checkpointed.checkpoint.checkpointRef, {
    graph,
    options: schedulerOptions({
      bundle, graph, node, trustSnapshot, resourceSnapshot: resourceTwo, runtimeTrustSnapshot: runtimeTwo,
      generation: 2, formedAt: FAILED_AT, observedAt: RECOVERED_AT
    }),
    sourceBindings,
    contextInput: contextInput(2, { formedAt: FAILED_AT, observedAt: RECOVERED_AT }),
    recovery: {
      checkpointConsumptionReceipt: schedulerConsumption,
      checkpointAdmission,
      actionReceipt: action.actionReceipt
    }
  });
  const schedulerAggregateAfterResume = structuredClone(scheduler.aggregate);
  const schedulerResumedCurrentness = scheduler.recoveryClaimCurrentness(
    checkpointed.checkpoint.checkpointRef,
    { observedAt: RECOVERED_AT }
  );
  aggregate = recordSchedulerRecoveryClaimLifecycle(aggregate, {
    schedulerAggregate: schedulerAggregateAfterResume,
    schedulerClaimCurrentnessReceipt: schedulerResumedCurrentness,
    registry
  });
  const resumedSchedulerCurrentness = {
    schedulerAggregate: schedulerAggregateAfterResume,
    schedulerClaimCurrentnessReceipt: schedulerResumedCurrentness
  };
  const continuation = createRecoveryContinuation({
    aggregate,
    checkpointAdmission,
    resumed,
    schedulerAggregate: schedulerAggregateAfterResume,
    schedulerInstanceRef: scheduler.schedulerInstanceRef,
    observedAt: RECOVERED_AT,
    schedulerCurrentness: resumedSchedulerCurrentness,
    registry
  });
  try {
    createRecoveryContinuation({
      aggregate: disposedRecoveryAggregate,
      checkpointAdmission,
      resumed,
      schedulerAggregate: schedulerAggregateAfterResume,
      schedulerInstanceRef: scheduler.schedulerInstanceRef,
      observedAt: RECOVERED_AT,
      schedulerCurrentness: resumedSchedulerCurrentness,
      registry
    });
  } catch { staleClaimUseRejected.continuation = true; }
  aggregate = continueRecoveryGeneration(aggregate, continuation, {
    schedulerCurrentness: resumedSchedulerCurrentness,
    registry
  });
  journeyStates.push('FRESH_GENERATION_AND_SIX_LEASES_CONTINUED');
  const succeeded = executeWithRecoveryBoundary({
    aggregate,
    executor,
    schedulerCurrentness: resumedSchedulerCurrentness,
    registry,
    context: boundaryContext(aggregate, 'attempt.runtime-recovery.simulation.2', 2, RECOVERED_AT, SUCCEEDED_AT)
  });
  if (succeeded.status !== 'SUCCEEDED') throw new Error('fresh scheduler generation retry did not succeed');
  aggregate = succeeded.aggregate;
  journeyStates.push('FRESH_GENERATION_RETRY_SUCCEEDED');

  const serialized = serializeRecoveryAggregate(aggregate, { registry });
  const restored = restoreRecoveryAggregate(serialized, { registry });
  if (restored.semanticFingerprint !== aggregate.semanticFingerprint) throw new Error('replayed aggregate did not restore exact state');
  const external = {
    eventRef: 'external-event.runtime-recovery.simulation.1',
    workNodeRef: restored.workNodeRef,
    schedulerGeneration: restored.schedulerGeneration,
    resultRef: 'result.runtime-recovery.simulation.1',
    observedAt: SUCCEEDED_AT
  };
  external.semanticFingerprint = semanticHash(external);
  const externalAdoption = createExternalRecoveryEventAdoptionReceipt({
    aggregate: restored,
    event: external,
    adoptedAt: SUCCEEDED_AT,
    schedulerCurrentness: resumedSchedulerCurrentness,
    registry
  });
  const acceptedExternal = recordExternalRecoveryEvent(restored, external, {
    adoptionReceipt: externalAdoption,
    schedulerCurrentness: resumedSchedulerCurrentness,
    registry
  });
  const duplicateExternal = recordExternalRecoveryEvent(acceptedExternal.aggregate, external, {
    adoptionReceipt: externalAdoption,
    schedulerCurrentness: resumedSchedulerCurrentness,
    registry
  });
  const staleExternalSource = {
    ...external,
    eventRef: 'external-event.runtime-recovery.simulation.stale',
    schedulerGeneration: 1
  };
  delete staleExternalSource.semanticFingerprint;
  staleExternalSource.semanticFingerprint = semanticHash(staleExternalSource);
  const staleExternal = recordExternalRecoveryEvent(acceptedExternal.aggregate, staleExternalSource, {
    adoptionReceipt: externalAdoption,
    schedulerCurrentness: resumedSchedulerCurrentness,
    registry
  });
  if (duplicateExternal.changed || staleExternal.changed) throw new Error('replay protection did not reject duplicate/stale event');
  aggregate = acceptedExternal.aggregate;
  journeyStates.push('REPLAY_DERIVED_AGGREGATE_RESTORED');

  const convergence = createRecoveryConvergenceReceipt(aggregate, {
    formedAt: SUCCEEDED_AT,
    schedulerCurrentness: resumedSchedulerCurrentness,
    registry
  });
  aggregate = recordRecoveryConvergence(aggregate, convergence, {
    schedulerCurrentness: resumedSchedulerCurrentness,
    registry
  });
  const completed = scheduler.completeActive({
    graph,
    intentRegistry: bundle.intentRegistry,
    trustSnapshot,
    registeredProcessRefs: bundle.factory.processes.map((item) => item.processRef),
    registeredRoleRefs: bundle.blueprint.roles.map((item) => item.roleRef),
    completionEvidence: completionEvidence(node, graph, runtimeTwo, scheduler, convergence),
    completionReceiptRef: 'receipt.runtime-recovery.scheduler-completion.2',
    releaseReceiptRef: 'release.runtime-recovery.scheduler-completion.2',
    completedAt: COMPLETED_AT
  });
  const schedulerTerminalCurrentness = scheduler.recoveryClaimCurrentness(
    checkpointed.checkpoint.checkpointRef,
    { observedAt: COMPLETED_AT }
  );
  aggregate = recordSchedulerRecoveryClaimLifecycle(aggregate, {
    schedulerAggregate: scheduler.aggregate,
    schedulerClaimCurrentnessReceipt: schedulerTerminalCurrentness,
    registry
  });
  const terminalSchedulerCurrentness = {
    schedulerAggregate: scheduler.aggregate,
    schedulerClaimCurrentnessReceipt: schedulerTerminalCurrentness
  };
  const convergedAggregate = aggregate;
  const closed = closeRecoveredExecution({
    aggregate,
    successExecution: succeeded,
    schedulerEvidence: {
      schedulerCheckpoint: checkpointed.checkpoint,
      completionVerification: completed.completionVerification,
      completionEvidenceLineage: completed.completionEvidenceLineage,
      workgraphTransition: completed.canonicalWorkgraphTransition,
      completionReceipt: completed.completionReceipt,
      returnRouteReceipt: completed.returnRouteReceipt
    },
    completedAt: COMPLETED_AT,
    schedulerCurrentness: terminalSchedulerCurrentness,
    registry
  });
  aggregate = closed.aggregate;
  journeyStates.push('WORKGRAPH_CAUSAL_RECOVERY_VERIFIED');
  journeyStates.push('TERMINAL_RECOVERY_CLOSED');
  const projection = projectRecoveryAggregate(aggregate, {
    projectionObservedAt: COMPLETED_AT,
    schedulerCurrentness: terminalSchedulerCurrentness,
    registry
  }).projection;
  const noOp = projectRecoveryAggregate(aggregate, {
    priorProjection: projection,
    projectionObservedAt: COMPLETED_AT,
    schedulerCurrentness: terminalSchedulerCurrentness,
    registry
  });
  if (noOp.changed || !projection.guide.whatFailed || !projection.guide.recoveryRoute || !projection.guide.terminalProofRef) {
    throw new Error('completed projection lost recovery evidence or semantic no-op behavior');
  }
  journeyStates.push('HUMAN_PROJECTIONS_RETAIN_RECOVERY_EVIDENCE');

  const firstCycle = aggregate.recoveryCycleHistory[0];
  const firstTerminal = aggregate.terminalRecoveryReceipts.find((item) =>
    item.recoveryCycleRef === firstCycle.recoveryCycleRef);
  const cycleTwoGraphFormation = createRecoveryGraph(bundle, registry, trustSnapshot);
  const cycleTwoResource = runtimeResource(2, sourceStateFingerprint, {
    formedAt: COMPLETED_AT,
    observedAt: CYCLE_TWO_STARTED_AT,
    cpuLoadPct: 10,
    ramAvailableMb: 8192
  });
  const cycleTwoRuntime = runtimeTrust(bundle.schedulerRegistry, cycleTwoResource, 2, {
    formedAt: COMPLETED_AT,
    observedAt: CYCLE_TWO_STARTED_AT
  });
  const cycleTwoScheduler = new SingleWorkerIntentScheduler({
    workerRef: cycleTwoRuntime.workerRef,
    schedulerInstanceRef: 'instance.intent-scheduler.runtime-recovery.cycle-two',
    schedulerRegistry: bundle.schedulerRegistry,
    runtimeRecoveryRegistry: registry,
    runtimeAuthority: new WorkerLeaseAuthority({ sourceRef: cycleTwoRuntime.sourceRef })
  });
  const cycleTwoQueue = cycleTwoScheduler.admit(cycleTwoGraphFormation.graph, schedulerOptions({
    bundle,
    graph: cycleTwoGraphFormation.graph,
    node: cycleTwoGraphFormation.node,
    trustSnapshot,
    resourceSnapshot: cycleTwoResource,
    runtimeTrustSnapshot: cycleTwoRuntime,
    generation: 2,
    formedAt: COMPLETED_AT,
    observedAt: CYCLE_TWO_STARTED_AT
  }));
  const cycleTwoRunning = cycleTwoScheduler.leaseSelected({
    ...contextInput(2, { formedAt: COMPLETED_AT, observedAt: CYCLE_TWO_STARTED_AT }),
    leaseRef: 'context-lease.runtime-recovery.cycle-two.2',
    cancellationTokenRef: 'cancellation-token.runtime-recovery.cycle-two.2'
  });
  if (cycleTwoQueue.state !== 'ADMITTED' || !cycleTwoRunning.admitted) {
    throw new Error('second recovery cycle scheduler lineage was not admitted');
  }
  const cycleTwoExecutor = createDeterministicFaultInjector({
    registry,
    planRef: 'classifier-plan.runtime-recovery.simulation.main',
    failures: [{ attempt: 1, failureClass: 'PARTIAL_WRITE_SIMULATED', message: 'same-operation cycle recurrence' }],
    successValue: { state: 'PASS', partialEffectState: 'NONE', outputRef: 'output.runtime-recovery.cycle-two' }
  });
  const cycleTwoFailure = executeWithRecoveryBoundary({
    aggregate,
    executor: cycleTwoExecutor,
    registry,
    context: boundaryContext(aggregate, 'attempt.runtime-recovery.simulation.cycle-two.1', 2,
      CYCLE_TWO_STARTED_AT, CYCLE_TWO_FAILED_AT)
  });
  if (cycleTwoFailure.status !== 'FAILED_RECOVERABLE') throw new Error('second recovery cycle was not activated');
  let cycleIsolationAggregate = cycleTwoFailure.aggregate;
  const cycleTwoPreCheckpointProjection = projectRecoveryAggregate(cycleIsolationAggregate, { registry }).projection;
  const priorPreservationFingerprint = projection.guide.whatWasPreserved;
  const preCheckpointHistoricalPreservationRejected =
    cycleTwoPreCheckpointProjection.guide.whatWasPreserved === null &&
    cycleTwoPreCheckpointProjection.guide.preservationState === 'AWAITING_CURRENT_CYCLE_EVIDENCE' &&
    cycleTwoPreCheckpointProjection.guide.whatWasPreserved !== priorPreservationFingerprint;
  const cycleTwoCheckpointed = cycleTwoScheduler.checkpoint({
    checkpointRef: 'checkpoint.runtime-recovery.scheduler.cycle-two.2',
    workNodeRef: cycleTwoGraphFormation.node.workNodeRef,
    lastCompletedStep: 'same-operation-second-cycle-failure-formed',
    selectedSourceRefs: ['blueprint/runtime-recovery-registry.json'],
    selectedContextRefs: [cycleTwoRunning.contextLease.leaseRef],
    producedArtifactRefs: [],
    producedReceiptRefs: [cycleTwoQueue.admissionReceipt.admissionReceiptRef],
    openQuestions: [],
    nextSafeAction: 'PROVE_CURRENT_CYCLE_ONLY',
    pendingToolCallRef: 'NONE',
    sourceBindings,
    formedAt: CYCLE_TWO_FAILED_AT
  }, { releaseReceiptRef: 'release.runtime-recovery.checkpoint.cycle-two.2', releasedAt: CYCLE_TWO_FAILED_AT });
  const cycleTwoClaim = createSchedulerRecoveryClaimReceipt({
    aggregate: cycleIsolationAggregate,
    schedulerAggregate: cycleTwoScheduler.aggregate,
    schedulerCheckpoint: cycleTwoCheckpointed.checkpoint,
    formedAt: CYCLE_TWO_FAILED_AT,
    registry
  });
  const cycleTwoConsumption = cycleTwoScheduler.claimRecoveryCheckpoint(cycleTwoCheckpointed.checkpoint.checkpointRef, {
    recoveryClaimReceipt: cycleTwoClaim,
    observedAt: CYCLE_TWO_FAILED_AT
  });
  const cycleTwoClaimedCurrentness = cycleTwoScheduler.recoveryClaimCurrentness(
    cycleTwoCheckpointed.checkpoint.checkpointRef,
    { observedAt: CYCLE_TWO_FAILED_AT }
  );
  const cycleTwoCheckpoint = createRecoveryCheckpoint({
    schedulerCheckpoint: cycleTwoCheckpointed.checkpoint,
    schedulerConsumptionReceipt: cycleTwoConsumption,
    aggregateRef: cycleIsolationAggregate.aggregateRef,
    failureRef: cycleTwoFailure.failure.failureRef,
    failureFingerprint: cycleTwoFailure.failure.semanticFingerprint,
    sourceStateFingerprint,
    selectedSourceRanges: [{ sourceRef: 'blueprint/runtime-recovery-registry.json', start: 0, end: 1 }],
    preservedIntentRef: 'intent.runtime-recovery.simulation',
    preservedInterpretationRef: 'interpretation.runtime-recovery.simulation.cycle-two',
    preservedUnknownRefs: ['unknown.runtime-recovery.none'],
    preservedAuthorityRef: 'authority.runtime-recovery.no-effect-only',
    returnRouteRef: cycleTwoGraphFormation.node.returnRouteRef,
    formedAt: CYCLE_TWO_FAILED_AT
  });
  const cycleTwoAdmission = admitRecoveryCheckpoint(cycleTwoCheckpoint, cycleIsolationAggregate, {
    schedulerCheckpoint: cycleTwoCheckpointed.checkpoint,
    schedulerConsumptionReceipt: cycleTwoConsumption,
    nextSchedulerGeneration: 3,
    currentSourceStateFingerprint: sourceStateFingerprint,
    observedAt: CYCLE_TWO_FAILED_AT,
    registry
  });
  cycleIsolationAggregate = recordRecoveryCheckpointAdmission(
    cycleIsolationAggregate,
    cycleTwoCheckpoint,
    cycleTwoAdmission,
    { schedulerConsumptionReceipt: cycleTwoConsumption, registry }
  );
  cycleIsolationAggregate = recordSchedulerRecoveryClaimLifecycle(cycleIsolationAggregate, {
    schedulerAggregate: cycleTwoScheduler.aggregate,
    schedulerClaimCurrentnessReceipt: cycleTwoClaimedCurrentness,
    registry
  });
  const cycleTwoSchedulerCurrentness = schedulerCurrentness(
    cycleTwoScheduler,
    cycleTwoCheckpointed.checkpoint.checkpointRef,
    CYCLE_TWO_ACTION_AT
  );
  const cycleTwoDecision = recordRecoveryPolicyDecision(cycleIsolationAggregate, {
    checkpointAdmission: cycleTwoAdmission,
    authorityBoundary: 'CHANGED',
    observedAt: CYCLE_TWO_ACTION_AT,
    schedulerCurrentness: cycleTwoSchedulerCurrentness,
    registry
  });
  const priorContextEvidence = representativeActions.find((item) => item.name === 'context-condensation').contextProof;
  const priorResourceEvidence = representativeActions.find((item) => item.name === 'resource-reduced-retry').resourceProof;
  const priorWaitEvidence = representativeActions.find((item) => item.name === 'external-wait-resume').waitResumeReceipt;
  const priorTransactionEvidence = transaction;
  const historicalEvidenceFingerprints = {
    context: priorContextEvidence.semanticFingerprint,
    resource: priorResourceEvidence.semanticFingerprint,
    wait: priorWaitEvidence.semanticFingerprint,
    transaction: priorTransactionEvidence.semanticFingerprint
  };
  let priorContextEvidenceRejected = false;
  try {
    recordRecoveryPolicyDecision(cycleIsolationAggregate, {
      checkpointAdmission: cycleTwoAdmission,
      contextAdmissionReceipt: priorContextEvidence,
      authorityBoundary: 'CHANGED',
      observedAt: CYCLE_TWO_ACTION_AT,
      schedulerCurrentness: cycleTwoSchedulerCurrentness,
      registry
    });
  } catch {
    priorContextEvidenceRejected = true;
  }
  let priorResourceEvidenceRejected = false;
  try {
    recordRecoveryPolicyDecision(cycleIsolationAggregate, {
      checkpointAdmission: cycleTwoAdmission,
      resourceAdmissionReceipt: priorResourceEvidence,
      authorityBoundary: 'CHANGED',
      observedAt: CYCLE_TWO_ACTION_AT,
      schedulerCurrentness: cycleTwoSchedulerCurrentness,
      registry
    });
  } catch {
    priorResourceEvidenceRejected = true;
  }
  let priorWaitEvidenceRejected = false;
  try {
    applyRecoveryAction({
      aggregate: cycleTwoDecision.aggregate,
      policyDecision: cycleTwoDecision.policyDecision,
      checkpointAdmission: cycleTwoAdmission,
      waitResumeReceipt: priorWaitEvidence,
      observedAt: CYCLE_TWO_ACTION_AT,
      schedulerCurrentness: cycleTwoSchedulerCurrentness,
      registry
    });
  } catch {
    priorWaitEvidenceRejected = true;
  }
  let priorTransactionEvidenceRejected = false;
  try {
    applyRecoveryAction({
      aggregate: cycleTwoDecision.aggregate,
      policyDecision: cycleTwoDecision.policyDecision,
      checkpointAdmission: cycleTwoAdmission,
      transactionalRecoveryReceipt: priorTransactionEvidence,
      observedAt: CYCLE_TWO_ACTION_AT,
      schedulerCurrentness: cycleTwoSchedulerCurrentness,
      registry
    });
  } catch {
    priorTransactionEvidenceRejected = true;
  }
  let unscopedTransactionRejected = false;
  try {
    applyRecoveryAction({
      aggregate: cycleTwoDecision.aggregate,
      policyDecision: cycleTwoDecision.policyDecision,
      checkpointAdmission: cycleTwoAdmission,
      transactionalRecoveryReceipt: sourceTransaction,
      observedAt: CYCLE_TWO_ACTION_AT,
      schedulerCurrentness: cycleTwoSchedulerCurrentness,
      registry
    });
  } catch {
    unscopedTransactionRejected = true;
  }
  const readdressedTransaction = structuredClone(priorTransactionEvidence);
  readdressedTransaction.recoveryCycleRef = cycleTwoDecision.aggregate.activeRecoveryCycle.recoveryCycleRef;
  readdressedTransaction.recoveryCycleFingerprint = cycleTwoDecision.aggregate.activeRecoveryCycle.semanticFingerprint;
  delete readdressedTransaction.cycleTransactionReceiptRef;
  delete readdressedTransaction.semanticFingerprint;
  readdressedTransaction.semanticFingerprint = semanticHash(readdressedTransaction);
  readdressedTransaction.cycleTransactionReceiptRef =
    `receipt.runtime-recovery.cycle-transaction.${readdressedTransaction.semanticFingerprint.slice(0, 32)}`;
  let readdressedTransactionRejected = false;
  try {
    applyRecoveryAction({
      aggregate: cycleTwoDecision.aggregate,
      policyDecision: cycleTwoDecision.policyDecision,
      checkpointAdmission: cycleTwoAdmission,
      transactionalRecoveryReceipt: readdressedTransaction,
      observedAt: CYCLE_TWO_ACTION_AT,
      schedulerCurrentness: cycleTwoSchedulerCurrentness,
      registry
    });
  } catch {
    readdressedTransactionRejected = true;
  }
  const staleSourceTransaction = simulateTransactionalRecovery({
    adapter: createNoEffectTransactionalAdapter({
      initialState: { value: 'before-cycle-two' },
      attemptedState: { value: 'partial-cycle-two' }
    }),
    operationRef: cycleTwoFailure.failure.operationRef,
    expectedBeforeFingerprint: semanticHash({ value: 'before-cycle-two' }),
    rollbackReceiptRef: 'receipt.runtime-recovery.rollback.cycle-two.stale',
    lastKnownGoodRef: 'state.runtime-recovery.last-known-good.cycle-two.stale',
    observedAt: CYCLE_TWO_STARTED_AT
  });
  let staleTransactionFormationRejected = false;
  try {
    createCycleBoundTransactionalRecoveryReceipt({
      aggregate: cycleTwoDecision.aggregate,
      transactionalRecoveryReceipt: staleSourceTransaction,
      recoveryClaimReceipt: cycleTwoClaim,
      checkpointAdmission: cycleTwoAdmission,
      observedAt: CYCLE_TWO_ACTION_AT,
      schedulerCurrentness: cycleTwoSchedulerCurrentness,
      registry
    });
  } catch {
    staleTransactionFormationRejected = true;
  }
  const sameRefDifferentContentTransaction = structuredClone(priorTransactionEvidence);
  sameRefDifferentContentTransaction.recoveryCycleRef = cycleTwoDecision.aggregate.activeRecoveryCycle.recoveryCycleRef;
  sameRefDifferentContentTransaction.recoveryCycleFingerprint = cycleTwoDecision.aggregate.activeRecoveryCycle.semanticFingerprint;
  const sameRefCandidate = structuredClone(sameRefDifferentContentTransaction);
  delete sameRefCandidate.cycleTransactionReceiptRef;
  delete sameRefCandidate.semanticFingerprint;
  sameRefDifferentContentTransaction.semanticFingerprint = semanticHash(sameRefCandidate);
  let sameRefDifferentContentTransactionRejected = false;
  try {
    applyRecoveryAction({
      aggregate: cycleTwoDecision.aggregate,
      policyDecision: cycleTwoDecision.policyDecision,
      checkpointAdmission: cycleTwoAdmission,
      transactionalRecoveryReceipt: sameRefDifferentContentTransaction,
      observedAt: CYCLE_TWO_ACTION_AT,
      schedulerCurrentness: cycleTwoSchedulerCurrentness,
      registry
    });
  } catch {
    sameRefDifferentContentTransactionRejected = true;
  }
  const cycleTwoAction = applyRecoveryAction({
    aggregate: cycleTwoDecision.aggregate,
    policyDecision: cycleTwoDecision.policyDecision,
    checkpointAdmission: cycleTwoAdmission,
    observedAt: CYCLE_TWO_ACTION_AT,
    schedulerCurrentness: cycleTwoSchedulerCurrentness,
    registry
  });
  cycleIsolationAggregate = cycleTwoAction.aggregate;
  let priorCycleConvergenceRejected = false;
  try {
    recordRecoveryConvergence(cycleIsolationAggregate, convergence, {
      schedulerCurrentness: cycleTwoSchedulerCurrentness,
      registry
    });
  } catch {
    priorCycleConvergenceRejected = true;
  }
  let priorCycleTerminalRejected = false;
  try {
    closeRecoveredExecution({
      aggregate: cycleIsolationAggregate,
      successExecution: succeeded,
      schedulerEvidence: {
        schedulerCheckpoint: checkpointed.checkpoint,
        completionVerification: completed.completionVerification,
        completionEvidenceLineage: completed.completionEvidenceLineage,
        workgraphTransition: completed.canonicalWorkgraphTransition,
        completionReceipt: completed.completionReceipt,
        returnRouteReceipt: completed.returnRouteReceipt
      },
      completedAt: CYCLE_TWO_ACTION_AT,
      schedulerCurrentness: cycleTwoSchedulerCurrentness,
      registry
    });
  } catch {
    priorCycleTerminalRejected = true;
  }
  const prematureCycleTwoSuccess = executeWithRecoveryBoundary({
    aggregate: cycleIsolationAggregate,
    executor: cycleTwoExecutor,
    schedulerCurrentness: cycleTwoSchedulerCurrentness,
    registry,
    context: boundaryContext(cycleIsolationAggregate, 'attempt.runtime-recovery.simulation.cycle-two.2', 2,
      CYCLE_TWO_ACTION_AT, '2026-08-01T00:00:10.000Z')
  });
  const cycleIsolationProjection = projectRecoveryAggregate(cycleIsolationAggregate, {
    projectionObservedAt: CYCLE_TWO_ACTION_AT,
    schedulerCurrentness: cycleTwoSchedulerCurrentness,
    registry
  }).projection;
  const secondCycle = cycleIsolationAggregate.activeRecoveryCycle;
  const recoveryCycleIsolationProof = {
    aggregateRef: cycleIsolationAggregate.aggregateRef,
    recoveryCycleCount: cycleIsolationAggregate.recoveryCycleHistory.length,
    firstRecoveryCycleRef: firstCycle.recoveryCycleRef,
    firstRecoveryCycleFingerprint: firstCycle.semanticFingerprint,
    firstTerminalCycleRef: firstTerminal?.recoveryCycleRef ?? null,
    firstTerminalFingerprint: firstTerminal?.semanticFingerprint ?? null,
    secondRecoveryCycleRef: secondCycle.recoveryCycleRef,
    secondRecoveryCycleFingerprint: secondCycle.semanticFingerprint,
    priorCycleFingerprint: secondCycle.priorRecoveryCycleFingerprint,
    sameFailureClassRecurrence: failed.failure.failureClass === cycleTwoFailure.failure.failureClass,
    sameOperationRecurrence: failed.failure.operationRef === cycleTwoFailure.failure.operationRef,
    firstAction: action.actionReceipt.action,
    secondAction: cycleTwoAction.actionReceipt.action,
    differentActionRecovery: action.actionReceipt.action !== cycleTwoAction.actionReceipt.action,
    priorCycleConvergenceRejected,
    priorCycleTerminalRejected,
    prematureCurrentSuccessRejected: prematureCycleTwoSuccess.admitted === false,
    historicalTerminalIntact: cycleIsolationAggregate.terminalRecoveryReceipts.some((item) =>
      item.semanticFingerprint === firstTerminal?.semanticFingerprint),
    currentProjectionCycleRef: cycleIsolationProjection.queue.activeRecoveryCycleRef,
    currentProjectionTerminalProofRef: cycleIsolationProjection.guide.terminalProofRef,
    currentProjectionState: cycleIsolationProjection.health.state
  };
  const exactCycleLocalEvidenceProof = {
    firstRecoveryCycleRef: firstCycle.recoveryCycleRef,
    secondRecoveryCycleRef: secondCycle.recoveryCycleRef,
    sameFailureClassRecurrence: recoveryCycleIsolationProof.sameFailureClassRecurrence,
    sameOperationRecurrence: recoveryCycleIsolationProof.sameOperationRecurrence,
    preCheckpointHistoricalPreservationRejected,
    preCheckpointPreservationState: cycleTwoPreCheckpointProjection.guide.preservationState,
    preCheckpointWhatWasPreserved: cycleTwoPreCheckpointProjection.guide.whatWasPreserved,
    priorTransactionEvidenceRejected,
    unscopedTransactionRejected,
    readdressedTransactionRejected,
    staleTransactionFormationRejected,
    sameRefDifferentContentTransactionRejected,
    priorContextEvidenceRejected,
    priorResourceEvidenceRejected,
    priorWaitEvidenceRejected,
    historicalEvidenceFingerprints,
    historicalEvidenceIntact:
      priorContextEvidence.semanticFingerprint === historicalEvidenceFingerprints.context &&
      priorResourceEvidence.semanticFingerprint === historicalEvidenceFingerprints.resource &&
      priorWaitEvidence.semanticFingerprint === historicalEvidenceFingerprints.wait &&
      priorTransactionEvidence.semanticFingerprint === historicalEvidenceFingerprints.transaction,
    currentCycleControlledDisposition: cycleIsolationAggregate.phase,
    currentProjectionCycleRef: cycleIsolationProjection.queue.activeRecoveryCycleRef
  };
  journeyStates.push('EXACT_CYCLE_LOCAL_EVIDENCE_REJECTED');

  const rejectCoordinatedEdgeForgery = (source, type, evidenceField, refField, prefix, mutate) => {
    const candidate = structuredClone(source);
    const transition = candidate.recoveryClaimLedger.find((item) => item.type === type);
    const edge = transition.edgeEvidence;
    const evidence = edge[evidenceField];
    mutate(evidence);
    delete evidence[refField];
    delete evidence.semanticFingerprint;
    evidence.semanticFingerprint = semanticHash(evidence);
    evidence[refField] = `${prefix}${evidence.semanticFingerprint.slice(0, 32)}`;
    delete edge.evidenceRef;
    delete edge.semanticFingerprint;
    edge.semanticFingerprint = semanticHash(edge);
    edge.evidenceRef = `evidence.intent-scheduler.recovery-claim.${
      type.toLowerCase().replaceAll('_', '-')
    }.${edge.semanticFingerprint.slice(0, 32)}`;
    transition.edgeEvidenceRef = edge.evidenceRef;
    transition.edgeEvidenceFingerprint = edge.semanticFingerprint;
    delete transition.transitionRef;
    delete transition.semanticFingerprint;
    transition.semanticFingerprint = semanticHash(transition);
    transition.transitionRef = `transition.intent-scheduler.recovery-claim.${
      type.toLowerCase().replaceAll('_', '-')
    }.${transition.semanticFingerprint.slice(0, 32)}`;
    const claimPointer = candidate.recoveryClaims.find((item) => item.checkpointRef === transition.checkpointRef);
    if (claimPointer?.state === type) {
      claimPointer.lastTransitionRef = transition.transitionRef;
      claimPointer.lastTransitionFingerprint = transition.semanticFingerprint;
      claimPointer.edgeEvidenceRef = edge.evidenceRef;
      claimPointer.edgeEvidenceFingerprint = edge.semanticFingerprint;
    }
    delete candidate.semanticFingerprint;
    candidate.semanticFingerprint = semanticHash(candidate);
    try {
      new SingleWorkerIntentScheduler({
        workerRef: runtimeOne.workerRef,
        schedulerInstanceRef: `instance.intent-scheduler.runtime-recovery.forged-${type.toLowerCase()}`,
        schedulerRegistry: bundle.schedulerRegistry,
        runtimeRecoveryRegistry: registry,
        runtimeAuthority: new WorkerLeaseAuthority({ sourceRef: runtimeOne.sourceRef }),
        schedulerAggregate: candidate
      });
      return false;
    } catch {
      return true;
    }
  };
  const coordinatedResumeEdgeForgeryRejected = rejectCoordinatedEdgeForgery(
    scheduler.aggregate,
    'RESUMED_CONSUMED',
    'schedulerResumeEvidence',
    'resumeEvidenceRef',
    'evidence.intent-scheduler.recovery-resume.',
    (evidence) => {
      evidence.queue.state = 'BLOCKED';
      delete evidence.queue.semanticFingerprint;
      evidence.queue.semanticFingerprint = semanticHash(evidence.queue);
    }
  );
  const coordinatedTerminalEdgeForgeryRejected = rejectCoordinatedEdgeForgery(
    scheduler.aggregate,
    'TERMINAL_CONSUMED',
    'schedulerTerminalEvidence',
    'terminalEvidenceRef',
    'evidence.intent-scheduler.recovery-terminal.',
    (evidence) => {
      evidence.terminalQueue.state = 'BLOCKED';
      delete evidence.terminalQueue.semanticFingerprint;
      evidence.terminalQueue.semanticFingerprint = semanticHash(evidence.terminalQueue);
    }
  );
  const coordinatedDispositionEdgeForgeryRejected = rejectCoordinatedEdgeForgery(
    preResumeDispositionSnapshot,
    'INVALIDATED_OR_ABANDONED',
    'schedulerDispositionReceipt',
    'dispositionReceiptRef',
    'receipt.intent-scheduler.recovery-claim-disposition.',
    (evidence) => { evidence.reasonRef = 'reason.intent-scheduler.recovery.forged-disposition'; }
  );

  const rejectCoordinatedPriorStateForgery = (source, mutate, {
    retainStateSliceRef = false,
    retainPriorStateReceiptRef = false
  } = {}) => {
    const candidate = structuredClone(source);
    const transition = candidate.recoveryClaimLedger.at(-1);
    const edge = transition.edgeEvidence;
    const receipt = edge.schedulerPriorStateReceipt;
    const slice = receipt.schedulerStateSlice;
    mutate(slice, receipt);
    const priorEvidence = slice.recoveryClaimPriorTransitionEvidence ?? null;
    delete slice.semanticFingerprint;
    if (!retainStateSliceRef) delete slice.stateSliceRef;
    slice.semanticFingerprint = semanticHash(slice);
    if (!retainStateSliceRef) {
      slice.stateSliceRef = `state-slice.intent-scheduler.recovery-prior.${slice.semanticFingerprint.slice(0, 32)}`;
    }
    receipt.schedulerStateSliceRef = slice.stateSliceRef;
    receipt.schedulerStateSliceFingerprint = slice.semanticFingerprint;
    receipt.priorClaimTransitionEvidenceRef = priorEvidence?.transitionEvidenceRef ?? null;
    receipt.priorClaimTransitionEvidenceFingerprint = priorEvidence?.semanticFingerprint ?? null;
    delete receipt.semanticFingerprint;
    if (!retainPriorStateReceiptRef) delete receipt.priorStateReceiptRef;
    receipt.semanticFingerprint = semanticHash(receipt);
    if (!retainPriorStateReceiptRef) {
      receipt.priorStateReceiptRef =
        `receipt.intent-scheduler.recovery-prior-state.${receipt.semanticFingerprint.slice(0, 32)}`;
    }
    edge.schedulerPriorStateReceiptRef = receipt.priorStateReceiptRef;
    edge.schedulerPriorStateReceiptFingerprint = receipt.semanticFingerprint;
    delete edge.evidenceRef;
    delete edge.semanticFingerprint;
    edge.semanticFingerprint = semanticHash(edge);
    edge.evidenceRef = `evidence.intent-scheduler.recovery-claim.${
      transition.type.toLowerCase().replaceAll('_', '-')
    }.${edge.semanticFingerprint.slice(0, 32)}`;
    transition.schedulerPriorStateReceiptRef = receipt.priorStateReceiptRef;
    transition.schedulerPriorStateReceiptFingerprint = receipt.semanticFingerprint;
    transition.edgeEvidenceRef = edge.evidenceRef;
    transition.edgeEvidenceFingerprint = edge.semanticFingerprint;
    delete transition.transitionRef;
    delete transition.semanticFingerprint;
    transition.semanticFingerprint = semanticHash(transition);
    transition.transitionRef = `transition.intent-scheduler.recovery-claim.${
      transition.type.toLowerCase().replaceAll('_', '-')
    }.${transition.semanticFingerprint.slice(0, 32)}`;
    const claimPointer = candidate.recoveryClaims.find((item) => item.checkpointRef === transition.checkpointRef);
    if (claimPointer?.state === transition.type) {
      claimPointer.lastTransitionRef = transition.transitionRef;
      claimPointer.lastTransitionFingerprint = transition.semanticFingerprint;
      claimPointer.edgeEvidenceRef = edge.evidenceRef;
      claimPointer.edgeEvidenceFingerprint = edge.semanticFingerprint;
    }
    delete candidate.semanticFingerprint;
    candidate.semanticFingerprint = semanticHash(candidate);
    try {
      new SingleWorkerIntentScheduler({
        workerRef: runtimeOne.workerRef,
        schedulerInstanceRef: 'instance.intent-scheduler.runtime-recovery.forged-prior-state',
        schedulerRegistry: bundle.schedulerRegistry,
        runtimeRecoveryRegistry: registry,
        runtimeAuthority: new WorkerLeaseAuthority({ sourceRef: runtimeOne.sourceRef }),
        schedulerAggregate: candidate
      });
      return false;
    } catch {
      return true;
    }
  };

  const boundedPriorStateContract = bundle.schedulerRegistry.runtimeRecoveryClaimContract.boundedPriorStateProof;
  const normalClaimTransitions = scheduler.aggregate.recoveryClaimLedger;
  const invalidatedClaimTransitions = preResumeDispositionSnapshot.recoveryClaimLedger;
  const priorStateReceipts = [...normalClaimTransitions, ...invalidatedClaimTransitions]
    .map((item) => item.edgeEvidence.schedulerPriorStateReceipt);
  const serializedSchedulerStateBytes = [
    schedulerClaimedSnapshot,
    schedulerAggregateAfterResume,
    scheduler.aggregate,
    preResumeDispositionSnapshot
  ].map((item) => Buffer.byteLength(JSON.stringify(item), 'utf8'));
  const additionalAggregateBytesPerTransition = [
    serializedSchedulerStateBytes[1] - serializedSchedulerStateBytes[0],
    serializedSchedulerStateBytes[2] - serializedSchedulerStateBytes[1],
    serializedSchedulerStateBytes[3] - serializedSchedulerStateBytes[0]
  ];
  const priorStateReceiptBytes = priorStateReceipts
    .map((item) => Buffer.byteLength(JSON.stringify(item), 'utf8'));
  const priorStateSliceBytes = priorStateReceipts
    .map((item) => Buffer.byteLength(JSON.stringify(item.schedulerStateSlice), 'utf8'));
  const maximumLeaseBindingCount = Math.max(
    ...priorStateReceipts.map((item) => item.schedulerStateSlice.leaseLedgerBindings.length)
  );
  const noNestedStateSlices = priorStateReceipts.every((item) =>
    !containsNamedProperty(item.schedulerStateSlice, 'schedulerStateSlice') &&
    !containsNamedProperty(item.schedulerStateSlice, 'schedulerStateSnapshot')
  );
  const noPriorEdgeReceiptsInsideStateSlice = priorStateReceipts.every((item) =>
    !containsNamedProperty(item.schedulerStateSlice, 'schedulerPriorStateReceipt')
  );
  const maximumNestedStateSliceCount = Math.max(...priorStateReceipts.map((item) =>
    countNamedProperties(item.schedulerStateSlice, ['schedulerStateSlice', 'schedulerStateSnapshot'])
  ));
  const maximumPriorEdgeReceiptCount = Math.max(...priorStateReceipts.map((item) =>
    countNamedProperties(item.schedulerStateSlice, ['schedulerPriorStateReceipt'])
  ));
  const exactPriorAggregateAndTransitionBound = [...normalClaimTransitions, ...invalidatedClaimTransitions]
    .every((transition) => {
      const receipt = transition.edgeEvidence.schedulerPriorStateReceipt;
      const slice = receipt.schedulerStateSlice;
      return receipt.schedulerAggregateFingerprint === slice.schedulerAggregateFingerprint &&
        receipt.priorClaimLedgerLength === slice.recoveryClaimLedgerLength &&
        receipt.priorClaimTransitionFingerprint === slice.recoveryClaimPriorTransitionFingerprint;
    });
  const exactPriorTransitionEvidenceBound = [normalClaimTransitions, invalidatedClaimTransitions]
    .every((ledger) => ledger.every((transition, index) => {
      const slice = transition.edgeEvidence.schedulerPriorStateReceipt.schedulerStateSlice;
      const evidence = slice.recoveryClaimPriorTransitionEvidence;
      if (index === 0) {
        return evidence === null && slice.recoveryClaimPriorTransitionRef === null &&
          slice.recoveryClaimPriorTransitionFingerprint === null;
      }
      const prior = ledger[index - 1];
      return evidence?.transitionRef === prior.transitionRef &&
        evidence?.transitionFingerprint === prior.semanticFingerprint &&
        evidence?.transitionType === prior.type && evidence?.transitionSequence === prior.sequence &&
        evidence?.priorTransitionFingerprint === prior.priorTransitionFingerprint &&
        evidence?.edgeEvidenceRef === prior.edgeEvidenceRef &&
        evidence?.edgeEvidenceFingerprint === prior.edgeEvidenceFingerprint &&
        evidence?.checkpointRef === prior.checkpointRef && evidence?.observedAt === prior.observedAt &&
        slice.recoveryClaimPriorTransitionRef === prior.transitionRef &&
        slice.recoveryClaimPriorTransitionFingerprint === prior.semanticFingerprint;
    }));
  let registryBudgetSubstitutionRejected = false;
  try {
    const substitutedRegistry = structuredClone(bundle.schedulerRegistry);
    substitutedRegistry.runtimeRecoveryClaimContract.boundedPriorStateProof.maximumPriorStateReceiptBytes += 1;
    new SingleWorkerIntentScheduler({
      workerRef: runtimeOne.workerRef,
      schedulerInstanceRef: 'instance.intent-scheduler.runtime-recovery.substituted-budget',
      schedulerRegistry: substitutedRegistry,
      runtimeRecoveryRegistry: registry,
      runtimeAuthority: new WorkerLeaseAuthority({ sourceRef: runtimeOne.sourceRef }),
      schedulerAggregate: scheduler.aggregate
    });
  } catch {
    registryBudgetSubstitutionRejected = true;
  }
  const oversizedCanonicalSliceRejected = rejectCoordinatedPriorStateForgery(
    scheduler.aggregate,
    (slice) => { slice.queue.canonicalUtf8BudgetPadding = 'x'.repeat(110000); }
  );
  const omittedPriorTransitionEvidenceRejected = rejectCoordinatedPriorStateForgery(
    scheduler.aggregate,
    (slice) => { slice.recoveryClaimPriorTransitionEvidence = null; }
  );
  const changedPriorTransitionEvidenceRejected = rejectCoordinatedPriorStateForgery(
    scheduler.aggregate,
    (slice) => {
      const evidence = slice.recoveryClaimPriorTransitionEvidence;
      evidence.edgeEvidenceFingerprint = semanticHash({ forged: true });
      delete evidence.transitionEvidenceRef;
      delete evidence.semanticFingerprint;
      evidence.semanticFingerprint = semanticHash(evidence);
      evidence.transitionEvidenceRef =
        `evidence.intent-scheduler.recovery-prior-transition.${evidence.semanticFingerprint.slice(0, 32)}`;
    }
  );
  const sameStateSliceRefDifferentContentRejected = rejectCoordinatedPriorStateForgery(
    scheduler.aggregate,
    (slice) => { slice.queue.state = 'BLOCKED'; },
    { retainStateSliceRef: true }
  );
  const samePriorStateReceiptRefDifferentContentRejected = rejectCoordinatedPriorStateForgery(
    scheduler.aggregate,
    (_slice, receipt) => { receipt.schedulerPhase = 'BLOCKED'; },
    { retainPriorStateReceiptRef: true }
  );
  const boundedNonRecursiveSchedulerStateProof = {
    contractRef: boundedPriorStateContract.contractRef,
    registeredContractFingerprint: semanticHash(boundedPriorStateContract),
    registeredContract: structuredClone(boundedPriorStateContract),
    receiptSchemaVersion: boundedPriorStateContract.receiptSchemaVersion,
    stateSliceSchemaVersion: boundedPriorStateContract.stateSliceSchemaVersion,
    growthClass: boundedPriorStateContract.growthClass,
    lifecycleCount: 2,
    claimTransitionCount: normalClaimTransitions.length + invalidatedClaimTransitions.length,
    normalLifecycle: normalClaimTransitions.map((item) => item.type),
    invalidatedLifecycle: invalidatedClaimTransitions.map((item) => item.type),
    serializedSchedulerStateBytes,
    additionalAggregateBytesPerTransition,
    priorStateSliceBytes,
    priorStateReceiptBytes,
    maximumObservedInitialClaimedSchedulerStateBytes: serializedSchedulerStateBytes[0],
    maximumObservedPriorStateSliceBytes: Math.max(...priorStateSliceBytes),
    maximumObservedPriorStateReceiptBytes: Math.max(...priorStateReceiptBytes),
    maximumObservedAdditionalAggregateBytes: Math.max(...additionalAggregateBytesPerTransition),
    maximumLeaseBindingCount,
    maximumNestedStateSliceCount,
    maximumPriorEdgeReceiptCount,
    canonicalSerializationExact: priorStateReceipts.every((receipt) =>
      receipt.canonicalSerialization === boundedPriorStateContract.canonicalSerialization &&
      receipt.schedulerStateSlice.canonicalSerialization === boundedPriorStateContract.canonicalSerialization
    ),
    noNestedStateSlices,
    noPriorEdgeReceiptsInsideStateSlice,
    exactPriorAggregateAndTransitionBound,
    exactPriorTransitionEvidenceBound,
    claimedRestartRestoresExactState:
      restartedClaimScheduler.aggregate.semanticFingerprint === schedulerClaimedSnapshot.semanticFingerprint,
    invalidatedRestartRestoresExactState:
      restartedDispositionScheduler.aggregate.semanticFingerprint === preResumeDispositionSnapshot.semanticFingerprint,
    coordinatedResumeEdgeForgeryRejected,
    coordinatedTerminalEdgeForgeryRejected,
    coordinatedDispositionEdgeForgeryRejected,
    registryBudgetSubstitutionRejected,
    oversizedCanonicalSliceRejected,
    omittedPriorTransitionEvidenceRejected,
    changedPriorTransitionEvidenceRejected,
    sameStateSliceRefDifferentContentRejected,
    samePriorStateReceiptRefDifferentContentRejected,
    withinRegisteredBudgets:
      serializedSchedulerStateBytes[0] <= boundedPriorStateContract.maximumInitialClaimedSchedulerStateBytes &&
      additionalAggregateBytesPerTransition.every((bytes) =>
        bytes <= boundedPriorStateContract.maximumAdditionalAggregateBytesPerClaimTransition) &&
      priorStateReceiptBytes.every((bytes) => bytes <= boundedPriorStateContract.maximumPriorStateReceiptBytes) &&
      priorStateSliceBytes.every((bytes) => bytes <= boundedPriorStateContract.maximumPriorStateReceiptBytes) &&
      maximumLeaseBindingCount <= boundedPriorStateContract.maximumRecentLeaseBindings,
    linearGrowthProven:
      noNestedStateSlices && noPriorEdgeReceiptsInsideStateSlice &&
      exactPriorAggregateAndTransitionBound && exactPriorTransitionEvidenceBound &&
      additionalAggregateBytesPerTransition.every((bytes) =>
        bytes <= boundedPriorStateContract.maximumAdditionalAggregateBytesPerClaimTransition)
  };
  const sourceManagedPriorStateBudgetAndTransitionProof = boundedNonRecursiveSchedulerStateProof;

  const waitBranch = representativeActions.find((item) => item.name === 'external-wait-resume');
  const splitBranch = representativeActions.find((item) => item.name === 'split-work-return');
  const genericLifecycleEvent = {
    eventRef: 'external-event.runtime-recovery.lifecycle-proof.generic',
    workNodeRef: disposedRecoveryAggregate.workNodeRef,
    schedulerGeneration: disposedRecoveryAggregate.schedulerGeneration,
    resultRef: 'result.runtime-recovery.lifecycle-proof.generic',
    observedAt: SUCCEEDED_AT
  };
  genericLifecycleEvent.semanticFingerprint = semanticHash(genericLifecycleEvent);
  const sameRefDifferentContentLifecycleEvent = {
    ...genericLifecycleEvent,
    resultRef: 'result.runtime-recovery.lifecycle-proof.substituted'
  };
  delete sameRefDifferentContentLifecycleEvent.semanticFingerprint;
  sameRefDifferentContentLifecycleEvent.semanticFingerprint = semanticHash(sameRefDifferentContentLifecycleEvent);
  const invalidatedEventInputs = {
    generic: genericLifecycleEvent,
    wait: waitBranch.waitResumeReceipt.waitEvent,
    resume: waitBranch.waitResumeReceipt.resumeEvent,
    split: splitBranch.splitWorkRouteReceipt,
    sameRefDifferentContent: sameRefDifferentContentLifecycleEvent
  };
  const invalidatedExternalEventResults = Object.fromEntries(Object.entries(invalidatedEventInputs)
    .map(([kind, event]) => [kind, recordExternalRecoveryEvent(disposedRecoveryAggregate, event, {
      schedulerCurrentness: disposedSchedulerCurrentness,
      registry
    })]));
  const terminalEventInputs = invalidatedEventInputs;
  const terminalExternalEventResults = Object.fromEntries(Object.entries(terminalEventInputs)
    .map(([kind, event]) => [kind, recordExternalRecoveryEvent(aggregate, event, {
      schedulerCurrentness: terminalSchedulerCurrentness,
      registry
    })]));
  const managedFormationRejections = {
    invalidatedWait: false,
    invalidatedSplit: false,
    terminalWait: false,
    terminalSplit: false
  };
  for (const [owner, prefix, currentness] of [
    [disposedRecoveryAggregate, 'invalidated', disposedSchedulerCurrentness],
    [aggregate, 'terminal', terminalSchedulerCurrentness]
  ]) {
    try {
      createRecoveryWaitResumeReceipt({
        aggregate: owner,
        policyDecision: waitBranch.aggregate.activePolicyDecision,
        waitedAt: FAILED_AT,
        resumedAt: RECOVERED_AT,
        resumeSourceRef: 'source.runtime-recovery.wait.lifecycle-forgery',
        schedulerCurrentness: currentness,
        registry
      });
    } catch (error) {
      managedFormationRejections[`${prefix}Wait`] =
        /SCHEDULER_CLAIM_(INVALIDATED|TERMINAL)_OPERATION_REJECTED/.test(error.message);
    }
    try {
      createSplitWorkRouteReceipt({
        aggregate: owner,
        policyDecision: splitBranch.aggregate.activePolicyDecision,
        contextRecoveryReceipt: splitBranch.contextProof,
        childWorkNodeRef: splitBranch.contextProof.splitWorkNodeRef,
        observedAt: RECOVERED_AT,
        schedulerCurrentness: currentness,
        registry
      });
    } catch (error) {
      managedFormationRejections[`${prefix}Split`] =
        /SCHEDULER_CLAIM_(INVALIDATED|TERMINAL)_OPERATION_REJECTED/.test(error.message);
    }
  }
  staleClaimUseRejected.externalEvent = Object.values(invalidatedExternalEventResults).every((result) =>
    result.changed === false &&
    result.reason === 'SCHEDULER_CLAIM_INVALIDATED_EXTERNAL_EVENT_REJECTED' &&
    result.aggregate.semanticFingerprint === disposedRecoveryAggregate.semanticFingerprint
  );
  const acceptedGenericEvent = acceptedExternal.aggregate.acceptedExternalEvents.find((item) =>
    item.eventRef === external.eventRef
  );
  const acceptedGenericAdoption = acceptedExternal.aggregate.eventLedger.findLast((item) =>
    item.type === 'EXTERNAL_EVENT_ACCEPTED' && item.payload.event.eventRef === external.eventRef
  )?.payload.adoptionReceipt;
  const replayLifecycleTamper = structuredClone(acceptedExternal.aggregate);
  const replayExternalEvent = replayLifecycleTamper.eventLedger.findLast((item) =>
    item.type === 'EXTERNAL_EVENT_ACCEPTED'
  );
  replayExternalEvent.payload.event.schedulerClaimLifecycle = 'CLAIMED_CURRENT';
  delete replayExternalEvent.payload.event.semanticFingerprint;
  replayExternalEvent.payload.event.semanticFingerprint = semanticHash(replayExternalEvent.payload.event);
  delete replayExternalEvent.eventRef;
  delete replayExternalEvent.semanticFingerprint;
  replayExternalEvent.semanticFingerprint = semanticHash(replayExternalEvent);
  replayExternalEvent.eventRef = `event.runtime-recovery.external-event-accepted.${
    replayExternalEvent.semanticFingerprint.slice(0, 32)
  }`;
  const replayLifecycleTamperedAggregate = rehashRecoveryAggregate(replayLifecycleTamper);
  let replayExactCurrentnessTamperRejected = false;
  try {
    createRecoveryAggregate(replayLifecycleTamperedAggregate, { registry });
  } catch {
    replayExactCurrentnessTamperRejected = true;
  }
  const externalEventClaimLifecycleProof = {
    normalAccepted: acceptedExternal.changed,
    normalAcceptedReason: acceptedExternal.reason,
    normalEventLifecycle: acceptedGenericAdoption?.operationCurrentnessReceipt?.claimLifecycle ?? null,
    normalEventCurrentnessReceiptRef: acceptedGenericAdoption?.schedulerClaimCurrentnessReceiptRef ?? null,
    normalEventCurrentnessReceiptFingerprint:
      acceptedGenericAdoption?.schedulerClaimCurrentnessReceiptFingerprint ?? null,
    normalEventBoundToExactCurrentClaim:
      acceptedGenericAdoption?.operationCurrentnessReceipt?.claimLifecycle ===
        restored.currentSchedulerClaimLifecycle.claimLifecycle &&
      acceptedGenericAdoption?.schedulerClaimCurrentnessReceiptRef ===
        restored.currentSchedulerClaimLifecycle.currentnessReceiptRef &&
      acceptedGenericAdoption?.schedulerClaimCurrentnessReceiptFingerprint ===
        restored.currentSchedulerClaimLifecycle.semanticFingerprint,
    invalidatedReasons: Object.fromEntries(Object.entries(invalidatedExternalEventResults)
      .map(([kind, result]) => [kind, result.reason])),
    terminalReasons: Object.fromEntries(Object.entries(terminalExternalEventResults)
      .map(([kind, result]) => [kind, result.reason])),
    allInvalidatedKindsRejectedExact: Object.values(invalidatedExternalEventResults).every((result) =>
      result.changed === false && result.reason === 'SCHEDULER_CLAIM_INVALIDATED_EXTERNAL_EVENT_REJECTED'),
    allTerminalKindsRejectedExact: Object.values(terminalExternalEventResults).every((result) =>
      result.changed === false && result.reason === 'SCHEDULER_CLAIM_TERMINAL_EXTERNAL_EVENT_REJECTED'),
    invalidatedAggregateUnchanged: Object.values(invalidatedExternalEventResults).every((result) =>
      result.aggregate.semanticFingerprint === disposedRecoveryAggregate.semanticFingerprint),
    terminalAggregateUnchanged: Object.values(terminalExternalEventResults).every((result) =>
      result.aggregate.semanticFingerprint === aggregate.semanticFingerprint),
    managedFormationRejections,
    allManagedFormationUsesRejected: Object.values(managedFormationRejections).every(Boolean),
    replayExactCurrentnessTamperRejected
  };

  const operationRouteInputs = [
    ...[
      'POLICY_FORMATION', 'CONTEXT_FORMATION', 'RESOURCE_FORMATION', 'TRANSACTION_ADOPTION',
      'HUMAN_GATE_FORMATION', 'WAIT_RESUME_FORMATION', 'SPLIT_ROUTE_FORMATION', 'ACTION_FORMATION'
    ].map((operationClass) => ({
      operationClass,
      owner: action.aggregate,
      currentness: claimedSchedulerCurrentness,
      expectedClaimLifecycles: ['CLAIMED_CURRENT'],
      observedAt: RECOVERED_AT
    })),
    ...[
      'EXTERNAL_EVENT_ADOPTION', 'EXTERNAL_EVENT_ADMISSION', 'CONTINUATION_FORMATION',
      'CONTINUATION_APPLICATION', 'RETRY_ATTEMPT', 'CONVERGENCE_FORMATION', 'CONVERGENCE_APPLICATION'
    ].map((operationClass) => ({
      operationClass,
      owner: restored,
      currentness: resumedSchedulerCurrentness,
      expectedClaimLifecycles: ['RESUMED_CONSUMED'],
      observedAt: SUCCEEDED_AT
    })),
    ...['TERMINAL_CLOSURE', 'CURRENT_PROJECTION'].map((operationClass) => ({
      operationClass,
      owner: aggregate,
      currentness: terminalSchedulerCurrentness,
      expectedClaimLifecycles: ['TERMINAL_CONSUMED'],
      observedAt: COMPLETED_AT
    }))
  ];
  const operationRouteReceipts = Object.fromEntries(operationRouteInputs.map((input) => {
    const receipt = createRecoveryOperationCurrentnessReceipt({
      aggregate: input.owner,
      schedulerAggregate: input.currentness.schedulerAggregate,
      schedulerClaimCurrentnessReceipt: input.currentness.schedulerClaimCurrentnessReceipt,
      operationClass: input.operationClass,
      expectedClaimLifecycles: input.expectedClaimLifecycles,
      observedAt: input.observedAt,
      registry
    });
    return [input.operationClass, {
      operationCurrentnessReceiptRef: receipt.operationCurrentnessReceiptRef,
      semanticFingerprint: receipt.semanticFingerprint,
      schedulerAggregateFingerprint: receipt.schedulerAggregateFingerprint,
      recoveryAggregateFingerprint: receipt.recoveryAggregateFingerprint,
      claimLifecycle: receipt.claimLifecycle
    }];
  }));
  const rejectionReason = ({ owner, currentness, operationClass, expectedClaimLifecycles, observedAt }) => {
    try {
      createRecoveryOperationCurrentnessReceipt({
        aggregate: owner,
        schedulerAggregate: currentness.schedulerAggregate,
        schedulerClaimCurrentnessReceipt: currentness.schedulerClaimCurrentnessReceipt,
        operationClass,
        expectedClaimLifecycles,
        observedAt,
        registry
      });
      return null;
    } catch (error) {
      return error.message;
    }
  };
  const schedulerFingerprintsBeforeOperationRejections = {
    claimed: claimedSchedulerCurrentness.schedulerAggregate.semanticFingerprint,
    invalidated: disposedSchedulerCurrentness.schedulerAggregate.semanticFingerprint,
    terminal: terminalSchedulerCurrentness.schedulerAggregate.semanticFingerprint
  };
  const recoveryFingerprintsBeforeOperationRejections = {
    claimed: action.aggregate.semanticFingerprint,
    resumed: acceptedExternal.aggregate.semanticFingerprint,
    terminal: aggregate.semanticFingerprint
  };
  const invalidatedOperationReasons = Object.fromEntries(operationRouteInputs.map(({ operationClass }) => [
    operationClass,
    rejectionReason({
      owner: action.aggregate,
      currentness: disposedSchedulerCurrentness,
      operationClass,
      expectedClaimLifecycles: ['CLAIMED_CURRENT', 'RESUMED_CONSUMED', 'TERMINAL_CONSUMED'],
      observedAt: RECOVERED_AT
    })
  ]));
  const staleOperationReasons = Object.fromEntries(operationRouteInputs.map(({ operationClass }) => [
    operationClass,
    rejectionReason({
      owner: acceptedExternal.aggregate,
      currentness: claimedSchedulerCurrentness,
      operationClass,
      expectedClaimLifecycles: ['CLAIMED_CURRENT', 'RESUMED_CONSUMED', 'TERMINAL_CONSUMED'],
      observedAt: SUCCEEDED_AT
    })
  ]));
  const nonterminalOperationClasses = operationRouteInputs
    .map((item) => item.operationClass)
    .filter((operationClass) => !['TERMINAL_CLOSURE', 'CURRENT_PROJECTION'].includes(operationClass));
  const terminalOperationReasons = Object.fromEntries(nonterminalOperationClasses.map((operationClass) => [
    operationClass,
    rejectionReason({
      owner: aggregate,
      currentness: terminalSchedulerCurrentness,
      operationClass,
      expectedClaimLifecycles: ['CLAIMED_CURRENT', 'RESUMED_CONSUMED'],
      observedAt: COMPLETED_AT
    })
  ]));
  const invalidatedCurrentProjection = projectRecoveryAggregate(action.aggregate, {
    projectionObservedAt: RECOVERED_AT,
    schedulerCurrentness: disposedSchedulerCurrentness,
    registry
  }).projection;
  const staleCurrentProjection = projectRecoveryAggregate(acceptedExternal.aggregate, {
    projectionObservedAt: SUCCEEDED_AT,
    schedulerCurrentness: claimedSchedulerCurrentness,
    registry
  }).projection;
  const historicalProjection = projectRecoveryAggregate(aggregate, {
    projectionClass: 'HISTORICAL',
    registry
  }).projection;
  const operationTimeSchedulerCurrentnessProof = {
    contractRef: registry.operationTimeSchedulerCurrentnessContract.contractRef,
    contractFingerprint: semanticHash(registry.operationTimeSchedulerCurrentnessContract),
    registeredOperationClasses: [...registry.operationTimeSchedulerCurrentnessContract.operationClasses],
    operationRouteReceipts,
    everyRegisteredOperationRoutedExactly:
      Object.keys(operationRouteReceipts).length ===
        registry.operationTimeSchedulerCurrentnessContract.operationClasses.length &&
      registry.operationTimeSchedulerCurrentnessContract.operationClasses.every((operationClass) =>
        operationRouteReceipts[operationClass]?.semanticFingerprint),
    invalidatedOperationReasons,
    staleOperationReasons,
    terminalOperationReasons,
    allInvalidatedOperationsRejectedExact: Object.values(invalidatedOperationReasons).every((reason) =>
      reason === registry.operationTimeSchedulerCurrentnessContract.invalidatedUseReason),
    allStaleOperationsRejectedExact: Object.values(staleOperationReasons).every((reason) =>
      reason === registry.operationTimeSchedulerCurrentnessContract.staleUseReason),
    allNonterminalOperationsRejectedAfterTerminal: Object.values(terminalOperationReasons).every((reason) =>
      reason === registry.operationTimeSchedulerCurrentnessContract.terminalUseReason),
    invalidatedCurrentProjectionState: invalidatedCurrentProjection.projectionCurrentness,
    invalidatedCurrentProjectionQueueState: invalidatedCurrentProjection.queue.state,
    invalidatedCurrentProjectionHealthState: invalidatedCurrentProjection.health.state,
    invalidatedCurrentProjectionRoute: invalidatedCurrentProjection.guide.recoveryRoute,
    staleCurrentProjectionState: staleCurrentProjection.projectionCurrentness,
    staleCurrentProjectionQueueState: staleCurrentProjection.queue.state,
    staleCurrentProjectionHealthState: staleCurrentProjection.health.state,
    staleCurrentProjectionRoute: staleCurrentProjection.guide.recoveryRoute,
    terminalCurrentProjectionState: projection.projectionCurrentness,
    terminalCurrentProjectionHealthState: projection.health.state,
    historicalProjectionState: historicalProjection.projectionCurrentness,
    historicalProjectionQueueState: historicalProjection.queue.state,
    historicalProjectionHealthState: historicalProjection.health.state,
    historicalProjectionNeverCurrentOrClear:
      historicalProjection.projectionCurrentness === 'HISTORICAL' &&
      historicalProjection.queue.state === 'HISTORICAL' &&
      historicalProjection.health.state === 'HISTORICAL',
    schedulerAggregatesUnchanged:
      claimedSchedulerCurrentness.schedulerAggregate.semanticFingerprint ===
        schedulerFingerprintsBeforeOperationRejections.claimed &&
      disposedSchedulerCurrentness.schedulerAggregate.semanticFingerprint ===
        schedulerFingerprintsBeforeOperationRejections.invalidated &&
      terminalSchedulerCurrentness.schedulerAggregate.semanticFingerprint ===
        schedulerFingerprintsBeforeOperationRejections.terminal,
    recoveryAggregatesUnchanged:
      action.aggregate.semanticFingerprint === recoveryFingerprintsBeforeOperationRejections.claimed &&
      acceptedExternal.aggregate.semanticFingerprint === recoveryFingerprintsBeforeOperationRejections.resumed &&
      aggregate.semanticFingerprint === recoveryFingerprintsBeforeOperationRejections.terminal,
    synchronizedNormalPathIntact:
      decided.policyDecision.actionAuthorized === true &&
      action.aggregate.currentRecoveryActionReceipt.semanticFingerprint === action.actionReceipt.semanticFingerprint &&
      succeeded.status === 'SUCCEEDED' && acceptedExternal.changed === true &&
      convergence.state === 'RECOVERY_ACTIONS_CONVERGED' && closed.terminalReceipt.finalOutcome === 'SUCCEEDED' &&
      projection.projectionCurrentness === 'CURRENT'
  };

  const immutableExternalSourceBeforeAdoption = JSON.stringify(external);
  const unscopedWithoutAdoption = {
    ...external,
    eventRef: 'external-event.runtime-recovery.simulation.without-adoption'
  };
  delete unscopedWithoutAdoption.semanticFingerprint;
  unscopedWithoutAdoption.semanticFingerprint = semanticHash(unscopedWithoutAdoption);
  const unscopedWithoutAdoptionResult = recordExternalRecoveryEvent(restored, unscopedWithoutAdoption, {
    schedulerCurrentness: resumedSchedulerCurrentness,
    registry
  });
  const preClaimSource = {
    ...external,
    eventRef: 'external-event.runtime-recovery.simulation.pre-claim-source',
    observedAt: FAILED_AT
  };
  delete preClaimSource.semanticFingerprint;
  preClaimSource.semanticFingerprint = semanticHash(preClaimSource);
  let preClaimSourceAdoptionRejected = false;
  try {
    createExternalRecoveryEventAdoptionReceipt({
      aggregate: restored,
      event: preClaimSource,
      adoptedAt: SUCCEEDED_AT,
      schedulerCurrentness: resumedSchedulerCurrentness,
      registry
    });
  } catch (error) {
    preClaimSourceAdoptionRejected = /chronology/.test(error.message);
  }
  const exactScopedExternal = {
    ...external,
    eventRef: 'external-event.runtime-recovery.simulation.exact-current-scope',
    resultRef: 'result.runtime-recovery.simulation.exact-current-scope',
    recoveryCycleRef: restored.activeRecoveryCycle.recoveryCycleRef,
    recoveryCycleFingerprint: restored.activeRecoveryCycle.semanticFingerprint,
    schedulerClaimLifecycle: restored.currentSchedulerClaimLifecycle.claimLifecycle,
    schedulerClaimCurrentnessReceiptRef: restored.currentSchedulerClaimLifecycle.currentnessReceiptRef,
    schedulerClaimCurrentnessReceiptFingerprint: restored.currentSchedulerClaimLifecycle.semanticFingerprint
  };
  delete exactScopedExternal.semanticFingerprint;
  exactScopedExternal.semanticFingerprint = semanticHash(exactScopedExternal);
  const exactScopedExternalResult = recordExternalRecoveryEvent(restored, exactScopedExternal, {
    schedulerCurrentness: resumedSchedulerCurrentness,
    registry
  });
  const readdressedExternalResults = {};
  for (const [name, mutate] of Object.entries({
    priorCycle: (event) => {
      event.recoveryCycleRef = 'recovery-cycle.runtime-recovery.prior-forgery';
      event.recoveryCycleFingerprint = semanticHash({ priorCycle: true });
    },
    changedLifecycle: (event) => { event.schedulerClaimLifecycle = 'CLAIMED_CURRENT'; },
    changedGeneration: (event) => { event.schedulerGeneration -= 1; }
  })) {
    const candidate = structuredClone(exactScopedExternal);
    candidate.eventRef = `external-event.runtime-recovery.simulation.${name}`;
    mutate(candidate);
    delete candidate.semanticFingerprint;
    candidate.semanticFingerprint = semanticHash(candidate);
    readdressedExternalResults[name] = recordExternalRecoveryEvent(restored, candidate, {
      schedulerCurrentness: resumedSchedulerCurrentness,
      registry
    });
  }
  const sameSourceRefDifferentContent = {
    ...external,
    resultRef: 'result.runtime-recovery.simulation.same-ref-substitution'
  };
  delete sameSourceRefDifferentContent.semanticFingerprint;
  sameSourceRefDifferentContent.semanticFingerprint = semanticHash(sameSourceRefDifferentContent);
  const sameSourceRefDifferentContentResult = recordExternalRecoveryEvent(
    acceptedExternal.aggregate,
    sameSourceRefDifferentContent,
    {
      adoptionReceipt: externalAdoption,
      schedulerCurrentness: resumedSchedulerCurrentness,
      registry
    }
  );
  const sameAdoptionRefDifferentContent = structuredClone(externalAdoption);
  const retainedAdoptionRef = sameAdoptionRefDifferentContent.adoptionReceiptRef;
  sameAdoptionRefDifferentContent.sourceEventClass = 'FORGED_EXTERNAL_EVENT_CLASS';
  delete sameAdoptionRefDifferentContent.adoptionReceiptRef;
  delete sameAdoptionRefDifferentContent.semanticFingerprint;
  sameAdoptionRefDifferentContent.semanticFingerprint = semanticHash(sameAdoptionRefDifferentContent);
  sameAdoptionRefDifferentContent.adoptionReceiptRef = retainedAdoptionRef;
  const sameAdoptionRefDifferentContentResult = recordExternalRecoveryEvent(restored, external, {
    adoptionReceipt: sameAdoptionRefDifferentContent,
    schedulerCurrentness: resumedSchedulerCurrentness,
    registry
  });
  const rehashedAdoptionBindingSubstitution = structuredClone(externalAdoption);
  rehashedAdoptionBindingSubstitution.sourceEventFingerprint = semanticHash({ substitutedSource: true });
  delete rehashedAdoptionBindingSubstitution.adoptionReceiptRef;
  delete rehashedAdoptionBindingSubstitution.semanticFingerprint;
  rehashedAdoptionBindingSubstitution.semanticFingerprint = semanticHash(rehashedAdoptionBindingSubstitution);
  rehashedAdoptionBindingSubstitution.adoptionReceiptRef =
    `receipt.runtime-recovery.external-event-adoption.${
      rehashedAdoptionBindingSubstitution.semanticFingerprint.slice(0, 32)
    }`;
  const rehashedAdoptionBindingSubstitutionResult = recordExternalRecoveryEvent(restored, external, {
    adoptionReceipt: rehashedAdoptionBindingSubstitution,
    schedulerCurrentness: resumedSchedulerCurrentness,
    registry
  });
  const managedEventIsContentAddressed = (event) => {
    const canonical = structuredClone(event);
    delete canonical.eventRef;
    delete canonical.semanticFingerprint;
    const fingerprint = semanticHash(canonical);
    return fingerprint === event.semanticFingerprint && event.eventRef.endsWith(fingerprint.slice(0, 32));
  };
  const managedEventProof = {
    wait: managedEventIsContentAddressed(waitBranch.waitResumeReceipt.waitEvent),
    resume: managedEventIsContentAddressed(waitBranch.waitResumeReceipt.resumeEvent),
    split: managedEventIsContentAddressed(splitBranch.splitWorkRouteReceipt),
    waitSchemaVersion: waitBranch.waitResumeReceipt.waitEvent.schemaVersion,
    resumeSchemaVersion: waitBranch.waitResumeReceipt.resumeEvent.schemaVersion,
    splitSchemaVersion: splitBranch.splitWorkRouteReceipt.schemaVersion
  };
  const externalEventFormationAdoptionProof = {
    contractRef: registry.externalEventFormationAdoptionContract.contractRef,
    contractFingerprint: semanticHash(registry.externalEventFormationAdoptionContract),
    sourceEventRef: external.eventRef,
    sourceEventFingerprint: external.semanticFingerprint,
    sourceEventClass: externalAdoption.sourceEventClass,
    adoptionReceiptRef: externalAdoption.adoptionReceiptRef,
    adoptionReceiptFingerprint: externalAdoption.semanticFingerprint,
    adoptionOperationCurrentnessReceiptRef: externalAdoption.operationCurrentnessReceiptRef,
    adoptionOperationCurrentnessReceiptFingerprint: externalAdoption.operationCurrentnessReceiptFingerprint,
    exactImmutableSourceBinding:
      externalAdoption.sourceEventRef === external.eventRef &&
      externalAdoption.sourceEventFingerprint === external.semanticFingerprint &&
      acceptedGenericEvent.semanticFingerprint === external.semanticFingerprint,
    exactCurrentSchedulerCycleFailureWorkGenerationBinding:
      externalAdoption.schedulerAggregateFingerprint === resumedSchedulerCurrentness.schedulerAggregate.semanticFingerprint &&
      externalAdoption.schedulerClaimCurrentnessReceiptFingerprint ===
        restored.currentSchedulerClaimLifecycle.semanticFingerprint &&
      externalAdoption.recoveryCycleFingerprint === restored.activeRecoveryCycle.semanticFingerprint &&
      externalAdoption.failureFingerprint === restored.activeFailure.semanticFingerprint &&
      externalAdoption.workNodeRef === restored.workNodeRef &&
      externalAdoption.schedulerGeneration === restored.schedulerGeneration,
    exactChronology:
      Date.parse(externalAdoption.sourceObservedAt) >=
        Date.parse(restored.currentSchedulerClaimLifecycle.observedAt) &&
      Date.parse(externalAdoption.adoptionObservedAt) >= Date.parse(externalAdoption.sourceObservedAt),
    sourceImmutableBeforeAndAfterAdoption:
      JSON.stringify(external) === immutableExternalSourceBeforeAdoption &&
      semanticHash(Object.fromEntries(Object.entries(external).filter(([key]) => key !== 'semanticFingerprint'))) ===
        external.semanticFingerprint,
    unscopedWithoutAdoptionRejected:
      unscopedWithoutAdoptionResult.changed === false &&
      unscopedWithoutAdoptionResult.aggregate.semanticFingerprint === restored.semanticFingerprint,
    unscopedWithoutAdoptionReason: unscopedWithoutAdoptionResult.reason,
    preClaimSourceAdoptionRejected,
    exactCurrentScopedSourceAcceptedWithoutAdoption:
      exactScopedExternalResult.changed === true &&
      exactScopedExternalResult.aggregate.eventLedger.at(-1).payload.adoptionReceipt === null,
    readdressedExternalReasons: Object.fromEntries(Object.entries(readdressedExternalResults)
      .map(([name, result]) => [name, result.reason])),
    allReaddressedExternalEventsRejected: Object.values(readdressedExternalResults).every((result) =>
      result.changed === false && result.aggregate.semanticFingerprint === restored.semanticFingerprint),
    sameSourceRefDifferentContentRejected:
      sameSourceRefDifferentContentResult.changed === false &&
      sameSourceRefDifferentContentResult.reason === 'SAME_REF_DIFFERENT_CONTENT_REJECTED' &&
      sameSourceRefDifferentContentResult.aggregate.semanticFingerprint === acceptedExternal.aggregate.semanticFingerprint,
    sameAdoptionRefDifferentContentRejected:
      sameAdoptionRefDifferentContentResult.changed === false &&
      /content-addressed identity mismatch/.test(sameAdoptionRefDifferentContentResult.reason),
    rehashedAdoptionBindingSubstitutionRejected:
      rehashedAdoptionBindingSubstitutionResult.changed === false &&
      /stale, substituted, or detached/.test(rehashedAdoptionBindingSubstitutionResult.reason),
    managedEventProof,
    managedEventsRemainContentAddressedWithoutAdoption:
      managedEventProof.wait && managedEventProof.resume && managedEventProof.split,
    replayExactAdoptionAndSourceTamperRejected: replayExactCurrentnessTamperRejected,
    invalidatedAndTerminalAdmissionsRejectedWithoutMutation:
      externalEventClaimLifecycleProof.allInvalidatedKindsRejectedExact &&
      externalEventClaimLifecycleProof.allTerminalKindsRejectedExact &&
      externalEventClaimLifecycleProof.invalidatedAggregateUnchanged &&
      externalEventClaimLifecycleProof.terminalAggregateUnchanged
  };

  const projectionRejected = (candidate) => {
    try {
      projectRecoveryAggregate(candidate, { registry });
      return false;
    } catch {
      return true;
    }
  };
  const withoutSchedulerHold = structuredClone(disposedRecoveryAggregate);
  withoutSchedulerHold.schedulerRecoveryHold = null;
  const blockedShownCompleted = structuredClone(disposedRecoveryAggregate);
  blockedShownCompleted.phase = 'COMPLETED';
  const historicalEvidenceSubstitution = structuredClone(cycleIsolationAggregate);
  historicalEvidenceSubstitution.currentRecoveryActionReceipt = aggregate.currentRecoveryActionReceipt;
  historicalEvidenceSubstitution.lastSuccessfulExecutionReceipt = aggregate.lastSuccessfulExecutionReceipt;
  historicalEvidenceSubstitution.recoveryConvergenceReceipt = aggregate.recoveryConvergenceReceipt;
  const lifecycleCurrentnessSubstitution = structuredClone(disposedRecoveryAggregate);
  lifecycleCurrentnessSubstitution.currentSchedulerClaimLifecycle = aggregate.currentSchedulerClaimLifecycle;
  const rehashedDisplayAggregate = structuredClone(disposedRecoveryAggregate);
  rehashedDisplayAggregate.phase = 'COMPLETED';
  rehashedDisplayAggregate.schedulerRecoveryHold = null;
  rehashedDisplayAggregate.activeFailure = null;
  const illegalLedgerAggregate = structuredClone(aggregate);
  const illegalTerminalEvent = structuredClone(illegalLedgerAggregate.eventLedger.at(-1));
  illegalTerminalEvent.sequence = illegalLedgerAggregate.eventLedger.length;
  illegalTerminalEvent.priorEventFingerprint = illegalLedgerAggregate.eventLedger.at(-1).semanticFingerprint;
  delete illegalTerminalEvent.eventRef;
  delete illegalTerminalEvent.semanticFingerprint;
  illegalTerminalEvent.semanticFingerprint = semanticHash(illegalTerminalEvent);
  illegalTerminalEvent.eventRef = `event.runtime-recovery.${
    illegalTerminalEvent.type.toLowerCase().replaceAll('_', '-')
  }.${illegalTerminalEvent.semanticFingerprint.slice(0, 32)}`;
  illegalLedgerAggregate.eventLedger.push(illegalTerminalEvent);
  const projectionTamperRejections = {
    removedSchedulerHold: projectionRejected(rehashRecoveryAggregate(withoutSchedulerHold)),
    blockedShownCompleted: projectionRejected(rehashRecoveryAggregate(blockedShownCompleted)),
    historicalEvidenceSubstitution: projectionRejected(rehashRecoveryAggregate(historicalEvidenceSubstitution)),
    lifecycleCurrentnessSubstitution: projectionRejected(rehashRecoveryAggregate(lifecycleCurrentnessSubstitution)),
    rehashedDisplayAggregate: projectionRejected(rehashRecoveryAggregate(rehashedDisplayAggregate)),
    illegalLedgerHistory: projectionRejected(rehashRecoveryAggregate(illegalLedgerAggregate))
  };
  const projectionCanonical = structuredClone(projection);
  delete projectionCanonical.semanticFingerprint;
  const replayOwnedRecoveryProjectionProof = {
    projectionKind: projection.projectionKind,
    aggregateFingerprint: projection.aggregateFingerprint,
    activeRecoveryCycleFingerprint: projection.activeRecoveryCycleFingerprint,
    activeFailureFingerprint: projection.activeFailureFingerprint,
    recoveredFailureFingerprint: projection.recoveredFailureFingerprint,
    schedulerClaimLifecycle: projection.schedulerClaimLifecycle,
    schedulerClaimCurrentnessReceiptFingerprint: projection.schedulerClaimCurrentnessReceiptFingerprint,
    schedulerRecoveryHoldFingerprint: disposedProjection.schedulerRecoveryHoldFingerprint,
    schedulerDispositionReceiptFingerprint: disposedProjection.schedulerDispositionReceiptFingerprint,
    currentActionReceiptFingerprint: projection.currentActionReceiptFingerprint,
    currentSuccessReceiptFingerprint: projection.currentSuccessReceiptFingerprint,
    currentConvergenceReceiptFingerprint: projection.currentConvergenceReceiptFingerprint,
    currentTerminalReceiptFingerprint: projection.currentTerminalReceiptFingerprint,
    projectionSemanticFingerprint: projection.semanticFingerprint,
    projectionSemanticFingerprintExact: semanticHash(projectionCanonical) === projection.semanticFingerprint,
    terminalBindingsExact:
      projection.aggregateFingerprint === aggregate.semanticFingerprint &&
      projection.activeRecoveryCycleFingerprint === aggregate.activeRecoveryCycle.semanticFingerprint &&
      projection.recoveredFailureFingerprint === aggregate.recoveredFailure.semanticFingerprint &&
      projection.schedulerClaimCurrentnessReceiptFingerprint ===
        aggregate.currentSchedulerClaimLifecycle.semanticFingerprint &&
      projection.currentActionReceiptFingerprint === aggregate.currentRecoveryActionReceipt.semanticFingerprint &&
      projection.currentSuccessReceiptFingerprint === aggregate.lastSuccessfulExecutionReceipt.semanticFingerprint &&
      projection.currentConvergenceReceiptFingerprint === aggregate.recoveryConvergenceReceipt.semanticFingerprint &&
      projection.currentTerminalReceiptFingerprint === aggregate.terminalRecoveryReceipts.at(-1).semanticFingerprint,
    heldBindingsExact:
      disposedProjection.aggregateFingerprint === disposedRecoveryAggregate.semanticFingerprint &&
      disposedProjection.schedulerRecoveryHoldFingerprint ===
        disposedRecoveryAggregate.schedulerRecoveryHold.semanticFingerprint &&
      disposedProjection.schedulerDispositionReceiptFingerprint ===
        disposedRecoveryAggregate.schedulerRecoveryHold.dispositionReceiptFingerprint &&
      disposedProjection.queue.state === 'BLOCKED' && disposedProjection.health.state === 'BLOCKED',
    tamperRejections: projectionTamperRejections,
    allTamperClassesRejected: Object.values(projectionTamperRejections).every(Boolean),
    failedProjectionReturnedPlausibleView: false
  };
  journeyStates.push('BOUNDED_NON_RECURSIVE_SCHEDULER_STATE_PROVEN');
  journeyStates.push('SOURCE_MANAGED_PRIOR_STATE_BUDGET_AND_TRANSITION_PROVEN');
  journeyStates.push('EXTERNAL_EVENT_CLAIM_CURRENTNESS_PROVEN');
  journeyStates.push('OPERATION_TIME_SCHEDULER_CURRENTNESS_PROVEN');
  journeyStates.push('EXTERNAL_EVENT_FORMATION_ADOPTION_PROVEN');
  journeyStates.push('REPLAY_OWNED_HUMAN_PROJECTION_PROVEN');

  let illegalHistoryRejected = false;
  try {
    const tampered = JSON.parse(serializeRecoveryAggregate(aggregate, { registry }));
    tampered.phase = 'READY';
    delete tampered.semanticFingerprint;
    tampered.semanticFingerprint = semanticHash(Object.fromEntries(Object.entries(tampered).filter(([key]) => key !== 'semanticFingerprint')));
    restoreRecoveryAggregate(JSON.stringify(tampered), { registry });
  } catch {
    illegalHistoryRejected = true;
  }
  if (!illegalHistoryRejected) throw new Error('illegal replay history was not rejected');

  const repository = collectRepositoryEvidence(root);
  const sourceManifest = buildSourceManifest(root);
  const blueprint = validateBlueprint(bundle);
  const eventTypes = new Set(aggregate.eventLedger.map((item) => item.type));
  const semanticReplayEventTypes = new Set([
    ...eventTypes,
    ...quarantineAggregate.eventLedger.map((item) => item.type),
    ...representativeActions.flatMap((item) => item.aggregate.eventLedger.map((event) => event.type))
  ]);
  const exactGateCoverage = semanticHash(completed.completionEvidenceLineage.gateEvidence.map((item) => item.completionGateRef).sort()) ===
    semanticHash([...RECOVERY_COMPLETION_GATE_REFS].sort());
  const thenableAggregate = () => createRecoveryAggregate({
    aggregateRef: 'aggregate.runtime-recovery.thenable-proof',
    workNodeRef: node.workNodeRef,
    sourceStateFingerprint,
    schedulerGeneration: 1,
    retryBudget: registry.retryPolicy
  }, { registry });
  const resolvedThenable = executeWithRecoveryBoundary({
    aggregate: thenableAggregate(),
    executor: () => Promise.resolve({ state: 'PASS' }),
    registry,
    context: boundaryContext(thenableAggregate(), 'attempt.runtime-recovery.thenable.resolve.1', 1, OBSERVED, FAILED_AT)
  });
  const rejectedThenable = executeWithRecoveryBoundary({
    aggregate: thenableAggregate(),
    executor: () => Promise.reject(new Error('deterministic rejected thenable proof')),
    registry,
    context: boundaryContext(thenableAggregate(), 'attempt.runtime-recovery.thenable.reject.1', 1, OBSERVED, FAILED_AT)
  });
  const exactClassifierPlanReceipt = failed.failure.classificationEvidence.classifierPlanReceipt;
  const classifierRejections = {
    unknownPlanRejected: false,
    allowedButNotIssuedPlanRejected: false,
    stalePlanReceiptRejected: false,
    sameRefDifferentContentRejected: false,
    callerAuthoredInlinePlanRejected: false
  };
  for (const [field, planRef] of [
    ['unknownPlanRejected', 'classifier-plan.runtime-recovery.unknown'],
    ['allowedButNotIssuedPlanRejected', 'classifier-plan.runtime-recovery.allowed-but-not-issued']
  ]) {
    try {
      issueClassifierPlan(planRef, { registry });
    } catch {
      classifierRejections[field] = true;
    }
  }
  const staleClassifierPlanReceipt = structuredClone(exactClassifierPlanReceipt);
  staleClassifierPlanReceipt.currentness = 'STALE';
  try {
    createDeterministicClassifiedExecutor({
      classifierPlanReceipt: staleClassifierPlanReceipt,
      registry,
      invoke: () => null
    });
  } catch {
    classifierRejections.stalePlanReceiptRejected = true;
  }
  const sameRefDifferentClassifierPlanReceipt = structuredClone(exactClassifierPlanReceipt);
  sameRefDifferentClassifierPlanReceipt.classifierPlan[0].failureClass = 'MODEL_TIMEOUT_SIMULATED';
  try {
    createDeterministicClassifiedExecutor({
      classifierPlanReceipt: sameRefDifferentClassifierPlanReceipt,
      registry,
      invoke: () => null
    });
  } catch {
    classifierRejections.sameRefDifferentContentRejected = true;
  }
  try {
    createDeterministicClassifiedExecutor({
      sourceRef: exactClassifierPlanReceipt.sourceRef,
      adapterRef: exactClassifierPlanReceipt.adapterRef,
      planRef: exactClassifierPlanReceipt.classifierPlanRef,
      plan: exactClassifierPlanReceipt.classifierPlan,
      registry,
      invoke: () => null
    });
  } catch {
    classifierRejections.callerAuthoredInlinePlanRejected = true;
  }
  const receipt = {
    schemaVersion: 'vexlife.runtime-recovery-simulation-receipt/v1',
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
    boundaryTotalityAndSourcePolicyProof: {
      preAdmissionTyped: true,
      resolvedThenableRejectedTyped: resolvedThenable.boundaryRejection?.reasonCode === 'THENABLE_EXECUTOR_UNSUPPORTED',
      rejectedThenableRejectedTyped: rejectedThenable.boundaryRejection?.reasonCode === 'THENABLE_EXECUTOR_UNSUPPORTED',
      rejectedThenableConsumed: rejectedThenable.boundaryRejection?.rejectionConsumptionState === 'REJECTION_HANDLER_ATTACHED',
      registryBudgetFingerprint: aggregate.retryBudgetFingerprint,
      callerHintsCannotWeaken: failed.failure.partialEffectState === 'CONFIRMED_REVERSIBLE',
      classifierSourceRef: failed.failure.classificationSourceRef,
      classifierAdapterRef: failed.failure.classificationAdapterRef,
      classifierPlanRef: failed.failure.classifierPlanRef,
      classifierEvidenceFingerprint: failed.failure.classificationEvidenceFingerprint,
      policyDecisionFingerprint: decided.policyDecision.semanticFingerprint
    },
    exactClassifierPlanProvenanceProof: {
      planReceiptRef: exactClassifierPlanReceipt.planReceiptRef,
      planReceiptFingerprint: exactClassifierPlanReceipt.semanticFingerprint,
      classifierPlanRef: exactClassifierPlanReceipt.classifierPlanRef,
      sourceRef: exactClassifierPlanReceipt.sourceRef,
      adapterRef: exactClassifierPlanReceipt.adapterRef,
      formationRef: exactClassifierPlanReceipt.formationRef,
      currentness: exactClassifierPlanReceipt.currentness,
      classifierPlanFingerprint: exactClassifierPlanReceipt.classifierPlanFingerprint,
      classifiedAttempt: failed.failure.classificationEvidence.classifiedAttempt,
      failureClass: failed.failure.failureClass,
      evidenceFingerprint: failed.failure.classificationEvidenceFingerprint,
      evidenceConsumesExactPlanReceipt:
        failed.failure.classificationEvidence.classifierPlanReceiptFingerprint === exactClassifierPlanReceipt.semanticFingerprint,
      ...classifierRejections,
      failClosed: Object.values(classifierRejections).every(Boolean)
    },
    canonicalCheckpointAndPreClaimReplayProof: {
      canonicalCheckpointRef: checkpointed.checkpoint.checkpointRef,
      canonicalCheckpointFingerprint: checkpointed.checkpoint.semanticFingerprint,
      immutableCanonicalCheckpointPreserved:
        scheduler.aggregate.canonicalCheckpoints[0]?.semanticFingerprint === checkpointed.checkpoint.semanticFingerprint,
      independentPointerState: scheduler.aggregate.checkpointPointers[0]?.currentState,
      pointerTransitionCount: scheduler.aggregate.checkpointPointerLedger.length,
      exactReleaseCount: checkpointed.checkpoint.leaseReleaseReceipts.length,
      releaseObjectsEmbedExactPriorAndTransitionedLeases: checkpointed.checkpoint.leaseReleaseReceipts.every((item) =>
        item.priorLease?.semanticFingerprint === item.priorLeaseFingerprint &&
        item.transitionedLease?.semanticFingerprint === item.transitionedLeaseFingerprint &&
        item.transitionReceipt?.semanticFingerprint
      ),
      preClaimPriorStateReceiptFingerprint:
        schedulerClaimedSnapshot.recoveryClaimLedger[0].edgeEvidence.schedulerPriorStateReceiptFingerprint,
      preClaimStateFingerprint:
        schedulerClaimedSnapshot.recoveryClaimLedger[0].edgeEvidence.schedulerPriorStateReceipt
          .schedulerStateSlice.semanticFingerprint,
      preClaimPhase:
        schedulerClaimedSnapshot.recoveryClaimLedger[0].edgeEvidence.schedulerPriorStateReceipt
          .schedulerStateSlice.phase,
      fakeReleaseRestoredClaimRejected,
      siblingPausedSnapshotRejected: forgedRehashedRestoreRejected,
      coordinatedCheckpointReleaseClaimReplayRejected:
        forgedRehashedRestoreRejected && fakeReleaseRestoredClaimRejected && missingClaimReceiptRestoredClaimRejected,
      legitimateClaimAdmissibleAfterRejectedReplay:
        legitimateClaimAfterRejectedRestore.state === 'CLAIMED_CURRENT'
    },
    completeClaimEdgeReplayProof: {
      lifecycle: scheduler.aggregate.recoveryClaimLedger.map((item) => item.type),
      resumeEvidenceFingerprint: scheduler.aggregate.recoveryClaimLedger.find((item) =>
        item.type === 'RESUMED_CONSUMED').edgeEvidence.schedulerResumeEvidence.semanticFingerprint,
      terminalEvidenceFingerprint: scheduler.aggregate.recoveryClaimLedger.find((item) =>
        item.type === 'TERMINAL_CONSUMED').edgeEvidence.schedulerTerminalEvidence.semanticFingerprint,
      dispositionEvidenceFingerprint: preResumeDispositionSnapshot.recoveryClaimLedger.find((item) =>
        item.type === 'INVALIDATED_OR_ABANDONED').edgeEvidence.semanticFingerprint,
      resumeEmbedsQueueActiveSixLeasesRuntimeResourcePointerClock: (() => {
        const evidence = scheduler.aggregate.recoveryClaimLedger.find((item) =>
          item.type === 'RESUMED_CONSUMED').edgeEvidence.schedulerResumeEvidence;
        return Boolean(evidence.queue && evidence.activeWorkerPointer &&
          Object.keys(evidence.freshLeases ?? {}).length === 6 && evidence.runtimeTrustSnapshot &&
          evidence.resourceSnapshot && evidence.checkpointPointerTransition && evidence.observedClockReceipt);
      })(),
      terminalEmbedsCompleteCausalClosure: (() => {
        const evidence = scheduler.aggregate.recoveryClaimLedger.find((item) =>
          item.type === 'TERMINAL_CONSUMED').edgeEvidence.schedulerTerminalEvidence;
        return Boolean(evidence.completionVerification && evidence.workgraphTransition &&
          evidence.completionReceipt && evidence.returnRouteReceipt && evidence.terminalQueue &&
          Object.keys(evidence.transitionedLeases ?? {}).length === 6 &&
          evidence.leaseTransitionReceipts?.length === 6 && evidence.observedClockReceipt);
      })(),
      dispositionEmbedsExactHoldPointerQueueAndClock: (() => {
        const edge = preResumeDispositionSnapshot.recoveryClaimLedger.find((item) =>
          item.type === 'INVALIDATED_OR_ABANDONED').edgeEvidence;
        return Boolean(edge.schedulerDispositionReceipt && edge.checkpointPointerTransition &&
          edge.blockedQueue && edge.observedClockReceipt);
      })(),
      coordinatedResumeEdgeForgeryRejected,
      coordinatedTerminalEdgeForgeryRejected,
      coordinatedDispositionEdgeForgeryRejected
    },
    boundedNonRecursiveSchedulerStateProof,
    sourceManagedPriorStateBudgetAndTransitionProof,
    externalEventClaimLifecycleProof,
    operationTimeSchedulerCurrentnessProof,
    externalEventFormationAdoptionProof,
    replayOwnedRecoveryProjectionProof,
    schedulerClaimLifecycleRecoveryProof: {
      claimedCurrentnessReceiptRef: schedulerClaimedCurrentness.currentnessReceiptRef,
      resumedCurrentnessReceiptRef: schedulerResumedCurrentness.currentnessReceiptRef,
      terminalCurrentnessReceiptRef: schedulerTerminalCurrentness.currentnessReceiptRef,
      invalidatedCurrentnessReceiptRef: preResumeDispositionCurrentness.currentnessReceiptRef,
      normalLifecycle: aggregate.schedulerClaimLifecycleHistory.map((item) => item.claimLifecycle),
      invalidatedLifecycle: disposedRecoveryAggregate.schedulerClaimLifecycleHistory.map((item) => item.claimLifecycle),
      invalidatedRecoveryPhase: disposedRecoveryAggregate.phase,
      schedulerRecoveryHoldFingerprint: disposedRecoveryAggregate.schedulerRecoveryHold.semanticFingerprint,
      exactDispositionReasonRef: disposedRecoveryAggregate.schedulerRecoveryHold.reasonRef,
      exactDispositionReceiptFingerprint:
        disposedRecoveryAggregate.schedulerRecoveryHold.dispositionReceiptFingerprint,
      healthState: disposedProjection.health.state,
      guideRoute: disposedProjection.guide.recoveryRoute,
      guideWaitingOn: disposedProjection.guide.waitingOn,
      staleClaimUseRejected,
      allStaleClaimUsesRejected: Object.values(staleClaimUseRejected).every(Boolean),
      schedulerAggregateUnchangedAfterStaleUse:
        preResumeDispositionScheduler.aggregate.semanticFingerprint === schedulerBeforeStaleClaimUse,
      recoveryAggregateUnchangedAfterStaleUse:
        disposedRecoveryAggregate.semanticFingerprint === recoveryBeforeStaleClaimUse,
      normalPathUnchanged:
        JSON.stringify(aggregate.schedulerClaimLifecycleHistory.map((item) => item.claimLifecycle)) ===
          JSON.stringify(['CLAIMED_CURRENT', 'RESUMED_CONSUMED', 'TERMINAL_CONSUMED'])
    },
    canonicalSchedulerClaimReplayProof: {
      transitionSchemaVersion: 'vexlife.intent-scheduler-recovery-claim-transition/v1',
      lifecycle: scheduler.aggregate.recoveryClaimLedger.map((item) => item.type),
      edgeContractRefs: scheduler.aggregate.recoveryClaimLedger.map((item) => item.edgeEvidence.contractRef),
      edgeEvidenceFingerprints: scheduler.aggregate.recoveryClaimLedger.map((item) => item.edgeEvidenceFingerprint),
      embeddedClaimReceiptRef:
        schedulerClaimedSnapshot.recoveryClaimLedger[0].edgeEvidence.recoveryClaimReceipt.claimReceiptRef,
      embeddedClaimReceiptFingerprint:
        schedulerClaimedSnapshot.recoveryClaimLedger[0].edgeEvidence.recoveryClaimReceipt.semanticFingerprint,
      checkpointFingerprint: checkpointed.checkpoint.semanticFingerprint,
      exactReleaseCount: checkpointed.checkpoint.leaseReleaseReceipts.length,
      forgedRehashedRestoreRejected,
      fakeReleaseRestoredClaimRejected,
      missingClaimReceiptRestoredClaimRejected,
      legitimateClaimAdmissibleAfterRejectedRestore:
        legitimateClaimAfterRejectedRestore.state === 'CLAIMED_CURRENT' &&
        legitimateAfterRejectedRestore.aggregate.recoveryClaims.at(-1)?.state === 'CLAIMED_CURRENT',
      suppliedPointersEqualSemanticReplay:
        restartedClaimScheduler.aggregate.recoveryClaims.at(-1)?.lastTransitionFingerprint ===
          schedulerClaimedSnapshot.recoveryClaimLedger.at(-1)?.semanticFingerprint,
      terminalReplayState: scheduler.aggregate.recoveryClaims.at(-1)?.state ?? null
    },
    preResumeClaimDispositionProof: {
      failedResumeRejected,
      claimVisibleAfterFailedResume,
      dispositionReceiptRef: preResumeDisposition.dispositionReceipt.dispositionReceiptRef,
      dispositionReceiptFingerprint: preResumeDisposition.dispositionReceipt.semanticFingerprint,
      disposition: preResumeDisposition.dispositionReceipt.disposition,
      reasonRef: preResumeDisposition.dispositionReceipt.reasonRef,
      postDispositionCheckpointPolicy: preResumeDisposition.dispositionReceipt.postDispositionCheckpointPolicy,
      oldActivationReusable: preResumeDisposition.dispositionReceipt.oldActivationReusable,
      oldReleaseSetReusable: preResumeDisposition.dispositionReceipt.oldReleaseSetReusable,
      dispositionState: preResumeDisposition.state,
      checkpointState: preResumeDisposition.checkpointState,
      restartPreservedDisposition:
        restartedDispositionScheduler.aggregate.recoveryClaims.at(-1)?.state === 'INVALIDATED_OR_ABANDONED' &&
        restartedDispositionScheduler.aggregate.checkpoints.at(-1)?.currentState === 'RECOVERY_TERMINALLY_HELD',
      oldActivationResumeRejected,
      oldActivationReclaimRejected,
      normalLifecycleUnchanged: JSON.stringify(scheduler.aggregate.recoveryClaimLedger.map((item) => item.type)) ===
        JSON.stringify(['CLAIMED_CURRENT', 'RESUMED_CONSUMED', 'TERMINAL_CONSUMED'])
    },
    replayDurableSchedulerRecoveryOwnershipProof: {
      claimReceiptRef: recoveryClaimReceipt.claimReceiptRef,
      claimReceiptFingerprint: recoveryClaimReceipt.semanticFingerprint,
      schedulerAggregateFingerprint: recoveryClaimReceipt.schedulerAggregateFingerprint,
      recoveryAggregateFingerprint: recoveryClaimReceipt.recoveryAggregateFingerprint,
      recoveryCycleRef: recoveryClaimReceipt.recoveryCycleRef,
      recoveryCycleFingerprint: recoveryClaimReceipt.recoveryCycleFingerprint,
      failureFingerprint: recoveryClaimReceipt.activeFailureFingerprint,
      workNodeRef: recoveryClaimReceipt.workNodeRef,
      sourceStateFingerprint: recoveryClaimReceipt.sourceStateFingerprint,
      schedulerCheckpointFingerprint: recoveryClaimReceipt.schedulerCheckpointFingerprint,
      leaseReleaseCount: recoveryClaimReceipt.leaseReleaseFingerprints.length,
      onceOnlyActivationRef: recoveryClaimReceipt.onceOnlyActivationRef,
      claimLifecycle: recoveryClaimReceipt.claimLifecycle,
      currentness: recoveryClaimReceipt.currentness,
      forgedClaimRejected,
      forgedClaimMutationFree,
      duplicateLiveClaimRejected,
      duplicateRestartClaimRejected,
      restartPreservedClaimOwnership,
      claimedState: schedulerClaimedSnapshot.recoveryClaims.at(-1)?.state ?? null,
      resumedState: schedulerAggregateAfterResume.recoveryClaims.at(-1)?.state ?? null,
      terminalState: scheduler.aggregate.recoveryClaims.at(-1)?.state ?? null,
      schedulerClaimLedgerLength: scheduler.aggregate.recoveryClaimLedger.length,
      releaseSetPreservedAcrossRestart: JSON.stringify(
        restartedClaimScheduler.aggregate.recoveryClaims.at(-1)?.leaseReleaseFingerprints ?? []
      ) === JSON.stringify(recoveryClaimReceipt.leaseReleaseFingerprints)
    },
    recoveryCycleIsolationProof,
    exactCycleLocalEvidenceProof,
    checkpointFreshGenerationSixLeaseProof: {
      schedulerCheckpointRef: checkpointed.checkpoint.checkpointRef,
      schedulerCheckpointFingerprint: checkpointed.checkpoint.semanticFingerprint,
      schedulerConsumptionRef: schedulerConsumption.consumptionRef,
      schedulerConsumptionFingerprint: schedulerConsumption.semanticFingerprint,
      onceOnlyActivationRef: schedulerConsumption.onceOnlyActivationRef,
      checkpointAdmissionRef: checkpointAdmission.admissionRef,
      checkpointAdmissionFingerprint: checkpointAdmission.semanticFingerprint,
      releasedLeaseCount: checkpointed.leaseReleaseReceipts.length,
      releasedLeaseFingerprints: Object.fromEntries(checkpointed.leaseReleaseReceipts.map((item) => [item.leaseRef, item.semanticFingerprint])),
      continuationRef: continuation.continuationRef,
      continuationFingerprint: continuation.semanticFingerprint,
      schedulerResumeFingerprint: continuation.schedulerResumeReceiptFingerprint,
      freshLeaseCount: Object.keys(continuation.freshLeaseFingerprints).length,
      freshLeaseFingerprints: continuation.freshLeaseFingerprints,
      generationAdvanced: continuation.priorSchedulerGeneration === 1 && continuation.nextSchedulerGeneration === 2
    },
    replayedAggregateProof: {
      serializedFingerprint: succeeded.aggregate.semanticFingerprint,
      restoredFingerprint: restored.semanticFingerprint,
      finalReplayedFingerprint: restoreRecoveryAggregate(serializeRecoveryAggregate(aggregate, { registry }), { registry }).semanticFingerprint,
      eventCount: aggregate.eventLedger.length,
      eventTypes: [...eventTypes].sort(),
      semanticReplayEventTypes: [...semanticReplayEventTypes].sort(),
      requiredEventTypesCovered: RECOVERY_EVENT_TYPES.every((type) => semanticReplayEventTypes.has(type)),
      duplicateChanged: duplicateExternal.changed,
      staleChanged: staleExternal.changed,
      illegalHistoryRejected
    },
    aggregateOwnedRecoveryActionProof: {
      actionReceiptRef: action.actionReceipt.actionReceiptRef,
      actionReceiptFingerprint: action.actionReceipt.semanticFingerprint,
      actionReceipt: action.actionReceipt,
      contextRecoveryFingerprint: null,
      resourceRecoveryFingerprint: null,
      transactionalRecoveryFingerprint: action.aggregate.rollbackLineage.at(-1).semanticFingerprint,
      lastKnownGoodReadBackFingerprint: action.aggregate.rollbackLineage.at(-1).lastKnownGoodReadBackFingerprint,
      rollbackLineageCount: closed.aggregate.rollbackLineage.length,
      lastKnownGoodCount: closed.aggregate.lastKnownGoodRefs.length,
      quarantineLineageCount: quarantineAggregate.rollbackLineage.length,
      quarantineRefs: quarantineAggregate.quarantinedRefs,
      quarantineHealth: quarantineProjection.health.state,
      quarantineGuideBlocked: quarantineProjection.guide.remainsBlocked
    },
    actionSpecificRecoveryProof: {
      matrixFingerprint: semanticHash(registry.recoveryActionEvidenceMatrix),
      journeys: representativeActions.map((item) => ({
        name: item.name,
        action: item.action,
        disposition: item.disposition,
        continuationRequired: item.continuationRequired,
        completionEligible: item.completionEligible,
        evidenceRoles: item.evidenceRoles,
        schedulerResumeFingerprint: item.schedulerResumeFingerprint,
        convergenceFingerprint: item.convergenceFingerprint,
        finalPhase: item.finalPhase
      })),
      quarantine: {
        action: quarantineAggregate.currentRecoveryActionReceipt.action,
        disposition: quarantineAggregate.currentRecoveryActionReceipt.disposition,
        evidenceRoles: quarantineAggregate.currentRecoveryActionReceipt.evidence.map((item) => item.role),
        continuationRequired: false,
        completionEligible: false,
        schedulerResumeFingerprint: null,
        convergenceFingerprint: null,
        finalPhase: quarantineAggregate.phase,
        checkpointFingerprint: quarantineCheckpoint.semanticFingerprint,
        schedulerConsumptionFingerprint: quarantineConsumption.semanticFingerprint
      }
    },
    schedulerWorkgraphCausalRecoveryProof: {
      independentSchedulerSimulationUsed: false,
      workNodeRef: node.workNodeRef,
      workNodeFingerprint: node.semanticFingerprint,
      completionGateCount: node.completionGateRefs.length,
      exactGateCoverage,
      recoveryConvergenceReceipt: convergence,
      gateEvidence: completed.completionEvidenceLineage.gateEvidence,
      completionVerificationFingerprint: completed.completionVerification.semanticFingerprint,
      completionEvidenceLineageFingerprint: completed.completionEvidenceLineage.semanticFingerprint,
      workgraphTransitionFingerprint: completed.canonicalWorkgraphTransition.semanticFingerprint,
      completionFingerprint: completed.completionReceipt.semanticFingerprint
    },
    schedulerBindings: closed.schedulerBindings,
    canonicalWorkNodeRef: node.workNodeRef,
    canonicalWorkNodeFinalState: completed.workgraph.nodes.find((item) => item.workNodeRef === node.workNodeRef).state,
    terminalReceipt: closed.terminalReceipt,
    finalAggregateFingerprint: aggregate.semanticFingerprint,
    finalProjection: projection,
    quarantineProjection,
    humanProjectionRecoveryEvidenceProof: {
      completedWhatFailed: projection.guide.whatFailed,
      completedPreservationFingerprint: projection.guide.whatWasPreserved,
      completedRoute: projection.guide.recoveryRoute,
      completedAttemptRef: projection.guide.recoveredAttemptRef,
      completedGeneration: projection.guide.recoveredGeneration,
      terminalProofRef: projection.guide.terminalProofRef,
      quarantineHealth: quarantineProjection.health.state,
      quarantineRefs: quarantineProjection.guide.remainsQuarantined
    },
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
    aggregate,
    projection,
    quarantineAggregate,
    quarantineProjection,
    artifacts: Object.freeze({
      failed,
      failedAggregate: failed.aggregate,
      checkpoint,
      schedulerCheckpoint: checkpointed.checkpoint,
      recoveryClaimReceipt,
      schedulerConsumption,
      schedulerClaimedSnapshot,
      schedulerAggregateAfterCompletion: structuredClone(scheduler.aggregate),
      checkpointAdmission,
      checkpointedAggregate: decided.aggregate,
      contextProof,
      resourceProof,
      transaction,
      actionReceipt: action.actionReceipt,
      actionAggregate: action.aggregate,
      resumed,
      schedulerAggregateAfterResume,
      claimedSchedulerCurrentness,
      resumedSchedulerCurrentness,
      terminalSchedulerCurrentness,
      disposedSchedulerCurrentness,
      quarantineSchedulerCurrentness,
      externalAdoption,
      continuation,
      continuedAggregate: succeeded.aggregate,
      succeeded,
      convergence,
      convergedAggregate,
      completed,
      cycleIsolationAggregate,
      cycleTwoFailure,
      cycleTwoActionReceipt: cycleTwoAction.actionReceipt,
      representativeActions
    })
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
    causalCompletionGateCount: result.receipt.schedulerWorkgraphCausalRecoveryProof.completionGateCount,
    externalEffectsExecuted: result.receipt.externalEffectsExecuted,
    semanticFingerprint: result.receipt.semanticFingerprint
  }, null, 2));
  if (result.receipt.state !== 'PASS') process.exitCode = 1;
}

// [VXG RealForever]
