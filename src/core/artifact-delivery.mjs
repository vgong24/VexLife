import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { downloadVerifiedArtifact } from './model-provision.mjs';

export const ARTIFACT_REGISTRY_SCHEMA = 'vexlife.artifact-registry/v1';
export const ARTIFACT_DELIVERY_REGISTRY_SCHEMA = 'vexlife.artifact-delivery-registry/v1';
export const ARTIFACT_CHUNK_MANIFEST_SCHEMA = 'vexlife.artifact-chunk-manifest/v1';
export const ARTIFACT_ASSEMBLY_SIDECAR_SCHEMA = 'vexlife.artifact-assembly-sidecar/v1';
export const ARTIFACT_PUBLICATION_INVENTORY_SCHEMA = 'vexlife.artifact-publication-inventory/v1';
export const DELIVERY_TRANSPORT_CLASSES = Object.freeze([
  'DIRECT_HTTPS_FILE_V1',
  'VERIFIED_CHUNK_MANIFEST_V1'
]);
export const ARTIFACT_DELIVERY_FAILURE_CODES = Object.freeze({
  CHANNEL_UNAVAILABLE: 'CHANNEL_UNAVAILABLE',
  CHANNEL_PROTOCOL_INVALID: 'CHANNEL_PROTOCOL_INVALID',
  ARTIFACT_INTEGRITY_MISMATCH: 'ARTIFACT_INTEGRITY_MISMATCH',
  ARTIFACT_POLICY_REJECTED: 'ARTIFACT_POLICY_REJECTED',
  LOCAL_IO_FAILURE: 'LOCAL_IO_FAILURE'
});

const SHA256_RE = /^[0-9a-f]{64}$/u;
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/u;
const SAFE_ASSET_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,254}$/u;
const WINDOWS_DEVICE_RE = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu;
const LOCAL_IO_CODES = new Set(['EACCES', 'EPERM', 'ENOSPC', 'EROFS', 'EIO', 'EMFILE', 'ENFILE']);
const TRANSPORT_CODES = new Set(['ECONNABORTED', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET']);
const SOURCE_RESOLVER_FIELDS = Object.freeze(['artifactRef', 'deliveryPolicyRef', 'finalPath']);
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ARTIFACT_REGISTRY_PATH = path.resolve(MODULE_DIR, '../../blueprint/artifact-registry.json');
const SOURCE_DELIVERY_REGISTRY_PATH = path.resolve(MODULE_DIR, '../../blueprint/artifact-delivery-registry.json');
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const MAX_PART_COUNT = 4096;
const ARTIFACT_REGISTRY_FIELDS = Object.freeze(['schemaVersion', 'registryRef', 'state', 'artifacts']);
const DELIVERY_REGISTRY_FIELDS = Object.freeze(['schemaVersion', 'registryRef', 'state', 'defaultPolicyRef', 'policies', 'channelsByArtifactRef']);
const ARTIFACT_FIELDS = Object.freeze([
  'artifactRef', 'filename', 'mediaType', 'sha256', 'expectedBytes', 'maxBytes', 'sourceRef', 'licenseRef'
]);
const POLICY_FIELDS = Object.freeze(['policyRef', 'allowedTransportClasses']);
const DIRECT_CHANNEL_FIELDS = Object.freeze(['channelRef', 'transportClass', 'url']);
const CHUNK_CHANNEL_FIELDS = Object.freeze(['channelRef', 'transportClass', 'manifestUrl', 'manifestSha256']);
const MANIFEST_FIELDS = Object.freeze([
  'schemaVersion', 'artifactRef', 'filename', 'expectedBytes', 'expectedSha256', 'chunking', 'parts',
  'sourceRef', 'licenseRef', 'releaseRef'
]);
const CHUNKING_FIELDS = Object.freeze(['algorithm', 'chunkBytes']);
const PART_FIELDS = Object.freeze([
  'index', 'offset', 'bytes', 'sha256', 'cumulativeBytes', 'cumulativeSha256', 'assetName', 'url'
]);

export class ArtifactDeliveryError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'ArtifactDeliveryError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, message, detail = {}) {
  throw new ArtifactDeliveryError(code, message, detail);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `${label} must be one object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `${label} fields are not exact`, { actual, expected: wanted });
  }
}

function allowedKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `${label} must be one object`);
  }
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `${label} contains caller-controlled authority fields`, { unexpected: unexpected.sort() });
  }
}

function loadSourceJson(filePath, label) {
  const stat = regularFileStat(filePath, label);
  if (!stat) fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `${label} is missing`);
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `${label} is not valid JSON`); }
}

function requireRef(value, label) {
  if (typeof value !== 'string' || !REF_RE.test(value)) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `${label} must be one stable ref`);
  }
  return value;
}

function requireSha(value, label) {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `${label} must be lowercase SHA-256`);
  }
  return value;
}

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `${label} must be one positive safe integer`);
  }
  return value;
}

function nonNegativeSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_PROTOCOL_INVALID, `${label} must be one non-negative safe integer`);
  }
  return value;
}

function requireSafeName(value, label) {
  if (typeof value !== 'string' || !SAFE_ASSET_RE.test(value) || value === '.' || value === '..' || value.endsWith('.') || WINDOWS_DEVICE_RE.test(value) || path.basename(value) !== value) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `${label} must be one safe filename`);
  }
  return value;
}

function requireMediaType(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 255 || !/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/u.test(value)) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `${label} must be one media type`);
  }
  return value;
}

function requireHttps(value, label) {
  let parsed;
  try { parsed = new URL(value); } catch {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `${label} must be one absolute URL`);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `${label} must be credential-free HTTPS`);
  }
  for (const key of parsed.searchParams.keys()) {
    if (/(?:token|sig(?:nature)?|key|auth|credential|secret|password)/iu.test(key)) {
      fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `${label} must not contain credential-shaped query parameters`);
    }
  }
  if (parsed.hash) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `${label} must not contain a fragment`);
  }
  return parsed;
}

export function sanitizeDeliveryUrl(value) {
  const parsed = requireHttps(value, 'delivery URL');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest('hex');
}

function regularFileStat(filePath, label) {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `${label} must be one regular non-symlink file`, { filePath });
  }
  return stat;
}

function removeRegularFileIfPresent(filePath) {
  const stat = regularFileStat(filePath, 'temporary artifact state');
  if (stat) fs.rmSync(filePath, { force: true });
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  fs.renameSync(temp, filePath);
}

export async function classifyExactArtifact({ finalPath, expectedSha256, expectedBytes }) {
  requireSha(expectedSha256, 'expectedSha256');
  positiveSafeInteger(expectedBytes, 'expectedBytes');
  const stat = regularFileStat(finalPath, 'artifact destination');
  if (!stat) return { state: 'MISSING', path: finalPath };
  if (stat.size !== expectedBytes) return { state: 'INVALID_SIZE', path: finalPath, bytes: stat.size, expectedBytes };
  const actualSha256 = await sha256File(finalPath);
  if (actualSha256 !== expectedSha256) return { state: 'INVALID_HASH', path: finalPath, bytes: stat.size, actualSha256 };
  return { state: 'VERIFIED_REUSABLE', path: finalPath, bytes: stat.size, actualSha256 };
}

export function validateArtifactDescriptor(input) {
  exactKeys(input, ARTIFACT_FIELDS, 'artifact');
  const artifact = structuredClone(input);
  requireRef(artifact.artifactRef, 'artifact.artifactRef');
  requireSafeName(artifact.filename, 'artifact.filename');
  requireMediaType(artifact.mediaType, 'artifact.mediaType');
  requireSha(artifact.sha256, 'artifact.sha256');
  positiveSafeInteger(artifact.expectedBytes, 'artifact.expectedBytes');
  positiveSafeInteger(artifact.maxBytes, 'artifact.maxBytes');
  if (artifact.expectedBytes > artifact.maxBytes) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'artifact.expectedBytes exceeds maxBytes');
  }
  requireRef(artifact.sourceRef, 'artifact.sourceRef');
  requireRef(artifact.licenseRef, 'artifact.licenseRef');
  return Object.freeze(artifact);
}

export function validateArtifactRegistry(registry) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'artifact registry must be one object');
  }
  exactKeys(registry, ARTIFACT_REGISTRY_FIELDS, 'artifact registry');
  if (registry.schemaVersion !== ARTIFACT_REGISTRY_SCHEMA) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `artifact registry schema must be ${ARTIFACT_REGISTRY_SCHEMA}`);
  }
  requireRef(registry.registryRef, 'artifact registryRef');
  if (!Array.isArray(registry.artifacts)) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'artifact registry artifacts must be an array');
  }
  const artifacts = registry.artifacts.map(validateArtifactDescriptor);
  const refs = artifacts.map((item) => item.artifactRef);
  if (new Set(refs).size !== refs.length) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'artifact registry artifactRef values must be unique');
  }
  return Object.freeze({ ...structuredClone(registry), artifacts });
}

function validateChannel(channel, label) {
  if (!channel || typeof channel !== 'object' || Array.isArray(channel)) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `${label} must be one object`);
  }
  requireRef(channel.channelRef, `${label}.channelRef`);
  if (!DELIVERY_TRANSPORT_CLASSES.includes(channel.transportClass)) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `${label}.transportClass is not admitted`);
  }
  if (channel.transportClass === 'DIRECT_HTTPS_FILE_V1') {
    exactKeys(channel, DIRECT_CHANNEL_FIELDS, label);
    requireHttps(channel.url, `${label}.url`);
  } else {
    exactKeys(channel, CHUNK_CHANNEL_FIELDS, label);
    requireHttps(channel.manifestUrl, `${label}.manifestUrl`);
    requireSha(channel.manifestSha256, `${label}.manifestSha256`);
  }
  return Object.freeze(structuredClone(channel));
}

export function validateArtifactDeliveryRegistry(registry, artifactRegistry = null) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'delivery registry must be one object');
  }
  exactKeys(registry, DELIVERY_REGISTRY_FIELDS, 'delivery registry');
  if (registry.schemaVersion !== ARTIFACT_DELIVERY_REGISTRY_SCHEMA) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `delivery registry schema must be ${ARTIFACT_DELIVERY_REGISTRY_SCHEMA}`);
  }
  requireRef(registry.registryRef, 'delivery registryRef');
  requireRef(registry.defaultPolicyRef, 'delivery defaultPolicyRef');
  if (!Array.isArray(registry.policies) || registry.policies.length === 0) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'delivery registry policies must be non-empty');
  }
  const policies = registry.policies.map((policy, index) => {
    exactKeys(policy, POLICY_FIELDS, `policies[${index}]`);
    requireRef(policy.policyRef, `policies[${index}].policyRef`);
    if (!Array.isArray(policy.allowedTransportClasses) || policy.allowedTransportClasses.length === 0 ||
        policy.allowedTransportClasses.some((value) => !DELIVERY_TRANSPORT_CLASSES.includes(value)) ||
        new Set(policy.allowedTransportClasses).size !== policy.allowedTransportClasses.length) {
      fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `policies[${index}].allowedTransportClasses is invalid`);
    }
    return Object.freeze(structuredClone(policy));
  });
  const policyRefs = policies.map((policy) => policy.policyRef);
  if (new Set(policyRefs).size !== policyRefs.length) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'delivery registry policyRef values must be unique');
  }
  if (!policies.some((policy) => policy.policyRef === registry.defaultPolicyRef)) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'delivery defaultPolicyRef is not registered');
  }
  if (!registry.channelsByArtifactRef || typeof registry.channelsByArtifactRef !== 'object' || Array.isArray(registry.channelsByArtifactRef)) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'channelsByArtifactRef must be one object');
  }
  const channelsByArtifactRef = {};
  const allChannelRefs = new Set();
  for (const [artifactRef, channels] of Object.entries(registry.channelsByArtifactRef)) {
    requireRef(artifactRef, 'channelsByArtifactRef key');
    if (!Array.isArray(channels) || channels.length === 0) {
      fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `channelsByArtifactRef.${artifactRef} must be non-empty`);
    }
    channelsByArtifactRef[artifactRef] = channels.map((channel, index) => {
      const validated = validateChannel(channel, `channelsByArtifactRef.${artifactRef}[${index}]`);
      if (allChannelRefs.has(validated.channelRef)) {
        fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `duplicate channelRef ${validated.channelRef}`);
      }
      allChannelRefs.add(validated.channelRef);
      return validated;
    });
  }
  if (artifactRegistry) {
    const artifacts = validateArtifactRegistry(artifactRegistry);
    const artifactRefs = new Set(artifacts.artifacts.map((item) => item.artifactRef));
    for (const artifactRef of Object.keys(channelsByArtifactRef)) {
      if (!artifactRefs.has(artifactRef)) {
        fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `delivery registry has orphan artifactRef ${artifactRef}`);
      }
    }
  }
  return Object.freeze({ ...structuredClone(registry), policies, channelsByArtifactRef });
}

function policyFor(registry, deliveryPolicyRef) {
  const wanted = deliveryPolicyRef ?? registry.defaultPolicyRef;
  requireRef(wanted, 'deliveryPolicyRef');
  const policy = registry.policies.find((entry) => entry.policyRef === wanted);
  if (!policy) fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `unknown delivery policy ${wanted}`);
  return policy;
}

function channelStatePaths(finalPath) {
  return {
    directSidecarPath: `${finalPath}.delivery-source.json`,
    legacyPartialPath: `${finalPath}.partial`,
    assemblyPath: `${finalPath}.assembly.partial`,
    assemblySidecarPath: `${finalPath}.assembly-sidecar.json`
  };
}

function clearDirectState(finalPath) {
  const { directSidecarPath, legacyPartialPath } = channelStatePaths(finalPath);
  removeRegularFileIfPresent(legacyPartialPath);
  removeRegularFileIfPresent(directSidecarPath);
}

function clearAssemblyState(finalPath) {
  const { assemblyPath, assemblySidecarPath } = channelStatePaths(finalPath);
  removeRegularFileIfPresent(assemblyPath);
  removeRegularFileIfPresent(assemblySidecarPath);
}

function clearAllPartialState(finalPath) {
  clearDirectState(finalPath);
  clearAssemblyState(finalPath);
}

function readJsonFileOrNull(filePath) {
  if (!fs.existsSync(filePath)) return null;
  regularFileStat(filePath, 'delivery sidecar');
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function exactObjectMatches(actual, expected) {
  return Boolean(actual && typeof actual === 'object' && !Array.isArray(actual) &&
    JSON.stringify(Object.keys(actual).sort()) === JSON.stringify(Object.keys(expected).sort()) &&
    Object.keys(expected).every((key) => actual[key] === expected[key]));
}

function directSidecarFor(artifact, channel) {
  return {
    schemaVersion: 'vexlife.artifact-direct-sidecar/v1',
    artifactRef: artifact.artifactRef,
    channelRef: channel.channelRef,
    expectedSha256: artifact.sha256,
    expectedBytes: artifact.expectedBytes,
    sourceUrlWithoutQuery: sanitizeDeliveryUrl(channel.url)
  };
}

function transportFailureDetail(error, extra = {}) {
  return { ...extra, causeName: typeof error?.name === 'string' ? error.name : null, causeCode: typeof error?.code === 'string' ? error.code : null };
}

function isTransportUnavailableError(error) {
  if (error?.name === 'AbortError') return true;
  if (typeof error?.code === 'string' && TRANSPORT_CODES.has(error.code)) return true;
  const message = String(error?.message ?? '');
  return error?.name === 'TypeError' && /(?:fetch|network|socket|connect|timeout|unavailable)/iu.test(message);
}

function classifyLocalOrUnknownFailure(error, channelRef, stage) {
  if (typeof error?.code === 'string' && LOCAL_IO_CODES.has(error.code)) {
    return new ArtifactDeliveryError(ARTIFACT_DELIVERY_FAILURE_CODES.LOCAL_IO_FAILURE, `${stage} local filesystem failure`, transportFailureDetail(error, { channelRef }));
  }
  if (isTransportUnavailableError(error)) {
    return new ArtifactDeliveryError(ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_UNAVAILABLE, `${stage} transport unavailable`, transportFailureDetail(error, { channelRef }));
  }
  return new ArtifactDeliveryError(ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_PROTOCOL_INVALID, `${stage} failed without an admitted transport-unavailable classification`, transportFailureDetail(error, { channelRef }));
}

function isUnavailableHttpStatus(status) {
  return status === 404 || status === 408 || status === 425 || status === 429 || status >= 500;
}

function classifyHttpFailure(status, channelRef, stage) {
  if (Number.isInteger(status) && isUnavailableHttpStatus(status)) {
    return new ArtifactDeliveryError(ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_UNAVAILABLE, `${stage} unavailable: HTTP ${status}`, { channelRef, status });
  }
  return new ArtifactDeliveryError(ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_PROTOCOL_INVALID, `${stage} returned non-fallback HTTP ${Number.isInteger(status) ? status : 'NO_RESPONSE'}`, { channelRef, status: Number.isInteger(status) ? status : null });
}

function classifyLegacyDirectFailure(error, channelRef) {
  const message = String(error?.message ?? error);
  const http = message.match(/^download failed: HTTP (\d{3})$/u);
  if (http) return classifyHttpFailure(Number(http[1]), channelRef, 'artifact channel');
  if (/resume response did not start at the requested byte/u.test(message)) {
    return new ArtifactDeliveryError(ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_PROTOCOL_INVALID, 'direct artifact resume protocol contradiction', { channelRef });
  }
  if (/checksum mismatch|byte count mismatch|existing artifact failed verification/u.test(message)) {
    return new ArtifactDeliveryError(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, 'direct artifact integrity verification failed', { channelRef });
  }
  if (/exceeded admitted size|exceeds maxBytes|exceeds expectedBytes|credential-free HTTPS|SHA-256|positive safe integer/u.test(message)) {
    return new ArtifactDeliveryError(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'direct artifact request violated source-managed policy', { channelRef });
  }
  return classifyLocalOrUnknownFailure(error, channelRef, 'direct artifact channel');
}

async function downloadDirectChannel({ artifact, channel, finalPath, directDownload, fetchImpl, onProgress }) {
  if (typeof directDownload !== 'function') {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'directDownload implementation is required for DIRECT_HTTPS_FILE_V1');
  }
  const { directSidecarPath, legacyPartialPath } = channelStatePaths(finalPath);
  const expected = directSidecarFor(artifact, channel);
  const partialExists = Boolean(regularFileStat(legacyPartialPath, 'legacy direct partial'));
  const prior = readJsonFileOrNull(directSidecarPath);
  if (partialExists && !exactObjectMatches(prior, expected)) clearDirectState(finalPath);
  else if (!partialExists && prior) removeRegularFileIfPresent(directSidecarPath);
  writeJsonAtomic(directSidecarPath, expected);
  try {
    const result = await directDownload({
      url: channel.url,
      expectedSha256: artifact.sha256,
      expectedBytes: artifact.expectedBytes,
      maxBytes: artifact.maxBytes,
      finalPath,
      fetchImpl,
      onProgress
    });
    const independentlyVerified = await classifyExactArtifact({ finalPath, expectedSha256: artifact.sha256, expectedBytes: artifact.expectedBytes });
    if (independentlyVerified.state !== 'VERIFIED_REUSABLE') {
      clearDirectState(finalPath);
      fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, 'direct artifact implementation returned without exact final-file verification', { channelRef: channel.channelRef, observedState: independentlyVerified.state });
    }
    removeRegularFileIfPresent(directSidecarPath);
    return {
      state: 'VERIFIED',
      disposition: result.disposition,
      path: finalPath,
      bytes: independentlyVerified.bytes,
      actualSha256: independentlyVerified.actualSha256,
      selectedChannelRef: result.disposition === 'REUSED_VERIFIED' ? null : channel.channelRef,
      attemptedChannelRefs: result.disposition === 'REUSED_VERIFIED' ? [] : [channel.channelRef],
      providerOrNetworkEffect: result.disposition !== 'REUSED_VERIFIED',
      recordedSourceUrl: result.disposition === 'REUSED_VERIFIED' ? null : sanitizeDeliveryUrl(channel.url)
    };
  } catch (error) {
    const classified = error instanceof ArtifactDeliveryError ? error : classifyLegacyDirectFailure(error, channel.channelRef);
    if (classified.code !== ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_UNAVAILABLE) clearDirectState(finalPath);
    throw classified;
  }
}

async function readResponseBytes(response, maxBytes, label, channelRef) {
  if (!response?.ok) throw classifyHttpFailure(response?.status, channelRef, label);
  if (!response.body) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_PROTOCOL_INVALID, `${label} response is missing a body`, { channelRef, status: response.status });
  }
  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `${label} exceeds admitted bytes`);
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error instanceof ArtifactDeliveryError) throw error;
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_UNAVAILABLE, `${label} stream unavailable`, { causeName: error?.name ?? null });
  }
  return Buffer.concat(chunks, total);
}

async function fetchManifestBytes(channel, fetchImpl) {
  let response;
  try { response = await fetchImpl(channel.manifestUrl, { redirect: 'follow' }); }
  catch (error) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_UNAVAILABLE, `artifact manifest channel unavailable: ${channel.channelRef}`, { causeName: error?.name ?? null });
  }
  return readResponseBytes(response, MAX_MANIFEST_BYTES, 'artifact manifest', channel.channelRef);
}

export function validateChunkManifest(input, { artifact, channel, manifestSha256 }) {
  exactKeys(input, MANIFEST_FIELDS, 'artifact manifest');
  if (input.schemaVersion !== ARTIFACT_CHUNK_MANIFEST_SCHEMA) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_PROTOCOL_INVALID, `artifact manifest schema must be ${ARTIFACT_CHUNK_MANIFEST_SCHEMA}`);
  }
  if (input.artifactRef !== artifact.artifactRef || input.filename !== artifact.filename ||
      input.expectedBytes !== artifact.expectedBytes || input.expectedSha256 !== artifact.sha256) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, 'artifact manifest final identity contradicts source-managed artifact identity');
  }
  if (input.sourceRef !== artifact.sourceRef || input.licenseRef !== artifact.licenseRef) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'artifact manifest source/license identity contradicts artifact registry');
  }
  requireRef(input.releaseRef, 'artifact manifest releaseRef');
  exactKeys(input.chunking, CHUNKING_FIELDS, 'artifact manifest chunking');
  if (input.chunking.algorithm !== 'FIXED_BYTES') {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_PROTOCOL_INVALID, 'artifact manifest chunking.algorithm must be FIXED_BYTES');
  }
  positiveSafeInteger(input.chunking.chunkBytes, 'artifact manifest chunking.chunkBytes');
  if (input.chunking.chunkBytes > artifact.maxBytes) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'artifact manifest chunkBytes exceeds artifact maxBytes');
  }
  if (!Array.isArray(input.parts) || input.parts.length === 0 || input.parts.length > MAX_PART_COUNT) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_PROTOCOL_INVALID, 'artifact manifest parts count is outside admitted bounds');
  }
  let offset = 0;
  const assetNames = new Set();
  const urls = new Set();
  for (const [index, part] of input.parts.entries()) {
    exactKeys(part, PART_FIELDS, `parts[${index}]`);
    nonNegativeSafeInteger(part.index, `parts[${index}].index`);
    nonNegativeSafeInteger(part.offset, `parts[${index}].offset`);
    positiveSafeInteger(part.bytes, `parts[${index}].bytes`);
    positiveSafeInteger(part.cumulativeBytes, `parts[${index}].cumulativeBytes`);
    requireSha(part.sha256, `parts[${index}].sha256`);
    requireSha(part.cumulativeSha256, `parts[${index}].cumulativeSha256`);
    requireSafeName(part.assetName, `parts[${index}].assetName`);
    requireHttps(part.url, `parts[${index}].url`);
    if (part.index !== index || part.offset !== offset || part.cumulativeBytes !== offset + part.bytes) {
      fail(ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_PROTOCOL_INVALID, `parts[${index}] is not contiguous`);
    }
    if (index < input.parts.length - 1 && part.bytes !== input.chunking.chunkBytes) {
      fail(ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_PROTOCOL_INVALID, `parts[${index}].bytes must equal fixed chunkBytes before the final part`);
    }
    if (part.bytes > input.chunking.chunkBytes) {
      fail(ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_PROTOCOL_INVALID, `parts[${index}].bytes exceeds fixed chunkBytes`);
    }
    const assetKey = part.assetName.toLowerCase();
    const urlKey = new URL(part.url).href;
    if (assetNames.has(assetKey) || urls.has(urlKey)) {
      fail(ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_PROTOCOL_INVALID, 'artifact manifest contains duplicate or case-fold-colliding part asset/URL');
    }
    assetNames.add(assetKey);
    urls.add(urlKey);
    offset += part.bytes;
  }
  if (offset !== artifact.expectedBytes || input.parts.at(-1).cumulativeBytes !== artifact.expectedBytes) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, 'artifact manifest part bytes do not equal final artifact bytes');
  }
  if (manifestSha256 !== channel.manifestSha256) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, 'artifact manifest digest differs from source-pinned channel digest');
  }
  return Object.freeze(structuredClone(input));
}

function assemblySidecarFor({ artifact, channel, manifestSha256, lastCommittedPart, committedBytes, committedCumulativeSha256 }) {
  return {
    schemaVersion: ARTIFACT_ASSEMBLY_SIDECAR_SCHEMA,
    artifactRef: artifact.artifactRef,
    channelRef: channel.channelRef,
    manifestSha256,
    expectedFinalSha256: artifact.sha256,
    expectedFinalBytes: artifact.expectedBytes,
    lastCommittedPart,
    committedBytes,
    committedCumulativeSha256
  };
}

async function prepareAssemblyResume({ artifact, channel, manifest, manifestSha256, finalPath }) {
  const { assemblyPath, assemblySidecarPath } = channelStatePaths(finalPath);
  const stat = regularFileStat(assemblyPath, 'artifact assembly partial');
  const sidecar = readJsonFileOrNull(assemblySidecarPath);
  if (!stat && !sidecar) return { assemblyPath, assemblySidecarPath, nextPart: 0, committedBytes: 0 };
  if (!stat || !sidecar) {
    clearAssemblyState(finalPath);
    return { assemblyPath, assemblySidecarPath, nextPart: 0, committedBytes: 0 };
  }
  const baseExpected = {
    schemaVersion: ARTIFACT_ASSEMBLY_SIDECAR_SCHEMA,
    artifactRef: artifact.artifactRef,
    channelRef: channel.channelRef,
    manifestSha256,
    expectedFinalSha256: artifact.sha256,
    expectedFinalBytes: artifact.expectedBytes
  };
  if (!Object.entries(baseExpected).every(([key, value]) => sidecar[key] === value) ||
      !Number.isSafeInteger(sidecar.lastCommittedPart) || !Number.isSafeInteger(sidecar.committedBytes) ||
      typeof sidecar.committedCumulativeSha256 !== 'string' || !SHA256_RE.test(sidecar.committedCumulativeSha256)) {
    clearAssemblyState(finalPath);
    return { assemblyPath, assemblySidecarPath, nextPart: 0, committedBytes: 0 };
  }
  if (sidecar.lastCommittedPart < 0 || sidecar.lastCommittedPart >= manifest.parts.length ||
      sidecar.committedBytes !== manifest.parts[sidecar.lastCommittedPart].cumulativeBytes || stat.size !== sidecar.committedBytes) {
    clearAssemblyState(finalPath);
    return { assemblyPath, assemblySidecarPath, nextPart: 0, committedBytes: 0 };
  }
  const actual = await sha256File(assemblyPath);
  if (actual !== sidecar.committedCumulativeSha256 || actual !== manifest.parts[sidecar.lastCommittedPart].cumulativeSha256) {
    clearAssemblyState(finalPath);
    return { assemblyPath, assemblySidecarPath, nextPart: 0, committedBytes: 0 };
  }
  return {
    assemblyPath,
    assemblySidecarPath,
    nextPart: sidecar.lastCommittedPart + 1,
    committedBytes: sidecar.committedBytes
  };
}

async function downloadPartToFile({ part, channelRef, fetchImpl, partPath }) {
  let response;
  try { response = await fetchImpl(part.url, { redirect: 'follow' }); }
  catch (error) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_UNAVAILABLE, `artifact part channel unavailable: ${channelRef}`, { channelRef, partIndex: part.index, causeName: error?.name ?? null });
  }
  if (!response?.ok) {
    const classified = classifyHttpFailure(response?.status, channelRef, 'artifact part');
    classified.detail = { ...classified.detail, partIndex: part.index };
    throw classified;
  }
  if (!response.body) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_PROTOCOL_INVALID, 'artifact part response is missing a body', { channelRef, partIndex: part.index, status: response.status });
  }
  if (response.status !== 200) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_PROTOCOL_INVALID, 'artifact part must return HTTP 200 when no range was requested', { channelRef, partIndex: part.index, status: response.status });
  }
  const declaredText = response.headers.get('content-length');
  if (declaredText !== null) {
    const declared = Number(declaredText);
    if (!Number.isSafeInteger(declared) || declared < 0) {
      fail(ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_PROTOCOL_INVALID, 'artifact part Content-Length is invalid', { channelRef, partIndex: part.index });
    }
    if (declared !== part.bytes) {
      fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, 'artifact part Content-Length contradicts manifest', { channelRef, partIndex: part.index, declared, expected: part.bytes });
    }
  }
  removeRegularFileIfPresent(partPath);
  let total = 0;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      total += chunk.length;
      if (total > part.bytes) callback(new ArtifactDeliveryError(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, 'artifact part exceeded manifest bytes', { channelRef, partIndex: part.index }));
      else callback(null, chunk);
    }
  });
  try {
    await pipeline(Readable.fromWeb(response.body), limiter, fs.createWriteStream(partPath, { flags: 'wx' }));
  } catch (error) {
    removeRegularFileIfPresent(partPath);
    if (error instanceof ArtifactDeliveryError) throw error;
    const classified = classifyLocalOrUnknownFailure(error, channelRef, 'artifact part stream');
    classified.detail = { ...classified.detail, partIndex: part.index };
    throw classified;
  }
  if (total !== part.bytes) {
    removeRegularFileIfPresent(partPath);
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, 'artifact part byte count mismatch', { channelRef, partIndex: part.index, actualBytes: total, expectedBytes: part.bytes });
  }
  const actualSha256 = await sha256File(partPath);
  if (actualSha256 !== part.sha256) {
    removeRegularFileIfPresent(partPath);
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, 'artifact part SHA-256 mismatch', { channelRef, partIndex: part.index, actualSha256, expectedSha256: part.sha256 });
  }
}

async function appendFile(sourcePath, destinationPath) {
  await pipeline(fs.createReadStream(sourcePath), fs.createWriteStream(destinationPath, { flags: 'a' }));
}

async function downloadChunkChannel({ artifact, channel, finalPath, fetchImpl, onProgress }) {
  const manifestBytes = await fetchManifestBytes(channel, fetchImpl);
  const manifestSha256 = sha256Bytes(manifestBytes);
  if (manifestSha256 !== channel.manifestSha256) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, 'artifact manifest SHA-256 mismatch', { channelRef: channel.channelRef, actualSha256: manifestSha256 });
  }
  let parsed;
  try { parsed = JSON.parse(manifestBytes.toString('utf8')); }
  catch {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_PROTOCOL_INVALID, 'artifact manifest is not valid JSON', { channelRef: channel.channelRef });
  }
  const manifest = validateChunkManifest(parsed, { artifact, channel, manifestSha256 });
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  const resume = await prepareAssemblyResume({ artifact, channel, manifest, manifestSha256, finalPath });
  if (resume.nextPart === 0) {
    removeRegularFileIfPresent(resume.assemblyPath);
    fs.writeFileSync(resume.assemblyPath, Buffer.alloc(0), { flag: 'wx', mode: 0o600 });
  }
  for (let index = resume.nextPart; index < manifest.parts.length; index += 1) {
    const part = manifest.parts[index];
    const partPath = `${resume.assemblyPath}.part-${String(index).padStart(4, '0')}.partial`;
    await downloadPartToFile({ part, channelRef: channel.channelRef, fetchImpl, partPath });
    await appendFile(partPath, resume.assemblyPath);
    removeRegularFileIfPresent(partPath);
    const stat = regularFileStat(resume.assemblyPath, 'artifact assembly partial');
    if (!stat || stat.size !== part.cumulativeBytes) {
      clearAssemblyState(finalPath);
      fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, 'artifact cumulative byte checkpoint mismatch', { channelRef: channel.channelRef, partIndex: index });
    }
    const cumulative = await sha256File(resume.assemblyPath);
    if (cumulative !== part.cumulativeSha256) {
      clearAssemblyState(finalPath);
      fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, 'artifact cumulative SHA-256 checkpoint mismatch', { channelRef: channel.channelRef, partIndex: index });
    }
    writeJsonAtomic(resume.assemblySidecarPath, assemblySidecarFor({
      artifact,
      channel,
      manifestSha256,
      lastCommittedPart: index,
      committedBytes: part.cumulativeBytes,
      committedCumulativeSha256: cumulative
    }));
    onProgress({ artifactRef: artifact.artifactRef, channelRef: channel.channelRef, committedBytes: part.cumulativeBytes, expectedBytes: artifact.expectedBytes, partIndex: index });
  }
  const finalStat = regularFileStat(resume.assemblyPath, 'artifact assembly partial');
  if (!finalStat || finalStat.size !== artifact.expectedBytes) {
    clearAssemblyState(finalPath);
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, 'artifact reconstructed byte count mismatch', { channelRef: channel.channelRef });
  }
  const actualSha256 = await sha256File(resume.assemblyPath);
  if (actualSha256 !== artifact.sha256) {
    clearAssemblyState(finalPath);
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, 'artifact reconstructed SHA-256 mismatch', { channelRef: channel.channelRef, actualSha256 });
  }
  fs.renameSync(resume.assemblyPath, finalPath);
  removeRegularFileIfPresent(resume.assemblySidecarPath);
  return {
    state: 'VERIFIED',
    disposition: resume.nextPart > 0 ? 'RESUMED_AND_VERIFIED' : 'DOWNLOADED_AND_VERIFIED',
    path: finalPath,
    bytes: artifact.expectedBytes,
    actualSha256,
    selectedChannelRef: channel.channelRef,
    attemptedChannelRefs: [channel.channelRef],
    providerOrNetworkEffect: true,
    manifestSha256,
    recordedSourceUrl: sanitizeDeliveryUrl(channel.manifestUrl)
  };
}

async function resolveArtifactDeliveryFromRegistrySnapshot({
  artifactRef,
  deliveryPolicyRef = null,
  finalPath,
  artifactRegistry,
  deliveryRegistry,
  directDownload,
  fetchImpl = fetch,
  onProgress = () => {}
}) {
  requireRef(artifactRef, 'artifactRef');
  if (typeof finalPath !== 'string' || !path.isAbsolute(finalPath)) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'finalPath must be absolute');
  }
  const artifacts = validateArtifactRegistry(artifactRegistry);
  const delivery = validateArtifactDeliveryRegistry(deliveryRegistry, artifacts);
  const artifact = artifacts.artifacts.find((item) => item.artifactRef === artifactRef);
  if (!artifact) fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `unknown artifactRef ${artifactRef}`);
  const policy = policyFor(delivery, deliveryPolicyRef);
  const cache = await classifyExactArtifact({ finalPath, expectedSha256: artifact.sha256, expectedBytes: artifact.expectedBytes });
  if (cache.state === 'VERIFIED_REUSABLE') {
    clearAllPartialState(finalPath);
    return {
      artifactRef,
      state: 'VERIFIED',
      disposition: 'REUSED_VERIFIED',
      path: finalPath,
      bytes: cache.bytes,
      actualSha256: cache.actualSha256,
      selectedChannelRef: null,
      attemptedChannelRefs: [],
      providerOrNetworkEffect: false,
      manifestSha256: null,
      recordedSourceUrl: null
    };
  }
  if (cache.state !== 'MISSING') {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, `existing artifact failed verification: ${cache.state}`, { artifactRef, cacheState: cache.state });
  }
  const channels = delivery.channelsByArtifactRef[artifactRef];
  if (!channels?.length) fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `artifact has no source-managed channels: ${artifactRef}`);
  const admitted = channels.filter((channel) => policy.allowedTransportClasses.includes(channel.transportClass));
  if (!admitted.length) fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, `artifact has no channels admitted by policy ${policy.policyRef}`);
  const attemptedChannelRefs = [];
  for (let index = 0; index < admitted.length; index += 1) {
    const channel = admitted[index];
    attemptedChannelRefs.push(channel.channelRef);
    try {
      const result = channel.transportClass === 'DIRECT_HTTPS_FILE_V1'
        ? await downloadDirectChannel({ artifact, channel, finalPath, directDownload, fetchImpl, onProgress })
        : await downloadChunkChannel({ artifact, channel, finalPath, fetchImpl, onProgress });
      return { ...result, artifactRef, attemptedChannelRefs: [...attemptedChannelRefs] };
    } catch (error) {
      if (!(error instanceof ArtifactDeliveryError) || error.code !== ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_UNAVAILABLE) throw error;
      if (index === admitted.length - 1) {
        error.detail = { ...error.detail, artifactRef, attemptedChannelRefs: [...attemptedChannelRefs] };
        throw error;
      }
      clearAllPartialState(finalPath);
    }
  }
  fail(ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_UNAVAILABLE, 'no artifact delivery channel completed', { artifactRef, attemptedChannelRefs });
}

export async function resolveAndDownloadArtifact(input) {
  allowedKeys(input, SOURCE_RESOLVER_FIELDS, 'resolveAndDownloadArtifact input');
  const { artifactRef, deliveryPolicyRef = null, finalPath } = input;
  const artifactRegistry = loadSourceJson(SOURCE_ARTIFACT_REGISTRY_PATH, 'source-managed artifact registry');
  const deliveryRegistry = loadSourceJson(SOURCE_DELIVERY_REGISTRY_PATH, 'source-managed artifact delivery registry');
  return resolveArtifactDeliveryFromRegistrySnapshot({
    artifactRef,
    deliveryPolicyRef,
    finalPath,
    artifactRegistry,
    deliveryRegistry,
    directDownload: downloadVerifiedArtifact,
    fetchImpl: fetch
  });
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function validatePublicationBaseUrl(value) {
  const parsed = requireHttps(value, 'publicationBaseUrl');
  if (parsed.search || parsed.hash) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'publicationBaseUrl must not contain query or fragment');
  }
  if (!parsed.pathname.endsWith('/')) parsed.pathname += '/';
  return parsed.toString();
}

export async function formDeterministicArtifactMirror({
  inputPath,
  outputDir,
  artifact,
  chunkBytes,
  publicationBaseUrl,
  releaseRef
}) {
  const descriptor = validateArtifactDescriptor(artifact);
  if (typeof inputPath !== 'string' || !path.isAbsolute(inputPath) || typeof outputDir !== 'string' || !path.isAbsolute(outputDir)) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'inputPath and outputDir must be absolute');
  }
  const inputStat = regularFileStat(inputPath, 'mirror source artifact');
  if (!inputStat) fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'mirror source artifact is missing');
  if (inputStat.size !== descriptor.expectedBytes || await sha256File(inputPath) !== descriptor.sha256) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, 'mirror source artifact does not match source-managed artifact identity');
  }
  positiveSafeInteger(chunkBytes, 'chunkBytes');
  if (chunkBytes > descriptor.maxBytes) fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'chunkBytes exceeds artifact maxBytes');
  const baseUrl = validatePublicationBaseUrl(publicationBaseUrl);
  requireRef(releaseRef, 'releaseRef');
  if (fs.existsSync(outputDir)) {
    const stat = fs.lstatSync(outputDir);
    if (!stat.isDirectory() || stat.isSymbolicLink() || fs.readdirSync(outputDir).length !== 0) {
      fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'outputDir must be absent or one empty real directory');
    }
  } else fs.mkdirSync(outputDir, { recursive: true });

  const partCount = Math.ceil(descriptor.expectedBytes / chunkBytes);
  if (partCount < 1 || partCount > MAX_PART_COUNT) fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_POLICY_REJECTED, 'part count is outside admitted bounds');
  const width = Math.max(4, String(partCount).length);
  const parts = [];
  const cumulativeHash = crypto.createHash('sha256');
  const fd = fs.openSync(inputPath, fs.constants.O_RDONLY | Number(fs.constants.O_NOFOLLOW ?? 0));
  let offset = 0;
  try {
    for (let index = 0; index < partCount; index += 1) {
      const bytes = Math.min(chunkBytes, descriptor.expectedBytes - offset);
      const assetName = `${descriptor.filename}.part-${String(index + 1).padStart(width, '0')}-of-${String(partCount).padStart(width, '0')}`;
      requireSafeName(assetName, 'generated part assetName');
      const partPath = path.join(outputDir, assetName);
      const partHash = crypto.createHash('sha256');
      const writeFd = fs.openSync(partPath, 'wx', 0o600);
      try {
        const buffer = Buffer.allocUnsafe(Math.min(1024 * 1024, bytes));
        let remaining = bytes;
        let position = offset;
        while (remaining > 0) {
          const count = fs.readSync(fd, buffer, 0, Math.min(buffer.length, remaining), position);
          if (count <= 0) fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, 'unexpected EOF while splitting artifact');
          const slice = buffer.subarray(0, count);
          fs.writeSync(writeFd, slice);
          partHash.update(slice);
          cumulativeHash.update(slice);
          remaining -= count;
          position += count;
        }
      } finally { fs.closeSync(writeFd); }
      const partSha256 = partHash.digest('hex');
      const cumulativeCopy = cumulativeHash.copy().digest('hex');
      offset += bytes;
      parts.push({
        index,
        offset: offset - bytes,
        bytes,
        sha256: partSha256,
        cumulativeBytes: offset,
        cumulativeSha256: cumulativeCopy,
        assetName,
        url: new URL(assetName, baseUrl).toString()
      });
    }
  } finally { fs.closeSync(fd); }
  if (offset !== descriptor.expectedBytes) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, 'mirror split byte count differs from source-managed artifact identity', { actualBytes: offset, expectedBytes: descriptor.expectedBytes });
  }
  const splitSha256 = cumulativeHash.digest('hex');
  if (splitSha256 !== descriptor.sha256) {
    fail(ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH, 'mirror split bytes differ from the source-managed artifact identity', { actualSha256: splitSha256, expectedSha256: descriptor.sha256 });
  }

  const manifest = {
    schemaVersion: ARTIFACT_CHUNK_MANIFEST_SCHEMA,
    artifactRef: descriptor.artifactRef,
    filename: descriptor.filename,
    expectedBytes: descriptor.expectedBytes,
    expectedSha256: descriptor.sha256,
    chunking: { algorithm: 'FIXED_BYTES', chunkBytes },
    parts,
    sourceRef: descriptor.sourceRef,
    licenseRef: descriptor.licenseRef,
    releaseRef
  };
  const manifestBytes = canonicalJsonBytes(manifest);
  const manifestSha256 = sha256Bytes(manifestBytes);
  fs.writeFileSync(path.join(outputDir, 'artifact-manifest.json'), manifestBytes, { flag: 'wx', mode: 0o600 });
  const assetRows = parts.map((part) => ({ assetName: part.assetName, bytes: part.bytes, sha256: part.sha256 }));
  assetRows.push({ assetName: 'artifact-manifest.json', bytes: manifestBytes.length, sha256: manifestSha256 });
  const sums = `${assetRows.map((item) => `${item.sha256}  ${item.assetName}`).join('\n')}\n`;
  const sumsBytes = Buffer.from(sums, 'utf8');
  fs.writeFileSync(path.join(outputDir, 'SHA256SUMS'), sumsBytes, { flag: 'wx', mode: 0o600 });
  const inventoryAssets = [...assetRows, { assetName: 'SHA256SUMS', bytes: sumsBytes.length, sha256: sha256Bytes(sumsBytes) }];
  const inventory = {
    schemaVersion: ARTIFACT_PUBLICATION_INVENTORY_SCHEMA,
    artifactRef: descriptor.artifactRef,
    sourceArtifact: {
      filename: descriptor.filename,
      expectedBytes: descriptor.expectedBytes,
      expectedSha256: descriptor.sha256,
      sourceRef: descriptor.sourceRef,
      licenseRef: descriptor.licenseRef
    },
    releaseRef,
    chunkBytes,
    manifestSha256,
    assets: inventoryAssets
  };
  const inventoryBytes = canonicalJsonBytes(inventory);
  fs.writeFileSync(path.join(outputDir, 'publication-inventory.json'), inventoryBytes, { flag: 'wx', mode: 0o600 });
  return Object.freeze({
    artifactRef: descriptor.artifactRef,
    outputDir,
    partCount,
    manifestSha256,
    manifest,
    inventory,
    providerOrNetworkEffect: false,
    uploadPerformed: false,
    modelBytesChanged: false
  });
}

// [VXG RealForever]
