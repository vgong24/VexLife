import { createPublicLearningController } from '../modules/public-learning-controller-activated.js';

const json = async (path) => {
  const response = await fetch(path, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Public learning source unavailable: ${path} (${response.status})`);
  return response.json();
};

const [projection, registry, navigationContinuityRegistry, en, ja, zh] = await Promise.all([
  json('/generated/public-learning/projection.json'),
  json('/blueprint/public-learning-browser-registry.json'),
  json('/blueprint/navigation-continuity-registry.json'),
  json('/blueprint/public-learning-browser/strings/en.json'),
  json('/blueprint/public-learning-browser/strings/ja.json'),
  json('/blueprint/public-learning-browser/strings/zh.json')
]);

const controller = createPublicLearningController({
  projection,
  registry,
  navigationContinuityRegistry,
  catalogs: { en, ja, zh }
});

globalThis.__vexlifePublicLearning = Object.freeze({
  proof: controller.proof,
  travel: (ref) => controller.requestSemanticTravel(ref, { sourceRef: 'source.public-learning.programmatic' }),
  openLeafByCanonicalRef: controller.openLeafByCanonicalRef,
  restoreCurrentLeaf: controller.restoreCurrentLeaf,
  setLocale: controller.setLocale,
  presentation: controller.presentation
});

document.documentElement.dataset.publicLearningReady = 'true';

// [VXG RealForever]
