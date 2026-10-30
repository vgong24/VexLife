import { VexCompoundState } from '../../../src/core/state-relay.mjs';

export const BROWSER_INTERFACE_SOURCE_CURRENTNESS_PATH = '/api/v1/interface/source-currentness';
export const BROWSER_INTERFACE_SOURCE_CURRENTNESS_SCHEMA = 'vexlife.browser-interface-source-currentness/v1';
export const BROWSER_INTERFACE_SOURCE_CURRENTNESS_TRUTH = 'CURRENT_SERVER_SOURCE_IDENTITY';
export const BROWSER_INTERFACE_SOURCE_META_NAME = 'vexlife-source-tree-sha256';

export const INTERFACE_CURRENTNESS_INPUT_REFS = Object.freeze({
  loadedDocumentSource: 'input.vexlife.interface.currentness.loaded-document-source',
  currentServerSource: 'input.vexlife.interface.currentness.current-server-source',
  companionAvailability: 'input.vexlife.interface.currentness.companion-availability',
  conversationCurrentness: 'input.vexlife.interface.currentness.conversation-currentness',
  browserObservationCurrentness: 'input.vexlife.interface.currentness.browser-observation-currentness'
});

export const INTERFACE_CURRENTNESS_STATE_REFS = Object.freeze({
  UNOBSERVED: 'state.vexlife.interface.currentness.unobserved',
  SOURCE_MISMATCH: 'state.vexlife.interface.currentness.source-mismatch',
  OBSERVING: 'state.vexlife.interface.currentness.observing',
  RECOVERABLE: 'state.vexlife.interface.currentness.recoverable',
  ACTION_REQUIRED: 'state.vexlife.interface.currentness.action-required',
  UNAVAILABLE: 'state.vexlife.interface.currentness.unavailable',
  READY: 'state.vexlife.interface.currentness.ready'
});

const SOURCE_HASH = /^[0-9a-f]{64}$/u;
const CONVERSATION_READY = new Set(['CURRENT', 'EMPTY', 'ABSENT']);
const RELATIONSHIP_KINDS = new Set(Object.keys(INTERFACE_CURRENTNESS_STATE_REFS));

function exactScope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const scope = {
    projectRef: value.projectRef,
    threadRef: value.threadRef,
    channelRef: value.channelRef
  };
  if (Object.values(scope).some((entry) => typeof entry !== 'string' || entry.length === 0)) return null;
  return Object.freeze(scope);
}

function sameScope(left, right) {
  const a = exactScope(left), b = exactScope(right);
  return Boolean(a && b)
    && a.projectRef === b.projectRef
    && a.threadRef === b.threadRef
    && a.channelRef === b.channelRef;
}

function state(kind, details = {}) {
  if (!RELATIONSHIP_KINDS.has(kind)) throw new Error(`Unsupported Interface currentness state ${kind}`);
  return Object.freeze({
    stateRef: INTERFACE_CURRENTNESS_STATE_REFS[kind],
    kind,
    familySemanticState: true,
    displayState: false,
    effectCommand: false,
    effectsPerformed: false,
    ...structuredClone(details)
  });
}

export function interfaceCurrentnessUnobserved() {
  return state('UNOBSERVED', {
    generation: 0,
    scope: null,
    loadedDocumentSourceTreeSha256: null,
    currentServerSourceTreeSha256: null,
    companionAvailabilityState: 'UNKNOWN',
    conversationCurrentness: 'UNREAD'
  });
}

function inputValue(coherent, ref) {
  return coherent?.[ref]?.valueOrNull ?? null;
}

export function deriveInterfaceCurrentness(coherent) {
  const loaded = inputValue(coherent, INTERFACE_CURRENTNESS_INPUT_REFS.loadedDocumentSource);
  const server = inputValue(coherent, INTERFACE_CURRENTNESS_INPUT_REFS.currentServerSource);
  const companion = inputValue(coherent, INTERFACE_CURRENTNESS_INPUT_REFS.companionAvailability);
  const conversation = inputValue(coherent, INTERFACE_CURRENTNESS_INPUT_REFS.conversationCurrentness);
  const browser = inputValue(coherent, INTERFACE_CURRENTNESS_INPUT_REFS.browserObservationCurrentness);
  const scope = exactScope(browser?.scope);
  const details = {
    generation: Number.isSafeInteger(browser?.generation) ? browser.generation : 0,
    scope,
    loadedDocumentSourceTreeSha256: loaded?.treeSha256 ?? null,
    currentServerSourceTreeSha256: server?.treeSha256 ?? null,
    companionAvailabilityState: companion?.availabilityState ?? 'UNAVAILABLE',
    conversationCurrentness: conversation?.currentness ?? 'UNAVAILABLE'
  };

  if (server?.state !== 'CURRENT' || !SOURCE_HASH.test(server?.treeSha256 ?? '')) {
    return state('UNAVAILABLE', details);
  }
  if (!SOURCE_HASH.test(loaded?.treeSha256 ?? '') || loaded.treeSha256 !== server.treeSha256) {
    return state('SOURCE_MISMATCH', details);
  }
  if (browser?.state !== 'CURRENT' || !scope) {
    return state('OBSERVING', details);
  }
  const availability = companion?.availabilityState ?? 'UNAVAILABLE';
  if (availability === 'STARTING') return state('OBSERVING', details);
  if (availability === 'RECOVERABLE') return state('RECOVERABLE', details);
  if (availability === 'ACTION_REQUIRED') return state('ACTION_REQUIRED', details);
  if (availability === 'HELD' || availability === 'UNAVAILABLE') return state('UNAVAILABLE', details);
  if (availability !== 'READY') return state('UNAVAILABLE', details);

  const conversationScope = exactScope(conversation);
  if (!conversationScope || !sameScope(conversationScope, scope) || !CONVERSATION_READY.has(conversation.currentness)) {
    return state('UNAVAILABLE', details);
  }
  return state('READY', details);
}

export function normalizeBrowserInterfaceSourceCurrentness(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.schemaVersion !== BROWSER_INTERFACE_SOURCE_CURRENTNESS_SCHEMA
      || value.truthClass !== BROWSER_INTERFACE_SOURCE_CURRENTNESS_TRUTH
      || !SOURCE_HASH.test(value.treeSha256 ?? '')
      || value.effectsPerformed !== false) {
    throw new TypeError('Browser Interface current server source projection is invalid');
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    truthClass: value.truthClass,
    treeSha256: value.treeSha256,
    effectsPerformed: false
  });
}

export async function readBrowserInterfaceCurrentServerSource({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Interface current server source read requires fetch');
  const response = await fetchImpl(BROWSER_INTERFACE_SOURCE_CURRENTNESS_PATH, { method: 'GET', cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(`Interface current server source HTTP ${response.status}`);
  return normalizeBrowserInterfaceSourceCurrentness(body);
}

export function readLoadedDocumentSourceIdentity(documentRef = globalThis.document) {
  const content = documentRef?.querySelector?.(`meta[name="${BROWSER_INTERFACE_SOURCE_META_NAME}"]`)?.getAttribute?.('content') ?? null;
  return SOURCE_HASH.test(content ?? '') ? content : null;
}

function safeServerFailure() {
  return Object.freeze({ state: 'UNAVAILABLE', treeSha256: null });
}

function safeCompanionFailure() {
  return Object.freeze({ availabilityState: 'UNAVAILABLE' });
}

function safeConversationFailure(scope) {
  return Object.freeze({ ...scope, currentness: 'UNAVAILABLE' });
}

function fullProjection(compound, generation, scope) {
  const inputs = Object.fromEntries(Object.values(INTERFACE_CURRENTNESS_INPUT_REFS).map((ref) => [ref, compound.inputSnapshot(ref)]));
  const output = compound.output.snapshot();
  return Object.freeze({
    schemaVersion: 'vexlife.browser-interface-currentness/v1',
    generation,
    scope: exactScope(scope),
    relationship: structuredClone(output.valueOrNull ?? interfaceCurrentnessUnobserved()),
    compound: Object.freeze({ inputs: Object.freeze(inputs), output }),
    effectsPerformed: false
  });
}

export function createInterfaceCurrentnessController({
  loadedDocumentSourceTreeSha256 = null,
  currentScope,
  readCurrentServerSource = () => readBrowserInterfaceCurrentServerSource(),
  readCompanionAvailability,
  readConversationCurrentness,
  onAdmittedObservation = null,
  onCurrentState = null
} = {}) {
  if (typeof currentScope !== 'function') throw new TypeError('Interface currentness requires currentScope');
  if (typeof readCurrentServerSource !== 'function') throw new TypeError('Interface currentness requires readCurrentServerSource');
  if (typeof readCompanionAvailability !== 'function') throw new TypeError('Interface currentness requires readCompanionAvailability');
  if (typeof readConversationCurrentness !== 'function') throw new TypeError('Interface currentness requires readConversationCurrentness');
  if (onAdmittedObservation !== null && typeof onAdmittedObservation !== 'function') throw new TypeError('onAdmittedObservation must be null or one function');
  if (onCurrentState !== null && typeof onCurrentState !== 'function') throw new TypeError('onCurrentState must be null or one function');

  const compound = new VexCompoundState({
    inputRefs: Object.values(INTERFACE_CURRENTNESS_INPUT_REFS),
    processLatestState: deriveInterfaceCurrentness,
    name: 'interface-currentness',
    stateRef: 'relationship.vexlife.interface.currentness',
    instanceRef: 'relationship.vexlife.interface.currentness.browser.instance.0',
    initialOutput: interfaceCurrentnessUnobserved(),
    outputObservation: 'UNOBSERVED'
  });
  let generation = 0;
  let disposed = false;

  if (SOURCE_HASH.test(loadedDocumentSourceTreeSha256 ?? '')) {
    compound.accept(INTERFACE_CURRENTNESS_INPUT_REFS.loadedDocumentSource, {
      valueOrNull: Object.freeze({ state: 'CURRENT', treeSha256: loadedDocumentSourceTreeSha256 }),
      observation: 'PRESENT',
      instanceRef: `document-source.${loadedDocumentSourceTreeSha256}`,
      transitionRef: 'transition.interface-currentness.loaded-document-source'
    });
  }

  const project = () => fullProjection(compound, generation, currentScope());
  const emit = () => {
    const projection = project();
    if (onCurrentState) onCurrentState(projection);
    return projection;
  };
  emit();

  const isCurrent = (candidateGeneration, candidateScope) => !disposed
    && candidateGeneration === generation
    && sameScope(candidateScope, currentScope());

  async function observe(reason = 'explicit') {
    if (disposed) return Object.freeze({ state: 'DISPOSED' });
    const scope = exactScope(currentScope());
    if (!scope) {
      generation += 1;
      emit();
      return Object.freeze({ state: 'SCOPE_UNAVAILABLE', generation, scope: null });
    }
    const candidateGeneration = ++generation;
    compound.accept(INTERFACE_CURRENTNESS_INPUT_REFS.browserObservationCurrentness, {
      valueOrNull: Object.freeze({ state: 'OBSERVING', generation: candidateGeneration, scope, reason }),
      observation: 'PRESENT',
      instanceRef: `browser-observation.${candidateGeneration}`,
      transitionRef: `transition.interface-currentness.${reason}.observing`
    });
    emit();

    const [serverResult, companionResult, conversationResult] = await Promise.allSettled([
      readCurrentServerSource(),
      readCompanionAvailability(scope),
      readConversationCurrentness(scope)
    ]);

    if (!isCurrent(candidateGeneration, scope)) {
      return Object.freeze({ state: 'STALE_OBSERVATION_REJECTED', generation: candidateGeneration, scope });
    }

    const server = serverResult.status === 'fulfilled'
      ? Object.freeze({ state: 'CURRENT', treeSha256: serverResult.value.treeSha256 })
      : safeServerFailure();
    const companion = companionResult.status === 'fulfilled' ? companionResult.value : safeCompanionFailure();
    const conversation = conversationResult.status === 'fulfilled' ? conversationResult.value : safeConversationFailure(scope);

    compound.accept(INTERFACE_CURRENTNESS_INPUT_REFS.currentServerSource, {
      valueOrNull: server,
      observation: 'PRESENT',
      instanceRef: `server-source.${server.treeSha256 ?? 'unavailable'}`,
      transitionRef: `transition.interface-currentness.${reason}.server-source`
    });
    compound.accept(INTERFACE_CURRENTNESS_INPUT_REFS.companionAvailability, {
      valueOrNull: companion,
      observation: 'PRESENT',
      instanceRef: `companion-availability.${candidateGeneration}`,
      transitionRef: `transition.interface-currentness.${reason}.companion`
    });
    compound.accept(INTERFACE_CURRENTNESS_INPUT_REFS.conversationCurrentness, {
      valueOrNull: conversation,
      observation: 'PRESENT',
      instanceRef: `conversation-currentness.${candidateGeneration}`,
      transitionRef: `transition.interface-currentness.${reason}.conversation`
    });
    compound.accept(INTERFACE_CURRENTNESS_INPUT_REFS.browserObservationCurrentness, {
      valueOrNull: Object.freeze({ state: 'CURRENT', generation: candidateGeneration, scope, reason }),
      observation: 'PRESENT',
      instanceRef: `browser-observation.${candidateGeneration}`,
      transitionRef: `transition.interface-currentness.${reason}.current`
    });

    const admitted = project();
    if (onAdmittedObservation) {
      await onAdmittedObservation(Object.freeze({
        generation: candidateGeneration,
        scope,
        serverSource: server,
        companionAvailability: companion,
        conversationCurrentness: conversation,
        relationship: admitted.relationship
      }));
    }
    const projection = emit();
    return Object.freeze({ state: 'OBSERVATION_ADMITTED', generation: candidateGeneration, scope, projection });
  }

  return Object.freeze({
    observe,
    snapshot: project,
    isCurrentObservation(value) {
      return Boolean(value && Number.isSafeInteger(value.generation) && value.scope && isCurrent(value.generation, value.scope));
    },
    isCurrent,
    dispose() { disposed = true; },
    currentGeneration: () => generation
  });
}

export function bindInterfaceCurrentnessLifecycle(controller, {
  windowRef = globalThis,
  documentRef = globalThis.document
} = {}) {
  if (!controller || typeof controller.observe !== 'function') throw new TypeError('Interface lifecycle binding requires one controller');
  const focus = () => { void controller.observe('focus'); };
  const pageshow = () => { void controller.observe('pageshow'); };
  const visibility = () => {
    if (documentRef?.visibilityState === 'visible') void controller.observe('visibility-visible');
  };
  windowRef?.addEventListener?.('focus', focus);
  windowRef?.addEventListener?.('pageshow', pageshow);
  documentRef?.addEventListener?.('visibilitychange', visibility);
  return () => {
    windowRef?.removeEventListener?.('focus', focus);
    windowRef?.removeEventListener?.('pageshow', pageshow);
    documentRef?.removeEventListener?.('visibilitychange', visibility);
  };
}

// [VXG RealForever]
