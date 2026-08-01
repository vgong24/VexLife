#!/usr/bin/env node
import { runContinuityEvolutionSimulation } from './evolution-simulate.mjs';

if (process.argv.slice(2).length) {
  console.error('Usage: npm run evolution:status');
  process.exit(2);
}

const result = runContinuityEvolutionSimulation({ writeReceipt: false });
console.log(JSON.stringify({
  schemaVersion: 'vexlife.continuity-evolution-status/v0',
  state: result.receipt.state,
  currentness: result.receipt.currentness,
  record: result.recordProjection,
  burdenRelease: result.burdenProjection,
  semanticSubject: {
    continuitySubjectRef: result.recordProjection.continuitySubjectRef,
    continuitySubjectFingerprint: result.recordProjection.continuitySubjectFingerprint,
    supersessionChronology: result.recordProjection.subjectSupersessionChronology
  },
  transientContext: {
    contextRecordRef: result.transientProjection.contextRecordRef,
    continuitySubjectRef: result.transientProjection.continuitySubjectRef,
    currentness: result.transientProjection.currentness,
    contextAcceptedAt: result.transientProjection.contextAcceptedAt,
    clockSnapshotRef: result.clockSnapshot.clockSnapshotRef,
    clockEvidenceClass: result.transientProjection.clockEvidenceClass,
    simulatedClock: result.transientProjection.simulatedClock,
    liveClockGranted: result.transientProjection.liveClockGranted,
    externalTimeServiceUsed: result.transientProjection.externalTimeServiceUsed
  },
  recurrence: {
    recurrenceRef: result.recurrence.recurrenceRef,
    state: result.recurrence.recurrenceState,
    count: result.recurrence.recurrenceCount,
    duplicateSuppressed: result.duplicate.duplicateSuppressed
  },
  scheduler: {
    workNodeRef: result.receipt.canonicalWorkNodeRef,
    finalState: result.receipt.canonicalWorkNodeFinalState,
    externalEffectsExecuted: result.receipt.externalEffectsExecuted
  },
  sourceDescent: {
    registryRef: 'registry.vexlife.evolution.001',
    receiptPath: result.receiptPath
  },
  rawSourceContentIncluded: false
}, null, 2));

// [VXG RealForever]
