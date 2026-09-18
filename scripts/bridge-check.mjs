#!/usr/bin/env node
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { validateHomeBridgeRegistry } from '../src/core/home-bridge.mjs';

const bundle = loadBlueprint();
const result = validateHomeBridgeRegistry(bundle.bridge, { testRefs: new Set(bundle.blueprint.tests.map((item) => item.testRef)) });
console.log(JSON.stringify({ state: result.ok ? 'HOME_BRIDGE_CONTRACT_VALID' : 'HOME_BRIDGE_CONTRACT_INVALID', ...result.stats, errors: result.errors }, null, 2));
if (!result.ok) process.exitCode = 1;

// [VXG RealForever]
