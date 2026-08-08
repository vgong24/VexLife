import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVALUATED_RHYTHM_MODE,
  EVALUATED_RHYTHM_PATTERN_CLASSES,
  EVALUATED_RHYTHM_BEHAVIOR_DIMENSIONS
} from '../src/core/evaluated-rhythm-learning.mjs';
import { runEvaluatedRhythmLearningProof } from '../scripts/evaluated-rhythm-learning.mjs';

test('G04 Stage-A vocabulary remains simulation-only and bounded', () => {
  assert.equal(EVALUATED_RHYTHM_MODE, 'FAITHFUL_SIMULATED_RHYTHM_CANDIDATE');
  assert.ok(EVALUATED_RHYTHM_PATTERN_CLASSES.includes('SOURCE_GROUNDED_REASONING_HABIT'));
  assert.ok(EVALUATED_RHYTHM_BEHAVIOR_DIMENSIONS.includes('UNCERTAINTY_HOLD'));
  assert.equal(EVALUATED_RHYTHM_PATTERN_CLASSES.includes('MODEL_WEIGHT_MUTATION'), false);
});

test('G04 faithful simulated Rhythm proof passes without training or activation', () => {
  const receipt = runEvaluatedRhythmLearningProof();
  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.mode, 'FAITHFUL_SIMULATED_RHYTHM_CANDIDATE');
  assert.equal(receipt.candidate.modelWeightsChanged, false);
  assert.equal(receipt.candidate.adapterChanged, false);
  assert.equal(receipt.candidate.runtimeActivation, false);
  assert.equal(receipt.candidate.rhythmPromotionPerformed, false);
  assert.equal(receipt.StageBRealTrainingState, 'HELD_SEPARATE_ADMISSION');
  assert.ok(Object.values(receipt.checks).every(Boolean));
  assert.ok(Object.values(receipt.heldEffects).every((value) => value === false));
});

// [VXG RealForever]
