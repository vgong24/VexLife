#!/usr/bin/env node
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';

const result = validateBlueprint(loadBlueprint());
if (!result.ok) {
  console.error('VexLife blueprint invalid');
  for (const error of result.errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(JSON.stringify({ state: 'VALID', ...result.stats, semanticHash: result.semanticHash }, null, 2));

// [VXG RealForever]
