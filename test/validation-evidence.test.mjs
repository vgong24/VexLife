import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  computeValidationEvidenceFingerprint,
  validateValidationEvidenceBundle,
  validateValidationEvidencePolicy
} from '../src/core/build-health.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint/build-health-registry.json'), 'utf8'));
const policy = registry.validationEvidencePolicy;
const BASE = '1111111111111111111111111111111111111111';
const HEAD = '2222222222222222222222222222222222222222';
const TREE = '3333333333333333333333333333333333333333';
const SOURCE = '4'.repeat(64);
const formedAt = '2026-08-10T00:50:00.000Z';
const observedAt = '2026-08-10T00:51:00.000Z';
const expectedTarget = {
  repositoryRef: 'vgong24/VexLife',
  baseSha: BASE,
  candidateHeadSha: HEAD,
  candidateTreeSha: TREE,
  sourceTreeSha256: SOURCE,
  observedHeadSha: HEAD
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const proofCells = policy.requiredProofCells.map((item) => item.proofCellRef);

function artifact(ref, content) {
  return { ref, sha256: sha256(content), content, encoding: 'UTF8' };
}

function commandResult(proofCellRef, platformId) {
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
      repositoryRef: 'vgong24/VexLife',
      baseSha: BASE,
      candidateHeadSha: HEAD,
      candidateTreeSha: TREE,
      sourceTreeSha256: SOURCE
    }
  };
}

function baseBundle() {
  const linuxCells = proofCells.filter((ref) => ref === 'MANIFEST_AND_HOST_PROOF_LINUX');
  const windowsCells = proofCells.filter((ref) => ref === 'MANIFEST_AND_HOST_PROOF_WINDOWS' || ref === 'G01_G05A_WINDOWS_PROOFS_WHEN_CURRENTNESS_REQUIRES_RERUN');
  const neutralCells = proofCells.filter((ref) => !linuxCells.includes(ref) && !windowsCells.includes(ref));
  const linuxResults = [...neutralCells, ...linuxCells].map((ref) => commandResult(ref, 'linux'));
  const windowsResults = windowsCells.map((ref) => commandResult(ref, 'windows'));
  const results = [...linuxResults, ...windowsResults];
  const qualificationRefs = ['receipt.qualification.github.actions', 'receipt.qualification.local.windows'];
  const receiptRefs = [...results.flatMap((result) => result.receiptRefs), ...qualificationRefs];
  const logRefs = results.flatMap((result) => result.logRefs);
  const bundle = {
    schemaVersion: 'vexlife.validation-evidence-bundle/v1',
    validationEvidenceRef: 'validation-evidence.test.exact-head',
    validationProfileRef: policy.policyRef,
    validationProfileVersion: policy.policyVersion,
    repositoryRef: 'vgong24/VexLife',
    baseSha: BASE,
    candidateHeadSha: HEAD,
    candidateTreeSha: TREE,
    observedHeadSha: HEAD,
    testedCheckoutSha: HEAD,
    testedMergeSha: null,
    sourceTreeSha256: SOURCE,
    candidateCommits: [{
      commitSha: HEAD,
      authorName: 'VexGPT',
      authorEmail: 'victor.gong@vextreme24.com'
    }],
    dcoCommitEvidence: [{
      commitSha: HEAD,
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
        runtimeVersions: { node: '22.16.0' },
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
        runtimeVersions: { node: '22.16.0' },
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
  bundle.semanticFingerprint = computeValidationEvidenceFingerprint(bundle);
  return bundle;
}

function validate(bundle, target = expectedTarget) {
  return validateValidationEvidenceBundle(bundle, policy, target);
}

function mutate(mutator) {
  const bundle = structuredClone(baseBundle());
  mutator(bundle);
  bundle.semanticFingerprint = computeValidationEvidenceFingerprint(bundle);
  return bundle;
}

function expectBlocked(name, mutator, pattern, target = expectedTarget) {
  test(name, () => {
    const result = validate(mutate(mutator), target);
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), pattern);
  });
}

test('policy owns provider-neutral semantic proof cells', () => {
  const result = validateValidationEvidencePolicy(policy);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(policy.semanticProofOwnerRef, 'registry.vexlife.build-health.001');
  assert.equal(result.stats.proofCells, 8);
});

test('complete exact-head mixed-provider evidence passes', () => {
  const result = validate(baseBundle());
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.stats.requiredProofCells, 8);
  assert.equal(result.stats.satisfiedProofCells, 8);
});

expectBlocked('wrong repository', (bundle) => { bundle.repositoryRef = 'vgong24/Other'; for (const p of bundle.producerAttestations) for (const r of p.commandResults) r.binding.repositoryRef = bundle.repositoryRef; }, /wrong repositoryRef/);
expectBlocked('wrong base', (bundle) => { bundle.baseSha = '5'.repeat(40); for (const p of bundle.producerAttestations) for (const r of p.commandResults) r.binding.baseSha = bundle.baseSha; }, /wrong baseSha/);
expectBlocked('wrong head', (bundle) => { bundle.candidateHeadSha = '6'.repeat(40); bundle.observedHeadSha = bundle.candidateHeadSha; bundle.testedCheckoutSha = bundle.candidateHeadSha; for (const p of bundle.producerAttestations) for (const r of p.commandResults) r.binding.candidateHeadSha = bundle.candidateHeadSha; }, /wrong candidateHeadSha/);
expectBlocked('wrong tree', (bundle) => { bundle.candidateTreeSha = '7'.repeat(40); for (const p of bundle.producerAttestations) for (const r of p.commandResults) r.binding.candidateTreeSha = bundle.candidateTreeSha; }, /wrong candidateTreeSha/);
expectBlocked('wrong source tree', (bundle) => { bundle.sourceTreeSha256 = '9'.repeat(64); for (const p of bundle.producerAttestations) for (const r of p.commandResults) r.binding.sourceTreeSha256 = bundle.sourceTreeSha256; }, /wrong sourceTreeSha256/);
expectBlocked('head moved', () => {}, /head moved relative to external observation/, { ...expectedTarget, observedHeadSha: '8'.repeat(40) });
expectBlocked('missing producer profile', (bundle) => { delete bundle.producerAttestations[0].producerProfileRef; }, /producer profile mismatch/);
expectBlocked('stale producer qualification', (bundle) => { bundle.producerAttestations[0].qualification.currentness = 'STALE'; }, /producer qualification is stale/);
expectBlocked('wrong provider qualification binding', (bundle) => { bundle.producerAttestations[0].qualification.providerIdentityRef = 'provider.other'; }, /wrong provider binding/);
expectBlocked('wrong platform', (bundle) => { bundle.producerAttestations[1].platformId = 'linux'; }, /qualification platform mismatch|requires platform windows/);
expectBlocked('Windows as Linux', (bundle) => { const result = bundle.producerAttestations[1].commandResults[0]; result.platformId = 'linux'; }, /platform impersonation\/mismatch/);
expectBlocked('macOS as Linux or Windows', (bundle) => { bundle.producerAttestations[1].qualification.platformId = 'macos'; bundle.producerAttestations[1].platformId = 'macos'; for (const result of bundle.producerAttestations[1].commandResults) result.platformId = 'macos'; }, /requires platform windows/);
expectBlocked('required proof cell omitted', (bundle) => { bundle.producerAttestations[0].commandResults = bundle.producerAttestations[0].commandResults.filter((item) => item.proofCellRef !== 'REAL_BROWSER_EVIDENCE'); }, /required proof cell omitted or not satisfied: REAL_BROWSER_EVIDENCE/);
expectBlocked('failed semantic result relabeled PASS', (bundle) => { const result = bundle.producerAttestations[0].commandResults[0]; result.exitCode = 1; result.semanticState = 'PASSED'; }, /semantic PASS is not backed by executed current success/);

test('accepts explicitly reusable proof only with integrity-bound currentness and matching dependencies', () => {
  const bundle = baseBundle();
  const result = bundle.producerAttestations[0].commandResults.find((item) => item.proofCellRef === 'REAL_BROWSER_EVIDENCE');
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
  bundle.semanticFingerprint = computeValidationEvidenceFingerprint(bundle);
  const validation = validate(bundle);
  assert.equal(validation.ok, true, validation.errors.join('\n'));
});

expectBlocked('reused evidence rejects mismatched dependency currentness', (bundle) => {
  const result = bundle.producerAttestations[0].commandResults.find((item) => item.proofCellRef === 'REAL_BROWSER_EVIDENCE');
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
  result.dependencyBindings = [{ sourceRef: 'source.review-kit.browser-contract', dependencyClass: 'EWA_CURRENTNESS', expectedFingerprint: 'a'.repeat(64), observedFingerprint: 'b'.repeat(64), grantsExecutionAuthority: false }];
}, /non-matching dependency binding/);

expectBlocked('runner unavailable relabeled PASS', (bundle) => { const result = bundle.producerAttestations[0].commandResults[0]; result.transportState = 'PROVIDER_UNAVAILABLE'; result.executed = false; result.exitCode = null; result.semanticState = 'PASSED'; }, /semantic PASS is not backed by executed current success/);
expectBlocked('receipt digest mismatch', (bundle) => { bundle.receiptDigests[0].content = 'tampered'; }, /receipt .* digest mismatch/);
expectBlocked('DCO commit missing', (bundle) => { bundle.dcoCommitEvidence = []; }, /missing DCO evidence/);
expectBlocked('DCO signoff mismatched', (bundle) => { bundle.dcoCommitEvidence[0].signoffEmail = 'other@example.com'; }, /DCO signoff mismatch/);
expectBlocked('source manifest stale', (bundle) => { const result = bundle.producerAttestations[0].commandResults.find((item) => item.proofCellRef === 'SOURCE_MANIFEST_CURRENT'); result.currentness = 'STALE'; result.semanticState = 'STALE'; }, /required proof cell omitted or not satisfied: SOURCE_MANIFEST_CURRENT/);
expectBlocked('EWA observation used as authority', (bundle) => { bundle.dependencyBindings[0].grantsExecutionAuthority = true; }, /EWA currentness cannot grant execution authority/);
expectBlocked('local evidence represented as GitHub status context', (bundle) => { bundle.producerAttestations[1].statusContext = 'foundation'; }, /local evidence cannot represent a GitHub status context/);
expectBlocked('unknown schema version', (bundle) => { bundle.schemaVersion = 'vexlife.validation-evidence-bundle/v999'; }, /unknown schema\/version/);
