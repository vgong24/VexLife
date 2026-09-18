#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE_PATH = 'pages/vexlife-onboarding.html';
const PAGE_REF = 'page.vexlife.public-onboarding.001';
const RECEIPT_SCHEMA = 'vexlife.public-onboarding-practicum-receipt/v1';
const STAGE_REFS = Object.freeze([
  'DISCOVER',
  'CHOOSE_PLATFORM',
  'CHECK_REQUIREMENTS',
  'DOWNLOAD',
  'VERIFY_ARTIFACT',
  'ESTABLISH',
  'START',
  'MEET_VEX',
  'VERIFY_HEALTH',
  'UNDERSTAND_AVAILABLE_AND_HELD_FEATURES',
  'LEARN_RECOVERY',
  'UNDERSTAND_UNINSTALL_AND_PRESERVATION',
  'COMPLETE'
]);
const LOCALES = Object.freeze(['en', 'ja', 'zh']);
const VIEWPORTS = Object.freeze([
  { ref: 'desktop', width: 1440, height: 1000, isMobile: false },
  { ref: 'mobile', width: 390, height: 844, isMobile: true }
]);

function usage() {
  return `VexLife public onboarding practicum\n\nUsage:\n  node scripts/public-onboarding-practicum.mjs [--base-url <url>] [--out <directory>]\n\nWithout --base-url, the script serves the current checkout from an ephemeral\n127.0.0.1 port. An explicit URL may be either the page URL or a site root.\n`;
}

function parseArgs(argv) {
  const options = {
    baseUrl: null,
    outDir: path.join(ROOT, 'artifacts', 'public-onboarding-practicum')
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { ...options, help: true };
    if (argument === '--base-url' || argument === '--out') {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      if (argument === '--base-url') options.baseUrl = value;
      else options.outDir = path.resolve(process.cwd(), value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function mimeType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js':
    case '.mjs': return 'text/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    default: return 'application/octet-stream';
  }
}

async function startLocalServer() {
  const server = http.createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method ?? '')) {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        response.end();
        return;
      }

      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      let relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
      if (!relativePath) relativePath = PAGE_PATH;
      const resolvedPath = path.resolve(ROOT, relativePath);
      const relativeToRoot = path.relative(ROOT, resolvedPath);
      if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
      }

      const stat = await fsp.stat(resolvedPath);
      const filePath = stat.isDirectory() ? path.join(resolvedPath, 'index.html') : resolvedPath;
      const body = await fsp.readFile(filePath);
      response.writeHead(200, {
        'Content-Type': mimeType(filePath),
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      if (request.method === 'HEAD') response.end();
      else response.end(body);
    } catch (error) {
      const status = error?.code === 'ENOENT' ? 404 : 500;
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(status === 404 ? 'Not found' : 'Server error');
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object', 'Local server did not expose an address');
  return {
    server,
    pageUrl: new URL(`/${PAGE_PATH}`, `http://127.0.0.1:${address.port}/`).href
  };
}

function resolvePageUrl(baseUrl) {
  const parsed = new URL(baseUrl);
  if (parsed.pathname.endsWith('.html')) return parsed.href;
  if (!parsed.pathname.endsWith('/')) parsed.pathname += '/';
  return new URL(PAGE_PATH, parsed).href;
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const input = fs.createReadStream(filePath);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('error', reject);
    input.on('end', resolve);
  });
  return hash.digest('hex');
}

function receiptCaseRef(locale, viewport) {
  return `case.vexlife.public-onboarding.${locale}.${viewport.ref}`;
}

async function runCase({ browser, pageUrl, outputDir, locale, viewport }) {
  const caseRef = receiptCaseRef(locale, viewport);
  const target = new URL(pageUrl);
  target.searchParams.set('lang', locale);
  const expectedOrigin = target.origin;
  const requests = [];
  const blockedRequests = [];
  const downloads = [];
  const popups = [];
  const consoleErrors = [];
  const pageErrors = [];
  const checks = [];

  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
    locale: locale === 'ja' ? 'ja-JP' : locale === 'zh' ? 'zh-CN' : 'en-US',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    acceptDownloads: false
  });
  const page = await context.newPage();

  page.on('download', (download) => downloads.push({ suggestedFilename: download.suggestedFilename() }));
  page.on('popup', (popup) => popups.push({ url: popup.url() }));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.route('**/*', async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const record = {
      url: requestUrl.href,
      origin: requestUrl.origin,
      method: request.method(),
      resourceType: request.resourceType()
    };
    requests.push(record);
    if (requestUrl.origin !== expectedOrigin) {
      blockedRequests.push(record);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });

  let caseState = 'PASS';
  let errorMessage = null;
  let browserState = null;
  let screenshot = null;

  try {
    const response = await page.goto(target.href, { waitUntil: 'networkidle', timeout: 30_000 });
    assert(response?.ok(), `${caseRef}: page request did not succeed`);
    checks.push('PAGE_RESPONSE_OK');

    await page.waitForFunction(() => window.__VEXLIFE_ONBOARDING_READY__ === true, null, { timeout: 15_000 });
    checks.push('EXPLICIT_READY_STATE');

    browserState = await page.evaluate(() => window.__VEXLIFE_ONBOARDING_STATE__);
    assert(browserState?.pageRef === PAGE_REF, `${caseRef}: wrong pageRef`);
    assert(browserState.locale === locale, `${caseRef}: wrong locale`);
    assert(browserState.catalogState === 'CURRENT', `${caseRef}: catalog is not current`);
    assert(browserState.effectClass === 'NONE', `${caseRef}: effect class widened`);
    assert(browserState.publicationState === 'SOURCE_CANDIDATE', `${caseRef}: publication state widened`);
    assert(arraysEqual(browserState.stageRefs, STAGE_REFS), `${caseRef}: stage refs drifted`);
    checks.push('STATE_CONTRACT_CURRENT');

    const localization = await page.evaluate(() => {
      const visibleRefs = [...document.querySelectorAll('[data-i18n]')].map((element) => ({
        ref: element.dataset.i18n,
        value: element.textContent.trim()
      }));
      const contentRefs = [...document.querySelectorAll('[data-i18n-content]')].map((element) => ({
        ref: element.dataset.i18nContent,
        value: element.getAttribute('content')?.trim() ?? ''
      }));
      const ariaRefs = [...document.querySelectorAll('[data-i18n-aria-label]')].map((element) => ({
        ref: element.dataset.i18nAriaLabel,
        value: element.getAttribute('aria-label')?.trim() ?? ''
      }));
      return { visibleRefs, contentRefs, ariaRefs, documentLang: document.documentElement.lang };
    });
    const emptyLocalization = [
      ...localization.visibleRefs,
      ...localization.contentRefs,
      ...localization.ariaRefs
    ].filter((entry) => !entry.value);
    assert(localization.documentLang === locale, `${caseRef}: html lang was not updated`);
    assert(emptyLocalization.length === 0, `${caseRef}: empty localized refs: ${emptyLocalization.map((entry) => entry.ref).join(', ')}`);
    checks.push('LOCALIZED_REFS_NON_EMPTY');

    for (let chapterIndex = 0; chapterIndex < 5; chapterIndex += 1) {
      await page.locator(`[data-chapter-button="${chapterIndex}"]`).click();
      await page.waitForFunction((expected) => (
        window.__VEXLIFE_ONBOARDING_STATE__.chapterIndex === expected
      ), chapterIndex);
      const activePanel = page.locator(`[data-chapter-panel="${chapterIndex}"]`);
      await activePanel.waitFor({ state: 'visible' });
    }
    checks.push('FIVE_CHAPTER_USER_TRAVERSAL');

    const heldButton = page.locator('[data-release-held]');
    await heldButton.click();
    await page.locator('[data-release-copy]').waitFor({ state: 'visible' });
    checks.push('HELD_RELEASE_DISCLOSURE');

    const firstFaq = page.locator('.faq-list details').first();
    await firstFaq.locator('summary').click();
    assert(await firstFaq.evaluate((element) => element.open), `${caseRef}: FAQ disclosure did not open`);
    checks.push('FAQ_DISCLOSURE');

    await page.locator('[data-complete]').click();
    await page.locator('[data-completion-copy]').waitFor({ state: 'visible' });
    browserState = await page.evaluate(() => window.__VEXLIFE_ONBOARDING_STATE__);
    assert(browserState.complete === true, `${caseRef}: completion state was not recorded`);
    checks.push('ZERO_EFFECT_COMPLETION');

    const overflow = await page.evaluate(() => ({
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth
    }));
    assert(overflow.documentScrollWidth <= overflow.documentClientWidth + 1, `${caseRef}: document horizontal overflow`);
    assert(overflow.bodyScrollWidth <= overflow.bodyClientWidth + 1, `${caseRef}: body horizontal overflow`);
    checks.push('NO_HORIZONTAL_OVERFLOW');

    assert(blockedRequests.length === 0, `${caseRef}: external-origin request attempted`);
    assert(downloads.length === 0, `${caseRef}: download attempted`);
    assert(popups.length === 0, `${caseRef}: popup opened`);
    assert(consoleErrors.length === 0, `${caseRef}: console errors observed`);
    assert(pageErrors.length === 0, `${caseRef}: page errors observed`);
    checks.push('ZERO_EXTERNAL_ORIGIN_REQUESTS');
    checks.push('ZERO_DOWNLOADS');
    checks.push('ZERO_POPUPS');
    checks.push('ZERO_BROWSER_ERRORS');

    const screenshotPath = path.join(outputDir, `vexlife-onboarding-${locale}-${viewport.ref}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    screenshot = {
      path: path.relative(ROOT, screenshotPath).split(path.sep).join('/'),
      bytes: (await fsp.stat(screenshotPath)).size,
      sha256: await sha256File(screenshotPath)
    };
    checks.push('SCREENSHOT_CAPTURED_AND_HASHED');
  } catch (error) {
    caseState = 'FAIL';
    errorMessage = error instanceof Error ? error.message : String(error);
  } finally {
    await context.close();
  }

  return {
    caseRef,
    state: caseState,
    locale,
    viewport,
    pageUrl: target.href,
    expectedOrigin,
    checks,
    browserState,
    requestCount: requests.length,
    requests,
    blockedRequests,
    downloads,
    popups,
    consoleErrors,
    pageErrors,
    screenshot,
    error: errorMessage
  };
}

async function writeReceipt(outputDir, receipt) {
  await fsp.mkdir(outputDir, { recursive: true });
  const receiptPath = path.join(outputDir, 'receipt.json');
  await fsp.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return receiptPath;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  await fsp.mkdir(options.outDir, { recursive: true });
  const startedAt = new Date().toISOString();
  let local = null;
  let browser = null;
  let browserVersion = null;
  let pageUrl = null;
  const cases = [];
  let topLevelError = null;

  try {
    if (options.baseUrl) {
      pageUrl = resolvePageUrl(options.baseUrl);
    } else {
      local = await startLocalServer();
      pageUrl = local.pageUrl;
    }

    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    browserVersion = browser.version();

    for (const locale of LOCALES) {
      for (const viewport of VIEWPORTS) {
        cases.push(await runCase({
          browser,
          pageUrl,
          outputDir: options.outDir,
          locale,
          viewport
        }));
      }
    }
  } catch (error) {
    topLevelError = error instanceof Error ? error.message : String(error);
  } finally {
    await browser?.close();
    if (local?.server) await new Promise((resolve) => local.server.close(resolve));
  }

  const failedCases = cases.filter((entry) => entry.state !== 'PASS');
  const allDownloads = cases.flatMap((entry) => entry.downloads);
  const allPopups = cases.flatMap((entry) => entry.popups);
  const allBlockedRequests = cases.flatMap((entry) => entry.blockedRequests);
  const allConsoleErrors = cases.flatMap((entry) => entry.consoleErrors);
  const allPageErrors = cases.flatMap((entry) => entry.pageErrors);
  const state = topLevelError || cases.length !== LOCALES.length * VIEWPORTS.length || failedCases.length > 0
    ? 'FAIL'
    : 'PASS';

  const receipt = {
    schemaVersion: RECEIPT_SCHEMA,
    practicumRef: 'practicum.vexlife.public-onboarding.en-ja-zh.001',
    pageRef: PAGE_REF,
    state,
    mode: options.baseUrl ? 'EXPLICIT_BASE_URL' : 'LOCAL_EPHEMERAL_SERVER',
    pageUrl,
    startedAt,
    completedAt: new Date().toISOString(),
    sourceBinding: {
      repository: 'vgong24/VexLife',
      candidateHead: process.env.VEXLIFE_CANDIDATE_HEAD_SHA || null,
      candidateTree: process.env.VEXLIFE_CANDIDATE_TREE_SHA || null
    },
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      browser: 'chromium',
      browserVersion
    },
    scope: {
      locales: [...LOCALES],
      viewports: VIEWPORTS,
      stageRefs: [...STAGE_REFS],
      effectClass: 'NONE',
      publicationState: 'SOURCE_CANDIDATE'
    },
    summary: {
      expectedCaseCount: LOCALES.length * VIEWPORTS.length,
      executedCaseCount: cases.length,
      passedCaseCount: cases.length - failedCases.length,
      failedCaseCount: failedCases.length,
      downloadCount: allDownloads.length,
      popupCount: allPopups.length,
      blockedExternalRequestCount: allBlockedRequests.length,
      consoleErrorCount: allConsoleErrors.length,
      pageErrorCount: allPageErrors.length
    },
    cases,
    topLevelError,
    doesNotProve: [
      'GitHub Pages publication',
      'repository visibility decision',
      'GitHub Release creation or artifact signing',
      'native installer conformance',
      'model readiness from browser load alone',
      'macOS or Linux release qualification',
      'fresh-human P11 acceptance'
    ]
  };

  const receiptPath = await writeReceipt(options.outDir, receipt);
  console.log(JSON.stringify({ state, receiptPath, summary: receipt.summary }, null, 2));
  if (state !== 'PASS') process.exitCode = 1;
}

await main();

// [VXG RealForever]
