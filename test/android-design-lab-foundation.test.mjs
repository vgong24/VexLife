import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ACCEPTED_ANDROID_BASE,
  ACCEPTED_MAIN_ACTIVITY_SHA256,
  MAIN_ACTIVITY_PATH,
  OUTPUT_PATHS,
  renderAndroidDesignLabFoundation,
  validateAcceptedMainActivityPreimage,
  validateAndroidDesignLabRegistry,
} from '../src/core/android-design-lab-foundation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const acceptedMainActivity = execFileSync(
  'git',
  ['show', `${ACCEPTED_ANDROID_BASE}:${MAIN_ACTIVITY_PATH}`],
  { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
);
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint/android-design-lab-registry.json'), 'utf8'));

test('accepted MainActivity preimage is exact and drift fails closed', () => {
  assert.equal(validateAcceptedMainActivityPreimage(acceptedMainActivity).sha256, ACCEPTED_MAIN_ACTIVITY_SHA256);
  assert.throws(() => validateAcceptedMainActivityPreimage(`${acceptedMainActivity}\n// drift`), /PREIMAGE_DRIFT/);
});

test('Design Lab registry binds debug-only local presentation with no external authority', () => {
  assert.equal(validateAndroidDesignLabRegistry(registry).state, 'PASS');
  assert.equal(registry.mode, 'DEBUG_DEVELOPER_ONLY');
  assert.equal(registry.doorway.componentRef, 'component.vexlife.action-vessel');
  assert.equal(registry.specimens[0].effectClass, 'LOCAL_FIXTURE');
  assert.deepEqual(Object.values(registry.authority), Array(Object.keys(registry.authority).length).fill(false));
});

test('rendered first slice is deterministic and confined to exact Android outputs', () => {
  const first = renderAndroidDesignLabFoundation(acceptedMainActivity, registry);
  const second = renderAndroidDesignLabFoundation(acceptedMainActivity, registry);
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first.files), OUTPUT_PATHS);
  assert.equal(first.inventory.length, OUTPUT_PATHS.length);
  for (const [relativePath, source] of Object.entries(first.files)) {
    assert.doesNotMatch(source, /\n[ \t]*\n$/u, `${relativePath} must not end with a blank line`);
  }
  assert.equal(first.effects.homeEffect, false);
  assert.equal(first.effects.networkEffect, false);
  assert.equal(first.effects.modelEffect, false);
  assert.equal(first.effects.pairingEffect, false);
});

test('rendered MainActivity gates Design Lab to debuggable builds and preserves current witness semantics', () => {
  const rendered = renderAndroidDesignLabFoundation(acceptedMainActivity, registry).files[MAIN_ACTIVITY_PATH];
  assert.match(rendered, /ApplicationInfo\.FLAG_DEBUGGABLE/);
  assert.match(rendered, /AndroidRemoteVesselSurface\(\)/);
  assert.match(rendered, /AndroidHomeLoopbackSurface\(\)/);
  assert.match(rendered, /viewModel::requestConversationAttention/);
  assert.match(rendered, /testTagsAsResourceId = true/);
  assert.match(rendered, /VexDesignLabDoorwayFab/);
  assert.match(rendered, /VexDesignLabSurface/);
  const primitives = renderAndroidDesignLabFoundation(acceptedMainActivity, registry).files['platform/android/app/src/main/kotlin/vexlife/android/presentation/VexComposePrimitives.kt'];
  const surface = renderAndroidDesignLabFoundation(acceptedMainActivity, registry).files['platform/android/app/src/main/kotlin/vexlife/android/presentation/VexDesignLabSurface.kt'];
  assert.match(primitives, /elementRef: String/);
  assert.match(primitives, /actionRef: String/);
  assert.match(surface, /elementRef = VexDesignLabRefs\.DOORWAY_ELEMENT_REF/);
  assert.match(surface, /actionRef = VexDesignLabRefs\.DOORWAY_ACTION_REF/);
});

test('first VexButton specimen emits bounded semantic receipt fields only', () => {
  const rendered = renderAndroidDesignLabFoundation(acceptedMainActivity, registry);
  const surface = rendered.files['platform/android/app/src/main/kotlin/vexlife/android/presentation/VexDesignLabSurface.kt'];
  assert.match(surface, /actionRequested: Boolean/);
  assert.match(surface, /itemRefOrNull: String\?/);
  assert.match(surface, /operationRefOrNull: String\?/);
  assert.match(surface, /preRevision: Int/);
  assert.match(surface, /postRevision: Int/);
  assert.match(surface, /ADMITTED_LOCAL_FIXTURE/);
  assert.doesNotMatch(surface, /Logcat|SharedPreferences|DataStore|http|socket|HomeBridge|modelRuntime/i);
});

test('localization is present from the first stable Design Lab identity', () => {
  const rendered = renderAndroidDesignLabFoundation(acceptedMainActivity, registry);
  for (const path of [
    'platform/android/app/src/main/res/values/design_lab.xml',
    'platform/android/app/src/main/res/values-ja/design_lab.xml',
    'platform/android/app/src/main/res/values-zh-rCN/design_lab.xml',
  ]) {
    assert.match(rendered.files[path], /design_lab_title/);
    assert.match(rendered.files[path], /design_lab_output_console/);
  }
});
