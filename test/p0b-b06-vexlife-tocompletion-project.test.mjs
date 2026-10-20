import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadBlueprint } from '../src/core/blueprint.mjs';
import {
  compileProjectContinuity,
  formLaneFocusCard,
  projectProjectBoard,
  projectProjectGraph,
} from '../src/core/project-continuity.mjs';
import {
  persistIntentWorkgraphRuntimeSnapshot,
  readIntentWorkgraphRuntimeSnapshotEntries,
} from '../src/core/intent-workgraph-runtime-snapshot.mjs';
import { validateIntentWorkgraph } from '../src/core/intent-validation.mjs';
import {
  VEXLIFE_TOCOMPLETION_PROJECT_REF,
  VEXLIFE_TOCOMPLETION_WORK_REFS,
  formVexLifeToCompletionWorkgraph,
} from '../src/core/vexlife-tocompletion-project.mjs';
import { createSourceManagedPurposeWorkspaceProjectResolver } from '../scripts/serve-browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceBundle = loadBlueprint(root);
const intentRegistry = sourceBundle.intentRegistry;
const trustSnapshot = JSON.parse(fs.readFileSync(path.join(root, 'blueprint/intent-trust-snapshot.json'), 'utf8'));
const projectRegistry = JSON.parse(fs.readFileSync(path.join(root, 'blueprint/project-continuity-registry.json'), 'utf8'));
const project = JSON.parse(fs.readFileSync(path.join(root, 'blueprint/projects/vexlife-tocompletion.project.json'), 'utf8'));
const boardView = JSON.parse(fs.readFileSync(path.join(root, 'blueprint/projects/vexlife-tocompletion.board.view.json'), 'utf8'));

function validationContext() {
  return {
    registeredProcessRefs: sourceBundle.factory.processes.map((item) => item.processRef),
    registeredRoleRefs: sourceBundle.blueprint.roles.map((item) => item.roleRef),
    trustSnapshot,
  };
}

function validatedGraph() {
  const graph = formVexLifeToCompletionWorkgraph({ intentRegistry });
  const validation = validateIntentWorkgraph(graph, {
    registry: intentRegistry,
    ...validationContext(),
  });
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  return graph;
}

function compile(home) {
  return compileProjectContinuity({
    registry: projectRegistry,
    intentRegistry,
    project,
    workgraphEntries: readIntentWorkgraphRuntimeSnapshotEntries({ home }),
    intentValidationContext: validationContext(),
    registeredFeatureRefs: sourceBundle.featureRegistry.features.map((item) => item.featureRef),
  });
}

test('B06 source-managed ToCompletion Workgraph begins at the real unfinished edge', () => {
  const graph = validatedGraph();
  assert.equal(graph.intent.projectRef, VEXLIFE_TOCOMPLETION_PROJECT_REF);
  assert.equal(graph.nodes.length, 10);
  const state = (workNodeRef) => graph.nodes.find((item) => item.workNodeRef === workNodeRef)?.state;
  assert.equal(state(VEXLIFE_TOCOMPLETION_WORK_REFS.foreground), 'RUNNING');
  assert.equal(state(VEXLIFE_TOCOMPLETION_WORK_REFS.b06), 'RUNNING');
  for (const ref of [
    VEXLIFE_TOCOMPLETION_WORK_REFS.p1,
    VEXLIFE_TOCOMPLETION_WORK_REFS.p2,
    VEXLIFE_TOCOMPLETION_WORK_REFS.p3,
    VEXLIFE_TOCOMPLETION_WORK_REFS.p4,
    VEXLIFE_TOCOMPLETION_WORK_REFS.p5,
    VEXLIFE_TOCOMPLETION_WORK_REFS.p6,
    VEXLIFE_TOCOMPLETION_WORK_REFS.p7,
    VEXLIFE_TOCOMPLETION_WORK_REFS.proofHardening,
  ]) assert.equal(state(ref), 'WAITING_DEPENDENCIES');
});

test('B06 persists current Workgraph and dogfoods Board, Graph and Lane Focus projections', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-tocompletion-b06-'));
  try {
    const graph = validatedGraph();
    const persisted = persistIntentWorkgraphRuntimeSnapshot({
      home,
      graph,
      instanceRef: 'instance.test.vexlife.tocompletion.b06',
      observedAt: '2026-10-20T07:10:00.000Z',
    });
    assert.equal(persisted.state, 'CURRENT');
    assert.equal(persisted.changed, true);

    const snapshot = compile(home);
    const board = projectProjectBoard({ registry: projectRegistry, snapshot, view: boardView });
    const graphProjection = projectProjectGraph(snapshot);
    const focus = formLaneFocusCard({
      snapshot,
      workNodeRef: VEXLIFE_TOCOMPLETION_WORK_REFS.b06,
      intentRegistry,
    });

    const active = board.lanes.find((lane) => lane.laneRef === 'lane.project.active');
    const planned = board.lanes.find((lane) => lane.laneRef === 'lane.project.planned');
    assert.deepEqual(
      active.cards.map((item) => item.workNodeRef).sort(),
      [VEXLIFE_TOCOMPLETION_WORK_REFS.foreground, VEXLIFE_TOCOMPLETION_WORK_REFS.b06].sort(),
    );
    assert.equal(planned.cards.length, 8);
    assert.equal(graphProjection.nodes.length, 10);
    assert.equal(focus.workNode.workNodeRef, VEXLIFE_TOCOMPLETION_WORK_REFS.b06);
    assert.equal(focus.relationships.parentWorkNodeRef, VEXLIFE_TOCOMPLETION_WORK_REFS.foreground);
    assert.equal(focus.possibleLifecycleTransitions.includes('VERIFYING'), true);
    assert.equal(focus.transitionAuthority, 'NO_EXECUTION_AUTHORITY');
    assert.equal(board.effects, false);
    assert.equal(graphProjection.effects, false);
    assert.equal(focus.effects, false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('Purpose Workspace production resolver is held before import and CURRENT after exact B06 import', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-tocompletion-browser-b06-'));
  try {
    const resolveProject = createSourceManagedPurposeWorkspaceProjectResolver(home);
    const held = await resolveProject(VEXLIFE_TOCOMPLETION_PROJECT_REF);
    assert.equal(held.state, 'HELD_UNAVAILABLE');
    assert.equal(held.reason, 'CURRENT_WORKGRAPH_UNAVAILABLE');

    persistIntentWorkgraphRuntimeSnapshot({
      home,
      graph: validatedGraph(),
      instanceRef: 'instance.test.vexlife.tocompletion.browser-b06',
      observedAt: '2026-10-20T07:11:00.000Z',
    });
    const current = await resolveProject(VEXLIFE_TOCOMPLETION_PROJECT_REF);
    assert.equal(current.state, 'CURRENT');
    assert.equal(current.currentness, 'CURRENT');
    assert.equal(current.projectRef, VEXLIFE_TOCOMPLETION_PROJECT_REF);
    assert.equal(current.effects, false);
    assert.equal(current.executionAuthority, 'NONE');
    const cards = current.board.lanes.flatMap((lane) => lane.cards);
    assert.equal(cards.some((item) => item.workNodeRef === VEXLIFE_TOCOMPLETION_WORK_REFS.b06), true);
    assert.equal(cards.some((item) => item.workNodeRef === VEXLIFE_TOCOMPLETION_WORK_REFS.p1), true);

    const unknown = await resolveProject('project.vexlife.unregistered');
    assert.equal(unknown.state, 'HELD_UNAVAILABLE');
    assert.equal(unknown.reason, 'PROJECT_SOURCE_NOT_REGISTERED');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('EndToEnd and QuantumTest hardening is dependency-linked but does not gate the core path', () => {
  const graph = validatedGraph();
  const hardening = graph.nodes.find((item) => item.workNodeRef === VEXLIFE_TOCOMPLETION_WORK_REFS.proofHardening);
  assert.deepEqual(hardening.dependencyRefs, [VEXLIFE_TOCOMPLETION_WORK_REFS.p3]);
  assert.equal(hardening.parentWorkNodeRef, null);
  const foreground = graph.nodes.find((item) => item.workNodeRef === VEXLIFE_TOCOMPLETION_WORK_REFS.foreground);
  assert.equal(foreground.childRefs.includes(VEXLIFE_TOCOMPLETION_WORK_REFS.proofHardening), false);
  assert.equal(
    graph.nodes.some((item) => item.dependencyRefs.includes(VEXLIFE_TOCOMPLETION_WORK_REFS.proofHardening)),
    false,
  );
});

test('B06 import is idempotent for the same exact source-managed Workgraph', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-tocompletion-idempotent-b06-'));
  try {
    const graph = validatedGraph();
    const first = persistIntentWorkgraphRuntimeSnapshot({
      home,
      graph,
      instanceRef: 'instance.test.vexlife.tocompletion.idempotent-1',
      observedAt: '2026-10-20T07:12:00.000Z',
    });
    const second = persistIntentWorkgraphRuntimeSnapshot({
      home,
      graph,
      instanceRef: 'instance.test.vexlife.tocompletion.idempotent-2',
      observedAt: '2026-10-20T07:12:01.000Z',
    });
    assert.equal(first.changed, true);
    assert.equal(second.changed, false);
    assert.equal(second.pointer.pointerSha256, first.pointer.pointerSha256);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

// [VXG RealForever]
