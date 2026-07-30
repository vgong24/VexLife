#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, semanticHash } from '../src/core/utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = readJson(path.join(ROOT, 'blueprint/evolution-registry.json'));
console.log(JSON.stringify({
  registryRef: registry.registryRef,
  registryVersion: registry.registryVersion,
  candidateTypes: registry.candidateTypes.length,
  dreamStates: registry.dreamStates.length,
  synchronizationScopes: registry.synchronizationScopes.length,
  weightLifecycleStates: registry.weightLifecycleStates.length,
  semanticHash: semanticHash(registry)
}, null, 2));

// [VXG RealForever]
