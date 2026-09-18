import crypto from 'node:crypto';
import {
  screenshotEvidenceFilename,
  validateReviewRequestBundle
} from './experience-review-kit.mjs';

export const SEEDED_EXPLORATION_SCHEMA = 'vexlife.experience-review.seeded-exploration/v1';
export const SEEDED_NO_EFFECT_ACTION_REFS = Object.freeze([
  'action.view.select',
  'action.thread.select',
  'action.channel.select'
]);
export const MAX_SEEDED_STEP_BUDGET = 32;
export const MAX_SEEDED_TIME_BUDGET_MS = 60_000;

const SEEDED_NO_EFFECT_ACTION_SET = new Set(SEEDED_NO_EFFECT_ACTION_REFS);
const SEEDED_POLICY_KEYS = new Set([
  'schemaVersion',
  'captureRequestRef',
  'executionEffectPolicy',
  'admittedActionRefs',
  'reproducibleSeed',
  'stepBudget',
  'timeBudgetMs',
  'forbiddenEffectClasses',
  'stopOnUnknown',
  'rawPrivateLogging',
  'effectAuthorityRef',
  'fixtureRef'
]);

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function string(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a non-empty string`);
  return value;
}

function uniqueStrings(values, name, { minItems = 0 } = {}) {
  if (!Array.isArray(values)) throw new TypeError(`${name} must be an array`);
  if (values.length < minItems) throw new Error(`${name} requires at least ${minItems} item(s)`);
  for (const [index, value] of values.entries()) string(value, `${name}[${index}]`);
  if (new Set(values).size !== values.length) throw new Error(`${name} contains duplicate refs`);
  return values;
}

function positiveInteger(value, name, maximum) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${name} must be an integer from 1 through ${maximum}`);
  }
  return value;
}

function actionRegistry(actions) {
  if (!Array.isArray(actions)) throw new TypeError('actions must be an array');
  const byRef = new Map();
  for (const [index, raw] of actions.entries()) {
    const action = object(raw, `actions[${index}]`);
    const actionRef = string(action.actionRef, `actions[${index}].actionRef`);
    string(action.permissionRef, `actions[${index}].permissionRef`);
    string(action.effectClass, `actions[${index}].effectClass`);
    if (byRef.has(actionRef)) throw new Error(`Duplicate current actionRef: ${actionRef}`);
    byRef.set(actionRef, action);
  }
  return byRef;
}

function currentForbiddenEffectClasses(actions) {
  return [...new Set(actions
    .map((action) => action.effectClass)
    .filter((effectClass) => effectClass !== 'READ_ONLY'))].sort();
}

function exactStringSet(values, expected, name) {
  const actual = [...values].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name} must exactly cover current non-READ_ONLY effect classes`);
  }
}

function deterministicSelection(seed, captureRequestRef, steps) {
  return steps.map((step) => ({
    step,
    score: crypto.createHash('sha256')
      .update(`${seed}\u0000${captureRequestRef}\u0000${step.reviewStepRef}\u0000${step.actionRef}`, 'utf8')
      .digest('hex')
  })).sort((left, right) => left.score.localeCompare(right.score)
    || left.step.reviewStepRef.localeCompare(right.step.reviewStepRef));
}

function bindingForCapture(bindings, captureRequestRef) {
  if (!Array.isArray(bindings)) throw new TypeError('browser bindings must be an array');
  let match = null;
  for (const raw of bindings) {
    const binding = object(raw, 'browser binding');
    const ref = string(binding.captureRequestRef, 'browser binding captureRequestRef');
    if (ref !== captureRequestRef) continue;
    if (match) throw new Error(`Duplicate browser binding for ${captureRequestRef}`);
    match = binding;
  }
  if (!match) throw new Error(`Missing browser binding for ${captureRequestRef}`);
  if (!match.viewport || !Number.isInteger(match.viewport.width) || match.viewport.width < 1) {
    throw new Error(`Browser binding ${captureRequestRef} requires a positive integer viewport.width`);
  }
  return match;
}

export function seededTimeBudgetRemaining(startedAtMs, timeBudgetMs, nowMs = Date.now()) {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) throw new TypeError('time budget clocks must be finite numbers');
  positiveInteger(timeBudgetMs, 'timeBudgetMs', MAX_SEEDED_TIME_BUDGET_MS);
  return Math.max(0, Math.floor(startedAtMs + timeBudgetMs - nowMs));
}

export function validateSeededNoEffectPolicy(bundle, actions) {
  const validated = validateReviewRequestBundle(bundle);
  const policy = object(validated.reviewPlan.seededExploration, 'reviewPlan.seededExploration');
  const extraKeys = Object.keys(policy).filter((key) => !SEEDED_POLICY_KEYS.has(key));
  if (extraKeys.length) throw new Error(`seededExploration contains unsupported field: ${extraKeys[0]}`);
  if (policy.schemaVersion !== SEEDED_EXPLORATION_SCHEMA) throw new Error('Unsupported seeded exploration schema');
  const captureRequestRef = string(policy.captureRequestRef, 'seededExploration.captureRequestRef');
  if (!validated.reviewRequest.captureRequestRefs.includes(captureRequestRef)) {
    throw new Error(`Seeded capture request is not admitted by reviewRequest: ${captureRequestRef}`);
  }
  const capture = validated.captureByRef.get(captureRequestRef);
  if (!capture) throw new Error(`Unknown seeded capture request: ${captureRequestRef}`);
  if (capture.platformRef !== 'platform.browser') {
    throw new Error(`Seeded NO_EFFECT exploration requires platform.browser; native adapter is not admitted for ${capture.platformRef}`);
  }
  if (policy.executionEffectPolicy !== 'NO_EFFECT') throw new Error('Seeded exploration executionEffectPolicy must be NO_EFFECT');

  const admittedActionRefs = uniqueStrings(policy.admittedActionRefs, 'seededExploration.admittedActionRefs', { minItems: 1 });
  for (const actionRef of admittedActionRefs) {
    if (!SEEDED_NO_EFFECT_ACTION_SET.has(actionRef)) {
      throw new Error(`Seeded action is outside the exact source-placed allowlist: ${actionRef}`);
    }
  }
  const byRef = actionRegistry(actions);
  for (const actionRef of admittedActionRefs) {
    const action = byRef.get(actionRef);
    if (!action) throw new Error(`Seeded action is not present in current canonical actions: ${actionRef}`);
    if (action.permissionRef !== 'permission.none') throw new Error(`Seeded action is permissioned under current source: ${actionRef}`);
    if (action.effectClass !== 'READ_ONLY') throw new Error(`Seeded action is not READ_ONLY under current source: ${actionRef}`);
  }

  const seed = string(policy.reproducibleSeed, 'seededExploration.reproducibleSeed');
  if (seed.length > 256) throw new RangeError('seededExploration.reproducibleSeed must be at most 256 characters');
  const stepBudget = positiveInteger(policy.stepBudget, 'seededExploration.stepBudget', MAX_SEEDED_STEP_BUDGET);
  const timeBudgetMs = positiveInteger(policy.timeBudgetMs, 'seededExploration.timeBudgetMs', MAX_SEEDED_TIME_BUDGET_MS);
  const forbiddenEffectClasses = uniqueStrings(policy.forbiddenEffectClasses, 'seededExploration.forbiddenEffectClasses');
  exactStringSet(forbiddenEffectClasses, currentForbiddenEffectClasses(actions), 'seededExploration.forbiddenEffectClasses');
  if (policy.stopOnUnknown !== true) throw new Error('seededExploration.stopOnUnknown must be true');
  if (policy.rawPrivateLogging !== false) throw new Error('seededExploration.rawPrivateLogging must be false');
  if (policy.effectAuthorityRef !== undefined && policy.effectAuthorityRef !== null) {
    throw new Error('NO_EFFECT seeded exploration must not carry effectAuthorityRef');
  }
  if (policy.fixtureRef !== undefined && policy.fixtureRef !== null) {
    throw new Error('NO_EFFECT seeded exploration must not carry fixtureRef');
  }

  const admittedSet = new Set(admittedActionRefs);
  for (const step of capture.steps) {
    const action = byRef.get(step.actionRef);
    if (!action) throw new Error(`Seeded capture contains unknown current action: ${step.actionRef}`);
    if (!admittedSet.has(step.actionRef)) throw new Error(`Seeded capture contains unadmitted action: ${step.actionRef}`);
    if (action.permissionRef !== 'permission.none') throw new Error(`Seeded capture action is permissioned: ${step.actionRef}`);
    if (action.effectClass !== 'READ_ONLY') throw new Error(`Seeded capture action is not READ_ONLY: ${step.actionRef}`);
  }
  if (stepBudget > capture.steps.length) {
    throw new Error(`seededExploration.stepBudget ${stepBudget} exceeds admitted capture step count ${capture.steps.length}`);
  }

  return {
    validated,
    policy,
    capture,
    admittedActionRefs: [...admittedActionRefs],
    forbiddenEffectClasses: [...forbiddenEffectClasses],
    reproducibleSeed: seed,
    stepBudget,
    timeBudgetMs
  };
}

export function buildSeededNoEffectBrowserCapturePlan(bundle, bindings, actions) {
  const admitted = validateSeededNoEffectPolicy(bundle, actions);
  const binding = bindingForCapture(bindings, admitted.capture.captureRequestRef);
  const selected = deterministicSelection(
    admitted.reproducibleSeed,
    admitted.capture.captureRequestRef,
    admitted.capture.steps
  ).slice(0, admitted.stepBudget).map(({ step }) => step);
  if (selected.length !== admitted.stepBudget) throw new Error('Seeded selection did not satisfy exact step budget');

  const tasks = selected.map((selectedStep, index) => {
    const prefix = selected.slice(0, index + 1).map((step, sequence) => ({ ...structuredClone(step), sequence }));
    const captureRequest = {
      ...structuredClone(admitted.capture),
      steps: prefix,
      captureAtStepRefs: [selectedStep.reviewStepRef]
    };
    const slug = binding.artifactSlugs?.[selectedStep.reviewStepRef];
    if (!slug) throw new Error(`Missing seeded artifact slug for ${selectedStep.reviewStepRef}`);
    return {
      taskRef: `seeded-browser-task.${admitted.capture.captureRequestRef}.${index}.${selectedStep.reviewStepRef}`,
      captureRequest,
      step: prefix[index],
      binding,
      artifactFileName: screenshotEvidenceFilename({
        slug,
        localeRef: admitted.capture.localeRef,
        themeRef: admitted.capture.themeRef,
        viewport: binding.viewport.width
      })
    };
  });

  return {
    schemaVersion: SEEDED_EXPLORATION_SCHEMA,
    planRef: `seeded-browser-plan.${admitted.validated.reviewRequest.reviewRequestRef}.${crypto.createHash('sha256').update(admitted.reproducibleSeed).digest('hex').slice(0, 16)}`,
    matrixPolicy: 'SEEDED_PREDECLARED_NO_EFFECT_STEPS_ONLY',
    automaticCartesianExpansion: false,
    executionEffectPolicy: 'NO_EFFECT',
    reproducibleSeed: admitted.reproducibleSeed,
    stepBudget: admitted.stepBudget,
    timeBudgetMs: admitted.timeBudgetMs,
    admittedActionRefs: admitted.admittedActionRefs,
    forbiddenEffectClasses: admitted.forbiddenEffectClasses,
    selectedStepRefs: selected.map((step) => step.reviewStepRef),
    selectedActionRefs: selected.map((step) => step.actionRef),
    effectAuthorityRef: null,
    fixtureRef: null,
    rawPrivateLogging: false,
    stopOnUnknown: true,
    tasks
  };
}

// [VXG RealForever]
