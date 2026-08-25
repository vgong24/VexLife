import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const registry = JSON.parse(read('blueprint/cdr-s5-closed-alpha-browser-registry.json'));
const html = read('reference/browser/cdr-s5-closed-alpha/index.html');
const css = read('reference/browser/cdr-s5-closed-alpha/app.css');
const js = read('reference/browser/cdr-s5-closed-alpha/app.js');

test('CDR-S5-A00 reference has no external or participant effect authority', () => {
  assert.equal(registry.surfaceState, 'REFERENCE_ONLY_NO_EXTERNAL_EFFECT');
  for (const key of [
    'realParticipantDataAllowed','networkEffectAllowed','providerEffectAllowed',
    'relationshipMutationAllowed','memoryWriteAllowed','homeMutationAllowed',
    'paymentOrTermsEffectAllowed','publicSearch','communitySearch','trainingEligible','recordingEnabled'
  ]) assert.equal(registry[key], false, key);
  assert.equal(registry.participantClass, 'SYNTHETIC_ONLY');
});

test('CDR-S5-A01 discovery is invite-only and public search cannot be enabled', () => {
  assert.equal(registry.discoveryMode, 'INVITE_ONLY');
  assert.equal(registry.publicSearch, false);
  assert.equal(registry.communitySearch, false);
  assert.match(html, /INVITE_ONLY/);
  assert.match(html, /publicSearch/);
});

test('CDR-S5-A02 alpha consent is distinct from invitation/contact/public/training/media consent', () => {
  assert.equal(registry.consent.class, 'ALPHA_PARTICIPATION');
  assert.deepEqual(registry.consent.distinctFrom, [
    'INVITATION_ACCEPTANCE','CONTACT_PERMISSION','PUBLIC_DISCOVERY','TRAINING','VOICE','VIDEO','RECORDING'
  ]);
  assert.equal(registry.consent.withdrawalProspective, true);
  assert.equal(registry.consent.scopeChangeRequiresRenewal, true);
});

test('CDR-S5-A03 invitation decisions are exact and bounded', () => {
  assert.deepEqual(registry.decisions, ['ACCEPT','NARROW','DEFER','DENY','BLOCK']);
  assert.match(js, /invitationDecisionEligible\(\)/);
  assert.match(js, /state\.decision === 'ACCEPT' \|\| state\.decision === 'NARROW'/);
});

test('CDR-S5-A04 hostile identity/currentness classes fail visibly', () => {
  assert.deepEqual(registry.identityStates, [
    'VERIFIED_CURRENT','WRONG_KEY','SIGNATURE_INVALID','STALE_EVIDENCE','INVITATION_EXPIRED','UNKNOWN'
  ]);
  assert.match(js, /HELD_\$\{state\.identity\}/);
  assert.match(js, /state\.identity !== 'VERIFIED_CURRENT'.*NOT_CONNECTED/s);
});

test('CDR-S5-A05 truthful presence states remain distinct', () => {
  for (const value of [
    'OFFLINE_PENDING_MAILBOX','APP_ON_MODEL_UNLOADED','PRESENCE_HIDDEN',
    'RELAY_ONLY','UNREACHABLE_OR_LEASE_EXPIRED','UNKNOWN'
  ]) assert.ok(registry.presenceStates.includes(value), value);
});

test('CDR-S5-A06 route disclosure contains no endpoint or credential material', () => {
  assert.deepEqual(registry.routeClasses, ['DIRECT_CANDIDATE','RELAYED','STORE_FORWARD','UNAVAILABLE']);
  const material = JSON.stringify(registry);
  assert.doesNotMatch(material, /(?:https?:\/\/|turns?:|stuns?:|\b(?:\d{1,3}\.){3}\d{1,3}\b)/i);
  assert.doesNotMatch(js, /RTCPeerConnection|WebSocket|mediaDevices|Authorization\s*:/);
  assert.doesNotMatch(html, /https?:\/\//i);
});

test('CDR-S5-A07 support defaults explicitly exclude secrets and private context', () => {
  const forbidden = new Set(registry.support.forbiddenDefaultInputs);
  for (const item of ['PASSWORD','PRIVATE_KEY','TURN_API_TOKEN','PROVIDER_API_TOKEN','PRIVATE_MEMORY','FULL_TRANSCRIPT','RAW_IP','RAW_PORT','PRECISE_LOCATION','HOME_NETWORK_TOPOLOGY']) {
    assert.ok(forbidden.has(item), item);
  }
});

test('CDR-S5-A08 delivery truth does not collapse connection, delivery or semantic acknowledgement', () => {
  assert.deepEqual(registry.deliveryStates, ['NOT_CONNECTED','CONNECTED','DELIVERED','SEMANTIC_ACKNOWLEDGED']);
  assert.deepEqual(registry.deliveryInvariants, {
    connectedImpliesDelivered:false,
    deliveredImpliesSemanticAcknowledged:false,
    semanticAcknowledgedImpliesRelationshipMutation:false
  });
});

test('CDR-S5-A09 EN/JA/ZH catalogs have exact key parity and non-empty values', () => {
  assert.deepEqual(registry.requiredLanguages, ['en','ja','zh']);
  const reference = Object.keys(registry.strings.en).sort();
  for (const locale of registry.requiredLanguages) {
    assert.deepEqual(Object.keys(registry.strings[locale]).sort(), reference);
    for (const value of Object.values(registry.strings[locale])) assert.equal(typeof value === 'string' && value.trim().length > 0, true);
  }
});

test('CDR-S5-A10 accessibility/mobile/reduced-motion fallback contract is source-visible', () => {
  assert.match(html, /name="viewport"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-controls="support-panel"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media \(max-width:\s*720px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /overflow-x:\s*(?:scroll|auto)/);
});

test('CDR-S5-A11 browser source can only fetch the same-origin source-managed registry', () => {
  const fetchCalls = [...js.matchAll(/fetch\(([^\n]+)\)/g)].map((match) => match[1]);
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0], /REGISTRY_URL/);
  assert.equal(js.includes("const REGISTRY_URL = '../../../blueprint/cdr-s5-closed-alpha-browser-registry.json';"), true);
  assert.doesNotMatch(js, /window\.open|location\.assign|location\.replace/);
});

test('CDR-S5-A12 withdrawal/disconnect/revoke remain prospective local reference transitions', () => {
  assert.equal(registry.consent.withdrawalProspective, true);
  for (const value of ['REVOKE','WITHDRAW','EXPORT_LOCAL_REFERENCE','DISCONNECT']) {
    assert.ok(registry.recoveryActions.includes(value), value);
  }
  assert.match(js, /state\.revoked = true/);
  assert.match(js, /state\.withdrawn = true/);
  assert.match(js, /state\.delivery = 'NOT_CONNECTED'/);
});

test('CDR-S5-A13 invitation create/receive lifecycle is explicit and bounded', () => {
  assert.deepEqual(registry.invitationStates, [
    'NONE','CREATED_LOCAL_REFERENCE','RECEIVED_VERIFIED_REFERENCE','RECEIVED_HELD_IDENTITY','EXPIRED_OR_REVOKED'
  ]);
  assert.match(html, /id="invitation"/);
  assert.match(js, /invitationHeld\(\)/);
  assert.match(js, /invitationCurrent\(\)/);
  assert.match(js, /state\.invitation === 'RECEIVED_VERIFIED_REFERENCE'/);
});

test('CDR-S5-A14 typed connection/session failures remain distinct and fail closed', () => {
  assert.deepEqual(registry.failureStates, [
    'NONE','IDENTITY_CHECK_FAILED','PEER_UNREACHABLE','RELAY_UNAVAILABLE','MAILBOX_ONLY','SESSION_EXPIRED','UNKNOWN'
  ]);
  assert.match(html, /id="failure"/);
  assert.match(js, /state\.failure !== 'NONE'.*NOT_CONNECTED/s);
  assert.match(js, /state\.route !== 'UNAVAILABLE'/);
});

test('CDR-S5-A15 delivery admission requires verified receipt plus an affirmative bounded invitation decision', () => {
  assert.match(js, /invitationDecisionEligible\(\)/);
  assert.match(js, /decisionPermitsSession\(\)/);
  assert.match(js, /delivery\.disabled = !canAdvanceDelivery\(\)/);
  assert.match(js, /state\.decision = 'DEFER';\s*state\.delivery = 'NOT_CONNECTED'/s);
});

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

async function openReferenceServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const target = path.resolve(ROOT, relative);
    if (target !== ROOT && !target.startsWith(`${ROOT}${path.sep}`)) {
      response.writeHead(403).end('forbidden');
      return;
    }
    fs.readFile(target, (error, bytes) => {
      if (error) {
        response.writeHead(404).end('not found');
        return;
      }
      response.writeHead(200, {
        'Content-Type': contentType(target),
        'Cache-Control': 'no-store'
      });
      response.end(bytes);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function assertLoopbackOnly(urls) {
  assert.ok(urls.length >= 4, `expected local document/assets/registry requests, got ${urls.length}`);
  for (const value of urls) {
    const url = new URL(value);
    assert.equal(url.protocol, 'http:');
    assert.equal(url.hostname, '127.0.0.1');
  }
}

test('CDR-S5-A16 Chromium practicum proves consent/invitation gating, keyboard, compact, reduced-motion and no external effects', { timeout: 60_000 }, async () => {
  const server = await openReferenceServer();
  const address = server.address();
  assert.equal(typeof address, 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });

    const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await desktop.newPage();
    const desktopRequests = [];
    let popups = 0;
    let downloads = 0;
    page.on('request', (request) => desktopRequests.push(request.url()));
    page.on('popup', () => { popups += 1; });
    page.on('download', () => { downloads += 1; });

    await page.goto(`${origin}/reference/browser/cdr-s5-closed-alpha/index.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.cdrS5Ready === 'true');

    assert.equal(await page.locator('#consent-status').textContent(), 'HELD_ALPHA_CONSENT_NOT_ACKNOWLEDGED');
    assert.equal(await page.locator('#decision').isDisabled(), true);
    assert.equal(await page.locator('#delivery').isDisabled(), true);
    await page.locator('#consent').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#consent-status').textContent(), 'ALPHA_CONSENT_REFERENCE_ACKNOWLEDGED');

    await page.selectOption('#invitation', 'CREATED_LOCAL_REFERENCE');
    assert.equal(await page.locator('#invitation-status').textContent(), 'CREATED_LOCAL_REFERENCE');
    assert.equal(await page.locator('#decision-status').textContent(), 'HELD_AWAITING_RECEIVED_VERIFIED_INVITATION');
    assert.equal(await page.locator('#decision').isDisabled(), true);
    assert.equal(await page.locator('#delivery').isDisabled(), true);
    assert.equal(await page.locator('#delivery').inputValue(), 'NOT_CONNECTED');

    await page.selectOption('#invitation', 'RECEIVED_VERIFIED_REFERENCE');
    assert.equal(await page.locator('#decision').isDisabled(), false);
    assert.equal(await page.locator('#delivery').isDisabled(), true);
    await page.selectOption('#decision', 'ACCEPT');
    assert.equal(await page.locator('#delivery').isDisabled(), false);
    await page.selectOption('#delivery', 'DELIVERED');
    assert.equal(await page.locator('#delivery').inputValue(), 'DELIVERED');

    await page.selectOption('#decision', 'BLOCK');
    assert.equal(await page.locator('#delivery').inputValue(), 'NOT_CONNECTED');
    assert.equal(await page.locator('#delivery').isDisabled(), true);
    await page.selectOption('#decision', 'NARROW');
    assert.equal(await page.locator('#delivery').isDisabled(), false);

    await page.selectOption('#failure', 'RELAY_UNAVAILABLE');
    assert.equal(await page.locator('#failure-status').textContent(), 'HELD_RELAY_UNAVAILABLE');
    assert.equal(await page.locator('#delivery').inputValue(), 'NOT_CONNECTED');
    assert.equal(await page.locator('#delivery').isDisabled(), true);

    await page.selectOption('#failure', 'NONE');
    await page.selectOption('#route', 'DIRECT_CANDIDATE');
    assert.equal(await page.locator('#delivery').isDisabled(), false);
    await page.selectOption('#delivery', 'CONNECTED');
    assert.equal(await page.locator('#delivery').inputValue(), 'CONNECTED');

    await page.locator('#support').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#support-panel').getAttribute('hidden'), null);
    assert.equal(await page.locator('#support').getAttribute('aria-expanded'), 'true');

    const undersized = await page.locator('button, select').evaluateAll((nodes) => nodes
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { id: node.id, width: rect.width, height: rect.height };
      })
      .filter((entry) => entry.width < 44 || entry.height < 44));
    assert.deepEqual(undersized, []);

    await page.locator('#revoke').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#delivery').inputValue(), 'NOT_CONNECTED');
    assert.equal(await page.locator('#delivery').isDisabled(), true);
    assert.equal(await page.locator('#decision-status').textContent(), 'HELD_INVITATION_OR_SESSION_REVOKED');
    assert.match(await page.locator('#recovery-status').textContent(), /REVOKED/);

    await page.locator('#reset').click();
    assert.equal(await page.locator('#support-panel').getAttribute('hidden'), '');
    assert.equal(await page.locator('#support').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#decision').isDisabled(), true);
    assert.equal(await page.locator('#delivery').isDisabled(), true);

    assertLoopbackOnly(desktopRequests);
    assert.equal(popups, 0);
    assert.equal(downloads, 0);
    await desktop.close();

    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce'
    });
    const mobilePage = await mobile.newPage();
    const mobileRequests = [];
    let mobilePopups = 0;
    let mobileDownloads = 0;
    mobilePage.on('request', (request) => mobileRequests.push(request.url()));
    mobilePage.on('popup', () => { mobilePopups += 1; });
    mobilePage.on('download', () => { mobileDownloads += 1; });

    await mobilePage.goto(`${origin}/reference/browser/cdr-s5-closed-alpha/index.html`, { waitUntil: 'networkidle' });
    await mobilePage.waitForFunction(() => document.documentElement.dataset.cdrS5Ready === 'true');

    assert.equal(await mobilePage.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.equal(await mobilePage.locator('#consent').evaluate((node) => getComputedStyle(node).transitionDuration), '0s');

    await mobilePage.selectOption('#invitation', 'RECEIVED_HELD_IDENTITY');
    assert.equal(await mobilePage.locator('#decision-status').textContent(), 'HELD_RECEIVED_HELD_IDENTITY');
    assert.equal(await mobilePage.locator('#decision').isDisabled(), true);
    assert.equal(await mobilePage.locator('#delivery').isDisabled(), true);
    assert.equal(await mobilePage.locator('#delivery').inputValue(), 'NOT_CONNECTED');

    assertLoopbackOnly(mobileRequests);
    assert.equal(mobilePopups, 0);
    assert.equal(mobileDownloads, 0);
    await mobile.close();
  } finally {
    if (browser) await browser.close();
    await closeServer(server);
  }
});

// [VXG RealForever]
