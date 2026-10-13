import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLiveWorkspaceObservationConvergence,
  createRepositoryLiveWorkspaceTruthObserver,
  projectRepositoryLiveWorkspaceTruth
} from '../src/core/live-workspace-observation.mjs';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('Live Workspace projects Repository Evidence without becoming a second Git truth owner', async () => {
  const evidence = {
    repository: {
      slug: 'vgong24/VexLife',
      remoteUrl: 'git@github.com:vgong24/VexLife.git'
    },
    git: {
      checkoutSha: 'a'.repeat(40),
      branch: 'main',
      branchSource: 'GIT_WORKTREE',
      checkoutKind: 'BRANCH',
      candidateHeadSha: 'a'.repeat(40),
      candidateTreeSha: 'b'.repeat(40),
      testedMergeSha: null,
      baseSha: 'a'.repeat(40),
      upstreamRef: 'origin/main',
      upstreamSha: 'a'.repeat(40),
      ahead: 0,
      behind: 0,
      workingTree: 'CLEAN',
      changedPaths: 0
    }
  };

  const projected = projectRepositoryLiveWorkspaceTruth(evidence);
  assert.equal(projected.repository.slug, 'vgong24/VexLife');
  assert.equal(projected.git.candidateHeadSha, 'a'.repeat(40));
  assert.equal(projected.effects, false);
  assert.equal(projected.executionAuthority, 'NONE');
  assert.match(projected.semanticFingerprint, /^[0-9a-f]{64}$/u);

  const observe = createRepositoryLiveWorkspaceTruthObserver({
    root: '/source',
    environment: {},
    evidenceCollector(root, environment) {
      assert.equal(root, '/source');
      assert.deepEqual(environment, {});
      return evidence;
    }
  });
  assert.deepEqual(await observe(), projected);
});

test('Live Workspace publishes only semantic changes and preserves last-known-good on failure', async () => {
  let current = { head: 'a', workingTree: 'CLEAN' };
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

  current = { head: 'b', workingTree: 'DIRTY' };
  const changed = await convergence.observe({ hintRef: 'hint.workspace.git-event' });
  assert.equal(changed.state, 'PUBLISHED');
  assert.equal(changed.snapshot.revision, 2);
  assert.deepEqual(changed.snapshot.observation, current);

  failure = Object.assign(new Error('temporary observation failure'), { code: 'REPOSITORY_OBSERVATION_FAILED' });
  const held = await convergence.observe({ hintRef: 'hint.workspace.fs-event' });
  assert.equal(held.state, 'HELD');
  assert.equal(held.snapshot.state, 'HELD_LAST_KNOWN_GOOD');
  assert.equal(held.snapshot.currentness, 'UNKNOWN');
  assert.equal(held.snapshot.revision, 2);
  assert.equal(held.snapshot.failureCode, 'REPOSITORY_OBSERVATION_FAILED');
  assert.equal(held.snapshot.observation, null);
  assert.deepEqual(held.snapshot.lastKnownGood.observation, current);

  failure = null;
  const recovered = await convergence.observe({ hintRef: 'hint.workspace.recover' });
  assert.equal(recovered.state, 'SEMANTIC_NO_OP');
  assert.equal(recovered.snapshot.state, 'CURRENT');
  assert.equal(recovered.snapshot.currentness, 'CURRENT');
  assert.equal(recovered.snapshot.revision, 2);
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

  secondObservation.resolve({ head: 'newer', workingTree: 'CLEAN' });
  const newerResult = await newer;
  assert.equal(newerResult.state, 'PUBLISHED');
  assert.equal(newerResult.snapshot.revision, 1);
  assert.equal(newerResult.snapshot.observation.head, 'newer');

  firstObservation.resolve({ head: 'older', workingTree: 'DIRTY' });
  const olderResult = await older;
  assert.equal(olderResult.state, 'STALE_RESULT_DROPPED');
  assert.equal(olderResult.published, false);
  assert.equal(convergence.snapshot().revision, 1);
  assert.equal(convergence.snapshot().observation.head, 'newer');
});

// [VXG RealForever]
