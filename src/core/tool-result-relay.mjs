import { reinjectBoundedObservation } from './context-lease.mjs';
import {
  assertActiveInterval,
  assertCurrentLease,
  assertSourceHash,
  parseCanonicalTimestamp,
  resolveMockToolContract
} from './scheduler-runtime-trust.mjs';
import { semanticHash } from './utils.mjs';

function clone(value) {
  return structuredClone(value);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function reject(reason, toolCallRef = null) {
  return {
    accepted: false,
    state: 'REJECTED',
    toolCallRef,
    reason
  };
}

function requireFields(value, fields, label) {
  const missing = fields.filter((field) => value?.[field] === undefined || value?.[field] === null || value?.[field] === '');
  if (missing.length) throw new Error(`${label} missing required fields: ${missing.join(', ')}`);
}

function canonicalLedger(input) {
  const ledger = {
    schemaVersion: 'vexlife.intent-tool-relay-ledger/v1',
    relayRef: input?.relayRef ?? 'relay.intent-scheduler.mock-tools',
    entries: [...(input?.entries ?? [])].map((item) => clone(item))
      .sort((left, right) => left.toolCallRef.localeCompare(right.toolCallRef))
  };
  const refs = ledger.entries.map((item) => item.toolCallRef);
  if (new Set(refs).size !== refs.length) throw new Error('tool relay ledger contains duplicate call refs');
  for (const entry of ledger.entries) {
    if (!entry.toolCallRef || !['PENDING', 'HELD', 'ACCEPTED', 'REINJECTED', 'CLOSED'].includes(entry.state)) {
      throw new Error('tool relay ledger contains an invalid entry');
    }
  }
  ledger.semanticFingerprint = semanticHash({
    schemaVersion: ledger.schemaVersion,
    relayRef: ledger.relayRef,
    entries: ledger.entries
  });
  if (input?.semanticFingerprint && input.semanticFingerprint !== ledger.semanticFingerprint) {
    throw new Error('tool relay ledger semantic fingerprint mismatch');
  }
  return freeze(ledger);
}

function requireExactLease(lease, label, call, runtimeTrustSnapshot, observedAt) {
  assertCurrentLease(lease, {
    label,
    observedAt,
    schedulerGeneration: call.schedulerGeneration,
    runtimeSnapshotFingerprint: runtimeTrustSnapshot.semanticFingerprint
  });
  if (lease.workNodeRef !== call.workNodeRef) throw new Error(`${label} lease work node mismatch`);
  if (lease.graphFingerprint !== call.graphFingerprint) throw new Error(`${label} lease graph fingerprint mismatch`);
}

export function createToolCall(input, {
  contextLease,
  capabilityLease,
  effectLease,
  resourceLease,
  workerLease,
  runtimeTrustSnapshot,
  schedulerRegistry,
  observedAt
}) {
  const required = [
    'toolCallRef',
    'workNodeRef',
    'toolRef',
    'effectRef',
    'arguments',
    'schedulerGeneration',
    'cancellationTokenRef',
    'sourceEvidenceRef',
    'sourceEvidenceHash',
    'proposedAt',
    'timeoutAt',
    'cancellationPolicy'
  ];
  requireFields(input, required, 'tool call');
  const contract = resolveMockToolContract(schedulerRegistry, {
    toolRef: input.toolRef,
    effectRef: input.effectRef
  });
  for (const field of contract.requiredArgumentFields) {
    if (input.arguments?.[field] === undefined || input.arguments?.[field] === null) {
      throw new Error(`tool arguments missing canonical field ${field}`);
    }
  }
  assertSourceHash(input.sourceEvidenceHash, 'tool call sourceEvidenceHash');
  assertActiveInterval({
    formedAt: input.proposedAt,
    observedAt,
    expiresAt: input.timeoutAt
  }, 'tool call');
  const call = {
    schemaVersion: 'vexlife.intent-tool-call/v1',
    toolCallRef: input.toolCallRef,
    workNodeRef: input.workNodeRef,
    workerRef: workerLease?.workerRef,
    workerLeaseRef: workerLease?.leaseRef,
    graphFingerprint: contextLease?.graphFingerprint,
    trustSnapshotFingerprint: contextLease?.trustSnapshotFingerprint,
    runtimeSnapshotFingerprint: runtimeTrustSnapshot?.semanticFingerprint,
    contextLeaseRef: contextLease?.leaseRef,
    contextLeaseFingerprint: contextLease?.semanticFingerprint,
    toolContractRef: contract.contractRef,
    toolRef: contract.toolRef,
    effectRef: contract.effectRef,
    argumentSchemaRef: contract.argumentSchemaRef,
    arguments: clone(input.arguments),
    argumentHash: semanticHash(input.arguments),
    capabilityLeaseRef: capabilityLease?.leaseRef,
    capabilityLeaseFingerprint: capabilityLease?.semanticFingerprint,
    effectLeaseRef: effectLease?.leaseRef,
    effectLeaseFingerprint: effectLease?.semanticFingerprint,
    resourceLeaseRef: resourceLease?.leaseRef,
    resourceLeaseFingerprint: resourceLease?.semanticFingerprint,
    resultSchemaRef: contract.resultSchemaRef,
    resultRequiredFields: [...contract.requiredResultFields],
    maxObservationBytes: contract.maxObservationBytes,
    executorRef: contract.executorRef,
    schedulerGeneration: input.schedulerGeneration,
    cancellationTokenRef: input.cancellationTokenRef,
    sourceEvidenceRef: input.sourceEvidenceRef,
    sourceEvidenceHash: input.sourceEvidenceHash,
    proposedAt: input.proposedAt,
    timeoutAt: input.timeoutAt,
    cancellationPolicy: input.cancellationPolicy,
    externalEffectsExecuted: false
  };
  if (!runtimeTrustSnapshot?.semanticFingerprint ||
      runtimeTrustSnapshot.schedulerGeneration !== call.schedulerGeneration ||
      runtimeTrustSnapshot.workerRef !== call.workerRef) {
    throw new Error('tool call runtime trust binding mismatch');
  }
  requireExactLease(workerLease, 'worker', call, runtimeTrustSnapshot, observedAt);
  requireExactLease(capabilityLease, 'capability', call, runtimeTrustSnapshot, observedAt);
  requireExactLease(effectLease, 'effect', call, runtimeTrustSnapshot, observedAt);
  requireExactLease(resourceLease, 'resource', call, runtimeTrustSnapshot, observedAt);
  assertCurrentLease(contextLease, {
    label: 'context',
    observedAt,
    schedulerGeneration: call.schedulerGeneration,
    runtimeSnapshotFingerprint: runtimeTrustSnapshot.semanticFingerprint
  });
  if (contextLease.workNodeRef !== call.workNodeRef ||
      contextLease.graphFingerprint !== call.graphFingerprint ||
      contextLease.cancellationTokenRef !== call.cancellationTokenRef) {
    throw new Error('context lease does not exactly bind tool call');
  }
  if (!(capabilityLease.toolRefs ?? []).includes(call.toolRef)) throw new Error('capability lease does not admit canonical tool');
  if (!(effectLease.allowedEffectRefs ?? []).includes(call.effectRef)) throw new Error('effect lease does not admit exact effect');
  if (effectLease.effectDisposition !== 'EFFECT_ENVELOPE_BOUND') throw new Error('effect lease does not admit bounded effect');
  call.semanticFingerprint = semanticHash(call);
  return freeze(call);
}

function validateObservationContract(call, result) {
  if (result.schemaRef !== call.resultSchemaRef) return 'RESULT_SCHEMA_MISMATCH';
  for (const field of call.resultRequiredFields ?? []) {
    if (result.observation?.[field] === undefined || result.observation?.[field] === null) {
      return `RESULT_FIELD_MISSING:${field}`;
    }
  }
  const bytes = Buffer.byteLength(JSON.stringify(result.observation ?? {}), 'utf8');
  if (bytes > call.maxObservationBytes) return 'RESULT_OBSERVATION_TOO_LARGE';
  for (const field of ['rawLogs', 'artifactPayloads', 'binaryPayload']) {
    if (Object.hasOwn(result.observation ?? {}, field)) return `RESULT_HEAVY_PAYLOAD_FORBIDDEN:${field}`;
  }
  return null;
}

function exactResultMismatch(call, result) {
  for (const [field, reason] of [
    ['workNodeRef', 'WORK_NODE_MISMATCH'],
    ['workerRef', 'WORKER_MISMATCH'],
    ['workerLeaseRef', 'WORKER_LEASE_MISMATCH'],
    ['graphFingerprint', 'GRAPH_FINGERPRINT_MISMATCH'],
    ['trustSnapshotFingerprint', 'TRUST_SNAPSHOT_MISMATCH'],
    ['runtimeSnapshotFingerprint', 'RUNTIME_SNAPSHOT_MISMATCH'],
    ['contextLeaseRef', 'CONTEXT_LEASE_MISMATCH'],
    ['contextLeaseFingerprint', 'CONTEXT_LEASE_FINGERPRINT_MISMATCH'],
    ['toolRef', 'WRONG_TOOL'],
    ['effectRef', 'WRONG_EFFECT'],
    ['capabilityLeaseFingerprint', 'CAPABILITY_LEASE_MISMATCH'],
    ['effectLeaseFingerprint', 'EFFECT_LEASE_MISMATCH'],
    ['resourceLeaseFingerprint', 'RESOURCE_LEASE_MISMATCH'],
    ['schedulerGeneration', 'WRONG_GENERATION'],
    ['cancellationTokenRef', 'CANCELLATION_TOKEN_MISMATCH'],
    ['executorRef', 'EXECUTOR_MISMATCH'],
    ['sourceEvidenceRef', 'SOURCE_EVIDENCE_REF_MISMATCH'],
    ['sourceEvidenceHash', 'SOURCE_EVIDENCE_HASH_MISMATCH']
  ]) {
    if (result[field] !== call[field]) return reason;
  }
  return null;
}

export class ToolResultRelay {
  #ledger;

  constructor(snapshot = null) {
    this.#ledger = canonicalLedger(snapshot ?? {});
  }

  get snapshot() {
    return clone(this.#ledger);
  }

  #replace(entry) {
    const entries = this.#ledger.entries.filter((item) => item.toolCallRef !== entry.toolCallRef);
    entries.push(entry);
    this.#ledger = canonicalLedger({ relayRef: this.#ledger.relayRef, entries });
  }

  #entry(toolCallRef) {
    return this.#ledger.entries.find((item) => item.toolCallRef === toolCallRef) ?? null;
  }

  register(toolCall) {
    if (!toolCall?.toolCallRef || !toolCall.semanticFingerprint) throw new Error('canonical tool call is required');
    if (this.#entry(toolCall.toolCallRef)) return { changed: false, reason: 'DUPLICATE_TOOL_CALL_REF' };
    this.#replace(freeze({
      toolCallRef: toolCall.toolCallRef,
      state: 'PENDING',
      call: clone(toolCall),
      observation: null,
      transitionReceipts: [],
      reinjectedContextLeaseRef: null
    }));
    return { changed: true, toolCall };
  }

  accept(result, { receivedAt }) {
    const ref = result?.toolCallRef ?? null;
    const entry = this.#entry(ref);
    if (!entry) return reject('UNKNOWN_OR_STALE_TOOL_CALL', ref);
    if (['ACCEPTED', 'REINJECTED'].includes(entry.state)) return reject('DUPLICATE_RESULT', ref);
    if (entry.state === 'HELD') return reject('TOOL_CALL_HELD', ref);
    if (entry.state === 'CLOSED') return reject('UNKNOWN_OR_STALE_TOOL_CALL', ref);
    const call = entry.call;
    let received;
    let timeout;
    try {
      received = parseCanonicalTimestamp(receivedAt, 'tool result receivedAt');
      timeout = parseCanonicalTimestamp(call.timeoutAt, 'tool call timeoutAt');
    } catch {
      return reject('MALFORMED_RESULT_TIME', ref);
    }
    if (received >= timeout) {
      this.cancel(ref, {
        reason: 'LATE_RESULT',
        receiptRef: `${ref}.late`,
        closedAt: receivedAt
      });
      return reject('LATE_RESULT', ref);
    }
    const mismatch = exactResultMismatch(call, result);
    if (mismatch) return reject(mismatch, ref);
    const contractError = validateObservationContract(call, result);
    if (contractError) return reject(contractError, ref);
    const observation = {
      schemaVersion: 'vexlife.intent-tool-observation/v1',
      observationRef: result.observationRef,
      toolCallRef: call.toolCallRef,
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
      schemaRef: result.schemaRef,
      observationHash: semanticHash(result.observation),
      artifactRefs: [...new Set(result.artifactRefs ?? [])].sort(),
      summary: clone(result.observation),
      rawLogsIncluded: false,
      externalEffectsExecuted: false,
      acceptedAt: receivedAt
    };
    observation.semanticFingerprint = semanticHash(observation);
    const frozenObservation = freeze(observation);
    this.#replace(freeze({
      ...clone(entry),
      state: 'ACCEPTED',
      observation: frozenObservation
    }));
    return { accepted: true, state: 'ACCEPTED', observation: frozenObservation };
  }

  reinject(contextLease, observation, { observedAt }) {
    const entry = this.#entry(observation?.toolCallRef);
    if (!entry || entry.state !== 'ACCEPTED' ||
        entry.observation?.semanticFingerprint !== observation?.semanticFingerprint) {
      return reject(entry?.state === 'REINJECTED' ? 'OBSERVATION_ALREADY_REINJECTED' : 'OBSERVATION_NOT_ACCEPTED', observation?.toolCallRef);
    }
    let result;
    try {
      result = reinjectBoundedObservation(contextLease, observation, { observedAt });
    } catch (error) {
      return reject(`CONTEXT_REINJECTION_REJECTED:${error.message}`, observation.toolCallRef);
    }
    if (!result.changed) return reject(result.reason, observation.toolCallRef);
    this.#replace(freeze({
      ...clone(entry),
      state: 'REINJECTED',
      reinjectedContextLeaseRef: contextLease.leaseRef
    }));
    return { accepted: true, state: 'REINJECTED', ...result };
  }

  hold(toolCallRef, {
    receiptRef,
    heldAt,
    checkpointRef
  }) {
    const entry = this.#entry(toolCallRef);
    if (!entry || entry.state !== 'PENDING') return { changed: false, reason: 'NO_PENDING_TOOL_CALL' };
    parseCanonicalTimestamp(heldAt, 'tool call heldAt');
    const receipt = {
      schemaVersion: 'vexlife.intent-tool-call-hold/v0',
      receiptRef,
      toolCallRef,
      checkpointRef,
      workNodeRef: entry.call.workNodeRef,
      schedulerGeneration: entry.call.schedulerGeneration,
      heldAt,
      state: 'HELD'
    };
    receipt.semanticFingerprint = semanticHash(receipt);
    this.#replace(freeze({
      ...clone(entry),
      state: 'HELD',
      transitionReceipts: [...entry.transitionReceipts, freeze(receipt)]
    }));
    return { changed: true, receipt: freeze(receipt) };
  }

  cancel(toolCallRef, {
    reason = 'CANCELLED',
    receiptRef = `${toolCallRef}.cancelled`,
    closedAt
  } = {}) {
    const entry = this.#entry(toolCallRef);
    if (!entry || !['PENDING', 'HELD', 'ACCEPTED'].includes(entry.state)) {
      return { changed: false, reason: 'NO_OPEN_TOOL_CALL' };
    }
    parseCanonicalTimestamp(closedAt, 'tool call closedAt');
    const receipt = {
      schemaVersion: 'vexlife.intent-tool-call-cancellation/v1',
      receiptRef,
      toolCallRef,
      workNodeRef: entry.call.workNodeRef,
      schedulerGeneration: entry.call.schedulerGeneration,
      cancellationTokenRef: entry.call.cancellationTokenRef,
      reason,
      state: 'CLOSED',
      closedAt
    };
    receipt.semanticFingerprint = semanticHash(receipt);
    this.#replace(freeze({
      ...clone(entry),
      state: 'CLOSED',
      transitionReceipts: [...entry.transitionReceipts, freeze(receipt)]
    }));
    return { changed: true, receipt: freeze(receipt) };
  }
}

// [VXG RealForever]
