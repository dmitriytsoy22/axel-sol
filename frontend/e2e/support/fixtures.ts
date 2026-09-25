import { expect, test as base, type Page } from '@playwright/test';
import { Keypair } from '@solana/web3.js';
import { E2E_BURNER_STORAGE_KEY } from '../../src/lib/solana/e2eBurnerKey';
import { readStackInfo, type StackInfo } from '../stack/config';

interface Fixtures {
  /** Addresses of the seeded chain the stack runs on. */
  stack: StackInfo;
  /** A wallet of this test alone, with no KYC record, SOL or tokens; the app's E2E Burner signs with it. */
  wallet: Keypair;
}

export const test = base.extend<Fixtures>({
  // An exception nobody caught in the page fails the test, even if every step looked right.
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
    await use(page);
    expect(errors, 'uncaught exceptions in the page').toEqual([]);
  },
  // Playwright reads a fixture's dependencies from the first argument's destructuring.
  stack: async ({}, use) => {
    await use(readStackInfo());
  },
  wallet: async ({ context }, use) => {
    const wallet = Keypair.generate();
    await context.addInitScript(
      ({ key, secretKey }) => window.localStorage.setItem(key, secretKey),
      { key: E2E_BURNER_STORAGE_KEY, secretKey: JSON.stringify(Array.from(wallet.secretKey)) },
    );
    await use(wallet);
  },
});

export { expect };

/** Connects the burner through the wallet picker in the header, as a reader picks a wallet. */
export async function connectWallet(page: Page, wallet: Keypair): Promise<void> {
  const header = page.getByRole('banner');
  await header.getByRole('button', { name: 'Connect wallet' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /E2E Burner/ })
    .click();
  const address = wallet.publicKey.toBase58();
  await expect(
    header.getByRole('button', { name: `${address.slice(0, 4)}…${address.slice(-4)}` }),
  ).toBeVisible();
}
