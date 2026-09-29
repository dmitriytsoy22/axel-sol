import React, { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUpRight } from 'lucide-react';
import { DataTable, ColumnDef } from '@/components/ui/DataTable';
import { Pill } from '@/components/ui/Pill';
import { Skeleton } from '@/components/ui/Skeleton';
import type { PayoutRow } from '@/hooks/usePayoutHistory';
import { formatDate, formatDayRange, formatTokenAmount, payoutNumber } from '@/lib/format';
import { getExplorerUrl } from '@/lib/solana/connection';
import { carTitle, type PaymentToken } from '@/lib/solana/tokens';

interface PayoutHistoryTableProps {
  rows: PayoutRow[];
  /** Whether each row knows the wallet's part; the chain alone does not. */
  showEarned: boolean;
  isLoading: boolean;
}

/** One table row with flat fields, so every column sorts on its own value. */
interface PayoutView {
  id: string;
  car: string;
  symbol: string;
  index: number;
  final: boolean;
  /** The period as one range, "Sep 1 – 30, 2026"; a one-day period is one date. */
  period: string;
  /** Sorts the rows; 0 when the block time is unknown. */
  depositedAt: number;
  date: string;
  net: bigint;
  perShare: bigint;
  earned: bigint;
  unit: PaymentToken;
  href: string;
}

function toView(row: PayoutRow, locale: string): PayoutView {
  return {
    id: `${row.project.address.toBase58()}:${row.index}`,
    car: carTitle(row.project.car),
    symbol: row.project.car.symbol,
    index: row.index,
    final: row.kind === 'final',
    period: formatDayRange(row.periodStart, row.periodEnd, locale),
    depositedAt: row.depositedAt ?? 0,
    date: row.depositedAt === null ? '—' : formatDate(row.depositedAt, locale),
    net: row.net,
    perShare: row.net / row.supply,
    earned: row.earned ?? 0n,
    unit: row.project.payment,
    // The deposit transaction when the indexer knows it, else the period account on-chain.
    href: row.signature
      ? getExplorerUrl(row.signature, 'tx')
      : getExplorerUrl(row.period.toBase58()),
  };
}

export function PayoutHistoryTable({
  rows,
  showEarned,
  isLoading,
}: PayoutHistoryTableProps): JSX.Element {
  const t = useTranslations('Payouts');
  const locale = useLocale();
  const data = useMemo(() => rows.map((row) => toView(row, locale)), [rows, locale]);

  const columns = useMemo<ColumnDef<PayoutView>[]>(() => {
    // Two decimals on every amount, so the figures of a column line up.
    const amount = (value: bigint, unit: PaymentToken) =>
      formatTokenAmount(value, unit, locale, 2, { padFraction: true });
    const all: (ColumnDef<PayoutView> | null)[] = [
      {
        header: t('tablePeriod'),
        accessorKey: 'car',
        sortable: true,
        // Block lines, not a flex column: they follow the cell's alignment, left in the table
        // and right in a stacked row, and the pill wraps under the number when the row is narrow.
        cell: (item) => (
          <>
            <span className="block font-medium text-foreground">
              {item.car} <span className="font-mono text-muted-foreground">{item.symbol}</span>
            </span>
            <span className="block text-muted-foreground">
              {t('payoutNumber', { index: payoutNumber(item.index) })}
              {item.final && (
                <>
                  {' '}
                  <Pill tone="info" className="ml-1 align-middle">
                    {t('finalPayout')}
                  </Pill>
                </>
              )}
            </span>
          </>
        ),
      },
      {
        header: t('tableDays'),
        accessorKey: 'period',
        cell: (item) => <span className="text-muted-foreground">{item.period}</span>,
      },
      {
        header: t('tableDate'),
        accessorKey: 'depositedAt',
        sortable: true,
        cell: (item) => <span className="text-muted-foreground">{item.date}</span>,
      },
      {
        header: t('tableDeposited'),
        accessorKey: 'net',
        sortable: true,
        align: 'right',
        cell: (item) => amount(item.net, item.unit),
      },
      {
        header: t('tablePerShare'),
        accessorKey: 'perShare',
        sortable: true,
        align: 'right',
        cell: (item) => amount(item.perShare, item.unit),
      },
      showEarned
        ? {
            header: t('tableEarned'),
            accessorKey: 'earned',
            sortable: true,
            align: 'right',
            cell: (item) => (
              <span className="font-semibold text-foreground">
                +{amount(item.earned, item.unit)}
              </span>
            ),
          }
        : null,
      {
        header: t('tableTxLink'),
        accessorKey: 'href',
        align: 'right',
        cell: (item) => (
          <a
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 font-medium text-primary underline-offset-4 transition-colors duration-fast ease-move hover:text-primary-hover hover:underline xl:min-h-0"
          >
            {t('viewRecord')}
            <ArrowUpRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            <span className="sr-only">{t('openInExplorer')}</span>
          </a>
        ),
      },
    ];
    return all.filter((column): column is ColumnDef<PayoutView> => column !== null);
  }, [t, locale, showEarned]);

  if (isLoading) {
    return (
      <div aria-busy="true" className="rounded-card border border-border bg-card p-5 shadow-sm">
        <span className="sr-only">{t('loading')}</span>
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <DataTable
      data={data}
      columns={columns}
      pageSize={10}
      // Seven columns of Russian amounts and dates need 1 160 px: the full container, from xl.
      stackBelow="xl"
      emptyMessage={t('noPayouts')}
      labels={{
        page: t('page'),
        of: t('of'),
        previous: t('previousPage'),
        next: t('nextPage'),
      }}
    />
  );
}
