import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ADAPTER_INPUT_SCHEMA,
  SDK_ACCEPTED_MERGE,
  SDK_PROCESS_REF,
  SDK_PROCESS_SOURCE_REF,
  SDK_PROFILE_REF,
  SDK_RECEIPT_SCHEMA,
  SDK_REQUEST_SCHEMA,
  SDK_RUNTIME_SOURCE_REF,
  consumeStewardshipReceipt,
  formStewardshipRequest,
  validateStewardshipAdapterInput
} from '../src/core/stewardship-orchestration-adapter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function clone(value) {
  return structuredClone(value);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function sdkFingerprint(value) {
  return `sha256:${createHash('sha256')
    .update(`${JSON.stringify(stable(value), null, 2)}\n`, 'utf8')
    .digest('hex')}`;
}

const H = {
  graph: '1'.repeat(64),
  node: '2'.repeat(64),
  assignment: '3'.repeat(64),
  occupancy: '4'.repeat(64),
  capability: '5'.repeat(64),
  effect: '6'.repeat(64)
};

function baseInput() {
  const localSources = [
    'github.issue.vexlife.549',
    'github.pull.vexlife.536',
    'repo.vexlife/src/core/intent-workgraph.mjs@283f9ab50508912fecf91d6ee34cebedf90fa4b8',
    'repo.vexlife/src/core/intent-scheduler.mjs@283f9ab50508912fecf91d6ee34cebedf90fa4b8'
  ];
  return {
    schemaVersion: ADAPTER_INPUT_SCHEMA,
    sdkBinding: {
      processRef: SDK_PROCESS_REF,
      profileRef: SDK_PROFILE_REF,
      acceptedMergeRef: SDK_ACCEPTED_MERGE,
      runtimeSourceRef: SDK_RUNTIME_SOURCE_REF,
      processSourceRef: SDK_PROCESS_SOURCE_REF
    },
    localBindings: {
      graph: {
        graphRef: 'intent-workgraph.stewardship.test',
        graphFingerprint: H.graph,
        rootIntentRef: 'intent.stewardship.test'
      },
      work: {
        workNodeRef: 'work.stewardship.test',
        nodeFingerprint: H.node,
        roleRef: 'role.vex.operations',
        capabilityEnvelopeRef: 'capability-envelope.stewardship.test',
        effectEnvelopeRef: 'effect-envelope.stewardship.test',
        returnRouteRef: 'return-route.stewardship.test'
      },
      assignment: {
        assignmentRef: 'assignment.stewardship.test',
        assignmentFingerprint: H.assignment,
        sourceIntentRef: 'intent.stewardship.test',
        workNodeRef: 'work.stewardship.test',
        assigneeRef: 'vex.stewardship.test',
        assignmentState: 'CURRENT',
        authorityDisposition: 'NO_AUTHORITY',
        effectDisposition: 'NO_EFFECTS'
      },
      occupancy: {
        occupancyRef: 'occcupancy.stewardship.test',
        occupancyFingerprint: H.occupancy,
        actorRef: 'vex.stewardship.test',
        actorClass: 'VEX_AI',
        workNodeRef: 'work.stewardship.test',
        graphFingerprint: H.graph,
        roleRef: 'role.vex.operations',
        currentness: 'CURRENT',
        lifecycle: 'ACTIVE'
      },
      capabilityLease: {
        leaseRef: 'lease.capability.stewardship.test',
        leaseFingerprint: H.capability,
        workNodeRef: 'work.stewardship.test',
        graphFingerprint: H.graph,
        envelopeRef: 'capability-envelope.stewardship.test',
        currentness: 'CURRENT',
        lifecycle: 'ACTIVE'
      },
      effectLease: {
        leaseRef: 'lease.effect.stewardship.test',
        leaseFingerprint: H.effect,
        workNodeRef: 'work.stewardship.test',
        graphFingerprint: H.graph,
        envelopeRef: 'effect-envelope.stewardship.test',
        effectDisposition: 'NO_EFFECTS',
        currentness: 'CURRENT',
        lifecycle: 'ACTIVE'
      },
      sourceRefs: localSources
    },
    requestDraft: {
      schemaVersion: SDK_REQUEST_SCHEMA,
      caseRef: 'case.stewardship.vexlife.test',
      intent: {
        rootIntentionRef: 'intent.stewardship.test',
        protectedOutcomeRefs: ['outcome.stewardship.test'],
        constraintRefs: ['constraint.stewardship.no-effects'],
        intentSourceRefs: ['github.issue.vexlife.549']
      },
      pathFrontier: {
        activePathRefOrNull: 'path.stewardship.current',
        minimalSafePathRefOrNull: 'path.stewardship.current',
        recommendedPathRefOrNull: 'path.stewardship.current',
        alternatePathRefs: [],
        heldPathRefs: ['path.stewardship.later'],
        decisionPathRefOrNull: 'path.stewardship.later',
        pathEvidenceRefs: ['evidence.stewardship.path'],
        recommendationBasisRefs: ['basis.stewardship.current-first'],
        whatWouldChangeRecommendationRefs: ['trigger.stewardship.prerequisite'],
        decisionNeed: 'CHOICE'
      },
      continuity: {
        activeWorkRefs: ['work.stewardship.test'],
        openLoopRefs: ['open-loop.stewardship.later'],
        heldOpportunityRefs: ['opportunity.stewardship.later'],
        waitingExternalRefs: [],
        refreshTriggerRefs: ['trigger.stewardship.source-change'],
        currentness: 'CURRENT',
        materialUnknownRefs: []
      },
      timing: {
        readinessState: 'NOT_NOW',
        readinessEvidenceClass: 'EXPLICIT_USER_SIGNAL',
        readinessEvidenceClass: 'EXPLICIT_USER_SIGNAL',
        readinessEvidenceRefs: ['evidence.stewardship.not-now'],
        reminderConsentState: 'ACCEPTED',
        resurfaceMode: 'WHEN_PREREQUISITE_COMPLETES',
        safeUntilOrNull: null,
        reactivationTriggerRefs: ['trigger.stewardship.prerequisite'],
        interruptPolicyRefOrNull: 'policy.stewardship.nonurgent'
      },
      responsibility: {
        requiredRoleRefOrNull: 'role.vex.operations',
        requiredCapabilityRefs: ['capability-envelope.stewardship.test'],
        currentOccupancyOrNull: {
          occupancyRef: 'occupancy.stewardship.test',
          roleRef: 'role.vex.operations',
          actorClass: 'VEX_AI',
          capabilityRefs: ['capability-envelope.stewardship.test'],
          capabilityState: 'CURRENT',
          authorityState: 'CURRENT'
        },
        alternateOccupancies: [],
        externalAuthorityRequired: false
      },
      outcome: {
        effectProposedRefOrNull: null,
        effectResultRefOrNull: null,
        outcomeVerificationRefOrNull: null,
        intentSatisfied: false,
        residualOpenLoopRefs: ['open-loop.stewardship.later']
      },
      sourceRefs: [
        ...localSources,
        SDK_RUNTIME_SOURCE_REF,
        SDK_PROCESS_SOURCE_REF
      ]
    }
  };
}

function validSdkReceipt(input = baseInput(), overrides = {}) {
  const request = input.requestDraft;
  const core = {
    schemaVersion: SDK_RECEIPT_SCHEMA,
    profileRef: SDK_PROFILE_REF,
    caseRef: request.caseRef,
    accepted: true,
    intentProjection: {
      rootIntentionRef: request.intent.rootIntentionRef,
      protectedOutcomeRefs: [...request.intent.protectedOutcomeRefs],
      constraintRefs: [...request.intent.constraintRefs],
      interpretationReplacesGoal: false
    },
    pathProjection: {
      activePathRefOrNull: request.pathFrontier.activePathRefOrNull,
      minimalSafePathRefOrNull: request.pathFrontier.minimalSafePathRefOrNull,
      recommendedPathRefOrNull: request.pathFrontier.recommendedPathRefOrNull,
      alternatePathRefs: [...request.pathFrontier.alternatePathRefs],
      heldPathRefs: [...request.pathFrontier.heldPathRefs],
      recommendationBasisRefs: [...request.pathFrontier.recommendationBasisRefs],
      whatWouldChangeRecommendationRefs: [...request.pathFrontier.whatWouldChangeRecommendationRefs],
      minimalSafePathIsOnlyPath: false,
      heldPathHasEffectAuthorityByImplication: false
    },
    continuityProjection: {
      activeWorkRefs: [...request.continuity.activeWorkRefs],
      openLoopRefs: [...request.continuity.openLoopRefs],
      heldOpportunityRefs: [...request.continuity.heldOpportunityRefs],
      waitingExternalRefs: [...request.continuity.waitingExternalRefs],
      refreshTriggerRefs: [...request.continuity.refreshTriggerRefs],
      currentness: request.continuity.currentness,
      materialUnknownRefs: [...request.continuity.materialUnknownRefs],
      deferredMeansForgotten: false
    },
    decisionTimingProjection: {
      decisionPathRefOrNull: request.pathFrontier.decisionPathRefOrNull,
      decisionNeed: request.pathFrontier.decisionNeed,
      disposition: 'HELD_WITH_REACTIVATION',
      humanDecisionReady: false,
      automaticResurfaceEligible: true,
      reminderSchedulingAuthorized: false,
      recommendationIsHumanDecision: false,
      inferredReadinessGrantsConsent: false,
      declinedReminderRejectsPath: false,
      readinessState: request.timing.readinessState,
      readinessEvidenceClass: request.timing.readinessEvidenceClass,
      reminderConsentState: request.timing.reminderConsentState,
      resurfaceMode: request.timing.resurfaceMode,
      safeUntilOrNull: request.timing.safeUntilOrNull,
      reactivationTriggerRefs: [...request.timing.reactivationTriggerRefs],
      interruptPolicyRefOrNull: request.timing.interruptPolicyRefOrNull
    },
    responsibilityProjection: {
      requiredRoleRefOrNull: request.responsibility.requiredRoleRefOrNull,
      requiredCapabilityRefs: [...request.responsibility.requiredCapabilityRefs],
      currentOccupancyRefOrNull: request.responsibility.currentOccupancyOrNull.occupancyRef,
      currentOccupancyQualified: true,
      selectedOccupancyRefOrNull: request.responsibility.currentOccupancyOrNull.occupancyRef,
      selectedActorClassOrNull: request.responsibility.currentOccupancyOrNull.actorClass,
      alternateQualifiedOccupancyRefs: [],
      externalAuthorityRequired: false,
      roleIsActorClass: false,
      actorClassAloneGrantsAuthority: false
    },
    outcomeProjection: {
      effectProposedRefOrNull: null,
      effectResultRefOrNull: null,
      outcomeVerificationRefOrNull: null,
      intentSatisfied: false,
      residualOpenLoopRefs: [...request.outcome.residualOpenLoopRefs],
      effectResultIsOutcomeVerified: false,
      taskCompletionIsIntentSatisfaction: false
    },
    nextTransition: 'CONTINUE_CURRENT_OCCUPANCY',
    blockers: [],
    sourceRefs: [...request.sourceRefs].sort(),
    effects: {
      network: false,
      providerInvocation: false,
      sourceMutation: false,
      schedulerMutation: false,
      concernMutation: false,
      homeMutation: false,
      memoryMutation: false,
      familyMutation: false,
      authorityGrant: false,
      reminderScheduling: false,
      legalDecision: false,
      financialEffect: false,
      externalDelivery: false,
      training: false,
      modelWeightMutation: false,
      publication: false
    }
  };
  Object.assign(core, clone(overrides));
  core.fingerprint = sdkFingerprint(core);
  return core;
}

function errorsFor(input) {
  return validateStewardshipAdapterInput(input).errors;
}

test('VSA-00 valid owner-local evidence forms exact SDK request without adapter-only request fields', () => {
  const input = baseInput();
  assert.deepEqual(validateStewardshipAdapterInput(input), { ok: true, errors: [] });
  const formed = formStewardshipRequest(input);
  assert.deepEqual(formed.request, input.requestDraft);
  assert.equal(Object.hasOwn(formed.request, 'semanticFingerprint'), false);
  assert.equal(formed.adapterReceipt.executionAuthority, 'NONE');
  assert.equal(formed.adapterReceipt.effectAuthority, 'NONE');
  assert.ok(Object.values(formed.adapterReceipt.effects).every((value) => value === false));
});

test('VSA-01 accepted assignment never substitutes for current occupancy authority', () => {
  const input = baseInput();
  input.requestDraft.responsibility.currentOccupancyOrNull = null;
  assert.ok(errorsFor(input).includes('SDK_CURRENT_OCCUPANCY_REQUIRED'));
});

test('VSA-02 assignment authority/effect collapse is rejected', () => {
  const input = baseInput();
  input.localBindings.assignment.authorityDisposition = 'AUTHORIZED_BOUNDED';
  input.localBindings.assignment.effectDisposition = 'EFFECT_ENVELOPE_BOUND';
  const errors = errorsFor(input);
  assert.ok(errors.includes('ASSIGNMENT_AUTHORITY_COLLAPSE'));
  assert.ok(errors.includes('ASSIGNMENT_EFFECT_COLLAPSE'));
});

test('VSA-03 assignment assignee must equal current occupancy actor for adapter v1', () => {
  const input = baseInput();
  input.localBindings.assignment.assigneeRef = 'person.other';
  assert.ok(errorsFor(input).includes('ASSIGNMENT_ASSIGNEE_OCCUPANCY_MISMATCH'));
});

test('VSA-04 stale occupancy, capability lease, or effect lease fails closed', () => {
  const input = baseInput();
  input.localBindings.occupancy.currentness = 'STALE';
  input.localBindings.capabilityLease.lifecycle = 'RELEASED';
  input.localBindings.effectLease.currentness = 'UNKNOWN';
  const errors = errorsFor(input);
  assert.ok(errors.includes('OCCUPANCY_NOT_CURRENT'));
  assert.ok(errors.includes('CAPABILITY_LEASE_NOT_ACTIVE'));
  assert.ok(errors.includes('EFFECT_LEASE_NOT_CURRENT'));
});

test('VSA-05 capability/effect leases must bind exact current work envelopes', () => {
  const input = baseInput();
  input.localBindings.capabilityLease.envelopeRef = 'capability-envelope.foreign';
  input.localBindings.effectLease.envelopeRef = 'effect-envelope.foreign';
  const errors = errorsFor(input);
  assert.ok(errors.includes('CAPABILITY_LEASE_BINDING_MISMATCH'));
  assert.ok(errors.includes('EFFECT_LEASE_BINDING_MISMATCH'));
});

test('VSA-06 root intent substitution is rejected', () => {
  const input = baseInput();
  input.requestDraft.intent.rootIntentionRef = 'intent.substituted';
  assert.ok(errorsFor(input).includes('SDK_ROOT_INTENT_SUBSTITUTION'));
});

test('VSA-07 role, capability, actor-class, and occupancy substitution are rejected', () => {
  const input = baseInput();
  input.requestDraft.responsibility.requiredRoleRefOrNull = 'role.foreign';
  input.requestDraft.responsibility.requiredCapabilityRefs = ['capability-envelope.foreign'];
  input.requestDraft.responsibility.currentOccupancyOrNull.occupancyRef = 'occupancy.foreign';
  input.requestDraft.responsibility.currentOccupancyOrNull.actorClass = 'HUMAN';
  const errors = errorsFor(input);
  assert.ok(errors.includes('SDK_REQUIRED_ROLE_MISMATCH'));
  assert.ok(errors.includes('SDK_REQUIRED_CAPABILITY_BINDING_MISMATCH'));
  assert.ok(errors.includes('SDK_CURRENT_OCCUPANCY_BINDING_MISMATCH'));
});

test('VSA-08 adapter v1 refuses alternate occupancy semantics it does not locally prove', () => {
  const input = baseInput();
  input.requestDraft.responsibility.alternateOccupancies.push({
    occupancyRef: 'occupancy.alternate',
    roleRef: 'role.vex.operations',
    actorClass: 'HUMAN',
    capabilityRefs: ['capability-envelope.stewardship.test'],
    capabilityState: 'CURRENT',
    authorityState: 'CURRENT'
  });
  assert.ok(errorsFor(input).includes('SDK_ADAPTER_V1_ALTERNATE_OCCUPANCIES_NOT_SUPPORTED'));
});

test('VSA-09 adapter refuses unknown SDK request fields and missing producer/local source bindings', () => {
  const input = baseInput();
  input.requestDraft.surprise = true;
  input.requestDraft.sourceRefs = ['github.issue.vexlife.549'];
  const errors = errorsFor(input);
  assert.ok(errors.includes('SDK_REQUEST_SHAPE_INVALID'));
  assert.ok(errors.includes('SDK_REQUIRED_SOURCE_BINDINGS_MISSING'));
});

test('VSA-10 exact no-effect SDK receipt becomes recommendation-only VexLife route receipt', () => {
  const input = baseInput();
  const route = consumeStewardshipReceipt(input, validSdkReceipt(input));
  assert.equal(route.nextTransition, 'CONTINUE_CURRENT_OCCUPANCY');
  assert.equal(route.returnRouteRef, 'return-route.stewardship.test');
  assert.equal(route.recommendationOnly, true);
  assert.equal(route.executionAuthority, 'NONE');
  assert.equal(route.effectAuthority, 'NONE');
  assert.ok(Object.values(route.effects).every((value) => value === false));
});

test('VSA-11 wrong case/profile/source receipt fails closed', () => {
  const input = baseInput();
  const receipt = validSdkReceipt(input);
  receipt.caseRef = 'case.foreign';
  receipt.profileRef = 'VS-FOREIGN';
  receipt.sourceRefs = ['source.foreign'];
  receipt.fingerprint = sdkFingerprint(Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== 'fingerprint')));
  assert.throws(() => consumeStewardshipReceipt(input, receipt), (error) => {
    assert.ok(error.errors.includes('SDK_RECEIPT_CASE_REF_MISMATCH'));
    assert.ok(error.errors.includes('SDK_RECEIPT_PROFILE_REF_MISMATCH'));
    assert.ok(error.errors.includes('SDK_RECEIPT_SOURCE_REFS_MISMATCH'));
    return true;
  });
});

test('VSA-12 any true SDK effect fails closed', () => {
  const input = baseInput();
  const receipt = validSdkReceipt(input);
  receipt.effects.schedulerMutation = true;
  receipt.fingerprint = sdkFingerprint(Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== 'fingerprint')));
  assert.throws(() => consumeStewardshipReceipt(input, receipt), (error) => {
    assert.ok(error.errors.includes('SDK_RECEIPT_EFFECT_TRUE:schedulerMutation'));
    return true;
  });
});

test('VSA-13 foreign selected occupancy and actor-class substitution fail closed', () => {
  const input = baseInput();
  const receipt = validSdkReceipt(input);
  receipt.responsibilityProjection.selectedOccupancyRefOrNull = 'occupancy.foreign';
  receipt.responsibilityProjection.selectedActorClassOrNull = 'HUMAN';
  receipt.fingerprint = sdkFingerprint(Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== 'fingerprint')));
  assert.throws(() => consumeStewardshipReceipt(input, receipt), (error) => {
    assert.ok(error.errors.includes('SDK_RECEIPT_FOREIGN_SELECTED_OCCUPANCY'));
    assert.ok(error.errors.includes('SDK_RECEIPT_SELECTED_ACTOR_CLASS_MISMATCH'));
    return true;
  });
});

test('VSA-14 SDK semantic non-collapse flags are enforced at receipt boundary', () => {
  const input = baseInput();
  const receipt = validSdkReceipt(input);
  receipt.intentProjection.interpretationReplacesGoal = true;
  receipt.decisionTimingProjection.recommendationIsHumanDecision = true;
  receipt.decisionTimingProjection.reminderSchedulingAuthorized = true;
  receipt.outcomeProjection.taskCompletionIsIntentSatisfaction = true;
  receipt.fingerprint = sdkFingerprint(Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== 'fingerprint')));
  assert.throws(() => consumeStewardshipReceipt(input, receipt), (error) => {
    assert.ok(error.errors.includes('SDK_RECEIPT_INTENT_COLLAPSE'));
    assert.ok(error.errors.includes('SDK_RECEIPT_DECISION_COLLAPSE'));
    assert.ok(error.errors.includes('SDK_RECEIPT_OUTCOME_COLLAPSE'));
    return true;
  });
});

test('VSA-15 forged SDK fingerprint fails closed', () => {
  const input = baseInput();
  const receipt = validSdkReceipt(input);
  receipt.fingerprint = `sha256:${'0'.repeat(64)}`;
  assert.throws(() => consumeStewardshipReceipt(input, receipt), (error) => {
    assert.ok(error.errors.includes('SDK_RECEIPT_FINGERPRINT_MISMATCH'));
    return true;
  });
});

test('VSA-16 build and route fingerprints are deterministic', () => {
  const input = baseInput();
  const first = formStewardshipRequest(input);
  const second = formStewardshipRequest(clone(input));
  assert.equal(first.adapterReceipt.semanticFingerprint, second.adapterReceipt.semanticFingerprint);
  const receipt = validSdkReceipt(input);
  assert.equal(
    consumeStewardshipReceipt(input, receipt).semanticFingerprint,
    consumeStewardshipReceipt(clone(input), clone(receipt)).semanticFingerprint
  );
});

test('VSA-17 runtime adapter exposes no filesystem, process, network, scheduler, timer, or provider execution primitive', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/core/stewardship-orchestration-adapter.mjs'), 'utf8');
  for (const forbidden of [
    "node:fs", "node:child_process", "node:http", "node:https", 'fetch(', 'exec(', 'spawn(',
    'writeFile', 'unlink(', 'setTimeout(', 'setInterval(', 'schedule(', 'providerInvocation(',
    'admitIntentSchedulerQueue(', 'recordIntentTransition(', 'appendReceipt('
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

test('VSA-18 source-managed adapter contract binds exact accepted producer and no-effect boundary', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint/stewardship-orchestration-adapter.json'), 'utf8'));
  assert.equal(contract.schemaVersion, 'vexlife.stewardship-orchestration-adapter-contract/v1');
  assert.equal(contract.adapterRef, 'adapter.vexlife.stewardship-orchestration.v1');
  assert.equal(contract.acceptedProducer.acceptedMergeRef, SDK_ACCEPTED_MERGE);
  assert.equal(contract.acceptedProducer.processRef, SDK_PROCESS_REF);
  assert.equal(contract.acceptedProducer.profileRef, SDK_PROFILE_REF);
  assert.equal(contract.acceptedProducer.runtimeSourceRef, SDK_RUNTIME_SOURCE_REF);
  assert.equal(contract.acceptedProducer.processSourceRef, SDK_PROCESS_SOURCE_REF);
  assert.ok(contract.nonCollapse.includes('ACCEPTED_ASSIGNMENT != AUTHORITY'));
  assert.ok(contract.nonCollapse.includes('SDK_RECOMMENDATION != VEXLIFE_EFFECT'));
  assert.ok(Object.values(contract.effects).every((value) => value === false));
});
