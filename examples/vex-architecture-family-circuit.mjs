import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VEX_ARCHITECTURE_FAMILY_CIRCUIT_EXAMPLE = Object.freeze({
  schemaVersion: 'vexlife.vex-architecture-family-circuit-example/v1',
  exampleClass: 'WORKED_EXAMPLE_NOT_PRODUCT_AUTHORITY',
  familyOwns: Object.freeze([
    'SEMANTIC_STATE',
    'SEMANTIC_CONTROL',
    'CONTROL_PLUS_CURRENT_STATE_TO_ACT'
  ]),
  connectionOwns: Object.freeze([
    'RUNTIME_FACT_OBSERVATION',
    'RUNTIME_FACT_TO_SEMANTIC_STATE_RECONCILIATION',
    'EFFECT_REALIZATION'
  ]),
  invariants: Object.freeze([
    'EFFECT_REQUEST_IS_NOT_RESULTING_STATE',
    'FAMILY_DOES_NOT_REALIZE_EFFECT',
    'CONNECTION_RECONCILES_RUNTIME_REALITY_BEFORE_FAMILY_OBSERVE',
    'RUNTIME_SOURCE_IDENTITY_IS_STRONGER_THAN_PATH_SIMILARITY',
    'TEST_HOST_ADAPTATION_STAYS_OUTSIDE_SEMANTIC_OWNER'
  ])
});

export const BROWSER_SOURCE_CONTROLS = Object.freeze({
  ENSURE_CURRENT: 'ENSURE_CURRENT_BROWSER_SOURCE'
});

export const BROWSER_SOURCE_EFFECTS = Object.freeze({
  ROTATE: 'ROTATE_BROWSER_SOURCE'
});

const HEX64 = /^[0-9a-f]{64}$/u;

function copy(value) {
  return structuredClone(value);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function optionalTree(value, label) {
  if (value === null || value === undefined) return null;
  if (!HEX64.test(value)) throw new TypeError(`${label} must be null or one lowercase SHA-256`);
  return value;
}

function browserSourceState({
  kind,
  receiptRepoPath,
  requestedRepoPath,
  receiptSourceTreeSha256,
  currentSourceTreeSha256
}) {
  if (!['CURRENT_SOURCE', 'PRIOR_SOURCE'].includes(kind)) {
    throw new TypeError('browser source semantic state kind is invalid');
  }
  const state = {
    kind,
    sourceCurrent: kind === 'CURRENT_SOURCE',
    receiptRepoPath: requiredString(receiptRepoPath, 'receiptRepoPath'),
    requestedRepoPath: requiredString(requestedRepoPath, 'requestedRepoPath'),
    receiptSourceTreeSha256: optionalTree(receiptSourceTreeSha256, 'receiptSourceTreeSha256'),
    currentSourceTreeSha256: optionalTree(currentSourceTreeSha256, 'currentSourceTreeSha256')
  };
  if (state.sourceCurrent) {
    if (
      state.receiptRepoPath !== state.requestedRepoPath ||
      state.receiptSourceTreeSha256 === null ||
      state.currentSourceTreeSha256 === null ||
      state.receiptSourceTreeSha256 !== state.currentSourceTreeSha256
    ) {
      throw new Error('CURRENT_SOURCE requires exact repo path and exact source-tree identity');
    }
  }
  return freeze(state);
}

export function reconcileBrowserSourceRuntimeFacts({
  receiptRepoPath,
  requestedRepoPath,
  receiptSourceTreeSha256 = null,
  currentSourceTreeSha256 = null
}) {
  requiredString(receiptRepoPath, 'receiptRepoPath');
  requiredString(requestedRepoPath, 'requestedRepoPath');

  if (receiptRepoPath !== requestedRepoPath) {
    return browserSourceState({
      kind: 'PRIOR_SOURCE',
      receiptRepoPath,
      requestedRepoPath,
      receiptSourceTreeSha256,
      currentSourceTreeSha256: null
    });
  }

  optionalTree(receiptSourceTreeSha256, 'receiptSourceTreeSha256');
  optionalTree(currentSourceTreeSha256, 'currentSourceTreeSha256');

  const current = receiptSourceTreeSha256 !== null &&
    currentSourceTreeSha256 !== null &&
    receiptSourceTreeSha256 === currentSourceTreeSha256;

  return browserSourceState({
    kind: current ? 'CURRENT_SOURCE' : 'PRIOR_SOURCE',
    receiptRepoPath,
    requestedRepoPath,
    receiptSourceTreeSha256,
    currentSourceTreeSha256
  });
}

export class BrowserSourceFamilyExample {
  #state;

  constructor(initialState) {
    this.#state = browserSourceState(initialState);
  }

  get currentState() {
    return copy(this.#state);
  }

  act(currentState, control) {
    const state = browserSourceState(currentState);
    if (control !== BROWSER_SOURCE_CONTROLS.ENSURE_CURRENT) {
      throw new Error(`unsupported BrowserSource Control: ${String(control)}`);
    }
    if (state.kind === 'CURRENT_SOURCE') {
      return freeze({
        admittedState: null,
        effect: null
      });
    }
    return freeze({
      admittedState: null,
      effect: {
        kind: BROWSER_SOURCE_EFFECTS.ROTATE,
        requestedRepoPath: state.requestedRepoPath
      }
    });
  }

  activate(control) {
    const resolved = this.act(this.currentState, control);
    if (resolved.admittedState !== null) this.observe(resolved.admittedState);
    return resolved;
  }

  observe(state) {
    this.#state = browserSourceState(state);
    return this.currentState;
  }
}

export class BrowserSourceConnectionExample {
  #family;
  #readRuntimeFacts;
  #rotateBrowserSource;

  constructor({
    family,
    readRuntimeFacts,
    rotateBrowserSource
  }) {
    if (!(family instanceof BrowserSourceFamilyExample)) {
      throw new TypeError('Connection example requires one BrowserSourceFamilyExample');
    }
    if (typeof readRuntimeFacts !== 'function' || typeof rotateBrowserSource !== 'function') {
      throw new TypeError('Connection example requires readRuntimeFacts and rotateBrowserSource functions');
    }
    this.#family = family;
    this.#readRuntimeFacts = readRuntimeFacts;
    this.#rotateBrowserSource = rotateBrowserSource;
  }

  observe() {
    const semanticState = reconcileBrowserSourceRuntimeFacts(this.#readRuntimeFacts());
    return this.#family.observe(semanticState);
  }

  async activate(control) {
    const before = this.#family.currentState;
    const act = this.#family.activate(control);

    if (act.effect === null) {
      return freeze({
        before,
        act,
        effectResult: null,
        observedState: this.#family.currentState
      });
    }

    const effectResult = await this.#rotateBrowserSource(copy(act.effect));
    const observedState = this.observe();

    return freeze({
      before,
      act,
      effectResult: copy(effectResult),
      observedState
    });
  }
}

export async function runVexArchitectureFamilyCircuitExample() {
  const repo = '/example/vexlife-source';
  const priorTree = 'a'.repeat(64);
  const currentTree = 'b'.repeat(64);
  let runtimeFacts = {
    receiptRepoPath: repo,
    requestedRepoPath: repo,
    receiptSourceTreeSha256: priorTree,
    currentSourceTreeSha256: currentTree
  };

  const initialState = reconcileBrowserSourceRuntimeFacts(runtimeFacts);
  const family = new BrowserSourceFamilyExample(initialState);
  const effects = [];

  const connection = new BrowserSourceConnectionExample({
    family,
    readRuntimeFacts: () => runtimeFacts,
    rotateBrowserSource: async (effect) => {
      effects.push(copy(effect));
      runtimeFacts = {
        ...runtimeFacts,
        receiptSourceTreeSha256: currentTree
      };
      return { state: 'ROTATION_REQUEST_COMPLETED' };
    }
  });

  const activated = await connection.activate(BROWSER_SOURCE_CONTROLS.ENSURE_CURRENT);

  return freeze({
    schemaVersion: VEX_ARCHITECTURE_FAMILY_CIRCUIT_EXAMPLE.schemaVersion,
    exampleClass: VEX_ARCHITECTURE_FAMILY_CIRCUIT_EXAMPLE.exampleClass,
    before: initialState,
    act: activated.act,
    effects,
    after: activated.observedState
  });
}

const invokedDirectly = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (invokedDirectly) {
  runVexArchitectureFamilyCircuitExample()
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`VEX_ARCHITECTURE_FAMILY_EXAMPLE_FAILED: ${error.message}\n`);
      process.exitCode = 1;
    });
}
