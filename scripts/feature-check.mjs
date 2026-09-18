#!/usr/bin/env node
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { validateReviewLensRegistry, validateFeatureRegistry } from '../src/core/feature-registry.mjs';

const bundle = loadBlueprint();
const lens = validateReviewLensRegistry(bundle.reviewLenses);
const feature = validateFeatureRegistry(bundle.featureRegistry, bundle);
const errors = [...lens.errors, ...feature.errors];
console.log(JSON.stringify({
  state: errors.length ? 'FEATURE_REGISTRY_INVALID' : 'FEATURE_REGISTRY_VALID',
  features: feature.stats.features,
  reviewLenses: lens.stats.lenses,
  errors
}, null, 2));
if (errors.length) process.exitCode = 1;

// [VXG RealForever]
