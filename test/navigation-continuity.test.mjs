import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NavigationContinuityError,
  compileNavigationTopology,
  createNavigationContinuitySession,
  createNavigationPreferenceStore,
  planNavigationRoute,
  projectNavigationCurrentFrame,
  projectNavigationRecentTrace,
  replayNavigationTransitionBundles,
  resolveNavigationPresentationPolicy,
  resolveNavigationResource,
  validateNavigationContinuityRegistry,
  validateNavigationPlanCurrent
} from '../src/core/navigation-continuity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
const registry = readJson('blueprint/navigation-continuity-registry.json');
const fixture = readJson('fixtures/navigation-continuity/cross-realm.json');

function withoutPortal(topology = fixture) {
  const copy = structuredClone(topology);
  copy.transitions = copy.transitions.filter((item) => item.portalRefOrNull === null);
  return copy;
}

function compile(topology = fixture) {
  return compileNavigationTopology({ registry, topology });
}

function makeAdapter({ events = [], failTransitionRef = null, delayMs = 0 } = {}) {
  let active = 0;
  let maximumActive = 0;
  return {
    get maximumActive() { return maximumActive; },
    async performTransition(request) {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      events.push(`perform:${request.transition.transitionRef}`);
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      active -= 1;
      if (request.transition.transitionRef === failTransitionRef) {
        return {
          adapterResultRef: `adapter-result.fixture.failure.${request.stepIndex}`,
          observedPageStateRef: request.fromFrame.pageStateRef,
          observedFocusElementRefOrNull: request.fromFrame.focusElementRefOrNull,
          observedAvailableElementRefs: request.fromFrame.availableElementRefs,
          semanticSettled: false,
          captureRefs: [],
          continuityEventRefs: [],
          failureRefOrNull: `failure.fixture.${request.stepIndex}`
        };
      }
      events.push(`settled:${request.transition.transitionRef}`);
      return {
        adapterResultRef: `adapter-result.fixture.${request.commandRef}.${request.stepIndex}`,
        observedPageStateRef: request.expectedPageState.pageStateRef,
        observedFocusElementRefOrNull: request.transition.focusTargetElementRefOrNull,
        observedAvailableElementRefs: request.expectedPageState.availableElementRefs,
        semanticSettled: true,
        captureRefs: [`capture.fixture.${request.commandRef}.${request.stepIndex}`],
        continuityEventRefs: [`event.fixture.${request.commandRef}.${request.stepIndex}`],
        failureRefOrNull: null
      };
    },
    async waitForPerceptionDwell({ dwellPolicy }) {
      events.push(`dwell:${dwellPolicy.dwellPolicyRef}`);
    },
    async awaitHumanAdvance({ advancePolicy }) {
      events.push(`advance:${advancePolicy.advancePolicyRef}`);
    }
  };
}

function makeSession({
  topology = fixture,
  preferenceRefs = null,
  adapter = makeAdapter(),
  sessionRef = 'navigation-session.fixture.default'
} = {}) {
  const compiledTopology = compile(topology);
  const preferenceStore = createNavigationPreferenceStore({
    registry,
    initialPreferenceRefs: preferenceRefs
  });
  const session = createNavigationContinuitySession({
    registry,
    compiledTopology,
    preferenceStore,
    adapter,
    navigationSessionRef: sessionRef
  });
  return { compiledTopology, preferenceStore, adapter, session };
}

const preference = (pacingRef, motionPolicyRef = 'motion.navigation.standard') => ({
  pacingRef,
  motionPolicyRef,
  traceVisibilityRef: 'trace-visibility.navigation.visible'
});

test('NCF-00/01 canonical descriptor registry validates and pacing expansion is data-driven', () => {
  const validation = validateNavigationContinuityRegistry(registry);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  const store = createNavigationPreferenceStore({
    registry,
    initialPreferenceRefs: preference('navigation-pacing.vexlife.fast')
  });
  const policy = resolveNavigationPresentationPolicy({ registry, preferenceSnapshot: store.snapshot() });
  assert.equal(policy.pacingRef, 'navigation-pacing.vexlife.fast');
  assert.equal(policy.animationPolicyRef, 'animation.navigation.compressed');
  assert.equal(policy.dwellPolicyRef, 'dwell.navigation.minimum');
  assert.equal(policy.semanticStepsMayCollapse, false);

  const changed = structuredClone(registry);
  changed.pacingDescriptors.find((item) => item.pacingRef === 'navigation-pacing.vexlife.fast')
    .animationPolicyRef = 'animation.navigation.standard';
  const changedStore = createNavigationPreferenceStore({
    registry: changed,
    initialPreferenceRefs: preference('navigation-pacing.vexlife.fast')
  });
  const changedPolicy = resolveNavigationPresentationPolicy({
    registry: changed,
    preferenceSnapshot: changedStore.snapshot()
  });
  assert.equal(changedPolicy.animationPolicyRef, 'animation.navigation.standard');
});

test('NCF-04/05/08 lookup and route planning are no-effect and cross realms through the registered root path', () => {
  const topology = compile(withoutPortal());
  const before = JSON.stringify(topology);
  const resolution = resolveNavigationResource({
    compiledTopology: topology,
    resourceRef: 'resource.fixture.target'
  });
  assert.equal(resolution.pageStateRefOrNull, 'page-state.fixture.beta.leaf');
  assert.equal(resolution.presenceMutated, false);
  const plan = planNavigationRoute({
    compiledTopology: topology,
    fromPageStateRef: 'page-state.fixture.alpha.leaf',
    destinationResourceRef: 'resource.fixture.target'
  });
  assert.deepEqual(plan.steps.map((item) => item.toPageStateRef), [
    'page-state.fixture.alpha.branch',
    'page-state.fixture.alpha.realm',
    'page-state.fixture.root',
    'page-state.fixture.beta.realm',
    'page-state.fixture.beta.branch',
    'page-state.fixture.beta.leaf'
  ]);
  assert.equal(plan.presenceMutated, false);
  assert.equal(JSON.stringify(topology), before);
});

test('NCF-08/09 an explicit visible portal is valid while an unclassified cross-realm jump fails closed', () => {
  const topology = compile();
  const plan = planNavigationRoute({
    compiledTopology: topology,
    fromPageStateRef: 'page-state.fixture.alpha.leaf',
    destinationResourceRef: 'resource.fixture.target'
  });
  assert.deepEqual(plan.steps.map((item) => item.transitionRef), [
    'transition.fixture.alpha-leaf-to-beta-leaf-portal'
  ]);

  const malformed = structuredClone(fixture);
  const portal = malformed.transitions.find((item) => item.portalRefOrNull);
  portal.transitionClassRef = 'transition-class.navigation.registered-door';
  portal.portalRefOrNull = null;
  assert.throws(
    () => compile(malformed),
    (error) => error instanceof NavigationContinuityError &&
      error.code === 'CROSS_REALM_TRANSITION_REQUIRES_VISIBLE_PORTAL'
  );
});

test('NCF-06/07 movement requires a currently available user-facing element and never teleports', async () => {
  const malformed = structuredClone(fixture);
  malformed.pageStates.find((item) => item.pageStateRef === 'page-state.fixture.alpha.leaf')
    .availableElementRefs = ['element.fixture.alpha.leaf.return-branch'];
  assert.throws(
    () => compile(malformed),
    (error) => error.code === 'TRANSITION_VISIBLE_ELEMENT_NOT_AVAILABLE'
  );

  const disconnected = withoutPortal();
  disconnected.transitions = disconnected.transitions.filter((item) =>
    item.transitionRef !== 'transition.fixture.root-to-beta-realm');
  const { session, adapter } = makeSession({ topology: disconnected });
  const initial = session.currentFrame();
  const result = await session.navigateTo('resource.fixture.target', {
    goalRef: 'goal.fixture.reach-beta'
  });
  assert.equal(result.outcomeRef, 'outcome.navigation.blocked-no-visible-route');
  assert.equal(session.currentFrame().frameRef, initial.frameRef);
  assert.equal(adapter.maximumActive, 0);
});

test('NCF-02 one preference source feeds separate session executors without creating a global queue', async () => {
  const compiledTopology = compile();
  const preferenceStore = createNavigationPreferenceStore({ registry });
  preferenceStore.update(preference('navigation-pacing.vexlife.slow'));
  const eventsA = [];
  const eventsB = [];
  const adapterA = makeAdapter({ events: eventsA, delayMs: 10 });
  const adapterB = makeAdapter({ events: eventsB, delayMs: 10 });
  const sessionA = createNavigationContinuitySession({
    registry, compiledTopology, preferenceStore, adapter: adapterA,
    navigationSessionRef: 'navigation-session.fixture.a'
  });
  const sessionB = createNavigationContinuitySession({
    registry, compiledTopology, preferenceStore, adapter: adapterB,
    navigationSessionRef: 'navigation-session.fixture.b'
  });
  await Promise.all([
    sessionA.navigateTo('resource.fixture.target', { goalRef: 'goal.fixture.a' }),
    sessionB.navigateTo('resource.fixture.target', { goalRef: 'goal.fixture.b' })
  ]);
  assert.equal(adapterA.maximumActive, 1);
  assert.equal(adapterB.maximumActive, 1);
  assert.equal(sessionA.transitionBundles()[0].pacingRef, 'navigation-pacing.vexlife.slow');
  assert.equal(sessionB.transitionBundles()[0].pacingRef, 'navigation-pacing.vexlife.slow');
});

test('NCF-03 one session serializes concurrent navigateTo commands deterministically', async () => {
  const events = [];
  const adapter = makeAdapter({ events, delayMs: 5 });
  const { session } = makeSession({ adapter });
  const first = session.navigateTo('resource.fixture.target', { goalRef: 'goal.fixture.first' });
  const second = session.navigateTo('resource.fixture.root', { goalRef: 'goal.fixture.second' });
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.outcomeRef, 'outcome.navigation.committed');
  assert.equal(secondResult.outcomeRef, 'outcome.navigation.committed');
  assert.equal(adapter.maximumActive, 1);
  assert.equal(session.currentFrame().pageStateRef, 'page-state.fixture.root');
  assert.deepEqual(session.transitionBundles().map((item) => item.commandRef), [
    'command.navigation.navigation-session.fixture.default.1',
    'command.navigation.navigation-session.fixture.default.2',
    'command.navigation.navigation-session.fixture.default.2',
    'command.navigation.navigation-session.fixture.default.2'
  ]);
});

test('NCF-10 fast, normal, slow and step preserve one identical semantic transition order', async () => {
  const orders = new Map();
  for (const pacingRef of [
    'navigation-pacing.vexlife.fast',
    'navigation-pacing.vexlife.normal',
    'navigation-pacing.vexlife.slow',
    'navigation-pacing.vexlife.step'
  ]) {
    const { session } = makeSession({
      topology: withoutPortal(),
      preferenceRefs: preference(pacingRef),
      sessionRef: `navigation-session.fixture.${pacingRef.split('.').at(-1)}`
    });
    const result = await session.navigateTo('resource.fixture.target', {
      goalRef: `goal.fixture.${pacingRef.split('.').at(-1)}`
    });
    assert.equal(result.outcomeRef, 'outcome.navigation.committed');
    orders.set(pacingRef, session.transitionBundles().map((item) => item.via.transitionRef));
  }
  const baseline = orders.get('navigation-pacing.vexlife.normal');
  for (const order of orders.values()) assert.deepEqual(order, baseline);
  assert.equal(baseline.length, 6);
});

test('NCF-11 reduced motion changes animation projection only, never route meaning', async () => {
  const standardEvents = [];
  const reducedEvents = [];
  const standardAdapter = makeAdapter({ events: standardEvents });
  const reducedAdapter = {
    ...makeAdapter({ events: reducedEvents }),
    policies: [],
    async performTransition(request) {
      this.policies.push(request.presentationPolicy.animationPolicyRef);
      return makeAdapter({ events: reducedEvents }).performTransition(request);
    }
  };
  const standard = makeSession({
    topology: withoutPortal(),
    preferenceRefs: preference('navigation-pacing.vexlife.normal'),
    adapter: standardAdapter,
    sessionRef: 'navigation-session.fixture.motion-standard'
  });
  const reduced = makeSession({
    topology: withoutPortal(),
    preferenceRefs: preference('navigation-pacing.vexlife.normal', 'motion.navigation.reduced'),
    adapter: reducedAdapter,
    sessionRef: 'navigation-session.fixture.motion-reduced'
  });
  await standard.session.navigateTo('resource.fixture.target', { goalRef: 'goal.fixture.standard' });
  await reduced.session.navigateTo('resource.fixture.target', { goalRef: 'goal.fixture.reduced' });
  assert.deepEqual(
    reduced.session.transitionBundles().map((item) => item.via.transitionRef),
    standard.session.transitionBundles().map((item) => item.via.transitionRef)
  );
  assert.ok(reducedAdapter.policies.every((ref) => ref === 'animation.navigation.immediate'));
});

test('NCF-12/13 semantic settlement precedes dwell and step-mode human advance', async () => {
  const events = [];
  const adapter = makeAdapter({ events });
  const { session } = makeSession({
    topology: withoutPortal(),
    preferenceRefs: preference('navigation-pacing.vexlife.step'),
    adapter,
    sessionRef: 'navigation-session.fixture.step-order'
  });
  await session.navigateTo('resource.fixture.target', { goalRef: 'goal.fixture.step-order' });
  const performIndexes = events.map((event, index) => event.startsWith('perform:') ? index : -1).filter((i) => i >= 0);
  const settledIndexes = events.map((event, index) => event.startsWith('settled:') ? index : -1).filter((i) => i >= 0);
  const dwellIndexes = events.map((event, index) => event.startsWith('dwell:') ? index : -1).filter((i) => i >= 0);
  const advanceIndexes = events.map((event, index) => event.startsWith('advance:') ? index : -1).filter((i) => i >= 0);
  assert.equal(performIndexes.length, 6);
  assert.equal(settledIndexes.length, 6);
  assert.equal(dwellIndexes.length, 6);
  assert.equal(advanceIndexes.length, 5);
  for (let i = 0; i < 6; i += 1) {
    assert.ok(performIndexes[i] < settledIndexes[i]);
    assert.ok(settledIndexes[i] < dwellIndexes[i]);
    if (i < 5) assert.ok(dwellIndexes[i] < advanceIndexes[i]);
  }
});

test('NCF-14/18/19 atomic bundles bind from/via/to deltas and bounded ref-only projections', async () => {
  const { session } = makeSession();
  await session.navigateTo('resource.fixture.target', { goalRef: 'goal.fixture.bundle' });
  const [bundle] = session.transitionBundles();
  assert.equal(bundle.from.pageStateRef, 'page-state.fixture.alpha.leaf');
  assert.equal(bundle.via.elementRef, 'element.fixture.alpha.leaf.portal-beta-leaf');
  assert.equal(bundle.to.pageStateRef, 'page-state.fixture.beta.leaf');
  assert.deepEqual(bundle.delta.elementRefsAppeared, ['element.fixture.beta.leaf.return-branch']);
  assert.ok(bundle.delta.elementRefsDisappeared.includes('element.fixture.alpha.leaf.return-branch'));
  assert.equal(bundle.predecessorCommitRefOrNull, null);
  assert.equal(bundle.navigationCommitRef.startsWith('navigation-commit.'), true);

  const current = projectNavigationCurrentFrame(session);
  assert.equal(current.goalRefOrNull, 'goal.fixture.bundle');
  assert.equal(current.current.pageStateRef, 'page-state.fixture.beta.leaf');
  assert.equal(current.screenshotBodyIncluded, false);
  const trace = projectNavigationRecentTrace(session, { limit: 1 });
  assert.equal(trace.entries.length, 1);
  assert.deepEqual(trace.entries[0].captureRefs, bundle.captureRefs);
  assert.equal(trace.rawLogBodyIncluded, false);
  assert.equal(trace.screenshotBodyIncluded, false);
});

test('NCF-15/16 stale origin and adapter failure preserve the last committed known-good frame', async () => {
  const staleEvents = [];
  const staleAdapter = makeAdapter({ events: staleEvents });
  const stale = makeSession({ adapter: staleAdapter });
  const initial = stale.session.currentFrame();
  const staleResult = await stale.session.navigateTo('resource.fixture.target', {
    goalRef: 'goal.fixture.stale',
    expectedFrameRef: 'frame.navigation.stale'
  });
  assert.equal(staleResult.outcomeRef, 'outcome.navigation.blocked-stale-frame');
  assert.equal(stale.session.currentFrame().frameRef, initial.frameRef);
  assert.equal(staleEvents.length, 0);

  const failureEvents = [];
  const failureAdapter = makeAdapter({
    events: failureEvents,
    failTransitionRef: 'transition.fixture.alpha-branch-to-realm'
  });
  const failed = makeSession({ topology: withoutPortal(), adapter: failureAdapter });
  const failedResult = await failed.session.navigateTo('resource.fixture.target', {
    goalRef: 'goal.fixture.failure'
  });
  assert.equal(failedResult.outcomeRef, 'outcome.navigation.adapter-failure');
  assert.equal(failed.session.currentFrame().pageStateRef, 'page-state.fixture.alpha.branch');
  assert.equal(failed.session.transitionBundles().length, 1);
  assert.equal(failedResult.lastKnownGoodFrameRef, failed.session.currentFrame().frameRef);
});

test('NCF-17/20/21 replay is exact, topology drift is stale, and command identity is once-only', async () => {
  const { compiledTopology, session } = makeSession();
  const initial = session.initialFrame();
  const first = await session.navigateTo('resource.fixture.target', {
    goalRef: 'goal.fixture.replay',
    expectedFrameRef: initial.frameRef,
    commandRef: 'command.fixture.once'
  });
  const duplicate = await session.navigateTo('resource.fixture.target', {
    goalRef: 'goal.fixture.replay',
    expectedFrameRef: initial.frameRef,
    commandRef: 'command.fixture.once'
  });
  const divergent = await session.navigateTo('resource.fixture.root', {
    goalRef: 'goal.fixture.replay',
    expectedFrameRef: initial.frameRef,
    commandRef: 'command.fixture.once'
  });
  assert.equal(first.outcomeRef, 'outcome.navigation.committed');
  assert.equal(duplicate.outcomeRef, 'outcome.navigation.duplicate-exact-noop');
  assert.equal(divergent.outcomeRef, 'outcome.navigation.divergent-command-identity');
  assert.equal(session.transitionBundles().length, 1);

  const replay = replayNavigationTransitionBundles({
    registry,
    compiledTopology,
    navigationSessionRef: session.navigationSessionRef,
    initialFrame: initial,
    bundles: session.transitionBundles()
  });
  assert.equal(replay.state, 'CURRENT');
  assert.deepEqual(replay.currentFrame, session.currentFrame());

  const changedFixture = structuredClone(fixture);
  changedFixture.pageStates.find((item) => item.pageStateRef === 'page-state.fixture.beta.leaf')
    .resourceRefs.push('resource.fixture.beta.extra');
  const changedTopology = compile(changedFixture);
  assert.equal(validateNavigationPlanCurrent({
    plan: planNavigationRoute({
      compiledTopology,
      fromPageStateRef: 'page-state.fixture.alpha.leaf',
      destinationResourceRef: 'resource.fixture.target'
    }),
    compiledTopology: changedTopology
  }).state, 'STALE');
  const staleReplay = replayNavigationTransitionBundles({
    registry,
    compiledTopology: changedTopology,
    navigationSessionRef: session.navigationSessionRef,
    initialFrame: initial,
    bundles: session.transitionBundles()
  });
  assert.equal(staleReplay.state, 'STALE');
  assert.equal(staleReplay.currentFrame.frameRef, initial.frameRef);
});

// [VXG RealForever]
