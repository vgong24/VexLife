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
  RELEASE_RUNTIME_RECOVERY_ADAPTER_REF,
  createReleaseRuntimeCompanionRecoveryOwner
} from '../src/core/browser-companion-recovery-owner.mjs';
import { initializeLivedCompanionHome } from '../src/core/lived-companion.mjs';
import { createServerOwnedBrowserCompanionBridge } from '../scripts/serve-browser-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profiles = JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint', 'vex-operational-profiles.json'), 'utf8'));
const bundles = JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint', 'model-bundle-registry.json'), 'utf8'));
const macProfile = profiles.profiles.find((profile) => profile.platform === 'darwin');
const bundle = bundles.bundles.find((item) => item.modelBundleRef === bundles.activeModelBundleRef);

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
