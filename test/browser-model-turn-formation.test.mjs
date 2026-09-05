import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadModelTurnFormationReference,
  projectBrowserModelTurnFormation
} from '../reference/browser/modules/model-turn-formation-disclosure.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const H='b'.repeat(64);
const witness={
  schemaVersion:'vexlife.model-turn-witness/v1',
  truthClass:'EXTERNAL_MODEL_TURN_WITNESS',
  turnRef:'turn.browser.001',
  witnessRef:'witness.browser.001',
  witnessSha256:H,
  runtimeObservation:{modelBundleRef:'bundle.browser',operationalProfileRef:'profile.browser',runtimeRevisionRef:'runtime.browser',runtimeCapabilityEvidenceRef:'evidence.browser',reasoningTrace:{present:false,contentSha256:null,rawState:'ABSENT'}},
  capabilityDisposition:{availableRefs:['cap.a'],heldRefs:['cap.c11','cap.c12'],unavailableRefs:[],unknownRefs:[]},
  currentnessRefs:['current.browser'],
  observedEffects:{modelRuntimeObserved:true,providerOrNetworkObserved:true,nativeToolExecutionObserved:false,multimodalInputObserved:false,trainingEffectObserved:false,modelWeightEffectObserved:false},
  privacy:{rawProviderResponsePersisted:false,rawReasoningPersisted:false,rawReportedModelPersisted:false,visibleResponseDuplicatedInWitness:false,privateContentAddedByWitness:false},
  trust:{modelSelfReportUsedAsExternalFact:false,runtimeObservationExternallyFormed:true,invocationEvidenceExternallyFormed:true}
};

test('browser projection binds only admitted returned evidence and preserves R3 UNKNOWN', () => {
  const result=projectBrowserModelTurnFormation({modelTurnWitness:witness,capabilityRuntime:{schemaVersion:'vexlife.capability-assimilation-runtime/v1',mode:'DIRECT_SINGLE_TURN',inferenceCount:1,toolRequestCount:0,observationRefs:[],hiddenReasoningIncluded:false}});
  assert.equal(result.turnRef,'turn.browser.001');
  assert.equal(result.modelConnection.projectionRef,null);
  assert.equal(result.selfCapability.selfCapabilityFrameRef,null);
  assert.deepEqual(result.capabilityDisposition.heldRefs,['cap.c11','cap.c12']);
  assert.equal(result.privacy.rawReasoningIncluded,false);
});

test('feature-local EN/JA/ZH catalogs are exact-key complete', async () => {
  const registry={schemaVersion:'vexlife.model-turn-formation-browser/v1',registryRef:'registry.vexlife.model-turn-formation-browser.001',requiredLanguages:['en','ja','zh']};
  const catalog={
    summary:'x',state:'x',current:'x',unknown:'x',turn:'x',witness:'x',modelBundle:'x',operationalProfile:'x',runtimeRevision:'x',promptContext:'x',modelConnection:'x',selfCapability:'x',available:'x',held:'x',unavailable:'x',unknownCapabilities:'x',actuallyUsed:'x',nativeTool:'x',multimodal:'x',reasoning:'x',sealed:'x',notObserved:'x',effectsBoundary:'x',sourceBoundary:'x'
  };
  const map=new Map([
    ['../../blueprint/model-turn-formation-browser-registry.json',registry],
    ['../../blueprint/model-turn-formation-browser/strings/en.json',catalog],
    ['../../blueprint/model-turn-formation-browser/strings/ja.json',catalog],
    ['../../blueprint/model-turn-formation-browser/strings/zh.json',catalog]
  ]);
  const fetchImpl=async (url)=>({ok:map.has(url),status:map.has(url)?200:404,json:async()=>structuredClone(map.get(url))});
  const result=await loadModelTurnFormationReference('../../',fetchImpl);
  assert.equal(result.registry.registryRef,'registry.vexlife.model-turn-formation-browser.001');
  assert.deepEqual(Object.keys(result.catalogs.en).sort(),Object.keys(result.catalogs.ja).sort());
  assert.deepEqual(Object.keys(result.catalogs.en).sort(),Object.keys(result.catalogs.zh).sort());
});


test('chat controller attaches bounded formation projection to the exact returned companion message', () => {
  const source=fs.readFileSync(path.join(ROOT,'reference/browser/modules/chat-controller.js'),'utf8');
  assert.match(source,/projectBrowserModelTurnFormation/u);
  assert.match(source,/message\.modelTurnFormation\s*=\s*projectBrowserModelTurnFormation/u);
  assert.match(source,/renderModelTurnFormationDisclosure\(article,\s*message\.modelTurnFormation/u);
  assert.match(source,/modelTurnWitness:\s*body\.modelTurnWitness/u);
  assert.match(source,/capabilityRuntime:\s*body\.capabilityRuntime/u);
  assert.match(source,/promptContextMaterialization:\s*body\.promptContextMaterialization/u);
});
