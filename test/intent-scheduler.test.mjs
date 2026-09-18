import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Atlas } from '../src/core/atlas.mjs';
import {
  buildIdentityIndex,
  loadBlueprint,
  validateBlueprint
} from '../src/core/blueprint.mjs';
import { createContextLease } from '../src/core/context-lease.mjs';
import { createIntentCheckpoint, validateCheckpointResume } from '../src/core/intent-checkpoint.mjs';
import {
  admitIntentSchedulerQueue,
  createCapabilityLease,
  createEffectLease,
  selectNextAdmittedNode,
  SingleWorkerIntentScheduler,
  WorkerLeaseAuthority
} from '../src/core/intent-scheduler.mjs';
import {
  createIntentEnvelope,
  createIntentTrustSnapshot,
  createIntentWorkgraph,
  createWorkNode
} from '../src/core/intent-workgraph.mjs';
import { compileRegistryPack } from '../src/core/registry.mjs';
import {
  createResourceSnapshot,
  evaluateResourceAdmission
} from '../src/core/resource-admission.mjs';
import {
  createSchedulerRuntimeTrustSnapshot,
  validateIntegratedSchedulerSimulationReceipt,
  validateIntentSchedulerRegistry
} from '../src/core/scheduler-runtime-trust.mjs';
import { createToolCall, ToolResultRelay } from '../src/core/tool-result-relay.mjs';
import { resolveSafeGeneratedReceiptPath, semanticHash } from '../src/core/utils.mjs';
import { runSchedulerSimulation } from '../scripts/scheduler-simulate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = loadBlueprint(root);
const intentRegistry = bundle.intentRegistry;
const schedulerRegistry = bundle.schedulerRegistry;
const registeredProcessRefs = bundle.factory.processes.map((item) => item.processRef);
const registeredRoleRefs = bundle.blueprint.roles.map((item) => item.roleRef);
const FORMED = '2026-07-31T12:00:00.000Z';
const OBSERVED = '2026-07-31T12:05:00.000Z';
const RESULT_AT = '2026-07-31T12:06:00.000Z';
const CHECKPOINT_AT = '2026-07-31T12:07:00.000Z';
const RESUME_FORMED = '2026-07-31T12:08:00.000Z';
const RESUME_OBSERVED = '2026-07-31T12:09:00.000Z';
const CANCEL_AT = '2026-07-31T12:10:00.000Z';
const EXPIRES = '2026-07-31T13:00:00.000Z';
const RESUME_EXPIRES = '2026-07-31T13:08:00.000Z';
const SOURCE_HASH = semanticHash({ fixture: 'intent-scheduler-test-runtime/v1' });
const SOURCE_BINDINGS = [{
  sourceRef: 'source.work.test',
  sourceHash: semanticHash({ sourceRef: 'source.work.test', fixtureVersion: 1 })
}];
let schedulerInstanceSequence = 0;

function envelope(ref = 'intent.scheduler.test') {
  return createIntentEnvelope({
    intentRef: ref,
    originMessageRef: `message.${ref}`,
    originSpeakerRef: 'person.test.human',
    recipientRoleRef: 'role.vex.developer',
    projectRef: 'project.scheduler.test',
    threadRef: 'thread.scheduler.test',
    channelRef: 'channel.scheduler.test',
    originalContentHash: 'a'.repeat(64),
    desiredOutcome: { intentKey: 'VALIDATE_WORKGRAPH', summary: 'Exercise scheduler contracts' },
    constraints: [],
    createdAt: FORMED,
    sourceLineageRef: 'lineage.scheduler.test'
  }, intentRegistry);
}

function workNode(ref, overrides = {}) {
  return createWorkNode({
    workNodeRef: ref,
    rootIntentRef: 'intent.scheduler.test',
    purpose: `Schedule ${ref}`,
    processRef: 'process.vexlife.intent.validate-workgraph',
    state: 'READY',
    dependencyRefs: [],
    childRefs: [],
    roleRef: 'role.vex.developer',
    priorityClass: 'NORMAL',
    applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs: [],
    applicableBurdenReleaseRefs: [],
    capabilityEnvelopeRef: `capability-envelope.${ref}`,
    effectEnvelopeRef: `effect-envelope.${ref}`,
    resourceEnvelopeRef: `resource-envelope.${ref}`,
    expectedTransitionRef: `expected-transition.${ref}`,
    completionGateRefs: [`completion-gate.${ref}`],
    returnRouteRef: `return-route.${ref}`,
    sourceRefs: ['source.work.test'],
    createdAt: FORMED,
    ...overrides
  }, intentRegistry);
}

function bindingRefs(nodes) {
  return Object.fromEntries(intentRegistry.bindingFields.map((field) => [
    field,
    [...new Set(nodes.flatMap((item) => Array.isArray(item[field]) ? item[field] : [item[field]]).filter(Boolean))].sort()
  ]));
}

function formationTransitions(nodes) {
  return nodes.flatMap((node) => {
    const route = node.state === 'HELD_UNKNOWN'
      ? ['HELD_UNKNOWN']
      : ['DECOMPOSED', 'PLAN_VALIDATED', 'READY'];
    let priorState = 'CAPTURED';
    return route.map((nextState, sequence) => {
      const transition = {
        transitionRef: `transition.scheduler.${node.workNodeRef}.${sequence}`,
        workNodeRef: node.workNodeRef,
        sequence,
        priorState,
        nextState,
        reason: 'scheduler test formation',
        actorRef: 'vex.test',
        actorRoleRef: 'role.vex.developer',
        processRef: 'process.vexlife.intent.verify-transition',
        sourceRefs: [`source.transition.${node.workNodeRef}`],
        createdAt: `2026-07-31T12:00:0${sequence}.000Z`
      };
      priorState = nextState;
      return transition;
    });
  });
}

function graph(nodes) {
  return createIntentWorkgraph({
    graphRef: `intent-workgraph.scheduler.test.${semanticHash(nodes.map((item) => item.workNodeRef)).slice(0, 12)}`,
    intent: envelope(),
    nodes,
    transitions: formationTransitions(nodes),
    receipts: [],
    bindingRefs: bindingRefs(nodes),
    createdAt: FORMED
  }, intentRegistry);
}

function trustSnapshot(candidate) {
  return createIntentTrustSnapshot({
    schemaVersion: 'vexlife.intent-trust-snapshot/v0',
    snapshotRef: `trust-snapshot.scheduler.test.${candidate.graphRef.split('.').at(-1)}`,
    sourceRef: 'test/intent-scheduler.test.mjs#trust',
    formationRef: 'formation.scheduler.trust.test',
    formedAt: FORMED,
    currentness: 'CURRENT',
    bindingRefs: bindingRefs(candidate.nodes),
    actorRefs: ['person.test.human', 'vex.test'],
    decisionRefs: [],
    authorizationBindings: []
  }, intentRegistry);
}

function resource(generation = 1, overrides = {}) {
  const resume = generation > 1;
  return createResourceSnapshot({
    snapshotRef: `resource-snapshot.scheduler.test.${generation}`,
    generation,
    sourceRef: 'source.intent-scheduler.test-runtime',
    sourceHash: SOURCE_HASH,
    formationRef: `formation.scheduler.test.resource.${generation}`,
    evidenceClass: 'SIMULATED_CURRENT',
    cpuLoadPct: resume ? 24 : 20,
    cpuConcurrencyLimit: 4,
    cpuActiveCount: 0,
    ramAvailableMb: resume ? 15360 : 16384,
    ramReservedMb: 1024,
    gpuAvailable: true,
    vramAvailableMb: 8192,
    vramReservedMb: 0,
    modelResident: true,
    activeModelTurn: false,
    activeHeavyTool: false,
    interactiveWaitState: 'IDLE',
    backgroundWorkAdmission: 'ADMITTED',
    thermalPowerState: 'NOT_EXPOSED',
    currentness: 'CURRENT',
    formedAt: resume ? RESUME_FORMED : FORMED,
    observedAt: resume ? RESUME_OBSERVED : OBSERVED,
    expiresAt: resume ? RESUME_EXPIRES : EXPIRES,
    ...overrides
  });
}

function runtimeTrust(resourceSnapshot, generation = resourceSnapshot.generation, overrides = {}) {
  const resume = generation > 1;
  return createSchedulerRuntimeTrustSnapshot({
    snapshotRef: `runtime-snapshot.scheduler.test.${generation}`,
    sourceRef: resourceSnapshot.sourceRef,
    sourceHash: resourceSnapshot.sourceHash,
    formationRef: `formation.scheduler.test.runtime.${generation}`,
    evidenceClass: 'SIMULATED_CURRENT',
    schedulerGeneration: generation,
    formedAt: resume ? RESUME_FORMED : FORMED,
    observedAt: resume ? RESUME_OBSERVED : OBSERVED,
    expiresAt: resume ? RESUME_EXPIRES : EXPIRES,
    workerRef: 'worker.model.test.primary',
    actorRef: 'vex.test',
    roleRef: 'role.vex.developer',
    claimRef: 'claim.scheduler.test',
    occupancyRef: `occupancy.scheduler.test.${generation}`,
    leaseAuthorityRef: 'authority.intent-scheduler.test-runtime',
    resourceSnapshotRef: resourceSnapshot.snapshotRef,
    resourceSnapshotFingerprint: resourceSnapshot.semanticFingerprint,
    currentness: 'CURRENT',
    ...overrides
  }, { schedulerRegistry, resourceSnapshot });
}

function runtimeBindings(candidate, snapshot, runtime, generation = 1) {
  const resume = generation > 1;
  const formedAt = resume ? RESUME_FORMED : FORMED;
  const observedAt = resume ? RESUME_OBSERVED : OBSERVED;
  const expiresAt = resume ? RESUME_EXPIRES : EXPIRES;
  const occupancyByNodeRef = {};
  const capabilityLeaseByNodeRef = {};
  const effectLeaseByNodeRef = {};
  const resourceRequestByNodeRef = {};
  const resourceLeaseRefByNodeRef = {};
  const common = {
    runtimeSnapshotRef: runtime.snapshotRef,
    runtimeSnapshotFingerprint: runtime.semanticFingerprint,
    schedulerGeneration: generation,
    authorityRef: runtime.leaseAuthorityRef,
    sourceRef: runtime.sourceRef,
    sourceHash: runtime.sourceHash,
    formedAt,
    observedAt,
    expiresAt,
    currentness: 'CURRENT',
    lifecycle: 'ACTIVE'
  };
  for (const node of candidate.nodes) {
    occupancyByNodeRef[node.workNodeRef] = {
      occupancyRef: runtime.occupancyRef,
      actorRef: runtime.actorRef,
      roleRef: node.roleRef,
      workNodeRef: node.workNodeRef,
      graphFingerprint: candidate.semanticFingerprint,
      claimRef: runtime.claimRef,
      formationRef: `formation.occupancy.${node.workNodeRef}.${generation}`,
      ...common
    };
    capabilityLeaseByNodeRef[node.workNodeRef] = {
      leaseRef: `capability-lease.${node.workNodeRef}.${generation}`,
      workNodeRef: node.workNodeRef,
      graphFingerprint: candidate.semanticFingerprint,
      trustSnapshotFingerprint: snapshot.semanticFingerprint,
      envelopeRef: node.capabilityEnvelopeRef,
      formationRef: `formation.capability.${node.workNodeRef}.${generation}`,
      toolRefs: ['tool.mock.inspect'],
      ...common
    };
    effectLeaseByNodeRef[node.workNodeRef] = {
      leaseRef: `effect-lease.${node.workNodeRef}.${generation}`,
      workNodeRef: node.workNodeRef,
      graphFingerprint: candidate.semanticFingerprint,
      trustSnapshotFingerprint: snapshot.semanticFingerprint,
      envelopeRef: node.effectEnvelopeRef,
      formationRef: `formation.effect.${node.workNodeRef}.${generation}`,
      effectDisposition: 'EFFECT_ENVELOPE_BOUND',
      allowedEffectRefs: ['effect.mock.read'],
      ...common
    };
    resourceRequestByNodeRef[node.workNodeRef] = {
      cpuSlots: 1,
      ramMb: 256,
      vramMb: 128,
      modelTurn: true,
      heavyTool: false,
      background: node.background === true || node.priorityClass === 'LOW'
    };
    resourceLeaseRefByNodeRef[node.workNodeRef] = `resource-lease.${node.workNodeRef}.${generation}`;
  }
  return {
    occupancyByNodeRef,
    capabilityLeaseByNodeRef,
    effectLeaseByNodeRef,
    resourceRequestByNodeRef,
    resourceLeaseRefByNodeRef
  };
}

function admission(nodes, {
  generation = 1,
  candidate = graph(nodes),
  trust = trustSnapshot(candidate),
  resourceSnapshot = resource(generation),
  runtime = runtimeTrust(resourceSnapshot, generation)
} = {}) {
  const resume = generation > 1;
  return {
    candidate,
    trust,
    runtime,
    options: {
      intentRegistry,
      schedulerRegistry,
      registeredProcessRefs,
      registeredRoleRefs,
      trustSnapshot: trust,
      runtimeTrustSnapshot: runtime,
      resourceSnapshot,
      ...runtimeBindings(candidate, trust, runtime, generation),
      workerRef: runtime.workerRef,
      schedulerGeneration: generation,
      formedAt: resume ? RESUME_FORMED : FORMED,
      observedAt: resume ? RESUME_OBSERVED : OBSERVED,
      expiresAt: resume ? RESUME_EXPIRES : EXPIRES
    }
  };
}

function contextInput(generation = 1, overrides = {}) {
  const resume = generation > 1;
  return {
    leaseRef: `context-lease.scheduler.test.${generation}`,
    cancellationTokenRef: `cancellation-token.scheduler.test.${generation}`,
    foundationKernelRef: 'foundation-kernel.compact',
    roleFrameRef: 'role-frame.developer',
    intentFrameRef: 'intent-frame.scheduler.test',
    selectedAtlasRefs: ['module.vexlife.core.intent-scheduler'],
    selectedSourceRefs: ['source.work.test'],
    applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs: [],
    applicableReleaseRefs: [],
    inputTokenEstimate: 300,
    reservedOutputTokens: 200,
    hardTokenLimit: 1000,
    formedAt: resume ? RESUME_FORMED : FORMED,
    observedAt: resume ? RESUME_OBSERVED : OBSERVED,
    expiresAt: resume ? RESUME_EXPIRES : EXPIRES,
    checkpointReturnRef: 'return-route.scheduler.checkpoint',
    ...overrides
  };
}

function makeScheduler({
  relay = new ToolResultRelay(null, { schedulerRegistry }),
  authority = new WorkerLeaseAuthority({ sourceRef: 'source.intent-scheduler.test-runtime' }),
  schedulerInstanceRef = `instance.intent-scheduler.test.${schedulerInstanceSequence += 1}`
} = {}) {
  return {
    relay,
    authority,
    scheduler: new SingleWorkerIntentScheduler({
      workerRef: 'worker.model.test.primary',
      schedulerInstanceRef,
      schedulerRegistry,
      runtimeAuthority: authority,
      toolRelay: relay
    })
  };
}

function activeFixture(ref = 'work.scheduler.tool') {
  const formed = admission([workNode(ref)]);
  const runtime = makeScheduler();
  const queue = runtime.scheduler.admit(formed.candidate, formed.options);
  const active = runtime.scheduler.leaseSelected(contextInput());
  return { ...formed, ...runtime, queue, active };
}

function checkpointInput(fixture, ref = 'checkpoint.scheduler.test', pendingToolCallRef = 'NONE') {
  return {
    checkpointRef: ref,
    workNodeRef: fixture.queue.selected.workNodeRef,
    lastCompletedStep: 'validated-input',
    selectedSourceRefs: ['source.work.test'],
    selectedContextRefs: [fixture.active.contextLease.leaseRef],
    producedArtifactRefs: [],
    producedReceiptRefs: [fixture.queue.admissionReceipt.admissionReceiptRef],
    openQuestions: [],
    nextSafeAction: 'RESUME_VALIDATION',
    pendingToolCallRef,
    sourceBindings: SOURCE_BINDINGS,
    formedAt: CHECKPOINT_AT
  };
}

function toolCallFrom(fixture, overrides = {}) {
  const bindingObservedAt = overrides.bindingObservedAt ?? OBSERVED;
  const inputOverrides = { ...overrides };
  delete inputOverrides.bindingObservedAt;
  return createToolCall({
    toolCallRef: 'tool-call.scheduler.test',
    workNodeRef: fixture.queue.selected.workNodeRef,
    toolRef: 'tool.mock.inspect',
    effectRef: 'effect.mock.read',
    arguments: { sourceRef: 'source.work.test' },
    schedulerGeneration: fixture.queue.generation,
    cancellationTokenRef: fixture.active.contextLease.cancellationTokenRef,
    sourceEvidenceRef: 'source.blueprint.intent-scheduler-registry',
    sourceEvidenceHash: semanticHash(schedulerRegistry),
    proposedAt: OBSERVED,
    timeoutAt: EXPIRES,
    cancellationPolicy: 'CHECKPOINT_THEN_CANCEL',
    ...inputOverrides
  }, {
    contextLease: fixture.active.contextLease,
    capabilityLease: fixture.active.capabilityLease,
    effectLease: fixture.active.effectLease,
    resourceLease: fixture.active.resourceLease,
    workerLease: fixture.active.workerLease,
    runtimeTrustSnapshot: fixture.runtime,
    schedulerRegistry,
    observedAt: bindingObservedAt
  });
}

function exactResult(call, overrides = {}) {
  return {
    toolCallRef: call.toolCallRef,
    observationRef: 'observation.scheduler.test',
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
    observation: { summaryRef: 'summary.scheduler.test' },
    artifactRefs: [],
    ...overrides
  };
}

function completionFor({ candidate, active, runtime }, completedAt, overrides = {}) {
  const node = candidate.nodes.find((item) => item.workNodeRef === active.active.workNodeRef);
  return {
    verificationReceiptRef: `verification.${node.workNodeRef}.${active.active.schedulerGeneration}`,
    workNodeRef: node.workNodeRef,
    nodeFingerprint: node.semanticFingerprint,
    graphRef: candidate.graphRef,
    graphFingerprint: candidate.semanticFingerprint,
    runtimeSnapshotFingerprint: runtime.semanticFingerprint,
    schedulerInstanceRef: active.active.schedulerInstanceRef,
    schedulerGeneration: active.active.schedulerGeneration,
    expectedTransitionRef: node.expectedTransitionRef,
    gateObservations: node.completionGateRefs.map((completionGateRef) => ({
      gateResultRef: `gate-result.${completionGateRef}.${active.active.schedulerGeneration}`,
      completionGateRef,
      sourceObservationRef: `observation.completion.${completionGateRef}`,
      sourceObservationHash: semanticHash({ completionGateRef, completedAt, state: 'COMPLETED' }),
      observedBeforeState: node.state,
      observedAfterState: 'COMPLETED',
      result: 'PASSED'
    })),
    observedBeforeState: node.state,
    observedAfterState: 'COMPLETED',
    returnRouteRef: node.returnRouteRef,
    formedAt: completedAt,
    observedAt: completedAt,
    expiresAt: runtime.expiresAt,
    selfCertified: false,
    ...overrides
  };
}

test('S0 non-green workgraph exposes candidate-only ready nodes and admits zero', () => {
  const ready = workNode('work.scheduler.ready');
  const held = workNode('work.scheduler.held', {
    state: 'HELD_UNKNOWN',
    requiredHumanDecisionRef: 'decision.scheduler.held'
  });
  const { candidate, trust, options } = admission([ready, held]);
  const result = admitIntentSchedulerQueue(candidate, options);
  assert.equal(result.state, 'BLOCKED');
  assert.equal(result.logicalReady.length, 1);
  assert.equal(result.admittedReady.length, 0);
  assert.match(result.logicalReady[0].reasonRefs[0], /WORKGRAPH_NOT_ADMITTED:ATTENTION/);
  assert.equal(trust.currentness, 'CURRENT');
});

test('S1 admission binds exact graph, trust, external runtime, expiry, resource, occupancy, capability and effect identities', () => {
  const { candidate, trust, runtime, options } = admission([workNode('work.scheduler.binding')]);
  const result = admitIntentSchedulerQueue(candidate, options);
  assert.equal(result.state, 'ADMITTED');
  assert.equal(result.admissionReceipt.graphFingerprint, candidate.semanticFingerprint);
  assert.equal(result.admissionReceipt.trustSnapshotFingerprint, trust.semanticFingerprint);
  assert.equal(result.admissionReceipt.runtimeSnapshotFingerprint, runtime.semanticFingerprint);
  assert.equal(result.admissionReceipt.runtimeEvidenceClass, 'SIMULATED_CURRENT');
  assert.equal(result.admissionReceipt.nodeFingerprint, candidate.nodes[0].semanticFingerprint);
  assert.equal(result.admissionReceipt.resourceLeaseFingerprint, result.resourceLease.semanticFingerprint);
  assert.equal(result.admissionReceipt.occupancyFingerprint, result.selectedBindings.occupancy.semanticFingerprint);
  assert.equal(result.admissionReceipt.capabilityLeaseFingerprint, result.selectedBindings.capabilityLease.semanticFingerprint);
  assert.equal(result.admissionReceipt.effectLeaseFingerprint, result.selectedBindings.effectLease.semanticFingerprint);
});

test('S2 one physical worker source blocks concurrent leases and admission replacement while active', () => {
  const formed = admission([workNode('work.scheduler.single')]);
  const authority = new WorkerLeaseAuthority({ sourceRef: formed.runtime.sourceRef });
  const firstRuntime = makeScheduler({ authority });
  firstRuntime.scheduler.admit(formed.candidate, formed.options);
  assert.equal(firstRuntime.scheduler.leaseSelected(contextInput()).admitted, true);
  assert.throws(() => firstRuntime.scheduler.admit(formed.candidate, formed.options), /while a worker lease is active/);
  assert.equal(firstRuntime.scheduler.leaseSelected(contextInput()).reason, 'PHYSICAL_WORKER_ALREADY_LEASED');

  const secondRuntime = makeScheduler({ authority });
  secondRuntime.scheduler.admit(formed.candidate, formed.options);
  const contested = secondRuntime.scheduler.leaseSelected(contextInput(1, { leaseRef: 'context-lease.scheduler.contested' }));
  assert.equal(contested.admitted, false);
  assert.equal(contested.reason, 'EXACT_WORKER_SOURCE_ALREADY_LEASED');
});

test('S3 logical ready branches remain visible while one physical resource lease is selected', () => {
  const { candidate, options } = admission([
    workNode('work.scheduler.branch-a'),
    workNode('work.scheduler.branch-b')
  ]);
  const result = admitIntentSchedulerQueue(candidate, options);
  assert.equal(result.logicalReady.length, 2);
  assert.equal(result.admittedReady.length, 2);
  assert.ok(result.selected.workNodeRef);
  assert.ok(result.resourceLease.leaseRef);
  assert.equal(result.physicalWorkerPolicy.modelInferenceConcurrency, 1);
});

test('S4 retained interactive preemption completes checkpoint to fresh-generation worker selection', () => {
  const background = admission([
    workNode('work.scheduler.background', { priorityClass: 'LOW', background: true })
  ]);
  const runtime = makeScheduler();
  runtime.scheduler.admit(background.candidate, background.options);
  const backgroundRunning = runtime.scheduler.leaseSelected(contextInput());

  const interactive = admission([
    workNode('work.scheduler.interactive', { interactiveHumanTurn: true })
  ], { generation: 2 });
  const incomingQueue = admitIntentSchedulerQueue(interactive.candidate, interactive.options);
  const requested = runtime.scheduler.requestPreemption(incomingQueue);
  assert.equal(requested.state, 'CHECKPOINT_REQUIRED');
  assert.equal(runtime.scheduler.aggregate.pendingPreemption.admissionFingerprint, incomingQueue.admissionReceipt.semanticFingerprint);

  const checkpointed = runtime.scheduler.checkpoint(
    checkpointInput({ queue: runtime.scheduler.queue, active: backgroundRunning }),
    { releaseReceiptRef: 'release.scheduler.preemption', releasedAt: CHECKPOINT_AT }
  );
  const completed = runtime.scheduler.resume(checkpointed.checkpoint.checkpointRef, {
    graph: interactive.candidate,
    options: interactive.options,
    sourceBindings: SOURCE_BINDINGS,
    contextInput: contextInput(2),
    completePreemption: true
  });
  assert.equal(completed.state, 'PREEMPTION_COMPLETED');
  assert.equal(completed.active.workNodeRef, 'work.scheduler.interactive');
  assert.equal(completed.active.schedulerGeneration, 2);
  assert.equal(runtime.scheduler.aggregate.checkpoints[0].currentState, 'PAUSED_AT_CHECKPOINT');
  runtime.scheduler.cancelActive({
    releaseReceiptRef: 'release.scheduler.preemption.complete',
    releasedAt: CANCEL_AT,
    reason: 'TEST_COMPLETE'
  });
});

test('S5 scheduler-owned source-bound deferral ledger prevents multi-generation starvation', () => {
  const nodes = [
    workNode('work.scheduler.expedite', { priorityClass: 'HIGH', readySinceGeneration: -999 }),
    workNode('work.scheduler.starved', { readySinceGeneration: -999 })
  ];
  const candidate = graph(nodes);
  const trust = trustSnapshot(candidate);
  const runtime = makeScheduler();
  const selected = [];
  for (let generation = 1; generation <= 4; generation += 1) {
    const formed = admission(nodes, {
      generation,
      candidate,
      trust,
      resourceSnapshot: resource(generation),
      runtime: runtimeTrust(resource(generation), generation)
    });
    selected.push(runtime.scheduler.admit(candidate, formed.options).selected.workNodeRef);
  }
  assert.deepEqual(selected, [
    'work.scheduler.expedite',
    'work.scheduler.expedite',
    'work.scheduler.expedite',
    'work.scheduler.starved'
  ]);
  const fairness = runtime.scheduler.aggregate.fairnessLedger['work.scheduler.starved'];
  assert.ok(fairness.readySinceGeneration >= 0);
  assert.equal(fairness.sourceBinding.graphFingerprint, candidate.semanticFingerprint);
  assert.equal(fairness.sourceBinding.nodeFingerprint, nodes[1].semanticFingerprint);

  const direct = selectNextAdmittedNode([
    { workNodeRef: 'bad', admitted: true, schedulingClass: 'NORMAL', readySinceGeneration: -1, deferralCount: -1 }
  ], { generation: 10 });
  assert.equal(direct, null);
});

test('S6 unknown, expired, malformed, invented and mismatched runtime evidence fails closed', () => {
  assert.equal(evaluateResourceAdmission({ snapshotRef: 'unknown' }, { cpuSlots: 1 }).admitted, false);
  assert.throws(() => resource(1, {
    observedAt: EXPIRES,
    expiresAt: EXPIRES
  }), /formedAt <= observedAt < expiresAt/);
  assert.throws(() => resource(1, { observedAt: 'not-a-time' }), /canonical ISO-8601/);
  const currentResource = resource();
  assert.throws(() => runtimeTrust(currentResource, 1, {
    sourceRef: 'source.intent-scheduler.unknown'
  }), /unknown scheduler runtime source/);

  const formed = admission([workNode('work.scheduler.invented')]);
  const inventedTool = cloneOptions(formed.options);
  inventedTool.capabilityLeaseByNodeRef['work.scheduler.invented'].toolRefs = ['tool.mock.invented'];
  assert.equal(admitIntentSchedulerQueue(formed.candidate, inventedTool).state, 'BLOCKED');
  const actorMismatch = cloneOptions(formed.options);
  actorMismatch.occupancyByNodeRef['work.scheduler.invented'].actorRef = 'actor.invented';
  assert.equal(admitIntentSchedulerQueue(formed.candidate, actorMismatch).state, 'BLOCKED');
  assert.throws(() => admitIntentSchedulerQueue(formed.candidate, {
    ...formed.options,
    schedulerGeneration: 2
  }), /exact external runtime trust/);
});

function cloneOptions(options) {
  return structuredClone(options);
}

test('S7 context lease fits its hard budget, carries refs, and rejects heavy payloads', () => {
  const fixture = activeFixture('work.scheduler.context-budget');
  assert.equal(
    fixture.active.contextLease.inputTokenEstimate + fixture.active.contextLease.reservedOutputTokens <=
      fixture.active.contextLease.hardTokenLimit,
    true
  );
  assert.ok(fixture.active.contextLease.selectedSourceRefs.every((item) => typeof item === 'string'));
  assert.throws(() => createContextLease({
    ...fixture.active.contextLease,
    leaseRef: 'context.heavy',
    semanticFingerprint: undefined,
    graph: { nodes: [] }
  }), /external by ref/);
});

test('S8 semantic no-op never reuses an expired or released context lease', () => {
  const fixture = activeFixture('work.scheduler.context-no-op');
  const prior = fixture.active.contextLease;
  const same = createContextLease({
    ...prior,
    leaseRef: 'context-lease.scheduler.same-selection',
    semanticFingerprint: undefined
  }, { priorLease: prior });
  assert.equal(same.changed, false);
  assert.equal(same.lease.leaseRef, prior.leaseRef);

  const afterExpiry = createContextLease({
    ...prior,
    leaseRef: 'context-lease.scheduler.after-expiry',
    formedAt: '2026-07-31T13:01:00.000Z',
    observedAt: '2026-07-31T13:02:00.000Z',
    expiresAt: '2026-07-31T14:00:00.000Z',
    semanticFingerprint: undefined
  }, { priorLease: prior });
  assert.equal(afterExpiry.changed, true);
  const released = { ...prior, currentness: 'SUPERSEDED', lifecycle: 'RELEASED' };
  const afterRelease = createContextLease({
    ...prior,
    leaseRef: 'context-lease.scheduler.after-release',
    semanticFingerprint: undefined
  }, { priorLease: released });
  assert.equal(afterRelease.changed, true);
});

test('S9 checkpoint transactionally consumes admission and every lease and exposes PAUSED/RELEASED truth', () => {
  const fixture = activeFixture('work.scheduler.checkpoint');
  const result = fixture.scheduler.checkpoint(checkpointInput(fixture), {
    releaseReceiptRef: 'release.scheduler.checkpoint',
    releasedAt: CHECKPOINT_AT
  });
  assert.equal(result.leaseReleaseReceipts.length, 6);
  assert.ok(Object.values(result.transitionedLeases).every((lease) => lease.lifecycle === 'RELEASED'));
  assert.equal(fixture.scheduler.active, null);
  assert.equal(fixture.scheduler.queue.state, 'PAUSED');
  assert.equal(fixture.scheduler.queue.selected, null);
  assert.equal(fixture.scheduler.projections.health.value.state, 'ATTENTION');
  assert.equal(fixture.scheduler.leaseSelected(contextInput()).reason, 'NO_ADMITTED_SELECTED_NODE');
});

test('S10 resume accepts changed-but-sufficient resources and rejects stale sources or old leases', () => {
  const fixture = activeFixture('work.scheduler.resume');
  const checkpointed = fixture.scheduler.checkpoint(
    checkpointInput(fixture, 'checkpoint.scheduler.resume'),
    { releaseReceiptRef: 'release.scheduler.resume', releasedAt: CHECKPOINT_AT }
  );
  const fresh = admission([fixture.candidate.nodes[0]], {
    generation: 2,
    candidate: fixture.candidate,
    trust: fixture.trust,
    resourceSnapshot: resource(2, { cpuLoadPct: 31, ramAvailableMb: 12288 }),
    runtime: runtimeTrust(resource(2, { cpuLoadPct: 31, ramAvailableMb: 12288 }), 2)
  });
  const resumed = fixture.scheduler.resume(checkpointed.checkpoint.checkpointRef, {
    graph: fixture.candidate,
    options: fresh.options,
    sourceBindings: SOURCE_BINDINGS,
    contextInput: contextInput(2)
  });
  assert.equal(resumed.state, 'RESUMED');
  assert.notEqual(resumed.resourceLease.leaseRef, fixture.active.resourceLease.leaseRef);
  assert.notEqual(resumed.resourceLease.resourceSnapshotFingerprint, fixture.active.resourceLease.resourceSnapshotFingerprint);
  assert.equal(fixture.scheduler.projections.health.value.state, 'CLEAR');

  const staleSource = validateCheckpointResume(checkpointed.checkpoint, {
    graphFingerprint: resumed.queue.graphFingerprint,
    trustSnapshotFingerprint: resumed.queue.trustSnapshotFingerprint,
    runtimeTrustSnapshot: fresh.runtime,
    occupancy: resumed.occupancy,
    capabilityLease: resumed.capabilityLease,
    effectLease: resumed.effectLease,
    resourceSnapshot: fresh.options.resourceSnapshot,
    resourceRequest: fresh.options.resourceRequestByNodeRef[resumed.active.workNodeRef],
    resourceLease: resumed.resourceLease,
    sourceBindings: [{ sourceRef: SOURCE_BINDINGS[0].sourceRef, sourceHash: 'f'.repeat(64) }],
    schedulerGeneration: 2,
    observedAt: RESUME_OBSERVED
  });
  assert.equal(staleSource.state, 'HELD_UNKNOWN');
  assert.ok(staleSource.reasons.includes('SOURCE_BINDINGS_STALE'));

  const staleLease = validateCheckpointResume(checkpointed.checkpoint, {
    graphFingerprint: resumed.queue.graphFingerprint,
    trustSnapshotFingerprint: resumed.queue.trustSnapshotFingerprint,
    runtimeTrustSnapshot: fresh.runtime,
    occupancy: resumed.occupancy,
    capabilityLease: checkpointed.transitionedLeases.capability,
    effectLease: checkpointed.transitionedLeases.effect,
    resourceSnapshot: fresh.options.resourceSnapshot,
    resourceRequest: fresh.options.resourceRequestByNodeRef[resumed.active.workNodeRef],
    resourceLease: checkpointed.transitionedLeases.resource,
    sourceBindings: SOURCE_BINDINGS,
    schedulerGeneration: 2,
    observedAt: RESUME_OBSERVED
  });
  assert.equal(staleLease.admitted, false);
  assert.ok(staleLease.reasons.some((reason) => reason.startsWith('CAPABILITY_LEASE_INVALID')));
  fixture.scheduler.cancelActive({
    releaseReceiptRef: 'release.scheduler.resume.complete',
    releasedAt: CANCEL_AT,
    reason: 'TEST_COMPLETE'
  });
});

test('S11 tool call resolves canonical tool/effect/schema/executor identities and active exact leases', () => {
  const fixture = activeFixture('work.scheduler.tool-boundary');
  const call = toolCallFrom(fixture);
  assert.equal(call.effectRef, 'effect.mock.read');
  assert.equal(call.argumentSchemaRef, 'schema.tool.mock.inspect/v0');
  assert.equal(call.resultSchemaRef, 'schema.tool.mock.result/v0');
  assert.equal(call.executorRef, 'executor.mock.deterministic.inspect');
  assert.equal(call.contextLeaseFingerprint, fixture.active.contextLease.semanticFingerprint);
  assert.throws(() => toolCallFrom(fixture, {
    toolRef: 'tool.mock.invented'
  }), /unknown canonical mock tool/);

  const heldCall = toolCallFrom(fixture, { toolCallRef: 'tool-call.scheduler.held' });
  fixture.relay.register(heldCall);
  const checkpointed = fixture.scheduler.checkpoint(
    checkpointInput(fixture, 'checkpoint.scheduler.tool-held', heldCall.toolCallRef),
    { releaseReceiptRef: 'release.scheduler.tool-held', releasedAt: CHECKPOINT_AT }
  );
  assert.throws(() => createToolCall({
    toolCallRef: 'tool-call.scheduler.released-leases',
    workNodeRef: heldCall.workNodeRef,
    toolRef: heldCall.toolRef,
    effectRef: heldCall.effectRef,
    arguments: { sourceRef: 'source.work.test' },
    schedulerGeneration: heldCall.schedulerGeneration,
    cancellationTokenRef: heldCall.cancellationTokenRef,
    sourceEvidenceRef: heldCall.sourceEvidenceRef,
    sourceEvidenceHash: heldCall.sourceEvidenceHash,
    proposedAt: OBSERVED,
    timeoutAt: EXPIRES,
    cancellationPolicy: heldCall.cancellationPolicy
  }, {
    contextLease: checkpointed.transitionedLeases.context,
    capabilityLease: checkpointed.transitionedLeases.capability,
    effectLease: checkpointed.transitionedLeases.effect,
    resourceLease: checkpointed.transitionedLeases.resource,
    workerLease: checkpointed.transitionedLeases.worker,
    runtimeTrustSnapshot: fixture.runtime,
    schedulerRegistry,
    observedAt: CHECKPOINT_AT
  }), /current and ACTIVE/);
  assert.equal(fixture.relay.accept(exactResult(heldCall), { receivedAt: CHECKPOINT_AT }).reason, 'TOOL_CALL_HELD');
});

test('S12 relay rejects wrong context/effect/schema, expiry, restart replay, and cancellation races', () => {
  const fixture = activeFixture('work.scheduler.tool-relay');
  const call = toolCallFrom(fixture);
  const relay = new ToolResultRelay(null, { schedulerRegistry });
  relay.register(call);
  const base = exactResult(call);
  assert.equal(relay.accept({ ...base, contextLeaseRef: 'context.same-node.wrong' }, { receivedAt: RESULT_AT }).reason, 'CONTEXT_LEASE_MISMATCH');
  assert.equal(relay.accept({ ...base, effectRef: 'effect.mock.wrong' }, { receivedAt: RESULT_AT }).reason, 'WRONG_EFFECT');
  assert.equal(relay.accept({ ...base, schemaRef: 'schema.unknown/v0' }, { receivedAt: RESULT_AT }).reason, 'RESULT_SCHEMA_MISMATCH');
  assert.equal(relay.accept(base, { receivedAt: RESULT_AT }).accepted, true);
  const restoredAccepted = new ToolResultRelay(relay.snapshot, { schedulerRegistry });
  assert.equal(restoredAccepted.accept(base, { receivedAt: RESULT_AT }).reason, 'DUPLICATE_RESULT');
  assert.equal(restoredAccepted.reinject(fixture.active.contextLease, relay.snapshot.entries[0].observation, { observedAt: RESULT_AT }).accepted, true);
  const restoredReinjected = new ToolResultRelay(restoredAccepted.snapshot, { schedulerRegistry });
  assert.equal(
    restoredReinjected.reinject(fixture.active.contextLease, restoredAccepted.snapshot.entries[0].observation, { observedAt: RESULT_AT }).reason,
    'OBSERVATION_ALREADY_REINJECTED'
  );

  const lateRelay = new ToolResultRelay(null, { schedulerRegistry });
  lateRelay.register(call);
  assert.equal(lateRelay.accept(base, { receivedAt: EXPIRES }).reason, 'LATE_RESULT');
  const cancelledRelay = new ToolResultRelay(null, { schedulerRegistry });
  cancelledRelay.register(call);
  cancelledRelay.cancel(call.toolCallRef, {
    receiptRef: 'receipt.tool.cancelled',
    closedAt: RESULT_AT,
    reason: 'CANCELLATION_RACE'
  });
  assert.equal(cancelledRelay.accept(base, { receivedAt: RESULT_AT }).reason, 'UNKNOWN_OR_STALE_TOOL_CALL');
});

test('S13 observation reinjection requires scheduler-issued successor authorization', () => {
  const fixture = activeFixture('work.scheduler.successor-context');
  const call = toolCallFrom(fixture);
  fixture.relay.register(call);
  const accepted = fixture.relay.accept(exactResult(call), { receivedAt: RESULT_AT });
  const wrongContext = createContextLease({
    ...fixture.active.contextLease,
    leaseRef: 'context-lease.scheduler.same-node-wrong',
    semanticFingerprint: undefined
  }).lease;
  assert.match(
    fixture.relay.reinject(wrongContext, accepted.observation, { observedAt: RESULT_AT }).reason,
    /CONTEXT_REINJECTION_REJECTED/
  );
  const checkpointed = fixture.scheduler.checkpoint(
    checkpointInput(fixture, 'checkpoint.scheduler.successor-context'),
    { releaseReceiptRef: 'release.scheduler.successor-context', releasedAt: CHECKPOINT_AT }
  );
  const freshResource = resource(2);
  const fresh = admission([fixture.candidate.nodes[0]], {
    generation: 2,
    candidate: fixture.candidate,
    trust: fixture.trust,
    resourceSnapshot: freshResource,
    runtime: runtimeTrust(freshResource, 2)
  });
  const resumed = fixture.scheduler.resume(checkpointed.checkpoint.checkpointRef, {
    graph: fixture.candidate,
    options: fresh.options,
    sourceBindings: SOURCE_BINDINGS,
    contextInput: contextInput(2),
    authorizeObservationRef: accepted.observation.observationRef
  });
  assert.ok(resumed.successorContextAuthorization.semanticFingerprint);
  const invented = structuredClone(resumed.contextLease);
  invented.successorContextAuthorization.observationFingerprint = '0'.repeat(64);
  invented.semanticFingerprint = undefined;
  assert.throws(() => createContextLease(invented, {
    priorLease: checkpointed.transitionedLeases.context,
    priorLeaseFingerprint: checkpointed.checkpoint.priorLeaseFingerprints.context,
    expectedSchedulerIssuerRef: fixture.scheduler.schedulerInstanceRef
  }), /authorization fingerprint mismatch/);
  const selfAuthored = structuredClone(resumed.contextLease);
  selfAuthored.successorContextAuthorization.schedulerIssuerRef = 'scheduler.invented';
  selfAuthored.successorContextAuthorization.semanticFingerprint = undefined;
  selfAuthored.semanticFingerprint = undefined;
  assert.throws(() => createContextLease(selfAuthored, {
    priorLease: checkpointed.transitionedLeases.context,
    priorLeaseFingerprint: checkpointed.checkpoint.priorLeaseFingerprints.context,
    expectedSchedulerIssuerRef: fixture.scheduler.schedulerInstanceRef
  }), /not issued by the active scheduler/);
  const reinjected = fixture.relay.reinject(resumed.contextLease, accepted.observation, { observedAt: RESUME_OBSERVED });
  assert.equal(reinjected.accepted, true);
  assert.equal(reinjected.frame.originatingContextLeaseRef, fixture.active.contextLease.leaseRef);
  assert.equal(reinjected.frame.contextLeaseRef, resumed.contextLease.leaseRef);
  assert.equal(reinjected.frame.rawResultIncluded, false);
  fixture.scheduler.cancelActive({
    releaseReceiptRef: 'release.scheduler.successor-context.complete',
    releasedAt: CANCEL_AT,
    reason: 'TEST_COMPLETE'
  });
});

test('S14 cancellation closes pending relay work, consumes leases, preserves lineage, and blocks re-lease', () => {
  const fixture = activeFixture('work.scheduler.cancel');
  const call = toolCallFrom(fixture, { toolCallRef: 'tool-call.scheduler.cancel' });
  fixture.relay.register(call);
  fixture.scheduler.syncRelayState();
  const result = fixture.scheduler.cancelActive({
    releaseReceiptRef: 'release.scheduler.cancel',
    releasedAt: CHECKPOINT_AT,
    reason: 'USER_CANCELLED'
  });
  assert.equal(result.changed, true);
  assert.ok(Object.values(result.transitionedLeases).every((lease) => lease.lifecycle === 'CANCELLED'));
  assert.equal(result.cancellationReceipt.sourceDiscarded, false);
  assert.deepEqual(result.cancellationReceipt.sourceRefs, ['source.work.test']);
  assert.deepEqual(result.cancellationReceipt.receiptRefs, [fixture.queue.admissionReceipt.admissionReceiptRef]);
  assert.equal(fixture.relay.snapshot.entries[0].state, 'CLOSED');
  assert.equal(fixture.relay.accept(exactResult(call), { receivedAt: CHECKPOINT_AT }).reason, 'UNKNOWN_OR_STALE_TOOL_CALL');
  assert.equal(fixture.scheduler.queue.state, 'CANCELLED');
  assert.equal(fixture.scheduler.projections.health.value.state, 'ATTENTION');
  assert.equal(fixture.scheduler.leaseSelected(contextInput()).reason, 'NO_ADMITTED_SELECTED_NODE');
});

test('S15 Queue, Terrain, Health and Guide derive from one scheduler aggregate through the real lifecycle', () => {
  const fixture = activeFixture('work.scheduler.projections');
  assert.equal(fixture.scheduler.projections.health.value.state, 'CLEAR');
  assert.equal(fixture.scheduler.projections.terrain.value.activeWorkNodeRef, fixture.queue.selected.workNodeRef);
  assert.equal(fixture.scheduler.projections.guide.value.nextSafeAction, 'CONTINUE_OR_CHECKPOINT_ACTIVE_NODE');
  const aggregateRevision = fixture.scheduler.projections.aggregate.revision;
  const noOp = fixture.scheduler.projections.aggregate.set(structuredClone(fixture.scheduler.aggregate));
  assert.equal(noOp.changed, false);
  assert.equal(fixture.scheduler.projections.aggregate.revision, aggregateRevision);
  fixture.scheduler.checkpoint(checkpointInput(fixture, 'checkpoint.scheduler.projections'), {
    releaseReceiptRef: 'release.scheduler.projections',
    releasedAt: CHECKPOINT_AT
  });
  assert.equal(fixture.scheduler.projections.runtime.value.phase, 'PAUSED');
  assert.equal(fixture.scheduler.projections.health.value.state, 'ATTENTION');
  assert.equal(fixture.scheduler.projections.guide.value.nextSafeAction, 'FORM_FRESH_RUNTIME_AND_RESUME');
  assert.equal(fixture.scheduler.projections.runtime.value.rawMachineDumpIncluded, false);
});

test('S17 exact normal completion closes six leases and preserves the return route distinctly from cancellation', () => {
  const beforeObservation = activeFixture('work.scheduler.complete-before-observation');
  assert.throws(() => beforeObservation.scheduler.completeActive({
    graph: beforeObservation.candidate,
    intentRegistry,
    trustSnapshot: beforeObservation.trust,
    registeredProcessRefs,
    registeredRoleRefs,
    completionEvidence: completionFor(beforeObservation, CHECKPOINT_AT, { formedAt: OBSERVED }),
    completionReceiptRef: 'completion.work.scheduler.complete-before-observation',
    releaseReceiptRef: 'release.scheduler.complete-before-observation',
    completedAt: RESULT_AT
  }), /cannot precede verification observation/);

  const expired = activeFixture('work.scheduler.complete-expired');
  assert.throws(() => expired.scheduler.completeActive({
    graph: expired.candidate,
    intentRegistry,
    trustSnapshot: expired.trust,
    registeredProcessRefs,
    registeredRoleRefs,
    completionEvidence: completionFor(expired, RESULT_AT, { expiresAt: CHECKPOINT_AT }),
    completionReceiptRef: 'completion.work.scheduler.complete-expired',
    releaseReceiptRef: 'release.scheduler.complete-expired',
    completedAt: CHECKPOINT_AT
  }), /expired before consumption/);

  const advancedClock = activeFixture('work.scheduler.complete-advanced-clock');
  advancedClock.scheduler.advanceObservedClock({
    observedAt: CANCEL_AT,
    eventRef: 'clock.scheduler.complete-advanced-clock'
  });
  assert.throws(() => advancedClock.scheduler.completeActive({
    graph: advancedClock.candidate,
    intentRegistry,
    trustSnapshot: advancedClock.trust,
    registeredProcessRefs,
    registeredRoleRefs,
    completionEvidence: completionFor(advancedClock, CHECKPOINT_AT),
    completionReceiptRef: 'completion.work.scheduler.complete-advanced-clock',
    releaseReceiptRef: 'release.scheduler.complete-advanced-clock',
    completedAt: CHECKPOINT_AT
  }), /cannot precede the canonical scheduler observed clock/);

  const fixture = activeFixture('work.scheduler.complete');
  const node = fixture.candidate.nodes[0];
  const evidence = completionFor(fixture, CHECKPOINT_AT);
  assert.throws(() => fixture.scheduler.completeActive({
    graph: fixture.candidate,
    intentRegistry,
    trustSnapshot: fixture.trust,
    registeredProcessRefs,
    registeredRoleRefs,
    completionEvidence: { ...evidence, nodeFingerprint: '0'.repeat(64) },
    completionReceiptRef: `completion.${node.workNodeRef}.wrong`,
    releaseReceiptRef: 'release.scheduler.complete.wrong',
    completedAt: CHECKPOINT_AT
  }), /completion evidence does not match/);
  const completed = fixture.scheduler.completeActive({
    graph: fixture.candidate,
    intentRegistry,
    trustSnapshot: fixture.trust,
    registeredProcessRefs,
    registeredRoleRefs,
    completionEvidence: evidence,
    completionReceiptRef: `completion.${node.workNodeRef}`,
    releaseReceiptRef: 'release.scheduler.complete',
    completedAt: CHECKPOINT_AT
  });
  assert.equal(completed.state, 'COMPLETED');
  assert.equal(completed.leaseTransitionReceipts.length, 6);
  assert.ok(Object.values(completed.transitionedLeases).every((lease) => lease.lifecycle === 'RELEASED'));
  assert.equal(completed.returnRouteReceipt.returnRouteRef, node.returnRouteRef);
  assert.equal(completed.workgraph.nodes.find((item) => item.workNodeRef === node.workNodeRef).state, 'COMPLETED');
  assert.equal(completed.canonicalWorkgraphTransition.transitionRef, node.expectedTransitionRef);
  assert.equal(completed.completionEvidenceLineage.verificationReceiptRef,
    completed.completionVerification.verificationReceiptRef);
  assert.ok(completed.canonicalWorkgraphTransition.sourceRefs.includes(
    completed.completionVerification.verificationReceiptRef));
  assert.ok(completed.completionReceipt.sourceHashes.includes(
    completed.completionVerification.gateResultReceipts[0].semanticFingerprint));
  assert.equal(completed.returnRouteReceipt.completionEvidenceLineageFingerprint,
    completed.completionEvidenceLineage.semanticFingerprint);
  assert.equal(fixture.scheduler.queue.state, 'COMPLETED');
  assert.equal(fixture.scheduler.projections.guide.value.whatIsHappeningNow, 'COMPLETED:CLOSED');
});

test('S18 preemption retains exact admission identity and resumes prior background continuation', () => {
  const background = admission([workNode('work.scheduler.roundtrip-background', { priorityClass: 'LOW', background: true })]);
  const runtime = makeScheduler();
  runtime.scheduler.admit(background.candidate, background.options);
  const backgroundRunning = runtime.scheduler.leaseSelected(contextInput());
  const heldCall = toolCallFrom({ ...background, ...runtime, queue: runtime.scheduler.queue, active: backgroundRunning }, {
    toolCallRef: 'tool-call.scheduler.roundtrip-held'
  });
  runtime.relay.register(heldCall);

  const interactive = admission([workNode('work.scheduler.roundtrip-interactive', { interactiveHumanTurn: true })], { generation: 2 });
  const incomingQueue = admitIntentSchedulerQueue(interactive.candidate, interactive.options);
  runtime.scheduler.requestPreemption(incomingQueue);
  const checkpointed = runtime.scheduler.checkpoint(
    checkpointInput({ queue: runtime.scheduler.queue, active: backgroundRunning }, 'checkpoint.scheduler.roundtrip', heldCall.toolCallRef),
    { releaseReceiptRef: 'release.scheduler.roundtrip', releasedAt: CHECKPOINT_AT }
  );
  const rebuilt = structuredClone(interactive.options);
  rebuilt.capabilityLeaseByNodeRef['work.scheduler.roundtrip-interactive'].leaseRef += '.rebuilt';
  assert.throws(() => runtime.scheduler.resume(checkpointed.checkpoint.checkpointRef, {
    graph: interactive.candidate,
    options: rebuilt,
    sourceBindings: SOURCE_BINDINGS,
    contextInput: contextInput(2),
    completePreemption: true
  }), /admission does not match retained incoming candidate identity/);
  const foreground = runtime.scheduler.resume(checkpointed.checkpoint.checkpointRef, {
    graph: interactive.candidate,
    options: interactive.options,
    sourceBindings: SOURCE_BINDINGS,
    contextInput: contextInput(2),
    completePreemption: true
  });
  const foregroundFixture = { candidate: interactive.candidate, active: foreground, runtime: interactive.runtime };
  const node = interactive.candidate.nodes[0];
  const completed = runtime.scheduler.completeActive({
    graph: interactive.candidate,
    intentRegistry,
    trustSnapshot: interactive.trust,
    registeredProcessRefs,
    registeredRoleRefs,
    completionEvidence: completionFor(foregroundFixture, RESUME_OBSERVED),
    completionReceiptRef: `completion.${node.workNodeRef}`,
    releaseReceiptRef: 'release.scheduler.roundtrip.foreground',
    completedAt: RESUME_OBSERVED
  });
  assert.equal(completed.state, 'CONTINUATION_READY');
  assert.equal(runtime.relay.snapshot.entries[0].state, 'HELD');
  assert.equal(runtime.scheduler.projections.health.value.state, 'ATTENTION');

  const continuationResource = resource(3);
  const continuation = admission(background.candidate.nodes, {
    generation: 3,
    candidate: background.candidate,
    trust: background.trust,
    resourceSnapshot: continuationResource,
    runtime: runtimeTrust(continuationResource, 3)
  });
  const resumed = runtime.scheduler.resumeContinuation({
    graph: background.candidate,
    options: continuation.options,
    sourceBindings: SOURCE_BINDINGS,
    contextInput: contextInput(3),
    heldToolDisposition: {
      action: 'CLOSE',
      authorizationRef: 'authorization.scheduler.roundtrip.close',
      receiptRef: 'receipt.scheduler.roundtrip.close'
    }
  });
  assert.equal(resumed.state, 'PREEMPTED_WORK_RESUMED');
  assert.equal(resumed.active.workNodeRef, 'work.scheduler.roundtrip-background');
  runtime.scheduler.cancelActive({
    releaseReceiptRef: 'release.scheduler.roundtrip.background',
    releasedAt: CANCEL_AT,
    reason: 'ROUNDTRIP_TEST_COMPLETE'
  });
  assert.equal(runtime.relay.snapshot.entries[0].state, 'CLOSED');
});

test('S19 checkpoint derives lineage and requires the exact six-lease same-lifecycle release set', () => {
  const fixture = activeFixture('work.scheduler.exact-checkpoint');
  const invented = checkpointInput(fixture, 'checkpoint.scheduler.invented-lineage');
  invented.selectedContextRefs = ['context.invented'];
  assert.throws(() => fixture.scheduler.checkpoint(invented, {
    releaseReceiptRef: 'release.scheduler.invented-lineage',
    releasedAt: CHECKPOINT_AT
  }), /canonical scheduler lineage exactly/);
  assert.ok(fixture.scheduler.active);
  const checkpointed = fixture.scheduler.checkpoint(
    checkpointInput(fixture, 'checkpoint.scheduler.exact-release'),
    { releaseReceiptRef: 'release.scheduler.exact-release', releasedAt: CHECKPOINT_AT }
  );
  const candidate = structuredClone(checkpointed.checkpoint);
  candidate.semanticFingerprint = undefined;
  assert.throws(() => createIntentCheckpoint({
    ...candidate,
    leaseReleaseReceipts: candidate.leaseReleaseReceipts.slice(1)
  }), /exactly six/);
  assert.throws(() => createIntentCheckpoint({
    ...candidate,
    leaseReleaseReceipts: [...candidate.leaseReleaseReceipts.slice(0, 5), candidate.leaseReleaseReceipts[0]]
  }), /receipt refs must be unique/);
  const wrongLease = structuredClone(candidate.leaseReleaseReceipts);
  wrongLease[0].leaseRef = 'lease.invented';
  assert.throws(() => createIntentCheckpoint({ ...candidate, leaseReleaseReceipts: wrongLease }), /one exact/);
  const mixed = structuredClone(candidate.leaseReleaseReceipts);
  mixed[0].lifecycle = 'CANCELLED';
  assert.throws(() => createIntentCheckpoint({ ...candidate, leaseReleaseReceipts: mixed }), /one explicit lifecycle/);
});

test('S20 relay restore and held-call actions require scheduler ownership, exact fresh leases and registered lineage', () => {
  for (const action of ['RESUME', 'REISSUE', 'SUPERSEDE', 'CLOSE']) {
    const fixture = activeFixture(`work.scheduler.durable-relay-${action.toLowerCase()}`);
    const heldCall = toolCallFrom(fixture, { toolCallRef: `tool-call.scheduler.durable-held-${action.toLowerCase()}` });
    fixture.relay.register(heldCall);
    const checkpointed = fixture.scheduler.checkpoint(
      checkpointInput(fixture, `checkpoint.scheduler.durable-relay-${action.toLowerCase()}`, heldCall.toolCallRef),
      { releaseReceiptRef: `release.scheduler.durable-relay-${action.toLowerCase()}`, releasedAt: CHECKPOINT_AT }
    );
    const heldSnapshot = fixture.relay.snapshot;
    assert.throws(() => new ToolResultRelay({ ...fixture.relay.snapshot, semanticFingerprint: undefined }, { schedulerRegistry }), /requires its canonical fingerprint/);
    const tampered = structuredClone(fixture.relay.snapshot);
    tampered.entries[0].call.semanticFingerprint = '0'.repeat(64);
    assert.throws(() => new ToolResultRelay(tampered, { schedulerRegistry }), /tool call semantic fingerprint mismatch/);

    const freshResource = resource(2);
    const fresh = admission([fixture.candidate.nodes[0]], {
      generation: 2,
      candidate: fixture.candidate,
      trust: fixture.trust,
      resourceSnapshot: freshResource,
      runtime: runtimeTrust(freshResource, 2)
    });
    assert.throws(() => fixture.scheduler.resume(checkpointed.checkpoint.checkpointRef, {
      graph: fixture.candidate,
      options: fresh.options,
      sourceBindings: SOURCE_BINDINGS,
      contextInput: contextInput(2)
    }), /requires one scheduler disposition before RUNNING/);
    const successorCallInput = action === 'CLOSE' ? null : {
      toolCallRef: `tool-call.scheduler.durable-${action.toLowerCase()}`,
      toolRef: 'tool.mock.inspect',
      effectRef: 'effect.mock.read',
      arguments: { sourceRef: 'source.work.test' },
      sourceEvidenceRef: heldCall.sourceEvidenceRef,
      sourceEvidenceHash: heldCall.sourceEvidenceHash,
      proposedAt: RESUME_OBSERVED,
      timeoutAt: RESUME_EXPIRES,
      cancellationPolicy: heldCall.cancellationPolicy
    };
    const resumed = fixture.scheduler.resume(checkpointed.checkpoint.checkpointRef, {
      graph: fixture.candidate,
      options: fresh.options,
      sourceBindings: SOURCE_BINDINGS,
      contextInput: contextInput(2),
      heldToolDisposition: {
        action,
        authorizationRef: `authorization.scheduler.durable-${action.toLowerCase()}`,
        receiptRef: `receipt.scheduler.durable-${action.toLowerCase()}`,
        successorCallInput,
        replacementPolicyRef: action === 'SUPERSEDE' ? 'policy.intent-scheduler.held-tool-replacement' : null,
        replacementReasonRef: action === 'SUPERSEDE' ? 'reason.intent-scheduler.context-replacement' : null
      }
    });
    assert.equal(resumed.state, 'RESUMED');
    assert.equal(resumed.heldToolDisposition.receipt.action, action);
    assert.equal(fixture.relay.snapshot.entries.find((item) => item.toolCallRef === heldCall.toolCallRef).state, 'CLOSED');
    if (successorCallInput) {
      const successor = fixture.relay.snapshot.entries.find((item) => item.toolCallRef === successorCallInput.toolCallRef);
      assert.equal(successor.state, 'PENDING');
      assert.equal(successor.call.predecessorToolCallRef, heldCall.toolCallRef);
      assert.equal(successor.call.schedulerInstanceRef, fixture.scheduler.schedulerInstanceRef);
      if (['RESUME', 'REISSUE'].includes(action)) {
        assert.equal(successor.call.semanticPurposeFingerprint, heldCall.semanticPurposeFingerprint);
      }
      const wrongContext = structuredClone(resumed.heldToolDisposition.successorCall);
      wrongContext.contextLeaseRef = 'context-lease.forged';
      delete wrongContext.semanticFingerprint;
      wrongContext.semanticFingerprint = semanticHash(wrongContext);
      const restoredWrongContext = new ToolResultRelay(heldSnapshot, { schedulerRegistry });
      assert.throws(() => restoredWrongContext.transitionHeld(heldCall.toolCallRef, {
        action,
        checkpointRef: checkpointed.checkpoint.checkpointRef,
        successorCall: wrongContext,
        schedulerAuthorization: resumed.heldToolDisposition.authorization,
        receiptRef: `receipt.scheduler.durable-forged-context-${action.toLowerCase()}`,
        transitionedAt: RESUME_OBSERVED
      }), /scheduler-owned relay capability/);

      const wrongScheduler = structuredClone(resumed.heldToolDisposition.authorization);
      wrongScheduler.schedulerInstanceRef = 'instance.scheduler.forged';
      delete wrongScheduler.semanticFingerprint;
      wrongScheduler.semanticFingerprint = semanticHash(wrongScheduler);
      const restoredWrongScheduler = new ToolResultRelay(heldSnapshot, { schedulerRegistry });
      assert.throws(() => restoredWrongScheduler.transitionHeld(heldCall.toolCallRef, {
        action,
        checkpointRef: checkpointed.checkpoint.checkpointRef,
        successorCall: resumed.heldToolDisposition.successorCall,
        schedulerAuthorization: wrongScheduler,
        receiptRef: `receipt.scheduler.durable-forged-scheduler-${action.toLowerCase()}`,
        transitionedAt: RESUME_OBSERVED
      }), /scheduler-owned relay capability/);
    }
    fixture.scheduler.cancelActive({
      releaseReceiptRef: `release.scheduler.durable-relay-complete-${action.toLowerCase()}`,
      releasedAt: CANCEL_AT,
      reason: 'TEST_COMPLETE'
    });
  }

  const divergent = activeFixture('work.scheduler.durable-relay-divergent');
  const divergentCall = toolCallFrom(divergent, { toolCallRef: 'tool-call.scheduler.durable-divergent' });
  divergent.relay.register(divergentCall);
  const divergentCheckpoint = divergent.scheduler.checkpoint(
    checkpointInput(divergent, 'checkpoint.scheduler.durable-divergent', divergentCall.toolCallRef),
    { releaseReceiptRef: 'release.scheduler.durable-divergent', releasedAt: CHECKPOINT_AT }
  );
  const relayBeforeRejectedClose = divergent.relay.snapshot.semanticFingerprint;
  const aggregateBeforeRejectedClose = divergent.scheduler.aggregate.semanticFingerprint;
  assert.throws(() => divergent.relay.cancel(divergentCall.toolCallRef, {
    receiptRef: 'receipt.scheduler.manual-relay-close',
    closedAt: RESUME_OBSERVED,
    reason: 'MANUAL_OUTSIDE_AGGREGATE'
  }), /held tool close requires scheduler-owned disposition before mutation/);
  assert.equal(divergent.relay.snapshot.semanticFingerprint, relayBeforeRejectedClose);
  assert.equal(divergent.scheduler.aggregate.semanticFingerprint, aggregateBeforeRejectedClose);
  const divergentResource = resource(2);
  const divergentFresh = admission([divergent.candidate.nodes[0]], {
    generation: 2,
    candidate: divergent.candidate,
    trust: divergent.trust,
    resourceSnapshot: divergentResource,
    runtime: runtimeTrust(divergentResource, 2)
  });
  const schedulerClosed = divergent.scheduler.resume(divergentCheckpoint.checkpoint.checkpointRef, {
    graph: divergent.candidate,
    options: divergentFresh.options,
    sourceBindings: SOURCE_BINDINGS,
    contextInput: contextInput(2),
    heldToolDisposition: {
      action: 'CLOSE',
      authorizationRef: 'authorization.scheduler.divergent',
      receiptRef: 'receipt.scheduler.divergent'
    }
  });
  assert.equal(schedulerClosed.heldToolDisposition.receipt.action, 'CLOSE');
  assert.equal(schedulerClosed.heldToolDisposition.receipt.schedulerAuthorization.action, 'CLOSE');
  assert.equal(divergent.relay.snapshot.semanticFingerprint,
    divergent.scheduler.aggregate.relayLedger.semanticFingerprint);

  const terminal = activeFixture('work.scheduler.terminal-held-close');
  const terminalCall = toolCallFrom(terminal, { toolCallRef: 'tool-call.scheduler.terminal-held-close' });
  terminal.relay.register(terminalCall);
  terminal.relay.hold(terminalCall.toolCallRef, {
    receiptRef: 'receipt.scheduler.terminal-held',
    heldAt: CHECKPOINT_AT,
    checkpointRef: 'checkpoint.scheduler.terminal-held'
  });
  terminal.scheduler.syncRelayState();
  const terminalCancelled = terminal.scheduler.cancelActive({
    releaseReceiptRef: 'release.scheduler.terminal-held',
    releasedAt: CANCEL_AT,
    reason: 'TERMINAL_SCHEDULER_CANCEL'
  });
  const terminalEntry = terminal.relay.snapshot.entries.find((item) => item.toolCallRef === terminalCall.toolCallRef);
  assert.equal(terminalEntry.state, 'CLOSED');
  assert.equal(terminalEntry.transitionReceipts.at(-1).action, 'CLOSE');
  assert.equal(terminalEntry.transitionReceipts.at(-1).schedulerAuthorization.terminalDispositionReason,
    'TERMINAL_SCHEDULER_CANCEL');
  assert.equal(terminalCancelled.relayLedger.semanticFingerprint,
    terminal.scheduler.aggregate.relayLedger.semanticFingerprint);
});

test('S21 live observed clock expires active evidence and tool times remain monotonic', () => {
  const fixture = activeFixture('work.scheduler.live-clock');
  const advanced = fixture.scheduler.advanceObservedClock({ observedAt: EXPIRES, eventRef: 'clock.scheduler.test.expired' });
  assert.equal(advanced.health.state, 'BLOCKED');
  assert.ok(advanced.health.reasonRefs.some((reason) => reason.includes('EXPIRED')));

  const expiredResource = resource(1, {
    observedAt: '2026-07-31T12:03:00.000Z',
    expiresAt: '2026-07-31T12:04:00.000Z'
  });
  const expired = admission([workNode('work.scheduler.resource-expired-at-admission')], {
    resourceSnapshot: expiredResource,
    runtime: runtimeTrust(expiredResource)
  });
  assert.equal(admitIntentSchedulerQueue(expired.candidate, expired.options).state, 'BLOCKED');

  const resultFixture = activeFixture('work.scheduler.result-time');
  const call = toolCallFrom(resultFixture, { toolCallRef: 'tool-call.scheduler.result-time' });
  resultFixture.relay.register(call);
  assert.equal(resultFixture.relay.accept(exactResult(call), { receivedAt: FORMED }).reason, 'RESULT_BEFORE_PROPOSAL');
  assert.throws(() => resultFixture.relay.hold(call.toolCallRef, {
    receiptRef: 'receipt.scheduler.hold-before-proposal',
    heldAt: FORMED,
    checkpointRef: 'checkpoint.scheduler.time'
  }), /hold time must be monotonic/);
});

test('S22 generated receipt paths reject absolute, traversal, non-generated and symlink escapes portably', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-receipt-path-'));
  try {
    fs.mkdirSync(path.join(temporaryRoot, 'generated', 'health'), { recursive: true });
    const safePosix = resolveSafeGeneratedReceiptPath(temporaryRoot, 'generated/health/proof.json');
    const safeWindows = resolveSafeGeneratedReceiptPath(temporaryRoot, 'generated\\health\\proof-win.json');
    assert.equal(path.dirname(safePosix), path.join(temporaryRoot, 'generated', 'health'));
    assert.equal(path.dirname(safeWindows), path.join(temporaryRoot, 'generated', 'health'));
    for (const unsafe of [
      '../proof.json',
      'generated/health/../../proof.json',
      'artifacts/proof.json',
      '/tmp/proof.json',
      'C:\\temp\\proof.json'
    ]) assert.throws(() => resolveSafeGeneratedReceiptPath(temporaryRoot, unsafe), /safe relative path|under generated\/health/);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-receipt-outside-'));
    const link = path.join(temporaryRoot, 'generated', 'health', 'linked');
    try {
      fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
      assert.throws(() => resolveSafeGeneratedReceiptPath(temporaryRoot, 'generated/health/linked/proof.json'), /symbolic link/);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('S16 scheduler registry is canonical in Blueprint/Atlas, omission fails, and the complete no-effect loop passes', () => {
  const validation = validateBlueprint(bundle);
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  const schedulerValidation = validateIntentSchedulerRegistry(bundle.schedulerRegistry);
  assert.equal(schedulerValidation.ok, true, schedulerValidation.errors.join('\n'));
  const registry = compileRegistryPack(bundle);
  for (const ref of [
    'registry.vexlife.intent-scheduler.001',
    'system.vexlife.intent-scheduler',
    'source.blueprint.intent-scheduler-registry',
    'contract.intent-scheduler.runtime-trust-clock',
    'clock.intent-scheduler.canonical-utc',
    'tool.mock.inspect',
    'effect.mock.read',
    'schema.tool.mock.inspect/v0',
    'schema.tool.mock.result/v0',
    'executor.mock.deterministic.inspect',
    'contract.intent-scheduler.integrated-simulation/v1'
  ]) assert.ok(registry.require(ref));
  const atlas = new Atlas(buildIdentityIndex(bundle));
  const result = atlas.query({
    startRefs: ['registry.vexlife.intent-scheduler.001'],
    depthLimit: 2,
    resultLimit: 64,
    tokenBudget: 12000
  });
  assert.ok(result.results.some((item) => item.ref === 'contract.intent-scheduler.runtime-trust-clock'));
  assert.ok(result.results.some((item) => item.ref === 'contract.intent-scheduler.mock-tool.inspect/v0'));

  const omitted = {
    ...bundle,
    blueprint: structuredClone(bundle.blueprint),
    schedulerRegistry: null
  };
  delete omitted.blueprint.intentScheduler;
  assert.equal(validateBlueprint(omitted).ok, false);
  const malformed = {
    ...bundle,
    blueprint: structuredClone(bundle.blueprint),
    schedulerRegistry: structuredClone(bundle.schedulerRegistry)
  };
  malformed.schedulerRegistry.priorityClassIdentities[0].rank = 9;
  malformed.blueprint.intentScheduler = malformed.schedulerRegistry;
  assert.equal(validateBlueprint(malformed).ok, false);

  const simulation = runSchedulerSimulation({ root, writeReceipt: false }).receipt;
  assert.equal(simulation.state, 'PASS');
  assert.deepEqual(simulation.journeyStates, schedulerRegistry.simulationContract.requiredJourneyStates);
  assert.equal(simulation.externalEffectsExecuted, false);
  assert.equal(simulation.orphanedPendingToolCalls, 0);
  assert.equal(simulation.finalProjection.health.state, 'ATTENTION');
  assert.equal(simulation.finalProjection.runtime.phase, 'COMPLETED');
  assert.equal(simulation.separateCancellationProof.phase, 'CANCELLED');
  assert.deepEqual(simulation.separateCancellationProof.leaseLifecycle, ['CANCELLED']);
  const simulationBindings = {
    schedulerRegistry,
    blueprintHash: simulation.blueprintHash,
    sourceTreeSha256: simulation.sourceTreeSha256,
    repositoryGit: {
      candidateHeadSha: simulation.candidateHeadSha,
      checkoutSha: simulation.testedCheckoutSha,
      testedMergeSha: simulation.testedMergeSha,
      baseSha: simulation.baseSha
    }
  };
  assert.equal(validateIntegratedSchedulerSimulationReceipt(simulation, simulationBindings).ok, true);
  const effectful = structuredClone(simulation);
  effectful.externalEffectsExecuted = true;
  assert.equal(validateIntegratedSchedulerSimulationReceipt(effectful, simulationBindings).ok, false);
});

// [VXG RealForever]
