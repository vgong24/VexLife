import assert from 'node:assert/strict';
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
import { validateCheckpointResume } from '../src/core/intent-checkpoint.mjs';
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
import { semanticHash } from '../src/core/utils.mjs';
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
    authorizedObservationRefs: [],
    ...overrides
  };
}

function makeScheduler({
  relay = new ToolResultRelay(),
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
    ...overrides
  }, {
    contextLease: fixture.active.contextLease,
    capabilityLease: fixture.active.capabilityLease,
    effectLease: fixture.active.effectLease,
    resourceLease: fixture.active.resourceLease,
    workerLease: fixture.active.workerLease,
    runtimeTrustSnapshot: fixture.runtime,
    schedulerRegistry,
    observedAt: OBSERVED
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
  runtime.scheduler.leaseSelected(contextInput());

  const interactive = admission([
    workNode('work.scheduler.interactive', { interactiveHumanTurn: true })
  ], { generation: 2 });
  const incomingQueue = admitIntentSchedulerQueue(interactive.candidate, interactive.options);
  const requested = runtime.scheduler.requestPreemption(incomingQueue);
  assert.equal(requested.state, 'CHECKPOINT_REQUIRED');
  assert.equal(runtime.scheduler.aggregate.pendingPreemption.admissionFingerprint, incomingQueue.admissionReceipt.semanticFingerprint);

  const checkpointed = runtime.scheduler.checkpoint(
    checkpointInput({ queue: background.options ? runtime.scheduler.queue : null, active: { contextLease: { leaseRef: 'unused' } } }),
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
  const relay = new ToolResultRelay();
  relay.register(call);
  const base = exactResult(call);
  assert.equal(relay.accept({ ...base, contextLeaseRef: 'context.same-node.wrong' }, { receivedAt: RESULT_AT }).reason, 'CONTEXT_LEASE_MISMATCH');
  assert.equal(relay.accept({ ...base, effectRef: 'effect.mock.wrong' }, { receivedAt: RESULT_AT }).reason, 'WRONG_EFFECT');
  assert.equal(relay.accept({ ...base, schemaRef: 'schema.unknown/v0' }, { receivedAt: RESULT_AT }).reason, 'RESULT_SCHEMA_MISMATCH');
  assert.equal(relay.accept(base, { receivedAt: RESULT_AT }).accepted, true);
  const restoredAccepted = new ToolResultRelay(relay.snapshot);
  assert.equal(restoredAccepted.accept(base, { receivedAt: RESULT_AT }).reason, 'DUPLICATE_RESULT');
  assert.equal(restoredAccepted.reinject(fixture.active.contextLease, relay.snapshot.entries[0].observation, { observedAt: RESULT_AT }).accepted, true);
  const restoredReinjected = new ToolResultRelay(restoredAccepted.snapshot);
  assert.equal(
    restoredReinjected.reinject(fixture.active.contextLease, restoredAccepted.snapshot.entries[0].observation, { observedAt: RESULT_AT }).reason,
    'OBSERVATION_ALREADY_REINJECTED'
  );

  const lateRelay = new ToolResultRelay();
  lateRelay.register(call);
  assert.equal(lateRelay.accept(base, { receivedAt: EXPIRES }).reason, 'LATE_RESULT');
  const cancelledRelay = new ToolResultRelay();
  cancelledRelay.register(call);
  cancelledRelay.cancel(call.toolCallRef, {
    receiptRef: 'receipt.tool.cancelled',
    closedAt: RESULT_AT,
    reason: 'CANCELLATION_RACE'
  });
  assert.equal(cancelledRelay.accept(base, { receivedAt: RESULT_AT }).reason, 'UNKNOWN_OR_STALE_TOOL_CALL');
});

test('S13 observation reinjection requires the exact origin or an explicitly authorized successor context', () => {
  const fixture = activeFixture('work.scheduler.successor-context');
  const call = toolCallFrom(fixture);
  const relay = new ToolResultRelay();
  relay.register(call);
  const accepted = relay.accept(exactResult(call), { receivedAt: RESULT_AT });
  const wrongContext = createContextLease({
    ...fixture.active.contextLease,
    leaseRef: 'context-lease.scheduler.same-node-wrong',
    semanticFingerprint: undefined
  }).lease;
  assert.match(
    relay.reinject(wrongContext, accepted.observation, { observedAt: RESULT_AT }).reason,
    /CONTEXT_REINJECTION_REJECTED/
  );
  const successor = createContextLease({
    ...fixture.active.contextLease,
    leaseRef: 'context-lease.scheduler.authorized-successor',
    schedulerGeneration: 2,
    runtimeSnapshotFingerprint: '1'.repeat(64),
    resourceLeaseFingerprint: '2'.repeat(64),
    capabilityLeaseFingerprint: '3'.repeat(64),
    effectLeaseFingerprint: '4'.repeat(64),
    cancellationTokenRef: 'cancellation-token.scheduler.successor',
    formedAt: RESULT_AT,
    observedAt: CHECKPOINT_AT,
    expiresAt: EXPIRES,
    successorOfContextLeaseRef: fixture.active.contextLease.leaseRef,
    authorizedObservationRefs: [accepted.observation.observationRef],
    semanticFingerprint: undefined
  }).lease;
  const reinjected = relay.reinject(successor, accepted.observation, { observedAt: CHECKPOINT_AT });
  assert.equal(reinjected.accepted, true);
  assert.equal(reinjected.frame.originatingContextLeaseRef, fixture.active.contextLease.leaseRef);
  assert.equal(reinjected.frame.contextLeaseRef, successor.leaseRef);
  assert.equal(reinjected.frame.rawResultIncluded, false);
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
