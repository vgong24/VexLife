#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';

import {
  REFINEMENT_CURRENT_PROJECTION_SCHEMA,
  REFINEMENT_CURRENT_PROJECTION_SOURCE_REF
} from '../src/core/refinement-current-projection.mjs';
import { readRefinementCurrentProjection } from '../src/core/refinement-current-runtime.mjs';

const home = path.resolve(process.env.VEXLIFE_HOME ?? path.join(os.homedir(), '.vexlife'));

try {
  const projection = readRefinementCurrentProjection({ home });
  console.log(JSON.stringify(projection, null, 2));
} catch (error) {
  console.log(JSON.stringify({
    schemaVersion: REFINEMENT_CURRENT_PROJECTION_SCHEMA,
    state: 'HELD_UNAVAILABLE',
    currentness: 'UNKNOWN',
    sourceRef: REFINEMENT_CURRENT_PROJECTION_SOURCE_REF,
    runtimeSourceRef: null,
    effects: false,
    executionAuthority: 'NONE',
    reasonCode: typeof error?.code === 'string' && error.code ? error.code : 'REFINEMENT_CURRENT_UNAVAILABLE',
    reason: typeof error?.message === 'string' && error.message ? error.message : 'Refinement current-work projection is unavailable'
  }, null, 2));
  process.exitCode = 1;
}

// [VXG RealForever]
