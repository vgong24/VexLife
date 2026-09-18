import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formDreamCandidate,
  reviewDreamCandidate,
  createFamilySyncEnvelope,
  receiveSiblingEvolution,
  evaluateTrainingAdmission
} from '../src/core/evolution.mjs';
import { loadBlueprint } from '../src/core/blueprint.mjs';

test('legacy Dream v0 remains compatibility-candidate-only and cannot create durable acceptance', () => {
  const candidate = formDreamCandidate({
    sourceLineageRef: 'companion-lineage.windows',
    sourceRangeRefs: ['range.thread.001.0-20'],
    candidateType: 'dream-type.memory',
    summary: 'Victor prefers natural replies in personal channels.',
    proposedScope: 'GLOBAL_FAMILY',
    consentState: 'PENDING',
    formedByRef: 'role.vex.context-maintainer',
    formedAt: '2026-07-30T00:00:00Z'
  });
  assert.equal(candidate.state, 'COMPATIBILITY_CANDIDATE_ONLY');
  assert.equal(candidate.durableAcceptanceAllowed, false);
  assert.deepEqual(candidate.sourceRangeRefs, ['range.thread.001.0-20']);
  assert.throws(() => reviewDreamCandidate(candidate, {
    reviewerRef: 'role.vex.reviewer', privacyState: 'PASS', contradictionState: 'NONE',
    disposition: 'ACCEPTED_SCORE_RECORD', acceptedScope: 'GLOBAL_FAMILY'
  }), /cannot create durable acceptance/);
});

test('legacy Dream v0 cannot bypass reviewed family synchronization', () => {
  const candidate = formDreamCandidate({
    sourceLineageRef: 'companion-lineage.windows',
    sourceRangeRefs: ['range.work.001'],
    candidateType: 'dream-type.process-lesson',
    summary: 'Use semantic revisions to suppress unchanged UI updates.',
    proposedScope: 'GLOBAL_FAMILY',
    consentState: 'ACCEPTED',
    formedByRef: 'role.vex.context-maintainer',
    formedAt: '2026-07-30T00:00:00Z'
  });
  assert.throws(() => reviewDreamCandidate(candidate, {
    reviewerRef: 'role.vex.reviewer', privacyState: 'PASS', contradictionState: 'NONE',
    disposition: 'ACCEPTED_FAMILY_CANDIDATE', acceptedScope: 'GLOBAL_FAMILY', reviewedAt: '2026-07-30T00:01:00Z'
  }), /cannot create durable acceptance/);
  assert.throws(() => createFamilySyncEnvelope({ candidate, review: {}, familyRef: 'vex-family.victor', targetLineageRefs: ['companion-lineage.macbook'] }), /cannot create family synchronization/);
  assert.throws(() => receiveSiblingEvolution({}, { targetLineageRef: 'companion-lineage.macbook' }), /sibling receive is closed/);
});

test('legacy training examples are sealed from admission and activation', () => {
  const blocked = evaluateTrainingAdmission({ examples: [{ candidateRef: 'candidate.unreviewed', disposition: 'CANDIDATE_UNREVIEWED' }], evaluationManifestRef: 'eval.001', privacyReceiptRefs: ['privacy.001'], resourceLeaseRef: 'lease.001' });
  assert.equal(blocked.state, 'BLOCKED_LEGACY_COMPATIBILITY_PATH');
  const example = { candidateRef: 'candidate.reviewed', disposition: 'ACCEPTED_TRAINING_EXAMPLE', acceptedRecordRef: 'accepted.example.001' };
  const activation = evaluateTrainingAdmission({ examples: [example], evaluationManifestRef: 'eval.001', privacyReceiptRefs: ['privacy.001'], resourceLeaseRef: 'lease.001', activationRequested: true });
  assert.equal(activation.state, 'BLOCKED_LEGACY_COMPATIBILITY_PATH');
  const ready = evaluateTrainingAdmission({ examples: [example], evaluationManifestRef: 'eval.001', privacyReceiptRefs: ['privacy.001'], resourceLeaseRef: 'lease.001' });
  assert.equal(ready.state, 'BLOCKED_LEGACY_COMPATIBILITY_PATH');
});

test('evolution registry is loaded into the universal bundle', () => {
  const bundle = loadBlueprint();
  assert.equal(bundle.evolution.registryRef, 'registry.vexlife.evolution.001');
  assert.ok(bundle.evolution.candidateTypes.length >= 10);
  assert.ok(bundle.evolution.weightLifecycleStates.includes('ACCEPTED_INACTIVE'));
});

// [VXG RealForever]
