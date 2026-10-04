import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BLUEPRINT_MAPPING_SCHEMA,
  MAPPING_DISPOSITIONS,
  enumerateBlueprintSources,
  mapBlueprintToPlatformBlueprint
} from '../src/core/blueprint-mapper.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.VEXLIFE_A0_TEST_ROOT || path.resolve(here, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function fixture() {
  return {
    blueprint: readJson('blueprint/vexlife.blueprint.json'),
    platforms: readJson('blueprint/platforms.json'),
    foundation: readJson('blueprint/android-construction-foundation.json')
  };
}

function heldRules(blueprint) {
  return enumerateBlueprintSources(blueprint).map(({ ancestryPath }) => ({
    ancestryPath,
    disposition: 'HELD',
    reasonOrNull: 'A0 defines the mapping contract only; implementation is not admitted in this stage.'
  }));
}

test('mapper enumerates every canonical universal include with stable ancestry', () => {
  const { blueprint } = fixture();
  const sources = enumerateBlueprintSources(blueprint);
  assert.ok(sources.length > 10);
  assert.equal(new Set(sources.map((entry) => entry.ancestryPath)).size, sources.length);
  assert.ok(sources.some((entry) => entry.ancestryPath === 'includes.homeBridge' && entry.sourcePath === 'blueprint/home-bridge-registry.json'));
  assert.ok(sources.some((entry) => entry.ancestryPath === 'includes.androidRemoteVessel' && entry.sourcePath === 'blueprint/android-remote-vessel-registry.json'));
});

test('mapper is deterministic, preserves canonical ancestry, and does not mutate inputs', () => {
  const { blueprint, platforms, foundation } = fixture();
  const rules = heldRules(blueprint);
  const before = structuredClone({ blueprint, platforms, foundation, rules });
  const input = {
    sourceBlueprint: blueprint,
    platformRegistry: platforms,
    platformRef: 'platform.android',
    foundation,
    mappingRef: 'mapping.vexlife.android-construction.a0.test',
    mappingRules: rules
  };
  const first = mapBlueprintToPlatformBlueprint(input);
  const second = mapBlueprintToPlatformBlueprint({ ...input, mappingRules: [...rules].reverse() });
  assert.deepEqual(first, second);
  assert.deepEqual({ blueprint, platforms, foundation, rules }, before);
  assert.equal(first.schemaVersion, BLUEPRINT_MAPPING_SCHEMA);
  assert.equal(first.targetPlatform.platformRef, 'platform.android');
  assert.equal(first.foundation.registryRef, foundation.registryRef);
  assert.equal(first.canonicalAncestryRequired, true);
  assert.equal(first.effects, false);
  assert.equal(first.mappings.length, enumerateBlueprintSources(blueprint).length);
  assert.ok(first.mappings.every((entry) => entry.disposition === 'HELD'));
});

test('mapper exposes exactly the admitted mapping disposition vocabulary', () => {
  assert.deepEqual([...MAPPING_DISPOSITIONS], ['MAPPED', 'PLATFORM_SPECIFIC', 'HELD', 'UNSUPPORTED']);
});

test('mapper fails closed when a canonical source lacks an explicit disposition', () => {
  const { blueprint, platforms, foundation } = fixture();
  const rules = heldRules(blueprint).slice(1);
  assert.throws(() => mapBlueprintToPlatformBlueprint({
    sourceBlueprint: blueprint,
    platformRegistry: platforms,
    platformRef: 'platform.android',
    foundation,
    mappingRef: 'mapping.vexlife.android-construction.a0.missing',
    mappingRules: rules
  }), /every canonical source requires an explicit mapping rule/u);
});

test('mapper rejects unknown or duplicate ancestry rules', () => {
  const { blueprint, platforms, foundation } = fixture();
  const rules = heldRules(blueprint);
  assert.throws(() => mapBlueprintToPlatformBlueprint({
    sourceBlueprint: blueprint,
    platformRegistry: platforms,
    platformRef: 'platform.android',
    foundation,
    mappingRef: 'mapping.vexlife.android-construction.a0.unknown',
    mappingRules: [...rules, { ancestryPath: 'includes.not-real', disposition: 'HELD', reasonOrNull: 'none' }]
  }), /unknown ancestry path/u);
  assert.throws(() => mapBlueprintToPlatformBlueprint({
    sourceBlueprint: blueprint,
    platformRegistry: platforms,
    platformRef: 'platform.android',
    foundation,
    mappingRef: 'mapping.vexlife.android-construction.a0.duplicate',
    mappingRules: [...rules, structuredClone(rules[0])]
  }), /duplicate mapping rule/u);
});

test('HELD and UNSUPPORTED remain truthful and cannot claim platform bindings', () => {
  const { blueprint, platforms, foundation } = fixture();
  const rules = heldRules(blueprint);
  const missingReason = structuredClone(rules);
  missingReason[0] = { ancestryPath: missingReason[0].ancestryPath, disposition: 'HELD' };
  assert.throws(() => mapBlueprintToPlatformBlueprint({
    sourceBlueprint: blueprint,
    platformRegistry: platforms,
    platformRef: 'platform.android',
    foundation,
    mappingRef: 'mapping.vexlife.android-construction.a0.no-reason',
    mappingRules: missingReason
  }), /requires reasonOrNull/u);
  const fakeBinding = structuredClone(rules);
  fakeBinding[0].platformBindingRefOrNull = 'binding.fake';
  assert.throws(() => mapBlueprintToPlatformBlueprint({
    sourceBlueprint: blueprint,
    platformRegistry: platforms,
    platformRef: 'platform.android',
    foundation,
    mappingRef: 'mapping.vexlife.android-construction.a0.fake-binding',
    mappingRules: fakeBinding
  }), /cannot claim platformBindingRefOrNull/u);
});

test('mapper rejects platform/foundation drift and unsupported dispositions', () => {
  const { blueprint, platforms, foundation } = fixture();
  const rules = heldRules(blueprint);
  assert.throws(() => mapBlueprintToPlatformBlueprint({
    sourceBlueprint: blueprint,
    platformRegistry: platforms,
    platformRef: 'platform.unknown',
    foundation,
    mappingRef: 'mapping.vexlife.android-construction.a0.bad-platform',
    mappingRules: rules
  }), /platformRef must resolve exactly once/u);
  const invalidRules = structuredClone(rules);
  invalidRules[0].disposition = 'MAGIC';
  assert.throws(() => mapBlueprintToPlatformBlueprint({
    sourceBlueprint: blueprint,
    platformRegistry: platforms,
    platformRef: 'platform.android',
    foundation,
    mappingRef: 'mapping.vexlife.android-construction.a0.bad-disposition',
    mappingRules: invalidRules
  }), /unsupported mapping disposition/u);
});

test('A0 output is inert and the mapper source has no repository/runtime effect imports', () => {
  const { blueprint, platforms, foundation } = fixture();
  const output = mapBlueprintToPlatformBlueprint({
    sourceBlueprint: blueprint,
    platformRegistry: platforms,
    platformRef: 'platform.android',
    foundation,
    mappingRef: 'mapping.vexlife.android-construction.a0.boundary',
    mappingRules: heldRules(blueprint)
  });
  assert.deepEqual(output.boundaries, {
    canonicalRegistryWrites: false,
    stateRelayRuntimeMutation: false,
    androidRuntimeGeneration: false,
    compose: false,
    gradle: false,
    manifest: false,
    home: false,
    network: false,
    model: false,
    publication: false
  });
  assert.equal(Object.isFrozen(output), true);
  assert.equal(Object.isFrozen(output.mappings), true);
  const source = fs.readFileSync(path.join(here, '../src/core/blueprint-mapper.mjs'), 'utf8');
  for (const forbidden of ['node:fs', 'node:child_process', 'writeJson(', 'fetch(', 'gh ', 'git ']) {
    assert.equal(source.includes(forbidden), false, `effect-free mapper source must not contain ${forbidden}`);
  }
});

// [VXG RealForever]
