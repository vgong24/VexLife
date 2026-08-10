import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/utils.mjs';
import {
  deriveProviderNeutralValidationProfile,
  validateProviderNeutralValidationEvidence
} from '../src/core/build-health.mjs';

const SHA = (char, length) => char.repeat(length);
const registry = {
  checks: [
    { checkRef: 'check.alpha', command: 'npm run alpha', blocking: true },
    { checkRef: 'check.beta', command: 'npm run beta', blocking: true },
    { checkRef: 'check.nonblocking', command: 'npm run optional', blocking: false }
  ]
};

function receipt(ref) {
  const value = { schemaVersion: 'receipt.test/v1', ref, state: 'PASS' };
  return { receiptRef: ref, receipt: value, receiptDigest: semanticHash(value), logDigest: SHA('a', 64) };
}

function producer(ref, platformId, producerClass = 'ONE_SHOT_LOCAL') {
  return {
    producerProfileRef: ref,
    producerClass,
    providerIdentityRef: `provider.${ref}`,
    platformId,
    architecture: 'x64',
    nodeVersion: 'v22.0.0',
    qualificationEvidenceRefs: [`qualification.${ref}`],
    qualificationReceiptRef: `receipt.qualification.${ref}`,
    qualificationReceiptDigest: SHA('b', 64),
    currentness: 'CURRENT'
  };
}

function validBundle() {
  const profile = deriveProviderNeutralValidationProfile(registry);
  const linux = producer('producer.linux', 'linux');
  const windows = producer('producer.windows', 'windows');
  const semantic = profile.semanticChecks.map((check) => ({
    checkRef: check.checkRef,
    command: check.command,
    producerProfileRef: linux.producerProfileRef,
    transportState: 'EXECUTED',
    executed: true,
    semanticState: 'PASSED',
    currentness: 'CURRENT',
    ...receipt(`receipt.${check.checkRef}`)
  }));
  const proofCells = profile.proofCells.map((cell) => ({
    proofCellRef: cell.proofCellRef,
    producerProfileRef: cell.platformId === 'linux' ? linux.producerProfileRef : windows.producerProfileRef,
    platformId: cell.platformId,
    evidenceDisposition: 'EXECUTED',
    transportState: 'EXECUTED',
    executed: true,
    semanticState: 'PASSED',
    currentness: 'CURRENT',
    ...receipt(`receipt.${cell.proofCellRef}`)
  }));
  const commitSha = SHA('1', 40);
  return {
    schemaVersion: 'vexlife.provider-neutral-validation-evidence/v1',
    validationProfileRef: profile.validationProfileRef,
    validationProfileVersion: profile.validationProfileVersion,
    validationProfileFingerprint: profile.semanticFingerprint,
    repositoryRef: 'github.repo.vgong24.VexLife',
    baseSha: SHA('2', 40),
    candidateHeadSha: SHA('3', 40),
    candidateTreeSha: SHA('4', 40),
    testedCheckoutSha: SHA('3', 40),
    testedMergeSha: null,
    sourceTreeSha256: SHA('5', 64),
    currentness: 'CURRENT',
    producerProfiles: [linux, windows],
    candidateCommitShas: [commitSha],
    dcoCommitEvidence: [{
      commitSha,
      authorName: 'VexGPT',
      authorEmail: 'victor.gong@vextreme24.com',
      commitMessage: 'Candidate\n\nSigned-off-by: VexGPT <victor.gong@vextreme24.com>'
    }],
    semanticCheckResults: semantic,
    proofCells
  };
}

function validate(bundle, overrides = {}) {
  return validateProviderNeutralValidationEvidence(bundle, {
    registry,
    expectedRepositoryRef: 'github.repo.vgong24.VexLife',
    expectedBaseSha: SHA('2', 40),
    expectedCandidateHeadSha: SHA('3', 40),
    expectedCandidateTreeSha: SHA('4', 40),
    expectedSourceTreeSha256: SHA('5', 64),
    ...overrides
  });
}

test('accepts a complete exact-head provider-neutral evidence bundle', () => {
  const result = validate(validBundle());
  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('rejects wrong exact-head identities', () => {
  for (const key of ['repositoryRef', 'baseSha', 'candidateHeadSha', 'candidateTreeSha', 'sourceTreeSha256']) {
    const bundle = validBundle();
    bundle[key] = key === 'repositoryRef' ? 'github.repo.other' : (key === 'sourceTreeSha256' ? SHA('6', 64) : SHA('6', 40));
    assert.equal(validate(bundle).ok, false, key);
  }
});

test('rejects missing or stale producer qualification and local hosted-status impersonation', () => {
  let bundle = validBundle();
  bundle.semanticCheckResults[0].producerProfileRef = 'producer.missing';
  assert.equal(validate(bundle).ok, false);

  bundle = validBundle();
  bundle.producerProfiles[0].currentness = 'STALE';
  assert.equal(validate(bundle).ok, false);

  bundle = validBundle();
  bundle.producerProfiles[0].statusContextRef = 'Foundation checks';
  assert.equal(validate(bundle).ok, false);
});

test('rejects platform impersonation', () => {
  const bundle = validBundle();
  bundle.proofCells.find((item) => item.platformId === 'linux').producerProfileRef = 'producer.windows';
  assert.equal(validate(bundle).ok, false);
});

test('rejects omitted, failed, unavailable or altered semantic checks', () => {
  let bundle = validBundle();
  bundle.semanticCheckResults.pop();
  assert.equal(validate(bundle).ok, false);

  bundle = validBundle();
  bundle.semanticCheckResults[0].semanticState = 'FAILED';
  assert.equal(validate(bundle).ok, false);

  bundle = validBundle();
  bundle.semanticCheckResults[0].transportState = 'NOT_ALLOCATED';
  bundle.semanticCheckResults[0].executed = false;
  assert.equal(validate(bundle).ok, false);

  bundle = validBundle();
  bundle.semanticCheckResults[0].command = 'npm run weaker';
  assert.equal(validate(bundle).ok, false);
});

test('rejects receipt digest mismatch and malformed log digest', () => {
  let bundle = validBundle();
  bundle.semanticCheckResults[0].receipt.state = 'FAILED';
  assert.equal(validate(bundle).ok, false);

  bundle = validBundle();
  bundle.proofCells[0].logDigest = 'not-a-digest';
  assert.equal(validate(bundle).ok, false);
});

test('rejects missing or mismatched DCO signoff for every candidate commit', () => {
  let bundle = validBundle();
  bundle.dcoCommitEvidence[0].commitMessage = 'Candidate without signoff';
  assert.equal(validate(bundle).ok, false);

  bundle = validBundle();
  bundle.candidateCommitShas.push(SHA('7', 40));
  assert.equal(validate(bundle).ok, false);
});

test('accepts a reused proof cell only with exact currentness dependencies', () => {
  const bundle = validBundle();
  const cell = bundle.proofCells[0];
  cell.evidenceDisposition = 'REUSED';
  cell.transportState = 'NOT_RUN';
  cell.executed = false;
  cell.reuseDisposition = 'REUSE';
  cell.acceptedEvidenceRef = 'evidence.accepted.linux';
  cell.currentnessReceiptRef = 'receipt.ewa.currentness.linux';
  cell.currentnessReceiptDigest = SHA('c', 64);
  cell.dependencyBindings = [{
    sourceRef: 'source.example',
    expectedFingerprint: SHA('d', 64),
    observedFingerprint: SHA('d', 64)
  }];
  assert.equal(validate(bundle).ok, true);

  cell.dependencyBindings[0].observedFingerprint = SHA('e', 64);
  assert.equal(validate(bundle).ok, false);
});

test('rejects runner/provider unavailability represented as proof PASS', () => {
  const bundle = validBundle();
  const cell = bundle.proofCells[0];
  cell.transportState = 'NOT_ALLOCATED';
  cell.executed = false;
  assert.equal(validate(bundle).ok, false);
});

test('rejects validation bundles that grant lifecycle or source authority', () => {
  for (const field of ['executionAuthorityGranted', 'sourceMutationAuthorityGranted', 'reviewAuthorityGranted',
                       'approvalAuthorityGranted', 'readyAuthorityGranted', 'mergeAuthorityGranted']) {
    const bundle = validBundle();
    bundle[field] = true;
    assert.equal(validate(bundle).ok, false, field);
  }
});

// [VXG RealForever]
