import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createLiveWorkspaceObservationConvergence,
  createLocalSourceLiveWorkspaceConvergence
} from '../src/core/live-workspace-observation.mjs';
import { runBoundedGit } from '../src/core/repository-evidence.mjs';

function liveWorkspaceFixtureRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-live-workspace-adapter-'));
  const identityEnv = {
    GIT_AUTHOR_NAME: 'VexLife Live Workspace Test',
    GIT_AUTHOR_EMAIL: 'vexlife-live-workspace@example.invalid',
    GIT_COMMITTER_NAME: 'VexLife Live Workspace Test',
    GIT_COMMITTER_EMAIL: 'vexlife-live-workspace@example.invalid'
  };
  const git = (args) => runBoundedGit(root, args, {
    label: `Live Workspace fixture git ${args.join(' ')}`,
    env: identityEnv
  }).stdout.trim();

  git(['init']);
  git(['branch', '-M', 'main']);
  fs.writeFileSync(path.join(root, '.gitignore'), 'ambient.tmp\n', 'utf8');
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'baseline\n', 'utf8');
  git(['add', '--', '.gitignore', 'tracked.txt']);
  git(['commit', '-m', 'fixture baseline']);
  return root;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('Live Workspace publishes only semantic truth changes and preserves last-known-good on failure', async () => {
  let current = { head: 'a', worktreeFingerprint: 'truth-a' };
  let failure = null;
  const convergence = createLiveWorkspaceObservationConvergence({
    async observeTruth() {
      if (failure) throw failure;
      return current;
    }
  });

  const initial = convergence.snapshot();
  assert.equal(initial.state, 'HELD_UNAVAILABLE');
  assert.equal(initial.currentness, 'UNKNOWN');
  assert.equal(initial.revision, 0);
  assert.equal(initial.effects, false);
  assert.equal(initial.executionAuthority, 'NONE');

  const first = await convergence.observe({ hintRef: 'hint.workspace.start' });
  assert.equal(first.state, 'PUBLISHED');
  assert.equal(first.published, true);
  assert.equal(first.snapshot.state, 'CURRENT');
  assert.equal(first.snapshot.revision, 1);
  assert.deepEqual(first.snapshot.observation, current);

  const noOp = await convergence.observe({ hintRef: 'hint.workspace.fs-event' });
  assert.equal(noOp.state, 'SEMANTIC_NO_OP');
  assert.equal(noOp.published, false);
  assert.equal(noOp.snapshot.revision, 1);
  assert.equal(noOp.snapshot.hintRef, 'hint.workspace.fs-event');

  current = { head: 'b', worktreeFingerprint: 'truth-b' };
  const changed = await convergence.observe({ hintRef: 'hint.workspace.git-event' });
  assert.equal(changed.state, 'PUBLISHED');
  assert.equal(changed.snapshot.revision, 2);
  assert.deepEqual(changed.snapshot.observation, current);

  failure = Object.assign(new Error('temporary observation failure'), { code: 'SOURCE_TRUTH_OBSERVATION_FAILED' });
  const held = await convergence.observe({ hintRef: 'hint.workspace.fs-event' });
  assert.equal(held.state, 'HELD');
  assert.equal(held.snapshot.state, 'HELD_LAST_KNOWN_GOOD');
  assert.equal(held.snapshot.currentness, 'UNKNOWN');
  assert.equal(held.snapshot.revision, 2);
  assert.equal(held.snapshot.failureCode, 'SOURCE_TRUTH_OBSERVATION_FAILED');
  assert.equal(held.snapshot.observation, null);
  assert.deepEqual(held.snapshot.lastKnownGood.observation, current);

  failure = null;
  const recovered = await convergence.observe({ hintRef: 'hint.workspace.recover' });
  assert.equal(recovered.state, 'SEMANTIC_NO_OP');
  assert.equal(recovered.snapshot.state, 'CURRENT');
  assert.equal(recovered.snapshot.currentness, 'CURRENT');
  assert.equal(recovered.snapshot.revision, 2);
});

test('Live Workspace treats change hints as re-observation triggers, not truth', async () => {
  const truth = { head: 'same', worktreeFingerprint: 'same-bytes' };
  const convergence = createLiveWorkspaceObservationConvergence({
    async observeTruth() {
      return truth;
    }
  });

  const first = await convergence.observe({ hintRef: 'hint.workspace.fs-event' });
  const second = await convergence.observe({ hintRef: 'hint.workspace.git-event' });

  assert.equal(first.state, 'PUBLISHED');
  assert.equal(second.state, 'SEMANTIC_NO_OP');
  assert.equal(second.snapshot.revision, 1);
  assert.deepEqual(second.snapshot.observation, truth);
  assert.equal(second.snapshot.hintRef, 'hint.workspace.git-event');
});

test('Live Workspace drops stale slower observations after a newer request owns publication', async () => {
  const firstObservation = deferred();
  const secondObservation = deferred();
  let calls = 0;
  const convergence = createLiveWorkspaceObservationConvergence({
    observeTruth() {
      calls += 1;
      return calls === 1 ? firstObservation.promise : secondObservation.promise;
    }
  });

  const older = convergence.observe({ hintRef: 'hint.workspace.first' });
  const newer = convergence.observe({ hintRef: 'hint.workspace.second' });

  secondObservation.resolve({ head: 'newer', worktreeFingerprint: 'newer-bytes' });
  const newerResult = await newer;
  assert.equal(newerResult.state, 'PUBLISHED');
  assert.equal(newerResult.snapshot.revision, 1);
  assert.equal(newerResult.snapshot.observation.head, 'newer');

  firstObservation.resolve({ head: 'older', worktreeFingerprint: 'older-bytes' });
  const olderResult = await older;
  assert.equal(olderResult.state, 'STALE_RESULT_DROPPED');
  assert.equal(olderResult.published, false);
  assert.equal(convergence.snapshot().revision, 1);
  assert.equal(convergence.snapshot().observation.head, 'newer');
});


test('Local-source Live Workspace adapter turns exact changed bytes into convergence revisions', async () => {
  const root = liveWorkspaceFixtureRepository();
  try {
    const convergence = createLocalSourceLiveWorkspaceConvergence({
      sourceRoot: root,
      environment: {}
    });

    const initial = await convergence.observe({ hintRef: 'hint.workspace.start' });
    assert.equal(initial.state, 'PUBLISHED');
    assert.equal(initial.snapshot.revision, 1);
    assert.equal(initial.snapshot.observation.truthClass, 'SOURCE_BOUND_LOCAL_SOURCE_OBSERVATION');

    fs.writeFileSync(path.join(root, 'tracked.txt'), 'alpha\n', 'utf8');
    const alpha = await convergence.observe({ hintRef: 'hint.workspace.fs-event' });
    assert.equal(alpha.state, 'PUBLISHED');
    assert.equal(alpha.snapshot.revision, 2);
    assert.deepEqual(alpha.snapshot.observation.changes.observedPaths, ['tracked.txt']);

    fs.writeFileSync(path.join(root, 'tracked.txt'), 'bravo\n', 'utf8');
    const bravo = await convergence.observe({ hintRef: 'hint.workspace.fs-event' });
    assert.equal(bravo.state, 'PUBLISHED');
    assert.equal(bravo.snapshot.revision, 3);
    assert.deepEqual(bravo.snapshot.observation.changes.observedPaths, ['tracked.txt']);
    assert.notEqual(
      bravo.snapshot.observation.worktree.recordsSha256,
      alpha.snapshot.observation.worktree.recordsSha256
    );

    fs.writeFileSync(path.join(root, 'ambient.tmp'), 'ignored\n', 'utf8');
    const ignored = await convergence.observe({ hintRef: 'hint.workspace.fs-event' });
    assert.equal(ignored.state, 'SEMANTIC_NO_OP');
    assert.equal(ignored.snapshot.revision, 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Local-source Live Workspace adapter preserves last-known-good when exact observation fails closed', async () => {
  const root = liveWorkspaceFixtureRepository();
  try {
    const convergence = createLocalSourceLiveWorkspaceConvergence({
      sourceRoot: root,
      environment: {},
      observationOptions: { maxChangedPaths: 1 }
    });

    const initial = await convergence.observe({ hintRef: 'hint.workspace.start' });
    assert.equal(initial.state, 'PUBLISHED');
    assert.equal(initial.snapshot.revision, 1);

    fs.writeFileSync(path.join(root, 'one.txt'), 'one\n', 'utf8');
    fs.writeFileSync(path.join(root, 'two.txt'), 'two\n', 'utf8');
    const held = await convergence.observe({ hintRef: 'hint.workspace.fs-event' });

    assert.equal(held.state, 'HELD');
    assert.equal(held.snapshot.state, 'HELD_LAST_KNOWN_GOOD');
    assert.equal(held.snapshot.currentness, 'UNKNOWN');
    assert.equal(held.snapshot.revision, 1);
    assert.equal(held.snapshot.failureCode, 'LOCAL_SOURCE_OBSERVATION_PATH_LIMIT');
    assert.equal(held.snapshot.observation, null);
    assert.equal(
      held.snapshot.lastKnownGood.observation.truthClass,
      'SOURCE_BOUND_LOCAL_SOURCE_OBSERVATION'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// [VXG RealForever]
