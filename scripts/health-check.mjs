#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { validateBuildHealthRegistry, deriveRepositoryHealth } from '../src/core/build-health.mjs';
import { collectRepositoryEvidence } from '../src/core/repository-evidence.mjs';
import { validateIntegratedSchedulerSimulationReceipt } from '../src/core/scheduler-runtime-trust.mjs';
import { buildSourceManifest } from '../src/core/source-manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const receiptIndex = process.argv.indexOf('--receipt');
if (receiptIndex >= 0 && !process.argv[receiptIndex + 1]) {
  console.error('Usage: npm run health:check -- [--receipt generated/health/pr-ready.json]');
  process.exit(2);
}
const receiptPath = path.resolve(ROOT, receiptIndex >= 0 ? process.argv[receiptIndex + 1] : 'generated/health/pr-ready.json');
const bundle = loadBlueprint(ROOT);
const registry = validateBuildHealthRegistry(bundle.buildHealth, bundle.reviewLenses);
const blueprint = validateBlueprint(bundle);
const sourceManifest = buildSourceManifest(ROOT);
const repository = collectRepositoryEvidence(ROOT);
let receipt = null;
let receiptState = 'NOT_RUN';
const receiptErrors = [];
let schedulerSimulationState = 'NOT_RUN';
if (fs.existsSync(receiptPath)) {
  try {
    receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    const bindingCurrent = receipt.schemaVersion === 'vexlife.pr-ready-receipt/v1' &&
      receipt.state === 'PR_READY_PASSED' &&
      receipt.candidateHeadSha === repository.git.candidateHeadSha &&
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
        receiptState = schedulerSimulationState === 'EXECUTED_CURRENT' ? 'EXECUTED_CURRENT' : 'INVALID';
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
  schedulerSimulationState,
  receiptPath: path.relative(ROOT, receiptPath).split(path.sep).join('/'),
  registryChecks: registry.stats.checks,
  candidateHeadSha: repository.git.candidateHeadSha,
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
