import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIdentityIndex, loadBlueprint } from '../src/core/blueprint.mjs';
import {
  buildProviderProcessAtlas,
  compileProviderProcess,
  renderProviderProcessReceipt,
  validateProviderProcessAdapterRegistry
} from '../src/core/provider-process-adapter.mjs';
import { readJson, semanticHash } from '../src/core/utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = loadBlueprint(ROOT);
const registry = readJson(path.join(ROOT, 'blueprint/provider-process-adapter-registry.json'));
const upstreamCandidates = readJson(path.join(ROOT, 'blueprint/upstream-candidates/provider-process-and-executor-contracts.json'));
const packet = readJson(path.join(ROOT, 'test/fixtures/root-process/fresh-root-packet.json'));

test('VexLife provider/process registry binds only local typed processes and exposes unresolved shared bindings', () => {
  const validation = validateProviderProcessAdapterRegistry(registry, bundle);
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  assert.equal(validation.stats.localPlugins, 1);
  assert.equal(validation.stats.sharedBindingState, 'PENDING_SHARED_CONVERGENCE');
  assert.equal(registry.ownershipClass, 'VEXLIFE_REPOSITORY_LOCAL');
  assert.equal(registry.sharedContractBinding.mayClaimUniversalCore, false);
  assert.equal(registry.sharedContractBinding.canonicalProviderPluginSchemaRef, null);
  assert.equal(registry.runtimeEvidencePolicy.historicalGitHubCommentScraping, false);
});

test('fresh Root cold start compiles one deterministic local-adapter no-effect plan', () => {
  const args = {
    pluginRef: packet.pluginRef,
    registry,
    bundle,
    inputs: packet.inputs,
    sourceRefs: packet.sourceRefs,
    currentFoundationVersions: {
      ...packet.currentFoundationVersions,
      'foundation.vexlife.root-process-adapter.v1': 1
    },
    authority: packet.authority,
    resourceBudget: packet.resourceBudget,
    recipientRef: packet.recipientRef,
    now: '2026-08-05T01:20:00-07:00'
  };
  delete args.currentFoundationVersions['foundation.vexlife.root-process-plugin.v1'];
  const result = compileProviderProcess(args);
  assert.equal(result.state, 'VEXLIFE_PROVIDER_PROCESS_PLAN_READY_NO_EFFECT');
  assert.equal(result.plan.pluginRef, packet.pluginRef);
  assert.equal(result.plan.processRef, 'process.vexlife.root.consume-recipient-packet');
  assert.equal(result.plan.authorityEnvelope.effects.length, 0);
  assert.equal(result.plan.sharedContractBinding.state, 'PENDING_SHARED_CONVERGENCE');
  const replay = compileProviderProcess(args);
  assert.equal(replay.plan.planHash, result.plan.planHash);
  const receipt = renderProviderProcessReceipt(result.plan, {
    instanceRef: 'instance.root.fresh.001',
    occupancyRef: 'occupancy.root.fresh.001',
    providerBindingRef: 'provider-binding.root.fresh.001',
    threadRef: 'thread.root.fresh.001',
    consumedPacketHash: semanticHash(packet),
    now: '2026-08-05T01:20:00-07:00'
  });
  assert.equal(receipt.state, 'VEXLIFE_PROVIDER_PROCESS_RECEIPT_READY');
  assert.equal(receipt.receipt.planHash, result.plan.planHash);
});

test('Atlas resolves the local adapter to its process, module, foundations and templates', () => {
  const atlas = buildProviderProcessAtlas(buildIdentityIndex(bundle), registry);
  const result = atlas.query({ startRefs: [packet.pluginRef], depthLimit: 2, resultLimit: 32, tokenBudget: 6000 });
  const refs = new Set(result.results.map((item) => item.ref));
  for (const ref of [
    'process.vexlife.root.consume-recipient-packet',
    'module.vexlife.core.provider-process-adapter',
    'foundation.vexlife.root-process-adapter.v1',
    'template.vexlife.root-recipient-packet',
    'template.vexlife.root-consumption-receipt'
  ]) assert.equal(refs.has(ref), true, ref);
});

test('missing packet input and stale local foundation fail closed', () => {
  const currentFoundationVersions = {
    ...packet.currentFoundationVersions,
    'foundation.vexlife.root-process-adapter.v1': 1
  };
  delete currentFoundationVersions['foundation.vexlife.root-process-plugin.v1'];
  const missingInputs = structuredClone(packet.inputs);
  delete missingInputs.currentEntryRef;
  const missing = compileProviderProcess({
    pluginRef: packet.pluginRef, registry, bundle, inputs: missingInputs,
    sourceRefs: packet.sourceRefs, currentFoundationVersions,
    authority: packet.authority, resourceBudget: packet.resourceBudget
  });
  assert.equal(missing.state, 'BLOCKED_MISSING_INPUT');
  assert.deepEqual(missing.missingInputs, ['currentEntryRef']);

  const stale = compileProviderProcess({
    pluginRef: packet.pluginRef, registry, bundle, inputs: packet.inputs,
    sourceRefs: packet.sourceRefs,
    currentFoundationVersions: { ...currentFoundationVersions, 'foundation.vexlife.root-process-adapter.v1': 0 },
    authority: packet.authority, resourceBudget: packet.resourceBudget
  });
  assert.equal(stale.state, 'BLOCKED_STALE_FOUNDATION');
});

test('generic executor semantics are preserved only as non-canonical upstream candidates', () => {
  assert.equal(upstreamCandidates.state, 'AWAITING_SHARED_CONVERGENCE');
  assert.equal(upstreamCandidates.canonical, false);
  assert.ok(upstreamCandidates.unresolvedBindings.includes('canonicalSharedProviderPluginSchemaRef'));
  const priorSymbols = new Set(upstreamCandidates.candidateSymbols.map((item) => item.priorLocalSymbol));
  for (const ref of [
    'vexlife.plugin-registry/v1',
    'foundation.vexlife.generic-executor-manifest.v1',
    'process.vexlocalbridge.compile-generic-task',
    'template.vexlocalbridge.generic-task-manifest',
    'template.vexlocalbridge.canonical-result'
  ]) assert.equal(priorSymbols.has(ref), true, ref);
  assert.equal(bundle.factory.processes.some((item) => item.processRef === 'process.vexlocalbridge.compile-generic-task'), false);
});

test('tampered local binding or universal-core claim is rejected before compilation', () => {
  const tampered = structuredClone(registry);
  tampered.plugins[0].stepRefs[0] = 'invented-step';
  let validation = validateProviderProcessAdapterRegistry(tampered, bundle);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes('stepRefs do not exactly bind')));

  const universalClaim = structuredClone(registry);
  universalClaim.sharedContractBinding.mayClaimUniversalCore = true;
  validation = validateProviderProcessAdapterRegistry(universalClaim, bundle);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes('explicitly unresolved and non-canonical')));
});

// [VXG RealForever]
