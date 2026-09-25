// @vitest-environment node
import { describe, expect, it } from 'vitest';
import BN from 'bn.js';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { AccountLayout, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { INVESTOR_FLAGS } from '@/lib/solana/accounts';
import { PROGRAM_ID } from '@/lib/solana/connection';
import { investorAddress, paymentAccountAddress, positionAddress } from '@/lib/solana/pda';
import { fetchProject } from '@/lib/solana/readers';
import {
  addProgramAccount,
  patchProgramAccount,
} from '@/lib/solana/__tests__/fixtures/accountPatch';
import { fixture, key, type FixtureAccount } from '@/lib/solana/__tests__/fixtures/chain';
import {
  decodeAxelInstruction,
  demoAccounts,
  DemoNode,
  FLEET,
  FLEET_MINT,
  NOW,
  PAYMENT_MINT,
  RAISE_MINT,
} from '@/lib/demo/__tests__/fixtures';
import {
  claimAction,
  claimTransaction,
  investAction,
  investTransaction,
  QUICK_SHARES,
  type ActionDeps,
} from '../handlers';
import {
  ActionError,
  actionHeaders,
  actionsJson,
  blinkUrl,
  type ActionPostResponse,
} from '../spec';

const ORIGIN = 'https://axel.example';
const DEMO_URL = `${ORIGIN}/demo`;
const FAILED_MINT = key(fixture.projects.failed.shareMint);
const PRICE = 10_000_000_000n;

function deps(accounts: FixtureAccount[], demoAccessUrl: string | null = DEMO_URL): ActionDeps {
  return { connection: new DemoNode(accounts), now: () => NOW, origin: ORIGIN, demoAccessUrl };
}

async function investor(
  accounts: FixtureAccount[],
  wallet: PublicKey,
  status: 'active' | 'frozen' = 'active',
  flags: number = INVESTOR_FLAGS.demo,
): Promise<FixtureAccount[]> {
  return addProgramAccount(
    'investor',
    investorAddress(wallet),
    {
      wallet,
      status: { [status]: {} } as never,
      flags,
      jurisdiction: 0,
      expiresAt: new BN(NOW + 86_400),
      updatedAt: new BN(NOW),
      provider: { demo: {} } as never,
      bump: 255,
    },
    accounts,
  );
}

/** A Token-2022 test tenge account of `owner` holding `amount`. */
function tkzt(accounts: FixtureAccount[], owner: PublicKey, amount: bigint): FixtureAccount[] {
  const data = Buffer.alloc(AccountLayout.span);
  AccountLayout.encode(
    {
      mint: PAYMENT_MINT,
      owner,
      amount,
      delegateOption: 0,
      delegate: PublicKey.default,
      state: 1,
      isNativeOption: 0,
      isNative: 0n,
      delegatedAmount: 0n,
      closeAuthorityOption: 0,
      closeAuthority: PublicKey.default,
    },
    data,
  );
  return [
    ...accounts,
    {
      address: paymentAccountAddress(owner, PAYMENT_MINT, TOKEN_2022_PROGRAM_ID).toBase58(),
      owner: TOKEN_2022_PROGRAM_ID.toBase58(),
      lamports: 2_074_080,
      data: data.toString('base64'),
    },
  ];
}

async function refusal(promise: Promise<unknown>): Promise<ActionError> {
  const error = await promise.then(
    () => null,
    (failure: unknown) => failure,
  );
  expect(error).toBeInstanceOf(ActionError);
  return error as ActionError;
}

function decoded(response: ActionPostResponse) {
  const transaction = Transaction.from(Buffer.from(response.transaction, 'base64'));
  const call = transaction.instructions.find((instruction) =>
    instruction.programId.equals(PROGRAM_ID),
  );
  return { transaction, call: decodeAxelInstruction(call!.data) };
}

describe('actions.json and headers', () => {
  it('unfurl a car page in every locale into its invest Blink', () => {
    expect(actionsJson(['en', 'ru', 'kk']).rules).toEqual([
      { pathPattern: '/assets/*', apiPath: '/api/actions/invest/*' },
      { pathPattern: '/en/assets/*', apiPath: '/api/actions/invest/*' },
      { pathPattern: '/ru/assets/*', apiPath: '/api/actions/invest/*' },
      { pathPattern: '/kk/assets/*', apiPath: '/api/actions/invest/*' },
      { pathPattern: '/api/actions/**', apiPath: '/api/actions/**' },
    ]);
  });

  it('carry the CORS, version and chain headers of the spec', () => {
    expect(actionHeaders('devnet')).toMatchObject({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
      'Access-Control-Expose-Headers': 'X-Action-Version, X-Blockchain-Ids',
      'X-Action-Version': '2.4',
      'X-Blockchain-Ids': 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    });
    expect(actionHeaders('localnet')).not.toHaveProperty('X-Blockchain-Ids');
  });

  it('link a Blink on dial.to for the app’s cluster', () => {
    const url = `${ORIGIN}/api/actions/invest/${RAISE_MINT.toBase58()}`;
    expect(blinkUrl(url, 'devnet')).toBe(
      `https://dial.to/?action=${encodeURIComponent(`solana-action:${url}`)}&cluster=devnet`,
    );
    expect(blinkUrl(url, 'mainnet-beta')).not.toContain('cluster');
  });
});

describe('invest Blink', () => {
  it('offers 1, 3 and 5 shares and any number up to what is left, at absolute URLs', async () => {
    const action = await investAction(deps(await demoAccounts()), RAISE_MINT.toBase58());
    const href = `${ORIGIN}/api/actions/invest/${RAISE_MINT.toBase58()}`;

    expect(action.icon).toMatch(new RegExp(`^${ORIGIN}/images/.+\\.webp$`));
    expect(action.title).toMatch(/^Invest in /);
    expect(action.description).toContain('10,000 tKZT per share, 12 of 100 sold.');
    expect(action.disabled).toBeUndefined();
    expect(action.links?.actions).toEqual([
      ...QUICK_SHARES.map((shares) => ({
        type: 'transaction',
        label: `Buy ${shares} ${shares === 1n ? 'share' : 'shares'}`,
        href: `${href}?shares=${shares}`,
      })),
      {
        type: 'transaction',
        label: 'Buy',
        href: `${href}?shares={shares}`,
        parameters: [
          {
            type: 'number',
            name: 'shares',
            label: 'Number of shares',
            required: true,
            min: 1,
            max: 88,
          },
        ],
      },
    ]);
  });

  it('drops quick picks larger than what is left', async () => {
    const accounts = await patchProgramAccount(
      'project',
      (await fetchProject(new DemoNode(await demoAccounts()), RAISE_MINT))!.address,
      (project) => ({ ...project, sharesSold: new BN(96) }),
      await demoAccounts(),
    );

    const action = await investAction(deps(accounts), RAISE_MINT.toBase58());

    expect(action.links?.actions.map((link) => link.label)).toEqual([
      'Buy 1 share',
      'Buy 3 shares',
      'Buy',
    ]);
  });

  it('is disabled for a car that is not raising', async () => {
    const action = await investAction(deps(await demoAccounts()), FLEET_MINT.toBase58());

    expect(action).toMatchObject({ disabled: true, label: 'Sold out' });
    expect(action.links).toBeUndefined();
  });

  it('answers 404 for a mint that is no car and 400 for no address', async () => {
    expect(
      (await refusal(investAction(deps(fixture.accounts), PAYMENT_MINT.toBase58()))).status,
    ).toBe(404);
    expect((await refusal(investAction(deps(fixture.accounts), 'not-a-mint'))).status).toBe(400);
  });

  it('builds a purchase the reader signs and pays, capped at the price', async () => {
    const reader = Keypair.generate().publicKey;
    const accounts = tkzt(await investor(await demoAccounts(), reader), reader, 3n * PRICE);

    const response = await investTransaction(deps(accounts), RAISE_MINT.toBase58(), '3', {
      account: reader.toBase58(),
    });

    const { transaction, call } = decoded(response);
    expect(response.type).toBe('transaction');
    expect(transaction.feePayer).toEqual(reader);
    expect(transaction.signatures.map((entry) => entry.publicKey)).toEqual([reader]);
    expect(call?.name).toBe('buyShares');
    const args = call?.data as { shares: BN; maxTotalCost: BN };
    expect(args.shares.toString()).toBe('3');
    expect(args.maxTotalCost.toString()).toBe((3n * PRICE).toString());
    expect(response.message).toContain('Buys 3 shares');
  });

  it('explains what stands in the way instead of handing out a failing transaction', async () => {
    const reader = Keypair.generate().publicKey;
    const verified = await investor(await demoAccounts(), reader);
    const post = (
      accounts: FixtureAccount[],
      shares: string | null,
      demoUrl: string | null = DEMO_URL,
    ) =>
      refusal(
        investTransaction(deps(accounts, demoUrl), RAISE_MINT.toBase58(), shares, {
          account: reader.toBase58(),
        }),
      );

    expect((await post(await demoAccounts(), '1')).message).toContain(DEMO_URL);
    expect((await post(await demoAccounts(), '1', null)).message).toContain('Pass KYC');
    expect((await post(tkzt(verified, reader, PRICE), '2')).message).toBe(
      '2 shares cost 20,000 tKZT; this wallet holds 10,000 tKZT.',
    );
    expect((await post(verified, '89')).message).toBe('Only 88 shares are left');
    for (const shares of [null, '0', '1.5', 'abc']) {
      expect((await post(verified, shares)).message).toBe('Enter a whole number of shares');
    }
    const plainProject = await investor(fixture.accounts, reader);
    expect((await post(plainProject, '1')).message).toBe('This car does not take demo investors.');
    expect(
      (
        await refusal(
          investTransaction(deps(verified), RAISE_MINT.toBase58(), '1', { account: 'nope' }),
        )
      ).message,
    ).toBe('account must be a base58 address');
    expect(
      (
        await refusal(
          investTransaction(deps(verified), FAILED_MINT.toBase58(), '1', {
            account: reader.toBase58(),
          }),
        )
      ).message,
    ).toBe('This raise is not taking purchases');
  });
});

describe('claim Blink', () => {
  const holder = key(fixture.projects.operating.holders[1]);

  it('offers one claim button on a car that pays out, and none before', async () => {
    const accounts = await demoAccounts();

    expect((await claimAction(deps(accounts), FLEET_MINT.toBase58())).links?.actions).toEqual([
      {
        type: 'transaction',
        label: 'Claim payout',
        href: `${ORIGIN}/api/actions/claim/${FLEET_MINT.toBase58()}`,
      },
    ]);
    expect(await claimAction(deps(accounts), RAISE_MINT.toBase58())).toMatchObject({
      disabled: true,
    });
  });

  it('builds the holder’s claim with the amount the program will pay', async () => {
    const response = await claimTransaction(deps(await demoAccounts()), FLEET_MINT.toBase58(), {
      account: holder.toBase58(),
    });

    const { transaction, call } = decoded(response);
    expect(call?.name).toBe('claim');
    expect(transaction.feePayer).toEqual(holder);
    // The fixture records what this holder's real claim paid: 668.981479 tKZT.
    expect(fixture.projects.operating.claims[1]).toEqual({
      owner: holder.toBase58(),
      paid: '668981479',
    });
    expect(response.message).toBe(
      `Claims 668.98 tKZT from ${(await fetchProject(new DemoNode(await demoAccounts()), FLEET_MINT))!.car.name} to this wallet.`,
    );
  });

  it('refuses a wallet without shares, with nothing to claim, or frozen', async () => {
    const stranger = Keypair.generate().publicKey;
    const project = (await fetchProject(new DemoNode(await demoAccounts()), FLEET_MINT))!;
    const settled = await addProgramAccount(
      'position',
      positionAddress(FLEET, stranger),
      {
        project: FLEET,
        owner: stranger,
        shares: new BN(5),
        accCheckpoint: new BN(project.accPerShare.toString()),
        accrued: new BN(0),
        totalClaimed: new BN(0),
        paidIn: new BN(0),
        bump: 255,
      },
      await investor(await demoAccounts(), stranger),
    );
    const post = (accounts: FixtureAccount[], wallet: PublicKey) =>
      refusal(
        claimTransaction(deps(accounts), FLEET_MINT.toBase58(), { account: wallet.toBase58() }),
      );

    expect((await post(await demoAccounts(), stranger)).message).toContain('holds no shares');
    expect((await post(settled, stranger)).message).toBe('Nothing to claim yet');
    const frozen = await patchProgramAccount(
      'investor',
      investorAddress(holder),
      (record) => ({ ...record, status: { frozen: {} } as never }),
      await demoAccounts(),
    );
    expect((await post(frozen, holder)).message).toContain('frozen');
  });
});
