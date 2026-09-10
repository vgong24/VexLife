import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MODEL_TURN_FORMATION_ATLAS_SCHEMA,
  projectModelTurnFormationAtlas,
  projectTurnFormationEvidence
} from '../src/core/model-connection-atlas.mjs';

const H = 'a'.repeat(64);
const witness = {
  schemaVersion:'vexlife.model-turn-witness/v1',
  truthClass:'EXTERNAL_MODEL_TURN_WITNESS',
  turnRef:'turn.test.001',
  witnessRef:'witness.test.001',
  witnessSha256:H,
  runtimeObservation:{
    modelBundleRef:'model-bundle.test',
    operationalProfileRef:'profile.test',
    runtimeRevisionRef:'runtime.test',
    runtimeCapabilityEvidenceRef:'evidence.runtime.test',
    reasoningTrace:{present:true,contentSha256:H,rawState:'SEALED'}
  },
  capabilityDisposition:{
    availableRefs:['capability.a'],
    heldRefs:['capability.c11'],
    unavailableRefs:[],
    unknownRefs:['capability.unknown']
  },
  currentnessRefs:['current.main.test'],
  observedEffects:{
    modelRuntimeObserved:true,
    providerOrNetworkObserved:true,
    nativeToolExecutionObserved:false,
    multimodalInputObserved:false,
    trainingEffectObserved:false,
    modelWeightEffectObserved:false
  },
  privacy:{
    rawProviderResponsePersisted:false,
    rawReasoningPersisted:false,
    rawReportedModelPersisted:false,
    visibleResponseDuplicatedInWitness:false,
    privateContentAddedByWitness:false
  },
  trust:{
    modelSelfReportUsedAsExternalFact:false,
    runtimeObservationExternallyFormed:true,
    invocationEvidenceExternallyFormed:true
  }
};

test('R4 evidence keeps missing R3 projections UNKNOWN instead of inferring them', () => {
  const result = projectTurnFormationEvidence({
    modelTurnWitness:witness,
    capabilityRuntime:{
      schemaVersion:'vexlife.capability-assimilation-runtime/v1',
      mode:'ADOPTED_READ_ONLY',
      inferenceCount:2,
      toolRequestCount:1,
      observationRefs:['observation.a'],
      hiddenReasoningIncluded:false,
      externalEffectsExecuted:false
    }
  });
  assert.equal(result.modelConnection.state, 'UNKNOWN_NOT_PROJECTED_TO_THIS_SURFACE');
  assert.equal(result.selfCapability.state, 'UNKNOWN_NOT_PROJECTED_TO_THIS_SURFACE');
  assert.deepEqual(result.capabilityDisposition.heldRefs, ['capability.c11']);
  assert.equal(result.observedEffects.nativeToolExecutionObserved, false);
  assert.equal(result.reasoningTrace.present, true);
  assert.equal(result.reasoningTrace.rawIncluded, false);
  assert.equal(result.effectAuthorityGranted, false);
});

test('R4 only exposes supplied R3 projection/frame refs when both fail-closed bindings match', () => {
  const modelConnectionProjection = {
    schemaVersion:'vexlife.model-connection-projection/v1',
    truthClass:'SOURCE_BOUND_MODEL_CONNECTION',
    projectionRef:'projection.vexlife.model-connection.test',
    projectionSha256:H,
    modelTurnWitnessRef:witness.witnessRef,
    currentnessRefs:['current.main.test'],
    sourceRefs:['registry.vexlife.model-connections.001'],
    effectAuthorityGranted:false
  };
  const selfCapabilityFrame = {
    schemaVersion:'vexlife.vex-self-capability-frame/v1',
    truthClass:'BOUNDED_SOURCE_BOUND_SELF_CAPABILITY_FRAME',
    selfCapabilityFrameRef:'frame.vex-self-capability.test',
    semanticFingerprint:H,
    modelConnectionProjectionRef:modelConnectionProjection.projectionRef,
    availableCapabilityRefs:['capability.a'],
    heldCapabilityEntries:[{capabilityRef:'capability.c11'}],
    unavailableCapabilityRefs:[],
    unknownCapabilityRefs:['capability.unknown'],
    actuallyUsedRefs:['capability.a'],
    effectAuthorityGranted:false
  };
  const result = projectTurnFormationEvidence({modelTurnWitness:witness,modelConnectionProjection,selfCapabilityFrame});
  assert.equal(result.modelConnection.state, 'CURRENT_SOURCE_BOUND_REFERENCE');
  assert.equal(result.selfCapability.state, 'CURRENT_BOUNDED_REFERENCE');
  assert.deepEqual(result.selfCapability.actuallyUsedRefs, ['capability.a']);
});

test('R4 composes the supplied canonical Atlas query owner without creating a second graph', () => {
  let query = null;
  const atlas = { query(input) { query = input; return {results:[{ref:'node.a',kind:'FEATURE',brief:'A',stateHash:H,currentness:'CURRENT_BLUEPRINT',via:'SEARCH',depth:0}],coverage:{...input,usedTokens:10,visitedCount:1,truncated:false,truncatedBy:null}}; } };
  const result = projectModelTurnFormationAtlas({atlas,modelTurnWitness:witness,tokenBudget:700});
  assert.equal(result.schemaVersion, MODEL_TURN_FORMATION_ATLAS_SCHEMA);
  assert.equal(result.canonicalAtlasConsumed, true);
  assert.equal(result.newGraphCreated, false);
  assert.equal(query.externalMeaningEnvelopes.length, 0);
  assert.equal(result.atlas.results[0].ref, 'node.a');
});
