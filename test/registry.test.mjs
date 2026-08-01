import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIdentityIndex, loadBlueprint, validateBlueprint, validateEvolutionRegistry } from '../src/core/blueprint.mjs';
import { Atlas } from '../src/core/atlas.mjs';
import { compileRegistryPack, buildRegistryProjection } from '../src/core/registry.mjs';
import { validateIntentSchedulerRegistry } from '../src/core/scheduler-runtime-trust.mjs';
import { buildInterfaceContracts } from '../src/core/interface-builder.mjs';
import { ProcessFactory, validateProcessFactory } from '../src/core/process-factory.mjs';
import { JourneyLedger } from '../src/core/journey.mjs';
import { buildBlueprintImpact } from '../src/core/impact.mjs';

const bundle = loadBlueprint();

test('compiled registries converge identity, strings, modules and processes', () => {
  const validation = validateBlueprint(bundle);
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  const registry = compileRegistryPack(bundle);
  const composer = registry.require('element.chat.composer');
  assert.equal(composer.actionRef, 'action.message.send');
  assert.equal(composer.labelStringRef, 'composer.placeholder');
  const string = registry.require('composer.placeholder');
  assert.ok(string.consumerRefs.includes('element.chat.composer'));
  assert.equal(string.values.zh.length > 0, true);
  assert.equal(registry.require('process.vexlife.navigation.semantic-transition').kind, 'PROCESS');
  assert.equal(registry.require('module.vexlife.browser.adapter').path, 'reference/browser/app.js');
  const summary = buildRegistryProjection(registry);
  assert.ok(summary.entryCount > 100);
  assert.ok(summary.byKind.ELEMENT > 10);
});

test('scheduler registry composes universally, resolves through Atlas, and omission or malformed trust fails closed', () => {
  const schedulerValidation = validateIntentSchedulerRegistry(bundle.schedulerRegistry);
  assert.equal(schedulerValidation.ok, true, schedulerValidation.errors.join('\n'));
  assert.deepEqual(bundle.blueprint.intentScheduler, bundle.schedulerRegistry);
  const registry = compileRegistryPack(bundle);
  for (const ref of [
    bundle.schedulerRegistry.registryRef,
    bundle.schedulerRegistry.runtimeTrustContract.contractRef,
    bundle.schedulerRegistry.runtimeTrustContract.clockRef,
    bundle.schedulerRegistry.simulationContract.contractRef
  ]) assert.equal(registry.require(ref).ref, ref);
  const atlas = new Atlas(buildIdentityIndex(bundle));
  const traversal = atlas.query({
    startRefs: [bundle.schedulerRegistry.registryRef],
    depthLimit: 2,
    resultLimit: 64,
    tokenBudget: 12000
  });
  assert.ok(traversal.results.some((item) => item.ref === bundle.schedulerRegistry.simulationContract.contractRef));

  const omitted = structuredClone(bundle);
  delete omitted.schedulerRegistry;
  assert.equal(validateBlueprint(omitted).ok, false);
  const malformed = structuredClone(bundle.schedulerRegistry);
  malformed.runtimeTrustContract.clockRef = 'clock.intent-scheduler.invented';
  assert.equal(validateIntentSchedulerRegistry(malformed).ok, false);
});

test('Evolution composes universally, resolves through Atlas, and malformed or duplicate identity fails closed', () => {
  const evolutionValidation = validateEvolutionRegistry(bundle.evolution, bundle);
  assert.equal(evolutionValidation.ok, true, evolutionValidation.errors.join('\n'));
  assert.deepEqual(bundle.blueprint.evolution, bundle.evolution);
  const registry = compileRegistryPack(bundle);
  for (const ref of [
    bundle.evolution.registryRef,
    bundle.evolution.canonicalSourceRef,
    bundle.evolution.systemRef,
    bundle.evolution.burdenRelease.contractRef,
    bundle.evolution.contextReview.contractRef,
    bundle.evolution.recurrencePolicy.contractRef,
    bundle.evolution.simulationContract.contractRef,
    bundle.evolution.acceptancePolicies[0].policyRef,
    bundle.evolution.projectionIdentities[0].projectionRef
  ]) assert.equal(registry.require(ref).ref, ref);
  const atlas = new Atlas(buildIdentityIndex(bundle));
  const traversal = atlas.query({ startRefs: [bundle.evolution.registryRef], depthLimit: 2, resultLimit: 128, tokenBudget: 20000 });
  for (const ref of [bundle.evolution.systemRef, bundle.evolution.contextReview.contractRef, bundle.evolution.projectionIdentities[0].projectionRef]) {
    assert.ok(traversal.results.some((item) => item.ref === ref), ref);
  }

  const omitted = structuredClone(bundle);
  delete omitted.blueprint.evolution;
  assert.equal(validateBlueprint(omitted).ok, false);
  const malformed = structuredClone(bundle);
  malformed.evolution.canonicalSource.field = 'invented';
  malformed.blueprint.evolution = structuredClone(malformed.evolution);
  assert.equal(validateBlueprint(malformed).ok, false);
  const duplicate = structuredClone(bundle);
  duplicate.evolution.scopeIdentities[1].scopeRef = duplicate.evolution.scopeIdentities[0].scopeRef;
  duplicate.blueprint.evolution = structuredClone(duplicate.evolution);
  assert.equal(validateBlueprint(duplicate).ok, false);
  assert.throws(() => compileRegistryPack(duplicate), /duplicate registry ref/);

  const changed = structuredClone(bundle);
  changed.evolution.purpose = `${changed.evolution.purpose} Semantic registry change.`;
  changed.blueprint.evolution = structuredClone(changed.evolution);
  const baselineHash = validateBlueprint(bundle).semanticHash;
  const changedValidation = validateBlueprint(changed);
  assert.equal(changedValidation.ok, true, changedValidation.errors.join('\n'));
  assert.notEqual(changedValidation.semanticHash, baselineHash);
});

test('interface builder super-functions preserve component and element relationships', () => {
  const builder = buildInterfaceContracts(bundle.blueprint);
  const screens = builder.build();
  assert.equal(screens.length, bundle.blueprint.screens.length);
  const instance = builder.instantiateComponent('component.vexlife.terrain-node', { terrainNodeRef: 'terrain.project.root-hub' });
  assert.equal(instance.instanceRef, 'instance.terrain-node.terrain.project.root-hub');
  assert.ok(instance.slots.some((slot) => slot.slotRef === 'slot.terrain-node.collapse'));
  assert.equal(builder.requireElement('element.thread.open-conversation').screenRef, 'screen.vexlife.chat');
});

test('process factory fails closed and compiles a source-bound no-effect plan', () => {
  const validation = validateProcessFactory(bundle.factory);
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  const factory = new ProcessFactory(bundle.factory);
  const missing = factory.compile({ processRef: 'process.vexlife.conversation.send-addressed' });
  assert.equal(missing.state, 'BLOCKED_MISSING_INPUT');
  const blocked = factory.compile({
    processRef: 'process.vexlife.conversation.send-addressed',
    inputs: { channelRef: 'channel.c', speakerRef: 'person.v', recipientRefs: ['role.vex.guide'], originalLanguage: 'en', originalContent: 'hello' },
    authority: { effects: [] }
  });
  assert.equal(blocked.state, 'BLOCKED_AUTHORITY');
  const ready = factory.compile({
    processRef: 'process.vexlife.conversation.send-addressed',
    inputs: { channelRef: 'channel.c', speakerRef: 'person.v', recipientRefs: ['role.vex.guide'], originalLanguage: 'en', originalContent: 'hello' },
    sourceRefs: { channel: 'state.channel.current.1' },
    authority: { effects: ['LOCAL_APPEND'] },
    resourceBudget: { requiredTokens: 200, availableTokens: 1000 },
    recipientRef: 'role.vex.guide'
  });
  assert.equal(ready.state, 'PLAN_READY_NO_EFFECT');
  assert.equal(ready.plan.effectOwnerRule.includes('conversation service'), true);
  const receipt = factory.renderReceipt(ready.plan, { disposition: 'MESSAGE_APPENDED', outputRefs: ['message.1'] });
  assert.equal(receipt.processRef, 'process.vexlife.conversation.send-addressed');
  assert.ok(receipt.outputHash);
});

test('semantic journeys suppress repeated navigation while preserving retraceability', () => {
  const ledger = new JourneyLedger({ limit: 2 });
  const input = { journeyRef: 'j1', elementRef: 'element.nav.chat', interactionRef: 'interaction.nav.chat', actionRef: 'action.view.select', fromFrame: { screenRef: 'screen.a' }, toFrame: { screenRef: 'screen.b' }, subjectRef: 'screen.b', formedAt: '2026-07-30T00:00:00Z' };
  assert.equal(ledger.append(input).changed, true);
  assert.equal(ledger.append({ ...input, journeyRef: 'j2' }).changed, false);
  assert.equal(ledger.events.length, 1);
  assert.equal(ledger.currentTrajectory()[0].elementRef, 'element.nav.chat');
});

test('blueprint impact names affected refs without breaking stable platform mains', () => {
  const before = structuredClone(bundle.blueprint);
  const after = structuredClone(bundle.blueprint);
  after.version = '0.3.1-candidate';
  after.actions.find((item) => item.actionRef === 'action.message.send').inputSchema.replyToMessageRef = 'ref?';
  const report = buildBlueprintImpact(before, after);
  assert.ok(report.affectedNodeRefs.includes('action.message.send'));
  assert.equal(report.stableMainsIntentionallyBroken, false);
  assert.equal(report.changeClass, 'COMPATIBLE_EXTENSION_OR_CLARIFICATION');
});

// [VXG RealForever]
