#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIdentityIndex, loadBlueprint } from '../src/core/blueprint.mjs';
import { buildPluginAtlas, compilePluginProcess } from '../src/core/plugin-runtime.mjs';
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
  const registry = readJson(path.join(ROOT, 'blueprint/plugin-registry.json'));
  const packet = readJson(packetPath);
  const atlas = buildPluginAtlas(buildIdentityIndex(bundle), registry);
  const pluginProjection = atlas.query({
    startRefs: [packet.pluginRef],
    depthLimit: 2,
    resultLimit: 32,
    tokenBudget: 6000
  });
  const compiled = compilePluginProcess({
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
    packetHash: semanticHash(packet),
    pluginProjection,
    ...compiled
  }, null, 2));
  if (compiled.state !== 'PLUGIN_PLAN_READY_NO_EFFECT') process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({
    schemaVersion: 'vexlife.root-process-command-result/v1',
    state: 'ROOT_PROCESS_BLOCKED',
    detail: error.message
  }, null, 2));
  process.exitCode = 1;
}

// [VXG RealForever]
