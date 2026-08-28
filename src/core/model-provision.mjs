import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { semanticHash } from './utils.mjs';

export const DEFAULT_MAX_MODEL_BYTES = 32 * 1024 * 1024 * 1024;
export const DEFAULT_MAX_RUNTIME_BYTES = 4 * 1024 * 1024 * 1024;
export const ARTIFACT_PARTIAL_SOURCE_SCHEMA = 'vexlife.artifact-partial-source/v1';
export const ARTIFACT_FAILURE_CODES = Object.freeze({
  CHANNEL_UNAVAILABLE: 'CHANNEL_UNAVAILABLE',
  CHANNEL_PROTOCOL_INVALID: 'CHANNEL_PROTOCOL_INVALID',
  ARTIFACT_INTEGRITY_MISMATCH: 'ARTIFACT_INTEGRITY_MISMATCH',
  ARTIFACT_POLICY_REJECTED: 'ARTIFACT_POLICY_REJECTED'
});

export class ArtifactProvisionError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'ArtifactProvisionError';
    this.code = code;
    this.detail = detail;
  }
}

function artifactError(code, message, detail = {}) {
  return new ArtifactProvisionError(code, message, detail);
}

export function sanitizeSourceUrl(value) {
  const parsed = new URL(value);
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

function requireCredentialFreeHttps(value, label = 'artifact URL') {
  let parsed;
  try { parsed = new URL(value); } catch {
    throw artifactError(ARTIFACT_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `${label} must be a valid absolute URL`);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw artifactError(ARTIFACT_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `${label} must be credential-free HTTPS`);
  }
  return parsed;
}

function requireChannelRef(value) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || /\s/u.test(value)) {
    throw artifactError(ARTIFACT_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'channelRef must be one non-empty whitespace-free source identity');
  }
  return value;
}

function partialPaths(finalPath) {
  return {
    partialPath: `${finalPath}.partial`,
    sidecarPath: `${finalPath}.partial-source.json`
  };
}

function removeRegularFileIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return;
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile()) {
    throw artifactError(ARTIFACT_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `artifact partial state must be a regular file: ${filePath}`);
  }
  fs.rmSync(filePath, { force: true });
}

function clearPartialState(finalPath) {
  const { partialPath, sidecarPath } = partialPaths(finalPath);
  removeRegularFileIfPresent(partialPath);
  removeRegularFileIfPresent(sidecarPath);
}

function readPartialSource(sidecarPath) {
  if (!fs.existsSync(sidecarPath)) return null;
  const stat = fs.lstatSync(sidecarPath);
  if (!stat.isFile()) {
    throw artifactError(ARTIFACT_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'artifact partial-source sidecar must be a regular file');
  }
  try {
    return JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
  } catch {
    return null;
  }
}

function expectedPartialSource({ expectedSha256, expectedBytes, channelRef, url }) {
  return {
    schemaVersion: ARTIFACT_PARTIAL_SOURCE_SCHEMA,
    artifactSha256: expectedSha256.toLowerCase(),
    expectedBytes,
    channelRef,
    sourceUrlWithoutQuery: sanitizeSourceUrl(url)
  };
}

function partialSourceMatches(actual, expected) {
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
  const keys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) return false;
  return expectedKeys.every((key) => actual[key] === expected[key]);
}

function writePartialSource(sidecarPath, source) {
  fs.writeFileSync(sidecarPath, `${JSON.stringify(source, null, 2)}\n`, 'utf8');
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
  channelRef,
  expectedSha256,
  finalPath,
  expectedBytes = null,
  maxBytes = DEFAULT_MAX_MODEL_BYTES,
  fetchImpl = fetch,
  onProgress = () => {}
}) {
  requireCredentialFreeHttps(url);
  requireChannelRef(channelRef);
  if (!/^[a-f0-9]{64}$/i.test(expectedSha256)) {
    throw artifactError(ARTIFACT_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'artifact SHA-256 must be 64 hexadecimal characters');
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw artifactError(ARTIFACT_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'maxBytes must be a positive safe integer');
  }
  if (expectedBytes !== null && (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0)) {
    throw artifactError(ARTIFACT_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'expectedBytes must be null or a positive safe integer');
  }

  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  const existing = await classifyVerifiedArtifact({ finalPath, expectedSha256, expectedBytes });
  if (existing.state === 'VERIFIED_REUSABLE') {
    clearPartialState(finalPath);
    return { ...existing, disposition: 'REUSED_VERIFIED', channelRef: null, recordedSourceUrl: null };
  }
  if (existing.state !== 'MISSING') {
    throw artifactError(ARTIFACT_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, `existing artifact failed verification: ${existing.state}`, { existingState: existing.state });
  }

  const { partialPath, sidecarPath } = partialPaths(finalPath);
  const sourceBinding = expectedPartialSource({ expectedSha256, expectedBytes, channelRef, url });
  let resumeFrom = 0;

  if (fs.existsSync(partialPath)) {
    const stat = fs.lstatSync(partialPath);
    if (!stat.isFile()) {
      throw artifactError(ARTIFACT_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'partial artifact path must be a regular file');
    }
    const priorSource = readPartialSource(sidecarPath);
    if (!partialSourceMatches(priorSource, sourceBinding)) {
      clearPartialState(finalPath);
    } else {
      resumeFrom = stat.size;
      if (resumeFrom > maxBytes || (expectedBytes !== null && resumeFrom > expectedBytes)) {
        clearPartialState(finalPath);
        resumeFrom = 0;
      }
    }
  } else if (fs.existsSync(sidecarPath)) {
    removeRegularFileIfPresent(sidecarPath);
  }

  writePartialSource(sidecarPath, sourceBinding);
  const headers = resumeFrom > 0 ? { Range: `bytes=${resumeFrom}-` } : {};

  try {
    let response;
    try {
      response = await fetchImpl(url, { redirect: 'follow', headers });
    } catch (cause) {
      throw artifactError(ARTIFACT_FAILURE_CODES.CHANNEL_UNAVAILABLE, `artifact channel unavailable: ${channelRef}`, { channelRef, causeName: cause?.name ?? null });
    }
    if (!response?.ok || !response.body) {
      throw artifactError(ARTIFACT_FAILURE_CODES.CHANNEL_UNAVAILABLE, `artifact channel unavailable: HTTP ${response?.status ?? 'NO_RESPONSE'}`, { channelRef, status: response?.status ?? null });
    }

    let append = resumeFrom > 0 && response.status === 206;
    if (resumeFrom > 0 && response.status === 206) {
      const contentRange = response.headers.get('content-range') ?? '';
      const match = /^bytes (\d+)-(\d+)\/(\d+|\*)$/u.exec(contentRange);
      if (!match || Number(match[1]) !== resumeFrom || Number(match[2]) < resumeFrom) {
        throw artifactError(ARTIFACT_FAILURE_CODES.CHANNEL_PROTOCOL_INVALID, 'resume response did not exactly bind the requested byte range', { channelRef });
      }
      if (expectedBytes !== null && match[3] !== '*' && Number(match[3]) !== expectedBytes) {
        throw artifactError(ARTIFACT_FAILURE_CODES.CHANNEL_PROTOCOL_INVALID, 'resume response total bytes contradict accepted artifact identity', { channelRef });
      }
    } else if (resumeFrom > 0) {
      append = false;
      resumeFrom = 0;
    } else if (response.status === 206) {
      throw artifactError(ARTIFACT_FAILURE_CODES.CHANNEL_PROTOCOL_INVALID, 'channel returned a partial response without a resume request', { channelRef });
    }

    const declaredText = response.headers.get('content-length');
    const declared = declaredText === null ? 0 : Number(declaredText);
    if (declaredText !== null && (!Number.isSafeInteger(declared) || declared < 0)) {
      throw artifactError(ARTIFACT_FAILURE_CODES.CHANNEL_PROTOCOL_INVALID, 'channel returned an invalid Content-Length', { channelRef });
    }
    if (declared && resumeFrom + declared > maxBytes) {
      throw artifactError(ARTIFACT_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `declared artifact size exceeds maxBytes ${maxBytes}`, { channelRef });
    }
    if (expectedBytes !== null && declared && resumeFrom + declared > expectedBytes) {
      throw artifactError(ARTIFACT_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, 'declared artifact size exceeds expectedBytes', { channelRef });
    }

    let total = resumeFrom;
    const limiter = new Transform({
      transform(chunk, encoding, callback) {
        total += chunk.length;
        if (total > maxBytes) {
          callback(artifactError(ARTIFACT_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'artifact exceeded admitted maxBytes', { channelRef }));
        } else if (expectedBytes !== null && total > expectedBytes) {
          callback(artifactError(ARTIFACT_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, 'artifact exceeded expected byte identity', { channelRef }));
        } else {
          onProgress({ bytes: total, resumedFrom: resumeFrom });
          callback(null, chunk);
        }
      }
    });

    try {
      await pipeline(Readable.fromWeb(response.body), limiter, fs.createWriteStream(partialPath, { flags: append ? 'a' : 'w' }));
    } catch (cause) {
      if (cause instanceof ArtifactProvisionError) throw cause;
      throw artifactError(ARTIFACT_FAILURE_CODES.CHANNEL_UNAVAILABLE, `artifact channel stream failed: ${channelRef}`, { channelRef, causeName: cause?.name ?? null });
    }

    if (expectedBytes !== null && total !== expectedBytes) {
      throw artifactError(ARTIFACT_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, `artifact byte count mismatch: expected ${expectedBytes}, actual ${total}`, { channelRef, expectedBytes, actualBytes: total });
    }
    const actualSha256 = await sha256File(partialPath);
    if (actualSha256 !== expectedSha256.toLowerCase()) {
      throw artifactError(ARTIFACT_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, `checksum mismatch: expected ${expectedSha256.toLowerCase()}, actual ${actualSha256}`, { channelRef, actualSha256 });
    }

    fs.renameSync(partialPath, finalPath);
    removeRegularFileIfPresent(sidecarPath);
    return {
      state: 'VERIFIED',
      disposition: resumeFrom > 0 ? 'RESUMED_AND_VERIFIED' : 'DOWNLOADED_AND_VERIFIED',
      path: finalPath,
      bytes: total,
      actualSha256,
      channelRef,
      recordedSourceUrl: sanitizeSourceUrl(url)
    };
  } catch (error) {
    if (error instanceof ArtifactProvisionError && error.code === ARTIFACT_FAILURE_CODES.CHANNEL_UNAVAILABLE) throw error;
    clearPartialState(finalPath);
    throw error;
  }
}

export async function downloadVerifiedArtifactFromChannels({
  artifact,
  channels,
  finalPath,
  fetchImpl = fetch,
  onProgress = () => {}
}) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    throw artifactError(ARTIFACT_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'artifact descriptor must be an object');
  }
  if (typeof artifact.artifactRef !== 'string' || artifact.artifactRef.length === 0) {
    throw artifactError(ARTIFACT_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'artifact.artifactRef is required');
  }
  if (!Array.isArray(channels) || channels.length === 0) {
    throw artifactError(ARTIFACT_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'artifact delivery channels must be non-empty');
  }

  const normalizedChannels = channels.map((channel, index) => {
    if (!channel || typeof channel !== 'object' || Array.isArray(channel)) {
      throw artifactError(ARTIFACT_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `channels[${index}] must be an object`);
    }
    const channelRef = requireChannelRef(channel.channelRef);
    requireCredentialFreeHttps(channel.url, `channels[${index}].url`);
    return { channelRef, url: channel.url };
  });
  if (new Set(normalizedChannels.map((channel) => channel.channelRef)).size !== normalizedChannels.length) {
    throw artifactError(ARTIFACT_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'artifact delivery channelRef values must be unique');
  }

  const attemptedChannelRefs = [];
  for (let index = 0; index < normalizedChannels.length; index += 1) {
    const channel = normalizedChannels[index];
    attemptedChannelRefs.push(channel.channelRef);
    try {
      const result = await downloadVerifiedArtifact({
        url: channel.url,
        channelRef: channel.channelRef,
        expectedSha256: artifact.sha256,
        expectedBytes: artifact.expectedBytes,
        maxBytes: artifact.maxBytes,
        finalPath,
        fetchImpl,
        onProgress
      });
      return {
        artifactRef: artifact.artifactRef,
        selectedChannelRef: result.channelRef,
        attemptedChannelRefs: [...attemptedChannelRefs],
        recordedSourceUrl: result.recordedSourceUrl,
        disposition: result.disposition,
        bytes: result.bytes,
        actualSha256: result.actualSha256,
        path: result.path
      };
    } catch (error) {
      if (!(error instanceof ArtifactProvisionError) || error.code !== ARTIFACT_FAILURE_CODES.CHANNEL_UNAVAILABLE) throw error;
      if (index === normalizedChannels.length - 1) {
        error.detail = { ...error.detail, artifactRef: artifact.artifactRef, attemptedChannelRefs: [...attemptedChannelRefs] };
        throw error;
      }
      clearPartialState(finalPath);
    }
  }

  throw artifactError(ARTIFACT_FAILURE_CODES.CHANNEL_UNAVAILABLE, 'no artifact delivery channel was available', { artifactRef: artifact.artifactRef, attemptedChannelRefs });
}

// [VXG RealForever]