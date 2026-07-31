#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileImplementationPacket } from '../src/core/implementation-plan.mjs';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const workRef = value('--work-ref');
if (!workRef) {
  console.error('Required: --work-ref <work.ref> [--platform browser|android|ios|windows|macos] [--accepted ref1,ref2]');
  process.exit(2);
}
const bundle = loadBlueprint(ROOT);
const plan = bundle.implementationPlan;
const blueprintValidation = validateBlueprint(bundle);
if (!blueprintValidation.ok) {
  console.error(JSON.stringify({ state: 'BLOCKED_INVALID_BLUEPRINT', errors: blueprintValidation.errors }, null, 2));
  process.exit(1);
}
const result = compileImplementationPacket(plan, {
  workRef,
  platform: value('--platform'),
  acceptedWorkRefs: (value('--accepted', '') || '').split(',').filter(Boolean),
  currentBlueprintHash: blueprintValidation.semanticHash
});
console.log(JSON.stringify(result, null, 2));
if (result.state.startsWith('BLOCKED')) process.exitCode = 1;

// [VXG RealForever]
