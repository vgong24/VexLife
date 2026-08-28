import {
  loadNativeWorker,
  requestNativeWorkerControl
} from './native-worker-supervisor.mjs';
import { semanticHash } from './utils.mjs';

const CHECKPOINT_DECISION = 'CHECKPOINT_REQUIRED';
const CHECKPOINT_PAUSE_MODE = 'CHECKPOINT_BOUND_COOPERATIVE';
const BACKGROUND = 'BACKGROUND';

export class NativeWorkerIntentBridgeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'NativeWorkerIntentBridgeError';
    this.code = code;
    this.details = Object.freeze(structuredClone(details));
  }
}

function fail(code, message, details = {}) {
  throw new NativeWorkerIntentBridgeError(code, message, details);
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('NWS_INTENT_BRIDGE_INPUT_INVALID', `${label} must be an object`);
  }
  return value;
}

function requireRef(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    fail('NWS_INTENT_BRIDGE_INPUT_INVALID', `${label} must be one stable non-empty ref`);
  }
  return value;
}

function canonicalDecision(input) {
  const value = requireObject(input, 'scheduler preemption decision');
  for (const field of [
    'activeWorkNodeRef',
    'incomingWorkNodeRef',
    'pendingPreemptionRef',
    'admissionFingerprint'
  ]) requireRef(value[field], `scheduler preemption decision.${field}`);

  if (value.state !== CHECKPOINT_DECISION || value.safeToStart !== false) {
    fail('NWS_SCHEDULER_DECISION_NOT_CHECKPOINT', 'scheduler decision must be an exact CHECKPOINT_REQUIRED hold', {
      state: value.state ?? null,
      safeToStart: value.safeToStart ?? null
    });
  }
  if (value.sourceDiscarded !== false) {
    fail('NWS_SCHEDULER_DECISION_DISCARDED_SOURCE', 'scheduler preemption must preserve the active work source');
  }

  return Object.freeze({
    state: value.state,
    safeToStart: value.safeToStart,
    activeWorkNodeRef: value.activeWorkNodeRef,
    incomingWorkNodeRef: value.incomingWorkNodeRef,
    pendingPreemptionRef: value.pendingPreemptionRef,
    admissionFingerprint: value.admissionFingerprint,
    sourceDiscarded: value.sourceDiscarded
  });
}

function assertWorkerMatchesDecision(loaded, decision, { requireState }) {
  if (loaded.manifest.schedulingClass !== BACKGROUND) {
    fail('NWS_WORKER_NOT_BACKGROUND', 'only a BACKGROUND native worker may consume an interactive preemption decision', {
      schedulingClass: loaded.manifest.schedulingClass
    });
  }
  if (loaded.manifest.pauseMode !== CHECKPOINT_PAUSE_MODE) {
    fail('NWS_WORKER_NOT_COOPERATIVE', 'worker does not expose the checkpoint-bound cooperative pause contract', {
      pauseMode: loaded.manifest.pauseMode
    });
  }
  if (loaded.manifest.workRef !== decision.activeWorkNodeRef) {
    fail('NWS_SCHEDULER_WORK_MISMATCH', 'scheduler active work does not exactly bind the native worker workRef', {
      workerWorkRef: loaded.manifest.workRef,
      schedulerActiveWorkNodeRef: decision.activeWorkNodeRef
    });
  }
  if (loaded.receipt.state !== requireState) {
    fail('NWS_WORKER_STATE_MISMATCH', `native worker must be ${requireState} for this bridge transition`, {
      state: loaded.receipt.state,
      requiredState: requireState
    });
  }
}

function eventFingerprint(event) {
  const value = structuredClone(event);
  delete value.eventRef;
  delete value.semanticFingerprint;
  return semanticHash(value);
}

function buildEvent(kind, loaded, decision, observedAt) {
  const event = {
    schemaVersion: 'vexlife.native-worker-intent-event/v1',
    eventKind: kind,
    workerRef: loaded.manifest.workerRef,
    workRef: loaded.manifest.workRef,
    purposeRef: loaded.manifest.purposeRef,
    continuationRef: loaded.manifest.workRef,
    resultContractRef: loaded.manifest.resultContractRef,
    workerState: loaded.receipt.state,
    workerReceiptGeneration: loaded.receipt.generation,
    pendingPreemptionRef: decision.pendingPreemptionRef,
    incomingWorkNodeRef: decision.incomingWorkNodeRef,
    admissionFingerprint: decision.admissionFingerprint,
    sourceDiscarded: decision.sourceDiscarded,
    terminalEvidenceFingerprint: loaded.receipt.terminalEvidence
      ? semanticHash(loaded.receipt.terminalEvidence)
      : null,
    observedAt,
    externalEffectsExecuted: false
  };
  event.semanticFingerprint = eventFingerprint(event);
  event.eventRef = `event.native-worker.${kind.toLowerCase().replaceAll('_', '-')}.${event.semanticFingerprint.slice(0, 24)}`;
  return Object.freeze(event);
}

export function requestNativeWorkerCheckpointYieldFromScheduler(workerRoot, schedulerDecision, {
  now = () => Date.now()
} = {}) {
  const decision = canonicalDecision(schedulerDecision);
  const before = loadNativeWorker(workerRoot);
  assertWorkerMatchesDecision(before, decision, { requireState: 'WORKING' });

  const control = requestNativeWorkerControl(workerRoot, 'PAUSE', { now });
  if (control?.action !== 'PAUSE') {
    fail('NWS_CHECKPOINT_REQUEST_NOT_DURABLE', 'cooperative pause control was not durably written', {
      action: control?.action ?? null
    });
  }
  const requested = loadNativeWorker(workerRoot);
  if (requested.receipt.state !== 'PAUSE_REQUESTED') {
    fail('NWS_CHECKPOINT_REQUEST_NOT_DURABLE', 'cooperative pause request did not become durable PAUSE_REQUESTED', {
      state: requested.receipt.state
    });
  }

  return Object.freeze({
    decision,
    control: Object.freeze(structuredClone(control)),
    event: buildEvent('CHECKPOINT_YIELD_REQUESTED', requested, decision, new Date(now()).toISOString())
  });
}

export function observeNativeWorkerCheckpointYield(workerRoot, schedulerDecision, {
  observedAt = new Date().toISOString()
} = {}) {
  const decision = canonicalDecision(schedulerDecision);
  const loaded = loadNativeWorker(workerRoot);
  assertWorkerMatchesDecision(loaded, decision, { requireState: 'PAUSED' });

  if (loaded.receipt.terminalEvidence?.exitCode !== 75 ||
      loaded.receipt.terminalEvidence?.pauseRequested !== true ||
      loaded.receipt.terminalEvidence?.payloadStarted !== true) {
    fail('NWS_CHECKPOINT_YIELD_NOT_PROVED', 'PAUSED state is not bound to an observed cooperative checkpoint yield', {
      terminalEvidence: loaded.receipt.terminalEvidence ?? null
    });
  }

  return buildEvent('CHECKPOINT_BOUND_YIELD_OBSERVED', loaded, decision, observedAt);
}

export function createNativeWorkerToolRelayResult(toolCall, workerEvent, {
  observationRef = null
} = {}) {
  const call = requireObject(toolCall, 'tool call');
  const event = requireObject(workerEvent, 'worker event');
  for (const field of [
    'toolCallRef',
    'workNodeRef',
    'workerRef',
    'workerLeaseRef',
    'graphFingerprint',
    'trustSnapshotFingerprint',
    'runtimeSnapshotFingerprint',
    'contextLeaseRef',
    'contextLeaseFingerprint',
    'toolRef',
    'effectRef',
    'capabilityLeaseFingerprint',
    'effectLeaseFingerprint',
    'resourceLeaseFingerprint',
    'cancellationTokenRef',
    'executorRef',
    'sourceEvidenceRef',
    'sourceEvidenceHash',
    'resultSchemaRef'
  ]) requireRef(call[field], `tool call.${field}`);

  if (!Number.isInteger(call.schedulerGeneration) || call.schedulerGeneration < 1) {
    fail('NWS_INTENT_BRIDGE_INPUT_INVALID', 'tool call schedulerGeneration must be a positive integer');
  }
  if (event.eventKind !== 'CHECKPOINT_BOUND_YIELD_OBSERVED' ||
      event.semanticFingerprint !== eventFingerprint(event)) {
    fail('NWS_WORKER_EVENT_INVALID', 'tool relay projection requires an exact checkpoint-bound yield event');
  }
  if (event.workRef !== call.workNodeRef || event.workerRef !== call.workerRef) {
    fail('NWS_RELAY_WORK_MISMATCH', 'worker event does not exactly bind the registered tool call work/worker identity', {
      eventWorkRef: event.workRef,
      callWorkNodeRef: call.workNodeRef,
      eventWorkerRef: event.workerRef,
      callWorkerRef: call.workerRef
    });
  }

  return Object.freeze({
    toolCallRef: call.toolCallRef,
    observationRef: observationRef ?? `observation.${event.eventRef}`,
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
    observation: Object.freeze({
      summaryRef: event.eventRef,
      eventRef: event.eventRef,
      eventKind: event.eventKind,
      continuationRef: event.continuationRef,
      resultContractRef: event.resultContractRef,
      workerState: event.workerState,
      workerReceiptGeneration: event.workerReceiptGeneration,
      pendingPreemptionRef: event.pendingPreemptionRef,
      incomingWorkNodeRef: event.incomingWorkNodeRef,
      terminalEvidenceFingerprint: event.terminalEvidenceFingerprint,
      sourceDiscarded: event.sourceDiscarded
    }),
    artifactRefs: []
  });
}

// [VXG RealForever]
