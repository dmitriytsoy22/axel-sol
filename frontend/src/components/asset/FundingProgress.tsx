import React from 'react';
import { ProjectState } from '@/types/project';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useTranslations } from 'next-intl';

interface FundingProgressProps {
  project: ProjectState;
}

export function FundingProgress({ project }: FundingProgressProps): React.JSX.Element {
  const t = useTranslations('Asset');

  const totalValue = project.totalTokenSupply * project.pricePerToken;
  const soldValue = project.tokensSold * project.pricePerToken;
  const progressPercent = totalValue > 0
    ? Math.min(100, Math.max(0, (soldValue / totalValue) * 100))
    : 0;

  const formatSol = (lamports: number) => (lamports / 1_000_000_000).toLocaleString();

  return (
    <div className="flex flex-col gap-4 p-6 bg-white border border-gray-100 shadow-sm rounded-2xl">
      <div className="flex justify-between items-end">
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-1">{t('fundingProgress')}</h3>
          <div className="text-2xl font-semibold text-gray-900">
            {formatSol(soldValue)} <span className="text-lg font-medium text-gray-400">/ {formatSol(totalValue)} SOL</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold text-brand-primary">{progressPercent.toFixed(1)}%</div>
        </div>
      </div>

      <ProgressBar progress={progressPercent} className="h-3" />

      <div className="grid grid-cols-2 gap-4 mt-2">
        <div className="flex flex-col bg-gray-50 p-3 rounded-xl">
          <span className="text-xs font-medium text-gray-500 mb-1">{t('tokensRemaining')}</span>
          <span className="text-lg font-semibold text-gray-900">{project.tokensRemaining.toLocaleString()}</span>
        </div>

        <div className="flex flex-col bg-gray-50 p-3 rounded-xl items-end justify-center">
          <span className="text-xs font-medium text-gray-500 mb-1">{t('status')}</span>
          <span className="font-semibold text-gray-900 capitalize">{project.status}</span>
        </div>
      </div>
    </div>
  );
}
