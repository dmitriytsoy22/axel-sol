import { generateKeyPairSync, sign } from 'crypto';

import { formatSiwsMessage, verifyEd25519Signature } from './siws';

function ed25519Pair(): { publicKey: Buffer; signMessage: (message: Buffer) => Buffer } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const spki = publicKey.export({ format: 'der', type: 'spki' });
  return {
    publicKey: spki.subarray(spki.length - 32),
    signMessage: (message) => sign(null, message, privateKey),
  };
}

describe('formatSiwsMessage', () => {
  it('prints the Sign-In With Solana fields in their fixed order', () => {
    const message = formatSiwsMessage({
      domain: 'axel.example',
      address: 'Hp2x7Dq1Swa3DsbCd8hVSBKHEWcE2xbgMzkcUzeg4pZG',
      statement: 'Link this wallet.',
      uri: 'https://axel.example',
      chainId: 'mainnet',
      nonce: '0f3a9c',
      issuedAt: new Date('2026-09-25T06:00:00.000Z'),
      expirationTime: new Date('2026-09-25T06:05:00.000Z'),
    });

    expect(message).toBe(
      'axel.example wants you to sign in with your Solana account:\n' +
        'Hp2x7Dq1Swa3DsbCd8hVSBKHEWcE2xbgMzkcUzeg4pZG\n' +
        '\n' +
        'Link this wallet.\n' +
        '\n' +
        'URI: https://axel.example\n' +
        'Version: 1\n' +
        'Chain ID: mainnet\n' +
        'Nonce: 0f3a9c\n' +
        'Issued At: 2026-09-25T06:00:00.000Z\n' +
        'Expiration Time: 2026-09-25T06:05:00.000Z',
    );
  });
});

describe('verifyEd25519Signature', () => {
  const message = Buffer.from('axel.example wants you to sign in');

  it('accepts a signature by the key', () => {
    const pair = ed25519Pair();

    expect(verifyEd25519Signature(message, pair.signMessage(message), pair.publicKey)).toBe(true);
  });

  it('rejects a signature by another key', () => {
    const pair = ed25519Pair();

    expect(
      verifyEd25519Signature(message, ed25519Pair().signMessage(message), pair.publicKey),
    ).toBe(false);
  });

  it('rejects a signature over another message', () => {
    const pair = ed25519Pair();

    expect(
      verifyEd25519Signature(Buffer.from('other'), pair.signMessage(message), pair.publicKey),
    ).toBe(false);
  });

  it('rejects inputs of the wrong length', () => {
    const pair = ed25519Pair();
    const signature = pair.signMessage(message);

    expect(verifyEd25519Signature(message, signature.subarray(0, 63), pair.publicKey)).toBe(false);
    expect(verifyEd25519Signature(message, signature, pair.publicKey.subarray(0, 31))).toBe(false);
  });
});
