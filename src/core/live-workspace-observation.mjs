import { collectLocalSourceObservation } from './repository-evidence.mjs';
import { semanticHash } from './utils.mjs';

export const LIVE_WORKSPACE_OBSERVATION_SCHEMA = 'vexlife.live-workspace-observation/v1';

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function clone(value) {
  return structuredClone(value);
}

function stableRef(value, label) {
  if (typeof value !== 'string' || value.length === 0 || /\s/u.test(value)) {
    throw new TypeError(`${label} must be one stable ref`);
  }
  return value;
}

function failureCode(error) {
  return typeof error?.code === 'string' && error.code
    ? error.code
    : 'LIVE_WORKSPACE_OBSERVATION_UNAVAILABLE';
}

function heldSnapshot({ revision, lastKnownGood, code, requestSequence, hintRef }) {
  return freeze({
    schemaVersion: LIVE_WORKSPACE_OBSERVATION_SCHEMA,
    state: lastKnownGood ? 'HELD_LAST_KNOWN_GOOD' : 'HELD_UNAVAILABLE',
    currentness: 'UNKNOWN',
    revision,
    requestSequence,
    hintRef,
    observationFingerprint: null,
    observation: null,
    lastKnownGood: lastKnownGood
      ? {
          revision: lastKnownGood.revision,
          observationFingerprint: lastKnownGood.observationFingerprint,
          observation: lastKnownGood.observation
        }
      : null,
    failureCode: code,
    effects: false,
    executionAuthority: 'NONE'
  });
}

function currentSnapshot({ revision, requestSequence, hintRef, observationFingerprint, observation }) {
  return freeze({
    schemaVersion: LIVE_WORKSPACE_OBSERVATION_SCHEMA,
    state: 'CURRENT',
    currentness: 'CURRENT',
    revision,
    requestSequence,
    hintRef,
    observationFingerprint,
    observation,
    lastKnownGood: null,
    failureCode: null,
    effects: false,
    executionAuthority: 'NONE'
  });
}

export function createLocalSourceLiveWorkspaceConvergence({
  sourceRoot,
  environment = process.env,
  observationOptions = {}
} = {}) {
  if (typeof sourceRoot !== 'string' || sourceRoot.length === 0) {
    throw new TypeError('Local-source Live Workspace convergence requires one sourceRoot');
  }
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) {
    throw new TypeError('Local-source Live Workspace environment must be one object');
  }
  if (!observationOptions || typeof observationOptions !== 'object' || Array.isArray(observationOptions)) {
    throw new TypeError('Local-source Live Workspace observationOptions must be one object');
  }

  const environmentSnapshot = Object.freeze({ ...environment });
  const optionsSnapshot = Object.freeze(structuredClone(observationOptions));

  return createLiveWorkspaceObservationConvergence({
    observeTruth() {
      return collectLocalSourceObservation(sourceRoot, environmentSnapshot, optionsSnapshot);
    }
  });
}

export function createLiveWorkspaceObservationConvergence({ observeTruth } = {}) {
  if (typeof observeTruth !== 'function') {
    throw new TypeError('Live Workspace convergence requires one truth observer');
  }

  let latestRequestedSequence = 0;
  let revision = 0;
  let lastKnownGood = null;
  let snapshot = heldSnapshot({
    revision,
    lastKnownGood,
    code: 'NOT_OBSERVED_YET',
    requestSequence: 0,
    hintRef: null
  });

  function staleOutcome(sequence) {
    return freeze({
      state: 'STALE_RESULT_DROPPED',
      published: false,
      requestSequence: sequence,
      latestRequestedSequence,
      snapshot
    });
  }

  return Object.freeze({
    snapshot() {
      return snapshot;
    },

    async observe({ hintRef = 'hint.live-workspace.reobserve' } = {}) {
      const exactHintRef = stableRef(hintRef, 'hintRef');
      const requestSequence = ++latestRequestedSequence;

      try {
        const observed = await observeTruth();
        if (!observed || typeof observed !== 'object' || Array.isArray(observed)) {
          throw Object.assign(new TypeError('Live Workspace truth observer must return one object'), {
            code: 'LIVE_WORKSPACE_TRUTH_INVALID'
          });
        }
        const observation = freeze(clone(observed));
        const observationFingerprint = semanticHash(observation);

        if (requestSequence !== latestRequestedSequence) {
          return staleOutcome(requestSequence);
        }

        const changed = lastKnownGood?.observationFingerprint !== observationFingerprint;
        if (changed) {
          revision += 1;
          lastKnownGood = freeze({
            revision,
            observationFingerprint,
            observation
          });
        }

        snapshot = currentSnapshot({
          revision,
          requestSequence,
          hintRef: exactHintRef,
          observationFingerprint: lastKnownGood.observationFingerprint,
          observation: lastKnownGood.observation
        });

        return freeze({
          state: changed ? 'PUBLISHED' : 'SEMANTIC_NO_OP',
          published: changed,
          requestSequence,
          latestRequestedSequence,
          snapshot
        });
      } catch (error) {
        if (requestSequence !== latestRequestedSequence) {
          return staleOutcome(requestSequence);
        }

        snapshot = heldSnapshot({
          revision,
          lastKnownGood,
          code: failureCode(error),
          requestSequence,
          hintRef: exactHintRef
        });

        return freeze({
          state: 'HELD',
          published: false,
          requestSequence,
          latestRequestedSequence,
          snapshot
        });
      }
    }
  });
}

// [VXG RealForever]
