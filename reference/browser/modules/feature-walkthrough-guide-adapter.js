import {
  FEATURE_WALKTHROUGH_RUNNER_STATES,
  createFeatureWalkthroughRunner,
  createLocalStorageFeatureWalkthroughPreferenceStore
} from './feature-walkthrough-runner.js';

export const FEATURE_WALKTHROUGH_GUIDE_ADAPTER_REF = 'adapter.vexlife.browser.feature-walkthrough-guide/v1';

function assertGuide(guide) {
  if (!guide || typeof guide.evaluateActionTarget !== 'function' || typeof guide.addMessage !== 'function') {
    throw new Error('Feature walkthrough Guide adapter requires evaluateActionTarget() and addMessage()');
  }
  return guide;
}

function assertNavigation(navigation) {
  if (!navigation || typeof navigation.semanticFrame !== 'function') {
    throw new Error('Feature walkthrough Guide adapter requires navigation.semanticFrame()');
  }
  return navigation;
}

export function createFeatureWalkthroughGuideAdapter({
  featureRegistry,
  experience,
  guide,
  navigation,
  storage = globalThis.localStorage,
  runRefFactory
} = {}) {
  const guideOwner = assertGuide(guide);
  const navigationOwner = assertNavigation(navigation);
  const preferenceStore = createLocalStorageFeatureWalkthroughPreferenceStore(storage);
  const runner = createFeatureWalkthroughRunner({
    featureRegistry,
    experience,
    preferenceStore,
    currentFrame: () => navigationOwner.semanticFrame(),
    evaluateTarget: (targetRef, frame) => guideOwner.evaluateActionTarget(targetRef, frame),
    ...(runRefFactory ? { runRefFactory } : {})
  });

  function projectCurrentStage(run) {
    const projection = runner.stage(run);
    if (projection.state === FEATURE_WALKTHROUGH_RUNNER_STATES.ACTIVE) {
      guideOwner.addMessage('guide', {
        contentRef: projection.stage.contentStringRef,
        contentParams: {},
        intentRef: null
      });
    }
    return projection;
  }

  function showMe(featureRef) {
    const run = runner.showMe(featureRef);
    if (run.state !== FEATURE_WALKTHROUGH_RUNNER_STATES.ACTIVE) return run;
    return Object.freeze({ ...run, currentStage: projectCurrentStage(run) });
  }

  function advance(run) {
    const next = runner.advance(run);
    if (next.state !== FEATURE_WALKTHROUGH_RUNNER_STATES.ACTIVE) return next;
    return Object.freeze({ ...next, currentStage: projectCurrentStage(next) });
  }

  return Object.freeze({
    adapterRef: FEATURE_WALKTHROUGH_GUIDE_ADAPTER_REF,
    offer: (featureRef) => runner.offer(featureRef),
    showMe,
    currentStage: projectCurrentStage,
    advance,
    later: (featureRef) => runner.later(featureRef),
    dontIntroduceAgain: (featureRef) => runner.suppress(featureRef),
    clearPreference: (featureRef) => runner.clearPreference(featureRef)
  });
}

// [VXG RealForever]
