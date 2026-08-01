#!/usr/bin/env node
import { projectBurdenRelease } from '../src/core/burden-release.mjs';
import { projectContinuityRecord } from '../src/core/continuity-evolution-router.mjs';
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
  record: projectContinuityRecord(result.record),
  burdenRelease: projectBurdenRelease(result.record.burdenRelease),
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
