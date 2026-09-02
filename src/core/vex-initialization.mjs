import path from 'node:path';
import { semanticHash } from './utils.mjs';
import { validateArtifactRegistry } from './artifact-delivery.mjs';

export const VEX_OPERATIONAL_PROFILE_REGISTRY_SCHEMA = 'vexlife.operational-profiles/v1';
export const VEX_MODEL_BUNDLE_REGISTRY_SCHEMA = 'vexlife.model-bundle-registry/v1';
export const NORMAL_MODEL_BUNDLE_STATE = 'RELEASE_QUALIFIED';
export const VEX_INITIALIZATION_PLAN_SCHEMA = 'vexlife.initialization-plan/v1';
export const NORMAL_PROFILE_STATE = 'RELEASE_QUALIFIED';
export const CANDIDATE_PROFILE_STATE = 'CANDIDATE_QUALIFICATION';

const SHA256 = /^[0-9a-f]{64}$/u;
const LOOPBACK_ORIGIN = /^http:\/\/127\.0\.0\.1:(\d{1,5})$/u;
const SAFE_FILE = /^[^\\\/:*?"<>|\u0000]+$/u;
const STABLE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/u;

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
}
function requireString(value, label) { if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string`); }
function requireStableRef(value, label) { if (typeof value !== 'string' || !STABLE_REF.test(value)) throw new Error(`${label} must be a stable ref`); }
function requireSha(value, label) { if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${label} must be lowercase SHA-256`); }
function requireHttps(value, label) { const parsed = new URL(value); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error(`${label} must be credential-free HTTPS`); }

function normalizeProcessIdentityText(value, { caseInsensitive = false } = {}) {
  const normalized = String(value ?? '').replaceAll('\\', '/');
  return caseInsensitive ? normalized.toLowerCase() : normalized;
}

function tokenizeProcessCommandLine(value) {
  const text = String(value ?? '');
  const tokens = [];
  let current = '';
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (/\s/u.test(ch) && !inQuotes) {
      if (current) { tokens.push(current); current = ''; }
      continue;
    }
    current += ch;
  }
  if (inQuotes) return null;
  if (current) tokens.push(current);
  return tokens;
}

function expectedFlattenedProcessCommandLine(expectedExecutablePath, expectedArguments) {
  return [String(expectedExecutablePath ?? ''), ...expectedArguments.map((value) => String(value))].join(' ');
}

export function runtimeExecutableIdentityMatches({ profile, actualSha256, bytes }) {
  const runtime = profile?.runtime;
  if (!runtime || typeof runtime.executableSha256 !== 'string') return false;
  if (actualSha256 !== runtime.executableSha256) return false;
  if (runtime.executableExpectedBytes !== undefined && runtime.executableExpectedBytes !== null &&
      bytes !== runtime.executableExpectedBytes) return false;
  return true;
}

export function runtimeProcessEvidenceMatches({ processEvidence, expectedExecutablePath, expectedArguments = [] }) {
  if (!processEvidence || typeof processEvidence !== 'object' || Array.isArray(processEvidence)) return false;
  if (!Array.isArray(expectedArguments) || expectedArguments.some((value) => typeof value !== 'string')) return false;
  const explicitEvidencePlatform = typeof processEvidence.platform === 'string' ? processEvidence.platform : null;
  if (explicitEvidencePlatform !== null && !['darwin', 'win32'].includes(explicitEvidencePlatform)) return false;
  const darwinFlattenedWitness = explicitEvidencePlatform === 'darwin';
  // Missing platform metadata is the accepted legacy/Windows-compatible evidence shape.
  // Never infer its semantics from the OS currently running this portable validator.
  const caseInsensitive = !darwinFlattenedWitness;
  const expectedExecutable = normalizeProcessIdentityText(expectedExecutablePath, { caseInsensitive });
  if (!expectedExecutable) return false;
  const expectedName = expectedExecutable.split('/').filter(Boolean).at(-1) ?? '';
  const name = normalizeProcessIdentityText(processEvidence.name, { caseInsensitive });
  if (name !== expectedName) return false;
  const actualExecutable = normalizeProcessIdentityText(processEvidence.executablePath, { caseInsensitive });
  if (!actualExecutable || actualExecutable !== expectedExecutable) return false;

  if (darwinFlattenedWitness) {
    // Apple's ps obtains NUL-separated argv with KERN_PROCARGS2 and renders argv
    // boundaries as ordinary spaces. The spawn-owned receipt retains the exact
    // vector; this live witness is explicitly the exact flattened rendering only.
    if (processEvidence.commandLineClass !== 'DARWIN_PS_FLATTENED_ARGV' ||
        processEvidence.argvBoundaryPreserved !== false) return false;
    const actualFlattened = String(processEvidence.commandLine ?? '').trim();
    const expectedFlattened = expectedFlattenedProcessCommandLine(expectedExecutablePath, expectedArguments);
    return actualFlattened === expectedFlattened;
  }

  const tokens = tokenizeProcessCommandLine(processEvidence.commandLine);
  if (!tokens || tokens.length !== expectedArguments.length + 1) return false;
  const actualTokens = tokens.map((value) => normalizeProcessIdentityText(value, { caseInsensitive }));
  if (actualTokens[0] !== expectedExecutable) return false;
  for (let index = 0; index < expectedArguments.length; index += 1) {
    if (actualTokens[index + 1] !== normalizeProcessIdentityText(expectedArguments[index], { caseInsensitive })) return false;
  }
  return true;
}

export function validateOperationalProfileRegistry(registry) {
  const errors = [];
  try {
    requireObject(registry, 'registry');
    if (registry.schemaVersion !== VEX_OPERATIONAL_PROFILE_REGISTRY_SCHEMA) throw new Error(`registry.schemaVersion must be ${VEX_OPERATIONAL_PROFILE_REGISTRY_SCHEMA}`);
    requireString(registry.registryRef, 'registry.registryRef');
    requireStableRef(registry.modelBundleRegistryRef, 'registry.modelBundleRegistryRef');
    if (registry.modelBundleRegistryRef !== 'registry.vexlife.model-bundles.001') throw new Error('registry.modelBundleRegistryRef is not the canonical model-bundle registry');
    if (!Array.isArray(registry.profiles) || registry.profiles.length === 0) throw new Error('registry.profiles must be non-empty');
    const refs = new Set();
    for (const [index, profile] of registry.profiles.entries()) {
      const p = `profiles[${index}]`;
      requireObject(profile, p);
      requireString(profile.profileRef, `${p}.profileRef`);
      if (refs.has(profile.profileRef)) throw new Error(`duplicate profileRef ${profile.profileRef}`);
      refs.add(profile.profileRef);
      if (!Array.isArray(profile.compatibleModelBundleRefs) || profile.compatibleModelBundleRefs.length === 0 || profile.compatibleModelBundleRefs.some((value) => typeof value !== 'string' || !STABLE_REF.test(value)) || new Set(profile.compatibleModelBundleRefs).size !== profile.compatibleModelBundleRefs.length) throw new Error(`${p}.compatibleModelBundleRefs must contain unique stable refs`);
      if (![NORMAL_PROFILE_STATE, CANDIDATE_PROFILE_STATE, 'HELD', 'STALE', 'INVALID'].includes(profile.state)) throw new Error(`${p}.state is unknown`);
      const platformArchitecture = `${profile.platform}/${profile.architecture}`;
      if (!['win32/x64', 'darwin/arm64'].includes(platformArchitecture)) {
        throw new Error(`${p} platform/architecture is not an admitted operational pair: ${platformArchitecture}`);
      }
      requireString(profile.hardwareProfileRef, `${p}.hardwareProfileRef`);
      requireObject(profile.hostRequirements, `${p}.hostRequirements`);
      if (profile.platform === 'darwin') {
        requireString(profile.hostRequirements.appleChipModel, `${p}.hostRequirements.appleChipModel`);
      }
      requireObject(profile.endpoint, `${p}.endpoint`);
      const match = LOOPBACK_ORIGIN.exec(profile.endpoint.origin);
      if (!match) throw new Error(`${p}.endpoint.origin must use numeric loopback`);
      if (Number(match[1]) < 1 || Number(match[1]) > 65535) throw new Error(`${p}.endpoint port is invalid`);
      requireString(profile.endpoint.requestModel, `${p}.endpoint.requestModel`);
      requireObject(profile.qualification, `${p}.qualification`);
      requireString(profile.qualification.probePrompt, `${p}.qualification.probePrompt`);
      if (!Number.isSafeInteger(profile.qualification.probeMaxTokens) || profile.qualification.probeMaxTokens <= 0) {
        throw new Error(`${p}.qualification.probeMaxTokens must be positive`);
      }
      if (profile.qualification.expectedContent !== undefined && profile.qualification.expectedContent !== null) {
        requireString(profile.qualification.expectedContent, `${p}.qualification.expectedContent`);
        if (profile.qualification.expectedContent !== profile.qualification.expectedContent.trim()) {
          throw new Error(`${p}.qualification.expectedContent must have no leading/trailing whitespace`);
        }
      }
      requireObject(profile.runtime, `${p}.runtime`);
      requireString(profile.runtime.dependencyRef, `${p}.runtime.dependencyRef`);
      requireString(profile.runtime.version, `${p}.runtime.version`);
      requireString(profile.runtime.immutableRevisionRef, `${p}.runtime.immutableRevisionRef`);
      const executableShaDiscovery =
        profile.state === CANDIDATE_PROFILE_STATE &&
        profile.runtime.executableSha256 === null &&
        profile.runtime.executableSha256DiscoveryRequired === true;
      if (!executableShaDiscovery) requireSha(profile.runtime.executableSha256, `${p}.runtime.executableSha256`);
      if (profile.runtime.executableExpectedBytes !== undefined && profile.runtime.executableExpectedBytes !== null &&
          (!Number.isSafeInteger(profile.runtime.executableExpectedBytes) || profile.runtime.executableExpectedBytes <= 0)) {
        throw new Error(`${p}.runtime.executableExpectedBytes must be null/absent or a positive safe integer`);
      }
      if (profile.platform === 'darwin' && profile.runtime.executableSha256 !== null &&
          (!Number.isSafeInteger(profile.runtime.executableExpectedBytes) || profile.runtime.executableExpectedBytes <= 0)) {
        throw new Error(`${p}.runtime.executableExpectedBytes is required when a macOS executable SHA-256 is pinned`);
      }
      if (profile.state === NORMAL_PROFILE_STATE && profile.runtime.executableSha256 === null) {
        throw new Error(`${p}.runtime.executableSha256 is required for RELEASE_QUALIFIED`);
      }
      if (!SAFE_FILE.test(profile.runtime.executableName)) throw new Error(`${p}.runtime.executableName must be a safe filename`);
      if (!Array.isArray(profile.runtime.artifacts) || profile.runtime.artifacts.length < 1) throw new Error(`${p}.runtime.artifacts must be non-empty`);
      if (!Array.isArray(profile.modelArtifacts) || profile.modelArtifacts.length < 1) throw new Error(`${p}.modelArtifacts must be non-empty`);
      for (const artifact of profile.runtime.artifacts) {
        requireString(artifact.artifactRef, `${p}.runtime artifactRef`);
        requireString(artifact.filename, `${p}.runtime filename`);
        if (!SAFE_FILE.test(artifact.filename)) throw new Error(`${p}.runtime filename must be safe`);
        requireHttps(artifact.url, `${p}.runtime url`);
        requireSha(artifact.sha256, `${p}.runtime sha256`);
        requireString(artifact.licenseRef, `${p}.runtime licenseRef`);
        requireString(artifact.sourceRef, `${p}.runtime sourceRef`);
        if (!Number.isSafeInteger(artifact.maxBytes) || artifact.maxBytes <= 0) throw new Error(`${p}.runtime maxBytes must be positive`);
        if (artifact.expectedBytes !== null && (!Number.isSafeInteger(artifact.expectedBytes) || artifact.expectedBytes <= 0)) throw new Error(`${p}.runtime expectedBytes must be null or positive`);
      }
      for (const artifact of profile.modelArtifacts) {
        requireString(artifact.artifactRef, `${p}.model artifactRef`);
        requireString(artifact.filename, `${p}.model filename`);
        if (!SAFE_FILE.test(artifact.filename)) throw new Error(`${p}.model filename must be safe`);
        if (Object.hasOwn(artifact, 'url')) throw new Error(`${p}.model artifact URL/provider authority belongs in the canonical delivery registry`);
        requireSha(artifact.sha256, `${p}.model sha256`);
        requireString(artifact.licenseRef, `${p}.model licenseRef`);
        requireString(artifact.sourceRef, `${p}.model sourceRef`);
        if (!Number.isSafeInteger(artifact.maxBytes) || artifact.maxBytes <= 0) throw new Error(`${p}.model maxBytes must be positive`);
        if (artifact.expectedBytes !== null && (!Number.isSafeInteger(artifact.expectedBytes) || artifact.expectedBytes <= 0)) throw new Error(`${p}.model expectedBytes must be null or positive`);
      }
      requireObject(profile.runtime.extraction, `${p}.runtime.extraction`);      requireObject(profile.runtime.extraction, `${p}.runtime.extraction`);
      requireString(profile.runtime.extraction.class, `${p}.runtime.extraction.class`);
      requireString(profile.runtime.extraction.subdirectory, `${p}.runtime.extraction.subdirectory`);
      if (path.isAbsolute(profile.runtime.extraction.subdirectory) || profile.runtime.extraction.subdirectory.includes('..')) throw new Error(`${p}.runtime.extraction.subdirectory must be safe relative`);
      const requiredExtractionClass = profile.platform === 'win32' ? 'WINDOWS_ZIP_EXPAND_ARCHIVE' : 'POSIX_TAR_GZ';
      if (profile.runtime.extraction.class !== requiredExtractionClass) {
        throw new Error(`${p}.runtime.extraction.class must be ${requiredExtractionClass}`);
      }
      if (!Array.isArray(profile.runtime.argumentTemplate) || profile.runtime.argumentTemplate.length === 0) throw new Error(`${p}.runtime.argumentTemplate must be non-empty`);
      for (const arg of profile.runtime.argumentTemplate) requireString(arg, `${p}.runtime.argumentTemplate item`);
      if (profile.runtime.devicePolicy !== undefined && profile.runtime.devicePolicy !== null) {
        requireObject(profile.runtime.devicePolicy, `${p}.runtime.devicePolicy`);
        if (profile.runtime.devicePolicy.class !== 'EXACT_DEVICE_AND_GPU_LAYER_POLICY') {
          throw new Error(`${p}.runtime.devicePolicy.class must be EXACT_DEVICE_AND_GPU_LAYER_POLICY`);
        }
        requireString(profile.runtime.devicePolicy.deviceRef, `${p}.runtime.devicePolicy.deviceRef`);
        requireString(profile.runtime.devicePolicy.gpuLayers, `${p}.runtime.devicePolicy.gpuLayers`);
        requireString(profile.runtime.devicePolicy.evidenceRef, `${p}.runtime.devicePolicy.evidenceRef`);
        requireString(profile.runtime.devicePolicy.upstreamRevisionRef, `${p}.runtime.devicePolicy.upstreamRevisionRef`);
        const flagValue = (flag) => {
          const indexes = profile.runtime.argumentTemplate.flatMap((value, index) => value === flag ? [index] : []);
          if (indexes.length !== 1 || indexes[0] + 1 >= profile.runtime.argumentTemplate.length) {
            throw new Error(`${p}.runtime.argumentTemplate must contain exactly one ${flag} value`);
          }
          return profile.runtime.argumentTemplate[indexes[0] + 1];
        };
        if (flagValue('--device') !== profile.runtime.devicePolicy.deviceRef) {
          throw new Error(`${p}.runtime.devicePolicy.deviceRef must match --device argv`);
        }
        if (flagValue('--gpu-layers') !== profile.runtime.devicePolicy.gpuLayers) {
          throw new Error(`${p}.runtime.devicePolicy.gpuLayers must match --gpu-layers argv`);
        }
      }
      if (profile.platform === 'darwin' && profile.releaseQualification?.runtimeQualificationPassed === true) {
        requireObject(profile.releaseQualification.runtimeQualificationEvidence, `${p}.releaseQualification.runtimeQualificationEvidence`);
        const evidence = profile.releaseQualification.runtimeQualificationEvidence;
        for (const field of ['acceptanceRef','sourceHead','sourceTree','deviceRef','gpuLayers','artifactCacheClass','runtimeMaterializationClass']) {
          requireString(evidence[field], `${p}.releaseQualification.runtimeQualificationEvidence.${field}`);
        }
        if (!/^[0-9a-f]{40}$/u.test(evidence.sourceHead) || !/^[0-9a-f]{40}$/u.test(evidence.sourceTree)) {
          throw new Error(`${p}.releaseQualification.runtimeQualificationEvidence sourceHead/sourceTree must be 40-char Git object SHAs`);
        }
        requireSha(evidence.responseSha256, `${p}.releaseQualification.runtimeQualificationEvidence.responseSha256`);
        if (evidence.deviceRef !== profile.runtime.devicePolicy?.deviceRef ||
            evidence.gpuLayers !== profile.runtime.devicePolicy?.gpuLayers) {
          throw new Error(`${p}.releaseQualification.runtimeQualificationEvidence device policy must match runtime.devicePolicy`);
        }
        if (evidence.artifactCacheClass !== 'REUSED_VERIFIED' ||
            evidence.runtimeMaterializationClass !== 'REUSED_VERIFIED_RUNTIME') {
          throw new Error(`${p}.releaseQualification.runtimeQualificationEvidence cache/materialization classes are not exact`);
        }
        for (const field of ['exactProcessPathArgv','numericLoopbackOnly','exactOwnedShutdown']) {
          if (evidence[field] !== true) throw new Error(`${p}.releaseQualification.runtimeQualificationEvidence.${field} must be true`);
        }
      }
      if (profile.platform === 'darwin') {
        const release = profile.releaseQualification;
        requireObject(release, `${p}.releaseQualification`);
        const lifecycleFields = ['browserRealTurnPassed','repairPassed','uninstallPreservePassed','rebuildPreservePassed'];
        const anyLifecyclePassed = lifecycleFields.some((field) => release[field] === true);
        const requiresLifecycleEvidence = anyLifecyclePassed || profile.state === NORMAL_PROFILE_STATE;
        if (requiresLifecycleEvidence) {
          requireObject(release.lifecycleQualificationEvidence, `${p}.releaseQualification.lifecycleQualificationEvidence`);
          const evidence = release.lifecycleQualificationEvidence;
          for (const field of ['acceptanceRef','sourceHead','sourceTree','returnSha256','returnContentSetSha256',
            'firstConversationHeadSha256','secondConversationHeadSha256','secondPriorConversationHeadSha256',
            'technicalMemorySentinelSha256','finalProtectedHomeFingerprintSha256',
            'modelDisposition','projectorDisposition','runtimeReacquisitionDisposition','runtimeMaterializationDisposition']) {
            requireString(evidence[field], `${p}.releaseQualification.lifecycleQualificationEvidence.${field}`);
          }
          if (!/^[0-9a-f]{40}$/u.test(evidence.sourceHead) || !/^[0-9a-f]{40}$/u.test(evidence.sourceTree)) {
            throw new Error(`${p}.releaseQualification.lifecycleQualificationEvidence sourceHead/sourceTree must be 40-char Git object SHAs`);
          }
          for (const field of ['returnSha256','returnContentSetSha256','firstConversationHeadSha256','secondConversationHeadSha256',
            'secondPriorConversationHeadSha256','technicalMemorySentinelSha256','finalProtectedHomeFingerprintSha256']) {
            requireSha(evidence[field], `${p}.releaseQualification.lifecycleQualificationEvidence.${field}`);
          }
          if (evidence.secondPriorConversationHeadSha256 !== evidence.firstConversationHeadSha256 ||
              evidence.secondConversationHeadSha256 === evidence.firstConversationHeadSha256) {
            throw new Error(`${p}.releaseQualification.lifecycleQualificationEvidence conversation ancestry is not exact`);
          }
          if (evidence.modelDisposition !== 'REUSED_VERIFIED' || evidence.projectorDisposition !== 'REUSED_VERIFIED' ||
              evidence.runtimeReacquisitionDisposition !== 'DOWNLOADED_AND_VERIFIED' ||
              evidence.runtimeMaterializationDisposition !== 'MATERIALIZED_VERIFIED_RUNTIME') {
            throw new Error(`${p}.releaseQualification.lifecycleQualificationEvidence artifact lifecycle dispositions are not exact`);
          }
          for (const field of ['pathWithSpacesProcessOwnershipPassed','technicalMemoryContinuityPassed','conversationContinuityPassed',
            'modelProjectorExternalFetchHeld','onlyExactRuntimeArchiveExternalFetchAllowed','exactOwnedShutdown']) {
            if (evidence[field] !== true) throw new Error(`${p}.releaseQualification.lifecycleQualificationEvidence.${field} must be true`);
          }
          for (const field of ['personalHome','HomeDeleted','MemoryDeleted','destructiveLocalDataRemovalPerformed']) {
            if (evidence[field] !== false) throw new Error(`${p}.releaseQualification.lifecycleQualificationEvidence.${field} must be false`);
          }
        }
        if (profile.state === NORMAL_PROFILE_STATE) {
          if (release.class !== 'SOURCE_LOCAL_OPERATIONAL_PROFILE') throw new Error(`${p}.releaseQualification.class must be SOURCE_LOCAL_OPERATIONAL_PROFILE for RELEASE_QUALIFIED`);
          for (const field of ['runtimeQualificationPassed',...lifecycleFields]) {
            if (release[field] !== true) throw new Error(`${p}.releaseQualification.${field} must be true for RELEASE_QUALIFIED`);
          }
          for (const field of ['officialVerifiedBuildClaimed','publicReleaseClaimed','p11FreshHumanClaimed']) {
            if (release[field] !== false) throw new Error(`${p}.releaseQualification.${field} must remain false for source-local RELEASE_QUALIFIED`);
          }
        }
      }
      if (!Array.isArray(profile.refreshTriggers) || profile.refreshTriggers.length === 0) throw new Error(`${p}.refreshTriggers must be non-empty`);
    }
  } catch (error) { errors.push(error.message); }
  return { ok: errors.length === 0, errors };
}

export function evaluateOperationalProfileHost(profile, host) {
  requireObject(profile, 'profile');
  requireObject(host, 'host');
  if (host.platform !== profile.platform || host.architecture !== profile.architecture) {
    return { ok: false, state: 'UNSUPPORTED_HOST', reason: 'PLATFORM_ARCHITECTURE_MISMATCH' };
  }
  const req = profile.hostRequirements ?? {};
  if (Number.isSafeInteger(req.minimumSystemMemoryBytes) && host.totalMemoryBytes < req.minimumSystemMemoryBytes) {
    return { ok: false, state: 'UNSUPPORTED_HOST', reason: 'INSUFFICIENT_SYSTEM_MEMORY' };
  }
  if (Number.isSafeInteger(req.minimumFreeDiskBytes) && host.freeDiskBytes < req.minimumFreeDiskBytes) {
    return { ok: false, state: 'UNSUPPORTED_HOST', reason: 'INSUFFICIENT_FREE_DISK' };
  }
  if (req.requiresNvidiaSmi === true && host.nvidia?.available !== true) {
    return { ok: false, state: 'UNSUPPORTED_HOST', reason: 'NVIDIA_EVIDENCE_REQUIRED' };
  }
  if (typeof req.appleChipModel === 'string' && req.appleChipModel.length > 0) {
    if (host.apple?.available !== true || host.apple?.chipModel !== req.appleChipModel) {
      return {
        ok: false,
        state: 'UNSUPPORTED_HOST',
        reason: 'APPLE_CHIP_MODEL_MISMATCH',
        expectedAppleChipModel: req.appleChipModel,
        observedAppleChipModel: host.apple?.chipModel ?? null
      };
    }
  }
  return { ok: true, state: 'HOST_ELIGIBLE' };
}

export function validateModelBundleRegistry(registry, { artifactRegistry = null, operationalProfileRegistry = null } = {}) {
  const errors = [];
  try {
    requireObject(registry, 'model bundle registry');
    const rootKeys = Object.keys(registry).sort();
    const expectedRootKeys = ['activeModelBundleRef','bundles','registryRef','schemaVersion'].sort();
    if (JSON.stringify(rootKeys) !== JSON.stringify(expectedRootKeys)) throw new Error('model bundle registry fields are not exact');
    if (registry.schemaVersion !== VEX_MODEL_BUNDLE_REGISTRY_SCHEMA) throw new Error(`model bundle registry schema must be ${VEX_MODEL_BUNDLE_REGISTRY_SCHEMA}`);
    requireStableRef(registry.registryRef, 'model bundle registryRef');
    requireStableRef(registry.activeModelBundleRef, 'model bundle activeModelBundleRef');
    if (!Array.isArray(registry.bundles) || registry.bundles.length === 0) throw new Error('model bundle registry bundles must be non-empty');
    const refs = new Set();
    const bundleKeys = ['baseModelArtifactRef','compatibleOperationalProfileRefs','generationRef','modelBundleRef','modelProfileRef','projectorArtifactRef','requestModel','sourceRefs','state'].sort();
    for (const [index, bundle] of registry.bundles.entries()) {
      requireObject(bundle, `bundles[${index}]`);
      if (JSON.stringify(Object.keys(bundle).sort()) !== JSON.stringify(bundleKeys)) throw new Error(`bundles[${index}] fields are not exact`);
      for (const field of ['modelBundleRef','generationRef','modelProfileRef','baseModelArtifactRef','projectorArtifactRef']) requireStableRef(bundle[field], `bundles[${index}].${field}`);
      requireString(bundle.requestModel, `bundles[${index}].requestModel`);
      if (refs.has(bundle.modelBundleRef)) throw new Error(`duplicate modelBundleRef ${bundle.modelBundleRef}`);
      refs.add(bundle.modelBundleRef);
      if (![NORMAL_MODEL_BUNDLE_STATE, CANDIDATE_PROFILE_STATE, 'HELD', 'STALE', 'INVALID'].includes(bundle.state)) throw new Error(`bundles[${index}].state is unknown`);
      for (const field of ['compatibleOperationalProfileRefs','sourceRefs']) {
        if (!Array.isArray(bundle[field]) || bundle[field].length === 0 || bundle[field].some((value) => typeof value !== 'string' || !STABLE_REF.test(value)) || new Set(bundle[field]).size !== bundle[field].length) {
          throw new Error(`bundles[${index}].${field} must contain unique stable refs`);
        }
      }
      if (bundle.baseModelArtifactRef === bundle.projectorArtifactRef) throw new Error(`bundles[${index}] model/projector artifact refs must differ`);
    }
    const active = registry.bundles.find((bundle) => bundle.modelBundleRef === registry.activeModelBundleRef);
    if (!active) throw new Error('activeModelBundleRef is not registered');
    if (active.state !== NORMAL_MODEL_BUNDLE_STATE) throw new Error('activeModelBundleRef must select one RELEASE_QUALIFIED bundle');
    if (artifactRegistry) {
      const artifacts = validateArtifactRegistry(artifactRegistry);
      const artifactRefs = new Set(artifacts.artifacts.map((artifact) => artifact.artifactRef));
      for (const bundle of registry.bundles) {
        if (!artifactRefs.has(bundle.baseModelArtifactRef) || !artifactRefs.has(bundle.projectorArtifactRef)) throw new Error(`bundle ${bundle.modelBundleRef} references an unregistered model artifact`);
      }
    }
    if (operationalProfileRegistry) {
      const operational = validateOperationalProfileRegistry(operationalProfileRegistry);
      if (!operational.ok) throw new Error(`operational profile registry invalid: ${operational.errors.join('; ')}`);
      const profileRefs = new Set(operationalProfileRegistry.profiles.map((profile) => profile.profileRef));
      for (const bundle of registry.bundles) {
        for (const profileRef of bundle.compatibleOperationalProfileRefs) if (!profileRefs.has(profileRef)) throw new Error(`bundle ${bundle.modelBundleRef} references unknown operational profile ${profileRef}`);
      }
    }
  } catch (error) { errors.push(error.message); }
  return { ok: errors.length === 0, errors };
}

export function resolveActiveModelBundle({ registry, artifactRegistry, operationalProfile }) {
  const validation = validateModelBundleRegistry(registry, { artifactRegistry });
  if (!validation.ok) return { state: 'SOURCE_INVALID', errors: validation.errors, bundle: null, artifacts: [] };
  requireObject(operationalProfile, 'operationalProfile');
  const bundle = registry.bundles.find((item) => item.modelBundleRef === registry.activeModelBundleRef);
  if (!operationalProfile.compatibleModelBundleRefs?.includes(bundle.modelBundleRef) || !bundle.compatibleOperationalProfileRefs.includes(operationalProfile.profileRef)) {
    return { state: 'MODEL_BUNDLE_NOT_COMPATIBLE', bundle: null, artifacts: [], activeModelBundleRef: bundle.modelBundleRef };
  }
  if (operationalProfile.endpoint?.requestModel !== bundle.requestModel) {
    return { state: 'SOURCE_INVALID', errors: ['operational profile requestModel projection contradicts active model bundle'], bundle: null, artifacts: [] };
  }
  const artifacts = validateArtifactRegistry(artifactRegistry).artifacts;
  const byRef = new Map(artifacts.map((artifact) => [artifact.artifactRef, artifact]));
  const selectedArtifacts = [byRef.get(bundle.baseModelArtifactRef), byRef.get(bundle.projectorArtifactRef)];
  if (selectedArtifacts.some((artifact) => !artifact)) return { state: 'SOURCE_INVALID', errors: ['active model bundle artifact identity is missing'], bundle: null, artifacts: [] };
  const profileArtifacts = new Map((operationalProfile.modelArtifacts || []).map((artifact) => [artifact.artifactRef, artifact]));
  if (profileArtifacts.size !== 2 || !selectedArtifacts.every((artifact) => profileArtifacts.has(artifact.artifactRef))) {
    return { state: 'SOURCE_INVALID', errors: ['operational profile model qualification projection does not match active model bundle'], bundle: null, artifacts: [] };
  }
  const projectionFields = ['artifactRef','filename','sha256','expectedBytes','maxBytes','sourceRef','licenseRef'];
  for (const canonicalArtifact of selectedArtifacts) {
    const projection = profileArtifacts.get(canonicalArtifact.artifactRef);
    if (Object.hasOwn(projection, 'url') || projectionFields.some((field) => projection[field] !== canonicalArtifact[field])) {
      return { state: 'SOURCE_INVALID', errors: [`operational profile model projection contradicts canonical artifact ${canonicalArtifact.artifactRef}`], bundle: null, artifacts: [] };
    }
  }
  return { state: 'MODEL_BUNDLE_RESOLVED', bundle, artifacts: selectedArtifacts };
}

export function selectOperationalProfile({ registry, platform, architecture, mode = 'normal', profileRef = null }) {
  const validation = validateOperationalProfileRegistry(registry);
  if (!validation.ok) return { state: 'SOURCE_INVALID', errors: validation.errors, profile: null };
  const compatible = registry.profiles.filter((profile) => profile.platform === platform && profile.architecture === architecture);
  const selected = profileRef ? compatible.find((profile) => profile.profileRef === profileRef) : compatible[0];
  if (!selected) return { state: 'UNSUPPORTED_HOST', profile: null };
  if (mode === 'normal' && selected.state !== NORMAL_PROFILE_STATE) return { state: 'NO_RELEASE_QUALIFIED_PROFILE', profile: null, heldProfileRef: selected.profileRef, heldProfileState: selected.state };
  if (mode === 'candidate-qualification' && ![NORMAL_PROFILE_STATE, CANDIDATE_PROFILE_STATE].includes(selected.state)) return { state: 'PROFILE_NOT_ELIGIBLE_FOR_QUALIFICATION', profile: null };
  return { state: 'PROFILE_RESOLVED', profile: selected };
}

export function classifyHomeState({ homeManifestPresent, homeDirectoryPresent, homeDirectoryNonEmpty }) {
  if (homeManifestPresent) return 'EXISTING_HOME_PRESERVED';
  if (!homeDirectoryPresent || !homeDirectoryNonEmpty) return 'FRESH_HOME_ALLOWED';
  return 'HOME_REQUIRES_MIGRATION_PLAN';
}

export function buildRuntimeArguments(profile, { modelPath, projectorPath }) {
  const replacements = new Map([
    ['{MODEL_PATH}', modelPath], ['{PROJECTOR_PATH}', projectorPath], ['{ENDPOINT_PORT}', String(new URL(profile.endpoint.origin).port)], ['{REQUEST_MODEL}', profile.endpoint.requestModel]
  ]);
  return profile.runtime.argumentTemplate.map((arg) => replacements.get(arg) ?? arg);
}

export function qualificationContentMatches(profile, content) {
  if (typeof content !== 'string') return false;
  const trimmed = content.trim();
  if (trimmed.length === 0) return false;
  const expected = profile?.qualification?.expectedContent;
  if (expected === undefined || expected === null) return true;
  return trimmed === expected;
}

export function buildQualificationRequest(profile, modelBundle) {
  requireObject(profile, 'profile');
  requireObject(profile.endpoint, 'profile.endpoint');
  requireObject(profile.qualification, 'profile.qualification');
  requireObject(modelBundle, 'modelBundle');
  requireString(modelBundle.requestModel, 'modelBundle.requestModel');
  requireString(profile.qualification.probePrompt, 'profile.qualification.probePrompt');
  if (!Number.isSafeInteger(profile.qualification.probeMaxTokens) || profile.qualification.probeMaxTokens <= 0) {
    throw new Error('profile.qualification.probeMaxTokens must be positive');
  }
  return {
    model: modelBundle.requestModel,
    messages: [{ role: 'user', content: profile.qualification.probePrompt }],
    temperature: 0,
    max_tokens: profile.qualification.probeMaxTokens,
    chat_template_kwargs: { enable_thinking: false }
  };
}

export function buildVexInitializationPlan({ profile, modelBundle, home, homeState, hostEvidence, mode }) {
  requireObject(profile, 'profile');
  requireObject(modelBundle, 'modelBundle');
  requireString(modelBundle.modelBundleRef, 'modelBundle.modelBundleRef');
  requireString(modelBundle.generationRef, 'modelBundle.generationRef');
  requireString(modelBundle.modelProfileRef, 'modelBundle.modelProfileRef');
  requireString(modelBundle.requestModel, 'modelBundle.requestModel');
  requireString(home, 'home');
  requireObject(hostEvidence, 'hostEvidence');
  const modelArtifacts = profile.modelArtifacts.map((artifact) => ({ ...artifact, destinationClass: 'MODEL' }));
  const runtimeArtifacts = profile.runtime.artifacts.map((artifact) => ({ ...artifact, destinationClass: 'RUNTIME_ARCHIVE' }));
  const plan = {
    schemaVersion: VEX_INITIALIZATION_PLAN_SCHEMA,
    profileRef: profile.profileRef,
    profileState: profile.state,
    modelBundleRef: modelBundle.modelBundleRef,
    generationRef: modelBundle.generationRef,
    modelProfileRef: modelBundle.modelProfileRef,
    mode,
    home,
    homeState,
    hostEvidence,
    endpoint: { ...profile.endpoint, requestModel: modelBundle.requestModel },
    artifacts: [...runtimeArtifacts, ...modelArtifacts],
    runtime: {
      dependencyRef: profile.runtime.dependencyRef,
      extraction: profile.runtime.extraction,
      executableName: profile.runtime.executableName,
      executableSha256: profile.runtime.executableSha256,
      executableExpectedBytes: profile.runtime.executableExpectedBytes ?? null,
      devicePolicy: profile.runtime.devicePolicy ?? null,
      argumentTemplate: profile.runtime.argumentTemplate
    },
    effects: {
      networkFetch: true,
      homeWrite: true,
      processLaunch: true,
      loopbackOnly: true,
      repositoryWrite: false,
      publicEffect: false,
      memoryCanonicalWrite: false,
      training: false
    }
  };
  return { ...plan, planSha256: semanticHash(plan) };
}

export function browserBindingForProfile(profile, modelBundle) {
  requireObject(modelBundle, 'modelBundle');
  requireString(modelBundle.requestModel, 'modelBundle.requestModel');
  return {
    VEXLIFE_COMPANION_ENDPOINT: profile.endpoint.origin,
    VEXLIFE_COMPANION_MODEL: modelBundle.requestModel,
    VEXLIFE_OPERATIONAL_PROFILE_REF: profile.profileRef,
    VEXLIFE_MODEL_BUNDLE_REF: modelBundle.modelBundleRef
  };
}

// [VXG RealForever]
