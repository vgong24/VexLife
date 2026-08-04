import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BUILD_ADMISSION_PROOF_REFS,
  admitBuildRequest,
  createBuildAdmissionConsumptionReceipt,
  createBuildClosure,
  createBuildConcernObservation,
  createIntegratedBuildAdmissionReceipt,
  createSourceManagedBuildAuthority,
  projectBuildAdmission,
  readIntegratedBuildAdmissionReceipt,
  validateBuildAdmissionRegistry,
  validateIntegratedBuildAdmissionReceipt,
  validateSourceManagedBuildAuthority,
  verifyRealBuildEffect
} from '../src/core/build-admission.mjs';
import {
  executeDisposableLocalGitEffect,
  validateBuildEffectReceipt,
  validateBuildEffectReceiptRecord
} from '../src/core/local-git-effect-adapter.mjs';
import { runBoundedGit } from '../src/core/repository-evidence.mjs';
import {
  cleanupBuildAdmissionFixture,
  createBuildAdmissionFixture,
  runBuildAdmissionSimulation
} from '../scripts/build-admission-simulate.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const T0 = Date.parse('2026-08-03T00:00:00.000Z');
const at = (seconds) => new Date(T0 + seconds * 1000).toISOString();

function readdress(value, refField, prefix) {
  const core = structuredClone(value);
  delete core[refField];
  delete core.semanticFingerprint;
  const semanticFingerprint = semanticHash(core);
  return { ...core, [refField]: `${prefix}.${semanticFingerprint.slice(0, 24)}`, semanticFingerprint };
}

function effect(fixture, options = {}) {
  return executeDisposableLocalGitEffect({
    request: fixture.request,
    admission: fixture.admission,
    workspaceRoot: fixture.workspaceRoot,
    repositoryPath: fixture.repositoryPath,
    replacementContent: fixture.replacementContent,
    formedAt: options.formedAt ?? at(20),
    observedAt: options.observedAt ?? at(21),
    completedAt: options.completedAt ?? at(22),
    failurePhase: options.failurePhase ?? null
  }, { registry: fixture.registry });
}

function complete(fixture) {
  const execution = effect(fixture);
  assert.ok(execution.effectReceipt);
  const verification = verifyRealBuildEffect({
    effectReceipt: execution.effectReceipt,
    request: fixture.request,
    admission: fixture.admission,
    workspaceRoot: fixture.workspaceRoot,
    repositoryPath: fixture.repositoryPath,
    schedulerObservedAt: at(23),
    consumedAt: at(24)
  }, { registry: fixture.registry, authorityContext: fixture.authorityContext });
  const closure = createBuildClosure({
    request: fixture.request,
    admission: fixture.admission,
    effectReceipt: execution.effectReceipt,
    verification,
    closedAt: at(30)
  }, { registry: fixture.registry, authorityContext: fixture.authorityContext });
  const projection = projectBuildAdmission({
    request: fixture.request,
    admission: fixture.admission,
    effectReceipt: execution.effectReceipt,
    verification,
    closure
  }, { registry: fixture.registry });
  return { execution, verification, closure, projection };
}

test('BA0-BA3 use exact local identities and reconstruct scheduler-issued Workgraph, occupancy, and six leases', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-ba-authority-'));
  const fixture = createBuildAdmissionFixture({ workspaceRoot, suffix: 'authority' });
  try {
    assert.equal(validateBuildAdmissionRegistry(fixture.registry).ok, true);
    assert.deepEqual(BUILD_ADMISSION_PROOF_REFS, Array.from({ length: 26 }, (_, index) => `BA${index}`));
    assert.deepEqual(fixture.registry.consumedIdentityContract.actionRefs, ['action.file.edit-with-recovery', 'action.cli.execute']);
    assert.equal(fixture.request.effectAuthorityGranted, false);
    assert.equal(fixture.admission.externalEffectsAuthorized, true);
    assert.deepEqual(Object.keys(fixture.authority.leases).sort(), ['capability','context','effect','occupancy','resource','worker']);
    assert.equal(validateSourceManagedBuildAuthority(fixture.authority, { registry: fixture.registry, authorityContext: fixture.authorityContext }).schedulerAuthorityEvidenceRef, fixture.authority.schedulerAuthorityEvidenceRef);

    const coordinated = structuredClone(fixture.authority);
    coordinated.identityCatalog.actions[0].description = 'caller substituted';
    coordinated.identityCatalogFingerprint = semanticHash(coordinated.identityCatalog);
    const readdressed = readdress(coordinated, 'schedulerAuthorityEvidenceRef', 'evidence.scheduler-authority.build-admission');
    assert.throws(() => validateSourceManagedBuildAuthority(readdressed, { registry: fixture.registry, authorityContext: fixture.authorityContext }), /identity chain|source|registry|stale|substituted/);

    const wrongContext = structuredClone(fixture.authorityContext);
    wrongContext.registeredProcessRefs = [...wrongContext.registeredProcessRefs, 'process.caller.substitution'];
    assert.throws(() => validateSourceManagedBuildAuthority(fixture.authority, { registry: fixture.registry, authorityContext: wrongContext }), /binding mismatch|registry|source/);
  } finally { cleanupBuildAdmissionFixture(fixture); }
});

test('BA4-BA9 independently reobserve head/tree/blob/path and reject coordinated authority, repository, confirmation, and inventory substitutions before effect', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-ba-admission-'));
  const fixture = createBuildAdmissionFixture({ workspaceRoot, suffix: 'admission' });
  try {
    const forgedAuthority = structuredClone(fixture.authority);
    forgedAuthority.workRef = 'work.caller.substitution';
    const readdressedAuthority = readdress(forgedAuthority, 'schedulerAuthorityEvidenceRef', 'evidence.scheduler-authority.build-admission');
    assert.throws(() => admitBuildRequest(fixture.request, {
      schedulerAuthorityEvidence: readdressedAuthority,
      repositoryEvidence: fixture.admission.repositoryEvidence,
      humanConfirmation: fixture.humanConfirmation,
      runtimeRecoveryRouteRef: fixture.request.returnRouteRef,
      formedAt: at(7), observedAt: at(8), expiresAt: at(140)
    }, { registry: fixture.registry, authorityContext: fixture.authorityContext, workspaceRoot, repositoryPath: fixture.repositoryPath }));

    const outsideRequest = structuredClone(fixture.request);
    outsideRequest.mutationPath = '../outside.txt';
    const outsideReaddressed = readdress(outsideRequest, 'buildRequestRef', 'request.build-admission');
    assert.throws(() => executeDisposableLocalGitEffect({
      request: outsideReaddressed, admission: fixture.admission, workspaceRoot, repositoryPath: fixture.repositoryPath,
      replacementContent: fixture.replacementContent, formedAt: at(20), observedAt: at(21), completedAt: at(22)
    }, { registry: fixture.registry }), /mutationPath|request|forged|claim|exact/);

    fs.writeFileSync(path.join(fixture.repositoryPath, fixture.registry.adapter.fixturePath), 'drift\n', 'utf8');
    assert.throws(() => admitBuildRequest(fixture.request, {
      schedulerAuthorityEvidence: fixture.authority,
      repositoryEvidence: fixture.admission.repositoryEvidence,
      humanConfirmation: fixture.humanConfirmation,
      runtimeRecoveryRouteRef: fixture.request.returnRouteRef,
      formedAt: at(7), observedAt: at(8), expiresAt: at(140)
    }, { registry: fixture.registry, authorityContext: fixture.authorityContext, workspaceRoot, repositoryPath: fixture.repositoryPath }), /stale|reobserved|workingTree|evidence/);
  } finally { cleanupBuildAdmissionFixture(fixture); }
});

test('Windows and Linux use one exact empty regular Git config domain and reject caller config substitution', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-ba-git-config-portability-'));
  const malicious = path.join(root, 'malicious.gitconfig');
  fs.writeFileSync(malicious, '[credential]\n\thelper = unsafe\n', 'utf8');
  const priorGlobal = process.env.GIT_CONFIG_GLOBAL;
  const priorSystem = process.env.GIT_CONFIG_SYSTEM;
  process.env.GIT_CONFIG_GLOBAL = malicious;
  process.env.GIT_CONFIG_SYSTEM = malicious;
  try {
    const globalResult = runBoundedGit(root, ['config', '--global', '--list'], { label: 'Git empty global config proof' });
    const systemResult = runBoundedGit(root, ['config', '--system', '--list'], { label: 'Git empty system config proof' });
    assert.equal(globalResult.stdout, '');
    assert.equal(systemResult.stdout, '');
    assert.throws(() => runBoundedGit(root, ['config', '--global', '--list'], {
      label: 'Git caller global config substitution',
      env: { GIT_CONFIG_GLOBAL: malicious }
    }), /environment override is not source-managed/);
    assert.throws(() => runBoundedGit(root, ['config', '--system', '--list'], {
      label: 'Git caller system config substitution',
      env: { GIT_CONFIG_SYSTEM: malicious }
    }), /environment override is not source-managed/);
  } finally {
    if (priorGlobal == null) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = priorGlobal;
    if (priorSystem == null) delete process.env.GIT_CONFIG_SYSTEM; else process.env.GIT_CONFIG_SYSTEM = priorSystem;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('BA8-BA9 and BA23 disable repository/global hooks and reject ignored, unsafe-config, nested-control, symlink, remote, and outside-path effect material', () => {
  const cases = [
    ['repository-hook', (fixture, canary) => {
      const hook = path.join(fixture.repositoryPath, '.git', 'hooks', 'pre-commit');
      fs.writeFileSync(hook, `#!/bin/sh\necho executed > "${canary}"\n`, 'utf8');
      fs.chmodSync(hook, 0o755);
    }],
    ['ignored-material', (fixture) => {
      fs.writeFileSync(path.join(fixture.repositoryPath, '.gitignore'), 'ignored.txt\n', 'utf8');
      fs.writeFileSync(path.join(fixture.repositoryPath, 'ignored.txt'), 'hidden effect material\n', 'utf8');
    }],
    ['unsafe-local-config', (fixture) => {
      runBoundedGit(fixture.repositoryPath, ['config', 'core.hooksPath', '/tmp/caller-hooks'], { label: 'install unsafe local hook path' });
    }],
    ['nested-git', (fixture) => {
      fs.mkdirSync(path.join(fixture.repositoryPath, 'nested', '.git'), { recursive: true });
      fs.writeFileSync(path.join(fixture.repositoryPath, 'nested', '.git', 'config'), '[core]\n', 'utf8');
    }],
    ['symlink-material', (fixture) => {
      const target = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-ba-symlink-target-'));
      fs.symlinkSync(target, path.join(fixture.repositoryPath, 'linked-material'), process.platform === 'win32' ? 'junction' : 'dir');
    }],
    ['remote-config', (fixture) => {
      runBoundedGit(fixture.repositoryPath, ['remote', 'add', 'origin', 'https://example.invalid/vexlife.git'], { label: 'install forbidden remote' });
    }]
  ];
  for (const [name, arrange] of cases) {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), `vexlife-ba-control-${name}-`));
    const fixture = createBuildAdmissionFixture({ workspaceRoot, suffix: name });
    const canary = path.join(workspaceRoot, `${name}-canary.txt`);
    try {
      arrange(fixture, canary);
      const result = effect(fixture);
      assert.equal(result.effectReceipt, null, name);
      assert.ok(result.recoveryReceipt, name);
      assert.equal(fs.existsSync(canary), false, `${name} executed side effect`);
    } finally { cleanupBuildAdmissionFixture(fixture); }
  }

  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-ba-global-hook-'));
  const fixture = createBuildAdmissionFixture({ workspaceRoot, suffix: 'global-hook' });
  const hookRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-malicious-hooks-'));
  const canary = path.join(workspaceRoot, 'global-hook-canary.txt');
  const globalConfig = path.join(workspaceRoot, 'malicious-global.gitconfig');
  try {
    fs.writeFileSync(path.join(hookRoot, 'pre-commit'), `#!/bin/sh\necho executed > "${canary}"\n`, 'utf8');
    fs.chmodSync(path.join(hookRoot, 'pre-commit'), 0o755);
    fs.writeFileSync(globalConfig, `[core]\n\thooksPath = ${hookRoot}\n`, 'utf8');
    const prior = process.env.GIT_CONFIG_GLOBAL;
    process.env.GIT_CONFIG_GLOBAL = globalConfig;
    try {
      const result = effect(fixture);
      assert.ok(result.effectReceipt);
      assert.equal(fs.existsSync(canary), false);
    } finally {
      if (prior == null) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = prior;
    }
  } finally {
    cleanupBuildAdmissionFixture(fixture);
    fs.rmSync(hookRoot, { recursive: true, force: true });
  }
});

test('BA10-BA14 create one exact adapter-owned commit, reconstruct complete effect/verification evidence, and replay without a second commit', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-ba-success-'));
  const fixture = createBuildAdmissionFixture({ workspaceRoot, suffix: 'success' });
  try {
    const first = effect(fixture);
    assert.ok(first.effectReceipt);
    assert.equal(first.effectReceipt.commitParentSha, fixture.request.expectedHeadSha);
    assert.equal(first.effectReceipt.beforeBlobSha, fixture.request.expectedBeforeBlobSha);
    assert.equal(first.effectReceipt.afterBlobSha, fixture.request.expectedAfterBlobSha);
    assert.deepEqual(first.effectReceipt.changedPaths, [fixture.registry.adapter.fixturePath]);
    assert.equal(first.effectReceipt.networkUsed, false);
    assert.equal(first.effectReceipt.remoteConfigured, false);
    validateBuildEffectReceiptRecord(first.effectReceipt, { request: fixture.request, admission: fixture.admission, registry: fixture.registry });
    validateBuildEffectReceipt(first.effectReceipt, { request: fixture.request, admission: fixture.admission, workspaceRoot, repositoryPath: fixture.repositoryPath, registry: fixture.registry });

    const coordinated = structuredClone(first.effectReceipt);
    coordinated.commitTreeSha = '0'.repeat(40);
    const readdressed = readdress(coordinated, 'buildEffectReceiptRef', 'effect.build-admission.local-git');
    assert.throws(() => validateBuildEffectReceipt(readdressed, { request: fixture.request, admission: fixture.admission, workspaceRoot, repositoryPath: fixture.repositoryPath, registry: fixture.registry }), /readback|mismatch|stale/);

    const replay = effect(fixture);
    assert.equal(replay.replayed, true);
    assert.equal(replay.effectReceipt.commitSha, first.effectReceipt.commitSha);
    const logCount = Number(runBoundedGit(fixture.repositoryPath, ['rev-list', '--count', 'HEAD'], { label: 'commit count' }).stdout.trim());
    assert.equal(logCount, 2);
  } finally { cleanupBuildAdmissionFixture(fixture); }
});

test('BA15-BA20 produce exact recovery and deduplicable ConcernWatch evidence for every phase without retry authority', () => {
  const registryProbeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-ba-recovery-probe-'));
  const probe = createBuildAdmissionFixture({ workspaceRoot: registryProbeRoot, suffix: 'recovery-probe' });
  const phases = probe.registry.recoveryContract.failurePhases;
  cleanupBuildAdmissionFixture(probe);
  const observationRefs = new Set();
  for (const [index, phase] of phases.entries()) {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), `vexlife-ba-recovery-${phase.toLowerCase()}-`));
    const fixture = createBuildAdmissionFixture({ workspaceRoot, suffix: `recovery-${phase.toLowerCase()}`, clockOffset: index * 200 });
    try {
      const result = effect(fixture, {
        failurePhase: phase,
        formedAt: at(index * 200 + 20), observedAt: at(index * 200 + 21), completedAt: at(index * 200 + 22)
      });
      assert.equal(result.effectReceipt, null);
      assert.ok(result.recoveryReceipt);
      assert.equal(result.recoveryReceipt.retryAuthorityGranted, false);
      assert.equal(result.recoveryReceipt.buildRequestRef, fixture.request.buildRequestRef);
      assert.equal(result.recoveryReceipt.buildAdmissionRef, fixture.admission.buildAdmissionRef);
      assert.equal(result.recoveryReceipt.repositoryEvidenceRef, fixture.request.repositoryEvidenceRef);
      assert.equal(result.recoveryReceipt.concernWatchObservationRequired, true);
      if (phase === 'ROLLBACK') {
        assert.equal(result.recoveryReceipt.rollbackSucceeded, false);
        assert.equal(result.recoveryReceipt.humanAttentionRequired, true);
        assert.equal(result.recoveryReceipt.disposition, 'HELD_UNKNOWN');
      } else {
        assert.equal(result.recoveryReceipt.rollbackSucceeded, true);
        assert.equal(result.recoveryReceipt.humanAttentionRequired, false);
      }
      const observation = createBuildConcernObservation(result.recoveryReceipt, { observedAt: at(index * 200 + 23) }, { registry: fixture.registry, request: fixture.request, admission: fixture.admission, authorityContext: fixture.authorityContext });
      const duplicate = createBuildConcernObservation(result.recoveryReceipt, { observedAt: at(index * 200 + 23) }, { registry: fixture.registry, request: fixture.request, admission: fixture.admission, authorityContext: fixture.authorityContext });
      assert.equal(observation.concernObservationRef, duplicate.concernObservationRef);
      assert.equal(observation.currentness, 'CURRENT');
      assert.equal(observation.retryAuthorityGranted, false);
      assert.equal(observation.failurePhase, phase);
      assert.equal(observation.sourceRef, result.recoveryReceipt.buildRecoveryRef);
      assert.equal(observation.sourceFingerprint, result.recoveryReceipt.semanticFingerprint);
      const retryForgery = structuredClone(result.recoveryReceipt);
      retryForgery.retryAuthorityGranted = true;
      const readdressedRetry = readdress(retryForgery, 'buildRecoveryRef', 'recovery.build-admission');
      assert.throws(() => createBuildConcernObservation(readdressedRetry, { observedAt: at(index * 200 + 23) }, { registry: fixture.registry, request: fixture.request, admission: fixture.admission, authorityContext: fixture.authorityContext }), /retry|recovery|binding/);
      observationRefs.add(observation.concernObservationRef);
    } finally { cleanupBuildAdmissionFixture(fixture); }
  }
  assert.equal(observationRefs.size, phases.length);
});

test('BA21-BA22 scheduler-owned closure releases exact claim and six leases once and converges Queue/Terrain/Health/Guide', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-ba-closure-'));
  const fixture = createBuildAdmissionFixture({ workspaceRoot, suffix: 'closure' });
  try {
    const { execution, verification, closure, projection } = complete(fixture);
    assert.equal(closure.claimReleased, true);
    assert.equal(closure.sixLeasesReleased, true);
    assert.equal(closure.releaseReceipts.length, 7);
    assert.deepEqual(closure.releaseReceipts.map((item) => item.kind).sort(), ['CAPABILITY','CLAIM','CONTEXT','EFFECT','OCCUPANCY','RESOURCE','WORKER']);
    assert.equal(new Set(closure.releaseReceipts.map((item) => item.releaseRef)).size, 7);
    assert.equal(projection.views.QUEUE, null);
    assert.equal(projection.views.TERRAIN, null);
    assert.equal(projection.views.HEALTH.state, 'CLEAR');
    assert.equal(projection.views.GUIDE, null);
    const repeated = createBuildClosure({ request: fixture.request, admission: fixture.admission, effectReceipt: execution.effectReceipt, verification, closedAt: at(30) }, { registry: fixture.registry, authorityContext: fixture.authorityContext });
    assert.equal(repeated.buildClosureRef, closure.buildClosureRef);

    const forged = structuredClone(closure);
    forged.releaseReceipts[0].claimRef = 'claim.caller.substitution';
    forged.releaseReceipts[0] = readdress(forged.releaseReceipts[0], 'releaseRef', `release.build-admission.${forged.releaseReceipts[0].kind.toLowerCase()}`);
    const readdressed = readdress(forged, 'buildClosureRef', 'closure.build-admission');
    const integratedInput = {
      sourceTreeSha256: '1'.repeat(64), blueprintHash: '2'.repeat(64), journeyStates: fixture.registry.simulationContract.requiredJourneyStates,
      request: fixture.request, admission: fixture.admission, effectReceipt: execution.effectReceipt, verification,
      closure: readdressed, projection, failureRecoveryProofs: [], concernObservations: []
    };
    assert.throws(() => createIntegratedBuildAdmissionReceipt(integratedInput, { registry: fixture.registry, authorityContext: fixture.authorityContext }), /closure|release|stale|re-addressed/);
  } finally { cleanupBuildAdmissionFixture(fixture); }
});

test('BA24 PR-ready and Health independently consume one immutable exact receipt without rerunning or replacing the effect journey', () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-ba24-output-'));
  try {
    const result = runBuildAdmissionSimulation({ receiptPath: `generated/health/ba24-${path.basename(outputRoot)}.json`, suffix: `ba24-${path.basename(outputRoot)}` });
    const receipt = result.integrated;
    const context = result.integrated.causalEvidence.admission.authorityEvidence;
    assert.ok(context);
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-ba24-context-'));
    const fixture = createBuildAdmissionFixture({ workspaceRoot: fixtureRoot, suffix: 'ba24-consumer-context' });
    try {
      const prReady = createBuildAdmissionConsumptionReceipt(receipt, 'PR_READY', { observedAt: at(1500) }, { registry: fixture.registry, authorityContext: fixture.authorityContext });
      const health = createBuildAdmissionConsumptionReceipt(receipt, 'HEALTH', { observedAt: at(1501) }, { registry: fixture.registry, authorityContext: fixture.authorityContext });
      assert.equal(prReady.integratedReceiptRef, health.integratedReceiptRef);
      assert.equal(prReady.integratedReceiptFingerprint, health.integratedReceiptFingerprint);
      assert.equal(prReady.effectJourneyRerun, false);
      assert.equal(health.effectJourneyRerun, false);
    } finally { cleanupBuildAdmissionFixture(fixture); }
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('BA25 integrated recovery and ConcernWatch replay reject coordinated re-addressing at every consumer boundary', () => {
  const receiptRelativePath = `generated/health/ba25-${process.pid}-${Date.now()}.json`;
  const receiptPath = path.resolve(receiptRelativePath);
  const result = runBuildAdmissionSimulation({ receiptPath: receiptRelativePath, suffix: `ba25-${process.pid}` });
  const integrated = result.integrated;
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-ba25-context-'));
  const fixture = createBuildAdmissionFixture({ workspaceRoot, suffix: 'ba25-context' });
  try {
    assert.equal(validateIntegratedBuildAdmissionReceipt(integrated, { registry: fixture.registry, authorityContext: fixture.authorityContext }).ok, true);
    assert.equal(integrated.causalEvidence.failureRecoveryCases.length, fixture.registry.recoveryContract.failurePhases.length);
    assert.equal(new Set(integrated.causalEvidence.concernObservations.map((observation) => observation.sourceRef)).size, fixture.registry.recoveryContract.failurePhases.length);

    const forgedProjection = structuredClone(integrated);
    forgedProjection.causalEvidence.projection.views.HEALTH.state = 'ATTENTION';
    forgedProjection.causalEvidence.projection = readdress(forgedProjection.causalEvidence.projection, 'projectionRef', 'projection.build-admission');
    forgedProjection.projectionRef = forgedProjection.causalEvidence.projection.projectionRef;
    forgedProjection.projectionFingerprint = forgedProjection.causalEvidence.projection.semanticFingerprint;
    const readdressedProjection = readdress(forgedProjection, 'receiptRef', 'receipt.build-admission.integrated');
    const projectionValidation = validateIntegratedBuildAdmissionReceipt(readdressedProjection, { registry: fixture.registry, authorityContext: fixture.authorityContext });
    assert.equal(projectionValidation.ok, false);
    assert.match(projectionValidation.errors.join('; '), /projection|reconstruction|mismatch/);

    const forged = structuredClone(integrated);
    const recoveryCase = forged.causalEvidence.failureRecoveryCases[0];
    recoveryCase.recoveryReceipt.retryAuthorityGranted = true;
    recoveryCase.recoveryReceipt.buildRequestRef = 'request.build-admission.caller-substitution';
    recoveryCase.recoveryReceipt.buildAdmissionRef = 'admission.build-admission.caller-substitution';
    recoveryCase.recoveryReceipt = readdress(recoveryCase.recoveryReceipt, 'buildRecoveryRef', 'recovery.build-admission');
    recoveryCase.buildRecoveryRef = recoveryCase.recoveryReceipt.buildRecoveryRef;
    recoveryCase.buildRecoveryFingerprint = recoveryCase.recoveryReceipt.semanticFingerprint;
    forged.causalEvidence.failureRecoveryCases[0] = readdress(recoveryCase, 'recoveryCaseRef', 'case.build-admission.recovery');
    forged.causalEvidence.failureRecoveryProofs[0] = structuredClone(recoveryCase.recoveryReceipt);

    const concernIndex = forged.causalEvidence.concernObservations.findIndex((observation) => observation.failurePhase === recoveryCase.failurePhase);
    const concern = forged.causalEvidence.concernObservations[concernIndex];
    concern.sourceRef = recoveryCase.recoveryReceipt.buildRecoveryRef;
    concern.sourceFingerprint = recoveryCase.recoveryReceipt.semanticFingerprint;
    concern.buildRequestRef = recoveryCase.recoveryReceipt.buildRequestRef;
    concern.buildAdmissionRef = recoveryCase.recoveryReceipt.buildAdmissionRef;
    concern.retryAuthorityGranted = true;
    concern.humanAttentionRequired = true;
    concern.concernClass = 'SAFETY_OR_INTEGRITY';
    concern.impactClass = 'HIGH';
    forged.causalEvidence.concernObservations[concernIndex] = readdress(concern, 'concernObservationRef', 'observation.build-admission');

    forged.failureRecoveryCaseRefs = forged.causalEvidence.failureRecoveryCases.map((item) => item.recoveryCaseRef);
    forged.failureRecoveryProofRefs = forged.causalEvidence.failureRecoveryProofs.map((item) => item.buildRecoveryRef);
    forged.concernObservationRefs = forged.causalEvidence.concernObservations.map((item) => item.concernObservationRef);
    const readdressed = readdress(forged, 'receiptRef', 'receipt.build-admission.integrated');
    const beforeValidation = semanticHash(readdressed);

    const validation = validateIntegratedBuildAdmissionReceipt(readdressed, { registry: fixture.registry, authorityContext: fixture.authorityContext });
    assert.equal(validation.ok, false);
    assert.match(validation.errors.join('; '), /recovery|retry|request|admission|ConcernWatch|lineage|re-addressed/i);
    assert.equal(semanticHash(readdressed), beforeValidation);

    assert.throws(() => createIntegratedBuildAdmissionReceipt({
      candidateHeadSha: readdressed.candidateHeadSha,
      testedCheckoutSha: readdressed.testedCheckoutSha,
      testedMergeSha: readdressed.testedMergeSha,
      baseSha: readdressed.baseSha,
      sourceTreeSha256: readdressed.sourceTreeSha256,
      blueprintHash: readdressed.blueprintHash,
      journeyStates: readdressed.journeyStates,
      request: readdressed.causalEvidence.request,
      admission: readdressed.causalEvidence.admission,
      effectReceipt: readdressed.causalEvidence.effectReceipt,
      verification: readdressed.causalEvidence.verification,
      closure: readdressed.causalEvidence.closure,
      projection: readdressed.causalEvidence.projection,
      failureRecoveryCases: readdressed.causalEvidence.failureRecoveryCases,
      failureRecoveryProofs: readdressed.causalEvidence.failureRecoveryProofs,
      concernObservations: readdressed.causalEvidence.concernObservations
    }, { registry: fixture.registry, authorityContext: fixture.authorityContext }), /recovery|retry|request|admission|ConcernWatch|lineage|re-addressed/i);

    const forgedPath = `${receiptPath}.forged`;
    fs.writeFileSync(forgedPath, `${JSON.stringify(readdressed, null, 2)}\n`, 'utf8');
    const stored = readIntegratedBuildAdmissionReceipt(forgedPath, { registry: fixture.registry, authorityContext: fixture.authorityContext });
    assert.equal(stored.validation.ok, false);
    assert.throws(() => createBuildAdmissionConsumptionReceipt(readdressed, 'PR_READY', { observedAt: at(1700) }, { registry: fixture.registry, authorityContext: fixture.authorityContext }), /invalid integrated Build Admission receipt/);
    assert.throws(() => createBuildAdmissionConsumptionReceipt(readdressed, 'HEALTH', { observedAt: at(1701) }, { registry: fixture.registry, authorityContext: fixture.authorityContext }), /invalid integrated Build Admission receipt/);
    fs.rmSync(forgedPath, { force: true });
    assert.equal(semanticHash(readdressed), beforeValidation);
  } finally {
    cleanupBuildAdmissionFixture(fixture);
    fs.rmSync(receiptPath, { force: true });
  }
});

// [VXG RealForever]
