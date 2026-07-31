import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createContextLease } from '../src/core/context-lease.mjs';
import { validateCheckpointResume } from '../src/core/intent-checkpoint.mjs';
import {
  admitIntentSchedulerQueue,
  createCapabilityLease,
  createEffectLease,
  selectNextAdmittedNode,
  SingleWorkerIntentScheduler
} from '../src/core/intent-scheduler.mjs';
import {
  createIntentEnvelope,
  createIntentTrustSnapshot,
  createIntentWorkgraph,
  createWorkNode
} from '../src/core/intent-workgraph.mjs';
import { createResourceSnapshot, evaluateResourceAdmission } from '../src/core/resource-admission.mjs';
import { createIntentSchedulerState } from '../src/core/state.mjs';
import { createToolCall, ToolResultRelay } from '../src/core/tool-result-relay.mjs';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = loadBlueprint(root);
const intentRegistry = bundle.intentRegistry;
const registeredProcessRefs = bundle.factory.processes.map((item) => item.processRef);
const registeredRoleRefs = bundle.blueprint.roles.map((item) => item.roleRef);
const NOW = '2026-07-31T12:00:00.000Z';
const LATER = '2026-07-31T12:30:00.000Z';

function envelope() {
  return createIntentEnvelope({
    intentRef: 'intent.scheduler.test',
    originMessageRef: 'message.scheduler.test',
    originSpeakerRef: 'person.test.human',
    recipientRoleRef: 'role.vex.developer',
    projectRef: 'project.scheduler.test',
    threadRef: 'thread.scheduler.test',
    channelRef: 'channel.scheduler.test',
    originalContentHash: 'a'.repeat(64),
    desiredOutcome: { intentKey: 'VALIDATE_WORKGRAPH', summary: 'Exercise scheduler contracts' },
    constraints: [],
    createdAt: NOW,
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
    sourceRefs: [`source.${ref}`],
    createdAt: NOW,
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
    graphRef: 'intent-workgraph.scheduler.test',
    intent: envelope(),
    nodes,
    transitions: formationTransitions(nodes),
    receipts: [],
    bindingRefs: bindingRefs(nodes),
    createdAt: NOW
  }, intentRegistry);
}

function trustSnapshot(candidate) {
  return createIntentTrustSnapshot({
    schemaVersion: 'vexlife.intent-trust-snapshot/v0',
    snapshotRef: 'trust-snapshot.scheduler.test',
    sourceRef: 'test/intent-scheduler.test.mjs#trust',
    formationRef: 'formation.scheduler.trust.test',
    formedAt: NOW,
    currentness: 'CURRENT',
    bindingRefs: bindingRefs(candidate.nodes),
    actorRefs: ['person.test.human', 'vex.test'],
    decisionRefs: [],
    authorizationBindings: []
  }, intentRegistry);
}

function resource(overrides = {}) {
  return createResourceSnapshot({
    snapshotRef: 'resource-snapshot.scheduler.test',
    generation: 1,
    cpuLoadPct: 20,
    cpuConcurrencyLimit: 4,
    cpuActiveCount: 0,
    ramAvailableMb: 16384,
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
    formedAt: NOW,
    ...overrides
  });
}

function runtimeBindings(candidate, snapshot, generation = 1) {
  const occupancyByNodeRef = {};
  const capabilityLeaseByNodeRef = {};
  const effectLeaseByNodeRef = {};
  const resourceRequestByNodeRef = {};
  const resourceLeaseRefByNodeRef = {};
  for (const node of candidate.nodes) {
    occupancyByNodeRef[node.workNodeRef] = {
      occupancyRef: `occupancy.${node.workNodeRef}.${generation}`,
      actorRef: 'vex.test',
      roleRef: node.roleRef,
      workNodeRef: node.workNodeRef,
      graphFingerprint: candidate.semanticFingerprint,
      schedulerGeneration: generation,
      claimRef: `claim.${node.workNodeRef}`,
      currentness: 'CURRENT'
    };
    capabilityLeaseByNodeRef[node.workNodeRef] = {
      leaseRef: `capability-lease.${node.workNodeRef}.${generation}`,
      workNodeRef: node.workNodeRef,
      graphFingerprint: candidate.semanticFingerprint,
      trustSnapshotFingerprint: snapshot.semanticFingerprint,
      schedulerGeneration: generation,
      envelopeRef: node.capabilityEnvelopeRef,
      toolRefs: ['tool.mock.inspect'],
      formedAt: NOW,
      expiresAt: LATER,
      currentness: 'CURRENT'
    };
    effectLeaseByNodeRef[node.workNodeRef] = {
      leaseRef: `effect-lease.${node.workNodeRef}.${generation}`,
      workNodeRef: node.workNodeRef,
      graphFingerprint: candidate.semanticFingerprint,
      trustSnapshotFingerprint: snapshot.semanticFingerprint,
      schedulerGeneration: generation,
      envelopeRef: node.effectEnvelopeRef,
      effectDisposition: 'EFFECT_ENVELOPE_BOUND',
      allowedEffectRefs: ['effect.mock.read'],
      formedAt: NOW,
      expiresAt: LATER,
      currentness: 'CURRENT'
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

function admission(nodes, { generation = 1, resourceSnapshot = resource() } = {}) {
  const candidate = graph(nodes);
  const trust = trustSnapshot(candidate);
  return {
    candidate,
    trust,
    options: {
      intentRegistry,
      registeredProcessRefs,
      registeredRoleRefs,
      trustSnapshot: trust,
      resourceSnapshot,
      ...runtimeBindings(candidate, trust, generation),
      workerRef: 'worker.model.primary',
      schedulerGeneration: generation,
      formedAt: NOW,
      expiresAt: LATER
    }
  };
}

function contextInput(ref = 'context-lease.scheduler.test') {
  return {
    leaseRef: ref,
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
    formedAt: NOW,
    expiresAt: LATER,
    checkpointReturnRef: 'return-route.scheduler.checkpoint'
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

test('S1 admission receipt binds exact graph, trust, node, resource, capability and effect identities', () => {
  const { candidate, trust, options } = admission([workNode('work.scheduler.binding')]);
  const result = admitIntentSchedulerQueue(candidate, options);
  assert.equal(result.state, 'ADMITTED');
  assert.equal(result.admissionReceipt.graphFingerprint, candidate.semanticFingerprint);
  assert.equal(result.admissionReceipt.trustSnapshotFingerprint, trust.semanticFingerprint);
  assert.equal(result.admissionReceipt.nodeFingerprint, candidate.nodes[0].semanticFingerprint);
  assert.equal(result.admissionReceipt.resourceLeaseFingerprint, result.resourceLease.semanticFingerprint);
  assert.equal(result.admissionReceipt.capabilityLeaseFingerprint, result.selectedBindings.capabilityLease.semanticFingerprint);
  assert.equal(result.admissionReceipt.effectLeaseFingerprint, result.selectedBindings.effectLease.semanticFingerprint);
});

test('S2 one physical model worker cannot hold two concurrent leases', () => {
  const { candidate, options } = admission([workNode('work.scheduler.single')]);
  const scheduler = new SingleWorkerIntentScheduler({ workerRef: 'worker.model.primary' });
  scheduler.admit(candidate, options);
  assert.equal(scheduler.leaseSelected(contextInput()).admitted, true);
  const second = scheduler.leaseSelected(contextInput('context-lease.scheduler.second'));
  assert.equal(second.admitted, false);
  assert.equal(second.reason, 'PHYSICAL_WORKER_ALREADY_LEASED');
});

test('S3 logical ready branches stay visible while only one physical resource lease is formed', () => {
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

test('S4 interactive work outranks background and preemption requires a checkpoint', () => {
  const background = workNode('work.scheduler.background', { priorityClass: 'LOW', background: true, readySinceGeneration: 0 });
  const interactive = workNode('work.scheduler.interactive', { interactiveHumanTurn: true, readySinceGeneration: 1 });
  const selected = selectNextAdmittedNode([
    { ...background, admitted: true, schedulingClass: 'BACKGROUND' },
    { ...interactive, admitted: true, schedulingClass: 'INTERACTIVE' }
  ], { generation: 2 });
  assert.equal(selected.workNodeRef, interactive.workNodeRef);

  const first = admission([background]);
  const scheduler = new SingleWorkerIntentScheduler({ workerRef: 'worker.model.primary' });
  scheduler.admit(first.candidate, first.options);
  scheduler.leaseSelected(contextInput());
  const preemption = scheduler.requestPreemption(interactive);
  assert.equal(preemption.state, 'CHECKPOINT_REQUIRED');
  assert.equal(preemption.sourceDiscarded, false);
  assert.ok(scheduler.active);
});

test('S5 bounded fairness selects a starved normal node ahead of a fresh expedite node', () => {
  const selected = selectNextAdmittedNode([
    { workNodeRef: 'work.expedite', admitted: true, schedulingClass: 'EXPEDITE', readySinceGeneration: 9 },
    { workNodeRef: 'work.starved', admitted: true, schedulingClass: 'NORMAL', readySinceGeneration: 1 }
  ], { generation: 10, fairnessMaxDeferrals: 3 });
  assert.equal(selected.workNodeRef, 'work.starved');
});

test('S6 unknown or insufficient CPU, RAM, GPU and VRAM state fails closed', () => {
  const invalid = evaluateResourceAdmission({ snapshotRef: 'unknown' }, { cpuSlots: 1 });
  assert.equal(invalid.admitted, false);
  const constrained = evaluateResourceAdmission(resource({
    cpuConcurrencyLimit: 1,
    cpuActiveCount: 1,
    ramAvailableMb: 128,
    ramReservedMb: 128,
    gpuAvailable: false,
    vramAvailableMb: 0
  }), { cpuSlots: 1, ramMb: 1, vramMb: 1, modelTurn: true });
  assert.equal(constrained.admitted, false);
  assert.ok(constrained.reasons.includes('CPU_CONCURRENCY_INSUFFICIENT'));
  assert.ok(constrained.reasons.includes('RAM_INSUFFICIENT'));
  assert.ok(constrained.reasons.includes('GPU_UNAVAILABLE'));
  assert.ok(constrained.reasons.includes('VRAM_INSUFFICIENT'));
});

test('S7 context lease fits its hard budget and carries refs instead of heavy payloads', () => {
  const formed = createContextLease({
    ...contextInput(),
    workerRef: 'worker.model.primary',
    workNodeRef: 'work.scheduler.context',
    graphFingerprint: 'graph-fingerprint',
    trustSnapshotFingerprint: 'trust-fingerprint',
    currentness: 'CURRENT'
  });
  assert.equal(formed.lease.inputTokenEstimate + formed.lease.reservedOutputTokens <= formed.lease.hardTokenLimit, true);
  assert.ok(formed.lease.selectedSourceRefs.every((item) => typeof item === 'string'));
  assert.throws(() => createContextLease({
    ...formed.lease,
    leaseRef: 'context.heavy',
    graph: { nodes: [] }
  }), /external by ref/);
});

test('S8 equal semantic context selection suppresses a duplicate lease transition', () => {
  const first = createContextLease({
    ...contextInput(),
    workerRef: 'worker.model.primary',
    workNodeRef: 'work.scheduler.context',
    graphFingerprint: 'graph-fingerprint',
    trustSnapshotFingerprint: 'trust-fingerprint',
    currentness: 'CURRENT'
  });
  const second = createContextLease({
    ...contextInput('context-lease.scheduler.reformed'),
    workerRef: 'worker.model.primary',
    workNodeRef: 'work.scheduler.context',
    graphFingerprint: 'graph-fingerprint',
    trustSnapshotFingerprint: 'trust-fingerprint',
    currentness: 'CURRENT'
  }, { priorLease: first.lease });
  assert.equal(second.changed, false);
  assert.equal(second.lease.leaseRef, first.lease.leaseRef);
});

test('S9 checkpoint releases worker/resource leases and preserves exact next action', () => {
  const { candidate, trust, options } = admission([workNode('work.scheduler.checkpoint')]);
  const scheduler = new SingleWorkerIntentScheduler({ workerRef: 'worker.model.primary' });
  const queue = scheduler.admit(candidate, options);
  scheduler.leaseSelected(contextInput());
  const result = scheduler.checkpoint({
    checkpointRef: 'checkpoint.scheduler.test',
    workNodeRef: queue.selected.workNodeRef,
    trustSnapshotFingerprint: trust.semanticFingerprint,
    lastCompletedStep: 'validated-input',
    selectedSourceRefs: ['source.work.test'],
    selectedContextRefs: ['context-lease.scheduler.test'],
    producedArtifactRefs: [],
    producedReceiptRefs: [queue.admissionReceipt.admissionReceiptRef],
    openQuestions: [],
    nextSafeAction: 'RESUME_VALIDATION',
    pendingToolCallRef: 'NONE',
    capabilityLeaseRef: queue.selectedBindings.capabilityLease.leaseRef,
    effectLeaseRef: queue.selectedBindings.effectLease.leaseRef,
    resourceSnapshotFingerprint: options.resourceSnapshot.semanticFingerprint,
    sourceHashes: ['a'.repeat(64)],
    formedAt: NOW
  }, { releaseReceiptRef: 'release.scheduler.checkpoint', releasedAt: NOW });
  assert.equal(result.resourceReleaseReceipt.state, 'RELEASED');
  assert.equal(result.workerReleaseReceipt.state, 'RELEASED');
  assert.equal(result.checkpoint.nextSafeAction, 'RESUME_VALIDATION');
  assert.equal(scheduler.active, null);
});

test('S10 resume revalidates current hashes and rejects stale checkpoint replay', () => {
  const { candidate, trust, options } = admission([workNode('work.scheduler.resume')]);
  const scheduler = new SingleWorkerIntentScheduler({ workerRef: 'worker.model.primary' });
  const queue = scheduler.admit(candidate, options);
  scheduler.leaseSelected(contextInput());
  const { checkpoint } = scheduler.checkpoint({
    checkpointRef: 'checkpoint.scheduler.resume',
    workNodeRef: queue.selected.workNodeRef,
    trustSnapshotFingerprint: trust.semanticFingerprint,
    lastCompletedStep: 'safe-step',
    selectedSourceRefs: ['source.work.test'],
    selectedContextRefs: ['context-lease.scheduler.test'],
    producedArtifactRefs: [],
    producedReceiptRefs: [],
    openQuestions: [],
    nextSafeAction: 'RESUME_SAFE_STEP',
    pendingToolCallRef: 'NONE',
    capabilityLeaseRef: queue.selectedBindings.capabilityLease.leaseRef,
    effectLeaseRef: queue.selectedBindings.effectLease.leaseRef,
    resourceSnapshotFingerprint: options.resourceSnapshot.semanticFingerprint,
    sourceHashes: ['a'.repeat(64)],
    formedAt: NOW
  }, { releaseReceiptRef: 'release.scheduler.resume', releasedAt: NOW });
  const stale = validateCheckpointResume(checkpoint, {
    graphFingerprint: 'changed-graph',
    trustSnapshotFingerprint: trust.semanticFingerprint,
    capabilityLeaseRef: checkpoint.capabilityLeaseRef,
    effectLeaseRef: checkpoint.effectLeaseRef,
    resourceSnapshot: options.resourceSnapshot,
    resourceRequest: options.resourceRequestByNodeRef[checkpoint.workNodeRef],
    sourceHashes: ['b'.repeat(64)],
    schedulerGeneration: 2
  });
  assert.equal(stale.admitted, false);
  assert.equal(stale.state, 'HELD_UNKNOWN');
});

function activeToolFixture() {
  const { candidate, options } = admission([workNode('work.scheduler.tool')]);
  const scheduler = new SingleWorkerIntentScheduler({ workerRef: 'worker.model.primary' });
  const queue = scheduler.admit(candidate, options);
  const active = scheduler.leaseSelected(contextInput());
  return { scheduler, queue, active };
}

function toolCallFrom({ queue, active }, overrides = {}) {
  return createToolCall({
    toolCallRef: 'tool-call.scheduler.test',
    workNodeRef: queue.selected.workNodeRef,
    contextLeaseRef: active.contextLease.leaseRef,
    toolRef: 'tool.mock.inspect',
    argumentSchemaRef: 'schema.tool.mock.inspect/v0',
    arguments: { sourceRef: 'source.work.test' },
    expectedResultContract: {
      schemaRef: 'schema.tool.mock.result/v0',
      requiredFields: ['summaryRef'],
      maxObservationBytes: 1024
    },
    schedulerGeneration: queue.generation,
    resourceLeaseRef: active.resourceLease.leaseRef,
    timeoutAt: LATER,
    cancellationPolicy: 'CHECKPOINT_THEN_CANCEL',
    ...overrides
  }, {
    contextLease: active.contextLease,
    capabilityLease: queue.selectedBindings.capabilityLease,
    effectLease: queue.selectedBindings.effectLease,
    resourceLease: active.resourceLease
  });
}

test('S11 tool call requires exact capability, effect and resource leases', () => {
  const fixture = activeToolFixture();
  const call = toolCallFrom(fixture);
  assert.equal(call.capabilityLeaseRef, fixture.queue.selectedBindings.capabilityLease.leaseRef);
  assert.throws(() => createToolCall({
    ...call,
    toolCallRef: 'tool-call.scheduler.bad',
    schedulerGeneration: call.schedulerGeneration + 1
  }, {
    contextLease: fixture.active.contextLease,
    capabilityLease: fixture.queue.selectedBindings.capabilityLease,
    effectLease: fixture.queue.selectedBindings.effectLease,
    resourceLease: fixture.active.resourceLease
  }), /generation mismatch/);
});

test('S12 wrong, stale, duplicate, late and mismatched tool results are rejected', () => {
  const fixture = activeToolFixture();
  const call = toolCallFrom(fixture);
  const base = {
    toolCallRef: call.toolCallRef,
    observationRef: 'observation.scheduler.test',
    workNodeRef: call.workNodeRef,
    contextLeaseRef: call.contextLeaseRef,
    toolRef: call.toolRef,
    schedulerGeneration: call.schedulerGeneration,
    schemaRef: 'schema.tool.mock.result/v0',
    observation: { summaryRef: 'summary.scheduler.test' },
    artifactRefs: []
  };
  const relay = new ToolResultRelay();
  relay.register(call);
  assert.equal(relay.accept({ ...base, toolRef: 'tool.wrong' }, { receivedAt: NOW }).reason, 'WRONG_TOOL');
  assert.equal(relay.accept({ ...base, schedulerGeneration: 99 }, { receivedAt: NOW }).reason, 'WRONG_GENERATION');
  assert.equal(relay.accept(base, { receivedAt: NOW }).accepted, true);
  assert.equal(relay.accept(base, { receivedAt: NOW }).reason, 'DUPLICATE_RESULT');
  assert.equal(relay.accept({ ...base, toolCallRef: 'missing' }, { receivedAt: NOW }).reason, 'UNKNOWN_OR_STALE_TOOL_CALL');

  const lateRelay = new ToolResultRelay();
  lateRelay.register(call);
  assert.equal(lateRelay.accept(base, { receivedAt: '2026-07-31T13:00:00.000Z' }).reason, 'LATE_RESULT');
  assert.equal(lateRelay.accept(base, { receivedAt: NOW }).reason, 'UNKNOWN_OR_STALE_TOOL_CALL');
});

test('S13 accepted tool result is reinjected once into the correct bounded context', () => {
  const fixture = activeToolFixture();
  const relay = new ToolResultRelay();
  const call = toolCallFrom(fixture);
  relay.register(call);
  const accepted = relay.accept({
    toolCallRef: call.toolCallRef,
    observationRef: 'observation.scheduler.accepted',
    workNodeRef: call.workNodeRef,
    contextLeaseRef: call.contextLeaseRef,
    toolRef: call.toolRef,
    schedulerGeneration: call.schedulerGeneration,
    schemaRef: 'schema.tool.mock.result/v0',
    observation: { summaryRef: 'summary.scheduler.accepted' },
    artifactRefs: ['artifact.scheduler.external']
  }, { receivedAt: NOW });
  const first = relay.reinject(fixture.active.contextLease, accepted.observation);
  const second = relay.reinject(fixture.active.contextLease, accepted.observation);
  assert.equal(first.accepted, true);
  assert.equal(first.frame.rawResultIncluded, false);
  assert.equal(second.accepted, false);
  assert.equal(second.reason, 'OBSERVATION_ALREADY_REINJECTED');
});

test('S14 cancellation releases leases and preserves work/source/receipt lineage', () => {
  const fixture = activeToolFixture();
  const result = fixture.scheduler.cancelActive({
    releaseReceiptRef: 'release.scheduler.cancel',
    releasedAt: NOW,
    reason: 'USER_CANCELLED'
  });
  assert.equal(result.changed, true);
  assert.equal(result.resourceReleaseReceipt.state, 'RELEASED');
  assert.equal(result.cancellationReceipt.sourceDiscarded, false);
  assert.deepEqual(result.cancellationReceipt.sourceRefs, ['source.work.test']);
  assert.deepEqual(result.cancellationReceipt.receiptRefs, [fixture.queue.admissionReceipt.admissionReceiptRef]);
  assert.equal(fixture.scheduler.active, null);
});

test('S15 queue, Terrain, Health and Guide derive bounded projections from the same state owners', () => {
  const owners = createIntentSchedulerState();
  let healthChanges = 0;
  owners.health.subscribe((event) => { if (event.changed) healthChanges += 1; });
  const queue = {
    state: 'BLOCKED',
    currentness: 'CURRENT',
    generation: 1,
    logicalReady: [{ workNodeRef: 'work.waiting', priorityClass: 'NORMAL', schedulingClass: 'NORMAL', admitted: false, reasonRefs: ['RESOURCE:RAM_INSUFFICIENT'] }],
    admittedReady: [],
    blocked: [{ workNodeRef: 'work.waiting', reasonRefs: ['RESOURCE:RAM_INSUFFICIENT'] }],
    selected: null
  };
  owners.queue.set(queue);
  owners.queue.set(structuredClone(queue));
  assert.equal(healthChanges, 1);
  assert.equal(owners.terrain.value.blockedRefs[0], 'work.waiting');
  assert.equal(owners.health.value.reasonRefs[0], 'RESOURCE:RAM_INSUFFICIENT');
  assert.equal(owners.guide.value.nextSafeAction, 'REPAIR_OR_WAIT');
  assert.equal(owners.runtime.value.rawMachineDumpIncluded, false);
  owners.dispose();
});

test('S16 scheduler contract resolves through canonical feature, state, process, module, test and health registrations', () => {
  const validation = validateBlueprint(bundle);
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  const stateRefs = new Set(bundle.blueprint.stateDomains.map((item) => item.stateRef));
  const featureRefs = new Set(bundle.featureRegistry.features.map((item) => item.featureRef));
  const processRefs = new Set(bundle.factory.processes.map((item) => item.processRef));
  const moduleRefs = new Set(bundle.modules.modules.map((item) => item.moduleRef));
  const testRefs = new Set(bundle.blueprint.tests.map((item) => item.testRef));
  const checkRefs = new Set(bundle.buildHealth.checks.map((item) => item.checkRef));
  assert.ok(stateRefs.has('state.intent-scheduler'));
  assert.ok(featureRefs.has('feature.vexlife.intent-orchestration-scheduler'));
  assert.ok(processRefs.has('process.vexlife.intent.scheduler-admit'));
  assert.ok(moduleRefs.has('module.vexlife.core.intent-scheduler'));
  assert.ok(testRefs.has('test.intent-scheduler.full-gate'));
  assert.ok(checkRefs.has('check.intent-scheduler'));
});

// [VXG RealForever]
