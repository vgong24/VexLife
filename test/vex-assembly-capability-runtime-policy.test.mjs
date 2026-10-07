import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ACCEPTED_CAPABILITY_RUNTIME_MODES,
  applyCapabilityRuntimeStartupPolicy,
  resolveCapabilityRuntimeStartupMode,
  validateCapabilityRuntimeStartupPolicy,
} from '../scripts/capability-runtime-policy-bootstrap.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POLICY_PATH = path.join(
  ROOT,
  'blueprint',
  'capability-runtime-startup-policy.json',
);
const SERVER_PATH = path.join(ROOT, 'scripts', 'serve-browser.mjs');
const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));

const WINDOWS_PROFILE =
  'profile.vexlife.operational.qwen3.5-4b.llama-cpp-b10107.windows-x64-nvidia.001';
const MAC_PROFILE =
  'profile.vexlife.operational.qwen3.5-4b.llama-cpp-b10107.macos-arm64-m4-pro-metal.001';

test('source-managed Capability startup policy is exact, closed and zero-effect', () => {
  const result = validateCapabilityRuntimeStartupPolicy(policy);
  assert.deepEqual(result, { ok: true, errors: [] });
  assert.deepEqual(policy.acceptedModes, [...ACCEPTED_CAPABILITY_RUNTIME_MODES]);
  assert.equal(policy.defaultMode, 'DIRECT_SINGLE_TURN');
  assert.deepEqual(policy.selectionAuthority, {
    serverOwned: true,
    promptSelectable: false,
    browserRequestSelectable: false,
    modelSelectable: false,
  });
  assert.ok(Object.values(policy.effects).every((value) => value === false));
});

test('both supported ordinary desktop profiles select ADOPTED_READ_ONLY', () => {
  for (const operationalProfileRef of [WINDOWS_PROFILE, MAC_PROFILE]) {
    const selection = resolveCapabilityRuntimeStartupMode({
      policy,
      operationalProfileRef,
    });
    assert.equal(selection.runtimeMode, 'ADOPTED_READ_ONLY');
    assert.equal(selection.operationalProfileRef, operationalProfileRef);
    assert.equal(selection.selectionClass, 'SOURCE_MANAGED_PROFILE_BINDING');
    assert.equal(selection.effectsPerformed, false);
  }
});

test('no exact profile binding preserves DIRECT_SINGLE_TURN compatibility', () => {
  const absent = resolveCapabilityRuntimeStartupMode({ policy });
  assert.equal(absent.runtimeMode, 'DIRECT_SINGLE_TURN');
  assert.equal(absent.selectionClass, 'SOURCE_MANAGED_COMPATIBILITY_DEFAULT');

  const unknownProfile = resolveCapabilityRuntimeStartupMode({
    policy,
    operationalProfileRef: 'profile.vexlife.operational.unregistered.001',
  });
  assert.equal(unknownProfile.runtimeMode, 'DIRECT_SINGLE_TURN');
  assert.equal(
    unknownProfile.selectionClass,
    'SOURCE_MANAGED_COMPATIBILITY_DEFAULT',
  );
});

test('explicit server-owned canonical E2 mode remains tool-free and admitted', () => {
  const selection = resolveCapabilityRuntimeStartupMode({
    policy,
    operationalProfileRef: WINDOWS_PROFILE,
    explicitRuntimeMode: 'CANONICAL_E2_UNTAUGHT_G0',
  });
  assert.equal(selection.runtimeMode, 'CANONICAL_E2_UNTAUGHT_G0');
  assert.equal(selection.selectionClass, 'EXPLICIT_SERVER_OWNED_OVERRIDE');
  assert.equal(selection.effectsPerformed, false);
});

test('unknown explicit runtime modes fail closed', () => {
  assert.throws(
    () => resolveCapabilityRuntimeStartupMode({
      policy,
      explicitRuntimeMode: 'UNRESTRICTED_TOOL_RUNTIME',
    }),
    /Unsupported VEXLIFE_CAPABILITY_RUNTIME_MODE/u,
  );
});

test('application writes only the three server-owned policy environment fields', () => {
  const environment = {
    VEXLIFE_OPERATIONAL_PROFILE_REF: MAC_PROFILE,
    RETAINED_SENTINEL: 'unchanged',
  };
  const beforeKeys = Object.keys(environment).sort();
  const selection = applyCapabilityRuntimeStartupPolicy({
    environment,
    policy,
  });
  assert.equal(selection.runtimeMode, 'ADOPTED_READ_ONLY');
  assert.equal(environment.VEXLIFE_CAPABILITY_RUNTIME_MODE, 'ADOPTED_READ_ONLY');
  assert.equal(
    environment.VEXLIFE_CAPABILITY_RUNTIME_POLICY_REF,
    policy.policyRef,
  );
  assert.equal(
    environment.VEXLIFE_CAPABILITY_RUNTIME_POLICY_SELECTION,
    'SOURCE_MANAGED_PROFILE_BINDING',
  );
  assert.equal(environment.RETAINED_SENTINEL, 'unchanged');
  assert.deepEqual(
    Object.keys(environment)
      .filter((key) => !beforeKeys.includes(key))
      .sort(),
    [
      'VEXLIFE_CAPABILITY_RUNTIME_MODE',
      'VEXLIFE_CAPABILITY_RUNTIME_POLICY_REF',
      'VEXLIFE_CAPABILITY_RUNTIME_POLICY_SELECTION',
    ],
  );
});

test('caller-selectable or effect-bearing policy variants are rejected', () => {
  const callerSelectable = structuredClone(policy);
  callerSelectable.selectionAuthority.promptSelectable = true;
  assert.equal(validateCapabilityRuntimeStartupPolicy(callerSelectable).ok, false);

  const effectBearing = structuredClone(policy);
  effectBearing.effects.network = true;
  assert.equal(validateCapabilityRuntimeStartupPolicy(effectBearing).ok, false);

  const duplicateProfile = structuredClone(policy);
  duplicateProfile.operationalProfileBindings.push(
    structuredClone(duplicateProfile.operationalProfileBindings[0]),
  );
  assert.equal(validateCapabilityRuntimeStartupPolicy(duplicateProfile).ok, false);
});

test('bootstrap import is evaluated before the browser core import', () => {
  const source = fs.readFileSync(SERVER_PATH, 'utf8');
  const bootstrapImport =
    "import './capability-runtime-policy-bootstrap.mjs';";
  const coreImport =
    'createVexLifeBrowserServer as createCoreVexLifeBrowserServer';
  assert.ok(source.includes(bootstrapImport));
  assert.ok(source.includes(coreImport));
  assert.ok(source.indexOf(bootstrapImport) < source.indexOf(coreImport));
  assert.equal(
    source.match(/capability-runtime-policy-bootstrap\.mjs/gu)?.length,
    1,
  );
});

// [VXG RealForever]
