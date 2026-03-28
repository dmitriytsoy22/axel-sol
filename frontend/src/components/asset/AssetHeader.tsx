import React from 'react';
import Image from 'next/image';
import { ProjectState } from '@/types/project';
import { Badge } from '@/components/ui/Badge';
import { useTranslations } from 'next-intl';

interface AssetHeaderProps {
  project: ProjectState;
}

export function AssetHeader({ project }: AssetHeaderProps): React.JSX.Element {
  const tCat = useTranslations('Catalog');
  const tAsset = useTranslations('Asset');

  // Helper to map status to translation key
  const getStatusTranslation = (status: string) => {
    switch (status) {
      case 'fundraising': return tCat('statusFundraising');
      case 'active': return tCat('statusActive');
      case 'paused': return tCat('statusPaused');
      case 'closed': return tCat('statusClosed');
      case 'finalized': return tCat('statusFinalized');
      case 'initializing': return tCat('statusInitializing');
      default: return status;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100 border border-gray-200">
        <Image 
          src={project.imageUrl}
          alt={`${project.carMake} ${project.carModel}`}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 50vw"
          priority
        />
      </div>
      
      <div className="flex flex-col gap-2 relative">
        <div className="flex justify-between items-start gap-4">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900 leading-tight">
            {project.carMake} {project.carModel} <span className="text-gray-500 font-normal">{project.carYear}</span>
          </h1>
          <Badge status={project.status}>
            {getStatusTranslation(project.status)}
          </Badge>
        </div>
        
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-2">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{tAsset('vin')}</span>
            <span className="text-sm text-gray-900 font-mono">{project.vin}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{tAsset('licensePlate')}</span>
            <span className="text-sm text-gray-900 font-mono">{project.licensePlate}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
