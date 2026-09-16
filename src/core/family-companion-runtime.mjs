import {
  createIntentEnvelope,
  createIntentWorkgraph,
  createWorkNode
} from './intent-workgraph.mjs';
import { selectNextPendingRoot } from './intent-scheduler.mjs';
import { readFamilySpace } from './family-space-store.mjs';
import { familySpaceRecordSnapshotRef } from './family-conversation.mjs';
import {
  appendConversationMessage,
  readConversationChannel,
  readConversationChannelBinding,
  readConversationMessage
} from './conversation-store.mjs';
import {
  FAMILY_GROUP_FRONTIER_ADVANCED,
  FAMILY_GROUP_FRONTIER_CURRENTNESS,
  createFamilyGroupContextLease,
  formFamilyGroupFrontier,
  verifyFamilyGroupFrontierCurrent
} from './family-group-context-runtime.mjs';
import {
  materializeFamilyPromptContext,
  requestLivedCompanionInference
} from './lived-companion.mjs';
import { semanticHash } from './utils.mjs';

export const FAMILY_COMPANION_RUNTIME_SCHEMA = 'vexlife.family-companion-runtime/v1';
export const FAMILY_COMPANION_DELIVERY_RECEIPT_SCHEMA = 'vexlife.family-companion-delivery-receipt/v1';
export const FAMILY_COMPANION_FRONTIER_STATES = Object.freeze({
  CURRENT_AT_DELIVERY: 'CURRENT_AT_DELIVERY',
  AS_OF_FRONTIER: 'AS_OF_FRONTIER'
});

const REQUEST_FIELDS = new Set([
  'requestRef',
  'spaceRef',
  'channelRef',
  'triggerMessageRef',
  'expectedMembershipGeneration',
  'idempotencyKey'
]);
const REF = /^[a-z0-9](?:[a-z0-9._-]{0,220}[a-z0-9])?$/u;

export class FamilyCompanionRuntimeError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'FamilyCompanionRuntimeError';
    this.code = code;
    this.details = details;
  }
}

const fail = (code, message, details = null) => {
  throw new FamilyCompanionRuntimeError(code, message, details);
};

const freeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
};

const clone = (value) => structuredClone(value);

function exactRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('FAMILY_COMPANION_REQUEST_INVALID', 'Family companion request must be one object');
  }
  const extras = Object.keys(value).filter((key) => !REQUEST_FIELDS.has(key));
  if (extras.length) {
    fail('FAMILY_COMPANION_UNTRUSTED_FIELD', 'Family companion request contains an untrusted authority field', { extras });
  }
  for (const field of ['requestRef', 'spaceRef', 'channelRef', 'triggerMessageRef']) {
    if (typeof value[field] !== 'string' || !REF.test(value[field])) {
      fail('FAMILY_COMPANION_REQUEST_INVALID', `${field} must be one portable lowercase stable ref`);
    }
  }
  if (!Number.isSafeInteger(value.expectedMembershipGeneration) || value.expectedMembershipGeneration < 0) {
    fail('FAMILY_COMPANION_REQUEST_INVALID', 'expectedMembershipGeneration must be a non-negative safe integer');
  }
  if (typeof value.idempotencyKey !== 'string' || value.idempotencyKey.length < 1 || value.idempotencyKey.length > 512) {
    fail('FAMILY_COMPANION_REQUEST_INVALID', 'idempotencyKey must be one bounded non-empty string');
  }
  return freeze({ ...value });
}

function finalized(core, refField, prefix) {
  const semanticFingerprint = semanticHash(core);
  return freeze({
    ...core,
    [refField]: `${prefix}${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

function runtimeIdentity(request) {
  const requestFingerprint = semanticHash({
    schemaVersion: 'vexlife.family-companion-request-identity/v1',
    requestRef: request.requestRef,
    spaceRef: request.spaceRef,
    channelRef: request.channelRef,
    triggerMessageRef: request.triggerMessageRef,
    expectedMembershipGeneration: request.expectedMembershipGeneration,
    idempotencyKey: request.idempotencyKey
  });
  return freeze({
    requestFingerprint,
    intentRef: `intent.vex-family.runtime.${requestFingerprint.slice(0, 32)}`,
    graphRef: `intent-workgraph.vex-family.runtime.${requestFingerprint.slice(0, 32)}`,
    workNodeRef: `work.vex-family.runtime.${requestFingerprint.slice(0, 32)}`,
    responseMessageRef: `message.vex-family.runtime.${requestFingerprint.slice(0, 32)}`
  });
}

function currentFamilyOwners({ home, request, requireTrigger = true }) {
  const family = readFamilySpace({ home, spaceRef: request.spaceRef });
  if (family.state !== 'CURRENT' || !family.record) {
    fail('FAMILY_COMPANION_FAMILY_UNAVAILABLE', 'current Family Space record is unavailable');
  }
  if (family.record.membershipGeneration !== request.expectedMembershipGeneration) {
    fail('FAMILY_COMPANION_MEMBERSHIP_STALE', 'request membership generation is not current');
  }
  if (family.record.familyCompanionState !== 'ACTIVE' || !family.record.familyCompanionLineageRef) {
    fail('FAMILY_COMPANION_LINEAGE_STALE', 'current Family Vex lineage is not active');
  }

  const bound = readConversationChannelBinding({ home, channelRef: request.channelRef });
  if (bound.state !== 'CURRENT' || !bound.channel || !bound.record) {
    fail('FAMILY_COMPANION_CHANNEL_UNAVAILABLE', 'current Family conversation channel is unavailable');
  }
  const binding = bound.channel.familySpaceBinding;
  if (!binding || bound.channel.kind !== 'GROUP' || binding.audienceKind !== 'GROUP' ||
      binding.spaceRef !== request.spaceRef ||
      binding.familySpaceRecordSha256 !== family.record.recordSha256 ||
      binding.membershipGeneration !== family.record.membershipGeneration ||
      binding.familyCompanionIncluded !== true ||
      binding.familyCompanionLineageRef !== family.record.familyCompanionLineageRef) {
    fail('FAMILY_COMPANION_CHANNEL_STALE', 'Family channel binding is not exact-current with Family membership and lineage');
  }

  let trigger = null;
  let member = null;
  if (requireTrigger) {
    const addressed = readConversationMessage({
      home,
      channelRef: request.channelRef,
      messageRef: request.triggerMessageRef
    });
    if (addressed.state !== 'CURRENT' || !addressed.event) {
      fail('FAMILY_COMPANION_TRIGGER_NOT_FOUND', 'persisted Family trigger message is unavailable from current channel lineage');
    }
    trigger = addressed.event;
    if (trigger.spaceRef !== request.spaceRef || trigger.channelRef !== request.channelRef ||
        trigger.threadRef !== bound.channel.threadRef ||
        trigger.membershipGeneration !== request.expectedMembershipGeneration ||
        trigger.membershipSnapshotRef !== familySpaceRecordSnapshotRef(family.record.recordSha256)) {
      fail('FAMILY_COMPANION_TRIGGER_STALE', 'trigger message is not bound to the exact current Family source identity');
    }
    member = family.record.members.find((candidate) =>
      candidate.principalRef === trigger.speakerRef && candidate.status === 'ACTIVE'
    );
    const audience = binding.audienceMemberBindings.find((candidate) => candidate.principalRef === trigger.speakerRef);
    if (!member || !audience || member.principalBindingRef !== audience.principalBindingRef) {
      fail('FAMILY_COMPANION_MEMBER_DENIED', 'trigger speaker is not one current active Family member with exact binding');
    }
  }
  return freeze({ family: family.record, channel: bound.channel, binding, trigger, member });
}

function bindingRefs(nodes, intentRegistry) {
  return Object.fromEntries((intentRegistry?.bindingFields ?? []).map((field) => [
    field,
    [...new Set(nodes.flatMap((item) => {
      const value = item[field];
      return Array.isArray(value) ? value : value ? [value] : [];
    }))].sort()
  ]));
}

export function formFamilyCompanionWorkgraph({
  request: rawRequest,
  trigger,
  familyCompanionLineageRef,
  intentRegistry,
  roleRef,
  workProcessRef,
  transitionProcessRef,
  applicableCultureRefs = []
} = {}) {
  const request = exactRequest(rawRequest);
  if (!trigger?.messageRef || trigger.messageRef !== request.triggerMessageRef ||
      trigger.channelRef !== request.channelRef || trigger.spaceRef !== request.spaceRef ||
      trigger.membershipGeneration !== request.expectedMembershipGeneration ||
      typeof trigger.contentHash !== 'string' || !trigger.contentHash) {
    fail('FAMILY_COMPANION_TRIGGER_STALE', 'workgraph formation requires the exact persisted trigger event');
  }
  if (typeof familyCompanionLineageRef !== 'string' || !REF.test(familyCompanionLineageRef)) {
    fail('FAMILY_COMPANION_LINEAGE_STALE', 'workgraph formation requires one current Family Vex lineage ref');
  }
  for (const [field, value] of Object.entries({ roleRef, workProcessRef, transitionProcessRef })) {
    if (typeof value !== 'string' || !value) fail('FAMILY_COMPANION_RUNTIME_CONFIG_INVALID', `${field} is required`);
  }

  const identity = runtimeIdentity(request);
  const createdAt = trigger.createdAt;
  const intent = createIntentEnvelope({
    intentRef: identity.intentRef,
    originMessageRef: trigger.messageRef,
    originSpeakerRef: trigger.speakerRef,
    recipientRoleRef: roleRef,
    projectRef: 'project.vex-family.family-companion-runtime',
    threadRef: trigger.threadRef,
    channelRef: trigger.channelRef,
    originalContentHash: trigger.contentHash,
    desiredOutcome: {
      intentKey: 'VEX_FAMILY_RESPOND',
      summary: 'Respond to one persisted Family trigger through the canonical shared Family runtime.'
    },
    constraints: [],
    createdAt,
    sourceLineageRef: familyCompanionLineageRef
  }, intentRegistry);

  const sourceRef = `source.vex-family.trigger.${trigger.eventSha256}`;
  const node = createWorkNode({
    workNodeRef: identity.workNodeRef,
    rootIntentRef: intent.intentRef,
    purpose: 'Run one source-bound Family Vex response through the canonical single-worker scheduler.',
    processRef: workProcessRef,
    state: 'READY',
    dependencyRefs: [],
    childRefs: [],
    roleRef,
    priorityClass: 'NORMAL',
    schedulingClass: 'INTERACTIVE',
    interactiveHumanTurn: true,
    applicableCultureRefs: [...new Set(applicableCultureRefs)].sort(),
    applicableLessonRefs: [],
    applicableBurdenReleaseRefs: [],
    capabilityEnvelopeRef: `capability-envelope.${identity.workNodeRef}`,
    effectEnvelopeRef: `effect-envelope.${identity.workNodeRef}`,
    resourceEnvelopeRef: `resource-envelope.${identity.workNodeRef}`,
    expectedTransitionRef: `expected-transition.${identity.workNodeRef}.completed`,
    completionGateRefs: [`completion-gate.${identity.workNodeRef}.durable-family-response`],
    returnRouteRef: `return-route.${identity.workNodeRef}`,
    sourceRefs: [sourceRef],
    createdAt
  }, intentRegistry);

  const states = ['DECOMPOSED', 'PLAN_VALIDATED', 'READY'];
  let priorState = 'CAPTURED';
  const transitions = states.map((nextState, sequence) => {
    const transition = {
      transitionRef: `transition.vex-family.runtime.${identity.requestFingerprint.slice(0, 24)}.${sequence}`,
      workNodeRef: node.workNodeRef,
      sequence,
      priorState,
      nextState,
      reason: 'Form one canonical Family companion runtime work node from a persisted Family trigger.',
      actorRef: 'module.vexlife.core.family-companion-runtime',
      actorRoleRef: roleRef,
      processRef: transitionProcessRef,
      sourceRefs: [sourceRef],
      createdAt
    };
    priorState = nextState;
    return transition;
  });

  const graph = createIntentWorkgraph({
    graphRef: identity.graphRef,
    intent,
    nodes: [node],
    transitions,
    receipts: [],
    bindingRefs: bindingRefs([node], intentRegistry),
    createdAt
  }, intentRegistry);

  return freeze({ request, identity, intent, node, graph, sourceRef });
}

function exactPendingRoot(scheduler, graph, requestPrincipalRef) {
  const matching = (scheduler.pendingRoots ?? []).filter((root) => root.intentRef === graph.intent.intentRef);
  if (matching.length > 1) fail('FAMILY_COMPANION_QUEUE_CORRUPT', 'canonical scheduler contains duplicate Family intent roots');
  const root = matching[0] ?? null;
  if (!root) return null;
  if (root.graphFingerprint !== graph.semanticFingerprint || root.originPrincipalRef !== requestPrincipalRef) {
    fail('FAMILY_COMPANION_IDEMPOTENCY_CONFLICT', 'existing pending root is bound to different immutable request truth');
  }
  return root;
}

function familyContextInput(baseInput, frontier) {
  if (!baseInput || typeof baseInput !== 'object' || Array.isArray(baseInput)) {
    fail('FAMILY_COMPANION_RUNTIME_BINDING_INVALID', 'scheduler context input producer returned no context input');
  }
  const selectedSourceRefs = frontier.selectedMessageBindings.map((message) => message.messageRef).sort();
  const candidate = clone(baseInput);
  delete candidate.semanticFingerprint;
  candidate.selectedSourceRefs = selectedSourceRefs;
  candidate.inputTokenEstimate = frontier.inputTokenEstimate;
  candidate.familyGroupFrontierRef = frontier.frontierRef;
  candidate.familyGroupFrontierSha256 = frontier.frontierSha256;
  return candidate;
}

function recanonicalizeFamilyContextLease({ home, frontier, leasedContext, observedAt }) {
  const input = clone(leasedContext);
  delete input.semanticFingerprint;
  const result = createFamilyGroupContextLease({
    home,
    frontier,
    leaseInput: input,
    observedAt
  });
  if (result.lease.semanticFingerprint !== leasedContext.semanticFingerprint ||
      result.lease.leaseRef !== leasedContext.leaseRef) {
    fail('FAMILY_COMPANION_CONTEXT_DIVERGED', 'VF-03A Family context lease does not match the scheduler-owned context lease');
  }
  return result.lease;
}

function currentResponseEvent({ home, request, responseMessageRef }) {
  const existing = readConversationMessage({
    home,
    channelRef: request.channelRef,
    messageRef: responseMessageRef
  });
  return existing.state === 'CURRENT' ? existing.event : null;
}

function safeCurrentResponse(event, request, familyCompanionLineageRef) {
  if (!event) return null;
  if (event.spaceRef !== request.spaceRef || event.channelRef !== request.channelRef ||
      event.speakerRef !== familyCompanionLineageRef) {
    fail('FAMILY_COMPANION_IDEMPOTENCY_CONFLICT', 'deterministic response identity is already bound to different Family response truth');
  }
  return freeze({
    messageRef: event.messageRef,
    eventSha256: event.eventSha256,
    speakerRef: event.speakerRef,
    channelRef: event.channelRef,
    membershipGeneration: event.membershipGeneration,
    sequence: event.sequence,
    contentHash: event.contentHash,
    createdAt: event.createdAt
  });
}

function responseEnvelope({ home, request, identity, current, response, createdAt }) {
  const projection = readConversationChannel({ home, channelRef: request.channelRef, limit: 1 });
  if (projection.state !== 'CURRENT') {
    fail('FAMILY_COMPANION_CHANNEL_UNAVAILABLE', 'Family conversation head is unavailable at response delivery');
  }
  const recipients = current.binding.audienceMemberBindings.map((member) => member.principalRef);
  if (recipients.length === 0 || new Set(recipients).size !== recipients.length) {
    fail('FAMILY_COMPANION_CHANNEL_STALE', 'Family response audience is empty or malformed');
  }
  const content = String(response?.content ?? '');
  if (!content) fail('FAMILY_COMPANION_INFERENCE_INVALID', 'accepted inference returned no response content');
  return freeze({
    messageRef: identity.responseMessageRef,
    spaceRef: request.spaceRef,
    threadRef: current.channel.threadRef,
    channelRef: request.channelRef,
    speakerRef: current.family.familyCompanionLineageRef,
    recipientRefs: recipients,
    witnessRefs: [...current.binding.channelMemberRefs],
    membershipSnapshotRef: familySpaceRecordSnapshotRef(current.family.recordSha256),
    membershipGeneration: current.family.membershipGeneration,
    sequence: projection.head ? projection.head.sequence + 1 : 0,
    content,
    contentHash: semanticHash(content),
    createdAt
  });
}

function deliveryReceipt({
  request,
  graph,
  responseEvent,
  frontier,
  frontierState,
  promptReceipt,
  model,
  queue,
  leased,
  membershipGenerationAtDelivery,
  deliveredAt
}) {
  const core = {
    schemaVersion: FAMILY_COMPANION_DELIVERY_RECEIPT_SCHEMA,
    requestRef: request.requestRef,
    intentRef: graph.intent.intentRef,
    graphRef: graph.graphRef,
    graphFingerprint: graph.semanticFingerprint,
    respondingToMessageRef: request.triggerMessageRef,
    responseMessageRef: responseEvent.messageRef,
    responseEventSha256: responseEvent.eventSha256,
    spaceRef: request.spaceRef,
    threadRef: responseEvent.threadRef,
    channelRef: request.channelRef,
    requestPrincipalRef: frontier.requestPrincipalRef,
    familyCompanionLineageRef: responseEvent.speakerRef,
    frontierRef: frontier.frontierRef,
    frontierSha256: frontier.frontierSha256,
    frontierState,
    membershipGenerationAtRequest: request.expectedMembershipGeneration,
    membershipGenerationAtExecution: frontier.membershipGeneration,
    membershipGenerationAtDelivery,
    promptMaterializationReceiptRef: promptReceipt.receiptRef,
    promptMaterializationReceiptFingerprint: promptReceipt.semanticFingerprint,
    promptProviderBoundaryCurrentnessVerified: promptReceipt.providerBoundaryCurrentnessVerified === true,
    promptProviderBoundarySourceBindingsVerified: promptReceipt.providerBoundarySourceBindingsVerified === true,
    modelProvenance: model,
    modelRuntimeEvidenceOwnerRef: 'src/core/lived-companion.mjs',
    modelRuntimeEvidenceExposure: 'OWNER_RETAINED_NOT_REEMITTED_BY_FAMILY_RUNTIME',
    modelTurnWitnessRef: null,
    schedulerAdmissionReceiptRef: queue.admissionReceipt?.admissionReceiptRef ?? null,
    workerLeaseRef: leased.workerLease?.leaseRef ?? null,
    schedulerGeneration: leased.workerLease?.schedulerGeneration ?? leased.contextLease?.schedulerGeneration ?? null,
    durableConversationOwnerRef: 'src/core/conversation-store.mjs',
    memoryEffectPerformed: false,
    relationshipEffectPerformed: false,
    trainingEffectPerformed: false,
    deliveredAt
  };
  return finalized(core, 'receiptRef', 'receipt.vex-family.runtime.delivery.');
}

export class FamilyCompanionRuntime {
  #home;
  #instanceRef;
  #scheduler;
  #intentRegistry;
  #schedulerRegistry;
  #registeredProcessRefs;
  #registeredRoleRefs;
  #roleRef;
  #workProcessRef;
  #transitionProcessRef;
  #applicableCultureRefs;
  #admissionOptionsFor;
  #contextInputFor;
  #completionEvidenceFor;
  #endpointProfile;
  #inference;
  #clock;
  #maxMessages;
  #maxInputTokens;

  constructor({
    home,
    instanceRef,
    scheduler,
    intentRegistry,
    schedulerRegistry,
    registeredProcessRefs = intentRegistry?.processRefs ?? [],
    registeredRoleRefs = [],
    roleRef,
    workProcessRef = 'process.vexlife.intent.validate-workgraph',
    transitionProcessRef = 'process.vexlife.intent.verify-transition',
    applicableCultureRefs = ['foundation.vexlife.state-relay.v1'],
    admissionOptionsFor,
    contextInputFor,
    completionEvidenceFor,
    endpointProfile = null,
    inference = requestLivedCompanionInference,
    clock = () => new Date().toISOString(),
    maxMessages = 64,
    maxInputTokens = 4096
  } = {}) {
    if (typeof home !== 'string' || !home || typeof instanceRef !== 'string' || !instanceRef) {
      fail('FAMILY_COMPANION_RUNTIME_CONFIG_INVALID', 'home and instanceRef are required');
    }
    for (const [name, value] of Object.entries({ admissionOptionsFor, contextInputFor, completionEvidenceFor, inference, clock })) {
      if (typeof value !== 'function') fail('FAMILY_COMPANION_RUNTIME_CONFIG_INVALID', `${name} must be one function`);
    }
    for (const method of ['enqueueRootIntent', 'admit', 'leaseSelected', 'cancelQueuedRootIntent', 'cancelActive', 'completeActive']) {
      if (typeof scheduler?.[method] !== 'function') {
        fail('FAMILY_COMPANION_RUNTIME_CONFIG_INVALID', `canonical scheduler lacks ${method}`);
      }
    }
    if (!intentRegistry || !schedulerRegistry || typeof roleRef !== 'string' || !roleRef) {
      fail('FAMILY_COMPANION_RUNTIME_CONFIG_INVALID', 'intentRegistry, schedulerRegistry and roleRef are required');
    }
    if (!Number.isSafeInteger(maxMessages) || maxMessages < 1 || !Number.isSafeInteger(maxInputTokens) || maxInputTokens < 1) {
      fail('FAMILY_COMPANION_RUNTIME_CONFIG_INVALID', 'Family frontier bounds must be positive safe integers');
    }
    this.#home = home;
    this.#instanceRef = instanceRef;
    this.#scheduler = scheduler;
    this.#intentRegistry = intentRegistry;
    this.#schedulerRegistry = schedulerRegistry;
    this.#registeredProcessRefs = [...registeredProcessRefs];
    this.#registeredRoleRefs = [...registeredRoleRefs];
    this.#roleRef = roleRef;
    this.#workProcessRef = workProcessRef;
    this.#transitionProcessRef = transitionProcessRef;
    this.#applicableCultureRefs = [...applicableCultureRefs];
    this.#admissionOptionsFor = admissionOptionsFor;
    this.#contextInputFor = contextInputFor;
    this.#completionEvidenceFor = completionEvidenceFor;
    this.#endpointProfile = endpointProfile;
    this.#inference = inference;
    this.#clock = clock;
    this.#maxMessages = maxMessages;
    this.#maxInputTokens = maxInputTokens;
  }

  get pendingRoots() {
    return clone(this.#scheduler.pendingRoots ?? []);
  }

  #requestSource(rawRequest) {
    const request = exactRequest(rawRequest);
    const current = currentFamilyOwners({ home: this.#home, request, requireTrigger: true });
    const work = formFamilyCompanionWorkgraph({
      request,
      trigger: current.trigger,
      familyCompanionLineageRef: current.family.familyCompanionLineageRef,
      intentRegistry: this.#intentRegistry,
      roleRef: this.#roleRef,
      workProcessRef: this.#workProcessRef,
      transitionProcessRef: this.#transitionProcessRef,
      applicableCultureRefs: this.#applicableCultureRefs
    });
    return { request, current, work };
  }

  queue(rawRequest) {
    const source = this.#requestSource(rawRequest);
    const { request, current, work } = source;
    const priorResponse = currentResponseEvent({
      home: this.#home,
      request,
      responseMessageRef: work.identity.responseMessageRef
    });
    if (priorResponse) {
      return freeze({
        schemaVersion: FAMILY_COMPANION_RUNTIME_SCHEMA,
        state: 'IDEMPOTENT_RESPONSE_CURRENT',
        requestRef: request.requestRef,
        intentRef: work.intent.intentRef,
        response: safeCurrentResponse(priorResponse, request, current.family.familyCompanionLineageRef),
        modelCallPerformed: false
      });
    }

    const existingRoot = exactPendingRoot(this.#scheduler, work.graph, current.trigger.speakerRef);
    if (existingRoot) {
      return freeze({
        schemaVersion: FAMILY_COMPANION_RUNTIME_SCHEMA,
        state: 'IDEMPOTENT_QUEUED',
        requestRef: request.requestRef,
        intentRef: work.intent.intentRef,
        pendingRoot: clone(existingRoot),
        modelCallPerformed: false
      });
    }

    const queued = this.#scheduler.enqueueRootIntent(work.graph, { schedulingClass: 'INTERACTIVE' });
    if (!queued.changed) {
      fail('FAMILY_COMPANION_QUEUE_REJECTED', 'canonical scheduler did not admit the exact Family request root');
    }
    return freeze({
      schemaVersion: FAMILY_COMPANION_RUNTIME_SCHEMA,
      state: 'QUEUED',
      requestRef: request.requestRef,
      intentRef: work.intent.intentRef,
      requestPrincipalRef: current.trigger.speakerRef,
      triggerMessageRef: current.trigger.messageRef,
      pendingRoot: clone(queued.rootIntent),
      modelCallPerformed: false
    });
  }

  cancel(rawRequest) {
    const request = exactRequest(rawRequest);
    const addressed = readConversationMessage({
      home: this.#home,
      channelRef: request.channelRef,
      messageRef: request.triggerMessageRef
    });
    if (addressed.state !== 'CURRENT' || !addressed.event) {
      fail('FAMILY_COMPANION_TRIGGER_NOT_FOUND', 'persisted Family trigger is unavailable for cancellation');
    }
    const identity = runtimeIdentity(request);
    const result = this.#scheduler.cancelQueuedRootIntent(identity.intentRef, {
      requesterRef: addressed.event.speakerRef
    });
    return freeze({
      schemaVersion: FAMILY_COMPANION_RUNTIME_SCHEMA,
      state: result.changed ? 'CANCELLED' : 'NO_QUEUED_REQUEST',
      requestRef: request.requestRef,
      intentRef: identity.intentRef,
      modelCallPerformed: false,
      result: clone(result)
    });
  }

  async runSelected(rawRequest, { endpointProfile = this.#endpointProfile, observedAt = this.#clock() } = {}) {
    const source = this.#requestSource(rawRequest);
    const { request, current, work } = source;
    const existingResponse = currentResponseEvent({
      home: this.#home,
      request,
      responseMessageRef: work.identity.responseMessageRef
    });
    if (existingResponse) {
      return freeze({
        schemaVersion: FAMILY_COMPANION_RUNTIME_SCHEMA,
        state: 'IDEMPOTENT_RESPONSE_CURRENT',
        requestRef: request.requestRef,
        intentRef: work.intent.intentRef,
        response: safeCurrentResponse(existingResponse, request, current.family.familyCompanionLineageRef),
        modelCallPerformed: false
      });
    }

    if (this.#scheduler.active) {
      return freeze({
        schemaVersion: FAMILY_COMPANION_RUNTIME_SCHEMA,
        state: 'BLOCKED',
        reason: 'PHYSICAL_WORKER_ALREADY_LEASED',
        requestRef: request.requestRef,
        intentRef: work.intent.intentRef,
        modelCallPerformed: false
      });
    }

    const selected = selectNextPendingRoot(
      this.#scheduler.aggregate?.pendingRootIntents ?? [],
      this.#scheduler.aggregate?.principalFairnessLedger ?? {},
      { schedulerRegistry: this.#schedulerRegistry }
    );
    if (!selected || selected.intentRef !== work.intent.intentRef) {
      return freeze({
        schemaVersion: FAMILY_COMPANION_RUNTIME_SCHEMA,
        state: 'NOT_SELECTED',
        requestRef: request.requestRef,
        intentRef: work.intent.intentRef,
        selectedIntentRef: selected?.intentRef ?? null,
        modelCallPerformed: false
      });
    }
    if (selected.graphFingerprint !== work.graph.semanticFingerprint ||
        selected.originPrincipalRef !== current.trigger.speakerRef) {
      fail('FAMILY_COMPANION_QUEUE_CORRUPT', 'selected scheduler root does not match exact reconstructed Family workgraph');
    }

    const admissionOptions = await this.#admissionOptionsFor({
      request,
      current,
      graph: work.graph,
      node: work.node,
      scheduler: this.#scheduler,
      observedAt
    });
    const queue = this.#scheduler.admit(work.graph, admissionOptions);

    const frontier = formFamilyGroupFrontier({
      home: this.#home,
      spaceRef: request.spaceRef,
      channelRef: request.channelRef,
      triggerMessageRef: request.triggerMessageRef,
      expectedMembershipGeneration: request.expectedMembershipGeneration,
      maxMessages: this.#maxMessages,
      maxInputTokens: this.#maxInputTokens,
      formedAt: observedAt
    });

    const baseContextInput = await this.#contextInputFor({
      request,
      current,
      graph: work.graph,
      node: work.node,
      queue,
      frontier,
      admissionOptions,
      scheduler: this.#scheduler,
      observedAt
    });
    const leased = this.#scheduler.leaseSelected(familyContextInput(baseContextInput, frontier));
    if (!leased.admitted) {
      return freeze({
        schemaVersion: FAMILY_COMPANION_RUNTIME_SCHEMA,
        state: 'BLOCKED',
        reason: leased.reason ?? leased.state ?? 'LEASE_REJECTED',
        requestRef: request.requestRef,
        intentRef: work.intent.intentRef,
        selectedIntentRef: selected.intentRef,
        modelCallPerformed: false,
        leaseResult: clone(leased)
      });
    }

    let responseAppended = false;
    try {
      const familyContextLease = recanonicalizeFamilyContextLease({
        home: this.#home,
        frontier,
        leasedContext: leased.contextLease,
        observedAt
      });
      const materialization = await materializeFamilyPromptContext({
        home: this.#home,
        frontier,
        contextLease: familyContextLease,
        observedAt
      });
      const response = await this.#inference({
        endpointProfile,
        requestContent: current.trigger.content,
        familyPromptContextMaterialization: materialization
      });
      if (!response?.promptContextMaterializationReceipt?.receiptRef ||
          response.promptContextMaterializationReceipt.providerBoundaryCurrentnessVerified !== true ||
          response.promptContextMaterializationReceipt.providerBoundarySourceBindingsVerified !== true) {
        fail('FAMILY_COMPANION_INFERENCE_INVALID', 'accepted Family inference did not return one provider-verified materialization receipt');
      }

      const frontierWitness = verifyFamilyGroupFrontierCurrent({
        home: this.#home,
        frontier,
        observedAt: this.#clock()
      });
      const frontierState = frontierWitness.state === FAMILY_GROUP_FRONTIER_CURRENTNESS
        ? FAMILY_COMPANION_FRONTIER_STATES.CURRENT_AT_DELIVERY
        : frontierWitness.state === FAMILY_GROUP_FRONTIER_ADVANCED
          ? FAMILY_COMPANION_FRONTIER_STATES.AS_OF_FRONTIER
          : null;
      if (!frontierState) {
        fail('FAMILY_COMPANION_FRONTIER_STALE', 'post-inference Family frontier currentness is not deliverable', {
          state: frontierWitness.state
        });
      }

      const deliveryCurrent = currentFamilyOwners({ home: this.#home, request, requireTrigger: true });
      if (deliveryCurrent.trigger.speakerRef !== frontier.requestPrincipalRef ||
          deliveryCurrent.family.familyCompanionLineageRef !== frontier.familyCompanionLineageRef) {
        fail('FAMILY_COMPANION_DELIVERY_STALE', 'Family request principal or companion lineage changed before delivery');
      }

      const deliveredAt = this.#clock();
      const prior = currentResponseEvent({
        home: this.#home,
        request,
        responseMessageRef: work.identity.responseMessageRef
      });
      let responseEvent;
      let appendState;
      if (prior) {
        responseEvent = prior;
        appendState = 'IDEMPOTENT_CURRENT';
      } else {
        const message = responseEnvelope({
          home: this.#home,
          request,
          identity: work.identity,
          current: deliveryCurrent,
          response,
          createdAt: deliveredAt
        });
        const appended = appendConversationMessage({
          home: this.#home,
          message,
          instanceRef: this.#instanceRef,
          observedAt: deliveredAt
        });
        responseEvent = appended.event;
        appendState = appended.state;
        responseAppended = true;
      }
      safeCurrentResponse(responseEvent, request, deliveryCurrent.family.familyCompanionLineageRef);

      const receipt = deliveryReceipt({
        request,
        graph: work.graph,
        responseEvent,
        frontier,
        frontierState,
        promptReceipt: response.promptContextMaterializationReceipt,
        model: response.model,
        queue,
        leased,
        membershipGenerationAtDelivery: deliveryCurrent.family.membershipGeneration,
        deliveredAt
      });

      const completedAt = this.#clock();
      const completionInput = await this.#completionEvidenceFor({
        request,
        current: deliveryCurrent,
        graph: work.graph,
        node: work.node,
        queue,
        leased,
        frontier,
        frontierState,
        response,
        responseEvent,
        deliveryReceipt: receipt,
        admissionOptions,
        completedAt
      });
      if (!completionInput?.completionEvidence || !completionInput.completionReceiptRef || !completionInput.releaseReceiptRef) {
        fail('FAMILY_COMPANION_COMPLETION_EVIDENCE_INVALID', 'external completion evidence producer returned an incomplete binding');
      }
      const completion = this.#scheduler.completeActive({
        graph: work.graph,
        intentRegistry: this.#intentRegistry,
        trustSnapshot: admissionOptions.trustSnapshot,
        registeredProcessRefs: this.#registeredProcessRefs,
        registeredRoleRefs: this.#registeredRoleRefs,
        completionEvidence: completionInput.completionEvidence,
        completionReceiptRef: completionInput.completionReceiptRef,
        releaseReceiptRef: completionInput.releaseReceiptRef,
        completedAt
      });

      return freeze({
        schemaVersion: FAMILY_COMPANION_RUNTIME_SCHEMA,
        state: 'COMPLETED',
        requestRef: request.requestRef,
        intentRef: work.intent.intentRef,
        requestPrincipalRef: frontier.requestPrincipalRef,
        response: safeCurrentResponse(responseEvent, request, deliveryCurrent.family.familyCompanionLineageRef),
        appendState,
        frontierState,
        frontierWitness: clone(frontierWitness),
        promptMaterializationReceipt: clone(response.promptContextMaterializationReceipt),
        deliveryReceipt: receipt,
        schedulerCompletion: clone(completion),
        modelCallPerformed: true
      });
    } catch (error) {
      let schedulerCancellation = null;
      if (this.#scheduler.active) {
        try {
          const releasedAt = this.#clock();
          schedulerCancellation = this.#scheduler.cancelActive({
            releaseReceiptRef: `receipt.vex-family.runtime.cancel.${work.identity.requestFingerprint.slice(0, 32)}`,
            releasedAt,
            reason: responseAppended
              ? 'FAMILY_RUNTIME_COMPLETION_FAILED_AFTER_DURABLE_RESPONSE'
              : 'FAMILY_RUNTIME_EXECUTION_FAILED_BEFORE_DURABLE_RESPONSE'
          });
        } catch (cancelError) {
          throw new FamilyCompanionRuntimeError(
            'FAMILY_COMPANION_SCHEDULER_RELEASE_UNPROVEN',
            'Family runtime failed and the canonical scheduler lease release could not be proven',
            {
              sourceErrorCode: error?.code ?? null,
              sourceErrorMessage: error?.message ?? String(error),
              cancellationError: cancelError?.message ?? String(cancelError),
              responseAppended
            }
          );
        }
      }
      throw new FamilyCompanionRuntimeError(
        error instanceof FamilyCompanionRuntimeError ? error.code : 'FAMILY_COMPANION_EXECUTION_FAILED',
        error?.message ?? String(error),
        {
          ...(error instanceof FamilyCompanionRuntimeError && error.details ? error.details : {}),
          sourceErrorCode: error?.code ?? null,
          responseAppended,
          schedulerCancellation: schedulerCancellation ? clone(schedulerCancellation) : null
        }
      );
    }
  }
}

// [VXG RealForever]
