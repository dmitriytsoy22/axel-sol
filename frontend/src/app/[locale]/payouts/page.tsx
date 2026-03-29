import React from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { PayoutHistoryTable } from '@/components/features/payouts/PayoutHistoryTable';
import { usePayoutHistory } from '@/hooks/usePayoutHistory';
import { Wallet, CheckCircle, List } from 'lucide-react';

export default function PayoutsPage() {
  const t = useTranslations('Payouts');
  const { data, summary, isLoading } = usePayoutHistory();

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-10 space-y-8 animate-fade-in">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">{t('title')}</h1>
        <p className="text-gray-500 max-w-2xl">{t('description')}</p>
      </div>

      {!isLoading && summary ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 border-l-4 border-l-green-400">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-50 rounded-xl text-green-500">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">{t('totalClaimed')}</p>
                <p className="text-2xl font-bold text-gray-900">${summary.totalClaimed.toLocaleString()}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-l-4 border-l-[#00D1FF]">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-[#00D1FF]/10 rounded-xl text-[#00D1FF]">
                <Wallet className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">{t('unclaimed')}</p>
                <p className="text-2xl font-bold text-gray-900">${summary.unclaimed.toLocaleString()}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-l-4 border-l-indigo-400">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-50 rounded-xl text-indigo-500">
                <List className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">{t('periods')}</p>
                <p className="text-2xl font-bold text-gray-900">{summary.periods}</p>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-6">
              <div className="flex items-center gap-4 animate-pulse">
                <div className="w-12 h-12 bg-gray-200 rounded-xl"></div>
                <div className="space-y-2 w-full">
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Main Table */}
      <PayoutHistoryTable data={data} isLoading={isLoading} />
    </div>
  );
}
