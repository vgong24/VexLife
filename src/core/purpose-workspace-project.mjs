import {
  PROJECT_CONTINUITY_SNAPSHOT_SCHEMA,
  projectProjectBoard,
  projectProjectGraph,
} from './project-continuity.mjs';
import {
  PROJECT_WORK_TRANSITION_REQUEST_SCHEMA,
  validateProjectWorkTransitionRequest,
} from './project-planning.mjs';
import { PROJECT_RECONCILIATION_SCHEMA } from './project-reconciliation.mjs';
import { semanticHash } from './utils.mjs';

export const PURPOSE_WORKSPACE_PROJECT_PROJECTION_SCHEMA =
  'vexlife.purpose-workspace-project-projection/v1';
export const PURPOSE_WORKSPACE_BOARD_MOVE_SCHEMA =
  'vexlife.purpose-workspace-board-move/v1';

const REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = (value) => structuredClone(value);

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

function stableRef(value, label) {
  if (typeof value !== 'string' || !REF.test(value)) throw new TypeError(`${label} must be one stable ref`);
  return value;
}

function timestamp(value, label) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be one canonical UTC timestamp`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new TypeError(`${label} must be one canonical UTC timestamp`);
  }
  return value;
}

function assertCurrentProjectSnapshot(snapshot) {
  if (!object(snapshot) || snapshot.schemaVersion !== PROJECT_CONTINUITY_SNAPSHOT_SCHEMA ||
      snapshot.currentness !== 'CURRENT' || !SHA256.test(snapshot.semanticFingerprint ?? '')) {
    throw new TypeError('Purpose Workspace Project requires one exact CURRENT Project Continuity snapshot');
  }
  const { semanticFingerprint, ...core } = snapshot;
  if (semanticHash(core) !== semanticFingerprint) {
    throw new TypeError('Purpose Workspace Project snapshot semanticFingerprint mismatch');
  }
  return snapshot;
}

function stateLaneIndex(projectRegistry) {
  const byState = new Map();
  for (const lane of projectRegistry?.boardLanes ?? []) {
    stableRef(lane.laneRef, 'laneRef');
    for (const state of lane.lifecycleStates ?? []) {
      if (byState.has(state)) throw new TypeError(`lifecycle state ${state} belongs to multiple Project Board lanes`);
      byState.set(state, lane.laneRef);
    }
  }
  return byState;
}

function planningProjection(runtime, projectRef) {
  if (runtime === null || runtime === undefined ||
      (runtime?.pointer === null && runtime?.snapshot === null)) {
    return Object.freeze({
      state: 'UNPLANNED',
      currentness: 'CURRENT',
      pointerSha256OrNull: null,
      snapshotFingerprintOrNull: null,
      selectedViewRefOrNull: null,
      iterations: Object.freeze([]),
      iterationMemberships: Object.freeze([]),
      sharedOrders: Object.freeze([]),
      wipPolicies: Object.freeze([]),
    });
  }
  if (!object(runtime) || !object(runtime.pointer) || !object(runtime.snapshot)) {
    throw new TypeError('Purpose Workspace planning runtime must contain pointer + snapshot or be absent');
  }
  const snapshot = runtime.snapshot;
  const pointer = runtime.pointer;
  if (snapshot.schemaVersion !== 'vexlife.project-planning-snapshot/v1' ||
      snapshot.currentness !== 'CURRENT' || snapshot.projectRef !== projectRef ||
      !SHA256.test(snapshot.semanticFingerprint ?? '')) {
    throw new TypeError('Purpose Workspace planning snapshot is not exact CURRENT Project Planning truth');
  }
  const { semanticFingerprint, ...snapshotCore } = snapshot;
  if (semanticHash(snapshotCore) !== semanticFingerprint ||
      pointer.projectRef !== projectRef ||
      pointer.snapshotFingerprint !== semanticFingerprint ||
      !SHA256.test(pointer.pointerSha256 ?? '')) {
    throw new TypeError('Purpose Workspace planning pointer/snapshot binding mismatch');
  }
  return freezeDeep({
    state: 'CURRENT',
    currentness: 'CURRENT',
    pointerSha256OrNull: pointer.pointerSha256,
    snapshotFingerprintOrNull: semanticFingerprint,
    selectedViewRefOrNull: snapshot.selectedViewRefOrNull ?? null,
    iterations: clone(snapshot.iterations ?? []),
    iterationMemberships: clone(snapshot.iterationMemberships ?? []),
    sharedOrders: clone(snapshot.sharedOrders ?? []),
    wipPolicies: clone(snapshot.wipPolicies ?? []),
  });
}

function reconciliationIndex(reconciliations, projectSnapshot) {
  if (!Array.isArray(reconciliations)) throw new TypeError('reconciliations must be an array');
  const byWorkNodeRef = new Map();
  for (const item of reconciliations) {
    if (!object(item) || item.schemaVersion !== PROJECT_RECONCILIATION_SCHEMA ||
        item.projectRef !== projectSnapshot.projectRef ||
        item.projectSnapshotFingerprint !== projectSnapshot.semanticFingerprint ||
        !SHA256.test(item.semanticFingerprint ?? '')) {
      throw new TypeError('Purpose Workspace reconciliation must bind the exact current Project snapshot');
    }
    const { semanticFingerprint, ...core } = item;
    if (semanticHash(core) !== semanticFingerprint) {
      throw new TypeError('Purpose Workspace reconciliation semanticFingerprint mismatch');
    }
    if (byWorkNodeRef.has(item.workNodeRef)) {
      throw new TypeError(`duplicate reconciliation for ${item.workNodeRef}`);
    }
    byWorkNodeRef.set(item.workNodeRef, item);
  }
  return byWorkNodeRef;
}

function moveAffordances(nextStates, stateToLane, visibleLaneRefs) {
  const byLane = new Map();
  for (const state of nextStates) {
    const laneRef = stateToLane.get(state);
    if (!laneRef || !visibleLaneRefs.has(laneRef)) continue;
    if (!byLane.has(laneRef)) byLane.set(laneRef, []);
    byLane.get(laneRef).push(state);
  }
  return [...byLane.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([laneRef, candidateStates]) => Object.freeze({
      laneRef,
      disposition: candidateStates.length === 1 ? 'AVAILABLE' : 'AMBIGUOUS',
      targetStateOrNull: candidateStates.length === 1 ? candidateStates[0] : null,
      candidateStates: Object.freeze([...candidateStates].sort()),
    }));
}

function cardProjection(card, {
  projectSnapshot,
  graphBindings,
  intentRegistry,
  stateToLane,
  visibleLaneRefs,
  reconciliationByWork,
}) {
  const graphBinding = graphBindings.get(card.graphRef);
  if (!graphBinding) throw new TypeError(`Project card ${card.workNodeRef} has no current graph binding`);
  const nextStates = [...(intentRegistry?.allowedTransitions?.[card.state] ?? [])].sort();
  const choices = nextStates.map((state) => Object.freeze({
    state,
    laneRef: stateToLane.get(state) ?? null,
    visibleOnBoard: visibleLaneRefs.has(stateToLane.get(state) ?? ''),
  }));
  const reconciliation = reconciliationByWork.get(card.workNodeRef) ?? null;
  return freezeDeep({
    ...clone(card),
    reconciliation: reconciliation === null ? null : {
      state: reconciliation.state,
      currentness: reconciliation.currentness,
      proofState: reconciliation.proofState,
      providerState: reconciliation.providerState,
      completionEvidenceState: reconciliation.completionEvidenceState,
      attentionRefs: clone(reconciliation.attentionRefs ?? []),
      reconciliationFingerprint: reconciliation.semanticFingerprint,
    },
    interaction: {
      projectSnapshotFingerprint: projectSnapshot.semanticFingerprint,
      graphRef: card.graphRef,
      expectedWorkgraphPointerSha256: graphBinding.currentPointerSha256,
      expectedGraphSemanticFingerprint: graphBinding.semanticFingerprint,
      expectedState: card.state,
      nextStateChoices: choices,
      laneMoveAffordances: moveAffordances(nextStates, stateToLane, visibleLaneRefs),
      transitionAuthority: 'NO_EXECUTION_AUTHORITY',
    },
  });
}

export function heldPurposeWorkspaceProjectProjection(projectRef, reason) {
  if (projectRef !== null) stableRef(projectRef, 'projectRef');
  return freezeDeep({
    schemaVersion: PURPOSE_WORKSPACE_PROJECT_PROJECTION_SCHEMA,
    state: 'HELD_UNAVAILABLE',
    currentness: 'UNKNOWN',
    projectRef,
    projectSnapshotFingerprint: null,
    board: null,
    graph: null,
    planning: null,
    reason: stableRef(reason, 'reason'),
    effects: false,
    executionAuthority: 'NONE',
  });
}

export function projectPurposeWorkspaceProject({
  projectRegistry,
  intentRegistry,
  projectSnapshot,
  boardView,
  planningRuntime = null,
  reconciliations = [],
} = {}) {
  const snapshot = assertCurrentProjectSnapshot(projectSnapshot);
  const board = projectProjectBoard({ registry: projectRegistry, snapshot, view: boardView });
  const graph = projectProjectGraph(snapshot);
  const graphBindings = new Map(snapshot.graphBindings.map((item) => [item.graphRef, item]));
  const stateToLane = stateLaneIndex(projectRegistry);
  const visibleLaneRefs = new Set(board.lanes.map((lane) => lane.laneRef));
  const reconciliationByWork = reconciliationIndex(reconciliations, snapshot);
  const projectedLanes = board.lanes.map((lane) => ({
    laneRef: lane.laneRef,
    label: lane.label,
    cards: lane.cards.map((card) => cardProjection(card, {
      projectSnapshot: snapshot,
      graphBindings,
      intentRegistry,
      stateToLane,
      visibleLaneRefs,
      reconciliationByWork,
    })),
  }));
  const core = {
    schemaVersion: PURPOSE_WORKSPACE_PROJECT_PROJECTION_SCHEMA,
    state: board.state,
    currentness: 'CURRENT',
    projectRef: snapshot.projectRef,
    projectSnapshotFingerprint: snapshot.semanticFingerprint,
    board: {
      schemaVersion: board.schemaVersion,
      state: board.state,
      currentness: board.currentness,
      viewRef: board.viewRef,
      lanes: projectedLanes,
      unplacedWorkNodeRefs: clone(board.unplacedWorkNodeRefs),
      semanticFingerprint: board.semanticFingerprint,
    },
    graph: clone(graph),
    planning: planningProjection(planningRuntime, snapshot.projectRef),
    reconciliationCoverage: Object.freeze({
      supplied: reconciliationByWork.size,
      workNodeRefs: Object.freeze([...reconciliationByWork.keys()].sort()),
    }),
    effects: false,
    executionAuthority: 'NONE',
  };
  return freezeDeep({ ...core, semanticFingerprint: semanticHash(core) });
}

function locateCard(projection, workNodeRef) {
  for (const lane of projection?.board?.lanes ?? []) {
    const card = lane.cards.find((item) => item.workNodeRef === workNodeRef);
    if (card) return { lane, card };
  }
  return null;
}

function moveResult(projection, state, reason, extra = {}) {
  return freezeDeep({
    schemaVersion: PURPOSE_WORKSPACE_BOARD_MOVE_SCHEMA,
    state,
    reason,
    projectRef: projection.projectRef,
    authoritativeProjection: projection,
    effects: false,
    executionAuthority: 'NONE',
    ...extra,
  });
}

export function preparePurposeWorkspaceBoardMove({
  projection,
  projectSnapshot,
  workgraphEntry,
  intentRegistry,
  workNodeRef,
  targetLaneRef,
  targetStateOrNull = null,
  expectedProjectSnapshotFingerprint,
  expectedState,
  actorBinding = null,
  reason = 'Purpose Workspace Board move request',
  requestedAt,
  requestRef,
  transitionRef,
  instanceRef,
} = {}) {
  if (!object(projection) || projection.schemaVersion !== PURPOSE_WORKSPACE_PROJECT_PROJECTION_SCHEMA ||
      projection.currentness !== 'CURRENT' || projection.state === 'HELD_UNAVAILABLE') {
    throw new TypeError('Purpose Workspace Board move requires one current Project projection');
  }
  stableRef(workNodeRef, 'workNodeRef');
  stableRef(targetLaneRef, 'targetLaneRef');
  const located = locateCard(projection, workNodeRef);
  if (!located) return moveResult(projection, 'INVALID_REJECTED', 'WORK_NODE_NOT_IN_CURRENT_BOARD');

  if (expectedProjectSnapshotFingerprint !== projection.projectSnapshotFingerprint ||
      expectedState !== located.card.state) {
    return moveResult(projection, 'STALE_REJECTED', 'AUTHORITATIVE_PROJECT_CHANGED');
  }

  const laneAffordance = located.card.interaction.laneMoveAffordances
    .find((item) => item.laneRef === targetLaneRef);
  const exactChoice = targetStateOrNull === null
    ? null
    : located.card.interaction.nextStateChoices.find((item) =>
      item.state === targetStateOrNull && item.laneRef === targetLaneRef);

  let targetState;
  if (targetStateOrNull !== null) {
    stableRef(targetStateOrNull, 'targetStateOrNull');
    if (!exactChoice) return moveResult(projection, 'INVALID_REJECTED', 'TRANSITION_NOT_ALLOWED');
    targetState = exactChoice.state;
  } else {
    if (!laneAffordance) return moveResult(projection, 'INVALID_REJECTED', 'LANE_MOVE_NOT_ALLOWED');
    if (laneAffordance.disposition !== 'AVAILABLE') {
      return moveResult(projection, 'AMBIGUOUS_REJECTED', 'AMBIGUOUS_LANE_TARGET', {
        candidateStates: clone(laneAffordance.candidateStates),
      });
    }
    targetState = laneAffordance.targetStateOrNull;
  }

  if (actorBinding === null) {
    return moveResult(projection, 'EXECUTION_HELD', 'TRUSTED_ACTOR_BINDING_UNAVAILABLE', {
      selectedTransition: Object.freeze({
        workNodeRef,
        priorState: located.card.state,
        nextState: targetState,
        targetLaneRef,
      }),
    });
  }
  if (!object(actorBinding)) throw new TypeError('actorBinding must be one server-owned object or null');
  for (const field of ['actorRef', 'actorRoleRef', 'processRef']) stableRef(actorBinding[field], `actorBinding.${field}`);
  if (!Array.isArray(actorBinding.sourceRefs) || actorBinding.sourceRefs.length === 0) {
    throw new TypeError('actorBinding.sourceRefs must be non-empty');
  }
  actorBinding.sourceRefs.forEach((item) => stableRef(item, 'actorBinding.sourceRefs'));
  stableRef(requestRef, 'requestRef');
  stableRef(transitionRef, 'transitionRef');
  stableRef(instanceRef, 'instanceRef');
  timestamp(requestedAt, 'requestedAt');

  const request = {
    schemaVersion: PROJECT_WORK_TRANSITION_REQUEST_SCHEMA,
    requestRef,
    projectRef: projection.projectRef,
    graphRef: located.card.graphRef,
    workNodeRef,
    expectedProjectSnapshotFingerprint: projection.projectSnapshotFingerprint,
    expectedWorkgraphPointerSha256: located.card.interaction.expectedWorkgraphPointerSha256,
    expectedGraphSemanticFingerprint: located.card.interaction.expectedGraphSemanticFingerprint,
    expectedState: located.card.state,
    nextState: targetState,
    reason,
    transitionRef,
    actorRef: actorBinding.actorRef,
    actorRoleRef: actorBinding.actorRoleRef,
    processRef: actorBinding.processRef,
    sourceRefs: [...new Set(actorBinding.sourceRefs)].sort(),
    requestedAt,
    instanceRef,
  };
  const validated = validateProjectWorkTransitionRequest({
    request,
    projectSnapshot,
    workgraphEntry,
    intentRegistry,
  });
  return moveResult(projection, 'REQUEST_VALIDATED', null, {
    request: clone(validated.request),
    transition: clone(validated.transition),
    transitionValidationState: validated.state,
  });
}

// [VXG RealForever]
