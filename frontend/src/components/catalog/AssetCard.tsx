import React from 'react';
import { ProjectState } from '@/types/project';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Link } from '@/i18n/routing';

interface AssetCardProps {
  project: ProjectState;
}

export function AssetCard({ project }: AssetCardProps): JSX.Element {
  const t = useTranslations('Catalog');

  const getStatusText = (status: ProjectState['status']): string => {
    switch (status) {
      case 'active': return t('statusActive');
      case 'paused': return t('statusPaused');
      case 'closed': return t('statusClosed');
      default: return status;
    }
  };

  const totalValue = project.totalTokenSupply * project.pricePerToken;
  const soldValue = project.tokensSold * project.pricePerToken;
  const progress = totalValue > 0 ? (soldValue / totalValue) * 100 : 0;

  const soldFormatted = (soldValue / 1_000_000_000).toLocaleString();
  const totalFormatted = (totalValue / 1_000_000_000).toLocaleString();
  const priceFormatted = (project.pricePerToken / 1_000_000_000).toLocaleString();

  return (
    <Link href={`/assets/${project.mint}`} className="w-full flex">
      <Card className="flex flex-col group cursor-pointer w-full">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
          <Image
            src={project.imageUrl || '/model1.png'}
            alt={`${project.carMake} ${project.carModel}`}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute top-4 left-4">
            <Badge status={project.status}>
              {getStatusText(project.status)}
            </Badge>
          </div>
        </div>

        <div className="p-5 flex flex-col flex-1">
          <div className="mb-4">
            <h3 className="text-xl font-semibold text-gray-900 mb-1">
              {project.carMake} {project.carModel} <span className="text-gray-500 font-normal">{project.carYear}</span>
            </h3>
            <p className="text-sm text-gray-500">{project.vin.slice(0, 10)}...</p>
          </div>

          <div className="mb-5 flex-1">
            <div className="flex justify-between items-end mb-2">
              <span className="text-sm text-gray-500">{t('raised')}</span>
              <span className="text-sm font-medium text-gray-900">{soldFormatted} / {totalFormatted} SOL</span>
            </div>
            <ProgressBar progress={progress} />
          </div>

          <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 uppercase tracking-wider">{t('pricePerToken')}</span>
              <span className="text-lg font-semibold text-brand-primary">{priceFormatted} SOL</span>
            </div>
            <button className="px-5 py-2.5 bg-brand-primary text-white rounded-full text-sm font-medium hover:bg-cyan-600 transition-colors">
              {project.status === 'active' ? t('investBtn') : t('viewBtn')}
            </button>
          </div>
        </div>
      </Card>
    </Link>
  );
}
