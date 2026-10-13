export const REFINEMENT_CURRENT_PROJECTION_SCHEMA = 'vexlife.refinement-current-projection/v1';
export const REFINEMENT_CURRENT_PROJECTION_SOURCE_REF = 'projection.vexlife.refinement-current.001';

const STATUS_SCHEMA = 'vexlife.intent-status-projection/v0';
const DISPOSITION_RANK = new Map([
  ['ACTIVE', 0],
  ['HUMAN_ATTENTION', 1],
  ['READY', 2],
  ['BLOCKED', 3],
  ['WAITING', 4]
]);

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  throw error;
}

function stableRef(value, label) {
  if (typeof value !== 'string' || value.length === 0 || /\s/u.test(value)) {
    fail('REFINEMENT_CURRENT_INPUT_INVALID', `${label} must be one stable ref`);
  }
  return value;
}

function stableRefOrNull(value, label) {
  if (value === null || value === undefined) return null;
  return stableRef(value, label);
}

function stableRefs(value, label) {
  if (!Array.isArray(value)) fail('REFINEMENT_CURRENT_INPUT_INVALID', `${label} must be an array`);
  const refs = value.map((item, index) => stableRef(item, `${label}[${index}]`));
  if (new Set(refs).size !== refs.length) fail('REFINEMENT_CURRENT_INPUT_INVALID', `${label} contains duplicate refs`);
  return refs;
}

function compactNode(node, label) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    fail('REFINEMENT_CURRENT_INPUT_INVALID', `${label} must be one Intent node projection`);
  }
  return Object.freeze({
    workNodeRef: stableRef(node.workNodeRef, `${label}.workNodeRef`),
    purpose: typeof node.purpose === 'string' ? node.purpose : '',
    state: stableRef(node.state, `${label}.state`),
    priorityClass: stableRef(node.priorityClass, `${label}.priorityClass`),
    processRef: stableRef(node.processRef, `${label}.processRef`),
    returnRouteRef: stableRef(node.returnRouteRef, `${label}.returnRouteRef`),
    waitingReason: typeof node.waitingReason === 'string' && node.waitingReason ? node.waitingReason : null,
    unmetDependencyRefs: Object.freeze(stableRefs(node.unmetDependencyRefs ?? [], `${label}.unmetDependencyRefs`)),
    blockingReasonRef: stableRefOrNull(node.blockingReasonRef, `${label}.blockingReasonRef`),
    requiredHumanDecisionRef: stableRefOrNull(node.requiredHumanDecisionRef, `${label}.requiredHumanDecisionRef`),
    evidenceSourceRefs: Object.freeze(stableRefs(node.evidenceSourceRefs ?? [], `${label}.evidenceSourceRefs`))
  });
}

function compactRecent(item, label) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    fail('REFINEMENT_CURRENT_INPUT_INVALID', `${label} must be one completion projection`);
  }
  return Object.freeze({
    workNodeRef: stableRef(item.workNodeRef, `${label}.workNodeRef`),
    state: stableRef(item.state, `${label}.state`),
    transitionRef: stableRef(item.transitionRef, `${label}.transitionRef`),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : null
  });
}

function compactAction(action, label) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    fail('REFINEMENT_CURRENT_INPUT_INVALID', `${label} must be one next-safe-action projection`);
  }
  return Object.freeze({
    action: stableRef(action.action, `${label}.action`),
    workNodeRef: stableRefOrNull(action.workNodeRef, `${label}.workNodeRef`),
    reason: typeof action.reason === 'string' && action.reason ? action.reason : null,
    authority: action.authority === 'NO_EXECUTION_AUTHORITY'
      ? action.authority
      : fail('REFINEMENT_CURRENT_AUTHORITY_INVALID', `${label}.authority must remain NO_EXECUTION_AUTHORITY`)
  });
}

function compactStatus(status, index) {
  const label = `intentStatusProjections[${index}]`;
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    fail('REFINEMENT_CURRENT_INPUT_INVALID', `${label} must be one Intent status projection`);
  }
  if (status.schemaVersion !== STATUS_SCHEMA || status.currentness !== 'CURRENT') {
    fail('REFINEMENT_CURRENT_INPUT_INVALID', `${label} must be one CURRENT ${STATUS_SCHEMA} projection`);
  }
  const mapNodes = (field) => Object.freeze((status[field] ?? []).map((node, nodeIndex) => compactNode(node, `${label}.${field}[${nodeIndex}]`)));
  const validationErrors = Array.isArray(status.validation?.errors)
    ? Object.freeze(status.validation.errors.filter((value) => typeof value === 'string' && value).sort())
    : Object.freeze([]);
  const validationAttentions = Array.isArray(status.validation?.attentions)
    ? Object.freeze(status.validation.attentions.filter((value) => typeof value === 'string' && value).sort())
    : Object.freeze([]);
  return Object.freeze({
    graphRef: stableRef(status.graphRef, `${label}.graphRef`),
    intentRef: stableRef(status.intentRef, `${label}.intentRef`),
    validationState: stableRef(status.state, `${label}.state`),
    active: mapNodes('whatIsHappeningNow'),
    ready: mapNodes('ready'),
    waiting: mapNodes('waiting'),
    needsHuman: mapNodes('needsHuman'),
    blocked: mapNodes('blocked'),
    recentlyCompleted: Object.freeze((status.recentlyCompleted ?? []).map((item, itemIndex) => compactRecent(item, `${label}.recentlyCompleted[${itemIndex}]`))),
    nextSafeAction: compactAction(status.nextSafeAction, `${label}.nextSafeAction`),
    sourceDescent: Object.freeze({
      graphRef: stableRef(status.sourceDescent?.graphRef ?? status.graphRef, `${label}.sourceDescent.graphRef`),
      intentRef: stableRef(status.sourceDescent?.intentRef ?? status.intentRef, `${label}.sourceDescent.intentRef`),
      detailCommand: typeof status.sourceDescent?.detailCommand === 'string' && status.sourceDescent.detailCommand
        ? status.sourceDescent.detailCommand
        : null
    }),
    validationErrors,
    validationAttentions
  });
}

function candidate(graphRef, node, disposition) {
  return Object.freeze({
    graphRef,
    workNodeRef: node.workNodeRef,
    disposition,
    state: node.state,
    priorityClass: node.priorityClass,
    purpose: node.purpose,
    returnRouteRef: node.returnRouteRef,
    waitingReason: node.waitingReason,
    blockingReasonRef: node.blockingReasonRef,
    requiredHumanDecisionRef: node.requiredHumanDecisionRef
  });
}

function candidateSort(left, right) {
  return (DISPOSITION_RANK.get(left.disposition) ?? 99) - (DISPOSITION_RANK.get(right.disposition) ?? 99)
    || left.graphRef.localeCompare(right.graphRef)
    || left.workNodeRef.localeCompare(right.workNodeRef);
}

function continuationHint(candidates) {
  const active = candidates.filter((item) => item.disposition === 'ACTIVE');
  if (active.length === 1) {
    return Object.freeze({
      state: 'UNAMBIGUOUS',
      reason: 'ONE_ACTIVE_WORK_NODE',
      graphRef: active[0].graphRef,
      workNodeRef: active[0].workNodeRef,
      candidateRefs: Object.freeze([active[0].workNodeRef]),
      authority: 'NO_EXECUTION_AUTHORITY'
    });
  }
  if (active.length > 1) {
    return Object.freeze({
      state: 'AMBIGUOUS',
      reason: 'MULTIPLE_ACTIVE_WORK_NODES',
      graphRef: null,
      workNodeRef: null,
      candidateRefs: Object.freeze(active.map((item) => item.workNodeRef)),
      authority: 'NO_EXECUTION_AUTHORITY'
    });
  }

  const human = candidates.filter((item) => item.disposition === 'HUMAN_ATTENTION');
  if (human.length) {
    return Object.freeze({
      state: 'HUMAN_ATTENTION',
      reason: 'BOUNDED_HUMAN_DECISION_REQUIRED',
      graphRef: null,
      workNodeRef: null,
      candidateRefs: Object.freeze(human.map((item) => item.workNodeRef)),
      authority: 'NO_EXECUTION_AUTHORITY'
    });
  }

  const ready = candidates.filter((item) => item.disposition === 'READY');
  if (ready.length === 1) {
    return Object.freeze({
      state: 'UNAMBIGUOUS',
      reason: 'ONE_READY_WORK_NODE',
      graphRef: ready[0].graphRef,
      workNodeRef: ready[0].workNodeRef,
      candidateRefs: Object.freeze([ready[0].workNodeRef]),
      authority: 'NO_EXECUTION_AUTHORITY'
    });
  }
  if (ready.length > 1) {
    return Object.freeze({
      state: 'AMBIGUOUS',
      reason: 'MULTIPLE_READY_WORK_NODES',
      graphRef: null,
      workNodeRef: null,
      candidateRefs: Object.freeze(ready.map((item) => item.workNodeRef)),
      authority: 'NO_EXECUTION_AUTHORITY'
    });
  }

  return Object.freeze({
    state: 'NONE',
    reason: candidates.length ? 'NO_ACTIVE_OR_READY_WORK' : 'NO_CURRENT_WORK',
    graphRef: null,
    workNodeRef: null,
    candidateRefs: Object.freeze([]),
    authority: 'NO_EXECUTION_AUTHORITY'
  });
}

export function projectRefinementCurrent({
  intentStatusProjections,
  runtimeSourceRef
} = {}) {
  if (!Array.isArray(intentStatusProjections)) {
    fail('REFINEMENT_CURRENT_INPUT_INVALID', 'intentStatusProjections must be an array');
  }
  const exactRuntimeSourceRef = stableRef(runtimeSourceRef, 'runtimeSourceRef');
  const graphs = intentStatusProjections.map(compactStatus).sort((left, right) => left.graphRef.localeCompare(right.graphRef));
  if (new Set(graphs.map((graph) => graph.graphRef)).size !== graphs.length) {
    fail('REFINEMENT_CURRENT_INPUT_INVALID', 'intentStatusProjections contain duplicate graphRef values');
  }

  const candidates = [];
  for (const graph of graphs) {
    for (const node of graph.active) candidates.push(candidate(graph.graphRef, node, 'ACTIVE'));
    for (const node of graph.needsHuman) candidates.push(candidate(graph.graphRef, node, 'HUMAN_ATTENTION'));
    for (const node of graph.ready) candidates.push(candidate(graph.graphRef, node, 'READY'));
    for (const node of graph.blocked) candidates.push(candidate(graph.graphRef, node, 'BLOCKED'));
    for (const node of graph.waiting) candidates.push(candidate(graph.graphRef, node, 'WAITING'));
  }
  candidates.sort(candidateSort);

  const invalidGraphRefs = graphs.filter((graph) => graph.validationErrors.length > 0).map((graph) => graph.graphRef);
  const attentionGraphRefs = graphs.filter((graph) => graph.validationAttentions.length > 0 || graph.needsHuman.length > 0).map((graph) => graph.graphRef);

  return Object.freeze({
    schemaVersion: REFINEMENT_CURRENT_PROJECTION_SCHEMA,
    state: 'CURRENT',
    currentness: 'CURRENT',
    sourceRef: REFINEMENT_CURRENT_PROJECTION_SOURCE_REF,
    runtimeSourceRef: exactRuntimeSourceRef,
    effects: false,
    executionAuthority: 'NONE',
    counts: Object.freeze({
      graphs: graphs.length,
      active: candidates.filter((item) => item.disposition === 'ACTIVE').length,
      needsHuman: candidates.filter((item) => item.disposition === 'HUMAN_ATTENTION').length,
      ready: candidates.filter((item) => item.disposition === 'READY').length,
      blocked: candidates.filter((item) => item.disposition === 'BLOCKED').length,
      waiting: candidates.filter((item) => item.disposition === 'WAITING').length
    }),
    continuationHint: continuationHint(candidates),
    continuationCandidates: Object.freeze(candidates),
    graphHealth: Object.freeze({
      invalidGraphRefs: Object.freeze(invalidGraphRefs),
      attentionGraphRefs: Object.freeze(attentionGraphRefs)
    }),
    graphs: Object.freeze(graphs)
  });
}

// [VXG RealForever]
