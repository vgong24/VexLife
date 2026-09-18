#!/usr/bin/env node
import { Atlas } from '../src/core/atlas.mjs';
import { buildIdentityIndex, loadBlueprint } from '../src/core/blueprint.mjs';

const args = process.argv.slice(2);
const allowedArgs = new Set(['--intent', '--start', '--edges', '--depth', '--limit', '--tokens']);
for (let index = 0; index < args.length; index += 2) {
  if (!allowedArgs.has(args[index]) || !args[index + 1]) {
    console.error('Usage: npm run atlas:query -- --intent "<intent>" [--start ref1,ref2] [--edges TYPE1,TYPE2] [--depth 0..4] [--limit 1..25] [--tokens 200..5000]');
    process.exit(2);
  }
}
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const boundedInteger = (name, fallback, minimum, maximum) => {
  const parsed = Number(value(name, String(fallback)));
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  return parsed;
};
const intent = value('--intent', '');
if (!intent) {
  console.error('Required: --intent "<task intent>"');
  process.exit(2);
}
const index = buildIdentityIndex(loadBlueprint());
const atlas = new Atlas(index);
const edgeTypes = value('--edges', '').split(',').filter(Boolean);
const result = atlas.query({
  intent,
  startRefs: value('--start', '').split(',').filter(Boolean),
  edgeTypes: edgeTypes.length ? edgeTypes : null,
  depthLimit: boundedInteger('--depth', 2, 0, 4),
  resultLimit: boundedInteger('--limit', 8, 1, 25),
  tokenBudget: boundedInteger('--tokens', 1200, 200, 5000)
});
console.log(JSON.stringify({ schemaVersion: 'vexlife.atlas-query-receipt/v0', state: 'BOUNDED_RESULTS', ...result }, null, 2));

// [VXG RealForever]
