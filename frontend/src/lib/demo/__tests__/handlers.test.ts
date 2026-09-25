// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import BN from 'bn.js';
import { Keypair, PublicKey, SystemInstruction, type Transaction } from '@solana/web3.js';
import { decodeMintToInstruction } from '@solana/spl-token';
import { INVESTOR_FLAGS } from '@/lib/solana/accounts';
import { PROGRAM_ID } from '@/lib/solana/connection';
import { investorAddress, periodAddress } from '@/lib/solana/pda';
import { addProgramAccount } from '@/lib/solana/__tests__/fixtures/accountPatch';
import { fixture, key, type FixtureAccount } from '@/lib/solana/__tests__/fixtures/chain';
import type { AccessResponse } from '../api';
import { DEMO_LIMITS } from '../config';
import { accessMessage } from '../message';
import { simulatedReportHash } from '../simulation';
import { DemoError } from '../server/errors';
import {
  handleAccess,
  handleNonce,
  handleShares,
  handleSimulateMonth,
  handleStatus,
  type DemoDeps,
} from '../server/handlers';
import { demoKeys, hasAccess } from '../server/limits';
import {
  decodeAxelInstruction,
  demoAccounts,
  demoDeps,
  DemoNode,
  DESK_SHARES,
  FLEET,
  FLEET_MINT,
  NOW,
  PAYMENT_MINT,
  roles,
  signMessage,
} from './fixtures';

const DECIMALS = 6;
const sha256 = async (data: Uint8Array) => createHash('sha256').update(data).digest();

async function refusal(promise: Promise<unknown>): Promise<DemoError> {
  const error = await promise.then(
    () => null,
    (failure: unknown) => failure,
  );
  expect(error).toBeInstanceOf(DemoError);
  return error as DemoError;
}

/** What the judge's browser sends: the wallet's signature of the message the nonce came with. */
function signedRequest(deps: DemoDeps, wallet: Keypair, extra: Record<string, unknown> = {}) {
  const { nonce, message } = handleNonce(deps, wallet.publicKey.toBase58());
  return {
    wallet: wallet.publicKey.toBase58(),
    nonce,
    signature: signMessage(wallet, message),
    ...extra,
  };
}

function programInstructions(transaction: Transaction) {
  return transaction.instructions
    .filter((instruction) => instruction.programId.equals(PROGRAM_ID))
    .map((instruction) => decodeAxelInstruction(instruction.data)?.name);
}

async function withInvestor(
  accounts: FixtureAccount[],
  wallet: PublicKey,
  record: { status: 'active' | 'revoked' | 'frozen'; flags: number; expiresAt: number },
): Promise<FixtureAccount[]> {
  return addProgramAccount(
    'investor',
    investorAddress(wallet),
    {
      wallet,
      status: { [record.status]: {} } as never,
      flags: record.flags,
      jurisdiction: 0,
      expiresAt: new BN(record.expiresAt),
      updatedAt: new BN(NOW),
      provider: (record.flags & INVESTOR_FLAGS.demo ? { demo: {} } : { manual: {} }) as never,
      bump: 255,
    },
    accounts,
  );
}

async function granted(deps: DemoDeps, wallet: Keypair) {
  const response = await handleAccess(deps, signedRequest(deps, wallet), '1.1.1.1');
  expect(response.status).toBe('granted');
  return response as Extract<AccessResponse, { status: 'granted' }>;
}

describe('POST /api/demo/access', () => {
  it('gives a new wallet a DEMO record, test tenge and SOL in one faucet-paid transaction', async () => {
    const deps = await demoDeps();
    const judge = Keypair.generate();

    const response = await granted(deps, judge);

    expect(response).toMatchObject({
      confirmed: true,
      dripAmount: (DEMO_LIMITS.dripTokens * 10n ** BigInt(DECIMALS)).toString(),
      dripLamports: DEMO_LIMITS.dripLamports,
      sessionExpiresAt: NOW + DEMO_LIMITS.sessionTtlSeconds,
    });
    const [sent] = deps.connection.sent;
    expect(deps.connection.sent).toHaveLength(1);
    expect(sent.verifySignatures()).toBe(true);
    expect(sent.feePayer).toEqual(roles.faucet.publicKey);
    expect(programInstructions(sent)).toEqual(['setInvestor']);
    const mintTo = sent.instructions.find((instruction) => instruction.data[0] === 7);
    expect(decodeMintToInstruction(mintTo!, mintTo!.programId).data.amount).toBe(
      DEMO_LIMITS.dripTokens * 10n ** BigInt(DECIMALS),
    );
    expect(response.signature).toBe(
      (await import('@coral-xyz/anchor')).utils.bytes.bs58.encode(sent.signature!),
    );
    expect(await hasAccess(deps.store, judge.publicKey.toBase58())).toBe(true);
  });

  it('only renews the session of a wallet that already got access', async () => {
    const deps = await demoDeps();
    const judge = Keypair.generate();
    await granted(deps, judge);
    deps.clock.now += 3600;

    const again = await handleAccess(deps, signedRequest(deps, judge), '2.2.2.2');

    expect(again).toMatchObject({
      status: 'already_granted',
      sessionExpiresAt: NOW + 3600 + DEMO_LIMITS.sessionTtlSeconds,
    });
    expect(deps.connection.sent).toHaveLength(1);
  });

  it('keeps a verified investor’s own record and only drips', async () => {
    const holder = Keypair.generate();
    const accounts = await withInvestor(await demoAccounts(), holder.publicKey, {
      status: 'active',
      flags: 0,
      expiresAt: NOW + 86_400,
    });
    const deps = { ...(await demoDeps()), connection: new DemoNode(accounts) };

    await granted(deps, holder);

    const [sent] = deps.connection.sent;
    expect(programInstructions(sent)).toEqual([]);
    expect(sent.signatures.map((entry) => entry.publicKey)).toEqual([roles.faucet.publicKey]);
  });

  it('renews an expired DEMO record without paying its rent again', async () => {
    const judge = Keypair.generate();
    const accounts = await withInvestor(await demoAccounts(), judge.publicKey, {
      status: 'active',
      flags: INVESTOR_FLAGS.demo,
      expiresAt: NOW - 1,
    });
    const deps = { ...(await demoDeps()), connection: new DemoNode(accounts) };

    await granted(deps, judge);

    const [sent] = deps.connection.sent;
    expect(programInstructions(sent)).toEqual(['setInvestor']);
    const rentTopUp = sent.instructions.find(
      (instruction) =>
        instruction.programId.toBase58() === '11111111111111111111111111111111' &&
        SystemInstruction.decodeTransfer(instruction).toPubkey.equals(roles.demoKyc.publicKey),
    );
    expect(rentTopUp).toBeUndefined();
  });

  it.each([
    ['revoked', INVESTOR_FLAGS.demo, NOW + 86_400],
    ['frozen', INVESTOR_FLAGS.demo, NOW + 86_400],
    ['active', 0, NOW - 1],
  ] as const)(
    'refuses a %s record the demo key may not change (flags %i)',
    async (status, flags, expiresAt) => {
      const judge = Keypair.generate();
      const accounts = await withInvestor(await demoAccounts(), judge.publicKey, {
        status,
        flags,
        expiresAt,
      });
      const deps = { ...(await demoDeps()), connection: new DemoNode(accounts) };

      const error = await refusal(handleAccess(deps, signedRequest(deps, judge), null));

      expect(error.code).toBe('kyc_locked');
      expect(deps.connection.sent).toHaveLength(0);
      expect(await hasAccess(deps.store, judge.publicKey.toBase58())).toBe(false);
    },
  );

  it('refuses another wallet’s signature, a forged nonce and an expired one', async () => {
    const deps = await demoDeps();
    const judge = Keypair.generate();
    const request = signedRequest(deps, judge);

    const byOther = {
      ...request,
      signature: signMessage(roles.desk, accessMessage(request.wallet, request.nonce)),
    };
    expect((await refusal(handleAccess(deps, byOther, null))).code).toBe('signature_invalid');
    expect(
      (await refusal(handleAccess(deps, { ...request, nonce: `${request.nonce}x` }, null))).code,
    ).toBe('nonce_invalid');
    deps.clock.now += DEMO_LIMITS.nonceTtlSeconds;
    expect((await refusal(handleAccess(deps, request, null))).code).toBe('nonce_expired');
    expect((await refusal(handleAccess(deps, { ...request, wallet: 'nope' }, null))).code).toBe(
      'bad_request',
    );
    expect(deps.connection.sent).toHaveLength(0);
  });

  it('asks Cloudflare about the Turnstile token when a secret is set', async () => {
    const calls: URLSearchParams[] = [];
    const verdicts = [false, true];
    const deps = {
      ...(await demoDeps({ env: { turnstileSecret: 'ts-secret' } })),
      fetcher: async (_url: string, init: RequestInit) => {
        calls.push(new URLSearchParams(String(init.body)));
        return new Response(JSON.stringify({ success: verdicts.shift() }));
      },
    };
    const judge = Keypair.generate();

    expect((await refusal(handleAccess(deps, signedRequest(deps, judge), null))).code).toBe(
      'turnstile_required',
    );
    expect(
      (
        await refusal(
          handleAccess(deps, signedRequest(deps, judge, { turnstileToken: 'bad' }), '3.3.3.3'),
        )
      ).code,
    ).toBe('turnstile_failed');
    await handleAccess(deps, signedRequest(deps, judge, { turnstileToken: 'good' }), '3.3.3.3');

    expect(calls.map((form) => Object.fromEntries(form))).toEqual([
      { secret: 'ts-secret', response: 'bad', remoteip: '3.3.3.3' },
      { secret: 'ts-secret', response: 'good', remoteip: '3.3.3.3' },
    ]);
  });

  it('gives the grant back when Solana refuses the transaction', async () => {
    const deps = await demoDeps();
    const judge = Keypair.generate();
    deps.connection.preflightError = new Error(
      'Simulation failed. Message: Transaction simulation failed: Error processing Instruction 2: custom program error: 0x177e',
    );

    const error = await refusal(handleAccess(deps, signedRequest(deps, judge), '1.1.1.1'));

    expect(error.code).toBe('transaction_failed');
    // Instruction 2 is set_investor, after the compute budget and the rent top-up: 6014.
    expect(error.extra.reason).toEqual({ namespace: 'ProgramErrors', key: 'DemoRecordImmutable' });
    expect(await hasAccess(deps.store, judge.publicKey.toBase58())).toBe(false);
    expect(await deps.store.count(demoKeys.accessGranted)).toBe(0);
    deps.connection.preflightError = null;
    await granted(deps, judge);
  });

  it('keeps the grant of a transaction that was sent but not yet seen confirmed', async () => {
    const deps = await demoDeps();
    deps.connection.status = 'unseen';

    const response = await granted(deps, Keypair.generate());

    expect(response.confirmed).toBe(false);
    expect(await deps.store.count(demoKeys.accessGranted)).toBe(1);
  });

  it('stops when the faucet runs low or holds the wrong keys', async () => {
    const low = await demoDeps({ faucetLamports: DEMO_LIMITS.faucetFloorLamports - 1 });
    expect(
      (await refusal(handleAccess(low, signedRequest(low, Keypair.generate()), null))).code,
    ).toBe('faucet_low');

    const wrongKyc = await demoDeps({ env: { demoKyc: Keypair.generate() } });
    const error = await refusal(
      handleAccess(wrongKyc, signedRequest(wrongKyc, Keypair.generate()), null),
    );
    expect(error.code).toBe('misconfigured');
    expect(error.message).toContain('DEMO_KYC_SECRET');

    const wrongFaucet = await demoDeps({ env: { faucet: Keypair.generate() } });
    expect(
      (
        await refusal(
          handleAccess(wrongFaucet, signedRequest(wrongFaucet, Keypair.generate()), null),
        )
      ).message,
    ).toContain('mint authority');
  });
});

describe('POST /api/demo/shares', () => {
  async function eligibleJudge(options: Parameters<typeof demoAccounts>[0] = {}) {
    const judge = Keypair.generate();
    const accounts = await withInvestor(await demoAccounts(options), judge.publicKey, {
      status: 'active',
      flags: INVESTOR_FLAGS.demo,
      expiresAt: NOW + 86_400,
    });
    const deps = { ...(await demoDeps()), connection: new DemoNode(accounts) };
    const { session } = await granted(deps, judge);
    deps.connection.sent = [];
    return { deps, judge, body: { wallet: judge.publicKey.toBase58(), session } };
  }

  it('sends the wallet shares of the fleet car from the desk, once', async () => {
    const { deps, body } = await eligibleJudge();

    const response = await handleShares(deps, body);

    expect(response).toMatchObject({
      mint: FLEET_MINT.toBase58(),
      shares: DEMO_LIMITS.sharesPerWallet.toString(),
      confirmed: true,
    });
    const [sent] = deps.connection.sent;
    expect(sent.verifySignatures()).toBe(true);
    expect(sent.signatures.map((entry) => entry.publicKey)).toEqual([
      roles.faucet.publicKey,
      roles.desk.publicKey,
    ]);
    expect(programInstructions(sent)).toEqual(['openPosition']);
    expect((await refusal(handleShares(deps, body))).code).toBe('shares_already_sent');
  });

  it('needs the session the access route issued to that wallet', async () => {
    const { deps, body } = await eligibleJudge();
    const stranger = Keypair.generate().publicKey.toBase58();

    expect((await refusal(handleShares(deps, { wallet: body.wallet }))).code).toBe(
      'session_invalid',
    );
    expect((await refusal(handleShares(deps, { ...body, wallet: stranger }))).code).toBe(
      'session_invalid',
    );
    deps.clock.now += DEMO_LIMITS.sessionTtlSeconds;
    expect((await refusal(handleShares(deps, body))).code).toBe('session_invalid');
  });

  it('refuses a wallet the car’s hook would refuse', async () => {
    const deps = await demoDeps();
    const judge = Keypair.generate();
    // Access granted, but its transaction never reached this chain: no KYC record.
    const { session } = await granted(deps, judge);

    const error = await refusal(
      handleShares(deps, { wallet: judge.publicKey.toBase58(), session }),
    );

    expect(error.code).toBe('not_eligible');
    expect(error.message).toContain('unverified');
  });

  it('says so when the desk has run out of shares or the car stopped', async () => {
    const empty = await eligibleJudge({ deskShares: DEMO_LIMITS.sharesPerWallet - 1n });
    expect((await refusal(handleShares(empty.deps, empty.body))).code).toBe('inventory_empty');

    const paused = await eligibleJudge({
      fleet: (project) => ({ ...project, state: { paused: {} } }),
    });
    expect((await refusal(handleShares(paused.deps, paused.body))).code).toBe('fleet_unavailable');
    expect(paused.deps.connection.sent).toHaveLength(0);
  });
});

describe('POST /api/demo/simulate-month', () => {
  async function judgeWithSession(options: Parameters<typeof demoDeps>[0] = {}) {
    const deps = await demoDeps(options);
    const judge = Keypair.generate();
    const { session } = await granted(deps, judge);
    deps.connection.sent = [];
    return { deps, body: { wallet: judge.publicKey.toBase58(), session } };
  }

  it('deposits the average of the latest payouts for the next month, attested by the oracle', async () => {
    const { deps, body } = await judgeWithSession();

    const response = await handleSimulateMonth(deps, body);

    // Fixture payouts: 1 234.567891, 987.654321 and 555.555557 tKZT; the mean is 925 whole tKZT.
    expect(response).toMatchObject({
      mint: FLEET_MINT.toBase58(),
      periodIndex: 3,
      periodStart: 20270101,
      periodEnd: 20270131,
      gross: '925000000',
      confirmed: true,
    });
    const [sent] = deps.connection.sent;
    expect(sent.verifySignatures()).toBe(true);
    expect(sent.signatures.map((entry) => entry.publicKey.toBase58()).sort()).toEqual(
      [roles.faucet, roles.operator, roles.oracle].map((role) => role.publicKey.toBase58()).sort(),
    );
    const deposit = sent.instructions.find((instruction) =>
      instruction.programId.equals(PROGRAM_ID),
    )!;
    expect(deposit.keys.map((meta) => meta.pubkey)).toContainEqual(periodAddress(FLEET, 3));
    const { data } = decodeAxelInstruction(deposit.data) as unknown as {
      data: { params: { reportHash: number[]; gross: BN } };
    };
    expect(data.params.gross.toString()).toBe('925000000');
    expect(Buffer.from(data.params.reportHash).toString('hex')).toBe(
      await simulatedReportHash(
        {
          shareMint: FLEET_MINT.toBase58(),
          paymentMint: PAYMENT_MINT.toBase58(),
          period: { index: 3, periodStart: 20270101, periodEnd: 20270131, gross: 925_000_000n },
        },
        sha256,
      ),
    );
  });

  it('waits a minute between simulated months and gives the minute back on failure', async () => {
    const { deps, body } = await judgeWithSession();
    deps.connection.preflightError = new Error(
      'Transaction simulation failed: blockhash not found',
    );
    expect((await refusal(handleSimulateMonth(deps, body))).code).toBe('transaction_failed');

    deps.connection.preflightError = null;
    await handleSimulateMonth(deps, body);
    deps.clock.now += 10;
    const error = await refusal(handleSimulateMonth(deps, body));
    expect(error.code).toBe('simulation_cooldown');
    expect(error.extra.retryAfter).toBe(DEMO_LIMITS.simulationCooldownSeconds - 10);
  });

  it(`stops at ${DEMO_LIMITS.simulationPeriodCap} payouts`, async () => {
    const { deps, body } = await judgeWithSession({
      fleet: (project) => ({ ...project, periodCount: DEMO_LIMITS.simulationPeriodCap }),
    });

    expect((await refusal(handleSimulateMonth(deps, body))).code).toBe('simulation_cap');
  });

  it('refuses keys that are not the car’s operator and oracle', async () => {
    const { deps, body } = await judgeWithSession({ env: { oracle: Keypair.generate() } });

    const error = await refusal(handleSimulateMonth(deps, body));
    expect(error.code).toBe('misconfigured');
    expect(error.message).toContain('DEMO_ORACLE_SECRET');
  });
});

describe('GET /api/demo/status', () => {
  it('reports the faucet, the fleet car and what a wallet has used', async () => {
    const deps = await demoDeps();
    const judge = Keypair.generate();
    await granted(deps, judge);

    const status = await handleStatus(deps, judge.publicKey.toBase58());

    expect(status).toMatchObject({
      available: true,
      code: null,
      turnstile: false,
      sharedLimits: false,
      faucet: { address: roles.faucet.publicKey.toBase58(), lamports: 5e9 },
      access: { granted: 1, cap: DEMO_LIMITS.accessCap, dripAmount: '50000000000' },
      fleet: {
        mint: FLEET_MINT.toBase58(),
        status: 'operating',
        periods: 3,
        deskShares: DESK_SHARES.toString(),
        cooldownSeconds: null,
      },
      wallet: { accessGranted: true, sharesReceived: false, simulationsToday: 0 },
    });
  });

  it('is unavailable, with the reason, when the faucet is low or the fleet car is missing', async () => {
    const low = await handleStatus(await demoDeps({ faucetLamports: 0 }), null);
    expect(low).toMatchObject({ available: false, code: 'faucet_low', wallet: null });

    const missing = await handleStatus(
      await demoDeps({ env: { demoFleetMint: key(fixture.paymentMint) } }),
      null,
    );
    expect(missing).toMatchObject({ available: false, code: 'misconfigured', fleet: null });
  });
});
