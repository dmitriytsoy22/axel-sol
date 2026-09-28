import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STACK_DIR, URLS } from '../../frontend/e2e/stack/config';
import globalSetup from '../../frontend/e2e/stack/global-setup';
import { KeyRing } from '../seed-devnet/lib/keys';

/*
 * The e2e suite's local stack (frontend/e2e/stack): a validator with axel_v2, the demo seed,
 * the backend, the published-data server and `next dev` with the burner wallet. The video seeds
 * the small fleet, eight cars instead of six, so the catalog has more than one car per state.
 */

export const LOCAL_URL = URLS.frontend;

/** What the recorder needs beyond stack.json: the seed's secret, to derive the admin key. */
const VIDEO_STACK_FILE = join(STACK_DIR, 'demo-video.json');

export async function startLocalStack(): Promise<() => Promise<void>> {
  const secret = randomBytes(32).toString('hex');
  process.env.E2E_SEED_SCALE = 'small';
  process.env.E2E_SEED_SECRET = secret;
  const teardown = await globalSetup();
  writeFileSync(VIDEO_STACK_FILE, JSON.stringify({ secret }));
  return teardown;
}

/** The secret key of the running local stack's platform admin, derived as the seed derives it. */
export function localAdminSecretKey(): number[] {
  const { secret } = JSON.parse(readFileSync(VIDEO_STACK_FILE, 'utf8')) as { secret: string };
  // A role key does not depend on the run's scope.
  return Array.from(new KeyRing(secret, 'localnet', '').role('admin').secretKey);
}
