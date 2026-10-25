import assert from 'node:assert/strict';
import test from 'node:test';

import {
  projectActiveTurnCurrentness,
  toCurrentActiveTurnEvidence,
  verifyActiveTurnCurrentnessProjection
} from '../src/core/interaction-control.mjs';

const SOURCE_REFS = ['module.vexlife.core.browser-companion-bridge', 'module.vexlife.core.interaction-control'];
const OBSERVED_AT = '2026-10-17T09:00:00.000Z';
const EXPIRES_AT = '2026-10-17T09:05:00.000Z';

function current(overrides = {}) {
  return projectActiveTurnCurrentness({
    turnRef: 'turn.vexlife.test.current',
    cancellationTargetRef: 'cancel.vexlife.test.current',
    cancellationTargetExpiresAt: EXPIRES_AT,
    lifecyclePhase: 'ACTIVE',
    sourceRefs: SOURCE_REFS,
    observedAt: OBSERVED_AT,
    ...overrides
  });
}

test('active-turn currentness is explicit ABSENT when no turn is active', () => {
  const projection = projectActiveTurnCurrentness({ sourceRefs: SOURCE_REFS, observedAt: OBSERVED_AT });
  assert.equal(projection.state, 'ABSENT');
  assert.equal(projection.currentness, 'CURRENT');
  assert.equal(projection.phase, 'IDLE');
  assert.equal(projection.turnRefOrNull, null);
  assert.equal(projection.cancellationTargetRefOrNull, null);
  assert.equal(projection.reasonCodeOrNull, 'NO_ACTIVE_TURN');
  assert.equal(projection.effectAuthorityGranted, false);
  assert.equal(verifyActiveTurnCurrentnessProjection(projection), true);
});

test('active turn without a rightful cancellation target fails closed UNKNOWN', () => {
  const projection = projectActiveTurnCurrentness({
    turnRef: 'turn.vexlife.test.pending',
    lifecyclePhase: 'ACTIVE',
    sourceRefs: SOURCE_REFS,
    observedAt: OBSERVED_AT
  });
  assert.equal(projection.state, 'UNKNOWN');
  assert.equal(projection.currentness, 'UNKNOWN');
  assert.equal(projection.phase, 'ACTIVE');
  assert.equal(projection.turnRefOrNull, 'turn.vexlife.test.pending');
  assert.equal(projection.cancellationTargetRefOrNull, null);
  assert.equal(projection.reasonCodeOrNull, 'CANCELLATION_TARGET_UNAVAILABLE');
  assert.throws(() => toCurrentActiveTurnEvidence(projection), /not CURRENT/);
});

test('current active turn binds exact turn and cancellation target without authority', () => {
  const projection = current();
  assert.equal(projection.state, 'CURRENT');
  assert.equal(projection.currentness, 'CURRENT');
  assert.equal(projection.phase, 'ACTIVE');
  assert.equal(projection.turnRefOrNull, 'turn.vexlife.test.current');
  assert.equal(projection.cancellationTargetRefOrNull, 'cancel.vexlife.test.current');
  assert.equal(projection.reasonCodeOrNull, null);
  assert.equal(verifyActiveTurnCurrentnessProjection(projection), true);

  const evidence = toCurrentActiveTurnEvidence(projection);
  assert.deepEqual(Object.keys(evidence).sort(), [
    'cancellationTargetRef', 'currentness', 'phase', 'projectionRef', 'sourceRefs', 'turnRef'
  ]);
  assert.equal(evidence.turnRef, projection.turnRefOrNull);
  assert.equal(evidence.cancellationTargetRef, projection.cancellationTargetRefOrNull);
  assert.equal(Object.hasOwn(evidence, 'effectAuthorityGranted'), false);
});

test('expected completed or foreign turn is STALE rather than silently rebound', () => {
  const projection = current({ expectedTurnRef: 'turn.vexlife.test.prior' });
  assert.equal(projection.state, 'STALE');
  assert.equal(projection.currentness, 'STALE');
  assert.equal(projection.reasonCodeOrNull, 'EXPECTED_TURN_NOT_ACTIVE');
  assert.throws(() => toCurrentActiveTurnEvidence(projection), /not CURRENT/);

  const completed = projectActiveTurnCurrentness({
    expectedTurnRef: 'turn.vexlife.test.prior',
    sourceRefs: SOURCE_REFS,
    observedAt: OBSERVED_AT
  });
  assert.equal(completed.state, 'STALE');
  assert.equal(completed.phase, 'IDLE');
});

test('expired cancellation target is STALE even while the turn identity remains active', () => {
  const projection = current({
    cancellationTargetExpiresAt: '2026-10-17T08:59:59.000Z'
  });
  assert.equal(projection.state, 'STALE');
  assert.equal(projection.phase, 'ACTIVE');
  assert.equal(projection.reasonCodeOrNull, 'CANCELLATION_TARGET_EXPIRED');
});

test('multiple active turns project UNKNOWN instead of inventing a foreground turn', () => {
  const projection = projectActiveTurnCurrentness({
    turnRef: null,
    lifecyclePhase: 'ACTIVE',
    sourceRefs: SOURCE_REFS,
    ambiguous: true,
    observedAt: OBSERVED_AT
  });
  assert.equal(projection.state, 'UNKNOWN');
  assert.equal(projection.currentness, 'UNKNOWN');
  assert.equal(projection.phase, 'UNKNOWN');
  assert.equal(projection.reasonCodeOrNull, 'MULTIPLE_ACTIVE_TURNS');
});

test('projection fingerprint rejects tampering', () => {
  const projection = current();
  assert.equal(verifyActiveTurnCurrentnessProjection({ ...projection, state: 'UNKNOWN' }), false);
});

// [VXG RealForever]
