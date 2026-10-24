import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../scripts/evolution-conversation-lived-proof.mjs', import.meta.url), 'utf8');

test('lived proof enters the canonical direct Vex relationship through the accepted Evolution surface', () => {
  assert.match(source, /project\.self-development/);
  assert.match(source, /thread\.self-development\.open-conversation/);
  assert.match(source, /channel\.self-development\.companion/);
  assert.match(source, /surface\.vexlife\.conversation/);
  assert.match(source, /roleKey === 'companion'/);
  assert.match(source, /CONTINUOUS_VEX_RELATIONSHIP/);
  assert.match(source, /title === 'Vex'/);
  assert.match(source, /setProjection\('EVOLUTION_PROJECTION'\)/);
  assert.match(source, /openEvolutionSurface\(target\.surfaceRef\)/);
});

test('lived proof sends through the visible Evolution composer instead of bypassing the browser Conversation owner', () => {
  assert.match(source, /\.conversation-evolution__input/);
  assert.match(source, /\.conversation-evolution__send/);
  assert.match(source, /await input\.fill\(prompt\)/);
  assert.match(source, /await send\.click\(\)/);
  assert.doesNotMatch(source, /\/api\/v1\/companion\/turn/);
  assert.doesNotMatch(source, /requestRealCompanionReply/);
  assert.doesNotMatch(source, /companionBridge\.performTurn/);
});

test('lived proof requires two current local-model responses and durable head advancement', () => {
  assert.match(source, /CURRENT_LOCAL_MODEL/);
  assert.match(source, /conversationHeadSha256/);
  assert.match(source, /modelNameOrBoundedTestProfileRef/);
  assert.match(source, /ordinal:\s*1/);
  assert.match(source, /ordinal:\s*2/);
  assert.match(source, /second\.lastResponse\.conversationHeadSha256 !== first\.lastResponse\.conversationHeadSha256/);
  assert.match(source, /conversationEventsWritten:\s*true/);
  assert.match(source, /modelInferencePerformed:\s*true/);
});

test('lived proof binds served browser assets to the tested source before sending', () => {
  for (const path of [
    'reference/browser/app.js',
    'reference/browser/modules/chat-controller.js',
    'reference/browser/evolution/conversation-projection.js',
    'reference/browser/evolution/conversation.css'
  ]) assert.ok(source.includes(path), `missing served source binding for ${path}`);
  assert.match(source, /served source asset drift/);
  assert.match(source, /localSha256 === servedSha256/);
});

// [VXG RealForever]
