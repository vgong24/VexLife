import { semanticHash } from './utils.mjs';

export const OBSERVATION_STATES = Object.freeze([
  'UNOBSERVED',
  'EMPTY',
  'PRESENT',
  'HELD',
  'UNAVAILABLE'
]);

export const STATE_OPERATIONS = Object.freeze([
  'EVOLVE',
  'REPLACE',
  'SNAPSHOT',
  'REINSTANCE'
]);

const OBSERVATION_SET = new Set(OBSERVATION_STATES);

function requiredString(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function normalizeObservation(value, label = 'observation') {
  if (!OBSERVATION_SET.has(value)) throw new Error(`${label} must be one of ${OBSERVATION_STATES.join(', ')}`);
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function immutableClone(value) {
  return deepFreeze(structuredClone(value));
}

function snapshotValue(value) {
  return value === undefined ? null : immutableClone(value);
}

function transitionFromMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  return metadata.transitionRef === undefined || metadata.transitionRef === null
    ? null
    : requiredString(metadata.transitionRef, 'metadata.transitionRef');
}

export function createStateSnapshot({
  stateRef,
  instanceRef,
  revision,
  transitionRef = null,
  observation = 'PRESENT',
  valueOrNull = null
}) {
  requiredString(stateRef, 'stateRef');
  requiredString(instanceRef, 'instanceRef');
  if (!Number.isSafeInteger(revision) || revision < 0) throw new TypeError('revision must be a non-negative safe integer');
  if (transitionRef !== null) requiredString(transitionRef, 'transitionRef');
  const normalizedObservation = normalizeObservation(observation);
  const value = snapshotValue(valueOrNull);
  const semanticHashValue = semanticHash({ observation: normalizedObservation, valueOrNull: value });
  return deepFreeze({
    stateRef,
    instanceRef,
    revision,
    transitionRef,
    observation: normalizedObservation,
    semanticHash: semanticHashValue,
    valueOrNull: value
  });
}

export class StateCell {
  #value;
  #hash;
  #subscribers = new Set();
  #revision = 0;
  #noChangeCount = 0;
  #instanceRef;
  #observation;
  #transitionRef = null;

  constructor(initialValue, {
    name = 'state',
    equality = null,
    stateRef = null,
    instanceRef = null,
    observation = 'PRESENT'
  } = {}) {
    this.name = name;
    this.stateRef = stateRef ?? name;
    this.equality = equality;
    this.#instanceRef = instanceRef ?? `${this.stateRef}.instance.0`;
    this.#observation = normalizeObservation(observation);
    this.#value = structuredClone(initialValue);
    this.#hash = semanticHash(initialValue);
  }

  get value() { return structuredClone(this.#value); }
  get hash() { return this.#hash; }
  get revision() { return this.#revision; }
  get noChangeCount() { return this.#noChangeCount; }
  get instanceRef() { return this.#instanceRef; }
  get observation() { return this.#observation; }
  get transitionRef() { return this.#transitionRef; }

  snapshot() {
    return createStateSnapshot({
      stateRef: this.stateRef,
      instanceRef: this.#instanceRef,
      revision: this.#revision,
      transitionRef: this.#transitionRef,
      observation: this.#observation,
      valueOrNull: this.#value ?? null
    });
  }

  #commit(nextValue, metadata = {}, {
    operation = 'REPLACE',
    observation = this.#observation,
    forceTransition = false,
    honorTransitionRef = true,
    previousSnapshotOverride = null
  } = {}) {
    const normalizedObservation = normalizeObservation(observation);
    const nextHash = semanticHash(nextValue);
    const nextTransitionRef = transitionFromMetadata(metadata);
    const equal = this.equality
      ? this.equality(this.#value, nextValue) && normalizedObservation === this.#observation
      : nextHash === this.#hash && normalizedObservation === this.#observation;
    const distinctTransition = honorTransitionRef &&
      nextTransitionRef !== null &&
      nextTransitionRef !== this.#transitionRef;

    if (equal && !forceTransition && !distinctTransition) {
      this.#noChangeCount += 1;
      return {
        changed: false,
        hash: this.#hash,
        revision: this.#revision,
        operation,
        snapshot: this.snapshot(),
        metadata
      };
    }

    const previousHash = this.#hash;
    const previousSnapshot = previousSnapshotOverride ?? this.snapshot();
    this.#value = structuredClone(nextValue);
    this.#hash = nextHash;
    this.#observation = normalizedObservation;
    this.#transitionRef = nextTransitionRef;
    this.#revision += 1;
    const emission = {
      changed: true,
      name: this.name,
      operation,
      value: this.value,
      previousHash,
      hash: nextHash,
      revision: this.#revision,
      previousSnapshot,
      snapshot: this.snapshot(),
      metadata
    };
    for (const subscriber of this.#subscribers) subscriber(emission);
    return emission;
  }

  set(nextValue, metadata = {}) {
    return this.#commit(nextValue, metadata, {
      operation: 'REPLACE',
      honorTransitionRef: false
    });
  }

  replace(nextValue, metadata = {}) {
    return this.#commit(nextValue, metadata, { operation: 'REPLACE' });
  }

  evolve(transform, metadata = {}) {
    if (typeof transform !== 'function') throw new TypeError('transform must be a function');
    const next = transform(this.value);
    if (next && typeof next.then === 'function') throw new Error('StateCell evolve transform must be synchronous; effects stay outside reducers');
    return this.#commit(next, metadata, { operation: 'EVOLVE' });
  }

  update(transform, metadata = {}) {
    return this.set(transform(this.value), metadata);
  }

  observe(observation, valueOrNull = null, metadata = {}) {
    return this.#commit(valueOrNull, metadata, { operation: 'SNAPSHOT', observation });
  }

  reinstance({ instanceRef, value = this.value, observation = this.#observation, transitionRef = null } = {}) {
    const nextInstanceRef = requiredString(instanceRef, 'instanceRef');
    if (nextInstanceRef === this.#instanceRef) throw new Error('REINSTANCE requires a distinct instanceRef');
    const previousSnapshot = this.snapshot();
    this.#instanceRef = nextInstanceRef;
    this.#revision = 0;
    this.#transitionRef = null;
    const result = this.#commit(value, { transitionRef }, {
      operation: 'REINSTANCE',
      observation,
      forceTransition: true,
      previousSnapshotOverride: previousSnapshot
    });
    return { ...result, previousSnapshot };
  }

  subscribe(subscriber, { emitCurrent = true } = {}) {
    this.#subscribers.add(subscriber);
    if (emitCurrent) {
      subscriber({
        changed: false,
        name: this.name,
        value: this.value,
        hash: this.#hash,
        revision: this.#revision,
        current: true,
        snapshot: this.snapshot()
      });
    }
    return () => this.#subscribers.delete(subscriber);
  }
}

export class VexCompoundState {
  #inputs;
  #inputOrder;
  #processing = false;
  #reconciler;

  constructor({
    inputRefs,
    processLatestState,
    name = 'compound',
    stateRef = name,
    instanceRef = `${stateRef}.instance.0`,
    initialOutput = null,
    outputObservation = 'UNOBSERVED',
    equality = null
  }) {
    if (!Array.isArray(inputRefs) || inputRefs.length === 0 || inputRefs.some((ref) => typeof ref !== 'string' || ref.length === 0)) {
      throw new TypeError('inputRefs must be a non-empty array of refs');
    }
    if (new Set(inputRefs).size !== inputRefs.length) throw new Error('inputRefs must be unique');
    if (typeof processLatestState !== 'function') throw new TypeError('processLatestState must be a function');
    this.#inputOrder = [...inputRefs];
    this.#inputs = new Map(inputRefs.map((inputRef) => [inputRef, createStateSnapshot({
      stateRef: inputRef,
      instanceRef: `${inputRef}.instance.0`,
      revision: 0,
      observation: 'UNOBSERVED',
      valueOrNull: null
    })]));
    this.#reconciler = processLatestState;
    this.output = new StateCell(initialOutput, {
      name,
      stateRef,
      instanceRef,
      observation: outputObservation,
      equality
    });
  }

  inputSnapshot(inputRef) {
    if (!this.#inputs.has(inputRef)) throw new Error(`unknown compound input ${inputRef}`);
    return this.#inputs.get(inputRef);
  }

  latestCoherentInput() {
    const snapshots = this.#inputOrder.map((inputRef) => this.#inputs.get(inputRef));
    if (snapshots.some((snapshot) => snapshot.observation === 'UNOBSERVED')) return null;
    return deepFreeze(Object.fromEntries(this.#inputOrder.map((inputRef, index) => [inputRef, snapshots[index]])));
  }

  accept(inputRef, {
    valueOrNull = null,
    observation = 'PRESENT',
    instanceRef = null,
    transitionRef = null
  } = {}) {
    if (!this.#inputs.has(inputRef)) throw new Error(`unknown compound input ${inputRef}`);
    if (this.#processing) throw new Error('compound state mutation/reconciliation is serial');
    this.#processing = true;
    try {
      const previous = this.#inputs.get(inputRef);
      const nextInstanceRef = instanceRef ?? previous.instanceRef;
      const sameInstance = nextInstanceRef === previous.instanceRef;
      const next = createStateSnapshot({
        stateRef: inputRef,
        instanceRef: nextInstanceRef,
        revision: sameInstance ? previous.revision + 1 : 0,
        transitionRef,
        observation,
        valueOrNull
      });
      this.#inputs.set(inputRef, next);
      const coherent = this.latestCoherentInput();
      if (coherent === null) {
        return deepFreeze({ accepted: true, reconciled: false, reason: 'LATEST_COHERENT_INPUT_UNAVAILABLE', input: next, output: this.output.snapshot() });
      }
      const candidate = this.#reconciler(coherent);
      if (candidate && typeof candidate.then === 'function') {
        throw new Error('processLatestState must be synchronous; long-running effects stay outside reducers');
      }
      const normalizedCandidate = candidate && typeof candidate === 'object' && !Array.isArray(candidate) && Object.hasOwn(candidate, 'valueOrNull')
        ? candidate
        : { valueOrNull: candidate, observation: 'PRESENT', transitionRef: null };
      const emission = this.output.observe(
        normalizedCandidate.observation ?? 'PRESENT',
        normalizedCandidate.valueOrNull ?? null,
        { transitionRef: normalizedCandidate.transitionRef ?? null, sourceInputRef: inputRef }
      );
      return deepFreeze({ accepted: true, reconciled: true, input: next, output: emission.snapshot, changed: emission.changed });
    } finally {
      this.#processing = false;
    }
  }
}

export function combineStateCells(cells, projector, { name = 'combined', equality = null } = {}) {
  if (!Array.isArray(cells) || cells.length === 0) throw new Error('cells must be a non-empty array');
  const project = () => projector(...cells.map((cell) => cell.value));
  const derived = new StateCell(project(), { name, equality });
  const unsubs = cells.map((cell) => cell.subscribe(() => derived.set(project(), { source: cell.name }), { emitCurrent: false }));
  derived.dispose = () => unsubs.forEach((unsubscribe) => unsubscribe());
  return derived;
}

export function selectState(cell, selector, options = {}) {
  return combineStateCells([cell], (value) => selector(value), options);
}

// [VXG RealForever]
