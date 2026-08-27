let nodeCrypto = null;
let nodeFs = null;
let nodePath = null;

if (typeof process !== 'undefined' && process?.versions?.node) {
  const [cryptoModule, fsModule, pathModule] = await Promise.all([
    import('node:crypto'),
    import('node:fs'),
    import('node:path')
  ]);
  nodeCrypto = cryptoModule.default ?? cryptoModule;
  nodeFs = fsModule.default ?? fsModule;
  nodePath = pathModule.default ?? pathModule;
}

const SHA256_INITIAL = Object.freeze([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
]);

const SHA256_K = Object.freeze([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
]);

const rotateRight = (value, bits) => (value >>> bits) | (value << (32 - bits));

function requireNodeFileSystem(label) {
  if (!nodeFs || !nodePath) throw new Error(`${label} requires a Node.js filesystem/path runtime`);
  return { fs: nodeFs, path: nodePath };
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function sha256HexUtf8(text) {
  const source = new TextEncoder().encode(String(text));
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(source);
  padded[source.length] = 0x80;

  const bitLength = source.length * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const state = [...SHA256_INITIAL];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const a = words[index - 15];
      const b = words[index - 2];
      const sigma0 = rotateRight(a, 7) ^ rotateRight(a, 18) ^ (a >>> 3);
      const sigma1 = rotateRight(b, 17) ^ rotateRight(b, 19) ^ (b >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [a,b,c,d,e,f,g,h] = state;
    for (let index = 0; index < 64; index += 1) {
      const bigSigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + bigSigma1 + choose + SHA256_K[index] + words[index]) >>> 0;
      const bigSigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (bigSigma0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }

  return state.map((word) => word.toString(16).padStart(8, '0')).join('');
}

export function semanticHash(value) {
  const text = JSON.stringify(canonicalize(value));
  if (nodeCrypto) return nodeCrypto.createHash('sha256').update(text).digest('hex');
  if (typeof text !== 'string') throw new TypeError('semanticHash input must serialize to JSON text');
  return sha256HexUtf8(text);
}

export function estimateTokens(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.max(1, Math.ceil(text.length / 4));
}

export function readJson(filePath) {
  const { fs } = requireNodeFileSystem('readJson');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeJson(filePath, value) {
  const { fs, path } = requireNodeFileSystem('writeJson');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function requireSafeRelativePath(value, label = 'path') {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`);
  const text = value;
  const posixAbsolute = text.startsWith('/');
  const win32Absolute = /^[\\/]/u.test(text) || /^[A-Za-z]:[\\/]/u.test(text);
  if (!text || posixAbsolute || win32Absolute || text.split(/[\\/]/u).includes('..')) {
    throw new Error(`${label} must be a safe relative path`);
  }
  return value;
}

export function resolveSafeGeneratedReceiptPath(root, value, label = 'receipt path') {
  const { fs, path } = requireNodeFileSystem('resolveSafeGeneratedReceiptPath');
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
