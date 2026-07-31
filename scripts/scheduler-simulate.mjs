#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import {
  SingleWorkerIntentScheduler,
  WorkerLeaseAuthority
} from '../src/core/intent-scheduler.mjs';
import {
  createIntentEnvelope,
  createIntentWorkgraph,
  createWorkNode
} from '../src/core/intent-workgraph.mjs';
import { collectRepositoryEvidence } from '../src/core/repository-evidence.mjs';
import { createResourceSnapshot } from '../src/core/resource-admission.mjs';
import { createSchedulerRuntimeTrustSnapshot } from '../src/core/scheduler-runtime-trust.mjs';
import { buildSourceManifest } from '../src/core/source-manifest.mjs';
import { createToolCall, ToolResultRelay } from '../src/core/tool-result-relay.mjs';
import {
  readJson,
  resolveSafeGeneratedReceiptPath,
  semanticHash,
  writeJson
} from '../src/core/utils.mjs';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORMED = '2026-07-31T00:00:00.000Z';
const OBSERVED = '2026-07-31T00:05:00.000Z';
const RESULT_AT = '2026-07-31T00:06:00.000Z';
const CHECKPOINT_AT = '2026-07-31T00:07:00.000Z';
const RESUME_FORMED = '2026-07-31T00:08:00.000Z';
const RESUME_OBSERVED = '2026-07-31T00:09:00.000Z';
const CANCEL_AT = '2026-07-31T00:10:00.000Z';
const EXPIRES = '2026-07-31T01:00:00.000Z';
const RESUME_EXPIRES = '2026-07-31T01:08:00.000Z';

function runtimeResource(generation, {
  formedAt,
  observedAt,
  expiresAt,
  cpuLoadPct,
  ramAvailableMb
}) {
  const sourceRef = 'source.intent-scheduler.simulation-runtime';
  const sourceHash = semanticHash({
    sourceRef,
    fixtureVersion: 1,
    generation,
    cpuLoadPct,
    ramAvailableMb
  });
  return createResourceSnapshot({
    snapshotRef: `resource-snapshot.scheduler.simulation.${generation}`,
    generation,
    sourceRef,
    sourceHash,
    formationRef: `formation.scheduler.simulation.resource.${generation}`,
    evidenceClass: 'SIMULATED_CURRENT',
    cpuLoadPct,
    cpuConcurrencyLimit: 4,
    cpuActiveCount: 0,
    ramAvailableMb,
    ramReservedMb: 512,
    gpuAvailable: true,
    vramAvailableMb: 4096,
    vramReservedMb: 0,
    modelResident: true,
    activeModelTurn: false,
    activeHeavyTool: false,
    interactiveWaitState: 'IDLE',
    backgroundWorkAdmission: 'ADMITTED',
    thermalPowerState: 'NOT_EXPOSED',
    currentness: 'CURRENT',
    formedAt,
    observedAt,
    expiresAt
  });
}

function runtimeTrust(schedulerRegistry, resourceSnapshot, generation, {
  formedAt,
  observedAt,
  expiresAt
}) {
  return createSchedulerRuntimeTrustSnapshot({
    snapshotRef: `runtime-snapshot.scheduler.simulation.${generation}`,
    sourceRef: resourceSnapshot.sourceRef,
    sourceHash: resourceSnapshot.sourceHash,
    formationRef: `formation.scheduler.simulation.runtime.${generation}`,
    evidenceClass: 'SIMULATED_CURRENT',
    schedulerGeneration: generation,
    formedAt,
    observedAt,
    expiresAt,
    workerRef: 'worker.model.mock.primary',
    actorRef: 'person.vexlife.owner',
    roleRef: 'role.vex.operations',
    claimRef: 'claim.scheduler.simulation',
    occupancyRef: `occupancy.scheduler.simulation.${generation}`,
    leaseAuthorityRef: 'authority.intent-scheduler.simulation-runtime',
    resourceSnapshotRef: resourceSnapshot.snapshotRef,
    resourceSnapshotFingerprint: resourceSnapshot.semanticFingerprint,
    currentness: 'CURRENT'
  }, { schedulerRegistry, resourceSnapshot });
}

function schedulerOptions({
  bundle,
  graph,
  node,
  trustSnapshot,
  resourceSnapshot,
  runtimeTrustSnapshot,
  generation,
  formedAt,
  observedAt,
  expiresAt
}) {
  const runtimeFields = {
    runtimeSnapshotRef: runtimeTrustSnapshot.snapshotRef,
    runtimeSnapshotFingerprint: runtimeTrustSnapshot.semanticFingerprint,
    schedulerGeneration: generation,
    sourceRef: runtimeTrustSnapshot.sourceRef,
    sourceHash: runtimeTrustSnapshot.sourceHash,
    authorityRef: runtimeTrustSnapshot.leaseAuthorityRef,
    formedAt,
    observedAt,
    expiresAt,
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
      [node.workNodeRef]: {
        cpuSlots: 1,
        ramMb: 256,
        vramMb: 0,
        modelTurn: true,
        heavyTool: false,
        background: false
      }
    },
    occupancyByNodeRef: {
      [node.workNodeRef]: {
        occupancyRef: runtimeTrustSnapshot.occupancyRef,
        actorRef: runtimeTrustSnapshot.actorRef,
        roleRef: node.roleRef,
        workNodeRef: node.workNodeRef,
        graphFingerprint: graph.semanticFingerprint,
        claimRef: runtimeTrustSnapshot.claimRef,
        formationRef: `formation.scheduler.simulation.occupancy.${generation}`,
        ...runtimeFields
      }
    },
    capabilityLeaseByNodeRef: {
      [node.workNodeRef]: {
        leaseRef: `capability-lease.scheduler.simulation.${generation}`,
        workNodeRef: node.workNodeRef,
        graphFingerprint: graph.semanticFingerprint,
        trustSnapshotFingerprint: trustSnapshot.semanticFingerprint,
        envelopeRef: node.capabilityEnvelopeRef,
        formationRef: `formation.scheduler.simulation.capability.${generation}`,
        toolRefs: ['tool.mock.inspect'],
        ...runtimeFields
      }
    },
    effectLeaseByNodeRef: {
      [node.workNodeRef]: {
        leaseRef: `effect-lease.scheduler.simulation.${generation}`,
        workNodeRef: node.workNodeRef,
        graphFingerprint: graph.semanticFingerprint,
        trustSnapshotFingerprint: trustSnapshot.semanticFingerprint,
        envelopeRef: node.effectEnvelopeRef,
        formationRef: `formation.scheduler.simulation.effect.${generation}`,
        effectDisposition: 'EFFECT_ENVELOPE_BOUND',
        allowedEffectRefs: ['effect.mock.read'],
        ...runtimeFields
      }
    },
    resourceLeaseRefByNodeRef: {
      [node.workNodeRef]: `resource-lease.scheduler.simulation.${generation}`
    },
    schedulerGeneration: generation,
    formedAt,
    observedAt,
    expiresAt
  };
}

function contextInput(generation, {
  formedAt,
  observedAt,
  expiresAt
}) {
  return {
    leaseRef: `context-lease.scheduler.simulation.${generation}`,
    cancellationTokenRef: `cancellation-token.scheduler.simulation.${generation}`,
    foundationKernelRef: 'foundation-kernel.compact',
    roleFrameRef: 'role-frame.operations',
    intentFrameRef: 'intent-frame.scheduler.simulation',
    selectedAtlasRefs: [
      'registry.vexlife.intent-scheduler.001',
      'module.vexlife.core.intent-scheduler'
    ],
    selectedSourceRefs: ['blueprint/intent-scheduler-registry.json'],
    applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs: [],
    applicableReleaseRefs: [],
    inputTokenEstimate: 256,
    reservedOutputTokens: 256,
    hardTokenLimit: 1024,
    formedAt,
    observedAt,
    expiresAt,
    checkpointReturnRef: 'return-route.intent.verify-transition'
  };
}

function exactMockResult(call, observationRef) {
  return {
    toolCallRef: call.toolCallRef,
    observationRef,
    workNodeRef: call.workNodeRef,
    workerRef: call.workerRef,
    workerLeaseRef: call.workerLeaseRef,
    graphFingerprint: call.graphFingerprint,
    trustSnapshotFingerprint: call.trustSnapshotFingerprint,
    runtimeSnapshotFingerprint: call.runtimeSnapshotFingerprint,
    contextLeaseRef: call.contextLeaseRef,
    contextLeaseFingerprint: call.contextLeaseFingerprint,
    toolRef: call.toolRef,
    effectRef: call.effectRef,
    capabilityLeaseFingerprint: call.capabilityLeaseFingerprint,
    effectLeaseFingerprint: call.effectLeaseFingerprint,
    resourceLeaseFingerprint: call.resourceLeaseFingerprint,
    schedulerGeneration: call.schedulerGeneration,
    cancellationTokenRef: call.cancellationTokenRef,
    executorRef: call.executorRef,
    sourceEvidenceRef: call.sourceEvidenceRef,
    sourceEvidenceHash: call.sourceEvidenceHash,
    schemaRef: call.resultSchemaRef,
    observation: { summaryRef: 'summary.scheduler.simulation.mock-result' },
    artifactRefs: []
  };
}

export function runSchedulerSimulation({
  root = DEFAULT_ROOT,
  writeReceipt = true,
  receiptPath = null
} = {}) {
  const bundle = loadBlueprint(root);
  const registry = bundle.intentRegistry;
  const schedulerRegistry = bundle.schedulerRegistry;
  const target = resolveSafeGeneratedReceiptPath(
    root,
    receiptPath ?? schedulerRegistry.simulationContract.receiptPath,
    'scheduler simulation receipt path'
  );
  const trustSnapshot = readJson(path.join(root, 'blueprint/intent-trust-snapshot.json'));
  const journeyStates = ['WORKGRAPH_VALIDATED'];

  const intent = createIntentEnvelope({
    intentRef: 'intent.scheduler.simulation',
    originMessageRef: 'message.scheduler.simulation',
    originSpeakerRef: 'person.vexlife.owner',
    recipientRoleRef: 'role.vex.operations',
    projectRef: 'project.vexlife',
    threadRef: 'thread.scheduler.simulation',
    channelRef: 'channel.scheduler.simulation',
    originalContentHash: 'a'.repeat(64),
    desiredOutcome: { intentKey: 'VALIDATE_WORKGRAPH', summary: 'Execute one complete deterministic no-effect scheduler loop' },
    constraints: ['mock-only', 'no-external-effects'],
    createdAt: FORMED,
    sourceLineageRef: 'lineage.scheduler.simulation'
  }, registry);
  const node = createWorkNode({
    workNodeRef: 'work.scheduler.simulation',
    rootIntentRef: intent.intentRef,
    parentWorkNodeRef: 'work.scheduler.simulation.parent',
    purpose: 'Execute one complete deterministic scheduler loop',
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
    completionGateRefs: ['completion-gate.intent.contract-valid'],
    returnRouteRef: 'return-route.intent.verify-transition',
    sourceRefs: ['blueprint/intent-scheduler-registry.json'],
    createdAt: FORMED
  }, registry);
  const dependentNode = createWorkNode({
    ...node,
    semanticFingerprint: undefined,
    workNodeRef: 'work.scheduler.simulation.dependent',
    parentWorkNodeRef: null,
    purpose: 'Become ready only after exact scheduler completion evidence',
    dependencyRefs: [node.workNodeRef],
    dependencyRequirements: [{
      dependencyWorkNodeRef: node.workNodeRef,
      expectedTransitionRef: node.expectedTransitionRef,
      allowedDispositions: ['COMPLETED']
    }],
    childRefs: []
  }, registry);
  const parentNode = createWorkNode({
    ...node,
    semanticFingerprint: undefined,
    workNodeRef: 'work.scheduler.simulation.parent',
    parentWorkNodeRef: null,
    purpose: 'Converge only after exact terminal child evidence',
    state: 'WAITING_DEPENDENCIES',
    dependencyRefs: [],
    childRefs: [node.workNodeRef]
  }, registry);
  const nodes = [node, dependentNode, parentNode];
  const transitions = nodes.flatMap((workNode) => {
    const states = workNode.state === 'WAITING_DEPENDENCIES'
      ? ['DECOMPOSED', 'PLAN_VALIDATED', 'WAITING_DEPENDENCIES']
      : ['DECOMPOSED', 'PLAN_VALIDATED', 'READY'];
    let priorState = 'CAPTURED';
    return states.map((nextState, sequence) => {
      const transition = {
        transitionRef: `transition.scheduler.simulation.${workNode.workNodeRef}.${sequence}`,
        workNodeRef: workNode.workNodeRef,
        sequence,
        priorState,
        nextState,
        reason: 'source-managed deterministic simulation',
        actorRef: 'person.vexlife.owner',
        actorRoleRef: 'role.vex.operations',
        processRef: 'process.vexlife.intent.verify-transition',
        sourceRefs: ['blueprint/intent-scheduler-registry.json'],
        createdAt: `2026-07-31T00:00:0${sequence}.000Z`
      };
      priorState = nextState;
      return transition;
    });
  });
  const bindingRefs = Object.fromEntries(registry.bindingFields.map((field) => [
    field,
    [...new Set(nodes.flatMap((item) => Array.isArray(item[field]) ? item[field] : [item[field]]).filter(Boolean))].sort()
  ]));
  const graph = createIntentWorkgraph({
    graphRef: 'intent-workgraph.scheduler.simulation',
    intent,
    nodes,
    transitions,
    receipts: [],
    bindingRefs,
    createdAt: FORMED
  }, registry);

  const resourceOne = runtimeResource(1, {
    formedAt: FORMED,
    observedAt: OBSERVED,
    expiresAt: EXPIRES,
    cpuLoadPct: 10,
    ramAvailableMb: 8192
  });
  const runtimeOne = runtimeTrust(schedulerRegistry, resourceOne, 1, {
    formedAt: FORMED,
    observedAt: OBSERVED,
    expiresAt: EXPIRES
  });
  journeyStates.push('RUNTIME_SNAPSHOT_CURRENT');
  const optionsOne = schedulerOptions({
    bundle,
    graph,
    node,
    trustSnapshot,
    resourceSnapshot: resourceOne,
    runtimeTrustSnapshot: runtimeOne,
    generation: 1,
    formedAt: FORMED,
    observedAt: OBSERVED,
    expiresAt: EXPIRES
  });
  const relay = new ToolResultRelay(null, { schedulerRegistry });
  const authority = new WorkerLeaseAuthority({ sourceRef: runtimeOne.sourceRef });
  const scheduler = new SingleWorkerIntentScheduler({
    workerRef: runtimeOne.workerRef,
    schedulerInstanceRef: 'instance.intent-scheduler.simulation',
    schedulerRegistry,
    runtimeAuthority: authority,
    toolRelay: relay
  });
  const queue = scheduler.admit(graph, optionsOne);
  if (queue.state !== 'ADMITTED') throw new Error('simulation queue was not admitted');
  journeyStates.push('QUEUE_ADMITTED');
  const running = scheduler.leaseSelected(contextInput(1, {
    formedAt: FORMED,
    observedAt: OBSERVED,
    expiresAt: EXPIRES
  }));
  if (!running.admitted) throw new Error('simulation worker was not leased');
  journeyStates.push('WORKER_LEASED');

  const toolCall = createToolCall({
    toolCallRef: 'tool-call.scheduler.simulation.1',
    workNodeRef: node.workNodeRef,
    toolRef: 'tool.mock.inspect',
    effectRef: 'effect.mock.read',
    arguments: { sourceRef: 'blueprint/intent-scheduler-registry.json' },
    schedulerGeneration: 1,
    cancellationTokenRef: running.contextLease.cancellationTokenRef,
    sourceEvidenceRef: 'source.blueprint.intent-scheduler-registry',
    sourceEvidenceHash: semanticHash(schedulerRegistry),
    proposedAt: OBSERVED,
    timeoutAt: EXPIRES,
    cancellationPolicy: 'CHECKPOINT_THEN_CANCEL'
  }, {
    contextLease: running.contextLease,
    capabilityLease: running.capabilityLease,
    effectLease: running.effectLease,
    resourceLease: running.resourceLease,
    workerLease: running.workerLease,
    runtimeTrustSnapshot: runtimeOne,
    schedulerRegistry,
    observedAt: OBSERVED
  });
  relay.register(toolCall);
  scheduler.syncRelayState();
  journeyStates.push('MOCK_TOOL_PROPOSED');
  const accepted = relay.accept(exactMockResult(toolCall, 'observation.scheduler.simulation.1'), {
    receivedAt: RESULT_AT
  });
  if (!accepted.accepted) throw new Error(`simulation mock result was rejected: ${accepted.reason}`);
  journeyStates.push('MOCK_TOOL_RESULT_ACCEPTED');
  const heldToolCall = createToolCall({
    toolCallRef: 'tool-call.scheduler.simulation.held.1',
    workNodeRef: node.workNodeRef,
    toolRef: 'tool.mock.inspect',
    effectRef: 'effect.mock.read',
    arguments: { sourceRef: 'blueprint/intent-scheduler-registry.json' },
    schedulerGeneration: 1,
    cancellationTokenRef: running.contextLease.cancellationTokenRef,
    sourceEvidenceRef: 'source.blueprint.intent-scheduler-registry',
    sourceEvidenceHash: semanticHash(schedulerRegistry),
    proposedAt: RESULT_AT,
    timeoutAt: EXPIRES,
    cancellationPolicy: 'CHECKPOINT_THEN_CANCEL'
  }, {
    contextLease: running.contextLease,
    capabilityLease: running.capabilityLease,
    effectLease: running.effectLease,
    resourceLease: running.resourceLease,
    workerLease: running.workerLease,
    runtimeTrustSnapshot: runtimeOne,
    schedulerRegistry,
    observedAt: RESULT_AT
  });
  relay.register(heldToolCall);
  const sourceBindings = [{
    sourceRef: 'blueprint/intent-scheduler-registry.json',
    sourceHash: semanticHash(schedulerRegistry)
  }];
  const checkpointed = scheduler.checkpoint({
    checkpointRef: 'checkpoint.scheduler.simulation.1',
    workNodeRef: node.workNodeRef,
    lastCompletedStep: 'mock-observation-reinjected',
    selectedSourceRefs: ['blueprint/intent-scheduler-registry.json'],
    selectedContextRefs: [running.contextLease.leaseRef],
    producedArtifactRefs: [],
    producedReceiptRefs: [queue.admissionReceipt.admissionReceiptRef],
    openQuestions: [],
    nextSafeAction: 'RESUME_WITH_FRESH_RUNTIME',
    pendingToolCallRef: heldToolCall.toolCallRef,
    sourceBindings,
    formedAt: CHECKPOINT_AT
  }, {
    releaseReceiptRef: 'release.scheduler.simulation.checkpoint.1',
    releasedAt: CHECKPOINT_AT
  });
  if (scheduler.projections.health.value.state === 'CLEAR') {
    throw new Error('released checkpoint leases incorrectly projected CLEAR Health');
  }
  journeyStates.push('CHECKPOINT_RELEASED');
  const replayedHeldRelay = new ToolResultRelay(relay.snapshot, { schedulerRegistry });
  if (replayedHeldRelay.snapshot.semanticFingerprint !== relay.snapshot.semanticFingerprint ||
      replayedHeldRelay.snapshot.entries.find((item) => item.toolCallRef === heldToolCall.toolCallRef)?.state !== 'HELD') {
    throw new Error('simulation typed relay replay did not derive the exact held state');
  }
  journeyStates.push('TYPED_RELAY_REPLAY_CURRENT');
  const heldBeforeRejectedClose = relay.snapshot.semanticFingerprint;
  let rejectedOutOfBandHeldClose = false;
  try {
    relay.cancel(heldToolCall.toolCallRef, {
      receiptRef: 'receipt.scheduler.simulation.out-of-band-held-close',
      closedAt: RESUME_FORMED,
      reason: 'OUT_OF_BAND_CLOSE'
    });
  } catch (error) {
    rejectedOutOfBandHeldClose = /scheduler-owned disposition before mutation/.test(error.message);
  }
  if (!rejectedOutOfBandHeldClose || relay.snapshot.semanticFingerprint !== heldBeforeRejectedClose) {
    throw new Error('simulation did not reject out-of-band held closure before mutation');
  }
  journeyStates.push('OUT_OF_BAND_HELD_CLOSE_REJECTED_UNCHANGED');

  const resourceTwo = runtimeResource(2, {
    formedAt: RESUME_FORMED,
    observedAt: RESUME_OBSERVED,
    expiresAt: RESUME_EXPIRES,
    cpuLoadPct: 18,
    ramAvailableMb: 7680
  });
  const runtimeTwo = runtimeTrust(schedulerRegistry, resourceTwo, 2, {
    formedAt: RESUME_FORMED,
    observedAt: RESUME_OBSERVED,
    expiresAt: RESUME_EXPIRES
  });
  journeyStates.push('FRESH_RESOURCE_OBSERVED');
  const optionsTwo = schedulerOptions({
    bundle,
    graph,
    node,
    trustSnapshot,
    resourceSnapshot: resourceTwo,
    runtimeTrustSnapshot: runtimeTwo,
    generation: 2,
    formedAt: RESUME_FORMED,
    observedAt: RESUME_OBSERVED,
    expiresAt: RESUME_EXPIRES
  });
  const resumed = scheduler.resume(checkpointed.checkpoint.checkpointRef, {
    graph,
    options: optionsTwo,
    sourceBindings,
    contextInput: contextInput(2, {
      formedAt: RESUME_FORMED,
      observedAt: RESUME_OBSERVED,
      expiresAt: RESUME_EXPIRES
    }),
    authorizeObservationRef: accepted.observation.observationRef,
    heldToolDisposition: {
      action: 'RESUME',
      authorizationRef: 'authorization.scheduler.simulation.held.resume.2',
      receiptRef: 'receipt.scheduler.simulation.held.resume.2',
      successorCallInput: {
        toolCallRef: 'tool-call.scheduler.simulation.held.resume.2',
        proposedAt: RESUME_OBSERVED,
        timeoutAt: RESUME_EXPIRES
      }
    }
  });
  if (resumed.state !== 'RESUMED') throw new Error('simulation did not resume with fresh generation');
  journeyStates.push('HELD_TOOL_DISPOSITION_COMMITTED');
  journeyStates.push('FRESH_GENERATION_RESUMED');
  const reinjected = relay.reinject(resumed.contextLease, accepted.observation, { observedAt: RESUME_OBSERVED });
  if (!reinjected.accepted) throw new Error(`simulation successor observation was not reinjected: ${reinjected.reason}`);
  scheduler.syncRelayState();
  journeyStates.push('OBSERVATION_REINJECTED_ONCE');
  const completionEvidence = {
    verificationReceiptRef: 'verification.scheduler.simulation.completion.2',
    workNodeRef: node.workNodeRef,
    nodeFingerprint: node.semanticFingerprint,
    graphRef: graph.graphRef,
    graphFingerprint: graph.semanticFingerprint,
    runtimeSnapshotFingerprint: runtimeTwo.semanticFingerprint,
    schedulerInstanceRef: scheduler.schedulerInstanceRef,
    schedulerGeneration: 2,
    expectedTransitionRef: node.expectedTransitionRef,
    gateObservations: node.completionGateRefs.map((completionGateRef) => ({
      gateResultRef: `gate-result.scheduler.simulation.${completionGateRef}.2`,
      completionGateRef,
      sourceObservationRef: `observation.scheduler.simulation.completion.${completionGateRef}.2`,
      sourceObservationHash: semanticHash({ completionGateRef, state: 'COMPLETED', observedAt: CANCEL_AT }),
      observedBeforeState: node.state,
      observedAfterState: 'COMPLETED',
      result: 'PASSED'
    })),
    observedBeforeState: node.state,
    observedAfterState: 'COMPLETED',
    returnRouteRef: node.returnRouteRef,
    formedAt: RESUME_FORMED,
    observedAt: CANCEL_AT,
    expiresAt: RESUME_EXPIRES,
    selfCertified: false
  };
  const completed = scheduler.completeActive({
    graph,
    intentRegistry: registry,
    trustSnapshot,
    registeredProcessRefs: bundle.factory.processes.map((item) => item.processRef),
    registeredRoleRefs: bundle.blueprint.roles.map((item) => item.roleRef),
    completionEvidence,
    completionReceiptRef: 'receipt.scheduler.simulation.completion.2',
    releaseReceiptRef: 'release.scheduler.simulation.complete.2',
    completedAt: CANCEL_AT
  });
  if (!completed.changed || scheduler.aggregate.phase !== 'COMPLETED' || scheduler.projections.health.value.state === 'CLEAR') {
    throw new Error('simulation normal completion did not close leases distinctly');
  }
  journeyStates.push('WORKGRAPH_COMPLETION_VERIFIED');
  journeyStates.push('DEPENDENT_READY_PARENT_CONVERGENCE_PROVEN');
  journeyStates.push('COMPLETED_CLOSED');

  const cancellationRelay = new ToolResultRelay(null, { schedulerRegistry });
  const cancellationScheduler = new SingleWorkerIntentScheduler({
    workerRef: runtimeOne.workerRef,
    schedulerInstanceRef: 'instance.intent-scheduler.simulation.cancellation',
    schedulerRegistry,
    runtimeAuthority: authority,
    toolRelay: cancellationRelay
  });
  cancellationScheduler.admit(graph, optionsOne);
  const cancellationRunning = cancellationScheduler.leaseSelected(contextInput(1, {
    formedAt: FORMED,
    observedAt: OBSERVED,
    expiresAt: EXPIRES
  }));
  if (!cancellationRunning.admitted) throw new Error('separate cancellation journey could not lease worker');
  const cancelled = cancellationScheduler.cancelActive({
    releaseReceiptRef: 'release.scheduler.simulation.cancellation-alternative',
    releasedAt: CHECKPOINT_AT,
    reason: 'SIMULATED_USER_CANCELLED'
  });
  if (!cancelled.changed || cancellationScheduler.aggregate.phase !== 'CANCELLED') {
    throw new Error('separate cancellation journey did not close as cancellation');
  }

  const requiredJourney = schedulerRegistry.simulationContract.requiredJourneyStates;
  const journeyComplete = JSON.stringify(journeyStates) === JSON.stringify(requiredJourney);
  const repository = collectRepositoryEvidence(root);
  const sourceManifest = buildSourceManifest(root);
  const blueprintValidation = validateBlueprint(bundle);
  const leaseFingerprints = {
    initial: {
      worker: running.workerLease.semanticFingerprint,
      context: running.contextLease.semanticFingerprint,
      resource: running.resourceLease.semanticFingerprint,
      capability: running.capabilityLease.semanticFingerprint,
      effect: running.effectLease.semanticFingerprint,
      occupancy: running.occupancy.semanticFingerprint
    },
    checkpointReleased: Object.fromEntries(Object.entries(checkpointed.transitionedLeases)
      .map(([key, lease]) => [key, lease.semanticFingerprint])),
    resumed: {
      worker: resumed.workerLease.semanticFingerprint,
      context: resumed.contextLease.semanticFingerprint,
      resource: resumed.resourceLease.semanticFingerprint,
      capability: resumed.capabilityLease.semanticFingerprint,
      effect: resumed.effectLease.semanticFingerprint,
      occupancy: resumed.occupancy.semanticFingerprint
    },
    completed: Object.fromEntries(Object.entries(completed.transitionedLeases)
      .map(([key, lease]) => [key, lease.semanticFingerprint]))
  };
  const receipt = {
    schemaVersion: 'vexlife.intent-scheduler-simulation-receipt/v1',
    receiptRef: `receipt.intent-scheduler.simulation.${sourceManifest.treeSha256.slice(0, 24)}`,
    contractRef: schedulerRegistry.simulationContract.contractRef,
    state: journeyComplete ? 'PASS' : 'FAILED',
    currentness: 'CURRENT',
    mode: 'DETERMINISTIC_FAKE_MODEL_AND_MOCK_TOOL_ONLY',
    candidateHeadSha: repository.git.candidateHeadSha,
    testedCheckoutSha: repository.git.checkoutSha,
    testedMergeSha: repository.git.testedMergeSha,
    baseSha: repository.git.baseSha,
    sourceTreeSha256: sourceManifest.treeSha256,
    blueprintHash: blueprintValidation.semanticHash,
    schedulerRegistryHash: semanticHash(schedulerRegistry),
    runtimeVersion: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      release: os.release()
    },
    journeyStates,
    leaseFingerprints,
    runtimeSnapshotFingerprints: [
      runtimeOne.semanticFingerprint,
      runtimeTwo.semanticFingerprint
    ],
    resourceSnapshotFingerprints: [
      resourceOne.semanticFingerprint,
      resourceTwo.semanticFingerprint
    ],
    admissionReceiptFingerprints: [
      queue.admissionReceipt.semanticFingerprint,
      resumed.queue.admissionReceipt.semanticFingerprint
    ],
    toolCallFingerprint: toolCall.semanticFingerprint,
    observationFingerprint: accepted.observation.semanticFingerprint,
    checkpointFingerprint: checkpointed.checkpoint.semanticFingerprint,
    heldToolDispositionFingerprint: resumed.heldToolDisposition.receipt.semanticFingerprint,
    heldToolAuthorizationFingerprint: resumed.heldToolDisposition.authorization.semanticFingerprint,
    completionVerificationFingerprint: completed.completionVerification.semanticFingerprint,
    completionEvidenceLineageFingerprint: completed.completionEvidenceLineage.semanticFingerprint,
    workgraphTransitionFingerprint: completed.canonicalWorkgraphTransition.semanticFingerprint,
    completionFingerprint: completed.completionReceipt.semanticFingerprint,
    returnRouteFingerprint: completed.returnRouteReceipt.semanticFingerprint,
    successorAuthorizationFingerprint: resumed.successorContextAuthorization.semanticFingerprint,
    workgraphConvergenceProof: {
      priorNodeState: node.state,
      finalNodeState: completed.workgraph.nodes.find((item) => item.workNodeRef === node.workNodeRef).state,
      canonicalTransitionRef: completed.canonicalWorkgraphTransition.transitionRef,
      canonicalReceiptRef: completed.completionReceipt.receiptRef,
      dependentReadyRefs: completed.dependentReadyRefs,
      parentConvergenceReadyRefs: completed.parentConvergenceReadyRefs
    },
    completionCurrentnessAndLineageProof: {
      verificationObservedAt: completed.completionVerification.observedAt,
      consumedAt: CANCEL_AT,
      verificationExpiresAt: completed.completionVerification.expiresAt,
      schedulerObservedAtBeforeCompletion: RESUME_OBSERVED,
      verificationReceiptRef: completed.completionEvidenceLineage.verificationReceiptRef,
      verificationFingerprint: completed.completionEvidenceLineage.verificationFingerprint,
      gateEvidence: completed.completionEvidenceLineage.gateEvidence,
      canonicalTransitionSourceRefs: completed.canonicalWorkgraphTransition.sourceRefs,
      canonicalReceiptSourceRefs: completed.completionReceipt.sourceRefs,
      canonicalReceiptSourceHashes: completed.completionReceipt.sourceHashes
    },
    relayReplayProof: {
      registeredStateMachineRef: schedulerRegistry.relayStateMachine.policyRef,
      typedEventContractRefs: schedulerRegistry.relayTransitionContracts.map((item) => item.contractRef).sort(),
      replayedHeldLedgerFingerprint: replayedHeldRelay.snapshot.semanticFingerprint,
      heldPriorState: 'HELD',
      disposition: resumed.heldToolDisposition.receipt.action,
      derivedTerminalState: relay.snapshot.entries.find((item) => item.toolCallRef === heldToolCall.toolCallRef).state,
      successorToolCallRef: resumed.heldToolDisposition.successorCall.toolCallRef,
      schedulerAuthorizationFingerprint: resumed.heldToolDisposition.authorization.semanticFingerprint,
      outOfBandHeldCloseRejectedBeforeMutation: rejectedOutOfBandHeldClose,
      rejectedClosePreservedLedgerFingerprint: heldBeforeRejectedClose
    },
    separateCancellationFingerprint: cancelled.cancellationReceipt.semanticFingerprint,
    separateCancellationProof: {
      phase: cancellationScheduler.aggregate.phase,
      cancellationReceiptFingerprint: cancelled.cancellationReceipt.semanticFingerprint,
      leaseLifecycle: [...new Set(Object.values(cancelled.transitionedLeases).map((lease) => lease.lifecycle))]
    },
    relayLedgerFingerprint: relay.snapshot.semanticFingerprint,
    finalAggregateFingerprint: scheduler.aggregate.semanticFingerprint,
    finalProjection: {
      runtime: scheduler.projections.runtime.value,
      health: scheduler.projections.health.value,
      terrain: scheduler.projections.terrain.value,
      guide: scheduler.projections.guide.value
    },
    orphanedPendingToolCalls: relay.snapshot.entries.filter((item) => ['PENDING', 'HELD', 'ACCEPTED'].includes(item.state)).length,
    externalEffectsExecuted: false,
    selfCertifiedRuntimeEvidence: false,
    formedAt: new Date().toISOString()
  };
  receipt.semanticFingerprint = semanticHash(receipt);
  if (writeReceipt) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    writeJson(target, receipt);
  }
  return {
    receipt: Object.freeze(receipt),
    receiptPath: path.relative(root, target).split(path.sep).join('/'),
    scheduler,
    relay
  };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const receiptIndex = args.indexOf('--receipt');
  if (args.some((item, index) => item !== '--receipt' && index !== receiptIndex + 1) ||
      (receiptIndex >= 0 && !args[receiptIndex + 1])) {
    console.error('Usage: npm run scheduler:simulate -- [--receipt <safe-generated-path>]');
    process.exit(2);
  }
  const result = runSchedulerSimulation({
    receiptPath: receiptIndex >= 0 ? args[receiptIndex + 1] : null
  });
  console.log(JSON.stringify({
    state: result.receipt.state,
    currentness: result.receipt.currentness,
    receiptPath: result.receiptPath,
    candidateHeadSha: result.receipt.candidateHeadSha,
    testedCheckoutSha: result.receipt.testedCheckoutSha,
    testedMergeSha: result.receipt.testedMergeSha,
    sourceTreeSha256: result.receipt.sourceTreeSha256,
    blueprintHash: result.receipt.blueprintHash,
    schedulerRegistryHash: result.receipt.schedulerRegistryHash,
    journeyStates: result.receipt.journeyStates,
    finalHealthState: result.receipt.finalProjection.health.state,
    orphanedPendingToolCalls: result.receipt.orphanedPendingToolCalls,
    externalEffectsExecuted: result.receipt.externalEffectsExecuted,
    semanticFingerprint: result.receipt.semanticFingerprint
  }, null, 2));
  if (result.receipt.state !== 'PASS') process.exitCode = 1;
}

// [VXG RealForever]
