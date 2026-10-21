/**
 * UTC wire crypto
 * ---------------------------------------------------------------------------
 * The portal obfuscates payloads with a repeating-key XOR, then Base64.
 * Ported from the verified Python reference in `ThoiKhoaBieu.py`:
 *
 *   encrypt(obj, key) -> base64( utf8( xor(json(obj), key) ) )
 *   decrypt(b64, key) -> xor( utf8_str( base64decode(b64) ), key )
 *
 * SUBTLETY THAT IS EASY TO GET WRONG
 * ---------------------------------------------------------------------------
 * The Python reference decodes Base64 to bytes, then to a *str*, and XORs
 * **Unicode code points** — not bytes:
 *
 *     raw  = base64.b64decode(b64).decode("utf-8", errors="replace")
 *     "".join(chr(ord(c) ^ ord(key[i % len(key)])) for i, c in enumerate(raw))
 *
 * `enumerate` walks code points. JavaScript's `str.length` counts UTF-16 code
 * units, so indexing with it would desynchronise the key on any character
 * outside the BMP (and mis-handle the *offset* for surrogate pairs). This
 * implementation therefore iterates with `for...of`, which walks code points
 * exactly like Python does.
 */

/** Repeating-key XOR over Unicode code points. */
function xorText(text, key) {
  const keyLength = key.length;
  let out = '';
  let i = 0;

  // `for...of` iterates by code point, matching Python's enumerate(str).
  for (const char of text) {
    // fromCodePoint, NOT fromCharCode: fromCharCode truncates to 16 bits, so
    // any character outside the BMP (an emoji, for instance) would come out
    // as a lone surrogate and then be mangled into U+FFFD by TextEncoder.
    out += String.fromCodePoint(char.codePointAt(0) ^ key.charCodeAt(i % keyLength));
    i += 1;
  }

  return out;
}

/** UTF-8 bytes -> Base64. */
function bytesToBase64(bytes) {
  let binary = '';
  // Chunked so a large payload cannot blow the argument limit of fromCharCode.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Base64 -> UTF-8 bytes. */
function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Encrypt a payload the way the portal expects.
 * @param {object} obj - Plain JSON-serialisable object.
 * @param {string} key - Repeating XOR key (the action code, without the prefix).
 * @returns {string} Base64 text for the `A` form field.
 */
export function encryptPayload(obj, key) {
  // JSON.stringify matches Python's separators=(",", ":") for plain objects:
  // no whitespace, and key order follows insertion order.
  const plain = JSON.stringify(obj);
  return bytesToBase64(new TextEncoder().encode(xorText(plain, key)));
}

/**
 * Decrypt a Base64 payload.
 * @param {string} b64
 * @param {string} key
 * @returns {string} The decoded text.
 */
export function decryptText(b64, key) {
  return xorText(new TextDecoder().decode(base64ToBytes(b64)), key);
}

/**
 * Decrypt a Base64 payload and parse it as JSON.
 * @param {string} b64
 * @param {string} key
 * @returns {unknown}
 */
export function decryptJson(b64, key) {
  return JSON.parse(decryptText(b64, key));
}

/** Fixed XOR keys used by the portal. */
export const JWT_KEY = 'AzzS';
export const IM_KEY = 'AzzSystem';