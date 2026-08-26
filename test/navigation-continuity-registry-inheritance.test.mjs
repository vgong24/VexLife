import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { compileRegistryPack } from '../src/core/registry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function edge(entry, type, to) {
  return (entry.edges ?? []).some((item) => item.type === type && item.to === to);
}

test('Navigation Continuity is inherited through universal Blueprint and compiled Registry', () => {
  const bundle = loadBlueprint(ROOT);
  assert.equal(bundle.blueprint.navigationContinuity.registryRef, 'registry.vexlife.navigation-continuity.001');
  assert.equal(
    bundle.blueprint.registryRefs.navigationContinuityRegistryRef,
    bundle.blueprint.navigationContinuity.registryRef
  );

  const validation = validateBlueprint(bundle);
  assert.equal(validation.ok, true, validation.errors.join('\n'));

  const registry = compileRegistryPack(bundle);
  const source = registry.require('source.blueprint.navigation-continuity-registry');
  const owner = registry.require('registry.vexlife.navigation-continuity.001');
  const pacingCollection = registry.require('collection.navigation-continuity.pacing');
  const fast = registry.require('navigation-pacing.vexlife.fast');
  const topologyContract = registry.require('contract.navigation-continuity.topology/v1');
  const module = registry.require('module.vexlife.core.navigation-continuity');

  assert.equal(source.kind, 'NAVIGATION_CONTINUITY_SOURCE');
  assert.equal(owner.kind, 'NAVIGATION_CONTINUITY_REGISTRY');
  assert.equal(pacingCollection.kind, 'NAVIGATION_CONTINUITY_DESCRIPTOR_COLLECTION');
  assert.equal(fast.kind, 'NAVIGATION_PACING');
  assert.equal(topologyContract.kind, 'NAVIGATION_CONTINUITY_CONTRACT');
  assert.equal(module.path, 'src/core/navigation-continuity.mjs');
  assert.ok(module.loadedBy.includes('module.vexlife.core.registry'));

  assert.ok(edge(owner, 'DESCRIPTOR_COLLECTION', pacingCollection.ref));
  assert.ok(edge(owner, 'DEFAULT_PACING', fast.ref));
  assert.ok(edge(fast, 'SETTLEMENT_POLICY', 'settlement.navigation.semantic-current'));
  assert.ok(edge(fast, 'ANIMATION_POLICY', 'animation.navigation.compressed'));
  assert.ok(edge(fast, 'DWELL_POLICY', 'dwell.navigation.minimum'));
  assert.ok(edge(fast, 'ADVANCE_POLICY', 'advance.navigation.automatic'));
  assert.ok(edge(fast, 'TRACE_VISIBILITY', 'trace-visibility.navigation.visible'));
});

// [VXG RealForever]
