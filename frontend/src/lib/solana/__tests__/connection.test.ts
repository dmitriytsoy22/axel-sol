// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { explorerUrl, parseNetwork } from '../connection';

describe('parseNetwork', () => {
  it('defaults to devnet and accepts every cluster the app knows', () => {
    expect(parseNetwork(undefined)).toBe('devnet');
    expect(['mainnet-beta', 'devnet', 'testnet', 'localnet'].map(parseNetwork)).toEqual([
      'mainnet-beta',
      'devnet',
      'testnet',
      'localnet',
    ]);
  });

  it('stops on a misspelt cluster instead of reading the wrong one', () => {
    expect(() => parseNetwork('mainnet')).toThrow('NEXT_PUBLIC_SOLANA_NETWORK must be one of');
  });
});

describe('explorerUrl', () => {
  const rpc = 'http://127.0.0.1:8899';

  it.each([
    ['mainnet-beta', 'https://explorer.solana.com/address/Abc'],
    ['devnet', 'https://explorer.solana.com/address/Abc?cluster=devnet'],
    [
      'localnet',
      'https://explorer.solana.com/address/Abc?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899',
    ],
  ] as const)('links %s accounts', (network, expected) => {
    expect(explorerUrl(network, rpc, 'Abc', 'address')).toBe(expected);
  });

  it('links transactions under /tx', () => {
    expect(explorerUrl('testnet', rpc, 'Sig', 'tx')).toBe(
      'https://explorer.solana.com/tx/Sig?cluster=testnet',
    );
  });
});
