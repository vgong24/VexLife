import {
  IdentityRegistry,
  buildRegistryProjection,
  compileRegistryPack as compileCoreRegistryPack
} from './registry-core.mjs';
import { registerNavigationContinuityRegistry } from './navigation-continuity-registry.mjs';

export { IdentityRegistry, buildRegistryProjection };

export function compileRegistryPack(bundle) {
  const registry = compileCoreRegistryPack(bundle);
  registerNavigationContinuityRegistry({
    registry,
    navigationContinuity: bundle.blueprint?.navigationContinuity ?? null,
    expectedRegistryRef: bundle.blueprint?.registryRefs?.navigationContinuityRegistryRef ?? null
  });
  return registry;
}

// [VXG RealForever]
