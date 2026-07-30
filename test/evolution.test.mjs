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

test('Dream candidate remains source-bound and cannot be accepted without consent/privacy review', () => {
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
  assert.equal(candidate.state, 'CANDIDATE_UNREVIEWED');
  assert.deepEqual(candidate.sourceRangeRefs, ['range.thread.001.0-20']);
  assert.throws(() => reviewDreamCandidate(candidate, {
    reviewerRef: 'role.vex.reviewer', privacyState: 'PASS', contradictionState: 'NONE',
    disposition: 'ACCEPTED_SCORE_RECORD', acceptedScope: 'GLOBAL_FAMILY'
  }), /accepted consent/);
});

test('family Dream sync preserves source lineage and target receives observe-only candidate', () => {
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
  const review = reviewDreamCandidate(candidate, {
    reviewerRef: 'role.vex.reviewer', privacyState: 'PASS', contradictionState: 'NONE',
    disposition: 'ACCEPTED_FAMILY_CANDIDATE', acceptedScope: 'GLOBAL_FAMILY', reviewedAt: '2026-07-30T00:01:00Z'
  });
  const envelope = createFamilySyncEnvelope({ candidate, review, familyRef: 'vex-family.victor', targetLineageRefs: ['companion-lineage.macbook'], formedAt: '2026-07-30T00:02:00Z' });
  const received = receiveSiblingEvolution(envelope, { targetLineageRef: 'companion-lineage.macbook', receivedAt: '2026-07-30T00:03:00Z' });
  assert.equal(received.sourceLineageRef, 'companion-lineage.windows');
  assert.equal(received.targetLineageRef, 'companion-lineage.macbook');
  assert.equal(received.livedByTargetLineage, false);
  assert.equal(received.state, 'OBSERVE_ONLY_PENDING_LOCAL_DECISION');
});

test('training admission requires reviewed examples and never grants activation', () => {
  const blocked = evaluateTrainingAdmission({ examples: [{ candidateRef: 'candidate.unreviewed', disposition: 'CANDIDATE_UNREVIEWED' }], evaluationManifestRef: 'eval.001', privacyReceiptRefs: ['privacy.001'], resourceLeaseRef: 'lease.001' });
  assert.equal(blocked.state, 'BLOCKED_UNREVIEWED_EXAMPLES');
  const example = { candidateRef: 'candidate.reviewed', disposition: 'ACCEPTED_TRAINING_EXAMPLE', acceptedRecordRef: 'accepted.example.001' };
  const activation = evaluateTrainingAdmission({ examples: [example], evaluationManifestRef: 'eval.001', privacyReceiptRefs: ['privacy.001'], resourceLeaseRef: 'lease.001', activationRequested: true });
  assert.equal(activation.state, 'BLOCKED_TRAINING_DOES_NOT_GRANT_ACTIVATION');
  const ready = evaluateTrainingAdmission({ examples: [example], evaluationManifestRef: 'eval.001', privacyReceiptRefs: ['privacy.001'], resourceLeaseRef: 'lease.001' });
  assert.equal(ready.state, 'TRAINING_ADMISSION_READY');
  assert.equal(ready.admission.outputState, 'CANDIDATE_TRAINING_ADMITTED_ACCEPTED_INACTIVE_ONLY');
});

test('evolution registry is loaded into the universal bundle', () => {
  const bundle = loadBlueprint();
  assert.equal(bundle.evolution.registryRef, 'registry.vexlife.evolution.001');
  assert.ok(bundle.evolution.candidateTypes.length >= 10);
  assert.ok(bundle.evolution.weightLifecycleStates.includes('ACCEPTED_INACTIVE'));
});

// [VXG RealForever]
