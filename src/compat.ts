// Compatibility helpers for local-network HTTP testing on mobile browsers.
// Production deployment should still use HTTPS for full PWA / Web Share support.
export function createId(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

// The current save path calls crypto.randomUUID() directly. Some mobile browsers
// omit randomUUID() on plain HTTP LAN origins, even though getRandomValues() is
// still available. Define only the missing method and leave native implementations untouched.
if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID !== 'function') {
  try {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: createId,
    });
  } catch {
    // If a browser forbids extending Crypto, the app remains loadable; production
    // HTTPS provides the native method and is the intended deployment environment.
  }
}
