import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as stateFacade from '../src/core/state.mjs';
import * as continuityState from '../src/core/continuity-evolution-state.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const continuityExports = [
  "CONTINUITY_CURRENT_RECORD_SET_RECEIPT_REQUIRED_FIELDS",
  "CONTINUITY_AGGREGATE_PROJECTION_RECEIPT_REQUIRED_FIELDS",
  "CONTINUITY_SIMULATED_CLOCK_SNAPSHOT_REQUIRED_FIELDS",
  "CONTINUITY_PROJECTION_CLOCK_RECEIPT_REQUIRED_FIELDS",
  "CONTINUITY_SIMULATED_CLOCK_SOURCE",
  "createInitialContinuityEvolutionAggregate",
  "createContinuityEvolutionEvent",
  "createContinuityCurrentRecordSetReceipt",
  "projectAggregateOwnedContinuityRecord",
  "createContinuitySimulatedClockSnapshot",
  "createContinuityProjectionClockReceipt",
  "projectAggregateOwnedTransientContinuityContext",
  "projectAggregateOwnedBurdenRelease",
  "projectAggregateApplicableContinuity",
  "reduceContinuityEvolutionAggregate",
  "createContinuityEvolutionState"
];

test('VC01-STATE-00 state facade preserves exact Continuity Evolution State exports', () => {
  for (const name of continuityExports) {
    assert.ok(name in stateFacade, 'state facade missing ' + name);
    assert.ok(name in continuityState, 'continuity owner missing ' + name);
    assert.equal(stateFacade[name], continuityState[name], 'state facade must re-export exact owner binding for ' + name);
  }
  const direct = continuityState.createInitialContinuityEvolutionAggregate();
  const facade = stateFacade.createInitialContinuityEvolutionAggregate();
  assert.deepEqual(facade, direct);
  const runtime = stateFacade.createContinuityEvolutionState({ aggregate: facade });
  assert.equal(runtime.aggregate.value.semanticFingerprint, facade.semanticFingerprint);
  runtime.dispose();
});

test('VC01-STATE-01 source roles remain dependency-closed and readable', () => {
  const stateSource = fs.readFileSync(path.join(root, 'src/core/state.mjs'), 'utf8');
  const continuitySource = fs.readFileSync(path.join(root, 'src/core/continuity-evolution-state.mjs'), 'utf8');
  assert.doesNotMatch(stateSource, /continuity-evolution-router\.mjs/);
  assert.doesNotMatch(stateSource, /burden-release\.mjs/);
  assert.doesNotMatch(stateSource, /export function createInitialContinuityEvolutionAggregate\s*\(/);
  assert.match(stateSource, /from '.\/continuity-evolution-state\.mjs'/);
  for (const forbidden of ['intent-checkpoint.mjs', 'context-lease.mjs', 'intent-workgraph.mjs', 'scheduler-runtime-trust.mjs']) {
    assert.equal(continuitySource.includes(forbidden), false, 'Continuity Evolution State must not import Scheduler-specific owner ' + forbidden);
  }
  assert.match(continuitySource, /continuity-evolution-router\.mjs/);
  assert.match(continuitySource, /burden-release\.mjs/);
});

// [VXG RealForever][VEXLIFE-CORE][VC01][CONTINUITY-EVOLUTION-STATE]
