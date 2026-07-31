import path from 'node:path';
import { semanticHash } from './utils.mjs';

export const DEFAULT_MAX_MODEL_BYTES = 32 * 1024 * 1024 * 1024;

export function sanitizeSourceUrl(value) {
  const parsed = new URL(value);
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

export function validateModelProvisionRequest(input) {
  const errors = [];
  let parsedUrl = null;
  try {
    parsedUrl = new URL(input.url);
    if (parsedUrl.protocol !== 'https:') errors.push('model URL must use HTTPS');
    if (parsedUrl.username || parsedUrl.password) errors.push('model URL must not contain embedded credentials');
  } catch {
    errors.push('model URL must be a valid absolute URL');
  }
  if (!input.expectedSha256 || !/^[a-f0-9]{64}$/i.test(input.expectedSha256)) errors.push('sha256 must be 64 hexadecimal characters');
  if (!input.name || path.basename(input.name) !== input.name || input.name.includes('\0')) errors.push('name must be one safe filename');
  for (const field of ['sourceReceiptRef', 'licenseReceiptRef', 'runtimeFamily', 'hardwareProfileRef']) {
    if (!input[field] || typeof input[field] !== 'string') errors.push(`${field} is required`);
  }
  const maxBytes = Number(input.maxBytes ?? DEFAULT_MAX_MODEL_BYTES);
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) errors.push('maxBytes must be a positive safe integer');
  return {
    ok: errors.length === 0,
    errors,
    normalized: errors.length ? null : {
      ...input,
      expectedSha256: input.expectedSha256.toLowerCase(),
      maxBytes,
      recordedSourceUrl: sanitizeSourceUrl(parsedUrl.toString())
    }
  };
}

export function buildModelArtifactManifest({ request, actualSha256, bytes, relativeArtifactPath, formedAt = new Date().toISOString() }) {
  return {
    schemaVersion: 'vexlife.model-artifact-manifest/v0',
    artifactRef: `model-artifact.${semanticHash({ actualSha256, relativeArtifactPath }).slice(0, 24)}`,
    filename: request.name,
    relativeArtifactPath,
    expectedSha256: request.expectedSha256,
    actualSha256,
    bytes,
    sourceUrlWithoutQuery: request.recordedSourceUrl,
    sourceReceiptRef: request.sourceReceiptRef,
    licenseReceiptRef: request.licenseReceiptRef,
    runtimeFamily: request.runtimeFamily,
    hardwareProfileRef: request.hardwareProfileRef,
    provisionedAt: formedAt,
    storedInRepository: false,
    activationState: 'PROVISIONED_INACTIVE',
    automaticActivation: false
  };
}

// [VXG RealForever]
