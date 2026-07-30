import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildBootstrapPlan, applyBootstrapPlan, HOME_DIRECTORIES } from '../src/core/boot.mjs';

test('bootstrap dry run is cross-platform descriptive and writes nothing', () => {
  const root = path.join(os.tmpdir(), `vexlife-dry-${Date.now()}`);
  const plan = buildBootstrapPlan({ home: root, deviceName: 'MacBook', platform: 'darwin', architecture: 'arm64' });
  const result = applyBootstrapPlan(plan, { dryRun: true });
  assert.equal(result.dryRun, true);
  assert.equal(fs.existsSync(root), false);
  assert.equal(plan.installation.platform, 'darwin');
  assert.equal(plan.modelArtifactStoredInGit, false);
});

test('bootstrap creates a distinct device lineage and refuses to overwrite existing home', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-home-'));
  fs.rmSync(root, { recursive: true, force: true });
  const plan = buildBootstrapPlan({ home: root, personRef: 'person.victor', familyRef: 'family.victor', deviceName: 'Windows', platform: 'win32', architecture: 'x64' });
  const first = applyBootstrapPlan(plan);
  assert.equal(first.applied, true);
  for (const directory of HOME_DIRECTORIES) assert.equal(fs.existsSync(path.join(root, directory)), true);
  assert.equal(fs.existsSync(path.join(root, 'culture/active-culture.md')), true);
  assert.equal(fs.existsSync(path.join(root, 'culture/manifest.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'dream/policy.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'training/policy.json')), true);
  const culture = JSON.parse(fs.readFileSync(path.join(root, 'culture/manifest.json'), 'utf8'));
  assert.equal(culture.personalMemoryImported, false);
  const family = JSON.parse(fs.readFileSync(path.join(root, 'family/family.json'), 'utf8'));
  assert.equal(family.identityPolicy, 'SIBLINGS_NOT_ONE_SEAMLESS_INSTANCE');
  const second = applyBootstrapPlan(plan);
  assert.equal(second.existing, true);
  assert.equal(second.reason, 'EXISTING_HOME_REQUIRES_MIGRATION_PLAN');
  fs.rmSync(root, { recursive: true, force: true });
});

// [VXG RealForever]
