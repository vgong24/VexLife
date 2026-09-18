import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadBlueprint } from './blueprint.mjs';
import { buildSparseBrowserCapturePlan, validateReviewRequestBundle } from './experience-review-kit.mjs';
import { semanticHash } from './utils.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '../..');

export const EFFECT_FIXTURE_AUTHORITY_SCHEMA = 'vexlife.experience-review.effect-fixture-authority/v1';
export const EFFECT_FIXTURE_REQUEST_SCHEMA = 'vexlife.experience-review.effect-fixture-request/v1';
export const GUIDE_EFFECT_FIXTURE_AUTHORITY_PATH = 'test/fixtures/experience-review-guide-local-append/authority.json';
export const GUIDE_EFFECT_FIXTURE_REF = 'fixture.vexlife.review.guide-transient-local-append.v1';
export const GUIDE_EFFECT_AUTHORITY_REF = 'authority.vexlife.review.guide-transient-local-append.v1';

const TOP_LEVEL_KEYS = Object.freeze([
  'actionRef',
  'admittedEffectClasses',
  'authorityClass',
  'effectAuthorityRef',
  'executionEffectPolicy',
  'fixtureRef',
  'isolation',
  'observations',
  'permissionRef',
  'platformRef',
  'schemaVersion',
  'targetNodeRef'
]);
const ISOLATION_KEYS = Object.freeze([
  'durableConversationWriteAllowed',
  'externalNetworkAllowed',
  'freshBrowserProcessRequired',
  'githubPublicEffectAllowed',
  'homeMemoryWriteAllowed',
  'modelInvocationAllowed',
  'persistentUserDataDirAllowed',
  'rawPrivateContentAllowed'
]);
const OBSERVATION_KEYS = Object.freeze([
  'cleanupProof',
  'expectedAnswerContentRef',
  'expectedIntentRef',
  'expectedPromptContentRef',
  'initialGuideMessageCount',
  'postActionGuideMessageCount'
]);
const POLICY_KEYS = Object.freeze([
  'captureRequestRef',
  'effectAuthorityRef',
  'executionEffectPolicy',
  'fixtureRef',
  'schemaVersion'
]);
const BINDING_KEYS = new Set([
  'artifactSlugs',
  'captureRequestRef',
  'fullPage',
  'pageUrl',
  'stepBindings',
  'timeoutMs',
  'viewport',
  'waitUntil'
]);

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function exactKeys(value, expected, label) {
  requireObject(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} fields must be exact: ${actual.join(', ')}`);
  }
}

function requireBoolean(value, label, expected) {
  if (value !== expected) throw new Error(`${label} must equal ${expected}`);
}

function singleByRef(items, field, ref, label) {
  const matches = (items ?? []).filter((item) => item?.[field] === ref);
  if (matches.length !== 1) throw new Error(`${label} must resolve exactly once: ${ref}`);
  return matches[0];
}

function exactGuideElement(blueprint, elementRef) {
  const matches = [];
  for (const screen of blueprint.screens ?? []) {
    for (const region of screen.regions ?? []) {
      for (const element of region.elements ?? []) {
        if (element.elementRef === elementRef) matches.push(element);
      }
    }
  }
  if (matches.length !== 1) throw new Error(`fixture target must resolve exactly once in current Blueprint: ${elementRef}`);
  return matches[0];
}

function validateAuthorityDescriptor(authority) {
  exactKeys(authority, TOP_LEVEL_KEYS, 'fixture authority');
  if (authority.schemaVersion !== EFFECT_FIXTURE_AUTHORITY_SCHEMA) throw new Error('fixture authority schema mismatch');
  if (authority.fixtureRef !== GUIDE_EFFECT_FIXTURE_REF) throw new Error('fixture authority fixtureRef mismatch');
  if (authority.effectAuthorityRef !== GUIDE_EFFECT_AUTHORITY_REF) throw new Error('fixture authority effectAuthorityRef mismatch');
  if (authority.authorityClass !== 'SOURCE_MANAGED_ISOLATED_REVIEW_FIXTURE') throw new Error('fixture authority class mismatch');
  if (authority.executionEffectPolicy !== 'ADMITTED_FIXTURE_EFFECTS') throw new Error('fixture authority must admit fixture effects explicitly');
  if (authority.platformRef !== 'platform.browser') throw new Error('fixture authority is browser-only');
  if (authority.targetNodeRef !== 'element.guide.ask-current') throw new Error('fixture authority target mismatch');
  if (authority.actionRef !== 'action.guide.ask') throw new Error('fixture authority action mismatch');
  if (authority.permissionRef !== 'permission.conversation.send') throw new Error('fixture authority permission mismatch');
  if (JSON.stringify(authority.admittedEffectClasses) !== JSON.stringify(['LOCAL_APPEND'])) {
    throw new Error('fixture authority must admit exactly LOCAL_APPEND');
  }

  exactKeys(authority.isolation, ISOLATION_KEYS, 'fixture authority isolation');
  requireBoolean(authority.isolation.freshBrowserProcessRequired, 'freshBrowserProcessRequired', true);
  for (const key of ISOLATION_KEYS.filter((item) => item !== 'freshBrowserProcessRequired')) {
    requireBoolean(authority.isolation[key], `fixture authority isolation.${key}`, false);
  }

  exactKeys(authority.observations, OBSERVATION_KEYS, 'fixture authority observations');
  if (authority.observations.initialGuideMessageCount !== 0) throw new Error('fixture baseline message count must be zero');
  if (authority.observations.postActionGuideMessageCount !== 2) throw new Error('fixture post-action message count must be two');
  if (authority.observations.expectedIntentRef !== 'intent.guide.current') throw new Error('fixture intent mismatch');
  if (authority.observations.expectedPromptContentRef !== 'guide.ask.current') throw new Error('fixture prompt mismatch');
  if (authority.observations.expectedAnswerContentRef !== 'guide.answer.current') throw new Error('fixture answer mismatch');
  if (authority.observations.cleanupProof !== 'FRESH_BROWSER_CONTEXT_ZERO_PRIOR_GUIDE_RECORDS') throw new Error('fixture cleanup contract mismatch');
  return authority;
}

export function loadGuideEffectFixtureAuthority(root = DEFAULT_ROOT) {
  const filePath = path.join(root, GUIDE_EFFECT_FIXTURE_AUTHORITY_PATH);
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('fixture authority must be one regular source-managed file');
  return validateAuthorityDescriptor(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

function validateCurrentBlueprintAuthority(blueprint, authority) {
  const action = singleByRef(blueprint.actions, 'actionRef', authority.actionRef, 'fixture action');
  if (action.permissionRef !== authority.permissionRef) throw new Error(`current action permission drift: ${action.permissionRef}`);
  if (action.effectClass !== authority.admittedEffectClasses[0]) throw new Error(`current action effect drift: ${action.effectClass}`);

  const element = exactGuideElement(blueprint, authority.targetNodeRef);
  if (element.actionRef !== authority.actionRef) throw new Error(`current fixture element action drift: ${element.actionRef}`);
  if (element.permissionRef !== authority.permissionRef) throw new Error(`current fixture element permission drift: ${element.permissionRef}`);
  return { action, element };
}

function validatePolicy(validated, authority) {
  const policy = requireObject(validated.reviewPlan.effectFixture, 'reviewPlan.effectFixture');
  exactKeys(policy, POLICY_KEYS, 'reviewPlan.effectFixture');
  if (policy.schemaVersion !== EFFECT_FIXTURE_REQUEST_SCHEMA) throw new Error('effect fixture request schema mismatch');
  if (policy.fixtureRef !== authority.fixtureRef) throw new Error('effect fixture request fixtureRef does not match source-managed authority');
  if (policy.effectAuthorityRef !== authority.effectAuthorityRef) throw new Error('effect fixture request effectAuthorityRef does not match source-managed authority');
  if (policy.executionEffectPolicy !== authority.executionEffectPolicy) throw new Error('effect fixture request executionEffectPolicy mismatch');
  if (!validated.reviewRequest.captureRequestRefs.includes(policy.captureRequestRef)) throw new Error('effect fixture captureRequestRef is not admitted by reviewRequest');
  if (validated.reviewRequest.captureRequestRefs.length !== 1) throw new Error('effect fixture request must admit exactly one capture request');
  return policy;
}

function validateCapture(validated, policy, authority) {
  const capture = validated.captureByRef.get(policy.captureRequestRef);
  if (!capture) throw new Error(`unknown effect fixture capture request: ${policy.captureRequestRef}`);
  if (capture.platformRef !== authority.platformRef) throw new Error(`effect fixture platform drift: ${capture.platformRef}`);
  if (capture.steps.length !== 1 || capture.captureAtStepRefs.length !== 1) throw new Error('effect fixture capture must contain exactly one executed/captured step');
  const step = capture.steps[0];
  if (capture.captureAtStepRefs[0] !== step.reviewStepRef) throw new Error('effect fixture must capture the exact only step');
  if (step.actionRef !== authority.actionRef) throw new Error(`effect fixture action drift: ${step.actionRef}`);
  if (step.targetNodeRef !== authority.targetNodeRef) throw new Error(`effect fixture target drift: ${step.targetNodeRef}`);
  return { capture, step };
}

function loopbackUrl(value) {
  let parsed;
  try {
    parsed = new URL(requireString(value, 'browser binding pageUrl'));
  } catch (error) {
    throw new Error(`effect fixture pageUrl is invalid: ${error.message}`);
  }
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !parsed.port || parsed.username || parsed.password) {
    throw new Error('effect fixture pageUrl must be an unauthenticated http://127.0.0.1:<port>/ loopback URL');
  }
  return parsed;
}

function validateBinding(bindings, capture, step) {
  if (!Array.isArray(bindings) || bindings.length !== 1) throw new Error('effect fixture requires exactly one browser binding');
  const binding = requireObject(bindings[0], 'browser binding');
  const unsupported = Object.keys(binding).filter((key) => !BINDING_KEYS.has(key));
  if (unsupported.length) throw new Error(`effect fixture browser binding contains unsupported field: ${unsupported[0]}`);
  if (binding.captureRequestRef !== capture.captureRequestRef) throw new Error('effect fixture browser binding captureRequestRef mismatch');
  if (!binding.viewport || !Number.isInteger(binding.viewport.width) || binding.viewport.width < 1 || !Number.isInteger(binding.viewport.height) || binding.viewport.height < 1) {
    throw new Error('effect fixture viewport must contain positive integer width and height');
  }
  if (binding.timeoutMs !== undefined && (!Number.isInteger(binding.timeoutMs) || binding.timeoutMs < 1 || binding.timeoutMs > 30_000)) {
    throw new Error('effect fixture timeoutMs must be an integer from 1 through 30000');
  }
  const stepBindings = requireObject(binding.stepBindings, 'browser binding stepBindings');
  if (JSON.stringify(Object.keys(stepBindings)) !== JSON.stringify([step.reviewStepRef])) throw new Error('effect fixture stepBindings must bind exactly the only review step');
  const operation = requireObject(stepBindings[step.reviewStepRef], 'effect fixture step binding');
  exactKeys(operation, ['kind'], 'effect fixture step binding');
  if (operation.kind !== 'CLICK_STABLE_TARGET') throw new Error('effect fixture step binding must be CLICK_STABLE_TARGET');
  const artifactSlugs = requireObject(binding.artifactSlugs, 'browser binding artifactSlugs');
  if (JSON.stringify(Object.keys(artifactSlugs)) !== JSON.stringify([step.reviewStepRef])) throw new Error('effect fixture artifactSlugs must bind exactly the only review step');
  requireString(artifactSlugs[step.reviewStepRef], 'effect fixture artifact slug');
  const pageUrl = loopbackUrl(binding.pageUrl);
  return { binding, pageUrl };
}

export function buildGuideEffectFixturePlan(bundle, bindings, { root = DEFAULT_ROOT, blueprint = null } = {}) {
  const authority = loadGuideEffectFixtureAuthority(root);
  const validated = validateReviewRequestBundle(bundle);
  const policy = validatePolicy(validated, authority);
  const currentBlueprint = blueprint ?? loadBlueprint(root).blueprint;
  validateCurrentBlueprintAuthority(currentBlueprint, authority);
  const { capture, step } = validateCapture(validated, policy, authority);
  const { binding, pageUrl } = validateBinding(bindings, capture, step);
  const sparse = buildSparseBrowserCapturePlan(bundle, bindings);
  if (sparse.tasks.length !== 1) throw new Error('effect fixture sparse plan must contain exactly one task');
  return Object.freeze({
    schemaVersion: 'vexlife.experience-review.effect-fixture-plan/v1',
    planRef: `effect-fixture-plan.${validated.reviewRequest.reviewRequestRef}.${semanticHash(authority).slice(0, 16)}`,
    executionEffectPolicy: authority.executionEffectPolicy,
    fixtureRef: authority.fixtureRef,
    effectAuthorityRef: authority.effectAuthorityRef,
    authorityClass: authority.authorityClass,
    authorityFingerprint: semanticHash(authority),
    platformRef: authority.platformRef,
    targetNodeRef: authority.targetNodeRef,
    actionRef: authority.actionRef,
    permissionRef: authority.permissionRef,
    admittedEffectClasses: Object.freeze([...authority.admittedEffectClasses]),
    isolation: Object.freeze(structuredClone(authority.isolation)),
    observations: Object.freeze(structuredClone(authority.observations)),
    pageOrigin: pageUrl.origin,
    binding,
    task: sparse.tasks[0]
  });
}

// [VXG RealForever]
