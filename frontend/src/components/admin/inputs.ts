import { PublicKey } from '@solana/web3.js';

/** A typed Solana address, or null for anything that is not one. */
export function parseWallet(text: string): PublicKey | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return new PublicKey(trimmed);
  } catch {
    return null;
  }
}

/** A 32-byte hash typed as 64 hex characters. */
export const HASH_HEX = /^[0-9a-f]{64}$/i;

export const textInputClass =
  'h-12 w-full min-w-0 rounded-control border border-input bg-card px-4 font-mono text-body text-foreground placeholder:font-sans placeholder:text-subtle-foreground transition-colors duration-fast ease-move focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50 aria-[invalid=true]:border-destructive';
