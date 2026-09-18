import {
  buildPublicPresentationTerrain,
  createPublicLearningController as createBasePublicLearningController,
  validatePublicLearningBrowserInputs
} from './public-learning-controller.js';
import {
  createPublicLearningNavigationContinuity,
  publicLearningChildDoorRef,
  publicLearningUpDoorRef,
  PUBLIC_LEARNING_NAVIGATION_RECEIPTS
} from './public-learning-navigation-continuity.js';
import { createPublicLearningNavigationRequestBoundary } from './public-learning-navigation-request.js';
import { bindPublicLearningNavigationBridge } from './public-learning-navigation-bridge.js';

const clone = (value) => structuredClone(value);
const need = (condition, message) => { if (!condition) throw new Error(message); };

function rendered(element) {
  if (!element || element.hidden || element.closest('[hidden],[aria-hidden="true"],[inert]')) return false;
  const style = getComputedStyle(element);
  return style.display !== 'none'
    && style.visibility !== 'hidden'
    && Number(style.opacity || '1') > 0
    && element.getClientRects().length > 0;
}

export { buildPublicPresentationTerrain, validatePublicLearningBrowserInputs };

export function createPublicLearningController({
  projection,
  registry,
  navigationContinuityRegistry,
  catalogs,
  root = document
}) {
  need(navigationContinuityRegistry?.schemaVersion === 'vexlife.navigation-continuity-registry/v1',
    'Stage 7 activation requires the accepted Navigation Continuity registry');

  const base = createBasePublicLearningController({ projection, registry, catalogs, root });
  need(typeof base.terrain?.performTerrainTravel === 'function',
    'Stage 7 activation requires the public-learning Terrain facade');

  const presentation = base.presentation;
  const childrenByRef = new Map();
  const parentByRef = new Map();
  for (const item of presentation) {
    parentByRef.set(item.terrainNodeRef, item.parentRef);
    if (item.parentRef === null) continue;
    const children = childrenByRef.get(item.parentRef) ?? [];
    children.push(item.terrainNodeRef);
    childrenByRef.set(item.parentRef, children);
  }
  for (const children of childrenByRef.values()) children.sort();

  function synchronizeVisibleDoors(observedRef) {
    need(base.terrain.currentRef() === observedRef,
      'public learning registered-door synchronization requires exact Terrain presence');
    for (const element of root.querySelectorAll('[data-public-navigation-element-ref]')) {
      delete element.dataset.publicNavigationElementRef;
    }
    const availableElementRefs = [];
    for (const childRef of childrenByRef.get(observedRef) ?? []) {
      const element = root.querySelector(`.e27-node[data-terrain-ref="${CSS.escape(childRef)}"]`);
      if (!rendered(element)) continue;
      const elementRef = publicLearningChildDoorRef(observedRef, childRef);
      element.dataset.publicNavigationElementRef = elementRef;
      availableElementRefs.push(elementRef);
    }
    const parentRef = parentByRef.get(observedRef) ?? null;
    if (parentRef !== null) {
      const element = root.querySelector('#terrainUp');
      if (rendered(element) && element.disabled !== true) {
        const elementRef = publicLearningUpDoorRef(observedRef, parentRef);
        element.dataset.publicNavigationElementRef = elementRef;
        availableElementRefs.push(elementRef);
      }
    }
    return Object.freeze({
      schemaVersion: PUBLIC_LEARNING_NAVIGATION_RECEIPTS.registeredDoorsReceiptSchema,
      currentRef: observedRef,
      availableElementRefs: availableElementRefs.sort(),
      semanticNavigationPerformed: false
    });
  }

  function focusRegisteredElement(elementRef) {
    const element = root.querySelector(
      `[data-public-navigation-element-ref="${CSS.escape(elementRef)}"]`
    );
    const available = rendered(element);
    if (available) element.focus({ preventScroll: true });
    return Object.freeze({
      schemaVersion: PUBLIC_LEARNING_NAVIGATION_RECEIPTS.focusReceiptSchema,
      elementRef,
      focused: available && element.ownerDocument.activeElement === element,
      semanticNavigationPerformed: false
    });
  }

  const continuity = createPublicLearningNavigationContinuity({
    registry: navigationContinuityRegistry,
    presentation,
    initialRef: base.terrain.currentRef(),
    performTerrainTravel: (targetRef, direction) => base.terrain.performTerrainTravel(targetRef, direction),
    observeCurrentRef: () => base.terrain.currentRef(),
    synchronizeVisibleDoors,
    focusRegisteredElement
  });

  const requestBoundary = createPublicLearningNavigationRequestBoundary({
    continuity,
    defaultSourceRef: 'source.public-learning.request'
  });
  bindPublicLearningNavigationBridge((request) => requestBoundary.request(request.targetRef, {
    sourceRef: request.sourceRef,
    direction: request.direction
  }));

  const baseProof = base.proof;
  const proof = () => ({
    ...baseProof(),
    navigationContinuity: {
      currentFrame: clone(continuity.currentFrame()),
      transitionBundleCount: continuity.transitionBundles().length,
      recentTrace: clone(continuity.recentTrace())
    }
  });

  return Object.freeze({
    ...base,
    proof,
    navigationContinuity: continuity,
    requestSemanticTravel: (targetRef, options = {}) => requestBoundary.request(targetRef, options)
  });
}

// [VXG RealForever]
