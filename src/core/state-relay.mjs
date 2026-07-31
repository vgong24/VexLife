import { semanticHash } from './utils.mjs';

export class StateCell {
  #value;
  #hash;
  #subscribers = new Set();
  #revision = 0;
  #noChangeCount = 0;

  constructor(initialValue, { name = 'state', equality = null } = {}) {
    this.name = name;
    this.equality = equality;
    this.#value = structuredClone(initialValue);
    this.#hash = semanticHash(initialValue);
  }

  get value() { return structuredClone(this.#value); }
  get hash() { return this.#hash; }
  get revision() { return this.#revision; }
  get noChangeCount() { return this.#noChangeCount; }

  set(nextValue, metadata = {}) {
    const nextHash = semanticHash(nextValue);
    const equal = this.equality
      ? this.equality(this.#value, nextValue)
      : nextHash === this.#hash;

    if (equal) {
      this.#noChangeCount += 1;
      return { changed: false, hash: this.#hash, revision: this.#revision, metadata };
    }

    const previousHash = this.#hash;
    this.#value = structuredClone(nextValue);
    this.#hash = nextHash;
    this.#revision += 1;
    const emission = {
      changed: true,
      name: this.name,
      value: this.value,
      previousHash,
      hash: nextHash,
      revision: this.#revision,
      metadata
    };
    for (const subscriber of this.#subscribers) subscriber(emission);
    return emission;
  }

  update(transform, metadata = {}) {
    return this.set(transform(this.value), metadata);
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
        current: true
      });
    }
    return () => this.#subscribers.delete(subscriber);
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
