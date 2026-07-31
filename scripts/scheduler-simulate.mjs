#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { SingleWorkerIntentScheduler } from '../src/core/intent-scheduler.mjs';
import {
  createIntentEnvelope,
  createIntentWorkgraph,
  createWorkNode
} from '../src/core/intent-workgraph.mjs';
import { createResourceSnapshot } from '../src/core/resource-admission.mjs';
import { readJson } from '../src/core/utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = loadBlueprint(root);
const registry = bundle.intentRegistry;
const trustSnapshot = readJson(path.join(root, 'blueprint/intent-trust-snapshot.json'));
const formedAt = '2026-07-31T00:00:00.000Z';
const expiresAt = '2026-07-31T00:30:00.000Z';

const intent = createIntentEnvelope({
  intentRef: 'intent.scheduler.simulation',
  originMessageRef: 'message.scheduler.simulation',
  originSpeakerRef: 'person.vexlife.owner',
  recipientRoleRef: 'role.vex.operations',
  projectRef: 'project.vexlife',
  threadRef: 'thread.scheduler.simulation',
  channelRef: 'channel.scheduler.simulation',
  originalContentHash: 'a'.repeat(64),
  desiredOutcome: { intentKey: 'VALIDATE_WORKGRAPH', summary: 'Demonstrate one deterministic worker lease' },
  constraints: ['mock-only', 'no-external-effects'],
  createdAt: formedAt,
  sourceLineageRef: 'lineage.scheduler.simulation'
}, registry);

const node = createWorkNode({
  workNodeRef: 'work.scheduler.simulation',
  rootIntentRef: intent.intentRef,
  purpose: 'Demonstrate deterministic scheduler admission',
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
  createdAt: formedAt
}, registry);

const states = ['DECOMPOSED', 'PLAN_VALIDATED', 'READY'];
let priorState = 'CAPTURED';
const transitions = states.map((nextState, sequence) => {
  const transition = {
    transitionRef: `transition.scheduler.simulation.${sequence}`,
    workNodeRef: node.workNodeRef,
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
const bindingRefs = Object.fromEntries(registry.bindingFields.map((field) => [
  field,
  Array.isArray(node[field]) ? node[field] : [node[field]]
]));
const graph = createIntentWorkgraph({
  graphRef: 'intent-workgraph.scheduler.simulation',
  intent,
  nodes: [node],
  transitions,
  receipts: [],
  bindingRefs,
  createdAt: formedAt
}, registry);
const resourceSnapshot = createResourceSnapshot({
  snapshotRef: 'resource-snapshot.scheduler.simulation',
  generation: 1,
  cpuLoadPct: 10,
  cpuConcurrencyLimit: 4,
  cpuActiveCount: 0,
  ramAvailableMb: 8192,
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
  formedAt
});
const generation = 1;
const scheduler = new SingleWorkerIntentScheduler({ workerRef: 'worker.model.mock.primary' });
const queue = scheduler.admit(graph, {
  intentRegistry: registry,
  registeredProcessRefs: bundle.factory.processes.map((item) => item.processRef),
  registeredRoleRefs: bundle.blueprint.roles.map((item) => item.roleRef),
  trustSnapshot,
  resourceSnapshot,
  resourceRequestByNodeRef: {
    [node.workNodeRef]: { cpuSlots: 1, ramMb: 256, vramMb: 0, modelTurn: true, heavyTool: false, background: false }
  },
  occupancyByNodeRef: {
    [node.workNodeRef]: {
      occupancyRef: 'occupancy.scheduler.simulation',
      actorRef: 'person.vexlife.owner',
      roleRef: node.roleRef,
      workNodeRef: node.workNodeRef,
      graphFingerprint: graph.semanticFingerprint,
      schedulerGeneration: generation,
      claimRef: 'claim.scheduler.simulation',
      currentness: 'CURRENT'
    }
  },
  capabilityLeaseByNodeRef: {
    [node.workNodeRef]: {
      leaseRef: 'capability-lease.scheduler.simulation',
      workNodeRef: node.workNodeRef,
      graphFingerprint: graph.semanticFingerprint,
      trustSnapshotFingerprint: trustSnapshot.semanticFingerprint,
      schedulerGeneration: generation,
      envelopeRef: node.capabilityEnvelopeRef,
      toolRefs: ['tool.mock.inspect'],
      formedAt,
      expiresAt,
      currentness: 'CURRENT'
    }
  },
  effectLeaseByNodeRef: {
    [node.workNodeRef]: {
      leaseRef: 'effect-lease.scheduler.simulation',
      workNodeRef: node.workNodeRef,
      graphFingerprint: graph.semanticFingerprint,
      trustSnapshotFingerprint: trustSnapshot.semanticFingerprint,
      schedulerGeneration: generation,
      envelopeRef: node.effectEnvelopeRef,
      effectDisposition: 'EFFECT_ENVELOPE_BOUND',
      allowedEffectRefs: ['effect.mock.read'],
      formedAt,
      expiresAt,
      currentness: 'CURRENT'
    }
  },
  resourceLeaseRefByNodeRef: {
    [node.workNodeRef]: 'resource-lease.scheduler.simulation'
  },
  schedulerGeneration: generation,
  formedAt,
  expiresAt
});
const running = scheduler.leaseSelected({
  leaseRef: 'context-lease.scheduler.simulation',
  foundationKernelRef: 'foundation-kernel.compact',
  roleFrameRef: 'role-frame.operations',
  intentFrameRef: 'intent-frame.scheduler.simulation',
  selectedAtlasRefs: ['module.vexlife.core.intent-scheduler'],
  selectedSourceRefs: ['blueprint/intent-scheduler-registry.json'],
  applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
  applicableLessonRefs: [],
  applicableReleaseRefs: [],
  inputTokenEstimate: 256,
  reservedOutputTokens: 256,
  hardTokenLimit: 1024,
  formedAt,
  expiresAt,
  checkpointReturnRef: 'return-route.intent.verify-transition'
});

console.log(JSON.stringify({
  schemaVersion: 'vexlife.intent-scheduler-simulation/v0',
  state: running.admitted ? 'PASS' : 'FAILED',
  currentness: 'CURRENT',
  mode: 'DETERMINISTIC_FAKE_MODEL_AND_MOCK_TOOL_ONLY',
  queue: {
    state: queue.state,
    generation: queue.generation,
    logicalReadyRefs: queue.logicalReady.map((item) => item.workNodeRef),
    admittedReadyRefs: queue.admittedReady.map((item) => item.workNodeRef),
    selectedWorkNodeRef: queue.selected?.workNodeRef ?? null
  },
  active: scheduler.projections.runtime.value.active,
  externalEffectsExecuted: false
}, null, 2));
if (!running.admitted) process.exitCode = 1;

// [VXG RealForever]
