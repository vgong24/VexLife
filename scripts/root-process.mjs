#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIdentityIndex, loadBlueprint } from '../src/core/blueprint.mjs';
import { buildProviderProcessAtlas, compileProviderProcess } from '../src/core/provider-process-adapter.mjs';
import { readJson, semanticHash } from '../src/core/utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const packetIndex = args.indexOf('--packet');
if (packetIndex < 0 || !args[packetIndex + 1] || args.length !== 2) {
  console.error('Usage: npm run root:process -- --packet <safe-json-path>');
  process.exit(2);
}
const packetPath = path.resolve(process.cwd(), args[packetIndex + 1]);
const relative = path.relative(ROOT, packetPath);
if (relative.startsWith('..') || path.isAbsolute(relative)) {
  console.error('Packet must be inside the VexLife repository checkout.');
  process.exit(2);
}

try {
  const bundle = loadBlueprint(ROOT);
  const registry = readJson(path.join(ROOT, 'blueprint/provider-process-adapter-registry.json'));
  const packet = readJson(packetPath);
  const atlas = buildProviderProcessAtlas(buildIdentityIndex(bundle), registry);
  const providerProcessProjection = atlas.query({
    startRefs: [packet.pluginRef],
    depthLimit: 2,
    resultLimit: 32,
    tokenBudget: 6000
  });
  const compiled = compileProviderProcess({
    pluginRef: packet.pluginRef,
    registry,
    bundle,
    inputs: packet.inputs,
    sourceRefs: packet.sourceRefs,
    currentFoundationVersions: packet.currentFoundationVersions,
    authority: packet.authority,
    resourceBudget: packet.resourceBudget,
    recipientRef: packet.recipientRef
  });
  console.log(JSON.stringify({
    schemaVersion: 'vexlife.root-process-command-result/v1',
    adapterClass: 'VEXLIFE_REPOSITORY_LOCAL',
    sharedContractBindingState: registry.sharedContractBinding.state,
    packetHash: semanticHash(packet),
    providerProcessProjection,
    ...compiled
  }, null, 2));
  if (compiled.state !== 'VEXLIFE_PROVIDER_PROCESS_PLAN_READY_NO_EFFECT') process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({
    schemaVersion: 'vexlife.root-process-command-result/v1',
    state: 'ROOT_PROCESS_BLOCKED',
    detail: error.message
  }, null, 2));
  process.exitCode = 1;
}

// [VXG RealForever]
