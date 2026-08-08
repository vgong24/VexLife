function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactMarkdownFieldValues(body, marker) {
  if (typeof body !== 'string' || typeof marker !== 'string' || !marker) return [];
  const pattern = new RegExp(`^${escapeRegExp(marker)}:\\s*` + '`([^`\\r\\n]+)`\\s*$', 'gm');
  return [...body.matchAll(pattern)].map((match) => match[1]);
}

export const FEDERATED_PROVIDER_QUESTION_CLASSES = Object.freeze([
  'WHERE_AM_I',
  'WHY_DO_I_EXIST_IN_THIS_CURRENT_NEED',
  'WHAT_IS_CURRENT',
  'WHAT_IS_AVAILABLE',
  'WHAT_IS_IMPLEMENTED',
  'WHAT_IS_MAPPED',
  'WHAT_IS_ACTIVE',
  'WHAT_IS_HELD',
  'WHAT_IS_BLOCKED',
  'WHAT_IS_REQUIRED',
  'WHAT_PRECEDED_THIS',
  'WHAT_CAN_FOLLOW_THIS',
  'WHAT_CAN_PROCEED_IN_PARALLEL',
  'WHAT_CONNECTS_THESE_ITEMS',
  'CAN_THIS_ROLE_ACT',
  'WHICH_SOURCE_IS_AUTHORITATIVE',
  'HAS_THIS_TASK_ALREADY_RUN',
  'WHERE_IS_THE_RETURN',
  'WHAT_REQUIRES_VICTOR',
  'WHAT_IS_THE_ONE_NEXT_ACTION'
]);

const PROVIDER_TIMESTAMP_RE = /^(?:(?:\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|02-(?:0[1-9]|1\d|2[0-8])))|(?:(?:[02468][048]00|[13579][26]00|\d{2}(?:0[48]|[2468][048]|[13579][26]))-02-29))T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?Z$/;
const PROVIDER_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:/\[\]-]*$/;
const PROVIDER_SHA_RE = /^[0-9a-f]{40}$/i;

function providerObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function providerSortedUnique(values) {
  return [...new Set(values)].sort();
}

function providerRef(value, label) {
  if (typeof value !== 'string' || value.length > 1024 || !PROVIDER_REF_RE.test(value)) {
    throw new Error(`${label} must be a reference-safe string`);
  }
  return value;
}

function providerOptionalRef(value, label) {
  return value == null ? null : providerRef(value, label);
}

function providerCommitRef(sha, label) {
  if (typeof sha !== 'string' || !PROVIDER_SHA_RE.test(sha)) return null;
  return providerRef(`github.commit.vexlife.${sha.toLowerCase()}`, label);
}

function providerPrRef(currentWork) {
  const prRef = currentWork?.prRef;
  if (typeof prRef !== 'string') return null;
  const match = /^github-pr\.vgong24\/VexLife\.(\d+)$/.exec(prRef);
  if (!match) return null;
  return providerRef(`github.pr.vexlife.${match[1]}`, 'orientationReceipt.currentWork.prRef');
}

function canonicalProviderTimestamp(value) {
  if (typeof value !== 'string' || !PROVIDER_TIMESTAMP_RE.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const canonical = value.includes('.') ? value : value.replace(/Z$/, '.000Z');
  return parsed.toISOString() === canonical;
}

function validateFederatedProviderContract(contract) {
  const provider = contract?.federatedProvider;
  if (!providerObject(provider)) throw new Error('federatedProvider contract is unavailable');
  const expected = {
    receiptSchemaVersion: 'vextreme.orientation-provider-receipt/v1',
    providerRef: 'provider.vexlife.orientation',
    providerClass: 'PRIVATE_VEXLIFE',
    repositoryRef: 'vgong24/VexLife',
    visibility: 'PRIVATE',
    projectionScope: 'PRIVATE',
    publicationAuthority: false
  };
  for (const [key, value] of Object.entries(expected)) {
    if (provider[key] !== value) throw new Error(`federatedProvider.${key} is invalid`);
  }
  if (!Array.isArray(provider.privateStateRefs) ||
      provider.privateStateRefs.length !== 1 ||
      provider.privateStateRefs[0] !== 'state.private.vexlife.orientation') {
    throw new Error('federatedProvider.privateStateRefs must contain the canonical private VexLife state ref');
  }
  return provider;
}

function validateRepositoryOrientationReceipt(contract, receipt) {
  if (!providerObject(receipt) || receipt.schemaVersion !== 'vexlife.orientation-receipt/v1') {
    throw new Error('orientationReceipt must be vexlife.orientation-receipt/v1');
  }
  if (receipt.orientationRef !== contract.orientationRef) {
    throw new Error('orientationReceipt orientationRef does not match the repository contract');
  }
  if (receipt.stableRepositoryIdentity?.slug !== contract.stableRepositoryIdentity.slug ||
      receipt.repository?.slug !== contract.stableRepositoryIdentity.slug) {
    throw new Error('orientationReceipt repository identity mismatch');
  }
  return receipt;
}

export function deriveFederatedOrientationProviderReceipt({
  contract,
  orientationReceipt,
  observedAt
}) {
  const provider = validateFederatedProviderContract(contract);
  const source = validateRepositoryOrientationReceipt(contract, orientationReceipt);
  if (!canonicalProviderTimestamp(observedAt)) {
    throw new Error('observedAt must be an explicit valid UTC timestamp');
  }

  const sourceState = source.state;
  const sourceCurrentness = source.currentness;
  const visibility = source.repository?.visibility?.value ?? 'UNKNOWN';
  const lifecycleState = source.lifecycle?.state ?? 'UNKNOWN';
  const currentWorkState = source.currentWork?.state ?? 'UNKNOWN';
  const currentWorkRef = providerOptionalRef(source.currentWork?.workRef, 'orientationReceipt.currentWork.workRef');
  const candidateHeadRef = providerCommitRef(source.git?.candidateHeadSha, 'orientationReceipt.git.candidateHeadSha');
  const baseRef = providerCommitRef(source.git?.baseSha, 'orientationReceipt.git.baseSha');
  const activePrRef = providerPrRef(source.currentWork);
  const liveCurrentSourceAvailable = currentWorkState === 'ACTIVE_PR'
    ? Boolean(candidateHeadRef && activePrRef && currentWorkRef)
    : currentWorkState === 'ACCEPTED_MAIN'
      ? Boolean(candidateHeadRef)
      : false;

  const sourceGrounded = (
    sourceState === 'GROUNDED' &&
    sourceCurrentness === 'CURRENT' &&
    visibility === 'PRIVATE' &&
    liveCurrentSourceAvailable &&
    lifecycleState !== 'UNKNOWN'
  );
  const currentState = sourceState === 'BLOCKED' ? 'UNAVAILABLE' : sourceGrounded ? 'CURRENT' : 'UNKNOWN';

  const sourceRefs = providerSortedUnique([
    'source.vexlife.orientation-contract',
    ...(candidateHeadRef ? [candidateHeadRef] : []),
    ...(activePrRef ? [activePrRef] : [])
  ]);
  sourceRefs.forEach((ref, index) => providerRef(ref, `sourceRefs[${index}]`));
  const edgeSourceRef = candidateHeadRef || activePrRef || 'source.vexlife.orientation-contract';

  const futurePublicIntent = lifecycleState === 'PUBLIC_RELEASE_CANDIDATE';
  const publicationLifecycle = lifecycleState === 'UNKNOWN' || sourceState === 'BLOCKED'
    ? 'UNKNOWN'
    : futurePublicIntent
      ? 'FUTURE_PUBLIC_INTENT'
      : 'PRIVATE';

  const currentAcceptedRefs = currentWorkState === 'ACCEPTED_MAIN' && candidateHeadRef
    ? [candidateHeadRef]
    : currentWorkState === 'ACTIVE_PR' && baseRef
      ? [baseRef]
      : [];
  const currentEntryRefs = activePrRef ? [activePrRef] : candidateHeadRef ? [candidateHeadRef] : [];
  const routeRef = providerOptionalRef(source.exactNextRoute?.routeRef, 'orientationReceipt.exactNextRoute.routeRef');
  const heldActionRefs = [
    'action.vexlife.provider.cross-repository-effects-held',
    'action.vexlife.provider.publication-held'
  ];

  const blockers = providerSortedUnique([
    ...(sourceState === 'BLOCKED' ? ['blocker.vexlife.orientation-source'] : []),
    ...(visibility !== 'PRIVATE' ? ['blocker.vexlife.provider-private-visibility'] : [])
  ]);
  const attentions = providerSortedUnique([
    'attention.vexlife.relay-state-unknown',
    ...(sourceState === 'ATTENTION' ? ['attention.vexlife.orientation-source'] : []),
    ...(currentState !== 'CURRENT' ? ['attention.vexlife.currentness'] : [])
  ]);
  const unknownRefs = providerSortedUnique([
    'source.vexlife.relay-state',
    ...(currentState !== 'CURRENT' ? ['source.vexlife.current-state'] : [])
  ]);

  const questionCoverage = FEDERATED_PROVIDER_QUESTION_CLASSES.map((questionClass) => ({
    questionClass,
    requiredSourceRefs: sourceRefs,
    optionalSourceRefs: [],
    alreadyCoveredSourceRefs: sourceRefs,
    missingSourceRefs: []
  }));

  return {
    schemaVersion: provider.receiptSchemaVersion,
    providerRef: provider.providerRef,
    providerClass: provider.providerClass,
    repositoryRef: provider.repositoryRef,
    visibility: provider.visibility,
    projectionScope: provider.projectionScope,
    observedAt,
    freshnessState: {
      liveSourceRefOrNull: currentState === 'CURRENT' ? candidateHeadRef || activePrRef : null,
      staticSourceRefOrNull: 'source.vexlife.orientation-contract',
      selectedSourceClass: currentState === 'CURRENT' ? 'LIVE' : 'UNKNOWN',
      selectionReasonRef: currentState === 'CURRENT'
        ? 'rule.vexlife.repository-orientation-current'
        : 'rule.vexlife.repository-orientation-fails-closed'
    },
    publicationState: {
      lifecycleState: publicationLifecycle,
      futurePublicIntentSourceRefOrNull: futurePublicIntent ? 'source.vexlife.future-public-intent' : null,
      publicationAuthority: false
    },
    currentState,
    current: {
      currentGlobalRootRef: null,
      currentScopedRootRef: null,
      currentLocalOperationsRef: null,
      currentWorkRef,
      currentEntryRefs,
      currentAcceptedRefs,
      priorAcceptedRefs: [],
      supersededRefs: [],
      nextEligibleRefs: currentState === 'CURRENT' && routeRef ? [routeRef] : [],
      nextHeldRefs: heldActionRefs
    },
    purposeState: {
      rolePurposeRef: 'purpose.vexlife.orientation-provider',
      currentNeedRef: 'need.vexlife.product-state-provider',
      whyThisRoleWasSelectedRef: 'reason.vexlife-owns-product-specific-state',
      whatThisRoleOwnsRefs: ['boundary.vexlife.product-specific-provider-state'],
      whatThisRoleMustNotOwnRefs: [
        'boundary.cross-repository-authority',
        'boundary.publication-effect',
        'boundary.vexlife.second-orientation-owner'
      ],
      acceptedInputRefs: ['contract.vexlife.repository-orientation'],
      requiredOutputRefs: ['receipt.vexlife.private-orientation-provider'],
      returnRouteRef: null,
      completionGateRefs: [
        'gate.vexlife.provider.content-absent',
        'gate.vexlife.provider.fail-closed-currentness',
        'gate.vexlife.provider.no-publication-authority'
      ],
      currentDependencies: ['contract.vexlife.repository-orientation'],
      currentPeers: [],
      whatHappensAfterReturnRefs: ['process.federated-orientation.resolve']
    },
    functionState: {
      availableFunctionRefs: ['function.vexlife.orientation.provider-project'],
      requiredFunctionRefs: ['function.vexlife.orientation.provider-project'],
      unavailableFunctionRefs: []
    },
    capabilityState: {
      implementedCapabilityRefs: ['capability.vexlife.repository-orientation', 'capability.vexlife.orientation-provider'],
      mappedCapabilityRefs: ['capability.vexlife.orientation-provider'],
      activeCapabilityRefs: currentState === 'CURRENT' ? ['capability.vexlife.orientation-provider'] : [],
      heldCapabilityRefs: [
        'capability.cross-repository-authority',
        'capability.vexlife.publication'
      ],
      blockedCapabilityRefs: currentState === 'CURRENT' ? [] : ['capability.vexlife.current-state-answer'],
      completedCapabilityRefs: ['capability.vexlife.repository-orientation']
    },
    edges: [
      {
        edgeRef: 'edge.orientation.vexlife.source-owner',
        edgeClass: 'SOURCE_ORIGIN',
        fromRef: provider.providerRef,
        toRef: 'boundary.vexlife.product-specific-provider-state',
        sourceRefs: [edgeSourceRef]
      },
      {
        edgeRef: 'edge.orientation.vexlife.repository-receipt',
        edgeClass: 'VALIDATED_BY',
        fromRef: provider.providerRef,
        toRef: contract.orientationRef,
        sourceRefs: [edgeSourceRef]
      }
    ],
    questionCoverage,
    authorityEnvelope: {
      authorityRefOrNull: null,
      state: 'HELD',
      allowedEffectRefs: [],
      heldEffectRefs: [
        'effect.cross-repository-authority-transfer',
        'effect.publication',
        'effect.source-mutation'
      ],
      unknownEffectRefs: [],
      victorRequirementRefs: []
    },
    effectEnvelope: {
      effectRefOrNull: null,
      availableFunctionRefOrNull: 'function.vexlife.orientation.provider-project',
      typedEffectEvidenceOrNull: null
    },
    resourceEnvelope: {
      machineScopeRefs: [],
      availableResourceRefs: ['resource.vexlife.repository-orientation-receipt'],
      requiredResourceRefs: ['resource.vexlife.repository-orientation-receipt'],
      unavailableResourceRefs: [],
      unknownResourceRefs: currentState === 'CURRENT' ? [] : ['resource.vexlife.current-state-freshness']
    },
    currentClaimRefs: [],
    conflictingClaimRefs: [],
    relayState: {
      executionState: 'TASK_STATE_UNKNOWN_DO_NOT_EXECUTE',
      taskRefOrNull: null,
      attemptRefOrNull: null,
      taskSha256OrNull: null,
      hostProfileRefOrNull: null,
      repositoryExecutionProfileRefOrNull: null,
      acceptedAtOrNull: null,
      startedAtOrNull: null,
      terminalAtOrNull: null,
      resultZipRefOrNull: null,
      resultZipSha256OrNull: null,
      consumedByRefOrNull: null,
      successorRefOrNull: null
    },
    unknownRefs,
    attentions,
    blockers,
    exactNextActionRef: currentState === 'CURRENT' ? routeRef : 'action.vexlife.orientation.refresh-current-state',
    privateStateRefs: [...provider.privateStateRefs],
    currentContext: {
      handoffRefOrNull: null,
      projectionOrNull: null
    },
    sourceRefs
  };
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
