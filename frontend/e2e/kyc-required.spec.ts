import { Keypair } from '@solana/web3.js';
import { URLS } from './stack/config';
import { connectWallet, expect, test } from './support/fixtures';

test('a wallet without KYC cannot buy shares in an open raise', async ({ page, stack, wallet }) => {
  await page.goto(`/assets/${stack.raise.mint}`);
  await connectWallet(page, wallet);
  const panel = page.getByRole('region', { name: 'Buy shares' });

  await expect(panel.getByRole('button', { name: 'Wallet not verified' })).toBeDisabled();
  await expect(
    panel.getByText("This wallet hasn't passed KYC. Shares only go to verified wallets."),
  ).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Buy shares' })).toHaveCount(0);
  await expect(panel.getByRole('link', { name: 'Get demo access' })).toBeVisible();
});

test('the invest Blink refuses to build a purchase for a wallet without KYC', async ({
  request,
  stack,
}) => {
  const wallet = Keypair.generate().publicKey.toBase58();

  const response = await request.post(`/api/actions/invest/${stack.raise.mint}?shares=1`, {
    data: { account: wallet },
  });

  expect(response.status()).toBe(400);
  expect(await response.json()).toEqual({
    message: `This wallet has no KYC record yet. Get demo access at ${URLS.frontend}/demo, then try again.`,
  });
});
