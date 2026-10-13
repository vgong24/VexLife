import assert from 'node:assert/strict';
import test from 'node:test';

import { createLiveWorkspaceObservationConvergence } from '../src/core/live-workspace-observation.mjs';

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

// [VXG RealForever]
