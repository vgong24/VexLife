import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  compileCompanionAvailability,
  formCompanionReentryPlan
} from '../src/core/companion-availability-reentry.mjs';
import { makeRequest } from '../scripts/companion-recovery-effect-proof.mjs';
import {
  AUTO_REENTRY_OWNER_ROUTE_SCHEMA,
  decideAutoReentry,
  syntheticAutoReentryProof,
  validateAutoReentryPolicy
} from '../scripts/vex-reboot-auto-reentry-proof.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
const policy = read('blueprint/companion-auto-reentry-policy.json');
const recoveryContract = read('blueprint/companion-recovery-effect-contract.json');
const registry = read('blueprint/companion-availability-reentry-registry.json');
const matrix = read('test/fixtures/vex-reboot/vr04-auto-reentry-matrix.json');

function binding() {
  return {
    schemaVersion: 'vexlife.companion-binding-input/v1',
    truthClass: 'FOREIGN_CANONICAL_COMPANION_BINDING',
    bindingRef: 'binding.vr04.test',
    homeRef: 'home.vr04.test',
    companionLineageRef: 'lineage.vr04.test',
    modelRefOrNull: 'model.vr04.test',
    generationRefOrNull: 'generation.vr04.test',
    bindingState: 'BOUND',
    currentness: 'CURRENT',
    sourceRefs: ['source.binding.vr04.test']
  };
}

function runtime(overrides = {}) {
  return {
    schemaVersion: 'vexlife.companion-runtime-adapter-observation/v1',
    truthClass: 'FOREIGN_PLATFORM_RUNTIME_OBSERVATION',
    observationRef: 'observation.vr04.test',
    adapterRef: 'adapter.runtime.vr04.test',
    bindingRef: 'binding.vr04.test',
    homeRef: 'home.vr04.test',
    runtimeOwnershipState: 'EXACT_OWNED',
    runtimeState: 'HEALTHY',
    qualificationState: 'CURRENT',
    safeReentryState: 'NOT_AVAILABLE',
    currentness: 'CURRENT',
    evidenceRefs: ['evidence.runtime.vr04.test'],
    ...overrides
  };
}

function recoveryFixture() {
  const currentBinding = binding();
  const stopped = runtime({
    observationRef: 'observation.vr04.stopped',
    runtimeOwnershipState: 'NO_OWNED_RUNTIME',
    runtimeState: 'STOPPED',
    qualificationState: 'STALE',
    safeReentryState: 'AVAILABLE'
  });
  const availability = compileCompanionAvailability({ registry, binding: currentBinding, runtimeObservation: stopped });
  const plan = formCompanionReentryPlan({ registry, availability, binding: currentBinding, runtimeObservation: stopped });
  const request = makeRequest(recoveryContract, availability, plan);
  const route = {
    schemaVersion: AUTO_REENTRY_OWNER_ROUTE_SCHEMA,
    truthClass: 'FOREIGN_RIGHTFUL_RUNTIME_OWNER_ROUTE',
    routeRef: 'route.runtime.vr04.test',
    bindingRef: request.bindingRef,
    homeRef: request.homeRef,
    runtimeAdapterRef: request.runtimeAdapterRef,
    currentness: 'CURRENT',
    automaticRecoveryAllowed: true,
    sourceRefs: ['source.runtime-owner.vr04.test']
  };
  return { currentBinding, stopped, availability, plan, request, route };
}

test('VR04 policy contract is exact and effect-free', () => {
  const current = validateAutoReentryPolicy(policy);
  assert.equal(current.effectAuthorityGranted, false);
  assert.equal(current.automaticRequestFormationEnabled, true);
  assert.equal(current.forbiddenEffects.includes('UNKNOWN_PROCESS_TERMINATION'), true);
});

test('VR04 READY performs no recovery request or effect', () => {
  const currentBinding = binding();
  const availability = compileCompanionAvailability({ registry, binding: currentBinding, runtimeObservation: runtime() });
  const result = decideAutoReentry({ policy, availability });
  assert.equal(result.state, 'NO_EFFECT_READY');
  assert.equal(result.delegationRequired, false);
  assert.equal(result.effectAuthorityGranted, false);
});

test('VR04 STARTING remains retry-in-progress without delegation', () => {
  const currentBinding = binding();
  const availability = compileCompanionAvailability({
    registry,
    binding: currentBinding,
    runtimeObservation: runtime({ runtimeState: 'STARTING', qualificationState: 'UNKNOWN', safeReentryState: 'HELD' })
  });
  const result = decideAutoReentry({ policy, availability });
  assert.equal(result.state, 'RETRY_IN_PROGRESS');
  assert.equal(result.delegationRequired, false);
});

test('VR04 canonical RECOVERABLE + current rightful route forms exactly one existing request identity', () => {
  const { availability, request, route } = recoveryFixture();
  const result = decideAutoReentry({ policy, availability, recoveryRequest: request, ownerRoute: route });
  assert.equal(result.state, 'FORM_RECOVERY_REQUEST');
  assert.equal(result.requestRefOrNull, request.requestRef);
  assert.equal(result.idempotencyKeyOrNull, request.idempotencyKey);
  assert.equal(result.effectAuthorityGranted, false);
});

test('VR04 identical inputs are deterministic', () => {
  const { availability, request, route } = recoveryFixture();
  const a = decideAutoReentry({ policy, availability, recoveryRequest: request, ownerRoute: route });
  const b = decideAutoReentry({ policy, availability, recoveryRequest: request, ownerRoute: route });
  assert.deepEqual(a, b);
});

test('VR04 same request already in flight cannot form a second delegation', () => {
  const { availability, request, route } = recoveryFixture();
  const result = decideAutoReentry({
    policy,
    availability,
    recoveryRequest: request,
    ownerRoute: route,
    inFlightRequestRefOrNull: request.requestRef
  });
  assert.equal(result.state, 'REQUEST_ALREADY_IN_FLIGHT');
  assert.equal(result.delegationRequired, false);
});

test('VR04 different in-flight request holds instead of racing another owner effect', () => {
  const { availability, request, route } = recoveryFixture();
  const result = decideAutoReentry({
    policy,
    availability,
    recoveryRequest: request,
    ownerRoute: route,
    inFlightRequestRefOrNull: 'request.vexlife.companion-recovery.foreign'
  });
  assert.equal(result.state, 'HELD');
  assert.equal(result.reasonCode, 'FOREIGN_RECOVERY_REQUEST_IN_FLIGHT');
});

test('VR04 stale or foreign rightful-owner routes fail closed', () => {
  const { availability, request, route } = recoveryFixture();
  assert.equal(decideAutoReentry({
    policy, availability, recoveryRequest: request, ownerRoute: { ...route, currentness: 'STALE' }
  }).state, 'HELD');
  assert.equal(decideAutoReentry({
    policy, availability, recoveryRequest: request, ownerRoute: { ...route, homeRef: 'home.foreign' }
  }).state, 'HELD');
});

test('VR04 recovery request must match the exact current availability projection', () => {
  const { availability, request, route } = recoveryFixture();
  const forged = { ...request, availabilityProjectionRef: 'projection.foreign' };
  const result = decideAutoReentry({ policy, availability, recoveryRequest: forged, ownerRoute: route });
  assert.equal(result.state, 'HELD');
  assert.equal(result.reasonCode, 'RECOVERY_REQUEST_NOT_CURRENT');
});

test('VR04 ACTION_REQUIRED, UNAVAILABLE and HELD never auto-delegate', () => {
  const currentBinding = binding();
  const observations = [
    runtime({ runtimeState: 'DEGRADED', qualificationState: 'FAILED', safeReentryState: 'NOT_AVAILABLE' }),
    runtime({ runtimeOwnershipState: 'NO_OWNED_RUNTIME', runtimeState: 'STOPPED', qualificationState: 'STALE', safeReentryState: 'NOT_AVAILABLE' }),
    runtime({ runtimeOwnershipState: 'UNKNOWN', runtimeState: 'UNREACHABLE', qualificationState: 'UNKNOWN', safeReentryState: 'HELD' })
  ];
  for (const observation of observations) {
    const availability = compileCompanionAvailability({ registry, binding: currentBinding, runtimeObservation: observation });
    const result = decideAutoReentry({ policy, availability });
    assert.equal(result.state, 'HELD');
    assert.equal(result.delegationRequired, false);
    assert.equal(result.effectAuthorityGranted, false);
  }
});

test('VR04 synthetic proof covers the current matrix without external effects', () => {
  const proof = syntheticAutoReentryProof(policy, recoveryContract, registry, matrix);
  assert.equal(proof.state, 'PASS');
  assert.equal(proof.matrixRows, matrix.rows.length);
  assert.equal(proof.externalEffectsExecuted, false);
  assert.equal(proof.runtimeEffectPerformed, false);
  assert.equal(proof.processStartStopPerformed, false);
  assert.equal(proof.modelStateMutationPerformed, false);
  assert.equal(proof.homeMemoryMutationPerformed, false);
});

// [VXG RealForever]
