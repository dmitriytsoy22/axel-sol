import { PublicKey } from '@solana/web3.js';
import IDL from './idl-v2/axel_v2.json';

/** Clusters the app can read from; `localnet` is a `solana-test-validator` on this machine. */
export const SOLANA_NETWORKS = ['mainnet-beta', 'devnet', 'testnet', 'localnet'] as const;
export type SolanaNetwork = (typeof SOLANA_NETWORKS)[number];

const DEFAULT_RPC_URL: Record<SolanaNetwork, string> = {
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
  testnet: 'https://api.testnet.solana.com',
  localnet: 'http://127.0.0.1:8899',
};

/** Reads NEXT_PUBLIC_SOLANA_NETWORK; a typo fails the build instead of reading the wrong cluster. */
export function parseNetwork(value: string | undefined): SolanaNetwork {
  if (!value) return 'devnet';
  const network = SOLANA_NETWORKS.find((name) => name === value);
  if (!network) {
    throw new Error(
      `NEXT_PUBLIC_SOLANA_NETWORK must be one of ${SOLANA_NETWORKS.join(', ')}, got "${value}"`,
    );
  }
  return network;
}

export const SOLANA_NETWORK = parseNetwork(process.env.NEXT_PUBLIC_SOLANA_NETWORK);

export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEFAULT_RPC_URL[SOLANA_NETWORK];

/** axel_v2. The IDL carries the address it was built for; a deployment elsewhere sets the env. */
export const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID || IDL.address);

export const connectionConfig = {
  endpoint: SOLANA_RPC_URL,
  commitment: 'confirmed' as const,
  network: SOLANA_NETWORK,
  programId: PROGRAM_ID.toBase58(),
};

/** Solana Explorer link on `network`; a local validator is opened through Explorer's custom RPC. */
export function explorerUrl(
  network: SolanaNetwork,
  rpcUrl: string,
  addressOrSignature: string,
  type: 'address' | 'tx',
): string {
  const path = `https://explorer.solana.com/${type}/${addressOrSignature}`;
  if (network === 'mainnet-beta') return path;
  if (network === 'localnet') {
    return `${path}?cluster=custom&customUrl=${encodeURIComponent(rpcUrl)}`;
  }
  return `${path}?cluster=${network}`;
}

export function getExplorerUrl(
  addressOrSignature: string,
  type: 'address' | 'tx' = 'address',
): string {
  return explorerUrl(SOLANA_NETWORK, SOLANA_RPC_URL, addressOrSignature, type);
}
