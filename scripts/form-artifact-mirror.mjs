#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formDeterministicArtifactMirror, validateArtifactRegistry } from '../src/core/artifact-delivery.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
};
const required = (name) => {
  const found = value(name);
  if (!found) throw new Error(`${name} is required`);
  return found;
};
const exactAbsolute = (raw, label) => {
  if (!path.isAbsolute(raw)) throw new Error(`${label} must be absolute`);
  return path.resolve(raw);
};

async function main() {
  const artifactRef = required('--artifact-ref');
  const artifactRegistryPath = path.resolve(ROOT, value('--artifact-registry') ?? 'blueprint/artifact-registry.json');
  const registry = validateArtifactRegistry(JSON.parse(fs.readFileSync(artifactRegistryPath, 'utf8')));
  const artifact = registry.artifacts.find((entry) => entry.artifactRef === artifactRef);
  if (!artifact) throw new Error(`unknown artifactRef ${artifactRef}`);
  const result = await formDeterministicArtifactMirror({
    inputPath: exactAbsolute(required('--input'), '--input'),
    outputDir: exactAbsolute(required('--output-dir'), '--output-dir'),
    artifact,
    chunkBytes: Number(required('--chunk-bytes')),
    publicationBaseUrl: required('--publication-base-url'),
    releaseRef: required('--release-ref')
  });
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 'vexlife.form-artifact-mirror-result/v1',
    state: 'FORMED_NO_PUBLICATION',
    artifactRef: result.artifactRef,
    partCount: result.partCount,
    manifestSha256: result.manifestSha256,
    providerOrNetworkEffect: false,
    uploadPerformed: false,
    modelBytesChanged: false
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ schemaVersion: 'vexlife.form-artifact-mirror-error/v1', state: 'FAILED_CLOSED', error: error?.message ?? String(error) })}\n`);
  process.exitCode = 2;
});

// [VXG RealForever]
