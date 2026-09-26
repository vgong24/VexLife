import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BROWSER_COMPANION_RECOVERY_ACTION_PATH,
  normalizeBrowserCompanionRecoveryActionBinding,
  requestBrowserCompanionRecoveryAction
} from '../reference/browser/modules/chat-controller.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function action(overrides = {}) {
  return {
    schemaVersion: 'vexlife.browser-companion-recovery-action-binding/v1',
    truthClass: 'SOURCE_BOUND_COMPANION_RECOVERY_ACTION',
    actionRef: 'action.companion.reenter-current-binding',
    availabilityProjectionRef: 'projection.vexlife.companion-availability.current',
    effectAuthorityGranted: false,
    ...overrides
  };
}

function response(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return structuredClone(body); }
  };
}

test('VR06 presentation accepts only the exact bounded recovery-action binding', () => {
  const exact = action();
  assert.deepEqual(normalizeBrowserCompanionRecoveryActionBinding(exact), exact);
  assert.throws(
    () => normalizeBrowserCompanionRecoveryActionBinding({ ...exact, runtimeEffectAuthority: true }),
    /binding is invalid/u
  );
  assert.throws(
    () => normalizeBrowserCompanionRecoveryActionBinding({ ...exact, effectAuthorityGranted: true }),
    /binding is invalid/u
  );
  assert.throws(
    () => normalizeBrowserCompanionRecoveryActionBinding({ ...exact, requestRef: 'request.forbidden' }),
    /binding is invalid/u
  );
});

test('VR06 presentation performs GET binding then POST exact binding without a Companion turn request', async () => {
  const calls = [];
  const exact = action();
  const fetchImpl = async (url, options = {}) => {
    const method = options.method ?? 'GET';
    calls.push({ url, method, body: options.body ?? null });
    if (method === 'GET') return response(exact);
    if (method === 'POST') {
      assert.deepEqual(JSON.parse(options.body), exact);
      return response({ state: 'RECOVERY_ACCEPTED', requestRef: 'request.server-owned' });
    }
    return response({}, { status: 405 });
  };

  const result = await requestBrowserCompanionRecoveryAction({
    fetchImpl,
    expectedAvailabilityProjectionRef: exact.availabilityProjectionRef
  });

  assert.equal(result.action.availabilityProjectionRef, exact.availabilityProjectionRef);
  assert.deepEqual(calls.map(({ url, method }) => ({ url, method })), [
    { url: BROWSER_COMPANION_RECOVERY_ACTION_PATH, method: 'GET' },
    { url: BROWSER_COMPANION_RECOVERY_ACTION_PATH, method: 'POST' }
  ]);
  assert.equal(calls.some(({ url }) => url.includes('/companion/turn')), false);
});

test('VR06 presentation rejects a stale action binding before POST', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method ?? 'GET' });
    return response(action({ availabilityProjectionRef: 'projection.stale' }));
  };

  await assert.rejects(
    requestBrowserCompanionRecoveryAction({
      fetchImpl,
      expectedAvailabilityProjectionRef: 'projection.visible-current'
    }),
    /stale relative to visible availability/u
  );
  assert.deepEqual(calls, [
    { url: BROWSER_COMPANION_RECOVERY_ACTION_PATH, method: 'GET' }
  ]);
});

test('VR06 recovery presentation copy is localized in en ja zh and keeps READY as the real-turn threshold', () => {
  for (const language of ['en', 'ja', 'zh']) {
    const strings = JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint', 'strings', language + '.json'), 'utf8'));
    for (const key of [
      'composer.availability.recoverable',
      'composer.availability.recoverable-draft',
      'composer.recovery.action',
      'composer.recovery.failed',
      'composer.recovery.pending'
    ]) {
      assert.equal(typeof strings[key], 'string', language + ':' + key);
      assert.notEqual(strings[key].trim(), '', language + ':' + key);
    }
    assert.match(strings['composer.availability.recoverable'], /READY/u);
  }
});
