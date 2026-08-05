import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIdentityIndex, loadBlueprint } from '../src/core/blueprint.mjs';
import {
  buildPluginAtlas,
  compilePluginProcess,
  renderPluginReceipt,
  validatePluginRegistry
} from '../src/core/plugin-runtime.mjs';
import { readJson, semanticHash } from '../src/core/utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = loadBlueprint(ROOT);
const registry = readJson(path.join(ROOT, 'blueprint/plugin-registry.json'));
const packet = readJson(path.join(ROOT, 'test/fixtures/root-process/fresh-root-packet.json'));

test('plugin registry binds typed templates, exact steps, foundations, modules and processes', () => {
  const validation = validatePluginRegistry(registry, bundle);
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  assert.equal(validation.stats.plugins, 2);
  assert.equal(registry.runtimeEvidencePolicy.historicalGitHubCommentScraping, false);
  assert.equal(registry.runtimeEvidencePolicy.packageContainedEvidenceRequired, true);
});

test('fresh Root cold start compiles one deterministic no-effect plugin plan', () => {
  const result = compilePluginProcess({
    pluginRef: packet.pluginRef,
    registry,
    bundle,
    inputs: packet.inputs,
    sourceRefs: packet.sourceRefs,
    currentFoundationVersions: packet.currentFoundationVersions,
    authority: packet.authority,
    resourceBudget: packet.resourceBudget,
    recipientRef: packet.recipientRef,
    now: '2026-08-04T23:45:00-07:00'
  });
  assert.equal(result.state, 'PLUGIN_PLAN_READY_NO_EFFECT');
  assert.equal(result.plan.pluginRef, packet.pluginRef);
  assert.equal(result.plan.processRef, 'process.vexlife.root.consume-recipient-packet');
  assert.equal(result.plan.authorityEnvelope.effects.length, 0);
  assert.ok(result.plan.outputTemplateRefs.includes('template.vexlife.root-consumption-receipt'));
  const replay = compilePluginProcess({
    pluginRef: packet.pluginRef,
    registry,
    bundle,
    inputs: packet.inputs,
    sourceRefs: packet.sourceRefs,
    currentFoundationVersions: packet.currentFoundationVersions,
    authority: packet.authority,
    resourceBudget: packet.resourceBudget,
    recipientRef: packet.recipientRef,
    now: '2026-08-04T23:45:00-07:00'
  });
  assert.equal(replay.plan.planHash, result.plan.planHash);
  const receipt = renderPluginReceipt(result.plan, {
    instanceRef: 'instance.root.fresh.001',
    occupancyRef: 'occupancy.root.fresh.001',
    providerBindingRef: 'provider-binding.root.fresh.001',
    threadRef: 'thread.root.fresh.001',
    consumedPacketHash: semanticHash(packet),
    now: '2026-08-04T23:45:00-07:00'
  });
  assert.equal(receipt.state, 'PLUGIN_RECEIPT_READY');
  assert.equal(receipt.receipt.planHash, result.plan.planHash);
});

test('Atlas resolves the plugin to its process, implementation module, foundations and templates', () => {
  const atlas = buildPluginAtlas(buildIdentityIndex(bundle), registry);
  const result = atlas.query({
    startRefs: [packet.pluginRef],
    depthLimit: 2,
    resultLimit: 32,
    tokenBudget: 6000
  });
  const refs = new Set(result.results.map((item) => item.ref));
  for (const ref of [
    'process.vexlife.root.consume-recipient-packet',
    'module.vexlife.core.plugin-runtime',
    'foundation.vexlife.root-process-plugin.v1',
    'template.vexlife.root-recipient-packet',
    'template.vexlife.root-consumption-receipt'
  ]) assert.equal(refs.has(ref), true, ref);
});

test('missing packet input and stale foundation fail closed without changing the plugin', () => {
  const missingInputs = structuredClone(packet.inputs);
  delete missingInputs.currentEntryRef;
  const missing = compilePluginProcess({
    pluginRef: packet.pluginRef,
    registry,
    bundle,
    inputs: missingInputs,
    sourceRefs: packet.sourceRefs,
    currentFoundationVersions: packet.currentFoundationVersions,
    authority: packet.authority,
    resourceBudget: packet.resourceBudget
  });
  assert.equal(missing.state, 'BLOCKED_MISSING_INPUT');
  assert.deepEqual(missing.missingInputs, ['currentEntryRef']);

  const stale = compilePluginProcess({
    pluginRef: packet.pluginRef,
    registry,
    bundle,
    inputs: packet.inputs,
    sourceRefs: packet.sourceRefs,
    currentFoundationVersions: {
      ...packet.currentFoundationVersions,
      'foundation.vexlife.root-process-plugin.v1': 0
    },
    authority: packet.authority,
    resourceBudget: packet.resourceBudget
  });
  assert.equal(stale.state, 'BLOCKED_STALE_FOUNDATION');
});

test('generic executor task formation requires exact authority and never forks executor behavior', () => {
  const inputs = {
    taskRef: 'task.example',
    attemptRef: 'attempt.example.001',
    executorRef: 'executor.vexlocalbridge.generic',
    executorVersion: 1,
    executorSha256: 'a'.repeat(64),
    sourceArtifact: { path: 'source.zip', sha256: 'b'.repeat(64) },
    evidenceManifest: { path: 'evidence.json', sha256: 'c'.repeat(64) },
    livePreflight: { expectedMain: 'd'.repeat(40) },
    allowedEffects: ['DECLARED_SOURCE_WRITE'],
    terminalResultContract: { templateRef: 'template.vexlocalbridge.canonical-result' }
  };
  const blocked = compilePluginProcess({
    pluginRef: 'plugin.vexlocalbridge.compile-generic-task.v1',
    registry,
    bundle,
    inputs,
    currentFoundationVersions: {
      'foundation.vexlife.generic-executor-manifest.v1': 1,
      'foundation.vexlife.permission-effects.v1': 1
    },
    authority: { effects: [] }
  });
  assert.equal(blocked.state, 'BLOCKED_AUTHORITY');

  const ready = compilePluginProcess({
    pluginRef: 'plugin.vexlocalbridge.compile-generic-task.v1',
    registry,
    bundle,
    inputs,
    currentFoundationVersions: {
      'foundation.vexlife.generic-executor-manifest.v1': 1,
      'foundation.vexlife.permission-effects.v1': 1
    },
    authority: { effects: ['FORM_TASK_PACKAGE'] }
  });
  assert.equal(ready.state, 'PLUGIN_PLAN_READY_NO_EFFECT');
  assert.equal(ready.plan.implementationModuleRef, 'module.vexlife.core.plugin-runtime');
  assert.equal(registry.runtimeEvidencePolicy.historicalGitHubCommentScraping, false);
});

test('tampered plugin bindings are rejected before plan compilation', () => {
  const tampered = structuredClone(registry);
  tampered.plugins[0].stepRefs[0] = 'invented-step';
  const validation = validatePluginRegistry(tampered, bundle);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes('stepRefs do not exactly bind')));
});

// [VXG RealForever]
