import fs from 'node:fs';
import path from 'node:path';

const SECRET_PATTERNS = [
  { name: 'GitHub token', regex: /gh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'private key', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'OpenAI-style secret', regex: /\bsk-[A-Za-z0-9_-]{24,}\b/ },
  { name: 'absolute macOS home', regex: /\/Users\/[A-Za-z0-9._-]+\// },
  { name: 'absolute Windows home', regex: /[A-Za-z]:\\Users\\[A-Za-z0-9._ -]+\\/ }
];

export function normalizeSafetyPath(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\/+/, '').replace(/\/+/g, '/');
}

function escapeRegex(character) {
  return /[\\^$.*+?()[\]{}|]/.test(character) ? `\\${character}` : character;
}

export function compileManifestPattern(pattern) {
  const normalized = normalizeSafetyPath(pattern);
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new Error(`Unsafe public-safety pattern: ${pattern}`);
  }
  let source = '';
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === '*' && normalized[index + 1] === '*') {
      source += '.*';
      index += 1;
    } else if (character === '*') {
      source += '[^/]*';
    } else if (character === '?') {
      source += '[^/]';
    } else {
      source += escapeRegex(character);
    }
  }
  const prefix = normalized.includes('/') ? '^' : '(^|.*/)';
  return { pattern, normalized, regex: new RegExp(`${prefix}${source}$`, 'i') };
}

export function compileManifestPatterns(patterns = []) {
  return patterns.map(compileManifestPattern);
}

function matchingPattern(relativePath, compiledPatterns) {
  return compiledPatterns.find((entry) => entry.regex.test(relativePath))?.pattern ?? null;
}

function collectFiles(root, exclusionPatterns) {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = normalizeSafetyPath(path.relative(root, absolute));
      if (matchingPattern(relative, exclusionPatterns) || matchingPattern(`${relative}/`, exclusionPatterns)) continue;
      if (entry.isSymbolicLink()) {
        files.push({ relative, absolute, symbolicLink: true });
      } else if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.isFile()) {
        files.push({ relative, absolute, symbolicLink: false });
      }
    }
  }
  walk(root);
  return files;
}

export function validatePublicSafetyPolicy(manifest) {
  const errors = [];
  if (manifest.automaticPublication !== false) errors.push('automatic publication must remain false');
  if (manifest.forcePushAllowed !== false || manifest.historyRewriteAllowed !== false) {
    errors.push('public safety manifest permits forbidden Git effects');
  }
  if (!['SELECTED_MPL_2_0_PRIVATE_STAGING', 'MPL_2_0_PUBLIC'].includes(String(manifest.licenseState))) {
    errors.push('license state must be selected MPL-2.0 for this launch pack');
  }
  if (manifest.contributionPolicy !== 'DCO_1_1_INBOUND_EQUALS_OUTBOUND') {
    errors.push('contribution policy must remain DCO 1.1 inbound-equals-outbound');
  }
  return errors;
}

export function scanPublicSafety(root, manifest) {
  const forbiddenPatterns = compileManifestPatterns(manifest.forbiddenArtifactPatterns);
  const exclusionPatterns = compileManifestPatterns(manifest.scanExclusionPatterns);
  const allowedBinaryPatterns = compileManifestPatterns(manifest.allowedBinaryPatterns);
  const errors = validatePublicSafetyPolicy(manifest);
  const classifications = [];
  const files = collectFiles(root, exclusionPatterns);

  for (const file of files) {
    const forbiddenPattern = matchingPattern(file.relative, forbiddenPatterns);
    if (forbiddenPattern) {
      errors.push(`forbidden public artifact path (${forbiddenPattern}): ${file.relative}`);
      classifications.push({ path: file.relative, classification: 'FORBIDDEN_PATH', pattern: forbiddenPattern });
      continue;
    }
    if (file.symbolicLink) {
      errors.push(`symbolic link requires explicit public-safety review: ${file.relative}`);
      classifications.push({ path: file.relative, classification: 'SYMBOLIC_LINK_BLOCKED' });
      continue;
    }

    const bytes = fs.readFileSync(file.absolute);
    if (bytes.includes(0)) {
      const allowedPattern = matchingPattern(file.relative, allowedBinaryPatterns);
      if (allowedPattern) {
        classifications.push({ path: file.relative, classification: 'ALLOWED_BINARY_DECLARED', pattern: allowedPattern });
      } else {
        errors.push(`undeclared binary artifact: ${file.relative}`);
        classifications.push({ path: file.relative, classification: 'UNDECLARED_BINARY_BLOCKED' });
      }
      continue;
    }

    classifications.push({ path: file.relative, classification: 'TEXT_SCANNED' });
    const text = bytes.toString('utf8');
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.regex.test(text)) errors.push(`${pattern.name} pattern found in ${file.relative}`);
    }
  }

  return {
    state: errors.length ? 'PUBLIC_SAFETY_BLOCKED' : 'PUBLIC_SAFETY_CLEAR',
    filesScanned: files.length,
    manifestRef: manifest.manifestRef,
    forbiddenPatterns: manifest.forbiddenArtifactPatterns,
    exclusionPatterns: manifest.scanExclusionPatterns,
    allowedBinaryPatterns: manifest.allowedBinaryPatterns,
    classifications,
    errors
  };
}

// [VXG RealForever]
