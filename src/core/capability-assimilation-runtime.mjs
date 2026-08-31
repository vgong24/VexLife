import {
  ROOT_CAPABILITY_KERNEL,
  compileCapabilityFrame,
  projectCapabilityFrontier,
  requireExecutable
} from './capability.mjs';
import { createContextLease } from './context-lease.mjs';
import {
  selectIndependentReadOnlyBatch,
  WorkerLeaseAuthority
} from './intent-scheduler.mjs';
import { ProcessFactory } from './process-factory.mjs';
import { ToolResultRelay } from './tool-result-relay.mjs';
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

function rootCapabilityContracts(capabilityRegistry) {
  return ROOT_CAPABILITY_KERNEL.map((capabilityRef) => {
    const capability = (capabilityRegistry.capabilities ?? []).find((item) => item.capabilityRef === capabilityRef);
    if (!capability?.toolContract) throw new Error(`root capability ${capabilityRef} is missing its tool contract`);
    return {
      contractRef: capability.toolContract.contractRef,
      toolRef: capability.toolContract.toolRef,
      effectRef: capability.toolContract.effectRef,
      argumentSchemaRef: capability.toolContract.argumentSchemaRef,
      resultSchemaRef: capability.toolContract.resultSchemaRef,
      executorRef: capability.toolContract.executorRef,
      requiredArgumentFields: [...(capability.toolContract.requiredArgumentFields ?? [])],
      requiredResultFields: [...(capability.toolContract.requiredResultFields ?? [])],
      maxObservationBytes: capability.toolContract.maxObservationBytes ?? 8192,
      externalEffectsExecuted: false
    };
  });
}

function runtimeSchedulerRegistry(schedulerRegistry, capabilityRegistry) {
  const registry = clone(schedulerRegistry);
  const existing = new Map((registry.mockToolContracts ?? []).map((contract) => [contract.toolRef, contract]));
  for (const contract of rootCapabilityContracts(capabilityRegistry)) existing.set(contract.toolRef, contract);
  registry.mockToolContracts = [...existing.values()].sort((left, right) => left.toolRef.localeCompare(right.toolRef));
  return registry;
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

function createRelayBindings(node, request, dag, schedulerRegistry, nextTime, executionEvidence) {
  if (executionEvidence.currentness !== 'CURRENT' ||
      executionEvidence.compatibility !== 'COMPATIBLE' ||
      executionEvidence.authority !== 'ADMITTED' ||
      executionEvidence.resource !== 'AVAILABLE') {
    throw new Error(`read-only relay binding requires current admitted execution evidence for ${node.nodeRef}`);
  }
  const generation = 1;
  const workerRef = 'worker.capability-assimilation.read-only';
  const graphFingerprint = dag.graphHash;
  const policy = schedulerPolicy(schedulerRegistry);
  const trustSnapshotFingerprint = semanticHash({
    schedulerSourceRef: policy.schedulerSourceRef,
    schedulerPolicyRef: policy.policyRef,
    executionEvidenceFingerprint: executionEvidence.semanticFingerprint
  });
  const runtimeSnapshotFingerprint = semanticHash({
    schedulerSourceRef: policy.schedulerSourceRef,
    schedulerPolicyRef: policy.policyRef,
    schedulerGeneration: generation,
    modelInferenceConcurrency: policy.modelInferenceConcurrency,
    executionEvidenceFingerprint: executionEvidence.semanticFingerprint
  });
  const resourceLeaseFingerprint = semanticHash({ nodeRef: node.nodeRef, evidence: executionEvidence.semanticFingerprint, state: executionEvidence.resource });
  const capabilityLeaseFingerprint = semanticHash({ nodeRef: node.nodeRef, capabilityRef: request.capabilityRef, evidence: executionEvidence.semanticFingerprint });
  const effectLeaseFingerprint = semanticHash({ nodeRef: node.nodeRef, effectClass: 'READ_ONLY', evidence: executionEvidence.semanticFingerprint });
  const formedAt = nextTime();
  const expiresAt = new Date(Date.parse(formedAt) + 10 * 60 * 1000).toISOString();
  const cancellationTokenRef = `cancel.capability-assimilation.${semanticHash(node.nodeRef).slice(0, 20)}`;
  const contextLease = createContextLease({
    leaseRef: `context-lease.capability-assimilation.${semanticHash(node.nodeRef).slice(0, 20)}`,
    workerRef,
    workNodeRef: node.nodeRef,
    graphFingerprint,
    trustSnapshotFingerprint,
    runtimeSnapshotFingerprint,
    schedulerGeneration: generation,
    resourceLeaseFingerprint,
    capabilityLeaseFingerprint,
    effectLeaseFingerprint,
    cancellationTokenRef,
    foundationKernelRef: 'foundation.vexlife.capability-assimilation.runtime-adoption',
    roleFrameRef: 'role-frame.vex.companion',
    intentFrameRef: 'intent-frame.capability-assimilation.runtime-adoption',
    selectedAtlasRefs: [],
    selectedSourceRefs: canonicalRefs(node.sourceRefs),
    applicableCultureRefs: [],
    applicableLessonRefs: [],
    applicableReleaseRefs: [],
    observationRefs: [],
    inputTokenEstimate: 0,
    reservedOutputTokens: 1024,
    hardTokenLimit: 8192,
    formedAt,
    expiresAt,
    observedAt: formedAt,
    currentness: 'CURRENT',
    lifecycle: 'ACTIVE',
    checkpointReturnRef: `checkpoint-return.capability-assimilation.${semanticHash(node.nodeRef).slice(0, 20)}`
  }).lease;

  const contract = schedulerRegistry.mockToolContracts.find((item) =>
    item.toolRef === request.toolContract.toolRef && item.effectRef === request.toolContract.effectRef);
  if (!contract) throw new Error(`scheduler registry is missing tool contract ${request.toolContract.toolRef}`);
  const sourceEvidenceRef = executionEvidence.sourceRef ?? request.currentness.sourceRef ?? 'source.blueprint.capability-registry';
  const sourceEvidenceHash = executionEvidence.semanticFingerprint;
  const call = {
    toolCallRef: `tool-call.capability-assimilation.${semanticHash(node.nodeRef).slice(0, 20)}`,
    schedulerInstanceRef: 'scheduler.capability-assimilation.runtime-adoption',
    workNodeRef: node.nodeRef,
    workerRef,
    workerLeaseRef: `worker-lease.${workerRef}.${generation}`,
    graphFingerprint,
    trustSnapshotFingerprint,
    runtimeSnapshotFingerprint,
    contextLeaseRef: contextLease.leaseRef,
    contextLeaseFingerprint: contextLease.semanticFingerprint,
    toolContractRef: contract.contractRef,
    toolRef: contract.toolRef,
    effectRef: contract.effectRef,
    arguments: clone(request.arguments),
    argumentSchemaRef: contract.argumentSchemaRef,
    argumentHash: semanticHash(request.arguments),
    capabilityLeaseRef: `capability-lease.${semanticHash(node.nodeRef).slice(0, 20)}`,
    capabilityLeaseFingerprint,
    effectLeaseRef: `effect-lease.${semanticHash(node.nodeRef).slice(0, 20)}`,
    effectLeaseFingerprint,
    resourceLeaseRef: `resource-lease.${semanticHash(node.nodeRef).slice(0, 20)}`,
    resourceLeaseFingerprint,
    resultSchemaRef: contract.resultSchemaRef,
    resultRequiredFields: [...contract.requiredResultFields],
    maxObservationBytes: contract.maxObservationBytes,
    executorRef: contract.executorRef,
    schedulerGeneration: generation,
    cancellationTokenRef,
    sourceEvidenceRef,
    sourceEvidenceHash,
    proposedAt: formedAt,
    timeoutAt: expiresAt,
    cancellationPolicy: 'CHECKPOINT_THEN_CANCEL',
    predecessorToolCallRef: null,
    heldDisposition: null,
    replacementPolicyRef: null,
    replacementReasonRef: null,
    externalEffectsExecuted: false
  };
  call.semanticPurposeFingerprint = toolSemanticPurpose(call);
  call.semanticFingerprint = semanticHash(call);
  return { call: freeze(call), contextLease };
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
  const runtimeRegistry = runtimeSchedulerRegistry(schedulerRegistry, capabilityRegistry);
  let sequence = 0;
  const nextTime = () => new Date(Number(clock()) + sequence++).toISOString();
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
    const relay = new ToolResultRelay(null, { schedulerRegistry: runtimeRegistry });
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
        const { call, contextLease } = createRelayBindings(
          node,
          request,
          dag,
          runtimeRegistry,
          nextTime,
          beforeEvidence
        );
        const registered = relay.register(call);
        if (!registered.changed) throw new Error(`tool call was not registered: ${registered.reason}`);
        const rawObservation = assertCurrentObservation(await executor(clone(request.arguments), freeze({
          requestRef: request.requestRef,
          capabilityRef: request.capabilityRef,
          frontier,
          executionEvidence: beforeEvidence,
          context: clone(context)
        })), request);
        const afterEvidence = executionEvidenceForRequest(request, capabilityRegistry);
        if (afterEvidence.semanticFingerprint !== beforeEvidence.semanticFingerprint ||
            afterEvidence.currentness !== 'CURRENT' || afterEvidence.authority !== 'ADMITTED' || afterEvidence.resource !== 'AVAILABLE') {
          throw new Error(`execution evidence changed or was revoked before relay acceptance for ${node.nodeRef}`);
        }
        const result = resultFromObservation(call, rawObservation);
        const accepted = relay.accept(result, { receivedAt: nextTime() });
        if (!accepted.accepted || accepted.state !== 'ACCEPTED') {
          throw new Error(`ToolResultRelay rejected ${request.requestRef}: ${accepted.reason}`);
        }
        const reinjected = relay.reinject(contextLease, accepted.observation, { observedAt: nextTime() });
        if (!reinjected.accepted || reinjected.state !== 'REINJECTED') {
          throw new Error(`ToolResultRelay did not reinject ${request.requestRef}: ${reinjected.reason}`);
        }
        if (exactlyOnceNegativeControl) {
          const duplicateAccept = relay.accept(result, { receivedAt: nextTime() });
          const duplicateReinject = relay.reinject(contextLease, accepted.observation, { observedAt: nextTime() });
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
        return { nodeRef: node.nodeRef, observation: accepted.observation };
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
