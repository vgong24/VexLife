#!/usr/bin/env node
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { compactCurrentProjection } from '../src/core/build-health.mjs';

const bundle = loadBlueprint();
const validation = validateBlueprint(bundle);
console.log(JSON.stringify(compactCurrentProjection(bundle, validation), null, 2));
if (!validation.ok) process.exitCode = 1;

// [VXG RealForever]
