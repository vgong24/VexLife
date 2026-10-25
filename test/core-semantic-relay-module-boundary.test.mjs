import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as conversationFacade from '../src/core/conversation.mjs';
import * as semanticRelay from '../src/core/semantic-relay.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const relayExports = ["composeSemanticRelay","validateSemanticRelay","attachSemanticRelay"];

test('VC04-RELAY-00 conversation facade preserves exact Semantic Relay exports', () => {
  for (const name of relayExports) {
    assert.ok(name in conversationFacade, 'conversation facade missing ' + name);
    assert.ok(name in semanticRelay, 'Semantic Relay owner missing ' + name);
    assert.equal(conversationFacade[name], semanticRelay[name], 'conversation facade must re-export exact Semantic Relay binding for ' + name);
  }
});

test('VC04-RELAY-01 source roles remain readable and dependency-closed', () => {
  const conversationSource = fs.readFileSync(path.join(root, 'src/core/conversation.mjs'), 'utf8');
  const semanticSource = fs.readFileSync(path.join(root, 'src/core/semantic-relay.mjs'), 'utf8');
  assert.match(conversationSource, /from '.\/semantic-relay\.mjs'/);
  assert.doesNotMatch(conversationSource, /const INTERPRETATION_STATES/);
  assert.doesNotMatch(conversationSource, /const FORBIDDEN_RELAY_FIELDS/);
  assert.doesNotMatch(conversationSource, /const ACKNOWLEDGEMENT_STATES/);
  assert.doesNotMatch(conversationSource, /export function composeSemanticRelay\s*\(/);
  assert.doesNotMatch(conversationSource, /export function validateSemanticRelay\s*\(/);
  assert.doesNotMatch(conversationSource, /export function attachSemanticRelay\s*\(/);
  assert.match(semanticSource, /const INTERPRETATION_STATES/);
  assert.match(semanticSource, /const FORBIDDEN_RELAY_FIELDS/);
  assert.match(semanticSource, /const ACKNOWLEDGEMENT_STATES/);
  for (const forbidden of ['createChannel', 'createMessage', 'messagesForChannel', 'contextForParticipant', 'createRelay']) {
    assert.doesNotMatch(semanticSource, new RegExp('export function ' + forbidden + '\\s*\\('));
  }
});

// [VXG RealForever][VEXLIFE-CORE][VC04][SEMANTIC-RELAY]
