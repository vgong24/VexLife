import path from 'node:path';

import { loadBlueprint } from './blueprint.mjs';
import { readGenericFollowThroughRuntimeProjection } from './generic-follow-through-runtime-projection.mjs';
import { projectIntentStatus } from './intent-projection.mjs';
import { readJson } from './utils.mjs';
import { projectRefinementCurrent } from './refinement-current-projection.mjs';

function exactSourceBundle(sourceBundle) {
  if (
    !sourceBundle
    || typeof sourceBundle !== 'object'
    || !sourceBundle.intentRegistry
    || !sourceBundle.factory
    || !sourceBundle.blueprint
    || !sourceBundle.root
  ) {
    const error = new Error('Refinement current runtime projection requires exact source-managed blueprint owners');
    error.code = 'REFINEMENT_CURRENT_SOURCE_INVALID';
    throw error;
  }
  return sourceBundle;
}

function trustSnapshotFor(sourceBundle, supplied) {
  if (supplied) return supplied;
  return readJson(path.join(sourceBundle.root, 'blueprint/intent-trust-snapshot.json'));
}

export function readRefinementCurrentProjection({
  home,
  sourceBundle = loadBlueprint(),
  trustSnapshot = null,
  recentLimit = 5
} = {}) {
  const sources = exactSourceBundle(sourceBundle);
  const runtime = readGenericFollowThroughRuntimeProjection({ home, sourceBundle: sources });
  const trust = trustSnapshotFor(sources, trustSnapshot);
  const registeredProcessRefs = (sources.factory.processes ?? []).map((item) => item.processRef);
  const registeredRoleRefs = (sources.blueprint.roles ?? []).map((item) => item.roleRef);
  const intentStatusProjections = runtime.workgraphs.map((graph) => projectIntentStatus(graph, {
    registry: sources.intentRegistry,
    registeredProcessRefs,
    registeredRoleRefs,
    trustSnapshot: trust,
    recentLimit
  }));

  return projectRefinementCurrent({
    intentStatusProjections,
    runtimeSourceRef: runtime.sourceRef
  });
}

// [VXG RealForever]
