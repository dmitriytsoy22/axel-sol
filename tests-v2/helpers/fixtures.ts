import { Keypair, PublicKey } from "@solana/web3.js";
import { bn, TestEnv, type TxResult } from "./env";
import { expectOk } from "./assert";
import {
  activateProjectIx,
  buySharesIx,
  claimIx,
  closeProjectIx,
  createProjectIx,
  depositRevenueIx,
  initializeConfigIx,
  InvestorFlag,
  InvestorStatus,
  KycProvider,
  openPositionIx,
  pauseProjectIx,
  RevenueKind,
  setInvestorIx,
  transferSharesIx,
  type CreateProjectParams,
  type DepositRevenueParams,
  type InitializeConfigParams,
  type ProjectRef,
} from "./instructions";
import { escrowAddress, projectPda, revenueAddress } from "./pda";
import { createMint, mintTo, TOKEN_PROGRAM_ID, type MintExtension } from "./tokens";

export const DAY = 86_400n;
const KAZAKHSTAN = 398;

export interface Roles {
  admin: Keypair;
  kyc: Keypair;
  demoKyc: Keypair;
  treasury: Keypair;
}

export function newRoles(env: TestEnv): Roles {
  return {
    admin: env.newAccount(),
    kyc: env.newAccount(),
    demoKyc: env.newAccount(),
    treasury: env.newAccount(),
  };
}

/** Owner veto window of share recoveries, the mainnet minimum. */
export const RECOVERY_DELAY = 3n * DAY;

/**
 * Devnet-style settings: 60 s minimum raise, 7 day activation window, fees below the caps,
 * and the 72 hour recovery delay mainnet requires.
 */
export function configParams(
  roles: Roles,
  paymentMint: PublicKey = Keypair.generate().publicKey,
): InitializeConfigParams {
  return {
    admin: roles.admin.publicKey,
    kycAuthority: roles.kyc.publicKey,
    demoKycAuthority: roles.demoKyc.publicKey,
    treasury: roles.treasury.publicKey,
    raiseFeeBps: 250,
    revenueFeeBps: 1_500,
    minRaiseDuration: bn(60),
    maxActivationWindow: bn(7n * DAY),
    allowedPaymentMints: [paymentMint, PublicKey.default, PublicKey.default, PublicKey.default],
    recoveryDelay: bn(RECOVERY_DELAY),
  };
}

/** A fresh environment with the config initialized by the upgrade authority. */
export async function configuredEnv(): Promise<{ env: TestEnv; roles: Roles; params: InitializeConfigParams }> {
  const env = new TestEnv();
  const roles = newRoles(env);
  const params = configParams(roles);
  expectOk(env.send([await initializeConfigIx(env.upgradeAuthority.publicKey, params)], [env.upgradeAuthority]));
  return { env, roles, params };
}

/** A configured environment with one allowed payment mint and a fleet operator. */
export interface Market {
  env: TestEnv;
  roles: Roles;
  /** Mint authority of the payment mint, i.e. the stablecoin faucet. */
  issuer: Keypair;
  paymentMint: PublicKey;
  paymentProgram: PublicKey;
  operator: Keypair;
  oracle: Keypair;
}

export async function marketEnv(
  paymentProgram: PublicKey = TOKEN_PROGRAM_ID,
  extensions: MintExtension[] = [],
): Promise<Market> {
  const env = new TestEnv();
  const roles = newRoles(env);
  const issuer = env.newAccount();
  const paymentMint = createMint(env, issuer, paymentProgram, extensions);
  expectOk(
    env.send(
      [await initializeConfigIx(env.upgradeAuthority.publicKey, configParams(roles, paymentMint))],
      [env.upgradeAuthority],
    ),
  );
  return { env, roles, issuer, paymentMint, paymentProgram, operator: env.newAccount(), oracle: env.newAccount() };
}

/** 10 000 tKZT per share in base units (6 decimals). */
export const PRICE = 10_000_000_000n;
export const TOTAL_SHARES = 100n;
export const SOFT_CAP = 60n;
export const RAISE_DURATION = 14n * DAY;
export const ACTIVATION_WINDOW = 3n * DAY;

/** Car attributes as the seed script writes them, including a 64-character plate hash. */
export const CAR_METADATA = [
  { key: "make", value: "Kia" },
  { key: "model", value: "Rio" },
  { key: "year", value: "2024" },
  { key: "city", value: "Almaty" },
  { key: "class", value: "economy" },
  { key: "park", value: "Demo Park Almaty-1" },
  { key: "plate_hash", value: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08" },
  { key: "data_origin", value: "devnet-demo-seed" },
];

export function projectParams(market: Market, overrides: Partial<CreateProjectParams> = {}): CreateProjectParams {
  return {
    pricePerShare: bn(PRICE),
    totalShares: bn(TOTAL_SHARES),
    softCapShares: bn(SOFT_CAP),
    raiseDeadline: bn(market.env.now() + RAISE_DURATION),
    activationWindow: bn(ACTIVATION_WINDOW),
    operator: market.operator.publicKey,
    oracle: market.oracle.publicKey,
    allowDemo: false,
    name: "AXEL Kia Rio #017",
    symbol: "AXKR017",
    uri: "https://axel.example/api/meta/kia-rio-017.json",
    additionalMetadata: CAR_METADATA,
    ...overrides,
  };
}

export function projectRef(market: Market, shareMint: PublicKey): ProjectRef {
  const address = projectPda(shareMint);
  return {
    address,
    shareMint,
    paymentMint: market.paymentMint,
    paymentProgram: market.paymentProgram,
    escrow: escrowAddress(address)[0],
    revenue: revenueAddress(address)[0],
  };
}

export async function createProjectTx(
  market: Market,
  params: CreateProjectParams,
  options: { payer?: Keypair; admin?: Keypair; shareMint?: Keypair; paymentMint?: PublicKey } = {},
): Promise<{ result: TxResult; project: ProjectRef }> {
  const admin = options.admin ?? market.roles.admin;
  const payer = options.payer ?? admin;
  const shareMint = options.shareMint ?? Keypair.generate();
  const ix = await createProjectIx({
    payer: payer.publicKey,
    admin: admin.publicKey,
    shareMint: shareMint.publicKey,
    paymentMint: options.paymentMint ?? market.paymentMint,
    paymentProgram: market.paymentProgram,
    params,
  });
  const signers = payer === admin ? [payer, shareMint] : [payer, admin, shareMint];
  return { result: market.env.send([ix], signers), project: projectRef(market, shareMint.publicKey) };
}

/** A project in Fundraising created by the admin with the default parameters. */
export async function openProject(market: Market, overrides: Partial<CreateProjectParams> = {}): Promise<ProjectRef> {
  const { result, project } = await createProjectTx(market, projectParams(market, overrides));
  expectOk(result);
  return project;
}

/** A wallet with an active KYC record for a year and `funds` payment tokens in its ATA. */
export async function newInvestor(
  market: Market,
  options: { flags?: number; funds?: bigint } = {},
): Promise<Keypair> {
  const { env, roles } = market;
  const wallet = env.newAccount();
  expectOk(
    env.send(
      [
        await setInvestorIx(roles.kyc.publicKey, wallet.publicKey, {
          status: InvestorStatus.active,
          expiresAt: bn(env.now() + 365n * DAY),
          jurisdiction: KAZAKHSTAN,
          flags: options.flags ?? 0,
          provider: KycProvider.sumsub,
        }),
      ],
      [roles.kyc],
    ),
  );
  mintTo(env, market.paymentMint, market.paymentProgram, market.issuer, wallet.publicKey, options.funds ?? TOTAL_SHARES * PRICE);
  return wallet;
}

/** The KYC authority overwrites the wallet's record. */
export async function setInvestorStatus(
  market: Market,
  wallet: PublicKey,
  status: keyof typeof InvestorStatus,
  expiresAt: bigint,
  flags = 0,
): Promise<void> {
  expectOk(
    market.env.send(
      [
        await setInvestorIx(market.roles.kyc.publicKey, wallet, {
          status: InvestorStatus[status],
          expiresAt: bn(expiresAt),
          jurisdiction: KAZAKHSTAN,
          flags,
          provider: KycProvider.sumsub,
        }),
      ],
      [market.roles.kyc],
    ),
  );
}

/**
 * Ways a verified wallet loses the right to hold shares of a project that does not accept
 * DEMO investors, with the reason `require_eligible` gives.
 */
export const INELIGIBLE_INVESTORS: Array<{
  name: string;
  reason: "InvestorNotActive" | "InvestorFrozen" | "InvestorExpired" | "DemoNotAllowed";
  apply: (market: Market, wallet: PublicKey) => Promise<void>;
}> = [
  {
    name: "revoked",
    reason: "InvestorNotActive",
    apply: (market, wallet) => setInvestorStatus(market, wallet, "revoked", 0n),
  },
  {
    name: "sanctions-frozen",
    reason: "InvestorFrozen",
    apply: (market, wallet) => setInvestorStatus(market, wallet, "frozen", market.env.now() + 365n * DAY),
  },
  {
    name: "KYC-expired",
    reason: "InvestorExpired",
    apply: async (market, wallet) => {
      await setInvestorStatus(market, wallet, "active", market.env.now() + DAY);
      market.env.warp(DAY);
    },
  },
  {
    name: "demo-only",
    reason: "DemoNotAllowed",
    apply: (market, wallet) =>
      setInvestorStatus(market, wallet, "active", market.env.now() + 365n * DAY, InvestorFlag.demo),
  },
];

/** The owner buys `shares` at the project's price, paying fees and rent itself. */
export async function buy(market: Market, project: ProjectRef, owner: Keypair, shares: bigint): Promise<TxResult> {
  const price = BigInt(market.env.fetch("project", project.address).pricePerShare.toString());
  const ix = await buySharesIx(project, { payer: owner.publicKey, owner: owner.publicKey }, shares, shares * price);
  return market.env.send([ix], [owner]);
}

/** `from` sends shares to the canonical share account of `to` through the transfer hook. */
export function transfer(market: Market, project: ProjectRef, from: Keypair, to: PublicKey, amount: bigint): TxResult {
  return market.env.send([transferSharesIx(project, { from: from.publicKey, to }, amount)], [from]);
}

/** A verified wallet with an open position in the project, paid for by `payer`. */
export async function onboard(market: Market, project: ProjectRef, payer: Keypair, flags = 0): Promise<Keypair> {
  const wallet = await newInvestor(market, { flags });
  expectOk(market.env.send([await openPositionIx(project, { payer: payer.publicKey, owner: wallet.publicKey })], [payer]));
  return wallet;
}

/** Hash of the car's purchase documents that the admin publishes on activation. */
export const DOC_HASH = Array.from({ length: 32 }, (_, i) => i + 1);

/** The admin (or `signer`) activates a funded project, paying the operator. */
export async function activate(market: Market, project: ProjectRef, signer: Keypair = market.roles.admin): Promise<TxResult> {
  const ix = await activateProjectIx(
    project,
    { admin: signer.publicKey, treasury: market.roles.treasury.publicKey, operator: market.operator.publicKey },
    DOC_HASH,
  );
  return market.env.send([ix], [signer]);
}

/**
 * An operating project whose holders bought `allocations` shares in the raise, in order.
 * The allocations must add up to the total supply so the raise sells out.
 */
export async function operatingProject(
  market: Market,
  allocations: bigint[] = [50n, 30n, 20n],
  overrides: Partial<CreateProjectParams> = {},
): Promise<{ project: ProjectRef; holders: Keypair[] }> {
  const total = bn(allocations.reduce((sum, shares) => sum + shares, 0n));
  const project = await openProject(market, { totalShares: total, softCapShares: total, ...overrides });
  const holders: Keypair[] = [];
  for (const shares of allocations) {
    const holder = await newInvestor(market);
    expectOk(await buy(market, project, holder, shares));
    holders.push(holder);
  }
  expectOk(await activate(market, project));
  return { project, holders };
}

/** SHA-256 of a period's P&L report as the operator publishes it. */
export const REPORT_HASH = Array.from({ length: 32 }, (_, i) => 0xa0 ^ i);

/** October 2026 as a regular period; any field can be overridden. */
export function revenueParams(gross: bigint, overrides: Partial<DepositRevenueParams> = {}): DepositRevenueParams {
  return {
    gross: bn(gross),
    periodStart: 20261001,
    periodEnd: 20261031,
    reportHash: REPORT_HASH,
    kind: RevenueKind.regular,
    ...overrides,
  };
}

/** Platform fee and holders' share of a deposit, as the program splits it. */
export function splitRevenue(gross: bigint, feeBps: number): { fee: bigint; net: bigint } {
  const fee = (gross * BigInt(feeBps)) / 10_000n;
  return { fee, net: gross - fee };
}

/** The smallest gross deposit that leaves exactly `net` for the holders after the fee. */
export function grossForNet(net: bigint, feeBps: number): bigint {
  // Each extra unit of gross adds 0 or 1 to the net, so every net is reached exactly.
  let gross = (net * 10_000n) / (10_000n - BigInt(feeBps));
  while (splitRevenue(gross, feeBps).net < net) {
    gross += 1n;
  }
  return gross;
}

/** The operator deposits `gross` into the project's next period, co-signed by the oracle. */
export async function deposit(
  market: Market,
  project: ProjectRef,
  gross: bigint,
  overrides: Partial<DepositRevenueParams> = {},
): Promise<TxResult> {
  const ix = await depositRevenueIx(
    project,
    {
      operator: market.operator.publicKey,
      oracle: market.oracle.publicKey,
      treasury: market.roles.treasury.publicKey,
      periodIndex: market.env.fetch("project", project.address).periodCount,
    },
    revenueParams(gross, overrides),
  );
  return market.env.send([ix], [market.operator, market.oracle]);
}

/** Deposits exactly `net` for the holders, i.e. moves the accumulator by `net / supply`. */
export async function depositNet(market: Market, project: ProjectRef, net: bigint): Promise<TxResult> {
  const feeBps = market.env.fetch("project", project.address).revenueFeeBps;
  return deposit(market, project, grossForNet(net, feeBps));
}

/** `claimer` (the owner itself by default) claims what `owner` has earned. */
export async function claim(market: Market, project: ProjectRef, owner: Keypair, claimer: Keypair = owner): Promise<TxResult> {
  const ix = await claimIx(project, { claimer: claimer.publicKey, owner: owner.publicKey });
  return market.env.send([ix], [claimer]);
}

export async function pauseProject(market: Market, project: ProjectRef): Promise<TxResult> {
  const { admin } = market.roles;
  return market.env.send([await pauseProjectIx(project, admin.publicKey)], [admin]);
}

export async function closeProject(market: Market, project: ProjectRef): Promise<TxResult> {
  const { admin } = market.roles;
  return market.env.send([await closeProjectIx(project, admin.publicKey)], [admin]);
}
