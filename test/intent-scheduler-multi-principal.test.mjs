import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import {
  createIntentEnvelope,
  createIntentTrustSnapshot,
  createIntentWorkgraph,
  createWorkNode
} from '../src/core/intent-workgraph.mjs';
import {
  appendPendingRootState,
  cancelPendingRootState,
  consumePendingRootSelection,
  createPendingRootIntent,
  selectNextPendingRoot,
  SingleWorkerIntentScheduler,
  validatePendingRootSchedulerState,
  WorkerLeaseAuthority
} from '../src/core/intent-scheduler.mjs';
import { createResourceSnapshot } from '../src/core/resource-admission.mjs';
import { createSchedulerRuntimeTrustSnapshot } from '../src/core/scheduler-runtime-trust.mjs';
import {
  createInitialSchedulerAggregate,
  createIntentSchedulerState,
  reduceSchedulerAggregate
} from '../src/core/state.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = loadBlueprint(root);
const intentRegistry = bundle.intentRegistry;
const schedulerRegistry = bundle.schedulerRegistry;
const registeredProcessRefs = bundle.factory.processes.map((item) => item.processRef);
const registeredRoleRefs = bundle.blueprint.roles.map((item) => item.roleRef);
const FORMED = '2026-09-09T09:10:00.000Z';
const OBSERVED = '2026-09-09T09:15:00.000Z';
const CHECKPOINT_AT = '2026-09-09T09:17:00.000Z';
const RESUME_FORMED = '2026-09-09T09:18:00.000Z';
const RESUME_OBSERVED = '2026-09-09T09:19:00.000Z';
const EXPIRES = '2026-09-09T10:00:00.000Z';
const RESUME_EXPIRES = '2026-09-09T10:18:00.000Z';
const RUNTIME_SOURCE_HASH = semanticHash({ fixture: 'intent-scheduler-multi-principal-runtime/v1' });
const SOURCE_BINDINGS = [{
  sourceRef: 'source.work.family-test',
  sourceHash: semanticHash({ sourceRef: 'source.work.family-test', fixtureVersion: 1 })
}];
let schedulerInstanceSequence = 0;

function envelope(intentRef, principalRef) {
  return createIntentEnvelope({
    intentRef,
    originMessageRef: `message.${intentRef}`,
    originSpeakerRef: principalRef,
    recipientRoleRef: 'role.vex.developer',
    projectRef: 'project.family.multi-principal.test',
    threadRef: `thread.${principalRef}`,
    channelRef: 'channel.family.multi-principal.test',
    originalContentHash: semanticHash({ intentRef, principalRef }),
    desiredOutcome: { intentKey: 'VALIDATE_WORKGRAPH', summary: `Exercise ${intentRef}` },
    constraints: [],
    createdAt: FORMED,
    sourceLineageRef: `lineage.${principalRef}`
  }, intentRegistry);
}

function graph(intentRef, principalRef) {
  const intent = envelope(intentRef, principalRef);
  return createIntentWorkgraph({
    graphRef: `intent-workgraph.${intentRef}`,
    intent,
    nodes: [],
    transitions: [],
    receipts: [],
    bindingRefs: {},
    createdAt: FORMED
  }, intentRegistry);
}

function pending(intentRef, principalRef, schedulingClass = 'NORMAL', submittedGeneration = 0) {
  return createPendingRootIntent(graph(intentRef, principalRef), {
    schedulerRegistry,
    schedulingClass,
    submittedGeneration
  });
}

function emptyState() {
  return { pendingRootIntents: [], principalFairnessLedger: {} };
}

function append(state, rootIntent) {
  const result = appendPendingRootState(state, rootIntent, { schedulerRegistry });
  return {
    pendingRootIntents: result.pendingRootIntents,
    principalFairnessLedger: result.principalFairnessLedger
  };
}

function consume(state, intentRef, schedulerGeneration, options = {}) {
  const result = consumePendingRootSelection(state, intentRef, {
    schedulerRegistry,
    schedulerGeneration,
    ...options
  });
  return {
    pendingRootIntents: result.pendingRootIntents,
    principalFairnessLedger: result.principalFairnessLedger
  };
}

function runtimeBindingRefs(nodes) {
  return Object.fromEntries(intentRegistry.bindingFields.map((field) => [
    field,
    [...new Set(nodes.flatMap((item) => Array.isArray(item[field]) ? item[field] : [item[field]]).filter(Boolean))].sort()
  ]));
}

function runtimeWorkNode(intentRef, nodeRef, overrides = {}) {
  return createWorkNode({
    workNodeRef: nodeRef,
    rootIntentRef: intentRef,
    purpose: `Schedule ${nodeRef}`,
    processRef: 'process.vexlife.intent.validate-workgraph',
    state: 'READY',
    dependencyRefs: [],
    childRefs: [],
    roleRef: 'role.vex.developer',
    priorityClass: 'NORMAL',
    applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs: [],
    applicableBurdenReleaseRefs: [],
    capabilityEnvelopeRef: `capability-envelope.${nodeRef}`,
    effectEnvelopeRef: `effect-envelope.${nodeRef}`,
    resourceEnvelopeRef: `resource-envelope.${nodeRef}`,
    expectedTransitionRef: `expected-transition.${nodeRef}`,
    completionGateRefs: [`completion-gate.${nodeRef}`],
    returnRouteRef: `return-route.${nodeRef}`,
    sourceRefs: ['source.work.family-test'],
    createdAt: FORMED,
    ...overrides
  }, intentRegistry);
}

function runtimeFormationTransitions(nodes) {
  return nodes.flatMap((node) => {
    let priorState = 'CAPTURED';
    return ['DECOMPOSED', 'PLAN_VALIDATED', 'READY'].map((nextState, sequence) => {
      const transition = {
        transitionRef: `transition.family.${node.workNodeRef}.${sequence}`,
        workNodeRef: node.workNodeRef,
        sequence,
        priorState,
        nextState,
        reason: 'multi-principal scheduler test formation',
        actorRef: 'vex.test',
        actorRoleRef: 'role.vex.developer',
        processRef: 'process.vexlife.intent.verify-transition',
        sourceRefs: [`source.transition.${node.workNodeRef}`],
        createdAt: `2026-09-09T09:10:0${sequence}.000Z`
      };
      priorState = nextState;
      return transition;
    });
  });
}

function runtimeGraph(intentRef, principalRef, nodeOverrides = {}) {
  const nodes = [runtimeWorkNode(intentRef, `work.${intentRef}`, nodeOverrides)];
  return createIntentWorkgraph({
    graphRef: `intent-workgraph.runtime.${intentRef}`,
    intent: envelope(intentRef, principalRef),
    nodes,
    transitions: runtimeFormationTransitions(nodes),
    receipts: [],
    bindingRefs: runtimeBindingRefs(nodes),
    createdAt: FORMED
  }, intentRegistry);
}

function runtimeTrustSnapshot(candidate, principalRef) {
  return createIntentTrustSnapshot({
    schemaVersion: 'vexlife.intent-trust-snapshot/v0',
    snapshotRef: `trust-snapshot.family.${candidate.intent.intentRef}`,
    sourceRef: 'test/intent-scheduler-multi-principal.test.mjs#trust',
    formationRef: 'formation.family.scheduler.trust.test',
    formedAt: FORMED,
    currentness: 'CURRENT',
    bindingRefs: runtimeBindingRefs(candidate.nodes),
    actorRefs: [principalRef, 'vex.test'],
    decisionRefs: [],
    authorizationBindings: []
  }, intentRegistry);
}

function runtimeResource(generation = 1) {
  const resumed = generation > 1;
  return createResourceSnapshot({
    snapshotRef: `resource-snapshot.family.test.${generation}`,
    generation,
    sourceRef: 'source.intent-scheduler.test-runtime',
    sourceHash: RUNTIME_SOURCE_HASH,
    formationRef: `formation.family.scheduler.resource.${generation}`,
    evidenceClass: 'SIMULATED_CURRENT',
    cpuLoadPct: resumed ? 24 : 20,
    cpuConcurrencyLimit: 4,
    cpuActiveCount: 0,
    ramAvailableMb: resumed ? 15360 : 16384,
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
    formedAt: resumed ? RESUME_FORMED : FORMED,
    observedAt: resumed ? RESUME_OBSERVED : OBSERVED,
    expiresAt: resumed ? RESUME_EXPIRES : EXPIRES
  });
}

function runtimeTrust(resourceSnapshot, generation = resourceSnapshot.generation) {
  const resumed = generation > 1;
  return createSchedulerRuntimeTrustSnapshot({
    snapshotRef: `runtime-snapshot.family.test.${generation}`,
    sourceRef: resourceSnapshot.sourceRef,
    sourceHash: resourceSnapshot.sourceHash,
    formationRef: `formation.family.scheduler.runtime.${generation}`,
    evidenceClass: 'SIMULATED_CURRENT',
    schedulerGeneration: generation,
    formedAt: resumed ? RESUME_FORMED : FORMED,
    observedAt: resumed ? RESUME_OBSERVED : OBSERVED,
    expiresAt: resumed ? RESUME_EXPIRES : EXPIRES,
    workerRef: 'worker.model.test.primary',
    actorRef: 'vex.test',
    roleRef: 'role.vex.developer',
    claimRef: 'claim.family.scheduler.test',
    occupancyRef: `occupancy.family.scheduler.test.${generation}`,
    leaseAuthorityRef: 'authority.intent-scheduler.test-runtime',
    resourceSnapshotRef: resourceSnapshot.snapshotRef,
    resourceSnapshotFingerprint: resourceSnapshot.semanticFingerprint,
    currentness: 'CURRENT'
  }, { schedulerRegistry, resourceSnapshot });
}

function runtimeBindings(candidate, trust, runtime, generation = 1) {
  const resumed = generation > 1;
  const formedAt = resumed ? RESUME_FORMED : FORMED;
  const observedAt = resumed ? RESUME_OBSERVED : OBSERVED;
  const expiresAt = resumed ? RESUME_EXPIRES : EXPIRES;
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
      formationRef: `formation.family.occupancy.${node.workNodeRef}.${generation}`,
      ...common
    };
    capabilityLeaseByNodeRef[node.workNodeRef] = {
      leaseRef: `capability-lease.${node.workNodeRef}.${generation}`,
      workNodeRef: node.workNodeRef,
      graphFingerprint: candidate.semanticFingerprint,
      trustSnapshotFingerprint: trust.semanticFingerprint,
      envelopeRef: node.capabilityEnvelopeRef,
      formationRef: `formation.family.capability.${node.workNodeRef}.${generation}`,
      toolRefs: ['tool.mock.inspect'],
      ...common
    };
    effectLeaseByNodeRef[node.workNodeRef] = {
      leaseRef: `effect-lease.${node.workNodeRef}.${generation}`,
      workNodeRef: node.workNodeRef,
      graphFingerprint: candidate.semanticFingerprint,
      trustSnapshotFingerprint: trust.semanticFingerprint,
      envelopeRef: node.effectEnvelopeRef,
      formationRef: `formation.family.effect.${node.workNodeRef}.${generation}`,
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

function runtimeAdmission(intentRef, principalRef, { generation = 1, nodeOverrides = {} } = {}) {
  const candidate = runtimeGraph(intentRef, principalRef, nodeOverrides);
  const trust = runtimeTrustSnapshot(candidate, principalRef);
  const resourceSnapshot = runtimeResource(generation);
  const runtime = runtimeTrust(resourceSnapshot, generation);
  const resumed = generation > 1;
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
      formedAt: resumed ? RESUME_FORMED : FORMED,
      observedAt: resumed ? RESUME_OBSERVED : OBSERVED,
      expiresAt: resumed ? RESUME_EXPIRES : EXPIRES
    }
  };
}

function runtimeContextInput(generation = 1, suffix = 'primary') {
  const resumed = generation > 1;
  return {
    leaseRef: `context-lease.family.test.${generation}.${suffix}`,
    cancellationTokenRef: `cancellation-token.family.test.${generation}.${suffix}`,
    foundationKernelRef: 'foundation-kernel.compact',
    roleFrameRef: 'role-frame.developer',
    intentFrameRef: 'intent-frame.family.test',
    selectedAtlasRefs: ['module.vexlife.core.intent-scheduler'],
    selectedSourceRefs: ['source.work.family-test'],
    applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs: [],
    applicableReleaseRefs: [],
    inputTokenEstimate: 300,
    reservedOutputTokens: 200,
    hardTokenLimit: 1000,
    formedAt: resumed ? RESUME_FORMED : FORMED,
    observedAt: resumed ? RESUME_OBSERVED : OBSERVED,
    expiresAt: resumed ? RESUME_EXPIRES : EXPIRES,
    checkpointReturnRef: 'return-route.family.scheduler.checkpoint'
  };
}

function makeRuntimeScheduler({ authority = null, schedulerInstanceRef = null } = {}) {
  return new SingleWorkerIntentScheduler({
    workerRef: 'worker.model.test.primary',
    schedulerInstanceRef: schedulerInstanceRef ?? `instance.family.scheduler.test.${schedulerInstanceSequence += 1}`,
    schedulerRegistry,
    runtimeAuthority: authority ?? new WorkerLeaseAuthority({ sourceRef: 'source.intent-scheduler.test-runtime' })
  });
}

function runtimeCheckpointInput(fixture, checkpointRef = 'checkpoint.family.scheduler.test') {
  return {
    checkpointRef,
    workNodeRef: fixture.queue.selected.workNodeRef,
    lastCompletedStep: 'validated-input',
    selectedSourceRefs: ['source.work.family-test'],
    selectedContextRefs: [fixture.active.contextLease.leaseRef],
    producedArtifactRefs: [],
    producedReceiptRefs: [fixture.queue.admissionReceipt.admissionReceiptRef],
    openQuestions: [],
    nextSafeAction: 'RESUME_VALIDATION',
    pendingToolCallRef: 'NONE',
    sourceBindings: SOURCE_BINDINGS,
    formedAt: CHECKPOINT_AT
  };
}

test('MPQ-00 independent root intents coexist as exact aggregate-owned identities', () => {
  let state = emptyState();
  state = append(state, pending('intent.family.a1', 'person.family.a', 'NORMAL', 0));
  state = append(state, pending('intent.family.a2', 'person.family.a', 'NORMAL', 1));
  state = append(state, pending('intent.family.b1', 'person.family.b', 'NORMAL', 0));
  state = append(state, pending('intent.family.c1', 'person.family.c', 'NORMAL', 0));

  const validated = validatePendingRootSchedulerState(state, { schedulerRegistry });
  assert.equal(validated.ok, true);
  assert.equal(validated.pendingRootCount, 4);
  assert.equal(validated.principalCount, 3);
  assert.deepEqual(state.pendingRootIntents.map((item) => item.intentRef), [
    'intent.family.a1',
    'intent.family.a2',
    'intent.family.b1',
    'intent.family.c1'
  ]);
  assert.equal(state.pendingRootIntents.every((item) => item.rawPromptTitleContentStored === false), true);
});

test('MPQ-02 principal-first fairness prevents one principal from monopolizing normal roots', () => {
  let state = emptyState();
  state = append(state, pending('intent.family.a1', 'person.family.a', 'NORMAL', 0));
  state = append(state, pending('intent.family.a2', 'person.family.a', 'NORMAL', 1));
  state = append(state, pending('intent.family.b1', 'person.family.b', 'NORMAL', 0));
  state = append(state, pending('intent.family.c1', 'person.family.c', 'NORMAL', 0));

  const selected = [];
  for (let generation = 1; state.pendingRootIntents.length; generation += 1) {
    const next = selectNextPendingRoot(state.pendingRootIntents, state.principalFairnessLedger, { schedulerRegistry });
    selected.push(next.intentRef);
    state = consume(state, next.intentRef, generation);
  }
  assert.deepEqual(selected, [
    'intent.family.a1',
    'intent.family.b1',
    'intent.family.c1',
    'intent.family.a2'
  ]);
});

test('MPQ-03 principal fairness replay is deterministic from exact persisted state', () => {
  let state = emptyState();
  state = append(state, pending('intent.family.a1', 'person.family.a', 'NORMAL', 0));
  state = append(state, pending('intent.family.a2', 'person.family.a', 'NORMAL', 1));
  state = append(state, pending('intent.family.b1', 'person.family.b', 'NORMAL', 0));
  state = append(state, pending('intent.family.c1', 'person.family.c', 'NORMAL', 0));
  state = consume(state, 'intent.family.a1', 1);

  const replayed = structuredClone(JSON.parse(JSON.stringify(state)));
  assert.equal(validatePendingRootSchedulerState(replayed, { schedulerRegistry }).ok, true);
  assert.equal(semanticHash(replayed), semanticHash(state));
  assert.equal(
    selectNextPendingRoot(replayed.pendingRootIntents, replayed.principalFairnessLedger, { schedulerRegistry }).intentRef,
    'intent.family.b1'
  );
});

test('MPQ-04 strict class hierarchy keeps INTERACTIVE ahead of older NORMAL work', () => {
  let state = emptyState();
  state = append(state, pending('intent.family.normal-old', 'person.family.normal', 'NORMAL', 0));
  state = append(state, pending('intent.family.interactive-new', 'person.family.interactive', 'INTERACTIVE', 9));

  const selected = selectNextPendingRoot(state.pendingRootIntents, state.principalFairnessLedger, { schedulerRegistry });
  assert.equal(selected.intentRef, 'intent.family.interactive-new');
  assert.equal(selected.schedulingClass, 'INTERACTIVE');
});

test('MPQ-05/06 root enqueue and preemption transitions preserve unrelated active scheduler truth', () => {
  let pendingState = emptyState();
  pendingState = append(pendingState, pending('intent.family.waiting-a', 'person.family.a', 'NORMAL', 1));
  pendingState = append(pendingState, pending('intent.family.waiting-b', 'person.family.b', 'INTERACTIVE', 2));

  const activeSentinel = {
    schemaVersion: 'vexlife.intent-worker-lease/v1',
    workerLeaseRef: 'worker-lease.existing.active',
    workerRef: 'worker.model.test.primary',
    workNodeRef: 'work.existing.active',
    schedulerGeneration: 2,
    semanticFingerprint: semanticHash({ marker: 'existing-active-worker' })
  };
  const queueSentinel = {
    schemaVersion: 'vexlife.intent-scheduler-queue/v1',
    state: 'LEASED',
    lifecycle: 'LEASED',
    generation: 2,
    graphFingerprint: semanticHash({ marker: 'existing-active-graph' }),
    semanticFingerprint: semanticHash({ marker: 'existing-active-queue' })
  };

  let aggregate = createInitialSchedulerAggregate();
  aggregate = {
    ...aggregate,
    phase: 'RUNNING',
    generation: 2,
    active: activeSentinel,
    queue: queueSentinel
  };
  delete aggregate.semanticFingerprint;
  aggregate.semanticFingerprint = semanticHash(aggregate);

  const enqueued = reduceSchedulerAggregate(aggregate, {
    type: 'ROOT_ENQUEUED',
    transitionRef: 'transition.intent-scheduler.root-enqueued.while-active',
    pendingRootIntents: pendingState.pendingRootIntents,
    principalFairnessLedger: pendingState.principalFairnessLedger
  }, { schedulerRegistry });

  assert.deepEqual(enqueued.active, activeSentinel);
  assert.deepEqual(enqueued.queue, queueSentinel);
  assert.deepEqual(enqueued.pendingRootIntents, pendingState.pendingRootIntents);
  assert.deepEqual(enqueued.principalFairnessLedger, pendingState.principalFairnessLedger);

  const preemptionSentinel = {
    schemaVersion: 'vexlife.intent-scheduler-pending-preemption/v1',
    pendingPreemptionRef: 'preemption.existing.active.incoming',
    activeWorkNodeRef: activeSentinel.workNodeRef,
    incomingWorkNodeRef: 'work.incoming.interactive',
    state: 'CHECKPOINT_REQUIRED',
    semanticFingerprint: semanticHash({ marker: 'pending-preemption' })
  };
  const preempting = reduceSchedulerAggregate(enqueued, {
    type: 'PREEMPTION_REQUESTED',
    transitionRef: 'transition.intent-scheduler.preemption-request.root-retention',
    pendingPreemption: preemptionSentinel
  }, { schedulerRegistry });

  assert.deepEqual(preempting.pendingRootIntents, pendingState.pendingRootIntents);
  assert.deepEqual(preempting.principalFairnessLedger, pendingState.principalFairnessLedger);
  assert.deepEqual(preempting.active, activeSentinel);
  assert.deepEqual(preempting.pendingPreemption, preemptionSentinel);
});

test('MPQ-05 real scheduler accepts a new root while the physical worker remains active', () => {
  const running = runtimeAdmission('intent.family.running', 'person.family.a', {
    nodeOverrides: { priorityClass: 'LOW', background: true }
  });
  const scheduler = makeRuntimeScheduler();
  const queue = scheduler.admit(running.candidate, running.options);
  const active = scheduler.leaseSelected(runtimeContextInput(1, 'running'));
  assert.equal(active.admitted, true);

  const waiting = runtimeAdmission('intent.family.waiting-live', 'person.family.b');
  const priorActiveFingerprint = scheduler.active.semanticFingerprint;
  const enqueued = scheduler.enqueueRootIntent(waiting.candidate, { schedulingClass: 'NORMAL' });

  assert.equal(enqueued.changed, true);
  assert.equal(scheduler.active.semanticFingerprint, priorActiveFingerprint);
  assert.equal(scheduler.queue.graphFingerprint, queue.graphFingerprint);
  assert.deepEqual(scheduler.pendingRoots.map((item) => item.intentRef), ['intent.family.waiting-live']);
});

test('MPQ-09 real scheduler rejects admission for a graph that is not the principal-first pending root', () => {
  const scheduler = makeRuntimeScheduler();
  const expected = runtimeAdmission('intent.family.bind-a', 'person.family.a');
  const substituted = runtimeAdmission('intent.family.bind-b', 'person.family.b');
  scheduler.enqueueRootIntent(expected.candidate, { schedulingClass: 'NORMAL' });

  assert.throws(() => scheduler.admit(substituted.candidate, substituted.options), /pending root graph binding/);
  assert.equal(scheduler.generation, 0);
  assert.deepEqual(scheduler.pendingRoots.map((item) => item.intentRef), ['intent.family.bind-a']);
});

test('MPQ-04/05 newly queued interactive root makes an older unleased root admission stale', () => {
  const scheduler = makeRuntimeScheduler();
  const normal = runtimeAdmission('intent.family.normal-unleased', 'person.family.a');
  scheduler.enqueueRootIntent(normal.candidate, { schedulingClass: 'NORMAL' });
  const admitted = scheduler.admit(normal.candidate, normal.options);
  assert.equal(admitted.pendingRootIntentRef, normal.candidate.intent.intentRef);

  const interactive = runtimeAdmission('intent.family.interactive-late', 'person.family.b', { generation: 2 });
  scheduler.enqueueRootIntent(interactive.candidate, { schedulingClass: 'INTERACTIVE' });
  const stale = scheduler.leaseSelected(runtimeContextInput(1, 'stale'));

  assert.equal(stale.admitted, false);
  assert.equal(stale.reason, 'PENDING_ROOT_SELECTION_STALE');
  assert.equal(scheduler.active, null);
  assert.deepEqual(scheduler.pendingRoots.map((item) => item.intentRef), [
    'intent.family.interactive-late',
    'intent.family.normal-unleased'
  ]);
});

test('MPQ-05 legacy unleased admission also becomes stale when a root ledger appears', () => {
  const scheduler = makeRuntimeScheduler();
  const legacy = runtimeAdmission('intent.family.legacy-admitted', 'person.family.a');
  scheduler.admit(legacy.candidate, legacy.options);
  const waiting = runtimeAdmission('intent.family.root-after-legacy', 'person.family.b', { generation: 2 });
  scheduler.enqueueRootIntent(waiting.candidate, { schedulingClass: 'NORMAL' });

  const stale = scheduler.leaseSelected(runtimeContextInput(1, 'legacy-stale'));
  assert.equal(stale.admitted, false);
  assert.equal(stale.reason, 'PENDING_ROOT_SELECTION_STALE');
  assert.deepEqual(scheduler.pendingRoots.map((item) => item.intentRef), ['intent.family.root-after-legacy']);
});

test('MPQ-01 rejected physical worker claim leaves the selected root and fairness state untouched', () => {
  const authority = new WorkerLeaseAuthority({ sourceRef: 'source.intent-scheduler.test-runtime' });
  const holder = makeRuntimeScheduler({ authority, schedulerInstanceRef: 'instance.family.scheduler.holder' });
  const held = runtimeAdmission('intent.family.worker-holder', 'person.family.holder');
  holder.admit(held.candidate, held.options);
  assert.equal(holder.leaseSelected(runtimeContextInput(1, 'holder')).admitted, true);

  const contender = makeRuntimeScheduler({ authority, schedulerInstanceRef: 'instance.family.scheduler.contender' });
  const request = runtimeAdmission('intent.family.worker-contender', 'person.family.contender');
  contender.enqueueRootIntent(request.candidate, { schedulingClass: 'NORMAL' });
  contender.admit(request.candidate, request.options);
  const priorRootState = semanticHash({
    pendingRootIntents: contender.aggregate.pendingRootIntents,
    principalFairnessLedger: contender.aggregate.principalFairnessLedger
  });

  const rejected = contender.leaseSelected(runtimeContextInput(1, 'contender'));
  assert.equal(rejected.admitted, false);
  assert.equal(rejected.reason, 'EXACT_WORKER_SOURCE_ALREADY_LEASED');
  assert.equal(semanticHash({
    pendingRootIntents: contender.aggregate.pendingRootIntents,
    principalFairnessLedger: contender.aggregate.principalFairnessLedger
  }), priorRootState);
  assert.deepEqual(contender.pendingRoots.map((item) => item.intentRef), ['intent.family.worker-contender']);
});

test('MPQ-01/02 successful worker lease atomically consumes one root and ages the competing principal', () => {
  const scheduler = makeRuntimeScheduler();
  const a1 = runtimeAdmission('intent.family.a1-runtime', 'person.family.a');
  const a2 = runtimeAdmission('intent.family.a2-runtime', 'person.family.a');
  const b1 = runtimeAdmission('intent.family.b1-runtime', 'person.family.b');
  scheduler.enqueueRootIntent(a1.candidate, { schedulingClass: 'NORMAL' });
  scheduler.enqueueRootIntent(a2.candidate, { schedulingClass: 'NORMAL' });
  scheduler.enqueueRootIntent(b1.candidate, { schedulingClass: 'NORMAL' });

  const queue = scheduler.admit(a1.candidate, a1.options);
  assert.equal(queue.pendingRootIntentRef, 'intent.family.a1-runtime');
  const leased = scheduler.leaseSelected(runtimeContextInput(1, 'a1'));

  assert.equal(leased.admitted, true);
  assert.equal(scheduler.active.workerRef, 'worker.model.test.primary');
  assert.deepEqual(scheduler.pendingRoots.map((item) => item.intentRef), [
    'intent.family.a2-runtime',
    'intent.family.b1-runtime'
  ]);
  assert.equal(scheduler.aggregate.principalFairnessLedger['person.family.a'].deferralCount, 0);
  assert.equal(scheduler.aggregate.principalFairnessLedger['person.family.b'].deferralCount, 1);
  assert.equal(scheduler.projections.health.value.activeWorkerCount, 1);
});

test('MPQ-08 class cancellation remains requester-own queued root only', () => {
  const scheduler = makeRuntimeScheduler();
  const a = runtimeAdmission('intent.family.cancel-runtime-a', 'person.family.a');
  const b = runtimeAdmission('intent.family.cancel-runtime-b', 'person.family.b');
  scheduler.enqueueRootIntent(a.candidate, { schedulingClass: 'NORMAL' });
  scheduler.enqueueRootIntent(b.candidate, { schedulingClass: 'NORMAL' });

  assert.throws(() => scheduler.cancelQueuedRootIntent('intent.family.cancel-runtime-a', {
    requesterRef: 'person.family.b'
  }), /only its own queued root intent/);
  assert.equal(scheduler.cancelQueuedRootIntent('intent.family.cancel-runtime-a', {
    requesterRef: 'person.family.a'
  }).changed, true);
  assert.deepEqual(scheduler.pendingRoots.map((item) => item.intentRef), ['intent.family.cancel-runtime-b']);
});

test('MPQ-06 interactive pending root survives checkpoint and is consumed only by successful preemption resume', () => {
  const background = runtimeAdmission('intent.family.preempted-background', 'person.family.a', {
    nodeOverrides: { priorityClass: 'LOW', background: true }
  });
  const scheduler = makeRuntimeScheduler();
  const queue = scheduler.admit(background.candidate, background.options);
  const active = scheduler.leaseSelected(runtimeContextInput(1, 'background'));
  assert.equal(active.admitted, true);

  const unrelated = runtimeAdmission('intent.family.unrelated-normal', 'person.family.c', { generation: 2 });
  const interactive = runtimeAdmission('intent.family.preempting-human', 'person.family.b', { generation: 2 });
  scheduler.enqueueRootIntent(unrelated.candidate, { schedulingClass: 'NORMAL' });
  scheduler.enqueueRootIntent(interactive.candidate, { schedulingClass: 'INTERACTIVE' });

  const requested = scheduler.requestPendingRootPreemption(interactive.candidate, interactive.options);
  assert.equal(requested.state, 'CHECKPOINT_REQUIRED');
  assert.equal(scheduler.aggregate.pendingPreemption.incomingRootIntentRef, 'intent.family.preempting-human');
  assert.deepEqual(scheduler.pendingRoots.map((item) => item.intentRef), [
    'intent.family.preempting-human',
    'intent.family.unrelated-normal'
  ]);

  const fixture = { queue, active };
  const checkpointed = scheduler.checkpoint(runtimeCheckpointInput(fixture, 'checkpoint.family.preemption'), {
    releaseReceiptRef: 'release.family.preemption',
    releasedAt: CHECKPOINT_AT
  });
  assert.equal(scheduler.active, null);
  assert.deepEqual(scheduler.pendingRoots.map((item) => item.intentRef), [
    'intent.family.preempting-human',
    'intent.family.unrelated-normal'
  ]);

  const resumed = scheduler.resume(checkpointed.checkpoint.checkpointRef, {
    graph: interactive.candidate,
    options: interactive.options,
    contextInput: runtimeContextInput(2, 'interactive'),
    sourceBindings: SOURCE_BINDINGS,
    completePreemption: true
  });
  assert.equal(resumed.state, 'PREEMPTION_COMPLETED');
  assert.equal(scheduler.active.graphFingerprint, interactive.candidate.semanticFingerprint);
  assert.deepEqual(scheduler.pendingRoots.map((item) => item.intentRef), ['intent.family.unrelated-normal']);
  assert.equal(scheduler.aggregate.pendingPreemption, null);
  assert.equal(scheduler.aggregate.continuations.some((item) =>
    item.checkpointRef === checkpointed.checkpoint.checkpointRef
  ), true);
  assert.equal(scheduler.projections.health.value.activeWorkerCount, 1);
});

test('MPQ-04/06 complete-preemption resume fails closed when a newer current principal-first interactive root appears', () => {
  const background = runtimeAdmission('intent.family.preempted-background-stale', 'person.family.a', {
    nodeOverrides: { priorityClass: 'LOW', background: true }
  });
  const scheduler = makeRuntimeScheduler();
  const queue = scheduler.admit(background.candidate, background.options);
  const active = scheduler.leaseSelected(runtimeContextInput(1, 'background-stale'));
  assert.equal(active.admitted, true);

  const retained = runtimeAdmission('intent.family.preempting-z-retained', 'person.family.b', { generation: 2 });
  scheduler.enqueueRootIntent(retained.candidate, { schedulingClass: 'INTERACTIVE' });
  const requested = scheduler.requestPendingRootPreemption(retained.candidate, retained.options);
  assert.equal(requested.state, 'CHECKPOINT_REQUIRED');
  assert.equal(scheduler.aggregate.pendingPreemption.incomingRootIntentRef, 'intent.family.preempting-z-retained');

  const checkpointed = scheduler.checkpoint(runtimeCheckpointInput({ queue, active }, 'checkpoint.family.preemption-stale'), {
    releaseReceiptRef: 'release.family.preemption-stale',
    releasedAt: CHECKPOINT_AT
  });
  assert.equal(scheduler.active, null);

  const late = runtimeAdmission('intent.family.preempting-a-late', 'person.family.c', { generation: 2 });
  scheduler.enqueueRootIntent(late.candidate, { schedulingClass: 'INTERACTIVE' });
  const current = selectNextPendingRoot(
    scheduler.aggregate.pendingRootIntents,
    scheduler.aggregate.principalFairnessLedger,
    { schedulerRegistry }
  );
  assert.equal(current.intentRef, 'intent.family.preempting-a-late');

  const priorRootState = semanticHash({
    pendingRootIntents: scheduler.aggregate.pendingRootIntents,
    principalFairnessLedger: scheduler.aggregate.principalFairnessLedger
  });
  const pendingPreemptionFingerprint = scheduler.aggregate.pendingPreemption.semanticFingerprint;

  assert.throws(() => scheduler.resume(checkpointed.checkpoint.checkpointRef, {
    graph: retained.candidate,
    options: retained.options,
    contextInput: runtimeContextInput(2, 'retained-stale'),
    sourceBindings: SOURCE_BINDINGS,
    completePreemption: true
  }), /current principal-first selection/);

  assert.equal(scheduler.active, null);
  assert.deepEqual(scheduler.pendingRoots.map((item) => item.intentRef), [
    'intent.family.preempting-a-late',
    'intent.family.preempting-z-retained'
  ]);
  assert.equal(semanticHash({
    pendingRootIntents: scheduler.aggregate.pendingRootIntents,
    principalFairnessLedger: scheduler.aggregate.principalFairnessLedger
  }), priorRootState);
  assert.equal(scheduler.aggregate.pendingPreemption.semanticFingerprint, pendingPreemptionFingerprint);
});

test('MPQ-07 restart aggregate restores exact pending roots and content-free shared projection', () => {
  let pendingState = emptyState();
  pendingState = append(pendingState, pending('intent.family.restart-a', 'person.family.a', 'NORMAL', 0));
  pendingState = append(pendingState, pending('intent.family.restart-b', 'person.family.b', 'EXPEDITE', 0));

  let aggregate = createInitialSchedulerAggregate();
  aggregate = reduceSchedulerAggregate(aggregate, {
    type: 'ROOT_ENQUEUED',
    transitionRef: 'transition.intent-scheduler.root-enqueued.restart-test',
    pendingRootIntents: pendingState.pendingRootIntents,
    principalFairnessLedger: pendingState.principalFairnessLedger
  }, { schedulerRegistry });

  const restored = createIntentSchedulerState({ aggregate, schedulerRegistry });
  try {
    assert.equal(restored.runtime.value.pendingRoots.count, 2);
    assert.equal(restored.runtime.value.pendingRoots.principalCount, 2);
    assert.deepEqual(restored.terrain.value.pendingRootIntentRefs, [
      'intent.family.restart-a',
      'intent.family.restart-b'
    ]);
    assert.equal(restored.runtime.value.pendingRoots.rawPromptTitleContentIncluded, false);
    assert.equal(restored.health.value.pendingRootCount, 2);
  } finally {
    restored.dispose();
  }
});

test('MPQ-08 requester cancellation is own queued root only', () => {
  let state = emptyState();
  state = append(state, pending('intent.family.cancel-a', 'person.family.a', 'NORMAL', 0));
  state = append(state, pending('intent.family.keep-b', 'person.family.b', 'NORMAL', 0));

  assert.throws(() => cancelPendingRootState(state, 'intent.family.cancel-a', {
    requesterRef: 'person.family.b',
    schedulerRegistry,
    schedulerGeneration: 1
  }), /only its own queued root intent/);

  const cancelled = cancelPendingRootState(state, 'intent.family.cancel-a', {
    requesterRef: 'person.family.a',
    schedulerRegistry,
    schedulerGeneration: 1
  });
  assert.equal(cancelled.changed, true);
  assert.deepEqual(cancelled.pendingRootIntents.map((item) => item.intentRef), ['intent.family.keep-b']);
  assert.deepEqual(Object.keys(cancelled.principalFairnessLedger), ['person.family.b']);
});

test('MPQ-09 origin principal is rederived from exact immutable Intent fingerprint', () => {
  const exactGraph = graph('intent.family.origin-proof', 'person.family.actual');
  const rootIntent = createPendingRootIntent(exactGraph, {
    schedulerRegistry,
    schedulingClass: 'NORMAL',
    submittedGeneration: 0,
    originPrincipalRef: 'person.family.forged'
  });
  assert.equal(rootIntent.originPrincipalRef, 'person.family.actual');

  const forged = structuredClone(exactGraph);
  forged.intent.originSpeakerRef = 'person.family.forged';
  assert.throws(() => createPendingRootIntent(forged, {
    schedulerRegistry,
    schedulingClass: 'NORMAL',
    submittedGeneration: 0
  }), /exact immutable Intent and Workgraph fingerprints/);
});

test('MPQ-10 pending-root state is content-free and rejects injected title/content fields', () => {
  let state = emptyState();
  const rootIntent = pending('intent.family.content-free', 'person.family.a', 'NORMAL', 0);
  state = append(state, rootIntent);
  const serialized = JSON.stringify(state);
  assert.equal(serialized.includes('desiredOutcome'), false);
  assert.equal(serialized.includes('originalContentHash'), false);
  assert.equal(serialized.includes('Exercise intent.family.content-free'), false);

  const injected = structuredClone(rootIntent);
  injected.title = 'not allowed';
  delete injected.semanticFingerprint;
  injected.semanticFingerprint = semanticHash(injected);
  assert.throws(() => appendPendingRootState(emptyState(), injected, { schedulerRegistry }),
    /malformed or contains unowned content/);
});

test('MPQ-10B source-managed cardinality fails closed before unbounded household accumulation', () => {
  let state = emptyState();
  for (let index = 0; index < schedulerRegistry.multiRootPrincipalQueuePolicy.maximumPendingRootsPerPrincipal; index += 1) {
    state = append(state, pending(`intent.family.bound-${String(index).padStart(2, '0')}`, 'person.family.a', 'NORMAL', index));
  }
  assert.throws(() => append(state, pending('intent.family.bound-overflow', 'person.family.a', 'NORMAL', 99)),
    /exceeds source-managed pending-root cardinality/);
});

test('MPQ-01/12 registered root policy preserves one model worker and grants no new effect authority', () => {
  const policy = schedulerRegistry.multiRootPrincipalQueuePolicy;
  assert.equal(policy.modelInferenceConcurrency, 1);
  assert.equal(policy.secondSchedulerAllowed, false);
  assert.equal(schedulerRegistry.physicalWorkerPolicy.modelInferenceConcurrency, 1);
  assert.equal(policy.freshCanonicalAdmissionRequiredBeforeLease, true);
  assert.equal(policy.rawPromptTitleContentStored, false);
  assert.equal(Object.hasOwn(policy, 'effectAuthority'), false);
});

// [VXG RealForever]
