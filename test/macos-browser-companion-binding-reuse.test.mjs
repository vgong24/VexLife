import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lifecycleSource = fs.readFileSync(path.join(ROOT, 'scripts', 'macos-lifecycle.mjs'), 'utf8');

test('Mac current-source browser reuse requires the exact qualified Companion binding', () => {
  assert.match(
    lifecycleSource,
    /function browserCompanionBindingForInitialization\(initialization\)/
  );
  assert.match(
    lifecycleSource,
    /runtimeReceiptPath:\s*initialization\.runtimeReceiptPath[\s\S]*?path\.resolve\(String\(initialization\.runtimeReceiptPath\)\)/
  );
  assert.match(
    lifecycleSource,
    /function browserReceiptMatchesInitialization\(receipt, initialization\)/
  );
  assert.match(
    lifecycleSource,
    /actual\.endpoint === expected\.endpoint[\s\S]*?actual\.requestModel === expected\.requestModel[\s\S]*?actual\.runtimeReceiptPath === expected\.runtimeReceiptPath/
  );
  assert.match(
    lifecycleSource,
    /owned\.sourceCurrent[\s\S]*?browserReceiptMatchesInitialization\(owned\.receipt, initialization\)[\s\S]*?!forceCurrentBrowserRebind && bindingCurrent[\s\S]*?REUSED_EXACT_BROWSER/
  );
  assert.match(
    lifecycleSource,
    /owned\.sourceCurrent[\s\S]*?const rebind = await stopOwnedBrowser\(home, repo\)[\s\S]*?rebind\.sourceDisposition !== 'CURRENT_SOURCE'/
  );
  assert.match(
    lifecycleSource,
    /companionBinding:\s*browserCompanionBindingForInitialization\(initialization\)/
  );
});

test('recoverable start still forces current-browser rebind even when its recorded binding matches', () => {
  assert.match(
    lifecycleSource,
    /forceCurrentBrowserRebind\s*:\s*state === 'EXISTING_RECOVERABLE'/
  );
  assert.match(
    lifecycleSource,
    /if \(!forceCurrentBrowserRebind && bindingCurrent\)[\s\S]*?REUSED_EXACT_BROWSER/
  );
  assert.match(
    lifecycleSource,
    /exact current browser stopped for Companion rebind but port 18110 remains occupied/
  );
});

// [VXG RealForever]
