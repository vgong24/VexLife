import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadBlueprint } from '../src/core/blueprint.mjs';
import {
  buildGuideEffectFixturePlan,
  EFFECT_FIXTURE_REQUEST_SCHEMA,
  GUIDE_EFFECT_AUTHORITY_REF,
  GUIDE_EFFECT_FIXTURE_REF
} from '../src/core/experience-review-effect-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CURRENT_BLUEPRINT = loadBlueprint(ROOT).blueprint;
const STEP_REF = 'review-step.effect-fixture.guide-current';
const CAPTURE_REF = 'capture.effect-fixture.guide-current';
const SOURCE_OWNED_REFERENCE_URL = 'http://127.0.0.1:0/reference/browser/';

function gitText(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function tryGitText(root, ...args) {
  try {
    return gitText(root, ...args);
  } catch {
    return '';
  }
}

function gitSource(root = ROOT) {
  const testedCheckoutSha = gitText(root, 'rev-parse', 'HEAD');
  const testedCheckoutTreeSha = gitText(root, 'rev-parse', 'HEAD^{tree}');
  const parentShas = gitText(root, 'cat-file', '-p', testedCheckoutSha)
    .split(/\r?\n/u)
    .filter((line) => line.startsWith('parent '))
    .map((line) => line.slice('parent '.length));
  const attachedBranch = tryGitText(root, 'symbolic-ref', '--short', '-q', 'HEAD');
  const candidateHeadSha = !attachedBranch && parentShas.length === 2
    ? parentShas[1]
    : testedCheckoutSha;
  return {
    sourceVersionRef: `github.commit.vexlife.${candidateHeadSha}`,
    candidateHeadSha,
    testedCheckoutSha,
    testedCheckoutTreeSha
  };
}

function requestBundle({ sourceVersionRef = gitSource(ROOT).sourceVersionRef } = {}) {
  return {
    schemaVersion: 'vexlife.experience-review.request/v0',
    portableContractRef: 'contract.vextreme.experience-review.portable.v0',
    portableSchemaVersionRef: 'vextreme.experience-review.portable-contract/v0',
    reviewEpoch: {
      reviewEpochRef: 'epoch.effect-fixture.test',
      reviewPlanRef: 'plan.effect-fixture.test',
      reviewRequestRef: 'request.effect-fixture.test',
      sourceVersionRef,
      truthClass: 'CURRENT_ACCEPTED_IMPLEMENTATION',
      state: 'PLANNED'
    },
    reviewPlan: {
      reviewPlanRef: 'plan.effect-fixture.test',
      purpose: 'Isolated Guide LOCAL_APPEND effect proof',
      experienceProfileRefs: ['experience.vexlife.companionship-simple'],
      reviewCaseRefs: ['case.effect-fixture.guide-current'],
      lensRefs: ['lens.vexlife.usability-and-journey'],
      humanBurden: 'NATURAL_REACTION_OR_QUESTION',
      effectFixture: {
        schemaVersion: EFFECT_FIXTURE_REQUEST_SCHEMA,
        captureRequestRef: CAPTURE_REF,
        fixtureRef: GUIDE_EFFECT_FIXTURE_REF,
        effectAuthorityRef: GUIDE_EFFECT_AUTHORITY_REF,
        executionEffectPolicy: 'ADMITTED_FIXTURE_EFFECTS'
      }
    },
    reviewRequest: {
      reviewRequestRef: 'request.effect-fixture.test',
      reviewEpochRef: 'epoch.effect-fixture.test',
      reviewCaseRefs: ['case.effect-fixture.guide-current'],
      captureRequestRefs: [CAPTURE_REF],
      comparisonMode: 'BASELINE_ONLY'
    },
    reviewCases: [{
      reviewCaseRef: 'case.effect-fixture.guide-current',
      title: 'Guide current-context isolated append',
      featureOrJourneyRef: 'screen.vexlife.guide-overlay',
      whyItMatters: 'Prove the first admitted Review fixture effect without durable user-state escape.',
      reviewQuestion: 'Does the exact Guide current intent append only transient fixture records and clean up?',
      truthClass: 'CURRENT_ACCEPTED_IMPLEMENTATION',
      startingStateRef: 'state.navigation',
      routeRef: 'route.guide-overlay',
      reviewStepRefs: [STEP_REF],
      knownLimitations: [],
      doesNotProve: ['Production conversation-send authority', 'Native-platform behavior', 'Human acceptance']
    }],
    captureRequests: [{
      captureRequestRef: CAPTURE_REF,
      reviewEpochRef: 'epoch.effect-fixture.test',
      reviewCaseRef: 'case.effect-fixture.guide-current',
      platformRef: 'platform.browser',
      experienceProfileRef: 'experience.vexlife.companionship-simple',
      routeRef: 'route.guide-overlay',
      initialStateRef: 'state.navigation',
      localeRef: 'locale.en',
      themeRef: 'theme.foundation',
      deviceProfileRef: 'device.browser.desktop.reference',
      sourceVersionRef,
      truthClass: 'CURRENT_ACCEPTED_IMPLEMENTATION',
      steps: [{
        reviewStepRef: STEP_REF,
        sequence: 0,
        actionRef: 'action.guide.ask',
        targetNodeRef: 'element.guide.ask-current',
        expectedStateRef: 'state.selection'
      }],
      captureAtStepRefs: [STEP_REF],
      reviewOverlay: { highlightTarget: false, showStableRef: false, showAction: false }
    }],
    package: { title: 'Guide effect fixture test' }
  };
}

function binding(pageUrl = SOURCE_OWNED_REFERENCE_URL) {
  return [{
    captureRequestRef: CAPTURE_REF,
    pageUrl,
    viewport: { width: 1440, height: 900 },
    stepBindings: {
      [STEP_REF]: { kind: 'CLICK_STABLE_TARGET' }
    },
    artifactSlugs: {
      [STEP_REF]: 'guide-effect-fixture'
    },
    timeoutMs: 15_000
  }];
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runFixtureCli(request, browserBindings, workspace, root = ROOT) {
  const requestPath = path.join(workspace, 'request.json');
  const bindingsPath = path.join(workspace, 'bindings.json');
  const out = path.join(workspace, 'out');
  writeJson(requestPath, request);
  writeJson(bindingsPath, { browserBindings });
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      'scripts/experience-review-effect-fixture.mjs',
      '--request', requestPath,
      '--bindings', bindingsPath,
      '--out', out
    ], {
      cwd: root,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr, out }));
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(typeof address, 'object');
  return `http://127.0.0.1:${address.port}`;
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function recordMarkup(record) {
  return `<div class="guide-message ${record.kind}" data-component-ref="component.vexlife.guide-message" data-intent-ref="${record.intentRef}" data-content-ref="${record.contentRef}">${record.contentRef}</div>`;
}

const CURRENT_RECORDS = Object.freeze([
  { kind: 'user', intentRef: 'intent.guide.current', contentRef: 'guide.ask.current' },
  { kind: 'guide', intentRef: 'intent.guide.current', contentRef: 'guide.answer.current' }
]);

function effectFixtureHtml({ initialRecords = [], clickRecords = CURRENT_RECORDS, spoofReferenceReady = false } = {}) {
  return `<!doctype html><html><body>
    <div id="guideMessages">${initialRecords.map(recordMarkup).join('')}</div>
    <button data-node-ref="element.guide.ask-current" data-guide-intent-ref="intent.guide.current">Ask current</button>
    <script>
      ${spoofReferenceReady ? "globalThis.__VEXLIFE_APP__ = { guide: { askIntent() {} } };" : ''}
      const records = ${JSON.stringify(clickRecords)};
      document.querySelector('[data-node-ref="element.guide.ask-current"]').addEventListener('click', () => {
        const host = document.getElementById('guideMessages');
        for (const record of records) {
          const node = document.createElement('div');
          node.className = 'guide-message ' + record.kind;
          node.dataset.componentRef = 'component.vexlife.guide-message';
          node.dataset.intentRef = record.intentRef;
          node.dataset.contentRef = record.contentRef;
          node.textContent = record.contentRef;
          host.append(node);
        }
      });
    </script>
  </body></html>`;
}

function onePageServer(htmlFactory) {
  return http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(htmlFactory(request));
  });
}

function tempWorkspace(t, prefix) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  return workspace;
}

function disposableWorktree(t, prefix, mutate) {
  const holder = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const worktree = path.join(holder, 'repo');
  execFileSync('git', ['worktree', 'add', '--detach', worktree, 'HEAD'], {
    cwd: ROOT,
    stdio: 'ignore'
  });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(worktree, 'node_modules'), 'dir');
  mutate(worktree);
  t.after(() => {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', worktree], { cwd: ROOT, stdio: 'ignore' });
    } finally {
      fs.rmSync(holder, { recursive: true, force: true });
    }
  });
  return worktree;
}

function mutateGuideAction(root, mutate) {
  const filePath = path.join(root, 'blueprint/fragments/actions.json');
  const actions = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const action = actions.find((item) => item.actionRef === 'action.guide.ask');
  assert.ok(action, 'expected action.guide.ask in source-managed action registry');
  mutate(action);
  writeJson(filePath, actions);
}

function mutateFixtureAuthority(root, mutate) {
  const filePath = path.join(root, 'test/fixtures/experience-review-guide-local-append/authority.json');
  const authority = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  mutate(authority);
  writeJson(filePath, authority);
}

function parseResult(execution) {
  assert.ok(execution.stdout.trim(), execution.stderr);
  return JSON.parse(execution.stdout);
}

test('effect fixture plan binds exact source-managed authority and rejects current Blueprint permission/effect drift', () => {
  const current = buildGuideEffectFixturePlan(requestBundle(), binding(), { root: ROOT, blueprint: CURRENT_BLUEPRINT });
  assert.equal(current.fixtureRef, GUIDE_EFFECT_FIXTURE_REF);
  assert.equal(current.effectAuthorityRef, GUIDE_EFFECT_AUTHORITY_REF);
  assert.deepEqual(current.admittedEffectClasses, ['LOCAL_APPEND']);
  assert.equal(current.actionRef, 'action.guide.ask');
  assert.equal(current.permissionRef, 'permission.conversation.send');
  assert.equal(current.task.step.targetNodeRef, 'element.guide.ask-current');

  const permissionDrift = structuredClone(CURRENT_BLUEPRINT);
  permissionDrift.actions.find((item) => item.actionRef === 'action.guide.ask').permissionRef = 'permission.none';
  assert.throws(
    () => buildGuideEffectFixturePlan(requestBundle(), binding(), { root: ROOT, blueprint: permissionDrift }),
    /current action permission drift/
  );

  const effectDrift = structuredClone(CURRENT_BLUEPRINT);
  effectDrift.actions.find((item) => item.actionRef === 'action.guide.ask').effectClass = 'NETWORK_EFFECT';
  assert.throws(
    () => buildGuideEffectFixturePlan(requestBundle(), binding(), { root: ROOT, blueprint: effectDrift }),
    /current action effect drift/
  );

  const elementDrift = structuredClone(CURRENT_BLUEPRINT);
  for (const screen of elementDrift.screens) for (const region of screen.regions) {
    const element = region.elements.find((item) => item.elementRef === 'element.guide.ask-current');
    if (element) element.permissionRef = 'permission.none';
  }
  assert.throws(
    () => buildGuideEffectFixturePlan(requestBundle(), binding(), { root: ROOT, blueprint: elementDrift }),
    /current fixture element permission drift/
  );
});

test('effect fixture CLI fails closed on authority, action, source, platform and browser-binding widening before execution', async (t) => {
  const cases = [];

  const wrongFixture = requestBundle();
  wrongFixture.reviewPlan.effectFixture.fixtureRef = 'fixture.vexlife.review.wrong';
  cases.push(['wrong fixtureRef', wrongFixture, binding()]);

  const wrongAuthority = requestBundle();
  wrongAuthority.reviewPlan.effectFixture.effectAuthorityRef = 'authority.vexlife.review.wrong';
  cases.push(['wrong effectAuthorityRef', wrongAuthority, binding()]);

  const actionDrift = requestBundle();
  actionDrift.captureRequests[0].steps[0].actionRef = 'action.thread.select';
  cases.push(['action drift', actionDrift, binding()]);

  const wrongSource = requestBundle({ sourceVersionRef: `github.commit.vexlife.${'0'.repeat(40)}` });
  cases.push(['caller source substitution', wrongSource, binding()]);

  const native = requestBundle();
  native.captureRequests[0].platformRef = 'platform.windows';
  cases.push(['native platform substitution', native, binding()]);

  const persistent = binding();
  persistent[0].persistentUserDataDir = '/tmp/not-admitted';
  cases.push(['persistent browser state', requestBundle(), persistent]);

  cases.push(['non-loopback URL', requestBundle(), binding('https://example.invalid/reference/browser/')]);

  for (const [name, request, bindings] of cases) {
    const workspace = tempWorkspace(t, `vexlife-effect-fixture-hostile-${name.replaceAll(' ', '-')}-`);
    const execution = await runFixtureCli(request, bindings, workspace);
    assert.equal(execution.code, 1, `${name}: ${execution.stdout || execution.stderr}`);
    assert.equal(execution.signal, null);
    const result = parseResult(execution);
    assert.equal(result.state, 'FAILED_SAFE', name);
    assert.equal(result.isolatedFixtureEffectAuthorized, false, name);
    assert.equal(result.productionEffectsAuthorized, false, name);
    assert.equal(result.externalEffectsAuthorized, false, name);
  }
});

test('actual fixture CLI rejects source-managed permission, effect-class and extra-effect drift', { timeout: 60_000 }, async (t) => {
  const cases = [
    {
      name: 'permission-drift',
      mutate(root) { mutateGuideAction(root, (action) => { action.permissionRef = 'permission.none'; }); },
      expected: /current action permission drift/
    },
    {
      name: 'effect-class-drift',
      mutate(root) { mutateGuideAction(root, (action) => { action.effectClass = 'NETWORK_EFFECT'; }); },
      expected: /current action effect drift/
    },
    {
      name: 'extra-effect-class',
      mutate(root) { mutateFixtureAuthority(root, (authority) => { authority.admittedEffectClasses = ['LOCAL_APPEND', 'NETWORK_EFFECT']; }); },
      expected: /fixture authority must admit exactly LOCAL_APPEND/
    }
  ];

  for (const item of cases) {
    const root = disposableWorktree(t, `vexlife-effect-fixture-${item.name}-`, item.mutate);
    const workspace = tempWorkspace(t, `vexlife-effect-fixture-${item.name}-run-`);
    const execution = await runFixtureCli(requestBundle(), binding(), workspace, root);
    assert.equal(execution.code, 1, `${item.name}: ${execution.stdout || execution.stderr}`);
    const result = parseResult(execution);
    assert.equal(result.state, 'FAILED_SAFE');
    assert.match(result.reason, item.expected);
    assert.equal(result.isolatedFixtureEffectAuthorized, false);
  }
});

test('effect fixture CLI executes the source-owned real browser Guide LOCAL_APPEND and proves fresh-browser cleanup', { timeout: 120_000 }, async (t) => {
  const workspace = tempWorkspace(t, 'vexlife-effect-fixture-real-');
  const expectedSource = gitSource(ROOT);
  const execution = await runFixtureCli(requestBundle({ sourceVersionRef: expectedSource.sourceVersionRef }), binding(), workspace);
  assert.equal(execution.code, 0, execution.stderr || execution.stdout);
  assert.equal(execution.signal, null);
  const result = parseResult(execution);
  assert.equal(result.state, 'PASS');
  assert.equal(result.fixtureRef, GUIDE_EFFECT_FIXTURE_REF);
  assert.equal(result.effectAuthorityRef, GUIDE_EFFECT_AUTHORITY_REF);
  assert.equal(result.executionEffectPolicy, 'ADMITTED_FIXTURE_EFFECTS');
  assert.deepEqual(result.admittedEffectClasses, ['LOCAL_APPEND']);
  assert.equal(result.sourceVersionRef, expectedSource.sourceVersionRef);
  assert.equal(result.source.bindingClass, 'GIT_OBSERVED_SOURCE_OWNED_REFERENCE_BROWSER');
  assert.equal(result.source.candidateHeadSha, expectedSource.candidateHeadSha);
  assert.equal(result.source.testedCheckoutSha, expectedSource.testedCheckoutSha);
  assert.equal(result.source.testedCheckoutTreeSha, expectedSource.testedCheckoutTreeSha);
  assert.equal(result.before.guideMessageCount, 0);
  assert.equal(result.after.guideMessageCount, 2);
  assert.deepEqual(result.after.records, CURRENT_RECORDS);
  assert.equal(result.cleanup.guideMessageCount, 0);
  assert.equal(result.cleanup.cleanupProof, 'FRESH_BROWSER_CONTEXT_ZERO_PRIOR_GUIDE_RECORDS');
  assert.equal(result.network.escapedOrigin, false);
  assert.equal(result.isolatedFixtureEffectAuthorized, true);
  assert.equal(result.productionEffectsAuthorized, false);
  assert.equal(result.externalEffectsAuthorized, false);
  assert.equal(result.adapterArtifact.mediaType, 'image/png');
  assert.match(result.adapterArtifact.sha256, /^[0-9a-f]{64}$/);
  const retained = JSON.parse(fs.readFileSync(path.join(execution.out, 'effect-fixture-result.json'), 'utf8'));
  assert.equal(retained.state, 'PASS');
  assert.deepEqual(retained.source, result.source);
  assert.deepEqual(retained.after.records, CURRENT_RECORDS);
});

test('counterfeit loopback reference-browser markers cannot mint PASS', { timeout: 30_000 }, async (t) => {
  const server = onePageServer(() => effectFixtureHtml({ spoofReferenceReady: true }));
  const origin = await listen(server);
  t.after(() => closeServer(server));
  const workspace = tempWorkspace(t, 'vexlife-effect-fixture-spoofed-reference-');
  const execution = await runFixtureCli(requestBundle(), binding(`${origin}/reference/browser/`), workspace);
  assert.equal(execution.code, 1, execution.stdout || execution.stderr);
  const result = parseResult(execution);
  assert.equal(result.state, 'FAILED_SAFE');
  assert.match(result.reason, /external loopback fixture is adversarial-only and cannot produce PASS/);
  assert.equal(result.isolatedFixtureEffectAuthorized, false);
});

test('effect fixture CLI refuses preexisting Guide fixture state', { timeout: 30_000 }, async (t) => {
  const server = onePageServer(() => effectFixtureHtml({ initialRecords: [CURRENT_RECORDS[0]] }));
  const origin = await listen(server);
  t.after(() => closeServer(server));
  const workspace = tempWorkspace(t, 'vexlife-effect-fixture-preexisting-');
  const execution = await runFixtureCli(requestBundle(), binding(`${origin}/fixture`), workspace);
  assert.equal(execution.code, 1, execution.stdout || execution.stderr);
  const result = parseResult(execution);
  assert.equal(result.state, 'FAILED_SAFE');
  assert.equal(result.isolatedFixtureEffectAuthorized, false);
});

test('effect fixture CLI refuses wrong post-action Guide record shape', { timeout: 30_000 }, async (t) => {
  const server = onePageServer(() => effectFixtureHtml({ clickRecords: [CURRENT_RECORDS[0]] }));
  const origin = await listen(server);
  t.after(() => closeServer(server));
  const workspace = tempWorkspace(t, 'vexlife-effect-fixture-post-mismatch-');
  const execution = await runFixtureCli(requestBundle(), binding(`${origin}/fixture`), workspace);
  assert.equal(execution.code, 1, execution.stdout || execution.stderr);
  const result = parseResult(execution);
  assert.equal(result.state, 'FAILED_SAFE');
  assert.match(result.reason, /post-action Guide message count mismatch/);
});

test('effect fixture CLI refuses cleanup when a fresh browser observes prior Guide records', { timeout: 30_000 }, async (t) => {
  let documentLoads = 0;
  const server = onePageServer((request) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname !== '/fixture') return '<!doctype html><html><body></body></html>';
    documentLoads += 1;
    return documentLoads === 1
      ? effectFixtureHtml()
      : effectFixtureHtml({ initialRecords: [CURRENT_RECORDS[0]], clickRecords: [] });
  });
  const origin = await listen(server);
  t.after(() => closeServer(server));
  const workspace = tempWorkspace(t, 'vexlife-effect-fixture-cleanup-mismatch-');
  const execution = await runFixtureCli(requestBundle(), binding(`${origin}/fixture`), workspace);
  assert.equal(execution.code, 1, execution.stdout || execution.stderr);
  const result = parseResult(execution);
  assert.equal(result.state, 'FAILED_SAFE');
  assert.match(result.reason, /fresh-browser cleanup Guide message count mismatch/);
  assert.ok(documentLoads >= 2);
});

// [VXG RealForever]
