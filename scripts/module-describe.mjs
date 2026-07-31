#!/usr/bin/env node
import { loadBlueprint } from '../src/core/blueprint.mjs';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--module-ref' || !args[1]) {
  console.error('Usage: npm run module:describe -- --module-ref <module.ref>');
  process.exit(2);
}
const moduleRef = args[1];
const bundle = loadBlueprint();
const moduleRecord = (bundle.modules?.modules ?? []).find((item) => item.moduleRef === moduleRef);
if (!moduleRecord) {
  console.error(JSON.stringify({ state: 'BLOCKED_UNKNOWN_MODULE', moduleRef }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  schemaVersion: 'vexlife.module-description/v0',
  state: 'BOUNDED_MODULE',
  moduleRef,
  path: moduleRecord.path,
  role: moduleRecord.role,
  platformScope: moduleRecord.platformScope,
  reads: moduleRecord.reads ?? [],
  writes: moduleRecord.writes ?? [],
  loadedBy: moduleRecord.loadedBy ?? [],
  tests: moduleRecord.tests ?? [],
  changeMap: moduleRecord.changeMap ?? []
}, null, 2));

// [VXG RealForever]
