import { projectIntentSets, validateIntentWorkgraph } from './intent-validation.mjs';

const PRIORITY_ORDER = new Map([
  ['IMMEDIATE', 0],
  ['HIGH', 1],
  ['NORMAL', 2],
  ['LOW', 3]
]);

function compactNode(node, detail = {}) {
  return {
    workNodeRef: node.workNodeRef,
    purpose: node.purpose,
    state: node.state,
    priorityClass: node.priorityClass,
    processRef: node.processRef,
    returnRouteRef: node.returnRouteRef,
    waitingReason: detail.waitingReason ?? null,
    unmetDependencyRefs: detail.unmetDependencyRefs ?? [],
    blockingReasonRef: detail.blockingReasonRef ?? null,
    requiredHumanDecisionRef: detail.requiredHumanDecisionRef ?? null,
    evidenceSourceRefs: detail.evidenceSourceRefs ?? []
  };
}

function sortNodes(nodes) {
  return [...nodes].sort((left, right) =>
    (PRIORITY_ORDER.get(left.priorityClass) ?? 99) - (PRIORITY_ORDER.get(right.priorityClass) ?? 99) ||
    left.workNodeRef.localeCompare(right.workNodeRef)
  );
}

function nextSafeAction(graph, validation, sets) {
  if (validation.errors.length) {
    return {
      action: 'REPAIR_INVALID_WORKGRAPH',
      workNodeRef: null,
      reason: validation.errors[0],
      authority: 'NO_EXECUTION_AUTHORITY'
    };
  }
  const needsHuman = sortNodes(graph.nodes.filter((node) => ['NEEDS_CLARIFICATION', 'WAITING_HUMAN', 'HELD_UNKNOWN'].includes(node.state)));
  if (needsHuman.length) {
    return {
      action: 'REQUEST_BOUNDED_HUMAN_DECISION',
      workNodeRef: needsHuman[0].workNodeRef,
      reason: needsHuman[0].state,
      authority: 'NO_EXECUTION_AUTHORITY'
    };
  }
  const ready = sortNodes(graph.nodes.filter((node) => sets.ready.includes(node.workNodeRef)));
  if (ready.length) {
    return {
      action: 'PROPOSE_START_READY_NODE',
      workNodeRef: ready[0].workNodeRef,
      reason: 'DEPENDENCY_RECEIPTS_CURRENT',
      authority: 'NO_EXECUTION_AUTHORITY'
    };
  }
  const recoverable = sortNodes(graph.nodes.filter((node) => node.state === 'FAILED_RECOVERABLE'));
  if (recoverable.length) {
    return {
      action: 'PROPOSE_RECOVERY_ROUTE',
      workNodeRef: recoverable[0].workNodeRef,
      reason: recoverable[0].returnRouteRef,
      authority: 'NO_EXECUTION_AUTHORITY'
    };
  }
  return {
    action: 'HOLD_NO_SAFE_ACTION',
    workNodeRef: null,
    reason: sets.terminal.length === graph.nodes.length ? 'GRAPH_TERMINAL' : 'WAITING_FOR_EXACT_EVIDENCE',
    authority: 'NO_EXECUTION_AUTHORITY'
  };
}

export function projectIntentStatus(graph, {
  registry,
  registeredProcessRefs = registry?.processRefs ?? [],
  registeredRoleRefs = [],
  registeredBindingRefs = graph?.bindingRefs ?? {},
  bindingResolver = null,
  recentLimit = 5
} = {}) {
  const validation = validateIntentWorkgraph(graph, {
    registry,
    registeredProcessRefs,
    registeredRoleRefs,
    registeredBindingRefs,
    bindingResolver
  });
  const sets = projectIntentSets(graph, { registry });
  const byRef = new Map(graph.nodes.map((node) => [node.workNodeRef, node]));
  const compactRefs = (refs) => refs.map((ref) => {
    const node = byRef.get(ref);
    return node ? compactNode(node, sets.detailsByRef[ref]) : null;
  }).filter(Boolean);
  const happening = graph.nodes.filter((node) => ['CONTEXT_ADMITTED', 'RUNNING', 'WAITING_TOOL', 'VERIFYING'].includes(node.state));
  const needsHuman = graph.nodes.filter((node) => ['NEEDS_CLARIFICATION', 'WAITING_HUMAN', 'HELD_UNKNOWN'].includes(node.state));
  const recentlyCompleted = graph.transitions
    .filter((transition) => ['COMPLETED', 'CONVERGED', 'CLOSED'].includes(transition.nextState))
    .slice(-recentLimit)
    .reverse()
    .map((transition) => ({
      workNodeRef: transition.workNodeRef,
      state: transition.nextState,
      transitionRef: transition.transitionRef,
      createdAt: transition.createdAt
    }));
  return {
    schemaVersion: 'vexlife.intent-status-projection/v0',
    state: validation.state,
    currentness: 'CURRENT',
    graphRef: graph.graphRef,
    intentRef: graph.rootIntentRef,
    whatIsHappeningNow: sortNodes(happening).map((node) => compactNode(node, sets.detailsByRef[node.workNodeRef])),
    ready: compactRefs(sets.ready),
    waiting: compactRefs(sets.waiting),
    needsHuman: sortNodes(needsHuman).map((node) => compactNode(node, sets.detailsByRef[node.workNodeRef])),
    blocked: compactRefs(sets.blocked),
    recentlyCompleted,
    nextSafeAction: nextSafeAction(graph, validation, sets),
    sourceDescent: {
      graphRef: graph.graphRef,
      intentRef: graph.rootIntentRef,
      detailCommand: `npm run intent:status -- --graph <path> --detail`
    },
    validation: {
      errors: validation.errors,
      attentions: validation.attentions,
      topologicalOrder: validation.topologicalOrder
    }
  };
}

export function projectIntentPlan(graph, options = {}) {
  const status = projectIntentStatus(graph, options);
  return {
    schemaVersion: 'vexlife.intent-plan-projection/v0',
    state: status.state,
    currentness: status.currentness,
    graphRef: graph.graphRef,
    intentRef: graph.rootIntentRef,
    topologicalOrder: status.validation.topologicalOrder,
    sets: {
      ready: status.ready.map((node) => node.workNodeRef),
      waiting: status.waiting.map((node) => node.workNodeRef),
      blocked: status.blocked.map((node) => node.workNodeRef)
    },
    nextSafeAction: status.nextSafeAction,
    sourceDescent: status.sourceDescent,
    errors: status.validation.errors,
    attentions: status.validation.attentions
  };
}

// [VXG RealForever]
