#!/usr/bin/env node
import { runRecoverySimulation } from './recovery-simulate.mjs';

const result = runRecoverySimulation({ writeReceipt: false });
console.log(JSON.stringify({
  schemaVersion: 'vexlife.runtime-recovery-status/v0',
  state: result.receipt.state === 'PASS' ? 'CURRENT' : 'BLOCKED',
  currentness: result.receipt.currentness,
  aggregateRef: result.aggregate.aggregateRef,
  aggregateFingerprint: result.aggregate.semanticFingerprint,
  queue: result.projection.queue,
  terrain: result.projection.terrain,
  health: result.projection.health,
  guide: result.projection.guide,
  sourceDescent: {
    registryRef: 'registry.vexlife.runtime-recovery.001',
    detailCommand: 'npm run recovery:simulate'
  }
}, null, 2));
if (result.receipt.state !== 'PASS') process.exitCode = 1;

// [VXG RealForever]
