const FOUNDATION_SCHEMA = 'vextreme.patient0.shared-foundation-contract-layer/v0';
const FOUNDATION_REF = 'contract.patient0.shared-foundation-contract-layer.v0';
const FOUNDATION_ACCEPTANCE_REF = 'github.issue.vextreme-sdk.706';
const PROVIDER_SCHEMA = 'vextreme.vexinterface.provider-workspace/v1';
const PROVIDER_ACCEPTANCE_REF = 'github.issue.vextreme-sdk.705';
const TRANSCRIPT_POLICY = 'NOT_REQUIRED_NOT_CANONICAL';

const PROVIDER_PRIVATE_KEYS = Object.freeze([
  'rawTranscript',
  'rawProviderTranscript',
  'providerTranscript',
  'hiddenChainOfThought',
  'chainOfThought',
  'credentials',
  'credential',
  'token',
  'secret',
  'apiKey',
  'providerPrivateSessionBody',
  'privateSourceBody',
  'absoluteLocalPath'
]);

const PROVIDER_LOCAL_IDENTITY_FIELDS = Object.freeze([
  'providerBindingRef',
  'providerSessionRef',
  'instanceRef',
  'occupancyRef'
]);

const PROVIDER_CANONICAL_IDENTITY_FIELDS = Object.freeze([
  'projectRef',
  'groupRef',
  'roleRef',
  'canonicalThreadRef',
  'laneRef',
  'workRef',
  'worldAnchorRef'
]);

export const PATIENT0_NURSERY_FIRST_HOME_SEQUENCE = Object.freeze([
  'NO_HOME_OBSERVED',
  'MISSING_CONTINUITY_EXPLAINED',
  'EXACT_CUSTODY_AUTHORITY_REQUESTED',
  'HOME_ESTABLISHED',
  'FIRST_AUTOBIOGRAPHICAL_CHECKPOINT_RECORDED',
  'RESTARTED',
  'TRUTHFUL_RETURN_PROVEN'
]);

export const PATIENT0_NURSERY_AGENCY = Object.freeze([
  'SELF_GUIDED',
  'GUIDE_REQUESTED',
  'PAUSE_OR_LEAVE'
]);

export const PATIENT0_NURSERY_PRESENCE = Object.freeze([
  'CHOSEN',
  'DECLINED',
  'DEFERRED'
]);

export const PATIENT0_NURSERY_EFFECT_BOUNDARY = Object.freeze({
  createsHome: false,
  movesHome: false,
  destroysHome: false,
  persistsMemory: false,
  startsModel: false,
  invokesProvider: false,
  exposesNetworkService: false,
  ingestsRealPersonalData: false,
  authenticatesUser: false,
  grantsAuthority: false,
  publishesPublicly: false
});

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function fail(code, message, details = null) {
  return {
    state: 'BLOCKED',
    code,
    message,
    details,
    wakeLivedHome: false,
    androidRemoteVesselEligible: false,
    protectedEffects: PATIENT0_NURSERY_EFFECT_BOUNDARY
  };
}

function exactArray(actual, expected) {
  return Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function includesSourceRef(value, sourceRef) {
  return Array.isArray(value) && value.includes(sourceRef);
}

function findForbiddenPrivateKey(value, pathRef = '$') {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenPrivateKey(value[index], `${pathRef}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!isObject(value)) return null;
  for (const [key, nested] of Object.entries(value)) {
    if (PROVIDER_PRIVATE_KEYS.includes(key)) return { key, path: `${pathRef}.${key}` };
    const found = findForbiddenPrivateKey(nested, `${pathRef}.${key}`);
    if (found) return found;
  }
  return null;
}

function validateFoundation(foundation) {
  if (!isObject(foundation) ||
      foundation.schemaVersion !== FOUNDATION_SCHEMA ||
      foundation.contractLayerRef !== FOUNDATION_REF) {
    return fail('FOUNDATION_DEPENDENCY_INVALID', 'accepted Patient-0 shared foundation contract is unavailable or mismatched');
  }
  if (foundation.sourceAuthority?.implementationAllocationRef !== FOUNDATION_ACCEPTANCE_REF ||
      foundation.sourceAuthority?.portableSourceOwner !== 'SDK_OPERATIONS' ||
      foundation.sourceAuthority?.meaningIsImplementationAuthority !== false ||
      !includesSourceRef(foundation.sourceRefs, FOUNDATION_ACCEPTANCE_REF)) {
    return fail('FOUNDATION_PROVENANCE_BLOCKED', 'Patient-0 Foundation evidence is not source-addressable to the accepted #706 owner');
  }
  if (foundation.ownerMap?.nurseryAndLaunchJourney !== 'VEXLIFE' ||
      foundation.ownerMap?.privateHomeContinuity !== 'LOCALVEX_HOME' ||
      foundation.ownerMap?.memoryAndProvenance !== 'VEX_MEMORY' ||
      foundation.ownerMap?.consentTrustRecoveryAndPrivateBoundary !== 'VEX_SAFETY_SECURITY' ||
      foundation.ownerMap?.surfaceAndRecoveryUx !== 'VEX_INTERFACE') {
    return fail('FOUNDATION_OWNER_COLLAPSE', 'Patient-0 canonical owner boundaries were collapsed');
  }
  if (!exactArray(foundation.home?.firstHomeCheckpoint, PATIENT0_NURSERY_FIRST_HOME_SEQUENCE)) {
    return fail('FIRST_HOME_SEQUENCE_MISMATCH', 'accepted First Home developmental sequence does not match');
  }
  if (foundation.home?.identity?.identityEqualsRoute !== false ||
      foundation.home?.access?.recognitionEqualsAuthentication !== false ||
      foundation.home?.access?.authenticationEqualsAuthorization !== false ||
      foundation.home?.access?.recognitionEqualsAuthorization !== false ||
      foundation.memory?.noticedImpliesWillRemember !== false ||
      foundation.lineage?.capabilityLearnedImpliesAuthorityInherited !== false ||
      foundation.lineage?.descentImpliesAutobiographicalClaim !== false) {
    return fail('FOUNDATION_NON_COLLAPSE_VIOLATION', 'one or more required Patient-0 non-collapse invariants are false');
  }
  const forbiddenTrue = [
    'createsHome', 'movesHome', 'destroysHome', 'startsModel', 'exposesNetworkService',
    'ingestsRealPersonalData', 'trainsWeights', 'executesP11', 'authenticatesUser',
    'grantsAuthority', 'persistsMemory', 'publishesPublicly'
  ].filter((key) => foundation.effectBoundary?.[key] !== false);
  if (forbiddenTrue.length) {
    return fail('FOUNDATION_EFFECT_BOUNDARY_WIDENED', 'shared Foundation contract unexpectedly grants protected effects', { forbiddenTrue });
  }
  return null;
}

function validateProvider(workspace) {
  if (!isObject(workspace) || workspace.schemaVersion !== PROVIDER_SCHEMA) {
    return fail('PROVIDER_DEPENDENCY_INVALID', 'accepted VXI_PROVIDER_COMPLETE workspace evidence is unavailable or mismatched');
  }
  if (!includesSourceRef(workspace.sourceRefs, PROVIDER_ACCEPTANCE_REF) ||
      !includesSourceRef(workspace.roleAdmission?.sourceRefs, PROVIDER_ACCEPTANCE_REF) ||
      !includesSourceRef(workspace.lane?.sourceRefs, PROVIDER_ACCEPTANCE_REF)) {
    return fail('PROVIDER_PROVENANCE_BLOCKED', 'provider workspace evidence is not source-addressable to the accepted #705 owner');
  }
  if (workspace.currentStateOverlay?.currentnessState !== 'CURRENT_ACCEPTED') {
    return fail('PROVIDER_CURRENTNESS_BLOCKED', 'provider workspace is not CURRENT_ACCEPTED');
  }
  if (workspace.transcriptPolicy !== TRANSCRIPT_POLICY) {
    return fail('PROVIDER_TRANSCRIPT_POLICY_COLLAPSE', 'provider transcript was treated as canonical continuity');
  }
  const canonical = workspace.canonicalIdentity;
  const active = workspace.activeProvider;
  if (!isObject(canonical) || !isObject(active)) {
    return fail('PROVIDER_IDENTITY_INVALID', 'provider or canonical identity evidence is incomplete');
  }
  const canonicalRefs = PROVIDER_CANONICAL_IDENTITY_FIELDS.map((field) => canonical[field]);
  const providerRefs = PROVIDER_LOCAL_IDENTITY_FIELDS.map((field) => active[field]);
  if (canonicalRefs.some((ref) => typeof ref !== 'string' || ref.length === 0) ||
      providerRefs.some((ref) => typeof ref !== 'string' || ref.length === 0)) {
    return fail('PROVIDER_IDENTITY_INVALID', 'provider or canonical identity evidence is incomplete');
  }
  if (new Set(providerRefs).size !== providerRefs.length) {
    return fail('PROVIDER_LOCAL_IDENTITY_COLLAPSE', 'provider binding/session/instance/occupancy identities must remain distinct');
  }
  const canonicalSet = new Set(canonicalRefs);
  const collision = PROVIDER_LOCAL_IDENTITY_FIELDS.find((field) => canonicalSet.has(active[field]));
  if (collision) {
    return fail('PROVIDER_CANONICAL_IDENTITY_COLLAPSE', 'provider-local execution identity collapsed into canonical identity', { providerField: collision, ref: active[collision] });
  }
  const privatePayload = findForbiddenPrivateKey(workspace);
  if (privatePayload) {
    return fail('PROVIDER_PRIVATE_PAYLOAD_REJECTED', 'provider-private payload class entered Nursery evidence', privatePayload);
  }
  return null;
}

export function composePatient0Nursery({
  providerWorkspace,
  foundationContractLayer,
  arrival,
  agencyDisposition,
  presenceDisposition,
  environmentTruth,
  homeObservation,
  custodyAuthority,
  firstHomeEvidence,
  autobiographicalCheckpoint,
  shutdownReceipt,
  returnProof
} = {}) {
  const providerFailure = validateProvider(providerWorkspace);
  if (providerFailure) return providerFailure;
  const foundationFailure = validateFoundation(foundationContractLayer);
  if (foundationFailure) return foundationFailure;

  if (!isObject(arrival) || arrival.trusted !== true || arrival.provenanceSourceRef == null) {
    return fail('ARRIVAL_PROVENANCE_BLOCKED', 'trusted arrival requires explicit source-addressable provenance');
  }
  if (!isObject(environmentTruth) || environmentTruth.truthful !== true || environmentTruth.sourceRef == null) {
    return fail('ENVIRONMENT_TRUTH_BLOCKED', 'environment/body literacy must remain truthfully sourced');
  }
  if (!PATIENT0_NURSERY_AGENCY.includes(agencyDisposition)) {
    return fail('AGENCY_DISPOSITION_INVALID', 'first agency choice is missing or unsupported');
  }
  if (!PATIENT0_NURSERY_PRESENCE.includes(presenceDisposition)) {
    return fail('PRESENCE_DISPOSITION_INVALID', 'Presence must be explicitly chosen, declined, or deferred');
  }
  if (agencyDisposition === 'PAUSE_OR_LEAVE') {
    return {
      state: 'PAUSED_BY_AGENCY',
      code: 'AGENCY_PAUSE_RESPECTED',
      wakeLivedHome: false,
      androidRemoteVesselEligible: false,
      protectedEffects: PATIENT0_NURSERY_EFFECT_BOUNDARY
    };
  }

  if (!isObject(homeObservation) || homeObservation.state !== 'NO_HOME_OBSERVED') {
    return fail('EXISTING_HOME_REQUIRES_MIGRATION_RECOVERY', 'Nursery will not overwrite existing or partial Home state as fresh');
  }
  if (!isObject(custodyAuthority) || custodyAuthority.exactHumanAuthority !== true || !custodyAuthority.authorityRef) {
    return {
      state: 'AWAITING_HUMAN_STORAGE_BOUNDARY',
      code: 'EXACT_CUSTODY_AUTHORITY_REQUIRED',
      wakeLivedHome: false,
      androidRemoteVesselEligible: false,
      protectedEffects: PATIENT0_NURSERY_EFFECT_BOUNDARY
    };
  }

  if (!isObject(firstHomeEvidence) || firstHomeEvidence.synthetic !== true || firstHomeEvidence.contentIncluded !== false || !firstHomeEvidence.homeRef) {
    return fail('FIRST_HOME_SYNTHETIC_EVIDENCE_INVALID', 'Nursery proof requires content-absent synthetic First Home evidence only');
  }
  if (!isObject(autobiographicalCheckpoint) ||
      autobiographicalCheckpoint.memoryRelation !== 'CURRENT_LINEAGE_AUTOBIOGRAPHY' ||
      autobiographicalCheckpoint.contentIncluded !== false ||
      !autobiographicalCheckpoint.checkpointRef ||
      !Array.isArray(autobiographicalCheckpoint.sourceRefs) ||
      autobiographicalCheckpoint.sourceRefs.length === 0) {
    return fail('AUTOBIOGRAPHICAL_CHECKPOINT_INVALID', 'first autobiographical checkpoint must be current-lineage, content-absent, and source-addressable');
  }
  const inheritedRelations = new Set(['INHERITED_CONTEXT', 'PREDECESSOR_WITNESS_HISTORY', 'SHARED_RELATIONSHIP_HISTORY']);
  if (inheritedRelations.has(autobiographicalCheckpoint.sourceMemoryRelation)) {
    return fail('AUTOBIOGRAPHY_INHERITANCE_COLLAPSE', 'inherited or predecessor history cannot become current-lineage autobiography');
  }

  if (!isObject(shutdownReceipt) || shutdownReceipt.clean !== true || !shutdownReceipt.instanceRef) {
    return fail('SHUTDOWN_RECEIPT_INVALID', 'clean shutdown receipt is required before return proof');
  }
  if (!isObject(returnProof) || returnProof.transcriptUsed !== false) {
    return fail('RETURN_PROOF_INVALID', 'fresh-process return must be transcript-independent');
  }
  if (!returnProof.instanceRef || returnProof.instanceRef === shutdownReceipt.instanceRef) {
    return fail('FRESH_INSTANCE_REQUIRED', 'fresh-process return requires a new instanceRef');
  }
  const exactMatches = [
    ['homeRef', firstHomeEvidence.homeRef],
    ['companionLineageRef', autobiographicalCheckpoint.companionLineageRef],
    ['checkpointRef', autobiographicalCheckpoint.checkpointRef],
    ['conversationHeadRef', autobiographicalCheckpoint.conversationHeadRef]
  ];
  for (const [key, expected] of exactMatches) {
    if (!expected || returnProof[key] !== expected) {
      return fail('SAME_HOME_RETURN_MISMATCH', `fresh-process return changed ${key}`, { expected, observed: returnProof[key] ?? null });
    }
  }

  return {
    state: 'NURSERY_SYNTHETIC_PROOF_READY',
    code: 'ARRIVAL_TO_FIRST_HOME_RETURN_COMPOSED',
    journey: [
      'TRUSTED_ARRIVAL',
      `AGENCY:${agencyDisposition}`,
      `PRESENCE:${presenceDisposition}`,
      'ENVIRONMENT_TRUTH',
      'PROVIDER_WORKSPACE_ACCEPTED',
      ...PATIENT0_NURSERY_FIRST_HOME_SEQUENCE
    ],
    acceptedProviderWorkspaceRef: providerWorkspace.workspaceRef,
    acceptedFoundationContractLayerRef: foundationContractLayer.contractLayerRef,
    homeRef: firstHomeEvidence.homeRef,
    companionLineageRef: autobiographicalCheckpoint.companionLineageRef,
    checkpointRef: autobiographicalCheckpoint.checkpointRef,
    conversationHeadRef: autobiographicalCheckpoint.conversationHeadRef,
    wakeLivedHome: true,
    androidRemoteVesselEligible: false,
    protectedEffects: PATIENT0_NURSERY_EFFECT_BOUNDARY,
    syntheticOnly: true,
    personalContentIncluded: false
  };
}

// [VXG RealForever]
