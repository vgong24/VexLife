#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { buildReviewPackageTextFiles, validateReviewRequestBundle } from '../src/core/experience-review-kit.mjs';
import {
  buildSeededNoEffectBrowserCapturePlan,
  seededTimeBudgetRemaining
} from '../src/core/experience-review-seeded.mjs';
import { createBrowserExperienceReviewAdapter } from '../reference/browser/modules/experience-review-adapter.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
  console.error('Usage: node scripts/experience-review-seeded.mjs --request <review-request.json> --bindings <browser-bindings.json> --out <directory>');
}

function parseArgs(argv) {
  const result = {};
  const known = new Set(['request', 'bindings', 'out']);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) throw new Error(`Unexpected positional argument: ${arg}`);
    const key = arg.slice(2);
    if (!known.has(key)) throw new Error(`Unknown argument: --${key}`);
    if (Object.hasOwn(result, key)) throw new Error(`Duplicate argument: --${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    result[key] = value;
    index += 1;
  }
  return result;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeFiles(root, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

function artifactLocationsFor(tasks, evidence) {
  const taskByBinding = new Map(tasks.map((task) => [
    `${task.captureRequest.captureRequestRef}\u0000${task.step.reviewStepRef}`,
    task
  ]));
  const locations = {};
  for (const record of evidence) {
    if (record.captureState !== 'CAPTURED' || !record.artifact?.artifactRef) continue;
    const task = taskByBinding.get(`${record.captureRequestRef}\u0000${record.reviewStepRef}`);
    if (!task) throw new Error(`Captured evidence has no seeded browser task binding: ${record.evidenceRef}`);
    locations[record.artifact.artifactRef] = path.posix.join('screenshots', task.artifactFileName);
  }
  return locations;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (!args.request || !args.bindings || !args.out) {
    usage();
    process.exitCode = 2;
  } else {
    const requestPath = path.resolve(args.request);
    const bindingsPath = path.resolve(args.bindings);
    const out = path.resolve(args.out);
    const bundle = readJson(requestPath);
    const bindingsDocument = readJson(bindingsPath);
    const browserBindings = Array.isArray(bindingsDocument) ? bindingsDocument : bindingsDocument.browserBindings;
    validateReviewRequestBundle(bundle);
    const current = loadBlueprint(ROOT);
    const plan = buildSeededNoEffectBrowserCapturePlan(bundle, browserBindings, current.blueprint.actions);
    const screenshotsDirectory = path.join(out, 'screenshots');
    const evidence = [];
    const executedStepRefs = [];
    const startedAtMs = Date.now();
    let stopReason = null;

    for (const task of plan.tasks) {
      const remainingMs = seededTimeBudgetRemaining(startedAtMs, plan.timeBudgetMs);
      if (remainingMs <= 0) {
        stopReason = 'TIME_BUDGET_EXHAUSTED';
        break;
      }
      const existingTimeout = Number.isInteger(task.binding.timeoutMs) && task.binding.timeoutMs > 0
        ? task.binding.timeoutMs
        : 30_000;
      const boundedTask = {
        ...task,
        binding: {
          ...task.binding,
          timeoutMs: Math.max(1, Math.min(existingTimeout, remainingMs))
        }
      };
      const adapter = createBrowserExperienceReviewAdapter();
      const records = await adapter.captureTasks([boundedTask], screenshotsDirectory);
      evidence.push(...records);
      executedStepRefs.push(task.step.reviewStepRef);
      if (records.some((record) => record.captureState !== 'CAPTURED')) {
        stopReason = 'CAPTURE_FAILED_SAFE';
        break;
      }
    }

    const artifactLocations = artifactLocationsFor(plan.tasks, evidence);
    const sourceReceipt = bundle.sourceReceipt ?? {
      schemaVersion: 'vexlife.experience-review.source-receipt/v0',
      reviewEpochRef: bundle.reviewEpoch.reviewEpochRef,
      sourceVersionRef: bundle.reviewEpoch.sourceVersionRef,
      truthClass: bundle.reviewEpoch.truthClass,
      receiptClass: 'REQUEST_DECLARED_SOURCE_VERSION',
      runtimeProof: false
    };
    writeFiles(out, buildReviewPackageTextFiles(bundle, evidence, sourceReceipt, {
      artifactLocations,
      interactiveEntries: bundle.package?.interactiveEntries ?? []
    }));

    const capturedCount = evidence.filter((record) => record.captureState === 'CAPTURED').length;
    const unsupportedCount = evidence.filter((record) => record.captureState === 'UNSUPPORTED').length;
    const failedSafeCount = evidence.filter((record) => record.captureState === 'FAILED_SAFE').length;
    const allSelectedExecuted = executedStepRefs.length === plan.selectedStepRefs.length;
    const allCaptured = allSelectedExecuted && capturedCount === plan.selectedStepRefs.length && unsupportedCount === 0 && failedSafeCount === 0;
    const state = allCaptured
      ? 'PASS'
      : stopReason === 'TIME_BUDGET_EXHAUSTED'
        ? 'HELD'
        : capturedCount > 0
          ? 'PARTIAL'
          : 'FAILED_SAFE';
    const result = {
      schemaVersion: 'vexlife.experience-review.seeded-cli-result/v1',
      state,
      reviewEpochRef: bundle.reviewEpoch.reviewEpochRef,
      planRef: plan.planRef,
      executionEffectPolicy: plan.executionEffectPolicy,
      reproducibleSeed: plan.reproducibleSeed,
      stepBudget: plan.stepBudget,
      timeBudgetMs: plan.timeBudgetMs,
      selectedStepRefs: plan.selectedStepRefs,
      executedStepRefs,
      admittedActionRefs: plan.admittedActionRefs,
      forbiddenEffectClasses: plan.forbiddenEffectClasses,
      stopReason,
      capturedCount,
      unsupportedCount,
      failedSafeCount,
      externalEffectsAuthorized: false,
      effectAuthorityRef: null,
      fixtureRef: null,
      rawPrivateLogging: false,
      outputDirectory: out
    };
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'seeded-result.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
    if (state !== 'PASS') process.exitCode = 1;
  }
} catch (error) {
  console.error(JSON.stringify({
    schemaVersion: 'vexlife.experience-review.seeded-cli-result/v1',
    state: 'FAILED_SAFE',
    reason: error.message,
    externalEffectsAuthorized: false
  }, null, 2));
  process.exitCode = 1;
}

// [VXG RealForever]
