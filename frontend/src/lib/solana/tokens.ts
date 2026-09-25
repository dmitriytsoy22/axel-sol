import type { AccountInfo, PublicKey } from '@solana/web3.js';
import {
  ExtensionType,
  getExtensionData,
  getExtensionTypes,
  TOKEN_2022_PROGRAM_ID,
  unpackAccount,
  unpackMint,
} from '@solana/spl-token';
import { unpack as unpackTokenMetadata, type TokenMetadata } from '@solana/spl-token-metadata';

/** The stablecoin a project is priced and pays out in. */
export interface PaymentToken {
  mint: PublicKey;
  tokenProgram: PublicKey;
  decimals: number;
  /** "tKZT", "USDC"; the short mint address when the mint names no symbol. */
  symbol: string;
  /**
   * What the token's issuer can do to any account of it, vaults included. The program
   * accepts these mints (docs/v2.md, payment mints) and the app discloses them.
   */
  issuer: IssuerPowers;
}

export interface IssuerPowers {
  /** A freeze authority: can freeze any account, the car's vaults too. */
  canFreeze: boolean;
  /** Token-2022 permanent delegate: can move or burn tokens from any account. */
  canSeize: boolean;
  /** Token-2022 pausable: can stop every transfer of the token. */
  canPause: boolean;
}

/** The car behind a project, as its share mint's token metadata describes it. */
export interface CarMetadata {
  /** Token name, e.g. "AXEL Kia Rio #017". */
  name: string;
  /** Token symbol, e.g. "AXKR017"; tells apart cars of the same model. */
  symbol: string;
  uri: string;
  make: string;
  model: string;
  year: number | null;
  city: string;
  carClass: string;
  park: string;
  /** Every additional metadata field, including the ones above. */
  fields: Record<string, string>;
}

/** Circle's USDC on mainnet and devnet: SPL Token mints with no on-chain symbol. */
const WELL_KNOWN_SYMBOLS: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU': 'USDC',
};

/**
 * NEXT_PUBLIC_PAYMENT_MINT_SYMBOLS names payment mints that carry no metadata:
 * "<mint>:<symbol>,<mint>:<symbol>".
 */
export function parseSymbolMap(value: string | undefined): Record<string, string> {
  if (!value?.trim()) return {};
  return Object.fromEntries(
    value.split(',').map((entry) => {
      const [mint, symbol, ...rest] = entry.trim().split(':');
      if (!mint || !symbol || rest.length > 0) {
        throw new Error(
          `NEXT_PUBLIC_PAYMENT_MINT_SYMBOLS entries must look like "<mint>:<symbol>", got "${entry}"`,
        );
      }
      return [mint, symbol];
    }),
  );
}

const CONFIGURED_SYMBOLS = parseSymbolMap(process.env.NEXT_PUBLIC_PAYMENT_MINT_SYMBOLS);

/** The TokenMetadata a Token-2022 mint stores in itself, or null for any other mint. */
export function readTokenMetadata(
  address: PublicKey,
  account: AccountInfo<Buffer>,
): TokenMetadata | null {
  if (!account.owner.equals(TOKEN_2022_PROGRAM_ID)) return null;
  const mint = unpackMint(address, account, TOKEN_2022_PROGRAM_ID);
  const data = getExtensionData(ExtensionType.TokenMetadata, mint.tlvData);
  return data ? unpackTokenMetadata(data) : null;
}

export function carMetadata(metadata: TokenMetadata | null): CarMetadata {
  const fields = Object.fromEntries(metadata?.additionalMetadata ?? []);
  const year = Number.parseInt(fields.year ?? '', 10);
  return {
    name: metadata?.name ?? '',
    symbol: metadata?.symbol ?? '',
    uri: metadata?.uri ?? '',
    make: fields.make ?? '',
    model: fields.model ?? '',
    year: Number.isFinite(year) ? year : null,
    city: fields.city ?? '',
    carClass: fields.class ?? '',
    park: fields.park ?? '',
    fields,
  };
}

/** "Kia Rio"; the token name when the metadata has no make and model. */
export function carTitle(car: CarMetadata): string {
  const title = `${car.make} ${car.model}`.trim();
  return title || car.name;
}

export function paymentToken(
  address: PublicKey,
  account: AccountInfo<Buffer>,
  configuredSymbols: Record<string, string> = CONFIGURED_SYMBOLS,
): PaymentToken {
  const mint = unpackMint(address, account, account.owner);
  const extensions = getExtensionTypes(mint.tlvData);
  const key = address.toBase58();
  const symbol =
    readTokenMetadata(address, account)?.symbol ||
    configuredSymbols[key] ||
    WELL_KNOWN_SYMBOLS[key] ||
    `${key.slice(0, 4)}…${key.slice(-4)}`;
  return {
    mint: address,
    tokenProgram: account.owner,
    decimals: mint.decimals,
    symbol,
    issuer: {
      canFreeze: mint.freezeAuthority !== null,
      canSeize: extensions.includes(ExtensionType.PermanentDelegate),
      canPause: extensions.includes(ExtensionType.PausableConfig),
    },
  };
}

/** The balance of a token account of either token program; zero when it does not exist. */
export function tokenAccountBalance(
  address: PublicKey,
  account: AccountInfo<Buffer> | null,
): bigint {
  if (!account) return 0n;
  return unpackAccount(address, account, account.owner).amount;
}

/** Sums amounts per payment mint, in the order the mints first appear. */
export function sumByToken(
  items: { amount: bigint; token: PaymentToken }[],
): { amount: bigint; unit: PaymentToken }[] {
  const totals = new Map<string, { amount: bigint; unit: PaymentToken }>();
  for (const { amount, token } of items) {
    const key = token.mint.toBase58();
    const total = totals.get(key);
    totals.set(key, { amount: (total?.amount ?? 0n) + amount, unit: token });
  }
  return [...totals.values()];
}
