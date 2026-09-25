import React from 'react';
import type { Project } from '@/types/project';
import { ProjectStatusBadge } from '@/components/catalog/ProjectStatusBadge';
import { carTitle } from '@/lib/solana/tokens';

interface AssetHeaderProps {
  project: Project;
}

/** The car's name, status and where it works, all from its share mint's metadata. */
export function AssetHeader({ project }: AssetHeaderProps): JSX.Element {
  const { car } = project;
  const details = [car.city, car.carClass, car.park].filter(Boolean);

  return (
    <header>
      <ProjectStatusBadge status={project.status} />
      <h1 className="mt-4 font-heading text-h2 font-medium text-foreground md:text-h1">
        {carTitle(car)}{' '}
        {car.year !== null && (
          <span className="tabular-nums text-muted-foreground">{car.year}</span>
        )}
      </h1>
      <p className="mt-3 flex flex-wrap gap-x-2 text-small text-muted-foreground">
        <span className="font-mono text-foreground">{car.symbol}</span>
        {details.map((detail) => (
          <React.Fragment key={detail}>
            <span aria-hidden="true">·</span>
            <span>{detail}</span>
          </React.Fragment>
        ))}
      </p>
    </header>
  );
}
