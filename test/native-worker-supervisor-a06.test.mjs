import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadBlueprint } from '../src/core/blueprint.mjs';
import {
  admitIntentSchedulerQueue,
  SingleWorkerIntentScheduler,
  WorkerLeaseAuthority
} from '../src/core/intent-scheduler.mjs';
import {
  createIntentEnvelope,
  createIntentTrustSnapshot,
  createIntentWorkgraph,
  createWorkNode
} from '../src/core/intent-workgraph.mjs';
import {
  NativeWorkerIntentBridgeError,
  createNativeWorkerToolRelayResult,
  observeNativeWorkerCheckpointYield,
  requestNativeWorkerCheckpointYieldFromScheduler
} from '../src/core/native-worker-intent-bridge.mjs';
import {
  consumeNativeWorkerResult,
  loadNativeWorker,
  markNativeWorkerStandingBy,
  prepareNativeWorker,
  runPreparedNativeWorker
} from '../src/core/native-worker-supervisor.mjs';
import { createResourceSnapshot } from '../src/core/resource-admission.mjs';
import { createSchedulerRuntimeTrustSnapshot } from '../src/core/scheduler-runtime-trust.mjs';
import { createToolCall, ToolResultRelay } from '../src/core/tool-result-relay.mjs';
import { semanticHash } from '../src/core/utils.mjs';

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
const EXPIRES = '2026-07-31T13:00:00.000Z';
const RESUME_EXPIRES = '2026-07-31T13:08:00.000Z';
const SOURCE_HASH = semanticHash({ fixture: 'native-worker-supervisor-a06/v1' });
const SOURCE_BINDINGS = [{
  sourceRef: 'source.work.nws-a06',
  sourceHash: semanticHash({ sourceRef: 'source.work.nws-a06', fixtureVersion: 1 })
}];
const BACKGROUND_WORK = 'work.scheduler.nws-a06-background';
const INTERACTIVE_WORK = 'work.scheduler.nws-a06-interactive';
const WORKER_REF = 'worker.model.test.primary';
let schedulerInstanceSequence = 0;

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function envelope(ref = 'intent.scheduler.nws-a06') {
  return createIntentEnvelope({
    intentRef: ref,
    originMessageRef: `message.${ref}`,
    originSpeakerRef: 'person.test.human',
    recipientRoleRef: 'role.vex.developer',
    projectRef: 'project.scheduler.nws-a06',
    threadRef: 'thread.scheduler.nws-a06',
    channelRef: 'channel.scheduler.nws-a06',
    originalContentHash: 'a'.repeat(64),
    desiredOutcome: { intentKey: 'VALIDATE_WORKGRAPH', summary: 'Exercise native worker preemption composition' },
    constraints: [],
    createdAt: FORMED,
    sourceLineageRef: 'lineage.scheduler.nws-a06'
  }, intentRegistry);
}

function workNode(ref, overrides = {}) {
  return createWorkNode({
    workNodeRef: ref,
    rootIntentRef: 'intent.scheduler.nws-a06',
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
    sourceRefs: ['source.work.nws-a06'],
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
    let priorState = 'CAPTURED';
    return ['DECOMPOSED', 'PLAN_VALIDATED', 'READY'].map((nextState, sequence) => {
      const transition = {
        transitionRef: `transition.nws-a06.${node.workNodeRef}.${sequence}`,
        workNodeRef: node.workNodeRef,
        sequence,
        priorState,
        nextState,
        reason: 'native worker A06 integration formation',
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
    graphRef: `intent-workgraph.nws-a06.${semanticHash(nodes.map((item) => item.workNodeRef)).slice(0, 12)}`,
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
    snapshotRef: `trust-snapshot.nws-a06.${candidate.graphRef.split('.').at(-1)}`,
    sourceRef: 'test/native-worker-supervisor-a06.test.mjs#trust',
    formationRef: 'formation.nws-a06.trust',
    formedAt: FORMED,
    currentness: 'CURRENT',
    bindingRefs: bindingRefs(candidate.nodes),
    actorRefs: ['person.test.human', 'vex.test'],
    decisionRefs: [],
    authorizationBindings: []
  }, intentRegistry);
}

function resource(generation = 1) {
  const resume = generation > 1;
  return createResourceSnapshot({
    snapshotRef: `resource-snapshot.nws-a06.${generation}`,
    generation,
    sourceRef: 'source.intent-scheduler.test-runtime',
    sourceHash: SOURCE_HASH,
    formationRef: `formation.nws-a06.resource.${generation}`,
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
    expiresAt: resume ? RESUME_EXPIRES : EXPIRES
  });
}

function runtimeTrust(resourceSnapshot, generation = resourceSnapshot.generation) {
  const resume = generation > 1;
  return createSchedulerRuntimeTrustSnapshot({
    snapshotRef: `runtime-snapshot.nws-a06.${generation}`,
    sourceRef: resourceSnapshot.sourceRef,
    sourceHash: resourceSnapshot.sourceHash,
    formationRef: `formation.nws-a06.runtime.${generation}`,
    evidenceClass: 'SIMULATED_CURRENT',
    schedulerGeneration: generation,
    formedAt: resume ? RESUME_FORMED : FORMED,
    observedAt: resume ? RESUME_OBSERVED : OBSERVED,
    expiresAt: resume ? RESUME_EXPIRES : EXPIRES,
    workerRef: WORKER_REF,
    actorRef: 'vex.test',
    roleRef: 'role.vex.developer',
    claimRef: 'claim.scheduler.nws-a06',
    occupancyRef: `occupancy.scheduler.nws-a06.${generation}`,
    leaseAuthorityRef: 'authority.intent-scheduler.test-runtime',
    resourceSnapshotRef: resourceSnapshot.snapshotRef,
    resourceSnapshotFingerprint: resourceSnapshot.semanticFingerprint,
    currentness: 'CURRENT'
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

function admission(nodes, generation = 1) {
  const candidate = graph(nodes);
  const trust = trustSnapshot(candidate);
  const resourceSnapshot = resource(generation);
  const runtime = runtimeTrust(resourceSnapshot, generation);
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

function contextInput(generation = 1) {
  const resume = generation > 1;
  return {
    leaseRef: `context-lease.nws-a06.${generation}`,
    cancellationTokenRef: `cancellation-token.nws-a06.${generation}`,
    foundationKernelRef: 'foundation-kernel.compact',
    roleFrameRef: 'role-frame.developer',
    intentFrameRef: 'intent-frame.nws-a06',
    selectedAtlasRefs: ['module.vexlife.core.intent-scheduler'],
    selectedSourceRefs: ['source.work.nws-a06'],
    applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs: [],
    applicableReleaseRefs: [],
    inputTokenEstimate: 300,
    reservedOutputTokens: 200,
    hardTokenLimit: 1000,
    formedAt: resume ? RESUME_FORMED : FORMED,
    observedAt: resume ? RESUME_OBSERVED : OBSERVED,
    expiresAt: resume ? RESUME_EXPIRES : EXPIRES,
    checkpointReturnRef: 'return-route.nws-a06.checkpoint'
  };
}

function makeScheduler() {
  const relay = new ToolResultRelay(null, { schedulerRegistry });
  const authority = new WorkerLeaseAuthority({ sourceRef: 'source.intent-scheduler.test-runtime' });
  const schedulerInstanceRef = `instance.intent-scheduler.nws-a06.${schedulerInstanceSequence += 1}`;
  return {
    relay,
    authority,
    scheduler: new SingleWorkerIntentScheduler({
      workerRef: WORKER_REF,
      schedulerInstanceRef,
      schedulerRegistry,
      runtimeAuthority: authority,
      toolRelay: relay
    })
  };
}

function checkpointInput(fixture) {
  return {
    checkpointRef: 'checkpoint.scheduler.nws-a06.background-yield',
    workNodeRef: fixture.queue.selected.workNodeRef,
    lastCompletedStep: 'checkpoint-bound-native-worker-yield-observed',
    selectedSourceRefs: ['source.work.nws-a06'],
    selectedContextRefs: [fixture.active.contextLease.leaseRef],
    producedArtifactRefs: [],
    producedReceiptRefs: [fixture.queue.admissionReceipt.admissionReceiptRef],
    openQuestions: [],
    nextSafeAction: 'START_EXACT_ADMITTED_INTERACTIVE_WORK',
    pendingToolCallRef: 'NONE',
    sourceBindings: SOURCE_BINDINGS,
    formedAt: CHECKPOINT_AT
  };
}

function toolCallFrom(fixture) {
  return createToolCall({
    toolCallRef: 'tool-call.scheduler.nws-a06-yield',
    workNodeRef: fixture.queue.selected.workNodeRef,
    toolRef: 'tool.mock.inspect',
    effectRef: 'effect.mock.read',
    arguments: { sourceRef: 'source.work.nws-a06' },
    schedulerGeneration: fixture.queue.generation,
    cancellationTokenRef: fixture.active.contextLease.cancellationTokenRef,
    sourceEvidenceRef: 'source.blueprint.intent-scheduler-registry',
    sourceEvidenceHash: semanticHash(schedulerRegistry),
    proposedAt: OBSERVED,
    timeoutAt: EXPIRES,
    cancellationPolicy: 'CHECKPOINT_THEN_CANCEL'
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

function nativeWorkerFixture(t, overrides = {}) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-native-worker-a06-'));
  const runtimeRoot = path.join(fixtureRoot, 'runtime');
  const sourceRoot = path.join(fixtureRoot, 'source');
  fs.mkdirSync(runtimeRoot);
  fs.mkdirSync(sourceRoot);
  fs.mkdirSync(path.join(sourceRoot, 'worker'));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

  const workerCode = `
    const fs = require('node:fs');
    const controlPath = process.env.VEX_WORKER_CONTROL_PATH;
    const started = Date.now();
    let pauseSeenAt = null;
    const tick = () => {
      if (fs.existsSync(controlPath)) {
        try {
          const control = JSON.parse(fs.readFileSync(controlPath, 'utf8'));
          if (control.action === 'PAUSE') {
            pauseSeenAt ??= Date.now();
            if (Date.now() - pauseSeenAt >= 80) process.exit(75);
          }
        } catch {}
      }
      if (Date.now() - started >= 5000) process.exit(0);
      setTimeout(tick, 10);
    };
    tick();
  `;

  return prepareNativeWorker({
    runtimeRoot,
    sourceRoot,
    manifest: {
      schemaVersion: 'vexlife.native-worker-manifest/v1',
      workerRef: WORKER_REF,
      workRef: BACKGROUND_WORK,
      purposeRef: 'purpose.vexlife.nws-a06',
      humanLabel: 'Synthetic A06 cooperative background worker',
      executableRef: 'runtime.node.current',
      argv: ['-e', workerCode],
      sourceRootRelativeWorkingDirectory: 'worker',
      schedulingClass: 'BACKGROUND',
      pauseMode: 'CHECKPOINT_BOUND_COOPERATIVE',
      resultContractRef: 'contract.vexlife.test-result.v1',
      executionAuthorityRef: 'authority.vexlife.test.no-effects',
      ...overrides
    },
    binding: {
      schemaVersion: 'vexlife.native-worker-runtime-binding/v1',
      bindingRef: 'binding.runtime.node.current.nws-a06',
      executableRef: 'runtime.node.current',
      executablePath: process.execPath,
      executableSha256: sha256File(process.execPath),
      hostRef: 'host.test.local',
      observedAt: new Date().toISOString()
    }
  });
}

async function waitForWorkerState(workerRoot, wanted, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = loadNativeWorker(workerRoot).receipt.state;
    if (state === wanted) return state;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for native worker state ${wanted}`);
}

function expectBridgeCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof NativeWorkerIntentBridgeError);
    assert.equal(error.code, code);
    return true;
  });
}

test('A06 exact scheduler interactive signal yields running BACKGROUND worker and re-enters through Tool Result Relay', async (t) => {
  const background = admission([workNode(BACKGROUND_WORK, { priorityClass: 'LOW', background: true })]);
  const runtime = makeScheduler();
  const queue = runtime.scheduler.admit(background.candidate, background.options);
  const active = runtime.scheduler.leaseSelected(contextInput());
  const fixture = { ...background, ...runtime, queue, active };
  const call = toolCallFrom(fixture);
  assert.equal(runtime.relay.register(call).changed, true);

  const native = nativeWorkerFixture(t);
  const nativeManifest = loadNativeWorker(native.workerRoot).manifest;
  const running = runPreparedNativeWorker(native.workerRoot, { pollMs: 20 });
  await waitForWorkerState(native.workerRoot, 'WORKING');

  const nonInteractive = admission([workNode('work.scheduler.nws-a06-normal')], 2);
  const nonInteractiveQueue = admitIntentSchedulerQueue(nonInteractive.candidate, nonInteractive.options);
  const notPreempted = runtime.scheduler.requestPreemption(nonInteractiveQueue);
  assert.equal(notPreempted.state, 'CONTINUE_ACTIVE');
  expectBridgeCode(
    () => requestNativeWorkerCheckpointYieldFromScheduler(native.workerRoot, {
      ...notPreempted,
      activeWorkNodeRef: BACKGROUND_WORK,
      incomingWorkNodeRef: 'work.scheduler.nws-a06-normal',
      pendingPreemptionRef: 'preemption.invalid.normal',
      admissionFingerprint: nonInteractiveQueue.admissionReceipt?.semanticFingerprint ?? 'admission.invalid.normal',
      sourceDiscarded: false
    }),
    'NWS_SCHEDULER_DECISION_NOT_CHECKPOINT'
  );
  assert.equal(loadNativeWorker(native.workerRoot).receipt.state, 'WORKING');

  const staleInteractive = admission([workNode('work.scheduler.nws-a06-stale-interactive', { interactiveHumanTurn: true })], 1);
  const staleQueue = admitIntentSchedulerQueue(staleInteractive.candidate, staleInteractive.options);
  const stale = runtime.scheduler.requestPreemption(staleQueue);
  assert.equal(stale.state, 'CONTINUE_ACTIVE');
  expectBridgeCode(
    () => requestNativeWorkerCheckpointYieldFromScheduler(native.workerRoot, {
      ...stale,
      activeWorkNodeRef: BACKGROUND_WORK,
      incomingWorkNodeRef: 'work.scheduler.nws-a06-stale-interactive',
      pendingPreemptionRef: 'preemption.invalid.stale',
      admissionFingerprint: staleQueue.admissionReceipt?.semanticFingerprint ?? 'admission.invalid.stale',
      sourceDiscarded: false
    }),
    'NWS_SCHEDULER_DECISION_NOT_CHECKPOINT'
  );
  assert.equal(loadNativeWorker(native.workerRoot).receipt.state, 'WORKING');

  const interactive = admission([workNode(INTERACTIVE_WORK, { interactiveHumanTurn: true })], 2);
  const incomingQueue = admitIntentSchedulerQueue(interactive.candidate, interactive.options);
  const decision = runtime.scheduler.requestPreemption(incomingQueue);
  assert.deepEqual(
    { state: decision.state, safeToStart: decision.safeToStart, sourceDiscarded: decision.sourceDiscarded },
    { state: 'CHECKPOINT_REQUIRED', safeToStart: false, sourceDiscarded: false }
  );

  expectBridgeCode(
    () => requestNativeWorkerCheckpointYieldFromScheduler(native.workerRoot, {
      ...decision,
      activeWorkNodeRef: 'work.scheduler.nws-a06-wrong-background'
    }),
    'NWS_SCHEDULER_WORK_MISMATCH'
  );
  assert.equal(loadNativeWorker(native.workerRoot).receipt.state, 'WORKING');

  expectBridgeCode(
    () => requestNativeWorkerCheckpointYieldFromScheduler(native.workerRoot, {
      ...decision,
      sourceDiscarded: true
    }),
    'NWS_SCHEDULER_DECISION_DISCARDED_SOURCE'
  );
  assert.equal(loadNativeWorker(native.workerRoot).receipt.state, 'WORKING');

  const requested = requestNativeWorkerCheckpointYieldFromScheduler(native.workerRoot, decision);
  assert.equal(requested.control.action, 'PAUSE');
  assert.equal(requested.event.eventKind, 'CHECKPOINT_YIELD_REQUESTED');
  assert.equal(requested.event.workerState, 'WORKING');
  assert.equal(requested.event.continuationRef, BACKGROUND_WORK);
  assert.equal(requested.event.pendingPreemptionRef, decision.pendingPreemptionRef);
  assert.equal(loadNativeWorker(native.workerRoot).receipt.state, 'WORKING');

  const paused = await running;
  assert.equal(paused.receipt.state, 'PAUSED');
  assert.equal(paused.receipt.terminalEvidence.exitCode, 75);
  assert.equal(paused.receipt.terminalEvidence.pauseRequested, true);
  const receiptNames = fs.readdirSync(path.join(native.workerRoot, 'receipts'));
  assert.equal(receiptNames.some((name) => name.endsWith('-pause-requested.json')), true);

  const yielded = observeNativeWorkerCheckpointYield(native.workerRoot, decision, { observedAt: RESULT_AT });
  assert.equal(yielded.eventKind, 'CHECKPOINT_BOUND_YIELD_OBSERVED');
  assert.equal(yielded.workerState, 'PAUSED');
  assert.equal(yielded.continuationRef, BACKGROUND_WORK);
  assert.equal(yielded.resultContractRef, nativeManifest.resultContractRef);
  assert.equal(yielded.sourceDiscarded, false);

  const relayResult = createNativeWorkerToolRelayResult(call, yielded, {
    observationRef: 'observation.scheduler.nws-a06-checkpoint-yield'
  });
  const accepted = runtime.relay.accept(relayResult, { receivedAt: RESULT_AT });
  assert.equal(accepted.state, 'ACCEPTED');
  assert.equal(accepted.observation.summary.eventRef, yielded.eventRef);
  assert.equal(accepted.observation.summary.continuationRef, BACKGROUND_WORK);
  assert.equal(accepted.observation.rawLogsIncluded, false);
  assert.equal(accepted.observation.externalEffectsExecuted, false);
  const reinjected = runtime.relay.reinject(active.contextLease, accepted.observation, { observedAt: RESULT_AT });
  assert.equal(reinjected.state, 'REINJECTED');
  assert.equal(reinjected.frame.rawResultIncluded, false);
  assert.ok(reinjected.frame.observationRefs.includes(accepted.observation.observationRef));

  const checkpointed = runtime.scheduler.checkpoint(checkpointInput(fixture), {
    releaseReceiptRef: 'release.scheduler.nws-a06-background-yield',
    releasedAt: CHECKPOINT_AT
  });
  assert.equal(checkpointed.checkpoint.workNodeRef, BACKGROUND_WORK);
  assert.equal(runtime.scheduler.aggregate.pendingPreemption.pendingPreemptionRef, decision.pendingPreemptionRef);
  assert.equal(runtime.scheduler.aggregate.pendingPreemption.sourceDiscarded, false);

  const standby = markNativeWorkerStandingBy(native.workerRoot);
  assert.equal(standby.receipt.state, 'STANDING_BY');
  const resumed = await runPreparedNativeWorker(native.workerRoot, { pollMs: 20 });
  assert.equal(resumed.receipt.state, 'WRAPPING_UP');

  const wrapping = loadNativeWorker(native.workerRoot);
  const resultRef = 'result.vexlife.nws-a06.aggregate-lineage';
  const done = consumeNativeWorkerResult(native.workerRoot, {
    resultRef,
    machineCompletionRecord: {
      checkpointYieldEventRef: yielded.eventRef,
      relayObservationRef: accepted.observation.observationRef,
      semanticReentryReceiptRef: reinjected.receipt.receiptRef,
      effectPerformed: false
    },
    humanSummary: 'The synthetic background worker yielded, re-entered semantically, resumed, and completed without a protected effect.'
  });

  assert.equal(nativeManifest.workRef, BACKGROUND_WORK);
  assert.equal(nativeManifest.resultContractRef, 'contract.vexlife.test-result.v1');
  assert.equal(wrapping.receipt.state, 'WRAPPING_UP');
  assert.equal(wrapping.receipt.workRef, BACKGROUND_WORK);
  assert.equal(wrapping.receipt.terminalEvidence.exitCode, 0);
  assert.equal(done.completion.workRef, BACKGROUND_WORK);
  assert.equal(done.completion.resultRef, resultRef);
  assert.equal(done.receipt.state, 'DONE');
  assert.equal(done.receipt.workRef, BACKGROUND_WORK);
  assert.equal(done.receipt.resultRef, resultRef);
});

test('A06 bridge fails closed for non-BACKGROUND and non-WORKING workers', (t) => {
  const decision = {
    state: 'CHECKPOINT_REQUIRED',
    safeToStart: false,
    activeWorkNodeRef: BACKGROUND_WORK,
    incomingWorkNodeRef: INTERACTIVE_WORK,
    pendingPreemptionRef: 'preemption.nws-a06.synthetic',
    admissionFingerprint: 'admission-fingerprint.nws-a06.synthetic',
    sourceDiscarded: false
  };

  const foreground = nativeWorkerFixture(t, {
    workerRef: 'worker.model.test.foreground',
    schedulingClass: 'INTERACTIVE'
  });
  expectBridgeCode(
    () => requestNativeWorkerCheckpointYieldFromScheduler(foreground.workerRoot, decision),
    'NWS_WORKER_NOT_BACKGROUND'
  );

  const standing = nativeWorkerFixture(t);
  expectBridgeCode(
    () => requestNativeWorkerCheckpointYieldFromScheduler(standing.workerRoot, decision),
    'NWS_WORKER_STATE_MISMATCH'
  );
  assert.equal(loadNativeWorker(standing.workerRoot).receipt.state, 'STANDING_BY');
});

test('A06 relay projection rejects forged or mismatched worker events before relay admission', () => {
  const fakeCall = {
    toolCallRef: 'tool-call.fake',
    workNodeRef: BACKGROUND_WORK,
    workerRef: WORKER_REF,
    workerLeaseRef: 'worker-lease.fake',
    graphFingerprint: 'a'.repeat(64),
    trustSnapshotFingerprint: 'b'.repeat(64),
    runtimeSnapshotFingerprint: 'c'.repeat(64),
    contextLeaseRef: 'context-lease.fake',
    contextLeaseFingerprint: 'd'.repeat(64),
    toolRef: 'tool.mock.inspect',
    effectRef: 'effect.mock.read',
    capabilityLeaseFingerprint: 'e'.repeat(64),
    effectLeaseFingerprint: 'f'.repeat(64),
    resourceLeaseFingerprint: '1'.repeat(64),
    schedulerGeneration: 1,
    cancellationTokenRef: 'cancellation-token.fake',
    executorRef: 'executor.mock.deterministic.inspect',
    sourceEvidenceRef: 'source.fake',
    sourceEvidenceHash: '2'.repeat(64),
    resultSchemaRef: 'schema.tool.mock.result/v0'
  };
  const forged = {
    schemaVersion: 'vexlife.native-worker-intent-event/v1',
    eventRef: 'event.native-worker.forged',
    eventKind: 'CHECKPOINT_BOUND_YIELD_OBSERVED',
    workerRef: WORKER_REF,
    workRef: BACKGROUND_WORK,
    purposeRef: 'purpose.fake',
    continuationRef: BACKGROUND_WORK,
    resultContractRef: 'contract.fake',
    workerState: 'PAUSED',
    workerReceiptGeneration: 4,
    pendingPreemptionRef: 'preemption.fake',
    incomingWorkNodeRef: INTERACTIVE_WORK,
    admissionFingerprint: 'admission.fake',
    sourceDiscarded: false,
    terminalEvidenceFingerprint: '3'.repeat(64),
    observedAt: RESULT_AT,
    externalEffectsExecuted: false,
    semanticFingerprint: '4'.repeat(64)
  };
  expectBridgeCode(
    () => createNativeWorkerToolRelayResult(fakeCall, forged),
    'NWS_WORKER_EVENT_INVALID'
  );
});

// [VXG RealForever]
