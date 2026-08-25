import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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

test('CDR-S5-A10 accessibility/mobile/reduced-motion contract is source-visible', () => {
  assert.match(html, /name="viewport"/);
  assert.match(html, /aria-live="polite"/);
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

test('CDR-S5-A12 withdrawal/disconnect remain prospective local reference transitions', () => {
  assert.equal(registry.consent.withdrawalProspective, true);
  assert.ok(registry.recoveryActions.includes('WITHDRAW'));
  assert.ok(registry.recoveryActions.includes('EXPORT_LOCAL_REFERENCE'));
  assert.ok(registry.recoveryActions.includes('DISCONNECT'));
  assert.match(js, /state\.withdrawn = true/);
  assert.match(js, /state\.delivery = 'NOT_CONNECTED'/);
});

// [VXG RealForever]
