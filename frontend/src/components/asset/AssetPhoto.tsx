import React from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ProjectState } from '@/types/project';
import { vehiclePhoto } from '@/components/catalog/vehiclePhoto';

interface AssetPhotoProps {
  project: ProjectState;
}

/* The car's own photo when its metadata has one; otherwise a licensed photo of the model,
   marked as illustrative. */
export function AssetPhoto({ project }: AssetPhotoProps): JSX.Element {
  const t = useTranslations('Catalog');

  const stockPhoto = vehiclePhoto(project.carMake, project.carModel);
  const isStockPhoto = !project.imageUrl;
  const alt =
    isStockPhoto && !stockPhoto.showsModel ? '' : `${project.carMake} ${project.carModel}`;

  return (
    <figure className="relative aspect-[4/3] w-full overflow-hidden rounded-card bg-muted">
      <Image
        src={project.imageUrl || stockPhoto.src}
        alt={alt}
        fill
        priority
        sizes="(min-width: 1280px) 700px, (min-width: 768px) 58vw, 100vw"
        className="object-cover"
      />
      {isStockPhoto && (
        <figcaption className="absolute bottom-3 left-3 rounded-control bg-ink-950/70 px-2 py-0.5 text-small text-ink-25">
          {t('illustrativePhoto')}
        </figcaption>
      )}
    </figure>
  );
}
