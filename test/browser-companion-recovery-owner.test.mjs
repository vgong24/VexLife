import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildVexInitializationPlan,
  selectOperationalProfile,
  validateRecoveryCurrentBinding
} from '../src/core/vex-initialization.mjs';
import {
  ACTIVATED_RUNTIME_RECOVERY_OWNER_REF,
  RELEASE_RUNTIME_RECOVERY_ADAPTER_REF,
  createActivatedRuntimeCompanionRecoveryOwner,
  createCompanionRecoveryOwner,
  createReleaseRuntimeCompanionRecoveryOwner
} from '../src/core/browser-companion-recovery-owner.mjs';
import { initializeLivedCompanionHome } from '../src/core/lived-companion.mjs';
import { createServerOwnedBrowserCompanionBridge } from '../scripts/serve-browser-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profiles = JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint', 'vex-operational-profiles.json'), 'utf8'));
const bundles = JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint', 'model-bundle-registry.json'), 'utf8'));
const macProfile = profiles.profiles.find((profile) => profile.platform === 'darwin');
const bundle = bundles.bundles.find((item) => item.modelBundleRef === bundles.activeModelBundleRef);
const ACTIVATED_ADAPTER_REF = 'adapter.runtime.mlx.macos-victor.post-w5.001';
const activatedBindingFixture = Object.freeze({
  state: 'ACTIVE_ACCEPTED',
  bindingRef: 'binding.vexlife.activated-m4.synthetic-test',
  generationRef: 'generation.vex.m4.synthetic-test',
  modelRef: 'model.vex.m4.synthetic-test',
  modelProfileRef: 'model-profile.vex.m4.synthetic-test',
  runtime: Object.freeze({ runtimeAdapterRef: ACTIVATED_ADAPTER_REF })
});

function modelConfiguration(overrides = {}) {
  return {
    schemaVersion: 'vexlife.model-configuration/v1', state: 'BOUND_QUALIFIED',
    profileRef: macProfile.profileRef, activeModelBundleRef: bundle.modelBundleRef,
    generationRef: bundle.generationRef, modelProfileRef: bundle.modelProfileRef,
    endpoint: macProfile.endpoint.origin, requestModel: bundle.requestModel,
    activeArtifactRef: bundle.baseModelArtifactRef, runtimeDependencyRef: macProfile.runtime.dependencyRef,
    runtimeExecutableSha256SourcePinned: macProfile.runtime.executableSha256,
    automaticDownload: false, automaticActivation: false,
    ...overrides
  };
}

function request(identity, overrides = {}) {
  return {
    schemaVersion:'vexlife.companion-recovery-request/v1', truthClass:'SAME_BINDING_RECOVERY_REQUEST',
    contractRef:'contract.vexlife.companion-recovery-effect.001', actionRef:'action.companion.reenter-current-binding',
    availabilityProjectionRef:'projection.vexlife.companion-availability.test', reentryPlanRef:'plan.vexlife.companion-reentry.test',
    idempotencyKey:'companion-reentry:' + '1'.repeat(64), bindingRef:'binding.vexlife.release.test',
    homeRef:identity.homeRef, companionLineageRef:identity.companionLineageRef,
    modelRefOrNull:bundle.modelProfileRef, generationRefOrNull:bundle.generationRef,
    runtimeAdapterRef:RELEASE_RUNTIME_RECOVERY_ADAPTER_REF, runtimeObservationRef:'observation.runtime.release.test',
    effectAuthorityGranted:false, executionDisposition:'DELEGATE_TO_RIGHTFUL_RUNTIME_ADAPTER',
    requestRef:'request.vexlife.companion-recovery.test', requestSha256:'2'.repeat(64), ...overrides
  };
}

function activatedRequest(identity, overrides = {}) {
  return request(identity, {
    bindingRef: activatedBindingFixture.bindingRef,
    modelRefOrNull: activatedBindingFixture.modelRef,
    generationRefOrNull: activatedBindingFixture.generationRef,
    runtimeAdapterRef: ACTIVATED_ADAPTER_REF,
    runtimeObservationRef: 'observation.runtime.activated.test',
    requestRef: 'request.vexlife.companion-recovery.activated.test',
    requestSha256: '3'.repeat(64),
    ...overrides
  });
}

function makeHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-recovery-owner-'));
  const home = path.join(root, 'home');
  const identity = initializeLivedCompanionHome({
    home, homeRef:'vex-home.recovery-owner-test', familyRef:'vex-family.recovery-owner-test',
    deviceRef:'device.vexlife.recovery-owner-test', companionLineageRef:'companion-lineage.vexlife.recovery-owner-test'
  });
  fs.mkdirSync(path.join(home, 'config'), { recursive: true });
  fs.writeFileSync(path.join(home, 'config', 'model.json'), JSON.stringify(modelConfiguration(), null, 2));
  return { root, home, identity: { homeRef: identity.manifest.homeRef, companionLineageRef: identity.manifest.currentCompanionLineageRef } };
}

test('recovery-current-binding selects only release-qualified profile and advertises no network fetch', () => {
  const selected = selectOperationalProfile({ registry: profiles, platform:'darwin', architecture:'arm64', mode:'recovery-current-binding' });
  assert.equal(selected.state, 'PROFILE_RESOLVED');
  const plan = buildVexInitializationPlan({ profile: macProfile, modelBundle: bundle, modelArtifacts: macProfile.modelArtifacts, home:'/tmp/vex', homeState:'EXISTING_HOME_PRESERVED', hostEvidence:{platform:'darwin'}, mode:'recovery-current-binding' });
  assert.equal(plan.effects.networkFetch, false);
  assert.equal(plan.effects.processLaunch, true);
});

test('recovery-current-binding identity validator fails closed on model/generation drift', () => {
  assert.equal(validateRecoveryCurrentBinding({ profile:macProfile, modelBundle:bundle, modelConfiguration:modelConfiguration() }).ok, true);
  const wrong = validateRecoveryCurrentBinding({ profile:macProfile, modelBundle:bundle, modelConfiguration:modelConfiguration({generationRef:'generation.foreign'}) });
  assert.equal(wrong.ok, false);
  assert.ok(wrong.errors.some((item) => item.includes('generationRef')));
});

test('rightful recovery owner preserves exact binding and is idempotent', async () => {
  const {root,home,identity}=makeHome(); let calls=0;
  try {
    const owner=createReleaseRuntimeCompanionRecoveryOwner({home,proofClass:'SYNTHETIC',runInitializer:async()=>{calls+=1;return {state:'RUNTIME_QUALIFIED',profileRef:macProfile.profileRef,activeModelBundleRef:bundle.modelBundleRef,generationRef:bundle.generationRef,runtimePid:123,endpoint:macProfile.endpoint.origin,requestModel:bundle.requestModel};}});
    const first=await owner.recover(request(identity)); const second=await owner.recover(request(identity));
    assert.equal(calls,1); assert.deepEqual(second,first);
    assert.equal(first.disposition,'PERFORMED_SAME_BINDING_REENTRY');
    assert.equal(first.postRecoveryObservationRequired,true); assert.equal(first.proofClass,'SYNTHETIC');
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('rightful recovery owner rejects foreign identity before runtime effect', async () => {
  const {root,home,identity}=makeHome(); let calls=0;
  try {
    const owner=createReleaseRuntimeCompanionRecoveryOwner({home,proofClass:'SYNTHETIC',runInitializer:async()=>{calls+=1;throw new Error('must not run');}});
    await assert.rejects(()=>owner.recover(request(identity,{homeRef:'vex-home.foreign'})),/RECOVERY_HOME_IDENTITY_MISMATCH/u);
    assert.equal(calls,0);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('activated recovery owner resumes only an already-current accepted binding and remains idempotent', async () => {
  const {root,home,identity}=makeHome(); let calls=0;
  try {
    const owner=createActivatedRuntimeCompanionRecoveryOwner({
      home,
      proofClass:'SYNTHETIC',
      loadRegistry:()=>({binding:activatedBindingFixture}),
      readSourceIdentity:async()=>({registrySha256:'a'.repeat(64),moduleSha256:'b'.repeat(64),sourceBindingSha256:'c'.repeat(64)}),
      startOrResumeRuntime:async(options)=>{
        calls+=1;
        assert.equal(options.handoffBytes,null);
        assert.equal(options.handoffSha256,null);
        assert.deepEqual(options.environment,{});
        return {
          bindingRef:activatedBindingFixture.bindingRef,
          homeRef:identity.homeRef,
          companionLineageRef:identity.companionLineageRef,
          generationRef:activatedBindingFixture.generationRef,
          modelRef:activatedBindingFixture.modelRef,
          modelProfileRef:activatedBindingFixture.modelProfileRef,
          runtimeAttemptRef:'attempt.vexlife.activated-recovery.test',
          receiptRef:'receipt.vexlife.activated-runtime.test'
        };
      }
    });
    const input=activatedRequest(identity);
    const first=await owner.recover(input);
    const second=await owner.recover(input);
    assert.equal(calls,1);
    assert.deepEqual(second,first);
    assert.equal(first.effectOwnerRef,ACTIVATED_RUNTIME_RECOVERY_OWNER_REF);
    assert.equal(first.runtimeAdapterRef,ACTIVATED_ADAPTER_REF);
    assert.equal(first.disposition,'PERFORMED_SAME_BINDING_REENTRY');
    assert.equal(first.postRecoveryObservationRequired,true);
    assert.equal(first.proofClass,'SYNTHETIC');
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('activated recovery rejects identity drift before runtime effect', async () => {
  const {root,home,identity}=makeHome(); let calls=0;
  try {
    const owner=createActivatedRuntimeCompanionRecoveryOwner({
      home,
      proofClass:'SYNTHETIC',
      loadRegistry:()=>({binding:activatedBindingFixture}),
      readSourceIdentity:async()=>({registrySha256:'a'.repeat(64),moduleSha256:'b'.repeat(64),sourceBindingSha256:'c'.repeat(64)}),
      startOrResumeRuntime:async()=>{calls+=1;throw new Error('must not run');}
    });
    await assert.rejects(()=>owner.recover(activatedRequest(identity,{generationRefOrNull:'generation.foreign'})),/ACTIVATED_RECOVERY_GENERATION_IDENTITY_MISMATCH/u);
    assert.equal(calls,0);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('composite recovery owner dispatches only exact owned runtime adapters', async () => {
  const calls=[];
  const owner=createCompanionRecoveryOwner({
    home:'/tmp/vexlife-unused-composite-home',
    proofClass:'SYNTHETIC',
    releaseOwnerFactory:()=>Object.freeze({recover:async(input)=>{calls.push('release');return input;}}),
    activatedOwnerFactory:()=>Object.freeze({runtimeAdapterRef:ACTIVATED_ADAPTER_REF,recover:async(input)=>{calls.push('activated');return input;}})
  });
  await owner.recover({runtimeAdapterRef:RELEASE_RUNTIME_RECOVERY_ADAPTER_REF});
  await owner.recover({runtimeAdapterRef:ACTIVATED_ADAPTER_REF});
  await assert.rejects(()=>owner.recover({runtimeAdapterRef:'adapter.runtime.foreign'}),/RECOVERY_RUNTIME_ADAPTER_UNOWNED/u);
  assert.deepEqual(calls,['release','activated']);
});

test('server-owned Browser Companion composition binds one rightful recovery owner', () => {
  let captured=null;
  const fakeOwner=Object.freeze({recover:async()=>null}); const fakeBridge=Object.freeze({});
  const result=createServerOwnedBrowserCompanionBridge({
    sourceRoot:ROOT, companionHome:path.join(os.tmpdir(),'vexlife-unused-home'),
    recoveryOwnerFactory:()=>fakeOwner,
    bridgeFactory:(options)=>{captured=options;return fakeBridge;}
  });
  assert.equal(result,fakeBridge); assert.equal(captured.recoveryOwner,fakeOwner);
});

// [VXG RealForever]
