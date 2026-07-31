import { semanticHash } from './utils.mjs';

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const LIFECYCLE_STATES = new Set(['ACTIVE', 'HELD', 'RELEASED', 'SUPERSEDED', 'CANCELLED']);
const EVIDENCE_CLASSES = new Set(['SIMULATED_CURRENT', 'LIVE_RUNTIME_CURRENT']);

const REQUIRED_FIELD_SETS = {
  admissionRequiredFields: [
    'schedulerGeneration',
    'workerRef',
    'graphRef',
    'graphFingerprint',
    'trustSnapshotRef',
    'trustSnapshotSourceRef',
    'trustSnapshotSourceHash',
    'trustSnapshotFingerprint',
    'trustSnapshotFormationRef',
    'runtimeSnapshotRef',
    'runtimeSnapshotFingerprint',
    'runtimeEvidenceClass',
    'observedAt',
    'resourceSnapshotRef',
    'resourceSnapshotFingerprint',
    'resourceLeaseRef',
    'resourceLeaseFingerprint',
    'workNodeRef',
    'nodeFingerprint',
    'occupancyRef',
    'occupancyFingerprint',
    'capabilityEnvelopeRef',
    'capabilityLeaseRef',
    'capabilityLeaseFingerprint',
    'effectEnvelopeRef',
    'effectLeaseRef',
    'effectLeaseFingerprint',
    'expectedTransitionRef',
    'completionGateRefs',
    'returnRouteRef',
    'formedAt',
    'expiresAt',
    'currentness',
    'lifecycle',
    'semanticFingerprint'
  ],
  contextLeaseRequiredFields: [
    'leaseRef',
    'workerRef',
    'workNodeRef',
    'graphFingerprint',
    'trustSnapshotFingerprint',
    'runtimeSnapshotFingerprint',
    'schedulerGeneration',
    'resourceLeaseFingerprint',
    'capabilityLeaseFingerprint',
    'effectLeaseFingerprint',
    'cancellationTokenRef',
    'foundationKernelRef',
    'roleFrameRef',
    'intentFrameRef',
    'selectedAtlasRefs',
    'selectedSourceRefs',
    'applicableCultureRefs',
    'applicableLessonRefs',
    'applicableReleaseRefs',
    'inputTokenEstimate',
    'reservedOutputTokens',
    'hardTokenLimit',
    'formedAt',
    'expiresAt',
    'observedAt',
    'currentness',
    'lifecycle',
    'checkpointReturnRef',
    'semanticFingerprint'
  ],
  resourceSnapshotRequiredFields: [
    'snapshotRef',
    'generation',
    'sourceRef',
    'sourceHash',
    'formationRef',
    'evidenceClass',
    'cpuLoadPct',
    'cpuConcurrencyLimit',
    'cpuActiveCount',
    'ramAvailableMb',
    'ramReservedMb',
    'gpuAvailable',
    'vramAvailableMb',
    'vramReservedMb',
    'modelResident',
    'activeModelTurn',
    'activeHeavyTool',
    'interactiveWaitState',
    'backgroundWorkAdmission',
    'thermalPowerState',
    'currentness',
    'formedAt',
    'observedAt',
    'expiresAt',
    'semanticFingerprint'
  ],
  resourceLeaseRequiredFields: [
    'leaseRef',
    'workerRef',
    'workNodeRef',
    'graphFingerprint',
    'runtimeSnapshotRef',
    'runtimeSnapshotFingerprint',
    'schedulerGeneration',
    'resourceSnapshotRef',
    'resourceSnapshotFingerprint',
    'request',
    'formedAt',
    'expiresAt',
    'observedAt',
    'currentness',
    'lifecycle',
    'semanticFingerprint'
  ],
  checkpointRequiredFields: [
    'checkpointRef',
    'workNodeRef',
    'graphFingerprint',
    'trustSnapshotFingerprint',
    'runtimeSnapshotFingerprint',
    'priorSchedulerGeneration',
    'lastCompletedStep',
    'currentState',
    'selectedSourceRefs',
    'selectedContextRefs',
    'producedArtifactRefs',
    'producedReceiptRefs',
    'openQuestions',
    'nextSafeAction',
    'pendingToolCallRef',
    'priorOccupancyRef',
    'priorCapabilityLeaseRef',
    'priorEffectLeaseRef',
    'priorResourceLeaseRef',
    'priorContextLeaseRef',
    'priorWorkerLeaseRef',
    'resourceSnapshotFingerprint',
    'sourceBindings',
    'leaseReleaseReceipts',
    'leaseReleaseLifecycle',
    'priorLeaseFingerprints',
    'transitionedLeaseFingerprints',
    'formedAt',
    'semanticFingerprint'
  ],
  toolCallRequiredFields: [
    'toolCallRef',
    'schedulerInstanceRef',
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
    'argumentSchemaRef',
    'argumentHash',
    'semanticPurposeFingerprint',
    'capabilityLeaseRef',
    'capabilityLeaseFingerprint',
    'effectLeaseRef',
    'effectLeaseFingerprint',
    'resourceLeaseRef',
    'resourceLeaseFingerprint',
    'resultSchemaRef',
    'executorRef',
    'schedulerGeneration',
    'cancellationTokenRef',
    'sourceEvidenceRef',
    'sourceEvidenceHash',
    'proposedAt',
    'timeoutAt',
    'cancellationPolicy',
    'semanticFingerprint'
  ],
  toolResultMatchFields: [
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
    'schedulerGeneration',
    'cancellationTokenRef',
    'executorRef',
    'sourceEvidenceRef',
    'sourceEvidenceHash',
    'schemaRef'
  ],
  completionVerificationRequiredFields: [
    'verificationReceiptRef',
    'contractRef',
    'verifierRef',
    'verifierSourceRef',
    'verifierSourceHash',
    'formationRef',
    'workNodeRef',
    'nodeFingerprint',
    'graphRef',
    'graphFingerprint',
    'runtimeSnapshotFingerprint',
    'schedulerInstanceRef',
    'schedulerGeneration',
    'expectedTransitionRef',
    'completionGateRefs',
    'gateResultReceipts',
    'observedBeforeState',
    'observedAfterState',
    'returnRouteRef',
    'formedAt',
    'observedAt',
    'expiresAt',
    'currentness',
    'selfCertified',
    'semanticFingerprint'
  ],
  relayTransitionReceiptRequiredFields: [
    'receiptRef',
    'toolCallRef',
    'priorState',
    'nextState',
    'sequence',
    'currentness',
    'sourceRef',
    'sourceHash',
    'formationRef',
    'transitionedAt',
    'semanticFingerprint'
  ]
};

function clone(value) {
  return structuredClone(value);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function required(value, fields, label) {
  const missing = fields.filter((field) => value?.[field] === undefined || value?.[field] === null || value?.[field] === '');
  if (missing.length) throw new Error(`${label} missing required fields: ${missing.join(', ')}`);
}

function uniqueStrings(values, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || !value)) {
    throw new Error(`${label} must contain stable non-empty refs`);
  }
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicates`);
  return [...values];
}

export function parseCanonicalTimestamp(value, label = 'timestamp') {
  if (typeof value !== 'string' || !value) throw new Error(`${label} is required`);
  const epochMs = Date.parse(value);
  if (!Number.isFinite(epochMs) || new Date(epochMs).toISOString() !== value) {
    throw new Error(`${label} must be canonical ISO-8601 UTC`);
  }
  return epochMs;
}

export function assertActiveInterval({ formedAt, observedAt, expiresAt }, label = 'lease') {
  const formed = parseCanonicalTimestamp(formedAt, `${label}.formedAt`);
  const observed = parseCanonicalTimestamp(observedAt, `${label}.observedAt`);
  const expires = parseCanonicalTimestamp(expiresAt, `${label}.expiresAt`);
  if (formed > observed || observed >= expires) {
    throw new Error(`${label} requires formedAt <= observedAt < expiresAt`);
  }
  return { formed, observed, expires };
}

export function assertSourceHash(value, label = 'sourceHash') {
  if (!HASH_PATTERN.test(String(value ?? ''))) throw new Error(`${label} must be a lowercase SHA-256`);
  return value;
}

export function validateIntentSchedulerRegistry(registry) {
  const errors = [];
  const catchError = (operation) => {
    try {
      operation();
    } catch (error) {
      errors.push(error.message);
    }
  };
  if (registry?.schemaVersion !== 'vexlife.intent-scheduler-registry/v1') errors.push('unexpected scheduler registry schema');
  for (const field of ['registryRef', 'systemRef', 'canonicalSourceRef', 'purpose']) {
    if (!registry?.[field]) errors.push(`scheduler registry missing ${field}`);
  }
  if (registry?.canonicalSource?.sourceRef !== registry?.canonicalSourceRef || !registry?.canonicalSource?.path) {
    errors.push('scheduler registry canonical source identity is incomplete');
  }
  if (registry?.physicalWorkerPolicy?.modelInferenceConcurrency !== 1) errors.push('modelInferenceConcurrency must equal one');
  if (registry?.physicalWorkerPolicy?.backgroundModelConcurrencyWhileInteractiveWaits !== 0) {
    errors.push('background concurrency must be zero while interactive work waits');
  }
  if (registry?.physicalWorkerPolicy?.activeContextLeasesPerWorker !== 1) {
    errors.push('active context leases per worker must equal one');
  }
  if (!(registry?.fairnessPolicy?.maxDeferrals > 0)) errors.push('bounded fairness maxDeferrals must be positive');

  const ownedRefs = [];
  const own = (ref, label) => {
    if (!ref) errors.push(`${label} missing ref`);
    else ownedRefs.push(ref);
  };
  own(registry?.registryRef, 'scheduler registry');
  own(registry?.systemRef, 'scheduler system');
  own(registry?.canonicalSourceRef, 'scheduler source');
  for (const item of registry?.priorityClassIdentities ?? []) own(item.priorityClassRef, 'priority class');
  for (const item of registry?.policyIdentities ?? []) own(item.policyRef, 'scheduler policy');
  for (const item of registry?.requiredFieldContracts ?? []) own(item.contractRef, 'required-field contract');
  for (const item of registry?.projectionIdentities ?? []) own(item.projectionRef, 'scheduler projection');
  own(registry?.runtimeTrustContract?.contractRef, 'runtime trust contract');
  own(registry?.runtimeTrustContract?.clockRef, 'runtime clock');
  for (const item of registry?.runtimeSourceIdentities ?? []) own(item.sourceRef, 'runtime source');
  for (const item of registry?.workerIdentities ?? []) own(item.workerRef, 'worker identity');
  for (const item of registry?.mockToolContracts ?? []) {
    for (const [field, label] of [
      ['contractRef', 'mock-tool contract'],
      ['toolRef', 'mock tool'],
      ['effectRef', 'mock effect'],
      ['argumentSchemaRef', 'mock argument schema'],
      ['resultSchemaRef', 'mock result schema'],
      ['executorRef', 'mock executor']
    ]) own(item[field], label);
  }
  own(registry?.simulationContract?.contractRef, 'simulation contract');
  if (new Set(ownedRefs).size !== ownedRefs.length) errors.push('scheduler registry contains duplicate owned identity refs');

  catchError(() => uniqueStrings(registry?.priorityClasses, 'priorityClasses'));
  const priorityNames = (registry?.priorityClassIdentities ?? []).map((item) => item.name);
  if (JSON.stringify(priorityNames) !== JSON.stringify(registry?.priorityClasses ?? [])) {
    errors.push('priority class identities must exactly follow priorityClasses');
  }
  if ((registry?.priorityClassIdentities ?? []).some((item, index) => item.rank !== index)) {
    errors.push('priority class ranks must be contiguous and deterministic');
  }
  catchError(() => uniqueStrings(registry?.processRefs, 'processRefs'));
  catchError(() => uniqueStrings(registry?.testRefs, 'testRefs'));

  const contracts = new Map((registry?.requiredFieldContracts ?? []).map((item) => [item.sourceField, item]));
  for (const [sourceField, mandatoryFields] of Object.entries(REQUIRED_FIELD_SETS)) {
    const fields = registry?.[sourceField];
    catchError(() => uniqueStrings(fields, sourceField));
    for (const field of mandatoryFields) if (!(fields ?? []).includes(field)) errors.push(`${sourceField} missing ${field}`);
    if (!contracts.get(sourceField)?.contractRef) errors.push(`requiredFieldContracts missing ${sourceField}`);
  }

  const trust = registry?.runtimeTrustContract;
  if (trust?.contractRef !== 'contract.intent-scheduler.runtime-trust-clock') {
    errors.push('runtime trust contract identity mismatch');
  }
  if (trust?.clockRef !== 'clock.intent-scheduler.canonical-utc') {
    errors.push('runtime trust canonical clock identity mismatch');
  }
  if (trust?.activeWindowRule !== 'formedAt <= observedAt < expiresAt') {
    errors.push('runtime trust active window rule mismatch');
  }
  if (trust?.selfCertificationAllowed !== false) {
    errors.push('runtime trust must prohibit self-certification');
  }
  if (!trust?.requiredFields?.length) errors.push('runtime trust contract requiredFields are missing');
  for (const evidenceClass of trust?.evidenceClasses ?? []) {
    if (!EVIDENCE_CLASSES.has(evidenceClass)) errors.push(`unknown runtime evidence class ${evidenceClass}`);
  }
  if (!(registry?.runtimeSourceIdentities ?? []).length) errors.push('scheduler runtime source identities are empty');
  if (!(registry?.workerIdentities ?? []).length) errors.push('scheduler worker identities are empty');
  if (!(registry?.mockToolContracts ?? []).length) errors.push('scheduler mock tool contracts are empty');
  for (const contract of registry?.mockToolContracts ?? []) {
    catchError(() => uniqueStrings(contract.requiredArgumentFields, `${contract.contractRef}.requiredArgumentFields`));
    catchError(() => uniqueStrings(contract.requiredResultFields, `${contract.contractRef}.requiredResultFields`));
    if (!(contract.maxObservationBytes > 0)) errors.push(`${contract.contractRef} maxObservationBytes must be positive`);
  }
  if (registry?.resourceUnknownPolicy !== 'UNKNOWN_IS_NOT_SPARE_CAPACITY') {
    errors.push('unknown resource state must fail closed');
  }
  const completion = registry?.completionVerifierContract;
  if (completion?.contractRef !== 'contract.intent-scheduler.completion-verifier-currentness' ||
      completion?.evidenceClass !== 'DETERMINISTIC_FAKE_EXTERNAL_VERIFIER' ||
      completion?.selfCertificationAllowed !== false ||
      completion?.activeWindowRule !== 'formedAt <= observedAt < expiresAt') {
    errors.push('completion verifier contract is not the registered deterministic external verifier');
  }
  if (completion?.sourceDescriptor && completion.sourceHash !== semanticHash(completion.sourceDescriptor)) {
    errors.push('completion verifier source hash mismatch');
  }
  const relayMachine = registry?.relayStateMachine;
  const expectedRelayMachine = {
    PENDING: ['HELD', 'ACCEPTED', 'CLOSED'],
    HELD: ['CLOSED'],
    ACCEPTED: ['REINJECTED', 'CLOSED'],
    REINJECTED: [],
    CLOSED: []
  };
  if (relayMachine?.initialState !== 'PENDING' ||
      JSON.stringify(relayMachine?.terminalStates) !== JSON.stringify(['REINJECTED', 'CLOSED']) ||
      JSON.stringify(relayMachine?.allowedTransitions) !== JSON.stringify(expectedRelayMachine)) {
    errors.push('relay state machine does not match the registered replay graph');
  }
  if (!(registry?.heldToolReplacementPolicies ?? []).some((item) =>
    item.replacementPolicyRef === 'policy.intent-scheduler.held-tool-replacement' && item.allowedReasonRefs?.length
  )) errors.push('held tool replacement policy is missing');
  return {
    ok: errors.length === 0,
    errors,
    stats: {
      ownedRefs: ownedRefs.length,
      priorityClasses: registry?.priorityClassIdentities?.length ?? 0,
      fieldContracts: registry?.requiredFieldContracts?.length ?? 0,
      runtimeSources: registry?.runtimeSourceIdentities?.length ?? 0,
      mockTools: registry?.mockToolContracts?.length ?? 0
    },
    semanticHash: registry ? semanticHash(registry) : null
  };
}

export function resolveMockToolContract(registry, { toolRef, effectRef = null } = {}) {
  const contract = (registry?.mockToolContracts ?? []).find((item) =>
    item.toolRef === toolRef && (!effectRef || item.effectRef === effectRef)
  );
  if (!contract) throw new Error(`unknown canonical mock tool/effect identity ${toolRef}/${effectRef ?? 'UNKNOWN'}`);
  return freeze(clone(contract));
}

export function createSchedulerRuntimeTrustSnapshot(input, {
  schedulerRegistry,
  resourceSnapshot
} = {}) {
  const validation = validateIntentSchedulerRegistry(schedulerRegistry);
  if (!validation.ok) throw new Error(`scheduler registry invalid: ${validation.errors.join(', ')}`);
  const requiredFields = schedulerRegistry.runtimeTrustContract.requiredFields;
  required(input, requiredFields.filter((field) => field !== 'semanticFingerprint'), 'scheduler runtime trust snapshot');
  if (!Number.isInteger(input.schedulerGeneration) || input.schedulerGeneration < 0) {
    throw new Error('scheduler runtime trust generation must be a non-negative integer');
  }
  if (input.currentness !== 'CURRENT') throw new Error('scheduler runtime trust snapshot must be CURRENT');
  if (input.selfCertified === true) throw new Error('scheduler runtime trust evidence cannot be self-certified');
  if (!EVIDENCE_CLASSES.has(input.evidenceClass) ||
      !schedulerRegistry.runtimeTrustContract.evidenceClasses.includes(input.evidenceClass)) {
    throw new Error(`scheduler runtime evidence class is not admitted: ${input.evidenceClass}`);
  }
  const source = schedulerRegistry.runtimeSourceIdentities.find((item) => item.sourceRef === input.sourceRef);
  if (!source) throw new Error(`unknown scheduler runtime source ${input.sourceRef}`);
  if (source.evidenceClass !== input.evidenceClass) throw new Error('scheduler runtime source evidence class mismatch');
  if (source.authorityRef !== input.leaseAuthorityRef) throw new Error('scheduler runtime lease authority mismatch');
  const worker = schedulerRegistry.workerIdentities.find((item) => item.workerRef === input.workerRef);
  if (!worker) throw new Error(`unknown scheduler worker identity ${input.workerRef}`);
  if (!worker.evidenceClasses.includes(input.evidenceClass)) throw new Error('worker identity is not admitted for runtime evidence class');
  assertSourceHash(input.sourceHash, 'scheduler runtime sourceHash');
  assertActiveInterval(input, 'scheduler runtime trust snapshot');
  if (!resourceSnapshot?.semanticFingerprint ||
      resourceSnapshot.snapshotRef !== input.resourceSnapshotRef ||
      resourceSnapshot.semanticFingerprint !== input.resourceSnapshotFingerprint) {
    throw new Error('scheduler runtime trust snapshot does not bind the exact resource observation');
  }
  if (resourceSnapshot.generation !== input.schedulerGeneration) {
    throw new Error('scheduler runtime trust and resource generations differ');
  }
  if (resourceSnapshot.sourceRef !== input.sourceRef ||
      resourceSnapshot.sourceHash !== input.sourceHash ||
      resourceSnapshot.evidenceClass !== input.evidenceClass) {
    throw new Error('scheduler runtime trust and resource source evidence differ');
  }
  const candidate = {
    schemaVersion: 'vexlife.intent-scheduler-runtime-trust/v0',
    ...clone(input),
    selfCertified: false
  };
  delete candidate.semanticFingerprint;
  candidate.semanticFingerprint = semanticHash(candidate);
  if (input.semanticFingerprint && input.semanticFingerprint !== candidate.semanticFingerprint) {
    throw new Error('scheduler runtime trust semantic fingerprint mismatch');
  }
  return freeze(candidate);
}

export function assertCurrentLease(lease, {
  label = 'lease',
  observedAt,
  schedulerGeneration = null,
  runtimeSnapshotFingerprint = null
} = {}) {
  if (!lease?.leaseRef || lease.currentness !== 'CURRENT' || lease.lifecycle !== 'ACTIVE') {
    throw new Error(`${label} lease must be current and ACTIVE`);
  }
  assertActiveInterval({
    formedAt: lease.formedAt,
    observedAt: observedAt ?? lease.observedAt,
    expiresAt: lease.expiresAt
  }, `${label} lease`);
  if (schedulerGeneration !== null && lease.schedulerGeneration !== schedulerGeneration) {
    throw new Error(`${label} lease scheduler generation mismatch`);
  }
  if (runtimeSnapshotFingerprint && lease.runtimeSnapshotFingerprint !== runtimeSnapshotFingerprint) {
    throw new Error(`${label} lease runtime snapshot mismatch`);
  }
  return lease;
}

export function transitionLease(lease, {
  lifecycle,
  receiptRef,
  transitionedAt,
  reason,
  successorLeaseRef = null
}) {
  if (!LIFECYCLE_STATES.has(lifecycle) || lifecycle === 'ACTIVE') {
    throw new Error(`invalid terminal lease lifecycle ${lifecycle}`);
  }
  assertCurrentLease(lease, { label: lease.schemaVersion ?? 'lease', observedAt: transitionedAt });
  if (!receiptRef || !reason) throw new Error('lease transition requires receiptRef and reason');
  const transitioned = {
    ...clone(lease),
    lifecycle,
    currentness: 'SUPERSEDED',
    transitionedAt,
    transitionReason: reason,
    successorLeaseRef
  };
  delete transitioned.semanticFingerprint;
  transitioned.semanticFingerprint = semanticHash(transitioned);
  const receipt = {
    schemaVersion: 'vexlife.intent-lease-transition-receipt/v0',
    receiptRef,
    leaseRef: lease.leaseRef,
    priorLeaseFingerprint: lease.semanticFingerprint,
    transitionedLeaseFingerprint: transitioned.semanticFingerprint,
    workerRef: lease.workerRef,
    workNodeRef: lease.workNodeRef,
    schedulerGeneration: lease.schedulerGeneration,
    lifecycle,
    reason,
    transitionedAt,
    successorLeaseRef
  };
  receipt.semanticFingerprint = semanticHash(receipt);
  return { lease: freeze(transitioned), receipt: freeze(receipt) };
}

export class WorkerLeaseAuthority {
  #sourceRef;
  #active = new Map();

  constructor({ sourceRef }) {
    if (!sourceRef) throw new Error('worker lease authority requires sourceRef');
    this.#sourceRef = sourceRef;
  }

  claim(lease, runtimeSnapshot) {
    assertCurrentLease(lease, {
      label: 'worker',
      observedAt: runtimeSnapshot?.observedAt,
      schedulerGeneration: runtimeSnapshot?.schedulerGeneration,
      runtimeSnapshotFingerprint: runtimeSnapshot?.semanticFingerprint
    });
    if (runtimeSnapshot?.sourceRef !== this.#sourceRef) throw new Error('worker lease authority source mismatch');
    const key = `${runtimeSnapshot.sourceRef}:${lease.workerRef}`;
    const active = this.#active.get(key);
    if (active && (
      active.leaseRef !== lease.leaseRef ||
      active.schedulerInstanceRef !== lease.schedulerInstanceRef
    )) {
      return { admitted: false, state: 'BLOCKED', reason: 'EXACT_WORKER_SOURCE_ALREADY_LEASED', active: clone(active) };
    }
    this.#active.set(key, freeze(clone(lease)));
    return { admitted: true, state: 'ACTIVE', lease: clone(lease) };
  }

  release(lease, transition) {
    const key = `${this.#sourceRef}:${lease.workerRef}`;
    const active = this.#active.get(key);
    if (!active || active.leaseRef !== lease.leaseRef) {
      throw new Error('worker lease authority cannot release an unowned lease');
    }
    this.#active.delete(key);
    return transitionLease(lease, transition);
  }

  snapshot() {
    const activeLeases = [...this.#active.values()].map((item) => clone(item))
      .sort((left, right) => left.leaseRef.localeCompare(right.leaseRef));
    const snapshot = {
      schemaVersion: 'vexlife.intent-worker-lease-authority-snapshot/v0',
      sourceRef: this.#sourceRef,
      activeLeases
    };
    snapshot.semanticFingerprint = semanticHash(snapshot);
    return freeze(snapshot);
  }
}

export function validateIntegratedSchedulerSimulationReceipt(receipt, {
  schedulerRegistry,
  blueprintHash,
  sourceTreeSha256,
  repositoryGit
} = {}) {
  const errors = [];
  const simulationContract = schedulerRegistry?.simulationContract;
  const expectedJourney = simulationContract?.requiredJourneyStates ?? [];
  const expectedBindings = {
    candidateHeadSha: repositoryGit?.candidateHeadSha ?? null,
    testedCheckoutSha: repositoryGit?.checkoutSha ?? null,
    testedMergeSha: repositoryGit?.testedMergeSha ?? null,
    baseSha: repositoryGit?.baseSha ?? null,
    sourceTreeSha256,
    blueprintHash,
    schedulerRegistryHash: schedulerRegistry ? semanticHash(schedulerRegistry) : null
  };
  if (receipt?.schemaVersion !== 'vexlife.intent-scheduler-simulation-receipt/v1') {
    errors.push('simulation receipt schemaVersion mismatch');
  }
  if (receipt?.contractRef !== simulationContract?.contractRef) errors.push('simulation receipt contractRef mismatch');
  if (receipt?.state !== 'PASS') errors.push('simulation receipt did not pass');
  if (receipt?.currentness !== 'CURRENT') errors.push('simulation receipt is not current');
  if (receipt?.mode !== 'DETERMINISTIC_FAKE_MODEL_AND_MOCK_TOOL_ONLY') {
    errors.push('simulation receipt mode is not deterministic fake-model/mock-tool only');
  }
  for (const [field, expected] of Object.entries(expectedBindings)) {
    if (receipt?.[field] !== expected) errors.push(`simulation receipt ${field} binding mismatch`);
  }
  if (JSON.stringify(receipt?.journeyStates ?? []) !== JSON.stringify(expectedJourney)) {
    errors.push('simulation receipt journey does not exactly match the registered complete loop');
  }
  if (receipt?.orphanedPendingToolCalls !== 0) errors.push('simulation receipt has orphaned pending tool calls');
  if (receipt?.externalEffectsExecuted !== simulationContract?.externalEffectsExecuted ||
      receipt?.externalEffectsExecuted !== false) {
    errors.push('simulation receipt reports external effects');
  }
  if (receipt?.selfCertifiedRuntimeEvidence !== false) errors.push('simulation receipt used self-certified runtime evidence');
  if (receipt?.finalProjection?.health?.state === 'CLEAR') {
    errors.push('simulation receipt incorrectly projects released or cancelled leases as CLEAR');
  }
  for (const phase of ['initial', 'checkpointReleased', 'resumed', 'completed']) {
    for (const lease of ['worker', 'context', 'resource', 'capability', 'effect', 'occupancy']) {
      if (!HASH_PATTERN.test(receipt?.leaseFingerprints?.[phase]?.[lease] ?? '')) {
        errors.push(`simulation receipt missing ${phase} ${lease} lease fingerprint`);
      }
    }
  }
  for (const field of [
    'toolCallFingerprint',
    'observationFingerprint',
    'checkpointFingerprint',
    'heldToolDispositionFingerprint',
    'heldToolAuthorizationFingerprint',
    'completionVerificationFingerprint',
    'workgraphTransitionFingerprint',
    'completionFingerprint',
    'returnRouteFingerprint',
    'successorAuthorizationFingerprint',
    'separateCancellationFingerprint',
    'relayLedgerFingerprint',
    'finalAggregateFingerprint'
  ]) {
    if (!HASH_PATTERN.test(receipt?.[field] ?? '')) errors.push(`simulation receipt missing ${field}`);
  }
  if (receipt?.workgraphConvergenceProof?.priorNodeState === receipt?.workgraphConvergenceProof?.finalNodeState ||
      receipt?.workgraphConvergenceProof?.finalNodeState !== 'COMPLETED' ||
      !receipt?.workgraphConvergenceProof?.canonicalTransitionRef ||
      !receipt?.workgraphConvergenceProof?.canonicalReceiptRef ||
      receipt?.workgraphConvergenceProof?.dependentReadyRefs?.length !== 1 ||
      receipt?.workgraphConvergenceProof?.parentConvergenceReadyRefs?.length !== 1) {
    errors.push('simulation receipt Workgraph convergence proof mismatch');
  }
  if (receipt?.relayReplayProof?.registeredStateMachineRef !== schedulerRegistry?.relayStateMachine?.policyRef ||
      receipt?.relayReplayProof?.heldPriorState !== 'HELD' ||
      receipt?.relayReplayProof?.derivedTerminalState !== 'CLOSED') {
    errors.push('simulation receipt held relay replay proof mismatch');
  }
  if (receipt?.separateCancellationProof?.phase !== 'CANCELLED' ||
      JSON.stringify(receipt?.separateCancellationProof?.leaseLifecycle) !== JSON.stringify(['CANCELLED'])) {
    errors.push('simulation receipt separate cancellation proof mismatch');
  }
  if (!HASH_PATTERN.test(receipt?.semanticFingerprint ?? '')) {
    errors.push('simulation receipt missing semanticFingerprint');
  } else {
    const semantic = clone(receipt);
    delete semantic.semanticFingerprint;
    if (semanticHash(semantic) !== receipt.semanticFingerprint) errors.push('simulation receipt semanticFingerprint mismatch');
  }
  return {
    ok: errors.length === 0,
    errors,
    state: errors.length === 0 ? 'EXECUTED_CURRENT' : 'INVALID',
    expectedBindings
  };
}

export const INTENT_SCHEDULER_REQUIRED_FIELD_SETS = freeze(clone(REQUIRED_FIELD_SETS));

// [VXG RealForever]
