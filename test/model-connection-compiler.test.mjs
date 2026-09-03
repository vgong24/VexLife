import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  compileModelConnection,
  validateModelConnectionBindingRegistry,
  validateModelRuntimeCapabilityRegistry
} from '../src/core/model-connection-compiler.mjs';
import { normalizeModelRuntimeResponse } from '../src/core/model-runtime-adapter.mjs';
import {
  formModelRuntimeInvocationEvidence,
  formModelTurnWitness,
  verifyModelTurnWitness
} from '../src/core/model-turn-witness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));

const capabilityRegistry = readJson('blueprint/capability-registry.json');
const runtimeCapabilityRegistry = readJson('blueprint/model-runtime-capabilities.json');
const bindingRegistry = readJson('blueprint/model-connection-binding-registry.json');
const modelBundleRegistry = readJson('blueprint/model-bundle-registry.json');
const operationalProfileRegistry = readJson('blueprint/vex-operational-profiles.json');

function externalWitness() {
  const endpointProfile = {
    profileRef: 'model-profile.vexlife.browser-companion.local',
    admitted: true,
    endpoint: 'http://127.0.0.1:18080',
    model: 'Qwen3.5-4B-Q4_K_M'
  };
  const normalized = normalizeModelRuntimeResponse({
    responseBody: {
      id: 'chatcmpl-r3-proof',
      object: 'chat.completion',
      created: 1788400000,
      model: 'C:\\models\\Qwen_Qwen3.5-4B-Q4_K_M.gguf',
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content: 'Source-bound R3 proof.',
          reasoning_content: 'ephemeral-r3-reasoning'
        }
      }],
      usage: { prompt_tokens: 4, completion_tokens: 5, total_tokens: 9 },
      timings: { prompt_n: 4, prompt_ms: 2, predicted_n: 5, predicted_ms: 3 }
    },
    endpointProfile,
    observedAt: '2026-09-03T03:40:00.000Z'
  });
  const invocationEvidence = formModelRuntimeInvocationEvidence({
    endpointProfileRef: endpointProfile.profileRef,
    sanitizedEndpointOrigin: endpointProfile.endpoint,
    requestBodySha256: 'a'.repeat(64),
    runtimeObservation: normalized.runtimeObservation,
    httpStatus: 200,
    actualHttpCall: true,
    formedAt: '2026-09-03T03:40:01.000Z'
  });
  return formModelTurnWitness({
    turnRef: 'turn.vexlife.r3-proof',
    requestMessageRef: 'message.vexlife.r3-proof.request',
    responseMessageRef: 'message.vexlife.r3-proof.response',
    runtimeObservation: normalized.runtimeObservation,
    invocationEvidence,
    currentnessRefs: ['github.commit.vexlife.97919adb85d0609633ea7d1673adc83ed1300c7f'],
    formedAt: '2026-09-03T03:40:02.000Z'
  });
}

function capabilityInput(overrides = {}) {
  return {
    roleRef: 'role.vex.operations',
    platformRef: 'platform.windows',
    ...overrides
  };
}

function compile(overrides = {}) {
  return compileModelConnection({
    capabilityRegistry,
    capabilityInput: capabilityInput(),
    runtimeCapabilityRegistry,
    modelConnectionBindingRegistry: bindingRegistry,
    modelBundleRegistry,
    operationalProfileRegistry,
    modelTurnWitness: externalWitness(),
    ...overrides
  });
}

test('R3 registries source-bind the accepted census without granting held native/multimodal execution', () => {
  assert.equal(validateModelRuntimeCapabilityRegistry(runtimeCapabilityRegistry), true);
  assert.equal(validateModelConnectionBindingRegistry(bindingRegistry), true);
  const projection = compile();
  assert.equal(verifyModelTurnWitness(externalWitness()), true);
  assert.equal(projection.modelBundleRef, 'model-bundle.vexlife.g0.qwen3.5-4b.q4-k-m.001');
  assert.equal(projection.operationalProfileRef, 'profile.vexlife.operational.qwen3.5-4b.llama-cpp-b10107.windows-x64-nvidia.001');
  assert.equal(projection.runtimeRevisionRef, 'github.commit.ggml-org.llama-cpp.c0bc8591e8815c63cb01dd3f051a8b0df02501c9');
  assert.deepEqual(projection.runtimeCapability.heldCellEntries.map((entry) => entry.cellRef), ['C11', 'C12']);
  assert.equal(projection.observedEffects.nativeToolExecutionObserved, false);
  assert.equal(projection.observedEffects.multimodalInputObserved, false);
  assert.equal(projection.effectAuthorityGranted, false);
  const search = projection.capabilityEntries.find((entry) => entry.capabilityRef === 'capability.search');
  assert.equal(search.disposition, 'AVAILABLE');
  assert.deepEqual(search.requiredRuntimeCellRefs, ['C00']);
  assert.deepEqual(search.modelParticipationClasses, ['MODEL_SYNTHESIS', 'MODEL_TOOL_PROPOSAL']);
});

test('runtime declaration cannot upgrade a canonical held capability', () => {
  const projection = compile({
    capabilityInput: capabilityInput({
      projectCapabilityStages: { 'capability.search': 'DISCOVERABLE' }
    })
  });
  const search = projection.capabilityEntries.find((entry) => entry.capabilityRef === 'capability.search');
  assert.equal(search.canonicalExecutable, false);
  assert.equal(search.disposition, 'HELD');
  assert.equal(search.dispositionReason, 'CANONICAL_STAGE_DISCOVERABLE');
});

test('an intentionally held runtime prerequisite narrows an otherwise executable canonical capability', () => {
  const bindings = structuredClone(bindingRegistry);
  bindings.bindings.find((entry) => entry.subjectRef === 'capability.search').requiredRuntimeCellRefs = ['C11'];
  const projection = compile({ modelConnectionBindingRegistry: bindings });
  const search = projection.capabilityEntries.find((entry) => entry.capabilityRef === 'capability.search');
  assert.equal(search.disposition, 'HELD');
  assert.equal(search.runtimeRequirementState, 'HELD');
  assert.equal(search.dispositionReason, 'NO_MULTIMODAL_EXECUTION_AUTHORITY_OR_LIVED_PROOF');
});

test('missing runtime prerequisite stays UNKNOWN and explicit not-supported stays UNAVAILABLE', () => {
  const unknownBindings = structuredClone(bindingRegistry);
  unknownBindings.bindings.find((entry) => entry.subjectRef === 'capability.search').requiredRuntimeCellRefs = ['C99'];
  let projection = compile({ modelConnectionBindingRegistry: unknownBindings });
  let search = projection.capabilityEntries.find((entry) => entry.capabilityRef === 'capability.search');
  assert.equal(search.disposition, 'UNKNOWN');

  const unsupportedRuntime = structuredClone(runtimeCapabilityRegistry);
  unsupportedRuntime.profiles[0].cells.push({
    cellRef: 'C13',
    requestClass: 'SYNTHETIC_NOT_SUPPORTED_PROOF',
    disposition: 'NOT_SUPPORTED_AT_PIN'
  });
  const unsupportedBindings = structuredClone(bindingRegistry);
  unsupportedBindings.bindings.find((entry) => entry.subjectRef === 'capability.search').requiredRuntimeCellRefs = ['C13'];
  projection = compile({
    runtimeCapabilityRegistry: unsupportedRuntime,
    modelConnectionBindingRegistry: unsupportedBindings
  });
  search = projection.capabilityEntries.find((entry) => entry.capabilityRef === 'capability.search');
  assert.equal(search.disposition, 'UNAVAILABLE');
});

test('actuallyUsedRefs cannot relabel held or unknown capability truth', () => {
  const bindings = structuredClone(bindingRegistry);
  bindings.bindings.find((entry) => entry.subjectRef === 'capability.search').requiredRuntimeCellRefs = ['C12'];
  assert.throws(
    () => compile({
      modelConnectionBindingRegistry: bindings,
      actuallyUsedRefs: ['capability.search']
    }),
    /cannot claim a held/
  );
});

test('current source identity and external witness must agree', () => {
  const badRuntime = structuredClone(runtimeCapabilityRegistry);
  badRuntime.profiles[0].runtimeRevisionRef = 'github.commit.ggml-org.llama-cpp.deadbeef';
  assert.throws(() => compile({ runtimeCapabilityRegistry: badRuntime }), /does not bind current model/);

  const badWitness = structuredClone(externalWitness());
  badWitness.runtimeObservation.modelProvenance.compatibilityModel = 'DifferentModel';
  assert.throws(() => compile({ modelTurnWitness: badWitness }), /closed external ModelTurnWitness/);
});

test('model-connection projection is stable under binding input order', () => {
  const reversed = structuredClone(bindingRegistry);
  reversed.bindings.reverse();
  const left = compile();
  const right = compile({ modelConnectionBindingRegistry: reversed });
  assert.equal(left.projectionSha256, right.projectionSha256);
  assert.deepEqual(left, right);
});

test('canonical module registry registers the R3 fragment exactly once', () => {
  const root = readJson('blueprint/module-registry.json');
  const fragment = 'blueprint/module-registry/model-connection.json';
  assert.equal(root.includes.modules.filter((value) => value === fragment).length, 1);
  const modules = readJson(fragment);
  assert.deepEqual(modules.map((entry) => entry.moduleRef), [
    'module.vexlife.core.model-connection-compiler',
    'module.vexlife.core.vex-self-capability-frame'
  ]);
});

// [VXG RealForever]
