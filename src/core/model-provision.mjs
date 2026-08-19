import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { semanticHash } from './utils.mjs';

export const DEFAULT_MAX_MODEL_BYTES = 32 * 1024 * 1024 * 1024;
export const DEFAULT_MAX_RUNTIME_BYTES = 4 * 1024 * 1024 * 1024;

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

export async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest('hex');
}

export async function classifyVerifiedArtifact({ finalPath, expectedSha256, expectedBytes = null }) {
  if (!fs.existsSync(finalPath)) return { state: 'MISSING', path: finalPath };
  const stat = fs.statSync(finalPath);
  if (!stat.isFile()) return { state: 'INVALID_NOT_FILE', path: finalPath };
  if (Number.isSafeInteger(expectedBytes) && expectedBytes > 0 && stat.size !== expectedBytes) {
    return { state: 'INVALID_SIZE', path: finalPath, bytes: stat.size, expectedBytes };
  }
  const actualSha256 = await sha256File(finalPath);
  if (actualSha256 !== expectedSha256.toLowerCase()) {
    return { state: 'INVALID_HASH', path: finalPath, bytes: stat.size, actualSha256 };
  }
  return { state: 'VERIFIED_REUSABLE', path: finalPath, bytes: stat.size, actualSha256 };
}

export async function downloadVerifiedArtifact({
  url,
  expectedSha256,
  finalPath,
  expectedBytes = null,
  maxBytes = DEFAULT_MAX_MODEL_BYTES,
  fetchImpl = fetch,
  onProgress = () => {}
}) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('artifact URL must be credential-free HTTPS');
  if (!/^[a-f0-9]{64}$/i.test(expectedSha256)) throw new Error('artifact SHA-256 must be 64 hexadecimal characters');
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('maxBytes must be a positive safe integer');
  if (expectedBytes !== null && (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0)) throw new Error('expectedBytes must be null or a positive safe integer');

  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  const existing = await classifyVerifiedArtifact({ finalPath, expectedSha256, expectedBytes });
  if (existing.state === 'VERIFIED_REUSABLE') return { ...existing, disposition: 'REUSED_VERIFIED' };
  if (existing.state !== 'MISSING') throw new Error(`existing artifact failed verification: ${existing.state}`);

  const partialPath = `${finalPath}.partial`;
  let resumeFrom = 0;
  if (fs.existsSync(partialPath)) {
    const stat = fs.statSync(partialPath);
    if (!stat.isFile()) throw new Error('partial artifact path is not a file');
    resumeFrom = stat.size;
    if (resumeFrom > maxBytes || (expectedBytes !== null && resumeFrom > expectedBytes)) {
      fs.rmSync(partialPath, { force: true });
      resumeFrom = 0;
    }
  }

  const headers = resumeFrom > 0 ? { Range: `bytes=${resumeFrom}-` } : {};
  const response = await fetchImpl(url, { redirect: 'follow', headers });
  if (!response.ok || !response.body) throw new Error(`download failed: HTTP ${response.status}`);

  let append = resumeFrom > 0 && response.status === 206;
  if (resumeFrom > 0 && response.status === 206) {
    const contentRange = response.headers.get('content-range') ?? '';
    if (!contentRange.startsWith(`bytes ${resumeFrom}-`)) throw new Error('resume response did not start at the requested byte');
  } else if (resumeFrom > 0) {
    append = false;
    resumeFrom = 0;
  }

  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared && resumeFrom + declared > maxBytes) throw new Error(`declared artifact size exceeds maxBytes ${maxBytes}`);
  if (expectedBytes !== null && declared && resumeFrom + declared > expectedBytes) throw new Error('declared artifact size exceeds expectedBytes');

  let total = resumeFrom;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      total += chunk.length;
      if (total > maxBytes || (expectedBytes !== null && total > expectedBytes)) callback(new Error('artifact exceeded admitted size'));
      else { onProgress({ bytes: total, resumedFrom: resumeFrom }); callback(null, chunk); }
    }
  });

  try {
    await pipeline(Readable.fromWeb(response.body), limiter, fs.createWriteStream(partialPath, { flags: append ? 'a' : 'w' }));
    if (expectedBytes !== null && total !== expectedBytes) throw new Error(`artifact byte count mismatch: expected ${expectedBytes}, actual ${total}`);
    const actualSha256 = await sha256File(partialPath);
    if (actualSha256 !== expectedSha256.toLowerCase()) {
      fs.rmSync(partialPath, { force: true });
      throw new Error(`checksum mismatch: expected ${expectedSha256.toLowerCase()}, actual ${actualSha256}`);
    }
    fs.renameSync(partialPath, finalPath);
    return {
      state: 'VERIFIED',
      disposition: resumeFrom > 0 ? 'RESUMED_AND_VERIFIED' : 'DOWNLOADED_AND_VERIFIED',
      path: finalPath,
      bytes: total,
      actualSha256,
      recordedSourceUrl: sanitizeSourceUrl(url)
    };
  } catch (error) {
    if (/checksum mismatch|byte count mismatch|exceeded admitted size/u.test(error.message)) fs.rmSync(partialPath, { force: true });
    throw error;
  }
}

// [VXG RealForever]
