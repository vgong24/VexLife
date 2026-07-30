import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSourceManifest, compareSourceManifest } from '../src/core/source-manifest.mjs';

test('source manifest is deterministic and excludes runtime/model/generated directories', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-manifest-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'models'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/a.txt'), 'a');
  fs.writeFileSync(path.join(root, 'models/large.gguf'), 'not-public');
  const first = buildSourceManifest(root);
  const second = buildSourceManifest(root);
  assert.deepEqual(first, second);
  assert.deepEqual(first.files.map((file) => file.path), ['src/a.txt']);
  assert.equal(compareSourceManifest(first, second).ok, true);
  fs.rmSync(root, { recursive: true, force: true });
});

// [VXG RealForever]
