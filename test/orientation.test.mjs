import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveFederatedOrientationProviderReceipt,
  deriveOrientationReceipt,
  FEDERATED_PROVIDER_QUESTION_CLASSES,
  resolveGitHubPullRequestCurrentWork
} from '../src/core/orientation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (script, args) => spawnSync(process.execPath, [`scripts/${script}`, ...args], { cwd: ROOT, encoding: 'utf8' });
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint/orientation.json'), 'utf8'));
const blueprint = {
  state: 'CURRENT',
  semanticHash: 'blueprint.fixture',
  sourceManifestState: 'CURRENT',
  sourceTreeSha256: 'tree.fixture',
  pathTopologyState: 'ROOT_RELATIVE',
  valid: true,
  sourceManifestCurrent: true,
  pathTopologyValid: true
};
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/orientation', `${name}.json`), 'utf8'));
const repositoryReceipt = (name, transform = null) => {
  const input = fixture(name);
  if (transform) transform(input);
  return deriveOrientationReceipt({ contract, ...input, blueprint });
};

test('orientation grounds live current PR inputs without stable correction defaults', () => {
  const result = run('orient.mjs', [
    '--visibility', 'PRIVATE',
    '--lifecycle', 'PRIVATE_STAGING',
    '--pr', '1',
    '--work-ref', 'work.vexlife.foundation.corrections',
    '--prior-reviewed-head', 'cadcbaf3dd6a2a4ad03cc6b692cedd24aae0ce5f'
  ]);
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.repository.slug, 'vgong24/VexLife');
  assert.equal(receipt.repository.visibility.value, 'PRIVATE');
  assert.equal(receipt.currentWork.prRef, 'github-pr.vgong24/VexLife.1');
  assert.equal(receipt.lifecycle.state, 'PRIVATE_STAGING');
  assert.equal(receipt.blueprint.pathTopologyState, 'ROOT_RELATIVE');
  assert.equal(receipt.blueprint.state, 'CURRENT');
  assert.ok(receipt.requiredSources.length > 0);
  assert.equal(receipt.stableRepositoryIdentity.activeBranch, undefined);
  assert.equal(receipt.stableRepositoryIdentity.activePr, undefined);
  assert.equal(receipt.stableRepositoryIdentity.priorReviewedHead, undefined);
});


test('source-managed GitHub PR evidence resolves one exact generic workRef and rejects duplication or binding mismatch', () => {
  const event = fixture('github-pr-current-work');
  const verified = resolveGitHubPullRequestCurrentWork({
    contract,
    eventName: 'pull_request',
    event,
    expectedPrNumber: 42,
    expectedCandidateHeadSha: '1'.repeat(40)
  });
  assert.equal(verified.state, 'VERIFIED');
  assert.equal(verified.source, 'GITHUB_PULL_REQUEST_EVENT');
  assert.equal(verified.workRef, 'work.vexlife.example-orientation.abc123');
  assert.equal(verified.repositoryVisibility, 'PRIVATE');

  const lowerCaseMarkerEvent = structuredClone(event);
  lowerCaseMarkerEvent.pull_request.body = lowerCaseMarkerEvent.pull_request.body.replace('Work:', 'work:');
  const lowerCaseMarker = resolveGitHubPullRequestCurrentWork({
    contract,
    eventName: 'pull_request',
    event: lowerCaseMarkerEvent
  });
  assert.equal(lowerCaseMarker.state, 'UNVERIFIED');
  assert.equal(lowerCaseMarker.workRef, null);
  assert.match(lowerCaseMarker.errors.join('\n'), /exactly one Work marker/);

  const duplicate = resolveGitHubPullRequestCurrentWork({
    contract,
    eventName: 'pull_request',
    event: fixture('github-pr-current-work-duplicate')
  });
  assert.equal(duplicate.state, 'UNVERIFIED');
  assert.equal(duplicate.workRef, null);
  assert.match(duplicate.errors.join('\n'), /exactly one Work marker/);

  const mismatched = resolveGitHubPullRequestCurrentWork({
    contract,
    eventName: 'pull_request',
    event,
    expectedPrNumber: 43,
    expectedCandidateHeadSha: '3'.repeat(40)
  });
  assert.equal(mismatched.state, 'UNVERIFIED');
  assert.equal(mismatched.workRef, null);
  assert.match(mismatched.errors.join('\n'), /number mismatch/);
  assert.match(mismatched.errors.join('\n'), /candidate head mismatch/);
});

test('orientation CLI consumes generic GitHub PR current-work evidence without issue, branch, or workRef defaults', () => {
  const environment = {
    ...process.env,
    VEXLIFE_CURRENT_WORK_EVENT_NAME: 'pull_request',
    VEXLIFE_CANDIDATE_HEAD_SHA: '1111111111111111111111111111111111111111'
  };
  for (const name of [
    'VEXLIFE_REPOSITORY_VISIBILITY',
    'VEXLIFE_PR_NUMBER',
    'VEXLIFE_WORK_REF',
    'VEXLIFE_CURRENT_WORK_PROJECTION'
  ]) delete environment[name];
  const result = spawnSync(process.execPath, ['scripts/orient.mjs', '--current-work-event', 'test/fixtures/orientation/github-pr-current-work.json'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: environment
  });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.currentWork.prRef, 'github-pr.vgong24/VexLife.42');
  assert.equal(receipt.currentWork.prSource, 'GITHUB_PULL_REQUEST_EVENT');
  assert.equal(receipt.currentWork.workRef, 'work.vexlife.example-orientation.abc123');
  assert.equal(receipt.currentWork.workSource, 'GITHUB_PULL_REQUEST_EVENT');
  assert.equal(receipt.currentWork.evidenceState, 'VERIFIED');
  assert.equal(receipt.attentions.includes('active PR workRef is UNKNOWN'), false);
});

test('orientation lifecycle fixtures cover current PR, detached merge, accepted main, and public active', () => {
  const cases = [
    ['current-pr', 'ACTIVE_PR', 'PRIVATE_STAGING'],
    ['detached-merge', 'ACTIVE_PR', 'PRIVATE_STAGING'],
    ['accepted-main', 'ACCEPTED_MAIN', 'PRIVATE_STAGING'],
    ['public-active', 'ACCEPTED_MAIN', 'PUBLIC_ACTIVE']
  ];
  for (const [name, currentWorkState, lifecycleState] of cases) {
    const input = fixture(name);
    const receipt = deriveOrientationReceipt({ contract, ...input, blueprint });
    assert.equal(receipt.state, 'GROUNDED', `${name}: ${receipt.attentions.join('; ')} ${receipt.blockers.join('; ')}`);
    assert.equal(receipt.currentWork.state, currentWorkState);
    assert.equal(receipt.lifecycle.state, lifecycleState);
  }
});

test('detached synthetic merge keeps candidate head, tested merge, and base distinct', () => {
  const input = fixture('detached-merge');
  const receipt = deriveOrientationReceipt({ contract, ...input, blueprint });
  assert.notEqual(receipt.git.candidateHeadSha, receipt.git.testedMergeSha);
  assert.notEqual(receipt.git.baseSha, receipt.git.testedMergeSha);
  assert.equal(receipt.git.candidateHeadShaSeparatedFromTestedMergeSha, true);
  assert.equal(receipt.git.checkoutKind, 'SYNTHETIC_MERGE');
});

test('missing lifecycle, visibility, and current work stay UNKNOWN instead of restoring history', () => {
  const input = fixture('current-pr');
  input.currentWork = {
    visibility: 'UNKNOWN',
    visibilitySource: 'UNKNOWN',
    prNumber: null,
    prSource: 'UNKNOWN',
    workRef: null,
    workSource: 'UNKNOWN',
    priorReviewedHead: null,
    commitsAbovePriorHead: null
  };
  input.lifecycle = { state: 'UNKNOWN', source: 'UNKNOWN' };
  const receipt = deriveOrientationReceipt({ contract, ...input, blueprint });
  assert.equal(receipt.state, 'ATTENTION');
  assert.equal(receipt.repository.visibility.value, 'UNKNOWN');
  assert.equal(receipt.lifecycle.state, 'UNKNOWN');
  assert.equal(receipt.currentWork.state, 'UNKNOWN');
});

test('PRIVATE-VEXLIFE-PROVIDER: accepted main maps to the canonical private provider without effect authority', () => {
  const source = repositoryReceipt('accepted-main');
  const receipt = deriveFederatedOrientationProviderReceipt({
    contract,
    orientationReceipt: source,
    observedAt: '2026-08-08T21:00:00Z'
  });

  assert.equal(receipt.schemaVersion, 'vextreme.orientation-provider-receipt/v1');
  assert.equal(receipt.providerRef, 'provider.vexlife.orientation');
  assert.equal(receipt.providerClass, 'PRIVATE_VEXLIFE');
  assert.equal(receipt.repositoryRef, 'vgong24/VexLife');
  assert.equal(receipt.visibility, 'PRIVATE');
  assert.equal(receipt.projectionScope, 'PRIVATE');
  assert.equal(receipt.currentState, 'CURRENT');
  assert.equal(receipt.publicationState.lifecycleState, 'PRIVATE');
  assert.equal(receipt.publicationState.publicationAuthority, false);
  assert.equal(receipt.authorityEnvelope.state, 'HELD');
  assert.deepEqual(receipt.authorityEnvelope.allowedEffectRefs, []);
  assert.deepEqual(receipt.privateStateRefs, ['state.private.vexlife.orientation']);
  assert.equal(receipt.relayState.executionState, 'TASK_STATE_UNKNOWN_DO_NOT_EXECUTE');
  assert.equal(receipt.questionCoverage.length, FEDERATED_PROVIDER_QUESTION_CLASSES.length);
  assert.ok(receipt.sourceRefs.includes(`github.commit.vexlife.${'4'.repeat(40)}`));
});

test('PRIVATE-VEXLIFE-PROVIDER: active PR preserves bounded work/current refs but does not invent claim authority', () => {
  const source = repositoryReceipt('current-pr');
  const receipt = deriveFederatedOrientationProviderReceipt({
    contract,
    orientationReceipt: source,
    observedAt: '2026-08-08T21:00:00Z'
  });

  assert.equal(receipt.currentState, 'CURRENT');
  assert.equal(receipt.current.currentWorkRef, 'work.vexlife.bounded-correction');
  assert.deepEqual(receipt.current.currentEntryRefs, ['github.pr.vexlife.7']);
  assert.deepEqual(receipt.current.currentAcceptedRefs, [`github.commit.vexlife.${'0'.repeat(40)}`]);
  assert.deepEqual(receipt.currentClaimRefs, []);
  assert.deepEqual(receipt.conflictingClaimRefs, []);
  assert.equal(receipt.authorityEnvelope.state, 'HELD');
});

test('PRIVATE-VEXLIFE-PROVIDER: unknown or attention source state fails closed without active capability', () => {
  const source = repositoryReceipt('current-pr', (input) => {
    input.currentWork.visibility = 'UNKNOWN';
    input.currentWork.visibilitySource = 'UNKNOWN';
    input.currentWork.prNumber = null;
    input.currentWork.workRef = null;
    input.lifecycle = { state: 'UNKNOWN', source: 'UNKNOWN' };
  });
  assert.equal(source.state, 'ATTENTION');

  const receipt = deriveFederatedOrientationProviderReceipt({
    contract,
    orientationReceipt: source,
    observedAt: '2026-08-08T21:00:00Z'
  });
  assert.equal(receipt.currentState, 'UNKNOWN');
  assert.equal(receipt.freshnessState.selectedSourceClass, 'UNKNOWN');
  assert.deepEqual(receipt.capabilityState.activeCapabilityRefs, []);
  assert.deepEqual(receipt.capabilityState.blockedCapabilityRefs, ['capability.vexlife.current-state-answer']);
  assert.equal(receipt.authorityEnvelope.state, 'HELD');
  assert.deepEqual(receipt.authorityEnvelope.allowedEffectRefs, []);
  assert.equal(receipt.exactNextActionRef, 'action.vexlife.orientation.refresh-current-state');
});

test('PRIVATE-VEXLIFE-PROVIDER: future-public intent is represented without public visibility or publication authority', () => {
  const source = repositoryReceipt('accepted-main', (input) => {
    input.lifecycle = { state: 'PUBLIC_RELEASE_CANDIDATE', source: 'ENVIRONMENT_RECEIPT' };
  });
  assert.equal(source.state, 'GROUNDED');

  const receipt = deriveFederatedOrientationProviderReceipt({
    contract,
    orientationReceipt: source,
    observedAt: '2026-08-08T21:00:00Z'
  });
  assert.equal(receipt.currentState, 'CURRENT');
  assert.equal(receipt.visibility, 'PRIVATE');
  assert.equal(receipt.projectionScope, 'PRIVATE');
  assert.equal(receipt.publicationState.lifecycleState, 'FUTURE_PUBLIC_INTENT');
  assert.equal(receipt.publicationState.futurePublicIntentSourceRefOrNull, 'source.vexlife.future-public-intent');
  assert.equal(receipt.publicationState.publicationAuthority, false);
});

test('PRIVATE-VEXLIFE-PROVIDER: output stays content-absent and ignores private bodies, paths, and prose on the source receipt', () => {
  const source = repositoryReceipt('accepted-main');
  source.secretPayload = 'do-not-copy-this-private-body';
  source.privateJournalBody = 'private-memory-body';
  const receipt = deriveFederatedOrientationProviderReceipt({
    contract,
    orientationReceipt: source,
    observedAt: '2026-08-08T21:00:00Z'
  });
  const text = JSON.stringify(receipt);
  assert.doesNotMatch(text, /do-not-copy-this-private-body|private-memory-body/);
  assert.doesNotMatch(text, /https:\/\/github\.com\/vgong24\/VexLife\.git/);
  assert.doesNotMatch(text, /docs\/CULTURE\.md|npm run atlas:query/);
  assert.doesNotMatch(text, /Do not merge, publish/);
});

test('PRIVATE-VEXLIFE-PROVIDER: equal source receipt plus explicit observedAt is deterministic and input-preserving', () => {
  const source = repositoryReceipt('accepted-main');
  const before = JSON.stringify(source);
  const first = deriveFederatedOrientationProviderReceipt({
    contract,
    orientationReceipt: source,
    observedAt: '2026-08-08T21:00:00Z'
  });
  const second = deriveFederatedOrientationProviderReceipt({
    contract,
    orientationReceipt: structuredClone(source),
    observedAt: '2026-08-08T21:00:00Z'
  });
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(source), before);
});

test('PRIVATE-VEXLIFE-PROVIDER: malformed contract, repository identity, or observedAt fails closed', () => {
  const source = repositoryReceipt('accepted-main');
  const wrongRepo = structuredClone(source);
  wrongRepo.repository.slug = 'example.invalid/repository';
  assert.throws(() => deriveFederatedOrientationProviderReceipt({
    contract,
    orientationReceipt: wrongRepo,
    observedAt: '2026-08-08T21:00:00Z'
  }), /repository identity mismatch/);

  const wrongProvider = structuredClone(contract);
  wrongProvider.federatedProvider.publicationAuthority = true;
  assert.throws(() => deriveFederatedOrientationProviderReceipt({
    contract: wrongProvider,
    orientationReceipt: source,
    observedAt: '2026-08-08T21:00:00Z'
  }), /publicationAuthority is invalid/);

  assert.throws(() => deriveFederatedOrientationProviderReceipt({
    contract,
    orientationReceipt: source,
    observedAt: 'not-a-time'
  }), /explicit valid UTC timestamp/);
});

test('PRIVATE-VEXLIFE-PROVIDER: existing orient CLI default remains repository receipt and provider mode is opt-in', () => {
  const repository = run('orient.mjs', [
    '--visibility', 'PRIVATE',
    '--lifecycle', 'PRIVATE_STAGING'
  ]);
  assert.equal(repository.status, 0, repository.stderr);
  assert.equal(JSON.parse(repository.stdout).schemaVersion, 'vexlife.orientation-receipt/v1');

  const provider = run('orient.mjs', [
    '--visibility', 'PRIVATE',
    '--lifecycle', 'PRIVATE_STAGING',
    '--receipt-kind', 'provider',
    '--observed-at', '2026-08-08T21:00:00Z'
  ]);
  assert.equal(provider.status, 0, provider.stderr);
  const receipt = JSON.parse(provider.stdout);
  assert.equal(receipt.schemaVersion, 'vextreme.orientation-provider-receipt/v1');
  assert.equal(receipt.providerClass, 'PRIVATE_VEXLIFE');
  assert.equal(receipt.publicationState.publicationAuthority, false);
});

test('PRIVATE-VEXLIFE-PROVIDER: provider CLI mode requires an explicit observation timestamp', () => {
  const result = run('orient.mjs', [
    '--visibility', 'PRIVATE',
    '--lifecycle', 'PRIVATE_STAGING',
    '--receipt-kind', 'provider'
  ]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--observed-at is required/);
});

test('Atlas query enforces bounded traversal and returns coverage', () => {
  const result = run('atlas-query.mjs', ['--intent', 'repository health', '--depth', '1', '--limit', '4', '--tokens', '800']);
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.state, 'BOUNDED_RESULTS');
  assert.ok(receipt.results.length <= 4);
  assert.equal(receipt.coverage.depthLimit, 1);
  assert.equal(receipt.coverage.resultLimit, 4);
  assert.equal(receipt.coverage.tokenBudget, 800);
});

test('module description resolves one exact module and rejects broad requests', () => {
  const exact = run('module-describe.mjs', ['--module-ref', 'module.vexlife.core.atlas']);
  assert.equal(exact.status, 0, exact.stderr);
  const receipt = JSON.parse(exact.stdout);
  assert.equal(receipt.state, 'BOUNDED_MODULE');
  assert.equal(receipt.path, 'src/core/atlas.mjs');
  const broad = run('module-describe.mjs', ['--module-ref', '*']);
  assert.equal(broad.status, 1);
  assert.match(broad.stderr, /BLOCKED_UNKNOWN_MODULE/);
});

// [VXG RealForever]
