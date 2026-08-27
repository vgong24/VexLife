import {
  compileNavigationTopology,
  createNavigationContinuitySession,
  createNavigationPreferenceStore
} from '../../../src/core/navigation-continuity.mjs';

const TOPOLOGY_SCHEMA = 'vexlife.navigation-topology/v1';
const ADAPTER_RESULT_SCHEMA = 'vexlife.public-learning-navigation-adapter-result/v1';
const FOCUS_RECEIPT_SCHEMA = 'vexlife.public-learning-registered-focus-receipt/v1';
const REGISTERED_DOORS_RECEIPT_SCHEMA = 'vexlife.public-learning-registered-doors-receipt/v1';
const PAGE_PREFIX = 'page-state.public-learning.';
const CHILD_DOOR_PREFIX = 'element.public-learning.child.';
const UP_DOOR_PREFIX = 'element.public-learning.up.';
const REALM_REF = 'realm.public-learning.architecture-atlas';
const SCREEN_REF = 'screen.public-learning.architecture-atlas';
const ROUTE_REF = 'route.public-learning.architecture-atlas-field';
const TRANSITION_CLASS_REF = 'transition-class.navigation.registered-door';
const ACTION_ENTER_REF = 'action.public-learning.enter-context';
const ACTION_RETURN_REF = 'action.public-learning.return-context';

const clone = (value) => structuredClone(value);
const need = (condition, message) => { if (!condition) throw new Error(message); };
const stablePart = (value) => String(value).replace(/[^A-Za-z0-9._:/#-]/gu, '-');
const sameRefs = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

export function publicLearningPageStateRef(canonicalRef) {
  return `${PAGE_PREFIX}${stablePart(canonicalRef)}`;
}

export function publicLearningChildDoorRef(parentRef, childRef) {
  return `${CHILD_DOOR_PREFIX}${stablePart(parentRef)}.to.${stablePart(childRef)}`;
}

export function publicLearningUpDoorRef(currentRef, parentRef) {
  return `${UP_DOOR_PREFIX}${stablePart(currentRef)}.to.${stablePart(parentRef)}`;
}

export function publicLearningAvailableDoorRefs(presentation, canonicalRef) {
  const byRef = new Map(presentation.map((item) => [item.terrainNodeRef, item]));
  need(byRef.has(canonicalRef), `public learning navigation node unavailable: ${canonicalRef}`);
  const children = presentation
    .filter((item) => item.parentRef === canonicalRef)
    .map((item) => item.terrainNodeRef)
    .sort();
  const item = byRef.get(canonicalRef);
  const refs = children.map((childRef) => publicLearningChildDoorRef(canonicalRef, childRef));
  if (item.parentRef) refs.unshift(publicLearningUpDoorRef(canonicalRef, item.parentRef));
  return refs.sort();
}

function entryFocusRef(presentation, canonicalRef) {
  const item = presentation.find((entry) => entry.terrainNodeRef === canonicalRef);
  need(item, `public learning navigation node unavailable: ${canonicalRef}`);
  const children = presentation
    .filter((entry) => entry.parentRef === canonicalRef)
    .map((entry) => entry.terrainNodeRef)
    .sort();
  if (children.length) return publicLearningChildDoorRef(canonicalRef, children[0]);
  return item.parentRef ? publicLearningUpDoorRef(canonicalRef, item.parentRef) : null;
}

function transitionRef(fromRef, toRef) {
  return `transition.public-learning.${stablePart(fromRef)}.to.${stablePart(toRef)}`;
}

function interactionRef(fromRef, toRef) {
  return `interaction.public-learning.${stablePart(fromRef)}.to.${stablePart(toRef)}`;
}

export function buildPublicLearningNavigationTopology({ registry, presentation, initialRef }) {
  need(registry?.schemaVersion === 'vexlife.navigation-continuity-registry/v1', 'accepted Navigation Continuity registry is required');
  need(Array.isArray(presentation) && presentation.length > 0, 'public learning presentation is required');
  const byRef = new Map();
  for (const item of presentation) {
    need(item && typeof item.terrainNodeRef === 'string', 'public learning presentation node identity is required');
    need(!byRef.has(item.terrainNodeRef), `duplicate public learning presentation node: ${item.terrainNodeRef}`);
    byRef.set(item.terrainNodeRef, item);
  }
  need(byRef.has(initialRef), `public learning initial navigation ref unavailable: ${initialRef}`);

  const roots = presentation.filter((item) => item.parentRef === null);
  need(roots.length === 1, 'public learning navigation topology requires exactly one root');
  for (const item of presentation) {
    if (item.parentRef !== null) need(byRef.has(item.parentRef), `public learning navigation parent unavailable: ${item.parentRef}`);
  }

  const pageStates = presentation.map((item) => ({
    pageStateRef: publicLearningPageStateRef(item.terrainNodeRef),
    screenRef: SCREEN_REF,
    routeRef: ROUTE_REF,
    realmRef: REALM_REF,
    parentPageStateRefOrNull: item.parentRef === null ? null : publicLearningPageStateRef(item.parentRef),
    resourceRefs: [item.terrainNodeRef],
    availableElementRefs: publicLearningAvailableDoorRefs(presentation, item.terrainNodeRef),
    entryFocusElementRefOrNull: entryFocusRef(presentation, item.terrainNodeRef)
  }));

  const transitions = [];
  for (const item of presentation) {
    if (item.parentRef === null) continue;
    const parentRef = item.parentRef;
    const childRef = item.terrainNodeRef;
    transitions.push({
      transitionRef: transitionRef(parentRef, childRef),
      fromPageStateRef: publicLearningPageStateRef(parentRef),
      viaElementRef: publicLearningChildDoorRef(parentRef, childRef),
      interactionRef: interactionRef(parentRef, childRef),
      actionRef: ACTION_ENTER_REF,
      toPageStateRef: publicLearningPageStateRef(childRef),
      transitionClassRef: TRANSITION_CLASS_REF,
      userFacing: true,
      portalRefOrNull: null,
      focusTargetElementRefOrNull: publicLearningUpDoorRef(childRef, parentRef)
    });
    transitions.push({
      transitionRef: transitionRef(childRef, parentRef),
      fromPageStateRef: publicLearningPageStateRef(childRef),
      viaElementRef: publicLearningUpDoorRef(childRef, parentRef),
      interactionRef: interactionRef(childRef, parentRef),
      actionRef: ACTION_RETURN_REF,
      toPageStateRef: publicLearningPageStateRef(parentRef),
      transitionClassRef: TRANSITION_CLASS_REF,
      userFacing: true,
      portalRefOrNull: null,
      focusTargetElementRefOrNull: publicLearningChildDoorRef(parentRef, childRef)
    });
  }

  return {
    schemaVersion: TOPOLOGY_SCHEMA,
    topologyRef: 'topology.public-learning.architecture-atlas',
    registryRef: registry.registryRef,
    initialPageStateRef: publicLearningPageStateRef(initialRef),
    pageStates,
    transitions
  };
}

export function createPublicLearningNavigationContinuity({
  registry,
  presentation,
  initialRef,
  performTerrainTravel,
  observeCurrentRef,
  synchronizeVisibleDoors,
  focusRegisteredElement,
  navigationSessionRef = 'navigation-session.public-learning.architecture-atlas',
  initialPreferenceRefs = null,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
}) {
  need(typeof performTerrainTravel === 'function', 'public learning Terrain performer is required');
  need(typeof observeCurrentRef === 'function', 'public learning current-ref observer is required');
  need(typeof synchronizeVisibleDoors === 'function', 'public learning visible-door synchronizer is required');
  need(typeof focusRegisteredElement === 'function', 'public learning focus synchronizer is required');
  need(typeof wait === 'function', 'public learning dwell wait adapter is required');

  const topology = buildPublicLearningNavigationTopology({ registry, presentation, initialRef });
  const compiledTopology = compileNavigationTopology({ registry, topology });
  const preferenceStore = createNavigationPreferenceStore({ registry, initialPreferenceRefs });

  const adapter = {
    async performTransition(request) {
      const targetRef = request.expectedPageState.resourceRefs[0];
      const direction = request.transition.actionRef === ACTION_RETURN_REF ? 'out' : 'in';
      const fromPageState = compiledTopology.pageStateByRef[request.fromFrame.pageStateRef];
      const fromRef = fromPageState?.resourceRefs?.[0] ?? null;
      const preflightObservedRef = observeCurrentRef();
      const preflightDoorReceipt = synchronizeVisibleDoors(preflightObservedRef);
      const preflightDoors = Array.isArray(preflightDoorReceipt?.availableElementRefs)
        ? [...preflightDoorReceipt.availableElementRefs]
        : [];
      const preflightCurrent = preflightDoorReceipt?.schemaVersion === REGISTERED_DOORS_RECEIPT_SCHEMA
        && preflightDoorReceipt.currentRef === preflightObservedRef
        && preflightDoorReceipt.semanticNavigationPerformed === false
        && preflightObservedRef === fromRef
        && sameRefs(preflightDoors, request.fromFrame.availableElementRefs)
        && preflightDoors.includes(request.transition.viaElementRef);
      if (!preflightCurrent) {
        return {
          schemaVersion: ADAPTER_RESULT_SCHEMA,
          adapterResultRef: `adapter-result.public-learning.preflight-held.${stablePart(request.commandRef)}.${request.stepIndex}`,
          observedPageStateRef: typeof preflightObservedRef === 'string'
            ? publicLearningPageStateRef(preflightObservedRef)
            : request.fromFrame.pageStateRef,
          observedFocusElementRefOrNull: null,
          observedAvailableElementRefs: preflightDoors,
          semanticSettled: false,
          captureRefs: [],
          continuityEventRefs: [],
          failureRefOrNull: `failure.public-learning.preflight-door-currentness.${request.stepIndex}`
        };
      }

      let performed = false;
      try {
        performed = await performTerrainTravel(targetRef, direction);
      } catch (error) {
        return {
          schemaVersion: ADAPTER_RESULT_SCHEMA,
          adapterResultRef: `adapter-result.public-learning.exception.${stablePart(request.commandRef)}.${request.stepIndex}`,
          observedPageStateRef: request.fromFrame.pageStateRef,
          observedFocusElementRefOrNull: request.fromFrame.focusElementRefOrNull,
          observedAvailableElementRefs: [...request.fromFrame.availableElementRefs],
          semanticSettled: false,
          captureRefs: [],
          continuityEventRefs: [],
          failureRefOrNull: `failure.public-learning.terrain-performer-exception.${request.stepIndex}`,
          errorMessage: error?.message ?? String(error)
        };
      }
      if (performed !== true) {
        return {
          schemaVersion: ADAPTER_RESULT_SCHEMA,
          adapterResultRef: `adapter-result.public-learning.performer-held.${stablePart(request.commandRef)}.${request.stepIndex}`,
          observedPageStateRef: request.fromFrame.pageStateRef,
          observedFocusElementRefOrNull: request.fromFrame.focusElementRefOrNull,
          observedAvailableElementRefs: [...request.fromFrame.availableElementRefs],
          semanticSettled: false,
          captureRefs: [],
          continuityEventRefs: [],
          failureRefOrNull: `failure.public-learning.terrain-performer-held.${request.stepIndex}`
        };
      }

      const observedRef = observeCurrentRef();
      const doorReceipt = synchronizeVisibleDoors(observedRef);
      need(doorReceipt?.schemaVersion === REGISTERED_DOORS_RECEIPT_SCHEMA, 'public learning registered-door receipt is invalid');
      need(doorReceipt.currentRef === observedRef && doorReceipt.semanticNavigationPerformed === false, 'public learning registered-door synchronization must be no-navigation current truth');
      const focusRef = request.transition.focusTargetElementRefOrNull;
      const focusReceipt = focusRef === null ? null : focusRegisteredElement(focusRef);
      if (focusReceipt !== null) {
        need(focusReceipt?.schemaVersion === FOCUS_RECEIPT_SCHEMA, 'public learning registered-focus receipt is invalid');
        need(focusReceipt.semanticNavigationPerformed === false, 'public learning registered focus cannot perform semantic navigation');
      }
      const observedPageStateRef = publicLearningPageStateRef(observedRef);
      const exactDoors = sameRefs(doorReceipt.availableElementRefs, request.expectedPageState.availableElementRefs);
      const exactFocus = focusRef === null || (focusReceipt?.focused === true && focusReceipt.elementRef === focusRef);
      const settled = observedRef === targetRef && observedPageStateRef === request.expectedPageState.pageStateRef && exactDoors && exactFocus;

      return {
        schemaVersion: ADAPTER_RESULT_SCHEMA,
        adapterResultRef: `adapter-result.public-learning.${stablePart(request.commandRef)}.${request.stepIndex}`,
        observedPageStateRef,
        observedFocusElementRefOrNull: focusReceipt?.elementRef ?? null,
        observedAvailableElementRefs: [...doorReceipt.availableElementRefs],
        semanticSettled: settled,
        captureRefs: [],
        continuityEventRefs: [],
        failureRefOrNull: settled ? null : `failure.public-learning.observed-settlement-mismatch.${request.stepIndex}`
      };
    },
    async waitForPerceptionDwell({ dwellPolicy }) {
      const milliseconds = Number(dwellPolicy?.minimumMilliseconds ?? 0);
      need(Number.isFinite(milliseconds) && milliseconds >= 0, 'public learning dwell policy is invalid');
      if (milliseconds > 0) await wait(milliseconds);
    }
  };

  const initialPageState = compiledTopology.pageStateByRef[publicLearningPageStateRef(initialRef)];
  const initialDoorReceipt = synchronizeVisibleDoors(initialRef);
  need(initialDoorReceipt?.schemaVersion === REGISTERED_DOORS_RECEIPT_SCHEMA, 'public learning initial registered-door receipt is invalid');
  need(initialDoorReceipt.currentRef === initialRef && initialDoorReceipt.semanticNavigationPerformed === false, 'public learning initial registered-door synchronization must be no-navigation current truth');
  need(sameRefs(initialDoorReceipt.availableElementRefs, initialPageState.availableElementRefs), 'public learning initial registered-door set mismatch');
  need(observeCurrentRef() === initialRef, 'public learning initial Terrain presence mismatch');
  const initialFocusRef = initialPageState.entryFocusElementRefOrNull;
  if (initialFocusRef !== null) {
    const initialFocusReceipt = focusRegisteredElement(initialFocusRef);
    need(initialFocusReceipt?.schemaVersion === FOCUS_RECEIPT_SCHEMA, 'public learning initial registered-focus receipt is invalid');
    need(initialFocusReceipt.focused === true && initialFocusReceipt.elementRef === initialFocusRef, 'public learning initial registered focus mismatch');
    need(initialFocusReceipt.semanticNavigationPerformed === false, 'public learning initial registered focus cannot perform semantic navigation');
  }

  const session = createNavigationContinuitySession({
    registry,
    compiledTopology,
    preferenceStore,
    adapter,
    navigationSessionRef,
    initialPageStateRef: publicLearningPageStateRef(initialRef)
  });

  return Object.freeze({
    topology: clone(topology),
    compiledTopology,
    preferenceStore,
    session,
    navigateTo: (targetRef, options = {}) => session.navigateTo(targetRef, {
      goalRef: options.goalRef ?? `goal.public-learning.navigate.${stablePart(targetRef)}`,
      expectedFrameRef: options.expectedFrameRef ?? null,
      commandRef: options.commandRef
    }),
    currentFrame: () => session.currentFrame(),
    transitionBundles: () => session.transitionBundles(),
    recentTrace: (options = {}) => session.projectRecentTrace(options)
  });
}

export const PUBLIC_LEARNING_NAVIGATION_RECEIPTS = Object.freeze({
  adapterResultSchema: ADAPTER_RESULT_SCHEMA,
  focusReceiptSchema: FOCUS_RECEIPT_SCHEMA,
  registeredDoorsReceiptSchema: REGISTERED_DOORS_RECEIPT_SCHEMA
});

// [VXG RealForever]
