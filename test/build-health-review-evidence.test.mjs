import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import {
  computeValidationEvidenceFingerprint
} from '../src/core/build-health.mjs';
import { collectRepositoryEvidence } from '../src/core/repository-evidence.mjs';
import { buildSourceManifest } from '../src/core/source-manifest.mjs';
import { runSchedulerSimulation } from '../scripts/scheduler-simulate.mjs';
import { runContinuityEvolutionSimulation } from '../scripts/evolution-simulate.mjs';
import { runRecoverySimulation } from '../scripts/recovery-simulate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHA1 = /^[0-9a-f]{40}$/u;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function runGit(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
}

function copySourceTree(sourceRoot, targetRoot) {
  fs.cpSync(sourceRoot, targetRoot, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(sourceRoot, source);
      if (!relative) return true;
      const first = relative.split(path.sep)[0];
      return !['.git', 'node_modules', 'generated', 'runtime', 'models', 'artifacts'].includes(first);
    }
  });
}

function artifact(ref, content) {
  return { ref, sha256: sha256(content), content, encoding: 'UTF8' };
}

function commandResult(proofCellRef, platformId, target) {
  const receiptRef = `receipt.${proofCellRef.toLowerCase()}`;
  const logRef = `log.${proofCellRef.toLowerCase()}`;
  return {
    proofCellRef,
    transportState: 'EXECUTED',
    semanticState: 'PASSED',
    executed: true,
    exitCode: 0,
    currentness: 'CURRENT',
    platformId,
    receiptRefs: [receiptRef],
    logRefs: [logRef],
    statusContext: null,
    binding: {
      repositoryRef: target.repositoryRef,
      baseSha: target.baseSha,
      candidateHeadSha: target.candidateHeadSha,
      candidateTreeSha: target.candidateTreeSha,
      sourceTreeSha256: target.sourceTreeSha256
    }
  };
}

function validationBundle(policy, target, { reuseRealBrowser = false } = {}) {
  const proofCells = policy.requiredProofCells.map((item) => item.proofCellRef);
  const linuxCells = proofCells.filter((ref) => ref === 'MANIFEST_AND_HOST_PROOF_LINUX');
  const windowsCells = proofCells.filter((ref) => ref === 'MANIFEST_AND_HOST_PROOF_WINDOWS' || ref === 'G01_G05A_WINDOWS_PROOFS_WHEN_CURRENTNESS_REQUIRES_RERUN');
  const neutralCells = proofCells.filter((ref) => !linuxCells.includes(ref) && !windowsCells.includes(ref));
  const linuxResults = [...neutralCells, ...linuxCells].map((ref) => commandResult(ref, 'linux', target));
  const windowsResults = windowsCells.map((ref) => commandResult(ref, 'windows', target));
  const results = [...linuxResults, ...windowsResults];
  const qualificationRefs = ['receipt.qualification.github.actions', 'receipt.qualification.local.windows'];
  const receiptRefs = [...results.flatMap((result) => result.receiptRefs), ...qualificationRefs];
  const logRefs = results.flatMap((result) => result.logRefs);
  const formedAt = '2026-08-27T08:30:00.000Z';
  const observedAt = '2026-08-27T08:31:00.000Z';

  const bundle = {
    schemaVersion: 'vexlife.validation-evidence-bundle/v1',
    validationEvidenceRef: reuseRealBrowser ? 'validation-evidence.test.reused-browser' : 'validation-evidence.test.executed-browser',
    validationProfileRef: policy.policyRef,
    validationProfileVersion: policy.policyVersion,
    repositoryRef: target.repositoryRef,
    baseSha: target.baseSha,
    candidateHeadSha: target.candidateHeadSha,
    candidateTreeSha: target.candidateTreeSha,
    observedHeadSha: target.candidateHeadSha,
    testedCheckoutSha: target.candidateHeadSha,
    testedMergeSha: null,
    sourceTreeSha256: target.sourceTreeSha256,
    candidateCommits: [{
      commitSha: target.candidateHeadSha,
      authorName: 'VexGPT',
      authorEmail: 'victor.gong@vextreme24.com'
    }],
    dcoCommitEvidence: [{
      commitSha: target.candidateHeadSha,
      inspected: true,
      state: 'PASSED',
      authorName: 'VexGPT',
      authorEmail: 'victor.gong@vextreme24.com',
      signoffName: 'VexGPT',
      signoffEmail: 'victor.gong@vextreme24.com'
    }],
    producerAttestations: [
      {
        producerProfileRef: policy.producerProfiles.GITHUB_HOSTED.producerProfileRef,
        producerClass: 'GITHUB_HOSTED',
        providerIdentityRef: 'provider.github.actions.test',
        platformId: 'linux',
        architecture: 'x64',
        runtimeVersions: { node: process.version },
        qualificationEvidenceRefs: ['qualification.github.actions.current'],
        qualificationReceiptRef: qualificationRefs[0],
        qualificationReceiptDigest: sha256(`payload:${qualificationRefs[0]}`),
        qualification: {
          providerIdentityRef: 'provider.github.actions.test',
          platformId: 'linux',
          currentness: 'CURRENT',
          observedAt: formedAt,
          expiresAt: null
        },
        statusContext: 'foundation',
        commandResults: linuxResults
      },
      {
        producerProfileRef: policy.producerProfiles.ONE_SHOT_LOCAL.producerProfileRef,
        producerClass: 'ONE_SHOT_LOCAL',
        providerIdentityRef: 'provider.local.windows.test',
        platformId: 'windows',
        architecture: 'x64',
        runtimeVersions: { node: process.version },
        qualificationEvidenceRefs: ['qualification.local.windows.current'],
        qualificationReceiptRef: qualificationRefs[1],
        qualificationReceiptDigest: sha256(`payload:${qualificationRefs[1]}`),
        qualification: {
          providerIdentityRef: 'provider.local.windows.test',
          platformId: 'windows',
          currentness: 'CURRENT',
          observedAt: formedAt,
          expiresAt: null
        },
        statusContext: null,
        commandResults: windowsResults
      }
    ],
    receiptRefs,
    receiptDigests: receiptRefs.map((ref) => artifact(ref, `payload:${ref}`)),
    logDigests: logRefs.map((ref) => artifact(ref, `log:${ref}`)),
    dependencyBindings: [{
      dependencyRef: 'github.issue.vextreme-sdk.735.comment.5234624859',
      dependencyClass: 'EWA_CURRENTNESS',
      currentness: 'CURRENT',
      grantsExecutionAuthority: false
    }],
    currentness: 'CURRENT',
    formedAt,
    observedAt
  };

  if (reuseRealBrowser) {
    const result = linuxResults.find((item) => item.proofCellRef === 'REAL_BROWSER_EVIDENCE');
    assert.ok(result, 'REAL_BROWSER_EVIDENCE proof cell must exist');
    result.evidenceDisposition = 'REUSED';
    result.transportState = 'NOT_RUN';
    result.executed = false;
    result.exitCode = null;
    result.reuseDisposition = 'REUSE';
    result.acceptedEvidenceRef = result.receiptRefs[0];
    const currentnessRef = 'receipt.ewa.real-browser.currentness';
    const currentnessArtifact = artifact(currentnessRef, `payload:${currentnessRef}`);
    bundle.receiptRefs.push(currentnessRef);
    bundle.receiptDigests.push(currentnessArtifact);
    result.currentnessReceiptRef = currentnessRef;
    result.currentnessReceiptDigest = currentnessArtifact.sha256;
    result.dependencyBindings = [{
      sourceRef: 'source.review-kit.browser-contract',
      dependencyClass: 'EWA_CURRENTNESS',
      expectedFingerprint: 'a'.repeat(64),
      observedFingerprint: 'a'.repeat(64),
      grantsExecutionAuthority: false
    }];
  }

  bundle.semanticFingerprint = computeValidationEvidenceFingerprint(bundle);
  return bundle;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeValidationEvidence(filePath, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(filePath, text, 'utf8');
  return sha256(text);
}

function parseJsonOutput(result) {
  assert.notEqual(result.stdout.trim(), '', result.stderr);
  return JSON.parse(result.stdout);
}

function isolatedFixtureEnvironment(overrides = {}) {
  const env = { ...process.env, ...overrides };
  for (const key of Object.keys(env)) {
    if (key.startsWith('VEXLIFE_')) delete env[key];
  }
  return env;
}

test('PR-ready and Health consume optional validation evidence without trusting PR-ready blindly', { timeout: 120000 }, () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-review-health-'));
  const repositoryRoot = path.join(workspace, 'repo');
  try {
    copySourceTree(ROOT, repositoryRoot);
    runGit(repositoryRoot, ['init', '-q']);
    runGit(repositoryRoot, ['config', 'user.name', 'VexGPT']);
    runGit(repositoryRoot, ['config', 'user.email', 'victor.gong@vextreme24.com']);
    runGit(repositoryRoot, ['add', '-A']);
    runGit(repositoryRoot, ['-c', 'commit.gpgSign=false', 'commit', '-q', '-m', 'Fixture base\n\nSigned-off-by: VexGPT <victor.gong@vextreme24.com>']);
    const baseSha = runGit(repositoryRoot, ['rev-parse', 'HEAD']);
    runGit(repositoryRoot, ['-c', 'commit.gpgSign=false', 'commit', '--allow-empty', '-q', '-m', 'Fixture candidate\n\nSigned-off-by: VexGPT <victor.gong@vextreme24.com>']);
    const candidateHeadSha = runGit(repositoryRoot, ['rev-parse', 'HEAD']);
    assert.match(baseSha, SHA1);
    assert.match(candidateHeadSha, SHA1);
    runGit(repositoryRoot, ['remote', 'add', 'origin', 'https://github.com/vgong24/VexLife.git']);
    runGit(repositoryRoot, ['update-ref', 'refs/remotes/origin/main', baseSha]);

    const fixtureEnvironment = isolatedFixtureEnvironment();
    const repository = collectRepositoryEvidence(repositoryRoot, fixtureEnvironment);
    const gitTreeSha = runGit(repositoryRoot, ['rev-parse', 'HEAD^{tree}']);
    assert.equal(repository.git.candidateHeadSha, candidateHeadSha);
    assert.equal(repository.git.candidateTreeSha, gitTreeSha);
    assert.equal(repository.git.baseSha, baseSha);

    const source = buildSourceManifest(repositoryRoot);
    const blueprint = loadBlueprint(repositoryRoot);
    const policy = blueprint.buildHealth.validationEvidencePolicy;
    const target = {
      repositoryRef: 'vgong24/VexLife',
      baseSha,
      candidateHeadSha,
      candidateTreeSha: gitTreeSha,
      sourceTreeSha256: source.treeSha256
    };

    runSchedulerSimulation({ root: repositoryRoot, writeReceipt: true });
    runContinuityEvolutionSimulation({ root: repositoryRoot, writeReceipt: true });
    runRecoverySimulation({ root: repositoryRoot, writeReceipt: true });

    const generatedHealth = path.join(repositoryRoot, 'generated', 'health');
    fs.mkdirSync(generatedHealth, { recursive: true });
    const fakeNpm = path.join(generatedHealth, 'fake-npm.mjs');
    fs.writeFileSync(fakeNpm, "console.log(JSON.stringify({state:'PASS',currentness:'CURRENT'}));\n", 'utf8');
    const env = { ...fixtureEnvironment, npm_execpath: fakeNpm };

    const evidenceArg = 'generated/health/review-evidence.json';
    const evidencePath = path.join(repositoryRoot, ...evidenceArg.split('/'));
    const executed = validationBundle(policy, target, { reuseRealBrowser: false });
    writeValidationEvidence(evidencePath, executed);
    const executedReceiptArg = 'generated/health/pr-ready-executed-review.json';
    const executedPrReady = spawnSync(process.execPath, ['scripts/pr-ready.mjs', '--receipt', executedReceiptArg, '--validation-evidence', evidenceArg], {
      cwd: repositoryRoot,
      env,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024
    });
    assert.equal(executedPrReady.status, 0, executedPrReady.stderr || executedPrReady.stdout);
    const executedReceiptPath = path.join(repositoryRoot, ...executedReceiptArg.split('/'));
    const executedReceipt = JSON.parse(fs.readFileSync(executedReceiptPath, 'utf8'));
    assert.equal(executedReceipt.state, 'PR_READY_PASSED');
    assert.equal(executedReceipt.candidateTreeSha, gitTreeSha);
    assert.equal(executedReceipt.validationEvidence.state, 'VALIDATED_CURRENT');
    assert.equal(executedReceipt.validationEvidence.validationEvidenceRef, executed.validationEvidenceRef);
    assert.equal(executedReceipt.validationEvidence.inputSha256, sha256(fs.readFileSync(evidencePath, 'utf8')));

    const executedHealth = spawnSync(process.execPath, ['scripts/health-check.mjs', '--receipt', executedReceiptArg], {
      cwd: repositoryRoot,
      env,
      encoding: 'utf8'
    });
    assert.equal(executedHealth.status, 0, executedHealth.stderr || executedHealth.stdout);
    const executedHealthReceipt = parseJsonOutput(executedHealth);
    assert.equal(executedHealthReceipt.receiptState, 'EXECUTED_CURRENT');
    assert.equal(executedHealthReceipt.validationEvidenceState, 'VALIDATED_CURRENT');
    assert.equal(executedHealthReceipt.validationEvidenceRef, executed.validationEvidenceRef);

    const reused = validationBundle(policy, target, { reuseRealBrowser: true });
    writeValidationEvidence(evidencePath, reused);
    const reusedReceiptArg = 'generated/health/pr-ready-reused-review.json';
    const reusedPrReady = spawnSync(process.execPath, ['scripts/pr-ready.mjs', '--receipt', reusedReceiptArg, '--validation-evidence', evidenceArg], {
      cwd: repositoryRoot,
      env,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024
    });
    assert.equal(reusedPrReady.status, 0, reusedPrReady.stderr || reusedPrReady.stdout);
    const reusedReceiptPath = path.join(repositoryRoot, ...reusedReceiptArg.split('/'));
    const reusedReceipt = JSON.parse(fs.readFileSync(reusedReceiptPath, 'utf8'));
    assert.equal(reusedReceipt.state, 'PR_READY_PASSED');
    assert.equal(reusedReceipt.validationEvidence.state, 'VALIDATED_CURRENT');

    const reusedHealth = spawnSync(process.execPath, ['scripts/health-check.mjs', '--receipt', reusedReceiptArg], {
      cwd: repositoryRoot,
      env,
      encoding: 'utf8'
    });
    assert.equal(reusedHealth.status, 0, reusedHealth.stderr || reusedHealth.stdout);
    assert.equal(parseJsonOutput(reusedHealth).validationEvidenceState, 'VALIDATED_CURRENT');

    fs.appendFileSync(evidencePath, ' ', 'utf8');
    const byteTamper = spawnSync(process.execPath, ['scripts/health-check.mjs', '--receipt', reusedReceiptArg], {
      cwd: repositoryRoot,
      env,
      encoding: 'utf8'
    });
    assert.equal(byteTamper.status, 1);
    const byteTamperReceipt = parseJsonOutput(byteTamper);
    assert.equal(byteTamperReceipt.validationEvidenceState, 'INVALID');
    assert.match(byteTamperReceipt.errors.join('\n'), /input SHA-256/);

    const drifted = structuredClone(reused);
    const reusedBrowser = drifted.producerAttestations[0].commandResults.find((item) => item.proofCellRef === 'REAL_BROWSER_EVIDENCE');
    reusedBrowser.dependencyBindings[0].observedFingerprint = 'b'.repeat(64);
    drifted.semanticFingerprint = computeValidationEvidenceFingerprint(drifted);
    const driftedSha = writeValidationEvidence(evidencePath, drifted);
    const forgedDriftReceipt = structuredClone(reusedReceipt);
    forgedDriftReceipt.validationEvidence.inputSha256 = driftedSha;
    forgedDriftReceipt.validationEvidence.semanticFingerprint = drifted.semanticFingerprint;
    forgedDriftReceipt.validationEvidence.validationEvidenceRef = drifted.validationEvidenceRef;
    forgedDriftReceipt.validationEvidence.validationProfileRef = drifted.validationProfileRef;
    forgedDriftReceipt.validationEvidence.bundle = drifted;
    forgedDriftReceipt.validationEvidence.errors = [];
    writeJson(reusedReceiptPath, forgedDriftReceipt);
    const dependencyDrift = spawnSync(process.execPath, ['scripts/health-check.mjs', '--receipt', reusedReceiptArg], {
      cwd: repositoryRoot,
      env,
      encoding: 'utf8'
    });
    assert.equal(dependencyDrift.status, 1);
    const dependencyDriftReceipt = parseJsonOutput(dependencyDrift);
    assert.equal(dependencyDriftReceipt.validationEvidenceState, 'INVALID');
    assert.match(dependencyDriftReceipt.errors.join('\n'), /non-matching dependency binding/);

    const wrongTree = structuredClone(reused);
    wrongTree.candidateTreeSha = '0'.repeat(40);
    for (const producer of wrongTree.producerAttestations) {
      for (const result of producer.commandResults) result.binding.candidateTreeSha = wrongTree.candidateTreeSha;
    }
    wrongTree.semanticFingerprint = computeValidationEvidenceFingerprint(wrongTree);
    const wrongTreeSha = writeValidationEvidence(evidencePath, wrongTree);
    const forgedTreeReceipt = structuredClone(reusedReceipt);
    forgedTreeReceipt.validationEvidence.inputSha256 = wrongTreeSha;
    forgedTreeReceipt.validationEvidence.semanticFingerprint = wrongTree.semanticFingerprint;
    forgedTreeReceipt.validationEvidence.validationEvidenceRef = wrongTree.validationEvidenceRef;
    forgedTreeReceipt.validationEvidence.validationProfileRef = wrongTree.validationProfileRef;
    forgedTreeReceipt.validationEvidence.bundle = wrongTree;
    forgedTreeReceipt.validationEvidence.errors = [];
    writeJson(reusedReceiptPath, forgedTreeReceipt);
    const wrongTreeHealth = spawnSync(process.execPath, ['scripts/health-check.mjs', '--receipt', reusedReceiptArg], {
      cwd: repositoryRoot,
      env,
      encoding: 'utf8'
    });
    assert.equal(wrongTreeHealth.status, 1);
    const wrongTreeHealthReceipt = parseJsonOutput(wrongTreeHealth);
    assert.equal(wrongTreeHealthReceipt.validationEvidenceState, 'INVALID');
    assert.match(wrongTreeHealthReceipt.errors.join('\n'), /wrong candidateTreeSha/);

    const noInputReceiptArg = 'generated/health/pr-ready-no-review.json';
    const noInputPrReady = spawnSync(process.execPath, ['scripts/pr-ready.mjs', '--receipt', noInputReceiptArg], {
      cwd: repositoryRoot,
      env,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024
    });
    assert.equal(noInputPrReady.status, 0, noInputPrReady.stderr || noInputPrReady.stdout);
    const noInputReceiptPath = path.join(repositoryRoot, ...noInputReceiptArg.split('/'));
    const noInputReceipt = JSON.parse(fs.readFileSync(noInputReceiptPath, 'utf8'));
    assert.equal(noInputReceipt.validationEvidence.state, 'NOT_SUPPLIED');
    const noInputHealth = spawnSync(process.execPath, ['scripts/health-check.mjs', '--receipt', noInputReceiptArg], {
      cwd: repositoryRoot,
      env,
      encoding: 'utf8'
    });
    assert.equal(noInputHealth.status, 0, noInputHealth.stderr || noInputHealth.stdout);
    assert.equal(parseJsonOutput(noInputHealth).validationEvidenceState, 'NOT_SUPPLIED');
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

// [VXG RealForever]