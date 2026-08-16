// Compatibility for local-network HTTP testing on mobile browsers.
// `crypto.randomUUID()` is unavailable in some non-secure contexts even though
// `crypto.getRandomValues()` remains available. Production deployment should
// still use HTTPS for full PWA / Web Share support.
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
  const uuidV4 = () => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  };

  Object.defineProperty(crypto, 'randomUUID', {
    configurable: true,
    value: uuidV4,
  });
}
