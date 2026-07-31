import { spawnSync } from 'node:child_process';

function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function collectRepositoryEvidence(root, environment = process.env) {
  const checkoutSha = git(root, 'rev-parse', 'HEAD');
  const localBranch = git(root, 'branch', '--show-current');
  const parents = (git(root, 'rev-list', '--parents', '-n', '1', 'HEAD') ?? '').split(/\s+/).filter(Boolean).slice(1);
  const detached = !localBranch;
  const syntheticMerge = detached && parents.length === 2;
  const branch = localBranch || environment.VEXLIFE_BRANCH || null;
  const upstreamRef = git(root, 'rev-parse', '--abbrev-ref', '@{upstream}');
  const upstreamSha = upstreamRef ? git(root, 'rev-parse', '@{upstream}') : null;
  const relation = upstreamRef ? git(root, 'rev-list', '--left-right', '--count', `HEAD...${upstreamRef}`) : null;
  const [ahead, behind] = relation ? relation.split(/\s+/).map(Number) : [null, null];
  const statusLines = (git(root, 'status', '--porcelain=v1') || '').split(/\r?\n/).filter(Boolean);
  const remoteUrl = git(root, 'remote', 'get-url', 'origin');
  const remoteSlug = remoteUrl?.replace(/^.*github\.com[/:]/, '').replace(/\.git$/, '') ?? null;
  const primaryRemoteRef = environment.VEXLIFE_PRIMARY_REMOTE_REF || 'origin/main';
  const mergeBase = checkoutSha ? git(root, 'merge-base', checkoutSha, primaryRemoteRef) : null;

  return {
    repository: { remoteUrl, slug: remoteSlug },
    git: {
      checkoutSha,
      branch,
      branchSource: localBranch ? 'GIT_WORKTREE' : environment.VEXLIFE_BRANCH ? 'ENVIRONMENT_RECEIPT' : 'UNKNOWN',
      detached,
      checkoutKind: syntheticMerge ? 'SYNTHETIC_MERGE' : detached ? 'DETACHED' : 'BRANCH',
      candidateHeadSha: environment.VEXLIFE_CANDIDATE_HEAD_SHA || (syntheticMerge ? parents[1] : checkoutSha),
      testedMergeSha: environment.VEXLIFE_TESTED_MERGE_SHA || (syntheticMerge ? checkoutSha : null),
      baseSha: environment.VEXLIFE_BASE_SHA || (syntheticMerge ? parents[0] : mergeBase),
      upstreamRef,
      upstreamSha,
      ahead,
      behind,
      workingTree: statusLines.length ? 'DIRTY' : 'CLEAN',
      changedPaths: statusLines.length
    }
  };
}

// [VXG RealForever]
