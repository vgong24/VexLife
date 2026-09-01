import {
  ROOT_CAPABILITY_KERNEL,
  compileCapabilityFrame,
  projectCapabilityFrontier,
  requireExecutable
} from './capability.mjs';
import { loadBlueprint } from './blueprint.mjs';
import {
  selectIndependentReadOnlyBatch,
  SingleWorkerIntentScheduler,
  WorkerLeaseAuthority
} from './intent-scheduler.mjs';
import {
  createIntentEnvelope,
  createIntentTrustSnapshot,
  createIntentWorkgraph,
  createWorkNode
} from './intent-workgraph.mjs';
import { ProcessFactory } from './process-factory.mjs';
import {
  CompanionReadRuntimeAuthority,
  COMPANION_READ_WORKER_REFS
} from './scheduler-runtime-observer.mjs';
import { createToolCall, ToolResultRelay } from './tool-result-relay.mjs';
import { semanticHash } from './utils.mjs';

export const CAPABILITY_ASSIMILATION_MODES = Object.freeze({
  DIRECT_SINGLE_TURN: 'DIRECT_SINGLE_TURN',
  ADOPTED_READ_ONLY: 'ADOPTED_READ_ONLY',
  CANONICAL_E2_UNTAUGHT_G0: 'CANONICAL_E2_UNTAUGHT_G0'
});

const MAXIMUM_REQUESTS = 8;
const MAXIMUM_ARGUMENT_BYTES = 8 * 1024;
const PROCESS_REF = 'process.vexlife.capability-assimilation.runtime-adoption';
const MODEL_WORKER_REF = 'worker.model.capability-assimilation.primary';
const MODEL_SCHEDULER_INSTANCE_REF = 'scheduler.capability-assimilation.model-worker';
const EXECUTABLE_STAGES = new Set(['EXECUTABLE', 'COMPLETED']);

function clone(value) {
  return structuredClone(value);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function canonicalRefs(values = []) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || !value)) {
    throw new Error('runtime refs must contain only non-empty strings');
  }
  return [...new Set(values)].sort();
}

function exactJson(content, label) {
  if (typeof content !== 'string' || !content.trim()) throw new Error(`${label} response is empty`);
  let value;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error(`${label} response must be one exact JSON object without prose or fences`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} response must be one JSON object`);
  }
  return value;
}

function normalizedInferenceResult(result, label) {
  if (typeof result === 'string') return { content: result, model: 'runtime-inference' };
  if (!result || typeof result.content !== 'string' || !result.content) {
    throw new Error(`${label} inference did not return non-empty content`);
  }
  return {
    content: result.content,
    model: typeof result.model === 'string' && result.model ? result.model : 'runtime-inference'
  };
}

function progressEvent(state, details = {}) {
  return freeze({
    schemaVersion: 'vexlife.capability-assimilation-progress/v1',
    state,
    ...clone(details),
    hiddenReasoningIncluded: false
  });
}


const PRACTICE_CONTRACT_REF = 'contract.intent-scheduler.mock-tool.capability-practice-read/v1';
const PRACTICE_TOOL_REF = 'tool.mock.capability-practice-read';
const PRACTICE_EFFECT_REF = 'effect.mock.capability-practice-read';
const PRACTICE_ARGUMENT_SCHEMA_REF = 'schema.tool.mock.capability-practice-read/v1';
const PRACTICE_RESULT_SCHEMA_REF = 'schema.tool.mock.capability-practice-observation/v1';
const PRACTICE_EXECUTOR_REF = 'executor.mock.deterministic.capability-practice-read';
const SCHEDULER_READ_PROCESS_REF = 'process.vexlife.intent.scheduler-tool-relay';
const SCHEDULER_TRANSITION_PROCESS_REF = 'process.vexlife.intent.verify-transition';
const SCHEDULER_ACTOR_REF = 'vex.capability-assimilation.runtime';
const FORBIDDEN_SCHEDULER_CONTEXT_FIELDS = Object.freeze([
  'schedulerAdmission',
  'schedulerAdmissionReceipt',
  'schedulerRuntimeEvidence',
  'schedulerRuntimeTrustSnapshot',
  'runtimeTrustSnapshot',
  'schedulerLeases',
  'workerLease',
  'contextLease',
  'resourceLease',
  'capabilityLease',
  'effectLease',
  'schedulerGeneration',
  'schedulerWorkerRef',
  'schedulerOccupancy'
]);

function practiceContract(schedulerRegistry) {
  const contract = (schedulerRegistry?.mockToolContracts ?? []).find((item) =>
    item.contractRef === PRACTICE_CONTRACT_REF &&
    item.toolRef === PRACTICE_TOOL_REF &&
    item.effectRef === PRACTICE_EFFECT_REF
  );
  if (!contract ||
      contract.argumentSchemaRef !== PRACTICE_ARGUMENT_SCHEMA_REF ||
      contract.resultSchemaRef !== PRACTICE_RESULT_SCHEMA_REF ||
      contract.executorRef !== PRACTICE_EXECUTOR_REF ||
      contract.externalEffectsExecuted !== false) {
    throw new Error('capability runtime requires the accepted generic scheduler capability-practice contract');
  }
  return freeze(clone(contract));
}

function schedulerOwnerBundle(schedulerRegistry) {
  const bundle = loadBlueprint();
  if (!bundle.intentRegistry || !bundle.schedulerRegistry ||
      semanticHash(bundle.schedulerRegistry) !== semanticHash(schedulerRegistry)) {
    throw new Error('capability runtime scheduler registry must equal exact current source-managed Blueprint truth');
  }
  const registeredProcessRefs = canonicalRefs([
    ...(bundle.factory?.processes ?? []).map((item) => item.processRef),
    ...(bundle.schedulerRegistry?.processRefs ?? [])
  ]);
  const registeredRoleRefs = canonicalRefs((bundle.blueprint?.roles ?? []).map((item) => item.roleRef));
  if (!registeredProcessRefs.includes(SCHEDULER_READ_PROCESS_REF) ||
      !registeredProcessRefs.includes(SCHEDULER_TRANSITION_PROCESS_REF)) {
    throw new Error('capability runtime requires accepted scheduler process ownership');
  }
  return freeze({
    intentRegistry: bundle.intentRegistry,
    registeredProcessRefs,
    registeredRoleRefs
  });
}

function intentBindingRefs(nodes, intentRegistry) {
  return Object.fromEntries(intentRegistry.bindingFields.map((field) => [
    field,
    canonicalRefs(nodes.flatMap((item) =>
      Array.isArray(item[field]) ? item[field] : [item[field]]
    ).filter(Boolean))
  ]));
}

function assertNoCallerSchedulerEvidence(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    throw new Error('capability runtime context must be one object');
  }
  const injected = FORBIDDEN_SCHEDULER_CONTEXT_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(context, field)
  );
  if (injected.length) {
    throw new Error(`caller cannot supply scheduler admission or lease evidence: ${injected.sort().join(', ')}`);
  }
}


function schedulerPolicy(schedulerRegistry) {
  const policy = schedulerRegistry?.physicalWorkerPolicy;
  if (!schedulerRegistry?.canonicalSourceRef ||
      !policy?.policyRef ||
      policy.modelInferenceConcurrency !== 1 ||
      policy.backgroundModelConcurrencyWhileInteractiveWaits !== 0 ||
      policy.activeContextLeasesPerWorker !== 1) {
    throw new Error('capability runtime requires the exact source-managed single-model-worker scheduler policy');
  }
  return freeze({
    schedulerSourceRef: schedulerRegistry.canonicalSourceRef,
    policyRef: policy.policyRef,
    modelInferenceConcurrency: policy.modelInferenceConcurrency,
    backgroundModelConcurrencyWhileInteractiveWaits: policy.backgroundModelConcurrencyWhileInteractiveWaits,
    activeContextLeasesPerWorker: policy.activeContextLeasesPerWorker
  });
}

function createSchedulerOwnedInferenceGate(schedulerRegistry, nextTime) {
  const policy = schedulerPolicy(schedulerRegistry);
  const authority = new WorkerLeaseAuthority({ sourceRef: policy.schedulerSourceRef });
  let queueTail = Promise.resolve();
  let generation = 0;

  async function run({ phaseRef, inference, input }) {
    if (typeof phaseRef !== 'string' || !phaseRef) throw new Error('model inference phaseRef is required');
    if (typeof inference !== 'function') throw new Error('model inference gate requires an inference function');
    const predecessor = queueTail;
    let releaseQueue;
    queueTail = new Promise((resolve) => { releaseQueue = resolve; });
    await predecessor;

    const schedulerGeneration = ++generation;
    const formedAt = nextTime();
    const expiresAt = new Date(Date.parse(formedAt) + 10 * 60 * 1000).toISOString();
    const runtimeSnapshot = {
      sourceRef: policy.schedulerSourceRef,
      observedAt: formedAt,
      schedulerGeneration,
      workerRef: MODEL_WORKER_REF,
      policyRef: policy.policyRef,
      policyFingerprint: semanticHash(policy)
    };
    runtimeSnapshot.semanticFingerprint = semanticHash(runtimeSnapshot);
    const lease = {
      schemaVersion: 'vexlife.capability-assimilation-model-worker-lease/v1',
      leaseRef: `worker-lease.capability-assimilation.${String(schedulerGeneration).padStart(6, '0')}`,
      schedulerInstanceRef: MODEL_SCHEDULER_INSTANCE_REF,
      workerRef: MODEL_WORKER_REF,
      workNodeRef: phaseRef,
      graphFingerprint: semanticHash({ phaseRef, schedulerGeneration, policyRef: policy.policyRef }),
      trustSnapshotFingerprint: runtimeSnapshot.semanticFingerprint,
      runtimeSnapshotFingerprint: runtimeSnapshot.semanticFingerprint,
      schedulerGeneration,
      formedAt,
      expiresAt,
      observedAt: formedAt,
      currentness: 'CURRENT',
      lifecycle: 'ACTIVE'
    };
    lease.semanticFingerprint = semanticHash(lease);
    const claim = authority.claim(lease, runtimeSnapshot);
    if (!claim.admitted) {
      releaseQueue();
      throw new Error(`model inference worker lease was not admitted: ${claim.reason}`);
    }

    try {
      const result = await inference(input);
      const completedAt = nextTime();
      const released = authority.release(lease, {
        lifecycle: 'RELEASED',
        receiptRef: `${lease.leaseRef}.released`,
        transitionedAt: completedAt,
        reason: 'MODEL_INFERENCE_PHASE_COMPLETED'
      });
      return freeze({
        result,
        receipt: {
          schemaVersion: 'vexlife.capability-assimilation-model-sequence-receipt/v1',
          phaseRef,
          sequence: schedulerGeneration,
          schedulerInstanceRef: MODEL_SCHEDULER_INSTANCE_REF,
          schedulerSourceRef: policy.schedulerSourceRef,
          schedulerPolicyRef: policy.policyRef,
          schedulerPolicyFingerprint: semanticHash(policy),
          modelInferenceConcurrency: policy.modelInferenceConcurrency,
          workerLeaseRef: lease.leaseRef,
          workerLeaseFingerprint: lease.semanticFingerprint,
          releaseReceiptRef: released.receipt.receiptRef,
          releasedLeaseFingerprint: released.lease.semanticFingerprint,
          formedAt,
          completedAt,
          currentness: 'CURRENT'
        }
      });
    } catch (error) {
      const failedAt = nextTime();
      authority.release(lease, {
        lifecycle: 'RELEASED',
        receiptRef: `${lease.leaseRef}.failed`,
        transitionedAt: failedAt,
        reason: 'MODEL_INFERENCE_PHASE_FAILED'
      });
      throw error;
    } finally {
      releaseQueue();
    }
  }

  return freeze({
    schemaVersion: 'vexlife.capability-assimilation-model-gate/v1',
    schedulerSourceRef: policy.schedulerSourceRef,
    schedulerPolicyRef: policy.policyRef,
    run
  });
}

function requestContract(value, frame) {
  if (value.intentDisposition !== 'REQUEST_READ_ONLY_FUNCTIONS') {
    throw new Error('request-formation intentDisposition must be REQUEST_READ_ONLY_FUNCTIONS');
  }
  if (!Array.isArray(value.requests) || value.requests.length === 0 || value.requests.length > MAXIMUM_REQUESTS) {
    throw new Error(`request-formation requests must contain 1-${MAXIMUM_REQUESTS} entries`);
  }
  const visible = new Map(frame.entries.map((entry) => [entry.capabilityRef, entry]));
  const refs = new Set();
  const requests = value.requests.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`request ${index} must be one object`);
    }
    const requestRef = raw.requestRef ?? `request.capability-runtime.${String(index + 1).padStart(3, '0')}`;
    if (typeof requestRef !== 'string' || !requestRef || refs.has(requestRef)) {
      throw new Error(`request ${index} has an invalid or duplicate requestRef`);
    }
    refs.add(requestRef);
    const executable = requireExecutable(frame, raw.capabilityRef);
    if (executable.state !== 'CAPABILITY_EXECUTABLE') {
      throw new Error(`request ${requestRef} capability is not executable: ${executable.state}`);
    }
    const capability = visible.get(raw.capabilityRef);
    if (capability.effectClass !== 'READ_ONLY' ||
        capability.currentness.state !== 'CURRENT' ||
        capability.currentness.compatibility !== 'COMPATIBLE') {
      throw new Error(`request ${requestRef} capability is not an exact-current compatible read-only function`);
    }
    const argumentsValue = raw.arguments ?? {};
    if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue)) {
      throw new Error(`request ${requestRef} arguments must be one object`);
    }
    if (Buffer.byteLength(JSON.stringify(argumentsValue), 'utf8') > MAXIMUM_ARGUMENT_BYTES) {
      throw new Error(`request ${requestRef} arguments exceed the bounded size`);
    }
    const dependencyRefs = canonicalRefs(raw.dependencyRefs ?? []);
    return freeze({
      requestRef,
      capabilityRef: raw.capabilityRef,
      arguments: clone(argumentsValue),
      dependencyRefs,
      reasonCue: typeof raw.reasonCue === 'string' ? raw.reasonCue.slice(0, 240) : null,
      toolContract: clone(capability.toolContract),
      currentness: clone(capability.currentness),
      permissionRef: capability.permissionRef,
      permissionStage: capability.permissionStage,
      effectStage: capability.effectStage,
      resourceClass: capability.resourceClass,
      resourceStage: capability.resourceStage,
      effectClass: capability.effectClass,
      parallelClass: capability.parallelClass
    });
  });
  for (const request of requests) {
    for (const dependencyRef of request.dependencyRefs) {
      if (!refs.has(dependencyRef)) {
        throw new Error(`request ${request.requestRef} references unknown dependency ${dependencyRef}`);
      }
    }
  }
  return freeze({ requests });
}

function processDefinition(requests) {
  return {
    foundations: [],
    templates: [],
    workedExamples: [],
    processes: [{
      processRef: PROCESS_REF,
      processVersion: 1,
      purpose: 'Compile exact-current read-only capability requests for one later Companion synthesis turn.',
      requiredInputs: ['taskIntent'],
      foundationDependencies: [],
      authorityEnvelope: { effects: [] },
      steps: requests.map((request) => ({
        nodeRef: request.requestRef,
        functionRef: request.toolContract.toolRef,
        capabilityRef: request.capabilityRef,
        arguments: clone(request.arguments),
        dependencyRefs: [...request.dependencyRefs],
        effectClass: request.effectClass,
        parallelClass: request.parallelClass,
        sourceRefs: canonicalRefs([
          request.currentness.sourceRef,
          request.currentness.sourceVersionRef
        ].filter(Boolean)),
        metadata: {
          permissionRef: request.permissionRef,
          permissionStage: request.permissionStage,
          effectStage: request.effectStage,
          resourceClass: request.resourceClass,
          resourceStage: request.resourceStage,
          currentness: request.currentness,
          toolContractFingerprint: semanticHash(request.toolContract)
        }
      })),
      effectOwnerRule: 'Read-only executors own observations; Process Factory remains no-effect.',
      outputTemplateRefs: [],
      returnRouteRule: 'ToolResultRelay accepts and reinjects exact observations once before synthesis.',
      closureRule: 'One later Companion inference synthesizes terminal observations.',
      recoveryRule: 'Hold exact failed node and do not widen capability, authority, resource or effect scope.'
    }]
  };
}

function executionEvidenceForRequest(request, capabilityRegistry) {
  const capability = (capabilityRegistry.capabilities ?? []).find((item) => item.capabilityRef === request.capabilityRef) ?? null;
  const currentness = capability?.currentness?.state ?? 'UNKNOWN';
  const compatibility = capability?.currentness?.compatibility ?? 'UNKNOWN';
  const contractFingerprint = capability?.toolContract ? semanticHash(capability.toolContract) : null;
  const exactContract = contractFingerprint === semanticHash(request.toolContract);
  const exactReadOnly = Boolean(capability) &&
    capability.effectClass === 'READ_ONLY' &&
    capability.permissionRef === request.permissionRef &&
    capability.resourceClass === request.resourceClass &&
    exactContract;
  const stageExecutable = EXECUTABLE_STAGES.has(capability?.defaultStage ?? 'DISCOVERABLE') &&
    EXECUTABLE_STAGES.has(request.permissionStage) &&
    EXECUTABLE_STAGES.has(request.effectStage) &&
    EXECUTABLE_STAGES.has(request.resourceStage);
  const evidence = {
    currentness: exactReadOnly && currentness === 'CURRENT' && compatibility === 'COMPATIBLE' ? 'CURRENT' : currentness,
    compatibility,
    authority: exactReadOnly && stageExecutable ? 'ADMITTED' : 'UNKNOWN',
    resource: exactReadOnly && EXECUTABLE_STAGES.has(request.resourceStage) ? 'AVAILABLE' : 'UNKNOWN',
    sourceRef: capability?.currentness?.sourceRef ?? request.currentness.sourceRef ?? null,
    sourceVersionRef: capability?.currentness?.sourceVersionRef ?? request.currentness.sourceVersionRef ?? null,
    capabilityFingerprint: capability ? semanticHash(capability) : null,
    toolContractFingerprint: contractFingerprint
  };
  evidence.semanticFingerprint = semanticHash(evidence);
  return freeze(evidence);
}

function executionEvidenceMaps(dag, requestByRef, capabilityRegistry) {
  const evidenceByNodeRef = new Map();
  for (const node of dag.nodes) {
    const request = requestByRef.get(node.nodeRef);
    if (!request) continue;
    evidenceByNodeRef.set(node.nodeRef, executionEvidenceForRequest(request, capabilityRegistry));
  }
  return {
    evidenceByNodeRef,
    currentnessByNodeRef: Object.fromEntries([...evidenceByNodeRef].map(([nodeRef, evidence]) => [nodeRef, evidence.currentness])),
    authorityByNodeRef: Object.fromEntries([...evidenceByNodeRef].map(([nodeRef, evidence]) => [nodeRef, evidence.authority])),
    resourceByNodeRef: Object.fromEntries([...evidenceByNodeRef].map(([nodeRef, evidence]) => [nodeRef, evidence.resource]))
  };
}

function assertCurrentObservation(observation, request) {
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
    throw new Error(`executor ${request.capabilityRef} returned an invalid observation`);
  }
  if (observation.capabilityRef !== request.capabilityRef) {
    throw new Error(`executor ${request.capabilityRef} returned a mismatched capabilityRef`);
  }
  if (observation.currentness?.state !== 'CURRENT' || observation.currentness?.compatibility !== 'COMPATIBLE') {
    throw new Error(`executor ${request.capabilityRef} returned a stale or incompatible observation`);
  }
  if (!Array.isArray(observation.sourceRefs) || observation.sourceRefs.some((value) => typeof value !== 'string' || !value)) {
    throw new Error(`executor ${request.capabilityRef} returned invalid source refs`);
  }
  return observation;
}

function toolSemanticPurpose(call) {
  return semanticHash({
    workNodeRef: call.workNodeRef,
    toolContractRef: call.toolContractRef,
    toolRef: call.toolRef,
    effectRef: call.effectRef,
    argumentSchemaRef: call.argumentSchemaRef,
    argumentHash: call.argumentHash,
    resultSchemaRef: call.resultSchemaRef,
    executorRef: call.executorRef,
    sourceEvidenceRef: call.sourceEvidenceRef,
    sourceEvidenceHash: call.sourceEvidenceHash
  });
}


function formSchedulerReadGraph({ request, roleRef, schedulerGeneration, owner, formedAt, schedulerRegistry }) {
  const identity = semanticHash({
    requestRef: request.requestRef,
    capabilityRef: request.capabilityRef,
    schedulerGeneration,
    formedAt
  }).slice(0, 24);
  const intent = createIntentEnvelope({
    intentRef: `intent.capability-practice.${identity}`,
    originMessageRef: `message.capability-practice.${identity}`,
    originSpeakerRef: 'person.local-user',
    recipientRoleRef: roleRef,
    projectRef: 'project.vexlife.capability-assimilation.runtime-adoption',
    threadRef: `thread.capability-practice.${identity}`,
    channelRef: `channel.capability-practice.${identity}`,
    originalContentHash: semanticHash({
      requestRef: request.requestRef,
      capabilityRef: request.capabilityRef,
      arguments: request.arguments
    }),
    desiredOutcome: {
      intentKey: 'VALIDATE_WORKGRAPH',
      summary: `Execute one bounded capability-practice read for ${request.capabilityRef}`
    },
    constraints: [],
    createdAt: formedAt,
    sourceLineageRef: `lineage.capability-practice.${identity}`
  }, owner.intentRegistry);

  const sourceRefs = canonicalRefs([
    schedulerRegistry.canonicalSourceRef,
    request.currentness?.sourceRef,
    request.currentness?.sourceVersionRef
  ].filter(Boolean));
  const node = createWorkNode({
    workNodeRef: `work.capability-practice.${identity}`,
    rootIntentRef: intent.intentRef,
    purpose: `Practice one bounded read for ${request.capabilityRef} without moving capability ownership into the scheduler.`,
    processRef: SCHEDULER_READ_PROCESS_REF,
    state: 'READY',
    dependencyRefs: [],
    childRefs: [],
    roleRef,
    priorityClass: 'NORMAL',
    applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs: [],
    applicableBurdenReleaseRefs: [],
    capabilityEnvelopeRef: `capability-envelope.capability-practice.${identity}`,
    effectEnvelopeRef: `effect-envelope.capability-practice.${identity}`,
    resourceEnvelopeRef: `resource-envelope.capability-practice.${identity}`,
    expectedTransitionRef: `expected-transition.capability-practice.${identity}`,
    completionGateRefs: [`completion-gate.capability-practice.${identity}`],
    returnRouteRef: `return-route.capability-practice.${identity}`,
    sourceRefs,
    createdAt: formedAt
  }, owner.intentRegistry);

  let priorState = 'CAPTURED';
  const transitions = ['DECOMPOSED', 'PLAN_VALIDATED', 'READY'].map((nextState, sequence) => {
    const transition = {
      transitionRef: `transition.capability-practice.${identity}.${sequence}`,
      workNodeRef: node.workNodeRef,
      sequence,
      priorState,
      nextState,
      reason: 'capability-practice scheduler formation',
      actorRef: SCHEDULER_ACTOR_REF,
      actorRoleRef: roleRef,
      processRef: SCHEDULER_TRANSITION_PROCESS_REF,
      sourceRefs,
      createdAt: new Date(Date.parse(formedAt) + sequence).toISOString()
    };
    priorState = nextState;
    return transition;
  });

  const bindings = intentBindingRefs([node], owner.intentRegistry);
  const graph = createIntentWorkgraph({
    graphRef: `intent-workgraph.capability-practice.${identity}`,
    intent,
    nodes: [node],
    transitions,
    receipts: [],
    bindingRefs: bindings,
    createdAt: formedAt
  }, owner.intentRegistry);
  const trustSnapshot = createIntentTrustSnapshot({
    schemaVersion: 'vexlife.intent-trust-snapshot/v0',
    snapshotRef: `trust-snapshot.capability-practice.${identity}`,
    sourceRef: schedulerRegistry.canonicalSourceRef,
    formationRef: `formation.capability-practice.trust.${identity}`,
    formedAt,
    currentness: 'CURRENT',
    bindingRefs: bindings,
    actorRefs: ['person.local-user', SCHEDULER_ACTOR_REF],
    decisionRefs: [],
    authorizationBindings: []
  }, owner.intentRegistry);
  return { identity, graph, node, trustSnapshot };
}

function schedulerAdmissionOptions({
  graph,
  node,
  trustSnapshot,
  observed,
  schedulerGeneration,
  occupancyRef,
  roleRef,
  owner
}) {
  const runtime = observed.runtimeTrustSnapshot;
  const common = {
    runtimeSnapshotRef: runtime.snapshotRef,
    runtimeSnapshotFingerprint: runtime.semanticFingerprint,
    schedulerGeneration,
    authorityRef: runtime.leaseAuthorityRef,
    sourceRef: runtime.sourceRef,
    sourceHash: runtime.sourceHash,
    formedAt: runtime.formedAt,
    observedAt: runtime.observedAt,
    expiresAt: runtime.expiresAt,
    currentness: 'CURRENT',
    lifecycle: 'ACTIVE'
  };
  return {
    intentRegistry: owner.intentRegistry,
    schedulerRegistry: null,
    registeredProcessRefs: owner.registeredProcessRefs,
    registeredRoleRefs: owner.registeredRoleRefs,
    trustSnapshot,
    runtimeTrustSnapshot: runtime,
    resourceSnapshot: observed.resourceSnapshot,
    resourceRequestByNodeRef: {
      [node.workNodeRef]: clone(observed.resourceRequest)
    },
    occupancyByNodeRef: {
      [node.workNodeRef]: {
        occupancyRef,
        actorRef: runtime.actorRef,
        roleRef,
        workNodeRef: node.workNodeRef,
        graphFingerprint: graph.semanticFingerprint,
        claimRef: runtime.claimRef,
        formationRef: `formation.occupancy.${node.workNodeRef}.${schedulerGeneration}`,
        ...common
      }
    },
    capabilityLeaseByNodeRef: {
      [node.workNodeRef]: {
        leaseRef: `capability-lease.${node.workNodeRef}.${schedulerGeneration}`,
        workNodeRef: node.workNodeRef,
        graphFingerprint: graph.semanticFingerprint,
        trustSnapshotFingerprint: trustSnapshot.semanticFingerprint,
        envelopeRef: node.capabilityEnvelopeRef,
        formationRef: `formation.capability-lease.${node.workNodeRef}.${schedulerGeneration}`,
        toolRefs: [PRACTICE_TOOL_REF],
        ...common
      }
    },
    effectLeaseByNodeRef: {
      [node.workNodeRef]: {
        leaseRef: `effect-lease.${node.workNodeRef}.${schedulerGeneration}`,
        workNodeRef: node.workNodeRef,
        graphFingerprint: graph.semanticFingerprint,
        trustSnapshotFingerprint: trustSnapshot.semanticFingerprint,
        envelopeRef: node.effectEnvelopeRef,
        formationRef: `formation.effect-lease.${node.workNodeRef}.${schedulerGeneration}`,
        effectDisposition: 'EFFECT_ENVELOPE_BOUND',
        allowedEffectRefs: [PRACTICE_EFFECT_REF],
        ...common
      }
    },
    resourceLeaseRefByNodeRef: {
      [node.workNodeRef]: `resource-lease.${node.workNodeRef}.${schedulerGeneration}`
    },
    workerRef: observed.workerRef,
    schedulerGeneration,
    formedAt: runtime.formedAt,
    observedAt: runtime.observedAt,
    expiresAt: runtime.expiresAt
  };
}

function schedulerContextInput({ node, graph, trustSnapshot, observed, schedulerGeneration, identity }) {
  const runtime = observed.runtimeTrustSnapshot;
  return {
    leaseRef: `context-lease.capability-practice.${identity}`,
    cancellationTokenRef: `cancellation-token.capability-practice.${identity}`,
    foundationKernelRef: 'foundation.vexlife.state-relay.v1',
    roleFrameRef: 'role-frame.vex.companion',
    intentFrameRef: `intent-frame.capability-practice.${identity}`,
    selectedAtlasRefs: [],
    selectedSourceRefs: canonicalRefs(node.sourceRefs),
    applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs: [],
    applicableReleaseRefs: [],
    inputTokenEstimate: 0,
    reservedOutputTokens: 1024,
    hardTokenLimit: 8192,
    formedAt: runtime.formedAt,
    observedAt: runtime.observedAt,
    expiresAt: runtime.expiresAt,
    checkpointReturnRef: node.returnRouteRef
  };
}

function mappedPracticeObservation(rawObservation) {
  return freeze({
    summaryRef: rawObservation.summaryRef,
    capabilityRef: rawObservation.capabilityRef,
    sourceRefs: canonicalRefs(rawObservation.sourceRefs),
    currentness: rawObservation.currentness.state,
    payload: clone(rawObservation.payload ?? {})
  });
}

function schedulerCompletionEvidence({ graph, node, active, runtimeTrustSnapshot, observation, completedAt }) {
  return {
    verificationReceiptRef: `verification.${node.workNodeRef}.${active.active.schedulerGeneration}`,
    workNodeRef: node.workNodeRef,
    nodeFingerprint: node.semanticFingerprint,
    graphRef: graph.graphRef,
    graphFingerprint: graph.semanticFingerprint,
    runtimeSnapshotFingerprint: runtimeTrustSnapshot.semanticFingerprint,
    schedulerInstanceRef: active.active.schedulerInstanceRef,
    schedulerGeneration: active.active.schedulerGeneration,
    expectedTransitionRef: node.expectedTransitionRef,
    gateObservations: node.completionGateRefs.map((completionGateRef) => ({
      gateResultRef: `gate-result.${completionGateRef}.${active.active.schedulerGeneration}`,
      completionGateRef,
      sourceObservationRef: observation.observationRef,
      sourceObservationHash: observation.semanticFingerprint,
      observedBeforeState: node.state,
      observedAfterState: 'COMPLETED',
      result: 'PASSED'
    })),
    observedBeforeState: node.state,
    observedAfterState: 'COMPLETED',
    returnRouteRef: node.returnRouteRef,
    formedAt: completedAt,
    observedAt: completedAt,
    expiresAt: runtimeTrustSnapshot.expiresAt,
    selfCertified: false
  };
}


function resultFromObservation(call, observation) {
  return freeze({
    toolCallRef: call.toolCallRef,
    observationRef: `observation.${semanticHash({ toolCallRef: call.toolCallRef, observation }).slice(0, 24)}`,
    workNodeRef: call.workNodeRef,
    workerRef: call.workerRef,
    workerLeaseRef: call.workerLeaseRef,
    graphFingerprint: call.graphFingerprint,
    trustSnapshotFingerprint: call.trustSnapshotFingerprint,
    runtimeSnapshotFingerprint: call.runtimeSnapshotFingerprint,
    contextLeaseRef: call.contextLeaseRef,
    contextLeaseFingerprint: call.contextLeaseFingerprint,
    toolRef: call.toolRef,
    effectRef: call.effectRef,
    capabilityLeaseFingerprint: call.capabilityLeaseFingerprint,
    effectLeaseFingerprint: call.effectLeaseFingerprint,
    resourceLeaseFingerprint: call.resourceLeaseFingerprint,
    schedulerGeneration: call.schedulerGeneration,
    cancellationTokenRef: call.cancellationTokenRef,
    executorRef: call.executorRef,
    sourceEvidenceRef: call.sourceEvidenceRef,
    sourceEvidenceHash: call.sourceEvidenceHash,
    schemaRef: call.resultSchemaRef,
    observation: clone(observation),
    artifactRefs: []
  });
}

function defaultExecutors({ capabilityRegistry, processFactoryDefinition, frame, frontier, context }) {
  const registrySourceRef = 'source.blueprint.capability-registry';
  const currentness = Object.freeze({
    state: 'CURRENT',
    sourceRef: registrySourceRef,
    sourceVersionRef: `capability-registry.v${capabilityRegistry.registryVersion ?? 'unknown'}`,
    compatibility: 'COMPATIBLE'
  });
  const wrap = (capabilityRef, payload, sourceRefs = [registrySourceRef]) => ({
    summaryRef: `summary.${capabilityRef}.${semanticHash(payload).slice(0, 20)}`,
    capabilityRef,
    sourceRefs: canonicalRefs(sourceRefs),
    currentness,
    payload
  });
  return {
    'capability.search': async (argumentsValue) => {
      const query = String(argumentsValue.query ?? '').trim().toLowerCase();
      const matches = frame.entries.filter((entry) =>
        !query || entry.capabilityRef.toLowerCase().includes(query) || entry.purpose.toLowerCase().includes(query));
      return wrap('capability.search', {
        query,
        candidateCapabilityRefs: matches.slice(0, 12).map((entry) => entry.capabilityRef),
        unknownDoorRefs: query && matches.length === 0 ? [`unknown-door.capability-search.${semanticHash(query).slice(0, 16)}`] : []
      });
    },
    'capability.describe': async (argumentsValue) => {
      const capabilityRef = argumentsValue.capabilityRef ?? frontier.activeCapabilityRef ?? ROOT_CAPABILITY_KERNEL[0];
      const entry = frame.entries.find((candidate) => candidate.capabilityRef === capabilityRef) ?? null;
      return wrap('capability.describe', {
        capabilityRef,
        state: entry ? 'FOUND' : 'UNKNOWN',
        frontierEntry: entry ? {
          capabilityRef: entry.capabilityRef,
          purpose: entry.purpose,
          stage: entry.stage,
          childCapabilityRefs: entry.childCapabilityRefs,
          recommendedNextCapabilityRefs: entry.recommendedNextCapabilityRefs,
          heldNextCapabilities: entry.heldNextCapabilities,
          unknownDoorRefs: entry.unknownDoorRefs,
          competenceState: entry.competenceState,
          currentness: entry.currentness,
          permissionStage: entry.permissionStage,
          effectStage: entry.effectStage,
          resourceStage: entry.resourceStage,
          parallelClass: entry.parallelClass,
          dependencyRefs: entry.dependencyRefs
        } : null
      });
    },
    'process.resolve': async (argumentsValue) => {
      const processRef = argumentsValue.processRef ?? null;
      const process = (processFactoryDefinition.processes ?? []).find((candidate) => candidate.processRef === processRef) ?? null;
      return wrap('process.resolve', {
        processRef,
        state: process ? 'FOUND' : 'UNKNOWN',
        processVersion: process?.processVersion ?? null,
        purpose: process?.purpose ?? null,
        noEffectCompiler: true
      }, process ? [registrySourceRef, `source.process.${processRef}`] : [registrySourceRef]);
    },
    'context.where': async () => wrap('context.where', {
      runtimeMode: CAPABILITY_ASSIMILATION_MODES.ADOPTED_READ_ONLY,
      taskRef: context.taskRef ?? null,
      projectRef: context.projectRef ?? null,
      threadRef: context.threadRef ?? null,
      channelRef: context.channelRef ?? null,
      activeCapabilityRef: frontier.activeCapabilityRef,
      rootCapabilityKernel: frontier.rootCapabilityKernel
    }, canonicalRefs([registrySourceRef, ...(context.sourceRefs ?? [])])),
    'help.render': async () => wrap('help.render', {
      availableCapabilityRefs: frontier.entries.map((entry) => entry.capabilityRef),
      heldNextCapabilities: frontier.entries.flatMap((entry) => entry.heldNextCapabilities),
      unknownDoorRefs: canonicalRefs(frontier.entries.flatMap((entry) => entry.unknownDoorRefs)),
      progressSource: 'RUNTIME_STATE_ONLY'
    })
  };
}

function requestPrompt(taskIntent, frontier) {
  return [
    'VEXLIFE_CAPABILITY_REQUEST_FORMATION/v1',
    'Select only exact-current READ_ONLY functions from the supplied compact frontier.',
    'Return one JSON object and no prose, markdown, hidden reasoning, or chain-of-thought.',
    'Schema: {"intentDisposition":"REQUEST_READ_ONLY_FUNCTIONS","requests":[{"requestRef":"stable ref","capabilityRef":"canonical ref","arguments":{},"dependencyRefs":[],"reasonCue":"short public routing cue or null"}]}',
    `TASK_INTENT=${JSON.stringify(taskIntent)}`,
    `COMPACT_CAPABILITY_FRONTIER=${JSON.stringify(frontier)}`
  ].join('\n');
}

function synthesisPrompt(taskIntent, observations, held) {
  const bounded = observations.map((observation) => ({
    observationRef: observation.observationRef,
    capabilityRef: observation.summary.capabilityRef,
    sourceEvidenceRef: observation.sourceEvidenceRef,
    sourceEvidenceHash: observation.sourceEvidenceHash,
    currentness: observation.summary.currentness,
    payload: observation.summary.payload
  }));
  return [
    'VEXLIFE_CAPABILITY_SYNTHESIS/v1',
    'Synthesize the human answer from the original task and exact accepted observations.',
    'Do not claim effects, sources, competence, currentness, or authority beyond the supplied evidence.',
    'Do not reveal hidden reasoning. Return only the final human-facing answer.',
    `TASK_INTENT=${JSON.stringify(taskIntent)}`,
    `SOURCE_BOUND_OBSERVATIONS=${JSON.stringify(bounded)}`,
    `HELD_OR_UNKNOWN_NODES=${JSON.stringify(held)}`
  ].join('\n');
}

export function createCapabilityAssimilationRuntime({
  capabilityRegistry,
  processFactoryDefinition,
  schedulerRegistry,
  mode = CAPABILITY_ASSIMILATION_MODES.ADOPTED_READ_ONLY,
  roleRef = 'role.vex.companion',
  platformRef = 'platform.browser',
  maximumConcurrency = 8,
  executors = {},
  clock = () => Date.now(),
  exactlyOnceNegativeControl = false
}) {
  if (!Object.values(CAPABILITY_ASSIMILATION_MODES).includes(mode)) {
    throw new Error(`unknown capability-assimilation mode ${mode}`);
  }
  if (typeof clock !== 'function') throw new Error('capability runtime clock must be a function');
  let sequence = 0;
  const nextTime = () => new Date(Number(clock()) + sequence++).toISOString();

  const owner = schedulerOwnerBundle(schedulerRegistry);
  const practice = practiceContract(schedulerRegistry);
  const readRuntimeAuthority = new CompanionReadRuntimeAuthority({
    schedulerRegistry,
    clock: () => {
      const value = clock();
      return value instanceof Date ? value : new Date(value);
    },
    ttlMs: 10 * 60 * 1000
  });
  const reservedReadSlots = new Set();
  let readDispatchGeneration = 0;

  function reserveReadSlot() {
    const workerRef = COMPANION_READ_WORKER_REFS.find((ref) => !reservedReadSlots.has(ref));
    if (!workerRef) throw new Error('no source-managed Companion read worker slot is currently available');
    reservedReadSlots.add(workerRef);
    return workerRef;
  }

  function releaseReadSlot(workerRef) {
    if (workerRef) reservedReadSlots.delete(workerRef);
  }

  function nextSchedulerTime(runtimeTrustSnapshot) {
    const lower = Date.parse(runtimeTrustSnapshot.observedAt) + 1;
    const upper = Date.parse(runtimeTrustSnapshot.expiresAt) - 1;
    const candidate = Date.parse(nextTime());
    if (!(upper > lower)) throw new Error('scheduler runtime interval is too small for a bounded read dispatch');
    return new Date(Math.max(lower, Math.min(candidate, upper))).toISOString();
  }

  async function acquireSchedulerDispatch({ request, roleRef }) {
    const workerRef = reserveReadSlot();
    const schedulerGeneration = ++readDispatchGeneration;
    const preIdentity = semanticHash({
      requestRef: request.requestRef,
      capabilityRef: request.capabilityRef,
      schedulerGeneration,
      workerRef
    }).slice(0, 24);
    const occupancyRef = `occupancy.capability-practice.${preIdentity}`;
    const claimRef = `claim.capability-practice.${preIdentity}`;
    let scheduler = null;
    try {
      const observed = await readRuntimeAuthority.observe({
        workerRef,
        schedulerGeneration,
        actorRef: SCHEDULER_ACTOR_REF,
        roleRef,
        claimRef,
        occupancyRef
      });
      const formedAt = observed.runtimeTrustSnapshot.formedAt;
      const formed = formSchedulerReadGraph({
        request,
        roleRef,
        schedulerGeneration,
        owner,
        formedAt,
        schedulerRegistry
      });
      const relay = new ToolResultRelay(null, { schedulerRegistry });
      const schedulerInstanceRef = `scheduler.capability-practice.${formed.identity}`;
      scheduler = new SingleWorkerIntentScheduler({
        workerRef,
        schedulerInstanceRef,
        schedulerRegistry,
        runtimeAuthority: readRuntimeAuthority.runtimeAuthority,
        toolRelay: relay
      });
      const options = schedulerAdmissionOptions({
        graph: formed.graph,
        node: formed.node,
        trustSnapshot: formed.trustSnapshot,
        observed,
        schedulerGeneration,
        occupancyRef,
        roleRef,
        owner
      });
      const queue = scheduler.admit(formed.graph, options);
      if (queue.state !== 'ADMITTED' || !queue.selected) {
        throw new Error(`scheduler runtime admission held capability read ${request.requestRef}: ${JSON.stringify(queue.blocked ?? [])}`);
      }
      const active = scheduler.leaseSelected(schedulerContextInput({
        node: formed.node,
        graph: formed.graph,
        trustSnapshot: formed.trustSnapshot,
        observed,
        schedulerGeneration,
        identity: formed.identity
      }));
      if (!active.admitted || active.state !== 'RUNNING') {
        throw new Error(`scheduler did not issue an active read lease for ${request.requestRef}: ${active.reason ?? active.state}`);
      }
      const proposedAt = nextSchedulerTime(observed.runtimeTrustSnapshot);
      const call = createToolCall({
        toolCallRef: `tool-call.capability-practice.${formed.identity}`,
        workNodeRef: formed.node.workNodeRef,
        toolRef: practice.toolRef,
        effectRef: practice.effectRef,
        arguments: {
          capabilityRef: request.capabilityRef,
          capabilityToolRef: request.toolContract.toolRef,
          capabilityEffectRef: request.toolContract.effectRef,
          capabilityArguments: clone(request.arguments)
        },
        schedulerGeneration,
        cancellationTokenRef: active.contextLease.cancellationTokenRef,
        sourceEvidenceRef: schedulerRegistry.canonicalSourceRef,
        sourceEvidenceHash: semanticHash(schedulerRegistry),
        proposedAt,
        timeoutAt: observed.runtimeTrustSnapshot.expiresAt,
        cancellationPolicy: 'CHECKPOINT_THEN_CANCEL'
      }, {
        contextLease: active.contextLease,
        capabilityLease: active.capabilityLease,
        effectLease: active.effectLease,
        resourceLease: active.resourceLease,
        workerLease: active.workerLease,
        runtimeTrustSnapshot: active.runtimeTrustSnapshot,
        schedulerRegistry,
        observedAt: proposedAt
      });
      const registered = relay.register(call);
      if (!registered.changed) throw new Error(`generic capability-practice tool call was not registered: ${registered.reason}`);
      return {
        workerRef,
        schedulerGeneration,
        scheduler,
        relay,
        queue,
        active,
        call,
        observed,
        ...formed
      };
    } catch (error) {
      if (scheduler?.active) {
        try {
          scheduler.cancelActive({
            releaseReceiptRef: `release.capability-practice.acquire-failure.${preIdentity}`,
            releasedAt: nextSchedulerTime(scheduler.aggregate.runtimeTrust),
            reason: 'CAPABILITY_PRACTICE_ACQUIRE_FAILED'
          });
        } catch {}
      }
      releaseReadSlot(workerRef);
      throw error;
    }
  }

  const inferenceGate = createSchedulerOwnedInferenceGate(schedulerRegistry, nextTime);

  async function gatedInference({ phaseRef, inference, input, label }) {
    const gated = await inferenceGate.run({ phaseRef, inference, input });
    return {
      normalized: normalizedInferenceResult(gated.result, label),
      receipt: gated.receipt
    };
  }

  async function resolveTurn({
    taskIntent,
    inference,
    endpointProfile,
    inMemoryAuthorization = null,
    timeoutMs = 5000,
    context = {}
  }) {
    if (typeof taskIntent !== 'string' || !taskIntent.trim()) throw new Error('taskIntent must be non-empty');
    if (typeof inference !== 'function') throw new Error('capability runtime requires one admitted inference function');
    assertNoCallerSchedulerEvidence(context);
    const progress = [progressEvent('TASK_RECEIVED', { taskRef: context.taskRef ?? null })];
    const modelSequenceReceipts = [];

    if (mode === CAPABILITY_ASSIMILATION_MODES.DIRECT_SINGLE_TURN ||
        mode === CAPABILITY_ASSIMILATION_MODES.CANONICAL_E2_UNTAUGHT_G0) {
      const direct = await gatedInference({
        phaseRef: `model-phase.${context.taskRef ?? semanticHash(taskIntent).slice(0, 16)}.direct`,
        inference,
        input: { endpointProfile, requestContent: taskIntent, inMemoryAuthorization, timeoutMs },
        label: 'direct'
      });
      modelSequenceReceipts.push(direct.receipt);
      progress.push(progressEvent('DIRECT_TOOL_FREE_INFERENCE_COMPLETED', {
        mode,
        inferenceCount: 1,
        toolRequestCount: 0
      }));
      return freeze({
        response: direct.normalized,
        actualHttpCall: true,
        contextSourceRefs: [],
        runtimeProjection: {
          schemaVersion: 'vexlife.capability-assimilation-runtime/v1',
          mode,
          inferenceCount: 1,
          toolRequestCount: 0,
          observationRefs: [],
          modelSequenceReceipts,
          progress,
          hiddenReasoningIncluded: false
        }
      });
    }

    const projectCapabilityStages = Object.fromEntries(
      ROOT_CAPABILITY_KERNEL.map((capabilityRef) => [capabilityRef, 'COMPLETED']));
    const frame = compileCapabilityFrame(capabilityRegistry, {
      roleRef,
      platformRef,
      projectCapabilityStages,
      permissionStages: { 'permission.none': 'COMPLETED' },
      effectStages: { READ_ONLY: 'COMPLETED' },
      resourceStages: { IO_BOUNDED: 'COMPLETED' }
    });
    const frontier = projectCapabilityFrontier(frame, {
      activeCapabilityRef: context.activeCapabilityRef ?? null
    });
    progress.push(progressEvent('CAPABILITY_FRONTIER_PROJECTED', {
      visibleCapabilityCount: frontier.entries.length,
      rootKernelCount: frontier.rootCapabilityKernel.length
    }));

    const requestPhase = await gatedInference({
      phaseRef: `model-phase.${context.taskRef ?? semanticHash(taskIntent).slice(0, 16)}.request-formation`,
      inference,
      input: {
        endpointProfile,
        requestContent: requestPrompt(taskIntent, frontier),
        inMemoryAuthorization,
        timeoutMs
      },
      label: 'request-formation'
    });
    modelSequenceReceipts.push(requestPhase.receipt);
    const requestInference = requestPhase.normalized;
    const requestProjection = requestContract(exactJson(requestInference.content, 'request-formation'), frame);
    progress.push(progressEvent('READ_ONLY_REQUESTS_FORMED', {
      requestCount: requestProjection.requests.length
    }));

    const factory = new ProcessFactory(processDefinition(requestProjection.requests));
    const compiled = factory.compile({
      processRef: PROCESS_REF,
      inputs: { taskIntent },
      sourceRefs: { capabilityRegistry: capabilityRegistry.registryRef },
      authority: { effects: [] },
      resourceBudget: { requiredTokens: 0, availableTokens: Number.POSITIVE_INFINITY },
      recipientRef: roleRef,
      now: nextTime()
    });
    if (compiled.state !== 'PLAN_READY_NO_EFFECT') {
      throw new Error(`capability process did not compile: ${compiled.state}:${compiled.reason ?? ''}`);
    }
    const dag = compiled.plan.dependencyDag;
    progress.push(progressEvent('DEPENDENCY_DAG_COMPILED', {
      nodeCount: dag.nodes.length,
      dependencyGraphHash: dag.graphHash
    }));

    const requestByRef = new Map(requestProjection.requests.map((request) => [request.requestRef, request]));
    const builtIns = defaultExecutors({ capabilityRegistry, processFactoryDefinition, frame, frontier, context });
    const executorMap = { ...builtIns, ...executors };
    const schedulerDispatchReceipts = [];
    const completed = new Set();
    const observations = [];
    const held = [];
    const exactlyOnceReceipts = [];

    while (completed.size < dag.nodes.length) {
      const evidenceMaps = executionEvidenceMaps(dag, requestByRef, capabilityRegistry);
      const decision = selectIndependentReadOnlyBatch({
        nodes: dag.nodes,
        completedNodeRefs: [...completed],
        currentnessByNodeRef: evidenceMaps.currentnessByNodeRef,
        authorityByNodeRef: evidenceMaps.authorityByNodeRef,
        resourceByNodeRef: evidenceMaps.resourceByNodeRef,
        maximumConcurrency
      });
      held.splice(0, held.length, ...decision.held);
      if (decision.batch.length === 0) {
        throw new Error(`capability DAG cannot advance: ${JSON.stringify(decision.held)}`);
      }
      progress.push(progressEvent('READ_ONLY_BATCH_STARTED', {
        nodeRefs: decision.batch.map((node) => node.nodeRef),
        batchSize: decision.batch.length
      }));

      const batchResults = await Promise.all(decision.batch.map(async (node) => {
        const request = requestByRef.get(node.nodeRef);
        if (!request) throw new Error(`dependency DAG node ${node.nodeRef} has no canonical request`);
        const beforeEvidence = evidenceMaps.evidenceByNodeRef.get(node.nodeRef);
        if (!beforeEvidence || beforeEvidence.currentness !== 'CURRENT' || beforeEvidence.authority !== 'ADMITTED' || beforeEvidence.resource !== 'AVAILABLE') {
          throw new Error(`execution evidence is not current/admitted for ${node.nodeRef}`);
        }
        const executor = executorMap[request.capabilityRef] ?? executorMap[request.toolContract.toolRef];
        if (typeof executor !== 'function') throw new Error(`no read-only executor for ${request.capabilityRef}`);
        let dispatch = null;
        try {
          dispatch = await acquireSchedulerDispatch({ request, roleRef });
          const rawObservation = assertCurrentObservation(await executor(clone(request.arguments), freeze({
            requestRef: request.requestRef,
            capabilityRef: request.capabilityRef,
            frontier,
            executionEvidence: beforeEvidence,
            schedulerAdmissionReceiptRef: dispatch.queue.admissionReceipt.admissionReceiptRef,
            schedulerWorkerRef: dispatch.workerRef,
            context: clone(context)
          })), request);
          const afterEvidence = executionEvidenceForRequest(request, capabilityRegistry);
          if (afterEvidence.semanticFingerprint !== beforeEvidence.semanticFingerprint ||
              afterEvidence.currentness !== 'CURRENT' || afterEvidence.authority !== 'ADMITTED' || afterEvidence.resource !== 'AVAILABLE') {
            throw new Error(`execution evidence changed or was revoked before relay acceptance for ${node.nodeRef}`);
          }
          const result = resultFromObservation(dispatch.call, mappedPracticeObservation(rawObservation));
          const accepted = dispatch.relay.accept(result, { receivedAt: nextSchedulerTime(dispatch.observed.runtimeTrustSnapshot) });
          if (!accepted.accepted || accepted.state !== 'ACCEPTED') {
            throw new Error(`ToolResultRelay rejected ${request.requestRef}: ${accepted.reason}`);
          }
          const reinjected = dispatch.relay.reinject(
            dispatch.active.contextLease,
            accepted.observation,
            { observedAt: nextSchedulerTime(dispatch.observed.runtimeTrustSnapshot) }
          );
          if (!reinjected.accepted || reinjected.state !== 'REINJECTED') {
            throw new Error(`ToolResultRelay did not reinject ${request.requestRef}: ${reinjected.reason}`);
          }
          if (exactlyOnceNegativeControl) {
            const duplicateAccept = dispatch.relay.accept(result, {
              receivedAt: nextSchedulerTime(dispatch.observed.runtimeTrustSnapshot)
            });
            const duplicateReinject = dispatch.relay.reinject(
              dispatch.active.contextLease,
              accepted.observation,
              { observedAt: nextSchedulerTime(dispatch.observed.runtimeTrustSnapshot) }
            );
            if (duplicateAccept.reason !== 'DUPLICATE_RESULT' ||
                duplicateReinject.reason !== 'OBSERVATION_ALREADY_REINJECTED') {
              throw new Error('ToolResultRelay exactly-once negative control did not fail closed');
            }
            exactlyOnceReceipts.push({
              requestRef: request.requestRef,
              duplicateAcceptReason: duplicateAccept.reason,
              duplicateReinjectReason: duplicateReinject.reason
            });
          }
          const completedAt = nextSchedulerTime(dispatch.observed.runtimeTrustSnapshot);
          const completion = dispatch.scheduler.completeActive({
            graph: dispatch.graph,
            intentRegistry: owner.intentRegistry,
            trustSnapshot: dispatch.trustSnapshot,
            registeredProcessRefs: owner.registeredProcessRefs,
            registeredRoleRefs: owner.registeredRoleRefs,
            completionEvidence: schedulerCompletionEvidence({
              graph: dispatch.graph,
              node: dispatch.node,
              active: dispatch.active,
              runtimeTrustSnapshot: dispatch.observed.runtimeTrustSnapshot,
              observation: accepted.observation,
              completedAt
            }),
            completionReceiptRef: `completion.capability-practice.${dispatch.identity}`,
            releaseReceiptRef: `release.capability-practice.${dispatch.identity}`,
            completedAt
          });
          schedulerDispatchReceipts.push(freeze({
            schemaVersion: 'vexlife.capability-assimilation-scheduler-dispatch/v1',
            requestRef: request.requestRef,
            capabilityRef: request.capabilityRef,
            schedulerInstanceRef: dispatch.active.active.schedulerInstanceRef,
            schedulerGeneration: dispatch.schedulerGeneration,
            workerRef: dispatch.workerRef,
            workerLeaseRef: dispatch.active.workerLease.leaseRef,
            admissionReceiptRef: dispatch.queue.admissionReceipt.admissionReceiptRef,
            admissionReceiptFingerprint: dispatch.queue.admissionReceipt.semanticFingerprint,
            toolCallRef: dispatch.call.toolCallRef,
            toolContractRef: dispatch.call.toolContractRef,
            toolRef: dispatch.call.toolRef,
            effectRef: dispatch.call.effectRef,
            capabilityToolRef: request.toolContract.toolRef,
            capabilityEffectRef: request.toolContract.effectRef,
            capabilityExecutorRef: request.toolContract.executorRef,
            completionReceiptRef: completion.completionReceipt.receiptRef,
            completionReceiptFingerprint: completion.completionReceipt.semanticFingerprint,
            externalEffectsExecuted: false
          }));
          return { nodeRef: node.nodeRef, observation: accepted.observation };
        } catch (error) {
          if (dispatch?.scheduler?.active) {
            try {
              dispatch.scheduler.cancelActive({
                releaseReceiptRef: `release.capability-practice.failed.${dispatch.identity}`,
                releasedAt: nextSchedulerTime(dispatch.observed.runtimeTrustSnapshot),
                reason: 'CAPABILITY_PRACTICE_READ_FAILED'
              });
            } catch {}
          }
          throw error;
        } finally {
          releaseReadSlot(dispatch?.workerRef);
        }
      }));


      for (const result of batchResults.sort((left, right) => left.nodeRef.localeCompare(right.nodeRef))) {
        completed.add(result.nodeRef);
        observations.push(result.observation);
        progress.push(progressEvent('OBSERVATION_ACCEPTED_AND_REINJECTED', {
          nodeRef: result.nodeRef,
          observationRef: result.observation.observationRef
        }));
      }
    }

    progress.push(progressEvent('LATER_SYNTHESIS_STARTED', {
      acceptedObservationCount: observations.length
    }));
    const synthesisPhase = await gatedInference({
      phaseRef: `model-phase.${context.taskRef ?? semanticHash(taskIntent).slice(0, 16)}.synthesis`,
      inference,
      input: {
        endpointProfile,
        requestContent: synthesisPrompt(taskIntent, observations, held),
        inMemoryAuthorization,
        timeoutMs
      },
      label: 'synthesis'
    });
    modelSequenceReceipts.push(synthesisPhase.receipt);
    const synthesis = synthesisPhase.normalized;
    progress.push(progressEvent('LATER_SYNTHESIS_COMPLETED', {
      inferenceCount: 2,
      acceptedObservationCount: observations.length
    }));

    const contextSourceRefs = canonicalRefs(observations.flatMap((observation) => [
      observation.observationRef,
      observation.sourceEvidenceRef,
      ...(observation.summary.sourceRefs ?? [])
    ]));
    return freeze({
      response: synthesis,
      actualHttpCall: true,
      contextSourceRefs,
      runtimeProjection: {
        schemaVersion: 'vexlife.capability-assimilation-runtime/v1',
        mode,
        inferenceCount: 2,
        requestModelRef: requestInference.model,
        synthesisModelRef: synthesis.model,
        modelSequenceReceipts: clone(modelSequenceReceipts),
        capabilityFrontierRef: `frontier.${semanticHash(frontier).slice(0, 24)}`,
        dependencyGraphHash: dag.graphHash,
        toolRequestCount: requestProjection.requests.length,
        observationRefs: observations.map((observation) => observation.observationRef).sort(),
        heldNodes: clone(held),
        exactlyOnceReceipts: clone(exactlyOnceReceipts),
        schedulerDispatchReceipts: clone([...schedulerDispatchReceipts].sort((left, right) => left.requestRef.localeCompare(right.requestRef))),
        progress,
        hiddenReasoningIncluded: false,
        externalEffectsExecuted: false
      }
    });
  }

  return freeze({
    schemaVersion: 'vexlife.capability-assimilation-runtime-controller/v1',
    mode,
    schedulerSourceRef: inferenceGate.schedulerSourceRef,
    schedulerPolicyRef: inferenceGate.schedulerPolicyRef,
    resolveTurn
  });
}

// [VXG RealForever]
