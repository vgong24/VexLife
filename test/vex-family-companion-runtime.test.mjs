import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadBlueprint } from '../src/core/blueprint.mjs';
import { createIntentTrustSnapshot } from '../src/core/intent-workgraph.mjs';
import {
  SingleWorkerIntentScheduler,
  WorkerLeaseAuthority,
  selectNextPendingRoot
} from '../src/core/intent-scheduler.mjs';
import { createResourceSnapshot } from '../src/core/resource-admission.mjs';
import { createSchedulerRuntimeTrustSnapshot } from '../src/core/scheduler-runtime-trust.mjs';
import {
  addFamilyMember,
  createFamilySpace,
  readFamilySpace,
  transitionFamilyMember
} from '../src/core/family-space-store.mjs';
import {
  createFamilyChannel,
  createFamilyMessage
} from '../src/core/family-conversation.mjs';
import {
  appendConversationMessage,
  materializeConversationChannel,
  readConversationMessage
} from '../src/core/conversation-store.mjs';
import {
  FAMILY_COMPANION_FRONTIER_STATES,
  FamilyCompanionRuntime,
  FamilyCompanionRuntimeError
} from '../src/core/family-companion-runtime.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = loadBlueprint(root);
const intentRegistry = bundle.intentRegistry;
const schedulerRegistry = bundle.schedulerRegistry;
const registeredProcessRefs = bundle.factory.processes.map((item) => item.processRef);
const registeredRoleRefs = bundle.blueprint.roles.map((item) => item.roleRef);
const roleRef = 'role.vex.developer';
const workerRef = 'worker.model.test.primary';
const runtimeSourceRef = 'source.intent-scheduler.test-runtime';
const runtimeSourceHash = semanticHash({ fixture: 'vf03c-scheduler-runtime/v1' });
let schedulerSequence = 0;

function monotonicClock() {
  let tick = Date.now();
  return () => new Date(tick += 20).toISOString();
}

function around(observedAt) {
  const observed = Date.parse(observedAt);
  return {
    formedAt: new Date(observed - 1_000).toISOString(),
    observedAt: new Date(observed).toISOString(),
    expiresAt: new Date(observed + 10 * 60_000).toISOString()
  };
}

function familyFixture(humans = ['victor', 'alex', 'bri']) {
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'vf03c-'));
  const home = fs.realpathSync.native(raw);
  const clock = monotonicClock();
  const instanceRef = `instance.test.vf03c.${Math.random().toString(16).slice(2)}`;
  const suffix = semanticHash({ home }).slice(0, 12);
  const spaceRef = `space.vex-family.vf03c.${suffix}`;
  const channelRef = `channel.vex-family.vf03c.${suffix}`;
  const threadRef = `thread.vex-family.vf03c.${suffix}`;
  const companionRef = `lineage.vex.family.vf03c.${suffix}`;
  const owner = humans[0];

  createFamilySpace({
    home,
    spaceRef,
    ownerPrincipalRef: `principal.${owner}`,
    ownerPrincipalBindingRef: `principal-binding.${owner}`,
    familyCompanionLineageRef: companionRef,
    observedAt: clock(),
    instanceRef
  });
  for (const name of humans.slice(1)) {
    const current = readFamilySpace({ home, spaceRef }).record;
    addFamilyMember({
      home,
      spaceRef,
      actorPrincipalRef: `principal.${owner}`,
      principalRef: `principal.${name}`,
      principalBindingRef: `principal-binding.${name}`,
      expectedRevision: current.revision,
      expectedMembershipGeneration: current.membershipGeneration,
      observedAt: clock(),
      instanceRef
    });
  }

  const family = readFamilySpace({ home, spaceRef }).record;
  const channel = createFamilyChannel({
    channelRef,
    threadRef,
    kind: 'GROUP',
    familySpaceRecord: family,
    labelStringRef: 'string.vex-family.vf03c.test',
    createdAt: clock()
  });
  materializeConversationChannel({ home, channel, instanceRef, observedAt: channel.createdAt });

  let sequence = 0;
  const appendHuman = (name, messageRef, content, createdAt = clock()) => {
    const record = readFamilySpace({ home, spaceRef }).record;
    const message = createFamilyMessage({
      messageRef,
      channel,
      familySpaceRecord: record,
      speakerRef: `principal.${name}`,
      speakerPrincipalBindingRef: `principal-binding.${name}`,
      recipientRefs: humans.filter((candidate) => candidate !== name).map((candidate) => `principal.${candidate}`),
      content,
      sequence: sequence++,
      createdAt
    });
    return appendConversationMessage({ home, message, instanceRef, observedAt: createdAt }).event;
  };

  const requestFor = (name, trigger, key = trigger.messageRef) => ({
    requestRef: `request.vex-family.vf03c.${name}.${semanticHash(key).slice(0, 12)}`,
    spaceRef,
    channelRef,
    triggerMessageRef: trigger.messageRef,
    expectedMembershipGeneration: readFamilySpace({ home, spaceRef }).record.membershipGeneration,
    idempotencyKey: `idempotency-${semanticHash(key).slice(0, 16)}`
  });

  return {
    home,
    humans,
    owner,
    spaceRef,
    channelRef,
    threadRef,
    companionRef,
    channel,
    instanceRef,
    clock,
    appendHuman,
    requestFor,
    cleanup: () => fs.rmSync(raw, { recursive: true, force: true })
  };
}

async function captureServer({ delayMs = 0, status = 200, content = 'family runtime reply' } = {}) {
  const bodies = [];
  let active = 0;
  let maxActive = 0;
  const server = http.createServer(async (request, response) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    try {
      let body = '';
      for await (const chunk of request) body += chunk;
      bodies.push(JSON.parse(body));
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      response.statusCode = status;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(status >= 200 && status < 300
        ? { model: 'vf03c-test-model', choices: [{ message: { content } }] }
        : { error: 'synthetic failure' }));
    } finally {
      active -= 1;
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    endpointProfile: {
      profileRef: 'profile.vf03c.loopback',
      admitted: true,
      endpoint: `http://127.0.0.1:${server.address().port}/v1/`,
      model: 'vf03c-test-model'
    },
    calls: () => bodies.length,
    bodies: () => structuredClone(bodies),
    maxActive: () => maxActive,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function waitFor(predicate, { attempts = 100, delayMs = 5 } = {}) {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('timed out waiting for synthetic test observation');
}

function makeScheduler({ aggregate = null, authority = null, schedulerInstanceRef = null } = {}) {
  return new SingleWorkerIntentScheduler({
    workerRef,
    schedulerInstanceRef: schedulerInstanceRef ?? `instance.test.vf03c.scheduler.${schedulerSequence += 1}`,
    schedulerRegistry,
    runtimeAuthority: authority ?? new WorkerLeaseAuthority({ sourceRef: runtimeSourceRef }),
    schedulerAggregate: aggregate
  });
}

function resourceSnapshot(generation, observedAt) {
  const { formedAt, expiresAt } = around(observedAt);
  return createResourceSnapshot({
    snapshotRef: `resource-snapshot.vf03c.${generation}.${semanticHash(observedAt).slice(0, 8)}`,
    generation,
    sourceRef: runtimeSourceRef,
    sourceHash: runtimeSourceHash,
    formationRef: `formation.vf03c.resource.${generation}`,
    evidenceClass: 'SIMULATED_CURRENT',
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
    formedAt,
    observedAt,
    expiresAt
  });
}

function runtimeTrust(resource, generation, observedAt) {
  const { formedAt, expiresAt } = around(observedAt);
  return createSchedulerRuntimeTrustSnapshot({
    snapshotRef: `runtime-snapshot.vf03c.${generation}.${semanticHash(observedAt).slice(0, 8)}`,
    sourceRef: resource.sourceRef,
    sourceHash: resource.sourceHash,
    formationRef: `formation.vf03c.runtime.${generation}`,
    evidenceClass: 'SIMULATED_CURRENT',
    schedulerGeneration: generation,
    formedAt,
    observedAt,
    expiresAt,
    workerRef,
    actorRef: 'vex.test.vf03c',
    roleRef,
    claimRef: 'claim.vf03c.synthetic-runtime',
    occupancyRef: `occupancy.vf03c.synthetic.${generation}`,
    leaseAuthorityRef: 'authority.intent-scheduler.test-runtime',
    resourceSnapshotRef: resource.snapshotRef,
    resourceSnapshotFingerprint: resource.semanticFingerprint,
    currentness: 'CURRENT'
  }, { schedulerRegistry, resourceSnapshot: resource });
}

function runtimeBindings(graph, trust, runtime, generation, observedAt) {
  const { formedAt, expiresAt } = around(observedAt);
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
  for (const node of graph.nodes) {
    occupancyByNodeRef[node.workNodeRef] = {
      occupancyRef: runtime.occupancyRef,
      actorRef: runtime.actorRef,
      roleRef: node.roleRef,
      workNodeRef: node.workNodeRef,
      graphFingerprint: graph.semanticFingerprint,
      claimRef: runtime.claimRef,
      formationRef: `formation.vf03c.occupancy.${generation}`,
      ...common
    };
    capabilityLeaseByNodeRef[node.workNodeRef] = {
      leaseRef: `capability-lease.${node.workNodeRef}.${generation}`,
      workNodeRef: node.workNodeRef,
      graphFingerprint: graph.semanticFingerprint,
      trustSnapshotFingerprint: trust.semanticFingerprint,
      envelopeRef: node.capabilityEnvelopeRef,
      formationRef: `formation.vf03c.capability.${generation}`,
      toolRefs: ['tool.mock.inspect'],
      ...common
    };
    effectLeaseByNodeRef[node.workNodeRef] = {
      leaseRef: `effect-lease.${node.workNodeRef}.${generation}`,
      workNodeRef: node.workNodeRef,
      graphFingerprint: graph.semanticFingerprint,
      trustSnapshotFingerprint: trust.semanticFingerprint,
      envelopeRef: node.effectEnvelopeRef,
      formationRef: `formation.vf03c.effect.${generation}`,
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
      background: false
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

function runtimeHarness(fx, service, scheduler = makeScheduler(), { failCompletionAttempts = 0 } = {}) {
  const schedulerInstanceRef = scheduler.aggregate?.schedulerInstanceRef ?? null;
  let lastAdmission = null;
  let completionAttempts = 0;
  const admissionOptionsFor = ({ graph, observedAt, resumeTrustSnapshot = null }) => {
    const generation = scheduler.generation + 1;
    const trust = resumeTrustSnapshot
      ? createIntentTrustSnapshot(resumeTrustSnapshot, intentRegistry)
      : createIntentTrustSnapshot({
        schemaVersion: 'vexlife.intent-trust-snapshot/v0',
        snapshotRef: `trust-snapshot.vf03c.${generation}.${graph.intent.intentRef.split('.').at(-1)}`,
        sourceRef: 'test/vex-family-companion-runtime.test.mjs#trust',
        formationRef: 'formation.vf03c.scheduler.trust.test',
        formedAt: around(observedAt).formedAt,
        currentness: 'CURRENT',
        bindingRefs: graph.bindingRefs,
        actorRefs: [graph.intent.originSpeakerRef, 'module.vexlife.core.family-companion-runtime', 'vex.test.vf03c'],
        decisionRefs: [],
        authorizationBindings: []
      }, intentRegistry);
    const resource = resourceSnapshot(generation, observedAt);
    const runtime = runtimeTrust(resource, generation, observedAt);
    const options = {
      intentRegistry,
      schedulerRegistry,
      registeredProcessRefs,
      registeredRoleRefs,
      trustSnapshot: trust,
      runtimeTrustSnapshot: runtime,
      resourceSnapshot: resource,
      ...runtimeBindings(graph, trust, runtime, generation, observedAt),
      workerRef,
      schedulerGeneration: generation,
      formedAt: around(observedAt).formedAt,
      observedAt,
      expiresAt: around(observedAt).expiresAt
    };
    lastAdmission = { graph, trust, runtime, options };
    return options;
  };

  const contextInputFor = ({ graph, observedAt, admissionOptions }) => ({
    leaseRef: `context-lease.vf03c.${admissionOptions.schedulerGeneration}.${graph.intent.intentRef.split('.').at(-1)}`,
    cancellationTokenRef: `cancellation-token.vf03c.${admissionOptions.schedulerGeneration}.${graph.intent.intentRef.split('.').at(-1)}`,
    foundationKernelRef: 'foundation-kernel.vf03c.test',
    roleFrameRef: 'role-frame.vf03c.test',
    intentFrameRef: graph.intent.intentRef,
    selectedAtlasRefs: ['module.vexlife.core.family-companion-runtime'],
    selectedSourceRefs: [],
    applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs: [],
    applicableReleaseRefs: [],
    inputTokenEstimate: 0,
    reservedOutputTokens: 256,
    hardTokenLimit: 8192,
    formedAt: around(observedAt).formedAt,
    observedAt,
    expiresAt: around(observedAt).expiresAt,
    checkpointReturnRef: `return-route.vf03c.context.${admissionOptions.schedulerGeneration}`
  });

  const completionEvidenceFor = ({ graph, node, leased, deliveryReceipt, completedAt }) => ({
    completionReceiptRef: `receipt.vf03c.completion.${deliveryReceipt.semanticFingerprint.slice(0, 24)}`,
    releaseReceiptRef: `receipt.vf03c.release.${deliveryReceipt.semanticFingerprint.slice(0, 24)}`,
    completionEvidence: {
      verificationReceiptRef: `verification.vf03c.${deliveryReceipt.semanticFingerprint.slice(0, 24)}`,
      workNodeRef: node.workNodeRef,
      nodeFingerprint: node.semanticFingerprint,
      graphRef: graph.graphRef,
      graphFingerprint: graph.semanticFingerprint,
      runtimeSnapshotFingerprint: lastAdmission.runtime.semanticFingerprint,
      schedulerInstanceRef: lastAdmission.options.runtimeTrustSnapshot
        ? lastAdmission.options.runtimeTrustSnapshot.snapshotRef.replace('runtime-snapshot', 'scheduler-instance-observation')
        : schedulerInstanceRef,
      schedulerGeneration: leased.workerLease.schedulerGeneration,
      expectedTransitionRef: node.expectedTransitionRef,
      returnRouteRef: node.returnRouteRef,
      observedBeforeState: node.state,
      observedAfterState: 'COMPLETED',
      formedAt: leased.contextLease.formedAt,
      observedAt: completedAt,
      expiresAt: leased.contextLease.expiresAt,
      gateObservations: node.completionGateRefs.map((completionGateRef, index) => ({
        gateResultRef: `gate-result.vf03c.${deliveryReceipt.semanticFingerprint.slice(0, 18)}.${index}`,
        completionGateRef,
        sourceObservationRef: deliveryReceipt.receiptRef,
        sourceObservationHash: deliveryReceipt.semanticFingerprint,
        observedBeforeState: node.state,
        observedAfterState: 'COMPLETED',
        result: 'PASSED'
      }))
    }
  });

  // The scheduler instance ref is private by design. The deterministic test verifier
  // needs the exact value, so the harness supplies it through a closure created below.
  const instanceRef = `instance.test.vf03c.scheduler.harness.${schedulerSequence += 1}`;
  if (scheduler.generation === 0 && !scheduler.active && (scheduler.pendingRoots?.length ?? 0) === 0) {
    // no-op: caller-provided scheduler identity is already established
  }

  const runtime = new FamilyCompanionRuntime({
    home: fx.home,
    instanceRef: fx.instanceRef,
    scheduler,
    intentRegistry,
    schedulerRegistry,
    registeredProcessRefs,
    registeredRoleRefs,
    roleRef,
    admissionOptionsFor,
    contextInputFor,
    completionEvidenceFor: (args) => {
      completionAttempts += 1;
      if (completionAttempts <= failCompletionAttempts) {
        throw new Error('synthetic post-append completion evidence failure');
      }
      const result = completionEvidenceFor(args);
      // Test scheduler identity is recoverable from the active occupancy binding.
      // The verifier compares against the actual constructor identity, supplied by
      // the test-specific scheduler factory below through _testSchedulerInstanceRef.
      result.completionEvidence.schedulerInstanceRef = scheduler._testSchedulerInstanceRef;
      return result;
    },
    endpointProfile: service.endpointProfile,
    clock: fx.clock
  });
  return { runtime, scheduler, completionAttempts: () => completionAttempts };
}

function testScheduler({ aggregate = null, authority = null } = {}) {
  const schedulerInstanceRef = `instance.test.vf03c.scheduler.${schedulerSequence += 1}`;
  const scheduler = new SingleWorkerIntentScheduler({
    workerRef,
    schedulerInstanceRef,
    schedulerRegistry,
    runtimeAuthority: authority ?? new WorkerLeaseAuthority({ sourceRef: runtimeSourceRef }),
    schedulerAggregate: aggregate
  });
  Object.defineProperty(scheduler, '_testSchedulerInstanceRef', {
    value: schedulerInstanceRef,
    enumerable: false,
    configurable: false,
    writable: false
  });
  return scheduler;
}

function currentSelectedIntent(scheduler) {
  return selectNextPendingRoot(
    scheduler.aggregate.pendingRootIntents,
    scheduler.aggregate.principalFairnessLedger,
    { schedulerRegistry }
  )?.intentRef ?? null;
}

function responseState(fx, request, responseMessageRef) {
  return readConversationMessage({
    home: fx.home,
    channelRef: request.channelRef,
    messageRef: responseMessageRef
  });
}

test('FCR-00/01/02/03 queued A/B/C stay model-free, preserve principals, and one worker stays physical while human chat advances', async () => {
  const fx = familyFixture();
  const service = await captureServer({ delayMs: 120 });
  try {
    const scheduler = testScheduler();
    const { runtime } = runtimeHarness(fx, service, scheduler);
    const triggers = [
      fx.appendHuman('victor', 'message.vf03c.abc.000', 'Victor asks the Family Vex.'),
      fx.appendHuman('alex', 'message.vf03c.abc.001', 'Alex asks independently.'),
      fx.appendHuman('bri', 'message.vf03c.abc.002', 'Bri asks independently.')
    ];
    const requests = [
      fx.requestFor('victor', triggers[0], 'abc-victor'),
      fx.requestFor('alex', triggers[1], 'abc-alex'),
      fx.requestFor('bri', triggers[2], 'abc-bri')
    ];
    const queued = requests.map((request) => runtime.queue(request));
    assert.equal(service.calls(), 0);
    assert.equal(queued.every((item) => item.state === 'QUEUED' && item.modelCallPerformed === false), true);
    assert.deepEqual(
      new Set(scheduler.pendingRoots.map((root) => root.originPrincipalRef)),
      new Set(['principal.victor', 'principal.alex', 'principal.bri'])
    );

    const selectedIntentRef = currentSelectedIntent(scheduler);
    const selectedIndex = queued.findIndex((item) => item.intentRef === selectedIntentRef);
    assert.notEqual(selectedIndex, -1);
    const selectedRequest = requests[selectedIndex];
    const otherRequest = requests[(selectedIndex + 1) % requests.length];
    const activeRun = runtime.runSelected(selectedRequest);
    await waitFor(() => service.calls() === 1);

    const during = fx.appendHuman('alex', 'message.vf03c.abc.003', 'Human chat continues while Family Vex inference is active.');
    assert.equal(during.messageRef, 'message.vf03c.abc.003');
    const blocked = await runtime.runSelected(otherRequest);
    assert.equal(blocked.state, 'BLOCKED');
    assert.equal(blocked.reason, 'PHYSICAL_WORKER_ALREADY_LEASED');
    assert.equal(blocked.modelCallPerformed, false);

    const completed = await activeRun;
    assert.equal(completed.state, 'COMPLETED');
    assert.equal(completed.frontierState, FAMILY_COMPANION_FRONTIER_STATES.AS_OF_FRONTIER);
    assert.equal(service.calls(), 1);
    assert.equal(service.maxActive(), 1);
    assert.equal(scheduler.projections.health.value.activeWorkerCount, 0);
  } finally {
    await service.close();
    fx.cleanup();
  }
});

test('FCR-04/05/06/10/11 selected work uses fresh Family context, appends one Family-lineage response, and exact retry is model-free', async () => {
  const fx = familyFixture();
  const service = await captureServer({ content: 'One source-bound Family response.' });
  try {
    const scheduler = testScheduler();
    const { runtime } = runtimeHarness(fx, service, scheduler);
    const trigger = fx.appendHuman('alex', 'message.vf03c.fresh.000', 'Original Alex trigger.');
    const request = fx.requestFor('alex', trigger, 'fresh-alex');
    const queued = runtime.queue(request);
    assert.equal(queued.state, 'QUEUED');
    const newer = fx.appendHuman('bri', 'message.vf03c.fresh.001', 'Newer authorized Family context after queueing.');

    const completed = await runtime.runSelected(request);
    assert.equal(completed.state, 'COMPLETED');
    assert.equal(completed.frontierState, FAMILY_COMPANION_FRONTIER_STATES.CURRENT_AT_DELIVERY);
    assert.equal(completed.requestPrincipalRef, 'principal.alex');
    assert.equal(completed.deliveryReceipt.respondingToMessageRef, trigger.messageRef);
    assert.equal(completed.deliveryReceipt.familyCompanionLineageRef, fx.companionRef);
    assert.equal(completed.response.speakerRef, fx.companionRef);
    assert.equal(completed.deliveryReceipt.modelRuntimeEvidenceOwnerRef, 'src/core/lived-companion.mjs');
    assert.equal(completed.deliveryReceipt.modelRuntimeEvidenceExposure, 'OWNER_RETAINED_NOT_REEMITTED_BY_FAMILY_RUNTIME');
    assert.equal(completed.deliveryReceipt.modelTurnWitnessRef, null);
    assert.equal(completed.deliveryReceipt.memoryEffectPerformed, false);
    assert.equal(completed.deliveryReceipt.relationshipEffectPerformed, false);
    assert.equal(completed.deliveryReceipt.trainingEffectPerformed, false);
    assert.equal(completed.promptMaterializationReceipt.privateNonselectedIncluded, false);
    assert.equal(completed.promptMaterializationReceipt.providerBoundaryCurrentnessVerified, true);
    assert.equal(completed.promptMaterializationReceipt.providerBoundarySourceBindingsVerified, true);
    assert.equal(completed.promptMaterializationReceipt.triggerMessageRef, trigger.messageRef);
    assert.equal(
      completed.promptMaterializationReceipt.selectedSourceBindings.some((binding) => binding.messageRef === newer.messageRef),
      true
    );
    assert.equal(service.calls(), 1);

    const replay = runtime.queue(request);
    assert.equal(replay.state, 'IDEMPOTENT_RESPONSE_CURRENT');
    assert.equal(replay.modelCallPerformed, false);
    const replayRun = await runtime.runSelected(request);
    assert.equal(replayRun.state, 'IDEMPOTENT_RESPONSE_CURRENT');
    assert.equal(service.calls(), 1);
  } finally {
    await service.close();
    fx.cleanup();
  }
});

test('FCR-07 membership revocation during inference blocks delivery and releases the canonical worker without fake response', async () => {
  const fx = familyFixture();
  const service = await captureServer({ delayMs: 120 });
  try {
    const scheduler = testScheduler();
    const { runtime } = runtimeHarness(fx, service, scheduler);
    const trigger = fx.appendHuman('alex', 'message.vf03c.revoke.000', 'Alex asks before revocation.');
    const request = fx.requestFor('alex', trigger, 'revoke-alex');
    const queued = runtime.queue(request);
    const responseMessageRef = `message.vex-family.runtime.${queued.intentRef.split('.').at(-1)}`;
    const run = runtime.runSelected(request);
    await waitFor(() => service.calls() === 1);

    const current = readFamilySpace({ home: fx.home, spaceRef: fx.spaceRef }).record;
    transitionFamilyMember({
      home: fx.home,
      spaceRef: fx.spaceRef,
      actorPrincipalRef: `principal.${fx.owner}`,
      principalRef: 'principal.alex',
      action: 'REVOKE',
      expectedRevision: current.revision,
      expectedMembershipGeneration: current.membershipGeneration,
      observedAt: fx.clock(),
      instanceRef: fx.instanceRef
    });

    await assert.rejects(run, (error) => {
      assert.equal(error instanceof FamilyCompanionRuntimeError, true);
      assert.equal(error.details.responseAppended, false);
      assert.equal(error.details.schedulerCancellation.changed, true);
      return true;
    });
    assert.equal(scheduler.active, null);
    assert.equal(responseState(fx, request, responseMessageRef).state, 'NOT_FOUND');
  } finally {
    await service.close();
    fx.cleanup();
  }
});

test('FCR-08 restart restores the canonical queued root and deterministic request identity without a Family-owned queue store', async () => {
  const fx = familyFixture();
  const service = await captureServer();
  try {
    const schedulerA = testScheduler();
    const first = runtimeHarness(fx, service, schedulerA).runtime;
    const trigger = fx.appendHuman('bri', 'message.vf03c.restart.000', 'Bri request survives process reconstruction.');
    const request = fx.requestFor('bri', trigger, 'restart-bri');
    const queued = first.queue(request);
    const aggregate = structuredClone(schedulerA.aggregate);

    const schedulerB = testScheduler({ aggregate });
    const second = runtimeHarness(fx, service, schedulerB).runtime;
    const replay = second.queue(request);
    assert.equal(replay.state, 'IDEMPOTENT_QUEUED');
    assert.equal(replay.intentRef, queued.intentRef);
    assert.equal(service.calls(), 0);
    const completed = await second.runSelected(request);
    assert.equal(completed.state, 'COMPLETED');
    assert.equal(service.calls(), 1);
  } finally {
    await service.close();
    fx.cleanup();
  }
});

test('FCR-09 requester cancellation and inference failure create no fake Family response and do not strand the worker', async () => {
  const fx = familyFixture();
  const service = await captureServer({ status: 500 });
  try {
    const scheduler = testScheduler();
    const { runtime } = runtimeHarness(fx, service, scheduler);

    const cancelledTrigger = fx.appendHuman('victor', 'message.vf03c.cancel.000', 'Cancel this queued request.');
    const cancelledRequest = fx.requestFor('victor', cancelledTrigger, 'cancel-victor');
    const cancelledQueued = runtime.queue(cancelledRequest);
    const cancelledResponseRef = `message.vex-family.runtime.${cancelledQueued.intentRef.split('.').at(-1)}`;
    const cancelled = runtime.cancel(cancelledRequest);
    assert.equal(cancelled.state, 'CANCELLED');
    assert.equal(service.calls(), 0);
    assert.equal(responseState(fx, cancelledRequest, cancelledResponseRef).state, 'NOT_FOUND');

    const failedTrigger = fx.appendHuman('alex', 'message.vf03c.failure.000', 'This provider call will fail.');
    const failedRequest = fx.requestFor('alex', failedTrigger, 'failure-alex');
    const failedQueued = runtime.queue(failedRequest);
    const failedResponseRef = `message.vex-family.runtime.${failedQueued.intentRef.split('.').at(-1)}`;
    await assert.rejects(runtime.runSelected(failedRequest), (error) => {
      assert.equal(error instanceof FamilyCompanionRuntimeError, true);
      assert.equal(error.details.responseAppended, false);
      assert.equal(error.details.schedulerCancellation.changed, true);
      return true;
    });
    assert.equal(service.calls(), 1);
    assert.equal(scheduler.active, null);
    assert.equal(responseState(fx, failedRequest, failedResponseRef).state, 'NOT_FOUND');
  } finally {
    await service.close();
    fx.cleanup();
  }
});

test('FCR-13 post-append completion failure checkpoints exact provenance and reconstructs to truthful completion without model replay', async () => {
  const fx = familyFixture();
  const service = await captureServer({ content: 'One recoverable Family response.' });
  try {
    const schedulerA = testScheduler();
    const first = runtimeHarness(fx, service, schedulerA, { failCompletionAttempts: 1 });
    const trigger = fx.appendHuman('alex', 'message.vf03c.recovery.000', 'Recover this exact Family response after completion failure.');
    const request = fx.requestFor('alex', trigger, 'recovery-alex');
    const queued = first.runtime.queue(request);
    const responseMessageRef = `message.vex-family.runtime.${queued.intentRef.split('.').at(-1)}`;
    let checkpointRef = null;

    await assert.rejects(first.runtime.runSelected(request), (error) => {
      assert.equal(error instanceof FamilyCompanionRuntimeError, true);
      assert.equal(error.details.responseAppended, true);
      assert.equal(error.details.responseDurable, true);
      assert.equal(error.details.schedulerCancellation, null);
      assert.ok(error.details.schedulerCheckpoint?.checkpointRef);
      checkpointRef = error.details.schedulerCheckpoint.checkpointRef;
      return true;
    });

    assert.equal(service.calls(), 1);
    assert.equal(first.completionAttempts(), 1);
    assert.equal(schedulerA.active, null);
    assert.equal(schedulerA.aggregate.phase, 'PAUSED');
    const pausedPointer = schedulerA.aggregate.checkpointPointers
      .find((item) => item.checkpointRef === checkpointRef);
    assert.equal(pausedPointer?.currentState, 'PAUSED_AT_CHECKPOINT');

    const paused = schedulerA.aggregate.canonicalCheckpoints
      .find((item) => item.checkpointRef === checkpointRef);
    assert.ok(paused?.familyCompanionRecovery);
    const durableBefore = responseState(fx, request, responseMessageRef);
    assert.equal(durableBefore.state, 'CURRENT');
    assert.equal(
      paused.familyCompanionRecovery.deliveryReceipt.responseEventSha256,
      durableBefore.event.eventSha256
    );
    assert.equal(
      paused.familyCompanionRecovery.deliveryReceipt.promptMaterializationReceiptFingerprint,
      paused.familyCompanionRecovery.promptMaterializationReceipt.semanticFingerprint
    );

    const queuedRecovery = first.runtime.queue(request);
    assert.equal(queuedRecovery.state, 'RECOVERY_REQUIRED');
    assert.equal(queuedRecovery.recoveryCheckpointRef, checkpointRef);
    assert.equal(queuedRecovery.modelCallPerformed, false);
    assert.equal(service.calls(), 1);

    const aggregate = structuredClone(schedulerA.aggregate);
    const schedulerB = testScheduler({ aggregate });
    const second = runtimeHarness(fx, service, schedulerB);
    const reconstructedQueue = second.runtime.queue(request);
    assert.equal(reconstructedQueue.state, 'RECOVERY_REQUIRED');
    assert.equal(reconstructedQueue.recoveryCheckpointRef, checkpointRef);
    assert.equal(reconstructedQueue.modelCallPerformed, false);

    const recovered = await second.runtime.runSelected(request);
    assert.equal(recovered.state, 'COMPLETED');
    assert.equal(recovered.modelCallPerformed, false);
    assert.equal(recovered.appendState, 'IDEMPOTENT_CURRENT');
    assert.equal(recovered.recoveryCheckpointRef, checkpointRef);
    assert.equal(second.completionAttempts(), 1);
    assert.equal(service.calls(), 1);
    assert.equal(schedulerB.active, null);
    assert.equal(schedulerB.projections.health.value.activeWorkerCount, 0);
    assert.equal(recovered.schedulerCompletion.canonicalWorkgraphTransition.nextState, 'COMPLETED');

    const durableAfter = responseState(fx, request, responseMessageRef);
    assert.equal(durableAfter.state, 'CURRENT');
    assert.equal(durableAfter.event.eventSha256, durableBefore.event.eventSha256);
    assert.equal(durableAfter.event.sequence, durableBefore.event.sequence);
    assert.equal(recovered.response.eventSha256, durableBefore.event.eventSha256);
    assert.equal(
      recovered.deliveryReceipt.semanticFingerprint,
      paused.familyCompanionRecovery.deliveryReceipt.semanticFingerprint
    );

    const settledReplay = second.runtime.queue(request);
    assert.equal(settledReplay.state, 'IDEMPOTENT_RESPONSE_CURRENT');
    assert.equal(settledReplay.modelCallPerformed, false);
    assert.equal(service.calls(), 1);
  } finally {
    await service.close();
    fx.cleanup();
  }
});

test('FCR-12 module registration composes existing owners and does not claim the held server listener', () => {
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'blueprint/module-registry/model-connection.json'), 'utf8'));
  const module = registry.find((item) => item.moduleRef === 'module.vexlife.core.family-companion-runtime');
  assert.ok(module);
  assert.equal(module.path, 'src/core/family-companion-runtime.mjs');
  assert.equal(module.loadedBy.includes('module.vexlife.script.serve-browser'), false);
  assert.equal(module.reads.includes('src/core/intent-scheduler.mjs'), true);
  assert.equal(module.reads.includes('src/core/lived-companion.mjs'), true);
  assert.equal(module.writes.some((value) => value.includes('second scheduler')), false);
});

// [VXG RealForever]
