// Compatibility helpers for local-network HTTP testing on mobile browsers.
// Production deployment should still use HTTPS for full PWA / Web Share support.
//
// Important: this helper intentionally does NOT call crypto.randomUUID().
// Earlier LAN compatibility code temporarily bridged randomUUID back to this
// helper, which could recurse on mobile browsers and cause a maximum call stack
// error. Generate the UUID bytes directly instead.
export function createId(): string {
  const bytes = new Uint8Array(16);

  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // RFC 4122 UUID v4 variant/version bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}
