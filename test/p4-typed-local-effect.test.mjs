import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadBlueprint } from '../src/core/blueprint.mjs';
import {
  CAPABILITY_ASSIMILATION_MODES,
  createCapabilityAssimilationRuntime
} from '../src/core/capability-assimilation-runtime.mjs';
import { ProcessFactory } from '../src/core/process-factory.mjs';
import {
  TYPED_COMMAND_AUTHORITY_SCHEMA,
  TYPED_COMMAND_CAPABILITY_REF,
  TYPED_COMMAND_EFFECT_REF,
  createTypedCommandEffectSupport,
  validateTypedCommandRegistry
} from '../src/core/typed-command-runtime.mjs';
import { semanticHash } from '../src/core/utils.mjs';
import {
  ACCEPTED_CAPABILITY_RUNTIME_MODES,
  resolveCapabilityRuntimeStartupMode
} from '../scripts/capability-runtime-policy-bootstrap.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = loadBlueprint(ROOT);
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint/cli-typed-command-registry.json'), 'utf8'));

function fixedClock(start = '2026-10-21T08:00:00.000Z') {
  let value = Date.parse(start);
  return () => value += 250;
}

function authority({ taskIntent, context, formedAt = '2026-10-21T07:59:00.000Z', expiresAt = '2026-10-21T09:00:00.000Z' }) {
  return {
    schemaVersion: TYPED_COMMAND_AUTHORITY_SCHEMA,
    authorityRef: 'authority.vexlife.p4.orientation.a001',
    state: 'CURRENT',
    capabilityRef: TYPED_COMMAND_CAPABILITY_REF,
    effectRef: TYPED_COMMAND_EFFECT_REF,
    commandRef: 'command.vexlife.orientation.current',
    homeRef: context.homeRef,
    companionLineageRef: context.companionLineageRef,
    threadRef: context.threadRef,
    taskIntentSha256: semanticHash(taskIntent),
    parametersSha256: semanticHash({}),
    workingScopeRef: 'scope.vexlife.repository.current',
    resourceLeaseRef: 'resource-lease.vexlife.p4.orientation.a001',
    formedAt,
    expiresAt,
    singleUseNonce: 'nonce.vexlife.p4.orientation.a001',
    sourceRefs: ['authority.user.vexlife.p4.orientation.a001']
  };
}

test('P4 typed command registry binds exactly one current orientation process and accepted effect mode', () => {
  assert.deepEqual(validateTypedCommandRegistry(registry, { sourceRoot: ROOT }), { ok: true, errors: [] });
  assert.equal(registry.commands.length, 1);
  const command = registry.commands[0];
  assert.equal(command.commandRef, 'command.vexlife.orientation.current');
  assert.equal(command.capabilityRef, TYPED_COMMAND_CAPABILITY_REF);
  assert.equal(command.processRef, 'process.vexlife.cli.execute-typed');
  assert.equal(command.executableClass, 'CURRENT_NODE_RUNTIME');
  assert.deepEqual(command.allowedParameterKeys, []);
  assert.equal(command.effects.process, true);
  assert.ok(Object.entries(command.effects).filter(([key]) => key !== 'process').every(([, value]) => value === false));
  assert.ok(ACCEPTED_CAPABILITY_RUNTIME_MODES.includes('ADOPTED_AUTHORIZED_EFFECT'));
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint/capability-runtime-startup-policy.json'), 'utf8'));
  const selection = resolveCapabilityRuntimeStartupMode({
    policy,
    explicitRuntimeMode: 'ADOPTED_AUTHORIZED_EFFECT'
  });
  assert.equal(selection.runtimeMode, 'ADOPTED_AUTHORIZED_EFFECT');
  assert.equal(selection.selectionClass, 'EXPLICIT_SERVER_OWNED_OVERRIDE');
  assert.equal(selection.effectsPerformed, false);
});

test('P4 Native Worker typed orientation consumes one external authority and produces a verified no-network result', async () => {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-p4-typed-command-'));
  const authorityPath = path.join(runtimeRoot, 'authority.json');
  const taskIntent = 'Orient to the current VexLife source and tell me what work is current.';
  const context = {
    homeRef: 'vex-home.p4-typed-command-test',
    companionLineageRef: 'companion-lineage.vexlife.p4-typed-command-test',
    threadRef: 'thread.vexlife.p4-typed-command-test'
  };
  fs.writeFileSync(authorityPath, `${JSON.stringify(authority({ taskIntent, context }), null, 2)}\n`, { mode: 0o600 });
  try {
    const support = createTypedCommandEffectSupport({
      sourceRoot: ROOT,
      runtimeRoot,
      authorityPath,
      clock: fixedClock()
    });
    const admitted = support.currentAuthority({ taskIntent, context });
    assert.equal(admitted.state, 'ADMITTED');
    assert.equal(admitted.commandRef, 'command.vexlife.orientation.current');

    const factory = new ProcessFactory(bundle.factory);
    const compiled = factory.compile({
      processRef: 'process.vexlife.cli.execute-typed',
      inputs: {
        commandRef: admitted.commandRef,
        parameters: {},
        workingScopeRef: admitted.workingScopeRef,
        resourceLeaseRef: admitted.resourceLeaseRef
      },
      sourceRefs: {
        capabilityRegistry: bundle.capabilities.registryRef,
        commandRegistry: support.registryRef
      },
      authority: { effects: ['EXECUTE_TYPED_COMMAND'] },
      recipientRef: 'role.vex.companion',
      now: '2026-10-21T08:00:01.000Z'
    });
    assert.equal(compiled.state, 'PLAN_READY_NO_EFFECT');
    assert.equal(compiled.plan.externalEffectsExecuted, false);

    const result = await support.execute({
      request: {
        capabilityRef: TYPED_COMMAND_CAPABILITY_REF,
        arguments: { commandRef: admitted.commandRef, parameters: {} }
      },
      workRef: 'work.capability-practice.p4-orientation-test',
      taskIntent,
      context,
      authority: admitted,
      processPlan: compiled.plan
    });
    assert.equal(result.state, 'TYPED_COMMAND_EFFECT_COMPLETED');
    assert.equal(result.effectReceipt.externalEffectsExecuted, true);
    assert.equal(result.effectReceipt.processEffectPerformed, true);
    assert.equal(result.effectReceipt.networkEffectPerformed, false);
    assert.equal(result.effectReceipt.sourceMutationPerformed, false);
    assert.equal(result.observation.capabilityRef, TYPED_COMMAND_CAPABILITY_REF);
    assert.equal(result.observation.currentness.state, 'CURRENT');
    assert.equal(result.observation.payload.orientation.currentness, 'CURRENT');
    assert.equal(result.observation.payload.orientation.repository.slug, 'vgong24/VexLife');
    assert.equal(result.nativeWorker.state, 'DONE');
    assert.equal(support.currentAuthority({ taskIntent, context }).state, 'HELD');
  } finally {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});

test('P4 authorized-effect runtime lets the model request one admitted typed effect while ToolResultRelay remains no-effect', async () => {
  let inferenceCount = 0;
  let executeCount = 0;
  const taskIntent = 'Orient to the current VexLife source and tell me what work is current.';
  const context = {
    taskRef: 'task.vexlife.p4.effect-test',
    projectRef: 'project.vexlife.tocompletion',
    homeRef: 'vex-home.p4-effect-runtime-test',
    companionLineageRef: 'companion-lineage.vexlife.p4-effect-runtime-test',
    threadRef: 'thread.vexlife.p4-effect-runtime-test',
    channelRef: 'channel.vexlife.p4-effect-runtime-test'
  };
  const admitted = Object.freeze({
    state: 'ADMITTED',
    authorityRef: 'authority.vexlife.p4.effect-runtime-test',
    semanticFingerprint: 'a'.repeat(64),
    capabilityRef: TYPED_COMMAND_CAPABILITY_REF,
    effectRef: TYPED_COMMAND_EFFECT_REF,
    commandRegistryRef: registry.registryRef,
    commandRef: 'command.vexlife.orientation.current',
    parametersTemplate: {},
    parametersSha256: semanticHash({}),
    workingScopeRef: 'scope.vexlife.repository.current',
    resourceLeaseRef: 'resource-lease.vexlife.p4.effect-runtime-test',
    expiresAt: '2026-10-21T09:00:00.000Z',
    sourceRefs: ['authority.user.vexlife.p4.effect-runtime-test']
  });
  const effectReceipt = Object.freeze({
    schemaVersion: 'vexlife.typed-command-effect-receipt/v1',
    effectReceiptRef: 'receipt.vexlife.typed-command.effect-runtime-test',
    state: 'TYPED_COMMAND_EFFECT_COMPLETED',
    effectRef: TYPED_COMMAND_EFFECT_REF,
    externalEffectsExecuted: true,
    processEffectPerformed: true
  });
  const authorizedEffectSupport = Object.freeze({
    registryRef: registry.registryRef,
    currentAuthority() { return admitted; },
    async execute({ workRef, processPlan }) {
      executeCount += 1;
      assert.ok(workRef.startsWith('work.capability-practice.'));
      assert.equal(processPlan.processRef, 'process.vexlife.cli.execute-typed');
      return {
        effectReceipt,
        observation: {
          summaryRef: 'summary.capability.vexlife.cli.typed.effect-runtime-test',
          capabilityRef: TYPED_COMMAND_CAPABILITY_REF,
          sourceRefs: [registry.registryRef, effectReceipt.effectReceiptRef],
          currentness: {
            state: 'CURRENT',
            sourceRef: 'source.vexlife.typed-command-runtime',
            sourceVersionRef: 'typed-command-runtime.v1',
            compatibility: 'COMPATIBLE'
          },
          payload: {
            state: 'TYPED_COMMAND_COMPLETED',
            commandRef: admitted.commandRef,
            effectReceiptRef: effectReceipt.effectReceiptRef,
            orientation: { state: 'GROUNDED', currentness: 'CURRENT' },
            effects: { externalEffectsExecuted: true, processEffectPerformed: true }
          }
        }
      };
    }
  });
  const runtime = createCapabilityAssimilationRuntime({
    capabilityRegistry: bundle.capabilities,
    processFactoryDefinition: bundle.factory,
    schedulerRegistry: bundle.schedulerRegistry,
    mode: CAPABILITY_ASSIMILATION_MODES.ADOPTED_AUTHORIZED_EFFECT,
    authorizedEffectSupport,
    clock: fixedClock()
  });
  const out = await runtime.resolveTurn({
    taskIntent,
    context,
    endpointProfile: { profileRef: 'profile.test', admitted: true, endpoint: 'http://127.0.0.1:1', model: 'test' },
    inference: async () => {
      inferenceCount += 1;
      if (inferenceCount === 1) {
        return {
          content: JSON.stringify({
            intentDisposition: 'REQUEST_AUTHORIZED_EFFECT',
            requests: [{
              requestRef: 'effect.orientation.current',
              capabilityRef: TYPED_COMMAND_CAPABILITY_REF,
              arguments: { commandRef: admitted.commandRef, parameters: {} },
              dependencyRefs: [],
              reasonCue: 'Read current repository orientation.'
            }]
          }),
          model: 'model.test.p4-request'
        };
      }
      return { content: 'I oriented to the current repository result.', model: 'model.test.p4-synthesis' };
    }
  });
  assert.equal(inferenceCount, 2);
  assert.equal(executeCount, 1);
  assert.equal(out.response.content, 'I oriented to the current repository result.');
  assert.equal(out.runtimeProjection.mode, CAPABILITY_ASSIMILATION_MODES.ADOPTED_AUTHORIZED_EFFECT);
  assert.equal(out.runtimeProjection.externalEffectsExecuted, true);
  assert.equal(out.runtimeProjection.effectExecutionReceipts.length, 1);
  assert.equal(out.runtimeProjection.effectExecutionReceipts[0].effectReceiptRef, effectReceipt.effectReceiptRef);
  assert.equal(out.runtimeProjection.schedulerDispatchReceipts.length, 1);
  assert.equal(out.runtimeProjection.schedulerDispatchReceipts[0].externalEffectsExecuted, false);
  assert.equal(out.runtimeProjection.schedulerDispatchReceipts[0].capabilityRef, TYPED_COMMAND_CAPABILITY_REF);
  assert.ok(out.runtimeProjection.observationRefs.length === 1);
});

test('P4 effect mode fails closed to read-only formation when no one-time authority is current', async () => {
  let inferenceCount = 0;
  const runtime = createCapabilityAssimilationRuntime({
    capabilityRegistry: bundle.capabilities,
    processFactoryDefinition: bundle.factory,
    schedulerRegistry: bundle.schedulerRegistry,
    mode: CAPABILITY_ASSIMILATION_MODES.ADOPTED_AUTHORIZED_EFFECT,
    authorizedEffectSupport: {
      registryRef: registry.registryRef,
      currentAuthority() { return { state: 'HELD', reasonCode: 'AUTHORITY_ABSENT' }; },
      async execute() { throw new Error('effect executor must not run without authority'); }
    },
    clock: fixedClock()
  });
  const out = await runtime.resolveTurn({
    taskIntent: 'Just answer without any local effect.',
    context: { taskRef: 'task.vexlife.p4.no-authority', threadRef: 'thread.vexlife.p4.no-authority' },
    endpointProfile: { profileRef: 'profile.test', admitted: true, endpoint: 'http://127.0.0.1:1', model: 'test' },
    inference: async () => {
      inferenceCount += 1;
      return inferenceCount === 1
        ? { content: JSON.stringify({ intentDisposition: 'NO_READ_ONLY_FUNCTION_NEEDED', requests: [] }), model: 'model.test.request' }
        : { content: 'No effect was executed.', model: 'model.test.synthesis' };
    }
  });
  assert.equal(out.runtimeProjection.externalEffectsExecuted, false);
  assert.deepEqual(out.runtimeProjection.effectExecutionReceipts, []);
});

// [VXG RealForever]
