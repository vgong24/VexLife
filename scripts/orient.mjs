#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { compactCurrentProjection } from '../src/core/build-health.mjs';
import { validateImplementationPlan } from '../src/core/implementation-plan.mjs';
import { buildSourceManifest, compareSourceManifest } from '../src/core/source-manifest.mjs';
import { readJson } from '../src/core/utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const allowedArgs = new Set(['--visibility', '--pr', '--work-ref']);
for (let index = 0; index < args.length; index += 2) {
  if (!allowedArgs.has(args[index]) || !args[index + 1]) {
    console.error('Usage: npm run orient -- [--visibility PRIVATE] [--pr 1] [--work-ref work.ref]');
    process.exit(2);
  }
}
const value = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const git = (...gitArgs) => {
  const result = spawnSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
};

const contract = readJson(path.join(ROOT, 'blueprint/orientation.json'));
const bundle = loadBlueprint(ROOT);
const blueprint = validateBlueprint(bundle);
const implementationPlan = validateImplementationPlan(bundle.implementationPlan);
const expectedManifest = readJson(path.join(ROOT, 'SOURCE-MANIFEST.json'));
const actualManifest = buildSourceManifest(ROOT);
const manifest = compareSourceManifest(expectedManifest, actualManifest);
const current = compactCurrentProjection(bundle, blueprint);
const localBranch = git('branch', '--show-current');
const branch = localBranch || process.env.VEXLIFE_BRANCH || null;
const branchSource = localBranch ? 'GIT_WORKTREE' : process.env.VEXLIFE_BRANCH ? 'ENVIRONMENT_RECEIPT' : 'UNKNOWN';
const headSha = git('rev-parse', 'HEAD');
const upstreamRef = git('rev-parse', '--abbrev-ref', '@{upstream}');
const upstreamSha = upstreamRef ? git('rev-parse', '@{upstream}') : null;
const relationText = upstreamRef ? git('rev-list', '--left-right', '--count', `HEAD...${upstreamRef}`) : null;
const [ahead, behind] = relationText ? relationText.split(/\s+/).map(Number) : [null, null];
const statusLines = (git('status', '--porcelain=v1') || '').split(/\r?\n/).filter(Boolean);
const remoteUrl = git('remote', 'get-url', 'origin');
const remoteSlug = remoteUrl?.replace(/^.*github\.com[/:]/, '').replace(/\.git$/, '') ?? null;
const visibilityArgument = value('--visibility');
const visibilityEnvironment = process.env.VEXLIFE_REPOSITORY_VISIBILITY;
const visibility = String(visibilityArgument || visibilityEnvironment || contract.requiredVisibility).toUpperCase();
const prArgument = value('--pr');
const prEnvironment = process.env.VEXLIFE_PR_NUMBER;
const pr = Number(prArgument || prEnvironment || String(contract.activePr));
const workArgument = value('--work-ref');
const workEnvironment = process.env.VEXLIFE_WORK_REF;
const workRef = workArgument || workEnvironment || contract.currentWorkRef;
const commitsAbovePriorHeadText = headSha ? git('rev-list', '--count', `${contract.priorReviewedHead}..HEAD`) : null;
const commitsAbovePriorHead = commitsAbovePriorHeadText === null ? null : Number(commitsAbovePriorHeadText);

const blockers = [];
if (remoteSlug !== contract.repositorySlug) blockers.push(`remote repository mismatch: ${remoteSlug ?? 'UNKNOWN'}`);
if (visibility !== contract.requiredVisibility) blockers.push(`repository visibility must remain ${contract.requiredVisibility}`);
if (!blueprint.ok) blockers.push('blueprint validation failed');
if (!implementationPlan.ok) blockers.push('implementation path topology is invalid');
if (!manifest.ok) blockers.push('source manifest is stale');
const attentions = [];
if (branch !== contract.activeBranch) attentions.push(`active work branch is ${branch ?? 'UNKNOWN'}; declared correction branch is ${contract.activeBranch}`);
if (statusLines.length) attentions.push('working tree contains uncommitted changes');
if (!upstreamRef) attentions.push('upstream is not configured');
else if (behind !== 0) attentions.push(`branch is ${behind} commit(s) behind upstream`);

const receipt = {
  schemaVersion: 'vexlife.orientation-receipt/v0',
  orientationRef: contract.orientationRef,
  state: blockers.length ? 'BLOCKED' : attentions.length ? 'ATTENTION' : 'GROUNDED',
  repository: {
    repositoryRef: contract.repositoryRef,
    slug: remoteSlug,
    remoteUrl,
    visibility: { value: visibility, required: contract.requiredVisibility, source: visibilityArgument ? 'COMMAND_ARGUMENT' : visibilityEnvironment ? 'ENVIRONMENT_RECEIPT' : 'REPOSITORY_DECLARATION' }
  },
  git: {
    branch,
    branchSource,
    headSha,
    upstreamRef,
    upstreamSha,
    ahead,
    behind,
    workingTree: statusLines.length ? 'DIRTY' : 'CLEAN',
    changedPaths: statusLines.length,
    priorReviewedHead: contract.priorReviewedHead,
    commitsAbovePriorHead
  },
  currentWork: {
    prRef: Number.isInteger(pr) && pr > 0 ? `github-pr.${contract.repositorySlug}.${pr}` : null,
    prSource: prArgument ? 'COMMAND_ARGUMENT' : prEnvironment ? 'ENVIRONMENT_RECEIPT' : 'REPOSITORY_DECLARATION',
    workRef,
    workSource: workArgument ? 'COMMAND_ARGUMENT' : workEnvironment ? 'ENVIRONMENT_RECEIPT' : 'REPOSITORY_DECLARATION'
  },
  blueprint: {
    state: blueprint.ok ? 'CURRENT' : 'INVALID',
    semanticHash: blueprint.semanticHash,
    sourceManifestState: manifest.ok ? 'CURRENT' : 'DRIFT',
    sourceTreeSha256: actualManifest.treeSha256,
    pathTopologyState: implementationPlan.ok ? 'ROOT_RELATIVE' : 'INVALID'
  },
  heldBoundaries: current.heldBoundaries,
  requiredSources: contract.requiredSources,
  boundedDescentCommands: [
    'npm run atlas:query -- --intent "<task intent>" --limit 8 --depth 2',
    'npm run module:describe -- --module-ref <module.ref>'
  ],
  exactNextRoute: contract.exactNextRoute,
  attentions,
  blockers
};
console.log(JSON.stringify(receipt, null, 2));
if (blockers.length) process.exitCode = 1;

// [VXG RealForever]
