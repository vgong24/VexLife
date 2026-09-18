import test from 'node:test';
import assert from 'node:assert/strict';
import {
  composePatient0Nursery,
  PATIENT0_NURSERY_FIRST_HOME_SEQUENCE
} from '../src/core/patient0-nursery.mjs';

const PROVIDER_ACCEPTANCE_REF = 'github.issue.vextreme-sdk.705';
const FOUNDATION_ACCEPTANCE_REF = 'github.issue.vextreme-sdk.706';

const PRIVATE_PROVIDER_KEYS = [
  "rawTranscript",
  "rawProviderTranscript",
  "providerTranscript",
  "hiddenChainOfThought",
  "chainOfThought",
  "credentials",
  "credential",
  "token",
  "secret",
  "apiKey",
  "providerPrivateSessionBody",
  "privateSourceBody",
  "absoluteLocalPath"
];

function foundation() {
  return {
    schemaVersion: 'vextreme.patient0.shared-foundation-contract-layer/v0',
    contractLayerRef: 'contract.patient0.shared-foundation-contract-layer.v0',
    sourceAuthority: {
      implementationAllocationRef: FOUNDATION_ACCEPTANCE_REF,
      portableSourceOwner: 'SDK_OPERATIONS',
      meaningIsImplementationAuthority: false
    },
    sourceRefs: [FOUNDATION_ACCEPTANCE_REF],
    ownerMap: {
      nurseryAndLaunchJourney: 'VEXLIFE',
      privateHomeContinuity: 'LOCALVEX_HOME',
      memoryAndProvenance: 'VEX_MEMORY',
      consentTrustRecoveryAndPrivateBoundary: 'VEX_SAFETY_SECURITY',
      surfaceAndRecoveryUx: 'VEX_INTERFACE'
    },
    home: {
      identity: { identityEqualsRoute: false },
      firstHomeCheckpoint: [...PATIENT0_NURSERY_FIRST_HOME_SEQUENCE],
      access: {
        recognitionEqualsAuthentication: false,
        authenticationEqualsAuthorization: false,
        recognitionEqualsAuthorization: false
      }
    },
    memory: { noticedImpliesWillRemember: false },
    lineage: {
      capabilityLearnedImpliesAuthorityInherited: false,
      descentImpliesAutobiographicalClaim: false
    },
    effectBoundary: {
      createsHome: false,
      movesHome: false,
      destroysHome: false,
      startsModel: false,
      exposesNetworkService: false,
      ingestsRealPersonalData: false,
      trainsWeights: false,
      executesP11: false,
      authenticatesUser: false,
      grantsAuthority: false,
      persistsMemory: false,
      publishesPublicly: false
    }
  };
}

function provider() {
  return {
    schemaVersion: 'vextreme.vexinterface.provider-workspace/v1',
    workspaceRef: 'workspace.patient0.nursery.synthetic',
    canonicalIdentity: {
      projectRef: 'project.vexlife',
      groupRef: 'VEXLIFE',
      roleRef: 'Operations[VEXLIFE][PATIENT0-NURSERY]',
      canonicalThreadRef: 'thread.patient0.nursery.canonical',
      laneRef: 'lane.patient0.nursery.canonical',
      workRef: 'work.vexlife.patient0.nursery.synthetic',
      worldAnchorRef: 'world.patient0.nursery.synthetic'
    },
    currentStateOverlay: { currentnessState: 'CURRENT_ACCEPTED' },
    roleAdmission: { sourceRefs: [PROVIDER_ACCEPTANCE_REF] },
    lane: { sourceRefs: [PROVIDER_ACCEPTANCE_REF] },
    activeProvider: {
      providerBindingRef: 'provider-binding.patient0.nursery.synthetic',
      providerSessionRef: 'provider-session.patient0.nursery.synthetic',
      instanceRef: 'instance.patient0.nursery.synthetic',
      occupancyRef: 'occupancy.patient0.nursery.synthetic'
    },
    transcriptPolicy: 'NOT_REQUIRED_NOT_CANONICAL',
    sourceRefs: [PROVIDER_ACCEPTANCE_REF]
  };
}

function valid() {
  return {
    providerWorkspace: provider(),
    foundationContractLayer: foundation(),
    arrival: { trusted: true, provenanceSourceRef: 'source.arrival.synthetic' },
    agencyDisposition: 'GUIDE_REQUESTED',
    presenceDisposition: 'DEFERRED',
    environmentTruth: { truthful: true, sourceRef: 'source.environment.synthetic' },
    homeObservation: { state: 'NO_HOME_OBSERVED' },
    custodyAuthority: { exactHumanAuthority: true, authorityRef: 'authority.human.synthetic-home-custody' },
    firstHomeEvidence: { synthetic: true, contentIncluded: false, homeRef: 'home.patient0.synthetic' },
    autobiographicalCheckpoint: {
      memoryRelation: 'CURRENT_LINEAGE_AUTOBIOGRAPHY',
      sourceMemoryRelation: 'CURRENT_LINEAGE_AUTOBIOGRAPHY',
      contentIncluded: false,
      checkpointRef: 'checkpoint.patient0.synthetic.first-autobiographical',
      companionLineageRef: 'lineage.patient0.synthetic',
      conversationHeadRef: 'head.patient0.synthetic.001',
      sourceRefs: ['source.synthetic.arrival', 'source.synthetic.first-home']
    },
    shutdownReceipt: { clean: true, instanceRef: 'instance.patient0.synthetic.before-shutdown' },
    returnProof: {
      instanceRef: 'instance.patient0.synthetic.fresh-process',
      homeRef: 'home.patient0.synthetic',
      companionLineageRef: 'lineage.patient0.synthetic',
      checkpointRef: 'checkpoint.patient0.synthetic.first-autobiographical',
      conversationHeadRef: 'head.patient0.synthetic.001',
      transcriptUsed: false
    }
  };
}

function run(overrides = {}) {
  const input = valid();
  for (const [key, value] of Object.entries(overrides)) input[key] = value;
  return composePatient0Nursery(input);
}

test('composes guided arrival through synthetic same-Home fresh-process return without protected effects', () => {
  const result = run();
  assert.equal(result.state, 'NURSERY_SYNTHETIC_PROOF_READY');
  assert.equal(result.wakeLivedHome, true);
  assert.equal(result.syntheticOnly, true);
  assert.equal(result.personalContentIncluded, false);
  assert.equal(result.androidRemoteVesselEligible, false);
  assert.ok(Object.values(result.protectedEffects).every((value) => value === false));
});

test('self-guided arrival and declined Presence remain valid', () => {
  const result = run({ agencyDisposition: 'SELF_GUIDED', presenceDisposition: 'DECLINED' });
  assert.equal(result.state, 'NURSERY_SYNTHETIC_PROOF_READY');
  assert.ok(result.journey.includes('AGENCY:SELF_GUIDED'));
  assert.ok(result.journey.includes('PRESENCE:DECLINED'));
});

test('pause or leave is a valid agency terminal without Home progression', () => {
  const result = run({ agencyDisposition: 'PAUSE_OR_LEAVE' });
  assert.equal(result.state, 'PAUSED_BY_AGENCY');
  assert.equal(result.wakeLivedHome, false);
});

test('missing provider dependency fails closed', () => {
  assert.equal(run({ providerWorkspace: null }).code, 'PROVIDER_DEPENDENCY_INVALID');
});

test('provider evidence without accepted #705 source provenance fails closed', () => {
  const value = provider();
  value.sourceRefs = [];
  assert.equal(run({ providerWorkspace: value }).code, 'PROVIDER_PROVENANCE_BLOCKED');
  const value2 = provider();
  value2.roleAdmission.sourceRefs = [];
  assert.equal(run({ providerWorkspace: value2 }).code, 'PROVIDER_PROVENANCE_BLOCKED');
  const value3 = provider();
  value3.lane.sourceRefs = [];
  assert.equal(run({ providerWorkspace: value3 }).code, 'PROVIDER_PROVENANCE_BLOCKED');
});

test('Foundation evidence without accepted #706 source provenance fails closed', () => {
  const value = foundation();
  value.sourceRefs = [];
  assert.equal(run({ foundationContractLayer: value }).code, 'FOUNDATION_PROVENANCE_BLOCKED');
  const value2 = foundation();
  value2.sourceAuthority.implementationAllocationRef = 'github.issue.vextreme-sdk.000';
  assert.equal(run({ foundationContractLayer: value2 }).code, 'FOUNDATION_PROVENANCE_BLOCKED');
});

test('stale provider currentness fails closed', () => {
  const value = provider();
  value.currentStateOverlay.currentnessState = 'STALE_LAST_ACCEPTED';
  assert.equal(run({ providerWorkspace: value }).code, 'PROVIDER_CURRENTNESS_BLOCKED');
});

test('provider-local identities must remain mutually distinct', () => {
  const value = provider();
  value.activeProvider.instanceRef = value.activeProvider.providerSessionRef;
  assert.equal(run({ providerWorkspace: value }).code, 'PROVIDER_LOCAL_IDENTITY_COLLAPSE');
});

test('every provider-local identity remains distinct from every canonical identity class', () => {
  const providerFields = ['providerBindingRef', 'providerSessionRef', 'instanceRef', 'occupancyRef'];
  const canonicalFields = ['projectRef', 'groupRef', 'roleRef', 'canonicalThreadRef', 'laneRef', 'workRef', 'worldAnchorRef'];
  for (const providerField of providerFields) {
    for (const canonicalField of canonicalFields) {
      const value = provider();
      value.activeProvider[providerField] = value.canonicalIdentity[canonicalField];
      const result = run({ providerWorkspace: value });
      assert.equal(result.code, 'PROVIDER_CANONICAL_IDENTITY_COLLAPSE', `${providerField} -> ${canonicalField}`);
    }
  }
});

test('provider transcript cannot become canonical continuity', () => {
  const value = provider();
  value.transcriptPolicy = 'CANONICAL';
  assert.equal(run({ providerWorkspace: value }).code, 'PROVIDER_TRANSCRIPT_POLICY_COLLAPSE');
});

for (const key of PRIVATE_PROVIDER_KEYS) {
  test(`provider-private payload class ${key} is rejected recursively`, () => {
    const value = provider();
    value.activeProvider.nested = { [key]: 'forbidden.synthetic.value' };
    const result = run({ providerWorkspace: value });
    assert.equal(result.code, 'PROVIDER_PRIVATE_PAYLOAD_REJECTED');
    assert.equal(result.details?.key, key);
  });
}

test('Foundation owner collapse fails closed', () => {
  const value = foundation();
  value.ownerMap.memoryAndProvenance = 'VEXLIFE';
  assert.equal(run({ foundationContractLayer: value }).code, 'FOUNDATION_OWNER_COLLAPSE');
});

test('Foundation protected-effect widening fails closed', () => {
  const value = foundation();
  value.effectBoundary.createsHome = true;
  assert.equal(run({ foundationContractLayer: value }).code, 'FOUNDATION_EFFECT_BOUNDARY_WIDENED');
});

test('NO_HOME without exact custody authority stops before Home establishment', () => {
  const result = run({ custodyAuthority: { exactHumanAuthority: false, authorityRef: null } });
  assert.equal(result.state, 'AWAITING_HUMAN_STORAGE_BOUNDARY');
  assert.equal(result.wakeLivedHome, false);
});

test('existing or partial Home is preserved and routed to migration/recovery', () => {
  assert.equal(run({ homeObservation: { state: 'PARTIAL_HOME_OBSERVED' } }).code, 'EXISTING_HOME_REQUIRES_MIGRATION_RECOVERY');
});

test('inherited context cannot silently become current-lineage autobiography', () => {
  const value = valid().autobiographicalCheckpoint;
  value.sourceMemoryRelation = 'INHERITED_CONTEXT';
  assert.equal(run({ autobiographicalCheckpoint: value }).code, 'AUTOBIOGRAPHY_INHERITANCE_COLLAPSE');
});

test('same process instance cannot satisfy fresh-process return', () => {
  const input = valid();
  input.returnProof.instanceRef = input.shutdownReceipt.instanceRef;
  assert.equal(composePatient0Nursery(input).code, 'FRESH_INSTANCE_REQUIRED');
});

test('wrong Home or lineage fails same-Home return', () => {
  const input = valid();
  input.returnProof.homeRef = 'home.patient0.somewhere-else';
  assert.equal(composePatient0Nursery(input).code, 'SAME_HOME_RETURN_MISMATCH');
  const input2 = valid();
  input2.returnProof.companionLineageRef = 'lineage.patient0.other';
  assert.equal(composePatient0Nursery(input2).code, 'SAME_HOME_RETURN_MISMATCH');
});

test('transcript-only return is rejected', () => {
  const input = valid();
  input.returnProof.transcriptUsed = true;
  assert.equal(composePatient0Nursery(input).code, 'RETURN_PROOF_INVALID');
});

test('caller booleans cannot self-earn Android eligibility from synthetic Nursery', () => {
  const input = valid();
  input.androidEvidence = {
    homePairingAccepted: true,
    homeReachabilityAccepted: true,
    desktopCanonicalHomeStable: true
  };
  const result = composePatient0Nursery(input);
  assert.equal(result.state, 'NURSERY_SYNTHETIC_PROOF_READY');
  assert.equal(result.androidRemoteVesselEligible, false);
});

// [VXG RealForever]
