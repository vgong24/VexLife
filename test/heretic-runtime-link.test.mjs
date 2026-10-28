import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HERETIC_REQUEST_MODEL,
  HERETIC_RUNTIME_ADAPTER_REF,
  HERETIC_RUNTIME_CLASS,
  HERETIC_RUNTIME_IDENTITY,
  HERETIC_RUNTIME_LINK_SCHEMA,
  HERETIC_RUNTIME_RECEIPT_SCHEMA,
  HERETIC_TRANSPORT_CLASS,
  formHereticPersistentRuntimeBindingRef,
  formHereticPersistentRuntimeLink,
  formHereticPersistentRuntimeObservedLink,
  formHereticPersistentRuntimeStoppedObservation,
  validateHereticPersistentRuntimeReceipt,
} from '../src/core/heretic-runtime-link.mjs';

function receipt(overrides = {}) {
  const base = {
    schemaVersion: HERETIC_RUNTIME_RECEIPT_SCHEMA,
    receiptRef: 'receipt.vexlocalbridge.heretic-persistent-runtime.test',
    state: 'PERSISTENT_MLX_RUNTIME_QUALIFIED',
    formedAt: '2026-10-11T22:00:00.000Z',
    authorityRef: 'authority.heretic.runtime.test',
    ...HERETIC_RUNTIME_IDENTITY,
    modelPath: '/private/heretic/model',
    pythonPath: '/private/heretic/env/bin/python',
    pythonEnvironmentRoot: '/private/heretic/env',
    endpoint: 'http://127.0.0.1:18084',
    requestModel: HERETIC_REQUEST_MODEL,
    sourceIdentity: {
      repository: 'vgong24/Vextreme-SDK',
      revision: '1'.repeat(40),
      tree: '2'.repeat(40),
      moduleSha256: '3'.repeat(64),
    },
    runtime: {
      pid: 51001,
      processGroupId: 51001,
      exactOwnedDetachedGroup: true,
      args: ['-m','mlx_lm.server','--model','/private/heretic/model','--host','127.0.0.1','--port','18084'],
    },
    qualification: {
      healthAndExactModelVerified: true,
      actualChatCompletionPerformed: true,
      loadResultRef: 'result.vexlocalbridge.heretic.loopback.test',
    },
    effects: {
      modelRuntime: true,
      providerNetwork: false,
      modelDownload: false,
      artifactMutation: false,
      training: false,
      weightMutation: false,
      memoryMutation: false,
      activation: false,
      succession: false,
      publication: false,
      repositoryMutation: false,
      homeMutation: false,
    },
  };
  return { ...base, ...overrides };
}

const homeIdentity = Object.freeze({
  homeRef: 'vex-home.heretic-initial-boot.test',
  companionLineageRef: 'companion-lineage.heretic-initial-boot.test',
});

test('exact accepted Heretic persistent receipt forms one Browser/Home runtime link', () => {
  const link = formHereticPersistentRuntimeLink({ receipt: receipt(), homeIdentity });
  assert.equal(link.schemaVersion, HERETIC_RUNTIME_LINK_SCHEMA);
  assert.equal(link.state, 'BOUND_CURRENT');
  assert.equal(link.endpoint, 'http://127.0.0.1:18084');
  assert.equal(link.requestModel, 'default_model');
  assert.equal(link.runtimeAdapterRef, HERETIC_RUNTIME_ADAPTER_REF);
  assert.equal(link.modelRef, HERETIC_RUNTIME_IDENTITY.modelRef);
  assert.equal(link.companionBinding.truthClass, 'FOREIGN_CANONICAL_COMPANION_BINDING');
  assert.equal(link.companionBinding.modelRefOrNull, HERETIC_RUNTIME_IDENTITY.modelRef);
  assert.equal(link.companionBinding.generationRefOrNull, null);
  assert.equal(link.runtimeObservation.truthClass, 'FOREIGN_PLATFORM_RUNTIME_OBSERVATION');
  assert.equal(link.runtimeObservation.runtimeOwnershipState, 'EXACT_OWNED');
  assert.equal(link.runtimeObservation.runtimeState, 'HEALTHY');
  assert.equal(link.runtimeObservation.qualificationState, 'CURRENT');
  assert.equal(link.runtimeObservation.safeReentryState, 'HELD');
  assert.equal(link.effects.runtimeEffectPerformed, false);
});

test('link projection strips private model/python paths from VexLife-facing output', () => {
  const link = formHereticPersistentRuntimeLink({ receipt: receipt(), homeIdentity });
  const text = JSON.stringify(link);
  assert.equal(text.includes('/private/heretic/model'), false);
  assert.equal(text.includes('/private/heretic/env'), false);
});

test('wrong model/runtime/transport/version identities fail closed', () => {
  for (const [field, value] of [
    ['modelRef', 'model.foreign'],
    ['runtimeAdapterRef', 'adapter.runtime.foreign'],
    ['runtimeClass', 'FOREIGN_RUNTIME'],
    ['transportClass', 'FOREIGN_TRANSPORT'],
    ['pythonVersion', '3.13.0'],
    ['mlxLmVersion', '0.31.0'],
  ]) {
    assert.throws(
      () => validateHereticPersistentRuntimeReceipt(receipt({ [field]: value })),
      /accepted Heretic runtime identity/u,
      field,
    );
  }
});

test('non-loopback endpoint or failed qualification is rejected', () => {
  assert.throws(
    () => validateHereticPersistentRuntimeReceipt(receipt({ endpoint: 'http://192.0.2.1:18084' })),
    /numeric loopback/u,
  );
  assert.throws(
    () => validateHereticPersistentRuntimeReceipt(receipt({
      qualification: {
        healthAndExactModelVerified: true,
        actualChatCompletionPerformed: false,
        loadResultRef: null,
      },
    })),
    /qualification/u,
  );
});

test('receipt must bind one exact owned detached mlx_lm.server', () => {
  assert.throws(
    () => validateHereticPersistentRuntimeReceipt(receipt({
      runtime: {
        pid: 51001,
        processGroupId: 51002,
        exactOwnedDetachedGroup: true,
        args: ['-m','mlx_lm.server','--model','/private/heretic/model','--host','127.0.0.1','--port','18084'],
      },
    })),
    /exact owned detached/u,
  );
});

test('protected effect drift is rejected before VexLife binding', () => {
  assert.throws(
    () => validateHereticPersistentRuntimeReceipt(receipt({
      effects: {
        ...receipt().effects,
        modelDownload: true,
      },
    })),
    /protected effect boundary/u,
  );
});

test('link identity is deterministic for the same receipt and Home', () => {
  const a = formHereticPersistentRuntimeLink({ receipt: receipt(), homeIdentity });
  const b = formHereticPersistentRuntimeLink({ receipt: receipt(), homeIdentity });
  assert.equal(a.companionBinding.bindingRef, b.companionBinding.bindingRef);
  assert.equal(a.runtimeObservation.observationRef, b.runtimeObservation.observationRef);
  assert.equal(a.runtimeObservation.adapterRef, HERETIC_RUNTIME_ADAPTER_REF);
  assert.equal(HERETIC_RUNTIME_CLASS, 'MLX_LM_DIRECT_RUNTIME');
  assert.equal(HERETIC_TRANSPORT_CLASS, 'MLX_LM_OPENAI_NUMERIC_LOOPBACK');
});

test('binding identity survives runtime receipt/PID/source refresh while runtime observation rotates', () => {
  const firstReceipt = receipt();
  const refreshedReceipt = receipt({
    receiptRef: 'receipt.vexlocalbridge.heretic-persistent-runtime.restart',
    sourceIdentity: {
      repository: 'vgong24/Vextreme-SDK',
      revision: '4'.repeat(40),
      tree: '5'.repeat(40),
      moduleSha256: '6'.repeat(64),
    },
    runtime: {
      ...firstReceipt.runtime,
      pid: 51002,
      processGroupId: 51002,
    },
    qualification: {
      ...firstReceipt.qualification,
      loadResultRef: 'result.vexlocalbridge.heretic.loopback.restart',
    },
  });
  const first = formHereticPersistentRuntimeLink({ receipt: firstReceipt, homeIdentity });
  const refreshed = formHereticPersistentRuntimeLink({ receipt: refreshedReceipt, homeIdentity });

  assert.equal(first.companionBinding.bindingRef, formHereticPersistentRuntimeBindingRef(homeIdentity));
  assert.equal(refreshed.companionBinding.bindingRef, first.companionBinding.bindingRef);
  assert.notEqual(refreshed.runtimeObservation.observationRef, first.runtimeObservation.observationRef);
  assert.notEqual(refreshed.runtimeReceiptRef, first.runtimeReceiptRef);
  assert.notEqual(refreshed.runtimePid, first.runtimePid);

  const differentLineage = {
    ...homeIdentity,
    companionLineageRef: 'companion-lineage.heretic-reentry.other',
  };
  assert.notEqual(
    formHereticPersistentRuntimeBindingRef(differentLineage),
    first.companionBinding.bindingRef,
  );
});


test('current Heretic host-resource observation distinguishes live, externally absent and ambiguous runtime truth', () => {
  const currentReceipt = receipt();
  const healthy = formHereticPersistentRuntimeObservedLink({
    receipt: currentReceipt,
    homeIdentity,
    resourceObservation: {
      schemaVersion: 'vexlife.host-resource-observation/v1',
      truthClass: 'SOURCE_BOUND_HOST_RESOURCE_OBSERVATION',
      resourceRef: 'resource.vexlife.heretic.persistent-runtime',
      resourceClass: 'HERETIC_PERSISTENT_MLX_RUNTIME',
      resourceObservationRef: 'observation.vexlife.host-resource.heretic-live-test',
      ownershipState: 'EXACT_VEX_OWNED',
      lifecycleState: 'CURRENT',
      currentness: 'CURRENT',
      lifecycleEvidenceRefOrNull: null,
      ownershipProof: {
        currentness: 'CURRENT',
        ownerReceiptRef: currentReceipt.receiptRef,
        runtimeIdentityRef: `runtime.vexlife.heretic.process.${currentReceipt.runtime.pid}`,
        executableIdentityRef: 'executable.vexlife.heretic.python.test',
        processGroupIdentityRef: `process-group.vexlife.heretic.${currentReceipt.runtime.processGroupId}`,
        pidMatchOnly: false,
        exactOwnedProcessInstance: true,
      },
      sourceRefs: ['source.vexlife.heretic-runtime-owner.test', currentReceipt.receiptRef],
    },
  });
  assert.equal(healthy.runtimeObservation.runtimeOwnershipState, 'EXACT_OWNED');
  assert.equal(healthy.runtimeObservation.runtimeState, 'HEALTHY');
  assert.equal(healthy.runtimeObservation.qualificationState, 'CURRENT');

  const absent = formHereticPersistentRuntimeObservedLink({
    receipt: currentReceipt,
    homeIdentity,
    resourceObservation: {
      schemaVersion: 'vexlife.host-resource-observation/v1',
      truthClass: 'SOURCE_BOUND_HOST_RESOURCE_OBSERVATION',
      resourceObservationRef: 'observation.vexlife.host-resource.heretic-absent-test',
      ownershipState: 'UNOWNED',
      lifecycleState: 'ABANDONED',
      currentness: 'CURRENT',
      lifecycleEvidenceRefOrNull: 'evidence.vexlife.heretic.not-live.test',
      ownershipProof: null,
      sourceRefs: ['source.vexlife.heretic-runtime-owner.test', currentReceipt.receiptRef],
    },
  });
  assert.equal(absent.companionBinding.bindingRef, healthy.companionBinding.bindingRef);
  assert.equal(absent.runtimeObservation.runtimeOwnershipState, 'NO_OWNED_RUNTIME');
  assert.equal(absent.runtimeObservation.runtimeState, 'STOPPED');
  assert.equal(absent.runtimeObservation.qualificationState, 'STALE');
  assert.equal(absent.runtimeObservation.safeReentryState, 'AVAILABLE');
  assert.equal(absent.runtimeObservation.currentness, 'CURRENT');
  assert.ok(absent.runtimeObservation.evidenceRefs.includes('evidence.vexlife.heretic.not-live.test'));

  const ambiguous = formHereticPersistentRuntimeObservedLink({
    receipt: currentReceipt,
    homeIdentity,
    resourceObservation: {
      schemaVersion: 'vexlife.host-resource-observation/v1',
      truthClass: 'SOURCE_BOUND_HOST_RESOURCE_OBSERVATION',
      resourceObservationRef: 'observation.vexlife.host-resource.heretic-ambiguous-test',
      ownershipState: 'AMBIGUOUS',
      lifecycleState: 'UNKNOWN',
      currentness: 'CURRENT',
      lifecycleEvidenceRefOrNull: null,
      ownershipProof: null,
      sourceRefs: ['source.vexlife.heretic-runtime-owner.test', currentReceipt.receiptRef],
    },
  });
  assert.equal(ambiguous.runtimeObservation.runtimeOwnershipState, 'CONFLICT');
  assert.equal(ambiguous.runtimeObservation.runtimeState, 'UNKNOWN');
  assert.equal(ambiguous.runtimeObservation.safeReentryState, 'HELD');
});

test('stale or non-current Heretic host-resource truth does not silently become safe automatic reentry', () => {
  const currentReceipt = receipt();
  const stale = formHereticPersistentRuntimeObservedLink({
    receipt: currentReceipt,
    homeIdentity,
    resourceObservation: {
      schemaVersion: 'vexlife.host-resource-observation/v1',
      truthClass: 'SOURCE_BOUND_HOST_RESOURCE_OBSERVATION',
      resourceObservationRef: 'observation.vexlife.host-resource.heretic-stale-test',
      ownershipState: 'EXACT_VEX_OWNED',
      lifecycleState: 'STALE',
      currentness: 'CURRENT',
      lifecycleEvidenceRefOrNull: 'evidence.vexlife.heretic.source-stale.test',
      ownershipProof: {
        currentness: 'CURRENT',
        ownerReceiptRef: currentReceipt.receiptRef,
        runtimeIdentityRef: `runtime.vexlife.heretic.process.${currentReceipt.runtime.pid}`,
        executableIdentityRef: 'executable.vexlife.heretic.python.test',
        processGroupIdentityRef: `process-group.vexlife.heretic.${currentReceipt.runtime.processGroupId}`,
        pidMatchOnly: false,
        exactOwnedProcessInstance: true,
      },
      sourceRefs: ['source.vexlife.heretic-runtime-owner.test', currentReceipt.receiptRef],
    },
  });
  assert.equal(stale.runtimeObservation.runtimeOwnershipState, 'EXACT_OWNED');
  assert.equal(stale.runtimeObservation.runtimeState, 'DEGRADED');
  assert.equal(stale.runtimeObservation.qualificationState, 'STALE');
  assert.equal(stale.runtimeObservation.safeReentryState, 'HUMAN_DECISION_REQUIRED');

  const unknown = formHereticPersistentRuntimeObservedLink({
    receipt: currentReceipt,
    homeIdentity,
    resourceObservation: {
      schemaVersion: 'vexlife.host-resource-observation/v1',
      truthClass: 'SOURCE_BOUND_HOST_RESOURCE_OBSERVATION',
      resourceObservationRef: 'observation.vexlife.host-resource.heretic-unknown-test',
      ownershipState: 'UNOWNED',
      lifecycleState: 'ABANDONED',
      currentness: 'UNKNOWN',
      lifecycleEvidenceRefOrNull: null,
      ownershipProof: null,
      sourceRefs: ['source.vexlife.heretic-runtime-owner.test', currentReceipt.receiptRef],
    },
  });
  assert.equal(unknown.runtimeObservation.runtimeOwnershipState, 'UNKNOWN');
  assert.equal(unknown.runtimeObservation.runtimeState, 'UNKNOWN');
  assert.equal(unknown.runtimeObservation.safeReentryState, 'HELD');
  assert.equal(unknown.runtimeObservation.currentness, 'UNKNOWN');
});

test('current Heretic observation rejects mixed receipt generations and unproved exact ownership', () => {
  const currentReceipt = receipt();
  const rotatedReceipt = receipt({
    receiptRef: 'receipt.vexlocalbridge.heretic-persistent-runtime.rotated',
    runtime: {
      ...currentReceipt.runtime,
      pid: currentReceipt.runtime.pid + 1,
      processGroupId: currentReceipt.runtime.processGroupId + 1,
    },
  });
  const rotatedObservation = {
    schemaVersion: 'vexlife.host-resource-observation/v1',
    truthClass: 'SOURCE_BOUND_HOST_RESOURCE_OBSERVATION',
    resourceRef: 'resource.vexlife.heretic.persistent-runtime',
    resourceClass: 'HERETIC_PERSISTENT_MLX_RUNTIME',
    resourceObservationRef: 'observation.vexlife.host-resource.rotated-receipt-test',
    ownershipState: 'EXACT_VEX_OWNED',
    lifecycleState: 'CURRENT',
    currentness: 'CURRENT',
    lifecycleEvidenceRefOrNull: null,
    ownershipProof: {
      currentness: 'CURRENT',
      ownerReceiptRef: rotatedReceipt.receiptRef,
      runtimeIdentityRef: `runtime.vexlife.heretic.process.${rotatedReceipt.runtime.pid}`,
      executableIdentityRef: 'executable.vexlife.heretic.python.rotated-test',
      processGroupIdentityRef: `process-group.vexlife.heretic.${rotatedReceipt.runtime.processGroupId}`,
      pidMatchOnly: false,
      exactOwnedProcessInstance: true,
    },
    sourceRefs: ['source.vexlife.heretic-runtime-owner.test', rotatedReceipt.receiptRef],
  };
  assert.throws(
    () => formHereticPersistentRuntimeObservedLink({
      receipt: currentReceipt,
      homeIdentity,
      resourceObservation: rotatedObservation,
    }),
    (error) => error?.code === 'HERETIC_RUNTIME_RESOURCE_OBSERVATION_INVALID',
  );

  assert.throws(
    () => formHereticPersistentRuntimeObservedLink({
      receipt: currentReceipt,
      homeIdentity,
      resourceObservation: {
        ...rotatedObservation,
        resourceObservationRef: 'observation.vexlife.host-resource.unproved-exact-owned-test',
        ownershipProof: null,
        sourceRefs: ['source.vexlife.heretic-runtime-owner.test', currentReceipt.receiptRef],
      },
    }),
    (error) => error?.code === 'HERETIC_RUNTIME_RESOURCE_OBSERVATION_INVALID',
  );
});

test('exact #636 owned stop projects RECOVERABLE-ready stopped runtime evidence on the same binding', () => {
  const currentReceipt = receipt();
  const healthy = formHereticPersistentRuntimeLink({ receipt: currentReceipt, homeIdentity });
  const stopped = formHereticPersistentRuntimeStoppedObservation({
    receipt: currentReceipt,
    homeIdentity,
    stopResult: {
      disposition: 'STOPPED_EXACT_OWNED_MLX_RUNTIME',
      pid: currentReceipt.runtime.pid,
      processTerminationPerformed: true,
      stop: {
        state: 'RETIRED_VERIFIED',
        exactOwnershipVerified: true,
        verifiedNotLive: true,
        signalSent: 'SIGTERM',
        processGroupId: currentReceipt.runtime.processGroupId,
      },
    },
  });

  assert.equal(stopped.bindingRef, healthy.companionBinding.bindingRef);
  assert.equal(stopped.homeRef, homeIdentity.homeRef);
  assert.equal(stopped.adapterRef, HERETIC_RUNTIME_ADAPTER_REF);
  assert.equal(stopped.runtimeOwnershipState, 'NO_OWNED_RUNTIME');
  assert.equal(stopped.runtimeState, 'STOPPED');
  assert.equal(stopped.qualificationState, 'STALE');
  assert.equal(stopped.safeReentryState, 'AVAILABLE');
  assert.equal(stopped.currentness, 'CURRENT');
  assert.notEqual(stopped.observationRef, healthy.runtimeObservation.observationRef);
  assert.ok(stopped.evidenceRefs.includes(currentReceipt.receiptRef));
});

test('stopped-runtime projection rejects forged or wrong-process stop evidence', () => {
  const currentReceipt = receipt();
  const baseStop = {
    disposition: 'STOPPED_EXACT_OWNED_MLX_RUNTIME',
    pid: currentReceipt.runtime.pid,
    processTerminationPerformed: true,
    stop: {
      state: 'RETIRED_VERIFIED',
      exactOwnershipVerified: true,
      verifiedNotLive: true,
      signalSent: 'SIGTERM',
      processGroupId: currentReceipt.runtime.processGroupId,
    },
  };
  for (const stopResult of [
    { ...baseStop, pid: currentReceipt.runtime.pid + 1 },
    { ...baseStop, stop: { ...baseStop.stop, exactOwnershipVerified: false } },
    { ...baseStop, stop: { ...baseStop.stop, verifiedNotLive: false } },
    { ...baseStop, stop: { ...baseStop.stop, processGroupId: currentReceipt.runtime.processGroupId + 1 } },
  ]) {
    assert.throws(
      () => formHereticPersistentRuntimeStoppedObservation({ receipt: currentReceipt, homeIdentity, stopResult }),
      (error) => error?.code === 'HERETIC_RUNTIME_STOP_EVIDENCE_INVALID',
    );
  }
});

// [VXG RealForever]
