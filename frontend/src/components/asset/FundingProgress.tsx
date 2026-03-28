import React from 'react';
import { ProjectState } from '@/types/project';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { CountdownTimer } from './CountdownTimer';
import { useTranslations } from 'next-intl';

interface FundingProgressProps {
  project: ProjectState;
}

export function FundingProgress({ project }: FundingProgressProps): React.JSX.Element {
  const t = useTranslations('Asset');
  
  const progressPercent = Math.min(
    100, 
    Math.max(0, (project.solRaised / project.maxRaise) * 100)
  );

  const formatSol = (lamports: number) => (lamports / 1_000_000_000).toLocaleString();

  const isEnded = project.deadline * 1000 < Date.now();
  const showCountdown = project.status === 'fundraising' && !isEnded;

  return (
    <div className="flex flex-col gap-4 p-6 bg-white border border-gray-100 shadow-sm rounded-2xl">
      <div className="flex justify-between items-end">
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-1">{t('fundingProgress')}</h3>
          <div className="text-2xl font-semibold text-gray-900">
            {formatSol(project.solRaised)} <span className="text-lg font-medium text-gray-400">/ {formatSol(project.maxRaise)} SOL</span>
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
          <span className="text-xs font-medium text-gray-500 mb-1">
            {showCountdown ? t('endsIn') : t('status')}
          </span>
          {showCountdown ? (
            <CountdownTimer deadline={project.deadline} />
          ) : (
            <span className="font-semibold text-gray-900">{isEnded ? t('ended') : project.status}</span>
          )}
        </div>
      </div>
    </div>
  );
}
