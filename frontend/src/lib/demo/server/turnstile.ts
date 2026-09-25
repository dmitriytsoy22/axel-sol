const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Asks Cloudflare whether a Turnstile token is a solved challenge. A token is single-use, so
 * a replayed one fails here too.
 */
export async function verifyTurnstile(
  secret: string,
  token: string,
  remoteIp: string | null,
  fetcher: Fetch = fetch,
): Promise<boolean> {
  const form = new URLSearchParams({ secret, response: token });
  if (remoteIp) form.set('remoteip', remoteIp);
  const response = await fetcher(SITEVERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Turnstile siteverify answered ${response.status}`);
  const outcome = (await response.json()) as { success?: unknown };
  return outcome.success === true;
}
