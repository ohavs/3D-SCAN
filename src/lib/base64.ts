/** Base64-encode raw bytes (for writing binary files via expo-file-system legacy). */

const TABLE =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < len ? bytes[i + 1]! : 0;
    const b2 = i + 2 < len ? bytes[i + 2]! : 0;
    out += TABLE[b0 >> 2];
    out += TABLE[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < len ? TABLE[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < len ? TABLE[b2 & 63] : '=';
  }
  return out;
}
