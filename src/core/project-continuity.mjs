import { buildGraphSnapshotFingerprint } from './intent-workgraph.mjs';
import { validateIntentWorkgraph } from './intent-validation.mjs';
import { semanticHash } from './utils.mjs';

export const PROJECT_DEFINITION_SCHEMA = 'vexlife.project-definition/v1';
export const PROJECT_VIEW_DEFINITION_SCHEMA = 'vexlife.project-view-definition/v1';
export const PROJECT_CONTINUITY_SNAPSHOT_SCHEMA = 'vexlife.project-continuity-snapshot/v1';
export const PROJECT_BOARD_PROJECTION_SCHEMA = 'vexlife.project-board-projection/v1';
export const PROJECT_GRAPH_PROJECTION_SCHEMA = 'vexlife.project-graph-projection/v1';
export const PROJECT_LANE_FOCUS_CARD_SCHEMA = 'vexlife.project-lane-focus-card/v1';

const REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;
const PROJECT_REF = /^project\.[A-Za-z0-9._-]+$/u;
const HEX64 = /^[a-f0-9]{64}$/u;
const clone = (value) => structuredClone(value);
const stableRef = (value) => typeof value === 'string' && REF.test(value);
const canonicalRefs = (values = []) => [...new Set(values)].sort();
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const freezeDeep = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
};

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be one canonical UTC timestamp`);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) {
    throw new TypeError(`${label} must be one canonical UTC timestamp`);
  }
  return value;
}

function uniqueStableRefs(values, label, { allowEmpty = true } = {}) {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0) || values.some((ref) => !stableRef(ref))) {
    throw new TypeError(`${label} must contain ${allowEmpty ? 'only' : 'one or more'} stable refs`);
  }
  if (new Set(values).size !== values.length) throw new TypeError(`${label} must not contain duplicates`);
  return canonicalRefs(values);
}

function sameSet(left, right) {
  return JSON.stringify(canonicalRefs(left)) === JSON.stringify(canonicalRefs(right));
}

function projectDefinitionCore(input) {
  return {
    schemaVersion: PROJECT_DEFINITION_SCHEMA,
    projectRef: input.projectRef,
    label: input.label,
    purpose: input.purpose,
    rootIntentRefs: canonicalRefs(input.rootIntentRefs),
    featureRefs: canonicalRefs(input.featureRefs),
    workFeatureBindings: [...input.workFeatureBindings]
      .map((binding) => ({ workNodeRef: binding.workNodeRef, featureRefs: canonicalRefs(binding.featureRefs) }))
      .sort((left, right) => left.workNodeRef.localeCompare(right.workNodeRef)),
    sourceRefs: canonicalRefs(input.sourceRefs),
    formedAt: input.formedAt,
  };
}

function viewDefinitionCore(input) {
  return {
    schemaVersion: PROJECT_VIEW_DEFINITION_SCHEMA,
    viewRef: input.viewRef,
    projectRef: input.projectRef,
    label: input.label,
    viewClass: input.viewClass,
    laneRefOrder: [...input.laneRefOrder],
    formedAt: input.formedAt,
  };
}

export function validateProjectContinuityRegistry(registry, intentRegistry = null) {
  const errors = [];
  if (!object(registry) || registry.schemaVersion !== 'vexlife.project-continuity-registry/v1') {
    errors.push('project continuity registry schema mismatch');
  }
  if (registry?.registryRef !== 'registry.vexlife.project-continuity.001') {
    errors.push('project continuity registry identity mismatch');
  }
  const viewClasses = registry?.viewClasses ?? [];
  if (!Array.isArray(viewClasses) || new Set(viewClasses).size !== viewClasses.length ||
      !['BOARD', 'GRAPH', 'TABLE', 'ROADMAP'].every((item) => viewClasses.includes(item))) {
    errors.push('project view class vocabulary invalid');
  }
  const lanes = registry?.boardLanes ?? [];
  const laneRefs = new Set();
  const lifecycleToLane = new Map();
  for (const lane of lanes) {
    if (!stableRef(lane?.laneRef) || laneRefs.has(lane.laneRef)) errors.push(`invalid or duplicate board lane ${lane?.laneRef ?? ''}`);
    laneRefs.add(lane?.laneRef);
    if (typeof lane?.label !== 'string' || lane.label.trim().length === 0) errors.push(`board lane ${lane?.laneRef ?? ''} label missing`);
    if (!Array.isArray(lane?.lifecycleStates) || lane.lifecycleStates.length === 0) errors.push(`board lane ${lane?.laneRef ?? ''} states missing`);
    for (const state of lane?.lifecycleStates ?? []) {
      if (lifecycleToLane.has(state)) errors.push(`lifecycle state ${state} mapped to more than one board lane`);
      lifecycleToLane.set(state, lane.laneRef);
    }
  }
  if (intentRegistry) {
    const lifecycleStates = intentRegistry.lifecycleStates ?? [];
    if (!sameSet([...lifecycleToLane.keys()], lifecycleStates)) {
      errors.push('board lane lifecycle coverage must exactly equal canonical Intent Workgraph lifecycle states');
    }
  }
  const priorities = registry?.priorityOrder ?? [];
  if (!Array.isArray(priorities) || priorities.length === 0 || new Set(priorities).size !== priorities.length) {
    errors.push('priority order invalid');
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors), lifecycleToLane });
}

export function createProjectDefinition(input) {
  if (!object(input)) throw new TypeError('project definition must be one object');
  if (input.schemaVersion !== PROJECT_DEFINITION_SCHEMA) throw new TypeError('project definition schema mismatch');
  if (!PROJECT_REF.test(input.projectRef ?? '')) throw new TypeError('projectRef must be one stable project.* ref');
  if (typeof input.label !== 'string' || input.label.trim().length === 0) throw new TypeError('project label is required');
  if (typeof input.purpose !== 'string' || input.purpose.trim().length === 0) throw new TypeError('project purpose is required');
  uniqueStableRefs(input.rootIntentRefs, 'rootIntentRefs', { allowEmpty: false });
  uniqueStableRefs(input.featureRefs, 'featureRefs');
  uniqueStableRefs(input.sourceRefs, 'sourceRefs', { allowEmpty: false });
  canonicalTimestamp(input.formedAt, 'formedAt');
  if (!Array.isArray(input.workFeatureBindings)) throw new TypeError('workFeatureBindings must be an array');
  const workRefs = new Set();
  for (const binding of input.workFeatureBindings) {
    if (!object(binding) || !stableRef(binding.workNodeRef) || workRefs.has(binding.workNodeRef)) {
      throw new TypeError('workFeatureBindings require one unique stable workNodeRef per binding');
    }
    workRefs.add(binding.workNodeRef);
    const featureRefs = uniqueStableRefs(binding.featureRefs, `${binding.workNodeRef}.featureRefs`, { allowEmpty: false });
    if (featureRefs.some((ref) => !input.featureRefs.includes(ref))) {
      throw new TypeError(`${binding.workNodeRef} binds a feature outside project.featureRefs`);
    }
  }
  const core = projectDefinitionCore(input);
  const semanticFingerprint = semanticHash(core);
  if (input.semanticFingerprint && input.semanticFingerprint !== semanticFingerprint) {
    throw new TypeError('project definition semanticFingerprint mismatch');
  }
  return freezeDeep({ ...core, semanticFingerprint });
}

export function createProjectViewDefinition(input, registry) {
  if (!object(input)) throw new TypeError('project view definition must be one object');
  if (input.schemaVersion !== PROJECT_VIEW_DEFINITION_SCHEMA) throw new TypeError('project view definition schema mismatch');
  if (!stableRef(input.viewRef) || !PROJECT_REF.test(input.projectRef ?? '')) throw new TypeError('project view identity invalid');
  if (typeof input.label !== 'string' || input.label.trim().length === 0) throw new TypeError('project view label is required');
  if (!(registry?.viewClasses ?? []).includes(input.viewClass)) throw new TypeError(`unsupported project view class ${input.viewClass}`);
  canonicalTimestamp(input.formedAt, 'formedAt');
  const knownLanes = new Set((registry?.boardLanes ?? []).map((lane) => lane.laneRef));
  const laneRefOrder = input.laneRefOrder ?? [];
  uniqueStableRefs(laneRefOrder, 'laneRefOrder');
  if (input.viewClass === 'BOARD') {
    if (laneRefOrder.length === 0 || laneRefOrder.some((ref) => !knownLanes.has(ref))) {
      throw new TypeError('BOARD view requires only registered lane refs');
    }
  } else if (laneRefOrder.length !== 0) {
    throw new TypeError('non-BOARD view must not define laneRefOrder');
  }
  const core = viewDefinitionCore({ ...input, laneRefOrder });
  const semanticFingerprint = semanticHash(core);
  if (input.semanticFingerprint && input.semanticFingerprint !== semanticFingerprint) {
    throw new TypeError('project view semanticFingerprint mismatch');
  }
  return freezeDeep({ ...core, semanticFingerprint });
}

function assertCanonicalWorkgraph(graph, projectRef, intentRegistry, validationContext) {
  if (!object(graph) || graph.schemaVersion !== 'vexlife.intent-workgraph/v0') {
    throw new TypeError('project continuity requires canonical Intent Workgraph snapshots');
  }
  if (graph.intent?.projectRef !== projectRef || graph.rootIntentRef !== graph.intent?.intentRef) {
    throw new TypeError(`workgraph ${graph.graphRef ?? ''} is not bound to exact project ${projectRef}`);
  }
  if (!HEX64.test(graph.semanticFingerprint ?? '') || buildGraphSnapshotFingerprint(graph) !== graph.semanticFingerprint) {
    throw new TypeError(`workgraph ${graph.graphRef ?? ''} semantic fingerprint is not canonical`);
  }
  if (!object(validationContext)) throw new TypeError('project continuity requires canonical Intent Workgraph validation context');
  const validation = validateIntentWorkgraph(graph, {
    registry: intentRegistry,
    registeredProcessRefs: validationContext.registeredProcessRefs ?? [],
    registeredRoleRefs: validationContext.registeredRoleRefs ?? [],
    trustSnapshot: validationContext.trustSnapshot ?? null,
  });
  if (!validation.ok) {
    throw new TypeError(`workgraph ${graph.graphRef ?? ''} is not valid current Intent Workgraph truth: ${validation.errors[0] ?? validation.state}`);
  }
  return { graph, validation };
}

function lastTransitionFor(graph, workNodeRef) {
  const matches = (graph.transitions ?? []).filter((item) => item.workNodeRef === workNodeRef && Number.isInteger(item.sequence));
  matches.sort((left, right) => left.sequence - right.sequence || left.transitionRef.localeCompare(right.transitionRef));
  return matches.at(-1) ?? null;
}

function currentAssignmentFor(graph, workNodeRef) {
  const current = (graph.acceptedAssignments ?? []).filter((item) => item.workNodeRef === workNodeRef && item.assignmentState === 'CURRENT');
  if (current.length > 1) throw new TypeError(`work node ${workNodeRef} has conflicting current assignments`);
  return current[0] ?? null;
}

function currentReceiptRefsFor(graph, workNodeRef) {
  return canonicalRefs((graph.receipts ?? [])
    .filter((item) => item.workNodeRef === workNodeRef && item.currentness === 'CURRENT')
    .map((item) => item.receiptRef));
}

function relationEdges(cards) {
  const refs = new Set(cards.map((card) => card.workNodeRef));
  const edges = [];
  for (const card of cards) {
    if (card.parentWorkNodeRef !== null) {
      if (!refs.has(card.parentWorkNodeRef)) throw new TypeError(`${card.workNodeRef} parent is outside compiled project`);
      edges.push({ relation: 'CONTAINS', fromRef: card.parentWorkNodeRef, toRef: card.workNodeRef });
    }
    for (const dependencyRef of card.dependencyRefs) {
      if (!refs.has(dependencyRef)) throw new TypeError(`${card.workNodeRef} dependency ${dependencyRef} is outside compiled project`);
      edges.push({ relation: 'DEPENDS_ON', fromRef: card.workNodeRef, toRef: dependencyRef });
    }
    for (const featureRef of card.featureRefs) {
      edges.push({ relation: 'RELATES_TO_FEATURE', fromRef: card.workNodeRef, toRef: featureRef });
    }
  }
  return edges.sort((left, right) =>
    left.relation.localeCompare(right.relation) || left.fromRef.localeCompare(right.fromRef) || left.toRef.localeCompare(right.toRef));
}

export function compileProjectContinuity({
  registry, intentRegistry, project: rawProject, workgraphs = [],
  intentValidationContext = null, registeredFeatureRefs = null,
} = {}) {
  const registryValidation = validateProjectContinuityRegistry(registry, intentRegistry);
  if (!registryValidation.ok) throw new TypeError(registryValidation.errors[0]);
  const project = createProjectDefinition(rawProject);
  if (!Array.isArray(registeredFeatureRefs)) throw new TypeError('project continuity requires current registeredFeatureRefs');
  const knownFeatureRefs = new Set(registeredFeatureRefs);
  for (const featureRef of project.featureRefs) {
    if (!knownFeatureRefs.has(featureRef)) throw new TypeError(`project references unregistered feature ${featureRef}`);
  }
  if (!Array.isArray(workgraphs) || workgraphs.length === 0) throw new TypeError('one or more current Workgraphs are required');
  const validatedGraphs = workgraphs.map((graph) => assertCanonicalWorkgraph(
    graph, project.projectRef, intentRegistry, intentValidationContext
  ));
  const graphs = validatedGraphs.map((item) => item.graph);
  const validationByGraphRef = new Map(validatedGraphs.map((item) => [item.graph.graphRef, item.validation]));
  const graphRefs = new Set();
  const rootIntentRefs = new Set();
  const workNodeRefs = new Set();
  const featurByWork = new Map(project.workFeatureBindings.map((binding) => [binding.workNodeRef, binding.featureRefs]);
  const cards = [];
  for (const graph of graphs) {
    if (!stableRef(graph.graphRef) || graphRefs.has(graph.graphRef)) throw new TypeError(`duplicate or invalid graphRef ${graph.graphRef ?? ''}`);
    graphRefs.add(graph.graphRef);
    rootIntentRefs.add(graph.rootIntentRef);
    for (const node of graph.nodes ?? []) {
      if (!stableRef(node.workNodeRef) || workNodeRefs.has(node.workNodeRef)) throw new TypeError(`duplicate or invalid workNodeRef ${node.workNodeRef ?? ''}`);
      workNodeRefs.add(node.workNodeRef);
      const transition = lastTransitionFor(graph, node.workNodeRef);
      const assignment = currentAssignmentFor(graph, node.workNodeRef);
      cards.push({
        graphRef: graph.graphRef,
        rootIntentRef: graph.rootIntentRef,
        workNodeRef: node.workNodeRef,
        purpose: node.purpose,
        state: node.state,
        priorityClass: node.priorityClass,
        roleRef: node.roleRef,
        parentWorkNodeRef: node.parentWorkNodeRef ?? null,
        dependencyRefs: canonicalRefs(node.dependencyRefs ?? []),
        childRefs: canonicalRefs(node.childRefs ?? []),
        featureRefs: canonicalRefs(featureByWork.get(node.workNodeRef) ?? []),
        completionGateRefs: canonicalRefs(node.completionGateRefs ?? []),
        sourceRefs: canonicalRefs(node.sourceRefs ?? []),
        createdAt: canonicalTimestamp(node.createdAt, `${node.workNodeRef}.createdAt`),
        lastTransitionRef: transition?.transitionRef ?? null,
        lastTransitionAt: transition ? canonicalTimestamp(transition.createdAt, `${node.workNodeRef}.lastTransitionAt`) : null,
        currentReceiptRefs: currentReceiptRefsFor(graph, node.workNodeRef),
        assignment: assignment ? {
          assignmentRef: assignment.assignmentRef,
          assigneeRef: assignment.assigneeRef,
          acceptedAt: canonicalTimestamp(assignment.acceptedAt, `${node.workNodeRef}.assignment.acceptedAt`),
        } : null,
      });
    }
  }
  if (!sameSet([...rootIntentRefs], project.rootIntentRefs)) {
    throw new TypeError('project.rootIntentRefs must exactly equal compiled Workgraph root intents');
  }
  for (const binding of project.workFeatureBindings) {
    if (!workNodeRefs.has(binding.workNodeRef)) throw new TypeError(`feature binding references unknown work node ${binding.workNodeRef}`);
  }
  cards.sort((left, right) => left.workNodeRef.localeCompare(right.workNodeRef));
  const graphBindings = graphs.map((graph) => {
    const validation = validationByGraphRef.get(graph.graphRef);
    return {
      graphRef: graph.graphRef,
      rootIntentRef: graph.rootIntentRef,
      semanticFingerprint: graph.semanticFingerprint,
      validationState: validation.state,
      validationSemanticHash: validation.semanticHash,
      createdAt: canonicalTimestamp(graph.createdAt, `${graph.graphRef}.createdAt`),
    };
  }).sort((left, right) => left.graphRef.localeCompare(right.graphRef));
  const edges = relationEdges(cards);
  const core = {
    schemaVersion: PROJECT_CONTINUITY_SNAPSHOT_SCHEMA,
    state: 'CURRENT',
    currentness: 'CURRENT',
    projectRef: project.projectRef,
    projectDefinitionFingerprint: project.semanticFingerprint,
    graphBindings,
    cards,
    edges,
    sourceRefs: project.sourceRefs,
    effects: false,
    executionAuthority: 'NONE',
  };
  return freezeDeep({ ...core, semanticFingerprint: semanticHash(core) });
}

function laneMap(registry) {
  return new Map((registry.boardLanes ?? []).flatMap((lane) => lane.lifecycleStates.map((state) => [state, lane.laneRef]));
}

function priorityRank(priority, registry) {
  const index = (registry.priorityOrder ?? []).indexOf(priority);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function sortedCards(cards, registry) {
  return [...cards].sort((left, right) =>
    priorityRank(left.priorityClass, registry) - priorityRank(right.priorityClass, registry)
    || left.createdAt.localeCompare(right.createdAt)
    || left.workNodeRef.localeCompare(right.workNodeRef));
}

export function projectProjectBoard({ registry, snapshot, view: rawView } = {}) {
  const view = createProjectViewDefinition(rawView, registry);
  if (view.projectRef !== snapshot?.projectRef) throw new TypeError('project view does not match snapshot projectRef');
  if (view.viewClass !== 'BOARD') throw new TypeError('projectProjectBoard requires a BOARD view');
  if (snapshot?.schemaVersion !== PROJECT_CONTINUITY_SNAPSHOT_SCHEMA || snapshot?.currentness !== 'CURRENT') {
    throw new TypeError('project board requires one current project-continuity snapshot');
  }
  const byLane = new Map(view.laneRefOrder.map((ref) => [ref, []]));
  const stateToLane = laneMap(registry);
  const unplaced = [];
  for (const card of snapshot.cards) {
    const laneRef = stateToLane.get(card.state);
    if (!laneRef || !byLane.has(laneRef)) unplaced.push(card);
    else byLane.get(laneRef).push(card);
  }
  const laneLabels = new Map((registry.boardLanes ?? []).map((lane) => [lane.laneRef, lane.label]));
  const lanes = view.laneRefOrder.map((laneRef) => ({
    laneRef,
    label: laneLabels.get(laneRef) ?? laneRef,
    cards: sortedCards(byLane.get(laneRef) ?? [], registry),
  }));
  const core = {
    schemaVersion: PROJECT_BOARD_PROJECTION_SCHEMA,
    state: unplaced.length === 0 ? 'CURRENT' : 'ATTENTION',
    currentness: snapshot.currentness,
    projectRef: snapshot.projectRef,
    viewRef: view.viewRef,
    projectSnapshotFingerprint: snapshot.semanticFingerprint,
    lanes,
    unplacedWorkNodeRefs: unplaced.map((item) => item.workNodeRef).sort(),
    effects: false,
    executionAuthority: 'NONE',
  };
  return freezeDeep({ ...core, semanticFingerprint: semanticHash(core) });
}

export function projectProjectGraph(snapshot) {
  if (snapshot?.schemaVersion !== PROJECT_CONTINUITY_SNAPSHOT_SCHEMA || snapshot?.currentness !== 'CURRENT') {
    throw new TypeError('project graph requires one current project-continuity snapshot');
  }
  const core = {
    schemaVersion: PROJECT_GRAPH_PROJECTION_SCHEMA,
    state: 'CURRENT',
    currentness: snapshot.currentness,
    projectRef: snapshot.projectRef,
    projectSnapshotFingerprint: snapshot.semanticFingerprint,
    nodes: snapshot.cards.map((card) => ({
      workNodeRef: card.workNodeRef,
      purpose: card.purpose,
      state: card.state,
      priorityClass: card.priorityClass,
      roleRef: card.roleRef,
      featureRefs: card.featureRefs,
    })),
    edges: clone(snapshot.edges),
    effects: false,
    executionAuthority: 'NONE',
  };
  return freezeDeep({ ...core, semanticFingerprint: semanticHash(core) });
}

export function formLaneFocusCard({ snapshot, workNodeRef, intentRegistry } = {}) {
  if (snapshot?.schemaVersion !== PROJECT_CONTINUITY_SNAPSHOT_SCHEMA || snapshot?.currentness !== 'CURRENT') {
    throw new TypeError('Lane Focus Card requires one current project-continuity snapshot');
  }
  const card = snapshot.cards.find((item) => item.workNodeRef === workNodeRef);
  if (!card) throw new TypeError(`unknown work node ${workNodeRef}`);
  const dependents = snapshot.cards.filter((item) => item.dependencyRefs.includes(workNodeRef)).map((item) => item.workNodeRef).sort();
  const core = {
    schemaVersion: PROJECT_LANE_FOCUS_CARD_SCHEMA,
    state: 'CURRENT',
    currentness: snapshot.currentness,
    projectRef: snapshot.projectRef,
    projectSnapshotFingerprint: snapshot.semanticFingerprint,
    workNode: clone(card),
    relationships: {
      parentWorkNodeRef: card.parentWorkNodeRef,
      childWorkNodeRefs: clone(card.childRefs),
      dependencyWorkNodeRefs: clone(card.dependencyRefs),
      dependentWorkNodeRefs: dependents,
    },
    possibleLifecycleTransitions: clone(intentRegistry?.allowedTransitions?.[card.state] ?? []),
    transitionAuthority: 'NO_EXECUTION_AUTHORITY',
    effects: false,
    executionAuthority: 'NONE',
  };
  return freezeDeep({ ...core, semanticFingerprint: semanticHash(core) });
}

// [VXG RealForever]
