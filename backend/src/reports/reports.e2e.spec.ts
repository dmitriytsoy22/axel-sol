import { BorshInstructionCoder } from '@coral-xyz/anchor';
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import { createHash } from 'crypto';

import { canonicalize } from '../common/canonical-json';
import { verifyEd25519Signature } from '../kyc/siws';
import { createAxelProgram, projectAddress } from '../solana/axel-program';
import { type DepositArgs, depositInstruction, depositTransaction } from '../testing/deposit';
import { createTestApp, type TestApp } from '../testing/test-app';
import { TelemetryCronService } from '../telemetry/telemetry-cron.service';

const DAY_MS = 86_400_000;
const OIL_INVOICE = 'aa'.repeat(32);
const SALE_CONTRACT = 'bb'.repeat(32);
/**
 * The simulated days depend only on the mint and the date, so one fixed car keeps every
 * period's income, and whether it covers the expenses, the same on every run. Each test still
 * has its own app, database and chain.
 */
const MINT = new PublicKey('AXLcoEH3vJXUSL7nEr1T4d77NarThcbVrnbBzBR8XPZi');

interface DraftBody {
  report: Record<string, unknown> & {
    totals: { distributable: number };
    deposit: { gross: string };
  };
  reportHash: string;
  dataOrigin: string;
  depositParams: DepositArgs;
}

interface AttestBody {
  reportHash: string;
  dataOrigin: string;
  transaction: string;
  signature: string;
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function days(start: string, end: string): string[] {
  const list: string[] = [];
  for (let ms = Date.parse(start); ms <= Date.parse(end); ms += DAY_MS) {
    list.push(new Date(ms).toISOString().slice(0, 10));
  }
  return list;
}

describe('revenue reports and deposit attestation', () => {
  let t: TestApp;
  const mint = MINT;
  let oracle: Keypair;
  let operator: Keypair;
  let treasury: PublicKey;

  function input(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      mint: mint.toBase58(),
      kind: 'regular',
      period: { start: '2026-09-01', end: '2026-09-20' },
      expenses: {
        maintenance: [
          { description: 'Oil and filters', amount: 18_000, document_sha256: OIL_INVOICE },
        ],
        insurance: [{ description: 'OGPO and KASKO, September', amount: 30_000 }],
      },
      ...overrides,
    };
  }

  async function draft(body: Record<string, unknown> = input()): Promise<DraftBody> {
    const response = await t.http.post('/reports/draft').send(body).expect(200);
    return response.body as DraftBody;
  }

  function signedDeposit(
    drafted: DraftBody,
    options: {
      args?: Partial<DepositArgs>;
      operator?: Keypair;
      oracle?: PublicKey;
      feePayer?: PublicKey;
      signers?: Keypair[];
      extraInstructions?: Parameters<typeof depositTransaction>[1]['extraInstructions'];
      lookupTables?: AddressLookupTableAccount[];
    } = {},
  ): Promise<string> {
    const signer = options.operator ?? operator;
    return depositTransaction(t.rpc, {
      shareMint: mint,
      operator: signer.publicKey,
      oracle: options.oracle ?? oracle.publicKey,
      treasury,
      args: { ...drafted.depositParams, ...options.args },
      feePayer: options.feePayer,
      extraInstructions: options.extraInstructions,
      lookupTables: options.lookupTables,
      signers: options.signers ?? [signer],
    });
  }

  function attest(report: unknown, transaction: string) {
    return t.http.post('/reports/attest').send({ report, transaction });
  }

  async function publishedDay(date: string): Promise<string> {
    const response = await t.http.get(`/telemetry/${mint.toBase58()}/${date}.json`).expect(200);
    return response.text;
  }

  beforeEach(async () => {
    oracle = Keypair.generate();
    operator = Keypair.generate();
    treasury = Keypair.generate().publicKey;
    const paymentMint = Keypair.generate().publicKey;
    t = await createTestApp({
      oracle,
      env: {
        FLEET_CONFIG: JSON.stringify({
          [mint.toBase58()]: {
            plate: '777AXL02',
            source: 'simulated',
            parkFeeBps: 1500,
            simulatedDailyRent: 12_000,
            startDate: '2026-09-01',
          },
        }),
      },
    });
    t.rpc.seedMint(paymentMint, 6);
    await t.rpc.seedProject(mint, {
      operator: operator.publicKey,
      oracle: oracle.publicKey,
      paymentMint,
    });
    await t.app.get(TelemetryCronService).runDailyJob();
  });

  afterEach(async () => {
    await t.app.close();
  });

  it('drafts the report from the published days and the stated expenses', async () => {
    const texts = await Promise.all(days('2026-09-01', '2026-09-20').map(publishedDay));
    const records = texts.map(
      (text) =>
        JSON.parse(text) as { rent_charged: number; trips: number; km: number; status: string },
    );
    const rent = records.reduce((total, day) => total + day.rent_charged, 0);
    const parkFee = Math.floor((rent * 1500) / 10_000);
    const distributable = rent - parkFee - 18_000 - 30_000;
    const lastDay = await t.http
      .get(`/telemetry/${mint.toBase58()}/proof`)
      .query({ date: '2026-09-20' })
      .expect(200);

    const drafted = await draft();

    expect(drafted.report).toEqual({
      schema: 'axel.revenue-report/v1',
      mint: mint.toBase58(),
      project: projectAddress(t.rpc.programId, mint).toBase58(),
      kind: 'regular',
      period: { start: '2026-09-01', end: '2026-09-20', days: 20 },
      currency: 'KZT',
      data_origin: 'simulated',
      income: {
        rent,
        days_active: records.filter((day) => day.status === 'active').length,
        trips: records.reduce((total, day) => total + day.trips, 0),
        km: records.reduce((total, day) => total + day.km, 0),
      },
      expenses: {
        park_fee: { bps: 1500, amount: parkFee },
        maintenance: [
          { description: 'Oil and filters', amount: 18_000, document_sha256: OIL_INVOICE },
        ],
        insurance: [
          { description: 'OGPO and KASKO, September', amount: 30_000, document_sha256: null },
        ],
      },
      car_sale: null,
      totals: { maintenance: 18_000, insurance: 30_000, distributable },
      deposit: {
        payment_mint: t.rpc.project(mint).paymentMint.toBase58(),
        decimals: 6,
        gross: `${distributable}000000`,
      },
      telemetry: {
        first_position: 1,
        last_position: 20,
        head_before: '00'.repeat(32),
        head_after: (lastDay.body as { chain: { headAfter: string } }).chain.headAfter,
        days: texts.map((text, index) => ({
          date: days('2026-09-01', '2026-09-20')[index],
          data_hash: sha256(text),
        })),
      },
    });
    expect(drafted.reportHash).toBe(sha256(canonicalize(drafted.report)));
    expect(drafted.dataOrigin).toBe('simulated');
    expect(drafted.depositParams).toEqual({
      gross: `${distributable}000000`,
      periodStart: 20260901,
      periodEnd: 20260920,
      reportHash: drafted.reportHash,
      kind: 'regular',
    });
  });

  it('refuses to draft a period with a day that is not on-chain yet', async () => {
    const response = await t.http
      .post('/reports/draft')
      .send(input({ period: { start: '2026-09-20', end: '2026-09-25' } }))
      .expect(409);

    expect(response.body).toMatchObject({
      message: 'Not every day of the period is published and confirmed on-chain',
      missingDays: ['2026-09-25'],
    });
  });

  it('refuses to draft a period with a day whose batch has not been confirmed', async () => {
    t.clock.advance(DAY_MS);
    t.rpc.faultNextSend('dropped');
    await t.app.get(TelemetryCronService).runDailyJob();

    const response = await t.http
      .post('/reports/draft')
      .send(input({ period: { start: '2026-09-20', end: '2026-09-25' } }))
      .expect(409);

    expect(response.body).toMatchObject({ missingDays: ['2026-09-25'] });
  });

  it.each([
    ['an unknown kind', { kind: 'bonus' }, 'kind must be "regular" or "final"'],
    [
      'a period that runs backwards',
      { period: { start: '2026-09-20', end: '2026-09-01' } },
      'period must run forwards and cover at most 31 days',
    ],
    [
      'a period longer than a month',
      { period: { start: '2026-08-01', end: '2026-09-20' } },
      'period must run forwards and cover at most 31 days',
    ],
    [
      'a negative expense',
      { expenses: { maintenance: [{ description: 'Refund', amount: -5 }] } },
      'expenses.maintenance[0].amount must be a whole number of KZT from 1 to 1000000000000',
    ],
    [
      'a misspelt expense field',
      { expenses: { insurance: [{ description: 'KASKO', amount: 5, document: 'x' }] } },
      'expenses.insurance[0] has unknown field document',
    ],
    [
      'a sale in a regular report',
      { car_sale: { proceeds: 1, document_sha256: SALE_CONTRACT } },
      'car_sale is only allowed in a final report',
    ],
    [
      'a final report without the sale',
      { kind: 'final' },
      'car_sale is required in a final report',
    ],
  ])('refuses a draft with %s', async (_case, overrides, message) => {
    const response = await t.http.post('/reports/draft').send(input(overrides)).expect(400);

    expect(response.body).toMatchObject({ message });
  });

  it('answers 404 for a car outside the fleet', async () => {
    const stranger = Keypair.generate().publicKey.toBase58();

    const response = await t.http
      .post('/reports/draft')
      .send(input({ mint: stranger }))
      .expect(404);

    expect(response.body).toMatchObject({ message: `${stranger} is not a car of this fleet` });
  });

  it('co-signs a deposit that pays out exactly the drafted report, and publishes the report', async () => {
    const drafted = await draft();
    const sent = await signedDeposit(drafted);

    const response = await attest(drafted.report, sent).expect(200);

    const body = response.body as AttestBody;
    const signed = VersionedTransaction.deserialize(Buffer.from(body.transaction, 'base64'));
    const original = VersionedTransaction.deserialize(Buffer.from(sent, 'base64'));
    const message = signed.message.serialize();
    const keys = signed.message.staticAccountKeys;
    expect(Buffer.from(message)).toEqual(Buffer.from(original.message.serialize()));
    expect(keys.slice(0, signed.message.header.numRequiredSignatures)).toEqual([
      operator.publicKey,
      oracle.publicKey,
    ]);
    expect(
      verifyEd25519Signature(message, signed.signatures[0], operator.publicKey.toBytes()),
    ).toBe(true);
    expect(verifyEd25519Signature(message, signed.signatures[1], oracle.publicKey.toBytes())).toBe(
      true,
    );
    expect(body).toMatchObject({ reportHash: drafted.reportHash, dataOrigin: 'simulated' });

    const coder = new BorshInstructionCoder(
      createAxelProgram(new Connection('http://127.0.0.1:1'), t.rpc.programId).idl,
    );
    const deposit = coder.decode(Buffer.from(signed.message.compiledInstructions[1].data));
    const params = (deposit?.data as { params: { reportHash: number[] } }).params;
    const published = await t.http
      .get(`/reports/${mint.toBase58()}/${drafted.reportHash}.json`)
      .expect(200);
    expect(sha256(published.text)).toBe(Buffer.from(params.reportHash).toString('hex'));
    expect(JSON.parse(published.text)).toEqual(drafted.report);

    const list = await t.http.get(`/reports/${mint.toBase58()}`).expect(200);
    expect(list.body).toEqual({
      mint: mint.toBase58(),
      reports: [
        {
          reportHash: drafted.reportHash,
          kind: 'regular',
          periodStart: '2026-09-01',
          periodEnd: '2026-09-20',
          gross: drafted.report.deposit.gross,
          dataOrigin: 'simulated',
          url: `/reports/${mint.toBase58()}/${drafted.reportHash}.json`,
          attestations: [
            { depositSignature: body.signature, attestedAt: '2026-09-25T06:00:00.000Z' },
          ],
        },
      ],
    });
  });

  it('refuses a report whose figures differ from the published telemetry, and signs nothing', async () => {
    const drafted = await draft();
    const income = drafted.report.income as { rent: number };
    const inflated = { ...drafted.report, income: { ...income, rent: income.rent + 12_000 } };

    const response = await attest(inflated, await signedDeposit(drafted)).expect(422);

    expect(response.body).toMatchObject({
      message: 'The report does not match the published telemetry and the stated expenses',
      differences: ['$.income.rent'],
    });
    const list = await t.http.get(`/reports/${mint.toBase58()}`).expect(200);
    expect(list.body).toEqual({ mint: mint.toBase58(), reports: [] });
  });

  it.each([
    ['gross', { gross: '1' }, 'gross must be'],
    ['period_end', { periodEnd: 20260921 }, 'period_end must be 20260920'],
    ['report_hash', { reportHash: 'cd'.repeat(32) }, 'report_hash must be'],
    ['kind', { kind: 'final' as const }, 'kind must be regular'],
  ])('refuses a deposit whose %s differs from the report', async (_field, args, message) => {
    const drafted = await draft();

    const response = await attest(drafted.report, await signedDeposit(drafted, { args })).expect(
      422,
    );

    expect(response.body).toMatchObject({
      message: expect.stringContaining(message) as unknown,
    });
  });

  it('refuses to sign a transaction that also records telemetry with the oracle', async () => {
    const drafted = await draft();
    const program = createAxelProgram(new Connection('http://127.0.0.1:1'), t.rpc.programId);
    const forged = await program.methods
      .recordTelemetry([
        {
          date: 20260925,
          dataHash: Array<number>(32).fill(1),
          trips: 0,
          km: 0,
          rentPaid: 0,
          status: 1,
        },
      ])
      .accountsStrict({
        oracle: oracle.publicKey,
        project: new PublicKey(drafted.report.project as string),
      })
      .instruction();

    const response = await attest(
      drafted.report,
      await signedDeposit(drafted, { extraInstructions: [forged] }),
    ).expect(422);

    expect(response.body).toMatchObject({
      message: 'Only compute budget instructions and one deposit_revenue are co-signed',
    });
  });

  it('refuses to sign a transaction with any other instruction', async () => {
    const drafted = await draft();
    const transfer = SystemProgram.transfer({
      fromPubkey: operator.publicKey,
      toPubkey: Keypair.generate().publicKey,
      lamports: 1,
    });

    await attest(
      drafted.report,
      await signedDeposit(drafted, { extraInstructions: [transfer] }),
    ).expect(422);
  });

  it('refuses to sign a transaction with two deposits', async () => {
    const drafted = await draft();
    const second = await depositInstruction(t.rpc, {
      shareMint: mint,
      operator: operator.publicKey,
      oracle: oracle.publicKey,
      treasury,
      args: drafted.depositParams,
    });

    await attest(
      drafted.report,
      await signedDeposit(drafted, { extraInstructions: [second] }),
    ).expect(422);
  });

  it('refuses a transaction whose fee the oracle would pay', async () => {
    const drafted = await draft();

    const response = await attest(
      drafted.report,
      await signedDeposit(drafted, { feePayer: oracle.publicKey, signers: [operator] }),
    ).expect(422);

    expect(response.body).toMatchObject({ message: 'The oracle does not pay transaction fees' });
  });

  it("refuses a transaction that makes the oracle's account writable", async () => {
    const drafted = await draft();
    const touchOracle = new TransactionInstruction({
      programId: ComputeBudgetProgram.programId,
      keys: [{ pubkey: oracle.publicKey, isSigner: false, isWritable: true }],
      data: ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }).data,
    });

    const response = await attest(
      drafted.report,
      await signedDeposit(drafted, { extraInstructions: [touchOracle] }),
    ).expect(422);

    expect(response.body).toMatchObject({ message: "The oracle's account must be read-only" });
  });

  it('refuses a deposit the operator has not signed', async () => {
    const drafted = await draft();

    const response = await attest(
      drafted.report,
      await signedDeposit(drafted, { signers: [] }),
    ).expect(401);

    expect(response.body).toMatchObject({
      message: `Every signature but the oracle's must be present: ${operator.publicKey.toBase58()} has not signed`,
    });
  });

  it("refuses a deposit signed by a key that is not the project's operator", async () => {
    const drafted = await draft();

    const response = await attest(
      drafted.report,
      await signedDeposit(drafted, { operator: Keypair.generate() }),
    ).expect(422);

    expect(response.body).toMatchObject({
      message: `deposit_revenue must be signed by the project's operator ${operator.publicKey.toBase58()}`,
    });
  });

  it('refuses a deposit that names another oracle', async () => {
    const drafted = await draft();

    const response = await attest(
      drafted.report,
      await signedDeposit(drafted, { oracle: Keypair.generate().publicKey }),
    ).expect(422);

    expect(response.body).toMatchObject({
      message: "The transaction does not ask for the oracle's signature",
    });
  });

  it('refuses a transaction that uses an address lookup table', async () => {
    const drafted = await draft();
    const table = new AddressLookupTableAccount({
      key: Keypair.generate().publicKey,
      state: {
        deactivationSlot: BigInt('18446744073709551615'),
        lastExtendedSlot: 0,
        lastExtendedSlotStartIndex: 0,
        authority: undefined,
        addresses: [treasury],
      },
    });

    const response = await attest(
      drafted.report,
      await signedDeposit(drafted, { lookupTables: [table] }),
    ).expect(400);

    expect(response.body).toMatchObject({
      message: 'Transactions with address lookup tables are not co-signed',
    });
  });

  it('refuses a transaction that is not base64', async () => {
    const drafted = await draft();

    await attest(drafted.report, 'not a transaction').expect(400);
  });

  it('refuses a period that overlaps a deposit already on-chain', async () => {
    const drafted = await draft();
    await t.rpc.seedRevenuePeriod(mint, { start: '2026-09-15', end: '2026-09-30' });

    const response = await attest(drafted.report, await signedDeposit(drafted)).expect(409);

    expect(response.body).toMatchObject({
      message: 'Period 0 (2026-09-15..2026-09-30) already covers part of this period',
    });
  });

  it("refuses any deposit once the car's sale was paid out", async () => {
    const drafted = await draft();
    await t.rpc.seedRevenuePeriod(mint, { start: '2026-08-01', end: '2026-08-31', kind: 'final' });

    const response = await attest(drafted.report, await signedDeposit(drafted)).expect(409);

    expect(response.body).toMatchObject({
      message: "The car's sale was already paid out in period 0",
    });
  });

  it('refuses an overlapping deposit while an earlier attested one can still land', async () => {
    const first = await draft();
    await attest(first.report, await signedDeposit(first)).expect(200);
    const second = await draft(input({ period: { start: '2026-09-10', end: '2026-09-24' } }));

    const refused = await attest(second.report, await signedDeposit(second)).expect(409);

    expect(refused.body).toMatchObject({
      message: expect.stringContaining('for an overlapping period can still land') as unknown,
    });

    t.rpc.advanceBlocks(151);
    await attest(second.report, await signedDeposit(second)).expect(200);
  });

  it('refuses an overlapping deposit once an earlier attested one has landed', async () => {
    const first = await draft();
    const attested = await attest(first.report, await signedDeposit(first)).expect(200);
    t.rpc.setSignatureStatus((attested.body as AttestBody).signature, null);
    const second = await draft(input({ period: { start: '2026-09-20', end: '2026-09-24' } }));

    const response = await attest(second.report, await signedDeposit(second)).expect(409);

    expect(response.body).toMatchObject({
      message: expect.stringContaining('for an overlapping period has landed') as unknown,
    });
  });

  it('signs only one of two overlapping deposits sent at the same time', async () => {
    const first = await draft();
    const second = await draft(input({ period: { start: '2026-09-10', end: '2026-09-24' } }));
    // An expired earlier attestation makes each request look up the chain between its
    // check and its signature, which is where two unserialised requests would both pass.
    await attest(first.report, await signedDeposit(first)).expect(200);
    t.rpc.advanceBlocks(151);
    const [firstSent, secondSent] = [await signedDeposit(first), await signedDeposit(second)];

    const responses = await Promise.all([
      attest(first.report, firstSent),
      attest(second.report, secondSent),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 409]);
  });

  it('signs the same transaction again with the same result', async () => {
    const drafted = await draft();
    const sent = await signedDeposit(drafted);

    const first = await attest(drafted.report, sent).expect(200);
    const again = await attest(drafted.report, sent).expect(200);

    expect(again.body).toEqual(first.body);
  });

  it('refuses a report with nothing to distribute', async () => {
    const drafted = await draft(
      input({
        expenses: { maintenance: [{ description: 'Engine rebuild', amount: 900_000 }] },
      }),
    );

    expect(drafted.report.totals.distributable).toBeLessThan(0);
    expect(drafted.report.deposit.gross).toBe('0');
    const response = await attest(drafted.report, await signedDeposit(drafted)).expect(422);
    expect(response.body).toMatchObject({
      message: 'The report has nothing to distribute: expenses cover the income',
    });
  });

  it('refuses while the project is paused', async () => {
    const drafted = await draft();
    await t.rpc.setProjectState(mint, 'paused');

    const response = await attest(drafted.report, await signedDeposit(drafted)).expect(409);

    expect(response.body).toMatchObject({ message: 'The project is paused, not operating' });
  });

  it("refuses once this backend is no longer the project's oracle", async () => {
    const drafted = await draft();
    const replacement = Keypair.generate().publicKey;
    await t.rpc.patchProject(mint, { oracle: replacement });

    const response = await attest(drafted.report, await signedDeposit(drafted)).expect(409);

    expect(response.body).toMatchObject({
      message: `This backend is not the project's oracle (${replacement.toBase58()})`,
    });
  });

  it("pays out the car's sale in a final report", async () => {
    const drafted = await draft(
      input({ kind: 'final', car_sale: { proceeds: 5_200_000, document_sha256: SALE_CONTRACT } }),
    );
    const income = drafted.report.income as { rent: number };
    const parkFee = Math.floor((income.rent * 1500) / 10_000);

    await attest(drafted.report, await signedDeposit(drafted)).expect(200);

    expect(drafted.report.totals.distributable).toBe(
      income.rent - parkFee - 18_000 - 30_000 + 5_200_000,
    );
    const list = await t.http.get(`/reports/${mint.toBase58()}`).expect(200);
    expect(list.body).toMatchObject({ reports: [{ kind: 'final' }] });
  });
});

describe('deposit attestation without an oracle key', () => {
  let t: TestApp;

  afterEach(async () => {
    await t.app.close();
  });

  it('answers 503', async () => {
    t = await createTestApp({ oracle: null });

    const response = await t.http
      .post('/reports/attest')
      .send({ report: {}, transaction: 'AQ==' })
      .expect(503);

    expect(response.body).toMatchObject({ message: 'The oracle key is not configured' });
  });
});
