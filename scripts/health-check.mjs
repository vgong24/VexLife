#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { validateBuildHealthRegistry, deriveRepositoryHealth, validateValidationEvidenceBundle } from '../src/core/build-health.mjs';
import { collectRepositoryEvidence } from '../src/core/repository-evidence.mjs';
import { validateIntegratedSchedulerSimulationReceipt } from '../src/core/scheduler-runtime-trust.mjs';
import { buildSourceManifest } from '../src/core/source-manifest.mjs';
import { resolveSafeGeneratedReceiptPath } from '../src/core/utils.mjs';
import { validateContinuityEvolutionSimulationReceipt } from './evolution-simulate.mjs';
import { validateIntegratedRecoverySimulationReceipt } from './recovery-simulate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const receiptIndex = process.argv.indexOf('--receipt');
if (receiptIndex >= 0 && !process.argv[receiptIndex + 1]) {
  console.error('Usage: npm run health:check -- [--receipt generated/health/pr-ready.json]');
  process.exit(2);
}
const receiptPath = resolveSafeGeneratedReceiptPath(
  ROOT,
  receiptIndex >= 0 ? process.argv[receiptIndex + 1] : 'generated/health/pr-ready.json',
  'Health receipt path'
);
const bundle = loadBlueprint(ROOT);
const registry = validateBuildHealthRegistry(bundle.buildHealth, bundle.reviewLenses);
const blueprint = validateBlueprint(bundle);
const sourceManifest = buildSourceManifest(ROOT);
const repository = collectRepositoryEvidence(ROOT);
let receipt = null;
let receiptState = 'NOT_RUN';
const receiptErrors = [];
let validationEvidenceState = 'NOT_SUPPLIED';
let validationEvidenceRef = null;
let schedulerSimulationState = 'NOT_RUN';
let continuitySimulationState = 'NOT_RUN';
let recoverySimulationState = 'NOT_RUN';
if (fs.existsSync(receiptPath)) {
  try {
    receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    const evidenceSupplied = receipt.validationEvidence?.state === 'VALIDATED_CURRENT' ||
      receipt.validationEvidence?.state === 'INVALID' || Boolean(receipt.validationEvidence?.inputPath);
    const candidateTreeCurrent = evidenceSupplied
      ? receipt.candidateTreeSha === repository.git.candidateTreeSha
      : receipt.candidateTreeSha == null || receipt.candidateTreeSha === repository.git.candidateTreeSha;
    const bindingCurrent = receipt.schemaVersion === 'vexlife.pr-ready-receipt/v1' &&
      receipt.state === 'PR_READY_PASSED' &&
      receipt.candidateHeadSha === repository.git.candidateHeadSha &&
      candidateTreeCurrent &&
      receipt.testedCheckoutSha === repository.git.checkoutSha &&
      receipt.testedMergeSha === repository.git.testedMergeSha &&
      receipt.baseSha === repository.git.baseSha &&
      receipt.sourceTreeSha256 === sourceManifest.treeSha256 &&
      receipt.blueprintHash === blueprint.semanticHash &&
      receipt.checkResultContractRef === bundle.buildHealth.checkResultContract.contractRef &&
      receipt.sourceStability?.state === 'PASS';
    if (!bindingCurrent) {
      receiptState = 'STALE';
    } else if (!Array.isArray(receipt.checkResults)) {
      receiptState = 'INVALID';
      receiptErrors.push('current receipt missing checkResults');
    } else {
      const expectedRefs = bundle.buildHealth.checks.map((item) => item.checkRef).sort();
      const actualRefs = receipt.checkResults.map((item) => item.checkRef).sort();
      if (new Set(actualRefs).size !== actualRefs.length || JSON.stringify(actualRefs) !== JSON.stringify(expectedRefs)) {
        receiptState = 'INVALID';
        receiptErrors.push('current receipt check coverage does not exactly match the build-health registry');
      } else {
        const validationEvidenceReceipt = receipt.validationEvidence;
        if (validationEvidenceReceipt === undefined) {
          validationEvidenceState = 'NOT_SUPPLIED';
        } else if (validationEvidenceReceipt?.state === 'NOT_SUPPLIED') {
          const cleanNotSupplied = validationEvidenceReceipt.inputPath == null &&
            validationEvidenceReceipt.inputSha256 == null &&
            validationEvidenceReceipt.semanticFingerprint == null &&
            validationEvidenceReceipt.validationEvidenceRef == null &&
            validationEvidenceReceipt.validationProfileRef == null &&
            validationEvidenceReceipt.bundle == null &&
            Array.isArray(validationEvidenceReceipt.errors) && validationEvidenceReceipt.errors.length === 0;
          if (!cleanNotSupplied) {
            validationEvidenceState = 'INVALID';
            receiptErrors.push('PR-ready validation evidence NOT_SUPPLIED state contains supplied evidence material');
          } else {
            validationEvidenceState = 'NOT_SUPPLIED';
          }
        } else if (validationEvidenceReceipt?.state === 'VALIDATED_CURRENT') {
          const validationEvidenceErrors = [];
          validationEvidenceRef = validationEvidenceReceipt.validationEvidenceRef ?? null;
          const validationEvidenceInput = validationEvidenceReceipt.bundle;
          if (!validationEvidenceInput || typeof validationEvidenceInput !== 'object' || Array.isArray(validationEvidenceInput)) {
            validationEvidenceErrors.push('PR-ready validated evidence receipt missing embedded validation evidence bundle');
          } else {
            if (validationEvidenceReceipt.semanticFingerprint !== validationEvidenceInput.semanticFingerprint ||
                validationEvidenceReceipt.validationEvidenceRef !== validationEvidenceInput.validationEvidenceRef ||
                validationEvidenceReceipt.validationProfileRef !== validationEvidenceInput.validationProfileRef) {
              validationEvidenceErrors.push('PR-ready validation evidence metadata does not match the embedded bundle');
            }
            const validation = validateValidationEvidenceBundle(
              validationEvidenceInput,
              bundle.buildHealth.validationEvidencePolicy,
              {
                repositoryRef: repository.repository.slug,
                baseSha: repository.git.baseSha,
                candidateHeadSha: repository.git.candidateHeadSha,
                candidateTreeSha: repository.git.candidateTreeSha,
                sourceTreeSha256: sourceManifest.treeSha256,
                observedHeadSha: repository.git.candidateHeadSha
              }
            );
            validationEvidenceErrors.push(...validation.errors);
          }
          if (!Array.isArray(validationEvidenceReceipt.errors) || validationEvidenceReceipt.errors.length !== 0) {
            validationEvidenceErrors.push('PR-ready validated evidence receipt carries validation errors');
          }
          if (validationEvidenceErrors.length) {
            validationEvidenceState = 'INVALID';
            receiptErrors.push(...validationEvidenceErrors);
          } else {
            validationEvidenceState = 'VALIDATED_CURRENT';
          }
        } else {
          validationEvidenceState = 'INVALID';
          receiptErrors.push('PR-ready receipt has invalid validation evidence state');
        }

        const simulationPath = path.resolve(ROOT, bundle.schedulerRegistry.simulationContract.receiptPath);
        let simulationReceipt = null;
        try {
          simulationReceipt = JSON.parse(fs.readFileSync(simulationPath, 'utf8'));
        } catch (error) {
          receiptErrors.push(`integrated scheduler simulation receipt unavailable: ${error.message}`);
        }
        const simulationValidation = validateIntegratedSchedulerSimulationReceipt(simulationReceipt, {
          schedulerRegistry: bundle.schedulerRegistry,
          blueprintHash: blueprint.semanticHash,
          sourceTreeSha256: sourceManifest.treeSha256,
          repositoryGit: repository.git
        });
        receiptErrors.push(...simulationValidation.errors);
        const embedded = receipt.schedulerSimulation;
        if (embedded?.state !== 'EXECUTED_CURRENT' ||
            embedded?.receiptPath !== bundle.schedulerRegistry.simulationContract.receiptPath ||
            embedded?.semanticFingerprint !== simulationReceipt?.semanticFingerprint ||
            embedded?.sourceTreeSha256 !== sourceManifest.treeSha256 ||
            embedded?.blueprintHash !== blueprint.semanticHash ||
            embedded?.schedulerRegistryHash !== simulationReceipt?.schedulerRegistryHash ||
            JSON.stringify(embedded?.journeyStates ?? []) !== JSON.stringify(simulationReceipt?.journeyStates ?? []) ||
            embedded?.orphanedPendingToolCalls !== 0 ||
            embedded?.externalEffectsExecuted !== false ||
            embedded?.selfCertifiedRuntimeEvidence !== false ||
            (embedded?.errors ?? []).length !== 0) {
          receiptErrors.push('PR-ready receipt does not exactly bind the current integrated scheduler simulation receipt');
        }
        schedulerSimulationState = simulationValidation.ok && receiptErrors.length === 0
          ? 'EXECUTED_CURRENT'
          : 'INVALID';
        const continuityPath = path.resolve(ROOT, bundle.evolution.simulationContract.receiptPath);
        let continuityReceipt = null;
        try {
          continuityReceipt = JSON.parse(fs.readFileSync(continuityPath, 'utf8'));
        } catch (error) {
          receiptErrors.push(`continuity evolution simulation receipt unavailable: ${error.message}`);
        }
        const continuityValidation = validateContinuityEvolutionSimulationReceipt(continuityReceipt, {
          evolutionRegistry: bundle.evolution,
          blueprintHash: blueprint.semanticHash,
          sourceTreeSha256: sourceManifest.treeSha256,
          repositoryGit: repository.git
        });
        receiptErrors.push(...continuityValidation.errors);
        const embeddedContinuity = receipt.continuitySimulation;
        if (embeddedContinuity?.state !== 'EXECUTED_CURRENT' ||
            embeddedContinuity?.receiptPath !== bundle.evolution.simulationContract.receiptPath ||
            embeddedContinuity?.semanticFingerprint !== continuityReceipt?.semanticFingerprint ||
            embeddedContinuity?.candidateHeadSha !== repository.git.candidateHeadSha ||
            embeddedContinuity?.testedCheckoutSha !== repository.git.checkoutSha ||
            embeddedContinuity?.testedMergeSha !== repository.git.testedMergeSha ||
            embeddedContinuity?.baseSha !== repository.git.baseSha ||
            embeddedContinuity?.sourceTreeSha256 !== sourceManifest.treeSha256 ||
            embeddedContinuity?.blueprintHash !== blueprint.semanticHash ||
            embeddedContinuity?.evolutionRegistryHash !== continuityReceipt?.evolutionRegistryHash ||
            JSON.stringify(embeddedContinuity?.journeyStates ?? []) !== JSON.stringify(continuityReceipt?.journeyStates ?? []) ||
            JSON.stringify(embeddedContinuity?.continuityGateBindings ?? {}) !== JSON.stringify(continuityReceipt?.continuityGateBindings ?? {}) ||
            embeddedContinuity?.canonicalWorkNodeRef !== bundle.evolution.simulationContract.workNodeRef ||
            embeddedContinuity?.canonicalWorkNodeFinalState !== 'COMPLETED' ||
            embeddedContinuity?.schedulerContextLeaseFingerprint !== continuityReceipt?.schedulerContextLeaseFingerprint ||
            embeddedContinuity?.schedulerCompletionVerificationFingerprint !== continuityReceipt?.schedulerCompletionVerificationFingerprint ||
            embeddedContinuity?.schedulerCompletionEvidenceLineageFingerprint !== continuityReceipt?.schedulerCompletionEvidenceLineageFingerprint ||
            embeddedContinuity?.schedulerWorkgraphTransitionFingerprint !== continuityReceipt?.schedulerWorkgraphTransitionFingerprint ||
            embeddedContinuity?.schedulerCompletionFingerprint !== continuityReceipt?.schedulerCompletionFingerprint ||
            embeddedContinuity?.externalEffectsExecuted !== false || embeddedContinuity?.modelWeightsChanged !== false ||
            (embeddedContinuity?.errors ?? []).length !== 0) {
          receiptErrors.push('PR-ready receipt does not exactly bind the current continuity evolution simulation receipt');
        }
        continuitySimulationState = continuityValidation.ok && receiptErrors.length === 0 ? 'EXECUTED_CURRENT' : 'INVALID';
        const recoveryPath = path.resolve(ROOT, bundle.blueprint.runtimeRecovery.simulationContract.receiptPath);
        let recoveryReceipt = null;
        try {
          recoveryReceipt = JSON.parse(fs.readFileSync(recoveryPath, 'utf8'));
        } catch (error) {
          receiptErrors.push(`runtime recovery simulation receipt unavailable: ${error.message}`);
        }
        const recoveryValidation = validateIntegratedRecoverySimulationReceipt(recoveryReceipt, {
          runtimeRecoveryRegistry: bundle.blueprint.runtimeRecovery,
          blueprintHash: blueprint.semanticHash,
          sourceTreeSha256: sourceManifest.treeSha256,
          repositoryGit: repository.git
        });
        receiptErrors.push(...recoveryValidation.errors);
        const embeddedRecovery = receipt.recoverySimulation;
        if (embeddedRecovery?.state !== 'EXECUTED_CURRENT' ||
            embeddedRecovery?.receiptPath !== bundle.blueprint.runtimeRecovery.simulationContract.receiptPath ||
            embeddedRecovery?.semanticFingerprint !== recoveryReceipt?.semanticFingerprint ||
            embeddedRecovery?.candidateHeadSha !== repository.git.candidateHeadSha ||
            embeddedRecovery?.testedCheckoutSha !== repository.git.checkoutSha ||
            embeddedRecovery?.testedMergeSha !== repository.git.testedMergeSha ||
            embeddedRecovery?.baseSha !== repository.git.baseSha ||
            embeddedRecovery?.sourceTreeSha256 !== sourceManifest.treeSha256 ||
            embeddedRecovery?.blueprintHash !== blueprint.semanticHash ||
            embeddedRecovery?.runtimeRecoveryRegistryHash !== recoveryReceipt?.runtimeRecoveryRegistryHash ||
            JSON.stringify(embeddedRecovery?.journeyStates ?? {}) !== JSON.stringify(recoveryReceipt?.journeyStates ?? {}) ||
            embeddedRecovery?.canonicalFailureFingerprint !== recoveryReceipt?.canonicalFailure?.semanticFingerprint ||
            embeddedRecovery?.firstExecutorOutcome !== 'FAILED_RECOVERABLE' ||
            embeddedRecovery?.finalExecutorOutcome !== 'SUCCEEDED' ||
            JSON.stringify(embeddedRecovery?.schedulerBindings ?? {}) !== JSON.stringify(recoveryReceipt?.schedulerBindings ?? {}) ||
            embeddedRecovery?.terminalReceiptFingerprint !== recoveryReceipt?.terminalReceipt?.semanticFingerprint ||
            embeddedRecovery?.canonicalWorkNodeRef !== bundle.blueprint.runtimeRecovery.simulationContract.workNodeRef ||
            embeddedRecovery?.canonicalWorkNodeFinalState !== 'COMPLETED' ||
            embeddedRecovery?.finalAggregateFingerprint !== recoveryReceipt?.finalAggregateFingerprint ||
            embeddedRecovery?.externalEffectsExecuted !== false || embeddedRecovery?.realModelInvoked !== false ||
            embeddedRecovery?.modelWeightsChanged !== false || (embeddedRecovery?.errors ?? []).length !== 0) {
          receiptErrors.push('PR-ready receipt does not exactly bind the current runtime recovery simulation receipt');
        }
        recoverySimulationState = recoveryValidation.ok && receiptErrors.length === 0 ? 'EXECUTED_CURRENT' : 'INVALID';
        receiptState = validationEvidenceState !== 'INVALID' &&
          schedulerSimulationState === 'EXECUTED_CURRENT' &&
          continuitySimulationState === 'EXECUTED_CURRENT' && recoverySimulationState === 'EXECUTED_CURRENT'
          ? 'EXECUTED_CURRENT'
          : 'INVALID';
      }
    }
  } catch {
    receiptState = 'INVALID';
    receiptErrors.push('receipt is not valid JSON');
  }
}
const checkResults = receiptState === 'EXECUTED_CURRENT'
  ? receipt.checkResults
  : bundle.buildHealth.checks.map((item) => ({
      checkRef: item.checkRef,
      semanticState: item.checkRef === 'check.blueprint' ? (blueprint.ok ? 'PASSED' : 'FAILED') : receiptState === 'STALE' ? 'UNKNOWN' : 'NOT_RUN',
      transportState: item.checkRef === 'check.blueprint' ? 'EXECUTED' : null,
      executed: item.checkRef === 'check.blueprint',
      currentness: item.checkRef === 'check.blueprint' ? 'CURRENT' : receiptState === 'STALE' ? 'STALE' : 'UNKNOWN',
      detailRef: item.command
    }));
const { projection } = deriveRepositoryHealth({ sourceTreeRef: sourceManifest.treeSha256, blueprintHash: blueprint.semanticHash, checkResults });
const errors = [...registry.errors, ...(blueprint.ok ? [] : blueprint.errors), ...receiptErrors];
console.log(JSON.stringify({
  state: errors.length ? 'REPOSITORY_HEALTH_INVALID' : projection.state,
  receiptState,
  validationEvidenceState,
  validationEvidenceRef,
  schedulerSimulationState,
  continuitySimulationState,
  recoverySimulationState,
  receiptPath: path.relative(ROOT, receiptPath).split(path.sep).join('/'),
  registryChecks: registry.stats.checks,
  candidateHeadSha: repository.git.candidateHeadSha,
  candidateTreeSha: repository.git.candidateTreeSha,
  testedCheckoutSha: repository.git.checkoutSha,
  testedMergeSha: repository.git.testedMergeSha,
  baseSha: repository.git.baseSha,
  blueprintHash: blueprint.semanticHash,
  sourceTreeSha256: sourceManifest.treeSha256,
  receiptSummary: projection.receiptSummary,
  blockingCheckRefs: projection.blockingCheckRefs,
  unresolvedCheckRefs: projection.unresolvedCheckRefs,
  errors
}, null, 2));
if (errors.length || projection.state !== 'HEALTHY') process.exitCode = 1;

// [VXG RealForever]
