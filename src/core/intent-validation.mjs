import { semanticHash } from './utils.mjs';

const REQUIRED_PROCESS_REFS = [
  'process.vexlife.intent.capture',
  'process.vexlife.intent.decompose-candidate',
  'process.vexlife.intent.validate-workgraph',
  'process.vexlife.intent.project-ready-set',
  'process.vexlife.intent.verify-transition',
  'process.vexlife.intent.converge-parent'
];

const ALLOWED_TRANSITIONS = {
  CAPTURED: ['NEEDS_CLARIFICATION', 'DECOMPOSED', 'CANCELLED', 'HELD_UNKNOWN'],
  NEEDS_CLARIFICATION: ['DECOMPOSED', 'WAITING_HUMAN', 'CANCELLED', 'HELD_UNKNOWN'],
  DECOMPOSED: ['PLAN_VALIDATED', 'NEEDS_CLARIFICATION', 'BLOCKED', 'CANCELLED'],
  PLAN_VALIDATED: ['WAITING_DEPENDENCIES', 'READY', 'BLOCKED', 'CANCELLED'],
  WAITING_DEPENDENCIES: ['READY', 'BLOCKED', 'CANCELLED', 'HELD_UNKNOWN'],
  READY: ['WAITING_RESOURCE', 'CONTEXT_ADMITTED', 'RUNNING', 'CANCELLED', 'HELD_UNKNOWN'],
  WAITING_RESOURCE: ['READY', 'CONTEXT_ADMITTED', 'CANCELLED', 'HELD_UNKNOWN'],
  CONTEXT_ADMITTED: ['RUNNING', 'WAITING_TOOL', 'WAITING_HUMAN', 'CANCELLED'],
  RUNNING: ['WAITING_TOOL', 'WAITING_HUMAN', 'VERIFYING', 'FAILED_RECOVERABLE', 'PAUSED_AT_CHECKPOINT', 'CANCELLED'],
  WAITING_TOOL: ['RUNNING', 'VERIFYING', 'FAILED_RECOVERABLE', 'CANCELLED', 'HELD_UNKNOWN'],
  WAITING_HUMAN: ['READY', 'RUNNING', 'VERIFYING', 'CANCELLED', 'HELD_UNKNOWN'],
  VERIFYING: ['COMPLETED', 'FAILED_RECOVERABLE', 'BLOCKED', 'HELD_UNKNOWN'],
  COMPLETED: ['CONVERGED', 'CLOSED', 'SUPERSEDED'],
  CONVERGED: ['CLOSED', 'SUPERSEDED'],
  FAILED_RECOVERABLE: ['READY', 'PAUSED_AT_CHECKPOINT', 'BLOCKED', 'CANCELLED'],
  PAUSED_AT_CHECKPOINT: ['READY', 'CANCELLED', 'HELD_UNKNOWN'],
  BLOCKED: ['READY', 'CANCELLED', 'HELD_UNKNOWN'],
  HELD_UNKNOWN: ['NEEDS_CLARIFICATION', 'READY', 'BLOCKED', 'CANCELLED'],
  CLOSED: [],
  SUPERSEDED: [],
  CANCELLED: []
};

function missingFields(value, fields) {
  return fields.filter((field) => {
    const item = value?.[field];
    return item === undefined || item === null || item === '';
  });
}

function uniqueRefs(items, field, label, errors) {
  const refs = new Set();
  for (const item of items) {
    const ref = item?.[field];
    if (!ref) errors.push(`${label} missing ${field}`);
    else if (refs.has(ref)) errors.push(`duplicate ${label} ref ${ref}`);
    else refs.add(ref);
  }
  return refs;
}

function detectCycle(nodesByRef) {
  const visiting = new Set();
  const visited = new Set();
  const route = [];
  function visit(ref) {
    if (visiting.has(ref)) return [...route.slice(route.indexOf(ref)), ref];
    if (visited.has(ref)) return null;
    visiting.add(ref);
    route.push(ref);
    for (const dependencyRef of nodesByRef.get(ref)?.dependencyRefs ?? []) {
      if (!nodesByRef.has(dependencyRef)) continue;
      const cycle = visit(dependencyRef);
      if (cycle) return cycle;
    }
    route.pop();
    visiting.delete(ref);
    visited.add(ref);
    return null;
  }
  for (const ref of nodesByRef.keys()) {
    const cycle = visit(ref);
    if (cycle) return cycle;
  }
  return null;
}

function topologicalOrder(nodesByRef) {
  const indegree = new Map([...nodesByRef.keys()].map((ref) => [ref, 0]));
  const consumers = new Map([...nodesByRef.keys()].map((ref) => [ref, []]));
  for (const node of nodesByRef.values()) {
    for (const dependencyRef of node.dependencyRefs ?? []) {
      if (!nodesByRef.has(dependencyRef)) continue;
      indegree.set(node.workNodeRef, indegree.get(node.workNodeRef) + 1);
      consumers.get(dependencyRef).push(node.workNodeRef);
    }
  }
  const queue = [...indegree.entries()].filter(([, count]) => count === 0).map(([ref]) => ref).sort();
  const order = [];
  while (queue.length) {
    const ref = queue.shift();
    order.push(ref);
    for (const consumer of consumers.get(ref)) {
      indegree.set(consumer, indegree.get(consumer) - 1);
      if (indegree.get(consumer) === 0) {
        queue.push(consumer);
        queue.sort();
      }
    }
  }
  return order;
}

function exactReceiptFor(receipts, workNodeRef) {
  return receipts.find((receipt) =>
    receipt.workNodeRef === workNodeRef &&
    receipt.state === 'PROVEN' &&
    receipt.receiptRef &&
    (receipt.sourceRefs?.length ?? 0) > 0
  );
}

function validateCompletedNode(node, graph, errors) {
  if (!['COMPLETED', 'CONVERGED', 'CLOSED'].includes(node.state)) return;
  const receipt = graph.receipts.find((item) =>
    item.workNodeRef === node.workNodeRef &&
    item.expectedTransitionRef === node.expectedTransitionRef &&
    item.state === 'PROVEN'
  );
  if (!receipt) {
    errors.push(`${node.workNodeRef} ${node.state} missing exact expected transition evidence ${node.expectedTransitionRef}`);
    return;
  }
  if (receipt.requiresMutation && (!receipt.beforeImplementationHead || !receipt.afterImplementationHead || receipt.beforeImplementationHead === receipt.afterImplementationHead)) {
    errors.push(`${node.workNodeRef} mutation transition is not proven by a changed implementation head`);
  }
}

function validateParentConvergence(node, nodesByRef, graph, errors) {
  if (!['CONVERGED', 'CLOSED'].includes(node.state)) return;
  for (const childRef of node.childRefs ?? []) {
    const child = nodesByRef.get(childRef);
    if (!child) {
      errors.push(`${node.workNodeRef} references missing child ${childRef}`);
      continue;
    }
    if (!['COMPLETED', 'CONVERGED', 'CLOSED', 'CANCELLED', 'SUPERSEDED'].includes(child.state)) {
      errors.push(`${node.workNodeRef} cannot ${node.state} before child ${childRef} has a terminal disposition`);
    }
    if (!exactReceiptFor(graph.receipts, childRef)) {
      errors.push(`${node.workNodeRef} cannot ${node.state} before child receipt ${childRef}`);
    }
  }
}

export function validateIntentRegistry(registry) {
  const errors = [];
  if (registry?.schemaVersion !== 'vexlife.intent-orchestration-registry/v0') errors.push('unexpected intent registry schema');
  if (!registry?.registryRef) errors.push('intent registry missing registryRef');
  const lifecycle = new Set(registry?.lifecycleStates ?? []);
  for (const state of Object.keys(ALLOWED_TRANSITIONS)) if (!lifecycle.has(state)) errors.push(`intent registry missing lifecycle state ${state}`);
  for (const ref of REQUIRED_PROCESS_REFS) if (!(registry?.processRefs ?? []).includes(ref)) errors.push(`intent registry missing process ${ref}`);
  for (const field of ['intentEnvelopeRequiredFields', 'workNodeRequiredFields', 'transitionRequiredFields']) {
    if (!(registry?.[field]?.length)) errors.push(`intent registry missing ${field}`);
  }
  return {
    ok: errors.length === 0,
    errors,
    stats: {
      lifecycleStates: lifecycle.size,
      processRefs: registry?.processRefs?.length ?? 0,
      intentFields: registry?.intentEnvelopeRequiredFields?.length ?? 0,
      workNodeFields: registry?.workNodeRequiredFields?.length ?? 0
    },
    semanticHash: semanticHash(registry ?? {})
  };
}

export function validateIntentWorkgraph(graph, {
  registry,
  registeredProcessRefs = registry?.processRefs ?? [],
  registeredRoleRefs = null
} = {}) {
  const errors = [];
  const attentions = [];
  if (graph?.schemaVersion !== 'vexlife.intent-workgraph/v0') errors.push('unexpected workgraph schema');
  if (!graph?.graphRef) errors.push('workgraph missing graphRef');
  if (!graph?.intent) errors.push('workgraph missing immutable intent');
  else {
    for (const field of missingFields(graph.intent, registry.intentEnvelopeRequiredFields)) errors.push(`intent envelope missing ${field}`);
    if (graph.rootIntentRef !== graph.intent.intentRef) errors.push('workgraph root intent does not match envelope');
  }
  const nodeRefs = uniqueRefs(graph?.nodes ?? [], 'workNodeRef', 'work node', errors);
  uniqueRefs(graph?.transitions ?? [], 'transitionRef', 'transition', errors);
  uniqueRefs(graph?.receipts ?? [], 'receiptRef', 'receipt', errors);
  const nodesByRef = new Map((graph?.nodes ?? []).filter((node) => node.workNodeRef).map((node) => [node.workNodeRef, node]));
  const lifecycle = new Set(registry?.lifecycleStates ?? []);
  const priorities = new Set(registry?.priorityVocabulary ?? []);
  const registeredProcesses = new Set(registeredProcessRefs);
  const registeredRoles = registeredRoleRefs ? new Set(registeredRoleRefs) : null;
  const bindingPrefixes = registry?.bindingRefPrefixes ?? {};
  const activeFingerprints = new Map();
  const duplicateExemptStates = new Set(registry?.activeSemanticDuplicateExemptStates ?? []);

  for (const node of graph?.nodes ?? []) {
    for (const field of missingFields(node, registry.workNodeRequiredFields)) errors.push(`${node.workNodeRef ?? 'unknown work node'} missing ${field}`);
    if (node.rootIntentRef !== graph.rootIntentRef) errors.push(`${node.workNodeRef} root intent mismatch`);
    if (!lifecycle.has(node.state)) errors.push(`${node.workNodeRef} has unknown lifecycle state ${node.state}`);
    if (!registeredProcesses.has(node.processRef)) errors.push(`${node.workNodeRef} references missing process ${node.processRef}`);
    if (registeredRoles && !registeredRoles.has(node.roleRef)) errors.push(`${node.workNodeRef} references missing role ${node.roleRef}`);
    if (!priorities.has(node.priorityClass)) errors.push(`${node.workNodeRef} has unknown priority ${node.priorityClass}`);
    if ((node.dependencyRefs ?? []).includes(node.workNodeRef)) errors.push(`${node.workNodeRef} has a self-dependency`);
    for (const dependencyRef of node.dependencyRefs ?? []) if (!nodeRefs.has(dependencyRef)) errors.push(`${node.workNodeRef} references missing dependency ${dependencyRef}`);
    for (const childRef of node.childRefs ?? []) if (!nodeRefs.has(childRef)) errors.push(`${node.workNodeRef} references missing child ${childRef}`);
    for (const [field, value] of [
      ['capabilityEnvelopeRef', node.capabilityEnvelopeRef],
      ['effectEnvelopeRef', node.effectEnvelopeRef],
      ['resourceEnvelopeRef', node.resourceEnvelopeRef],
      ['expectedTransitionRef', node.expectedTransitionRef],
      ['completionGateRefs', node.completionGateRefs],
      ['returnRouteRef', node.returnRouteRef]
    ]) if (!value || (Array.isArray(value) && !value.length)) errors.push(`${node.workNodeRef} missing ${field}`);
    for (const [field, prefix] of Object.entries(bindingPrefixes)) {
      const value = node[field];
      for (const ref of Array.isArray(value) ? value : [value]) {
        if (ref && !ref.startsWith(prefix)) errors.push(`${node.workNodeRef} ${field} has invalid binding ref ${ref}`);
      }
    }
    if (!duplicateExemptStates.has(node.state)) {
      const priorRef = activeFingerprints.get(node.semanticFingerprint);
      if (priorRef) errors.push(`active semantic duplicate ${priorRef} and ${node.workNodeRef}`);
      else activeFingerprints.set(node.semanticFingerprint, node.workNodeRef);
    }
    if (node.state === 'HELD_UNKNOWN') attentions.push(`${node.workNodeRef} remains HELD_UNKNOWN`);
    validateCompletedNode(node, graph, errors);
    validateParentConvergence(node, nodesByRef, graph, errors);
  }

  const cycle = detectCycle(nodesByRef);
  if (cycle) errors.push(`workgraph cycle ${cycle.join(' -> ')}`);

  for (const transition of graph?.transitions ?? []) {
    for (const field of missingFields(transition, registry.transitionRequiredFields)) errors.push(`${transition.transitionRef ?? 'unknown transition'} missing ${field}`);
    if (!nodeRefs.has(transition.workNodeRef)) errors.push(`${transition.transitionRef} references missing work node ${transition.workNodeRef}`);
    if (!lifecycle.has(transition.priorState) || !lifecycle.has(transition.nextState)) errors.push(`${transition.transitionRef} uses unknown lifecycle state`);
    else if (!(ALLOWED_TRANSITIONS[transition.priorState] ?? []).includes(transition.nextState)) errors.push(`${transition.transitionRef} disallows ${transition.priorState} -> ${transition.nextState}`);
  }

  const sets = projectIntentSets(graph, { registry, nodesByRef });
  return {
    ok: errors.length === 0,
    state: errors.length ? 'BLOCKED' : attentions.length ? 'ATTENTION' : 'PLAN_VALIDATED',
    currentness: 'CURRENT',
    errors,
    attentions,
    cycle,
    topologicalOrder: cycle ? [] : topologicalOrder(nodesByRef),
    sets,
    semanticHash: semanticHash({
      graphRef: graph?.graphRef,
      errors,
      attentions,
      sets
    })
  };
}

export function projectIntentSets(graph, { registry, nodesByRef = new Map((graph?.nodes ?? []).map((node) => [node.workNodeRef, node])) } = {}) {
  const terminalStates = new Set(registry?.terminalStates ?? []);
  const ready = [];
  const waiting = [];
  const blocked = [];
  const terminal = [];
  for (const node of graph?.nodes ?? []) {
    const dependencyReceiptsCurrent = (node.dependencyRefs ?? []).every((dependencyRef) => exactReceiptFor(graph.receipts ?? [], dependencyRef));
    if (node.state === 'READY' && dependencyReceiptsCurrent) ready.push(node.workNodeRef);
    if (node.state === 'READY' && !dependencyReceiptsCurrent) waiting.push(node.workNodeRef);
    if (['NEEDS_CLARIFICATION', 'WAITING_DEPENDENCIES', 'WAITING_RESOURCE', 'WAITING_TOOL', 'WAITING_HUMAN', 'PAUSED_AT_CHECKPOINT', 'HELD_UNKNOWN'].includes(node.state)) waiting.push(node.workNodeRef);
    if (['BLOCKED', 'FAILED_RECOVERABLE'].includes(node.state)) blocked.push(node.workNodeRef);
    if (terminalStates.has(node.state)) terminal.push(node.workNodeRef);
  }
  return {
    ready: [...new Set(ready)].sort(),
    waiting: [...new Set(waiting)].sort(),
    blocked: [...new Set(blocked)].sort(),
    terminal: [...new Set(terminal)].sort()
  };
}

export function transitionAllowed(priorState, nextState) {
  return (ALLOWED_TRANSITIONS[priorState] ?? []).includes(nextState);
}

// [VXG RealForever]
