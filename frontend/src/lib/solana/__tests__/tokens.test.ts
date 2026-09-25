// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MINT_SIZE, MintLayout, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey, type AccountInfo } from '@solana/web3.js';
import {
  carMetadata,
  carTitle,
  parseSymbolMap,
  paymentToken,
  readTokenMetadata,
  sumByToken,
} from '../tokens';
import { accountData, fixture, key } from './fixtures/chain';

const USDC_DEVNET = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

/** An SPL Token mint account with no metadata, the way USDC is. */
function splMint(decimals: number): AccountInfo<Buffer> {
  const data = Buffer.alloc(MINT_SIZE);
  MintLayout.encode(
    {
      mintAuthorityOption: 0,
      mintAuthority: PublicKey.default,
      supply: 0n,
      decimals,
      isInitialized: true,
      freezeAuthorityOption: 0,
      freezeAuthority: PublicKey.default,
    },
    data,
  );
  return { data, owner: TOKEN_PROGRAM_ID, lamports: 0, executable: false };
}

function fixtureMint(address: string): AccountInfo<Buffer> {
  return {
    data: accountData(key(address)),
    owner: TOKEN_2022_PROGRAM_ID,
    lamports: 0,
    executable: false,
  };
}

describe('payment tokens', () => {
  it('take the symbol and decimals a Token-2022 mint stores in itself', () => {
    const token = paymentToken(key(fixture.paymentMint), fixtureMint(fixture.paymentMint), {});

    expect([token.symbol, token.decimals, token.tokenProgram.toBase58()]).toEqual([
      'tKZT',
      6,
      TOKEN_2022_PROGRAM_ID.toBase58(),
    ]);
  });

  it('name Circle USDC, which has no on-chain symbol', () => {
    expect(paymentToken(USDC_DEVNET, splMint(6), {}).symbol).toBe('USDC');
  });

  it('use the configured symbol of a mint without metadata', () => {
    const mint = PublicKey.unique();

    expect(paymentToken(mint, splMint(2), { [mint.toBase58()]: 'KZTE' })).toMatchObject({
      symbol: 'KZTE',
      decimals: 2,
    });
  });

  it('fall back to the short mint address when nothing names the mint', () => {
    const mint = PublicKey.unique();
    const address = mint.toBase58();

    expect(paymentToken(mint, splMint(6), {}).symbol).toBe(
      `${address.slice(0, 4)}…${address.slice(-4)}`,
    );
  });
});

describe('parseSymbolMap', () => {
  it('reads "<mint>:<symbol>" pairs', () => {
    expect(parseSymbolMap(`${USDC_DEVNET.toBase58()}:USDC, Mint2:tKZT`)).toEqual({
      [USDC_DEVNET.toBase58()]: 'USDC',
      Mint2: 'tKZT',
    });
    expect(parseSymbolMap(undefined)).toEqual({});
  });

  it('rejects an entry without a symbol', () => {
    expect(() => parseSymbolMap('Mint1')).toThrow('NEXT_PUBLIC_PAYMENT_MINT_SYMBOLS');
  });
});

describe('car metadata', () => {
  it('reads the car from the share mint the program created', () => {
    const shareMint = fixture.projects.operating.shareMint;
    const car = carMetadata(readTokenMetadata(key(shareMint), fixtureMint(shareMint)));

    expect(car).toMatchObject({
      name: 'AXEL Kia Rio #017',
      symbol: 'AXKR017',
      make: 'Kia',
      model: 'Rio',
      year: 2024,
      city: 'Almaty',
      carClass: 'economy',
      park: 'Demo Park Almaty-1',
    });
    expect(car.fields.data_origin).toBe('devnet-demo-seed');
    expect(carTitle(car)).toBe('Kia Rio');
  });

  it('names a car by its token when the metadata has no make or model', () => {
    const car = carMetadata({
      mint: PublicKey.unique(),
      name: 'AXEL Car #1',
      symbol: 'AXC1',
      uri: '',
      additionalMetadata: [['year', 'soon']],
    });

    expect([carTitle(car), car.year]).toEqual(['AXEL Car #1', null]);
  });

  it('reads no metadata from an SPL Token mint', () => {
    expect(readTokenMetadata(USDC_DEVNET, splMint(6))).toBeNull();
  });
});

describe('sumByToken', () => {
  it('adds amounts of the same mint and keeps the others apart', () => {
    const tenge = paymentToken(key(fixture.paymentMint), fixtureMint(fixture.paymentMint), {});
    const usdc = paymentToken(USDC_DEVNET, splMint(6), {});

    const totals = sumByToken([
      { amount: 5n, token: tenge },
      { amount: 7n, token: usdc },
      { amount: 11n, token: tenge },
    ]);

    expect(totals.map(({ amount, unit }) => [unit.symbol, amount])).toEqual([
      ['tKZT', 16n],
      ['USDC', 7n],
    ]);
  });
});
