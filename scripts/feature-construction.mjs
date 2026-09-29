#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import {
  VEXLIFE_ROOT,
  buildCurrentSourceProfile,
  compileFeatureConstructionPacket,
  loadFeatureConstructionRegistry,
  scaffoldFeatureConstructionCandidate
} from '../src/core/feature-construction.mjs';
import { requireSafeRelativePath } from '../src/core/utils.mjs';

const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const known = new Set([
  '--candidate',
  '--feature-ref',
  '--purpose',
  '--platforms',
  '--canonical-nodes',
  '--intro-disposition',
  '--intro-route-state',
  '--intro-plan-ref',
  '--intro-rationale'
]);
for (let index = 0; index < args.length; index += 1) {
  const token = args[index];
  if (!token.startsWith('--') || !known.has(token)) {
    console.error(JSON.stringify({ state: 'FEATURE_CONSTRUCTION_BLOCKED', error: `unsupported argument ${token}` }, null, 2));
    process.exit(2);
  }
  if (!args[index + 1] || args[index + 1].startsWith('--')) {
    console.error(JSON.stringify({ state: 'FEATURE_CONSTRUCTION_BLOCKED', error: `${token} requires a value` }, null, 2));
    process.exit(2);
  }
  index += 1;
}

try {
  const candidatePath = value('--candidate');
  const hasScaffoldArgs = Boolean(value('--feature-ref') || value('--purpose') || value('--platforms') || value('--canonical-nodes'));
  if (candidatePath && hasScaffoldArgs) throw new Error('--candidate cannot be combined with scaffold arguments');

  let candidate;
  if (candidatePath) {
    const safe = requireSafeRelativePath(candidatePath, '--candidate');
    candidate = JSON.parse(fs.readFileSync(path.resolve(VEXLIFE_ROOT, safe), 'utf8'));
  } else {
    candidate = scaffoldFeatureConstructionCandidate({
      featureRef: value('--feature-ref'),
      purpose: value('--purpose'),
      platformRefs: (value('--platforms') ?? '').split(',').map((item) => item.trim()).filter(Boolean),
      canonicalNodeRefs: (value('--canonical-nodes') ?? '').split(',').map((item) => item.trim()).filter(Boolean),
      humanIntroduction: {
        disposition: value('--intro-disposition'),
        routeState: value('--intro-route-state'),
        planRefOrNull: value('--intro-plan-ref') || null,
        rationale: value('--intro-rationale')
      }
    });
  }

  const registry = loadFeatureConstructionRegistry(VEXLIFE_ROOT);
  const currentSourceProfile = buildCurrentSourceProfile({ root: VEXLIFE_ROOT, registry });
  const packet = compileFeatureConstructionPacket({ candidate, currentSourceProfile, registry });
  console.log(JSON.stringify(packet, null, 2));
} catch (error) {
  console.error(JSON.stringify({ state: 'FEATURE_CONSTRUCTION_BLOCKED', error: error.message }, null, 2));
  process.exitCode = 1;
}

// [VXG RealForever]
