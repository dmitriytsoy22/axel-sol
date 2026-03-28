import React from 'react';
import { ProjectState } from '@/types/project';
import { AddressLink } from './AddressLink';
import { useTranslations } from 'next-intl';

interface InvestmentDetailsProps {
  project: ProjectState;
}

export function InvestmentDetails({ project }: InvestmentDetailsProps): React.JSX.Element {
  const t = useTranslations('Asset');
  
  const formatSol = (lamports: number) => (lamports / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 });

  const details = [
    { label: t('pricePerToken'), value: `${formatSol(project.pricePerToken)} SOL` },
    { label: t('minInvestment'), value: `${formatSol(project.minInvestment)} SOL` },
    { label: t('maxInvestment'), value: `${formatSol(project.maxInvestment)} SOL` },
    { label: t('mintAddress'), value: <AddressLink address={project.mint} /> },
    { label: t('vaultAddress'), value: <AddressLink address={project.escrowVault} /> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xl font-semibold text-gray-900">{t('investmentDetails')}</h3>
      
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        {details.map((item, idx) => (
          <div 
            key={item.label} 
            className={`flex justify-between items-center p-4 ${idx !== details.length - 1 ? 'border-b border-gray-100' : ''}`}
          >
            <span className="text-sm font-medium text-gray-500">{item.label}</span>
            <span className="text-sm font-semibold text-gray-900">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
