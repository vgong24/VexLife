import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { loadBlueprint } from './blueprint.mjs';
import {
  deriveRequiredLensRefs,
  scaffoldFeatureContract,
  validateHumanIntroduction
} from './feature-registry.mjs';
import { readJson, requireSafeRelativePath, semanticHash } from './utils.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const VEXLIFE_ROOT = path.resolve(HERE, '../..');

export const FEATURE_CONSTRUCTION_REGISTRY_SCHEMA = 'vexlife.feature-construction-registry/v1';
export const FEATURE_CONSTRUCTION_PACKET_SCHEMA = 'vexlife.feature-construction-packet/v1';
export const FEATURE_CONSTRUCTION_SOURCE_PROFILE_SCHEMA = 'vexlife.feature-construction-source-profile/v1';

const EXPECTED_STAGE_REFS = Object.freeze([
  '01_ORIENT_CURRENT_SOURCE',
  '02_FORM_FEATURE_CANDIDATE',
  '03_DISCOVER_EXISTING_OWNERS_AND_REUSE',
  '04_PLACE_WORK_AND_PROGRESS',
  '05_PLACE_HUMAN_SURFACE_AND_PRESENTATION_IF_NEEDED',
  '06_BIND_ACTION_PERMISSION_EFFECT_IF_NEEDED',
  '07_BIND_LOCALIZATION_ACCESSIBILITY_RECOVERY',
  '08_DEFINE_EXACT_SOURCE_MEMBRANE_AND_HELD_SCOPE',
  '09_IMPLEMENT_BOUNDED_CANDIDATE',
  '10_PROVE_EXACT_SOURCE_AND_RENDERED_BEHAVIOR',
  '11_RUN_AFFECTED_REVIEW_LENSES_AND_ASSURANCE',
  '12_LIFECYCLE_CURRENTNESS_READY_MERGE_POSTMERGE',
  '13_RELEASE_CLAIM_AND_RETURN_TERMINAL'
]);

const DEFINITELY_NON_EXTERNAL_EFFECTS = new Set([
  'READ_ONLY',
  'READ_PROJECTION',
  'USER_LAYOUT_ONLY',
  'LOCAL_DRAFT',
  'NO_EFFECT'
]);

const clone = (value) => structuredClone(value);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const uniqueStrings = (items) => Array.isArray(items) && items.every(nonempty) && new Set(items).size === items.length;

function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === expected.length
    && expected.every((key) => Object.hasOwn(value, key));
}

function rawFileRecord(root, relativePath) {
  const safe = requireSafeRelativePath(relativePath, 'source path').replaceAll('\\', '/');
  const absolute = path.resolve(root, safe);
  const relative = path.relative(path.resolve(root), absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`source path escapes repository: ${safe}`);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error(`feature construction source path missing: ${safe}`);
  const bytes = fs.readFileSync(absolute);
  return {
    path: safe,
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  };
}

function gitValue(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

export function loadFeatureConstructionRegistry(root = VEXLIFE_ROOT) {
  return readJson(path.join(root, 'blueprint/feature-construction-registry.json'));
}

export function validateFeatureConstructionRegistry(registry, { root = VEXLIFE_ROOT, requirePaths = true } = {}) {
  const errors = [];
  const expectedRootKeys = [
    'schemaVersion','registryRef','registryVersion','recipeRef','sourceRef','packetSchemaVersion','purpose',
    'effects','mutationAuthorityGranted','candidateStatus','sourceBindings','recipeSourcePaths','constructionStages',
    'conditionalRules','requiredCurrentnessChecks','requiredProofClasses','heldBoundaries','precedents'
  ];
  if (!exactKeys(registry, expectedRootKeys)) errors.push('feature construction registry root shape is not exact');
  if (registry?.schemaVersion !== FEATURE_CONSTRUCTION_REGISTRY_SCHEMA) errors.push('feature construction registry schemaVersion mismatch');
  if (registry?.registryRef !== 'registry.vexlife.feature-construction.001') errors.push('feature construction registryRef mismatch');
  if (registry?.recipeRef !== 'recipe.vexlife.feature-construction.001') errors.push('feature construction recipeRef mismatch');
  if (registry?.sourceRef !== 'source.vexlife.feature-construction-recipe') errors.push('feature construction sourceRef mismatch');
  if (registry?.packetSchemaVersion !== FEATURE_CONSTRUCTION_PACKET_SCHEMA) errors.push('feature construction packet schema mismatch');
  if (registry?.effects !== false) errors.push('feature construction registry must have effects=false');
  if (registry?.mutationAuthorityGranted !== false) errors.push('feature construction registry must have mutationAuthorityGranted=false');
  if (registry?.candidateStatus !== 'PROPOSED') errors.push('feature construction candidateStatus must be PROPOSED');

  const stages = registry?.constructionStages ?? [];
  if (stages.length !== EXPECTED_STAGE_REFS.length || stages.some((stage, index) => stage?.stageRef !== EXPECTED_STAGE_REFS[index])) {
    errors.push('feature construction stages must preserve the exact 01..13 grammar');
  }
  for (const stage of stages) {
    if (!exactKeys(stage, ['stageRef','obligation','purpose']) || !nonempty(stage.obligation) || !nonempty(stage.purpose)) {
      errors.push(`malformed feature construction stage ${stage?.stageRef ?? 'unknown'}`);
    }
  }

  const bindingRefs = new Set();
  const allPaths = new Set();
  for (const binding of registry?.sourceBindings ?? []) {
    if (!exactKeys(binding, ['bindingRef','ownerRef','purpose','paths'])) {
      errors.push(`malformed source binding ${binding?.bindingRef ?? 'unknown'}`);
      continue;
    }
    if (!nonempty(binding.bindingRef) || bindingRefs.has(binding.bindingRef)) errors.push(`duplicate or missing source binding ${binding.bindingRef ?? 'unknown'}`);
    bindingRefs.add(binding.bindingRef);
    if (!nonempty(binding.ownerRef) || !nonempty(binding.purpose) || !uniqueStrings(binding.paths) || binding.paths.length === 0) {
      errors.push(`${binding.bindingRef} has invalid owner/purpose/paths`);
    }
    for (const sourcePath of binding.paths ?? []) {
      try {
        const normalized = requireSafeRelativePath(sourcePath, 'source binding path').replaceAll('\\', '/');
        if (allPaths.has(normalized)) errors.push(`source binding path duplicated across owners: ${normalized}`);
        allPaths.add(normalized);
        if (requirePaths) rawFileRecord(root, normalized);
      } catch (error) {
        errors.push(`${binding.bindingRef} invalid source path ${sourcePath}: ${error.message}`);
      }
    }
  }

  if (!uniqueStrings(registry?.recipeSourcePaths ?? []) || registry.recipeSourcePaths.length === 0) {
    errors.push('recipeSourcePaths must be a non-empty unique string array');
  }
  for (const sourcePath of registry?.recipeSourcePaths ?? []) {
    try {
      requireSafeRelativePath(sourcePath, 'recipe source path');
      if (requirePaths) rawFileRecord(root, sourcePath);
    } catch (error) {
      errors.push(`invalid recipe source path ${sourcePath}: ${error.message}`);
    }
  }

  for (const field of ['requiredCurrentnessChecks','requiredProofClasses','heldBoundaries']) {
    if (!uniqueStrings(registry?.[field] ?? []) || registry[field].length === 0) errors.push(`${field} must be a non-empty unique string array`);
  }
  if (!(registry?.conditionalRules?.length)) errors.push('conditionalRules must not be empty');
  if (!(registry?.precedents?.length)) errors.push('precedents must not be empty');

  return {
    ok: errors.length === 0,
    errors,
    stats: {
      sourceBindings: bindingRefs.size,
      sourcePaths: allPaths.size,
      stages: stages.length
    }
  };
}

export function computeCurrentSourceProfileHash(profile) {
  const core = clone(profile);
  delete core.profileHash;
  return semanticHash(core);
}

export function buildCurrentSourceProfile({
  root = VEXLIFE_ROOT,
  registry = loadFeatureConstructionRegistry(root)
} = {}) {
  const validation = validateFeatureConstructionRegistry(registry, { root, requirePaths: true });
  if (!validation.ok) throw new Error(validation.errors[0]);

  const bundle = loadBlueprint(root);
  const sourceBindings = registry.sourceBindings.map((binding) => ({
    bindingRef: binding.bindingRef,
    ownerRef: binding.ownerRef,
    purpose: binding.purpose,
    paths: binding.paths.map((sourcePath) => rawFileRecord(root, sourcePath))
  }));
  const recipeSources = registry.recipeSourcePaths.map((sourcePath) => rawFileRecord(root, sourcePath));
  const profile = {
    schemaVersion: FEATURE_CONSTRUCTION_SOURCE_PROFILE_SCHEMA,
    repositoryRef: 'github.vgong24.VexLife',
    recipeRef: registry.recipeRef,
    gitHeadOrNull: gitValue(root, ['rev-parse', 'HEAD']),
    gitTreeOrNull: gitValue(root, ['rev-parse', 'HEAD^{tree}']),
    platformRefs: [...new Set((bundle.blueprint.platforms ?? []).map((item) => item.platformRef).filter(Boolean))].sort(),
    sourceBindings,
    recipeSources
  };
  return Object.freeze({ ...profile, profileHash: computeCurrentSourceProfileHash(profile) });
}

function validateCurrentSourceProfile(profile) {
  if (profile?.schemaVersion !== FEATURE_CONSTRUCTION_SOURCE_PROFILE_SCHEMA) throw new Error('currentSourceProfile schema mismatch');
  if (profile?.repositoryRef !== 'github.vgong24.VexLife') throw new Error('currentSourceProfile repository mismatch');
  if (!uniqueStrings(profile?.platformRefs ?? []) || profile.platformRefs.length === 0) throw new Error('currentSourceProfile platformRefs invalid');
  if (!(profile?.sourceBindings?.length) || !(profile?.recipeSources?.length)) throw new Error('currentSourceProfile source identities missing');
  if (!nonempty(profile.profileHash) || profile.profileHash !== computeCurrentSourceProfileHash(profile)) throw new Error('currentSourceProfile profileHash mismatch');
}

function normalizeCandidate(candidate, currentSourceProfile) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('candidate must be an object');
  const value = clone(candidate);
  if (!nonempty(value.featureRef) || !value.featureRef.startsWith('feature.')) throw new Error('candidate featureRef must start with feature.');
  if (!nonempty(value.purpose)) throw new Error('candidate purpose is required');
  if (value.status !== 'PROPOSED') throw new Error('candidate status must be PROPOSED');
  if (!uniqueStrings(value.platformRefs ?? []) || value.platformRefs.length === 0) throw new Error('candidate platformRefs must be a non-empty unique array');
  for (const platformRef of value.platformRefs) {
    if (!currentSourceProfile.platformRefs.includes(platformRef)) throw new Error(`candidate references unknown platformRef ${platformRef}`);
  }
  if (!Array.isArray(value.canonicalNodeRefs) || value.canonicalNodeRefs.some((ref) => !nonempty(ref))) throw new Error('candidate canonicalNodeRefs must be a string array');
  const introductionErrors = validateHumanIntroduction(value, { requireCurrentPlan: false });
  if (introductionErrors.length) throw new Error(introductionErrors[0]);
  return value;
}

function candidateUnknowns(candidate) {
  const unknowns = [];
  for (const field of ['resourceClass','dataClass','effectClass','concurrencyClass']) {
    if (!nonempty(candidate[field]) || candidate[field] === 'UNCLASSIFIED') {
      unknowns.push({ field, reason: `${field} remains unclassified in the PROPOSED candidate` });
    }
  }
  if (!nonempty(candidate.rollbackRouteRef) || candidate.rollbackRouteRef === 'REQUIRED') {
    unknowns.push({ field: 'rollbackRouteRef', reason: 'rollback/recovery binding remains required before effectful implementation' });
  }
  if (candidate.humanIntroduction?.routeState === 'HELD') {
    unknowns.push({ field: 'humanIntroduction.routeState', reason: 'human introduction route is HELD and must currentize before claiming lived onboarding' });
  }
  return unknowns;
}

function compileStages(registry, { humanVisibleUI, definitelyNonExternal }) {
  return registry.constructionStages.map((stage) => {
    if (stage.stageRef === '05_PLACE_HUMAN_SURFACE_AND_PRESENTATION_IF_NEEDED' && !humanVisibleUI) {
      return { ...clone(stage), applicability: 'NOT_APPLICABLE_WITH_REASON', reason: 'NO_HUMAN_VISIBLE_CANONICAL_NODE_REFS' };
    }
    if (stage.stageRef === '06_BIND_ACTION_PERMISSION_EFFECT_IF_NEEDED' && definitelyNonExternal) {
      return { ...clone(stage), applicability: 'NOT_APPLICABLE_WITH_REASON', reason: 'CANDIDATE_EFFECT_CLASS_REQUIRES_NO_EXTERNAL_EFFECT_AUTHORITY' };
    }
    return { ...clone(stage), applicability: 'REQUIRED', reason: null };
  });
}

export function compileFeatureConstructionPacket({
  candidate,
  currentSourceProfile,
  registry
} = {}) {
  if (!registry) throw new Error('registry is required');
  const validation = validateFeatureConstructionRegistry(registry, { requirePaths: false });
  if (!validation.ok) throw new Error(validation.errors[0]);
  validateCurrentSourceProfile(currentSourceProfile);
  const normalizedCandidate = normalizeCandidate(candidate, currentSourceProfile);
  const requiredReviewLensRefs = deriveRequiredLensRefs(normalizedCandidate);
  const candidateSemanticHash = semanticHash(normalizedCandidate);
  const humanVisibleUI = normalizedCandidate.canonicalNodeRefs.some((ref) =>
    ref.startsWith('screen.') || ref.startsWith('element.') || ref.startsWith('region.'));
  const definitelyNonExternal = DEFINITELY_NON_EXTERNAL_EFFECTS.has(normalizedCandidate.effectClass);
  const constructionStages = compileStages(registry, { humanVisibleUI, definitelyNonExternal });
  const notApplicableStages = constructionStages
    .filter((stage) => stage.applicability === 'NOT_APPLICABLE_WITH_REASON')
    .map((stage) => ({ stageRef: stage.stageRef, reason: stage.reason }));

  const heldBoundaries = [...registry.heldBoundaries];
  if (normalizedCandidate.effectClass === 'LOCAL_DRAFT') heldBoundaries.push('LOCAL_DRAFT_DOES_NOT_AUTHORIZE_SAVE_DEPLOY_OR_PUBLISH');
  if (!humanVisibleUI) heldBoundaries.push('NO_HUMAN_VISIBLE_UI_DOES_NOT_CREATE_PRESENTATION_OWNERSHIP');
  if (definitelyNonExternal) heldBoundaries.push('NO_EXTERNAL_EFFECT_AUTHORITY_REQUIRED_OR_GRANTED');
  for (const platformRef of currentSourceProfile.platformRefs) {
    if (!normalizedCandidate.platformRefs.includes(platformRef)) heldBoundaries.push(`PLATFORM_CONFORMANCE_NOT_INFERRED:${platformRef}`);
  }

  const requiredProofClasses = [...registry.requiredProofClasses];
  if (humanVisibleUI) requiredProofClasses.splice(2, 0, 'AFFECTED_VISUAL_ASSURANCE');

  const packetHash = semanticHash({
    candidate: normalizedCandidate,
    recipeContract: registry,
    currentSourceProfile
  });
  return Object.freeze({
    schemaVersion: FEATURE_CONSTRUCTION_PACKET_SCHEMA,
    packetRef: `packet.vexlife.feature-construction.${packetHash.slice(0, 24)}`,
    packetHash,
    recipeRef: registry.recipeRef,
    currentSourceProfileHash: currentSourceProfile.profileHash,
    featureRef: normalizedCandidate.featureRef,
    purpose: normalizedCandidate.purpose,
    candidateStatus: normalizedCandidate.status,
    candidateSemanticHash,
    platformRefs: Object.freeze([...normalizedCandidate.platformRefs]),
    humanIntroduction: Object.freeze(clone(normalizedCandidate.humanIntroduction)),
    requiredReviewLensRefs: Object.freeze(requiredReviewLensRefs),
    sourceBindings: Object.freeze(clone(currentSourceProfile.sourceBindings)),
    constructionStages: Object.freeze(constructionStages),
    heldBoundaries: Object.freeze([...new Set(heldBoundaries)]),
    requiredCurrentnessChecks: Object.freeze([...registry.requiredCurrentnessChecks]),
    requiredProofClasses: Object.freeze(requiredProofClasses),
    notApplicableStages: Object.freeze(notApplicableStages),
    unknowns: Object.freeze(candidateUnknowns(normalizedCandidate)),
    nextSafeAction: Object.freeze({
      stageRef: '01_ORIENT_CURRENT_SOURCE',
      action: 'ORIENT_CURRENT_SOURCE',
      effectClass: 'READ_ONLY',
      authorityGranted: false
    }),
    effects: false,
    sourceMutationAuthority: false,
    branchAuthority: false,
    claimAuthority: false,
    mergeAuthority: false,
    publicationAuthority: false
  });
}

export function scaffoldFeatureConstructionCandidate(args = {}) {
  return scaffoldFeatureContract(args);
}

// [VXG RealForever]
