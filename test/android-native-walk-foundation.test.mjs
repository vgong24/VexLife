import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACCEPTED_MAIN_ACTIVITY_SHA256,
  MAIN_ACTIVITY_PATH,
  renderAndroidNativeWalkFoundation,
  validateAcceptedMainActivityPreimage,
} from '../src/core/android-native-walk-foundation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = fs.readFileSync(path.join(ROOT, ...MAIN_ACTIVITY_PATH.split('/')), 'utf8');

function rendered() { return renderAndroidNativeWalkFoundation(BASE).files[MAIN_ACTIVITY_PATH]; }

test('NW00-01 exact accepted MainActivity preimage is required', () => {
  const accepted = validateAcceptedMainActivityPreimage(BASE);
  assert.equal(accepted.sha256, ACCEPTED_MAIN_ACTIVITY_SHA256);
  assert.throws(() => validateAcceptedMainActivityPreimage(BASE + '\n// drift\n'), /NW00_MAIN_ACTIVITY_PREIMAGE_DRIFT/);
});

test('NW00-02 rendering is deterministic and changes only the bounded MainActivity output', () => {
  const first = renderAndroidNativeWalkFoundation(BASE);
  const second = renderAndroidNativeWalkFoundation(BASE);
  assert.deepEqual(first.inventory, second.inventory);
  assert.deepEqual(first.files, second.files);
  assert.deepEqual(Object.keys(first.files), [MAIN_ACTIVITY_PATH]);
});

test('NW00-03 canonical Compose testTags are projected once into native resource-id semantics', () => {
  const source = rendered();
  assert.match(source, /\.semantics \{ testTagsAsResourceId = true \}/);
  assert.equal((source.match(/testTagsAsResourceId = true/g) || []).length, 1);
  assert.match(source, /Modifier\.testTag\(GeneratedCanonicalRefs\.requestAttentionAction\.value\)/);
  assert.doesNotMatch(source, /By\.res|UiDevice|UiAutomator|performClick|setState/);
});

test('NW00-04 safe drawing is explicit while the existing 24dp content spacing is preserved', () => {
  const source = rendered();
  assert.match(source, /Modifier\.safeDrawingPadding\(\)\.padding\(24\.dp\)/);
  assert.equal((source.match(/safeDrawingPadding\(\)/g) || []).length, 1);
});

test('NW00-05 current light witness surface explicitly requests contrasting dark system-bar icons', () => {
  const source = rendered();
  assert.match(source, /enableEdgeToEdge\(/);
  assert.match(source, /statusBarStyle = SystemBarStyle\.light\(Color\.TRANSPARENT, Color\.BLACK\)/);
  assert.match(source, /navigationBarStyle = SystemBarStyle\.light\(Color\.TRANSPARENT, Color\.BLACK\)/);
  assert.ok(source.indexOf('enableEdgeToEdge(') < source.indexOf('super.onCreate(savedInstanceState)'));
});

test('NW00-06 action, State Relay presentation and existing R4/R5 witnesses remain semantically unchanged', () => {
  const source = rendered();
  assert.match(source, /onClick = viewModel::requestConversationAttention/);
  assert.match(source, /AndroidRemoteVesselSurface\(\)/);
  assert.match(source, /AndroidHomeLoopbackSurface\(\)/);
  assert.match(source, /viewModel\.viewState\.collectAsState\(\)/);
  const effects = renderAndroidNativeWalkFoundation(BASE).effects;
  assert.equal(effects.actionContractMutation, false);
  assert.equal(effects.stateOwnerMutation, false);
  assert.equal(effects.automationBackdoor, false);
  assert.equal(effects.homeEffect, false);
  assert.equal(effects.networkEffect, false);
  assert.equal(effects.modelEffect, false);
});