#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { validateImplementationPlan } from '../src/core/implementation-plan.mjs';
import { deriveOrientationReceipt, resolveGitHubPullRequestCurrentWork } from '../src/core/orientation.mjs';
import { collectRepositoryEvidence } from '../src/core/repository-evidence.mjs';
import { buildSourceManifest, compareSourceManifest } from '../src/core/source-manifest.mjs';
import { readJson } from '../src/core/utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const allowedArgs = new Set([
  '--visibility', '--lifecycle', '--pr', '--work-ref', '--prior-reviewed-head',
  '--candidate-head', '--tested-merge', '--base-sha', '--current-work', '--current-work-event'
]);
for (let index = 0; index < args.length; index += 2) {
  if (!allowedArgs.has(args[index]) || !args[index + 1]) {
    console.error('Usage: npm run orient -- [--visibility PRIVATE|PUBLIC] [--lifecycle PRIVATE_STAGING|PUBLIC_RELEASE_CANDIDATE|PUBLIC_ACTIVE] [--pr <number>] [--work-ref <work.ref>] [--prior-reviewed-head <sha>] [--candidate-head <sha>] [--tested-merge <sha>] [--base-sha <sha>] [--current-work <projection.json>] [--current-work-event <github-event.json>]');
    process.exit(2);
  }
}
const value = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const sourceOf = (argument, environment, projection, githubEvent = false) => argument
  ? 'COMMAND_ARGUMENT'
  : environment
    ? 'ENVIRONMENT_RECEIPT'
    : projection
      ? 'CURRENT_WORK_PROJECTION'
      : githubEvent
        ? 'GITHUB_PULL_REQUEST_EVENT'
        : 'UNKNOWN';
const git = (...gitArgs) => {
  const result = spawnSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
};

const contract = readJson(path.join(ROOT, 'blueprint/orientation.json'));
const projectionPath = value('--current-work') || process.env.VEXLIFE_CURRENT_WORK_PROJECTION;
const projection = projectionPath ? readJson(path.resolve(ROOT, projectionPath)) : {};
const eventPathArgument = value('--current-work-event');
const eventPathEnvironment = process.env.VEXLIFE_CURRENT_WORK_EVENT_PATH || process.env.GITHUB_EVENT_PATH;
const eventPath = eventPathArgument || eventPathEnvironment || null;
const eventName = process.env.VEXLIFE_CURRENT_WORK_EVENT_NAME || process.env.GITHUB_EVENT_NAME || null;
let githubEvent = null;
let githubEventReadError = null;
if (eventPath) {
  try {
    githubEvent = readJson(path.resolve(ROOT, eventPath));
  } catch (error) {
    githubEventReadError = `GitHub current-work event is unreadable: ${error.message}`;
  }
}
const bundle = loadBlueprint(ROOT);
const validation = validateBlueprint(bundle);
const implementationPlan = validateImplementationPlan(bundle.implementationPlan);
const expectedManifest = readJson(path.join(ROOT, 'SOURCE-MANIFEST.json'));
const actualManifest = buildSourceManifest(ROOT);
const manifest = compareSourceManifest(expectedManifest, actualManifest);
const evidence = collectRepositoryEvidence(ROOT);
const prArgument = value('--pr');
const prEnvironment = process.env.VEXLIFE_PR_NUMBER;
const prProjection = projection.prNumber;
const candidateArgument = value('--candidate-head');
const candidateEnvironment = process.env.VEXLIFE_CANDIDATE_HEAD_SHA;
const candidateProjection = projection.candidateHeadSha;
const githubCurrentWork = resolveGitHubPullRequestCurrentWork({
  contract,
  eventName,
  event: githubEvent,
  expectedPrNumber: Number(prArgument || prEnvironment || prProjection || 0) || null,
  expectedCandidateHeadSha: candidateArgument || candidateEnvironment || candidateProjection || null
});
if (githubEventReadError && eventName === 'pull_request') githubCurrentWork.errors.unshift(githubEventReadError);
if (githubEventReadError && eventName === 'pull_request') {
  githubCurrentWork.state = 'UNVERIFIED';
  githubCurrentWork.source = 'UNKNOWN';
  githubCurrentWork.workRef = null;
}

evidence.git.candidateHeadSha = candidateArgument || candidateEnvironment || candidateProjection || githubCurrentWork.candidateHeadSha || evidence.git.candidateHeadSha;
evidence.git.testedMergeSha = value('--tested-merge') || process.env.VEXLIFE_TESTED_MERGE_SHA || projection.testedMergeSha || evidence.git.testedMergeSha;
evidence.git.baseSha = value('--base-sha') || process.env.VEXLIFE_BASE_SHA || projection.baseSha || githubCurrentWork.baseSha || evidence.git.baseSha;

const visibilityArgument = value('--visibility');
const visibilityEnvironment = process.env.VEXLIFE_REPOSITORY_VISIBILITY;
const visibilityProjection = projection.repositoryVisibility;
const visibilityEvent = githubCurrentWork.repositoryVisibility;
const visibility = String(visibilityArgument || visibilityEnvironment || visibilityProjection || visibilityEvent || 'UNKNOWN').toUpperCase();
const lifecycleArgument = value('--lifecycle');
const lifecycleEnvironment = process.env.VEXLIFE_LIFECYCLE_STATE;
const lifecycleProjection = projection.lifecycleState;
const inferredLifecycle = visibility === 'PRIVATE' ? 'PRIVATE_STAGING' : visibility === 'PUBLIC' ? 'PUBLIC_ACTIVE' : 'UNKNOWN';
const lifecycleState = String(lifecycleArgument || lifecycleEnvironment || lifecycleProjection || inferredLifecycle).toUpperCase();
const prEvent = githubCurrentWork.state === 'VERIFIED' ? githubCurrentWork.prNumber : null;
const prValue = prArgument || prEnvironment || prProjection || prEvent || null;
const prNumber = prValue === null || prValue === '' ? null : Number(prValue);
const workArgument = value('--work-ref');
const workEnvironment = process.env.VEXLIFE_WORK_REF;
const workProjection = projection.workRef;
const workEvent = githubCurrentWork.state === 'VERIFIED' ? githubCurrentWork.workRef : null;
const workRef = workArgument || workEnvironment || workProjection || workEvent || null;
const workEventSelected = !workArgument && !workEnvironment && !workProjection && Boolean(eventPath);
const currentWorkAttentions = workEventSelected && githubCurrentWork.state === 'UNVERIFIED'
  ? githubCurrentWork.errors.map((error) => `active PR workRef evidence is unverified: ${error}`)
  : [];
const priorArgument = value('--prior-reviewed-head');
const priorEnvironment = process.env.VEXLIFE_PRIOR_REVIEWED_HEAD;
const priorProjection = projection.priorReviewedHead;
const priorReviewedHead = priorArgument || priorEnvironment || priorProjection || null;
const commitCount = priorReviewedHead ? git('rev-list', '--count', `${priorReviewedHead}..${evidence.git.candidateHeadSha}`) : null;

const receipt = deriveOrientationReceipt({
  contract,
  evidence,
  currentWork: {
    visibility,
    visibilitySource: sourceOf(visibilityArgument, visibilityEnvironment, visibilityProjection, Boolean(visibilityEvent)),
    prNumber: Number.isInteger(prNumber) && prNumber > 0 ? prNumber : null,
    prSource: sourceOf(prArgument, prEnvironment, prProjection, Boolean(prEvent)),
    workRef,
    workSource: sourceOf(workArgument, workEnvironment, workProjection, Boolean(workEvent)),
    evidenceState: workEventSelected ? githubCurrentWork.state : null,
    evidenceSchemaVersion: workEventSelected ? githubCurrentWork.schemaVersion ?? null : null,
    attentions: currentWorkAttentions,
    priorReviewedHead,
    commitsAbovePriorHead: commitCount === null ? null : Number(commitCount)
  },
  lifecycle: {
    state: lifecycleState,
    source: sourceOf(lifecycleArgument, lifecycleEnvironment, lifecycleProjection) === 'UNKNOWN'
      ? visibility === 'UNKNOWN' ? 'UNKNOWN' : 'INFERRED_FROM_LIVE_VISIBILITY'
      : sourceOf(lifecycleArgument, lifecycleEnvironment, lifecycleProjection)
  },
  blueprint: {
    state: validation.ok ? 'CURRENT' : 'INVALID',
    semanticHash: validation.semanticHash,
    sourceManifestState: manifest.ok ? 'CURRENT' : 'DRIFT',
    sourceTreeSha256: actualManifest.treeSha256,
    pathTopologyState: implementationPlan.ok ? 'ROOT_RELATIVE' : 'INVALID',
    valid: validation.ok,
    sourceManifestCurrent: manifest.ok,
    pathTopologyValid: implementationPlan.ok
  }
});
console.log(JSON.stringify(receipt, null, 2));
if (receipt.state === 'BLOCKED') process.exitCode = 1;

// [VXG RealForever]
