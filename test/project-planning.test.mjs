import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  PROJECT_PLANNING_TRANSACTION_SCHEMA,
  PROJECT_WORK_TRANSITION_REQUEST_SCHEMA,
  applyProjectPlanningTransaction,
  createProjectPlanningTransaction,
  validateProjectPlanningRegistry,
  validateProjectWorkTransitionRequest,
} from '../src/core/project-planning.mjs';
import {
  applyProjectPlanningRuntimeTransaction,
  readProjectPlanningRuntimeSnapshot,
  recoverProjectPlanningRuntimeWriter,
} from '../src/core/project-planning-runtime-snapshot.mjs';
import {
  readIntentWorkgraphRuntimeSnapshotEntries,
  persistIntentWorkgraphRuntimeSnapshot,
  recordIntentWorkgraphRuntimeTransition,
  recoverIntentWorkgraphRuntimeWriter,
} from '../src/core/intent-workgraph-runtime-snapshot.mjs';
import {
  createIntentEnvelope,
  createIntentWorkgraph,
  createWorkNode,
} from '../src/core/intent-workgraph.mjs';
import { canonicalize, semanticHash } from '../src/core/utils.mjs';

const readJson = (relative) => JSON.parse(fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8'));
const planningRegistry = readJson('blueprint/project-planning-registry.json');
const intentRegistry = readJson('blueprint/intent-orchestration-registry.json');
const ts = (n) => `2026-10-20T04:${String(n).padStart(2, '0')}:00.000Z`;
const PROJECT = 'project.vexlife.planning.fixture';
const GRAPH = 'intent-workgraph.planning.fixture';
const ROOT_INTENT = 'intent.vexlife.planning.fixture';
const WORK_A = 'work.planning.a';
const WORK_B = 'work.planning.b';
const VIEW = 'view.project.planning.fixture.board';
const LANE = 'lane.project.active';

function projectSnapshot(cards = [
  { graphRef: GRAPH, workNodeRef: WORK_A, state: 'CAPTURED' },
  { graphRef: GRAPH, workNodeRef: WORK_B, state: 'CAPTURED' },
], graphBindings = []) {
  const core = {
    schemaVersion: 'vexlife.project-continuity-snapshot/v1',
    state: 'CURRENT',
    currentness: 'CURRENT',
    projectRef: PROJECT,
    projectDefinitionFingerprint: '1'.repeat(64),
    graphBindings,
    cards: cards.map((card) => ({
      rootIntentRef: ROOT_INTENT,
      purpose: card.workNodeRef,
      priorityClass: 'NORMAL',
      roleRef: 'role.vex.coder',
      parentWorkNodeRef: null,
      dependencyRefs: [],
      childRefs: [],
      featureRefs: [],
      completionGateRefs: [],
      sourceRefs: ['source.fixture'],
      createdAt: ts(0),
      lastTransitionRef: null,
      lastTransitionAt: null,
      currentReceiptRefs: [],
      assignment: null,
      ...card,
    })),
    edges: [],
    sourceRefs: ['github.issue.vexlife.866'],
    effects: false,
    executionAuthority: 'NONE',
  };
  return { ...core, semanticFingerprint: semanticHash(core) };
}

function planningTransaction({
  eventClass,
  payload,
  expectedPointer = null,
  expectedSnapshot = null,
  index = 0,
}) {
  return {
    schemaVersion: PROJECT_PLANNING_TRANSACTION_SCHEMA,
    transactionRef: `transaction.planning.${index}`,
    eventRef: `event.planning.${index}`,
    projectRef: PROJECT,
    eventClass,
    payload,
    expectedPlanningPointerSha256OrNull: expectedPointer,
    expectedPlanningSnapshotFingerprintOrNull: expectedSnapshot,
    instanceRef: `instance.planning.${index}`,
    actorRef: 'person.victor',
    sourceRefs: ['github.issue.vexlife.866'],
    formedAt: ts(index + 1),
  };
}

function intentGraph() {
  const intent = createIntentEnvelope({
    intentRef: ROOT_INTENT,
    originMessageRef: 'message.planning.fixture',
    originSpeakerRef: 'person.victor',
    recipientRoleRef: 'role.vex.coder',
    projectRef: PROJECT,
    threadRef: 'thread.planning.fixture',
    channelRef: 'channel.planning.fixture',
    originalContentHash: 'a'.repeat(64),
    desiredOutcome: { intentKey: 'PROJECT_PLANNING_FIXTURE', summary: 'Exercise B03 transactions' },
    constraints: [],
    createdAt: ts(0),
    sourceLineageRef: 'lineage.planning.fixture',
  }, intentRegistry);
  const node = (workNodeRef) => createWorkNode({
    workNodeRef,
    rootIntentRef: ROOT_INTENT,
    parentWorkNodeRef: null,
    purpose: workNodeRef,
    processRef: 'process.vexlife.intent.capture',
    initialState: 'CAPTURED',
    state: 'CAPTURED',
    dependencyRefs: [],
    dependencyRequirements: [],
    childRefs: [],
    roleRef: 'role.vex.coder',
    priorityClass: 'NORMAL',
    contextPlanRef: null,
    applicableCultureRefs: [],
    applicableLessonRefs: [],
    applicableBurdenReleaseRefs: [],
    capabilityEnvelopeRef: `capability-envelope.${workNodeRef}`,
    effectEnvelopeRef: `effect-envelope.${workNodeRef}`,
    resourceEnvelopeRef: `resource-envelope.${workNodeRef}`,
    expectedTransitionRef: `expected-transition.${workNodeRef}`,
    completionGateRefs: [`completion-gate.${workNodeRef}`],
    returnRouteRef: `return-route.${workNodeRef}`,
    sourceRefs: ['source.fixture'],
    createdAt: ts(0),
  }, intentRegistry);
  return createIntentWorkgraph({
    graphRef: GRAPH,
    intent,
    nodes: [node(WORK_A), node(WORK_B)],
    transitions: [],
    receipts: [],
    bindingRefs: {},
    createdAt: ts(0),
  }, intentRegistry);
}

test('project planning registry admits exactly the bounded B03 event vocabulary', () => {
  const result = validateProjectPlanningRegistry(planningRegistry);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.deepEqual(planningRegistry.planningEventClasses.map((item) => item.eventClass), [
    'ITERATION_DEFINED',
    'ITERATION_CLOSED',
    'ITERATION_MEMBERSHIP_SET',
    'SHARED_ORDER_SET',
    'WIP_POLICY_SET',
    'VIEW_SELECTED',
  ]);
});

test('planning ledger applies all five planning-only event classes deterministically', () => {
  let snapshot = null;
  const ps = projectSnapshot();
  const events = [
    ['ITERATION_DEFINED', { iterationRef: 'iteration.fixture.1', label: 'Fixture iteration', startsAt: ts(10), endsAt: ts(20) }],
    ['ITERATION_MEMBERSHIP_SET', { workNodeRef: WORK_A, iterationRefOrNull: 'iteration.fixture.1' }],
    ['SHARED_ORDER_SET', { scopeRef: 'scope.fixture', orderedWorkNodeRefs: [WORK_B, WORK_A] }],
    ['WIP_POLICY_SET', { laneRef: LANE, limit: 2 }],
    ['VIEW_SELECTED', { viewRef: VIEW }],
    ['ITERATION_CLOSED', { iterationRef: 'iteration.fixture.1', closedAt: ts(21) }],
  ];
  for (const [index, [eventClass, payload]] of events.entries()) {
    const tx = planningTransaction({
      eventClass,
      payload,
      expectedSnapshot: snapshot?.semanticFingerprint ?? null,
      index,
    });
    const applied = applyProjectPlanningTransaction({
      snapshot,
      transaction: tx,
      projectSnapshot: ps,
      knownLaneRefs: [LANE],
      knownViewRefs: [VIEW],
      registry: planningRegistry,
    });
    assert.equal(applied.changed, true);
    assert.equal(applied.event.sequence, index);
    snapshot = applied.snapshot;
  }
  assert.equal(snapshot.eventCount, 6);
  assert.equal(snapshot.iterations[0].iterationRef, 'iteration.fixture.1');
  assert.equal(snapshot.iterations[0].closedAtOrNull, ts(21));
  assert.deepEqual(snapshot.iterations[0].finalWorkNodeRefs, [WORK_A]);
  assert.deepEqual(snapshot.iterationMemberships, [{ workNodeRef: WORK_A, iterationRef: 'iteration.fixture.1' }]);
  assert.deepEqual(snapshot.sharedOrders[0].orderedWorkNodeRefs, [WORK_B, WORK_A]);
  assert.deepEqual(snapshot.wipPolicies, [{ laneRef: LANE, limit: 2 }]);
  assert.equal(snapshot.selectedViewRefOrNull, VIEW);

  assert.throws(() => applyProjectPlanningTransaction({
    snapshot,
    transaction: planningTransaction({
      eventClass: 'ITERATION_MEMBERSHIP_SET',
      payload: { workNodeRef: WORK_B, iterationRefOrNull: 'iteration.fixture.1' },
      expectedSnapshot: snapshot.semanticFingerprint,
      index: 6,
    }),
    projectSnapshot: ps,
    knownLaneRefs: [LANE],
    knownViewRefs: [VIEW],
    registry: planningRegistry,
  }), /cannot add work to closed iteration/);
});

test('planning runtime persists an atomic current pointer and rejects stale optimistic writes', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-planning-runtime-'));
  try {
    const ps = projectSnapshot();
    const first = applyProjectPlanningRuntimeTransaction({
      home,
      transaction: planningTransaction({
        eventClass: 'ITERATION_DEFINED',
        payload: { iterationRef: 'iteration.fixture.1', label: 'Fixture iteration', startsAt: ts(10), endsAt: ts(20) },
        index: 0,
      }),
      projectSnapshot: ps,
      knownLaneRefs: [LANE],
      knownViewRefs: [VIEW],
      registry: planningRegistry,
    });
    assert.equal(first.changed, true);
    assert.match(first.pointer.pointerSha256, /^[a-f0-9]{64}$/u);

    const second = applyProjectPlanningRuntimeTransaction({
      home,
      transaction: planningTransaction({
        eventClass: 'ITERATION_MEMBERSHIP_SET',
        payload: { workNodeRef: WORK_A, iterationRefOrNull: 'iteration.fixture.1' },
        expectedPointer: first.pointer.pointerSha256,
        expectedSnapshot: first.snapshot.semanticFingerprint,
        index: 1,
      }),
      projectSnapshot: ps,
      knownLaneRefs: [LANE],
      knownViewRefs: [VIEW],
      registry: planningRegistry,
    });
    assert.equal(second.snapshot.eventCount, 2);
    assert.equal(readProjectPlanningRuntimeSnapshot({ home, projectRef: PROJECT }).pointer.pointerSha256, second.pointer.pointerSha256);

    assert.throws(() => applyProjectPlanningRuntimeTransaction({
      home,
      transaction: planningTransaction({
        eventClass: 'SHARED_ORDER_SET',
        payload: { scopeRef: 'scope.fixture', orderedWorkNodeRefs: [WORK_A] },
        expectedPointer: first.pointer.pointerSha256,
        expectedSnapshot: first.snapshot.semanticFingerprint,
        index: 2,
      }),
      projectSnapshot: ps,
      knownLaneRefs: [LANE],
      knownViewRefs: [VIEW],
      registry: planningRegistry,
    }), (error) => error?.code === 'PROJECT_PLANNING_RUNTIME_STALE');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('planning validation rejects unknown work, view, lane and out-of-project order', () => {
  const ps = projectSnapshot();
  const cases = [
    planningTransaction({ eventClass: 'ITERATION_MEMBERSHIP_SET', payload: { workNodeRef: 'work.other', iterationRefOrNull: null }, index: 0 }),
    planningTransaction({ eventClass: 'SHARED_ORDER_SET', payload: { scopeRef: 'scope.fixture', orderedWorkNodeRefs: ['work.other'] }, index: 1 }),
    planningTransaction({ eventClass: 'WIP_POLICY_SET', payload: { laneRef: 'lane.unknown', limit: 1 }, index: 2 }),
    planningTransaction({ eventClass: 'VIEW_SELECTED', payload: { viewRef: 'view.unknown' }, index: 3 }),
  ];
  for (const tx of cases) {
    assert.throws(() => applyProjectPlanningTransaction({
      snapshot: null,
      transaction: tx,
      projectSnapshot: ps,
      knownLaneRefs: [LANE],
      knownViewRefs: [VIEW],
      registry: planningRegistry,
    }));
  }
});

test('Workgraph transition request binds exact Project snapshot and exact runtime pointer', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-planning-workgraph-'));
  try {
    const initial = persistIntentWorkgraphRuntimeSnapshot({
      home,
      graph: intentGraph(),
      instanceRef: 'instance.workgraph.seed',
      observedAt: ts(1),
    });
    const entry = readIntentWorkgraphRuntimeSnapshotEntries({ home })[0];
    const ps = projectSnapshot(undefined, [{
      graphRef: GRAPH,
      rootIntentRef: ROOT_INTENT,
      semanticFingerprint: entry.graph.semanticFingerprint,
      validationState: 'PLAN_VALIDATED',
      validationSemanticHash: 'b'.repeat(64),
      currentnessOwnerRef: 'owner.vexlife.intent-workgraph',
      currentnessSourceRef: 'source.vexlife.intent-workgraph.runtime-snapshot.001',
      currentPointerSha256: entry.pointer.pointerSha256,
      payloadSha256: entry.pointer.payloadSha256,
      priorSemanticFingerprint: null,
      createdAt: ts(0),
    }]);
    const request = {
      schemaVersion: PROJECT_WORK_TRANSITION_REQUEST_SCHEMA,
      requestRef: 'request.transition.fixture',
      projectRef: PROJECT,
      graphRef: GRAPH,
      workNodeRef: WORK_A,
      expectedProjectSnapshotFingerprint: ps.semanticFingerprint,
      expectedWorkgraphPointerSha256: entry.pointer.pointerSha256,
      expectedGraphSemanticFingerprint: entry.graph.semanticFingerprint,
      expectedState: 'CAPTURED',
      nextState: 'DECOMPOSED',
      reason: 'fixture transition',
      transitionRef: 'transition.fixture.a.0',
      actorRef: 'person.victor',
      actorRoleRef: 'role.vex.coder',
      processRef: 'process.vexlife.intent.capture',
      sourceRefs: ['source.fixture'],
      requestedAt: ts(2),
      instanceRef: 'instance.transition.fixture',
    };
    const validated = validateProjectWorkTransitionRequest({
      request,
      projectSnapshot: ps,
      workgraphEntry: entry,
      intentRegistry,
    });
    assert.equal(validated.state, 'VALID');
    assert.equal(validated.executionAuthority, 'NONE');

    const applied = recordIntentWorkgraphRuntimeTransition({
      home,
      graphRef: GRAPH,
      expectedPointerSha256: entry.pointer.pointerSha256,
      transition: validated.transition,
      registry: intentRegistry,
      instanceRef: request.instanceRef,
      observedAt: request.requestedAt,
    });
    assert.equal(applied.changed, true);
    assert.equal(applied.graph.nodes.find((node) => node.workNodeRef === WORK_A).state, 'DECOMPOSED');
    assert.notEqual(applied.pointer.pointerSha256, initial.pointer.pointerSha256);

    assert.throws(() => recordIntentWorkgraphRuntimeTransition({
      home,
      graphRef: GRAPH,
      expectedPointerSha256: entry.pointer.pointerSha256,
      transition: { ...validated.transition, transitionRef: 'transition.fixture.a.stale' },
      registry: intentRegistry,
      instanceRef: 'instance.transition.stale',
      observedAt: ts(3),
    }), (error) => error?.code === 'INTENT_WORKGRAPH_RUNTIME_STALE');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('planning and Workgraph abandoned writer recovery is exact-lease bound and active writers stay protected', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-project-writer-recovery-'));
  try {
    const dead = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
    assert.equal(dead.status, 0);
    assert.ok(Number.isSafeInteger(dead.pid) && dead.pid > 0);

    const planningAddress = semanticHash({
      schemaVersion: 'vexlife.project-planning-runtime-snapshot/v1',
      ownerRef: 'owner.vexlife.project-planning',
      projectRef: PROJECT,
    });
    const planningRoot = path.join(home, 'runtime', 'project-planning', planningAddress);
    fs.mkdirSync(planningRoot, { recursive: true });
    const planningCore = {
      schemaVersion: 'vexlife.project-planning-runtime-writer/v1',
      projectRef: PROJECT,
      instanceRef: 'instance.recovery.planning',
      pid: dead.pid,
      lockToken: 'dead-planning-writer-token',
      formedAt: ts(1),
    };
    const planningLease = { ...planningCore, leaseSha256: semanticHash(planningCore) };
    const planningLock = path.join(planningRoot, 'writer.lock');
    fs.writeFileSync(planningLock, JSON.stringify(canonicalize(planningLease)), 'utf8');

    assert.throws(() => recoverProjectPlanningRuntimeWriter({
      home,
      projectRef: PROJECT,
      expectedLeaseSha256: '0'.repeat(64),
    }), (error) => error?.code === 'PROJECT_PLANNING_RUNTIME_RECOVERY_STALE');
    assert.equal(fs.existsSync(planningLock), true);

    const recoveredPlanning = recoverProjectPlanningRuntimeWriter({
      home,
      projectRef: PROJECT,
      expectedLeaseSha256: planningLease.leaseSha256,
    });
    assert.equal(recoveredPlanning.state, 'RECOVERED');
    assert.deepEqual(recoveredPlanning.effects, {
      homeMutationPerformed: true,
      writerLeaseDeletionPerformed: true,
      providerMutationPerformed: false,
    });
    assert.equal(fs.existsSync(planningLock), false);
    const planningNoRecovery = recoverProjectPlanningRuntimeWriter({
      home,
      projectRef: PROJECT,
      expectedLeaseSha256: planningLease.leaseSha256,
    });
    assert.deepEqual(planningNoRecovery.effects, {
      homeMutationPerformed: false,
      writerLeaseDeletionPerformed: false,
      providerMutationPerformed: false,
    });

    const graph = intentGraph();
    const graphAddress = semanticHash({
      schemaVersion: 'vexlife.intent-workgraph-runtime-snapshot/v1',
      ownerRef: 'owner.vexlife.intent-workgraph',
      graphRef: graph.graphRef,
    });
    const graphLockRoot = path.join(home, 'runtime', 'intent-workgraph', 'locks');
    fs.mkdirSync(graphLockRoot, { recursive: true });
    const graphCore = {
      schemaVersion: 'vexlife.intent-workgraph-runtime-writer/v1',
      graphRef: graph.graphRef,
      instanceRef: 'instance.recovery.workgraph',
      pid: dead.pid,
      lockToken: 'dead-workgraph-writer-token',
      formedAt: ts(2),
    };
    const graphLease = { ...graphCore, leaseSha256: semanticHash(graphCore) };
    const graphLock = path.join(graphLockRoot, `${graphAddress}.lock`);
    fs.writeFileSync(graphLock, JSON.stringify(canonicalize(graphLease)), 'utf8');
    const recoveredGraph = recoverIntentWorkgraphRuntimeWriter({
      home,
      graphRef: graph.graphRef,
      expectedLeaseSha256: graphLease.leaseSha256,
    });
    assert.equal(recoveredGraph.state, 'RECOVERED');
    assert.deepEqual(recoveredGraph.effects, {
      homeMutationPerformed: true,
      writerLeaseDeletionPerformed: true,
      providerMutationPerformed: false,
    });
    assert.equal(fs.existsSync(graphLock), false);
    const graphNoRecovery = recoverIntentWorkgraphRuntimeWriter({
      home,
      graphRef: graph.graphRef,
      expectedLeaseSha256: graphLease.leaseSha256,
    });
    assert.deepEqual(graphNoRecovery.effects, {
      homeMutationPerformed: false,
      writerLeaseDeletionPerformed: false,
      providerMutationPerformed: false,
    });

    const activePlanningCore = {
      ...planningCore,
      pid: process.pid,
      lockToken: 'active-planning-writer-token',
      formedAt: ts(3),
    };
    const activePlanningLease = {
      ...activePlanningCore,
      leaseSha256: semanticHash(activePlanningCore),
    };
    fs.writeFileSync(planningLock, JSON.stringify(canonicalize(activePlanningLease)), 'utf8');
    assert.throws(() => recoverProjectPlanningRuntimeWriter({
      home,
      projectRef: PROJECT,
      expectedLeaseSha256: activePlanningLease.leaseSha256,
    }), (error) => error?.code === 'PROJECT_PLANNING_RUNTIME_WRITER_CONFLICT');
    assert.equal(fs.existsSync(planningLock), true);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('planning transaction identity is content-addressed and rejects stale supplied fingerprint', () => {
  const input = planningTransaction({
    eventClass: 'ITERATION_DEFINED',
    payload: { iterationRef: 'iteration.fixture.1', label: 'Fixture iteration', startsAt: ts(10), endsAt: ts(20) },
  });
  const transaction = createProjectPlanningTransaction(input, planningRegistry);
  assert.match(transaction.semanticFingerprint, /^[a-f0-9]{64}$/u);
  assert.throws(() => createProjectPlanningTransaction({ ...input, semanticFingerprint: '0'.repeat(64) }, planningRegistry), /semanticFingerprint mismatch/);
});

// [VXG RealForever]
