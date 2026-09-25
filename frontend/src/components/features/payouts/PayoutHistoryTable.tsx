import React, { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUpRight } from 'lucide-react';
import { DataTable, ColumnDef } from '@/components/ui/DataTable';
import { Pill } from '@/components/ui/Pill';
import { Skeleton } from '@/components/ui/Skeleton';
import { PayoutRecord } from '@/hooks/usePayoutHistory';
import { formatDate, formatPercent, formatSolAmount } from '@/lib/format';

interface PayoutHistoryTableProps {
  data: PayoutRecord[];
  isLoading: boolean;
}

export function PayoutHistoryTable({ data, isLoading }: PayoutHistoryTableProps): JSX.Element {
  const t = useTranslations('Payouts');
  const locale = useLocale();

  const columns = useMemo<ColumnDef<PayoutRecord>[]>(
    () => [
      {
        header: t('tablePeriod'),
        accessorKey: 'period',
        sortable: true,
        cell: (item) => <span className="font-medium text-foreground">{item.period}</span>,
      },
      {
        header: t('tableDate'),
        accessorKey: 'timestamp',
        sortable: true,
        cell: (item) => (
          <span className="text-muted-foreground">{formatDate(item.timestamp / 1000, locale)}</span>
        ),
      },
      {
        header: t('tableDeposited'),
        accessorKey: 'deposited',
        sortable: true,
        align: 'right',
        cell: (item) => formatSolAmount(item.deposited, locale),
      },
      {
        header: t('tableShare'),
        accessorKey: 'share',
        sortable: true,
        align: 'right',
        cell: (item) => formatPercent(item.share, 1, locale),
      },
      {
        header: t('tableClaim'),
        accessorKey: 'claimAmount',
        sortable: true,
        align: 'right',
        cell: (item) => (
          <span className="font-semibold text-foreground">
            +{formatSolAmount(item.claimAmount, locale)}
          </span>
        ),
      },
      {
        header: t('tableStatus'),
        accessorKey: 'status',
        sortable: true,
        cell: (item) =>
          item.status === 'claimed' ? (
            <Pill tone="success">{t('statusClaimed')}</Pill>
          ) : (
            <Pill tone="info">{t('statusAvailable')}</Pill>
          ),
      },
      {
        header: t('tableTxLink'),
        accessorKey: 'txLink',
        sortable: false,
        align: 'right',
        cell: (item) =>
          item.txLink ? (
            <a
              href={item.txLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1 font-medium text-primary underline-offset-4 transition-colors duration-fast ease-move hover:text-primary-hover hover:underline sm:min-h-0"
            >
              {t('viewRecord')}
              <ArrowUpRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
              <span className="sr-only">{t('openInExplorer')}</span>
            </a>
          ) : (
            <span className="text-subtle-foreground">—</span>
          ),
      },
    ],
    [t, locale],
  );

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
