'use client';

import React, { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import type { PublicKey } from '@solana/web3.js';
import {
  ArrowUpRight,
  CircleCheck,
  FileUp,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ExplorerLink } from '@/components/ui/ExplorerLink';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { useTransactionSender } from '@/hooks/useTransactionSender';
import { DepositDraftError, requestDepositDraft } from '@/lib/api/deposits';
import { TELEMETRY_API_URL } from '@/lib/api/telemetry';
import { formatBps, formatDay, formatNumber, formatTenge, formatTokenAmount } from '@/lib/format';
import {
  checkDepositDraft,
  DraftCheckError,
  EMPTY_EXPENSE,
  emptyReportForm,
  readReportFile,
  reportRequest,
  type CheckedDraft,
  type DraftProblem,
  type ExpenseDraft,
  type FormProblem,
  type ReportFileProblem,
  type ReportForm,
} from '@/lib/operator/depositDraft';
import { getExplorerUrl } from '@/lib/solana/connection';
import { webCryptoSha256, type Digest } from '@/lib/verify/sha256';
import type { Project } from '@/types/project';
import { textInputClass } from './inputs';

const plainInputClass = textInputClass.replace('font-mono ', '');

function fileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

const ORIGIN_TONE: Record<string, PillTone> = {
  yandex_fleet: 'success',
  simulated: 'warning',
  mixed: 'warning',
};

/** Why a draft could not be had: the backend's refusal, a failed browser check, or no answer. */
type DraftFailure =
  | { kind: 'backend'; status: number; message: string; details: string[] }
  | { kind: 'check'; problem: DraftProblem }
  | { kind: 'unreachable' | 'invalidAnswer' };

const BACKEND_TITLE: Record<number, string> = {
  400: 'refused_400',
  404: 'refused_404',
  409: 'refused_409',
  422: 'refused_422',
  429: 'refused_429',
  503: 'refused_503',
};

function ExpenseList({
  legend,
  items,
  onChange,
}: {
  legend: string;
  items: ExpenseDraft[];
  onChange: (items: ExpenseDraft[]) => void;
}): JSX.Element {
  const t = useTranslations('Operator');
  const update = (index: number, change: Partial<ExpenseDraft>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...change } : item)));

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-small font-medium text-foreground">{legend}</legend>
      {items.map((item, index) => (
        <div
          key={index}
          role="group"
          aria-label={t('itemLabel', { list: legend, number: index + 1 })}
          className="grid gap-2 md:grid-cols-[2fr_1fr_2fr_auto]"
        >
          <input
            aria-label={t('itemDescription')}
            placeholder={t('itemDescription')}
            value={item.description}
            onChange={(e) => update(index, { description: e.target.value })}
            className={plainInputClass}
          />
          <input
            aria-label={t('itemAmount')}
            placeholder={t('itemAmount')}
            inputMode="numeric"
            value={item.amount}
            onChange={(e) => update(index, { amount: e.target.value })}
            className={plainInputClass}
          />
          <input
            aria-label={t('itemDocument')}
            placeholder={t('itemDocument')}
            spellCheck={false}
            value={item.document}
            onChange={(e) => update(index, { document: e.target.value })}
            className={textInputClass}
          />
          <Button
            variant="ghost"
            aria-label={t('removeItem')}
            onClick={() =>
              onChange(
                items.length > 1 ? items.filter((_, i) => i !== index) : [{ ...EMPTY_EXPENSE }],
              )
            }
          >
            <Trash2 aria-hidden="true" strokeWidth={1.75} />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...items, { ...EMPTY_EXPENSE }])}
      >
        <Plus aria-hidden="true" strokeWidth={1.75} />
        {t('addItem')}
      </Button>
    </fieldset>
  );
}

function Row({
  label,
  children,
  strong = false,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-small text-muted-foreground">{label}</dt>
      <dd
        className={`text-right tabular-nums text-foreground ${strong ? 'text-body font-semibold' : 'text-small font-medium'}`}
      >
        {children}
      </dd>
    </div>
  );
}

/** The drafted deposit as the operator's wallet will sign it, with what the browser checked. */
function DraftReview({
  checked,
  project,
  apiUrl,
}: {
  checked: CheckedDraft;
  project: Project;
  apiUrl: string;
}): JSX.Element {
  const t = useTranslations('Operator');
  const tTelemetry = useTranslations('Telemetry');
  const locale = useLocale();
  const { report, draft } = checked;
  const tenge = (value: number) => formatTenge(value, locale);
  const sum = (items: { amount: number }[]) =>
    items.reduce((total, item) => total + item.amount, 0);
  const origin: Record<string, string> = {
    yandex_fleet: tTelemetry('originYandexFleet'),
    simulated: tTelemetry('originSimulated'),
    mixed: tTelemetry('originMixed'),
  };
  const reportUrl = `${apiUrl}/published/${project.shareMint.toBase58()}/reports/${draft.reportHash}.json`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-body font-semibold text-foreground">
          {t('payoutOf', {
            index: draft.periodIndex,
            start: formatDay(draft.depositParams.periodStart, locale),
            end: formatDay(draft.depositParams.periodEnd, locale),
          })}
        </p>
        {report.kind === 'final' && <Pill tone="info">{t('kind_final')}</Pill>}
        <Pill tone={ORIGIN_TONE[report.data_origin] ?? 'neutral'}>
          <span className="sr-only">{tTelemetry('originLabel')}: </span>
          {origin[report.data_origin] ?? report.data_origin}
        </Pill>
      </div>

      <dl className="divide-y divide-border">
        <Row label={t('rent', { days: report.income.days_active, total: report.period.days })}>
          {tenge(report.income.rent)}
        </Row>
        <Row label={t('tripsKm')}>
          {t('tripsKmValue', {
            trips: formatNumber(report.income.trips, locale),
            km: formatNumber(report.income.km, locale),
          })}
        </Row>
        <Row label={t('parkFee', { rate: formatBps(report.expenses.park_fee.bps, locale) })}>
          −{tenge(report.expenses.park_fee.amount)}
        </Row>
        <Row label={t('maintenance')}>−{tenge(sum(report.expenses.maintenance))}</Row>
        <Row label={t('insurance')}>−{tenge(sum(report.expenses.insurance))}</Row>
        {report.car_sale && <Row label={t('saleProceeds')}>+{tenge(report.car_sale.proceeds)}</Row>}
        <Row label={t('distributable')} strong>
          {tenge(report.totals.distributable)}
        </Row>
        <Row label={t('youDeposit')} strong>
          {formatTokenAmount(checked.gross, project.payment, locale)}
        </Row>
      </dl>
      <p className="text-small text-muted-foreground">
        {t('feeNote', { rate: formatBps(project.revenueFeeBps, locale) })}
      </p>

      <div className="flex flex-col gap-4 rounded-card border border-border bg-muted p-5">
        <div>
          <p className="text-small font-medium text-foreground">{t('reportHash')}</p>
          <p className="mt-1 break-all font-mono text-small text-foreground">{draft.reportHash}</p>
          <p className="mt-1 inline-flex items-center gap-2 text-small text-muted-foreground">
            <CircleCheck aria-hidden="true" className="h-4 w-4 text-success" strokeWidth={1.75} />
            {t('reportHashChecked')}
          </p>
          <a
            href={reportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex min-h-11 items-center gap-1 text-small font-medium text-primary underline-offset-4 hover:underline md:min-h-0"
          >
            {t('openReport')}
            <ArrowUpRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
          </a>
        </div>
        <div>
          <p className="text-small font-medium text-foreground">{t('attestor')}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted-foreground">
            <ExplorerLink address={project.oracle.toBase58()} srLabel={t('openInExplorer')} />
            <span title={checked.oracleSignature} className="break-all font-mono text-foreground">
              {checked.oracleSignature}
            </span>
          </p>
          <p className="mt-1 inline-flex items-center gap-2 text-small text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-success" strokeWidth={1.75} />
            {t('attestorChecked')}
          </p>
        </div>
      </div>
      <p className="text-small text-muted-foreground">
        {t('expiryNote', { height: formatNumber(draft.lastValidBlockHeight, locale) })}
      </p>
    </div>
  );
}

/**
 * The operator's monthly deposit: its report in (typed here or loaded from a file), the
 * deposit the car's oracle co-signed out, checked in the browser, then signed by the
 * operator's wallet and sent. The backend is the one in NEXT_PUBLIC_TELEMETRY_API_URL: the
 * car's oracle, which publishes the trip data the report is rebuilt from.
 */
export function DepositDraftPanel({
  project,
  treasury,
  onDeposited,
  apiUrl = TELEMETRY_API_URL,
  digest = webCryptoSha256,
}: {
  project: Project;
  treasury: PublicKey;
  onDeposited: () => void;
  apiUrl?: string | null;
  digest?: Digest;
}): JSX.Element {
  const t = useTranslations('Operator');
  const formId = useId();
  const { publicKey } = useWallet();
  const { sendPrepared } = useTransactionSender();
  const [form, setForm] = useState<ReportForm>(emptyReportForm);
  const [stated, setStated] = useState<Record<string, unknown>>({});
  const [file, setFile] = useState<{
    name: string;
    problem: ReportFileProblem | 'unreadable' | null;
  } | null>(null);
  const [problem, setProblem] = useState<FormProblem | null>(null);
  const [busy, setBusy] = useState<'draft' | 'send' | null>(null);
  const [failure, setFailure] = useState<DraftFailure | null>(null);
  const [checked, setChecked] = useState<CheckedDraft | null>(null);
  const [sent, setSent] = useState<{ signature: string; index: number } | null>(null);
  const mint = project.shareMint.toBase58();
  const set = (change: Partial<ReportForm>) => setForm((current) => ({ ...current, ...change }));

  const load = async (chosen: File | undefined) => {
    if (!chosen) return;
    let text: string;
    try {
      text = await fileText(chosen);
    } catch {
      setFile({ name: chosen.name, problem: 'unreadable' });
      return;
    }
    const read = readReportFile(text, mint);
    if ('problem' in read) {
      setFile({ name: chosen.name, problem: read.problem });
      return;
    }
    setForm(read.form);
    setStated(read.stated);
    setFile({ name: chosen.name, problem: null });
    setProblem(null);
  };

  const requestDraft = async () => {
    if (!apiUrl || !publicKey) return;
    const built = reportRequest(form, mint, stated);
    if ('problem' in built) {
      setProblem(built.problem);
      return;
    }
    setProblem(null);
    setFailure(null);
    setBusy('draft');
    try {
      const draft = await requestDepositDraft(apiUrl, built.request);
      setChecked(
        await checkDepositDraft(draft, { project, operator: publicKey, treasury }, digest),
      );
    } catch (error) {
      if (error instanceof DepositDraftError) {
        setFailure({
          kind: 'backend',
          status: error.status,
          message: error.message,
          details: error.details,
        });
      } else if (error instanceof DraftCheckError) {
        setFailure({ kind: 'check', problem: error.problem });
      } else {
        // fetch rejects with a TypeError when the backend cannot be reached at all.
        setFailure({ kind: error instanceof TypeError ? 'unreachable' : 'invalidAnswer' });
      }
    } finally {
      setBusy(null);
    }
  };

  const signAndSend = async () => {
    if (!checked) return;
    setBusy('send');
    const signature = await sendPrepared(checked.transaction, {
      successTitle: t('depositDone'),
      failureTitle: t('depositFailed'),
    });
    setBusy(null);
    if (signature) {
      setSent({ signature, index: checked.draft.periodIndex });
      setChecked(null);
      setForm(emptyReportForm());
      setStated({});
      setFile(null);
      onDeposited();
    }
  };

  let body: React.ReactNode;
  if (!apiUrl) {
    body = <p className="max-w-[62ch] text-body text-muted-foreground">{t('noBackend')}</p>;
  } else if (checked) {
    body = (
      <div className="flex flex-col gap-6">
        <DraftReview checked={checked} project={project} apiUrl={apiUrl} />
        <div className="flex flex-wrap gap-3">
          <Button size="lg" onClick={signAndSend} disabled={busy !== null}>
            {busy === 'send' && (
              <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />
            )}
            {t('signAndDeposit')}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onClick={() => setChecked(null)}
            disabled={busy !== null}
          >
            {t('editReport')}
          </Button>
        </div>
      </div>
    );
  } else {
    const statedFields = Object.keys(stated);
    body = (
      <div className="flex flex-col gap-6">
        {sent && (
          <p className="inline-flex flex-wrap items-center gap-2 text-body text-foreground">
            <CircleCheck aria-hidden="true" className="h-5 w-5 text-success" strokeWidth={1.75} />
            {t('deposited', { index: sent.index })}
            <a
              href={getExplorerUrl(sent.signature, 'tx')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-small font-medium text-primary underline-offset-4 hover:underline"
            >
              {t('viewTransaction')}
              <ArrowUpRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            </a>
          </p>
        )}
        <div className="flex flex-col gap-2">
          <label
            htmlFor={`${formId}-file`}
            className="inline-flex items-center gap-2 text-small font-medium text-foreground"
          >
            <FileUp aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            {t('loadFile')}
          </label>
          <input
            id={`${formId}-file`}
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              void load(e.target.files?.[0]);
              e.target.value = '';
            }}
            className="text-small text-muted-foreground file:mr-3 file:h-10 file:cursor-pointer file:rounded-control file:border file:border-border file:bg-card file:px-4 file:text-small file:font-medium file:text-foreground"
          />
          {file?.problem && (
            <p role="alert" className="text-small text-destructive">
              {t(`file_${file.problem}`, { name: file.name })}
            </p>
          )}
          {file && !file.problem && (
            <div className="flex flex-wrap items-center gap-3 text-small text-muted-foreground">
              <span>
                {statedFields.length > 0
                  ? t('fileLoadedStated', { name: file.name, fields: statedFields.join(', ') })
                  : t('fileLoaded', { name: file.name })}
              </span>
              {statedFields.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setStated({})}>
                  {t('dropStated')}
                </Button>
              )}
            </div>
          )}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-small font-medium text-foreground">{t('kind')}</legend>
          <div className="flex flex-wrap gap-4">
            {(['regular', 'final'] as const).map((kind) => (
              <label
                key={kind}
                className="inline-flex min-h-11 items-center gap-2 text-body text-foreground"
              >
                <input
                  type="radio"
                  name={`${formId}-kind`}
                  checked={form.kind === kind}
                  onChange={() => set({ kind })}
                  className="h-4 w-4 accent-primary"
                />
                {t(`kind_${kind}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor={`${formId}-start`} className="text-small font-medium text-foreground">
              {t('periodStart')}
            </label>
            <input
              id={`${formId}-start`}
              type="date"
              value={form.start}
              onChange={(e) => set({ start: e.target.value })}
              className={`${plainInputClass} mt-2`}
            />
          </div>
          <div>
            <label htmlFor={`${formId}-end`} className="text-small font-medium text-foreground">
              {t('periodEnd')}
            </label>
            <input
              id={`${formId}-end`}
              type="date"
              value={form.end}
              onChange={(e) => set({ end: e.target.value })}
              className={`${plainInputClass} mt-2`}
            />
          </div>
        </div>

        <ExpenseList
          legend={t('maintenance')}
          items={form.maintenance}
          onChange={(maintenance) => set({ maintenance })}
        />
        <ExpenseList
          legend={t('insurance')}
          items={form.insurance}
          onChange={(insurance) => set({ insurance })}
        />

        {form.kind === 'final' && (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor={`${formId}-proceeds`}
                className="text-small font-medium text-foreground"
              >
                {t('saleProceeds')}
              </label>
              <input
                id={`${formId}-proceeds`}
                inputMode="numeric"
                value={form.saleProceeds}
                onChange={(e) => set({ saleProceeds: e.target.value })}
                className={`${plainInputClass} mt-2`}
              />
            </div>
            <div>
              <label
                htmlFor={`${formId}-contract`}
                className="text-small font-medium text-foreground"
              >
                {t('saleDocument')}
              </label>
              <input
                id={`${formId}-contract`}
                spellCheck={false}
                value={form.saleDocument}
                onChange={(e) => set({ saleDocument: e.target.value })}
                className={`${textInputClass} mt-2`}
              />
            </div>
          </div>
        )}

        {problem && (
          <p role="alert" className="text-small text-destructive">
            {t(`problem_${problem}`)}
          </p>
        )}
        {failure && (
          <div
            role="alert"
            className="rounded-card border border-destructive bg-destructive-muted px-5 py-4"
          >
            <p className="text-body font-medium text-foreground">
              {failure.kind === 'backend'
                ? t(BACKEND_TITLE[failure.status] ?? 'refused_other', { status: failure.status })
                : failure.kind === 'check'
                  ? t(`draftProblem_${failure.problem}`)
                  : t(failure.kind)}
            </p>
            {failure.kind === 'backend' && (
              <>
                <p className="mt-1 text-small text-muted-foreground">{failure.message}</p>
                {failure.details.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 font-mono text-small text-foreground">
                    {failure.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
        <Button size="lg" className="self-start" onClick={requestDraft} disabled={busy !== null}>
          {busy === 'draft' && (
            <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />
          )}
          {t('requestDraft')}
        </Button>
      </div>
    );
  }

  return (
    <section
      aria-labelledby={`${formId}-title`}
      className="rounded-card border border-border bg-card p-6 shadow-sm md:p-8"
    >
      <h2 id={`${formId}-title`} className="text-title font-semibold text-foreground">
        {t('title')}
      </h2>
      <p className="mt-2 max-w-[62ch] text-body text-muted-foreground">
        {t('lead', { symbol: project.payment.symbol })}
      </p>
      <div className="mt-6">{body}</div>
    </section>
  );
}
