import { reinjectBoundedObservation } from './context-lease.mjs';
import {
  assertActiveInterval,
  assertCurrentLease,
  assertSourceHash,
  INTENT_SCHEDULER_REQUIRED_FIELD_SETS,
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

function canonicalToolCall(call, schedulerRegistry = null) {
  if (!call?.toolCallRef || !call.semanticFingerprint) throw new Error('canonical tool call is required');
  requireFields(call, INTENT_SCHEDULER_REQUIRED_FIELD_SETS.toolCallRequiredFields, 'canonical tool call');
  const semantic = clone(call);
  delete semantic.semanticFingerprint;
  if (semanticHash(semantic) !== call.semanticFingerprint) throw new Error('tool call semantic fingerprint mismatch');
    if (schedulerRegistry) {
    const contract = resolveMockToolContract(schedulerRegistry, { toolRef: call.toolRef, effectRef: call.effectRef });
    for (const [field, expected] of [
      ['toolContractRef', contract.contractRef],
      ['argumentSchemaRef', contract.argumentSchemaRef],
      ['resultSchemaRef', contract.resultSchemaRef],
      ['executorRef', contract.executorRef],
      ['maxObservationBytes', contract.maxObservationBytes]
    ]) if (call[field] !== expected) throw new Error(`tool call canonical ${field} mismatch`);
    if (semanticHash(call.arguments) !== call.argumentHash) throw new Error('tool call argument fingerprint mismatch');
    if (toolSemanticPurpose(call) !== call.semanticPurposeFingerprint) {
      throw new Error('tool call semantic purpose fingerprint mismatch');
    }
  }
  return freeze(clone(call));
}

function canonicalObservation(observation, call) {
  if (!observation?.observationRef || observation.toolCallRef !== call.toolCallRef) {
    throw new Error('tool relay observation does not bind its call');
  }
  const semantic = clone(observation);
  delete semantic.semanticFingerprint;
  if (semanticHash(semantic) !== observation.semanticFingerprint) {
    throw new Error('tool relay observation fingerprint mismatch');
  }
  if (observation.observationHash !== semanticHash(observation.summary)) {
    throw new Error('tool relay observation content hash mismatch');
  }
  if (exactResultMismatch(call, observation)) throw new Error('tool relay observation exact call bindings mismatch');
  if (observation.schemaRef !== call.resultSchemaRef) throw new Error('tool relay observation schema mismatch');
  for (const field of call.resultRequiredFields ?? []) {
    if (observation.summary?.[field] === undefined || observation.summary?.[field] === null) {
      throw new Error(`tool relay observation missing canonical field ${field}`);
    }
  }
  if (Buffer.byteLength(JSON.stringify(observation.summary ?? {}), 'utf8') > call.maxObservationBytes) {
    throw new Error('tool relay observation exceeds canonical byte limit');
  }
  if (observation.externalEffectsExecuted !== false || observation.rawLogsIncluded !== false) {
    throw new Error('tool relay observation reports inadmissible effects or raw logs');
  }
  return freeze(clone(observation));
}

const HELD_AUTHORIZATION_REQUIRED_FIELDS = [
  'authorizationRef',
  'schedulerInstanceRef',
  'checkpointRef',
  'priorToolCallRef',
  'workNodeRef',
  'action',
  'runtimeSnapshotFingerprint',
  'schedulerGeneration',
  'cancellationTokenRef',
  'workerLeaseRef',
  'workerLeaseFingerprint',
  'contextLeaseRef',
  'contextLeaseFingerprint',
  'resourceLeaseRef',
  'resourceLeaseFingerprint',
  'capabilityLeaseRef',
  'capabilityLeaseFingerprint',
  'effectLeaseRef',
  'effectLeaseFingerprint',
  'formedAt'
];

function canonicalHeldSchedulerAuthorization(authorization) {
  requireFields(authorization, HELD_AUTHORIZATION_REQUIRED_FIELDS, 'held tool scheduler authorization');
  const semantic = clone(authorization);
  delete semantic.semanticFingerprint;
  if (!authorization.semanticFingerprint || semanticHash(semantic) !== authorization.semanticFingerprint) {
    throw new Error('held tool scheduler authorization fingerprint mismatch');
  }
  parseCanonicalTimestamp(authorization.formedAt, 'held tool scheduler authorization formedAt');
  return freeze(clone(authorization));
}

function resolveRelayTransitionContract(schedulerRegistry, receipt) {
  const contract = (schedulerRegistry?.relayTransitionContracts ?? []).find((item) =>
    item.priorState === receipt.priorState && item.nextState === receipt.nextState
  );
  if (!contract) {
    throw new Error(`tool relay transition has no registered typed event contract ${receipt.priorState} -> ${receipt.nextState}`);
  }
  if (receipt.eventContractRef !== contract.contractRef || receipt.schemaVersion !== contract.receiptSchemaVersion) {
    throw new Error('tool relay transition receipt does not match its registered typed event contract');
  }
  requireFields(receipt, contract.requiredFields ?? [], `${contract.eventKind} relay transition receipt`);
  return contract;
}

function canonicalTransitionReceipt(receipt, schedulerRegistry) {
  requireFields(receipt, INTENT_SCHEDULER_REQUIRED_FIELD_SETS.relayTransitionReceiptRequiredFields,
    'tool relay transition receipt');
  const semantic = clone(receipt);
  delete semantic.semanticFingerprint;
  if (semanticHash(semantic) !== receipt.semanticFingerprint) {
    throw new Error('tool relay transition receipt fingerprint mismatch');
  }
  if (receipt.currentness !== 'CURRENT') throw new Error('tool relay transition receipt is not current');
  if (!Number.isInteger(receipt.sequence) || receipt.sequence < 0) {
    throw new Error('tool relay transition receipt sequence is invalid');
  }
  assertSourceHash(receipt.sourceHash, 'tool relay transition sourceHash');
  parseCanonicalTimestamp(receipt.transitionedAt, 'tool relay transitionedAt');
  const allowed = schedulerRegistry?.relayStateMachine?.allowedTransitions?.[receipt.priorState] ?? [];
  if (!allowed.includes(receipt.nextState)) {
    throw new Error(`tool relay transition receipt has an illegal state progression ${receipt.priorState} -> ${receipt.nextState}`);
  }
  resolveRelayTransitionContract(schedulerRegistry, receipt);
  return freeze(clone(receipt));
}

function transitionReceipt(entry, input, schedulerRegistry) {
  const contract = (schedulerRegistry?.relayTransitionContracts ?? []).find((item) =>
    item.priorState === entry.state && item.nextState === input.nextState &&
    item.receiptSchemaVersion === input.schemaVersion
  );
  if (!contract) throw new Error('tool relay mutation has no registered typed event contract');
  const receipt = {
    ...clone(input),
    eventContractRef: contract.contractRef,
    toolCallRef: entry.toolCallRef,
    priorState: entry.state,
    sequence: entry.transitionReceipts.length,
    currentness: 'CURRENT',
    sourceRef: entry.call.sourceEvidenceRef,
    sourceHash: entry.call.sourceEvidenceHash,
    formationRef: 'formation.intent-scheduler.relay-transition.v1'
  };
  receipt.semanticFingerprint = semanticHash(receipt);
  return freeze(receipt);
}

function assertTypedTransitionReceipt(receipt, entry, priorReceipts, schedulerRegistry) {
  const call = entry.call;
  const observation = entry.observation;
  const contractKind = receipt.eventContractRef;
  if (receipt.sourceRef !== call.sourceEvidenceRef || receipt.sourceHash !== call.sourceEvidenceHash ||
      receipt.formationRef !== 'formation.intent-scheduler.relay-transition.v1') {
    throw new Error('typed relay transition source/formation lineage mismatch');
  }
  if (contractKind === 'contract.intent-scheduler.relay-event.hold') {
    if (receipt.workNodeRef !== call.workNodeRef || receipt.schedulerGeneration !== call.schedulerGeneration ||
        receipt.heldAt !== receipt.transitionedAt || !receipt.checkpointRef) {
      throw new Error('typed HOLD receipt lineage mismatch');
    }
  } else if (contractKind === 'contract.intent-scheduler.relay-event.accept') {
    if (!observation || receipt.observationRef !== observation.observationRef ||
        receipt.observationFingerprint !== observation.semanticFingerprint ||
        receipt.transitionedAt !== observation.acceptedAt) {
      throw new Error('typed ACCEPT receipt observation lineage mismatch');
    }
  } else if (contractKind === 'contract.intent-scheduler.relay-event.cancel-pending' ||
      contractKind === 'contract.intent-scheduler.relay-event.cancel-accepted') {
    if (receipt.workNodeRef !== call.workNodeRef || receipt.schedulerGeneration !== call.schedulerGeneration ||
        receipt.cancellationTokenRef !== call.cancellationTokenRef || receipt.closedAt !== receipt.transitionedAt) {
      throw new Error('typed CANCEL/CLOSE receipt cancellation lineage mismatch');
    }
    if (receipt.priorState === 'ACCEPTED' && (!observation ||
        receipt.observationRef !== observation.observationRef ||
        receipt.observationFingerprint !== observation.semanticFingerprint)) {
      throw new Error('typed ACCEPTED close receipt observation lineage mismatch');
    }
  } else if (contractKind === 'contract.intent-scheduler.relay-event.reinject') {
    if (!observation || receipt.observationRef !== observation.observationRef ||
        receipt.observationFingerprint !== observation.semanticFingerprint ||
        receipt.contextLeaseRef !== entry.reinjectedContextLeaseRef) {
      throw new Error('typed REINJECT receipt observation/context lineage mismatch');
    }
  } else if (contractKind === 'contract.intent-scheduler.relay-event.held-disposition') {
    const hold = priorReceipts.at(-1);
    const authorization = canonicalHeldSchedulerAuthorization(receipt.schedulerAuthorization);
    if (!['RESUME', 'REISSUE', 'SUPERSEDE', 'CLOSE'].includes(receipt.action) ||
        hold?.eventContractRef !== 'contract.intent-scheduler.relay-event.hold' ||
        receipt.checkpointRef !== hold.checkpointRef || authorization.checkpointRef !== hold.checkpointRef ||
        receipt.schedulerAuthorizationRef !== authorization.authorizationRef ||
        receipt.schedulerAuthorizationFingerprint !== authorization.semanticFingerprint ||
        receipt.schedulerInstanceRef !== authorization.schedulerInstanceRef ||
        authorization.schedulerInstanceRef !== call.schedulerInstanceRef ||
        authorization.priorToolCallRef !== call.toolCallRef || authorization.workNodeRef !== call.workNodeRef ||
        authorization.action !== receipt.action || receipt.priorContextLeaseRef !== call.contextLeaseRef ||
        receipt.priorSemanticPurposeFingerprint !== call.semanticPurposeFingerprint ||
        receipt.priorSchedulerGeneration !== call.schedulerGeneration ||
        (receipt.action === 'CLOSE'
          ? authorization.schedulerGeneration < call.schedulerGeneration
          : authorization.schedulerGeneration <= call.schedulerGeneration)) {
      throw new Error('typed HELD-DISPOSITION receipt scheduler/checkpoint lineage mismatch');
    }
    if (receipt.action === 'CLOSE' && (receipt.successorToolCallRef || receipt.successorContextLeaseRef ||
        receipt.successorSemanticPurposeFingerprint || receipt.successorSchedulerGeneration)) {
      throw new Error('typed HELD-DISPOSITION close cannot name successor lineage');
    }
    if (['RESUME', 'REISSUE'].includes(receipt.action) &&
        receipt.successorSemanticPurposeFingerprint !== call.semanticPurposeFingerprint) {
      throw new Error('typed HELD-DISPOSITION resume/reissue purpose lineage mismatch');
    }
    if (receipt.action === 'SUPERSEDE') {
      const policy = (schedulerRegistry?.heldToolReplacementPolicies ?? []).find((item) =>
        item.replacementPolicyRef === receipt.replacementPolicyRef &&
        item.allowedReasonRefs.includes(receipt.replacementReasonRef));
      if (!policy || authorization.replacementPolicyRef !== receipt.replacementPolicyRef ||
          authorization.replacementReasonRef !== receipt.replacementReasonRef) {
        throw new Error('typed HELD-DISPOSITION supersede policy lineage mismatch');
      }
    }
  }
}

function canonicalLedger(input, { schedulerRegistry = null, restoring = false } = {}) {
  const ledger = {
    schemaVersion: 'vexlife.intent-tool-relay-ledger/v1',
    relayRef: input?.relayRef ?? 'relay.intent-scheduler.mock-tools',
    entries: [...(input?.entries ?? [])].map((item) => clone(item))
      .sort((left, right) => left.toolCallRef.localeCompare(right.toolCallRef))
  };
  const refs = ledger.entries.map((item) => item.toolCallRef);
  if (restoring && ledger.entries.length && !schedulerRegistry) {
    throw new Error('restored tool relay ledger requires the canonical scheduler registry');
  }
  if (new Set(refs).size !== refs.length) throw new Error('tool relay ledger contains duplicate call refs');
  for (const entry of ledger.entries) {
    if (!entry.toolCallRef || !['PENDING', 'HELD', 'ACCEPTED', 'REINJECTED', 'CLOSED'].includes(entry.state)) {
      throw new Error('tool relay ledger contains an invalid entry');
    }
    entry.call = canonicalToolCall(entry.call, schedulerRegistry);
    if (entry.call.toolCallRef !== entry.toolCallRef) throw new Error('tool relay entry/call ref mismatch');
    entry.transitionReceipts = (entry.transitionReceipts ?? [])
      .map((receipt) => canonicalTransitionReceipt(receipt, schedulerRegistry));
    if (entry.transitionReceipts.some((receipt) => receipt.toolCallRef !== entry.toolCallRef)) {
      throw new Error('tool relay transition receipt call mismatch');
    }
    if (entry.observation) entry.observation = canonicalObservation(entry.observation, entry.call);
    for (const [index, receipt] of entry.transitionReceipts.entries()) {
      assertTypedTransitionReceipt(receipt, entry, entry.transitionReceipts.slice(0, index), schedulerRegistry);
    }
    const transitionTimes = entry.transitionReceipts.map((receipt) =>
      parseCanonicalTimestamp(receipt.transitionedAt, 'tool relay transition time'));
    const proposedAt = parseCanonicalTimestamp(entry.call.proposedAt, 'tool relay call proposedAt');
    if (transitionTimes.some((time, index) => time < proposedAt || (index > 0 && time < transitionTimes[index - 1]))) {
      throw new Error('tool relay transition history is not monotonic');
    }
    if (entry.observation) {
      const acceptedAt = parseCanonicalTimestamp(entry.observation.acceptedAt, 'tool relay observation acceptedAt');
      const timeoutAt = parseCanonicalTimestamp(entry.call.timeoutAt, 'tool relay call timeoutAt');
      if (acceptedAt < proposedAt || acceptedAt >= timeoutAt) {
        throw new Error('tool relay observation time is outside the canonical call interval');
      }
    }
    let replayedState = schedulerRegistry?.relayStateMachine?.initialState ?? 'PENDING';
    let terminalSeen = false;
    for (const [index, receipt] of entry.transitionReceipts.entries()) {
      if (terminalSeen) throw new Error('tool relay transition occurs after a terminal state');
      if (receipt.sequence !== index) throw new Error('tool relay transition sequence is out of order');
      if (receipt.priorState !== replayedState) throw new Error('tool relay transition prior state does not match replay');
      replayedState = receipt.nextState;
      if ((schedulerRegistry?.relayStateMachine?.terminalStates ?? []).includes(replayedState)) terminalSeen = true;
    }
    if (entry.state !== replayedState) throw new Error('tool relay supplied state does not match replay-derived state');
    if (entry.state === 'PENDING' && (entry.observation || entry.transitionReceipts.length)) {
      throw new Error('pending tool relay entry has impossible history');
    }
    if (entry.state === 'HELD' && (entry.observation || entry.transitionReceipts.at(-1)?.nextState !== 'HELD')) {
      throw new Error('held tool relay entry has impossible history');
    }
    if (['ACCEPTED', 'REINJECTED'].includes(entry.state) && !entry.observation) {
      throw new Error('accepted tool relay entry is missing canonical observation');
    }
    if (entry.state === 'REINJECTED' && !entry.reinjectedContextLeaseRef) {
      throw new Error('reinjected tool relay entry is missing successor context identity');
    }
    if (entry.state === 'CLOSED' && entry.transitionReceipts.at(-1)?.nextState !== 'CLOSED') {
      throw new Error('closed tool relay entry is missing a terminal receipt');
    }
    const acceptedReceipt = entry.transitionReceipts.some((receipt) =>
      receipt.eventContractRef === 'contract.intent-scheduler.relay-event.accept'
    );
    if (entry.observation && !acceptedReceipt) {
      throw new Error('tool relay observation exists without a typed ACCEPT event');
    }
    if (entry.reinjectedContextLeaseRef && entry.state !== 'REINJECTED') {
      throw new Error('tool relay successor context exists without a typed REINJECTED terminal state');
    }
  }
  for (const entry of ledger.entries) {
    for (const receipt of entry.transitionReceipts.filter((item) => item.schemaVersion === 'vexlife.intent-held-tool-transition/v2')) {
      const successor = receipt.successorToolCallRef
        ? ledger.entries.find((item) => item.toolCallRef === receipt.successorToolCallRef)
        : null;
      if (receipt.action === 'CLOSE' && successor) throw new Error('closed held call cannot name a successor');
      if (receipt.action !== 'CLOSE' && !successor) throw new Error('held transition successor lineage is missing');
      if (successor && (
        successor.call.predecessorToolCallRef !== entry.toolCallRef ||
        successor.call.heldDisposition !== receipt.action ||
        successor.call.semanticPurposeFingerprint !== receipt.successorSemanticPurposeFingerprint
      )) throw new Error('held transition successor lineage mismatch');
      if (successor) {
        const authorization = receipt.schedulerAuthorization;
        for (const [field, expected] of [
          ['runtimeSnapshotFingerprint', authorization.runtimeSnapshotFingerprint],
          ['schedulerGeneration', authorization.schedulerGeneration],
          ['cancellationTokenRef', authorization.cancellationTokenRef],
          ['workerLeaseRef', authorization.workerLeaseRef],
          ['contextLeaseRef', authorization.contextLeaseRef],
          ['contextLeaseFingerprint', authorization.contextLeaseFingerprint],
          ['resourceLeaseRef', authorization.resourceLeaseRef],
          ['resourceLeaseFingerprint', authorization.resourceLeaseFingerprint],
          ['capabilityLeaseRef', authorization.capabilityLeaseRef],
          ['capabilityLeaseFingerprint', authorization.capabilityLeaseFingerprint],
          ['effectLeaseRef', authorization.effectLeaseRef],
          ['effectLeaseFingerprint', authorization.effectLeaseFingerprint]
        ]) if (successor.call[field] !== expected) {
          throw new Error(`held transition successor authorization ${field} mismatch`);
        }
      }
    }
  }
  ledger.semanticFingerprint = semanticHash({
    schemaVersion: ledger.schemaVersion,
    relayRef: ledger.relayRef,
    entries: ledger.entries
  });
  if (restoring && !input?.semanticFingerprint) {
    throw new Error('restored tool relay ledger requires its canonical fingerprint');
  }
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
    schedulerInstanceRef: workerLease?.schedulerInstanceRef,
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
    predecessorToolCallRef: input.predecessorToolCallRef ?? null,
    heldDisposition: input.heldDisposition ?? null,
    replacementPolicyRef: input.replacementPolicyRef ?? null,
    replacementReasonRef: input.replacementReasonRef ?? null,
    externalEffectsExecuted: false
  };
  call.semanticPurposeFingerprint = toolSemanticPurpose(call);
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
  if (call.schedulerInstanceRef !== workerLease.schedulerInstanceRef) throw new Error('tool call scheduler instance mismatch');
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
  #schedulerRegistry;
  #schedulerCapability = null;
  #schedulerInstanceRef = null;

  constructor(snapshot = null, { schedulerRegistry = null } = {}) {
    this.#schedulerRegistry = schedulerRegistry;
    this.#ledger = canonicalLedger(snapshot ?? {}, {
      schedulerRegistry,
      restoring: snapshot !== null
    });
  }

  get snapshot() {
    return clone(this.#ledger);
  }

  bindSchedulerOwnership(schedulerInstanceRef, capability) {
    if (!schedulerInstanceRef || !capability || typeof capability !== 'object') {
      throw new Error('relay scheduler ownership requires an instance and private capability');
    }
    if (this.#schedulerCapability && (
      this.#schedulerCapability !== capability || this.#schedulerInstanceRef !== schedulerInstanceRef
    )) throw new Error('relay scheduler ownership cannot be rebound');
    this.#schedulerCapability = capability;
    this.#schedulerInstanceRef = schedulerInstanceRef;
    return { bound: true, schedulerInstanceRef };
  }

  #replace(entry) {
    const entries = this.#ledger.entries.filter((item) => item.toolCallRef !== entry.toolCallRef);
    entries.push(entry);
    this.#ledger = canonicalLedger({ relayRef: this.#ledger.relayRef, entries }, {
      schedulerRegistry: this.#schedulerRegistry
    });
  }

  #entry(toolCallRef) {
    return this.#ledger.entries.find((item) => item.toolCallRef === toolCallRef) ?? null;
  }

  register(toolCall) {
    if (!this.#schedulerRegistry) throw new Error('tool relay registration requires the canonical scheduler registry');
    const call = canonicalToolCall(toolCall, this.#schedulerRegistry);
    if (this.#entry(call.toolCallRef)) return { changed: false, reason: 'DUPLICATE_TOOL_CALL_REF' };
    this.#replace(freeze({
      toolCallRef: call.toolCallRef,
      state: 'PENDING',
      call: clone(call),
      observation: null,
      transitionReceipts: [],
      reinjectedContextLeaseRef: null
    }));
    return { changed: true, toolCall: call };
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
      const proposed = parseCanonicalTimestamp(call.proposedAt, 'tool call proposedAt');
      timeout = parseCanonicalTimestamp(call.timeoutAt, 'tool call timeoutAt');
      if (received < proposed) return reject('RESULT_BEFORE_PROPOSAL', ref);
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
    const receipt = transitionReceipt(entry, {
      schemaVersion: 'vexlife.intent-tool-call-acceptance/v1',
      receiptRef: `${call.toolCallRef}.accepted.${entry.transitionReceipts.length}`,
      nextState: 'ACCEPTED',
      observationRef: frozenObservation.observationRef,
      observationFingerprint: frozenObservation.semanticFingerprint,
      transitionedAt: receivedAt
    }, this.#schedulerRegistry);
    this.#replace(freeze({
      ...clone(entry),
      state: 'ACCEPTED',
      observation: frozenObservation,
      transitionReceipts: [...entry.transitionReceipts, receipt]
    }));
    return { accepted: true, state: 'ACCEPTED', observation: frozenObservation, receipt };
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
    const receipt = transitionReceipt(entry, {
      schemaVersion: 'vexlife.intent-tool-observation-reinjection/v1',
      receiptRef: `${entry.toolCallRef}.reinjected.${entry.transitionReceipts.length}`,
      nextState: 'REINJECTED',
      contextLeaseRef: contextLease.leaseRef,
      observationRef: observation.observationRef,
      observationFingerprint: observation.semanticFingerprint,
      transitionedAt: observedAt
    }, this.#schedulerRegistry);
    this.#replace(freeze({
      ...clone(entry),
      state: 'REINJECTED',
      reinjectedContextLeaseRef: contextLease.leaseRef,
      transitionReceipts: [...entry.transitionReceipts, receipt]
    }));
    return { accepted: true, state: 'REINJECTED', receipt, ...result };
  }

  hold(toolCallRef, {
    receiptRef,
    heldAt,
    checkpointRef
  }) {
    const entry = this.#entry(toolCallRef);
    if (!entry || entry.state !== 'PENDING') return { changed: false, reason: 'NO_PENDING_TOOL_CALL' };
    const held = parseCanonicalTimestamp(heldAt, 'tool call heldAt');
    const proposed = parseCanonicalTimestamp(entry.call.proposedAt, 'tool call proposedAt');
    const timeout = parseCanonicalTimestamp(entry.call.timeoutAt, 'tool call timeoutAt');
    if (held < proposed || held >= timeout) throw new Error('tool call hold time must be monotonic and before timeout');
    const receipt = transitionReceipt(entry, {
      schemaVersion: 'vexlife.intent-tool-call-hold/v1',
      receiptRef,
      nextState: 'HELD',
      checkpointRef,
      workNodeRef: entry.call.workNodeRef,
      schedulerGeneration: entry.call.schedulerGeneration,
      heldAt,
      transitionedAt: heldAt
    }, this.#schedulerRegistry);
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
    if (entry?.state === 'HELD') {
      throw new Error('held tool close requires scheduler-owned disposition before mutation');
    }
    if (!entry || !['PENDING', 'ACCEPTED'].includes(entry.state)) {
      return { changed: false, reason: 'NO_OPEN_TOOL_CALL' };
    }
    const closed = parseCanonicalTimestamp(closedAt, 'tool call closedAt');
    const priorTimes = [entry.call.proposedAt, entry.observation?.acceptedAt]
      .concat((entry.transitionReceipts ?? []).map((item) => item.heldAt ?? item.transitionedAt ?? item.closedAt))
      .filter(Boolean)
      .map((value) => parseCanonicalTimestamp(value, 'tool call prior transition'));
    if (priorTimes.some((prior) => closed < prior)) {
      throw new Error('tool call close time must be monotonic');
    }
    const receipt = transitionReceipt(entry, {
      schemaVersion: 'vexlife.intent-tool-call-cancellation/v1',
      receiptRef,
      nextState: 'CLOSED',
      workNodeRef: entry.call.workNodeRef,
      schedulerGeneration: entry.call.schedulerGeneration,
      cancellationTokenRef: entry.call.cancellationTokenRef,
      observationRef: entry.observation?.observationRef ?? null,
      observationFingerprint: entry.observation?.semanticFingerprint ?? null,
      reason,
      closedAt,
      transitionedAt: closedAt
    }, this.#schedulerRegistry);
    this.#replace(freeze({
      ...clone(entry),
      state: 'CLOSED',
      transitionReceipts: [...entry.transitionReceipts, freeze(receipt)]
    }));
    return { changed: true, receipt: freeze(receipt) };
  }

  transitionHeld(toolCallRef, {
    action,
    checkpointRef,
    successorCall = null,
    schedulerAuthorization,
    schedulerCapability = null,
    receiptRef,
    transitionedAt
  }) {
    const entry = this.#entry(toolCallRef);
    if (!entry || entry.state !== 'HELD') return { changed: false, reason: 'NO_HELD_TOOL_CALL' };
    if (!this.#schedulerCapability || schedulerCapability !== this.#schedulerCapability) {
      throw new Error('held tool transition requires scheduler-owned relay capability');
    }
    if (!['RESUME', 'REISSUE', 'SUPERSEDE', 'CLOSE'].includes(action)) {
      throw new Error('held tool transition action is invalid');
    }
    const hold = entry.transitionReceipts.at(-1);
    if (hold?.checkpointRef !== checkpointRef) throw new Error('held tool transition checkpoint mismatch');
    const transitioned = parseCanonicalTimestamp(transitionedAt, 'held tool transitionedAt');
    const held = parseCanonicalTimestamp(hold.heldAt, 'held tool heldAt');
    if (transitioned < held) throw new Error('held tool transition time must be monotonic');
    schedulerAuthorization = canonicalHeldSchedulerAuthorization(schedulerAuthorization);
    if (schedulerAuthorization.schedulerInstanceRef !== entry.call.schedulerInstanceRef ||
        schedulerAuthorization.checkpointRef !== checkpointRef ||
        schedulerAuthorization.priorToolCallRef !== entry.call.toolCallRef ||
        schedulerAuthorization.workNodeRef !== entry.call.workNodeRef ||
        schedulerAuthorization.action !== action ||
        (action === 'CLOSE'
          ? schedulerAuthorization.schedulerGeneration < entry.call.schedulerGeneration
          : schedulerAuthorization.schedulerGeneration <= entry.call.schedulerGeneration)) {
      throw new Error('held tool transition has wrong scheduler, checkpoint, call or generation');
    }
    let canonicalSuccessor = null;
    if (action !== 'CLOSE') {
      canonicalSuccessor = canonicalToolCall(successorCall, this.#schedulerRegistry);
      if (canonicalSuccessor.workNodeRef !== entry.call.workNodeRef ||
          canonicalSuccessor.schedulerInstanceRef !== schedulerAuthorization.schedulerInstanceRef ||
          canonicalSuccessor.schedulerGeneration !== schedulerAuthorization.schedulerGeneration ||
          canonicalSuccessor.toolCallRef === entry.call.toolCallRef) {
        throw new Error('held tool successor call does not bind fresh checkpoint leases');
      }
      for (const [field, expected] of [
        ['runtimeSnapshotFingerprint', schedulerAuthorization.runtimeSnapshotFingerprint],
        ['cancellationTokenRef', schedulerAuthorization.cancellationTokenRef],
        ['workerLeaseRef', schedulerAuthorization.workerLeaseRef],
        ['contextLeaseRef', schedulerAuthorization.contextLeaseRef],
        ['contextLeaseFingerprint', schedulerAuthorization.contextLeaseFingerprint],
        ['resourceLeaseRef', schedulerAuthorization.resourceLeaseRef],
        ['resourceLeaseFingerprint', schedulerAuthorization.resourceLeaseFingerprint],
        ['capabilityLeaseRef', schedulerAuthorization.capabilityLeaseRef],
        ['capabilityLeaseFingerprint', schedulerAuthorization.capabilityLeaseFingerprint],
        ['effectLeaseRef', schedulerAuthorization.effectLeaseRef],
        ['effectLeaseFingerprint', schedulerAuthorization.effectLeaseFingerprint]
      ]) if (canonicalSuccessor[field] !== expected) throw new Error(`held tool successor ${field} mismatch`);
      if (canonicalSuccessor.predecessorToolCallRef !== entry.call.toolCallRef ||
          canonicalSuccessor.heldDisposition !== action) {
        throw new Error('held tool successor does not bind disposition lineage');
      }
      if (['RESUME', 'REISSUE'].includes(action) &&
          canonicalSuccessor.semanticPurposeFingerprint !== entry.call.semanticPurposeFingerprint) {
        throw new Error(`${action} must preserve the original semantic tool purpose`);
      }
      if (action === 'SUPERSEDE') {
        const replacement = (this.#schedulerRegistry?.heldToolReplacementPolicies ?? []).find((item) =>
          item.replacementPolicyRef === schedulerAuthorization.replacementPolicyRef &&
          item.allowedReasonRefs.includes(schedulerAuthorization.replacementReasonRef));
        if (!replacement || canonicalSuccessor.replacementPolicyRef !== schedulerAuthorization.replacementPolicyRef ||
            canonicalSuccessor.replacementReasonRef !== schedulerAuthorization.replacementReasonRef) {
          throw new Error('SUPERSEDE requires a registered replacement policy and reason');
        }
      }
      if (parseCanonicalTimestamp(canonicalSuccessor.proposedAt, 'held tool successor proposedAt') < transitioned) {
        throw new Error('held tool successor proposal must be monotonic');
      }
    }
    const receipt = transitionReceipt(entry, {
      schemaVersion: 'vexlife.intent-held-tool-transition/v2',
      receiptRef,
      nextState: 'CLOSED',
      checkpointRef,
      action,
      schedulerAuthorizationRef: schedulerAuthorization.authorizationRef,
      schedulerAuthorizationFingerprint: schedulerAuthorization.semanticFingerprint,
      schedulerAuthorization: clone(schedulerAuthorization),
      schedulerInstanceRef: schedulerAuthorization.schedulerInstanceRef,
      priorContextLeaseRef: entry.call.contextLeaseRef,
      successorToolCallRef: canonicalSuccessor?.toolCallRef ?? null,
      successorContextLeaseRef: canonicalSuccessor?.contextLeaseRef ?? null,
      priorSemanticPurposeFingerprint: entry.call.semanticPurposeFingerprint,
      successorSemanticPurposeFingerprint: canonicalSuccessor?.semanticPurposeFingerprint ?? null,
      priorSchedulerGeneration: entry.call.schedulerGeneration,
      successorSchedulerGeneration: canonicalSuccessor?.schedulerGeneration ?? null,
      replacementPolicyRef: schedulerAuthorization.replacementPolicyRef ?? null,
      replacementReasonRef: schedulerAuthorization.replacementReasonRef ?? null,
      transitionedAt
    }, this.#schedulerRegistry);
    const closedEntry = freeze({
      ...clone(entry),
      state: 'CLOSED',
      transitionReceipts: [...entry.transitionReceipts, freeze(receipt)]
    });
    if (canonicalSuccessor && this.#entry(canonicalSuccessor.toolCallRef)) {
      throw new Error('held tool successor call ref already exists');
    }
    const successorEntry = canonicalSuccessor ? freeze({
      toolCallRef: canonicalSuccessor.toolCallRef,
      state: 'PENDING',
      call: clone(canonicalSuccessor),
      observation: null,
      transitionReceipts: [],
      reinjectedContextLeaseRef: null
    }) : null;
    this.#ledger = canonicalLedger({
      relayRef: this.#ledger.relayRef,
      entries: [
        ...this.#ledger.entries.filter((item) => ![entry.toolCallRef, canonicalSuccessor?.toolCallRef].includes(item.toolCallRef)),
        closedEntry,
        ...(successorEntry ? [successorEntry] : [])
      ]
    }, { schedulerRegistry: this.#schedulerRegistry });
    return {
      changed: true,
      action,
      receipt: freeze(receipt),
      successorCall: canonicalSuccessor
    };
  }
}

// [VXG RealForever]
