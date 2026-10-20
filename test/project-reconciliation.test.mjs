import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import {
  computeValidationEvidenceFingerprint,
} from '../src/core/build-health.mjs';
import {
  PROJECT_EVIDENCE_RELATION_SCHEMA,
  PROJECT_PROVIDER_OBSERVATION_SCHEMA,
  createProjectEvidenceRelation,
  createProjectProviderObservation,
  reconcileProjectEvidence,
  validateProjectReconciliationRegistry,
} from '../src/core/project-reconciliation.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const readJson = (relative) => JSON.parse(fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8'));
const registry = readJson('blueprint/project-reconciliation-registry.json');

const PROJECT = 'project.vexlife.reconciliation.fixture';
const WORK = 'work.vexlife.reconciliation.fixture';
const WORK_REF = 'work.vexlife.tocompletion.p0b.project-reconciliation-b04.20261019a';
const REPOSITORY = 'vgong24/VexLife';
const BASE = '1'.repeat(40);
const HEAD = '2'.repeat(40);
const TREE = '3'.repeat(40);
const MERGE = '4'.repeat(40);
const SOURCE_TREE = '5'.repeat(64);
const ts = (minute) => `2026-10-20T05:${String(minute).padStart(2, '0')}:00.000Z`;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function artifact(ref, content) {
  return { ref, sha256: sha256(content), content, encoding: 'UTF8' };
}

function policyFixture() {
  return {
    schemaVersion: 'vexlife.validation-evidence-policy/v1',
    policyRef: 'policy.vexlife.validation.fixture',
    policyVersion: 1,
    evidenceSchemaVersion: 'vexlife.validation-evidence-bundle/v1',
    semanticProofOwnerRef: 'registry.vexlife.build-health.001',
    producerProfiles: {
      GITHUB_HOSTED: {
        producerProfileRef: 'producer-profile.github-hosted.fixture',
        producerClass: 'GITHUB_HOSTED',
      },
      ONE_SHOT_LOCAL: {
        producerProfileRef: 'producer-profile.one-shot-local.fixture',
        producerClass: 'ONE_SHOT_LOCAL',
      },
    },
    requiredProofCells: [{
      proofCellRef: 'FIXTURE_EXACT_PROOF',
      requiredPlatformId: null,
      reuseAllowed: false,
    }],
  };
}

function validationBundle(policy = policyFixture(), {
  baseSha = BASE,
  headSha = HEAD,
  treeSha = TREE,
  sourceTreeSha256 = SOURCE_TREE,
} = {}) {
  const receiptRef = 'receipt.fixture.exact-proof';
  const logRef = 'log.fixture.exact-proof';
  const qualificationRef = 'receipt.qualification.local.fixture';
  const formedAt = ts(1);
  const observedAt = ts(2);
  const target = {
    repositoryRef: REPOSITORY,
    baseSha,
    candidateHeadSha: headSha,
    candidateTreeSha: treeSha,
    sourceTreeSha256,
  };
  const result = {
    proofCellRef: 'FIXTURE_EXACT_PROOF',
    transportState: 'EXECUTED',
    semanticState: 'PASSED',
    executed: true,
    exitCode: 0,
    currentness: 'CURRENT',
    platformId: 'macos',
    receiptRefs: [receiptRef],
    logRefs: [logRef],
    statusContext: null,
    binding: target,
  };
  const bundle = {
    schemaVersion: 'vexlife.validation-evidence-bundle/v1',
    validationEvidenceRef: 'validation-evidence.project-reconciliation.fixture',
    validationProfileRef: policy.policyRef,
    validationProfileVersion: policy.policyVersion,
    repositoryRef: REPOSITORY,
    baseSha,
    candidateHeadSha: headSha,
    candidateTreeSha: treeSha,
    observedHeadSha: headSha,
    testedCheckoutSha: headSha,
    testedMergeSha: null,
    sourceTreeSha256,
    candidateCommits: [{
      commitSha: headSha,
      authorName: 'VexGPT',
      authorEmail: 'victor.gong@vextreme24.com',
    }],
    dcoCommitEvidence: [{
      commitSha: headSha,
      inspected: true,
      state: 'PASSED',
      authorName: 'VexGPT',
      authorEmail: 'victor.gong@vextreme24.com',
      signoffName: 'VexGPT',
      signoffEmail: 'victor.gong@vextreme24.com',
    }],
    producerAttestations: [{
      producerProfileRef: policy.producerProfiles.ONE_SHOT_LOCAL.producerProfileRef,
      producerClass: 'ONE_SHOT_LOCAL',
      providerIdentityRef: 'provider.local.macos.fixture',
      platformId: 'macos',
      architecture: 'arm64',
      runtimeVersions: { node: process.version },
      qualificationEvidenceRefs: ['qualification.local.fixture.current'],
      qualificationReceiptRef: qualificationRef,
      qualificationReceiptDigest: sha256(`payload:${qualificationRef}`),
      qualification: {
        providerIdentityRef: 'provider.local.macos.fixture',
        platformId: 'macos',
        currentness: 'CURRENT',
        observedAt: formedAt,
        expiresAt: null,
      },
      statusContext: null,
      commandResults: [result],
    }],
    receiptRefs: [receiptRef, qualificationRef],
    receiptDigests: [
      artifact(receiptRef, `payload:${receiptRef}`),
      artifact(qualificationRef, `payload:${qualificationRef}`),
    ],
    logDigests: [artifact(logRef, `log:${logRef}`)],
    dependencyBindings: [],
    currentness: 'CURRENT',
    formedAt,
    observedAt,
  };
  bundle.semanticFingerprint = computeValidationEvidenceFingerprint(bundle);
  return bundle;
}

function projectSnapshot(state = 'VERIFYING') {
  const core = {
    schemaVersion: 'vexlife.project-continuity-snapshot/v1',
    state: 'CURRENT',
    currentness: 'CURRENT',
    projectRef: PROJECT,
    projectDefinitionFingerprint: '6'.repeat(64),
    graphBindings: [],
    cards: [{
      graphRef: 'intent-workgraph.reconciliation.fixture',
      rootIntentRef: 'intent.reconciliation.fixture',
      workNodeRef: WORK,
      purpose: 'Exercise project reconciliation',
      state,
      priorityClass: 'NORMAL',
      roleRef: 'role.vex.coder',
      parentWorkNodeRef: null,
      dependencyRefs: [],
      childRefs: [],
      featureRefs: [],
      completionGateRefs: [],
      sourceRefs: ['source.fixture'],
      createdAt: ts(0),
      lastTransitionRef: null,
      lastTransitionAt: null,
      currentReceiptRefs: [],
      assignment: null,
    }],
    edges: [],
    sourceRefs: ['github.issue.vexlife.866'],
    effects: false,
    executionAuthority: 'NONE',
  };
  return { ...core, semanticFingerprint: semanticHash(core) };
}

function relation(policy = policyFixture()) {
  return {
    schemaVersion: PROJECT_EVIDENCE_RELATION_SCHEMA,
    relationRef: 'relation.project.reconciliation.fixture',
    projectRef: PROJECT,
    workNodeRef: WORK,
    repositoryRef: REPOSITORY,
    workRef: WORK_REF,
    validationProfileRef: policy.policyRef,
    sourceRefs: ['github.issue.vexlife.866'],
    formedAt: ts(0),
  };
}

function orientationOpen({ head = HEAD, tree = TREE, base = BASE, workRef = WORK_REF } = {}) {
  return {
    schemaVersion: 'vexlife.orientation-receipt/v1',
    orientationRef: 'orientation.vexlife.dedicated-repository.001',
    state: 'GROUNDED',
    currentness: 'CURRENT',
    repository: { slug: REPOSITORY },
    git: {
      candidateHeadSha: head,
      candidateTreeSha: tree,
      baseSha: base,
    },
    currentWork: {
      state: 'ACTIVE_PR',
      workRef,
      prRef: 'github-pr.vgong24/VexLife.910',
    },
    blueprint: { sourceTreeSha256: SOURCE_TREE },
    sourceRefs: ['source.vexlife.orientation-contract'],
  };
}

function orientationMerged(currentMainSha = MERGE) {
  return {
    schemaVersion: 'vexlife.orientation-receipt/v1',
    orientationRef: 'orientation.vexlife.dedicated-repository.001',
    state: 'GROUNDED',
    currentness: 'CURRENT',
    repository: { slug: REPOSITORY },
    git: {
      candidateHeadSha: currentMainSha,
      candidateTreeSha: TREE,
      baseSha: HEAD,
    },
    currentWork: {
      state: 'ACCEPTED_MAIN',
      workRef: null,
      prRef: null,
    },
    blueprint: { sourceTreeSha256: SOURCE_TREE },
    sourceRefs: ['source.vexlife.orientation-contract'],
  };
}

function providerOpen({
  head = HEAD,
  tree = TREE,
  checksState = 'SUCCESS',
} = {}) {
  return {
    schemaVersion: PROJECT_PROVIDER_OBSERVATION_SCHEMA,
    observationRef: 'observation.provider.pr910.open',
    repositoryRef: REPOSITORY,
    workRef: WORK_REF,
    pullRequestNumberOrNull: 910,
    providerState: 'OPEN',
    baseShaOrNull: BASE,
    headShaOrNull: head,
    headTreeShaOrNull: tree,
    candidateSourceTreeSha256OrNull: SOURCE_TREE,
    mergeCommitShaOrNull: null,
    mergeTreeShaOrNull: null,
    currentMainShaOrNull: null,
    mergeCommitReachableFromMain: false,
    checksState,
    observedAt: ts(3),
    sourceRefs: ['github.pull.vexlife.910'],
  };
}

function providerMerged({ mergeTree = TREE, reachable = true, checksState = 'SUCCESS' } = {}) {
  return {
    schemaVersion: PROJECT_PROVIDER_OBSERVATION_SCHEMA,
    observationRef: 'observation.provider.pr910.merged',
    repositoryRef: REPOSITORY,
    workRef: WORK_REF,
    pullRequestNumberOrNull: 910,
    providerState: 'MERGED',
    baseShaOrNull: BASE,
    headShaOrNull: HEAD,
    headTreeShaOrNull: TREE,
    candidateSourceTreeSha256OrNull: SOURCE_TREE,
    mergeCommitShaOrNull: MERGE,
    mergeTreeShaOrNull: mergeTree,
    currentMainShaOrNull: MERGE,
    mergeCommitReachableFromMain: reachable,
    checksState,
    observedAt: ts(4),
    sourceRefs: ['github.pull.vexlife.910', 'github.commit.vexlife.fixture-merge'],
  };
}

const intentRegistry = {
  allowedTransitions: {
    VERIFYING: ['COMPLETED'],
    RUNNING: ['VERIFYING'],
  },
};

test('project reconciliation registry preserves the bounded B04 vocabulary', () => {
  const result = validateProjectReconciliationRegistry(registry);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.deepEqual(registry.dispositions, [
    'CURRENT_IN_REVIEW',
    'REVERIFY_REQUIRED',
    'COMPLETION_EVIDENCE_READY',
    'HELD_UNKNOWN',
  ]);
});

test('relation and provider observations are content-addressed without granting authority', () => {
  const policy = policyFixture();
  const rel = createProjectEvidenceRelation(relation(policy), registry);
  const provider = createProjectProviderObservation(providerOpen(), registry);
  assert.match(rel.semanticFingerprint, /^[a-f0-9]{64}$/u);
  assert.match(provider.semanticFingerprint, /^[a-f0-9]{64}$/u);
  assert.throws(() => createProjectEvidenceRelation({ ...relation(policy), semanticFingerprint: '0'.repeat(64) }, registry), /semanticFingerprint mismatch/);
  assert.throws(() => createProjectProviderObservation({ ...providerOpen(), semanticFingerprint: '0'.repeat(64) }, registry), /semanticFingerprint mismatch/);
});

test('exact open provider + exact current Build Health proof reconciles to CURRENT_IN_REVIEW', () => {
  const policy = policyFixture();
  const result = reconcileProjectEvidence({
    registry,
    projectSnapshot: projectSnapshot('RUNNING'),
    relation: relation(policy),
    orientationReceipt: orientationOpen(),
    validationEvidenceBundle: validationBundle(policy),
    validationEvidencePolicy: policy,
    providerObservation: providerOpen({ checksState: 'SUCCESS' }),
    intentRegistry,
  });
  assert.equal(result.state, 'CURRENT_IN_REVIEW');
  assert.equal(result.proofState, 'CURRENT');
  assert.equal(result.providerChecksState, 'SUCCESS');
  assert.equal(result.completionEvidenceState, 'NOT_EARNED');
  assert.equal(result.proposedLifecycleTransitionOrNull, null);
  assert.equal(result.effects, false);
  assert.equal(result.executionAuthority, 'NONE');
  assert.equal(result.transitionAuthority, 'NONE');
});

test('a moved provider head forces REVERIFY_REQUIRED even when a prior proof bundle is internally green', () => {
  const policy = policyFixture();
  const movedHead = '7'.repeat(40);
  const result = reconcileProjectEvidence({
    registry,
    projectSnapshot: projectSnapshot('VERIFYING'),
    relation: relation(policy),
    orientationReceipt: orientationOpen({ head: movedHead }),
    validationEvidenceBundle: validationBundle(policy),
    validationEvidencePolicy: policy,
    providerObservation: providerOpen({ head: movedHead }),
    intentRegistry,
  });
  assert.equal(result.state, 'REVERIFY_REQUIRED');
  assert.equal(result.completionEvidenceState, 'NOT_EARNED');
  assert.ok(result.attentionRefs.includes('attention.project.proof-reverification-required'));
  assert.equal(result.proposedLifecycleTransitionOrNull, null);
});

test('provider check success cannot substitute for missing canonical Build Health proof', () => {
  const policy = policyFixture();
  const result = reconcileProjectEvidence({
    registry,
    projectSnapshot: projectSnapshot('VERIFYING'),
    relation: relation(policy),
    orientationReceipt: orientationOpen(),
    validationEvidenceBundle: null,
    validationEvidencePolicy: policy,
    providerObservation: providerOpen({ checksState: 'SUCCESS' }),
    intentRegistry,
  });
  assert.equal(result.state, 'REVERIFY_REQUIRED');
  assert.equal(result.providerChecksState, 'SUCCESS');
  assert.equal(result.proofState, 'REVERIFY_REQUIRED');
  assert.equal(result.completionEvidenceState, 'NOT_EARNED');
});

test('exact merged tree + reachable main + current proof earns completion evidence but no transition authority', () => {
  const policy = policyFixture();
  const result = reconcileProjectEvidence({
    registry,
    projectSnapshot: projectSnapshot('VERIFYING'),
    relation: relation(policy),
    orientationReceipt: orientationMerged(),
    validationEvidenceBundle: validationBundle(policy),
    validationEvidencePolicy: policy,
    providerObservation: providerMerged(),
    intentRegistry,
  });
  assert.equal(result.state, 'COMPLETION_EVIDENCE_READY');
  assert.equal(result.completionEvidenceState, 'EARNED');
  assert.deepEqual(result.proposedLifecycleTransitionOrNull, {
    workNodeRef: WORK,
    priorState: 'VERIFYING',
    nextState: 'COMPLETED',
    basis: 'COMPLETION_EVIDENCE_READY',
    transitionAuthority: 'NONE',
  });
  assert.equal(result.transitionAuthority, 'NONE');
  assert.equal(result.effects, false);
});

test('merged provider state with a different merge tree requires reverification', () => {
  const policy = policyFixture();
  const result = reconcileProjectEvidence({
    registry,
    projectSnapshot: projectSnapshot('VERIFYING'),
    relation: relation(policy),
    orientationReceipt: orientationMerged(),
    validationEvidenceBundle: validationBundle(policy),
    validationEvidencePolicy: policy,
    providerObservation: providerMerged({ mergeTree: '8'.repeat(40) }),
    intentRegistry,
  });
  assert.equal(result.state, 'REVERIFY_REQUIRED');
  assert.ok(result.attentionRefs.includes('attention.project.post-merge-tree-not-exact'));
  assert.equal(result.completionEvidenceState, 'NOT_EARNED');
});

test('unknown provider state remains HELD_UNKNOWN and never manufactures work truth', () => {
  const policy = policyFixture();
  const provider = {
    schemaVersion: PROJECT_PROVIDER_OBSERVATION_SCHEMA,
    observationRef: 'observation.provider.unknown',
    repositoryRef: REPOSITORY,
    workRef: WORK_REF,
    pullRequestNumberOrNull: null,
    providerState: 'UNKNOWN',
    baseShaOrNull: null,
    headShaOrNull: null,
    headTreeShaOrNull: null,
    candidateSourceTreeSha256OrNull: null,
    mergeCommitShaOrNull: null,
    mergeTreeShaOrNull: null,
    currentMainShaOrNull: null,
    mergeCommitReachableFromMain: false,
    checksState: 'UNKNOWN',
    observedAt: ts(5),
    sourceRefs: ['source.provider.unknown'],
  };
  const result = reconcileProjectEvidence({
    registry,
    projectSnapshot: projectSnapshot('VERIFYING'),
    relation: relation(policy),
    orientationReceipt: orientationOpen(),
    validationEvidenceBundle: validationBundle(policy),
    validationEvidencePolicy: policy,
    providerObservation: provider,
    intentRegistry,
  });
  assert.equal(result.state, 'HELD_UNKNOWN');
  assert.equal(result.currentness, 'UNKNOWN');
  assert.equal(result.proposedLifecycleTransitionOrNull, null);
  assert.equal(result.effects, false);
});

// [VXG RealForever]
