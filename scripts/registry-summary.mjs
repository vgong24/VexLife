#!/usr/bin/env node
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { compileRegistryPack, buildRegistryProjection } from '../src/core/registry.mjs';
const registry = compileRegistryPack(loadBlueprint());
console.log(JSON.stringify(buildRegistryProjection(registry), null, 2));
// [VXG RealForever]
