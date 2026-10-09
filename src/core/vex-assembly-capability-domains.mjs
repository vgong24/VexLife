import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';

import { loadBrowserCompanionHomeIdentity } from './browser-companion-bridge.mjs';
import {
  sourceManifestBucketId,
  sourceManifestBucketPath,
} from './source-manifest.mjs';
import { semanticHash } from './utils.mjs';

export const VEX_ASSEMBLY_CAPABILITY_DOMAIN_PARENT_REF =
  'capability.vexlife.companion-read-domains';
export const VEX_ASSEMBLY_CAPABILITY_DOMAIN_REFS = Object.freeze({
  LOCAL: 'capability.vexlife.local.observe',
  ONLINE: 'capability.vexlife.online.observe',
  VEXHOME: 'capability.vexlife.vexhome.observe',
  CODE: 'capability.vexlife.code.read',
});
export const VEX_ASSEMBLY_ONLINE_HELD_STATE = 'HELD_NO_SAFE_ONLINE_PROVIDER';

const DOMAIN_SOURCE_REF = 'source.vexlife.vex-assembly-capability-domains';
const REGISTRY_SOURCE_REF = 'source.blueprint.capability-registry';
const REGISTRY_SOURCE_VERSION_REF = 'capability-registry.v4';
const SOURCE_MANIFEST_SCHEMA = 'vexlife.source-manifest/v3';
const SOURCE_MANIFEST_REF = 'source-manifest.vexlife.universal-blueprint.001';
const SOURCE_MANIFEST_SOURCE_KIND = 'GIT_INDEX_CANONICAL_BLOBS';
const SOURCE_MANIFEST_PART_SCHEMA = 'vexlife.source-manifest-part/v1';
const CODE_EXCERPT_MAX_BYTES = 4096;
const CODE_FILE_MAX_BYTES = 1024 * 1024;
const CODE_PATH_MAX_CHARS = 512;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const SAFE_GIT_MODE = new Set(['100644', '100755']);
const BLOCKED_CODE_ROOTS = new Set([
  '.agents',
  '.codex',
  '.git',
  '.vexlife',
  'artifacts',
  'generated',
  'models',
  'runtime',
  'source-manifest-parts',
]);

function canonicalRefs(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value))].sort();
}

function currentness() {
  return Object.freeze({
    state: 'CURRENT',
    sourceRef: REGISTRY_SOURCE_REF,
    sourceVersionRef: REGISTRY_SOURCE_VERSION_REF,
    compatibility: 'COMPATIBLE',
  });
}

function observation(capabilityRef, payload, sourceRefs = []) {
  return Object.freeze({
    summaryRef: `summary.${capabilityRef}.${semanticHash(payload).slice(0, 20)}`,
    capabilityRef,
    sourceRefs: Object.freeze(canonicalRefs([
      REGISTRY_SOURCE_REF,
      DOMAIN_SOURCE_REF,
      ...sourceRefs,
    ])),
    currentness: currentness(),
    payload: Object.freeze(structuredClone(payload)),
  });
}

function noEffects(extra = {}) {
  return Object.freeze({
    networkPerformed: false,
    credentialsUsed: false,
    filesystemMutationPerformed: false,
    processMutationPerformed: false,
    homeMutationPerformed: false,
    memoryReadPerformed: false,
    memoryMutationPerformed: false,
    repositoryMutationPerformed: false,
    ...extra,
  });
}

function exactArgumentKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} arguments must be one object`);
  }
  const extras = Object.keys(value).filter((key) => !allowed.has(key));
  if (extras.length > 0) throw new TypeError(`${label} does not accept argument ${extras[0]}`);
  return value;
}

function canonicalDirectory(root, label) {
  if (typeof root !== 'string' || root.length === 0) throw new TypeError(`${label} is required`);
  const requested = path.resolve(root);
  const stat = fs.lstatSync(requested);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be one regular directory`);
  const canonical = fs.realpathSync.native(requested);
  if (canonical !== requested) throw new Error(`${label} must already be canonical`);
  return canonical;
}

function assertContained(canonicalRoot, candidate, label) {
  const relative = path.relative(canonicalRoot, candidate);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) return;
  throw new Error(`${label} escapes its bounded root`);
}

function regularFile(canonicalRoot, relativePath, label) {
  const segments = relativePath.split('/');
  let cursor = canonicalRoot;
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) throw new Error(`${label} cannot traverse a symbolic link`);
  }
  const stat = fs.lstatSync(cursor);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be one regular non-link file`);
  const real = fs.realpathSync.native(cursor);
  assertContained(canonicalRoot, real, label);
  return real;
}

function readJsonRegular(canonicalRoot, relativePath, label) {
  return JSON.parse(fs.readFileSync(regularFile(canonicalRoot, relativePath, label), 'utf8'));
}

function readManifestDescriptor(sourceRoot) {
  const descriptor = readJsonRegular(sourceRoot, 'SOURCE-MANIFEST.json', 'Source Manifest descriptor');
  if (
    descriptor.schemaVersion !== SOURCE_MANIFEST_SCHEMA
    || descriptor.manifestRef !== SOURCE_MANIFEST_REF
    || descriptor.sourceKind !== SOURCE_MANIFEST_SOURCE_KIND
    || descriptor.partSchemaVersion !== SOURCE_MANIFEST_PART_SCHEMA
    || descriptor.composition !== 'STABLE_PATH_HASH_BUCKET_COMPOSITION'
    || !SHA256_RE.test(descriptor.contractSha256 ?? '')
  ) {
    throw new Error('CODE_SOURCE_MANIFEST_CONTRACT_INVALID');
  }
  const { contractSha256, ...contract } = descriptor;
  if (semanticHash(contract) !== contractSha256) {
    throw new Error('CODE_SOURCE_MANIFEST_CONTRACT_HASH_MISMATCH');
  }
  return descriptor;
}

function safeCodePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > CODE_PATH_MAX_CHARS) return null;
  if (value.includes('\\') || value.includes('\0') || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) return null;
  const segments = value.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null;
  if (BLOCKED_CODE_ROOTS.has(segments[0]) || segments[0] === 'SOURCE-MANIFEST.json') return null;
  if (segments.includes('node_modules')) return null;
  if (path.posix.normalize(value) !== value) return null;
  return value;
}

function utf8Excerpt(buffer) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  if (buffer.length <= CODE_EXCERPT_MAX_BYTES) return { content: text, truncated: false };
  let content = '';
  for (const character of text) {
    const candidate = `${content}${character}`;
    if (Buffer.byteLength(candidate, 'utf8') > CODE_EXCERPT_MAX_BYTES) break;
    content = candidate;
  }
  return { content, truncated: true };
}

function heldCode(reasonCode, requestedPath) {
  return {
    state: 'HELD_CODE_READ_REJECTED',
    reasonCode,
    requestedPath: typeof requestedPath === 'string' ? requestedPath : null,
    sourceIdentity: null,
    content: null,
    effects: noEffects(),
  };
}

export function readSourceManifestBackedCode({ sourceRoot, relativePath }) {
  let canonicalRoot;
  let safePath;
  try {
    canonicalRoot = canonicalDirectory(sourceRoot, 'CODE source root');
    safePath = safeCodePath(relativePath);
    if (!safePath) return heldCode('CODE_PATH_INVALID_OR_EXCLUDED', relativePath);
    const descriptor = readManifestDescriptor(canonicalRoot);
    const bucketId = sourceManifestBucketId(safePath);
    const bucketRef = sourceManifestBucketPath(bucketId);
    const bucket = readJsonRegular(canonicalRoot, bucketRef, 'Source Manifest bucket');
    if (
      bucket.schemaVersion !== descriptor.partSchemaVersion
      || bucket.bucketId !== bucketId
      || !Array.isArray(bucket.files)
    ) {
      return heldCode('CODE_SOURCE_MANIFEST_BUCKET_INVALID', safePath);
    }
    const matches = bucket.files.filter((record) => record?.path === safePath);
    if (matches.length !== 1) return heldCode('CODE_PATH_NOT_MANIFESTED', safePath);
    const record = matches[0];
    if (
      !SAFE_GIT_MODE.has(record.mode)
      || !Number.isSafeInteger(record.bytes)
      || record.bytes < 0
      || record.bytes > CODE_FILE_MAX_BYTES
      || !SHA256_RE.test(record.sha256 ?? '')
    ) {
      return heldCode('CODE_SOURCE_RECORD_NOT_READABLE', safePath);
    }
    const file = regularFile(canonicalRoot, safePath, 'CODE source path');
    const bytes = fs.readFileSync(file);
    if (bytes.length !== record.bytes) return heldCode('CODE_SOURCE_BYTES_MISMATCH', safePath);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== record.sha256) return heldCode('CODE_SOURCE_SHA256_MISMATCH', safePath);
    let excerpt;
    try {
      excerpt = utf8Excerpt(bytes);
    } catch {
      return heldCode('CODE_SOURCE_NOT_UTF8', safePath);
    }
    return {
      state: 'CURRENT_CODE_SOURCE',
      reasonCode: null,
      requestedPath: safePath,
      sourceIdentity: {
        manifestRef: descriptor.manifestRef,
        manifestContractSha256: descriptor.contractSha256,
        bucketRef,
        mode: record.mode,
        bytes: record.bytes,
        sha256,
      },
      content: excerpt.content,
      truncated: excerpt.truncated,
      excerptBytes: Buffer.byteLength(excerpt.content, 'utf8'),
      effects: noEffects(),
    };
  } catch (error) {
    const reasonCode = /symbolic link/u.test(error?.message ?? '')
      ? 'CODE_SOURCE_SYMLINK_REJECTED'
      : 'CODE_SOURCE_READ_FAILED_CLOSED';
    return heldCode(reasonCode, safePath ?? relativePath);
  }
}

function readWhitelistedHomeSummary(home) {
  const identity = loadBrowserCompanionHomeIdentity(home);
  const canonicalHome = identity.home;
  let modelConfiguration;
  let recoveryReceipt;
  try {
    modelConfiguration = readJsonRegular(canonicalHome, 'config/model.json', 'qualified model configuration');
    recoveryReceipt = readJsonRegular(canonicalHome, 'recovery/vex-initialization-receipt.json', 'runtime recovery receipt');
  } catch (error) {
    return {
      state: 'HELD_VEXHOME_RUNTIME_SUMMARY_UNAVAILABLE',
      reasonCode: /symbolic link/u.test(error?.message ?? '') ? 'VEXHOME_SYMLINK_REJECTED' : 'VEXHOME_WHITELISTED_SOURCE_UNAVAILABLE',
      homeIdentity: {
        homeRef: identity.homeRef,
        deviceRef: identity.deviceRef,
        companionLineageRef: identity.companionLineageRef,
      },
      modelBinding: null,
      runtimeSummary: null,
      recoverySummary: null,
      effects: noEffects(),
    };
  }
  if (
    modelConfiguration.schemaVersion !== 'vexlife.model-configuration/v1'
    || modelConfiguration.state !== 'BOUND_QUALIFIED'
    || modelConfiguration.automaticDownload !== false
    || modelConfiguration.automaticActivation !== false
  ) {
    return {
      state: 'HELD_VEXHOME_RUNTIME_SUMMARY_UNAVAILABLE',
      reasonCode: 'VEXHOME_MODEL_CONFIGURATION_NOT_QUALIFIED',
      homeIdentity: {
        homeRef: identity.homeRef,
        deviceRef: identity.deviceRef,
        companionLineageRef: identity.companionLineageRef,
      },
      modelBinding: null,
      runtimeSummary: null,
      recoverySummary: null,
      effects: noEffects(),
    };
  }
  const receiptIdentityMatches = recoveryReceipt?.state === 'RUNTIME_QUALIFIED'
    && recoveryReceipt?.profileRef === modelConfiguration.profileRef
    && recoveryReceipt?.modelBundleRef === modelConfiguration.activeModelBundleRef
    && recoveryReceipt?.generationRef === modelConfiguration.generationRef
    && recoveryReceipt?.modelProfileRef === modelConfiguration.modelProfileRef;
  if (!receiptIdentityMatches) {
    return {
      state: 'HELD_VEXHOME_RUNTIME_SUMMARY_UNAVAILABLE',
      reasonCode: 'VEXHOME_RECOVERY_RECEIPT_IDENTITY_MISMATCH',
      homeIdentity: {
        homeRef: identity.homeRef,
        deviceRef: identity.deviceRef,
        companionLineageRef: identity.companionLineageRef,
      },
      modelBinding: null,
      runtimeSummary: null,
      recoverySummary: null,
      effects: noEffects(),
    };
  }
  return {
    state: 'CURRENT_VEXHOME_RUNTIME_SUMMARY',
    reasonCode: null,
    homeIdentity: {
      homeRef: identity.homeRef,
      deviceRef: identity.deviceRef,
      companionLineageRef: identity.companionLineageRef,
    },
    modelBinding: {
      state: modelConfiguration.state,
      profileRef: modelConfiguration.profileRef,
      activeModelBundleRef: modelConfiguration.activeModelBundleRef,
      generationRef: modelConfiguration.generationRef,
      modelProfileRef: modelConfiguration.modelProfileRef,
      requestModel: modelConfiguration.requestModel,
      qualificationReceiptRef: modelConfiguration.qualificationReceiptRef,
      automaticDownload: modelConfiguration.automaticDownload,
      automaticActivation: modelConfiguration.automaticActivation,
    },
    runtimeSummary: {
      runtimeDependencyRef: modelConfiguration.runtimeDependencyRef,
      runtimePid: modelConfiguration.runtimePid,
      runtimeExecutableSha256: modelConfiguration.runtimeExecutableSha256,
      livenessObserved: false,
      processEffectPerformed: false,
    },
    recoverySummary: {
      state: recoveryReceipt.state,
      receiptRef: recoveryReceipt.receiptRef,
      formedAt: recoveryReceipt.formedAt,
      runtimeDisposition: recoveryReceipt.runtime?.disposition ?? null,
      exactBindingMatch: true,
      recoveryExecuted: false,
    },
    effects: noEffects(),
  };
}

function createLocalExecutor(sourceRoot) {
  return async (argumentsValue) => {
    exactArgumentKeys(argumentsValue, new Set(), VEX_ASSEMBLY_CAPABILITY_DOMAIN_REFS.LOCAL);
    let payload;
    try {
      const canonicalRoot = canonicalDirectory(sourceRoot, 'LOCAL source root');
      const descriptor = readManifestDescriptor(canonicalRoot);
      payload = {
        state: 'CURRENT_BOUNDED_LOCAL_OBSERVATION',
        runtime: {
          platform: process.platform,
          architecture: process.arch,
          nodeVersion: process.version,
        },
        source: {
          manifestRef: descriptor.manifestRef,
          rootRef: descriptor.rootRef,
          sourceKind: descriptor.sourceKind,
          contractSha256: descriptor.contractSha256,
        },
        effects: noEffects(),
      };
    } catch {
      payload = {
        state: 'HELD_LOCAL_OBSERVATION_UNAVAILABLE',
        runtime: null,
        source: null,
        effects: noEffects(),
      };
    }
    return observation(VEX_ASSEMBLY_CAPABILITY_DOMAIN_REFS.LOCAL, payload, [SOURCE_MANIFEST_REF]);
  };
}

function createOnlineExecutor() {
  return async (argumentsValue) => {
    exactArgumentKeys(argumentsValue, new Set(), VEX_ASSEMBLY_CAPABILITY_DOMAIN_REFS.ONLINE);
    return observation(VEX_ASSEMBLY_CAPABILITY_DOMAIN_REFS.ONLINE, {
      state: VEX_ASSEMBLY_ONLINE_HELD_STATE,
      reasonCode: 'NO_SAFE_ONLINE_PROVIDER_BOUND',
      providerRef: null,
      networkPerformed: false,
      credentialsUsed: false,
      effects: noEffects(),
    });
  };
}

function createVexHomeExecutor(home) {
  return async (argumentsValue) => {
    exactArgumentKeys(argumentsValue, new Set(), VEX_ASSEMBLY_CAPABILITY_DOMAIN_REFS.VEXHOME);
    let payload;
    try {
      payload = readWhitelistedHomeSummary(home);
    } catch (error) {
      payload = {
        state: 'HELD_VEXHOME_RUNTIME_SUMMARY_UNAVAILABLE',
        reasonCode: 'VEXHOME_IDENTITY_UNAVAILABLE',
        failureClass: error?.code ?? null,
        homeIdentity: null,
        modelBinding: null,
        runtimeSummary: null,
        recoverySummary: null,
        effects: noEffects(),
      };
    }
    return observation(VEX_ASSEMBLY_CAPABILITY_DOMAIN_REFS.VEXHOME, payload, [
      'source.vexlife.browser-companion-home-identity',
      'source.vexlife.model-configuration',
      'source.vexlife.recovery-initialization-receipt',
    ]);
  };
}

function createCodeExecutor(sourceRoot) {
  return async (argumentsValue) => {
    const args = exactArgumentKeys(argumentsValue, new Set(['path']), VEX_ASSEMBLY_CAPABILITY_DOMAIN_REFS.CODE);
    const payload = readSourceManifestBackedCode({ sourceRoot, relativePath: args.path });
    return observation(VEX_ASSEMBLY_CAPABILITY_DOMAIN_REFS.CODE, payload, [
      SOURCE_MANIFEST_REF,
      payload.sourceIdentity ? `source.vexlife.code.${payload.sourceIdentity.sha256.slice(0, 24)}` : null,
    ]);
  };
}

export function bindVexAssemblyCapabilityDomainContext(context = {}) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    throw new TypeError('capability-domain context must be one object');
  }
  return Object.freeze({
    ...context,
    activeCapabilityRef: VEX_ASSEMBLY_CAPABILITY_DOMAIN_PARENT_REF,
  });
}

export function createVexAssemblyCapabilityDomainSupport({ sourceRoot, home } = {}) {
  const executors = Object.freeze({
    [VEX_ASSEMBLY_CAPABILITY_DOMAIN_REFS.LOCAL]: createLocalExecutor(sourceRoot),
    [VEX_ASSEMBLY_CAPABILITY_DOMAIN_REFS.ONLINE]: createOnlineExecutor(),
    [VEX_ASSEMBLY_CAPABILITY_DOMAIN_REFS.VEXHOME]: createVexHomeExecutor(home),
    [VEX_ASSEMBLY_CAPABILITY_DOMAIN_REFS.CODE]: createCodeExecutor(sourceRoot),
  });
  return Object.freeze({
    schemaVersion: 'vexlife.vex-assembly-capability-domain-support/v1',
    parentCapabilityRef: VEX_ASSEMBLY_CAPABILITY_DOMAIN_PARENT_REF,
    childCapabilityRefs: Object.freeze(Object.values(VEX_ASSEMBLY_CAPABILITY_DOMAIN_REFS)),
    executors,
    bindContext: bindVexAssemblyCapabilityDomainContext,
  });
}

// [VXG RealForever]
