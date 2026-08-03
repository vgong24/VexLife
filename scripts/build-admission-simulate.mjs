#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  admitBuildRequest,
  createBuildAdmissionConsumptionReceipt,
  createBuildClosure,
  createBuildConcernObservation,
  createBuildRequest,
  createIntegratedBuildAdmissionReceipt,
  projectBuildAdmission,
  validateIntegratedBuildAdmissionReceipt,
  verifyRealBuildEffect
} from '../src/core/build-admission.mjs';
import {
  cleanupDisposableGitRepository,
  executeDisposableLocalGitEffect,
  prepareDisposableGitRepository
} from '../src/core/local-git-effect-adapter.mjs';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { collectRepositoryEvidence } from '../src/core/repository-evidence.mjs';
import { buildSourceManifest } from '../src/core/source-manifest.mjs';
import { resolveSafeGeneratedReceiptPath, semanticHash, writeJson } from '../src/core/utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T0 = Date.parse('2026-08-03T00:00:00.000Z');
const at = (seconds) => new Date(T0 + seconds * 1000).toISOString();
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const blob = (text) => {
  const bytes = Buffer.from(text);
  return crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
};
function canonical(value) {
  const output = structuredClone(value);
  output.semanticFingerprint = semanticHash(output);
  return Object.freeze(output);
}
function lease(kind, common, extra = {}) {
  return canonical({ kind, leaseRef: `lease.build-admission.simulation.${kind.toLowerCase()}`, ...common, currentness: 'CURRENT', lifecycle: 'ACTIVE', ...extra });
}
function releases() {
  return ['CLAIM','OCCUPANCY','CAPABILITY','EFFECT','RESOURCE','WORKER','CONTEXT'].map((kind) => ({
    kind, releaseRef: `release.build-admission.simulation.${kind.toLowerCase()}`, released: true, currentness: 'CURRENT'
  }));
}
function createFixture({ registry, workspaceRoot, suffix }) {
  const baselineContent = 'Build Admission baseline\n';
  const replacementContent = 'Build Admission completed\n';
  const prepared = prepareDisposableGitRepository({
    workspaceRoot,
    repositoryName: `repository-${suffix}`,
    mutationPath: registry.adapter.fixturePath,
    baselineContent,
    baselineBranch: registry.adapter.baselineBranch,
    formedAt: at(1)
  }, { registry });
  const common = {
    workNodeRef: `${registry.simulationContract.workNodeRef}.${suffix}`,
    graphFingerprint: sha256(`workgraph:${suffix}`),
    schedulerGeneration: 1
  };
  const schedulerAdmission = canonical({
    admissionReceiptRef: `admission.intent-scheduler.build-admission.${suffix}`,
    schedulerGeneration: 1,
    graphRef: `intent-workgraph.build-admission.${suffix}`,
    graphFingerprint: common.graphFingerprint,
    workNodeRef: common.workNodeRef,
    nodeFingerprint: sha256(`work-node:${suffix}`),
    workerRef: `worker.build-admission.${suffix}`,
    currentness: 'CURRENT',
    lifecycle: 'ACTIVE'
  });
  const schedulerAuthorityEvidence = canonical({
    schedulerAuthorityEvidenceRef: `evidence.scheduler-authority.build-admission.${suffix}`,
    schedulerGeneration: 1,
    currentness: 'CURRENT'
  });
  const request = createBuildRequest({
    workRef: `work.vexlife.build-admission.simulation.${suffix}`,
    claimRef: `claim.vexlife.build-admission.simulation.${suffix}`,
    intentEnvelopeRef: `intent.build-admission.simulation.${suffix}`,
    intentEnvelopeFingerprint: sha256(`intent:${suffix}`),
    workgraphRef: schedulerAdmission.graphRef,
    workgraphFingerprint: schedulerAdmission.graphFingerprint,
    workNodeRef: schedulerAdmission.workNodeRef,
    workNodeFingerprint: schedulerAdmission.nodeFingerprint,
    schedulerAdmissionRef: schedulerAdmission.admissionReceiptRef,
    schedulerAdmissionFingerprint: schedulerAdmission.semanticFingerprint,
    schedulerAuthorityEvidenceRef: schedulerAuthorityEvidence.schedulerAuthorityEvidenceRef,
    schedulerAuthorityEvidenceFingerprint: schedulerAuthorityEvidence.semanticFingerprint,
    schedulerGeneration: 1,
    repositoryRef: prepared.repositoryEvidence.repositoryRef,
    repositoryEvidenceRef: prepared.repositoryEvidence.repositoryEvidenceRef,
    repositoryEvidenceFingerprint: prepared.repositoryEvidence.semanticFingerprint,
    expectedHeadSha: prepared.repositoryEvidence.headSha,
    expectedTreeSha: prepared.repositoryEvidence.treeSha,
    branchRef: registry.adapter.effectBranch,
    pathClaimRefs: [`claim.vexlife.build-admission.simulation.${suffix}`],
    mutationPath: registry.adapter.fixturePath,
    expectedBeforeBlobSha: blob(baselineContent),
    replacementContentRef: `content.build-admission.simulation.${suffix}`,
    replacementContentSha256: sha256(replacementContent),
    expectedAfterBlobSha: blob(replacementContent),
    expectedTransitionRef: `transition.build-admission.simulation.${suffix}.completed`,
    commitMessage: `Apply disposable Build Admission simulation ${suffix}`,
    completionGateRefs: [`gate.build-admission.simulation.${suffix}`],
    returnRouteRef: `return-route.build-admission.simulation.${suffix}`,
    formedAt: at(2), observedAt: at(3), expiresAt: at(100)
  }, { registry });
  const occupancy = lease('OCCUPANCY', common, {
    occupancyRef: `occupancy.build-admission.simulation.${suffix}`,
    claimRef: request.claimRef,
    pathClaimFingerprint: semanticHash(request.pathClaimRefs)
  });
  const capabilityLease = lease('CAPABILITY', common, { capabilityRef: 'capability.vexlife.github.publication' });
  const effectLease = lease('EFFECT', common, { effectScope: registry.adapter.effectScope, allowedEffectRefs: ['action.github.commit'] });
  const resourceLease = lease('RESOURCE', common, { request: { network: false, modelTurn: false, cpuSlots: 1, ramMb: 64 } });
  const workerLease = lease('WORKER', common, { workerRef: schedulerAdmission.workerRef });
  const contextLease = lease('CONTEXT', common, { workerRef: schedulerAdmission.workerRef });
  const admission = admitBuildRequest(request, {
    schedulerAdmission,
    schedulerAuthorityEvidence,
    repositoryEvidence: prepared.repositoryEvidence,
    occupancy, capabilityLease, effectLease, resourceLease, workerLease, contextLease,
    concernWatchState: registry.admissionContract.requiredConcernWatchState,
    runtimeRecoveryRouteRef: request.returnRouteRef,
    humanConfirmationState: registry.admissionContract.requiredHumanConfirmationState,
    humanConfirmationRef: `confirmation.build-admission.simulation.${suffix}`,
    formedAt: at(4), observedAt: at(5), expiresAt: at(90)
  }, { registry });
  return { workspaceRoot, repositoryPath: prepared.repositoryPath, baselineContent, replacementContent, request, admission };
}
function cleanupFixture(fixture, registry) {
  if (!fixture) return;
  if (fs.existsSync(fixture.repositoryPath)) {
    cleanupDisposableGitRepository({
      workspaceRoot: fixture.workspaceRoot,
      repositoryPath: fixture.repositoryPath,
      requestFingerprint: fixture.request.semanticFingerprint
    }, { registry });
  }
}

export function runBuildAdmissionSimulation({ root = ROOT, receiptPath = null } = {}) {
  const bundle = loadBlueprint(root);
  const registry = bundle.blueprint.buildAdmission;
  if (!registry) throw new Error('Build Admission registry is not composed into the Blueprint');
  const sourceManifest = buildSourceManifest(root);
  const blueprint = validateBlueprint(bundle);
  if (!blueprint.ok) throw new Error(`Blueprint invalid: ${blueprint.errors.join('; ')}`);
  const repository = collectRepositoryEvidence(root);
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-build-admission-simulation-'));
  let successful = null;
  const failureRecoveryProofRefs = [];
  const concernObservationRefs = [];
  try {
    successful = createFixture({ registry, workspaceRoot, suffix: 'success' });
    const effectResult = executeDisposableLocalGitEffect({
      request: successful.request,
      admission: successful.admission,
      workspaceRoot,
      repositoryPath: successful.repositoryPath,
      replacementContent: successful.replacementContent,
      formedAt: at(6), observedAt: at(7), completedAt: at(8)
    }, { registry });
    if (!effectResult.effectReceipt) throw new Error('successful Build Admission simulation did not execute the effect');
    const replay = executeDisposableLocalGitEffect({
      request: successful.request,
      admission: successful.admission,
      workspaceRoot,
      repositoryPath: successful.repositoryPath,
      replacementContent: successful.replacementContent,
      formedAt: at(6), observedAt: at(7), completedAt: at(8)
    }, { registry });
    if (!replay.replayed || replay.effectReceipt.commitSha !== effectResult.effectReceipt.commitSha) {
      throw new Error('Build Admission simulation replay was not exactly once-only');
    }
    const verification = verifyRealBuildEffect({
      effectReceipt: effectResult.effectReceipt,
      request: successful.request,
      admission: successful.admission,
      workspaceRoot,
      repositoryPath: successful.repositoryPath,
      consumedAt: at(10),
      schedulerObservedAt: at(9)
    }, { registry });
    for (const [index, phase] of registry.recoveryContract.failurePhases.entries()) {
      const failed = createFixture({ registry, workspaceRoot, suffix: `failure-${phase.toLowerCase()}` });
      try {
        const result = executeDisposableLocalGitEffect({
          request: failed.request,
          admission: failed.admission,
          workspaceRoot,
          repositoryPath: failed.repositoryPath,
          replacementContent: failed.replacementContent,
          formedAt: at(20 + index * 3), observedAt: at(21 + index * 3), completedAt: at(22 + index * 3),
          failurePhase: phase
        }, { registry });
        if (!result.recoveryReceipt) throw new Error(`failure phase ${phase} produced no recovery receipt`);
        failureRecoveryProofRefs.push(result.recoveryReceipt.buildRecoveryRef);
        const observation = createBuildConcernObservation(result.recoveryReceipt, { observedAt: at(50 + index) }, { registry });
        concernObservationRefs.push(observation.concernObservationRef);
      } finally {
        cleanupFixture(failed, registry);
      }
    }
    const closure = createBuildClosure({
      request: successful.request,
      admission: successful.admission,
      verification,
      releaseReceipts: releases(),
      closedAt: at(60)
    }, { registry });
    const projection = projectBuildAdmission({
      request: successful.request,
      admission: successful.admission,
      effectReceipt: effectResult.effectReceipt,
      verification,
      closure
    }, { registry });
    const receipt = createIntegratedBuildAdmissionReceipt({
      journeyStates: registry.simulationContract.requiredJourneyStates,
      request: successful.request,
      admission: successful.admission,
      effectReceipt: effectResult.effectReceipt,
      verification,
      closure,
      projection,
      failureRecoveryProofRefs,
      concernObservationRefs,
      candidateHeadSha: repository.git.candidateHeadSha,
      testedCheckoutSha: repository.git.checkoutSha,
      testedMergeSha: repository.git.testedMergeSha,
      baseSha: repository.git.baseSha,
      sourceTreeSha256: sourceManifest.treeSha256,
      blueprintHash: blueprint.semanticHash
    }, { registry });
    const validation = validateIntegratedBuildAdmissionReceipt(receipt, { registry });
    if (!validation.ok) throw new Error(validation.errors.join('; '));
    const prReadyReceipt = createBuildAdmissionConsumptionReceipt(receipt, 'PR_READY', { observedAt: at(61) }, { registry });
    const healthReceipt = createBuildAdmissionConsumptionReceipt(receipt, 'HEALTH', { observedAt: at(62) }, { registry });
    const output = {
      ...receipt,
      prReadyConsumptionReceipt: prReadyReceipt,
      healthConsumptionReceipt: healthReceipt
    };
    const target = resolveSafeGeneratedReceiptPath(
      root,
      receiptPath ?? registry.simulationContract.receiptPath,
      'Build Admission simulation receipt path'
    );
    writeJson(target, output);
    return Object.freeze({ receipt: output, receiptPath: path.relative(root, target).split(path.sep).join('/'), validation });
  } finally {
    cleanupFixture(successful, registry);
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
}

const direct = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (direct) {
  const args = process.argv.slice(2);
  const index = args.indexOf('--receipt');
  if (args.some((value, i) => value !== '--receipt' && i !== index + 1) || (index >= 0 && !args[index + 1])) {
    console.error('Usage: npm run build-admission:simulate -- [--receipt generated/health/build-admission-simulation.json]');
    process.exit(2);
  }
  try {
    const result = runBuildAdmissionSimulation({ receiptPath: index >= 0 ? args[index + 1] : null });
    console.log(JSON.stringify({
      state: 'BUILD_ADMISSION_SIMULATION_CURRENT',
      currentness: 'CURRENT',
      receiptPath: result.receiptPath,
      receiptRef: result.receipt.receiptRef,
      semanticFingerprint: result.receipt.semanticFingerprint,
      sourceTreeSha256: result.receipt.sourceTreeSha256,
      blueprintHash: result.receipt.blueprintHash,
      commitSha: result.receipt.commitSha,
      commitTreeSha: result.receipt.commitTreeSha,
      changedPaths: result.receipt.changedPaths,
      proofRefs: result.receipt.proofRefs,
      externalEffectsExecuted: result.receipt.externalEffectsExecuted,
      effectScope: result.receipt.effectScope,
      networkUsed: result.receipt.networkUsed,
      remoteConfigured: result.receipt.remoteConfigured
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ state: 'BUILD_ADMISSION_SIMULATION_FAILED', currentness: 'UNKNOWN', error: error.message }, null, 2));
    process.exit(1);
  }
}
