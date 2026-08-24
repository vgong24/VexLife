import path from 'node:path';
import { semanticHash } from './utils.mjs';

export const VEX_OPERATIONAL_PROFILE_REGISTRY_SCHEMA = 'vexlife.operational-profiles/v1';
export const VEX_INITIALIZATION_PLAN_SCHEMA = 'vexlife.initialization-plan/v1';
export const NORMAL_PROFILE_STATE = 'RELEASE_QUALIFIED';
export const CANDIDATE_PROFILE_STATE = 'CANDIDATE_QUALIFICATION';

const SHA256 = /^[0-9a-f]{64}$/u;
const LOOPBACK_ORIGIN = /^http:\/\/127\.0\.0\.1:(\d{1,5})$/u;
const SAFE_FILE = /^[^\\\/:*?"<>|\u0000]+$/u;

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
}
function requireString(value, label) { if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string`); }
function requireSha(value, label) { if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${label} must be lowercase SHA-256`); }
function requireHttps(value, label) { const parsed = new URL(value); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error(`${label} must be credential-free HTTPS`); }

function normalizeProcessIdentityText(value) {
  return String(value ?? '').replaceAll('\\', '/').toLowerCase();
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
  const expectedExecutable = normalizeProcessIdentityText(expectedExecutablePath);
  if (!expectedExecutable) return false;
  const expectedName = expectedExecutable.split('/').filter(Boolean).at(-1) ?? '';
  const name = String(processEvidence.name ?? '').toLowerCase();
  if (name !== expectedName) return false;
  const actualExecutable = normalizeProcessIdentityText(processEvidence.executablePath);
  if (!actualExecutable || actualExecutable !== expectedExecutable) return false;
  const tokens = tokenizeProcessCommandLine(processEvidence.commandLine);
  if (!tokens || tokens.length !== expectedArguments.length + 1) return false;
  const actualTokens = tokens.map(normalizeProcessIdentityText);
  if (actualTokens[0] !== expectedExecutable) return false;
  for (let index = 0; index < expectedArguments.length; index += 1) {
    if (actualTokens[index + 1] !== normalizeProcessIdentityText(expectedArguments[index])) return false;
  }
  return true;
}

export function validateOperationalProfileRegistry(registry) {
  const errors = [];
  try {
    requireObject(registry, 'registry');
    if (registry.schemaVersion !== VEX_OPERATIONAL_PROFILE_REGISTRY_SCHEMA) throw new Error(`registry.schemaVersion must be ${VEX_OPERATIONAL_PROFILE_REGISTRY_SCHEMA}`);
    requireString(registry.registryRef, 'registry.registryRef');
    if (!Array.isArray(registry.profiles) || registry.profiles.length === 0) throw new Error('registry.profiles must be non-empty');
    const refs = new Set();
    for (const [index, profile] of registry.profiles.entries()) {
      const p = `profiles[${index}]`;
      requireObject(profile, p);
      requireString(profile.profileRef, `${p}.profileRef`);
      if (refs.has(profile.profileRef)) throw new Error(`duplicate profileRef ${profile.profileRef}`);
      refs.add(profile.profileRef);
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
      for (const artifact of [...profile.runtime.artifacts, ...profile.modelArtifacts]) {
        requireString(artifact.artifactRef, `${p}.artifactRef`);
        requireString(artifact.filename, `${p}.filename`);
        if (!SAFE_FILE.test(artifact.filename)) throw new Error(`${p}.filename must be safe`);
        requireHttps(artifact.url, `${p}.url`);
        requireSha(artifact.sha256, `${p}.sha256`);
        requireString(artifact.licenseRef, `${p}.licenseRef`);
        requireString(artifact.sourceRef, `${p}.sourceRef`);
        if (!Number.isSafeInteger(artifact.maxBytes) || artifact.maxBytes <= 0) throw new Error(`${p}.maxBytes must be positive`);
        if (artifact.expectedBytes !== null && (!Number.isSafeInteger(artifact.expectedBytes) || artifact.expectedBytes <= 0)) throw new Error(`${p}.expectedBytes must be null or positive`);
      }
      requireObject(profile.runtime.extraction, `${p}.runtime.extraction`);
      requireString(profile.runtime.extraction.class, `${p}.runtime.extraction.class`);
      requireString(profile.runtime.extraction.subdirectory, `${p}.runtime.extraction.subdirectory`);
      if (path.isAbsolute(profile.runtime.extraction.subdirectory) || profile.runtime.extraction.subdirectory.includes('..')) throw new Error(`${p}.runtime.extraction.subdirectory must be safe relative`);
      const requiredExtractionClass = profile.platform === 'win32' ? 'WINDOWS_ZIP_EXPAND_ARCHIVE' : 'POSIX_TAR_GZ';
      if (profile.runtime.extraction.class !== requiredExtractionClass) {
        throw new Error(`${p}.runtime.extraction.class must be ${requiredExtractionClass}`);
      }
      if (!Array.isArray(profile.runtime.argumentTemplate) || profile.runtime.argumentTemplate.length === 0) throw new Error(`${p}.runtime.argumentTemplate must be non-empty`);
      for (const arg of profile.runtime.argumentTemplate) requireString(arg, `${p}.runtime.argumentTemplate item`);
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

export function buildQualificationRequest(profile) {
  requireObject(profile, 'profile');
  requireObject(profile.endpoint, 'profile.endpoint');
  requireObject(profile.qualification, 'profile.qualification');
  requireString(profile.endpoint.requestModel, 'profile.endpoint.requestModel');
  requireString(profile.qualification.probePrompt, 'profile.qualification.probePrompt');
  if (!Number.isSafeInteger(profile.qualification.probeMaxTokens) || profile.qualification.probeMaxTokens <= 0) {
    throw new Error('profile.qualification.probeMaxTokens must be positive');
  }
  return {
    model: profile.endpoint.requestModel,
    messages: [{ role: 'user', content: profile.qualification.probePrompt }],
    temperature: 0,
    max_tokens: profile.qualification.probeMaxTokens,
    chat_template_kwargs: { enable_thinking: false }
  };
}

export function buildVexInitializationPlan({ profile, home, homeState, hostEvidence, mode }) {
  requireObject(profile, 'profile');
  requireString(home, 'home');
  requireObject(hostEvidence, 'hostEvidence');
  const modelArtifacts = profile.modelArtifacts.map((artifact) => ({ ...artifact, destinationClass: 'MODEL' }));
  const runtimeArtifacts = profile.runtime.artifacts.map((artifact) => ({ ...artifact, destinationClass: 'RUNTIME_ARCHIVE' }));
  const plan = {
    schemaVersion: VEX_INITIALIZATION_PLAN_SCHEMA,
    profileRef: profile.profileRef,
    profileState: profile.state,
    mode,
    home,
    homeState,
    hostEvidence,
    endpoint: profile.endpoint,
    artifacts: [...runtimeArtifacts, ...modelArtifacts],
    runtime: {
      dependencyRef: profile.runtime.dependencyRef,
      extraction: profile.runtime.extraction,
      executableName: profile.runtime.executableName,
      executableSha256: profile.runtime.executableSha256,
      executableExpectedBytes: profile.runtime.executableExpectedBytes ?? null,
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

export function browserBindingForProfile(profile) {
  return {
    VEXLIFE_COMPANION_ENDPOINT: profile.endpoint.origin,
    VEXLIFE_COMPANION_MODEL: profile.endpoint.requestModel,
    VEXLIFE_OPERATIONAL_PROFILE_REF: profile.profileRef
  };
}

// [VXG RealForever]
