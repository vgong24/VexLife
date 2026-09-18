import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generatePlatform, supportedPlatforms } from '../src/core/platform-generator.mjs';
import { loadBlueprint } from '../src/core/blueprint.mjs';

const blueprintVersion = loadBlueprint().blueprint.version;

for (const platform of supportedPlatforms) {
  test(`generator creates ${platform} adoption scaffold from the same blueprint`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `vexlife-${platform}-`));
    const result = generatePlatform({ project: 'IVexLife', platform, outDir: root });
    assert.equal(fs.existsSync(result.sourcePath), true);
    const conformance = JSON.parse(fs.readFileSync(path.join(root, 'conformance.json'), 'utf8'));
    assert.equal(conformance.platformRef, `platform.${platform}`);
    assert.equal(conformance.sourceBlueprintVersion, blueprintVersion);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

// [VXG RealForever]
