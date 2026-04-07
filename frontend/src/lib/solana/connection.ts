/**
 * Solana RPC Connection & Utilities
 *
 * Provides a singleton Connection instance, Explorer URL builder,
 * and RPC error wrapping helpers.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import type { Axel } from '../../../../target/types/axel';
import IDL from '../../../../target/idl/axel.json';

const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

const SOLANA_NETWORK =
  process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || 'DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M',
);

export const connectionConfig = {
  endpoint: SOLANA_RPC_URL,
  commitment: 'confirmed' as const,
  network: SOLANA_NETWORK,
  programId: PROGRAM_ID.toBase58(),
};

/** Singleton connection for read-only RPC calls */
let _connection: Connection | null = null;
export function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  }
  return _connection;
}

/**
 * Create a read-only Anchor program instance (no wallet signing).
 * Used for fetching/deserializing on-chain accounts.
 */
export function getReadonlyProgram(): Program<Axel> {
  const connection = getConnection();
  const provider = new AnchorProvider(
    connection,
    {
      publicKey: PublicKey.default,
      signTransaction: async () => { throw new Error('readonly'); },
      signAllTransactions: async () => { throw new Error('readonly'); },
    } as any,
    { preflightCommitment: 'confirmed' },
  );
  return new Program(IDL as Axel, provider);
}

/**
 * Solana Explorer URL builder
 */
export function getExplorerUrl(
  addressOrSignature: string,
  type: 'address' | 'tx' = 'address',
): string {
  const base = 'https://explorer.solana.com';
  const cluster = SOLANA_NETWORK === 'mainnet-beta' ? '' : `?cluster=${SOLANA_NETWORK}`;

  if (type === 'tx') {
    return `${base}/tx/${addressOrSignature}${cluster}`;
  }
  return `${base}/address/${addressOrSignature}${cluster}`;
}

/* ── RPC Error Handling ──────────────────────────────── */

const RPC_ERROR_MAP: Record<string, string> = {
  'failed to get recent blockhash': 'Network is congested. Please try again in a moment.',
  'blockhash not found': 'Transaction expired. Please try again.',
  'insufficient funds': 'Insufficient SOL balance for this transaction.',
  'account not found': 'Account does not exist on-chain.',
  'transaction simulation failed': 'Transaction simulation failed. Check your inputs.',
  'node is behind': 'Solana network is experiencing delays. Please try again.',
  'too many requests': 'Rate limited by RPC. Please wait a moment and retry.',
  'connection refused': 'Unable to connect to Solana network. Check your connection.',
  'timeout': 'Request timed out. The network may be slow.',
  'transaction was not confirmed': 'Transaction was not confirmed within the timeout period.',
};

export function wrapRpcError(error: unknown): {
  message: string;
  code?: string;
  original: unknown;
} {
  const errorMessage =
    error instanceof Error ? error.message : String(error);

  const lowerMessage = errorMessage.toLowerCase();
  for (const [pattern, friendlyMessage] of Object.entries(RPC_ERROR_MAP)) {
    if (lowerMessage.includes(pattern)) {
      return {
        message: friendlyMessage,
        code: pattern.replace(/\s+/g, '_').toUpperCase(),
        original: error,
      };
    }
  }

  return {
    message: 'Something went wrong. Please try again.',
    code: 'UNKNOWN_RPC_ERROR',
    original: error,
  };
}

export async function safeRpcCall<T>(
  fn: () => Promise<T>,
): Promise<{ data: T; error: null } | { data: null; error: ReturnType<typeof wrapRpcError> }> {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (err) {
    const wrappedError = wrapRpcError(err);
    console.error('[AXEL RPC Error]', wrappedError.code, wrappedError.original);
    return { data: null, error: wrappedError };
  }
}
