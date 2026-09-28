import React from 'react';
import type { Project } from '@/types/project';
import { ProjectStatusBadge } from '@/components/catalog/ProjectStatusBadge';
import { useCarLabels } from '@/components/catalog/useCarLabels';
import { carTitle } from '@/lib/solana/tokens';

interface AssetHeaderProps {
  project: Project;
}

/** The car's name, status and where it works, all from its share mint's metadata. */
export function AssetHeader({ project }: AssetHeaderProps): JSX.Element {
  const { car } = project;
  const labels = useCarLabels();
  // The park is a name, and stays as the share mint spells it.
  const details = [
    car.city && labels.city(car.city),
    car.carClass && labels.carClass(car.carClass),
    car.park,
  ].filter(Boolean);

  return (
    <header>
      <ProjectStatusBadge status={project.status} />
      <h1 className="mt-4 font-heading text-h2 font-medium text-foreground md:text-h1">
        {carTitle(car)}{' '}
        {car.year !== null && (
          <span className="tabular-nums text-muted-foreground">{car.year}</span>
        )}
      </h1>
      {/* Each "·" sits in the gap before its detail. The line is pulled left by that gap under
          a clipping box, so the dot of a detail that wraps to a new line is cut off: no line
          starts or ends with a separator. */}
      <div className="mt-3 overflow-hidden">
        <p className="-ml-5 flex flex-wrap text-small text-muted-foreground">
          <span className="ml-5 font-mono text-foreground">{car.symbol}</span>
          {details.map((detail) => (
            <span key={detail} className="relative ml-5">
              <span aria-hidden="true" className="absolute -left-3">
                ·
              </span>
              {detail}
            </span>
          ))}
        </p>
      </div>
    </header>
  );
}
