const REQUEST_SCHEMA = 'vexlife.public-learning-navigation-request-receipt/v1';
const stablePart = (value) => String(value).replace(/[^A-Za-z0-9._:/#-]/gu, '-');

function heldReceipt({ targetRef, expectedFrameRef, commandRef, sourceRef, direction, error }) {
  return Object.freeze({
    schemaVersion: REQUEST_SCHEMA,
    state: 'HELD_EXCEPTION',
    targetRef,
    expectedFrameRef,
    commandRef,
    sourceRef,
    direction: direction ?? null,
    result: null,
    errorCode: error?.code ?? error?.name ?? 'NAVIGATION_REQUEST_EXCEPTION',
    errorMessage: error?.message ?? String(error)
  });
}

export function createPublicLearningNavigationRequestBoundary({
  continuity,
  defaultSourceRef = 'source.public-learning.request'
}) {
  if (!continuity || typeof continuity.currentFrame !== 'function' || typeof continuity.navigateTo !== 'function') {
    throw new Error('public learning Navigation Continuity request boundary requires a continuity session');
  }
  let sequence = 0;

  function request(targetRef, { sourceRef = defaultSourceRef, direction = null } = {}) {
    sequence += 1;
    const expectedFrameRef = continuity.currentFrame().frameRef;
    const commandRef = `command.public-learning.request.${sequence}.${stablePart(targetRef)}`;
    let execution;
    try {
      execution = continuity.navigateTo(targetRef, {
        expectedFrameRef,
        commandRef,
        goalRef: `goal.public-learning.navigate.${stablePart(targetRef)}`
      });
    } catch (error) {
      return Promise.resolve(heldReceipt({
        targetRef,
        expectedFrameRef,
        commandRef,
        sourceRef,
        direction,
        error
      }));
    }
    return Promise.resolve(execution)
      .then((result) => Object.freeze({
        schemaVersion: REQUEST_SCHEMA,
        state: 'SETTLED',
        targetRef,
        expectedFrameRef,
        commandRef,
        sourceRef,
        direction: direction ?? null,
        result,
        errorCode: null,
        errorMessage: null
      }))
      .catch((error) => heldReceipt({
        targetRef,
        expectedFrameRef,
        commandRef,
        sourceRef,
        direction,
        error
      }));
  }

  return Object.freeze({ request });
}

export const PUBLIC_LEARNING_NAVIGATION_REQUEST_SCHEMA = REQUEST_SCHEMA;

// [VXG RealForever]
