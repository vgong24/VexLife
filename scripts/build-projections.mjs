#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { compactCurrentProjection } from '../src/core/build-health.mjs';
import { buildRegistryProjection, compileRegistryPack } from '../src/core/registry.mjs';
import { writeJson } from '../src/core/utils.mjs';

const bundle = loadBlueprint();
const validation = validateBlueprint(bundle);
if (!validation.ok) throw new Error(`blueprint invalid: ${validation.errors.join('; ')}`);
const root = path.resolve('generated/architecture');
fs.mkdirSync(root, { recursive: true });
writeJson(path.join(root, 'current.json'), compactCurrentProjection(bundle, validation));
writeJson(path.join(root, 'registry-summary.json'), buildRegistryProjection(compileRegistryPack(bundle)));
writeJson(path.join(root, 'features.json'), {
  schemaVersion: 'vexlife.feature-projection/v0',
  features: bundle.featureRegistry.features.map(({ featureRef, purpose, status, platformRefs, projectionRefs, knownGaps = [] }) => ({ featureRef, purpose, status, platformRefs, projectionRefs, knownGaps }))
});
writeJson(path.join(root, 'review-lenses.json'), {
  schemaVersion: 'vexlife.review-lens-projection/v0',
  lenses: bundle.reviewLenses.lenses.map(({ lensRef, purpose, requiredQuestions }) => ({ lensRef, purpose, requiredQuestions }))
});
writeJson(path.join(root, 'home-bridge.json'), {
  schemaVersion: bundle.bridge.schemaVersion,
  bridgeRef: bundle.bridge.bridgeRef,
  modes: bundle.bridge.modes,
  connectionStates: bundle.bridge.connectionStates,
  invariants: bundle.bridge.invariants,
  transports: bundle.bridge.transportAdapters.map(({ transportRef, state, notes }) => ({ transportRef, state, notes }))
});
console.log(JSON.stringify({ state: 'ARCHITECTURE_PROJECTIONS_WRITTEN', root, files: 5 }, null, 2));

// [VXG RealForever]
