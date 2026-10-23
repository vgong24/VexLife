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
const artifactDeliveryRegistry = JSON.parse(fs.readFileSync(new URL('../blueprint/artifact-delivery-registry.json', import.meta.url), 'utf8'));
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

test('current M4 is registered as an exact 12-member candidate while G0 remains active', () => {
  const candidateRef = 'model-bundle.vexlife.m4.generation-2.mlx.001';
  const candidate = modelBundleRegistry.bundles.find((item) => item.modelBundleRef === candidateRef);
  assert.ok(candidate);
  assert.equal(modelBundleRegistry.activeModelBundleRef, 'model-bundle.vexlife.g0.qwen3.5-4b.q4-k-m.001');
  assert.equal(candidate.bundleSchemaVersion, 'vexlife.model-bundle/v2');
  assert.equal(candidate.state, 'CANDIDATE_QUALIFICATION');
  assert.equal(candidate.generationRef, 'generation.vex.m4.generation-2');
  assert.equal(candidate.modelProfileRef, 'model-profile.vex.m4.small.g2.certified.20260920A');
  assert.equal(candidate.artifactBindings.length, 12);
  assert.equal(candidate.artifactSetRef, 'artifact-set.vex.m4.generation-2.368e89e5ca219fab');
  assert.equal(candidate.contentSetSha256, '368e89e5ca219fab3398c1830e982ef5a8a949bac1a17b8f3320bdb1e512d9cf');
  assert.deepEqual(candidate.runtimeRealizationRefs, ['adapter.runtime.mlx.macos-victor.post-w5.001']);

  const resolution = resolveModelBundleByRef({
    registry: modelBundleRegistry,
    artifactRegistry,
    modelBundleRef: candidateRef
  });
  assert.equal(resolution.state, 'MODEL_BUNDLE_RUNTIME_REALIZATION_HELD');
  assert.equal(resolution.artifacts.length, 12);
  assert.equal(resolution.artifactBindings.length, 12);
  assert.equal(resolution.contentSetSha256, candidate.contentSetSha256);

  const rows = resolution.artifacts
    .map((artifact) => ({ path: artifact.filename, bytes: artifact.expectedBytes, sha256: artifact.sha256 }))
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  assert.deepEqual(rows.map((row) => row.path), [
    '.gitattributes',
    'README.md',
    'chat_template.jinja',
    'config.json',
    'model.safetensors',
    'model.safetensors.index.json',
    'preprocessor_config.json',
    'processor_config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'video_preprocessor_config.json',
    'vocab.json'
  ]);
  assert.equal(rows.reduce((sum, row) => sum + row.bytes, 0), 3061132920);
  const aggregate = crypto.createHash('sha256')
    .update(rows.map((row) => `${row.path}|${row.bytes}|${row.sha256}\n`).join(''))
    .digest('hex');
  assert.equal(aggregate, candidate.contentSetSha256);
});

test('accepted Heretic 27B is registered as an exact 11-member v2 candidate while G0 remains active', () => {
  const candidateRef = 'model-bundle.vexlife.heretic.qwen3.8-27b.mlx4.329658ee8f27.001';
  const candidate = modelBundleRegistry.bundles.find((item) => item.modelBundleRef === candidateRef);
  assert.ok(candidate);
  assert.equal(modelBundleRegistry.activeModelBundleRef, 'model-bundle.vexlife.g0.qwen3.5-4b.q4-k-m.001');
  assert.equal(candidate.bundleSchemaVersion, 'vexlife.model-bundle/v2');
  assert.equal(candidate.state, 'CANDIDATE_QUALIFICATION');
  assert.equal(candidate.generationRef, 'generation.devex.heretic27b4.preexisting-certified-foundation.normalized.20261001A');
  assert.equal(candidate.modelProfileRef, 'model-profile.devex.qwen38-27b-heretic-mlx4.certified.20260928A');
  assert.equal(candidate.artifactBindings.length, 11);
  assert.equal(candidate.artifactSetRef, 'artifact.devex.qwen3.8-27b-heretic-mlx-4bit.808b82a2');
  assert.equal(candidate.contentSetSha256, '329658ee8f270056bc29d8a6cfd6e9f1b7d9d14c659452c9e4dd46fc7c78d780');
  assert.deepEqual(candidate.runtimeRealizationRefs, ['adapter.runtime.mlx.macos-victor.001']);
  const resolution = resolveModelBundleByRef({ registry: modelBundleRegistry, artifactRegistry, modelBundleRef: candidateRef });
  assert.equal(resolution.state, 'MODEL_BUNDLE_RUNTIME_REALIZATION_HELD');
  assert.equal(resolution.artifacts.length, 11);
  const rows = resolution.artifacts.map((artifact) => ({ path: artifact.filename, bytes: artifact.expectedBytes, sha256: artifact.sha256 })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  assert.deepEqual(rows.map((row) => row.path), ['.gitattributes','README.md','chat_template.jinja','config.json','generation_config.json','model-00001-of-00003.safetensors','model-00002-of-00003.safetensors','model-00003-of-00003.safetensors','model.safetensors.index.json','tokenizer.json','tokenizer_config.json']);
  assert.equal(rows.reduce((sum, row) => sum + row.bytes, 0), 15153242506);
  const aggregate = crypto.createHash('sha256');
  for (const row of rows) { aggregate.update(row.path); aggregate.update('\0'); aggregate.update(row.sha256); aggregate.update('\0'); aggregate.update(String(row.bytes)); aggregate.update('\n'); }
  assert.equal(aggregate.digest('hex'), candidate.contentSetSha256);
  for (const binding of candidate.artifactBindings) {
    const channels = artifactDeliveryRegistry.channelsByArtifactRef[binding.artifactRef];
    assert.equal(channels.length, 1);
    assert.equal(channels[0].transportClass, 'DIRECT_HTTPS_FILE_V1');
    assert.match(channels[0].url, /^https:\/\/huggingface\.co\/donedynamics\/Qwen3\.8-27B-heretic-MLX-4bit\/resolve\/808b82a2bd04b2bac362b5d0b7a1197aeea59e57\//u);
  }
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
