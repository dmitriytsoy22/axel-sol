import { ed25519 } from '@noble/curves/ed25519';
import {
  BaseMessageSignerWalletAdapter,
  isVersionedTransaction,
  WalletNotConnectedError,
  WalletReadyState,
  type TransactionOrVersionedTransaction,
  type WalletName,
} from '@solana/wallet-adapter-base';
import { Keypair, type PublicKey, type TransactionVersion } from '@solana/web3.js';
import { SOLANA_NETWORK, type SolanaNetwork } from './connection';
import { E2E_BURNER_STORAGE_KEY } from './e2eBurnerKey';

export const E2E_BURNER_WALLET_NAME = 'E2E Burner' as WalletName<'E2E Burner'>;

const ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#b45309"/><path d="M16 6c1 5 7 7 7 13a7 7 0 0 1-14 0c0-4 3-6 3-9 2 1 3 3 3 5 1-2 1-6 1-9z" fill="#fff"/></svg>',
  );

/**
 * Whether the app offers the burner wallet: only in a build made with NEXT_PUBLIC_E2E=1 for the
 * Playwright suite, and never on mainnet, because its key sits in the page's localStorage.
 */
export function e2eBurnerEnabled(flag: string | undefined, network: SolanaNetwork): boolean {
  return flag === '1' && network !== 'mainnet-beta';
}

export const E2E_BURNER_ENABLED = e2eBurnerEnabled(process.env.NEXT_PUBLIC_E2E, SOLANA_NETWORK);

/** The key in `storage`, or a new one kept there, so a reload stays the same wallet. */
export function loadBurnerKeypair(storage: Storage): Keypair {
  const stored = storage.getItem(E2E_BURNER_STORAGE_KEY);
  if (stored) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(stored) as number[]));
  const keypair = Keypair.generate();
  storage.setItem(E2E_BURNER_STORAGE_KEY, JSON.stringify(Array.from(keypair.secretKey)));
  return keypair;
}

/**
 * A wallet that signs in the page with a key from localStorage, so the e2e suite can drive
 * the app with a wallet it controls: transactions, and messages such as the demo access
 * request. Unlike the wallet adapter's own burner, it keeps its key across reloads.
 */
export class E2eBurnerWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = E2E_BURNER_WALLET_NAME;
  url = 'https://github.com/dmitriytsoy22/axel-sol/blob/main/CONTRIBUTING.md';
  icon = ICON;
  readonly supportedTransactionVersions: ReadonlySet<TransactionVersion> = new Set(['legacy', 0]);

  private keypair: Keypair | null = null;

  get publicKey(): PublicKey | null {
    return this.keypair?.publicKey ?? null;
  }

  get connecting(): boolean {
    return false;
  }

  get readyState(): WalletReadyState {
    return typeof window === 'undefined'
      ? WalletReadyState.Unsupported
      : WalletReadyState.Installed;
  }

  async connect(): Promise<void> {
    this.keypair = loadBurnerKeypair(window.localStorage);
    this.emit('connect', this.keypair.publicKey);
  }

  async disconnect(): Promise<void> {
    this.keypair = null;
    this.emit('disconnect');
  }

  async signTransaction<
    T extends TransactionOrVersionedTransaction<this['supportedTransactionVersions']>,
  >(transaction: T): Promise<T> {
    const keypair = this.connectedKeypair();
    if (isVersionedTransaction(transaction)) {
      transaction.sign([keypair]);
    } else {
      transaction.partialSign(keypair);
    }
    return transaction;
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    return ed25519.sign(message, this.connectedKeypair().secretKey.slice(0, 32));
  }

  private connectedKeypair(): Keypair {
    if (!this.keypair) throw new WalletNotConnectedError();
    return this.keypair;
  }
}
