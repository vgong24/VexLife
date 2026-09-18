#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { buildGuideEffectFixturePlan, GUIDE_EFFECT_AUTHORITY_REF, GUIDE_EFFECT_FIXTURE_REF } from '../src/core/experience-review-effect-fixture.mjs';
import { classifyEffectFixtureGitHost } from '../src/core/experience-review-effect-fixture-host.mjs';
import { createBrowserExperienceReviewAdapter } from '../reference/browser/modules/experience-review-adapter.js';
import { createVexLifeBrowserServer } from './serve-browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MESSAGE_SELECTOR = '#guideMessages [data-component-ref="component.vexlife.guide-message"]';
const REFERENCE_BROWSER_PATH = '/reference/browser/';
const SOURCE_OWNED_REFERENCE_URL = 'http://127.0.0.1:0/reference/browser/';
const SOURCE_RUNTIME_SCOPES = Object.freeze(['reference/browser', 'blueprint']);

function usage() {
  console.error('Usage: node scripts/experience-review-effect-fixture.mjs --request <review-request.json> --bindings <browser-bindings.json> --out <directory>');
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

function gitText(...args) {
  return execFileSync('git', ['-C', ROOT, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function gitBuffer(...args) {
  return execFileSync('git', ['-C', ROOT, ...args], {
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function tryGitText(...args) {
  try {
    return gitText(...args);
  } catch {
    return '';
  }
}

function observeExactSource() {
  const testedCheckoutSha = gitText('rev-parse', 'HEAD');
  const testedCheckoutTreeSha = gitText('rev-parse', 'HEAD^{tree}');
  const commitObject = gitText('cat-file', '-p', testedCheckoutSha);
  const parentShas = commitObject
    .split(/\r?\n/u)
    .filter((line) => line.startsWith('parent '))
    .map((line) => line.slice('parent '.length));
  const attachedBranch = tryGitText('symbolic-ref', '--short', '-q', 'HEAD');
  const syntheticCandidateHeadSha = !attachedBranch && parentShas.length === 2
    ? parentShas[1]
    : '';
  const syntheticCandidateObjectType = syntheticCandidateHeadSha
    ? tryGitText('cat-file', '-t', syntheticCandidateHeadSha)
    : '';
  const syntheticCandidateHeadTreeSha = syntheticCandidateObjectType === 'commit'
    ? tryGitText('rev-parse', `${syntheticCandidateHeadSha}^{tree}`)
    : '';
  const workspaceRootMatches = !process.env.GITHUB_WORKSPACE
    || path.resolve(process.env.GITHUB_WORKSPACE) === ROOT;
  const host = classifyEffectFixtureGitHost({
    testedCheckoutSha,
    testedCheckoutTreeSha,
    parentShas,
    attachedBranch,
    environment: process.env,
    workspaceRootMatches,
    syntheticCandidateObjectType,
    syntheticCandidateHeadTreeSha
  });
  if (!host.executionAllowed) {
    throw new Error(`effect fixture exact candidate source is unavailable in ${host.hostClass}`);
  }
  if (host.candidateHeadTreeSha !== testedCheckoutTreeSha) {
    throw new Error(`effect fixture tested checkout tree is not exact candidate tree: ${testedCheckoutTreeSha}`);
  }
  return Object.freeze({
    bindingClass: 'GIT_OBSERVED_SOURCE_OWNED_REFERENCE_BROWSER',
    sourceVersionRef: `github.commit.vexlife.${host.candidateHeadSha}`,
    candidateHeadSha: host.candidateHeadSha,
    candidateHeadTreeSha: host.candidateHeadTreeSha,
    testedCheckoutSha,
    testedCheckoutTreeSha
  });
}

function observeSourceRuntimeBytes() {
  const status = gitText('status', '--porcelain=v1', '--untracked-files=all', '--', ...SOURCE_RUNTIME_SCOPES);
  if (status) {
    const first = status.split(/\r?\n/u)[0];
    throw new Error(`source-owned reference browser working tree is not exact current Git source: ${first}`);
  }
  const files = gitBuffer('ls-files', '-z', '--', ...SOURCE_RUNTIME_SCOPES)
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .sort();
  if (!files.length) throw new Error('source-owned reference browser runtime source set is empty');

  const aggregate = createHash('sha256');
  let totalBytes = 0;
  for (const relativePath of files) {
    const filePath = path.resolve(ROOT, relativePath);
    if (!filePath.startsWith(`${ROOT}${path.sep}`)) throw new Error('source-owned runtime path escaped repository root');
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`source-owned runtime path must be a regular file: ${relativePath}`);
    }
    const bytes = fs.readFileSync(filePath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    aggregate.update(relativePath, 'utf8');
    aggregate.update('\0');
    aggregate.update(String(bytes.length), 'utf8');
    aggregate.update('\0');
    aggregate.update(sha256, 'utf8');
    aggregate.update('\n');
    totalBytes += bytes.length;
  }
  return Object.freeze({
    bindingClass: 'GIT_CLEAN_WORKTREE_RAW_BYTE_FINGERPRINT',
    scopes: Object.freeze([...SOURCE_RUNTIME_SCOPES]),
    fileCount: files.length,
    totalBytes,
    sha256: aggregate.digest('hex')
  });
}

function requireRequestedSourceMatchesObserved(bundle, source) {
  if (bundle.reviewEpoch.sourceVersionRef !== source.sourceVersionRef) {
    throw new Error(`effect fixture sourceVersionRef is not exact current Git source: ${bundle.reviewEpoch.sourceVersionRef}`);
  }
}

async function listenSourceServer(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address !== 'object' || !Number.isInteger(address.port) || address.port < 1) {
    throw new Error('source-managed reference browser did not bind an exact loopback port');
  }
  return `http://127.0.0.1:${address.port}`;
}

function closeSourceServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function bindSourceOwnedRuntime(plan, pageUrl) {
  const binding = Object.freeze({ ...plan.binding, pageUrl });
  const task = Object.freeze({ ...plan.task, binding });
  return Object.freeze({
    ...plan,
    binding,
    task,
    pageOrigin: new URL(pageUrl).origin
  });
}

async function guideMessages(page, expectedIntentRef) {
  return page.locator(MESSAGE_SELECTOR).evaluateAll((nodes, intentRef) => nodes
    .filter((node) => node.dataset.intentRef === intentRef)
    .map((node) => ({
      kind: node.classList.contains('user') ? 'user' : node.classList.contains('guide') ? 'guide' : 'unknown',
      intentRef: node.dataset.intentRef ?? null,
      contentRef: node.dataset.contentRef ?? null
    })), expectedIntentRef);
}

async function waitForReferenceBrowserReady(page, plan) {
  const pageUrl = new URL(plan.binding.pageUrl);
  if (pageUrl.pathname !== REFERENCE_BROWSER_PATH) return false;
  try {
    await page.waitForFunction(
      ({ targetNodeRef, expectedIntentRef }) => {
        const app = globalThis.__VEXLIFE_APP__;
        const target = document.querySelector(`[data-node-ref="${CSS.escape(targetNodeRef)}"]`);
        return Boolean(
          app?.guide
          && typeof app.guide.askIntent === 'function'
          && target
          && target.dataset.guideIntentRef === expectedIntentRef
        );
      },
      {
        targetNodeRef: plan.targetNodeRef,
        expectedIntentRef: plan.observations.expectedIntentRef
      },
      { timeout: plan.binding.timeoutMs ?? 30_000 }
    );
  } catch {
    throw new Error('reference browser did not expose exact Guide app readiness before fixture execution');
  }
  return true;
}

async function installExactOriginNetworkMembrane(page, plan, sink, label) {
  await page.route('**/*', async (route) => {
    const requestUrl = route.request().url();
    let origin = null;
    try {
      origin = new URL(requestUrl).origin;
    } catch {
      // Non-URL requests are not admitted by this fixture.
    }
    if (origin !== plan.pageOrigin) {
      sink.blockedRequests.push({ label, requestUrl, origin });
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
}

function requireNoBlockedRequests(blockedRequests, label) {
  if (!blockedRequests.length) return;
  const first = blockedRequests[0];
  throw new Error(`${label} blocked an attempted escape from the isolated loopback origin: ${first.origin ?? 'NON_URL'}`);
}

function observedPage(page, plan, sink) {
  const originalGoto = page.goto.bind(page);
  const originalClose = page.close.bind(page);
  return new Proxy(page, {
    get(target, property) {
      if (property === 'goto') {
        return async (...args) => {
          const response = await originalGoto(...args);
          sink.referenceBrowserReady = await waitForReferenceBrowserReady(page, plan);
          sink.before = await guideMessages(page, plan.observations.expectedIntentRef);
          if (sink.before.length !== plan.observations.initialGuideMessageCount) {
            throw new Error(`effect fixture baseline Guide message count mismatch: ${sink.before.length}`);
          }
          return response;
        };
      }
      if (property === 'close') {
        return async (...args) => {
          try {
            sink.after = await guideMessages(page, plan.observations.expectedIntentRef);
          } catch (error) {
            sink.afterObservationError = error.message;
          }
          return originalClose(...args);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

function createObservedFixtureBrowserType(plan, sink) {
  return {
    async launch(launchOptions = {}) {
      const forbiddenLaunchFields = ['userDataDir', 'persistentUserDataDir', 'proxy'];
      for (const field of forbiddenLaunchFields) {
        if (launchOptions[field] !== undefined) throw new Error(`effect fixture launch option is forbidden: ${field}`);
      }
      const browser = await chromium.launch({ ...launchOptions, headless: true });
      const originalNewPage = browser.newPage.bind(browser);
      return new Proxy(browser, {
        get(target, property) {
          if (property === 'newPage') {
            return async (options) => {
              const page = await originalNewPage(options);
              page.on('request', (request) => sink.requests.push(request.url()));
              await installExactOriginNetworkMembrane(page, plan, sink, 'effect fixture browser');
              return observedPage(page, plan, sink);
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });
    }
  };
}

function requireSameLoopbackOrigin(requests, pageOrigin, label) {
  for (const requestUrl of requests) {
    let origin;
    try {
      origin = new URL(requestUrl).origin;
    } catch {
      throw new Error(`${label} observed a non-URL request`);
    }
    if (origin !== pageOrigin) throw new Error(`${label} escaped the isolated loopback origin: ${origin}`);
  }
}

function requirePostActionObservation(plan, sink) {
  if (sink.afterObservationError) throw new Error(`post-action Guide observation failed: ${sink.afterObservationError}`);
  if (!Array.isArray(sink.after)) throw new Error('post-action Guide observation is missing');
  if (sink.after.length !== plan.observations.postActionGuideMessageCount) {
    throw new Error(`post-action Guide message count mismatch: ${sink.after.length}`);
  }
  const expected = [
    {
      kind: 'user',
      intentRef: plan.observations.expectedIntentRef,
      contentRef: plan.observations.expectedPromptContentRef
    },
    {
      kind: 'guide',
      intentRef: plan.observations.expectedIntentRef,
      contentRef: plan.observations.expectedAnswerContentRef
    }
  ];
  if (JSON.stringify(sink.after) !== JSON.stringify(expected)) {
    throw new Error('post-action Guide record identity/content refs do not match fixture authority');
  }
}

async function proveFreshBrowserCleanup(plan) {
  const sink = { requests: [], blockedRequests: [] };
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: plan.binding.viewport });
    page.on('request', (request) => sink.requests.push(request.url()));
    await installExactOriginNetworkMembrane(page, plan, sink, 'cleanup browser');
    await page.goto(plan.binding.pageUrl, {
      waitUntil: plan.binding.waitUntil ?? 'load',
      timeout: plan.binding.timeoutMs ?? 30_000
    });
    await waitForReferenceBrowserReady(page, plan);
    const messages = await guideMessages(page, plan.observations.expectedIntentRef);
    requireNoBlockedRequests(sink.blockedRequests, 'cleanup browser');
    requireSameLoopbackOrigin(sink.requests, plan.pageOrigin, 'cleanup browser');
    if (messages.length !== plan.observations.initialGuideMessageCount) {
      throw new Error(`fresh-browser cleanup Guide message count mismatch: ${messages.length}`);
    }
    return {
      cleanupProof: plan.observations.cleanupProof,
      guideMessageCount: messages.length,
      requestCount: sink.requests.length,
      blockedRequestCount: sink.blockedRequests.length
    };
  } finally {
    await browser.close();
  }
}

function writeResult(out, result) {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'effect-fixture-result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

let out = null;
let sourceServer = null;
try {
  const args = parseArgs(process.argv.slice(2));
  if (!args.request || !args.bindings || !args.out) {
    usage();
    process.exitCode = 2;
  } else {
    out = path.resolve(args.out);
    const bundle = readJson(path.resolve(args.request));
    const bindingDocument = readJson(path.resolve(args.bindings));
    const bindings = Array.isArray(bindingDocument) ? bindingDocument : bindingDocument.browserBindings;
    const admittedPlan = buildGuideEffectFixturePlan(bundle, bindings, { root: ROOT });
    const sourceOwned = admittedPlan.binding.pageUrl === SOURCE_OWNED_REFERENCE_URL;
    let source = null;
    let sourceRuntime = null;
    let plan = admittedPlan;

    if (sourceOwned) {
      source = observeExactSource();
      requireRequestedSourceMatchesObserved(bundle, source);
      sourceRuntime = observeSourceRuntimeBytes();
      sourceServer = createVexLifeBrowserServer();
      const sourceOrigin = await listenSourceServer(sourceServer);
      plan = bindSourceOwnedRuntime(admittedPlan, `${sourceOrigin}${REFERENCE_BROWSER_PATH}`);
    }

    const sink = { before: null, after: null, afterObservationError: null, referenceBrowserReady: false, requests: [], blockedRequests: [] };
    const screenshotsDirectory = path.join(out, 'screenshots');
    const adapter = createBrowserExperienceReviewAdapter({
      browserType: createObservedFixtureBrowserType(plan, sink),
      settleMs: 0
    });
    const evidence = await adapter.captureTasks([plan.task], screenshotsDirectory);
    if (evidence.length !== 1 || evidence[0].captureState !== 'CAPTURED') {
      const deviations = Array.isArray(evidence[0]?.deviations) ? evidence[0].deviations.join(' | ') : '';
      throw new Error(`effect fixture adapter did not capture exact action: ${evidence[0]?.captureState ?? 'MISSING'}${deviations ? `: ${deviations}` : ''}`);
    }
    requireNoBlockedRequests(sink.blockedRequests, 'effect fixture browser');
    requireSameLoopbackOrigin(sink.requests, plan.pageOrigin, 'effect fixture browser');
    if (!Array.isArray(sink.before) || sink.before.length !== plan.observations.initialGuideMessageCount) {
      throw new Error('effect fixture baseline observation is missing or stale');
    }
    requirePostActionObservation(plan, sink);
    const cleanup = await proveFreshBrowserCleanup(plan);
    if (!sourceOwned || !source || !sourceRuntime) {
      throw new Error('external loopback fixture is adversarial-only and cannot produce PASS');
    }
    const result = {
      schemaVersion: 'vexlife.experience-review.effect-fixture-result/v1',
      state: 'PASS',
      reviewEpochRef: bundle.reviewEpoch.reviewEpochRef,
      sourceVersionRef: source.sourceVersionRef,
      source,
      sourceRuntime,
      planRef: plan.planRef,
      fixtureRef: plan.fixtureRef,
      effectAuthorityRef: plan.effectAuthorityRef,
      authorityFingerprint: plan.authorityFingerprint,
      authorityClass: plan.authorityClass,
      executionEffectPolicy: plan.executionEffectPolicy,
      platformRef: plan.platformRef,
      targetNodeRef: plan.targetNodeRef,
      actionRef: plan.actionRef,
      permissionRef: plan.permissionRef,
      admittedEffectClasses: plan.admittedEffectClasses,
      isolatedFixtureEffectAuthorized: true,
      productionEffectsAuthorized: false,
      externalEffectsAuthorized: false,
      before: {
        guideMessageCount: sink.before.length
      },
      after: {
        guideMessageCount: sink.after.length,
        records: sink.after
      },
      cleanup,
      network: {
        allowedOrigin: plan.pageOrigin,
        observedRequestCount: sink.requests.length,
        blockedRequestCount: sink.blockedRequests.length,
        escapedOrigin: false
      },
      adapterEvidenceRef: evidence[0].evidenceRef,
      adapterArtifact: evidence[0].artifact,
      rawPrivateContentLogged: false,
      outputDirectory: out
    };
    writeResult(out, result);
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  const result = {
    schemaVersion: 'vexlife.experience-review.effect-fixture-result/v1',
    state: 'FAILED_SAFE',
    fixtureRef: GUIDE_EFFECT_FIXTURE_REF,
    effectAuthorityRef: GUIDE_EFFECT_AUTHORITY_REF,
    reason: error.message,
    isolatedFixtureEffectAuthorized: false,
    productionEffectsAuthorized: false,
    externalEffectsAuthorized: false,
    rawPrivateContentLogged: false
  };
  if (out) {
    try { writeResult(out, result); } catch { /* preserve primary fail-closed result */ }
  }
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = 1;
} finally {
  if (sourceServer) await closeSourceServer(sourceServer);
}

// [VXG RealForever]
