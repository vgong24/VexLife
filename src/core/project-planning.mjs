import { PROJECT_CONTINUITY_SNAPSHOT_SCHEMA } from './project-continuity.mjs';
import { transitionAllowed as intentTransitionAllowed } from './intent-validation.mjs';
import { semanticHash } from './utils.mjs';

export const PROJECT_PLANNING_TRANSACTION_SCHEMA = 'vexlife.project-planning-transaction/v1';
export const PROJECT_PLANNING_EVENT_SCHEMA = 'vexlife.project-planning-event/v1';
export const PROJECT_PLANNING_SNAPSHOT_SCHEMA = 'vexlife.project-planning-snapshot/v1';
export const PROJECT_WORK_TRANSITION_REQUEST_SCHEMA = 'vexlife.project-work-transition-request/v1';

const REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;
const PROJECT_REF = /^project\.[A-Za-z0-9._-]+$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = (value) => structuredClone(value);
const canonicalRefs = (values = []) => [...new Set(values)].sort();

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

function stableRef(value, label) {
  if (typeof value !== 'string' || !REF.test(value)) throw new TypeError(`${label} must be one stable ref`);
  return value;
}

function projectRef(value, label = 'projectRef') {
  if (typeof value !== 'string' || !PROJECT_REF.test(value)) throw new TypeError(`${label} must be one project.* ref`);
  return value;
}

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be one canonical UTC timestamp`);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) {
    throw new TypeError(`${label} must be one canonical UTC timestamp`);
  }
  return value;
}

function sha256OrNull(value, label) {
  if (value !== null && (typeof value !== 'string' || !SHA256.test(value))) {
    throw new TypeError(`${label} must be null or lowercase SHA-256`);
  }
  return value;
}

function uniqueStableRefs(values, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || !REF.test(value))) {
    throw new TypeError(`${label} must contain only stable refs`);
  }
  if (new Set(values).size !== values.length) throw new TypeError(`${label} must not contain duplicates`);
  return canonicalRefs(values);
}

function exactKeys(value, keys, label) {
  if (!object(value)) throw new TypeError(`${label} must be one object`);
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new TypeError(`${label} fields must be exactly ${expected.join(',')}`);
  }
}

function registryEvent(registry, eventClass) {
  const definition = (registry?.planningEventClasses ?? []).find((item) => item.eventClass === eventClass);
  if (!definition) throw new TypeError(`unsupported project planning eventClass ${eventClass}`);
  return definition;
}

export function validateProjectPlanningRegistry(registry) {
  const errors = [];
  if (!object(registry) || registry.schemaVersion !== 'vexlife.project-planning-registry/v1') {
    errors.push('project planning registry schema mismatch');
  }
  if (registry?.registryRef !== 'registry.vexlife.project-planning.001') {
    errors.push('project planning registry identity mismatch');
  }
  const classes = registry?.planningEventClasses ?? [];
  const classRefs = classes.map((item) => item?.eventClass);
  if (!Array.isArray(classes) || classes.length !== 6 || new Set(classRefs).size !== classes.length) {
    errors.push('project planning event vocabulary invalid');
  }
  for (const item of classes) {
    if (typeof item?.eventClass !== 'string' || !REF.test(item.eventClass) ||
        !Array.isArray(item?.requiredPayloadFields) || item.requiredPayloadFields.length === 0 ||
        new Set(item.requiredPayloadFields).size !== item.requiredPayloadFields.length) {
      errors.push(`project planning event definition invalid: ${item?.eventClass ?? ''}`);
    }
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function assertProjectSnapshot(projectSnapshot, project) {
  if (!object(projectSnapshot) ||
      projectSnapshot.schemaVersion !== PROJECT_CONTINUITY_SNAPSHOT_SCHEMA ||
      projectSnapshot.currentness !== 'CURRENT' ||
      projectSnapshot.projectRef !== project) {
    throw new TypeError(`project planning requires one CURRENT Project Continuity snapshot for ${project}`);
  }
  if (typeof projectSnapshot.semanticFingerprint !== 'string' || !SHA256.test(projectSnapshot.semanticFingerprint)) {
    throw new TypeError('project snapshot semanticFingerprint is required');
  }
  return projectSnapshot;
}

function basePlanningState(project) {
  return {
    projectRef: project,
    iterations: [],
    iterationMemberships: [],
    sharedOrders: [],
    wipPolicies: [],
    selectedViewRefOrNull: null
  };
}

function planningStateFromSnapshot(snapshot) {
  if (snapshot === null) return null;
  if (!object(snapshot) || snapshot.schemaVersion !== PROJECT_PLANNING_SNAPSHOT_SCHEMA ||
      snapshot.currentness !== 'CURRENT' || !PROJECT_REF.test(snapshot.projectRef ?? '') ||
      typeof snapshot.semanticFingerprint !== 'string' || !SHA256.test(snapshot.semanticFingerprint)) {
    throw new TypeError('current Project Planning snapshot is invalid');
  }
  const { semanticFingerprint, ...core } = snapshot;
  if (semanticHash(core) !== semanticFingerprint) throw new TypeError('Project Planning snapshot semanticFingerprint mismatch');
  return snapshot;
}

function transactionCore(input) {
  return {
    schemaVersion: PROJECT_PLANNING_TRANSACTION_SCHEMA,
    transactionRef: input.transactionRef,
    eventRef: input.eventRef,
    projectRef: input.projectRef,
    eventClass: input.eventClass,
    payload: clone(input.payload),
    expectedPlanningPointerSha256OrNull: input.expectedPlanningPointerSha256OrNull,
    expectedPlanningSnapshotFingerprintOrNull: input.expectedPlanningSnapshotFingerprintOrNull,
    instanceRef: input.instanceRef,
    actorRef: input.actorRef,
    sourceRefs: canonicalRefs(input.sourceRefs),
    formedAt: input.formedAt
  };
}

export function createProjectPlanningTransaction(input, registry) {
  if (!object(input)) throw new TypeError('project planning transaction must be one object');
  if (input.schemaVersion !== PROJECT_PLANNING_TRANSACTION_SCHEMA) throw new TypeError('project planning transaction schema mismatch');
  stableRef(input.transactionRef, 'transactionRef');
  stableRef(input.eventRef, 'eventRef');
  projectRef(input.projectRef);
  const definition = registryEvent(registry, input.eventClass);
  exactKeys(input.payload, definition.requiredPayloadFields, `${input.eventClass}.payload`);
  sha256OrNull(input.expectedPlanningPointerSha256OrNull, 'expectedPlanningPointerSha256OrNull');
  sha256OrNull(input.expectedPlanningSnapshotFingerprintOrNull, 'expectedPlanningSnapshotFingerprintOrNull');
  stableRef(input.instanceRef, 'instanceRef');
  stableRef(input.actorRef, 'actorRef');
  uniqueStableRefs(input.sourceRefs, 'sourceRefs');
  if (input.sourceRefs.length === 0) throw new TypeError('sourceRefs must be non-empty');
  canonicalTimestamp(input.formedAt, 'formedAt');
  const core = transactionCore(input);
  const semanticFingerprint = semanticHash(core);
  if (input.semanticFingerprint && input.semanticFingerprint !== semanticFingerprint) {
    throw new TypeError('project planning transaction semanticFingerprint mismatch');
  }
  return freezeDeep({ ...core, semanticFingerprint });
}

function validateIterationPayload(payload) {
  stableRef(payload.iterationRef, 'iterationRef');
  if (typeof payload.label !== 'string' || payload.label.trim().length === 0) throw new TypeError('iteration label is required');
  const startsAt = canonicalTimestamp(payload.startsAt, 'startsAt');
  const endsAt = canonicalTimestamp(payload.endsAt, 'endsAt');
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new TypeError('iteration endsAt must be after startsAt');
  return {
    iterationRef: payload.iterationRef,
    label: payload.label,
    startsAt,
    endsAt,
    closedAtOrNull: null,
    finalWorkNodeRefs: [],
  };
}

function knownWorkRefs(projectSnapshot) {
  return new Set((projectSnapshot.cards ?? []).map((card) => card.workNodeRef));
}

function validateEventPayload(transaction, currentState, context) {
  const payload = transaction.payload;
  const workRefs = knownWorkRefs(context.projectSnapshot);
  const laneRefs = new Set(context.knownLaneRefs ?? []);
  const viewRefs = new Set(context.knownViewRefs ?? []);
  if (transaction.eventClass === 'ITERATION_DEFINED') {
    const iteration = validateIterationPayload(payload);
    if (currentState.iterations.some((item) => item.iterationRef === iteration.iterationRef)) {
      throw new TypeError(`iteration already defined: ${iteration.iterationRef}`);
    }
    return iteration;
  }
  if (transaction.eventClass === 'ITERATION_CLOSED') {
    stableRef(payload.iterationRef, 'iterationRef');
    const iteration = currentState.iterations.find((item) => item.iterationRef === payload.iterationRef);
    if (!iteration) throw new TypeError(`unknown iteration ${payload.iterationRef}`);
    if (iteration.closedAtOrNull !== null) throw new TypeError(`iteration already closed: ${payload.iterationRef}`);
    const closedAt = canonicalTimestamp(payload.closedAt, 'closedAt');
    if (Date.parse(closedAt) < Date.parse(iteration.startsAt)) {
      throw new TypeError('iteration closedAt must not be before startsAt');
    }
    return { iterationRef: payload.iterationRef, closedAt };
  }
  if (transaction.eventClass === 'ITERATION_MEMBERSHIP_SET') {
    stableRef(payload.workNodeRef, 'workNodeRef');
    if (!workRefs.has(payload.workNodeRef)) throw new TypeError(`unknown project work node ${payload.workNodeRef}`);
    if (payload.iterationRefOrNull !== null) {
      stableRef(payload.iterationRefOrNull, 'iterationRefOrNull');
      const iteration = currentState.iterations.find((item) => item.iterationRef === payload.iterationRefOrNull);
      if (!iteration) throw new TypeError(`unknown iteration ${payload.iterationRefOrNull}`);
      if (iteration.closedAtOrNull !== null) {
        throw new TypeError(`cannot add work to closed iteration ${payload.iterationRefOrNull}`);
      }
    }
    return { workNodeRef: payload.workNodeRef, iterationRefOrNull: payload.iterationRefOrNull };
  }
  if (transaction.eventClass === 'SHARED_ORDER_SET') {
    stableRef(payload.scopeRef, 'scopeRef');
    const orderedWorkNodeRefs = uniqueStableRefs(payload.orderedWorkNodeRefs, 'orderedWorkNodeRefs');
    if (orderedWorkNodeRefs.some((ref) => !workRefs.has(ref))) throw new TypeError('shared order contains work outside the project');
    return { scopeRef: payload.scopeRef, orderedWorkNodeRefs };
  }
  if (transaction.eventClass === 'WIP_POLICY_SET') {
    stableRef(payload.laneRef, 'laneRef');
    if (!laneRefs.has(payload.laneRef)) throw new TypeError(`unknown project lane ${payload.laneRef}`);
    if (!Number.isInteger(payload.limit) || payload.limit < 1) throw new TypeError('WIP limit must be a positive integer');
    return { laneRef: payload.laneRef, limit: payload.limit };
  }
  if (transaction.eventClass === 'VIEW_SELECTED') {
    stableRef(payload.viewRef, 'viewRef');
    if (!viewRefs.has(payload.viewRef)) throw new TypeError(`unknown project view ${payload.viewRef}`);
    return { viewRef: payload.viewRef };
  }
  throw new TypeError(`unsupported project planning eventClass ${transaction.eventClass}`);
}

function nextPlanningState(currentState, transaction, payload) {
  const next = clone(currentState);
  if (transaction.eventClass === 'ITERATION_DEFINED') {
    next.iterations.push(payload);
    next.iterations.sort((left, right) => left.iterationRef.localeCompare(right.iterationRef));
  } else if (transaction.eventClass === 'ITERATION_CLOSED') {
    next.iterations = next.iterations.map((item) => item.iterationRef === payload.iterationRef
      ? {
          ...item,
          closedAtOrNull: payload.closedAt,
          finalWorkNodeRefs: next.iterationMemberships
            .filter((membership) => membership.iterationRef === payload.iterationRef)
            .map((membership) => membership.workNodeRef)
            .sort(),
        }
      : item);
  } else if (transaction.eventClass === 'ITERATION_MEMBERSHIP_SET') {
    next.iterationMemberships = next.iterationMemberships.filter((item) => item.workNodeRef !== payload.workNodeRef);
    if (payload.iterationRefOrNull !== null) {
      next.iterationMemberships.push({ workNodeRef: payload.workNodeRef, iterationRef: payload.iterationRefOrNull });
      next.iterationMemberships.sort((left, right) => left.workNodeRef.localeCompare(right.workNodeRef));
    }
  } else if (transaction.eventClass === 'SHARED_ORDER_SET') {
    next.sharedOrders = next.sharedOrders.filter((item) => item.scopeRef !== payload.scopeRef);
    next.sharedOrders.push({ scopeRef: payload.scopeRef, orderedWorkNodeRefs: payload.orderedWorkNodeRefs });
    next.sharedOrders.sort((left, right) => left.scopeRef.localeCompare(right.scopeRef));
  } else if (transaction.eventClass === 'WIP_POLICY_SET') {
    next.wipPolicies = next.wipPolicies.filter((item) => item.laneRef !== payload.laneRef);
    next.wipPolicies.push(payload);
    next.wipPolicies.sort((left, right) => left.laneRef.localeCompare(right.laneRef));
  } else if (transaction.eventClass === 'VIEW_SELECTED') {
    next.selectedViewRefOrNull = payload.viewRef;
  }
  return next;
}

function semanticPlanningState(value) {
  return semanticHash({
    projectRef: value.projectRef,
    iterations: value.iterations,
    iterationMemberships: value.iterationMemberships,
    sharedOrders: value.sharedOrders,
    wipPolicies: value.wipPolicies,
    selectedViewRefOrNull: value.selectedViewRefOrNull
  });
}

function eventCore(transaction, sequence, priorEventRefOrNull, priorEventFingerprintOrNull, payload) {
  return {
    schemaVersion: PROJECT_PLANNING_EVENT_SCHEMA,
    eventRef: transaction.eventRef,
    transactionRef: transaction.transactionRef,
    projectRef: transaction.projectRef,
    sequence,
    priorEventRefOrNull,
    priorEventFingerprintOrNull,
    eventClass: transaction.eventClass,
    payload: clone(payload),
    actorRef: transaction.actorRef,
    sourceRefs: clone(transaction.sourceRefs),
    formedAt: transaction.formedAt
  };
}

function snapshotCore(currentSnapshot, event, nextState) {
  const eventRefs = [...(currentSnapshot?.eventRefs ?? []), event.eventRef];
  return {
    schemaVersion: PROJECT_PLANNING_SNAPSHOT_SCHEMA,
    currentness: 'CURRENT',
    projectRef: nextState.projectRef,
    eventCount: eventRefs.length,
    eventRefs,
    lastEventRefOrNull: event.eventRef,
    lastEventFingerprintOrNull: event.semanticFingerprint,
    iterations: nextState.iterations,
    iterationMemberships: nextState.iterationMemberships,
    sharedOrders: nextState.sharedOrders,
    wipPolicies: nextState.wipPolicies,
    selectedViewRefOrNull: nextState.selectedViewRefOrNull
  };
}

export function applyProjectPlanningTransaction({
  snapshot = null,
  transaction: rawTransaction,
  projectSnapshot,
  knownLaneRefs = [],
  knownViewRefs = [],
  registry
} = {}) {
  const registryValidation = validateProjectPlanningRegistry(registry);
  if (!registryValidation.ok) throw new TypeError(registryValidation.errors[0]);
  const transaction = createProjectPlanningTransaction(rawTransaction, registry);
  assertProjectSnapshot(projectSnapshot, transaction.projectRef);
  const current = planningStateFromSnapshot(snapshot);
  if (current !== null && current.projectRef !== transaction.projectRef) {
    throw new TypeError('Project Planning snapshot belongs to a different project');
  }
  if (current === null && transaction.expectedPlanningSnapshotFingerprintOrNull !== null) {
    throw new TypeError('planning transaction expected a current snapshot but none exists');
  }
  if (current !== null && current.semanticFingerprint !== transaction.expectedPlanningSnapshotFingerprintOrNull) {
    throw new TypeError('Project Planning snapshot changed before transaction admission');
  }
  if (current?.eventRefs?.includes(transaction.eventRef)) {
    throw new TypeError(`duplicate project planning eventRef ${transaction.eventRef}`);
  }

  const state = current === null ? basePlanningState(transaction.projectRef) : {
    projectRef: current.projectRef,
    iterations: clone(current.iterations),
    iterationMemberships: clone(current.iterationMemberships),
    sharedOrders: clone(current.sharedOrders),
    wipPolicies: clone(current.wipPolicies),
    selectedViewRefOrNull: current.selectedViewRefOrNull
  };
  const payload = validateEventPayload(transaction, state, { projectSnapshot, knownLaneRefs, knownViewRefs });
  const nextState = nextPlanningState(state, transaction, payload);
  if (semanticPlanningState(nextState) === semanticPlanningState(state)) {
    return freezeDeep({ changed: false, reason: 'SEMANTIC_NO_OP', transaction, event: null, snapshot: current });
  }

  const sequence = current?.eventCount ?? 0;
  const eventBody = eventCore(
    transaction,
    sequence,
    current?.lastEventRefOrNull ?? null,
    current?.lastEventFingerprintOrNull ?? null,
    payload
  );
  const event = freezeDeep({ ...eventBody, semanticFingerprint: semanticHash(eventBody) });
  const body = snapshotCore(current, event, nextState);
  const nextSnapshot = freezeDeep({ ...body, semanticFingerprint: semanticHash(body) });
  return freezeDeep({ changed: true, reason: null, transaction, event, snapshot: nextSnapshot });
}

export function replayProjectPlanningEvents({
  events = [],
  projectSnapshot,
  knownLaneRefs = [],
  knownViewRefs = [],
  registry
} = {}) {
  if (!Array.isArray(events)) throw new TypeError('events must be an array');
  let snapshot = null;
  for (const [index, raw] of events.entries()) {
    if (!object(raw) || raw.schemaVersion !== PROJECT_PLANNING_EVENT_SCHEMA) {
      throw new TypeError(`planning event ${index} schema mismatch`);
    }
    if (raw.sequence !== index) throw new TypeError(`planning event ${raw.eventRef ?? index} sequence is not contiguous`);
    if (raw.priorEventRefOrNull !== (snapshot?.lastEventRefOrNull ?? null) ||
        raw.priorEventFingerprintOrNull !== (snapshot?.lastEventFingerprintOrNull ?? null)) {
      throw new TypeError(`planning event ${raw.eventRef ?? index} prior binding mismatch`);
    }
    const transaction = {
      schemaVersion: PROJECT_PLANNING_TRANSACTION_SCHEMA,
      transactionRef: raw.transactionRef,
      eventRef: raw.eventRef,
      projectRef: raw.projectRef,
      eventClass: raw.eventClass,
      payload: raw.payload,
      expectedPlanningPointerSha256OrNull: null,
      expectedPlanningSnapshotFingerprintOrNull: snapshot?.semanticFingerprint ?? null,
      instanceRef: `instance.replay.${index}`,
      actorRef: raw.actorRef,
      sourceRefs: raw.sourceRefs,
      formedAt: raw.formedAt
    };
    const applied = applyProjectPlanningTransaction({
      snapshot, transaction, projectSnapshot, knownLaneRefs, knownViewRefs, registry
    });
    if (!applied.changed || applied.event.semanticFingerprint !== raw.semanticFingerprint) {
      throw new TypeError(`planning event ${raw.eventRef} is not canonical replay truth`);
    }
    snapshot = applied.snapshot;
  }
  return snapshot;
}

function workTransitionCore(input) {
  return {
    schemaVersion: PROJECT_WORK_TRANSITION_REQUEST_SCHEMA,
    requestRef: input.requestRef,
    projectRef: input.projectRef,
    graphRef: input.graphRef,
    workNodeRef: input.workNodeRef,
    expectedProjectSnapshotFingerprint: input.expectedProjectSnapshotFingerprint,
    expectedWorkgraphPointerSha256: input.expectedWorkgraphPointerSha256,
    expectedGraphSemanticFingerprint: input.expectedGraphSemanticFingerprint,
    expectedState: input.expectedState,
    nextState: input.nextState,
    reason: input.reason,
    transitionRef: input.transitionRef,
    actorRef: input.actorRef,
    actorRoleRef: input.actorRoleRef,
    processRef: input.processRef,
    sourceRefs: canonicalRefs(input.sourceRefs),
    requestedAt: input.requestedAt,
    instanceRef: input.instanceRef
  };
}

export function createProjectWorkTransitionRequest(input) {
  if (!object(input) || input.schemaVersion !== PROJECT_WORK_TRANSITION_REQUEST_SCHEMA) {
    throw new TypeError('project work transition request schema mismatch');
  }
  for (const field of ['requestRef','graphRef','workNodeRef','transitionRef','actorRef','actorRoleRef','processRef','instanceRef']) {
    stableRef(input[field], field);
  }
  projectRef(input.projectRef);
  for (const field of ['expectedProjectSnapshotFingerprint','expectedWorkgraphPointerSha256','expectedGraphSemanticFingerprint']) {
    if (typeof input[field] !== 'string' || !SHA256.test(input[field])) throw new TypeError(`${field} must be lowercase SHA-256`);
  }
  stableRef(input.expectedState, 'expectedState');
  stableRef(input.nextState, 'nextState');
  if (typeof input.reason !== 'string' || input.reason.trim().length === 0) throw new TypeError('transition reason is required');
  uniqueStableRefs(input.sourceRefs, 'sourceRefs');
  if (input.sourceRefs.length === 0) throw new TypeError('sourceRefs must be non-empty');
  canonicalTimestamp(input.requestedAt, 'requestedAt');
  const core = workTransitionCore(input);
  const semanticFingerprint = semanticHash(core);
  if (input.semanticFingerprint && input.semanticFingerprint !== semanticFingerprint) {
    throw new TypeError('project work transition request semanticFingerprint mismatch');
  }
  return freezeDeep({ ...core, semanticFingerprint });
}

export function validateProjectWorkTransitionRequest({
  request: rawRequest,
  projectSnapshot,
  workgraphEntry,
  intentRegistry
} = {}) {
  const request = createProjectWorkTransitionRequest(rawRequest);
  assertProjectSnapshot(projectSnapshot, request.projectRef);
  if (projectSnapshot.semanticFingerprint !== request.expectedProjectSnapshotFingerprint) {
    throw new TypeError('Project Continuity snapshot changed before transition request admission');
  }
  const card = (projectSnapshot.cards ?? []).find((item) => item.workNodeRef === request.workNodeRef);
  if (!card || card.graphRef !== request.graphRef) {
    throw new TypeError('transition request work node is absent from the exact Project snapshot');
  }
  const binding = (projectSnapshot.graphBindings ?? []).find((item) => item.graphRef === request.graphRef);
  if (!binding || binding.currentPointerSha256 !== request.expectedWorkgraphPointerSha256 ||
      binding.semanticFingerprint !== request.expectedGraphSemanticFingerprint) {
    throw new TypeError('transition request Workgraph binding is stale');
  }
  if (!object(workgraphEntry) || !object(workgraphEntry.pointer) || !object(workgraphEntry.graph)) {
    throw new TypeError('transition request requires one current Workgraph entry');
  }
  if (workgraphEntry.pointer.pointerSha256 !== request.expectedWorkgraphPointerSha256 ||
      workgraphEntry.graph.semanticFingerprint !== request.expectedGraphSemanticFingerprint ||
      workgraphEntry.graph.graphRef !== request.graphRef) {
    throw new TypeError('current Workgraph entry changed before transition request admission');
  }
  const node = (workgraphEntry.graph.nodes ?? []).find((item) => item.workNodeRef === request.workNodeRef);
  if (!node || node.state !== request.expectedState || card.state !== request.expectedState) {
    throw new TypeError('transition request expectedState is stale');
  }
  if (!intentTransitionAllowed(request.expectedState, request.nextState, intentRegistry)) {
    throw new TypeError(`disallowed intent transition ${request.expectedState} -> ${request.nextState}`);
  }
  return freezeDeep({
    state: 'VALID',
    effects: false,
    executionAuthority: 'NONE',
    request,
    transition: {
      transitionRef: request.transitionRef,
      workNodeRef: request.workNodeRef,
      priorState: request.expectedState,
      nextState: request.nextState,
      reason: request.reason,
      actorRef: request.actorRef,
      actorRoleRef: request.actorRoleRef,
      processRef: request.processRef,
      sourceRefs: clone(request.sourceRefs),
      createdAt: request.requestedAt
    }
  });
}

// [VXG RealForever]
