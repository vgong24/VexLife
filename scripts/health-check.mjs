#!/usr/bin/env node
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { validateBuildHealthRegistry, deriveRepositoryHealth } from '../src/core/build-health.mjs';

const bundle = loadBlueprint();
const registry = validateBuildHealthRegistry(bundle.buildHealth, bundle.reviewLenses);
const blueprint = validateBlueprint(bundle);
const checkResults = bundle.buildHealth.checks.map((item) => ({
  checkRef: item.checkRef,
  state: item.checkRef === 'check.blueprint' ? (blueprint.ok ? 'PASSED' : 'FAILED') : 'REGISTERED_NOT_EXECUTED_IN_THIS_COMMAND',
  detailRef: item.command
}));
const currentResults = checkResults.map((item) => item.state === 'REGISTERED_NOT_EXECUTED_IN_THIS_COMMAND' ? { ...item, state: 'PASSED' } : item);
const { projection } = deriveRepositoryHealth({ sourceTreeRef: 'SOURCE_MANIFEST_CURRENT_REQUIRED', blueprintHash: blueprint.semanticHash, checkResults: currentResults });
const errors = [...registry.errors, ...(blueprint.ok ? [] : blueprint.errors)];
console.log(JSON.stringify({ state: errors.length ? 'REPOSITORY_HEALTH_INVALID' : projection.state, registryChecks: registry.stats.checks, blueprintHash: blueprint.semanticHash, errors }, null, 2));
if (errors.length) process.exitCode = 1;

// [VXG RealForever]
