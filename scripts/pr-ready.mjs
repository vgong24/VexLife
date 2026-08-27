#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { admitCheckResult } from '../src/core/check-result.mjs';
import { deriveRepositoryHealth, validateBuildHealthRegistry, validateValidationEvidenceBundle } from '../src/core/build-health.mjs';
import { collectRepositoryEvidence } from '../src/core/repository-evidence.mjs';
import { validateIntegratedSchedulerSimulationReceipt } from '../src/core/scheduler-runtime-trust.mjs';
import { buildSourceManifest } from '../src/core/source-manifest.mjs';
import { validateContinuityEvolutionSimulationReceipt } from './evolution-simulate.mjs';
import { validateIntegratedRecoverySimulationReceipt } from './recovery-simulate.mjs';
import { resolveSafeGeneratedReceiptPath, writeJson } from '../src/core/utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const usage = 'Usage: npm run pr-ready -- [--receipt generated/health/pr-ready.json] [--validation-evidence generated/health/<bundle>.json]';
const knownArguments = new Set(['--receipt', '--validation-evidence']);
const parsedArguments = new Map();
if (args.length % 2 !== 0) {
  console.error(usage);
  process.exit(2);
}
for (let index = 0; index < args.length; index += 2) {
  const name = args[index];
  const value = args[index + 1];
  if (!knownArguments.has(name) || !value || value.startsWith('--') || parsedArguments.has(name)) {
    console.error(usage);
    process.exit(2);
  }
  parsedArguments.set(name, value);
}
const receiptPath = resolveSafeGeneratedReceiptPath(
  ROOT,
  parsedArguments.get('--receipt') ?? 'generated/health/pr-ready.json',
  'PR-ready receipt path'
);
const validationEvidencePath = parsedArguments.has('--validation-evidence')
  ? resolveSafeGeneratedReceiptPath(ROOT, parsedArguments.get('--validation-evidence'), 'Validation evidence path')
  : null;
let validationEvidenceInput = null;
let validationEvidenceInputText = null;
let validationEvidenceInputSha256 = null;
let validationEvidenceInputError = null;
if (validationEvidencePath) {
  try {
    validationEvidenceInputText = fs.readFileSync(validationEvidencePath, 'utf8');
    validationEvidenceInputSha256 = crypto.createHash('sha256').update(validationEvidenceInputText, 'utf8').digest('hex');
    validationEvidenceInput = JSON.parse(validationEvidenceInputText);
  } catch (error) {
    validationEvidenceInputError = `validation evidence input unavailable: ${error.message}`;
  }
}

const bundle = loadBlueprint(ROOT);
const registry = validateBuildHealthRegistry(bundle.buildHealth, bundle.reviewLenses);
const blueprint = validateBlueprint(bundle);
if (!registry.ok || !blueprint.ok) {
  console.error(JSON.stringify({
    state: 'BLOCKED',
    semanticState: 'BLOCKED',
    registryErrors: registry.errors,
    blueprintErrors: blueprint.errors
  }, null, 2));
  process.exit(1);
}

const initialSource = buildSourceManifest(ROOT);
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmCliPath = process.env.npm_execpath;
const commandPattern = /^npm (?:(?:run ([A-Za-z0-9:_-]+))|(test))$/;
const contract = bundle.buildHealth.checkResultContract;
const checkResults = [];

function runRegisteredCommand(command, timeoutMs) {
  const match = command.match(commandPattern);
  if (!match) {
    return {
      transportState: 'SPAWN_FAILED',
      exitCode: null,
      stdout: '',
      stderr: `unsupported registered command: ${command}`,
      timedOutAfterMs: null
    };
  }
  const npmArgs = match[1] ? ['run', match[1]] : ['test'];
  const options = {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024
  };
  const result = npmCliPath
    ? spawnSync(process.execPath, [npmCliPath, ...npmArgs], options)
    : spawnSync(npmExecutable, npmArgs, { ...options, shell: process.platform === 'win32' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const timedOut = result.error?.code === 'ETIMEDOUT';
  return {
    transportState: timedOut ? 'TIMED_OUT' : result.error ? 'SPAWN_FAILED' : 'EXECUTED',
    exitCode: Number.isInteger(result.status) ? result.status : null,
    stdout: result.stdout ?? '',
    stderr: result.error?.message ?? result.stderr ?? '',
    timedOutAfterMs: timedOut ? timeoutMs : null
  };
}

for (const check of bundle.buildHealth.checks) {
  const timeoutMs = check.timeoutMs ?? contract.defaultTimeoutMs;
  const transport = runRegisteredCommand(check.command, timeoutMs);
  checkResults.push(admitCheckResult({
    checkRef: check.checkRef,
    command: check.command,
    contract,
    ...transport
  }));
}

const finalSource = buildSourceManifest(ROOT);
const sourceStability = {
  state: initialSource.treeSha256 === finalSource.treeSha256 ? 'PASS' : 'BLOCKED',
  initialSourceTreeSha256: initialSource.treeSha256,
  finalSourceTreeSha256: finalSource.treeSha256
};
const repository = collectRepositoryEvidence(ROOT);
const validationEvidenceExpectedTarget = {
  repositoryRef: repository.repository.slug,
  baseSha: repository.git.baseSha,
  candidateHeadSha: repository.git.candidateHeadSha,
  candidateTreeSha: repository.git.candidateTreeSha,
  sourceTreeSha256: finalSource.treeSha256,
  observedHeadSha: repository.git.candidateHeadSha
};
let validationEvidenceValidation = { ok: true, errors: [] };
let validationEvidence = {
  state: 'NOT_SUPPLIED',
  inputPath: null,
  inputSha256: null,
  semanticFingerprint: null,
  validationEvidenceRef: null,
  validationProfileRef: null,
  bundle: null,
  errors: []
};
if (validationEvidencePath) {
  if (validationEvidenceInputError) {
    validationEvidenceValidation = { ok: false, errors: [validationEvidenceInputError] };
  } else {
    validationEvidenceValidation = validateValidationEvidenceBundle(
      validationEvidenceInput,
      bundle.buildHealth.validationEvidencePolicy,
      validationEvidenceExpectedTarget
    );
  }
  validationEvidence = {
    state: validationEvidenceValidation.ok ? 'VALIDATED_CURRENT' : 'INVALID',
    inputPath: path.relative(ROOT, validationEvidencePath).split(path.sep).join('/'),
    inputSha256: validationEvidenceInputSha256,
    semanticFingerprint: validationEvidenceInput?.semanticFingerprint ?? null,
    validationEvidenceRef: validationEvidenceInput?.validationEvidenceRef ?? null,
    validationProfileRef: validationEvidenceInput?.validationProfileRef ?? null,
    bundle: validationEvidenceInput,
    errors: [...validationEvidenceValidation.errors]
  };
}
const simulationReceiptPath = path.resolve(ROOT, bundle.schedulerRegistry.simulationContract.receiptPath);
let simulationReceipt = null;
let simulationReceiptError = null;
try {
  simulationReceipt = JSON.parse(fs.readFileSync(simulationReceiptPath, 'utf8'));
} catch (error) {
  simulationReceiptError = `integrated scheduler simulation receipt unavailable: ${error.message}`;
}
const simulationValidation = validateIntegratedSchedulerSimulationReceipt(simulationReceipt, {
  schedulerRegistry: bundle.schedulerRegistry,
  blueprintHash: blueprint.semanticHash,
  sourceTreeSha256: finalSource.treeSha256,
  repositoryGit: repository.git
});
if (simulationReceiptError) simulationValidation.errors.unshift(simulationReceiptError);
simulationValidation.ok = simulationValidation.errors.length === 0;
simulationValidation.state = simulationValidation.ok ? 'EXECUTED_CURRENT' : 'INVALID';
if (!simulationValidation.ok) {
  const schedulerResult = checkResults.find((item) => item.checkRef === bundle.schedulerRegistry.simulationContract.checkRef);
  if (schedulerResult) {
    schedulerResult.semanticState = 'BLOCKED';
    schedulerResult.currentness = 'UNKNOWN';
    schedulerResult.detailRef = simulationValidation.errors.join('; ');
  }
}
const continuityReceiptPath = path.resolve(ROOT, bundle.evolution.simulationContract.receiptPath);
let continuityReceipt = null;
let continuityReceiptError = null;
try {
  continuityReceipt = JSON.parse(fs.readFileSync(continuityReceiptPath, 'utf8'));
} catch (error) {
  continuityReceiptError = `continuity evolution simulation receipt unavailable: ${error.message}`;
}
const continuityValidation = validateContinuityEvolutionSimulationReceipt(continuityReceipt, {
  evolutionRegistry: bundle.evolution,
  blueprintHash: blueprint.semanticHash,
  sourceTreeSha256: finalSource.treeSha256,
  repositoryGit: repository.git
});
if (continuityReceiptError) continuityValidation.errors.unshift(continuityReceiptError);
continuityValidation.ok = continuityValidation.errors.length === 0;
continuityValidation.state = continuityValidation.ok ? 'EXECUTED_CURRENT' : 'INVALID';
if (!continuityValidation.ok) {
  const continuityResult = checkResults.find((item) => item.checkRef === bundle.evolution.simulationContract.checkRef);
  if (continuityResult) {
    continuityResult.semanticState = 'BLOCKED';
    continuityResult.currentness = 'UNKNOWN';
    continuityResult.detailRef = continuityValidation.errors.join('; ');
  }
}
const recoveryReceiptPath = path.resolve(ROOT, bundle.blueprint.runtimeRecovery.simulationContract.receiptPath);
let recoveryReceipt = null;
let recoveryReceiptError = null;
try {
  recoveryReceipt = JSON.parse(fs.readFileSync(recoveryReceiptPath, 'utf8'));
} catch (error) {
  recoveryReceiptError = `runtime recovery simulation receipt unavailable: ${error.message}`;
}
const recoveryValidation = validateIntegratedRecoverySimulationReceipt(recoveryReceipt, {
  runtimeRecoveryRegistry: bundle.blueprint.runtimeRecovery,
  blueprintHash: blueprint.semanticHash,
  sourceTreeSha256: finalSource.treeSha256,
  repositoryGit: repository.git
});
if (recoveryReceiptError) recoveryValidation.errors.unshift(recoveryReceiptError);
recoveryValidation.ok = recoveryValidation.errors.length === 0;
recoveryValidation.state = recoveryValidation.ok ? 'EXECUTED_CURRENT' : 'INVALID';
if (!recoveryValidation.ok) {
  const recoveryResult = checkResults.find((item) => item.checkRef === bundle.blueprint.runtimeRecovery.simulationContract.checkRef);
  if (recoveryResult) {
    recoveryResult.semanticState = 'BLOCKED';
    recoveryResult.currentness = 'UNKNOWN';
    recoveryResult.detailRef = recoveryValidation.errors.join('; ');
  }
}
const { projection } = deriveRepositoryHealth({
  sourceTreeRef: finalSource.treeSha256,
  blueprintHash: blueprint.semanticHash,
  checkResults
});
const allCurrentPassed = projection.state === 'HEALTHY' &&
  sourceStability.state === 'PASS' &&
  validationEvidenceValidation.ok &&
  simulationValidation.ok &&
  continuityValidation.ok &&
  recoveryValidation.ok;
const schedulerSimulation = {
  receiptPath: path.relative(ROOT, simulationReceiptPath).split(path.sep).join('/'),
  state: simulationValidation.state,
  receiptRef: simulationReceipt?.receiptRef ?? null,
  contractRef: simulationReceipt?.contractRef ?? null,
  semanticFingerprint: simulationReceipt?.semanticFingerprint ?? null,
  sourceTreeSha256: simulationReceipt?.sourceTreeSha256 ?? null,
  blueprintHash: simulationReceipt?.blueprintHash ?? null,
  schedulerRegistryHash: simulationReceipt?.schedulerRegistryHash ?? null,
  journeyStates: simulationReceipt?.journeyStates ?? [],
  finalHealthState: simulationReceipt?.finalProjection?.health?.state ?? null,
  orphanedPendingToolCalls: simulationReceipt?.orphanedPendingToolCalls ?? null,
  externalEffectsExecuted: simulationReceipt?.externalEffectsExecuted ?? null,
  selfCertifiedRuntimeEvidence: simulationReceipt?.selfCertifiedRuntimeEvidence ?? null,
  errors: simulationValidation.errors
};
const continuitySimulation = {
  receiptPath: path.relative(ROOT, continuityReceiptPath).split(path.sep).join('/'),
  state: continuityValidation.state,
  receiptRef: continuityReceipt?.receiptRef ?? null,
  contractRef: continuityReceipt?.contractRef ?? null,
  semanticFingerprint: continuityReceipt?.semanticFingerprint ?? null,
  candidateHeadSha: continuityReceipt?.candidateHeadSha ?? null,
  testedCheckoutSha: continuityReceipt?.testedCheckoutSha ?? null,
  testedMergeSha: continuityReceipt?.testedMergeSha ?? null,
  baseSha: continuityReceipt?.baseSha ?? null,
  sourceTreeSha256: continuityReceipt?.sourceTreeSha256 ?? null,
  blueprintHash: continuityReceipt?.blueprintHash ?? null,
  evolutionRegistryHash: continuityReceipt?.evolutionRegistryHash ?? null,
  journeyStates: continuityReceipt?.journeyStates ?? [],
  continuityGateBindings: continuityReceipt?.continuityGateBindings ?? {},
  canonicalWorkNodeRef: continuityReceipt?.canonicalWorkNodeRef ?? null,
  canonicalWorkNodeFinalState: continuityReceipt?.canonicalWorkNodeFinalState ?? null,
  schedulerContextLeaseFingerprint: continuityReceipt?.schedulerContextLeaseFingerprint ?? null,
  schedulerCompletionVerificationFingerprint: continuityReceipt?.schedulerCompletionVerificationFingerprint ?? null,
  schedulerCompletionEvidenceLineageFingerprint: continuityReceipt?.schedulerCompletionEvidenceLineageFingerprint ?? null,
  schedulerWorkgraphTransitionFingerprint: continuityReceipt?.schedulerWorkgraphTransitionFingerprint ?? null,
  schedulerCompletionFingerprint: continuityReceipt?.schedulerCompletionFingerprint ?? null,
  externalEffectsExecuted: continuityReceipt?.externalEffectsExecuted ?? null,
  modelWeightsChanged: continuityReceipt?.modelWeightsChanged ?? null,
  errors: continuityValidation.errors
};
const recoverySimulation = {
  receiptPath: path.relative(ROOT, recoveryReceiptPath).split(path.sep).join('/'),
  state: recoveryValidation.state,
  receiptRef: recoveryReceipt?.receiptRef ?? null,
  contractRef: recoveryReceipt?.contractRef ?? null,
  semanticFingerprint: recoveryReceipt?.semanticFingerprint ?? null,
  candidateHeadSha: recoveryReceipt?.candidateHeadSha ?? null,
  testedCheckoutSha: recoveryReceipt?.testedCheckoutSha ?? null,
  testedMergeSha: recoveryReceipt?.testedMergeSha ?? null,
  baseSha: recoveryReceipt?.baseSha ?? null,
  sourceTreeSha256: recoveryReceipt?.sourceTreeSha256 ?? null,
  blueprintHash: recoveryReceipt?.blueprintHash ?? null,
  runtimeRecoveryRegistryHash: recoveryReceipt?.runtimeRecoveryRegistryHash ?? null,
  journeyStates: recoveryReceipt?.journeyStates ?? [],
  canonicalFailureFingerprint: recoveryReceipt?.canonicalFailure?.semanticFingerprint ?? null,
  firstExecutorOutcome: recoveryReceipt?.firstExecutorOutcome ?? null,
  finalExecutorOutcome: recoveryReceipt?.finalExecutorOutcome ?? null,
  schedulerBindings: recoveryReceipt?.schedulerBindings ?? {},
  terminalReceiptFingerprint: recoveryReceipt?.terminalReceipt?.semanticFingerprint ?? null,
  canonicalWorkNodeRef: recoveryReceipt?.canonicalWorkNodeRef ?? null,
  canonicalWorkNodeFinalState: recoveryReceipt?.canonicalWorkNodeFinalState ?? null,
  finalAggregateFingerprint: recoveryReceipt?.finalAggregateFingerprint ?? null,
  externalEffectsExecuted: recoveryReceipt?.externalEffectsExecuted ?? null,
  realModelInvoked: recoveryReceipt?.realModelInvoked ?? null,
  modelWeightsChanged: recoveryReceipt?.modelWeightsChanged ?? null,
  errors: recoveryValidation.errors
};
const receipt = {
  schemaVersion: 'vexlife.pr-ready-receipt/v1',
  receiptRef: `receipt.vexlife.pr-ready.${finalSource.treeSha256.slice(0, 24)}`,
  state: allCurrentPassed ? 'PR_READY_PASSED' : 'PR_READY_FAILED',
  headSha: repository.git.candidateHeadSha,
  candidateHeadSha: repository.git.candidateHeadSha,
  candidateTreeSha: repository.git.candidateTreeSha,
  testedCheckoutSha: repository.git.checkoutSha,
  testedMergeSha: repository.git.testedMergeSha,
  baseSha: repository.git.baseSha,
  sourceTreeSha256: finalSource.treeSha256,
  blueprintHash: blueprint.semanticHash,
  formedAt: new Date().toISOString(),
  checkResultContractRef: contract.contractRef,
  sourceStability,
  validationEvidence,
  schedulerSimulation,
  continuitySimulation,
  recoverySimulation,
  checkResults,
  health: projection
};
fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
writeJson(receiptPath, receipt);
console.log(JSON.stringify({
  state: receipt.state,
  currentness: 'CURRENT',
  receiptPath: path.relative(ROOT, receiptPath).split(path.sep).join('/'),
  candidateHeadSha: receipt.candidateHeadSha,
  candidateTreeSha: receipt.candidateTreeSha,
  testedCheckoutSha: receipt.testedCheckoutSha,
  testedMergeSha: receipt.testedMergeSha,
  baseSha: receipt.baseSha,
  sourceTreeSha256: receipt.sourceTreeSha256,
  blueprintHash: receipt.blueprintHash,
  checkResultContractRef: receipt.checkResultContractRef,
  sourceStability: receipt.sourceStability.state,
  validationEvidence: receipt.validationEvidence.state,
  validationEvidenceRef: receipt.validationEvidence.validationEvidenceRef,
  schedulerSimulation: receipt.schedulerSimulation.state,
  schedulerSimulationReceiptFingerprint: receipt.schedulerSimulation.semanticFingerprint,
  continuitySimulation: receipt.continuitySimulation.state,
  continuitySimulationReceiptFingerprint: receipt.continuitySimulation.semanticFingerprint,
  recoverySimulation: receipt.recoverySimulation.state,
  recoverySimulationReceiptFingerprint: receipt.recoverySimulation.semanticFingerprint,
  receiptSummary: projection.receiptSummary,
  blockingCheckRefs: projection.blockingCheckRefs,
  unresolvedCheckRefs: projection.unresolvedCheckRefs
}, null, 2));
if (receipt.state !== 'PR_READY_PASSED') process.exitCode = 1;

// [VXG RealForever]
