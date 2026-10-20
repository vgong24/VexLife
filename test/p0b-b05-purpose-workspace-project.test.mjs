import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  PURPOSE_WORKSPACE_PROJECT_PROJECTION_SCHEMA,
  preparePurposeWorkspaceBoardMove,
  projectPurposeWorkspaceProject,
} from '../src/core/purpose-workspace-project.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const readJson = (relative) => JSON.parse(fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8'));
const projectRegistry = readJson('blueprint/project-continuity-registry.json');
const intentRegistry = readJson('blueprint/intent-orchestration-registry.json');

const PROJECT = 'project.vexlife.purpose-workspace.fixture';
const GRAPH = 'intent-workgraph.purpose-workspace.fixture';
const ROOT = 'intent.purpose-workspace.fixture';
const POINTER = '1'.repeat(64);
const GRAPH_FINGERPRINT = '2'.repeat(64);
const CREATED = '2026-10-20T05:30:00.000Z';

function card(workNodeRef, state, createdAt = CREATED) {
  return {
    graphRef: GRAPH,
    rootIntentRef: ROOT,
    workNodeRef,
    purpose: workNodeRef,
    state,
    priorityClass: 'NORMAL',
    roleRef: 'role.vex.coder',
    parentWorkNodeRef: null,
    dependencyRefs: [],
    childRefs: [],
    featureRefs: [],
    completionGateRefs: [],
    sourceRefs: ['source.fixture'],
    createdAt,
    lastTransitionRef: null,
    lastTransitionAt: null,
    currentReceiptRefs: [],
    assignment: null,
  };
}

function projectSnapshot() {
  const core = {
    schemaVersion: 'vexlife.project-continuity-snapshot/v1',
    state: 'CURRENT',
    currentness: 'CURRENT',
    projectRef: PROJECT,
    projectDefinitionFingerprint: '3'.repeat(64),
    graphBindings: [{
      graphRef: GRAPH,
      rootIntentRef: ROOT,
      semanticFingerprint: GRAPH_FINGERPRINT,
      validationState: 'PLAN_VALIDATED',
      validationSemanticHash: '4'.repeat(64),
      currentnessOwnerRef: 'owner.vexlife.intent-workgraph',
      currentnessSourceRef: 'source.vexlife.intent-workgraph.runtime-snapshot.001',
      currentPointerSha256: POINTER,
      payloadSha256: '5'.repeat(64),
      priorSemanticFingerprint: null,
      createdAt: CREATED,
    }],
    cards: [
      card('work.purpose.capture', 'CAPTURED'),
      card('work.purpose.running', 'RUNNING', '2026-10-20T05:31:00.000Z'),
    ],
    edges: [],
    sourceRefs: ['source.fixture'],
    effects: false,
    executionAuthority: 'NONE',
  };
  return { ...core, semanticFingerprint: semanticHash(core) };
}

function boardView() {
  return {
    schemaVersion: 'vexlife.project-view-definition/v1',
    viewRef: 'view.purpose-workspace.fixture.board',
    projectRef: PROJECT,
    label: 'Fixture Board',
    viewClass: 'BOARD',
    laneRefOrder: projectRegistry.boardLanes.map((lane) => lane.laneRef),
    sourceRefs: ['source.fixture'],
    formedAt: CREATED,
  };
}

function projection() {
  return projectPurposeWorkspaceProject({
    projectRegistry,
    intentRegistry,
    projectSnapshot: projectSnapshot(),
    boardView: boardView(),
  });
}

function workgraphEntry(state = 'RUNNING') {
  return {
    pointer: {
      pointerSha256: POINTER,
    },
    graph: {
      graphRef: GRAPH,
      semanticFingerprint: GRAPH_FINGERPRINT,
      nodes: [{
        workNodeRef: 'work.purpose.running',
        state,
      }],
    },
  };
}

test('B05 projects canonical Project Board + Graph without becoming a state owner', () => {
  const result = projection();
  assert.equal(result.schemaVersion, PURPOSE_WORKSPACE_PROJECT_PROJECTION_SCHEMA);
  assert.equal(result.state, 'CURRENT');
  assert.equal(result.effects, false);
  assert.equal(result.executionAuthority, 'NONE');
  assert.equal(result.planning.state, 'UNPLANNED');
  assert.equal(result.board.lanes.length, projectRegistry.boardLanes.length);
  assert.equal(result.graph.nodes.length, 2);
  const active = result.board.lanes.find((lane) => lane.laneRef === 'lane.project.active');
  assert.equal(active.cards[0].workNodeRef, 'work.purpose.running');
  assert.equal(active.cards[0].interaction.expectedWorkgraphPointerSha256, POINTER);
  assert.equal(active.cards[0].interaction.transitionAuthority, 'NO_EXECUTION_AUTHORITY');
});

test('pointer drop rejects an ambiguous lane rather than inventing hidden lifecycle state', () => {
  const current = projection();
  const capture = current.board.lanes
    .flatMap((lane) => lane.cards)
    .find((item) => item.workNodeRef === 'work.purpose.capture');
  const intake = capture.interaction.laneMoveAffordances.find((item) => item.laneRef === 'lane.project.intake');
  assert.equal(intake.disposition, 'AMBIGUOUS');
  assert.deepEqual(intake.candidateStates, ['DECOMPOSED', 'NEEDS_CLARIFICATION']);
  const result = preparePurposeWorkspaceBoardMove({
    projection: current,
    projectSnapshot: projectSnapshot(),
    workgraphEntry: workgraphEntry(),
    intentRegistry,
    workNodeRef: capture.workNodeRef,
    targetLaneRef: 'lane.project.intake',
    expectedProjectSnapshotFingerprint: current.projectSnapshotFingerprint,
    expectedState: capture.state,
  });
  assert.equal(result.state, 'AMBIGUOUS_REJECTED');
  assert.equal(result.reason, 'AMBIGUOUS_LANE_TARGET');
  assert.equal(result.effects, false);
});

test('unique lane drop resolves exact next state but remains held without trusted actor binding', () => {
  const current = projection();
  const running = current.board.lanes
    .flatMap((lane) => lane.cards)
    .find((item) => item.workNodeRef === 'work.purpose.running');
  const result = preparePurposeWorkspaceBoardMove({
    projection: current,
    projectSnapshot: projectSnapshot(),
    workgraphEntry: workgraphEntry(),
    intentRegistry,
    workNodeRef: running.workNodeRef,
    targetLaneRef: 'lane.project.verify',
    expectedProjectSnapshotFingerprint: current.projectSnapshotFingerprint,
    expectedState: running.state,
  });
  assert.equal(result.state, 'EXECUTION_HELD');
  assert.equal(result.reason, 'TRUSTED_ACTOR_BINDING_UNAVAILABLE');
  assert.deepEqual(result.selectedTransition, {
    workNodeRef: 'work.purpose.running',
    priorState: 'RUNNING',
    nextState: 'VERIFYING',
    targetLaneRef: 'lane.project.verify',
  });
  assert.equal(result.effects, false);
  assert.equal(result.executionAuthority, 'NONE');
});

test('keyboard exact-state move and pointer move share the same B03 request constructor', () => {
  const current = projection();
  const running = current.board.lanes
    .flatMap((lane) => lane.cards)
    .find((item) => item.workNodeRef === 'work.purpose.running');
  const result = preparePurposeWorkspaceBoardMove({
    projection: current,
    projectSnapshot: projectSnapshot(),
    workgraphEntry: workgraphEntry(),
    intentRegistry,
    workNodeRef: running.workNodeRef,
    targetLaneRef: 'lane.project.verify',
    targetStateOrNull: 'VERIFYING',
    expectedProjectSnapshotFingerprint: current.projectSnapshotFingerprint,
    expectedState: running.state,
    actorBinding: {
      actorRef: 'person.vexlife.owner',
      actorRoleRef: 'role.vex.operations',
      processRef: 'process.vexlife.intent.capture',
      sourceRefs: ['source.fixture.actor-binding'],
    },
    reason: 'Synthetic exact-state move',
    requestedAt: '2026-10-20T05:32:00.000Z',
    requestRef: 'request.purpose-workspace.fixture.move',
    transitionRef: 'transition.purpose-workspace.fixture.move',
    instanceRef: 'instance.purpose-workspace.fixture.move',
  });
  assert.equal(result.state, 'REQUEST_VALIDATED');
  assert.equal(result.transitionValidationState, 'VALID');
  assert.equal(result.request.nextState, 'VERIFYING');
  assert.equal(result.transition.nextState, 'VERIFYING');
  assert.equal(result.effects, false);
  assert.equal(result.executionAuthority, 'NONE');
});

test('stale browser move rejects and returns the fresh authoritative projection for snap-back', () => {
  const current = projection();
  const result = preparePurposeWorkspaceBoardMove({
    projection: current,
    projectSnapshot: projectSnapshot(),
    workgraphEntry: workgraphEntry(),
    intentRegistry,
    workNodeRef: 'work.purpose.running',
    targetLaneRef: 'lane.project.verify',
    expectedProjectSnapshotFingerprint: '9'.repeat(64),
    expectedState: 'RUNNING',
  });
  assert.equal(result.state, 'STALE_REJECTED');
  assert.equal(result.reason, 'AUTHORITATIVE_PROJECT_CHANGED');
  assert.equal(result.authoritativeProjection.semanticFingerprint, current.semanticFingerprint);
  assert.equal(result.effects, false);
});

// [VXG RealForever]
