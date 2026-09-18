import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPublicLearningNavigationRequestBoundary,
  PUBLIC_LEARNING_NAVIGATION_REQUEST_SCHEMA
} from '../reference/browser/modules/public-learning-navigation-request.js';

test('S7NC-REQUEST-00 request-time frame identity is captured before queued work can advance presence', async () => {
  let frameRef = 'frame.public-learning.request.one';
  let queueTail = Promise.resolve();
  const calls = [];
  const continuity = {
    currentFrame: () => ({ frameRef }),
    navigateTo: (targetRef, options) => {
      calls.push({ targetRef, options: { ...options } });
      const execution = queueTail.then(() => {
        if (options.expectedFrameRef !== frameRef) {
          return { outcomeRef: 'outcome.navigation.blocked-stale-frame' };
        }
        frameRef = 'frame.public-learning.request.two';
        return { outcomeRef: 'outcome.navigation.committed' };
      });
      queueTail = execution.catch(() => undefined);
      return execution;
    }
  };
  const boundary = createPublicLearningNavigationRequestBoundary({ continuity });
  const first = boundary.request('module.public-learning.request.first');
  const second = boundary.request('module.public-learning.request.second');

  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.expectedFrameRef, 'frame.public-learning.request.one');
  assert.equal(calls[1].options.expectedFrameRef, 'frame.public-learning.request.one');

  const [firstReceipt, secondReceipt] = await Promise.all([first, second]);
  assert.equal(firstReceipt.schemaVersion, PUBLIC_LEARNING_NAVIGATION_REQUEST_SCHEMA);
  assert.equal(firstReceipt.state, 'SETTLED');
  assert.equal(firstReceipt.result.outcomeRef, 'outcome.navigation.committed');
  assert.equal(secondReceipt.state, 'SETTLED');
  assert.equal(secondReceipt.result.outcomeRef, 'outcome.navigation.blocked-stale-frame');
  assert.equal(frameRef, 'frame.public-learning.request.two');
});

test('S7NC-REQUEST-01 synchronous request failures are consumed into a held receipt', async () => {
  const boundary = createPublicLearningNavigationRequestBoundary({
    continuity: {
      currentFrame: () => ({ frameRef: 'frame.public-learning.request.sync' }),
      navigateTo: () => { const error = new Error('sync failure'); error.code = 'SYNC_FAILURE'; throw error; }
    }
  });
  const receipt = await boundary.request('module.public-learning.request.sync');
  assert.equal(receipt.state, 'HELD_EXCEPTION');
  assert.equal(receipt.errorCode, 'SYNC_FAILURE');
  assert.equal(receipt.result, null);
});

test('S7NC-REQUEST-02 asynchronous request failures are consumed before fire-and-forget callers can leak rejection', async () => {
  const boundary = createPublicLearningNavigationRequestBoundary({
    continuity: {
      currentFrame: () => ({ frameRef: 'frame.public-learning.request.async' }),
      navigateTo: () => Promise.reject(Object.assign(new Error('async failure'), { code: 'ASYNC_FAILURE' }))
    }
  });
  const receipt = await boundary.request('module.public-learning.request.async');
  assert.equal(receipt.state, 'HELD_EXCEPTION');
  assert.equal(receipt.errorCode, 'ASYNC_FAILURE');
  assert.equal(receipt.result, null);
});

// [VXG RealForever]
