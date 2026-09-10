import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileModelConnection } from './model-connection-compiler.mjs';
import { formVexSelfCapabilityFrame } from './vex-self-capability-frame.mjs';

export const MODEL_CONNECTION_TURN_COMPOSER_SCHEMA = 'vexlife.model-connection-turn-composer/v1';

const CAPABILITY_RUNTIME_SCHEMA = 'vexlife.capability-assimilation-runtime/v1';
const ADOPTED_MODE = 'ADOPTED_READ_ONLY';
const DISPATCH_SCHEMA = 'vexlife.capability-assimilation-scheduler-dispatch/v1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HEX64 = /^[0-9a-f]{64}$/u;
const CONTEXT_KEYS = Object.freeze([
  'homeRef',
  'deviceRef',
  'companionLineageRef',
  'projectRef',
  'threadRef',
  'channelRef',
  'screenRef',
  'selectedNodeRef'
]);

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function nonempty(value) {
  return typeof value === 'string' && value.length > 0;
}
function freezeDeep(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (object(value)) return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, freezeDeep(child)])
  ));
  return value;
}
function clone(value) {
  return structuredClone(value);
}
function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}
function boundedContext(value = {}) {
  if (!object(value)) return {};
  return Object.fromEntries(CONTEXT_KEYS.map((key) => [key, value[key] ?? null]));
}
function unknown(reasonCode) {
  return freezeDeep({
    schemaVersion: MODEL_CONNECTION_TURN_COMPOSER_SCHEMA,
    state: 'UNKNOWN',
    reasonCode,
    modelConnectionProjection: null,
    selfCapabilityFrame: null,
    actuallyUsedRefs: [],
    effectAuthorityGranted: false
  });
}
function adoptedCapabilityInput(runtime) {
  if (!object(runtime) || runtime.schemaVersion !== CAPABILITY_RUNTIME_SCHEMA) {
    return { state: 'UNKNOWN_RUNTIME_PROJECTION', value: null };
  }
  if (runtime.mode !== ADOPTED_MODE) {
    return { state: 'UNKNOWN_CAPABILITY_INPUT_NOT_PROJECTED', value: null };
  }
  const input = runtime.capabilityFrameInput;
  if (!object(input) || !nonempty(input.roleRef) || !nonempty(input.platformRef)) {
    return { state: 'UNKNOWN_CAPABILITY_INPUT_NOT_PROJECTED', value: null };
  }
  for (const key of ['projectCapabilityStages', 'permissionStages', 'effectStages', 'resourceStages']) {
    if (!object(input[key])) return { state: 'UNKNOWN_CAPABILITY_INPUT_NOT_PROJECTED', value: null };
  }
  return { state: 'CURRENT', value: freezeDeep(clone(input)) };
}
function dispatchActualUse(runtime) {
  const receipts = runtime.schedulerDispatchReceipts;
  if (!Array.isArray(receipts)) return { state: 'UNKNOWN_RUNTIME_USE_EVIDENCE', refs: [] };
  const refs = [];
  for (const receipt of receipts) {
    if (!object(receipt) || receipt.schemaVersion !== DISPATCH_SCHEMA ||
        !nonempty(receipt.requestRef) || !nonempty(receipt.capabilityRef) ||
        !Number.isSafeInteger(receipt.schedulerGeneration) || receipt.schedulerGeneration < 1 ||
        !nonempty(receipt.workerLeaseRef) || !nonempty(receipt.admissionReceiptRef) ||
        !HEX64.test(receipt.admissionReceiptFingerprint ?? '') ||
        !nonempty(receipt.toolCallRef) || !nonempty(receipt.completionReceiptRef) ||
        !HEX64.test(receipt.completionReceiptFingerprint ?? '') ||
        receipt.externalEffectsExecuted !== false) {
      return { state: 'UNKNOWN_RUNTIME_USE_EVIDENCE', refs: [] };
    }
    refs.push(receipt.capabilityRef);
  }
  return { state: 'CURRENT', refs: [...new Set(refs)].sort() };
}

export function loadModelConnectionTurnSources(root = ROOT) {
  return freezeDeep({
    capabilityRegistry: readJson(root, 'blueprint/capability-registry.json'),
    runtimeCapabilityRegistry: readJson(root, 'blueprint/model-runtime-capabilities.json'),
    modelConnectionBindingRegistry: readJson(root, 'blueprint/model-connection-binding-registry.json'),
    modelBundleRegistry: readJson(root, 'blueprint/model-bundle-registry.json'),
    operationalProfileRegistry: readJson(root, 'blueprint/vex-operational-profiles.json')
  });
}

export function createModelConnectionTurnComposer({
  sourceBundle = loadModelConnectionTurnSources(),
  selfCapabilityTokenBudget = 1200,
  clock = () => new Date().toISOString()
} = {}) {
  if (!object(sourceBundle)) throw new TypeError('one model-connection source bundle is required');
  if (!Number.isInteger(selfCapabilityTokenBudget) || selfCapabilityTokenBudget < 128) {
    throw new TypeError('selfCapabilityTokenBudget must be an integer >= 128');
  }
  if (typeof clock !== 'function') throw new TypeError('composer clock must be one function');

  function composeTurn({ modelTurnWitness, capabilityRuntime = null, currentContext = {} } = {}) {
    if (!object(modelTurnWitness)) return unknown('MODEL_TURN_WITNESS_NOT_PROJECTED');
    const capability = adoptedCapabilityInput(capabilityRuntime);
    if (capability.state !== 'CURRENT') return unknown(capability.state);
    const used = dispatchActualUse(capabilityRuntime);
    if (used.state !== 'CURRENT') return unknown(used.state);
    try {
      const modelConnectionProjection = compileModelConnection({
        ...sourceBundle,
        capabilityInput: capability.value,
        modelTurnWitness,
        actuallyUsedRefs: used.refs
      });
      const selfCapabilityFrame = formVexSelfCapabilityFrame({
        modelConnectionProjection,
        currentContext: boundedContext(currentContext),
        tokenBudget: selfCapabilityTokenBudget,
        formedAt: clock()
      });
      return freezeDeep({
        schemaVersion: MODEL_CONNECTION_TURN_COMPOSER_SCHEMA,
        state: 'CURRENT_SOURCE_BOUND_REUSABLE_PROJECTION',
        reasonCode: null,
        modelConnectionProjection,
        selfCapabilityFrame,
        actuallyUsedRefs: used.refs,
        effectAuthorityGranted: false
      });
    } catch {
      return unknown('SOURCE_BINDING_REJECTED');
    }
  }

  return Object.freeze({
    schemaVersion: MODEL_CONNECTION_TURN_COMPOSER_SCHEMA,
    composeTurn
  });
}

// [VXG RealForever]
