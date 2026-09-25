import type { Connection } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';
import { vehiclePhoto } from '@/components/catalog/vehiclePhoto';
import { formatCount, formatDate, formatTokenAmount } from '@/lib/format';
import { outstandingShares } from '@/lib/solana/accounts';
import { eligibility, type Eligibility } from '@/lib/solana/eligibility';
import { canClaim } from '@/lib/solana/lifecycle';
import { pendingRevenue, sharesValue } from '@/lib/solana/math';
import { paymentAccountAddress } from '@/lib/solana/pda';
import {
  fetchInvestor,
  fetchPosition,
  fetchProject,
  fetchTokenBalance,
} from '@/lib/solana/readers';
import { carTitle } from '@/lib/solana/tokens';
import type { Project } from '@/types/project';
import {
  claimPlan,
  investPlan,
  serializeUnsigned,
  unsignedTransaction,
} from '../demo/transactions';
import {
  ActionError,
  type ActionGetResponse,
  type ActionPostRequest,
  type ActionPostResponse,
  type LinkedAction,
} from './spec';

/** What the Blink handlers read and build with; tests pass a fixture chain and a fixed clock. */
export interface ActionDeps {
  connection: Connection;
  /** Unix seconds. */
  now: () => number;
  /** Origin of this site, for absolute links and the icon. */
  origin: string;
  /** Where a wallet without KYC gets demo access; null where there is no demo path. */
  demoAccessUrl: string | null;
}

/** Blinks are read by people anywhere; they speak English, like the actions registry. */
const LOCALE = 'en';

/** The quick-pick buttons of the invest Blink, in shares. */
export const QUICK_SHARES = [1n, 3n, 5n] as const;

const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function parseKey(value: unknown, what: string): PublicKey {
  if (typeof value !== 'string' || !BASE58_ADDRESS.test(value)) {
    throw new ActionError(`${what} must be a base58 address`);
  }
  const key = new PublicKey(value);
  if (key.toBase58() !== value) throw new ActionError(`${what} must be a base58 address`);
  return key;
}

async function loadProject(deps: ActionDeps, mintParam: string): Promise<Project> {
  const project = await fetchProject(deps.connection, parseKey(mintParam, 'The share mint'));
  if (!project) throw new ActionError('No AXEL car has this share mint', 404);
  return project;
}

function account(body: unknown): PublicKey {
  return parseKey((body as Partial<ActionPostRequest> | null)?.account, 'account');
}

function icon(deps: ActionDeps, project: Project): string {
  return `${deps.origin}${vehiclePhoto(project.car.make, project.car.model).src}`;
}

function carName(project: Project): string {
  return project.car.name || carTitle(project.car);
}

function amount(project: Project, value: bigint): string {
  return formatTokenAmount(value, project.payment, LOCALE);
}

function sharesWord(count: bigint): string {
  return `${formatCount(count, LOCALE)} ${count === 1n ? 'share' : 'shares'}`;
}

function isRaiseOpen(project: Project, now: number): boolean {
  return project.status === 'fundraising' && now < project.raiseDeadline;
}

const CLOSED_LABEL: Record<Project['status'], string> = {
  fundraising: 'Raise ended',
  funded: 'Sold out',
  operating: 'Sold out',
  paused: 'Sold out',
  failed: 'Raise failed',
  closed: 'Project closed',
};

/** GET /api/actions/invest/[mint]: the car, its raise and the buttons to buy shares. */
export async function investAction(
  deps: ActionDeps,
  mintParam: string,
): Promise<ActionGetResponse> {
  const project = await loadProject(deps, mintParam);
  const now = deps.now();
  const href = `${deps.origin}/api/actions/invest/${project.shareMint.toBase58()}`;
  const remaining = project.totalShares - project.sharesSold;
  const terms =
    `${amount(project, project.pricePerShare)} per share, ` +
    `${formatCount(project.sharesSold, LOCALE)} of ${formatCount(project.totalShares, LOCALE)} sold.`;
  const base = {
    type: 'action' as const,
    icon: icon(deps, project),
    title: `Invest in ${carName(project)}`,
  };

  if (!isRaiseOpen(project, now)) {
    return {
      ...base,
      description: `${terms} This raise is not taking purchases.`,
      label: CLOSED_LABEL[project.status],
      disabled: true,
    };
  }

  const quick: LinkedAction[] = QUICK_SHARES.filter((shares) => shares <= remaining).map(
    (shares) => ({
      type: 'transaction',
      label: `Buy ${sharesWord(shares)}`,
      href: `${href}?shares=${shares}`,
    }),
  );
  return {
    ...base,
    description:
      `${terms} Taxi in ${project.car.city || 'Kazakhstan'}, run by ${project.car.park || 'its park'}. ` +
      `Your payment waits in the car's on-chain escrow until the raise closes on ` +
      `${formatDate(project.raiseDeadline, LOCALE)}; if it misses its goal of ` +
      `${formatCount(project.softCapShares, LOCALE)} shares, you get it back in full. ` +
      `Each share then earns its part of the car's rental income.`,
    label: 'Buy shares',
    links: {
      actions: [
        ...quick,
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
              max: Number(remaining),
            },
          ],
        },
      ],
    },
  };
}

function ineligibleMessage(status: Exclude<Eligibility, 'eligible'>, deps: ActionDeps): string {
  switch (status) {
    case 'unverified':
      return deps.demoAccessUrl
        ? `This wallet has no KYC record yet. Get demo access at ${deps.demoAccessUrl}, then try again.`
        : 'This wallet has no KYC record yet. Pass KYC in the AXEL app first.';
    case 'demoNotAllowed':
      return 'This car does not take demo investors.';
    case 'expired':
      return 'This wallet’s KYC has expired.';
    case 'revoked':
      return 'This wallet’s KYC was revoked.';
    case 'frozen':
      return 'This wallet is frozen by compliance.';
  }
}

/** POST /api/actions/invest/[mint]?shares=N: a purchase for the reader's wallet to sign. */
export async function investTransaction(
  deps: ActionDeps,
  mintParam: string,
  sharesParam: string | null,
  body: unknown,
): Promise<ActionPostResponse> {
  const owner = account(body);
  const project = await loadProject(deps, mintParam);
  const now = deps.now();
  if (!isRaiseOpen(project, now)) throw new ActionError('This raise is not taking purchases');

  const remaining = project.totalShares - project.sharesSold;
  if (!sharesParam || !/^[1-9]\d{0,18}$/.test(sharesParam)) {
    throw new ActionError('Enter a whole number of shares');
  }
  const shares = BigInt(sharesParam);
  if (shares > remaining) {
    throw new ActionError(`Only ${sharesWord(remaining)} are left`);
  }

  const status = eligibility(await fetchInvestor(deps.connection, owner), project.allowsDemo, now);
  if (status !== 'eligible') throw new ActionError(ineligibleMessage(status, deps));

  const cost = sharesValue(shares, project.pricePerShare);
  const balance = await fetchTokenBalance(
    deps.connection,
    paymentAccountAddress(owner, project.paymentMint, project.paymentTokenProgram),
  );
  if (balance < cost) {
    throw new ActionError(
      `${sharesWord(shares)} cost ${amount(project, cost)}; this wallet holds ${amount(project, balance)}.`,
    );
  }

  const { blockhash } = await deps.connection.getLatestBlockhash('confirmed');
  const transaction = unsignedTransaction(
    await investPlan({ project, owner, shares }),
    owner,
    blockhash,
  );
  return {
    type: 'transaction',
    transaction: serializeUnsigned(transaction),
    message: `Buys ${sharesWord(shares)} of ${carName(project)} for ${amount(project, cost)}. The payment waits in escrow until the raise closes.`,
  };
}

/** GET /api/actions/claim/[mint]: a button that claims the reader's payouts from the car. */
export async function claimAction(deps: ActionDeps, mintParam: string): Promise<ActionGetResponse> {
  const project = await loadProject(deps, mintParam);
  const href = `${deps.origin}/api/actions/claim/${project.shareMint.toBase58()}`;
  const base = {
    type: 'action' as const,
    icon: icon(deps, project),
    title: `Claim payouts from ${carName(project)}`,
    label: 'Claim payout',
  };
  const paid =
    `${project.periodCount} ${project.periodCount === 1 ? 'payout' : 'payouts'} so far, ` +
    `${amount(project, project.totalDepositedNet)} paid in for ${sharesWord(outstandingShares(project))}.`;

  if (!canClaim(project.status)) {
    return {
      ...base,
      description: `${paid} Payouts start once the car is on the road.`,
      disabled: true,
    };
  }
  return {
    ...base,
    description: `${paid} Claim sends this wallet's part of the car's rental income to the wallet itself; the program pays it to no other account.`,
    links: { actions: [{ type: 'transaction', label: 'Claim payout', href }] },
  };
}

/** POST /api/actions/claim/[mint]: the reader's claim, when there is anything to claim. */
export async function claimTransaction(
  deps: ActionDeps,
  mintParam: string,
  body: unknown,
): Promise<ActionPostResponse> {
  const owner = account(body);
  const project = await loadProject(deps, mintParam);
  if (!canClaim(project.status)) throw new ActionError('Payouts have not started for this car');

  const position = await fetchPosition(deps.connection, project.address, owner);
  if (!position) throw new ActionError(`This wallet holds no shares of ${carName(project)}`);
  const investor = await fetchInvestor(deps.connection, owner);
  if (investor?.status === 'frozen') {
    throw new ActionError('This wallet is frozen by compliance, so its claims are on hold');
  }
  const pending = pendingRevenue(position, project.accPerShare);
  if (pending === 0n) throw new ActionError('Nothing to claim yet');

  const { blockhash } = await deps.connection.getLatestBlockhash('confirmed');
  const transaction = unsignedTransaction(await claimPlan({ project, owner }), owner, blockhash);
  return {
    type: 'transaction',
    transaction: serializeUnsigned(transaction),
    message: `Claims ${amount(project, pending)} from ${carName(project)} to this wallet.`,
  };
}
