import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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

function materializeValidHomeIdentity(home, suffix) {
  const deviceRef = `device.test.tocompletion.${suffix}`;
  const companionLineageRef = `companion-lineage.test.tocompletion.${suffix}`;
  fs.mkdirSync(path.join(home, 'config'), { recursive: true });
  fs.mkdirSync(path.join(home, 'devices'), { recursive: true });
  fs.writeFileSync(path.join(home, 'config', 'home.json'), `${JSON.stringify({
    schemaVersion: 'vexlife.home/v0',
    homeRef: `home.test.tocompletion.${suffix}`,
    currentDeviceRef: deviceRef,
    currentCompanionLineageRef: companionLineageRef,
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(home, 'devices', `${deviceRef}.json`), `${JSON.stringify({
    deviceRef,
    companionLineageRef,
    personRef: `person.test.tocompletion.${suffix}`,
    createdAt: '2026-10-20T07:12:00.000Z',
  }, null, 2)}\n`);
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

test('accepted B06 is settled and P1 is the real source-managed foreground edge', () => {
  const graph = validatedGraph();
  assert.equal(graph.intent.projectRef, VEXLIFE_TOCOMPLETION_PROJECT_REF);
  assert.equal(graph.nodes.length, 10);
  const state = (workNodeRef) => graph.nodes.find((item) => item.workNodeRef === workNodeRef)?.state;
  assert.equal(state(VEXLIFE_TOCOMPLETION_WORK_REFS.foreground), 'RUNNING');
  assert.equal(state(VEXLIFE_TOCOMPLETION_WORK_REFS.b06), 'CONVERGED');
  assert.equal(state(VEXLIFE_TOCOMPLETION_WORK_REFS.p1), 'RUNNING');
  for (const ref of [VEXLIFE_TOCOMPLETION_WORK_REFS.p2,VEXLIFE_TOCOMPLETION_WORK_REFS.p3,VEXLIFE_TOCOMPLETION_WORK_REFS.p4,VEXLIFE_TOCOMPLETION_WORK_REFS.p5,VEXLIFE_TOCOMPLETION_WORK_REFS.p6,VEXLIFE_TOCOMPLETION_WORK_REFS.p7,VEXLIFE_TOCOMPLETION_WORK_REFS.proofHardening]) assert.equal(state(ref), 'WAITING_DEPENDENCIES');
  const b06 = graph.nodes.find((item) => item.workNodeRef === VEXLIFE_TOCOMPLETION_WORK_REFS.b06);
  const p1 = graph.nodes.find((item) => item.workNodeRef === VEXLIFE_TOCOMPLETION_WORK_REFS.p1);
  assert.equal(b06.sourceRefs.includes('github.pull.vexlife.912'), true);
  assert.equal(b06.sourceRefs.includes('git.vexlife.merge.28a1c6438fd59c4e129c3aa0050b61b05c0aea62'), true);
  assert.equal(p1.sourceRefs.includes('github.issue.vexlife.857.comment.6289035585'), true);
  assert.equal(p1.sourceRefs.includes('github.issue.vexlife.857.comment.6289157446'), true);
  const b06Receipt = graph.receipts.find((item) => item.workNodeRef === VEXLIFE_TOCOMPLETION_WORK_REFS.b06 && item.currentness === 'CURRENT');
  assert.equal(b06Receipt?.state, 'PROVEN');
  assert.equal(b06Receipt?.disposition, 'CONVERGED');
  assert.equal(b06Receipt?.sourceState, 'CONVERGED');
  assert.equal(b06Receipt?.expectedTransitionRef, b06.expectedTransitionRef);
  assert.equal(b06Receipt?.nodeSemanticFingerprint, b06.semanticFingerprint);
  assert.equal(b06Receipt?.sourceRefs.includes('github.pull.vexlife.912.comment.6287346947'), true);
  assert.equal(b06Receipt?.sourceHashes.includes('661a1df09e8a4a23fb0017df1829c928c759dd6c578923480ac66f18c59e9e5a'), true);
  assert.deepEqual(project.sourceRefs, ['github.issue.vexlife.866','github.pull.vexlife.912','git.vexlife.merge.28a1c6438fd59c4e129c3aa0050b61b05c0aea62']);
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
      workNodeRef: VEXLIFE_TOCOMPLETION_WORK_REFS.p1,
      intentRegistry,
    });

    const active = board.lanes.find((lane) => lane.laneRef === 'lane.project.active');
    const planned = board.lanes.find((lane) => lane.laneRef === 'lane.project.planned');
    const done = board.lanes.find((lane) => lane.laneRef === 'lane.project.done');
    assert.deepEqual(active.cards.map((item) => item.workNodeRef).sort(), [VEXLIFE_TOCOMPLETION_WORK_REFS.foreground, VEXLIFE_TOCOMPLETION_WORK_REFS.p1].sort());
    assert.equal(planned.cards.length, 7);
    assert.deepEqual(done.cards.map((item) => item.workNodeRef), [VEXLIFE_TOCOMPLETION_WORK_REFS.b06]);
    assert.equal(graphProjection.nodes.length, 10);
    assert.equal(focus.workNode.workNodeRef, VEXLIFE_TOCOMPLETION_WORK_REFS.p1);
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

test('B06 import CLI rejects an arbitrary directory and admits one canonical Vex Home identity', () => {
  const invalidHome = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-tocompletion-invalid-home-b06-'));
  const validHome = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-tocompletion-valid-home-b06-'));
  try {
    const invalid = spawnSync(process.execPath, [
      path.join(root, 'scripts/vexlife-tocompletion-project.mjs'),
      '--home',
      invalidHome,
    ], { encoding: 'utf8' });
    assert.notEqual(invalid.status, 0);
    assert.match(`${invalid.stderr}\n${invalid.stdout}`, /Vex Home identity|COMPANION_HOME_IDENTITY_INVALID|ENOENT/u);
    assert.equal(fs.existsSync(path.join(invalidHome, 'runtime', 'intent-workgraph')), false);

    materializeValidHomeIdentity(validHome, 'cli');
    const admitted = spawnSync(process.execPath, [
      path.join(root, 'scripts/vexlife-tocompletion-project.mjs'),
      '--home',
      validHome,
    ], { encoding: 'utf8' });
    assert.equal(admitted.status, 0, `${admitted.stderr}\n${admitted.stdout}`);
    const result = JSON.parse(admitted.stdout);
    assert.equal(result.state, 'CURRENT');
    assert.equal(result.projectRef, VEXLIFE_TOCOMPLETION_PROJECT_REF);
    assert.equal(result.effects.homeMutationPerformed, true);
    assert.equal(result.effects.providerMutationPerformed, false);
    assert.equal(result.effects.sourceMutationPerformed, false);
  } finally {
    fs.rmSync(invalidHome, { recursive: true, force: true });
    fs.rmSync(validHome, { recursive: true, force: true });
  }
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
