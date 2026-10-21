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

// [VXG RealForever]
