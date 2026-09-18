import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModelArtifactManifest, sanitizeSourceUrl, validateModelProvisionRequest } from '../src/core/model-provision.mjs';

const valid = {
  url: 'https://models.example.invalid/qwen.gguf?temporary=secret',
  expectedSha256: 'a'.repeat(64),
  name: 'qwen.gguf',
  sourceReceiptRef: 'source.model.qwen.001',
  licenseReceiptRef: 'license.model.qwen.001',
  runtimeFamily: 'llama.cpp',
  hardwareProfileRef: 'hardware.macbook.arm64',
  maxBytes: 1024
};

test('model provisioning requires checksum, license, source, runtime and hardware receipts', () => {
  const result = validateModelProvisionRequest(valid);
  assert.equal(result.ok, true);
  assert.equal(result.normalized.recordedSourceUrl, 'https://models.example.invalid/qwen.gguf');
  assert.equal(sanitizeSourceUrl(valid.url), 'https://models.example.invalid/qwen.gguf');
});

test('model provisioning rejects traversal, insecure URL and missing receipts', () => {
  const result = validateModelProvisionRequest({ ...valid, url: 'http://example.invalid/a', name: '../escape.gguf', licenseReceiptRef: null });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /HTTPS/);
  assert.match(result.errors.join('\n'), /safe filename/);
  assert.match(result.errors.join('\n'), /licenseReceiptRef/);
});

test('model manifest stays inactive and records provenance without signed query parameters', () => {
  const request = validateModelProvisionRequest(valid).normalized;
  const manifest = buildModelArtifactManifest({ request, actualSha256: 'a'.repeat(64), bytes: 100, relativeArtifactPath: 'models/qwen.gguf', formedAt: '2026-07-30T00:00:00.000Z' });
  assert.equal(manifest.activationState, 'PROVISIONED_INACTIVE');
  assert.equal(manifest.automaticActivation, false);
  assert.equal(manifest.sourceUrlWithoutQuery.includes('?'), false);
  assert.equal(manifest.storedInRepository, false);
});

// [VXG RealForever]
