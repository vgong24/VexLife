import { createTerrainController as createCanonicalTerrainController } from './terrain-controller.js?public-learning-canonical=1';
import { requestPublicLearningNavigation } from './public-learning-navigation-bridge.js';

export function createTerrainController(options) {
  const canonical = createCanonicalTerrainController({
    ...options,
    requestSemanticTravel: ({ targetRef, direction }) => requestPublicLearningNavigation({
      targetRef,
      direction,
      sourceRef: 'source.public-learning.terrain'
    })
  });
  const performTerrainTravel = canonical.travel.bind(canonical);
  return Object.freeze({
    ...canonical,
    performTerrainTravel,
    travel: (targetRef, direction = 'in') => requestPublicLearningNavigation({
      targetRef,
      direction,
      sourceRef: 'source.public-learning.facade-travel'
    })
  });
}

// [VXG RealForever]
