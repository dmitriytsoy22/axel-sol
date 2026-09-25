import { createHash } from 'node:crypto';
import type { AccountInfo, Connection } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';
import { unpackMint } from '@solana/spl-token';
import { utils } from '@coral-xyz/anchor';
import {
  ACCOUNT_SIZE,
  decodeConfig,
  decodeInvestor,
  decodePosition,
  INVESTOR_FLAGS,
  type ConfigAccount,
  type InvestorAccount,
} from '@/lib/solana/accounts';
import { eligibility } from '@/lib/solana/eligibility';
import { kycRecord, type KycRecord } from '@/lib/solana/kyc';
import { configAddress, investorAddress, positionAddress } from '@/lib/solana/pda';
import { fetchAccountInfos, fetchProject, fetchRevenuePeriods } from '@/lib/solana/readers';
import type { Digest } from '@/lib/verify/sha256';
import type { Project } from '@/types/project';
import type {
  AccessRequest,
  AccessResponse,
  DemoStatus,
  NonceResponse,
  SharesResponse,
  SimulationResponse,
  WalletSession,
} from '../api';
import { DEMO_LIMITS } from '../config';
import { accessMessage } from '../message';
import { nextSimulatedPeriod, simulatedGross, simulatedReportHash } from '../simulation';
import { accessPlan, sharesPlan, simulateMonthPlan } from '../transactions';
import type { DemoEnv } from './env';
import { DemoError, misconfigured } from './errors';
import {
  demoKeys,
  hasAccess,
  reserveAccess,
  reserveShares,
  reserveSimulation,
  utcDay,
} from './limits';
import { sendPlan, type Wait } from './send';
import type { DemoStore } from './store';
import {
  checkNonce,
  checkSession,
  issueNonce,
  issueSession,
  verifyWalletSignature,
} from './tokens';
import { verifyTurnstile } from './turnstile';

/** What the demo route handlers run on; tests pass a fixture chain and a fake clock. */
export interface DemoDeps {
  env: DemoEnv;
  connection: Connection;
  store: DemoStore;
  /** Unix seconds. */
  now: () => number;
  fetcher?: (input: string, init: RequestInit) => Promise<Response>;
  wait?: Wait;
}

const nodeSha256: Digest = async (data) => createHash('sha256').update(data).digest();

function badRequest(message: string): DemoError {
  return new DemoError('bad_request', 400, message);
}

const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function parseWallet(value: unknown): PublicKey {
  if (typeof value !== 'string' || !BASE58_ADDRESS.test(value)) {
    throw badRequest('wallet must be a base58 address');
  }
  const wallet = new PublicKey(value);
  // Base58 with leading zeros can decode to a different length than 32 bytes' encoding.
  if (wallet.toBase58() !== value) throw badRequest('wallet must be a base58 address');
  return wallet;
}

function decodeSignature(value: unknown): Uint8Array | null {
  if (typeof value !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(value)) return null;
  return utils.bytes.bs58.decode(value);
}

async function loadFleet({ env, connection }: DemoDeps): Promise<Project> {
  const fleet = await fetchProject(connection, env.demoFleetMint);
  if (!fleet) {
    throw misconfigured(
      `DEMO_FLEET_MINT ${env.demoFleetMint.toBase58()} is not an AXEL car on this cluster`,
    );
  }
  return fleet;
}

function requireConfig(info: AccountInfo<Buffer> | null): ConfigAccount {
  if (!info) throw misconfigured('The program has no config on this cluster');
  return decodeConfig(info.data);
}

/** The faucet mints the test tenge, so it must be the payment mint's mint authority. */
function requireMintAuthority(
  mint: PublicKey,
  info: AccountInfo<Buffer> | null,
  faucet: PublicKey,
): void {
  if (!info) throw misconfigured(`The payment mint ${mint.toBase58()} does not exist`);
  const authority = unpackMint(mint, info, info.owner).mintAuthority;
  if (!authority?.equals(faucet)) {
    throw misconfigured(
      'DEMO_FAUCET_SECRET is not the mint authority of the fleet car’s payment token',
    );
  }
}

function requireFaucetFunds(info: AccountInfo<Buffer> | null): void {
  if ((info?.lamports ?? 0) < DEMO_LIMITS.faucetFloorLamports) {
    throw new DemoError('faucet_low', 503, 'The demo faucet is out of devnet SOL');
  }
}

function requireFleetRoles(fleet: Project, env: DemoEnv): void {
  if (!fleet.operator.equals(env.operator.publicKey)) {
    throw misconfigured('DEMO_OPERATOR_SECRET is not the fleet car’s operator');
  }
  if (!fleet.oracle.equals(env.oracle.publicKey)) {
    throw misconfigured('DEMO_ORACLE_SECRET is not the fleet car’s oracle');
  }
}

function requireSession(deps: DemoDeps, body: unknown): PublicKey {
  const request = body as Partial<WalletSession> | null;
  const wallet = parseWallet(request?.wallet);
  if (typeof request?.session !== 'string') {
    throw new DemoError('session_invalid', 401, 'Get demo access first');
  }
  const session = checkSession(deps.env.sessionSecret, request.session, wallet, deps.now());
  if (!session.ok) {
    throw new DemoError(
      'session_invalid',
      401,
      session.reason === 'expired' ? 'The demo session expired' : 'Get demo access first',
    );
  }
  return wallet;
}

/**
 * The KYC record a demo grant writes. A wallet that already holds a valid record keeps it;
 * an expired DEMO record is renewed. The demo key may change nothing else, so a revoked,
 * frozen or lapsed real record stays as it is and access is refused.
 */
export function demoKycPlan(
  investor: Pick<InvestorAccount, 'status' | 'flags' | 'expiresAt'> | null,
  now: number,
): { write: KycRecord | null; isNew: boolean } {
  if (!investor) return { write: kycRecord('demo', 'approve', now), isNew: true };
  if (investor.status === 'active' && investor.expiresAt > now)
    return { write: null, isNew: false };
  const demo = (investor.flags & INVESTOR_FLAGS.demo) !== 0;
  if (demo && investor.status === 'active') {
    return { write: kycRecord('demo', 'approve', now), isNew: false };
  }
  throw new DemoError(
    'kyc_locked',
    403,
    `This wallet's KYC record is ${investor.status === 'active' ? 'expired' : investor.status}, and the demo key may not change it`,
  );
}

export function handleNonce(deps: DemoDeps, walletParam: string | null): NonceResponse {
  const wallet = parseWallet(walletParam);
  const now = deps.now();
  const nonce = issueNonce(deps.env.sessionSecret, now);
  return {
    nonce,
    message: accessMessage(wallet.toBase58(), nonce),
    expiresAt: now + DEMO_LIMITS.nonceTtlSeconds,
  };
}

/**
 * Checks the wallet's signature of the access message (and the Turnstile token, when
 * required), then grants demo KYC, test tenge and a little SOL once per wallet. A wallet
 * that already got it only receives a new session.
 */
export async function handleAccess(
  deps: DemoDeps,
  body: unknown,
  ip: string | null,
): Promise<AccessResponse> {
  const { env, connection, store } = deps;
  const request = body as Partial<AccessRequest> | null;
  const wallet = parseWallet(request?.wallet);
  if (typeof request?.nonce !== 'string') throw badRequest('nonce is missing');
  const now = deps.now();

  const nonce = checkNonce(env.sessionSecret, request.nonce, now, DEMO_LIMITS.nonceTtlSeconds);
  if (!nonce.ok) {
    throw nonce.reason === 'expired'
      ? new DemoError('nonce_expired', 400, 'The signed request expired; sign a new one')
      : new DemoError('nonce_invalid', 400, 'The nonce was not issued by this server');
  }
  const signature = decodeSignature(request.signature);
  const message = new TextEncoder().encode(accessMessage(wallet.toBase58(), request.nonce));
  if (!signature || !verifyWalletSignature(wallet, message, signature)) {
    throw new DemoError('signature_invalid', 401, 'The signature is not this wallet’s');
  }
  if (env.turnstileSecret) {
    if (typeof request.turnstileToken !== 'string' || request.turnstileToken === '') {
      throw new DemoError('turnstile_required', 400, 'Solve the challenge first');
    }
    if (!(await verifyTurnstile(env.turnstileSecret, request.turnstileToken, ip, deps.fetcher))) {
      throw new DemoError('turnstile_failed', 403, 'The challenge was not solved');
    }
  }

  const sessionExpiresAt = now + DEMO_LIMITS.sessionTtlSeconds;
  const grant = {
    session: issueSession(env.sessionSecret, wallet, sessionExpiresAt),
    sessionExpiresAt,
  };
  if (await hasAccess(store, wallet.toBase58())) return { status: 'already_granted', ...grant };

  const fleet = await loadFleet(deps);
  const [configInfo, investorInfo, mintInfo, faucetInfo] = await fetchAccountInfos(connection, [
    configAddress(),
    investorAddress(wallet),
    fleet.paymentMint,
    env.faucet.publicKey,
  ]);
  const config = requireConfig(configInfo);
  if (!config.demoKycAuthority.equals(env.demoKyc.publicKey)) {
    throw misconfigured('DEMO_KYC_SECRET is not the config’s demo KYC key');
  }
  requireMintAuthority(fleet.paymentMint, mintInfo, env.faucet.publicKey);
  requireFaucetFunds(faucetInfo);
  const kyc = demoKycPlan(investorInfo ? decodeInvestor(investorInfo.data) : null, now);
  const kycRent = kyc.isNew
    ? await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE.investor)
    : 0;
  const dripAmount = DEMO_LIMITS.dripTokens * 10n ** BigInt(fleet.payment.decimals);

  const reservation = await reserveAccess(store, {
    wallet: wallet.toBase58(),
    ip: ip ?? 'unknown',
    now,
  });
  try {
    const plan = await accessPlan({
      faucet: env.faucet.publicKey,
      demoKyc: env.demoKyc.publicKey,
      wallet,
      payment: { mint: fleet.paymentMint, tokenProgram: fleet.paymentTokenProgram },
      kyc: kyc.write,
      kycRent,
      dripAmount,
      dripLamports: DEMO_LIMITS.dripLamports,
    });
    const sent = await sendPlan(
      connection,
      plan,
      env.faucet,
      kyc.write ? [env.demoKyc] : [],
      deps.wait,
    );
    return {
      status: 'granted',
      ...sent,
      dripAmount: dripAmount.toString(),
      dripLamports: DEMO_LIMITS.dripLamports,
      ...grant,
    };
  } catch (error) {
    await reservation.release();
    throw error;
  }
}

/** The desk sends the wallet a few shares of the demo fleet car, once. */
export async function handleShares(deps: DemoDeps, body: unknown): Promise<SharesResponse> {
  const { env, connection, store } = deps;
  const wallet = requireSession(deps, body);
  const fleet = await loadFleet(deps);
  if (fleet.status !== 'operating') {
    throw new DemoError('fleet_unavailable', 409, `The demo fleet car is ${fleet.status}`);
  }
  const deskPosition = positionAddress(fleet.address, env.desk.publicKey);
  const [investorInfo, deskPositionInfo, faucetInfo] = await fetchAccountInfos(connection, [
    investorAddress(wallet),
    deskPosition,
    env.faucet.publicKey,
  ]);
  const deskShares = deskPositionInfo
    ? decodePosition(deskPosition, deskPositionInfo.data).shares
    : 0n;
  if (deskShares < DEMO_LIMITS.sharesPerWallet) {
    throw new DemoError('inventory_empty', 503, 'The desk has no shares left to send');
  }
  const status = eligibility(
    investorInfo ? decodeInvestor(investorInfo.data) : null,
    fleet.allowsDemo,
    deps.now(),
  );
  if (status !== 'eligible') {
    throw new DemoError('not_eligible', 403, `This wallet cannot hold the car's shares: ${status}`);
  }
  requireFaucetFunds(faucetInfo);

  const reservation = await reserveShares(store, wallet.toBase58());
  try {
    const plan = await sharesPlan({
      project: fleet,
      desk: env.desk.publicKey,
      payer: env.faucet.publicKey,
      wallet,
      shares: DEMO_LIMITS.sharesPerWallet,
    });
    const sent = await sendPlan(connection, plan, env.faucet, [env.desk], deps.wait);
    return {
      ...sent,
      mint: fleet.shareMint.toBase58(),
      shares: DEMO_LIMITS.sharesPerWallet.toString(),
    };
  } catch (error) {
    await reservation.release();
    throw error;
  }
}

/**
 * Deposits a simulated month into the demo fleet car: the average of its latest regular
 * payouts, for the calendar month after its latest one, attested by the car's oracle.
 */
export async function handleSimulateMonth(
  deps: DemoDeps,
  body: unknown,
): Promise<SimulationResponse> {
  const { env, connection, store } = deps;
  const wallet = requireSession(deps, body);
  const fleet = await loadFleet(deps);
  requireFleetRoles(fleet, env);
  if (fleet.status !== 'operating') {
    throw new DemoError('fleet_unavailable', 409, `The demo fleet car is ${fleet.status}`);
  }
  if (fleet.periodCount >= DEMO_LIMITS.simulationPeriodCap) {
    throw new DemoError(
      'simulation_cap',
      409,
      'The demo fleet car has taken every simulated month',
    );
  }
  const [configInfo, mintInfo, faucetInfo] = await fetchAccountInfos(connection, [
    configAddress(),
    fleet.paymentMint,
    env.faucet.publicKey,
  ]);
  const config = requireConfig(configInfo);
  requireMintAuthority(fleet.paymentMint, mintInfo, env.faucet.publicKey);
  requireFaucetFunds(faucetInfo);

  const periods = await fetchRevenuePeriods(connection, fleet.address);
  const gross = simulatedGross(periods, fleet.payment.decimals);
  if (gross === null) {
    throw misconfigured('The demo fleet car has no regular payout to base a simulated month on');
  }
  const period = nextSimulatedPeriod(periods);
  const reportHash = await simulatedReportHash(
    {
      shareMint: fleet.shareMint.toBase58(),
      paymentMint: fleet.paymentMint.toBase58(),
      period: { index: fleet.periodCount, ...period, gross },
    },
    nodeSha256,
  );
  const periodRent = await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE.revenuePeriod);

  const reservation = await reserveSimulation(store, {
    wallet: wallet.toBase58(),
    now: deps.now(),
  });
  try {
    const plan = await simulateMonthPlan({
      project: fleet,
      faucet: env.faucet.publicKey,
      treasury: config.treasury,
      gross,
      period,
      reportHash,
      periodRent,
    });
    const sent = await sendPlan(
      connection,
      plan,
      env.faucet,
      [env.operator, env.oracle],
      deps.wait,
    );
    return {
      ...sent,
      mint: fleet.shareMint.toBase58(),
      periodIndex: fleet.periodCount,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      gross: gross.toString(),
    };
  } catch (error) {
    await reservation.release();
    throw error;
  }
}

/** The demo's health, its limits, and, for a wallet, which one-time steps it has used. */
export async function handleStatus(
  deps: DemoDeps,
  walletParam: string | null,
): Promise<DemoStatus> {
  const { env, connection, store } = deps;
  const wallet = walletParam ? parseWallet(walletParam) : null;
  const now = deps.now();

  const status: DemoStatus = {
    available: true,
    code: null,
    message: null,
    turnstile: env.turnstileSecret !== null,
    sharedLimits: store.kind === 'upstash',
    faucet: null,
    access: {
      granted: await store.count(demoKeys.accessGranted),
      cap: DEMO_LIMITS.accessCap,
      perIpPerDay: DEMO_LIMITS.accessPerIpPerDay,
      dripAmount: null,
      dripLamports: DEMO_LIMITS.dripLamports,
    },
    fleet: null,
    wallet: wallet
      ? {
          address: wallet.toBase58(),
          accessGranted: await hasAccess(store, wallet.toBase58()),
          sharesReceived: (await store.count(demoKeys.shares(wallet.toBase58()))) > 0,
          simulationsToday: await store.count(
            demoKeys.simulationWallet(wallet.toBase58(), utcDay(now)),
          ),
        }
      : null,
  };

  try {
    const fleet = await loadFleet(deps);
    const deskPosition = positionAddress(fleet.address, env.desk.publicKey);
    const [faucetInfo, deskInfo, configInfo, mintInfo] = await fetchAccountInfos(connection, [
      env.faucet.publicKey,
      deskPosition,
      configAddress(),
      fleet.paymentMint,
    ]);
    status.faucet = {
      address: env.faucet.publicKey.toBase58(),
      lamports: faucetInfo?.lamports ?? 0,
      floorLamports: DEMO_LIMITS.faucetFloorLamports,
    };
    status.access.dripAmount = (
      DEMO_LIMITS.dripTokens *
      10n ** BigInt(fleet.payment.decimals)
    ).toString();
    status.fleet = {
      mint: fleet.shareMint.toBase58(),
      status: fleet.status,
      periods: fleet.periodCount,
      periodCap: DEMO_LIMITS.simulationPeriodCap,
      deskShares: (deskInfo ? decodePosition(deskPosition, deskInfo.data).shares : 0n).toString(),
      sharesPerWallet: DEMO_LIMITS.sharesPerWallet.toString(),
      cooldownSeconds: await store.ttl(demoKeys.simulationCooldown),
      simulationsPerWalletPerDay: DEMO_LIMITS.simulationsPerWalletPerDay,
    };

    const config = requireConfig(configInfo);
    if (!config.demoKycAuthority.equals(env.demoKyc.publicKey)) {
      throw misconfigured('DEMO_KYC_SECRET is not the config’s demo KYC key');
    }
    requireMintAuthority(fleet.paymentMint, mintInfo, env.faucet.publicKey);
    requireFleetRoles(fleet, env);
    requireFaucetFunds(faucetInfo);
  } catch (error) {
    if (!(error instanceof DemoError)) throw error;
    status.available = false;
    status.code = error.code;
    status.message = error.message;
  }
  return status;
}
