import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadBrowserCompanionHomeIdentity } from './browser-companion-bridge.mjs';
import {
  loadActivatedModelRuntimeBindingRegistry,
  readActivatedBindingSourceIdentity,
  startOrResumeActivatedModelRuntime
} from './activated-model-runtime-binding.mjs';
import {
  HERETIC_RUNTIME_ADAPTER_REF,
  HERETIC_RUNTIME_IDENTITY,
  formHereticPersistentRuntimeBindingRef,
  formHereticPersistentRuntimeLink
} from './heretic-runtime-link.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
export const RELEASE_RUNTIME_RECOVERY_ADAPTER_REF = 'adapter.vexlife.release-runtime.current-binding.001';
export const RELEASE_RUNTIME_RECOVERY_OWNER_REF = 'owner.vexlife.release-runtime-recovery.001';
export const ACTIVATED_RUNTIME_RECOVERY_OWNER_REF = 'owner.vexlife.activated-runtime-recovery.001';
export const HERETIC_RUNTIME_RECOVERY_OWNER_REF = 'owner.vexlife.heretic-persistent-runtime-recovery.001';

function readJsonRegular(file, label) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${label} must be one regular non-link file`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parseLastJson(stdout) {
  const lines = String(stdout ?? '').split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch {}
  }
  throw new Error('recovery-current-binding initializer emitted no machine-readable result');
}

function defaultInitializer({ sourceRoot, home }) {
  const script = path.join(sourceRoot, 'scripts', 'initialize-vex.mjs');
  const result = spawnSync(process.execPath, [script, '--mode', 'recovery-current-binding', '--home', home], {
    cwd: sourceRoot,
    encoding: 'utf8',
    shell: false,
    timeout: 180000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env }
  });
  if (result.error) throw result.error;
  const parsed = parseLastJson(result.stdout);
  if (result.status !== 0 || parsed?.state !== 'RUNTIME_QUALIFIED') {
    throw new Error(`recovery-current-binding initializer failed safely: ${parsed?.state ?? result.status}`);
  }
  return parsed;
}

export function validateReleaseRuntimeRecoveryRequest({ request, homeIdentity, modelConfiguration, runtimeAdapterRef = RELEASE_RUNTIME_RECOVERY_ADAPTER_REF }) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new TypeError('recovery request must be one object');
  if (request.homeRef !== homeIdentity.homeRef) throw new Error('RECOVERY_HOME_IDENTITY_MISMATCH');
  if (request.companionLineageRef !== homeIdentity.companionLineageRef) throw new Error('RECOVERY_COMPANION_LINEAGE_MISMATCH');
  if (request.modelRefOrNull !== modelConfiguration.modelProfileRef) throw new Error('RECOVERY_MODEL_IDENTITY_MISMATCH');
  if (request.generationRefOrNull !== modelConfiguration.generationRef) throw new Error('RECOVERY_GENERATION_IDENTITY_MISMATCH');
  if (request.runtimeAdapterRef !== runtimeAdapterRef) throw new Error('RECOVERY_RUNTIME_ADAPTER_MISMATCH');
  if (modelConfiguration.state !== 'BOUND_QUALIFIED' || modelConfiguration.automaticDownload !== false || modelConfiguration.automaticActivation !== false) {
    throw new Error('RECOVERY_CURRENT_MODEL_CONFIGURATION_NOT_QUALIFIED');
  }
  return true;
}

export function createReleaseRuntimeCompanionRecoveryOwner({
  sourceRoot = ROOT,
  home,
  runtimeAdapterRef = RELEASE_RUNTIME_RECOVERY_ADAPTER_REF,
  proofClass = 'REAL_HOST',
  runInitializer = defaultInitializer
} = {}) {
  if (typeof home !== 'string' || home.length === 0) throw new TypeError('release runtime recovery owner requires one Home path');
  if (!['REAL_HOST', 'SYNTHETIC'].includes(proofClass)) throw new TypeError('release runtime recovery proofClass is invalid');
  if (typeof runInitializer !== 'function') throw new TypeError('release runtime recovery initializer must be one function');
  const completed = new Map();

  return Object.freeze({
    async recover(request) {
      const cached = completed.get(request?.idempotencyKey);
      if (cached) {
        if (cached.requestSha256 !== request.requestSha256) throw new Error('RECOVERY_IDEMPOTENCY_KEY_CONFLICT');
        return cached.receipt;
      }
      const homeIdentity = loadBrowserCompanionHomeIdentity(home);
      const configPath = path.join(homeIdentity.home, 'config', 'model.json');
      const modelConfiguration = readJsonRegular(configPath, 'qualified model configuration');
      validateReleaseRuntimeRecoveryRequest({ request, homeIdentity, modelConfiguration, runtimeAdapterRef });

      const result = await runInitializer({ sourceRoot: path.resolve(sourceRoot), home: homeIdentity.home, request });
      if (!result || result.state !== 'RUNTIME_QUALIFIED'
          || result.profileRef !== modelConfiguration.profileRef
          || result.activeModelBundleRef !== modelConfiguration.activeModelBundleRef
          || result.generationRef !== modelConfiguration.generationRef
          || result.endpoint !== modelConfiguration.endpoint
          || result.requestModel !== modelConfiguration.requestModel) {
        throw new Error('RECOVERY_INITIALIZER_RESULT_IDENTITY_MISMATCH');
      }

      const currentConfiguration = readJsonRegular(configPath, 'post-recovery qualified model configuration');
      validateReleaseRuntimeRecoveryRequest({ request, homeIdentity, modelConfiguration: currentConfiguration, runtimeAdapterRef });
      const digest = crypto.createHash('sha256')
        .update(`${request.requestRef}|${request.requestSha256}|${result.profileRef}|${result.generationRef}|${result.runtimePid}`)
        .digest('hex');
      const receipt = Object.freeze({
        schemaVersion: 'vexlife.companion-recovery-owner-receipt/v1',
        truthClass: 'FOREIGN_RIGHTFUL_RUNTIME_OWNER_RECEIPT',
        requestRef: request.requestRef,
        reentryPlanRef: request.reentryPlanRef,
        bindingRef: request.bindingRef,
        homeRef: request.homeRef,
        companionLineageRef: request.companionLineageRef,
        modelRefOrNull: request.modelRefOrNull,
        generationRefOrNull: request.generationRefOrNull,
        runtimeAdapterRef: request.runtimeAdapterRef,
        effectOwnerRef: RELEASE_RUNTIME_RECOVERY_OWNER_REF,
        effectReceiptRef: `receipt.vexlife.release-runtime-recovery.${digest.slice(0, 32)}`,
        sourceRefs: Object.freeze([
          'github.issue.vexlife.634',
          'source.vexlife.initialize-vex.recovery-current-binding.001'
        ]),
        disposition: 'PERFORMED_SAME_BINDING_REENTRY',
        postRecoveryObservationRequired: true,
        proofClass
      });
      completed.set(request.idempotencyKey, { requestSha256: request.requestSha256, receipt });
      return receipt;
    }
  });
}

export function validateActivatedRuntimeRecoveryRequest({ request, homeIdentity, binding }) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new TypeError('recovery request must be one object');
  if (!binding || typeof binding !== 'object' || binding.state !== 'ACTIVE_ACCEPTED') throw new Error('ACTIVATED_RECOVERY_BINDING_NOT_ACCEPTED');
  if (request.bindingRef !== binding.bindingRef) throw new Error('ACTIVATED_RECOVERY_BINDING_IDENTITY_MISMATCH');
  if (request.homeRef !== homeIdentity.homeRef) throw new Error('ACTIVATED_RECOVERY_HOME_IDENTITY_MISMATCH');
  if (request.companionLineageRef !== homeIdentity.companionLineageRef) throw new Error('ACTIVATED_RECOVERY_COMPANION_LINEAGE_MISMATCH');
  if (request.modelRefOrNull !== binding.modelRef) throw new Error('ACTIVATED_RECOVERY_MODEL_IDENTITY_MISMATCH');
  if (request.generationRefOrNull !== binding.generationRef) throw new Error('ACTIVATED_RECOVERY_GENERATION_IDENTITY_MISMATCH');
  if (request.runtimeAdapterRef !== binding.runtime?.runtimeAdapterRef) throw new Error('ACTIVATED_RECOVERY_RUNTIME_ADAPTER_MISMATCH');
  return true;
}

export function createActivatedRuntimeCompanionRecoveryOwner({
  sourceRoot = ROOT,
  home,
  proofClass = 'REAL_HOST',
  loadRegistry = loadActivatedModelRuntimeBindingRegistry,
  readSourceIdentity = readActivatedBindingSourceIdentity,
  startOrResumeRuntime = startOrResumeActivatedModelRuntime
} = {}) {
  if (typeof home !== 'string' || home.length === 0) throw new TypeError('activated runtime recovery owner requires one Home path');
  if (!['REAL_HOST', 'SYNTHETIC'].includes(proofClass)) throw new TypeError('activated runtime recovery proofClass is invalid');
  if (typeof loadRegistry !== 'function' || typeof readSourceIdentity !== 'function' || typeof startOrResumeRuntime !== 'function') {
    throw new TypeError('activated runtime recovery dependencies must be functions');
  }
  const canonicalSourceRoot = path.resolve(sourceRoot);
  const registryPath = path.join(canonicalSourceRoot, 'blueprint', 'activated-model-runtime-bindings.json');
  const modulePath = path.join(canonicalSourceRoot, 'src', 'core', 'activated-model-runtime-binding.mjs');
  const { binding } = loadRegistry(registryPath);
  if (!binding || binding.state !== 'ACTIVE_ACCEPTED' || typeof binding.runtime?.runtimeAdapterRef !== 'string') {
    throw new Error('ACTIVATED_RECOVERY_BINDING_NOT_ACCEPTED');
  }
  const completed = new Map();

  return Object.freeze({
    runtimeAdapterRef: binding.runtime.runtimeAdapterRef,
    async recover(request) {
      const cached = completed.get(request?.idempotencyKey);
      if (cached) {
        if (cached.requestSha256 !== request.requestSha256) throw new Error('RECOVERY_IDEMPOTENCY_KEY_CONFLICT');
        return cached.receipt;
      }
      const homeIdentity = loadBrowserCompanionHomeIdentity(home);
      validateActivatedRuntimeRecoveryRequest({ request, homeIdentity, binding });
      const sourceIdentity = await readSourceIdentity({
        sourceRoot: canonicalSourceRoot,
        registryPath,
        modulePath
      });
      const result = await startOrResumeRuntime({
        home: homeIdentity.home,
        binding,
        sourceIdentity,
        handoffBytes: null,
        handoffSha256: null,
        environment: {}
      });
      if (!result
          || result.bindingRef !== binding.bindingRef
          || result.homeRef !== homeIdentity.homeRef
          || result.companionLineageRef !== homeIdentity.companionLineageRef
          || result.modelRef !== binding.modelRef
          || result.generationRef !== binding.generationRef
          || result.modelProfileRef !== binding.modelProfileRef
          || typeof result.receiptRef !== 'string'
          || result.receiptRef.length === 0) {
        throw new Error('ACTIVATED_RECOVERY_RESULT_IDENTITY_MISMATCH');
      }
      const digest = crypto.createHash('sha256')
        .update(`${request.requestRef}|${request.requestSha256}|${result.receiptRef}|${result.runtimeAttemptRef ?? ''}`)
        .digest('hex');
      const receipt = Object.freeze({
        schemaVersion: 'vexlife.companion-recovery-owner-receipt/v1',
        truthClass: 'FOREIGN_RIGHTFUL_RUNTIME_OWNER_RECEIPT',
        requestRef: request.requestRef,
        reentryPlanRef: request.reentryPlanRef,
        bindingRef: request.bindingRef,
        homeRef: request.homeRef,
        companionLineageRef: request.companionLineageRef,
        modelRefOrNull: request.modelRefOrNull,
        generationRefOrNull: request.generationRefOrNull,
        runtimeAdapterRef: request.runtimeAdapterRef,
        effectOwnerRef: ACTIVATED_RUNTIME_RECOVERY_OWNER_REF,
        effectReceiptRef: `receipt.vexlife.activated-runtime-recovery.${digest.slice(0, 32)}`,
        sourceRefs: Object.freeze([
          'github.issue.vexlife.595',
          'github.issue.vexlife.634'
        ]),
        disposition: 'PERFORMED_SAME_BINDING_REENTRY',
        postRecoveryObservationRequired: true,
        proofClass
      });
      completed.set(request.idempotencyKey, { requestSha256: request.requestSha256, receipt });
      return receipt;
    }
  });
}

export function validateHereticRuntimeRecoveryRequest({ request, homeIdentity }) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new TypeError('recovery request must be one object');
  if (request.bindingRef !== formHereticPersistentRuntimeBindingRef(homeIdentity)) throw new Error('HERETIC_RECOVERY_BINDING_IDENTITY_MISMATCH');
  if (request.homeRef !== homeIdentity.homeRef) throw new Error('HERETIC_RECOVERY_HOME_IDENTITY_MISMATCH');
  if (request.companionLineageRef !== homeIdentity.companionLineageRef) throw new Error('HERETIC_RECOVERY_COMPANION_LINEAGE_MISMATCH');
  if (request.modelRefOrNull !== HERETIC_RUNTIME_IDENTITY.modelRef) throw new Error('HERETIC_RECOVERY_MODEL_IDENTITY_MISMATCH');
  if (request.generationRefOrNull !== null) throw new Error('HERETIC_RECOVERY_GENERATION_IDENTITY_MISMATCH');
  if (request.runtimeAdapterRef !== HERETIC_RUNTIME_ADAPTER_REF) throw new Error('HERETIC_RECOVERY_RUNTIME_ADAPTER_MISMATCH');
  return true;
}

export function createHereticRuntimeCompanionRecoveryOwner({
  home,
  proofClass = 'REAL_HOST',
  recoverPersistentRuntime
} = {}) {
  if (typeof home !== 'string' || home.length === 0) throw new TypeError('Heretic runtime recovery owner requires one Home path');
  if (!['REAL_HOST', 'SYNTHETIC'].includes(proofClass)) throw new TypeError('Heretic runtime recovery proofClass is invalid');
  if (typeof recoverPersistentRuntime !== 'function') throw new TypeError('Heretic recovery requires one injected #636 persistent-runtime effect');
  const completed = new Map();
  const acceptedDispositions = new Set([
    'STARTED_NEW_EXACT_MLX_RUNTIME',
    'REUSED_EXACT_OWNED_MLX_RUNTIME',
    'RECOVERED_EXACT_STARTING_MLX_RUNTIME'
  ]);

  return Object.freeze({
    runtimeAdapterRef: HERETIC_RUNTIME_ADAPTER_REF,
    async recover(request) {
      const cached = completed.get(request?.idempotencyKey);
      if (cached) {
        if (cached.requestSha256 !== request.requestSha256) throw new Error('RECOVERY_IDEMPOTENCY_KEY_CONFLICT');
        return cached.receipt;
      }
      const homeIdentity = loadBrowserCompanionHomeIdentity(home);
      validateHereticRuntimeRecoveryRequest({ request, homeIdentity });

      const result = await recoverPersistentRuntime({ request, homeIdentity });
      if (!result || !acceptedDispositions.has(result.disposition) || !result.receipt) {
        throw new Error('HERETIC_RECOVERY_RUNTIME_EFFECT_RESULT_INVALID');
      }
      const link = formHereticPersistentRuntimeLink({ receipt: result.receipt, homeIdentity });
      if (link.companionBinding.bindingRef !== request.bindingRef
          || link.companionBinding.homeRef !== request.homeRef
          || link.companionBinding.companionLineageRef !== request.companionLineageRef
          || link.companionBinding.modelRefOrNull !== request.modelRefOrNull
          || link.companionBinding.generationRefOrNull !== request.generationRefOrNull
          || link.runtimeAdapterRef !== request.runtimeAdapterRef
          || link.runtimePid !== result.pid
          || link.endpoint !== result.endpoint
          || link.requestModel !== result.requestModel
          || link.runtimeObservation.runtimeState !== 'HEALTHY'
          || link.runtimeObservation.qualificationState !== 'CURRENT') {
        throw new Error('HERETIC_RECOVERY_RUNTIME_EFFECT_IDENTITY_MISMATCH');
      }

      const digest = crypto.createHash('sha256')
        .update(`${request.requestRef}|${request.requestSha256}|${link.runtimeReceiptRef}|${link.runtimePid}`)
        .digest('hex');
      const recoverySourceRef = link.sourceIdentity.repository === 'vgong24/VexLife'
        ? `source.vexlife.heretic-runtime-owner.${link.sourceIdentity.moduleSha256}`
        : `git.vextreme-sdk.${link.sourceIdentity.revision}`;
      const receipt = Object.freeze({
        schemaVersion: 'vexlife.companion-recovery-owner-receipt/v1',
        truthClass: 'FOREIGN_RIGHTFUL_RUNTIME_OWNER_RECEIPT',
        requestRef: request.requestRef,
        reentryPlanRef: request.reentryPlanRef,
        bindingRef: request.bindingRef,
        homeRef: request.homeRef,
        companionLineageRef: request.companionLineageRef,
        modelRefOrNull: request.modelRefOrNull,
        generationRefOrNull: request.generationRefOrNull,
        runtimeAdapterRef: request.runtimeAdapterRef,
        effectOwnerRef: HERETIC_RUNTIME_RECOVERY_OWNER_REF,
        effectReceiptRef: `receipt.vexlife.heretic-persistent-runtime-recovery.${digest.slice(0, 32)}`,
        sourceRefs: Object.freeze([
          'github.issue.vexlife.634',
          'github.issue.vextreme-sdk.636',
          link.runtimeReceiptRef,
          recoverySourceRef
        ]),
        disposition: 'PERFORMED_SAME_BINDING_REENTRY',
        postRecoveryObservationRequired: true,
        proofClass
      });
      completed.set(request.idempotencyKey, { requestSha256: request.requestSha256, receipt });
      return receipt;
    }
  });
}

export function createCompanionRecoveryOwner({
  sourceRoot = ROOT,
  home,
  proofClass = 'REAL_HOST',
  releaseOwnerFactory = createReleaseRuntimeCompanionRecoveryOwner,
  activatedOwnerFactory = createActivatedRuntimeCompanionRecoveryOwner,
  hereticOwnerFactory = createHereticRuntimeCompanionRecoveryOwner,
  recoverPersistentHereticRuntime = null
} = {}) {
  if (typeof releaseOwnerFactory !== 'function'
      || typeof activatedOwnerFactory !== 'function'
      || typeof hereticOwnerFactory !== 'function') {
    throw new TypeError('companion recovery owner factories must be functions');
  }
  if (recoverPersistentHereticRuntime !== null && typeof recoverPersistentHereticRuntime !== 'function') {
    throw new TypeError('Heretic persistent-runtime recovery effect must be null or one function');
  }
  const releaseOwner = releaseOwnerFactory({ sourceRoot, home, proofClass });
  const activatedOwner = activatedOwnerFactory({ sourceRoot, home, proofClass });
  const hereticOwner = recoverPersistentHereticRuntime === null
    ? null
    : hereticOwnerFactory({
        sourceRoot,
        home,
        proofClass,
        recoverPersistentRuntime: recoverPersistentHereticRuntime
      });
  if (!releaseOwner || typeof releaseOwner.recover !== 'function') throw new TypeError('release recovery owner is invalid');
  if (!activatedOwner || typeof activatedOwner.recover !== 'function' || typeof activatedOwner.runtimeAdapterRef !== 'string') {
    throw new TypeError('activated recovery owner is invalid');
  }
  if (hereticOwner !== null
      && (typeof hereticOwner.recover !== 'function' || hereticOwner.runtimeAdapterRef !== HERETIC_RUNTIME_ADAPTER_REF)) {
    throw new TypeError('Heretic recovery owner is invalid');
  }
  return Object.freeze({
    async recover(request) {
      if (request?.runtimeAdapterRef === RELEASE_RUNTIME_RECOVERY_ADAPTER_REF) return releaseOwner.recover(request);
      if (request?.runtimeAdapterRef === activatedOwner.runtimeAdapterRef) return activatedOwner.recover(request);
      if (request?.runtimeAdapterRef === HERETIC_RUNTIME_ADAPTER_REF && hereticOwner !== null) return hereticOwner.recover(request);
      throw new Error('RECOVERY_RUNTIME_ADAPTER_UNOWNED');
    }
  });
}

// [VXG RealForever]
