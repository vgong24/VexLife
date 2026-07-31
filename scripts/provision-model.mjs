#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Transform, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { buildModelArtifactManifest, DEFAULT_MAX_MODEL_BYTES, validateModelProvisionRequest } from '../src/core/model-provision.mjs';
import { writeJson } from '../src/core/utils.mjs';

const args = process.argv.slice(2);
const value = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const home = path.resolve(value('--home', path.join(os.homedir(), '.vexlife')));
const validation = validateModelProvisionRequest({
  url: value('--url'),
  expectedSha256: value('--sha256'),
  name: value('--name'),
  sourceReceiptRef: value('--source-ref'),
  licenseReceiptRef: value('--license-ref'),
  runtimeFamily: value('--runtime-family'),
  hardwareProfileRef: value('--hardware-profile'),
  maxBytes: Number(value('--max-bytes', String(DEFAULT_MAX_MODEL_BYTES)))
});
if (!validation.ok) {
  console.error('Model provisioning request is invalid:');
  for (const error of validation.errors) console.error(`- ${error}`);
  console.error('Required: --url <https-url> --sha256 <64-hex> --name <filename> --source-ref <ref> --license-ref <ref> --runtime-family <name> --hardware-profile <ref> [--max-bytes n] [--home path]');
  process.exit(2);
}
const request = validation.normalized;
const modelsDir = path.join(home, 'models');
const manifestsDir = path.join(modelsDir, 'manifests');
fs.mkdirSync(manifestsDir, { recursive: true });
const temporary = path.join(modelsDir, `${request.name}.${process.pid}.partial`);
const finalPath = path.join(modelsDir, request.name);
if (fs.existsSync(finalPath)) throw new Error(`refusing to overwrite existing model artifact: ${finalPath}`);
let bytes = 0;
try {
  const response = await fetch(request.url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`download failed: HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength && declaredLength > request.maxBytes) throw new Error(`declared artifact size ${declaredLength} exceeds maxBytes ${request.maxBytes}`);
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes > request.maxBytes) callback(new Error(`artifact exceeded maxBytes ${request.maxBytes}`));
      else callback(null, chunk);
    }
  });
  await pipeline(Readable.fromWeb(response.body), limiter, fs.createWriteStream(temporary, { flags: 'wx' }));
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(temporary), hash);
  const actualSha256 = hash.digest('hex');
  if (actualSha256 !== request.expectedSha256) throw new Error(`checksum mismatch: expected ${request.expectedSha256}, actual ${actualSha256}`);
  fs.renameSync(temporary, finalPath);
  const manifest = buildModelArtifactManifest({
    request,
    actualSha256,
    bytes,
    relativeArtifactPath: path.relative(home, finalPath).split(path.sep).join('/')
  });
  const manifestPath = path.join(manifestsDir, `${request.name}.json`);
  writeJson(manifestPath, manifest);
  console.log(JSON.stringify({ state: 'PROVISIONED_INACTIVE', path: finalPath, manifestPath, sha256: actualSha256, bytes, storedInRepository: false }, null, 2));
} catch (error) {
  fs.rmSync(temporary, { force: true });
  throw error;
}

// [VXG RealForever]
