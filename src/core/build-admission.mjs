import fs from 'node:fs';
import { semanticHash } from './utils.mjs';
import {
  createIntentEnvelope,
  createIntentWorkgraph,
  createWorkNode
} from './intent-workgraph.mjs';
import { validateIntentWorkgraph, transitionAllowed } from './intent-validation.mjs';
import {
  SingleWorkerIntentScheduler,
  WorkerLeaseAuthority,
  admitIntentSchedulerQueue
} from './intent-scheduler.mjs';
import {
  assertCurrentLease,
  transitionLease,
  validateIntentSchedulerRegistry,
  createSchedulerRuntimeTrustSnapshot
} from './scheduler-runtime-trust.mjs';
import { createResourceSnapshot } from './resource-admission.mjs';
import { ToolResultRelay } from './tool-result-relay.mjs';
import {
  createConcernAggregate,
  createConcernObservation,
  deriveConcernSubject,
  validateConcernAggregate
} from './concern-watch.mjs';
import {
  reobserveDisposableRepositoryEvidence,
  validateDisposableRepositoryEvidenceRecord
} from './repository-evidence.mjs';
import {
  validateBuildEffectReceipt,
  validateBuildEffectReceiptRecord
} from './local-git-effect-adapter.mjs';

const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const REQUIRED_IDENTITY_REFS = Object.freeze({
  actions: ['action.file.edit-with-recovery', 'action.cli.execute'],
  permissions: ['permission.file.edit', 'permission.cli.execute'],
  capabilities: ['capability.vexlife.file.edit-with-recovery', 'capability.vexlife.cli.typed'],
  processes: ['process.vexlife.file.edit-with-recovery', 'process.vexlife.cli.execute-typed']
});

function clone(value) { return structuredClone(value); }
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}
function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value;
}
function requireSha1(value, label) {
  if (!SHA1.test(value ?? '')) throw new Error(`${label} must be a lowercase Git SHA-1`);
  return value;
}
function requireSha256(value, label) {
  if (!SHA256.test(value ?? '')) throw new Error(`${label} must be a lowercase SHA-256`);
  return value;
}
function timestamp(value, label) {
  requireString(value, label);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new Error(`${label} must be canonical ISO`);
  return value;
}
function chronology(earlier, later, label, strict = false) {
  const a = Date.parse(timestamp(earlier, `${label} earlier`));
  const b = Date.parse(timestamp(later, `${label} later`));
  if (strict ? b <= a : b < a) throw new Error(`${label} chronology is invalid`);
}
function exactRefs(values, label, required = false) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  const refs = values.map((value, i) => requireString(value, `${label}[${i}]`));
  if (new Set(refs).size !== refs.length) throw new Error(`${label} contains duplicates`);
  if (required && refs.length === 0) throw new Error(`${label} cannot be empty`);
  return [...refs].sort();
}
function contentAddress(coreInput, refField, prefix, suppliedRef = null) {
  const core = clone(coreInput);
  delete core[refField];
  delete core.semanticFingerprint;
  const semanticFingerprint = semanticHash(core);
  const ref = `${prefix}.${semanticFingerprint.slice(0, 24)}`;
  if (suppliedRef != null && suppliedRef !== ref) throw new Error(`${refField} is not canonical`);
  return freeze({ ...core, [refField]: ref, semanticFingerprint });
}
function assertCanonical(value, refField, prefix, label) {
  requireObject(value, label);
  const core = clone(value);
  delete core[refField];
  delete core.semanticFingerprint;
  const expected = contentAddress(core, refField, prefix);
  if (value[refField] !== expected[refField] || value.semanticFingerprint !== expected.semanticFingerprint) {
    throw new Error(`${label} is forged, re-addressed, or same-ref/different-meaning`);
  }
  return value;
}
function exactBinding(actual, expected, label) {
  for (const [field, value] of Object.entries(expected)) if (actual?.[field] !== value) throw new Error(`${label} ${field} mismatch`);
}
function registryOrThrow(registry) {
  const result = validateBuildAdmissionRegistry(registry);
  if (!result.ok) throw new Error(`Build Admission registry is invalid: ${result.errors.join('; ')}`);
  return registry;
}
function safeSuffix(value) {
  const suffix = requireString(value, 'authority suffix');
  if (!/^[A-Za-z0-9._-]+$/.test(suffix)) throw new Error('authority suffix must be one bounded identity segment');
  return suffix;
}
function canonicalIdentityCatalog(catalog) {
  requireObject(catalog, 'Build Admission identity catalog');
  const output = {};
  for (const [kind, refs] of Object.entries(REQUIRED_IDENTITY_REFS)) {
    if (!Array.isArray(catalog[kind])) throw new Error(`identity catalog ${kind} missing`);
    output[kind] = refs.map((ref) => {
      const key = kind === 'actions' ? 'actionRef' : kind === 'permissions' ? 'permissionRef' : kind === 'capabilities' ? 'capabilityRef' : 'processRef';
      const match = catalog[kind].find((item) => item?.[key] === ref);
      if (!match) throw new Error(`identity catalog missing ${ref}`);
      return clone(match);
    });
  }
  const forbidden = JSON.stringify(output).match(/(?:github\.publication|github\.publish|publish-public-branch|action\.github)/g) ?? [];
  if (forbidden.length) throw new Error('publication identity leaked into local Build Admission identity catalog');
  return freeze(output);
}

export function extractBuildAdmissionIdentityCatalog(bundle) {
  requireObject(bundle, 'Blueprint bundle');
  return canonicalIdentityCatalog({
    actions: bundle.blueprint?.actions ?? [],
    permissions: bundle.blueprint?.permissions ?? [],
    capabilities: bundle.capabilities?.capabilities ?? [],
    processes: bundle.factory?.processes ?? []
  });
}

export function createBuildAuthorityContext(bundle, trustSnapshot) {
  requireObject(bundle, 'Blueprint bundle');
  requireObject(trustSnapshot, 'Intent trust snapshot');
  return freeze({
    intentRegistry: bundle.intentRegistry,
    schedulerRegistry: bundle.schedulerRegistry,
    concernRegistry: bundle.blueprint?.concernWatch,
    trustSnapshot: clone(trustSnapshot),
    registeredProcessRefs: (bundle.factory?.processes ?? []).map((item) => item.processRef).sort(),
    registeredRoleRefs: (bundle.blueprint?.roles ?? []).map((item) => item.roleRef).sort(),
    identityCatalog: extractBuildAdmissionIdentityCatalog(bundle)
  });
}

export function validateBuildAdmissionRegistry(registry) {
  const errors = [];
  if (!registry || typeof registry !== 'object') return { ok: false, errors: ['registry missing'] };
  if (registry.schemaVersion !== 'vexlife.build-admission-registry/v1') errors.push('schemaVersion mismatch');
  if (registry.canonicalSource?.path !== 'blueprint/build-admission-registry.json' || registry.canonicalSource?.field !== 'buildAdmission' || registry.canonicalSource?.compositionRef !== 'blueprint.vexlife.universal.001') errors.push('canonical source mismatch');
  if (registry.consumedIdentityContract?.sourceDefinitionsMayBeModified !== false || registry.consumedIdentityContract?.schedulerRemainsSoleWorkAdmissionOwner !== true || registry.consumedIdentityContract?.buildAdmissionCreatesSecondQueue !== false || registry.consumedIdentityContract?.publicationIdentityRefsConsumed !== false) errors.push('identity consumption boundary mismatch');
  for (const [field, refs] of Object.entries({ actionRefs: REQUIRED_IDENTITY_REFS.actions, permissionRefs: REQUIRED_IDENTITY_REFS.permissions, capabilityRefs: REQUIRED_IDENTITY_REFS.capabilities, processRefs: REQUIRED_IDENTITY_REFS.processes })) {
    if (semanticHash([...(registry.consumedIdentityContract?.[field] ?? [])].sort()) !== semanticHash([...refs].sort())) errors.push(`${field} is not exact local-only identity chain`);
  }
  const identities = registry.contractIdentities ?? [];
  if (identities.length !== 7 || new Set(identities.map((x) => x.contractRef)).size !== 7) errors.push('contract identities incomplete');
  if (semanticHash(registry.admissionContract?.requiredLeaseKinds) !== semanticHash(['OCCUPANCY','CAPABILITY','EFFECT','RESOURCE','WORKER','CONTEXT'])) errors.push('six-lease vocabulary mismatch');
  if (semanticHash(registry.releaseContract?.releaseKinds) !== semanticHash(['CLAIM','OCCUPANCY','CAPABILITY','EFFECT','RESOURCE','WORKER','CONTEXT'])) errors.push('release vocabulary mismatch');
  if (registry.authorityContract?.sourceManagedReconstructionRequired !== true || registry.authorityContract?.coordinatedCallerReaddressingAllowed !== false || registry.authorityContract?.outerSchedulerEffectGrantsGitAuthority !== false) errors.push('authority reconstruction boundary mismatch');
  if (registry.adapter?.effectScope !== 'DISPOSABLE_LOCAL_GIT_REPOSITORY' || registry.adapter?.networkUsed !== false || registry.adapter?.remoteConfigured !== false || registry.adapter?.arbitraryShellAllowed !== false || registry.adapter?.implementationCheckoutAllowed !== false || registry.adapter?.cleanupMayTraverseParent !== false || registry.adapter?.hooksDisabled !== true || registry.adapter?.globalConfigIgnored !== true || registry.adapter?.ignoredMaterialAllowed !== false) errors.push('adapter boundary mismatch');
  if (semanticHash(registry.simulationContract?.proofRefs) !== semanticHash(Array.from({ length: 26 }, (_, i) => `BA${i}`))) errors.push('BA0-BA25 incomplete');
  return { ok: errors.length === 0, errors, stats: { contracts: identities.length, proofs: registry.simulationContract?.proofRefs?.length ?? 0 } };
}

function authorityRefs(registry, suffix) {
  const c = registry.authorityContract;
  return {
    intentRef: `${c.intentRefPrefix}.${suffix}`,
    workNodeRef: `${c.workNodeRefPrefix}.${suffix}`,
    graphRef: `${c.graphRefPrefix}.${suffix}`,
    schedulerInstanceRef: `instance.intent-scheduler.build-admission.${suffix}`,
    runtimeSnapshotRef: `runtime-snapshot.build-admission.${suffix}`,
    resourceSnapshotRef: `resource-snapshot.build-admission.${suffix}`,
    occupancyRef: `occupancy.build-admission.${suffix}`,
    capabilityLeaseRef: `capability-lease.build-admission.${suffix}`,
    effectLeaseRef: `effect-lease.build-admission.${suffix}`,
    resourceLeaseRef: `resource-lease.build-admission.${suffix}`,
    contextLeaseRef: `context-lease.build-admission.${suffix}`
  };
}

function buildAuthorityFormation(input, registry, context) {
  const suffix = safeSuffix(input.suffix);
  const refs = authorityRefs(registry, suffix);
  const c = registry.authorityContract;
  const formedAt = timestamp(input.formedAt, 'authority formedAt');
  const observedAt = timestamp(input.observedAt, 'authority observedAt');
  const expiresAt = timestamp(input.expiresAt, 'authority expiresAt');
  chronology(formedAt, observedAt, 'authority observation');
  chronology(observedAt, expiresAt, 'authority expiry', true);
  const workRef = requireString(input.workRef, 'authority workRef');
  const claimRef = requireString(input.claimRef, 'authority claimRef');
  const pathClaimRefs = exactRefs(input.pathClaimRefs, 'authority pathClaimRefs', true);
  if (pathClaimRefs.length !== 1 || pathClaimRefs[0] !== claimRef) throw new Error('authority requires one exact claim');
  const intent = createIntentEnvelope({
    intentRef: refs.intentRef,
    originMessageRef: `message.build-admission.${suffix}`,
    originSpeakerRef: c.actorRef,
    recipientRoleRef: c.roleRef,
    projectRef: 'project.vexlife',
    threadRef: `thread.build-admission.${suffix}`,
    channelRef: `channel.build-admission.${suffix}`,
    originalContentHash: semanticHash({ workRef, claimRef, pathClaimRefs }),
    desiredOutcome: { intentKey: 'BUILD_ADMISSION_LOCAL_EFFECT', summary: 'Execute one bounded source-managed disposable local Git effect' },
    constraints: ['local-only', 'remote-free', 'credential-free', 'exact-path-only'],
    createdAt: formedAt,
    sourceLineageRef: `lineage.build-admission.${suffix}`
  }, context.intentRegistry);
  const node = createWorkNode({
    workNodeRef: refs.workNodeRef,
    rootIntentRef: intent.intentRef,
    parentWorkNodeRef: null,
    purpose: 'Execute one bounded source-managed disposable local Git effect',
    processRef: c.processRef,
    state: 'READY',
    dependencyRefs: [],
    childRefs: [],
    roleRef: c.roleRef,
    priorityClass: 'NORMAL',
    applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs: [],
    applicableBurdenReleaseRefs: [],
    capabilityEnvelopeRef: c.capabilityEnvelopeRef,
    effectEnvelopeRef: c.effectEnvelopeRef,
    resourceEnvelopeRef: c.resourceEnvelopeRef,
    expectedTransitionRef: c.expectedTransitionRef,
    completionGateRefs: clone(c.completionGateRefs),
    returnRouteRef: c.returnRouteRef,
    sourceRefs: ['blueprint/build-admission-registry.json'],
    createdAt: formedAt
  }, context.intentRegistry);
  let priorState = 'CAPTURED';
  const transitions = ['DECOMPOSED', 'PLAN_VALIDATED', 'READY'].map((nextState, sequence) => {
    const transition = {
      transitionRef: `transition.build-admission.${suffix}.${sequence}`,
      workNodeRef: node.workNodeRef,
      sequence,
      priorState,
      nextState,
      reason: 'source-managed Build Admission authority formation',
      actorRef: c.actorRef,
      actorRoleRef: c.roleRef,
      processRef: 'process.vexlife.intent.verify-transition',
      sourceRefs: ['blueprint/build-admission-registry.json'],
      createdAt: new Date(Date.parse(formedAt) + sequence).toISOString()
    };
    priorState = nextState;
    return transition;
  });
  const graph = createIntentWorkgraph({
    graphRef: refs.graphRef,
    intent,
    nodes: [node],
    transitions,
    receipts: [],
    bindingRefs: Object.fromEntries(context.intentRegistry.bindingFields.map((field) => [field, [...new Set(Array.isArray(node[field]) ? node[field] : [node[field]])].filter(Boolean).sort()])),
    createdAt: formedAt
  }, context.intentRegistry);
  const runtimeSource = context.schedulerRegistry.runtimeSourceIdentities.find((item) => item.sourceRef === 'source.intent-scheduler.test-runtime') ?? context.schedulerRegistry.runtimeSourceIdentities[0];
  if (!runtimeSource) throw new Error('scheduler registry has no source-managed runtime identity');
  const sourceHash = semanticHash({ sourceRef: runtimeSource.sourceRef, workRef, claimRef, suffix, schedulerRegistryHash: semanticHash(context.schedulerRegistry) });
  const resourceSnapshot = createResourceSnapshot({
    snapshotRef: refs.resourceSnapshotRef,
    generation: 1,
    sourceRef: runtimeSource.sourceRef,
    sourceHash,
    formationRef: `formation.build-admission.resource.${suffix}`,
    evidenceClass: runtimeSource.evidenceClass,
    cpuLoadPct: 1,
    cpuConcurrencyLimit: 4,
    cpuActiveCount: 0,
    ramAvailableMb: 8192,
    ramReservedMb: 64,
    gpuAvailable: false,
    vramAvailableMb: 0,
    vramReservedMb: 0,
    modelResident: false,
    activeModelTurn: false,
    activeHeavyTool: false,
    interactiveWaitState: 'IDLE',
    backgroundWorkAdmission: 'ADMITTED',
    thermalPowerState: 'NOT_EXPOSED',
    currentness: 'CURRENT',
    formedAt,
    observedAt,
    expiresAt
  });
  const runtimeTrustSnapshot = createSchedulerRuntimeTrustSnapshot({
    snapshotRef: refs.runtimeSnapshotRef,
    sourceRef: runtimeSource.sourceRef,
    sourceHash,
    formationRef: `formation.build-admission.runtime.${suffix}`,
    evidenceClass: runtimeSource.evidenceClass,
    schedulerGeneration: 1,
    formedAt,
    observedAt,
    expiresAt,
    workerRef: c.workerRef,
    actorRef: c.actorRef,
    roleRef: c.roleRef,
    claimRef,
    occupancyRef: refs.occupancyRef,
    leaseAuthorityRef: runtimeSource.authorityRef,
    resourceSnapshotRef: resourceSnapshot.snapshotRef,
    resourceSnapshotFingerprint: resourceSnapshot.semanticFingerprint,
    currentness: 'CURRENT'
  }, { schedulerRegistry: context.schedulerRegistry, resourceSnapshot });
  const runtimeFields = {
    runtimeSnapshotRef: runtimeTrustSnapshot.snapshotRef,
    runtimeSnapshotFingerprint: runtimeTrustSnapshot.semanticFingerprint,
    schedulerGeneration: 1,
    sourceRef: runtimeTrustSnapshot.sourceRef,
    sourceHash: runtimeTrustSnapshot.sourceHash,
    authorityRef: runtimeTrustSnapshot.leaseAuthorityRef,
    formedAt,
    observedAt,
    expiresAt,
    currentness: 'CURRENT',
    lifecycle: 'ACTIVE'
  };
  const schedulerFormation = {
    resourceRequestByNodeRef: { [node.workNodeRef]: { cpuSlots: 1, ramMb: 64, vramMb: 0, modelTurn: false, heavyTool: false, background: false } },
    occupancyByNodeRef: { [node.workNodeRef]: { occupancyRef: refs.occupancyRef, actorRef: c.actorRef, roleRef: c.roleRef, workNodeRef: node.workNodeRef, graphFingerprint: graph.semanticFingerprint, claimRef, formationRef: `formation.build-admission.occupancy.${suffix}`, ...runtimeFields } },
    capabilityLeaseByNodeRef: { [node.workNodeRef]: { leaseRef: refs.capabilityLeaseRef, workNodeRef: node.workNodeRef, graphFingerprint: graph.semanticFingerprint, trustSnapshotFingerprint: context.trustSnapshot.semanticFingerprint, envelopeRef: node.capabilityEnvelopeRef, formationRef: `formation.build-admission.capability.${suffix}`, toolRefs: [c.outerSchedulerToolRef], ...runtimeFields } },
    effectLeaseByNodeRef: { [node.workNodeRef]: { leaseRef: refs.effectLeaseRef, workNodeRef: node.workNodeRef, graphFingerprint: graph.semanticFingerprint, trustSnapshotFingerprint: context.trustSnapshot.semanticFingerprint, envelopeRef: node.effectEnvelopeRef, formationRef: `formation.build-admission.effect.${suffix}`, effectDisposition: 'EFFECT_ENVELOPE_BOUND', allowedEffectRefs: [c.outerSchedulerEffectRef], ...runtimeFields } },
    resourceLeaseRefByNodeRef: { [node.workNodeRef]: refs.resourceLeaseRef },
    schedulerGeneration: 1,
    formedAt,
    observedAt,
    expiresAt
  };
  const contextInput = {
    leaseRef: refs.contextLeaseRef,
    cancellationTokenRef: `cancellation-token.build-admission.${suffix}`,
    foundationKernelRef: 'foundation-kernel.compact',
    roleFrameRef: 'role-frame.operations',
    intentFrameRef: `intent-frame.build-admission.${suffix}`,
    selectedAtlasRefs: ['registry.vexlife.intent-scheduler.001', 'module.vexlife.core.intent-scheduler'],
    selectedSourceRefs: ['blueprint/build-admission-registry.json'],
    applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs: [],
    applicableReleaseRefs: [],
    inputTokenEstimate: 128,
    reservedOutputTokens: 128,
    hardTokenLimit: 512,
    formedAt,
    observedAt,
    expiresAt,
    checkpointReturnRef: c.returnRouteRef
  };
  return { suffix, workRef, claimRef, pathClaimRefs, formedAt, observedAt, expiresAt, refs, graph, node, resourceSnapshot, runtimeTrustSnapshot, schedulerFormation, contextInput };
}

function executeAuthorityFormation(formation, context) {
  const options = {
    intentRegistry: context.intentRegistry,
    schedulerRegistry: context.schedulerRegistry,
    registeredProcessRefs: context.registeredProcessRefs,
    registeredRoleRefs: context.registeredRoleRefs,
    trustSnapshot: context.trustSnapshot,
    runtimeTrustSnapshot: formation.runtimeTrustSnapshot,
    resourceSnapshot: formation.resourceSnapshot,
    workerRef: formation.runtimeTrustSnapshot.workerRef,
    ...clone(formation.schedulerFormation)
  };
  const queue = admitIntentSchedulerQueue(formation.graph, options);
  if (queue.state !== 'ADMITTED' || !queue.admissionReceipt) throw new Error(`source-managed scheduler did not admit Build Admission work: ${queue.state}`);
  const relay = new ToolResultRelay(null, { schedulerRegistry: context.schedulerRegistry });
  const authority = new WorkerLeaseAuthority({ sourceRef: formation.runtimeTrustSnapshot.sourceRef });
  const scheduler = new SingleWorkerIntentScheduler({
    workerRef: formation.runtimeTrustSnapshot.workerRef,
    schedulerInstanceRef: formation.refs.schedulerInstanceRef,
    schedulerRegistry: context.schedulerRegistry,
    runtimeAuthority: authority,
    toolRelay: relay
  });
  const admitted = scheduler.admit(formation.graph, options);
  if (semanticHash(admitted.admissionReceipt) !== semanticHash(queue.admissionReceipt)) throw new Error('scheduler class and accepted queue admission diverged');
  const running = scheduler.leaseSelected(formation.contextInput);
  if (!running.admitted) throw new Error('source-managed scheduler worker/context leases were not admitted');
  return { queue, running, schedulerAggregateFingerprint: scheduler.aggregate.semanticFingerprint };
}

function formNonBlockingConcern(formation, schedulerAdmission, concernRegistry) {
  const observation = createConcernObservation({
    sourceRef: schedulerAdmission.admissionReceiptRef,
    sourceFingerprint: schedulerAdmission.semanticFingerprint,
    sourceRangeOrEventRef: 'scheduler-admission.current',
    observedAt: formation.observedAt,
    observerRef: 'observer.build-admission.source-validator',
    aboutScopeRef: formation.workRef,
    concernClass: 'SCOPE_OR_AUTHORITY',
    signalClass: 'EXTERNAL_NOTICE',
    certaintyClass: 'VERIFIED',
    impactClass: 'LOW',
    reversibilityClass: 'FULLY_REVERSIBLE',
    humanAttentionClass: 'NONE',
    evidenceOriginClass: 'INDEPENDENT_CHECK',
    evidenceRefs: [schedulerAdmission.admissionReceiptRef],
    unknownRefs: [],
    policySignals: { costOfWaiting: 'LOW', costOfFalseAlarm: 'LOW', availableAuthority: true, availableCapability: true }
  }, { registry: concernRegistry });
  const subject = deriveConcernSubject({ observations: [observation], subjectKind: 'SCOPE_RISK' }, { registry: concernRegistry });
  const aggregate = createConcernAggregate({ subject, formedAt: formation.observedAt }, { registry: concernRegistry });
  validateConcernAggregate(aggregate, { registry: concernRegistry });
  if (aggregate.queuePriorityActive || aggregate.humanAttentionRequests.length || aggregate.state === 'THRESHOLD_MET') throw new Error('Build Admission ConcernWatch aggregate is blocking');
  return { observation, subject, aggregate };
}

export function createSourceManagedBuildAuthority(input, { registry, authorityContext }) {
  const source = registryOrThrow(registry);
  const context = requireObject(authorityContext, 'Build Admission authority context');
  if (validateIntentSchedulerRegistry(context.schedulerRegistry).errors.length) throw new Error('scheduler registry is not accepted-current');
  const formation = buildAuthorityFormation(input, source, context);
  const executed = executeAuthorityFormation(formation, context);
  const concern = formNonBlockingConcern(formation, executed.queue.admissionReceipt, context.concernRegistry);
  const identityCatalog = canonicalIdentityCatalog(context.identityCatalog);
  const leases = {
    occupancy: clone(executed.running.occupancy),
    capability: clone(executed.running.capabilityLease),
    effect: clone(executed.running.effectLease),
    resource: clone(executed.running.resourceLease),
    worker: clone(executed.running.workerLease),
    context: clone(executed.running.contextLease)
  };
  for (const [kind, lease] of Object.entries(leases)) assertCurrentLease(lease, { label: `Build Admission ${kind}`, observedAt: formation.observedAt, schedulerGeneration: 1, runtimeSnapshotFingerprint: formation.runtimeTrustSnapshot.semanticFingerprint });
  const core = {
    schemaVersion: source.authorityContract.schemaVersion,
    contractRef: source.authorityContract.contractRef,
    formationRef: source.authorityContract.formationRef,
    sourceManaged: true,
    workRef: formation.workRef,
    claimRef: formation.claimRef,
    pathClaimRefs: formation.pathClaimRefs,
    pathClaimFingerprint: semanticHash(formation.pathClaimRefs),
    intentRegistryHash: semanticHash(context.intentRegistry),
    schedulerRegistryHash: semanticHash(context.schedulerRegistry),
    trustSnapshotRef: context.trustSnapshot.snapshotRef,
    trustSnapshotFingerprint: context.trustSnapshot.semanticFingerprint,
    registeredProcessRefsHash: semanticHash(context.registeredProcessRefs),
    registeredRoleRefsHash: semanticHash(context.registeredRoleRefs),
    identityCatalog,
    identityCatalogFingerprint: semanticHash(identityCatalog),
    workgraph: clone(formation.graph),
    schedulerAdmission: clone(executed.queue.admissionReceipt),
    schedulerFormation: {
      resourceSnapshot: clone(formation.resourceSnapshot),
      runtimeTrustSnapshot: clone(formation.runtimeTrustSnapshot),
      options: clone(formation.schedulerFormation),
      contextInput: clone(formation.contextInput),
      schedulerInstanceRef: formation.refs.schedulerInstanceRef
    },
    schedulerAggregateFingerprint: executed.schedulerAggregateFingerprint,
    leases,
    concernObservation: clone(concern.observation),
    concernSubject: clone(concern.subject),
    concernAggregate: clone(concern.aggregate),
    concernWatchState: 'CLEAR_OR_NON_BLOCKING',
    finalEffectIdentityRefs: clone(REQUIRED_IDENTITY_REFS),
    outerSchedulerEffectGrantsGitAuthority: false,
    schedulerGeneration: 1,
    formedAt: formation.formedAt,
    observedAt: formation.observedAt,
    expiresAt: formation.expiresAt,
    currentness: 'CURRENT'
  };
  return contentAddress(core, 'schedulerAuthorityEvidenceRef', 'evidence.scheduler-authority.build-admission');
}

export function validateSourceManagedBuildAuthority(authority, { registry, authorityContext }) {
  const source = registryOrThrow(registry);
  const context = requireObject(authorityContext, 'Build Admission authority context');
  assertCanonical(authority, 'schedulerAuthorityEvidenceRef', 'evidence.scheduler-authority.build-admission', 'scheduler authority evidence');
  if (authority.schemaVersion !== source.authorityContract.schemaVersion || authority.contractRef !== source.authorityContract.contractRef || authority.formationRef !== source.authorityContract.formationRef || authority.sourceManaged !== true || authority.currentness !== 'CURRENT' || authority.outerSchedulerEffectGrantsGitAuthority !== false) throw new Error('scheduler authority source contract mismatch');
  if (authority.intentRegistryHash !== semanticHash(context.intentRegistry) || authority.schedulerRegistryHash !== semanticHash(context.schedulerRegistry) || authority.trustSnapshotRef !== context.trustSnapshot.snapshotRef || authority.trustSnapshotFingerprint !== context.trustSnapshot.semanticFingerprint || authority.registeredProcessRefsHash !== semanticHash(context.registeredProcessRefs) || authority.registeredRoleRefsHash !== semanticHash(context.registeredRoleRefs)) throw new Error('scheduler authority accepted source registry/trust binding mismatch');
  const identityCatalog = canonicalIdentityCatalog(context.identityCatalog);
  if (authority.identityCatalogFingerprint !== semanticHash(identityCatalog) || semanticHash(authority.identityCatalog) !== semanticHash(identityCatalog) || semanticHash(authority.finalEffectIdentityRefs) !== semanticHash(REQUIRED_IDENTITY_REFS)) throw new Error('Build Admission local effect identity chain is stale or substituted');
  const graphValidation = validateIntentWorkgraph(authority.workgraph, { registry: context.intentRegistry, registeredProcessRefs: context.registeredProcessRefs, registeredRoleRefs: context.registeredRoleRefs, trustSnapshot: context.trustSnapshot });
  if (!graphValidation.ok || graphValidation.state !== 'PLAN_VALIDATED') throw new Error(`Build Admission Workgraph is not accepted-current: ${graphValidation.errors.join('; ')}`);
  const node = authority.workgraph.nodes.find((item) => item.workNodeRef === authority.schedulerAdmission.workNodeRef);
  if (!node || node.processRef !== source.authorityContract.processRef || node.roleRef !== source.authorityContract.roleRef || node.state !== 'READY') throw new Error('Build Admission selected Workgraph node is not exact source-managed authority');
  const formation = {
    graph: authority.workgraph,
    node,
    resourceSnapshot: authority.schedulerFormation.resourceSnapshot,
    runtimeTrustSnapshot: authority.schedulerFormation.runtimeTrustSnapshot,
    schedulerFormation: authority.schedulerFormation.options,
    contextInput: authority.schedulerFormation.contextInput,
    refs: { schedulerInstanceRef: authority.schedulerFormation.schedulerInstanceRef },
    observedAt: authority.observedAt
  };
  const executed = executeAuthorityFormation(formation, context);
  if (semanticHash(executed.queue.admissionReceipt) !== semanticHash(authority.schedulerAdmission) || executed.schedulerAggregateFingerprint !== authority.schedulerAggregateFingerprint) throw new Error('scheduler authority admission/aggregate does not reconstruct from accepted validators');
  const expectedLeases = {
    occupancy: executed.running.occupancy,
    capability: executed.running.capabilityLease,
    effect: executed.running.effectLease,
    resource: executed.running.resourceLease,
    worker: executed.running.workerLease,
    context: executed.running.contextLease
  };
  for (const [kind, expected] of Object.entries(expectedLeases)) {
    const actual = authority.leases?.[kind];
    assertCurrentLease(actual, { label: `Build Admission ${kind}`, observedAt: authority.observedAt, schedulerGeneration: authority.schedulerGeneration, runtimeSnapshotFingerprint: authority.schedulerFormation.runtimeTrustSnapshot.semanticFingerprint });
    if (semanticHash(actual) !== semanticHash(expected)) throw new Error(`Build Admission ${kind} lease does not reconstruct from scheduler authority`);
  }
  if (authority.leases.occupancy.claimRef !== authority.claimRef || authority.pathClaimFingerprint !== semanticHash(authority.pathClaimRefs) || authority.pathClaimRefs.length !== 1 || authority.pathClaimRefs[0] !== authority.claimRef) throw new Error('scheduler authority occupancy/claim binding mismatch');
  validateConcernAggregate(authority.concernAggregate, { registry: context.concernRegistry });
  if (authority.concernAggregate.queuePriorityActive || authority.concernAggregate.humanAttentionRequests.length || authority.concernWatchState !== 'CLEAR_OR_NON_BLOCKING') throw new Error('scheduler authority ConcernWatch replay is blocking');
  if (authority.concernObservation.sourceRef !== authority.schedulerAdmission.admissionReceiptRef || authority.concernObservation.sourceFingerprint !== authority.schedulerAdmission.semanticFingerprint || authority.concernSubject.concernSubjectRef !== authority.concernAggregate.concernSubjectRef) throw new Error('scheduler authority ConcernWatch lineage mismatch');
  return freeze(clone(authority));
}

function requestCore(input, registry) {
  requireObject(input, 'build request');
  const mutationPath = requireString(input.mutationPath, 'mutationPath').replaceAll('\\', '/');
  if (mutationPath !== registry.adapter.fixturePath || mutationPath.startsWith('/') || mutationPath.split('/').includes('..')) throw new Error('mutationPath is outside the exact registered fixture claim');
  const pathClaimRefs = exactRefs(input.pathClaimRefs, 'pathClaimRefs', true);
  if (pathClaimRefs.length !== 1 || pathClaimRefs[0] !== input.claimRef) throw new Error('request path claim is not exact single-writer claim');
  const completionGateRefs = exactRefs(input.completionGateRefs, 'completionGateRefs', true);
  const core = {
    schemaVersion: registry.requestContract.schemaVersion,
    contractRef: registry.requestContract.contractRef,
    workRef: requireString(input.workRef, 'workRef'),
    claimRef: requireString(input.claimRef, 'claimRef'),
    intentEnvelopeRef: requireString(input.intentEnvelopeRef, 'intentEnvelopeRef'),
    intentEnvelopeFingerprint: requireSha256(input.intentEnvelopeFingerprint, 'intentEnvelopeFingerprint'),
    workgraphRef: requireString(input.workgraphRef, 'workgraphRef'),
    workgraphFingerprint: requireSha256(input.workgraphFingerprint, 'workgraphFingerprint'),
    workNodeRef: requireString(input.workNodeRef, 'workNodeRef'),
    workNodeFingerprint: requireSha256(input.workNodeFingerprint, 'workNodeFingerprint'),
    schedulerAdmissionRef: requireString(input.schedulerAdmissionRef, 'schedulerAdmissionRef'),
    schedulerAdmissionFingerprint: requireSha256(input.schedulerAdmissionFingerprint, 'schedulerAdmissionFingerprint'),
    schedulerAuthorityEvidenceRef: requireString(input.schedulerAuthorityEvidenceRef, 'schedulerAuthorityEvidenceRef'),
    schedulerAuthorityEvidenceFingerprint: requireSha256(input.schedulerAuthorityEvidenceFingerprint, 'schedulerAuthorityEvidenceFingerprint'),
    schedulerGeneration: input.schedulerGeneration,
    repositoryRef: requireString(input.repositoryRef, 'repositoryRef'),
    repositoryEvidenceRef: requireString(input.repositoryEvidenceRef, 'repositoryEvidenceRef'),
    repositoryEvidenceFingerprint: requireSha256(input.repositoryEvidenceFingerprint, 'repositoryEvidenceFingerprint'),
    expectedHeadSha: requireSha1(input.expectedHeadSha, 'expectedHeadSha'),
    expectedTreeSha: requireSha1(input.expectedTreeSha, 'expectedTreeSha'),
    branchRef: requireString(input.branchRef, 'branchRef'),
    pathClaimRefs,
    mutationPath,
    expectedBeforeBlobSha: requireSha1(input.expectedBeforeBlobSha, 'expectedBeforeBlobSha'),
    replacementContentRef: requireString(input.replacementContentRef, 'replacementContentRef'),
    replacementContentSha256: requireSha256(input.replacementContentSha256, 'replacementContentSha256'),
    expectedAfterBlobSha: requireSha1(input.expectedAfterBlobSha, 'expectedAfterBlobSha'),
    commitMessage: requireString(input.commitMessage, 'commitMessage'),
    expectedTransitionRef: requireString(input.expectedTransitionRef, 'expectedTransitionRef'),
    completionGateRefs,
    returnRouteRef: requireString(input.returnRouteRef, 'returnRouteRef'),
    formedAt: timestamp(input.formedAt, 'formedAt'),
    observedAt: timestamp(input.observedAt, 'observedAt'),
    expiresAt: timestamp(input.expiresAt, 'expiresAt'),
    effectAuthorityGranted: false,
    networkAuthorityGranted: false,
    remoteGitAuthorityGranted: false
  };
  if (!Number.isSafeInteger(core.schedulerGeneration) || core.schedulerGeneration < 1) throw new Error('schedulerGeneration must be positive');
  chronology(core.formedAt, core.observedAt, 'request observation');
  chronology(core.observedAt, core.expiresAt, 'request expiry', true);
  if (registry.adapter.protectedBranches.includes(core.branchRef)) throw new Error('request branch is protected');
  if (/[\r\n]/.test(core.commitMessage) || core.commitMessage.toLowerCase().includes('signed-off-by:')) throw new Error('commitMessage must be one caller-reviewed subject; adapter owns DCO trailer');
  return core;
}

export function createBuildRequest(input, { registry }) {
  const source = registryOrThrow(registry);
  return contentAddress(requestCore(input, source), 'buildRequestRef', 'request.build-admission', input.buildRequestRef);
}
export function validateBuildRequest(request, { registry }) {
  const source = registryOrThrow(registry);
  assertCanonical(request, 'buildRequestRef', 'request.build-admission', 'build request');
  const expected = createBuildRequest({ ...clone(request), buildRequestRef: request.buildRequestRef }, { registry: source });
  if (semanticHash(expected) !== semanticHash(request)) throw new Error('build request is not canonical current meaning');
  return freeze(clone(request));
}

export function createBuildHumanConfirmation(request, input, { registry }) {
  const source = registryOrThrow(registry);
  validateBuildRequest(request, { registry: source });
  const core = {
    schemaVersion: 'vexlife.build-human-confirmation/v1',
    contractRef: source.authorityContract.humanConfirmationContractRef,
    state: source.admissionContract.requiredHumanConfirmationState,
    buildRequestRef: request.buildRequestRef,
    buildRequestFingerprint: request.semanticFingerprint,
    workRef: request.workRef,
    claimRef: request.claimRef,
    mutationPath: request.mutationPath,
    repositoryRef: request.repositoryRef,
    branchRef: request.branchRef,
    actorRef: requireString(input.actorRef, 'human confirmation actorRef'),
    sourceRef: requireString(input.sourceRef, 'human confirmation sourceRef'),
    observedAt: timestamp(input.observedAt, 'human confirmation observedAt'),
    expiresAt: timestamp(input.expiresAt, 'human confirmation expiresAt'),
    currentness: 'CURRENT',
    externalEffectExactlyConfirmed: true,
    networkConfirmed: false,
    remoteGitConfirmed: false
  };
  chronology(request.observedAt, core.observedAt, 'human confirmation');
  chronology(core.observedAt, core.expiresAt, 'human confirmation expiry', true);
  return contentAddress(core, 'humanConfirmationRef', 'confirmation.build-admission');
}
function validateBuildHumanConfirmation(confirmation, request, registry) {
  assertCanonical(confirmation, 'humanConfirmationRef', 'confirmation.build-admission', 'Build Admission human confirmation');
  exactBinding(confirmation, {
    contractRef: registry.authorityContract.humanConfirmationContractRef,
    state: registry.admissionContract.requiredHumanConfirmationState,
    buildRequestRef: request.buildRequestRef,
    buildRequestFingerprint: request.semanticFingerprint,
    workRef: request.workRef,
    claimRef: request.claimRef,
    mutationPath: request.mutationPath,
    repositoryRef: request.repositoryRef,
    branchRef: request.branchRef,
    currentness: 'CURRENT',
    externalEffectExactlyConfirmed: true,
    networkConfirmed: false,
    remoteGitConfirmed: false
  }, 'Build Admission human confirmation');
  return confirmation;
}

export function admitBuildRequest(request, input, { registry, authorityContext, workspaceRoot, repositoryPath }) {
  const source = registryOrThrow(registry);
  validateBuildRequest(request, { registry: source });
  const authority = validateSourceManagedBuildAuthority(input.schedulerAuthorityEvidence, { registry: source, authorityContext });
  exactBinding(authority, {
    schedulerAuthorityEvidenceRef: request.schedulerAuthorityEvidenceRef,
    semanticFingerprint: request.schedulerAuthorityEvidenceFingerprint,
    workRef: request.workRef,
    claimRef: request.claimRef,
    schedulerGeneration: request.schedulerGeneration,
    currentness: 'CURRENT'
  }, 'scheduler authority evidence');
  exactBinding(authority.schedulerAdmission, {
    admissionReceiptRef: request.schedulerAdmissionRef,
    semanticFingerprint: request.schedulerAdmissionFingerprint,
    graphRef: request.workgraphRef,
    graphFingerprint: request.workgraphFingerprint,
    workNodeRef: request.workNodeRef,
    nodeFingerprint: request.workNodeFingerprint,
    schedulerGeneration: request.schedulerGeneration,
    currentness: 'CURRENT',
    lifecycle: 'ACTIVE'
  }, 'scheduler admission');
  const repositoryEvidence = reobserveDisposableRepositoryEvidence(workspaceRoot, repositoryPath, input.repositoryEvidence, { mutationPath: request.mutationPath });
  exactBinding(repositoryEvidence, {
    repositoryEvidenceRef: request.repositoryEvidenceRef,
    semanticFingerprint: request.repositoryEvidenceFingerprint,
    repositoryRef: request.repositoryRef,
    headSha: request.expectedHeadSha,
    treeSha: request.expectedTreeSha,
    mutationBlobSha: request.expectedBeforeBlobSha,
    workingTree: 'CLEAN',
    branch: source.adapter.baselineBranch,
    remoteConfigured: false
  }, 'repository evidence');
  const humanConfirmation = validateBuildHumanConfirmation(input.humanConfirmation, request, source);
  if (input.runtimeRecoveryRouteRef !== request.returnRouteRef) throw new Error('Runtime Recovery return route mismatch');
  const leases = authority.leases;
  const core = {
    schemaVersion: source.admissionContract.schemaVersion,
    contractRef: source.admissionContract.contractRef,
    buildRequestRef: request.buildRequestRef,
    buildRequestFingerprint: request.semanticFingerprint,
    schedulerAdmissionRef: request.schedulerAdmissionRef,
    schedulerAdmissionFingerprint: request.schedulerAdmissionFingerprint,
    schedulerAuthorityEvidenceRef: authority.schedulerAuthorityEvidenceRef,
    schedulerAuthorityEvidenceFingerprint: authority.semanticFingerprint,
    schedulerGeneration: request.schedulerGeneration,
    workgraphRef: request.workgraphRef,
    workgraphFingerprint: request.workgraphFingerprint,
    workNodeRef: request.workNodeRef,
    workNodeFingerprint: request.workNodeFingerprint,
    occupancyRef: leases.occupancy.leaseRef,
    occupancyFingerprint: leases.occupancy.semanticFingerprint,
    capabilityLeaseRef: leases.capability.leaseRef,
    capabilityLeaseFingerprint: leases.capability.semanticFingerprint,
    effectLeaseRef: leases.effect.leaseRef,
    effectLeaseFingerprint: leases.effect.semanticFingerprint,
    resourceLeaseRef: leases.resource.leaseRef,
    resourceLeaseFingerprint: leases.resource.semanticFingerprint,
    workerLeaseRef: leases.worker.leaseRef,
    workerLeaseFingerprint: leases.worker.semanticFingerprint,
    contextLeaseRef: leases.context.leaseRef,
    contextLeaseFingerprint: leases.context.semanticFingerprint,
    repositoryEvidenceRef: request.repositoryEvidenceRef,
    repositoryEvidenceFingerprint: request.repositoryEvidenceFingerprint,
    concernWatchState: authority.concernWatchState,
    concernAggregateRef: authority.concernAggregate.aggregateRef,
    concernAggregateFingerprint: authority.concernAggregate.semanticFingerprint,
    runtimeRecoveryRouteRef: input.runtimeRecoveryRouteRef,
    humanConfirmationRef: humanConfirmation.humanConfirmationRef,
    humanConfirmationFingerprint: humanConfirmation.semanticFingerprint,
    authorityEvidence: clone(authority),
    repositoryEvidence: clone(repositoryEvidence),
    humanConfirmation: clone(humanConfirmation),
    formedAt: timestamp(input.formedAt, 'admission formedAt'),
    observedAt: timestamp(input.observedAt, 'admission observedAt'),
    expiresAt: timestamp(input.expiresAt, 'admission expiresAt'),
    currentness: 'CURRENT',
    externalEffectsAuthorized: true,
    networkAuthorized: false,
    remoteGitAuthorized: false
  };
  chronology(request.observedAt, core.formedAt, 'admission formation');
  chronology(core.formedAt, core.observedAt, 'admission observation');
  chronology(core.observedAt, core.expiresAt, 'admission expiry', true);
  return contentAddress(core, 'buildAdmissionRef', 'admission.build-admission');
}

export function validateBuildAdmission(admission, { request, registry, authorityContext }) {
  const source = registryOrThrow(registry);
  validateBuildRequest(request, { registry: source });
  assertCanonical(admission, 'buildAdmissionRef', 'admission.build-admission', 'build admission');
  const authority = validateSourceManagedBuildAuthority(admission.authorityEvidence, { registry: source, authorityContext });
  validateDisposableRepositoryEvidenceRecord(admission.repositoryEvidence, { mutationPath: request.mutationPath });
  validateBuildHumanConfirmation(admission.humanConfirmation, request, source);
  exactBinding(admission, {
    buildRequestRef: request.buildRequestRef,
    buildRequestFingerprint: request.semanticFingerprint,
    schedulerAdmissionRef: request.schedulerAdmissionRef,
    schedulerAdmissionFingerprint: request.schedulerAdmissionFingerprint,
    schedulerAuthorityEvidenceRef: request.schedulerAuthorityEvidenceRef,
    schedulerAuthorityEvidenceFingerprint: request.schedulerAuthorityEvidenceFingerprint,
    schedulerGeneration: request.schedulerGeneration,
    workgraphRef: request.workgraphRef,
    workgraphFingerprint: request.workgraphFingerprint,
    workNodeRef: request.workNodeRef,
    workNodeFingerprint: request.workNodeFingerprint,
    repositoryEvidenceRef: request.repositoryEvidenceRef,
    repositoryEvidenceFingerprint: request.repositoryEvidenceFingerprint,
    concernWatchState: 'CLEAR_OR_NON_BLOCKING',
    concernAggregateRef: authority.concernAggregate.aggregateRef,
    concernAggregateFingerprint: authority.concernAggregate.semanticFingerprint,
    runtimeRecoveryRouteRef: request.returnRouteRef,
    humanConfirmationRef: admission.humanConfirmation.humanConfirmationRef,
    humanConfirmationFingerprint: admission.humanConfirmation.semanticFingerprint,
    currentness: 'CURRENT',
    externalEffectsAuthorized: true,
    networkAuthorized: false,
    remoteGitAuthorized: false
  }, 'build admission');
  for (const [kind, refField, fingerprintField] of [
    ['occupancy','occupancyRef','occupancyFingerprint'],
    ['capability','capabilityLeaseRef','capabilityLeaseFingerprint'],
    ['effect','effectLeaseRef','effectLeaseFingerprint'],
    ['resource','resourceLeaseRef','resourceLeaseFingerprint'],
    ['worker','workerLeaseRef','workerLeaseFingerprint'],
    ['context','contextLeaseRef','contextLeaseFingerprint']
  ]) {
    if (admission[refField] !== authority.leases[kind].leaseRef || admission[fingerprintField] !== authority.leases[kind].semanticFingerprint) throw new Error(`build admission ${kind} lease lineage mismatch`);
  }
  return freeze(clone(admission));
}

function expectedRecoveryDisposition(failurePhase) {
  if (failurePhase === 'PRE_WRITE') return 'REPOSITORY_UNCHANGED';
  if (failurePhase === 'POST_WRITE_PRE_COMMIT') return 'BEFORE_IMAGE_RESTORED';
  if (failurePhase === 'ROLLBACK') return 'HELD_UNKNOWN';
  return 'DISPOSABLE_REPOSITORY_REMOVED';
}

export function validateBuildRecoveryReceipt(receipt, { request, admission, registry, authorityContext }) {
  const source = registryOrThrow(registry);
  validateBuildRequest(request, { registry: source });
  validateBuildAdmission(admission, { request, registry: source, authorityContext });
  assertCanonical(receipt, 'buildRecoveryRef', 'recovery.build-admission', 'build recovery receipt');
  if (receipt.schemaVersion !== source.recoveryContract.schemaVersion || receipt.contractRef !== source.recoveryContract.contractRef) {
    throw new Error('build recovery source contract mismatch');
  }
  if (!source.recoveryContract.failurePhases.includes(receipt.failurePhase)) throw new Error('build recovery failure phase is not registered');
  if (!source.recoveryContract.dispositions.includes(receipt.disposition)) throw new Error('build recovery disposition is not registered');
  exactBinding(receipt, {
    buildRequestRef: request.buildRequestRef,
    buildRequestFingerprint: request.semanticFingerprint,
    buildAdmissionRef: admission.buildAdmissionRef,
    buildAdmissionFingerprint: admission.semanticFingerprint,
    repositoryEvidenceRef: request.repositoryEvidenceRef,
    repositoryEvidenceFingerprint: request.repositoryEvidenceFingerprint,
    retryAuthorityGranted: source.recoveryContract.retryAuthorityGranted,
    concernWatchObservationRequired: source.recoveryContract.concernWatchObservationRequired
  }, 'build recovery receipt');
  if (admission.repositoryEvidenceRef !== receipt.repositoryEvidenceRef || admission.repositoryEvidenceFingerprint !== receipt.repositoryEvidenceFingerprint) {
    throw new Error('build recovery repository evidence lineage mismatch');
  }
  requireString(receipt.errorClass, 'build recovery errorClass');
  requireSha256(receipt.errorFingerprint, 'build recovery errorFingerprint');
  if (receipt.rollbackAttempted !== true || typeof receipt.rollbackSucceeded !== 'boolean' || typeof receipt.humanAttentionRequired !== 'boolean') {
    throw new Error('build recovery rollback semantics are incomplete');
  }
  const expectedDisposition = expectedRecoveryDisposition(receipt.failurePhase);
  if (receipt.rollbackSucceeded) {
    if (receipt.humanAttentionRequired || receipt.disposition !== expectedDisposition) throw new Error('build recovery successful rollback disposition mismatch');
  } else {
    if (!receipt.humanAttentionRequired || !['HELD_UNKNOWN', 'HUMAN_ATTENTION_REQUIRED'].includes(receipt.disposition)) {
      throw new Error('build recovery failed rollback must require human attention');
    }
  }
  if (receipt.failurePhase === 'ROLLBACK' && receipt.rollbackSucceeded) throw new Error('ROLLBACK failure cannot claim successful rollback');
  if (source.recoveryContract.humanRequestRequiredOnRollbackFailure && !receipt.rollbackSucceeded && !receipt.humanAttentionRequired) {
    throw new Error('build recovery rollback failure lacks required human attention');
  }
  chronology(receipt.formedAt, receipt.completedAt, 'build recovery');
  return freeze(clone(receipt));
}

function formBuildRecoveryCase({ request, admission, recoveryReceipt }) {
  return contentAddress({
    schemaVersion: 'vexlife.build-admission-recovery-case/v1',
    contractRef: 'contract.vexlife.build-admission-recovery-case/v1',
    failurePhase: recoveryReceipt.failurePhase,
    buildRequestRef: request.buildRequestRef,
    buildRequestFingerprint: request.semanticFingerprint,
    buildAdmissionRef: admission.buildAdmissionRef,
    buildAdmissionFingerprint: admission.semanticFingerprint,
    buildRecoveryRef: recoveryReceipt.buildRecoveryRef,
    buildRecoveryFingerprint: recoveryReceipt.semanticFingerprint,
    request: clone(request),
    admission: clone(admission),
    recoveryReceipt: clone(recoveryReceipt)
  }, 'recoveryCaseRef', 'case.build-admission.recovery');
}

function createValidatedBuildRecoveryCase(input, { registry, authorityContext }) {
  const request = validateBuildRequest(requireObject(input.request, 'recovery case request'), { registry });
  const admission = validateBuildAdmission(requireObject(input.admission, 'recovery case admission'), { request, registry, authorityContext });
  const recoveryReceipt = validateBuildRecoveryReceipt(requireObject(input.recoveryReceipt, 'recovery case receipt'), {
    request, admission, registry, authorityContext
  });
  return formBuildRecoveryCase({ request, admission, recoveryReceipt });
}

function validateBuildRecoveryCase(recoveryCase, { registry, authorityContext }) {
  assertCanonical(recoveryCase, 'recoveryCaseRef', 'case.build-admission.recovery', 'Build Admission recovery case');
  const expected = createValidatedBuildRecoveryCase(recoveryCase, { registry, authorityContext });
  if (semanticHash(expected) !== semanticHash(recoveryCase)) throw new Error('Build Admission recovery case is stale, detached, or re-addressed');
  return freeze(clone(recoveryCase));
}

export function verifyRealBuildEffect({ effectReceipt, request, admission, workspaceRoot, repositoryPath, consumedAt, schedulerObservedAt }, { registry, authorityContext }) {
  const source = registryOrThrow(registry);
  validateBuildAdmission(admission, { request, registry: source, authorityContext });
  const effect = validateBuildEffectReceipt(effectReceipt, { request, admission, workspaceRoot, repositoryPath, registry: source });
  timestamp(consumedAt, 'completion consumedAt');
  timestamp(schedulerObservedAt, 'schedulerObservedAt');
  chronology(effect.observedAt, consumedAt, 'completion consumption');
  chronology(schedulerObservedAt, consumedAt, 'scheduler clock consumption');
  if (Date.parse(consumedAt) >= Date.parse(request.expiresAt) || Date.parse(consumedAt) >= Date.parse(admission.expiresAt)) throw new Error('real effect completion evidence expired before consumption');
  const gateResultReceipts = request.completionGateRefs.map((completionGateRef) => contentAddress({
    schemaVersion: 'vexlife.real-effect-completion-gate/v1',
    completionGateRef,
    result: 'PASSED',
    sourceObservationRef: effect.buildEffectReceiptRef,
    sourceObservationHash: effect.semanticFingerprint,
    commitSha: effect.commitSha,
    commitTreeSha: effect.commitTreeSha,
    afterBlobSha: effect.afterBlobSha,
    diffFingerprint: effect.diffFingerprint,
    observedAt: effect.observedAt
  }, 'gateResultRef', 'gate-result.build-admission'));
  const core = {
    schemaVersion: source.completionContract.schemaVersion,
    contractRef: source.completionContract.contractRef,
    evidenceClass: source.completionContract.evidenceClass,
    buildRequestRef: request.buildRequestRef,
    buildRequestFingerprint: request.semanticFingerprint,
    buildAdmissionRef: admission.buildAdmissionRef,
    buildAdmissionFingerprint: admission.semanticFingerprint,
    buildEffectReceiptRef: effect.buildEffectReceiptRef,
    buildEffectReceiptFingerprint: effect.semanticFingerprint,
    workNodeRef: request.workNodeRef,
    workNodeFingerprint: request.workNodeFingerprint,
    workgraphRef: request.workgraphRef,
    workgraphFingerprint: request.workgraphFingerprint,
    schedulerAdmissionRef: request.schedulerAdmissionRef,
    schedulerAdmissionFingerprint: request.schedulerAdmissionFingerprint,
    schedulerGeneration: request.schedulerGeneration,
    expectedTransitionRef: request.expectedTransitionRef,
    completionGateRefs: clone(request.completionGateRefs),
    gateResultReceipts,
    observedBeforeState: 'VERIFYING',
    observedAfterState: 'COMPLETED',
    commitSha: effect.commitSha,
    commitParentSha: effect.commitParentSha,
    commitTreeSha: effect.commitTreeSha,
    beforeBlobSha: effect.beforeBlobSha,
    afterBlobSha: effect.afterBlobSha,
    changedPaths: clone(effect.changedPaths),
    diffFingerprint: effect.diffFingerprint,
    externalEffectsExecuted: true,
    deterministicFakeEvidence: false,
    selfCertified: false,
    currentness: 'CURRENT',
    formedAt: effect.formedAt,
    observedAt: effect.observedAt,
    consumedAt,
    schedulerObservedAt
  };
  return contentAddress(core, 'realEffectVerificationRef', 'verification.real-effect');
}

function reconstructRealBuildEffectVerification(verification, { effectReceipt, request, admission, registry, authorityContext }) {
  const source = registryOrThrow(registry);
  validateBuildAdmission(admission, { request, registry: source, authorityContext });
  validateBuildEffectReceiptRecord(effectReceipt, { request, admission, registry: source });
  const gateResultReceipts = request.completionGateRefs.map((completionGateRef) => contentAddress({
    schemaVersion: 'vexlife.real-effect-completion-gate/v1', completionGateRef, result: 'PASSED',
    sourceObservationRef: effectReceipt.buildEffectReceiptRef, sourceObservationHash: effectReceipt.semanticFingerprint,
    commitSha: effectReceipt.commitSha, commitTreeSha: effectReceipt.commitTreeSha, afterBlobSha: effectReceipt.afterBlobSha,
    diffFingerprint: effectReceipt.diffFingerprint, observedAt: effectReceipt.observedAt
  }, 'gateResultRef', 'gate-result.build-admission'));
  return contentAddress({
    schemaVersion: source.completionContract.schemaVersion,
    contractRef: source.completionContract.contractRef,
    evidenceClass: source.completionContract.evidenceClass,
    buildRequestRef: request.buildRequestRef,
    buildRequestFingerprint: request.semanticFingerprint,
    buildAdmissionRef: admission.buildAdmissionRef,
    buildAdmissionFingerprint: admission.semanticFingerprint,
    buildEffectReceiptRef: effectReceipt.buildEffectReceiptRef,
    buildEffectReceiptFingerprint: effectReceipt.semanticFingerprint,
    workNodeRef: request.workNodeRef,
    workNodeFingerprint: request.workNodeFingerprint,
    workgraphRef: request.workgraphRef,
    workgraphFingerprint: request.workgraphFingerprint,
    schedulerAdmissionRef: request.schedulerAdmissionRef,
    schedulerAdmissionFingerprint: request.schedulerAdmissionFingerprint,
    schedulerGeneration: request.schedulerGeneration,
    expectedTransitionRef: request.expectedTransitionRef,
    completionGateRefs: clone(request.completionGateRefs),
    gateResultReceipts,
    observedBeforeState: 'VERIFYING',
    observedAfterState: 'COMPLETED',
    commitSha: effectReceipt.commitSha,
    commitParentSha: effectReceipt.commitParentSha,
    commitTreeSha: effectReceipt.commitTreeSha,
    beforeBlobSha: effectReceipt.beforeBlobSha,
    afterBlobSha: effectReceipt.afterBlobSha,
    changedPaths: clone(effectReceipt.changedPaths),
    diffFingerprint: effectReceipt.diffFingerprint,
    externalEffectsExecuted: true,
    deterministicFakeEvidence: false,
    selfCertified: false,
    currentness: 'CURRENT',
    formedAt: effectReceipt.formedAt,
    observedAt: effectReceipt.observedAt,
    consumedAt: verification.consumedAt,
    schedulerObservedAt: verification.schedulerObservedAt
  }, 'realEffectVerificationRef', 'verification.real-effect');
}

export function validateRealBuildEffectVerification(verification, { effectReceipt, request, admission, registry, authorityContext }) {
  assertCanonical(verification, 'realEffectVerificationRef', 'verification.real-effect', 'real effect verification');
  const expected = reconstructRealBuildEffectVerification(verification, { effectReceipt, request, admission, registry, authorityContext });
  if (semanticHash(expected) !== semanticHash(verification)) throw new Error('real effect completion verification is stale or substituted');
  return freeze(clone(verification));
}

export function createBuildConcernObservation(recoveryReceipt, { observedAt }, { registry, request, admission, authorityContext }) {
  const source = registryOrThrow(registry);
  validateBuildRecoveryReceipt(recoveryReceipt, { request, admission, registry: source, authorityContext });
  const observationTime = timestamp(observedAt, 'concern observedAt');
  chronology(recoveryReceipt.completedAt, observationTime, 'recovery concern observation');
  return contentAddress({
    schemaVersion: 'vexlife.build-admission-concern-observation/v1',
    contractRef: 'contract.vexlife.build-admission-concern-observation/v1',
    sourceRef: recoveryReceipt.buildRecoveryRef,
    sourceFingerprint: recoveryReceipt.semanticFingerprint,
    buildRequestRef: request.buildRequestRef,
    buildRequestFingerprint: request.semanticFingerprint,
    buildAdmissionRef: admission.buildAdmissionRef,
    buildAdmissionFingerprint: admission.semanticFingerprint,
    repositoryEvidenceRef: recoveryReceipt.repositoryEvidenceRef,
    repositoryEvidenceFingerprint: recoveryReceipt.repositoryEvidenceFingerprint,
    sourceRangeOrEventRef: `failure-phase.${recoveryReceipt.failurePhase}`,
    failurePhase: recoveryReceipt.failurePhase,
    disposition: recoveryReceipt.disposition,
    rollbackSucceeded: recoveryReceipt.rollbackSucceeded,
    humanAttentionRequired: recoveryReceipt.humanAttentionRequired,
    concernClass: recoveryReceipt.humanAttentionRequired ? 'SAFETY_OR_INTEGRITY' : 'RECOVERY_HOLD',
    signalClass: 'RECOVERY_HOLD',
    certaintyClass: 'VERIFIED',
    impactClass: recoveryReceipt.humanAttentionRequired ? 'HIGH' : 'MEDIUM',
    evidenceOriginClass: 'RECOVERY_SYSTEM',
    retryAuthorityGranted: false,
    currentness: 'CURRENT',
    observedAt: observationTime
  }, 'concernObservationRef', 'observation.build-admission');
}

function validateIntegratedRecoveryConcernEvidence(input, { registry, authorityContext, addressedCases = false }) {
  const source = registryOrThrow(registry);
  const phaseOrder = new Map(source.recoveryContract.failurePhases.map((phase, index) => [phase, index]));
  const cases = (input.failureRecoveryCases ?? []).map((recoveryCase) => addressedCases
    ? validateBuildRecoveryCase(recoveryCase, { registry: source, authorityContext })
    : createValidatedBuildRecoveryCase(recoveryCase, { registry: source, authorityContext }));
  if (cases.length !== source.recoveryContract.failurePhases.length) throw new Error('integrated recovery cases must cover every registered failure phase exactly once');
  const phases = cases.map((recoveryCase) => recoveryCase.failurePhase);
  if (new Set(phases).size !== phases.length || semanticHash([...phases].sort()) !== semanticHash([...source.recoveryContract.failurePhases].sort())) {
    throw new Error('integrated recovery phase coverage contains duplicates or omissions');
  }
  const sortedCases = [...cases].sort((a, b) => phaseOrder.get(a.failurePhase) - phaseOrder.get(b.failurePhase));
  const suppliedProofs = input.failureRecoveryProofs ?? sortedCases.map((recoveryCase) => recoveryCase.recoveryReceipt);
  if (suppliedProofs.length !== sortedCases.length || suppliedProofs.some((proof, index) => semanticHash(proof) !== semanticHash(sortedCases[index].recoveryReceipt))) {
    throw new Error('integrated recovery proof inventory is detached from exact source cases');
  }
  const observations = (input.concernObservations ?? []).map((observation) => {
    assertCanonical(observation, 'concernObservationRef', 'observation.build-admission', 'integrated concern observation');
    return clone(observation);
  });
  if (observations.length !== sortedCases.length || new Set(observations.map((observation) => observation.sourceRef)).size !== observations.length) {
    throw new Error('integrated ConcernWatch observations must be one-to-one with recovery cases');
  }
  const reconstructedObservations = [];
  for (const recoveryCase of sortedCases) {
    const matches = observations.filter((observation) => observation.sourceRef === recoveryCase.recoveryReceipt.buildRecoveryRef);
    if (matches.length !== 1) throw new Error(`integrated ConcernWatch lineage mismatch for ${recoveryCase.failurePhase}`);
    const actual = matches[0];
    const expected = createBuildConcernObservation(recoveryCase.recoveryReceipt, { observedAt: actual.observedAt }, {
      registry: source,
      request: recoveryCase.request,
      admission: recoveryCase.admission,
      authorityContext
    });
    if (semanticHash(expected) !== semanticHash(actual)) throw new Error(`integrated ConcernWatch observation does not reconstruct for ${recoveryCase.failurePhase}`);
    reconstructedObservations.push(expected);
  }
  return {
    failureRecoveryCases: sortedCases.map(clone),
    failureRecoveryProofs: sortedCases.map((recoveryCase) => clone(recoveryCase.recoveryReceipt)),
    concernObservations: reconstructedObservations.map(clone)
  };
}

function releaseSet(request, admission, verification, closedAt, registry) {
  const releases = [];
  const claimCore = {
    schemaVersion: registry.releaseContract.schemaVersion,
    contractRef: registry.releaseContract.contractRef,
    kind: 'CLAIM',
    claimRef: request.claimRef,
    occupancyRef: admission.occupancyRef,
    schedulerGeneration: admission.schedulerGeneration,
    buildRequestRef: request.buildRequestRef,
    buildAdmissionRef: admission.buildAdmissionRef,
    realEffectVerificationRef: verification.realEffectVerificationRef,
    priorClaimFingerprint: admission.authorityEvidence.pathClaimFingerprint,
    schedulerAuthorityEvidenceFingerprint: admission.schedulerAuthorityEvidenceFingerprint,
    lifecycle: 'RELEASED',
    currentness: 'CURRENT',
    released: true,
    releasedAt: closedAt,
    reason: 'REAL_LOCAL_GIT_EFFECT_VERIFIED'
  };
  releases.push(contentAddress(claimCore, 'releaseRef', 'release.build-admission.claim'));
  const leases = admission.authorityEvidence.leases;
  for (const [kind, lease] of Object.entries(leases)) {
    const label = kind.toUpperCase();
    const transition = transitionLease(lease, {
      lifecycle: 'RELEASED',
      receiptRef: `release.build-admission.${label.toLowerCase()}.${lease.semanticFingerprint.slice(0, 24)}`,
      transitionedAt: closedAt,
      reason: 'REAL_LOCAL_GIT_EFFECT_VERIFIED'
    });
    releases.push(contentAddress({
      schemaVersion: registry.releaseContract.schemaVersion,
      contractRef: registry.releaseContract.contractRef,
      kind: label,
      leaseRef: lease.leaseRef,
      priorLeaseFingerprint: lease.semanticFingerprint,
      transitionedLeaseFingerprint: transition.lease.semanticFingerprint,
      schedulerTransitionReceiptRef: transition.receipt.receiptRef,
      schedulerTransitionReceiptFingerprint: transition.receipt.semanticFingerprint,
      schedulerGeneration: admission.schedulerGeneration,
      workNodeRef: request.workNodeRef,
      claimRef: request.claimRef,
      buildRequestRef: request.buildRequestRef,
      buildAdmissionRef: admission.buildAdmissionRef,
      realEffectVerificationRef: verification.realEffectVerificationRef,
      lifecycle: 'RELEASED',
      currentness: 'CURRENT',
      released: true,
      releasedAt: closedAt,
      reason: 'REAL_LOCAL_GIT_EFFECT_VERIFIED'
    }, 'releaseRef', `release.build-admission.${kind}`));
  }
  return releases.sort((a, b) => a.kind.localeCompare(b.kind));
}

export function createBuildClosure({ request, admission, effectReceipt, verification, closedAt }, { registry, authorityContext }) {
  const source = registryOrThrow(registry);
  validateBuildAdmission(admission, { request, registry: source, authorityContext });
  validateBuildEffectReceiptRecord(effectReceipt, { request, admission, registry: source });
  validateRealBuildEffectVerification(verification, { effectReceipt, request, admission, registry: source, authorityContext });
  return createBuildClosureUnchecked({ request, admission, verification, closedAt }, { registry: source, authorityContext });
}

function validateBuildClosure(closure, { request, admission, verification, registry, authorityContext }) {
  assertCanonical(closure, 'buildClosureRef', 'closure.build-admission', 'Build Admission closure');
  const expected = createBuildClosureUnchecked({ request, admission, verification, closedAt: closure.closedAt }, { registry, authorityContext });
  if (semanticHash(expected) !== semanticHash(closure)) throw new Error('Build Admission closure is stale, caller-released, or re-addressed');
  return closure;
}

function createBuildClosureUnchecked({ request, admission, verification, closedAt }, { registry, authorityContext }) {
  // Same deterministic formation as createBuildClosure, without live effect validation recursion.
  const source = registryOrThrow(registry);
  validateBuildAdmission(admission, { request, registry: source, authorityContext });
  if (verification.buildRequestRef !== request.buildRequestRef || verification.buildAdmissionRef !== admission.buildAdmissionRef || verification.currentness !== 'CURRENT') throw new Error('closure verification lineage mismatch');
  const closeTime = timestamp(closedAt, 'closedAt');
  chronology(verification.consumedAt, closeTime, 'closure');
  if (!transitionAllowed('VERIFYING', 'COMPLETED', authorityContext.intentRegistry)) throw new Error('accepted Intent transition validator rejects VERIFYING -> COMPLETED');
  const releaseReceipts = releaseSet(request, admission, verification, closeTime, source);
  const completionEvidenceLineage = contentAddress({
    schemaVersion: 'vexlife.build-admission-completion-evidence-lineage/v1', realEffectVerificationRef: verification.realEffectVerificationRef,
    realEffectVerificationFingerprint: verification.semanticFingerprint, buildEffectReceiptRef: verification.buildEffectReceiptRef,
    buildEffectReceiptFingerprint: verification.buildEffectReceiptFingerprint,
    gateEvidence: verification.gateResultReceipts.map((gate) => ({ completionGateRef: gate.completionGateRef, gateResultRef: gate.gateResultRef, gateResultFingerprint: gate.semanticFingerprint, sourceObservationRef: gate.sourceObservationRef, sourceObservationHash: gate.sourceObservationHash })).sort((a,b)=>a.completionGateRef.localeCompare(b.completionGateRef))
  }, 'lineageRef', 'lineage.build-admission.completion');
  const workgraphTransition = contentAddress({
    schemaVersion: 'vexlife.intent-transition/v1', transitionRef: request.expectedTransitionRef, workNodeRef: request.workNodeRef,
    nodeFingerprint: request.workNodeFingerprint, graphRef: request.workgraphRef, graphFingerprint: request.workgraphFingerprint,
    priorState: 'VERIFYING', nextState: 'COMPLETED', reason: 'REAL_LOCAL_GIT_EFFECT_VERIFIED',
    sourceRefs: [verification.realEffectVerificationRef, verification.buildEffectReceiptRef, ...verification.gateResultReceipts.map((gate)=>gate.gateResultRef)],
    completionEvidenceLineage: clone(completionEvidenceLineage), createdAt: closeTime
  }, 'workgraphTransitionReceiptRef', 'transition.build-admission.completed');
  const intentCompletionReceipt = contentAddress({
    schemaVersion: 'vexlife.intent-receipt/v1', workNodeRef: request.workNodeRef, expectedTransitionRef: request.expectedTransitionRef,
    nodeSemanticFingerprint: request.workNodeFingerprint, disposition: 'COMPLETED', sourceState: 'COMPLETED', state: 'PROVEN', currentness: 'CURRENT',
    sourceRefs: workgraphTransition.sourceRefs, sourceHashes: [verification.semanticFingerprint, verification.buildEffectReceiptFingerprint, ...verification.gateResultReceipts.map((gate)=>gate.semanticFingerprint)],
    completionEvidenceLineage: clone(completionEvidenceLineage), formedAt: closeTime
  }, 'intentCompletionReceiptRef', 'receipt.intent.build-admission.completed');
  return contentAddress({
    schemaVersion: 'vexlife.build-admission-closure/v1', contractRef: 'contract.vexlife.build-admission-closure/v1',
    buildRequestRef: request.buildRequestRef, buildRequestFingerprint: request.semanticFingerprint,
    buildAdmissionRef: admission.buildAdmissionRef, buildAdmissionFingerprint: admission.semanticFingerprint,
    realEffectVerificationRef: verification.realEffectVerificationRef, realEffectVerificationFingerprint: verification.semanticFingerprint,
    completionEvidenceLineage: clone(completionEvidenceLineage), workgraphTransition: clone(workgraphTransition), intentCompletionReceipt: clone(intentCompletionReceipt),
    canonicalWorkNodeFinalState: 'COMPLETED', claimRef: request.claimRef, releaseReceipts, claimReleased: true, sixLeasesReleased: true,
    queuePriorityRemoved: true, activeProjectionRemoved: true, historyRetained: true, schedulerGeneration: admission.schedulerGeneration, closedAt: closeTime
  }, 'buildClosureRef', 'closure.build-admission');
}

export function projectBuildAdmission({ request, admission, effectReceipt, verification, closure, recoveryReceipt = null }, { registry }) {
  const source = registryOrThrow(registry);
  const closed = Boolean(closure);
  const held = recoveryReceipt?.disposition === 'HELD_UNKNOWN';
  return contentAddress({
    schemaVersion: source.projectionContract.schemaVersion,
    sourceRequestRef: request.buildRequestRef,
    sourceRequestFingerprint: request.semanticFingerprint,
    sourceAdmissionRef: admission.buildAdmissionRef,
    sourceAdmissionFingerprint: admission.semanticFingerprint,
    sourceEffectRef: effectReceipt?.buildEffectReceiptRef ?? null,
    sourceEffectFingerprint: effectReceipt?.semanticFingerprint ?? null,
    sourceVerificationRef: verification?.realEffectVerificationRef ?? null,
    sourceVerificationFingerprint: verification?.semanticFingerprint ?? null,
    sourceClosureRef: closure?.buildClosureRef ?? null,
    sourceClosureFingerprint: closure?.semanticFingerprint ?? null,
    sourceRecoveryRef: recoveryReceipt?.buildRecoveryRef ?? null,
    sourceRecoveryFingerprint: recoveryReceipt?.semanticFingerprint ?? null,
    views: {
      QUEUE: closed ? null : { workNodeRef: request.workNodeRef, state: held ? 'HELD_UNKNOWN' : 'ACTIVE' },
      TERRAIN: closed ? null : { workNodeRef: request.workNodeRef, effectScope: source.adapter.effectScope },
      HEALTH: { state: closed ? 'CLEAR' : held ? 'ATTENTION' : 'ACTIVE', currentness: 'CURRENT' },
      GUIDE: closed ? null : held ? { action: 'RETURN_TO_RUNTIME_RECOVERY', returnRouteRef: request.returnRouteRef } : { action: 'CONTINUE_BOUNDED_EFFECT' }
    },
    stateTransition: { priorRef: request.buildRequestRef, nextRef: recoveryReceipt?.buildRecoveryRef ?? verification?.realEffectVerificationRef ?? effectReceipt?.buildEffectReceiptRef ?? admission.buildAdmissionRef },
    commitSha: effectReceipt?.commitSha ?? null,
    realEffectVerificationRef: verification?.realEffectVerificationRef ?? null,
    closureRef: closure?.buildClosureRef ?? null,
    rawDiffIncluded: false,
    credentialsIncluded: false
  }, 'projectionRef', 'projection.build-admission');
}

export function createIntegratedBuildAdmissionReceipt(input, { registry, authorityContext }) {
  const source = registryOrThrow(registry);
  if (semanticHash(input.journeyStates) !== semanticHash(source.simulationContract.requiredJourneyStates)) throw new Error('integrated Build Admission journey is incomplete');
  validateBuildRequest(input.request, { registry: source });
  validateBuildAdmission(input.admission, { request: input.request, registry: source, authorityContext });
  validateBuildEffectReceiptRecord(input.effectReceipt, { request: input.request, admission: input.admission, registry: source });
  validateRealBuildEffectVerification(input.verification, { effectReceipt: input.effectReceipt, request: input.request, admission: input.admission, registry: source, authorityContext });
  validateBuildClosure(input.closure, { request: input.request, admission: input.admission, verification: input.verification, registry: source, authorityContext });
  const expectedProjection = projectBuildAdmission({ request: input.request, admission: input.admission, effectReceipt: input.effectReceipt, verification: input.verification, closure: input.closure }, { registry: source });
  if (semanticHash(expectedProjection) !== semanticHash(input.projection)) throw new Error('integrated projection is not reconstructed from exact closure');
  const recoveryConcern = validateIntegratedRecoveryConcernEvidence(input, { registry: source, authorityContext, addressedCases: false });
  return contentAddress({
    schemaVersion: source.simulationContract.schemaVersion,
    contractRef: source.simulationContract.contractRef,
    state: 'PASS',
    currentness: 'CURRENT',
    candidateHeadSha: input.candidateHeadSha ?? null,
    testedCheckoutSha: input.testedCheckoutSha ?? null,
    testedMergeSha: input.testedMergeSha ?? null,
    baseSha: input.baseSha ?? null,
    sourceTreeSha256: requireSha256(input.sourceTreeSha256, 'sourceTreeSha256'),
    blueprintHash: requireSha256(input.blueprintHash, 'blueprintHash'),
    journeyStates: clone(input.journeyStates),
    proofRefs: clone(source.simulationContract.proofRefs),
    buildRequestRef: input.request.buildRequestRef,
    buildRequestFingerprint: input.request.semanticFingerprint,
    buildAdmissionRef: input.admission.buildAdmissionRef,
    buildAdmissionFingerprint: input.admission.semanticFingerprint,
    buildEffectReceiptRef: input.effectReceipt.buildEffectReceiptRef,
    buildEffectReceiptFingerprint: input.effectReceipt.semanticFingerprint,
    realEffectVerificationRef: input.verification.realEffectVerificationRef,
    realEffectVerificationFingerprint: input.verification.semanticFingerprint,
    buildClosureRef: input.closure.buildClosureRef,
    buildClosureFingerprint: input.closure.semanticFingerprint,
    workgraphTransitionReceiptRef: input.closure.workgraphTransition.workgraphTransitionReceiptRef,
    workgraphTransitionFingerprint: input.closure.workgraphTransition.semanticFingerprint,
    intentCompletionReceiptRef: input.closure.intentCompletionReceipt.intentCompletionReceiptRef,
    intentCompletionFingerprint: input.closure.intentCompletionReceipt.semanticFingerprint,
    canonicalWorkNodeFinalState: input.closure.canonicalWorkNodeFinalState,
    projectionRef: input.projection.projectionRef,
    projectionFingerprint: input.projection.semanticFingerprint,
    commitSha: input.effectReceipt.commitSha,
    commitParentSha: input.effectReceipt.commitParentSha,
    commitTreeSha: input.effectReceipt.commitTreeSha,
    beforeBlobSha: input.effectReceipt.beforeBlobSha,
    afterBlobSha: input.effectReceipt.afterBlobSha,
    diffFingerprint: input.effectReceipt.diffFingerprint,
    changedPaths: clone(input.effectReceipt.changedPaths),
    externalEffectsExecuted: true,
    effectScope: source.adapter.effectScope,
    networkUsed: false,
    remoteConfigured: false,
    implementationCheckoutMutated: false,
    duplicateReplayCreatedSecondCommit: false,
    failureRecoveryCaseRefs: recoveryConcern.failureRecoveryCases.map((recoveryCase) => recoveryCase.recoveryCaseRef),
    failureRecoveryProofRefs: recoveryConcern.failureRecoveryProofs.map((recovery) => recovery.buildRecoveryRef),
    concernObservationRefs: recoveryConcern.concernObservations.map((observation) => observation.concernObservationRef),
    claimReleased: input.closure.claimReleased,
    sixLeasesReleased: input.closure.sixLeasesReleased,
    causalEvidence: {
      request: clone(input.request),
      admission: clone(input.admission),
      effectReceipt: clone(input.effectReceipt),
      verification: clone(input.verification),
      closure: clone(input.closure),
      projection: clone(input.projection),
      failureRecoveryCases: recoveryConcern.failureRecoveryCases,
      failureRecoveryProofs: recoveryConcern.failureRecoveryProofs,
      concernObservations: recoveryConcern.concernObservations
    }
  }, 'receiptRef', 'receipt.build-admission.integrated');
}

export function validateIntegratedBuildAdmissionReceipt(receipt, { registry, authorityContext }) {
  const source = registryOrThrow(registry);
  const errors = [];
  try {
    assertCanonical(receipt, 'receiptRef', 'receipt.build-admission.integrated', 'integrated Build Admission receipt');
    if (receipt.state !== 'PASS' || receipt.currentness !== 'CURRENT' || receipt.externalEffectsExecuted !== true || receipt.effectScope !== source.adapter.effectScope || receipt.networkUsed !== false || receipt.remoteConfigured !== false || receipt.implementationCheckoutMutated !== false || receipt.duplicateReplayCreatedSecondCommit !== false || receipt.claimReleased !== true || receipt.sixLeasesReleased !== true || receipt.canonicalWorkNodeFinalState !== 'COMPLETED') throw new Error('integrated boundary mismatch');
    if (semanticHash(receipt.journeyStates) !== semanticHash(source.simulationContract.requiredJourneyStates) || semanticHash(receipt.proofRefs) !== semanticHash(source.simulationContract.proofRefs)) throw new Error('integrated coverage mismatch');
    const e = requireObject(receipt.causalEvidence, 'integrated causal evidence');
    validateBuildRequest(e.request, { registry: source });
    validateBuildAdmission(e.admission, { request: e.request, registry: source, authorityContext });
    validateBuildEffectReceiptRecord(e.effectReceipt, { request: e.request, admission: e.admission, registry: source });
    validateRealBuildEffectVerification(e.verification, { effectReceipt: e.effectReceipt, request: e.request, admission: e.admission, registry: source, authorityContext });
    validateBuildClosure(e.closure, { request: e.request, admission: e.admission, verification: e.verification, registry: source, authorityContext });
    const projection = projectBuildAdmission({ request: e.request, admission: e.admission, effectReceipt: e.effectReceipt, verification: e.verification, closure: e.closure }, { registry: source });
    if (semanticHash(projection) !== semanticHash(e.projection)) throw new Error('integrated projection reconstruction mismatch');
    const recoveryConcern = validateIntegratedRecoveryConcernEvidence({
      failureRecoveryCases: e.failureRecoveryCases,
      failureRecoveryProofs: e.failureRecoveryProofs,
      concernObservations: e.concernObservations
    }, { registry: source, authorityContext, addressedCases: true });
    exactBinding(receipt, {
      buildRequestRef: e.request.buildRequestRef,
      buildRequestFingerprint: e.request.semanticFingerprint,
      buildAdmissionRef: e.admission.buildAdmissionRef,
      buildAdmissionFingerprint: e.admission.semanticFingerprint,
      buildEffectReceiptRef: e.effectReceipt.buildEffectReceiptRef,
      buildEffectReceiptFingerprint: e.effectReceipt.semanticFingerprint,
      realEffectVerificationRef: e.verification.realEffectVerificationRef,
      realEffectVerificationFingerprint: e.verification.semanticFingerprint,
      buildClosureRef: e.closure.buildClosureRef,
      buildClosureFingerprint: e.closure.semanticFingerprint,
      projectionRef: e.projection.projectionRef,
      projectionFingerprint: e.projection.semanticFingerprint,
      commitSha: e.effectReceipt.commitSha,
      commitParentSha: e.effectReceipt.commitParentSha,
      commitTreeSha: e.effectReceipt.commitTreeSha,
      beforeBlobSha: e.effectReceipt.beforeBlobSha,
      afterBlobSha: e.effectReceipt.afterBlobSha,
      diffFingerprint: e.effectReceipt.diffFingerprint
    }, 'integrated receipt');
    if (
      semanticHash(receipt.changedPaths) !== semanticHash(e.effectReceipt.changedPaths) ||
      semanticHash(receipt.failureRecoveryCaseRefs) !== semanticHash(recoveryConcern.failureRecoveryCases.map((recoveryCase) => recoveryCase.recoveryCaseRef)) ||
      semanticHash(receipt.failureRecoveryProofRefs) !== semanticHash(recoveryConcern.failureRecoveryProofs.map((recovery) => recovery.buildRecoveryRef)) ||
      semanticHash(receipt.concernObservationRefs) !== semanticHash(recoveryConcern.concernObservations.map((observation) => observation.concernObservationRef))
    ) throw new Error('integrated nested recovery/ConcernWatch inventory mismatch');
  } catch (error) { errors.push(error.message); }
  return { ok: errors.length === 0, state: errors.length ? 'INVALID' : 'EXECUTED_CURRENT', errors };
}

export function createBuildAdmissionConsumptionReceipt(integratedReceipt, consumerRef, { observedAt }, { registry, authorityContext }) {
  const source = registryOrThrow(registry);
  const validation = validateIntegratedBuildAdmissionReceipt(integratedReceipt, { registry: source, authorityContext });
  if (!validation.ok) throw new Error(`invalid integrated Build Admission receipt: ${validation.errors.join('; ')}`);
  if (!source.simulationContract.consumerRefs.includes(consumerRef)) throw new Error('unknown Build Admission consumer');
  return contentAddress({
    schemaVersion: 'vexlife.build-admission-consumption/v1',
    contractRef: 'contract.vexlife.build-admission-consumption/v1',
    consumerRef,
    integratedReceiptRef: integratedReceipt.receiptRef,
    integratedReceiptFingerprint: integratedReceipt.semanticFingerprint,
    integratedState: integratedReceipt.state,
    integratedCurrentness: integratedReceipt.currentness,
    canonicalCommitSha: integratedReceipt.commitSha,
    observedAt: timestamp(observedAt, 'consumption observedAt'),
    admitted: true,
    effectJourneyRerun: false
  }, 'consumptionReceiptRef', `consumption.build-admission.${consumerRef.toLowerCase()}`);
}

export function readIntegratedBuildAdmissionReceipt(receiptPath, { registry, authorityContext }) {
  const value = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  return { value, validation: validateIntegratedBuildAdmissionReceipt(value, { registry, authorityContext }) };
}

export const BUILD_ADMISSION_PROOF_REFS = Object.freeze(Array.from({ length: 26 }, (_, i) => `BA${i}`));

// [VXG RealForever]
