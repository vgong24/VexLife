import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import {
  buildExperienceSourceMap,
  compileExperienceRevision,
  compileRegistryPack,
  loadExperienceFoundation,
  validateExperienceFoundation
} from '../src/core/registry.mjs';

const bundle = loadBlueprint();
const foundation = loadExperienceFoundation(bundle);

function allObjectKeys(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) allObjectKeys(item, output);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  for (const [key, nested] of Object.entries(value)) {
    output.push(key);
    allObjectKeys(nested, output);
  }
  return output;
}

test('EFX00-00..03 parent-bound Experience Foundation compiles without replacing canonical owners', () => {
  assert.ok(foundation);
  assert.equal(foundation.schemaVersion, 'vexlife.experience-foundation/v1');
  assert.equal(foundation.parentExperienceRegistryRef, bundle.experience.registryRef);
  assert.equal(foundation.effects, false);

  const registry = compileRegistryPack(bundle);
  const profile = registry.experienceFoundationProfile;
  assert.ok(profile);
  assert.equal(profile.effects, false);
  assert.equal(profile.validation.ok, true, profile.validation.errors.join('\n'));

  assert.equal(registry.require(bundle.experience.registryRef).kind, 'EXPERIENCE_REGISTRY');
  assert.equal(registry.require(foundation.foundationRef).parentRef, bundle.experience.registryRef);
  assert.equal(registry.require('pattern.vexlife.action-decision').kind, 'EXPERIENCE_PATTERN');
  assert.equal(registry.require('form.vexlife.operator.slash-alias').kind, 'INTERACTION_FORM');
  assert.equal(registry.require('exposure.vexlife.primary').exposureClass, 'PRIMARY');
  assert.equal(registry.require('availability.vexlife.held').operable, false);

  const where = registry.require('command.vexlife.where');
  assert.equal(where.kind, 'COMMAND_BINDING');
  assert.equal(where.capabilityRef, 'context.where');
  assert.ok(where.edges.some((edge) => edge.type === 'CAPABILITY' && edge.to === 'context.where'));
});

test('EFX00-03..04 slash aliases resolve to canonical commands and remain projections rather than message identities', () => {
  const registry = compileRegistryPack(bundle);
  assert.equal(registry.canonicalRef('/where'), 'command.vexlife.where');
  assert.equal(registry.require('/where').ref, 'command.vexlife.where');
  assert.equal(registry.require('/help').capabilityRef, 'help.render');
  assert.equal(registry.get('/unknown-command'), null);

  for (const command of foundation.commandBindings) {
    assert.ok(command.commandRef.startsWith('command.vexlife.'));
    for (const alias of command.aliases) {
      assert.ok(alias.literal.startsWith('/'));
      assert.notEqual(alias.literal, command.commandRef);
      assert.equal(alias.formRef, 'form.vexlife.operator.slash-alias');
    }
  }
});

test('EFX00-05 source-map projection is reference-only and contains no raw content/provider payload fields', () => {
  const registry = compileRegistryPack(bundle);
  const sourceMap = buildExperienceSourceMap(registry, foundation.foundationRef);
  assert.ok(sourceMap.length > foundation.commandBindings.length);

  const allowedTopLevelKeys = new Set(['ref', 'kind', 'parentRef', 'sourceRef', 'edges']);
  const allowedEdgeKeys = new Set(['type', 'to']);
  for (const entry of sourceMap) {
    assert.deepEqual(Object.keys(entry).sort(), [...Object.keys(entry)].filter((key) => allowedTopLevelKeys.has(key)).sort());
    assert.equal(typeof entry.ref, 'string');
    for (const edge of entry.edges) {
      assert.deepEqual(Object.keys(edge).sort(), [...Object.keys(edge)].filter((key) => allowedEdgeKeys.has(key)).sort());
      assert.equal(typeof edge.type, 'string');
      assert.equal(typeof edge.to, 'string');
    }
  }

  const forbidden = new Set(foundation.sourceMapPolicy.forbiddenFieldNames.map((value) => value.toLowerCase()));
  for (const key of allObjectKeys(sourceMap)) assert.equal(forbidden.has(key.toLowerCase()), false, `forbidden source-map field ${key}`);
});

test('EFX00-06 experienceRevision is deterministic, ignores raw locale catalog values, and reacts to semantic structure', () => {
  const first = compileExperienceRevision(bundle, foundation);
  const second = compileExperienceRevision(bundle, structuredClone(foundation));
  assert.match(first, /^[a-f0-9]{64}$/u);
  assert.equal(second, first);

  const copyOnly = { ...bundle, strings: structuredClone(bundle.strings) };
  copyOnly.strings.en.__efx00CopyOnlyProof = 'Changed presentation copy that is intentionally excluded from Experience revision';
  assert.equal(compileExperienceRevision(copyOnly, foundation), first);

  const semanticChange = { ...bundle, blueprint: structuredClone(bundle.blueprint) };
  semanticChange.blueprint.contractVersion += 1;
  assert.notEqual(compileExperienceRevision(semanticChange, foundation), first);
});

test('EFX00-01..03 malformed parent, unknown command capability and duplicate aliases fail closed', () => {
  const registry = compileRegistryPack({ ...bundle, root: null, experienceFoundation: undefined });

  const wrongParent = structuredClone(foundation);
  wrongParent.parentExperienceRegistryRef = 'registry.vexlife.experience.invented';
  const wrongParentResult = validateExperienceFoundation(wrongParent, {
    registry,
    parentExperienceRegistryRef: bundle.experience.registryRef
  });
  assert.equal(wrongParentResult.ok, false);
  assert.ok(wrongParentResult.errors.some((error) => error.includes('parent must remain')));

  const unknownCapability = structuredClone(foundation);
  unknownCapability.commandBindings[0].capabilityRef = 'capability.vexlife.invented';
  const unknownCapabilityResult = validateExperienceFoundation(unknownCapability, {
    registry,
    parentExperienceRegistryRef: bundle.experience.registryRef
  });
  assert.equal(unknownCapabilityResult.ok, false);
  assert.ok(unknownCapabilityResult.errors.some((error) => error.includes('references missing ref capability.vexlife.invented')));

  const duplicateAlias = structuredClone(foundation);
  duplicateAlias.commandBindings[1].aliases[0].literal = duplicateAlias.commandBindings[0].aliases[0].literal;
  const duplicateAliasResult = validateExperienceFoundation(duplicateAlias, {
    registry,
    parentExperienceRegistryRef: bundle.experience.registryRef
  });
  assert.equal(duplicateAliasResult.ok, false);
  assert.ok(duplicateAliasResult.errors.some((error) => error.includes('duplicate command alias literal')));
});

// [VXG RealForever]
