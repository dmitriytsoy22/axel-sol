import React from 'react';
import { useTranslations } from 'next-intl';

// Mock data for projection visualization
interface RevenueProjectionProps {
  grossMonthlyEstimate?: number; // In USD or SOL
  expensesEstimate?: number;
  reserveEstimate?: number;
}

export function RevenueProjection({ 
  grossMonthlyEstimate = 1200, 
  expensesEstimate = 300, 
  reserveEstimate = 100 
}: RevenueProjectionProps): React.JSX.Element {
  const t = useTranslations('Asset');
  
  const netProfit = grossMonthlyEstimate - expensesEstimate - reserveEstimate;
  
  const expensesPct = (expensesEstimate / grossMonthlyEstimate) * 100;
  const reservePct = (reserveEstimate / grossMonthlyEstimate) * 100;
  const profitPct = (netProfit / grossMonthlyEstimate) * 100;

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xl font-semibold text-gray-900">{t('revenueProjection')}</h3>
      
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col gap-6">
        {/* Abstract Horizontal Stacked Bar */}
        <div className="w-full relative h-4 rounded-full overflow-hidden flex bg-gray-100">
          <div 
            className="bg-brand-primary h-full transition-all duration-1000 ease-out"
            style={{ width: `${profitPct}%` }}
            title={t('netProfit')}
          />
          <div 
            className="bg-gray-300 h-full transition-all duration-1000 ease-out"
            style={{ width: `${expensesPct}%` }}
            title={t('expenses')}
          />
          <div 
            className="bg-gray-400 h-full transition-all duration-1000 ease-out border-l border-white/20"
            style={{ width: `${reservePct}%` }}
            title={t('maintenanceReserve')}
          />
        </div>
        
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-2.5 h-2.5 rounded-full bg-brand-primary" />
              <span className="text-xs font-medium text-gray-500">{t('netProfit')}</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">{profitPct.toFixed(0)}%</span>
            <span className="text-xs text-gray-400 mt-0.5">${netProfit}/mo</span>
          </div>
          
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
              <span className="text-xs font-medium text-gray-500">{t('expenses')}</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">{expensesPct.toFixed(0)}%</span>
            <span className="text-xs text-gray-400 mt-0.5">${expensesEstimate}/mo</span>
          </div>
          
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
              <span className="text-xs font-medium text-gray-500 text-truncate">Reserve</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">{reservePct.toFixed(0)}%</span>
            <span className="text-xs text-gray-400 mt-0.5">${reserveEstimate}/mo</span>
          </div>
        </div>
      </div>
    </div>
  );
}
