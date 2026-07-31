import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function semanticHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

export function estimateTokens(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.max(1, Math.ceil(text.length / 4));
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function requireSafeRelativePath(value, label = 'path') {
  if (!value || path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value) ||
      value.split(/[\\/]/).includes('..')) {
    throw new Error(`${label} must be a safe relative path`);
  }
  return value;
}

export function resolveSafeGeneratedReceiptPath(root, value, label = 'receipt path') {
  requireSafeRelativePath(value, label);
  const normalized = value.replace(/\\/g, '/');
  if (!normalized.startsWith('generated/health/') || normalized.endsWith('/')) {
    throw new Error(`${label} must be under generated/health/`);
  }
  const repositoryRoot = path.resolve(root);
  const target = path.resolve(repositoryRoot, ...normalized.split('/'));
  const relative = path.relative(repositoryRoot, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes the repository`);
  }

  let cursor = repositoryRoot;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) continue;
    if (fs.lstatSync(cursor).isSymbolicLink()) {
      throw new Error(`${label} must not traverse a symbolic link`);
    }
  }
  return target;
}

// [VXG RealForever]
