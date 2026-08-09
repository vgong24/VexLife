import test from 'node:test';
import assert from 'node:assert/strict';
import {
  composePatient0Nursery,
  PATIENT0_NURSERY_FIRST_HOME_SEQUENCE
} from '../src/core/patient0-nursery.mjs';

function foundation() {
  return {
    schemaVersion: 'vextreme.patient0.shared-foundation-contract-layer/v0',
    contractLayerRef: 'contract.patient0.shared-foundation-contract-layer.v0',
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
    activeProvider: {
      providerBindingRef: 'provider-binding.patient0.nursery.synthetic',
      providerSessionRef: 'provider-session.patient0.nursery.synthetic',
      instanceRef: 'instance.patient0.nursery.synthetic',
      occupancyRef: 'occupancy.patient0.nursery.synthetic'
    },
    transcriptPolicy: 'NOT_REQUIRED_NOT_CANONICAL'
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

test('stale provider currentness fails closed', () => {
  const value = provider();
  value.currentStateOverlay.currentnessState = 'STALE_LAST_ACCEPTED';
  assert.equal(run({ providerWorkspace: value }).code, 'PROVIDER_CURRENTNESS_BLOCKED');
});

test('provider session cannot collapse into canonical thread identity', () => {
  const value = provider();
  value.activeProvider.providerSessionRef = value.canonicalIdentity.canonicalThreadRef;
  assert.equal(run({ providerWorkspace: value }).code, 'PROVIDER_CANONICAL_IDENTITY_COLLAPSE');
});

test('provider transcript cannot become canonical continuity', () => {
  const value = provider();
  value.transcriptPolicy = 'CANONICAL';
  assert.equal(run({ providerWorkspace: value }).code, 'PROVIDER_TRANSCRIPT_POLICY_COLLAPSE');
});

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

test('Android eligibility requires all separately accepted desktop pairing/reachability facts', () => {
  const input = valid();
  input.androidEvidence = {
    homePairingAccepted: true,
    homeReachabilityAccepted: true,
    desktopCanonicalHomeStable: true
  };
  assert.equal(composePatient0Nursery(input).androidRemoteVesselEligible, true);
  const input2 = valid();
  input2.androidEvidence = { homePairingAccepted: true, homeReachabilityAccepted: false, desktopCanonicalHomeStable: true };
  assert.equal(composePatient0Nursery(input2).androidRemoteVesselEligible, false);
});

// [VXG RealForever]
