import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { deriveRequiredLensRefs, scaffoldFeatureContract, validateFeatureRegistry, validateReviewLensRegistry } from '../src/core/feature-registry.mjs';
import { deriveRepositoryHealth, compactCurrentProjection, validateBuildHealthRegistry } from '../src/core/build-health.mjs';

const bundle = loadBlueprint();

test('cultural review lenses and registered features validate as part of the universal blueprint', () => {
  const lens = validateReviewLensRegistry(bundle.reviewLenses);
  const feature = validateFeatureRegistry(bundle.featureRegistry, bundle);
  assert.equal(lens.ok, true, lens.errors.join('\n'));
  assert.equal(feature.ok, true, feature.errors.join('\n'));
  assert.ok(lens.stats.lenses >= 12);
  assert.ok(feature.stats.features >= 7);
});

test('feature scaffold makes architectural obligations visible instead of silently omitting them', () => {
  const candidate = scaffoldFeatureContract({
    featureRef: 'feature.vexlife.synthetic-proof',
    purpose: 'Prove the scaffold exposes the full foundation contract.',
    platformRefs: ['platform.browser']
  });
  assert.equal(candidate.status, 'PROPOSED');
  assert.ok(candidate.reviewLensRefs.includes('lens.vexlife.intent-and-placement'));
  assert.ok(candidate.reviewLensRefs.includes('lens.vexlife.identity-lattice'));
  assert.equal(candidate.rollbackRouteRef, 'REQUIRED');
  assert.deepEqual(candidate.stateRefs, []);
});

test('derived feature lenses include UI, platform, resource and effect boundaries when implicated', () => {
  const refs = deriveRequiredLensRefs({
    canonicalNodeRefs: ['screen.vexlife.synthetic'],
    localizationRefs: ['synthetic.label'],
    platformRefs: ['platform.browser', 'platform.windows'],
    resourceClass: 'INTERACTIVE',
    dataClass: 'PRIVATE_MESSAGE',
    effectClass: 'LOCAL_WRITE',
    concurrencyClass: 'ONE_WRITER',
    projectionRefs: ['projection.synthetic']
  });
  for (const required of [
    'lens.vexlife.design-system',
    'lens.vexlife.usability-and-journey',
    'lens.vexlife.accessibility',
    'lens.vexlife.localization-intent',
    'lens.vexlife.security-privacy-permission',
    'lens.vexlife.recovery-migration-continuity',
    'lens.vexlife.concurrency-and-relay',
    'lens.vexlife.platform-environment',
    'lens.vexlife.resource-and-context',
    'lens.vexlife.visibility-terrain-health'
  ]) assert.ok(refs.includes(required), required);
});

test('registered repository health checks resolve through source-managed cultural lenses', () => {
  const result = validateBuildHealthRegistry(bundle.buildHealth, bundle.reviewLenses);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.ok(result.stats.checks >= 10);
});

test('equal semantic health inputs do not create another current transition', () => {
  const first = deriveRepositoryHealth({
    sourceTreeRef: 'tree.1',
    blueprintHash: 'blueprint.1',
    checkResults: [{ checkRef: 'check.blueprint', state: 'PASSED' }]
  });
  const second = deriveRepositoryHealth({
    sourceTreeRef: 'tree.1',
    blueprintHash: 'blueprint.1',
    checkResults: [{ checkRef: 'check.blueprint', state: 'PASSED' }],
    previousProjection: first.projection
  });
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(second.projection.semanticHash, first.projection.semanticHash);
});

test('compact current projection exposes foundation status without dumping full registries', () => {
  const validation = validateBlueprint(bundle);
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  const current = compactCurrentProjection(bundle, validation);
  assert.equal(current.blueprintState, 'VALID');
  assert.equal(current.bridgeState, 'CONTRACT_REGISTERED');
  assert.equal(current.features, bundle.featureRegistry.features.length);
  assert.equal('screens' in current, false);
});

// [VXG RealForever]
