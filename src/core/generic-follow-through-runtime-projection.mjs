import { loadBlueprint } from './blueprint.mjs';
import {
  readIntentWorkgraphRuntimeSnapshots
} from './intent-workgraph-runtime-snapshot.mjs';
import {
  readIntentSchedulerRuntimeSnapshots
} from './intent-scheduler-runtime-snapshot.mjs';
import {
  readConcernWatchRuntimeSnapshots
} from './concern-watch-runtime-snapshot.mjs';

export const GENERIC_FOLLOW_THROUGH_RUNTIME_PROJECTION_SCHEMA = 'vexlife.generic-follow-through-runtime-projection/v1';
export const GENERIC_FOLLOW_THROUGH_RUNTIME_PROJECTION_SOURCE_REF = 'projection.vexlife.generic-follow-through-runtime.001';

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  throw error;
}

function requireGraphRef(graphFingerprints, value, label) {
  if (value === null || value === undefined || value === '') return;
  if (!graphFingerprints.has(value)) {
    fail('GENERIC_FOLLOW_THROUGH_RUNTIME_LINEAGE_MISMATCH', `${label} references a Workgraph that is not current in the owner-local Workgraph snapshot surface`, {
      graphFingerprint: value
    });
  }
}

function requireSchedulerRef(schedulerFingerprints, value, label) {
  if (value === null || value === undefined || value === '') return;
  if (!schedulerFingerprints.has(value)) {
    fail('GENERIC_FOLLOW_THROUGH_RUNTIME_LINEAGE_MISMATCH', `${label} references a Scheduler aggregate that is not current in the owner-local Scheduler snapshot surface`, {
      schedulerAggregateFingerprint: value
    });
  }
}

function validateSchedulerLineage(workgraphs, schedulerSnapshots) {
  const graphFingerprints = new Set(workgraphs.map((graph) => graph.semanticFingerprint));
  for (const snapshot of schedulerSnapshots) {
    const aggregate = snapshot.aggregate;
    requireGraphRef(graphFingerprints, aggregate.queue?.graphFingerprint, 'Scheduler queue');
    requireGraphRef(graphFingerprints, aggregate.active?.graphFingerprint, 'Scheduler active lease');
    for (const due of aggregate.dueRecords ?? []) {
      requireGraphRef(graphFingerprints, due?.graphFingerprint, 'Scheduler due record');
    }
    for (const pending of aggregate.pendingRootIntents ?? []) {
      requireGraphRef(graphFingerprints, pending?.graphFingerprint, 'Scheduler pending root');
    }
  }
  return graphFingerprints;
}

function validateConcernLineage(graphFingerprints, schedulerSnapshots, concernAggregates) {
  const schedulerFingerprints = new Set(schedulerSnapshots.map((snapshot) => snapshot.aggregate.semanticFingerprint));
  for (const aggregate of concernAggregates) {
    for (const admission of aggregate.schedulerAdmissions ?? []) {
      requireGraphRef(graphFingerprints, admission?.workgraphFingerprint, 'Concern Watch scheduler admission');
      requireSchedulerRef(
        schedulerFingerprints,
        admission?.schedulerAggregateFingerprint ?? admission?.schedulerFingerprint,
        'Concern Watch scheduler admission'
      );
    }
    for (const observation of aggregate.observations ?? []) {
      const due = observation?.schedulerDueEvidence;
      if (!due) continue;
      requireGraphRef(graphFingerprints, due.graphFingerprint, 'Concern Watch scheduler-due observation');
      requireSchedulerRef(
        schedulerFingerprints,
        due.schedulerAggregateFingerprint ?? due.schedulerFingerprint,
        'Concern Watch scheduler-due observation'
      );
    }
  }
}

function sourceBundleOrThrow(sourceBundle) {
  if (
    !sourceBundle
    || typeof sourceBundle !== 'object'
    || !sourceBundle.intentRegistry
    || !sourceBundle.schedulerRegistry
    || !sourceBundle.blueprint?.concernWatch
  ) {
    fail('GENERIC_FOLLOW_THROUGH_RUNTIME_SOURCE_INVALID', 'Generic follow-through runtime projection requires exact source-managed owner registries');
  }
  return sourceBundle;
}

export function readGenericFollowThroughRuntimeProjection({
  home,
  sourceBundle = loadBlueprint()
} = {}) {
  const sources = sourceBundleOrThrow(sourceBundle);
  const workgraphs = readIntentWorkgraphRuntimeSnapshots({ home });
  const schedulerSnapshots = readIntentSchedulerRuntimeSnapshots({
    home,
    schedulerRegistry: sources.schedulerRegistry
  });
  const concernAggregates = readConcernWatchRuntimeSnapshots({
    home,
    registry: sources.blueprint.concernWatch
  });

  const graphFingerprints = validateSchedulerLineage(workgraphs, schedulerSnapshots);
  validateConcernLineage(graphFingerprints, schedulerSnapshots, concernAggregates);

  return Object.freeze({
    schemaVersion: GENERIC_FOLLOW_THROUGH_RUNTIME_PROJECTION_SCHEMA,
    state: 'CURRENT',
    currentness: 'CURRENT',
    sourceRef: GENERIC_FOLLOW_THROUGH_RUNTIME_PROJECTION_SOURCE_REF,
    workgraphs: Object.freeze(workgraphs.map((graph) => Object.freeze(structuredClone(graph)))),
    schedulerAggregates: Object.freeze(schedulerSnapshots.map((snapshot) => Object.freeze(structuredClone(snapshot.aggregate)))),
    concernAggregates: Object.freeze(concernAggregates.map((aggregate) => Object.freeze(structuredClone(aggregate))))
  });
}

export function createGenericFollowThroughRuntimeProjectionResolver({
  home,
  sourceBundle = loadBlueprint()
} = {}) {
  const sources = sourceBundleOrThrow(sourceBundle);
  return async function resolveGenericFollowThroughRuntimeProjection() {
    return readGenericFollowThroughRuntimeProjection({ home, sourceBundle: sources });
  };
}

// [VXG RealForever]
