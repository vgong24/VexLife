#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileCompanionAvailability,
  formCompanionReentryPlan
} from '../src/core/companion-availability-reentry.mjs';
import { makeRequest } from './companion-recovery-effect-proof.mjs';

export const AUTO_REENTRY_POLICY_SCHEMA = 'vexlife.companion-auto-reentry-policy/v1';
export const AUTO_REENTRY_OWNER_ROUTE_SCHEMA = 'vexlife.companion-recovery-owner-route/v1';
export const AUTO_REENTRY_DECISION_SCHEMA = 'vexlife.companion-auto-reentry-decision/v1';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value) => typeof value === 'string' && value.length > 0;

function held(reasonCode, requestRefOrNull = null) {
  return Object.freeze({
    schemaVersion: AUTO_REENTRY_DECISION_SCHEMA,
    state: 'HELD',
    reasonCode,
    requestRefOrNull,
    idempotencyKeyOrNull: null,
    delegationRequired: false,
    effectAuthorityGranted: false
  });
}

export function validateAutoReentryPolicy(policy) {
  if (
    !object(policy)
    || policy.schemaVersion !== AUTO_REENTRY_POLICY_SCHEMA
    || policy.policyRef !== 'policy.vexlife.companion-auto-reentry.001'
    || policy.requestSchema !== 'vexlife.companion-recovery-request/v1'
    || policy.ownerRouteSchema !== AUTO_REENTRY_OWNER_ROUTE_SCHEMA
    || policy.outputSchema !== AUTO_REENTRY_DECISION_SCHEMA
    || policy.eligibleAvailabilityState !== 'RECOVERABLE'
    || policy.eligibleRecoveryClass !== 'SAFE_REENTRY_AVAILABLE'
    || policy.exactActionRef !== 'action.companion.reenter-current-binding'
    || policy.automaticRequestFormationEnabled !== true
    || policy.effectAuthorityGranted !== false
    || !Array.isArray(policy.forbiddenEffects)
    || policy.forbiddenEffects.length === 0
  ) {
    throw new TypeError('companion auto-reentry policy is invalid');
  }
  return Object.freeze(structuredClone(policy));
}

export function validateAutoReentryOwnerRoute(route, request) {
  if (
    !object(route)
    || route.schemaVersion !== AUTO_REENTRY_OWNER_ROUTE_SCHEMA
    || route.truthClass !== 'FOREIGN_RIGHTFUL_RUNTIME_OWNER_ROUTE'
    || !nonempty(route.routeRef)
    || route.currentness !== 'CURRENT'
    || route.automaticRecoveryAllowed !== true
    || !Array.isArray(route.sourceRefs)
    || route.sourceRefs.length === 0
    || route.sourceRefs.some((ref) => !nonempty(ref))
    || new Set(route.sourceRefs).size !== route.sourceRefs.length
  ) return null;
  for (const key of ['bindingRef','homeRef','runtimeAdapterRef']) {
    if ((route[key] ?? null) !== (request?.[key] ?? null)) return null;
  }
  return Object.freeze(structuredClone(route));
}

function canonicalRecoveryRequestDigest(request) {
  const core = {
    schemaVersion: request.schemaVersion,
    truthClass: request.truthClass,
    contractRef: request.contractRef,
    actionRef: request.actionRef,
    availabilityProjectionRef: request.availabilityProjectionRef,
    reentryPlanRef: request.reentryPlanRef,
    idempotencyKey: request.idempotencyKey,
    bindingRef: request.bindingRef,
    homeRef: request.homeRef,
    companionLineageRef: request.companionLineageRef,
    modelRefOrNull: request.modelRefOrNull,
    generationRefOrNull: request.generationRefOrNull,
    runtimeAdapterRef: request.runtimeAdapterRef,
    runtimeObservationRef: request.runtimeObservationRef,
    effectAuthorityGranted: request.effectAuthorityGranted,
    executionDisposition: request.executionDisposition
  };
  return crypto.createHash('sha256').update(JSON.stringify(core, Object.keys(core).sort())).digest('hex');
}

function requestMatchesAvailability(policy, availability, request) {
  if (
    !object(request)
    || request.schemaVersion !== policy.requestSchema
    || request.truthClass !== 'SAME_BINDING_RECOVERY_REQUEST'
    || request.contractRef !== 'contract.vexlife.companion-recovery-effect.001'
    || request.actionRef !== policy.exactActionRef
    || request.availabilityProjectionRef !== availability.projectionRef
    || request.runtimeObservationRef !== availability.runtimeObservationRef
    || request.effectAuthorityGranted !== false
    || request.executionDisposition !== 'DELEGATE_TO_RIGHTFUL_RUNTIME_ADAPTER'
    || !nonempty(request.reentryPlanRef)
    || !/^companion-reentry:[0-9a-f]{64}$/u.test(request.idempotencyKey ?? '')
  ) return false;
  for (const key of ['bindingRef','homeRef','companionLineageRef','modelRefOrNull','generationRefOrNull','runtimeAdapterRef']) {
    if ((request[key] ?? null) !== (availability[key] ?? null)) return false;
  }
  const digest = canonicalRecoveryRequestDigest(request);
  return request.requestSha256 === digest
    && request.requestRef === `request.vexlife.companion-recovery.${digest.slice(0, 32)}`;
}

export function decideAutoReentry({
  policy,
  availability,
  recoveryRequest = null,
  ownerRoute = null,
  inFlightRequestRefOrNull = null
}) {
  const currentPolicy = validateAutoReentryPolicy(policy);
  if (!object(availability) || !nonempty(availability.availabilityState) || !nonempty(availability.recoveryClass)) {
    throw new TypeError('current Companion availability is required');
  }

  if (availability.availabilityState === 'READY') {
    return Object.freeze({
      schemaVersion: AUTO_REENTRY_DECISION_SCHEMA,
      state: 'NO_EFFECT_READY',
      reasonCode: 'EXACT_RUNTIME_ALREADY_READY',
      requestRefOrNull: null,
      idempotencyKeyOrNull: null,
      delegationRequired: false,
      effectAuthorityGranted: false
    });
  }
  if (availability.availabilityState === 'STARTING') {
    return Object.freeze({
      schemaVersion: AUTO_REENTRY_DECISION_SCHEMA,
      state: 'RETRY_IN_PROGRESS',
      reasonCode: 'EXACT_RUNTIME_STARTING',
      requestRefOrNull: null,
      idempotencyKeyOrNull: null,
      delegationRequired: false,
      effectAuthorityGranted: false
    });
  }
  if (
    availability.availabilityState !== currentPolicy.eligibleAvailabilityState
    || availability.recoveryClass !== currentPolicy.eligibleRecoveryClass
  ) {
    return held('AUTO_REENTRY_NOT_ELIGIBLE');
  }
  if (!requestMatchesAvailability(currentPolicy, availability, recoveryRequest)) {
    return held('RECOVERY_REQUEST_NOT_CURRENT');
  }
  const route = validateAutoReentryOwnerRoute(ownerRoute, recoveryRequest);
  if (!route) return held('RIGHTFUL_OWNER_ROUTE_NOT_CURRENT', recoveryRequest.requestRef);

  if (inFlightRequestRefOrNull !== null) {
    if (inFlightRequestRefOrNull === recoveryRequest.requestRef) {
      return Object.freeze({
        schemaVersion: AUTO_REENTRY_DECISION_SCHEMA,
        state: 'REQUEST_ALREADY_IN_FLIGHT',
        reasonCode: 'SAME_RECOVERY_REQUEST_ALREADY_IN_FLIGHT',
        requestRefOrNull: recoveryRequest.requestRef,
        idempotencyKeyOrNull: recoveryRequest.idempotencyKey,
        delegationRequired: false,
        effectAuthorityGranted: false
      });
    }
    return held('FOREIGN_RECOVERY_REQUEST_IN_FLIGHT', recoveryRequest.requestRef);
  }

  return Object.freeze({
    schemaVersion: AUTO_REENTRY_DECISION_SCHEMA,
    state: 'FORM_RECOVERY_REQUEST',
    reasonCode: 'EXACT_SAME_BINDING_AUTO_REENTRY_ELIGIBLE',
    requestRefOrNull: recoveryRequest.requestRef,
    idempotencyKeyOrNull: recoveryRequest.idempotencyKey,
    ownerRouteRefOrNull: route.routeRef,
    delegationRequired: true,
    effectAuthorityGranted: false
  });
}

export function syntheticAutoReentryProof(policy, recoveryContract, registry, matrix) {
  const binding = {
    schemaVersion: 'vexlife.companion-binding-input/v1',
    truthClass: 'FOREIGN_CANONICAL_COMPANION_BINDING',
    bindingRef: 'binding.vr04',
    homeRef: 'home.vr04',
    companionLineageRef: 'lineage.vr04',
    modelRefOrNull: 'model.vr04',
    generationRefOrNull: 'generation.vr04',
    bindingState: 'BOUND',
    currentness: 'CURRENT',
    sourceRefs: ['source.binding.vr04']
  };
  const runtime = {
    schemaVersion: 'vexlife.companion-runtime-adapter-observation/v1',
    truthClass: 'FOREIGN_PLATFORM_RUNTIME_OBSERVATION',
    observationRef: 'observation.vr04.stopped',
    adapterRef: 'adapter.runtime.vr04',
    bindingRef: binding.bindingRef,
    homeRef: binding.homeRef,
    runtimeOwnershipState: 'NO_OWNED_RUNTIME',
    runtimeState: 'STOPPED',
    qualificationState: 'STALE',
    safeReentryState: 'AVAILABLE',
    currentness: 'CURRENT',
    evidenceRefs: ['evidence.runtime.vr04']
  };
  const availability = compileCompanionAvailability({ registry, binding, runtimeObservation: runtime });
  const plan = formCompanionReentryPlan({ registry, availability, binding, runtimeObservation: runtime });
  const request = makeRequest(recoveryContract, availability, plan);
  const route = {
    schemaVersion: AUTO_REENTRY_OWNER_ROUTE_SCHEMA,
    truthClass: 'FOREIGN_RIGHTFUL_RUNTIME_OWNER_ROUTE',
    routeRef: 'route.runtime.vr04',
    bindingRef: request.bindingRef,
    homeRef: request.homeRef,
    runtimeAdapterRef: request.runtimeAdapterRef,
    currentness: 'CURRENT',
    automaticRecoveryAllowed: true,
    sourceRefs: ['source.runtime-owner.vr04']
  };
  const first = decideAutoReentry({ policy, availability, recoveryRequest: request, ownerRoute: route });
  const second = decideAutoReentry({ policy, availability, recoveryRequest: request, ownerRoute: route });
  return Object.freeze({
    schemaVersion: 'vexlife.vex-reboot-vr04-auto-reentry-proof/v1',
    state: first.state === 'FORM_RECOVERY_REQUEST' && JSON.stringify(first) === JSON.stringify(second) ? 'PASS' : 'FAIL',
    matrixRows: matrix.rows.length,
    requestRef: request.requestRef,
    decisionState: first.state,
    deterministic: JSON.stringify(first) === JSON.stringify(second),
    externalEffectsExecuted: false,
    runtimeEffectPerformed: false,
    processStartStopPerformed: false,
    modelStateMutationPerformed: false,
    homeMemoryMutationPerformed: false
  });
}

const read = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(syntheticAutoReentryProof(
    read('blueprint/companion-auto-reentry-policy.json'),
    read('blueprint/companion-recovery-effect-contract.json'),
    read('blueprint/companion-availability-reentry-registry.json'),
    read('test/fixtures/vex-reboot/vr04-auto-reentry-matrix.json')
  ), null, 2));
}

// [VXG RealForever]
