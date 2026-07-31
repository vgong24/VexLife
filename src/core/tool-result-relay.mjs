import { reinjectBoundedObservation } from './context-lease.mjs';
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

function requireCurrentLease(lease, label, call) {
  if (!lease?.leaseRef || lease.currentness !== 'CURRENT') throw new Error(`${label} lease must be current`);
  if (lease.workNodeRef !== call.workNodeRef) throw new Error(`${label} lease work node mismatch`);
  if (lease.schedulerGeneration !== call.schedulerGeneration) throw new Error(`${label} lease scheduler generation mismatch`);
}

export function createToolCall(input, {
  contextLease,
  capabilityLease,
  effectLease,
  resourceLease
}) {
  const required = [
    'toolCallRef',
    'workNodeRef',
    'contextLeaseRef',
    'toolRef',
    'argumentSchemaRef',
    'arguments',
    'expectedResultContract',
    'schedulerGeneration',
    'timeoutAt',
    'cancellationPolicy'
  ];
  const missing = required.filter((field) => input?.[field] === undefined || input?.[field] === null || input?.[field] === '');
  if (missing.length) throw new Error(`tool call missing required fields: ${missing.join(', ')}`);
  const call = {
    schemaVersion: 'vexlife.intent-tool-call/v0',
    ...clone(input)
  };
  delete call.semanticFingerprint;
  if (!contextLease?.leaseRef || contextLease.currentness !== 'CURRENT') throw new Error('context lease must be current');
  if (contextLease.leaseRef !== call.contextLeaseRef || contextLease.workNodeRef !== call.workNodeRef) {
    throw new Error('context lease does not match tool call');
  }
  requireCurrentLease(capabilityLease, 'capability', call);
  requireCurrentLease(effectLease, 'effect', call);
  requireCurrentLease(resourceLease, 'resource', call);
  if (!(capabilityLease.toolRefs ?? []).includes(call.toolRef)) throw new Error('capability lease does not admit tool');
  if (effectLease.effectDisposition !== 'EFFECT_ENVELOPE_BOUND') throw new Error('effect lease does not admit bounded effect');
  if (resourceLease.leaseRef !== call.resourceLeaseRef) throw new Error('resource lease ref does not match tool call');
  call.capabilityLeaseRef = capabilityLease.leaseRef;
  call.effectLeaseRef = effectLease.leaseRef;
  call.argumentHash = semanticHash(call.arguments);
  call.semanticFingerprint = semanticHash(call);
  return freeze(call);
}

function validateResultContract(contract, result) {
  if (!contract?.schemaRef || result.schemaRef !== contract.schemaRef) return 'RESULT_SCHEMA_MISMATCH';
  for (const field of contract.requiredFields ?? []) {
    if (result.observation?.[field] === undefined || result.observation?.[field] === null) {
      return `RESULT_FIELD_MISSING:${field}`;
    }
  }
  const bytes = Buffer.byteLength(JSON.stringify(result.observation ?? {}), 'utf8');
  if (bytes > (contract.maxObservationBytes ?? 4096)) return 'RESULT_OBSERVATION_TOO_LARGE';
  for (const field of ['rawLogs', 'artifactPayloads', 'binaryPayload']) {
    if (Object.hasOwn(result.observation ?? {}, field)) return `RESULT_HEAVY_PAYLOAD_FORBIDDEN:${field}`;
  }
  return null;
}

export class ToolResultRelay {
  #pending = new Map();
  #accepted = new Map();
  #closed = new Set();
  #reinjected = new Set();

  register(toolCall) {
    if (!toolCall?.toolCallRef) throw new Error('canonical tool call is required');
    if (this.#pending.has(toolCall.toolCallRef) || this.#accepted.has(toolCall.toolCallRef)) {
      return { changed: false, reason: 'DUPLICATE_TOOL_CALL_REF' };
    }
    this.#pending.set(toolCall.toolCallRef, toolCall);
    return { changed: true, toolCall };
  }

  accept(result, { receivedAt }) {
    const ref = result?.toolCallRef ?? null;
    if (this.#accepted.has(ref)) return reject('DUPLICATE_RESULT', ref);
    if (this.#closed.has(ref)) return reject('UNKNOWN_OR_STALE_TOOL_CALL', ref);
    const call = this.#pending.get(ref);
    if (!call) return reject('UNKNOWN_OR_STALE_TOOL_CALL', ref);
    if (!receivedAt || receivedAt > call.timeoutAt) {
      this.#pending.delete(ref);
      this.#closed.add(ref);
      return reject('LATE_RESULT', ref);
    }
    if (result.workNodeRef !== call.workNodeRef) return reject('WORK_NODE_MISMATCH', ref);
    if (result.contextLeaseRef !== call.contextLeaseRef) return reject('CONTEXT_LEASE_MISMATCH', ref);
    if (result.toolRef !== call.toolRef) return reject('WRONG_TOOL', ref);
    if (result.schedulerGeneration !== call.schedulerGeneration) return reject('WRONG_GENERATION', ref);
    const contractError = validateResultContract(call.expectedResultContract, result);
    if (contractError) return reject(contractError, ref);
    const observation = {
      schemaVersion: 'vexlife.intent-tool-observation/v0',
      observationRef: result.observationRef,
      toolCallRef: call.toolCallRef,
      workNodeRef: call.workNodeRef,
      contextLeaseRef: call.contextLeaseRef,
      toolRef: call.toolRef,
      schedulerGeneration: call.schedulerGeneration,
      schemaRef: result.schemaRef,
      observationHash: semanticHash(result.observation),
      artifactRefs: [...new Set(result.artifactRefs ?? [])].sort(),
      summary: clone(result.observation),
      rawLogsIncluded: false,
      acceptedAt: receivedAt
    };
    observation.semanticFingerprint = semanticHash(observation);
    const frozen = freeze(observation);
    this.#pending.delete(ref);
    this.#accepted.set(ref, frozen);
    return { accepted: true, state: 'ACCEPTED', observation: frozen };
  }

  reinject(contextLease, observation) {
    if (!this.#accepted.has(observation?.toolCallRef)) return reject('OBSERVATION_NOT_ACCEPTED', observation?.toolCallRef);
    if (this.#reinjected.has(observation.observationRef)) return reject('OBSERVATION_ALREADY_REINJECTED', observation.toolCallRef);
    const result = reinjectBoundedObservation(contextLease, observation);
    if (result.changed) this.#reinjected.add(observation.observationRef);
    return { accepted: result.changed, state: result.changed ? 'REINJECTED' : 'REJECTED', ...result };
  }

  cancel(toolCallRef, reason = 'CANCELLED') {
    const call = this.#pending.get(toolCallRef);
    if (!call) return { changed: false, reason: 'NO_PENDING_TOOL_CALL' };
    this.#pending.delete(toolCallRef);
    this.#closed.add(toolCallRef);
    return {
      changed: true,
      receipt: freeze({
        schemaVersion: 'vexlife.intent-tool-call-cancellation/v0',
        toolCallRef,
        workNodeRef: call.workNodeRef,
        schedulerGeneration: call.schedulerGeneration,
        reason,
        state: 'CANCELLED',
        semanticFingerprint: semanticHash({ toolCallRef, workNodeRef: call.workNodeRef, schedulerGeneration: call.schedulerGeneration, reason })
      })
    };
  }
}

// [VXG RealForever]
