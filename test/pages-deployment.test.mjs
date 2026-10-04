import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildPublicPagesArtifact } from '../scripts/build-public-pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED_TEST_ROOT = path.join(ROOT, 'generated');
const FIELD_ROUTE = '/learn/architecture/';
const ATLAS_ROUTE = '/learn/architecture/atlas/';
const ATLAS_REF = 'module.vexlife.core.atlas';

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
async function transitionIdle(page, expectedRef) {
  await page.waitForFunction(
    (ref) => document.querySelector('#terrainWorld')?.dataset.transitionPhase === 'IDLE'
      && globalThis.__vexlifePublicLearning?.proof?.()?.currentRef === ref,
    expectedRef
  );
}

function startArtifactServer(t, artifactRoot, basePath) {
  const requests = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    requests.push(url.pathname);
    if (!url.pathname.startsWith(basePath || '/')) {
      response.writeHead(404); response.end('outside base path'); return;
    }
    let logical = basePath ? url.pathname.slice(basePath.length) : url.pathname;
    if (!logical.startsWith('/')) logical = `/${logical}`;
    let relative = logical.replace(/^\//u, '');
    if (relative === '') relative = 'index.html';
    let absolute = path.join(artifactRoot, relative);
    if (logical.endsWith('/')) absolute = path.join(absolute, 'index.html');
    if (!absolute.startsWith(`${artifactRoot}${path.sep}`) || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      response.writeHead(404); response.end('not found'); return;
    }
    const type = absolute.endsWith('.html') ? 'text/html'
      : absolute.endsWith('.css') ? 'text/css'
        : absolute.endsWith('.json') ? 'application/json'
          : 'text/javascript';
    response.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
    response.end(fs.readFileSync(absolute));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      t.after(() => server.close());
      const address = server.address();
      resolve({ origin: `http://127.0.0.1:${address.port}`, requests });
    });
  });
}

for (const basePath of ['', '/VexLife']) {
  test(`Stage 9 deterministic artifact remains closed at base path ${basePath || '/'}`, () => {
    fs.mkdirSync(GENERATED_TEST_ROOT, { recursive: true });
    const holder = fs.mkdtempSync(path.join(GENERATED_TEST_ROOT, 'vexlife-pages-artifact-'));
    try {
      const outputRoot = path.join(holder, 'site');
      const built = buildPublicPagesArtifact({
        root: ROOT,
        outputRoot,
        basePath,
        sourceAcceptanceState: 'CANDIDATE_PROOF_ONLY',
        liveDeploymentState: 'DEPLOYED'
      });
      for (const route of [FIELD_ROUTE, ATLAS_ROUTE, '/learn/architecture/blueprint/', '/learn/architecture/registry-compiler/', '/learn/architecture/feature-registry/', '/learn/architecture/capability-registry/']) {
        assert.equal(fs.existsSync(path.join(outputRoot, route.slice(1), 'index.html')), true, route);
      }
      assert.equal(fs.existsSync(path.join(outputRoot, 'index.html')), true);
      assert.equal(fs.existsSync(path.join(outputRoot, 'vexlife-onboarding.html')), true);
      const projection = readJson(path.join(outputRoot, 'generated/public-learning/projection.json'));
      for (const node of projection.nodes) assert.equal(node.states.liveDeploymentState, 'DEPLOYED');
      const document = fs.readFileSync(path.join(outputRoot, 'learn/architecture/index.html'), 'utf8');
      if (basePath) {
        assert.match(document, new RegExp(`href="${basePath}/reference/browser/app\\.css"`, 'u'));
        assert.match(document, new RegExp(`src="${basePath}/reference/browser/public-learning/app\\.js"`, 'u'));
      }
      const inventory = built.receipt.files.map((entry) => entry.path);
      assert.equal(inventory.some((relative) => relative.startsWith('runtime/') || relative.startsWith('models/') || relative.startsWith('docs/private-continuity/')), false);
      assert.equal(inventory.includes('reference/browser/app.js'), false, 'private/full browser product adapter must not enter Pages artifact');
    } finally {
      fs.rmSync(holder, { recursive: true, force: true });
    }
  });
}

test('Stage 9 project-base cold load and Browser Back preserve logical route identity', async (t) => {
  fs.mkdirSync(GENERATED_TEST_ROOT, { recursive: true });
  const holder = fs.mkdtempSync(path.join(GENERATED_TEST_ROOT, 'vexlife-pages-browser-'));
  t.after(() => fs.rmSync(holder, { recursive: true, force: true }));
  const outputRoot = path.join(holder, 'site');
  buildPublicPagesArtifact({ root: ROOT, outputRoot, basePath: '/VexLife', sourceAcceptanceState: 'CANDIDATE_PROOF_ONLY', liveDeploymentState: 'DEPLOYED' });
  const { origin } = await startArtifactServer(t, outputRoot, '/VexLife');
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(`${origin}/VexLife${FIELD_ROUTE}`);
  await page.waitForFunction(() => document.documentElement.dataset.publicLearningReady === 'true');
  assert.equal((await page.evaluate(() => globalThis.__vexlifePublicLearning.proof())).routeBasePath, '/VexLife');

  await page.locator('#publicBrowseSummary').click();
  await page.locator('button[data-public-list-ref="public-group.vexlife.architecture.atlas.001"]').click();
  await transitionIdle(page, 'public-group.vexlife.architecture.atlas.001');
  await page.locator(`button[data-public-list-ref="${ATLAS_REF}"]`).click();
  await transitionIdle(page, ATLAS_REF);
  await page.locator('[data-public-action="read-leaf"]').click();
  await page.locator('#publicLeaf:not([hidden])').waitFor();
  assert.equal(new URL(page.url()).pathname, `/VexLife${ATLAS_ROUTE}`);
  assert.equal((await page.evaluate(() => globalThis.__vexlifePublicLearning.proof())).routePath, ATLAS_ROUTE);

  await page.goBack();
  await page.locator('#publicLeaf').waitFor({ state: 'hidden' });
  assert.equal(new URL(page.url()).pathname, `/VexLife${FIELD_ROUTE}`);
  assert.equal((await page.evaluate(() => globalThis.__vexlifePublicLearning.proof())).routePath, FIELD_ROUTE);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${origin}/VexLife${ATLAS_ROUTE}`);
  await page.waitForFunction(() => document.documentElement.dataset.publicLearningReady === 'true');
  await page.locator('#publicLeaf:not([hidden])').waitFor();
  const direct = await page.evaluate(() => globalThis.__vexlifePublicLearning.proof());
  assert.equal(direct.currentRef, ATLAS_REF);
  assert.equal(direct.routePath, ATLAS_ROUTE);
  assert.equal(direct.routeBasePath, '/VexLife');
  await page.locator('#publicLeafReturn').click();
  assert.equal(new URL(page.url()).pathname, `/VexLife${FIELD_ROUTE}`);
});

// [VXG RealForever]
