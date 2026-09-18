function requireSha(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw new TypeError(`${label} must be an exact 40-character lowercase Git SHA`);
  }
  return value;
}

function requireOptionalSha(value, label) {
  if (value === '' || value === null || value === undefined) return '';
  return requireSha(value, label);
}

function requireParents(value) {
  if (!Array.isArray(value)) throw new TypeError('parentShas must be an array');
  return value.map((sha, index) => requireSha(sha, `parentShas[${index}]`));
}

/**
 * Resolve effect-fixture Git host identity without reading Git itself.
 *
 * Parent[1] is never treated as candidate merely because HEAD is a detached
 * two-parent commit. That interpretation is admitted only when the complete
 * GitHub pull_request environment tuple, checkout identity, and workspace-root
 * binding agree. Otherwise the exact tested checkout is the candidate source.
 *
 * A recognized PR synthetic host may execute candidate-bound fixture work only
 * when the candidate commit object and tree are locally available and the
 * candidate tree equals the tested checkout tree. A depth-1 synthetic merge
 * that cannot prove those facts is intentionally classified as non-executable;
 * exact-candidate and accepted-main topology cells own execution instead.
 */
export function classifyEffectFixtureGitHost({
  testedCheckoutSha,
  testedCheckoutTreeSha,
  parentShas,
  attachedBranch = '',
  environment = {},
  workspaceRootMatches = true,
  syntheticCandidateObjectType = '',
  syntheticCandidateHeadTreeSha = ''
}) {
  const checkoutSha = requireSha(testedCheckoutSha, 'testedCheckoutSha');
  const checkoutTree = requireSha(testedCheckoutTreeSha, 'testedCheckoutTreeSha');
  const parents = requireParents(parentShas);
  if (typeof attachedBranch !== 'string') throw new TypeError('attachedBranch must be a string');
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) {
    throw new TypeError('environment must be an object');
  }
  if (typeof workspaceRootMatches !== 'boolean') throw new TypeError('workspaceRootMatches must be boolean');
  if (typeof syntheticCandidateObjectType !== 'string') throw new TypeError('syntheticCandidateObjectType must be a string');
  const candidateTreeProbe = requireOptionalSha(syntheticCandidateHeadTreeSha, 'syntheticCandidateHeadTreeSha');

  const detachedTwoParent = !attachedBranch && parents.length === 2;
  const syntheticCandidateHeadSha = detachedTwoParent ? parents[1] : '';
  const exactGithubPrSynthetic = Boolean(syntheticCandidateHeadSha)
    && workspaceRootMatches
    && environment.VEXLIFE_CURRENT_WORK_EVENT_NAME === 'pull_request'
    && environment.VEXLIFE_TESTED_MERGE_SHA === checkoutSha
    && environment.VEXLIFE_CANDIDATE_HEAD_SHA === syntheticCandidateHeadSha
    && environment.VEXLIFE_BASE_SHA === parents[0];

  if (!exactGithubPrSynthetic) {
    return Object.freeze({
      hostClass: 'EXACT_CANDIDATE_OBJECT_PRESENT',
      executionAllowed: true,
      testedCheckoutSha: checkoutSha,
      testedCheckoutTreeSha: checkoutTree,
      parentShas: Object.freeze([...parents]),
      attachedBranch,
      candidateHeadSha: checkoutSha,
      candidateHeadTreeSha: checkoutTree,
      exactGithubPrSynthetic: false
    });
  }

  const candidateTreeExact = syntheticCandidateObjectType === 'commit'
    && candidateTreeProbe === checkoutTree;

  if (!candidateTreeExact) {
    return Object.freeze({
      hostClass: 'GITHUB_PR_SHALLOW_SYNTHETIC_MERGE',
      executionAllowed: false,
      testedCheckoutSha: checkoutSha,
      testedCheckoutTreeSha: checkoutTree,
      parentShas: Object.freeze([...parents]),
      attachedBranch,
      candidateHeadSha: syntheticCandidateHeadSha,
      candidateHeadTreeSha: candidateTreeProbe || null,
      exactGithubPrSynthetic: true
    });
  }

  return Object.freeze({
    hostClass: 'EXACT_CANDIDATE_OBJECT_PRESENT',
    executionAllowed: true,
    testedCheckoutSha: checkoutSha,
    testedCheckoutTreeSha: checkoutTree,
    parentShas: Object.freeze([...parents]),
    attachedBranch,
    candidateHeadSha: syntheticCandidateHeadSha,
    candidateHeadTreeSha: candidateTreeProbe,
    exactGithubPrSynthetic: true
  });
}

// [VXG RealForever]
