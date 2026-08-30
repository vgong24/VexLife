import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VEX_BIRTH_LAB_EVIDENCE_SCHEMA,
  VEX_BIRTH_LAB_STATE_SCHEMA,
  VEX_BIRTH_SUPPORT_CONTEXT_SCHEMA,
  VEX_BIRTH_STATUS_PACKAGE_SCHEMA,
  VexBirthLabError,
  formVexBirthStatusPackageModel,
  formVexBirthSupportContext,
  projectVexBirthHumanChapter,
  reduceVexBirthLabState,
  validateVexBirthAnnotationSet
} from '../src/core/vex-birth-lab.mjs';

function evidence(overrides = {}) {
  const base = {
    schemaVersion: VEX_BIRTH_LAB_EVIDENCE_SCHEMA,
    birthSessionRef: 'birth.vexlife.first-g1.test',
    source: {
      currentness: 'CURRENT',
      evidenceRefs: ['github.commit.vexlife.example']
    },
    lineage: {
      g0Ref: 'generation.vex.g0',
      activeGenerationRef: 'generation.vex.g0',
      candidateGenerationRefOrNull: null,
      acceptedCandidateRefOrNull: null,
      g0RollbackPreserved: true
    },
    candidateArtifactOrNull: null,
    model: {
      bindingState: 'BOUND'
    },
    receipts: {},
    workers: {
      training: {
        lifecycle: 'NONE',
        effectTruth: 'PRE_EXECUTION_NO_EFFECT'
      }
    },
    candidateDisposition: 'NONE',
    latestEvidenceRefs: []
  };

  return {
    ...base,
    ...overrides,
    source: { ...base.source, ...(overrides.source ?? {}) },
    lineage: { ...base.lineage, ...(overrides.lineage ?? {}) },
    model: { ...base.model, ...(overrides.model ?? {}) },
    receipts: { ...base.receipts, ...(overrides.receipts ?? {}) },
    workers: {
      ...base.workers,
      ...(overrides.workers ?? {}),
      training: {
        ...base.workers.training,
        ...(overrides.workers?.training ?? {})
      }
    }
  };
}

function acceptedThrough(lastStage) {
  const stages = [
    'VB0', 'VB1', 'VB2', 'VB3', 'VB4', 'VB5',
    'VB6', 'VB7', 'VB8', 'VB9', 'VB10', 'VB11', 'VB12'
  ];
  const receipts = {};
  for (const stage of stages) {
    if (stage === lastStage) {
      receipts[stage] = { state: 'ACCEPTED' };
      break;
    }
    receipts[stage] = { state: 'ACCEPTED' };
  }
  return receipts;
}

function candidateArtifact(
  generationRef = 'generation.vex.g1.candidate'
) {
  return {
    generationRef,
    sha256: 'a'.repeat(64),
    bytes: 4096
  };
}

test('projects a fresh session to PREPARE / VB0 without effects', () => {
  const state = reduceVexBirthLabState(evidence());
  assert.equal(state.schemaVersion, VEX_BIRTH_LAB_STATE_SCHEMA);
  assert.equal(state.currentChapter, 'PREPARE');
  assert.equal(state.currentVBStage, 'VB0');
  assert.equal(state.modelTruthClass, 'CURRENT_REAL_LOCAL_G0');
  assert.equal(state.trainingEffectTruth, 'PRE_EXECUTION_NO_EFFECT');
  assert.equal(state.effects.trainingPerformed, false);
  assert.equal(state.effects.modelCalled, false);
  assert.ok(
    state.availableActions.some(
      (action) => action.actionRef === 'action.birth.prepare-g0'
    )
  );
  assert.ok(
    state.availableActions.some(
      (action) => action.actionRef === 'action.birth.support.copy'
    )
  );
});

test('maps accepted VB0/VB1 to Meet G0 and requires real model', () => {
  const receipts = acceptedThrough('VB1');
  const ready = reduceVexBirthLabState(evidence({ receipts }));
  assert.equal(ready.currentChapter, 'MEET_G0');
  assert.equal(ready.currentVBStage, 'VB2');
  assert.ok(
    ready.availableActions.some(
      (action) => action.actionRef === 'action.birth.baseline.finish'
    )
  );

  const unavailable = reduceVexBirthLabState(
    evidence({
      receipts,
      model: { bindingState: 'UNBOUND' }
    })
  );
  assert.equal(
    unavailable.modelTruthClass,
    'MODEL_UNAVAILABLE_NO_SYNTHETIC_SUBSTITUTE'
  );
  assert.ok(
    unavailable.heldActions.some(
      (action) => action.reasonCode === 'REAL_MODEL_NOT_BOUND'
    )
  );
});

test('stale source holds the stage action but preserves support exports', () => {
  const state = reduceVexBirthLabState(
    evidence({ source: { currentness: 'STALE' } })
  );
  assert.ok(
    state.heldActions.some(
      (action) => action.reasonCode === 'SOURCE_REVALIDATION_REQUIRED'
    )
  );
  assert.ok(
    state.availableActions.some(
      (action) => action.actionRef === 'action.birth.support.copy'
    )
  );
  assert.ok(
    state.availableActions.some(
      (action) => action.actionRef ===
        'action.birth.status-package.generate'
    )
  );
});

test('preserves post-optimizer changed-weight truth without performing work', () => {
  const state = reduceVexBirthLabState(
    evidence({
      workers: {
        training: {
          lifecycle: 'WRAPPING_UP',
          effectTruth: 'POST_OPTIMIZER_CHANGED'
        }
      }
    })
  );
  assert.equal(state.trainingEffectTruth, 'POST_OPTIMIZER_CHANGED');
  assert.equal(state.workerLifecycle, 'WRAPPING_UP');
  assert.equal(state.effects.trainingPerformed, false);
});

test('rejects accepted stages after a missing predecessor', () => {
  assert.throws(
    () =>
      reduceVexBirthLabState(
        evidence({
          receipts: {
            VB0: { state: 'ACCEPTED' },
            VB2: { state: 'ACCEPTED' }
          }
        })
      ),
    (error) =>
      error instanceof VexBirthLabError &&
      error.code === 'BIRTH_RECEIPT_SEQUENCE_CONTRADICTORY'
  );
});

test('support context is bounded, explicit, and non-executable', () => {
  const state = reduceVexBirthLabState(evidence());
  const context = formVexBirthSupportContext(state, {
    question: 'Which visible button is safe next?',
    includeSelectedExcerpt: true,
    selectedExcerpt: 'Victor: selected bounded excerpt'
  });

  assert.equal(
    context.schemaVersion,
    VEX_BIRTH_SUPPORT_CONTEXT_SCHEMA
  );
  assert.equal(context.artifactClass, 'CONTEXT_HANDOFF');
  assert.equal(context.executable, false);
  assert.equal(context.executionAuthorityGranted, false);
  assert.equal(context.rawTranscriptIncluded, false);
  assert.equal(
    context.selectedExcerpt,
    'Victor: selected bounded excerpt'
  );
  assert.ok(
    context.availableActions.every(
      (action) => action.autoExecute === false
    )
  );
});

test('support export rejects private paths and credentials without echoing them', () => {
  const state = reduceVexBirthLabState(evidence());
  const secret = 'ghp_012345678901234567890123456789';

  assert.throws(
    () => formVexBirthSupportContext(state, {
      question: `Authorization: Bearer ${secret}`
    }),
    (error) =>
      error instanceof VexBirthLabError &&
      error.code === 'BIRTH_SUPPORT_CONTEXT_REDACTION_REQUIRED' &&
      !error.message.includes(secret)
  );

  const privatePath = 'C:\\Users\\Victor\\private-birth.txt';
  assert.throws(
    () => formVexBirthSupportContext(state, {
      question: 'Can you explain this selected evidence?',
      includeSelectedExcerpt: true,
      selectedExcerpt: privatePath
    }),
    (error) =>
      error instanceof VexBirthLabError &&
      error.code === 'BIRTH_SUPPORT_CONTEXT_REDACTION_REQUIRED' &&
      !error.message.includes(privatePath)
  );

  assert.throws(
    () => reduceVexBirthLabState(evidence({
      latestEvidenceRefs: ['/Users/victor/private-birth.json']
    })),
    (error) =>
      error instanceof VexBirthLabError &&
      error.code === 'BIRTH_EVIDENCE_INVALID' &&
      !error.message.includes('/Users/victor/private-birth.json')
  );

  assert.throws(
    () => reduceVexBirthLabState(evidence({
      latestEvidenceRefs: [secret]
    })),
    (error) =>
      error instanceof VexBirthLabError &&
      error.code === 'BIRTH_EVIDENCE_INVALID' &&
      !error.message.includes(secret)
  );
});

test('status package model cannot become an executable relay', () => {
  const state = reduceVexBirthLabState(evidence());
  const model = formVexBirthStatusPackageModel(state, {
    includeSelectedExcerpts: true,
    selectedExcerptCount: 2
  });

  assert.equal(
    model.schemaVersion,
    VEX_BIRTH_STATUS_PACKAGE_SCHEMA
  );
  assert.equal(model.artifactClass, 'CONTEXT_HANDOFF');
  assert.equal(model.executable, false);
  assert.equal(model.taskManifestIncluded, false);
  assert.equal(model.returnManifestIncluded, false);
  assert.equal(model.executionAuthorityGranted, false);
  assert.ok(model.files.includes('excerpts/selected-excerpts.md'));
});

test('support-only selection does not conflict with one training disposition', () => {
  const result = validateVexBirthAnnotationSet([
    {
      annotationRef: 'annotation.birth.support.1',
      conversationRangeRef: 'range.birth.1',
      disposition: 'SUPPORT_ONLY'
    },
    {
      annotationRef: 'annotation.birth.train.1',
      conversationRangeRef: 'range.birth.1',
      disposition: 'TRAIN'
    }
  ]);

  assert.equal(result.state, 'VALID');
  assert.equal(result.supportOnlyDoesNotGrantTrainingConsent, true);
});

test('training and held-out cannot target the same conversation range', () => {
  assert.throws(
    () =>
      validateVexBirthAnnotationSet([
        {
          annotationRef: 'annotation.birth.train.1',
          conversationRangeRef: 'range.birth.1',
          disposition: 'TRAIN'
        },
        {
          annotationRef: 'annotation.birth.heldout.1',
          conversationRangeRef: 'range.birth.1',
          disposition: 'HELD_OUT'
        }
      ]),
    (error) =>
      error instanceof VexBirthLabError &&
      error.code === 'BIRTH_ANNOTATION_DISPOSITION_CONFLICT'
  );
});

test('VB10 registration requires ACCEPT and exact candidate byte evidence', () => {
  const receipts = acceptedThrough('VB9');
  for (const candidateDisposition of ['NARROW', 'REJECT']) {
    const held = reduceVexBirthLabState(evidence({
      receipts,
      candidateDisposition,
      lineage: {
        candidateGenerationRefOrNull: 'generation.vex.g1.candidate'
      },
      candidateArtifactOrNull: candidateArtifact()
    }));
    assert.equal(held.currentVBStage, 'VB10');
    assert.ok(
      held.heldActions.some(
        (action) => action.reasonCode === 'CANDIDATE_NOT_ACCEPTED'
      )
    );
    assert.equal(
      held.availableActions.some(
        (action) => action.actionRef === 'action.birth.generation.register'
      ),
      false
    );
  }

  const noCandidate = reduceVexBirthLabState(evidence({
    receipts,
    candidateDisposition: 'ACCEPT'
  }));
  assert.ok(
    noCandidate.heldActions.some(
      (action) => action.reasonCode === 'ACCEPTED_CANDIDATE_NOT_BOUND'
    )
  );

  const noBytes = reduceVexBirthLabState(evidence({
    receipts,
    candidateDisposition: 'ACCEPT',
    lineage: {
      candidateGenerationRefOrNull: 'generation.vex.g1.candidate'
    }
  }));
  assert.ok(
    noBytes.heldActions.some(
      (action) => action.reasonCode === 'ACCEPTED_CANDIDATE_NOT_BOUND'
    )
  );

  const wrongBytes = reduceVexBirthLabState(evidence({
    receipts,
    candidateDisposition: 'ACCEPT',
    lineage: {
      candidateGenerationRefOrNull: 'generation.vex.g1.candidate'
    },
    candidateArtifactOrNull: candidateArtifact('generation.vex.g1.other')
  }));
  assert.ok(
    wrongBytes.heldActions.some(
      (action) => action.reasonCode === 'ACCEPTED_CANDIDATE_NOT_BOUND'
    )
  );

  const bound = reduceVexBirthLabState(evidence({
    receipts,
    candidateDisposition: 'ACCEPT',
    lineage: {
      candidateGenerationRefOrNull: 'generation.vex.g1.candidate'
    },
    candidateArtifactOrNull: candidateArtifact()
  }));
  assert.ok(
    bound.availableActions.some(
      (action) => action.actionRef === 'action.birth.generation.register'
    )
  );
});

test('wake remains held without ACCEPT and separate activation authority', () => {
  const receipts = acceptedThrough('VB10');
  const notAccepted = reduceVexBirthLabState(
    evidence({
      receipts,
      candidateDisposition: 'NARROW',
      lineage: {
        candidateGenerationRefOrNull: 'generation.vex.g1.candidate'
      },
      candidateArtifactOrNull: candidateArtifact()
    })
  );
  assert.equal(notAccepted.currentVBStage, 'VB11');
  assert.ok(
    notAccepted.heldActions.some(
      (action) => action.reasonCode === 'CANDIDATE_NOT_ACCEPTED'
    )
  );

  const noAuthority = reduceVexBirthLabState(
    evidence({
      receipts,
      candidateDisposition: 'ACCEPT',
      lineage: {
        candidateGenerationRefOrNull: 'generation.vex.g1.candidate',
        acceptedCandidateRefOrNull: 'generation.vex.g1.candidate'
      },
      candidateArtifactOrNull: candidateArtifact(),
      separateActivationAuthorityAvailable: false
    })
  );
  assert.ok(
    noAuthority.heldActions.some(
      (action) => action.reasonCode ===
        'ACTIVATION_AUTHORITY_UNAVAILABLE'
    )
  );
});

test('VB11 Wake requires exact registered accepted-candidate identity and bytes', () => {
  const receipts = acceptedThrough('VB10');
  for (const acceptedCandidateRefOrNull of [
    null,
    'generation.vex.g1.other'
  ]) {
    const held = reduceVexBirthLabState(evidence({
      receipts,
      candidateDisposition: 'ACCEPT',
      lineage: {
        candidateGenerationRefOrNull: 'generation.vex.g1.candidate',
        acceptedCandidateRefOrNull
      },
      candidateArtifactOrNull: candidateArtifact(),
      separateActivationAuthorityAvailable: true
    }));
    assert.ok(
      held.heldActions.some(
        (action) => action.reasonCode === 'ACCEPTED_CANDIDATE_NOT_BOUND'
      )
    );
    assert.equal(
      held.availableActions.some(
        (action) => action.actionRef === 'action.birth.generation.wake'
      ),
      false
    );
  }

  const noBytes = reduceVexBirthLabState(evidence({
    receipts,
    candidateDisposition: 'ACCEPT',
    lineage: {
      candidateGenerationRefOrNull: 'generation.vex.g1.candidate',
      acceptedCandidateRefOrNull: 'generation.vex.g1.candidate'
    },
    separateActivationAuthorityAvailable: true
  }));
  assert.ok(
    noBytes.heldActions.some(
      (action) => action.reasonCode === 'ACCEPTED_CANDIDATE_NOT_BOUND'
    )
  );

  const ready = reduceVexBirthLabState(evidence({
    receipts,
    candidateDisposition: 'ACCEPT',
    lineage: {
      candidateGenerationRefOrNull: 'generation.vex.g1.candidate',
      acceptedCandidateRefOrNull: 'generation.vex.g1.candidate'
    },
    candidateArtifactOrNull: candidateArtifact(),
    separateActivationAuthorityAvailable: true
  }));
  assert.ok(
    ready.availableActions.some(
      (action) => action.actionRef === 'action.birth.generation.wake'
    )
  );
});

test('BORN completion claim requires current active accepted G1 with exact bytes', () => {
  const receipts = acceptedThrough('VB12');
  const base = {
    receipts,
    candidateDisposition: 'ACCEPT',
    lineage: {
      candidateGenerationRefOrNull: 'generation.vex.g1.candidate',
      acceptedCandidateRefOrNull: 'generation.vex.g1.candidate'
    },
    candidateArtifactOrNull: candidateArtifact()
  };

  const g0StillActive = reduceVexBirthLabState(evidence(base));
  assert.equal(g0StillActive.currentVBStage, 'BORN');
  assert.equal(g0StillActive.completionClaimAllowed, false);

  const noBytes = reduceVexBirthLabState(evidence({
    ...base,
    candidateArtifactOrNull: null,
    lineage: {
      ...base.lineage,
      activeGenerationRef: 'generation.vex.g1.candidate'
    }
  }));
  assert.equal(noBytes.completionClaimAllowed, false);

  const stale = reduceVexBirthLabState(evidence({
    ...base,
    source: { currentness: 'STALE' },
    lineage: {
      ...base.lineage,
      activeGenerationRef: 'generation.vex.g1.candidate'
    }
  }));
  assert.equal(stale.completionClaimAllowed, false);

  const complete = reduceVexBirthLabState(evidence({
    ...base,
    lineage: {
      ...base.lineage,
      activeGenerationRef: 'generation.vex.g1.candidate'
    }
  }));
  assert.equal(complete.modelTruthClass, 'CURRENT_REAL_LOCAL_G1');
  assert.equal(complete.completionClaimAllowed, true);
});

test('chapter projection is stable and rejects unknown stages', () => {
  assert.equal(projectVexBirthHumanChapter('VB6'), 'TRAIN_AND_COMPARE');
  assert.equal(projectVexBirthHumanChapter('BORN'), 'COMPLETE');
  assert.throws(
    () => projectVexBirthHumanChapter('VB99'),
    (error) =>
      error instanceof VexBirthLabError &&
      error.code === 'BIRTH_STAGE_UNKNOWN'
  );
});

// [VXG RealForever]
