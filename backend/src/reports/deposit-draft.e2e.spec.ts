import { BorshInstructionCoder, utils } from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  VersionedTransaction,
} from '@solana/web3.js';
import { createHash } from 'crypto';

import { canonicalize } from '../common/canonical-json';
import { verifyEd25519Signature } from '../kyc/siws';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  associatedTokenAddress,
  configAddress,
  createAxelProgram,
  periodAddress,
  projectAddress,
} from '../solana/axel-program';
import { TOKEN_PROGRAM_ID } from '../solana/program-accounts';
import { type DepositArgs, depositTransaction } from '../testing/deposit';
import { createTestApp, type TestApp } from '../testing/test-app';
import { TelemetryCronService } from '../telemetry/telemetry-cron.service';

const OIL_INVOICE = 'aa'.repeat(32);
/** Simulated days depend only on the mint and the date; this car's cover the expenses below. */
const MINT = new PublicKey('AXLcoEH3vJXUSL7nEr1T4d77NarThcbVrnbBzBR8XPZi');

interface DraftBody {
  reportHash: string;
  dataOrigin: string;
  report: Record<string, unknown> & { income: { rent: number } };
  depositParams: DepositArgs;
  periodIndex: number;
  operator: string;
  transaction: string;
  lastValidBlockHeight: number;
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function monthlyReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    mint: MINT.toBase58(),
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

describe('operator deposit drafts', () => {
  let t: TestApp;
  let oracle: Keypair;
  let operator: Keypair;
  let treasury: PublicKey;
  let paymentMint: PublicKey;

  function postDraft(body: unknown) {
    return t.http.post('/v2/deposits/draft').send(body as object);
  }

  async function draft(body: unknown = monthlyReport()): Promise<DraftBody> {
    const response = await postDraft(body).expect(200);
    return response.body as DraftBody;
  }

  /** What the operator's wallet does with a draft: sign it. */
  function signByOperator(drafted: DraftBody): VersionedTransaction {
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(drafted.transaction, 'base64'),
    );
    transaction.sign([operator]);
    return transaction;
  }

  /** A deposit the operator built and signed itself, for `/reports/attest`. */
  function operatorDeposit(drafted: DraftBody, periodIndex: number): Promise<string> {
    return depositTransaction(t.rpc, {
      shareMint: MINT,
      operator: operator.publicKey,
      oracle: oracle.publicKey,
      treasury,
      args: drafted.depositParams,
      periodIndex,
      signers: [operator],
    });
  }

  beforeEach(async () => {
    oracle = Keypair.generate();
    operator = Keypair.generate();
    treasury = Keypair.generate().publicKey;
    paymentMint = Keypair.generate().publicKey;
    t = await createTestApp({
      oracle,
      env: {
        FLEET_CONFIG: JSON.stringify({
          [MINT.toBase58()]: {
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
    await t.rpc.seedConfig({ treasury });
    await t.rpc.seedProject(MINT, {
      operator: operator.publicKey,
      oracle: oracle.publicKey,
      paymentMint,
    });
    await t.app.get(TelemetryCronService).runDailyJob();
  });

  afterEach(async () => {
    await t.app.close();
  });

  it('builds the deposit that pays out the report, co-signed by the oracle for the operator to sign', async () => {
    const reportDraft = await t.http.post('/reports/draft').send(monthlyReport()).expect(200);

    const drafted = await draft();

    const expected = reportDraft.body as Pick<DraftBody, 'report' | 'reportHash' | 'depositParams'>;
    expect(drafted).toMatchObject({
      reportHash: expected.reportHash,
      dataOrigin: 'simulated',
      report: expected.report,
      depositParams: expected.depositParams,
      periodIndex: 0,
      operator: operator.publicKey.toBase58(),
    });
    expect(drafted.reportHash).toBe(sha256(canonicalize(drafted.report)));

    const transaction = VersionedTransaction.deserialize(
      Buffer.from(drafted.transaction, 'base64'),
    );
    const { message } = transaction;
    const bytes = message.serialize();
    expect(message.staticAccountKeys.slice(0, message.header.numRequiredSignatures)).toEqual([
      operator.publicKey,
      oracle.publicKey,
    ]);
    expect(Buffer.from(transaction.signatures[0])).toEqual(Buffer.alloc(64));
    expect(
      verifyEd25519Signature(bytes, transaction.signatures[1], oracle.publicKey.toBytes()),
    ).toBe(true);
    expect(message.isAccountWritable(1)).toBe(false);

    const program = createAxelProgram(new Connection('http://127.0.0.1:1'), t.rpc.programId);
    const [instruction] = message.compiledInstructions;
    expect(message.compiledInstructions).toHaveLength(1);
    const decoded = new BorshInstructionCoder(program.idl).decode(Buffer.from(instruction.data));
    const params = (
      decoded?.data as {
        params: {
          gross: { toString(): string };
          periodStart: number;
          periodEnd: number;
          reportHash: number[];
          kind: object;
        };
      }
    ).params;
    expect({
      name: decoded?.name,
      gross: params.gross.toString(),
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      reportHash: Buffer.from(params.reportHash).toString('hex'),
      kind: params.kind,
    }).toEqual({
      name: 'depositRevenue',
      gross: drafted.depositParams.gross,
      periodStart: 20260901,
      periodEnd: 20260920,
      reportHash: drafted.reportHash,
      kind: { regular: {} },
    });
    const project = projectAddress(t.rpc.programId, MINT);
    const account = t.rpc.project(MINT);
    expect(instruction.accountKeyIndexes.map((index) => message.staticAccountKeys[index])).toEqual([
      operator.publicKey,
      oracle.publicKey,
      configAddress(t.rpc.programId),
      project,
      periodAddress(t.rpc.programId, project, 0),
      paymentMint,
      associatedTokenAddress(operator.publicKey, paymentMint, TOKEN_PROGRAM_ID),
      account.revenueVault,
      treasury,
      associatedTokenAddress(treasury, paymentMint, TOKEN_PROGRAM_ID),
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
      SystemProgram.programId,
    ]);

    const signed = signByOperator(drafted);
    const signature = await t.rpc.sendRawTransaction(signed.serialize());
    expect(signature).toBe(utils.bytes.bs58.encode(signed.signatures[0]));
  });

  it('publishes the report and lists the draft with it', async () => {
    const drafted = await draft();

    const published = await t.http
      .get(`/published/${MINT.toBase58()}/reports/${drafted.reportHash}.json`)
      .expect(200);
    expect(sha256(published.text)).toBe(drafted.reportHash);
    expect(JSON.parse(published.text)).toEqual(drafted.report);

    const list = await t.http.get(`/reports/${MINT.toBase58()}`).expect(200);
    expect(list.body).toMatchObject({
      dataOrigin: 'simulated',
      reports: [
        {
          reportHash: drafted.reportHash,
          attestations: [],
          drafts: [{ periodIndex: 0, draftedAt: '2026-09-25T06:00:00.000Z' }],
        },
      ],
    });
  });

  it('takes back the whole drafted report and checks every figure it states', async () => {
    const first = await draft();

    const again = await draft(first.report);

    expect(again.reportHash).toBe(first.reportHash);
  });

  it('refuses a report whose income differs from the published telemetry, and signs nothing', async () => {
    const { report } = await draft();
    const inflated = { ...report, income: { ...report.income, rent: report.income.rent + 12_000 } };

    const response = await postDraft(inflated).expect(422);

    expect(response.body).toMatchObject({
      message: 'The report does not match the published telemetry and the stated expenses',
      differences: ['$.income.rent'],
    });
  });

  it('refuses a figure the report does not have', async () => {
    const response = await postDraft(monthlyReport({ bonus: 5_000 })).expect(422);

    expect(response.body).toMatchObject({ differences: ['$.bonus'] });
  });

  it('refuses a report without a period', async () => {
    const response = await postDraft(monthlyReport({ period: undefined })).expect(400);

    expect(response.body).toMatchObject({ message: 'period must be an object with start and end' });
  });

  it('refuses a period with a day that is not on-chain yet', async () => {
    const response = await postDraft(
      monthlyReport({ period: { start: '2026-09-20', end: '2026-09-25' } }),
    ).expect(409);

    expect(response.body).toMatchObject({ missingDays: ['2026-09-25'] });
  });

  it('answers 404 for a car outside the fleet', async () => {
    const stranger = Keypair.generate().publicKey.toBase58();

    const response = await postDraft(monthlyReport({ mint: stranger })).expect(404);

    expect(response.body).toMatchObject({ message: `${stranger} is not a car of this fleet` });
  });

  it('refuses a report with nothing to distribute', async () => {
    const response = await postDraft(
      monthlyReport({
        expenses: { maintenance: [{ description: 'Engine rebuild', amount: 900_000 }] },
      }),
    ).expect(422);

    expect(response.body).toMatchObject({
      message: 'The report has nothing to distribute: expenses cover the income',
    });
  });

  it('refuses while the project is paused, and for a project with another oracle', async () => {
    await t.rpc.setProjectState(MINT, 'paused');
    const paused = await postDraft(monthlyReport()).expect(409);
    expect(paused.body).toMatchObject({ message: 'The project is paused, not operating' });

    await t.rpc.setProjectState(MINT, 'operating');
    const replacement = Keypair.generate().publicKey;
    await t.rpc.patchProject(MINT, { oracle: replacement });
    const foreign = await postDraft(monthlyReport()).expect(409);
    expect(foreign.body).toMatchObject({
      message: `This backend is not the project's oracle (${replacement.toBase58()})`,
    });
  });

  it('refuses a period that overlaps a deposit on-chain, and builds the next one after it', async () => {
    await t.rpc.seedRevenuePeriod(MINT, { start: '2026-09-15', end: '2026-09-30' });

    const overlapping = await postDraft(monthlyReport()).expect(409);
    expect(overlapping.body).toMatchObject({
      message: 'Period 0 (2026-09-15..2026-09-30) already covers part of this period',
    });

    const drafted = await draft(
      monthlyReport({ period: { start: '2026-09-01', end: '2026-09-14' } }),
    );
    expect(drafted.periodIndex).toBe(1);
    const message = VersionedTransaction.deserialize(
      Buffer.from(drafted.transaction, 'base64'),
    ).message;
    const period = message.staticAccountKeys[message.compiledInstructions[0].accountKeyIndexes[4]];
    expect(period).toEqual(
      periodAddress(t.rpc.programId, projectAddress(t.rpc.programId, MINT), 1),
    );
  });

  it('drafts the same period again while an earlier draft can still land, as only one of them can', async () => {
    const first = await draft();

    const second = await draft(
      monthlyReport({
        expenses: { maintenance: [{ description: 'Oil and filters', amount: 20_000 }] },
      }),
    );

    expect([first.periodIndex, second.periodIndex]).toEqual([0, 0]);
    expect(second.reportHash).not.toBe(first.reportHash);
  });

  it("refuses a draft while the operator's own deposit for an overlapping period can still land", async () => {
    const drafted = await draft();
    await t.http
      .post('/reports/attest')
      .send({ report: drafted.report, transaction: await operatorDeposit(drafted, 0) })
      .expect(200);

    const response = await postDraft(monthlyReport()).expect(409);

    expect(response.body).toMatchObject({
      message: expect.stringContaining('for an overlapping period can still land') as unknown,
    });
  });

  it('attests an operator-signed deposit for the period index a live draft takes', async () => {
    const drafted = await draft();

    const response = await t.http
      .post('/reports/attest')
      .send({ report: drafted.report, transaction: await operatorDeposit(drafted, 0) })
      .expect(200);

    expect(response.body).toMatchObject({ reportHash: drafted.reportHash });
  });

  it('refuses an operator-signed deposit for a later period index until a live draft expires', async () => {
    const drafted = await draft();

    const refused = await t.http
      .post('/reports/attest')
      .send({ report: drafted.report, transaction: await operatorDeposit(drafted, 1) })
      .expect(409);
    expect(refused.body).toMatchObject({
      message: expect.stringContaining(
        'A deposit draft for an overlapping period can still land as period 0',
      ) as unknown,
    });

    t.rpc.advanceBlocks(151);
    await t.http
      .post('/reports/attest')
      .send({ report: drafted.report, transaction: await operatorDeposit(drafted, 1) })
      .expect(200);
  });
});

describe('operator deposit drafts without an oracle key', () => {
  let t: TestApp;

  afterEach(async () => {
    await t.app.close();
  });

  it('answers 503', async () => {
    t = await createTestApp({ oracle: null });

    const response = await t.http.post('/v2/deposits/draft').send(monthlyReport()).expect(503);

    expect(response.body).toMatchObject({ message: 'The oracle key is not configured' });
  });
});
