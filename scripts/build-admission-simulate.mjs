#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  admitBuildRequest,
  createBuildAuthorityContext,
  createBuildClosure,
  createBuildConcernObservation,
  createBuildHumanConfirmation,
  createBuildRequest,
  createIntegratedBuildAdmissionReceipt,
  createSourceManagedBuildAuthority,
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
import { readJson, resolveSafeGeneratedReceiptPath, semanticHash, writeJson } from '../src/core/utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T0 = Date.parse('2026-08-03T00:00:00.000Z');
const at = (seconds) => new Date(T0 + seconds * 1000).toISOString();
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const blobSha = (text) => {
  const bytes = Buffer.from(text, 'utf8');
  return crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
};

function exactSuffix(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'fixture';
}

export function createBuildAdmissionFixture({
  root = ROOT,
  workspaceRoot,
  suffix = 'success',
  clockOffset = 0
} = {}) {
  const bundle = loadBlueprint(root);
  const registry = bundle.blueprint.buildAdmission;
  const trustSnapshot = readJson(path.join(root, 'blueprint/intent-trust-snapshot.json'));
  const authorityContext = createBuildAuthorityContext(bundle, trustSnapshot);
  const safeSuffix = exactSuffix(suffix);
  const workRef = `work.vexlife.build-admission.fixture.${safeSuffix}`;
  const claimRef = `claim.vexlife.build-admission.fixture.${safeSuffix}`;
  const baselineContent = `Build Admission baseline ${safeSuffix}\n`;
  const replacementContent = `Build Admission completed ${safeSuffix}\n`;
  const prepared = prepareDisposableGitRepository({
    workspaceRoot,
    repositoryName: `repository-${safeSuffix}`,
    mutationPath: registry.adapter.fixturePath,
    baselineContent,
    baselineBranch: registry.adapter.baselineBranch,
    formedAt: at(clockOffset + 1)
  }, { registry });
  const authority = createSourceManagedBuildAuthority({
    suffix: safeSuffix,
    workRef,
    claimRef,
    pathClaimRefs: [claimRef],
    formedAt: at(clockOffset + 2),
    observedAt: at(clockOffset + 3),
    expiresAt: at(clockOffset + 180)
  }, { registry, authorityContext });
  const request = createBuildRequest({
    workRef,
    claimRef,
    intentEnvelopeRef: authority.workgraph.intent.intentRef,
    intentEnvelopeFingerprint: authority.workgraph.intent.semanticFingerprint,
    workgraphRef: authority.workgraph.graphRef,
    workgraphFingerprint: authority.workgraph.semanticFingerprint,
    workNodeRef: authority.schedulerAdmission.workNodeRef,
    workNodeFingerprint: authority.schedulerAdmission.nodeFingerprint,
    schedulerAdmissionRef: authority.schedulerAdmission.admissionReceiptRef,
    schedulerAdmissionFingerprint: authority.schedulerAdmission.semanticFingerprint,
    schedulerAuthorityEvidenceRef: authority.schedulerAuthorityEvidenceRef,
    schedulerAuthorityEvidenceFingerprint: authority.semanticFingerprint,
    schedulerGeneration: authority.schedulerGeneration,
    repositoryRef: prepared.repositoryEvidence.repositoryRef,
    repositoryEvidenceRef: prepared.repositoryEvidence.repositoryEvidenceRef,
    repositoryEvidenceFingerprint: prepared.repositoryEvidence.semanticFingerprint,
    expectedHeadSha: prepared.repositoryEvidence.headSha,
    expectedTreeSha: prepared.repositoryEvidence.treeSha,
    branchRef: registry.adapter.effectBranch,
    pathClaimRefs: [claimRef],
    mutationPath: registry.adapter.fixturePath,
    expectedBeforeBlobSha: blobSha(baselineContent),
    replacementContentRef: `content.vexlife.build-admission.fixture.${safeSuffix}`,
    replacementContentSha256: sha256(replacementContent),
    expectedAfterBlobSha: blobSha(replacementContent),
    commitMessage: `Apply disposable Build Admission fixture ${safeSuffix}`,
    expectedTransitionRef: registry.authorityContract.expectedTransitionRef,
    completionGateRefs: registry.authorityContract.completionGateRefs,
    returnRouteRef: registry.authorityContract.returnRouteRef,
    formedAt: at(clockOffset + 4),
    observedAt: at(clockOffset + 5),
    expiresAt: at(clockOffset + 160)
  }, { registry });
  const humanConfirmation = createBuildHumanConfirmation(request, {
    actorRef: registry.authorityContract.actorRef,
    sourceRef: `confirmation-source.vexlife.build-admission.fixture.${safeSuffix}`,
    observedAt: at(clockOffset + 6),
    expiresAt: at(clockOffset + 150)
  }, { registry });
  const admission = admitBuildRequest(request, {
    schedulerAuthorityEvidence: authority,
    repositoryEvidence: prepared.repositoryEvidence,
    humanConfirmation,
    runtimeRecoveryRouteRef: request.returnRouteRef,
    formedAt: at(clockOffset + 7),
    observedAt: at(clockOffset + 8),
    expiresAt: at(clockOffset + 140)
  }, {
    registry,
    authorityContext,
    workspaceRoot,
    repositoryPath: prepared.repositoryPath
  });
  return {
    root, bundle, registry, authorityContext, workspaceRoot,
    repositoryPath: prepared.repositoryPath, baselineContent, replacementContent,
    authority, request, humanConfirmation, admission
  };
}

export function cleanupBuildAdmissionFixture(fixture) {
  if (!fixture?.workspaceRoot) return;
  try {
    if (fixture.repositoryPath && fs.existsSync(fixture.repositoryPath)) {
      cleanupDisposableGitRepository({
        workspaceRoot: fixture.workspaceRoot,
        repositoryPath: fixture.repositoryPath,
        requestFingerprint: fixture.request.semanticFingerprint
      }, { registry: fixture.registry });
    }
  } finally {
    if (fs.existsSync(fixture.workspaceRoot)) fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  }
}

export function runBuildAdmissionSimulation({ root = ROOT, receiptPath = null, suffix = 'canonical' } = {}) {
  const bundle = loadBlueprint(root);
  const registry = bundle.blueprint.buildAdmission;
  const blueprintResult = validateBlueprint(bundle);
  if (!blueprintResult.ok) throw new Error(`Blueprint invalid: ${blueprintResult.errors.join('; ')}`);
  const sourceManifest = buildSourceManifest(root);
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-build-admission-simulation-'));
  let successful;
  const failureRecoveryProofs = [];
  const concernObservations = [];
  try {
    successful = createBuildAdmissionFixture({ root, workspaceRoot, suffix, clockOffset: 0 });
    const executed = executeDisposableLocalGitEffect({
      request: successful.request,
      admission: successful.admission,
      workspaceRoot,
      repositoryPath: successful.repositoryPath,
      replacementContent: successful.replacementContent,
      formedAt: at(20), observedAt: at(21), completedAt: at(22)
    }, { registry });
    if (!executed.effectReceipt) throw new Error('canonical Build Admission effect did not execute');
    const replay = executeDisposableLocalGitEffect({
      request: successful.request,
      admission: successful.admission,
      workspaceRoot,
      repositoryPath: successful.repositoryPath,
      replacementContent: successful.replacementContent,
      formedAt: at(20), observedAt: at(21), completedAt: at(22)
    }, { registry });
    if (!replay.replayed || replay.effectReceipt.commitSha !== executed.effectReceipt.commitSha) throw new Error('duplicate Build Admission effect created a second commit');
    const verification = verifyRealBuildEffect({
      effectReceipt: executed.effectReceipt,
      request: successful.request,
      admission: successful.admission,
      workspaceRoot,
      repositoryPath: successful.repositoryPath,
      schedulerObservedAt: at(23),
      consumedAt: at(24)
    }, { registry, authorityContext: successful.authorityContext });

    for (const [index, phase] of registry.recoveryContract.failurePhases.entries()) {
      const failureRoot = fs.mkdtempSync(path.join(os.tmpdir(), `vexlife-build-admission-${phase.toLowerCase()}-`));
      const failed = createBuildAdmissionFixture({ root, workspaceRoot: failureRoot, suffix: `failure-${phase.toLowerCase()}`, clockOffset: 40 + index * 200 });
      try {
        const result = executeDisposableLocalGitEffect({
          request: failed.request,
          admission: failed.admission,
          workspaceRoot: failureRoot,
          repositoryPath: failed.repositoryPath,
          replacementContent: failed.replacementContent,
          formedAt: at(60 + index * 200),
          observedAt: at(61 + index * 200),
          completedAt: at(62 + index * 200),
          failurePhase: phase
        }, { registry });
        if (!result.recoveryReceipt || result.effectReceipt) throw new Error(`failure phase ${phase} did not return exact recovery evidence`);
        failureRecoveryProofs.push(result.recoveryReceipt);
        concernObservations.push(createBuildConcernObservation(result.recoveryReceipt, {
          observedAt: at(63 + index * 200)
        }, { registry, request: failed.request, admission: failed.admission }));
      } finally {
        cleanupBuildAdmissionFixture(failed);
      }
    }

    const closure = createBuildClosure({
      request: successful.request,
      admission: successful.admission,
      effectReceipt: executed.effectReceipt,
      verification,
      closedAt: at(30)
    }, { registry, authorityContext: successful.authorityContext });
    const projection = projectBuildAdmission({
      request: successful.request,
      admission: successful.admission,
      effectReceipt: executed.effectReceipt,
      verification,
      closure
    }, { registry });
    const repositoryEvidence = collectRepositoryEvidence(root);
    const integrated = createIntegratedBuildAdmissionReceipt({
      candidateHeadSha: repositoryEvidence.git.candidateHeadSha,
      testedCheckoutSha: repositoryEvidence.git.checkoutSha,
      testedMergeSha: repositoryEvidence.git.testedMergeSha,
      baseSha: repositoryEvidence.git.baseSha,
      sourceTreeSha256: sourceManifest.treeSha256,
      blueprintHash: validateBlueprint(bundle).semanticHash,
      journeyStates: registry.simulationContract.requiredJourneyStates,
      request: successful.request,
      admission: successful.admission,
      effectReceipt: executed.effectReceipt,
      verification,
      closure,
      projection,
      failureRecoveryProofs,
      concernObservations
    }, { registry, authorityContext: successful.authorityContext });
    const validation = validateIntegratedBuildAdmissionReceipt(integrated, { registry, authorityContext: successful.authorityContext });
    if (!validation.ok) throw new Error(`integrated Build Admission receipt invalid: ${validation.errors.join('; ')}`);
    const outputPath = receiptPath
      ? resolveSafeGeneratedReceiptPath(root, receiptPath, 'Build Admission receipt path')
      : path.join(root, registry.simulationContract.outputPath);
    writeJson(outputPath, integrated);
    return { integrated, outputPath, validation, sourceManifest, blueprintResult };
  } finally {
    cleanupBuildAdmissionFixture(successful);
  }
}

function parseArguments(argv) {
  let receiptPath = null;
  let suffix = 'canonical';
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--receipt') receiptPath = argv[++index];
    else if (argv[index] === '--suffix') suffix = argv[++index];
    else throw new Error(`unknown argument ${argv[index]}`);
  }
  return { receiptPath, suffix };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = runBuildAdmissionSimulation({ root: ROOT, ...parseArguments(process.argv.slice(2)) });
    console.log(JSON.stringify({
      state: result.integrated.state,
      currentness: result.integrated.currentness,
      receiptRef: result.integrated.receiptRef,
      semanticFingerprint: result.integrated.semanticFingerprint,
      buildEffectReceiptRef: result.integrated.buildEffectReceiptRef,
      commitSha: result.integrated.commitSha,
      claimReleased: result.integrated.claimReleased,
      sixLeasesReleased: result.integrated.sixLeasesReleased,
      outputPath: path.relative(ROOT, result.outputPath).replaceAll(path.sep, '/')
    }, null, 2));
  } catch (error) {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  }
}

// [VXG RealForever]
