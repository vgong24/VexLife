#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPublicLearningProjection } from '../src/core/public-learning.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = path.join(ROOT, 'generated/pages-site');
const REPOSITORY = 'vgong24/VexLife';
const SOURCE_STATES = new Set(['CANDIDATE_PROOF_ONLY', 'ACCEPTED_CURRENT']);
const DEPLOYMENT_STATES = new Set(['NOT_DEPLOYED', 'DEPLOYED']);

function need(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeBasePath(value) {
  const text = String(value ?? '').trim();
  if (text === '' || text === '/') return '';
  need(/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/u.test(text), `invalid Pages base path: ${text}`);
  return text;
}

function gitText(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function writeBytes(target, bytes) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
}

function copyFile(root, outputRoot, sourceRelative, targetRelative = sourceRelative) {
  const source = path.join(root, sourceRelative);
  need(fs.existsSync(source) && fs.statSync(source).isFile(), `public artifact source missing: ${sourceRelative}`);
  writeBytes(path.join(outputRoot, targetRelative), fs.readFileSync(source));
}

function publicLearningDocument(root, basePath) {
  const source = fs.readFileSync(path.join(root, 'reference/browser/public-learning/index.html'), 'utf8');
  if (!basePath) return source;
  return source.replace(/(["'])\/(reference|generated|blueprint|src)\//gu, `$1${basePath}/$2/`);
}

function listFiles(root) {
  const files = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      const stat = fs.lstatSync(absolute);
      need(!stat.isSymbolicLink(), `public artifact symlink forbidden: ${relative}`);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push(relative);
      else throw new Error(`unsupported public artifact entry: ${relative}`);
    }
  }
  walk(root);
  return files.sort();
}

export function buildPublicPagesArtifact({
  root = ROOT,
  outputRoot = DEFAULT_OUTPUT,
  basePath = '',
  sourceAcceptanceState = 'CANDIDATE_PROOF_ONLY',
  liveDeploymentState = 'NOT_DEPLOYED'
} = {}) {
  const normalizedRoot = fs.realpathSync(path.resolve(root));
  const normalizedOutput = path.resolve(outputRoot);
  const normalizedBasePath = normalizeBasePath(basePath);
  need(SOURCE_STATES.has(sourceAcceptanceState), `invalid source acceptance state: ${sourceAcceptanceState}`);
  need(DEPLOYMENT_STATES.has(liveDeploymentState), `invalid live deployment state: ${liveDeploymentState}`);
  need(normalizedOutput !== normalizedRoot && normalizedOutput.startsWith(`${normalizedRoot}${path.sep}`), 'public artifact output must remain inside repository root');

  const commitSha = gitText(normalizedRoot, ['rev-parse', 'HEAD']);
  const treeSha = gitText(normalizedRoot, ['show', '-s', '--format=%T', 'HEAD']);
  const sourceBinding = { repository: REPOSITORY, commitSha, treeSha, sourceAcceptanceState };
  const projection = buildPublicLearningProjection({ root: normalizedRoot, sourceBinding, liveDeploymentState });
  const browserRegistry = readJson(path.join(normalizedRoot, 'blueprint/public-learning-browser-registry.json'));

  fs.rmSync(normalizedOutput, { recursive: true, force: true });
  fs.mkdirSync(normalizedOutput, { recursive: true });

  // Accepted Public Onboarding owner: one source, two entry projections.
  const onboardingHtml = fs.readFileSync(path.join(normalizedRoot, 'pages/vexlife-onboarding.html'));
  writeBytes(path.join(normalizedOutput, 'index.html'), onboardingHtml);
  writeBytes(path.join(normalizedOutput, 'vexlife-onboarding.html'), onboardingHtml);
  copyFile(normalizedRoot, normalizedOutput, 'pages/vexlife-onboarding.css', 'vexlife-onboarding.css');
  copyFile(normalizedRoot, normalizedOutput, 'pages/vexlife-onboarding.js', 'vexlife-onboarding.js');
  for (const locale of ['en', 'ja', 'zh']) {
    copyFile(normalizedRoot, normalizedOutput, `pages/strings/vexlife-onboarding.${locale}.json`, `strings/vexlife-onboarding.${locale}.json`);
  }

  // Accepted Public Learning runtime allowlist, copied without widening.
  const routeDocument = publicLearningDocument(normalizedRoot, normalizedBasePath);
  for (const logicalPath of browserRegistry.runtimeAllowlist) {
    need(typeof logicalPath === 'string' && logicalPath.startsWith('/'), `invalid public runtime allowlist path: ${logicalPath}`);
    const relative = logicalPath.slice(1);
    if (logicalPath === '/reference/browser/public-learning/index.html') {
      writeBytes(path.join(normalizedOutput, relative), Buffer.from(routeDocument, 'utf8'));
      continue;
    }
    if (logicalPath === '/generated/public-learning/projection.json') {
      writeBytes(path.join(normalizedOutput, relative), Buffer.from(`${JSON.stringify(projection, null, 2)}\n`, 'utf8'));
      continue;
    }
    copyFile(normalizedRoot, normalizedOutput, relative, relative);
  }

  const logicalRoutes = [browserRegistry.fieldRoutePath, ...projection.leaves.map((leaf) => leaf.routePath)];
  for (const logicalRoute of logicalRoutes) {
    need(/^\/learn\/architecture\/(?:[a-z0-9-]+\/)?$/u.test(logicalRoute), `unexpected public learning route: ${logicalRoute}`);
    const routeRelative = logicalRoute.replace(/^\//u, '');
    writeBytes(path.join(normalizedOutput, routeRelative, 'index.html'), Buffer.from(routeDocument, 'utf8'));
  }

  const filesBeforeReceipt = listFiles(normalizedOutput);
  const receipt = {
    schemaVersion: 'vexlife.pages-deployment-artifact/v1',
    repository: REPOSITORY,
    sourceBinding,
    liveDeploymentState,
    basePath: normalizedBasePath,
    fieldRoutePath: browserRegistry.fieldRoutePath,
    leafRoutePaths: projection.leaves.map((leaf) => leaf.routePath).sort(),
    fileCountExcludingReceipt: filesBeforeReceipt.length,
    files: filesBeforeReceipt.map((relative) => {
      const bytes = fs.readFileSync(path.join(normalizedOutput, relative));
      return { path: relative, bytes: bytes.length, sha256: sha256(bytes) };
    })
  };
  writeBytes(path.join(normalizedOutput, 'deployment-inventory.json'), Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8'));
  return { outputRoot: normalizedOutput, receipt, files: listFiles(normalizedOutput) };
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) throw new Error(`unexpected argument: ${value}`);
    const [rawKey, inline] = value.slice(2).split('=', 2);
    if (inline !== undefined) out[rawKey] = inline;
    else {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(`missing value for --${rawKey}`);
      out[rawKey] = next;
      index += 1;
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const result = buildPublicPagesArtifact({
    outputRoot: args.out ? path.resolve(args.out) : DEFAULT_OUTPUT,
    basePath: args['base-path'] ?? '',
    sourceAcceptanceState: args['source-acceptance-state'] ?? 'CANDIDATE_PROOF_ONLY',
    liveDeploymentState: args['live-deployment-state'] ?? 'NOT_DEPLOYED'
  });
  process.stdout.write(`${JSON.stringify({
    state: 'PUBLIC_PAGES_ARTIFACT_BUILT',
    outputRoot: result.outputRoot,
    basePath: result.receipt.basePath,
    sourceBinding: result.receipt.sourceBinding,
    liveDeploymentState: result.receipt.liveDeploymentState,
    fileCount: result.files.length
  }, null, 2)}\n`);
}

// [VXG RealForever]
