const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function formatUuidV4(bytes) {
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

export function createBrowserRandomUuid(cryptoLike = globalThis.crypto) {
  if (typeof cryptoLike?.randomUUID === 'function') return cryptoLike.randomUUID.bind(cryptoLike);
  if (typeof cryptoLike?.getRandomValues !== 'function') {
    throw new Error('Browser UUID generation requires a cryptographically secure random source');
  }
  return () => {
    const bytes = new Uint8Array(16);
    cryptoLike.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const uuid = formatUuidV4(bytes);
    if (!UUID_V4_PATTERN.test(uuid)) throw new Error('Browser UUID fallback produced an invalid UUID v4');
    return uuid;
  };
}

export function installBrowserRandomUuid(cryptoLike = globalThis.crypto) {
  if (!cryptoLike) throw new Error('Browser cryptography is unavailable');
  if (typeof cryptoLike.randomUUID === 'function') return Object.freeze({ source: 'NATIVE_RANDOM_UUID' });
  const fallback = createBrowserRandomUuid(cryptoLike);
  try {
    Object.defineProperty(cryptoLike, 'randomUUID', {
      configurable: true,
      enumerable: false,
      writable: false,
      value: fallback
    });
  } catch (error) {
    throw new Error(`Browser UUID fallback could not be installed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof cryptoLike.randomUUID !== 'function') throw new Error('Browser UUID fallback installation did not become callable');
  return Object.freeze({ source: 'GET_RANDOM_VALUES_UUID_V4' });
}

installBrowserRandomUuid();

// [VXG RealForever]
