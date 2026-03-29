import React, { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, ColumnDef } from '@/components/ui/DataTable';
import { PayoutRecord } from '@/hooks/usePayoutHistory';
import { ExternalLink } from 'lucide-react';

interface PayoutHistoryTableProps {
  data: PayoutRecord[];
  isLoading: boolean;
}

export function PayoutHistoryTable({ data, isLoading }: PayoutHistoryTableProps): JSX.Element {
  const t = useTranslations('Payouts');

  const columns = useMemo<ColumnDef<PayoutRecord>[]>(() => [
    {
      header: t('tablePeriod'),
      accessorKey: 'period',
      sortable: true,
      cell: (item) => <span className="font-medium text-gray-900">{item.period}</span>
    },
    {
      header: t('tableDeposited'),
      accessorKey: 'deposited',
      sortable: true,
      cell: (item) => `$${item.deposited.toLocaleString()}`
    },
    {
      header: t('tableShare'),
      accessorKey: 'share',
      sortable: true,
      cell: (item) => `${(item.share * 100).toFixed(2)}%`
    },
    {
      header: t('tableClaim'),
      accessorKey: 'claimAmount',
      sortable: true,
      cell: (item) => <span className="font-medium text-[#00D1FF]">+${item.claimAmount.toLocaleString()}</span>
    },
    {
      header: t('tableStatus'),
      accessorKey: 'status',
      sortable: true,
      cell: (item) => {
        const isClaimed = item.status === 'claimed';
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            isClaimed ? 'bg-green-100 text-green-800' : 'bg-[#00D1FF]/10 text-[#00D1FF]'
          }`}>
            {isClaimed ? t('statusClaimed') : t('statusAvailable')}
          </span>
        );
      }
    },
    {
      header: t('tableTxLink'),
      accessorKey: 'txLink',
      sortable: false,
      cell: (item) => item.txLink ? (
        <a 
          href={item.txLink} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-[#00D1FF] transition-colors inline-flex items-center"
          title="View Transaction"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      ) : (
        <span className="text-gray-300">-</span>
      )
    }
  ], [t]);

  if (isLoading) {
    return (
      <div className="w-full h-64 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center animate-pulse">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-[#00D1FF]/30 border-t-[#00D1FF] rounded-full animate-spin"></div>
          <span className="text-sm text-gray-500">Loading payout history...</span>
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
    />
  );
}
