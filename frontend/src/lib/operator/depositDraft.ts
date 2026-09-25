import { ed25519 } from '@noble/curves/ed25519';
import { utils } from '@coral-xyz/anchor';
import {
  TransactionMessage,
  VersionedTransaction,
  type PublicKey,
  type TransactionInstruction,
} from '@solana/web3.js';
import { z } from 'zod';
import type { DepositDraft } from '@/lib/api/deposits';
import type { RevenueKind } from '@/lib/solana/accounts';
import { depositRevenueInstruction } from '@/lib/solana/instructions';
import type { Digest } from '@/lib/verify/sha256';
import { dateNumber, documentHash } from '@/lib/verify/telemetry';
import type { Project } from '@/types/project';

/* ── The operator's monthly report ────────────────────── */

export interface ExpenseDraft {
  description: string;
  /** Whole KZT, as typed. */
  amount: string;
  /** Hex SHA-256 of the invoice or policy; empty when there is none. */
  document: string;
}

/** The operator's part of a report as the form holds it (docs/api.md, "Revenue Report: Draft"). */
export interface ReportForm {
  kind: RevenueKind;
  /** YYYY-MM-DD. */
  start: string;
  end: string;
  maintenance: ExpenseDraft[];
  insurance: ExpenseDraft[];
  /** Only in a final report: what the car sold for, and the hash of the sale contract. */
  saleProceeds: string;
  saleDocument: string;
}

export const EMPTY_EXPENSE: ExpenseDraft = { description: '', amount: '', document: '' };

export function emptyReportForm(): ReportForm {
  return {
    kind: 'regular',
    start: '',
    end: '',
    maintenance: [{ ...EMPTY_EXPENSE }],
    insurance: [{ ...EMPTY_EXPENSE }],
    saleProceeds: '',
    saleDocument: '',
  };
}

/** What is wrong with the form, named as the messages under `Operator.problem_*`. */
export type FormProblem = 'period' | 'description' | 'amount' | 'document' | 'sale';

/** Fields of the operator's part; everything else in an uploaded report is derived. */
const OPERATOR_FIELDS = ['mint', 'kind', 'period', 'expenses', 'car_sale'];

const MAX_REPORT_DAYS = 31;
const MAX_DESCRIPTION = 200;
const WHOLE = /^[1-9]\d{0,12}$/;
const HASH = /^[0-9a-fA-F]{64}$/;

const blank = (item: ExpenseDraft) =>
  !item.description.trim() && !item.amount.trim() && !item.document.trim();

function days(start: string, end: string): number | null {
  const from = dateNumber(start);
  const to = dateNumber(end);
  if (from === null || to === null) return null;
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
}

function expenses(
  items: ExpenseDraft[],
):
  | { items: { description: string; amount: number; document_sha256: string | null }[] }
  | { problem: FormProblem } {
  const out: { description: string; amount: number; document_sha256: string | null }[] = [];
  for (const item of items.filter((entry) => !blank(entry))) {
    const description = item.description.trim();
    if (!description || description.length > MAX_DESCRIPTION) return { problem: 'description' };
    if (!WHOLE.test(item.amount.trim())) return { problem: 'amount' };
    const document = item.document.trim();
    if (document && !HASH.test(document)) return { problem: 'document' };
    out.push({
      description,
      amount: Number(item.amount.trim()),
      document_sha256: document ? document.toLowerCase() : null,
    });
  }
  return { items: out };
}

/**
 * The request body for `/v2/deposits/draft`: the fields an uploaded report states beyond the
 * operator's part (the backend checks each against the report it rebuilds), then the form's
 * operator part for the car `mint`.
 */
export function reportRequest(
  form: ReportForm,
  mint: string,
  stated: Record<string, unknown> = {},
): { request: Record<string, unknown> } | { problem: FormProblem } {
  const length = days(form.start, form.end);
  if (length === null || length < 1 || length > MAX_REPORT_DAYS) return { problem: 'period' };
  const maintenance = expenses(form.maintenance);
  if ('problem' in maintenance) return maintenance;
  const insurance = expenses(form.insurance);
  if ('problem' in insurance) return insurance;

  let carSale: { proceeds: number; document_sha256: string } | null = null;
  if (form.kind === 'final') {
    if (!WHOLE.test(form.saleProceeds.trim()) || !HASH.test(form.saleDocument.trim())) {
      return { problem: 'sale' };
    }
    carSale = {
      proceeds: Number(form.saleProceeds.trim()),
      document_sha256: form.saleDocument.trim().toLowerCase(),
    };
  }

  return {
    request: {
      ...stated,
      mint,
      kind: form.kind,
      period: { start: form.start, end: form.end },
      expenses: { maintenance: maintenance.items, insurance: insurance.items },
      car_sale: carSale,
    },
  };
}

const FileItemSchema = z.object({
  description: z.string(),
  amount: z.number(),
  document_sha256: z.string().nullable().optional(),
});

const FileReportSchema = z
  .object({
    mint: z.string().optional(),
    kind: z.enum(['regular', 'final']),
    period: z.object({ start: z.string(), end: z.string() }).passthrough(),
    expenses: z
      .object({
        maintenance: z.array(FileItemSchema).optional(),
        insurance: z.array(FileItemSchema).optional(),
      })
      .passthrough()
      .optional(),
    car_sale: z.object({ proceeds: z.number(), document_sha256: z.string() }).nullable().optional(),
  })
  .passthrough();

export type ReportFileProblem = 'notJson' | 'notReport' | 'otherCar';

/**
 * A monthly report file: a whole report from an earlier draft or the operator's own books, or
 * just its operator part. The form takes the operator part; every other top-level field is
 * sent as stated, so the backend checks the operator's own figures against the published days.
 */
export function readReportFile(
  text: string,
  mint: string,
): { form: ReportForm; stated: Record<string, unknown> } | { problem: ReportFileProblem } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { problem: 'notJson' };
  }
  const parsed = FileReportSchema.safeParse(json);
  if (!parsed.success) return { problem: 'notReport' };
  const report = parsed.data;
  if (report.mint !== undefined && report.mint !== mint) return { problem: 'otherCar' };

  const items = (list: z.infer<typeof FileItemSchema>[] | undefined): ExpenseDraft[] =>
    list && list.length > 0
      ? list.map((item) => ({
          description: item.description,
          amount: String(item.amount),
          document: item.document_sha256 ?? '',
        }))
      : [{ ...EMPTY_EXPENSE }];

  const stated = Object.fromEntries(
    Object.entries(report).filter(([field]) => !OPERATOR_FIELDS.includes(field)),
  );
  return {
    form: {
      kind: report.kind,
      start: report.period.start,
      end: report.period.end,
      maintenance: items(report.expenses?.maintenance),
      insurance: items(report.expenses?.insurance),
      saleProceeds: report.car_sale ? String(report.car_sale.proceeds) : '',
      saleDocument: report.car_sale?.document_sha256 ?? '',
    },
    stated,
  };
}

/* ── The drafted deposit, checked in the browser ──────── */

const ItemSchema = z.object({
  description: z.string(),
  amount: z.number(),
  document_sha256: z.string().nullable(),
});

/** The report fields the operator reviews before signing. */
const ReportViewSchema = z.object({
  mint: z.string(),
  kind: z.enum(['regular', 'final']),
  period: z.object({ start: z.string(), end: z.string(), days: z.number().int() }),
  data_origin: z.string(),
  income: z.object({
    rent: z.number(),
    days_active: z.number().int(),
    trips: z.number().int(),
    km: z.number(),
  }),
  expenses: z.object({
    park_fee: z.object({ bps: z.number().int(), amount: z.number() }),
    maintenance: z.array(ItemSchema),
    insurance: z.array(ItemSchema),
  }),
  car_sale: z.object({ proceeds: z.number(), document_sha256: z.string() }).nullable(),
  totals: z.object({
    maintenance: z.number(),
    insurance: z.number(),
    distributable: z.number(),
  }),
  deposit: z.object({ payment_mint: z.string(), decimals: z.number().int(), gross: z.string() }),
});

export type ReportView = z.infer<typeof ReportViewSchema>;

/**
 * Why a draft is not signed, named as the messages under `Operator.draftProblem_*`:
 * - `reportHash`: the report does not hash to the hash the deposit carries;
 * - `report`: the report is for another car or token, or its amount, period or kind differ
 *   from the deposit's;
 * - `feePayer`: the transaction is not paid by this wallet;
 * - `transaction`: it is not exactly the one `deposit_revenue` this report calls for;
 * - `oracleSignature`: the car's oracle has not signed it.
 */
export type DraftProblem = 'reportHash' | 'report' | 'feePayer' | 'transaction' | 'oracleSignature';

export class DraftCheckError extends Error {
  constructor(readonly problem: DraftProblem) {
    super(`The drafted deposit fails the ${problem} check`);
    this.name = 'DraftCheckError';
  }
}

export interface CheckedDraft {
  draft: DepositDraft;
  report: ReportView;
  /** Base units the deposit moves from the operator's payment account. */
  gross: bigint;
  transaction: VersionedTransaction;
  /** The oracle's signature on the transaction, base58. */
  oracleSignature: string;
}

function sameInstruction(a: TransactionInstruction, b: TransactionInstruction): boolean {
  return (
    a.programId.equals(b.programId) &&
    a.data.equals(b.data) &&
    a.keys.length === b.keys.length &&
    a.keys.every(
      (key, i) =>
        key.pubkey.equals(b.keys[i].pubkey) &&
        key.isSigner === b.keys[i].isSigner &&
        key.isWritable === b.keys[i].isWritable,
    )
  );
}

/**
 * Checks a drafted deposit before the operator's wallet signs it: the report hashes to the
 * deposit's report hash, it is this car's and states the deposit's amount and period, the
 * transaction is exactly the `deposit_revenue` of that report paid by `operator`, and the
 * car's oracle signed it. Nothing the backend says is taken on trust.
 */
export async function checkDepositDraft(
  draft: DepositDraft,
  expected: { project: Project; operator: PublicKey; treasury: PublicKey },
  digest: Digest,
): Promise<CheckedDraft> {
  const { project, operator, treasury } = expected;
  const params = draft.depositParams;

  const hash = await documentHash(draft.report, digest);
  if (hash !== draft.reportHash || hash !== params.reportHash) {
    throw new DraftCheckError('reportHash');
  }
  const view = ReportViewSchema.safeParse(draft.report);
  if (
    !view.success ||
    view.data.mint !== project.shareMint.toBase58() ||
    view.data.deposit.payment_mint !== project.paymentMint.toBase58() ||
    view.data.deposit.gross !== params.gross ||
    view.data.kind !== params.kind ||
    dateNumber(view.data.period.start) !== params.periodStart ||
    dateNumber(view.data.period.end) !== params.periodEnd
  ) {
    throw new DraftCheckError('report');
  }

  let transaction: VersionedTransaction;
  try {
    transaction = VersionedTransaction.deserialize(Buffer.from(draft.transaction, 'base64'));
  } catch {
    throw new DraftCheckError('transaction');
  }
  const { message } = transaction;
  if (message.addressTableLookups.length > 0) throw new DraftCheckError('transaction');
  if (!message.staticAccountKeys[0].equals(operator)) throw new DraftCheckError('feePayer');

  const gross = BigInt(params.gross);
  const deposit = await depositRevenueInstruction({
    project: { ...project, periodCount: draft.periodIndex },
    operator,
    oracle: project.oracle,
    treasury,
    gross,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    reportHash: params.reportHash,
    kind: params.kind,
  });
  const instructions = TransactionMessage.decompile(message).instructions;
  if (instructions.length !== 1 || !sameInstruction(instructions[0], deposit)) {
    throw new DraftCheckError('transaction');
  }

  const oracleIndex = message.staticAccountKeys.findIndex((key) => key.equals(project.oracle));
  const signature = transaction.signatures[oracleIndex];
  if (!ed25519.verify(signature, message.serialize(), project.oracle.toBytes())) {
    throw new DraftCheckError('oracleSignature');
  }

  return {
    draft,
    report: view.data,
    gross,
    transaction,
    oracleSignature: utils.bytes.bs58.encode(signature),
  };
}
