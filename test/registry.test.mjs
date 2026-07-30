import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { compileRegistryPack, buildRegistryProjection } from '../src/core/registry.mjs';
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
