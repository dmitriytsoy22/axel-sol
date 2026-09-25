import type { Page } from '@playwright/test';
import { formatTokenAmount } from '../src/lib/format';
import { indexedClaimTotals, paymentBalance } from './support/chain';
import { connectWallet, expect, test } from './support/fixtures';

/** One step of the /demo walkthrough, found by its title. */
function demoStep(page: Page, title: string) {
  return page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

test('a judge gets demo access, buys into a raise, claims a simulated month, then checks the data and the vaults', async ({
  page,
  request,
  stack,
  wallet,
}) => {
  const access = demoStep(page, 'Get demo access');
  const buy = demoStep(page, 'Buy shares in an open raise');
  const shares = demoStep(page, 'Receive shares of a car on the road');
  const simulate = demoStep(page, 'Simulate a month of income');
  const claim = demoStep(page, 'Claim your payout');

  await test.step('connect a wallet on the demo page and get demo access', async () => {
    await page.goto('/demo');
    await connectWallet(page, wallet);
    await access.getByRole('button', { name: 'Sign and get access' }).click();

    await expect(access.getByText('Done', { exact: true })).toBeVisible();
    await expect(access.getByText('Balance: 50,000 tKZT', { exact: true })).toBeVisible();
  });

  await test.step('buy one share in the open raise', async () => {
    await buy.getByRole('link', { name: 'Open' }).click();
    await expect(page).toHaveURL(`/assets/${stack.raise.mint}`);

    const panel = page.getByRole('region', { name: 'Buy shares' });
    await panel.getByRole('button', { name: 'Buy shares' }).click();
    const dialog = page.getByRole('dialog', { name: 'Buy shares' });
    await dialog.getByLabel('Number of shares').fill('1');
    await dialog.getByRole('button', { name: 'Confirm purchase' }).click();
    await expect(dialog.getByText('1 share was added to your wallet.')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(dialog).toBeHidden();
    await expect(panel.getByText('Your shares: 1.')).toBeVisible();
    await page.goto('/demo');
    await expect(buy.getByText('Done', { exact: true })).toBeVisible();
  });

  await test.step('receive shares of the demo fleet car from the desk', async () => {
    await shares.getByRole('button', { name: 'Receive 5 shares' }).click();

    await expect(shares.getByText('Done', { exact: true })).toBeVisible();
    await expect(shares.getByText(/^You hold 5 shares of /)).toBeVisible();
  });

  await test.step('simulate a month and claim its payout', async () => {
    await simulate.getByRole('button', { name: 'Simulate a month' }).click();
    const ready = simulate.getByText(/^Ready to claim: \d/);
    await expect(ready).toBeVisible();
    const amount = (await ready.innerText()).replace('Ready to claim: ', '');
    const balanceBefore = await paymentBalance(stack, wallet.publicKey);

    await claim.getByRole('button', { name: `Claim ${amount}` }).click();

    await expect(claim.getByText(`You have claimed ${amount} from this car.`)).toBeVisible();
    await expect(claim.getByText('Done', { exact: true })).toBeVisible();
    const received = (await paymentBalance(stack, wallet.publicKey)) - balanceBefore;
    expect(formatTokenAmount(received, stack.payment, 'en')).toBe(amount);
    await expect
      .poll(() => indexedClaimTotals(request, wallet.publicKey), {
        message: 'the backend indexer records the claim',
      })
      .toEqual([{ project: stack.fleet.project, amount: received.toString(), claims: 1 }]);
  });

  await test.step("verify the demo fleet car's published data in the browser", async () => {
    await demoStep(page, "Check the car's data yourself")
      .getByRole('link', { name: /^Check / })
      .click();
    await expect(page).toHaveURL(`/assets/${stack.fleet.mint}#verify-data-title`);

    const verify = page.getByRole('region', { name: "Check the car's data yourself" });
    await verify.getByRole('button', { name: 'Verify in this browser' }).click();

    await expect(verify.getByText('Trip data verified', { exact: true })).toBeVisible();
    await expect(verify.getByText('Report matches', { exact: true })).toHaveCount(
      stack.fleet.seededPayouts,
    );
    await expect(verify.getByText('Simulated demo month', { exact: true })).toHaveCount(1);
    await expect(verify.getByText('Match the hash recorded at release')).toBeVisible();
  });

  await test.step('see every car pass the proof of solvency', async () => {
    await page.goto('/demo');
    await demoStep(page, 'See the proof of solvency')
      .getByRole('link', { name: 'Open the proof of solvency' })
      .click();
    await expect(page).toHaveURL(`/solvency#${stack.fleet.mint}`);

    await expect(page.getByText(`All ${stack.cars} cars pass every check`)).toBeVisible();
  });
});
