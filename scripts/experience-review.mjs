#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  buildReviewPackageTextFiles,
  buildSparseBrowserCapturePlan,
  validateReviewRequestBundle
} from '../src/core/experience-review-kit.mjs';
import { createBrowserExperienceReviewAdapter } from '../reference/browser/modules/experience-review-adapter.js';

function usage() {
  console.error('Usage: node scripts/experience-review.mjs --request <review-request.json> --bindings <browser-bindings.json> --out <directory>');
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

function artifactLocationsFor(capturePlan, evidence) {
  const taskByEvidenceBinding = new Map(capturePlan.tasks.map((task) => [
    `${task.captureRequest.captureRequestRef}\u0000${task.step.reviewStepRef}`,
    task
  ]));
  const locations = {};
  for (const record of evidence) {
    if (record.captureState !== 'CAPTURED' || !record.artifact?.artifactRef) continue;
    const task = taskByEvidenceBinding.get(`${record.captureRequestRef}\u0000${record.reviewStepRef}`);
    if (!task) throw new Error(`Captured evidence has no local browser task binding: ${record.evidenceRef}`);
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
    const capturePlan = buildSparseBrowserCapturePlan(bundle, browserBindings);
    const screenshotsDirectory = path.join(out, 'screenshots');
    const adapter = createBrowserExperienceReviewAdapter();
    const evidence = await adapter.captureTasks(capturePlan.tasks, screenshotsDirectory);
    const artifactLocations = artifactLocationsFor(capturePlan, evidence);

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

    const result = {
      schemaVersion: 'vexlife.experience-review.cli-result/v0',
      state: evidence.every((record) => record.captureState === 'CAPTURED')
        ? 'PASS'
        : evidence.some((record) => record.captureState === 'CAPTURED')
          ? 'PARTIAL'
          : 'FAILED_SAFE',
      reviewEpochRef: bundle.reviewEpoch.reviewEpochRef,
      planRef: capturePlan.planRef,
      automaticCartesianExpansion: capturePlan.automaticCartesianExpansion,
      captureTaskCount: capturePlan.tasks.length,
      capturedCount: evidence.filter((record) => record.captureState === 'CAPTURED').length,
      unsupportedCount: evidence.filter((record) => record.captureState === 'UNSUPPORTED').length,
      failedSafeCount: evidence.filter((record) => record.captureState === 'FAILED_SAFE').length,
      outputDirectory: out
    };
    fs.writeFileSync(path.join(out, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
    if (result.state === 'FAILED_SAFE') process.exitCode = 1;
  }
} catch (error) {
  console.error(JSON.stringify({
    schemaVersion: 'vexlife.experience-review.cli-result/v0',
    state: 'FAILED_SAFE',
    reason: error.message
  }, null, 2));
  process.exitCode = 1;
}

// [VXG RealForever]
