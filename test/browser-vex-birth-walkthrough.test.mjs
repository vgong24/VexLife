import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  formVexBirthWalkthroughReceipt
} from '../scripts/browser-vex-birth-walkthrough.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

test('walkthrough receipt cannot mislabel a read-only capture as a model/training effect', () => {
  const receipt = formVexBirthWalkthroughReceipt({
    sourceCommit: 'b49e9778dc0af817b5419b237c0cffbad80efefe',
    sourceTree: 'a073dc840f03de6b2af71dcaf4bcdbd4cb1ea66e',
    companionStatus: {
      schemaVersion: 'vexlife.browser-companion-status/v1',
      state: 'UNBOUND',
      truthClass: 'CURRENT_LOCAL_RUNTIME_BINDING',
      profileRef: 'model-profile.vexlife.browser-companion.local'
    },
    desktopScreenshot: 'runtime/walkthrough/vex-birth-lab/vex-birth-lab-desktop.png',
    compactScreenshot: 'runtime/walkthrough/vex-birth-lab/vex-birth-lab-compact.png',
    visibleTruth: {
      title: 'Vex Birth Lab',
      modelBindingState: 'UNBOUND',
      trainingTruthVisible: true
    },
    consoleErrors: [],
    pageErrors: [],
    modelTurnRequestCount: 0
  });

  assert.equal(receipt.modelTurnRequestCount, 0);
  assert.equal(receipt.modelCallPerformed, false);
  assert.equal(receipt.trainingPerformed, false);
  assert.equal(receipt.optimizerStepPerformed, false);
  assert.equal(receipt.activationPerformed, false);
  assert.equal(receipt.publicationPerformed, false);
  assert.equal(receipt.rawTranscriptIncluded, false);
  assert.equal(receipt.screenshots.desktop.endsWith('.png'), true);
  assert.equal(receipt.screenshots.compact.endsWith('.png'), true);
});

test('walkthrough source observes status and explicitly rejects any Companion turn request', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'scripts', 'browser-vex-birth-walkthrough.mjs'),
    'utf8'
  );
  assert.match(source, /\/api\/v1\/companion\/status/);
  assert.match(source, /\/api\/v1\/companion\/turn/);
  assert.match(source, /modelTurnRequestCount !== 0/);
  assert.match(source, /vex-birth-lab-desktop\.png/);
  assert.match(source, /vex-birth-lab-compact\.png/);
  assert.match(source, /sourceCommit/);
  assert.match(source, /sourceTree/);
});

test('accepted browser bundle carries the self-contained Slice B import seam', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'reference', 'browser', 'modules', 'browser-bundle.js'),
    'utf8'
  );
  assert.match(source, /import '\.\/vex-birth-lab-controller\.js';/);
});

// [VXG RealForever]
