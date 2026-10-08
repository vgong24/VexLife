import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadBrowserCompanionHomeIdentity } from './browser-companion-bridge.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
export const RELEASE_RUNTIME_RECOVERY_ADAPTER_REF = 'adapter.vexlife.release-runtime.current-binding.001';
export const RELEASE_RUNTIME_RECOVERY_OWNER_REF = 'owner.vexlife.release-runtime-recovery.001';

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

// [VXG RealForever]
