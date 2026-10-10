import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import {
  buildVexInitializationPlan,
  resolveActiveModelBundle,
  resolveModelBundleByRef,
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

test('generalized v2 candidate can coexist with current G0 and resolve structurally without runtime admission', () => {
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
  const combinedArtifactRegistry = structuredClone(artifactRegistry);
  combinedArtifactRegistry.artifacts.push(...syntheticArtifacts);

  const candidateRef = 'model-bundle.synthetic.cultivated.g2.001';
  const candidate = {
    bundleSchemaVersion: 'vexlife.model-bundle/v2',
    modelBundleRef: candidateRef,
    generationRef: 'generation.synthetic.cultivated.g2',
    modelProfileRef: 'model-profile.synthetic.cultivated.g2',
    state: 'CANDIDATE_QUALIFICATION',
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
  };
  const mixedRegistry = structuredClone(modelBundleRegistry);
  mixedRegistry.bundles.push(candidate);

  assert.deepEqual(
    validateModelBundleRegistry(mixedRegistry, {
      artifactRegistry: combinedArtifactRegistry,
      operationalProfileRegistry: operationalProfiles
    }),
    { ok: true, errors: [] }
  );
  assert.equal(mixedRegistry.activeModelBundleRef, modelBundleRegistry.activeModelBundleRef);

  const active = resolveActiveModelBundle({
    registry: mixedRegistry,
    artifactRegistry: combinedArtifactRegistry,
    operationalProfile: profile
  });
  assert.equal(active.state, 'MODEL_BUNDLE_RESOLVED');
  assert.equal(active.bundle.modelBundleRef, modelBundleRegistry.activeModelBundleRef);

  const candidateResolution = resolveModelBundleByRef({
    registry: mixedRegistry,
    artifactRegistry: combinedArtifactRegistry,
    modelBundleRef: candidateRef
  });
  assert.equal(candidateResolution.state, 'MODEL_BUNDLE_RUNTIME_REALIZATION_HELD');
  assert.equal(candidateResolution.bundle.generationRef, 'generation.synthetic.cultivated.g2');
  assert.equal(candidateResolution.artifacts.length, 12);
  assert.equal(candidateResolution.artifactBindings.length, 12);
  assert.deepEqual(candidateResolution.runtimeRealizationRefs, candidate.runtimeRealizationRefs);
  assert.equal(candidateResolution.contentSetSha256, candidate.contentSetSha256);

  assert.throws(() => buildVexInitializationPlan({
    profile,
    modelBundle: candidateResolution.bundle,
    modelArtifacts: candidateResolution.artifacts,
    home: 'C:/VexHome',
    homeState: 'FRESH_HOME_ALLOWED',
    hostEvidence: { platform: 'win32', architecture: 'x64' },
    mode: 'candidate-qualification'
  }), /generalized model bundle runtime realization is not admitted by current initializer/u);
});

test('generalized v2 candidate fails closed on duplicate roles, unknown artifacts, and premature active selection', () => {
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
  const combinedArtifactRegistry = structuredClone(artifactRegistry);
  combinedArtifactRegistry.artifacts.push(artifact);

  const candidate = {
    bundleSchemaVersion: 'vexlife.model-bundle/v2',
    modelBundleRef: 'model-bundle.synthetic.future.001',
    generationRef: 'generation.synthetic.future.001',
    modelProfileRef: 'model-profile.synthetic.future.001',
    state: 'CANDIDATE_QUALIFICATION',
    artifactBindings: [{ roleRef: 'artifact-role.synthetic.future.primary', artifactRef: artifact.artifactRef }],
    artifactSetRef: 'artifact-set.synthetic.future.001',
    contentSetSha256: crypto.createHash('sha256').update(artifact.sha256).digest('hex'),
    runtimeRealizationRefs: ['runtime-realization.synthetic.future.001'],
    sourceRefs: ['source.synthetic.future.test-only']
  };
  const mixedRegistry = structuredClone(modelBundleRegistry);
  mixedRegistry.bundles.push(candidate);

  const duplicateRole = structuredClone(mixedRegistry);
  duplicateRole.bundles.at(-1).artifactBindings.push({
    roleRef: duplicateRole.bundles.at(-1).artifactBindings[0].roleRef,
    artifactRef: artifact.artifactRef
  });
  assert.equal(validateModelBundleRegistry(duplicateRole, { artifactRegistry: combinedArtifactRegistry }).ok, false);

  const unknownArtifact = structuredClone(mixedRegistry);
  unknownArtifact.bundles.at(-1).artifactBindings[0].artifactRef = 'artifact.synthetic.future.missing';
  const unknownValidation = validateModelBundleRegistry(unknownArtifact, { artifactRegistry: combinedArtifactRegistry });
  assert.equal(unknownValidation.ok, false);
  assert.match(unknownValidation.errors.join('; '), /unregistered model artifact/u);

  const candidateAsCurrent = structuredClone(mixedRegistry);
  candidateAsCurrent.activeModelBundleRef = candidate.modelBundleRef;
  const candidateValidation = validateModelBundleRegistry(candidateAsCurrent, { artifactRegistry: combinedArtifactRegistry });
  assert.equal(candidateValidation.ok, false);
  assert.match(candidateValidation.errors.join('; '), /activeModelBundleRef must select one RELEASE_QUALIFIED bundle/u);
});

// [VXG RealForever]
