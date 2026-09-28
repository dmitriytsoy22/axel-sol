import { createHash, generateKeyPairSync } from 'node:crypto';
import type { Locator, Page } from 'playwright';
import type { Director } from './director';
import type { Wallet } from './wallet';

/*
 * What the video shows, in order, with its captions. Every step waits for what the page shows
 * on its own, so the same storyline records the local stack or a deployed site: the cars and
 * the demo desk's fleet car are found through the app, never by address. Figures in a caption
 * are read from the page, so they are what the viewer sees.
 *
 * Captions must stay true to the product: no users, partners or revenue. The cluster and the
 * fictional demo data are named by the producer's title card, caption-strip badge and end card.
 * `say` is the same sentence written for the voice.
 */

export interface Story {
  wallet: Wallet;
  /** Whether the storyline ends in the console as the platform admin. */
  console: boolean;
}

/** The smallest element in `scope` that contains every one of `texts`. */
function around(scope: Page | Locator, ...texts: (string | RegExp)[]): Locator {
  // A filter's inner locator is matched inside each candidate, so it starts from the page.
  const page = 'mainFrame' in scope ? scope : scope.page();
  let locator = scope.locator('div, section, li, dl');
  for (const text of texts) {
    locator = locator.filter({ has: page.getByText(text, { exact: typeof text === 'string' }) });
  }
  return locator.last();
}

/** A step of the /demo walkthrough, found by its title. */
function demoStep(page: Page, title: string): Locator {
  return page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

/** The address of a wallet made just now, which therefore has no KYC record. */
function newWalletAddress(): string {
  const der = generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' });
  const bytes = [...der.subarray(-32)];
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = bytes.reduce((sum, byte) => sum * 256n + BigInt(byte), 0n);
  let out = '';
  while (value > 0n) {
    out = alphabet[Number(value % 58n)] + out;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = `1${out}`;
  }
  return out;
}

/** What the text of `target` becomes once it differs from `before`. */
async function changedText(d: Director, target: Locator, before: string): Promise<string> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const now = await target.innerText();
    if (now !== before) return now;
    if (Date.now() > deadline) throw new Error(`${target.toString()} stayed "${before}"`);
    await d.pause(250);
  }
}

async function landing(d: Director): Promise<void> {
  const page = d.page;
  await d.goto('/', page.getByText(/^Live from Solana /));

  const stats = around(page, 'Cars listed', 'Payout periods');
  await d.caption(
    'AXEL: shares of one working taxi in Kazakhstan, paid out on Solana. Every figure here is read from the chain.',
    async () => {
      await d.pause(400);
      await d.moveTo(page.getByRole('heading', { level: 1 }), 1000);
      await d.scrollTo(stats, 900, 300);
      await d.frame(stats);
      await d.moveTo(page.getByText('Shares sold', { exact: true }));
    },
    {
      say: 'Axel: shares of one working taxi in Kazakhstan, paid out on Solana. Every figure here is read from the chain.',
    },
  );

  const fleet = page.locator('#vehicles');
  const raising = fleet.locator('a[href*="/assets/"]').filter({ hasText: 'Raising' }).first();
  await d.caption(
    "Each car has its own Token-2022 share mint. Let's open one that is still raising.",
    async () => {
      await d.scrollTo(raising, 1400, 140);
      await d.frame(raising);
      await d.pause(500);
      // The whole card is a link; its title is in view, its "Buy shares" line may not be.
      await d.follow(
        raising.getByRole('heading'),
        page.getByTestId('escrow-balance').getByText(/tKZT$/),
      );
    },
    {
      say: "Each car has its own Token twenty twenty-two share mint. Let's open one that is still raising.",
    },
  );
}

async function carPage(d: Director): Promise<void> {
  const page = d.page;
  const panel = page.getByRole('region', { name: 'Buy shares' });
  const escrow = page.getByTestId('escrow-balance');

  await d.caption(
    "Make, model and park come from the mint's on-chain metadata. The photo is illustrative.",
    async () => {
      await d.frame(around(page, /^Raising$/, /Demo Park/));
      await d.moveTo(page.getByText('Illustrative photo'), 1000);
    },
  );

  await d.caption(
    "Shares sold against the goal. Buyers' money sits in the program's escrow, read live.",
    async () => {
      await d.frame(
        panel.getByText(/shares sold$/),
        panel.getByRole('progressbar'),
        panel.getByText(/^Raise closes /),
      );
      await d.moveTo(panel.getByRole('progressbar'));
      await d.pause(1200);
      await d.clearFrames();
      await d.frame(escrow);
      await d.moveTo(escrow.getByText('In escrow now'));
    },
  );

  const timeline = page.getByRole('region', { name: 'Where this car stands' });
  await d.caption(
    'Goal missed, or car not bought in time? Every buyer takes back exactly what they paid.',
    async () => {
      await d.scrollTo(timeline, 1200);
      await d.frame(timeline);
      await d.moveTo(timeline.getByText('Car bought, money released'));
    },
  );

  const demoLink = panel.getByRole('link', { name: 'Get demo access' });
  await d.caption(
    'Buying needs a KYC record. Judges can get a demo one.',
    async () => {
      await d.scrollToTop(1100);
      await d.frame(demoLink);
      await d.pause(400);
      await d.follow(
        demoLink,
        page.getByRole('heading', { name: 'Try the whole cycle in two minutes' }),
      );
    },
    { say: 'Buying needs a K Y C record. Judges can get a demo one.' },
  );
}

async function demoAccess(d: Director, { wallet }: Story): Promise<void> {
  const page = d.page;
  const burner = wallet.label.source.includes('Burner');
  const access = demoStep(page, 'Get demo access');

  await d.caption(
    burner
      ? 'Judges only need a wallet. Here a local burner test wallet stands in for Phantom.'
      : 'Judges only need a wallet, such as Phantom, switched to devnet.',
    async () => {
      await d.frame(around(page, 'Connect a wallet to start', 'What the demo gives your wallet'));
      await d.click(page.getByRole('main').getByRole('button', { name: 'Connect wallet' }));
      // The wallet dialog scrolls the page behind it; the page should stay where it was.
      await page.evaluate('window.scrollTo(0, 0)');
      await d.click(page.getByRole('dialog').getByRole('button', { name: wallet.label }), {
        settle: 0,
      });
      await wallet.approve(d, () => access.waitFor());
      // The open raises load a moment after the steps; until then step 2 says there are none.
      await d.cut(() =>
        demoStep(page, 'Buy shares in an open raise')
          .getByRole('link', { name: 'Open' })
          .first()
          .waitFor(),
      );
    },
  );

  await d.caption(
    'One signed message writes a 29-day demo KYC record and sends 50,000 test tenge.',
    async () => {
      await d.frame(access);
      const sign = access.getByRole('button', { name: 'Sign and get access' });
      // A deployment with Cloudflare Turnstile enables the button once a person passes it.
      await d.cut(() => d.enabled(sign));
      await d.click(sign, { settle: 0 });
      await wallet.approve(d, () => access.getByText(/^Balance: /).waitFor());
      // The header reads the wallet's SOL every 30 seconds; the faucet's 0.01 SOL shows by then.
      const chip = page.locator('#wallet-chip');
      await d.cut(async () => {
        const deadline = Date.now() + 45_000;
        while (/(^|\s)0(\.0+)? SOL/.test(await chip.innerText()) && Date.now() < deadline) {
          await d.pause(500);
        }
      });
      await d.moveTo(access.getByText(/^Balance: /));
    },
    {
      say: 'One signed message writes a 29-day demo K Y C record, and sends fifty thousand test tenge.',
    },
  );
}

async function buy(d: Director, { wallet }: Story): Promise<void> {
  const page = d.page;
  const step = demoStep(page, 'Buy shares in an open raise');
  const panel = page.getByRole('region', { name: 'Buy shares' });
  const buyButton = panel.getByRole('button', { name: 'Buy shares' });
  const escrow = page.getByTestId('escrow-balance');

  await d.caption('The wallet is verified now, so the open raise accepts it.', async () => {
    await d.frame(step);
    await d.follow(step.getByRole('link', { name: 'Open' }).first(), buyButton);
    await d.frame(buyButton);
    await d.moveTo(buyButton);
  });

  const dialog = page.getByRole('dialog', { name: 'Buy shares' });
  await d.caption(
    'Before anything is signed, the dialog explains the escrow and the exact refund rule.',
    async () => {
      await d.click(buyButton, { settle: 600 });
      const safeguards = around(dialog, 'Where your money goes', /^You pay in /);
      await d.scrollIntoView(safeguards);
      await d.frame(safeguards);
      await d.moveTo(dialog.getByText('Where your money goes'));
    },
  );

  const added = dialog.getByText('2 shares were added to your wallet.');
  await d.caption(
    'Two shares: the payment goes into escrow, and the shares are minted to this wallet.',
    async () => {
      await d.type(dialog.getByLabel('Number of shares'), '2');
      await d.frame(around(dialog, 'You pay'));
      await d.pause(900);
      await d.clearFrames();
      await d.click(dialog.getByRole('button', { name: 'Confirm purchase' }), { settle: 0 });
      await wallet.approve(d, () => added.waitFor());
      await d.moveTo(added);
    },
  );

  await d.cut(async () => {
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await panel.getByText('Your shares: 2.').waitFor();
    // The balance is read live and lands a moment after the purchase is confirmed.
    await escrow.getByText(/exactly what buyers paid$/).waitFor();
    await d.pause(500);
  });
  await d.caption('The escrow grew by exactly what was paid.', async () => {
    await d.frame(escrow);
    await d.moveTo(escrow.getByText(/exactly what buyers paid$/));
  });
}

async function fleetShares(d: Director): Promise<void> {
  const page = d.page;
  const shares = demoStep(page, 'Receive shares of a car on the road');
  await d.goto('/demo', shares);
  await d.caption(
    "The demo gives this wallet 5 shares of a car already on the road. The transfer hook checks both wallets' KYC.",
    async () => {
      await d.scrollTo(shares, 1000, 160);
      await d.frame(shares);
      await d.click(shares.getByRole('button', { name: /^Receive \d+ shares$/ }), { settle: 0 });
      await d.cut(() => shares.getByText(/^You hold \d+ shares of /).waitFor());
      await d.moveTo(shares.getByText(/^You hold \d+ shares of /));
    },
    {
      say: "The demo gives this wallet five shares of a car already on the road. The transfer hook checks both wallets' K Y C.",
    },
  );
}

async function payout(d: Director, { wallet }: Story): Promise<void> {
  const page = d.page;
  const simulate = demoStep(page, 'Simulate a month of income');
  const ready = simulate.getByText(/^Ready to claim: \d/);
  await d.caption(
    "Simulate a month: the operator deposits the car's income, co-signed by its oracle.",
    async () => {
      await d.scrollTo(simulate, 1000, 160);
      await d.frame(simulate);
      await d.click(simulate.getByRole('button', { name: 'Simulate a month' }), { settle: 0 });
      await d.cut(() => ready.waitFor());
      // The step grows with its result; the frame follows it.
      await d.clearFrames();
      await d.frame(simulate);
      await d.moveTo(ready);
    },
  );

  const access = demoStep(page, 'Get demo access');
  const balance = access.getByText(/^Balance: /);
  const before = await balance.innerText();
  const claim = demoStep(page, 'Claim your payout');
  const claimed = claim.getByText(/^You have claimed /);
  await d.caption(
    "Claim: the program pays this wallet's exact share into its own tKZT account.",
    async () => {
      await d.frame(claim);
      await d.click(claim.getByRole('button', { name: /^Claim / }), { settle: 0 });
      await wallet.approve(d, () => claimed.waitFor());
      await d.moveTo(claimed);
    },
    { say: "Claim: the program pays this wallet's exact share into its own test tenge account." },
  );

  // The balance is read again once the claim lands; the caption quotes what the page shows.
  const after = await d.cut(() => changedText(d, balance, before));
  const amount = (text: string) => text.replace(/^Balance: /, '').replace(/ tKZT$/, '');
  const spoken = (text: string) => amount(text).replace(/\.00$/, '');
  const paid = (await claimed.innerText()).match(/^You have claimed (.+) from /)![1];
  await d.caption(
    `+${paid}: the wallet's balance went from ${amount(before)} to ${amount(after)} tKZT.`,
    async () => {
      await d.scrollTo(access, 1000, 160);
      await d.frame(balance);
      // Next to the figures, not over them.
      await d.moveTo(access.getByText(/^This wallet is verified until /));
    },
    {
      say: `The wallet's balance went from ${spoken(before)} to ${spoken(after)} test tenge.`,
    },
  );
}

async function portfolio(d: Director): Promise<void> {
  const page = d.page;
  const holdings = page.getByTestId('holdings-table');
  // Captions start on the page they describe, so the way there comes first.
  await d.scrollToTop(700);
  await d.follow(page.getByRole('banner').getByRole('link', { name: 'Portfolio' }), holdings);
  await d.caption('The portfolio reads both positions straight from Solana.', async () => {
    await d.scrollTo(holdings, 900, 140);
    await d.frame(holdings);
    await d.moveTo(holdings.getByRole('row').nth(1));
  });

  const dialog = page.getByRole('dialog', { name: 'Send shares' });
  const recipient = dialog.getByLabel("Recipient's wallet");
  const refusal = dialog.getByText("This wallet hasn't passed KYC, so it can't receive shares.");
  await d.caption(
    'Shares go only to KYC-verified wallets. The transfer hook would refuse this new wallet, so the app stops here.',
    async () => {
      await d.click(holdings.getByRole('button', { name: 'Send', exact: true }).first(), {
        settle: 600,
      });
      await d.paste(recipient, newWalletAddress());
      await refusal.waitFor();
      const send = dialog.getByRole('button', { name: 'Send shares' });
      await d.frame(recipient, refusal, send);
      await d.moveTo(send);
    },
    {
      say: 'Shares go only to K Y C verified wallets. The transfer hook would refuse this new wallet, so the app stops here.',
    },
  );
  await d.cut(async () => {
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
  });
}

async function verify(d: Director): Promise<void> {
  const page = d.page;
  const check = demoStep(page, "Check the car's data yourself");
  await d.goto('/demo', check);
  const section = page.getByRole('region', { name: "Check the car's data yourself" });
  const verifyButton = section.getByRole('button', { name: 'Verify in this browser' });
  // The caption belongs to the car's page, so it starts once that page is there.
  await d.cut(() => d.scrollTo(check, 400, 160));
  await d.follow(check.getByRole('link', { name: /^Check / }), verifyButton);

  await d.caption(
    "Solana keeps only fingerprints: a hash chain of daily trip data, and each report's hash.",
    async () => {
      await d.scrollTo(section, 900);
      await d.frame(around(section, 'Trip days on-chain', 'Attested reports'));
      await d.moveTo(section.getByText('Chain head'));
    },
  );

  const verified = section.getByText('Trip data verified', { exact: true });
  await d.caption(
    'The browser recomputes every hash and rebuilds the exact chain head Solana holds.',
    async () => {
      await d.click(verifyButton, { settle: 0 });
      await d.cut(() => verified.waitFor());
      await d.frame(around(section, 'Trip data verified', /^Your browser rebuilt the chain/));
      await d.moveTo(verified);
    },
  );

  await d.caption(
    'Each income report matches its on-chain hash. The simulated month is labelled as such.',
    async () => {
      await d.scrollTo(section.getByText('Income deposits', { exact: true }), 1400, 140);
      await d.frame(around(section, 'Income deposits', 'Simulated demo month'));
      await d.moveTo(section.getByText('Simulated demo month', { exact: true }));
    },
  );
}

async function solvency(d: Director): Promise<void> {
  const page = d.page;
  const verdict = page.getByText(/pass(es)? every check$/);
  await d.scrollToTop(900);
  await d.follow(page.getByRole('banner').getByRole('link', { name: 'Solvency' }), verdict);
  await d.caption(
    'Proof of solvency: every vault checked live against what the program owes holders.',
    async () => {
      await d.frame(around(page, /pass(es)? every check$/, /^The vaults hold at least/));
      await d.moveTo(verdict);
      await d.pause(1400);
      await d.frame(around(page, 'In income vaults', 'In raise escrows'));
      await d.moveTo(page.getByText('Owed to holders now', { exact: true }));
    },
  );
}

/** The hash the console publishes for the demo car's purchase papers, which are fictional. */
const PURCHASE_DOCS_HASH = createHash('sha256')
  .update('AXEL demo video: fictional purchase documents')
  .digest('hex');

async function operatorConsole(d: Director, { wallet }: Story): Promise<void> {
  const page = d.page;
  if (!(await wallet.becomeAdmin(d))) return;
  const release = page.getByText('Release the raise', { exact: true });
  await d.goto('/admin', page.getByText(/^Console · signed in as /));

  // A funded car shows the admin's weightiest control: the release. A stack whose funded car was
  // released by an earlier take has none, and the scene keeps only the fees.
  const funded = await d.cut(async () => {
    // The select sits inside its label, so its accessible name also holds the selected car.
    const select = page.getByRole('combobox', { name: /^Car\b/ });
    await select.waitFor();
    const values = await select
      .locator('option')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
    for (const value of values) {
      await select.selectOption(value);
      await d.pause(600);
      if (await release.isVisible()) return true;
    }
    return false;
  });

  if (funded) {
    const metrics = page.locator('dl[aria-label="Project figures"]');
    const releaseStep = around(page, 'Release the raise', 'SHA-256 of the purchase documents');
    await d.caption(
      'Once the car is bought, the admin releases the raise with the hash of its purchase papers.',
      async () => {
        await d.scrollTo(page.getByRole('heading', { name: 'Car status' }), 1200, 140);
        await d.frame(releaseStep);
        await d.paste(page.getByLabel('SHA-256 of the purchase documents'), PURCHASE_DOCS_HASH);
        await d.click(page.getByRole('button', { name: 'Release to the operator' }), { settle: 0 });
        await wallet.approve(d, () => release.waitFor({ state: 'hidden' }));
        // The step is gone once the car is on the road; the frame would sit on other controls.
        await d.clearFrames();
        const toast = page.getByText('Raise released to the operator', { exact: true });
        if (await toast.isVisible()) await d.moveTo(toast);
      },
    );
    await d.caption(
      'The escrow is empty now: it paid the operator, minus the raise fee. The car is on the road.',
      async () => {
        await d.scrollToTop(1000);
        await d.cut(() => metrics.getByText('On the road', { exact: true }).waitFor());
        await d.frame(metrics);
        await d.moveTo(metrics.getByText('In escrow', { exact: true }));
      },
    );
  }

  const fee = async (label: string) =>
    (await page.getByText(label, { exact: true }).locator('xpath=..').innerText()).match(
      /\d+(\.\d+)?%/,
    )![0];
  const onRaises = await fee('Fee on raises');
  const onIncome = await fee('Fee on income');
  await d.caption(
    `How AXEL earns: ${onRaises} of each raise and ${onIncome} of income in this demo. The program caps them at 5% and 20%.`,
    async () => {
      await d.frame(around(page, 'Fee on raises'), around(page, 'Fee on income'));
      await d.moveTo(page.getByText('Fee on income', { exact: true }));
    },
    {
      say: `How Axel earns: ${onRaises} of each raise, and ${onIncome} of income in this demo. The program caps them at 5 and 20 percent.`,
    },
  );
}

export async function tell(d: Director, story: Story): Promise<void> {
  await landing(d);
  await carPage(d);
  await demoAccess(d, story);
  await buy(d, story);
  await fleetShares(d);
  await payout(d, story);
  await portfolio(d);
  await verify(d);
  await solvency(d);
  if (story.console) await operatorConsole(d, story);
}
