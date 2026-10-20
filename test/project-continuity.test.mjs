import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  compileProjectContinuity,
  createProjectDefinition,
  createProjectViewDefinition,
  formLaneFocusCard,
  projectProjectBoard,
  projectProjectGraph,
  validateProjectContinuityRegistry,
} from '../src/core/project-continuity.mjs';
import {
  buildAcceptedAssignmentFingerprint,
  buildGraphSnapshotFingerprint,
  buildIntentFingerprint,
  buildIntentTrustSnapshotFingerprint,
  buildIntentTrustSourceHash,
  buildTransitionFingerprint,
  buildWorkNodeFingerprint,
} from '../src/core/intent-workgraph.mjs';
import {
  INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_OWNER_REF,
  INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_SCHEMA,
  INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_SOURCE_REF,
  persistIntentWorkgraphRuntimeSnapshot,
  readIntentWorkgraphRuntimeSnapshotEntries,
} from '../src/core/intent-workgraph-runtime-snapshot.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
const registry = readJson('blueprint/project-continuity-registry.json');
const intentRegistry = readJson('blueprint/intent-orchestration-registry.json');
const FEATURE_REF = 'feature.vexlife.lived-companion-baseline';
const timestamp = (second) => `2026-10-19T20:00:${String(second).padStart(2, '0')}.000Z`;
const canonicalRefs = (items) => [...new Set(items)].sort();

function sealIntent(value) {
  const candidate = structuredClone(value);
  candidate.semanticFingerprint = buildIntentFingerprint(candidate);
  return candidate;
}

function sealNode(value) {
  const candidate = structuredClone(value);
  candidate.semanticFingerprint = buildWorkNodeFingerprint(candidate);
  return candidate;
}

function sealTransition(value) {
  const candidate = structuredClone(value);
  candidate.semanticFingerprint = buildTransitionFingerprint(candidate);
  return candidate;
}

function bindingRefsFor(nodes) {
  return Object.fromEntries((intentRegistry.bindingFields ?? []).map((field) => [
    field,
    canonicalRefs(nodes.flatMap((node) => Array.isArray(node[field]) ? node[field] : [node[field]]).filter(Boolean)),
  ]));
}

function trustSnapshotFor(nodes) {
  const core = {
    schemaVersion: intentRegistry.trustedSnapshotSchemaVersion,
    snapshotRef: 'snapshot.intent.project-continuity.fixture',
    sourceRef: 'source.intent.project-continuity.fixture',
    formationRef: 'formation.intent.project-continuity.fixture',
    formedAt: timestamp(0),
    currentness: 'CURRENT',
    bindingRefs: bindingRefsFor(nodes),
    actorRefs: ['person.victor', 'vex.fixture'],
    decisionRefs: [],
    authorizationBindings: [],
  };
  core.sourceHash = buildIntentTrustSourceHash(core);
  core.semanticFingerprint = buildIntentTrustSnapshotFingerprint(core);
  return core;
}

function graphFixture() {
  const intent = sealIntent({
    intentRef: 'intent.vexlife.tocompletion.fixture',
    originMessageRef: 'message.vexlife.tocompletion.fixture',
    originSpeakerRef: 'person.victor',
    recipientRoleRef: 'role.vex.operations',
    projectRef: 'project.vexlife.tocompletion.fixture',
    threadRef: 'thread.vexlife.tocompletion.fixture',
    channelRef: 'channel.vexlife.tocompletion.fixture',
    originalContentHash: 'a'.repeat(64),
    desiredOutcome: { intentKey: 'PROJECT_CONTINUITY_FIXTURE', summary: 'Prove project projection' },
    constraints: [],
    createdAt: timestamp(0),
    sourceLineageRef: 'lineage.vexlife.tocompletion.fixture',
  });

  const parent = sealNode({
    workNodeRef: 'work.fixture.parent', rootIntentRef: intent.intentRef, parentWorkNodeRef: null,
    purpose: 'Own the fixture outcome', processRef: 'process.fixture.parent', initialState: 'CAPTURED', state: 'RUNNING',
    dependencyRefs: [], dependencyRequirements: [], childRefs: ['work.fixture.child'], roleRef: 'role.vex.operations',
    priorityClass: 'HIGH', contextPlanRef: null, applicableCultureRefs: [], applicableLessonRefs: [], applicableBurdenReleaseRefs: [],
    capabilityEnvelopeRef: 'capability-envelope.fixture.parent', effectEnvelopeRef: 'effect-envelope.fixture.none', resourceEnvelopeRef: 'resource-envelope.fixture',
    expectedTransitionRef: 'expected-transition.fixture.parent', completionGateRefs: ['completion-gate.fixture.parent'], returnRouteRef: 'return-route.fixture.parent',
    sourceRefs: ['source.fixture.parent'], createdAt: timestamp(1),
  });
  const child = sealNode({
    workNodeRef: 'work.fixture.child', rootIntentRef: intent.intentRef, parentWorkNodeRef: parent.workNodeRef,
    purpose: 'Wait for exact parent proof', processRef: 'process.fixture.child', initialState: 'CAPTURED', state: 'WAITING_DEPENDENCIES',
    dependencyRefs: [parent.workNodeRef], dependencyRequirements: [{ dependencyWorkNodeRef: parent.workNodeRef, expectedTransitionRef: parent.expectedTransitionRef, allowedDispositions: ['COMPLETED'] }],
    childRefs: [], roleRef: 'role.vex.coder', priorityClass: 'NORMAL', contextPlanRef: null, applicableCultureRefs: [], applicableLessonRefs: [], applicableBurdenReleaseRefs: [],
    capabilityEnvelopeRef: 'capability-envelope.fixture.child', effectEnvelopeRef: 'effect-envelope.fixture.none', resourceEnvelopeRef: 'resource-envelope.fixture',
    expectedTransitionRef: 'expected-transition.fixture.child', completionGateRefs: ['completion-gate.fixture.child'], returnRouteRef: 'return-route.fixture.child',
    sourceRefs: ['source.fixture.child'], createdAt: timestamp(2),
  });
  const nodes = [parent, child];
  const transition = (workNodeRef, sequence, priorState, nextState, at, processRef) => sealTransition({
    transitionRef: `transition.${workNodeRef}.${sequence}`,
    workNodeRef, sequence, priorState, nextState, reason: 'project continuity fixture',
    actorRef: 'vex.fixture', actorRoleRef: 'role.vex.operations', processRef,
    sourceRefs: ['source.fixture'], createdAt: timestamp(at),
  });
  const transitions = [
    transition(parent.workNodeRef, 0, 'CAPTURED', 'DECOMPOSED', 3, parent.processRef),
    transition(parent.workNodeRef, 1, 'DECOMPOSED', 'PLAN_VALIDATED', 4, parent.processRef),
    transition(parent.workNodeRef, 2, 'PLAN_VALIDATED', 'READY', 5, parent.processRef),
    transition(parent.workNodeRef, 3, 'READY', 'RUNNING', 6, parent.processRef),
    transition(child.workNodeRef, 0, 'CAPTURED', 'DECOMPOSED', 7, child.processRef),
    transition(child.workNodeRef, 1, 'DECOMPOSED', 'PLAN_VALIDATED', 8, child.processRef),
    transition(child.workNodeRef, 2, 'PLAN_VALIDATED', 'WAITING_DEPENDENCIES', 9, child.processRef),
  ];
  const assignment = {
    assignmentRef: 'assignment.fixture.parent', sourceIntentRef: intent.intentRef, workNodeRef: parent.workNodeRef,
    assigneeRef: 'vex.fixture', acceptingActorRef: 'person.victor', acceptanceBasis: 'ORIGINATING_HUMAN_ACCEPTED',
    acceptedAt: timestamp(10), sourceRefs: ['source.fixture'], authorityDisposition: 'NO_AUTHORITY', effectDisposition: 'NO_EFFECTS',
    assignmentState: 'CURRENT', settledByWorkStateOrNull: null,
  };
  assignment.semanticFingerprint = buildAcceptedAssignmentFingerprint(assignment);
  const graph = {
    schemaVersion: 'vexlife.intent-workgraph/v0', graphRef: 'intent-workgraph.fixture.project', rootIntentRef: intent.intentRef,
    intent, interpretations: [], proposedPlans: [], authorizations: [], nodes, transitions, receipts: [], acceptedAssignments: [assignment],
    bindingRefs: bindingRefsFor(nodes),
    currentPointers: {
      transitionByWorkNodeRef: {
        [parent.workNodeRef]: transitions[3].transitionRef,
        [child.workNodeRef]: transitions[6].transitionRef,
      },
      currentReceiptRefs: [],
    },
    createdAt: timestamp(0),
  };
  graph.semanticFingerprint = buildGraphSnapshotFingerprint(graph);
  return graph;
}

function validationContext(graph = graphFixture()) {
  return {
    registeredProcessRefs: [...intentRegistry.processRefs, ...graph.nodes.map((node) => node.processRef)],
    registeredRoleRefs: ['role.vex.operations', 'role.vex.coder'],
    trustSnapshot: trustSnapshotFor(graph.nodes),
  };
}

function projectFixture() {
  return {
    schemaVersion: 'vexlife.project-definition/v1',
    projectRef: 'project.vexlife.tocompletion.fixture',
    label: 'ToCompletion fixture',
    purpose: 'Exercise the project continuity projection without becoming work-state authority.',
    rootIntentRefs: ['intent.vexlife.tocompletion.fixture'],
    featureRefs: [FEATURE_REF],
    workFeatureBindings: [{ workNodeRef: 'work.fixture.parent', featureRefs: [FEATURE_REF] }],
    sourceRefs: ['github.issue.vexlife.866'],
    formedAt: timestamp(0),
  };
}

function boardViewFixture() {
  return {
    schemaVersion: 'vexlife.project-view-definition/v1',
    viewRef: 'view.project.fixture.board', projectRef: 'project.vexlife.tocompletion.fixture',
    label: 'Project Board', viewClass: 'BOARD', laneRefOrder: registry.boardLanes.map((lane) => lane.laneRef), formedAt: timestamp(0),
  };
}

function currentEntryFor(graph = graphFixture(), priorSemanticFingerprint = null) {
  const core = {
    schemaVersion: INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_SCHEMA,
    ownerRef: INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_OWNER_REF,
    sourceRef: INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_SOURCE_REF,
    currentness: 'CURRENT',
    graphRef: graph.graphRef,
    rootIntentRef: graph.rootIntentRef,
    semanticFingerprint: graph.semanticFingerprint,
    payloadSha256: semanticHash(graph),
    priorSemanticFingerprint,
  };
  return {
    pointer: { ...core, pointerSha256: semanticHash(core) },
    graph,
  };
}

function compile(graph = graphFixture(), project = projectFixture()) {
  return compileProjectContinuity({
    registry, intentRegistry, project, workgraphEntries: [currentEntryFor(graph)],
    intentValidationContext: validationContext(graph),
    registeredFeatureRefs: [FEATURE_REF],
  });
}

test('project continuity registry covers every canonical Intent Workgraph lifecycle exactly once', () => {
  const result = validateProjectContinuityRegistry(registry, intentRegistry);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.lifecycleToLane.size, intentRegistry.lifecycleStates.length);
});

test('project definition and view are content-addressed and reject stale fingerprints', () => {
  const project = createProjectDefinition(projectFixture());
  const view = createProjectViewDefinition(boardViewFixture(), registry);
  assert.match(project.semanticFingerprint, /^[a-f0-9]{64}$/u);
  assert.match(view.semanticFingerprint, /^[a-f0-9]{64}$/u);
  assert.throws(() => createProjectDefinition({ ...projectFixture(), semanticFingerprint: '0'.repeat(64) }), /semanticFingerprint mismatch/);
  assert.throws(() => createProjectViewDefinition({ ...boardViewFixture(), semanticFingerprint: '0'.repeat(64) }, registry), /semanticFingerprint mismatch/);
});

test('read-only compiler joins exact validated Workgraph, assignment, feature and timestamp truth', () => {
  const snapshot = compile();
  assert.equal(snapshot.state, 'CURRENT');
  assert.equal(snapshot.effects, false);
  assert.equal(snapshot.executionAuthority, 'NONE');
  assert.equal(snapshot.cards.length, 2);
  assert.equal(snapshot.graphBindings[0].validationState, 'PLAN_VALIDATED');
  assert.match(snapshot.graphBindings[0].validationSemanticHash, /^[a-f0-9]{64}$/u);
  assert.equal(snapshot.graphBindings[0].currentnessOwnerRef, INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_OWNER_REF);
  assert.match(snapshot.graphBindings[0].currentPointerSha256, /^[a-f0-9]{64}$/u);
  const parent = snapshot.cards.find((card) => card.workNodeRef === 'work.fixture.parent');
  assert.equal(parent.assignment.assigneeRef, 'vex.fixture');
  assert.deepEqual(parent.featureRefs, [FEATURE_REF]);
  assert.equal(parent.lastTransitionAt, timestamp(6));
  assert.deepEqual(parent.currentReceiptRefs, []);
  assert.equal(snapshot.edges.some((edge) => edge.relation === 'DEPENDS_ON'), true);
  assert.equal(snapshot.edges.some((edge) => edge.relation === 'CONTAINS'), true);
  assert.equal(snapshot.edges.some((edge) => edge.relation === 'RELATES_TO_FEATURE'), true);
});

test('Board and Graph are projections only; lifecycle mapping does not mutate Workgraph state', () => {
  const graph = graphFixture();
  const before = structuredClone(graph);
  const snapshot = compile(graph);
  const board = projectProjectBoard({ registry, snapshot, view: boardViewFixture() });
  const active = board.lanes.find((lane) => lane.laneRef === 'lane.project.active');
  const planned = board.lanes.find((lane) => lane.laneRef === 'lane.project.planned');
  assert.deepEqual(active.cards.map((card) => card.workNodeRef), ['work.fixture.parent']);
  assert.deepEqual(planned.cards.map((card) => card.workNodeRef), ['work.fixture.child']);
  assert.equal(board.unplacedWorkNodeRefs.length, 0);
  assert.equal(board.effects, false);
  assert.equal(board.executionAuthority, 'NONE');
  assert.equal(projectProjectGraph(snapshot).nodes.length, 2);
  assert.deepEqual(graph, before);
});

test('Lane Focus Card exposes bounded causal neighborhood and possible transitions without authority', () => {
  const focus = formLaneFocusCard({ snapshot: compile(), workNodeRef: 'work.fixture.parent', intentRegistry });
  assert.deepEqual(focus.relationships.childWorkNodeRefs, ['work.fixture.child']);
  assert.deepEqual(focus.relationships.dependentWorkNodeRefs, ['work.fixture.child']);
  assert.equal(focus.possibleLifecycleTransitions.includes('VERIFYING'), true);
  assert.equal(focus.transitionAuthority, 'NO_EXECUTION_AUTHORITY');
  assert.equal(focus.effects, false);
});

test('runtime snapshot owner exposes the exact CURRENT pointer that project continuity consumes', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-project-continuity-current-'));
  try {
    const graph = graphFixture();
    persistIntentWorkgraphRuntimeSnapshot({ home, graph });
    const entries = readIntentWorkgraphRuntimeSnapshotEntries({ home });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].pointer.currentness, 'CURRENT');
    assert.equal(entries[0].pointer.semanticFingerprint, graph.semanticFingerprint);
    assert.equal(entries[0].pointer.payloadSha256, semanticHash(graph));
    const snapshot = compileProjectContinuity({
      registry, intentRegistry, project: projectFixture(), workgraphEntries: entries,
      intentValidationContext: validationContext(graph),
      registeredFeatureRefs: [FEATURE_REF],
    });
    assert.equal(snapshot.currentness, 'CURRENT');
    assert.equal(snapshot.graphBindings[0].currentPointerSha256, entries[0].pointer.pointerSha256);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('compiler rejects Workgraphs that are not bound to the supplied runtime CURRENT pointer', () => {
  const graph = graphFixture();
  const entry = currentEntryFor(graph);
  entry.pointer = {
    ...entry.pointer,
    semanticFingerprint: '0'.repeat(64),
  };
  const { pointerSha256: _ignored, ...pointerCore } = entry.pointer;
  entry.pointer.pointerSha256 = semanticHash(pointerCore);
  assert.throws(() => compileProjectContinuity({
    registry, intentRegistry, project: projectFixture(), workgraphEntries: [entry],
    intentValidationContext: validationContext(graph),
    registeredFeatureRefs: [FEATURE_REF],
  }), /does not match its runtime CURRENT pointer/);
});

test('compiler fails closed on foreign project, invalid Workgraph truth, unknown work/feature relations and duplicate graph identity', () => {
  const graph = graphFixture();
  const foreign = structuredClone(graph);
  foreign.intent.projectRef = 'project.other';
  foreign.intent.semanticFingerprint = buildIntentFingerprint(foreign.intent);
  foreign.semanticFingerprint = buildGraphSnapshotFingerprint(foreign);
  assert.throws(() => compileProjectContinuity({ registry, intentRegistry, project: projectFixture(), workgraphEntries: [currentEntryFor(foreign)], intentValidationContext: validationContext(foreign), registeredFeatureRefs: [FEATURE_REF] }), /exact project/);

  const invalid = graphFixture();
  invalid.nodes[0].processRef = 'process.unregistered';
  invalid.nodes[0].semanticFingerprint = buildWorkNodeFingerprint(invalid.nodes[0]);
  invalid.semanticFingerprint = buildGraphSnapshotFingerprint(invalid);
  assert.throws(() => compileProjectContinuity({ registry, intentRegistry, project: projectFixture(), workgraphEntries: [currentEntryFor(invalid)], intentValidationContext: validationContext(invalid), registeredFeatureRefs: [FEATURE_REF] }), /not valid current Intent Workgraph truth/);

  const unknownBinding = projectFixture();
  unknownBinding.workFeatureBindings = [{ workNodeRef: 'work.unknown', featureRefs: [FEATURE_REF] }];
  assert.throws(() => compile(graphFixture(), unknownBinding), /unknown work node/);

  assert.throws(() => compileProjectContinuity({ registry, intentRegistry, project: projectFixture(), workgraphEntries: [currentEntryFor(graphFixture())], intentValidationContext: validationContext(), registeredFeatureRefs: ['feature.unknown'] }), /unregistered feature/);

  const duplicate = graphFixture();
  assert.throws(() => compileProjectContinuity({ registry, intentRegistry, project: projectFixture(), workgraphEntries: [currentEntryFor(duplicate), currentEntryFor(structuredClone(duplicate))], intentValidationContext: validationContext(duplicate), registeredFeatureRefs: [FEATURE_REF] }), /duplicate or invalid graphRef/);
});

// [VXG RealForever]
