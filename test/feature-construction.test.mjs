import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { deriveRequiredLensRefs, scaffoldFeatureContract } from '../src/core/feature-registry.mjs';
import {
  VEXLIFE_ROOT,
  buildCurrentSourceProfile,
  compileFeatureConstructionPacket,
  computeCurrentSourceProfileHash,
  loadFeatureConstructionRegistry,
  validateFeatureConstructionRegistry
} from '../src/core/feature-construction.mjs';

const SCRIPT = path.join(VEXLIFE_ROOT, 'scripts/feature-construction.mjs');
const PACKAGE = JSON.parse(fs.readFileSync(path.join(VEXLIFE_ROOT, 'package.json'), 'utf8'));
const ORIENTATION = JSON.parse(fs.readFileSync(path.join(VEXLIFE_ROOT, 'blueprint/orientation.json'), 'utf8'));

const introduction = () => ({
  disposition: 'DISCOVERABLE_ONLY',
  routeState: 'CURRENT',
  planRefOrNull: null,
  rationale: 'The proposed feature remains explicitly discoverable without inventing a separate guided walkthrough.'
});

function candidate({ ui = false, effectClass = 'UNCLASSIFIED' } = {}) {
  const value = scaffoldFeatureContract({
    featureRef: ui ? 'feature.vexlife.fcf07-browser-example' : 'feature.vexlife.fcf07-non-ui-example',
    purpose: ui ? 'Exercise a human-visible proposed feature packet.' : 'Exercise a non-UI no-effect proposed feature packet.',
    platformRefs: ['platform.browser'],
    canonicalNodeRefs: ui ? ['screen.vexlife.chat'] : [],
    humanIntroduction: introduction()
  });
  value.effectClass = effectClass;
  return value;
}

function fileSha256(relativePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(VEXLIFE_ROOT, relativePath))).digest('hex');
}

test('FCF-07 registry is exact, no-effect and every named source path exists', () => {
  const registry = loadFeatureConstructionRegistry();
  const validation = validateFeatureConstructionRegistry(registry);
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  assert.equal(registry.schemaVersion, 'vexlife.feature-construction-registry/v1');
  assert.equal(registry.registryRef, 'registry.vexlife.feature-construction.001');
  assert.equal(registry.recipeRef, 'recipe.vexlife.feature-construction.001');
  assert.equal(registry.sourceRef, 'source.vexlife.feature-construction-recipe');
  assert.equal(registry.effects, false);
  assert.equal(registry.mutationAuthorityGranted, false);
  assert.equal(registry.constructionStages.length, 13);
});

test('FCF-07 compiler is deterministic and binds candidate, recipe and current source profile', () => {
  const registry = loadFeatureConstructionRegistry();
  const profile = buildCurrentSourceProfile({ registry });
  const proposed = candidate({ ui: true });
  const first = compileFeatureConstructionPacket({ candidate: proposed, currentSourceProfile: profile, registry });
  const second = compileFeatureConstructionPacket({ candidate: proposed, currentSourceProfile: profile, registry });
  assert.deepEqual(first, second);
  assert.equal(first.packetHash, second.packetHash);
  assert.equal(first.candidateSemanticHash.length, 64);
  assert.equal(first.packetHash.length, 64);
  assert.equal(first.currentSourceProfileHash, profile.profileHash);

  const drifted = structuredClone(profile);
  drifted.sourceBindings[0].paths[0].sha256 = '0'.repeat(64);
  drifted.profileHash = computeCurrentSourceProfileHash(drifted);
  const afterDrift = compileFeatureConstructionPacket({ candidate: proposed, currentSourceProfile: drifted, registry });
  assert.notEqual(afterDrift.packetHash, first.packetHash);
});

test('FCF-07 reuses canonical deriveRequiredLensRefs and compiles an existing scaffold candidate without writes', () => {
  const registry = loadFeatureConstructionRegistry();
  const profile = buildCurrentSourceProfile({ registry });
  const proposed = candidate({ ui: true });
  const packet = compileFeatureConstructionPacket({ candidate: proposed, currentSourceProfile: profile, registry });
  assert.deepEqual(packet.requiredReviewLensRefs, deriveRequiredLensRefs(proposed));
  assert.equal(packet.candidateStatus, 'PROPOSED');
  assert.equal(packet.effects, false);
  for (const key of ['sourceMutationAuthority','branchAuthority','claimAuthority','mergeAuthority','publicationAuthority']) {
    assert.equal(packet[key], false, key);
  }
});

test('FCF-07 UI and non-UI composition remain truthful and do not manufacture authority', () => {
  const registry = loadFeatureConstructionRegistry();
  const profile = buildCurrentSourceProfile({ registry });
  const uiPacket = compileFeatureConstructionPacket({ candidate: candidate({ ui: true }), currentSourceProfile: profile, registry });
  assert.equal(uiPacket.notApplicableStages.some((item) => item.stageRef === '05_PLACE_HUMAN_SURFACE_AND_PRESENTATION_IF_NEEDED'), false);
  assert.equal(uiPacket.requiredProofClasses.includes('AFFECTED_VISUAL_ASSURANCE'), true);
  assert.equal(uiPacket.sourceBindings.some((binding) => binding.ownerRef === 'registry.vexlife.presentation-graph.001'), true);

  const noUiPacket = compileFeatureConstructionPacket({ candidate: candidate({ ui: false, effectClass: 'READ_ONLY' }), currentSourceProfile: profile, registry });
  assert.deepEqual(
    noUiPacket.notApplicableStages.filter((item) => ['05_PLACE_HUMAN_SURFACE_AND_PRESENTATION_IF_NEEDED','06_BIND_ACTION_PERMISSION_EFFECT_IF_NEEDED'].includes(item.stageRef)),
    [
      { stageRef: '05_PLACE_HUMAN_SURFACE_AND_PRESENTATION_IF_NEEDED', reason: 'NO_HUMAN_VISIBLE_CANONICAL_NODE_REFS' },
      { stageRef: '06_BIND_ACTION_PERMISSION_EFFECT_IF_NEEDED', reason: 'NO_ACTION_PERMISSION_OR_EFFECT_BINDING_REQUIRED_BY_PROPOSED_CANDIDATE' }
    ]
  );
  assert.equal(noUiPacket.requiredProofClasses.includes('AFFECTED_VISUAL_ASSURANCE'), false);
  assert.equal(noUiPacket.heldBoundaries.includes('NO_EXTERNAL_EFFECT_AUTHORITY_REQUIRED_OR_GRANTED'), true);

  const localDraftPacket = compileFeatureConstructionPacket({ candidate: candidate({ ui: false, effectClass: 'LOCAL_DRAFT' }), currentSourceProfile: profile, registry });
  const localDraftStage = localDraftPacket.constructionStages.find((item) => item.stageRef === '06_BIND_ACTION_PERMISSION_EFFECT_IF_NEEDED');
  assert.equal(localDraftStage.applicability, 'REQUIRED');
  assert.equal(localDraftPacket.heldBoundaries.includes('NO_EXTERNAL_EFFECT_AUTHORITY_REQUIRED_OR_GRANTED'), true);
  assert.equal(localDraftPacket.heldBoundaries.includes('LOCAL_DRAFT_DOES_NOT_AUTHORIZE_SAVE_DEPLOY_OR_PUBLISH'), true);

  const readOnlyWithAction = candidate({ ui: false, effectClass: 'READ_ONLY' });
  readOnlyWithAction.actionRefs = ['action.view.select'];
  const readOnlyWithActionPacket = compileFeatureConstructionPacket({ candidate: readOnlyWithAction, currentSourceProfile: profile, registry });
  assert.equal(readOnlyWithActionPacket.constructionStages.find((item) => item.stageRef === '06_BIND_ACTION_PERMISSION_EFFECT_IF_NEEDED').applicability, 'REQUIRED');
});

test('FCF-07 packet exposes current owners, held boundaries, unknowns and a read-only next action', () => {
  const registry = loadFeatureConstructionRegistry();
  const profile = buildCurrentSourceProfile({ registry });
  const packet = compileFeatureConstructionPacket({ candidate: candidate(), currentSourceProfile: profile, registry });
  for (const ownerRef of [
    'registry.vexlife.features.001',
    'registry.vexlife.intent-orchestration.001',
    'registry.vexlife.purpose-workspaces.001',
    'registry.vexlife.presentation-graph.001',
    'foundation.vexlife.experience.001',
    'registry.vexlife.review-lenses.001',
    'orientation.vexlife.dedicated-repository.001',
    'plan.vexlife.foundation-to-demo.001'
  ]) assert.equal(packet.sourceBindings.some((binding) => binding.ownerRef === ownerRef), true, ownerRef);
  assert.equal(packet.heldBoundaries.includes('FEATURE_CONSTRUCTION_PACKET != SOURCE_AUTHORITY'), true);
  assert.equal(packet.unknowns.some((item) => item.field === 'effectClass'), true);
  assert.deepEqual(packet.nextSafeAction, {
    stageRef: '01_ORIENT_CURRENT_SOURCE',
    action: 'ORIENT_CURRENT_SOURCE',
    effectClass: 'READ_ONLY',
    authorityGranted: false
  });
});

test('FCF-07 malformed candidate boundaries fail closed', () => {
  const registry = loadFeatureConstructionRegistry();
  const profile = buildCurrentSourceProfile({ registry });
  const unknownPlatform = candidate();
  unknownPlatform.platformRefs = ['platform.mars'];
  assert.throws(() => compileFeatureConstructionPacket({ candidate: unknownPlatform, currentSourceProfile: profile, registry }), /unknown platformRef/);

  const missingIntroduction = candidate();
  delete missingIntroduction.humanIntroduction;
  assert.throws(() => compileFeatureConstructionPacket({ candidate: missingIntroduction, currentSourceProfile: profile, registry }), /missing humanIntroduction/);

  const wrongStatus = candidate();
  wrongStatus.status = 'ACTIVE';
  assert.throws(() => compileFeatureConstructionPacket({ candidate: wrongStatus, currentSourceProfile: profile, registry }), /status must be PROPOSED/);
});

test('FCF-07 CLI is read-only by default and emits one machine-readable packet', () => {
  const protectedPaths = [
    'blueprint/feature-registry.json',
    'blueprint/intent-orchestration-registry.json',
    'blueprint/purpose-workspace-registry.json',
    'blueprint/presentation-graph-registry.json',
    'blueprint/experience-foundation.json',
    'blueprint/fragments/actions.json',
    'blueprint/fragments/permissions.json',
    'blueprint/review-lens-registry.json',
    'SOURCE-MANIFEST.json'
  ];
  const before = Object.fromEntries(protectedPaths.map((sourcePath) => [sourcePath, fileSha256(sourcePath)]));
  const result = spawnSync(process.execPath, [
    SCRIPT,
    '--feature-ref','feature.vexlife.fcf07-cli-example',
    '--purpose','Compile one proposed no-write construction packet.',
    '--platforms','platform.browser',
    '--intro-disposition','DISCOVERABLE_ONLY',
    '--intro-route-state','CURRENT',
    '--intro-rationale','The packet is a read-only construction guide and does not need a separate walkthrough.'
  ], { cwd: VEXLIFE_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const packet = JSON.parse(result.stdout);
  assert.equal(packet.schemaVersion, 'vexlife.feature-construction-packet/v1');
  assert.equal(packet.effects, false);
  const after = Object.fromEntries(protectedPaths.map((sourcePath) => [sourcePath, fileSha256(sourcePath)]));
  assert.deepEqual(after, before);

  const rejected = spawnSync(process.execPath, [SCRIPT, '--write', 'true'], { cwd: VEXLIFE_ROOT, encoding: 'utf8' });
  assert.notEqual(rejected.status, 0);
});

test('FCF-07 recipe is discoverable from package command and required repository orientation', () => {
  assert.equal(PACKAGE.scripts['feature:construction'], 'node scripts/feature-construction.mjs');
  assert.equal(ORIENTATION.requiredSources.includes('docs/FEATURE-CONSTRUCTION-RECIPE.md'), true);
});

// [VXG RealForever]
