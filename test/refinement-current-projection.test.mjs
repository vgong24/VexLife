import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REFINEMENT_CURRENT_PROJECTION_SCHEMA,
  REFINEMENT_CURRENT_PROJECTION_SOURCE_REF,
  projectRefinementCurrent
} from '../src/core/refinement-current-projection.mjs';

const RUNTIME_SOURCE = 'projection.vexlife.generic-follow-through-runtime.001';
const GRAPH_FINGERPRINT = 'a'.repeat(64);

function node(ref, state, overrides = {}) {
  return {
    workNodeRef: ref,
    purpose: `Purpose for ${ref}`,
    state,
    priorityClass: 'NORMAL',
    processRef: 'process.vexlife.intent.validate-workgraph',
    returnRouteRef: `return-route.${ref}`,
    waitingReason: null,
    unmetDependencyRefs: [],
    blockingReasonRef: null,
    requiredHumanDecisionRef: null,
    evidenceSourceRefs: [],
    ...overrides
  };
}

function status(suffix, overrides = {}) {
  const graphRef = `intent-workgraph.refinement.${suffix}`;
  const intentRef = `intent.refinement.${suffix}`;
  return {
    schemaVersion: 'vexlife.intent-status-projection/v0',
    state: 'PLAN_VALIDATED',
    currentness: 'CURRENT',
    graphRef,
    graphFingerprint: GRAPH_FINGERPRINT,
    intentRef,
    whatIsHappeningNow: [],
    ready: [],
    waiting: [],
    needsHuman: [],
    blocked: [],
    recentlyCompleted: [],
    nextSafeAction: {
      action: 'HOLD_NO_SAFE_ACTION',
      workNodeRef: null,
      reason: 'WAITING_FOR_EXACT_EVIDENCE',
      authority: 'NO_EXECUTION_AUTHORITY'
    },
    sourceDescent: {
      graphRef,
      intentRef,
      detailCommand: 'npm run intent:status -- --graph <path> --detail'
    },
    validation: {
      errors: [],
      attentions: [],
      topologicalOrder: []
    },
    ...overrides
  };
}

test('REFCUR-01 one active node becomes the bounded no-authority continuation hint', () => {
  const active = node('work.vexlife.refinement.live-workspace', 'RUNNING');
  const projection = projectRefinementCurrent({
    runtimeSourceRef: RUNTIME_SOURCE,
    intentStatusProjections: [status('active', {
      whatIsHappeningNow: [active],
      nextSafeAction: {
        action: 'HOLD_NO_SAFE_ACTION',
        workNodeRef: null,
        reason: 'WAITING_FOR_EXACT_EVIDENCE',
        authority: 'NO_EXECUTION_AUTHORITY'
      }
    })]
  });

  assert.equal(projection.schemaVersion, REFINEMENT_CURRENT_PROJECTION_SCHEMA);
  assert.equal(projection.sourceRef, REFINEMENT_CURRENT_PROJECTION_SOURCE_REF);
  assert.equal(projection.runtimeSourceRef, RUNTIME_SOURCE);
  assert.equal(projection.graphs[0].graphFingerprint, GRAPH_FINGERPRINT);
  assert.equal(projection.continuationCandidates[0].graphFingerprint, GRAPH_FINGERPRINT);
  assert.equal(projection.effects, false);
  assert.equal(projection.executionAuthority, 'NONE');
  assert.deepEqual(projection.counts, {
    graphs: 1,
    active: 1,
    needsHuman: 0,
    ready: 0,
    blocked: 0,
    waiting: 0
  });
  assert.deepEqual(projection.continuationHint, {
    state: 'UNAMBIGUOUS',
    reason: 'ONE_ACTIVE_WORK_NODE',
    graphRef: 'intent-workgraph.refinement.active',
    workNodeRef: active.workNodeRef,
    candidateRefs: [active.workNodeRef],
    authority: 'NO_EXECUTION_AUTHORITY'
  });
});

test('REFCUR-02 multiple active nodes remain explicitly ambiguous instead of inventing foreground', () => {
  const first = node('work.vexlife.refinement.first', 'RUNNING');
  const second = node('work.vexlife.refinement.second', 'VERIFYING');
  const projection = projectRefinementCurrent({
    runtimeSourceRef: RUNTIME_SOURCE,
    intentStatusProjections: [
      status('b', { whatIsHappeningNow: [second] }),
      status('a', { whatIsHappeningNow: [first] })
    ]
  });

  assert.equal(projection.continuationHint.state, 'AMBIGUOUS');
  assert.equal(projection.continuationHint.reason, 'MULTIPLE_ACTIVE_WORK_NODES');
  assert.equal(projection.continuationHint.workNodeRef, null);
  assert.deepEqual(projection.continuationHint.candidateRefs, [first.workNodeRef, second.workNodeRef]);
  assert.deepEqual(projection.graphs.map((graph) => graph.graphRef), [
    'intent-workgraph.refinement.a',
    'intent-workgraph.refinement.b'
  ]);
});

test('REFCUR-03 bounded human attention outranks ready work when no work is active', () => {
  const human = node('work.vexlife.refinement.human', 'WAITING_HUMAN', {
    waitingReason: 'WAITING_HUMAN',
    requiredHumanDecisionRef: 'decision.refinement.choose-path'
  });
  const ready = node('work.vexlife.refinement.ready', 'READY');
  const projection = projectRefinementCurrent({
    runtimeSourceRef: RUNTIME_SOURCE,
    intentStatusProjections: [status('attention', {
      needsHuman: [human],
      ready: [ready]
    })]
  });

  assert.equal(projection.continuationHint.state, 'HUMAN_ATTENTION');
  assert.equal(projection.continuationHint.reason, 'BOUNDED_HUMAN_DECISION_REQUIRED');
  assert.deepEqual(projection.continuationHint.candidateRefs, [human.workNodeRef]);
  assert.equal(projection.continuationCandidates[0].disposition, 'HUMAN_ATTENTION');
  assert.equal(projection.continuationCandidates[1].disposition, 'READY');
});

test('REFCUR-04 invalid current Workgraph remains current evidence but blocks continuation until repair', () => {
  const unsafeActive = node('work.vexlife.refinement.invalid-active', 'RUNNING');
  const projection = projectRefinementCurrent({
    runtimeSourceRef: RUNTIME_SOURCE,
    intentStatusProjections: [status('health', {
      whatIsHappeningNow: [unsafeActive],
      validation: {
        errors: ['WORKGRAPH:test-error'],
        attentions: ['test-attention'],
        topologicalOrder: []
      },
      nextSafeAction: {
        action: 'REPAIR_INVALID_WORKGRAPH',
        workNodeRef: null,
        reason: 'WORKGRAPH:test-error',
        authority: 'NO_EXECUTION_AUTHORITY'
      }
    })]
  });

  assert.equal(projection.state, 'ATTENTION');
  assert.equal(projection.currentness, 'CURRENT');
  assert.deepEqual(projection.graphHealth.invalidGraphRefs, ['intent-workgraph.refinement.health']);
  assert.deepEqual(projection.graphHealth.attentionGraphRefs, ['intent-workgraph.refinement.health']);
  assert.deepEqual(projection.continuationHint, {
    state: 'REPAIR_REQUIRED',
    reason: 'INVALID_CURRENT_WORKGRAPH',
    graphRef: 'intent-workgraph.refinement.health',
    workNodeRef: null,
    candidateRefs: [],
    invalidGraphRefs: ['intent-workgraph.refinement.health'],
    authority: 'NO_EXECUTION_AUTHORITY'
  });
});

test('REFCUR-05 caller cannot smuggle execution authority through a current-work projection', () => {
  assert.throws(() => projectRefinementCurrent({
    runtimeSourceRef: RUNTIME_SOURCE,
    intentStatusProjections: [status('authority', {
      nextSafeAction: {
        action: 'PROPOSE_START_READY_NODE',
        workNodeRef: 'work.vexlife.refinement.ready',
        reason: 'DEPENDENCY_RECEIPTS_CURRENT',
        authority: 'EXECUTE_NOW'
      }
    })]
  }), /NO_EXECUTION_AUTHORITY/);
});

test('REFCUR-06 duplicate graph identity fails closed and empty current work stays explicit', () => {
  const duplicate = status('duplicate');
  assert.throws(() => projectRefinementCurrent({
    runtimeSourceRef: RUNTIME_SOURCE,
    intentStatusProjections: [duplicate, structuredClone(duplicate)]
  }), /duplicate graphRef/);

  assert.throws(() => projectRefinementCurrent({
    runtimeSourceRef: RUNTIME_SOURCE,
    intentStatusProjections: [status('fingerprint', { graphFingerprint: 'stale' })]
  }), /semantic fingerprint/);

  const empty = projectRefinementCurrent({
    runtimeSourceRef: RUNTIME_SOURCE,
    intentStatusProjections: []
  });
  assert.equal(empty.continuationHint.state, 'NONE');
  assert.equal(empty.continuationHint.reason, 'NO_CURRENT_WORK');
  assert.equal(empty.counts.graphs, 0);
});

// [VXG RealForever]
