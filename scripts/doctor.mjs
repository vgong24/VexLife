#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defaultHome } from '../src/core/boot.mjs';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';

const home = path.resolve(process.env.VEXLIFE_HOME || defaultHome());
const validation = validateBlueprint(loadBlueprint());
const endpoint = process.env.VEX_MODEL_ENDPOINT || null;
const report = {
  schemaVersion: 'vexlife.doctor/v0',
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  host: os.hostname(),
  home,
  homeExists: fs.existsSync(home),
  homeManifestExists: fs.existsSync(path.join(home, 'config/home.json')),
  modelEndpointConfigured: Boolean(endpoint),
  modelEndpoint: endpoint ? 'CONFIGURED_REDACTED' : 'NOT_CONFIGURED',
  blueprintState: validation.ok ? 'VALID' : 'INVALID',
  blueprintErrors: validation.errors,
  modelArtifactsExpectedInGit: false
};
console.log(JSON.stringify(report, null, 2));
if (!validation.ok) process.exitCode = 1;
// [VXG RealForever]
