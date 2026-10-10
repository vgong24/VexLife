import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import {
  buildVexInitializationPlan,
  resolveActiveModelBundle,
  validateModelBundleRegistry
} from '../src/core/vex-initialization.mjs';

const operationalProfiles = JSON.parse(fs.readFileSync(new URL('../blueprint/vex-operational-profiles.json', import.meta.url), 'utf8'));
const modelBundleRegistry = JSON.parse(fs.readFileSync(new URL('../blueprint/model-bundle-registry.json', import.meta.url), 'utf8'));
const artifactRegistry = JSON.parse(fs.readFileSync(new URL('../blueprint/artifact-registry.json', import.meta.url), 'utf8'));
const profile = operationalProfiles.profiles[0];

test('current G0 v1 bundle remains the live release-qualified selection', () => {
  assert.equal(modelBundleRegistry.schemaVersion, 'vexlife.model-bundle-registry/v1');
  assert.equal(modelBundleRegistry.activeModelBundleRef, 'model-bundle.vexlife.g0.qwen3.5-4b.q4-k-m.001');
  assert.deepEqual(
    validateModelBundleRegistry(modelBundleRegistry, {
      artifactRegistry,
      operationalProfileRegistry: operationalProfiles
    }),
    { ok: true, errors: [] }
  );
  const resolution = resolveActiveModelBundle({
    registry: modelBundleRegistry,
    artifactRegistry,
    operationalProfile: profile
  });
  assert.equal(resolution.state, 'MODEL_BUNDLE_RESOLVED');
  assert.equal(resolution.artifacts.length, 2);
  assert.equal(resolution.artifacts[0].artifactRef, resolution.bundle.baseModelArtifactRef);
  assert.equal(resolution.artifacts[1].artifactRef, resolution.bundle.projectorArtifactRef);
});

test('generalized v2 bundle represents a cultivated-shaped multi-artifact generation without entering the current runtime path', () => {
  const syntheticArtifacts = Array.from({ length: 12 }, (_, index) => {
    const ordinal = String(index + 1).padStart(2, '0');
    const bytes = Buffer.from('cultivated-member-' + ordinal);
    return {
      artifactRef: 'artifact.synthetic.cultivated.member-' + ordinal,
      filename: 'member-' + ordinal + '.bin',
      mediaType: 'application/octet-stream',
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      expectedBytes: bytes.length,
      maxBytes: bytes.length,
      sourceRef: 'source.synthetic.cultivated.member-' + ordinal,
      licenseRef: 'license.synthetic.test-only'
    };
  });
  const syntheticArtifactRegistry = {
    schemaVersion: 'vexlife.artifact-registry/v1',
    registryRef: 'registry.vexlife.artifacts.synthetic-cultivated',
    state: 'SYNTHETIC_TEST_ONLY',
    artifacts: syntheticArtifacts
  };
  const bundleRef = 'model-bundle.synthetic.cultivated.g2.001';
  const syntheticRegistry = {
    schemaVersion: 'vexlife.model-bundle-registry/v2',
    registryRef: 'registry.vexlife.model-bundles.001',
    activeModelBundleRef: bundleRef,
    bundles: [{
      modelBundleRef: bundleRef,
      generationRef: 'generation.synthetic.cultivated.g2',
      modelProfileRef: 'model-profile.synthetic.cultivated.g2',
      state: 'RELEASE_QUALIFIED',
      artifactBindings: syntheticArtifacts.map((artifact, index) => ({
        roleRef: 'artifact-role.synthetic.cultivated.member-' + String(index + 1).padStart(2, '0'),
        artifactRef: artifact.artifactRef
      })),
      artifactSetRef: 'artifact-set.synthetic.cultivated.g2',
      contentSetSha256: crypto.createHash('sha256').update(syntheticArtifacts.map((artifact) => artifact.sha256).join('|')).digest('hex'),
      runtimeRealizationRefs: [
        'runtime-realization.synthetic.cultivated.mlx',
        'runtime-realization.synthetic.cultivated.future'
      ],
      sourceRefs: ['source.synthetic.cultivated.test-only']
    }]
  };

  assert.deepEqual(validateModelBundleRegistry(syntheticRegistry, { artifactRegistry: syntheticArtifactRegistry }), { ok: true, errors: [] });
  const resolution = resolveActiveModelBundle({
    registry: syntheticRegistry,
    artifactRegistry: syntheticArtifactRegistry,
    operationalProfile: null
  });
  assert.equal(resolution.state, 'MODEL_BUNDLE_RUNTIME_REALIZATION_HELD');
  assert.equal(resolution.bundle.generationRef, 'generation.synthetic.cultivated.g2');
  assert.equal(resolution.artifacts.length, 12);
  assert.equal(resolution.artifactBindings.length, 12);
  assert.deepEqual(resolution.runtimeRealizationRefs, syntheticRegistry.bundles[0].runtimeRealizationRefs);
  assert.equal(resolution.contentSetSha256, syntheticRegistry.bundles[0].contentSetSha256);

  assert.throws(() => buildVexInitializationPlan({
    profile,
    modelBundle: resolution.bundle,
    modelArtifacts: resolution.artifacts,
    home: 'C:/VexHome',
    homeState: 'FRESH_HOME_ALLOWED',
    hostEvidence: { platform: 'win32', architecture: 'x64' },
    mode: 'candidate-qualification'
  }), /generalized model bundle runtime realization is not admitted by current initializer/u);
});

test('generalized v2 bundle fails closed on duplicate roles, unknown artifacts, and candidate-as-current selection', () => {
  const artifact = {
    artifactRef: 'artifact.synthetic.future.one',
    filename: 'future-one.bin',
    mediaType: 'application/octet-stream',
    sha256: crypto.createHash('sha256').update('future-one').digest('hex'),
    expectedBytes: 10,
    maxBytes: 10,
    sourceRef: 'source.synthetic.future.one',
    licenseRef: 'license.synthetic.test-only'
  };
  const artifactRegistryV2 = {
    schemaVersion: 'vexlife.artifact-registry/v1',
    registryRef: 'registry.vexlife.artifacts.synthetic-v2-negative',
    state: 'SYNTHETIC_TEST_ONLY',
    artifacts: [artifact]
  };
  const baseBundle = {
    modelBundleRef: 'model-bundle.synthetic.future.001',
    generationRef: 'generation.synthetic.future.001',
    modelProfileRef: 'model-profile.synthetic.future.001',
    state: 'RELEASE_QUALIFIED',
    artifactBindings: [{ roleRef: 'artifact-role.synthetic.future.primary', artifactRef: artifact.artifactRef }],
    artifactSetRef: 'artifact-set.synthetic.future.001',
    contentSetSha256: crypto.createHash('sha256').update(artifact.sha256).digest('hex'),
    runtimeRealizationRefs: ['runtime-realization.synthetic.future.001'],
    sourceRefs: ['source.synthetic.future.test-only']
  };
  const registryV2 = {
    schemaVersion: 'vexlife.model-bundle-registry/v2',
    registryRef: 'registry.vexlife.model-bundles.001',
    activeModelBundleRef: baseBundle.modelBundleRef,
    bundles: [baseBundle]
  };

  const duplicateRole = structuredClone(registryV2);
  duplicateRole.bundles[0].artifactBindings.push({
    roleRef: duplicateRole.bundles[0].artifactBindings[0].roleRef,
    artifactRef: artifact.artifactRef
  });
  assert.equal(validateModelBundleRegistry(duplicateRole, { artifactRegistry: artifactRegistryV2 }).ok, false);

  const unknownArtifact = structuredClone(registryV2);
  unknownArtifact.bundles[0].artifactBindings[0].artifactRef = 'artifact.synthetic.future.missing';
  const unknownValidation = validateModelBundleRegistry(unknownArtifact, { artifactRegistry: artifactRegistryV2 });
  assert.equal(unknownValidation.ok, false);
  assert.match(unknownValidation.errors.join('; '), /unregistered model artifact/u);

  const candidateAsCurrent = structuredClone(registryV2);
  candidateAsCurrent.bundles[0].state = 'CANDIDATE_QUALIFICATION';
  const candidateValidation = validateModelBundleRegistry(candidateAsCurrent, { artifactRegistry: artifactRegistryV2 });
  assert.equal(candidateValidation.ok, false);
  assert.match(candidateValidation.errors.join('; '), /activeModelBundleRef must select one RELEASE_QUALIFIED bundle/u);
});

// [VXG RealForever]
