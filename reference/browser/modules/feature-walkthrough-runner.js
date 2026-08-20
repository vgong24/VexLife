const PLAN_DISPOSITIONS = new Set(['WALKTHROUGH', 'EXPLANATION_ONLY']);

export const FEATURE_WALKTHROUGH_RUNNER_STATES = Object.freeze({
  READY: 'READY',
  ACTIVE: 'ACTIVE',
  HELD: 'HELD',
  NOT_REQUIRED: 'NOT_REQUIRED',
  DEFERRED: 'DEFERRED',
  SUPPRESSED: 'SUPPRESSED',
  UNAVAILABLE: 'UNAVAILABLE',
  PLAN_STAGES_EXHAUSTED: 'PLAN_STAGES_EXHAUSTED'
});

export const FEATURE_WALKTHROUGH_PREFERENCE_STATES = Object.freeze({
  DEFERRED: 'DEFERRED',
  SUPPRESSED: 'SUPPRESSED'
});

const PREFERENCE_PREFIX = 'vexlife.guide.feature-introduction';
const NO_EFFECTS = Object.freeze({
  journeyCompletionCreated: false,
  memoryWritten: false,
  protectedActionExecuted: false,
  modelCalled: false,
  networkCalled: false,
  publicationPerformed: false
});

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function nonempty(value) {
  return typeof value === 'string' && value.length > 0;
}

function preferenceIdentity({ featureRef, planRef, sourceVersionRef }) {
  if (![featureRef, planRef, sourceVersionRef].every(nonempty)) {
    throw new Error('featureRef, planRef and sourceVersionRef are required for Guide-local introduction preference identity');
  }
  return { featureRef, planRef, sourceVersionRef };
}

export function featureWalkthroughPreferenceKey(identity) {
  const value = preferenceIdentity(identity);
  return [PREFERENCE_PREFIX, value.featureRef, value.planRef, value.sourceVersionRef]
    .map((part) => encodeURIComponent(part))
    .join('/');
}

export function createLocalStorageFeatureWalkthroughPreferenceStore(storage = globalThis.localStorage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
    throw new Error('Guide-local feature introduction preferences require Storage-compatible getItem/setItem/removeItem methods');
  }
  return Object.freeze({
    read(key) {
      try {
        const parsed = JSON.parse(storage.getItem(key));
        return parsed && typeof parsed === 'object' ? clone(parsed) : null;
      } catch {
        return null;
      }
    },
    write(key, value) {
      storage.setItem(key, JSON.stringify(value));
      return clone(value);
    },
    remove(key) {
      storage.removeItem(key);
    }
  });
}

function assertPreferenceStore(store) {
  if (!store || typeof store.read !== 'function' || typeof store.write !== 'function' || typeof store.remove !== 'function') {
    throw new Error('preferenceStore must provide read/write/remove');
  }
  return store;
}

function featureMap(featureRegistry) {
  return new Map((featureRegistry?.features ?? []).map((feature) => [feature.featureRef, feature]));
}

function planMap(experience) {
  return new Map((experience?.featureWalkthroughPlans ?? []).map((plan) => [plan.planRef, plan]));
}

function unavailable(featureRef, reason, details = {}) {
  return {
    state: FEATURE_WALKTHROUGH_RUNNER_STATES.UNAVAILABLE,
    featureRef,
    reason,
    ...details,
    effects: { ...NO_EFFECTS }
  };
}

function held(featureRef, introduction) {
  return {
    state: FEATURE_WALKTHROUGH_RUNNER_STATES.HELD,
    featureRef,
    disposition: introduction?.disposition ?? null,
    planRef: introduction?.planRefOrNull ?? null,
    reason: 'HUMAN_INTRODUCTION_ROUTE_HELD',
    effects: { ...NO_EFFECTS }
  };
}

function notRequired(featureRef, introduction) {
  return {
    state: FEATURE_WALKTHROUGH_RUNNER_STATES.NOT_REQUIRED,
    featureRef,
    disposition: introduction?.disposition ?? null,
    reason: 'PLAN_DRIVEN_INTRODUCTION_NOT_DECLARED',
    effects: { ...NO_EFFECTS }
  };
}

export function createFeatureWalkthroughRunner({
  featureRegistry,
  experience,
  evaluateTarget = null,
  currentFrame = () => null,
  preferenceStore,
  runRefFactory = () => `run.vexlife.feature-walkthrough.${crypto.randomUUID()}`
} = {}) {
  const features = featureMap(featureRegistry);
  const plans = planMap(experience);
  const preferences = assertPreferenceStore(preferenceStore);
  if (evaluateTarget !== null && typeof evaluateTarget !== 'function') throw new Error('evaluateTarget must be a function when supplied');
  if (typeof currentFrame !== 'function') throw new Error('currentFrame must be a function');
  if (typeof runRefFactory !== 'function') throw new Error('runRefFactory must be a function');

  function resolve(featureRef, { ignorePreference = false } = {}) {
    const feature = features.get(featureRef);
    if (!feature) return unavailable(featureRef, 'FEATURE_NOT_REGISTERED');
    const introduction = feature.humanIntroduction;
    if (!introduction || typeof introduction !== 'object') return unavailable(featureRef, 'HUMAN_INTRODUCTION_MISSING');
    if (!PLAN_DISPOSITIONS.has(introduction.disposition)) return notRequired(featureRef, introduction);
    if (introduction.routeState === 'HELD') return held(featureRef, introduction);
    if (introduction.routeState !== 'CURRENT') return unavailable(featureRef, 'HUMAN_INTRODUCTION_ROUTE_STATE_INVALID');
    if (!nonempty(introduction.planRefOrNull)) return unavailable(featureRef, 'CURRENT_PLAN_REF_MISSING');

    const plan = plans.get(introduction.planRefOrNull);
    if (!plan) return unavailable(featureRef, 'CURRENT_PLAN_MISSING', { planRef: introduction.planRefOrNull });
    if (plan.featureRef !== featureRef) return unavailable(featureRef, 'PLAN_FEATURE_MISMATCH', { planRef: plan.planRef, planFeatureRef: plan.featureRef });
    if (plan.effects !== false) return unavailable(featureRef, 'PLAN_EFFECTS_NOT_FALSE', { planRef: plan.planRef });
    if (!nonempty(plan.sourceVersionRef)) return unavailable(featureRef, 'PLAN_SOURCE_VERSION_MISSING', { planRef: plan.planRef });
    if (!Array.isArray(plan.stages) || plan.stages.length === 0) return unavailable(featureRef, 'PLAN_STAGES_MISSING', { planRef: plan.planRef });
    for (const [index, stage] of plan.stages.entries()) {
      if (!stage || typeof stage !== 'object' || stage.sequence !== index || !nonempty(stage.stageRef)) {
        return unavailable(featureRef, 'PLAN_STAGE_SEQUENCE_INVALID', { planRef: plan.planRef, stageIndex: index });
      }
    }

    const identity = preferenceIdentity({ featureRef, planRef: plan.planRef, sourceVersionRef: plan.sourceVersionRef });
    const preferenceKey = featureWalkthroughPreferenceKey(identity);
    const preference = preferences.read(preferenceKey);
    if (!ignorePreference && preference?.state === FEATURE_WALKTHROUGH_PREFERENCE_STATES.SUPPRESSED) {
      return {
        state: FEATURE_WALKTHROUGH_RUNNER_STATES.SUPPRESSED,
        featureRef,
        planRef: plan.planRef,
        sourceVersionRef: plan.sourceVersionRef,
        preferenceKey,
        effects: { ...NO_EFFECTS }
      };
    }
    if (!ignorePreference && preference?.state === FEATURE_WALKTHROUGH_PREFERENCE_STATES.DEFERRED) {
      return {
        state: FEATURE_WALKTHROUGH_RUNNER_STATES.DEFERRED,
        featureRef,
        planRef: plan.planRef,
        sourceVersionRef: plan.sourceVersionRef,
        preferenceKey,
        effects: { ...NO_EFFECTS }
      };
    }

    return {
      state: FEATURE_WALKTHROUGH_RUNNER_STATES.READY,
      featureRef,
      disposition: introduction.disposition,
      planRef: plan.planRef,
      journeyRef: plan.journeyRef,
      sourceVersionRef: plan.sourceVersionRef,
      experienceProfileRef: plan.experienceProfileRef,
      replayable: plan.replayable === true,
      stageCount: plan.stages.length,
      preferenceKey,
      plan,
      effects: { ...NO_EFFECTS }
    };
  }

  function offer(featureRef) {
    const route = resolve(featureRef);
    if (route.plan) delete route.plan;
    return clone(route);
  }

  function showMe(featureRef) {
    const route = resolve(featureRef, { ignorePreference: true });
    if (route.state !== FEATURE_WALKTHROUGH_RUNNER_STATES.READY) return route;
    const runRef = runRefFactory({ featureRef, planRef: route.planRef, sourceVersionRef: route.sourceVersionRef });
    if (!nonempty(runRef)) return unavailable(featureRef, 'RUN_REF_FACTORY_INVALID', { planRef: route.planRef });
    return {
      state: FEATURE_WALKTHROUGH_RUNNER_STATES.ACTIVE,
      featureRef,
      runRef,
      planRef: route.planRef,
      journeyRef: route.journeyRef,
      sourceVersionRef: route.sourceVersionRef,
      stageIndex: 0,
      stageCount: route.stageCount,
      replayable: route.replayable,
      effects: { ...NO_EFFECTS }
    };
  }

  function stage(run) {
    if (!run || run.state !== FEATURE_WALKTHROUGH_RUNNER_STATES.ACTIVE) {
      return unavailable(run?.featureRef ?? null, 'RUN_NOT_ACTIVE');
    }
    const route = resolve(run.featureRef, { ignorePreference: true });
    if (route.state !== FEATURE_WALKTHROUGH_RUNNER_STATES.READY) return route;
    if (route.planRef !== run.planRef || route.sourceVersionRef !== run.sourceVersionRef) {
      return unavailable(run.featureRef, 'RUN_SOURCE_VERSION_STALE', {
        runPlanRef: run.planRef,
        currentPlanRef: route.planRef,
        runSourceVersionRef: run.sourceVersionRef,
        currentSourceVersionRef: route.sourceVersionRef
      });
    }
    if (run.stageIndex >= route.plan.stages.length) {
      return {
        state: FEATURE_WALKTHROUGH_RUNNER_STATES.PLAN_STAGES_EXHAUSTED,
        featureRef: run.featureRef,
        runRef: run.runRef,
        planRef: run.planRef,
        journeyRef: route.journeyRef,
        sourceVersionRef: run.sourceVersionRef,
        completionAuthority: 'JOURNEY_REQUIRED',
        effects: { ...NO_EFFECTS }
      };
    }

    const sourceStage = route.plan.stages[run.stageIndex];
    const frame = currentFrame() ?? null;
    let targetEvaluation;
    if (sourceStage.targetRefOrNull === null) {
      if (sourceStage.actionRefOrNull !== null) {
        return unavailable(run.featureRef, 'ACTION_WITHOUT_TARGET_NOT_RUNNABLE', { stageRef: sourceStage.stageRef });
      }
      targetEvaluation = { state: 'NOT_REQUIRED', reason: 'STAGE_HAS_NO_TARGET' };
    } else if (typeof evaluateTarget !== 'function') {
      return unavailable(run.featureRef, 'TARGET_EVALUATOR_UNAVAILABLE', { stageRef: sourceStage.stageRef, targetRef: sourceStage.targetRefOrNull });
    } else {
      targetEvaluation = evaluateTarget(sourceStage.targetRefOrNull, frame);
      if (!targetEvaluation || targetEvaluation.state !== 'AVAILABLE') {
        return unavailable(run.featureRef, 'CURRENT_TARGET_UNAVAILABLE', {
          stageRef: sourceStage.stageRef,
          targetRef: sourceStage.targetRefOrNull,
          targetEvaluation: clone(targetEvaluation)
        });
      }
      if (sourceStage.actionRefOrNull !== null && targetEvaluation.actionRef !== sourceStage.actionRefOrNull) {
        return unavailable(run.featureRef, 'ACTION_TARGET_MISMATCH', {
          stageRef: sourceStage.stageRef,
          declaredActionRef: sourceStage.actionRefOrNull,
          currentActionRef: targetEvaluation.actionRef ?? null
        });
      }
    }

    return {
      state: FEATURE_WALKTHROUGH_RUNNER_STATES.ACTIVE,
      featureRef: run.featureRef,
      runRef: run.runRef,
      planRef: run.planRef,
      journeyRef: route.journeyRef,
      sourceVersionRef: run.sourceVersionRef,
      stageIndex: run.stageIndex,
      stageCount: route.plan.stages.length,
      stage: clone(sourceStage),
      targetEvaluation: clone(targetEvaluation),
      autoExecute: false,
      completionAuthority: 'JOURNEY_REQUIRED',
      effects: { ...NO_EFFECTS }
    };
  }

  function advance(run) {
    const projection = stage(run);
    if (projection.state !== FEATURE_WALKTHROUGH_RUNNER_STATES.ACTIVE) return projection;
    return {
      ...clone(run),
      stageIndex: run.stageIndex + 1,
      effects: { ...NO_EFFECTS }
    };
  }

  function writePreference(featureRef, state) {
    const route = resolve(featureRef, { ignorePreference: true });
    if (route.state !== FEATURE_WALKTHROUGH_RUNNER_STATES.READY) return route;
    const value = Object.freeze({
      state,
      featureRef,
      planRef: route.planRef,
      sourceVersionRef: route.sourceVersionRef
    });
    preferences.write(route.preferenceKey, value);
    return {
      state,
      featureRef,
      planRef: route.planRef,
      sourceVersionRef: route.sourceVersionRef,
      preferenceKey: route.preferenceKey,
      completionAuthority: 'JOURNEY_REQUIRED',
      effects: { ...NO_EFFECTS }
    };
  }

  const later = (featureRef) => writePreference(featureRef, FEATURE_WALKTHROUGH_PREFERENCE_STATES.DEFERRED);
  const suppress = (featureRef) => writePreference(featureRef, FEATURE_WALKTHROUGH_PREFERENCE_STATES.SUPPRESSED);

  function clearPreference(featureRef) {
    const route = resolve(featureRef, { ignorePreference: true });
    if (route.state !== FEATURE_WALKTHROUGH_RUNNER_STATES.READY) return route;
    preferences.remove(route.preferenceKey);
    return offer(featureRef);
  }

  return Object.freeze({
    offer,
    showMe,
    stage,
    advance,
    later,
    suppress,
    clearPreference
  });
}

// [VXG RealForever]
