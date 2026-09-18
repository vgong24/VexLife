const BRIDGE_SCHEMA = 'vexlife.public-learning-navigation-bridge-receipt/v1';
let requestHandler = null;

function heldReceipt(request, error = null) {
  return Object.freeze({
    schemaVersion: BRIDGE_SCHEMA,
    state: 'HELD_UNBOUND_OR_EXCEPTION',
    targetRef: request?.targetRef ?? null,
    direction: request?.direction ?? null,
    sourceRef: request?.sourceRef ?? null,
    result: null,
    errorCode: error?.code ?? error?.name ?? (requestHandler ? 'NAVIGATION_BRIDGE_EXCEPTION' : 'NAVIGATION_BRIDGE_UNBOUND'),
    errorMessage: error?.message ?? (requestHandler ? 'public learning navigation bridge request failed' : 'public learning navigation bridge is not bound')
  });
}

export function bindPublicLearningNavigationBridge(handler) {
  if (typeof handler !== 'function') throw new Error('public learning navigation bridge handler must be a function');
  if (requestHandler !== null) throw new Error('public learning navigation bridge is already bound');
  requestHandler = handler;
  return Object.freeze({ schemaVersion: BRIDGE_SCHEMA, state: 'BOUND' });
}

export function requestPublicLearningNavigation(request) {
  const normalized = Object.freeze({
    targetRef: request?.targetRef ?? null,
    direction: request?.direction ?? null,
    sourceRef: request?.sourceRef ?? 'source.public-learning.terrain'
  });
  if (typeof normalized.targetRef !== 'string' || !normalized.targetRef) {
    return Promise.resolve(heldReceipt(normalized, new Error('public learning navigation bridge targetRef is required')));
  }
  if (requestHandler === null) return Promise.resolve(heldReceipt(normalized));
  try {
    return Promise.resolve(requestHandler(normalized)).catch((error) => heldReceipt(normalized, error));
  } catch (error) {
    return Promise.resolve(heldReceipt(normalized, error));
  }
}

export const PUBLIC_LEARNING_NAVIGATION_BRIDGE_SCHEMA = BRIDGE_SCHEMA;

// [VXG RealForever]
