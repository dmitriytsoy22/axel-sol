import { ON_TEST_NETWORK } from '@/lib/network';

/**
 * Where each car's published telemetry, income reports and purchase document live, as
 * `<base>/<share mint>/index.json`. On test networks it defaults to the demo seed's files in
 * `public/demo-data`; on mainnet it must be set to the backend's public bucket.
 */
export const PUBLISHED_DATA_URL =
  process.env.NEXT_PUBLIC_PUBLISHED_DATA_URL?.replace(/\/+$/, '') ||
  (ON_TEST_NETWORK ? '/demo-data' : null);
