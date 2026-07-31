import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from '../src/core/utils.mjs';
import { compileManifestPatterns, scanPublicSafety } from '../src/core/public-safety.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = readJson(path.join(ROOT, 'PUBLIC-SAFETY-MANIFEST.json'));
const fixtures = readJson(path.join(ROOT, 'test/fixtures/public-safety/cases.json'));

function withFixtureRoot(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-public-safety-'));
  try {
    return callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeFixture(root, relativePath, bytes = Buffer.from('synthetic fixture\n')) {
  const absolute = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, bytes);
}

test('manifest patterns compile and every declared forbidden class rejects its fixture', () => {
  const compiled = compileManifestPatterns(manifest.forbiddenArtifactPatterns);
  assert.deepEqual(compiled.map((entry) => entry.pattern), manifest.forbiddenArtifactPatterns);
  assert.equal(fixtures.forbidden.length, manifest.forbiddenArtifactPatterns.length);
  for (const fixture of fixtures.forbidden) {
    assert.ok(manifest.forbiddenArtifactPatterns.includes(fixture.pattern), `undeclared fixture pattern ${fixture.pattern}`);
    withFixtureRoot((root) => {
      writeFixture(root, fixture.path);
      const result = scanPublicSafety(root, { ...manifest, scanExclusionPatterns: [], allowedBinaryPatterns: [] });
      assert.equal(result.state, 'PUBLIC_SAFETY_BLOCKED');
      assert.ok(
        result.errors.includes(`forbidden public artifact path (${fixture.pattern}): ${fixture.path}`),
        `${fixture.pattern} did not reject ${fixture.path}: ${result.errors.join('; ')}`
      );
    });
  }
});

test('allowed binary fixture is deliberately classified and undeclared binary is rejected', () => {
  withFixtureRoot((root) => {
    writeFixture(root, fixtures.allowedBinary.path, Buffer.from(fixtures.allowedBinary.bytesBase64, 'base64'));
    const result = scanPublicSafety(root, manifest);
    assert.equal(result.state, 'PUBLIC_SAFETY_CLEAR', result.errors.join('; '));
    assert.deepEqual(
      result.classifications.find((entry) => entry.path === fixtures.allowedBinary.path),
      {
        path: fixtures.allowedBinary.path,
        classification: 'ALLOWED_BINARY_DECLARED',
        pattern: 'test/fixtures/public-safety/allowed/*.dat'
      }
    );
  });
  withFixtureRoot((root) => {
    writeFixture(root, fixtures.blockedBinary.path, Buffer.from(fixtures.blockedBinary.bytesBase64, 'base64'));
    const result = scanPublicSafety(root, manifest);
    assert.equal(result.state, 'PUBLIC_SAFETY_BLOCKED');
    assert.ok(result.errors.includes(`undeclared binary artifact: ${fixtures.blockedBinary.path}`));
  });
});

test('repository checker derives forbidden path classes from the manifest', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts/public-safety-check.mjs'), 'utf8');
  const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/);
  assert.match(source, /scanPublicSafety/);
  assert.doesNotMatch(source, /gguf|safetensors|onnx|forbiddenExtensions|forbiddenDirectories/);
  assert.ok(manifest.forbiddenArtifactPatterns.includes('*.bin'));
  assert.ok(manifest.forbiddenArtifactPatterns.includes('.env'));
  assert.ok(manifest.forbiddenArtifactPatterns.includes('.env.*'));
  for (const pattern of ['.env', '.env.*', 'runtime/', 'models/', '.vexlife/', '*.bin']) {
    assert.ok(gitignore.includes(pattern), `.gitignore missing ${pattern}`);
  }
});

// [VXG RealForever]
