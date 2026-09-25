import React from 'react';
import { useTranslations } from 'next-intl';
import { ProjectState } from '@/types/project';
import { Badge } from '@/components/ui/Badge';

interface AssetHeaderProps {
  project: ProjectState;
}

/** The car's name, status and VIN, all from its token metadata and project account. */
export function AssetHeader({ project }: AssetHeaderProps): JSX.Element {
  const tCat = useTranslations('Catalog');
  const tAsset = useTranslations('Asset');

  const statusLabel: Record<ProjectState['status'], string> = {
    active: tCat('statusActive'),
    paused: tCat('statusPaused'),
    closed: tCat('statusClosed'),
  };

  return (
    <header>
      <Badge status={project.status}>{statusLabel[project.status]}</Badge>
      <h1 className="mt-4 font-heading text-h2 font-medium text-foreground md:text-h1">
        {project.carMake} {project.carModel}{' '}
        <span className="tabular-nums text-muted-foreground">{project.carYear}</span>
      </h1>
      <p className="mt-3 flex flex-wrap gap-x-2 text-small text-muted-foreground">
        {tAsset('vin')}
        <span className="break-all font-mono text-foreground">{project.vin}</span>
      </p>
    </header>
  );
}
