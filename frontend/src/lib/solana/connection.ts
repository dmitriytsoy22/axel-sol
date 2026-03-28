/**
 * Solana RPC Connection Config & Utilities
 *
 * Exports connection configuration (endpoint, commitment, network),
 * Explorer URL builder, and RPC error wrapping helpers.
 *
 * The actual Connection instance will be created in Task 2
 * when @solana/web3.js is installed.
 */

const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

const SOLANA_NETWORK =
  process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';

const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID || '';

/**
 * RPC Connection config.
 * Commitment 'confirmed' — достаточно для чтения PDA-стейта.
 * 'finalized' используем только для подтверждения транзакций.
 */
export const connectionConfig = {
  endpoint: SOLANA_RPC_URL,
  commitment: 'confirmed' as const,
  network: SOLANA_NETWORK,
  programId: PROGRAM_ID,
};

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

/**
 * Known RPC error patterns → user-friendly messages
 */
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

/**
 * Wraps an RPC error into a user-friendly message.
 *
 * @param error - Raw error from RPC call
 * @returns Object with user-friendly message and original error for logging
 */
export function wrapRpcError(error: unknown): {
  message: string;
  code?: string;
  original: unknown;
} {
  const errorMessage =
    error instanceof Error ? error.message : String(error);

  // Match against known patterns
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

  // Fallback — unknown error
  return {
    message: 'Something went wrong. Please try again.',
    code: 'UNKNOWN_RPC_ERROR',
    original: error,
  };
}

/**
 * Safe RPC call wrapper.
 * Catches errors and returns null with a user-friendly error message.
 */
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
