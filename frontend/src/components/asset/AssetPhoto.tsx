import React from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { Project } from '@/types/project';
import { vehiclePhoto } from '@/components/catalog/vehiclePhoto';
import { carTitle } from '@/lib/solana/tokens';

interface AssetPhotoProps {
  project: Project;
}

/* A licensed photo of the car's model, marked as illustrative: the share mint has no photo
   of the car itself. Models without a licensed photo get an Almaty street, labeled as such. */
export function AssetPhoto({ project }: AssetPhotoProps): JSX.Element {
  const t = useTranslations('Catalog');
  const photo = vehiclePhoto(project.car.make, project.car.model);

  return (
    <figure className="relative aspect-[4/3] w-full overflow-hidden rounded-card bg-muted">
      <Image
        src={photo.src}
        alt={photo.showsModel ? carTitle(project.car) : ''}
        fill
        priority
        sizes="(min-width: 1280px) 700px, (min-width: 768px) 58vw, 100vw"
        className="object-cover"
      />
      <figcaption className="absolute bottom-3 left-3 rounded-control bg-ink-950/70 px-2 py-0.5 text-small text-ink-25">
        {t(photo.showsModel ? 'illustrativePhoto' : 'streetPhoto')}
      </figcaption>
    </figure>
  );
}
