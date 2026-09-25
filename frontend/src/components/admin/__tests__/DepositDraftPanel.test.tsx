import React from 'react';
import { createHash, webcrypto } from 'node:crypto';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ed25519 } from '@noble/curves/ed25519';
import { utils } from '@coral-xyz/anchor';
import {
  ComputeBudgetProgram,
  Keypair,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  type PublicKey,
  type SendOptions,
} from '@solana/web3.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { depositRevenueInstruction } from '@/lib/solana/instructions';
import { projectAddress } from '@/lib/solana/pda';
import { fetchConfig } from '@/lib/solana/readers';
import { canonicalize } from '@/lib/verify/jcs';
import type { Digest } from '@/lib/verify/sha256';
import { fixture, FixtureNode, fixtureProject, key } from '@/lib/solana/__tests__/fixtures/chain';
import { patchProgramAccount } from '@/lib/solana/__tests__/fixtures/accountPatch';
import { AppProviders, testWallet } from '@/__tests__/helpers/providers';
import type { Project } from '@/types/project';
import { DepositDraftPanel } from '../DepositDraftPanel';

const API = 'https://oracle.axel.example';
const digest: Digest = async (data) =>
  new Uint8Array(await webcrypto.subtle.digest('SHA-256', data));
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** A node that keeps every raw transaction sent to it and confirms it. */
class SendingNode extends FixtureNode {
  sent: VersionedTransaction[] = [];

  override async sendRawTransaction(
    rawTransaction: Buffer | Uint8Array | number[],
    _options?: SendOptions,
  ): Promise<string> {
    const transaction = VersionedTransaction.deserialize(Uint8Array.from(rawTransaction));
    this.sent.push(transaction);
    return utils.bytes.bs58.encode(transaction.signatures[0]);
  }
}

/** The operating car with an operator and an oracle whose keys the test holds. */
async function operatedCar() {
  const operator = Keypair.generate();
  const oracle = Keypair.generate();
  const accounts = await patchProgramAccount(
    'project',
    projectAddress(key(fixture.projects.operating.shareMint)),
    (project) => ({ ...project, operator: operator.publicKey, oracle: oracle.publicKey }),
  );
  const node = new SendingNode(accounts);
  const project = await fixtureProject('operating', node);
  const config = await fetchConfig(node);
  if (!config) throw new Error('The fixture has no config');
  return { operator, oracle, node, project, treasury: config.treasury };
}

type Car = Awaited<ReturnType<typeof operatedCar>>;

/** The report the backend rebuilds for September, as `buildReport` writes it. */
function septemberReport(project: Project, gross = '203425000000') {
  return {
    schema: 'axel.revenue-report/v1',
    mint: project.shareMint.toBase58(),
    project: project.address.toBase58(),
    kind: 'regular',
    period: { start: '2026-09-01', end: '2026-09-30', days: 30 },
    currency: 'KZT',
    data_origin: 'simulated',
    income: { rent: 260500, days_active: 26, trips: 431, km: 3890 },
    expenses: {
      park_fee: { bps: 1500, amount: 39075 },
      maintenance: [{ description: 'Oil and filters', amount: 18000, document_sha256: null }],
      insurance: [],
    },
    car_sale: null,
    totals: { maintenance: 18000, insurance: 0, distributable: 203425 },
    deposit: {
      payment_mint: project.paymentMint.toBase58(),
      decimals: project.payment.decimals,
      gross,
    },
    telemetry: { first_position: 1, last_position: 30, days: [] },
  };
}

/**
 * The backend's draft: the deposit of `report` for the car's next period, paid by `payer`
 * and signed by the oracle. Each option breaks one thing the browser must catch.
 */
async function draftOf(
  car: Car,
  {
    report = septemberReport(car.project),
    payer = car.operator.publicKey,
    gross = report.deposit.gross,
    oracleSigns = true,
  }: {
    report?: ReturnType<typeof septemberReport>;
    payer?: PublicKey;
    gross?: string;
    oracleSigns?: boolean;
  } = {},
) {
  const reportHash = sha256(canonicalize(report));
  const params = {
    gross: report.deposit.gross,
    periodStart: 20260901,
    periodEnd: 20260930,
    reportHash,
    kind: 'regular' as const,
  };
  const instruction = await depositRevenueInstruction({
    project: car.project,
    operator: payer,
    oracle: car.oracle.publicKey,
    treasury: car.treasury,
    gross: BigInt(gross),
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    reportHash,
    kind: 'regular',
  });
  const transaction = new VersionedTransaction(
    new TransactionMessage({
      payerKey: payer,
      recentBlockhash: 'EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k',
      instructions: [instruction],
    }).compileToV0Message(),
  );
  if (oracleSigns) transaction.sign([car.oracle]);
  return {
    reportHash,
    dataOrigin: 'simulated',
    report,
    depositParams: params,
    periodIndex: car.project.periodCount,
    operator: car.operator.publicKey.toBase58(),
    transaction: Buffer.from(transaction.serialize()).toString('base64'),
    lastValidBlockHeight: 1_000,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A wallet that adds a priority fee to what it signs, as some do unless told not to. */
function addsPriorityFee(car: Car) {
  return async <T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> => {
    if (!(transaction instanceof VersionedTransaction)) throw new Error('Expected a v0 deposit');
    const message = TransactionMessage.decompile(transaction.message);
    message.instructions.unshift(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }));
    const changed = new VersionedTransaction(message.compileToV0Message());
    changed.sign([car.operator]);
    return changed as T;
  };
}

function renderPanel(
  car: Car,
  {
    apiUrl = API,
    sign,
  }: {
    apiUrl?: string | null;
    sign?: <T extends Transaction | VersionedTransaction>(transaction: T) => Promise<T>;
  } = {},
) {
  const onDeposited = vi.fn();
  /** Every transaction the operator's wallet was asked to sign. */
  const signed: (Transaction | VersionedTransaction)[] = [];
  const signTransaction = async <T extends Transaction | VersionedTransaction>(
    transaction: T,
  ): Promise<T> => {
    signed.push(transaction);
    if (sign) return sign(transaction);
    if (transaction instanceof VersionedTransaction) transaction.sign([car.operator]);
    else transaction.partialSign(car.operator);
    return transaction;
  };
  render(
    <AppProviders
      connection={car.node}
      wallet={testWallet(car.operator.publicKey, { signTransaction })}
    >
      <DepositDraftPanel
        project={car.project}
        treasury={car.treasury}
        onDeposited={onDeposited}
        apiUrl={apiUrl}
        digest={digest}
      />
    </AppProviders>,
  );
  return { onDeposited, signed };
}

async function fillSeptember() {
  fireEvent.change(screen.getByLabelText('First day'), { target: { value: '2026-09-01' } });
  fireEvent.change(screen.getByLabelText('Last day'), { target: { value: '2026-09-30' } });
  const oil = within(screen.getByRole('group', { name: 'Maintenance, item 1' }));
  await userEvent.type(oil.getByLabelText('What it was for'), 'Oil and filters');
  await userEvent.type(oil.getByLabelText('Amount, ₸'), '18000');
}

describe('DepositDraftPanel', () => {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("drafts the month from the typed expenses, shows the report hash and the oracle's co-signature, and sends it signed by both", async () => {
    const car = await operatedCar();
    const draft = await draftOf(car);
    fetchMock.mockResolvedValue(json(draft));
    const { onDeposited } = renderPanel(car);

    await fillSeptember();
    await userEvent.click(screen.getByRole('button', { name: 'Request the deposit' }));

    expect(await screen.findByText(draft.reportHash)).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}/v2/deposits/draft`);
    expect(JSON.parse(String(init?.body))).toEqual({
      mint: car.project.shareMint.toBase58(),
      kind: 'regular',
      period: { start: '2026-09-01', end: '2026-09-30' },
      expenses: {
        maintenance: [{ description: 'Oil and filters', amount: 18000, document_sha256: null }],
        insurance: [],
      },
      car_sale: null,
    });
    const oracleSignature = utils.bytes.bs58.encode(
      VersionedTransaction.deserialize(Buffer.from(draft.transaction, 'base64')).signatures[1],
    );
    expect(screen.getByText(oracleSignature)).toBeInTheDocument();
    expect(screen.getByText(/a valid signature of this car's oracle/)).toBeInTheDocument();
    expect(screen.getByText('203,425 tKZT')).toBeInTheDocument();
    expect(screen.getByText('Simulated')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sign and deposit' }));

    expect(await screen.findByText('Income deposited')).toBeInTheDocument();
    expect(
      screen.getByText(`Deposited as payout #${car.project.periodCount}.`),
    ).toBeInTheDocument();
    expect(onDeposited).toHaveBeenCalledTimes(1);
    const [sent] = car.node.sent;
    const message = sent.message.serialize();
    expect(sent.message.staticAccountKeys[0].equals(car.operator.publicKey)).toBe(true);
    expect(ed25519.verify(sent.signatures[0], message, car.operator.publicKey.toBytes())).toBe(
      true,
    );
    expect(ed25519.verify(sent.signatures[1], message, car.oracle.publicKey.toBytes())).toBe(true);
  });

  it('loads a whole report file into the form and sends its stated figures for the backend to check', async () => {
    const car = await operatedCar();
    fetchMock.mockResolvedValue(json(await draftOf(car)));
    renderPanel(car);
    const file = new File([JSON.stringify(septemberReport(car.project))], 'september.json', {
      type: 'application/json',
    });

    await userEvent.upload(screen.getByLabelText('Load a report file (JSON)'), file);

    expect(
      await screen.findByText(/Loaded september.json. It also states schema, project, currency/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('First day')).toHaveValue('2026-09-01');
    await userEvent.click(screen.getByRole('button', { name: 'Request the deposit' }));
    await screen.findByRole('button', { name: 'Sign and deposit' });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.income).toEqual({ rent: 260500, days_active: 26, trips: 431, km: 3890 });
    expect(body.totals).toEqual({ maintenance: 18000, insurance: 0, distributable: 203425 });
    expect(body.expenses.maintenance).toEqual([
      { description: 'Oil and filters', amount: 18000, document_sha256: null },
    ]);
  });

  it.each([
    {
      broken: 'a report changed after it was hashed',
      draft: async (car: Car) => {
        const draft = await draftOf(car);
        return {
          ...draft,
          report: { ...draft.report, totals: { ...draft.report.totals, distributable: 999999 } },
        };
      },
      message: "doesn't hash to the report hash in its deposit",
    },
    {
      broken: 'a deposit paid by another wallet',
      draft: (car: Car) => draftOf(car, { payer: Keypair.generate().publicKey }),
      message: "isn't paid by this wallet",
    },
    {
      broken: 'a deposit of another amount than the report states',
      draft: (car: Car) => draftOf(car, { gross: '999000000000' }),
      message: "isn't exactly the deposit of this report",
    },
    {
      broken: 'a deposit the oracle did not sign',
      draft: (car: Car) => draftOf(car, { oracleSigns: false }),
      message: "doesn't carry a valid signature of this car's oracle",
    },
  ])('refuses to sign $broken', async ({ draft, message }) => {
    const car = await operatedCar();
    fetchMock.mockResolvedValue(json(await draft(car)));
    const { signed } = renderPanel(car);

    await fillSeptember();
    await userEvent.click(screen.getByRole('button', { name: 'Request the deposit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('button', { name: 'Sign and deposit' })).not.toBeInTheDocument();
    expect(signed).toEqual([]);
  });

  it("sends nothing when the wallet changes the deposit, which would void the oracle's signature", async () => {
    const car = await operatedCar();
    fetchMock.mockResolvedValue(json(await draftOf(car)));
    const { onDeposited } = renderPanel(car, { sign: addsPriorityFee(car) });

    await fillSeptember();
    await userEvent.click(screen.getByRole('button', { name: 'Request the deposit' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sign and deposit' }));

    expect(await screen.findByText('Deposit failed')).toBeInTheDocument();
    expect(screen.getByText(/^Your wallet changed the transaction/)).toBeInTheDocument();
    expect(car.node.sent).toEqual([]);
    expect(onDeposited).not.toHaveBeenCalled();
  });

  it('shows which figures differ when the backend refuses the report', async () => {
    const car = await operatedCar();
    fetchMock.mockResolvedValue(
      json(
        {
          statusCode: 422,
          error: 'Unprocessable Entity',
          message: 'The report does not match the published telemetry and the stated expenses',
          differences: ['income.rent', 'totals.distributable'],
        },
        422,
      ),
    );
    renderPanel(car);

    await fillSeptember();
    await userEvent.click(screen.getByRole('button', { name: 'Request the deposit' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("The report doesn't match the car's published trip data.");
    expect(alert).toHaveTextContent('income.rent');
    expect(alert).toHaveTextContent('totals.distributable');
  });

  it('asks for the period before it asks the backend', async () => {
    const car = await operatedCar();
    renderPanel(car);

    await userEvent.click(screen.getByRole('button', { name: 'Request the deposit' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Pick the first and the last day');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says deposits cannot be drafted without an oracle backend', async () => {
    const car = await operatedCar();
    renderPanel(car, { apiUrl: null });

    expect(screen.getByText(/This deployment has no oracle backend/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request the deposit' })).not.toBeInTheDocument();
  });
});
