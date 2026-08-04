function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactMarkdownFieldValues(body, marker) {
  if (typeof body !== 'string' || typeof marker !== 'string' || !marker) return [];
  const pattern = new RegExp(`^${escapeRegExp(marker)}:\\s*` + '`([^`\\r\\n]+)`\\s*$', 'gm');
  return [...body.matchAll(pattern)].map((match) => match[1]);
}

export function resolveGitHubPullRequestCurrentWork({
  contract,
  eventName,
  event,
  expectedPrNumber = null,
  expectedCandidateHeadSha = null
}) {
  const rule = contract.currentWorkEvidence?.githubPullRequestEvent;
  const errors = [];
  if (!rule) return { state: 'UNAVAILABLE', source: 'UNKNOWN', workRef: null, errors: ['GitHub pull-request current-work rule is unavailable'] };
  if (!rule.supportedEventNames?.includes(eventName)) {
    return { state: 'NOT_APPLICABLE', source: 'UNKNOWN', workRef: null, errors: [] };
  }
  if (!event || typeof event !== 'object') errors.push('GitHub pull-request event is unavailable');
  const repositorySlug = event?.repository?.full_name ?? null;
  const repositoryVisibility = event?.repository?.visibility ?? null;
  const pullRequest = event?.pull_request ?? null;
  const prNumber = Number.isInteger(pullRequest?.number) && pullRequest.number > 0 ? pullRequest.number : null;
  const candidateHeadSha = typeof pullRequest?.head?.sha === 'string' ? pullRequest.head.sha : null;
  const baseSha = typeof pullRequest?.base?.sha === 'string' ? pullRequest.base.sha : null;
  const markerValues = exactMarkdownFieldValues(pullRequest?.body, rule.workRefMarker);
  const workRefPattern = new RegExp(rule.workRefPattern);

  if (rule.requireRepositoryMatch && repositorySlug !== contract.stableRepositoryIdentity.slug) {
    errors.push(`GitHub event repository mismatch: ${repositorySlug ?? 'UNKNOWN'}`);
  }
  if (!prNumber) errors.push('GitHub event pull-request number is unavailable');
  if (!candidateHeadSha || !/^[0-9a-f]{40}$/i.test(candidateHeadSha)) errors.push('GitHub event candidate head is unavailable');
  if (!baseSha || !/^[0-9a-f]{40}$/i.test(baseSha)) errors.push('GitHub event base SHA is unavailable');
  if (rule.requirePullRequestNumberMatch && expectedPrNumber != null && prNumber !== expectedPrNumber) {
    errors.push(`GitHub event pull-request number mismatch: ${prNumber ?? 'UNKNOWN'}`);
  }
  if (rule.requireCandidateHeadMatch && expectedCandidateHeadSha && candidateHeadSha !== expectedCandidateHeadSha) {
    errors.push(`GitHub event candidate head mismatch: ${candidateHeadSha ?? 'UNKNOWN'}`);
  }
  if (rule.requireSingleMarker && markerValues.length !== 1) {
    errors.push(`GitHub event must contain exactly one ${rule.workRefMarker} marker`);
  }
  const workRef = markerValues.length === 1 && workRefPattern.test(markerValues[0]) ? markerValues[0] : null;
  if (markerValues.length === 1 && !workRef) errors.push('GitHub event workRef marker is invalid');

  return {
    schemaVersion: rule.schemaVersion,
    state: errors.length ? 'UNVERIFIED' : 'VERIFIED',
    source: errors.length ? 'UNKNOWN' : 'GITHUB_PULL_REQUEST_EVENT',
    repositorySlug,
    repositoryVisibility: typeof repositoryVisibility === 'string' ? repositoryVisibility.toUpperCase() : null,
    prNumber,
    candidateHeadSha,
    baseSha,
    workRef: errors.length ? null : workRef,
    errors
  };
}

function lifecycleContract(contract, state) {
  return (contract.lifecycleContracts ?? []).find((item) => item.state === state) ?? null;
}

function routeFor({ contract, lifecycleState, currentWorkState, prNumber, candidateHeadSha }) {
  const held = 'Do not merge, publish, claim acceptance, or admit any native implementation wave without explicit authority.';
  if (currentWorkState === 'ACTIVE_PR') {
    return {
      routeRef: contract.routeRefs.activePr,
      action: `Review candidate ${candidateHeadSha ?? 'UNKNOWN'} on draft PR #${prNumber} against its bounded findings.`,
      held
    };
  }
  if (lifecycleState === 'PUBLIC_ACTIVE') {
    return {
      routeRef: contract.routeRefs.publicActive,
      action: 'Ground accepted public-active source and require explicit bounded authority for any release or publication effect.',
      held
    };
  }
  if (currentWorkState === 'ACCEPTED_MAIN') {
    return {
      routeRef: contract.routeRefs.acceptedMain,
      action: 'Use accepted main as the grounded base and wait for explicit bounded current-work inputs.',
      held
    };
  }
  return {
    routeRef: contract.routeRefs.unknown,
    action: 'Supply live or explicit bounded current-work evidence before implementation.',
    held
  };
}

export function deriveOrientationReceipt({
  contract,
  evidence,
  currentWork,
  lifecycle,
  blueprint
}) {
  const blockers = [];
  const attentions = [];
  const identity = contract.stableRepositoryIdentity;
  const lifecycleRule = lifecycleContract(contract, lifecycle.state);
  const prNumber = Number.isInteger(currentWork.prNumber) && currentWork.prNumber > 0 ? currentWork.prNumber : null;
  const currentWorkState = prNumber
    ? 'ACTIVE_PR'
    : evidence.git.branch === identity.primaryBranch
      ? 'ACCEPTED_MAIN'
      : 'UNKNOWN';

  if (evidence.repository.slug !== identity.slug) blockers.push(`remote repository mismatch: ${evidence.repository.slug ?? 'UNKNOWN'}`);
  if (!lifecycleRule && lifecycle.state !== 'UNKNOWN') blockers.push(`unsupported repository lifecycle ${lifecycle.state}`);
  if (lifecycle.state === 'UNKNOWN') attentions.push('repository lifecycle is UNKNOWN');
  if (currentWork.visibility === 'UNKNOWN') attentions.push('repository visibility is UNKNOWN');
  if (lifecycleRule && currentWork.visibility !== 'UNKNOWN' && !lifecycleRule.allowedVisibilities.includes(currentWork.visibility)) {
    blockers.push(`${lifecycle.state} does not allow ${currentWork.visibility} repository visibility`);
  }
  if (!blueprint.valid) blockers.push('blueprint validation failed');
  if (!blueprint.pathTopologyValid) blockers.push('implementation path topology is invalid');
  if (!blueprint.sourceManifestCurrent) blockers.push('source manifest is stale');
  if (evidence.git.workingTree !== 'CLEAN') attentions.push('working tree contains uncommitted changes');
  for (const attention of currentWork.attentions ?? []) {
    if (typeof attention === 'string' && attention) attentions.push(attention);
  }
  if (currentWorkState === 'UNKNOWN') attentions.push('current work is UNKNOWN for a non-primary checkout');
  if (currentWorkState === 'ACTIVE_PR' && !currentWork.workRef) attentions.push('active PR workRef is UNKNOWN');
  if (evidence.git.checkoutKind === 'BRANCH' && !evidence.git.upstreamRef) attentions.push('upstream is not configured');
  if (evidence.git.behind !== null && evidence.git.behind !== 0) attentions.push(`checkout is ${evidence.git.behind} commit(s) behind upstream`);

  return {
    schemaVersion: 'vexlife.orientation-receipt/v1',
    orientationRef: contract.orientationRef,
    state: blockers.length ? 'BLOCKED' : attentions.length ? 'ATTENTION' : 'GROUNDED',
    currentness: 'CURRENT',
    stableRepositoryIdentity: identity,
    repository: {
      repositoryRef: identity.repositoryRef,
      slug: evidence.repository.slug,
      remoteUrl: evidence.repository.remoteUrl,
      visibility: {
        value: currentWork.visibility,
        source: currentWork.visibilitySource
      }
    },
    git: {
      ...evidence.git,
      priorReviewedHead: currentWork.priorReviewedHead,
      commitsAbovePriorHead: currentWork.commitsAbovePriorHead,
      candidateHeadShaSeparatedFromTestedMergeSha: Boolean(
        evidence.git.candidateHeadSha &&
        evidence.git.testedMergeSha &&
        evidence.git.candidateHeadSha !== evidence.git.testedMergeSha
      )
    },
    currentWork: {
      state: currentWorkState,
      prRef: prNumber ? `github-pr.${identity.slug}.${prNumber}` : null,
      prSource: currentWork.prSource,
      workRef: currentWork.workRef,
      workSource: currentWork.workSource,
      evidenceState: currentWork.evidenceState ?? null,
      evidenceSchemaVersion: currentWork.evidenceSchemaVersion ?? null
    },
    lifecycle: {
      state: lifecycle.state,
      source: lifecycle.source,
      allowedVisibilities: lifecycleRule?.allowedVisibilities ?? []
    },
    blueprint,
    heldBoundaries: contract.heldBoundaries,
    requiredSources: contract.requiredSources,
    boundedDescentCommands: [
      'npm run atlas:query -- --intent "<task intent>" --limit 8 --depth 2',
      'npm run module:describe -- --module-ref <module.ref>'
    ],
    exactNextRoute: routeFor({
      contract,
      lifecycleState: lifecycle.state,
      currentWorkState,
      prNumber,
      candidateHeadSha: evidence.git.candidateHeadSha
    }),
    attentions,
    blockers
  };
}

// [VXG RealForever]
