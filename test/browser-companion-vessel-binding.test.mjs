import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BROWSER_COMPANION_VESSEL_TURN_PROJECTION_SCHEMA,
  projectBrowserCompanionVesselTurn
} from '../reference/browser/modules/chat-controller.js';
import {
  COMPANION_VESSEL_TURN_PROJECTION_SCHEMA,
  COMPANION_VESSEL_VISIBLE_CONTENT_LIMIT,
  normalizeCompanionVesselTurnProjection
} from '../reference/browser/modules/guide-controller.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const H = 'a'.repeat(64);
const scope = Object.freeze({
  projectRef: 'project.self-development',
  threadRef: 'thread.self-development.open-conversation',
  channelRef: 'channel.self-development.companion'
});

function completedTurn(overrides = {}) {
  return {
    schemaVersion: 'vexlife.browser-companion-turn/v1',
    state: 'TURN_COMPLETED',
    truthClass: 'CURRENT_LOCAL_MODEL',
    content: 'Exact current local-model response.',
    modelNameOrBoundedTestProfileRef: 'Qwen3.5-4B-Q4_K_M',
    turnRef: 'turn.vexlife.browser-companion.test.001',
    responseMessageRef: 'message.vexlife.browser-companion.response.test.001',
    conversationHeadSha256: H,
    ...overrides
  };
}

test('VA-I02 projects only one exact completed current local-model turn into the vessel contract', () => {
  const projection = projectBrowserCompanionVesselTurn(completedTurn(), scope);
  assert.equal(BROWSER_COMPANION_VESSEL_TURN_PROJECTION_SCHEMA, COMPANION_VESSEL_TURN_PROJECTION_SCHEMA);
  assert.deepEqual(projection, {
    schemaVersion: 'vexlife.companion-vessel-turn-projection/v1',
    truthClass: 'CURRENT_LOCAL_MODEL',
    ...scope,
    turnRef: 'turn.vexlife.browser-companion.test.001',
    responseMessageRef: 'message.vexlife.browser-companion.response.test.001',
    conversationHeadSha256: H,
    modelNameOrBoundedTestProfileRef: 'Qwen3.5-4B-Q4_K_M',
    content: 'Exact current local-model response.',
    effectsPerformed: false
  });
  assert.equal(Object.isFrozen(projection), true);
});

test('VA-I02 source projection rejects incomplete, stale-shaped, or non-local-model turn truth', () => {
  assert.throws(
    () => projectBrowserCompanionVesselTurn(completedTurn({ state: 'TURN_PENDING' }), scope),
    /completed current local-model turn/u
  );
  assert.throws(
    () => projectBrowserCompanionVesselTurn(completedTurn({ truthClass: 'CURRENT_SYNTHETIC_REFERENCE' }), scope),
    /completed current local-model turn/u
  );
  assert.throws(
    () => projectBrowserCompanionVesselTurn(completedTurn({ conversationHeadSha256: 'bad' }), scope),
    /conversationHeadSha256 is invalid/u
  );
  assert.throws(
    () => projectBrowserCompanionVesselTurn(completedTurn({ turnRef: '' }), scope),
    /turnRef is required/u
  );
  assert.throws(
    () => projectBrowserCompanionVesselTurn(completedTurn({ content: '' }), scope),
    /content is required/u
  );
  assert.throws(
    () => projectBrowserCompanionVesselTurn(completedTurn(), { ...scope, channelRef: '' }),
    /channelRef is required/u
  );
});

test('VA-I02 Guide normalization accepts only the zero-effect exact vessel projection', () => {
  const projection = projectBrowserCompanionVesselTurn(completedTurn(), scope);
  assert.deepEqual(normalizeCompanionVesselTurnProjection(projection), projection);
  assert.throws(
    () => normalizeCompanionVesselTurnProjection({ ...projection, effectsPerformed: true }),
    /contract is invalid/u
  );
  assert.throws(
    () => normalizeCompanionVesselTurnProjection({ ...projection, rendererAuthorityGranted: true }),
    /contract is invalid/u
  );
  assert.throws(
    () => normalizeCompanionVesselTurnProjection({ ...projection, conversationHeadSha256: 'f'.repeat(63) }),
    /conversationHeadSha256 is invalid/u
  );
  assert.equal(COMPANION_VESSEL_VISIBLE_CONTENT_LIMIT, 240);
});

test('VA-I07 production app composes the accepted completed-turn callback into the existing visible Vex', () => {
  const chatSource = fs.readFileSync(path.join(ROOT, 'reference/browser/modules/chat-controller.js'), 'utf8');
  const guideSource = fs.readFileSync(path.join(ROOT, 'reference/browser/modules/guide-controller.js'), 'utf8');
  const appSource = fs.readFileSync(path.join(ROOT, 'reference/browser/app.js'), 'utf8');

  assert.match(chatSource, /onCompanionTurnCompleted = null/u);
  assert.match(chatSource, /projectBrowserCompanionVesselTurn\(body/u);
  assert.match(chatSource, /await onCompanionTurnCompleted\(vesselProjection\)/u);
  assert.match(chatSource, /companionVesselProjectionState = 'REJECTED'/u);
  assert.match(guideSource, /function bindCompanionTurn\(value\)/u);
  assert.match(guideSource, /projection\.threadRef !== current\.threadRef/u);
  assert.match(guideSource, /projection\.channelRef !== current\.channelRef/u);
  assert.match(guideSource, /companionTurnDisposition = 'CURRENT'/u);
  assert.match(guideSource, /VEX_PRESENCE_STATES\.ACTIVE_CONVERSATION/u);
  assert.match(appSource, /onCompanionTurnCompleted:\s*async \(projection\)/u);
  assert.match(appSource, /guide\.bindCompanionTurn\(projection\)/u);
  assert.match(appSource, /Guide controller is unavailable for Companion vessel projection/u);
  assert.doesNotMatch(chatSource + guideSource + appSource, /getUserMedia|mediaDevices|camera|microphone|screenCapture/iu);
});

test('VA-I02 visible response projection is bounded while exact refs and full source truth remain bound', () => {
  const projection = projectBrowserCompanionVesselTurn(
    completedTurn({ content: 'x'.repeat(COMPANION_VESSEL_VISIBLE_CONTENT_LIMIT + 20) }),
    scope
  );
  assert.equal(projection.content.length, COMPANION_VESSEL_VISIBLE_CONTENT_LIMIT + 20);
  assert.equal(projection.turnRef, 'turn.vexlife.browser-companion.test.001');
  assert.equal(projection.conversationHeadSha256, H);
});

// [VXG RealForever]
