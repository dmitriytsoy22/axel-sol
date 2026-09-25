import React from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { ProjectState } from '@/types/project';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Link } from '@/i18n/routing';
import { formatNumber, formatPercent, formatSol } from '@/lib/format';
import { vehiclePhoto } from './vehiclePhoto';

interface AssetCardProps {
  project: ProjectState;
}

export function AssetCard({ project }: AssetCardProps): JSX.Element {
  const t = useTranslations('Catalog');
  const locale = useLocale();

  const statusLabel: Record<ProjectState['status'], string> = {
    active: t('statusActive'),
    paused: t('statusPaused'),
    closed: t('statusClosed'),
  };

  const soldValue = project.tokensSold * project.pricePerToken;
  const totalValue = project.totalTokenSupply * project.pricePerToken;
  const progress =
    project.totalTokenSupply > 0 ? (project.tokensSold / project.totalTokenSupply) * 100 : 0;
  const soldAmount = formatNumber(soldValue / 1_000_000_000, locale, 4);
  const totalAmount = formatNumber(totalValue / 1_000_000_000, locale, 4);

  const stockPhoto = vehiclePhoto(project.carMake, project.carModel);
  const isStockPhoto = !project.imageUrl;
  const photoAlt =
    isStockPhoto && !stockPhoto.showsModel ? '' : `${project.carMake} ${project.carModel}`;

  return (
    <Link
      href={`/assets/${project.mint}`}
      className="group flex h-full w-full flex-col overflow-hidden rounded-card border border-border bg-card text-card-foreground no-underline shadow-sm transition-shadow duration-base ease-move hover:shadow-md"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        <Image
          src={project.imageUrl || stockPhoto.src}
          alt={photoAlt}
          fill
          sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-slow ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
        />
        <Badge status={project.status} className="absolute left-3 top-3">
          {statusLabel[project.status]}
        </Badge>
        {isStockPhoto && (
          <span className="absolute bottom-3 left-3 rounded-control bg-ink-950/70 px-2 py-0.5 text-small text-ink-25">
            {t('illustrativePhoto')}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-title font-semibold text-foreground">
          {project.carMake} {project.carModel}
        </h3>
        <p className="mt-1 flex flex-wrap gap-x-2 text-small text-muted-foreground">
          <span className="tabular-nums">{project.carYear}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono">VIN {project.vin}</span>
        </p>

        <dl className="mt-5 grid grid-cols-2 gap-4">
          <div className="flex flex-col-reverse justify-end gap-1">
            <dt className="text-small text-muted-foreground">{t('pricePerToken')}</dt>
            <dd className="whitespace-nowrap text-title font-semibold tabular-nums text-foreground">
              {formatSol(project.pricePerToken, locale)}
            </dd>
          </div>
          <div className="flex flex-col-reverse justify-end gap-1">
            <dt className="text-small text-muted-foreground">{t('payoutPeriods')}</dt>
            <dd className="text-title font-semibold tabular-nums text-foreground">
              {formatNumber(project.periodCount, locale)}
            </dd>
          </div>
        </dl>

        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between gap-4 text-small">
            <span className="text-muted-foreground">
              {t('percentSold', {
                percent: formatPercent(project.tokensSold, project.totalTokenSupply, locale),
              })}
            </span>
            <span className="whitespace-nowrap font-medium tabular-nums text-foreground">
              {soldAmount} / {totalAmount} SOL
            </span>
          </div>
          <ProgressBar progress={progress} label={t('raised')} />
        </div>

        <span className="mt-auto flex items-center gap-1 pt-6 text-small font-medium text-primary">
          {project.status === 'active' ? t('investBtn') : t('viewBtn')}
          <ArrowRight
            aria-hidden="true"
            className="h-4 w-4 transition-transform duration-fast ease-move group-hover:translate-x-0.5"
            strokeWidth={1.75}
          />
        </span>
      </div>
    </Link>
  );
}
