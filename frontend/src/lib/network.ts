import { connectionConfig } from '@/lib/solana/connection';

/** The cluster the app reads from, as people say it: "devnet", "testnet", "mainnet". */
export const NETWORK_NAME =
  connectionConfig.network === 'mainnet-beta' ? 'mainnet' : connectionConfig.network;

/** On any cluster but mainnet, tokens and prices are test values and the UI says so. */
export const ON_TEST_NETWORK = connectionConfig.network !== 'mainnet-beta';
