import { semanticHash } from './utils.mjs';

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requireFields(value, fields, label) {
  const missing = fields.filter((field) => {
    const item = value?.[field];
    return item === undefined || item === null || item === '';
  });
  if (missing.length) throw new Error(`${label} missing required fields: ${missing.join(', ')}`);
}

export function createIntentEnvelope(input, registry) {
  requireFields(input, registry.intentEnvelopeRequiredFields, 'intent envelope');
  const envelope = {
    intentRef: input.intentRef,
    originMessageRef: input.originMessageRef,
    originSpeakerRef: input.originSpeakerRef,
    recipientRoleRef: input.recipientRoleRef,
    projectRef: input.projectRef,
    threadRef: input.threadRef,
    channelRef: input.channelRef,
    originalContentHash: input.originalContentHash,
    desiredOutcome: clone(input.desiredOutcome),
    constraints: clone(input.constraints),
    createdAt: input.createdAt,
    sourceLineageRef: input.sourceLineageRef
  };
  return deepFreeze(envelope);
}

export function createWorkNode(input, registry) {
  const candidate = {
    ...clone(input),
    parentWorkNodeRef: input.parentWorkNodeRef ?? null,
    contextPlanRef: input.contextPlanRef ?? null,
    dependencyRefs: clone(input.dependencyRefs ?? []),
    childRefs: clone(input.childRefs ?? []),
    applicableCultureRefs: clone(input.applicableCultureRefs ?? []),
    applicableLessonRefs: clone(input.applicableLessonRefs ?? []),
    applicableBurdenReleaseRefs: clone(input.applicableBurdenReleaseRefs ?? []),
    completionGateRefs: clone(input.completionGateRefs ?? []),
    sourceRefs: clone(input.sourceRefs ?? [])
  };
  if (!candidate.semanticFingerprint) {
    candidate.semanticFingerprint = semanticHash({
      rootIntentRef: candidate.rootIntentRef,
      purpose: candidate.purpose,
      processRef: candidate.processRef,
      roleRef: candidate.roleRef,
      sourceRefs: candidate.sourceRefs
    });
  }
  requireFields(candidate, registry.workNodeRequiredFields, 'work node');
  return deepFreeze(candidate);
}

export function createIntentWorkgraph({
  graphRef,
  intent,
  nodes = [],
  interpretations = [],
  proposedPlans = [],
  authorizations = [],
  transitions = [],
  receipts = [],
  createdAt
}) {
  if (!graphRef) throw new Error('graphRef is required');
  if (!intent?.intentRef) throw new Error('immutable intent envelope is required');
  return deepFreeze({
    schemaVersion: 'vexlife.intent-workgraph/v0',
    graphRef,
    rootIntentRef: intent.intentRef,
    intent: clone(intent),
    interpretations: clone(interpretations),
    proposedPlans: clone(proposedPlans),
    authorizations: clone(authorizations),
    nodes: clone(nodes),
    transitions: clone(transitions),
    receipts: clone(receipts),
    createdAt,
    semanticFingerprint: semanticHash({
      graphRef,
      rootIntentRef: intent.intentRef,
      nodeRefs: nodes.map((node) => node.workNodeRef),
      transitionRefs: transitions.map((transition) => transition.transitionRef),
      receiptRefs: receipts.map((receipt) => receipt.receiptRef)
    })
  });
}

export function appendReceipt(graph, receipt) {
  if (!receipt?.receiptRef) throw new Error('receiptRef is required');
  if (graph.receipts.some((item) => item.receiptRef === receipt.receiptRef)) {
    return { changed: false, graph, reason: 'DUPLICATE_RECEIPT_REF' };
  }
  return {
    changed: true,
    graph: deepFreeze({ ...clone(graph), receipts: [...clone(graph.receipts), clone(receipt)] })
  };
}

export function recordIntentTransition(graph, transition, registry) {
  requireFields(transition, registry.transitionRequiredFields.filter((field) => field !== 'semanticFingerprint'), 'intent transition');
  const node = graph.nodes.find((item) => item.workNodeRef === transition.workNodeRef);
  if (!node) throw new Error(`unknown work node ${transition.workNodeRef}`);
  const semanticFingerprint = transition.semanticFingerprint ?? semanticHash({
    workNodeRef: transition.workNodeRef,
    priorState: transition.priorState,
    nextState: transition.nextState,
    reason: transition.reason,
    actorRef: transition.actorRef,
    processRef: transition.processRef,
    sourceRefs: transition.sourceRefs
  });
  const prior = graph.transitions.at(-1);
  if (prior?.semanticFingerprint === semanticFingerprint) {
    return { changed: false, graph, reason: 'SEMANTIC_NO_OP' };
  }
  if (node.state !== transition.priorState) throw new Error(`transition prior state ${transition.priorState} does not match ${node.state}`);
  const normalized = deepFreeze({ ...clone(transition), semanticFingerprint });
  const nodes = graph.nodes.map((item) => item.workNodeRef === node.workNodeRef
    ? { ...clone(item), state: transition.nextState }
    : clone(item));
  return {
    changed: true,
    transition: normalized,
    graph: deepFreeze({
      ...clone(graph),
      nodes,
      transitions: [...clone(graph.transitions), clone(normalized)]
    })
  };
}

export function cancelIntentBranch(graph, workNodeRef, transitionInput, registry) {
  const target = graph.nodes.find((node) => node.workNodeRef === workNodeRef);
  if (!target) throw new Error(`unknown work node ${workNodeRef}`);
  const result = recordIntentTransition(graph, {
    ...transitionInput,
    workNodeRef,
    priorState: target.state,
    nextState: 'CANCELLED'
  }, registry);
  return {
    ...result,
    preservedNodeRefs: result.graph.nodes.map((node) => node.workNodeRef),
    preservedSourceRefs: result.graph.nodes
      .filter((node) => node.workNodeRef === workNodeRef || node.parentWorkNodeRef === workNodeRef)
      .flatMap((node) => node.sourceRefs)
  };
}

export function isDeeplyFrozen(value) {
  if (!value || typeof value !== 'object' || !Object.isFrozen(value)) return false;
  return Object.values(value).every((child) => !child || typeof child !== 'object' || isDeeplyFrozen(child));
}

// [VXG RealForever]
