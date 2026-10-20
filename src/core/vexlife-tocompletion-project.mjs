import {
  createIntentEnvelope,
  createIntentWorkgraph,
  createWorkNode,
  recordIntentTransition,
} from './intent-workgraph.mjs';
export const VEXLIFE_TOCOMPLETION_PROJECT_REF = 'project.vexlife.tocompletion';
export const VEXLIFE_TOCOMPLETION_ROOT_INTENT_REF = 'intent.vexlife.tocompletion.current';
export const VEXLIFE_TOCOMPLETION_GRAPH_REF = 'intent-workgraph.vexlife.tocompletion.current';
export const VEXLIFE_TOCOMPLETION_PROJECT_SOURCE_PATH = 'blueprint/projects/vexlife-tocompletion.project.json';
export const VEXLIFE_TOCOMPLETION_BOARD_VIEW_SOURCE_PATH = 'blueprint/projects/vexlife-tocompletion.board.view.json';

const SOURCE_FORMED_AT = '2026-10-20T07:00:17.000Z';
const ORIGIN_TEXT = 'Fresh user -> Heretic 27B -> lived conversation -> restart -> orientation/work -> lived learning, with later whole-product expansion.';
const ORIGIN_CONTENT_SHA256 = '2ac029f5b73f75003ad992eccd7f137ec2a65736e2655f50eacce7e4db6f9628';

const TRUSTED_BINDINGS = Object.freeze({
  capabilityEnvelopeRef: 'capability-envelope.intent.contract-validation',
  effectEnvelopeRef: 'effect-envelope.intent.no-effects',
  resourceEnvelopeRef: 'resource-envelope.intent.deterministic-local-light',
  expectedTransitionRef: 'expected-transition.intent.contract-current',
  completionGateRef: 'completion-gate.intent.contract-valid',
  returnRouteRef: 'return-route.intent.verify-transition',
});

export const VEXLIFE_TOCOMPLETION_WORK_REFS = Object.freeze({
  foreground: 'work.vexlife.tocompletion.foreground',
  b06: 'work.vexlife.tocompletion.p0b.b06.project-dogfood',
  p1: 'work.vexlife.tocompletion.p1.fresh-heretic-establishment',
  p2: 'work.vexlife.tocompletion.p2.first-lived-heretic-relationship',
  p3: 'work.vexlife.tocompletion.p3.same-home-restart-reentry',
  p4: 'work.vexlife.tocompletion.p4.orientation-local-work-loop',
  p5: 'work.vexlife.tocompletion.p5.lived-continuity-learning',
  p6: 'work.vexlife.tocompletion.p6.cultivation-school-training-placement',
  p7: 'work.vexlife.tocompletion.p7.connected-native-expansion',
  proofHardening: 'work.vexlife.tocompletion.proof-hardening.end-to-end-quantumtest',
});

function isoAt(offsetSeconds) {
  return new Date(Date.parse(SOURCE_FORMED_AT) + (offsetSeconds * 1000)).toISOString();
}

function dependencyRequirements(dependencyRefs) {
  return dependencyRefs.map((dependencyWorkNodeRef) => ({
    dependencyWorkNodeRef,
    expectedTransitionRef: TRUSTED_BINDINGS.expectedTransitionRef,
    allowedDispositions: ['CLOSED', 'COMPLETED', 'CONVERGED'],
  }));
}

function workSpec({
  workNodeRef,
  purpose,
  targetState,
  priorityClass,
  parentWorkNodeRef = VEXLIFE_TOCOMPLETION_WORK_REFS.foreground,
  dependencyRefs = [],
  childRefs = [],
  sourceRefs = ['github.issue.vexlife.866'],
  processRef = 'process.vexlife.intent.verify-transition',
}) {
  return Object.freeze({
    workNodeRef,
    purpose,
    targetState,
    priorityClass,
    parentWorkNodeRef,
    dependencyRefs: Object.freeze([...dependencyRefs]),
    childRefs: Object.freeze([...childRefs]),
    sourceRefs: Object.freeze([...sourceRefs]),
    processRef,
  });
}

export const VEXLIFE_TOCOMPLETION_WORK = Object.freeze([
  workSpec({
    workNodeRef: VEXLIFE_TOCOMPLETION_WORK_REFS.foreground,
    purpose: 'Carry VexLife ToCompletion from the accepted Project foundation through the lived Heretic and developmental outcomes without losing current owner boundaries.',
    targetState: 'RUNNING',
    priorityClass: 'IMMEDIATE',
    parentWorkNodeRef: null,
    childRefs: [
      VEXLIFE_TOCOMPLETION_WORK_REFS.b06,
      VEXLIFE_TOCOMPLETION_WORK_REFS.p1,
      VEXLIFE_TOCOMPLETION_WORK_REFS.p2,
      VEXLIFE_TOCOMPLETION_WORK_REFS.p3,
      VEXLIFE_TOCOMPLETION_WORK_REFS.p4,
      VEXLIFE_TOCOMPLETION_WORK_REFS.p5,
      VEXLIFE_TOCOMPLETION_WORK_REFS.p6,
      VEXLIFE_TOCOMPLETION_WORK_REFS.p7,
    ],
    processRef: 'process.vexlife.intent.converge-parent',
  }),
  workSpec({
    workNodeRef: VEXLIFE_TOCOMPLETION_WORK_REFS.b06,
    purpose: 'Import and dogfood the actual ToCompletion Project through canonical Workgraph persistence plus Board, Graph, Lane Focus and Purpose Workspace consumption.',
    targetState: 'CONVERGED',
    priorityClass: 'IMMEDIATE',
    sourceRefs: [
      'github.issue.vexlife.866',
      'github.pull.vexlife.912',
      'git.vexlife.merge.28a1c6438fd59c4e129c3aa0050b61b05c0aea62',
    ],
  }),
  workSpec({
    workNodeRef: VEXLIFE_TOCOMPLETION_WORK_REFS.p1,
    purpose: 'Establish the accepted Qwen3.8-27B Heretic for an ordinary fresh supported Mac user with exact artifact, runtime and VexLife binding.',
    targetState: 'RUNNING',
    priorityClass: 'HIGH',
    dependencyRefs: [VEXLIFE_TOCOMPLETION_WORK_REFS.b06],
    sourceRefs: [
      'github.issue.vexlife.866',
      'github.issue.vexlife.857.comment.6289035585',
      'github.issue.vexlife.857.comment.6289157446',
    ],
  }),
  workSpec({
    workNodeRef: VEXLIFE_TOCOMPLETION_WORK_REFS.p2,
    purpose: 'Prove the first lived natural-message relationship turn through the real VexLife Companion with the accepted Heretic runtime.',
    targetState: 'WAITING_DEPENDENCIES',
    priorityClass: 'HIGH',
    dependencyRefs: [VEXLIFE_TOCOMPLETION_WORK_REFS.p1],
  }),
  workSpec({
    workNodeRef: VEXLIFE_TOCOMPLETION_WORK_REFS.p3,
    purpose: 'Prove clean stop and same-Home Heretic restart/reentry with a second durable natural conversation turn and no fallback.',
    targetState: 'WAITING_DEPENDENCIES',
    priorityClass: 'HIGH',
    dependencyRefs: [VEXLIFE_TOCOMPLETION_WORK_REFS.p2],
  }),
  workSpec({
    workNodeRef: VEXLIFE_TOCOMPLETION_WORK_REFS.p4,
    purpose: 'Prove awake Vex orientation plus one bounded authorized local-work loop whose result returns to the same Conversation.',
    targetState: 'WAITING_DEPENDENCIES',
    priorityClass: 'HIGH',
    dependencyRefs: [VEXLIFE_TOCOMPLETION_WORK_REFS.p3],
  }),
  workSpec({
    workNodeRef: VEXLIFE_TOCOMPLETION_WORK_REFS.p5,
    purpose: 'Prove a lived continuity and learning loop where ordinary experience becomes durable evidence without collapsing Memory, Dream, Rhythm and weight change.',
    targetState: 'WAITING_DEPENDENCIES',
    priorityClass: 'NORMAL',
    dependencyRefs: [VEXLIFE_TOCOMPLETION_WORK_REFS.p4],
  }),
  workSpec({
    workNodeRef: VEXLIFE_TOCOMPLETION_WORK_REFS.p6,
    purpose: 'Let lived evidence earn Cultivation, School and Training Placement, with neural weight mutation only when the rightful placement owner earns it.',
    targetState: 'WAITING_DEPENDENCIES',
    priorityClass: 'NORMAL',
    dependencyRefs: [VEXLIFE_TOCOMPLETION_WORK_REFS.p5],
  }),
  workSpec({
    workNodeRef: VEXLIFE_TOCOMPLETION_WORK_REFS.p7,
    purpose: 'Expand connected and native VexLife surfaces under the same Home, identity, capability and continuity foundations without delaying the core lived Heretic path.',
    targetState: 'WAITING_DEPENDENCIES',
    priorityClass: 'LOW',
    dependencyRefs: [VEXLIFE_TOCOMPLETION_WORK_REFS.p4],
  }),
  workSpec({
    workNodeRef: VEXLIFE_TOCOMPLETION_WORK_REFS.proofHardening,
    purpose: 'Later proof-hardening: reuse the accepted EndToEnd, Feature-Walk and QuantumTest architectures to make lived whole-product evidence easier to rerun and inspect.',
    targetState: 'WAITING_DEPENDENCIES',
    priorityClass: 'LOW',
    parentWorkNodeRef: null,
    dependencyRefs: [VEXLIFE_TOCOMPLETION_WORK_REFS.p3],
  }),
]);

function bindingRefsFor() {
  return {
    capabilityEnvelopeRef: [TRUSTED_BINDINGS.capabilityEnvelopeRef],
    effectEnvelopeRef: [TRUSTED_BINDINGS.effectEnvelopeRef],
    resourceEnvelopeRef: [TRUSTED_BINDINGS.resourceEnvelopeRef],
    expectedTransitionRef: [TRUSTED_BINDINGS.expectedTransitionRef],
    completionGateRefs: [TRUSTED_BINDINGS.completionGateRef],
    returnRouteRef: [TRUSTED_BINDINGS.returnRouteRef],
  };
}

function transitionPath(registry, initialState, targetState) {
  if (initialState === targetState) return [];
  const queue = [[initialState, []]];
  const visited = new Set([initialState]);
  while (queue.length) {
    const [state, path] = queue.shift();
    for (const nextState of registry.allowedTransitions?.[state] ?? []) {
      if (visited.has(nextState)) continue;
      const nextPath = [...path, nextState];
      if (nextState === targetState) return nextPath;
      visited.add(nextState);
      queue.push([nextState, nextPath]);
    }
  }
  throw new Error(`No canonical Intent lifecycle path ${initialState} -> ${targetState}`);
}

export function formVexLifeToCompletionWorkgraph({ intentRegistry } = {}) {
  if (!intentRegistry || typeof intentRegistry !== 'object') {
    throw new TypeError('ToCompletion Workgraph formation requires the current Intent registry');
  }

  const intent = createIntentEnvelope({
    intentRef: VEXLIFE_TOCOMPLETION_ROOT_INTENT_REF,
    originMessageRef: 'message.vexlife.tocompletion.current-entry',
    originSpeakerRef: 'person.vexlife.owner',
    recipientRoleRef: 'role.vex.operations',
    projectRef: VEXLIFE_TOCOMPLETION_PROJECT_REF,
    threadRef: 'thread.vexlife.tocompletion',
    channelRef: 'channel.vexlife.tocompletion',
    originalContentHash: ORIGIN_CONTENT_SHA256,
    desiredOutcome: {
      intentKey: 'VEXLIFE_TOCOMPLETION',
      summary: ORIGIN_TEXT,
    },
    constraints: [],
    createdAt: SOURCE_FORMED_AT,
    sourceLineageRef: 'lineage.vexlife.tocompletion.current',
  }, intentRegistry);

  const nodes = VEXLIFE_TOCOMPLETION_WORK.map((spec, index) => createWorkNode({
    workNodeRef: spec.workNodeRef,
    rootIntentRef: intent.intentRef,
    parentWorkNodeRef: spec.parentWorkNodeRef,
    purpose: spec.purpose,
    processRef: spec.processRef,
    state: 'CAPTURED',
    initialState: 'CAPTURED',
    dependencyRefs: [...spec.dependencyRefs],
    dependencyRequirements: dependencyRequirements(spec.dependencyRefs),
    childRefs: [...spec.childRefs],
    roleRef: 'role.vex.operations',
    priorityClass: spec.priorityClass,
    contextPlanRef: null,
    applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs: [],
    applicableBurdenReleaseRefs: [],
    capabilityEnvelopeRef: TRUSTED_BINDINGS.capabilityEnvelopeRef,
    effectEnvelopeRef: TRUSTED_BINDINGS.effectEnvelopeRef,
    resourceEnvelopeRef: TRUSTED_BINDINGS.resourceEnvelopeRef,
    expectedTransitionRef: TRUSTED_BINDINGS.expectedTransitionRef,
    completionGateRefs: [TRUSTED_BINDINGS.completionGateRef],
    returnRouteRef: TRUSTED_BINDINGS.returnRouteRef,
    sourceRefs: [...spec.sourceRefs],
    createdAt: isoAt(index + 1),
  }, intentRegistry));

  let graph = createIntentWorkgraph({
    graphRef: VEXLIFE_TOCOMPLETION_GRAPH_REF,
    intent,
    nodes,
    interpretations: [],
    proposedPlans: [],
    authorizations: [],
    transitions: [],
    receipts: [],
    bindingRefs: bindingRefsFor(),
    createdAt: SOURCE_FORMED_AT,
  }, intentRegistry);

  let transitionOrdinal = 20;
  for (const spec of VEXLIFE_TOCOMPLETION_WORK) {
    let priorState = 'CAPTURED';
    for (const nextState of transitionPath(intentRegistry, priorState, spec.targetState)) {
      const applied = recordIntentTransition(graph, {
        transitionRef: `transition.vexlife.tocompletion.${spec.workNodeRef}.${transitionOrdinal}`,
        workNodeRef: spec.workNodeRef,
        priorState,
        nextState,
        reason: 'Source-managed ToCompletion project formation history',
        actorRef: 'vex.vexlife.intent-orchestration',
        actorRoleRef: 'role.vex.operations',
        processRef: 'process.vexlife.intent.verify-transition',
        sourceRefs: ['github.issue.vexlife.866'],
        createdAt: isoAt(transitionOrdinal),
      }, intentRegistry);
      graph = applied.graph;
      priorState = nextState;
      transitionOrdinal += 1;
    }
  }

  return graph;
}

// [VXG RealForever]
