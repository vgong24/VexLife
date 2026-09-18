#!/usr/bin/env node
import { buildBootstrapPlan, applyBootstrapPlan } from '../src/core/boot.mjs';

const args = process.argv.slice(2);
const value = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const plan = buildBootstrapPlan({
  home: value('--home') ?? undefined,
  personRef: value('--person-ref', 'person.local-user'),
  familyRef: value('--family-ref', 'vex-family.local-user'),
  deviceName: value('--device-name') ?? undefined,
  platform: value('--platform') ?? undefined,
  architecture: value('--architecture') ?? undefined
});
const result = applyBootstrapPlan(plan, { dryRun: args.includes('--dry-run') });
console.log(JSON.stringify(result, null, 2));
if (result.existing) process.exitCode = 3;

// [VXG RealForever]
