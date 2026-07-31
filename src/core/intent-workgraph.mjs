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

function canonicalSet(values = []) {
  return [...new Set(clone(values))].sort();
}

function assertFingerprint(supplied, canonical, label) {
  if (supplied && supplied !== canonical) {
    throw new Error(`${label} semanticFingerprint does not match canonical snapshot identity`);
  }
  return canonical;
}

function normalizedNodeSnapshot(node) {
  const snapshot = clone(node);
  delete snapshot.semanticFingerprint;
  for (const field of [
    'dependencyRefs',
    'childRefs',
    'applicableCultureRefs',
    'applicableLessonRefs',
    'applicableBurdenReleaseRefs',
    'completionGateRefs',
    'sourceRefs'
  ]) snapshot[field] = canonicalSet(snapshot[field]);
  snapshot.dependencyRequirements = [...(snapshot.dependencyRequirements ?? [])]
    .map((item) => ({ ...clone(item), allowedDispositions: canonicalSet(item.allowedDispositions) }))
    .sort((left, right) => left.dependencyWorkNodeRef.localeCompare(right.dependencyWorkNodeRef));
  return snapshot;
}

export function buildIntentFingerprint(input) {
  const snapshot = clone(input);
  delete snapshot.semanticFingerprint;
  snapshot.constraints = [...(snapshot.constraints ?? [])]
    .map(clone)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return semanticHash(snapshot);
}

export function buildAttributedProjectionFingerprint(input) {
  const snapshot = clone(input);
  delete snapshot.semanticFingerprint;
  snapshot.sourceRefs = canonicalSet(snapshot.sourceRefs);
  return semanticHash(snapshot);
}

export function buildWorkNodeFingerprint(input) {
  const snapshot = normalizedNodeSnapshot(input);
  delete snapshot.workNodeRef;
  delete snapshot.state;
  delete snapshot.blockingReasonRef;
  delete snapshot.requiredHumanDecisionRef;
  delete snapshot.createdAt;
  return semanticHash(snapshot);
}

export function buildTransitionFingerprint(input) {
  const snapshot = clone(input);
  delete snapshot.semanticFingerprint;
  delete snapshot.transitionRef;
  delete snapshot.createdAt;
  delete snapshot.sequence;
  snapshot.sourceRefs = canonicalSet(snapshot.sourceRefs);
  return semanticHash(snapshot);
}

export function buildReceiptFingerprint(input) {
  const snapshot = clone(input);
  delete snapshot.semanticFingerprint;
  delete snapshot.receiptRef;
  delete snapshot.formedAt;
  snapshot.sourceRefs = canonicalSet(snapshot.sourceRefs);
  snapshot.sourceHashes = canonicalSet(snapshot.sourceHashes);
  return semanticHash(snapshot);
}

function projectionRef(item) {
  return item.interpretationRef ?? item.planRef ?? item.authorizationRef ?? '';
}

export function buildGraphSnapshotFingerprint(graph) {
  const transitions = [...(graph.transitions ?? [])].sort((left, right) =>
    left.workNodeRef.localeCompare(right.workNodeRef) ||
    left.sequence - right.sequence ||
    left.transitionRef.localeCompare(right.transitionRef)
  );
  const receipts = [...(graph.receipts ?? [])].sort((left, right) => left.receiptRef.localeCompare(right.receiptRef));
  return semanticHash({
    graphRef: graph.graphRef,
    rootIntentRef: graph.rootIntentRef,
    intentFingerprint: graph.intent.semanticFingerprint,
    interpretations: [...(graph.interpretations ?? [])].sort((left, right) => projectionRef(left).localeCompare(projectionRef(right))),
    proposedPlans: [...(graph.proposedPlans ?? [])].sort((left, right) => projectionRef(left).localeCompare(projectionRef(right))),
    authorizations: [...(graph.authorizations ?? [])].sort((left, right) => projectionRef(left).localeCompare(projectionRef(right))),
    nodes: [...(graph.nodes ?? [])].sort((left, right) => left.workNodeRef.localeCompare(right.workNodeRef))
      .map((node) => ({ ...normalizedNodeSnapshot(node), semanticFingerprint: node.semanticFingerprint })),
    transitions,
    receipts,
    bindingRefs: Object.fromEntries(Object.entries(graph.bindingRefs ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([field, refs]) => [field, canonicalSet(refs)])),
    currentPointers: graph.currentPointers,
    createdAt: graph.createdAt
  });
}

function currentPointers(transitions, receipts) {
  const transitionByWorkNodeRef = {};
  for (const transition of transitions) transitionByWorkNodeRef[transition.workNodeRef] = transition.transitionRef;
  const receiptRefs = receipts
    .filter((receipt) => receipt.currentness === 'CURRENT')
    .map((receipt) => receipt.receiptRef)
    .sort();
  return { transitionByWorkNodeRef, currentReceiptRefs: receiptRefs };
}

function formGraphSnapshot(input, suppliedFingerprint = null) {
  const snapshot = {
    ...clone(input),
    currentPointers: currentPointers(input.transitions ?? [], input.receipts ?? [])
  };
  snapshot.semanticFingerprint = assertFingerprint(
    suppliedFingerprint,
    buildGraphSnapshotFingerprint(snapshot),
    'intent workgraph'
  );
  return deepFreeze(snapshot);
}

export function createIntentEnvelope(input, registry) {
  requireFields(input, registry.intentEnvelopeRequiredFields.filter((field) => field !== 'semanticFingerprint'), 'intent envelope');
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
  envelope.semanticFingerprint = assertFingerprint(
    input.semanticFingerprint,
    buildIntentFingerprint(envelope),
    'intent envelope'
  );
  requireFields(envelope, registry.intentEnvelopeRequiredFields, 'intent envelope');
  return deepFreeze(envelope);
}

function createAttributedProjection(input, registry, contractKey, label) {
  const contract = registry.attributedProjectionContracts?.[contractKey];
  if (!contract) throw new Error(`intent registry missing ${contractKey} projection contract`);
  requireFields(input, contract.requiredFields.filter((field) => field !== 'semanticFingerprint'), label);
  const candidate = {
    ...clone(input),
    sourceRefs: canonicalSet(input.sourceRefs)
  };
  if (contractKey === 'plan' &&
      (candidate.authorityDisposition !== 'NO_AUTHORITY' || candidate.effectDisposition !== 'NO_EFFECTS')) {
    throw new Error('attributed plan must remain NO_AUTHORITY and NO_EFFECTS');
  }
  candidate.semanticFingerprint = assertFingerprint(
    input.semanticFingerprint,
    buildAttributedProjectionFingerprint(candidate),
    label
  );
  requireFields(candidate, contract.requiredFields, label);
  return deepFreeze(candidate);
}

export function createAttributedInterpretation(input, registry) {
  return createAttributedProjection(input, registry, 'interpretation', 'attributed interpretation');
}

export function createAttributedPlan(input, registry) {
  return createAttributedProjection(input, registry, 'plan', 'attributed plan');
}

export function createAttributedAuthorization(input, registry) {
  return createAttributedProjection(input, registry, 'authorization', 'attributed authorization');
}

export function createWorkNode(input, registry) {
  const dependencyRefs = canonicalSet(input.dependencyRefs);
  const candidate = {
    ...clone(input),
    parentWorkNodeRef: input.parentWorkNodeRef ?? null,
    initialState: input.initialState ?? input.state,
    contextPlanRef: input.contextPlanRef ?? null,
    dependencyRefs,
    dependencyRequirements: clone(input.dependencyRequirements ?? dependencyRefs.map((dependencyWorkNodeRef) => ({
      dependencyWorkNodeRef,
      expectedTransitionRef: `expected-transition.${dependencyWorkNodeRef}`,
      allowedDispositions: ['CANCELLED', 'CLOSED', 'COMPLETED', 'CONVERGED', 'SUPERSEDED']
    }))),
    childRefs: canonicalSet(input.childRefs),
    applicableCultureRefs: canonicalSet(input.applicableCultureRefs),
    applicableLessonRefs: canonicalSet(input.applicableLessonRefs),
    applicableBurdenReleaseRefs: canonicalSet(input.applicableBurdenReleaseRefs),
    completionGateRefs: canonicalSet(input.completionGateRefs),
    sourceRefs: canonicalSet(input.sourceRefs)
  };
  candidate.semanticFingerprint = assertFingerprint(
    input.semanticFingerprint,
    buildWorkNodeFingerprint(candidate),
    'work node'
  );
  requireFields(candidate, registry.workNodeRequiredFields, 'work node');
  return deepFreeze(candidate);
}

export function createIntentTransition(input, registry) {
  requireFields(input, registry.transitionRequiredFields.filter((field) => field !== 'semanticFingerprint'), 'intent transition');
  const candidate = { ...clone(input), sourceRefs: canonicalSet(input.sourceRefs) };
  candidate.semanticFingerprint = assertFingerprint(
    input.semanticFingerprint,
    buildTransitionFingerprint(candidate),
    'intent transition'
  );
  requireFields(candidate, registry.transitionRequiredFields, 'intent transition');
  return deepFreeze(candidate);
}

export function createIntentReceipt(input, registry) {
  requireFields(input, registry.receiptRequiredFields.filter((field) => field !== 'semanticFingerprint'), 'intent receipt');
  const candidate = {
    ...clone(input),
    sourceRefs: canonicalSet(input.sourceRefs),
    sourceHashes: canonicalSet(input.sourceHashes)
  };
  candidate.semanticFingerprint = assertFingerprint(
    input.semanticFingerprint,
    buildReceiptFingerprint(candidate),
    'intent receipt'
  );
  requireFields(candidate, registry.receiptRequiredFields, 'intent receipt');
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
  bindingRefs = {},
  createdAt,
  semanticFingerprint = null
}, registry) {
  if (!registry) throw new Error('intent registry is required to form a workgraph');
  if (!graphRef) throw new Error('graphRef is required');
  if (!intent?.intentRef) throw new Error('immutable intent envelope is required');
  const normalized = {
    schemaVersion: 'vexlife.intent-workgraph/v0',
    graphRef,
    rootIntentRef: intent.intentRef,
    intent: clone(intent),
    interpretations: interpretations.map((item) => createAttributedInterpretation(item, registry)),
    proposedPlans: proposedPlans.map((item) => createAttributedPlan(item, registry)),
    authorizations: authorizations.map((item) => createAttributedAuthorization(item, registry)),
    nodes: nodes.map(clone),
    transitions: transitions.map((item) => createIntentTransition(item, registry)),
    receipts: receipts.map((item) => createIntentReceipt(item, registry)),
    bindingRefs: Object.fromEntries(Object.entries(bindingRefs).map(([field, refs]) => [field, canonicalSet(refs)])),
    createdAt
  };
  return formGraphSnapshot(normalized, semanticFingerprint);
}

export function appendReceipt(graph, receipt, registry) {
  const normalized = createIntentReceipt(receipt, registry);
  if (graph.receipts.some((item) => item.receiptRef === normalized.receiptRef)) {
    return { changed: false, graph, reason: 'DUPLICATE_RECEIPT_REF' };
  }
  return {
    changed: true,
    receipt: normalized,
    graph: formGraphSnapshot({ ...clone(graph), receipts: [...clone(graph.receipts), clone(normalized)] })
  };
}

function transitionAllowed(registry, priorState, nextState) {
  return (registry.allowedTransitions?.[priorState] ?? []).includes(nextState);
}

export function recordIntentTransition(graph, transition, registry) {
  const node = graph.nodes.find((item) => item.workNodeRef === transition.workNodeRef);
  if (!node) throw new Error(`unknown work node ${transition.workNodeRef}`);
  const ledger = graph.transitions.filter((item) => item.workNodeRef === transition.workNodeRef);
  const normalized = createIntentTransition({
    ...clone(transition),
    sequence: transition.sequence ?? ledger.length
  }, registry);
  if (ledger.some((item) => item.semanticFingerprint === normalized.semanticFingerprint)) {
    return { changed: false, graph, reason: 'SEMANTIC_NO_OP' };
  }
  if (node.state !== normalized.priorState) {
    throw new Error(`transition prior state ${normalized.priorState} does not match ${node.state}`);
  }
  if (!transitionAllowed(registry, normalized.priorState, normalized.nextState)) {
    throw new Error(`disallowed intent transition ${normalized.priorState} -> ${normalized.nextState}`);
  }
  const nodes = graph.nodes.map((item) => item.workNodeRef === node.workNodeRef
    ? { ...clone(item), state: normalized.nextState }
    : clone(item));
  return {
    changed: true,
    transition: normalized,
    graph: formGraphSnapshot({
      ...clone(graph),
      nodes,
      transitions: [...clone(graph.transitions), clone(normalized)]
    })
  };
}

function descendantRefs(graph, rootRef) {
  const children = new Map(graph.nodes.map((node) => [node.workNodeRef, node.childRefs ?? []]));
  const refs = [];
  const visited = new Set();
  const visit = (ref) => {
    if (visited.has(ref)) throw new Error(`containment hierarchy cycle at ${ref}`);
    visited.add(ref);
    refs.push(ref);
    for (const childRef of children.get(ref) ?? []) visit(childRef);
  };
  visit(rootRef);
  return refs;
}

export function cancelIntentBranch(graph, workNodeRef, transitionInput, registry) {
  if (!graph.nodes.some((node) => node.workNodeRef === workNodeRef)) {
    throw new Error(`unknown work node ${workNodeRef}`);
  }
  const branchRefs = descendantRefs(graph, workNodeRef);
  let current = graph;
  const transitions = [];
  for (const [index, ref] of branchRefs.entries()) {
    const node = current.nodes.find((item) => item.workNodeRef === ref);
    if ([...(registry.terminalStates ?? []), 'COMPLETED', 'CONVERGED'].includes(node.state)) continue;
    const result = recordIntentTransition(current, {
      ...clone(transitionInput),
      transitionRef: index === 0 ? transitionInput.transitionRef : `${transitionInput.transitionRef}.${index}`,
      workNodeRef: ref,
      priorState: node.state,
      nextState: 'CANCELLED'
    }, registry);
    current = result.graph;
    if (result.changed) transitions.push(result.transition);
  }
  return {
    changed: transitions.length > 0,
    graph: current,
    transitions,
    preservedNodeRefs: current.nodes.map((node) => node.workNodeRef),
    preservedSourceRefs: current.nodes
      .filter((node) => branchRefs.includes(node.workNodeRef))
      .flatMap((node) => node.sourceRefs)
  };
}

export function resolveKnownIntent(intentKey, registry) {
  const matches = (registry.knownIntentProcessRoutes ?? []).filter((route) => route.intentKey === intentKey);
  if (matches.length === 1) {
    return {
      state: 'RESOLVED',
      currentness: 'CURRENT',
      intentKey,
      processRef: matches[0].processRef,
      resolutionRefs: [matches[0].resolutionRef],
      authority: 'NO_EXECUTION_AUTHORITY'
    };
  }
  return {
    state: matches.length === 0 ? 'HELD_UNKNOWN' : 'NEEDS_CLARIFICATION',
    currentness: 'CURRENT',
    intentKey,
    processRef: null,
    resolutionRefs: matches.map((item) => item.resolutionRef).sort(),
    authority: 'NO_EXECUTION_AUTHORITY'
  };
}

export function isDeeplyFrozen(value) {
  if (!value || typeof value !== 'object' || !Object.isFrozen(value)) return false;
  return Object.values(value).every((child) => !child || typeof child !== 'object' || isDeeplyFrozen(child));
}

// [VXG RealForever]
