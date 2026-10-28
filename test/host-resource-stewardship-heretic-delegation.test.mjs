import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BROWSER_PROMPT_CONTEXT_RUNTIME_AUTHORITY_REF,
  projectBrowserPromptHostResourceLeaseObservation
} from '../src/core/browser-prompt-context-runtime.mjs';
import {
  HERETIC_HOST_RESOURCE_CLASS,
  HERETIC_HOST_RESOURCE_REF,
  HERETIC_PERSISTENT_RUNTIME_OWNER_REF,
  HERETIC_PERSISTENT_RUNTIME_QUALIFIED,
  HERETIC_PERSISTENT_RUNTIME_RECEIPT_SCHEMA,
  HERETIC_PERSISTENT_RUNTIME_STOP_ACTION_REF,
  currentHereticRuntimeOwnerSourceIdentity,
  observeHereticPersistentRuntimeResource
} from '../src/core/heretic-persistent-runtime-owner.mjs';
import {
  HOST_RESOURCE_LEASE_OBSERVATION_SCHEMA,
  HOST_RESOURCE_OBSERVATION_SCHEMA,
  validateHostResourceLeaseObservation,
  validateHostResourceObservation
} from '../src/core/host-resource-stewardship.mjs';
import {
  createHereticStaleResourceDelegator,
  verifyHereticStewardshipDelegationReceipt
} from '../src/core/host-resource-stewardship-heretic-delegation.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function addressed(core, refField, prefix) {
  const semanticFingerprint = semanticHash(core);
  return Object.freeze({
    ...core,
    [refField]: `${prefix}.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

function resourceObservation({ ownershipState = 'EXACT_VEX_OWNED', lifecycleState = 'STALE', currentness = 'CURRENT' } = {}) {
  const exact = ownershipState === 'EXACT_VEX_OWNED';
  const core = {
    schemaVersion: HOST_RESOURCE_OBSERVATION_SCHEMA,
    truthClass: 'SOURCE_BOUND_HOST_RESOURCE_OBSERVATION',
    resourceRef: HERETIC_HOST_RESOURCE_REF,
    resourceClass: HERETIC_HOST_RESOURCE_CLASS,
    ownershipState,
    lifecycleState,
    lifecycleEvidenceRefOrNull: ['STALE', 'ABANDONED'].includes(lifecycleState)
      ? 'evidence.vexlife.heretic.test.lifecycle'
      : null,
    currentness,
    ownershipProof: exact ? {
      currentness: 'CURRENT',
      ownerReceiptRef: 'receipt.vexlife.heretic.test',
      runtimeIdentityRef: 'runtime.vexlife.heretic.test',
      executableIdentityRef: 'executable.vexlife.heretic.test',
      processGroupIdentityRef: 'process-group.vexlife.heretic.test',
      pidMatchOnly: false,
      exactOwnedProcessInstance: true
    } : null,
    sourceRefs: ['source.vexlife.heretic.test']
  };
  return addressed(core, 'resourceObservationRef', 'observation.vexlife.host-resource');
}

function leaseObservation({ state = 'NONE', currentness = 'CURRENT' } = {}) {
  const core = {
    schemaVersion: HOST_RESOURCE_LEASE_OBSERVATION_SCHEMA,
    truthClass: 'SOURCE_BOUND_HOST_RESOURCE_LEASE_OBSERVATION',
    resourceRef: HERETIC_HOST_RESOURCE_REF,
    state,
    currentness,
    leaseRefOrNull: state === 'ACTIVE' ? 'lease.vexlife.browser-prompt-context.test' : null,
    sourceRefs: ['authority.vexlife.browser-prompt-context-runtime']
  };
  return addressed(core, 'leaseObservationRef', 'observation.vexlife.host-resource-lease');
}

function leaseOwner(observation) {
  return Object.freeze({
    authorityRef: BROWSER_PROMPT_CONTEXT_RUNTIME_AUTHORITY_REF,
    hostResourceLeaseObservation: () => observation
  });
}

function observerSequence(values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function stopped() {
  return {
    disposition: 'STOPPED_EXACT_OWNED_MLX_RUNTIME',
    pid: 4242,
    processGroupId: 4242,
    signalSent: 'SIGTERM',
    verifiedNotLive: true,
    processTerminationPerformed: true,
    effects: { modelRuntime: true }
  };
}


function readdressDelegationReceipt(value, overrides = {}) {
  const core = { ...structuredClone(value), ...structuredClone(overrides) };
  delete core.delegationReceiptRef;
  delete core.semanticFingerprint;
  const semanticFingerprint = semanticHash(core);
  return Object.freeze({
    ...core,
    delegationReceiptRef: `receipt.vexlife.host-resource-stewardship-heretic.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

test('V5-HRD-00 stale exact-owned Heretic + current NONE lease delegates exactly once to rightful owner', async () => {
  let stops = 0;
  const preResourceObservation = resourceObservation();
  const preLeaseObservation = leaseObservation();
  const postResourceObservation = resourceObservation({ ownershipState: 'UNOWNED', lifecycleState: 'ABANDONED' });
  const stopResult = stopped();
  const delegator = createHereticStaleResourceDelegator({
    promptContextRuntime: leaseOwner(preLeaseObservation),
    observeResource: observerSequence([
      preResourceObservation,
      postResourceObservation
    ]),
    stopRuntime: async () => { stops += 1; return stopResult; },
    now: () => '2026-10-27T11:45:00.000Z'
  });
  const receipt = await delegator.delegate({ receiptPath: '/tmp/heretic-owner-receipt.json' });
  assert.equal(stops, 1);
  assert.equal(receipt.disposition, 'DELEGATED_AND_STOPPED_EXACT_OWNED_HERETIC_RUNTIME');
  assert.equal(receipt.processTerminationPerformed, true);
  assert.equal(receipt.effects.processTerminated, true);
  assert.equal(receipt.effects.memoryMutated, false);
  assert.equal(receipt.effects.trainingRan, false);
  assert.equal(verifyHereticStewardshipDelegationReceipt(receipt, {
    resourceObservation: preResourceObservation,
    leaseObservation: preLeaseObservation,
    stopResult,
    postResourceObservation
  }), true);
  assert.equal(verifyHereticStewardshipDelegationReceipt(receipt), false);
  assert.equal(verifyHereticStewardshipDelegationReceipt(receipt, {
    resourceObservation: preResourceObservation,
    leaseObservation: preLeaseObservation,
    stopResult: { ...stopResult, pid: 9999 },
    postResourceObservation
  }), false);
  assert.equal(verifyHereticStewardshipDelegationReceipt(receipt, {
    resourceObservation: preResourceObservation,
    leaseObservation: preLeaseObservation,
    stopResult: { ...stopResult, signalSent: 'SIGKILL' },
    postResourceObservation
  }), false);
});

test('V5-HRD-01 active current Context Lease blocks cleanup before stop owner is called', async () => {
  let stops = 0;
  const preResourceObservation = resourceObservation();
  const preLeaseObservation = leaseObservation({ state: 'ACTIVE' });
  const delegator = createHereticStaleResourceDelegator({
    promptContextRuntime: leaseOwner(preLeaseObservation),
    observeResource: () => preResourceObservation,
    stopRuntime: async () => { stops += 1; return stopped(); },
    now: () => '2026-10-27T11:45:00.000Z'
  });
  const receipt = await delegator.delegate({ receiptPath: '/tmp/heretic-owner-receipt.json' });
  assert.equal(stops, 0);
  assert.equal(receipt.disposition, 'HELD_NO_EFFECT');
  assert.equal(receipt.processTerminationPerformed, false);
  assert.equal(verifyHereticStewardshipDelegationReceipt(receipt, {
    resourceObservation: preResourceObservation,
    leaseObservation: preLeaseObservation
  }), true);
});

test('V5-HRD-02 current Heretic resource is KEEP and never reaches stop owner', async () => {
  let stops = 0;
  const delegator = createHereticStaleResourceDelegator({
    promptContextRuntime: leaseOwner(leaseObservation()),
    observeResource: () => resourceObservation({ lifecycleState: 'CURRENT' }),
    stopRuntime: async () => { stops += 1; return stopped(); },
    now: () => '2026-10-27T11:45:00.000Z'
  });
  const receipt = await delegator.delegate({ receiptPath: '/tmp/heretic-owner-receipt.json' });
  assert.equal(stops, 0);
  assert.equal(receipt.disposition, 'HELD_NO_EFFECT');
});

test('V5-HRD-03 fresh ownership change fails closed even when an earlier shape would have been cleanup-eligible', async () => {
  let stops = 0;
  const delegator = createHereticStaleResourceDelegator({
    promptContextRuntime: leaseOwner(leaseObservation()),
    observeResource: () => resourceObservation({ ownershipState: 'AMBIGUOUS', lifecycleState: 'UNKNOWN' }),
    stopRuntime: async () => { stops += 1; return stopped(); },
    now: () => '2026-10-27T11:45:00.000Z'
  });
  const receipt = await delegator.delegate({ receiptPath: '/tmp/heretic-owner-receipt.json' });
  assert.equal(stops, 0);
  assert.equal(receipt.disposition, 'HELD_NO_EFFECT');
});

test('V5-HRD-04 stale or unknown lease evidence cannot grant cleanup eligibility', async () => {
  for (const currentness of ['STALE', 'UNKNOWN']) {
    let stops = 0;
    const delegator = createHereticStaleResourceDelegator({
      promptContextRuntime: leaseOwner(leaseObservation({ state: 'STALE', currentness })),
      observeResource: () => resourceObservation(),
      stopRuntime: async () => { stops += 1; return stopped(); },
      now: () => '2026-10-27T11:45:00.000Z'
    });
    const receipt = await delegator.delegate({ receiptPath: '/tmp/heretic-owner-receipt.json' });
    assert.equal(stops, 0);
    assert.equal(receipt.disposition, 'HELD_NO_EFFECT');
  }
});

test('V5-HRD-05 rightful owner conflict propagates instead of manufacturing successful cleanup', async () => {
  const delegator = createHereticStaleResourceDelegator({
    promptContextRuntime: leaseOwner(leaseObservation()),
    observeResource: () => resourceObservation(),
    stopRuntime: async () => {
      const error = new Error('identity changed before stop');
      error.code = 'HERETIC_RUNTIME_OWNERSHIP_CONFLICT';
      throw error;
    },
    now: () => '2026-10-27T11:45:00.000Z'
  });
  await assert.rejects(
    () => delegator.delegate({ receiptPath: '/tmp/heretic-owner-receipt.json' }),
    (error) => error.code === 'HERETIC_RUNTIME_OWNERSHIP_CONFLICT'
  );
});

test('V5-HRD-06 already-absent runtime remains an explicit no-effect outcome', async () => {
  const delegator = createHereticStaleResourceDelegator({
    promptContextRuntime: leaseOwner(leaseObservation()),
    observeResource: observerSequence([
      resourceObservation(),
      resourceObservation({ ownershipState: 'UNOWNED', lifecycleState: 'ABANDONED' })
    ]),
    stopRuntime: async () => ({ disposition: 'ALREADY_NOT_LIVE', pid: 4242, processTerminationPerformed: false, effects: {} }),
    now: () => '2026-10-27T11:45:00.000Z'
  });
  const receipt = await delegator.delegate({ receiptPath: '/tmp/heretic-owner-receipt.json' });
  assert.equal(receipt.disposition, 'NO_EFFECT_RESOURCE_ALREADY_ABSENT');
  assert.equal(receipt.processTerminationPerformed, false);
  assert.ok(Object.values(receipt.effects).every((value) => value === false));
});

test('V5-HRD-07 Browser prompt owner projects current NONE/ACTIVE lease truth and expires stale selections fail-closed', () => {
  const observedAt = '2026-10-27T11:45:00.000Z';
  const none = projectBrowserPromptHostResourceLeaseObservation({
    resourceRef: HERETIC_HOST_RESOURCE_REF,
    activeLeases: [],
    observedAt
  });
  assert.equal(validateHostResourceLeaseObservation(none).state, 'NONE');

  const activeLease = {
    leaseRef: 'lease.vexlife.browser-prompt-context.test',
    currentness: 'CURRENT',
    lifecycle: 'ACTIVE',
    formedAt: '2026-10-27T11:44:00.000Z',
    expiresAt: '2026-10-27T11:46:00.000Z',
    observedAt: '2026-10-27T11:44:30.000Z',
    schedulerGeneration: 8,
    runtimeSnapshotFingerprint: 'a'.repeat(64)
  };
  const active = projectBrowserPromptHostResourceLeaseObservation({
    resourceRef: HERETIC_HOST_RESOURCE_REF,
    activeLeases: [activeLease],
    observedAt
  });
  assert.equal(validateHostResourceLeaseObservation(active).state, 'ACTIVE');
  assert.equal(active.leaseRefOrNull, activeLease.leaseRef);

  const expired = projectBrowserPromptHostResourceLeaseObservation({
    resourceRef: HERETIC_HOST_RESOURCE_REF,
    activeLeases: [{ ...activeLease, expiresAt: '2026-10-27T11:44:59.000Z' }],
    observedAt
  });
  assert.equal(validateHostResourceLeaseObservation(expired).state, 'NONE');
});

test('V5-HRD-08 Heretic owner fresh observation binds an exact live stale-source process instance', () => {
  const receiptPath = '/tmp/heretic-owner-receipt.json';
  const pid = 4242;
  const pgid = 4242;
  const modelPath = '/tmp/heretic-model';
  const pythonPath = '/tmp/heretic-python/bin/python';
  const pythonEnvironmentRoot = '/tmp/heretic-python';
  const args = [
    '-m', 'mlx_lm.server', '--model', modelPath, '--host', '127.0.0.1', '--port', '11434',
    '--chat-template-args', '{"enable_thinking":false}'
  ];
  const receipt = {
    schemaVersion: HERETIC_PERSISTENT_RUNTIME_RECEIPT_SCHEMA,
    receiptRef: 'receipt.vexlife.heretic.test',
    state: HERETIC_PERSISTENT_RUNTIME_QUALIFIED,
    formedAt: '2026-10-27T11:40:00.000Z',
    authorityRef: 'authority.vexlife.heretic.test',
    modelRef: 'model.devex.heretic.qwen3.8-27b.mlx4.329658ee8f27',
    modelProfileRef: 'model-profile.devex.qwen38-27b-heretic-mlx4.certified.20260928A',
    artifactRef: 'artifact.devex.qwen3.8-27b-heretic-mlx-4bit.808b82a2',
    artifactCustodyEvidenceRef: 'resolution.model-preservation.artifact-custody.devex.qwen38-27b-heretic-mlx4.20260928A',
    artifactContentSetSha256: '329658ee8f270056bc29d8a6cfd6e9f1b7d9d14c659452c9e4dd46fc7c78d780',
    runtimeAdapterRef: 'adapter.runtime.mlx.macos-victor.001',
    runtimeClass: 'MLX_LM_DIRECT_RUNTIME',
    transportClass: 'MLX_LM_OPENAI_NUMERIC_LOOPBACK',
    hostExecutionProfileRef: 'profile.repository.vexlife.macos-v1',
    pythonVersion: '3.14.7',
    mlxLmVersion: '0.32.0',
    trainerSourceCommit: '170a11c58ce7d22a720901a2535adb0c218b871b',
    modelPath,
    pythonPath,
    pythonEnvironmentRoot,
    endpoint: 'http://127.0.0.1:11434',
    requestModel: 'default_model',
    sourceIdentity: {
      repository: 'vgong24/VexLife',
      modulePath: 'src/core/heretic-persistent-runtime-owner.mjs',
      moduleSha256: '0'.repeat(64)
    },
    runtime: { pid, processGroupId: pgid, exactOwnedDetachedGroup: true, args },
    effects: {}
  };
  assert.notEqual(receipt.sourceIdentity.moduleSha256, currentHereticRuntimeOwnerSourceIdentity().moduleSha256);
  const observed = observeHereticPersistentRuntimeResource({
    receiptPath,
    hooks: {
      readReceipt: () => receipt,
      processAlive: () => true,
      processIdentity: () => ({ pid, pgid, exactOwnedDetachedGroup: true })
    }
  });
  const canonical = validateHostResourceObservation(observed);
  assert.equal(canonical.resourceRef, HERETIC_HOST_RESOURCE_REF);
  assert.equal(canonical.resourceClass, HERETIC_HOST_RESOURCE_CLASS);
  assert.equal(canonical.ownershipState, 'EXACT_VEX_OWNED');
  assert.equal(canonical.lifecycleState, 'STALE');
  assert.equal(canonical.ownershipProof.ownerReceiptRef, receipt.receiptRef);
  assert.equal(canonical.ownershipProof.processGroupIdentityRef, `process-group.vexlife.heretic.${pgid}`);
});

test('V5-HRD-09 delegation source never acquires a direct process-kill primitive', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/core/host-resource-stewardship-heretic-delegation.mjs'), 'utf8');
  for (const forbidden of ['process.kill', 'node:child_process', 'SIGTERM', 'SIGKILL', 'spawn(', 'exec(']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.ok(source.includes('stopHereticPersistentRuntimeFromReceipt'));
  assert.ok(source.includes('HERETIC_PERSISTENT_RUNTIME_OWNER_REF'));
  assert.ok(source.includes('HERETIC_PERSISTENT_RUNTIME_STOP_ACTION_REF'));
});


test('V5-HRD-10 source-bound verifier rejects a coherently re-addressed successful-stop receipt against active lease truth', async () => {
  const preResourceObservation = resourceObservation();
  const activeLeaseObservation = leaseObservation({ state: 'ACTIVE' });
  const delegator = createHereticStaleResourceDelegator({
    promptContextRuntime: leaseOwner(activeLeaseObservation),
    observeResource: () => preResourceObservation,
    stopRuntime: async () => {
      throw new Error('stop must not be reached under an active lease');
    },
    now: () => '2026-10-27T11:45:00.000Z'
  });
  const held = await delegator.delegate({ receiptPath: '/tmp/heretic-owner-receipt.json' });
  assert.equal(held.disposition, 'HELD_NO_EFFECT');

  const postResourceObservation = resourceObservation({
    ownershipState: 'UNOWNED',
    lifecycleState: 'ABANDONED'
  });
  const forgedEffects = {
    ...held.effects,
    hostMutated: true,
    processSignalled: true,
    processTerminated: true,
    runtimeMutated: true
  };
  const forgedSourceRefs = [...new Set([
    ...held.sourceRefs,
    postResourceObservation.resourceObservationRef,
    ...postResourceObservation.sourceRefs
  ])].sort();
  const forged = readdressDelegationReceipt(held, {
    stopDispositionOrNull: 'STOPPED_EXACT_OWNED_MLX_RUNTIME',
    stopPidOrNull: 4242,
    stopResultFingerprintOrNull: semanticHash(stopped()),
    postEffectResourceObservationRefOrNull: postResourceObservation.resourceObservationRef,
    disposition: 'DELEGATED_AND_STOPPED_EXACT_OWNED_HERETIC_RUNTIME',
    processTerminationPerformed: true,
    sourceRefs: forgedSourceRefs,
    effects: forgedEffects
  });

  assert.equal(verifyHereticStewardshipDelegationReceipt(forged, {
    resourceObservation: preResourceObservation,
    leaseObservation: activeLeaseObservation,
    stopResult: stopped(),
    postResourceObservation
  }), false);
});

test('V5-HRD-11 source-bound verifier rejects missing or wrong post-effect evidence for an effectful receipt', async () => {
  const preResourceObservation = resourceObservation();
  const preLeaseObservation = leaseObservation();
  const postResourceObservation = resourceObservation({ ownershipState: 'UNOWNED', lifecycleState: 'ABANDONED' });
  const stopResult = stopped();
  const delegator = createHereticStaleResourceDelegator({
    promptContextRuntime: leaseOwner(preLeaseObservation),
    observeResource: observerSequence([preResourceObservation, postResourceObservation]),
    stopRuntime: async () => stopResult,
    now: () => '2026-10-27T11:45:00.000Z'
  });
  const receipt = await delegator.delegate({ receiptPath: '/tmp/heretic-owner-receipt.json' });

  assert.equal(verifyHereticStewardshipDelegationReceipt(receipt, {
    resourceObservation: preResourceObservation,
    leaseObservation: preLeaseObservation,
    stopResult
  }), false);
  assert.equal(verifyHereticStewardshipDelegationReceipt(receipt, {
    resourceObservation: preResourceObservation,
    leaseObservation: preLeaseObservation,
    stopResult,
    postResourceObservation: resourceObservation({ lifecycleState: 'CURRENT' })
  }), false);
});


// [VXG RealForever]
