#!/usr/bin/env node
import fs from 'node:fs';

export const CAPABILITY_RUNTIME_STARTUP_POLICY_SCHEMA =
  'vexlife.capability-runtime-startup-policy/v1';

export const ACCEPTED_CAPABILITY_RUNTIME_MODES = Object.freeze([
  'DIRECT_SINGLE_TURN',
  'ADOPTED_READ_ONLY',
  'CANONICAL_E2_UNTAUGHT_G0',
]);

const ACCEPTED_MODE_SET = new Set(ACCEPTED_CAPABILITY_RUNTIME_MODES);
const STABLE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/u;
const POLICY_PATH = new URL('../blueprint/capability-runtime-startup-policy.json', import.meta.url);
const EXPECTED_ROOT_KEYS = Object.freeze([
  'acceptedModes',
  'defaultMode',
  'effects',
  'explicitServerOverrideAllowed',
  'operationalProfileBindings',
  'policyRef',
  'schemaVersion',
  'selectionAuthority',
  'sourceRefs',
].sort());

function exactKeys(value, expected) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be one object`);
  }
}

function requireStableRef(value, label) {
  if (typeof value !== 'string' || !STABLE_REF.test(value)) {
    throw new TypeError(`${label} must be one stable ref`);
  }
}

function clone(value) {
  return structuredClone(value);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

export function validateCapabilityRuntimeStartupPolicy(value) {
  const errors = [];
  try {
    requireObject(value, 'Capability runtime startup policy');
    if (!exactKeys(value, EXPECTED_ROOT_KEYS)) {
      throw new Error('Capability runtime startup policy fields are not exact');
    }
    if (value.schemaVersion !== CAPABILITY_RUNTIME_STARTUP_POLICY_SCHEMA) {
      throw new Error(`Capability runtime startup policy schema must be ${CAPABILITY_RUNTIME_STARTUP_POLICY_SCHEMA}`);
    }
    requireStableRef(value.policyRef, 'policyRef');
    if (JSON.stringify(value.acceptedModes) !== JSON.stringify(ACCEPTED_CAPABILITY_RUNTIME_MODES)) {
      throw new Error('acceptedModes must equal the closed source-managed runtime mode vocabulary');
    }
    if (!ACCEPTED_MODE_SET.has(value.defaultMode)) {
      throw new Error('defaultMode is not an accepted Capability runtime mode');
    }
    if (value.explicitServerOverrideAllowed !== true) {
      throw new Error('explicitServerOverrideAllowed must be true');
    }

    requireObject(value.selectionAuthority, 'selectionAuthority');
    if (!exactKeys(value.selectionAuthority, [
      'browserRequestSelectable',
      'modelSelectable',
      'promptSelectable',
      'serverOwned',
    ])) {
      throw new Error('selectionAuthority fields are not exact');
    }
    if (
      value.selectionAuthority.serverOwned !== true
      || value.selectionAuthority.promptSelectable !== false
      || value.selectionAuthority.browserRequestSelectable !== false
      || value.selectionAuthority.modelSelectable !== false
    ) {
      throw new Error('selectionAuthority must remain server-owned and non-caller-selectable');
    }

    requireObject(value.effects, 'effects');
    const expectedEffects = [
      'Home',
      'Memory',
      'filesystemWrite',
      'model',
      'network',
      'process',
      'publication',
      'training',
    ];
    if (!exactKeys(value.effects, expectedEffects)
        || expectedEffects.some((key) => value.effects[key] !== false)) {
      throw new Error('Capability runtime startup policy must perform zero effects');
    }

    if (!Array.isArray(value.operationalProfileBindings)
        || value.operationalProfileBindings.length === 0) {
      throw new Error('operationalProfileBindings must be non-empty');
    }
    const profileRefs = new Set();
    for (const [index, binding] of value.operationalProfileBindings.entries()) {
      requireObject(binding, `operationalProfileBindings[${index}]`);
      if (!exactKeys(binding, ['operationalProfileRef', 'runtimeMode'])) {
        throw new Error(`operationalProfileBindings[${index}] fields are not exact`);
      }
      requireStableRef(
        binding.operationalProfileRef,
        `operationalProfileBindings[${index}].operationalProfileRef`,
      );
      if (profileRefs.has(binding.operationalProfileRef)) {
        throw new Error(`duplicate operational profile binding ${binding.operationalProfileRef}`);
      }
      profileRefs.add(binding.operationalProfileRef);
      if (!ACCEPTED_MODE_SET.has(binding.runtimeMode)) {
        throw new Error(
          `operationalProfileBindings[${index}].runtimeMode is not accepted`,
        );
      }
    }

    if (!Array.isArray(value.sourceRefs)
        || value.sourceRefs.length === 0
        || value.sourceRefs.some((ref) => typeof ref !== 'string' || !STABLE_REF.test(ref))
        || new Set(value.sourceRefs).size !== value.sourceRefs.length) {
      throw new Error('sourceRefs must contain unique stable refs');
    }
  } catch (error) {
    errors.push(error.message);
  }
  return freeze({ ok: errors.length === 0, errors });
}

export function resolveCapabilityRuntimeStartupMode({
  policy,
  operationalProfileRef = null,
  explicitRuntimeMode = null,
} = {}) {
  const validation = validateCapabilityRuntimeStartupPolicy(policy);
  if (!validation.ok) {
    throw new Error(`Capability runtime startup policy is invalid: ${validation.errors.join('; ')}`);
  }

  if (explicitRuntimeMode !== null && explicitRuntimeMode !== undefined && explicitRuntimeMode !== '') {
    if (typeof explicitRuntimeMode !== 'string' || !ACCEPTED_MODE_SET.has(explicitRuntimeMode)) {
      throw new Error(`Unsupported VEXLIFE_CAPABILITY_RUNTIME_MODE: ${String(explicitRuntimeMode)}`);
    }
    if (policy.explicitServerOverrideAllowed !== true) {
      throw new Error('Explicit server-owned Capability runtime override is not allowed');
    }
    return freeze({
      schemaVersion: 'vexlife.capability-runtime-startup-selection/v1',
      policyRef: policy.policyRef,
      runtimeMode: explicitRuntimeMode,
      operationalProfileRef: operationalProfileRef || null,
      selectionClass: 'EXPLICIT_SERVER_OWNED_OVERRIDE',
      effectsPerformed: false,
    });
  }

  if (operationalProfileRef !== null && operationalProfileRef !== undefined && operationalProfileRef !== '') {
    requireStableRef(operationalProfileRef, 'operationalProfileRef');
    const binding = policy.operationalProfileBindings.find(
      (item) => item.operationalProfileRef === operationalProfileRef,
    );
    if (binding) {
      return freeze({
        schemaVersion: 'vexlife.capability-runtime-startup-selection/v1',
        policyRef: policy.policyRef,
        runtimeMode: binding.runtimeMode,
        operationalProfileRef,
        selectionClass: 'SOURCE_MANAGED_PROFILE_BINDING',
        effectsPerformed: false,
      });
    }
  }

  return freeze({
    schemaVersion: 'vexlife.capability-runtime-startup-selection/v1',
    policyRef: policy.policyRef,
    runtimeMode: policy.defaultMode,
    operationalProfileRef: operationalProfileRef || null,
    selectionClass: 'SOURCE_MANAGED_COMPATIBILITY_DEFAULT',
    effectsPerformed: false,
  });
}

export function loadCapabilityRuntimeStartupPolicy(
  policyPath = POLICY_PATH,
) {
  const source = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  const validation = validateCapabilityRuntimeStartupPolicy(source);
  if (!validation.ok) {
    throw new Error(`Capability runtime startup policy is invalid: ${validation.errors.join('; ')}`);
  }
  return freeze(clone(source));
}

export function applyCapabilityRuntimeStartupPolicy({
  environment = process.env,
  policy = loadCapabilityRuntimeStartupPolicy(),
} = {}) {
  requireObject(environment, 'environment');
  const selection = resolveCapabilityRuntimeStartupMode({
    policy,
    operationalProfileRef: environment.VEXLIFE_OPERATIONAL_PROFILE_REF ?? null,
    explicitRuntimeMode: environment.VEXLIFE_CAPABILITY_RUNTIME_MODE ?? null,
  });
  environment.VEXLIFE_CAPABILITY_RUNTIME_MODE = selection.runtimeMode;
  environment.VEXLIFE_CAPABILITY_RUNTIME_POLICY_REF = selection.policyRef;
  environment.VEXLIFE_CAPABILITY_RUNTIME_POLICY_SELECTION = selection.selectionClass;
  return selection;
}

export const appliedCapabilityRuntimeStartupSelection =
  applyCapabilityRuntimeStartupPolicy();

// [VXG RealForever]
