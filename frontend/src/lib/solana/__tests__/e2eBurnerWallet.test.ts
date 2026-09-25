import { afterEach, describe, expect, it, vi } from 'vitest';
import { WalletNotConnectedError, WalletReadyState } from '@solana/wallet-adapter-base';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { accessMessage } from '@/lib/demo/message';
import { verifyWalletSignature } from '@/lib/demo/server/tokens';
import { E2E_BURNER_STORAGE_KEY } from '../e2eBurnerKey';
import { e2eBurnerEnabled, E2eBurnerWalletAdapter } from '../e2eBurnerWallet';

const BLOCKHASH = '11111111111111111111111111111111';

function storeKey(keypair: Keypair): void {
  window.localStorage.setItem(
    E2E_BURNER_STORAGE_KEY,
    JSON.stringify(Array.from(keypair.secretKey)),
  );
}

async function connected(): Promise<E2eBurnerWalletAdapter> {
  const adapter = new E2eBurnerWalletAdapter();
  await adapter.connect();
  return adapter;
}

function transfer(from: PublicKey): Transaction {
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: Keypair.generate().publicKey,
      lamports: 1,
    }),
  );
  transaction.feePayer = from;
  transaction.recentBlockhash = BLOCKHASH;
  return transaction;
}

afterEach(() => {
  window.localStorage.clear();
});

describe('e2eBurnerEnabled', () => {
  it('offers the burner only in a build made with NEXT_PUBLIC_E2E=1', () => {
    expect(e2eBurnerEnabled('1', 'localnet')).toBe(true);
    expect(e2eBurnerEnabled('1', 'devnet')).toBe(true);
    expect(e2eBurnerEnabled(undefined, 'localnet')).toBe(false);
    expect(e2eBurnerEnabled('', 'localnet')).toBe(false);
    expect(e2eBurnerEnabled('true', 'localnet')).toBe(false);
  });

  it('never offers it on mainnet, even with the flag', () => {
    expect(e2eBurnerEnabled('1', 'mainnet-beta')).toBe(false);
  });
});

describe('E2eBurnerWalletAdapter', () => {
  it('is listed as a wallet present in the browser, so it reconnects after a reload', () => {
    expect(new E2eBurnerWalletAdapter().readyState).toBe(WalletReadyState.Installed);
  });

  it('connects as the wallet whose key the test put in localStorage', async () => {
    const wallet = Keypair.generate();
    storeKey(wallet);
    const adapter = new E2eBurnerWalletAdapter();
    const onConnect = vi.fn();
    adapter.on('connect', onConnect);

    await adapter.connect();

    expect(adapter.publicKey?.toBase58()).toBe(wallet.publicKey.toBase58());
    expect(adapter.connected).toBe(true);
    expect(onConnect).toHaveBeenCalledWith(wallet.publicKey);
  });

  it('creates a key when none is stored and stays the same wallet after a reload', async () => {
    const first = await connected();
    const reloaded = await connected();

    expect(first.publicKey).not.toBeNull();
    expect(reloaded.publicKey?.toBase58()).toBe(first.publicKey?.toBase58());
  });

  it('signs a message the way the demo access route verifies it', async () => {
    const adapter = await connected();
    const wallet = adapter.publicKey!;
    const message = new TextEncoder().encode(accessMessage(wallet.toBase58(), 'nonce-1'));

    const signature = await adapter.signMessage(message);

    expect(verifyWalletSignature(wallet, message, signature)).toBe(true);
    expect(verifyWalletSignature(Keypair.generate().publicKey, message, signature)).toBe(false);
  });

  it('signs a legacy transaction as its fee payer', async () => {
    const adapter = await connected();
    const transaction = transfer(adapter.publicKey!);

    const signed = await adapter.signTransaction(transaction);

    expect(signed.verifySignatures()).toBe(true);
    expect(signed.signatures[0].publicKey.toBase58()).toBe(adapter.publicKey!.toBase58());
  });

  it('keeps the signatures of other signers on a transaction it signs', async () => {
    const adapter = await connected();
    const cosigner = Keypair.generate();
    const transaction = transfer(adapter.publicKey!).add(
      SystemProgram.transfer({
        fromPubkey: cosigner.publicKey,
        toPubkey: adapter.publicKey!,
        lamports: 1,
      }),
    );
    transaction.partialSign(cosigner);

    const signed = await adapter.signTransaction(transaction);

    expect(signed.verifySignatures()).toBe(true);
  });

  it('signs a versioned transaction', async () => {
    const adapter = await connected();
    const message = new TransactionMessage({
      payerKey: adapter.publicKey!,
      recentBlockhash: BLOCKHASH,
      instructions: transfer(adapter.publicKey!).instructions,
    }).compileToV0Message();

    const signed = await adapter.signTransaction(new VersionedTransaction(message));

    expect(
      verifyWalletSignature(adapter.publicKey!, signed.message.serialize(), signed.signatures[0]),
    ).toBe(true);
  });

  it('refuses to sign once disconnected', async () => {
    const adapter = await connected();
    const onDisconnect = vi.fn();
    adapter.on('disconnect', onDisconnect);

    await adapter.disconnect();

    expect(onDisconnect).toHaveBeenCalledOnce();
    expect(adapter.publicKey).toBeNull();
    await expect(adapter.signMessage(new Uint8Array([1]))).rejects.toBeInstanceOf(
      WalletNotConnectedError,
    );
    await expect(
      adapter.signTransaction(transfer(Keypair.generate().publicKey)),
    ).rejects.toBeInstanceOf(WalletNotConnectedError);
  });
});
