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
  closeRecoveredExecution,
  continueRecoveryGeneration,
  createRecoveryAggregate,
  createRecoveryCheckpoint,
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
  recordRecoveryConvergence,
  recordRecoveryPolicyDecision,
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

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORMED = '2026-08-01T00:00:00.000Z';
const OBSERVED = '2026-08-01T00:00:01.000Z';
const FAILED_AT = '2026-08-01T00:00:02.000Z';
const RECOVERED_AT = '2026-08-01T00:00:04.000Z';
const SUCCEEDED_AT = '2026-08-01T00:00:05.000Z';
const COMPLETED_AT = '2026-08-01T00:00:06.000Z';
const EXPIRES_AT = '2026-08-01T00:01:00.000Z';
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

function contextReceipt(owner, admission, failure, formedAt, observedAt) {
  return recoverContextBudget({
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
    observedAt
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
  const consumption = scheduler.claimRecoveryCheckpoint(checkpointed.checkpoint.checkpointRef, {
    aggregateRef: owner.aggregateRef,
    failureRef: failed.failure.failureRef,
    failureFingerprint: failed.failure.semanticFingerprint,
    sourceStateFingerprint,
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
      ? contextReceipt(owner, admission, failed.failure, FAILED_AT, RECOVERED_AT)
      : recoverContextBudget({
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
        observedAt: RECOVERED_AT
      });
  }
  if (mode === 'resource') {
    resourceProof = createRecoveryResourceReceipt({
      workNodeRef: owner.workNodeRef,
      sourceStateFingerprint,
      failureFingerprint: failed.failure.semanticFingerprint,
      checkpointAdmission: admission,
      resourceSnapshot: resourceTwo,
      deniedRequest: { cpuSlots: 4, ramMb: 1800, modelTurn: true },
      reducedRequest: { cpuSlots: 1, ramMb: 512, modelTurn: true },
      observedAt: RECOVERED_AT
    });
  }
  const decided = recordRecoveryPolicyDecision(owner, {
    checkpointAdmission: admission,
    contextAdmissionReceipt: contextProof,
    resourceAdmissionReceipt: resourceProof,
    observedAt: RECOVERED_AT,
    registry
  });
  owner = decided.aggregate;
  let transaction = null;
  if (['transaction', 'restore'].includes(mode)) {
    transaction = simulateTransactionalRecovery({
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
  }
  const gate = mode === 'human'
    ? createHumanDecisionGate({ aggregate: owner, policyDecision: decided.policyDecision, observedAt: RECOVERED_AT, registry })
    : null;
  const wait = mode === 'wait'
    ? createRecoveryWaitResumeReceipt({
      aggregate: owner,
      policyDecision: decided.policyDecision,
      waitedAt: FAILED_AT,
      resumedAt: RECOVERED_AT,
      resumeSourceRef: `source.runtime-recovery.wait.${name}`,
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
    registry
  });
  owner = action.aggregate;
  const continuable = action.actionReceipt.continuationRequired;
  let continuation = null;
  let succeeded = null;
  let convergence = null;
  let resumed = null;
  let schedulerAggregateAfterResume = null;
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
    continuation = createRecoveryContinuation({
      aggregate: owner,
      checkpointAdmission: admission,
      resumed,
      schedulerAggregate: schedulerAggregateAfterResume,
      schedulerInstanceRef: scheduler.schedulerInstanceRef,
      observedAt: RECOVERED_AT,
      registry
    });
    owner = continueRecoveryGeneration(owner, continuation, { registry });
    succeeded = executeWithRecoveryBoundary({
      aggregate: owner,
      executor,
      registry,
      context: boundaryContext(owner, `attempt.runtime-recovery.${name}.2`, 2, RECOVERED_AT, SUCCEEDED_AT)
    });
    owner = succeeded.aggregate;
    convergence = createRecoveryConvergenceReceipt(owner, { formedAt: SUCCEEDED_AT, registry });
    owner = recordRecoveryConvergence(owner, convergence, { registry });
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
  if (!failed.admitted || failed.status !== 'FAILED_RECOVERABLE') throw new Error('typed runtime failure was not admitted');
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
  const schedulerConsumption = scheduler.claimRecoveryCheckpoint(checkpointed.checkpoint.checkpointRef, {
    aggregateRef: aggregate.aggregateRef,
    failureRef: failed.failure.failureRef,
    failureFingerprint: failed.failure.semanticFingerprint,
    sourceStateFingerprint,
    observedAt: FAILED_AT
  });
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
  journeyStates.push('CHECKPOINT_ADMISSION_RECORDED');

  const resourceTwo = runtimeResource(2, sourceStateFingerprint, {
    formedAt: FAILED_AT,
    observedAt: RECOVERED_AT,
    cpuLoadPct: 94,
    ramAvailableMb: 2048
  });
  const contextProof = contextReceipt(aggregate, checkpointAdmission, failed.failure, FAILED_AT, RECOVERED_AT);
  const resourceProof = createRecoveryResourceReceipt({
    workNodeRef: aggregate.workNodeRef,
    sourceStateFingerprint,
    failureFingerprint: failed.failure.semanticFingerprint,
    checkpointAdmission,
    resourceSnapshot: resourceTwo,
    deniedRequest: { cpuSlots: 4, ramMb: 1800, modelTurn: true },
    reducedRequest: { cpuSlots: 1, ramMb: 512, modelTurn: true },
    observedAt: RECOVERED_AT
  });
  const decided = recordRecoveryPolicyDecision(aggregate, {
    checkpointAdmission,
    observedAt: RECOVERED_AT,
    registry
  });
  aggregate = decided.aggregate;
  if (decided.policyDecision.action !== 'ROLLBACK_TO_BEFORE_IMAGE' || !decided.policyDecision.actionAuthorized) {
    throw new Error('source-managed rollback policy was not exact');
  }
  journeyStates.push('EXACT_SOURCE_POLICY_DECIDED');
  const transaction = simulateTransactionalRecovery({
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
  const action = applyRecoveryAction({
    aggregate,
    policyDecision: decided.policyDecision,
    checkpointAdmission,
    transactionalRecoveryReceipt: transaction,
    observedAt: RECOVERED_AT,
    registry
  });
  aggregate = action.aggregate;
  journeyStates.push('AGGREGATE_OWNED_RECOVERY_ACTION_APPLIED');

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
  const quarantineConsumption = quarantineScheduler.claimRecoveryCheckpoint(
    quarantineCheckpointed.checkpoint.checkpointRef,
    {
      aggregateRef: quarantineAggregate.aggregateRef,
      failureRef: quarantineFailure.failure.failureRef,
      failureFingerprint: quarantineFailure.failure.semanticFingerprint,
      sourceStateFingerprint,
      observedAt: FAILED_AT
    }
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
  const quarantineDecision = recordRecoveryPolicyDecision(quarantineAggregate, {
    checkpointAdmission: quarantineAdmission,
    observedAt: RECOVERED_AT,
    registry
  });
  quarantineAggregate = quarantineDecision.aggregate;
  const quarantinedTransaction = simulateTransactionalRecovery({
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
  quarantineAggregate = applyRecoveryAction({
    aggregate: quarantineAggregate,
    policyDecision: quarantineDecision.policyDecision,
    checkpointAdmission: quarantineAdmission,
    transactionalRecoveryReceipt: quarantinedTransaction,
    observedAt: RECOVERED_AT,
    registry
  }).aggregate;
  const quarantineProjection = projectRecoveryAggregate(quarantineAggregate).projection;
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
  const continuation = createRecoveryContinuation({
    aggregate,
    checkpointAdmission,
    resumed,
    schedulerAggregate: schedulerAggregateAfterResume,
    schedulerInstanceRef: scheduler.schedulerInstanceRef,
    observedAt: RECOVERED_AT,
    registry
  });
  aggregate = continueRecoveryGeneration(aggregate, continuation, { registry });
  journeyStates.push('FRESH_GENERATION_AND_SIX_LEASES_CONTINUED');
  const succeeded = executeWithRecoveryBoundary({
    aggregate,
    executor,
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
  const acceptedExternal = recordExternalRecoveryEvent(restored, external, { registry });
  const duplicateExternal = recordExternalRecoveryEvent(acceptedExternal.aggregate, external, { registry });
  const staleExternal = recordExternalRecoveryEvent(acceptedExternal.aggregate, {
    ...external,
    eventRef: 'external-event.runtime-recovery.simulation.stale',
    schedulerGeneration: 1
  }, { registry });
  if (duplicateExternal.changed || staleExternal.changed) throw new Error('replay protection did not reject duplicate/stale event');
  aggregate = acceptedExternal.aggregate;
  journeyStates.push('REPLAY_DERIVED_AGGREGATE_RESTORED');

  const convergence = createRecoveryConvergenceReceipt(aggregate, { formedAt: SUCCEEDED_AT, registry });
  aggregate = recordRecoveryConvergence(aggregate, convergence, { registry });
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
    registry
  });
  aggregate = closed.aggregate;
  journeyStates.push('WORKGRAPH_CAUSAL_RECOVERY_VERIFIED');
  journeyStates.push('TERMINAL_RECOVERY_CLOSED');
  const projection = projectRecoveryAggregate(aggregate).projection;
  const noOp = projectRecoveryAggregate(aggregate, { priorProjection: projection });
  if (noOp.changed || !projection.guide.whatFailed || !projection.guide.recoveryRoute || !projection.guide.terminalProofRef) {
    throw new Error('completed projection lost recovery evidence or semantic no-op behavior');
  }
  journeyStates.push('HUMAN_PROJECTIONS_RETAIN_RECOVERY_EVIDENCE');

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
      transactionalRecoveryFingerprint: transaction.semanticFingerprint,
      lastKnownGoodReadBackFingerprint: transaction.lastKnownGoodReadBackFingerprint,
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
      schedulerConsumption,
      checkpointAdmission,
      checkpointedAggregate: decided.aggregate,
      contextProof,
      resourceProof,
      transaction,
      actionReceipt: action.actionReceipt,
      actionAggregate: action.aggregate,
      resumed,
      schedulerAggregateAfterResume,
      continuation,
      continuedAggregate: succeeded.aggregate,
      succeeded,
      convergence,
      convergedAggregate,
      completed,
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
