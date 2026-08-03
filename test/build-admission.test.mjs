import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  admitBuildRequest,
  BUILD_ADMISSION_PROOF_REFS,
  createBuildAdmissionConsumptionReceipt,
  createBuildClosure,
  createBuildConcernObservation,
  createBuildRequest,
  createIntegratedBuildAdmissionReceipt,
  projectBuildAdmission,
  validateBuildAdmissionRegistry,
  validateBuildRequest,
  validateIntegratedBuildAdmissionReceipt,
  validateRealBuildEffectVerification,
  verifyRealBuildEffect
} from '../src/core/build-admission.mjs';
import {
  cleanupDisposableGitRepository,
  executeDisposableLocalGitEffect,
  prepareDisposableGitRepository,
  validateBuildEffectReceipt
} from '../src/core/local-git-effect-adapter.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../blueprint/build-admission-registry.json', import.meta.url), 'utf8'));
const T0 = Date.parse('2026-08-03T00:00:00.000Z');
const at = (s) => new Date(T0 + s * 1000).toISOString();
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
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
  return canonical({
    kind,
    leaseRef: `lease.build-admission.${kind.toLowerCase()}`,
    ...common,
    currentness: 'CURRENT',
    lifecycle: 'ACTIVE',
    ...extra
  });
}
function fixture(suffix = 'success') {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), `vexlife-build-admission-${suffix}-`));
  const baselineContent = 'before\n';
  const replacementContent = 'after\n';
  const prepared = prepareDisposableGitRepository({
    workspaceRoot,
    repositoryName: `repo-${suffix}`,
    mutationPath: registry.adapter.fixturePath,
    baselineContent,
    baselineBranch: registry.adapter.baselineBranch,
    formedAt: at(1)
  }, { registry });
  const common = {
    workNodeRef: `work-node.build-admission.${suffix}`,
    graphFingerprint: sha256(`graph:${suffix}`),
    schedulerGeneration: 1
  };
  const schedulerAdmission = canonical({
    admissionReceiptRef: `admission.scheduler.${suffix}`,
    schedulerGeneration: 1,
    graphRef: `workgraph.build-admission.${suffix}`,
    graphFingerprint: common.graphFingerprint,
    workNodeRef: common.workNodeRef,
    nodeFingerprint: sha256(`node:${suffix}`),
    workerRef: `worker.build-admission.${suffix}`,
    currentness: 'CURRENT',
    lifecycle: 'ACTIVE'
  });
  const schedulerAuthorityEvidence = canonical({
    schedulerAuthorityEvidenceRef: `evidence.scheduler-authority.${suffix}`,
    currentness: 'CURRENT',
    schedulerGeneration: 1
  });
  const request = createBuildRequest({
    workRef: `work.build-admission.${suffix}`,
    claimRef: `claim.build-admission.${suffix}`,
    intentEnvelopeRef: `intent.build-admission.${suffix}`,
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
    pathClaimRefs: [`claim.build-admission.${suffix}`],
    mutationPath: registry.adapter.fixturePath,
    expectedBeforeBlobSha: blob(baselineContent),
    replacementContentRef: `content.build-admission.${suffix}`,
    replacementContentSha256: sha256(replacementContent),
    expectedAfterBlobSha: blob(replacementContent),
    expectedTransitionRef: `transition.build-admission.${suffix}.completed`,
    commitMessage: `Apply disposable Build Admission fixture ${suffix}`,
    completionGateRefs: [`gate.build-admission.${suffix}`],
    returnRouteRef: `return.build-admission.${suffix}`,
    formedAt: at(2), observedAt: at(3), expiresAt: at(100)
  }, { registry });
  const occupancy = lease('OCCUPANCY', common, {
    occupancyRef: `occupancy.build-admission.${suffix}`,
    claimRef: request.claimRef,
    pathClaimFingerprint: semanticHash(request.pathClaimRefs)
  });
  const capabilityLease = lease('CAPABILITY', common, { capabilityRef: 'capability.vexlife.github.publication' });
  const effectLease = lease('EFFECT', common, { effectScope: registry.adapter.effectScope, allowedEffectRefs: ['action.github.commit'] });
  const resourceLease = lease('RESOURCE', common, { request: { network: false, modelTurn: false, cpuSlots: 1, ramMb: 64 } });
  const workerLease = lease('WORKER', common, { workerRef: schedulerAdmission.workerRef });
  const contextLease = lease('CONTEXT', common, { workerRef: schedulerAdmission.workerRef });
  const admissionInput = {
    schedulerAdmission,
    schedulerAuthorityEvidence,
    repositoryEvidence: prepared.repositoryEvidence,
    occupancy, capabilityLease, effectLease, resourceLease, workerLease, contextLease,
    concernWatchState: registry.admissionContract.requiredConcernWatchState,
    runtimeRecoveryRouteRef: request.returnRouteRef,
    humanConfirmationState: registry.admissionContract.requiredHumanConfirmationState,
    humanConfirmationRef: `confirmation.build-admission.${suffix}`,
    formedAt: at(4), observedAt: at(5), expiresAt: at(90)
  };
  const admission = admitBuildRequest(request, admissionInput, { registry });
  return { workspaceRoot, repositoryPath: prepared.repositoryPath, baselineContent, replacementContent, prepared, request, admissionInput, admission };
}
function releases() {
  return ['CLAIM','OCCUPANCY','CAPABILITY','EFFECT','RESOURCE','WORKER','CONTEXT'].map((kind) => ({
    kind, releaseRef: `release.${kind.toLowerCase()}`, released: true, currentness: 'CURRENT'
  }));
}
function cleanup(f) {
  try {
    if (f?.repositoryPath && fs.existsSync(f.repositoryPath)) {
      cleanupDisposableGitRepository({ workspaceRoot: f.workspaceRoot, repositoryPath: f.repositoryPath, requestFingerprint: f.request.semanticFingerprint }, { registry });
    }
  } finally {
    if (f?.workspaceRoot) fs.rmSync(f.workspaceRoot, { recursive: true, force: true });
  }
}

test('BA0-BA1 registry and canonical request are no-effect and same-ref/different-meaning rejects', () => {
  assert.equal(validateBuildAdmissionRegistry(registry).ok, true);
  assert.deepEqual(BUILD_ADMISSION_PROOF_REFS, Array.from({ length: 26 }, (_, i) => `BA${i}`));
  const f = fixture('ba0');
  try {
    assert.equal(f.request.effectAuthorityGranted, false);
    assert.equal(f.prepared.repositoryEvidence.headSha, f.request.expectedHeadSha);
    assert.equal(validateBuildRequest(f.request, { registry }).buildRequestRef, f.request.buildRequestRef);
    const forged = structuredClone(f.request);
    forged.commitMessage = 'Different meaning';
    assert.throws(() => validateBuildRequest(forged, { registry }), /forged|canonical|meaning/);
  } finally { cleanup(f); }
});

test('BA2-BA9 stale admission, six-lease, drift, path, blob, hash, extra inventory and arbitrary command substitutions fail before effect', () => {
  const f = fixture('ba2');
  try {
    const mutations = [
      ['scheduler', (x) => { x.schedulerAdmission.currentness = 'STALE'; }],
      ['lease', (x) => { x.contextLease.currentness = 'STALE'; }],
      ['head', (x) => { x.repositoryEvidence.headSha = '0'.repeat(40); }],
      ['tree', (x) => { x.repositoryEvidence.treeSha = '0'.repeat(40); }],
      ['claim', (x) => { x.occupancy.claimRef = 'claim.other'; }],
      ['capability', (x) => { x.capabilityLease.capabilityRef = 'capability.other'; }],
      ['effect', (x) => { x.effectLease.allowedEffectRefs = ['action.github.push-branch']; }]
    ];
    for (const [, mutate] of mutations) {
      const input = structuredClone(f.admissionInput);
      mutate(input);
      const semanticFields = ['schedulerAdmission','occupancy','capabilityLease','effectLease','resourceLease','workerLease','contextLease'];
      for (const field of semanticFields) {
        if (input[field]?.semanticFingerprint) {
          delete input[field].semanticFingerprint;
          input[field].semanticFingerprint = semanticHash(input[field]);
        }
      }
      assert.throws(() => admitBuildRequest(f.request, input, { registry }));
    }
    assert.throws(() => createBuildRequest({ ...structuredClone(f.request), mutationPath: '../escape.txt', buildRequestRef: undefined }, { registry }), /mutationPath|claim/);
    assert.throws(() => executeDisposableLocalGitEffect({
      request: { ...f.request, expectedBeforeBlobSha: '0'.repeat(40) }, admission: f.admission,
      workspaceRoot: f.workspaceRoot, repositoryPath: f.repositoryPath, replacementContent: f.replacementContent,
      formedAt: at(6), observedAt: at(7), completedAt: at(8)
    }, { registry }), /before|request|canonical|mismatch/);
    assert.throws(() => executeDisposableLocalGitEffect({
      request: f.request, admission: f.admission, workspaceRoot: f.workspaceRoot, repositoryPath: f.repositoryPath,
      replacementContent: 'wrong\n', formedAt: at(6), observedAt: at(7), completedAt: at(8)
    }, { registry }), /replacement/);
    fs.writeFileSync(path.join(f.repositoryPath, 'extra.txt'), 'extra', 'utf8');
    const rejected = executeDisposableLocalGitEffect({
      request: f.request, admission: f.admission, workspaceRoot: f.workspaceRoot, repositoryPath: f.repositoryPath,
      replacementContent: f.replacementContent, formedAt: at(6), observedAt: at(7), completedAt: at(8)
    }, { registry });
    assert.equal(rejected.effectReceipt, null);
    assert.equal(rejected.recoveryReceipt.rollbackSucceeded, true);
    assert.equal(fs.existsSync(f.repositoryPath), false);
    assert.equal(registry.adapter.arbitraryShellAllowed, false);
  } finally { cleanup(f); }
});

test('BA10-BA14 one admitted request creates one exact commit, direct receipt/verifier binds it, and replay creates no second commit', () => {
  const f = fixture('success');
  try {
    const first = executeDisposableLocalGitEffect({
      request: f.request, admission: f.admission, workspaceRoot: f.workspaceRoot, repositoryPath: f.repositoryPath,
      replacementContent: f.replacementContent, formedAt: at(6), observedAt: at(7), completedAt: at(8)
    }, { registry });
    assert.ok(first.effectReceipt?.commitSha);
    assert.equal(first.effectReceipt.commitParentSha, f.request.expectedHeadSha);
    assert.equal(first.effectReceipt.beforeBlobSha, f.request.expectedBeforeBlobSha);
    assert.equal(first.effectReceipt.afterBlobSha, f.request.expectedAfterBlobSha);
    assert.deepEqual(first.effectReceipt.changedPaths, [registry.adapter.fixturePath]);
    validateBuildEffectReceipt(first.effectReceipt, { request: f.request, admission: f.admission, workspaceRoot: f.workspaceRoot, repositoryPath: f.repositoryPath, registry });
    const forged = structuredClone(first.effectReceipt);
    forged.diffFingerprint = '0'.repeat(64);
    assert.throws(() => validateBuildEffectReceipt(forged, { request: f.request, admission: f.admission, workspaceRoot: f.workspaceRoot, repositoryPath: f.repositoryPath, registry }), /forged|readback/);
    const verification = verifyRealBuildEffect({
      effectReceipt: first.effectReceipt, request: f.request, admission: f.admission,
      workspaceRoot: f.workspaceRoot, repositoryPath: f.repositoryPath,
      consumedAt: at(10), schedulerObservedAt: at(9)
    }, { registry });
    assert.equal(verification.deterministicFakeEvidence, false);
    assert.equal(verification.externalEffectsExecuted, true);
    validateRealBuildEffectVerification(verification, { effectReceipt: first.effectReceipt, request: f.request, admission: f.admission, workspaceRoot: f.workspaceRoot, repositoryPath: f.repositoryPath, registry });
    const replay = executeDisposableLocalGitEffect({
      request: f.request, admission: f.admission, workspaceRoot: f.workspaceRoot, repositoryPath: f.repositoryPath,
      replacementContent: f.replacementContent, formedAt: at(6), observedAt: at(7), completedAt: at(8)
    }, { registry });
    assert.equal(replay.replayed, true);
    assert.equal(replay.effectReceipt.commitSha, first.effectReceipt.commitSha);
  } finally { cleanup(f); }
});

test('BA15-BA19 phase failures preserve, restore, remove, or hold the disposable repository exactly', () => {
  for (const phase of registry.recoveryContract.failurePhases) {
    const f = fixture(`failure-${phase.toLowerCase()}`);
    try {
      const result = executeDisposableLocalGitEffect({
        request: f.request, admission: f.admission, workspaceRoot: f.workspaceRoot, repositoryPath: f.repositoryPath,
        replacementContent: f.replacementContent, formedAt: at(6), observedAt: at(7), completedAt: at(8), failurePhase: phase
      }, { registry });
      assert.equal(result.effectReceipt, null, phase);
      assert.equal(result.recoveryReceipt.failurePhase, phase);
      assert.equal(result.recoveryReceipt.retryAuthorityGranted, false);
      if (phase === 'PRE_WRITE' || phase === 'POST_WRITE_PRE_COMMIT') {
        assert.equal(fs.existsSync(f.repositoryPath), true);
      } else if (phase === 'ROLLBACK') {
        assert.equal(result.recoveryReceipt.disposition, 'HELD_UNKNOWN');
        assert.equal(result.recoveryReceipt.humanAttentionRequired, true);
      } else {
        assert.equal(fs.existsSync(f.repositoryPath), false);
      }
    } finally { cleanup(f); }
  }
});

test('BA20-BA25 concern, once-only releases, projections, consumers, and no-network boundaries share one causal receipt', () => {
  const f = fixture('integrated');
  try {
    const failed = fixture('concern');
    let observation;
    try {
      const failure = executeDisposableLocalGitEffect({
        request: failed.request, admission: failed.admission, workspaceRoot: failed.workspaceRoot, repositoryPath: failed.repositoryPath,
        replacementContent: failed.replacementContent, formedAt: at(6), observedAt: at(7), completedAt: at(8), failurePhase: 'PRE_WRITE'
      }, { registry });
      observation = createBuildConcernObservation(failure.recoveryReceipt, { observedAt: at(9) }, { registry });
      const duplicate = createBuildConcernObservation(failure.recoveryReceipt, { observedAt: at(9) }, { registry });
      assert.equal(duplicate.concernObservationRef, observation.concernObservationRef);
    } finally { cleanup(failed); }
    const effect = executeDisposableLocalGitEffect({
      request: f.request, admission: f.admission, workspaceRoot: f.workspaceRoot, repositoryPath: f.repositoryPath,
      replacementContent: f.replacementContent, formedAt: at(6), observedAt: at(7), completedAt: at(8)
    }, { registry }).effectReceipt;
    const verification = verifyRealBuildEffect({ effectReceipt: effect, request: f.request, admission: f.admission,
      workspaceRoot: f.workspaceRoot, repositoryPath: f.repositoryPath, consumedAt: at(10), schedulerObservedAt: at(9) }, { registry });
    const closure = createBuildClosure({ request: f.request, admission: f.admission, verification, releaseReceipts: releases(), closedAt: at(11) }, { registry });
    assert.equal(closure.canonicalWorkNodeFinalState, 'COMPLETED');
    assert.equal(closure.workgraphTransition.priorState, 'VERIFYING');
    assert.equal(closure.workgraphTransition.nextState, 'COMPLETED');
    assert.equal(closure.intentCompletionReceipt.state, 'PROVEN');
    const projection = projectBuildAdmission({ request: f.request, admission: f.admission, effectReceipt: effect, verification, closure }, { registry });
    assert.equal(projection.views.QUEUE, null);
    assert.equal(projection.views.TERRAIN, null);
    assert.equal(projection.views.HEALTH.state, 'CLEAR');
    assert.equal(projection.views.GUIDE, null);
    const integrated = createIntegratedBuildAdmissionReceipt({
      journeyStates: registry.simulationContract.requiredJourneyStates,
      sourceTreeSha256: sha256('source-tree'), blueprintHash: sha256('blueprint'),
      candidateHeadSha: null, testedCheckoutSha: null, testedMergeSha: null, baseSha: null,
      request: f.request, admission: f.admission, effectReceipt: effect, verification, closure, projection,
      failureRecoveryProofRefs: registry.recoveryContract.failurePhases.map((x) => `recovery.${x}`),
      concernObservationRefs: [observation.concernObservationRef]
    }, { registry });
    assert.equal(validateIntegratedBuildAdmissionReceipt(integrated, { registry }).ok, true);
    const pr = createBuildAdmissionConsumptionReceipt(integrated, 'PR_READY', { observedAt: at(12) }, { registry });
    const health = createBuildAdmissionConsumptionReceipt(integrated, 'HEALTH', { observedAt: at(13) }, { registry });
    assert.notEqual(pr.consumptionReceiptRef, health.consumptionReceiptRef);
    assert.equal(integrated.networkUsed, false);
    assert.equal(integrated.remoteConfigured, false);
    assert.equal(integrated.implementationCheckoutMutated, false);
    assert.equal(integrated.claimReleased, true);
    assert.equal(integrated.sixLeasesReleased, true);
  } finally { cleanup(f); }
});
