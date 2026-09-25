/** A SHA-256 implementation: the browser's WebCrypto in the app, anything equivalent in tests. */
export type Digest = (data: Uint8Array<ArrayBuffer>) => Promise<Uint8Array>;

/** Thrown where the browser offers no WebCrypto, which it only does on HTTPS and localhost. */
export class WebCryptoUnavailableError extends Error {
  constructor() {
    super('WebCrypto (crypto.subtle) is not available on this page');
    this.name = 'WebCryptoUnavailableError';
  }
}

/** SHA-256 by the browser's own WebCrypto, so the check runs no code of ours on the hash. */
export const webCryptoSha256: Digest = async (data) => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new WebCryptoUnavailableError();
  return new Uint8Array(await subtle.digest('SHA-256', data));
};

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) throw new Error(`Not a hex string: ${hex}`);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** SHA-256 of a string's UTF-8 bytes, as hex. */
export async function sha256HexOfText(text: string, digest: Digest): Promise<string> {
  // A copy, so the bytes sit in a plain ArrayBuffer as WebCrypto's typing asks.
  return toHex(await digest(new Uint8Array(new TextEncoder().encode(text))));
}
