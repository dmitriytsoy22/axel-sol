'use client';

import React from 'react';
import { useDashboard } from '@/hooks/useDashboard';
import { PortfolioSummary } from './PortfolioSummary';
import { HoldingsTable } from './HoldingsTable';
import { RevenuePeriodsCard } from './RevenuePeriodsCard';
import { TelemetryWidget } from './TelemetryWidget';
import { useTranslations } from 'next-intl';
import { RpcErrorBoundary } from '@/components/shared/RpcErrorBoundary';

function DashboardContent(): JSX.Element {
  const { holdings, revenuePeriods, summary, isLoading, connected, error } = useDashboard();
  const t = useTranslations('Dashboard');

  if (error) {
    throw error;
  }

  if (!connected) {
    return (
      <div className="text-center py-24" data-testid="dashboard-disconnected">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t('title')}</h2>
        <p className="text-gray-500 mb-8 max-w-sm mx-auto">{t('connectWallet')}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64" data-testid="dashboard-loading">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary"></div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500" data-testid="dashboard-view">
      <h1 className="text-3xl font-semibold text-gray-900 mb-8">{t('title')}</h1>
      {holdings.length > 0 && (
        <PortfolioSummary 
          totalValue={summary.totalValue} 
          tokensHeld={summary.tokensHeld} 
          unclaimedRevenue={summary.unclaimedRevenue} 
        />
      )}
      {holdings.length > 0 && (
        <TelemetryWidget projectId={holdings[0].project.mint} />
      )}
      <HoldingsTable holdings={holdings} />
      <RevenuePeriodsCard periods={revenuePeriods} />
    </div>
  );
}

export function DashboardView(): JSX.Element {
  const { refetch } = useDashboard();
  return (
    <RpcErrorBoundary onReset={refetch}>
      <DashboardContent />
    </RpcErrorBoundary>
  );
}

